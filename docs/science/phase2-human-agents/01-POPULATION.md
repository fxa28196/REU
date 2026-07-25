# Phase 2 · Spec 1 — Population Demographics

**Status: DESIGN ONLY — nothing here is implemented.** Companion to
`DESIGN_SPEC.md` (evidence classes M/L/C/A/F), `DATA_SOURCES.md` (D0–D9; this
spec adds D10–D13), `VARIABLES.md` (V1–V16; this spec adds V18–V22).

**Governing rule:** no invented values. Every distribution below is read from a
retrieved source, or the attribute stays unimplemented. Where a national or
out-of-state figure stands in for Multnomah County it is labelled **PROXY** in
the model, in the manifest, and in every results caption.

---

## 1. Verification status

Every figure in §3–§7 was read from a retrieved primary document. The anchor
source (2019 PIT) was verified **twice**: by the literature review, and
independently by reading the extracted report text (Table 22 read in full;
totals confirmed on pp. 7, 13, 18, 25, 26, 30, 36, 39–40).

That second check changed one thing, carried into §5: the mobility figure is a
**lower bound**, not a prevalence estimate. The first review did not catch this.

---

## 2. D10 — 2019 Point-in-Time Count, Portland/Gresham/Multnomah County

| Field | Value |
|---|---|
| Dataset ID | **D10** (new) |
| Title | *2019 Point-in-Time: Count of Homelessness in Portland/Gresham/Multnomah County, Oregon* |
| Publisher | Joint Office of Homeless Services / PSU Regional Research Institute |
| Count date | **Night of 23 January 2019** |
| URL | https://pdxscholar.library.pdx.edu/rri_facpubs/63/ |
| Retrieved | 2026-07-25 (102-pp. PDF, text-extracted per page) |
| Evidence class | **M** for counts; **A** for transfer to September 2020 |
| Totals | **2,037 unsheltered · 1,459 emergency shelter · 519 transitional · 4,015 total** |

**Why this source.** It is the last full unsheltered street count before the
September 2020 event (the next is 2022), it is local, and it is
unsheltered-specific. Its 2,037 figure is already the project's population
target (`DATA_SOURCES.md` D2).

**Temporal-transfer caveat (A).** The event is September 2020; the census is
January 2019, ~20 months earlier, in a population known to be changing (55+
share of unsheltered rose 17.4% → 20.3% between 2017 and 2019). Every run must
state that composition is a **January-2019 snapshot applied to a
September-2020 event**.

**Undercount caveat (A).** A single-night census, not a sample: no sampling CI,
but systematic undercount (707 refusals, 75 discarded surveys documented).
Counts are **lower bounds**; proportions carry non-response bias of unknown
direction.

---

## 3. V18 — Age · class **M** (local)

### 3.1 Verified distribution (unsheltered, N = 2,037)

| Age band | n | Proportion |
|---|---|---|
| Under 18 | 6 | 0.003 |
| 18–24 | 136 | 0.067 |
| 25–54 | 1,481 | 0.727 |
| 55–69 | 390 | 0.191 |
| 70+ | 24 | 0.012 |

Among surveyed unsheltered respondents: **mean age 42, median 43** (mean was 40
in 2017).

### 3.2 The 25–54 problem

72.7% of the population sits in one 30-year band — too wide to drive
age-dependent walking speed (`03-MOVEMENT.md`) or age-stratified reporting. The
report does not subdivide it. Three options:

- **Option A (RECOMMENDED first implementation): do not subdivide.** Sample age
  uniformly within published bands; report only on those bands. Cost: no
  35-vs-50 contrast. Benefit: zero invented structure — the age variable is
  exactly as coarse as the evidence.
