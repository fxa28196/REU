/**
 * Always-green units for the severe-series surface: the registry, the
 * `simulationHours <= slices - 1` **fail-fast**, and the
 * `out_of_range_lookups == 0` gate.
 *
 * These need no archive and no asset, which is the point — the fail-fast is the
 * one guard that must hold on a clean checkout, in a browser, with nothing else
 * present. The archive-backed halves live in `severe-series.builder.test.ts`
 * (the 19-check + the three acceptance triples) and `window.archive.test.ts`
 * (the discarded 456-hour matrix that proves *why* the guard exists).
 *
 * Fixture S-numbers refer to WP8-SPEC-severe-triage-pets.md §8.1.
 */

import { describe, expect, it } from "vitest";

import { SmokeField, type SmokeSeriesAsset } from "../../src/smoke/field.js";
import {
  FABRICATED_HOURS_MESSAGE,
  FabricatedSmokeHoursError,
  RunWindowOverrunError,
  SEVERE_PEAK_GATE_SLACK,
  SEVERE_SERIES_CODES,
  SMOKE_SERIES,
  SmokeSeriesError,
  assertNoFabricatedHours,
  assertRunWindowFitsSeries,
  assertSmokeSeriesCode,
  endHoursFor,
  finalTickHourIndex,
  lookupsPerTick,
  maxSimulationHoursForSlices,
  severeSeriesPeakWithin,
  smokeFieldForRun,
  smokeSeriesSpec,
} from "../../src/smoke/series.js";

/** A synthetic asset of `n` slices, value = hour index (never NaN). */
function rampAsset(series: 0 | 1 | 2, n: number): SmokeSeriesAsset {
  return {
    schema: "test",
    series,
    slices: n,
    hourly: Array.from({ length: n }, (_, i) => i),
  };
}

/**
 * The archived `SE-E18-seed42` configuration, verbatim from
 * `docs/runs/scenario-e/SE-E18-seed42/simulation.json` — the run whose 456-hour
 * predecessor is the primary evidence for gotcha 3. Only the fields the smoke
 * surface reads are carried.
 */
const SE_E18_SEED42 = {
  randomSeed: 42,
  minutesPerTick: 1,
  smokeSeriesCode: 1,
  smokeScale: 1.0,
  simulationHours: 455,
} as const;

describe("the three registered smoke series", () => {
  it("carries the recomputed slice counts and the EXACT peak doubles", () => {
    expect(SMOKE_SERIES[0].slices).toBe(576);
    expect(SMOKE_SERIES[1].slices).toBe(456);
    expect(SMOKE_SERIES[2].slices).toBe(456);
    expect(SMOKE_SERIES[0].peakUgM3).toBe(562.7);
    expect(SMOKE_SERIES[1].peakUgM3).toBe(984.75);
    // QUIRK 7: `2496.1 === 2496.1000000000004` is FALSE. The registry must pin
    // the field double, or a correct v2 asset fails an equality test.
    expect(SMOKE_SERIES[2].peakUgM3).not.toBe(2496.1);
    expect(SMOKE_SERIES[2].peakUgM3).toBe(2496.1000000000004);
    expect(SMOKE_SERIES[2].builderPeakUgM3).toBe(2496.1);
  });

  it("derives maxSimulationHours as slices - 1: 575 / 455 / 455", () => {
    expect(SMOKE_SERIES[0].maxSimulationHours).toBe(575);
    expect(SMOKE_SERIES[1].maxSimulationHours).toBe(455);
    expect(SMOKE_SERIES[2].maxSimulationHours).toBe(455);
    for (const code of [0, 1, 2] as const) {
      expect(SMOKE_SERIES[code].maxSimulationHours).toBe(
        maxSimulationHoursForSlices(SMOKE_SERIES[code].slices),
      );
    }
  });

  it("does NOT claim the severe peak is embeddedScale x the observed peak", () => {
    // QUIRK 1/2: the builder re-rounds HALF_UP per monitor before the field
    // averages them, so these two products are both wrong and both plausible.
    expect(SMOKE_SERIES[1].embeddedScale * SMOKE_SERIES[0].peakUgM3).toBe(984.7250000000001);
    expect(SMOKE_SERIES[1].peakUgM3).not.toBe(SMOKE_SERIES[1].embeddedScale * SMOKE_SERIES[0].peakUgM3);
    expect(SMOKE_SERIES[2].peakUgM3).not.toBe(SMOKE_SERIES[2].embeddedScale * SMOKE_SERIES[0].peakUgM3);
  });

  it("marks 1 and 2 as the counterfactual series gate (j) applies to", () => {
    expect([...SEVERE_SERIES_CODES]).toEqual([1, 2]);
    expect(SMOKE_SERIES[0].counterfactual).toBe(false);
    expect(SMOKE_SERIES[1].counterfactual).toBe(true);
    expect(SMOKE_SERIES[2].counterfactual).toBe(true);
    expect(SMOKE_SERIES[0].sidecar).toBeNull();
  });

  it("throws outside [0,2], exactly as ContextCreator:326-330 does", () => {
    expect(() => assertSmokeSeriesCode(3)).toThrow(SmokeSeriesError);
    expect(() => assertSmokeSeriesCode(-1)).toThrow(/not a registered series/u);
    expect(() => assertSmokeSeriesCode(1.5)).toThrow(SmokeSeriesError);
    expect(smokeSeriesSpec(2).csv).toContain("synthetic_severe_v2.csv");
  });
});

