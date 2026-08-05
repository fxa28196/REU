/**
 * Pure-logic tests for the Run screen's chart transforms (WP11).
 *
 * Pinned invariants:
 *  - stacking is cumulative and its order is exactly the engine's STATES order;
 *  - NaN survives `smokeStripData` bit-for-bit (missing renders as missing,
 *    never zero) and becomes `null` only at `nanToNullForGaps`;
 *  - `occupancyRows` sorts by capacity descending (stable on ties) and the
 *    fraction math never emits NaN/Infinity for a capacity-0 shelter.
 */

import { describe, expect, it } from "vitest";

import { STATES, UNHEALTHY_UGM3 } from "@websim/engine/agents";

import {
  STACKING_ORDER,
  deStackValue,
  fractionBarWidthPct,
  nanToNullForGaps,
  occupancyRows,
  rgbToCss,
  smokeStripData,
  smokeYRange,
  toStackedArea,
} from "../src/charts/transforms";

/** stateCensus[s][h] = (s+1) * 10^0 pattern with distinct per-state values. */
function censusFixture(): { hours: number[]; stateCensus: number[][] } {
  const hours = [0, 1, 2];
  // Distinct constant value per state so layer identity is checkable: state s
  // contributes (s + 1) at every hour.
  const stateCensus = STATES.map((_state, s) => hours.map(() => s + 1));
  return { hours, stateCensus };
}

describe("toStackedArea", () => {
  it("uses the engine STATES order as the stacking order", () => {
    expect(STACKING_ORDER).toBe(STATES);
    expect([...STACKING_ORDER]).toEqual([
      "PRE_EVAC",
      "EN_ROUTE",
      "SHELTERED",
      "UNREACHABLE",
      "REFUSED_ALL_FULL",
      "UNAWARE",
    ]);
  });

  it("stacks cumulatively: row k holds the prefix sum of layers 0..k-1", () => {
    const series = censusFixture();
    const data = toStackedArea(series);

    expect(data).toHaveLength(STATES.length + 1);
    expect(data[0]).toEqual(series.hours);
    expect(data[0]).not.toBe(series.hours); // defensive copy, no aliasing

    // Layer values are 1..6, so cumulative rows are 1, 3, 6, 10, 15, 21.
    const expectedCum = [1, 3, 6, 10, 15, 21];
    for (let k = 1; k <= STATES.length; k++) {
      expect(data[k]).toEqual(series.hours.map(() => expectedCum[k - 1]));
    }
  });

  it("is order-stable: each band's thickness equals its own state's census row", () => {
    const series = censusFixture();
    const data = toStackedArea(series);
    for (let s = 0; s < STATES.length; s++) {
      for (let h = 0; h < series.hours.length; h++) {
        const upper = data[s + 1]![h]!;
        const lower = s === 0 ? 0 : data[s]![h]!;
        expect(upper - lower).toBe(series.stateCensus[s]![h]!);
      }
    }
  });

  it("propagates NaN upward through the stack (missing is missing, not zero)", () => {
    const series = censusFixture();
    series.stateCensus[2]![1] = Number.NaN; // SHELTERED, hour 1

    const data = toStackedArea(series);
    // Rows below the hole stay finite at hour 1…
    expect(data[1]![1]).toBe(1);
    expect(data[2]![1]).toBe(3);
    // …the holed layer and every layer above it are NaN at hour 1…
    for (let k = 3; k <= STATES.length; k++) {
      expect(Number.isNaN(data[k]![1])).toBe(true);
    }
    // …and the other hours are untouched.
    expect(data[STATES.length]![0]).toBe(21);
    expect(data[STATES.length]![2]).toBe(21);
  });

  it("round-trips through deStackValue back to the per-state counts", () => {
    const series = censusFixture();
    const data = toStackedArea(series);
    for (let s = 0; s < STATES.length; s++) {
      for (let h = 0; h < series.hours.length; h++) {
        expect(deStackValue(data, s + 1, h)).toBe(series.stateCensus[s]![h]!);
      }
    }
  });

  it("deStackValue reports NaN over a gap instead of inventing a count", () => {
    const series = censusFixture();
    series.stateCensus[0]![1] = Number.NaN;
    const data = toStackedArea(series);
    expect(Number.isNaN(deStackValue(data, 1, 1))).toBe(true);
    expect(Number.isNaN(deStackValue(data, 2, 1))).toBe(true);
  });
});

