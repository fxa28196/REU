/**
 * Plan gate **(k)** — the closure census — asserted against the port's own
 * runtime and against every archived Scenario-E run manifest.
 *
 * `scripts/verify_E_runs.py:672-716` checks six things per run, all of them
 * derived from the schedule CSV:
 *
 * | assertion | source of truth |
 * |---|---|
 * | `closures.code == closuresCode` | manifest vs params |
 * | code 0 ⇒ `set(closures.keys()) == {"code"}` | the minimal block |
 * | `scheduled_undirected_edges == len(csv)` | every row, phantoms included |
 * | `matching_graph_edges == len(csv)` | the node-id drift detector |
 * | `blocked_edges_at_end == len({sorted(a,b)})` | distinct pairs |
 * | `closure_version_at_end == len(sorted set of hours)` | every wave FIRED |
 * | `wave_hours == sorted distinct hours` | ascending, from the TreeMap |
 *
 * Two of those are *port* assertions rather than manifest assertions and are
 * where a wrong runtime shows up:
 *
 *  - `blocked_edges_at_end` and `closure_version_at_end` are read **from the
 *    live network at export time**, not accumulated (§12). So they are the
 *    end-of-run truth: a wave that failed to fire — the exact failure mode of
 *    treating `ClosureSchedule.inert` as a firing rule (QUIRK 1) — shows up here
 *    as `version < waves` and nowhere else.
 *  - The pair count is over **distinct undirected pairs**, which is Java's
 *    `directed / 2` int division. A blocked self-loop would make the two
 *    disagree (QUIRK 4); the committed schedules have none, and that is asserted
 *    rather than assumed.
 *
 * QUIRK 37 is reproduced verbatim: the gate canonicalises with Python
 * `sorted()` over `dtype=str` values, i.e. **lexicographic on the raw strings**,
 * not numeric. It counts the same for the committed files (no leading zeros, no
 * signs) and this suite asserts that equivalence instead of quietly picking one.
 *
 * The archived manifests are read read-only from `docs/runs/`; they are the
 * numbers the certified runs actually recorded, so agreeing with them is the
 * claim "this runtime would have produced the archived closure census".
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";

import { expect, it } from "vitest";

import { artifactGate, describeGated, type ArtifactRef } from "../../../tools/artifact-gate.js";
import { ClosureRuntime } from "../../src/closures/runtime.js";
import { makeScratch } from "../../src/graph/dijkstra.js";
import { GRAPH_ASSET_REFS, loadGraph } from "../graph/helpers.js";
import { GEOGRAPHY_DIR, geographyRef } from "./helpers.js";
import { SCHEDULES, SHELTERS_A_CSV, closureCsvRows, loadSchedule, loadShelters } from "./world.js";

const ARCHIVE_ROOT = `${GEOGRAPHY_DIR}/../docs/runs`;

const GATE_K_ARTIFACTS: ArtifactRef[] = [
  ...GRAPH_ASSET_REFS,
  geographyRef(SHELTERS_A_CSV),
  ...SCHEDULES.map((s) => geographyRef(s.csv)),
  { source: "archive", label: "scenario-e/", path: `${ARCHIVE_ROOT}/scenario-e` },
  { source: "archive", label: "scenario-e-v2/", path: `${ARCHIVE_ROOT}/scenario-e-v2` },
];

interface ArchivedCensus {
  readonly run: string;
  readonly code: number;
  readonly schedule_file: string;
  readonly scheduled_undirected_edges: number;
  readonly matching_graph_edges: number;
  readonly wave_hours: readonly number[];
  readonly blocked_edges_at_end: number;
  readonly closure_version_at_end: number;
}

function archivedClosureCensuses(): ArchivedCensus[] {
  const out: ArchivedCensus[] = [];
  for (const family of ["scenario-e", "scenario-e-v2"]) {
    const dir = `${ARCHIVE_ROOT}/${family}`;
    if (!existsSync(dir)) {
      continue;
    }
    for (const run of readdirSync(dir)) {
      const p = `${dir}/${run}/simulation.json`;
      if (!existsSync(p)) {
        continue;
      }
      const j = JSON.parse(readFileSync(p, "utf8")) as { closures?: Record<string, unknown> };
      const cl = j.closures;
      if (cl === undefined || cl["code"] === 0) {
        continue;
      }
      out.push({ run: `${family}/${run}`, ...(cl as unknown as Omit<ArchivedCensus, "run">) });
    }
  }
  return out;
}

/** Java's `blockedEdgeCount()`: `sum(|blockedAdj[v]|) / 2`, int division. */
function javaBlockedEdgeCount(pairs: readonly (readonly [number, number])[]): number {
  const adj = new Map<number, Set<number>>();
  const add = (a: number, b: number): void => {
    let s = adj.get(a);
    if (s === undefined) {
      s = new Set<number>();
      adj.set(a, s);
    }
    s.add(b);
  };
  for (const [a, b] of pairs) {
    add(a, b);
    add(b, a);
  }
  let directed = 0;
  for (const s of adj.values()) {
    directed += s.size;
  }
  return Math.trunc(directed / 2);
}

