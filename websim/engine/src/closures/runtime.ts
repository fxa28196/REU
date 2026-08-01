/**
 * `ContextCreator$ClosureWave` — the Scenario-E wave, at run time
 * (`ContextCreator.java:927-972`, WP8-SPEC-closures.md §3).
 *
 * WP6 shipped the *parse* (`schedule.ts`) and WP5 shipped the *substrate*
 * (`graph/blocked.ts` + `graph/dijkstra.ts`). This module is the join: the
 * object the schedule hands to Repast at `FIRST_PRIORITY`, and the four things
 * it does when the tick arrives.
 *
 * ```java
 * public void apply() {
 *     for (long[] e : edges) {
 *         if (network.hasEdge(e[0], e[1])) {      // A. block, in FILE ORDER
 *             network.blockEdge(e[0], e[1]);
 *         }
 *     }
 *     network.bumpClosureVersion();               // B. one bump per wave
 *     int recomputed = 0;
 *     for (Shelter s : shelters) {                // C. shelter-CSV load order
 *         s.setRouteTree(network.computeTree(s.getGraphNodeId()));
 *         recomputed++;
 *     }
 *     System.out.printf(...);                     // D. one log line
 * }
 * ```
 *
 * ## Five details that are the port, not decoration
 *
 * 1. **The `hasEdge` guard is applied at APPLY time** (QUIRK 5). `blockPair`
 *    accepts any pair, so a phantom row that skipped the guard would flip
 *    {@link BlockedEdges.isEmpty}, inflate `blocked_edges_at_end` and fail
 *    gate (k) — routing-neutral, census-fatal. The guard is
 *    `closure.matchesGraphEdge`, computed at parse time by the identical
 *    predicate (`hasEdgeBetween`) over a graph that never changes, so
 *    parse-time and apply-time evaluation are provably equal;
 *    {@link ClosureRuntime.apply} re-tests it anyway because the spec allows it
 *    and a stale schedule object is then caught rather than trusted.
 * 2. **The version is bumped ONCE per wave, after every edge of that wave is in
 *    the set and before any tree is recomputed.** That ordering is what makes
 *    `dijkstra.ts`'s hoist of `!blockedAdj.isEmpty()` (one read per tree instead
 *    of one per relaxation) sound — QUIRK 6. It is checked here rather than left
 *    as a comment: {@link ClosureRuntime.apply} throws if the blocked set moves
 *    at all across the recompute pass.
 * 3. **Every shelter is recomputed, including `operating == false` ones**
 *    (QUIRK 33), in **shelter-CSV load order** — the list
 *    `ContextCreator.java:545,589` appends to unconditionally, never
 *    `context.getObjects`. Order is unobservable (Dijkstra is deterministic and
 *    RNG-free) but it is the certified order and the recompute log is
 *    reproducible only if it is kept.
 * 4. **The tree object is REPLACED; a resident's materialised leg is not**
 *    (QUIRK 34). That is the entire mechanism `reactToClosureWave` exists to
 *    adjudicate: a port that re-derived legs from `shelter.routeTree` every tick
 *    would erase the stale path and drive every closure counter to zero — which
 *    looks exactly like the (correct) archive, §0.
 * 5. **`retainTree` is mandatory.** `computeTree` hands back views over the
 *    shared scratch; a tree that outlives the next call must own its arrays.
 *
 * ## What this module deliberately does NOT do
 *
 * *No incremental re-block.* There is no delta update anywhere in the certified
 * model and the port must not invent one: `blocked.ts`'s two representations
 * exist so the full recompute stays cheap, not so a repair becomes possible. A
 * post-wave tree is the tree of the reduced graph, never a patched copy of the
 * old one (spec §4.2).
 *
 * *No SSSP worker pool.* The plan allows one; DR-S3 measured 46 trees at
 * 0.12–0.17 s single-threaded and the shipped arms recompute 36, so the whole
 * wave costs ~0.13 s at six waves per run. Correctness first — a pool is a
 * measured optimisation this work package did not need, and it would put the
 * blocked set on a boundary that item 2's assertion cannot police.
 */

import type { Shelter } from "../shelters/shelter.js";
import { nodeIndex, type RoutingGraph } from "../graph/csr.js";
import { BlockedEdges } from "../graph/blocked.js";
import { computeTree, makeScratch, retainTree, type SsspScratch } from "../graph/dijkstra.js";
import type { ClosureSchedule, ClosureWave } from "./schedule.js";

/** Thrown where the schedule cannot be executed by an integer tick loop. */
export class ClosureRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClosureRuntimeError";
  }
}

