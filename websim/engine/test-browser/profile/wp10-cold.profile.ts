/**
 * WP10 UI-thread profile — **cold-page cells** (DR-WP10-uithread-perf).
 *
 * The ordering and warm-up controls established that on Firefox the stall
 * belongs to whichever run is first in a fresh page, whatever it is configured
 * to do. Every cell here must therefore be measured *as* that first run, which
 * means one cell per page. Select exactly one with `-t`; the others are skipped,
 * so the selected one is the first thing the page executes:
 *
 * ```
 *   npx vitest run --config engine/vitest.profile.config.mts --browser=firefox \
 *     engine/test-browser/profile/wp10-cold.profile.ts -t "C5"
 * ```
 *
 * The two that decide the recommendation:
 *
 *  - **C2** — frames off *and* snapshots off. The page receives 14,560 bytes and
 *    the worker keeps nothing. If this is clean cold, the ring's footprint sets
 *    the magnitude and shrinking it is a real lever. If it stalls anyway, the
 *    trigger is the world build plus the tick loop and no streaming or scrub
 *    setting can reach it.
 *  - **C5** — the run options the protocol actually ships
 *    (`RUN_OPTION_DEFAULTS`). If the shipped configuration stalls on a cold page
 *    then the clause is not reachable by re-tuning the stream at all, and the
 *    honest options are a design change or a renegotiated clause.
 */

import { describe, it } from "vitest";

import { ENGINE_LABEL } from "./instrument.js";
import { GATED, runConfig } from "./matrix.js";

describe(`WP10 UI-thread cold-page cells [${ENGINE_LABEL}]`, () => {
  it("C2 cold: frames off AND snapshots off", async () => {
    await runConfig("C2-cold-noframes-nosnap", {
      ...GATED,
      frameEveryTicks: 0,
      snapshotEveryTicks: 0,
    });
  }, 1_800_000);

  it("C3 cold: max frame rate, snapshots off", async () => {
    await runConfig("C3-cold-nosnap", { ...GATED, snapshotEveryTicks: 0 });
  }, 1_800_000);

  it("C5 cold: the shipped RUN_OPTION_DEFAULTS", async () => {
    await runConfig("C5-cold-defaults", {
      sliceTicks: 240,
      frameEveryTicks: 60,
      frameBatchSize: 8,
      metricBatchSize: 24,
      snapshotEveryTicks: 60,
    });
  }, 1_800_000);

  it("C6 cold: shipped defaults at the DEFAULT preset population (2,037 x 312 h)", async () => {
    await runConfig(
      "C6-cold-defaults-2037",
      {
        sliceTicks: 240,
        frameEveryTicks: 60,
        frameBatchSize: 8,
        metricBatchSize: 24,
        snapshotEveryTicks: 60,
      },
      { residents: 2037, hours: 312 },
    );
  }, 1_800_000);
});
