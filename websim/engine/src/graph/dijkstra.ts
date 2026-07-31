/**
 * `StreetNetwork.computeTree` — single-source shortest-path tree over the CSR
 * graph (PORT_MAP §1.6.1, plan §3.2 "Java-faithful lazy-deletion binary heap").
 *
 * Promoted from the WP2-S3 spike (`validation/spikes/perf/dijkstra.ts`, measured
 * in DR-S3 §4: 2.20–7.6 ms per full-graph tree, 46 trees in 0.12–0.17 s
 * single-threaded) with two production additions: the predecessor is recorded as
 * the certified **directed edge id**, and the blocked set arrives as a
 * {@link BlockedEdges} so the `isEmpty()` short-circuit is the same single
 * boolean Java pays.
 *
 * ## Why the heap is transcribed rather than "a" binary heap
 *
 * Java relaxes with strict `nd < old`, so at an exact distance tie the
 * **first-relaxed** predecessor wins and never yields. Which one is first
 * depends on (a) adjacency order — preserved by the packed asset — and (b) the
 * order `PriorityQueue.poll()` returns equal-key entries, which is an artefact
 * of `java.util.PriorityQueue`'s sift implementation, not of the algorithm.
 * Distances are tie-independent; path *geometry* is not (PORT_MAP R12). The sift
 * loops below are therefore a statement-for-statement transcription of
 * `java.util.PriorityQueue.siftUpUsingComparator` / `siftDownUsingComparator`:
 *
 *   - push: walk to the root while `compare(x, parent) < 0`, i.e. stop as soon
 *     as `parent <= x` — an equal-key parent stops the walk, so a later equal
 *     entry stays *below* an earlier one.
 *   - pop: promote the smaller child, choosing the **left** child when the two
 *     compare equal (`compare(left, right) > 0` is required to switch to the
 *     right), and stop as soon as `x <= child`.
 *
 * `Double.compare` and `<` agree on every value that can reach this heap:
 * distances are non-negative, finite and never `-0.0` (0.0 only at the source;
 * `0.0 + len` is `+0.0` for any non-negative `len`), which is the only region
 * where `Double.compare` differs from the primitive comparison.
 *
 * `PriorityQueue`'s array growth reorders nothing, so it has no analogue here:
 * a node is pushed at most once per successful relaxation, which bounds the heap
 * by `directedRecords + 1` and lets the scratch buffers be allocated once.
 */

import type { RoutingGraph } from "./csr.js";
import type { BlockedEdges } from "./blocked.js";

/** Reusable per-source scratch. One instance serves any number of trees. */
export interface SsspScratch {
  readonly dist: Float64Array;
  readonly predEdge: Int32Array;
  readonly heapDist: Float64Array;
  readonly heapNode: Int32Array;
}

export function makeScratch(graph: RoutingGraph): SsspScratch {
  return {
    dist: new Float64Array(graph.nodeCount),
    predEdge: new Int32Array(graph.nodeCount),
    heapDist: new Float64Array(graph.directedRecords + 1),
    heapNode: new Int32Array(graph.directedRecords + 1),
  };
}

/** Work counters — the benchmark's unit of cost, and a cheap sanity signal. */
export interface SsspStats {
  readonly settled: number;
  readonly pushes: number;
  readonly pops: number;
  readonly stalePops: number;
  readonly relaxations: number;
}

/**
 * A computed tree. `dist[i]` is `+Infinity` and `predEdge[i]` is `−1` for every
 * node Java's `distM` would simply not contain — the certified `distanceTo`
 * contract is "absent ⇒ +Infinity", so the reachable *set* is part of the
 * result, not an afterthought.
 */
export interface ShortestPathTree {
  /** Node **index** of the source (Java stores the id; convert at the edge). */
  readonly sourceNode: number;
  readonly dist: Float64Array;
  /** Certified directed edge id (`featureIndex * 2 + dir`), or −1. */
  readonly predEdge: Int32Array;
  /** `distM.size()` — nodes with a finite distance, the source included. */
  readonly reachableCount: number;
  readonly stats: SsspStats;
}

/**
 * Full-graph Dijkstra from `source` (a node **index**).
 *
 * `scratch` is overwritten; the returned tree aliases `scratch.dist` and
 * `scratch.predEdge`, so pass a fresh scratch (or copy the arrays) when more
 * than one tree must be retained — which is the normal case: the engine keeps
 * one tree per shelter (§3.6, ≈ 49 MB) for instant re-plans.
 */
