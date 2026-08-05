/**
 * Tests for `src/compare/deltas.ts` (WP12a) — pure, Node-only, no DOM.
 *
 * The two load-bearing claims:
 *
 *  1. **The archived side matches the golden archive.** `headlineFromArchiveBundle`
 *     is pinned against the REAL shipped bundle for A-seed42
 *     (`pipeline/out/archive-bundles/present-day-three-arm__A-seed42.json`),
 *     value for value — the Compare screen's archived slot for the flagship
 *     demo IS this extraction.
 *
 *  2. **A multi-draw closure family can NEVER be presented as a single
 *     schedule** (V48/A-34, plan §6.2). For every shipped preset whose
 *     materialised config carries `closuresCode === 3`, `presentFamily`
 *     returns `kind: "range"` whatever bundle list it is given — including the
 *     preset's own real d1/d2/d3 archive bundles.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PRESET_DEFINITIONS, materialisePreset } from "@websim/shared/presets/definitions";
import { WORST_FAMILY_CLOSURES_CODE } from "@websim/shared/schema";

import { parseArchiveIndex } from "../src/assets/loader.js";
import {
  HEADLINE_METRICS,
  HEADLINE_METRIC_LABELS,
  deltaCards,
  familyDrawEntries,
  formatPercentDelta,
  formatSigned,
  headlineFromArchiveBundle,
  headlineFromSimulationJson,
  isMultiDrawFamily,
  maxAbsShelterDelta,
  parseSimulationJsonText,
  presentFamily,
  rangeAcrossDraws,
  shelterDeltas,
  sheltersFromArchiveBundle,
  sheltersFromSimulationJson,
} from "../src/compare/deltas.js";
import type { DrawHeadline, HeadlineNumbers } from "../src/compare/deltas.js";

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const BUNDLES_DIR = new URL("../../pipeline/out/archive-bundles/", import.meta.url);

function readBundle(fileName: string): unknown {
  return JSON.parse(readFileSync(new URL(fileName, BUNDLES_DIR), "utf8")) as unknown;
}

const A_SEED42 = readBundle("present-day-three-arm__A-seed42.json");

/** The shipped presets whose configs put them in the worst closure family. */
const MULTI_DRAW_PRESETS = PRESET_DEFINITIONS.filter(
  (d) => materialisePreset(d).closuresCode === WORST_FAMILY_CLOSURES_CODE,
);

const H = (n: number): HeadlineNumbers => ({
  sheltered: n,
  refused: n + 1,
  unreachable: n + 2,
  personHoursAboveUnhealthy: n + 3,
  meanWalkM: n + 4,
  totalDoseUgM3h: n + 5,
});

// ---------------------------------------------------------------------------
// headline extraction
// ---------------------------------------------------------------------------

describe("headlineFromArchiveBundle", () => {
  it("matches the golden A-seed42 archive value for value", () => {
    // Golden numbers from docs/runs/present-day-three-arm/A-seed42 via the
    // shipped bundle — the archived slot of the flagship Compare demo.
    expect(headlineFromArchiveBundle(A_SEED42)).toEqual({
      sheltered: 2060,
      refused: 4754,
      unreachable: 28,
      personHoursAboveUnhealthy: 928917.85,
      meanWalkM: 18244.41,
      totalDoseUgM3h: 258640438.5025,
    });
  });

  it("returns null — never zeros — when a field is missing or non-numeric", () => {
    expect(headlineFromArchiveBundle(null)).toBeNull();
    expect(headlineFromArchiveBundle({})).toBeNull();
    expect(headlineFromArchiveBundle({ headline: {} })).toBeNull();
    const headline = {
      sheltered: 1,
      refused_all_full: 2,
      unreachable: 3,
      total_person_hours_above_unhealthy: 4,
      travel_m: { mean: 5 },
      vwe_ugm3h: { total: 6 },
    };
    expect(headlineFromArchiveBundle({ headline })).not.toBeNull();
    expect(
      headlineFromArchiveBundle({ headline: { ...headline, travel_m: { mean: "5" } } }),
    ).toBeNull();
    expect(headlineFromArchiveBundle({ headline: { ...headline, unreachable: undefined } })).toBeNull();
  });
});

