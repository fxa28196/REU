# Full system audit — 2026-07-28

Method: 52-agent multi-phase audit (23 specialized auditors → adversarial
verification of every CRITICAL/HIGH finding by independent agents told to
refute them → completeness critic). 1,284 tool calls. 207 raw findings;
28 CRITICAL/HIGH findings adversarially verified: 24 CONFIRMED, 4 WEAKENED
(core holds, numbers corrected), 0 refuted outright. Scope: critique Part III
(temporal architecture — previously unverified), the integrity of the
ec9b208 critique response itself, propagation status of action items 5–30,
and deliverable readiness against the 2026-08-09 / 08-14 / 08-23 deadlines.

Verdict in one sentence: **the science shipped at ec9b208 survives adversarial
re-verification almost exactly, but not one of its results has reached any
deliverable — the chapter, README, presentation and presenter script still
assert the attribution the POOL control refuted — and the audit found a
previously unknown temporal fact that reframes the whole exposure story.**

---

## 1. The dominant finding (CRITICAL, verified)

**No deliverable incorporates any ec9b208 result.** Greps for
POOL/dispersion/scenario D/min-cost/triage across the chapter tex,
`PRESENT_DAY_THREE_ARM_RESULTS.md`, `TECHNICAL_REFERENCE.md`,
`docs/final/presentation/index.html` and `README.md` return zero substantive
hits. The abstract (`Capacity_Is_Not_Access.tex:43`) still reads "Spending
that identical capacity on ten better-placed sites shelters 96.0%" and
tex:691–705 still calls the ranking "unambiguous" — the exact attribution D1
disproved (ten random sites from the same pool reproduce C's count
run-for-run). The chapter's future-work section (tex:953–956) even proposes
scenario D as not-yet-done work, though it was run and archived at ec9b208.
Every reviewer-facing claim is therefore currently *behind* the project's own
verified state.

## 2. New findings of this audit (not in the critique, not in 00-RESPONSE)

### 2.1 The evacuation is decided by a 6-hour transient, ~2.5 days before the smoke episode begins (CRITICAL, verified)

Recomputed from the raw AQS series with SmokeField's own filter: the Multnomah
hourly mean crosses 55.5 µg/m³ at **h16 (82.5 µg/m³) and stays above only
through h21** (max 112.1); **h22–h78 are 57 consecutive sub-threshold hours**
(min 3.2 µg/m³); the episode proper starts at h79 and peaks at h140
(562.7 µg/m³). All 6,842 agents depart at tick 960 = h16 and the last arrival
across all 27 runs is h32.9. So 100% of the race — and therefore the entire
equity result — resolves inside a small first spike carrying **0.85%** of the
312-hour concentration integral, 46+ hours before the main smoke arrives. The
"194 of 312 hours" framing conceals this two-spell structure. No published
document states it.

### 2.2 "Inhaled dose halves again" is a property of the window, not the policy (CRITICAL, verified; critique A.2 arithmetic corrected)

Reconstructing the dose integral from agent trajectories (validated: the
reconstruction reproduces recorded 312-h doses to ratio 1.0000): B/C mean-dose
ratio is **1.99 at 312 h, 1.56 at an episode-aligned 72 h, 1.25 at 24 h**.
Walking's share of C's dose benefit over B is **62% at 24 h, 51% at 72 h,
2.7% at 312 h** (the walking excess is a constant ≈41.4 µg; only the
headcount term grows with the window). The critique's mechanism is right but
its arithmetic is wrong: the gap scales with the post-closure concentration
integral ∫C dt, not with elapsed hours (a 72-h truncation shrinks the A−C gap
~37×, not ~4×). Absolute µg and person-hour figures must carry the window
length in the same sentence, or be replaced by ratios + share-sheltered.

### 2.3 Dead time, exactly quantified (HIGH, verified)

Last arrivals (seed 42): A h23.8 / B h24.0 / C h25.7; last motion h34.5–37.1;
across all 27 runs the global last arrival is tick 1973 = h32.9 (seed 46).
88–92% of the run is post-assignment dead time and **98.8% of the exposure
integral accrues after assignment closes**. The state machine is *provably*
quiescent after closure (SHELTERED absorbing, no discharge, availability
monotone). The model's output is an assignment, not a trajectory; the docs
should say so and report closure time per arm.

