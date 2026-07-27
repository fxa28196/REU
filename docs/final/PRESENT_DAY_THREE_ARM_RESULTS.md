# If a 2020-scale smoke event hit Multnomah County today

**What we did.** We took the smoke that actually happened in September 2020,
pointed it at the shelter system that actually exists today, and filled the
county with the number of unsheltered people who actually live here now. Then
we asked what would help.

**Population 6,842** — the 2025 Tri-County Point-in-Time count (PSU HRAC,
published 2025-11-04): 10,526 people experiencing homelessness in Multnomah
County, more than 65% of them unsheltered. Only the unsheltered are modelled,
because only they are outdoors.

**Shelters 36 facilities / 2,234 spaces** — every clean-air-capable facility in
the county inventory that could be geocoded, at its real address and real
capacity.

---

## The three scenarios, and why they are in this order

The scenarios are **not** three guesses. Each one answers what the previous one
measured.

| | What it is | Facilities | Capacity | What changed |
|---|---|---|---|---|
| **A** | **Reality.** Real shelters, real locations, real bed counts. | 36 real | 2,234 | — |
| **B** | **More beds in the buildings we already have.** Every real site grows 3.06×. | 36 real | 6,842 | capacity only |
| **C** | **Existing sites grow modestly (1.5×), and the rest is built as 10 new shelters at optimal locations.** | 36 real + 10 new | 6,842 | *where* the new capacity sits |

**A is a measurement, not a treatment.** Its job is to reveal which constraint
actually binds. It reported: capacity. So B relieves capacity and nothing else.
B then revealed a *second* constraint, so C spends **the identical total
capacity** differently.

**C never moves an existing shelter.** Every one of the 36 real facilities stays
at its real coordinates — a real shelter system cannot be picked up and set down
somewhere else. C only decides where the *new* capacity goes.

Because B and C hold total capacity equal at 6,842, a B→C difference isolates
**where the marginal capacity sits** and nothing else.

---

## Results

Seed 42 is the reported run; the range across **all nine seeds (42–50)** is in
brackets. Every run passed `scripts/verify_2026_runs.py` (clean git tree,
matching source checksums, byte-identical population across arms within each
seed); the full 27-run table is `results-2026/6_SEED_ROBUSTNESS.csv`.
**No range overlaps between arms on any headline metric.**

| | **A — today** | **B — bigger existing sites** | **C — modest growth + 10 new sites** |
|---|---|---|---|
| Facilities | 36 | 36 | **46** (36 real + 10 new) |
| Total beds | 2,234 | 6,842 | 6,842 |
| Got inside | **2,060 (30.1%)** [2,053–2,064] | **6,264 (91.6%)** [6,257–6,268] | **6,570 (96.0%)** [6,563–6,574] |
| Turned away | **4,766** [4,762–4,773] | **562** [558–569] | **256** [252–263] |
| Couldn't reach any shelter | 16 [14–25] | 16 [14–25] | 16 [14–25] |
| Beds left empty | 174 [170–181] | 578 [574–585] | 272 [268–279] |
| Average walk | 18,260 m [17,996–18,410] | 7,938 m [7,841–8,522] | 5,689 m [5,198–5,689] |
| Average hours in unhealthy air | 135.8 | 17.5 | **8.6** |
| Person-hours in unhealthy air | 928,934 [928,236–930,338] | 119,921 [119,155–121,255] | **59,060** [58,189–60,311] |
| Average smoke inhaled | 23,374 µg [23,357–23,410] | 3,056 µg [3,039–3,089] | **1,534 µg** [1,513–1,566] |
| Mean exposure (µg·m⁻³·h) | 37,802 | 4,789 | 2,361 |

**Replication protocol.** The experiment was run three times with three seeds
per batch: seeds 42/43/44 (the original set), 45/46/47 (second batch), and
48/49/50 (third batch) — 27 runs in total, nine per arm. Batch parameter
files are `Geography/batch/batch_params_2026_{A,B,C}_seed{42..50}.xml`;
archived manifests for every run are under
`docs/runs/present-day-three-arm/<arm>-seed<seed>/`.

