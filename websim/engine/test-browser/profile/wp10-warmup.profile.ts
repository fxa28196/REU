/**
 * WP10 UI-thread profile — the **warm-up control** (DR-WP10-uithread-perf).
 *
 * `wp10-order.profile.ts` showed, three times out of three, that the Firefox
 * stall follows the *position* of a run inside a fresh page and not the
 * configuration: the cheapest cell in the matrix (frames disabled, 14,560 bytes
 * delivered in total) stalls for 155–165 ms when it runs first, and the
 * configuration the gate calls red is clean when it runs second and third.
 *
 * This file asks how much work it takes to trip the event, which is the
 * difference between two very different mitigations:
 *
 *  - if a **0.3-second** run at 800 residents / 24 h absorbs it, the trigger is
 *    "the page's first non-trivial JS work" and a warm-up run — or simply not
 *    measuring the first run — removes it;
 *  - if the tiny run is clean and the long run that follows still stalls, the
 *    trigger needs real allocation volume and a warm-up is not a fix.
 *
 * The probe covers the tiny run too, so "the warm-up absorbed it" is a
 * measurement rather than an inference from the next cell being clean.
 */

import { describe, it } from "vitest";

import { ENGINE_LABEL } from "./instrument.js";
import { GATED, runConfig } from "./matrix.js";

describe(`WP10 UI-thread warm-up control [${ENGINE_LABEL}]`, () => {
  it("W0 FIRST in the page: a 0.3 s run — 800 residents, 24 h", async () => {
    await runConfig("W0-tiny-first", GATED, { residents: 800, hours: 24 });
  }, 600_000);

  it("W1 SECOND: frames off at production scale (the cell that stalls when first)", async () => {
    await runConfig("W1-noframes-second", { ...GATED, frameEveryTicks: 0 });
  }, 1_800_000);

  it("W2 THIRD: the gated configuration", async () => {
    await runConfig("W2-gated-third", GATED);
  }, 1_800_000);
});
