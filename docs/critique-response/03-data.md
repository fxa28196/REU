# Critique response 03 — DATA and NETWORK claims

Scope: six claims about the PM2.5 monitor file, the street graph, campsite
weighting, the Street Roots calibration, and shelter opening dates. Every number
below was recomputed from the primary files on this branch
(`phase2/human-agent-modeling`, runs `{A,B,C}2026-n6842-seed42`).

Verdict summary: **2 claims correct, 1 correct-but-misleading, 3 wrong.**
Two of the wrong ones are material and require doc edits before submission.

---

## 1. Monitor count reconciliation — CORRECT, with one mislabeled inference

Recomputed from `Geography/data/airnow/aqs_hourly_pm25_portland_2020-09.csv`:

| Quantity | Value |
|---|---|
| Total rows | **4,795** |
| Distinct monitors (State+County+Site+POC) | **7** (all POC=3, all parameter 88502) |
| Rows by county | Washington 2,183 / Multnomah 1,454 / Clackamas 1,158 |
| Multnomah monitors | **2** — `41-051-0080` (45.4966, −122.6029) and `41-051-2011` (45.5622, −122.5757) |
| Rows carrying `IT` | **1,576** |
| `IT` date span | **2020-09-07 → 2020-09-19** (exactly the study window) |
| `IT` monitors | **7**, across **all three counties** (WA 792 / MU 526 / CL 258) |

- "4,795 rows" — **correct** (`TECHNICAL_REFERENCE.md:164`, `SMOKE_FIELD_AUDIT.md:41`).
- "two in-county monitors" — **correct** (`TECHNICAL_REFERENCE.md:1020`,
  `SMOKE_FIELD_AUDIT.md:19`). Exactly two Multnomah monitors, 728 and 726 rows.
- "IT qualifier on 1,576 rows spanning exactly this window" — **correct as
  written** (`TECHNICAL_REFERENCE.md:195`, `SMOKE_FIELD_AUDIT.md:57`,
  `presentation/index.html:202`).

**The critique's 1,576 / 312 = 5.05 arithmetic resolves to 7 monitors, not 2.**
The non-integer ratio is not evidence of an error; it is 7 tri-county monitors
with partial hourly coverage (1,576 rows over 290 distinct clock hours).

**However** the sentence is *rhetorically* misleading in
`PRESENTER_SCRIPT.md:99`, which presents 1,576 as the certification of the data
the model consumes. The smoke field consumes **only Multnomah rows**
(`SmokeField.java:54` filters `County Name == "Multnomah"`), so only **526** of
those 1,576 IT rows ever reach the model. Recommend the presenter line say
"1,576 rows across the seven-monitor tri-county file, 526 of them on the two
Multnomah monitors the field actually uses."

## 2. Hourly coverage 7–19 Sep — the varying-instrument-set concern is real but negligible

Replicating `SmokeField`'s filter over hour indices 0–311 (2020-09-07 00:00 →
2020-09-19 23:00):

| Monitors reporting | Hours |
|---|---|
| 2 | **310** |
| 1 | **2** |
| 0 (NaN) | **0** |

- Composition changes on **2 of 311 hour-to-hour transitions**. The only
  non-full composition is `{0080}` alone at hour indices **20 and 21**
  (2020-09-07 20:00 and 21:00), i.e. site `2011` is missing two hours at the
  very start of the window.
- **No hour near the peak is single-monitor.** Peak is hour 140
  (2020-09-12 20:00) at **562.7 µg/m³** with **both** monitors present. Of the
  30 smokiest hours, **0** are single-monitor.

So yes, `SmokeField.java:81-93` computes an unweighted mean over a *nominally*
varying instrument set — but the set is constant for 310/312 hours and the two
exceptions carry pre-smoke background values. **The critique is technically
right and practically immaterial.** One clarifying footnote is warranted; no
number changes.

(Note: `hourlyUgM3` is 576 slices long because the file runs to 2020-09-30; the
run is bounded to 312 by `simulationHours`, confirmed in every manifest.)

## 3. Graph components — **THE DOCS ARE WRONG. This is the material finding.**

`scripts/test_routing.py build_graphs()` on `Geography/data/Streets.shp`:

