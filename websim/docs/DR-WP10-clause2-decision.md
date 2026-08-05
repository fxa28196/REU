# DR-WP10-clause2-decision — acceptance clause 2 restated, by decision, not by edit

**Status:** DECIDED. **Date of record:** 2026-08-04.
**Authority:** the researcher's explicit decision, relayed 2026-08-04, choosing the
"perf clause only" option: *restrict ONLY the UI-thread long-task budget to Chromium;
keep all three engines in the cross-engine byte-identity gate.* This is the plan-§9.3
sign-off that `DR-WP10-uithread-perf` §8.2 and both NO-GO gate passes
(`DR-WP9-WP10-verification` Parts II and III) said the clause needed. It was made with
the alternatives in front of the decision-maker, including the differential
empty-page control (§8.1) and full deletion of the two engines.

---

## 1. The clause, before and after

**Before (plan §8 WP10, clause 2):**

> UI thread long-task-free (< 50 ms) at max speed.

Measured three independent times, this is **false on Firefox as written and cannot be
made true by any change to `websim`**: a cold Firefox page with no worker, no
simulation, no frame stream and no snapshot ring produces 138–143 ms long tasks,
three runs of three, re-run by a second party with the same result
(`DR-WP10-uithread-perf` §6.3c; `DR-WP9-WP10-verification` §III.2.2). The same gate
is non-deterministic on Firefox (3 red / 2 green over five isolated runs of identical
code) and marginal-by-construction on WebKit, whose normal spread reaches half the
budget with nothing wrong (166 gaps ≥ 25 ms in a passing run).

**After — two clauses, both stated, one gated:**

- **2a (gated): on Chromium, the UI thread is long-task-free (< 50 ms) at max
  speed, at 800 and at 6,842 residents.** Chromium is the one engine where the
  measurement is deterministic and meaningful: 0 long tasks with ~8x headroom in
  every configuration ever measured on this box (worst 6.5 ms across 9 matrix
  cells, 3 isolated runs, and every serialised/three-up run on record). The
  assertions, thresholds, populations, horizons, probes and non-vacuity guards
  are untouched.
- **2b (reported, not gated): on Firefox and WebKit the same measurement runs and
  its distribution is printed** — every run, in the same JSON line the gate has
  always logged — but the budget is not asserted. The number it would fail on is
  the browser's own cold-start behaviour, established by null control, and a gate
  that goes red with the subject deleted is not measuring the subject.

## 2. What is deliberately kept

- **The three-engine cross-engine determinism matrix is untouched.** Firefox and
  WebKit still run every byte-identity, snapshot-replay and digest gate
  (`cross-engine.digest.test.ts`, `snapshot.worker.test.ts`, and the worker
  suites). That matrix is risk W4's defence — outcome bytes must not depend on
  the JS engine — and it is green on all three engines. Restricting *it* was
  considered and rejected in the same decision.
- **The measurement itself survives on all three engines.** Non-vacuity is still
  asserted everywhere (worker ran to horizon, production payload arrived, handler
  walked it), so the streaming machinery cannot silently stop being exercised on
  the engines that no longer gate the budget.
- **The positive controls still run everywhere.** A probe that cannot see a
  120 ms block fails the file in every engine, so 2b's reported numbers cannot
  quietly become an idle-thread measurement.

## 3. What is lost, said plainly

A red light that fired when Firefox or WebKit stalled. The recorded evidence is
that the light fired on browser cold-start behaviour `websim` does not control,
and fired non-deterministically — but a regression that stalled *only* Firefox or
*only* WebKit in steady state would now print numbers instead of failing CI.
Mitigations, in order of value:

1. The distributions are still printed on every run; a reader of the CI log sees
   them.
2. The genuinely user-facing costs on those engines are addressed by their own
   fixes, gated where they are deterministic: the frame-flood (D1) via
   `maxFramesPerSecond` — digest-gated in `host.test.ts`, wired to the WP11 Run
   screen at 60 fps — and the WebKit yield cost (D2) via the shipped
   `sliceTicks: 240` default and the corrected comment at `simHost.ts`.
3. `DR-WP10-uithread-perf` §8.3 records the warm-up option (running a throwaway
   slice behind the WP11 "building…" phase) as the honest product-level treatment
   of the Firefox cold-start pause, with the measured caveat that 0.7 s of warm-up
   halves but does not eliminate it.

## 4. Why not the differential control

`DR-WP10-uithread-perf` §8.1 designed a differential gate (streamed run must
produce no gap an empty page does not). It remains the most rigorous option on
paper. It was not chosen because both arms sit on a **positional, bimodal event**
(first-run-in-page ~140 ms, second-run ~0), so the differential is itself
noise-dominated unless both arms occupy the same cold-start position — which one
page cannot give two tests. The decision-maker was shown this option and chose
Chromium-only gating with reporting. That choice is recorded here precisely so a
future reader knows it was a decision with the trade-offs visible, not a quiet
narrowing.

## 5. Consequences applied with this record

- `uithread.worker.test.ts` and `uithread.scale.worker.test.ts`: budget
  assertions execute only when the engine is Chromium; both files log the full
  distribution on all engines; headers updated to cite this record. The list of
  "moves that would be dishonest" in those headers predates this record and is
  amended: narrowing to Chromium *by decision record with reporting retained* is
  the sanctioned outcome; narrowing it silently inside a gate file was and
  remains the dishonest version.
- `tools/browser-gate.ts` evidence text: names 2a as gated and 2b as reported.
- No threshold, population, horizon, probe, or determinism gate changed.

**With this record, WP10's clause set is: 1 (snapshot-replay byte identity in a
worker) GO; 2a GO once measured green on Chromium; 2b reported; 3 (Compare two
synced workers) GO. WP10 is acceptable when `npm run gate:browser` is green.**
