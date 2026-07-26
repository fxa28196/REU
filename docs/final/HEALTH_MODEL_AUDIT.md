# Health Model Audit

**Question:** does this model represent human biology defensibly, and is every
biological quantity separated from every physical one?

**Audit date:** 2026-07-26 · **Model commit:** `b69fc6d`

---

## 0. The governing principle

Three quantities existed in confused form before this pass. They are now three
separate columns, computed in three separate places, and **never multiplied
together by accident**:

| # | Quantity | Formula | Units | Domain | Status |
|---|---|---|---|---|---|
| 1 | **Exposure** | Σ C(t)·Δt | µg·m⁻³·h | Physics of the **air** | Implemented, externally validated |
| 2 | **Inhaled dose** | Σ C(t)·IR(activity)·Δt | µg | Physics of the **person** | Implemented this pass |
| 3 | **Health risk** | dose × susceptibility | µg-equivalent | **Biology** | Slot implemented, weight = 1.0 |

**The cardinal rule enforced in code:** ventilation may vary with *activity*
(walking vs waiting) because that is measurable physics. Susceptibility may
never enter the dose term, because that is biology and no defensible
person-level coefficient exists for this population.

`GisAgent.getHealthRiskMultiplier()` returns **1.0 for every resident, by
design**. It exists so that (a) a sourced coefficient has exactly one place to
land, and (b) a reader can see that risk weighting is *switched off* rather than
*absent*.

---

## 1. Exposure — unchanged, and deliberately so

`exposureUgM3h += c · dtHours` accumulates every tick a resident is not
`SHELTERED`. This engine was independently validated during the audit: an
independent recomputation from the raw EPA AQS file over the 312-hour window
gives **54,002.7 µg·m⁻³·h** against the model's **54,002.8** (ratio **1.0000**),
and **194 hours above the 55.5 µg/m³ breakpoint** against the model's 194.

**No change was made to it.** It remains a *concentration-time integral* — an
environmental exposure metric, not an inhaled mass — as assumption **A-15**
states.

---

## 2. Inhaled dose — implemented, with sourced activity-dependent ventilation

### 2.1 What was added

```
inhaledDoseUg       += C(t) · IR(activity) · Δt        [µg]
airVolumeBreathedM3 += IR(activity) · Δt               [m³]
```

`IR` depends **only** on whether the resident is walking:

| Activity state | Ventilation | Basis |
|---|---|---|
| Walking (`EN_ROUTE`) | **1.62 m³/h** | Moderate-intensity adult activity-level inhalation rate, U.S. EPA *Exposure Factors Handbook* (2011) Ch. 6 |
| Outdoors, not walking (`PRE_EVAC`, stranded `REFUSED_ALL_FULL`) | **0.61 m³/h** | Light-intensity adult cell, same source |
| Sheltered | 0 (exposure ends at admission — the study endpoint) | DESIGN_SPEC |

**Evidence class: L, VERIFIED-IN-SECONDARY.** The EFH activity-level structure is
standard and the categories are correct for the activities modelled, but the
specific table cells were **not re-read from the primary document during this
implementation**. They therefore carry sweep ranges — walking **1.2–2.0**,
resting **0.4–0.8 m³/h** — and must be confirmed against EFH Chapter 6 before
publication. This is the same honesty convention already used for Boyce 1999.

Comfortable walking at ~1.3 m/s is roughly 3.3 METs, which sits at the
light/moderate boundary; the moderate cell was chosen because evacuation walking
is sustained and frequently load-carrying. That choice is conservative in the
direction that *increases* modelled dose while walking — the direction that makes
the placement finding harder to obtain, not easier.

### 2.2 Verification

Realised mean ventilation across the population is **0.637 m³/h**, correctly
between the resting and walking values and close to the resting value because
most outdoor time is spent waiting rather than walking. The dose-to-exposure
ratio is **0.714 m³/h**, likewise inside the bracket. `health_risk_score` equals
`inhaled_dose_ug` in 100% of rows, confirming the weight is genuinely 1.0.

### 2.3 Why this mattered — the finding it produced

Separating dose from exposure was not bookkeeping. It changed the headline.

Optimized placement reduces **exposure by 5.65%** but **inhaled dose by 12.57%**
— more than double. The mechanism is exact: better placement removes *walking*
time specifically, and walking is when ventilation is 2.7× higher.
Concentration-time exposure counts an hour spent waiting the same as an hour
spent walking; inhaled dose does not.

**Reporting exposure alone understates the benefit of good shelter placement by
more than half.** That is a real methodological result, and it is only visible
because the two quantities were separated.

---

## 3. Health risk — deliberately inert, and why

### 3.1 What was searched

