/**
 * param-meta.test.ts — keeps the run-controls drawer honest.
 *
 * The load-bearing test: every name `PARAM_LEVELS` lists must be a real key of
 * `BASE_CONFIG` (i.e. a real 41-parameter `RunConfig` field), and the dead
 * parameter `shelterArrivalDistanceM` must never appear as a control. Also
 * pins the smoke-series labels, the `closureDraw` enable condition, the
 * simulationHours window cap, preset grouping, and `formatTickClock`.
 *
 * Deliberately imports NO component that touches the app store — only the pure
 * modules (`paramMeta.ts`) and `Scrubber.tsx`'s pure exports.
 */

import { describe, expect, it } from "vitest";

import { BASE_CONFIG, PRESET_DEFINITIONS } from "@websim/shared/presets/definitions";
import { PARAM_META } from "@websim/shared/schema";

import {
  ALL_CONTROL_PARAMS,
  CONSTRUCTED_SMOKE_SERIES_CODES,
  LEVEL_KEYS,
  LEVEL_LABELS,
  PARAM_CONTROL_META,
  PARAM_LEVELS,
  SCENARIO_OPTIONS,
  SMOKE_SERIES_OPTIONS,
  effectiveMax,
  groupPresets,
  isConstructedSeries,
  isParamEnabled,
  presetGroupLabel,
} from "../src/controls/paramMeta.js";
import {
  PACING_FRAME_MS,
  SPEED_SETTINGS,
  estimatedRunSeconds,
  formatDuration,
  pacingFor,
  formatTickClock,
  markerLeftPercent,
  parseSpeedSetting,
  speedLabel,
} from "../src/controls/Scrubber.js";

describe("PARAM_LEVELS — the drawer's disclosure taxonomy", () => {
  it("lists only real RunConfig parameter names (every name is a BASE_CONFIG key)", () => {
    for (const level of LEVEL_KEYS) {
      for (const name of PARAM_LEVELS[level]) {
        expect(
          Object.prototype.hasOwnProperty.call(BASE_CONFIG, name),
          `${level}/${name} is not a RunConfig parameter`,
        ).toBe(true);
      }
    }
  });

  it("has exactly the five agreed level keys, each labelled", () => {
    expect([...LEVEL_KEYS].sort()).toEqual(
      ["closures", "core", "decisionLayer", "demographics", "sheltersPolicy"].sort(),
    );
    expect(Object.keys(PARAM_LEVELS).sort()).toEqual([...LEVEL_KEYS].sort());
    for (const level of LEVEL_KEYS) {
      expect(LEVEL_LABELS[level].length).toBeGreaterThan(0);
    }
  });

  it("never surfaces shelterArrivalDistanceM (dead, manifest-only)", () => {
    expect(ALL_CONTROL_PARAMS).not.toContain("shelterArrivalDistanceM");
    expect(Object.keys(PARAM_CONTROL_META)).not.toContain("shelterArrivalDistanceM");
  });

  it("also omits the pinned/convention parameters minutesPerTick and evacuationThresholdUgM3", () => {
    expect(ALL_CONTROL_PARAMS).not.toContain("minutesPerTick");
    expect(ALL_CONTROL_PARAMS).not.toContain("evacuationThresholdUgM3");
  });

  it("lists each parameter at most once across all levels (38 of 41)", () => {
    expect(new Set(ALL_CONTROL_PARAMS).size).toBe(ALL_CONTROL_PARAMS.length);
    expect(ALL_CONTROL_PARAMS.length).toBe(Object.keys(BASE_CONFIG).length - 3);
  });

  it("core is exactly the agreed six", () => {
    expect([...PARAM_LEVELS.core]).toEqual([
      "scenarioCode",
      "numAgents",
      "randomSeed",
      "simulationHours",
      "smokeSeriesCode",
      "smokeScale",
    ]);
  });
});

