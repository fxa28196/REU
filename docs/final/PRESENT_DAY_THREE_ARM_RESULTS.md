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

| | What it is | What changed from the previous arm |
|---|---|---|
| **A** | **Reality.** Real shelters, real locations, real bed counts. | — |
| **B** | **More beds, same places.** | capacity only |
| **C** | **The same extra beds, better placed.** | coordinates only |

**A is a measurement, not a treatment.** Its job is to reveal which constraint
actually binds. It reported: capacity. So B relieves capacity and nothing else.
B then revealed a *second* constraint, so C relieves that one and nothing else.
Because each step changes exactly one thing, each difference is attributable.

---

## Results

Seed 42; the range across seeds 42/43/44 is in brackets. **No range overlaps
between arms**, so every difference below is far larger than seed noise.

| | **A — today** | **B — more beds** | **C — better placed** |
|---|---|---|---|
| Got inside | **2,060 (30.1%)** [2,055–2,060] | **6,264 (91.6%)** [6,259–6,264] | **6,804 (99.4%)** [6,800–6,804] |
| Turned away | **4,766** | **562** | **0** |
| Couldn't reach any shelter | 16 | 16 | 16 |
| Beds left empty | 174 | 578 | 38 |
| Average walk | 18,260 m [18,260–18,356] | 7,938 m [7,938–8,085] | 5,466 m [5,184–5,466] |
| Person-hours in unhealthy air | 928,934 [928,934–929,924] | 119,921 [119,921–120,881] | 14,944 [14,944–15,650] |
| Mean exposure (µg·m⁻³·h) | 37,802 [37,802–37,842] | 4,789 [4,789–4,828] | 537 [537–567] |

**A → B:** sheltered ×3.0, exposure **−87.3%**, person-hours **−87.1%**, walking **−56.5%**
**B → C:** sheltered +8.6%, exposure **−88.8%**, person-hours **−87.5%**, walking **−31.1%**
**A → C:** sheltered ×3.3, exposure **−98.6%**, person-hours **−98.4%**, walking **−70.1%**

### The finding that matters most

**Scenario B leaves 578 beds empty and 562 people standing outside at the same
time.** Those two numbers are almost equal. There is no shortage in B — the
beds exist and go unused, while the people who need them cannot reach them.

That is a pure geography failure, and it is why C exists. C uses **exactly the
same number of beds as B**, distributed across **exactly the same 36 facilities**,
and changes nothing but where they sit. It shelters 540 more people and drops
turned-away to **zero**.

**Capacity gets you most of the way. Placement finishes the job — and nothing
else can.**

---

## Who this helps, and who it leaves behind

Percentage of each group that got inside:

| Group | Share of population | A | B | C |
|---|---|---|---|---|
| Everyone | 100% | 30.1 | 91.6 | **99.4** |
| Walks without difficulty | 80.1% | 32.7 | 96.4 | 99.4 |
| **Has trouble walking** | **19.9%** | **19.7** | **71.9** | **99.5** |
| Age 18–44 | 52.8% | 30.6 | 93.1 | 99.5 |
| Age 45–64 | 42.0% | 30.4 | 90.8 | 99.4 |
| **Age 65+** | **5.2%** | **22.4** | **82.4** | **99.4** |
| Has asthma | 14.8% | 29.2 | 90.6 | 99.4 |
| **Has COPD** | **10.8%** | **22.2** | **86.2** | **99.3** |
| Long-term physical condition | 39.6% | 30.2 | 91.1 | 99.7 |
| Counted as more vulnerable | 71.1% | 28.2 | 88.8 | 99.5 |

**Adding beds alone widens the gap. Placing them well closes it.**

Look at the mobility rows. In A the gap between people who walk easily and
people who don't is 13 points (32.7 vs 19.7). In B — after adding 4,608 beds —
the gap *grows to 24.5 points* (96.4 vs 71.9), because extra beds at existing
locations are captured first by whoever can walk fastest. In C the gap is
**0.1 points**. Placement is not merely more efficient than capacity; it is the
only one of the two that is equitable.

The same pattern holds for age 65+ (22.4 → 82.4 → 99.4) and COPD
(22.2 → 86.2 → 99.3). COPD tracks mobility because COPD is the one condition
with a measured walking-speed decrement (−0.19 m/s, Buekers 2024). Asthma
shows almost no access penalty, and that is correct, not an omission: no
gait-speed evidence exists for asthma, so inventing one would have manufactured
the finding.

