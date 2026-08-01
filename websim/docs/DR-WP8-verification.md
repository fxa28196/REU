# DR-WP8-verification — independent acceptance gate for WP8

**Verdict: NO-GO.**

Author: independent verification agent (no WP8 implementation work).
Date: 2026-08-01. Tree state: working tree at `5f10415` + 72 uncommitted entries.
Method: every number below was produced by a command this agent ran, in this
tree. Where a claim is numeric it was recomputed with a script that imports
nothing from `websim/`; where a claim is "bit-identical" it was re-verified with
this agent's own column projection, hex encoding and SHA-256.

The NO-GO rests on **two** items, not on the flagship. The flagship criterion
passes and passes convincingly. What fails is (a) one of the five acceptance
clauses — ER/SE/SE2 direction-of-effect — which is not merely unproven but
currently **unreachable**, and (b) the clean-clone property, which regressed.

---

## 1. Scorecard against the five acceptance clauses (§8, WP8)

| # | Clause | Verdict | Basis |
|---|---|---|---|
| 1 | Tier-2 own-engine R3 byte-identity (flagship) + closures-inert variant | **MET** | independently re-verified byte-for-byte, §3 |
| 2 | gates (f)(g)(i)(k)(l) green | **MET** | 603 checks over 60 Java-produced runs, §4 |
| 3 | ER/SE/SE2 presets reproduce archived direction-of-effect + counter identities | **counter identities MET; direction-of-effect REFUTED** | §5 |
| 4 | measure-zero push result at documented severities reproduced | **MET, with a stated caveat** | §6 |
| 5 | `pushThetaThreshold` honesty note wired into presets/ledger | **MET** | §7 |

Supporting properties required by the plan and by the standing rules:

| Property | Verdict |
|---|---|
| `npm run typecheck` | green |
| `npm test` | green — 87 files / 1369 tests |
| `npm run lint:claims` | green |
| `npm run check:scratch` | **RED — exit 1**, therefore `npm run ci` is red |
| `npm run test:browser` | green — 3 files / 51 tests / 3 engines |
| `npm run test:strict` | green — exit 0, all real gates satisfied |
| clean-clone exits 0 | **RED — exit 1**, two suites break |
| artifact-gate policy: no bare skip spellings | green |
| nothing created/modified outside `websim/` + `.github/` | green |
| no mutation injection left behind | green |
| four never-regress gotchas | green, all four proven to fire |

---

## 2. Pipeline, exactly as run

All from `C:/Users/Chick/OneDrive/Desktop/reu/websim`.

```
npm run typecheck     exit 0   shared, engine, pipeline, app, validation, tools — no diagnostics
npm test              exit 0   Test Files 87 passed (87)   Tests 1369 passed (1369)   304.94 s
npm run lint:claims   exit 0   0 hit(s) in 0 file(s); 357 file(s) scanned against 23 active
                               rule(s); 4 path(s) quarantined
npm run check:scratch exit 1   3 violation(s) under websim/pipeline/out
npm run test:browser  exit 0   Test Files 3 passed (3)     Tests 51 passed (51)
npm run test:strict   exit 0   Test Files 87 passed (87)   Tests 1369 passed (1369)
```

Zero tests were skipped in `npm test` on this machine, because every artifact
this tree gates on is present locally.

**`npm run check:scratch` exits 1, so `npm run ci` (which chains it) is red.**
The exit code was captured in isolation — an earlier attempt read the exit code
of a `tail` in a pipeline and appeared to show 0; the real code is 1.

### 2.1 `test:strict` — what it actually does

`tools/test-strict.ts` re-launches the whole vitest run with
`WEBSIM_REQUIRE_ARTIFACTS=1`, which converts every artifact-gated skip into a
hard failure. It exited 0 with the same 87/1369 census as `npm test`, and the
log contains exactly **one** gate banner — emitted by the policy's own
self-proving fixture, which spawns a *child* vitest with the variable off. So
under strict mode no real gate degraded: every gated suite ran its body. That is
the meaningful reading of a green `test:strict`, and it holds.

