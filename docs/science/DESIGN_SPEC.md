# Model Design Specification

The scientific contract for every model component, written **before**
implementation. Programming follows this document; where implementation and
this document disagree, this document is the defect report.

**Evidence classes** used throughout — every quantity in the model carries
exactly one:

| Class | Meaning | Publication rule |
|---|---|---|
| **M — Measured** | Read from an acquired dataset; no modelling choice | Cite the dataset (DATA_SOURCES.md) |
| **L — Literature** | Point estimate or CI from a peer-reviewed/government source | Cite paper + DOI; sweep the CI |
| **C — Calibrated** | Fitted or tuned so the model reproduces an observed quantity | Report the target, the fit, and the residual |
| **A — Assumption** | A modelling decision with no external source | Must be stated in results; must be swept |
| **F — Future work** | Specified but not implemented | Never silently defaults into results |

Companion documents: [`DATA_SOURCES.md`](DATA_SOURCES.md) (where values come
from), [`VALIDATION_STRATEGY.md`](VALIDATION_STRATEGY.md) (how each subsystem is
proven), [`VARIABLES.md`](VARIABLES.md) (registry of what is *already*
implemented), [`BIBLIOGRAPHY.md`](BIBLIOGRAPHY.md).

---

## Part I — The central metric

The project's central quantity (slide 4) is **vulnerability-weighted exposure**:

> VWE_i = Σ_t  C(x_i(t), t) · RR_age(a_i) · RR_com(c_i) · Δt

for agent *i*, position x_i(t), ambient concentration C, and Δt = one tick in
hours. Three structural decisions are specified here and inherited by
everything below.

**Decision 1 — multiplicative risk weighting is a *weighting* scheme, not an
epidemiological prediction.** VWE has units of µg·m⁻³·h and is an *exposure
burden index*, not a count of deaths or hospitalisations. This must be stated
in every results caption. Reporting it as "health outcomes" would overclaim:
converting exposure to attributable cases requires a baseline incidence rate
and a concentration–response function evaluated over the same averaging period
as the source epidemiology, which this model does not currently do (see V7
option B and F1).

**Decision 2 — the study endpoint is ARRIVAL AT SHELTER; indoor air quality is
out of scope.** Exposure accumulates only while a resident is outside and stops
the moment they are admitted to a shelter. Residents who never reach shelter keep
accruing for the whole event. Shelter benefit is therefore the reduction of
outdoor exposure *time* through better placement and accessibility — not indoor
filtration. The indoor/outdoor ratio γ a filtration model would require is
unsupported by any acquired data and unrequested by the slides or mentor, so it
is deliberately excluded (rationale in AUDIT.md §0). If the advisor later wants
indoor performance modelled, it re-enters as documented future extension
F-INDOOR, never as a silent default.

**Decision 3 — exposure accrues for *every* agent in *every* state.** Sheltered,
en-route and unreachable agents all accumulate exposure (at different
concentrations). This is already enabled by the persistent-state design
(commit `7318f9b`).

---

## Part II — Variable specifications

### V5 — PM2.5 concentration field `C(x, t)` · class **M** (+ **A** for the interpolant)

- **Scientific purpose.** The exposure term; the only environmental driver.
- **Mechanism.** Regional smoke inundation from the Labor Day 2020 Oregon
  wildfire complex; concentrations rose ~100× above baseline for ~9 days
  (measured: Multnomah daily mean 4.0 µg/m³ on Sep 8 → 426.9 on Sep 13).
- **Data.** D3 — 7 monitors, hourly, µg/m³ (ACQUIRED).
- **Mathematical formulation — two options, with a decision rule:**
  - **Option A (recommended first implementation): county-uniform hourly field.**
    C(x,t) = mean of Multnomah monitors at hour t. Spatially uniform.
    *Rationale:* with **2 monitors inside the county**, any spatial interpolant
    is fitting 2 points — the apparent gradient would be an artefact of monitor
    siting, not a measured feature. A uniform field makes the (large) spatial
    uncertainty explicit rather than hiding it behind smooth colour.
    *Consequence:* under a uniform field, differences between placement
    strategies arise **only** from travel time and shelter access — a clean,
    honest, interpretable first result.
  - **Option B: inverse-distance weighting over all 7 tri-county monitors,**
    C(x,t) = Σ w_k C_k(t) / Σ w_k, w_k = d_k^(−p), p = 2 (**A**).
    *Adopt only if* leave-one-out cross-validation (VALIDATION_STRATEGY §5)
    shows IDW beats the uniform field on held-out monitors.
- **Implementation.** `SmokeField` class; hourly slices indexed by tick via V13;
  exposed to agents through the `Geography` coverage machinery **or** a direct
  lookup (coverage layers were removed in commit `eaa9605`; re-declare a
  properly named `PM25` coverage in `context.xml` when this lands).
