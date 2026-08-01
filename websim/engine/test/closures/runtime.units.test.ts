/**
 * `ClosureRuntime` on a hand-built graph — the always-green cover for the
 * mechanics the archive cannot exercise and the oracle dumps only exercise
 * incidentally.
 *
 * These assert **structure**, not Java-derived numbers, and say so at each case:
 * a driver proves a branch is reachable and behaves as WP8-SPEC-closures.md
 * transcribes it; the bit-exact evidence is in `wave.oracle.test.ts`,
 * `gate-k.test.ts` and `reaction.oracle.test.ts`. What lives here is the set of
 * situations the five committed schedules do not contain: a phantom pair, a pair
 * repeated across two waves, a wave at exactly the run end, a fractional wave
 * tick, and two parallel features between one pair of nodes.
 *
 * Spec §17.2's ids are noted per case (SE-F15, SE-F16, SE-F17) alongside the
 * QUIRK each one pins.
 *
 * ## The graph
 *
 * ```
 *        e0(10)      e1(10) / e5(10)      e2(10)
 *   n0 ---------- n1 ================== n2 ---------- n3
 *    \                                                /
 *     \------------- e3(1000) --- n4 --- e4(1000) ---/
 * ```
 *
 * `e1` and `e5` are **parallel features between the same node pair**, which is
 * the whole point: `isBlocked` is keyed by pair, so blocking `n1–n2` must take
 * both out (QUIRK 7). Node `n4` carries the id `-1000` — a synthetic split node,
 * so the negative-id canonicalisation is exercised too (QUIRK 28).
 */

import { describe, expect, it } from "vitest";

import { ClosureRuntime, ClosureRuntimeError } from "../../src/closures/runtime.js";
import { parseClosureSchedule, type ClosureSchedule } from "../../src/closures/schedule.js";
import { buildRoutingGraph, type RoutingGraph } from "../../src/graph/csr.js";
import { computeTree, makeScratch, retainTree } from "../../src/graph/dijkstra.js";
import type { CsvRow } from "../../src/loader/csv.js";
import { Shelter } from "../../src/shelters/shelter.js";

const IDS = [100, 101, 102, 103, -1000];

function testGraph(): RoutingGraph {
  return buildRoutingGraph({
    nodeCount: 5,
    edgeCount: 6,
    nodeId: Int32Array.from(IDS),
    nodeLon: Float64Array.from([-122.6, -122.599, -122.598, -122.597, -122.61]),
    nodeLat: Float64Array.from([45.5, 45.5, 45.5, 45.5, 45.49]),
    edgeFrom: Int32Array.from([0, 1, 2, 0, 4, 1]),
    edgeTo: Int32Array.from([1, 2, 3, 4, 3, 2]),
    edgeLengthM: Float64Array.from([10, 10, 10, 1000, 1000, 10]),
    csrOffset: Int32Array.from([0, 2, 5, 8, 10, 12]),
    csrEntry: Int32Array.from([1, 4, -1, 2, 6, -2, -6, 3, -3, -5, -4, 5]),
  } as never);
}

/** A closure schedule from literal rows, through the real WP6 parser. */
function schedule(
  graph: RoutingGraph,
  rows: readonly { a: number; b: number; h: number }[],
  runEndHours = 96,
): ClosureSchedule {
  const csv: CsvRow[] = rows.map(
    (r) =>
      new Map([
        ["node_a", String(r.a)],
        ["node_b", String(r.b)],
        ["activation_hour", String(r.h)],
        ["label", "TEST"],
        ["kind", "arterial"],
      ]),
  );
  return parseClosureSchedule({
    rows: csv,
    csvPath: "data/closures/test.csv",
    graph,
    ticksPerHour: 60,
    runEndHours,
  });
}

function shelterAt(graph: RoutingGraph, node: number, id: string, operating = true): Shelter {
  const s = new Shelter(id, id, null, operating, graph.nodeLon[node]!, graph.nodeLat[node]!);
  s.graphNode = node;
  s.graphNodeId = graph.nodeId[node]!;
  return s;
}

function runtimeFor(
  graph: RoutingGraph,
  sched: ClosureSchedule,
  shelters: Shelter[],
): ClosureRuntime {
  const scratch = makeScratch(graph);
  for (const s of shelters) {
    s.routeTree = retainTree(computeTree(graph, s.graphNode, scratch));
  }
  return new ClosureRuntime({ graph, shelters, schedule: sched, scratch });
}

