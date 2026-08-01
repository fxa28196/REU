/**
 * `chooseShelterByUtility` — the L1 destination choice (V43)
 * (`GisAgent.java:693-743`, WP8-SPEC-decision.md §7).
 *
 * L1 is the regime in which the resident knows *where* shelters are and not
 * *how full* they are. The whole difference from `chooseNetworkNearestShelter`
 * is that there is **no `hasSpaceFor` filter**: live occupancy is the omniscience
 * L1 removes, and fullness is discovered at the door. Deleting the belief filter
 * or adding a space filter each turn L1 back into L0 while still passing every
 * aggregate that does not resolve individual doors.
 *
 * ## The filter, in exact order
 *
 * 1. `!operating` → skip.  2. `!isOpenAt(tick)` → skip.  3. `routeTree === null`
 * → skip.  4. non-finite tree distance → skip.  5. **`anyReachable = true` is
 * set HERE**, after reachability and *before* the belief filter — that is what
 * keeps `REFUSED_ALL_FULL` ("everywhere I'd try is used up") and `UNREACHABLE`
 * ("nothing is on my component") distinguishable.  6. `believedFull` → skip.
 *
 * ## The utility
 *
 * ```
 * cap_j     = capacity == null ? 10000.0 : capacity
 * walkTimeH = dM / (ownSpeedMps * 3600.0)          // multiply FIRST (QUIRK 3)
 * V_j       = -betaTravelTime * walkTimeH + betaCapacityPrior * ln(max(1.0, cap_j))
 * ```
 *
 * `dM` is the **routed network distance** from `currentNodeId`, not the polyline
 * the resident will actually walk (`route.ts`'s "a leg is NOT as long as the
 * route it follows"). `ownSpeedMps` is the **group-pace-adjusted** speed from
 * block 3, not `attributes.walkingSpeedMps`. `Math.max(1.0, cap)` floors the log
 * argument so `ln` is never negative and never `-Infinity` at a zero-capacity
 * site. With `betaCapacityPrior = 0.0` the second term is `0.0 * ln(...) = 0.0`
 * for any finite log, so the rule reduces **exactly** to nearest-reachable-by-
 * time — which is still not `chooseNetworkNearestShelter`, because the space
 * filter is gone and the tie-break differs.
 *
 * ## The one place this module is NOT bit-equal to the archived Java
 *
 * `Math.log` is a JDK 17 intrinsic and `fdlibmLog` is `StrictMath`, so the
 * `ln(max(1, cap))` term can differ in its last ulp — and because `v` is a
 * *difference* of two terms of similar size, the cancellation amplifies that
 * into tens of ulps **of `v`**. `oracle.trace.test.ts` bounds the deviation by
 * two ulps of the ln term rather than by a flat ulp count on `v`, which is the
 * only bound that stays meaningful under the cancellation: 99.71 % of the 22,747
 * dumped candidate utilities are bit-equal and the largest deviation is 16 ulp
 * of `v`, all of it attributable to `ln`. `walkTimeH`, `dM` and `cap` are exact.
 *
 * ## The tie-break, and the three edge cases inside it
 *
 * ```java
 * if (v > bestV || (v == bestV && best != null && shelter.getId().compareTo(best.getId()) < 0))
 * ```
 *
 * Worked through, the running comparison computes **the lexicographically
 * smallest id among the argmax set**, and is therefore *independent of iteration
 * order* — unlike L0, whose strict `<` makes iteration order the tie-break
 * (QUIRK 14). Both must be implemented as written; making them consistent breaks
 * one of them.
 *
 * - the `best != null` guard means a first candidate whose `v` is
 *   `-Infinity` is **not** selected (`v > bestV` false, `v == bestV` true, `best`
 *   null), and if it is the only candidate the resident becomes
 *   `REFUSED_ALL_FULL` — `anyReachable` was already true;
 * - `v === NaN` makes both `>` and `===` false in JS exactly as in Java, so a
 *   NaN-utility site is never selected and the resident again falls to
 *   `REFUSED_ALL_FULL` rather than `UNREACHABLE` (QUIRK 8). A `Math.max`-based
 *   or `sort()`-based rewrite loses this;
 * - `String.compareTo(...) < 0` is JS `a < b` on the two ids. **Never
 *   `localeCompare`** (QUIRK 6): both Java and JS compare UTF-16 code units,
 *   while `Intl.Collator` is locale- and ICU-version-dependent and would reorder
 *   e.g. `"A-10"` vs `"A-2"` differently on different platforms.
 */

import type { GraphGeometry } from "@websim/shared/graph-asset";

import { buildRouteLeg, buildRouteNodes } from "../agents/route.js";
import type { Resident } from "../agents/resident.js";
import { UNCAPPED_CAPACITY_PRIOR } from "../agents/stateMachine.js";
import type { RoutingGraph } from "../graph/csr.js";
import type { SegmentGeometry } from "../graph/cumLen.js";
import { fdlibmLog } from "../mathx/index.js";
import type { Shelter } from "../shelters/shelter.js";
import type { DecisionConfig } from "./config.js";
import { BR, hit } from "./probe.js";

/** The world state both choosers read. `StepWorld` satisfies this structurally. */
export interface ChooserWorld {
  readonly graph: RoutingGraph;
  readonly geometry: GraphGeometry;
  readonly seg: SegmentGeometry;
  /** Shelter objects in **CSV load order** — the L0 tie-break order. */
  readonly shelters: readonly Shelter[];
  /**
   * `network.hasClosureSchedule()` — gates the `routeNodes` allocation.
   * Optional, and absent means "no schedule", which is every archived arm
   * outside the SE family (see `StepWorld`'s note on the same four hooks).
   */
  readonly hasClosureSchedule?: boolean;
  /** `network.getClosureVersion()`; a freshly planned path is already wave-aware. */
  closureVersion?(): number;
}