describe("smokeStripData", () => {
  it("returns [hours, smoke] with values passed through untouched", () => {
    const series = { hours: [0, 1, 2], smokeUgM3: [12, 55.5, 80.25] };
    const [hours, smoke] = smokeStripData(series);
    expect(hours).toEqual([0, 1, 2]);
    expect(smoke).toEqual([12, 55.5, 80.25]);
  });

  it("PRESERVES NaN — never coerces missing to zero", () => {
    const series = { hours: [0, 1, 2, 3], smokeUgM3: [12, Number.NaN, 80.25, Number.NaN] };
    const [, smoke] = smokeStripData(series);
    expect(smoke[0]).toBe(12);
    expect(Number.isNaN(smoke[1])).toBe(true);
    expect(smoke[2]).toBe(80.25);
    expect(Number.isNaN(smoke[3])).toBe(true);
  });

  it("marks an hours/smoke length mismatch as NaN, not zero", () => {
    const series = { hours: [0, 1, 2], smokeUgM3: [12] };
    const [, smoke] = smokeStripData(series);
    expect(smoke[0]).toBe(12);
    expect(Number.isNaN(smoke[1])).toBe(true);
    expect(Number.isNaN(smoke[2])).toBe(true);
  });
});

describe("nanToNullForGaps (the uPlot gap boundary)", () => {
  it("maps NaN to null and leaves real values (including 0) alone", () => {
    expect(nanToNullForGaps([1, Number.NaN, 0, -2.5])).toEqual([1, null, 0, -2.5]);
  });
});

describe("smokeYRange", () => {
  it("always keeps the 55.5 reference line on screen", () => {
    const [min, max] = smokeYRange(10);
    expect(min).toBe(0);
    expect(max).toBeGreaterThan(UNHEALTHY_UGM3);
  });

  it("follows the data when it exceeds the threshold", () => {
    expect(smokeYRange(200)[1]).toBeGreaterThan(200);
  });

  it("survives an all-missing series (non-finite data max)", () => {
    for (const bad of [Number.NaN, null, undefined, Number.POSITIVE_INFINITY]) {
      const [min, max] = smokeYRange(bad);
      expect(min).toBe(0);
      expect(max).toBeGreaterThan(UNHEALTHY_UGM3);
    }
  });
});

describe("occupancyRows", () => {
  const shelters = [
    { name: "Alder", capacity: 100 },
    { name: "Burnside", capacity: 250 },
    { name: "Couch", capacity: 0 },
    { name: "Division", capacity: 100 },
  ] as const;

  it("sorts by capacity descending, stable on ties", () => {
    const rows = occupancyRows(new Int32Array([50, 250, 3, 0]), shelters);
    expect(rows.map((r) => r.name)).toEqual(["Burnside", "Alder", "Division", "Couch"]);
  });

  it("computes fractions as occupancy/capacity", () => {
    const rows = occupancyRows(new Int32Array([50, 250, 3, 0]), shelters);
    const byName = new Map(rows.map((r) => [r.name, r]));
    expect(byName.get("Burnside")!.fraction).toBe(1);
    expect(byName.get("Alder")!.fraction).toBe(0.5);
    expect(byName.get("Division")!.fraction).toBe(0);
  });

  it("guards capacity 0: fraction is 0, never NaN or Infinity", () => {
    const rows = occupancyRows(new Int32Array([50, 250, 3, 0]), shelters);
    const couch = rows.find((r) => r.name === "Couch")!;
    expect(couch.fraction).toBe(0);
    expect(Number.isFinite(couch.fraction)).toBe(true);
    expect(couch.occupancy).toBe(3); // the text still tells the truth
  });

  it("reports a missing occupancy slot as NaN, not zero", () => {
    const rows = occupancyRows(new Int32Array([50, 250]), shelters);
    const couch = rows.find((r) => r.name === "Couch")!;
    const division = rows.find((r) => r.name === "Division")!;
    expect(Number.isNaN(couch.occupancy)).toBe(true);
    expect(Number.isNaN(division.occupancy)).toBe(true);
    expect(Number.isNaN(division.fraction)).toBe(true); // capacity > 0, occ missing
  });
});

describe("fractionBarWidthPct", () => {
  it("maps fractions to clamped percentages", () => {
    expect(fractionBarWidthPct(0.5)).toBe(50);
    expect(fractionBarWidthPct(0)).toBe(0);
    expect(fractionBarWidthPct(1)).toBe(100);
    expect(fractionBarWidthPct(1.4)).toBe(100); // over-capacity clamps
    expect(fractionBarWidthPct(-0.1)).toBe(0);
  });

  it("draws no bar for non-finite fractions", () => {
    expect(fractionBarWidthPct(Number.NaN)).toBe(0);
    expect(fractionBarWidthPct(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("rgbToCss", () => {
  it("converts a deck.gl RGB tuple to a CSS rgb() string", () => {
    expect(rgbToCss([230, 159, 0])).toBe("rgb(230, 159, 0)");
    expect(rgbToCss([0, 158, 115])).toBe("rgb(0, 158, 115)");
  });
});
