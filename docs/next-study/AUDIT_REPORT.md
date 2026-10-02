<!-- Generated from next-study-audit.html (the published artifact source).
     Canonical rendered copy: https://claude.ai/code/artifact/91b8197c-8b27-4e28-85e6-e33f6b9f5f4e -->

# Capacity vs. Evidence

*Audit · Wildfire-Smoke Shelter ABM · Multnomah County*

A requirement-by-requirement audit of the *Capacity Is Not Access* project against eight
journal-grade validation requirements (IJGIS / ERL), with a concrete next-study plan.
**Read-only: no repository file was modified.**

`2026-08-21` · `branch websim-port @ 4ca0c6c` · `17 audit agents` · `387 tool calls` · `~2.0M audit tokens`

> **Verdict.** The project's *internal* validity apparatus is unusually strong — byte-identity
> regressions, registered predictions with scored misses, negative controls, a claims linter, and an
> honest 55-row parameter registry. Its *external* validity rests on exactly two event observations:
> one newspaper occupancy snapshot (~130 of 198 beds, one night) and one N=73 retrospective survey.
> Every headline access number is a model output under universal awareness — an assumption the repo's
> own archived runs contradict (measured awareness 0.356 leads to ~17.8% sheltered across all arms,
> and the placement effect disappears). The manuscript does not disclose those runs. The path forward
> is unusually tractable: most of the repair is text, in-repo computation, and one well-precedented
> public-records request.

### Contents