- **Option B (PROXY, permitted for sensitivity):** split using an external
  unsheltered population and record the donor. Two donors agree closely:
  HUD 2023 AHAR national unsheltered (25–34 19.0%, 35–44 24.9%, 45–54 21.5% →
  conditional 0.291/0.381/0.329) and Multnomah 2023 PIT (623/908/677 →
  0.282/0.411/0.307). Applied to D10's 0.727 → ≈0.21/0.29/0.23 of total.
  **Donor-imputed structure, class A.**
- **Option C (REJECTED): fit a continuous parametric age distribution.**
  Nothing constrains within-band shape; a fitted curve manufactures precision.

### 3.3 Minors

Six unsheltered minors (0.3%). **Recommendation: model adults only (≥18) and
say so** — the count is 6 people, unaccompanied-minor systems differ entirely,
and no minor-specific mobility or vulnerability evidence is being introduced.
Renormalise adult bands to 1.

### 3.4 Sensitivity

Primary axis: Option A vs B for 25–54. If a result changes between them, it
depends on donor-imputed structure and must be reported as such. Secondary: the
2023 local composition as a bracketing run.

---

## 4. V19 — Sex / gender · class **M** (local)

| Category | n | Proportion |
|---|---|---|
| Male | 1,395 | 0.685 |
| Female | 596 | 0.293 |
| Transgender | 22 | 0.011 |
| Does not identify as female/male/transgender | 24 | 0.012 |

**Corroboration.** HUD 2023 AHAR national unsheltered: 68.2% / 30.1% / 0.9% —
near-identical, raising confidence the local split is not an artefact.

**Bias stated in the source:** stigma likely causes undercounting of transgender
and gender-non-conforming identities. Do not present 1.1% as precise.

**Model use — deliberately narrow.** Sex enters for exactly one mechanism:
sex-specific comfortable gait speed (`03-MOVEMENT.md`). It does **not** enter
vulnerability weighting — no verified sex-modification estimate for
wildfire-smoke response was found (`02-VULNERABILITY.md`). Sex must not proxy
for anything else.

**Drift note.** By 2023 the female share of unsheltered adults was 38.4%. For a
September-2020 event the 2019 split is correct; 2023 is a sensitivity
composition.

---

## 5. V20 — Mobility limitation · class **M** (local, LOWER BOUND)

### 5.1 The figure and what it actually means

**Mobility impairment: n = 391 of 2,037 = 19.2%** (Table 22).

The note beneath Table 22 states: *"'Mobility impairment,' 'post-traumatic
stress,' and 'traumatic brain injury' were available only to unsheltered people
who completed the street count survey."* The percentage is nevertheless computed
on the **full denominator of 2,037**. Every unsheltered person who did not
complete the survey is therefore counted as **not** impaired.

**Consequence: 19.2% is a lower bound.** A model sampling at exactly 0.192
systematically under-represents impaired agents. State this in results and sweep
the upper end.

### 5.2 Convergent external evidence (PROXY, upper bound)

| Source | Population | Value |
|---|---|---|
| CASPEH (UCSF, 2023) | California, n = 3,198, 78% unsheltered | mobility limitation **22%**; **32%** at 50+; **20%** use a mobility aid |
| Brown et al. 2017, *The Gerontologist*, DOI 10.1093/geront/gnw011 | Oakland homeless adults 50+, n = 350 | difficulty walking across a room **26.9%**; ≥1 ADL difficulty 38.9% |
| Lewer et al. 2019, *BMJ Open*, DOI 10.1136/bmjopen-2018-025192 | UK hostel/rough-sleeping, n = 1,336 | EQ-5D mobility problems **21.0%** vs 9.9% housed |

Four independent sources land in **19–27%** — among the better-supported
heterogeneity variables in the model despite the denominator problem.

### 5.3 Recommended parameterisation

- Base case **0.192**, labelled a lower bound.
- Sensitivity **0.19–0.27**.
- Age gradient (PROXY, class A): ≈0.14 under 50 → ≈0.32 at 50+ (CASPEH),
  required if age and mobility are not sampled independently (§7).

