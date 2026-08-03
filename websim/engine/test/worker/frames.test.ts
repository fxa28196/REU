/**
 * Frame and metric streaming: shape, transferability, and — the one that
 * matters — **purity**.
 *
 * Rendering must not change the model. The specific loaded gun is
 * `SmokeField.concentrationForTick`, which increments `outOfRangeLookups` on a
 * NaN lookup. That counter is a model output: gate (i) asserts it is zero, and
 * never-regress gotcha 3 (`simulationHours <= slices - 1`) is *detected* through
 * it. An encoder that called it once per rendered frame would move a validation
 * gate by changing the frame rate — a defect that no aggregate check and no
 * "does the run complete" test would ever see.
 *
 * So the purity claim is measured twice here: once by digesting the whole
 * simulation across a batch of frames, and once on a world with a deliberate
 * NaN gap, where the counter is *known* to move for model reads. The second is
 * the sharp one: on a gapless world the first test would pass even if the
 * encoder used the wrong call.
 */

import { describe, expect, it } from "vitest";

import { digestSimulation } from "../../src/worker/digest.js";
import {
  FrameEncoder,
  MetricEncoder,
  displayConcentration,
  frameBatchTransferables,
  metricBatchTransferables,
} from "../../src/worker/frames.js";
import { STATES } from "../../src/agents/stateMachine.js";

import { buildSynthWorld } from "./world.js";

