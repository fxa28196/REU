/**
 * Tests for the WP11 integrator's pure logic (`src/sim/useSimRun.ts`).
 *
 * No DOM, no worker: `useSimRun.ts` imports `SimWorkerClient` type-only and
 * dynamic-imports the value at boot, so this file loads cleanly in Node.
 */
import { describe, expect, it } from "vitest";

import type { EncampmentsPublic } from "@websim/shared/graph-asset";
import { STATES } from "@websim/engine/agents";
import { BuildFailFastError, ENCAMPMENTS_CSV } from "@websim/engine/world";

import { presetConfig } from "../src/state/store.js";
import { emptyMetricSeries } from "../src/state/stream.js";
import type { MetricSeries } from "../src/state/stream.js";
import type { ArchiveIndex, EncampmentDisplay } from "../src/assets/loader.js";
import { presetDefinition } from "../src/state/store.js";
import {
  archiveBundleEntryFor,
  archiveHeadline,
  badgeInputAfterRun,
  densityCellsFromDisplay,
  endTickFor,
  formatCount,
  liveHeadline,
  parseSheltersCsvMinimal,
  planRunCsvs,
  runBadgeExplanation,
  shelterInfosFrom,
  shelterViewsFrom,
  smokeSeriesCodeOf,
  splitCsvLine,
  synthesiseEncampmentsCsv,
  waveStartTicks,
} from "../src/sim/useSimRun.js";
import type { RunSummary, WaveProgressEvent } from "@websim/engine/worker";

// ---------------------------------------------------------------------------
// planRunCsvs — the engine's own resolvers drive the CSV plan
// ---------------------------------------------------------------------------

/** The staged asset manifest's data paths, as an exists-predicate. */
const STAGED_DATA_PATHS = new Set([
  "data/shelters/shelters_2020-09.csv",
  "data/shelters/shelters_2026_current_placement.csv",
  "data/shelters/shelters_2026_current_placement_elayer.csv",
  "data/shelters/shelters_2026_expanded_capacity.csv",
  "data/shelters/shelters_2026_expanded_capacity_elayer.csv",
  "data/shelters/shelters_2026_expanded_plus_new_sites.csv",
  "data/shelters/shelters_2026_expanded_plus_new_sites_elayer.csv",
  "data/closures/closures_E_r1.csv",
  "data/closures/closures_E_r1_extreme.csv",
  "data/closures/closures_E_r1_worst.csv",
  "data/closures/closures_E_r2_worst.csv",
  "data/closures/closures_E_r3_worst.csv",
]);
const stagedExists = (p: string): boolean => STAGED_DATA_PATHS.has(p);

describe("planRunCsvs", () => {
  it("arm A present-day: base shelters file, no closures, encampments constant", () => {
    const plan = planRunCsvs(presetConfig("A_present_day"), stagedExists);
    expect(plan.sheltersCsv).toBe("data/shelters/shelters_2026_current_placement.csv");
    expect(plan.closuresCsv).toBeNull();
    expect(plan.encampmentsCsv).toBe(ENCAMPMENTS_CSV);
    expect(plan.fellThrough).toBe(false);
    expect(plan.scenarioName).toBe("A_present_day_reality");
  });

  it("ER baseline-real (shelterPolicyVariant 1) rewrites to the _elayer variant", () => {
    const plan = planRunCsvs(presetConfig("ER_baseline_real_A"), stagedExists);
    expect(plan.sheltersCsv).toBe("data/shelters/shelters_2026_current_placement_elayer.csv");
  });

  it("SE2 draw 2 selects the pre-committed worst schedule file for draw 2", () => {
    const plan = planRunCsvs(presetConfig("SE2_worst_plausible_E18_d2"), stagedExists);
    expect(plan.closuresCsv).toBe("data/closures/closures_E_r2_worst.csv");
    // E18 label runs over arm A geometry, elayer'd (E_REAL_BLOCK variant 1).
    expect(plan.sheltersCsv).toBe("data/shelters/shelters_2026_current_placement_elayer.csv");
  });

  it("SE v1 (closuresCode 1) selects the base schedule", () => {
    const plan = planRunCsvs(presetConfig("SE_severe_v1_E18"), stagedExists);
    expect(plan.closuresCsv).toBe("data/closures/closures_E_r1.csv");
  });

  it("a missing _elayer variant fail-fasts (never a silent fallback)", () => {
    const config = presetConfig("ER_baseline_real_A");
    expect(() => planRunCsvs(config, () => false)).toThrow(BuildFailFastError);
  });

  it("an unregistered scenarioCode falls through to arm A and reports it", () => {
    const config = { ...presetConfig("A_present_day"), scenarioCode: 99 };
    const plan = planRunCsvs(config, stagedExists);
    expect(plan.fellThrough).toBe(true);
    expect(plan.scenarioName).toBe("A_present_day_reality");
  });
});

