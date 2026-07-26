> **SUPERSEDED — HISTORICAL RECORD ONLY.** This document describes an earlier
> state of the model and does not reflect the final submission. For the current
> model and results see `docs/final/UPDATED_FINAL_RESULTS_REPORT.md` and the
> audits alongside it. Retained for provenance.

# Demonstration Run â€” Research Interpretation

First reproducible demonstration of the current model. This is a **software /
behavioural demonstration**, not a research finding; see "What can and cannot be
concluded" below.

## Run identity (reproducibility)

| Field | Value |
|---|---|
| sim_id | `sim-20260724-173258-seed42` |
| git commit | `556ab08e490c20cd73f00f8eb1bed8a1d70be240` |
| random seed | **42** |
| date/time run | 2026-07-24 17:32 (local) |
| data version tag | `0bc943324ae6` (hash of the 4 input-dataset SHA-256s) |
| datasets | Streets.shp (RLIS), AQS PM2.5 88502 Sept-2020, shelters_2020-09.csv, IRP campsite sample â€” SHA-256s in `simulation.json` |
| parameters | numAgents=50, minutesPerTick=1.0, walkingSpeedMps=1.30, evacuationThresholdUgM3=55.5, simulationHours=312 |

Reproduce: `randomSeed=42` in `batch_params.xml` at this commit â†’
`powershell -File scripts\run-headless.ps1`.

## What happened

50 residents were placed at real Portland encampment points and sheltered in
place until PM2.5 first crossed 55.5 Âµg/mÂ³ â€” which occurred on the **Sept-7
spike at tick 960 (2020-09-07 16:00)**; all 50 began evacuating then and walked
the shortest street path to the nearest operating shelter with room.

## Outcomes

| Outcome | Count |
|---|---|
| Reached a shelter (SHELTERED) | **49 / 50** |
| Failed to reach a shelter (UNREACHABLE) | **1 / 50** |
| Refused for capacity (REFUSED_ALL_FULL) | 0 |

Shelter assignment: **Oregon Convention Center 44**, **Charles Jordan 5**,
Mount Scott 0 (standby). Neither shelter's capacity (99) bound â€” combined
198 â‰« 50 â€” so there were **0 refusals**.

## Distributions

**Travel distance** (walked): median **4.2 km**, mean **19.1 km**, max
**68.3 km**. The distribution is heavily right-skewed â€” most residents are near
a shelter, a few start very far away.

**Travel time:** min **11 min**, median **56 min**, max **875 min (14.6 h)**.

**Cumulative PM2.5 exposure** (ÂµgÂ·mÂ³Â·h): median **225.8**, mean **1442.3**,
p25 195, p75 648, p90 650, **max 54,003**, **Gini 0.80**. The mean is ~6Ã— the
median because of one extreme value.

**Person-hours above "Unhealthy":** 326 across the 50 residents.

## Unexpected / notable behaviour

1. **One UNREACHABLE resident dominates exposure.** Its `cumulative_dose` is
   ~54,000 ÂµgÂ·mÂ³Â·h â€” roughly 240Ã— the median â€” because, unable to reach any
   shelter on the street graph, it stayed outdoors for the **entire 312-hour
   event** and accrued the full multi-day smoke episode. This single agent
   drives the mean (1442) far above the median (226) and inflates the Gini to
   0.80. This is correct behaviour and exactly the accessibility signal the
   model is meant to expose â€” but it means **mean exposure is not a robust
   summary here; report the median and the failure count.**
2. **Everyone evacuates at the Sept-7 spike, before shelters opened
   (Sept 10â€“11).** Residents who shelter quickly therefore miss most of the
   sustained Sept 10â€“18 smoke, so their absolute exposure understates the real
   event. (Known limitation â€” AUDIT.md #1.)
3. **A 68 km / 14.6 h walk** for the farthest resident is long enough to warrant
   a check of whether it reflects a genuinely remote start point or a
   street-graph detour (routing-validation item, VALIDATION_STRATEGY Â§2).

## What can and cannot be concluded from this run

**Can (software / behavioural):**
- The end-to-end pipeline runs reproducibly from real data and produces a
  complete, interpretable per-agent journey record.
- Accessibility is already discriminating: 1/50 could not reach any shelter, and
  travel distance/time vary by ~2 orders of magnitude across residents â€” a real,
  geography-driven equity signal.
- Relative comparisons among residents (who travels farther, who is exposed
  longer) are meaningful.

**Cannot (not yet research findings):**
- **No vulnerability conclusion.** `age`/`asthma`/`copd` are unimplemented and
  the RR multipliers are 1.0, so **VWE = raw exposure** and carries no
  vulnerability weighting. The project's central metric is not yet real.
- **Absolute exposure is not yet trustworthy** â€” it is set by the Sept-7
  evacuation-timing artefact and by the uniform smoke field.
- **No placement comparison** â€” only the status-quo map was run; strategy
  comparison is future work and must wait until the metric is valid.
- **Capacity/equity untested** at this scale (no refusals at n=50).

**Bottom line:** the model is a working, reproducible research *prototype* that
produces valid, interpretable *software* output. It is not yet producing
research conclusions about shelter placement or vulnerability. The immediate
priorities (AUDIT.md Â§5) are: resolve the RR citations (mentor), fix evacuation
timing, and scale the population so capacity binds â€” in that order â€” before any
placement-strategy experiments.