- **Interactions.** Feeds V6, V7, V8 (exposure accrues only while a resident is
  outside; accumulation stops at shelter arrival — Decision 2).
- **Computational cost.** Option A: O(1) per agent-tick after an O(monitors)
  hourly update — negligible. Option B: O(7) per agent-tick, still trivial.
- **Assumptions.** Monitor readings represent outdoor ambient concentration at
  breathing height; no personal-exposure microenvironment modelling.
- **Limitations.** Non-FRM instruments (D3); 2 in-county monitors; no vertical
  structure; no indoor sources.
- **Validation.** VALIDATION_STRATEGY §5.
- **Sensitivity.** Field choice (A vs B) is itself a sweep axis; report whether
  strategy rankings are invariant to it. If they are not, that is a *finding*,
  not a failure.

### V13 — Tick↔time mapping · class **A** (implemented)

1 tick = 1 simulated minute; 60 ticks per hourly PM2.5 slice. Already
implemented (`minutesPerTick`); rationale in VARIABLES.md. **Change required:**
the run must be anchored to a wall-clock start (`simulationStartDateTime =
2020-09-07T00:00`) so tick↔timestamp is unambiguous. The full event is
17,280 ticks.

### V1 / V2 — Age and RR_age · class **L**, currently **BLOCKED**

- **Purpose.** Age is the first vulnerability channel.
- **Mechanism.** Age-related decline in pulmonary reserve and higher prevalence
  of cardiopulmonary disease raise the health impact of a given PM2.5 dose.
- **⚠️ Status.** The slides' ×1.45-for-65+ is **not supported by Di et al. 2017**
  (DATA_SOURCES D5 — that cohort is entirely 65+ and reports HR 1.073 per
  10 µg/m³). **This value must not be coded on that citation.**
- **Formulation — options:**
  - **Option A (categorical, as per slides):** RR_age = 1.45 if age ≥ 65 else
    1.0. *Requires a real source; currently has none.*
  - **Option B (recommended): concentration–response.** Weight = exp(β·C) or
    the linear approximation 1 + (HR−1)·C/10 with **HR = 1.073 per 10 µg/m³
    (Di et al. 2017, CI 1.071–1.075)** applied to the 65+ stratum. Properly
    sourced, uses the CI directly as the sweep range, and avoids inventing a
    threshold multiplier.
- **Age distribution.** From the 2019 PIT report's age tables (D2), **not**
  invented. Until extracted, agents carry no age and RR_age ≡ 1.0.
- **Interactions.** Multiplies into V7; correlates with V10 (walking speed) and
  V3 (comorbidity) — the model should not treat these as independent without
  saying so.
- **Cost.** O(1) per agent, set once at initialisation.
- **Assumptions (if Option A is ever used).** A step change at exactly 65 is a
  modelling convenience, not a biological threshold.
- **Validation.** Unit test: an agent at a known constant concentration for a
  known duration accumulates exactly C·RR·Δt.
- **Sensitivity.** Sweep the published CI; additionally run RR_age ≡ 1 to show
  how much of the strategy ranking depends on age weighting at all.

### V3 / V4 — Comorbidity (COPD, asthma) and RR_com · class **L** + **C**, currently **BLOCKED**

- **⚠️ Status.** The ×1.80 COPD figure attributed to "Anderson et al. 2013" is
  unverified (DATA_SOURCES D6). Replacement literature identified: Reid et al.
  2016 (DOI 10.1289/ehp.1409277) and DeFlorio-Barker et al. 2019
  (DOI 10.1289/EHP3860) — effect estimates still to be extracted from full text.
- **Formulation.** RR_com = product (or maximum) over present conditions.
  **Product** implies independent multiplicative risks; **maximum** is the
  conservative choice when conditions co-occur. *This choice must be stated and
  swept* — it is an assumption, not a fact.
- **Prevalence.** Class **C**: bounded below by CDC PLACES tract prevalence for
  Multnomah County (housed adults) and above by homeless-specific literature
  (Snyder & Eisner 2004; Fazel et al. 2014). Reported as a **range**.
- **Asthma nuance to preserve.** DeFlorio-Barker et al. 2019 found asthma
  hospitalisation risk elevated specifically on smoke days while general
  cardiopulmonary risk was similar — so asthma and COPD should **not** be
  collapsed into one multiplier without justification.
- **Validation / sensitivity.** As V2; prevalence range is a primary sweep axis.

### V6 / V7 — Cumulative exposure and VWE · class **M** (derived)

- **Formulation.** exposure_i += C_i(t)·Δt ; vwe_i += C_i(t)·RR_age·RR_com·Δt,
  Δt = minutesPerTick/60 hours. Units µg·m⁻³·h.
- **Implementation.** Accumulators on `GisAgent`, updated in `step()` **for all
  states** (Decision 3). Must also accumulate `exposureWhileTraveling`
  separately — it is the quantity shelter placement can actually change.