---

## 3. Clause 1 — the flagship, independently re-verified

This agent did not read the suite's verdict. It ran the acceptance CLI with
artifact output, then compared the CSVs with its own code.

```
npx tsx validation/scripts/run-r3-own-engine.ts --write pipeline/out/test-tmp/r3-verify
```

Then an independent script (no `websim` imports) re-derived the shared-column
projection itself — dropping only `sim_id`/`commit`/wall-clock-shaped names,
keeping `time_started_local`, `time_arrived_local`, `random_seed` and
`data_version` — encoded the projection to hex, and compared bytes and SHA-256.

| scenario | table | dimensions | bytes | result |
|---|---|---|---|---|
| shipped A/B/C | agents.csv | 57 x 6,842 | ~2.58 MB | **byte-identical** |
| armed A/B/C (e-appended) | agents.csv | 51 x 6,842 | ~2.49 MB | **byte-identical** |
| armed A/B/C | shelters.csv | 12 x 36 / 46 | 3,835 / 5,108 | **byte-identical** |
| closures-inert A/B/C | agents.csv | 57 x 6,842 | ~2.63 MB | **byte-identical** |
| **negative control A** | agents.csv | 51 x 6,842 | 2.03 MB | **differs at byte 824** |
| **negative control A** | shelters.csv | 12 x 36 | 3,809 | **differs at byte 213** |

Sample digests reproduced by this agent (arm C, armed, e-appended):
`sha256(null) = sha256(ref) = 0be2d1ab9abc78de81e1be0940e92efc36ec9e5c0d2f5841c338b5400c50c4dd`.
Arm B closures-inert:
`a968555b95af9975edd1ba64831559dc75bc4feccea0aee86af9354d7c58e58e` on both sides.

The closures-inert variant is not vacuous: the run witness shows
`runtimePresent=true, scheduledEdges=72, matchingGraphEdges=72, waves=6,
inertWaves=6, wavesApplied=0, residentsWithRouteNodes=2060`, against a reference
with `runtimePresent=false, residentsWithRouteNodes=0`. The schedule is loaded,
the runtime is built, `routeNodes` is allocated, and the output is unchanged —
which is exactly the property the clause asks for.

**Conclusion: clause 1 is MET.** The identity is real, it is measured at full
scale (n = 6,842, 312 h, seed 42, arms A/B/C), and the negative control proves
the comparator can fail on this data.

### 3.1 Two caveats that do not overturn clause 1 but bear on WP9+

Both are disclosed by the implementing agent in the suite's own header, and both
were independently confirmed here.

**Caveat A — the `shipped` variant is vacuous, by construction.** `armResident`
has **no call site anywhere in `engine/src/`**:

```
$ grep -rn "armResident" engine/src/
engine/src/agents/resident.ts:123:  // ... comment
engine/src/agents/step.ts:40:       // ... comment
engine/src/decision/arm.ts:45:      export function armResident(...)
engine/src/decision/config.ts:275:  // ... comment
engine/src/decision/index.ts:12:    // ... comment
engine/src/decision/index.ts:47:    export { armResident } from "./arm.js";
```

A definition and a re-export; no caller. `engine/src/sim.ts` mentions "decision"
once, in a comment. `SimulationOptions` carries no `DecisionConfig`. So the
shipped `Simulation` runs the WP7 legacy branch regardless of
`enableDecisionLayer`. The suite asserts `armedResidents === 0` on that path and
says so out loud, which is the honest way to hold the finding open.

**Caveat B — the `armed` variant reaches the layer through a test-only seam.**
The identity that carries clause 1 is measured with `armDecisionLayer: true`, a
harness affordance in `validation/src/harness/r3-own-engine.ts`, not through any
path a shipped run can take. The arithmetic under test is the engine's own
(`armResident`, `stepResident`), so the result is meaningful; but WP8's
*integration* is not what was measured.

---

## 4. Clause 2 — gates (f)(g)(i)(k)(l)

