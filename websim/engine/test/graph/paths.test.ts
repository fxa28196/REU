/**
 * `pathToSource` / `nodesToSource` — the orientation and offset arithmetic.
 *
 * The asymmetric case is the one worth building a fixture for: a predecessor
 * edge traversed in its REVERSED direction (`dir = 1`) must contribute
 * `poly[1 … n−1]` in ascending order, while a `dir = 0` edge contributes
 * `poly[n−2 … 0]` descending. Both emit `n − 1` vertices, so a wrong branch
 * produces a path of the right LENGTH with the wrong SHAPE — invisible to any
 * count-based check, and it moves every `coordOffset` consumer with it.
 */

import { describe, expect, it } from "vitest";

import type { GraphGeometry, GraphTopology } from "@websim/shared/graph-asset";

import { buildRoutingGraph } from "../../src/graph/csr.js";
import { computeTree, makeScratch } from "../../src/graph/dijkstra.js";
import { nodesToSource, pathToSource, pathVertexCount } from "../../src/graph/paths.js";

/**
 * Three nodes in a line, both features oriented AWAY from the middle node so a
 * tree rooted at node 2 must traverse feature 0 in its reversed direction:
 *
 * ```
 *   feature 0: node 1 -> node 0   poly A0 A1 A2 A3   (4 vertices)
 *   feature 1: node 1 -> node 2   poly B0 B1 B2      (3 vertices)
 * ```
 *
 * Tree from node 2: pred(1) = feature 1 reversed (dir 1), pred(0) = feature 0
 * forward (dir 0). So `pathToSource(tree, 0)` is
 * `node0coord, A1, A2, A3(=node1), B1, B2(=node2)` — 6 vertices — and
 * `coordOffset` is `[0, 3, 5]`.
 */
function lineWorld(): { topology: GraphTopology; geometry: GraphGeometry } {
  const topology: GraphTopology = {
    nodeCount: 3,
    edgeCount: 2,
    nodeId: Int32Array.from([100, 101, 102]),
    nodeLon: Float64Array.from([-122.0, -122.3, -122.5]),
    nodeLat: Float64Array.from([45.0, 45.3, 45.5]),
    edgeFrom: Int32Array.from([1, 1]),
    edgeTo: Int32Array.from([0, 2]),
    edgeLengthM: Float64Array.from([30, 20]),
    // node 0: -e0   node 1: +e0, +e1   node 2: -e1
    csrOffset: Int32Array.from([0, 1, 3, 4]),
    csrEntry: Int32Array.from([-1, 1, 2, -2]),
    census: {} as GraphTopology["census"],
    corrections: [],
  };
  const geometry: GraphGeometry = {
    edgeCount: 2,
    vertexCount: 7,
    polyOffset: Int32Array.from([0, 4, 7]),
    // feature 0 runs node1 -> node0, so poly[0] is node 1 and poly[3] is node 0.
    polyLon: Float64Array.from([-122.3, -122.2, -122.1, -122.0, -122.3, -122.4, -122.5]),
    polyLat: Float64Array.from([45.3, 45.2, 45.1, 45.0, 45.3, 45.4, 45.5]),
  };
  return { topology, geometry };
}

