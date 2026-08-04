/**
 * WP10 UI-thread profile — **does the display-cadence ceiling buy anything?**
 *
 * The measurement behind `RunOptions.maxFramesPerSecond`
 * (DR-WP10-uithread-perf §8.3 D1). Two cells, identical in every respect except
 * the ceiling, both at the shipping population and the longest horizon:
 *
 *  - `CAPOFF` — the configuration the production-scale gate uses, unchanged.
 *    This is the "before" arm and it must reproduce the numbers already on
 *    record, or the comparison below is measuring something else.
 *  - `CAP60` — the same, with the display capped at 60 captured frames per
 *    wall-clock second.
 *
 * ## What this file is NOT
 *
 * It is **not** the fix for WP10 acceptance clause 2, and it must not be read as
 * one. DR-WP10-uithread-perf §6.3 established that the Firefox long task
 * reproduces with **no worker, no simulation and no frame stream at all** —
 * 138–143 ms, three runs out of three, on a cold page with nothing under test.
 * Nothing in this file can move that, and if `CAP60` happens to come out clean
 * on a given pass, §6.3(a) is the reason to distrust it: the event is bimodal
 * and positional, so a single clean run of anything proves nothing.
 *
 * What the ceiling is justified by is §5.1 on its own: the page is sent 12.1–15.6
 * frame messages for every one it can paint at this scale, 91.7–93.6 % of
 * 1.68 GB is never rendered, and on WebKit — 264–535 µs per port message against
 * 3.1–5.0 µs elsewhere, i.e. message-bound — that surplus costs 6.0x wall clock
 * at 800 residents. Those are throughput facts, independent of the long task.
 *
 * ## Run it one cell per page
 *
 * The stall is positional (§6.3a): whichever cell goes first in a fresh page
 * carries the cold-start event, so running both in one page would hand the
 * penalty to `CAPOFF` and flatter `CAP60` for free.
 *
 * ```
 *   npx vitest run --config engine/vitest.profile.config.mts --browser=firefox \
 *     engine/test-browser/profile/wp10-cap.profile.ts -t "CAPOFF"
 *   npx vitest run --config engine/vitest.profile.config.mts --browser=firefox \
 *     engine/test-browser/profile/wp10-cap.profile.ts -t "CAP60"
 * ```
 *
 * Repeat each at least three times per engine. Neither cell asserts a budget —
 * `runConfig` asserts only that the run reached the horizon.
 */

import { describe, it } from "vitest";

import { ENGINE_LABEL } from "./instrument.js";
import { GATED, runConfig } from "./matrix.js";

/** Frames per wall-clock second. 60 is the fastest any of the three engines paints. */
const CEILING_FPS = 60;

describe(`WP10 display-cadence ceiling [${ENGINE_LABEL}]`, () => {
  it("CAPOFF — the gated configuration, no ceiling (the before arm)", async () => {
    await runConfig("CAPOFF-gated", GATED);
  }, 1_800_000);

  it(`CAP60 — the gated configuration with the display capped at ${CEILING_FPS} fps`, async () => {
    await runConfig("CAP60-gated", { ...GATED, maxFramesPerSecond: CEILING_FPS });
  }, 1_800_000);
});
