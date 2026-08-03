/**
 * Closure-wave shortest-path recompute: the measurement, and the decision the
 * measurement forces.
 *
 * ## What plan §3.4 asks for
 *
 * > **`sssp-pool` (min(cores−2, 4))**: closure-wave shelter-tree recomputes only
 * > — each tree a pure function of (graph, blocked set, source); results applied
 * > in shelter-CSV load order before any agent steps that tick.
 *
 * ## What the measurement says
 *
 * DR-S3 measured the wave at **0.17 s for 46 trees on one thread** against a
 * §3.6 budget of **5 s wall**, i.e. 29× headroom, and the shipped arms recompute
 * 36 rather than 46. {@link measureSsspWave} re-measures that here rather than
 * citing it, so the number is this tree's own and moves if the graph or the
 * Dijkstra does.
 *
 * ## Why no worker pool is wired in — stated plainly
 *
 * Two independent reasons, and either alone is sufficient.
 *
 * 1. **The measurement does not justify it.** A pool cannot beat its own setup:
 *    every pool worker needs the CSR, which is
 *    {@link estimatePoolTransferBytes} of typed array per worker per session
 *    (structured clone, not transfer — the main worker keeps its copy). On this
 *    graph that is ~4 MB per worker, against a whole-wave cost measured in
 *    hundreds of milliseconds that occurs at most six times in the worst-case
 *    run.
 * 2. **It could not be wired in without editing frozen code.** The recompute
 *    lives inside `ClosureRuntime.apply()`, which is `engine/src/closures/` and
 *    is bit-identity-load-bearing. Its step C is a synchronous loop bracketed by
 *    an assertion that the blocked set does not move across the pass (QUIRK 6),
 *    and the whole thing runs at FIRST_PRIORITY inside `Simulation.runUntil`,
 *    which is synchronous. Making it await a pool means making the tick loop
 *    async, i.e. re-plumbing the engine core for an optimisation the
 *    measurement says is not needed.
 *
 * So this module ships the **measurement and the seam**, not a pool. The
 * escalation ladder (plan §3.6) is unchanged and its next rung is still
 * available: if a future graph or a laptop derate pushes a wave near the 5 s
 * budget, {@link measureSsspWave} is what detects it, and widening to a pool
 * then needs a decision record and an engine-core change, in that order.
 *
 * A pool that existed here and was called from nowhere would be strictly worse
 * than not having one: this repository has already shipped one fully
 * implemented, bit-verified, uncalled layer, and the lesson was expensive.
 */

import { computeTree, makeScratch, retainTree, type ShortestPathTree, type SsspScratch } from "../graph/dijkstra.js";
import type { BlockedEdges } from "../graph/blocked.js";
import type { RoutingGraph } from "../graph/csr.js";
import type { Shelter } from "../shelters/shelter.js";

import { performanceNow } from "./build.js";

/**
 * One shelter tree per source, in source order — the same work
 * `ClosureRuntime.apply()` step C does, isolated for measurement.
 *
 * **Not a substitute for it.** The runtime's loop also assigns the trees to the
 * shelters and enforces the frozen-blocked-set invariant; this function only
 * produces trees, and nothing in the shipped run path calls it.
 */
export function computeTreesInline(
  graph: RoutingGraph,
  sources: readonly number[],
  blocked?: BlockedEdges,
  scratch?: SsspScratch,
): ShortestPathTree[] {
  const s = scratch ?? makeScratch(graph);
  const out: ShortestPathTree[] = [];
  for (const source of sources) {
    out.push(retainTree(computeTree(graph, source, s, blocked)));
  }
  return out;
}

export interface SsspWaveMeasurement {
  readonly trees: number;
  readonly repeats: number;
  readonly msPerWave: readonly number[];
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  /** Nodes reached, summed over the trees of one wave — a non-vacuity witness. */
  readonly reachableTotal: number;
  /** Plan §3.6's wall budget for one wave. */
  readonly budgetMs: number;
  /** `budgetMs / medianMs`. */
  readonly headroom: number;
}

export const CLOSURE_WAVE_BUDGET_MS = 5000;

/**
 * Time a full wave recompute, `repeats` times.
 *
 * The median is reported alongside min and max rather than a mean: one slow
 * repeat is a scheduling artefact, and a mean lets it masquerade as a cost.
 */
export function measureSsspWave(options: {
  readonly graph: RoutingGraph;
  readonly sources: readonly number[];
  readonly blocked?: BlockedEdges;
  readonly repeats?: number;
}): SsspWaveMeasurement {
  const repeats = options.repeats ?? 3;
  if (!Number.isInteger(repeats) || repeats < 1) {
    throw new RangeError(`repeats must be a positive integer, got ${repeats}`);
  }
  const scratch = makeScratch(options.graph);
  const samples: number[] = [];
  let reachableTotal = 0;
  for (let r = 0; r < repeats; r++) {
    const t0 = performanceNow();
    const trees = computeTreesInline(options.graph, options.sources, options.blocked, scratch);
    samples.push(performanceNow() - t0);
    if (r === 0) {
      for (const t of trees) {
        reachableTotal += t.reachableCount;
      }
    }
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[(sorted.length - 1) >> 1]!;
  return {
    trees: options.sources.length,
    repeats,
    msPerWave: samples,
    medianMs: median,
    minMs: sorted[0]!,
    maxMs: sorted[sorted.length - 1]!,
    reachableTotal,
    budgetMs: CLOSURE_WAVE_BUDGET_MS,
    headroom: CLOSURE_WAVE_BUDGET_MS / median,
  };
}

/** Shelter graph-node indices in CSV load order — the wave's source list. */
export function shelterSources(shelters: readonly Shelter[]): number[] {
  return shelters.map((s) => s.graphNode);
}

/**
 * Bytes a pool worker would have to receive before it could compute one tree.
 *
 * The CSR plus node coordinates: the minimum a `computeTree` call reads. It is a
 * *lower bound* on pool setup — a real pool also pays message plumbing and the
 * per-wave blocked-flag copy — and it is the number that made the decision in
 * the module doc.
 */
export function estimatePoolTransferBytes(graph: RoutingGraph): number {
  return (
    graph.csrOffset.byteLength +
    graph.csrDirected.byteLength +
    graph.csrOther.byteLength +
    graph.edgeLengthM.byteLength +
    graph.nodeId.byteLength
  );
}
