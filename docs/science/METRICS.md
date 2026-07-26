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
V1–V16), [`VARIABLES.md`](VARIABLES.md), [`DATA_SOURCES.md`](DATA_SOURCES.md),
[`BIBLIOGRAPHY.md`](BIBLIOGRAPHY.md).

---

## 1. `agents.csv` - one row per resident

**46 columns, verified against the shipped file at commit `b69fc6d`.**

| Column | Meaning |
|---|---|
| `agent_id` | Synthetic resident id. |
| `sim_id` | Run identifier. |
| `commit` | Model git commit that produced the run. |
| `random_seed` | RNG seed. |
| `data_version` | Composite hash of the four model input datasets. |
| `starting_encampment` | `inc_id` of the real campsite report this resident was placed at (D2b). |
| `shelter_reached` | Shelter id admitted to (blank if never admitted). |
| `reached_shelter` | yes / no. |
| `time_started_tick` | Tick of departure. |
| `time_started_local` | Local time of departure (Local Standard Time; see L13). |
| `time_arrived_tick` | Tick of admission. |
| `time_arrived_local` | Local time of admission. |
| `travel_time_min` | Elapsed minutes from departure to admission. **Includes any wait** for a second shelter to open; not pure walking time. |
| `total_travel_distance_m` | Geodesic metres actually walked along street paths (V9). |
| `network_dist_to_shelter_m` | Network distance from the START node to the FIRST selected shelter (V11). |
| `avg_pm25_ugm3` | Mean PM2.5 experienced while outdoors. |
| `peak_pm25_ugm3` | Maximum PM2.5 experienced. |
| `cumulative_dose_ugm3h` | **Exposure** (V6): sum of C(t)*dt. A concentration-time index, NOT an inhaled mass (A-15). |
| `exposure_while_traveling_ugm3h` | Exposure accrued only while EN_ROUTE. |
| `vwe_ugm3h` | Exposure Burden Index (V7). **Identical to `cumulative_dose_ugm3h`** while RR weights are 1.0 (A-09). |
| `hours_above_unhealthy` | Hours outdoors with C > 55.5 ug/m3 (V8). |
| `age` | Sampled age (duplicate of `age_years`; retained for schema stability). |
| `asthma` | Asthma flag (duplicate of `asthma_flag`). |
| `copd` | COPD flag (duplicate of `copd_flag`). |
| `age_rr` | RR_age applied. **Always 1.0** (V2, placeholder). |
| `comorbidity_rr` | RR_comorbidity applied. **Always 1.0** (V4, placeholder). |
| `final_state` | SHELTERED / REFUSED_ALL_FULL / UNREACHABLE / EN_ROUTE / PRE_EVAC. |
| `planned_route_m` | Sum of network lengths of all planned legs (QC). |
| `snap_gap_m` | Off-network metres from the resident to each leg's first waypoint (QC). |
| `door_refusals` | Refusals recorded at a shelter door. **Under-reports** - resets on waiting-state re-entry; use `shelters.csv refused_count` for totals. |
| `scenario` | `A_placement_current`, `B_placement_optimized`, or the historical reference. |
| `walking_speed_mps` | This resident's comfortable gait speed (V10 revised). |
| `age_years` | Sampled age in years (V18). |
| `age_band` | PIT age band (V18). |
| `sex` | MALE / FEMALE / OTHER (V19). |
| `mobility_limited` | 0/1 mobility limitation (V20). |
| `mobility_category` | Movement-speed class applied (V20). |
| `asthma_flag` | 0/1 diagnosed asthma (V21a). |
| `copd_flag` | 0/1 diagnosed COPD (V21b). |
| `any_respiratory` | asthma OR copd. |
| `vulnerable_flag` | 55+ OR mobility-limited OR asthma OR COPD. A reporting stratum, **not** a risk score. |
| `air_volume_breathed_m3` | Total air volume breathed outdoors, m3 (V25). |
| `mean_ventilation_m3h` | Realised mean ventilation rate; makes the dose auditable. |
| `inhaled_dose_ug` | **Inhaled dose** (V25): sum of C(t)*IR(activity)*dt, micrograms. Activity-weighted, NOT health-weighted. |
| `health_risk_multiplier` | Susceptibility weight. **Always 1.0** by design (HEALTH_MODEL_AUDIT). |
| `health_risk_score` | inhaled_dose * risk multiplier. Identical to inhaled dose while the weight is 1.0. |

> **Exposure, dose and risk are three different quantities** and are never
> multiplied together by accident. See `docs/final/HEALTH_MODEL_AUDIT.md`.
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
the status quo), now well-defined since exposure ends at arrival.

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
| `exposure_ugm3h.gini` | dimensionless [0,1) | **Gini of exposure (V14):** `ΣᵢΣⱼ|xᵢ−xⱼ| / (2n²x̄)`. 0 = everyone equally exposed; →(n−1)/n = maximally unequal. Now driven by travel-time inequality (exposure ends at arrival), so it is > 0 and discriminating (0.091 in the final placement runs). Its meaning will shift again once vulnerability weighting and realistic evacuation timing land. |
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
3. **Shelter benefit = reduced outdoor exposure time.** Exposure stops at
   shelter arrival (the study endpoint); a better-placed / more-accessible
   shelter lowers exposure by ending outdoor time sooner. Indoor air quality is
   out of scope (γ removed; AUDIT.md §0).
3b. **Departure is gated on the real shelter opening dates.** Residents depart
   2020-09-10 07:00, the first PM2.5 threshold crossing after the Oregon
   Convention Center opened. The earlier Sept-7 departure artefact is
   resolved (A-02 mitigated).
4. **The smoke field is spatially uniform** (2 in-county monitors). Strategy
   differences therefore come only from travel/access, not from spatial
   exposure gradients, until IDW is justified by cross-validation (V5).
5. **Encampment locations are a 2025–26 proxy** for 2020 (D2b); the spatial
   distribution is real Portland data but temporally displaced.
6. **Capacity (99/site) is unconfirmed** (D1) and does not bind at n=100
   (2 × 99 > 100); raise `numAgents` above total capacity to exercise
   `REFUSED_ALL_FULL`.
