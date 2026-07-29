# If a 2020-scale smoke event hit Multnomah County today

**What we did.** We took the smoke that actually happened in September 2020,
pointed it at the shelter system that actually exists today, and filled the
county with the number of unsheltered people who actually live here now. Then
we asked what would help.

**Population 6,842** — the 2025 Tri-County Point-in-Time count (PSU HRAC,
published 2025-11-04): 10,526 people experiencing homelessness in Multnomah
County, more than 65% of them unsheltered. Only the unsheltered are modelled,
because only they are outdoors.

**Shelters 36 facilities / 2,234 spaces** — every shelter facility in the county
inventory that could be geocoded, at its real address and real capacity.

*Wording note: earlier drafts called these "clean-air-capable" facilities. That
was an overstatement and is corrected here. Nothing in the sources establishes
that these buildings filter their air, and the model does not simulate indoor air
at all — the study endpoint is arrival at the door. They are the county's
existing shelter facilities, catalogued for a different purpose.*

---

## The three scenarios, and why they are in this order

The scenarios are **not** three guesses. Each one answers what the previous one
measured.

| | What it is | Facilities | Capacity | What changed |
|---|---|---|---|---|
| **A** | **Reality.** Real shelters, real locations, real bed counts. | 36 real | 2,234 | — |
| **B** | **More beds in the buildings we already have.** Every real site grows 3.06×. | 36 real | 6,842 | capacity only |
| **C** | **Existing sites grow modestly (1.5×), and the rest is built as 10 additional shelters at optimiser-chosen locations.** | 36 real + 10 new | 6,842 | same total, more doors |

**A is a measurement, not a treatment.** Its job is to reveal which constraint
actually binds. It reported: capacity. So B relieves capacity and nothing else.
B then revealed a *second* constraint, so C spends **the identical total
capacity** differently.

**C never moves an existing shelter.** Every one of the 36 real facilities stays
at its real coordinates — a real shelter system cannot be picked up and set down
somewhere else. C only decides where the *new* capacity goes.

Because B and C hold total capacity equal at 6,842, a B→C difference isolates
**how the same total is spent** — how many doors it is split across, and where
those doors sit. A randomised control separates those two ingredients below.

---

> **What changed tonight (2026-07-28, U-27).** The walking network previously
> admitted limited-access freeway geometry; the corrected build excludes it
> (2,636 freeway features, 614 km removed — the graph is now 109,434 edges /
> 88,100 nodes / 171 components, largest 59,725). All 27 runs were regenerated
> on the corrected graph. **No sheltered count changed in any arm or seed** —
> A 30.1%, B 91.6%, C 96.0% all survive — but 12 agents per run whose only
> route used a freeway fragment are reclassified from "turned away" to
> "couldn't reach any shelter" (seed 42: 16 → 28), so refusals fall by the
> same 12 (B 562 → 550, C 256 → 244) and travel/dose metrics move by roughly
> 0.1–2%. Every number below is from the corrected-graph runs.

## Results

Seed 42 is the reported run; the range across **all nine seeds (42–50)** is in
brackets. Every run passed `scripts/verify_2026_runs.py` (clean git tree,
matching source checksums, byte-identical population across arms within each
seed); the full 27-run table is `results-2026/6_SEED_ROBUSTNESS.csv`.
**No range overlaps between arms on any headline metric** (the couldn't-reach
count is excluded from that statement: it is identical across arms by
construction, because it depends only on the network and the start points).

| | **A — today** | **B — bigger existing sites** | **C — modest growth + 10 new sites** |
|---|---|---|---|
| Facilities | 36 | 36 | **46** (36 real + 10 new) |
| Total beds | 2,234 | 6,842 | 6,842 |
| Got inside | **2,060 (30.1%)** [2,053–2,064] | **6,264 (91.6%)** [6,257–6,268] | **6,570 (96.0%)** [6,563–6,574] |
| Turned away | **4,754** [4,750–4,763] | **550** [546–559] | **244** [240–253] |
| Couldn't reach any shelter | 28 [26–36] | 28 [26–36] | 28 [26–36] |
| Beds left empty | 174 [170–181] | 578 [574–585] | 272 [268–279] |
| Average walk | 18,244 m [18,044–18,502] | 7,896 m [7,848–8,557] | 5,904 m [5,232–5,904] |
| Average hours in unhealthy air | 135.8 | 17.5 | **8.7** |
| Person-hours in unhealthy air | 928,918 [928,246–930,346] | 119,973 [119,224–121,329] | **59,200** [58,263–60,522] |
| Average smoke inhaled | 23,373 µg [23,357–23,411] | 3,056 µg [3,039–3,090] | **1,536 µg** [1,513–1,569] |
| Mean exposure (µg·m⁻³·h) | 37,802 | 4,789 | 2,363 |

