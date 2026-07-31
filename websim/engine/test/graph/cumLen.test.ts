/**
 * Cumulative segment lengths — the §3.6 movement graft, and DR-S3 action A2.
 *
 * The single behaviour that must never regress: `segCumM` at an edge's last
 * vertex is EXACTLY `edgeLengthM[e]`, bit for bit. Path totals are sums of edge
 * lengths, and the routed distance an agent is compared against was produced
 * from those same Java-authoritative lengths; if the interpolation array drifted
 * even by the 2.6e-8 m DR-S3 measured, a walked distance would no longer close
 * against a planned one.
 */

import { describe, expect, it } from "vitest";

import type { GraphGeometry, GraphTopology } from "@websim/shared/graph-asset";

import { artifactGate, describeGated } from "../../../tools/artifact-gate.js";
import { buildRoutingGraph } from "../../src/graph/csr.js";
import { buildSegmentGeometry, segmentIndexAt } from "../../src/graph/cumLen.js";
import { GRAPH_ASSET_REFS, doubleToBits, loadGraph } from "./helpers.js";

/** Two real Portland-scale polylines: a 2-vertex edge and a 5-vertex edge. */
function world(): { topology: GraphTopology; geometry: GraphGeometry } {
  const polyLon = Float64Array.from([
    -122.6, -122.59, // feature 0
    -122.59, -122.585, -122.58, -122.575, -122.57, // feature 1
  ]);
  const polyLat = Float64Array.from([45.52, 45.521, 45.521, 45.5215, 45.522, 45.5228, 45.5235]);
  const geometry: GraphGeometry = {
    edgeCount: 2,
    vertexCount: 7,
    polyOffset: Int32Array.from([0, 2, 7]),
    polyLon,
    polyLat,
  };
  const topology: GraphTopology = {
    nodeCount: 3,
    edgeCount: 2,
    nodeId: Int32Array.from([1, 2, 3]),
    nodeLon: Float64Array.from([-122.6, -122.59, -122.57]),
    nodeLat: Float64Array.from([45.52, 45.521, 45.5235]),
    edgeFrom: Int32Array.from([0, 1]),
    edgeTo: Int32Array.from([1, 2]),
    // Deliberately NOT the geodesic sum: these stand in for the Java-authoritative
    // weights, which DR-S3 S3-F2 showed our summed geodesic does not reproduce
    // bit-for-bit. The snap must land on THESE numbers.
    edgeLengthM: Float64Array.from([1234.5678901234, 2500.000000001]),
    csrOffset: Int32Array.from([0, 1, 3, 4]),
    csrEntry: Int32Array.from([1, -1, 2, -2]),
    census: {} as GraphTopology["census"],
    corrections: [],
  };
  return { topology, geometry };
}

describe("buildSegmentGeometry", () => {
  it("snaps each edge's final cumulative entry to the Java-authoritative length", () => {
    const { topology, geometry } = world();
    const g = buildRoutingGraph(topology);
    const seg = buildSegmentGeometry(g, geometry);
    for (let e = 0; e < geometry.edgeCount; e++) {
      const last = geometry.polyOffset[e + 1]! - 1;
      expect(doubleToBits(seg.segCumM[last]!), `edge ${e}`).toBe(doubleToBits(g.edgeLengthM[e]!));
    }
  });

  it("starts every edge at exactly zero and never decreases", () => {
    const { topology, geometry } = world();
    const g = buildRoutingGraph(topology);
    const seg = buildSegmentGeometry(g, geometry);
    for (let e = 0; e < geometry.edgeCount; e++) {
      const lo = geometry.polyOffset[e]!;
      const hi = geometry.polyOffset[e + 1]!;
      expect(seg.segCumM[lo]).toBe(0);
      for (let k = lo + 1; k < hi; k++) {
        expect(seg.segCumM[k]!, `edge ${e} vertex ${k}`).toBeGreaterThanOrEqual(seg.segCumM[k - 1]!);
      }
    }
  });

  it("marks each edge's last vertex with a NaN azimuth (no segment starts there)", () => {
    const { topology, geometry } = world();
    const seg = buildSegmentGeometry(buildRoutingGraph(topology), geometry);
    expect(Number.isNaN(seg.segAzi1[1]!)).toBe(true);
    expect(Number.isNaN(seg.segAzi2[1]!)).toBe(true);
    expect(Number.isNaN(seg.segAzi1[6]!)).toBe(true);
    expect(Number.isNaN(seg.segAzi1[0]!)).toBe(false);
  });

  it("reports the residual it absorbed rather than hiding it", () => {
    // DR-S3 A3: nothing downstream may claim this array is bit-identical to a
    // Java-derived quantity, so the residual is a reported number.
    const { topology, geometry } = world();
    const seg = buildSegmentGeometry(buildRoutingGraph(topology), geometry);
    expect(seg.stats.edgeCount).toBe(2);
    expect(seg.stats.vertexCount).toBe(7);
    // These stand-in lengths are nowhere near the geodesic sum, so the residual
    // is large — the point is that it is measured and surfaced, not that it is small.
    expect(seg.stats.maxResidualM).toBeGreaterThan(0);
    expect(seg.stats.bitExactEdges).toBe(0);
  });
});