Whether any defensible **population-specific** coefficient exists to convert
inhaled dose into differential health burden for adults experiencing
unsheltered homelessness with asthma or COPD.

### 3.2 What was found

The wildfire-smoke epidemiology is real but is the **wrong kind of quantity**:

| Source | Estimate | Why it cannot be a per-agent multiplier |
|---|---|---|
| Alman et al. 2016, [10.1186/s12940-016-0146-8](https://doi.org/10.1186/s12940-016-0146-8) | Asthma ED-visit OR 1.04–1.07 per 5 µg/m³ | Population-rate response to concentration, not a between-person contrast |
| DeFlorio-Barker et al. 2019, [10.1289/EHP3860](https://doi.org/10.1289/EHP3860) | Asthma hospitalisation +6.9% per 10 µg/m³ on smoke days | Same — a rate change, not an individual susceptibility ratio |
| Rappold et al. 2011 | COPD RR 1.73 | County-level dichotomous exposure; using it per-agent is a scale error |
| Kondo 2019 meta-RRR | Elderly:adult 1.008 (0.996–1.020) | Null; and the same data yield 1.008–2.5 depending purely on scale choice |

The discredited slide values (RR_age ×1.45 "Di 2017", RR_COPD ×1.80 "Anderson
2013") were checked against their cited primaries and **do not appear in them**:
Di 2017's cohort is entirely 65+ and cannot yield an age contrast, and the
"Anderson 2013" reference does not exist.

### 3.3 Decision

**Health risk weighting remains 1.0 for every resident.** Reported as
susceptibility-**stratified** exposure and dose instead of a weighted index
(decision D-3). Assumptions **A-09** (weights inert) and **A-22** (inhalation
identical regardless of diagnosis) both remain registered.

### 3.4 Required wording

> *Asthma and COPD increase susceptibility to smoke exposure but were not
> converted into extra inhaled dose, because no population-specific dose
> multiplier was identified. Ventilation is modelled as a function of physical
> activity only.*

---

## 4. Where vulnerability legitimately acts

Vulnerability affects outcomes through **one mechanism the model actually
simulates**, and it is a physical one:

> **slower walking → longer time outdoors → more air breathed at the higher
> walking ventilation rate → greater inhaled dose**

| Attribute | Affects speed? | Affects ventilation? | Affects risk weight? | Evidence |
|---|---|---|---|---|
| Mobility limitation | **Yes** — replaced by N(0.95, 0.32) m/s | Indirectly, via time walking | No | Boyce 1999 via Tinaburri 2018 |
| COPD | **Yes** — −0.19 m/s additive | Indirectly | No | Buekers 2024, [10.1183/16000617.0253-2023](https://doi.org/10.1183/16000617.0253-2023): 25 studies, 1,015 vs 2,229 controls, −19 cm/s (95% CI −28 to −11), authors rate evidence **low** |
| Age | Yes — via age×sex gait means | Indirectly | No | Bohannon & Williams Andrews 2011 |
| Sex | Yes — gait-speed column only | No | No | Same |
| **Asthma** | **No** | No | No | **No quantitative gait-speed estimate found.** Literature supports lower physical *activity volume*, which cannot be converted to m/s without invention |

The asthma/COPD asymmetry is **deliberate and is itself a reportable finding**:
a gap in the evidence base made visible, not a modelling preference.

### Verified in the results

Mobility-limited residents walk at 0.99 m/s vs 1.37 m/s and, in the current-
placement arm, inhale **3,302 µg vs 2,547 µg** — a 29.6% higher dose arising
entirely from time outdoors. Placement improvement helps them **most**
(−16.7% dose vs −11.3% for unimpaired), because they spend the longest walking.
Asthma shows **no differential** (−12.3% vs −12.6%), exactly as designed.

---

## 5. Open limitations

1. **EFH cell values are verified-in-secondary.** Confirm against the primary;
   sweep 1.2–2.0 / 0.4–0.8 m³/h in the meantime.
2. **No age effect on ventilation.** EFH reports lower rates in older adults; not
   implemented because the interaction with the walking/resting split was not
   sourced. Direction: would slightly *reduce* older residents' dose, partially
   offsetting their longer exposure time.
3. **No body-mass or load effect on ventilation.**
4. **No severity tiers** — asthma and COPD are binary. No FEV₁ strata, GOLD
   stage, or controlled/uncontrolled split was found for this population.
5. **Health risk is inert.** The model measures exposure and inhaled dose. It
   does **not** predict illness, hospitalisation, or death, and no output should
   be described as a health outcome.
6. **Deposition is not modelled** — inhaled mass is not retained mass.
7. **COPD × mobility is not stacked** by design (Boyce categories already embed
   an impaired walker); whether this under- or over-states the joint effect is
   untested.
