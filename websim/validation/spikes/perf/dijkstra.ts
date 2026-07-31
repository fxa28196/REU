/**
 * SPIKE WP2-S3 — binary-heap Dijkstra SSSP over the CSR graph.
 *
 * Shape is faithful to PORT_MAP §1.6.1 (`StreetNetwork.computeTree`):
 *   - binary min-heap priority queue keyed on distance, LAZY DELETION
 *     (stale entries popped and discarded, never decrease-key'd)
 *   - strict `nd < dist[v]` relaxation: at an exact tie the FIRST-relaxed
 *     predecessor wins, which is why adjacency stays in certified feature order
 *   - the `blockedAdj.isEmpty()` short-circuit is modelled by `blocked`:
 *     pass `null` for the legacy/no-closure path (zero per-relaxation cost),
 *     pass a per-feature flag array for post-wave recomputes, which is the case
 *     the 46-SSSP closure-wave budget actually has to pay for.
 *
 * NOT claimed here: pop-order identity with `java.util.PriorityQueue` at exact
 * key ties. Distances are tie-independent; path *geometry* is not (R12). Proving
 * that is WP5's job against Java tree dumps — this spike measures cost only.
 */

export interface SsspScratch {
  dist: Float64Array;
  predEdge: Int32Array;
  heapDist: Float64Array;
  heapNode: Int32Array;
}

export function makeScratch(nodeCount: number, directedRecords: number): SsspScratch {
  return {
    dist: new Float64Array(nodeCount),
    predEdge: new Int32Array(nodeCount),
    // A node is pushed at most once per successful relaxation; plus the source.
    heapDist: new Float64Array(directedRecords + 1),
    heapNode: new Int32Array(directedRecords + 1),
  };
}

export interface SsspResult {
  settled: number;
  pushes: number;
  pops: number;
  stalePops: number;
  relaxations: number;
}

/**
 * Full-graph shortest-path tree from `source` (a node INDEX, not a node id).
 * Writes into `scratch.dist` / `scratch.predEdge`; unreachable stays +Infinity /
 * -1. Returns work counters so the benchmark can report cost per unit of work.
 */
export function computeTree(
  adjOffset: Int32Array,
  adjEdge: Int32Array,
  adjOther: Int32Array,
  edgeLenM: Float64Array,
  source: number,
  scratch: SsspScratch,
  blocked: Uint8Array | null = null,
): SsspResult {
  const { dist, predEdge, heapDist, heapNode } = scratch;
  dist.fill(Number.POSITIVE_INFINITY);
  predEdge.fill(-1);

  let heapSize = 0;
  let pushes = 0;
  let pops = 0;
  let stalePops = 0;
  let relaxations = 0;
  let settled = 0;

  dist[source] = 0;
  heapDist[0] = 0;
  heapNode[0] = source;
  heapSize = 1;
  pushes = 1;

  while (heapSize > 0) {
    // --- pop min ---
    const d: number = heapDist[0]!;
    const u: number = heapNode[0]!;
    pops++;
    heapSize--;
    if (heapSize > 0) {
      const md = heapDist[heapSize]!;
      const mn = heapNode[heapSize]!;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= heapSize) break;
        const r = l + 1;
        const c = r < heapSize && heapDist[r]! < heapDist[l]! ? r : l;
        if (heapDist[c]! >= md) break;
        heapDist[i] = heapDist[c]!;
        heapNode[i] = heapNode[c]!;
        i = c;
      }
      heapDist[i] = md;
      heapNode[i] = mn;
    }

    if (d > dist[u]!) {
      stalePops++;
      continue; // lazy deletion
    }
    settled++;

    // --- relax ---
    const lo: number = adjOffset[u]!;
    const hi: number = adjOffset[u + 1]!;
    for (let k: number = lo; k < hi; k++) {
      relaxations++;
      const e = adjEdge[k]!;
      if (blocked !== null && blocked[e] !== 0) continue;
      const v = adjOther[k]!;
      const nd = d + edgeLenM[e]!;
      if (nd < dist[v]!) {
        dist[v] = nd;
        predEdge[v] = e;
        // --- push (sift up) ---
        let i = heapSize++;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (heapDist[p]! <= nd) break;
          heapDist[i] = heapDist[p]!;
          heapNode[i] = heapNode[p]!;
          i = p;
        }
        heapDist[i] = nd;
        heapNode[i] = v;
        pushes++;
      }
    }
  }

  return { settled, pushes, pops, stalePops, relaxations };
}
