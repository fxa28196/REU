/**
 * CSR construction — the `+`/`−` direction flag and the directed-edge identity.
 *
 * These are the failures that are invisible until path geometry diverges
 * hundreds of ticks into a run, so they are asserted structurally here rather
 * than left to the (git-ignored) fixture tier.
 */

import { describe, expect, it } from "vitest";

import type { GraphTopology } from "@websim/shared/graph-asset";

import {
  buildRoutingGraph,
  directedHead,
  directedTail,
  edgeOfDirected,
  hasEdgeBetween,
  isReversedDirected,
  nodeIndex,
} from "../../src/graph/csr.js";

/**
 * Hand-built topology, adjacency in explicit feature order:
 *
 * ```
 *   node ids   10 (0) — 20 (1) — 30 (2)        40 (3) isolated-ish
 *   edge 0: 0 -> 1  len 5
 *   edge 1: 1 -> 2  len 7
 *   edge 2: 0 -> 1  len 9   (a PARALLEL feature between the same pair)
 * ```
 */
export function toyTopology(): GraphTopology {
  const nodeId = Int32Array.from([10, 20, 30, 40]);
  const nodeLon = Float64Array.from([-122.0, -122.1, -122.2, -122.3]);
  const nodeLat = Float64Array.from([45.0, 45.1, 45.2, 45.3]);
  const edgeFrom = Int32Array.from([0, 1, 0]);
  const edgeTo = Int32Array.from([1, 2, 1]);
  const edgeLengthM = Float64Array.from([5, 7, 9]);
  // node 0: +e0, +e2   node 1: -e0, +e1, -e2   node 2: -e1   node 3: (none)
  const csrOffset = Int32Array.from([0, 2, 5, 6, 6]);
  const csrEntry = Int32Array.from([1, 3, -1, 2, -3, -2]);
  return {
    nodeCount: 4,
    edgeCount: 3,
    nodeId,
    nodeLon,
    nodeLat,
    edgeFrom,
    edgeTo,
    edgeLengthM,
    csrOffset,
    csrEntry,
    census: {} as GraphTopology["census"],
    corrections: [],
  };
}

describe("buildRoutingGraph", () => {
  it("maps the signed 1-based csr entry onto featureIndex*2 + dir", () => {
    const g = buildRoutingGraph(toyTopology());
    // node 0's slice: +e0 -> directed 0, +e2 -> directed 4
    expect(Array.from(g.csrDirected.slice(0, 2))).toEqual([0, 4]);
    // node 1's slice: -e0 -> 1, +e1 -> 2, -e2 -> 5
    expect(Array.from(g.csrDirected.slice(2, 5))).toEqual([1, 2, 5]);
    expect(Array.from(g.csrDirected.slice(5, 6))).toEqual([3]);
  });

  it("resolves the neighbour of each directed record", () => {
    const g = buildRoutingGraph(toyTopology());
    expect(Array.from(g.csrOther)).toEqual([1, 1, 0, 2, 0, 1]);
  });

  it("preserves adjacency order inside a node's slice", () => {
    // The relaxation is strict `<`, so at an exact tie the FIRST-relaxed
    // predecessor wins; reordering here would change path geometry silently.
    const g = buildRoutingGraph(toyTopology());
    expect(edgeOfDirected(g.csrDirected[0]!)).toBe(0);
    expect(edgeOfDirected(g.csrDirected[1]!)).toBe(2);
  });

  it("derives tail and head from a directed edge id alone", () => {
    const g = buildRoutingGraph(toyTopology());
    expect(directedTail(g, 0)).toBe(0);
    expect(directedHead(g, 0)).toBe(1);
    expect(directedTail(g, 1)).toBe(1);
    expect(directedHead(g, 1)).toBe(0);
    expect(isReversedDirected(0)).toBe(false);
    expect(isReversedDirected(1)).toBe(true);
  });

  it("rejects an inverted direction flag instead of routing on it", () => {
    const t = toyTopology();
    const bad = { ...t, csrEntry: Int32Array.from(t.csrEntry) };
    bad.csrEntry[0] = -1; // claim node 0's first record is the reversed e0
    expect(() => buildRoutingGraph(bad)).toThrow(/direction flag is inverted|misaligned/u);
  });

  it("rejects an out-of-range or zero edge reference", () => {
    const t = toyTopology();
    const zero = { ...t, csrEntry: Int32Array.from(t.csrEntry) };
    zero.csrEntry[0] = 0;
    expect(() => buildRoutingGraph(zero)).toThrow(/signed 1-based/u);

    const oob = { ...t, csrEntry: Int32Array.from(t.csrEntry) };
    oob.csrEntry[0] = 99;
    expect(() => buildRoutingGraph(oob)).toThrow(/out of range/u);
  });

  it("indexes sparse node ids, negatives included", () => {
    const t = toyTopology();
    const withNegative = { ...t, nodeId: Int32Array.from([-1021, 20, 30, 40]) };
    const g = buildRoutingGraph(withNegative);
    expect(nodeIndex(g, -1021)).toBe(0);
    expect(nodeIndex(g, 40)).toBe(3);
    expect(nodeIndex(g, 12345)).toBe(-1);
  });
});

describe("hasEdgeBetween", () => {
  it("is the closure loader's phantom guard, and is undirected", () => {
    const g = buildRoutingGraph(toyTopology());
    expect(hasEdgeBetween(g, 0, 1)).toBe(true);
    expect(hasEdgeBetween(g, 1, 0)).toBe(true);
    expect(hasEdgeBetween(g, 0, 2)).toBe(false);
    expect(hasEdgeBetween(g, 3, 0)).toBe(false);
    expect(hasEdgeBetween(g, -1, 0)).toBe(false);
  });
});
