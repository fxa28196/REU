/**
 * World-build unit suite — no fixtures, no graph asset, always green.
 *
 * Covers the parts of the build whose failure mode is a *plausible wrong
 * number* rather than a crash: the +1-day close offset, the `floor()` triage
 * reserve, blank capacity meaning unlimited, the tri-state pet policy, the
 * scenario chain's deliberate fallthrough, and the closure parser's three
 * distinct outcomes for a bad row.
 */

import { describe, expect, it } from "vitest";

import { parseClosureSchedule, ClosureScheduleError } from "../../src/closures/schedule.js";
import { buildRoutingGraph, type RoutingGraph } from "../../src/graph/csr.js";
import { readCsvText, type CsvRow } from "../../src/loader/csv.js";
import { Shelter } from "../../src/shelters/shelter.js";
import {
  BuildFailFastError,
  CLOSURE_WORST_DRAWS,
  SCENARIO_CHAIN,
  checkSelectorCodes,
  elayerFileName,
  resolveClosuresCsv,
  resolveScenario,
} from "../../src/world/scenario.js";
import {
  DateParseError,
  SIM_START,
  checkRunWindow,
  tickForDate,
  toEpochDay,
} from "../../src/world/time.js";

const NEVER = (): boolean => false;
const ALWAYS = (): boolean => true;

describe("tickForDate", () => {
  it("anchors hour 0 at 2020-09-07T00:00 local", () => {
    expect(SIM_START).toEqual({ year: 2020, month: 9, day: 7, hour: 0, minute: 0 });
    expect(tickForDate("2020-09-07", 60, Number.NEGATIVE_INFINITY, 0)).toBe(0);
  });

  it("adds a day for a CLOSING date so the site operates through that day", () => {
    // The archived window: OCC/CJ open windows end 2020-09-19, and the tick the
    // certified model stores is 00:00 on the 20th = hour 312 = tick 18,720.
    // Dropping the offset silently shortens every window by 24 h.
    expect(tickForDate("2020-09-19", 60, Number.POSITIVE_INFINITY, 1)).toBe(312 * 60);
    expect(tickForDate("2020-09-19", 60, Number.POSITIVE_INFINITY, 0)).toBe(288 * 60);
  });

  it("returns the caller's fallback for blank or absent dates", () => {
    expect(tickForDate(null, 60, Number.NEGATIVE_INFINITY, 0)).toBe(Number.NEGATIVE_INFINITY);
    expect(tickForDate("", 60, Number.POSITIVE_INFINITY, 1)).toBe(Number.POSITIVE_INFINITY);
    expect(tickForDate("   ", 60, Number.POSITIVE_INFINITY, 1)).toBe(Number.POSITIVE_INFINITY);
  });

  it("handles dates before the anchor, and scales with ticksPerHour", () => {
    expect(tickForDate("2020-09-06", 60, 0, 0)).toBe(-24 * 60);
    expect(tickForDate("2020-09-08", 1, 0, 0)).toBe(24);
    expect(tickForDate("2020-09-08", 120, 0, 0)).toBe(24 * 120);
  });

  it("throws where java.time throws, rather than inventing a date", () => {
    expect(() => tickForDate("2020-9-7", 60, 0, 0)).toThrow(DateParseError);
    expect(() => tickForDate("07/09/2020", 60, 0, 0)).toThrow(DateParseError);
    expect(() => tickForDate("2020-02-30", 60, 0, 0)).toThrow(DateParseError);
    expect(() => tickForDate("2020-13-01", 60, 0, 0)).toThrow(DateParseError);
    // ...but a real leap day parses.
    expect(() => tickForDate("2020-02-29", 60, 0, 0)).not.toThrow();
  });

  it("reproduces LocalDate.toEpochDay across the Gregorian rules", () => {
    expect(toEpochDay(1970, 1, 1)).toBe(0);
    expect(toEpochDay(2020, 9, 7)).toBe(18512);
    expect(toEpochDay(2000, 3, 1)).toBe(11017); // 2000 IS a leap year (÷400)
    expect(toEpochDay(1900, 3, 1)).toBe(-25508); // 1900 is NOT (÷100, not ÷400)
    expect(toEpochDay(1969, 12, 31)).toBe(-1);
  });

  it("agrees with an independent proleptic-Gregorian oracle over 200 years", () => {
    // `Date.UTC` is banned in engine source (determinism) but is a legitimate
    // INDEPENDENT oracle in a test: it implements the same proleptic Gregorian
    // calendar java.time does, by a completely different algorithm. Checking the
    // hand-transcribed `toEpochDay` against it beats checking it against five
    // constants the test author computed by hand — which is how the first draft
    // of this very test got 1900-03-01 wrong.
    let checked = 0;
    for (let year = 1890; year <= 2090; year++) {
      for (let month = 1; month <= 12; month++) {
        for (const day of [1, 15, 28]) {
          expect(toEpochDay(year, month, day), `${year}-${month}-${day}`).toBe(
            Date.UTC(year, month - 1, day) / 86_400_000,
          );
          checked++;
        }
      }
    }
    expect(checked).toBe(201 * 12 * 3);
  });
});