describe("pathToSource", () => {
  it("walks a dir-1 predecessor forwards and a dir-0 predecessor backwards", () => {
    const { topology, geometry } = lineWorld();
    const g = buildRoutingGraph(topology);
    const tree = computeTree(g, 2, makeScratch(g));

    expect(tree.predEdge[1]! >>> 1).toBe(1);
    expect(tree.predEdge[1]! & 1).toBe(1); // feature 1 traversed node2 -> node1
    expect(tree.predEdge[0]! >>> 1).toBe(0);
    expect(tree.predEdge[0]! & 1).toBe(0); // feature 0 traversed node1 -> node0

    const path = pathToSource(g, geometry, tree, 0);
    expect(path).not.toBeNull();
    expect(path!.vertexCount).toBe(6);
    expect(Array.from(path!.xy)).toEqual([
      -122.0, 45.0, // node 0's own coordinate
      -122.1, 45.1, // feature 0 walked backwards: poly[2], poly[1], poly[0]
      -122.2, 45.2,
      -122.3, 45.3,
      -122.4, 45.4, // feature 1 walked forwards from index 1: poly[5], poly[6]
      -122.5, 45.5,
    ]);
    expect(pathVertexCount(g, geometry, tree, 0)).toBe(6);
  });

  it("starts at the node coordinate, which is what makes snapGapM meaningful", () => {
    const { topology, geometry } = lineWorld();
    const g = buildRoutingGraph(topology);
    const tree = computeTree(g, 2, makeScratch(g));
    const path = pathToSource(g, geometry, tree, 0)!;
    expect(path.xy[0]).toBe(g.nodeLon[0]);
    expect(path.xy[1]).toBe(g.nodeLat[0]);
  });

  it("returns a single vertex for the source itself", () => {
    const { topology, geometry } = lineWorld();
    const g = buildRoutingGraph(topology);
    const tree = computeTree(g, 2, makeScratch(g));
    const path = pathToSource(g, geometry, tree, 2)!;
    expect(path.vertexCount).toBe(1);
    expect(Array.from(path.xy)).toEqual([-122.5, 45.5]);
  });

  it("returns null for an unreachable node", () => {
    const { topology, geometry } = lineWorld();
    const isolated: GraphTopology = {
      ...topology,
      nodeCount: 4,
      nodeId: Int32Array.from([100, 101, 102, 103]),
      nodeLon: Float64Array.from([...topology.nodeLon, -123]),
      nodeLat: Float64Array.from([...topology.nodeLat, 46]),
      csrOffset: Int32Array.from([0, 1, 3, 4, 4]),
    };
    const g = buildRoutingGraph(isolated);
    const tree = computeTree(g, 2, makeScratch(g));
    expect(pathToSource(g, geometry, tree, 3)).toBeNull();
    expect(nodesToSource(g, geometry, tree, 3)).toBeNull();
    expect(pathVertexCount(g, geometry, tree, 3)).toBe(-1);
  });
});

describe("nodesToSource", () => {
  it("produces coordOffsets that index the pathToSource polyline", () => {
    const { topology, geometry } = lineWorld();
    const g = buildRoutingGraph(topology);
    const tree = computeTree(g, 2, makeScratch(g));
    const np = nodesToSource(g, geometry, tree, 0)!;
    expect(Array.from(np.nodes)).toEqual([0, 1, 2]);
    expect(Array.from(np.coordOffset)).toEqual([0, 3, 5]);

    // The contract: coordOffset[i] indexes node i's own vertex in the path.
    const path = pathToSource(g, geometry, tree, 0)!;
    for (let i = 0; i < np.nodes.length; i++) {
      const node = np.nodes[i]!;
      const off = np.coordOffset[i]!;
      expect(path.xy[off * 2], `node ${node} lon`).toBe(g.nodeLon[node]);
      expect(path.xy[off * 2 + 1], `node ${node} lat`).toBe(g.nodeLat[node]);
    }
    // …and the last offset is the last vertex.
    expect(np.coordOffset[np.coordOffset.length - 1]).toBe(path.vertexCount - 1);
  });

  it("agrees with pathToSource on every node of a random tree", () => {
    // Structural invariant, checked without any hand-built expectation: for
    // every reachable node, every coordOffset lands on that node's coordinate.
    const { topology, geometry } = lineWorld();
    const g = buildRoutingGraph(topology);
    for (const source of [0, 1, 2]) {
      const tree = computeTree(g, source, makeScratch(g));
      for (let from = 0; from < g.nodeCount; from++) {
        const np = nodesToSource(g, geometry, tree, from)!;
        const path = pathToSource(g, geometry, tree, from)!;
        expect(np.nodes[0]).toBe(from);
        expect(np.nodes[np.nodes.length - 1]).toBe(source);
        expect(np.coordOffset[0]).toBe(0);
        expect(np.coordOffset[np.coordOffset.length - 1]).toBe(path.vertexCount - 1);
        for (let i = 0; i < np.nodes.length; i++) {
          const off = np.coordOffset[i]! * 2;
          expect(path.xy[off]).toBe(g.nodeLon[np.nodes[i]!]);
          expect(path.xy[off + 1]).toBe(g.nodeLat[np.nodes[i]!]);
        }
      }
    }
  });
});