### 2.4 The mobility gap is a first-hour race (HIGH, verified) — survival analysis run

Cumulative incidence computed from all 27 runs (administrative censoring
only): **80% of B's final 24.31 pp mobility gap already exists one hour after
departure.** C's gap overshoots to 137% of its final value at 30 minutes,
then slow walkers claw back ~5 pp by filling residual well-placed beds.
D-r15 inverts the gap (−13.3 pp). This confirms the race dynamic as the
mechanism and directly motivates the reserve-bed rule. No published document
reports any time-to-event result (critique A.6 confirmed).

### 2.5 The published mobility marginal is analytically unreachable (HIGH, verified, new — beyond D15)

`PopulationSampler.java:87-88` constants (0.152163/0.347802) were solved
against the 2019 PIT 55+ share (0.2036), but line 60 now uses Pathways age
weights giving P(55+) = 0.2615 — so the coded expectation is **0.2033, not
the "0.192 held exactly"** claimed at :82-83, :366 and `variables.csv`.
Realized seed-42 value 0.1988 (z ≈ −0.9 vs 0.2033); the pooled nine-seed
20.4% excludes 0.192 (z ≈ 7.6). The published "coded 19.2 / realized 19.9"
story is internally inconsistent and needs re-derivation (+ re-run or reword).

### 2.6 False verification statements found *inside* the verification apparatus (HIGH, verified)

- **00-RESPONSE R5 is itself wrong**: the refused-then-retry path *does*
  execute in reported runs. The refusal-sum identity breaks by exactly 18 in
  C-seed44 and C-seed49 (two retarget-cap re-entries each, both agents later
  shelter — Bybee Lakes, door_refusals reset to 0) and by 9–63 in all D runs.
  R5 checked seed 42 only — the same seed-42-as-global error the response
  criticizes elsewhere.
- **"Last arrival in any run is tick 1,539 (h25.7)"**
  (`06-equity-scales.md:262`, `00-RESPONSE.md:729`) is seed-42-only; the true
  max is tick 1973 (h32.9, seed 46). Conclusion survives (still 107 h before
  the peak).
- **`TECHNICAL_REFERENCE.md:2229`** claims test_routing.py "reproduces Java
  distances exactly; all pass" — running it today FAILS (V11 staleness for
  retargeted agents, a limitation already disclosed at
  `FINAL_SYSTEM_AUDIT.md:144`; the two docs contradict each other).
- **"37/37 checks pass … across all 27 runs"** (`index.html:830`,
  TR:2233): the true counts are 32+2n = 104 (A/B) / 124 (C); no analysis
  report exists for any of the 27 production runs; 37/37 belongs to the old
  2-shelter baseline.
- **"The registered sensitivity test"** (`index.html:423`,
  `PRESENTER_SCRIPT.md:294-296` "we tested") was never executed:
  `NODE_SITE_TOLERANCE_M=100.0` is a hard-coded static final, no batch file
  exposes it, and all 101 manifests record the identical value.
- **"Refuses to start … lacks a resolvable DOI"** (`index.html:841`,
  TR:25-28): the gate tests non-emptiness only; 'D99'/'TODO' pass.

### 2.7 The chapter contradicts the project's own record (HIGH, verified)

`Capacity_Is_Not_Access.tex:46` (abstract): "No observational occupancy
record could be located" — while README:64, TR §13.6 and the presentation all
report the Street Roots 2020-09-16 record (~130/198) and the 1.52× (truly
1.5–15.6×, D7-censored) over-prediction. The submitted chapter denies the
record its own repo uses for calibration.

### 2.8 Reproducibility chain of the ec9b208 runs (HIGH, verified)

- All 26 new-run manifests stamp **696472a — a commit that cannot reproduce
  them** (it predates triageReserveFraction/scenarioCode 7; the runs executed
  the tree committed only at ec9b208).
