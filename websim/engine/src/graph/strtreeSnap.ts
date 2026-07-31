/**
 * `StreetNetwork.nearestNode` — snap a raw lon/lat to a graph node
 * (PORT_MAP §1.6, plan §3.2 "planar degree-space STRtree NN").
 *
 * ## The metric (exact, and the only part that is bit-faithful by construction)
 *
 * Java ranks candidates with a JTS `STRtree.nearestNeighbour` whose
 * `ItemDistance` is
 *
 * ```java
 * Coordinate c1 = ((Envelope) i1.getBounds()).centre();
 * Coordinate c2 = ((Envelope) i2.getBounds()).centre();
 * return c1.distance(c2);                    // sqrt(dx*dx + dy*dy), in DEGREES
 * ```
 *
 * Every item envelope is `new Envelope(coordinate)` — a degenerate rectangle —
 * so its centre is `(x+x)/2 = x` exactly, and the metric is **planar Euclidean
 * distance in degrees**, NOT geodesic. At 45.5°N one degree of longitude is
 * ≈ 0.70 of one degree of latitude, so this snapping is anisotropic; that
 * anisotropy is certified behaviour and reproducing it is mandatory.
 * `Math.sqrt` is correctly rounded in both languages, and `dx*dx + dy*dy` is
 * the same three IEEE-754 operations, so the ranking key is bit-identical.
 *
 * The distance is compared as the **square root**, not the squared distance,
 * because that is what Java compares: two candidates at different squared
 * distances can round to the same `sqrt`, and Java would then treat them as
 * tied. Ranking on squares would silently resolve a tie Java does not have.
 *
 * ## Ties, and the one place this port cannot be bit-faithful by construction
 *
 * The certified graph contains **192 groups of nodes at bit-identical
 * coordinates** (384 nodes; every group is a pair). For a query nearest to such
 * a group, the metric cannot choose: JTS returns whichever leaf its
 * branch-and-bound reaches first, which is a function of the STR packing order,
 * which is seeded by `HashMap<Long, Coordinate>.entrySet()` iteration order in
 * `buildIndex()`. That is a JVM data-structure artefact, not geometry — and it
 * is not cosmetic: for at least two of the tie groups the two nodes sit in
 * **different components** (ids 74194/16952934 → components 1/86;
 * 73653/17014746 → components 50/86), so the tie decides whether a resident can
 * reach a shelter at all.
 *
 * This port reproduces that artefact's *mechanism* rather than guessing:
 *
 *  - `HashMap` iterates buckets in ascending index order, so an entry's position
 *    in `entrySet()` is ordered by `spread(Long.hashCode(id)) & (table − 1)`
 *    with `Long.hashCode(v) = (int)(v ^ (v >>> 32))` and
 *    `spread(h) = h ^ (h >>> 16)`.
 *  - The table length is the smallest power of two ≥ 16 for which
 *    `nodeCount <= 0.75 × table` — 131,072 for the production graph's 88,100
 *    nodes.
 *  - JTS's STR packing sorts leaf items with `Collections.sort` (stable), and
 *    coincident coordinates compare equal on both the x and the y pass, so the
 *    pair keeps its input order; both land in the same leaf, and
 *    `BoundablePair` expansion pushes them into a `PriorityQueue` at equal
 *    distance, where the earlier-inserted entry polls first.
 *
 * So: **lower bucket index wins**. That is what {@link hashOrderKey} computes.
 *
 * **Evidence, not assertion.** Across the F1 oracle (3,400 encampment reports +
 * 508 shelter rows over 13 shelter CSVs, every value produced by the certified
 * `StreetNetwork.nearestNode`): Java's answer is in this port's true
 * minimum-distance candidate set for **3,908 of 3,908** points, there are
 * **7 ties** (all encampments; the shelter files happen to hit none), and the
 * bucket rule reproduces Java on **7 of 7** — including the one case
 * (camp index 523, ids 74194 vs 16952934) where the intuitive
 * "lowest node id wins" rule gets it **wrong**, and gets it wrong across a
 * component boundary. No group in the graph has its two members in the same
 * bucket, so the rule never has to fall through.
 *
 * The fall-through is nevertheless implemented (lowest node id) and
 * {@link SnapResult.tieKind} reports which branch decided, so a future graph
 * with a genuine bucket collision degrades loudly instead of silently.
 */

import type { RoutingGraph } from "./csr.js";

/** Leaf fan-out. JTS's `STRtree` default node capacity is 10. */
const NODE_CAPACITY = 10;

/**
 * `java.util.HashMap` bucket index of a `Long` key at the table size the map
 * ends up with after `count` insertions.
 */
