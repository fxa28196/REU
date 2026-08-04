/**
 * WP10 UI-thread profile — the **ordering control** (DR-WP10-uithread-perf).
 *
 * Every Firefox stall observed so far — the gated test run on its own (209 ms),
 * the first matrix (183 ms), the first replicate (180 ms) — was the **first**
 * production-scale run in a fresh page. The two later replicates of the *same*
 * configuration, and all eleven runs of every other configuration, were clean.
 * Position and configuration are therefore perfectly confounded in the data, and
 * the existing attribution ("the snapshot ring plus the 30-tick yield cadence")
 * was drawn from single-run cells that all share that confound.
 *
 * This file breaks it. The cheapest configuration in the whole matrix runs
 * **first**, and the red configuration runs second and third in the same page:
 *
 *  - if the stall follows the *configuration*, cell 1 is clean and cells 2/3
 *    stall;
 *  - if it follows the *position*, cell 1 stalls with no frame stream at all and
 *    cells 2/3 are clean.
 *
 * One of those is true and they are not compatible. Run it more than once — the
 * event is bimodal with roughly 0.6 occurrences per run, so a single pass
 * decides nothing either way.
 */

import { describe, it } from "vitest";

import { ENGINE_LABEL } from "./instrument.js";
import { GATED, runConfig } from "./matrix.js";

describe(`WP10 UI-thread ordering control [${ENGINE_LABEL}]`, () => {
  it("O1 FIRST in the page: frames off (the cheapest cell in the matrix)", async () => {
    await runConfig("O1-noframes-first", { ...GATED, frameEveryTicks: 0 });
  }, 1_800_000);

  it("O2 SECOND in the page: the gated configuration", async () => {
    await runConfig("O2-gated-second", GATED);
  }, 1_800_000);

  it("O3 THIRD in the page: the gated configuration again", async () => {
    await runConfig("O3-gated-third", GATED);
  }, 1_800_000);
});
