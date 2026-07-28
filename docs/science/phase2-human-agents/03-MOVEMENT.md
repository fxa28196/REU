# Phase 2 Â· Spec 3 â€” Movement Model

**Status: IMPLEMENTED.** Revises `VARIABLES.md` **V10** (`walkingSpeedMps`) from
a single constant to a per-agent distribution, and adds an inhaled-dose
formulation.

**Two headline findings, both of which change what the model should measure:**

1. **Inhaled dose is nearly flat with respect to walking speed** (dose âˆ
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

**Comfortable gait speed, cm/s (mean Â± SD)** â€” Bohannon RW (1997), *Age and
Ageing* 26(1):15â€“19,
DOI [10.1093/ageing/26.1.15](https://doi.org/10.1093/ageing/26.1.15):

| Decade | Men | Women |
|---|---|---|
| 20s | 139.3 Â± 15.3 | 140.7 Â± 17.5 |
| 30s | 145.8 Â± 9.4 | 141.5 Â± 12.7 |
| 40s | 146.2 Â± 16.4 | 139.1 Â± 15.8 |
| 50s | 139.3 Â± 22.9 | 139.5 Â± 15.1 |
| 60s | 135.9 Â± 20.5 | 129.6 Â± 21.3 |
| 70s | 133.0 Â± 19.6 | 127.2 Â± 21.1 |

**1.30 m/s is below 10 of these 12 ageÃ—sex cells** â€” above only women in their
60s (1.296) and 70s (1.272) â€” and ~6% below the table's unweighted mean of
**1.381 m/s**. It is a defensible *pace* (almost exactly Bastien's
gross-energy-cost optimum, Â§4.1) but a poor *population mean*, and it discards
the dispersion the source provides (SDs 0.09â€“0.23 m/s).

*(A review draft claimed 1.30 was below **every** cell; that is arithmetically
false given the range starts at 1.272, and is corrected here.)*

---

## 2. V10 revised â€” per-agent speed distribution Â· class **L**

### 2.1 Means (age Ã— sex)

Bohannon RW & Williams Andrews A (2011), *Physiotherapy* 97(3):182â€“189,
DOI [10.1016/j.physio.2010.12.004](https://doi.org/10.1016/j.physio.2010.12.004)
â€” descriptive meta-analysis, 41 articles, **23,111 subjects**. Grand mean
comfortable gait speed (m/s):

| Age band | Men | Women |
|---|---|---|
| 20â€“29 | 1.358 | 1.341 |
| 30â€“39 | 1.433 | 1.337 |
| 40â€“49 | 1.434 | 1.390 |
| 50â€“59 | 1.433 | 1.313 |
| 60â€“69 | 1.339 | 1.241 |
| 70â€“79 | 1.262 | 1.132 |
| 80+ | 0.968 | 0.943 |

### 2.2 Dispersion â€” and the single most likely modelling error

> **DO NOT derive SDs from the 2011 meta-analysis's 95% confidence intervals.**
> Those are CIs on a **between-study grand mean**, not person-level SDs.
> Sampling from `N(mean, CI_width/3.92)` would **understate real between-person
> variability by roughly a factor of 3â€“5** in the large strata.

Use the **coefficient of variation from Bohannon 1997**, the only source here
supplying within-population SDs: **CV â‰ˆ 0.13** (0.11 under 60; 0.16 at 60+).
Independently corroborated by Ibrahem 2025 (outdoor CV â‰ˆ 0.15, n = 6,426
crossings) and Dommershuijsen et al. 2022 (n = 4,656, 1.20 Â± 0.20 m/s,
CV = 0.167).

### 2.3 Formulation

```
v_free ~ TruncNormal( Âµ[age_band, sex],  Ïƒ = CV Â· Âµ ),  truncated [0.40, 2.20] m/s
CV = 0.13    (sweep 0.10 â€“ 0.17)
```
Truncation is a numerical guard, not a literature value â€” label it so.

### 2.4 Group travel (optional, verified, cheap)

Ibrahem 2025 (n = 6,426 crossings): walking alone 1.521 m/s; group of 2â€“4 â†’
1.399 (Ã—0.92); group of 5+ â†’ 1.341 (Ã—0.88). If encampment residents evacuate
together, this is real and inexpensive to model.

### 2.5 Explicitly rejected

- **Field crosswalk means (1.44â€“1.51 m/s) as free speeds** â€” biased upward by
  signal pressure (Montufar et al. 2007, DOI 10.3141/2002-12; direction
  verified, magnitude not).
- **MUTCD design values (1.07 / 0.91 m/s)** â€” 15th-percentile *design*
  percentiles chosen to protect slow pedestrians; using them as agent speeds
  would overstate evacuation time. Context only.
- **A further sex multiplier** â€” the table already carries the supported effect;
  field studies found sex significant only at the median.

---

## 3. Mobility limitation â†’ speed Â· class **L** (VERIFIED-IN-SECONDARY)

Boyce KE, Shields TJ & Silcock GWH (1999), *Fire Technology* 35(1):51â€“67,
DOI 10.1023/A:1015339216366. **The primary is paywalled and was not retrieved**;
values below come from Tinaburri (2018), FEMTC proceedings, Table 3, which was
downloaded and parsed. The reconstructed truncation ranges match the ranges
commonly attributed to Boyce to within rounding â€” strong internal evidence of a
faithful transcription, but **obtain the primary before publication.**

Unimpeded horizontal movement speed (m/s):

| Category | Distribution | Mean | SD |
|---|---|---|---|
| Ambulant, impaired, no aid | Normal | 0.95 | 0.32 |
| Crutches | Normal | 0.94 | 0.30 |
| Walking stick / cane | Normal | 0.81 | 0.38 |
| Rollator / walking frame | Normal | 0.57 | 0.29 |
| Manual wheelchair | Normal | 0.69 | 0.35 |
| Electric wheelchair | Constant | 0.89 | â€” |

**Apply by replacement, not multiplication** â€” these categories already embed an
older, impaired population; multiplying by an ageÃ—sex mean would double-count.

**Class prevalence is a separate question this review did not resolve.** The
2019 PIT gives 19.2% with *any* mobility impairment (a lower bound â€”
`01-POPULATION.md` Â§5.1) but no breakdown by aid type. **Treat the mix as a
scenario variable and sweep it**; do not assert a split.

**No published gait speed in m/s exists for people experiencing homelessness.**
Nearest adjacent: Kiernan et al. 2021, *HRB Open Res* 3:14 â€” 41.3% report
difficulty walking, 26.9% mobility impairment, no speeds.

Sources requested but **not** retrieved, and therefore not cited: SÃ¸rensen &
Dederichs; Jiang et al.; Fujiyama & Tyler; the SFPE Handbook tables.

---

## 4. Fatigue and encumbrance â€” mostly a negative result

### 4.1 Carrying belongings does NOT meaningfully slow walking

Two independent verified sources agree:

- Bastien et al. 2005, *Eur J Appl Physiol* 94(1â€“2):76â€“83,
  DOI 10.1007/s00421-004-1286-z (n = 10, loads 0â€“75% of body mass): metabolic
  cost rises in proportion to load, but the **net cost-of-transport speed
  optimum is verbatim "independent of load"**, and the gross optimum is
  **~1.3 m/s for all loading conditions**.
- Middleton et al. 2022, *IJERPH* 19(7):3927 (n = 30): carrying **40% of body
  mass slowed self-selected speed only ~4% (â‰ˆ0.05 m/s)**.

**Do not implement a loadâ†’speed penalty, and say so in the paper citing both.**
This is a genuine finding and more publishable than a fudge factor. Note the
useful coincidence: **1.3 m/s is Bastien's gross-cost optimum**, which defends
the model's current value as a *pace* even though Â§1 undermines it as a
population *mean*.

**No study exists of people carrying unstructured belongings** (bags, carts,
bedrolls) â€” the actual unsheltered case. State this.

### 4.2 Endurance â€” the strongest argument against silent 3.5-hour walks

Enright & Sherrill 1998, *Am J Respir Crit Care Med* 158(5):1384â€“1387,
DOI 10.1164/ajrccm.158.5.9710086 (n = 117 men, 173 women, ages 40â€“80): median
six-minute walk distance 576 m (men) and 494 m (women) â†’ **1.60 and 1.37 m/s
sustained for six minutes at an instructed maximal pace.**

The baseline's 3.5-hour continuous walk at 1.30 m/s therefore runs at **81%
(men) to 95% (women) of a maximal six-minute pace, for 35Ã— the duration, in
hazardous air.**

### 4.3 What to do about it

**No defensible source exists** for a speed-decay function over 1â€“4 hours, for
rest-break frequency or duration in civilian long walks, or for sustainable
walking duration among unsheltered people. **Do not invent a decay curve and
attribute it to literature.**

**Recommended instead â€” a feasibility flag, not a fatigue curve.** Report as
model output the fraction of agents whose journey exceeds 60 and 120 minutes at
their own sampled `v_free`. The 16.5 km / 3.5 h tail then surfaces as **a
shelter-siting failure**, the policy-relevant result, rather than being silently
absorbed into a dose number.

**Optional, explicitly unsupported sensitivity:** a rest duty cycle
(`T_walk âˆˆ {30, 45, 60, âˆž}` min, `T_rest âˆˆ {5, 10, 15}` min; a 50/10 cycle costs
~17% of effective speed), or `v(t) = v_free Â· max(0.7, 1 âˆ’ Î²Â·t_hours)` with Î²
swept 0 â†’ 0.10/h. **Label Î² unsupported.** Report with and without.

**Leave out the Pandolf equation** â€” it predicts metabolic cost, not speed, so it
cannot drive movement; Knapik et al. 2004 note such equations "may not be
accurate for prolonged load carriage"; and the model has no body-mass or load
distribution. It adds a citation and no information.

---

## 5. Route choice Â· class **L** (form) + **A** (parameters)

### 5.1 Recommended: a stochastic detour multiplier

Every parameter traces to a verified source, it needs no new network attributes,
and it is conservative (it lengthens exposure time relative to pure shortest
path):

```
with probability 0.80:  m = 1.00
with probability 0.20:  m ~ Triangular(1.00, 1.10, 1.30)
d_travelled = m Ã— d_shortest              # implied population mean m â‰ˆ 1.03
```

- **0.80** from Salazar Miranda et al. 2021, *Computers, Environment and Urban
  Systems* 86:101563,
  DOI [10.1016/j.compenvurbsys.2020.101563](https://doi.org/10.1016/j.compenvurbsys.2020.101563)
  â€” 127,082,227 GPS pings, 120,910 Boston trips; the authors state **"20% of the
  Boston trips do not take the shortest path."** *Caveat: this is the authors'
  restatement of a street-segment-level regression, not a per-trip tabulation â€”
  describe it as their characterisation.*
- **1.15 detour ratio and the "up to 20% longer" bound** from Sevtsuk & Kalvo
  2024, DOI 10.1177/23998083241261766 â€” the closest published ABM
  parameterisation.

Sweep: P(shortest) âˆˆ {0.6, 0.8, 0.9}; upper bound âˆˆ {1.2, 1.3, 1.5}; plus
bounding cases m â‰¡ 1.0 (today's model) and m â‰¡ 1.2.

### 5.2 Portland-specific route-choice evidence exists

Broach J & Dill J (2015), TRB paper 15-3669 â€” **Portland, Oregon; 1,167 walk
trips by 283 adults; GPS 2010â€“2013; path-size logit.** The most transferable
study found. Coefficients (quoted inside the fully retrieved Lue 2017 thesis;
the TRB PDF is not publicly retrievable): each turn â‰ˆ **+50 m**; upslope â‰¥10%
â‰ˆ **2Ã— level cost**; **~70 m** detour accepted to avoid an unsignalised arterial
crossing; busy street perceived **+14%** longer; commercial frontage **âˆ’28%**.

> **Mode warning:** Broach, Dill & Gliebe's better-known 2012 *TR Part A* paper
> is **bicycle** route choice. Cite the **2015** paper for walking, never 2012.

**Leave these attribute utilities out for now:** they require per-edge signal,
sidewalk, traffic-class and grade data the network lacks; they come from routine
walking in clean air; and their net effect on route *length* is what the detour
multiplier already absorbs.

### 5.3 Willingness to walk â€” and a folklore warning

**The 400 m / 800 m planning rule traces only to Neilson & Fowler (1972) and its
empirical basis is unclear. Never present it as evidence.**

- El-Geneidy et al. 2014, *Transportation* 41:193â€“210,
  DOI 10.1007/s11116-013-9508-z (Montreal, n = 16,014): median **294 m**, 85th
  percentile **678 m**; commuter rail 85th **1,259 m**.
- Daniels & Mulley 2013, *JTLU* 6(2):5â€“20, DOI 10.5198/jtlu.v6i2.308 (Sydney,
  n = 1,906): mean 573 m (SD 417); train 805 m; bus 461 m; **65+ mean 452 m vs
  30â€“49 mean 619 m (âˆ’27%)**.
- Yang & Diez-Roux 2012, *Am J Prev Med* 43(1):11â€“19,
  DOI 10.1016/j.amepre.2012.03.015 (2009 NHTS): mean 1.13 km, median 0.8 km;
  distance decay **Î² â‰ˆ 1.06 per km**.

Use decay only on the **decision to depart** (interacting with the smoke
trigger), never as a hard cap on walking â€” Portland's two shelters de facto
served a citywide catchment.

---

## 6. Exertion, ventilation and inhaled dose â€” the best-evidenced element here

This replaces the exposure **index** (ÂµgÂ·mâ»Â³Â·h) with an actual inhaled mass
(Âµg), addressing the standing `METRICS.md` limitation that the current metric
"is not an inhaled dose (no breathing rate)".

```
Dose_i += C(x_i, t) Â· VÌ‡E_i Â· Î”t                       # Âµg/mÂ³ Â· mÂ³/min Â· min = Âµg
BMR_MJday     = Schofield(BW_i, age_i, sex_i)          # EPA EFH Table 2-2
VÌ‡E_i (mÂ³/min) = 1.35 Â· BMR_kJmin Â· MET_i Â· exp(Îµ_i) / 1000
Îµ_i ~ N(0, Ïƒ) drawn ONCE per agent;  Ïƒ = 0.174 (20â€“33), 0.173 (34â€“60), 0.128 (>60)
MET_i = 4.0    # 2024 Compendium code 17255, self-selected-speed walking
```

- `VÌ‡E = 1.35 Â· BMR Â· MET` is Layton 1993, *Health Phys* 64(1):22â€“36,
  DOI 10.1097/00004032-199301000-00003, reproduced as EPA Eqn 6-4; it agrees
  with EPA's full regression **within 1â€“7% across MET 2.8â€“5.5** â€” the entire
  walking range.
- **EPA MET band cutoffs verified directly** by the author from the downloaded
  Exposure Factors Handbook Chapter 6 text: `Sedentary (METS â‰¤1.5)`,
  `Light (1.5< METS â‰¤3.0)`, `Moderate (3.0< METS â‰¤6.0)`. Evacuation walking is
  light-to-moderate. EPA's own confidence rating for the chapter is **"Overall
  Rating: Medium"** â€” cite that honestly.
- MET values: Ainsworth et al. 2011, DOI 10.1249/MSS.0b013e31821ece12; Herrmann
  et al. 2024, DOI 10.1016/j.jshs.2023.10.010. **The 2024 update raised
  moderate-to-brisk walking METs by 0.3â€“0.5 for identical activity codes â€” always
  state the edition; the difference is a free sensitivity axis.**

### 6.1 The flat-dose result

Over a fixed 2 km walk at 150 Âµg/mÂ³, computed through the chain above:

| Speed (m/s) | MET | Travel time | VÌ‡E (mÂ³/min) | **Dose (Âµg)** |
|---|---|---|---|---|
| 0.80 | 2.3 | 41.7 min | 0.0147 | 91.8 |
| 1.12 | 3.0 | 29.8 min | 0.0198 | **88.3** (minimum) |
| 1.34 | 3.8 | 24.9 min | 0.0258 | 96.3 |
| 1.88 | 5.5 | 17.7 min | 0.0391 | 103.9 |

Mechanism: EPA's regression exponent bâ‚ â‰ˆ 1.17 gives VÌ‡E âˆ MET^1.17, while METs
rise nearly linearly with speed â€” so **dose âˆ speed^0.17**, with a shallow
minimum near 1.1 m/s created by the resting-metabolism floor.

**Consequence: distance dominates inhaled dose; walking speed barely matters.**
Report this as a finding. It also means Â§2's heterogeneous speeds matter chiefly
for *who arrives and who fails* â€” exactly the equity question the project cares
about.

### 6.2 Parameters

| Parameter | Central | Sweep | Source |
|---|---|---|---|
| Walking MET | 4.0 | 3.0â€“4.8 | Compendium 2011 vs 2024 |
| VÌ‡E adult walking | 0.025 mÂ³/min | 0.016â€“0.038 (p5â€“p95) | EPA chain, Monte Carlo N = 200,000 |
| Between-person Ïƒ (log) | 0.173 | 0.128â€“0.174 | EPA Table 3-2 |
| Sedentary VÌ‡E | 0.0043â€“0.0050 mÂ³/min | table range | EFH Table 6-2 |
| **Exertion multiplier vs sedentary** | **Ã—3.3** | Ã—2.6â€“Ã—5.1 | computed through the chain |

*(A Ã—6.2 multiplier appeared in an interim draft by dividing EPA's tabulated
bins; **Ã—3.3** is the correct figure, computed through a consistent agent.)*

### 6.3 Citation traps recorded for the project's hygiene notes

1. **There is no 2024 or 2025 Exposure Factors Handbook Chapter 6.** EPA reposted
   the identical September-2011 document at a new URL in January 2025. **Any
   citation to "EPA 2025" for these values is wrong.**
2. **2011 and 2024 Compendium MET values differ for identical activity codes** â€”
   the edition must always be stated.
3. **The ACSM walking equation has no DOI** (textbook formula) â€” cite it through
   Moore et al. 2021, DOI 10.1249/MSS.0000000000002430, which reproduces it and
   quantifies its error (bias âˆ’0.60 MET; **direction disputed** elsewhere).
4. **EPA CHAD code 17131 lumps "walk, bike, or jog"** and is unusable as a
   walking MET.

---

## 7. Behavioural response to smoke â€” do not transfer housed-population numbers

Rosenthal et al. 2020, *JAMA Netw Open* 3(9):e2018116,
DOI 10.1001/jamanetworkopen.2020.18116 (California wildfire seasons 2017â€“18,
accelerometer, n = 455) â€” **18% step reduction (95% CI 11â€“24%) at AQI > 200**.
Three independent studies agree **adaptation begins only above the level where
smoke is already dangerous**, so a low behavioural trigger would overstate
self-protection.

> **No study anywhere measures movement, shelter-seeking, or activity change
> among unsheltered people during an acute smoke event.** Any such parameter is
> an assumption, must be labelled one, and must be swept. **Do not dress
> Rosenthal's housed-population âˆ’18% as applying to unsheltered agents.**

Supporting context: Schwarz et al. 2024, *Lancet Planet Health* 8(11):e906â€“e914
â€” wildfire PM2.5 among **unhoused** people, OR 1.006 per 1 Âµg/mÂ³ (1.001â€“1.011),
**not significant among housed**.

---

## 8. External-validity statement (to appear in the paper verbatim)

> Gait-speed parameters derive from short-distance (3â€“30 m) timed walks by
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

**Implement now:** ageÃ—sex mean table (Â§2.1); CV = 0.13 dispersion (Â§2.2);
mobility-class speed replacement (Â§3); the inhaled-dose chain (Â§6) â€” the
best-evidenced element in this spec; the detour multiplier (Â§5.1); the
journey-feasibility flag (Â§4.3).

**Leave out:** SDs derived from meta-analysis CIs; a loadâ†’speed penalty; any
fatigue decay presented as literature-backed; the Pandolf equation;
attribute-level route utilities; MUTCD or crosswalk means as agent speeds; any
transferred behavioural response for unsheltered people.

**Two library pulls before publication:** Broach & Dill 2015 (TRB 15-3669) and
Boyce, Shields & Silcock 1999 (*Fire Technology*) â€” both currently
VERIFIED-IN-SECONDARY.