describe("headlineFromSimulationJson", () => {
  const population = {
    sheltered: 2060,
    refused_all_full: 4754,
    unreachable: 28,
    total_person_hours_above_unhealthy: 928917.85,
    travel_m: { mean: 18244.41, median: 1, max: 2 },
    vwe_ugm3h: { mean: 1, median: 2, total: 258640438.5025, gini: 0.3 },
  };

  it("reads the v2-web export's population block with the same keys", () => {
    expect(headlineFromSimulationJson({ population })).toEqual(headlineFromArchiveBundle(A_SEED42));
  });

  it("returns null on a missing block or field", () => {
    expect(headlineFromSimulationJson({})).toBeNull();
    expect(headlineFromSimulationJson({ population: { ...population, vwe_ugm3h: {} } })).toBeNull();
  });
});

describe("parseSimulationJsonText", () => {
  it("parses JSON and returns null on malformed text instead of throwing", () => {
    expect(parseSimulationJsonText('{"a":1}')).toEqual({ a: 1 });
    expect(parseSimulationJsonText("not json")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// delta cards
// ---------------------------------------------------------------------------

describe("deltaCards", () => {
  it("emits one card per metric, in HEADLINE_METRICS order, with labels", () => {
    const cards = deltaCards(H(10), H(10));
    expect(cards.map((c) => c.metric)).toEqual([...HEADLINE_METRICS]);
    for (const card of cards) {
      expect(card.label).toBe(HEADLINE_METRIC_LABELS[card.metric]);
      expect(card.delta).toBe(0);
      expect(card.percent).toBe(0);
    }
  });

  it("is sign-aware: delta and percent carry the direction of change", () => {
    const left: HeadlineNumbers = { ...H(0), sheltered: 200, refused: 50 };
    const right: HeadlineNumbers = { ...H(0), sheltered: 150, refused: 75 };
    const cards = deltaCards(left, right);
    const sheltered = cards.find((c) => c.metric === "sheltered")!;
    expect(sheltered.delta).toBe(-50);
    expect(sheltered.percent).toBeCloseTo(-25, 10);
    const refused = cards.find((c) => c.metric === "refused")!;
    expect(refused.delta).toBe(25);
    expect(refused.percent).toBeCloseTo(50, 10);
  });

  it("guards divide-by-zero: a zero baseline yields percent null, not Infinity", () => {
    const left: HeadlineNumbers = { ...H(1), unreachable: 0 };
    const right: HeadlineNumbers = { ...H(1), unreachable: 28 };
    const card = deltaCards(left, right).find((c) => c.metric === "unreachable")!;
    expect(card.delta).toBe(28);
    expect(card.percent).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// range across draws
// ---------------------------------------------------------------------------

describe("rangeAcrossDraws", () => {
  const draws: DrawHeadline[] = [
    { draw: 2, headline: { ...H(0), sheltered: 120 } },
    { draw: 1, headline: { ...H(0), sheltered: 90 } },
    { draw: 3, headline: { ...H(0), sheltered: 105 } },
  ];

  it("computes min/max over the draws and lists every draw, ascending", () => {
    const range = rangeAcrossDraws(draws, "sheltered");
    expect(range).toEqual({ metric: "sheltered", min: 90, max: 120, draws: [1, 2, 3] });
  });

  it("refuses an empty draw list", () => {
    expect(() => rangeAcrossDraws([], "sheltered")).toThrow(/no draws/u);
  });

  it("refuses a duplicated draw (one schedule counted twice fakes the spread)", () => {
    expect(() =>
      rangeAcrossDraws([draws[0]!, { draw: 2, headline: H(7) }], "sheltered"),
    ).toThrow(/more than once/u);
  });
});

// ---------------------------------------------------------------------------
// multi-draw family detection + THE refusal rule
// ---------------------------------------------------------------------------

describe("isMultiDrawFamily", () => {
  it("agrees with each preset's own materialised closuresCode", () => {
    for (const def of PRESET_DEFINITIONS) {
      expect(isMultiDrawFamily(def.id)).toBe(
        materialisePreset(def).closuresCode === WORST_FAMILY_CLOSURES_CODE,
      );
    }
  });

  it("is true for the SE2 worst-family presets and false for SE v1 (closuresCode 1)", () => {
    expect(isMultiDrawFamily("SE2_worst_plausible_E18_d1")).toBe(true);
    expect(isMultiDrawFamily("SE2_worst_plausible_E18_d2")).toBe(true);
    expect(isMultiDrawFamily("SE_severe_v1_E18")).toBe(false);
    expect(isMultiDrawFamily("A_present_day")).toBe(false);
  });

  it("throws on an unknown preset id rather than silently answering false", () => {
    expect(() => isMultiDrawFamily("no_such_preset")).toThrow(/unknown preset id/u);
  });

  it("the shipped set actually contains multi-draw presets (test is not vacuous)", () => {
    expect(MULTI_DRAW_PRESETS.length).toBeGreaterThan(0);
  });
});

describe("presentFamily — the V48/A-34 refusal rule", () => {
  it("a closuresCode-3 preset can NEVER produce kind 'single'", () => {
    const bundleLists: DrawHeadline[][] = [
      [],
      [{ draw: 1, headline: H(1) }],
      [
        { draw: 1, headline: H(1) },
        { draw: 2, headline: H(2) },
        { draw: 3, headline: H(3) },
      ],
    ];
    for (const def of MULTI_DRAW_PRESETS) {
      for (const bundles of bundleLists) {
        const presentation = presentFamily(def.id, bundles);
        expect(presentation.kind).toBe("range");
        if (presentation.kind === "range") {
          expect(presentation.drawCount).toBe(bundles.length);
          if (bundles.length > 0) {
            expect(presentation.ranges.map((r) => r.metric)).toEqual([...HEADLINE_METRICS]);
          } else {
            expect(presentation.ranges).toEqual([]);
          }
        }
      }
    }
  });

  it("a single-schedule preset presents exactly one bundle as kind 'single'", () => {
    const headline = headlineFromArchiveBundle(A_SEED42)!;
    const presentation = presentFamily("A_present_day", [{ draw: 1, headline }]);
    expect(presentation).toEqual({ kind: "single", headline });
  });

  it("a single-schedule preset refuses zero or multiple bundles", () => {
    expect(() => presentFamily("A_present_day", [])).toThrow(/exactly one/u);
    expect(() =>
      presentFamily("A_present_day", [
        { draw: 1, headline: H(1) },
        { draw: 2, headline: H(2) },
      ]),
    ).toThrow(/exactly one/u);
  });
});

// ---------------------------------------------------------------------------
// locating draw siblings in the REAL archive index + real SE2 range
// ---------------------------------------------------------------------------

describe("familyDrawEntries + the real SE2-E18 seed-42 family", () => {
  const index = parseArchiveIndex(readBundle("index.json"));
  const se2d1 = PRESET_DEFINITIONS.find((d) => d.id === "SE2_worst_plausible_E18_d1")!;

  it("finds d1/d2/d3 at the anchor seed, ascending by draw", () => {
    const entries = familyDrawEntries(index, se2d1);
    expect(entries.map((e) => e.draw)).toEqual([1, 2, 3]);
    expect(entries.map((e) => e.entry.run_dir)).toEqual([
      "scenario-e-v2/SE2-E18-d1-seed42",
      "scenario-e-v2/SE2-E18-d2-seed42",
      "scenario-e-v2/SE2-E18-d3-seed42",
    ]);
  });

  it("returns [] for presets whose run dir has no draw segment", () => {
    const armA = PRESET_DEFINITIONS.find((d) => d.id === "A_present_day")!;
    expect(familyDrawEntries(index, armA)).toEqual([]);
  });

  it("presents the real three-draw family as a range whose bounds come from the draws", () => {
    const entries = familyDrawEntries(index, se2d1);
    const bundles: DrawHeadline[] = entries.map(({ draw, entry }) => {
      const headline = headlineFromArchiveBundle(readBundle(entry.file));
      expect(headline).not.toBeNull();
      return { draw, headline: headline! };
    });
    const presentation = presentFamily(se2d1.id, bundles);
    expect(presentation.kind).toBe("range");
    if (presentation.kind === "range") {
      expect(presentation.drawCount).toBe(3);
      for (const [i, range] of presentation.ranges.entries()) {
        const metric = HEADLINE_METRICS[i]!;
        const values = bundles.map((b) => b.headline[metric]);
        expect(range.min).toBe(Math.min(...values));
        expect(range.max).toBe(Math.max(...values));
        expect(range.min).toBeLessThanOrEqual(range.max);
        expect(range.draws).toEqual([1, 2, 3]);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// per-shelter rows + deltas
// ---------------------------------------------------------------------------

describe("shelter rows and deltas", () => {
  it("reads the archived A-seed42 shelters block (36 sites, file order)", () => {
    const rows = sheltersFromArchiveBundle(A_SEED42)!;
    expect(rows).toHaveLength(36);
    expect(rows[0]).toEqual({
      id: "Arbor_Lodge_Shelter",
      name: "Arbor Lodge Shelter",
      finalOccupancy: 88,
      capacity: 88,
    });
  });

  it("reads a live v2-web export's shelters block (id doubles as the label)", () => {
    const rows = sheltersFromSimulationJson({
      shelters: [
        { id: "S1", capacity: 10, operating: true, peak_occupancy: 9, final_occupancy: 8, refused: 1 },
        { id: "S2", capacity: null, operating: true, peak_occupancy: 3, final_occupancy: 3, refused: 0 },
      ],
    })!;
    expect(rows).toEqual([
      { id: "S1", name: "S1", finalOccupancy: 8, capacity: 10 },
      { id: "S2", name: "S2", finalOccupancy: 3, capacity: null },
    ]);
  });

  it("returns null on malformed rows rather than partially fabricated lists", () => {
    expect(sheltersFromSimulationJson({ shelters: [{ id: "S1" }] })).toBeNull();
    expect(sheltersFromArchiveBundle({ shelters: "nope" })).toBeNull();
  });

  it("joins by id; unmatched sites keep their number and a null delta", () => {
    const left = [
      { id: "S1", name: "Site 1", finalOccupancy: 10, capacity: 20 },
      { id: "S2", name: "Site 2", finalOccupancy: 5, capacity: null },
    ];
    const right = [
      { id: "S1", name: "S1", finalOccupancy: 14, capacity: 20 },
      { id: "S3", name: "S3", finalOccupancy: 7, capacity: 7 },
    ];
    expect(shelterDeltas(left, right)).toEqual([
      { id: "S1", label: "Site 1", left: 10, right: 14, delta: 4 },
      { id: "S2", label: "Site 2", left: 5, right: null, delta: null },
      { id: "S3", label: "S3", left: null, right: 7, delta: null },
    ]);
  });

  it("maxAbsShelterDelta anchors the bar scale, ignoring null deltas", () => {
    expect(
      maxAbsShelterDelta([
        { id: "a", label: "a", left: 1, right: 4, delta: 3 },
        { id: "b", label: "b", left: 9, right: 2, delta: -7 },
        { id: "c", label: "c", left: 1, right: null, delta: null },
      ]),
    ).toBe(7);
    expect(maxAbsShelterDelta([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------

describe("formatting", () => {
  it("formatSigned shows the sign except on zero, and dashes non-finite", () => {
    expect(formatSigned(1234)).toBe("+1,234");
    expect(formatSigned(-12)).toBe("-12");
    expect(formatSigned(0)).toBe("0");
    expect(formatSigned(Number.NaN)).toBe("—");
  });

  it("formatPercentDelta explains a zero baseline instead of fabricating 0% or ∞%", () => {
    expect(formatPercentDelta(null)).toBe("n/a (baseline is 0)");
    expect(formatPercentDelta(-25)).toBe("-25%");
    expect(formatPercentDelta(50.04)).toBe("+50%");
    expect(formatPercentDelta(3.14159)).toBe("+3.1%");
  });
});