describe("simulationHours <= slices - 1 is a FAIL-FAST, not a clamp (gotcha 3)", () => {
  it("accepts the archived 455 h window on a 456-slice series", () => {
    expect(() =>
      assertRunWindowFitsSeries({ simulationHours: 455, slices: 456, smokeSeriesCode: 1 }),
    ).not.toThrow();
  });

  it("THROWS at 456 h on a 456-slice series, with the numbers in the message", () => {
    let caught: unknown;
    try {
      assertRunWindowFitsSeries({
        simulationHours: 456,
        slices: 456,
        minutesPerTick: 1,
        smokeSeriesCode: 1,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(RunWindowOverrunError);
    const err = caught as RunWindowOverrunError;
    expect(err.simulationHours).toBe(456);
    expect(err.slices).toBe(456);
    expect(err.maxSimulationHours).toBe(455);
    // The message must name the limit, the failing hour index and the final
    // tick — a bare "invalid config" would send the reader back to the spec.
    expect(err.message).toContain("simulationHours=456");
    expect(err.message).toContain("maximum 455");
    expect(err.message).toContain("0..455");
    expect(err.message).toContain("27360");
    expect(err.message).toContain("hour index 456");
    expect(err.message).toContain("FABRICATED");
    expect(err.message).toContain("out_of_range_lookups");
    expect(err.message).toContain("declared port divergence");
  });

  it("throws for a SEEDED SE-E18-seed42 config pushed one hour past the series", () => {
    const asset = rampAsset(1, 456);
    // 455 h — the configuration the archive actually ran — builds fine.
    const ok = smokeFieldForRun(asset, SE_E18_SEED42);
    expect(ok.hours()).toBe(456);

    const overrun = { ...SE_E18_SEED42, simulationHours: 456 };
    expect(() => smokeFieldForRun(asset, overrun)).toThrow(RunWindowOverrunError);
    expect(() => smokeFieldForRun(asset, overrun)).toThrow(/simulationHours <= slices - 1/u);
  });

  it("throws for every simulationHours past the limit, on all three series", () => {
    for (const code of [0, 1, 2] as const) {
      const spec = SMOKE_SERIES[code];
      expect(() =>
        assertRunWindowFitsSeries({
          simulationHours: spec.maxSimulationHours,
          slices: spec.slices,
          smokeSeriesCode: code,
        }),
      ).not.toThrow();
      for (const over of [1, 2, 100]) {
        expect(() =>
          assertRunWindowFitsSeries({
            simulationHours: spec.maxSimulationHours + over,
            slices: spec.slices,
            smokeSeriesCode: code,
          }),
        ).toThrow(RunWindowOverrunError);
      }
    }
  });

  it("does not silently clamp: Math.min(456, 456) is still 456, and 456 is the failure", () => {
    // This is the whole shape of the Java defect. endHours is the CLAMPED value
    // and it is precisely the out-of-range hour index, which is why a clamp can
    // never be a guard.
    expect(endHoursFor(456, 456)).toBe(456);
    expect(finalTickHourIndex(456, 456, 1)).toBe(456);
    expect(finalTickHourIndex(455, 456, 1)).toBe(455);
    // ... and at 6 minutes per tick the composition still lands on endHours.
    expect(finalTickHourIndex(456, 456, 6)).toBe(456);
    expect(finalTickHourIndex(455, 456, 0.5)).toBe(455);
  });

  it("rejects a nonsensical slice count rather than dividing by it", () => {
    expect(() => assertRunWindowFitsSeries({ simulationHours: 1, slices: 0 })).toThrow(RangeError);
    expect(() => maxSimulationHoursForSlices(1.5)).toThrow(RangeError);
  });

  it("refuses an asset whose series disagrees with the selector", () => {
    expect(() =>
      smokeFieldForRun(rampAsset(2, 456), { ...SE_E18_SEED42, smokeSeriesCode: 1 }),
    ).toThrow(SmokeSeriesError);
  });
});

describe("out_of_range_lookups — gate (j.4)", () => {
  it("S8/S9: tick 27300 reads hour 455 cleanly; tick 27360 fabricates and counts", () => {
    const field = new SmokeField(Array.from({ length: 456 }, (_, i) => i + 1));
    expect(field.concentrationForTick(27300, 1)).toBe(456); // hour 455, value 456
    expect(field.outOfRangeLookups).toBe(0);
    expect(field.concentrationForTick(27360, 1)).toBe(0);
    expect(field.outOfRangeLookups).toBe(1);
  });

  it("passes at zero and throws with the required INVALID copy above it", () => {
    const clean = new SmokeField([1, 2, 3]);
    expect(() => assertNoFabricatedHours(clean)).not.toThrow();
    clean.setOutOfRangeLookups(11170);
    let caught: unknown;
    try {
      assertNoFabricatedHours(clean, "SE-E18-seed42");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(FabricatedSmokeHoursError);
    expect((caught as FabricatedSmokeHoursError).outOfRangeLookups).toBe(11170);
    expect((caught as Error).message).toContain(FABRICATED_HOURS_MESSAGE);
    expect((caught as Error).message).toContain("SE-E18-seed42");
  });

  it("counts a GAP and an out-of-window index through the same branch (QUIRK 4)", () => {
    const withGap = new SmokeField([1, null, 3]);
    expect(withGap.concentrationForTick(60, 1)).toBe(0); // hour 1: interior gap
    expect(withGap.concentrationForTick(1800, 1)).toBe(0); // hour 30: past the end
    expect(withGap.outOfRangeLookups).toBe(2);
    // The counter cannot distinguish them, and neither may the gate.
    expect(() => assertNoFabricatedHours(withGap)).toThrow(FabricatedSmokeHoursError);
  });

  it("reproduces the per-tick double-lookup identity from the discarded matrix", () => {
    // SE-E18-seed42 at 456 h: (6842 - 1252) + (1166 + 4414) = 11170.
    expect(lookupsPerTick({ n: 6842, sheltered: 1252, preEvac: 1166, unaware: 4414 })).toBe(11170);
    expect(lookupsPerTick({ n: 6842, sheltered: 1223, preEvac: 1222, unaware: 4389 })).toBe(11230);
    expect(lookupsPerTick({ n: 6842, sheltered: 1257, preEvac: 1166, unaware: 4414 })).toBe(11165);
  });
});

describe("field arithmetic the severe series depends on", () => {
  it("S10: an all-NaN field peaks at 0, not -Infinity", () => {
    expect(new SmokeField([null, null, null]).peakHourly()).toBe(0);
    // ... and so does an all-negative one, for the same `mx = 0` reason.
    expect(new SmokeField([-5, -1]).peakHourly()).toBe(0);
  });

  it("S11: smokeScale 1.0 is the bit-exact identity, and a gap stays a gap", () => {
    const hourly = [5.5, 562.7, null, 2496.1000000000004, 0.1];
    const scaled = new SmokeField(hourly, 1.0);
    for (let h = 0; h < hourly.length; h++) {
      const want = hourly[h];
      if (want === null) {
        expect(Number.isNaN(scaled.hourlyUgM3[h]!)).toBe(true);
      } else {
        expect(scaled.hourlyUgM3[h]).toBe(want);
      }
    }
  });

  it("applies smokeScale once, to real values only", () => {
    const f = new SmokeField([10, null, 20], 1.5);
    expect(f.hourlyUgM3[0]).toBe(15);
    expect(Number.isNaN(f.hourlyUgM3[1]!)).toBe(true);
    expect(f.hourlyUgM3[2]).toBe(30);
    expect(f.peakHourly()).toBe(30);
  });

  it("gate (j.3) tolerates the manifest's %.1f rendering and nothing wider", () => {
    // The manifest carries 984.8; the gate compares against the builder's 984.75.
    expect(severeSeriesPeakWithin(984.8, 984.75)).toBe(true);
    expect(severeSeriesPeakWithin(2496.1, 2496.1)).toBe(true);
    expect(severeSeriesPeakWithin(562.7, 562.7)).toBe(true);
    expect(severeSeriesPeakWithin(984.75 + SEVERE_PEAK_GATE_SLACK, 984.75)).toBe(true);
    expect(severeSeriesPeakWithin(984.9, 984.75)).toBe(false);
    // smokeScale multiplies the expectation, not the slack.
    expect(severeSeriesPeakWithin(1969.5, 984.75, 2.0)).toBe(true);
    expect(severeSeriesPeakWithin(984.8, 984.75, 2.0)).toBe(false);
  });
});
