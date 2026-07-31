/**
 * Dijkstra — distances against brute force by raw IEEE-754 bits, and pop order
 * against an independently-transcribed `java.util.PriorityQueue`.
 *
 * Two different failure modes need two different oracles:
 *
 *  - **Distances** are tie-independent, so an O(V²) reference settles them. A
 *    bit comparison (not `toBeCloseTo`) is the point: the summation ORDER along
 *    a path decides the last bits, so a reference that relaxes in a different
 *    order would disagree even though both are "correct".
 *  - **Predecessors** at exact distance ties are decided by heap pop order, an
 *    artefact of `java.util.PriorityQueue`. The reference below is a separate,
 *    deliberately naive transcription of `siftUp`/`siftDown` with explicit
 *    `Double.compare` calls; the production version inlines the same logic into
 *    typed arrays for speed. If the inlining ever slips, this catches it without
 *    needing the 108 MB Java tree dumps.
 */

import { describe, expect, it } from "vitest";

import type { GraphTopology } from "@websim/shared/graph-asset";

import { BlockedEdges } from "../../src/graph/blocked.js";
import { buildRoutingGraph, type RoutingGraph } from "../../src/graph/csr.js";
import { computeTree, makeScratch } from "../../src/graph/dijkstra.js";
import { doubleToBits } from "./helpers.js";

// ---------------------------------------------------------------- generators

interface EdgeSpec {
  readonly from: number;
  readonly to: number;
  readonly len: number;
}

function topologyFrom(nodeCount: number, edges: readonly EdgeSpec[]): GraphTopology {
  const edgeFrom = Int32Array.from(edges.map((e) => e.from));
  const edgeTo = Int32Array.from(edges.map((e) => e.to));
  const edgeLengthM = Float64Array.from(edges.map((e) => e.len));

  // Adjacency in feature order, exactly as ContextCreator mirrors it: each
  // feature appends its forward record to `from` and its back record to `to`.
  const rows: number[][] = Array.from({ length: nodeCount }, () => []);
  edges.forEach((e, i) => {
    rows[e.from]!.push(i + 1);
    rows[e.to]!.push(-(i + 1));
  });
  const csrOffset = new Int32Array(nodeCount + 1);
  for (let n = 0; n < nodeCount; n++) {
    csrOffset[n + 1] = csrOffset[n]! + rows[n]!.length;
  }
  const csrEntry = new Int32Array(csrOffset[nodeCount]!);
  for (let n = 0; n < nodeCount; n++) {
    csrEntry.set(rows[n]!, csrOffset[n]!);
  }
  return {
    nodeCount,
    edgeCount: edges.length,
    nodeId: Int32Array.from({ length: nodeCount }, (_, i) => i * 10),
    nodeLon: new Float64Array(nodeCount),
    nodeLat: new Float64Array(nodeCount),
    edgeFrom,
    edgeTo,
    edgeLengthM,
    csrOffset,
    csrEntry,
    census: {} as GraphTopology["census"],
    corrections: [],
  };
}

/** Deterministic small PRNG so a failure is reproducible from its seed alone. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -------------------------------------------------- reference implementations

/** O(V²) Dijkstra. Distances only — it has no defensible tie policy. */
function bruteForceDist(g: RoutingGraph, source: number, blockedPairs: Set<string>): Float64Array {
  const dist = new Float64Array(g.nodeCount).fill(Number.POSITIVE_INFINITY);
  const done = new Uint8Array(g.nodeCount);
  dist[source] = 0;
  for (;;) {
    let u = -1;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < g.nodeCount; i++) {
      if (done[i] === 0 && dist[i]! < best) {
        best = dist[i]!;
        u = i;
      }
    }
    if (u < 0) {
      return dist;
    }
    done[u] = 1;
    for (let k = g.csrOffset[u]!; k < g.csrOffset[u + 1]!; k++) {
      const v = g.csrOther[k]!;
      const key = u < v ? `${u}:${v}` : `${v}:${u}`;
      if (blockedPairs.has(key)) {
        continue;
      }
      const nd = dist[u]! + g.edgeLengthM[g.csrDirected[k]! >>> 1]!;
      if (nd < dist[v]!) {
        dist[v] = nd;
      }
    }
  }
}