export function computeTree(
  graph: RoutingGraph,
  source: number,
  scratch: SsspScratch,
  blocked?: BlockedEdges | undefined,
): ShortestPathTree {
  const { csrOffset, csrDirected, csrOther, edgeLengthM } = graph;
  const { dist, predEdge, heapDist, heapNode } = scratch;

  dist.fill(Number.POSITIVE_INFINITY);
  predEdge.fill(-1);

  // `blockedAdj.isEmpty()` is read ONCE, exactly as Java's `!blockedAdj.isEmpty()`
  // guard reads a field: a legacy (closuresCode = 0) run never touches the flags.
  const flags = blocked !== undefined && !blocked.isEmpty ? blocked.directedFlags : null;

  let heapSize = 0;
  let pushes = 0;
  let pops = 0;
  let stalePops = 0;
  let relaxations = 0;
  let settled = 0;
  let reachable = 0;

  dist[source] = 0;
  heapDist[0] = 0;
  heapNode[0] = source;
  heapSize = 1;
  pushes = 1;
  reachable = 1;

  while (heapSize > 0) {
    // ---- PriorityQueue.poll(): take the head, sift the tail down from 0 ----
    // Explicit annotations: with `noUncheckedIndexedAccess` these reads feed
    // back into the same typed arrays and TS otherwise reports TS7022.
    const d: number = heapDist[0]!;
    const u: number = heapNode[0]!;
    pops++;
    heapSize--;
    if (heapSize > 0) {
      const xd = heapDist[heapSize]!;
      const xn = heapNode[heapSize]!;
      let k = 0;
      const half = heapSize >>> 1;
      while (k < half) {
        let child = (k << 1) + 1;
        const right = child + 1;
        // Java switches to the right child only when compare(left, right) > 0,
        // so an exact tie keeps the LEFT child.
        if (right < heapSize && heapDist[child]! > heapDist[right]!) {
          child = right;
        }
        if (xd <= heapDist[child]!) {
          break;
        }
        heapDist[k] = heapDist[child]!;
        heapNode[k] = heapNode[child]!;
        k = child;
      }
      heapDist[k] = xd;
      heapNode[k] = xn;
    }

    if (d > dist[u]!) {
      stalePops++;
      continue; // stale queue entry — Java's `d > best` guard, lazy deletion
    }
    settled++;

    const lo: number = csrOffset[u]!;
    const hi: number = csrOffset[u + 1]!;
    for (let k: number = lo; k < hi; k++) {
      relaxations++;
      if (flags !== null && flags[k] !== 0) {
        continue; // a blocked street cannot carry a route
      }
      const de = csrDirected[k]!;
      const nd = d + edgeLengthM[de >>> 1]!;
      const v = csrOther[k]!;
      const old = dist[v]!;
      if (nd < old) {
        if (old === Number.POSITIVE_INFINITY) {
          reachable++;
        }
        dist[v] = nd;
        predEdge[v] = de;

        // ---- PriorityQueue.offer(): siftUp from the tail ----
        let i = heapSize++;
        while (i > 0) {
          const parent = (i - 1) >>> 1;
          if (heapDist[parent]! <= nd) {
            break; // an equal-key parent stops the walk
          }
          heapDist[i] = heapDist[parent]!;
          heapNode[i] = heapNode[parent]!;
          i = parent;
        }
        heapDist[i] = nd;
        heapNode[i] = v;
        pushes++;
      }
    }
  }

  return {
    sourceNode: source,
    dist,
    predEdge,
    reachableCount: reachable,
    stats: { settled, pushes, pops, stalePops, relaxations },
  };
}

/** `ShortestPathTree.distanceTo` — absent ⇒ `+Infinity`, by node index. */
export function distanceTo(tree: ShortestPathTree, node: number): number {
  if (node < 0 || node >= tree.dist.length) {
    return Number.POSITIVE_INFINITY;
  }
  return tree.dist[node]!;
}

/** Detach a tree from its scratch so the scratch can compute the next source. */
export function retainTree(tree: ShortestPathTree): ShortestPathTree {
  return {
    sourceNode: tree.sourceNode,
    dist: tree.dist.slice(),
    predEdge: tree.predEdge.slice(),
    reachableCount: tree.reachableCount,
    stats: tree.stats,
  };
}
