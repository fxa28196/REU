/**
 * driver.ts — the FULL `verify_E_runs.py` invocation, gates (a)–(l).
 *
 * Source: `scripts/verify_E_runs.py`, `check_run()` (lines 768–785) and
 * `main()` (lines 789–844).
 *
 * `harness/driver.ts` runs the WP8 subset — (f)(g)(h)(i)(k)(l) — and says so in
 * its own header. This driver is the WP9 completion: it inserts (b)(c)(d)(e)
 * ahead of (f) and (j) between (i) and (k), in the *source's* order, and adds
 * the `--null / --reference` R3 arm. Order matters for exactly one reason —
 * the archived check *census* is ordered evidence, and a driver that registered
 * the same checks in a different sequence would still be a different transcript
 * from the certified one.
 *
 * ── The check counts this reproduces ───────────────────────────────────────
 *
 * `WP8-SPEC-archive-gates.md` §3.7, measured 2026-07-31 against the certified
 * Python:
 *
 * | invocation | checks | breakdown |
 * |---|---|---|
 * | `--null X --reference Y`, `phase-e/` null | 23 (20 P / 0 F / 3 S) | (a)×12 + 11 |
 * | `--null X --reference Y`, `scenario-e{,-v2}/` null | 23 (21 P / 0 F / 2 S) | (a)×12 + 11 |
 * | `--er RUN` | **11** | (b)1 (c)1 (d)3 (e)1 (f)1 (g)2 (h)2 |
 * | `--se RUN`, `closuresCode 0` | **19** | 11 + (i)1 + (j)4 + (k)2 + (l)1 |
 * | `--se RUN`, `closuresCode 1` | **24** | 11 + (i)1 + (j)4 + (k)6 + (l)2 |
 * | `--se RUN`, `closuresCode 3` | **25** | 24 + the `closureDraw` sub-check |
 *
 * and the archive's own totals follow from them: the v1 matrix is
 * `9 × 24 + 9 × 19 = 387`, the v2 matrix `15 × 25 + 9 × 19 = 546`, grand total
 * **933**; the ER matrix is `9 × 11 = 99`. Those numbers were produced by the
 * Python before this port existed, so asserting them is a comparison against an
 * oracle rather than against ourselves.
 *
 * ── Why (e) and (f) are SKIPs rather than omissions ────────────────────────
 *
 * A skipped check is a *recorded* line. Omitting it would make the census
 * unfalsifiable: 11 checks with one skip and 10 checks with a gate quietly
 * missing look identical to a total. That is the failure this project has been
 * bitten by twice, and the counts above are the instrument that detects it.
 */

import type { Checks } from "../harness/checks.js";
import { checkWachinger, skipWachingerForNullArm } from "../harness/gate-f-wachinger.js";
import { checkECensus } from "../harness/gate-g-census.js";
import { checkManifest, checkSeManifest } from "../harness/gate-hi-manifest.js";
import { checkSeClosures, type ClosureScheduleSource } from "../harness/gate-k-closures.js";
import { checkSeCounters } from "../harness/gate-l-counters.js";
import { checkR3, type R3Result } from "../harness/r3-identity.js";
import type { RunView } from "../harness/run-view.js";

import { checkAsthmaControl } from "./gate-c-asthma.js";
import { checkBedSum } from "./gate-b-bed-sum.js";
import { checkSeSmoke } from "./gate-j-severe-series.js";
import { checkStates } from "./gate-d-terminal-states.js";
import { checkUnawareImmobility } from "./gate-e-unaware.js";

/** Which arm a run is, in the Python's vocabulary (`--null` / `--er` / `--se`). */
export type RunArm = "null" | "er" | "se";

export interface VerifyEOptions {
  readonly arm: RunArm;
  /** Required for `arm === "se"`; gate (k) reads the schedule through it. */
  readonly schedules?: ClosureScheduleSource;
}

/**
 * `check_run()` in full: (b) (c) (d)×3 (e) (f) (g)×2 (h)×2, then for a
 * Scenario-E arm (i) (j)×4 (k) (l).
 */
export function runVerifyEChecks(ck: Checks, run: RunView, options: VerifyEOptions): void {
  checkBedSum(ck, run);
  checkAsthmaControl(ck, run);
  checkStates(ck, run);
  checkUnawareImmobility(ck, run);

  if (options.arm === "null") {
    skipWachingerForNullArm(ck, run);
  } else {
    checkWachinger(ck, run);
  }
  checkECensus(ck, run);
  checkManifest(ck, run);

  if (options.arm !== "se") {
    return;
  }
  const schedules = options.schedules;
  if (schedules === undefined) {
    throw new Error(
      `runVerifyEChecks(${run.name}): a Scenario-E arm needs a ClosureScheduleSource for gate (k). ` +
        "Refusing to skip the gate silently — see tools/artifact-gate.ts for the policy.",
    );
  }
  checkSeManifest(ck, run);
  checkSeSmoke(ck, run);
  checkSeClosures(ck, run, schedules);
  checkSeCounters(ck, run);
}

/**
 * `main()`'s `--null X --reference Y` arm: the R3 identity proof, then the
 * per-run checks over the null with `e_arm=False`.
 *
 * The Python runs `check_run(ck, null_run, e_arm=False)` — the null is graded as
 * a non-E arm, because its barrier cost is zero by construction and gate (f)
 * would be asserting something the configuration forbids.
 */
export function runVerifyENull(
  ck: Checks,
  nullRun: RunView,
  refRun: RunView,
  extraExclude: ReadonlySet<string> = new Set(),
): R3Result {
  const r3 = checkR3(ck, nullRun, refRun, extraExclude);
  runVerifyEChecks(ck, nullRun, { arm: "null" });
  return r3;
}

/**
 * The per-run check count §3.7 records for a run class. Used by the archive
 * suite to assert the census exactly rather than "at least something ran".
 */
export function expectedCheckCount(arm: RunArm, closuresCode: number): number {
  if (arm !== "se") {
    return 11;
  }
  if (closuresCode === 0) {
    return 19;
  }
  return closuresCode === 3 ? 25 : 24;
}