/**
 * `java.util.PriorityQueue<double[]>` with `(a, b) -> Double.compare(a[0], b[0])`,
 * transcribed straight from the JDK source with no typed-array inlining.
 */
class JavaPriorityQueue {
  private readonly q: [number, number][] = [];

  private static compare(a: [number, number], b: [number, number]): number {
    // Double.compare
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    const ab = doubleToBits(a[0]);
    const bb = doubleToBits(b[0]);
    return ab === bb ? 0 : ab < bb ? -1 : 1;
  }

  public get size(): number {
    return this.q.length;
  }

  public offer(x: [number, number]): void {
    let k = this.q.length;
    this.q.push(x);
    while (k > 0) {
      const parent = (k - 1) >>> 1;
      const e = this.q[parent]!;
      if (JavaPriorityQueue.compare(x, e) >= 0) {
        break;
      }
      this.q[k] = e;
      k = parent;
    }
    this.q[k] = x;
  }

  public poll(): [number, number] | null {
    if (this.q.length === 0) {
      return null;
    }
    const result = this.q[0]!;
    const x = this.q.pop()!;
    const size = this.q.length;
    if (size !== 0) {
      let k = 0;
      const half = size >>> 1;
      while (k < half) {
        let child = (k << 1) + 1;
        let c = this.q[child]!;
        const right = child + 1;
        if (right < size && JavaPriorityQueue.compare(c, this.q[right]!) > 0) {
          child = right;
          c = this.q[child]!;
        }
        if (JavaPriorityQueue.compare(x, c) <= 0) {
          break;
        }
        this.q[k] = c;
        k = child;
      }
      this.q[k] = x;
    }
    return result;
  }
}

/** `StreetNetwork.computeTree` written the slow, literal way. */
function referenceTree(
  g: RoutingGraph,
  source: number,
  blockedPairs: Set<string>,
): { dist: Float64Array; predEdge: Int32Array } {
  const dist = new Float64Array(g.nodeCount).fill(Number.POSITIVE_INFINITY);
  const predEdge = new Int32Array(g.nodeCount).fill(-1);
  const queue = new JavaPriorityQueue();
  dist[source] = 0;
  queue.offer([0, source]);
  for (;;) {
    const head = queue.poll();
    if (head === null) {
      break;
    }
    const [d, node] = head;
    if (d > dist[node]!) {
      continue;
    }
    for (let k = g.csrOffset[node]!; k < g.csrOffset[node + 1]!; k++) {
      const v = g.csrOther[k]!;
      const key = node < v ? `${node}:${v}` : `${v}:${node}`;
      if (blockedPairs.size > 0 && blockedPairs.has(key)) {
        continue;
      }
      const de = g.csrDirected[k]!;
      const nd = d + g.edgeLengthM[de >>> 1]!;
      if (nd < dist[v]!) {
        dist[v] = nd;
        predEdge[v] = de;
        queue.offer([nd, v]);
      }
    }
  }
  return { dist, predEdge };
}

function bitsOf(a: Float64Array): string[] {
  return Array.from(a, doubleToBits);
}

// ------------------------------------------------------------------- the tests

