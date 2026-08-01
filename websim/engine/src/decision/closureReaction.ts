/**
 * `reactToClosureWave` — the push/stuck decision (V49-V51)
 * (`GisAgent.java:778-841`, WP8-SPEC-decision.md §12).
 *
 * This is the **third RNG draw site** and it reads three `DecisionConfig`
 * fields, which is why it lives with the decision layer rather than with
 * `closures/`. What belongs to `closures/` is the *wave*: blocking edges,
 * bumping the version counter and recomputing every shelter tree. What belongs
 * here is one resident's reaction to having found a blocked edge ahead of it.
 * The two meet at {@link ClosureNetworkView}.
 *
 * ## Order of operations, and the two places it is load-bearing
 *
 * `seenClosureVersion` is consumed **unconditionally, as the first statement**,
 * before the scan (QUIRK 17). A no-hit scan still burns the wave, so there is at
 * most one scan per wave per agent; moving the assignment after the `hit < 0`
 * return would make an agent re-scan the same wave on every subsequent tick and
 * turn a 685-invocation counter into a per-tick one.
 *
 * `off[k] >= pathIndex` is the **grandfathering rule**: edge `(k, k+1)` is
 * "ahead" iff the walker has not yet reached node `k`'s coordinate. Closures
 * block *entry* to a street; a walker already on it, including one caught
 * mid-street, walks out.
 *
 * ## The push rule
 *
 * ```java
 * push = thetaScaled >= pushThetaThreshold + kPush * (barrierCost + mobilityPenalty);
 * ```
 *
 * `>=`, inclusive. `barrierCost + mobilityPenalty` is summed **first**, then
 * multiplied by `kPush`, then added to the threshold — keep the
 * parenthesisation. `mobilityPenalty` is `1.0`/`0.0` from
 * `PopulationSampler.Attributes.mobilityLimited`, the *third* consumer of that
 * attribute. With the decision layer off `push` stays `false` and every blocked
 * resident reroutes; that is the declared safe degenerate.
 *
 * The archived Scenario-E runs *configured* `pushThetaThreshold = -0.25` and
 * *executed* `0.0`, because Repast's batch reader zeroes negative `"number"`
 * constants (QUIRK 23). That defect is documented and inert here: this module
 * uses whatever the config carries and never "fixes" the archived value.
 *
 * ## Exactly one draw per PUSH EVENT
 *
 * Not per blocked edge and not per wave. One gamble covers **every** currently
 * blocked ahead-edge, this wave's and earlier waves' alike — the second full
 * scan records them all into `pushedBlockages`, and `Set.add` is idempotent — so
 * a later wave never re-litigates an edge this resident already gambled on. The
 * reroute branch draws **nothing**.
 *
 * ## `pairKey` canonicalises NUMERICALLY (QUIRK 12)
 *
 * `a <= b ? a + ":" + b : b + ":" + a` compares the two `long`s, not their
 * rendered strings. Synthetic node ids are **negative** (`-1000, -1001, …` from
 * the corrupt-node correction), so `pairKey(-1000, 5)` is `"-1000:5"`; a port
 * that canonicalised by comparing the rendered strings would get that right by
 * accident and `"10" < "9"` wrong.
 */

import type { Resident } from "../agents/resident.js";
import type { PopulationAttributes } from "../agents/populationSampler.js";
import type { RouteNodes } from "../agents/route.js";
import type { DecisionConfig } from "./config.js";
import { BR, hit } from "./probe.js";

/** What the reaction needs from the street network. Supplied by `closures/`. */
export interface ClosureNetworkView {
  /** `network.getClosureVersion()`. */
  closureVersion(): number;
  /** `network.isBlocked(a, b)` over **certified node ids**, undirected. */
  isBlocked(nodeIdA: number, nodeIdB: number): boolean;
}

/** `pairKey(a, b)` — canonical order is the NUMERIC one (QUIRK 12). */
export function pairKey(a: number, b: number): string {
  return a <= b ? `${a}:${b}` : `${b}:${a}`;
}

/** `mobilityPenalty` — `1.0` for a mobility-limited resident, else `0.0`. */
export function mobilityPenalty(attributes: PopulationAttributes | null): number {
  return attributes !== null && attributes.mobilityLimited ? 1.0 : 0.0;
}

/**
 * `push = thetaScaled >= pushThetaThreshold + kPush * (barrierCost + penalty)`.
 *
 * Inclusive `>=`; the inner sum is formed before the multiplication.
 */
