# Metrics Data Dictionary

Every quantity written by the results pipeline
(`geography.output.OutcomeLogger`), with its meaning, calculation, units,
interpretation, limitations and supporting literature. Another researcher
should be able to use the exported files without reading the source code.

Output location: `Geography/output/run_seed<seed>/` — three files per run:
`agents.csv`, `shelters.csv`, `simulation.json`. The `output/` tree is
gitignored (results are regenerated, not versioned); reproduce any run from
its `simulation.json` manifest (seed + parameters + dataset checksums + git
commit).

Cross-references: [`DESIGN_SPEC.md`](DESIGN_SPEC.md) (variable specifications
V1–V17), [`VARIABLES.md`](VARIABLES.md), [`DATA_SOURCES.md`](DATA_SOURCES.md),
[`BIBLIOGRAPHY.md`](BIBLIOGRAPHY.md).

---

## 1. `agents.csv` — one row per resident

| Column | Units | Meaning & calculation | Interpretation / limitations |
|---|---|---|---|
| `agent_id` | — | Synthetic resident id (`Site N`). | Identity key. |
| `encampment_id` | — | `inc_id` of the real IRP campsite report this resident was placed at (D2b). | Traceable to a real Portland encampment point — but a 2025–26 report used as a 2020 proxy (see DATA_SOURCES D2b). |
| `start_node` | RLIS node id | Street-graph node the start location snapped to. | Reproducibility/debug. |
| `assigned_shelter` | — | Shelter id the resident is/was routed to (`` if none chosen). | The network-nearest operating shelter with space at selection. |
| `final_state` | enum | `SHELTERED` / `EN_ROUTE` / `UNREACHABLE` / `REFUSED_ALL_FULL` (V12, DESIGN_SPEC Decision 3). | Every resident ends in exactly one state; the full population is accounted for (no silent deletion). |
| `arrival_tick` | tick | Tick of admission (`` if never admitted). | ×`minutesPerTick` = simulated minutes to shelter. |
| `distance_traveled_m` | metres | Cumulative geodesic distance walked (V9). | Cost of access; en-route exposure accrues over this. Geodesic on WGS84 (Karney 2013). |
| `network_dist_to_shelter_m` | metres | Shortest-path street distance to the chosen shelter at selection (V11); `-1` if none. | "Nearest shelter you can actually reach" (slide 7). Dijkstra 1959. |
| `exposure_ugm3h` | µg·m⁻³·h | Σ over ticks of C_breathed·Δt (V6). | Raw cumulative exposure **index**, not an inhaled dose (no breathing rate / deposition). |
| `exposure_while_traveling_ugm3h` | µg·m⁻³·h | Exposure accrued only while `EN_ROUTE`. | The portion of exposure that shelter placement can actually change. |
| `vwe_ugm3h` | µg·m⁻³·h | Σ C_breathed·RR_age·RR_com·Δt (V7). | Vulnerability-weighted exposure. **Equals `exposure` until RR_age/RR_com are sourced** (both default 1.0; DATA_SOURCES D5/D6). |
| `hours_above_unhealthy` | hours | Σ Δt where C_breathed > 55.5 µg/m³ (V8). | Person-hours above the PM2.5 "Unhealthy" AQI concentration breakpoint — a concentration threshold, **not** the 24-h-average AQI category (DATA_SOURCES D9). |
| `peak_conc_ugm3` | µg/m³ | Maximum C_breathed experienced. | — |
| `age_rr` | dimensionless | RR_age applied (V2). | **1.0 = no age weighting** (unsourced; DATA_SOURCES D5). |
| `comorbidity_rr` | dimensionless | RR_com applied (V4). | **1.0 = no comorbidity weighting** (unsourced; DATA_SOURCES D6). |

## 2. `shelters.csv` — one row per shelter