/** What one applied wave did — the fields of Java's one `printf`, as data. */
export interface ClosureWaveReport {
  /** 1-based, in the schedule's ascending-hour order. */
  readonly wave: number;
  readonly hour: number;
  readonly tick: number;
  /** `edges.size()` — the wave's row count, phantoms INCLUDED. */
  readonly rowsInWave: number;
  /** Rows that passed the `hasEdge` guard and reached `blockEdge`. */
  readonly matchingInWave: number;
  /** `network.blockedEdgeCount()` after the wave — the running distinct-pair total. */
  readonly blockedEdgeCount: number;
  /** `network.getClosureVersion()` after the wave. */
  readonly closureVersion: number;
  readonly sheltersRecomputed: number;
}

export interface ClosureRuntimeOptions {
  readonly graph: RoutingGraph;
  /**
   * The shelter list in **CSV load order**. Java's `ClosureWave` captures a live
   * reference to `shelterList`; the port takes a snapshot instead (QUIRK 39) —
   * nothing mutates the list after build, and a snapshot cannot be surprised.
   */
  readonly shelters: readonly Shelter[];
  readonly schedule: ClosureSchedule;
  /** Reused across waves; allocated here when omitted. */
  readonly scratch?: SsspScratch;
}

/**
 * The run-time half of the closures layer: the blocked set, the version
 * counter, the next-wave cursor and the SSSP scratch the recomputes share.
 *
 * One instance per {@link import("../sim.js").Simulation}. A run with
 * `closuresCode == 0` has **no instance at all** — `WorldBuildResult.closures`
 * is `null`, which is the port's `network.hasClosureSchedule()` (spec §2), and
 * every closure path is then structurally unreachable rather than merely
 * inactive.
 */
export class ClosureRuntime {
  readonly graph: RoutingGraph;
  readonly schedule: ClosureSchedule;
  readonly blocked: BlockedEdges;

  private readonly shelters: readonly Shelter[];
  private readonly scratch: SsspScratch;
  private version = 0;
  private cursor = 0;
  private readonly reports: ClosureWaveReport[] = [];

  constructor(options: ClosureRuntimeOptions) {
    this.graph = options.graph;
    this.shelters = options.shelters.slice();
    this.schedule = options.schedule;
    this.blocked = new BlockedEdges(options.graph);
    this.scratch = options.scratch ?? makeScratch(options.graph);
    assertIntegralWaveTicks(options.schedule);
  }

  /** `network.getClosureVersion()`. Starts at 0, bumped once per fired wave. */
  get closureVersion(): number {
    return this.version;
  }

  /** `network.blockedEdgeCount()` — distinct undirected pairs (§4.3, QUIRK 4). */
  get blockedEdgeCount(): number {
    return this.blocked.size;
  }

  /** Waves fired so far; `closure_version_at_end` at the end of a run (QUIRK 35). */
  get wavesApplied(): number {
    return this.cursor;
  }

  /** One {@link ClosureWaveReport} per fired wave, in fire order. */
  get waveReports(): readonly ClosureWaveReport[] {
    return this.reports;
  }

  /**
   * `network.isBlocked(a, b)` over **certified node ids** — the vocabulary the
   * closure CSV, `pairKey` and `GisAgent.routeNodes` all speak. An id that is
   * not a graph node maps to index −1 and can never be in the pair set, which
   * is Java's `blockedAdj.get(id) == null` returning false.
   */
  isBlockedByNodeId(idA: number, idB: number): boolean {
    if (this.blocked.isEmpty) {
      return false; // the `blockedAdj.isEmpty()` short-circuit, before any lookup
    }
    const a = nodeIndex(this.graph, idA);
    if (a < 0) {
      return false;
    }
    const b = nodeIndex(this.graph, idB);
    if (b < 0) {
      return false;
    }
    return this.blocked.isBlocked(a, b);
  }

  /**
   * FIRST_PRIORITY: fire every wave whose tick has arrived, in schedule order.
   *
   * The test is **`waveTick <= tick`**, not `=== tick` (spec §3.5): a wave at
   * tick 0 would otherwise be stranded before the first agent tick, and a
   * `runUntil` that skipped ticks would silently drop waves. On every committed
   * schedule the two are identical.
   *
   * The **inert flag is not consulted** (QUIRK 1). Java warns at load on
   * `hour >= endHours` but fires on `waveTick <= endTick`, i.e. `hour <=
   * endHours`, so a wave at exactly the run end is warned as inert *and fires*.
   * Skipping it would be a silent one-hour divergence and would break gate (k)'s
   * `closure_version_at_end == wave count`. The run window is enforced by the
   * caller's tick loop, which is where Java enforces it.
   *
   * @returns the waves fired on this call, oldest first
   */
  applyDueWaves(tick: number): readonly ClosureWaveReport[] {
    const waves = this.schedule.waves;
    let fired: ClosureWaveReport[] | null = null;
    while (this.cursor < waves.length && waves[this.cursor]!.tick <= tick) {
      const report = this.apply(waves[this.cursor]!);
      this.cursor++;
      (fired ??= []).push(report);
    }
    return fired ?? EMPTY_REPORTS;
  }

