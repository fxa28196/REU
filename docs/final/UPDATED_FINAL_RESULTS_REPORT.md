# Does shelter placement reduce wildfire-smoke exposure among unsheltered residents?

**An agent-based simulation of clean-air shelter access in Portland, Oregon,
during the September 2020 wildfire-smoke episode.**

| Run identity | Value |
|---|---|
| Design | Two-arm placement experiment: **A** = historical shelter locations · **B** = street-network optimum |
| Population | n = 2,037 residents per run; seeds 42, 43, 44 per arm (6 runs) |
| Model commit | **`b69fc6d`**, working tree clean (`git_working_tree_dirty: false` in every manifest) |
| Governance | 27 variables / 24 assumptions, registry hashes recorded and matching disk |
| Integrity | 12 files checksummed per run, including all shapefile sidecars and both registries |
| Archived | `docs/runs/final-placement-experiment/{A,B}-seed{42,43,44}/` · reference run: `docs/runs/historical-capacity-reference/` |

---

## 1. Research question

**Holding everything else constant, does *where* clean-air shelters are placed
change how much wildfire smoke unsheltered residents inhale?**

This is a question about **geography**, not about how many beds exist. The design
is built to answer only that question.

## 2. Design — how placement was isolated

Both arms are identical in population, demographics, health attributes, walking
speeds, PM2.5 field, shelter opening dates, street network, **total system
capacity**, and the 1:1 capacity split between sites. The **only** difference is
two coordinate pairs.

**Total capacity equals the population (2,037 spaces across 2 sites) in both
arms.** This is deliberate: if capacity were scarce, capacity would bind the
outcome and the experiment would have no power to detect a placement effect at
all. Individual sites still have finite capacity, so shelters fill in sequence,
residents are refused at a full door and re-route — the mechanics remain real.

> **This is why an earlier version of this study found no placement effect.** It
> capped both arms at 198 beds, so the answer was determined by bed count before
> geography could matter. That result has been retracted; see
> `CLAIM_VALIDATION_AUDIT.md` §1.

**Arm A** — Charles Jordan Community Center and Oregon Convention Center, the
real September-2020 sites.
**Arm B** — two street-network nodes selected by capacity-aware p-median
minimisation over 790 candidates (`scripts/optimize_shelters.py`). These are
**theoretical locations, not verified venues**; they carry no claim that a
building capable of sheltering 1,000 people exists there.

## 3. Result

### 3.1 Placement reduces inhaled dose by 12.6%

3-seed means, n = 2,037:

| Measure | A (current) | B (optimized) | Change |
|---|---|---|---|
| Residents sheltered | 2,021.7 (99.25%) | 2,021.7 (99.25%) | **0.00%** |
| Mean walking distance, sheltered | 11,278 m | 8,402 m | **−25.50%** |
| Mean time to admission | 587.9 min | 542.6 min | −7.71% |
| Total population exposure | 7,669,225 µg·m⁻³·h | 7,235,587 | **−5.65%** |
| **Total inhaled PM2.5 dose** | **5,482,060 µg** | **4,792,852 µg** | **−12.57%** |
| Person-hours above "Unhealthy" | 34,948 | 33,421 | −4.37% |
| Residents with no reachable shelter | 15.3 | 15.3 | 0.00% |

The identical sheltered count confirms capacity is not binding — placement is
genuinely the only thing that varied. Per-seed ranges for A and B do **not
overlap** on walking distance, exposure, or dose, so the effect exceeds
seed-to-seed variation in every case.

### 3.2 The dose benefit is more than double the exposure benefit

Exposure falls 5.65%; inhaled dose falls **12.57%**.

The mechanism is exact. Optimized placement removes **walking** time
specifically, and ventilation while walking (1.62 m³/h) is 2.7× resting
ventilation (0.61 m³/h). Concentration-time exposure counts a waiting hour and a
walking hour identically; inhaled dose does not.