export function pushRuleFires(
  config: DecisionConfig,
  thetaScaled: number,
  barrierCost: number,
  penalty: number,
): boolean {
  return thetaScaled >= config.pushThetaThreshold + config.kPush * (barrierCost + penalty);
}

/**
 * `stuckUntilTick = tick + stuckDelayH * (60.0 / minutesPerTick)` — the division
 * is evaluated **first** (QUIRK 3).
 */
export function stuckUntilTickFor(
  tick: number,
  config: DecisionConfig,
  minutesPerTick: number,
): number {
  return tick + config.stuckDelayH * (60.0 / minutesPerTick);
}

/**
 * The index of the first blocked ahead-edge this resident has not already pushed
 * through, or `-1`.
 *
 * The loop **breaks** on the first hit, exactly as Java does, so `hit` is the
 * earliest such edge and not the nearest-to-anything-else.
 */
export function scanForBlockage(
  rn: RouteNodes,
  pathIndex: number,
  network: ClosureNetworkView,
  pushedBlockages: ReadonlySet<string> | null,
): number {
  const { nodeIds, coordOffset } = rn;
  for (let k = 0; k + 1 < nodeIds.length; k++) {
    const a = nodeIds[k]!;
    const b = nodeIds[k + 1]!;
    if (
      coordOffset[k]! >= pathIndex &&
      network.isBlocked(a, b) &&
      (pushedBlockages === null || !pushedBlockages.has(pairKey(a, b)))
    ) {
      return k;
    }
  }
  return -1;
}

/**
 * One resident's reaction to a closure wave.
 *
 * Mutates `a` in place and returns nothing; the caller checks `a.stuckUntilTick`
 * to decide whether to return early, exactly as `step()` does.
 *
 * @param pathIndex the **vertex** index the walker has consumed (QUIRK 26) —
 *   Java carries it as a field, the port reconstructs it from `legTravelM`
 */
export function reactToClosureWave(
  a: Resident,
  network: ClosureNetworkView,
  tick: number,
  minutesPerTick: number,
  pathIndex: number,
): void {
  // FIRST STATEMENT. A no-hit scan still burns the wave (QUIRK 17).
  a.seenClosureVersion = network.closureVersion();
  const rn = a.routeNodes!;
  const config = a.decisionConfig;

  const hitIndex = scanForBlockage(rn, pathIndex, network, a.pushedBlockages);
  if (hitIndex < 0) {
    hit(BR.SCAN_NOHIT);
    return; // remaining route untouched by this wave (or already pushed)
  }
  hit(BR.SCAN_HIT);
  a.blockagesEncountered++;

  let push = false;
  if (config !== null && a.decision !== null) {
    push = pushRuleFires(config, a.thetaScaled, a.barrierCost, mobilityPenalty(a.attributes));
  }

  const { nodeIds, coordOffset } = rn;
  if (push) {
    hit(BR.PUSH_TRUE);
    a.pushThroughs++;
    if (a.pushedBlockages === null) {
      a.pushedBlockages = new Set<string>();
    }
    // A SECOND full scan: one gamble covers every currently blocked ahead-edge.
    for (let k = 0; k + 1 < nodeIds.length; k++) {
      const x = nodeIds[k]!;
      const y = nodeIds[k + 1]!;
      if (coordOffset[k]! >= pathIndex && network.isBlocked(x, y)) {
        a.pushedBlockages.add(pairKey(x, y));
      }
    }
    hit(BR.D3);
    if (a.decisionRng!.nextDouble() < config!.pStuck) {
      hit(BR.STUCK_SET);
      a.stuckEvents++;
      a.stuckUntilTick = stuckUntilTickFor(tick, config!, minutesPerTick);
    } else {
      hit(BR.PUSH_NO_STUCK);
    }
    // The stale path is KEPT — the resident walks through the closed street.
    return;
  }

  hit(BR.PUSH_FALSE);
  a.reroutes++;
  let lastReached = 0;
  for (let k = 0; k < nodeIds.length; k++) {
    if (coordOffset[k]! < pathIndex) {
      lastReached = k;
    } else {
      break; // `coordOffset` is non-decreasing, so this is the whole prefix
    }
  }
  hit(BR.REROUTE);
  a.currentNode = rn.nodes[lastReached]!;
  a.targetShelter = null;
  a.leg = null;
  a.routeNodes = null;
  a.legTravelM = 0;
  a.legApproachM = 0;
}
