# DATA PROVENANCE AND METHOD AUDIT

**Purpose:** so that you, your mentor, or any reviewer can trace every number
in this project back to a document and check the arithmetic independently.

**How to use this:** hand it to Dr. Teuscher with the source PDFs. Every row
below names a document and a location. If a row cannot be verified, it does
not go in the chapter.

---

## 0. CLASSIFICATION SYSTEM

Every number in this project is one of four kinds. This distinction matters
more than the numbers themselves.

| Tag | Meaning | Trust |
|---|---|---|
| **[T] TRANSCRIBED** | Read directly off a published page. | High — check the quote |
| **[C] COMPUTED** | Arithmetic on transcribed numbers. Arithmetic shown. | High — check the maths |
| **[D] DERIVED** | A modelling judgement I made from transcribed data. | **Challenge these** |
| **[A] ASSUMED** | No source. A placeholder. | **Do not publish without a source** |

There are **4 [A] items**. They are listed in §6. They are the weakest part
of the project and you should know exactly where they are.

---

## 1. SOURCE DOCUMENTS

| ID | Document | Date | How obtained |
|---|---|---|---|
| **HSD-L** | Multnomah County HSD, "List of HSD shelters" | Updated July 2026 | Fetched from hsd.multco.us, full page text |
| **HSD-D** | Multnomah County HSD, "List of day centers" | Updated Oct 2025 | Fetched from hsd.multco.us, full page text |
| **ASR** | Adult Shelter Review FY2025, Multnomah County HSD | FY2025 | PDF you uploaded, 175 pp, text-extracted |
| **PATH** | The Pathways Study: Survey Findings | 9 April 2026 | PDF you uploaded, 149 pp, text-extracted |
| **CITY** | City of Portland Shelter Services Annual Report FY2023-24 | FY2023-24 | PDF you uploaded, read in context |
| **DEQ** | Oregon DEQ blog, "Wildfire smoke brings record poor air quality" | 16 Sep 2020 | Web |

**NOT usable, and why:**

- `pdx.maps.arcgis.com/apps/dashboards/...` — ArcGIS dashboards render in
  JavaScript. The HTML is an empty shell. Nothing extractable server-side.
- `gis-multco.opendata.arcgis.com` — same problem.
- `out__1_.pdf` (Przybylinski 2015 MA thesis) — a **ProQuest PREVIEW** with
  watermarks and missing pages. Usable for framing your literature review,
  **not** citable in this form. Get the full text free from PDXScholar.
- `ghgAnnualaqpHold-unprotected.xlsx` — greenhouse-gas inventory (CO₂-e).
  Not PM2.5. Not relevant to this project.

---

## 2. SHELTER SUPPLY

### 2.1 What was done

I read the HSD shelter list page and transcribed **every facility
individually** — name, street address, capacity, capacity unit, population
served, provider, and closure status — into
`data/shelters_multnomah_2026.csv`. 40 rows. Nothing was summarised or
estimated at this stage; the CSV is a transcription you can diff against the
web page line by line.

I then did the same for the 9 City of Portland sites listed in the CITY
report's site table.

### 2.2 The numbers

| Value | Tag | Source / derivation |
|---|---|---|
| 30 HSD facilities with published capacity | **[T]** | HSD-L, counted |
| 10 HSD day centers, no published capacity | **[T]** | HSD-D |
| HSD capacity = **1,711** | **[C]** | Sum of the 30 `capacity` values in the CSV |
| congregate 1,015 / motel 341 / village 223 / youth 60 / family 39 / other 33 | **[C]** | Group-sum by `facility_type`; sums to 1,711 ✓ |
| City sites = 9, **576 units** | **[T]** | CITY, site table (38+160+50+28+60+35+60+90+55 = 576 ✓) |
| City **net new** = 486 | **[C]** | 576 − 90. River District Nav Center appears in **both** lists. Deduplicated; HSD's figure of 100 beds retained over CITY's 90 units. |
| **Total = 2,197** | **[C]** | 1,711 + 486 |

