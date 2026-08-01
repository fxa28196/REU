/**
 * The two Scenario-E worlds the WP8 closure oracle covers, loaded from the
 * read-only `Geography/` tree exactly as `ContextCreator.build()` steps 8 and 9
 * load them.
 *
 * Deliberately **not** `buildWorld()`: the wave oracle needs shelters, their
 * snapped nodes and a parsed schedule, and nothing else. Going through the full
 * build would drag in the population samplers, the encampment feed and three RNG
 * streams, none of which `ClosureWave.apply()` reads (spec §14.1), and would put
 * a resident-placement change on the failure path of a routing comparison.
 *
 * What IS reproduced here, because it is observable:
 *
 *  - **Shelter-CSV file order**, with every row appended unconditionally —
 *    `operating == false` sites get a tree too (QUIRK 33). Arms A/B/D have 36
 *    rows; arm C has 46.
 *  - **The certified snap**, via `DegreeSpaceNodeIndex` (WP5's port of
 *    `nearestNode`). `trees.tsv` carries the source node id per shelter, so a
 *    snap disagreement fails as a source mismatch before any distance is read.
 *  - **The CSV's own row numbering**, header = row 1, so `edges.tsv`'s
 *    `csv_row` column can be re-derived rather than copied.
 */

import { readFileSync } from "node:fs";

import type { RoutingGraph } from "../../src/graph/csr.js";
import { DegreeSpaceNodeIndex } from "../../src/graph/strtreeSnap.js";
import { decodeCsvBytes, javaParseDouble, readCsvText } from "../../src/loader/csv.js";
import { parseClosureSchedule, type ClosureSchedule } from "../../src/closures/schedule.js";
import { Shelter } from "../../src/shelters/shelter.js";
import { GEOGRAPHY_DIR } from "./helpers.js";

/** Both SE families pin `minutesPerTick = 1.0` and `simulationHours = 455`. */
export const TICKS_PER_HOUR = 60;
export const END_HOURS = 455;

export const SHELTERS_A_CSV = "data/shelters/shelters_2026_current_placement.csv";
/** `build_closures_E.py:180` validates every schedule against arm C's 46 sites. */
export const SHELTERS_C_CSV = "data/shelters/shelters_2026_expanded_plus_new_sites.csv";
export const ENCAMPMENTS_CSV = "data/encampments/irp_campsite_reports_sample.csv";

/** The two configs the wave dump covers, named as the dumper names them. */
export const CONFIGS = [
  {
    name: "SE-E18",
    closuresCsv: "data/closures/closures_E_r1.csv",
    sheltersCsv: SHELTERS_A_CSV,
    /** Including state 0, the pre-closure world. */
    waveStates: 2,
  },
  {
    name: "SE2-E18-d1",
    closuresCsv: "data/closures/closures_E_r1_worst.csv",
    sheltersCsv: SHELTERS_A_CSV,
    waveStates: 7,
  },
] as const;

/** The five committed schedules, with their archived connectivity reports. */
export const SCHEDULES = [
  { name: "closures_E_r1", csv: "data/closures/closures_E_r1.csv", report: "closures_E_r1_report.json" },
  {
    name: "closures_E_r1_extreme",
    csv: "data/closures/closures_E_r1_extreme.csv",
    report: "closures_E_r1_extreme_report.json",
  },
  {
    name: "closures_E_r1_worst",
    csv: "data/closures/closures_E_r1_worst.csv",
    report: "closures_E_r1_worst_report.json",
  },
  {
    name: "closures_E_r2_worst",
    csv: "data/closures/closures_E_r2_worst.csv",
    report: "closures_E_r2_worst_report.json",
  },
  {
    name: "closures_E_r3_worst",
    csv: "data/closures/closures_E_r3_worst.csv",
    report: "closures_E_r3_worst_report.json",
  },
] as const;

const snapCache = new WeakMap<RoutingGraph, DegreeSpaceNodeIndex>();

export function snapIndexFor(graph: RoutingGraph): DegreeSpaceNodeIndex {
  let idx = snapCache.get(graph);
  if (idx === undefined) {
    idx = new DegreeSpaceNodeIndex(graph);
    snapCache.set(graph, idx);
  }
  return idx;
}

/** Shelters in CSV file order, snapped, trees NOT yet computed. */
export function loadShelters(graph: RoutingGraph, sheltersCsv: string): Shelter[] {
  const snap = snapIndexFor(graph);
  const rows = readCsvText(decodeCsvBytes(readFileSync(`${GEOGRAPHY_DIR}/${sheltersCsv}`)));
  const shelters: Shelter[] = [];
  for (const r of rows) {
    const lon = javaParseDouble(r.get("lon") ?? "");
    const lat = javaParseDouble(r.get("lat") ?? "");
    const s = new Shelter(
      r.get("shelter_id") ?? "",
      r.get("name") ?? "",
      null,
      (r.get("status") ?? "").toLowerCase() === "operating",
      lon,
      lat,
    );
    const hit = snap.nearest(lon, lat);
    s.graphNode = hit.node;
    s.graphNodeId = graph.nodeId[hit.node]!;
    shelters.push(s);
  }
  return shelters;
}

export function loadSchedule(graph: RoutingGraph, closuresCsv: string): ClosureSchedule {
  return parseClosureSchedule({
    rows: readCsvText(decodeCsvBytes(readFileSync(`${GEOGRAPHY_DIR}/${closuresCsv}`))),
    csvPath: closuresCsv,
    graph,
    ticksPerHour: TICKS_PER_HOUR,
    runEndHours: END_HOURS,
  });
}

export interface ClosureCsvRow {
  /** 1-based line number in the file; the header is row 1. */
  readonly rowNo: number;
  readonly nodeA: number;
  readonly nodeB: number;
  readonly hour: number;
  readonly label: string;
  readonly kind: string;
}

/** The schedule CSV in file order, with the row numbering `edges.tsv` reports. */
export function closureCsvRows(closuresCsv: string): ClosureCsvRow[] {
  const rows = readCsvText(decodeCsvBytes(readFileSync(`${GEOGRAPHY_DIR}/${closuresCsv}`)));
  return rows.map((r, i) => ({
    rowNo: i + 2,
    nodeA: Number(r.get("node_a")),
    nodeB: Number(r.get("node_b")),
    hour: Number(r.get("activation_hour")),
    label: r.get("label") ?? "",
    kind: r.get("kind") ?? "",
  }));
}

/** Lon/lat pairs of a CSV with `lon`/`lat` columns, skipping unparseable rows. */
export function loadPoints(csvPath: string): { lon: number; lat: number }[] {
  const rows = readCsvText(decodeCsvBytes(readFileSync(`${GEOGRAPHY_DIR}/${csvPath}`)));
  const out: { lon: number; lat: number }[] = [];
  for (const r of rows) {
    // `Certified.snapCsv` mirrors ContextCreator's `catch (Exception ignore)`:
    // a row whose coordinates do not parse is skipped, silently, and never
    // reaches the snapper.
    try {
      const lon = javaParseDouble(r.get("lon") ?? "");
      const lat = javaParseDouble(r.get("lat") ?? "");
      out.push({ lon, lat });
    } catch {
      continue;
    }
  }
  return out;
}
