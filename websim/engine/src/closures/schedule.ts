/**
 * Step 9 of `ContextCreator.build()`: parse a Scenario-E closure schedule into
 * one-shot waves (`ContextCreator.java:639-707`).
 *
 * Parsing only. Applying a wave — blocking the edges, bumping the closure
 * version and recomputing every shelter tree in shelter-CSV load order — is
 * run-time behaviour and belongs to WP8.
 *
 * ## Three outcomes for a row, and they are not interchangeable
 *
 * | condition | Java | here |
 * |---|---|---|
 * | non-numeric `node_a`/`node_b`/`activation_hour`, or a missing column | `IllegalStateException` naming the **1-based row number** | {@link ClosureScheduleError} |
 * | `activation_hour < 0` | `IllegalStateException` | {@link ClosureScheduleError} |
 * | `activation_hour >= min(simulationHours, smokeHours)` | `WARN`, row kept, wave scheduled and **inert** | counted in `inertRows`, wave kept |
 *
 * A missing column throws because Java calls `.trim()` on the `null` a missing
 * key returns, and the resulting `NullPointerException` is a `RuntimeException`
 * caught by the same handler as a `NumberFormatException`. So "malformed row"
 * and "wrong header" produce the same failure, and both stop the run.
 *
 * ## Ordering
 *
 * Waves come out in ascending hour (`TreeMap`), and the edges inside a wave stay
 * in **file order** (`ArrayList` append).
 *
 * The wave order is observable: it decides when the graph changes. The
 * **within-wave order is NOT** — an earlier revision of this comment claimed it
 * "can decide path geometry after the recompute", and that is wrong
 * (WP8-SPEC-closures.md QUIRK 38). `ClosureWave.apply()` blocks every edge of a
 * wave *before* `bumpClosureVersion()` and before the first `computeTree`, and
 * the blocked set is a set, so no tree can observe a partial wave. File order is
 * kept because it is free and because it is the certified order the recompute
 * log is written in — not because an outcome depends on it, and a test asserting
 * an order-dependent outcome here would pass vacuously and mislead.
 *
 * ## The phantom guard
 *
 * `matchingGraphEdges` counts scheduled pairs that actually exist in the routing
 * graph. A pair that matches nothing blocks nothing; the certified model warns
 * and continues, and the count is exported into the manifest's closure census,
 * so this port carries the number rather than asserting the schedules are clean.
 * (They are — 18/18 and 72/72 in the committed families — but that is a
 * measurement, not an invariant.)
 */

import { hasEdgeBetween, nodeIndex, type RoutingGraph } from "../graph/csr.js";
import type { CsvRow } from "../loader/csv.js";

/** Thrown where Java throws `IllegalStateException` while parsing a schedule. */
export class ClosureScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClosureScheduleError";
  }
}

/** One scheduled undirected closure, as written in the CSV. */
export interface ScheduledClosure {
  /** Certified node id (not a graph index) — the CSV's own vocabulary. */
  readonly nodeA: number;
  readonly nodeB: number;
  /** Node indices, or `-1` when the id is not in the graph. */
  readonly indexA: number;
  readonly indexB: number;
  /** `network.hasEdge(a, b)` — false means this closure blocks nothing. */
  readonly matchesGraphEdge: boolean;
}

export interface ClosureWave {
  readonly hour: number;
  /** `hour * ticksPerHour` — the FIRST_PRIORITY one-shot tick. */
  readonly tick: number;
  readonly edges: readonly ScheduledClosure[];
  /** `true` when the wave lands at or after the run end (scheduled but inert). */
  readonly inert: boolean;
}

export interface ClosureSchedule {
  readonly csvPath: string;
  readonly waves: readonly ClosureWave[];
  /** Every parsed row, including phantom pairs. */
  readonly scheduledEdges: number;
  readonly matchingGraphEdges: number;
  /** Ascending distinct activation hours — the manifest's `wave_hours`. */
  readonly waveHours: readonly number[];
  /** Rows whose hour is at or after the run end. */
  readonly inertRows: number;
}

/**
 * `Long.parseLong` / `Integer.parseInt` strictness: optional sign, then digits
 * only. No whitespace (the caller has trimmed), no underscores, no `0x`,
 * no trailing junk — all of which `Number()` would happily accept.
 */
const JAVA_INTEGER = /^[+-]?\d+$/u;

function parseJavaInt(raw: string | undefined, what: string): number {
  if (raw === undefined) {
    // Java: `r.get(col)` returns null and `.trim()` throws NPE — a RuntimeException,
    // caught by the same handler as a NumberFormatException.
    throw new ClosureScheduleError(`column ${what} is absent`);
  }
  const text = raw.trim();
  if (!JAVA_INTEGER.test(text)) {
    throw new ClosureScheduleError(`${what}="${text}" is not an integer`);
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value)) {
    throw new ClosureScheduleError(`${what}="${text}" exceeds the exact integer range`);
  }
  return value;
}

export interface ParseClosureScheduleOptions {
  readonly rows: readonly CsvRow[];
  readonly csvPath: string;
  readonly graph: RoutingGraph;
  readonly ticksPerHour: number;
  /** `min(simulationHours, smokeField.hours())` — the inert-warning boundary. */
  readonly runEndHours: number;
}

export function parseClosureSchedule(options: ParseClosureScheduleOptions): ClosureSchedule {
  const { rows, csvPath, graph, ticksPerHour, runEndHours } = options;

  // TreeMap<Integer, List<long[]>>: ascending hour, file order within an hour.
  const byHour = new Map<number, ScheduledClosure[]>();
  let scheduledEdges = 0;
  let matchingGraphEdges = 0;
  let inertRows = 0;

  // Java counts the header as row 1 and starts data at row 2.
  let rowNo = 1;
  for (const row of rows) {
    rowNo++;
    let nodeA: number;
    let nodeB: number;
    let hour: number;
    try {
      nodeA = parseJavaInt(row.get("node_a"), "node_a");
      nodeB = parseJavaInt(row.get("node_b"), "node_b");
      hour = parseJavaInt(row.get("activation_hour"), "activation_hour");
    } catch (bad) {
      throw new ClosureScheduleError(
        `${csvPath} row ${rowNo} is malformed (need numeric node_a,node_b,activation_hour): ` +
          `${(bad as Error).message}`,
      );
    }
    if (hour < 0) {
      throw new ClosureScheduleError(`${csvPath} row ${rowNo}: negative activation_hour ${hour}`);
    }
    if (hour >= runEndHours) {
      inertRows++;
    }

    const indexA = nodeIndex(graph, nodeA);
    const indexB = nodeIndex(graph, nodeB);
    const matchesGraphEdge = indexA >= 0 && indexB >= 0 && hasEdgeBetween(graph, indexA, indexB);

    let wave = byHour.get(hour);
    if (wave === undefined) {
      wave = [];
      byHour.set(hour, wave);
    }
    wave.push({ nodeA, nodeB, indexA, indexB, matchesGraphEdge });
    scheduledEdges++;
    if (matchesGraphEdge) {
      matchingGraphEdges++;
    }
  }

  const waveHours = [...byHour.keys()].sort((a, b) => a - b);
  const waves: ClosureWave[] = waveHours.map((hour) => ({
    hour,
    tick: hour * ticksPerHour,
    edges: byHour.get(hour)!,
    inert: hour >= runEndHours,
  }));

  return {
    csvPath,
    waves,
    scheduledEdges,
    matchingGraphEdges,
    waveHours,
    inertRows,
  };
}
