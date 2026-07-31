/**
 * Regression cover for the WP2-S3 perf harness primitives.
 *
 * The benchmark numbers themselves are machine-dependent and live in
 * `websim/docs/DR-S3-perf.md`; what is tested here is the CORRECTNESS of the
 * things those numbers are measured on. A fast Dijkstra that returns wrong
 * distances would produce a beautiful, worthless benchmark.
 */

import { describe, expect, it } from "vitest";

import { computeTree, makeScratch } from "../spikes/perf/dijkstra.js";
import { parseJavaHexDouble, sameBits, ulpDistance } from "../spikes/perf/hexfloat.js";

describe("parseJavaHexDouble", () => {
  it("round-trips the exact doubles the S2 dump carries", () => {
    // Values lifted verbatim from pipeline/out/graph-dump/{nodes,edges}.tsv.
    const cases: [string, number][] = [
      ["-0x1.eb3842cce2c75p6", -122.80494232305666],
      ["0x1.6cdcb9d8d4a42p5", 45.60777635001115],
      ["0x1.b8b156b238b3fp4", 27.54329557054302],
      ["0x1.8a084857f864ap7", 197.01617693812506],
      ["0x1.9d6a66790724dp4", 25.838476631894356],
    ];
    for (const [hex, dec] of cases) {
      expect(sameBits(parseJavaHexDouble(hex), dec), `${hex} vs ${dec}`).toBe(true);
    }
  });

  it("handles zero, negatives and integral exponents", () => {
    expect(parseJavaHexDouble("0x0.0p0")).toBe(0);
    expect(parseJavaHexDouble("-0x1.0p0")).toBe(-1);
    expect(parseJavaHexDouble("0x1.0p3")).toBe(8);
    expect(parseJavaHexDouble("-0x1.8p1")).toBe(-3);
  });

  it("measures ULP distance, not approximate equality", () => {
    expect(ulpDistance(1, 1)).toBe(0);
    expect(ulpDistance(1, 1 + Number.EPSILON)).toBe(1);
    expect(sameBits(0, -0)).toBe(false); // bit comparison, not ===
  });
});

/** Build a CSR from an undirected edge list, mirroring the loader's layout. */
function csrFrom(
  nodeCount: number,
  edges: [number, number, number][],
): { adjOffset: Int32Array; adjEdge: Int32Array; adjOther: Int32Array; edgeLenM: Float64Array } {
  const deg = new Int32Array(nodeCount);
  for (const [a, b] of edges) {
    deg[a]!++;
    deg[b]!++;
  }
  const adjOffset = new Int32Array(nodeCount + 1);
  for (let i = 0; i < nodeCount; i++) adjOffset[i + 1] = adjOffset[i]! + deg[i]!;
  const w = Int32Array.from(adjOffset.subarray(0, nodeCount));
  const adjEdge = new Int32Array(adjOffset[nodeCount]!);
  const adjOther = new Int32Array(adjOffset[nodeCount]!);
  const edgeLenM = new Float64Array(edges.length);
  edges.forEach(([a, b, len], e) => {
    edgeLenM[e] = len;
    adjEdge[w[a]!] = e;
    adjOther[w[a]!] = b;
    w[a]!++;
    adjEdge[w[b]!] = e;
    adjOther[w[b]!] = a;
    w[b]!++;
  });
  return { adjOffset, adjEdge, adjOther, edgeLenM };
}

/** O(V^2) reference Dijkstra — deliberately dumb, obviously correct. */
function referenceDijkstra(
  nodeCount: number,
  edges: [number, number, number][],
  source: number,
  blocked: Set<number> = new Set(),
): Float64Array {
  const dist = new Float64Array(nodeCount).fill(Number.POSITIVE_INFINITY);
  const done = new Uint8Array(nodeCount);
  dist[source] = 0;
  for (;;) {
    let u = -1;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < nodeCount; i++) {
      if (done[i] === 0 && dist[i]! < best) {
        best = dist[i]!;
        u = i;
      }
    }
    if (u === -1) break;
    done[u] = 1;
    edges.forEach(([a, b, len], e) => {
      if (blocked.has(e)) return;
      if (a === u && dist[u]! + len < dist[b]!) dist[b] = dist[u]! + len;
      if (b === u && dist[u]! + len < dist[a]!) dist[a] = dist[u]! + len;
    });
  }
  return dist;
}