describe("run window (gotcha 3)", () => {
  it("caps endHours at the series length and flags the off-by-one overrun", () => {
    // 576 observed slices, 312 h: legal, with slack that hid the bug for a year.
    expect(checkRunWindow(312, 576, 1)).toEqual({
      endHours: 312,
      endTick: 18720,
      ticksPerHour: 60,
      overrunsSmokeSeries: false,
    });
    // 456 severe slices: 455 h is the largest legal window.
    expect(checkRunWindow(455, 456, 1).overrunsSmokeSeries).toBe(false);
    expect(checkRunWindow(456, 456, 1).overrunsSmokeSeries).toBe(true);
    expect(checkRunWindow(456, 456, 1).endHours).toBe(456);
    // The cap is min(), so a longer request is clipped — and still flagged.
    expect(checkRunWindow(600, 456, 1).endHours).toBe(456);
    expect(checkRunWindow(600, 456, 1).overrunsSmokeSeries).toBe(true);
  });
});

describe("scenario chain", () => {
  it("covers codes 0..20 with no gaps and no duplicates", () => {
    expect(SCENARIO_CHAIN.map((e) => e.code)).toEqual(Array.from({ length: 21 }, (_, i) => i));
    expect(new Set(SCENARIO_CHAIN.map((e) => e.scenarioName)).size).toBe(21);
  });

  it("has NO fail-fast: an unlisted code silently runs arm A", () => {
    // PORT_MAP §1.3 step 2, risk R15. This is certified behaviour, not an
    // oversight, and the asymmetry with the smoke/closure codes is deliberate.
    const r = resolveScenario(
      { scenarioCode: 99, shelterPolicyVariant: 0, smokeSeriesCode: 0 },
      NEVER,
    );
    expect(r.scenarioName).toBe("A_present_day_reality");
    expect(r.sheltersCsv).toBe("data/shelters/shelters_2026_current_placement.csv");
    expect(r.fellThrough).toBe(true);
    expect(resolveScenario({ scenarioCode: -1, shelterPolicyVariant: 0, smokeSeriesCode: 0 }, NEVER).fellThrough).toBe(true);
  });

  it("maps arm D and E20 onto arm B's file plus the reserve flag", () => {
    for (const code of [7, 20]) {
      const e = SCENARIO_CHAIN[code]!;
      expect(e.sheltersFile).toBe("shelters_2026_expanded_capacity.csv");
      expect(e.reserveDriven).toBe(true);
    }
    // Code 2 is arm C now; it meant "historical" before the redesign, and code
    // 3 is the historical reference. Trust the chain, never a stale comment.
    expect(SCENARIO_CHAIN[2]!.scenarioName).toContain("C_existing_expanded");
    expect(SCENARIO_CHAIN[3]!.sheltersFile).toBe("shelters_2020-09.csv");
  });

  it("rewrites to _elayer, and FAILS FAST when the variant is missing", () => {
    expect(elayerFileName("data/shelters/x.csv")).toBe("data/shelters/x_elayer.csv");
    const r = resolveScenario({ scenarioCode: 2, shelterPolicyVariant: 1, smokeSeriesCode: 0 }, ALWAYS);
    expect(r.sheltersCsv).toBe("data/shelters/shelters_2026_expanded_plus_new_sites_elayer.csv");
    expect(r.baseSheltersCsv).toBe("data/shelters/shelters_2026_expanded_plus_new_sites.csv");
    expect(() =>
      resolveScenario({ scenarioCode: 2, shelterPolicyVariant: 1, smokeSeriesCode: 0 }, NEVER),
    ).toThrow(BuildFailFastError);
  });

  it("flags a severe LABEL over an unsevere series", () => {
    for (const code of [18, 19, 20]) {
      expect(
        resolveScenario({ scenarioCode: code, shelterPolicyVariant: 0, smokeSeriesCode: 0 }, NEVER)
          .severeLabelWithoutSevereSeries,
      ).toBe(true);
      expect(
        resolveScenario({ scenarioCode: code, shelterPolicyVariant: 0, smokeSeriesCode: 1 }, NEVER)
          .severeLabelWithoutSevereSeries,
      ).toBe(false);
    }
  });
});