export function hashOrderKey(id: number, tableMask: number): number {
  // Long.hashCode(v) = (int) (v ^ (v >>> 32)). Node ids are exact within ±2^53
  // and are stored as Int32 in the asset, but the arithmetic is written over
  // BigInt so a future 64-bit id cannot silently truncate.
  const v = BigInt(id);
  const lo = Number(BigInt.asIntN(32, v));
  const hi = Number(BigInt.asIntN(32, v >> 32n));
  const h = (lo ^ hi) | 0;
  return ((h ^ (h >>> 16)) & tableMask) >>> 0;
}

/** Table length a `HashMap` reaches after `count` insertions (default 0.75 load). */
export function hashMapTableLength(count: number): number {
  let cap = 16;
  while (count > (cap * 3) / 4) {
    cap *= 2;
  }
  return cap;
}

export type SnapTieKind = "unique" | "hash-order" | "lowest-id";

export interface SnapResult {
  /** Node **index** of the chosen node. */
  readonly node: number;
  /** `sqrt(dx² + dy²)` in degrees — the certified ranking key, not a distance. */
  readonly degreeDistance: number;
  /** How many nodes were exactly tied at that key (1 = no tie). */
  readonly tiedCount: number;
  readonly tieKind: SnapTieKind;
}

interface TreeNode {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  /** For leaves: index range into `order`. For internals: range into `children`. */
  start: number;
  end: number;
  leaf: boolean;
}

/**
 * Static STR-packed R-tree over the node table, in degree space.
 *
 * Rebuilt from the packed asset at load; never mutated. Build cost on the
 * production graph is a few tens of milliseconds (one sort of 88,100 items plus
 * per-slice sorts), paid once inside the worker.
 */
export class DegreeSpaceNodeIndex {
  private readonly graph: RoutingGraph;
  private readonly order: Int32Array;
  private readonly nodes: TreeNode[];
  private readonly children: number[];
  private readonly rootIdx: number;
  private readonly tableMask: number;

  public constructor(graph: RoutingGraph) {
    this.graph = graph;
    this.tableMask = hashMapTableLength(graph.nodeCount) - 1;

    const n = graph.nodeCount;
    const order = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      order[i] = i;
    }
    // STR pack: sort by x, cut into ceil(sqrt(leafCount)) vertical slices, sort
    // each slice by y, then chunk into leaves. Deterministic and independent of
    // input order, which is exactly why the tie-break above is explicit.
    const lon = graph.nodeLon;
    const lat = graph.nodeLat;
    const idx = Array.from(order);
    idx.sort((a, b) => lon[a]! - lon[b]! || lat[a]! - lat[b]! || a - b);
    const leafCount = Math.ceil(n / NODE_CAPACITY);
    const sliceCount = Math.max(1, Math.ceil(Math.sqrt(leafCount)));
    const perSlice = Math.ceil(n / sliceCount);
    for (let s = 0; s < n; s += perSlice) {
      const slice = idx.slice(s, Math.min(n, s + perSlice));
      slice.sort((a, b) => lat[a]! - lat[b]! || lon[a]! - lon[b]! || a - b);
      for (let j = 0; j < slice.length; j++) {
        order[s + j] = slice[j]!;
      }
    }
    this.order = order;

