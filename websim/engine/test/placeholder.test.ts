import { describe, expect, it } from "vitest";

import {
  AGENT_ORDER_STRATEGIES,
  DEFAULT_AGENT_ORDER,
  ENGINE_NAME,
  maxSimulationHours,
} from "../src/index.js";

describe("@websim/engine scaffold", () => {
  it("names itself so the manifest never claims a Java version", () => {
    expect(ENGINE_NAME).toBe("websim-ts");
  });

  it("defaults to the MT-drawn shuffle order", () => {
    expect(DEFAULT_AGENT_ORDER).toBe("shuffle-mt");
    expect(AGENT_ORDER_STRATEGIES).toContain(DEFAULT_AGENT_ORDER);
  });

  it("enforces simulationHours <= slices - 1 for the shipped smoke series", () => {
    // Observed 2020: 576 slices / 575 h. Severe v1 and v2: 456 slices / 455 h.
    expect(maxSimulationHours(576)).toBe(575);
    expect(maxSimulationHours(456)).toBe(455);
    expect(() => maxSimulationHours(0)).toThrow(RangeError);
  });
});
