/**
 * A planned walking leg — `pathToSource` plus the DR-S3 cumulative-length graft
 * (plan §3.6, DR-S3 actions A1/A2/A3).
 *
 * ## What Java does, and what this replaces
 *
 * `GisAgent.step()`'s movement block carries an interpolated `Coordinate` and,
 * for every polyline vertex it consumes, calls `Geodesic.Inverse` to measure the
 * arc to the next one; the segment it lands in costs a further `Inverse` + a
 * `Direct`. DR-S3 §5 measured that literal loop at 0.323 M agent-ticks/s and the
 * graft at 1.249 M (**3.9×**), and it measured the *remaining* single `Direct`
 * at 95.3% of tick-loop wall. So the shipped path here does neither: a leg
 * carries a per-vertex cumulative-distance array, the tick loop advances a
 * scalar `travelledM`, and no geodesic is evaluated inside a tick at all. The
 * display coordinate is materialised **on demand** — at render cadence and at
 * plan/reroute time, which is where `GisAgent.java:518` reads it.
 *
 * ## Two deliberate snaps, and why neither is a fudge
 *
 * 1. Each *edge*'s final cumulative entry is already snapped to the
 *    Java-authoritative `edgeLengthM` by `buildSegmentGeometry` (DR-S3 A2).
 * 2. Within each edge the cumulative array is used only for the segments the
 *    walk actually traverses; the **junction hop** into each edge is measured
 *    live with one `Inverse`.
 *
 * ## WP7 finding: a leg is NOT as long as the route it follows
 *
 * The obvious shortcut — set the leg's total to `tree.dist[fromNode]` and
 * interpolate inside it — is wrong, and the vertical slice caught it against the
 * archive. `pathToSource` emits the **node coordinate** of `fromNode` and then,
 * per predecessor edge, `coords[len-2 … 0]`: it *skips* each edge's own endpoint
 * vertex at the junction it is entering from. Where the corrupt-node correction
 * moved a node (25 attribute ids; first-claimant wins the coordinate, and
 * reattached sites sit up to 11.9 m from it) that skipped vertex is not the
 * previous vertex, so the polyline the resident walks is a different length from
 * the sum of `edgeLengthM` that Dijkstra added up. Java measures the walk live
 * and therefore books the polyline; snapping the leg total to the routed
 * distance books the sum instead.
 *
 * Measured cost of getting this wrong, arm A / seed 42 / n = 6,842: **8 of 6,842
 * residents** walked 1.40–2.29 m further in the port than in the archive, with
 * byte-identical `planned_route_m`, `snap_gap_m`, refusal count, target and
 * arrival tick — i.e. an identical journey with a different tape measure. It is
 * small, it is systematic, and it is exactly the class of error a "close enough"
 * distance model hides. So the junction hop is measured, at a cost of one
 * `Inverse` per edge **per plan** (not per tick), and `plannedRouteM` and
 * `distanceTraveledM` are once again two different quantities, as they are in
 * the certified model.
 *
 * **Nothing here is bit-identical to a Java-derived quantity** (DR-S3 A3): the
 * within-segment interpolation carries the ~1e-9 m residual of finding S3-F2.
 * Downstream gates on `distanceTraveledM` and coordinates are tolerance
 * comparisons, and the engine must never claim otherwise.
 */

import type { GraphGeometry } from "@websim/shared/graph-asset";

import {
  geodesicDistanceM,
  WGS84,
  DIRECT_MASK_POSITION_ONLY,
  INVERSE_MASK_LENGTH_AZIMUTH,
} from "../geo/geodesic.js";
import { directedTail, type RoutingGraph } from "../graph/csr.js";
import type { SegmentGeometry } from "../graph/cumLen.js";
import type { ShortestPathTree } from "../graph/dijkstra.js";
import { pathVertexCount } from "../graph/paths.js";

