# Phase 2 · Spec 3 — Movement Model

**Status: DESIGN ONLY.** Revises `VARIABLES.md` **V10** (`walkingSpeedMps`) from
a single constant to a per-agent distribution, and adds an inhaled-dose
formulation.

**Two headline findings, both of which change what the model should measure:**

1. **Inhaled dose is nearly flat with respect to walking speed** (dose ∝
   speed^0.17). Distance to shelter dominates dose; speed determines *who
   arrives and who fails to*, not how much they breathe in. Heterogeneous speed
   is therefore an **access** variable, not an exposure variable.
2. **The model's current 1.30 m/s sits near the bottom of its own cited source**,
   and is a point estimate where the source supplies a distribution.

---

## 1. Correcting the current parameter's provenance

`VARIABLES.md` cites Bohannon 1997 for `walkingSpeedMps = 1.30` and correctly
notes that 1.30 lies within the measured range. The fuller picture, from the
verified table (n = 230 healthy volunteers, 7.62 m level indoor course):

**Comfortable gait speed, cm/s (mean ± SD)** — Bohannon RW (1997), *Age and
Ageing* 26(1):15–19,
DOI [10.1093/ageing/26.1.15](https://doi.org/10.1093/ageing/26.1.15):

| Decade | Men | Women |
|---|---|---|
| 20s | 139.3 ± 15.3 | 140.7 ± 17.5 |
| 30s | 145.8 ± 9.4 | 141.5 ± 12.7 |
| 40s | 146.2 ± 16.4 | 139.1 ± 15.8 |
| 50s | 139.3 ± 22.9 | 139.5 ± 15.1 |
| 60s | 135.9 ± 20.5 | 129.6 ± 21.3 |
| 70s | 133.0 ± 19.6 | 127.2 ± 21.1 |

**1.30 m/s is below 10 of these 12 age×sex cells** — above only women in their
60s (1.296) and 70s (1.272) — and ~6% below the table's unweighted mean of
**1.381 m/s**. It is a defensible *pace* (almost exactly Bastien's
gross-energy-cost optimum, §4.1) but a poor *population mean*, and it discards
the dispersion the source provides (SDs 0.09–0.23 m/s).

*(A review draft claimed 1.30 was below **every** cell; that is arithmetically
false given the range starts at 1.272, and is corrected here.)*

---

## 2. V10 revised — per-agent speed distribution · class **L**

### 2.1 Means (age × sex)

Bohannon RW & Williams Andrews A (2011), *Physiotherapy* 97(3):182–189,
DOI [10.1016/j.physio.2010.12.004](https://doi.org/10.1016/j.physio.2010.12.004)
— descriptive meta-analysis, 41 articles, **23,111 subjects**. Grand mean
comfortable gait speed (m/s):

| Age band | Men | Women |
|---|---|---|
| 20–29 | 1.358 | 1.341 |
| 30–39 | 1.433 | 1.337 |
| 40–49 | 1.434 | 1.390 |
| 50–59 | 1.433 | 1.313 |
| 60–69 | 1.339 | 1.241 |
| 70–79 | 1.262 | 1.132 |
| 80+ | 0.968 | 0.943 |

### 2.2 Dispersion — and the single most likely modelling error

> **DO NOT derive SDs from the 2011 meta-analysis's 95% confidence intervals.**
> Those are CIs on a **between-study grand mean**, not person-level SDs.
> Sampling from `N(mean, CI_width/3.92)` would **understate real between-person
> variability by roughly a factor of 3–5** in the large strata.

Use the **coefficient of variation from Bohannon 1997**, the only source here
supplying within-population SDs: **CV ≈ 0.13** (0.11 under 60; 0.16 at 60+).
Independently corroborated by Ibrahem 2025 (outdoor CV ≈ 0.15, n = 6,426
crossings) and Dommershuijsen et al. 2022 (n = 4,656, 1.20 ± 0.20 m/s,
CV = 0.167).

### 2.3 Formulation

```
v_free ~ TruncNormal( µ[age_band, sex],  σ = CV · µ ),  truncated [0.40, 2.20] m/s
CV = 0.13    (sweep 0.10 – 0.17)
```
Truncation is a numerical guard, not a literature value — label it so.

### 2.4 Group travel (optional, verified, cheap)

Ibrahem 2025 (n = 6,426 crossings): walking alone 1.521 m/s; group of 2–4 →
1.399 (×0.92); group of 5+ → 1.341 (×0.88). If encampment residents evacuate
together, this is real and inexpensive to model.

### 2.5 Explicitly rejected

- **Field crosswalk means (1.44–1.51 m/s) as free speeds** — biased upward by
  signal pressure (Montufar et al. 2007, DOI 10.3141/2002-12; direction
  verified, magnitude not).
- **MUTCD design values (1.07 / 0.91 m/s)** — 15th-percentile *design*
  percentiles chosen to protect slow pedestrians; using them as agent speeds
  would overstate evacuation time. Context only.
- **A further sex multiplier** — the table already carries the supported effect;
  field studies found sex significant only at the median.

---

## 3. Mobility limitation → speed · class **L** (VERIFIED-IN-SECONDARY)

Boyce KE, Shields TJ & Silcock GWH (1999), *Fire Technology* 35(1):51–67,
DOI 10.1023/A:1015339216366. **The primary is paywalled and was not retrieved**;
values below come from Tinaburri (2018), FEMTC proceedings, Table 3, which was
downloaded and parsed. The reconstructed truncation ranges match the ranges
commonly attributed to Boyce to within rounding — strong internal evidence of a
faithful transcription, but **obtain the primary before publication.**

Unimpeded horizontal movement speed (m/s):

| Category | Distribution | Mean | SD |
|---|---|---|---|
| Ambulant, impaired, no aid | Normal | 0.95 | 0.32 |
| Crutches | Normal | 0.94 | 0.30 |
| Walking stick / cane | Normal | 0.81 | 0.38 |
| Rollator / walking frame | Normal | 0.57 | 0.29 |
| Manual wheelchair | Normal | 0.69 | 0.35 |
| Electric wheelchair | Constant | 0.89 | — |

**Apply by replacement, not multiplication** — these categories already embed an
older, impaired population; multiplying by an age×sex mean would double-count.

**Class prevalence is a separate question this review did not resolve.** The
2019 PIT gives 19.2% with *any* mobility impairment (a lower bound —
`01-POPULATION.md` §5.1) but no breakdown by aid type. **Treat the mix as a
scenario variable and sweep it**; do not assert a split.

**No published gait speed in m/s exists for people experiencing homelessness.**
Nearest adjacent: Kiernan et al. 2021, *HRB Open Res* 3:14 — 41.3% report
difficulty walking, 26.9% mobility impairment, no speeds.

Sources requested but **not** retrieved, and therefore not cited: Sørensen &
Dederichs; Jiang et al.; Fujiyama & Tyler; the SFPE Handbook tables.

---

## 4. Fatigue and encumbrance — mostly a negative result

### 4.1 Carrying belongings does NOT meaningfully slow walking

Two independent verified sources agree:

- Bastien et al. 2005, *Eur J Appl Physiol* 94(1–2):76–83,
  DOI 10.1007/s00421-004-1286-z (n = 10, loads 0–75% of body mass): metabolic
  cost rises in proportion to load, but the **net cost-of-transport speed
  optimum is verbatim "independent of load"**, and the gross optimum is
  **~1.3 m/s for all loading conditions**.
- Middleton et al. 2022, *IJERPH* 19(7):3927 (n = 30): carrying **40% of body
  mass slowed self-selected speed only ~4% (≈0.05 m/s)**.

**Do not implement a load→speed penalty, and say so in the paper citing both.**
This is a genuine finding and more publishable than a fudge factor. Note the
useful coincidence: **1.3 m/s is Bastien's gross-cost optimum**, which defends
the model's current value as a *pace* even though §1 undermines it as a
population *mean*.

**No study exists of people carrying unstructured belongings** (bags, carts,
bedrolls) — the actual unsheltered case. State this.

### 4.2 Endurance — the strongest argument against silent 3.5-hour walks

Enright & Sherrill 1998, *Am J Respir Crit Care Med* 158(5):1384–1387,
DOI 10.1164/ajrccm.158.5.9710086 (n = 117 men, 173 women, ages 40–80): median
six-minute walk distance 576 m (men) and 494 m (women) → **1.60 and 1.37 m/s
sustained for six minutes at an instructed maximal pace.**

The baseline's 3.5-hour continuous walk at 1.30 m/s therefore runs at **81%
(men) to 95% (women) of a maximal six-minute pace, for 35× the duration, in
hazardous air.**

### 4.3 What to do about it

**No defensible source exists** for a speed-decay function over 1–4 hours, for
rest-break frequency or duration in civilian long walks, or for sustainable
walking duration among unsheltered people. **Do not invent a decay curve and
attribute it to literature.**

**Recommended instead — a feasibility flag, not a fatigue curve.** Report as
model output the fraction of agents whose journey exceeds 60 and 120 minutes at
their own sampled `v_free`. The 16.5 km / 3.5 h tail then surfaces as **a
shelter-siting failure**, the policy-relevant result, rather than being silently
absorbed into a dose number.

**Optional, explicitly unsupported sensitivity:** a rest duty cycle
(`T_walk ∈ {30, 45, 60, ∞}` min, `T_rest ∈ {5, 10, 15}` min; a 50/10 cycle costs
~17% of effective speed), or `v(t) = v_free · max(0.7, 1 − β·t_hours)` with β
swept 0 → 0.10/h. **Label β unsupported.** Report with and without.

**Leave out the Pandolf equation** — it predicts metabolic cost, not speed, so it
cannot drive movement; Knapik et al. 2004 note such equations "may not be
accurate for prolonged load carriage"; and the model has no body-mass or load
distribution. It adds a citation and no information.

---

## 5. Route choice · class **L** (form) + **A** (parameters)

### 5.1 Recommended: a stochastic detour multiplier

Every parameter traces to a verified source, it needs no new network attributes,
and it is conservative (it lengthens exposure time relative to pure shortest
path):

```
with probability 0.80:  m = 1.00
with probability 0.20:  m ~ Triangular(1.00, 1.10, 1.30)
d_travelled = m × d_shortest              # implied population mean m ≈ 1.03
```

- **0.80** from Salazar Miranda et al. 2021, *Computers, Environment and Urban
  Systems* 86:101563,
  DOI [10.1016/j.compenvurbsys.2020.101563](https://doi.org/10.1016/j.compenvurbsys.2020.101563)
  — 127,082,227 GPS pings, 120,910 Boston trips; the authors state **"20% of the
  Boston trips do not take the shortest path."** *Caveat: this is the authors'
  restatement of a street-segment-level regression, not a per-trip tabulation —
  describe it as their characterisation.*
- **1.15 detour ratio and the "up to 20% longer" bound** from Sevtsuk & Kalvo
  2024, DOI 10.1177/23998083241261766 — the closest published ABM
  parameterisation.

Sweep: P(shortest) ∈ {0.6, 0.8, 0.9}; upper bound ∈ {1.2, 1.3, 1.5}; plus
bounding cases m ≡ 1.0 (today's model) and m ≡ 1.2.

### 5.2 Portland-specific route-choice evidence exists

Broach J & Dill J (2015), TRB paper 15-3669 — **Portland, Oregon; 1,167 walk
trips by 283 adults; GPS 2010–2013; path-size logit.** The most transferable
study found. Coefficients (quoted inside the fully retrieved Lue 2017 thesis;
the TRB PDF is not publicly retrievable): each turn ≈ **+50 m**; upslope ≥10%
≈ **2× level cost**; **~70 m** detour accepted to avoid an unsignalised arterial
crossing; busy street perceived **+14%** longer; commercial frontage **−28%**.

> **Mode warning:** Broach, Dill & Gliebe's better-known 2012 *TR Part A* paper
> is **bicycle** route choice. Cite the **2015** paper for walking, never 2012.

**Leave these attribute utilities out for now:** they require per-edge signal,
sidewalk, traffic-class and grade data the network lacks; they come from routine
walking in clean air; and their net effect on route *length* is what the detour
multiplier already absorbs.

### 5.3 Willingness to walk — and a folklore warning

**The 400 m / 800 m planning rule traces only to Neilson & Fowler (1972) and its
empirical basis is unclear. Never present it as evidence.**

- El-Geneidy et al. 2014, *Transportation* 41:193–210,
  DOI 10.1007/s11116-013-9508-z (Montreal, n = 16,014): median **294 m**, 85th
  percentile **678 m**; commuter rail 85th **1,259 m**.
- Daniels & Mulley 2013, *JTLU* 6(2):5–20, DOI 10.5198/jtlu.v6i2.308 (Sydney,
  n = 1,906): mean 573 m (SD 417); train 805 m; bus 461 m; **65+ mean 452 m vs
  30–49 mean 619 m (−27%)**.
- Yang & Diez-Roux 2012, *Am J Prev Med* 43(1):11–19,
  DOI 10.1016/j.amepre.2012.03.015 (2009 NHTS): mean 1.13 km, median 0.8 km;
  distance decay **β ≈ 1.06 per km**.

Use decay only on the **decision to depart** (interacting with the smoke
trigger), never as a hard cap on walking — Portland's two shelters de facto
served a citywide catchment.

---

## 6. Exertion, ventilation and inhaled dose — the best-evidenced element here

This replaces the exposure **index** (µg·m⁻³·h) with an actual inhaled mass
(µg), addressing the standing `METRICS.md` limitation that the current metric
"is not an inhaled dose (no breathing rate)".

```
Dose_i += C(x_i, t) · V̇E_i · Δt                       # µg/m³ · m³/min · min = µg
BMR_MJday     = Schofield(BW_i, age_i, sex_i)          # EPA EFH Table 2-2
V̇E_i (m³/min) = 1.35 · BMR_kJmin · MET_i · exp(ε_i) / 1000
ε_i ~ N(0, σ) drawn ONCE per agent;  σ = 0.174 (20–33), 0.173 (34–60), 0.128 (>60)
MET_i = 4.0    # 2024 Compendium code 17255, self-selected-speed walking
```

- `V̇E = 1.35 · BMR · MET` is Layton 1993, *Health Phys* 64(1):22–36,
  DOI 10.1097/00004032-199301000-00003, reproduced as EPA Eqn 6-4; it agrees
  with EPA's full regression **within 1–7% across MET 2.8–5.5** — the entire
  walking range.
- **EPA MET band cutoffs verified directly** by the author from the downloaded
  Exposure Factors Handbook Chapter 6 text: `Sedentary (METS ≤1.5)`,
  `Light (1.5< METS ≤3.0)`, `Moderate (3.0< METS ≤6.0)`. Evacuation walking is
  light-to-moderate. EPA's own confidence rating for the chapter is **"Overall
  Rating: Medium"** — cite that honestly.
- MET values: Ainsworth et al. 2011, DOI 10.1249/MSS.0b013e31821ece12; Herrmann
  et al. 2024, DOI 10.1016/j.jshs.2023.10.010. **The 2024 update raised
  moderate-to-brisk walking METs by 0.3–0.5 for identical activity codes — always
  state the edition; the difference is a free sensitivity axis.**

### 6.1 The flat-dose result

Over a fixed 2 km walk at 150 µg/m³, computed through the chain above:

| Speed (m/s) | MET | Travel time | V̇E (m³/min) | **Dose (µg)** |
|---|---|---|---|---|
| 0.80 | 2.3 | 41.7 min | 0.0147 | 91.8 |
| 1.12 | 3.0 | 29.8 min | 0.0198 | **88.3** (minimum) |
| 1.34 | 3.8 | 24.9 min | 0.0258 | 96.3 |
| 1.88 | 5.5 | 17.7 min | 0.0391 | 103.9 |

Mechanism: EPA's regression exponent b₁ ≈ 1.17 gives V̇E ∝ MET^1.17, while METs
rise nearly linearly with speed — so **dose ∝ speed^0.17**, with a shallow
minimum near 1.1 m/s created by the resting-metabolism floor.

**Consequence: distance dominates inhaled dose; walking speed barely matters.**
Report this as a finding. It also means §2's heterogeneous speeds matter chiefly
for *who arrives and who fails* — exactly the equity question the project cares
about.

### 6.2 Parameters

| Parameter | Central | Sweep | Source |
|---|---|---|---|
| Walking MET | 4.0 | 3.0–4.8 | Compendium 2011 vs 2024 |
| V̇E adult walking | 0.025 m³/min | 0.016–0.038 (p5–p95) | EPA chain, Monte Carlo N = 200,000 |
| Between-person σ (log) | 0.173 | 0.128–0.174 | EPA Table 3-2 |
| Sedentary V̇E | 0.0043–0.0050 m³/min | table range | EFH Table 6-2 |
| **Exertion multiplier vs sedentary** | **×3.3** | ×2.6–×5.1 | computed through the chain |

*(A ×6.2 multiplier appeared in an interim draft by dividing EPA's tabulated
bins; **×3.3** is the correct figure, computed through a consistent agent.)*

### 6.3 Citation traps recorded for the project's hygiene notes

1. **There is no 2024 or 2025 Exposure Factors Handbook Chapter 6.** EPA reposted
   the identical September-2011 document at a new URL in January 2025. **Any
   citation to "EPA 2025" for these values is wrong.**
2. **2011 and 2024 Compendium MET values differ for identical activity codes** —
   the edition must always be stated.
3. **The ACSM walking equation has no DOI** (textbook formula) — cite it through
   Moore et al. 2021, DOI 10.1249/MSS.0000000000002430, which reproduces it and
   quantifies its error (bias −0.60 MET; **direction disputed** elsewhere).
4. **EPA CHAD code 17131 lumps "walk, bike, or jog"** and is unusable as a
   walking MET.

---

## 7. Behavioural response to smoke — do not transfer housed-population numbers

Rosenthal et al. 2020, *JAMA Netw Open* 3(9):e2018116,
DOI 10.1001/jamanetworkopen.2020.18116 (California wildfire seasons 2017–18,
accelerometer, n = 455) — **18% step reduction (95% CI 11–24%) at AQI > 200**.
Three independent studies agree **adaptation begins only above the level where
smoke is already dangerous**, so a low behavioural trigger would overstate
self-protection.

> **No study anywhere measures movement, shelter-seeking, or activity change
> among unsheltered people during an acute smoke event.** Any such parameter is
> an assumption, must be labelled one, and must be swept. **Do not dress
> Rosenthal's housed-population −18% as applying to unsheltered agents.**

Supporting context: Schwarz et al. 2024, *Lancet Planet Health* 8(11):e906–e914
— wildfire PM2.5 among **unhoused** people, OR 1.006 per 1 µg/m³ (1.001–1.011),
**not significant among housed**.

---

## 8. External-validity statement (to appear in the paper verbatim)

> Gait-speed parameters derive from short-distance (3–30 m) timed walks by
> apparently healthy adults on level indoor surfaces (Bohannon 1997; Bohannon &
> Williams Andrews 2011) and from signalised-crosswalk observations of the
> general public (Knoblauch et al. 1996; Fitzpatrick et al. 2006). Neither
> population nor measurement condition matches multi-kilometre outdoor travel by
> people experiencing unsheltered homelessness, carrying possessions, in
> hazardous air, over graded terrain. Crosswalk observations are additionally
> biased upward because pedestrians hurry under signal pressure (Montufar et al.
> 2007). Mobility-impairment speeds derive from indoor building-egress
> experiments (Boyce et al. 1999) and are unimpeded short-distance speeds with
> no evidence of persistence over kilometres. Route-choice parameters derive
> from routine voluntary walking by housed adults in normal air quality. No
> literature was found describing walking speed, endurance, or route choice for
> unsheltered populations specifically, and none describing pedestrian behaviour
> in wildfire smoke. Model speeds should be interpreted as an upper bound on
> achievable travel rate.

---

## 9. Implementation summary

**Implement now:** age×sex mean table (§2.1); CV = 0.13 dispersion (§2.2);
mobility-class speed replacement (§3); the inhaled-dose chain (§6) — the
best-evidenced element in this spec; the detour multiplier (§5.1); the
journey-feasibility flag (§4.3).

**Leave out:** SDs derived from meta-analysis CIs; a load→speed penalty; any
fatigue decay presented as literature-backed; the Pandolf equation;
attribute-level route utilities; MUTCD or crosswalk means as agent speeds; any
transferred behavioural response for unsheltered people.

**Two library pulls before publication:** Broach & Dill 2015 (TRB 15-3669) and
Boyce, Shields & Silcock 1999 (*Fire Technology*) — both currently
VERIFIED-IN-SECONDARY.
