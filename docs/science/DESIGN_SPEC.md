> **SUPERSEDED — HISTORICAL RECORD ONLY.** This document describes an earlier
> state of the model and does not reflect the final submission. For the current
> model and results see `docs/final/UPDATED_FINAL_RESULTS_REPORT.md` and the
> audits alongside it. Retained for provenance.

# Model Design Specification

The scientific contract for every model component, written **before**
implementation. Programming follows this document; where implementation and
this document disagree, this document is the defect report.

**Evidence classes** used throughout â€” every quantity in the model carries
exactly one:

| Class | Meaning | Publication rule |
|---|---|---|
| **M â€” Measured** | Read from an acquired dataset; no modelling choice | Cite the dataset (DATA_SOURCES.md) |
| **L â€” Literature** | Point estimate or CI from a peer-reviewed/government source | Cite paper + DOI; sweep the CI |
| **C â€” Calibrated** | Fitted or tuned so the model reproduces an observed quantity | Report the target, the fit, and the residual |
| **A â€” Assumption** | A modelling decision with no external source | Must be stated in results; must be swept |
| **F â€” Future work** | Specified but not implemented | Never silently defaults into results |

Companion documents: [`DATA_SOURCES.md`](DATA_SOURCES.md) (where values come
from), [`VALIDATION_STRATEGY.md`](VALIDATION_STRATEGY.md) (how each subsystem is
proven), [`VARIABLES.md`](VARIABLES.md) (registry of what is *already*
implemented), [`BIBLIOGRAPHY.md`](BIBLIOGRAPHY.md).

---

## Part I â€” The central metric

The project's central quantity (slide 4) is **vulnerability-weighted exposure**:

> VWE_i = Î£_t  C(x_i(t), t) Â· RR_age(a_i) Â· RR_com(c_i) Â· Î”t

for agent *i*, position x_i(t), ambient concentration C, and Î”t = one tick in
hours. Three structural decisions are specified here and inherited by
everything below.

**Decision 1 â€” multiplicative risk weighting is a *weighting* scheme, not an
epidemiological prediction.** VWE has units of ÂµgÂ·mâ»Â³Â·h and is an *exposure
burden index*, not a count of deaths or hospitalisations. This must be stated
in every results caption. Reporting it as "health outcomes" would overclaim:
converting exposure to attributable cases requires a baseline incidence rate
and a concentrationâ€“response function evaluated over the same averaging period
as the source epidemiology, which this model does not currently do (see V7
option B and F1).

**Decision 2 â€” the study endpoint is ARRIVAL AT SHELTER; indoor air quality is
out of scope.** Exposure accumulates only while a resident is outside and stops
the moment they are admitted to a shelter. Residents who never reach shelter keep
accruing for the whole event. Shelter benefit is therefore the reduction of
outdoor exposure *time* through better placement and accessibility â€” not indoor
filtration. The indoor/outdoor ratio Î³ a filtration model would require is
unsupported by any acquired data and unrequested by the slides or mentor, so it
is deliberately excluded (rationale in AUDIT.md Â§0). If the advisor later wants
indoor performance modelled, it re-enters as documented future extension
F-INDOOR, never as a silent default.

**Decision 3 â€” exposure accrues for *every* agent in *every* state.** Sheltered,
en-route and unreachable agents all accumulate exposure (at different
concentrations). This is already enabled by the persistent-state design
(commit `7318f9b`).

---

## Part II â€” Variable specifications

### V5 â€” PM2.5 concentration field `C(x, t)` Â· class **M** (+ **A** for the interpolant)

- **Scientific purpose.** The exposure term; the only environmental driver.
- **Mechanism.** Regional smoke inundation from the Labor Day 2020 Oregon
  wildfire complex; concentrations rose ~100Ã— above baseline for ~9 days
  (measured: Multnomah daily mean 4.0 Âµg/mÂ³ on Sep 8 â†’ 426.9 on Sep 13).
