# E-layer spec checkpoint — human decision layer (E1–E3)

Status: SPEC (checkpoint for asynchronous review, per Round-5 directive §6).
Date: 2026-07-28. E1 harvest: 7 agents, all sources verified per rule R1
(full citations + exact wording in the harvest record; scratchpad caches of
extracted texts exist for CASPEH/Herring/Stories PDFs).

## 0. Design constraints (binding)

- R3 nesting: awareness=1.0, information=L0, all barrier costs=0, σ_T=0
  (degenerate threshold at 55.5) must reproduce current A/B/C within seed
  noise — automated invariant run before any new-behavior result.
- Every parameter below gets a variables.csv row BEFORE code (rule R1), with
  source, N, exact statistic wording, transform, sweep range.
- perceivedRisk is a NEW causal channel. It is NOT a revival of
  health_risk_multiplier (hard-coded 1.0, setters deleted), age_rr /
  comorbidity_rr (placeholders), or vulnerable_flag (unweighted reporting
  union). Decision D-3 (no weighted vulnerability index) is cited, not
  silently reversed: susceptibility here drives BEHAVIOR (departure/choice),
  never dose physics. This is the honest lineage paragraph the user's
  "prebuilt risk factor score" question requires: **no behavior-affecting
  risk score pre-exists**; the only behavioral vulnerability construct in
  the code is arm D's boolean mobility-priority admission gate.

## 1. Registry diff — new attributes (E2)

| Param | Value | Source (verified) | Sweep |
|---|---|---|---|
| P_AWARE_INIT | 0.356 (26/73) | Hines, Leickly, Petteni & Knowlton 2021, *Stories from the Outside: Oregon Wildfires 2020*, PSU HRAC, PDXScholar hrac_pub/27, N=73 unhoused Portland-area adults re THIS event: "nearly 65% did not hear about emergency shelters" (47/73 received no shelter info) | 0.25–0.47 (Wilson 95% CI) |
| P_ATTEMPT_GIVEN_AWARE | 0.385 (10/26) | same pie: ACCESSED 10 / aware 26 — separates awareness from willingness | 0.2–0.6 (small-n) |
| heavyBelongings | bracket 0.108–0.46; midpoint DECLARED ASSUMPTION | floor: Ozarks 2024 unsheltered PIT (N=138, 10.8% cited dogs/property for skipping shelter); ceiling: CASPEH 2023 (42% belongings confiscated ≤6 mo) / Herring et al. 2020 (46%, N=351). Mechanism anchor: JOHS spokesperson Theriault, Street Roots 2020-09-16 (verbatim quote in harvest) — supports decision LATENCY + abandonment threshold, not flat refusal | full bracket |
| hasPet | 0.117 | Henwood et al. 2020, unsheltered adults LA County 2019 (weighted; 12%/9.0%/11.7% over 2017–19). 48.1% of owners ever turned away over pet policy → caps the refusal branch | 0.055–0.12 (Cronley 2009 floor) |
| petIntake (per site) | UNKNOWN for 2020 smoke shelters — record SILENT (6 county releases + Street Roots checked; contrast: co-located Red Cross evac shelter "is also welcoming pets") | composite record check in harvest | sweep both {admit, refuse} |
| hasDependents | 0.0044 per adult (30/6,831) | HUD 2025 OR-501 Populations & Subpopulations: 30 unsheltered adult+child households / 6,831 unsheltered adults; adults-only intake verified verbatim (Street Roots: "the adults-only shelters saw 40 … nearly 90 …; nearly a dozen families with children [housed] in existing shelters") | 0.004–0.03 (0.022 = Pathways caretaker rate) |
| groupSpeedDelta | −0.04…−0.08 m/s per extra member | Moussaïd et al. 2010 (v = −0.04x+1.26 / −0.08x+1.24) | slope range; slowest-member rule = labeled bounding assumption |

Correlations: attributes sampled INDEPENDENT, declared (no correlation data
exists for this population). All realized values logged in manifests;
byte-identity regime extended to the new draws (separate RNG substream, per
project rule).

## 2. Departure model (E3+E4) — replaces the bright-line latch