/** `cap_j` — `UNCAPPED_CAPACITY_PRIOR` for a capacity-unlimited site (QUIRK 19). */
export function candidateCapacityPrior(capacity: number | null): number {
  return capacity === null ? UNCAPPED_CAPACITY_PRIOR : capacity;
}

/** `dM / (ownSpeedMps * 3600.0)` — the product is formed first (QUIRK 3). */
export function walkTimeHours(dM: number, ownSpeedMps: number): number {
  return dM / (ownSpeedMps * 3600.0);
}

/**
 * `-betaTravelTime * walkTimeH + betaCapacityPrior * ln(max(1.0, cap))`.
 *
 * Written the way Java writes it: unary minus binds tighter than `*`, so the
 * first term is `(-betaTravelTime) * walkTimeH`. Numerically identical to
 * `-(betaTravelTime * walkTimeH)` for finite values, and transcribed rather than
 * simplified because the oracle dumps `v` in raw bits.
 */
export function candidateUtility(config: DecisionConfig, walkTimeH: number, cap: number): number {
  return -config.betaTravelTime * walkTimeH + config.betaCapacityPrior * fdlibmLog(Math.max(1.0, cap));
}

/**
 * The running-best comparison, verbatim.
 *
 * @param bestId the running best's id, or `null` when nothing has been selected
 *   yet — Java's `best != null` guard.
 */
export function beatsRunningBest(
  v: number,
  bestV: number,
  id: string,
  bestId: string | null,
): boolean {
  return v > bestV || (v === bestV && bestId !== null && id < bestId);
}

/**
 * Plan an L1 leg for `a`, or classify the failure.
 *
 * Mutates `a` exactly as the certified method mutates the agent: on success
 * `targetShelter`, `networkDistToShelterM` (**first selection only** — V11 keeps
 * its documented meaning, "the nearest shelter you can actually reach" from the
 * START node, and is stale for retargeted residents by design), `plannedRouteM`,
 * the leg, `routeNodes` (only when a closure schedule is active) and
 * `seenClosureVersion`; on failure `state`, to `REFUSED_ALL_FULL` when anything
 * was reachable and `UNREACHABLE` when nothing was.
 *
 * @param ownSpeedMps the **group-pace-adjusted** speed from block 3
 */
export function chooseShelterByUtility(
  a: Resident,
  w: ChooserWorld,
  tick: number,
  ownSpeedMps: number,
): void {
  let bestV = Number.NEGATIVE_INFINITY;
  let best: Shelter | null = null;
  let bestDistM = Number.NaN;
  let anyReachable = false;
  // `useL1()` implies the layer is armed, which always allocates the set.
  const believedFull = a.believedFull!;
  const config = a.decisionConfig!;

  for (const shelter of w.shelters) {
    if (!shelter.operating) {
      hit(BR.SKIP_OPERATING);
      continue;
    }
    if (!shelter.isOpenAt(tick)) {
      hit(BR.SKIP_OPENAT);
      continue;
    }
    if (shelter.routeTree === null) {
      hit(BR.SKIP_TREE);
      continue;
    }
    const dM = shelter.routeTree.dist[a.currentNode]!;
    if (!Number.isFinite(dM)) {
      hit(BR.SKIP_INF);
      continue;
    }
    anyReachable = true;
    if (believedFull.has(shelter.id)) {
      hit(BR.SKIP_BELIEF_L1);
      continue;
    }
    const cap = candidateCapacityPrior(shelter.capacity);
    hit(shelter.capacity === null ? BR.CAP_NULL : BR.CAP_SET);
    const walkTimeH = walkTimeHours(dM, ownSpeedMps);
    const v = candidateUtility(config, walkTimeH, cap);
    if (v > bestV) {
      hit(BR.PICK_STRICT);
      bestV = v;
      best = shelter;
      bestDistM = dM;
    } else if (v === bestV && best !== null) {
      if (shelter.id < best.id) {
        hit(BR.PICK_TIE);
        bestV = v;
        best = shelter;
        bestDistM = dM;
      } else {
        hit(BR.TIE_NOT_TAKEN);
      }
    }
  }

  if (best !== null) {
    a.targetShelter = best;
    if (Number.isNaN(a.networkDistToShelterM)) {
      hit(BR.V11_FIRST);
      a.networkDistToShelterM = bestDistM; // V11, first selection only
    } else {
      hit(BR.V11_STALE);
    }
    a.plannedRouteM += bestDistM;
    a.leg = buildRouteLeg(w.graph, w.geometry, w.seg, best.routeTree!, a.currentNode);
    if (a.leg === null) {
      // A finite tree distance with no predecessor chain would be a broken tree,
      // not a modelling outcome (`step.ts` fails the same way for L0).
      throw new Error(
        `shelter ${best.id} reports a finite distance to node index ${a.currentNode} but ` +
          `pathToSource found no predecessor chain — the shortest-path tree is corrupt`,
      );
    }
    if (w.hasClosureSchedule === true) {
      hit(BR.ROUTENODES_ON);
      a.routeNodes = buildRouteNodes(w.graph, w.geometry, best.routeTree!, a.currentNode);
    } else {
      hit(BR.ROUTENODES_OFF);
      a.routeNodes = null;
    }
    a.seenClosureVersion = w.closureVersion === undefined ? 0 : w.closureVersion();
  } else if (anyReachable) {
    hit(BR.TERM_REFUSED);
    a.state = "REFUSED_ALL_FULL";
  } else {
    hit(BR.TERM_UNREACH);
    a.state = "UNREACHABLE";
  }
}