The suite runs the ported gates over all 60 archived Phase-E / Scenario-E runs
produced by the certified Java instrument at commits `7224cef`, `bb8707d`,
`495d845`, `257017d` — data that predates this port. Reported result:

```
[wp8-gates] 60 archived runs -> 594 passed, 0 failed, 9 skipped (603 checks);
            per family {"E0":45,"ER":45,"SE":126,"SE2":225,"SE2nc":81,"SEnc":81}
```

This agent recomputed the census from raw bytes with a script importing nothing
from `websim/` (`docs/runs`, 410,520 agent rows read):

| quantity | claimed | independently recomputed |
|---|---|---|
| run directories | 12 + 21 + 27 = 60 | **12 + 21 + 27 = 60** |
| runs carrying the 4-counter block | 48 | **48** |
| of those, `closures.code != 0` | 24 | **24** (9 at code 1, 15 at code 3) |
| distinct parameter counts | 33 / 40 / 41 | **[33, 40, 41]** |

The 9 skips are gate (f) on the nine E0 nulls, which carry zero barrier mass —
a by-design skip, not a silent one. Each gate additionally has a corrosion case
that edits one field of one **real archived run** and requires the owning gate
to go red; `wp8-gate-corrosion.test.ts` does the same exhaustively on synthetic
fixtures. That is the right order of evidence and it is genuinely present.

**Conclusion: clause 2 is MET.**

---

## 5. Clause 3 — ER/SE/SE2 direction-of-effect: **REFUTED**

This was one of the two claims selected for adversarial refutation. It does not
survive.

`validation/scripts/wp8-archive-replay.ts` drives the engine from each archived
executed manifest and writes `pipeline/out/wp8-replay/replay-report.json`. This
agent read that report and tabulated port-vs-archive itself:

| run | port sheltered | archived sheltered | ratio | port policy refusals | archived policy refusals |
|---|---|---|---|---|---|
| ER-A-n6842-seed42 | 2060 | 1215 | 1.695 | 0 | 541 |
| ER-A-n6842-seed43 | 2055 | 1168 | 1.759 | 0 | 536 |
| ER-A-n6842-seed44 | 2056 | 1205 | 1.706 | 0 | 515 |
| ER-C-n6842-seed42 | 6570 | 1215 | **5.407** | 0 | 596 |
| ER-C-n6842-seed43 | 6565 | 1168 | **5.621** | 0 | 560 |
| ER-C-n6842-seed44 | 6566 | 1206 | **5.444** | 0 | 539 |
| SE-E18-seed42 | 2060 | 1252 | 1.645 | 0 | 543 |
| SE-E18-seed43 | 2055 | 1223 | 1.680 | 0 | 501 |
| SE-E18-seed44 | 2056 | 1247 | 1.649 | 0 | 495 |
| SE2-E18-d1-seed42 | 2060 | 1307 | 1.576 | 0 | 709 |
| SE2-E18-d1-seed43 | 2055 | 1272 | 1.616 | 0 | 585 |
| SE2-E18-d1-seed44 | 2056 | 1301 | 1.580 | 0 | 620 |

Three independent tells, all pointing the same way:

1. **Policy refusals are 0 in every port run** and 495–709 in every archived
   run. `policy_refused` is a pure decision-layer quantity — the pet and
   dependants door gate. Zero means the gate was never consulted.
2. **`ER-A-seed42`, `SE-E18-seed42` and `SE2-E18-d1-seed42` all shelter exactly
   2060**, across three different smoke series, two run lengths (312 h vs 455 h)
   and three closure codes. A live decision layer cannot be invariant to that.
   2060 / 4754 refused / 28 unreachable is the WP7 arm-A legacy result.
3. The tree's own `replay-divergence.json` states it outright: against the
   archived ER run, `rowsIdentical: 0` and `finalStateFlips: 6461` of 6,842;
   against the **pre-E legacy** archive `present-day-three-arm/A-seed42`,
   `rowsIdentical: 6546` and `finalStateFlips: 114`. The port's "ER" run
   reproduces the pre-E baseline, not ER.

