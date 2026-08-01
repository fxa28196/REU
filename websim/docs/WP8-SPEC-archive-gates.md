# WP8 SPEC — Phase-E / Scenario-E archive census + gate suite

**Status:** reference document for WP8 (`IMPLEMENTATION_PLAN.md` §8, "WP8 — Engine completeness:
Phase E + Scenario E"). Read-only census of the Java golden archive plus the exact, transcribed
definitions of the gates WP8 must satisfy.

**Sources (all READ-ONLY, none modified):**

| Source | What it is |
|---|---|
| `docs/runs/phase-e/` | 12 run directories (3 E0-null + 9 ER baseline-real) |
| `docs/runs/scenario-e/` | 21 run directories (3 E0-null + 9 SE severe-v1 + 9 SEnc controls) |
| `docs/runs/scenario-e-v2/` | 27 run directories (3 E0-null + 15 SE2 worst-case + 9 SE2nc controls) |
| `docs/runs/scenario-e-closures/` | 5 closure-schedule provenance reports (JSON) |
| `docs/runs/present-day-three-arm/` | the pre-E reference runs the E0-nulls must reproduce |
| `scripts/verify_E_runs.py` (848 ln) | gates (a)–(l) — the authority for §3 below |
| `scripts/verify_2026_runs.py` (248 ln) | cross-arm gates (capacity sums, POP_COLS hash, UNREACHABLE id-set hash, U-19) |
| `scripts/analyze_run.py` (757 ln) | per-run recomputed-statistics gates |
| `scripts/score_scenarioE.py` (95 ln) | the metrics extractor behind every scored prediction |
| `scripts/make_batch_params_E.py` (253 ln) | the preset generator (E0/ER/SE/SEnc/SE2/SE2nc) |
| `scripts/build_closures_E.py`, `build_smoke_severe.py` | asset builders + their S1/S2/S3 and 19-check self-tests |
| `Geography/src/geography/output/OutcomeLogger.java` (817 ln) | the CSV/manifest writer — authority for §1.5 |
| `docs/critique-response/13-PHASE-E-PREDICTIONS.md` (415 ln) | registered predictions + scored outcomes (§4) |

**Verification performed while writing this document** (commands and outputs in §7):
`verify_E_runs.py` was re-run over all 8 archived E0-null → pre-E reference pairs (all PASS,
byte-identical, SHA-256s recorded in §2.4), over one ER run, one SE run, one SEnc run and one SE2
run (check counts recorded in §3.7), and `score_scenarioE.py` was re-run over all 51 ER/SE/SEnc/
SE2/SE2nc runs to regenerate every number in §4 from the archive bytes.

---

## 1. Complete inventory

### 1.1 Census

| Archive | Run dirs | On-disk | Commit(s) | Files per run |
|---|---|---|---|---|
| `docs/runs/phase-e/` | 12 | 33 MB | `7224cef` | `agents.csv`, `shelters.csv`, `simulation.json` |
| `docs/runs/scenario-e/` | 21 | 59 MB | `bb8707d` (E0 nulls), `495d845` (SE/SEnc) | same 3 |
| `docs/runs/scenario-e-v2/` | 27 | 76 MB | `257017d` | same 3 |
| `docs/runs/scenario-e-closures/` | 5 JSON files (no run dirs) | 224 KB | — | — |

Total **60 run directories**. Every one contains exactly `agents.csv`, `shelters.csv`,
`simulation.json` and nothing else, with **one exception**: `phase-e/ER-A-n6842-seed42/` also
carries an `analysis/` subtree (`analysis-report.md`, `summary.json`,
`figures/fig1_travel_time_hist.png` … `fig5_shelter_utilization.png`) — an `analyze_run.py`
artefact, not part of the run output contract. There are **no top-level files** in any of the
three run archives.

Every run: `numAgents = 6842`, `agents.csv` = 6,842 data rows, `git_working_tree_dirty = false`,
`out_of_range_lookups = 0`.

### 1.2 Full run table

`n` = 6842 and `minutesPerTick` = 1.0 in every row, so both are omitted. `hours` =
`simulationHours`. "arm" is the geometry the `scenarioCode` selects. `sites`/`cap` are the
`shelters.csv` row count and capacity sum.

#### `docs/runs/phase-e/` — 12 runs, commit `7224cef`, agents.csv **55 columns** (logger v1)

| run dir | family | code | arm | seed | hours | sites | cap | shelter CSV | data_version |
|---|---|---|---|---|---|---|---|---|---|
| `E0null-A-n6842-seed42` | E0 null | 0 | A | 42 | 312 | 36 | 2234 | `shelters_2026_current_placement.csv` | `bdce237a6a6a` |
| `E0null-B-n6842-seed42` | E0 null | 1 | B | 42 | 312 | 36 | 6842 | `shelters_2026_expanded_capacity.csv` | `5f8ece625e63` |
| `E0null-C-n6842-seed42` | E0 null | 2 | C | 42 | 312 | 46 | 6842 | `shelters_2026_expanded_plus_new_sites.csv` | `5859e3007f0d` |
| `ER-A-n6842-seed{42,43,44}` | ER baseline-real | 0 | A | 42/43/44 | 312 | 36 | 2234 | `…current_placement_elayer.csv` | `7efd11439abf` |
| `ER-C-n6842-seed{42,43,44}` | ER baseline-real | 2 | C | 42/43/44 | 312 | 46 | 6842 | `…expanded_plus_new_sites_elayer.csv` | `2ccae12bdff9` |
| `ER-D-n6842-seed{42,43,44}` | ER baseline-real | 7 | D (= B file + reserve 0.10) | 42/43/44 | 312 | 36 | 6842 | `…expanded_capacity_elayer.csv` | `6951f0949ed9` |

Smoke: observed `aqs_hourly_pm25_portland_2020-09.csv`, 576 slices, peak 562.7. 33 parameters in
every manifest (**no Scenario-E block** — this build predates V46–V51).

#### `docs/runs/scenario-e/` — 21 runs, agents.csv **59 columns** (logger v2)

| run dir | family | code | arm | seed | hours | series | peak | closures | sites/cap | data_version |
|---|---|---|---|---|---|---|---|---|---|---|
| `E0null-{A,B,C}-seed42` | E0 null | 0/1/2 | A/B/C | 42 | 312 | 0 observed | 562.7 | code 0 | 36/2234, 36/6842, 46/6842 | `bdce237a6a6a`, `5f8ece625e63`, `5859e3007f0d` |
| `SE-E18-seed{42,43,44}` | SE severe v1 | 18 | A | 42/43/44 | 455 | 1 severe v1 | 984.8 | code 1, `closures_E_r1.csv` | 36/2234 | `58db846ad1e9` |
| `SE-E19-seed{42,43,44}` | SE severe v1 | 19 | C | 42/43/44 | 455 | 1 | 984.8 | code 1, `closures_E_r1.csv` | 46/6842 | `a5a1f5b59991` |
| `SE-E20-seed{42,43,44}` | SE severe v1 | 20 | B + reserve 0.10 | 42/43/44 | 455 | 1 | 984.8 | code 1, `closures_E_r1.csv` | 36/6842 | `9978eac662e3` |
| `SEnc-E18-seed{42,43,44}` | SE control | 18 | A | 42/43/44 | 455 | 1 | 984.8 | **code 0** | 36/2234 | `52254ef94fe7` |
| `SEnc-E19-seed{42,43,44}` | SE control | 19 | C | 42/43/44 | 455 | 1 | 984.8 | **code 0** | 46/6842 | `91693a105711` |
| `SEnc-E20-seed{42,43,44}` | SE control | 20 | B + reserve 0.10 | 42/43/44 | 455 | 1 | 984.8 | **code 0** | 36/6842 | `bd1c17bacb52` |

E0 nulls at commit `bb8707d`; the 18 SE/SEnc runs at commit `495d845`. 40 parameters per
manifest (33 + the 7 SE params; **no `closureDraw`** — it entered the schema with the worst-case
family).

#### `docs/runs/scenario-e-v2/` — 27 runs, commit `257017d`, agents.csv **59 columns** (logger v2)

| run dir | family | code | arm | seed | hours | series | peak | closures | draw | wave hours | data_version |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `E0null-{A,B,C}-seed42` | E0 null | 0/1/2 | A/B/C | 42 | 312 | 0 observed | 562.7 | code 0 | 1 (inert) | — | `bdce237a6a6a`, `5f8ece625e63`, `5859e3007f0d` |
| `SE2-E18-d1-seed{42,43,44}` | SE2 worst | 18 | A | 42/43/44 | 455 | 2 worst v2 | 2496.1 | code 3, `closures_E_r1_worst.csv` | 1 | 3, 44, 72, 142, 265, 303 | `83e5b5f8b704` |
| `SE2-E18-d2-seed{42,43,44}` | SE2 worst | 18 | A | 42/43/44 | 455 | 2 | 2496.1 | code 3, `closures_E_r2_worst.csv` | 2 | 5, 92, 130, 163, 214, 263 | `1452dc1cb369` |
| `SE2-E18-d3-seed{42,43,44}` | SE2 worst | 18 | A | 42/43/44 | 455 | 2 | 2496.1 | code 3, `closures_E_r3_worst.csv` | 3 | 2, 35, 37, 40, 75, 76 | `de3a82e14eb6` |
| `SE2-E19-d1-seed{42,43,44}` | SE2 worst | 19 | C | 42/43/44 | 455 | 2 | 2496.1 | code 3, `closures_E_r1_worst.csv` | 1 | 3, 44, 72, 142, 265, 303 | `629917e4202d` |
| `SE2-E20-d1-seed{42,43,44}` | SE2 worst | 20 | B + reserve 0.10 | 42/43/44 | 455 | 2 | 2496.1 | code 3, `closures_E_r1_worst.csv` | 1 | 3, 44, 72, 142, 265, 303 | `d2d771a11f87` |
| `SE2nc-E18-seed{42,43,44}` | SE2 control | 18 | A | 42/43/44 | 455 | 2 | 2496.1 | **code 0** | 1 (inert) | — | `f363d700871b` |
| `SE2nc-E19-seed{42,43,44}` | SE2 control | 19 | C | 42/43/44 | 455 | 2 | 2496.1 | **code 0** | 1 (inert) | — | `2bf9c685a8da` |
| `SE2nc-E20-seed{42,43,44}` | SE2 control | 20 | B + reserve 0.10 | 42/43/44 | 455 | 2 | 2496.1 | **code 0** | 1 (inert) | — | `cfa66b986b56` |

41 parameters per manifest (33 + 7 SE + `closureDraw`).

#### `docs/runs/scenario-e-closures/` — 5 provenance reports

| file | severity | site_seed / RNG | waves (hour: bridges/arterials/locals) | rows | gates |
|---|---|---|---|---|---|
| `closures_E_r1_report.json` | `base` (code 1) | 1 / `python random.Random(1)` | h79: 3/15/0 | 18 | 10/10 PASS |
| `closures_E_r1_extreme_report.json` | `extreme` (code 2) | 1 | h79: 2/15/0; h150: 2/15/0 | 34 | 13/13 PASS |
| `closures_E_r1_worst_report.json` | `worst` (code 3, draw 1) | 1 | h3: 2/8/5; h44: 1/6/5; h72: 1/6/5; h142: 0/6/5; h265: 0/6/5; h303: 0/6/5 | 72 | 26/26 PASS |
| `closures_E_r2_worst_report.json` | `worst` (code 3, draw 2) | 2 | h5, h92, h130, h163, h214, h263 (same class mix) | 72 | 26/26 PASS |
| `closures_E_r3_worst_report.json` | `worst` (code 3, draw 3) | 3 | h2, h35, h37, h40, h75, h76 (same class mix) | 72 | 26/26 PASS |

The extreme family (code 2) has a committed schedule + report but **no archived runs**. Report
schema `reu-wildfire-shelter-abm/scenario-e-closures/v1`; each carries `graph` (88,100 nodes,
109,434 walkable undirected edges, 2,636 freeway features / 614.1 km excluded, 171 components,
25 corrected node sites), `shelter_components`, `demand_bounding_box`
`(-122.80581, -122.456835, 45.417541, 45.665031)`, the three pools, `closures`,
`connectivity_check` (per cumulative wave) and `checks`.

### 1.3 Reference runs for the R3 proof (`docs/runs/present-day-three-arm/`)

`A-seed42`, `B-seed42`, `C-seed42` (and seeds 43–50 for A/B/C) — pre-E runs, `agents.csv`
**49 columns**, `shelters.csv` **11 columns**. These are the `--reference` side of every archived
R3 identity proof.

### 1.4 Closure schedule CSVs (`Geography/data/closures/`)

Header (exact, 5 columns): `node_a,node_b,activation_hour,label,kind`
Row counts: `closures_E_r1.csv` 18, `closures_E_r1_extreme.csv` 34, `closures_E_r{1,2,3}_worst.csv`
72 each. Java parses only the first three fields (`Long`, `Long`, `int`, each trimmed); malformed
row or negative hour → throw; `hour >= end` → WARN, inert. Example rows:

```
node_a,node_b,activation_hour,label,kind
46509,47127,79,BROADWAY BRG,bridge            # closures_E_r1.csv
53193,53407,3,MORRISON BRG,bridge             # closures_E_r1_worst.csv
```

### 1.5 Output CSV column schema — outcome logger v1 and v2

The writer is `OutcomeLogger.writeAgents()`. Dtypes below are **the wire format**, i.e. exactly
what the Java `printf` emits (`Locale.US`, `%n` line separator = CRLF on Windows), because the
gates compare **raw text**, not parsed numbers. "empty" = the literal empty field, never a
fabricated default.

#### `agents.csv` — v2 (59 columns), Scenario-E era

The single `printf` format string is:

```
%s,%s,%s,%d,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%.2f,%s,%s,%.2f,%.4f,%.4f,%.4f,%.4f,%s,%s,%s,
%.3f,%.3f,%s,%.2f,%.2f,%d,%s,%s,%.4f,%.4f,%.4f,%.3f,%.4f,%s,%d,%d,%d,%d%n
```

44 specifiers; two of them (`het`, `dec`) are pre-composed multi-column strings, which is how 44
specifiers produce 59 columns.

| # | column | wire format | source | empty when |
|---|---|---|---|---|
| 1 | `agent_id` | `%s` (`"Site <k>"`) | `a.getName()` | never |
| 2 | `sim_id` | `%s` | `"sim-yyyyMMdd-HHmmss-seed<seed>"` | never |
| 3 | `commit` | `%s` (40 hex) | `.git/HEAD` chase | `"unknown"` on failure |
| 4 | `random_seed` | `%d` | run seed | never |
| 5 | `data_version` | `%s` (12 hex) | `sha256(concat of per-input sha256)[0:12]` | never |
| 6 | `starting_encampment` | `%s` | `inc_id` | never |
| 7 | `start_lon` | `%s` of `%.6f` | `getStartLon()` | NaN → empty |
| 8 | `start_lat` | `%s` of `%.6f` | `getStartLat()` | NaN → empty |
| 9 | `shelter_reached` | `%s` | target shelter id **iff SHELTERED** | not sheltered |
| 10 | `reached_shelter` | `%s` | `"yes"` / `"no"` | never |
| 11 | `time_started_tick` | `%s` of `(long)` | `getEvacuationTick()` | NaN → empty |
| 12 | `time_started_local` | `%s` | `smokeField.timeForTick(evac, mpt).toString()` (ISO `LocalDateTime`) | NaN → empty |
| 13 | `time_arrived_tick` | `%s` of `(long)` | `getArrivalTick()` | NaN → empty |
| 14 | `time_arrived_local` | `%s` | ISO `LocalDateTime` | NaN → empty |
| 15 | `travel_time_min` | `%s` of `%.1f` | `(arr − evac) × mpt` | either NaN → empty |
| 16 | `total_travel_distance_m` | `%.2f` | `getDistanceTraveledM()` | never |
| 17 | `network_dist_to_shelter_m` | `%s` of `%.2f` | `getNetworkDistToShelterM()` | NaN → empty |
| 18 | `avg_pm25_ugm3` | `%s` of `%.2f` | `exposure / outdoorHours` | `outdoorHours <= 0` → empty |
| 19 | `peak_pm25_ugm3` | `%.2f` | `getPeakConcUgM3()` | never |
| 20 | `cumulative_dose_ugm3h` | `%.4f` | `getExposureUgM3h()` | never |
| 21 | `exposure_while_traveling_ugm3h` | `%.4f` | — | never |
| 22 | `vwe_ugm3h` | `%.4f` | `getVweUgM3h()` | never |
| 23 | `hours_above_unhealthy` | `%.4f` | — | never |
| 24 | `age` | `%s` | legacy: `at.ageYears` | heterogeneity off → empty |
| 25 | `asthma` | `%s` (`0`/`1`) | legacy | heterogeneity off → empty |
| 26 | `copd` | `%s` (`0`/`1`) | legacy | heterogeneity off → empty |
| 27 | `age_rr` | `%.3f` | `getAgeRR()` (always 1.000) | never |
| 28 | `comorbidity_rr` | `%.3f` | `getComorbidityRR()` (always 1.000) | never |
| 29 | `final_state` | `%s` | enum name | never |
| 30 | `planned_route_m` | `%.2f` | — | never |
| 31 | `snap_gap_m` | `%.2f` | — | never |
| 32 | `door_refusals` | `%d` | `getRetargetCount()` | never |
| 33 | `scenario` | `%s` | `scenarioName`, commas → spaces | never |
| 34 | `walking_speed_mps` | `%.4f` | het block ① | het off → all of 34–44 empty |
| 35 | `age_years` | `%d` | het ② | ditto |
| 36 | `age_band` | `%s` (`18-44`/`45-64`/`65+`) | het ③ | ditto |
| 37 | `sex` | `%s` (`MALE`/`FEMALE`/`OTHER`) | het ④ | ditto |
| 38 | `mobility_limited` | `%d` (0/1) | het ⑤ | ditto |
| 39 | `mobility_category` | `%s` (e.g. `unimpaired`) | het ⑥ | ditto |
| 40 | `asthma_flag` | `%d` | het ⑦ | ditto |
| 41 | `copd_flag` | `%d` | het ⑧ | ditto |
| 42 | `any_respiratory` | `%d` (asthma∨copd) | het ⑨ | ditto |
| 43 | `chronic_physical` | `%d` | het ⑩ | ditto |
| 44 | `vulnerable_flag` | `%d` (55+ ∨ mob ∨ asthma ∨ copd ∨ chronic) | het ⑪ | ditto |
| 45 | `air_volume_breathed_m3` | `%.4f` | — | never |
| 46 | `mean_ventilation_m3h` | `%.4f` | — | never |
| 47 | `inhaled_dose_ug` | `%.4f` | — | never |
| 48 | `health_risk_multiplier` | `%.3f` | always 1.000 | never |
| 49 | `health_risk_score` | `%.4f` | — | never |
| 50 | `aware_initial` | `%d` (0/1) | dec ① | layer off → all of 50–55 empty |
| 51 | `aware_tick` | `%s` of `(long)` | dec ② | layer off, or `getAwareTick()` NaN → empty |
| 52 | `heavy_belongings` | `%d` | dec ③ | layer off → empty |
| 53 | `has_pet` | `%d` | dec ④ | layer off → empty |
| 54 | `has_dependents` | `%d` | dec ⑤ | layer off → empty |
| 55 | `theta_z` | `%.6f` | dec ⑥ — **raw** N(0,1) draw; applied trait is `sigmaTheta × theta_z` | layer off → empty |
| 56 | `blockages_encountered` | `%d` | counter | **never** — always numeric, 0 outside Scenario E |
| 57 | `push_throughs` | `%d` | counter | never |
| 58 | `reroutes` | `%d` | counter | never |
| 59 | `stuck_events` | `%d` | counter | never |

Note the asymmetry the port must reproduce: the het block (34–44) and the decision block (50–55)
emit **empty strings** when their subsystem is off (`",,,,,,,,,,"` / `",,,,,"`), while the four
Scenario-E counters (56–59) are **always numeric** — they are event counts, like `door_refusals`.

- **Logger v1** (`docs/runs/phase-e/`) = columns **1–55** exactly (no counters). 55 columns.
- **Pre-E archive** (`docs/runs/present-day-three-arm/`) = columns **1–49**. 49 columns.
- The header is append-only: v1 = pre-E + 6, v2 = v1 + 4. No column is ever renamed or reordered.

#### `shelters.csv` — 12 columns (v1 and v2 identical)

`shelter_id,name,lon,lat,capacity,operating,peak_occupancy,final_occupancy,refused_count,utilization,mean_travel_dist_m_admitted,policy_refused`

printf: `%s,%s,%.6f,%.6f,%s,%b,%d,%d,%d,%s,%s,%d%n`

| # | column | wire format | empty when |
|---|---|---|---|
| 1 | `shelter_id` | `%s` | never |
| 2 | `name` | `%s`, commas → spaces | never |
| 3 | `lon` | `%.6f` | never |
| 4 | `lat` | `%.6f` | never |
| 5 | `capacity` | `%s` of int | `capacity == null` (unlimited) → empty |
| 6 | `operating` | `%b` (`true`/`false`) | never |
| 7 | `peak_occupancy` | `%d` | never |
| 8 | `final_occupancy` | `%d` | never |
| 9 | `refused_count` | `%d` — **includes policy bounces** | never |
| 10 | `utilization` | `%s` of `%.4f` = `occupancy / capacity` (**final**, not peak) | capacity null → empty |
| 11 | `mean_travel_dist_m_admitted` | `%s` of `%.2f` | 0 admitted → empty |
| 12 | `policy_refused` | `%d` — pet/adults-only subset of col 9 | never (0 in every legacy arm) |

Pre-E archive `shelters.csv` = columns 1–11.

Row counts by arm: 36 (A, B), 46 (C). Capacity sums: A 2,234; B 6,842; C 6,842.

#### `simulation.json`

Schema string `reu-wildfire-shelter-abm/simulation/v1`. Top-level key order (fixed):
`schema`, `generated_utc`, `reproducibility`, `smoke_field`, `closures`,
`street_network_validation`, `governance`, `stratified_exposure`, `scenario`,
`population_sampling`, `decision_layer`, `population`, `shelters`.

Two facts a port must match:

1. `closures` is **always present**. With no schedule it is exactly `{"code": 0}` (gate (k) asserts
   the key set is exactly `{"code"}`); otherwise it carries `code`, `schedule_file`,
   `scheduled_undirected_edges`, `matching_graph_edges`, `wave_hours`, `blocked_edges_at_end`,
   `closure_version_at_end`.
2. `reproducibility.input_datasets` holds **4 entries** normally
   (`data/Streets.shp`, the smoke CSV, the shelter CSV, the encampment CSV) and **5** when
   `closuresCode != 0` — the closure CSV is appended, so `data_version_tag` **changes with the
   closure schedule**. Verified: `SE-E18-seed42` = `58db846ad1e9` vs `SEnc-E18-seed42` =
   `52254ef94fe7` (identical inputs except the appended `closures_E_r1.csv`); and
   `SE2-E18-d1` `83e5b5f8b704` / `d2` `1452dc1cb369` / `d3` `de3a82e14eb6`.

### 1.6 Never-departed exposure constants (per series) — hand-checkable Tier-3 identities

Every resident who never departs accrues the identical field integral, so these are single
distinct values across thousands of rows:

| series | window | `peak_pm25_ugm3` | `avg_pm25_ugm3` | `cumulative_dose_ugm3h` ≡ `vwe_ugm3h` | `hours_above_unhealthy` | `air_volume_breathed_m3` | `inhaled_dose_ug` | n (seed 42) |
|---|---|---|---|---|---|---|---|---|
| observed (code 0) | 312 h | `562.70` | `173.09` | `54002.8192` | `194.0000` | `190.3200` | `32941.7197` | 5,622 (ER-A-42) |
| severe v1 (code 1) | 455 h | `984.75` | `336.35` | `153039.2575` | `306.0000` | `277.5500` | `93353.9471` | 5,580 (SE-E18-42) |
| worst v2 (code 2) | 455 h | `2496.10` | `852.57` | `387918.1692` | `342.0000` | `277.5500` | `236630.0832` | 5,525 (SE2-E18-d1-42) |

`mean_ventilation_m3h` = `0.6100` in all three. The resting-dose identity holds exactly:
`54002.8192 × 0.61 = 32941.719712` → `%.4f` → `32941.7197`; likewise
`153039.2575 × 0.61 = 93353.947075` and `387918.1692 × 0.61 = 236630.083212`.

### 1.7 Smoke series provenance (from the builder sidecars, 19/19 checks each)

| | severe v1 | severe v2 |
|---|---|---|
| file | `data/airnow/aqs_hourly_pm25_synthetic_severe_v1.csv` | `…_severe_v2.csv` |
| `output_sha256` | `379e2efa8268407aafcc6791cf181f1b2bf686bec4ca6cded191950bd163cbe7` | `8520633bc78860c30885153c9beab10923a05b33d8eb059119a474d9f60e18bb` |
| scale / stretch / tail_days | 1.75 / 1.5 / 3 | **4.436** / 1.5 / 3 |
| slices (`hours`) | **456** | **456** |
| peak / mean µg/m³ | 984.75 / 335.6344 | 2496.1 / 850.7536 |
| rows | 3,890 | 3,890 |
| source | `aqs_hourly_pm25_portland_2020-09.csv`, `d908556c…ca08`, 576 slices, peak 562.7, mean 96.5905 | same |
| observed episode | h79–h266, 188 h | same |
| counterfactual episode | h79–h362, 284 h | same |
| plateau days repeated | 2020-09-12 … 15 (4 days added) | same |
| label | `CONSTRUCTED COUNTERFACTUAL -- NOT MEASURED DATA` | same |
| anchor | — | Canberra Florey 2,496.1 µg/m³, 5–6 Jan 2020, ACT open data `94a5-zqnn`; 4.436 = 2496.1/562.7 |

456 slices vs `simulationHours = 455` is the never-regress gotcha: hours ≤ slices − 1.

### 1.8 Executed parameter sets (from the archived manifests, not from the batch files)

Common core (every E run): `numAgents 6842`, `minutesPerTick 1.0`, `walkingSpeedMps 1.3`,
`shelterArrivalDistanceM 200.0`, `evacuationThresholdUgM3 55.5`, `enableHeterogeneity 1`,
`respectShelterOpeningDates 1`, `triageReserveFraction 0.0` (0.1 for arm D / code 20).

| parameter | E0 null | ER / SE / SE2 (baseline-real) |
|---|---|---|
| `enableDecisionLayer` | 1 | 1 |
| `pAwareInit` | **1.0** | **0.356** |
| `pHeavyBelongings` / `pHasPet` / `pHasDependents` | 0.284 / 0.117 / 0.0044 | same |
| `groupSpeedDeltaMps` | **0.0** | **0.06** |
| `lambdaOutreachPerDay` | 0.0 | 0.0 |
| `informationRegime` | **0** (L0) | **1** (L1) |
| `enableHazardDeparture` | **0** (latch) | **1** (logistic) |
| `sigmaTheta` | **0.0** | **1.0** |
| `alphaHazard` | −8.0 | −8.0 |
| `bRisk` / `wOfficial` | 0.4 / 1.1 | same |
| `gammaVuln` | **0.0** | **0.25** |
| `riskHalfLifeH` | 48.0 | 48.0 |
| `barrierBelongings` / `barrierPet` / `barrierDependents` | **0.0 / 0.0 / 0.0** | **0.26 / 0.26 / 0.26** |
| `petPolicyDefault` | **1** (admit) | **0** (refuse) |
| `betaTravelTime` | 1.0 | 1.0 |
| `betaCapacityPrior` | **0.0** | **0.2** |
| `shelterPolicyVariant` | **0** (archived file verbatim) | **1** (`_elayer` file) |
| `smokeSeriesCode` | 0 | 1 (SE) / 2 (SE2) |
| `smokeScale` | 1.0 | 1.0 |
| `closuresCode` | 0 | 1 (SE) / 3 (SE2) / 0 (SEnc, SE2nc) |
| `pStuck` / `stuckDelayH` / `kPush` | 0.3 / 3.0 / 1.0 | same |
| `pushThetaThreshold` | **−0.25** | **0.0** ← see §5 |
| `closureDraw` | 1 | 1 / 2 / 3 |
| `simulationHours` | 312 | 312 (ER) / 455 (SE, SE2) |

The `pushThetaThreshold` split is not a configuration difference: the E0-null batch files simply
**omit** the Scenario-E block, so `doubleParam(parm, "pushThetaThreshold", -0.25)` returns the code
fallback −0.25; the SE/SE2 batch files carry it explicitly and it executed as 0.0. §5.

---

## 2. Tier-2 R3 identity — the exact definition as the Python implements it

This is WP8's flagship acceptance criterion. Source: `scripts/verify_E_runs.py`, `compare_table()`
(lines 249–337) and `check_r3()` (lines 340–387). Nothing below is paraphrase.

### 2.1 Frame loading — raw text, `keep_default_na` semantics

```python
self.agents   = pd.read_csv(path / "agents.csv",   dtype=str, keep_default_na=False)
self.shelters = pd.read_csv(path / "shelters.csv", dtype=str, keep_default_na=False)
```

`dtype=str` + `keep_default_na=False` means: no type inference, no NA coercion, empty fields stay
the empty **string**. The docstring states the intent: *"'identical' means byte-identical field
text, not float-equal after two independent parses."* A TS port must load the same way — read the
field text, never `Number()` it before comparing.

### 2.2 Column selection

```python
null_cols, ref_cols = list(null_df.columns), list(ref_df.columns)
only_null = [c for c in null_cols if c not in set(ref_cols)]
only_ref  = [c for c in ref_cols  if c not in set(null_cols)]
ok_cols = (not only_ref) and set(only_null) <= set(e_only_cols)
```

- **Gate:** the reference may have **no** column the null lacks, and every null-only column must be
  in the allowed appended set.
- Allowed appended sets, from the module constants:
  - `agents.csv`: `E_AGENT_COLS + SE_AGENT_COLS` =
    `["aware_initial", "aware_tick", "heavy_belongings", "has_pet", "has_dependents", "theta_z"]`
    `+ ["blockages_encountered", "push_throughs", "reroutes", "stuck_events"]`
  - `shelters.csv`: `E_SHELTER_COLS = ["policy_refused"]`

```python
shared   = [c for c in null_cols if c in set(ref_cols)]
excluded = [c for c in shared
            if c in IDENTITY_EXCLUDE or c in extra_exclude
            or WALLCLOCK_RE.search(c)]
cols = [c for c in shared if c not in set(excluded)]
```

with

```python
IDENTITY_EXCLUDE = {"sim_id", "commit"}
WALLCLOCK_RE = re.compile(
    r"(^|_)(generated|created|wallclock|timestamp|run_at|export(ed)?_at)(_|$)",
    re.IGNORECASE)
```

**Exclusion discipline — the load-bearing rule.** Only two columns are excluded by name
(`sim_id`, a wall-clock stamp; `commit`, HEAD at run time) plus anything a future writer names with
a wall-clock-shaped token. The source comment is explicit:

> `# Deliberately NOT excluded: time_started_local / time_arrived_local. Those are`
> `# sim-clock instants derived from the tick and the smoke-field anchor, i.e.`
> `# outcomes, and they are among the sharpest identity evidence available.`

`random_seed` and `data_version` are **also** compared. `--exclude-col` exists but its help text
says *"Use only with a written justification — every exclusion weakens the proof."* WP8 must ship
the gate with an **empty** operator exclusion set.

Measured consequence at the archived runs: **47 of 55 shared agents.csv columns** are compared
(49 pre-E columns ∩ 55 null columns = 49 shared, minus `sim_id` and `commit` = 47), and **11 of 11**
shelters.csv columns (no exclusion at all — `shelters.csv` carries no identity columns).

### 2.3 Comparison mechanics

```python
def aligned(frame, key, order, cols):
    return frame.set_index(key, drop=False).loc[order, cols].reset_index(drop=True)
```

1. **Key uniqueness:** `null_df[key].duplicated().sum()` and the same for ref must both be 0.
   Keys: `agent_id` for agents, `shelter_id` for shelters. The key column must itself survive into
   `cols` or the check fails outright.
2. **Key-set equality:** `set(null[key]) == set(ref[key])` — reported as "in ref only" / "in null
   only".
3. **Row order is not compared.** `order = [k for k in null_df[key] if k in rset]`, then both
   frames are re-indexed to that order. Row order is an explicit divergence (`README` divergence 2);
   the comparison is **key-joined**.
4. **Per-column exact text equality:** `av != bv` on the `object` (string) numpy arrays; any
   differing column is reported with its differing-row count.
5. **Digest:** `sha256(A.to_csv(index=False))` vs `sha256(B.to_csv(index=False))` over the aligned
   projection.
6. **Verdict:** `ok = (ha == hb) and not per_col` — both the digest and the per-column scan must
   agree. On failure it prints the top-20 differing columns and the first 5 differing keys with
   up to 6 differing columns each and both values.

### 2.4 The rest of check (a)

- **Counters must be zero in the null:**
  `sum over ["blockages_encountered","push_throughs","reroutes","stuck_events"] == 0` — otherwise
  excluding them would hide live obstacle activity. SKIPs when the CSV predates the block
  (the `phase-e/` nulls).
- **`simulation.json` population census** on the shared keys
  `["pre_evac","sheltered","en_route","unreachable","refused_all_full","n_agents"]` — exact equality.
- **`population.unaware` must exist and be 0** in the null (absence is a FAIL, not a skip).
- **`sum(shelters.policy_refused) == 0`** in the null.

### 2.5 Archived R3 evidence WP8 reproduces (re-verified 2026-07-31)

All eight archived null → reference pairs re-run; all pass, all byte-identical.

| null run | reference | agents projection SHA-256 (both sides) | shelters projection SHA-256 (both sides) | result |
|---|---|---|---|---|
| `phase-e/E0null-A-n6842-seed42` | `present-day-three-arm/A-seed42` | `7d1e668cae3afd950602afc9a572a67a23d54941862490a7d38e2ed202df9815` | `32451215888c63cd2ceeedaffb8c42349655a0eb211aafa5be66e0577ede62b4` | 20 pass / 0 fail / 3 skip |
| `phase-e/E0null-B-n6842-seed42` | `B-seed42` | `188beabf9b22fc6c854f201a7a8489d96eb6f9c62b3a22821617c322654aa425` | `041d36cb98835e3c90d55d64ac2ef8defc72bc34c8d39d50b35cbd60b4223924` | 20 / 0 / 3 |
| `phase-e/E0null-C-n6842-seed42` | `C-seed42` | `be84bc5f1cf94bf9208a804c75829b600a6e7b169b9d3985f9ad82867a6c23f8` | `6d458751b9d15a43cb56d26ca33dd944cde4c4a17d81b025cea7413dbb0a8387` | 20 / 0 / 3 |
| `scenario-e/E0null-{A,B,C}-seed42` | `{A,B,C}-seed42` | same three hashes | same three hashes | 21 / 0 / 2 each |
| `scenario-e-v2/E0null-{A,B,C}-seed42` | `{A,B,C}-seed42` | same three hashes | same three hashes | 21 / 0 / 2 each |

Dimensions: agents **47 cols × 6,842 rows**; shelters **11 cols × 36 rows** (A, B) or
**11 × 46** (C). Population census reproduced by the nulls:

| arm | pre_evac | sheltered | en_route | unreachable | refused_all_full | unaware |
|---|---|---|---|---|---|---|
| A | 0 | **2060** | 0 | **28** | **4754** | 0 |
| B | 0 | **6264** | 0 | **28** | **550** | 0 |
| C | 0 | **6570** | 0 | **28** | **244** | 0 |

Arm A's triple (2060 / 4754 / 28) is the same one WP7's arm-A slice already reproduces.

### 2.6 What WP8 must build

The plan's Tier-2 form is **own-engine** R3 (§5.1): *TS E0-degenerate run vs TS no-layer run*, on
the same shared-column projection with the same exclusion discipline. Two arms:

1. **R3-null:** TS run with `enableDecisionLayer=1` + the degenerate E block (§1.8 left column) vs
   TS run with `enableDecisionLayer=0`, at codes 0/1/2, seed 42, 312 h. Projection must be
   byte-identical; the appended 6 (+4) columns are the only permitted delta; counters all-zero.
2. **R3-closures-inert:** the same, with `closuresCode=0` present in schema so the SE parameter
   block is exercised without changing behaviour (the plan's "closures-inert variant").

Cross-check available for free: because the TS engine also reproduces the archived arm-A/B/C rows,
the TS E0-null projection should hash to the **same** SHA-256s listed in §2.5. That is a stronger
statement than the plan requires and should be asserted where Tier-1/Tier-4 identity already holds.

---

## 3. Gate definitions — transcribed, not paraphrased

All from `scripts/verify_E_runs.py`. Shared constants used below:

```python
E_PARAMS = [                                    # 21, ContextCreator pNames tail
    "enableDecisionLayer", "pAwareInit", "pHeavyBelongings", "pHasPet",
    "pHasDependents", "groupSpeedDeltaMps", "lambdaOutreachPerDay",
    "informationRegime", "enableHazardDeparture", "sigmaTheta",
    "alphaHazard", "bRisk", "wOfficial", "gammaVuln", "riskHalfLifeH",
    "barrierBelongings", "barrierPet", "barrierDependents",
    "petPolicyDefault", "betaTravelTime", "betaCapacityPrior",
]
SE_PARAMS = [                                   # 7 core Scenario-E
    "smokeSeriesCode", "smokeScale", "closuresCode", "pStuck",
    "stuckDelayH", "pushThetaThreshold", "kPush",
]
SE_AGENT_COLS = ["blockages_encountered", "push_throughs", "reroutes", "stuck_events"]
ROUND_SLACK = 1e-4        # the manifest prints realised shares with %.4f
```

and the numeric view every gate uses:

```python
def num(self, col):
    """Numeric view of an agents.csv column; empty fields become NaN."""
    return pd.to_numeric(self.agents[col], errors="coerce")
```

### 3.1 Gate (f) — Wachinger acceptance

Applies to **E arms only** (`--er`, `--se`); SKIPped for `--null` runs with the reason *"not an E
arm (--er); the null has zero barrier cost by design"*.

Input columns: `heavy_belongings`, `has_pet`, `has_dependents`, `final_state`
(plus `aware_initial`, `aware_tick`, `theta_z` for the block-presence precondition).

```python
if not run.has_e_block():                       # all 6 E_AGENT_COLS present
    FAIL "agents.csv has no Phase-E attribute block"

heavy = run.num("heavy_belongings").fillna(0)
pet   = run.num("has_pet").fillna(0)
dep   = run.num("has_dependents").fillna(0)
barriers = heavy + pet + dep
high  = (barriers >= 2) | ((heavy == 1) & (pet == 1))
n_high = int(high.sum())
if n_high == 0:
    FAIL "high-barrier stratum is EMPTY -- the barrier attributes were not
          sampled, so the constraint cannot be tested"

state  = run.agents["final_state"]
stayed = high & state.isin(["UNAWARE", "PRE_EVAC"])
n_stay = int(stayed.sum())

PASS iff n_stay >= 1
```

**Threshold: ≥ 1.** The reported detail is `n_high`, `n_stay` and `100.0*n_stay/n_high`. The failure
message names the reason: *"A monotone risk-only trigger is forbidden by the risk-perception
paradox (Wachinger 2013, doi 10.1111/j.1539-6924.2012.01942.x): the barrier cost c_i is not
suppressing departure."*

Note the `| ((heavy == 1) & (pet == 1))` disjunct is redundant with `barriers >= 2` in the archive
(both flags are 0/1), but it is in the source and the port must keep it — it is what makes the
predicate "2+ barriers **or** belongings-and-pet" rather than a pure count.

Archived value (SE2-E18-d1-seed42): `high-barrier n = 226`, `n_stay = 195` (86.3%).
The predictions doc reports "~87% of high-barrier residents never depart" across ER runs.

### 3.2 Gate (g) — E-census plausibility (3 binomial SE + 1e-4)

Two sub-checks. Preconditions: `simulation.json.decision_layer` must exist (absence = FAIL,
*"pre-Phase-E writer?"*); `decision_layer.enabled` false → SKIP; `n_sampled <= 0` → FAIL.

**(g.1) realised vs configured.** Mapping:

```python
CENSUS_TO_PARAM = {
    "realised_aware":             "pAwareInit",
    "realised_heavy_belongings":  "pHeavyBelongings",
    "realised_pet":               "pHasPet",
    "realised_dependents":        "pHasDependents",
}
```

Formula, per key (a missing key or a missing parameter is a FAIL, not a skip):

```python
n        = int(run.decision["n_sampled"])
realised = float(run.decision[key])
target   = float(run.params[pname])
se  = math.sqrt(max(target * (1.0 - target), 0.0) / n)
tol = 3.0 * se + ROUND_SLACK              # ROUND_SLACK = 1e-4
PASS iff abs(realised - target) <= tol
```

The `max(..., 0.0)` guard matters at `target == 1.0` (the E0 null): variance 0 → tol = 1e-4 exactly,
i.e. the null's `realised_aware` must be 1.0000 to printing precision. `1e-4` is **slack, not
tolerance** — the manifest prints `%.4f`, so a true `k/n` can sit up to 5e-5 from the printed value.

**(g.2) manifest census vs the CSV it summarises.** SKIPs if the E block is absent.

```python
CENSUS_TO_COLUMN = {
    "realised_aware":            "aware_initial",
    "realised_heavy_belongings": "heavy_belongings",
    "realised_pet":              "has_pet",
    "realised_dependents":       "has_dependents",
}
share = float(run.num(col).fillna(0).mean())
PASS iff abs(share - float(run.decision[key])) <= ROUND_SLACK
```

Archived values at seed 42, n_sampled 6842 (identical in ER, SE and SE2 — the ELayerSampler stream
is independent of the smoke/closure layer):

| key | realised | target param | \|Δ\| | 3SE + slack |
|---|---|---|---|---|
| `realised_aware` (ER/SE/SE2) | 0.3549 | `pAwareInit` 0.356 | 0.00110 | 0.01747 |
| `realised_aware` (E0 null) | 1.0000 | `pAwareInit` 1.0 | 0.00000 | 0.00010 |
| `realised_heavy_belongings` | 0.2774 | `pHeavyBelongings` 0.284 | 0.00660 | 0.01645 |
| `realised_pet` | 0.1171 | `pHasPet` 0.117 | 0.00010 | 0.01176 |
| `realised_dependents` | 0.0047 | `pHasDependents` 0.0044 | 0.00030 | 0.00250 |

(g.2) deltas at the same run: 0.000033 / 0.000004 / 0.000029 / 0.000023 — all < 1e-4.

The manifest also carries `realised_any_barrier` 0.3658 and `realised_compound_barrier` 0.033,
which the gate does **not** test; they are available for WP8 as extra evidence.

### 3.3 Gate (h)/(i) — manifest completeness (21 E + 7 SE params)

**(h), every E run:**

```python
missing = [p for p in E_PARAMS if p not in run.params]     # E_PARAMS has 21 entries
PASS iff not missing
```
plus
```python
dirty = run.repro.get("source_integrity", {}).get("git_working_tree_dirty")
PASS iff dirty is False            # identity, not truthiness: "unknown" and None both FAIL
```

**(i), Scenario-E runs only:**

```python
missing = [p for p in SE_PARAMS if p not in run.params]    # SE_PARAMS has 7 entries
PASS iff not missing

code = int(float(run.params.get("closuresCode", 0)))
if code == 3:
    PASS iff "closureDraw" in run.params                   # only asserted for the worst family
```

`closureDraw` is deliberately **not** in `SE_PARAMS`: the module comment says *"it entered the
manifest with the worst-case family, so the archived v1 SE runs legitimately lack it."*

Archived: 21/21 E params present in every run; parameter totals 33 (phase-e), 40 (scenario-e),
41 (scenario-e-v2). Every `git_working_tree_dirty` is the JSON boolean `false`.

For completeness, gate (j) (severe-series provenance) which (i) is usually run beside:

```python
SEVERE_SERIES = {                       # code -> (file the manifest must checksum, unscaled peak)
    1: ("data/airnow/aqs_hourly_pm25_synthetic_severe_v1.csv",  984.75),
    2: ("data/airnow/aqs_hourly_pm25_synthetic_severe_v2.csv", 2496.10),
}
series not in SEVERE_SERIES              -> SKIP "observed series"
series_csv in [d["file"] for d in repro["input_datasets"]]           # PASS/FAIL
int(smoke["hours"]) == 456                                           # PASS/FAIL
abs(float(smoke["peak_hourly_ugm3"]) - series_peak*smokeScale) <= 0.06   # %.1f printing slack
int(smoke["out_of_range_lookups"]) == 0                              # the 456-vs-455 gate
```

### 3.4 Gate (k) — closure census vs schedule

Input: `simulation.json.closures` block + the schedule CSV at
`Geography/<closures.schedule_file>` read as `pd.read_csv(csv_path, dtype=str)` (note: **not**
`keep_default_na=False` here — the frame is only used for counts and int conversions).

```python
code = int(float(run.params.get("closuresCode", 0)))
cl   = run.manifest.get("closures")
if cl is None:
    FAIL "simulation.json has no closures key (pre-Scenario-E writer?)"

# k.1
PASS iff int(cl.get("code", -1)) == code

if code == 0:
    # k.2 — the minimal block, and nothing else
    PASS iff set(cl.keys()) == {"code"}
    return

sched = pd.read_csv(ROOT / "Geography" / cl["schedule_file"], dtype=str)
if not csv_path.is_file():  FAIL "closure schedule file exists"
n_rows    = len(sched)
pairs     = {tuple(sorted((a, b))) for a, b in zip(sched["node_a"], sched["node_b"])}
hours_csv = sorted({int(h) for h in sched["activation_hour"]})

# k.3
PASS iff int(cl.get("scheduled_undirected_edges", -1)) == n_rows
# k.4  (mismatch means node-id drift between the schedule and the graph)
PASS iff int(cl.get("matching_graph_edges", -1)) == n_rows
# k.5
PASS iff int(cl.get("blocked_edges_at_end", -1)) == len(pairs)
# k.6
PASS iff int(cl.get("closure_version_at_end", -1)) == len(hours_csv)
# k.7
PASS iff list(cl.get("wave_hours", [])) == hours_csv
```

Note k.5's semantics: `blocked_edges_at_end` is read from the **live network** at export time and
must equal the number of **distinct undirected pairs** in the CSV — `len(pairs)`, not `n_rows`.
They coincide in the archive (the builder's "no duplicate closed edge" gate guarantees it), but the
port must compute `blocked_edges_at_end` from the network, not from the file. Likewise
`closure_version_at_end` is the count of **distinct** activation hours; k.7 requires the manifest
list to equal that sorted distinct list exactly (order included).

Archived values:

| config | code | schedule file | scheduled | matching | distinct pairs | blocked@end | version | wave_hours |
|---|---|---|---|---|---|---|---|---|
| SE-E18/19/20 | 1 | `data/closures/closures_E_r1.csv` | 18 | 18 | 18 | 18 | 1 | `[79]` |
| SE2-*-d1 | 3 | `closures_E_r1_worst.csv` | 72 | 72 | 72 | 72 | 6 | `[3, 44, 72, 142, 265, 303]` |
| SE2-E18-d2 | 3 | `closures_E_r2_worst.csv` | 72 | 72 | 72 | 72 | 6 | `[5, 92, 130, 163, 214, 263]` |
| SE2-E18-d3 | 3 | `closures_E_r3_worst.csv` | 72 | 72 | 72 | 72 | 6 | `[2, 35, 37, 40, 75, 76]` |
| SEnc-*, SE2nc-*, E0 nulls | 0 | — | — | — | — | — | — | `{"code": 0}` only |

### 3.5 Gate (l) — counter identities

Input columns: `SE_AGENT_COLS` = `blockages_encountered`, `push_throughs`, `reroutes`,
`stuck_events`; parameter `pStuck`.

```python
code = int(float(run.params.get("closuresCode", 0)))
missing = [c for c in SE_AGENT_COLS if c not in run.agents.columns]
if missing:  FAIL "Scenario-E counters present"

blk = run.num("blockages_encountered").fillna(0)
psh = run.num("push_throughs").fillna(0)
rrt = run.num("reroutes").fillna(0)
stk = run.num("stuck_events").fillna(0)

# l.0 — closure-free runs
if code == 0:
    tot = int(blk.sum() + psh.sum() + rrt.sum() + stk.sum())
    PASS iff tot == 0
    return

# l.1 — every blockage resolved to exactly one decision, PER ROW
bad_decide = int((blk != psh + rrt).sum())
PASS iff bad_decide == 0

# l.2 — stuck events never exceed push-throughs, PER ROW
bad_stuck = int((stk > psh).sum())
PASS iff bad_stuck == 0

# l.3 — stuck share within 3 binomial SE of pStuck (only when there are pushes)
n_push, n_stuck = int(psh.sum()), int(stk.sum())
p_stuck = float(run.params.get("pStuck", 0.0))
if n_push > 0:
    share = n_stuck / n_push
    se = math.sqrt(p_stuck * (1 - p_stuck) / n_push)
    PASS iff abs(share - p_stuck) <= 3 * se + ROUND_SLACK
else:
    print("        OBSERVATION: zero push-throughs in this run")   # not a check
```

l.1 and l.2 are **row-wise** identities (`(blk != psh + rrt).sum()` counts rows, not totals), so a
per-agent violation cannot be hidden by an aggregate that happens to balance.

l.3 additionally prints, when `n_push > 0`, an ungated observation used to score P-SE5:

```python
n_blocked  = int((blk > 0).sum())
n_events   = int(blk.sum())
push_share = psh.sum() / n_events
"OBSERVATION [P-SE5]: {n_blocked} residents blocked, {n_events} blockage events,
 push share {push_share:.3f} (registered band 0.35-0.60; scored in the predictions doc,
 not gated here)"
```

Archived: `n_push == 0` in **every** run, so l.3 never executed anywhere in the archive and its
`else` branch is the only path the archive exercises. WP8 must implement l.3 anyway (the browser
can produce blockages under configurations the archive never ran) and must reproduce the archive's
`n_push == 0` at the archived configurations. §4.4.

The engine-side semantics l.1/l.2 encode (`GisAgent.reactToClosureWave`, `PORT_MAP` §1.6.3):
`seenClosureVersion` is set **first** (a no-hit scan still consumes the wave); a no-hit scan
increments no counter and draws no RNG; on a hit `blockagesEncountered++` then exactly one of
`pushThroughs++` / `reroutes++`; a push records **all** currently-blocked ahead-edges in
`pushedBlockages` (canonical `min:max` key, never re-litigated) and takes exactly one
`decisionRng.nextDouble() < pStuck` gamble; the push predicate is

```java
mobilityPenalty = mobilityLimited ? 1.0 : 0.0;
push = thetaScaled >= pushThetaThreshold + kPush * (barrierCost + mobilityPenalty);
// false whenever decisionConfig == null || decisionAttributes == null
```

### 3.6 The other gates, for completeness

| gate | one-line definition | thresholds |
|---|---|---|
| (a) | R3 identity | §2 |
| (b) | `sum(shelters.final_occupancy) == manifest.population.sheltered == count(reached_shelter=="yes") == count(final_state=="SHELTERED")` | exact, 4-way |
| (c) | asthma negative control in stratum `copd==0 & mobility_limited==0` | `\|Δmean(walking_speed_mps)\| <= 0.02`; `\|z\| <= 3.0` on `inhaled_dose_ug` where `se = sqrt(var1/n1 + var0/n0)` (ddof=1); departure timing printed as an OBSERVATION, **never gated**; prints a CAVEAT when `gammaVuln > 0` |
| (d) | `final_state` vocabulary closed to `{PRE_EVAC, EN_ROUTE, SHELTERED, UNREACHABLE, REFUSED_ALL_FULL, UNAWARE}`; counts sum to rows and to `numAgents`; per-state CSV count == `simulation.json.population.<key>` | exact |
| (e) | UNAWARE residents: `total_travel_distance_m` numerically 0 **and** `time_started_tick` blank after `.strip()`. SKIPs if no UNAWARE rows | exact |
| (j) | severe-series provenance | §3.3 |

`STATE_TO_CENSUS` (gate d's mapping) is
`{"PRE_EVAC":"pre_evac", "EN_ROUTE":"en_route", "SHELTERED":"sheltered", "UNREACHABLE":"unreachable", "REFUSED_ALL_FULL":"refused_all_full", "UNAWARE":"unaware"}`.

### 3.7 Check counts per run class (measured 2026-07-31)

| invocation | checks | breakdown |
|---|---|---|
| `--null X --reference Y` on a `phase-e/` null | 23 (20 P / 0 F / 3 S) | (a)×12, then per-run (b)(c)(d)×3(e)(f)(g)×2(h)×2 with (e),(f) skipped and the counter sub-check skipped |
| `--null X --reference Y` on a `scenario-e{,-v2}/` null | 23 (21 P / 0 F / 2 S) | same, counter sub-check now runs |
| `--er RUN` | **11** | (b)1 (c)1 (d)3 (e)1 (f)1 (g)2 (h)2 |
| `--se RUN`, `closuresCode 0` (SEnc/SE2nc) | **19** | 11 + (i)1 + (j)4 + (k)2 + (l)1 |
| `--se RUN`, `closuresCode 1` (SE v1) | **24** | 11 + (i)1 + (j)4 + (k)6 + (l)2 |
| `--se RUN`, `closuresCode 3` (SE2 v2) | **25** | 24 + the `closureDraw` sub-check |

These reproduce the archive's own totals exactly: v1 matrix `9 × 24 + 9 × 19 = 216 + 171 = 387`
("387/387 checks … 216 severe + 171 control"); v2 matrix
`15 × 25 + 9 × 19 = 375 + 171 = 546` ("546/546"); grand total **933**. The ER matrix's
"99/99 invariants" is `9 × 11`.

---

## 4. Direction-of-effect results WP8 must reproduce

Regenerated from the archive with `scripts/score_scenarioE.py` on 2026-07-31. `capacity_refusals`
= `sum(shelters.refused_count) − sum(shelters.policy_refused)`; `attempt_share_aware` =
`mean(time_started_tick != "")` over rows with `aware_initial == 1`.

### 4.1 ER baseline-real (`docs/runs/phase-e/`, observed smoke, 312 h)

| run | sheltered | share | attempt share (aware) | door refusals | capacity refusals | policy refusals | mean dose µg | mean h-unhealthy sheltered / never |
|---|---|---|---|---|---|---|---|---|
| ER-A-42 | **1215** | 0.1776 | 0.5025 | 836 | 295 | 541 | 29694.6 | 85.13 / 194.0 |
| ER-A-43 | **1168** | 0.1707 | 0.4782 | 748 | 212 | 536 | 29887.4 | 87.21 / 194.0 |
| ER-A-44 | **1205** | 0.1761 | 0.4854 | 746 | 231 | 515 | 29924.0 | 91.11 / 194.0 |
| ER-C-42 | **1215** | 0.1776 | 0.5025 | 596 | **0** | 596 | 29682.0 | 84.97 / 194.0 |
| ER-C-43 | **1168** | 0.1707 | 0.4782 | 560 | **0** | 560 | 29879.3 | 87.09 / 194.0 |
| ER-C-44 | **1206** | 0.1763 | 0.4854 | 539 | **0** | 539 | 29914.3 | 91.06 / 194.0 |
| ER-D-42 | **1215** | 0.1776 | 0.5025 | 350 | **0** | 350 | 29682.7 | 84.98 / 194.0 |
| ER-D-43 | **1168** | 0.1707 | 0.4782 | 304 | **0** | 304 | 29878.9 | 87.08 / 194.0 |
| ER-D-44 | **1206** | 0.1763 | 0.4854 | 345 | **0** | 345 | 29915.3 | 91.07 / 194.0 |

Directions WP8 must reproduce:

- **A→C gap disappears.** Between-arm difference ≤ 1 resident against a between-seed spread of 47
  (1168 … 1215). Ordering A ≤ C survives but is not resolvable.
- **Arm D's reserve is inert.** ER-D records **zero** capacity refusals at every seed, so its 667
  reserved beds arbitrate nothing (P-E4's registered disconfirmation clause). This must be stated
  wherever ER-D is presented.
- **Access is awareness-limited, not door-limited.** Sheltered share 17.1–17.8% under a 35.6%
  awareness ceiling; arm A finishes with 2234 − 1215 = **1,019 empty beds** at seed 42 while still
  booking 295 door-level capacity refusals (individual sites fill while beds stand empty
  elsewhere; every refused resident re-routes and is admitted).
- **P-E5 barrier gradient:** pre-correction sheltered share 19.1% (no barriers) / 11.5% (one) /
  0.0% (two or more); Wachinger holds (~87% of high-barrier residents never depart).
- **P-E6 asthma negative control:** `|Δ walking_speed| = 0.0043 m/s` (gate 0.02), dose `z = 0.70`
  (gate 3.0) at seed 42 — signal confined to departure timing.
- **Registered miss to preserve:** P-E1 predicted 10–15% sheltered; observed 15.9% pre-pet-correction
  and 17.8% after. The miss is recorded, never edited away. The α = −8.0 derivation is documented
  as arithmetically wrong (realised attempt share 0.502, not the assumed 0.385; correcting would
  need α ≈ −8.7) and the wrong value is **deliberately kept** so E18 stays comparable to ER-A
  run-for-run.

### 4.2 SE severe v1 (`docs/runs/scenario-e/`, series 1, peak 984.75, 455 h)

| run | sheltered | share | attempt (aware) | door | capacity | policy | mean dose µg | h-unhealthy shel / never |
|---|---|---|---|---|---|---|---|---|
| SE-E18-42 / 43 / 44 | 1252 / 1223 / 1247 | .1830/.1787/.1823 | .5198/.5018/.5042 | 834/730/739 | **291/229/244** | 543/501/495 | 81552.0/82082.3/81982.2 | 92.16/95.99/98.16 · 306.0 |
| SE-E19-42 / 43 / 44 | 1257 / 1226 / 1252 | .1837/.1792/.1830 | same | 639/583/601 | 0 / 0 / **2** | 639/583/599 | 81508.7/82049.1/81945.6 | 92.56/96.18/98.57 · 306.0 |
| SE-E20-42 / 43 / 44 | 1257 / 1225 / 1252 | .1837/.1790/.1830 | same | 371/314/359 | **0 / 0 / 0** | 371/314/359 | 81507.6/82051.3/81945.2 | 92.55/96.05/98.56 · 306.0 |
| SEnc-E18-42/43/44 | 1253 / 1224 / 1248 | — | same | 931/837/822 | **347/259/271** | 584/578/551 | 81553.4/82086.0/81983.6 | — |
| SEnc-E19-42/43/44 | 1257 / 1225 / 1251 | — | same | 616/590/568 | 0/0/2 | 616/590/566 | 81506.2/82051.2/81945.8 | — |
| SEnc-E20-42/43/44 | 1257 / 1225 / 1252 | — | same | 366/317/354 | 0/0/0 | 366/317/354 | 81507.7/82051.8/81945.2 | — |

- **P-SE1 — MISS on the band, CONFIRMED on mechanism.** Attempt share rose at every seed
  (0.5198 / 0.5018 / 0.5042 vs ER's 0.5025 / 0.4782 / 0.4854) but only ~0.03, far below the
  registered 0.55–0.75. Sheltered share ≤ 18.4% under the 35.6% ceiling; E18 ends with empty beds
  (≤ 1,252 of 2,234). The sub-clause "E18's capacity refusals rise above ER-A's" is **also not
  confirmed**: 291/229/244 vs 295/212/231 is flat.
- **P-SE2 — CONFIRMED.** Mean dose per capita is **2.74–2.75× ER** at every seed against a 1.75×
  concentration transform (81552.0/29694.6 = 2.746; 82082.3/29887.4 = 2.746;
  81982.2/29924.0 = 2.740).
- **P-SE3 — sheltered-equality CONFIRMED; cost channel NOT EVALUABLE (empty stratum).** Adjacent
  observation, reported not scored: closure arms show **fewer** arm-A capacity refusals than their
  controls — 291 vs 347, 229 vs 259, 244 vs 271. A closure schedule redistributed **where**
  refusals happen without changing **who** gets in.
- **P-SE4 — CONFIRMED.** E20 records **zero** capacity refusals at every seed; its 371/314/359
  refusals are all pet/adults-only policy bounces.
- **P-SE6 — CONFIRMED.** The never-sheltered vs sheltered hours-above-unhealthy gap widened to
  **1.96× / 1.97× / 2.02×** the ER gap, above the 1.75× transform at every seed; the never-sheltered
  saturate all **306** unhealthy hours of the severe series (ER: all **194**).

### 4.3 SE2 worst-plausible v2 (`docs/runs/scenario-e-v2/`, series 2, peak 2496.1, 455 h)

| run | sheltered | share | attempt (aware) | door | capacity | policy | mean dose µg |
|---|---|---|---|---|---|---|---|
| SE2-E18-d1-42/43/44 | **1307 / 1272 / 1301** | .1910/.1859/.1901 | .5424/.5214/.5258 | 1152/890/982 | **443 / 305 / 362** | 709/585/620 | 204527.8/205991.0/205629.6 |
| SE2-E18-d2-42/43/44 | **1307 / 1271 / 1302** | .1910/.1858/.1903 | same | 983/822/887 | **406 / 288 / 349** | 577/534/538 | 204501.3/205991.4/205618.3 |
| SE2-E18-d3-42/43/44 | **1309 / 1271 / 1301** | .1913/.1858/.1901 | same | 783/625/676 | **327 / 218 / 266** | 456/407/410 | 204472.6/205967.4/205594.3 |
| SE2-E19-d1-42/43/44 | 1312 / 1273 / 1305 | .1918/.1861/.1907 | same | 631/601/603 | 0 / 0 / 5 | 631/601/598 | 204367.6/205893.1/205506.7 |
| SE2-E20-d1-42/43/44 | 1312 / 1273 / 1306 | .1918/.1861/.1909 | same | 388/328/381 | **0 / 0 / 0** | 388/328/381 | 204375.9/205896.3/205506.7 |
| SE2nc-E18-42/43/44 | 1308 / 1272 / 1302 | — | same | 1082/886/932 | **429 / 307 / 357** | 653/579/575 | 204510.5/205989.9/205616.3 |
| SE2nc-E19-42/43/44 | 1312 / 1273 / 1305 | — | same | 640/609/605 | 0/0/5 | 640/609/600 | 204370.0/205895.2/205507.0 |
| SE2nc-E20-42/43/44 | 1312 / 1273 / 1306 | — | same | 377/319/363 | 0/0/0 | 377/319/363 | 204373.9/205895.1/205504.0 |

- **P-SE7 — CONFIRMED.** Mean dose **204,367.6 – 205,991.4 µg** across every v2 run, inside the
  registered ±10% band around 207,000, and **6.87–6.94× ER-A** (registered > 6.5).
  (The predictions doc rounds this to "204,368–205,991"; the unrounded values above are what the
  archive holds.) **Denominator note, recomputed here:** the doc's "6.87–6.94×" is every v2 mean
  dose over **ER-A seed 42's** 29,694.6 µg (range 6.882–6.937). Divided **seed-matched**
  (each v2 run over the ER-A run at its own seed: 29,694.6 / 29,887.4 / 29,924.0) the range is
  **6.868–6.892**. Both exceed the registered > 6.5, so the verdict is unaffected; a WP8 gate
  should pin the denominator it uses.
- **P-SE8 — CONFIRMED.** Attempt share among the aware rose at every seed
  (0.5424 / 0.5214 / 0.5258 vs v1's 0.5198 / 0.5018 / 0.5042) and stayed **below 0.60**; sheltered
  share peaked at **19.2%** against the 35.6% ceiling.
- **P-SE10 — MISS, and the miss is the finding.** The registered direction (closure arms record
  fewer capacity refusals than their controls at every seed) holds for **d2** (406/288/349 vs
  429/307/357) and **d3** (327/218/266 — strongest, front-loaded draw) but **REVERSES for d1 at
  seeds 42 and 44** (443 vs 429; 362 vs 357). The redistribution signature is real but
  **draw-dependent**. This is why closure effects must be reported as a range across draws (A-34),
  never from one schedule.
- **P-SE11 — CONFIRMED.** Sheltered counts across draws vary by ≤ 2 residents
  (1307/1307/1309 at seed 42; 1272/1271/1271 at 43; 1301/1302/1301 at 44) while capacity refusals
  swing by > 100 at the same seed (443 / 406 / 327).

### 4.4 The measure-zero push result — exact severities and exact result

**This is the "measure-zero push result at documented severities" the plan's WP8 acceptance line
references.** Located and quantified.

**The result, measured directly from the archive** (`blockages_encountered`, `push_throughs`,
`reroutes`, `stuck_events` summed over all 6,842 rows of all 48 SE/SEnc/SE2/SE2nc runs plus the
6 E0-nulls that carry the counters):

> **Every one of the four Scenario-E counters is 0 in every run of the archive.** Zero blockage
> events, zero push-throughs, zero reroutes, zero stuck events; `residents_blocked = 0` everywhere.

**The documented severities at which this holds** — i.e. the full set of closure runs, **24** of
them, across **two smoke series and four closure schedules**:

| # runs | archive | smoke series | peak µg/m³ | window | closuresCode | schedule | edges | waves | wave hours |
|---|---|---|---|---|---|---|---|---|---|
| 9 | `scenario-e/` (SE-E18/E19/E20 × seeds 42–44) | severe v1 | 984.75 | 455 h | 1 | `closures_E_r1.csv` | 18 (3 bridges + 15 arterials) | 1 | 79 |
| 3 | `scenario-e-v2/` (SE2-E18-d1 × 3 seeds) | worst v2 | 2496.10 | 455 h | 3 | `closures_E_r1_worst.csv` | 72 (4 bridges + 38 arterials + 30 locals) | 6 | 3, 44, 72, 142, 265, 303 |
| 3 | `scenario-e-v2/` (SE2-E18-d2 × 3 seeds) | worst v2 | 2496.10 | 455 h | 3 | `closures_E_r2_worst.csv` | 72 | 6 | 5, 92, 130, 163, 214, 263 |
| 3 | `scenario-e-v2/` (SE2-E18-d3 × 3 seeds) | worst v2 | 2496.10 | 455 h | 3 | `closures_E_r3_worst.csv` | 72 | 6 | 2, 35, 37, 40, 75, 76 |
| 3 | `scenario-e-v2/` (SE2-E19-d1 × 3 seeds) | worst v2 | 2496.10 | 455 h | 3 | `closures_E_r1_worst.csv` | 72 | 6 | 3, 44, 72, 142, 265, 303 |
| 3 | `scenario-e-v2/` (SE2-E20-d1 × 3 seeds) | worst v2 | 2496.10 | 455 h | 3 | `closures_E_r1_worst.csv` | 72 | 6 | 3, 44, 72, 142, 265, 303 |

plus 24 closure-**free** control runs (9 SEnc + 9 SE2nc + 6 E0-nulls carrying the counter block)
where the zero is structural.

The mechanism, as scored in `13-PHASE-E-PREDICTIONS.md`:

- v1, **P-SE5 — NOT EVALUABLE (empty stratum), and the emptiness is the finding.** Departures spread
  over ~455 h at ~3–8/hour while the median walk lasts 24 min (p90 107 min), so ~4 of 6,842
  residents are mid-walk at any wave instant — and none of their routes crossed the 18 closed
  edges. The 985-per-run departures after the wave all route on the recomputed trees, absorbing
  closures as silent detours.
- v2, **P-SE9 — CONFIRMED on the ceiling and the mechanism; the r1/r2 sub-clause did not
  materialize.** Zero in all fifteen v2 closure runs — within the registered ≤ ~30 ceiling and
  exactly zero for r3 as registered, but r1/r2 recorded no events either. *"with ~4 concurrent
  walkers and 72 closed edges among ~110,000, the expected event count per run is of order one, and
  zero across 15 runs says it is below that."*

The headline sentence WP8 must be able to defend, verbatim from the predictions doc:

> **street closures in a hazard-staggered population act entirely through rerouted geometry — the
> face-to-face gamble (V51) is a measure-zero event at ANY documented severity.**

and its consequence, also verbatim:

> the V51 push-vs-reroute machinery (implemented, R3-proven, census-verified) is starved of subjects
> in any realistic staggered regime, because max concurrent walkers ≈ departure rate × walk
> duration stays single-digit. The mechanism becomes testable only where walks and waves overlap
> densely: simultaneous-departure regimes (the legacy latch), much longer walks, or wave times drawn
> inside the departure surge.

**Count reconciliation (both figures are in the repo and both are right):** `PORT_MAP` §6.5 says
*"all 24 closure runs recorded zero blockage events"* — that is the union of v1 (9 runs,
`closuresCode 1`) and v2 (15 runs, `closuresCode 3`). `13-PHASE-E-PREDICTIONS.md` P-SE9 says
*"ZERO in all fifteen closure runs"* — that is the v2 matrix alone. The v2 registered scope
"24 runs" is a **third** 24: 15 closure + 9 SE2nc controls. Independently recounted here: 9 + 15 =
**24 closure runs**, 48 SE-family runs total.

**What WP8 must do with it.** Reproduce the zero at the six configurations above, and — because a
gate that can only ever pass is worthless — also demonstrate the counter machinery **can** fire, by
running a non-archived configuration where walks and waves overlap (legacy latch, or a wave hour
inside the departure surge) and showing (l.1)(l.2)(l.3) exercised with `n_push > 0`. That is the
Scenario-E instance of the plan's mutation-test principle (§5.2, risk W20).

---

## 5. The `pushThetaThreshold` honesty note — verbatim

WP8 must wire this into the SE/SE2 presets and the quirk ledger (`IMPLEMENTATION_PLAN.md` §8 WP8
acceptance; §6.4; §9.2 divergence 6). Four places in the repo carry it. All quoted exactly.

### 5.1 The primary record — `docs/critique-response/13-PHASE-E-PREDICTIONS.md`, lines 392–405

> **CORRECTION, 2026-07-30, found by the pre-push audit (appended, not edited).** Both Scenario-E
> configuration paragraphs above register `pushThetaThreshold −0.25`, and every SE/SE2 batch params
> file carries `value="-0.25"` — but every run manifest records the EXECUTED value as **0.0**. Root
> cause, probe-verified twice: Repast's batch parser silently zeroes NEGATIVE
> `constant_type="number"` constants (positives pass; `constant_type="double"` executes −0.25
> correctly — the generator now emits "double" for negative values). IMPACT: NONE on any reported
> number — the parameter is consulted only at a blockage encounter, and all 24 closure runs recorded
> ZERO blockage events, so the V51 decision rule never executed in any run. The registered
> band-anchored derivation of −0.25 stands for future sweeps; the executed-config record stands as
> 0.0; the manifests were truthful throughout, which is how the audit caught it. The runs are
> deliberately NOT re-run over an unconsulted parameter.

### 5.2 The UI requirement — `websim/docs/IMPLEMENTATION_PLAN.md` §6.4, lines 548–551

> **pushThetaThreshold honesty note (graft):** the SE/SE2 preset UI and quirk ledger state that
> archived runs *executed* `pushThetaThreshold = 0.0` (Repast negative-"number" parser defect,
> inert — zero blockage events) while web presets carry the corrected −0.25, so live-vs-archived
> closure comparisons are framed correctly.

Companion slider constraint, §6.3 lines 533–536:

> **Closures (Scenario E)**: closuresCode dropdown, closureDraw (enabled only for code 3), pStuck,
> stuckDelayH, pushThetaThreshold (full negative range — the UI cannot reproduce the batch
> negative-zeroing defect; the executed manifest still proves executed values), kPush.

Divergence-register entry, §9.2 item 6, lines 811–813:

> Batch negative-`number` zeroing: unreproducible by construction (typed config); executed manifest
> still proves executed values; archived SE/SE2 executed pushThetaThreshold = 0.0 (surfaced in UI).

Backlog line, §0 table row (line 17):

> | pushThetaThreshold honesty note (archived executed 0.0 vs corrected −0.25) | delivery-first | §6.4, quirk ledger |

### 5.3 The never-regress gotcha — `websim/docs/PORT_MAP.md` §6.4 item 4, lines 699–703

> **Repast batch zeroes negative `"number"` constants** → use `"double"` (affected: alphaHazard,
> pushThetaThreshold; archived SE/SE2 manifests truthfully record executed
> pushThetaThreshold = 0.0 — inert, zero blockage events occurred). Port-transferable lesson:
> **emit an executed-parameter manifest distinct from the UI/preset config** so silent coercions
> (clamped slider, NaN parse) stay visible.

Parameter-table entry, `PORT_MAP` §2.7 line 389:

> | `pushThetaThreshold` | **double** (neg!) | −0.25 | −0.25 (executed 0.0 in archived runs — parser defect, inert) | −0.5…+1.0 | push iff θ_scaled ≥ threshold + kPush·(c_i + mobilityPenalty) (V51) |

Batch-format note, `PORT_MAP` §2.8 lines 394–397:

> Batch XML: `<parameter name type="constant" constant_type="int|number|double" value=.../>`.
> **Repast zeroes NEGATIVE `constant_type="number"` values** — negatives must be `"double"`
> (§6.7.4). Generator auto-promotes. Repast batch schema comes from the batch file, not
> parameters.xml — hence the defensive-fallback pattern.

### 5.4 The generator comment — `scripts/make_batch_params_E.py`, lines 113–122

```python
for pname, (ptype, pval) in params.items():
    # Repast's batch parser silently zeroes NEGATIVE constant_type="number"
    # values (probe-verified 2026-07-30: value="-0.25" executed as 0.0
    # while every positive came through; constant_type="double" executes
    # -0.25 correctly). Found by the pre-push audit; correction note in
    # 13-PHASE-E-PREDICTIONS.md.
    if ptype == "number" and str(pval).lstrip().startswith("-"):
        ptype = "double"
```

### 5.5 The band-anchored derivation the −0.25 comes from (for the preset tooltip)

`13-PHASE-E-PREDICTIONS.md` lines 171–182, verbatim:

> **pushThetaThreshold = −0.25 derivation (band-anchored arithmetic, not a fit to any simulation
> output):** the V51 empirical band says 55–75% of people who enter smoke continue through it
> (Wood 1972: 74% of movers; Bryan 1977: 70.1%; Jin 1997 dense smoke: 55%). For an UNBURDENED
> resident (c_i = 0, no mobility penalty) the rule gives P(push) = P(theta_i ≥ threshold) with
> theta_i ~ N(0, sigmaTheta² = 1); the band midpoint 0.60 ⇒ threshold = Φ⁻¹(0.40) ≈ −0.25. Burdens
> then RAISE the effective threshold (kPush = 1.0: a mobility-limited resident needs theta ≥ 0.75,
> P ≈ 0.23), so the population-level push share is predicted BELOW the unburdened 0.60 — the burden
> gradient is the falsifiable content, the band anchors only the unburdened intercept. kPush = 1.0
> and pStuck/stuckDelayH centrals remain declared assumptions (A-35).

### 5.6 What WP8 ships

1. **Presets:** SE and SE2 presets carry `pushThetaThreshold = −0.25` (the corrected, registered
   value). E0-null presets also carry −0.25, matching the archived nulls' code fallback.
2. **Executed manifest:** the engine emits its executed value independently of the preset config;
   any preset-vs-executed delta flips the badge to INVALID (§5.4 badge machine, risk W9).
3. **Quirk ledger + preset UI copy:** the §5.2 sentence, with the archived executed value **0.0**
   named explicitly, wherever a live SE/SE2 run is compared against an archived one.
4. **Archive-comparison rule:** when replaying an archived SE/SE2 bundle for byte-comparison, the
   engine must be driven from the **archived executed manifest** (`pushThetaThreshold = 0.0`), not
   from the preset (−0.25). At the archived configurations the two are indistinguishable because
   the parameter is never consulted (zero blockages) — but the port must not rely on that
   coincidence, and a test should assert the replay path reads the manifest.

---

## 6. Discrepancies, disagreements and open items

Reported per the task's instruction to give both numbers where sources disagree.

### 6.1 The negative-constant root cause is over-general as documented — evidence contradicts it

**Disagreement.** The correction note (§5.1) and the gotcha (§5.3) state the rule as *Repast zeroes
NEGATIVE `constant_type="number"` constants*, and name **both** `alphaHazard` and
`pushThetaThreshold` as affected. The archive says otherwise:

| evidence | value |
|---|---|
| `git show 495d845:Geography/batch/batch_params_2026_SE_E18_seed42.xml` | `alphaHazard … constant_type="number" value="-8.0"` and `pushThetaThreshold … constant_type="number" value="-0.25"` — **both** negative `"number"` at run time |
| `git show 257017d:…SE2_E18_d1_seed42.xml` | same two lines, same types |
| every archived manifest (60/60) | `"alphaHazard": -8.0` |
| every archived SE/SE2 manifest (48/48) | `"pushThetaThreshold": 0.0` |
| every archived E0-null manifest that has the block (6/6) | `"pushThetaThreshold": -0.25` (the **code fallback**; those batch files omit the SE block entirely) |

Both parameters are read through the identical `ContextCreator.doubleParam(parm, name, fallback)`,
neither is declared in `Geography.rs/parameters.xml` (which holds only 11 parameters and no E
params at all), and the fallbacks are `-8.0` and `-0.25` respectively — so "the parser dropped it
and the fallback applied" cannot explain `pushThetaThreshold = 0.0` either.

Behavioural corroboration that α really executed at −8.0: with α = 0.0 the logistic hazard would
fire for essentially everyone within hours, yet the realised attempt share among the aware is
0.478–0.502 over the window, which is what α = −8.0 implies.

**Conclusion:** the archived manifests are the authority (they record executed values), and they
say **alphaHazard executed as −8.0 while pushThetaThreshold executed as 0.0**. The documented
root-cause sentence describes a real defect but does not fully explain the observed pattern —
something about the two cases differs (magnitude ≥ 1? the position in the file? the batch schema
merge?) and the repo carries no committed probe artefact to settle it.

**Impact on WP8: none, provided the port does the right thing.** WP8 must (a) reproduce the archived
**executed** values as recorded (§1.8), (b) keep the safe rule (emit negatives as `"double"`), and
(c) ship the executed-manifest mechanism that made the defect visible. WP8 must **not** restate the
root cause more confidently than the evidence supports; if the quirk-ledger entry names
`alphaHazard` as affected, it should add that the archived manifests record `alphaHazard = -8.0`
executed. Settling the mechanism requires a Repast probe run, which writes into `Geography/output/`
and is therefore out of scope for this document.

### 6.2 Mean-dose figures: rounded vs unrounded

`13-PHASE-E-PREDICTIONS.md` P-SE7 quotes *"Mean dose 204,368–205,991 µg across every run"*.
Recomputed from the archive the range is **204,367.6 – 205,991.4 µg** (`score_scenarioE.py` rounds
to 1 dp). The doc's figures are the same numbers rounded to integers. No conflict; use the
unrounded values for gates and the doc's for prose.

### 6.2b Dose-ratio denominator is unstated in the predictions doc

P-SE7's "6.87–6.94× ER-A" is computed against **ER-A seed 42 only** (29,694.6 µg). Seed-matched it
is 6.868–6.892. P-SE2's "2.74–2.75×" is seed-matched (recomputed: 2.740–2.746). Both verdicts hold
either way; WP8 must pin the denominator explicitly in any gate it writes.

### 6.3 "24 closure runs" appears with three different referents

See §4.4 reconciliation. All three usages are internally correct; WP8 copy should say
**"all 24 closure runs (9 severe-v1 + 15 worst-v2)"** to remove the ambiguity.

### 6.4 `simulationHours` in the E0-null archive vs the SE archive

The `scenario-e/` and `scenario-e-v2/` E0-null runs use `simulationHours = 312` with
`smokeSeriesCode = 0` (576-slice observed file) — correct, and the reason the 456-vs-455 defect
never showed there. The SE/SE2 runs use 455 against 456 slices. A preset that pairs series 1/2 with
312 h is legal; one that pairs them with 456 h is not (`oor > 0` → INVALID).

### 6.5 `E19` capacity refusals are not identically zero

P-SE4 is registered for **E20** and holds exactly (0/0/0 at v1 and v2). `SE-E19-seed44` records
**2** capacity refusals and `SE2-E19-d1-seed44` / `SE2nc-E19-seed44` record **5**. A gate that
asserted "arms 19 and 20 both have zero capacity refusals" would be wrong; only E20 is zero.

### 6.6 Not verified here

- `analyze_run.py`'s 32 + 2n checks were not re-run (out of scope for this census; the plan already
  itemises its thresholds in §5.2 and `PORT_MAP` §6.2).
- `verify_2026_runs.py` was read but not executed: it reads `Geography/output/<arm>2026-n6842-seed*`,
  which is not part of the four archives this task covers.
- No Repast run was executed (that would write outside `websim/`), so §6.1 is left open rather than
  resolved.
- The `closures_E_r1_extreme` schedule (code 2, 34 edges, waves 79 and 150) has a committed report
  but no archived runs; WP8 can implement code 2 but has **no archived numbers to reproduce for it**.

---

## 7. WP8 acceptance checklist (derived from §§2–5)

| # | Criterion | Evidence to produce |
|---|---|---|
| 1 | **Tier-2 own-engine R3 byte-identity** (flagship) | TS E0-degenerate vs TS no-layer, codes 0/1/2, seed 42, 312 h: shared-column projection byte-identical under §2's exclusion discipline (`{sim_id, commit}` + wall-clock regex only; `*_local` columns **compared**); frames read as raw text with `keep_default_na` semantics; key-joined on `agent_id` / `shelter_id`; counters all-zero; `population.unaware == 0`; `sum(policy_refused) == 0` |
| 2 | **R3 closures-inert variant** | same, with the SE parameter block present and `closuresCode = 0` |
| 3 | **Stretch (free if Tier-1/4 hold):** TS E0-null agents projection hashes to `7d1e668c…` (A), `188beabf…` (B), `be84bc5f…` (C); shelters to `32451215…`, `041d36cb…`, `6d458751…` | §2.5 |
| 4 | **Gate (f)** Wachinger, ≥ 1 high-barrier resident still UNAWARE/PRE_EVAC | §3.1; archived n_high 226 → n_stay 195 at SE2-E18-d1-42 |
| 5 | **Gate (g)** 3 binomial SE + 1e-4, both sub-checks | §3.2; archived deltas table |
| 6 | **Gate (h)/(i)** 21 E params + 7 SE params + `closureDraw` iff code 3; `git_working_tree_dirty is False` (identity) | §3.3 |
| 7 | **Gate (j)** severe-series provenance, 456 slices, peak ±0.06, **oor == 0** | §3.3 |
| 8 | **Gate (k)** closure census vs schedule, all 7 sub-checks incl. `{"code"}`-only minimal block | §3.4 + the archived table |
| 9 | **Gate (l)** counter identities, row-wise, incl. the stuck-share 3 SE branch | §3.5 |
| 10 | **ER / SE / SE2 direction-of-effect reproduced** | §4.1–§4.3 tables; sheltered counts inside the archived per-config envelopes already digested in `websim/validation/golden-summaries/sheltered-envelopes.json` |
| 11 | **Measure-zero push result reproduced** at the six documented severities | §4.4; all four counters 0 at 24 closure runs |
| 12 | **Counter machinery proven able to fire** (anti-vacuity) | one non-archived overlap configuration with `n_push > 0` exercising (l.1)(l.2)(l.3) |
| 13 | **pushThetaThreshold honesty note wired** into SE/SE2 presets + quirk ledger; replay path reads the archived executed manifest (0.0), presets carry −0.25 | §5.6 |
| 14 | **Never-regress gotchas** still green | the V39 citation is Coughlan, Huber-Stearns, Clark & Deak 2022 (EWP Working Paper 111) and only that; no LA-wildfire severity-comparison phrasing (the v2 anchor is Canberra Florey 2,496.1 µg/m³, 5–6 Jan 2020); `simulationHours ≤ slices − 1` structurally enforced; negatives typed as `double` in any emitted batch file. The exact banned strings are enumerated in `docs/claims.yaml` — do not restate them here, the claim linter scans this file |

### Commands used to verify this document (2026-07-31, repo root `C:/Users/Chick/OneDrive/Desktop/reu`)

```
python scripts/verify_E_runs.py --null docs/runs/<archive>/E0null-<arm>-*seed42 \
                                --reference docs/runs/present-day-three-arm/<arm>-seed42
      # ran for all 8 archived null/reference pairs — all PASS, hashes in §2.5

python scripts/verify_E_runs.py --er docs/runs/phase-e/ER-A-n6842-seed42        # 11/11
python scripts/verify_E_runs.py --se docs/runs/scenario-e/SEnc-E18-seed42       # 19/19
python scripts/verify_E_runs.py --se docs/runs/scenario-e/SE-E18-seed42         # 24/24
python scripts/verify_E_runs.py --se docs/runs/scenario-e-v2/SE2-E18-d1-seed42  # 25/25

python scripts/score_scenarioE.py <all 9 ER + 18 SE/SEnc + 24 SE2/SE2nc run dirs>
      # regenerated every number in §4
```

Nothing outside `websim/` was created, modified or deleted; no git command other than
`git log` / `git show` was run.
