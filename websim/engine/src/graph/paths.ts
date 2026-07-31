/**
 * `StreetNetwork.pathToSource` / `nodesToSource` (PORT_MAP §1.6.1).
 *
 * Both walk the same predecessor chain from an arbitrary node up to the tree's
 * source, and the *relationship between them* is what matters downstream:
 * `coordOffset[i]` is the index, in the coordinate path, of the vertex that is
 * node `i`. That is what decides whether a closed street is "ahead" of a walker
 * — edge `(k, k+1)` is ahead iff `coordOffset[k] >= pathIndex` — so a
 * one-vertex error here silently changes who reroutes and who is grandfathered
 * (PORT_MAP §1.6.3).
 *
 * ## The orientation detail that the offsets hang on
 *
 * A predecessor edge is oriented `predecessor → node`. Java appends
 * `e.coords[len-2 … 0]`, i.e. it walks that edge *backwards*, contributing
 * `coords.length − 1` vertices and stopping one short so the shared junction
 * vertex is not emitted twice.
 *
 * `e.coords` is the feature polyline for a `dir = 0` record and a **reversed
 * copy** for `dir = 1`. Written in terms of the single stored polyline
 * `poly[0 … n−1]` (oriented `edgeFrom → edgeTo`), the same walk is:
 *
 * ```
 *   dir 0 (predecessor = edgeFrom):  poly[n−2], poly[n−3], …, poly[0]
 *   dir 1 (predecessor = edgeTo):    poly[1],   poly[2],   …, poly[n−1]
 * ```
 *
 * Both emit `n − 1` vertices and both end on the predecessor's own endpoint,
 * which is why the offset arithmetic (`coordIndex += n − 1`) is identical for
 * the two cases.
 *
 * The first vertex of the path is the **node coordinate** of `fromNode`, which
 * may differ from the raw point the caller snapped — that difference is exactly
 * the `snapGapM` the agent layer accumulates.
 */

import type { GraphGeometry } from "@websim/shared/graph-asset";

import type { RoutingGraph } from "./csr.js";
import { directedTail } from "./csr.js";
import type { ShortestPathTree } from "./dijkstra.js";

/** Coordinate path, lon/lat interleaved: vertex `i` is `(xy[2i], xy[2i+1])`. */
export interface CoordinatePath {
  readonly vertexCount: number;
  readonly xy: Float64Array;
}

/** Java's `NodePath`: the node chain plus each node's index into the polyline. */
export interface NodePath {
  /** Node **indices**, `fromNode … tree.sourceNode`. */
  readonly nodes: Int32Array;
  /** `coordOffset[i]` = index of `nodes[i]`'s vertex in the coordinate path. */
  readonly coordOffset: Int32Array;
}

/**
 * Number of vertices `pathToSource` would produce, or −1 when unreachable.
 * Exists so a caller can size a buffer without walking the chain twice.
 */
export function pathVertexCount(
  graph: RoutingGraph,
  geometry: GraphGeometry,
  tree: ShortestPathTree,
  fromNode: number,
): number {
  if (fromNode < 0 || fromNode >= graph.nodeCount || !Number.isFinite(tree.dist[fromNode]!)) {
    return -1;
  }
  let total = 1;
  let node = fromNode;
  while (node !== tree.sourceNode) {
    const de = tree.predEdge[node]!;
    if (de < 0) {
      return -1; // defensive: broken tree, mirroring Java's null return
    }
    const e = de >>> 1;
    total += geometry.polyOffset[e + 1]! - geometry.polyOffset[e]! - 1;
    node = directedTail(graph, de);
  }
  return total;
}

/**
 * `pathToSource(tree, fromNode)` — the walking polyline, or `null` when the
 * node is unreachable or the chain is broken.
 */
export function pathToSource(
  graph: RoutingGraph,
  geometry: GraphGeometry,
  tree: ShortestPathTree,
  fromNode: number,
): CoordinatePath | null {
  const n = pathVertexCount(graph, geometry, tree, fromNode);
  if (n < 0) {
    return null;
  }
  const xy = new Float64Array(n * 2);
  let w = 0;
  xy[w++] = graph.nodeLon[fromNode]!;
  xy[w++] = graph.nodeLat[fromNode]!;

  let node = fromNode;
  while (node !== tree.sourceNode) {
    const de = tree.predEdge[node]!;
    const e = de >>> 1;
    const lo = geometry.polyOffset[e]!;
    const hi = geometry.polyOffset[e + 1]!;
    if ((de & 1) === 0) {
      // predecessor is edgeFrom: walk the stored polyline backwards from n-2.
      for (let i = hi - 2; i >= lo; i--) {
        xy[w++] = geometry.polyLon[i]!;
        xy[w++] = geometry.polyLat[i]!;
      }
    } else {
      // predecessor is edgeTo: the reversed copy walked backwards is the stored
      // polyline walked forwards from index 1.
      for (let i = lo + 1; i < hi; i++) {
        xy[w++] = geometry.polyLon[i]!;
        xy[w++] = geometry.polyLat[i]!;
      }
    }
    node = directedTail(graph, de);
  }
  return { vertexCount: n, xy };
}

/**
 * `nodesToSource(tree, fromNode)` — the node chain with coordinate offsets, or
 * `null` under exactly the conditions `pathToSource` returns null.
 */
export function nodesToSource(
  graph: RoutingGraph,
  geometry: GraphGeometry,
  tree: ShortestPathTree,
  fromNode: number,
): NodePath | null {
  if (fromNode < 0 || fromNode >= graph.nodeCount || !Number.isFinite(tree.dist[fromNode]!)) {
    return null;
  }
  const nodes: number[] = [fromNode];
  const offsets: number[] = [0];
  let coordIndex = 0;
  let node = fromNode;
  while (node !== tree.sourceNode) {
    const de = tree.predEdge[node]!;
    if (de < 0) {
      return null; // defensive: broken tree (mirrors pathToSource)
    }
    const e = de >>> 1;
    coordIndex += geometry.polyOffset[e + 1]! - geometry.polyOffset[e]! - 1;
    node = directedTail(graph, de);
    nodes.push(node);
    offsets.push(coordIndex);
  }
  return { nodes: Int32Array.from(nodes), coordOffset: Int32Array.from(offsets) };
}