```
features 112,070 | nodes 89,345 | components 154
component sizes: 60444, 28407, 19, 12, 12, 11, 11, 9, 8, 8, 8, 7, ...
```

**It is NOT "1 giant + 153 tiny."** The second component holds **28,407 nodes
(31.8% of the graph)**. The largest component holds only **67.65%** of nodes;
**32.35% (28,901 nodes) are off it.**

This makes the following sentence false as written:

> `PRESENTER_SCRIPT.md:300` / `PRESENTER_SCRIPT_REFORMAT.html:222`
> "The main piece holds 60,444 of the 89,322 intersections; **the rest are
> small fragments.**"

The rest are not small fragments. 28,407 of the 28,901 off-giant nodes are a
single second component. `TECHNICAL_REFERENCE.md:804` and
`presentation/index.html:435` report "154 / 60,444" without the second
component, which is incomplete rather than false, but reads the same way.

**It is worse than a wording problem: the model does not route on the 60,444-node
component.** Component geography:

| Rank | Size | lon range | lat range | Identity |
|---|---|---|---|---|
| 0 | 60,444 | −123.46 … −121.65 | 44.89 … 45.81 | regional / out-of-county sprawl |
| 1 | **28,407** | −122.84 … −122.47 | 45.43 … 45.65 | **Portland urban core** |

Snapping the real inputs to nodes:

- **33 of 36** arm-A shelters snap to component **rank 1**, not rank 0.
- **3,382 of 3,400** campsite rows snap to component **rank 1**.
- So **the operational graph is the 28,407-node second component**, and the
  "main piece" the docs advertise is the one the simulation barely touches.

**Out-of-county streets are included.** Node bounding box spans
lon −123.4857 … −121.6496, lat 44.8855 … 45.8121 — far beyond Multnomah
(≈ −122.93 … −121.90, 45.42 … 45.73). Only **58,275 of 89,345 nodes (65.2%)**
fall inside a rough Multnomah box.

### Consequence: three real shelters are stranded off the demand component

`Gresham_Womens_Shelter`, `Rockwood_Bridge_Shelter` and
`Stark_Street_Motel_Shelt` all snap to component rank 0 in **all three** arms.
Capacity stranded on a component holding 8 of 3,400 campsite rows:

| Arm | Stranded capacity | Of total |
|---|---|---|
| A | **196** | 2,234 |
| B | **600** | 6,842 |
| C | **294** | 6,842 |

Confirmed in the run outputs: `Gresham_Womens_Shelter` has
**peak_occupancy 0, utilization 0.0000 in A, B and C** — the only zero-occupancy
shelter in every arm. `Rockwood_Bridge_Shelter` reaches 3/52 and
`Stark_Street_Motel_Shelt` 19/54 in arm A, served by the handful of agents that
also snapped to rank 0.

This is a *defensible* modelling artifact (a real pedestrian cannot walk the
Gresham–Portland gap in this centreline file), but it is currently undisclosed.
Arm A's 2,060/2,234 headline occupancy is partly a topology result: 196 of the
174 unfilled spaces sit on an unreachable component.

**The "16 unreachable" explanation is mechanically correct**: 18 of 3,400
campsite rows sit off rank 1, and exactly **16** agents land there in each
6,842-draw (A, B and C all report `UNREACHABLE: 16`). The mechanism is right;
the topology sentence around it is wrong.

### Minor: the node count in the docs is stale

Measured **89,345**. `TECHNICAL_REFERENCE.md:242,704,1702`,
`presentation/index.html:370,375` and `PRESENTER_SCRIPT.md:244` all say
**89,322** — a 23-node discrepancy. `docs/critique-response/01-arithmetic.md:279`
already carries the correct 89,345, so the docs are internally inconsistent.

## 4. Campsite weighting — the docs describe a de-duplication that does not exist

`ContextCreator.java:288-290`:

```java
for (int i = 0; i < numAgents; i++) {
    int idx = campCoords.isEmpty() ? -1 : RandomHelper.nextIntFromTo(0, campCoords.size() - 1);
    Coordinate coord = (idx < 0) ? new Coordinate(0, 0) : campCoords.get(idx);
```

