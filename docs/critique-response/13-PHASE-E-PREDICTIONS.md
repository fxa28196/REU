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

> **CORRECTION, added 2026-07-29 after the runs (this arithmetic was wrong).**
> The derivation above under-counts, and the model disproves it: the realized
> attempt share among the aware is **0.502**, not 0.385 (measured identically
> in all three arms at seed 42; ≈0.50 at seeds 43/44). Two errors: the
> "~240 evaluable hours" is an underestimate — with the 2026 network every
> shelter is open from tick 0, so the official cue is on and hours are
> evaluable from the first hour, not from a Sept-10 activation; and
> `bRisk·z_R` is treated as a constant +0.8 when z_R keeps accumulating
> through the 188-hour main episode, so the late-episode hazard is far above
> the assumed mean. Correcting α to hit 0.385 requires roughly
> **α ≈ −8.7** (a ~0.7 log-odds reduction), which the E9 calibration will
> establish properly rather than by this arithmetic. **The registered
> prediction stands as written and is scored as a MISS** — this note records
> why, and does not retroactively edit the number that was registered.

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

## Prediction outcomes (runs 2026-07-29, commit 7224cef, archived `docs/runs/phase-e/`)

Nine baseline-real runs, {A,C,D} × seeds {42,43,44}, all clean-tree, 99/99
invariants in `scripts/verify_E_runs.py`. Sheltered counts:

| seed | A | C | D | capacity refusals (A / C / D) |
|---|---|---|---|---|
| 42 | 1215 | 1215 | 1215 | 295 / 0 / 0 |
| 43 | 1168 | 1168 | 1168 | — |
| 44 | 1205 | 1206 | 1206 | — |

Between-arm difference ≤ 1 resident; between-seed spread 47.

- **P-E1 — MISS on magnitude, CONFIRMED on mechanism.** Predicted 10–15%
  sheltered; observed 15.9% pre-pet-correction and 17.8% after it. The
  mechanism claim is right and is the headline: arm A ceases to be
  capacity-bound and finishes with 1,019 empty beds.
- **P-E2 — CONFIRMED, and more strongly than stated.** The A→C gap does not
  merely compress, it disappears (0–1 residents against 47 of seed noise).
- **P-E3 — CONFIRMED.** 22.1% of departures occur before hour 79; the mass
  aligns with the main episode.