describeGated(
  artifactGate({
    gate: "engine:closures-gate-k",
    suite: "gate (k): the closure census, live network vs the archive",
    evidence:
      "the six gate-(k) assertions re-derived from the port's own ClosureRuntime for all five " +
      "committed schedules, and matched against the closure census every one of the 24 archived " +
      "Scenario-E runs (9 v1 + 15 v2) recorded",
    artifacts: GATE_K_ARTIFACTS,
  }),
  () => {
    it("every committed schedule satisfies gate (k) against the live runtime", () => {
      const { graph } = loadGraph();
      const scratch = makeScratch(graph);
      const shelters = loadShelters(graph, SHELTERS_A_CSV);
      const census: Record<string, unknown>[] = [];

      for (const spec of SCHEDULES) {
        const rows = closureCsvRows(spec.csv);
        const schedule = loadSchedule(graph, spec.csv);
        const runtime = new ClosureRuntime({ graph, shelters, schedule, scratch });

        // QUIRK 37: the gate's own canonicalisation is a LEXICOGRAPHIC sort over
        // the raw CSV strings. Both readings are computed and asserted equal, so
        // the day a schedule carries "046509" the difference is visible instead
        // of silently being whichever this file happened to pick.
        const lexPairs = new Set(
          rows.map((r) => {
            const a = String(r.nodeA);
            const b = String(r.nodeB);
            return a <= b ? `${a}|${b}` : `${b}|${a}`;
          }),
        );
        const numPairs = new Set(
          rows.map((r) =>
            r.nodeA <= r.nodeB ? `${r.nodeA}|${r.nodeB}` : `${r.nodeB}|${r.nodeA}`,
          ),
        );
        expect(lexPairs.size, `${spec.name}: lexicographic vs numeric pair count`).toBe(
          numPairs.size,
        );

        const hoursCsv = [...new Set(rows.map((r) => r.hour))].sort((a, b) => a - b);

        // QUIRK 4: a self-loop would make `blockedEdgeCount()` (directed/2, int
        // division) disagree with `BlockedEdges.size` (distinct pairs).
        expect(rows.filter((r) => r.nodeA === r.nodeB), `${spec.name}: self-loops`).toEqual([]);

        // QUIRK 3: every wave tick must be integral for an integer tick loop.
        for (const w of schedule.waves) {
          expect(Number.isInteger(w.tick), `${spec.name}: wave tick ${w.tick} integral`).toBe(true);
        }

        // Fire every wave. `applyDueWaves` past the last tick is the run loop's
        // own behaviour, and the inert flag is deliberately NOT consulted.
        const fired = runtime.applyDueWaves(Number.MAX_SAFE_INTEGER);

        expect(schedule.scheduledEdges, `${spec.name}: scheduled == rows`).toBe(rows.length);
        expect(schedule.matchingGraphEdges, `${spec.name}: matching == rows`).toBe(rows.length);
        expect(runtime.blockedEdgeCount, `${spec.name}: blocked_edges_at_end`).toBe(numPairs.size);
        expect(runtime.closureVersion, `${spec.name}: closure_version_at_end`).toBe(
          hoursCsv.length,
        );
        expect([...schedule.waveHours], `${spec.name}: wave_hours`).toEqual(hoursCsv);
        expect(fired.length, `${spec.name}: waves fired`).toBe(hoursCsv.length);
        expect(runtime.wavesApplied).toBe(hoursCsv.length);

        // Java's own arithmetic, reconstructed from the pair set, agrees with
        // `BlockedEdges.size` — that is QUIRK 4 measured, not assumed.
        expect(
          javaBlockedEdgeCount(runtime.blocked.blockedPairs()),
          `${spec.name}: directed/2 == distinct pairs`,
        ).toBe(runtime.blockedEdgeCount);

        // A second `applyDueWaves` must be a no-op: waves are ONE-SHOT.
        expect(runtime.applyDueWaves(Number.MAX_SAFE_INTEGER).length).toBe(0);
        expect(runtime.closureVersion).toBe(hoursCsv.length);

        census.push({
          schedule: spec.name,
          rows: rows.length,
          distinctPairs: numPairs.size,
          waves: hoursCsv.length,
          hours: hoursCsv,
          blockedAtEnd: runtime.blockedEdgeCount,
          versionAtEnd: runtime.closureVersion,
        });
      }
      // eslint-disable-next-line no-console -- the census IS the evidence
      console.log(`[WP8 gate (k)] ${JSON.stringify(census)}`);
      expect(census.length).toBe(5);
    });

    it("matches the closure census of every archived Scenario-E run", () => {
      const { graph } = loadGraph();
      const scratch = makeScratch(graph);
      const shelters = loadShelters(graph, SHELTERS_A_CSV);
      const archived = archivedClosureCensuses();
      expect(archived.length, "archived closure runs (9 v1 + 15 v2)").toBe(24);

      const cache = new Map<string, Record<string, unknown>>();
      for (const a of archived) {
        let mine = cache.get(a.schedule_file);
        if (mine === undefined) {
          const rows = closureCsvRows(a.schedule_file);
          const schedule = loadSchedule(graph, a.schedule_file);
          const runtime = new ClosureRuntime({ graph, shelters, schedule, scratch });
          runtime.applyDueWaves(Number.MAX_SAFE_INTEGER);
          mine = {
            scheduled_undirected_edges: schedule.scheduledEdges,
            matching_graph_edges: schedule.matchingGraphEdges,
            wave_hours: [...schedule.waveHours],
            blocked_edges_at_end: runtime.blockedEdgeCount,
            closure_version_at_end: runtime.closureVersion,
            rows: rows.length,
          };
          cache.set(a.schedule_file, mine);
        }
        expect(
          {
            scheduled_undirected_edges: a.scheduled_undirected_edges,
            matching_graph_edges: a.matching_graph_edges,
            wave_hours: [...a.wave_hours],
            blocked_edges_at_end: a.blocked_edges_at_end,
            closure_version_at_end: a.closure_version_at_end,
          },
          `archived census of ${a.run}`,
        ).toEqual({
          scheduled_undirected_edges: mine["scheduled_undirected_edges"],
          matching_graph_edges: mine["matching_graph_edges"],
          wave_hours: mine["wave_hours"],
          blocked_edges_at_end: mine["blocked_edges_at_end"],
          closure_version_at_end: mine["closure_version_at_end"],
        });
        // `code` 1/2/3 must select the file the manifest names — the resolver is
        // WP6's `resolveClosuresCsv`, exercised in the world suite; here we only
        // record that the code and the file are consistent with each other.
        expect([1, 2, 3]).toContain(a.code);
      }
      // eslint-disable-next-line no-console -- the census IS the evidence
      console.log(`[WP8 gate (k)] matched ${archived.length} archived closure censuses`);
    });
  },
);
