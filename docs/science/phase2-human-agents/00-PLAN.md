# Phase 2 â€” Scientific Implementation Plan: Heterogeneous Human Agents

**Status: IMPLEMENTED.** The design in this document is live in the final model (commit b69fc6d); this file is the evidence trail for its parameters. No model code, scenario file, or parameter file has been created
or modified in this phase. The validated baseline (`c48cd70`,
`sim-20260724-223555-seed42`) is untouched; all work is on branch
`phase2/human-agent-modeling`.

**Objective:** transform identical evacuation agents into evidence-based
heterogeneous human agents, without losing the reproducibility or defensibility
established by the baseline.

---

## 1. The three governing rules

**Rule 1 â€” No invented values.** Every variable is either read from a retrieved
source, or it stays unimplemented and is listed as a declared gap. Where an
out-of-area figure stands in for a local one it is labelled **PROXY** in the
model, the manifest, and every results caption.

**Rule 2 â€” F3 is reopened under conditions.** `DESIGN_SPEC.md` Part III excluded
behavioural heterogeneity because "no data source identified; would be pure
assumption and could dominate results." That judgement was correct at the time.
This review found local, event-specific evidence absent from the project's prior
bibliography, which supports **one** behavioural parameter directly and provides
**two calibration targets**. Everything else is class **A** and must be: given a
documented default, exposed as a scenario key, recorded in the manifest, swept in
sensitivity analysis, **and** subjected to an ablation run with all behavioural
heterogeneity disabled. *If a conclusion changes between the ablation and the
full model, that conclusion belongs to the assumption, not the evidence, and must
be reported that way.*

**Rule 3 â€” The baseline is immutable.** Implementation steps 1â€“5 must reproduce
`agents.csv` **byte-for-byte**; every later step is gated on the original 27
columns. One deliberate exception is proposed and flagged for approval (Â§7).

---

## 2. Documents in this plan

| Spec | Covers | Headline finding |
|---|---|---|
| [`01-POPULATION.md`](01-POPULATION.md) | age, sex, health conditions, mobility limitation, disability | Strong **local** evidence exists (2019 Multnomah PIT, n = 2,037). Condition-specific prevalence does **not** exist locally and must be imported as PROXY. |
| [`02-VULNERABILITY.md`](02-VULNERABILITY.md) | asthma, COPD, age, disability effects | **Both disputed slide citations confirmed dead**, and the VWE formula itself is a **category error**. Recommends stratified reporting instead of multiplication. |
| [`03-MOVEMENT.md`](03-MOVEMENT.md) | walking speed, fatigue, route choice, inhaled dose | **Inhaled dose is nearly flat in walking speed** (âˆ speed^0.17) â€” distance dominates. Speed is an *access* variable, not an exposure one. Load carriage does **not** slow walking. |
| [`04-DECISION.md`](04-DECISION.md) | shelter decision framework | PADM three-stage structure; **awareness â‰ˆ 0.35** is the one directly sourced behavioural parameter; two local occupancy calibration targets. |
| [`05-HAZARDS.md`](05-HAZARDS.md) | dynamic disruptions | **Recommends OMITTING stochastic road closures** â€” no documented occurrence in the study area, no transferable duration parameters. |
| [`06-SCENARIOS.md`](06-SCENARIOS.md) | scenario framework | One `scenario` parameter â†’ external `.properties` files; three-layer resolution; full manifest capture. |
| [`07-OUTPUTS.md`](07-OUTPUTS.md) | output redesign | Append-only columns + `summary.md`/`breakdowns.csv`; **`METRICS.md` has drifted and must be corrected first**. |
| [`08-ENGINEERING.md`](08-ENGINEERING.md) | architecture, RNG, testing, reproducibility, data | **Agent step order draws from the same RNG stream as population placement** â€” the constraint governing the whole phase. |

---

## 3. Findings that change the brief

The brief asked for specific features. Three of them, followed literally, would
make the model *less* defensible. Each is documented in full in its spec.

