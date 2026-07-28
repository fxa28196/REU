# Critique response 01 — arithmetic claims

All numbers below were recomputed from the 27 run directories
`Geography/output/{A,B,C}2026-n6842-seed{42..50}/{agents.csv,simulation.json}`.
Scripts used are transient; every table here is reproducible from those files.

Verdicts: **1 CONFIRMED · 2 CONFIRMED (one sub-number wrong) · 3 PARTIAL ·
4 CONFIRMED · 5 PARTIAL (headline "16" is not the range)**

---

## Claim 1 — "empty beds == people outside" in B and C

**CONFIRMED, and the identity is forced, not observed.**

Total capacity is exactly 2,234 (A) and exactly 6,842 (B and C) — verified by
summing the `capacity` field over `simulation.json:shelters[]`. In B and C
capacity equals the population exactly, so
`empty = capacity − sheltered = 6842 − sheltered = n − sheltered = outside`
is an algebraic tautology. There is nothing to discover.

| arm | seed | sites | capacity | sheltered | empty (cap−occ) | outside (n−shelt) | turned away | couldn't reach | identity |
|---|---|---|---|---|---|---|---|---|---|
| A | 42 | 36 | 2,234 | 2,060 | 174 | 4,782 | 4,766 | 16 | **fails** |
| A | 43 | 36 | 2,234 | 2,055 | 179 | 4,787 | 4,762 | 25 | **fails** |
| A | 44 | 36 | 2,234 | 2,056 | 178 | 4,786 | 4,762 | 24 | **fails** |
| A | 45 | 36 | 2,234 | 2,055 | 179 | 4,787 | 4,771 | 16 | **fails** |
| A | 46 | 36 | 2,234 | 2,053 | 181 | 4,789 | 4,773 | 16 | **fails** |
| A | 47 | 36 | 2,234 | 2,053 | 181 | 4,789 | 4,771 | 18 | **fails** |
| A | 48 | 36 | 2,234 | 2,053 | 181 | 4,789 | 4,766 | 23 | **fails** |
| A | 49 | 36 | 2,234 | 2,064 | 170 | 4,778 | 4,764 | 14 | **fails** |
| A | 50 | 36 | 2,234 | 2,055 | 179 | 4,787 | 4,767 | 20 | **fails** |
| B | 42 | 36 | 6,842 | 6,264 | 578 | 578 | 562 | 16 | holds |
| B | 43 | 36 | 6,842 | 6,259 | 583 | 583 | 558 | 25 | holds |
| B | 44 | 36 | 6,842 | 6,260 | 582 | 582 | 558 | 24 | holds |
| B | 45 | 36 | 6,842 | 6,259 | 583 | 583 | 567 | 16 | holds |
| B | 46 | 36 | 6,842 | 6,257 | 585 | 585 | 569 | 16 | holds |
| B | 47 | 36 | 6,842 | 6,257 | 585 | 585 | 567 | 18 | holds |
| B | 48 | 36 | 6,842 | 6,257 | 585 | 585 | 562 | 23 | holds |
| B | 49 | 36 | 6,842 | 6,268 | 574 | 574 | 560 | 14 | holds |
| B | 50 | 36 | 6,842 | 6,259 | 583 | 583 | 563 | 20 | holds |
| C | 42 | 46 | 6,842 | 6,570 | 272 | 272 | 256 | 16 | holds |
| C | 43 | 46 | 6,842 | 6,565 | 277 | 277 | 252 | 25 | holds |
| C | 44 | 46 | 6,842 | 6,566 | 276 | 276 | 252 | 24 | holds |
| C | 45 | 46 | 6,842 | 6,565 | 277 | 277 | 261 | 16 | holds |
| C | 46 | 46 | 6,842 | 6,563 | 279 | 279 | 263 | 16 | holds |
| C | 47 | 46 | 6,842 | 6,563 | 279 | 279 | 261 | 18 | holds |
| C | 48 | 46 | 6,842 | 6,563 | 279 | 279 | 256 | 23 | holds |
| C | 49 | 46 | 6,842 | 6,574 | 268 | 268 | 254 | 14 | holds |
| C | 50 | 46 | 6,842 | 6,565 | 277 | 277 | 257 | 20 | holds |