### 5.4 Why this variable outranks the vulnerability weights

Mobility limitation is the one attribute here that acts on the model's endpoint
through a **mechanism the model actually simulates**: it slows walking, which
lengthens outdoor time, which raises cumulative exposure. It should be
implemented before the vulnerability weights, whose mechanism the model does not
simulate at all (`02-VULNERABILITY.md` §5).

---

## 6. V21 — Health conditions · class **M** (aggregate) + **PROXY** (specific)

### 6.1 What the local source provides

Exactly one health figure for the unsheltered population, and it is unspecific:

| Condition (Table 22, unsheltered, denominator 2,037) | n | % |
|---|---|---|
| **Chronic health condition (unspecified)** | 614 | **30.1%** |
| Mental illness | 839 | 41.2% |
| Substance use disorder | 929 | 45.6% |
| Post-traumatic stress | 788 | 38.7% |
| Physical disability | 608 | 29.8% |
| Both mental illness and substance abuse | 530 | 26.0% |
| Tri-morbidity (MI + SUD + physical/chronic) | 304 | 14.9% |
| Traumatic brain injury | 283 | 13.9% |
| Developmental disability | 198 | 9.7% |
| HIV/AIDS | 53 | 2.6% |
| Unspecified disability | 37 | 1.8% |

**There is no local asthma, COPD, or cardiovascular prevalence for Multnomah
County's unsheltered population. It does not exist in the PIT series.** Any
asthma or COPD number in this model is necessarily imported.

### 6.2 Condition-specific evidence (all PROXY)

| Condition | Value | Population | Source |
|---|---|---|---|
| Asthma **or** COPD | **25%** | California, n = 3,198, 78% unsheltered, 2021–22 | CASPEH (UCSF Benioff, June 2023) |
| Asthma (diagnosed, EHR) | **14.9%** vs 7.1% housed | Minnesota, recent homelessness, n = 20,139 | Zellmer et al. 2025, DOI 10.1007/s11606-025-09814-x |
| COPD (diagnosed, EHR) | **10.5%** vs 3.0% housed | same | same |
| Asthma (self-report) | 18.3% vs 5.7% | UK, n = 1,336 | Lewer et al. 2019, DOI 10.1136/bmjopen-2018-025192 |
| COPD (self-report) | 14.0% (95% CI 12.2–16.0) vs 1.3% | same | same |
| Spirometric obstructive lung disease | 15% (95% CI 8–26) | SF shelter, **n = 68** | Snyder & Eisner 2004, DOI 10.1378/chest.125.5.1719 |
| COPD or asthma | 26.3% | Oakland homeless 50+, n = 350 | Brown et al. 2017, DOI 10.1093/geront/gnw011 |
| Heart condition or stroke | 15% | CASPEH | CASPEH |
| CVD vs housed | pooled **OR 2.96 (2.80–3.13)** | meta-analysis, 17 studies, n = 32,721 | Al-Shakarchi et al. 2020, DOI 10.1136/heartjnl-2020-316706 |
| Current smoking | 73% | national HCH users, 2003 data | Baggett & Rigotti 2010, DOI 10.1016/j.amepre.2010.03.024 |

### 6.3 Recommended parameterisation

- **Any chronic respiratory condition: 0.25** (CASPEH — best-matched on place,
  time, and shelter status).
- **If separated:** asthma **0.15**, COPD **0.105** (Zellmer diagnosed rates),
  overlap permitted, COPD concentrated in agents 45+.
- **Sensitivity: asthma 0.15–0.24, COPD 0.04–0.14.** These are wide *because the
  evidence is wide*, and the width is itself a finding: diagnosed (EHR) rates
  undercount the never-diagnosed, self-report overcounts, and the two biases
  bracket the truth.
- **Consistency check (load-time validation):** sampled prevalence of *any*
  chronic health condition should be broadly consistent with the local **30.1%**
  aggregate — the one genuine local constraint available.

