import { describe, expect, it } from "vitest";

import {
  BADGE_STATES,
  CONSTRUCTED_SERIES_LABEL,
  DATA_ATTRIBUTION,
  DATA_ATTRIBUTION_LINE,
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

/**
 * The footer credit is a promise to two data providers, and its *strength* is
 * the thing this project has historically got wrong. These assertions pin both
 * halves: the credit must name each provider, and it must not grow into a claim
 * that a written determination exists.
 */
describe("@websim/app data attribution", () => {
  it("credits both providers by name, with RLIS attributed to Oregon Metro", () => {
    expect(DATA_ATTRIBUTION).toHaveLength(2);
    expect(DATA_ATTRIBUTION_LINE).toContain(
      "Regional Land Information System (RLIS), Oregon Metro",
    );
    expect(DATA_ATTRIBUTION_LINE).toContain("City of Portland");
    expect(DATA_ATTRIBUTION_LINE).toContain("Impact Reduction Program");
  });

  it("attributes the approval to the researcher's report, with its relay date", () => {
    expect(DATA_ATTRIBUTION_LINE).toContain("as reported by the researcher");
    expect(DATA_ATTRIBUTION_LINE).toContain("2026-08-02");
    expect(DATA_ATTRIBUTION_LINE).toContain("no written determination is on file");
    for (const entry of DATA_ATTRIBUTION) {
      expect(entry.note).toContain("reported by the researcher");
      expect(entry.note).toContain("2026-08-02");
      expect(entry.note).toContain("no written determination is on file");
    }
  });

  it("never misattributes RLIS to the City of Portland", () => {
    const rlis = DATA_ATTRIBUTION[0]!;
    expect(rlis.credit).toContain("Oregon Metro");
    expect(rlis.credit).not.toContain("City of Portland");
  });

  it("claims no licence identifier, reference number or paperwork", () => {
    // Each pattern is a way the record could be silently strengthened past its
    // evidence. None of them is true: no licence text or determination was seen.
    const overclaims = [
      /licen[cs]ed under/i,
      /permission (?:number|reference)/i,
      /reference (?:number|no\.)/i,
      /determination letter/i,
      /written (?:determination|approval) (?:from|is available|on file)/i,
      /\bCC[ -]?BY\b/i,
      /\bODbL\b/i,
      /\bpublic domain\b/i,
      /has granted/i,
      /https?:\/\//i,
    ];
    const surfaces = [
      DATA_ATTRIBUTION_LINE,
      ...DATA_ATTRIBUTION.flatMap((e) => [e.layer, e.credit, e.note]),
    ];
    for (const surface of surfaces) {
      for (const pattern of overclaims) {
        expect(surface).not.toMatch(pattern);
      }
    }
  });
});