- The 8 archived D manifests carry a **false `git_working_tree_dirty=false`**:
  the mtime heuristic (`OutcomeLogger.java:377-395`) was defeated by running
  from a copied project directory. The concurrent CR/CP runs correctly say
  dirty=true. Replace the heuristic with `git status --porcelain`.
- The 18 C-random/POOL control runs — the evidence behind the headline
  dispersion null — have **zero in-repo run outputs** (they live only in
  gitignored `Geography/output/`). Archive at least their simulation.json +
  shelters.csv.
- D-seed43/44 archives omit agents.csv (undisclosed, though the 3-seed means
  are recomputable from simulation.json alone — verified).
- `scripts/analysis/__pycache__/upper_bound.cpython-314.pyc` is committed.

### 2.9 What re-verification of ec9b208's science found: it holds

- **claims-recompute**: every headline number reproduces exactly from primary
  run outputs — POOL identity (6,570/6,565/6,566), the full decomposition
  (+306 = 100% dispersion; walk −9,470 m all optimisation), pooled equity
  gaps (12.54/24.31/13.40), D17 (14–25, mean 19.1), D5 identities. Two
  presentation defects inside 00-RESPONSE itself: the D5 slope range
  "278.16–278.30" excludes all nine B runs (true 278.16–278.69), and the
  scenario-D "three-seed means" table prints seed-42 counts (6,264/382/108)
  where the true means are 6,261/387.3/119.0 (load-bearing claims unaffected).
- **upper_bound.py** (behind R1/R2): solvers mathematically sound, complete,
  deterministic; numbers reproduce live. One unguarded trust of the stale
  `network_dist_to_shelter_m` field (empirically inert at seed 42).
- **equity_scales.py / crandom-pool builder / D batch generator**: formulas
  correct (Wilson/Newcombe/Katz/Woolf verified against textbook forms); the
  POOL control is a verbatim, self-verifying reconstruction of C's 498-node
  candidate set; D at reserve 0 is byte-clean vs B. One methodological gap:
  pooling 9 seeds as independent rows understates CI widths by up to 46%
  (the script's own docstring flags it; the published doc doesn't).
- **Java diff at ec9b208**: triage arithmetic correct; zero-reserve
  byte-identity holds algebraically; no RNG-discipline violation; no
  scenario-code trap reintroduced. Gap: parameters.xml GUI text and TR's
  scenario table not updated for the 7 new codes; unrecognized scenarioCode
  still silently defaults to arm A.

### 2.10 Two corrections to 00-RESPONSE in the critique's favor withdrawn / adjusted

- **D11 is partially wrong**: the p-median objective *is* printed, with the
  60,000 penalty labeled as a tuning constant, in TR §10.3 (:1682-1685).
  Accurate claim: "disclosed only in TR, absent from chapter/README/results."
- **D16's 2,492-node demand surface is the wrong figure**: the true p-median
  demand surface is 2,250 nodes.

## 3. Critique Part III scoreboard (verified against code and data)