**Reporting exposure alone understates the value of shelter siting by more than
half.** This is a methodological result as well as a substantive one, and it is
visible only because exposure and dose are computed as separate quantities
(`HEALTH_MODEL_AUDIT.md`).

### 3.3 Placement helps the slowest residents most

| Stratum | Walking speed | Dose A (µg) | Dose B (µg) | Reduction |
|---|---|---|---|---|
| **Mobility-limited** | 0.99 m/s | 3,302 | 2,750 | **−16.71%** |
| Not mobility-limited | 1.37 m/s | 2,547 | 2,260 | −11.26% |
| **COPD** | 1.15 m/s | 2,890 | 2,477 | **−14.31%** |
| No COPD | 1.31 m/s | 2,667 | 2,338 | −12.35% |
| Vulnerable (any) | 1.18 m/s | 2,917 | 2,512 | −13.90% |
| Not vulnerable | 1.40 m/s | 2,481 | 2,206 | −11.10% |
| Asthma | 1.295 m/s | 2,682 | 2,351 | −12.34% |
| No asthma | 1.294 m/s | 2,695 | 2,356 | −12.60% |

The benefit ordering follows walking speed monotonically. Asthma — which carries
no modelled mobility effect — shows no differential benefit, exactly as the
design predicts. That internal consistency is evidence the mechanism is real
rather than an artefact.

**Mechanism:** slower walking → longer outdoors → more air breathed at the higher
walking ventilation rate → greater inhaled dose. Shortening journeys removes
proportionally more of that burden from the people who walk slowest.

## 4. Calibration against the historical record

A separate reference run (**not a study arm**) uses the historically reported
2 × 99 beds. It shelters **198 of 2,037 residents (9.7%)** and fills both sites
completely.

**The one contemporaneous observation available disagrees.** Street Roots,
16 September 2020, records roughly **90 occupants at the Convention Center and 40
at Charles Jordan — about 130 of 198 beds.** The model therefore over-predicts
observed occupancy by **1.52×**.

This is expected and is attributable to a registered blocking assumption:
**A-12**, universal awareness of the shelters. The local record is that **65% of
surveyed unsheltered residents had never heard of them.** Modelled uptake is an
**upper bound**, and the gap suggests that in the real event **information, not
geography and not beds, bound first.**

This comparison is reported rather than omitted because it is the only external
validity check the project possesses, and it partially fails.

## 5. Data

| Dataset | Source | Status |
|---|---|---|
| PM2.5 | EPA AQS hourly, parameter 88502, 2 Multnomah monitors, 312 hourly slices, no gaps, peak 562.7 µg/m³ | **Measured.** EPA's own `IT` "Wildfire–U.S." qualifier spans exactly 2020-09-07→19 — agency attestation of the event window |
| Street network | Portland/Metro RLIS, 112,070 features, 89,345 validated nodes | **Measured**, but a **≥2026-02-26 snapshot**: 15.6% of features updated and 3.1% created after the event. Licence unverified for redistribution |
| Shelter sites & dates | JOHS press releases; Street Roots | **Measured** locations and opening dates; capacity newsroom-sourced (A-04, blocking) |
| Encampment origins | City of Portland IRP campsite reports | **Real points, temporally displaced**: 2025–26 used as a 2020 proxy (A-03); 45 distinct dates; 37.7% are vehicle-camping reports |
| Population size & demographics | 2019 Multnomah PIT (n = 2,037) | **Measured**, applied to a 2020 event; CoC-wide count placed in City-of-Portland-only geography |
| Health prevalences | Zellmer 2025 (asthma 0.15, COPD 0.105) | Literature, imported (no local values exist) |
| Walking speeds | Bohannon & Williams Andrews 2011; Bohannon 1997; Boyce 1999; Buekers 2024 | Literature; Boyce and Buekers verified-in-secondary |
| Ventilation rates | EPA Exposure Factors Handbook 2011 Ch. 6 | Literature, verified-in-secondary, swept |