**Replication protocol.** The experiment was run three times with three seeds
per batch: seeds 42/43/44 (the original set), 45/46/47 (second batch), and
48/49/50 (third batch) — 27 runs in total, nine per arm. Batch parameter
files are `Geography/batch/batch_params_2026_{A,B,C}_seed{42..50}.xml`;
archived manifests for every run are under
`docs/runs/present-day-three-arm/<arm>-seed<seed>/`.

**A → B:** sheltered ×3.04, exposure **−87.3%**, person-hours **−87.1%**, walking **−56.7%**
**B → C:** sheltered +4.9%, exposure **−50.7%**, person-hours **−50.7%**, walking **−25.2%**, **refusals cut by more than half (550 → 244)**
**A → C:** sheltered ×3.19, exposure **−93.7%**, person-hours **−93.6%**, inhaled dose **−93.4%**, walking **−67.6%**

### The capacity/geography separation — and why B's near-equality is forced

In B, total capacity equals total population: 6,842 beds for 6,842 people.
Under that construction, every bed left empty must be mirrored by a person left
outside, so B's ledger — **578 beds empty = 550 turned away + 28 who could not
reach any shelter** (seed 42) — is an identity, not a discovery. What is
informative is *why* the ledger is non-zero at all: doors fill and doors are
unreachable. Capacity alone does not deliver access.

C spends **exactly the same 6,842 beds**, but instead of tripling the size of
the existing buildings, it grows them modestly and puts the difference through
**ten additional doors**.

**Same total as B, split differently — more doors: refusals cut by more than
half (550 → 244), empty beds halve (578 → 272), walking drops a quarter, and
smoke inhaled drops by half again.**

The credit for that line splits in two. The refusal and empty-bed halving is
**dispersion**: a control that draws the ten extra sites *at random* from the
same 498-node candidate pool reproduces C's sheltered count run for run
(6,570 / 6,565 / 6,566 at seeds 42–44, three independent draws). The walk
reduction (−25.2% at seed 42) is the one component that is genuine siting
credit, and it is conditional on the optimiser's perfect information. It also
buys less protection than it appears to: over the full 312-hour window,
shorter walking explains only 4.5% of C's dose benefit (the B/C dose ratio
grows from 1.29× in the first 24 h to 1.98× at 312 h; `d1_summary.md`) — most
of the dose gain is being indoors at all.

The findings that carry weight sit elsewhere: **(i)** at every capacity scale
tested, the residual access gap concentrates in mobility-limited residents,
and **(ii)** a 10% triage reserve (scenario D) closes that gap at zero capital
cost. Both are laid out below.

---

## Who this helps, and who it leaves behind

Percentage of each group that got inside:

| Group | Share | A | B | C |
|---|---|---|---|---|
| Everyone | 100% | 30.1 | 91.6 | **96.0** |
| Walks without difficulty | 80.1% | 32.6 | 96.3 | 98.5 |
| **Has trouble walking** | **19.9%** | **20.1** | **72.6** | **86.0** |
| Age 18–44 | 52.8% | 30.6 | 93.2 | 96.9 |
| Age 45–64 | 42.0% | 30.5 | 90.8 | 95.6 |
| **Age 65+** | **5.2%** | **22.4** | **81.6** | **90.1** |
| Has asthma | 14.8% | 29.3 | 91.1 | 95.8 |
| **Has COPD** | **10.8%** | **22.6** | **87.3** | **95.1** |
| Long-term physical condition | 39.6% | 30.1 | 91.0 | 95.7 |
| Counted as more vulnerable | 71.1% | 28.2 | 88.9 | 94.8 |

**Adding beds to existing buildings widens the equity gap. Splitting the same
total across more doors narrows it — and a triage rule closes it.**

The mobility gap — the difference between people who walk easily and people who
don't:

| | A | B | C | D — B + 10% triage reserve |
|---|---|---|---|---|
| Gap (percentage points) | 12.5 | **23.7** | **12.5** | **−0.5** |

In A the gap is 12.5 points. Pouring 4,608 beds into the *same* buildings
widens it to 23.7, because extra capacity at an existing site is captured first
by whoever can walk there fastest. Splitting that same capacity across ten
additional sites brings the gap back to where A had it (12.5) **while lifting
the slowest group from 72.6% to 86.0%** — a dispersion effect, not an optimiser
achievement.

