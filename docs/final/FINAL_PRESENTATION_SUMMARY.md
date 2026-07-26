# What did the simulation find?

**Portland, September 2020 wildfire smoke. 2,037 unsheltered residents. 198 clean-air shelter beds.**

---

## The one-sentence answer

> **Shelter capacity — not shelter location — decided who breathed wildfire smoke, and the
> few beds available went disproportionately to people who could walk fastest.**

---

## 1. Current shelter placement (Scenario A) — what actually happened

| | Result |
|---|---|
| Reached shelter | **198 of 2,037 — 9.7%** |
| Turned away, every shelter full | **~1,824 people** |
| No walking route to any shelter | ~15 people |
| Beds used | 198 of 198 — **100% full** |
| Smoke exposure, sheltered residents | 3,292 µg/m³·h |
| Smoke exposure, everyone else | **54,003 µg/m³·h — 16× higher** |
| Hours in "Unhealthy" air, unsheltered | **194 hours each** |
| Distance walked by people who were turned away | **15.9 km on average — for nothing** |

Both shelters filled completely. Identical in all three random seeds.

---

## 2. Optimized shelter placement (Scenario B) — could better siting have helped?

We moved the same 198 beds to the mathematically optimal locations on Portland's street
network and re-ran everything.

| Measure | Current (A) | Optimized (B) | Change |
|---|---|---|---|
| **People reaching shelter** | 198 | **198** | **no change** |
| Total population smoke exposure | 99,962,958 | 99,933,295 | **−0.03%** |
| Distance walked by those admitted | 8,692 m | 5,335 m | −38.6% |
| Vulnerable residents sheltered | 6.19% | 6.53% | +0.34 pts |

**Optimizing shelter locations changed nothing that matters.** It shortened the walk for
the people who were already going to get a bed. It did not shelter one additional person.

---

## 3. Is placement or capacity the limiting factor?

### Capacity. Unambiguously.

The evidence is that Scenario B — the *best possible* siting of 198 beds — still sheltered
exactly 198 people and cut population exposure by three hundredths of one percent.

To confirm this, we ran a third scenario in which capacity was removed as a constraint
(**Scenario C**, a demonstration only — **not** real 2020 availability):

| Measure | Current capacity (A) | Capacity-neutral (C) | Change |
|---|---|---|---|
| **People reaching shelter** | 198 (9.7%) | **2,022 (99.2%)** | **+921%** |
| Total population smoke exposure | 99,962,958 | 7,669,225 | **−92.3%** |
| Person-hours in "Unhealthy" air | 359,794 | 34,948 | **−90.3%** |

**Adding beds reduces population smoke exposure by 92%. Moving beds reduces it by 0.03%.**

That is a factor of roughly **3,000× difference** in effectiveness between the two
interventions.

---

## 4. Which populations experienced higher exposure?

Under real (scarce) capacity, the beds did not go to the people least able to endure the
smoke. They went to the people who could walk to them fastest.

| Group | Reached shelter | Walking speed | Smoke exposure | Hours in "Unhealthy" air |
|---|---|---|---|---|
| **People with COPD** | **3.1%** | 1.15 m/s | 52,406 | 188.3 |
| Without COPD | 10.5% | 1.31 m/s | 48,673 | 175.2 |
| **People with mobility limitations** | **3.6%** | 0.99 m/s | 52,119 | 187.3 |
| Without mobility limitations | 11.2% | 1.37 m/s | 48,346 | 174.1 |
| **Any vulnerability** (55+, mobility, asthma or COPD) | **6.2%** | 1.18 m/s | 50,850 | 182.9 |
| No vulnerability | 13.0% | 1.40 m/s | 47,405 | 170.8 |
| People with asthma | 9.0% | 1.29 m/s | 49,501 | 178.2 |
| Without asthma | 9.9% | 1.29 m/s | 48,992 | 176.3 |

**Residents with COPD or mobility limitations were roughly 3× less likely to get a bed.**