### 6.4 What must not be done

**Do not use ACS, BRFSS, or NHIS for these parameters.** Their sampling frames
(housing units; landline/cell households) structurally exclude unsheltered
people; using them for agent attributes is a category error. They are legitimate
only as housed-population baselines for contrast.

---

## 7. V22 — Joint structure · class **A** (unavoidable assumption)

The PIT publishes **marginals only**. No joint distribution of
age × sex × condition × mobility exists for this population.

- **Independent sampling is known to be wrong.** COPD concentrates in older
  adults; mobility limitation rises steeply with age (22% overall vs 32% at
  50+). Independent draws under-represent compound-vulnerability agents —
  exactly the group the study exists to find.
- **Recommendation:** sample age first, then condition and mobility
  **conditional on age band** using CASPEH's age-stratified figures as donor.
  Label class **A / PROXY**, record the donor in the manifest, and sweep
  independent-vs-conditional sampling.
- **Do not invent a correlation matrix or copula.** The conditioning above is
  the maximum structure the evidence supports.

**Real structure that should be used instead of invention** — the PIT publishes
the *count of disabling conditions per person*, a genuine local measure of
compound burden:

| Number of disabling conditions | n | Proportion |
|---|---|---|
| Any one | 435 | 0.214 |
| Any two | 353 | 0.173 |
| Any three | 262 | 0.129 |
| More than three | 554 | 0.272 |
| (None or unknown — residual) | 433 | 0.213 |
| **One or more** | **1,604** | **0.787** |

Also local: **chronically homeless (HUD definition) ≥ 66.5%** of unsheltered
(n = 1,354, 11.8% unknown status → true rate between 66.5% and 78.3%: a bound,
not a point estimate).

---

## 8. Declared gaps — attributes that stay UNIMPLEMENTED

1. **Local condition-specific prevalence** — does not exist; all specific values
   are PROXY.
2. **Joint distributions** for the local population — not published.
3. **Disease severity** (FEV₁, controlled vs uncontrolled asthma, NYHA class) —
   no source found. **Do not invent severity tiers**; conditions are binary
   presence/absence or absent.
4. **Local smoking prevalence** — not found; the national 73% is 2003 data, for
   context only.
5. **Point-identified chronic-homelessness rate** — bounded, not identified.
6. **Any September-2020 count** — none exists.

---

## 9. Integration summary

| ID | Variable | Class | Base | Sensitivity | Source |
|---|---|---|---|---|---|
| V18 | Age band | **M** | PIT 2019 bands | Option A vs B | D10 |
| V19 | Sex | **M** | 0.685/0.293/0.011/0.012 | 2023 composition | D10 |
| V20 | Mobility limitation | **M** (lower bound) | 0.192 | 0.19–0.27 | D10 + D11/Brown/Lewer |
| V21a | Asthma | **PROXY/L** | 0.15 | 0.15–0.24 | D11, D12 |
| V21b | COPD | **PROXY/L** | 0.105 | 0.04–0.14 | D11, D12, D13 |
| V21c | Any chronic respiratory | **PROXY/L** | 0.25 | 0.20–0.30 | D11 |
| V22 | Disabling-condition count | **M** | multinomial §7 | — | D10 |
| — | Age→condition conditioning | **A** | CASPEH gradient | independent vs conditional | D11 |

New dataset IDs for `DATA_SOURCES.md`: **D10** 2019 Multnomah PIT · **D11**
CASPEH 2023 · **D12** Zellmer 2025 · **D13** Lewer 2019 (Brown 2017,
Snyder & Eisner 2004, Al-Shakarchi 2020, Baggett & Rigotti 2010, HUD 2023 AHAR
as supporting literature in `BIBLIOGRAPHY.md`).

**Every value becomes a versioned, checksummed parameter file** under
`Geography/data/parameters/` with inline citation columns — never a Java
constant (`08-ENGINEERING.md` §4).
