# Run analysis — `sim-20260725-220529-seed43`

## Reproducibility

| Field | Value |
|---|---|
| Simulation ID | `sim-20260725-220529-seed43` |
| Random seed | `43` |
| Model git commit | `83d721b7e796a803ae86e8942531b7f7e03db038` |
| Data version tag | `0bc943324ae6` |
| Run generated (UTC) | 2026-07-25T22:05:34.989472200 |
| Parameters | `{"numAgents": 2037, "minutesPerTick": 1.0, "walkingSpeedMps": 1.3, "shelterArrivalDistanceM": 200.0, "simulationHours": 312, "randomSeed": 43}` |
| Analysis script | `scripts/analyze_run.py` v1.1.0 |
| Analysis git commit | `83d721b7e796a803ae86e8942531b7f7e03db038` |
| Analysis generated (UTC) | 2026-07-26T02:06:06Z |

Input datasets (SHA-256):

- `data/Streets.shp` — `f5e5e311b625f129f94fcf6d3150f8feb521ea5a79039ade43514ebfb35810a8`
- `data/airnow/aqs_hourly_pm25_portland_2020-09.csv` — `d908556c347ecdf68342ce859b1c56813cc606f695804c0ba71992604486ca08`
- `data/shelters/shelters_2020-09.csv` — `892b72500eeaa34005c8ae00f9abb5bdba639e463f505b2794e3231e1801b302`
- `data/encampments/irp_campsite_reports_sample.csv` — `3e557de5db4668c5d30fd7a6fc13bcc38b5e37bab4b9becaf9b3dc35366285ca`

## Verification — 38/38 checks passed

agents.csv, shelters.csv and simulation.json are mutually consistent (row counts, outcome census, per-shelter occupancy, exposure/VWE/travel statistics recomputed from raw rows match the manifest).

## Summary statistics

| Metric | Value |
|---|---|
| Total agents | 2037 |
| Successful shelter arrivals | 198 (10%) |
| Failed arrivals | 1839 {'REFUSED_ALL_FULL': 1820, 'UNREACHABLE': 19} |
| Travel time (arrived) | mean 23 min · median 16 min · max 48 min (0.8 h) |
| Travel distance (arrived) | mean 1.8 km · median 1.3 km · max 3.7 km |
| Cumulative PM2.5 exposure (µg·m⁻³·h) | mean 48771 · median 54003 · p90 54003 · max 54003 · Gini 0.10 |
| VWE (µg·m⁻³·h) | mean 48771 · Gini 0.10 — **placeholder: identical to exposure (RRs = 1.0)** |
| Person-hours above Unhealthy (55.5 µg/m³) | 356844 total · mean 175.2 h/agent |
| Mean dose split | 48614 waiting pre-evac + 157 traveling/stranded |
| Capacity refusals | 1820 agents refused ≥1× (0 later sheltered) · 2378 door refusals total · max 2 per agent |

## Shelter statistics

| Shelter | Operating | Capacity | Final occ. | Unused | Refused | First arrival | Last arrival |
|---|---|---|---|---|---|---|---|
| Charles Jordan Community Center (CJ) | yes | 99 | 99 | 0 | 656 | 2020-09-07T16:04 | 2020-09-07T16:48 |
| Oregon Convention Center (OCC) | yes | 99 | 99 | 0 | 1722 | 2020-09-07T16:02 | 2020-09-07T16:16 |
| Mount Scott Community Center (MSCC) | standby | — | 0 | — | 0 | — | — |

## Exposure analysis

**Highest-exposure agents:**

| Agent | State | Shelter | Dose (µg·m⁻³·h) | Travel (min) | h > Unhealthy |
|---|---|---|---|---|---|
| Site 0 | REFUSED_ALL_FULL | — | 54003 | — | 194.0 |
| Site 1 | REFUSED_ALL_FULL | — | 54003 | — | 194.0 |
| Site 2035 | REFUSED_ALL_FULL | — | 54003 | — | 194.0 |
| Site 2034 | REFUSED_ALL_FULL | — | 54003 | — | 194.0 |
| Site 17 | REFUSED_ALL_FULL | — | 54003 | — | 194.0 |

**Lowest-exposure agents:**

| Agent | State | Shelter | Dose (µg·m⁻³·h) | Travel (min) | h > Unhealthy |
|---|---|---|---|---|---|
| Site 940 | SHELTERED | OCC | 150 | 2.0 | 0.1 |
| Site 1633 | SHELTERED | OCC | 152 | 4.0 | 0.1 |
| Site 1217 | SHELTERED | CJ | 152 | 4.0 | 0.1 |
| Site 429 | SHELTERED | CJ | 152 | 4.0 | 0.1 |
| Site 630 | SHELTERED | OCC | 155 | 6.0 | 0.1 |

**Travel time vs exposure (arrived agents, n=198):** Pearson r = 1.0, Spearman rho = 1.0. Structurally near-deterministic: with a county-uniform smoke field and simultaneous evacuation, dose differences among sheltered agents are driven almost entirely by time outdoors (= travel time).

## Routing/data integrity flag

Reference: planned_route_m + snap_gap_m (per-leg, refusal-aware).

All routed agents walked ≈ their planned route (surplus ≤ 200 m). No detour artifact detected (A-17 failing check passed).

## Figures

![fig1_travel_time_hist.png](figures/fig1_travel_time_hist.png)
![fig2_travel_distance_hist.png](figures/fig2_travel_distance_hist.png)
![fig3_exposure_distribution.png](figures/fig3_exposure_distribution.png)
![fig4_exposure_by_agent.png](figures/fig4_exposure_by_agent.png)
![fig5_shelter_utilization.png](figures/fig5_shelter_utilization.png)