- **Cost.** O(1) per agent-tick.
- **Limitations.** An exposure *index*, not a dose (no inhalation rate, no
  particle deposition). Converting to attributable health events is **F1**.
- **Validation.** Analytic test with a constant field (§4 of the validation doc).

### V8 — Exposure-hours above the "Unhealthy" line · class **M** + **A** (convention)

- **⚠️ Convention trap (DATA_SOURCES D9).** EPA AQI breakpoints are defined on
  **24-h averages**; AirNow's public display uses **NowCast** on hourly data.
  Counting raw hourly values above 55.5 µg/m³ is a *third* thing.
- **Specified convention for this project:** report **person-hours during which
  the agent's ambient concentration exceeds 55.5 µg/m³**, and label it exactly
  that — "hours above the PM2.5 *Unhealthy* AQI concentration breakpoint
  (55.5 µg/m³)" — never "hours at AQI Unhealthy", which would imply the 24-h
  averaging convention. Additionally report the 24-h-average-based count as a
  secondary metric so results are comparable with agency reporting.
- **Version note.** 55.5 µg/m³ is the "Unhealthy" lower bound under **both** the
  pre- and post-2024 breakpoint tables; higher categories differ and must cite
  a table version.

### ~~V17 — Indoor protection factor (γ)~~ · **REMOVED — out of scope**

Indoor air quality is not modelled (Decision 2; AUDIT.md §0). The study endpoint
is arrival at shelter: exposure stops when a resident is admitted, so shelter
benefit is reduced outdoor exposure time, not indoor filtration. γ is not a
model parameter. Reserved as future extension **F-INDOOR** only if the advisor
requests it.

### V12 — Shelter capacity and occupancy · class **M** (pending D1) + **A** (queue policy)

- **Formulation.** Admit while occupancy < capacity; otherwise the agent is
  refused and must re-route (`REFUSED_ALL_FULL` is already reserved in the
  `State` enum).
- **Policy assumptions requiring explicit statement:** first-come-first-served
  (not needs-based triage); refused agents re-target the next-nearest admitting
  shelter; no departures within the event window.
- **Data.** D1 — 99 per site (newsroom-sourced, to be confirmed); **two**
  operating sites in a faithful status quo, with Mount Scott as standby.
- **Interactions.** Capacity binding turns the model from "everyone shelters
  eventually" into a genuine allocation problem — it is what makes equity
  metrics meaningful.

### V14 — Gini coefficient of exposure · class **M** (derived)

- **Formulation.** G = Σ_i Σ_j |v_i − v_j| / (2 n² v̄) over per-agent VWE.
- **Interpretation caveat.** Gini over an *index* is scale-invariant but not
  invariant to the RR weighting scheme — report Gini for both raw exposure (V6)
  and VWE (V7) so the equity claim is separable from the weighting assumption.
- **Cost.** O(n log n) once at end of run.

### V15 / V16 — Starting locations; seed · class **A** (V15, pending D2b) / infrastructure (V16)

- V15: agent origins are currently street-file artefacts (documented
  placeholder). Requires D2b or an explicitly stated spatial assumption.
- V16: `randomSeed` must be **written into every output file header** and the
  run manifest — currently exists as a parameter but is never recorded.

---

## Part III — Future work, explicitly excluded from current scope

| ID | Item | Why excluded now |
|---|---|---|
| **F1** | Attributable health events (BenMAP-style) | Requires baseline incidence + CRF over matched averaging periods; out of scope until VWE itself is validated |
| **F2** | Dynamic smoke transport (wind-driven) | D4 deferred; unjustifiable before a smooth field is shown inadequate |
| **F3** | Behavioural heterogeneity (shelter awareness, willingness, distrust) | No data source identified; would be pure assumption and could dominate results |
| **F4** | Indoor microenvironments other than shelters | Same as F3 |
| **F5** | Freeway/pedestrian-network filtering | Data present (CFCC) — a *known* refinement, scheduled, not speculative |

---

## Part IV — Implementation order (revised roadmap)

Each remains one commit, with compile + headless + GUI validation as before.

| # | Commit | Gate |
|---|---|---|
| 6 | Real shelter locations + capacity enforcement | **D1 confirmation** (coordinates + capacity from a primary source) |
| 7 | Population initialisation from PIT | **D2 extraction**; D2b or a stated spatial assumption |
| 8 | **PM2.5 smoke field (Option A, uniform)** | ✅ done |
| 9 | Age/comorbidity attributes | **D5/D6 citation resolution** |
| 10 | Exposure + VWE accumulation | after 8, 9 |
| 11–12 | Outcome + decision logging | after 10 |
| 13–15 | Strategies, scoring, sweeps | after 11 |
| 16 | Licence, README, provenance, Zenodo | last |

**Commit 8 is the next implementable milestone** — it is the only remaining
science commit whose data is already acquired, checksummed and documented.