- **Data.** D3 â€” 7 monitors, hourly, Âµg/mÂ³ (ACQUIRED).
- **Mathematical formulation â€” two options, with a decision rule:**
  - **Option A (recommended first implementation): county-uniform hourly field.**
    C(x,t) = mean of Multnomah monitors at hour t. Spatially uniform.
    *Rationale:* with **2 monitors inside the county**, any spatial interpolant
    is fitting 2 points â€” the apparent gradient would be an artefact of monitor
    siting, not a measured feature. A uniform field makes the (large) spatial
    uncertainty explicit rather than hiding it behind smooth colour.
    *Consequence:* under a uniform field, differences between placement
    strategies arise **only** from travel time and shelter access â€” a clean,
    honest, interpretable first result.
  - **Option B: inverse-distance weighting over all 7 tri-county monitors,**
    C(x,t) = Î£ w_k C_k(t) / Î£ w_k, w_k = d_k^(âˆ’p), p = 2 (**A**).
    *Adopt only if* leave-one-out cross-validation (VALIDATION_STRATEGY Â§5)
    shows IDW beats the uniform field on held-out monitors.
- **Implementation.** `SmokeField` class; hourly slices indexed by tick via V13;
  exposed to agents through the `Geography` coverage machinery **or** a direct
  lookup (coverage layers were removed in commit `eaa9605`; re-declare a
  properly named `PM25` coverage in `context.xml` when this lands).
- **Interactions.** Feeds V6, V7, V8 (exposure accrues only while a resident is
  outside; accumulation stops at shelter arrival â€” Decision 2).
- **Computational cost.** Option A: O(1) per agent-tick after an O(monitors)
  hourly update â€” negligible. Option B: O(7) per agent-tick, still trivial.
- **Assumptions.** Monitor readings represent outdoor ambient concentration at
  breathing height; no personal-exposure microenvironment modelling.
- **Limitations.** Non-FRM instruments (D3); 2 in-county monitors; no vertical
  structure; no indoor sources.
- **Validation.** VALIDATION_STRATEGY Â§5.
- **Sensitivity.** Field choice (A vs B) is itself a sweep axis; report whether
  strategy rankings are invariant to it. If they are not, that is a *finding*,
  not a failure.

### V13 â€” Tickâ†”time mapping Â· class **A** (implemented)

1 tick = 1 simulated minute; 60 ticks per hourly PM2.5 slice. Already
implemented (`minutesPerTick`); rationale in VARIABLES.md. **Change required:**
the run must be anchored to a wall-clock start (`simulationStartDateTime =
2020-09-07T00:00`) so tickâ†”timestamp is unambiguous. The full event is
18,720 ticks (312 h at 1 min/tick).

### Evacuation timing Â· model **A**, threshold **L** â€” implemented (AUDIT.md #1)

Residents start in state `PRE_EVAC` at their encampment and **shelter in place,
accruing outdoor exposure, until local PM2.5 first reaches
`evacuationThresholdUgM3`** (default 55.5 Âµg/mÂ³, the EPA "Unhealthy" AQI
breakpoint â€” DATA_SOURCES D9, a sourced value), then transition to `EN_ROUTE`.
This ties evacuation to the smoke event rather than assuming everyone leaves at
t0, and is the fix for the audit's highest-priority validity issue (absolute
exposure was dominated by a Sept-7 evacuation start). **Assumptions:** all
residents share one threshold and respond immediately; heterogeneous
awareness/willingness is future work (F3). **Refinement tracked:** also gate on
shelter operating dates (shelters opened Sep 10â€“11; a brief Sep 7 PM2.5 spike
can trigger evacuation slightly before shelters existed).

### V1 / V2 â€” Age and RR_age Â· class **L**, currently **BLOCKED**

- **Purpose.** Age is the first vulnerability channel.
- **Mechanism.** Age-related decline in pulmonary reserve and higher prevalence
  of cardiopulmonary disease raise the health impact of a given PM2.5 dose.
- **âš ï¸ Status.** The slides' Ã—1.45-for-65+ is **not supported by Di et al. 2017**
  (DATA_SOURCES D5 â€” that cohort is entirely 65+ and reports HR 1.073 per
  10 Âµg/mÂ³). **This value must not be coded on that citation.**