// ---------------------------------------------------------------------------
// synthesiseEncampmentsCsv
// ---------------------------------------------------------------------------

function fakePublic(): EncampmentsPublic {
  return {
    rowCount: 3,
    nodeCount: 2,
    nodeIndex: new Int32Array([4, 9]),
    nodeId: new Int32Array([104, 109]),
    nodeLon: new Float64Array([-122.5, -122.75]),
    nodeLat: new Float64Array([45.5, 45.625]),
    rowSlot: new Int32Array([1, 0, 1]),
    rowHashHex: ["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc"],
  };
}

describe("synthesiseEncampmentsCsv", () => {
  it("emits one line per report ROW, in row order, via the slot table", () => {
    const csv = synthesiseEncampmentsCsv(fakePublic());
    expect(csv).toBe(
      "lon,lat,inc_id\n" +
        "-122.75,45.625,aaaaaaaaaaaa\n" +
        "-122.5,45.5,bbbbbbbbbbbb\n" +
        "-122.75,45.625,cccccccccccc\n",
    );
  });

  it("round-trips coordinates exactly through Number()", () => {
    const pub = fakePublic();
    const lines = synthesiseEncampmentsCsv(pub).trimEnd().split("\n").slice(1);
    for (let r = 0; r < pub.rowCount; r++) {
      const [lon, lat] = lines[r]!.split(",");
      const slot = pub.rowSlot[r]!;
      expect(Number(lon)).toBe(pub.nodeLon[slot]!);
      expect(Number(lat)).toBe(pub.nodeLat[slot]!);
    }
  });
});

// ---------------------------------------------------------------------------
// shelters CSV display parse
// ---------------------------------------------------------------------------

const SHELTERS_SAMPLE =
  "shelter_id,name,address,city,state,zip,lon,lat,capacity,capacity_basis,opened,closed,status\n" +
  'Arbor_Lodge,Arbor Lodge Shelter,1952 N Lombard St,Portland,OR,,-122.686753,45.576626,88,x,2020-09-07,2020-09-19,operating\n' +
  'Quoted,"Center, The",addr,Portland,OR,,-122.66,45.51,40,x,,,closed\n' +
  "BadRow,No Coords,addr,Portland,OR,,,,10,x,,,operating\n" +
  "NoCap,No Capacity,addr,Portland,OR,,-122.7,45.52,,x,,,operating\n";

describe("parseSheltersCsvMinimal", () => {
  it("parses id/name/lon/lat/capacity/status by header name", () => {
    const metas = parseSheltersCsvMinimal(SHELTERS_SAMPLE);
    expect(metas).toHaveLength(3); // BadRow (blank coords) skipped
    expect(metas[0]).toEqual({
      id: "Arbor_Lodge",
      name: "Arbor Lodge Shelter",
      lon: -122.686753,
      lat: 45.576626,
      capacity: 88,
      operating: true,
    });
  });

  it("handles quoted fields containing commas", () => {
    const metas = parseSheltersCsvMinimal(SHELTERS_SAMPLE);
    expect(metas[1]!.name).toBe("Center, The");
    expect(metas[1]!.operating).toBe(false);
  });

  it("blank capacity renders as 0 (display sizing only, never a fabricated bed count)", () => {
    const metas = parseSheltersCsvMinimal(SHELTERS_SAMPLE);
    expect(metas[2]!.id).toBe("NoCap");
    expect(metas[2]!.capacity).toBe(0);
  });

  it("splitCsvLine unescapes doubled quotes", () => {
    expect(splitCsvLine('a,"b""x",c')).toEqual(["a", 'b"x', "c"]);
  });

  it("strips a leading BOM from the header line", () => {
    const bom = String.fromCharCode(0xfeff);
    const metas = parseSheltersCsvMinimal(`${bom}${SHELTERS_SAMPLE}`);
    expect(metas[0]!.id).toBe("Arbor_Lodge");
  });
});