### Why asthma shows almost no difference — and why that is the honest answer

Asthma barely moves the numbers (9.0% vs 9.9%) because **in this model asthma does not
slow anyone down**. We searched the literature for a quantitative walking-speed effect of
asthma and did not find one, so we did not invent one.

COPD *does* show a large effect because there **is** a verified measurement: a 2024
meta-analysis of 25 studies found people with COPD walk 0.19 m/s slower than healthy
controls. That slower walking is what produces the access gap.

**The model reports what the evidence supports and nothing more.** Asthma and COPD are
both tracked so subgroup analysis is possible, but only COPD carries a movement effect,
and neither is used to inflate anyone's inhaled dose.

### The mechanism, in one line

> **Mobility limitation or COPD → slower walking → longer outdoors → more smoke inhaled,
> and a higher chance the last bed is gone on arrival.**

### What removing the bottleneck reveals

In Scenario C, where nearly everyone gets indoors, the *access* gap disappears — but an
*exposure* gap survives:

| Group | Exposure, capacity-neutral | vs comparison group |
|---|---|---|
| Mobility-limited | 4,388 | **+21%** |
| Not mobility-limited | 3,619 | — |
| Any vulnerability | 4,006 | **+13%** |
| No vulnerability | 3,542 | — |

Even with a bed guaranteed for everyone, slower residents still breathe more smoke,
because they spend longer walking. **Capacity solves most of the problem; it does not
solve all of it.**

---

## 5. What interventions would reduce exposure most?

Ranked by the effect measured in this simulation:

| Rank | Intervention | Modelled effect | Confidence |
|---|---|---|---|
| **1** | **More shelter capacity** | **−92% population exposure** | Directly measured (Scenario C) |
| **2** | **Open shelters earlier** | Shelters opened 10–11 September, days into the smoke event. Every resident accrued the full outdoor dose until then. In this model, opening earlier removes far more exposure than any relocation | Inferred from the timeline; not separately simulated |
| **3** | **Transport, or bringing shelter to people** | Slower residents lose the race for beds. Removing walking from the equation would break the speed-based rationing | Mechanism demonstrated; specific intervention not simulated |
| **4** | **Prioritized admission for vulnerable residents** | Admission is currently first-come-first-served, which is what produces the 3× disparity. A triage policy would redistribute the same beds | Mechanism demonstrated; policy not simulated |
| **5** | **Better shelter siting** | **−0.03% population exposure** (but −39% walking distance for those admitted) | Directly measured (Scenario B) |

**The headline policy implication:** siting optimization is the *least* effective of these
options by three orders of magnitude. Capacity and timing dominate.

---

## 6. What this study does not claim

- **No health outcomes.** Exposure is measured as a time-integrated concentration index,
  not an inhaled dose and not a prediction of illness, hospitalization or death.
- **No claim that asthma or COPD multiply harm.** They are tracked for subgroup reporting.
  COPD affects walking speed because that is measured; neither changes inhaled volume,
  because no population-specific evidence supports that.
- **Scenario C is not real availability.** It is a demonstration that isolates the effect
  of capacity, and must never be presented as 2020 shelter provision.
- **The 9.7% arrival rate is optimistic.** The model assumes everyone knows the shelters
  exist; a Portland State survey found 65% of unhoused residents had never heard of them.
  Real access was almost certainly worse.
- **Bed counts are unconfirmed.** 99 per shelter is newsroom-sourced; see
  [`SHELTER_CAPACITY_AUDIT.md`](SHELTER_CAPACITY_AUDIT.md).

---

*All figures are means across three random seeds (42, 43, 44) at n = 2,037 residents.
Underlying data: [`QUICK_RESULTS_SUMMARY.csv`](QUICK_RESULTS_SUMMARY.csv) and
`analysis/`. Full methodology and limitations:
[`FINAL_RESULTS_REPORT.md`](FINAL_RESULTS_REPORT.md).*