The identity holds in **18/18** B and C runs and fails in **9/9** A runs (in A,
`empty` is 174–181 while `outside` is 4,778–4,789 — a factor of ~27).

### Does "578 empty beside 562 turned away" convey any information?

**No — not as an arithmetic pairing.** State it plainly:

- `578 = 6842 − 6264` is the count of people not sheltered, expressed in bed units.
- `562` is that same 578 minus the 16 who are graph-unreachable.
- So "578 empty and 562 turned away" is the single statement *"578 people were
  not sheltered, 16 of them for connectivity reasons"* written twice in two
  vocabularies. The near-equality of 578 and 562 is a restatement of
  `unreachable = 16`, nothing more.

`docs/final/PRESENT_DAY_THREE_ARM_RESULTS.md:88-92` and
`docs/final/TECHNICAL_REFERENCE.md:2098-2100` both present this as "the finding
that matters most." As arithmetic it is not a finding. `docs/final/PRESENTER_SCRIPT.md:74`
already concedes this internally ("The near-equality is forced arithmetic, not a
discovery. A methodologist will catch it.") — the critique is correct and the
project already knows it.

### The real, non-tautological content

Where the empty beds sit is genuine information, and it is currently buried.
In **every** arm the slack is concentrated in exactly three east-county sites
(seed 42):

| site | A cap/occ/empty | B cap/occ/empty | C cap/occ/empty |
|---|---|---|---|
| Gresham_Womens_Shelter | 90 / 0 / 90 | 276 / 0 / **276** | 135 / 0 / 135 |
| Rockwood_Bridge_Shelter | 52 / 3 / 49 | 159 / 3 / **156** | 78 / 3 / 75 |
| Stark_Street_Motel_Shelt | 54 / 19 / 35 | 165 / 19 / **146** | 81 / 19 / 62 |
| **total** | **174** | **578** | **272** |

All 33 (A/B) or 43 (C) other sites finish at 100% occupancy. The defensible
claim is *"three east-county sites absorb only 22 of their 600 upsized beds
under B"* — a placement statement. "578 ≈ 562" is not.

---

## Claim 2 — "dose is hours × ~175 in every arm; one column reported three times"

**CONFIRMED on substance. The multiplier ~175 applies to `inhaled_dose_ug`, not
to `cumulative_dose_ugm3h` (which is ~278).** The critique picked the right
structure and one of the two dose columns.

### 2a. The mechanism: hours is a two-valued variable

`hours_above_unhealthy` is **exactly 194.000** for every single unsheltered
agent in all 27 runs — zero variance, no exceptions. Sheltered agents average
0.55–1.26 h. So `hours` is essentially `194 × (1 − got_inside)`.

| arm | mean hours | hours \| sheltered | hours \| unsheltered | share in | share·h_in + (1−share)·h_out | R² (hours ~ got_inside) |
|---|---|---|---|---|---|---|
| A (seed 42) | 135.769 | 0.595 | **194.000** | 0.3011 | 135.769 | 0.999948 |
| B (seed 42) | 17.527 | 1.244 | **194.000** | 0.9155 | 17.527 | 0.998962 |
| C (seed 42) | 8.632 | 0.958 | **194.000** | 0.9602 | 8.632 | 0.998481 |

Across all 27 runs, R²(hours ~ binary got-inside) is **0.9984–0.99996**.
R²(cumulative_dose ~ binary got-inside) is **0.99987–0.999996**.

The critique's arithmetic check `0.301×4 + 0.699×194 ≈ 135.8` lands on 136.81.
The true decomposition is `0.3011×0.595 + 0.6989×194.000 = 135.769` — the
critique's "4 hours" for the sheltered term is wrong (it is 0.595 h), but the
term is so small that the answer is right to within 1 hour anyway. **That is
itself the point: the sheltered term is nearly ignorable.**

### 2b. Dose is an affine function of hours, per-agent

Per-agent OLS of dose on hours, within each run:

| arm | mean cumulative_dose | mean hours | dose/hours | slope | intercept | **R²** |
|---|---|---|---|---|---|---|
| A 42 | 37,802.04 | 135.769 | 278.428 | 278.207 | +30.04 | **0.9999741** |
| A 46 | 37,856.18 | 135.955 | 278.447 | 278.164 | +38.54 | **0.9999788** |
| A 49 | 37,771.41 | 135.667 | 278.412 | 278.244 | +22.77 | **0.9999705** |
| B 42 | 4,788.82 | 17.527 | 273.221 | 278.671 | −95.52 | **0.9994807** |
| B 49 | 4,758.42 | 17.415 | 273.234 | 278.665 | −94.58 | **0.9994814** |
| C 42 | 2,361.41 | 8.632 | 273.566 | 278.289 | −40.76 | **0.9992376** |
| C 49 | 2,328.96 | 8.505 | 273.846 | 278.282 | −37.72 | **0.9992629** |

Full range over all 27 runs: **R² ∈ [0.99921, 0.99998]**, slope ∈ [278.16,
278.30], i.e. the slope is a physical constant, not a model output. It is
`54002.8192 / 194 = 278.365` — the fixed outdoor dose of the smoke field
divided by its fixed duration.

### 2c. Where "~175" comes from — the critique's number is right for the other column

| arm (seed 42) | mean `inhaled_dose_ug` | ÷ mean hours | mean `cumulative_dose_ugm3h` | ÷ mean hours |
|---|---|---|---|---|
| A | 23,374.19 | **172.16** | 37,802.04 | 278.43 |
| B | 3,056.01 | **174.36** | 4,788.82 | 273.22 |
| C | 1,533.95 | **177.71** | 2,361.41 | 273.57 |

So: `inhaled_dose ≈ 175 × hours` (this is the ~175 the critique names, and it is
correct — 172–178 across arms), and `cumulative_dose ≈ 278 × hours`.
`vwe_ugm3h` is byte-identical to `cumulative_dose_ugm3h` in every row of every
run (both `mean` and `total` match to the last decimal in
`simulation.json:population`). That is a **third** copy of the same column.

### 2d. How many headline rows are algebraically derivable?

The published table is `docs/final/PRESENT_DAY_THREE_ARM_RESULTS.md:57-69`
(11 rows, not 7). Two rows are inputs; nine are outcomes. Reconstructing each
outcome row from only `sheltered`, `n`, `capacity`, `unreachable`, and
`mean walk`:

| headline row | derivation | error |
|---|---|---|
| Facilities | input | — |
| Total beds | input | — |
| **Got inside** | **primitive** | — |
| Turned away | `n − sheltered − unreachable` | **exact, 27/27 runs** |
| **Couldn't reach any shelter** | **primitive** (graph connectivity) | — |
| Beds left empty | `capacity − sheltered` | **exact, 27/27 runs** |
| **Average walk** | **primitive** | — |
| Average hours in unhealthy air | `194 × (1 − share)` | −0.13% (A), −6.5% (B), −10.6% (C) |
| Person-hours in unhealthy air | `6842 × mean hours` | **exact by definition** |
| Average smoke inhaled | `≈175 × mean hours` | +1.5% (A), −6.1% (B), −11.9% (C) |
| Mean exposure (µg·m⁻³·h) | `278.365 × mean hours` | −0.15% (A), −4.7% (B), −9.0% (C) |

**3 of 9 outcome rows are primitive** (got inside, couldn't reach, average
walk). **6 of 9 are algebra.**

`Person-hours in unhealthy air` is not approximately derivable — it is *exactly*
`6842 × mean hours`. Verified in all 27 runs: e.g. A/42
`928933.75 / 6842 = 135.769` = the reported mean hours to all printed digits.
Reporting both rows is reporting one number twice.

Adding `mean walk` as a second predictor closes the remaining gap. Across the
27 runs:

```
mean_hours ~ 1 + unsheltered_share + mean_walk_m
   R² = 0.99999987 , max |residual| = 0.078 hours
mean_hours ~ 1 + unsheltered_share              (one predictor)
   R² = 0.99999569 , max |residual| = 0.178 hours
```

So **share sheltered plus mean walking distance reproduce every exposure row in
the table to within 0.08 of an hour**, out of a 312-hour simulation. The
critique's claim stands.

---

## Claim 3 — subgroup precision

**PARTIAL. Most reported subgroup gaps survive; the 65+ row is the weakest and
two specific contrasts are not distinguishable from noise.**

Age 65+ is n = 353 in seed 42 (critique said ~356 — right). Wilson 95% CIs on
the access rate, seed 42, per arm:

| group | n | A rate [95% CI] | B rate [95% CI] | C rate [95% CI] | CI half-width |
|---|---|---|---|---|---|
| Everyone | 6,842 | 0.3011 [0.2903, 0.3121] | 0.9155 [0.9087, 0.9219] | 0.9602 [0.9554, 0.9646] | ±1.1 / ±0.7 / ±0.5 pp |
| Walks without difficulty | 5,482 | 0.3269 [0.3146, 0.3394] | 0.9642 [0.9590, 0.9688] | 0.9858 [0.9823, 0.9886] | ±1.2 / ±0.5 / ±0.3 pp |
| **Trouble walking** | 1,360 | 0.1971 [0.1768, 0.2190] | 0.7191 [0.6946, 0.7424] | 0.8574 [0.8378, 0.8749] | ±2.1 / ±2.4 / ±1.9 pp |
| **Age 65+** | **353** | 0.2238 [0.1834, 0.2701] | 0.8244 [0.7812, 0.8605] | 0.8980 [0.8620, 0.9254] | **±4.3 / ±4.0 / ±3.2 pp** |
| Age < 65 | 6,489 | 0.3053 [0.2942, 0.3166] | 0.9205 [0.9136, 0.9268] | 0.9636 [0.9588, 0.9679] | ±1.1 / ±0.7 / ±0.5 pp |
| Has COPD | 738 | 0.2222 [0.1937, 0.2536] | 0.8618 [0.8350, 0.8848] | 0.9377 [0.9179, 0.9529] | ±3.0 / ±2.5 / ±1.8 pp |
| Has asthma | 1,011 | 0.2918 [0.2646, 0.3206] | 0.9060 [0.8865, 0.9225] | 0.9575 [0.9432, 0.9683] | ±2.8 / ±1.8 / ±1.3 pp |
| Long-term physical condition | 2,712 | 0.3020 [0.2850, 0.3195] | 0.9108 [0.8994, 0.9209] | 0.9580 [0.9497, 0.9649] | ±1.7 / ±1.1 / ±0.8 pp |
| Counted as more vulnerable | 4,866 | 0.2818 [0.2693, 0.2946] | 0.8878 [0.8786, 0.8964] | 0.9466 [0.9399, 0.9525] | ±1.3 / ±0.9 / ±0.6 pp |
| Not vulnerable | 1,976 | 0.3487 [0.3280, 0.3700] | 0.9838 [0.9772, 0.9885] | 0.9939 [0.9894, 0.9965] | ±2.1 / ±0.6 / ±0.4 pp |

### Which reported differences are NOT distinguishable from noise

Newcombe 95% CIs on the difference in access rate (seed 42):

| contrast | A | B | C |
|---|---|---|---|
| trouble walking − unimpaired | −12.98 pp [−15.37, −10.46] **sig** | −24.51 pp [−27.00, −22.13] **sig** | −12.84 pp [−14.82, −11.05] **sig** |
| 65+ − under 65 | −8.15 pp [−12.34, −3.39] **sig** | −9.61 pp [−13.97, −5.93] **sig** | −6.56 pp [−10.18, −3.78] **sig** |
| COPD − asthma | −6.96 pp [−11.01, −2.80] **sig** | −4.42 pp [−7.57, −1.40] **sig** | −1.98 pp [−4.24, +0.11] **n.s.** |
| chronic physical − everyone | +0.09 pp [−1.93, +2.15] **n.s.** | −0.48 pp [−1.77, +0.75] **n.s.** | −0.23 pp [−1.16, +0.62] **n.s.** |
| vulnerable − not vulnerable | −6.69 pp [−9.16, −4.26] **sig** | −9.60 pp [−10.63, −8.52] **sig** | −4.74 pp [−5.45, −3.99] **sig**|

**Not distinguishable from noise at this n:**

1. **"Long-term physical condition" vs everyone, in all three arms.** The
   published table (`PRESENT_DAY_THREE_ARM_RESULTS.md:110`) reports 30.2 / 91.1 /
   95.8 against an overall 30.1 / 91.6 / 96.0. Every one of those gaps has a CI
   containing zero. This subgroup is not distinguished by the model. Presenting
   it in a table headed "who this helps, and who it leaves behind" implies a
   contrast that is not there.
2. **COPD vs asthma in arm C** (−1.98 pp, CI crosses 0). The A and B gaps are
   real; the C gap is not resolvable.
3. The **65+ row** is real in all three arms but is the least precise number in
   the deck: ±4.3 pp in A. Reporting it as "22.4" (one decimal) overstates
   resolution by more than an order of magnitude; the honest statement is
   "roughly 18–27%".

Pooling all 9 seeds (n = 3,239 for 65+) narrows the 65+ half-width to ±1.4 pp
and the COPD–asthma C gap becomes resolvable — **but see Claim 4: pooling seeds
is not legitimate for this purpose**, because the seeds are the same population
draw replayed against three shelter configurations, so the pooled n is not 9
independent samples of Multnomah County. It is 9 draws from the same synthetic
generator. The pooled CI answers "how precisely do I know the generator's
parameter", not "how precisely do I know the county".

---

## Claim 4 — the "28× signal-to-noise" claim

**CONFIRMED, and worse than the critique states.**

The claim is at `docs/final/TECHNICAL_REFERENCE.md:2094-2096` and
`docs/final/presentation/index.html:650-653`: smallest between-arm gap on "got
inside" is 306 (B→C), largest within-arm spread is 11, ratio ≈ 28.

The arithmetic checks out: A range 2,053–2,064 (spread 11), B 6,257–6,268
(spread 11), C 6,563–6,574 (spread 11); means 2,056.0 / 6,260.0 / 6,566.0;
6,566.0 − 6,260.0 = 306.0; 306/11 = 27.82.

### What the 9 seeds vary

The seed drives **the population draw only**. Verified directly: for each seed,
the columns `starting_encampment, start_lon, start_lat, age_years, sex,
mobility_limited, asthma_flag, copd_flag, chronic_physical, walking_speed_mps`
are **identical row-for-row between arms A, B and C** (checked for seeds 42, 43,
44 — 6,842/6,842 rows match). Between seeds, **6,842/6,842 rows differ**.
Realised prevalences move as expected: mobility-limited 0.1954–0.2146, 65+
0.0490–0.0579, chronic 0.3904–0.4009.

Held fixed across all 27 runs: shelter locations and capacities, the PM2.5 field
(`peak_hourly_ugm3` 562.7, `hours` 576, `out_of_range_lookups` 0), the street
network (112,070 features, 89,345 nodes, 154 components), and every model
parameter (walking speed 1.3, arrival distance 200 m, threshold 55.5 µg/m³,
312 h). Single input dataset differs between arms: the shelter CSV.

### The decisive number

Because the population is identical across arms within a seed, the between-arm
difference is **exactly constant in every seed**:

| seed | A | B | C | B−A | C−B | C−A |
|---|---|---|---|---|---|---|
| 42 | 2,060 | 6,264 | 6,570 | 4,204 | **306** | 4,510 |
| 43 | 2,055 | 6,259 | 6,565 | 4,204 | **306** | 4,510 |
| 44 | 2,056 | 6,260 | 6,566 | 4,204 | **306** | 4,510 |
| 45 | 2,055 | 6,259 | 6,565 | 4,204 | **306** | 4,510 |
| 46 | 2,053 | 6,257 | 6,563 | 4,204 | **306** | 4,510 |
| 47 | 2,053 | 6,257 | 6,563 | 4,204 | **306** | 4,510 |
| 48 | 2,053 | 6,257 | 6,563 | 4,204 | **306** | 4,510 |
| 49 | 2,064 | 6,268 | 6,574 | 4,204 | **306** | 4,510 |
| 50 | 2,055 | 6,259 | 6,565 | 4,204 | **306** | 4,510 |

Every arm's seed deviations from its own mean are the **same vector**:
`[+4, −1, 0, −1, −3, −3, −3, +8, −1]` in A, in B, and in C.

The seed-to-seed variation is 100% common-mode. It **cancels exactly** in the
paired contrast. The standard deviation of C−B across the 9 seeds is **0.00**.
So the "28×" ratio divides a deterministic constant (306) by a nuisance term
(11) that is not in the contrast at all. It is not a signal-to-noise ratio in
any statistical sense; both quantities are fixed by construction.

### Verdict, one sentence

**It is neither — it is a Monte Carlo convergence diagnostic dressed as an
uncertainty estimate, and it is a degenerate one, because the 9 seeds vary only
the population draw that is shared identically across arms, so their variance
cancels exactly out of every between-arm comparison (sd of C−B = 0.00) and the
"noise" in the ratio's denominator never enters the numerator's quantity.**

The 9 seeds *do* establish something worth keeping: that the arm ranking and
magnitude are stable to which 6,842 residents were sampled. That is a
sensitivity check on the population sampler. It is not a confidence interval on
any real-world quantity, and `PRESENT_DAY_THREE_ARM_RESULTS.md:61-69` presents
the seed ranges in `[low–high]` brackets in the same visual position that a CI
would occupy, which invites the misreading.

---

## Claim 5 — "could not reach any shelter = 16"

**PARTIAL. The behaviour claimed (identical across arms within seed) is
CONFIRMED. The number 16 is a single seed's value presented as the value.**

Range across all 9 seeds, and confirmation of within-seed identity across arms:

| seed | A | B | C | identical? |
|---|---|---|---|---|
| 42 | 16 | 16 | 16 | yes |
| 43 | 25 | 25 | 25 | yes |
| 44 | 24 | 24 | 24 | yes |
| 45 | 16 | 16 | 16 | yes |
| 46 | 16 | 16 | 16 | yes |
| 47 | 18 | 18 | 18 | yes |
| 48 | 23 | 23 | 23 | yes |
| 49 | 14 | 14 | 14 | yes |
| 50 | 20 | 20 | 20 | yes |

- **Range: 14 to 25. Mean 19.1. Identical across all three arms in 9/9 seeds.**
- 16 occurs in 3 of 9 seeds (42, 45, 46). It is the seed-42 value.
- The spread (14–25, a 79% relative range) is the **largest** relative
  seed-to-seed variation of any headline count — larger than "got inside"
  (0.2–0.5%). It is the one row where the seeds genuinely do carry information,
  and it is the one row where a single value is quoted.

The published table at `PRESENT_DAY_THREE_ARM_RESULTS.md:63` does show
`16 [14–25]` for all three arms, which is correct and adequately hedged. The
narrative uses at `TECHNICAL_REFERENCE.md:2077-2083` and
`presentation/index.html:654-656` quote "16, 16, 16" as the illustration, which
is fine as an illustration of the identity but should not be read as the
estimate. `PRESENTER_SCRIPT.md:76` already flags that this row must be excluded
from "no range overlaps between scenarios on any metric" — correctly, since the
three arms overlap perfectly on it by construction.

**Why it is identical:** these are residents on street-graph components
containing no shelter. Arm C adds 10 sites but adds no edges, so connectivity is
unchanged. It is a property of the population draw crossed with the street
network, and both are held fixed across arms within a seed. As an internal
consistency check this is genuine and worth keeping. It is not a result.