Per-agent logistic hazard:
u_i(t) = α + b_R·z_R(t) + w·officialCue(t) + s·socialCue(t) + θ_i − c_i
- z_R(t): dose-accumulating risk cue (half-life swept 12–72 h; Castillo 2023
  shows response to cumulative exposure days, not instantaneous PM2.5).
- Susceptibility: γ_vuln·(COPD, asthma, age 65+, mobility) enters z_R's
  weight; sign sourced (Coughlan, Huber-Stearns, Clark & Deak 2022, Oregon
  Wildfire Smoke Communications and Impacts, EWP Working Paper 111, UO/OHA,
  n=1,200 same-event Oregon survey, Scholars' Bank handle 1794/27179:
  vulnerable-household POSITIVE on protective action and on having been
  evacuated — CITATION CORRECTED 2026-07-30, previously misattributed to a
  nonexistent "Evers et al. 2022"; see registry V39 for the caveats),
  magnitude ASSUMPTION, swept 0…+0.5 log-odds. Asthma now legitimately enters susceptibility —
  U-19's negative-control invariant updates to: asthma affects departure
  timing only, never gait speed, never dose physics (assert both).
- c_i = Σ barrier costs (belongings, pet×petIntake, dependents×adults-only);
  anchors from Tanim et al. 2022 meta (per-barrier 0.10–0.42 log-odds).
- θ_i ~ N(0, σ_T²), σ_T swept 0.5–1.5, σ_T=0 = current model (R3 null).
  Var(θ):Var(b_R·z_R) ratio swept 1.0–2.0 (Kincade: persistent trait 31%
  importance > momentary cue 21%).
- b_R ∈ [0.25,0.55] (wide 0.2–0.8); w ∈ [0.6,1.7] (evacuation-order OR 4.21,
  Tanim). α fitted to E9 per-site occupancy target.
- Wachinger acceptance test (hard constraint): at maximum observed PM2.5 the
  high-barrier stratum must still show non-departure; a monotone risk-only
  trigger is forbidden by the risk-perception-paradox literature.

## 3. Awareness & information regimes (E5)

- UNAWARE (P=1−0.356): shelter in place, accrue exposure; convert via
  outreach-contact process (rate λ_outreach, swept; no direct source —
  ASSUMPTION, anchored loosely to "75% received no information during the
  wildfires") and optional L3 word-of-mouth (co-located AWARE agents; CUT
  FIRST under time pressure).
- L0 omniscient: retained comparator, relabeled "full-information,
  zero-friction upper bound."
- L1 (new default): knows LOCATIONS of known shelters only; discovers
  fullness on arrival → re-choose. Matches documented 2020 reality.
- L2 211-channel: query reveals availability + may grant transport
  (probability + latency params). Grounded: S1 "call 211 for space and
  transportation"; S2's 21-total-calls datum ⇒ uptake is a PARAMETER swept
  low, never assumed full.

## 4. Destination choice under uncertainty (E6)

V_j = −β_t·walkTime_j(ownSpeed) + β_s·ln(capacity_j) − barrierPenalty_j,
logit (or argmax+noise). Verified grounding: impedance dominates (Cheng,
Wilmot & Baker 2008: DIST t≈−6 in both models; supply term positive);
destination-TYPE choice is socio-demographic/informational (Mesa-Arango 2013);
public-shelter propensity floor 3.5% general population (Wong et al. 2020);
SES/age predict mass-care use, publicity alone inadequate (Mileti, Sorensen
& O'Brien 1992 — also a documented caution against the awareness-ONLY
reading of the 1.52× calibration). fillRisk-as-size-prior is DECLARED A
MODELING ASSUMPTION (no queue-avoidance estimates exist); β_f/β_t swept 1–2
orders of magnitude around Cheng's supply/distance MRS. The user-requested
tradeoff emerges endogenously: fast agents discount rejection risk at near
sites; slow/high-susceptibility agents prefer larger/less-contested sites.
On ARRIVED_FULL: update (site out; optional congestion-belief increment),
re-choose under the same rule. MAX_RETARGETS is re-justified or retired —
retries are now belief-driven decisions; closed-at-selection sites never
burn retries (U-16).