### 5.1 Why this is not fixable by re-running: the archived configs cannot execute

Every archived ER/SE/SE2 configuration sets `informationRegime = 1` (L1).
`engine/src/agents/step.ts:331` throws when an L1 resident re-enters from
`REFUSED_ALL_FULL` and the `StepWorld` declares no `anyUntriedReachableShelter`:

```ts
if (l1 && w.anyUntriedReachableShelter === undefined) {
  throw new Error(
    `resident ${a.name} needs the L1 re-entry predicate, but this StepWorld declares no ` +
      "anyUntriedReachableShelter: ...");
}
```

`Simulation` (`engine/src/sim.ts:68`, `implements StepWorld`) implements
`anyShelterAvailable` and **not** `anyUntriedReachableShelter`, and
`SimulationOptions` has no field for one. Confirmed by grep: the only
non-comment occurrences of `anyUntriedReachableShelter` in `engine/src/` are the
optional interface member and the throw that fires when it is missing.

So the L1 regime is unrunnable, the ER/SE/SE2 archived configurations are L1,
and the replay silently proceeds on the layer-off legacy path instead. The
clause is not "unproven pending more runs" — it is **currently impossible to
satisfy** without the two missing wiring pieces.

### 5.2 What *is* met inside clause 3

The **counter identities** half holds: gate (l)'s
`blockages == push_throughs + reroutes` is satisfied on both sides. It is
satisfied at zero, on both sides, which is the archive's own result (§6).

### 5.3 No test gates this clause

`grep` over all `*.test.ts` finds no suite asserting ER/SE/SE2 direction-of-effect
or consuming `replay-report.json`; `validation/golden-summaries/sheltered-envelopes.json`
is consumed only by `golden-summaries.test.ts` and `wp7-vertical-slice.test.ts`.
The replay is a script whose output no gate reads. A green suite therefore
carries no information about this clause — which is why the tree can be 1369/1369
green while the clause is refuted.

---

## 6. Clause 4 — measure-zero push result: MET, with a caveat

Independently recomputed over the whole archive (410,520 agent rows, raw bytes):

```
runs carrying all 4 SE counter columns: 48
GRAND TOTALS: blockages_encountered=0  push_throughs=0  reroutes=0  stuck_events=0
residents with blockages_encountered > 0: 0
runs with any non-zero counter: 0
```

The port reproduces that zero non-vacuously: at E18 the replay really does run
closures — `closuresCode 1` blocks 18 edges at wave hour 79, `closuresCode 3`
blocks 72 edges across wave hours [3, 44, 72, 142, 265, 303] — and still records
all four counters at zero. The closure runtime is live and the result matches.

**Caveat, stated because it bounds the strength of the evidence:** the port's
agent population on those runs is the legacy one (§5), so the port's zero and the
archive's zero arise from different trajectory sets. "No resident crossed a
blocked edge" is reproduced; it is reproduced by a different set of residents.
Once §5's wiring lands this should be re-measured, and it is not guaranteed to
stay zero.

---

## 7. Clause 5 — `pushThetaThreshold` honesty note: MET

Genuinely wired, not merely commented:

- `shared/src/presets/definitions.ts:161` — a structured
  `ArchivedManifestException { param: "pushThetaThreshold", presetValue: -0.25,
  archivedExecutedValue: 0, quirkNote: "pushtheta-batch-zeroing" }`.
