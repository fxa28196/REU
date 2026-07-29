# Phase-E registered predictions (rule R2)

Registered 2026-07-29, BEFORE any E run. The git commit carrying this file is
the timestamp; every ER/Scenario-E run manifest must stamp a commit at or
after it. Follows the `12-PHASE-D-PREDICTIONS.md` precedent: directional
predictions stated first, runs second, outcomes reported (including misses)
in the round report.

## Configuration being predicted (baseline-real)

`batch_params_2026_ER_{A,C,D}_seed{42,43,44}.xml` — awareness 0.356 (V29),
L1 locations-only information (V42), logistic hazard departure with
sigmaTheta 1.0 / bRisk 0.4 / wOfficial 1.1 / gammaVuln 0.25 / half-life 48 h
(V35–V39), barrier costs 0.26 each (V40 Tanim midpoints), pets refused at
unrecorded sites (A-29), betaCapacityPrior 0.2 (V43, A-32). Arm D adds
`triageReserveFraction 0.10`. Value rationale in
`scripts/make_batch_params_E.py`; all values pre-registered here, none fitted
to any E-run outcome.

**alphaHazard = −8.0 derivation (A-30, declared calibration-by-arithmetic,
not a fit to simulation output):** target attempt share ≈ V30 = 0.385 among
the aware over the event. P(never depart) ≈ exp(−Σp_h) over ~240 evaluable
hours after first opening ⇒ mean hourly p ≈ 0.002 ⇒ logit ≈ −6.2. Typical
mid-episode contributions bRisk·z_R ≈ +0.8 and wOfficial ≈ +1.1 give
α ≈ −6.2 − 1.9 ≈ −8.1, rounded to −8.0. The E9 occupancy calibration
(deferred, weekend) will replace this with a fitted value.

**lambdaOutreachPerDay = 0 in baseline-real:** the measured 0.356 is
awareness DURING the event, so it already embeds whatever outreach occurred;
modelling additional conversion on top would double-count. Deferred +AWARE
arms explore nonzero rates (A-31).

## Predictions (directional, falsifiable)

- **P-E1 (access drops; A stops being capacity-bound).** Under baseline-real,
  sheltered share FALLS in every arm versus its omniscient counterpart
  (A 30.1%, C 96.0%, D-r10 ≈ B). Arm A ceases to be capacity-bound: the
  attempt pipeline 0.356 × 0.385 ≈ 13.7% is below A's 32.7%
  capacity-to-demand, so arm A lands at roughly 10–15% sheltered with beds
  EMPTY — non-arrival becomes awareness/behaviour-limited, not door-limited.
- **P-E2 (the A→C gap compresses).** C's advantage over A (65 pp sheltered
  under omniscience) COMPRESSES under baseline-real, because the binding
  constraint moves from doors/geography to awareness and willingness, which
  no placement can fix. Ordering A < C survives.
- **P-E3 (two-spell temporal alignment).** The hour-16–22 minor spike
  produces only PARTIAL early departure (the risk cue z_R has accumulated
  little); the mass of departures aligns with the main episode from hour 79+.
  This is the directive's required prediction restated for the hazard model.
- **P-E4 (the first-hour race stretches; D's reserve effect shrinks).**
  Under heterogeneous, staggered departure the first-hour race that produced
  the mobility access gap stretches or dissolves; the mobility-limited vs
  unimpaired access gap in baseline-real arms is SMALLER than the omniscient
  24.5 pp, and arm D's reserve closes correspondingly less (there is less
  race to fix). If D's effect vanishes entirely, that is a reportable
  disconfirmation of the triage mechanism's relevance under realistic
  departure, not a failure of the run.
- **P-E5 (barrier strata are suppressed).** Residents with heavy belongings
  or pets (under refuse-by-default) shelter at visibly lower rates than
  barrier-free residents in every arm; the Wachinger acceptance constraint
  holds — at peak PM2.5 the high-barrier stratum still shows non-departure.
- **P-E6 (asthma negative control, revised per V39).** Asthma continues to
  show NO gait-speed or dose difference; any asthma effect appears ONLY in
  departure timing (through gammaVuln), asserted by verify_E.

## Deferred (recorded, not run this cycle)

Spec §6 items not in the Friday matrix: arm B baseline-real (one params file
away), +AWARE / +INFO(L2) / +RIDES / +BARRIER intervention arms, the
coordination package, E9 historical calibration (spec timeline Aug 6–8),
9-seed extension, L3 word-of-mouth (descope ladder position 1), logit choice
noise, petPolicyDefault=admit counter-world.

## Scenario-E (severe-event) predictions

To be appended in this file BEFORE any Scenario-E run (codes 18–20).