## 5. State machine & tests (E7)

States: UNAWARE(in place) → AWARE_IDLE → EN_ROUTE → {ARRIVED_FULL→re-choose,
SHELTERED}; refusal semantics per E6. Unit tests: awareness conversion,
hazard departure spread (no synchronous start), choice tradeoff (fast vs
slow agent, same map, different choices possible), arrival-discovery
re-choice, group speed, adults-only eligibility. Invariants added to
analyze_run: bed-sum (U-03), revised asthma negative control, R3
backward-compat run, terminal-state conservation + exposure-state-set check.

## 6. Predicted run matrix (E8) — predictions to register per R2 BEFORE runs

Arms (9 seeds each unless descoped): baseline-real {L1, aware=0.356,
barriers on, hazard departure} × {A,B,C,D}; then +AWARE, +INFO(L2),
+RIDES(L2 transport, rate λ), +BARRIER (pet/storage accommodated), and
D+AWARE+INFO ("coordination package"). L0 arms retained as upper bounds.

Registered predictions (directional, to be timestamped in the registry):
1. Access DROPS in every arm under baseline-real; arm A ceases to be
   capacity-bound (≈0.356×0.385 ≈ 13.7% attempt < 2,234/6,842 = 32.7%
   capacity) — A lands ~10–15% sheltered.
2. The B→C dispersion gain COMPRESSES (demand becomes awareness-limited,
   not door-limited); ordering A < B ≤ C survives.
3. The hour-16 minor spike produces PARTIAL early departure only; mass
   response aligns with the main episode (hour 79+) — the directive's
   required prediction.
4. The first-hour race STRETCHES/DISSOLVES under heterogeneous departure;
   B's equity gap shrinks without any intervention; D's reserve effect
   shrinks correspondingly (register: gap in baseline-real B < 24.3pp).
5. Coordination package (≈zero capital) ≥ C (capital package) on mobility
   gap and dose; comparable on total access only when +AWARE is included.
6. E9 validation: baseline-real historical config (2020 inventory ~1,400
   beds + OCC 99 + CJ 99 + Mt Scott standby, population ~2,000, real
   activation dates) reproduces aggregate ≈130/198 AND the site split
   ≈90/99 OCC vs ≈40/99 CJ — the split the omniscient model cannot produce.
   Ablation reports which mechanism (peripheral-site awareness, barriers,
   distance) carries the fit. A documented failure here is reported plainly.

## 7. Timeline vs freeze plan

- Spec + registry diff: DONE 2026-07-28 (this document; 6 days ahead of the
  Aug 3 spec deadline).
- Registry rows + sampler attributes + R3 harness: target Jul 30–31.
- E4–E6 implementation + unit tests: Aug 1–4.
- Baseline-real runs + E8 arms: Aug 4–7. E9 calibration: Aug 6–8.
- Aug 8 freeze: mentor draft with Phases A–C, D1–D4, E-layer spec + any
  preliminary baseline-real runs labeled preliminary.
- Descope ladder honored: L3 → +RIDES → +BARRIER → L2 → C-eq. Never cut:
  Phase A, claim linter, R3 invariant, L1 default, awareness attribute,
  possessions/pets/dependents with cited priors, U-27, U-08/E9.

## 8. Corrections to upstream documents surfaced by the harvest

1. 10-ROUND4-DELTA.md S4 conflates *Stories from the Outside* (N=73) with
   the LIP Unsheltered Survey (N=383, Zapata memo 2020-11-26 — zero wildfire
   content). Correct at citation time; round-4's "N=383" must not propagate.
2. BIBLIOGRAPHY.md:385 and TECHNICAL_REFERENCE.md:336 over-quote the survey
   as "clean-air shelters"; the source says "emergency shelters".
3. vulnerable_flag doc/code mismatch (NEW, camera-ready blocker): five doc
   locations define it as 55+/mobility/asthma/COPD (=52.4%) while
   OutcomeLogger.java:501-504 adds chronic_physical (=71.1% published).
   Fix the five strings or the predicate — decide with the U-07 verdict.
