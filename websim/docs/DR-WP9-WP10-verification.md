# DR-WP9-WP10-verification — independent acceptance gate on WP9 and WP10

**Author:** third-party acceptance gate (no authorship of WP9 or WP10).
**Date:** 2026-08-02.
**Tree under test:** `main` at `6cf106c` + uncommitted WP9/WP10 work
(34 entries under `websim/` in `git status --porcelain`).
**Method:** every clause was executed, not read. Where a clause could be broken,
it was broken, the suite was run, the failure was read, the source was restored,
and the restoration was proved by SHA-256 against a digest taken before the edit.
Nothing in this document rests on inspecting code that looked correct.

---

## 0. Verdict

| Work package | Verdict |
|---|---|
| **WP9 — validation harness + replay + Tier 4** | **NO-GO** on the tree as it stands. The scientific content is the strongest in this repository and every model-facing clause is defended by a revert-proof. It is blocked by two mechanical failures that are not about the model — `npm run ci` and `npm test` are both red — and by one false statement inside the shipped `VALIDATION_REPORT.json`. |
| **WP10 — worker runtime, streaming, snapshots, Compare backend** | **NO-GO** on the tree as it stands. Both measurable clauses hold and one is revert-proofed hard. It is blocked by the fact that **WP10's own two new files are what make `npm run ci` red**, and by the third clause ("Compare runs two synced workers") having no test in the delivered suite. |

Neither verdict is a statement that the port is wrong. Every divergence census,
every gate, every byte-identity property I could break and watch behaved
correctly. The blockers are a typecheck the work package never ran, a suite that
no longer fits in its own timeouts, and one sentence of prose contradicted by the
numbers printed beside it.

---

## 1. Release blockers

### B1 — `npm run ci` fails (exit 2). WP10's new files do not typecheck.

```
$ npm run ci
> @websim/engine typecheck
test-browser/worker/harness.ts(46,22): error TS2693: 'Worker' only refers to a type, but is being used as a value here.
test-browser/worker/harness.ts(54,17): error TS2339: Property 'onmessage' does not exist on type 'MessagePort'.
test-browser/worker/harness.ts(54,34): error TS2315: Type 'MessageEvent' is not generic.
test-browser/worker/uithread.worker.test.ts(92,24): error TS2339: Property 'onmessage' does not exist on type 'MessagePort'.
test-browser/worker/uithread.worker.test.ts(126,32): error TS2322: Type '"longtask"' is not assignable to type 'EntryType'.
test-browser/worker/uithread.worker.test.ts(258,16): error TS2339: Property 'onmessage' does not exist on type 'MessagePort'.
test-browser/worker/uithread.worker.test.ts(258,33): error TS2315: Type 'MessageEvent' is not generic.
CI_EXIT=2
```

Reproduced standalone with `npx tsc -p engine/tsconfig.json --noEmit`. Root cause:
`tsconfig.base.json` sets `"lib": ["ES2022"]` and `"types": ["node"]` with no DOM
library, and `engine/tsconfig.json` includes `test-browser/**/*.ts`. The
pre-existing browser file `engine/test-browser/cross-engine.digest.test.ts`
avoided the problem by never naming a DOM type (it reads `globalThis` through a
structural cast). The two WP10 files use `new Worker`, `MessagePort.onmessage`,
generic `MessageEvent<T>` and the `longtask` entry type directly.

Why this matters beyond tidiness: `npm run ci` runs `typecheck` **first**, so a
failing typecheck means CI never reaches `npm test`, `check:scratch` or
`lint:claims`. The whole gate is dark. Vitest transpiles without typechecking,
which is why `npm run test:browser` is green while the same files do not compile
— a green browser run is not evidence that this was ever built.

### B2 — `npm test` fails (exit 1) on a quiet machine: 2 of 1,742 tests time out.

```
Test Files  2 failed | 108 passed (110)
     Tests  2 failed | 1740 passed (1742)
    Errors  4 errors        ([vitest-worker]: Timeout calling "onTaskUpdate" x4)
  Duration  1121.91s
```

Both failures are wall-clock timeouts, never assertions:

- `validation/test/wp7-vertical-slice.test.ts > n=6,842: sheltered lands inside the 9-seed archive band, unreachable is EXACT` — `Test timed out in 60000ms`
- `validation/test/tier4-attribution.test.ts > compares the same 6,842 keys against the same archive run` — `Test timed out in 120000ms`

Run in isolation the same two files pass in **53.27 s** (23 tests, exit 0). So
this is not a defect in either test; it is that WP9's seventeen-configuration
replay and WP8's 225 s decision-oracle trace now saturate every fork, and the
older single-threaded 6,842-agent archive tests are starved past budgets that
were set when the suite was smaller. Two of two full-suite runs were red — the
first (1,183 s) with light concurrent load from this gate, the second (1,122 s)
with the box otherwise quiet.

`vitest.config.ts`'s own header states the principle this violates: *"A gate that
reports the port as broken because something else on the box was busy is not a
gate."* Here the something else is the suite itself.

### B3 — the shipped `VALIDATION_REPORT.json` contains a false statement about the archive.

