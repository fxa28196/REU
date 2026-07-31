/**
 * `GisAgent.step()` — the LEGACY-LATCH branch (plan §3.2, PORT_MAP §1.5).
 *
 * The 13 numbered blocks of §1.5 appear below in that order and are labelled
 * with it. The order is not a style choice: four separate observable quantities
 * depend on it.
 *
 *  - **The double concentration lookup.** Block 5 (exposure) reads the smoke
 *    field, and block 6 (departure) reads it *again* on the same tick for any
 *    resident still PRE_EVAC. Both lookups can miss and both increment
 *    `outOfRangeLookups`, so the counter — which is a validation gate
 *    (`verify_E_runs` (j): `out_of_range_lookups == 0`) — double-counts on those
 *    ticks by construction. Collapsing it to one lookup would change a number
 *    the archive publishes.
 *  - **`>` versus `>=` at 55.5.** `hoursAboveUnhealthy` accrues on **strict `>`**
 *    (block 5); the latch fires on **`>=`** (block 6). Both constants are
 *    `UNHEALTHY_UGM3`. This is deliberate in the certified source and
 *    "harmonising" it moves every departure tick and every archived
 *    `hours_above_unhealthy` cell.
 *  - **Exposure is booked before departure.** A resident that departs this tick
 *    has already accrued this tick at RESTING ventilation, because block 5 ran
 *    while it was still PRE_EVAC. A resident that arrives this tick accrued it
 *    at WALKING ventilation, because block 5 ran while it was still EN_ROUTE.
 *  - **`admit()` is called once, at the door, and never speculatively** — see
 *    `shelters/admit.ts`.
 *
 * ## What is deliberately absent
 *
 * The Phase-E rows of the §1.4 table (hazard departure, outreach conversion, L1
 * utility choice, belief sets, group pace, push/stuck) are WP8. This module
 * asserts it never reaches one: {@link stepResident} throws if a resident
 * carries decision attributes. That is louder than a comment and cheaper than
 * discovering in WP8 that a half-ported branch had been running all along.
 *
 * ## The one hoist, and why it is not a semantic change
 *
 * Java re-reads `minutesPerTick`, `walkingSpeedMps` and
 * `evacuationThresholdUgM3` from the Repast parameter map on **every agent-tick**
 * (`GisAgent.java:310-316, 440`). Those values cannot change during a run, so
 * the port reads them once into {@link StepWorld}. `anyShelterOpen(tick)` and
 * the "is any shelter available" scan are likewise pure functions of state the
 * caller already tracks, and {@link StepWorld} exposes them as such; §1.2's
 * within-tick ordering is preserved because the availability view is
 * invalidated by every admission (see `sim.ts`).
 */

import type { GraphGeometry } from "@websim/shared/graph-asset";

import { geodesicDistanceM } from "../geo/geodesic.js";
import type { RoutingGraph } from "../graph/csr.js";
import type { SegmentGeometry } from "../graph/cumLen.js";
import { arriveAtDoor, isPriorityForAdmission } from "../shelters/admit.js";
import type { Shelter } from "../shelters/shelter.js";
import type { SmokeField } from "../smoke/field.js";
import { buildRouteLeg, positionAlongApproach, positionAlongLeg } from "./route.js";
import type { Resident } from "./resident.js";
import {
  INHALATION_RESTING_M3H,
  INHALATION_WALKING_M3H,
  MAX_RETARGETS,
  UNHEALTHY_UGM3,
} from "./stateMachine.js";

/** Everything `step()` reads that is not the resident itself. */
export interface StepWorld {
  readonly graph: RoutingGraph;
  readonly geometry: GraphGeometry;
  readonly seg: SegmentGeometry;
  readonly smoke: SmokeField;
  /** Shelter objects in **CSV load order** — the L0 chooser's tie-break order. */
  readonly shelters: readonly Shelter[];

  readonly minutesPerTick: number;
  /** Run-wide speed; used only when a resident has no sampled attributes. */
  readonly walkingSpeedMps: number;
  readonly evacuationThresholdUgM3: number;

  /** `anyShelterOpen(context, tick)` — operating ∧ open. Pure in `tick`. */
  anyShelterOpen(tick: number): boolean;
  /**
   * `anyShelterAvailable(context, tick)` — operating ∧ open ∧ has space for this
   * priority class ∧ reachable from `fromNode`. The caller may prefilter on the
   * resident-independent conjuncts as long as every admission invalidates the
   * view.
   */
  anyShelterAvailable(tick: number, fromNode: number, isPriority: boolean): boolean;
  /** Called after a successful `admit()` so an availability view can be refreshed. */
  onAdmission(shelter: Shelter): void;
}

/** Java's `Math.max(0.40, v − delta)` floor; unreachable in WP7 (delta is 0). */
const GROUP_PACE_FLOOR_MPS = 0.4;

/**
 * Advance one resident by one tick.
 *
 * @param a    the resident, mutated in place
 * @param w    the world view (see {@link StepWorld})
 * @param tick the Repast tick count; the schedule's **first tick is 1**
 */