describe("computeTree vs brute force", () => {
  it("matches an O(V^2) reference on 200 random graphs, by raw bits", () => {
    let compared = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = mulberry32(seed);
      const n = 3 + Math.floor(rnd() * 18);
      const edges: EdgeSpec[] = [];
      for (let i = 1; i < n; i++) {
        // spanning backbone so most of the graph is reachable
        edges.push({ from: Math.floor(rnd() * i), to: i, len: 1 + rnd() * 500 });
      }
      const extra = Math.floor(rnd() * n * 2);
      for (let i = 0; i < extra; i++) {
        const a = Math.floor(rnd() * n);
        const b = Math.floor(rnd() * n);
        if (a !== b) {
          edges.push({ from: a, to: b, len: 1 + rnd() * 500 });
        }
      }
      const g = buildRoutingGraph(topologyFrom(n, edges));
      const scratch = makeScratch(g);
      const source = Math.floor(rnd() * n);
      const tree = computeTree(g, source, scratch);
      const ref = bruteForceDist(g, source, new Set());
      expect(bitsOf(tree.dist), `seed ${seed}`).toEqual(bitsOf(ref));
      compared += n;
    }
    expect(compared).toBeGreaterThan(2000);
  });

  it("leaves unreachable nodes at +Infinity with predecessor -1", () => {
    // Two components: 0-1 and 2-3.
    const g = buildRoutingGraph(
      topologyFrom(4, [
        { from: 0, to: 1, len: 3 },
        { from: 2, to: 3, len: 4 },
      ]),
    );
    const tree = computeTree(g, 0, makeScratch(g));
    expect(Array.from(tree.dist)).toEqual([0, 3, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]);
    expect(Array.from(tree.predEdge)).toEqual([-1, 0, -1, -1]);
    expect(tree.reachableCount).toBe(2);
  });
});

describe("computeTree pop order", () => {
  it("matches a literal java.util.PriorityQueue transcription, predecessors included", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const rnd = mulberry32(seed * 7919);
      const n = 4 + Math.floor(rnd() * 14);
      const edges: EdgeSpec[] = [];
      for (let i = 1; i < n; i++) {
        // Integral lengths from a small set, so exact distance ties are COMMON
        // and the tie policy is actually exercised.
        edges.push({ from: Math.floor(rnd() * i), to: i, len: 1 + Math.floor(rnd() * 3) });
      }
      for (let i = 0; i < n; i++) {
        const a = Math.floor(rnd() * n);
        const b = Math.floor(rnd() * n);
        if (a !== b) {
          edges.push({ from: a, to: b, len: 1 + Math.floor(rnd() * 3) });
        }
      }
      const g = buildRoutingGraph(topologyFrom(n, edges));
      const source = Math.floor(rnd() * n);
      const got = computeTree(g, source, makeScratch(g));
      const ref = referenceTree(g, source, new Set());
      expect(bitsOf(got.dist), `dist seed ${seed}`).toEqual(bitsOf(ref.dist));
      expect(Array.from(got.predEdge), `pred seed ${seed}`).toEqual(Array.from(ref.predEdge));
    }
  });

  it("keeps the FIRST-relaxed predecessor at an exact tie", () => {
    // Both feature 0 (0->1->3) and feature 2 (0->2->3) reach node 3 at 2.0.
    // Feature order decides: node 1 is settled before node 2, so node 3's
    // predecessor is the edge out of node 1.
    const g = buildRoutingGraph(
      topologyFrom(4, [
        { from: 0, to: 1, len: 1 },
        { from: 1, to: 3, len: 1 },
        { from: 0, to: 2, len: 1 },
        { from: 2, to: 3, len: 1 },
      ]),
    );
    const tree = computeTree(g, 0, makeScratch(g));
    expect(tree.dist[3]).toBe(2);
    expect(tree.predEdge[3]! >>> 1).toBe(1); // feature 1, i.e. 1 -> 3
    expect(tree.predEdge[3]! & 1).toBe(0);
  });
});

