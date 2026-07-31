import { describe, expect, it } from "vitest";

import {
  applyRunConfigPatch,
  configsEqual,
  describeDiff,
  diffRunConfigs,
  diffToPatch,
  orderRunConfig,
  parseRunConfig,
  safeParseRunConfig,
  safeParseRunConfigPatch,
} from "../src/config.js";
import { PRESETS } from "../src/presets/index.js";
import { PARAM_NAMES } from "../src/schema.js";

const A = PRESETS.A_present_day;
const B = PRESETS.B_capacity_meets_demand;

describe("parsing", () => {
  it("returns a validated config on success", () => {
    const result = safeParseRunConfig(A);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.scenarioCode).toBe(0);
    }
  });

  it("attributes each issue to its parameter", () => {
    const result = safeParseRunConfig({ ...A, numAgents: 7 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.param)).toContain("numAgents");
    }
  });

  it("throws with the offending parameter named", () => {
    expect(() => parseRunConfig({ ...A, smokeSeriesCode: 9 }, "test config")).toThrow(
      /smokeSeriesCode/u,
    );
  });

  it("accepts a sparse patch and rejects an unknown key in it", () => {
    expect(safeParseRunConfigPatch({ numAgents: 500 }).ok).toBe(true);
    expect(safeParseRunConfigPatch({}).ok).toBe(true);
    expect(safeParseRunConfigPatch({ nope: 1 }).ok).toBe(false);
    expect(safeParseRunConfigPatch({ numAgents: 1 }).ok).toBe(false);
  });
});

describe("diffing", () => {
  it("reports nothing for identical configs", () => {
    expect(diffRunConfigs(A, { ...A })).toEqual([]);
    expect(configsEqual(A, { ...A })).toBe(true);
    expect(describeDiff([])).toBe("unmodified");
  });

  it("reports exactly the parameters that differ", () => {
    const deltas = diffRunConfigs(A, B);
    expect(deltas).toEqual([{ param: "scenarioCode", base: 0, other: 1 }]);
    expect(configsEqual(A, B)).toBe(false);
    expect(describeDiff(deltas)).toBe("scenarioCode 0 → 1");
  });

  it("reports differences in manifest order, not insertion order", () => {
    const other = { ...A, closureDraw: 2, numAgents: 500 };
    expect(diffRunConfigs(A, other).map((d) => d.param)).toEqual(["numAgents", "closureDraw"]);
  });

  it("treats -0 and +0 as different", () => {
    // The formatters render them differently and a silent sign-of-zero change is
    // exactly the drift this diff exists to catch.
    const negZero = { ...A, gammaVuln: -0 };
    expect(diffRunConfigs(A, negZero)).toEqual([{ param: "gammaVuln", base: 0, other: -0 }]);
  });

  it("round-trips a diff through a patch", () => {
    const patch = diffToPatch(A, B);
    expect(patch).toEqual({ scenarioCode: 1 });
    const applied = applyRunConfigPatch(A, patch);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(configsEqual(applied.config, B)).toBe(true);
    }
  });

  it("re-validates when a patch is applied", () => {
    // A patch that is individually legal can still produce an illegal config —
    // here a 455-hour window against the 575-hour observed series is fine, but
    // 576 is not.
    const bad = applyRunConfigPatch(A, { simulationHours: 576 });
    expect(bad.ok).toBe(false);
  });

  it("catches a cross-field violation introduced by a patch", () => {
    const seSeries = applyRunConfigPatch(A, { simulationHours: 500, smokeSeriesCode: 1 });
    expect(seSeries.ok).toBe(false);
    if (!seSeries.ok) {
      expect(seSeries.issues.map((i) => i.param)).toContain("simulationHours");
    }
  });
});

describe("ordering", () => {
  it("puts keys in the manifest's fixed order", () => {
    const shuffled = Object.fromEntries([...Object.entries(A)].reverse()) as typeof A;
    expect(Object.keys(orderRunConfig(shuffled))).toEqual([...PARAM_NAMES]);
  });

  it("does not change any value", () => {
    expect(orderRunConfig(A)).toEqual(A);
  });
});