- **Formulation â€” options:**
  - **Option A (categorical, as per slides):** RR_age = 1.45 if age â‰¥ 65 else
    1.0. *Requires a real source; currently has none.*
  - **Option B (recommended): concentrationâ€“response.** Weight = exp(Î²Â·C) or
    the linear approximation 1 + (HRâˆ’1)Â·C/10 with **HR = 1.073 per 10 Âµg/mÂ³
    (Di et al. 2017, CI 1.071â€“1.075)** applied to the 65+ stratum. Properly
    sourced, uses the CI directly as the sweep range, and avoids inventing a
    threshold multiplier.
- **Age distribution.** From the 2019 PIT report's age tables (D2), **not**
  invented. Until extracted, agents carry no age and RR_age â‰¡ 1.0.
- **Interactions.** Multiplies into V7; correlates with V10 (walking speed) and
  V3 (comorbidity) â€” the model should not treat these as independent without
  saying so.
- **Cost.** O(1) per agent, set once at initialisation.
- **Assumptions (if Option A is ever used).** A step change at exactly 65 is a
  modelling convenience, not a biological threshold.
- **Validation.** Unit test: an agent at a known constant concentration for a
  known duration accumulates exactly CÂ·RRÂ·Î”t.
- **Sensitivity.** Sweep the published CI; additionally run RR_age â‰¡ 1 to show
  how much of the strategy ranking depends on age weighting at all.

### V3 / V4 â€” Comorbidity (COPD, asthma) and RR_com Â· class **L** + **C**, currently **BLOCKED**

- **âš ï¸ Status.** The Ã—1.80 COPD figure attributed to "Anderson et al. 2013" is
  unverified (DATA_SOURCES D6). Replacement literature identified: Reid et al.
  2016 (DOI 10.1289/ehp.1409277) and DeFlorio-Barker et al. 2019
  (DOI 10.1289/EHP3860) â€” effect estimates still to be extracted from full text.
- **Formulation.** RR_com = product (or maximum) over present conditions.
  **Product** implies independent multiplicative risks; **maximum** is the
  conservative choice when conditions co-occur. *This choice must be stated and
  swept* â€” it is an assumption, not a fact.
- **Prevalence.** Class **C**: bounded below by CDC PLACES tract prevalence for
  Multnomah County (housed adults) and above by homeless-specific literature
  (Snyder & Eisner 2004; Fazel et al. 2014). Reported as a **range**.
- **Asthma nuance to preserve.** DeFlorio-Barker et al. 2019 found asthma
  hospitalisation risk elevated specifically on smoke days while general
  cardiopulmonary risk was similar â€” so asthma and COPD should **not** be
  collapsed into one multiplier without justification.
- **Validation / sensitivity.** As V2; prevalence range is a primary sweep axis.

### V6 / V7 â€” Cumulative exposure and VWE Â· class **M** (derived)

- **Formulation.** exposure_i += C_i(t)Â·Î”t ; vwe_i += C_i(t)Â·RR_ageÂ·RR_comÂ·Î”t,
  Î”t = minutesPerTick/60 hours. Units ÂµgÂ·mâ»Â³Â·h.
- **Implementation.** Accumulators on `GisAgent`, updated in `step()` **for all
  states** (Decision 3). Must also accumulate `exposureWhileTraveling`
  separately â€” it is the quantity shelter placement can actually change.
- **Cost.** O(1) per agent-tick.
- **Limitations.** An exposure *index*, not a dose (no inhalation rate, no
  particle deposition). Converting to attributable health events is **F1**.
- **Validation.** Analytic test with a constant field (Â§4 of the validation doc).

### V8 â€” Exposure-hours above the "Unhealthy" line Â· class **M** + **A** (convention)

- **âš ï¸ Convention trap (DATA_SOURCES D9).** EPA AQI breakpoints are defined on
  **24-h averages**; AirNow's public display uses **NowCast** on hourly data.
  Counting raw hourly values above 55.5 Âµg/mÂ³ is a *third* thing.
- **Specified convention for this project:** report **person-hours during which
  the agent's ambient concentration exceeds 55.5 Âµg/mÂ³**, and label it exactly
  that â€” "hours above the PM2.5 *Unhealthy* AQI concentration breakpoint
  (55.5 Âµg/mÂ³)" â€” never "hours at AQI Unhealthy", which would imply the 24-h
  averaging convention. Additionally report the 24-h-average-based count as a
  secondary metric so results are comparable with agency reporting.