**⚠️ Reviewer should check:** the River District dedup. HSD says 100 beds,
CITY says 90 units. These may be different things (beds vs units) or the same
thing counted differently. I kept HSD's 100 and dropped CITY's 90. If that's
wrong the total shifts by 10.

### 2.3 Closures

**[T]** from HSD-L, which carries closure notices inline:

| Facility | Capacity | Date | Priority: veterans/55+/disabled |
|---|---|---|---|
| Laurelwood Center | 120 | 2026-08-31 | Yes |
| River District Nav. Center | 100 | 2026-08-31 | Yes |
| Walnut Park Shelter | 72 | 2026-08-31 | Yes |
| Beacon Village | 10 | 2026-08-31 | No |
| Roseway Inn Motel | 120 | 2026-12-31 | No |

The "priority" column is **[T]** — HSD-L states for each of those three:
*"priority access to veterans, adults 55+ and individuals with disabilities."*

**Vulnerability-prioritised capacity total = 476** **[C]**:
Laurelwood 120 + River District 100 + Walnut Park 72 + Willamette Center 130
+ Kenton Women's Village 19 + Thayer Veterans 17 = 476

**⚠️ Reviewer should check:** whether Willamette (130), Kenton (19), and Thayer
(17) belong in that set. I included them because HSD-L uses priority language
for each. Willamette says *"priority for people 55 and older, those with
disabilities, and veterans."* If a reviewer excludes any of them, the
denominator changes and the 61.3% moves.

### 2.4 The headline computation

```
Vulnerability-prioritised:  292 lost / 476 total = 61.3%
General capacity:           130 lost / 1,721 total = 7.6%
Ratio:                      61.3 / 7.6 = 8.1x
```
where 292 = 120+100+72 (the three priority facilities)
and   130 = 10+120 (Beacon + Roseway)
and 1,721 = 2,197 − 476

**What it means:** the county's scheduled closures remove a far larger share of
the capacity reserved for elderly and disabled people than of general capacity.
**Tag: [C].** The arithmetic is checkable. The *interpretation* — that this is
inequitable — is an argument, not a number, and belongs in Discussion where a
reader can disagree with it.

---

## 3. OCCUPANCY — the parameter that most changes model behaviour

| Value | Tag | Source |
|---|---|---|
| 88% average nightly occupancy | **[T]** | ASR line 112: *"Shelters maintained an 88% average nightly occupancy rate"* |
| congregate 71–99% | **[T]** | ASR |
| alternative 57–97% | **[T]** | ASR |
| motel 62–94% | **[T]** | ASR |
| Free fraction = 0.12 | **[C]** | 1 − 0.88 |
| Effective free capacity = **264** | **[C]** | 2,197 × 0.12 |
| Post-August free = **227** | **[C]** | (2,197 − 302) × 0.12 |

**How ASR computed the 88%** (ASR lines 707–718): average daily number of
individuals ÷ average number of beds/units for the period. ASR itself flags
that motel programs can exceed 100% because a unit may hold two people.

**⚠️ Reviewer should check:** whether an *annual average* occupancy is the right
thing to apply to a *smoke emergency*. Argument for: it's the realistic
starting state. Argument against: during a declared emergency the county opens
overflow capacity, so 88% may overstate scarcity. **This is a genuine
methodological choice and your mentor should make it, not me.** Model it both
ways — empty shelters and 88%-full shelters — and report both.

---

## 4. AGENT POPULATION — all from PATH

PATH is a survey of **N=541** people experiencing homelessness in Multnomah
County, published 9 April 2026 by PSU's Homelessness Research & Action
Collaborative with OHSU. It is local, current, and directly about your
modelled population.

### 4.1 Age — PATH Table 2.1 **[T]**

```
18–24    33 ( 6.3%)      45–54   132 (25.3%)
25–34   106 (20.3%)      55–64    89 (17.0%)
35–44   136 (26.1%)      65+      26 ( 5.0%)
(19 declined or missing)
```