**A → B:** sheltered ×3.04, exposure **−87.3%**, person-hours **−87.1%**, walking **−56.5%**
**B → C:** sheltered +4.9%, exposure **−50.7%**, person-hours **−50.8%**, walking **−28.3%**, **refusals cut in half (562 → 256)**
**A → C:** sheltered ×3.19, exposure **−93.8%**, person-hours **−93.6%**, inhaled dose **−93.4%**, walking **−68.8%**

### The finding that matters most

**Scenario B leaves 578 beds empty while turning 562 people away.** Those two
numbers are nearly equal. B has no shortage — the beds exist and go unused,
because the people who need them cannot reach them.

That is a geography failure, and it is what C fixes. C spends **exactly the
same 6,842 beds**, but instead of tripling the size of buildings that are
already in the wrong places, it grows them modestly and puts the difference
into 10 new shelters where people actually are.

**Same beds, better places: refusals halve, empty beds halve, walking drops
28%, and smoke inhaled drops half again.**

---

## Who this helps, and who it leaves behind

Percentage of each group that got inside:

| Group | Share | A | B | C |
|---|---|---|---|---|
| Everyone | 100% | 30.1 | 91.6 | **96.0** |
| Walks without difficulty | 80.1% | 32.7 | 96.4 | 98.6 |
| **Has trouble walking** | **19.9%** | **19.7** | **71.9** | **85.7** |
| Age 18–44 | 52.8% | 30.6 | 93.1 | 96.8 |
| Age 45–64 | 42.0% | 30.4 | 90.8 | 95.8 |
| **Age 65+** | **5.2%** | **22.4** | **82.4** | **89.8** |
| Has asthma | 14.8% | 29.2 | 90.6 | 95.7 |
| **Has COPD** | **10.8%** | **22.2** | **86.2** | **93.8** |
| Long-term physical condition | 39.6% | 30.2 | 91.1 | 95.8 |
| Counted as more vulnerable | 71.1% | 28.2 | 88.8 | 94.7 |

**Adding beds to existing buildings widens the equity gap. Placing new beds
well narrows it again.**

The mobility gap — the difference between people who walk easily and people who
don't:

| | A | B | C |
|---|---|---|---|
| Gap (percentage points) | 13.0 | **24.5** | **12.9** |

In A the gap is 13 points. Pouring 4,608 beds into the *same* buildings widens
it to 24.5, because extra capacity at an existing site is captured first by
whoever can walk there fastest. Spending that same capacity on well-placed new
sites brings the gap back to 12.9 **while lifting the slowest group from 71.9%
to 85.7%**.

The same pattern holds for age 65+ (22.4 → 82.4 → 89.8) and COPD
(22.2 → 86.2 → 93.8). COPD tracks mobility because it is the one condition with
a measured walking-speed decrement (−0.19 m/s, Buekers 2024). Asthma shows
almost no access penalty, and that is correct rather than an omission: no
gait-speed evidence exists for asthma, so inventing one would have manufactured
the finding.

**The gap is narrowed, not closed.** 14.3% of people with mobility limitations
are still outside in C. Ten new shelters are not enough to reach everyone.

---

## The population is real, and so is every starting point

Residents are placed at **2,981 distinct real City-of-Portland campsite report
locations**, and every result row carries the actual start coordinate
(`start_lon`, `start_lat`) so the demand geography can be audited without
re-joining any file.

Sampled attributes reproduce their published marginals (seed 42):

