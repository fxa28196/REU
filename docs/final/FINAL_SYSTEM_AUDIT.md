# Final System Audit

Complete software audit of the wildfire-smoke shelter ABM at submission state.

**Audit date:** 2026-07-26 · **Model commit:** `02c3181` · **Working tree:** clean

---

## 1. Architecture

### 1.1 Execution

| Mode | Entry point | Launcher |
|---|---|---|
| GUI | `repast.simphony.runtime.RepastMain <abs>/Geography/Geography.rs` | `scripts/run-model.ps1` (compiles, then launches) |
| Headless | `repast.simphony.runtime.RepastBatchMain -params batch\*.xml <Geography.rs>` | `scripts/run-headless.ps1 -ParamsFile ...` |

`Geography.rs` names exactly one `ContextBuilder`: `geography.agents.ContextCreator`.
Working directory must be `Geography/` — all data paths are relative.

**Parameter schema differs by mode.** The GUI reads `Geography.rs/parameters.xml`;
headless reads the batch file. Switches absent from a batch file fall back to
behaviour-preserving defaults via `intParam(...)`, so every archived params file
remains runnable.

### 1.2 Initialization order (`ContextCreator.build`)

1. Validate `variables.csv` / `assumptions.csv` — **fail-fast**; a registry defect
   aborts the run before any science happens.
2. Resolve scenario → shelter CSV (`scenarioCode` 0 = arm A, 1 = arm B,
   2 = historical reference).
3. Build WGS84 geography; load 112,070 street features, reprojecting from
   Web Mercator; construct and **validate** the routing graph.
4. Load PM2.5 → `SmokeField` (county-uniform hourly series).
5. Load shelters; snap each to its nearest graph node; compute one Dijkstra tree
   per shelter; set opening/closing ticks from real dates.
6. Create `numAgents` residents at sampled encampment points; attach sampled
   attributes from a **separate RNG stream**.
7. Set run length; schedule `OutcomeLogger.export()` at end of run.

### 1.3 Scheduler

Only two scheduled things exist: `GisAgent.step()` (`start = 1, interval = 1`)
and the end-of-run export. Repast shuffles same-priority agent actions each tick
from its default RNG stream — deterministic given the seed, but **randomised**,
and under scarce capacity that shuffle decides who takes the last bed
(assumption **A-16**, blocking, unresolved; see §4).

### 1.4 Subsystems

| Subsystem | Implementation | Status |
|---|---|---|
| Environment | Single WGS84 `Geography` projection; `Network` projection declared but unused | Verified |
| Routing | Undirected geodesic-weighted graph; node-site validation; one Dijkstra tree per shelter | Verified — do not modify |
| Smoke | County-uniform hourly array; step function within the hour | Verified externally |
| Health | Exposure / inhaled dose / risk as three separate quantities | New this pass |
| Optimization | Offline p-median (`scripts/optimize_shelters.py`) → shelter CSV | See §5 |
| Logging | End-of-run writer: `agents.csv`, `shelters.csv`, `simulation.json` | Verified |

---

## 2. Agent lifecycle audit

**Every agent is created, tracked, exported, and reaches a terminal state.**

- **Creation** — one loop, `numAgents` residents; encampment sampled with
  replacement; attributes from a private RNG stream so placement stays
  bit-identical whether heterogeneity is on or off.
- **Removal** — **none exists.** No `context.remove`, no `Iterator.remove`, no
  removal call anywhere in `Geography/src` (verified by exhaustive grep). This is
  the structural guarantee against survivorship bias.
- **State machine** — `PRE_EVAC → EN_ROUTE → {SHELTERED | UNREACHABLE |
  REFUSED_ALL_FULL}`, with `REFUSED_ALL_FULL → EN_ROUTE` re-entry when a shelter
  opens later.
- **Export** — `OutcomeLogger` re-reads the full context at end of run; row count
  equals agent count in every run; the outcome census reconciles exactly.

### Known gaps in traceability

- **`door_refusals` under-reports.** `retargetCount` resets on re-entry from the
  waiting state, so agent-level refusals do not reconcile with the shelter-level
  count. Shelter-level `refused_count` is correct and is what the reports quote.
- **No spatial trace.** `agents.csv` carries the encampment ID but no start
  coordinate, no start node, and no final position. Resolving a start point
  requires joining to the encampment CSV.
- **Which shelters a refused resident attempted is not recorded.**

None affects a reported result; all are recorded here rather than fixed, because
fixing them would require schema changes after the final runs.

---

## 3. Reproducibility audit — closed this pass

### What was broken

Nine previously archived runs stamped commit `6616232`, which contained **neither**
the COPD walking-speed effect **nor** the third scenario branch — they were
produced from an uncommitted tree. The results report cited a **third** commit.
Registry hashes were stale (26/21 recorded vs 27/24 on disk). `Streets.dbf` —
which holds the `PDX_F_NODE`/`PDX_T_NODE` attributes that build the entire routing
graph — was **not checksummed**.

### What was done

