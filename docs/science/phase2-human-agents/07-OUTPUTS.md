# Phase 2 · Spec 7 — Output Redesign

**Status: DESIGN ONLY.** Extends the data dictionary in `METRICS.md` without
breaking the existing three-file contract or the analysis suites.

---

## 0. Documentation defect to fix first

**`METRICS.md` has drifted from the implementation and documents column names
that do not exist.** It lists `encampment_id`, `start_node`, `assigned_shelter`,
`arrival_tick`, `distance_traveled_m`, `exposure_ugm3h`, `peak_conc_ugm3`; the
exporter actually writes `starting_encampment`, `shelter_reached`,
`time_arrived_tick`, `total_travel_distance_m`, `cumulative_dose_ugm3h`,
`peak_pm25_ugm3`. It is also missing every provenance column added since
(`sim_id`, `commit`, `random_seed`, `data_version`), the
`street_network_validation` manifest block, and it still quotes an exposure Gini
of ≈0.63 from a superseded run (the baseline is 0.82).

**Correct `METRICS.md` before extending it.** A data dictionary that misnames its
own columns is worse than none — it is the document an external reviewer would
trust.

---

## 1. Compatibility policy (to be written into `METRICS.md`)

1. **`agents.csv` and `shelters.csv`: append-only.** Never remove, rename, or
   reorder a column. Both consumers read by header name, so appended columns are
   inert to existing code.
2. **`simulation.json`: additive sections only** under the current
   `"schema": "reu-wildfire-shelter-abm/simulation/v1"`. Move to `v2` only on a
   removal, rename, or semantic change; add a `schema_minor` counter for
   additive changes.
3. **New reports go in new files**, never by mutating the three contract files.

---

## 2. New `agents.csv` columns (appended after `final_state`)

`scenario`, `age`, `sex`, `mobility_limitation`, `asthma`, `copd`,
`walking_speed_mps`, `susceptibility_class`, `equivalent_dose_ugm3h`,
`aware_of_shelters`, `decision_tick`, `wait_minutes`, `activity_at_end`,
`reroute_count`, `shelter_switch_count`, `blocked_edge_encounters`,
`initial_target_shelter`, `planned_path_length_m`.

**`age`, `asthma`, `copd` already exist in the header and are written empty** —
they fill in place; nothing moves. That was good foresight and should be
preserved.

This satisfies the brief's required journey record: Agent ID, starting location,
shelter reached, travel time, distance, average PM2.5, peak PM2.5, cumulative
dose, VWE/equivalent dose, age, health variables, success/failure, seed,
simulation ID, commit hash, dataset versions — the last four already exist as
per-row provenance columns.

### 2.1 Two semantic hazards to legislate now

- **`network_dist_to_shelter_m`** is set once at first selection. Under
  rerouting its meaning would drift silently, and `test_routing.py` T2 asserts
  `walked ≈ snap + network_dist`. **Freeze the column's meaning** as
  "shortest-path distance from the start node to the final target, in the world
  as known at first selection"; add `planned_path_length_m` and `reroute_count`;
  guard T2 to `reroute_count == 0`.
- **`exposure_while_traveling_ugm3h`** would silently absorb waiting time once a
  `wait` action exists. Re-derive the waiting/travelling split from
  `wait_minutes` rather than letting the existing column change meaning.

---

## 3. New report files

| File | Shape | Purpose |
|---|---|---|
| `summary.md` | human executive summary | arrival rate, exposure headlines, highest-risk group, scenario delta from baseline — **with the `METRICS.md` interpretation guardrails reproduced verbatim**, so no number is quoted without its caveat |
| `breakdowns.csv` | **long format**: `dimension, group, n, metric, value` | one schema serves age band, sex, mobility, comorbidity, encampment, shelter, and any future grouping |
| `hazards.csv` | `event_id, feature_index, street_name, start_tick, end_tick, cause, agents_blocked, total_detour_m` | realised hazard timeline; mandatory for any hazard-enabled run |
| `decisions.csv` (optional, off by default) | `agent_id, tick, action, chosen_shelter, utility_terms…` | behavioural audit trail; gated because 2,000 agents × many events is large |

**Long format for `breakdowns.csv` is deliberate** over one wide file per
dimension: it survives added dimensions without a schema change, pivots in one
call, and validates generically (per dimension, `sum(n) == n_agents`).

