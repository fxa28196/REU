> **SUPERSEDED — HISTORICAL RECORD ONLY.** This document describes an earlier
> state of the model and does not reflect the final submission. For the current
> model and results see `docs/final/PRESENT_DAY_THREE_ARM_RESULTS.md` and the
> audits alongside it. Retained for provenance.

# OFFICIAL VALIDATED BASELINE â€” Wildfire-Smoke Shelter ABM

**This is the reference experiment every future model change and placement
strategy is compared against.** It was produced by the corrected, fully
validated street network; every exported value passed physical-reasonableness
verification (Â§6). Archived artifacts (exact copies of the run outputs):
`docs/runs/final-baseline/` â€” `agents.csv`, `shelters.csv`, `simulation.json`,
`summary.json`, `analysis-report.md`, `figures/`.

## 1. Exact model version & reproducibility

| Field | Value |
|---|---|
| **Simulation ID** | `sim-20260724-223555-seed42` |
| **Model git commit** | `ae66e63c11b3462e01e05e0509a6f7443aa54b8c` (pushed to `origin/main`) |
| **Random seed** | **42** (fixed; bit-for-bit reproducible â€” verified, Â§6) |
| Data version tag | `0bc943324ae6` |
| Platform | Repast Simphony 2.11.0 Â· Java 17.0.19 Â· Windows |
| Configuration file | `Geography/batch/batch_params.xml` (marked OFFICIAL BASELINE) |
| Parameters | `numAgents=50 Â· randomSeed=42 Â· minutesPerTick=1.0 Â· walkingSpeedMps=1.30 Â· shelterArrivalDistanceM=200 Â· evacuationThresholdUgM3=55.5 Â· simulationHours=312` |
| Run window | 2020-09-07 00:00 â†’ 2020-09-19 24:00 local (312 h, 18,720 ticks) |
| Analysis tooling | `scripts/analyze_run.py` v1.0.2 Â· `scripts/test_routing.py` v1.0.0 |

### Datasets (SHA-256 recorded in the manifest)

| Dataset | File | Note |
|---|---|---|
| Street network | `data/Streets.shp` (`f5e5e311b625â€¦`) | City of Portland RLIS centerlines, 112,070 features â†’ 89,345-node corrected graph (27 corrupt node IDs corrected at load; `docs/validation/STREET_NETWORK_VALIDATION.md`) |
| PM2.5 | `data/airnow/aqs_hourly_pm25_portland_2020-09.csv` (`d908556c347eâ€¦`) | EPA AQS param 88502, hourly, Multnomah mean; peak 562.7 Âµg/mÂ³ (Sep 13) |
| Shelters | `data/shelters/shelters_2020-09.csv` (`892b72500eeaâ€¦`) | Real Sept-2020 shelters: OCC + Charles Jordan operating (cap 99 each, newsroom-sourced), Mount Scott standby |
| Encampments | `data/encampments/irp_campsite_reports_sample.csv` (`3e557de5db46â€¦`) | Real City of Portland IRP campsite reports, **2025â€“26 spatial proxy** for 2020 |

## 2. Active assumptions

1. Evacuation triggers at the **first** county PM2.5 â‰¥ 55.5 Âµg/mÂ³ (EPA
   "Unhealthy") â€” tick 960, Sep 7 16:00, **before real shelter openings
   (Sep 10â€“11)**.
2. County-uniform hourly smoke field (2 in-county monitors; no gradient).
3. Walking only, constant 1.30 m/s (Bohannon 1997); all street centerlines
   routable (no freeway exclusion); no rests, perfect information.
4. Destination = network-nearest operating shelter with capacity; arrival ends
   exposure accrual (study endpoint; no indoor air modeled).
5. `age`/`asthma`/`copd` **not implemented** (empty columns);
   `age_rr = comorbidity_rr = 1.0` â†’ **VWE â‰¡ raw exposure** (no vulnerability
   weighting â€” deliberately deferred).

## 3. Population & shelter outcomes (n = 50 agents)

| Outcome | Value |
|---|---|
| Reached shelter | **49 / 50 (98%)** |
| Unreachable | 1 (Site 24 â€” start snaps to a disconnected graph component) |
| Refused (all full) | 0 (capacity never binds at n=50) |

| Shelter | Capacity | Final occupancy | Utilization | Refused | First arrival | Last arrival |
|---|---|---|---|---|---|---|
| Oregon Convention Center (OCC) | 99 | **43** | 43% | 0 | Sep 7 16:11 | Sep 7 19:32 |
| Charles Jordan CC (CJ) | 99 | **6** | 6% | 0 | Sep 7 16:21 | Sep 7 17:10 |
| Mount Scott CC | standby | 0 | â€” | 0 | â€” | â€” |