describe("ClosureWave.apply() — the mechanics the committed schedules do not contain", () => {
  it("blocks BOTH halves and EVERY parallel feature of the pair (QUIRK 7, QUIRK 8)", () => {
    const graph = testGraph();
    // Trees from BOTH ends, so a one-sided block cannot hide behind the search
    // direction: the n3-rooted tree traverses n2→n1, the n0-rooted one n1→n2.
    const shelters = [shelterAt(graph, 3, "east"), shelterAt(graph, 0, "west")];
    const rt = runtimeFor(graph, schedule(graph, [{ a: 101, b: 102, h: 1 }]), shelters);

    expect(shelters[0]!.routeTree!.dist[0]).toBe(30);
    expect(shelters[1]!.routeTree!.dist[3]).toBe(30);

    rt.applyDueWaves(60);

    // Both parallel features are gone, so the only route left is the bypass.
    expect(shelters[0]!.routeTree!.dist[0]).toBe(2000);
    expect(shelters[1]!.routeTree!.dist[3]).toBe(2000);
    expect(rt.blockedEdgeCount).toBe(1);
    expect(rt.isBlockedByNodeId(101, 102)).toBe(true);
    expect(rt.isBlockedByNodeId(102, 101)).toBe(true);
  });

  it("canonicalises NEGATIVE synthetic node ids without collision (QUIRK 28)", () => {
    const graph = testGraph();
    const rt = runtimeFor(graph, schedule(graph, [{ a: 100, b: -1000, h: 1 }]), [
      shelterAt(graph, 3, "east"),
    ]);
    rt.applyDueWaves(60);
    expect(rt.isBlockedByNodeId(-1000, 100)).toBe(true);
    expect(rt.isBlockedByNodeId(100, -1000)).toBe(true);
    // The pair set is keyed on the pair, not on a truncated/unsigned view.
    expect(rt.isBlockedByNodeId(101, 102)).toBe(false);
    expect(rt.blockedEdgeCount).toBe(1);
  });

  it("SE-F16: a phantom pair blocks nothing and never enters the census (QUIRK 5)", () => {
    const graph = testGraph();
    const sched = schedule(graph, [
      { a: 100, b: 999 }, // 999 is not a graph node at all
      { a: 100, b: 103 }, // both real, but no edge joins them
      { a: 101, b: 102 }, // the one real closure
    ].map((r) => ({ ...r, h: 1 })));
    expect(sched.scheduledEdges).toBe(3);
    expect(sched.matchingGraphEdges).toBe(1);

    const rt = runtimeFor(graph, sched, [shelterAt(graph, 3, "east")]);
    const report = rt.applyDueWaves(60)[0]!;
    expect(report.rowsInWave).toBe(3); // `edges.size()` counts phantoms
    expect(report.matchingInWave).toBe(1); // only one reached `blockEdge`
    expect(rt.blockedEdgeCount).toBe(1); // ... and only one is in the census
    expect(rt.isBlockedByNodeId(100, 103)).toBe(false);
    expect(rt.isBlockedByNodeId(100, 999)).toBe(false);
  });

  it("SE-F17: a pair repeated across two waves counts once, but bumps twice", () => {
    const graph = testGraph();
    const rt = runtimeFor(
      graph,
      schedule(graph, [
        { a: 101, b: 102, h: 1 },
        { a: 101, b: 102, h: 2 },
      ]),
      [shelterAt(graph, 3, "east")],
    );
    rt.applyDueWaves(60);
    expect(rt.blockedEdgeCount).toBe(1);
    expect(rt.closureVersion).toBe(1);
    rt.applyDueWaves(120);
    expect(rt.blockedEdgeCount).toBe(1); // `HashSet.add` is idempotent
    expect(rt.closureVersion).toBe(2); // ... but every wave that FIRES bumps
  });

  it("SE-F15: a wave at exactly the run end is warned inert and FIRES anyway (QUIRK 1)", () => {
    const graph = testGraph();
    // Java warns on `hour >= endHours` but fires on `waveTick <= endTick`, i.e.
    // `hour <= endHours`. The parser records the warning; the runtime ignores it.
    const sched = schedule(graph, [{ a: 101, b: 102, h: 96 }], 96);
    expect(sched.inertRows).toBe(1);
    expect(sched.waves[0]!.inert).toBe(true);

    const rt = runtimeFor(graph, sched, [shelterAt(graph, 3, "east")]);
    rt.applyDueWaves(96 * 60);
    expect(rt.closureVersion).toBe(1);
    expect(rt.blockedEdgeCount).toBe(1);
  });

  it("QUIRK 3: a fractional wave tick throws at CONSTRUCTION, never rounds", () => {
    const graph = testGraph();
    const sched = parseClosureSchedule({
      rows: [
        new Map([
          ["node_a", "101"],
          ["node_b", "102"],
          ["activation_hour", "1"],
        ]),
      ],
      csvPath: "data/closures/fractional.csv",
      graph,
      ticksPerHour: 60 / 7, // minutesPerTick = 7 -> 8.571… ticks per hour
      runEndHours: 96,
    });
    expect(Number.isInteger(sched.waves[0]!.tick)).toBe(false);
    expect(
      () => new ClosureRuntime({ graph, shelters: [], schedule: sched }),
    ).toThrow(ClosureRuntimeError);
  });

  it("recomputes EVERY shelter in list order, non-operating included (QUIRK 33)", () => {
    const graph = testGraph();
    const shelters = [
      shelterAt(graph, 3, "east"),
      shelterAt(graph, 0, "closed-west", false),
      shelterAt(graph, 4, "bypass"),
    ];
    const rt = runtimeFor(graph, schedule(graph, [{ a: 101, b: 102, h: 1 }]), shelters);
    const before = shelters.map((s) => s.routeTree);

    const report = rt.applyDueWaves(60)[0]!;
    expect(report.sheltersRecomputed).toBe(3);
    // QUIRK 34: the tree OBJECT is replaced. A resident holding a materialised
    // leg is untouched, and that is the entire mechanism reactToClosureWave
    // exists to adjudicate.
    for (let i = 0; i < shelters.length; i++) {
      expect(shelters[i]!.routeTree).not.toBe(before[i]);
    }
    expect(shelters[1]!.routeTree!.dist[3]).toBe(2000); // the CLOSED site too
  });

  it("fires with `waveTick <= tick`, so a wave at tick 0 is not stranded", () => {
    const graph = testGraph();
    const rt = runtimeFor(graph, schedule(graph, [{ a: 101, b: 102, h: 0 }]), [
      shelterAt(graph, 3, "east"),
    ]);
    expect(rt.wavesApplied).toBe(0);
    expect(rt.applyDueWaves(1).length).toBe(1); // the first AGENT tick is 1
    expect(rt.closureVersion).toBe(1);
  });

  it("is one-shot: a second pass over the same tick fires nothing", () => {
    const graph = testGraph();
    const rt = runtimeFor(
      graph,
      schedule(graph, [
        { a: 101, b: 102, h: 1 },
        { a: 100, b: -1000, h: 2 },
      ]),
      [shelterAt(graph, 3, "east")],
    );
    expect(rt.applyDueWaves(60).length).toBe(1);
    expect(rt.applyDueWaves(60).length).toBe(0);
    expect(rt.applyDueWaves(200).length).toBe(1);
    expect(rt.applyDueWaves(200).length).toBe(0);
    expect(rt.closureVersion).toBe(2);
    expect(rt.waveReports.map((r) => [r.wave, r.hour, r.closureVersion])).toEqual([
      [1, 1, 1],
      [2, 2, 2],
    ]);
  });

  it("a tick that skips several wave hours fires all of them, in order", () => {
    const graph = testGraph();
    const rt = runtimeFor(
      graph,
      schedule(graph, [
        { a: 101, b: 102, h: 1 },
        { a: 100, b: -1000, h: 2 },
        { a: 102, b: 103, h: 3 },
      ]),
      [shelterAt(graph, 3, "east")],
    );
    const fired = rt.applyDueWaves(10_000);
    expect(fired.map((r) => r.hour)).toEqual([1, 2, 3]);
    expect(rt.closureVersion).toBe(3);
    expect(rt.blockedEdgeCount).toBe(3);
  });

  it("isBlockedByNodeId short-circuits on an empty set and rejects unknown ids", () => {
    const graph = testGraph();
    const rt = runtimeFor(graph, schedule(graph, [{ a: 101, b: 102, h: 5 }]), []);
    expect(rt.isBlockedByNodeId(101, 102)).toBe(false); // nothing blocked yet
    rt.applyDueWaves(5 * 60);
    expect(rt.isBlockedByNodeId(101, 102)).toBe(true);
    expect(rt.isBlockedByNodeId(101, 424242)).toBe(false);
    expect(rt.isBlockedByNodeId(424242, 424243)).toBe(false);
  });

  it("formats Java's one log line", () => {
    const graph = testGraph();
    const rt = runtimeFor(graph, schedule(graph, [{ a: 101, b: 102, h: 79 }]), [
      shelterAt(graph, 3, "east"),
    ]);
    const r = rt.applyDueWaves(79 * 60)[0]!;
    expect(ClosureRuntime.formatWaveLog(r)).toBe(
      "[Closures] wave at hour 79: +1 edges blocked (1 undirected total); 1 shelter trees " +
        "recomputed; closure version now 1",
    );
  });
});