/** The walking polyline of one planned leg, with distance-along baked in. */
export interface RouteLeg {
  readonly vertexCount: number;
  /** Vertex `i` is `(xy[2i], xy[2i+1])` — lon, lat (JTS convention). */
  readonly xy: Float64Array;
  /** Distance along the leg at each vertex; `cumM[0] === 0`. */
  readonly cumM: Float64Array;
  /**
   * `cumM[vertexCount - 1]` — the length of the polyline actually walked, which
   * is **not** `tree.dist[fromNode]` (see the module doc's WP7 finding).
   */
  readonly totalM: number;
}

/**
 * Build the leg from `fromNode` up `tree`'s predecessor chain, or `null` under
 * exactly the conditions `pathToSource` returns null (unreachable / broken
 * chain).
 *
 * The vertex walk is `pathToSource`'s, statement for statement — a predecessor
 * edge is oriented `predecessor → node`, Java appends `coords[len-2 … 0]`, and
 * the two orientations differ only in which way the stored polyline is read.
 * The cumulative arithmetic rides along on the same loop, which is why it cannot
 * drift out of step with the geometry.
 */
export function buildRouteLeg(
  graph: RoutingGraph,
  geometry: GraphGeometry,
  seg: SegmentGeometry,
  tree: ShortestPathTree,
  fromNode: number,
): RouteLeg | null {
  const n = pathVertexCount(graph, geometry, tree, fromNode);
  if (n < 0) {
    return null;
  }
  const xy = new Float64Array(n * 2);
  const cumM = new Float64Array(n);
  const { polyOffset, polyLon, polyLat } = geometry;
  const { segCumM } = seg;

  xy[0] = graph.nodeLon[fromNode]!;
  xy[1] = graph.nodeLat[fromNode]!;
  cumM[0] = 0;

  let w = 1;
  let base = 0;
  let prevLon = xy[0]!;
  let prevLat = xy[1]!;
  let node = fromNode;
  while (node !== tree.sourceNode) {
    const de = tree.predEdge[node]!;
    const e = de >>> 1;
    const lo = polyOffset[e]!;
    const hi = polyOffset[e + 1]!;
    if ((de & 1) === 0) {
      // Predecessor is edgeFrom: the stored polyline read backwards from hi-2.
      // The skipped vertex is poly[hi-1]; the walk enters from `prev` instead.
      const j = hi - 2;
      const entry = base + geodesicDistanceM(prevLon, prevLat, polyLon[j]!, polyLat[j]!);
      const cumAtEntry = segCumM[j]!;
      xy[2 * w] = polyLon[j]!;
      xy[2 * w + 1] = polyLat[j]!;
      cumM[w] = entry;
      w++;
      for (let i = j - 1; i >= lo; i--) {
        xy[2 * w] = polyLon[i]!;
        xy[2 * w + 1] = polyLat[i]!;
        cumM[w] = entry + (cumAtEntry - segCumM[i]!);
        w++;
      }
      prevLon = polyLon[lo]!;
      prevLat = polyLat[lo]!;
    } else {
      // Predecessor is edgeTo: the reversed copy read backwards is the stored
      // polyline read forwards from lo+1. The skipped vertex is poly[lo].
      const j = lo + 1;
      const entry = base + geodesicDistanceM(prevLon, prevLat, polyLon[j]!, polyLat[j]!);
      const cumAtEntry = segCumM[j]!;
      xy[2 * w] = polyLon[j]!;
      xy[2 * w + 1] = polyLat[j]!;
      cumM[w] = entry;
      w++;
      for (let i = j + 1; i < hi; i++) {
        xy[2 * w] = polyLon[i]!;
        xy[2 * w + 1] = polyLat[i]!;
        cumM[w] = entry + (segCumM[i]! - cumAtEntry);
        w++;
      }
      prevLon = polyLon[hi - 1]!;
      prevLat = polyLat[hi - 1]!;
    }
    base = cumM[w - 1]!;
    node = directedTail(graph, de);
  }

  return { vertexCount: n, xy, cumM, totalM: cumM[n - 1]! };
}

