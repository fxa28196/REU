# Shelter Capacity Audit

**Question audited:** is the model's 198-bed figure (99 per shelter, September 2020)
defensible, and do Multnomah County's official shelter data sources confirm, refute, or
refine it?

**Audit date:** 2026-07-26 · **Sources consulted:**
[hsd.multco.us/emergency-shelters/list-of-shelters](https://hsd.multco.us/emergency-shelters/list-of-shelters/) ·
[hsd.multco.us/emergency-shelters/day-centers](https://hsd.multco.us/emergency-shelters/day-centers/) ·
[hsd.multco.us/data-dashboard](https://hsd.multco.us/data-dashboard/)

---

## 0. Headline finding

> **The official county sources describe a different shelter system, at a different time,
> serving a different purpose. They can neither confirm nor refute the September 2020
> clean-air shelter capacity.**

The model's 198-bed figure therefore **stands unchanged**, and assumption **A-04**
(capacity is newsroom-sourced and unconfirmed) **remains blocking**.

The audit did, however, produce three things of value: a documented unit-conversion
method (§2), a defensible total for the *current* system (§3), and the justification for
the capacity-neutral demonstration scenario (§5).

---

## 1. Why the official sources do not settle the question

Three mismatches, each independently disqualifying for direct substitution:

| Mismatch | Detail |
|---|---|
| **Time** | The shelter list is stamped **"updated July 2026"** — nearly six years after the September 2020 smoke event. Several entries carry 2026 closure dates (Laurelwood, River District Navigation Center, Walnut Park by 8/31/2026; Roseway Inn by 12/31/2026), so the system is actively contracting. |
| **Purpose** | The listed sites are the **year-round emergency shelter system** (congregate, motel, village, family, youth). The September 2020 sites were **temporary clean-air/smoke-respite activations** of large public venues — the Oregon Convention Center and Charles Jordan Community Center — that are *not* year-round shelters and do not appear on this list. |
| **Function** | Clean-air shelters existed to provide filtered indoor air during a smoke episode. Their capacity constraint was the venue and staffing available for a nine-day activation, not the standing bed inventory. |

Substituting a 2026 year-round bed count for a 2020 smoke-respite capacity would be a
**temporal and functional category error** — the same class of mistake this project
already documented for encampment locations (A-03) and refused for prevalence data
(ACS/BRFSS exclusion of unsheltered people).

**Day centers** ([source](https://hsd.multco.us/emergency-shelters/day-centers/)): 11
listed, **no capacity figures published for any of them**, and all are explicitly
daytime-only services — "an indoor space for people to escape the elements and get their
basic needs met." **None is described as a smoke, heat, or weather respite location.**
They contribute nothing to an overnight-capacity figure.

**Data dashboard** ([source](https://hsd.multco.us/data-dashboard/)): the landing page
carries no figures; the data is behind an interactive Tableau embed. No static
2020-vintage capacity or smoke-activation series was retrievable. Flagged as unresolved.

---

## 2. Unit-conversion method (the reusable product of this audit)

The instruction *"do not assume every listed number is beds"* is well founded — the
official list mixes **five incompatible units**. Conversion rules below; every rule states
its basis, and every uncertain rule is given a **range** rather than a point estimate.

| Unit as published | Count | People per unit | Basis for the conversion |
|---|---|---|---|
| **Beds** ("88 congregate beds", "90 year-round beds") | 1,066 | **1.0** (exact) | A bed is one sleeping place for one person. No conversion needed. |
| **Motel rooms** (adults; "individuals and couples") | 341 | **1.0 – 1.5** | The listings state these serve individuals *and couples*, so occupancy is at least 1 and at most 2. The range brackets an unknown couple share; 1.5 would mean half the rooms hold couples. |
| **Village units / pods / sleeping units** | 205 | **1.0 – 1.2** | Village units are predominantly single-occupancy; one site (St Johns) lists "men, women, couples", so a small couple share is possible. |
| **Family units** ("28 families", "39 personal rooms for families") | 85 | **2.5 – 4.0** | A household, not a person. No local sheltered-family size was published, so the range spans a small family (adult + child) to a larger one. **This is the weakest conversion in the table.** |
| **Unstated** (youth shelters listed as "30") | 60 | **1.0** | The unit is not stated; treated as people, which is the most conservative reading (it cannot inflate the total). |

**Rule applied throughout: never convert an ambiguous unit to a single number.** Where the
unit is unclear, the result is reported as a range and the ambiguity is named.

---

## 3. Current (July 2026) county-wide capacity, converted

Applying §2 to the published list:

| Category | Published | People (low) | People (high) |
|---|---|---|---|
| Congregate beds | 1,015 beds | 1,015 | 1,015 |
| Village pods stated as beds | 18 beds | 18 | 18 |
| Behavioral Health Resource Center | 33 beds | 33 | 33 |
| Motel rooms (adults) | 341 rooms | 341 | 512 |
| Village sleeping units / pods | 205 units | 205 | 246 |
| Family units and family rooms | 85 families | 213 | 340 |
| Youth (unit unstated) | 60 | 60 | 60 |
| **Total** | | **≈ 1,885** | **≈ 2,224** |

> **Defensible statement:** *Multnomah County's entire year-round emergency shelter system
> in July 2026 provides indoor space for roughly **1,900–2,200 people**, subject to the
> unit conversions above.*

**Caveats that must travel with that number:**
- It is a July 2026 figure, not a 2020 one.
- Multiple listed sites have announced 2026 closures, so the true forward figure is lower.
- It counts *year-round* shelter, which is not interchangeable with smoke-respite capacity.
- The family conversion (§2) is the dominant source of the ±170-person spread.

---

## 4. What the model uses, and why it is unchanged

| Parameter | Value | Status |
|---|---|---|
| Scenario A/B shelter capacity | **99 per site × 2 sites = 198** | Newsroom-sourced, contemporaneous, **unconfirmed by any agency document** |
| Registry assumption | **A-04** | **Remains `blocking`** |

The 99-bed figure comes from contemporaneous September 2020 news reporting and is
consistent across the reports checked, but no primary agency document confirms it. This
audit did not find one. The honest position is unchanged: **the headline arrival rate
scales directly with total beds, so 9.7% should be read as "≈198 beds' worth of access",
not as a precise percentage.**

**What would resolve it:** a Joint Office of Homeless Services or county emergency
management after-action report for the September 2020 smoke episode, or the venue
activation agreements. Neither is published on the sources consulted.

---

## 5. Justification for the capacity-neutral demonstration scenario

The audit incidentally supplies the defence for **Scenario C**, whose total capacity is
set to 2,037 (one space per simulated resident).

That number is **not arbitrary**: it sits inside the §3 range for the county's *entire
current* year-round shelter system (≈1,900–2,200 people). So Scenario C can be described
precisely as:

> *"What if smoke-respite capacity had been on the scale of the county's whole present-day
> shelter system, rather than two activated venues?"*

That is a meaningful, bounded counterfactual rather than an unbounded fantasy — while
still being explicitly **not** a claim about what existed in 2020.

**Relative capacities within Scenario C are held at 1:1** (1,019 / 1,018), matching the
equal per-site capacities the 2020 source reports, so shelters still fill in sequence and
residents still redirect. The scenario is labelled
`C_capacity_neutral_demonstration` in every export, and its shelter file carries the
capacity basis string `DEMONSTRATION_ONLY_capacity_neutral_not_real_availability` so the
label cannot be lost downstream.

---

## 6. Recommendations

1. **Keep A-04 blocking** until a primary source is obtained. Do not substitute 2026 data.
2. **Quote the arrival rate as capacity-relative**: "198 beds' worth", with the percentage
   secondary.
3. **Quote the §3 range only as present-day context**, never as 2020 availability.
4. **If a reviewer supplies 2020 activation records**, the fix is a one-line change to
   `Geography/data/shelters/shelters_2020-09.csv`; nothing in the model hard-codes 99.
5. **Sweep capacity** whenever refusal counts are quoted — already the registered A-04
   sensitivity plan, and now supported by the Scenario C machinery.

---

## 7. Unresolved

- No primary agency confirmation of September 2020 clean-air shelter capacity.
- The Tableau dashboard was not machine-readable through this audit path; a manual export
  might contain a 2020 series.
- Whether the 2020 venues had a stated maximum occupancy distinct from the 99 figure
  (a convention center's fire-code occupancy vastly exceeds 99, so 99 was plainly an
  operational/staffing limit rather than a physical one — but that reasoning is inference,
  not a source, and is recorded here as such).