describe("PARAM_CONTROL_META — labels, units, steps, bounds", () => {
  it("covers every listed parameter and no others", () => {
    expect(Object.keys(PARAM_CONTROL_META).sort()).toEqual([...ALL_CONTROL_PARAMS].sort());
  });

  it("carries a label and a positive finite step for every control", () => {
    for (const name of ALL_CONTROL_PARAMS) {
      const meta = PARAM_CONTROL_META[name];
      expect(meta.label.length, `${name} label`).toBeGreaterThan(0);
      expect(Number.isFinite(meta.step) && meta.step > 0, `${name} step`).toBe(true);
      expect(meta.min).toBeLessThan(meta.max);
      if (meta.control === "select") {
        expect(meta.options !== undefined && meta.options.length > 0, `${name} options`).toBe(
          true,
        );
      }
    }
  });

  it("bounds equal the shared schema's hard bounds (no UI-side drift)", () => {
    for (const name of ALL_CONTROL_PARAMS) {
      const meta = PARAM_CONTROL_META[name];
      expect(meta.min, `${name} min`).toBe(PARAM_META[name].hardMin);
      expect(meta.max, `${name} max`).toBe(PARAM_META[name].hardMax);
    }
  });

  it("pins the contract sliders: numAgents 50–6842, smokeScale 0.25–3.0", () => {
    expect(PARAM_CONTROL_META.numAgents.min).toBe(50);
    expect(PARAM_CONTROL_META.numAgents.max).toBe(6842);
    expect(PARAM_CONTROL_META.smokeScale.min).toBe(0.25);
    expect(PARAM_CONTROL_META.smokeScale.max).toBe(3);
  });

  it("smokeSeriesCode carries the exact agreed labels, constructed ones marked", () => {
    expect([...SMOKE_SERIES_OPTIONS]).toEqual([
      { value: 0, label: "Observed 2020" },
      { value: 1, label: "Severe v1 - CONSTRUCTED" },
      { value: 2, label: "Worst-plausible v2 - CONSTRUCTED (Canberra-anchored)" },
    ]);
    expect(PARAM_CONTROL_META.smokeSeriesCode.options).toBe(SMOKE_SERIES_OPTIONS);
    for (const code of CONSTRUCTED_SMOKE_SERIES_CODES) {
      const option = SMOKE_SERIES_OPTIONS.find((o) => o.value === code);
      expect(option?.label).toContain("CONSTRUCTED");
    }
    expect(isConstructedSeries(0)).toBe(false);
    expect(isConstructedSeries(1)).toBe(true);
    expect(isConstructedSeries(2)).toBe(true);
  });

  it("scenarioCode is a dropdown of the full registry (codes 0–20, R15)", () => {
    expect(PARAM_CONTROL_META.scenarioCode.control).toBe("select");
    expect(SCENARIO_OPTIONS.length).toBe(21);
    expect(SCENARIO_OPTIONS.map((o) => o.value)).toEqual(
      Array.from({ length: 21 }, (_, i) => i),
    );
  });

  it("closureDraw is enabled only when closuresCode === 3", () => {
    expect(PARAM_CONTROL_META.closureDraw.enabledWhen).toEqual({
      param: "closuresCode",
      equals: 3,
    });
    expect(isParamEnabled("closureDraw", { ...BASE_CONFIG, closuresCode: 3 })).toBe(true);
    expect(isParamEnabled("closureDraw", { ...BASE_CONFIG, closuresCode: 1 })).toBe(false);
    expect(isParamEnabled("closureDraw", BASE_CONFIG)).toBe(false); // base closuresCode 0
  });

  it("walkingSpeedMps is enabled only when heterogeneity is off (V10)", () => {
    expect(isParamEnabled("walkingSpeedMps", { ...BASE_CONFIG, enableHeterogeneity: 0 })).toBe(
      true,
    );
    expect(isParamEnabled("walkingSpeedMps", { ...BASE_CONFIG, enableHeterogeneity: 1 })).toBe(
      false,
    );
  });

  it("caps simulationHours at the smoke series' slice count − 1 (456-vs-455 gate)", () => {
    expect(effectiveMax("simulationHours", { ...BASE_CONFIG, smokeSeriesCode: 0 })).toBe(575);
    expect(effectiveMax("simulationHours", { ...BASE_CONFIG, smokeSeriesCode: 1 })).toBe(455);
    expect(effectiveMax("simulationHours", { ...BASE_CONFIG, smokeSeriesCode: 2 })).toBe(455);
    // Unaffected parameter keeps its static max.
    expect(effectiveMax("numAgents", BASE_CONFIG)).toBe(6842);
  });
});

