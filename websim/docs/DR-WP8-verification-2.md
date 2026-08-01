# DR-WP8-verification-2 — independent acceptance gate on WP8, second attempt

**Verdict: NO-GO.**

Author: independent verification agent. No WP8 implementation work; no authorship
of `DR-WP8-verification.md` or of the previous contents of this file.
Date: 2026-08-01. Tree state: working tree at `5f10415` + 87 uncommitted entries.

> **Lineage note.** This file previously held the report of the gate that ran
> *before* the decision-layer wiring landed (it correctly found that
> `engine/src/sim.ts` had not been modified and that clause 3 was refuted). That
> pass is superseded: the wiring has since landed. Its baseline numbers are
> carried forward in the scoreboard in §1 so nothing is lost.

Method: every number below was produced by a command run in this tree. Where a
claim is numeric it was recomputed by a script written for this gate; where a
claim is "byte-identical" it was re-derived with this gate's own column
projection, own canonical encoding and own SHA-256 — **not** with the tree's
comparator.

---

## 0. The headline, stated first

The wiring landed. Every one of the five §8 acceptance clauses is now **MET**,
and clause 3 — the one the previous gate refuted — is met far more strongly than
the criterion asks: not "direction of effect" but exact, per-agent agreement with
the certified Java archive.

The blocker is narrower and entirely mechanical: **`npm run ci` still exits 1**,
for two independent reasons, and one of them is that the flagship R3 suite itself
is red.

The seven failing assertions all say the same thing. They were written to *pin
the defect in place* so it could not be forgotten; they carry comments telling
the next engineer to delete them once the fix lands; the fix landed without them
being deleted. Three of them literally print `expected 6842 to be +0`. So the
repository currently ships a red flagship suite whose redness is good news
encoded as a failure, and a release gate cannot distinguish that from a real
regression. That is exactly the ambiguity a gate exists to refuse.

Fixing it is a small, well-scoped edit to one file. Nothing in the model, nothing
in the arithmetic, nothing in the identity has to move.

---

## 1. Scoreboard

| # | Clause (§8, verbatim) | Verdict | Basis |
|---|---|---|---|
| 1 | Tier-2 own-engine R3 byte-identity (flagship) + closures-inert variant | **MET — and no longer vacuous** | §3 |
| 2 | gates (f)(g)(i)(k)(l) green | **MET** | §6 |
| 3 | ER/SE/SE2 presets reproduce archived direction-of-effect + counter identities | **MET — exactly, per-row** | §5 |
| 4 | measure-zero push result at documented severities reproduced | **MET on both sides** | §7 |
| 5 | `pushThetaThreshold` honesty note wired into presets/ledger | **MET** | §8 |

| Repository property | Gate 1 | Gate 2 (pre-wiring) | **This gate** |
|---|---|---|---|
| `npm run typecheck` | green | green | **green, exit 0** |
| `npm test` | green 87/1369 | green 87/1369 | **RED — 88 files, 1390 tests, 7 failed** |
| `npm run check:scratch` | RED (allowlist) | RED (leftover) | **RED — 1 leftover, different instance** |
| `npm run lint:claims` | green | green | **green — 0 hits / 367 files / 23 rules** |
| `npm run ci` | RED | RED | **RED, exit 1** |
| clean clone (`pipeline/out` absent) | RED, 2 suites broken | GREEN | **GREEN — independently re-proved (§9)** |
| oracle dumps intact | 477 MB | 477 MB | **477 MB / 500,062,249 B / 25 files — INTACT** |
| no test weakened / skipped / deleted | green | green | **green (§10)** |
| four never-regress gotchas | all fire | all fire | **all fire (§11)** |
| nothing changed outside `websim/`, `.github/` | — | — | **confirmed (§12)** |

---

## 2. The blocking finding

```
$ npm run ci
EXIT=1

  typecheck      exit 0
  npm test       exit 1   Test Files 1 failed | 87 passed (88)
                          Tests      7 failed | 1383 passed (1390)   357.43 s
  check:scratch  exit 1   (reached separately; npm test short-circuits it)
  lint:claims    exit 0   (reached separately)
```

### 2a. `npm test` — 7 failures, all in `validation/test/wp8-r3-own-engine.test.ts`

| # | Case | Assertion that fires |
|---|---|---|
| 1–3 | `arm {A,B,C}: the shipped pass is VACUOUS — Simulation never calls armResident` | `expected 6842 to be +0` |
| 4–6 | `arm {A,B,C}: SHIPPED E0-degenerate vs no-layer is byte-identical on all 57 shared columns` | `expected 1 to be +0` |
| 7 | `SECOND DEFECT: informationRegime = 1 cannot complete a run — Simulation has no L1 re-entry predicate` | `informationRegime = 1 completed a run: expected null not to be null` |

Every one of these is a **stale pin on a defect that has been fixed**, and the
file says so itself. At `wp8-r3-own-engine.test.ts:291`:

```
// If this ever goes red it is good news: the missing ContextCreator
// step-11 call site in engine/src/sim.ts has landed. Delete this case,
// and promote the `armed` cases below to the flagship.
```

and at `:457`:

```
// When this stops throwing the wiring has landed: replace the case with a
// real L1 assertion rather than deleting it.
```

Both conditions are now true. The instruction each comment gives was not carried
out, so the flagship suite is red.

Cases 4–6 are a second-order consequence of the same thing. The `strict`
projection compares all 57 shared columns *including* the six Phase-E columns.
Before the wiring those were empty on both sides, so `strict` passed; now the
E0-null side populates them, so `strict` legitimately differs on exactly those
six columns and nothing else. The suite already contains the correct successor
assertions and **they all pass** — `ARMED — the strict projection differs on the
six Phase-E columns and NOTHING else`, `ARMED — byte-identical over the
51-column e-appended projection`, and `ARMED — byte-identical at the archive's
own 47 x 6,842 dimensions`, on all three arms. The remedy is to retire the three
`SHIPPED …/strict` cases in favour of the `ARMED` ones that already exist and
already pass.

The other 23 cases in that file pass, including all three closures-inert arms,
the ER negative control, and the comparator's own able-to-fail proof.

### 2b. `check:scratch` — one stale leftover

```
$ npm run check:scratch
!! SCRATCH LEFT BEHIND — 1 violation(s) under websim/pipeline/out.
!! LEFTOVER: websim/pipeline/out/.tmp-registry-gate-KFL1cb
EXIT=1
```

Verified facts, because "just delete it" is the kind of advice that destroys
evidence when it is wrong:

* it is an **empty directory** — `ls -laR` shows no files and no subdirectories;
* its mtime is **Aug 1 01:35**, which predates every command this gate ran;
* it is created by `pipeline/test/build-registry.test.ts:34`,
  `mkdtempSync(join(OUT_DIR, ".tmp-registry-gate-"))`, at **module scope**, and
  removed by an `afterAll` at `:36–38`;
* my own full CI run (03:41–03:47) created and correctly removed its own
  instance — re-running `check:scratch` after all of this gate's work still
  reports exactly **1** violation, the same one.

So this is debris from an interrupted earlier session, not from the WP8 change
and not from this gate.

**It is a latent recurrence, not a one-off.** Because `mkdtempSync` runs at
collection time and cleanup runs in `afterAll`, any run that collects that file
but does not complete its suite — an interrupt, a crash, a `-t` filter matching
nothing — leaks a directory that permanently reddens `check:scratch`. Moving the
`mkdtempSync` inside the suite, or allowlisting `.tmp-registry-gate-*`, closes
the class rather than the instance.

**I did not delete it.** The standing instruction for this workspace forbids
removing anything under `pipeline/out/`, and the tool's own suggested remedy
(`--clean`) is explicitly banned here because it would take the 477 MB oracle
corpus with it. Clearing one empty directory is the operator's call, not the
gate's.

---

## 3. Clause 1 — the flagship R3 identity, independently re-derived

This was the highest-risk item: the wiring change touched `sim.ts`, `world/` and
`agents/`, which is precisely the code the identity depends on.

**Method.** For each arm, two full runs at **n = 6,842 / 312 h / seed 42** via
`runHeadless` with **no `beforeRun` hook** — i.e. the shipped path, with the
harness's arming seam unused. Own CSV parse; shared-column projection; my own
exclusion rule (`sim_id`, `commit`, and a wall-clock name regex — `*_local`
columns deliberately **kept**); rows key-aligned by `agent_id`; SHA-256 over the
canonical text. `harness/r3-identity.ts`, `checkR3`, `dropCsvColumns` and
`Checks` were not used.

### 3.1 The layer is genuinely live on the shipped path

```
E0_null_A     enableDecisionLayer=1  armedResidents=6842  decisionConfig=SET
A_present_day enableDecisionLayer=0  armedResidents=0     decisionConfig=null
```

`engine/src/sim.ts:302` now calls
`armResident(residents[i]!, this.decisionConfig, da)` inside the constructor's
ContextCreator-step-11 pass. This is what the previous gate found missing.

### 3.2 The three projections, arm by arm

| arm | projection | agents dims | shelters dims | identical? |
|---|---|---|---|---|
| A | strict | 57 × 6,842 | 12 × 36 | no — **only** the 6 Phase-E columns, 6,842 rows each |
| A | e-appended | 51 × 6,842 | 12 × 36 | **yes** |
| A | archive-shaped | 47 × 6,842 | 11 × 36 | **yes** |
| B | strict | 57 × 6,842 | 12 × 36 | no — same 6 columns only |
| B | e-appended | 51 × 6,842 | 12 × 36 | **yes** |
| B | archive-shaped | 47 × 6,842 | 11 × 36 | **yes** |
| C | strict | 57 × 6,842 | 12 × 46 | no — same 6 columns only |
| C | e-appended | 51 × 6,842 | 12 × 46 | **yes** |
| C | archive-shaped | 47 × 6,842 | 11 × 46 | **yes** |

My hashes, arm A (E0-null side vs no-layer side):

```
e-appended     agents   f84b646be758c7a682f842b224f99470b2352b9d7bb1080be32680ae3fc4c93c  (both)
archive-shaped agents   cbc163d1e8b9f9b4ada62d0ed4f516e69ed61b010c1e68cda74bfc78263f813b  (both)
archive-shaped shelters 8e9c399705b23013dde3f88fa0bf93836171e5c100b0f3256bcd706fc02d6bd1  (both)
strict         agents   43d21e8f…  vs  1c948d1c…   (differ)
strict         shelters b420e74d…  ==  b420e74d…   (identical)
```

Arm C archive-shaped agents, both sides:
`87111b6ae4a4330390f9cd20b96f33185c05a90e0472b305fdc8def0e2758183`.

The `strict` difference is named exhaustively by my own column walk:
`aware_initial`, `aware_tick`, `heavy_belongings`, `has_pet`, `has_dependents`,
`theta_z` — 6,842 rows each, and **nothing else**. That is the writer-generation
artefact the reference projections exist for.