1. **All code committed first** (`02c3181`), then every run re-executed from a
   clean tree. Manifests now stamp `02c3181`.
2. **New `source_integrity` manifest block** checksums **12 files**:
   `Streets.shp/.dbf/.shx/.prj/.cpg`, the PM2.5 CSV, all three shelter CSVs, the
   encampment CSV, and **both governance registries**.
3. **New `git_working_tree_dirty` flag** — reads `false` in every final run. A
   run from uncommitted code now declares itself instead of failing silently.
4. **`data_version_tag` deliberately unchanged** (still hashing the four model
   inputs) so comparability with every earlier archived run is preserved. The new
   block is additive.

### Verified state

| Check | Result |
|---|---|
| Commit stamped | `02c3181` — the code that ran |
| Working tree dirty | `false` |
| Files checksummed | 12, including `Streets.dbf` and both registries |
| Governance counts | 27 variables / 24 assumptions — matches disk |
| Input hashes | match files on disk in every run |

**Every final run now reproduces from code + parameters + datasets + registry.**

---

## 4. Known defects carried into submission

Recorded rather than fixed, because each fix carries more risk than the defect.

| Defect | Severity | Impact on reported results |
|---|---|---|
| **A-16 unmet** — order-independent admission specified as a prerequisite for demand > beds, never implemented | Blocking assumption | **None on the placement experiment** (capacity is not binding there). Constrains the scarce-capacity reference figures only |
| `door_refusals` resets on waiting-state re-entry | Limitation | None — reports quote shelter-level counts |
| `UNREACHABLE` decided only against shelters open at that instant | Limitation | ~15 residents per run; identical in both arms, so it cancels in the A/B contrast |
| `shelterArrivalDistanceM` stamped in manifests but read nowhere | Limitation (A-10) | None — a reader may wrongly infer a 200 m arrival radius |
| `nearestNode` ranks candidates in degree space (1.42:1 anisotropy at 45.5°N) | Limitation | Bounded by local node spacing; affects only near-ties |
| Freeway segments walkable (A-05) | Limitation | Affects absolute walk distances in both arms equally |
| Output directory keyed on seed only | Limitation | **Caused one real contamination during this pass** — stale directories from a retired scenario were silently misclassified. Detected and removed; archive between runs |
| `test_routing.py` fails on current output | Limitation | The test compares V11 (first-selected shelter) against the reached shelter; stale since decision D-6 |
| ~49 MB duplicate `Streets/` tree tracked | Cosmetic | None — byte-identical to the used copy |

---

## 5. Optimization audit

**Objective.** Capacity-aware p-median: minimise total population outdoor time,
with a greedy assignment mirroring the simulation's own mechanism (nearest open
facility with space; refused residents re-route from the refusing node).

**Candidates.** 790 street-graph nodes, selected deterministically on a ~500 m
spatial grid within the encampment bounding box, restricted to the demand
principal component.

**Constraints.** Exactly 2 sites; total capacity fixed; real opening dates copied
so arms differ only in location.

**No future-information leakage.** The optimizer sees only encampment geography,
the street graph, and capacity. It does **not** see per-resident outcomes,
realised walking speeds, health attributes, or the PM2.5 time series. It cannot
optimize against results it has not seen.

**Limitations, all documented in `optimization_report.json`:**
- Unconstrained siting — ignores building availability, ownership, zoning,
  staffing, ADA access. Sites are street nodes, **not verified venues**.
- Computed against the **2025–26** encampment point cloud, so it is an optimum
  for that geography (inherits A-03).
- Computed at a constant 1.3 m/s, i.e. blind to the heterogeneity that produces
  the equity result. The *ranking* of candidate pairs is expected to be robust to
  this; the absolute objective values are not comparable to the ABM's.
- Its internal mirror check reproduces the simulation on the hard criterion but
  is 2 residents off on the unreachable count, and **reports that as FAIL**.

---

## 6. Output audit

`agents.csv` carries 46 columns per resident: identity and full run provenance
(sim_id, commit, seed, data version); origin encampment; shelter reached and
success flag; departure and arrival times in ticks and local time; travel
duration and distance; planned route, snap gap and door refusals; walking speed;
age, age band, sex; mobility status and category; asthma, COPD, any-respiratory
and vulnerability flags; average and peak PM2.5; cumulative exposure;
exposure while travelling; exposure burden index; hours above Unhealthy; and —
new this pass — air volume breathed, mean ventilation, inhaled dose, health-risk
multiplier and health-risk score.

`shelters.csv` and `simulation.json` reconcile with it cell-for-cell; three
independent audits found **zero** numerical discrepancies in the analysis chain.

**Verified this pass:** `health_risk_score == inhaled_dose_ug` in 100% of rows
(weight is genuinely 1.0); realised mean ventilation 0.637 m³/h sits correctly
between the resting and walking rates.

---

## 7. Verdict

The simulation is sound where it has been validated and honest where it has not.
The reproducibility chain, previously broken, is closed. The experiment now tests
the question it claims to test. Every remaining defect is recorded above with its
impact on the reported results, and none of them changes a conclusion.