describe("preset grouping (PresetPicker's pure logic)", () => {
  it("groups ids by prefix: default/A/B/C, E0_, ER_, SE_, SE2_", () => {
    expect(presetGroupLabel("default_fresh_run")).toBe("Scenarios");
    expect(presetGroupLabel("A_present_day")).toBe("Scenarios");
    expect(presetGroupLabel("B_capacity_meets_demand")).toBe("Scenarios");
    expect(presetGroupLabel("C_expanded_plus_new_sites")).toBe("Scenarios");
    expect(presetGroupLabel("E0_null_A")).toBe("E0 null");
    expect(presetGroupLabel("ER_baseline_real_A")).toBe("Phase E");
    expect(presetGroupLabel("SE_severe_v1_E18")).toBe("Scenario E severe");
    expect(presetGroupLabel("SE2_worst_plausible_E18_d1")).toBe("Worst-plausible v2");
  });

  it("assigns all 13 shipped presets to the five groups in fixed order", () => {
    const groups = groupPresets(PRESET_DEFINITIONS);
    expect(groups.map((g) => g.label)).toEqual([
      "Scenarios",
      "E0 null",
      "Phase E",
      "Scenario E severe",
      "Worst-plausible v2",
    ]);
    expect(groups.map((g) => g.presets.length)).toEqual([4, 3, 2, 2, 2]);
    const total = groups.reduce((n, g) => n + g.presets.length, 0);
    expect(total).toBe(PRESET_DEFINITIONS.length);
  });
});

describe("formatTickClock — 1 tick = 1 simulated minute, days 1-based", () => {
  it("tick 0 is Day 1 00:00", () => {
    expect(formatTickClock(0)).toBe("Day 1 00:00");
  });

  it("tick 1439 is Day 1 23:59", () => {
    expect(formatTickClock(1439)).toBe("Day 1 23:59");
  });

  it("tick 1440 is Day 2 00:00", () => {
    expect(formatTickClock(1440)).toBe("Day 2 00:00");
  });

  it("handles mid-run and end-of-window ticks", () => {
    expect(formatTickClock(1441)).toBe("Day 2 00:01");
    expect(formatTickClock(90)).toBe("Day 1 01:30");
    // 455 h window end: tick 455*60 = 27300 → day 19, hour 23, minute 0.
    expect(formatTickClock(455 * 60)).toBe("Day 19 23:00");
  });

  it("clamps negatives and floors fractions (display-only tolerance)", () => {
    expect(formatTickClock(-5)).toBe("Day 1 00:00");
    expect(formatTickClock(61.9)).toBe("Day 1 01:01");
  });
});

