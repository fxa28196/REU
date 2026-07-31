import { describe, expect, it } from "vitest";

import {
  MAX_SIMULATION_HOURS_BY_SERIES,
  NEGATIVE_CAPABLE_PARAMS,
  PARAM_COUNT,
  PARAM_META,
  PARAM_NAMES,
  RunConfigSchema,
  isParamName,
  maxSimulationHours,
  paramsInGroup,
} from "../src/schema.js";
import { PRESETS } from "../src/presets/index.js";
import type { ParamName } from "../src/schema.js";

const BASE = PRESETS.A_present_day;

describe("parameter surface", () => {
  it("declares exactly 41 parameters", () => {
    // The count is pinned so the schema cannot grow or shrink silently. If this
    // fails, a parameter was added or removed: update PARAM_COUNT, PARAM_META,
    // the preset generator and the manifest order together, deliberately.
    expect(PARAM_NAMES).toHaveLength(PARAM_COUNT);
    expect(PARAM_COUNT).toBe(41);
  });

  it("has no duplicate parameter names", () => {
    expect(new Set(PARAM_NAMES).size).toBe(PARAM_NAMES.length);
  });

  it("gives the Zod schema exactly the declared parameter keys", () => {
    expect(Object.keys(RunConfigSchema.shape).sort()).toEqual([...PARAM_NAMES].sort());
  });

  it("carries metadata for every parameter and nothing else", () => {
    expect(Object.keys(PARAM_META).sort()).toEqual([...PARAM_NAMES].sort());
  });

  it("gives every parameter a .describe() that names its registry id", () => {
    for (const name of PARAM_NAMES) {
      const description = RunConfigSchema.shape[name].description;
      expect(description, `${name} has no description`).toBeTruthy();
      const registryId = PARAM_META[name].registryId;
      if (registryId.startsWith("none")) {
        // Two parameters have no registry row (scenarioCode selects data;
        // triageReserveFraction is arm D's lever). Their metadata says so
        // explicitly rather than inventing an id.
        expect(registryId).toMatch(/^none — /u);
      } else {
        const head = registryId.split(" ")[0] ?? "";
        expect(description, `${name} description omits ${head}`).toContain(head);
      }
    }
  });

  it("keeps the slider-taxonomy group sizes PORT_MAP declares", () => {
    // PORT_MAP §2.6 = 19 decision-layer parameters (V29–V45);
    // §2.7 = 6 closure parameters (V46–V51 minus the two smoke params, which
    // plan §6.3 puts in the core group).
    expect(paramsInGroup("decision-layer")).toHaveLength(19);
    expect(paramsInGroup("closures")).toHaveLength(6);
    const grouped = (
      ["core", "demographics-movement", "shelters-policy", "decision-layer", "closures", "advanced"] as const
    ).flatMap((group) => paramsInGroup(group));
    expect(grouped).toHaveLength(PARAM_COUNT);
  });

  it("recognises parameter names and rejects near-misses", () => {
    expect(isParamName("pushThetaThreshold")).toBe(true);
    expect(isParamName("pushThetaThresh")).toBe(false);
    expect(isParamName("__proto__")).toBe(false);
  });
});

describe("range metadata", () => {
  it("keeps every certified envelope inside its hard bounds", () => {
    for (const name of PARAM_NAMES) {
      const meta = PARAM_META[name];
      expect(meta.certifiedMin, `${name} certifiedMin`).toBeGreaterThanOrEqual(meta.hardMin);
      expect(meta.certifiedMax, `${name} certifiedMax`).toBeLessThanOrEqual(meta.hardMax);
      expect(meta.certifiedMin, `${name} envelope is inverted`).toBeLessThanOrEqual(
        meta.certifiedMax,
      );
    }
  });

  it("accepts each parameter's hard bounds and rejects just outside them", () => {
    for (const name of PARAM_NAMES) {
      const meta = PARAM_META[name];
      // simulationHours is additionally constrained by the smoke series, so its
      // hard max is only reachable on series 0.
      const base = name === "simulationHours" ? { ...BASE, smokeSeriesCode: 0 as const } : BASE;

      expect(
        RunConfigSchema.safeParse({ ...base, [name]: meta.hardMin }).success,
        `${name} rejected its own hardMin ${meta.hardMin}`,
      ).toBe(true);
      expect(
        RunConfigSchema.safeParse({ ...base, [name]: meta.hardMax }).success,
        `${name} rejected its own hardMax ${meta.hardMax}`,
      ).toBe(true);

      const step = meta.kind === "double" ? 0.5 : 1;
      expect(
        RunConfigSchema.safeParse({ ...base, [name]: meta.hardMin - step }).success,
        `${name} accepted a value below hardMin`,
      ).toBe(false);
      expect(
        RunConfigSchema.safeParse({ ...base, [name]: meta.hardMax + step }).success,
        `${name} accepted a value above hardMax`,
      ).toBe(false);
    }
  });

  it("holds the batch fallbacks the Java engine uses inside the hard bounds", () => {
    // PORT_MAP §2 fallback column, cross-checked against ContextCreator's
    // intParam/doubleParam calls. A fallback outside the schema would mean the
    // browser could not express a configuration the Java engine can execute.
    for (const name of PARAM_NAMES) {
      const fallback = PARAM_META[name].batchFallback;
      if (fallback === null) {
        continue;
      }
      expect(fallback, `${name} fallback below hardMin`).toBeGreaterThanOrEqual(
        PARAM_META[name].hardMin,
      );
      expect(fallback, `${name} fallback above hardMax`).toBeLessThanOrEqual(
        PARAM_META[name].hardMax,
      );
    }
  });
});