  /**
   * `ClosureWave.apply()` — steps A, B, C and D of §3.3, in that order.
   *
   * Public so a fixture can drive one wave without a tick loop; the run loop
   * reaches it through {@link applyDueWaves}, which is the only thing that
   * advances the cursor.
   */
  apply(wave: ClosureWave): ClosureWaveReport {
    // --- A. block, in FILE ORDER within the wave ---------------------------
    let matching = 0;
    for (const edge of wave.edges) {
      // The guard (QUIRK 5). `matchesGraphEdge` is the parse-time evaluation of
      // `hasEdge(a, b)` over an immutable graph; re-testing the indices costs
      // nothing and catches a schedule parsed against a different graph.
      if (!edge.matchesGraphEdge) {
        continue;
      }
      if (edge.indexA < 0 || edge.indexB < 0) {
        throw new ClosureRuntimeError(
          `closure ${edge.nodeA}-${edge.nodeB} claims to match a graph edge but resolves to ` +
            `indices ${edge.indexA}/${edge.indexB}: the schedule was parsed against a ` +
            "different graph than the one this runtime holds",
        );
      }
      // Writes BOTH halves and flags EVERY matching CSR record, so parallel
      // features between the same pair are all blocked (QUIRK 7, QUIRK 8).
      this.blocked.blockPair(edge.indexA, edge.indexB);
      matching++;
    }

    // --- B. bump, once, after every edge and before every tree -------------
    this.version++;

    // --- C. recompute every shelter tree, in shelter-CSV load order --------
    //
    // QUIRK 6's invariant, written as a check rather than as a comment.
    // `computeTree` reads `BlockedEdges.isEmpty` ONCE per call — the hoist of
    // Java's per-relaxation `!blockedAdj.isEmpty() &&` — so the blocked set must
    // be complete before the first tree and frozen until the last. A future
    // "incremental re-block" optimisation would break that silently; this
    // comparison turns it into a throw. `size` is the distinct-pair count, so it
    // moves on any successful `blockPair`.
    const frozenAt = this.blocked.size;
    let recomputed = 0;
    for (const shelter of this.shelters) {
      shelter.routeTree = retainTree(
        computeTree(this.graph, shelter.graphNode, this.scratch, this.blocked),
      );
      recomputed++;
    }
    if (this.blocked.size !== frozenAt) {
      throw new ClosureRuntimeError(
        `the blocked set was mutated during the recompute pass (${frozenAt} -> ` +
          `${this.blocked.size} pairs): computeTree reads BlockedEdges.isEmpty once per call, ` +
          "so every edge of a wave must be blocked before the first tree is recomputed",
      );
    }

    // --- D. the report Java prints as one line -----------------------------
    const report: ClosureWaveReport = {
      wave: this.reports.length + 1,
      hour: wave.hour,
      tick: wave.tick,
      rowsInWave: wave.edges.length,
      matchingInWave: matching,
      blockedEdgeCount: this.blocked.size,
      closureVersion: this.version,
      sheltersRecomputed: recomputed,
    };
    this.reports.push(report);
    return report;
  }

  /** `[Closures] wave at hour …` — Java's line, for a console/provenance sink. */
  static formatWaveLog(r: ClosureWaveReport): string {
    return (
      `[Closures] wave at hour ${r.hour}: +${r.rowsInWave} edges blocked ` +
      `(${r.blockedEdgeCount} undirected total); ${r.sheltersRecomputed} shelter trees ` +
      `recomputed; closure version now ${r.closureVersion}`
    );
  }
}

const EMPTY_REPORTS: readonly ClosureWaveReport[] = Object.freeze([]);

/**
 * QUIRK 3: `hour * ticksPerHour` is a `double` and Repast executes fractional
 * ticks; this engine's integer tick loop cannot. Every certified config pins
 * `minutesPerTick = 1.0`, so the port **throws at build** rather than rounding —
 * rounding would move a wave by up to half a tick with no diagnostic.
 */
export function assertIntegralWaveTicks(schedule: ClosureSchedule): void {
  for (const wave of schedule.waves) {
    if (!Number.isInteger(wave.tick)) {
      throw new ClosureRuntimeError(
        `${schedule.csvPath}: wave at hour ${wave.hour} lands on tick ${wave.tick}, which is not ` +
          "an integer. Repast executes fractional ticks and this engine's tick loop cannot; " +
          "a non-integral minutesPerTick needs a tick-loop redesign, not a rounding rule " +
          "(WP8-SPEC-closures.md QUIRK 3).",
      );
    }
  }
}