/**
 * `StreetNetwork.NodePath` — the node chain of a planned leg plus, for each
 * node, the index of its coordinate inside the leg's vertex array.
 *
 * Allocated **only** when a closure schedule is active
 * (`GisAgent.java:644-645`, `:735-736`), which is why every run without closures
 * carries `routeNodes === null` and `reactToClosureWave` is dead code there even
 * if the version counter somehow moved.
 *
 * `coordOffset` is what the grandfathering test `off[k] >= pathIndex` reads: it
 * is non-decreasing, `coordOffset[0] === 0` (the walker's own node), and
 * `coordOffset[nodes.length - 1] === vertexCount - 1` (the shelter's node).
 */
export interface RouteNodes {
  /** Node **indices**, `fromNode` first, tree source last. */
  readonly nodes: Int32Array;
  /** Certified node **ids** of {@link nodes} — what `isBlocked`/`pairKey` read. */
  readonly nodeIds: Int32Array;
  /** Vertex index of each node's coordinate in the leg (`RouteLeg.xy`). */
  readonly coordOffset: Int32Array;
}

/**
 * Build the {@link RouteNodes} for the same walk {@link buildRouteLeg} builds.
 *
 * Deliberately a **second pass over the same predecessor chain** rather than an
 * extra output of `buildRouteLeg`: it evaluates no geodesic and is only ever
 * called when a closure schedule exists, so the no-closures path — every
 * archived arm but the SE family — pays nothing at all for it. The offsets are
 * derived from the identical vertex accounting: each predecessor edge
 * contributes `hi - lo - 1` vertices and the LAST of them is the predecessor
 * node's own coordinate, so that vertex index is the next node's offset.
 *
 * Returns `null` under exactly the conditions `buildRouteLeg` returns `null`.
 */
export function buildRouteNodes(
  graph: RoutingGraph,
  geometry: GraphGeometry,
  tree: ShortestPathTree,
  fromNode: number,
): RouteNodes | null {
  const { polyOffset } = geometry;
  const nodes: number[] = [fromNode];
  const coordOffset: number[] = [0];
  let w = 1;
  let node = fromNode;
  let guard = 0;
  while (node !== tree.sourceNode) {
    const de = tree.predEdge[node]!;
    if (de < 0) {
      return null;
    }
    const e = de >>> 1;
    w += polyOffset[e + 1]! - polyOffset[e]! - 1;
    node = directedTail(graph, de);
    nodes.push(node);
    coordOffset.push(w - 1);
    if (++guard > graph.nodeCount) {
      return null; // a cycle in a shortest-path tree is a corrupt tree
    }
  }
  const nodeIds = new Int32Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) {
    nodeIds[i] = graph.nodeId[nodes[i]!]!;
  }
  return {
    nodes: Int32Array.from(nodes),
    nodeIds,
    coordOffset: Int32Array.from(coordOffset),
  };
}

/**
 * `pathIndex` reconstructed from the port's scalar `legTravelM` (QUIRK 26).
 *
 * Java carries `pathIndex` as a vertex counter and advances it with
 * `if (dM <= remainingM) { current = next; pathIndex++; }` — note the **`<=`**,
 * which consumes a vertex the walker lands on *exactly*. WP7's movement graft
 * replaced the counter with metres, so the index is
 * `#{ i : legApproachM + cumM[i] <= legTravelM }`.
 *
 * **The tolerance decision, made explicitly rather than by accident.** The
 * port's `cumM` and Java's per-tick geodesic re-measurement differ by the
 * documented ~1e-9 m residual (DR-S3 A3), so a walker standing exactly on a
 * junction is a knife edge. This function uses the **exact** `<=` with no
 * epsilon: an epsilon would be a second, undocumented model parameter, and the
 * only observable that reads `pathIndex` is the closure grandfathering test,
 * where being one vertex out changes whether one resident of a few hundred
 * pushes or reroutes at one wave. That is a real but bounded exposure and it is
 * recorded here rather than hidden behind a fudge factor.
 */