The census is identical on both sides of every pair
(A: `SHELTERED 2060 / REFUSED_ALL_FULL 4754 / UNREACHABLE 28`;
B: `6264 / 550 / 28`; C: `6570 / 244 / 28`).

### 3.3 Negative controls still differ

| control | archive-shaped identical? | columns that move |
|---|---|---|
| ER (baseline-real) layer, same geometry/seed | **no** (correct) | 23 outcome columns |
| E0-null at seed 43 vs the seed-42 reference | **no** (correct) | 40 columns |

Hashes differ in both cases (`cad56332…` and `062ffb7d…` against the reference
`cbc163d1…`).

### 3.4 Closures-inert variant

Green in CI on all three arms, with the witness intact: schedule loaded
(72 scheduled edges, 72 matching graph edges, 6 waves, all inert),
`wavesApplied = 0`, `closureVersionAtEnd = 0`, `blockedEdgesAtEnd = 0`, and
`residentsWithRouteNodes > 0` on the closures side against 0 on the reference —
so the runtime really was built and really did nothing.

---

## 4. The decision layer is reached, and the gate that says so is real

`armResident` has a genuine call site (`engine/src/sim.ts:302`), plus the harness
seam at `validation/src/harness/r3-own-engine.ts:299` and the test harness at
`engine/test/decision/harness.ts:187`.

**A clause that is true but ungated is how this defect survived the first time,
so I reverted it and watched.** I replaced the call with
`void da; void armResident;` (the faithful "no call site" state), ran the
designated gate, and restored the file — verified by SHA-256 both ways
(`3c5636d9aa8f1a71405b06f4108c47ffb6b4945187bf77308d53cf7d30020037` before and
after).

Under the revert, `engine/test/decision/wiring.test.ts` goes **red — 5 failed /
10 passed**:

```
× Simulation arms EVERY resident, with that one instance by reference
    AssertionError: armResident was never called: expected +0 to be 8
× arms in CREATION order, so each private stream carries its own seed
    TypeError: Cannot read properties of null (reading 'decisionSeed')
× informationRegime = 1 (L1) … completes a run, and really does take the L1 re-entry branch
    AssertionError: the L1 re-entry predicate was never consulted: expected 0 to be greater than 0
× counts policy refusals under the ER policy (archive: 495-709, port was 0)
    TypeError: Cannot read properties of null (reading 'hasPet')
× the E0 null … runs the legacy latch, arms every resident aware, and never converts one
    AssertionError: expected +0 to be 8
```

The gate is genuine. It also runs entirely on a synthetic four-node line graph,
so an absent oracle dump cannot silently retire it — the right design for a gate
that exists because a clause went unnoticed for a whole work package.

---

## 5. Clause 3 — refuted last time, now met exactly

The previous gate refuted this clause because the port reported
`sheltered = 2060` for all three scenarios (they were all the same legacy run)
and `policy_refusals = 0` against 495–709 archived.

I recomputed both sides myself: archived `agents.csv` / `shelters.csv` read
straight off `docs/runs/` (read-only), port runs from the matching presets on the
shipped path, own CSV parse, own aggregation.

| run | port sheltered | archive sheltered | ratio | port `policy_refusals` | archive | port unreachable | archive |
|---|---|---|---|---|---|---|---|
| `phase-e/ER-A-n6842-seed42` | **1215** | 1215 | 1.000× | **541** | 541 | 4 | 4 |
| `scenario-e/SE-E18-seed42` | **1252** | 1252 | 1.000× | **543** | 543 | 9 | 9 |
| `scenario-e-v2/SE2-E18-d1-seed42` | **1307** | 1307 | 1.000× | **709** | 709 | 9 | 9 |

* the three scenarios no longer all shelter 2060 — distinct `[1215, 1252, 1307]`;
* `policy_refusals` is non-zero on every run whose archive records it non-zero;
* the **full state census** matches the archive term for term on all three, e.g.
  ER-A: `{UNAWARE 4414, SHELTERED 1215, PRE_EVAC 1208, UNREACHABLE 4, REFUSED_ALL_FULL 1}`
  on both sides.

The clause asks only for *direction of effect plus counter identities*. What is
actually delivered is exact agreement. See §13 for the per-row attack on this.

---

## 6. Clause 2 — the ported gates

```
[wp8-gates] 60 archived runs -> 594 passed, 0 failed, 9 skipped (603 checks);
            per family {"E0":45,"ER":45,"SE":126,"SE2":225,"SE2nc":81,"SEnc":81}
```

* `validation/test/wp8-archive-gates.test.ts` — 13 tests, green, over 60
  Java-produced run directories the port did not create.
* `validation/test/wp8-gate-corrosion.test.ts` — 41 tests, green: each gate is
  required to go red when the field it owns is corrupted.
* `engine/test/wp8-mutation-guards.test.ts` — 12 tests, green;
  `beyond-oracle branches exercised: 13/13`.
* Parameter census holds: 21 E-parameters everywhere, 7 SE in the SE families,
  manifest totals exactly `{33, 40, 41}`.
* Gate (k) reproduced against the live network for all five committed schedules;
  gate (l) reaction oracle: 463 rows asserted, 567 identity checks.

---

## 7. Clause 4 — measure-zero push, both sides

**Archive side** (`wp8-archive-gates.test.ts`): 48 counter-carrying runs, all
four Scenario-E counters zero in every one, `residentsBlocked = 0`, of which 24
are closure runs (9 at `closuresCode 1`, 15 at `closuresCode 3`).

The previous gate accepted this on the archive side only and flagged that the
port's own reproduction was on a different trajectory set. I closed that gap: I
ran the port's own severe presets at the documented severities and summed the
four counters from the emitted `agents.csv` myself.

| preset | closuresCode | smokeSeries | pushThetaThreshold | blockages | push_throughs | reroutes | stuck_events |
|---|---|---|---|---|---|---|---|
| `SE_severe_v1_E18` | 1 | 1 | −0.25 | 0 | 0 | 0 | 0 |
| `SE_severe_v1_E19` | 1 | 1 | −0.25 | 0 | 0 | 0 | 0 |
| `SE2_worst_plausible_E18_d1` | 3 | 2 | −0.25 | 0 | 0 | 0 | 0 |
| `SE2_worst_plausible_E18_d2` | 3 | 2 | −0.25 | 0 | 0 | 0 | 0 |

The port reproduces the measure-zero result on its own runs, at the documented
severities. Clause 4 is met on both sides.

---

## 8. Clause 5 — the `pushThetaThreshold` honesty note

* **Ledger**: `PROVENANCE_QUIRKS` in `shared/src/manifest.ts` carries
  `pushtheta-batch-zeroing` with `archivedExecutedValue: 0`,
  `presetValue: -0.25`, a verbatim-quoted note, an explicit impact statement and
  five checkable sources.
* **Presets**: all four SE/SE2 definitions carry
  `quirkNotes: ["pushtheta-batch-zeroing"]` (`definitions.ts:427, 449, 471, 494`);
  the nine non-SE presets carry none, which is correct.
* `shared/test/preset-archive-parity.test.ts` — 29 tests, green, including the
  declared exceptions `SE_severe_v1_E18:pushThetaThreshold` and
  `SE2_worst_plausible_E18_d1:pushThetaThreshold`.

The ledger's impact claim — "the V51 decision rule never executed in any run", so
running a preset at −0.25 against an archive that executed 0.0 changes nothing —
is **independently corroborated** by §5 and §7 together: the port ran the SE/SE2
presets at −0.25 and matched the archive *per row*, with all four counters zero.
Had the parameter been live, that could not have happened.

---

## 9. Regression 2 — the clean-clone property: CLOSED

`describeGated` (`tools/artifact-gate.ts:79–101`) no longer passes the suite body
to `describe.skip`; the degraded branch registers a placeholder and drops `fn`
entirely, so a collection-time `readFileSync` in a gated suite can no longer
throw ENOENT past the gate and kill the file.

I re-proved this by running the proof fixture directly rather than trusting the
wrapper test:

```
$ node node_modules/vitest/vitest.mjs run --config tools/test/fixtures/artifact-gate-proof.config.ts
   Test Files  1 passed (1)
        Tests  1 passed | 2 skipped (3)          EXIT 0
   (loud "!! ARTIFACT-GATED SUITE SKIPPED" banner for proof:absent AND for
    proof:collect-read — no ENOENT anywhere)

$ WEBSIM_REQUIRE_ARTIFACTS=1 …same command…
   × policy proof — artifact hidden > REQUIRES artifacts (proof:absent)
   × policy proof — hidden artifact read at collection time > REQUIRES artifacts (proof:collect-read)
   Test Files  1 failed (1)   Tests 2 failed | 1 passed (3)   EXIT 1
```

Both directions hold, and the `proof:present` gate **runs and passes in both
modes** — so the policy is not degenerate "fail everything" or "skip everything".

**Real oracle assertions do execute.** In the full run the only gate banner
emitted anywhere was `unit:example`, the policy's own self-proving fixture. Every
real oracle suite ran: `oracle.trace` (12 tests over the 477 MB decision dumps),
`wp8-archive-gates` (603 checks), `trees.parity` (3,539,712 distances),
`volume.parity` (10⁷ draws × 5 seeds × 2 generators), `tier1.parity` (39 dumps).

---

## 10. Was any test weakened, skipped or deleted?

**No.** Four independent lines:

1. **Census direction.** Gates 1 and 2 both recorded 87 files / 1,369 tests. Now
   88 files / 1,390 tests. The tree **grew** by one file and 21 cases; the new
   file is `engine/test/decision/wiring.test.ts` (15 cases), the gate from §4.
2. **No skip markers.** Zero `it.skip` / `describe.skip` / `it.todo` /
   `test.skip` / `.only` in any test file. `tools/test/artifact-gate.test.ts:356`
   is a meta-test that scans for exactly these, and it is green. Vitest reported
   **0 skipped tests** in the full run.
3. **Tracked test files diffed against HEAD.** Of the seven tracked test files
   modified since `5f10415`, six have **zero** removed cases. One removal exists,
   in `engine/test/agents/step.units.test.ts`:
   `describe("the legacy step refuses to execute a Phase-E transition") / it("throws when a resident carries decision attributes")`,
   which asserted `expect(() => stepResident(a, w, 1)).toThrow(/WP8/)` — a
   WP7-era *not-implemented-yet* guard. It was replaced by seven cases including
   `"the layer is an overlay: a resident with attributes but no config is legacy"`,
   `"executes latch site B when decisionConfig is null"`,
   `"takes ZERO decision-layer transitions over a full E0-null episode"` and
   `"the guard itself is provably able to fail"`. That is a not-yet-implemented
   guard becoming a behavioural specification, not a relaxation.
4. **The strongest evidence is the failure itself.** Nothing was loosened to make
   the tree green, because **the tree is not green**. The seven stale assertions
   were left at full strength and are failing.