describe("selector fail-fasts", () => {
  const base = { smokeSeriesCode: 0, closuresCode: 0, closureDraw: 1 };

  it("accepts every registered combination", () => {
    for (let s = 0; s <= 2; s++) {
      for (let c = 0; c <= 3; c++) {
        for (let d = 1; d <= CLOSURE_WORST_DRAWS; d++) {
          expect(() =>
            checkSelectorCodes({ smokeSeriesCode: s, closuresCode: c, closureDraw: d }),
          ).not.toThrow();
        }
      }
    }
  });

  it("throws outside the registered ranges", () => {
    expect(() => checkSelectorCodes({ ...base, smokeSeriesCode: 3 })).toThrow(BuildFailFastError);
    expect(() => checkSelectorCodes({ ...base, smokeSeriesCode: -1 })).toThrow(BuildFailFastError);
    expect(() => checkSelectorCodes({ ...base, closuresCode: 4 })).toThrow(BuildFailFastError);
    expect(() => checkSelectorCodes({ ...base, closuresCode: 3, closureDraw: 4 })).toThrow(
      BuildFailFastError,
    );
    expect(() => checkSelectorCodes({ ...base, closuresCode: 3, closureDraw: 0 })).toThrow(
      BuildFailFastError,
    );
    // closureDraw is only range-checked when code 3 selects the worst family.
    expect(() => checkSelectorCodes({ ...base, closuresCode: 1, closureDraw: 9 })).not.toThrow();
  });

  it("selects the closure file the way ContextCreator's ternary chain does", () => {
    expect(resolveClosuresCsv(0, 1)).toBeNull();
    expect(resolveClosuresCsv(1, 1)).toBe("data/closures/closures_E_r1.csv");
    expect(resolveClosuresCsv(2, 1)).toBe("data/closures/closures_E_r1_extreme.csv");
    expect(resolveClosuresCsv(3, 2)).toBe("data/closures/closures_E_r2_worst.csv");
  });
});

describe("Shelter", () => {
  const site = (capacity: number | null): Shelter =>
    new Shelter("S", "Site", capacity, true, -122.6, 45.5);

  it("treats a null capacity as UNLIMITED, never as zero", () => {
    const s = site(null);
    for (let i = 0; i < 1000; i++) {
      expect(s.admit()).toBe(true);
    }
    expect(s.refusedCount).toBe(0);
    // A reserve on an unlimited site is meaningless and is forced to 0.
    s.setReservedForPriority(5);
    expect(s.reservedForPriority).toBe(0);
  });

  it("increments refusedCount as a SIDE EFFECT of a failed admit", () => {
    const s = site(1);
    expect(s.admit()).toBe(true);
    expect(s.admit()).toBe(false);
    expect(s.refusedCount).toBe(1);
    // hasSpaceFor is the non-mutating question; admit is the commitment.
    expect(s.hasSpaceFor(false)).toBe(false);
    expect(s.refusedCount).toBe(1);
  });

  it("gives priority arrivals the whole capacity and others the unreserved part", () => {
    const s = site(10);
    s.setReservedForPriority(3);
    for (let i = 0; i < 7; i++) {
      expect(s.admit(false)).toBe(true);
    }
    expect(s.admit(false)).toBe(false); // 7 == 10 - 3
    expect(s.admit(true)).toBe(true);
    expect(s.occupancy).toBe(8);
    expect(s.peakOccupancy).toBe(8);
    // Clamped into [0, capacity].
    s.setReservedForPriority(-4);
    expect(s.reservedForPriority).toBe(0);
    s.setReservedForPriority(999);
    expect(s.reservedForPriority).toBe(10);
  });

  it("counts a policy refusal into refusedCount AND the auditable subset", () => {
    const s = site(10);
    s.recordPolicyRefusal();
    expect(s.refusedCount).toBe(1);
    expect(s.policyRefusedCount).toBe(1);
  });

  it("is open on [openTick, closeTick), and always open at ±Infinity", () => {
    const s = site(10);
    expect(s.isOpenAt(0)).toBe(true);
    expect(s.isOpenAt(1e9)).toBe(true);
    s.setOpenWindowTicks(100, 200);
    expect(s.isOpenAt(99)).toBe(false);
    expect(s.isOpenAt(100)).toBe(true);
    expect(s.isOpenAt(199)).toBe(true);
    expect(s.isOpenAt(200)).toBe(false);
  });

  it("keeps the pet policy tri-state", () => {
    const s = site(10);
    expect(s.petIntake).toBeNull();
    s.petIntake = false;
    expect(s.petIntake).toBe(false);
    expect(s.petIntake === null).toBe(false);
  });
});