## 6. Validation

1. **Exposure engine externally validated.** Independent recomputation from the
   raw EPA file: 54,002.7 vs the model's 54,002.8 µg·m⁻³·h (ratio 1.0000); 194
   hours above threshold vs 194.
2. **Every resident accounted for.** No removal path exists in the source; 2,037
   rows for 2,037 agents; outcome census reconciles exactly in all runs.
3. **Routing integrity** — walked distance ≤ planned legs + snap gap + 200 m,
   enforced as a *failing* check.
4. **Analysis chain reconciles** — summary CSVs, JSON blocks and per-shelter
   counts all reproduce cell-for-cell from raw per-resident records.
5. **Reproducibility chain closed** — clean-tree runs, correct commit, dirty
   flag false, 12-file checksum census including `Streets.dbf`.
6. **Historical calibration attempted and partially failed** — §4.

## 7. Limitations

- **L1 (A-12, blocking).** Universal shelter awareness. Modelled uptake is an
  upper bound; the observed record is ~1.5× lower.
- **L2 (A-16, blocking, unmet prerequisite).** Order-independent two-phase
  admission was specified as required before any run where demand exceeds beds,
  and was **not implemented**. It does not affect the placement experiment
  (capacity is not binding there) but it does constrain the scarce-capacity
  reference figures.
- **L3 (A-01).** Smoke field is spatially uniform — two in-county monitors cannot
  support interpolation. Placement therefore cannot help by moving people to
  cleaner air, only by shortening journeys, so the measured benefit is a **lower
  bound** (`SMOKE_FIELD_AUDIT.md`).
- **L4 (A-04, blocking).** The 99-bed figure is newsroom-sourced and its unit
  (cots? people?) is unstated. It affects only the reference run.
- **L5 (A-03).** Encampment origins are 2025–26 reports used as a 2020 proxy;
  37.7% are vehicle-camping locations used as walking origins.
- **L6.** Street network is a ≥2026 snapshot; 3.1% of features did not exist in
  2020.
- **L7 (A-02).** All residents depart on the same tick; no awareness diffusion or
  decision delay.
- **L8.** Arm B sites are street nodes, not verified venues, and the optimum was
  computed against the 2025–26 encampment geography.
- **L9 (A-05).** All mapped centerlines are walkable, including freeway segments.
- **L10.** No rest, fatigue, or night cycle; mean journey ~9 h.
- **L11 (A-22).** Ventilation varies with activity only; no health-based dose
  weighting exists, so no result is a health outcome.
- **L12.** Three seeds. Results are reported as ranges; no significance test is
  claimed.
- **L13.** AQS `Time Local` is Local Standard Time, so exported local timestamps
  are one hour behind Pacific Daylight Time.

## 8. Interpretation

1. **Shelter placement matters, and its value is understated by conventional
   exposure metrics.** Moving the same two-site system to the network optimum cut
   inhaled dose 12.6% and walking distance 25.5% without sheltering one
   additional person.
2. **The benefit is progressive.** It is largest for mobility-limited residents
   (−16.7%) and smallest for the fastest walkers, because placement acts on
   walking time and slower residents spend the most time walking.
3. **This is a lower bound.** With a spatially uniform smoke field, placement
   cannot capture the additional benefit of siting shelters in cleaner air.
4. **Capacity was not tested here** — and the historical record suggests
   awareness, not beds or geography, was the first binding constraint in 2020.
5. **These are exposure and inhaled-mass results, not health outcomes.**

---

*Model commit `b69fc6d`. Companion audits: `FINAL_SYSTEM_AUDIT.md`,
`CLAIM_VALIDATION_AUDIT.md`, `HEALTH_MODEL_AUDIT.md`, `SMOKE_FIELD_AUDIT.md`,
`SHELTER_CAPACITY_AUDIT.md`. Reader's guide: `README_RESULTS.md`. Per-resident
data: `QUICK_RESULTS_SUMMARY.csv`.*