describe("no optionals, no defaults-by-omission", () => {
  it("rejects a config missing any single parameter", () => {
    for (const name of PARAM_NAMES) {
      const stripped: Record<string, unknown> = { ...BASE };
      delete stripped[name];
      const result = RunConfigSchema.safeParse(stripped);
      expect(result.success, `config without ${name} was accepted`).toBe(false);
    }
  });

  it("rejects unknown parameters", () => {
    expect(RunConfigSchema.safeParse({ ...BASE, notAParameter: 1 }).success).toBe(false);
  });

  it("rejects non-numeric and non-finite values", () => {
    expect(RunConfigSchema.safeParse({ ...BASE, numAgents: "500" }).success).toBe(false);
    expect(RunConfigSchema.safeParse({ ...BASE, smokeScale: Number.NaN }).success).toBe(false);
    expect(RunConfigSchema.safeParse({ ...BASE, smokeScale: Number.POSITIVE_INFINITY }).success).toBe(
      false,
    );
  });

  it("rejects a non-integer value for an integer parameter", () => {
    expect(RunConfigSchema.safeParse({ ...BASE, numAgents: 500.5 }).success).toBe(false);
    expect(RunConfigSchema.safeParse({ ...BASE, simulationHours: 312.25 }).success).toBe(false);
  });

  it("rejects a value other than 0 or 1 for a switch", () => {
    expect(RunConfigSchema.safeParse({ ...BASE, enableHeterogeneity: 2 }).success).toBe(false);
    expect(RunConfigSchema.safeParse({ ...BASE, informationRegime: 0.5 }).success).toBe(false);
  });
});

describe("negative-capable parameters (the batch-zeroing defect)", () => {
  it("names the two parameters whose registered value is negative", () => {
    expect([...NEGATIVE_CAPABLE_PARAMS].sort()).toEqual(
      ["alphaHazard", "pushThetaThreshold", "randomSeed"].sort(),
    );
  });

  it("round-trips negative values unchanged", () => {
    // Repast's batch loader zeroes negative constant_type="number" values, which
    // is why archived Scenario-E runs executed pushThetaThreshold = 0.0. There
    // is no "number vs double" distinction in TypeScript, so the defect is
    // unreproducible by construction — this test pins that.
    const negatives: Partial<Record<ParamName, number>> = {
      alphaHazard: -8,
      pushThetaThreshold: -0.25,
      randomSeed: -1,
    };
    const parsed = RunConfigSchema.parse({ ...BASE, ...negatives });
    expect(parsed.alphaHazard).toBe(-8);
    expect(parsed.pushThetaThreshold).toBe(-0.25);
    expect(parsed.randomSeed).toBe(-1);
    expect(Object.is(parsed.pushThetaThreshold, 0)).toBe(false);
  });

  it("accepts the full registered sweep of pushThetaThreshold including its negative half", () => {
    for (const value of [-0.5, -0.25, 0, 0.5, 1]) {
      expect(
        RunConfigSchema.safeParse({ ...BASE, pushThetaThreshold: value }).success,
        `pushThetaThreshold ${value} rejected`,
      ).toBe(true);
    }
  });
});

describe("smoke-window cross-field rule (simulationHours ≤ slices − 1)", () => {
  it("publishes the documented per-series maxima", () => {
    expect(MAX_SIMULATION_HOURS_BY_SERIES).toEqual({ 0: 575, 1: 455, 2: 455 });
    expect(maxSimulationHours(1)).toBe(455);
  });

  it("accepts the maximum and rejects one hour past it, per series", () => {
    for (const series of [0, 1, 2] as const) {
      const limit = MAX_SIMULATION_HOURS_BY_SERIES[series];
      expect(
        RunConfigSchema.safeParse({ ...BASE, smokeSeriesCode: series, simulationHours: limit })
          .success,
        `series ${series} rejected its own maximum`,
      ).toBe(true);
      expect(
        RunConfigSchema.safeParse({ ...BASE, smokeSeriesCode: series, simulationHours: limit + 1 })
          .success,
        `series ${series} accepted slices+1 hours`,
      ).toBe(false);
    }
  });

  it("catches the 456-vs-455 case the gate was written for", () => {
    const result = RunConfigSchema.safeParse({
      ...BASE,
      smokeSeriesCode: 1,
      simulationHours: 456,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["simulationHours"]);
    }
  });
});