describe("frame encoding", () => {
  it("does not perturb the simulation", async () => {
    const b = buildSynthWorld();
    b.sim.runUntil(300);
    const before = await digestSimulation(b.sim, b.smoke, b.world.streams);
    const enc = new FrameEncoder(b.sim.residents.length, b.sim.shelters.length, 4);
    for (let i = 0; i < 4; i++) {
      enc.capture(b.sim, b.smoke);
    }
    enc.flush();
    expect(await digestSimulation(b.sim, b.smoke, b.world.streams), "encoding mutated the model").toBe(before);
  });

  it("leaves outOfRangeLookups alone on a world where model reads DO move it", async () => {
    // Hours 5 and 6 are NaN gaps, so a *model* lookup there increments the
    // counter. If the encoder used `concentrationForTick`, this test's counter
    // would grow by the frame count.
    const b = buildSynthWorld({ smokeGapHours: [5, 6] });
    b.sim.run();
    const modelCount = b.smoke.outOfRangeLookups;
    expect(modelCount, "the gapped world must actually move the counter").toBeGreaterThan(0);

    const enc = new FrameEncoder(b.sim.residents.length, b.sim.shelters.length, 8);
    for (let i = 0; i < 8; i++) {
      enc.capture(b.sim, b.smoke);
    }
    enc.flush();
    expect(b.smoke.outOfRangeLookups, "frame encoding incremented a model counter").toBe(modelCount);

    const metrics = new MetricEncoder(4);
    for (let i = 0; i < 4; i++) {
      metrics.capture(b.sim, b.smoke, i);
    }
    metrics.flush();
    expect(b.smoke.outOfRangeLookups, "metric encoding incremented a model counter").toBe(modelCount);
  }, 60_000);

  it("reports a gap as NaN, not as the model's fabricated zero", () => {
    const b = buildSynthWorld({ smokeGapHours: [5] });
    // Tick 300 is hour 5.
    expect(Number.isNaN(displayConcentration(b.smoke, 300, 1))).toBe(true);
    // The model's own reader returns 0 there — and counts it.
    const before = b.smoke.outOfRangeLookups;
    expect(b.smoke.concentrationForTick(300, 1)).toBe(0);
    expect(b.smoke.outOfRangeLookups).toBe(before + 1);
  });

  it("emits one batch per capacity, with correct shapes and live values", () => {
    const b = buildSynthWorld();
    b.sim.runUntil(200);
    const n = b.sim.residents.length;
    const m = b.sim.shelters.length;
    const enc = new FrameEncoder(n, m, 3);
    enc.capture(b.sim, b.smoke);
    expect(enc.full).toBe(false);
    b.sim.runUntil(260);
    enc.capture(b.sim, b.smoke);
    b.sim.runUntil(320);
    enc.capture(b.sim, b.smoke);
    expect(enc.full).toBe(true);

    const batch = enc.flush()!;
    expect(batch.frameCount).toBe(3);
    expect(batch.residentCount).toBe(n);
    expect(batch.shelterCount).toBe(m);
    expect(Array.from(batch.ticks)).toEqual([200, 260, 320]);
    expect(batch.positions.length).toBe(3 * n * 2);
    expect(batch.states.length).toBe(3 * n);
    expect(batch.occupancy.length).toBe(3 * m);
    // Occupancy is monotone in this world (nobody leaves), so frame 3 >= frame 1.
    const first = batch.occupancy.slice(0, m).reduce((a, x) => a + x, 0);
    const last = batch.occupancy.slice(2 * m).reduce((a, x) => a + x, 0);
    expect(last).toBeGreaterThanOrEqual(first);
    // Every state code must be a real state.
    for (const code of batch.states) {
      expect(code).toBeLessThan(STATES.length);
    }
    // Positions must be real coordinates, not zeros.
    expect(batch.positions[0]!).toBeLessThan(-100);
    expect(batch.positions[1]!).toBeGreaterThan(40);

    expect(enc.flush(), "a second flush with nothing pending must emit nothing").toBeNull();
  });

  it("hands over buffers that are actually transferable and not aliased", () => {
    const b = buildSynthWorld();
    b.sim.runUntil(60);
    const enc = new FrameEncoder(b.sim.residents.length, b.sim.shelters.length, 2);
    enc.capture(b.sim, b.smoke);
    const batch = enc.flush()!;
    const buffers = frameBatchTransferables(batch);
    expect(buffers.length).toBe(5);
    for (const buf of buffers) {
      expect(buf).toBeInstanceOf(ArrayBuffer);
      expect(buf.byteLength).toBeGreaterThan(0);
    }
    expect(new Set(buffers).size, "two views share a buffer; transferring one detaches the other").toBe(5);

    // The encoder must have re-armed with FRESH buffers, or the next capture
    // would write into memory that has been handed to another thread.
    enc.capture(b.sim, b.smoke);
    const second = enc.flush()!;
    for (const buf of frameBatchTransferables(second)) {
      expect(buffers.includes(buf), "the encoder reused a buffer it already emitted").toBe(false);
    }
  });

  it("metric rows carry a census that sums to the population", () => {
    const b = buildSynthWorld();
    b.sim.runUntil(400);
    const enc = new MetricEncoder(2);
    enc.capture(b.sim, b.smoke, 6);
    b.sim.runUntil(500);
    enc.capture(b.sim, b.smoke, 8);
    const batch = enc.flush()!;
    expect(batch.rowCount).toBe(2);
    expect(Array.from(batch.hours)).toEqual([6, 8]);
    for (let row = 0; row < 2; row++) {
      const slice = batch.stateCensus.slice(row * STATES.length, (row + 1) * STATES.length);
      expect(slice.reduce((a, x) => a + x, 0)).toBe(b.sim.residents.length);
    }
    expect(batch.meanExposureUgM3h[1]!).toBeGreaterThan(batch.meanExposureUgM3h[0]!);
    expect(metricBatchTransferables(batch).length).toBe(7);
    expect(new Set(metricBatchTransferables(batch)).size).toBe(7);
  });

  it("refuses to capture past capacity rather than silently overwriting", () => {
    const b = buildSynthWorld();
    const enc = new FrameEncoder(b.sim.residents.length, b.sim.shelters.length, 1);
    enc.capture(b.sim, b.smoke);
    expect(() => {
      enc.capture(b.sim, b.smoke);
    }).toThrow(/full/u);
  });
});