| § | Claim | Verdict |
|---|---|---|
| A.1 | Data window ≠ simulation window; temporal confound A vs C | **Mixed.** Windows are identical (312 h, stated at TR:135/184). Resolution #2 true in substance (opening gate is a no-op in A/B/C — D18) but **no A-vs-C confound**: arm A also opens everything at tick 0. The "second bug" path *does* execute (histref, arm D, C seeds 44/49). Real gap: the two-spell threshold structure (§2.1). Spec table now computed. |
| A.2 | Race + dead time; window-scaled absolutes | **Confirmed in structure** (88–92% dead, 98.8% of integral post-closure), **arithmetic corrected** (scales with ∫C dt, not hours). Decomposition inversion confirmed (§2.2). |
| A.3 | Trigger latch unspecified; oscillation | **Refuted in code**: trigger re-evaluates every tick in PRE_EVAC, latches irreversibly on departure; oscillation impossible; moot in data (no EN_ROUTE agent exists at the h79 re-crossing). Confirmed: 55.5 has no behavioural source (registry calls it "convention choice"); chapter never defines the complement (TR does, A-02/A-07/A-21). |
| A.4 | No clock; 3 a.m. admissions; diurnal PM2.5 | **Confirmed**: date-granularity opening, 253 after-midnight admissions in C-seed42, real evening peak (20:00 mean 289, +48% vs 07:00 trough), fixed 16:00 departure schedules travel into it (+25% en-route concentration vs morning). Mitigations: A-20 documents 00:00 opening; the county's smoke-respite shelter really did run 24 h (DATA_SOURCES.md:49). |
| A.5 | Forcing n = 1 | **Confirmed open**: smoke CSV + start date are compile-time constants; no alternative episode ever run. The ±48 h shift is vacuous in A/B/C (everything opens at tick 0). |
| A.6 | No time-to-event reporting | **Confirmed** — and now computed (§2.4). |
| B.1 | Bed-equivalence sweep missing | **Confirmed open** — absent even from the action list. Infrastructure exists (scale-up code, batch generators). |
| B.2 | C-eq missing; objective utilitarian and mobility-blind | **Confirmed** (objective never touches mobility/speed/time); disclosure exists in TR only. |
| B.3 | "Registered" unearned; zero disconfirming results | **Mostly confirmed**: the "registered sensitivity test" was never executed (§2.6); registry publication clause refuted (CSVs are in-repo). Note: the C-random null IS a disconfirming result — but it's confined to critique-response docs. |
| B.4 | Gate never observed to fire | **Confirmed**: zero tests, zero CI, no JUnit dep; gate catches 11 malformations, misses source-resolvability entirely. |
| B.5 | External validity untested | **Confirmed open**; chapter's generalization paragraph is properly hedged, but no limitations list names single-county/single-event scope. |
| B.6 | Estimand never stated | **Confirmed** — nowhere, including the abstract. |
| C.1 | Units/beds/pods conflation | **Refuted in substance**: every facility carries raw_unit + capacity_basis; 2,234 = documented conversions (1,108 beds×1.0 + 341 motel×1.25 + 521 village×1.1 + 39 family×3.25); scale 3.062667…; largest-remainder pins totals. Survives: the ±7.5% band (2,068–2,401) is never propagated — arm A's 30.1% is honestly 27.6–32.5%. |
| C.2 | Geocode asymmetry favors C | **Confirmed as fact, refuted as force**: real sites snap median 40.8 m / max 318.6 m vs C's exact nodes — but error is common-mode across B/C's shared 36 sites; no headline moves. |
| C.3 | Snap gaps unreported | **Confirmed unreported, now computed**: agents median 27.7 m, 21.6% > 50 m, max 513 m. Only headline-scale snap pathology is D2's cross-component stranding (independently reproduced). |
| C.4 | RNG shuffle decides admissions | **Refuted quantitatively**: shuffle directly decides ≤ 8.0% (A) / 2.6% (C) of admissions (fill-tick admits only); arrival order — a modelled quantity — decides the rest; aggregate shuffle-invariant (sd 0.05 pp). |
| C.5 | Vacancy omniscience | **Mechanism confirmed** (`GisAgent.java:337-348`), disclosed in zero user-facing docs. Headcount concern refuted by R1's max-flow bound; **fully open for the 28.3% walking claim** — the one benefit still attributed to optimisation is measured entirely under perfect information. |
| C.6 | Smoke-field doubts | **Resolved in the model's favor**: 312/312 hours complete, zero interpolation ("measured, not modelled" is true); 310/312 two-monitor hours; 0/30 smokiest single-monitor; the 5.05/h puzzle is tri-county rows ÷ Multnomah hours. Latent defect: SmokeField returns 0 µg/m³ for any in-window gap (never fires on this data). |

## 4. Completeness critic — blind spots beyond the seven audited docs

1. `docs/final/README_RESULTS.md` still describes the **retired two-shelter,
   2,037-resident experiment** ("A — current placement / B — optimized") —
   fully superseded, public, contradicts the chapter.
2. `docs/final/readable/RESULTS_EXPLAINED.md` — linked from README:106 as the
   plain-language entry point — carries the refuted attribution and the
   tautology pull-quote, and is on no fix list.
3. **No verifier reconciles any published number to run data** —
   verify_2026_runs.py checks run-to-run invariants only; every stale number
   must be found by hand (this audit found many).
