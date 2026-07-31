/**
 * CSR typed-array routing graph — the engine-side port of
 * `geography.routing.StreetNetwork`'s materialised state (PORT_MAP §1.6,
 * plan §3.2 `graph/*`, §3.6 data structures).
 *
 * Nothing here computes geometry. Every edge weight is the Java-authoritative
 * `Float64` the offline exporter dumped and `pack-graph.ts` packed; this module
 * only re-shapes the packed asset into the arrays Dijkstra wants (plan §1.1
 * commitment 2: "edge weights are never computed in the browser").
 *
 * ## Addressing
 *
 * Nodes are addressed by **index** internally. Node *ids* are sparse (−1021 …
 * 17,023,620, including the 22 synthetic negatives the corrupt-id correction
 * minted) and only appear on output columns and in fixture comparisons.
 *
 * ## Directed edge identity — the load-bearing bit
 *
 * Java's adjacency holds two `Edge` objects per street feature: one oriented
 * `fromNode → toNode` with the polyline as loaded, and one oriented
 * `toNode → fromNode` with a reversed coordinate copy. A shortest-path tree
 * stores a reference to one of those objects, so "which predecessor edge" means
 * "which *directed* record", not merely "which feature".
 *
 * The certified identity (`CertifiedGraph.directedEdgeId`, and the
 * `predecessor_directed_edge` column of every F1 tree fixture) is
 *
 * ```
 *   directedEdgeId = featureIndex * 2 + dir      dir 0 = as loaded, 1 = reversed
 * ```
 *
 * The packed asset stores the same fact as a signed 1-based edge id in
 * `csrEntry` (`+e+1` = as loaded, `−(e+1)` = reversed), which is exactly the
 * `+`/`−` column of `graph-dump/adjacency.tsv`. {@link buildRoutingGraph}
 * converts once, so the hot loop reads `csrDirected[k]` and the feature index
 * falls out as `csrDirected[k] >>> 1`.
 *
 * ## Adjacency order
 *
 * Entries inside a node's slice stay in the certified per-node list order
 * (shapefile feature order). Dijkstra's relaxation is strict `<`, so at an exact
 * distance tie the *first-relaxed* predecessor wins — reordering adjacency would
 * leave distances untouched and silently change path geometry (PORT_MAP R12).
 */

import type { GraphTopology } from "@websim/shared/graph-asset";

/** The routing graph in the shape the SSSP and path walkers consume. */
export interface RoutingGraph {
  readonly nodeCount: number;
  readonly edgeCount: number;
  /** `csrEntry.length` — two directed records per undirected street feature. */
  readonly directedRecords: number;

  /** index → certified node id (sparse, includes the synthetic negatives). */
  readonly nodeId: Int32Array;
  readonly nodeLon: Float64Array;
  readonly nodeLat: Float64Array;

  /** feature index → endpoint node indices, in the as-loaded orientation. */
  readonly edgeFrom: Int32Array;
  readonly edgeTo: Int32Array;
  /** feature index → Java-authoritative geodesic polyline length, in metres. */
  readonly edgeLengthM: Float64Array;

  /** CSR row starts; `csrOffset[n] .. csrOffset[n+1]` is node `n`'s slice. */
  readonly csrOffset: Int32Array;
  /** Per directed record: `featureIndex * 2 + dir` (the certified identity). */
  readonly csrDirected: Int32Array;
  /** Per directed record: the neighbour node index reached by that record. */
  readonly csrOther: Int32Array;

  /** certified node id → index. Built once; `nodeIndex()` is the read path. */
  readonly nodeIndexById: ReadonlyMap<number, number>;
}

/** Feature index behind a directed edge id. */
export function edgeOfDirected(directedEdgeId: number): number {
  return directedEdgeId >>> 1;
}

/** True when the directed edge id denotes the reversed (`dir = 1`) record. */
export function isReversedDirected(directedEdgeId: number): boolean {
  return (directedEdgeId & 1) === 1;
}

/** Tail node index of a directed edge id (Java's `Edge.fromNode`). */
export function directedTail(g: RoutingGraph, directedEdgeId: number): number {
  const e = directedEdgeId >>> 1;
  return (directedEdgeId & 1) === 0 ? g.edgeFrom[e]! : g.edgeTo[e]!;
}