describe("Scrubber pure helpers", () => {
  it("positions markers proportionally, clamped to the track", () => {
    expect(markerLeftPercent(0, 27300)).toBe(0);
    expect(markerLeftPercent(13650, 27300)).toBe(50);
    expect(markerLeftPercent(27300, 27300)).toBe(100);
    expect(markerLeftPercent(30000, 27300)).toBe(100);
    expect(markerLeftPercent(-10, 27300)).toBe(0);
    expect(markerLeftPercent(100, 0)).toBe(0);
  });

  it("round-trips every speed setting through its select value", () => {
    expect([...SPEED_SETTINGS]).toEqual([0.02, 0.05, 0.1, 0.2, 0.5, 1, 5, 10, 60, 600, 3600, "max"]);
    for (const setting of SPEED_SETTINGS) {
      expect(parseSpeedSetting(String(setting))).toBe(setting);
    }
    expect(parseSpeedSetting("garbage")).toBe(1);
  });

  it("offers as many settings BELOW real-time as above it", () => {
    // The user-facing requirement that produced the slow half: "as many as
    // there are to go fast, make that to go slow at those speed intervals".
    // `1` (one simulated minute per second) is the pivot.
    const paced: number[] = SPEED_SETTINGS.flatMap((s) => (typeof s === "number" ? [s] : []));
    const slower = paced.filter((s) => s < 1);
    const faster = paced.filter((s) => s > 1);
    expect(slower.length, "no slow settings").toBeGreaterThan(0);
    expect(slower.length, "asymmetric: add a slow setting for every fast one").toBe(faster.length);
    expect(paced).toEqual([...paced].sort((a, b) => a - b)); // reads like a dial
  });

  it("labels a speed in units a viewer can reason about", () => {
    // Sub-real-time rates invert: "a minute every 10 seconds" beats "0.1 min/s".
    expect(speedLabel(0.02)).toBe("1 sim-min / 50s");
    expect(speedLabel(0.05)).toBe("1 sim-min / 20s");
    expect(speedLabel(0.1)).toBe("1 sim-min / 10s");
    expect(speedLabel(0.2)).toBe("1 sim-min / 5s");
    expect(speedLabel(0.5)).toBe("1 sim-min / 2s");
    expect(speedLabel(1)).toBe("1 sim-min / s");
    expect(speedLabel(10)).toBe("10 sim-min / s");
    expect(speedLabel(60)).toBe("1 sim-h / s");
    expect(speedLabel(600)).toBe("10 sim-h / s");
    expect(speedLabel(3600)).toBe("60 sim-h / s");
    expect(speedLabel("max")).toBe("max (unpaced)");
  });

  it("paces a run without ever advancing zero ticks", () => {
    // The whole defect this replaced was that NOTHING was paced. The one thing
    // a pacing function must never do is return 0 ticks, which would spin the
    // worker forever without moving the simulation.
    for (const setting of SPEED_SETTINGS) {
      if (setting === "max") {
        continue;
      }
      const step = pacingFor(setting);
      expect(step.ticks, `speed ${setting} advanced no ticks`).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(step.ticks), `speed ${setting} advanced a fractional tick`).toBe(true);
      expect(step.waitMs, `speed ${setting} did not wait`).toBeGreaterThan(0);
    }
  });

  it("goes slower by WAITING longer, not by advancing fractional ticks", () => {
    // Below one tick per frame the only honest way to slow down is to wait.
    expect(pacingFor(0.02)).toEqual({ ticks: 1, waitMs: 50_000 });
    expect(pacingFor(0.1)).toEqual({ ticks: 1, waitMs: 10_000 });
    expect(pacingFor(0.2)).toEqual({ ticks: 1, waitMs: 5_000 });
    expect(pacingFor(0.5)).toEqual({ ticks: 1, waitMs: 2_000 });
    expect(pacingFor(1)).toEqual({ ticks: 1, waitMs: 1_000 });
    // At and above one tick per frame it batches a frame's worth instead.
    expect(pacingFor(10)).toEqual({ ticks: 1, waitMs: PACING_FRAME_MS });
    expect(pacingFor(60)).toEqual({ ticks: 6, waitMs: PACING_FRAME_MS });
    expect(pacingFor(3600)).toEqual({ ticks: 360, waitMs: PACING_FRAME_MS });
  });

  it("delivers the rate it advertises", () => {
    // ticks-per-second implied by the pacing must match the setting itself,
    // which is the only thing the label is promising the viewer.
    for (const setting of SPEED_SETTINGS) {
      if (setting === "max") {
        continue;
      }
      const { ticks, waitMs } = pacingFor(setting);
      expect((ticks * 1000) / waitMs, `speed ${setting} does not deliver its rate`).toBeCloseTo(
        setting,
        6,
      );
    }
  });

  it("tells the viewer how long a run will actually take", () => {
    // 312 h = 18,720 ticks. Picking the slowest setting on a full run is a
    // multi-day wait and the UI must say so rather than let someone discover it.
    expect(estimatedRunSeconds("max", 18_720)).toBeNull();
    expect(estimatedRunSeconds(1, 18_720)).toBe(18_720);
    expect(formatDuration(18_720)).toBe("about 5.2 h");
    expect(formatDuration(187_200)).toBe("about 2.2 days");
    expect(formatDuration(45)).toBe("about 45 s");
    expect(formatDuration(600)).toBe("about 10 min");
  });
});