**3.1 The vulnerability multiplier cannot be fixed by finding better numbers.**
VWE = dose Ã— RR multiplies a cumulative dose (ÂµgÂ·mâ»Â³Â·h) by a ratio of
*health-outcome rates per concentration increment*. The correct multiplier for an
equivalent dose is the ratio of *coefficients* (â‰ˆ ratio of excess risks), not the
ratio of RRs â€” and the same published data yield an "age multiplier" anywhere
from **1.008 to ~2.5** depending purely on scale choice. Moreover, since the
model simulates no health outcome, **no value of RR_age or RR_com can ever be
validated or refuted by the model's own output.** Recommendation: report exposure
**stratified by** susceptibility class as the primary result; keep weights as
scenario parameters defaulting to 1.0; rename VWE so it does not read as
epidemiological.

**3.2 Stochastic road closures would be fabrication.** The brief requires a
probability, a duration distribution, and a recovery assumption per event. For
urban path closures none of the three exists for this event â€” and no smoke-caused
closure inside the Portland study area is documented at all. The mechanism may be
built and tested with an empty hazard set; closures may be injected
**deterministically** as an explicitly SYNTHETIC conditional experiment. A
sampled closure rate would be an invented empirical claim.

**3.3 Disability should not be a dose weight.** No wildfire-smoke
exposure-response modifier for disability exists. Disability's well-evidenced
effect operates on **mobility, evacuation delay, and shelter accessibility** â€”
mechanisms this model can actually simulate. Weighting dose by disability both
lacks support and misplaces the mechanism.

A fourth, smaller correction: **smoke "Ã—1.5" scenario multipliers have no basis**
â€” episodes differ in duration and diel structure, not merely amplitude. Use real
alternative episodes.

---

## 4. Verification protocol used, and what it caught

Six specialist reviews ran in parallel (demographics, vulnerability, mobility,
decision/hazards, architecture, testing+reproducibility+data), each instructed to
retrieve every source, mark it VERIFIED or UNVERIFIED, and report "no defensible
source found" rather than produce a number.

**Every load-bearing citation was then re-verified independently by the author.**
That second pass caught four errors:

1. An asthma odds-ratio table had its **lag labels shifted by one** (lag 0
   reported as 1.05; the paper says 1.04, and 1.05 is lag 0-1).
2. A meta-analysis was reported as pooling **10 studies**; the relevant
   age-stratified analysis pools **8**.
3. The local mobility-limitation figure was reported as a prevalence estimate; it
   is a **lower bound**, because the question was asked only of survey completers
   while the percentage is computed on the full population denominator.
4. Two retrievals of one confidence interval disagreed, and a published interval
   was found that **does not contain its own point estimate** â€” both flagged as
   requiring PDF verification before any manuscript quotes them.

This protocol exists because the project has already been damaged twice by
misattributed citations. Apply it to every future evidence addition.

---

## 5. Registry additions

**New variables** (`VARIABLES.md`): V18 age Â· V19 sex Â· V20 mobility limitation Â·
V21 health conditions Â· V22 joint/compound-burden structure. **Revised:** V2/V4
(RR_age, RR_com â€” reformulated per `02-VULNERABILITY.md`), V10 (walking speed â†’
distribution, pending `03-MOVEMENT.md`), V12 (admission â†’ order-independent).

**New datasets** (`DATA_SOURCES.md`): **D10** 2019 Multnomah PIT Â· **D11** CASPEH
2023 Â· **D12** Zellmer 2025 Â· **D13** Lewer 2019. **Resolved:** D5 and D6 â€” both
disputed slide values confirmed unusable, with replacement evidence and the
recommendation not to multiply at all.

**New bibliography entries** (`BIBLIOGRAPHY.md`), all with DOIs and usage tags:
Kondo 2019, Delfino 2009, Alman 2016, Wettstein 2018, DeFlorio-Barker 2019,
Gan 2017, Fu & Mago 2024, Rappold 2011, Park 2024, Reid 2016, Brown 2017,
Lewer 2019, Snyder & Eisner 2004, Al-Shakarchi 2020, Baggett & Rigotti 2010,
Lindell & Perry 2012, McCaffrey 2018, Fu & Wilmot 2004, Cheng/Wilmot/Baker 2008,
Mesa-Arango, Wong 2020, Lovreglio 2019, El-Geneidy 2014, Glasserman & Yao 1992.