- **P-E4 — CONFIRMED via its disconfirmation clause, and sharpened.** The
  mobility gap does not just shrink, it inverts (limited 17.0% vs unimpaired
  15.7%). Arm D's reserve effect does not merely shrink either: **arm D
  records ZERO capacity refusals, so the 667 reserved beds arbitrate nothing
  and ER-D is not a test of triage at all** — it is an arm-B-capacity run with
  an inert intake rule. This must be stated wherever ER-D is reported. The
  clause registered in advance ("if D's effect vanishes entirely, that is a
  reportable disconfirmation") is what happened.
- **P-E5 — CONFIRMED.** Pre-correction sheltered share: 19.1% with no
  barriers, 11.5% with one, 0.0% with two or more. Wachinger holds in every
  run (~87% of high-barrier residents never depart even at peak PM2.5), so the
  model is not a monotone risk-only trigger.
- **P-E6 — CONFIRMED.** Asthma shows no gait-speed or dose difference
  (|Δspeed| = 0.004 m/s, dose z = 0.70); any asthma signal is confined to
  departure timing, exactly as V39 permits.

**Caveat that outranks all of the above.** These arms are not a placement or
triage experiment any more. Because only ~1,220 of 6,842 residents ever
depart, system capacity never binds and no supply-side intervention *can*
register. Arm A still shows 295 door-level capacity refusals — individual
sites fill while 1,019 beds stand empty elsewhere, the same geography failure
the earlier arms measured — but every refused resident re-routes and is
admitted. The correct reading is that under measured awareness the binding
constraint moves from architecture to behaviour; it is NOT that placement and
triage were shown to be ineffective.

## Scenario-E (severe-event) predictions

Registered 2026-07-30, BEFORE any Scenario-E run. The git commit carrying
this section is the timestamp; every Scenario-E run manifest must stamp a
commit at or after it.

### Configuration being predicted

Codes {18, 19, 20} × seeds {42, 43, 44}: the ER baseline-real configuration
carried VERBATIM (awareness 0.356, L1, hazard departure with sigmaTheta 1.0 /
bRisk 0.4 / wOfficial 1.1 / gammaVuln 0.25 / half-life 48 h, barrier costs
0.26, pets refused at unrecorded sites, betaCapacityPrior 0.2,
shelterPolicyVariant 1, alphaHazard −8.0 as registered — the known-wrong
value is kept so E18 is comparable to ER-A run-for-run; the E9 refit replaces
both later), plus the Scenario-E layer: smokeSeriesCode 1, smokeScale 1.0
(central = the baked 1.75× transform, A-33), closuresCode 1 (base schedule:
3 bridges + 15 arterials, one wave at hour 79), pStuck 0.3, stuckDelayH 3.0,
pushThetaThreshold −0.25, kPush 1.0, simulationHours 456. Code 20 adds
`triageReserveFraction 0.10`. Controls, same seeds: codes 18/19/20 with
closuresCode 0, so the smoke effect and the obstacle effect separate cleanly.

**pushThetaThreshold = −0.25 derivation (band-anchored arithmetic, not a fit
to any simulation output):** the V51 empirical band says 55–75% of people who
enter smoke continue through it (Wood 1972: 74% of movers; Bryan 1977: 70.1%;
Jin 1997 dense smoke: 55%). For an UNBURDENED resident (c_i = 0, no mobility
penalty) the rule gives P(push) = P(theta_i ≥ threshold) with
theta_i ~ N(0, sigmaTheta² = 1); the band midpoint 0.60 ⇒ threshold =
Φ⁻¹(0.40) ≈ −0.25. Burdens then RAISE the effective threshold (kPush = 1.0:
a mobility-limited resident needs theta ≥ 0.75, P ≈ 0.23), so the
population-level push share is predicted BELOW the unburdened 0.60 — the
burden gradient is the falsifiable content, the band anchors only the
unburdened intercept. kPush = 1.0 and pStuck/stuckDelayH centrals remain
declared assumptions (A-35).

### Predictions (directional, falsifiable)

- **P-SE1 (attempts rise; awareness still binds).** The severe series raises
  z_R faster and holds it longer (456 h, peak 984.75), so the attempt share
  among the aware EXCEEDS ER's realized 0.502 — registered band 0.55–0.75.
  Every arm's sheltered share still stays under the 35.6% awareness ceiling,
  and arm 18 still ends with empty beds system-wide (attempts ≈ 0.65 × 0.356
  × 6,842 ≈ 1,600 < 2,234 spaces) — non-arrival stays behaviour-limited even
  in the severe world, though arm 18's door-level capacity refusals rise
  above ER-A's 295.
- **P-SE2 (dose rises more than the concentration does).** Population mean
  cumulative dose in E18 exceeds ER-A's by MORE than the 1.75× concentration
  transform alone — the episode is also longer (284 vs 188 h main episode)
  and never-departers absorb the whole difference at full exposure. If the
  smokeScale sweep (0.857 / 1.143) runs, dose per capita rises superlinearly
  in effective scale for the never-departed stratum.
- **P-SE3 (closures reopen a C-over-A difference — in the cost channel).**
  Under closuresCode 1, residents EN_ROUTE at the hour-79 wave in arm 19
  (46 doors) suffer LESS added dose and shorter reroute detours than the same
  stratum in arm 18 (36 doors): multi-site redundancy means the recomputed
  best door is nearer. The closure-free controls show no such difference, so
  the gap is attributable to the obstacle layer. Sheltered COUNTS stay equal
  within seed noise in both arms (the connectivity proof guarantees no
  shelter is severed, so closures cost time and dose, not access). If the
  sheltered gap DOES reopen beyond seed noise, that is the louder finding —
  it would be the first condition in this study where placement changes WHO
  gets in rather than what it costs.
- **P-SE4 (arm 20 stays inert — registered negative control).** Closures do
  not reintroduce system capacity pressure (≤ ~1,600 attempts against 6,842
  spaces), so E20 records zero (or single-digit) capacity refusals and its
  667 reserved beds arbitrate nothing, exactly as ER-D. Stated in advance so
  the inertness is a registered expectation, not a post-hoc excuse.
- **P-SE5 (who gambles at a blockage).** Among residents whose remaining
  route crosses a blocked edge: mean theta of pushers > mean theta of
  rerouters; push share among mobility-limited or multi-barrier residents is
  under half the unburdened share; the population push share lands BELOW the
  unburdened 0.60 (blend of burden strata; registered band 0.35–0.60); stuck
  events ≈ pStuck × push-throughs (0.3 ± seed noise). Auditable per agent
  from the four appended counters.
- **P-SE6 (exposure bimodality sharpens).** In closure arms the
  hours-above-unhealthy gap between the never-sheltered and the sheltered
  strata widens by MORE than the 1.75× transform relative to ER-A: the
  sheltered-early population is capped early while the stranded/delayed
  population accrues through a longer, higher episode.

### Scoring rule

Outcomes reported in this file after the matrix, misses stated as misses
with appended corrections, never edits — the P-E1/alphaHazard precedent
applies verbatim.