describe("segmentIndexAt", () => {
  it("finds the segment containing a distance, clamped to the last segment", () => {
    const { topology, geometry } = world();
    const g = buildRoutingGraph(topology);
    const seg = buildSegmentGeometry(g, geometry);

    // A 2-vertex edge has exactly one segment, index polyOffset[0] = 0.
    expect(segmentIndexAt(geometry, seg, 0, 0)).toBe(0);
    expect(segmentIndexAt(geometry, seg, 0, g.edgeLengthM[0]!)).toBe(0);

    const lo = geometry.polyOffset[1]!;
    const hi = geometry.polyOffset[1 + 1]!;
    expect(segmentIndexAt(geometry, seg, 1, 0)).toBe(lo);
    // Just past vertex k's cumulative distance lands in segment k.
    for (let k = lo; k < hi - 1; k++) {
      expect(segmentIndexAt(geometry, seg, 1, seg.segCumM[k]!)).toBe(k);
    }
    // At or beyond the far end, clamp to the last segment start.
    expect(segmentIndexAt(geometry, seg, 1, g.edgeLengthM[1]!)).toBe(hi - 2);
    expect(segmentIndexAt(geometry, seg, 1, g.edgeLengthM[1]! * 2)).toBe(hi - 2);
  });
});

describeGated(
  artifactGate({
    gate: "engine:graph-cumlen-production",
    suite: "segment geometry on the production graph",
    evidence:
      "DR-S3 finding S3-F2 re-measured on all 109,434 production edges, and the A2 snap shown " +
      "to close it so every edge total is bit-equal to the Java-authoritative length",
    artifacts: GRAPH_ASSET_REFS,
  }),
  () => {
  it("reproduces DR-S3 finding S3-F2 and closes it with the A2 snap", () => {
    const { graph, geometry } = loadGraph();
    const seg = buildSegmentGeometry(graph, geometry);

    // The finding, re-measured rather than quoted: our geographiclib-js segment
    // sums do NOT reproduce the Java-authoritative edge length bit-for-bit.
    expect(seg.stats.edgeCount).toBe(109_434);
    expect(seg.stats.bitExactEdges).toBeGreaterThan(0);
    expect(seg.stats.bitExactEdges).toBeLessThan(seg.stats.edgeCount);
    expect(seg.stats.maxResidualM).toBeLessThan(1e-7);

    // …and the closure: after the snap, EVERY edge's cumulative length is the
    // Java length exactly, so a path total is exactly a sum of routed weights.
    let exact = 0;
    for (let e = 0; e < geometry.edgeCount; e++) {
      const last = geometry.polyOffset[e + 1]! - 1;
      if (doubleToBits(seg.segCumM[last]!) === doubleToBits(graph.edgeLengthM[e]!)) {
        exact++;
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `[WP5] segment geometry: ${seg.stats.vertexCount} vertices over ${seg.stats.edgeCount} edges; ` +
        `raw prefix sums bit-equal to the Java length on ${seg.stats.bitExactEdges}, ` +
        `within 1e-9 m on ${seg.stats.within1eMinus9}, worst residual ` +
        `${seg.stats.maxResidualM.toExponential(3)} m; after the A2 snap ${exact}/${geometry.edgeCount} ` +
        `edge totals are bit-equal`,
    );
    expect(exact).toBe(geometry.edgeCount);
  }, 300_000);
  },
);
