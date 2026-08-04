/**
 * WP10 UI-thread profiling matrix — the measurement behind
 * `websim/docs/DR-WP10-uithread-perf.md`.
 *
 * **This file is not a gate.** It asserts nothing about the budget; it prints
 * distributions. It is deliberately excluded from `npm run test:browser` (that
 * config includes `engine/test-browser/**\/*.test.ts`; this is `*.profile.ts`)
 * and is run on its own config, `engine/vitest.profile.config.mts`, because it
 * costs ~6 minutes per engine and because a profiler that can fail a build is a
 * profiler people delete.
 *
 * Run one engine at a time — three engines sharing 16 cores measure the box,
 * not the code:
 *
 * ```
 *   npx vitest run --config engine/vitest.profile.config.mts --browser=firefox
 * ```
 *
 * Each `it` is one configuration at production scale (6,842 residents / 455 h)
 * unless its name says otherwise, and each gets a fresh worker.
 */

import { describe, expect, it } from "vitest";

import {
  AttributingProbe,
  ENGINE,
  ENGINE_LABEL,
  initPayload,
  startProfiledWorker,
} from "./instrument.js";
import { GATED, runConfig } from "./matrix.js";

describe(`WP10 UI-thread profile [${ENGINE_LABEL}]`, () => {
  it("A gated: slice 30, frame/tick, batch 1, snapshots/120 (the RED configuration)", async () => {
    await runConfig("A-gated", GATED);
  }, 1_800_000);

  it("B frames off: same run, no frame stream at all", async () => {
    await runConfig("B-noframes", { ...GATED, frameEveryTicks: 0 });
  }, 1_800_000);

  it("C snapshots off: max frame rate, no scrub ring", async () => {
    await runConfig("C-nosnap", { ...GATED, snapshotEveryTicks: 0 });
  }, 1_800_000);

  it("D batch 64: same bytes as A, 1/64 the messages", async () => {
    await runConfig("D-batch64", { ...GATED, frameBatchSize: 64 });
  }, 1_800_000);

  it("E decimate 64: same messages as D, 1/64 the bytes", async () => {
    await runConfig("E-decim64", { ...GATED, frameEveryTicks: 64 });
  }, 1_800_000);

  it("F 800 residents: same messages as A, 1/8.5 the bytes", async () => {
    await runConfig("F-800res", GATED, { residents: 800 });
  }, 1_800_000);

  it("G handler off: A with a no-op UI handler (no per-resident walk)", async () => {
    await runConfig("G-nowalk", GATED, { walkPayload: false });
  }, 1_800_000);

  it("H protocol defaults: slice 240, frame/60 ticks, batch 8, snapshots/60", async () => {
    await runConfig("H-defaults", {
      sliceTicks: 240,
      frameEveryTicks: 60,
      frameBatchSize: 8,
      metricBatchSize: 24,
      snapshotEveryTicks: 60,
    });
  }, 1_800_000);

  it("I payload scaling: bytes per frame vs residents", async () => {
    const rows: Record<string, unknown>[] = [];
    for (const residents of [800, 2037, 6842]) {
      const probe = new AttributingProbe();
      const w = await startProfiledWorker(probe, { walkPayload: false });
      try {
        await w.api.init(initPayload({ numAgents: residents, simulationHours: 2 }));
        await w.api.resetAudit();
        probe.start();
        await w.api.run({ ...GATED, snapshotEveryTicks: 0 });
        const stopped = probe.stop();
        const audit = await w.api.transferAudit();
        rows.push({
          residents,
          hours: 2,
          bytesPerFrameMessage: w.bytesPerFrameMessage(),
          frameMessages: stopped.frameMessages,
          totalBytes: stopped.bytes,
          buffersDetached: audit.buffersDetached,
          buffersStillLive: audit.buffersStillLive,
          transferablesOnFirstFrame: audit.transferablesOnFirstFrame,
        });
      } finally {
        w.terminate();
      }
    }
    // eslint-disable-next-line no-console -- the table IS the deliverable.
    console.log(`[wp10-profile-scaling] ${ENGINE}`, JSON.stringify(rows));
    expect(rows).toHaveLength(3);
  }, 600_000);
});