No assertion got looser.

---

## 11. The four never-regress gotchas — all executed, all fire

Probed by running the code, not by reading it.

| # | Gotcha | Result |
|---|---|---|
| 1 | the V39 citation is Coughlan, Huber-Stearns, Clark & Deak 2022 and only that | fed the retired surname with "et al. 2022", rule `banned-citation` fires; fed the bare surname alone, rule `banned-citation-mention` fires; the correct Coughlan sentence is clean |
| 2 | no LA-wildfire severity-comparison phrasing | fed the "comparable to the … worst hour" form, rule `banned-severity-comparison` fires; fed the "…-equivalent counterfactual" form, it fires again; the bare place name alone trips `banned-severity-mention`; the Canberra Florey anchor sentence is clean |
| 3 | `simulationHours ≤ slices − 1` **as a throw** | series 0: 575 accepted, 576 **throws**; series 1: 455 / 456 **throws**; series 2: 455 / 456 **throws** |
| 4 | Negative Repast constants declared `"double"` | `alphaHazard` and `pushThetaThreshold` (the only negative-valued preset params) → `"double"`; the same params at a positive value → `"number"`, so the rule is value-driven, not name-driven, exactly as `make_batch_params_E.py:113-122` |

`npm run lint:claims` is clean over the whole tree: 0 hits, 367 files, 23 active
rules, 4 quarantined paths.

---

## 12. Scope and evidence integrity

```
$ git status --porcelain          # from repo root
87 entries — every one under websim/ or .github/
0  entries anywhere else
```

`Geography/`, `docs/` (except this file), `scripts/` and the archived runs are
untouched. No mutating git command was run.

Oracle dumps after all of this gate's work:

| directory | size | files |
|---|---|---|
| `decision-fixtures` | **477 MB** (500,062,249 B) | 25 |
| `world-fixtures` | 153 MB (159,077,225 B) | 185 |
| `closure-fixtures` | 30 MB (30,803,801 B) | 21 |
| `smoke-severe` | 7,877 B | 1 |
| `pipeline/out` total | 824,106,793 B | 776 |

`decision-fixtures` is intact at 477 MB. Nothing was deleted; no `--clean` was
run; no `rm` touched `pipeline/out/`.

---

## 13. Adversarial refutation of this pass's most damaging claims

Default position: refuted unless independently reproduced.

### R1 — "clause 3 is met" is an aggregate coincidence

If the port merely reproduced *totals* while getting individuals wrong, clause 3
would be met on paper and worthless in practice. Attacked at row granularity
against the certified Java archive, all three runs, 6,842-key join:

| run | `final_state` | `shelter_reached` | `reached_shelter` | `door_refusals` |
|---|---|---|---|---|
| ER-A-n6842-seed42 | 0/6842 differ | 0/6842 | 0/6842 | 0/6842 |
| SE-E18-seed42 | 0/6842 differ | 0/6842 | 0/6842 | 0/6842 |
| SE2-E18-d1-seed42 | 0/6842 differ | 0/6842 | 0/6842 | 0/6842 |

### R2 — "`policy_refusals` matches" is a total that hides a wrong distribution

Attacked per site, all 36 shelters, all three runs: `policy_refused` differs at
**0** sites; 31–32 sites are non-zero in the archive
(`Clark_Center=50`, `Jeans_Place=50`, `Banfield_Motel_Shelter=29`, …).
`peak_occupancy`, `final_occupancy` and `refused_count` also differ at **0/36**
sites in all three runs.

**Both refutations fail.** The clause-3 agreement is per-row and per-site.

*Why this is credible rather than too-good-to-be-true:* the declared Java-vs-TS
divergence channel is the within-tick shuffle, and it can only bite where
capacity binds. These runs shelter 1,215–1,307 against arm A's 2,234 beds, with
`REFUSED_ALL_FULL = 1` — no shelter saturates, so the ordering channel has
nothing to act on. The WP7 arm-A slice, where capacity *does* bind, still shows
its 114 balanced `final_state` flips.

### R3 — "clause 1 holds" is vacuous again, because `step.ts` still takes the legacy branch

The most damaging possible failure: residents armed, but the tick loop still
running WP7 code, making the identity trivially true a second time. Attacked with
the engine's own branch probe on real 6,842 × 312 h runs:

```
E0_null_A            armed=6842  LATCH_A_FIRE=6842  LATCH_B_FIRE=0
A_present_day        armed=0     LATCH_A_FIRE=0     LATCH_B_FIRE=6842
ER_baseline_real_A   armed=6842  AWARE_INIT=2428 UNAWARE_INIT=4414
                                 HAZARD_BRANCH=563245  REENTRY_L1=11473
```

Latch site A is the layer-on site, site B the layer-off one — textually distinct
code paths that are byte-identical in effect by design. The armed E0-null run
takes site A for **all 6,842** residents and site B **zero** times; the layer-off
run is the exact complement. The ER run drives the hazard logistic 563,245 times
and consults the L1 re-entry predicate 11,473 times.

**Refutation fails.** The identity is now measured against a genuinely live
layer. Clause 1 is strictly stronger than it was before the wiring landed.

---

## 14. Non-blocking finding: stale doc comments now assert something false

Not release-blocking, and the claim linter cannot catch it, but it will mislead
the next reader and it contradicts running code:

| location | stale claim |
|---|---|
| `validation/src/harness/r3-own-engine.ts` module doc | "*it has **no call site in `engine/src/sim.ts`***"; "`SimulationOptions` has no `DecisionConfig` field at all" — it does, `sim.ts:152` |
| `validation/src/harness/r3-own-engine.ts:199–205` | "`Simulation` implements `StepWorld` **without** `anyUntriedReachableShelter`" — it now does |
| `validation/src/headless.ts:195–199` | same "no call site" claim |
| `validation/test/wp8-r3-own-engine.test.ts` header | "The `shipped` scenario therefore passes R3 **vacuously**" |
| `validation/scripts/wp8-armed-probe.ts`, `wp8-clause3-armed-diagnostic.ts`, `run-r3-own-engine.ts` | same |

These should be updated in the same edit that retires the seven stale assertions.

---

## 15. What has to happen for GO

1. **Retire the seven stale assertions** in
   `validation/test/wp8-r3-own-engine.test.ts`, exactly as their own comments
   instruct: delete the three `VACUOUS` cases; replace the three
   `SHIPPED …/strict` cases with the `ARMED` equivalents that already exist and
   already pass; replace the `SECOND DEFECT` L1 case with a real L1 assertion.
   Do **not** loosen `expectClean`, and do not delete the L1 case outright — it
   should become the positive assertion that L1 completes and consults the
   predicate.
2. **Clear `websim/pipeline/out/.tmp-registry-gate-KFL1cb`** — one empty
   directory, no files, operator action, *not* via `--clean`. Then close the
   class by moving `mkdtempSync` inside the suite or allowlisting
   `.tmp-registry-gate-*`.
3. **Re-run `npm run ci`** and confirm exit 0 with the census at 88 files and
   `decision-fixtures` still 477 MB.
4. Refresh the stale doc comments in §14.

None of this touches the engine, the arithmetic, or any identity. Everything the
acceptance criteria actually assert is already true and independently confirmed;
what is missing is that the repository does not yet *say* so without a red gate.

**A second accurate NO-GO, on a very short remediation list.**

---
---

# SECTION 3 — THIRD INDEPENDENT GATE ON WP8

*Appended by a third, independent gate agent. Sections 0–15 above are the prior
gate's evidence record and are left untouched. Everything below was re-derived
from the tree with this agent's own scripts and its own SHA-256; no number in
sections 0–15, and no number in any prior report, was reused or trusted.*

Tree state: `HEAD = 5f10415`, all WP8 work uncommitted (88 `git status` entries).
Date of gate: 2026-08-01.

---

## 3.0 The headline

**The suite was genuinely repaired, not quieted.** That was the primary question
put to this gate, and the evidence is unambiguous and one-directional: zero test
files deleted, zero skip markers introduced, exactly **three** `expect(...)`
lines removed across the entire tree — one of which was a landmine asserting the
defect, and two of which were **tightened**, not dropped. Assertion counts rose
in every single modified file. Eighteen new test files were added. No tolerance
moved. A new tree-wide scan now *forbids* the skip spellings outright.

**The verdict is nevertheless NO-GO, on one finding that no previous gate made,
and which this gate proved by experiment rather than by reading:**

> **Acceptance clause 1 is not gated on the shipped path.** With the engine's
> arming loop in `engine/src/sim.ts` completely disabled, the flagship
> `validation/test/wp8-r3-own-engine.test.ts` passes **24/24, green, exit 0**.
> The flagship cannot distinguish a run the engine armed from a run the engine
> did not arm. It is not measuring the shipped path; it is measuring the test
> harness's own re-arming.

This is the same *class* of defect as the original WP8 defect — an acceptance
claim whose gate is insensitive to the thing it names — even though the
underlying behaviour is, this time, genuinely correct. The substance of clause 1
is true; this gate confirmed it independently by another route (§3.5). What is
missing is that the flagship does not establish it.

---

## 3.1 Scoreboard

| # | Clause | Verdict | Basis |
|---|---|---|---|
| — | **Suite repaired, not quieted** | **CONFIRMED** | §3.2, §3.3 |
| 1 | Flagship R3 byte-identity on the **shipped** path, arms A/B/C, both negative controls differ | **NOT MET as worded** | §3.4 — proved by reverting the arming loop |
| 2 | Gates (f)(g)(i)(k)(l) green on the archived Java runs | **MET** | §3.6 |
| 3 | ER/SE/SE2 reproduce 1,215 / 1,252 / 1,307 and 541 / 543 / 709 | **MET — but ungated** | §3.5 |
| 4 | Measure-zero push at the documented severities | **MET** | §3.7 |
| 5 | `pushThetaThreshold` honesty note in ledger and presets | **MET** | §3.8 |

Command exit codes, all re-run by this gate on the current tree:

| command | result | exit |
|---|---|---|
| `npm test` | **88 files / 1384 tests passed**, 281.49 s | **0** |
| `npm run test:strict` | **88 files / 1384 tests passed**, 327.21 s | **0** |
| `npm run test:browser` | **3 files / 51 tests passed** (chromium, webkit, firefox), 4.20 s | **0** |
| `npm run typecheck` | clean, all 5 workspaces + tools | **0** |
| `npm run check:scratch` | `pipeline/out is clean — 12 produced entr(ies) allowed, test-tmp/ empty` | **0** |
| `npm run lint:claims` | `0 hit(s) in 0 file(s); 367 file(s) scanned against 23 active rule(s)` | **0** |
| `npm run ci` | full chain green | **0** |

`test:strict` returning the identical 88 / 1384 as `npm test` is itself
load-bearing: it means **no suite was artifact-skipped** in the ordinary run.
The strict flag had nothing left to turn red.

---

## 3.2 Every assertion removed or modified, and whether it should have been kept

