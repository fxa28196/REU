/**
 * store.test.ts — the app store's pure logic and its Zustand wiring (WP11).
 *
 * Runs in Node with no DOM: components keep their logic in the exported pure
 * functions, and the store itself is driven through `getState()` actions.
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { FrameBatch, MetricBatch, RunStatus, WaveProgressEvent } from "@websim/engine/worker";
import { maxSimulationHours } from "@websim/shared/schema";

import {
  INITIAL_PRESET_ID,
  applyParam,
  closureDrawMeaningful,
  deriveBadge,
  modifiedParams,
  presetBaselineBadge,
  presetConfig,
  useAppStore,
} from "../src/state/store.js";

// Reset the singleton store between tests. `getInitialState` includes the
// action functions, so a full replace restores a pristine store.
const pristine = useAppStore.getInitialState();
beforeEach(() => {
  useAppStore.setState(pristine, true);
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function frameMessage(tick: number): { kind: "frames"; batch: FrameBatch } {
  return {
    kind: "frames",
    batch: {
      frameCount: 1,
      residentCount: 2,
      shelterCount: 1,
      ticks: Int32Array.from([tick]),
      positions: Float32Array.from([-122.5, 45.5, -122.6, 45.6]),
      states: Uint8Array.from([0, 2]),
      occupancy: Int32Array.from([7]),
      smokeUgM3: Float64Array.from([42.0]),
    },
  };
}

function metricMessage(hour: number): { kind: "metrics"; batch: MetricBatch } {
  return {
    kind: "metrics",
    batch: {
      rowCount: 1,
      hours: Int32Array.from([hour]),
      stateCensus: Int32Array.from([1, 1, 0, 0, 0, 0]),
      occupied: Int32Array.from([7]),
      refusals: Int32Array.from([0]),
      meanExposureUgM3h: Float64Array.from([1.5]),
      meanInhaledDoseUg: Float64Array.from([0.4]),
      smokeUgM3: Float64Array.from([42.0]),
    },
  };
}

function statusMessage(phase: RunStatus["phase"], tick: number): RunStatus {
  return {
    kind: "status",
    phase,
    tick,
    endTick: 18720,
    hour: Math.floor(tick / 60),
    endHours: 312,
    runMs: 100,
    ticksPerSecond: 1000,
    keyframeTicks: [0, 60],
  };
}

function waveMessage(wave: number, tick: number): WaveProgressEvent {
  return {
    kind: "wave",
    phase: "start",
    wave,
    tick,
    hour: Math.floor(tick / 60),
    shelterCount: 36,
  };
}

// ---------------------------------------------------------------------------
// The never-regress invariant: simulationHours <= slices - 1
// ---------------------------------------------------------------------------

describe("simulationHours clamp", () => {
  it("schema maxima match the shipped smoke assets (slices 576/456/456)", () => {
    // Verified against pipeline/out/assets/smoke-{0,1,2}.json `slices` fields:
    // 576 / 456 / 456, so the max legal window is slices - 1.
    expect(maxSimulationHours(0)).toBe(575);
    expect(maxSimulationHours(1)).toBe(455);
    expect(maxSimulationHours(2)).toBe(455);
  });

  it("accepts 575 on series 0 and clamps 576 to 575", () => {
    const s = useAppStore.getState();
    expect(s.config.smokeSeriesCode).toBe(0);
    s.setParam("simulationHours", 575);
    expect(useAppStore.getState().config.simulationHours).toBe(575);
    useAppStore.getState().setParam("simulationHours", 576);
    expect(useAppStore.getState().config.simulationHours).toBe(575);
  });

  it("re-clamps hours structurally when the series switches to a shorter one", () => {
    useAppStore.getState().setParam("simulationHours", 575);
    useAppStore.getState().setParam("smokeSeriesCode", 1);
    const config = useAppStore.getState().config;
    expect(config.smokeSeriesCode).toBe(1);
    expect(config.simulationHours).toBe(455);
    // Series 2 has the same 456-slice ceiling.
    useAppStore.getState().setParam("smokeSeriesCode", 2);
    expect(useAppStore.getState().config.simulationHours).toBe(455);
  });

  it("applyParam never yields an invalid window (pure function form)", () => {
    const base = presetConfig(INITIAL_PRESET_ID);
    const at575 = applyParam(base, "simulationHours", 575);
    const switched = applyParam(at575, "smokeSeriesCode", 1);
    expect(switched.simulationHours).toBe(455);
  });
});

// ---------------------------------------------------------------------------
// Structural clamping of other parameters
// ---------------------------------------------------------------------------

describe("setParam clamping", () => {
  it("clamps numAgents to 50..6842 and rounds to an integer", () => {
    const s = useAppStore.getState();
    s.setParam("numAgents", 10);
    expect(useAppStore.getState().config.numAgents).toBe(50);
    useAppStore.getState().setParam("numAgents", 10_000);
    expect(useAppStore.getState().config.numAgents).toBe(6842);
    useAppStore.getState().setParam("numAgents", 499.6);
    expect(useAppStore.getState().config.numAgents).toBe(500);
  });

  it("rounds a flag parameter to 0 or 1", () => {
    useAppStore.getState().setParam("enableHeterogeneity", 0.7);
    expect(useAppStore.getState().config.enableHeterogeneity).toBe(1);
    useAppStore.getState().setParam("enableHeterogeneity", 0.2);
    expect(useAppStore.getState().config.enableHeterogeneity).toBe(0);
  });

  it("clamps closureDraw to 1..3; it is only meaningful at closuresCode 3", () => {
    useAppStore.getState().applyPreset("SE2_worst_plausible_E18_d1");
    expect(closureDrawMeaningful(useAppStore.getState().config)).toBe(true);
    useAppStore.getState().setParam("closureDraw", 5);
    expect(useAppStore.getState().config.closureDraw).toBe(3);
    useAppStore.getState().setParam("closureDraw", 0);
    expect(useAppStore.getState().config.closureDraw).toBe(1);
    // At any other closures code the draw selects nothing.
    useAppStore.getState().applyPreset("SE_severe_v1_E18");
    expect(useAppStore.getState().config.closuresCode).toBe(1);
    expect(closureDrawMeaningful(useAppStore.getState().config)).toBe(false);
  });

  it("ignores a non-finite value instead of storing it", () => {
    const before = useAppStore.getState().config;
    useAppStore.getState().setParam("numAgents", Number.NaN);
    expect(useAppStore.getState().config).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Presets, diffing, and the badge machine
// ---------------------------------------------------------------------------

describe("presets and modifiedFromPreset", () => {
  it("boots on the fresh-run default with an ENGINE-CERTIFIED baseline", () => {
    const s = useAppStore.getState();
    expect(s.screen).toBe("run");
    expect(s.presetId).toBe(INITIAL_PRESET_ID);
    expect(s.config).toEqual(presetConfig(INITIAL_PRESET_ID));
    expect(s.config.numAgents).toBe(2037);
    expect(s.modifiedFromPreset).toEqual([]);
    expect(s.badge).toBe("ENGINE-CERTIFIED");
    expect(s.provenance).toBeNull();
    expect(s.runPhase).toBe("idle");
  });

  it("keeps activePresetId (the sibling-component alias) in sync with presetId", () => {
    expect(useAppStore.getState().activePresetId).toBe(INITIAL_PRESET_ID);
    useAppStore.getState().applyPreset("A_present_day");
    const s = useAppStore.getState();
    expect(s.activePresetId).toBe("A_present_day");
    expect(s.activePresetId).toBe(s.presetId);
  });

  it("applyPreset writes ALL 41 params from the preset", () => {
    useAppStore.getState().setParam("numAgents", 500);
    useAppStore.getState().applyPreset("SE2_worst_plausible_E18_d1");
    const config = useAppStore.getState().config;
    expect(config).toEqual(presetConfig("SE2_worst_plausible_E18_d1"));
    expect(Object.keys(config)).toHaveLength(41);
    expect(config.smokeSeriesCode).toBe(2);
    expect(config.closuresCode).toBe(3);
    expect(config.pushThetaThreshold).toBe(-0.25);
    expect(useAppStore.getState().modifiedFromPreset).toEqual([]);
  });

  it("diffs modified params against the selected preset, in manifest order", () => {
    useAppStore.getState().applyPreset("A_present_day");
    useAppStore.getState().setParam("smokeScale", 1.2);
    useAppStore.getState().setParam("numAgents", 500);
    expect(useAppStore.getState().modifiedFromPreset).toEqual(["numAgents", "smokeScale"]);
  });

  it("pure form: modifiedParams is empty for a pristine preset config", () => {
    expect(modifiedParams("A_present_day", presetConfig("A_present_day"))).toEqual([]);
    expect(modifiedParams(null, presetConfig("A_present_day"))).toEqual([]);
  });

  it("archived presets carry an ARCHIVE-VALIDATED baseline, the default does not", () => {
    expect(presetBaselineBadge("A_present_day")).toBe("ARCHIVE-VALIDATED");
    expect(presetBaselineBadge("SE2_worst_plausible_E18_d1")).toBe("ARCHIVE-VALIDATED");
    expect(presetBaselineBadge("default_fresh_run")).toBe("ENGINE-CERTIFIED");
  });
});

describe("EXPLORATORY flip", () => {
  it("any setParam that leaves the preset config drops the badge", () => {
    useAppStore.getState().applyPreset("A_present_day");
    expect(useAppStore.getState().badge).toBe("ARCHIVE-VALIDATED");
    useAppStore.getState().setParam("numAgents", 500);
    expect(useAppStore.getState().badge).toBe("EXPLORATORY");
    expect(useAppStore.getState().modifiedFromPreset).toEqual(["numAgents"]);
  });

  it("a clamped-but-unchanged value does NOT flip the badge", () => {
    useAppStore.getState().applyPreset("A_present_day");
    // 10000 clamps to 6842 — exactly the preset's value, so nothing changed.
    useAppStore.getState().setParam("numAgents", 10_000);
    expect(useAppStore.getState().config.numAgents).toBe(6842);
    expect(useAppStore.getState().badge).toBe("ARCHIVE-VALIDATED");
  });

  it("returning to the exact preset config restores the baseline badge", () => {
    useAppStore.getState().applyPreset("A_present_day");
    useAppStore.getState().setParam("numAgents", 500);
    expect(useAppStore.getState().badge).toBe("EXPLORATORY");
    useAppStore.getState().setParam("numAgents", 6842);
    expect(useAppStore.getState().modifiedFromPreset).toEqual([]);
    expect(useAppStore.getState().badge).toBe("ARCHIVE-VALIDATED");
  });

  it("applyPreset resets an EXPLORATORY badge to the new preset's baseline", () => {
    useAppStore.getState().setParam("numAgents", 500);
    expect(useAppStore.getState().badge).toBe("EXPLORATORY");
    useAppStore.getState().applyPreset("default_fresh_run");
    expect(useAppStore.getState().badge).toBe("ENGINE-CERTIFIED");
    useAppStore.getState().applyPreset("A_present_day");
    expect(useAppStore.getState().badge).toBe("ARCHIVE-VALIDATED");
  });

  it("deriveBadge (pure form) matches the store behaviour", () => {
    const preset = presetConfig("A_present_day");
    expect(deriveBadge("A_present_day", preset)).toBe("ARCHIVE-VALIDATED");
    expect(deriveBadge("A_present_day", applyParam(preset, "numAgents", 500))).toBe("EXPLORATORY");
    expect(deriveBadge(null, preset)).toBe("EXPLORATORY");
  });
});

// ---------------------------------------------------------------------------
// applyStream — the one reducer over a synthetic stream sequence
// ---------------------------------------------------------------------------

describe("applyStream", () => {
  it("reduces a frames/metrics/status/wave sequence into run state", () => {
    const s = useAppStore.getState();
    expect(s.provenance).toBeNull();

    s.applyStream(statusMessage("building", 0));
    expect(useAppStore.getState().runPhase).toBe("building");
    // Any number off the stream is a live browser simulation.
    expect(useAppStore.getState().provenance).toBe("live");

    s.applyStream(statusMessage("running", 60));
    expect(useAppStore.getState().runPhase).toBe("running");
    expect(useAppStore.getState().status?.tick).toBe(60);

    s.applyStream(frameMessage(60));
    const frame = useAppStore.getState().latestFrame;
    expect(frame?.tick).toBe(60);
    expect(frame?.smokeUgM3).toBe(42.0);

    s.applyStream(metricMessage(1));
    s.applyStream(metricMessage(2));
    const metrics = useAppStore.getState().metrics;
    expect(metrics.hours).toEqual([1, 2]);
    expect(metrics.stateCensus).toHaveLength(6);
    expect(metrics.stateCensus[0]).toEqual([1, 1]);

    s.applyStream(waveMessage(1, 4740));
    s.applyStream(waveMessage(2, 5000));
    const waves = useAppStore.getState().waves;
    expect(waves.map((w) => w.wave)).toEqual([1, 2]);

    s.applyStream(statusMessage("finished", 18720));
    expect(useAppStore.getState().runPhase).toBe("finished");
  });

  it("a later frame batch replaces latestFrame", () => {
    const s = useAppStore.getState();
    s.applyStream(frameMessage(60));
    s.applyStream(frameMessage(120));
    expect(useAppStore.getState().latestFrame?.tick).toBe(120);
  });

  it("latestFrame aliases the applied batch's transferred buffers (zero-copy)", () => {
    const message = frameMessage(60);
    useAppStore.getState().applyStream(message);
    const frame = useAppStore.getState().latestFrame;
    expect(frame?.positions.buffer).toBe(message.batch.positions.buffer);
  });

  it("resetRun clears run state and provenance", () => {
    const s = useAppStore.getState();
    s.applyStream(statusMessage("running", 60));
    s.applyStream(frameMessage(60));
    s.applyStream(metricMessage(1));
    s.applyStream(waveMessage(1, 4740));
    useAppStore.getState().resetRun();
    const after = useAppStore.getState();
    expect(after.runPhase).toBe("idle");
    expect(after.status).toBeNull();
    expect(after.latestFrame).toBeNull();
    expect(after.metrics.hours).toEqual([]);
    expect(after.metrics.stateCensus).toEqual([]);
    expect(after.waves).toEqual([]);
    expect(after.provenance).toBeNull();
    // Config and badge survive a run reset untouched.
    expect(after.config).toEqual(presetConfig(INITIAL_PRESET_ID));
  });
});