`campCoords` is built one entry per **CSV row** (`ContextCreator.java:275-280`),
with no de-duplication anywhere in the class. So residents are drawn
**uniformly with replacement over the 3,400 campsite report ROWS** — which means
placement **is** implicitly weighted by report frequency.

The weighting is weak but not nil:

| Level | Count |
|---|---|
| CSV rows | 3,400 |
| Distinct `inc_id` | 3,400 |
| Distinct (lon,lat) | **3,317** |
| Distinct snapped graph nodes | **2,492** |

Coordinate multiplicity: 3,244 points appear once, 64 twice, 8 three times,
1 four times. **At the coordinate level the weighting is negligible.** But at
the level the model actually uses — the snapped start node — multiplicity runs
to **7 rows on one node** (1,861 nodes ×1, 432 ×2, 144 ×3, 40 ×4, 8 ×5, 6 ×6,
1 ×7). The demand surface the optimiser targets is therefore
**row-frequency-weighted over 2,492 distinct start nodes**, not uniform over
distinct places.

**The "2,981 distinct campsite points" figure is not a property of the data
file.** It is the number of distinct `inc_id` values that happen to be *drawn*
in a 6,842-agent run — verified directly: `A2026-n6842-seed42/agents.csv` has
**2,981** distinct `starting_encampment` and **2,918** distinct
`(start_lon,start_lat)`. This matches the coupon-collector expectation
3,400·(1−e^−2.012) ≈ 2,945. It is a sampling outcome, not a de-duplicated
location count.

That makes this claim false:

> `PRESENTER_SCRIPT.md:177` / `PRESENTER_SCRIPT_REFORMAT.html:145`
> "**2,981 distinct real locations.** Those come from 3,400 City of Portland
> campsite reports — fewer locations than reports **because the same camp gets
> reported more than once, so we de-duplicate to distinct places.**"

No de-duplication is performed. The file contains 3,317 distinct coordinates,
not 2,981, and duplicate reports explain only 83 of the 419 shortfall — the
other 336 is sampling. Same wording in `presentation/index.html:254,859`,
`TECHNICAL_REFERENCE.md:278`, `PRESENT_DAY_THREE_ARM_RESULTS.md:145,177` and
`docs/archive/chapter-v0-...tex:181` ("3,400 points; 2,981 used" — this one is
correct and should be the model for the others).

## 5. Street Roots calibration is censored — **the critique is right**

`histref-n2037-seed42` (scenarioCode → `shelters_2020-09.csv`, CJ 99 + OCC 99):

| shelter | capacity | peak_occ | utilization | refused_count |
|---|---|---|---|---|
| CJ | 99 | 99 | **1.0000** | 1,824 |
| OCC | 99 | 99 | **1.0000** | 1,923 |

Agent final states, n = 2,037:

| state | n |
|---|---|
| SHELTERED | **198** |
| REFUSED_ALL_FULL | **1,824** |
| UNREACHABLE | 15 |

Both sites are pinned at utilization exactly 1.0000. **198 is a hard ceiling,
not an equilibrium.** The model's *unconstrained* demand at those two sites is
**2,022 agents** (198 sheltered + 1,824 who reached a full door; 99.3% of the
2,037 population — every agent except the 15 stranded off-component).

The reported figure is therefore a censored lower bound:

| | value |
|---|---|
| Observed (Street Roots, 2020-09-16) | ~130 of 198 |
| Model, **capacity-censored** | 198 → **1.52×** |
| Model, **unconstrained demand** | 2,022 → **15.6×** |

`TECHNICAL_REFERENCE.md:2130`, `CLAIM_VALIDATION_AUDIT.md:119`,
`FINAL_DATA_VALIDATION_REPORT.md:307`, `presentation/index.html:726` and
`chapter/SUBMIT.md:227` all report **1.52× as a point estimate**. It should be
reported as a bracket: **over-prediction is between 1.52× and 15.6×, and 1.52×
is the number you get only because the doors ran out.**

This strengthens rather than weakens the paper's own conclusion (assumption A-12,
universal shelter awareness, ⇒ every access figure is an upper bound) — but the
current phrasing understates the size of that upper bound by an order of
magnitude.