---

## 6. Priority order for implementation

Following the project's stated priority (scientific validity â†’ reproducibility â†’
documentation â†’ testing â†’ implementation), and `08-ENGINEERING.md` Â§7:

1. **Correct the documentation defects first** â€” `METRICS.md` column drift
   (`07-OUTPUTS.md` Â§0) and the missing manifest parameter (Â§7 below). Cheap, and
   they are what an external reviewer reads.
2. **Reproducibility hardening** â€” the RNG stream architecture *before the first
   demographic draw is coded*; `Streets.dbf` checksums; fail-fast hashing;
   dirty-tree capture.
3. **Testing substrate** â€” JUnit 5 (already shipped with Repast, verified
   present), the baseline golden-regression script, `StreetNetwork` unit tests.
4. **Then** the science: population attributes â†’ susceptibility stratification â†’
   movement â†’ decision â†’ hazard mechanism â†’ outputs â†’ scenarios.

**The highest-value scientific work is not the vulnerability weights.** It is
**mobility limitation** (`01-POPULATION.md` Â§5.4) and **awareness**
(`04-DECISION.md` Â§2.1): both are locally sourced, and both act through
mechanisms the model actually simulates â€” time outdoors, and whether a person
seeks shelter at all.

---

## 7. Decisions requiring explicit approval before implementation

1. **Amend the archived baseline manifest** to add the missing
   `evacuationThresholdUgM3`. The run is behaviourally identical and no check
   depends on it, but it edits an archived artefact. *Recommendation: do it* â€”
   an unrecorded behavioural parameter is the larger risk.
2. **Rename VWE** to something not reading as epidemiological (e.g.
   "susceptibility-weighted equivalent dose"), or keep the name with a mandatory
   caption. *Needs mentor input â€” it affects the slides' vocabulary.*
3. **Adopt stratified reporting as the primary metric** in place of a multiplied
   index. *Needs mentor input â€” this changes the project's headline metric and is
   the most scientifically consequential recommendation here.*
4. **Model adults only** (6 unsheltered minors counted, 0.3%).
5. **Population scale** â€” capacity cannot bind below n = 199; the real event had
   ~2,000 unsheltered people for ~198 beds.

---

## 8. What this phase deliberately does not do

No code. No parameter files. No scenario files. No changes to the baseline, to
`main`, or to any archived run. The next phase begins only when Â§7 is decided,
and it begins with step 0 of `08-ENGINEERING.md` Â§7 â€” the tooling that proves a
change did nothing â€” not with a feature.

---

## 9. Outstanding

**All nine specs are written.** Two items remain open and are recorded here so
they are not forgotten:

1. **Two library pulls before publication** (`03-MOVEMENT.md` Â§9): Broach & Dill
   2015 (TRB 15-3669, Portland pedestrian GPS route choice) and Boyce, Shields &
   Silcock 1999 (*Fire Technology*, disability movement speeds). Both are
   currently VERIFIED-IN-SECONDARY â€” the numbers are quoted from documents that
   were retrieved in full, but the primaries were not.
2. **One paywalled estimate** (`02-VULNERABILITY.md` Â§7): Borchers Arriagada
   2019's pooled asthma values are confirmed only via secondary sources.

Neither blocks implementation; both must be resolved before any manuscript
quotes the affected numbers.

### A fourth finding that changes the brief

`03-MOVEMENT.md` establishes that **inhaled dose scales as roughly speed^0.17** â€”
it is nearly flat. Ventilation rises as MET^1.17 while METs rise about linearly
with speed, so walking faster shortens exposure time and raises breathing rate
almost in cancellation. **Distance to shelter dominates inhaled dose; walking
speed barely affects it.**

This reframes the movement work: heterogeneous speed matters for *who reaches
shelter and who does not*, not for how much smoke they inhale. It also supplies
the fix for a standing `METRICS.md` limitation â€” the model can now compute an
actual inhaled mass (Âµg) via a verified EPA/Layton ventilation chain, rather than
the current exposure *index* (ÂµgÂ·mâ»Â³Â·h) that has no breathing rate in it.