Method: `git diff` against `5f10415` for tracked files, plus a full extraction of
the old tree (`git archive 5f10415`) and a set-difference of every `it(...)`
title and every `expect(...)` line, old versus new, per file.

**Test files removed from the tree: zero.** `git status --porcelain` reports **no
deletions at all** (`grep -cE '^ ?D|^D'` → 0). The file set went 72 → 90; the
`comm -23` of old against new is **empty**.

**Test titles removed tree-wide: one.** **`expect(...)` lines removed tree-wide:
three.** In full:

| # | Removed assertion | File | What it asserted | Legitimate? |
|---|---|---|---|---|
| 1 | `expect(() => stepResident(a, w, 1)).toThrow(/WP8/)` | `engine/test/agents/step.units.test.ts` (was: *"throws when a resident carries decision attributes"*) | That the legacy step **refuses** to run a resident carrying Phase-E attributes — a deliberate landmine pinning WP8-as-unimplemented | **YES.** It asserted the absence of the feature WP8 delivers. Keeping it would require the defect. Its successor is stronger: *"the layer is an overlay: a resident with attributes but no config is legacy"* → *"executes latch site B when `decisionConfig` is null"*, which asserts the real post-WP8 contract instead of a throw. |
| 2 | `expect(run.output).toMatch(/skipped/iu)` | `tools/test/artifact-gate.test.ts` | That the gate proof's output mentions a skip — anywhere, any case | **YES — and it was TIGHTENED.** Replaced by `expect(run.output).toMatch(/2 skipped/u)`: an exact count, case-sensitive. Strictly narrower. |
| 3 | `expect(run.output).toMatch(/1 failed/u)` | `tools/test/artifact-gate.test.ts` | That strict mode fails exactly one gate | **YES — forced and tightened.** The proof fixture gained a third gate (`proof:collect-read`), so the correct count is now 2. Replaced by `expect(run.output).toMatch(/2 failed/u)`. |

**No assertion should have been kept.** There is no fourth candidate: the
`comm -23` of every `expect(` line, old versus new, is empty for all seven other
modified test files.

`expect(...)` census per modified file — every one **increased**:

| file | old | new |
|---|---|---|
| `engine/test/agents/step.units.test.ts` | 45 | **69** |
| `engine/test/world/runconfig.bridge.test.ts` | 6 | 6 |
| `pipeline/test/build-registry.test.ts` | 34 | 34 |
| `shared/test/manifest.test.ts` | 41 | **66** |
| `shared/test/presets.test.ts` | 40 | **60** |
| `shared/test/schema.test.ts` | 44 | **70** |
| `tools/test/artifact-gate.test.ts` | 58 | **78** |
| `tools/test/fixtures/artifact-gate-proof.spec.ts` | 3 | **4** |

### The six retired cases in the flagship file

`validation/test/wp8-r3-own-engine.test.ts` is untracked at `5f10415`, so git
cannot diff it. Its own header names the six cases it retired, and the test
census corroborates the count exactly (§3.3):

- **`arm {A,B,C}: the shipped pass is VACUOUS`** (×3) — required
  `armedResidents === 0` and the six Phase-E columns blank on both sides.
  **Legitimate retirement.** These asserted the defect itself. They are false by
  design once the layer is armed.