## 6. Opening dates — the doc claim is true for the calibration run and FALSE for all three study arms

Every 2026 inventory row carries **`opened=2020-09-07`, `closed=2020-09-19`,
`status=operating`** — verified across all three files:

| file | rows | opened | closed |
|---|---|---|---|
| `shelters_2026_current_placement.csv` | 36 | 2020-09-07 ×36 | 2020-09-19 ×36 |
| `shelters_2026_expanded_capacity.csv` | 36 | 2020-09-07 ×36 | 2020-09-19 ×36 |
| `shelters_2026_expanded_plus_new_sites.csv` | 46 | 2020-09-07 ×46 | 2020-09-19 ×46 |

`ContextCreator.java:111` sets `SIM_START = 2020-09-07T00:00`, and
`tickForDate()` (`:377-386`) returns hours-since-`SIM_START` × ticksPerHour.
So `opened=2020-09-07` evaluates to **tick 0 for every facility**.

The gate itself is **ON**: `respectShelterOpeningDates = 1` in the manifests of
all 27 arm runs. But it is a **no-op** for A/B/C — all 36 (or 46) facilities are
open from hour 0.

The real 2020 activation dates exist only in `shelters_2020-09.csv`:
OCC `opened=2020-09-10`, CJ `opened=2020-09-11`, MSCC `standby` — and that file
is loaded **only** by the historical reference run
(`ContextCreator.java:141-144`, scenarioCode 3), not by any study arm.

**Verdict:** 2020 activation dates are **not** applied to the 2026 facilities.
Any doc sentence implying the three arms honour "OCC 10 Sep, CJ 11 Sep" is
describing the calibration run and must not be carried over to A/B/C.

### Incidental defect found while settling #6

`histref-n2037-seed42/simulation.json` logs `"scenarioCode": 2` while
`"scenario": "HISTORICAL_capacity_reference_not_a_scenario"`. Under current
`ContextCreator.java:138-140`, code 2 maps to arm C. The archived run is
self-consistent (`git show 02c3181` has code 2 → HISTORICAL at line 123-125) —
the mapping was renumbered afterwards, and
`docs/architecture/V1.0_STABILIZATION_REPORT.md:47` records the change. **The
run is valid; the manifest is not re-runnable against current code.** Anyone
re-running the calibration today must pass `scenarioCode=3`.

---

## Required doc edits

| Priority | File:line | Change |
|---|---|---|
| **HIGH** | `PRESENTER_SCRIPT.md:300`, `PRESENTER_SCRIPT_REFORMAT.html:222` | "the rest are small fragments" is false — second component is 28,407 nodes and is where the model actually runs |
| **HIGH** | `TECHNICAL_REFERENCE.md:2130`, `CLAIM_VALIDATION_AUDIT.md:119`, `FINAL_DATA_VALIDATION_REPORT.md:307`, `presentation/index.html:726`, `chapter/SUBMIT.md:227` | report 1.52× as a censored bound; add the 15.6× unconstrained figure |
| **HIGH** | new disclosure | 3 shelters (196/600/294 spaces in A/B/C) sit off the demand component; `Gresham_Womens_Shelter` is 0% utilized in every arm |
| **MED** | `PRESENTER_SCRIPT.md:177`, `presentation/index.html:254,859`, `TECHNICAL_REFERENCE.md:278`, `PRESENT_DAY_THREE_ARM_RESULTS.md:145,177` | remove "we de-duplicate"; 2,981 is a sampling outcome, file has 3,317 distinct coords |
| **MED** | any doc implying A/B/C honour 2020 opening dates | all 36/46 facilities open at tick 0 |
| **LOW** | `TECHNICAL_REFERENCE.md:242,704,1702`, `presentation/index.html:370,375`, `PRESENTER_SCRIPT.md:244` | 89,322 → **89,345** nodes |
| **LOW** | `PRESENTER_SCRIPT.md:99` | note only 526 of the 1,576 IT rows are Multnomah and feed the field |
| **LOW** | `SMOKE_FIELD_AUDIT.md` | footnote: 2 of 312 hours are single-monitor (hours 20–21), none near peak |
