import { describe, expect, it } from "vitest";

import { LOCAL_RAW_DIR, PIPELINE_OUT_DIR, SMOKE_SERIES } from "../src/index.js";

describe("@websim/pipeline scaffold", () => {
  it("keeps generated assets and the local raw path in separate directories", () => {
    expect(PIPELINE_OUT_DIR).toBe("out");
    expect(LOCAL_RAW_DIR).toBe("local-raw");
    expect(PIPELINE_OUT_DIR).not.toBe(LOCAL_RAW_DIR);
  });

  it("declares the three launch smoke series with their slice counts", () => {
    expect(SMOKE_SERIES.map((s) => s.slices)).toEqual([576, 456, 456]);
  });

  it("marks both severe series as constructed counterfactuals", () => {
    const constructed = SMOKE_SERIES.filter((s) => s.constructed).map((s) => s.code);
    expect(constructed).toEqual([1, 2]);
  });
});