export function stepResident(a: Resident, w: StepWorld, tick: number): void {
  if (a.decision !== null) {
    throw new Error(
      `resident ${a.name} carries Phase-E decision attributes: the legacy-latch step (WP7) ` +
        `must never execute a decision-layer transition — that branch is WP8`,
    );
  }

  // --- §1.5 steps 1-2: context lookup + per-tick param reads (hoisted) -----
  const minutesPerTick = w.minutesPerTick;
  let walkingSpeedMps = a.attributes !== null ? a.attributes.walkingSpeedMps : w.walkingSpeedMps;

  // --- §1.5 step 3: V34 group pace. Derived, never mutating the sample. ----
  // Unreachable without the decision layer; kept so the ordering is complete.
  const groupSpeedDeltaMps = 0;
  if (groupSpeedDeltaMps > 0) {
    walkingSpeedMps = Math.max(GROUP_PACE_FLOOR_MPS, walkingSpeedMps - groupSpeedDeltaMps);
  }

  // --- §1.5 step 4: clock ---------------------------------------------------
  const dtHours = minutesPerTick / 60;

  // --- §1.5 step 5: exposure, for EVERY non-SHELTERED state -----------------
  if (a.state !== "SHELTERED") {
    const c = w.smoke.concentrationForTick(tick, minutesPerTick);
    a.exposureUgM3h += c * dtHours;
    a.vweUgM3h += c * a.ageRR * a.comorbidityRR * dtHours;
    // A stuck pusher is EN_ROUTE but waiting, so it breathes at the resting
    // rate. `stuckUntilTick` is NaN in every run without closures, so the
    // comparison below is the legacy expression there.
    const stuckNow = !Number.isNaN(a.stuckUntilTick) && tick < a.stuckUntilTick;
    const ventilationM3h =
      a.state === "EN_ROUTE" && !stuckNow ? INHALATION_WALKING_M3H : INHALATION_RESTING_M3H;
    a.airVolumeBreathedM3 += ventilationM3h * dtHours;
    a.inhaledDoseUg += c * ventilationM3h * dtHours;
    if (a.state === "EN_ROUTE") {
      a.exposureWhileTravelingUgM3h += c * dtHours;
    }
    if (c > UNHEALTHY_UGM3) {
      // STRICT `>` — the mirror image of the latch's `>=` below.
      a.hoursAboveUnhealthy += dtHours;
    }
    if (c > a.peakConcUgM3) {
      a.peakConcUgM3 = c;
    }
    a.outdoorHours += dtHours;
  }

  // --- §1.5 step 6: departure (UNAWARE / PRE_EVAC only) ---------------------
  if (a.state === "PRE_EVAC") {
    // SECOND concentration lookup this tick — see the module doc.
    const cNow = w.smoke.concentrationForTick(tick, minutesPerTick);
    // Legacy bright-line latch: threshold crossed AND somewhere open to walk to
    // (A-02: the real shelters opened Sept 10-11, days after the first crossing).
    if (cNow >= w.evacuationThresholdUgM3 && w.anyShelterOpen(tick)) {
      a.state = "EN_ROUTE";
      a.evacuationTick = tick;
    } else {
      return; // still waiting outdoors; exposure already accrued above
    }
  }

  // --- §1.5 step 7: REFUSED_ALL_FULL re-entry, re-checked EVERY tick --------
  if (a.state === "REFUSED_ALL_FULL") {
    if (!w.anyShelterAvailable(tick, a.currentNode, isPriorityForAdmission(a.attributes))) {
      return; // still nowhere to go; keeps accruing exposure outdoors
    }
    a.state = "EN_ROUTE";
    a.retargetCount = 0;
    a.targetShelter = null;
    a.leg = null;
    a.legTravelM = 0;
  }

  // --- §1.5 step 8 ----------------------------------------------------------
  if (a.state !== "EN_ROUTE") {
    return; // terminal states persist in place (still accruing if outside)
  }

  // --- §1.5 steps 9-10: stuck / closure reaction (WP8; inert here) ----------
  // `stuckUntilTick` is only ever set at a blockage and the closure version
  // never moves without a wave, so a legacy arm falls straight through.

  // --- §1.5 step 11: planning ----------------------------------------------
  let leg = a.leg;
  if (leg === null) {
    chooseNetworkNearestShelter(a, w, tick);
    leg = a.leg;
    if (leg === null) {
      // The chooser set the state (UNREACHABLE or REFUSED_ALL_FULL).
      return;
    }
    // `snapGapM += geodesicDistanceM(here, routePath.get(0))` — real walked
    // metres off the network, and the distance the movement loop below starts
    // by covering, because Java's loop starts at the agent's own position.
    const approach = geodesicDistanceM(a.posLon, a.posLat, leg.xy[0]!, leg.xy[1]!);
    a.snapGapM += approach;
    a.legApproachM = approach;
    a.legFromLon = a.posLon;
    a.legFromLat = a.posLat;
    a.legTravelM = 0;
  }

  // --- §1.5 step 12: movement ----------------------------------------------
  const stepLengthM = walkingSpeedMps * 60 * minutesPerTick;
  const legLengthM = a.legApproachM + leg.totalM;
  const advanceM = Math.min(stepLengthM, legLengthM - a.legTravelM);
  if (advanceM > 0) {
    a.legTravelM += advanceM;
    a.distanceTraveledM += advanceM;
  }

  // --- §1.5 step 13: arrival at the door ------------------------------------
  if (a.legTravelM >= legLengthM) {
    // The walk consumed the path exactly, so the standing point is the leg's
    // final vertex — no interpolation, and no geodesic call.
    const last = leg.vertexCount - 1;
    a.posLon = leg.xy[2 * last]!;
    a.posLat = leg.xy[2 * last + 1]!;

    const shelter = a.targetShelter;
    if (shelter === null) {
      throw new Error(`resident ${a.name} consumed a leg with no target shelter`);
    }
    // WP7 has no decision attributes, so `policyRefused` is structurally false.
    const outcome = arriveAtDoor(shelter, tick, isPriorityForAdmission(a.attributes), false);
    if (outcome === "admitted") {
      a.state = "SHELTERED";
      a.arrivalTick = tick;
      w.onAdmission(shelter);
      return;
    }
    // Refused (capacity, closed, or policy): the resident REMAINS at this
    // shelter's street node and re-plans from there next tick (A-17).
    a.currentNode = shelter.graphNode;
    a.targetShelter = null;
    a.leg = null;
    a.legTravelM = 0;
    a.retargetCount++;
    // L0/legacy retry cap; L1 is bounded by its belief set instead (WP8).
    if (a.retargetCount > MAX_RETARGETS) {
      a.state = "REFUSED_ALL_FULL";
    }
  }
}