| Attribute | Target | Realised | Source |
|---|---|---|---|
| Age 18-44 / 45-64 / 65+ | 52.7 / 42.3 / 5.0% | **52.8 / 42.0 / 5.2%** | Pathways 2026 (local) |
| Male / Female / other | 68.4 / 29.3 / 2.3% | **68.6 / 29.2 / 2.2%** | 2019 PIT |
| Mobility limitation | 19.2% | **19.9%** | 2019 PIT (lower bound) |
| Asthma | 15.0% | **14.8%** | Zellmer 2025 |
| COPD | 10.5% | **10.8%** | Zellmer 2025 |
| Long-term physical condition | 39.1% | **39.6%** | Pathways 2026 (local) |

**Verified:** within each seed, the three arms contain a byte-identical
population — same agent ids, start coordinates, ages, sexes, mobility, asthma,
COPD and walking speeds (SHA-256 of the joined attribute vector matches across
A, B and C for all three seeds). Only the shelters differ.

---

## What you can read

`docs/final/results-2026/`

| File | What it is |
|---|---|
| `1_EVERY_PERSON.csv` | one row per person: who they are, where they started, what happened |
| `2_BY_GROUP.csv` | outcomes by age, sex, mobility, asthma, COPD |
| `3_WHOLE_POPULATION.csv` | the headline table, all three seeds |
| `4_WHERE_PEOPLE_STARTED.csv` | the 2,981 real encampment locations and how many started at each |
| `5_EVERY_SHELTER.csv` | every facility: where it is, how full it got, how many it turned away |
| `figures/fig1_headline.png` | got inside / turned away / hours in smoke |
| `figures/fig2_empty_beds_vs_turned_away.png` | the geography failure in one picture |
| `figures/fig3_by_group.png` | who gets inside, by group |
| `figures/fig4_map.png` | where people are vs where the beds are |
| `figures/fig5_walking.png` | how far people had to walk |
| `figures/fig6_dose.png` | smoke actually breathed in |
| `6_SEED_ROBUSTNESS.csv` | all 27 runs (9 seeds × 3 arms): every headline metric per run, plus per-arm min/mean/max |

---

## What this does and does not claim

**The claim:** *optimized shelter placement improves outcomes under the modelled
assumptions* — specifically, that for a fixed total capacity, placing new
capacity at optimized locations outperforms enlarging existing facilities, both
in aggregate and in equity.

**Not claimed:** that this recreates what happened in 2020. It does not, and
calibration does not support it. This is a present-day question asked with a
historical smoke field.

### Limitations that bear on these numbers

1. **C's 10 new sites are street-network nodes, not real venues.** They are
   theoretical optima, not buildings with filtered indoor air, and no siting,
   zoning, construction cost or staffing is modelled.
2. **The 1.5× existing-expansion factor and the choice of 10 new sites are
   policy parameters**, not measured quantities. Different values would give
   different magnitudes; the direction is what the comparison establishes.
3. **B's uniform 3.06× scale-up is likewise a construct** — real buildings have
   physical limits.
4. **Two City facilities are still missing** — Clinton Triangle (160 units, the
   largest single site) and Multnomah Safe Rest Village (28), neither of which
   publishes a street address. Real capacity is ~207 people higher than modelled.
5. **Ten day centres are excluded** because none publishes a capacity. In a
   *daytime* smoke episode these are plausibly the most relevant clean-air
   spaces that exist, so A understates daytime availability.
6. **Three shelter coordinates are block- or intersection-level**, accurate to a
   few hundred metres.
7. **Sex and mobility distributions are 2019** inside an otherwise 2026 study;
   no local replacement was found.
8. **Asthma and COPD prevalences are imported from Minnesota** (Zellmer 2025).
9. **A-12 — everyone is assumed to know the shelters exist.** Local survey
   evidence says 65% never heard of them, so every "got inside" figure is an
   **upper bound**.
10. **A-16 — admission is order-dependent**; residents are served in shuffle
    order rather than by need. This matters most in A, where capacity binds hard.
11. **Encampment locations are 2025–26 reports** used as a spatial proxy for
    2020, and they are complaint-driven, so they carry visibility bias.
12. **All facilities are modelled as open from hour 0**, appropriate for a
    year-round present-day system but not a claim about activation timing.