/** Head node index of a directed edge id (Java's `Edge.toNode`). */
export function directedHead(g: RoutingGraph, directedEdgeId: number): number {
  const e = directedEdgeId >>> 1;
  return (directedEdgeId & 1) === 0 ? g.edgeTo[e]! : g.edgeFrom[e]!;
}

/**
 * Node index for a certified node id, or −1 when the id is not in the graph.
 * `-1` rather than a throw because the Java call sites that look ids up
 * (`adjacency.get`, `distM.get`) return null and treat it as "unreachable".
 */
export function nodeIndex(g: RoutingGraph, id: number): number {
  const i = g.nodeIndexById.get(id);
  return i === undefined ? -1 : i;
}

/**
 * `hasEdge(a, b)` — PORT_MAP §1.6, the closure loader's phantom guard. Node
 * *indices*, undirected: a scheduled pair matching no graph edge blocks nothing
 * and must be reported rather than silently swallowed.
 */
export function hasEdgeBetween(g: RoutingGraph, a: number, b: number): boolean {
  if (a < 0 || b < 0 || a >= g.nodeCount) {
    return false;
  }
  const lo = g.csrOffset[a]!;
  const hi = g.csrOffset[a + 1]!;
  for (let k = lo; k < hi; k++) {
    if (g.csrOther[k] === b) {
      return true;
    }
  }
  return false;
}

function fail(msg: string): never {
  throw new Error(`routing graph: ${msg}`);
}

/**
 * Re-shape an unpacked topology container into the routing graph.
 *
 * The topology container has already validated itself against its own census
 * inside {@link import("@websim/shared/graph-asset").unpackTopology}; what is
 * checked here is only what *this* conversion could get wrong — that every
 * directed record's signed edge id is in range and that its implied endpoint
 * really is the node whose slice it sits in. That second check is what would
 * catch a `+`/`−` inversion, which is otherwise invisible until path geometry
 * diverges hundreds of ticks into a run.
 */
export function buildRoutingGraph(topology: GraphTopology): RoutingGraph {
  const { nodeCount, edgeCount, csrOffset, csrEntry, edgeFrom, edgeTo } = topology;
  const directedRecords = csrEntry.length;

  const csrDirected = new Int32Array(directedRecords);
  const csrOther = new Int32Array(directedRecords);

  for (let n = 0; n < nodeCount; n++) {
    const lo = csrOffset[n]!;
    const hi = csrOffset[n + 1]!;
    for (let k = lo; k < hi; k++) {
      const signed = csrEntry[k]!;
      if (signed === 0) {
        fail(`csr entry ${k} is 0; entries are signed 1-based edge ids`);
      }
      const forward = signed > 0;
      const e = (forward ? signed : -signed) - 1;
      if (e < 0 || e >= edgeCount) {
        fail(`csr entry ${k} references edge ${e}, out of range 0..${edgeCount - 1}`);
      }
      const tail = forward ? edgeFrom[e]! : edgeTo[e]!;
      if (tail !== n) {
        fail(
          `csr entry ${k} in node ${n}'s slice is oriented out of node ${tail}; ` +
            `the +/- direction flag is inverted or the slice is misaligned`,
        );
      }
      csrDirected[k] = e * 2 + (forward ? 0 : 1);
      csrOther[k] = forward ? edgeTo[e]! : edgeFrom[e]!;
    }
  }

  const nodeIndexById = new Map<number, number>();
  for (let i = 0; i < nodeCount; i++) {
    nodeIndexById.set(topology.nodeId[i]!, i);
  }
  if (nodeIndexById.size !== nodeCount) {
    fail(`node ids are not unique (${nodeIndexById.size} distinct of ${nodeCount})`);
  }

  return {
    nodeCount,
    edgeCount,
    directedRecords,
    nodeId: topology.nodeId,
    nodeLon: topology.nodeLon,
    nodeLat: topology.nodeLat,
    edgeFrom: topology.edgeFrom,
    edgeTo: topology.edgeTo,
    edgeLengthM: topology.edgeLengthM,
    csrOffset,
    csrDirected,
    csrOther,
    nodeIndexById,
  };
}