The same pattern holds for age 65+ (22.4 → 81.6 → 90.1) and COPD
(22.6 → 87.3 → 95.1). COPD tracks mobility because it is the one condition with
a measured walking-speed decrement (−0.19 m/s, Buekers 2024). Asthma shows
almost no access penalty, and that is correct rather than an omission: no
gait-speed evidence exists for asthma, so inventing one would have manufactured
the finding.

**The gap is narrowed, not closed — by geometry.** 14.0% of people with
mobility limitations are still outside in C. Ten additional shelters are not
enough to reach everyone. What does close the gap is not construction at all:

### What actually closes the gap — and how fragile the gap itself is

**Scenario D** keeps B's 36 sites and 6,842 beds and changes only the admission
rule: each shelter holds 10% of its beds in reserve for the slowest walkers.
Access does not move — 6,264 inside and 550 turned away at seed 42, exactly B's
counts — but the mobility gap collapses from **23.7 points to −0.5** (seed 43:
24.5 → −0.1; seed 44: 22.4 → +1.5). Larger reserves overshoot: at 15% the
reserve strands beds (6,087 inside at seed 42) and the gap over-corrects to
−13.3 points. A 10% reserve is a rule change with zero capital cost.

A capacity sweep then puts both headline findings in their place. Holding B's
geometry and sweeping total beds, access reaches **99.5% already at 1.2×
demand**, and the mobility gap **vanishes (≈0 points) at every surplus tested**
(1.2×–1.6×); at exactly 1.0× — scenario B — the gap is ~23.5 points on the
sweep's nine-seed mean, and under scarcity (0.8×) it widens to 28.3. Both the
equity gap and the headcount value of splitting capacity across more doors are
**knife-edge phenomena of capacity == demand**. We registered predictions
before running the sweep and missed on both counts (P-3c, P-3d — see
limitations). D's triage reserve is the zero-cost fix exactly at that knife
edge; any bed surplus also dissolves the gap, by brute force.

---

## The population is real, and so is every starting point

Residents are placed at real City-of-Portland campsite report locations. The
source feed contains **3,400 reports resolving to 3,317 distinct coordinates**,
and any one run seeds residents at a subset of them — **2,918 distinct start
locations** in the corrected-graph seed-42 arm-A run (a per-run sampling
outcome, not a property of the file). Every result row carries the actual
start coordinate (`Start longitude`, `Start latitude`) so the demand geography
can be audited without re-joining any file.

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
| `1_EVERY_PERSON.csv` | one row per person: who they are, where they started, what happened (includes the scenario-D triage-reserve rows) |
| `2_BY_GROUP.csv` | outcomes by age, sex, mobility, asthma, COPD |
| `3_WHOLE_POPULATION.csv` | the headline table, all three seeds |
| `4_WHERE_PEOPLE_STARTED.csv` | the realised encampment start locations for the reported run and how many people started at each |
| `5_EVERY_SHELTER.csv` | every facility: where it is, how full it got, how many it turned away |
| `figures/fig1_headline.png` | got inside / turned away / hours in smoke |
| `figures/fig2_empty_beds_vs_turned_away.png` | the geography failure in one picture |
| `figures/fig3_by_group.png` | who gets inside, by group |
| `figures/fig4_map.png` | where people are vs where the beds are |
| `figures/fig5_walking.png` | how far people had to walk |
| `figures/fig6_dose.png` | smoke actually breathed in |
| `6_SEED_ROBUSTNESS.csv` | all 27 runs (9 seeds × 3 arms): every headline metric per run, plus per-arm min/mean/max |
| `d1_summary.md` / `d1_window_rows.csv` | dose by time window: B/C ratio and walking's share of C's dose benefit |
| `d2_summary.md` / `d2_sweep_rows.csv` | the bed sweep: access and mobility gap as total capacity scales 0.8×–1.6× |

---

## What this does and does not claim

**The claim:** *for a fixed total capacity, splitting the same total across
more sites outperforms enlarging existing facilities under the modelled
assumptions, in aggregate and in equity.* The headcount part of that gain is
dispersion, not optimised siting — the random-sites control reproduces C's
sheltered count in every seed tested — and the siting optimiser earns its
credit in walking distance, conditional on perfect information.

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
13. **The B–C contrast lives on a knife edge, and we did not predict that.**
    B and C hold capacity exactly equal to population. The bed sweep shows
    access reaching 99.5% at 1.2× demand and a ≈0 mobility gap at every
    surplus tested, so both the equity gap and dispersion's headcount value
    are properties of capacity == demand, not general laws. Our registered
    predictions for the sweep (P-3c, P-3d) were misses, and we report them as
    such. The knife edge is where a system that sizes capacity to counted
    demand would sit — but the sweep bounds how quickly these findings
    dissolve once there is any surplus.
