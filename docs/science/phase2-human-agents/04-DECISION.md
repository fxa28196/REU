# Phase 2 · Spec 4 — Shelter Decision Model

**Status: DESIGN ONLY.** Formally reopens `DESIGN_SPEC.md` Part III **F3**
("Behavioural heterogeneity — no data source identified; would be pure
assumption and could dominate results").

**Resolution of F3.** The original exclusion was correct *at the time*. This
review found local, event-specific evidence absent from the project's prior
bibliography — a Portland State University survey of unhoused people about the
September 2020 wildfire specifically, plus contemporaneous county and newsroom
documentation of both shelters' actual occupancy. That evidence supports **one**
behavioural parameter directly (awareness) and provides **two calibration
targets**. Everything else remains assumption-class under the rule below.

> **F3 governing rule.** Every behavioural parameter is either (a) sourced, or
> (b) declared class **A**, given a documented default, exposed as a scenario
> key, recorded in the manifest, swept in sensitivity analysis, **and** subjected
> to an ablation run with all behavioural heterogeneity disabled. If a
> conclusion changes between the ablation and the full model, that conclusion
> belongs to the assumption, not to the evidence, and must be reported as such.

---

## 1. What the model does now, and why it is wrong

Today every agent evacuates the instant county PM2.5 crosses 55.5 µg/m³, walks
the shortest path to the network-nearest operating shelter with capacity, and on
refusal re-selects the next nearest. No information limits, no delay, no
individual variation, no waiting.

Against the Protective Action Decision Model (Lindell & Perry 2012,
*Risk Analysis* 32(4):616–632,
DOI [10.1111/j.1539-6924.2011.01647.x](https://doi.org/10.1111/j.1539-6924.2011.01647.x)),
this omits the entire **pre-decision stage** — exposure to information →
attention → comprehension must precede any protective action. For this
population that stage is not a refinement; it is the binding constraint.

---

## 2. The local evidence (verified)

### 2.1 Awareness — the one directly sourced behavioural parameter

Portland State University, *Stories from the Outside: Oregon Wildfires 2020*
(Hines, Petteni, Knowlton et al., with Street Roots Ambassadors), **n = 73**
unhoused Portland-area respondents, surveyed **June 2021** about the September
2020 event. **Verified directly by the author** at
https://www.pdx.edu/homelessness/stories-outside-oregon-wildfires-2020:

| Finding | Value |
|---|---|
| Did not receive any information about support | **75%** |
| **Did not hear about the shelters** | **65%** |
| Did not receive any help | 68.5% |
| Smoke impacted their health | 50% |
| Difficulty breathing | 37% |
| Went to hospital | 15% |

→ **p_aware ≈ 0.35** (class **L**; local and event-specific).

Caveats: n = 73; retrospective by ~9 months; recruitment deliberately
oversampled BIPOC respondents (an equity design strength, not a probability
sample). Sensitivity range **0.25–0.45**.

### 2.2 Calibration targets — what actually happened

| Fact | Source |
|---|---|
| Oregon Convention Center opened **Sept 10**, Charles Jordan CC **Sept 11**, both **99-person capacity** (COVID-constrained), third site standby, operating **9 consecutive days** through Sept 18/19 | Multnomah County Joint Office of Homeless Services news releases, Sept 10–18 2020 |
| One observed night (Sept 16): **~90 at OCC, 40 at Charles Jordan** — ~130 of 198 beds — against **~2,000 sleeping unsheltered countywide** | Street Roots, 16 Sept 2020 |
| 211 hotline waits > 1 hour; **only 21 clean-air-shelter calls on Sept 15** | Street Roots, ibid. |
| Barriers: fear of leaving belongings/camp, COVID transmission fear, language barriers, "toughing it out" | Street Roots, ibid.; PSU survey |

**Derived uptake ≈ 130/2,000 ≈ 6–7% per night.** This is a **derivation from two
documented numbers, not a published statistic** — cite it that way. With 35%
awareness it implies conditional uptake given awareness of roughly 15–20%.

These two occupancy numbers (≈90/99 and 40/99) are the **only quantitative
behavioural calibration targets this project has**. Use them as targets, never
as parameters.

### 2.3 What does not exist

**No study anywhere provides a fitted quantitative choice model for unsheltered
people and shelters.** The qualitative barrier set (distrust, restrictions on
pets/partners/belongings, prior negative experience, information exclusion) is
consistently documented — Every & Richardson 2019 (AJEM); Gin & Dobalian
(*Natural Hazards Review*, DOI 10.1061/NHREFO.NHENG-2356); Settembrino
(Hurricane Sandy Quick Response report) — but **never parameterised**.

**Design consequence:** do not invent separate sub-parameters for pets,
belongings, and distrust. Fold them into one latent "reluctant" class (§3.2).
Inventing four unsourced parameters where the evidence supports one latent
construct is precisely how a model becomes indefensible.

---

## 3. Recommended formulation

### 3.1 Stage 0 — Information (PADM pre-decision) · class **L**

```
A_i(0) ~ Bernoulli(p_aware),    p_aware = 0.35        [PSU survey]
```
An unaware agent cannot select a shelter. Optional word-of-mouth growth
`dp/dt = κ·(contacts)` with **κ = 0 by default** (class **A**; sensitivity
scenario only).

### 3.2 Stage 1 — Whether and when to go · form class **L**, coefficients class **C**

Sequential (repeated) binary logit, one decision per period, in the established
evacuation-demand form of Fu & Wilmot 2004 (*TRR* 1882:19–26,
DOI [10.3141/1882-03](https://doi.org/10.3141/1882-03)):

```
P_i(go at t | aware, not yet gone)
    = 1 / ( 1 + exp( −( β₀ + β₁·ln C(t) + β₂·D(t) + θ_i ) ) )
```

- `C(t)` — current PM2.5 (environmental cue).
- `D(t)` — cumulative days at Hazardous levels (PADM cue accumulation; the
  Sept 2020 episode ran **5 consecutive days ≥ 250.5 µg/m³**, so duration is a
  real, distinguishing cue).
- `θ_i` — latent-class intercept over {shelter-inclined, reluctant}, share π.
  Latent-class structure is supported by McCaffrey, Wilson & Konar 2018
  (*Risk Analysis* 38(7):1390–1404, DOI 10.1111/risa.12944), which identifies
  evacuation-inclined and stay-inclined classes with substantial "wait and see"
  behaviour. **Their class proportions were not extractable and must not be
  quoted.**

**β₀, β₁, β₂, π are class C (calibrated), not L.** Fit them so the model
reproduces the two local targets — steady-state uptake ≈ 6–7%, per-site
occupancy bracketing 40/99 and ~90/99 — then report target, fit, and residual as
`DESIGN_SPEC.md` requires for class C, and sweep each ±50%.

**Keep 55.5 µg/m³, but move it to where it belongs:** it becomes the
**shelter-opening** trigger (a policy variable), not the individual evacuation
trigger. This matches what actually happened (county opened Sept 10) and
resolves the standing AUDIT #1 artefact in which everyone evacuates on the brief
Sept-7 spike, before any shelter existed.

**Departure delay** (family class **L**, parameters class **A**):
```
τ_i ~ Lognormal(µ, σ)
```
Right-skewed positive families (lognormal, log-logistic, gamma, Weibull) are the
established choice for pre-movement delay — Lovreglio, Kuligowski, Gwynne &
Boyce 2019, *Fire Safety Journal*,
DOI [10.1016/j.firesaf.2018.12.009](https://doi.org/10.1016/j.firesaf.2018.12.009),
fitted across 112 datasets. **That database is building egress at minutes scale;
only the family transfers, never its parameters.** Default median 1–6 h, swept,
consistent with documented multi-day "toughing it out".

### 3.3 Stage 2 — Where to go · form class **L**, coefficients class **A**

Multinomial logit over shelters known, open, and within walking range R:
```
U_ij = −β_d · d_ij + β_o · OPEN_j(t) + ε_ij ,    ε ~ Gumbel
P_ij = exp(U_ij) / Σ_k exp(U_ik)
```

- **Negative distance coefficient** — sign and MNL structure are well
  established: Cheng, Wilmot & Baker 2008 (hurricane evacuation destination
  choice, Hurricane Floyd survey) estimate −0.004655 per mile (friends/
  relatives) and −0.005882 per mile (hotel/motel), with positive capacity-proxy
  and negative in-hazard-path coefficients. **These magnitudes are vehicle-scale
  and must NOT be transferred to walking — sign and structure only.**
- **Public-shelter aversion** — direction supported by Mesa-Arango et al.
  (*Natural Hazards Review*, DOI 10.1061/(ASCE)NH.1527-6996.0000083) and Wong,
  Broader & Shaheen 2020 (UC ITS, DOI 10.7922/G29G5K2R), where destination
  shares were friends/family 49–70%, hotel/motel 13–23%, **public shelters only
  2–5%**. Even among housed evacuees, formal shelters are a last resort.
- **β_d magnitude and range R** — class **A**, swept. R band 0.5–5 km, loosely
  anchored by El-Geneidy et al. 2014 (*Transportation* 41,
  DOI 10.1007/s11116-013-9508-z: 85th-percentile walk 524 m to bus, ~1,259 m to
  rail) — **routine-trip evidence, not emergency-refuge evidence**, so it bounds
  rather than determines. Portland's two sites de facto served a citywide
  catchment, which argues for the upper end.

**Honest simplification:** with only 2–3 real shelters, MNL and
nearest-known-open differ little. The minimal defensible version is *nearest
known open shelter within R, with logit noise permitting the second-nearest*.
Implement full MNL only if the extra-shelters scenario makes it matter.

### 3.4 The four required actions

| Action | Trigger | Mechanism |
|---|---|---|
| **Continue** | default | proceed along current route |
| **Reroute** | encounters a blocked edge at a node | re-materialise path to the same shelter on the masked graph (`05-HAZARDS.md`) |
| **Select another shelter** | refused at door, or target closes | re-run Stage 2 excluding that shelter; bounded by `decision.maxRetargets` (today the hard-coded `MAX_RETARGETS = 8`) |
| **Wait** | obstruction expected to clear sooner than the detour costs | compare expected wait against detour time; class **A**, off by default |

**Waiting must be an activity, not a terminal state.** A sixth `final_state`
would break the outcome-census contract; add `wait_minutes` and
`activity_at_end` columns instead (`07-OUTPUTS.md`).

### 3.5 Where health vulnerability enters the decision

The user's brief asks that agents weigh health vulnerability. **No source
supports vulnerability-dependent shelter choice for this population.**
Recommended honest treatment: vulnerability enters the decision **only** through
mechanisms with evidence —
mobility limitation slows travel (`03-MOVEMENT.md`), which raises the modelled
cost of a distant shelter and so changes the choice *implicitly* through `d_ij`
and travel time. Any explicit `β_health` term is class **A** with no source and
should default to 0.

---

## 4. Parameter classification

**Evidence-based:** shelter capacities (99/99), opening dates and 9-day
operation, awareness 0.35, the measured smoke series, calibration targets
(occupancy 40 and ~90; uptake ~6–7%), non-compliance floor (even among housed
populations 3–13% never comply with mandatory orders; ~46% total compliance in
the Kincade Fire GPS study), public-shelter aversion direction, negative distance
sign, lognormal delay family.

**Necessary assumptions (named scenario keys, each swept):** β₀, β₁, β₂ (fitted
then ±50%), latent-class share π, delay (µ, σ), walking range R (0.5–5 km),
β_d, word-of-mouth κ (default 0), β_health (default 0). Seven to eight
sensitivity dimensions — tractable with a one-at-a-time or fractional-factorial
design under common random numbers.

---

## 5. What this buys and what it costs

**Buys:** the model stops asserting that 100% of unsheltered residents instantly
evacuate — an assumption the local record contradicts (~6–7% uptake, 65%
unaware). It gains PADM-consistent structure, a locally calibrated uptake rate,
and the ability to ask the question the project actually cares about: *does
better shelter placement help people who do not know the shelters exist?*

**Costs:** ~8 assumption-class parameters. That is why the F3 governing rule is
mandatory and the ablation run is part of the deliverable.

**Explicitly rejected as speculative:** utility coefficients presented as
literature-derived (none exist for this population); separate pet/belongings/
distrust parameters (qualitative evidence only); queueing-theoretic shelter
dynamics (no data).