Collapsed to model bins **[C]**:
```
18_44   =  6.3 + 20.3 + 26.1 = 52.7%
45_64   = 25.3 + 17.0        = 42.3%
65_plus =                       5.0%
                        total = 100.0%  ✓
```

**Under-18 bin removed.** **[D]** — PATH surveyed adults only, so there is no
local basis for a minor stratum. This also retires a relative risk that was
never sourceable. It is a defensible scope decision and must be stated: *the
model represents unsheltered adults.*

### 4.2 Chronic physical health condition — PATH Table 2.1 **[T]**

```
Mental illness                                              252 (50.8%)
Substance use disorder                                      210 (42.3%)
Physical illness, chronic health condition, physical
  disability                                                194 (39.1%)  <-- used
Other disability                                             73 (14.7%)
None of these                                                84 (15.5%)
(63 declined or missing; multi-select, so percentages exceed 100)
```

Also **[T]**: 73% of the sample reported any disability; 82% of those who
answered; 48% reported two or more.

**Independent corroboration [T]:** CITY reports *"69% Identify as Having One or
More Disability"* among 1,800 sheltered people, FY2023-24. Two agencies,
different populations, different instruments, **73% vs 69%**.

**Why this replaces asthma/COPD [D]:** your previous model split comorbidity
into asthma 18.3% and COPD 9.0%, attributed to papers that do not report those
figures for this population (see `CITATION_AUDIT.md`). PATH does not break out
asthma or COPD, but it measures chronic physical conditions directly and
locally. Using a binary is **coarser and better sourced**.

**⚠️ The cost of this choice, which must be in Limitations:** "chronic physical
health condition" is broader than "respiratory disease." PM2.5 susceptibility
evidence is strongest for respiratory and cardiovascular conditions. Applying a
respiratory-motivated weight to a broader category **overstates the number of
people whose PM2.5 risk is elevated**. That is a real bias and it runs in the
direction of your hypothesis, so name it explicitly.

### 4.3 Shelter-seeking propensity — PATH **[T]**

```
67% (n=360) stayed in a shelter at least once in the last 6 months
34% identified the shelter system as where they slept MOST OFTEN
48% of shelter users stayed in multiple shelters
50% of those stayed in 3+ shelters in 6 months
```

Shelter experience, of N=204 who commented **[T]**:
```
58% mostly negative      34% positive      16% mixed/neutral
```
citing safety, staff, theft, substance exposure, and rules.

**The conceptual correction [D]:** the old model called this parameter
`awareness_prob`. That is the wrong construct. People know shelters exist;
58% negative experience says the binding constraint is **willingness**, not
awareness. Rename it **shelter-seeking propensity** and sweep **0.34 – 0.67**.
Both endpoints are measured behaviours, not guesses.

### 4.4 Where people sleep — PATH Figure 2.5 **[T]**

```
Any outdoor location, most often                    44%
Outdoors with no cover at all, most often           17%
Outdoors (park/sidewalk/bus stop), ever             53%
Doubled up, most often                               7%
Shelter system, most often                          34%
```

The **17% with no cover** have no filtration whatsoever and are the population
the model most needs to represent.

### 4.5 Background mobility — PATH **[T]**

```
 8% did not change where they slept in 6 months
56% moved 1–9 times
35% moved 10+ times
Unhoused mean: 7.6 moves / 6 months (median 10+)
Involuntary displacement (n=160): 48% displaced 10+ times; 64% told by police
63% experienced homelessness only within Multnomah County
```

**Derivation for the limitations section [C]:**
```
7.6 moves / 182.5 days       = 0.0416 moves per day
0.0416 × 13-day event window = 0.54 moves per agent
```
So roughly **54% of agents would relocate once during the event for reasons
unrelated to smoke.** Your model's fixed-origin / return-home assumption is
defensible over 13 days but not free. Now you can state it with a number.

---