---

## The population is real, and so is every starting point

Residents are placed at **2,981 distinct real City-of-Portland campsite report
locations**, and every result row now carries the actual start coordinate
(`start_lon`, `start_lat`) so the demand geography can be audited without
re-joining any file.

Sampled attributes reproduce their published marginals:

| Attribute | Target | Realised | Source |
|---|---|---|---|
| Age 18-44 / 45-64 / 65+ | 52.7 / 42.3 / 5.0% | **52.8 / 42.0 / 5.2%** | Pathways 2026 (local) |
| Male / Female / other | 68.4 / 29.3 / 2.3% | **68.6 / 29.2 / 2.2%** | 2019 PIT |
| Mobility limitation | 19.2% | **19.9%** | 2019 PIT (lower bound) |
| Asthma | 15.0% | **14.8%** | Zellmer 2025 |
| COPD | 10.5% | **10.8%** | Zellmer 2025 |
| Long-term physical condition | 39.1% | **39.6%** | Pathways 2026 (local) |

Attributes are drawn from a separate RNG stream, so the three arms contain the
**same people with the same bodies standing in the same places** — only the
shelters differ.

---

## What you can read

`docs/final/results-2026/`

| File | What it is |
|---|---|
| `1_EVERY_PERSON.csv` | one row per person: who they are, where they started, what happened |
| `2_BY_GROUP.csv` | the same outcomes broken down by age, sex, mobility, asthma, COPD |
| `3_WHOLE_POPULATION.csv` | the headline table, all three seeds |
| `4_WHERE_PEOPLE_STARTED.csv` | the 2,981 real encampment locations and how many started at each |
| `5_EVERY_SHELTER.csv` | every facility: where it is, how full it got, how many it turned away |
| `figures/fig1_headline.png` | got inside / turned away / hours in smoke |
| `figures/fig2_empty_beds_vs_turned_away.png` | the geography failure in one picture |
| `figures/fig3_by_group.png` | who gets inside, by group |
| `figures/fig4_map.png` | where people are vs where the beds are |
| `figures/fig5_walking.png` | how far people had to walk |
| `figures/fig6_dose.png` | smoke actually breathed in |

---

## What this does and does not claim

**The claim:** *optimized shelter placement improves outcomes under the modelled
assumptions* — and, added by this run, *capacity expansion alone does not
distribute those improvements equitably.*

**Not claimed:** that this recreates what happened in 2020. It does not, and
calibration does not support it. This is a present-day question asked with a
historical smoke field.

### Limitations that bear on these numbers

1. **Scenario C's sites are street-network nodes, not real venues.** They are
   theoretical optima, not buildings with filtered indoor air. C is an upper
   bound on what placement can buy, not a construction plan.
2. **Scenario B's uniform 3.06× scale-up is a modelling construct**, not an
   operational proposal. Real buildings have physical limits.
3. **Two City facilities are still missing** — Clinton Triangle (160 units, the
   single largest site) and Multnomah Safe Rest Village (28), neither of which
   publishes a street address. Real capacity is ~207 people higher than modelled.
4. **Ten day centres are excluded** because none publishes a capacity. In a
   *daytime* smoke episode these are plausibly the most relevant clean-air
   spaces that exist, so A understates daytime shelter availability.
5. **Three shelter coordinates are block- or intersection-level**, accurate to a
   few hundred metres.
6. **Sex and mobility distributions are 2019** inside an otherwise 2026 study;
   no local replacement was found.
7. **Asthma and COPD prevalences are imported from Minnesota** (Zellmer 2025);
   no local figure exists.
8. **A-12 — everyone is assumed to know the shelters exist.** Local survey
   evidence says 65% never heard of them. Every "got inside" number here is
   therefore an **upper bound**.
9. **A-16 — admission is order-dependent**; residents are served in shuffle
   order rather than by need. This matters most in A, where capacity binds hard.
10. **Encampment locations are 2025–26 reports** used as a spatial proxy for
    2020, and they are complaint-driven, so they carry visibility bias.
11. **All 36 facilities are modelled as open from hour 0**, appropriate for a
    year-round present-day system but not a claim about activation timing.