- **Version note.** 55.5 Âµg/mÂ³ is the "Unhealthy" lower bound under **both** the
  pre- and post-2024 breakpoint tables; higher categories differ and must cite
  a table version.

### ~~V17 â€” Indoor protection factor (Î³)~~ Â· **REMOVED â€” out of scope**

Indoor air quality is not modelled (Decision 2; AUDIT.md Â§0). The study endpoint
is arrival at shelter: exposure stops when a resident is admitted, so shelter
benefit is reduced outdoor exposure time, not indoor filtration. Î³ is not a
model parameter. Reserved as future extension **F-INDOOR** only if the advisor
requests it.

### V12 â€” Shelter capacity and occupancy Â· class **M** (pending D1) + **A** (queue policy)

- **Formulation.** Admit while occupancy < capacity; otherwise the agent is
  refused and must re-route (`REFUSED_ALL_FULL` is already reserved in the
  `State` enum).
- **Policy assumptions requiring explicit statement:** first-come-first-served
  (not needs-based triage); refused agents re-target the next-nearest admitting
  shelter; no departures within the event window.
- **Data.** D1 â€” 99 per site (newsroom-sourced, to be confirmed); **two**
  operating sites in a faithful status quo, with Mount Scott as standby.
- **Interactions.** Capacity binding turns the model from "everyone shelters
  eventually" into a genuine allocation problem â€” it is what makes equity
  metrics meaningful.

### V14 â€” Gini coefficient of exposure Â· class **M** (derived)

- **Formulation.** G = Î£_i Î£_j |v_i âˆ’ v_j| / (2 nÂ² vÌ„) over per-agent VWE.
- **Interpretation caveat.** Gini over an *index* is scale-invariant but not
  invariant to the RR weighting scheme â€” report Gini for both raw exposure (V6)
  and VWE (V7) so the equity claim is separable from the weighting assumption.
- **Cost.** O(n log n) once at end of run.

### V15 / V16 â€” Starting locations; seed Â· class **A** (V15, pending D2b) / infrastructure (V16)

- V15: agent origins are currently street-file artefacts (documented
  placeholder). Requires D2b or an explicitly stated spatial assumption.
- V16: `randomSeed` must be **written into every output file header** and the
  run manifest â€” currently exists as a parameter but is never recorded.

---

## Part III â€” Future work, explicitly excluded from current scope

| ID | Item | Why excluded now |
|---|---|---|
| **F1** | Attributable health events (BenMAP-style) | Requires baseline incidence + CRF over matched averaging periods; out of scope until VWE itself is validated |
| **F2** | Dynamic smoke transport (wind-driven) | D4 deferred; unjustifiable before a smooth field is shown inadequate |
| **F3** | Behavioural heterogeneity (shelter awareness, willingness, distrust) | No data source identified; would be pure assumption and could dominate results |
| **F4** | Indoor microenvironments other than shelters | Same as F3 |
| **F5** | Freeway/pedestrian-network filtering | Data present (CFCC) â€” a *known* refinement, scheduled, not speculative |

---

## Part IV â€” Implementation order (revised roadmap)

Each remains one commit, with compile + headless + GUI validation as before.

| # | Commit | Gate |
|---|---|---|
| 6 | Real shelter locations + capacity enforcement | **D1 confirmation** (coordinates + capacity from a primary source) |
| 7 | Population initialisation from PIT | **D2 extraction**; D2b or a stated spatial assumption |
| 8 | **PM2.5 smoke field (Option A, uniform)** | âœ… done |
| 9 | Age/comorbidity attributes | **D5/D6 citation resolution** |
| 10 | Exposure + VWE accumulation | after 8, 9 |
| 11â€“12 | Outcome + decision logging | after 10 |
| 13â€“15 | Strategies, scoring, sweeps | after 11 |
| 16 | Licence, README, provenance, Zenodo | last |

**Commit 8 is the next implementable milestone** â€” it is the only remaining
science commit whose data is already acquired, checksummed and documented.