/**
 * `chooseNetworkNearestShelter` (PORT_MAP §1.6.2) — minimum tree distance from
 * the resident's CURRENT node among operating, open, reachable sites that still
 * have space for its priority class.
 *
 * Three details are the port:
 *
 *  - **`anyReachable` is set BEFORE the space test**, so "everywhere is full"
 *    (REFUSED_ALL_FULL, re-checked every tick) and "nothing is on my component"
 *    (UNREACHABLE, terminal) stay distinguishable. Arm A's 28 unreachable
 *    residents are the second case and are a pure graph property.
 *  - **Strict `<`**, so an exact distance tie is broken by iteration order —
 *    which is why the shelter list is held in CSV load order and never in a map.
 *  - **`networkDistToShelterM` is written once**, on the first selection only.
 *    It is stale for retargeted residents *by design* (V11's documented meaning
 *    is "the nearest shelter you can actually reach" from the START node);
 *    total planned walking is `plannedRouteM`.
 */
function chooseNetworkNearestShelter(a: Resident, w: StepWorld, tick: number): void {
  let bestDistM = Number.POSITIVE_INFINITY;
  let best: Shelter | null = null;
  let anyReachable = false;
  const isPriority = isPriorityForAdmission(a.attributes);

  for (const shelter of w.shelters) {
    if (!shelter.operating || !shelter.isOpenAt(tick) || shelter.routeTree === null) {
      continue;
    }
    const dM = shelter.routeTree.dist[a.currentNode]!;
    if (!Number.isFinite(dM)) {
      continue;
    }
    anyReachable = true;
    // `excludedByBelief` is structurally false without the decision layer.
    if (shelter.hasSpaceFor(isPriority) && dM < bestDistM) {
      bestDistM = dM;
      best = shelter;
    }
  }

  if (best !== null) {
    a.targetShelter = best;
    if (Number.isNaN(a.networkDistToShelterM)) {
      a.networkDistToShelterM = bestDistM;
    }
    a.plannedRouteM += bestDistM;
    a.leg = buildRouteLeg(w.graph, w.geometry, w.seg, best.routeTree!, a.currentNode);
    if (a.leg === null) {
      // A finite tree distance with no predecessor chain would be a broken
      // tree, not a modelling outcome. Fail loudly rather than silently
      // stranding the resident.
      throw new Error(
        `shelter ${best.id} reports a finite distance to node index ${a.currentNode} but ` +
          `pathToSource found no predecessor chain — the shortest-path tree is corrupt`,
      );
    }
  } else if (anyReachable) {
    a.state = "REFUSED_ALL_FULL";
  } else {
    a.state = "UNREACHABLE";
  }
}

/**
 * The resident's display coordinate, materialised on demand (DR-S3 action A1).
 *
 * The tick loop never calls this: under the cumulative-length graft the position
 * is the scalar `legTravelM` and nothing inside a tick reads the lat/lon. Render
 * frames and the plan/reroute path (`GisAgent.java:518`) do, and that is the
 * whole difference between 31.85 s and 2.14 s on the default preset.
 */
export function materialisePosition(a: Resident): { lon: number; lat: number } {
  const leg = a.leg;
  if (leg === null) {
    return { lon: a.posLon, lat: a.posLat };
  }
  if (a.legTravelM <= a.legApproachM) {
    return positionAlongApproach(a.legFromLon, a.legFromLat, leg, a.legTravelM, a.legApproachM);
  }
  return positionAlongLeg(leg, a.legTravelM - a.legApproachM);
}