`tiers.tier4.caution`, and the module doc it is copied from
(`validation/src/harness/tier4-census.ts`, "The caution this module is required
to carry"), both say of the ER / SE / SE2 configurations:

> "…they shelter 1,215–1,307 residents against arm A's 2,234 beds with
> `REFUSED_ALL_FULL = 1`: **no shelter saturates**, so the shuffle channel has
> nothing to act on."

The same JSON object, two fields above, records `"capacity_binds": true` for
every one of those five configurations, with `saturated_sites` 8–12 of 36 and
`capacity_refusals` 291–443. I read the certified archive bytes directly to
settle it:

```
docs/runs/scenario-e/SE-E18-seed42/shelters.csv
SATURATED sites (final_occupancy >= capacity): 9 of 36
  Clark_Center 90/90 · Laurelwood_Center 120/120 · River_District_Navigatio 100/100
  Roseway_Inn_Motel_Shelte 150/150 · Parkrose_Community_Villa 11/11 · St_Johns_Village 21/21
  Lilac_Meadows 127/127 · BIPOC_SRV 42/42 · Menlo_Park_SRV 55/55
sum refused_count=834  sum policy_refused=543  capacity refusals=291
```

Nine shelters fill and 291 residents are turned away for capacity. The channel
had every opportunity to act. The correct statement is *stronger* than the one
shipped — the port reproduces those runs byte-for-byte **despite** capacity
binding — but the artifact as written tells a reader something about the archive
that the archive does not say, and nothing in the suite asserts that the caution
text agrees with the `capacity_binds` / `saturated_sites` fields printed beside
it. That is the shape of defect this project's own quirk ledger exists for.

---

## 2. Clause-by-clause

Legend: **RP** = defended by a revert-proof I executed (broke it, watched
something go red naming it, restored, verified by SHA-256). **M** = measurement
only — true today, with nothing that would notice it breaking.

### WP9 — plan §8, verbatim

| # | Clause | Result | Defence |
|---|---|---|---|
| W9-1 | all Tier-3 gates green on replays of A/B/C seeds 42–44, ER, SE-E18, SE2-E18-d1, E0 nulls | **green, measured** | **RP (weak)** |
| W9-2 | Tier-4 report shows zero unexplained divergences | **green, independently re-derived** | **RP (strong)** |
| W9-3 | CI goes red on the injected seed perturbation | **partial** | **RP** for the gate's own can-fail proof; the plan's *named* injection is deferred |
| W9-4 | nightly job wired | **wired but inert** | **none — ungated** |
| W9-5 | loud-degradation on missing archive | **green for a missing root; partial for a partial archive** | **RP** |

**The replay set does cover the clause as written.** I enumerated it rather than
trusting the count: 17 targets = `present-day-three-arm/{A,B,C}-seed{42,43,44}`
(9) + `phase-e/ER-A-n6842-seed42` (1) + `scenario-e/E0null-{A,B,C}-seed42` (3) +
`scenario-e/SE-E18-seed42`, `scenario-e/SEnc-E18-seed42`,
`scenario-e-v2/SE2-E18-d1-seed42`, `scenario-e-v2/SE2nc-E18-seed42` (4). That is
the plan's named list — A/B/C seeds 42–44, ER, SE-E18, SE2-E18-d1, E0 nulls —
plus the two no-closure variants, so a superset. The set is derived from
`WORKING_SET` rather than re-listed, and the suite asserts the class histogram
`{pre-e: 9, er: 1, null: 3, se: 4}`, so a run cannot drop out silently.

### WP10 — plan §8, verbatim

| # | Clause | Result | Defence |
|---|---|---|---|
| W10-1 | snapshot-replay byte-identity holds in the worker (not just Node) | **green in Chromium, Firefox, WebKit** | **RP (strong)** |
| W10-2 | UI thread long-task-free (< 50 ms) at max speed | **green on the synthetic world** | **M** — positive control fires, but the budget is unmeasured at production scale |
| W10-3 | Compare runs two synced workers | **true — I proved it myself** | **none in the delivered suite — ungated** |

---

## 3. The revert-proofs, in full

Every experiment used the same harness: SHA-256 the target, park the original
outside the repository, apply one exact textual substitution, run a real child
`vitest`/`tsx`, restore from the parked copy in a `finally`, re-hash. Every one
of the eight restored to the exact pre-experiment digest.

### RP5 — W9-1 and W9-2. A 10 % movement step-length error vs. the WP9 acceptance suite.

The defect that once passed all 1,084 tests at WP7.

```
file        engine/src/agents/step.ts
find        const stepLengthM = walkingSpeedMps * 60 * minutesPerTick;
replace     const stepLengthM = walkingSpeedMps * 60 * minutesPerTick * 1.1;
command     npx vitest run validation/test/wp9-replay-acceptance.test.ts
sha before  134862c2303ef6d6b5dd23cf71b41aa084bbef9da21295d6b702992b7b7dd909
sha mutated 58557c78e1028c6044721b2c655c97689647ad7c0d3a74147e23ab342b3ff48d
sha after   134862c2303ef6d6b5dd23cf71b41aa084bbef9da21295d6b702992b7b7dd909   RESTORED
result      exit 1 — Tests 23 failed | 24 passed (47), 315 s
```

What went red, and how it named the thing:

- **Tier 4 UNEXPLAINED on all seventeen configurations**, including the five that
  are EXACT in the clean tree. At A-seed42 the attribution reads
  *"1040 resident(s) were refused at NO door in EITHER run yet differ in bytes"*
  followed by the twelve implicated columns with counts
  (`time_arrived_tick×1040 … hours_above_unhealthy×1038`) — the exact partition
  argument the module claims, firing on the exact defect class the project has
  measured going undetected.
- **The permutation envelope caught it too**: *"154 final_state flips sits
  OUTSIDE the sampled permutation support [94, 144] over 200 streams."*
- `zero UNEXPLAINED divergences across the whole replay set` — red.
- `emits a VALIDATION_REPORT.json that passes its own schema` — red.
- **Tier 3 went red on only 2 of 17 configurations** (`scenario-e-v2/SE2-E18-d1-seed42`,
  `scenario-e-v2/SE2nc-E18-seed42`).

That last line is the honest reading of W9-1. A 10 % movement error leaves the
Tier-3 gate suite green on **15 of 17** replays. The Tier-3 clause is therefore
defended by a revert-proof, but weakly; it is Tier 4 that is load-bearing, and
Tier 4 is defended on 17 of 17. Anyone quoting "all Tier-3 gates green" as the
headline is quoting the less sensitive half of the evidence.

### RP4 — W10-1. Drop one field from the snapshot restore; watch the browser.

```
file        engine/src/worker/snapshot.ts
find        the 11-line believedFull restore block in restoreSnapshot
replace     void c.believedFull[i];
command     npx vitest run --config engine/vitest.browser.config.ts engine/test-browser/worker/snapshot.worker.test.ts
sha before  ec5dc206ea5fb15f6bce256a5c33a4cd57e2b92284c21d90a32aee0dbb0808cc
sha after   ec5dc206ea5fb15f6bce256a5c33a4cd57e2b92284c21d90a32aee0dbb0808cc   RESTORED
result      exit 1 — Tests 9 failed | 12 passed (21), all three engines
```

The failure names the field and the token index in every engine:

```
Chromium: worker replay diverged. token 445: r[5].believedFull.size=1 != r[5].believedFull{1}="SH0"
Firefox : (identical)
WebKit  : (identical)
scrub-and-continue diverged: expected 'bf64578d3713…' to be 'ad5698a2a485…'
```

This is the strongest single piece of evidence in WP10. The digest is reflective
(`Object.keys` at run time), so it cannot be blind to the field the snapshot
forgot, and the property is checked inside a real `Worker` running the shipped
`simWorker.ts` across three JS engines.

### RP2 — W9-3. Delete the mutation CI job's assertions; does the job still fail?

Baseline first:

```
$ npx tsx validation/test/mutation/run-mutation-gate.ts --prove-can-fail --scope fast
FAIL  control.inert-lie   THE SUITE STAYED GREEN under an injected defect (655 passed, 0 skipped, 40 files)
CAN-FAIL PROOF PASSED
exit 0
```

**RP2a — delete the "went green" assertion** (`if (!r.red) {` → `if (false as boolean) {`):

```
sha before  b40c4643bcc9d84421cc9e92d835c6082ab0cfd075ac7feca2710d709e6a6008
sha after   b40c4643bcc9d84421cc9e92d835c6082ab0cfd075ac7feca2710d709e6a6008   RESTORED
exit 0 — and for the right reason:
  FAIL  control.inert-lie   red, but NOT by the declared detector.
  CAN-FAIL PROOF PASSED
```

The second, independent assertion (the named-detector requirement) fired in its
place. The two are genuinely redundant.

**RP2b — delete *both* assertions** (also
`if (wanted !== null && named === undefined)`):

```
sha before  b40c4643bcc9d84421cc9e92d835c6082ab0cfd075ac7feca2710d709e6a6008
sha after   b40c4643bcc9d84421cc9e92d835c6082ab0cfd075ac7feca2710d709e6a6008   RESTORED

--- MODE --prove-can-fail --scope fast → exit 1
    PASS  control.inert-lie   RED as required (0 failing)
    CAN-FAIL PROOF FAILED: the gate did NOT fail on an inert injection.

--- MODE --gate --scope fast --only formatter.negative-zero → exit 0
    MUTATION GATE PASSED — 1 injected defects, all detected.
```

This is the answer to the question as posed. With both assertions gone the
**gate itself becomes fully vacuous and reports PASS**, but the CI job still goes
red, because `--prove-can-fail` is an inverted step that runs *before* the gate
and requires the gate to report failure on an inert edit. The job fails for the
right reason. The inversion is real defence-in-depth and it works.

### RP3 — W9-3. The plan's *named* seed perturbation is now clean-clone provable, and the catalogue does not know it.

Plan §5.2 names a seed perturbation specifically. The catalogue's row for it,
`seed.replay-run-seed` (+1 on `buildWorld`'s seed), is marked
`needsArtifacts: true`, so the hosted CI job **defers it with a `!!` banner** and
proves a surrogate (`seed.population-derivation`) instead. The row's note says
its only non-artifact detector *"is not in the committed tree at all (WP10 work
in progress)"*.

WP10 has since landed that file. I ran the injection:

```
file        engine/src/world/build.ts
find        const seed = BigInt(Math.trunc(config.randomSeed));
replace     const seed = BigInt(Math.trunc(config.randomSeed)) + 1n;
command     npx vitest run engine/test/worker/ engine/test/rng/streams.test.ts engine/test/determinism/
sha before  3224c3294ef59520eb9863cc98f6b65cca85d2555b5f993fdc2a7ee6d0d6a61a
sha after   3224c3294ef59520eb9863cc98f6b65cca85d2555b5f993fdc2a7ee6d0d6a61a   RESTORED
result      exit 1 — Tests 1 failed | 98 passed (99)
FAIL engine/test/worker/world.census.test.ts > synthetic WP10 world
     > reaches all six resident states, including UNREACHABLE via the island
```

`engine/test/worker/world.census.test.ts` is not artifact-gated and runs on a
clean clone. So the plan's literally-named injection **is** provable in the
hosted job today; the catalogue row is stale and the deferral is now
unnecessary. Two caveats before anyone just flips the flag: the detector is a
state-census assertion (`distinctStates === 6`), which catches this offset
incidentally rather than by design, and the catalogue's own discipline requires
`detector` and `needsArtifacts` to be *measured* by `--measure`, not edited by
hand.

### RP1 — the four never-regress gotchas, by live injection.

**Gotcha 1 + 2 (rules `banned-citation` / `banned-severity-comparison`).** One
sentence inserted into `websim/README.md` containing the retired citation form
and a banned severity-comparison phrasing:

```
sha before  a38b8cbd3d2e905bdd73e87b09722670856a974fd99480cad24e517343b9fd6f
sha after   a38b8cbd3d2e905bdd73e87b09722670856a974fd99480cad24e517343b9fd6f   RESTORED
$ npm run lint:claims → exit 1
README.md:495:42: banned-citation [banned] matched: <the retired surname form>
README.md:495:80: banned-severity-comparison [banned] matched: <the comparison phrasing>
claim linter: 2 hit(s) in 1 file(s); 435 file(s) scanned against 23 active rule(s)
```

Both fired, both printed the sanctioned replacement. Baseline: 0 hits, clean.

**Gotcha 3 (`simulationHours ≤ slices − 1`, enforced as a THROW).** First a
two-directional live probe through `parseRunConfig` on a real preset:

```
code=0 limit=575 hours=575 -> ACCEPTED      code=0 hours=576 -> THREW
code=1 limit=455 hours=455 -> ACCEPTED      code=1 hours=456 -> THREW
code=2 limit=455 hours=455 -> ACCEPTED      code=2 hours=456 -> THREW
```

Then the revert-proof — neuter the limit in `RunConfigSchema.superRefine`:

```
sha before/after  493c06943f5114579fe997f0198c44ac6b099073b14912c9574de5b9ce78fb59   RESTORED
exit 1, four tests red, all naming the rule:
  smoke-window cross-field rule (simulationHours ≤ slices − 1) > catches the 456-vs-455 case the gate was written for
  smoke-window cross-field rule (simulationHours ≤ slices − 1) > accepts the maximum and rejects one hour past it, per series
  diffing > catches a cross-field violation introduced by a patch
  permalink resolution > reports a config the schema rejects rather than running it
```

**Gotcha 4 (Repast zeroes negative `"number"` constants).** Negative-control
scope first (`shared/test/` + `validation/test/preset-batch-parity.test.ts`:
7 files, 148 tests, green). Then remove the promotion in `repastConstantType`:

```
find     return base === "number" && value < 0 ? "double" : base;
replace  return base;
sha before/after  493c06943f5114579fe997f0198c44ac6b099073b14912c9574de5b9ce78fb59   RESTORED
exit 1, four tests red:
  schema > Repast batch constant typing (the negative-zeroing gotcha) > promotes a negative double to 'double' and leaves the positive a 'number'
  schema > … > never emits 'number' for a negative value of any parameter   (minutesPerTick at -1)
  presets vs the archived executed manifests > keeps every negative archived value typed 'double', never 'number'
  preset values match the read-only batch files > types every negative preset value as a Repast 'double', never a 'number'
```

All four gotchas fire. None is decoration.

### RP6 — W9-5. Hide an archive input.

`docs/runs/` is read-only, so I built a parallel archive root out of NTFS
directory junctions — every one of the 90 run directories linked in, except
`present-day-three-arm/B-seed43`, which was omitted. `B-seed43` is deliberately
**not** the directory the artifact gate probes.

**The CLI degrades exactly as required:**

```
$ WEBSIM_ARCHIVE_ROOT=<partial> npx tsx validation/scripts/wp9-validation-report.ts
!! ARCHIVE INCOMPLETE — the replay set is not fully present, so this run cannot produce
!! the report it is for. Named rather than skipped:
!!   present-day-three-arm/B-seed43
!! present:      16 of 17 target(s)
!! archive root: …\partial-archive (env)
!! produce:      point WEBSIM_ARCHIVE_ROOT at the full docs/runs archive, or at a
!!               working set materialised by validation/working-set/ (see its README).
CLI_EXIT=2
```

**The vitest acceptance suite degrades less well.** Same partial archive,
`WEBSIM_REQUIRE_ARTIFACTS=1`:

```
FAIL validation/test/wp9-replay-acceptance.test.ts
Error: ENOENT: no such file or directory, open '…\partial-archive\present-day-three-arm\B-seed43\simulation.json'
 ❯ buildTargetConfig src/harness/working-set-replay.ts:235:5
 Test Files  1 failed (1)
      Tests  47 skipped (47)
exit 1
```

It fails, and it names the path — so it is **not silent**, which is the
load-bearing half of the requirement. But there is no `!!` banner, no "evidence
forgone", no `produce:` remedy, and the run summary reads **"47 skipped"**, which
in a scrolled CI log is the exact reading the policy exists to prevent. The cause
is that the gate's `artifacts` list probes `WP9_REPLAY_TARGETS[0]` only: any of
the other sixteen archived runs can vanish and the gate still says "run". Remedy:
list every target directory in the gate's `artifacts`, or call
`gatedFixturePresent` per target inside `beforeAll`.

### RP7 — W10-3. Two synced Compare workers (my own probe, since the suite has none).

I wrote a temporary browser test, ran it, and deleted it. Two **separate real
`Worker`s** running the shipped `simWorker.ts`, both seeded 42, stepped in
lockstep through six synchronisation points, with clock equality and digest
equality asserted at each:

```
stops     60, 180, 300, 420, 600, 720
Chromium  ["7a9c0c1d917d","5e99948d326c","cd470dc0bfda","29aca5f8e216","f8ff678ffab7","ad5698a2a485"]
Firefox   ["7a9c0c1d917d","5e99948d326c","cd470dc0bfda","29aca5f8e216","f8ff678ffab7","ad5698a2a485"]
WebKit    ["7a9c0c1d917d","5e99948d326c","cd470dc0bfda","29aca5f8e216","f8ff678ffab7","ad5698a2a485"]
Test Files 3 passed (3) · Tests 6 passed (6) · exit 0
```

Six distinct digests, so the comparison discriminates; identical across all three
engines; and the positive control (seeds 42 vs 43, same lockstep) diverges at
every stop. **The capability is real.** What does not exist is any shipped test
that says so — see §5, U3.

---

## 4. Independent re-derivation of the Tier-4 census

I did not read the harness's numbers and agree with them. I wrote a separate
census in Python that reads only raw bytes — the port's written
`agents.csv`/`shelters.csv` under `pipeline/out/wp9-validation/` and the certified
Java bytes under `docs/runs/` — joins on `agent_id`/`shelter_id`, compares cells
as text with no coercion, and re-implements the release rules from the module's
own stated mechanism rather than from its code.

```
run                                    verdict        rows     cells     ident    %ident divCols  never nevDiv  flips binds
present-day-three-arm/A-seed42         ORDER-CHANNEL  6842    314732    311007  98.81645      19   1714      0    114  True
present-day-three-arm/A-seed43         ORDER-CHANNEL  6842    314732    310892  98.77991      19   1718      0     96  True
present-day-three-arm/A-seed44         ORDER-CHANNEL  6842    314732    311349  98.92512      19   1727      0     88  True
present-day-three-arm/B-seed42         ORDER-CHANNEL  6842    314732    312046  99.14658      19   4118      0     12  True
present-day-three-arm/B-seed43         ORDER-CHANNEL  6842    314732    311310  98.91273      19   4131      0     34  True
present-day-three-arm/B-seed44         ORDER-CHANNEL  6842    314732    312002  99.13260      19   4118      0     14  True
present-day-three-arm/C-seed42         ORDER-CHANNEL  6842    314732    311781  99.06238      19   3970      0     12  True
present-day-three-arm/C-seed43         ORDER-CHANNEL  6842    314732    311910  99.10336      19   3990      0      8  True
present-day-three-arm/C-seed44         ORDER-CHANNEL  6842    314732    311437  98.95308      19   3893      0      8  True
phase-e/ER-A-n6842-seed42              EXACT          6842    355784    355784 100.00000       0   6567      0      0  True
scenario-e/E0null-A-seed42             ORDER-CHANNEL  6842    383152    379427  99.02780      19   1714      0    114  True
scenario-e/E0null-B-seed42             ORDER-CHANNEL  6842    383152    380466  99.29897      19   4118      0     12  True
scenario-e/E0null-C-seed42             ORDER-CHANNEL  6842    383152    380201  99.22981      19   3970      0     12  True
scenario-e/SE-E18-seed42               EXACT          6842    383152    383152 100.00000       0   6568      0      0  True
scenario-e/SEnc-E18-seed42             EXACT          6842    383152    383152 100.00000       0   6539      0      0  True
scenario-e-v2/SE2-E18-d1-seed42        EXACT          6842    383152    383152 100.00000       0   6493      0      0  True
scenario-e-v2/SE2nc-E18-seed42         EXACT          6842    383152    383152 100.00000       0   6499      0      0  True

EXACT=5  ORDER-CHANNEL=12  UNEXPLAINED=0
```

This matches the shipped report cell for cell (`5 EXACT, 12 ORDER-CHANNEL, 0
UNEXPLAINED`; A-seed42 `314732 / 311007 / 6546 rows identical / 1714 never-refused
/ 5128 door-contested / 114 flips / 57+57`) and matches every saturation figure.
The release rules hold independently on all seventeen:

- **zero never-refused divergent rows** (rows with `door_refusals == "0"` on both sides), on every configuration;
- **zero build-time columns moved** — none of the 29 in `BUILD_TIME_COLUMNS` differs anywhere;
- **every flip is a balanced `SHELTERED ↔ REFUSED_ALL_FULL` swap**, no foreign transition on any configuration;
- **zero sites admitted a different number** of residents;
- **zero sites with an identical admitted set but a different `mean_travel_dist_m_admitted`** (I recomputed the 2×2 separately: `sameSet/sameCol` 5–36, `sameSet/DIFFCol` **0** everywhere);
- **zero co-admitted, never-refused residents whose `total_travel_distance_m` differs**;
- door ledgers close identically on both sides of every configuration.

**"Zero unexplained divergences" is confirmed.**

### 4.1 The percentile requirement is met for one configuration out of twelve

The acceptance standard I was asked to apply is that a divergence attributed to
the shuffle channel must be **shown to sit inside a permutation distribution,
with the percentile stated**. That standard is met exactly once:

```
committed census sampled at present-day-three-arm/A-seed42: n=200 streams
  support [94, 144], mean 116.89, sd 8.5835
  p01=97.98 p05=102 p25=111.5 median=118 p75=122 p95=130 p99=134.02
  observed=114  percentile=31  z=-0.3367  two-sided empirical p=0.7761
  present-day-three-arm/A-seed42   114 flips  INSIDE=True  → 31st percentile of 200 streams
```

For the other **eleven** diverging configurations — A-seed43 (96 flips),
A-seed44 (88), B-seed42/43/44 (12/34/14), C-seed42/43/44 (12/8/8), and the three
E0 nulls (114/12/12) — **no permutation census was sampled, so no percentile
exists and none can be stated.** The harness is honest about this: it sets
`envelope.applicable = false` with the reason *"the committed census was sampled
at present-day-three-arm/A-seed42, not …"*, and `wp9-tier4-census.test.ts`
corrodes the rule in both directions. `DR-WP7-order-attribution.md` is right that
placing an observation in a distribution sampled elsewhere would be an assertion
rather than a measurement.

But honest is not the same as satisfied. For eleven of twelve diverging
configurations the attribution rests **entirely on the partition argument** —
never-refused rows byte-identical, balanced swaps, cardinality preserved,
build-time columns still, ledgers closed. That argument is strong (RP5 shows it
fires hard on a real defect) and it is not a percentile. Anyone reporting "every
divergence sits inside a permutation distribution" would be overstating by a
factor of twelve.

Two smaller gaps in the same area:

- the shipped report's `envelope_note` carries the **support** (`observed 114 in [94, 144] — inside`) but **not the percentile**, even though `order-permutation-census.json` records `observed_percentile: 31`, `z`, and a two-sided empirical p;
- for the nine `present-day-three-arm` runs the census is defined on **46 of the port's 56 agent columns**. The other ten (`aware_initial`, `aware_tick`, `heavy_belongings`, `has_pet`, `has_dependents`, `theta_z`, `blockages_encountered`, `push_throughs`, `reroutes`, `stuck_events`) have no counterpart in that logger generation and are therefore compared against nothing. `bitMatchCensus` records this in `columnsPortOnly`, but neither the report's headline nor the acceptance test surfaces it (the test asserts only `comparedColumns.length >= 45`).

---

## 5. Ungated claims

The most important output of this gate. Each of these is **true today** with
nothing that would notice it breaking.

**U1 — "nightly job wired" is wired but inert.** `.github/workflows/websim-nightly.yml`
parses, has the right steps, and is correct in content. Its only job carries
`if: ${{ vars.WEBSIM_ARTIFACT_RUNNER == 'true' || github.event_name == 'workflow_dispatch' }}`.
On the `schedule` trigger with that repository variable unset — its state today,
as far as anything in the tree records — the job is **skipped** and the workflow
reports success having run nothing. The clause "nightly job wired" is satisfied
in the sense of "the file exists and would work"; it is not satisfied in the
sense of "a nightly full-archive validation happens". No revert-proof is possible
from this machine. **This is the clause with the weakest evidence in WP9.**
(The same conditional guards `websim-ci.yml`'s `strict-artifacts` job and the
`mutation-gate-full` job, so the artifact-gated half of *all three* workflows is
currently latent.)

**U2 — the UI-thread budget is unmeasured at production scale.** The measurement
is real and the probe is shown able to fail:

```
Chromium  samples=134719  p50=0  p90=0  p99=0.1  max=4ms   longTasks=0  frames=1441  10,416,316 B  worker 1440 ticks in 1168 ms
Firefox   samples=118233  p50=0  p90=0  p99=0    max=40ms  longTasks=0  frames=1285   9,288,652 B  worker 1440 ticks in  708 ms
WebKit    samples=2253    p50=1  p90=1  p99=3    max=15ms  longTasks=0  frames=1441  10,416,316 B  worker 1440 ticks in 1352 ms
positive control (120 ms deliberate block): max 121–123 ms, longTasks 1, in all three
```

But it runs on the synthetic world at **800 residents and 24 simulated hours**.
Production is 6,842 residents and up to 455 hours — roughly 8.5× the per-frame
payload. Firefox's worst gap is already 40 ms against a 50 ms threshold, i.e. 20 %
headroom at one-eighth of the production payload. Nothing in the suite measures
the clause at the population the product ships with, and nothing would go red if
scaling broke it. The clause as written ("at max speed") is not false; it is
narrower than it reads.

**U3 — "Compare runs two synced workers" has no test in the delivered suite.**
I grepped the whole tree. The closest shipped evidence is
`engine/test/worker/api.test.ts > "keeps streaming after a second init — the
Compare re-run case"` (one worker, two configurations, sequential) and the
`snapshot.worker.test.ts` positive control (two workers, *different* seeds,
asserted to differ). Neither asserts two workers advancing in step with
synchronised clocks. My probe (RP7) shows the capability works in all three
engines — but I wrote that probe and then deleted it, so on the delivered tree
the clause is carried by nothing. **Recommendation: land RP7's file.** It is 60
lines, costs ~1.5 s per engine, and converts the only wholly ungated WP10 clause
into a defended one.

**U4 — nothing asserts the report's prose agrees with the report's numbers.**
Blocker B3 exists because `tier4.caution` is a string constant that no test
compares against the `capacity_binds` / `saturated_sites` / `capacity_refusals`
fields emitted in the same document. A three-line assertion in
`wp9-validation-report.test.ts` would close it permanently.

**U5 — the artifact gate probes 1 of 17 archive inputs.** See RP6. Sixteen of the
seventeen replay targets can disappear without the gate noticing; the failure
then arrives as ENOENT under a "47 skipped" banner.

**U6 — 14 Tier-3 checks SKIP and the shipped report does not name them.** The
census aggregate is `passed 2242 / failed 17 / skipped 14 / total 2273` (all 17
"failures" are the gate-(h) provenance check on an uncommitted tree, correctly
classified as `environment_failures`). Every skip I traced is legitimate and
mirrors the certified Python's own behaviour — `(f)` for a non-E arm, `(j)` for
an observed-series run, `(a)`'s Scenario-E counters against a pre-counter logger,
and `(t3) committed cross-arm digest` where `cross-arm-hashes.json` describes a
different run family than the target. But the report records only the *count*.
A reader cannot tell which check went quiet, which is the same observability gap
the check-census assertion exists to close one level up. Worth noting
specifically: **the committed cross-arm digest does not grade the three E0
nulls** — it was built from `phase-e/E0null-*`, and the replay targets are
`scenario-e/E0null-*`.

---

## 6. No suite is self-referential

Checked by reading the provenance of every expected value in the WP9 surface,
not by trusting the file headers.

- **`wp9-replay-acceptance.test.ts`** replays through `runHeadlessAsync` (the real TS engine) from each run's **archived executed manifest** and compares against `loadRunDir(targetDir(...))` — the Java bytes in `docs/runs/`. The configuration is never hand-written: `buildTargetConfig` reads `reproducibility.parameters` and reports how many of the 41 names came from the manifest (11 / 33 / 40 / 41 per logger generation) versus `JAVA_CODE_DEFAULTS`, and the test asserts those counts, so a silent fall-back to a shipped preset changes a number and turns it red.
- **`JAVA_CODE_DEFAULTS`** is a transcription of `ContextCreator.build()` — the thing transcriptions do is drift — and it is checked against an oracle the port did not produce: the three archived E0-null manifests carry 28 of its names explicitly, and the test compares all 3 × 28 = 84.
- **`wp9-archive-gates.test.ts`** runs the ported gates over all 60 archived Phase-E / Scenario-E directories (12 + 21 + 27, which I counted). No port output is involved at all.
- **Golden summaries** are digests *of the archive*, with `sources.json` recording the run directory, byte length and SHA-256 of every file each value came from, and a `--check` regenerator the nightly runs.
- **`wp9-fixtures.ts`** builds a synthetic run, and its header states the rule explicitly: *"Nothing here is an oracle … These fixtures only ever answer the question 'can this gate fail?'"* Corrosion only, never expectation.
- **The one thing that is port-vs-port by construction** is Tier-2 R3 (`checkR3` compares an E0-null replay against the port's own replay of the pre-E reference). That is the definition of an own-engine identity and the report labels it `tier2_r3` with a note saying so; it is not presented as archive agreement.

**No suite in the WP9 or WP10 surface takes an expected value from port output
and calls it an oracle.**

---

## 7. No test was weakened

| Measure | At `6cf106c` | Now | Delta |
|---|---|---|---|
| Test files (`npm test` projects) | 90 | 110 | +20 |
| Browser test files | 1 | 3 | +2 |
| Tests collected | 1,426 | 1,742 | +316 |
| Browser tests | 51 | 84 | +33 |

- **Zero test files removed.** `git ls-tree -r 6cf106c` vs. the working tree: 22 `.test.ts` files added, none deleted.
- **Zero deletions in any test file.** `git diff --numstat -- 'websim/**/*.test.ts'` reports exactly one changed tracked test file, `app/test/placeholder.test.ts`, at **62 insertions / 0 deletions**.
- **Only two tracked source files changed at all**, and both were audited line by line: `validation/src/harness/index.ts` (+18/−3, barrel exports and doc comment) and `validation/src/harness/archive-replay.ts` (+14/−15, replacing the 8-entry `CODE_FALLBACKS` literal with `JAVA_CODE_DEFAULTS`). I checked the eight overlapping values individually — `smokeSeriesCode 0`, `smokeScale 1.0`, `closuresCode 0`, `pStuck 0.3`, `stuckDelayH 3.0`, `pushThetaThreshold -0.25`, `kPush 1.0`, `closureDraw 1` — all identical, so the widening is inert for the twelve WP8 cases as claimed.
- **No skip/only/todo markers introduced.** A tree-wide scan finds no `describe.skip`, `it.only`, `test.todo`, `skipIf` or `runIf` outside comments and the linter's own fixtures — and that scan is itself a test (`tools/test/artifact-gate.test.ts:356`, *"finds no direct describe.skip / skipIf / runIf / todo in any test file"*).
- **No loosened tolerances.** The only `toBeCloseTo` calls in new WP9 code are in `wp9-gate-corrosion.test.ts` at 12 decimal places, on pure statistical helpers (`varDdof1`, `pctl`, `gini`) — not on model output.

---

## 8. Runs, exact counts and exit codes

All on the dev box (16 cores), from `websim/`.

| Command | Exit | Result |
|---|---|---|
| `npm run ci` | **2** | fails at `typecheck` (engine, 7 errors — B1). Never reaches `npm test`, `check:scratch`, `lint:claims`. |
| `npm test` (quiet box) | **1** | `Test Files 2 failed \| 108 passed (110)`; `Tests 2 failed \| 1740 passed (1742)`; 4 unhandled `onTaskUpdate` timeouts; 1121.91 s. Both failures are wall-clock timeouts (B2). |
| `npm test` (earlier, light load) | 1 | same shape: 2 failed / 1740 passed; 1183.14 s. |
| the two failing files, in isolation | **0** | `Test Files 2 passed (2)`, `Tests 23 passed (23)`, 53.27 s. |
| `npm run test:browser` | **0** | `Test Files 9 passed (9)`, `Tests 84 passed (84)`, Chromium + Firefox + WebKit. |
| `npm run check:scratch` | **0** | *"websim/pipeline/out is clean — 13 produced entr(ies) allowed, test-tmp/ empty."* |
| `npm run lint:claims` | **0** | 0 hits, 435 files scanned, 23 active rules, 4 quarantined. |
| `npm run test:strict` | **1** | `Test Files 1 failed \| 109 passed (110)`; `Tests 1 failed \| 1741 passed (1742)`; 624.79 s. The single failure is the same `wp7-vertical-slice` 60 s timeout. |
| `run-mutation-gate.ts --prove-can-fail --scope fast` | **0** | CAN-FAIL PROOF PASSED. |
| `wp9-validation-report.ts` (partial archive) | **2** | ARCHIVE INCOMPLETE, names the missing run. |

### 8.1 `npm run test:strict` — the one genuinely reassuring result

`WEBSIM_REQUIRE_ARTIFACTS=1` turns every artifact-gated skip into a hard failure.
**Zero suites failed that way** — `grep -c "REQUIRES artifacts"` over the log
returns 0. Every artifact-gated oracle in the tree actually executed on this
machine; none of the greenness anywhere in this report is greenness-by-skipping.
The archive-facing censuses printed by that run:

```
[wp9-2026]   27 archived runs -> 244 passed, 0 failed, 0 skipped (244 checks)
[wp8-gates]  60 archived runs -> 594 passed, 0 failed, 9 skipped (603 checks)
             per family {"E0":45,"ER":45,"SE":126,"SE2":225,"SE2nc":81,"SEnc":81}
[WP8 reaction oracle] rowsAsserted 463, identityChecked 567, rngStatesMatched 319
```

Strict mode also finished in **624.79 s against `npm test`'s 1121.91 s** on the
same box, and lost one of the two timeouts in the process — which is itself
evidence for B2's diagnosis that the failures are scheduling, not model.

---

## 9. The oracle corpus is intact

Measured with `Get-ChildItem -Recurse -File | Measure-Object -Property Length -Sum`
(MiB):

| Directory | Expected | Measured | Files |
|---|---|---|---|
| `pipeline/out/decision-fixtures` | ~477 MB | **476.9 MiB** | 25 |
| `pipeline/out/world-fixtures` | ~153 MB | **151.7 MiB** | 185 |
| `pipeline/out/closure-fixtures` | ~30 MB | **29.4 MiB** | 21 |
| `pipeline/out` total | — | **828.8 MiB** | 852 |

No shrink. `docs/runs/` intact: 15 families, 60 Phase-E/Scenario-E run
directories (12 + 21 + 27) and 27 `present-day-three-arm` directories, all read
read-only. Nothing under `pipeline/out/` was deleted, and no `--clean` was run at
any point during this gate.

---

## 10. Changes outside `websim/`

Listed for the researcher's visibility, per the gate's remit. A separate
authorised agent is doing attribution and census-correction work concurrently;
none of the below is reported as a violation.

```
 M Geography/data/README.md                              (+10/-7)
 M Geography/data/registry/variables.csv                 (+1/-1)
 M Geography/src/geography/agents/ContextCreator.java    (+1/-1)
 M LICENSE                                               (+34/-14)
 M docs/chapter/Capacity_Is_Not_Access.tex               (+18/-15)
 M docs/chapter/capacity-is-not-access-source.md         (+41/-39)
 M docs/evidence-package-2026/INTEGRATION_DECISIONS.md   (+1/-1)
 M docs/final/TECHNICAL_REFERENCE.md                     (+11/-7)
 M docs/science/DATA_SOURCES.md                          (+37/-12)
 M docs/science/phase2-human-agents/08-ENGINEERING.md    (+1/-1)
 M docs/validation/STREET_NETWORK_VALIDATION.md          (+25/-10)
 M docs/validation/gui-issue-diagnosis.md                (+5/-2)
?? .github/workflows/websim-mutation-gate.yml
?? .github/workflows/websim-nightly.yml
```

I read the four one-line changes to check they are what they appear to be:

- `ContextCreator.java` — **javadoc only**, `"real City-of-Portland RLIS street centerlines"` → `"real Oregon Metro RLIS street centerlines"`. No executable line changed. This is the only edit to certified Java source and it is attribution; flagged here because a `.java` file in the certified instrument deserves to be seen even when the diff is a comment.
- `variables.csv` V-REATTACH — `"4 of 27 corrections were reattachments"` → `"3 of 25"`. Census correction, and it agrees with the post-U-27 figure (3 reattached / 22 split = 25).
- `08-ENGINEERING.md` — `112,070-feature graph` → `109,434`. Census correction; matches the edge count `engine/test/worker/api.test.ts` asserts against the packed asset.
- `INTEGRATION_DECISIONS.md` — `89,345 nodes` → `88,100`. Census correction; matches the node count the same test asserts.

**Nothing outside `websim/` looks like anything other than attribution or a
census correction.** The two new workflow files are inside this gate's remit and
are reviewed above.

---

## 11. What must happen before GO

Ordered by cost.

1. **Add DOM to the engine's typecheck** so `npm run ci` passes — e.g. `"lib": ["ES2022", "DOM"]` in `engine/tsconfig.json`, or a `test-browser`-scoped tsconfig. (B1. Blocks everything: CI never reaches the tests.)
2. **Correct `tier4.caution`** in `validation/src/harness/tier4-census.ts` and add an assertion that the caution text agrees with the measured `capacity_binds` / `saturated_sites` it sits beside. The true statement is stronger than the one shipped. (B3, U4.)
3. **Make `npm test` fit its own timeouts again** — raise the two declared budgets with the measurement recorded, or serialise the heavy archive projects (`poolOptions`/`fileParallelism`), or move the seventeen-configuration replay behind the artifact gate's strict path. Whatever the choice, record the measurement rather than the guess. (B2.)
4. **Land the two-synced-workers Compare test.** (U3 — the only wholly ungated acceptance clause in either work package.)
5. **Probe every archive target in the WP9 artifact gate**, so a partial archive degrades with the banner instead of an ENOENT under "47 skipped". (U5.)
6. **Re-measure `seed.replay-run-seed`** with `--measure` and, if it confirms, clear `needsArtifacts` so the hosted job proves the plan's *named* injection instead of a surrogate. (RP3.)
7. **State the percentile in the report**, and say plainly — in the report, not only in the code comments — that eleven of twelve diverging configurations have no permutation census and rest on the partition argument alone. (§4.1.)
8. **Name the 14 skipped checks** in `VALIDATION_REPORT.json`, and note that the committed cross-arm digest does not grade the three E0 nulls. (U6.)
9. **Refresh `README.md` §2.2**, which still lists the worker runtime, streaming, snapshots, the replay harness and "the WP8 layers" under **"Not built"**. The README's own preamble warns it has previously been stale in both directions; it is stale in the understating direction now.

---

## 12. Restoration

Eight source files were mutated during this gate. Every one was restored from a
parked copy and re-verified by SHA-256 against a digest taken before the edit:

```
engine/src/agents/step.ts                          134862c2303ef6d6b5dd23cf71b41aa084bbef9da21295d6b702992b7b7dd909
engine/src/world/build.ts                          3224c3294ef59520eb9863cc98f6b65cca85d2555b5f993fdc2a7ee6d0d6a61a
engine/src/worker/snapshot.ts                      ec5dc206ea5fb15f6bce256a5c33a4cd57e2b92284c21d90a32aee0dbb0808cc
shared/src/schema.ts                               493c06943f5114579fe997f0198c44ac6b099073b14912c9574de5b9ce78fb59
validation/test/mutation/run-mutation-gate.ts      b40c4643bcc9d84421cc9e92d835c6082ab0cfd075ac7feca2710d709e6a6008
README.md                                          a38b8cbd3d2e905bdd73e87b09722670856a974fd99480cad24e517343b9fd6f
```

One temporary file (`engine/test-browser/worker/gate-compare.worker.test.ts`) was
created for RP7 and deleted. A whole-tree SHA-256 manifest was taken before any
experiment and is re-verified in §12.1. `docs/runs/`, `Geography/` and
`pipeline/out/` were read-only throughout; the partial archive used in RP6 was
built from NTFS junctions in a scratch directory outside the repository.

### 12.1 Whole-tree manifest re-verification

A SHA-256 manifest of every file under `websim/` (excluding `node_modules/` and
`pipeline/out/`) was taken before the first experiment and again after the last:

```
pre = 674 files   post = 675 files
$ diff <(sort manifest-pre.txt) <(sort manifest-post.txt)
114a115
> 2a9d125deedbb1a77312b20a43f96e011ae93958238d9d41ad6baa3400c5704a  ./docs/DR-WP9-WP10-verification.md
```

**The only difference in the entire tree is this report.** Every source file,
every test file, every asset and every fixture is byte-identical to its
pre-experiment digest.

The oracle corpus was re-measured after the last run and is unchanged:

```
decision-fixtures: 476.9 MiB, 25 files
world-fixtures   : 151.7 MiB, 185 files
closure-fixtures :  29.4 MiB, 21 files
TOTAL pipeline/out: 828.8 MiB, 852 files
```

`npm run check:scratch` → exit 0 (*"pipeline/out is clean — 13 produced entr(ies)
allowed, test-tmp/ empty"*). `npm run lint:claims` → exit 0 with this document
included in the scan (436 files, 23 active rules, 0 hits).


---
---

# PART II — FINAL ACCEPTANCE GATE (second pass, 2026-08-03)

*A clearly-marked NEW section. Nothing above this line was edited. Part I was the
first gate, which returned NO-GO on both work packages and was correct. This pass
re-verified every clause from the tree, distrusting Part I as much as anything
else.*

## II.0 Verdict

| Work package | Verdict | Why |
|---|---|---|
| **WP9** | **GO** | All five clauses hold. Four are defended by a revert-proof that goes red naming the clause; one (the nightly job) is correct by inspection but has no automated guard. |
| **WP10** | **NO-GO** | Clauses 1 and 3 hold and are revert-proofed. **Clause 2 is false as measured** — the UI thread is *not* long-task-free at max speed in two of the three shipped engines, at production scale *and* at one-eighth of it. |

WP10's failure is not a gap in evidence. It is evidence. The suite contains a
gated, production-scale measurement that goes red on Firefox and WebKit and says
so in its own failure message. That is the honest state, and it blocks the clause
rather than the release of the finding.

### Part I's three release blockers are all closed

| ID | Part I finding | Now |
|---|---|---|
| **B1** | `npm run ci` exited 2 at `typecheck`; the gate never reached `npm test`, so `test:browser` reported green over files that do not compile. | **FIXED.** `npm run ci` → **exit 0 in 641.7 s**, and every step is observed to run (§II.2). `engine`'s typecheck now compiles `tsconfig.browser.json` too, so the WP10 files are inside the type gate. |
| **B2** | `npm test` exited 1 on a quiet box: 2 of 1,742 tests blew a wall-clock timeout. | **FIXED, by raising budgets and nothing else.** Two consecutive runs green (§II.2). Every one of the 22 deleted lines across the two changed test files is a timeout argument; no assertion was touched (§II.6). |
| **B3** | `VALIDATION_REPORT.json` carried a false sentence about the archive ("no shelter saturates"). | **FIXED, and the whole class closed.** The caution is now *computed from* the measured fields rather than written beside them, and `validateValidationReport` re-derives it from the untyped document and rejects any mismatch. Verified against the archive by hand (§II.3). |

---

## II.1 Clause by clause

**Legend** — *revert-proof*: I broke it, ran the suite, something went red naming
it, I restored it, and SHA-256 confirmed the restore. *measurement*: a number was
taken; nothing would go red if the underlying property regressed.

### WP9

| # | Clause | Verdict | Defended by |
|---|---|---|---|
| 1 | Tier-3 gates green on replays of A/B/C seeds 42–44, ER, SE-E18, SE2-E18-d1, E0 nulls | **HOLDS** | **revert-proof RP-D** |
| 2 | Tier-4 report shows zero unexplained divergences | **HOLDS** | **revert-proofs RP-A, RP-B** + my own independent re-derivation (§II.4) |
| 3 | CI goes red on the injected seed perturbation | **HOLDS** | **the real mutation gate, executed** (§II.5) |
| 4 | Nightly job wired | **HOLDS by inspection — UNGATED** | *nothing.* See §II.7 |
| 5 | Loud degradation on missing archive | **HOLDS** | **revert-proof RP-C** |

All seventeen replayed configurations are present, and the clause's named set is
covered: nine `present-day-three-arm` runs (A/B/C × seeds 42/43/44), three
`scenario-e/E0null-*`, `phase-e/ER-A-n6842-seed42`, `scenario-e/SE-E18-seed42`,
`scenario-e/SEnc-E18-seed42`, `scenario-e-v2/SE2-E18-d1-seed42` and
`scenario-e-v2/SE2nc-E18-seed42`.

### WP10

| # | Clause | Verdict | Defended by |
|---|---|---|---|
| 1 | Snapshot-replay byte identity holds **in the worker** | **HOLDS** | **revert-proof RP-E**, in a real Chromium `Worker` |
| 2 | UI thread long-task-free (< 50 ms) at max speed | **FALSE ON 2 OF 3 ENGINES** | measurement — and the measurement is **red** (§II.8) |
| 3 | Compare runs two synced workers | **HOLDS** | **revert-proof RP-F** |

### The four items Part I flagged as ungated or weak

| Part I finding | Now |
|---|---|
| **Nightly job wired but inert** (single job, skipped on an unset variable, workflow reported success having run nothing) | **Structurally fixed, still ungated.** `websim-nightly.yml` now carries three jobs: `full-archive`, `degraded-clean-clone` guarded by the *exact negation*, and `nightly-verdict` with `if: always()` which fails when neither did work. The do-nothing-and-report-green outcome is now unreachable. **But no test anywhere reads a workflow file** — the only reference to `.github` in the whole tree is `tools/claims.ts:375`, which lists it as a directory to scan for banned prose. Reverting this YAML to its inert form leaves `npm test` and `npm run ci` green. |
| **Compare-two-synced-workers had no test** | **Closed.** `engine/test-browser/worker/compare.worker.test.ts` now exists, passes on all three engines, and asserts synchronised clocks on *both* the control channel and the stream channel, byte identity at six uneven stops, a distinct-digest non-vacuity guard, an independence case, and a different-seed positive control. Revert-proofed (RP-F). |
| **UI budget measured at 1/8.5 scale** | **Closed as a measurement, and the measurement fails.** `uithread.scale.worker.test.ts` measures 6,842 residents × 455 h. It is red on Firefox and WebKit. |
| **Report prose vs report numbers: nothing cross-checked them** | **Closed by construction.** `tier4Caution()` *generates* the prose from `tiers.tier4.configs[]`; `cautionProblems()` in the schema validator re-derives it from the untyped document and reports the first differing character. A hand-edited artifact is caught. Verified against the archive independently (§II.3). |

---

## II.2 `npm run ci` reaches every step; `npm test` is green twice

`npm run ci` = `typecheck && test && check:scratch && lint:claims`.
**Exit 0, 641.7 s.** Every step observed in the log, not inferred:

| Step | Evidence in the run log |
|---|---|
| `typecheck` | banners for all six workspaces (`shared`, `engine`, `pipeline`, `app`, `validation`) plus `tsc -p tools`. `engine` runs **two** projects: `tsconfig.json` *and* `tsconfig.browser.json`. |
| `test` | `Test Files 111 passed (111)` / `Tests 1760 passed (1760)`, 629.26 s |
| `check:scratch` | `websim/pipeline/out is clean — 13 produced entr(ies) allowed, test-tmp/ empty.` |
| `lint:claims` | ran, exit 0 |

Typecheck was also run alone first: exit 0 in 9.9 s.

**Two consecutive `npm test` runs, both exit 0, identical census:**

| Run | Wall | Files | Tests |
|---|---|---|---|
| 1 (standalone) | 620.6 s (suite 619.60 s) | 111 | 1760 |
| 2 (inside `npm run ci`) | — (suite 629.26 s) | 111 | 1760 |

**Margins on the two named files** (per-case budget is 300 s in both):

| File | Slowest case, run 1 | Slowest case, run 2 | Budget | Margin |
|---|---|---|---|---|
| `wp7-vertical-slice.test.ts` | 50,525 ms | 50,525 ms | 300,000 ms | **5.9x** |
| `tier4-attribution.test.ts` | 46,592 ms (file) | 50,210 ms | 300,000 ms | **6.0x** |

The one real performance **assertion** in the tree is untouched and passes with
room: `[wp7-perf] 2,037 × 312 h = 38,132,640 agent-ticks in 2.74 s` against
`expect(r.timings.runMs).toBeLessThan(60_000)` — a **21.9x** margin.

**A timeout was raised, and no assertion was weakened alongside it.** Details in
§II.6.

> **Scope note, and it matters for WP10.** `npm run ci` does **not** include
> `test:browser`. Every WP10 clause is measured only by the browser suite. A
> developer running `npm run ci` today sees green while WP10 clause 2 is red.
> GitHub is not fooled — `websim-ci.yml`'s `cross-engine` job runs
> `npm run test:browser` on all three engines and would go red — but the local
> gate command does not cover the work package it is being used to accept.

---

## II.3 The corrected `tier4.caution` is TRUE against the archive

I read the two CSVs and counted saturated sites myself, with my own one-line
program, without reading the report first.

```
awk -F, 'NR>1{tot++; if($5+0>0 && $7+0>=$5+0) sat++} END{print tot, sat}'
```

| Archive file | Sites | `peak_occupancy >= capacity` |
|---|---|---|
| `docs/runs/scenario-e/SE-E18-seed42/shelters.csv` | 36 | **9** |
| `docs/runs/phase-e/ER-A-n6842-seed42/shelters.csv` | 36 | **8** |

The saturated sites at SE-E18-seed42 are Clark_Center (90/90), Laurelwood_Center
(120/120), River_District_Navigatio (100/100), Roseway_Inn_Motel_Shelte (150/150),
Parkrose_Community_Villa (11/11), St_Johns_Village (21/21), Lilac_Meadows
(127/127), BIPOC_SRV (42/42), Menlo_Park_SRV (55/55).

**The prose matches, and the doc-comment's own worked example matches.** The
caution states saturation across the five EXACT configurations as a span; I
measured all five: 8, 9, 10, 11, 12 of 36 → the rendered `8-12 of 36` is correct.

The capacity-refusal span reconciles too, once the two refusal kinds are kept
apart — which is the very distinction the false caution used to blur:

| Run | `refused_count` | `policy_refused` | capacity = difference |
|---|---|---|---|
| `phase-e/ER-A-n6842-seed42` | 836 | 541 | **295** |
| `scenario-e/SE-E18-seed42` | 834 | 543 | **291** |
| `scenario-e/SEnc-E18-seed42` | 931 | 584 | **347** |
| `scenario-e-v2/SE2-E18-d1-seed42` | 1,152 | 709 | **443** |
| `scenario-e-v2/SE2nc-E18-seed42` | 1,082 | 653 | **429** |

Span **291–443**, exactly as the caution renders it. `REFUSED_ALL_FULL = 1` on all
five, which is the true observation the old text over-generalised into "no shelter
saturates". Doors saturate; the people mostly still get in. **Verdict: the
corrected caution is true.**

---

## II.4 Independent re-derivation of the Tier-4 census from raw bytes

I wrote my own script — no import of any project module — that reads the port's
replay CSVs from `pipeline/out/wp9-validation/` and the archived Java CSVs from
`docs/runs/`, splits on commas, compares cell strings, and applies the
order-channel partition test from first principles.

**Result: 5 EXACT / 12 ORDER-CHANNEL / 0 UNEXPLAINED, n = 17.** Cell counts match
the shipped report cell for cell (`311007/314732` at A-seed42, `379427/383152` at
E0null-A-seed42, `355784/355784` at ER-A, and so on), as do rows-identical,
divergent-column counts, saturated-site counts and flip counts.

**On the exclusions, because they decide the answer.** Run naively with *no*
exclusions my script returns **0 / 0 / 17** — every configuration "diverges",
because `sim_id`, `commit` and `data_version` differ on all 6,842 rows. Those three
are the report's `TIER4_EXCLUDED`. I checked the justification rather than
accepting it: `sim_id` and `commit` are the certified `verify_E_runs.py`'s own
`IDENTITY_EXCLUDE`, and `data_version` is the headless runner's honest
`"unavailable"` placeholder against the Java build's version tag. Excluding them is
principled and inherited, not invented. Note also what is *not* excluded:
`time_started_local` and `time_arrived_local` stay in, and they are among the
sharpest identity evidence available. With the three documented exclusions applied,
my numbers are the shipped numbers.

**The partition holds on every configuration.** Residents refused at no door in
either run: 1,714–6,568 per configuration, and **0 of them diverge, anywhere**. The
within-tick order channel cannot reach a resident nobody ever turned away, so that
zero is what makes ORDER-CHANNEL an attribution rather than a label.
`planned_route_m` moves on 149–299 rows, and only on door-contested ones.

### II.4.1 The permutation percentile: ONE of twelve. This is a gap, not a met requirement.

Of the twelve ORDER-CHANNEL configurations, **exactly one** —
`present-day-three-arm/A-seed42` — has an actual permutation percentile: 114
observed flips at the 31st percentile of a 200-stream distribution running 94–144.
Confirmed by reading the shipped report: `envelope_applicable` is `true` on one
config and `false` on eleven, each carrying the note *"the committed census was
sampled at present-day-three-arm/A-seed42, not …"*. The code enforces this
(`tier4-census.ts` requires `envelope.sampledAt === runDir`), which is the correct
behaviour — placing an observation in a distribution sampled elsewhere would be a
worse error than declining to place it.

**State this plainly, as instructed: the requirement is NOT met; the report is
honest about not meeting it.** Those are different things and the distinction
should survive into the release note. The other eleven rest on the structural
partition argument alone — which is a strong argument (never-refused rows must be
byte-identical, flips must be a balanced swap set, only two transitions are legal,
per-site admitted *counts* must be conserved, both door ledgers must close) and it
is empirically satisfied everywhere. But it is a different kind of evidence from a
sampled null distribution, and eleven configurations have only the former.

---

## II.5 The revert-proofs, in full

Every proof below: mutate one anchor, run a targeted suite, restore the original
bytes **from memory** (never `git checkout`), re-hash. **All ten restores verified
byte-identical by SHA-256.**

| ID | Clause | Mutation | Result |
|---|---|---|---|
| **RP-A** | WP9-2 Tier-4 zero-unexplained | `tier4-census.ts`: disable the never-refused-divergent check | **RED** — `wp9-tier4-census.test.ts > "UNEXPLAINED when a co-admitted resident's distance moves"`. 1 failed / 25 passed |
| **RP-B** | WP9-2 Tier-4 zero-unexplained | `tier4-census.ts`: disable the balanced-swap check | **RED** — `wp9-tier4-census.test.ts > "UNEXPLAINED when the flips are not balanced — beds appeared or vanished"`. 1 failed / 25 passed |
| **RP-C** | WP9-5 loud degradation | `tools/artifact-policy.ts`: downcase the `!! ARTIFACT-GATED SUITE SKIPPED` banner | **RED** — `tools/test/artifact-gate.test.ts > "skips loudly and stays green when the artifact is absent and the var is off"`. 1 failed / 34 passed |
| **RP-D** | WP9-1 Tier-3 gates on the replays | `gate-b-bed-sum.ts`: `occ + 1` | **RED, 16 failures**, naming *"Tier 3 green on scenario-e/E0null-A-seed42"*, `…-B-…`, `…-C-…`, `phase-e/ER-A-n6842-seed42`, `scenario-e/SE-E18-seed42`, `scenario-e/SEnc-E18-seed42`, `scenario-e-v2/SE2-E18-d1-seed42`, plus `(b) the four-way bed sum agrees on all 60 runs`. 16 failed / 155 passed, 316 s |
| **RP-E** | WP10-1 snapshot identity in the worker | `worker/snapshot.ts`: `admissionEpoch: 0` | **RED in real Chromium** — *"worker replay diverged. token 1: sim.admissionEpoch=4042000000000000 != …"*, plus scrub and scrub-and-continue digests. 3 failed / 4 passed |
| **RP-F** | WP10-3 Compare two synced workers | `worker/simHost.ts`: round the stop tick down to the 240-tick slice grid | **RED in real Chromium**, all three Compare cases — *"worker A overshot or undershot stop 300: expected 240 to be 300"*. 3 failed |

### WP9 clause 3 — the mutation gate, actually executed

Not inspected: run. `run-mutation-gate.ts --gate --only seed.replay-run-seed,seed.population-derivation --scope fast` → **exit 0, MUTATION GATE PASSED**.

```
[control] negative control — a comment-only edit must leave the suite GREEN
  green as required — 449 passed, 0 skipped, 23 files, 17.9 s

[seed.replay-run-seed]        RED as required — 4 failing;
   detector engine/test/worker/world.census.test.ts :: reaches all six resident states
[seed.population-derivation]  RED as required — 9 failing;
   detector engine/test/rng/streams.test.ts :: PopulationSampler = seed*1000003 + 17

restoration verified by SHA-256: all 8 catalogue files byte-identical
```

The gate's contract is the right way round — it *fails when an injected defect
leaves the suite green* — and it refuses to attribute anything if the negative
control is not inert. The plan's literally-named injection is caught, and it is
caught on a clean clone.

### The four never-regress gotchas, by live injection

All four injected into real source, all four **red**, all four **named**, all four
restored SHA-256-identical.

| Gotcha | Injection | Caught by |
|---|---|---|
| **1** — the banned citation for the vulnerability sign | inserted the retired attribution into an `engine/src` doc comment | `lint:claims` exit 1: `engine/src/decision/config.ts:1:21: banned-citation [banned]` |
| **2** — the banned severity comparison for the v2 severe series | inserted the retired comparison phrasing | `lint:claims` exit 1: `banned-severity-comparison [banned]` |
| **3** — `simulationHours <= slices - 1` | `smoke/series.ts`: `return slices - 1` → `return slices` | 5 red, incl. *"THROWS at 456 h on a 456-slice series"* and *"the port's fail-fast would have refused every one of them"* |
| **4** — Repast zeroes negative `"number"` constants | `decision/config.ts`: `alphaHazard: -8.0` → `0.0` | `wp8-mutation-guards.test.ts > "keeps the two negative constants negative (never-regress gotcha 4)"` |

Both prose gotchas carry a specific rule *and* a bare-surname / bare-place-name
backstop rule, so a reformatted or line-wrapped reappearance is still caught.

---

## II.6 No test was weakened

| Measure | At `6cf106c` | Part I | Now |
|---|---|---|---|
| `.test.ts` files in `websim/` | 91 | — | **116** (+25, **0 deleted**) |
| `npm test` files / tests | — | 110 / 1,742 | **111 / 1,760** |
| Browser tests | 51 | 84 | **99** (15 files) |

- **Zero test files deleted.** Every path in `git ls-tree -r HEAD -- websim | grep '\.test\.ts$'` still exists on disk.
- **Three tracked test files changed**, and every deletion in them is accounted for:
  - `app/test/placeholder.test.ts` — 62 insertions, **0 deletions**.
  - `validation/test/tier4-attribution.test.ts` — 27 insertions, **7 deletions**: all seven are `}, 120_000);` → `}, CASE_TIMEOUT_MS);` (300 s).
  - `validation/test/wp7-vertical-slice.test.ts` — 39 insertions, **15 deletions**: fourteen `}, 60_000);` and one `}, 120_000);`, all → `CASE_TIMEOUT_MS`.
  - The *only* non-comment added line across both is `const CASE_TIMEOUT_MS = 300_000;`.
- **A timeout was raised; say which and why.** The per-project default went 5 s → 60 s and the two heavy validation files went 60 s / 120 s → 300 s. This is the fix for Part I's B2. A timeout is a budget, not an assertion, and the tree's one genuine performance assertion is untouched: `expect(r.timings.runMs).toBeLessThan(60_000)` still stands at `wp7-vertical-slice.test.ts:301` and passes at 2.74 s.
- **No loosened tolerance.** `git diff -- 'websim/**/*.test.ts'` contains no added line matching `toBeCloseTo`, `tolerance`, `epsilon`, `EPS` or a widened `Math.abs(...) <` bound.
- **No `skip` / `only` / `todo`.** A tree-wide scan finds none outside comments and the linter's own fixtures — and that scan is itself a test, `tools/test/artifact-gate.test.ts:356`.

---

## II.7 The one WP9 clause with no revert-proof

**The nightly job is correct, and nothing would notice if it stopped being.**

The workflow is genuinely repaired: two jobs on complementary conditions so
exactly one runs on every trigger, a third with `if: always()` that fails when
neither did work, `WEBSIM_REQUIRE_ARTIFACTS=1` on the archive runner so an
artifact-gated skip is a hard failure, and a degradation step that republishes
every `!!` banner into the job summary *and* fails if a hosted runner reports zero
banners (because a clean clone must forgo something). I read all 423 lines. The
"green because nothing ran" outcome is unreachable.

But: **no test in this repository reads any workflow YAML.** The only `.github`
reference in the tree is `tools/claims.ts:375`, listing it as a prose-scan
directory. Reverting `websim-nightly.yml` to its single inert job would leave
`npm test`, `npm run ci` and `npm run test:strict` green. This clause rests on
inspection alone, and it is the one WP9 clause that does.

That is a smaller risk than it sounds — GitHub executes the YAML, so the structure
is exercised in production every night — but it is not a revert-proof and should
not be recorded as one.

---

## II.8 WP10 clause 2 — the measurement, and it is red

`npm run test:browser` → **exit 1. `Test Files 4 failed | 11 passed (15)`,
`Tests 4 failed | 95 passed (99)`.** All four failures are the UI-thread budget.

| Engine | Scale | Long tasks (≥ 50 ms) | Worst gap |
|---|---|---|---|
| Firefox | 6,842 res / 455 h | **2** | **156 ms** (3.1x budget) |
| WebKit | 6,842 res / 455 h | **2** | **61 ms** |
| Firefox | 800 res / 24 h | **1** | **132 ms** |
| WebKit | 800 res / 24 h | 0 | **50 ms** (see below) |
| Chromium | both | 0 | ~6 ms |

The production-scale file's own failure message states the clause and denies it:
*"The WP10 clause 'UI thread long-task-free (< 50 ms) at max speed' does not hold
at production scale in this engine."* Its header attributes the stall — with a 2×2
control matrix — to the **snapshot ring at production population plus the 30-tick
yield cadence, not the frame protocol**, which is exonerated by a frames-disabled
case that stalls just as hard and a snapshots-disabled case that streams the full
1.68 GB in 12 ms. It also records two nearby configurations on Firefox that are
clean. That is good work and it is the right way to report a failing clause.

Two things Part I could not have known, both worse than documented:

1. **The 800-resident file now fails too**, on Firefox *and* WebKit. The scale
   file's header predicts the Firefox collateral under three-up parallelism; it
   records WebKit as passing at 800. On this run WebKit failed there as well.
2. **A latent defect in the 800-resident assertion.** WebKit's failure is
   `expected 50 to be less than 50`, with `longTasks === 0`. `longTasks` counts
   raw gaps `>= 50`; `maxMs` is `Number(x.toFixed(2))`. A worst gap of 49.9951 ms
   counts as zero long tasks and rounds to `50`, so the two assertions contradict
   each other at the boundary. It fails safe (red when it might have been green),
   but the pair should compare the same quantity — assert `maxMs` against the
   rounded threshold, or keep an unrounded `maxRawMs` for the comparison. This is
   a test defect, not a port defect, and it is the *only* thing in the four
   failures that is not a real stall.

**Do not fix this by widening the threshold, shrinking the population or
shortening the horizon.** The file says so itself. Clause 2 is false; the number is
the finding.

---

## II.9 Corpus, scratch, tree

Measured after every experiment above:

```
decision-fixtures: 25 files, 476.9 MiB
world-fixtures   : 185 files, 151.7 MiB
closure-fixtures :  21 files,  29.4 MiB
TOTAL pipeline/out: 852 files, 828.8 MiB
```

Unchanged, to the file and the byte, from the pre-experiment measurement. **No
`--clean` was ever run and nothing under `pipeline/out/` was deleted.**

`npm run check:scratch` → exit 0, *"13 produced entr(ies) allowed, test-tmp/
empty"*. `npm run lint:claims` → exit 0, *"0 hits in 0 files; 441 files scanned
against 23 active rules"*.

`git status --porcelain` after all ten mutations and restores is **byte-identical
to the pre-experiment listing — the same 63 paths, no additions, no removals.**

---

## II.10 Changes outside `websim/` and `.github/`

Listed without judgement, as instructed. Thirteen paths, from the concurrent
authorised docs workstream:

| Path | Nature |
|---|---|
| `LICENSE` | attribution — RLIS terms move from "redistribution unverified" to "redistributed with the provider's approval" |
| `Geography/data/README.md` | attribution / data rights |
| `Geography/data/registry/variables.csv` | **figure correction** — `4 of 27` reattachments → `3 of 25` |
| `Geography/src/geography/agents/ContextCreator.java` | attribution, **Javadoc comment only** — "City-of-Portland RLIS" → "Oregon Metro RLIS". No executable line changed. |
| `docs/chapter/Capacity_Is_Not_Access.tex`, `…-source.md` | attribution + figure corrections |
| `docs/evidence-package-2026/INTEGRATION_DECISIONS.md` | **figure correction** — 89,345 → 88,100 nodes |
| `docs/final/TECHNICAL_REFERENCE.md` | figure corrections |
| `docs/science/DATA_SOURCES.md` | attribution (source D0) |
| `docs/science/phase2-human-agents/08-ENGINEERING.md` | **figure correction** — 112,070 → 109,434 features |
| `docs/validation/STREET_NETWORK_VALIDATION.md` | figure corrections |
| `docs/validation/gui-issue-diagnosis.md` | figure corrections |

**Nothing here is neither a figure correction nor attribution.** The graph-census
figures are mutually consistent (3 reattached + 22 split = 25 corrections), and the
one Java edit is a comment. Nothing outside `websim/` was written by this gate.

---

## II.11 What must happen before WP10 can be accepted

1. **WP10 clause 2 must be renegotiated or fixed.** Three honest options: fix the
   stall (the file already localises the lever — ring footprint and yield cadence,
   not the frame protocol, and two nearby Firefox configurations already measure
   clean); or narrow the clause to Chromium and say so; or ship the product's
   default run options, under which Firefox measures `max 11 ms, 0 long tasks`, and
   restate the clause as being about the shipped configuration rather than about
   `sliceTicks: 30` with a frame every tick.
2. **Fix the rounded-vs-raw comparison** in `uithread.worker.test.ts:241`.
3. **Consider gating the nightly workflow's structure** — a small test that parses
   `websim-nightly.yml` and asserts the two conditions are exact complements and
   that `nightly-verdict` carries `if: always()` would convert §II.7 from
   inspection into a revert-proof.
4. **Do not let "honest about the gap" become "requirement met"** on the Tier-4
   permutation envelope. Eleven of twelve configurations have no percentile.
5. Consider adding `test:browser` to a local gate command, so `npm run ci` cannot
   be green while a WP10 clause is red.

None of 1–5 touches the science. The Tier-4 attribution re-derived from raw bytes
by an independent script reproduces the shipped census exactly, and the ported
gates reproduce the certified Python on the archive. That result stands.


---
---

# PART III — FINAL GATE ON WP10 (third pass, 2026-08-03)

*A clearly-marked NEW section. Nothing above this line was edited. Part I returned NO-GO
on both work packages; Part II returned GO on WP9 and NO-GO on WP10 clause 2. This pass
re-measured clause 2 from the tree, distrusting both earlier passes, and hunted
specifically for the failure mode a second look invites: **a clause that turned green by
measuring less.***

**Tree under test:** `main` at `e53e55b` + uncommitted work — 9 modified and 7 untracked
paths, all inside `websim/` and `.github/`. (This document is the 17th entry; it is the
only file this gate wrote.)

---

## III.0 Verdict

| Work package | Verdict |
|---|---|
| **WP10 — worker runtime, streaming, snapshots, Compare backend** | **NO-GO.** Clauses 1 and 3 hold and I revert-proofed both myself. **Clause 2 is false**, measured by me at production scale on all three engines — nine isolated runs plus three full three-engine matrix runs. |

**And the clause did not become easier.** That was the thing I was sent to find, and it is
not there. The workload, the threshold, the sampling window, the long-task detector and
the engine set are all provably unchanged — five of them by SHA-256 against `e53e55b`,
the sixth constant-for-constant. The gate is red for the same reason it was red before,
and the number is bigger, not smaller.

The one substantive change since `e53e55b` on the WP10 surface is an **opt-in display
ceiling** (`RunOptions.maxFramesPerSecond`) that **defaults to `0` (off), is explicitly
set to `0` in the gate, and has no caller anywhere in the tree**. It cannot be the
mechanism by which anything passed, because nothing passed.

---

## III.1 The "measured less" hunt, item by item

The brief named six ways a perf budget can be made to pass dishonestly. Each is
addressed with evidence, not assurance.

| Move | Evidence it did not happen |
|---|---|
| **Workload shrunk** | `RESIDENTS = 6842`, `HOURS = 455`, `TICKS = 27_300`, `sliceTicks: 30`, `frameEveryTicks: 1`, `frameBatchSize: 1`, `snapshotEveryTicks: 120` — every one identical to `e53e55b`. Observed in **all 18 production-scale runs I took**: `framesSeen 27301`, `streamMessages 28675`, `bytesReceived 1681919966`, `bytesPerFrame 61606`, `workerTicks 27300`, `snapshotsTaken 228` — **byte-identical figures in every run, on every engine**. |
| **Threshold raised** | `const LONG_TASK_MS = 50;` unchanged. The criterion is still `expect(dist.longTasks).toBe(0)` and `expect(dist.maxMs).toBeLessThan(LONG_TASK_MS)`. |
| **Sampling window narrowed** | `expect(dist.windowMs).toBeGreaterThan(20_000)` unchanged; `expect(dist.samples).toBeGreaterThan(20_000)` unchanged. Observed windows **57.9–223 s**, samples **1.3 × 10⁵ – 2.7 × 10⁷**. |
| **Long-task detector desensitised** | `engine/test-browser/worker/probe.ts` is **byte-identical** to `e53e55b`: SHA-256 `554e424360079b9028760756fbce3d8480d74e6a7e28ad123c82112ea1f12a17` on both sides. |
| **Moved to a friendlier engine** | `engine/vitest.browser.config.ts` is **byte-identical** to `e53e55b` (`instances: chromium, firefox, webkit`, `headless`, default file parallelism). The harness `test-browser/worker/harness.ts` is byte-identical too. |
| **Frame rate capped to cut the payload** | The gate passes `maxFramesPerSecond: 0` explicitly, `RUN_OPTION_DEFAULTS.maxFramesPerSecond` is `0`, and `engine/test/worker/host.test.ts` pins that default with a test that names Compare as the reason. The 1.68 GB figure above is the proof it did not bite. |

The whole determinism core is untouched: `snapshot.ts`, `digest.ts`, `frames.ts`,
`simWorker.ts`, `api.ts`, `agents/step.ts`, `world/build.ts` and `vitest.config.ts` are
all SHA-256-identical to `e53e55b`. Only `protocol.ts` and `simHost.ts` changed, and only
for the fenced ceiling.

### III.1.1 Every deleted line in every changed test file, accounted for

`git diff --numstat e53e55b -- 'websim/**/*.test.ts'` reports three changed files,
`88/24`, `142/4`, `176/1`. All 29 deletions:

* `uithread.scale.worker.test.ts` — **23 comment lines** (the withdrawn attribution,
  quoted rather than dropped) and **1 import line**. **Zero assertions deleted.** One
  assertion *added* (`expect(settled).not.toBeNull()`).
* `uithread.worker.test.ts` — 1 function signature (gained `export`), 1 field line
  (became two), and **2 assertions repointed from `maxMs` to `maxExactMs`** — the G1 fix.
* `host.test.ts` — **1 import line**.

**The only change to assertion semantics anywhere in the diff is `maxMs` → `maxExactMs`.**
That is a loosening on exactly one half-open interval, `[49.995, 50)`, where the old
assertion was *false on a sample carrying zero long tasks*. It is the defect Part II
§II.8 identified, and it is accompanied by a new contradiction guard plus four new pinned
boundary cases. Net: one measure-zero correction, five added assertions.

### III.1.2 The one change that made the gate *harder*, not easier

The gate now waits for the worker's terminal `status` before reading the frame counters.
Part II's own run and the profiling DR both recorded `framesSeen 27,299 of 27,300` /
`bytes 1,681,858,328` — the stream was being read mid-flight, so the **non-vacuity guard
failed first and masked a long-task result that was also red**. With the drain, every run
reads the complete `27,301 / 1,681,919,966`. The wait sits *after* `probe.stop()`, so it
is outside the measurement window. This exposes more red, not less.

---

## III.2 Clause 2 re-measured — the full distribution, per engine

Windows 11, 16 logical cores, headless. The shipped gate file, unmodified.

### Isolated (one engine, this file only) — three repetitions each

```
engine    rep exit    samples    p50   p99  p99.9    max   >=50ms  >=25ms  window   frames
chromium   1   0    16,182,724   0.1   0.1    0.2    6.4       0       0   69.7 s   27,301
chromium   2   0    16,111,328   0.1   0.1    0.2    6.6       0       0   69.1 s   27,301
chromium   3   0    15,817,193   0.1   0.1    0.2    6.4       0       0   68.6 s   27,301
firefox    1   1    21,888,097   0.1   0.1    1.1    223       2      27  146.3 s   27,301
firefox    2   1    17,704,338   0.1   0.1    1.1    214       3      14  113.1 s   27,301
firefox    3   1    10,679,125   0.1   0.1    1.1    180       3      14   60.4 s   27,301
webkit     1   0       277,686   0.1   1.1   23.1     39       0     235  108.2 s   27,301
webkit     2   0       188,483   0.1   3.1   27.0     44       0     243  107.0 s   27,301
webkit     3   0       134,748   0.1   6.1   25.1     35       0     170   57.9 s   27,301
```

### Three-up — `npm run test:browser` exactly as CI runs it

```
engine     scale            longTasks  max      p99.9   >=25ms  window    frames
chromium   6,842 / 455 h        0      15.8 ms   0.2 ms      0  164.4 s   27,301
firefox    6,842 / 455 h        2     113   ms   1.1 ms      3  223.2 s   27,301
webkit     6,842 / 455 h       11     154   ms  29   ms    479  191.6 s   27,301
chromium     800 /  24 h        0       9   ms      —       —     2.1 s    1,441
firefox      800 /  24 h        1      94   ms      —       —     1.6 s    1,290
webkit       800 /  24 h        4      97   ms      —       —     3.8 s    1,411
```

### Does the clause hold on all three? **No.**

* **Chromium — holds**, with ~7.6x headroom and not one gap even at half the budget, in
  six runs out of six (max 6.4–15.8 ms).
* **Firefox — fails, every time.** **Six of six at production scale** — three isolated and
  three matrix runs — plus the 800-resident case in all three matrix runs. 2–3 long tasks,
  worst gap **180–223 ms isolated** and 113–149 ms under the matrix, i.e. **2.3–4.5x the
  budget**. This is not load and it is not the instrument: `probe.ts` is byte-identical to
  the version that produced every earlier number.
* **WebKit — no usable headroom, and red under the configuration CI runs.** One matrix run
  in three was red (**11 long tasks, 154 ms**); the other two and all three isolated runs
  were green at 35–44 ms — but with **170–479 gaps at or above half the budget** and p99.9
  of 23–29 ms in every single run. 50 ms sits inside its normal spread. "Green" here is a
  coin landing the right way up, not headroom.

**Clause 2 — "UI thread long-task-free (< 50 ms) at max speed" — is FALSE on two of the
three shipped engines.**

### III.2.1 The gate is a live instrument, not a permanently-red stamp

A budget that is always red proves nothing. So I injected a UI-thread regression on
**Chromium — the one engine that passes** — and watched it fail (RP2 below): forcing
2,048-frame batches took Chromium from `max 6.4 ms, 0 long tasks` to `max 55.4 ms, 2 long
tasks`, and the failure message names the clause verbatim. The gate discriminates.

### III.2.2 The null control, re-run independently — it reproduces

`DR-WP10-uithread-perf` §6.3(c) is the load-bearing experiment for the claim that no
change to `websim` can make clause 2 true on Firefox, and Part III's brief was to distrust
every report. So I re-ran cell **N1** myself — the accepted probe on a cold page for 40 s,
**no worker, no simulation, no frame stream, no snapshot ring, nothing under test at all**:

```
engine    run   hops/s     max      >=50ms  >=25ms  gap at    inside the worst gap
firefox    1   201,084   137 ms       2       10    t=3.40 s  0 messages, 0.00 ms handler, 1 rAF, 137 ms unaccounted
firefox    2   202,910   140 ms       2       12    t=3.41 s  0 messages, 0.00 ms handler, 1 rAF, 140 ms unaccounted
firefox    3   201,374   143 ms       2        7    t=3.41 s  0 messages, 0.00 ms handler, 1 rAF, 143 ms unaccounted
chromium   1   317,172    18.8 ms     0        0    t=3.27 s
webkit     1     3,852    15   ms     0        0    t=0.69 s
```

Firefox's `rafMaxGapMs` is **168–170 ms** in all three runs, so `requestAnimationFrame`
stalls alongside the probe. **Three runs out of three, a ~140 ms long task with nothing
under test.** This matches the DR's own 138/139/143 ms at t ≈ 3.36–3.52 s to within a few
milliseconds. The attribution stands, independently confirmed, and the earlier attribution
to the snapshot ring is rightly withdrawn.

Three things follow, and all three matter:

1. **It changes nothing about this verdict.** Clause 2 *as written* — "the UI thread stays
   long-task-free (< 50 ms) at max speed" — is false on Firefox. A criterion that cannot
   distinguish "our code stalls the thread" from "the page stalls" is still a criterion,
   and it is not satisfied.
2. **But it does change what the right fix is.** The lever is not in `websim`. Widening
   the threshold, shrinking the population, shortening the horizon or capping the frame
   rate would not merely be dishonest — per DR §6.3 the first three would not even work,
   and my N1 runs are why.
3. **The remedy the DR proposes (§8.1, a differential empty-page control) is a
   renegotiation of a WP10 acceptance criterion** and needs a decision record and sign-off
   under plan §9.3. It has correctly **not** been applied inside the gate file. Note also
   the DR's own caveat — cell N3, which I did **not** re-run and therefore do not certify:
   it reports the event vanishing when the probe samples at 36 Hz instead of ~201,000 Hz,
   i.e. the instrument is part of the phenomenon. My own N1 numbers are consistent with
   that (the probe occupies the thread at ~201 k hops/s and 0.00 ms of that is handler
   work), but consistent is not the same as verified. Any restatement of the clause should
   say what main-thread duty cycle it is about, and N3 should be re-run before it is.

---

## III.3 Determinism survived

The risk with any change to frame cadence or the streaming path is that the thing this
project exists for gets traded for a frame budget. It did not.

### III.3.1 The simulation still executes every tick

Directly observed, not argued. In **all 18** production-scale runs across three engines
(nine isolated, plus three three-engine matrix runs):

```
workerTicks   27,300   (= 455 h × 60, the full horizon)
framesSeen    27,301   (a frame at tick 0 and at every one of 27,300 ticks)
streamMessages 28,675
bytesReceived 1,681,919,966
snapshotsTaken   228
```

Identical to the digit in every run. **No frame was coalesced, no frame was dropped, no
tick was skipped.** The gate asserts `summary.tick === 27_300` and
`framesSeen >= 27_300` in its own right, so a run that skipped work could not report green.

### III.3.2 The display ceiling cannot reach the model

`maxFramesPerSecond` is the only wall-clock-dependent decision in `SimHost`. With the
shipped default (`0`) every added branch short-circuits, so the default path is provably
the `e53e55b` path. With the ceiling **on**, `engine/test/worker/host.test.ts` proves the
fence by digest rather than by prose: a capped run is byte-identical to a **bare
`sim.run()`** reference (not to another hosted run, so two equally-wrong hosts cannot
agree), with a non-vacuity assertion that the ceiling actually suppressed > 600 frames,
plus subsequence/ordering, metric-losslessness, no-op-at-high-ceiling and input-validation
cases. `nextStopTick` never consults it.

### III.3.3 Byte identity in the worker, all three engines

`engine/test-browser/worker/snapshot.worker.test.ts` — **7 tests passed on Chromium,
Firefox and WebKit** in the full matrix run. `cross-engine.digest.test.ts` — **17 tests
passed on all three**, which is the Tier-2 cross-engine digest gate.

### III.3.4 WP8 clause 3, recomputed from raw archive bytes

I did not read the harness's numbers. I read the certified Java CSVs under `docs/runs/`
with my own one-line counters — `final_state == "SHELTERED"` over `agents.csv`, and the
`policy_refused` / `refused_count` columns summed over `shelters.csv`:

| Archive run | rows | sheltered | policy_refusals | door_refusals_total | unreachable |
|---|---|---|---|---|---|
| `phase-e/ER-A-n6842-seed42` | 6,842 | **1,215** | **541** | 836 | 4 |
| `scenario-e/SE-E18-seed42` | 6,842 | **1,252** | **543** | 834 | 9 |
| `scenario-e-v2/SE2-E18-d1-seed42` | 6,842 | **1,307** | **709** | 1,152 | 9 |

**All six named figures reproduce exactly** — 1,215 / 1,252 / 1,307 sheltered and
541 / 543 / 709 policy refusals — and match `validation/test/wp8-archive-replay.test.ts`'s
`HEADLINE` literals cell for cell.

---

## III.4 Revert-proofs — all three WP10 clauses

Method: SHA-256 the target, park the bytes outside the repository, apply **one** textual
substitution (aborting unless the anchor is unique), run a real child `vitest`, restore
from the parked copy, re-hash. **All three restored byte-identical.**

| ID | Clause | Mutation | Result |
|---|---|---|---|
| **RP1** | **W10-1** snapshot-replay byte identity in the worker | `snapshot.ts`: `internals.admissionEpoch = snap.admissionEpoch;` → `= 0;` | **RED in real Chromium**, 3 failed / 4 passed. Names the field: *"worker replay diverged. token 1: sim.admissionEpoch=4042000000000000 != 0000000000000000"*, plus scrub and scrub-and-continue digest divergences. |
| **RP2** | **W10-2** UI thread long-task-free | `simHost.ts`: `frameBatchSize` forced to `2048` | **RED on Chromium — the only engine that passes.** 1 failed / 1 passed: *"2 main-thread gap(s) >= 50 ms … (max 55.4 ms) … The WP10 clause 'UI thread long-task-free (< 50 ms) at max speed' does not hold at production scale in this engine."* Baseline on the same engine: 0 gaps, 6.4 ms. |
| **RP3** | **W10-3** Compare runs two synced workers | `simHost.ts`: round the stop tick down to the 240-tick slice grid | **RED in real Chromium**, 3 failed / 3. *"worker A overshot or undershot stop 60: expected +0 to be 60"*, *"expected 240 to be 300"*. |

```
snapshot.ts  before/after  ec5dc206ea5fb15f6bce256a5c33a4cd57e2b92284c21d90a32aee0dbb0808cc  RESTORED
simHost.ts   before/after  b1b16a4457d4fe45c9f43c5c3e4196895327fabd71f77fd2aa082e868ade0777  RESTORED
```

---

## III.5 G1, G2, G3 — each closed, each broken to prove it

| ID | The gap | Break applied | What went red |
|---|---|---|---|
| **G1** | the two boundary assertions read different quantities | `uithread.worker.test.ts`: round `maxExactMs` | **3 failed / 5 passed**, naming it: *"gap 49.9951: the two criterion assertions disagree: expected true to be false"* and *"expected 50 to be less than 50"* — the original WebKit signature, reproduced on demand |
| **G2** | `npm run ci` did not cover WP10 | `package.json`: drop `&& npm run gate:browser` from `ci` | **1 failed / 13 passed** — *"`npm run ci` probes for browsers but never runs the matrix"* |
| **G3** | the nightly YAML was gated by nothing | `websim-nightly.yml`: make the two working jobs' `if:` conditions non-complementary | **3 failed / 6 passed** — *"routes a scheduled run with no artifact runner to the DEGRADED job, not to nothing"*, plus the exact-complement and needs-graph assertions |

All three restored SHA-256-identical (`9fc9992c…`, `91b93015…`, `ae75c2f5…`).

**G2 is closed in the way that matters most here:** `npm run ci` now ends with the full
browser matrix, so it **cannot be green while clause 2 is red** — and on this tree it is
not. The local gate and the hosted `cross-engine` job now run the same command behind the
same probe.

### III.5.1 G1 is closed in one file of the two that have the defect — OPEN

`probe.ts` is unchanged, and the production-scale gate still asserts its **rounded**
`maxMs` against the threshold while counting `longTasks` from the exact histogram.
Reproducing `probe.ts`'s own arithmetic:

```
gap 49.9951  ->  bin 499, longTasks 0, maxMs 50.00
                 expect(longTasks).toBe(0)          PASSES
                 expect(maxMs).toBeLessThan(50)     FAILS      <-- the same contradiction
```

It fails *safe* — red where the clause holds — so it cannot manufacture a false GO, and
Chromium's 6.4 ms and Firefox's 180 ms are nowhere near the boundary. But it is the exact
defect G1 was raised to close, still live in the file that is the headline gate, and
WebKit's 35–44 ms is closer to it than anything else in this report. **Recommend giving
`GapDistribution` a `maxExactMs` and repointing
`uithread.scale.worker.test.ts:366` at it.**

---

## III.6 Runs, exact counts and exit codes

All on the dev box (16 logical cores), from `websim/`.

| Command | Exit | Result |
|---|---|---|
| `npm test` | **0** | `Test Files 113 passed (113)`; `Tests 1789 passed (1789)`; 621.18 s |
| `npm run test:strict` | **0** | `Test Files 113 passed (113)`; `Tests 1789 passed (1789)`; 622.08 s. **Zero** `REQUIRES artifacts` in the log — no greenness anywhere in this report is greenness-by-skipping |
| `npm run ci` | **1** | Fails at the **final** step, `gate:browser`. Everything before it green: probe (3 engines present) → typecheck (all workspaces, and `engine` compiles `tsconfig.json` *and* `tsconfig.browser.json`) → `Tests 1789 passed (1789)` → `check:scratch` *"pipeline/out is clean — 13 produced entr(ies) allowed, test-tmp/ empty"* → `lint:claims` *"0 hit(s) in 0 file(s); 456 file(s) scanned against 23 active rule(s)"* → matrix `Tests 2 failed \| 109 passed (111)`, both Firefox |
| `npm run test:browser` (run 1) | **1** | `Test Files 4 failed \| 11 passed (15)`; `Tests 4 failed \| 107 passed (111)`; 238.69 s. Firefox × 2 scales, WebKit × 2 scales |
| `npm run test:browser` (run 2) | **1** | `Test Files 2 failed \| 13 passed (15)`; `Tests 2 failed \| 109 passed (111)`; 110.70 s. Firefox × 2 scales |

**Three independent matrix runs, three different failure sets, one constant: Firefox is
red at production scale in every one.** WebKit was red in the first and green in the other
two — which is the non-determinism recorded as open item 5, not a reason to discount it.

| matrix run | chromium | firefox | webkit |
|---|---|---|---|
| `test:browser` run 1 | 0 gaps, 15.8 ms | **2 gaps, 113 ms** | **11 gaps, 154 ms** |
| `npm run ci` matrix | 0 gaps, 11 ms | **2 gaps, 149 ms** | 0 gaps, 42 ms (201 gaps ≥ 25 ms) |
| `test:browser` run 2 | 0 gaps | **red** | green |

### III.6.1 `npm run ci` is red, and that is G2 working

`ci` is now
`gate:browser --probe && typecheck && test && check:scratch && lint:claims && gate:browser`.
It fails at the **final** step — the browser matrix — having passed every earlier one.
That is precisely the outcome G2 was raised to produce: before this change `npm run ci`
returned 0 while WP10 clause 2 was red, because nothing in it ran the browser matrix.
**A red `ci` here is the gate telling the truth, not a regression.**

---

## III.7 No test was weakened

| Measure | At `e53e55b` | Now | Delta |
|---|---|---|---|
| `.test.ts` files under `websim/` | 116 | **118** | +2, **0 deleted** |
| Browser test **files** | 5 (15 file-instances) | **5 (15)** | unchanged, same five paths |
| Browser tests | 99 | **111** | +12 = 4 new boundary cases × 3 engines |

* **Zero test files deleted.** Every path in `git ls-tree -r e53e55b -- websim | grep
  '\.test\.ts$'` still exists on disk; I checked all 116 individually.
* **Three tracked test files changed**, 29 deletions total, every one accounted for in
  §III.1.1: 24 comment/import lines, 1 signature line, 1 field line, and the 2 G1
  repointings. **No assertion was deleted.**
* **Two new test files**, both additive: `tools/test/browser-gate.test.ts` (14 tests) and
  `validation/test/wp9-nightly-workflow.test.ts` (9 tests). Neither is artifact-gated;
  neither can skip.
* **No raised threshold.** `LONG_TASK_MS` is 50 on both sides. No `testTimeout` was
  changed on this tree.
* **No loosened tolerance.** No added line in the diff matches `toBeCloseTo`, `tolerance`,
  `epsilon` or a widened `Math.abs(...) <` bound.
* **No `skip` / `only` / `todo`.** A tree-wide scan finds none outside comments, the
  artifact-gate machinery (`tools/artifact-gate.ts`, which *is* the sanctioned loud-skip
  path) and the linter's own fixtures — and that scan is itself a test
  (`tools/test/artifact-gate.test.ts:356`).

---

## III.8 Oracle corpus, scratch, tree

```
decision-fixtures :  25 files, 476.9 MiB
world-fixtures    : 185 files, 151.7 MiB
closure-fixtures  :  21 files,  29.4 MiB
TOTAL pipeline/out: 852 files, 828.8 MiB
```

**No shrink** — identical to the file and the byte to the figures recorded in Part I §9
and Part II §II.9. **No `--clean` was run at any point and nothing under
`pipeline/out/` was deleted.**

`git status --porcelain` from the repository root lists **16 paths, every one inside
`websim/` or `.github/workflows/`**. Nothing outside. `docs/runs/`, `Geography/` and
`docs/` were read-only throughout; the only files I created outside the repository are in
a scratch directory.

Six source files were mutated during this gate (three for the WP10 clauses, three for
G1/G2/G3). Every one was restored from a parked copy and re-verified by SHA-256:

```
engine/src/worker/snapshot.ts                    ec5dc206ea5fb15f6bce256a5c33a4cd57e2b92284c21d90a32aee0dbb0808cc
engine/src/worker/simHost.ts                     b1b16a4457d4fe45c9f43c5c3e4196895327fabd71f77fd2aa082e868ade0777
engine/test-browser/worker/uithread.worker.test.ts  9fc9992c6c1e68dd7acf7c820c1797335926a894333873889c4e808c752ab7c9
package.json                                     91b93015ccf42c5a0844d67a07aa0ad24201162eefc1eb1d41fccae8e8867f5e
.github/workflows/websim-nightly.yml             ae75c2f593ebe15fc421507b14ad3ab60a6addfbeb9d1ec597ba627f5a352163
```

---

## III.9 Open items

1. **WP10 clause 2 is false and remains the blocker.** The three honest routes are
   unchanged: fix the stall, renegotiate the clause with a decision record and sign-off
   under plan §9.3, or state plainly that the product ships with a first-run pause on
   Firefox. Widening the threshold, shrinking the population, shortening the horizon,
   capping the frame rate and narrowing to Chromium remain off the table, and the gate
   file says so in its own text.
2. **G1 survives in `probe.ts` / `uithread.scale.worker.test.ts`** (§III.5.1). Fails safe;
   still the same defect; one field and one line to close. It is easy to miss because
   `probe.ts:59` documents `maxMs` as *"Exact, not binned"* while `stop()` returns
   `Number(this.max.toFixed(2))` — not binned, but rounded, which is the half of the
   sentence that decides the comparison. Fix the comment even if the field stays.
3. **`DR-WP10-uithread-perf` §6.3's null control is single-sourced.** It is the load-
   bearing experiment for "no change to `websim` can make the clause true", and the
   decision in item 1 should not be taken on one investigator's measurement of it.
4. **`maxFramesPerSecond` has no caller.** `protocol.ts` describes its intended use in the
   present tense — *"free-running playback (the Run screen at max speed) sets it"* — but
   the Run screen is WP11 and nothing in the tree passes a non-zero value. The behaviour
   is fully gated by `host.test.ts`; only the tense over-claims. Worth a word given this
   project's standards for the difference between built and shipped.
5. **The gate is non-deterministic on WebKit**, and that is now measured rather than
   suspected: red three-up (11 gaps, 154 ms), green isolated three times (35–44 ms), with
   170–479 gaps at or over half the budget in every isolated run. Whatever is decided
   about clause 2, WebKit's absence of headroom is a finding in its own right and should
   not be filed as CI flake.
6. **The nightly workflow is now gated by a test (G3), but only structurally.** The test
   proves the two conditions are exact complements and that the verdict job fails when
   neither branch worked. It cannot prove GitHub ever runs it.

---

## III.10 Verdict

**WP10 — NO-GO.**

Clause 1 holds and is revert-proofed in a real `Worker` across all three engines.
Clause 3 holds and is revert-proofed. **Clause 2 is false on Firefox and on WebKit at the
population and horizon the product ships with**, and I measured it myself — nine isolated
runs and three full matrix runs — rather than reading it.

This is the second consecutive accurate NO-GO on the same clause, and the important thing
about it is what did *not* happen in between. The workload is byte-for-byte what it was —
1,681,919,966 bytes, 28,675 messages, 27,301 frames, 27,300 ticks, in every one of
eighteen runs. The threshold is still 50 ms. The probe, the harness and the matrix config
are SHA-256-identical to `e53e55b`. The one new lever that *could* have bought a green
number defaults to off, is set to off in the gate, and has no caller. The gate was made
strictly harder in one respect (the stream-drain fix, which removed an under-count that
was masking a red result) and its verdict got worse, not better: 180–223 ms isolated on
Firefox against Part II's 156 ms.

A red number that survives this much scrutiny is a measurement. The correct action is to
decide what to do about the clause — with a decision record — not to make the gate
quieter.

**One thing this pass adds that Parts I and II did not have: the null control, re-run by a
second party.** Three runs out of three, a cold Firefox page with no worker, no simulation
and nothing under test produces a 137–143 ms long task with zero messages and 0.00 ms of
handler time inside it (§III.2.2). So the honest statement of the blocker is sharper than
"WP10 is slow":

> Clause 2 as written is **false**, and the cause is **not in `websim`**. It cannot be
> closed by engineering inside this work package, and it must not be closed by editing the
> gate. It needs a decision — a differential control against an empty page, or an explicit
> restatement of what the clause is about — recorded and signed off under plan §9.3.

Two genuine defects the profiling work did surface are worth carrying forward on their own
merits, neither of which is the long task and neither of which should be sold as fixing
it: the frame stream emits 12–136 frames per paintable frame (92–99 % of 1.68 GB is never
rendered), and `sliceTicks: 30` costs WebKit 15–18 s of pure yield latency per run. The
`maxFramesPerSecond` ceiling addresses the first, is correctly defaulted off, is fenced by
digest, and — correctly — is not wired to anything yet.