## 5. PM2.5 — read this carefully, it is the weakest input

`build_pm25.py` converts Oregon DEQ's **published daily AQI** for Portland,
7–13 September 2020, into an hourly PM2.5 series.

**What DEQ actually published [T]:** Portland's previous record AQI was 157
(2017); the September 2020 record was 477, set 13 September. Portland recorded
two "very unhealthy" and two "hazardous" days — the first hazardous days in a
monitoring record beginning 1985.

**What the script does [D]:**
1. Inverts AQI → daily mean PM2.5 using EPA piecewise-linear breakpoints.
2. Expands daily means to hourly using an assumed diurnal shape.
3. Writes the same series to **every node** — no spatial variation.

**Three assumptions, all [D] or [A], all of which must be in the chapter:**

| Assumption | Tag | Consequence |
|---|---|---|
| Reported AQI was PM2.5-driven | **[D]** | Safe during wildfire smoke, but it is an inversion of an index, not a monitor reading |
| Diurnal shape | **[A]** | Invented. Affects hour-to-hour exposure but not event totals |
| Spatially uniform | **[D]** | **Removes all spatial variation in exposure** |

**The third one matters enormously and cuts both ways.** With uniform PM2.5,
the divergence between your two oracles is driven *entirely* by where
vulnerable people are relative to shelters — not by where smoke is. That makes
the result **cleaner to interpret** but **narrower**: you are no longer testing
"do smoke hotspots and vulnerability hotspots differ," you are testing "does
weighting by vulnerability move shelter priorities." Say which question you
answered.

**The honest fix, if you get time:** real AirNow monitor data interpolated to
nodes. Until then, declare the synthetic/derived driver in Methods. The script
prints `pm25_source` for exactly this reason.

---

## 6. THE FOUR UNSOURCED NUMBERS **[A]**

These are the weak points. Do not let them pass unremarked.

| Parameter | Value | Status | What it affects |
|---|---|---|---|
| **Susceptibility weights** | w_age, w_comorbid | **No epidemiological source.** Declared as a *policy weighting scheme*. | The entire VWE metric |
| **Shelter filtration** | 0.35 | Attributed to a source I could not verify | Every sheltered agent-hour |
| **Circuity factor** | 1.4 | Standard in accessibility literature, no specific citation | All distances |
| **Diurnal PM2.5 shape** | assumed curve | Invented | Hourly exposure pattern |

**On the weights specifically.** The verified epidemiology says PM2.5-associated
COPD events rise ~2.5% per 10 µg/m³ (DeVries, Kriebel & Sama 2017, *COPD*
14(1):113–121, meta-analysis of 37 studies). That is an **association**, not a
between-group susceptibility ratio, and multiplying a concentration by it is
dimensionally invalid — this is the error that was in your model. The current
approach declares the weights as a planning judgement and sweeps them,
**including a flat (all-1.0) null case**. Run the null. If divergence is zero
flat and non-zero weighted, the divergence comes from the weighting rather than
an artefact — that is the check that makes the result mean anything.

---

## 7. HOW THE MODEL ACTUALLY WORKS

Plain description, so a reviewer can judge it without reading code.

**Setup**
1. Load street nodes, shelters (with capacity), and agents from CSV.
2. Each agent gets a home node, a shelter-seeking propensity, a max travel
   distance, an age bin, and a chronic-condition status.
3. Each agent gets a susceptibility weight = w_age × w_comorbid.

**Each simulated hour**
4. Agent reads PM2.5 at its current node.
5. If outside and PM2.5 > 35.4 µg/m³ and a random draw beats its propensity:
   move to the nearest shelter within travel distance **that has space**.
6. If sheltered and PM2.5 ≤ 35.4: return to home node.
7. Accumulate: `exposure += PM2.5 × (0.35 if sheltered else 1.0)`
   and `VWE += that × weight`.

**Distance** — haversine great-circle × 1.4, not network shortest path. Faster,
and it allows scoring arbitrary candidate sites. Report the 1.4.

