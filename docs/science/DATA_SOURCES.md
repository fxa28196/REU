# Dataset Evaluation Registry

Systematic evaluation of every dataset required to complete the wildfire-smoke
shelter-placement model. One entry per dataset, whether or not it has been
acquired. Source priority applied throughout: **government agencies → peer-
reviewed literature → university publications → official GIS repositories →
reputable scientific organisations.** Blogs and secondary summaries are used
only to *locate* primary material, never as the source of a value.

Status vocabulary: **ACQUIRED** (in repo, checksummed in
[`../../Geography/data/README.md`](../../Geography/data/README.md)) ·
**IDENTIFIED** (authoritative source located, acquisition path known, not yet
obtained) · **GAP** (no authoritative source yet identified).

Companion documents: [`DESIGN_SPEC.md`](DESIGN_SPEC.md) (how each value enters
the model), [`VALIDATION_STRATEGY.md`](VALIDATION_STRATEGY.md),
[`BIBLIOGRAPHY.md`](BIBLIOGRAPHY.md) (citations + DOIs + BibTeX).

---

## D0 — Portland street centerlines · **ACQUIRED (provenance incomplete)**

| Field | Value |
|---|---|
| Source organisation | Portland Metro RLIS (inferred from schema; acquisition route unknown) |
| Publication date | ⚠️ Unknown — predates version control |
| Geographic coverage | Portland metro / Multnomah County |
| Temporal coverage | Static snapshot |
| Licence | ⚠️ Unverified for redistribution |
| Completeness | 112,070 features; 100% carry `PDX_F_NODE`/`PDX_T_NODE` |
| Uncertainty | Centerline geometry, not sidewalk geometry; no pedestrian attributes |
| Limitations | Freeway segments not yet excluded from the pedestrian graph; `getGeometryN(0)` discards multi-part remainders |
| In use | Yes — routing graph + street layer (commit `5092fde`) |

