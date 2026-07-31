/**
 * Scenario-E obstacle layer (PORT_MAP §1.6, V48) — the blocked-edge set that
 * `StreetNetwork.blockEdge` / `isBlocked` maintain.
 *
 * Two Java details are load-bearing and both are reproduced here.
 *
 * 1. **Blocking is by NODE PAIR, not by street feature.** `blockEdge(a, b)`
 *    adds `b` to `blockedAdj[a]` and `a` to `blockedAdj[b]`; `isBlocked` asks
 *    `blockedAdj.get(node).contains(e.toNode)`. If two features connect the same
 *    pair of nodes, blocking that pair blocks **both** of them. A per-feature
 *    flag array would silently leave the parallel edge open.
 *
 * 2. **The `blockedAdj.isEmpty()` short-circuit is the R3 argument.** With
 *    `closuresCode = 0` nothing is ever blocked and the relaxation pays a single
 *    boolean test. {@link BlockedEdges.isEmpty} is that boolean, and
 *    `computeTree` reads it once per call rather than per relaxation.
 *
 * Internally the set is kept twice: as canonical undirected pair keys (for
 * `isBlocked` and idempotent re-blocking) and as a flag per **directed CSR
 * record** (for the relaxation, which then costs one `Uint8Array` read). Both
 * are updated together, so they cannot drift.
 */

import type { RoutingGraph } from "./csr.js";

export class BlockedEdges {
  private readonly graph: RoutingGraph;
  /** One flag per directed CSR record; 1 = this traversal is blocked. */
  private readonly flags: Uint8Array;
  /** Canonical `min:max` node-index pair keys, mirroring `blockedAdj`. */
  private readonly pairs = new Set<string>();

  public constructor(graph: RoutingGraph) {
    this.graph = graph;
    this.flags = new Uint8Array(graph.directedRecords);
  }

  /** `blockedAdj.isEmpty()` — the routing hot path's single boolean test. */
  public get isEmpty(): boolean {
    return this.pairs.size === 0;
  }

  /** Number of blocked UNDIRECTED pairs (Java's `blockedEdgeCount()`). */
  public get size(): number {
    return this.pairs.size;
  }

  /** Per-directed-record flags, for the SSSP relaxation. */
  public get directedFlags(): Uint8Array {
    return this.flags;
  }

  private static key(a: number, b: number): string {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }

  /**
   * `blockEdge(a, b)` over node **indices**. Idempotent, and — like Java —
   * accepts a pair that matches no graph edge: the pair joins the blocked set
   * and simply never fires. Returns true when at least one directed record was
   * newly flagged, which is what a closure loader's phantom census counts.
   */
  public blockPair(a: number, b: number): boolean {
    const k = BlockedEdges.key(a, b);
    if (this.pairs.has(k)) {
      return false;
    }
    this.pairs.add(k);
    let touched = false;
    touched = this.flagHalf(a, b) || touched;
    touched = this.flagHalf(b, a) || touched;
    return touched;
  }

  private flagHalf(from: number, to: number): boolean {
    const g = this.graph;
    if (from < 0 || from >= g.nodeCount) {
      return false;
    }
    const lo = g.csrOffset[from]!;
    const hi = g.csrOffset[from + 1]!;
    let any = false;
    for (let k = lo; k < hi; k++) {
      if (g.csrOther[k] === to) {
        this.flags[k] = 1;
        any = true;
      }
    }
    return any;
  }

  /** `isBlocked(a, b)` including the `isEmpty()` short-circuit, by node index. */
  public isBlocked(a: number, b: number): boolean {
    if (this.pairs.size === 0) {
      return false;
    }
    return this.pairs.has(BlockedEdges.key(a, b));
  }

  /** Canonical `min:max` key over node **ids**, as `pushedBlockages` records them. */
  public static canonicalIdKey(idA: number, idB: number): string {
    return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
  }
}