describe("shelterViewsFrom / shelterInfosFrom", () => {
  const metas = parseSheltersCsvMinimal(SHELTERS_SAMPLE);

  it("pairs occupancy index-parallel with the CSV order", () => {
    const occ = new Int32Array([12, 40, 0]);
    const views = shelterViewsFrom(metas, occ);
    expect(views.map((v) => v.occupancy)).toEqual([12, 40, 0]);
    expect(views[0]!.openNow).toBe(true);
    expect(views[1]!.openNow).toBe(false);
  });

  it("no frame yet -> occupancy 0 (nothing admitted this session)", () => {
    const views = shelterViewsFrom(metas, null);
    expect(views.every((v) => v.occupancy === 0)).toBe(true);
  });

  it("shelterInfosFrom carries name+capacity for the occupancy panel", () => {
    expect(shelterInfosFrom(metas)[0]).toEqual({ name: "Arbor Lodge Shelter", capacity: 88 });
  });
});

// ---------------------------------------------------------------------------
// density cells from the k-anonymised display layer
// ---------------------------------------------------------------------------

describe("densityCellsFromDisplay", () => {
  const display: EncampmentDisplay = {
    schema: "reu-wildfire-shelter-abm/encampment-density/v2",
    note: "",
    grid: {
      originLon: -180,
      originLat: -90,
      stepLon: 0.002,
      stepLat: 0.001,
      minCellWidthM: 150,
      minCellHeightM: 150,
    },
    k: 5,
    maxMergeLevel: 5,
    cells: [
      { i: 10, j: 20, level: 0, count: 5 },
      { i: 3, j: 4, level: 2, count: 9 },
    ],
    published: 14,
    suppressed: 0,
    suppressedCells: 0,
    total: 14,
    minPublishedCount: 5,
    cellsBelowK: 0,
    levelCensus: {},
  };

  it("level-0 cell: SW corner = origin + index*step, span = step", () => {
    const [c0] = densityCellsFromDisplay(display);
    const x0 = -180 + 10 * 0.002;
    const y0 = -90 + 20 * 0.001;
    expect(c0!.position).toEqual([x0, y0]);
    // NE corner is SW + span, computed the same way the implementation does —
    // origin + (i+1)*span differs in the last ulp.
    expect(c0!.polygon[2]).toEqual([x0 + 0.002, y0 + 0.001]);
    expect(c0!.count).toBe(5);
  });

  it("level-L cell spans step * 2^L with level-relative indices", () => {
    const cells = densityCellsFromDisplay(display);
    const c1 = cells[1]!;
    const spanLon = 0.002 * 4;
    const spanLat = 0.001 * 4;
    const x0 = -180 + 3 * spanLon;
    const y0 = -90 + 4 * spanLat;
    expect(c1.position).toEqual([x0, y0]);
    expect(c1.polygon[2]).toEqual([x0 + spanLon, y0 + spanLat]);
  });
});

// ---------------------------------------------------------------------------
// archive bundle mapping + headline extraction
// ---------------------------------------------------------------------------

const FAKE_INDEX: ArchiveIndex = {
  schema: "reu-wildfire-shelter-abm/archive-bundle-index/v1",
  archive_root_note: "",
  archive_census: {
    run_directories_with_a_manifest: 1,
    with_agents_csv: 1,
    with_shelters_csv: 1,
    by_preset_family: { A: 1 },
  },
  bundles: [
    {
      bundle_id: "present-day-three-arm__A-seed42",
      run_dir: "present-day-three-arm/A-seed42",
      preset_family: "A",
      seed: 42,
      file: "present-day-three-arm__A-seed42.json",
      bytes: 1,
      sha256: "00",
      has_per_agent: true,
      gates_failed: [],
    },
  ],
};

describe("archiveBundleEntryFor", () => {
  it("maps a preset's archiveFamily to the bundle whose run_dir matches", () => {
    const entry = archiveBundleEntryFor(FAKE_INDEX, presetDefinition("A_present_day"));
    expect(entry?.file).toBe("present-day-three-arm__A-seed42.json");
  });

  it("fresh-run default has no archive bundle", () => {
    expect(archiveBundleEntryFor(FAKE_INDEX, presetDefinition("default_fresh_run"))).toBeNull();
  });

  it("an archived preset with no shipped bundle yields null (render unavailable)", () => {
    expect(archiveBundleEntryFor(FAKE_INDEX, presetDefinition("SE_severe_v1_E18"))).toBeNull();
  });
});