- **`arm {A,B,C}: SHIPPED … byte-identical on all 57 shared columns`** (×3) —
  **Legitimate on its face, and the prior gate explicitly authorised it**
  (§15 item 1 above: *"replace the three `SHIPPED …/strict` cases with the
  `ARMED` equivalents"*). The replacements are genuinely stronger statements:
  the strict projection *differs on exactly `E_AGENT_COLS` and nothing else,
  on all 6,842 rows*, plus byte-identity at 51 columns and at the archive's own
  47 × 6,842. **However — this substitution is what created the §3.4 finding.**
  The `ARMED` cases run through the harness's re-arming path, and the `shipped`
  runs, which were the only ones exercising the plain engine path at full scale,
  went with the deleted cases. Nothing weakened; coverage of *one specific
  seam* nonetheless lost.

`expectClean` was **not** loosened — verified by reading it, not by report:

```ts
function expectClean(ck: Checks, what: string): void {
  expect(ck.failed.length,  `${what}\n${ck.failureReport()}`).toBe(0);
  expect(ck.skipped.length, `${what}: unexpected SKIP`).toBe(0);
  expect(ck.results.length, `${what}: check census`).toBe(12);
}
```

Both negative controls are intact and genuinely red-capable: the ER-layer
control requires `ck.failed.length > 0` **and** that the failure is specifically
`(a) agents.csv: shared-projection byte-identity`; the comparator control
perturbs one cell of one row (`1234.56` → `1234.560` — same number, different
text) and requires the comparator to notice.

---

## 3.3 Test census — every difference accounted for

| quantity | prior gate | now | delta |
|---|---|---|---|
| test **files** (vitest) | 88 | **88** | 0 |
| **tests** | 1390 | **1384** | **−6** |

**The −6 is exactly the six retired scaffolding cases in
`wp8-r3-own-engine.test.ts`, and nothing else.** Corroboration: that file now
reports **24 tests**; 24 + 6 = 30 would be the prior count, and the prior gate's
1390 − 1384 = 6 matches the six cases its own §15 item 1 instructed be retired.
No other file lost a test — the per-file title diff (§3.2) shows exactly one
other title removed (the `/WP8/` landmine), and that file's title count still
*rose* 12 → 16 because four new cases were added alongside.

File census reconciliation — 90 files on disk versus 88 run:

| set | count |
|---|---|
| `*.test.ts` under `{shared,engine,pipeline,app,validation,tools}/test/` — the vitest `include` | **88** |
| `tools/test/fixtures/artifact-gate-proof.spec.ts` — `.spec.ts`, deliberately outside `include`; run only by the child proof config | 1 |
| `engine/test-browser/cross-engine.digest.test.ts` — run by `npm run test:browser` | 1 |
| **total on disk** | **90** |

Per package: shared 6, engine 51, pipeline 16, app 1, validation 11, tools 3 = 88.

---

## 3.4 THE BLOCKING FINDING — clause 1 is ungated on the shipped path

### The experiment

`engine/src/sim.ts` SHA-256 before: `3c5636d9aa8f1a71405b06f4108c47ffb6b4945187bf77308d53cf7d30020037`

The arming loop at `sim.ts:292` was replaced with a dead branch:

```diff
  this.decisionConfig = resolveDecisionConfig(world, options.decision);
  let armed = 0;
- if (this.decisionConfig !== null) {
+ // GATE-PROBE: arming loop temporarily disabled to prove the suite catches it.
+ if (false as boolean) {
```

That is a total revert of the WP8 wiring: `armResident` is never called by the
engine, `armedResidents` is always 0, and `step.ts`'s `layer` flag is
unconditionally false — the exact defect the work package existed to fix.

### The results

| suite | result with arming DISABLED |
|---|---|
| `engine/test/decision/wiring.test.ts` | **RED — 5 failed / 10 passed (15)**, exit 1 |
| **`validation/test/wp8-r3-own-engine.test.ts`** | **GREEN — 24 passed (24), exit 0**, 297.4 s |

`sim.ts` was then restored from the byte backup and re-verified:
SHA-256 `3c5636…0037`, **identical**; `wiring.test.ts` back to **15/15 green**.

### Why the flagship cannot see it

Every armed pair in the flagship is constructed with `armDecisionLayer: true`:

```ts
const armed = await runOwnEngineR3PairAsync({ arm, armDecisionLayer: true, ...BASE });
```

which routes through `runR3Configuration`'s `beforeRun` hook:

```ts
beforeRun: o.armDecisionLayer
  ? (sim, world): void => { armed = armFromWorld(sim, world, o.config); }
  : undefined,
```

`armFromWorld` arms every resident from the harness's own rebuilt
`DecisionConfig`, **overwriting** `Resident.decisionConfig`. So the residents are
armed before tick 1 whether or not the engine armed them. The
`collect()` cross-check (`actuallyArmed !== armed → throw`) does not help: both
sides are 6,842 because the harness supplied both.

`validation/src/harness/r3-own-engine.ts` **already documents this hazard** in
its own module comment — this gate did not discover a hidden fact, it discovered
that a documented hazard is live:

> *"If the two construction sites ever drift, an `armDecisionLayer: true` run
> would silently measure the harness's coefficients instead of the shipped
> ones."*

Two consequences, both material:

1. **The flagship does not measure the shipped path.** The clause as stated —
   *"Arms A/B/C at n=6,842 / 312 h / seed 42 on the SHIPPED path"* — is not what
   the test does. With the `shipped` cases deleted, **no test** runs the full-scale
   R3 identity through the plain engine path.
2. **The byte-identity numbers are measured against harness-built coefficients.**
   Nothing asserts `armFromWorld`'s `DecisionConfig` equals `world.decisionConfig`
   field-for-field. Ironically, `sim.ts#resolveDecisionConfig` contains exactly
   that comparison (`firstDecisionConfigDelta`) and throws on a mismatch — but
   the harness path bypasses it by writing `Resident.decisionConfig` directly.

### Mitigation that is genuinely present

The regression is **not** silent at the suite level: `npm test` goes red via
`wiring.test.ts` (5 failures). A future removal of the arming loop *would* be
caught. The defect here is confined to the accuracy of clause 1 and to the loss
of full-scale shipped-path coverage — it is a **mis-stated and under-gated
acceptance claim, not a live behavioural defect**.

### The fix, which is small

Either would close it:

- Add one case per arm that builds the pair with **`armDecisionLayer: false`**
  (the plain shipped path — `runOwnEngineR3PairAsync` already supports it) and
  asserts `Simulation.armedResidents === 6842` on the null side and `0` on the
  reference side, then runs the same `expectClean` projections. This restores
  precisely what the deleted `SHIPPED` cases covered, without their false
  premise.
- Or assert, in `armFromWorld`, that its rebuilt `DecisionConfig` is
  field-for-field equal to `world.decisionConfig` before overwriting — which
  turns the harness path back into a cross-check of the shipped one.

---

## 3.5 Clause 3 — met, re-derived from raw bytes, but ungated

### Independent derivation, archive side

A standalone Python scorer (no project code imported) walked all **60** archived
run directories, counting `final_state == "SHELTERED"` in `agents.csv` and
summing `policy_refused` in `shelters.csv`:

| run | sheltered | policy_refusals |
|---|---|---|
| `phase-e/ER-A-n6842-seed42` | **1215** | **541** |
| `scenario-e/SE-E18-seed42` | **1252** | **543** |
| `scenario-e-v2/SE2-E18-d1-seed42` | **1307** | **709** |

Exactly one run in the archive carries each of `(1215,541)`, `(1252,543)`,
`(1307,709)` — the triple is unambiguous. The nonzero `policy_refusals` range
across all 51 E-layer runs is **304–709**; the 495–709 band quoted in the
acceptance text is the arm-A/E18 family specifically, which the per-run table
confirms (ER-A 541/536/515, SE-E18 543/501/495, SE2-E18-d1 709/585/620).

The old collapse is genuinely gone: **exactly 3 of 60** runs shelter 2,060, and
all three are the `E0null-A` runs, where 2,060 is *correct*.

### Independent derivation, port side

This gate re-ran the replay itself rather than reading `replay-report.json`:

```
[replay] ER-A-n6842-seed42   11.6s  sheltered 1215 (archive 1215)  policy 541 (541)  oor 0  counters 0/0/0/0
[replay] SE-E18-seed42       15.8s  sheltered 1252 (archive 1252)  policy 543 (543)  oor 0  counters 0/0/0/0
[replay] SE2-E18-d1-seed42   16.9s  sheltered 1307 (archive 1307)  policy 709 (709)  oor 0  counters 0/0/0/0
```

and then re-scored the **freshly written CSVs** with the same standalone Python
scorer used on the archive:

| run | metric | port | archive | match |
|---|---|---|---|---|
| ER-A-n6842-seed42 | sheltered / policy / unreachable / door_refusals | 1215 / 541 / 4 / 836 | 1215 / 541 / 4 / 836 | ✔ |
| SE-E18-seed42 | sheltered / policy / unreachable / door_refusals | 1252 / 543 / 9 / 834 | 1252 / 543 / 9 / 834 | ✔ |
| SE2-E18-d1-seed42 | sheltered / policy / unreachable / door_refusals | 1307 / 709 / 9 / 1152 | 1307 / 709 / 9 / 1152 | ✔ |

The only non-matching cells are the four Scenario-E counter columns on the
`phase-e` run, which the port emits as `0` and the archive **does not have at
all** (logger v1, 55 columns). That is the known writer-generation difference,
not a divergence.

**Determinism**: SHA-256 of the freshly produced `agents.csv` / `shelters.csv`
for all three runs is **byte-identical** to the previously written output.

### The gap

`grep` for `wp8-replay|archive-replay|replay-report|ER-A-n6842|SE-E18|SE2-E18`
across every `*.test.ts` finds **no test that asserts any of these numbers.**
Clause 3 is established only by `validation/scripts/wp8-archive-replay.ts`, a
script. The nearest test, `engine/test/decision/wiring.test.ts:403`, asserts
`policy_refusals` is non-zero on a synthetic **four-node, eight-agent** world —
a reachability check, not the archive reproduction.

This is the same "true but ungated" shape as §3.4, at lower severity: the
numbers are right, and this gate verified them, but nothing in CI defends them.

*Note:* `pipeline/out/wp8-replay/replay-gates.json` records `failed: 1` on every
run — gate (h), `git_working_tree_dirty is false` → `ABSENT`. The port's own
manifest omits that provenance field. Cosmetic against the archive gates (which
pass 594/0), but it means port-generated manifests do not satisfy gate (h).

---

## 3.6 Clause 2 — MET

Re-run by this gate, `--reporter=verbose`:

```
[wp8-gates] 60 archived runs -> 594 passed, 0 failed, 9 skipped (603 checks);
per family {"E0":45,"ER":45,"SE":126,"SE2":225,"SE2nc":81,"SEnc":81}
```

`594 + 9 = 603` ✔. Family counts sum to 603 ✔. Archive discovery independently
confirmed: `phase-e` 12 + `scenario-e` 21 + `scenario-e-v2` 27 = **60** ✔.

`wp8-archive-gates.test.ts` (13 tests) + `wp8-gate-corrosion.test.ts` (**41**
tests) = 54 passed, exit 0. The corrosion suite proves each of (f)(g)(h)(i)(k)(l)
can go red, including on *real archived bytes* (7 in-archive corrosion cases),
and — importantly — that gate (g) **SKIPS rather than passes** when the layer is
off, and that the driver **throws rather than silently skipping** gate (k).

---

## 3.7 Clause 4 — MET, both sides

- **Archive side**: `wp8-archive-gates.test.ts` asserts all four Scenario-E
  counters are 0 across every counter-carrying archived run, with an explicit
  in-test reconciliation of the 48-run population (42 SE/SEnc/SE2/SE2nc + 6 E0
  nulls) — it corrects a double-count in the spec prose rather than quoting it.
- **Port side**, measured by this gate in its own replay: `counters 0/0/0/0` on
  **SE-E18-seed42** (E18) and **SE2-E18-d1-seed42** (E18-d1), matching the
  archive exactly. E19 and d2 are covered on the archive side by the same
  assertion and on the port side through `engine/test/closures/wave.oracle.test.ts`,
  which reproduces every wave of `SE-E18` and `SE2-E18-d1` bit-exactly.

`oor 0` on all three replayed runs also confirms never-regress gotcha 3 holding
at full scale (no fabricated smoke hours).

---

## 3.8 Clause 5 — MET

Present in **both** required places, read directly:

- **Ledger** — `shared/src/manifest.ts:456`, `PROVENANCE_QUIRKS` entry
  `id: "pushtheta-batch-zeroing"`, `archivedExecutedValue: 0`,
  `presetValue: -0.25`, with the verbatim plan §6.4 note, an `impact` field
  stating it is inert (zero blockage events in all 24 closure runs), and five
  cited sources.
- **Presets** — `shared/src/presets/definitions.ts:161`,
  `PUSH_THETA_ARCHIVE_EXCEPTION`, attached to every SE and SE2 preset, keyed
  back to the ledger by `quirkNote: "pushtheta-batch-zeroing"`.

Asserted in tests: `shared/test/preset-archive-parity.test.ts:345-346` requires
`archivedParameters(...)["pushThetaThreshold"] === 0` for both SE and SE2.

---

## 3.9 Skips, tolerances, and configuration — nothing loosened

| check | result |
|---|---|
| `describe/it/test/suite.skip\|only\|skipIf\|runIf\|todo` in any test file | **none** — the 3 grep hits are prose inside comments (`oracle.trace.test.ts:168`, `checksums.test.ts:33`, `artifact-gate-proof.spec.ts:21`) |
| NEW: tree-wide bypass scan | `artifact-gate.test.ts` now **forbids** those spellings in every test file, with a comment-stripper, a single named exemption asserted by `toEqual`, an anti-vacuity seeded-match proof, and `expect(scanned).toBeGreaterThan(50)` so a broken walk cannot pass as clean |
| `expectClean` | 0 failed / 0 skipped / **exactly 12** checks — unchanged |
| `toBeCloseTo` removed | **none**; precisions in use are 4–15 digits |
| `TOLERANCE` / `TOLERANCE_M` / `toleranceRows` | `0.05` / `1e-7` / `0` — **byte-identical to 5f10415** |
| new `tol = 3.0 * se + ROUND_SLACK` | a **new** 3-sigma binomial tolerance in the **new** file `validation/src/harness/gate-g-census.ts`; derived, documented, and corrosion-tested (incl. the target-1.0 knife edge collapsing to 1e-4). Not a widening of anything |
| `.gitignore` | `git check-ignore` over every `*.test.ts` → **no test file is ignored**. The additions are generated Java build trees (`gen-src/`, `geo-inst-classes/`, `out-{probe,decision,closures}/`) |
| `check-scratch.ts` | +4 **named** registrations (`closure-fixtures`, `decision-fixtures`, `smoke-severe`, `wp8-replay`), each with its producing command. The allowlist is an explicit registry, not a wildcard; `test-tmp/` must still end empty |
| `artifact-gate.ts` skip branch | **strengthened**: a skipped gate now registers a placeholder `it` so the run *reports* an attributed skip, and the suite body is no longer executed — closing the collection-time-read hole that used to kill a whole file on a clean clone |

### The `testTimeout: 5_000 → 30_000` raise

Applied to all six package configs with a long measured rationale in
`websim/vitest.config.ts`. **This gate verified the safety claim independently
rather than accepting it**: the claim is that nothing in the tree uses a timeout
as an assertion. A grep for numeric `toBeLessThan` on time-shaped expressions
returns **exactly one** hit tree-wide —

```
validation/test/wp7-vertical-slice.test.ts:277:  expect(r.timings.runMs).toBeLessThan(60_000);
```

— which is an explicit budget carrying its own 120 s case timeout. The claim
holds. The raise changes only how long a hang is tolerated, never whether
anything passes.

---

## 3.10 The four never-regress gotchas — all present, all enforced

| # | Gotcha | Enforcement | Status |
|---|---|---|---|
| 1 | the V39 citation is **Coughlan, Huber-Stearns, Clark & Deak 2022** and only that; the retired surname is banned | `tools/claims.ts:51` (dated-citation rule) + `:67` (bare-name rule); proved failable by `tools/test/lint-claims.test.ts:33` | **FIRES** — `lint:claims` 0 hits over 367 files |
| 2 | no LA-wildfire severity-comparison phrasing (the v2 anchor is Canberra Florey, 2,496.1 µg/m³, 5–6 Jan 2020) | `tools/claims.ts:80` (comparison-phrase regex) + `:96` (bare-name rule); `lint-claims.test.ts:45,49` prove red, `:53` proves a non-comparative mention is allowed | **FIRES** |
| 3 | `simulationHours ≤ slices − 1` as a **throw** | `engine/src/smoke/series.ts` — `RunWindowOverrunError`, `maxSimulationHoursForSlices`; `engine/test/smoke/series.units.test.ts:147` asserts `toThrow(RunWindowOverrunError)` and `toThrow(/simulationHours <= slices - 1/u)` on the real SE-E18-seed42 config at 456 h, and a further case sweeps all three series | **FIRES** — plus `oor 0` observed on all three full-scale replays |
| 4 | Negative Repast constants declared **`"double"`** | `shared/src/schema.ts:1317-1369` — `RepastConstantType`, `repastConstantType()` promoting negatives from `"number"` to `"double"`, `negativeValuedParams()`; documented at `:37-48` and `:1336-1354` | **PRESENT** |

---

## 3.11 Evidence integrity and scope

**Oracle corpus — INTACT, nothing destroyed:**

| directory | size | required |
|---|---|---|
| `pipeline/out/decision-fixtures` | **477 MB** | ~477 MB ✔ |
| `pipeline/out/world-fixtures` | **153 MB** | ~153 MB ✔ |
| `pipeline/out/closure-fixtures` | **30 MB** | ~30 MB ✔ |
| `pipeline/out` total | 788 MB | — |

No `--clean` was run. Nothing under `pipeline/out/` was deleted. `check:scratch`
still exits 0.

**Scope — clean.** `git status --porcelain` from the repo root: 88 entries, and
filtering out `websim/` and `.github/` leaves **nothing**. `Geography/`, `docs/`
and the archived runs are untouched.

**Temporary mutation, fully reverted.** The §3.4 experiment modified
`engine/src/sim.ts` and restored it from a byte backup; SHA-256 before and after
are both `3c5636d9aa8f1a71405b06f4108c47ffb6b4945187bf77308d53cf7d30020037`.

**Derived state restored.** Re-running the replay for three runs had overwritten
`pipeline/out/wp8-replay/replay-report.json` with a single-run report; the full
12-run replay was re-run to restore it. Verified: 12 runs in the report.

---

## 3.12 Adversarial check on this gate's own claims

- *"Maybe the −6 hides a real deletion elsewhere."* Refuted: the per-file title
  set-difference is empty for every file except `step.units.test.ts` (one
  landmine), and that file *gained* four tests. The only file that can account
  for −6 is the flagship, which its own header says retired exactly six.
- *"Maybe the flagship passed with arming disabled because the gate skipped."*
  Refuted: it reported **24 passed**, not skipped, in 297.4 s — it did the full
  6,842 × 312 h work. And `expectClean` would have failed on
  `ck.skipped.length`.
- *"Maybe `wiring.test.ts` only went red incidentally."* It failed 5 of 15 with
  assertions naming the mechanism directly (`expected +0 to be 8` on
  `BR.AWARE_INIT`; `sim.residents.every(r => r.decision!.hasPet)` false). That
  is the gate working as designed.
- *"Maybe the archive numbers were read from a manifest the port also writes."*
  Refuted: this gate's scorer reads only `agents.csv` `final_state` and
  `shelters.csv` `policy_refused` — raw certified Java output. `policy_refusals`
  appears in no manifest key at all.

---

## 3.13 Verdict

# NO-GO

**Not because the suite was quieted — it was not.** On the question this gate was
principally convened to answer, the answer is clean: nothing was weakened, no
tolerance moved, no skip was introduced, no coverage was traded away, and the
one landmine assertion plus two count-assertions that changed were retired or
**tightened** for documented, verifiable reasons. The remediation the prior gate
demanded was carried out faithfully. Four of five clauses are met, and this gate
re-derived clauses 2–5 from raw bytes with its own scripts.

**The block is clause 1, and it is precisely the failure mode this gate was told
to hunt:** a clause that is true but ungated. The flagship
`wp8-r3-own-engine.test.ts` passes 24/24 with the engine's arming loop deleted.
It measures the harness's re-arming, not the shipped path, so the words *"on the
SHIPPED path"* are not supported by the artefact that is supposed to support
them. The substance is fine — this gate proved the shipped path correct at full
scale by a different route (§3.5) — but the flagship does not prove it, and the
`shipped` runs that once did were removed along with the six retired cases.

### Remediation for GO — small, and touches no engine code

1. **Restore shipped-path coverage in the flagship.** Add one case per arm built
   with `armDecisionLayer: false`, asserting `armedResidents === 6842` (null
   side) and `0` (reference side), then the existing `expectClean` projections.
   Re-run the §3.4 experiment and confirm the flagship now goes **red**.
   *(Alternative or additional: make `armFromWorld` assert field-for-field
   equality with `world.decisionConfig` before overwriting.)*
2. **Gate clause 3.** Promote the ER/SE/SE2 reproduction from
   `wp8-archive-replay.ts` into an artifact-gated test asserting sheltered
   1,215 / 1,252 / 1,307 and `policy_refusals` 541 / 543 / 709 against the
   archive.
3. **Optional, non-blocking:** emit `git_working_tree_dirty` in port-generated
   manifests so port output can satisfy gate (h) (`replay-gates.json` currently
   records `failed: 1` on all 12 runs for this one absent field).
4. Re-run `npm run ci` and confirm exit 0 with the census at **88 files** and
   `decision-fixtures` still **477 MB**.

**A third accurate NO-GO — on a shorter list than the second, and for a reason
neither earlier gate found.**

---

# SECTION 4 — FOURTH AND FINAL ACCEPTANCE GATE ON WP8

*Appended by a fourth, independent gate agent. Sections 0–15 and Section 3 above
are untouched. Every number below was produced by this agent's own commands,
its own Python scorer and its own SHA-256 manifest. No number from any prior
section or report was reused, and the STATE handed to this gate was checked
before it was believed — it was wrong (see §4.9, F4).*

Tree state: `HEAD = 5f10415`, all WP8 work uncommitted (**91** `git status`
entries, all under `websim/`). Date of gate: 2026-08-01.

---

## 4.0 The headline

**GO.**

The question put to this gate was not "are the clauses true" — three prior gates
established that, and this one re-established clauses 2–5 from raw bytes with a
scorer that imports no project code. The question was **"is each clause DEFENDED
BY A TEST, or merely true today?"**, because the original WP8 defect survived its
first gate with the tree at 1,369 green while a clause was measurably false, and
Section 3 then found clause 1 true-but-ungated by reverting the engine wiring and
watching the flagship stay 24/24 green.

This gate answered that question the only way it can honestly be answered: **by
breaking each clause and watching.** Nine separate defects were injected into the
shipped source — one or two per clause — and each was run against the suite that
owns the clause.

**All nine went red. There is no clause in the acceptance set that rests on
measurement alone.** The two remediations Section 3 demanded were both applied and
both are load-bearing: the flagship's new `SHIPPED` cases go red under exactly the
revert that used to be invisible to it, and `wp8-archive-replay.test.ts` now
carries the ER/SE/SE2 numbers as literals and goes red naming them.

Every injection was restored and restoration was proved by SHA-256 against a
pre-experiment manifest of **395 source files**: **395 / 395 OK, zero mismatches,
file set identical.**

Four findings are recorded below. **None is release-blocking.** The most
interesting is F1: the guard that Section 3's remediation added to `armFromWorld`
is itself an instance of the pattern this gate was sent to hunt — live, correct,
and asserted by nothing.

---

## 4.1 Scoreboard

| # | Clause | Defended by a revert-proof? | Injection | Result |
|---|---|---|---|---|
| 1 | Flagship R3 byte-identity, shipped path | **YES** | arming loop in `sim.ts` → `if (false as boolean)` | **RED 6/36** |
| 2 | Gates (f)(g)(i)(k)(l) on the archived runs | **YES** (×2) | (a) gate-(f) stratum predicate; (b) gate-(l) l.1 neutered | **RED 8**, **RED 2** |
| 3 | ER/SE/SE2 = 1,215/1,252/1,307 and 541/543/709 | **YES** | `wOfficial` coefficient × 0.9 in the hazard log-odds | **RED 13/19** |
| 4 | Measure-zero push, both sides | **YES** (×2) | (a) `pushThroughs++` → `+= 2`; (b) initial `0` → `1` | **RED 2**, **RED 13** |
| 5 | `pushThetaThreshold` honesty note | **YES** (×2) | (a) ledger emptied; (b) note stripped from one preset | **RED 4**, **RED 2** |
| — | Never-regress gotchas 1–4 | **YES** (×4) | one live injection each | **RED ×4** |

Command results, all re-run by this gate on the restored tree:

| command | result | exit |
|---|---|---|
| `npm run ci` | **90 files / 1426 tests passed**, 537.28 s | **0** |
| `npm run test:strict` | **90 files / 1426 tests passed**, 500.96 s | **0** |
| `npm run test:browser` | **3 files / 51 tests passed** (chromium, webkit, firefox), 4.34 s | **0** |
| `npm run check:scratch` | `pipeline/out is clean — 12 produced entr(ies) allowed, test-tmp/ empty` | **0** |
| `npm run lint:claims` | `0 hit(s) in 0 file(s); 371 file(s) scanned against 23 active rule(s)` | **0** |

`test:strict` returning the identical 90 / 1426 as `npm test` means no suite was
artifact-skipped in the ordinary local run.

Oracle corpus, measured with `du -sh` before and after every experiment:
`decision-fixtures` **477 MB**, `world-fixtures` **153 MB**, `closure-fixtures`
**30 MB**. No shrink.

---

## 4.2 The revert-proofs, one by one

Every injection below was made to **shipped source**, never to a test. Each is
quoted exactly, with the suite that was run against it and the restoration SHA.

### Clause 1 — the flagship now sees the engine

`engine/src/sim.ts`, the ContextCreator-step-11 arming pass:

```diff
  let armed = 0;
- if (this.decisionConfig !== null) {
+ if (false as boolean) {
```

This is a total revert of the WP8 wiring: `armResident` is never called by the
engine and `armedResidents` is always 0.

```
validation/test/wp8-r3-own-engine.test.ts
  Test Files  1 failed (1)
       Tests  6 failed | 30 passed (36)
```

The six reds, named:

- `arm {A,B,C}: SHIPPED — the ENGINE arms the run: 6,842 on the null side, 0 on the reference`
- `arm {A,B,C}: the harness's arming is a CROSS-CHECK — engine-armed and re-armed runs are byte-identical`

Under Section 3's tree the same revert produced **24/24 green**. The remediation
is real and it is exactly the six cases that carry it.

Restored: `sha256(engine/src/sim.ts) = 3c5636d9aa8f1a71405b06f4108c47ffb6b4945187bf77308d53cf7d30020037`, identical.

### Clause 2 — the gates, twice

**(2a) Perturb a gate's reading of its input.** `gate-f-wachinger.ts`, the
high-barrier stratum predicate:

```diff
- return barriers >= 2 || (h === 1 && pet[i] === 1);
+ return barriers >= 4;
```

```
wp8-archive-gates.test.ts + wp8-gate-corrosion.test.ts
  Tests  8 failed
```

including `passes every gate on every archived run, with the expected check
census` (i.e. the gate went red on the certified Java bytes, not on a fixture)
and `keeps the redundant belongings-and-pet disjunct alive`.

Restored: `sha256 = 56c9080220c3dc28d6cacf548efe05649a7e5ab5ffcade5f4569a209fca539c2`.

**(2b) Neuter a gate so it cannot fail.** `gate-l-counters.ts`, the l.1 verdict:

```diff
- badDecide === 0,
+ true,
```

```
wp8-gate-corrosion.test.ts
  Tests  2 failed | 52 passed (54)
    (l) counter identities can fail > l.1 goes red when a blockage resolved to no decision
    (l) counter identities can fail > l.1 is ROW-WISE — an aggregate that happens to balance still fails
```

`wp8-archive-gates.test.ts` stayed green under 2b, and **that is correct**: the
archive records zero blockage events everywhere, so l.1 is vacuously satisfied on
real bytes and only the corrosion suite can see a neutered l.1. The division of
labour between the two suites is genuine, not decorative — this experiment is
what proves it.

Restored: `sha256 = daf6fafdca405fbba4948bf3a1433e1b533deb2ed4c478a59b2cb223ece53632`.

### Clause 3 — a decision-layer coefficient

`engine/src/decision/hazard.ts`, the official-warning term of the hazard
log-odds (`wOfficial` is 1.1 and live in all twelve replayed runs — verified
from the archived manifests before choosing it):

```diff
- config.wOfficial * (open ? 1.0 : 0.0) +
+ config.wOfficial * 0.9 * (open ? 1.0 : 0.0) +
```

```
validation/test/wp8-archive-replay.test.ts
  → ER-A-n6842-seed42 sheltered: expected 1131 to be 1215
    sheltered: port 1131 vs archive 1215
    policy_refusals: port 464 vs archive 541
    sheltered: port 1176 vs archive 1252   (SE-E18-seed42)
    policy_refusals: port 465 vs archive 543
    sheltered: port 1242 vs archive 1307   (SE2-E18-d1-seed42)
    policy_refusals: port 609 vs archive 709
```

The test goes red **naming the clause-3 literals**, on all four families and all
three seeds. Section 3's gap — "grep finds no test that asserts any of these
numbers" — is closed.

Restored: `sha256 = 8c90837851ba213bfa655b25ce2a640afcf025ea2440a7e329b92e942efa0833`.

### Clause 4 — the push counter, both sides

**(4a) The mechanism.** `closureReaction.ts`:

```diff
- a.pushThroughs++;
+ a.pushThroughs += 2;
```

```
  Tests  2 failed | 36 passed (38)
    reaction.oracle.test.ts  → armed|42|ahead/a0@961 counter deltas (PUSH):
                               expected [1, 2, 0, 0] to deeply equal [1, 1, 0, 0]
    step.closure.mutation.test.ts (SE-MT1)
```

The first of those is the **certified Java agent-reaction oracle**. This matters:
the archive records zero pushes, so the *measure-zero* claim alone can never
exercise the increment. The mechanism is gated by the oracle, independently of
the measure-zero result.

**(4b) The claim.** `agents/resident.ts`:

```diff
- pushThroughs = 0;
+ pushThroughs = 1;
```

```
validation/test/wp8-archive-replay.test.ts
  Tests  13 failed | 6 passed (19)
    → pushes: port 6842 vs archive 0
```

Restored: `sha256(closureReaction.ts) = eb89f1dc520a911f38e26e4a0b6d92ccec035b94dd068122d73933fcb7179d9f`,
`sha256(resident.ts) = a7012e9d1b48c04e7f4d2f2ce92af4e4aa0eea793dcba3f38b00e68fc12524c2`.

### Clause 5 — the honesty note, both places

**(5a) Remove it from the ledger.** `shared/src/manifest.ts`, `PROVENANCE_QUIRKS`
emptied:

```
  Test Files  3 failed | 3 passed (6)
       Tests  4 failed | 135 passed (139)
    manifest.test.ts              → PROVENANCE_QUIRKS ids !== ["pushtheta-batch-zeroing"]
    preset-archive-parity.test.ts → the provenance ledger has no pushtheta-batch-zeroing entry
    presets.test.ts               → SE_severe_v1_E18 cites unknown quirk pushtheta-batch-zeroing
```

**(5b) Strip it from one preset.** `shared/src/presets/definitions.ts`,
`SE_severe_v1_E18` with `archiveExceptions: []` and `quirkNotes: []`:

```
  Tests  2 failed | 137 passed (139)
    SE_severe_v1_E18 diffs clean against scenario-e/SE-E18-seed42
    finds exactly one archive exception in the whole shipped set
```

Restored: `sha256(manifest.ts) = ee9b26ffaa4db98635b6f9a87143d13d7b4a330bd5fa5e39b097af109da995c1`,
`sha256(definitions.ts) = ca0f9537ee475bafbc3a544448c0f6a451481e5d60d146711751433e1ac0bb98`.

---

## 4.3 Restoration, proved

A SHA-256 manifest of **395** source files (`*.ts`, `*.tsx`, `*.json`, `*.md`,
`*.mjs`, `*.js`, `*.html`, `*.css`, `*.ps1`, `*.java`, excluding `node_modules/`
and `pipeline/out/`) plus a `tar` byte-copy were taken **before the first
injection**. After the last restoration:

```
sha256sum -c BACKUP-MANIFEST.sha256 | grep -c ": OK$"   → 395
sha256sum -c BACKUP-MANIFEST.sha256 | grep -v ": OK$"   → (empty)
diff filelist-before filelist-after                     → FILE SET IDENTICAL
```

Two temporary files were created and both were removed, with the removal
verified: `websim/docs/GATE4-TEMP-PROBE.md` (the claim-linter probe, §4.6) and
`websim/validation/scripts/gate4-armfromworld-probe.ts` (the F1 probe, §4.9).
`git status --porcelain` shows neither.

Nothing outside `websim/` was created, modified or deleted. Working files for
this gate live in the session scratchpad under `%LOCALAPPDATA%\Temp`, outside the
repository entirely. **No mutating git command was run at any point.**

---

## 4.4 Clauses 2–5 re-derived from raw bytes

A standalone Python 3.14 scorer (`csv`/`json` only, **no project code imported,
no generated file read**) walked the archive at `docs/runs/`.

**Discovery.** 60 run directories: `phase-e` 12, `scenario-e` 21,
`scenario-e-v2` 27. Parameter-count census `{33: 12, 40: 21, 41: 27}`.

**Clause 3 — the archive side.**

| run | sheltered | policy_refusals | door_refusals | unreachable |
|---|---|---|---|---|
| `phase-e/ER-A-n6842-seed42` | **1215** | **541** | 836 | 4 |
| `scenario-e/SE-E18-seed42` | **1252** | **543** | 834 | 9 |
| `scenario-e-v2/SE2-E18-d1-seed42` | **1307** | **709** | 1152 | 9 |

Each `(sheltered, policy_refusals)` pair occurs in **exactly one** of the 60
runs — the triple is unambiguous. The old 2,060 collapse appears in exactly 3
runs, all of them `E0null-A`, where 2,060 is correct.

**Clause 3 — the port side, my scorer over the port's own written bytes.** The
three headline replays were regenerated through
`validation/scripts/wp8-archive-replay.ts` and the freshly-written CSVs scored by
the same standalone scorer:

| run | n | sheltered | unreachable | policy_refusals | door_refusals | capacity_refusals |
|---|---|---|---|---|---|---|
| ER-A-n6842-seed42 | 6842 = | 1215 = | 4 = | 541 = | 836 = | 295 = |
| SE-E18-seed42 | 6842 = | 1252 = | 9 = | 543 = | 834 = | 291 = |
| SE2-E18-d1-seed42 | 6842 = | 1307 = | 9 = | 709 = | 1152 = | 443 = |

(`=` means equal to the archive under the same scorer.) The regenerated
`agents.csv` / `shelters.csv` are **byte-identical** to the files already on
disk — determinism re-confirmed — and `check:scratch` still exits 0 afterwards.

**Clause 2 — the check census, re-derived arithmetically.** Applying the driver's
own per-class table (`null`/`er` 5, `se` code-0 9, code-1 14, code-3 15) to the
run families and `closuresCode` values I read out of the manifests:

```
runs: 60   total checks: 603   skips: 9   passed: 594
per family: {E0:45, ER:45, SE:126, SE2:225, SE2nc:81, SEnc:81}
runs/family: {E0:9, ER:9, SE:9, SE2:15, SE2nc:9, SEnc:9}
closuresCode: {E0:[0], ER:[0], SE:[1], SE2:[3], SE2nc:[0], SEnc:[0]}
```

**594 / 0 / 9 = 603**, reproduced independently.

**Clause 2 — gate (f) re-derived on all 60 runs.** My own implementation of
`(barriers >= 2) | (heavy & pet)` and the UNAWARE/PRE_EVAC terminal set:
**51 runs have `nStay >= 1`; the 9 runs with `nStay == 0` are exactly the 9
E0-nulls the driver SKIPS by design.** `SE2-E18-d1-seed42` gives
`nHigh = 226, nStay = 195` — matching `gate-f-wachinger.ts`'s own module doc to
the unit.

**Clause 4.** **48** archived runs carry the four-counter block; **zero** of them
have any nonzero counter; **24** of the 48 are closure runs (`closuresCode != 0`).
Row-wise, l.1 (`blockages == pushes + reroutes`) and l.2 (`stuck <= pushes`) hold
in every row of every run. The 48 = 42 SE-family + 6 E0-null reconciliation the
test asserts is confirmed against the bytes.

**Clause 5.** Archived **executed** `pushThetaThreshold`: `0.0` in **42** runs
(the SE/SEnc/SE2/SE2nc families), `-0.25` in the **6** `scenario-e`/`-v2`
E0-nulls, and absent from the **12** 33-parameter `phase-e` manifests. That is
exactly the population the honesty note is scoped to, and it is why the note has
to exist: the shipped presets carry `-0.25`.

---

## 4.5 Was any test weakened this pass? No.

Diffed against `5f10415` with `git archive` + set-difference, not by reading a
report.

| check | result |
|---|---|
| test files | **72 → 92**, `comm -23 old new` is **empty** — zero removed, **20 added** |
| `git diff --name-status` deletions under `websim/` | **zero** |
| tracked test files modified | **8**; six gained assertions and cases, two changed only prose/types |
| `expect(...)` lines removed tree-wide | **3**, in 2 files (below) |
| `describe/it/test/suite.skip|only|todo|skipIf|runIf|fails` | **none** — the 12 grep hits are comment prose or the bypass-scanner's own seeded fixture |
| `xit` / `xdescribe` / `fit` / `fdescribe` | **none** |
| `toBeCloseTo` precisions | old `{4:1, 6:1, 12:3, 15:2}` → new `{4:1, 6:1, 12:4, 15:3}` — additions only, at 12 and 15 digits. Nothing loosened |
| `ROUND_SLACK` / `SEVERE_PEAK_GATE_SLACK` | `1e-4` / `0.06` — unchanged |

Assertion census on the six pre-existing files that changed materially:

| file | expects | its |
|---|---|---|
| `engine/test/agents/step.units.test.ts` | 45 → **69** | 12 → **16** |
| `shared/test/manifest.test.ts` | 41 → **66** | 22 → **30** |
| `shared/test/presets.test.ts` | 40 → **60** | 16 → **20** |
| `shared/test/schema.test.ts` | 44 → **70** | 21 → **28** |
| `tools/test/artifact-gate.test.ts` | 58 → **78** | 24 → **30** |
| `tools/test/fixtures/artifact-gate-proof.spec.ts` | 3 → **4** | 2 → **3** |

**Every delta accounted for.** The three removed `expect` lines:

1. `step.units.test.ts`: `expect(() => stepResident(a, w, 1)).toThrow(/WP8/)` — the
   landmine that asserted the *defect* (WP7 guarded the unfinished layer with a
   throw). Removing it was mandatory once the layer became real. It was replaced
   by a whole `describe` block — `the E0-null invariant is an active assertion,
   not a comment` — with four cases including a full 200-tick episode asserting
   **zero** decision-layer transitions and an untouched RNG state.
2–3. `artifact-gate.test.ts`: `toMatch(/skipped/iu)` → `toMatch(/2 skipped/u)` and
   `toMatch(/1 failed/u)` → `toMatch(/2 failed/u)`. Both **tightened**.

The file-count arithmetic: **92** `*.test.ts`/`*.spec.ts` on disk = **90** collected
by `vitest run` + **1** browser file (`engine/test-browser/cross-engine.digest.test.ts`,
run under `test:browser` across three engines) + **1** fixture spec
(`tools/test/fixtures/artifact-gate-proof.spec.ts`, driven as a subprocess by
`artifact-gate.test.ts`).

---

## 4.6 The four never-regress gotchas — each proved by injection

Not read. Broken, and watched.

| # | Gotcha | Injection | Result |
|---|---|---|---|
| 1 | V39 citation is Coughlan, Huber-Stearns, Clark & Deak 2022; the retired surname is banned | a temp doc citing the retired surname + `et al. 2022` | `lint:claims` **exit 1**, rule `banned-citation`, matching the retired surname |
| 2 | no LA-wildfire severity comparison; the v2 anchor is Canberra Florey 2,496.1 µg/m³ | a temp doc framing the v2 series as `comparable to the <retired LA place name> worst hour` | `lint:claims` **exit 1**, rule `banned-severity-comparison`, matching the comparison frame |
| 3 | `simulationHours <= slices − 1` as a **throw** | `RunWindowOverrunError` suppressed with an early `return` in `smoke/series.ts` | **4 failed** — `series.units.test.ts` ×3 (`expected undefined to be an instance of RunWindowOverrunError`) + `window.archive.test.ts` |
| 4 | Repast zeroes negative `"number"` constants — use `"double"` | `repastConstantType` returns `base`, dropping the negative→double promotion | **4 failed** across `schema.test.ts`, `presets.test.ts`, `preset-archive-parity.test.ts` (`alphaHazard=-8: expected 'number' not to be 'number'`) |

The temp doc was deleted and `lint:claims` re-run to `0 hit(s) in 0 file(s);
371 file(s) scanned`. Gotchas 3 and 4 were restored and the tree re-verified.

**An unplanned fifth proof.** The first draft of this very table quoted the two
banned strings verbatim, and `lint:claims` went **red on this document** — 4 hits
in 1 file — before it could be reported as clean. The rules fire on new prose by
whoever writes it, including a gate agent writing about the rules. The table
above now names the offending phrasings instead of reproducing them.

Gotcha 3 also holds at full scale: `oor 0` (`out_of_range_lookups`) on all three
regenerated headline replays, and `wp8-archive-replay.test.ts` asserts it per run.

---

## 4.7 Scope and evidence integrity

- `git status --porcelain` from the repo root: **91 entries, all under `websim/`.**
  Zero outside. `.github/workflows/websim-ci.yml` is tracked and clean.
- **No mutating git command was run.** No `commit`, `push`, `add`, `checkout`,
  `reset`, `stash` or `clean`.
- `pipeline/out/` was never deleted from, and `--clean` was never passed. The
  only writes under it were the three registered `wp8-replay/` run directories,
  regenerated byte-identically; `check:scratch` exits 0 before and after.
- Corpus measured twice, unchanged: 477 MB / 153 MB / 30 MB.
- **No test was weakened, no tolerance loosened, no assertion deleted** by this
  gate. The only files this gate leaves changed are this document.

---

## 4.8 Adversarial check on this gate's own claims

**"The nine reds prove the clauses are gated" — could any red have come from
somewhere other than the clause?** For clause 1 the six reds are named cases in
the flagship file itself. For clause 3 the failure text quotes the literal
`expected 1131 to be 1215`, which only the clause-3 assertion contains. For 4b
the text is `pushes: port 6842 vs archive 0` from `metricDeltas`. For 5a/5b the
failures name `pushtheta-batch-zeroing` and `SE_severe_v1_E18` directly. Each red
is attributable to the clause by its own message, not by proximity.

**"The tree is restored" — could a restoration have been cosmetic?** The manifest
was taken before the first injection and covers 395 files including every file
touched; `sha256sum -c` reports 395 OK and zero mismatches, and the file list is
identical. `test:strict` was then run on the restored tree and returned the same
90 / 1426 as the pre-experiment `npm run ci`.

**"Clause 1 goes red" — how much of the flagship actually moved?** Six of 36. The
two `SHIPPED` *projection* cases per arm (e-appended, archive-shaped) stayed
green under the revert, because with arming disabled both sides of the pair are
layer-off and the projections still match. That is correct behaviour, and it is
stated precisely rather than glossed: clause 1's sensitivity to the wiring is
carried by the three arming witnesses and the three cross-checks, not by the
identity projections. The projections carry the *identity* half of the clause;
the witnesses carry the *shipped-path* half. Both halves are now present, which
is what Section 3 asked for.

**"Clause 2b's archive suite stayed green — is the gate really defended?"** Yes,
and the split is the point. See §4.2 (2b): the archive cannot exercise l.1
because it records zero blockage events, which is *itself* clause 4. The
corrosion suite exists precisely to cover the paths the archive cannot reach, and
it caught the neutering in 2 cases.

---

## 4.9 Findings — none blocking

### F1 (advisory) — the fourth instance of the pattern, one level below the clauses

Section 3's remediation hardened `armFromWorld` so it compares its rebuilt
`DecisionConfig` field-for-field against `world.decisionConfig` and throws before
overwriting anything (`validation/src/harness/r3-own-engine.ts:322,385-400`).

**The guard is live.** Measured, not assumed: a probe built a world at n=60 from
`E0_null_A`, called `armFromWorld` with a config drifted by one field, and got

```
DRIFTED config: THREW -- GUARD IS LIVE: armFromWorld: the DecisionConfig built
here disagrees with world.decisionConfig on 1 field(s) — bRisk: harness 0.5 vs
engine 0.4.
```

**The guard is ungated.** `grep -rn "armFromWorld|decisionConfigDelta|disagrees
with world"` across every `*.test.ts` in the tree returns **four hits, all of them
comments** in `wp8-r3-own-engine.test.ts`. No test constructs a drift; no test
asserts the throw can fire. If someone deleted the comparison tomorrow, the two
construction sites agree today, so **nothing would go red**.

This is the same shape as the defect this gate was sent to hunt — a correct
mechanism whose gate is insensitive to it — sitting inside the fix for the last
one. It is **advisory, not blocking**, because clause 1 no longer depends on it:
the `SHIPPED` cases run with `armDecisionLayer: false` and never enter
`armFromWorld` at all. The guard is defence-in-depth for the `ARMED` cases.

*Suggested close (small, no engine code):* one case in
`engine/test/decision/` — or a small-n case in the flagship — that calls
`armFromWorld` with one coefficient perturbed and asserts
`toThrow(/disagrees with world.decisionConfig/u)`.

### F2 (advisory) — what a clean-clone CI job can and cannot defend

Clauses 1 and 3, and the port half of clause 4, are held by suites gated on
`pipeline/out/assets/graph-{topology,geometry}.bin`. `ASSET_DIR` is a hardcoded
path under `pipeline/out/`, which `.gitignore:10` ignores in full, and
`artifactGate` decides with `existsSync(ref.path)`. So on the hosted `build`
job — the only job that runs unconditionally, with `WEBSIM_REQUIRE_ARTIFACTS: "0"` —
`wp8-r3-own-engine.test.ts` and `wp8-archive-replay.test.ts` **skip**.

Clause 2, the archive half of clause 4, and clause 5 do run there: `docs/runs/`
(475 tracked files) and `Geography/` (287 tracked files) are both in git.

The job that requires the artifact suites, `strict-artifacts`, is opt-in behind
`vars.WEBSIM_ARTIFACT_RUNNER == 'true' || inputs.strict_artifacts`.

This is **stated, not hidden** — `websim/README.md`'s skip-vs-fail policy and the
workflow's own comments describe it, the skip is loud and attributed, and Section
3's clean-clone regression is closed. But "defended by a test" and "defended on
every push" are not the same sentence, and the second one is conditional on a
self-hosted runner existing. *This finding is deduced from the code paths and
`.gitignore`, not measured: removing the corpus to measure it is forbidden.*

### F3 (minor) — the STATE handed to this gate was stale

The brief said "88 files / 1384 tests". The measured tree is **90 files / 1426
tests**. The difference is precisely Section 3's two remediations:
`validation/test/wp8-archive-replay.test.ts` (19 tests) and
`validation/test/provenance.test.ts`, plus the 12 new flagship cases and the
`armFromWorld` hardening. The brief's premise — "two clauses are TRUE BUT
UNGATED" — was **already false** when this gate started. Both had been closed.

### F4 (informational) — port manifests still report a dirty tree

`portSourceIntegrity` reports `git_working_tree_dirty=true` on the port's replay
manifests, so those manifests fail gate (h). That is the gate working correctly:
the working tree genuinely holds 91 uncommitted entries. Section 3's "port
manifests omit the field" gap is closed — `validation/src/provenance.ts` and
`validation/test/provenance.test.ts` now emit and assert the 13-digest
`source_integrity` block, three-state, with no override and no assume-clean flag.
Gate (h) will read `false` once WP8 is committed.

---

## 4.10 Verdict

# GO

**Clauses defended by a revert-proof (all five):**

1. **Clause 1** — flagship R3 byte-identity on the shipped path. Reverting the
   arming loop turns `wp8-r3-own-engine.test.ts` red at 6/36, on the three
   `SHIPPED` arming witnesses and the three harness cross-checks.
2. **Clause 2** — gates (f)(g)(i)(k)(l). Perturbing a gate's input turns the
   archive suite red **on the certified Java bytes**; neutering a gate's verdict
   turns the corrosion suite red.
3. **Clause 3** — ER/SE/SE2 = 1,215 / 1,252 / 1,307 and 541 / 543 / 709.
   Perturbing `wOfficial` by 10% turns `wp8-archive-replay.test.ts` red naming
   the literals, on all four families and all three seeds.
4. **Clause 4** — measure-zero push. Perturbing the increment turns the certified
   Java reaction oracle red; perturbing the emitted value turns the replay suite
   red naming `pushes: port 6842 vs archive 0`.
5. **Clause 5** — the `pushThetaThreshold` honesty note. Removing it from the
   ledger turns three shared suites red; removing it from one preset turns
   `preset-archive-parity` red.

**Clauses resting on measurement alone: none.**

**What still rests on measurement rather than on a gate** (both advisory, both
outside the five clauses): the `armFromWorld` cross-check (F1), and the
availability of an artifact-holding CI runner for the three artifact-gated
clause suites (F2).

Suite green on the restored tree — `ci` 90/1426 exit 0, `test:strict` 90/1426
exit 0, `test:browser` 51/51 exit 0 across three engines. Corpus intact at
477/153/30 MB. Tree byte-identical to its pre-experiment state across 395 files.
Nothing outside `websim/` touched. No mutating git command run.

**The first GO of the four gates, and the first one issued after breaking every
clause rather than after reading about them.**