**Action required before publication:** re-acquire from Metro's official
distribution (https://gis-pdx.opendata.arcgis.com / Metro RLIS) to establish a
citable release version and explicit licence, then re-checksum. Until then the
street layer is *usable for modelling* but **not citable as provenanced data**.

---

## D1 — Cleaner-air shelter locations, capacities, operating dates · **IDENTIFIED (partially reconstructed)**

The "status quo" placement strategy (slide 5) requires the real September 2020
shelter map. Primary sources located and read:

| Source | Type | Date | What it establishes |
|---|---|---|---|
| Multnomah County Joint Office of Homeless Services (JOHS), press release "Smoke, dangerous air prompt Joint Office…" | Government press release | **2020-09-10** | Additional shelter opened the night of Sep 10, operating **24 hours** rather than overnight-only, for the duration of the air event; access via 211 with transport arranged by outreach teams; 40,000 KN95 masks distributed |
| JOHS daily updates (Sept 12, 13, 14, 16, 17, 18 releases) | Government press releases | 2020-09-12…18 | Day-by-day confirmation of continuous operation; the **Sept 18** release states the response ran **nine consecutive days**, ending the morning of **Sat 19 Sept**; ~**1,400 year-round beds** existed county-wide before the emergency expansion; 27 outreach/mutual-aid partners |
| Street Roots, "Portland's houseless face health risks amidst toxic air…" (J. Pollard) | Non-profit newsroom (secondary, corroborating) | 2020-09-16 | **Charles Jordan Community Center (St. Johns): capacity 99**; **Oregon Convention Center: capacity 99**; **Mount Scott Community Center: prepped/standby**; occupancy on the Tuesday night: **40** at Charles Jordan, **nearly 90** at the Convention Center; no ID required |

**Reconstructed operating record (to be confirmed against a primary JOHS source
before use):**

| Site | Capacity | Opened | Closed | Status |
|---|---|---|---|---|
| Oregon Convention Center | 99 | 2020-09-10 | 2020-09-19 (a.m.) | Operating |
| Charles Jordan Community Center | 99 | 2020-09-11 | 2020-09-19 (a.m.) | Operating |
| Mount Scott Community Center | (unstated) | opened 09-11, moved to standby | — | **Standby — never at capacity** |

- **Geographic coverage:** Multnomah County. **Temporal:** 2020-09-10 → 09-19.
- **Licence:** government press releases (public information); the Street Roots
  article is © Street Roots — used here as corroboration and cited, not
  redistributed.
- **Completeness:** ⚠️ **Street addresses / coordinates are NOT in any source
  read so far.** All three are well-known public facilities whose coordinates
  can be obtained from the City of Portland Parks & Recreation facilities layer
  and the Oregon Convention Center's public address — but geocoding must be
  documented as a separate, checksummed step, not improvised in code.
- **Uncertainty:** the 99-capacity figure comes from a newsroom, not from JOHS
  directly; it is plausible (COVID-era distancing caps) but **must be
  confirmed** — likely candidates: a JOHS public-records request, or the
  county's 2020–21 shelter reports.
- **Limitations for modelling:** capacity 99 is a *nightly* cap, not a
  throughput; the model's capacity semantics must state which is meant.
  Mount Scott's standby status means a faithful "status quo" scenario has
  **two** operating sites, not three.

**Acquisition plan:** (1) request the JOHS after-action/shelter log for
Sept 2020 (public records); (2) geocode the three facilities from the official
City parks facility dataset + OCC address; (3) commit as
`Geography/data/shelters/shelters_2020-09.csv` with a per-row `source` and
`source_date` column.

---

## D2 — Unsheltered population size, distribution, demographics · **IDENTIFIED**

| Field | Value |
|---|---|
| Primary source | *2019 Point-in-Time Count of Homelessness in Portland/Gresham/Multnomah County* — Portland State University **Regional Research Institute** for Multnomah County; PDXScholar `rri_facpubs/63` |
| Publication date | 2019 (count night **2019-01-23**) |
| Geographic coverage | Portland / Gresham / Multnomah County (CoC OR-501) |
| Temporal coverage | Single night, 2019 — **the nearest PIT count to the Sept 2020 event**; the next count was 2022 (no 2021 unsheltered count, COVID) |
| Headline figures | **4,015** people experiencing homelessness total: **2,037 unsheltered**, 1,459 emergency shelter, 519 transitional housing |
| Licence | University/county public report |
| Completeness | Counts are a documented **undercount**; demographic sub-tables (age, race, disability, chronic conditions) exist in the full report but have not yet been extracted here |
| Uncertainty | Point-in-time snapshot 20 months before the event; PIT methodology misses people in concealed locations |
| Limitations | **No spatial distribution suitable for agent placement is published** — PIT reports counts by category, not encampment coordinates |

**Consequence for the model:** `numAgents` should be justified against the
2,037 unsheltered figure (with explicit scaling if fewer agents are simulated),
and the age/disability sub-tables should drive V1/V3 rather than any invented
distribution.

**Companion gap — encampment locations (D2b, GAP):** the City of Portland
"One Point of Contact" campsite-report data is the usual candidate, but it is
a *complaint-report* dataset (reporting bias toward visible, complained-about
camps) and its public availability/licensing for 2020 has not been verified.
Until resolved, agent start locations remain a documented placeholder.

---

## D3 — Hourly PM2.5 observations · **ACQUIRED**

Full record in [`../../Geography/data/README.md`](../../Geography/data/README.md) §2.
Summary: EPA AQS parameter 88502, 7 monitors across Multnomah/Washington/
Clackamas, 2020-09-01…30, 4,795 hourly rows, public domain, retrieved
2026-07-24, SHA-256 recorded, reproducible via `scripts/fetch-aqs-pm25.ps1`.

Key limitations carried forward: non-FRM/FEM instruments (possible bias under
dense wood smoke); **2 monitors inside Multnomah County** — far too sparse to
resolve intra-urban gradients on its own (see D4 and the interpolation
discussion in DESIGN_SPEC V5).

---

## D4 — Meteorology (wind speed/direction, PBL, temperature) · **IDENTIFIED**

| Field | Value |
|---|---|
| Candidate primary sources | NOAA **Integrated Surface Database (ISD)** / Local Climatological Data for KPDX (Portland International Airport); NOAA **HRRR-Smoke** reanalysis for modelled smoke fields |
| Geographic/temporal | Point observations at KPDX, hourly, 2020-09 |
| Licence | U.S. federal government work — public domain |
| **Decision: DEFER.** | Wind is only required if the smoke field is *dynamically* modelled or if interpolation is made anisotropic. The September 2020 event was a regional smoke inundation with concentrations 2–3 orders of magnitude above baseline and comparatively low intra-urban contrast — a defensible first model treats the field as spatially smooth and time-varying (see DESIGN_SPEC V5, option A). Adding wind before demonstrating that the smooth field is inadequate would add unvalidatable complexity. |
| Revisit when | Monitor-to-monitor differences during the event prove large enough that a smooth interpolant fails leave-one-out validation (test specified in VALIDATION_STRATEGY §5). |

---

## D5 — Age-related PM2.5 risk (RR_age) · ⚠️ **CITATION PROBLEM — DO NOT CODE THE SLIDE VALUE**

The project slides state **RR ≈ ×1.45 for adults 65+**, attributed to
**Di et al. 2017** (*Air Pollution and Mortality in the Medicare Population*,
NEJM). The paper was retrieved and its effect estimates checked directly:

- Di et al. 2017 reports **HR = 1.073 (95% CI 1.071–1.075) per 10 µg/m³
  increase in annual PM2.5**, all-cause mortality.
- Restricted to PM2.5 < 12 µg/m³: **HR = 1.136 (1.131–1.141) per 10 µg/m³**.
- Subgroup effects are reported by race, sex and Medicaid eligibility (e.g.
  Black beneficiaries ≈ 1.22 per 10 µg/m³) — **not** by age band.
- **The entire cohort is aged 65+ (60,925,443 Medicare beneficiaries).** The
  study therefore *cannot* produce a "65+ versus under-65" multiplier, and
  **no value near 1.45 appears in the paper.**

**Conclusion: the ×1.45 figure is not supported by the cited source.** It is
either a transcription of a different study, a derived quantity, or an error.
Per the project rule *"do not invent scientific values"*, it must not be
hard-coded on this citation.

**Candidate resolutions (in preference order):**
1. Recover the actual source from the pre-registration/mentor — if ×1.45 came
   from a specific paper, cite that paper and use its CI as the sweep range.
2. Reformulate as a **concentration-response function** rather than a
   categorical multiplier: apply Di et al.'s HR per 10 µg/m³ directly, which is
   both properly sourced and mathematically cleaner (see DESIGN_SPEC V2,
   option B — the recommended path).
3. If a categorical age multiplier is scientifically required, source it from a
   study that *contrasts* age strata, and document the contrast explicitly.

Until resolved, RR_age enters the model **only** as a parameter with a
documented `UNSOURCED — DO NOT PUBLISH` flag and a default of 1.0 (no effect),
so that no result silently depends on an unverifiable number.

---

## D6 — Comorbidity risk (RR_COPD, RR_asthma) and prevalence · ⚠️ **CITATION PROBLEM + GAP**

**The RR side.** Slides state **COPD RR ×1.80**, attributed to
*"Anderson et al. 2013"*. No 2013 Anderson paper reporting a PM2.5–COPD RR of
1.80 could be located. The closest match is:

> Anderson JO, Thundiyil JG, Stolbach A. *Clearing the Air: A Review of the
> Effects of Particulate Matter Air Pollution on Human Health.* J Med Toxicol.
> **2012**;8(2):166–175. DOI: 10.1007/s13181-011-0203-1

— which is a **narrative review** (year 2012, not 2013) and is not a source of
a COPD-specific RR of 1.80. **Treat the ×1.80 value as unverified.**

**Better-matched primary literature for wildfire-smoke respiratory risk:**

| Source | Why it fits |
|---|---|
| Reid CE et al. *Critical Review of Health Impacts of Wildfire Smoke Exposure.* Environ Health Perspect. 2016;124(9):1334–1343. DOI: 10.1289/ehp.1409277 | The standard review; documents consistent associations between wildfire smoke and **asthma and COPD exacerbations** — the correct exposure context (wildfire smoke, not urban PM2.5) |
| DeFlorio-Barker S et al. *Cardiopulmonary Effects of Fine Particulate Matter Exposure among Older Adults, during Wildfire and Non-Wildfire Periods, US 2008–2010.* Environ Health Perspect. 2019;127(3):37006. DOI: 10.1289/EHP3860 | Directly comparable design: **older adults**, **smoke vs non-smoke days**; finds **asthma** hospitalisation risk elevated on smoke days while general cardiopulmonary risk was similar — a nuance the model should respect rather than flatten |

**Action:** extract exact effect estimates *with confidence intervals* from
these papers' results tables (full-text access required — not yet done) and use
them as the sourced RRs and sweep bounds.

**The prevalence side (GAP → IDENTIFIED).**

| Candidate | Assessment |
|---|---|
| **CDC PLACES** (census-tract COPD and current-asthma prevalence, BRFSS-based small-area estimates) | Government, tract-level, public domain, directly downloadable. **But**: models the *housed* general adult population — applying it to unsheltered people would understate risk substantially |
| Snyder LD, Eisner MD. *Obstructive Lung Disease Among the Urban Homeless.* Chest. 2004;125(5):1719–1725. DOI: 10.1378/chest.125.5.1719 | Population-specific (San Francisco shelter residents, spirometry-confirmed) — the right population, but **n = 68**, single city, 20 years before the event |
| Fazel S, Geddes JR, Kushel M. *The health of homeless people in high-income countries…* Lancet. 2014;384(9953):1529–1540. DOI: 10.1016/S0140-6736(14)61132-6 | Authoritative synthesis of homeless-population disease burden; use for context and for justifying an elevated-prevalence range |

**Recommended treatment:** make comorbidity prevalence an **explicitly
calibrated/swept parameter** bounded below by CDC PLACES tract values for
Multnomah County and above by homeless-specific literature — reported as a
range, never as a point estimate. This is exactly the "comorbidity assumptions"
sweep axis the slides already promise.

---

## D7 — Social vulnerability / environmental justice layers · **IDENTIFIED**

| Source | Detail |
|---|---|
| **CDC/ATSDR Social Vulnerability Index (SVI) 2020** | 16 ACS variables → 4 themes → percentile ranks (0–1) per census tract. Government, public domain, documented methodology. Note: 2020 tract boundaries differ from earlier releases |
| **EPA EJScreen** | Environmental + demographic indicators at block-group level; EJ indexes = environmental indicator × demographic index |

**Role in this model:** *validation and interpretation*, not as a driver. The
model's own equity output is the Gini coefficient of exposure across agents
(V14). SVI/EJScreen provide an external check — e.g. do the tracts where the
model predicts the worst exposure correspond to independently high-vulnerability
tracts? Using SVI as a model *input* would risk circularity.

---

## D8 — Walking speed / mobility · **ACQUIRED (literature)**

Bohannon 1997 (DOI 10.1093/ageing/26.1.15), already implemented as
`walkingSpeedMps = 1.30` and flagged PROVISIONAL — see
[`VARIABLES.md`](VARIABLES.md) V10. Outstanding: a population-appropriate
adjustment for unhoused adults with mobility impairment (candidate literature
listed there; no value invented in the meantime).

---

## D9 — AQI thresholds for the "unhealthy" scoring line · **IDENTIFIED (with a versioning trap)**

The slides score **exposure-hours above the AQI "Unhealthy" line**. Source: EPA's
*Technical Assistance Document for the Reporting of Daily Air Quality — the Air
Quality Index (AQI)*.

⚠️ **Versioning trap, documented:** EPA revised the PM2.5 AQI breakpoints on
**2024-05-06**. The lower bound of the **"Unhealthy" category is 55.5 µg/m³
under both the pre-2024 and post-2024 tables**, so the headline threshold is
stable — but the *upper* categories moved (e.g. "Very Unhealthy" begins at
150.5 pre-2024 vs 125.5 post-2024, "Hazardous" 250.5 vs 225.5). Any metric that
uses categories above "Unhealthy" **must state which breakpoint table it uses.**

**Second trap:** AQI breakpoints are defined on **24-hour average**
concentrations, while AirNow's real-time display uses the **NowCast**
algorithm on hourly data. A model that counts *hourly* observations above 55.5
is measuring something different from either. DESIGN_SPEC V8 specifies which
convention this project adopts and why.

---

## Summary table

| ID | Dataset | Status | Blocking which roadmap commit |
|---|---|---|---|
| D0 | Street centerlines | ACQUIRED (provenance gap) | — (publication blocker only) |
| D1 | Shelter locations/capacities | **ACQUIRED** (coords geocoded; capacity 99 still newsroom-unconfirmed) | 6 (done) |
| D2 | PIT population + demographics | IDENTIFIED | **7**, 9 |
| D2b | Encampment locations | **ACQUIRED as 2025–26 proxy** (no 2020 records exist; flagged) | 7 (done) |
| D3 | Hourly PM2.5 | **ACQUIRED** | 8 (unblocked) |
| D4 | Meteorology | IDENTIFIED, deliberately deferred | — |
| D5 | RR_age | ⚠️ Citation problem | **9** |
| D6 | RR_comorbidity + prevalence | ⚠️ Citation problem + gap | **9** |
| D7 | SVI / EJScreen | IDENTIFIED | 14 (validation) |
| D8 | Walking speed | ACQUIRED (provisional) | — (done, commit 3) |
| D9 | AQI breakpoints | IDENTIFIED | 14 |