| Column | Units | Meaning & calculation | Interpretation / limitations |
|---|---|---|---|
| `shelter_id`, `name` | — | Real Sept-2020 shelter (D1). | CJ, OCC operating; MSCC standby. |
| `lon`, `lat` | ° WGS84 | Geocoded coordinates (D1). | Census/Esri geocoders; see shelters CSV `coord_source`. |
| `capacity` | persons | Nightly capacity (`` = not capacity-limited). | **99 is newsroom-sourced, unconfirmed** (DATA_SOURCES D1). |
| `operating` | bool | In the active status-quo scenario. | Standby MSCC = false. |
| `peak_occupancy` | persons | Max simultaneous admitted residents. | With no departures modelled, equals final for a single event. |
| `final_occupancy` | persons | Residents admitted by end of run. | — |
| `refused_count` | count | Admission attempts refused for capacity. | 0 unless capacity binds (needs n_agents > total capacity). |
| `utilization` | fraction | `final_occupancy / capacity` (`` if uncapped). | Fraction of capacity used. |
| `mean_travel_dist_m_admitted` | metres | Mean `distance_traveled_m` of admitted residents. | Access cost borne by this shelter's users. |

**Not exported — and why:** *average exposure reduction per shelter* is a
**counterfactual** (exposure avoided versus not sheltering) and requires a
paired no-shelter baseline run; it is deliberately not fabricated from a single
run. Computing it is future work (a `--no-shelter` scenario differenced against
the status quo). With γ = 1.0 it would be identically zero regardless (V17).

## 3. `simulation.json` — run summary + reproducibility manifest

**`reproducibility`** — the spine that lets another researcher rerun exactly:
`random_seed`, `git_commit` (HEAD at run time), `java_version`,
`repast_version`, every `parameters` value, and `input_datasets` with a
**SHA-256 per input file**. A run is reproducible iff these match.

**`smoke_field`** — `county`, `start` (tick-0 wall clock), `hours` (slices),
`peak_hourly_ugm3`, and `out_of_range_lookups` (ticks beyond the data window,
which return 0 rather than a fabricated value — must be 0 for a clean run).

**`population`**:

| Field | Units | Meaning |
|---|---|---|
| `n_agents`, `sheltered`/`en_route`/`unreachable`/`refused_all_full` | count | Outcome census; the four states sum to `n_agents`. |
| `exposure_ugm3h.{mean,median,min,p25,p75,p90,max,total}` | µg·m⁻³·h | Distribution of raw exposure across residents. |
| `exposure_ugm3h.gini` | dimensionless [0,1) | **Gini of exposure (V14):** `ΣᵢΣⱼ|xᵢ−xⱼ| / (2n²x̄)`. 0 = everyone equally exposed; →(n−1)/n = maximally unequal. Under a uniform field with γ=1 this is 0 by construction — an honest reflection that location doesn't change exposure in that configuration, not a bug. |
| `vwe_ugm3h.{mean,median,total,gini}` | µg·m⁻³·h | Same for vulnerability-weighted exposure. Report both so equity claims are separable from the RR weighting assumption. |
| `total_person_hours_above_unhealthy` | person·hours | Σ over residents of `hours_above_unhealthy`. Headline burden metric (slide 6). |
| `travel_m.{mean,median,max}` | metres | Travel-distance distribution. |

**`shelters[]`** — per-shelter capacity, operating flag, peak/final occupancy,
refusals (mirrors `shelters.csv`).

---

## Interpretation guardrails (read before quoting any number)

1. **VWE is an exposure-burden index, not a health outcome.** Units µg·m⁻³·h.
   Converting to attributable cases needs a baseline incidence + a
   concentration–response function over matched averaging periods (F1).
2. **RR weighting is currently off** (RR_age = RR_com = 1.0), so `vwe` = raw
   `exposure` until the disputed slide citations are resolved (D5/D6). Any
   run with non-unit RRs prints a provenance warning.
3. **Shelter benefit is currently zero by construction** because the indoor
   protection factor γ (V17) is unsourced and defaults to 1.0. Absolute
   benefit magnitudes are meaningless until γ is sourced and swept; the model
   warns at startup.
4. **The smoke field is spatially uniform** (2 in-county monitors). Strategy
   differences therefore come only from travel/access, not from spatial
   exposure gradients, until IDW is justified by cross-validation (V5).
5. **Encampment locations are a 2025–26 proxy** for 2020 (D2b); the spatial
   distribution is real Portland data but temporally displaced.
6. **Capacity (99/site) is unconfirmed** (D1) and does not bind at n=100
   (2 × 99 > 100); raise `numAgents` above total capacity to exercise
   `REFUSED_ALL_FULL`.