describe("computeTree (binary-heap Dijkstra, lazy deletion)", () => {
  it("matches a brute-force reference on 200 random graphs", () => {
    let s = 20260731 >>> 0;
    const rnd = (): number => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let trial = 0; trial < 200; trial++) {
      const n = 6 + Math.floor(rnd() * 25);
      const m = n + Math.floor(rnd() * n * 2);
      const edges: [number, number, number][] = [];
      // spanning path first so the graph is not trivially disconnected
      for (let i = 1; i < n; i++) edges.push([i - 1, i, 1 + rnd() * 100]);
      for (let k = edges.length; k < m; k++) {
        const a = Math.floor(rnd() * n);
        const b = Math.floor(rnd() * n);
        if (a !== b) edges.push([a, b, 1 + rnd() * 100]);
      }
      const csr = csrFrom(n, edges);
      const scratch = makeScratch(n, csr.adjEdge.length);
      const src = Math.floor(rnd() * n);
      computeTree(csr.adjOffset, csr.adjEdge, csr.adjOther, csr.edgeLenM, src, scratch);
      const ref = referenceDijkstra(n, edges, src);
      for (let i = 0; i < n; i++) {
        expect(sameBits(scratch.dist[i]!, ref[i]!), `trial ${trial} node ${i}`).toBe(true);
      }
    }
  });

  it("honours the blocked-edge filter (post-closure-wave recompute)", () => {
    // 0 -1- 1 -1- 2, plus a long 0-2 shortcut of 10.
    const edges: [number, number, number][] = [
      [0, 1, 1],
      [1, 2, 1],
      [0, 2, 10],
    ];
    const csr = csrFrom(3, edges);
    const scratch = makeScratch(3, csr.adjEdge.length);

    computeTree(csr.adjOffset, csr.adjEdge, csr.adjOther, csr.edgeLenM, 0, scratch, null);
    expect(scratch.dist[2]).toBe(2);

    const blocked = new Uint8Array(3);
    blocked[1] = 1; // close edge 1-2
    computeTree(csr.adjOffset, csr.adjEdge, csr.adjOther, csr.edgeLenM, 0, scratch, blocked);
    expect(scratch.dist[2]).toBe(10);
    expect(referenceDijkstra(3, edges, 0, new Set([1]))[2]).toBe(10);
  });

  it("leaves unreachable nodes at +Infinity with predEdge -1", () => {
    const edges: [number, number, number][] = [
      [0, 1, 5],
      [2, 3, 5],
    ];
    const csr = csrFrom(4, edges);
    const scratch = makeScratch(4, csr.adjEdge.length);
    const r = computeTree(csr.adjOffset, csr.adjEdge, csr.adjOther, csr.edgeLenM, 0, scratch);
    expect(r.settled).toBe(2);
    expect(scratch.dist[2]).toBe(Number.POSITIVE_INFINITY);
    expect(scratch.predEdge[2]).toBe(-1);
    expect(scratch.predEdge[1]).toBe(0);
  });

  it("keeps the FIRST-relaxed predecessor at an exact distance tie (strict <)", () => {
    // Two equal-length routes 0->1->3 and 0->2->3; adjacency order decides.
    const edges: [number, number, number][] = [
      [0, 1, 1],
      [0, 2, 1],
      [1, 3, 1],
      [2, 3, 1],
    ];
    const csr = csrFrom(4, edges);
    const scratch = makeScratch(4, csr.adjEdge.length);
    computeTree(csr.adjOffset, csr.adjEdge, csr.adjOther, csr.edgeLenM, 0, scratch);
    expect(scratch.dist[3]).toBe(2);
    // Edge 2 (1->3) is relaxed before edge 3 (2->3) because node 1 pops first.
    expect(scratch.predEdge[3]).toBe(2);
  });
});