    // Bottom-up: leaves over `order`, then internal levels over child indices.
    const nodes: TreeNode[] = [];
    const children: number[] = [];
    let level: number[] = [];
    for (let s = 0; s < n; s += NODE_CAPACITY) {
      const e = Math.min(n, s + NODE_CAPACITY);
      let minLon = Number.POSITIVE_INFINITY;
      let minLat = Number.POSITIVE_INFINITY;
      let maxLon = Number.NEGATIVE_INFINITY;
      let maxLat = Number.NEGATIVE_INFINITY;
      for (let k = s; k < e; k++) {
        const i = order[k]!;
        const x = lon[i]!;
        const y = lat[i]!;
        if (x < minLon) minLon = x;
        if (x > maxLon) maxLon = x;
        if (y < minLat) minLat = y;
        if (y > maxLat) maxLat = y;
      }
      level.push(nodes.length);
      nodes.push({ minLon, minLat, maxLon, maxLat, start: s, end: e, leaf: true });
    }
    if (level.length === 0) {
      // Empty graph: a single empty leaf keeps the search loop total.
      level.push(nodes.length);
      nodes.push({
        minLon: Number.POSITIVE_INFINITY,
        minLat: Number.POSITIVE_INFINITY,
        maxLon: Number.NEGATIVE_INFINITY,
        maxLat: Number.NEGATIVE_INFINITY,
        start: 0,
        end: 0,
        leaf: true,
      });
    }
    while (level.length > 1) {
      const next: number[] = [];
      for (let s = 0; s < level.length; s += NODE_CAPACITY) {
        const e = Math.min(level.length, s + NODE_CAPACITY);
        let minLon = Number.POSITIVE_INFINITY;
        let minLat = Number.POSITIVE_INFINITY;
        let maxLon = Number.NEGATIVE_INFINITY;
        let maxLat = Number.NEGATIVE_INFINITY;
        const start = children.length;
        for (let k = s; k < e; k++) {
          const c = nodes[level[k]!]!;
          children.push(level[k]!);
          if (c.minLon < minLon) minLon = c.minLon;
          if (c.maxLon > maxLon) maxLon = c.maxLon;
          if (c.minLat < minLat) minLat = c.minLat;
          if (c.maxLat > maxLat) maxLat = c.maxLat;
        }
        next.push(nodes.length);
        nodes.push({ minLon, minLat, maxLon, maxLat, start, end: children.length, leaf: false });
      }
      level = next;
    }
    this.nodes = nodes;
    this.children = children;
    this.rootIdx = level[0]!;
  }

  /**
   * Squared envelope-to-point gap. A valid pruning lower bound in exact
   * arithmetic *and* in IEEE-754: each component gap is a rounded subtraction
   * of a coordinate that brackets every point inside the box, and rounding is
   * monotone, so this can never exceed the squared distance to any contained
   * point.
   */
  private static boxDistSq(node: TreeNode, lon: number, lat: number): number {
    let dx = 0;
    if (lon < node.minLon) {
      dx = node.minLon - lon;
    } else if (lon > node.maxLon) {
      dx = lon - node.maxLon;
    }
    let dy = 0;
    if (lat < node.minLat) {
      dy = node.minLat - lat;
    } else if (lat > node.maxLat) {
      dy = lat - node.maxLat;
    }
    return dx * dx + dy * dy;
  }

  /**
   * Every node at the exact minimum `sqrt(dx²+dy²)`, in ascending node index.
   * Exposed because the tie *census* is evidence: a caller that wants to prove
   * a snap was unambiguous needs the whole tied set, not the winner.
   */
  public nearestCandidates(lon: number, lat: number): { nodes: number[]; degreeDistance: number } {
    let bestD = Number.POSITIVE_INFINITY;
    // Largest squared distance among the current best set. Pruning against the
    // largest (not the smallest) keeps a candidate whose squared distance
    // differs in the last bit but whose sqrt is equal — which is the set Java's
    // sqrt-valued comparator would call tied.
    let bestSq = Number.POSITIVE_INFINITY;
    let best: number[] = [];

    const lonA = this.graph.nodeLon;
    const latA = this.graph.nodeLat;
    const stack: number[] = [this.rootIdx];
    while (stack.length > 0) {
      const ni = stack.pop()!;
      const node = this.nodes[ni]!;
      if (DegreeSpaceNodeIndex.boxDistSq(node, lon, lat) > bestSq) {
        continue;
      }
      if (node.leaf) {
        for (let k = node.start; k < node.end; k++) {
          const i = this.order[k]!;
          const dx = lonA[i]! - lon;
          const dy = latA[i]! - lat;
          const sq = dx * dx + dy * dy;
          const d = Math.sqrt(sq);
          if (d < bestD) {
            bestD = d;
            bestSq = sq;
            best = [i];
          } else if (d === bestD) {
            best.push(i);
            if (sq > bestSq) {
              bestSq = sq;
            }
          }
        }
      } else {
        for (let k = node.start; k < node.end; k++) {
          stack.push(this.children[k]!);
        }
      }
    }
    best.sort((a, b) => a - b);
    return { nodes: best, degreeDistance: bestD };
  }

  /** `nearestNode(c)` with the tie decision made explicit. */
  public nearest(lon: number, lat: number): SnapResult {
    const { nodes, degreeDistance } = this.nearestCandidates(lon, lat);
    if (nodes.length === 0) {
      throw new Error("nearestNode: the graph has no nodes");
    }
    if (nodes.length === 1) {
      return { node: nodes[0]!, degreeDistance, tiedCount: 1, tieKind: "unique" };
    }
    const id = this.graph.nodeId;
    let bestNode = nodes[0]!;
    let bestKey = hashOrderKey(id[bestNode]!, this.tableMask);
    let collision = false;
    for (let k = 1; k < nodes.length; k++) {
      const cand = nodes[k]!;
      const key = hashOrderKey(id[cand]!, this.tableMask);
      if (key < bestKey) {
        bestKey = key;
        bestNode = cand;
      } else if (key === bestKey) {
        collision = true;
        if (id[cand]! < id[bestNode]!) {
          bestNode = cand;
        }
      }
    }
    return {
      node: bestNode,
      degreeDistance,
      tiedCount: nodes.length,
      tieKind: collision ? "lowest-id" : "hash-order",
    };
  }

  /** `nearestNode(c)` returning the certified node **id**, as Java does. */
  public nearestNodeId(lon: number, lat: number): number {
    return this.graph.nodeId[this.nearest(lon, lat).node]!;
  }
}
