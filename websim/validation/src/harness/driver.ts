/**
 * driver.ts — running the WP8 gate subset over one run, in the Python's order.
 *
 * `verify_E_runs.py`'s `check_run()` (lines 768–785) decides which gates apply
 * from two flags: `e_arm` (a baseline-real Phase-E arm, `--er`) and `se_arm`
 * (a Scenario-E arm, `--se`). An E0 null is neither, and gets a SKIP line for
 * (f) rather than silence — which is why the archived check *counts* are what
 * they are, and why this driver reproduces the skip instead of omitting it.
 *
 * The check counts this subset produces, per run class:
 *
 * | class | (f) | (g) | (h) | (i) | (k) | (l) | total |
 * |---|---|---|---|---|---|---|---|
 * | E0 null (`--null`) | 1 SKIP | 2 | 2 | — | — | — | **5** |
 * | ER (`--er`) | 1 | 2 | 2 | — | — | — | **5** |
 * | SE, `closuresCode 0` | 1 | 2 | 2 | 1 | 2 | 1 | **9** |
 * | SE, `closuresCode 1` | 1 | 2 | 2 | 1 | 6 | 2 | **14** |
 * | SE, `closuresCode 3` | 1 | 2 | 2 | 2 | 6 | 2 | **15** |
 *
 * Those are the same per-gate counts `WP8-SPEC-archive-gates.md` §3.7 records
 * for the full suite (11 / 19 / 24 / 25 per run) minus the (b)(c)(d)(e)(j)
 * gates this work package does not port: 11 − 6 = 5, 19 − 10 = 9, 24 − 10 = 14,
 * 25 − 10 = 15.
 */

import type { Checks } from "./checks.js";
import { checkWachinger, skipWachingerForNullArm } from "./gate-f-wachinger.js";
import { checkECensus } from "./gate-g-census.js";
import { checkManifest, checkSeManifest } from "./gate-hi-manifest.js";
import { checkSeClosures, type ClosureScheduleSource } from "./gate-k-closures.js";
import { checkSeCounters } from "./gate-l-counters.js";
import type { RunView } from "./run-view.js";

/** Which arm a run is, in the Python's vocabulary. */
export type RunArm = "null" | "er" | "se";

export interface Wp8GateOptions {
  readonly arm: RunArm;
  /** Required for `arm === "se"`; gate (k) reads the schedule through it. */
  readonly schedules?: ClosureScheduleSource;
}

/**
 * Run the WP8 gate subset over one run, registering checks in the Python's
 * order: (f), (g), (h), then — for a Scenario-E arm — (i), (k), (l).
 *
 * Gate (j), severe-series provenance, sits between (i) and (k) in the Python
 * and is deliberately absent here (WP9). Its omission changes no verdict; it
 * changes the check count, which is why the count table above is stated in
 * terms of this subset rather than borrowed from the Python's totals.
 */
export function runWp8Gates(ck: Checks, run: RunView, options: Wp8GateOptions): void {
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
      `runWp8Gates(${run.name}): a Scenario-E arm needs a ClosureScheduleSource for gate (k). ` +
        "Refusing to skip the gate silently — see tools/artifact-gate.ts for the policy.",
    );
  }
  checkSeManifest(ck, run);
  checkSeClosures(ck, run, schedules);
  checkSeCounters(ck, run);
}