describe("archiveHeadline", () => {
  const headline = {
    n_agents: 6842,
    sheltered: 2060,
    unreachable: 28,
    refused_all_full: 4754,
    total_person_hours_above_unhealthy: 928917.85,
  };

  it("extracts the five headline numbers", () => {
    expect(archiveHeadline({ headline })).toEqual({
      nAgents: 6842,
      sheltered: 2060,
      unreachable: 28,
      refusedAllFull: 4754,
      personHoursAboveUnhealthy: 928917.85,
    });
  });

  it("returns null (never zeros) for malformed bundles", () => {
    expect(archiveHeadline(null)).toBeNull();
    expect(archiveHeadline({})).toBeNull();
    expect(archiveHeadline({ headline: { ...headline, sheltered: "2060" } })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// live readouts
// ---------------------------------------------------------------------------

describe("liveHeadline", () => {
  it("null before any metric row", () => {
    expect(liveHeadline(emptyMetricSeries())).toBeNull();
  });

  it("reads the LAST hour's per-state counts by STATES index", () => {
    const stateCensus = STATES.map(() => [0, 0]);
    stateCensus[STATES.indexOf("SHELTERED")] = [10, 2060];
    stateCensus[STATES.indexOf("UNREACHABLE")] = [0, 28];
    stateCensus[STATES.indexOf("REFUSED_ALL_FULL")] = [0, 4754];
    const metrics: MetricSeries = {
      hours: [0, 1],
      smokeUgM3: [3.4, 5.6],
      stateCensus,
      meanExposureUgM3h: [0, 1],
    };
    expect(liveHeadline(metrics)).toEqual({
      hour: 1,
      sheltered: 2060,
      unreachable: 28,
      refusedAllFull: 4754,
    });
  });
});

describe("waveStartTicks / endTickFor / formatCount", () => {
  it("collects start-phase ticks, deduplicated, in arrival order", () => {
    const wave = (phase: "start" | "done", tick: number): WaveProgressEvent => ({
      kind: "wave",
      phase,
      wave: 1,
      tick,
      hour: tick / 60,
      shelterCount: 36,
    });
    expect(waveStartTicks([wave("start", 4740), wave("done", 4740), wave("start", 4740), wave("start", 300)])).toEqual([
      4740, 300,
    ]);
  });

  it("endTickFor: simulationHours * ticksPerHour", () => {
    expect(endTickFor({ simulationHours: 312, minutesPerTick: 1 })).toBe(18720);
    expect(endTickFor({ simulationHours: 455, minutesPerTick: 1 })).toBe(27300);
  });

  it("formatCount: grouping, decimals, and an em-dash for non-finite", () => {
    expect(formatCount(6842)).toBe("6,842");
    expect(formatCount(928917.85, 2)).toBe("928,917.85");
    expect(formatCount(Number.NaN)).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// smoke code narrowing + badge wiring
// ---------------------------------------------------------------------------

describe("smokeSeriesCodeOf", () => {
  it("narrows registered codes and throws on anything else", () => {
    expect(smokeSeriesCodeOf({ smokeSeriesCode: 2 })).toBe(2);
    expect(() => smokeSeriesCodeOf({ smokeSeriesCode: 3 })).toThrow(/not a registered series/u);
  });
});

function summaryWith(outOfRangeLookups: number): RunSummary {
  return {
    tick: 18720,
    endTick: 18720,
    phase: "finished",
    runMs: 1,
    buildMs: 1,
    framesEmitted: 1,
    framesSuppressed: 0,
    metricRowsEmitted: 1,
    snapshotsTaken: 1,
    wavesFired: 0,
    armedResidents: 0,
    outOfRangeLookups,
  };
}

describe("badge wiring", () => {
  it("badgeInputAfterRun never upgrades: archive/gate evidence stays null", () => {
    const input = badgeInputAfterRun(true, summaryWith(0));
    expect(input.matchesArchive).toBeNull();
    expect(input.gateSubsetGreen).toBeNull();
    expect(input.executedDiffersFromConfigured).toBe(false);
    expect(input.outOfRangeLookups).toBe(0);
  });

  it("INVALID explanation carries the machine's out-of-range sentence with the count", () => {
    const text = runBadgeExplanation("INVALID", 0, summaryWith(3));
    expect(text).toContain("3 smoke lookup(s)");
    expect(text).toContain("cannot support any claim");
  });

  it("config-level badges claim offline verification only — never an in-browser gate run", () => {
    const archived = runBadgeExplanation("ARCHIVE-VALIDATED", 0, null);
    expect(archived).toContain("offline");
    expect(archived).toContain("No in-browser archive comparison");
    const certified = runBadgeExplanation("ENGINE-CERTIFIED", 0, null);
    expect(certified).toContain("offline");
    const exploratory = runBadgeExplanation("EXPLORATORY", 2, null);
    expect(exploratory).toContain("2 parameter(s)");
  });
});