4. The two CRITICAL temporal findings are fixable by **zero-code re-runs**:
   `simulationHours` and `evacuationThresholdUgM3` are already runtime batch
   parameters — 24 h / 72 h window arms are pure batch-file jobs.
5. Inventory uncertainty (±7.5%) never propagated into the flagship 30.1%.
6. **The camera-ready build is not reproducible from the repo**: the tex has
   no `\graphicspath` and cannot compile in place; `overleaf 2/` (with
   svmult.cls + figures) is untracked; `SUBMIT.md` describes a chapter that
   no longer exists (6 figures named fig1_event…fig6_speed vs the actual 4:
   fig1_pm25, fig2_speeds, fig3_access, fig4_map; abstract word count stale).
7. Zero automated tests, zero CI on the model (14 .java files, no test
   sourceSet).
8. Ethics/licensing surface unaudited: complaint-derived campsite data,
   third-party PDFs under a root MIT license, no IRB/ethics statement
   anywhere (Part II §10 raised this; still unaddressed).

Also verified by goals-readiness: the author line is now internally
contradictory (tex:27 "Harrisburg University of Science and Technology" with
a hawkmail.hacc.edu address — HACC is Harrisburg Area *Community College*);
two bold placeholders (`[Pathways Study 2026 - full citation to be
confirmed]` tex:366, `[NSF award number to be inserted]` tex:971) will print
in the camera-ready PDF.

## 5. Prioritized plan against the calendar

Today is Tue 2026-07-28. Feedback 08-09 (12 days), symposium 08-14, camera-ready 08-23.

**P0 — this week, documentation (≈3–4 days, action items 5–22 plus new locations found here):**
1. Rewrite the C attribution everywhere ("more doors" for access; placement
   credit = walking −28.3% conditional on perfect information): chapter,
   README, PRESENT_DAY, TR, presentation, presenter script, RESULTS_EXPLAINED,
   README_RESULTS (retire or rewrite — it describes the dead experiment).
2. Kill the tautology in its now-**four+** locations (add TR:2098/TR:68 and
   RESULTS_EXPLAINED:51 to item 7's list).
3. Fix every false verification statement (§2.6) — these are the most
   dangerous class for a project whose brand is verification.
4. Resolve the abstract/calibration contradiction (§2.7) with the 1.5–15.6×
   bracket.
5. Fix author line, both bold placeholders, SUBMIT.md figure/abstract drift,
   `\graphicspath`/tracked-figures so the build reproduces.
6. Publish the temporal specification table + the two-spell threshold
   structure (§2.1) — one table, already computed.
7. Archive the 18 CR/CP simulation.json+shelters.csv; annotate the 8 D
   manifests (696472a stamp + false dirty flag); delete the committed .pyc.

**P1 — cheap science with outsized payoff (each ≤1 day, zero or minimal code):**
8. 24 h / 72 h window arms via `simulationHours` batch params — turns §2.2
   from a reconstruction into runs, and directly answers Part III A.2.
9. Bed-equivalence sweep of B (build_scenario script + batch generator
   exist) — the critique's #1 "policy-relevant number," kills the knife-edge.
10. Report the survival/cumulative-incidence result (§2.4) — already
    computed; it is the mechanism proof for the equity finding and scenario D.
11. Re-derive the mobility conditionals against Pathways weights (§2.5);
    decide re-run vs reword.

**P2 — before camera-ready if time permits:**
12. C-eq (equity-objective placement) — the critique's strongest novel-result
    suggestion; 2 days.
13. Information ablation for the walking claim (C.5) — or demote the 28.3% to
    conditional-on-perfect-information (1 h editorial).
14. Registry gate-fire test + resolvability check (items 24, 30); Pathways
    citation (item 23 — hard camera-ready blocker, start the search now).
15. Weld re-run decision (item 28): start now or defer with D2
    artefact-labelling (1 h fallback).

---

*Sources: workflow run wf_3235293d-d52 (52 agents, 207 findings, 28
adversarially verified). Full per-agent transcripts under the session
directory; raw findings JSON in the task output file.*
