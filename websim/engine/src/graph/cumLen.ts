/**
 * Per-edge cumulative segment lengths — the plan §3.6 movement graft.
 *
 * Java's `GisAgent.step()` movement block calls `Geodesic.Inverse` once per
 * polyline vertex it consumes and then `Inverse` + `Direct` for the partial
 * segment it lands in. DR-S3 §5 measured that literal loop at 0.323 M
 * agent-ticks/s against 1.249 M for the graft — **3.9×**, the difference
 * between the default preset missing its 60 s budget outright (~134 s) and
 * making it. Precomputing the prefix sums here is what removes those calls: a
 * tick's vertex consumption becomes array arithmetic and the only geodesic call
 * left is one `Direct` for the final partial segment.
 *
 * ## DR-S3 action A2 — why the last entry is overwritten
 *
 * DR-S3 finding S3-F2: summing our `geographiclib-js` `Inverse` segment lengths
 * reproduces the Java-authoritative edge length **bit-exactly for only 5,848 of
 * 109,434 edges**; 81,560 agree within 1e-9 m and the worst disagreement is
 * 2.598e-8 m (26 nanometres). Routing never sees this — Dijkstra weights come
 * from `edgeLengthM` and are never recomputed — but a path *total* built by
 * summing our prefix arrays would drift from the routed distance.
 *
 * So each edge's final cumulative entry is **snapped to `edgeLengthM[e]`**. The
 * effect: `segCumM[last] − segCumM[first]` is exactly the Java edge length for
 * every edge, path totals stay exactly Java-consistent, and the (sub-nanometre)
 * residual lands inside the last segment where it is ~9 orders of magnitude
 * below the plan's "walked ≤ planned + snap + 200 m" bound.
 *
 * **This array is therefore NOT bit-identical to any Java-derived quantity, and
 * nothing downstream may claim it is.** DR-S3 action A3 states the consequence:
 * WP7's per-agent `distanceTraveledM` and coordinate gates are tolerance
 * comparisons, never bit-identity comparisons. {@link SegmentGeometryStats}
 * carries the measured residuals so that tolerance is a reported number rather
 * than an assumption.
 */

import type { GraphGeometry } from "@websim/shared/graph-asset";

import { INVERSE_MASK_LENGTH_AZIMUTH, WGS84 } from "../geo/geodesic.js";
import type { RoutingGraph } from "./csr.js";

export interface SegmentGeometryStats {
  /** Edges whose raw prefix sum was already bit-equal to `edgeLengthM`. */
  readonly bitExactEdges: number;
  /** Edges whose raw prefix sum was within 1e-9 m of `edgeLengthM`. */
  readonly within1eMinus9: number;
  /**
   * Largest |prefix sum − edgeLengthM| over all edges, in metres. This is also
   * the largest correction the A2 snap absorbs into a final segment, and is the
   * number any downstream tolerance on within-edge interpolation must clear.
   */
  readonly maxResidualM: number;
  readonly edgeCount: number;
  readonly vertexCount: number;
}

export interface SegmentGeometry {
  /**
   * Distance along the edge, in metres, at each polyline vertex. Indexed by the
   * geometry's own vertex numbering: `segCumM[polyOffset[e]] === 0` and
   * `segCumM[polyOffset[e+1] − 1] === edgeLengthM[e]` exactly.
   */
  readonly segCumM: Float64Array;
  /** Forward azimuth of segment `k → k+1`; each edge's last vertex holds NaN. */
  readonly segAzi1: Float64Array;
  /** Arrival azimuth at `k+1` of segment `k → k+1`; last vertex holds NaN. */
  readonly segAzi2: Float64Array;
  readonly stats: SegmentGeometryStats;
}

const cmpBuf = new ArrayBuffer(16);
const cmpF64 = new Float64Array(cmpBuf);
const cmpU32 = new Uint32Array(cmpBuf);

function sameBits(a: number, b: number): boolean {
  cmpF64[0] = a;
  cmpF64[1] = b;
  return cmpU32[0] === cmpU32[2] && cmpU32[1] === cmpU32[3];
}

/**
 * Build the cumulative-length + azimuth arrays for every edge.
 *
 * Cost, measured in DR-S3 §3 on the production graph: 530–612 ms for 550,142
 * `Inverse` calls over 659,576 vertices — a one-time load cost inside the same
 * worker that already pays the 49 ms brotli decode, comfortably inside the 1 s
 * parse acceptance.
 */
export function buildSegmentGeometry(
  graph: RoutingGraph,
  geometry: GraphGeometry,
): SegmentGeometry {
  const { polyOffset, polyLon, polyLat, edgeCount, vertexCount } = geometry;
  const segCumM = new Float64Array(vertexCount);
  const segAzi1 = new Float64Array(vertexCount);
  const segAzi2 = new Float64Array(vertexCount);

  let bitExactEdges = 0;
  let within1eMinus9 = 0;
  let maxResidualM = 0;

  for (let e = 0; e < edgeCount; e++) {
    const lo = polyOffset[e]!;
    const hi = polyOffset[e + 1]!;
    segCumM[lo] = 0;
    let acc = 0;
    for (let k = lo; k + 1 < hi; k++) {
      const r = WGS84.Inverse(
        polyLat[k]!,
        polyLon[k]!,
        polyLat[k + 1]!,
        polyLon[k + 1]!,
        INVERSE_MASK_LENGTH_AZIMUTH,
      );
      segAzi1[k] = r.azi1;
      segAzi2[k] = r.azi2;
      acc += r.s12;
      segCumM[k + 1] = acc;
    }
    segAzi1[hi - 1] = Number.NaN;
    segAzi2[hi - 1] = Number.NaN;

    const authoritative = graph.edgeLengthM[e]!;
    const residual = Math.abs(acc - authoritative);
    if (residual > maxResidualM) {
      maxResidualM = residual;
    }
    if (sameBits(acc, authoritative)) {
      bitExactEdges++;
    }
    if (residual <= 1e-9) {
      within1eMinus9++;
    }

    // DR-S3 action A2: snap the final entry so path totals stay exactly
    // Java-consistent; the residual lands inside the last segment.
    segCumM[hi - 1] = authoritative;
  }

  return {
    segCumM,
    segAzi1,
    segAzi2,
    stats: {
      bitExactEdges,
      within1eMinus9,
      maxResidualM,
      edgeCount,
      vertexCount,
    },
  };
}

/**
 * Index of the segment containing `travelledM` within edge `e`: the largest
 * vertex index `k` with `segCumM[k] <= travelledM`, clamped to the edge's last
 * *segment* start. Binary search — the movement loop calls this only when it
 * crosses out of its cached segment.
 */
export function segmentIndexAt(
  geometry: GraphGeometry,
  seg: SegmentGeometry,
  edge: number,
  travelledM: number,
): number {
  const lo = geometry.polyOffset[edge]!;
  const hi = geometry.polyOffset[edge + 1]!;
  let a = lo;
  let b = hi - 1; // last vertex; the last valid segment START is hi - 2
  while (a < b) {
    const mid = (a + b + 1) >>> 1;
    if (seg.segCumM[mid]! <= travelledM) {
      a = mid;
    } else {
      b = mid - 1;
    }
  }
  return Math.min(a, hi - 2);
}