describe("blocked edges", () => {
  it("blocks a NODE PAIR, so parallel features between it are both cut", () => {
    // Two features between 0 and 1 (lengths 5 and 1) plus a detour 0-2-1 of 3.
    const g = buildRoutingGraph(
      topologyFrom(3, [
        { from: 0, to: 1, len: 5 },
        { from: 0, to: 1, len: 1 },
        { from: 0, to: 2, len: 2 },
        { from: 2, to: 1, len: 1 },
      ]),
    );
    const open = computeTree(g, 0, makeScratch(g));
    expect(open.dist[1]).toBe(1);

    const blocked = new BlockedEdges(g);
    expect(blocked.isEmpty).toBe(true);
    expect(blocked.blockPair(0, 1)).toBe(true);
    expect(blocked.isEmpty).toBe(false);
    expect(blocked.size).toBe(1);

    const cut = computeTree(g, 0, makeScratch(g), blocked);
    expect(cut.dist[1]).toBe(3); // forced onto the detour; BOTH parallels cut
  });

  it("is idempotent and reports a phantom pair as touching nothing", () => {
    const g = buildRoutingGraph(topologyFrom(3, [{ from: 0, to: 1, len: 5 }]));
    const b = new BlockedEdges(g);
    expect(b.blockPair(0, 1)).toBe(true);
    expect(b.blockPair(1, 0)).toBe(false); // same undirected pair, already there
    expect(b.blockPair(0, 2)).toBe(false); // no such edge: joins the set, cuts nothing
    expect(b.size).toBe(2);
    expect(b.isBlocked(0, 2)).toBe(true);
  });

  it("an empty blocked set is bit-identical to passing none (the R3 short-circuit)", () => {
    const g = buildRoutingGraph(
      topologyFrom(5, [
        { from: 0, to: 1, len: 2 },
        { from: 1, to: 2, len: 3 },
        { from: 0, to: 3, len: 1 },
        { from: 3, to: 4, len: 9 },
        { from: 4, to: 2, len: 1 },
      ]),
    );
    const a = computeTree(g, 0, makeScratch(g));
    const b = computeTree(g, 0, makeScratch(g), new BlockedEdges(g));
    expect(bitsOf(b.dist)).toEqual(bitsOf(a.dist));
    expect(Array.from(b.predEdge)).toEqual(Array.from(a.predEdge));
    expect(b.stats.relaxations).toBe(a.stats.relaxations);
  });

  it("agrees with the literal reference when edges ARE blocked", () => {
    for (let seed = 1; seed <= 80; seed++) {
      const rnd = mulberry32(seed * 104729);
      const n = 5 + Math.floor(rnd() * 12);
      const edges: EdgeSpec[] = [];
      for (let i = 1; i < n; i++) {
        edges.push({ from: Math.floor(rnd() * i), to: i, len: 1 + Math.floor(rnd() * 4) });
      }
      for (let i = 0; i < n; i++) {
        const a = Math.floor(rnd() * n);
        const b = Math.floor(rnd() * n);
        if (a !== b) {
          edges.push({ from: a, to: b, len: 1 + Math.floor(rnd() * 4) });
        }
      }
      const g = buildRoutingGraph(topologyFrom(n, edges));
      const blocked = new BlockedEdges(g);
      const pairs = new Set<string>();
      const cuts = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < cuts; i++) {
        const e = Math.floor(rnd() * edges.length);
        const spec = edges[e]!;
        blocked.blockPair(spec.from, spec.to);
        pairs.add(spec.from < spec.to ? `${spec.from}:${spec.to}` : `${spec.to}:${spec.from}`);
      }
      const source = Math.floor(rnd() * n);
      const got = computeTree(g, source, makeScratch(g), blocked);
      const ref = referenceTree(g, source, pairs);
      expect(bitsOf(got.dist), `dist seed ${seed}`).toEqual(bitsOf(ref.dist));
      expect(Array.from(got.predEdge), `pred seed ${seed}`).toEqual(Array.from(ref.predEdge));
      expect(bitsOf(got.dist)).toEqual(bitsOf(bruteForceDist(g, source, pairs)));
    }
  });
});