**Placement strategies** — five shelter configurations compared on the same
population: status quo, density, gap-index, PM2.5 oracle, VWE oracle. The two
oracles are **greedy** catchment-coverage approximations, not optimal
solutions. Say so.

**The headline output — spatial divergence index.** Rank all candidate sites by
(a) unweighted exposure relieved and (b) vulnerability-weighted exposure
relieved. Take the top 20% of each. The divergence index is the fraction of
that top quintile on which the two rankings **disagree**.

- Near 0 → vulnerability weighting doesn't move shelter priorities. Exposure-only
  tools are adequate here.
- Large → a common class of screening tool is systematically mis-siting.

**Both are publishable.** Your hypothesis was pre-registered two-tailed, which
protects you here — do not let anyone push you toward the "interesting" answer.

---

## 8. WHAT A SECOND REVIEWER SHOULD CHALLENGE

Give your mentor this list. These are the six places the project is most likely
to be wrong, in priority order.

1. **The susceptibility weights.** No epidemiological basis. Is a declared
   policy weighting scheme acceptable for this venue, or does the chapter need
   to drop the weighting and report something narrower?
2. **Chronic physical condition as a proxy for respiratory vulnerability.**
   Broader than the epidemiology supports; biases toward the hypothesis.
3. **88% occupancy applied to an emergency.** Annual average vs. surge
   conditions. Which is the right modelling assumption?
4. **Spatially uniform PM2.5.** Changes the research question. Is the narrower
   question still worth answering?
5. **The vulnerability-prioritised denominator (476).** Which facilities
   legitimately belong in that set?
6. **Greedy oracles.** How far from optimal? Uncharacterised.

---

## 9. FILE INVENTORY

### Parameters and provenance
- `grounded_parameters.py` — every parameter with source tag; **run it** to print
  the verification table and re-derive every computation
- `parameters_sourced.py` — earlier version, weight-scheme options and sweep sets
- `CITATION_AUDIT.md` — the six citation errors found in the original design
- `DATA_PROVENANCE.md` — this file

### Data
- `data/shelters_multnomah_2026.csv` — 48 facilities transcribed from HSD-L,
  HSD-D, CITY. The primary data artefact.
- `data/geocode_shelters.py` — address → lat/lon via OpenStreetMap Nominatim

### Model and analysis
- `run_results.py` — Python analysis: verification tests, strategy comparison,
  divergence index, three EPS figures
- `build_pm25.py` — DEQ AQI → hourly PM2.5
- `bootstrap_data.py` — builds `repast_data/` if you don't have it

### Repast (Java)
- `repast-java/src/wildfire/{SimData,Shelter,UnshelteredAgent,WildfireBuilder}.java`
- `repast-java/HOWTO_MAKE_REPAST_COMPUTE.md` — the Data Set + File Sink wiring

### Chapter
- `chapter.tex`, `references.bib`, `svmult.cls`, `figure.eps`, `README.md`

---

## 10. REPRODUCING EVERY NUMBER YOURSELF

```bash
python grounded_parameters.py     # prints all checks + provenance table
```

To re-verify a transcription against the source PDF:
```bash
pdftotext -layout Pathways-Survey-Findings-Published-4_9_2026.pdf path.txt
grep -n "194 (39.1%)" path.txt          # chronic physical condition
grep -n "having a disability (73%)" path.txt
grep -n "7.6 moves in the past 6 months" path.txt

pdftotext -layout Adult-Shelter-Review-FY25.pdf asr.txt
grep -n "88% average nightly occupancy rate" asr.txt
grep -n "6,731 unique individuals served" asr.txt
```

Every transcribed number in this document was re-checked this way after it was
written. If any grep above returns nothing, the number is wrong — tell me.

---

*Prepared with assistance from Claude (Anthropic), 26 July 2026. This document
exists so the work can be checked without trusting either of us. Verify the
[T] rows against the PDFs and re-run the [C] arithmetic yourself.*