- [Exists & defensible](#s1)
- [Missing](#s2)

- [Implementable with existing data](#s3)

- [Requires new empirical data](#s4)

- [Requires external acquisition](#s5)

- [Claims exceeding evidence](#s6)

- [Implementation plan](#s7)

- [Methods per missing component](#s8)

- [Validation protocol (VP-1)](#s9)

- [Target outputs, tables, figures](#s10)

- [A · Reviewer-number reconciliation](#appA)

- [B · Audit method & provenance](#appB)

**Three time-sensitive items** (this week, all user-owned):

1. **An eligible second smoke episode is happening right now.** Portland has been under a DEQ air-quality advisory since Aug 3, 2026 (metro AQI ~160, "unhealthy"; the county pointed residents to libraries/community centers as cleaner-air spaces). It is milder than 2020, but it is the only live chance to capture second-episode operational records and a contemporaneous encampment snapshot. `EXTERNAL-SEARCH-ONLY` (the severity comparison through 2025 is from the fetched DEQ trend reports; the Aug-2026 advisory facts themselves are search-level)

2. **The encampment feed is a rolling window.** The City feed retains no history (zero 2020 rows survive). A snapshot captured via `scripts/fetch-encampments.ps1` during/after the current episode is the one input that cannot be recovered later.

3. **Sept-2020 occupancy records almost certainly exist and were never requested.** The county's Jan-2024 winter after-action report publishes per-facility nightly Guests/Capacity tables — proof the county compiles exactly the record type the 2020 calibration lacks. Route: Oregon Public Records Law (ORS 192.311–192.431), county portal, public-interest fee waiver. The user files it; agents never contact agencies.

## 1 · What already exists and is defensible

Reviewers will credit far more of this project than a typical single-city ABM — provided the claims are scoped to what the apparatus actually supports.

- **Reproducibility chain.** Bit-for-bit determinism; per-seed populations byte-identical across arms (SHA-256, asserted by `verify_2026_runs.py`); the R3 byte-identity regression (degenerate decision layer reproduces archived arms exactly); source-integrity checksums and clean-tree flags in every manifest `VERIFIED (mechanisms + hash records)` `REPORTED (pass results, not re-executed)` — plus an independent TypeScript re-implementation with a Tier 0–4 fidelity ladder `REPORTED`

- **Registered-prediction discipline.** Predictions registered before runs, scored, and misses left standing with appended corrections (P-3c/P-3d capacity knife-edge, P-E1 attempt share, P-SE1, P-SE10 draw-dependent sign flip). This is preregistration culture already in place. `VERIFIED`

- **Real controls.** The random-pool siting control that demoted the optimizer's headcount credit to dispersion ("this control refuted my own headline"); a min-cost-flow admissions bound; asthma negative controls per-run and pooled; closure-free control arms; registered-inert triage arms. `VERIFIED`

- **An honest parameter registry.** 55 variable rows with evidence classes (census M=15, L=11, A=29), sources, DOIs, and sweep ranges; 4 assumptions flagged blocking (A-04 capacity, A-09 susceptibility, A-12 awareness, A-16 admission order). Every hazard, choice, and blockage coefficient is candidly classed ASSUMED. `VERIFIED`

- **A claims linter with teeth.** `scripts/lint_claims.py` (executed during this audit: exit 0, 10 deliverables) structurally blocks refuted wordings — the naked 1.52× calibration point, the retired placement attribution, "held exactly". `VERIFIED`

- **Local data anchors.** Event-window EPA AQS hourly PM2.5 (param 88502, 4,795 rows, SHA-256, refetchable); a 48-facility 2026 shelter transcription with per-row capacity units and provenance; 3,400 dated campsite reports; 2025 PIT population; the Hines N=73 event survey (awareness 26/73 = 0.356; attempt 10/26 = 0.385) — the one genuinely local behavioral estimate, implemented in code. `VERIFIED`

- **One-dimensional sensitivity, archived.** Bed sweep BS080–BS160 (knife-edge: +5% capacity matches optimal siting's admissions; gap gone by ~1.1×), window arms W24/W72, two smoke severities, three closure draws. `VERIFIED (archives present)` `REPORTED (statistics)`

- **Candid limitation writing.** The in-sample-optimizer circularity is the chapter's *first* limitation; county-uniform PM2.5 is disclosed three times with its consequence; B's scale-up is called "a diagnostic bound, not a plan" (tex). Much of the audit's Phase-0 work is propagating hedges that already exist somewhere. `VERIFIED`

## 2 · What is missing

| Gap | Status | Notes |
|---|---|---|
| `R1` Independent shelter-use observations (occupancy time series, arrivals, turnaways, refusal reasons) | `ABSENT` | Entire event record = one newsroom snapshot (~90+~40 of 198, night of 2020-09-15) + one 211 sentence. The repo itself: these are "the only quantitative behavioural calibration targets this project has." |
| `R1` `R3` Outreach-contact, communication-timing, transportation, staffing, indoor-PM2.5 data | `ABSENT` | Each verified individually absent. The model has **no transportation mechanism of any kind** — walking is the only mode (grep-verified). |
| `R2` Locally estimated behavioral coefficients | `ABSENT` | All six hazard coefficients, both choice-utility weights, all barrier costs, outreach rate: ASSUMED. The deferred E9 occupancy calibration has no run archive. αHazard's registered derivation scored a MISS (realized attempt share 0.502 vs 0.385). |
| `R3` Identification of the awareness→access effect | `ABSENT` | No experiment, natural experiment, or quasi-experiment; no timing records for outreach/awareness/departure/arrival. The 1.5–15.6× discrepancy's awareness attribution is a residual attribution with unexcluded competitors (A-04 capacity unit, population vintage, hazard coefficients). |
| `R4` Out-of-sample spatial validation of siting | `ABSENT` | By the repo's own review: "no hold-out, no resampling of campsite locations, no spatial cross-validation." The only surviving optimizer credit (walking distance) is entirely in-sample. |
| `R4` Equity-oriented and exact-solver siting baselines | `ABSENT` | D3 equity placement deferred; no exact p-median benchmark, so even the greedy heuristic's optimality gap is unquantified. The method itself is a conventional greedy capacitated p-median — IJGIS novelty must come from validation, not the optimizer. |
| `R5` Feasible candidate facilities | `ABSENT` | No parcel/building/zoning/floor-area/filtration/staffing/cost data anywhere. C's 10 sites average ~349 spaces — larger than any real facility in the county. Present-day arms hard-code zero activation delay. |
| `R6` Spatially resolved smoke | `ABSENT` | One scalar per hour county-wide; exactly 2 in-county AQS monitors in 2020 (verified from EPA's own monitor file). By the repo's own audit, every exposure statistic is "an access/duration statistic wearing exposure units." |
| `R7` Global/joint uncertainty propagation | `ABSENT` | Zero methodological hits for Sobol/Morris/LHS anywhere. Every executed sweep is one-factor. Headline point estimates carry only seed ranges (~11 residents) while known input uncertainty (capacity conversions, awareness CI, A-04) is far larger. |
| `R8` Second event / second city | `ABSENT` | One county, one observed series; the "severe" series are transforms of it. ERL's scope page (fetched): local case studies that don't show broader significance are explicitly not accepted. |

## 3 · What can be implemented with existing data

A large fraction of the scientific repair needs no new data — only computation and text. Highest-value items:

- **Awareness-bracketed headline reporting.** Run the registered-but-never-executed `pAwareInit` sweep over its Wilson CI (0.25–0.47) plus the universal bound; every absolute access figure becomes an interval. (All archived manifests carry only 0.356 or 1.0 — the registry's "swept" flag currently overstates.)

- **E9 censored calibration.** Fit (αHazard, optionally pAwareInit) to the one occupancy record treated properly — OCC right-censored at 99, CJ point-observed — via censored likelihood/ABC with Beta priors from the survey counts; replaces the ad-hoc 1.5–15.6× bracket with a posterior. Corrected αHazard ≈ −8.7 is already computed but unadopted.

- **Spatial blocked CV + temporal split of the demand surface.** The campsite feed is 17 discrete waves of exactly 200 reports (verified); the primary split is exact: fit ≤ 2025-09-15 (1,800 rows) vs holdout ≥ 2025-10-15 (1,600 rows), no dates in between. Variogram-sized blocks, buffered leave-block-out, blind refit of the optimizer, scoring on holdout demand against five baselines. ~80–85% executable today; validates 2025-26 transfer, *not* 2020 (zero 2020 rows exist — a permanent scope boundary).

- **Feasibility-capped re-optimization.** Cap new sites at the largest real facility (175 spaces) and apply facility-type expansion ceilings using columns already in `shelters_multnomah_2026.csv`; tests whether the walking edge survives realistic capacities.

- **Capacity-conversion Monte Carlo + A-04 sweep.** Sample per-facility unit conversions over their documented ranges instead of midpoints (~1,885–2,224 county band); sweep the 2020 99-bed value.

- **Global sensitivity analysis.** Morris screening over 17 already-sweepable runtime factors + a placebo dummy (380 runs, ~6 h at the documented 40–70 s/run), then Sobol on survivors (≤6,144 runs), then a dedicated awareness × capacity regime grid (240 runs) that formally answers "does awareness dominate capacity" with P(regime) and a boundary curve â*(K). ~60–70% executable now; six population constants need a parameter-exposure change + R3 re-proof first.

- **Smoke bounding from existing monitors.** Hourly inter-monitor disagreement band as an empirical spatial-uncertainty envelope; monitor-swap runs (field = site 0080 only vs 2011 only); tri-county LOOCV to convert the anti-interpolation argument into a measurement.

- **Offline dose repair.** Inhaled dose is pure accounting — exported columns allow exact recomputation under any (IRwalk, IRrest) pair without re-running; widen the resting sweep to 0.25–0.80 m³/h per D16's own prescription.

- **Deployment-delay sensitivity.** The two observed 2020 activation lags (3–4 days) applied to the 2026 arms — a one-column CSV edit per arm.

- **Behavioral-conditioning disclosure.** The archived ER measured-awareness results (all arms ≈ equal at ~17.8%; mobility gap inverts; triage arbitrates nothing) written into the manuscript as the scenario-conditioned counterpoint. Zero new runs.

- **The freeze + registration apparatus of VP-1** (§9): tag, manifest, prediction template, linter rules, escrow design — all buildable today.

## 4 · What requires new empirical data

| Observable | Instrument | What it unlocks |
|---|---|---|
| Hourly per-site occupancy + capacity during a smoke activation | Operator hourly headcount log (aggregate, no identities) | Site-hour occupancy MAE/calibration — the primary validation outcome |
| Arrival/departure timestamps | Door log at hour resolution; timestamped intake | Arrival-time W₁/CRPS; hazard-shape estimation (bRisk, half-life) |
| Turnaways + refusal-reason taxonomy | One-page tick-sheet per shift (capacity / pets / belongings / dependents / behavioral / other) | Refusal-count error; policy-vs-capacity separation (model already exports both) |
| Transportation requests vs completed trips | 211/outreach dispatch log | First evidence for a transport mechanism the model currently lacks entirely |
| Outreach contact log (timestamp, coarse area, info delivered) | Per-contact form with partner teams | Measures λoutreach (currently unsourced, A-31); enables encouragement designs |
| Contemporaneous awareness + barriers of *non-attempters* | Re-fielded Hines instrument, prospective, larger N, defined frame | The denominators no operational log can observe — barrier coefficients are unidentifiable from arrival-conditioned data (a structural selection problem) |
| Origin area at privacy-protecting resolution | One intake question, coarse zones, k≥5 per cell | Origin-flow validation; βtravelTime estimation |
| Facility physical audit | Walk-through: floor area, posted occupancy, restrooms, ADA, HVAC/MERV, storage | The R5 candidate-facility dataset; day-center capacities (their absence currently biases arm A downward) |
| Indoor shelter PM2.5 | Paired indoor/outdoor calibrated low-cost monitors during an episode | Grounds an infiltration factor; the only route back to any "clean-air-capable" claim |
| Awareness→access identification | Cluster-randomized or stepped-wedge outreach during an exercise/event, with timestamped door counts; IRB + provider partnership | The only route to an *identified* awareness effect; until then the claim must read "modeled shelter use is sensitive to assumed awareness" |

All instruments must clear IRB and the project's disclosure posture (k≥5 floors count *reports*, not sites; never point coordinates).

## 5 · What requires external data acquisition

Findings from the web-research agent; every row labeled by verification level. No agency was contacted.

| Source | What it provides | Access | Level |
|---|---|---|---|
| Multnomah Co. records request (ORS 192.311–431): Sept-2020 cleaner-air shelter logs | Nightly guest counts, staffing, transports — the Jan-2024 winter AAR proves per-facility nightly Guests/Capacity tables are a record type the county compiles; the fetched Sept-2020 daily releases contain zero counts | Records portal; public-interest fee waiver | `FETCHED` |
| DEQ Wildfire Smoke Trends reports (May 2023 + the update covering data through 2025) | Decisive severity context: **all** Portland very-unhealthy/hazardous days on record occurred in 2020; Oct 2022 (Nakia Creek, 3 days ≥USG) and the live Aug 2026 event are the only multi-day candidates since — both far milder. A severity-matched second Portland episode does not exist through 2025. | Open PDF | `FETCHED` |
| Childs et al. (Stanford ECHO) daily wildfire smoke PM2.5 | The spatially resolved product that actually covers Sept 2020: daily, 10 km grid + county/tract/ZIP, 2006–2020 (v2 beta to 2023) | Open download | `FETCHED` |
| NOAA HMS smoke polygons (Sept 2020 verified) | Daily plume masks, fusion covariate | Open, predictable URLs | `FETCHED` |
| PurpleAir historical API | Intra-urban low-cost sensors for Sept 2020; needs wildfire correction; Portland 2020 density not yet established | Paid API (cheap at event scale) | `SEARCH-ONLY` |
| EPA AQS monitor census 2020 (parsed) | Confirms exactly 2 Multnomah PM2.5 sites in 2020 — regulatory network cannot resolve intra-urban gradients | Open bulk download | `FETCHED` |
| EQUATES (CMAQ) | **Does not cover the event** — ends 2019; ruled out | — | `SEARCH-ONLY` |
| Metro RLIS building footprints + taxlots; PP&R community-center list; TriMet GTFS | Assembly route for a verified candidate-facility inventory (floor area partial; public HVAC/filtration data absent everywhere) | Open (ODbL) | `SEARCH-ONLY` |
| Seattle / King County package | **Strongest second city**: same Sept-2020 event; dedicated SoDo "healthy air center" (~80 served per county release) + two filtration-equipped shelters; mature HMIS/data infrastructure; Bolt Creek 2022 as a repeat episode | Open pages + WA records request | `FETCHED` |
| PSU HRAC: Hines microdata; Pathways 2026 (N=541) | Individual-level awareness×attempt×barriers; updated service-navigation survey | Data request to PSU (user-mediated) | `FETCHED (existence)` |
| 211info data team | Call volumes/timing (2024 systemwide: ~523k requests); no open dataset exists | Data request | `SEARCH-ONLY` |
| IJGIS + ERL scope pages | IJGIS: requires "original ideas, approaches, methods" — a GIScience contribution, not a case study. ERL (verbatim): will not accept "local case studies (city-scale and smaller) which do not adequately show how results/findings are timely and significant in a broader context outside of the study area." | Open | `FETCHED` |

## 6 · Claims that currently exceed the evidence

Consolidated across the eight requirement analyses; deduplicated. The three structural items lead; wording items follow. Locations are verifiable file:line cites from the audit agents.

### Structural (would change a review outcome)

| # | Claim | Location | Why it exceeds the evidence |
|---|---|---|---|
| S1 | Manuscript tex abstract asserts the 1.5–15.6× calibration bracket against "the one (approximate) observed occupancy record" — while its own Calibration subsection states no suitable record exists; the ~130/198 provenance (Street Roots, 2020-09-16) appears nowhere in the manuscript; the superseded md abstract says the opposite ("No observational occupancy record could be located") | tex:75-76 vs tex:929-935; md:27 | Internal contradiction on the paper's only external anchor. One passage must change, and the provenance must enter the manuscript. |
| S2 | "[The universal-awareness limitation] applies identically to all three scenarios, so it does not affect the comparison between them, which is what this chapter claims" | tex:944-945 | **Tested by the project's own archived experiment, and failed.** Under measured awareness 0.356 (ER arms, docs/runs/phase-e/), A, C, and D shelter within 0–1 residents of each other, while the between-seed spread is ~47 residents (seeds 42–44); the binding constraint moves from architecture to behavior; the mobility gap inverts; the triage reserve arbitrates nothing. The manuscript presents the awareness layer as hypothetical future work (tex:1069-1074) although it is implemented, locally sourced, and archived. A reviewer who finds the archives will read this as selective disclosure — the single most dangerous item in this audit. |
| S3 | Present-tense system claims: "The present 36-facility system shelters 30.1% of residents"; "550 people were refused shelter…"; "the same 6,842 spaces more than halve refusals depending only on placement" | md:27, 45, 315, 319; tex:56-57, 1043-1047 | Model outputs under universal awareness + omniscient choice + zero observed turnaway records, phrased as facts about the real system. The repo's own ER runs give ~17.8%, not 30.1%. Hedges exist elsewhere but not in the sentences a reviewer will quote. |

### Scoping and wording (each individually fixable in text)

| # | Claim | Location | Problem |
|---|---|---|---|
| W1 | "36 clean-air-capable facilities" | md:97,182; tex:315,582 | Retracted as an overstatement in the project's own results doc (no source establishes filtration; indoor air unmodeled); retraction never propagated to either manuscript form. |
| W2 | "C is a buildable proposal, not a thought experiment" | build_scenario_c_2026.py:4 | Contradicted 18 lines later in the same docstring; no building, zoning, staffing, or cost is verified for any new site. |
| W3 | Deck: "The optimiser contributes zero to headcount and 63.1% shorter walks"; results doc and scenario_c_report.json omit the in-sample caveat | symposium.html:335; PRESENT_DAY…md; scenario_c_report.json:91-96 | The walking edge is computed on the demand the optimizer was fitted to — an upper bound presented without the chapter's own first-limitation conditioning. |
| W4 | Registry "swept" flags in past tense for unexecuted sweeps (V29 awareness CI, V41 outreach, V35–V43 coefficients, smokeScale); "sensitivity-swept" ventilation whose 0.4–0.8 range excludes the EPA source's own sedentary cells | variables.csv rows 34-56; FINAL_DATA_VALIDATION_REPORT.md:165 | Declared coverage read as executed coverage; grep of all archived manifests shows only 0.356/1.0 awareness and λ=0.0 ever ran. |
| W5 | Inhaled-dose magnitudes and the 2.7× walk:rest ratio, cited to the EPA Exposure Factors Handbook | md:166-170, 236 | The 0.61 m³/h resting rate is not in the cited source (open defect D16: "do not publish V25 as currently sourced"); true ratio could be 2.25–5.40× by cell. Direction survives; magnitudes don't. |
| W6 | Sheltered time booked at zero exposure; no infiltration/indoor-air disclosure anywhere in the chapter | md:170 + grep of docs/chapter | An unstated infiltration-factor-of-zero assumption inflates every absolute exposure reduction by an unquantified amount. |
| W7 | "C's siting advantage on headcount is worth at most about 342 spaces"; knife-edge thresholds stated as sharp (and inconsistently: 1.1× in tex, 1.2× in two results docs; provenance table supports 1.1×) | tex:864-874, 1060-1066 vs README_RESULTS.md:228-230 | An "at most" universal bound from a 1-D sweep at midpoint capacities, universal awareness, one campsite draw — with input uncertainty larger than the sweep grid; plus a cross-document inconsistency. |
| W8 | Mobility-limited "remain the worst-served group throughout" / equity findings "survive every measure" | md:273, 317; tex:1056-1057 | Robust across reporting scales and seeds only; inverts under measured awareness; conditional on FCFS admission (A-16 open) and an unswept impaired-speed distribution. |
| W9 | Triage-reserve policy sentence: "the triage reserve buys the same equity for free… survives every control" | tex:1058-1059, 1066-1067 | Under measured awareness arm D records zero capacity refusals — the reserve arbitrates nothing; the Phase-E doc's mandatory caveat never reached the manuscript. |
| W10 | "The approach generalizes beyond smoke" (topic sentence) | tex:1081; md:323 | The paragraph's own close correctly downgrades to "a hypothesis those settings could test"; the opening asserts it as accomplished. |
| W11 | The historical run's "only job is calibration" | README_RESULTS.md:250 | No parameter was ever fitted to the observation (E9 deferred, no archive); what exists is a one-point comparison. |
| W12 | SUBMIT.md claims the bracket + awareness attribution are "already in the chapter" | SUBMIT.md:298 | The chapter's calibration section contains neither; and the attribution is one candidate explanation among unexcluded competitors. |
| W13 | md manuscript omits B's physical unrealizability (tex-only); "ten day centers" vs the audit's count of 11 | md:299 vs tex:1017-1020; md:305 | Whichever form circulates without the realizability sentence lets 91.6% read as an achievable target; minor count inconsistency. |

## 7 · Implementation plan (by scientific importance and dependency)

### Phase 0 — Truth alignment (text only; days; overlaps the Aug-23 camera-ready)

- Resolve S1: pick one calibration story, import the Street Roots + Hines provenance into the manuscript, retire the md/tex divergence (the md declares itself superseded — treat tex as sole source).

- Resolve S2: disclose the ER measured-awareness results (a short "behavioral conditioning" subsection) *or* explicitly rescope the chapter to the no-behavior arms *and* delete the "applies identically" sentence. Fix the stale future-work paragraph.

- Recondition the S3 present-tense sentences ("under universal awareness and immediate compliance, the modeled system admits…").

- Delete/repair W1, W2, W10, W11, W12; propagate the in-sample caveat (W3) to the results doc, README, scenario_c_report.json, and the deck; harmonize the knife-edge threshold (W7).

- Registry hygiene: add an executed-sweep column (run-family id) so declared ranges can't read as executed coverage (W4); retire stale rows A-05/A-15; update V29–V51 statuses; author decision on D16 (W5) and the dose demotion; add the indoor-endpoint disclosure (W6).

- Extend `claims.yaml`: new linter rules for upper-bound conditioning on 96.0/91.6/63.1 statements, tier labels (§9), and "estimated/fitted/calibrated" guards on ASSUMED coefficients.

### Phase 1 — Time-sensitive captures (this week; user-owned)

- Snapshot the encampment feed now and weekly during fire season (`fetch-encampments.ps1`).

- File the Sept-2020 records request (occupancy logs, activation agreements, after-action material — could resolve A-04 if the records state capacity and its unit, and possibly enlarges the 2020 observation set). Prepare the parallel Aug-2026 request for when records close.

- Pull Aug-2026 AQS hourly PM2.5 (`fetch-aqs-pm25.ps1 -Year 2026 -Month 08`); query the PurpleAir sensor census for Portland Sept 2020 and Aug 2026.

### Phase 2 — In-repo computation (weeks; no new data; §3 items in dependency order)

- VP-1 freeze mechanics + prediction registration (gates everything below).

- E9 censored calibration → decision gate for the GSA's αHazard treatment.

- Awareness-CI and λ-outreach sweeps → interval-reported headlines.

- Spatial blocked CV + temporal split + five baselines + location-uncertainty bootstrap (pre-registered predictions P-V1…P-V4, including the expected nulls).

- Feasibility-capped re-optimization; capacity-conversion Monte Carlo; deployment-delay sensitivity.

- Parameter-exposure change (6 constants) + R3 re-proof → Morris-B → Sobol → awareness×capacity regime grid → P(regime) + â*(K) boundary. Offline dose resampling rides along.

- Smoke bounding: inter-monitor band, monitor-swap arms, tri-county LOOCV.

### Phase 3 — External acquisition (1–3 months; mostly user-mediated requests)

County records (2020 + 2026), PurpleAir historical pull + Childs et al. + HMS fusion surface, RLIS footprints/taxlots + PP&R + GTFS candidate-facility assembly, PSU microdata (Hines, Pathways), 211info data request.

### Phase 4 — New empirical data (next smoke season; IRB + provider agreements)

The VP-1 prospective protocol: standing county data agreement with escrow; hourly census + turnaway tick-sheets + intake addendum (5 items); outreach logs; re-fielded survey; facility walk-through audits; paired indoor/outdoor sensors. If an outreach experiment is ethically feasible with providers, the stepped-wedge design identifies the awareness effect; otherwise the claim stays narrowed.

### Phase 5 — Second city & venue (the ERL gate)

Seattle/King County replication via the harmonized public-data pipeline (OSM/SDOT network, AQS series, PIT + county inventory, 311-style proxy), reported in dimensionless form (access vs surplus fraction s, gap G(s), knife-edge location); plus the cross-event observed-uptake meta-table (Portland ~130/198; Seattle ~80/…; acquired records). **Venue decision:** the Springer chapter stands with Phase 0 alone; IJGIS requires the Phase-2 validation/uncertainty protocol as the methodological contribution (the optimizer itself is conventional); ERL requires Phase 5 — without it, do not submit breadth claims there.

## 8 · Methods for each missing component

| Gap | Method (full specs in the four method designs) |
|---|---|
| Calibration from one censored observation | Censored likelihood / ABC over (awareness, hazard intercept): OCC right-censored at 99, CJ point-observed; Beta(26.5, 47.5) awareness prior (Jeffreys on 26/73) with power-prior discount grid δ ∈ {1, .5, .25}; A-04 capacity-unit uncertainty as an interval on the denominator; posterior replaces the bracket. Manski-style bounds as the assumption-light companion. |
| Departure model | Discrete-time person-hour logit aligned to the implemented hazard (α* + bR(1+γVv)zR(τ½) + σθ − Σκ·barriers), hierarchical θ (person + origin-area, partial pooling), shrinkage pulling the three κ toward a common value. **Identifiability facts:** wOfficial is perfectly collinear with α (departure requires an open shelter in the code) — only the sum is estimable; σθ is weakly identified from single-spell data (keep as prior-anchored scenario axis); barrier κ are unidentifiable from arrival-conditioned data (selection) — survey-only. |
| Awareness | Latent two-state chain (UNAWARE→AWARE) marginalized in the likelihood, mirroring the engine; λ = contact rate × conversion, separable only with outreach logs + a survey pair; p₀ and α confounded in aggregate data — the survey prior is load-bearing. |
| Destination choice | McFadden conditional logit over open reachable shelters (network walk time from the same Dijkstra trees the engine uses; ln capacity; pet-policy × owner; prior-refusal ↔ believedFull). Nested by facility type; mixed logit extension. **Power:** MDE ≈ 2.80/√(N·I₁); at the 2020 event's N≈130, J=2, MDE ≈ 0.35 SD and βcapacity is fully unidentified (99 vs 99) — the realistic instrument is prospective logging in the 36–48-site present system. |
| Spatial validation | Wave-respecting temporal split (17×200 report waves); DBSCAN report→site dedup (ε ∈ {25,50,100} m); edge-corrected KDE on the 150 m privacy-aligned grid (LOWO-CV bandwidth); variogram-ranged buffered leave-block-out CV; blind refit; scoring by capacity-feasible transportation problem (E1), 30-min coverage (E2), Q90 walking time at 0.95 m/s (E3 — the equity tail metric, chosen over p-center and Gini for stability and mechanism alignment); five baselines incl. exact MIP p-median and ε-constrained equity siting; block-bootstrap CIs; k=5 replication arm. |
| Facility feasibility | Footprint×taxlot×zoning overlay → occupant-load conversion → attribute screen; capacitated facility location with fixed charges (MILP, exact at this size); ε-constraint cost–access–equity frontier; per-type expansion ceilings; activation-lag modeling from the two observed 2020 lags. |
| Smoke surface | Tiered: (1) bounding from existing monitors (band, swap runs, LOOCV); (2) fusion — PurpleAir (wildfire-corrected) + 2 AQS anchors + ASOS meteorology + HMS mask via regression kriging, validated leave-one-out; Childs et al. tract-level daily as the independent cross-check; then C(x,t) sampled along routes. Dose only under bounded IR + infiltration, else demoted to supplement. |
| Global UA/SA | Pilot (noise/ICC, seed policy) → Morris (r=20 Campolongo, placebo dummy factor as noise floor) → Sobol (Saltelli/Jansen, N=512, bootstrap-CI convergence, importance-reweighting for distribution shape) → dedicated awareness×capacity grid; regime indicator I = 1{\|ΔS/Δcap\| ≤ ε ∧ \|ΔS/Δaware\| ≥ κ}, thresholds registered before first run; P(regime) + boundary â*(K); the a=1 column must reproduce the archived knife-edge (built-in harness check). Known hazards engineered around: negative batch constants must be "double" (parser zeroes them — verified in-repo), output dirs keyed by seed only, one engine per index estimate. |
| Transportation (absent from the model) | Two-stage extension gated on Phase-4 dispatch logs: a request/fulfillment queue (211-mediated rides) with rate and service time estimated from logged requests vs completed trips, entering the engine as a second movement mode behind a mechanism switch (R3-gated, default off). Until those logs exist the model remains walk-only, and the manuscript must state that scope boundary explicitly. |
| Broader significance | Dimensionless restatement (sheltered fraction and gap as functions of surplus fraction s); transportability audit from the registry's LOCAL/TRANSFERRED/ASSUMED ledger; cross-event uptake meta-table; one replication city (Seattle). |

## 9 · Validation protocol with train/holdout separation (VP-1)

- **Freeze semantics (F1–F7).** One annotated tag + FREEZE_MANIFEST: registry SHA-256s, batch XMLs from frozen generators only, input-data hashes, analysis-code freeze, seeds 42–50 preregistered, append-only freeze-break log. Written dispositions for open defects (D16 → dose metrics excluded from acceptance until resolved; A-16 → refusal metrics carry order-variance; A-04 → pinned with declared unit uncertainty).

- **The calibration budget (E9 rule).** The single 2020 occupancy record may serve calibration *or* validation, never both. Recommended: keep αHazard survey-derived and quarantine the record for scoring.

- **Temporal arm — prospective primary.** Freeze now; standing county data agreement with escrow (observations released only after the predictions commit SHA is furnished); episode-2 eligibility screen registered in advance (≥12 h ≥55.5 µg/m³ + documented activation + ≥1 occupancy observation per site-night). Retrospective candidates (2017, 2018, Oct 2022) get screened mechanically but are expected to fail the occupancy criterion — DEQ's own record shows no post-2020 episode approaches 2020 severity, so the prospective arm and the Aug-2026 records request are the realistic paths.

- **Temporal fallback — within-2020 quarantine split,** honestly tier-capped: fit window Sept 10–13 contains zero behavioral observations; the test is predicting the two site-night counts of Sept 15; leakage already occurred (the bracket is in the tex abstract) and occupancy is monotone by construction. Worth executing; never reportable as the study's temporal validation.

- **Spatial arm.** The §8 blocked CV — fully executable now, sites selected blind to holdout, evaluation on later-period demand.

- **Outcome metrics (frozen estimators).** Site-hour occupancy MAE/nMAE + calibration slope + ensemble coverage + a capacity-state confusion matrix (because a model that predicts "full" everywhere games MAE); arrival-time Wasserstein-1 / CRPS on cumulative curves; refusal log-ratio (definition matched to county logging practice); departure-probability reliability diagram + Brier/Murphy decomposition (survey-based); mobility-group access log-odds-ratio error (sign first, magnitude second); intervention effects as paired seed differences with a 100-draw LHS × 3-seed nested ensemble (the parametric layer the seed ranges lack).

- **Acceptance, non-circularly justified.** P1 decision-margin anchoring (error 

## Appendix A · Reconciling the reviewer's numbers

| Cited | What the audit found |
|---|---|
| ~130 vs 198 (1.52×) | Real, but lives outside the manuscript: Street Roots 2020-09-16 (~90 OCC + ~40 CJ) vs 198 modeled (both 99-bed sites fill; verified in the histref run manifest). Deliverables use a censored bracket 1.5–15.6× (15.6 = unconstrained demand 2,022/130), linter-enforced. The tex abstract cites it; the tex body denies a record exists (item S1). |
| 63.1% | **Not in the manuscript.** It is the symposium deck's optimizer-vs-random-pool walking edge (5,537 m vs 15,011 m). The B→C walk reduction is 25.2%; A→C is ~68%. A reviewer citing 63.1% read the deck. |
| 175 → 536 beds | **Not in the manuscript.** It is THE_COMPLETE_STORY's realizability example (largest facility under B's 3.06× scale-up); the tex uses a different example (pod village 66→202) and already calls B "physically unrealizable in place… a diagnostic bound, not a plan." |
| County-uniform PM2.5 | Accurate, and disclosed three times with its consequence; the defense (2 in-county monitors — verified against EPA's 2020 monitor census) is genuine. What's missing is the sharper reframe the repo's own audit supplies ("an access statistic wearing exposure units") and any bounding of the unresolved heterogeneity. |
| Street-network nodes | Accurate and disclosed ("Are the ten new sites real? No."). The unfixed part is prescriptive sentences that outrun the disclosure (items S3, W2, W3). |

## Appendix B · Audit method & provenance

Seventeen agents in three phases: 4 evidence-inventory readers (manuscript, model mechanisms, data assets, validation status), 8 adversarial requirement analysts (R1–R8), 5 method designers (validation protocol, statistics, spatial, GSA, external data). Every factual claim carries a file:line citation assigned one of four levels: `VERIFIED` read directly this audit · `REPORTED` asserted by repo documents, not re-executed · `ABSENT` confirmed missing · `EXTERNAL-FETCHED / SEARCH-ONLY` web sources, opened vs search-level. Run counts, byte-identity passes, and archived statistics were read from the repo's reports, not re-executed (the verification scripts write into the tree and require local run artifacts). No observations, coefficients, or records were invented; absences are reported as absences. Housekeeping note: the untracked `Geography (1).zip` at the repo root is the stock Repast demo scaffold (verified from its listing) — safe to archive or delete; `Streets.zip` is the gitignored pristine RLIS source archive and should stay.

Full structured agent outputs (17 JSON files) accompany this report in the session scratchpad; the four method designs contain the complete specifications summarized in §8–§9.
