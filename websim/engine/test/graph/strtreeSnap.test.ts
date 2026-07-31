/**
 * Degree-space nearest-node snapping.
 *
 * The tree here is an accelerator, not a semantic: what must hold is that it
 * returns exactly the brute-force answer under the certified metric
 * (`sqrt(dx² + dy²)` in DEGREES between envelope centres), including the full
 * tied set. The tie-break itself — reproducing JTS STRtree traversal order via
 * the `HashMap<Long, Coordinate>` bucket order that seeds it — is validated
 * against the Java oracle in `snap.parity.test.ts`; what is checked here is that
 * the arithmetic behind it is what it claims to be.
 */

import { describe, expect, it } from "vitest";

import type { GraphTopology } from "@websim/shared/graph-asset";

import { buildRoutingGraph } from "../../src/graph/csr.js";
import {
  DegreeSpaceNodeIndex,
  hashMapTableLength,
  hashOrderKey,
} from "../../src/graph/strtreeSnap.js";

function pointGraph(lons: readonly number[], lats: readonly number[], ids?: readonly number[]) {
  const n = lons.length;
  const topology: GraphTopology = {
    nodeCount: n,
    edgeCount: 0,
    nodeId: Int32Array.from(ids ?? lons.map((_, i) => i + 1)),
    nodeLon: Float64Array.from(lons),
    nodeLat: Float64Array.from(lats),
    edgeFrom: new Int32Array(0),
    edgeTo: new Int32Array(0),
    edgeLengthM: new Float64Array(0),
    csrOffset: new Int32Array(n + 1),
    csrEntry: new Int32Array(0),
    census: {} as GraphTopology["census"],
    corrections: [],
  };
  return buildRoutingGraph(topology);
}

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

describe("hashMapTableLength", () => {
  it("is the table a java.util.HashMap reaches at the default 0.75 load factor", () => {
    expect(hashMapTableLength(0)).toBe(16);
    expect(hashMapTableLength(12)).toBe(16);
    expect(hashMapTableLength(13)).toBe(32); // 13 > 16 * 0.75
    expect(hashMapTableLength(24)).toBe(32);
    expect(hashMapTableLength(25)).toBe(64);
    // The production graph: 65536 * 0.75 = 49152 < 88100 <= 131072 * 0.75 = 98304.
    expect(hashMapTableLength(88100)).toBe(131072);
  });
});

describe("hashOrderKey", () => {
  it("is spread(Long.hashCode(id)) masked to the table, computed by hand", () => {
    const mask = 131071;
    // 74194 = 0x121D2; 0x121D2 >>> 16 = 1; 0x121D2 ^ 1 = 0x121D3 = 74195.
    expect(hashOrderKey(74194, mask)).toBe(74195);
    // 16952934 = 0x102AE66; >>> 16 = 0x102; 0x102AE66 ^ 0x102 = 0x102AF64;
    // 0x102AF64 & 0x1FFFF = 0xAF64 + 0x20000*? -> 0x2AF64 & 0x1FFFF = 0xAF64 = 44900.
    expect(hashOrderKey(16952934, mask)).toBe(44900);
    // This inequality is the one that matters: it is why Java picked the LARGER
    // node id for encampment 523, across a component boundary.
    expect(hashOrderKey(16952934, mask)).toBeLessThan(hashOrderKey(74194, mask));
  });

  it("handles the synthetic negative node ids the corrupt-id correction minted", () => {
    const mask = 131071;
    // Long.hashCode(-1000) = (int)(-1000 ^ (-1000 >>> 32)). For a negative long,
    // -1000 >>> 32 is 0xFFFFFFFF, so the low word is (-1000) ^ -1 = 999.
    expect(hashOrderKey(-1000, mask)).toBe((999 ^ (999 >>> 16)) & mask);
    expect(Number.isInteger(hashOrderKey(-1021, mask))).toBe(true);
    expect(hashOrderKey(-1021, mask)).toBeGreaterThanOrEqual(0);
  });
});