- `shared/src/manifest.ts:444` — carried into the manifest provenance notes.
- Asserted by `shared/test/manifest.test.ts:293` ("carries the
  `pushThetaThreshold` honesty note verbatim"),
  `shared/test/preset-archive-parity.test.ts:319`, and
  `validation/test/archive-bundle-coverage.test.ts:106`.
- `validation/scripts/wp8-archive-replay.ts` prints the preset-vs-manifest delta
  rather than hiding it, and drives runs from the archived executed value.

Preset JSONs carry `-0.25`; the replay drives `0.0`. That is the documented,
intended split.

---

## 8. Evidence-free-green audit (task item 2)

Every new WP8 suite was checked for whether its expectations come from the Java
oracle / archive or from the TypeScript under test.

| suite | expectation source | self-referential? |
|---|---|---|
| `engine/test/decision/oracle.trace.test.ts` | `pipeline/out/decision-fixtures/` (477 MB), dumped from a live Repast `GisAgent.step()` by an insertion-only probe | **no** — and the 20 run configs are *declared* in `configs.ts`, not parsed from the fixture, with the nine manifest-carried fields cross-checked before any row is read |
| `engine/test/closures/wave.oracle.test.ts` | `pipeline/out/closure-fixtures/waves/`, from the certified `ContextCreator$ClosureWave` on a real Repast `Schedule` | **no** |
| `engine/test/closures/reaction.oracle.test.ts` | 570 Java-produced adjudication rows | **no** |
| `engine/test/smoke/severe-series.builder.test.ts` | four independent oracles: the tracked CSVs in `Geography/data/airnow/`, their tracked `.provenance.json` sidecars, the archived manifests' `input_datasets` digests, and the sidecars' 19 check names | **no** — sidecars are git-tracked read-only instrument output, confirmed via `git ls-files` |
| `validation/test/wp8-archive-gates.test.ts` | 60 archived Java runs + per-gate corrosion on real archived bytes | **no** |
| `validation/test/wp8-r3-own-engine.test.ts` | own-engine identity — TS vs TS **by definition of Tier 2** | not applicable; carries an explicit negative control and a comparator-corrosion case, so it is not green-by-vacuity |

**No suite is improperly self-referential.** The decision-oracle suite in
particular is unusually well defended: it pins the RNG draw *sequence*, *count*
and rolling SHA-256 per resident, which is the only artefact that catches a port
hoisting the hazard draw out of its short-circuit.

### 8.1 One titling overclaim worth correcting

`oracle.trace.test.ts`'s case is titled *"the hour bucket, z_R and the hazard
logistic are **bit-exact**"*, but its own console output reads:

```
hazard p = 1/(1+exp(-u)): 330613 values, 301753 bit-exact (91.271%), max 2 ulp
L1 utility v (ln term):    22747 values,  22681 bit-exact (99.710%), max 16 ulp
```

`p` is compared to a 4-ulp cap, not bit-for-bit. The *substance* is sound and
well argued — HotSpot's intrinsic `exp`/`log` vs fdlibm is a declared frontier
(DR-S1 §5.4), `decay` is asserted bit-exact at 0 ulp, and the suite counts
**0 knife edges of 86,670 resolved Bernoulli draws**, i.e. the ulp difference
never reaches an outcome. But the title asserts more than the assertion does,
and titles are what a reviewer skims. Advisory, not blocking.

---

## 9. Artifact-gate policy (task item 3)

An independent scan (own comment-stripper, own regex, 88 `*.test.ts` files)
found **4 bypass calls in 1 file**: `tools/test/artifact-gate.test.ts`, the file
that deliberately seeds `describe.skipIf`, `it.skip` and `test.todo` to prove the
scan works, and which is the tree's one asserted exemption. No other file uses a
bare skip spelling.

Collection coverage was cross-checked: 88 test files on disk, 87 collected by
`npm test`; the single difference is `engine/test-browser/cross-engine.digest.test.ts`,
which `npm run test:browser` runs separately. **No suite is silently excluded.**

39 `artifactGate({...})` declarations exist across the tree.

**However, the policy has one structural hole and one uncovered suite — see §10.**

---

## 10. Clean-clone property: **REGRESSED**

A fresh clone contains `docs/runs` (475 tracked files) and `Geography` (287
tracked files) but **not** `websim/pipeline/out` (git-ignored, 0 tracked files).
So the faithful simulation is to hide `pipeline/out` only. Done by renaming it
aside, running `npm test`, then restoring it (integrity re-verified afterwards:
`decision-fixtures` 477 M, `closure-fixtures` 30 M, `wp8-replay` 31 M,
`assets` 20 M, unchanged).

```
CLEAN_EXIT=1
Test Files  2 failed | 68 passed | 17 skipped (87)
Tests       1 failed | 1245 passed | 111 skipped (1357)
```

**Number of real assertions that execute on a clean clone: 1,245 passing tests**
(1,357 collected, 111 skipped loudly). The volume of surviving oracle work is
genuinely high — that part of the design works. But the run **exits 1**, so the
clean-clone property does not hold.

### 10.1 Clean-clone breaker #1 — a hole in the gate policy itself

```
FAIL engine/test/decision/oracle.trace.test.ts
Error: ENOENT: no such file or directory, open
  '...\websim\pipeline\out\decision-fixtures\manifest.json'
  ❯ test/decision/oracle.trace.test.ts:167:5
```

Root cause: `describeGated` (`tools/artifact-gate.ts:52`) handles the skip case
with `describe.skip(gate.spec.suite, fn)` — and vitest **still executes `fn`** to
collect the skipped test names. `oracle.trace.test.ts:166-168` calls
`readFileSync(manifest.json)` at the top of the describe body, i.e. at collection
time, outside any `it`/`beforeAll`. The gate cannot protect it.

This is precisely the failure the policy exists to prevent, and it is systemic:
the policy's documentation states that under `WEBSIM_REQUIRE_ARTIFACTS` "the
original body is not collected" — true for the *require* branch, which
substitutes a throwing `it` — but the *skip* branch does collect the body. Every
other gated suite happens to defer its I/O; this one does not. The fix is either
to move the manifest read into `beforeAll`, or to make `describeGated`'s skip
branch substitute a stub body rather than pass `fn` through.

### 10.2 Clean-clone breaker #2 — an ungated artifact-dependent suite

```
FAIL pipeline/test/build-presets.test.ts > build-presets --check
     > reports the committed preset JSON as in sync with the definitions
Error: build-presets: 14 preset file(s) differ from the definitions
```

This is **not** a real out-of-sync. With `pipeline/out` restored the same command
exits 0 and reports `13 preset(s) checked to shared/src/presets and
pipeline/out/assets/presets`. `build-presets.ts` writes to *both* a tracked
directory and `pipeline/out/assets/presets`; with `out/` absent the second set is
missing and `--check` reports every file as differing. The suite is therefore
artifact-dependent and declares **no artifact gate**, violating the mandatory
skip-vs-fail policy. It escaped the §9 scan because it never names
`pipeline/out/` itself — the dependency is transitive, through the CLI it spawns.

---

## 11. Scope, cleanliness and injection audit (task item 6)

```
$ git status --porcelain | wc -l
72
$ git status --porcelain | grep -vc "websim/"
0
```

**Every one of the 72 entries is under `websim/`. Nothing outside `websim/` and
`.github/` was created, modified or deleted.** Scope rule respected.

**No mutation injection remains.** Three independent checks:
1. `grep` for `MUTANT|INJECT|__mut|XXX_MUT|deliberate defect` over
   `websim/engine/src/` — zero hits.
2. The mutation harness's own baseline comparison: `clean: all 12 target files
   match baseline` (covering `step.ts`, `sim.ts`, `dijkstra.ts`,
   `closures/runtime.ts`, `decision/closureReaction.ts` and 7 others).
3. `npm test` green at 1369/1369, which an injected perturbation would break.
No `.orig`, `.bak`, `.rej` or `.mut` files anywhere in the tree.

### 11.1 Things this agent flags as suspicious

1. **`websim/nul` — a stray 159,742-byte untracked file.** ASCII, containing a
   list of SHA-256/path pairs. It is the artifact of a Windows shell redirect to
   `nul` under Git Bash, which creates a real file. Harmless but it must not be
   committed. Delete it.

2. **A commit exists, despite "NEVER run `git commit`".** `5f10415`
   ("websim(WP0-WP7): browser-native TypeScript port checkpoint"), authored
   `Fri Jul 31 17:04:22 2026`, 306 files (305 under `websim/`, 1 under
   `.github/`). The session-start snapshot in this agent's own brief lists
   `de7c045` as HEAD and shows `websim/` and `.github/` as *untracked*, so this
   commit was created during this workflow, by an earlier agent, in breach of
   standing rule 2. It contains WP0–WP7, not WP8; WP8 is the 72 uncommitted
   entries. It did not touch anything outside `websim/` + `.github/`, so the
   scope rule held. Reported for governance, not as a technical defect. This
   agent created no commits.

3. **`check:scratch`'s documented remedy is dangerous in the current state.**
   The allowlist in `tools/check-scratch.ts:86-96` gained `closure-fixtures` but
   not `decision-fixtures`, `smoke-severe` or `wp8-replay` — all three of which
   *are* produced by documented steps:
   - `decision-fixtures` ← `pipeline/java-exporter/dump-decision-trace.ps1` (477 MB)
   - `smoke-severe` ← `npx tsx pipeline/scripts/build-smoke-severe.ts`
     (writes `smoke-severe/severe-series-19check.json` via `writeAsset`)
   - `wp8-replay` ← `npx tsx validation/scripts/wp8-archive-replay.ts` (31 MB)

   So the guard reports them as scratch and exits 1. The message it prints
   recommends `npm run check:scratch -- --clean`, which calls
   `rmSync(recursive)` on every finding — i.e. **following the tool's own advice
   would destroy 538 MB of irreplaceable Java oracle dumps** and silently gut the
   WP8 decision and closure gates. Three missing allowlist lines; high blast
   radius. This is the highest-severity easy fix in the report.

---

## 12. Never-regress gotchas (task item 8)

Verified by a script this agent wrote, importing the real modules and applying
them itself. All four fire.

| # | gotcha | mechanism | result |
|---|---|---|---|
| 1 | correct citation only; the banned-name rule | `tools/claims.ts` rules (a specific-citation pattern and a bare-surname pattern) | 3/3 seeded violations flagged; the correct citation **not** flagged |
| 2 | no fire-comparison phrasing | `tools/claims.ts` comparison + hyphenated-qualifier patterns | 2/2 seeded violations flagged |
| 3 | `simulationHours <= slices - 1` | `assertRunWindowFitsSeries` throws `RunWindowOverrunError` | 455/456 accepted; **456/456 threw**; 312/456 accepted; **576/576 threw** |
| 4 | negative Repast constants declared `"double"` | `repastConstantType` in `shared/src/schema.ts` | `pushThetaThreshold=-0.25 -> "double"`; `alphaHazard=-8.0 -> "double"`; `pushThetaThreshold=0.0 -> "number"`; `bRisk=0.4 -> "number"` |

`npm run lint:claims` is additionally green over 357 files against 23 active
rules. (This document is written to avoid the banned literals so that it does not
itself trip the linter it is reporting on.)

---

## 13. The two adversarial refutation attempts (task item 7)

Selected as the two claims most damaging if false.

**Claim A — "Tier-2 own-engine R3 byte-identity is achieved."**
*Attempt:* bypass the tree's comparator entirely; re-run the acceptance CLI,
re-derive the shared projection independently, hex-encode, hash, and diff bytes;
then check the negative control actually differs so the method can fail.
*Outcome:* **SURVIVED.** Nine identity comparisons byte-identical across arms
A/B/C and all three scenarios; both negative-control tables differ, at known byte
offsets. The claim is true as stated.

**Claim B — "ER/SE/SE2 presets reproduce the archived direction-of-effect."**
*Attempt:* tabulate port-vs-archive from the replay report; check whether any
decision-layer-only quantity moved; check whether the port's output is closer to
the ER archive or to the pre-E legacy archive; check whether the archived
configuration can execute at all.
*Outcome:* **REFUTED.** Policy refusals are 0 against 495–709; sheltered counts
are 1.58x–5.62x the archive; three different scenarios produce identical
sheltered counts; the port's ER output matches the pre-E legacy archive
(6,546/6,842 rows identical) rather than the ER archive (0/6,842); and the L1
regime the archived configs require cannot complete a run. Per the standing
instruction to default to "refuted" absent independent reproduction, and here
with positive evidence of falsity.

---

## 14. What is genuinely done, partial, and unproven

**Genuinely done — high quality, would survive contact with WP9.**
- The Phase-E decision arithmetic, oracle-tested against a live-Repast trace over
  3.78 M sampled agent-hours, 123,156 residents, 20 runs, including the RNG draw
  sequence/count/digest and 57-of-72 branch coverage against the Java probe.
- The closure wave and reaction layers, against a reflectively-constructed
  certified `ClosureWave` — 324 tree states, 9.79 M distance+predecessor entries.
- The ported gates (f)(g)(h)(i)(k)(l), green on 60 Java-produced runs with
  per-gate corrosion on real archived bytes.
- Tier-2 own-engine R3 byte-identity, including the closures-inert variant.
- The severe-series builder, against four independent oracles.
- The `pushThetaThreshold` honesty note.
- All four never-regress gotchas.
- The self-honesty of the work: every one of the structural defects in §5 and §3.1
  is disclosed by the implementing agents in their own test headers, with the
  assertions written so that fixing the defect turns the test red. That is the
  right way to leave a known gap, and it is why this verification could be
  precise rather than archaeological.

**Partial.**
- WP8's decision layer is a *library*, not an *integration*. Every component is
  verified; nothing calls them from `Simulation`.
- Clause 4 is reproduced, but on a different agent population than the archive's.

**Claimed or implied but unproven / false.**
- ER/SE/SE2 direction-of-effect: **false** as measured, and unreachable until the
  two wiring gaps close.
- "Green pipeline": `npm run ci` is red via `check:scratch`.
- Clean-clone exit 0: red, two suites.

---

## 15. NO-GO rationale and the exit checklist

WP8 is close, and most of it is unusually well evidenced. It is a NO-GO because
one of five acceptance clauses is measurably false rather than merely untested,
and because two standing repository properties regressed.

Blocking, in the order they should be fixed:

1. **Wire the decision layer into `Simulation`.** Port `ContextCreator.java`
   step 11: give `SimulationOptions` a `DecisionConfig`, call `armResident` at
   build time. When this lands, `wp8-r3-own-engine.test.ts`'s "the shipped pass
   is VACUOUS" case goes red on purpose — replace it with the `armed` assertion,
   as its comment instructs.
2. **Implement `anyUntriedReachableShelter` on `Simulation`** so
   `informationRegime = 1` can complete a run. Until then no archived ER/SE/SE2
   configuration is executable and clause 3 cannot be attempted.
3. **Re-run the ER/SE/SE2 replay and re-score clause 3**, and gate it with a test
   so that a future regression cannot hide behind a green suite.
4. **Add `decision-fixtures`, `smoke-severe`, `wp8-replay` to
   `PRODUCED_ENTRIES`** in `tools/check-scratch.ts`, restoring `npm run ci` to
   green and defusing the `--clean` hazard. Until then, do not run
   `npm run check:scratch -- --clean` on this machine.
5. **Fix the two clean-clone breakers** (§10.1, §10.2): move the manifest read
   out of the describe body (or make `describeGated`'s skip branch stub the
   body — the systemic fix), and gate `pipeline/test/build-presets.test.ts`.
6. **Delete `websim/nul`.**

Advisory, non-blocking:

7. Retitle the `hour.tsv` case so it does not say "bit-exact" of a value compared
   to a 4-ulp cap (§8.1).
8. Re-measure clause 4 after item 1, since the zero may not survive a real
   decision-layer population.

None of the blocking items requires re-deriving any oracle. The Java dumps, the
gates and the flagship identity all stand; what is missing is the wiring between
them and the shipped engine, plus three lines in an allowlist.