---

## 4. The required human-readable report

`summary.md` sections, in order:

1. **Executive summary** — what was run (scenario, seed, n), what happened
   (arrival rate, median/max travel, exposure median and Gini), and the single
   most important finding, in prose.
2. **Demographic breakdown** — realised composition vs the specified source
   distribution, so a reader can see the sampler behaved.
3. **Vulnerability breakdown** — counts per susceptibility class.
4. **Shelter utilisation** — occupancy, unused capacity, refusals, arrival
   timing per shelter.
5. **Exposure statistics** — distribution, **stratified by susceptibility
   class** (the primary scientific output per `02-VULNERABILITY.md` §5).
6. **Highest-risk groups** — §4.1.
7. **Why those groups were affected** — §4.2.
8. **Limitations** — inherited verbatim from the specs, never re-worded per run.

### 4.1 Highest-risk attribution must be defensive

Report the group with maximum mean exposure **subject to `n ≥ minGroupSize`**
(default 5, configurable), and always print `n`, mean, median, and share of total
exposure alongside. Without the floor, a group of one produces the headline.

### 4.2 "Why" must be mechanical, not narrative

The brief asks the report to explain *why* groups were affected. The only
defensible explanation is a **decomposition of the model's own mechanism**, not
an interpretive story. For each highlighted group report:

- mean **time outdoors** (the proximate driver of dose),
- mean **travel time** and **distance**,
- mean **network distance to assigned shelter** (accessibility),
- **awareness rate** and mean **decision delay** (did they leave late?),
- **arrival rate** (did they arrive at all?).

The explanatory sentence then writes itself from the numbers — "agents with
mobility limitation accrued 38% more dose because their mean time outdoors was
1.9 h longer at the same network distance" — and every clause traces to an
exported column. **The report must never attribute causation to a mechanism the
model does not simulate**: it does not simulate health outcomes, so it must never
say a group was "harmed more".

---

## 5. `simulation.json` additions

`scenario` (`06-SCENARIOS.md` §3); `rng` (stream names, derived seeds,
derivation function); `hazards` (event count, closed-edge-hours, agents
affected); `population.attributes` (realised vs specified distribution — the
conformance check made permanent); `population.equivalent_dose` with the **same
percentile set already used for exposure** (the current VWE block gives only
mean/median/total/gini, asymmetric for what is nominally the headline metric);
and `executive_summary` carrying the highest-risk attribution.

---

## 6. Required changes to the analysis suites

Two of the 37 cross-checks in `analyze_run.py` are **baseline-only invariants
that will fail on the first vulnerability-weighted run**. Generalise, do not
delete:

- `vwe == exposure` → assert
  `|vwe − exposure × age_rr × comorbidity_rr| < 1e-6`. Since both RRs are
  per-agent constants, this identity holds exactly under per-tick accumulation
  and reduces to the current check when RRs are 1.0. **This is the single most
  important test change in the plan** — strictly stronger than what it replaces.
- `all RR == 1.0` → assert **iff** the scenario disables vulnerability
  weighting.

Also required:

- **`test_routing.py` T3 breaks by design** under heterogeneous speed: the global
  1.20–1.40 m/s band becomes a per-agent check against the new
  `walking_speed_mps` column, with the literature-bounds question moving to the
  distribution-conformance layer. `WALK_TOL_M = 80.0` (one step at 1.30 m/s)
  likewise becomes per-agent.
- `test_routing.py` hard-codes the encampment path; read it from the manifest's
  dataset list so an overlay scenario cannot silently validate against the wrong
  file.
- The shelter-utilisation figure computes capacity as float and breaks on an
  operating shelter with **empty** capacity — the exact shape of the standby
  site. Guard this before authoring the extra-shelters scenario.
- New checks: breakdown group counts sum to `n_agents`; each agent's effective
  speed matches its assigned speed; `hazards.csv` totals match the manifest;
  `reroute_count > 0` implies `walked > network_dist`.
- **"37" is a function of shelter count** (39 with five shelters). State the
  contract as **"zero failures"**, not "37 checks", in `CURRENT_MODEL_RUN.md` and
  `BASELINE_RESULTS.md`.

Bump `SCRIPT_VERSION` on every such change; it is already recorded in
`summary.json`.