describe("closure schedule parsing", () => {
  /** A two-node, one-edge graph: node ids 10 and 20. */
  function tinyGraph(): RoutingGraph {
    return buildRoutingGraph({
      nodeCount: 2,
      edgeCount: 1,
      nodeId: Int32Array.from([10, 20]),
      nodeLon: Float64Array.from([-122.6, -122.61]),
      nodeLat: Float64Array.from([45.5, 45.51]),
      edgeFrom: Int32Array.from([0]),
      edgeTo: Int32Array.from([1]),
      edgeLengthM: Float64Array.from([100]),
      csrOffset: Int32Array.from([0, 1, 2]),
      csrEntry: Int32Array.from([1, -1]),
      csrOther: Int32Array.from([1, 0]),
    } as never);
  }

  const rows = (text: string): CsvRow[] => readCsvText(text);

  const parse = (text: string, runEndHours = 455): ReturnType<typeof parseClosureSchedule> =>
    parseClosureSchedule({
      rows: rows(text),
      csvPath: "test.csv",
      graph: tinyGraph(),
      ticksPerHour: 60,
      runEndHours,
    });

  it("groups into ascending waves, keeping FILE order inside a wave", () => {
    const s = parse(
      [
        "node_a,node_b,activation_hour,label,kind",
        "10,20,5,late,x",
        "20,10,2,early-second,x",
        "10,20,2,early-first,x",
      ].join("\n"),
    );
    expect(s.waveHours).toEqual([2, 5]);
    expect(s.waves.map((w) => w.tick)).toEqual([120, 300]);
    expect(s.waves[0]!.edges.map((e) => `${e.nodeA}-${e.nodeB}`)).toEqual(["20-10", "10-20"]);
    expect(s.scheduledEdges).toBe(3);
    expect(s.matchingGraphEdges).toBe(3);
  });

  it("counts phantom pairs without dropping them", () => {
    const s = parse(
      ["node_a,node_b,activation_hour", "10,20,1", "10,999,1", "777,888,1"].join("\n"),
    );
    expect(s.scheduledEdges).toBe(3);
    expect(s.matchingGraphEdges).toBe(1);
    expect(s.waves[0]!.edges.map((e) => e.matchesGraphEdge)).toEqual([true, false, false]);
  });

  it("throws on a malformed row, on a missing column, and on a negative hour", () => {
    expect(() => parse(["node_a,node_b,activation_hour", "ten,20,1"].join("\n"))).toThrow(
      ClosureScheduleError,
    );
    expect(() => parse(["node_a,node_b,activation_hour", "10,20,1.5"].join("\n"))).toThrow(
      ClosureScheduleError,
    );
    // A missing column: Java NPEs on `.trim()` of the null a missing key returns,
    // and the same handler turns it into an IllegalStateException.
    expect(() => parse(["node_a,node_b,hour", "10,20,1"].join("\n"))).toThrow(ClosureScheduleError);
    expect(() => parse(["node_a,node_b,activation_hour", "10,20,-1"].join("\n"))).toThrow(
      /negative activation_hour/u,
    );
  });

  it("names the 1-based CSV row in the error, header included", () => {
    expect(() =>
      parse(["node_a,node_b,activation_hour", "10,20,1", "10,20,1", "x,20,1"].join("\n")),
    ).toThrow(/row 4/u);
  });

  it("keeps an at-or-after-end wave, marks it inert, and counts the rows", () => {
    const s = parse(["node_a,node_b,activation_hour", "10,20,1", "10,20,500"].join("\n"), 455);
    expect(s.scheduledEdges).toBe(2);
    expect(s.inertRows).toBe(1);
    expect(s.waves.map((w) => w.inert)).toEqual([false, true]);
  });
});
