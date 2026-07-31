/**
 * `engine/src/graph` — the routing layer (PORT_MAP §1.6, plan §3.2/§3.6).
 *
 * Zero RNG, fully deterministic. Load order for a run:
 *
 * ```ts
 * const topology = unpackTopology(topologyBytes);            // @websim/shared
 * const graph    = buildRoutingGraph(topology);
 * const snap     = new DegreeSpaceNodeIndex(graph);          // shelters + camps
 * const geometry = unpackGeometry(geometryBytes, topology);  // lazily fetched
 * const segments = buildSegmentGeometry(graph, geometry);    // movement graft
 * ```
 *
 * Trees are computed in exactly the two places Java computes them: once per
 * shelter at world build, and for every shelter again after each closure wave.
 * Agents never compute trees — the graph is undirected, so
 * `dist(shelter → agent) = dist(agent → shelter)` and the agent reads the
 * shelter's tree.
 */

export {
  buildRoutingGraph,
  directedHead,
  directedTail,
  edgeOfDirected,
  hasEdgeBetween,
  isReversedDirected,
  nodeIndex,
  type RoutingGraph,
} from "./csr.js";

export { BlockedEdges } from "./blocked.js";

export {
  computeTree,
  distanceTo,
  makeScratch,
  retainTree,
  type ShortestPathTree,
  type SsspScratch,
  type SsspStats,
} from "./dijkstra.js";

export {
  nodesToSource,
  pathToSource,
  pathVertexCount,
  type CoordinatePath,
  type NodePath,
} from "./paths.js";

export {
  buildSegmentGeometry,
  segmentIndexAt,
  type SegmentGeometry,
  type SegmentGeometryStats,
} from "./cumLen.js";

export {
  DegreeSpaceNodeIndex,
  hashMapTableLength,
  hashOrderKey,
  type SnapResult,
  type SnapTieKind,
} from "./strtreeSnap.js";