## 4. Travel statistics (arrived agents, n = 49)

| Metric | Mean | Median | Max |
|---|---|---|---|
| Travel time | 79 min | 49 min | 212 min (3.5 h) |
| Distance walked | 6.2 km | 3.9 km | 16.5 km |
| Effective speed | â€” | â€” | 1.300â€“1.365 m/s (all agents) |
| Shortest-path circuity (sampled) | â€” | â€” | 0.99â€“1.51 |

## 5. PM2.5 exposure statistics (all 50 agents)

| Metric | Value |
|---|---|
| Cumulative dose (ÂµgÂ·mâ»Â³Â·h) | mean 1330.8 Â· median 215.5 Â· p25 194.2 Â· p75 307.0 Â· p90 396.1 Â· max 54,002.8 Â· total 66,538.0 |
| Exposure Gini | **0.82** (driven by the one UNREACHABLE agent: 54,003 vs sheltered max 449) |
| Person-hours above Unhealthy | 259.0 total (mean 5.2 h/agent; 194.0 h of it the unreachable agent) |
| Mean dose split | 1,224 waiting pre-evacuation + 107 traveling/stranded |
| VWE | â‰¡ exposure (placeholder RRs = 1.0) |
| Travel time â†” dose (sheltered) | Pearson r = 0.997, Spearman Ï = 1.00 â€” structural under a uniform field |

Figures: `final-baseline/figures/` (travel-time & distance histograms, exposure
distribution, ranked exposure by agent, shelter utilization â€” each stamped with
sim ID, seed, commit, data version, analysis timestamp).

## 6. Physical-reasonableness verification â€” ALL PASS

| Quantity | Check | Result |
|---|---|---|
| Walking speed | every arrived agent's distance Ã· time within Bohannon 1997 bounds | 1.300â€“1.365 m/s âœ” |
| Distance | walked â‰¡ encampment-snap gap + shortest-path length (â‰¤ 80 m tol) | max error 8.9 m âœ” |
| Travel time | consistent with distance at 1.30 m/s; max 3.5 h plausible for 16.5 km | âœ” |
| Exposure integration | dose, hours>Unhealthy and peak **recomputed independently from the raw AQS CSV** (hourly Multnomah mean, Î£ cÂ·Î”t to arrival) | **exact match, max difference 0.0** for all 50 agents âœ” |
| Shelter assignment | independent Dijkstra reproduces exported network distances (nearest-shelter choice); occupancy reconciles across all three files | exact agreement âœ” |
| Graph integrity | zero impossible-span edges; connectivity unchanged by correction | 0 (legacy 50) âœ” |
| File consistency | `analyze_run.py` cross-checks | 37/37 âœ” |
| Determinism | full re-run at seed 42 reproduces `agents.csv` **bit-for-bit** (excluding sim_id/commit stamps) | identical âœ” |

Re-verify any time:
```powershell
powershell -File scripts\run-headless.ps1     # re-runs the baseline config
python scripts\analyze_run.py Geography\output\run_seed42
python scripts\test_routing.py Geography\output\run_seed42
```

## 7. Limitations (carried into every comparison against this baseline)

1. **Evacuation timing artifact:** all agents evacuate on the brief Sep-7
   spike, before real shelters opened (Sep 10â€“11) â†’ absolute doses
   underestimate the sustained episode; the tracked refinement is to gate
   evacuation on shelter operating dates.
2. **VWE carries no vulnerability signal** (RRs = 1.0 until citations are
   resolved with the mentor).
3. **Encampment locations are a 2025â€“26 spatial proxy** (no 2020 open data).
4. **Uniform smoke field** â€” no intra-county gradient (2 monitors).
5. **Shelter capacity (99) newsroom-sourced**, unconfirmed; capacity never
   binds at n=50 (real event: ~2,037 unsheltered / ~198 beds).
6. **Single seed** â€” no across-seed variability band yet (n=100 replicate at
   seed 1776194289 shows consistent behavior).
7. Freeways routable for pedestrians; dangling corrected stub nodes possible
   (`STREET_NETWORK_VALIDATION.md` Â§5); one agent's encampment snaps 213 m
   off-network (walked as a straight first leg).

**Comparison protocol for future experiments:** run with modified
code/parameters, keep seed 42 (plus added seeds), then compare against
`sim-20260724-223555-seed42` on: arrival rate, travel time/distance
distributions, cumulative exposure distribution + Gini, person-hours above
Unhealthy, and per-shelter occupancy/refusals. Any change to inputs must show
up as a different `data_version_tag`; any change to code as a different
`git_commit`.

