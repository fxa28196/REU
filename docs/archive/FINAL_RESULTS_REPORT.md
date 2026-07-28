# Final Results Report — Wildfire-Smoke Shelter Access in Portland, OR (September 2020)

**An agent-based simulation of clean-air shelter access for unsheltered residents of
Multnomah County during the September 2020 wildfire-smoke event, with heterogeneous
residents and a shelter-siting counterfactual.**

| Run identity | Value |
|---|---|
| Scenarios | **A** = real September-2020 shelter placement · **B** = same capacity relocated to the street-network optimum · **C** = capacity-neutral demonstration (NOT real availability) |
| Population | n = 2,037 residents per run; seeds 42, 43, 44 per scenario (9 runs) |
| Model git commit | `ccad7b7` |
| Data version tag | `0bc943324ae6` (SHA-256 over all input datasets; per-file hashes in every `simulation.json`) |
| Archived artifacts | `docs/runs/final-scenarios/{A,B,C}-seed{42,43,44}/` — `agents.csv`, `shelters.csv`, `simulation.json` |
| Analysis outputs | `docs/final/analysis/*.csv`, `comparison_summary.json`, `docs/final/figures/*.png` |

Every number below is reproducible from the archived manifests: seed + parameters +
dataset SHA-256s + git commit.

---

## 1. Research question

**During the September 2020 wildfire-smoke event, could Portland's unsheltered residents
actually reach clean-air shelter — did that depend on who they were — and would siting
the same shelter capacity differently have reduced the population's smoke exposure?**

The model measures **access** (can this person, walking at their own speed from a real
encampment location over the real street network, reach an operating shelter with an
open bed?) and **exposure burden** (a time-integrated PM2.5 concentration index accrued
while outdoors). It does **not** simulate health outcomes.

## 2. What the model measures — and what it does not

**Measures:** per-resident journey outcomes (shelter reached or not, departure and
arrival times, walked distance, walking speed, capacity refusals); per-resident exposure
index Σ C(t)·Δt accrued outdoors until admission; and the distribution of that burden
across the population and across susceptibility strata.

**Does not measure:** health outcomes (no concentration–response function, no breathing
rate, no deposition — "exposure" here is an index, not an inhaled dose); indoor air
quality; or heterogeneity in the *decision* to evacuate (all residents depart on the
same trigger — limitation L1).

## 3. Methodology

### 3.1 Model structure

Repast Simphony 2.11.0 agent-based model (Java 17), 1-minute ticks, 312 simulated hours
anchored at 2020-09-07 00:00 local. Residents start at real encampment-report
coordinates; shelters are the real September-2020 clean-air sites with real capacities
and **real opening dates**; movement is along the real RLIS street centerline network
(89,345 validated graph nodes / 112,070 edges).

### 3.2 Heterogeneous residents (this study's addition)

Each resident carries sampled attributes, and those attributes act on the outcome
through a mechanism the model actually simulates — walking speed → time outdoors →
whether a bed is still free on arrival:

| Attribute | Value | Class | Source |
|---|---|---|---|
| Age band | 18–24 .067 / 25–54 .727 / 55–69 .191 / 70+ .012 (adults, renormalised) | **Measured (local)** | 2019 Multnomah PIT, unsheltered N=2,037 (D10) |
| Sex | M .685 / F .293 / other .023 | **Measured (local)** | Same; corroborated by HUD 2023 AHAR (68.2/30.1/0.9) |
| Mobility limitation | 0.192 marginal; 0.152 under 55, 0.348 at 55+ | **Measured (local, lower bound)** + donor gradient | PIT 391/2,037; age ratio from CASPEH 2023 (22% vs 32% at 50+) |
| Asthma | 0.15 | Literature (PROXY) | Zellmer et al. 2025, [10.1007/s11606-025-09814-x](https://doi.org/10.1007/s11606-025-09814-x) — EHR-diagnosed, n=20,139 with recent homelessness |
| COPD | 0.105 | Literature (PROXY) | Same |
| Walking speed | TruncNormal(µ[age,sex], CV 0.13), [0.40, 2.20] m/s | Literature | Means: Bohannon & Williams Andrews 2011, [10.1016/j.physio.2010.12.004](https://doi.org/10.1016/j.physio.2010.12.004) (n=23,111); CV: Bohannon 1997, [10.1093/ageing/26.1.15](https://doi.org/10.1093/ageing/26.1.15) |
| Speed if mobility-limited | N(0.95, 0.32) m/s **by replacement** | Literature (verified-in-secondary) | Boyce, Shields & Silcock 1999, [10.1023/A:1015339216366](https://doi.org/10.1023/A:1015339216366), via Tinaburri 2018 |
| Speed effect of COPD | **−0.19 m/s** additive (95% CI −0.28 to −0.11) | Literature (low quality per authors) | Buekers et al. 2024, *Eur Respir Rev* 33(172):230253, [10.1183/16000617.0253-2023](https://doi.org/10.1183/16000617.0253-2023) — 25 studies, 1,015 COPD vs 2,229 controls |
| Speed effect of asthma | **none** | No evidence found | Literature supports lower physical *activity*, not a gait-speed decrement; borrowing the COPD figure would be invention |

Three deliberate restraints, each of which could have been papered over with an invented
number and was not:

1. **Neither asthma nor COPD carries a dose multiplier, and inhalation rate is constant
   for every resident.** A multiplied "vulnerability-weighted exposure" was rejected
   (decision D-3): the coefficients it needs do not exist for this population, the
   multiplicative form is a category error, and no health outcome is simulated against
   which it could ever be validated. No population-specific ventilation multiplier exists
   either, so inhaled volume is held constant (`VULNERABILITY_MECHANISM_AUDIT.md` §1).
   COPD *does* reduce walking speed, because that effect is measured; asthma does not,
   because no gait-speed estimate for asthma was found. That asymmetry follows from
   evidence availability, not preference (§7.3).
2. **Age is sampled uniformly within published bands.** Nothing constrains the
   within-band shape; a fitted curve would manufacture precision.
3. **Mobility-limited residents all use the *fastest* impaired category** (unaided
   ambulant). The aid mix is unsourced for this population, so the modelled penalty is
   deliberately conservative — real speeds are likely lower and the disparity larger.

Attributes are drawn from a **separate RNG stream** from agent placement, so enabling
heterogeneity leaves the archived baseline population bit-identical.

### 3.3 Behaviour per tick

1. **Exposure accrues** for every resident not yet sheltered: `C(t)·Δt`, measured county
   PM2.5, Δt = 1/60 h.
2. **Departure** requires *both* the smoke trigger (PM2.5 ≥ 55.5 µg/m³, the EPA
   "Unhealthy" breakpoint) *and* an open shelter to walk to. In these runs that is
   **2020-09-10 07:00** — the first threshold crossing after the Oregon Convention
   Center opened.
3. **Routing**: the nearest operating, open shelter with space by street-network distance
   (Dijkstra, geodesic edge weights), walked at the resident's own speed.
4. **Admission**: granted if occupancy < capacity, else refused at the door.
5. **After refusal**: the resident stays where it is and re-plans from there (decision
   D-6) — never back to its encampment. If nothing is available it waits, and re-attempts
   when the second shelter opens the next day (A-21).

### 3.4 Equations

- Cumulative exposure index: E_i = Σ_t C(t)·Δt·O_i(t) [µg·m⁻³·h], O = outdoors indicator
- Person-hours above Unhealthy: H_i = Σ_t Δt·1[C(t) > 55.5]·O_i(t)
- Exposure Burden Index: EBI_i = Σ_t C(t)·RR_age,i·RR_com,i·Δt·O_i(t) — **both RR = 1.0
  placeholders**, so EBI ≡ E; reported only to keep the column contract stable
- Inequality: Gini = Σ_iΣ_j|E_i − E_j| / (2n²Ē)

### 3.5 Scenario B — the siting counterfactual

`scripts/optimize_shelters.py` places the **same total capacity** (2 sites × 99 beds) at
the street-network p-median optimum over 790 candidate nodes, using a capacity-aware
greedy assignment that mirrors the simulation's own mechanism, then the ABM is re-run at
those coordinates with **identical opening dates** so A and B differ in location only.

Chosen sites: OPT1 (−122.6735, 45.5260) and OPT2 (−122.6557, 45.5194), both in inner
southeast Portland near the encampment centroid.

> **Scenario B is an unconstrained-siting theoretical optimum, not a policy
> recommendation.** It ignores building availability, ownership, zoning, staffing and ADA
> access, and does not assert that a structure capable of housing 99 people exists at
> those coordinates. It is an *upper bound on what siting alone can achieve*.

### 3.6 Scenario C — the capacity-neutral demonstration

> ⚠️ **DEMONSTRATION ONLY — NOT REAL SEPTEMBER-2020 AVAILABILITY.**

Real locations, real opening dates, real street network, real air — but total capacity
raised to 2,037 so that beds stop being the binding constraint and the exposure effect of
*travel alone* becomes visible. Relative site capacities stay 1:1 (1,019 / 1,018),
matching the equal per-site capacities the 2020 source reports, so shelters still fill in
sequence and residents are still redirected.

The total is bounded rather than arbitrary: it falls inside the **1,900–2,200 person**
range that Multnomah County's *entire current* year-round shelter system provides once the
published bed / room / unit / family counts are converted
(`SHELTER_CAPACITY_AUDIT.md` §3). The scenario therefore asks a specific question — *what
if smoke-respite capacity had been on the scale of the county's whole present-day shelter
system?* — rather than an unbounded one. Registered as assumption **A-24**; labelled
`C_capacity_neutral_demonstration` in every export.

## 4. Datasets

| Dataset | Source | Status |
|---|---|---|
| Street network | Portland/Metro RLIS `Streets.shp`, 112,070 features | **Measured.** 27 corrupt attribute node IDs corrected with per-correction provenance; 0 impossible edges after fix |
| PM2.5 | EPA AQS hourly, Multnomah County, Sept 2020 (576 hourly slices, peak 562.7 µg/m³) | **Measured.** Spatially uniform by assumption A-01 (only 2 in-county monitors) |
| Shelters | Real Sept-2020 clean-air sites, geocoded, with opening dates | **Measured locations and dates**; capacity 99/site is newsroom-sourced and **unconfirmed** (A-04, blocking) |
| Encampments | City of Portland IRP campsite reports | **Real points, temporally displaced**: 2025–26 used as a 2020 spatial proxy (A-03) |
| Population attributes | 2019 PIT (local) + CASPEH/Zellmer (imported) | See §3.2 |
| Population size | 2,037 = January-2019 PIT unsheltered count | **Measured count**, applied to a Sept-2020 event (L3) |

## 5. Assumptions

Full register: `Geography/data/registry/assumptions.csv` (21 assumptions, validated at
startup — a registry defect aborts the run).

**Resolved this cycle:** A-02 (evacuation timing) moved blocking → active — residents can
no longer depart before a shelter exists to receive them; A-13 (uniform walking speed)
retired, superseded by the sampled distribution.

**Still blocking publication, and reported rather than hidden:** **A-04** unconfirmed
99-bed capacities · **A-09** susceptibility weights inert at 1.0 · **A-12** universal
shelter awareness (contradicted by the local record: 65% of surveyed unhoused residents
had never heard of the shelters) · **A-16**.

**New this cycle:** **A-18** mobility age-gradient donor-imputed from CASPEH · **A-19**
all mobility-limited residents use the fastest impaired speed category · **A-20**
shelters open at 00:00 on their recorded date (understates pre-opening exposure) ·
**A-21** refused residents wait and re-attempt when a second shelter opens.

## 6. Validation

1. **Baseline regression** — with both new switches off, the model reproduces the
   archived reference exactly: all 25 shared `agents.csv` columns identical on all 50
   rows, `shelters.csv` byte-identical. The vulnerability layer is provably inert when
   disabled.
2. **Sampling verified at load time, not trusted** — realised marginals against published
   targets across the three seeds: mobility 0.181/0.187/0.211 (target 0.192), asthma
   0.142/0.159/0.156 (0.150), COPD 0.123/0.096/0.102 (0.105), any-respiratory
   0.238–0.246 (0.239), age 55+ 0.194–0.204 (0.204).
3. **Routing integrity (A-17)** — walked distance ≤ planned legs + snap gap + 200 m, a
   *failing* check; maximum unexplained walked distance 8.9 m across all runs.
4. **Cross-file consistency** — 38 automated checks per run reconcile `agents.csv`,
   `shelters.csv` and `simulation.json`.
5. **Optimizer mirror check** — the optimizer's independent Python graph reproduces the
   simulation for the real OCC/CJ pair on the hard criterion (198 sheltered, PASS) and
   closely on door refusals (1,724/637 vs simulated 1,722/622). It reports **13**
   residents with no reachable facility against the simulation's **15** — a 2-resident
   (0.1%) discrepancy from snapping differences, recorded as FAIL on that soft check in
   `optimization_report.json` rather than smoothed over. It does not affect the siting
   choice.
6. **Multi-seed stability** — headline outcomes identical across seeds 42/43/44; stratum
   rates vary by <1 percentage point.

## 7. Results

### 7.1 Population outcomes — capacity is the binding constraint

| Outcome | A (current) | B (optimized) | C (capacity-neutral, demo) |
|---|---|---|---|
| **Reached shelter** | **198 / 2,037 = 9.72%** | **198 / 2,037 = 9.72%** | **2,022 / 2,037 = 99.25%** |
| Refused everywhere | ~1,824 | ~1,824 | 0 |
| No reachable shelter | ~15 | ~15 | ~15 |
| Beds occupied | 198 / 198 (100%) | 198 / 198 (100%) | 2,022 / 2,037 |
| Total population exposure (µg·m⁻³·h) | 99,962,958 | 99,933,295 (**−0.03%**) | 7,669,225 (**−92.3%**) |
| Person-hours above Unhealthy | 359,794 | 359,684 (−0.03%) | 34,948 (**−90.3%**) |
| Mean walk, admitted residents | 8,692 m | **5,335 m (−38.6%)** | 11,279 m (+29.8%) |

A and B are identical in all three seeds; both shelters fill completely in both.

**The comparison that answers the research question:** relocating the same beds changes
population exposure by **0.03%**; adding beds changes it by **92.3%**. Better siting
shortens the walk for people who were already going to be admitted (−38.6%); it does not
admit one additional person. In C the mean walk *rises*, because residents who would
previously have been turned away now walk further to a shelter that still has room — and
still end up with 92% less exposure.

### 7.2 The exposure cliff

Scenario A, seed 42: a resident who reached shelter accrued a mean of **3,291 µg·m⁻³·h**
and 15.3 hours above the Unhealthy breakpoint. A resident who did not accrued
**54,003 µg·m⁻³·h** — the full-event outdoor dose — and **194 hours** above Unhealthy.
That is a ~16× difference, and it is binary rather than graded: 90.3% of the population
converges on the identical maximal value. Population total: **359,793 person-hours above
the Unhealthy breakpoint**. Exposure Gini is low (**0.091**) precisely *because* near-
total deprivation is shared almost equally.

Residents who were refused walked a mean of **15.9 km** through hazardous smoke and
finished with the same dose as if they had never left.

### 7.3 Who reached shelter — the equity result

Scenario A, mean of three seeds:

| Stratum | n | Reached shelter | Mean walking speed | Mean exposure (µg·m⁻³·h) | Mean h > Unhealthy |
|---|---|---|---|---|---|
| **COPD** | 218 | **3.07%** | 1.15 m/s | 52,406 | 188.3 |
| No COPD | 1,819 | **10.52%** | 1.31 m/s | 48,673 | 175.2 |
| **Mobility-limited** | 393 | **3.63%** | 0.99 m/s | 52,119 | 187.3 |
| Not mobility-limited | 1,644 | **11.18%** | 1.37 m/s | 48,346 | 174.1 |
| Vulnerable (any) | 986 | 6.19% | 1.18 m/s | 50,850 | 182.9 |
| Not vulnerable | 1,051 | 13.04% | 1.40 m/s | 47,405 | 170.8 |
| Asthma | 311 | 8.95% | 1.29 m/s | 49,501 | 178.2 |
| No asthma | 1,726 | 9.87% | 1.29 m/s | 48,992 | 176.3 |

**Residents with COPD or a mobility limitation were roughly 3× less likely to reach
shelter** (3.1% and 3.6% versus 10.5% and 11.2%), accrued ~8% more exposure, and spent
13–14 more hours in air above the Unhealthy breakpoint. This is the mechanism the study
set out to demonstrate, and it is a *simulated consequence* of measured local mobility
prevalence and published gait speeds — not an assumed penalty.

**Asthma shows almost no difference** (8.95% vs 9.87%), and that is the honest result
rather than a null finding to explain away. Asthma carries no walking-speed effect in this
model because no quantitative comfortable-gait-speed decrement for adults with asthma was
found; COPD carries one because Buekers et al. 2024 measured it. The gap between the two
conditions in this table is a gap in the evidence base, made visible
(`VULNERABILITY_MECHANISM_AUDIT.md` §3).

Neither condition alters inhaled volume — inhalation rate is constant for every resident
(§3.2 restraint 1).

### 7.4 Does better siting help? — and what removing the bottleneck reveals

Relocating the same 198 beds to the network optimum:

- **Number sheltered: unchanged** (198 in every seed).
- **Total population exposure: −0.03%.** Real, but practically nil.
- **Mean walk for admitted residents: −38.6%** (8,692 → 5,335 m).
- **Vulnerable residents sheltered: 6.19% → 6.53%** — proximity partially offsets slower
  walking, but only slightly.
- **Residents with no reachable shelter: unchanged** (~15).

**Siting is not the binding constraint; capacity is.**

Scenario C isolates that. With capacity removed as a constraint, 99.25% reach shelter and
population exposure falls 92.3%. But the equity story does not vanish — it changes shape:

| Group | Exposure, Scenario C | Comparison group | Gap |
|---|---|---|---|
| Mobility-limited | 4,388 | 3,619 | **+21%** |
| COPD | 3,956 | 3,741 | +6% |
| Vulnerable (any) | 4,006 | 3,542 | **+13%** |
| Asthma | 3,731 | 3,774 | −1% (no effect, as designed) |

In A the disparity appears as an **access** gap (who gets a bed); in C, where nearly
everyone gets one, it reappears as a residual **exposure** gap, because slower residents
spend longer walking. Capacity solves most of the inequity; it does not solve all of it.
Sheltering everyone would still leave mobility-limited residents breathing ~21% more
smoke than everyone else.

### 7.5 Figures and data

`docs/final/figures/`: access by stratum (`figA`), walking-speed distributions (`figB`),
exposure distribution by outcome (`figC`), travel distance (`figD`), travel time
(`figE`), shelter utilization (`figF`), A-vs-B comparison (`figG`), and an outcome map
of encampment origins with both scenarios' sites (`figH`).

`docs/final/analysis/`: `scenario_comparison.csv` (population level, per seed),
`stratified_exposure.csv`, `shelter_utilization.csv`, `journeys_sample.csv` (individual
records), `comparison_summary.json`.

Per-resident records — the primary evidence — carry: agent ID, scenario, seed, sim ID,
commit, data version, starting encampment, shelter reached, success flag, departure and
arrival times, travel duration, travel distance, walking speed, age, age band, sex,
mobility category, asthma, COPD, vulnerable flag, average and peak PM2.5, cumulative
dose, exposure burden index, and hours above Unhealthy.

## 8. Interpretation

1. **Capacity, not geography, decided who breathed smoke.** 2,037 people, 198 beds:
   90.3% could not be sheltered under any placement, and moving the shelters to the
   mathematical optimum changed population exposure by 0.03%. Access interventions —
   siting, wayfinding, outreach — cannot close a 10:1 shortfall.
2. **The burden is a cliff, not a slope.** Reaching a bed cut exposure ~16×; everyone
   else converged on the identical maximal outdoor dose.
3. **Scarcity was allocated by walking speed.** With first-come-first-served admission,
   the beds went disproportionately to residents who could walk fast: 11.2% of unimpaired
   residents versus 3.5% of mobility-limited ones. Nothing in the model *targets* slower
   residents — the disparity is an emergent consequence of rationing by arrival order.
   That is a policy-relevant finding about admission mechanism, not about biology.
4. **Timing mattered as much as siting.** The shelters opened on 10–11 September, days
   into the smoke event; every resident accrued the full outdoor dose until then. In this
   model, opening a day earlier would remove far more exposure than relocating the sites.
5. **These are exposure statements, not health claims.** Converting µg·m⁻³·h to health
   outcomes requires concentration–response functions and breathing/deposition modelling
   this study deliberately excludes.

## 9. Limitations

- **L1 (A-02, resolved-in-part).** Departure is now gated on real opening dates, but all
  residents still depart *simultaneously* on the same trigger: no awareness or
  decision-delay model exists. Real departures would be staggered.
- **L2 (A-12, blocking).** Every resident is assumed to know the shelters exist — flatly
  contradicted by the local record (65% of surveyed unhoused residents had not heard of
  them). Real uptake would be far lower, so the 9.72% arrival rate is an **upper bound**.
- **L3 (A-04, blocking).** The 99-bed capacities are unconfirmed; the arrival rate scales
  directly with total beds.
- **L4.** Population 2,037 is the January-2019 PIT count applied to a September-2020
  event.
- **L5 (A-03).** Encampment locations are real city reports from 2025–26 used as a 2020
  spatial proxy, with complaint-driven visibility bias.
- **L6 (A-01).** The smoke field is spatially uniform, so all exposure differences arise
  from time outdoors, none from spatial gradients.
- **L7 (A-19).** Mobility-limited residents use the fastest impaired speed category; the
  real disparity is likely **larger** than reported.
- **L8 (A-08).** Admission is first-come-first-served within a tick; which
  specific residents get marginal beds varies by seed, though stratum-level rates are
  stable. A vulnerability-prioritised admission policy is an obvious untested scenario.
- **L9.** `travel_time_min` is elapsed time from departure to admission and **includes
  waiting** for a second shelter to open the next day; it is not pure walking time.
- **L10.** No shelter departures, no queueing, no abandonment; no indoor exposure model;
  freeway segments are not yet excluded from the pedestrian graph (12–19 residents per
  seed are unreachable due to disconnected graph components).
- **L11.** Scenario B is a theoretical siting bound (§3.5), not a buildable proposal.

## 10. Provenance of each headline claim

| Claim | Measured | Literature | Assumption-dependent |
|---|---|---|---|
| "198 of 2,037 (9.7%) reached shelter, in both scenarios" | Street network, encampments, shelter sites + dates, PIT count | Gait speeds; Dijkstra routing | Capacity 99×2 (A-04); universal awareness (A-12); simultaneous departure (A-02); encampment proxy (A-03) |
| "Mobility-limited residents reached shelter at 3.5% vs 11.2%" | PIT mobility prevalence (local); network distances | Bohannon 2011 speeds; Boyce 1999 impaired speeds | Age gradient donor (A-18); aid mix (A-19); first-come-first-served admission (A-08) |
| "Optimized siting changes population exposure by −0.03%" | Network, encampment geography | p-median formulation | Unconstrained siting (L11); capacity fixed; A-03 demand geography |
| "Refused residents walked ~15.9 km through smoke" | Network distances; PM2.5 | Gait speeds | A-21 wait-and-retry behaviour; A-02 timing |
| "359,793 person-hours above the Unhealthy breakpoint" | Hourly EPA AQS PM2.5 | EPA 55.5 µg/m³ breakpoint | A-01 uniform field; A-02; population size (L4) |

---

*Model commit `ccad7b7`; analysis `scripts/compare_scenarios.py` v1.0.0 and
`scripts/analyze_run.py` v1.1.0; siting optimum from `scripts/optimize_shelters.py`
v1.0.0 (`docs/runs/scenario-b-optimization/optimization_report.json`). Runs archived
under `docs/runs/final-scenarios/`.*