describe("DegreeSpaceNodeIndex", () => {
  it("matches brute force on 2,000 random queries over 1,500 nodes", () => {
    const rnd = mulberry32(20260731);
    const n = 1500;
    const lons: number[] = [];
    const lats: number[] = [];
    for (let i = 0; i < n; i++) {
      lons.push(-123.5 + rnd() * 2);
      lats.push(44.8 + rnd() * 1);
    }
    const g = pointGraph(lons, lats);
    const index = new DegreeSpaceNodeIndex(g);
    for (let q = 0; q < 2000; q++) {
      const qlon = -123.6 + rnd() * 2.2;
      const qlat = 44.7 + rnd() * 1.2;
      let bestD = Number.POSITIVE_INFINITY;
      let best: number[] = [];
      for (let i = 0; i < n; i++) {
        const dx = lons[i]! - qlon;
        const dy = lats[i]! - qlat;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestD) {
          bestD = d;
          best = [i];
        } else if (d === bestD) {
          best.push(i);
        }
      }
      const got = index.nearestCandidates(qlon, qlat);
      expect(got.degreeDistance, `query ${q}`).toBe(bestD);
      expect(got.nodes, `query ${q}`).toEqual(best.sort((a, b) => a - b));
    }
  });

  it("ranks in DEGREES, not metres — the anisotropy is certified behaviour", () => {
    // At 45.5 N one degree of longitude is ~78.2 km against ~111.1 km of
    // latitude. Node 0 sits 0.0013 deg EAST of the query (~101.6 m); node 1
    // sits 0.0012 deg NORTH (~133.4 m). A geodesic snap picks node 0; the
    // certified planar-degree snap picks node 1, because 0.0012 < 0.0013.
    const g = pointGraph([-122.0 + 0.0013, -122.0], [45.5, 45.5 + 0.0012], [7, 9]);
    const index = new DegreeSpaceNodeIndex(g);
    expect(index.nearestNodeId(-122.0, 45.5)).toBe(9);
  });

  it("finds every node of a coincident-coordinate group, then decides by bucket order", () => {
    // ids 74194 / 16952934 are a real coincident pair in the certified graph.
    const g = pointGraph([-122.5, -122.5, -122.4], [45.5, 45.5, 45.4], [74194, 16952934, 55]);
    const index = new DegreeSpaceNodeIndex(g);
    const cands = index.nearestCandidates(-122.5, 45.5);
    expect(cands.nodes).toEqual([0, 1]);
    expect(cands.degreeDistance).toBe(0);

    const snap = index.nearest(-122.5, 45.5);
    expect(snap.tiedCount).toBe(2);
    expect(snap.tieKind).toBe("hash-order");
    // Lower bucket wins, at THIS graph's table size. A 3-node graph's HashMap
    // table is 16, not the production graph's 131072, and the two ids land in
    // a different relative order there — which is exactly why the rule is
    // parameterised by node count instead of hard-coding a mask.
    const mask = hashMapTableLength(g.nodeCount) - 1;
    const expected =
      hashOrderKey(74194, mask) < hashOrderKey(16952934, mask) ? 74194 : 16952934;
    expect(g.nodeId[snap.node]).toBe(expected);
    // At the PRODUCTION table the same rule picks the LARGER id — the case a
    // "lowest node id wins" rule gets wrong, across a component boundary.
    const prodMask = hashMapTableLength(88100) - 1;
    expect(hashOrderKey(16952934, prodMask)).toBeLessThan(hashOrderKey(74194, prodMask));
  });

  it("falls through to the lowest node id only on a genuine bucket collision", () => {
    // 1 and 131073 share bucket 1 at table 131072 — but this graph has 2 nodes,
    // so the table is 16 and they differ; pick ids that collide at table 16
    // instead: bucket = (h ^ (h>>>16)) & 15, so 1 and 17 both land on 1.
    expect(hashOrderKey(1, 15)).toBe(hashOrderKey(17, 15));
    const g = pointGraph([-122.5, -122.5], [45.5, 45.5], [17, 1]);
    const index = new DegreeSpaceNodeIndex(g);
    const snap = index.nearest(-122.5, 45.5);
    expect(snap.tieKind).toBe("lowest-id");
    expect(g.nodeId[snap.node]).toBe(1);
  });

  it("reports a unique winner as unique", () => {
    const g = pointGraph([-122.5, -122.4], [45.5, 45.4]);
    const snap = new DegreeSpaceNodeIndex(g).nearest(-122.5, 45.5);
    expect(snap.tiedCount).toBe(1);
    expect(snap.tieKind).toBe("unique");
    expect(snap.degreeDistance).toBe(0);
  });

  it("handles a single-node graph and refuses an empty one", () => {
    const one = new DegreeSpaceNodeIndex(pointGraph([-122.5], [45.5]));
    expect(one.nearestNodeId(-1, 1)).toBe(1);
    const none = new DegreeSpaceNodeIndex(pointGraph([], []));
    expect(() => none.nearest(0, 0)).toThrow(/no nodes/u);
  });
});
