import { describe, expect, it } from "vitest";

import {
  BADGE_STATES,
  CONSTRUCTED_SERIES_LABEL,
  PROVENANCE_CLASSES,
  SCREENS,
} from "../src/index.js";

describe("@websim/app scaffold", () => {
  it("declares the four screens", () => {
    expect([...SCREENS]).toEqual(["run", "compare", "archive", "provenance"]);
  });

  it("declares the four badge states with INVALID last", () => {
    expect(BADGE_STATES).toHaveLength(4);
    expect(BADGE_STATES.at(-1)).toBe("INVALID");
  });

  it("keeps the archived and live provenance labels distinct", () => {
    expect(PROVENANCE_CLASSES.archived).not.toBe(PROVENANCE_CLASSES.live);
  });

  it("states that constructed series are not measured data", () => {
    expect(CONSTRUCTED_SERIES_LABEL).toContain("NOT MEASURED DATA");
  });
});