export function pathIndexFor(leg: RouteLeg, legApproachM: number, legTravelM: number): number {
  let lo = 0;
  let hi = leg.vertexCount - 1;
  // Monotone `cumM`, so binary-search the last index satisfying the predicate.
  if (legApproachM + leg.cumM[0]! > legTravelM) {
    return 0;
  }
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (legApproachM + leg.cumM[mid]! <= legTravelM) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo + 1;
}

/** Largest vertex index `j` with `cumM[j] <= s`, clamped to the last segment start. */
export function legVertexAt(leg: RouteLeg, s: number): number {
  let a = 0;
  let b = leg.vertexCount - 1;
  while (a < b) {
    const mid = (a + b + 1) >>> 1;
    if (leg.cumM[mid]! <= s) {
      a = mid;
    } else {
      b = mid - 1;
    }
  }
  return Math.min(a, leg.vertexCount - 2 < 0 ? 0 : leg.vertexCount - 2);
}

/** A materialised WGS84 position (lon, lat). */
export interface PositionLonLat {
  readonly lon: number;
  readonly lat: number;
}

/**
 * Interpolate a point `s` metres along the leg — one `Inverse` for the
 * containing segment's azimuth and one `Direct` for the residual arc.
 *
 * Mathematically this is the point Java's carry-forward loop would be standing
 * on (the interpolated point lies on the same geodesic), but it is **not
 * bit-equal** to it; DR-S3 finding S3-F2 puts the residual at ~1e-9 m per tick.
 * Called at render cadence and at plan/reroute time only — never inside a tick.
 */
export function positionAlongLeg(leg: RouteLeg, s: number): PositionLonLat {
  if (leg.vertexCount === 1 || s <= 0) {
    return { lon: leg.xy[0]!, lat: leg.xy[1]! };
  }
  if (s >= leg.totalM) {
    const last = leg.vertexCount - 1;
    return { lon: leg.xy[2 * last]!, lat: leg.xy[2 * last + 1]! };
  }
  const j = legVertexAt(leg, s);
  const lon1 = leg.xy[2 * j]!;
  const lat1 = leg.xy[2 * j + 1]!;
  const residual = s - leg.cumM[j]!;
  if (residual <= 0) {
    return { lon: lon1, lat: lat1 };
  }
  const lon2 = leg.xy[2 * (j + 1)]!;
  const lat2 = leg.xy[2 * (j + 1) + 1]!;
  const inv = WGS84.Inverse(lat1, lon1, lat2, lon2, INVERSE_MASK_LENGTH_AZIMUTH);
  const d = WGS84.Direct(lat1, lon1, inv.azi1, residual, DIRECT_MASK_POSITION_ONLY);
  return { lon: d.lon2, lat: d.lat2 };
}

/**
 * Interpolate `s` metres along the straight (geodesic) approach from an
 * off-network standing point to the leg's first vertex — the encampment→street
 * snap gap on the first leg, a polyline-endpoint gap after a refusal.
 */
export function positionAlongApproach(
  fromLon: number,
  fromLat: number,
  leg: RouteLeg,
  s: number,
  approachM: number,
): PositionLonLat {
  if (approachM <= 0 || s <= 0) {
    return { lon: fromLon, lat: fromLat };
  }
  if (s >= approachM) {
    return { lon: leg.xy[0]!, lat: leg.xy[1]! };
  }
  const inv = WGS84.Inverse(fromLat, fromLon, leg.xy[1]!, leg.xy[0]!, INVERSE_MASK_LENGTH_AZIMUTH);
  const d = WGS84.Direct(fromLat, fromLon, inv.azi1, s, DIRECT_MASK_POSITION_ONLY);
  return { lon: d.lon2, lat: d.lat2 };
}
