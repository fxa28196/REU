/**
 * `GisAgent.step()` — the complete 13-block tick (PORT_MAP §1.5,
 * `GisAgent.java:304-593`, WP8-SPEC-decision.md §3).
 *
 * The blocks appear below in that order and are labelled with it. The order is
 * not a style choice: five separate observable quantities depend on it.
 *
 *  - **The double concentration lookup.** Block 5 (exposure) reads the smoke
 *    field, and block 6 (departure) reads it *again* on the same tick for any
 *    resident still UNAWARE or PRE_EVAC. Both lookups can miss and both
 *    increment `outOfRangeLookups`, so the counter — which is a validation gate
 *    (`verify_E_runs` (j): `out_of_range_lookups == 0`) — double-counts on those
 *    ticks by construction. Collapsing it would change a published number even
 *    though it cannot change a decision (QUIRK 21).
 *  - **`>` versus `>=` at 55.5.** `hoursAboveUnhealthy` accrues on **strict `>`**
 *    (block 5); the legacy latch and the Phase-E risk cue both fire on **`>=`**.
 *    All three read `UNHEALTHY_UGM3`; "harmonising" them moves every departure
 *    tick and every archived `hours_above_unhealthy` cell (QUIRK 10).
 *  - **Exposure is booked before departure.** A resident that departs this tick
 *    has already accrued it at RESTING ventilation, because block 5 ran while it
 *    was still PRE_EVAC; one that arrives accrued it at WALKING ventilation. A
 *    *stuck* pusher is EN_ROUTE but breathes at rest.
 *  - **`admit()` is called once, at the door, and never speculatively** — see
 *    `shelters/admit.ts`.
 *  - **The hazard is evaluated only on the first tick of each hour; the latch is
 *    evaluated every tick.** That is the single largest behavioural difference
 *    between the two departure models.
 *
 * ## The layer is an overlay, and the E0 null must stay byte-identical
 *
 * Every Phase-E path is gated on `cfg !== null && a.decision !== null`. With the
 * layer off, this file executes the WP7 legacy path statement for statement.
 * With the layer on but every mechanism degenerate (the "E0 null"), the executed
 * statements differ but the *values* do not, and the run is byte-identical to
 * the archived legacy arm — the R3 identity that is WP8's flagship acceptance
 * criterion. WP7 protected that with a throw at the top of this function; WP8
 * replaces the throw with the real branches and keeps the invariant as an
 * assertion that is **live in E0-null mode**: `assertNoLayerTransition`
 * (`decision/invariants.ts`) fires if an E0-null configuration ever reaches an
 * outreach conversion or a hazard departure, and `armResident` fires if one ever
 * produces an UNAWARE resident.
 * A weaker arrangement ("we set the parameters so it cannot happen") is a claim
 * about a config file, not about code.
 *
 * ## The one hoist, and why it is not a semantic change
 *
 * Java re-reads `minutesPerTick`, `walkingSpeedMps` and
 * `evacuationThresholdUgM3` from the Repast parameter map on **every agent-tick**
 * (`GisAgent.java:310-316, 440`). Those values cannot change during a run, so
 * the port reads them once into {@link StepWorld}. `anyShelterOpen(tick)` and
 * the availability scans are likewise pure functions of state the caller already
 * tracks; §1.2's within-tick ordering is preserved because the availability view
 * is invalidated by every admission (see `sim.ts`).
 */

import type { GraphGeometry } from "@websim/shared/graph-asset";

import { geodesicDistanceM } from "../geo/geodesic.js";
import type { RoutingGraph } from "../graph/csr.js";
import type { SegmentGeometry } from "../graph/cumLen.js";
import { useL1 } from "../decision/config.js";
import { assertNoLayerTransition } from "../decision/invariants.js";
import { excludedByBelief, recordsBelief } from "../decision/belief.js";
import { reactToClosureWave, type ClosureNetworkView } from "../decision/closureReaction.js";
import {
  effectiveBRisk,
  hazardLogOdds,
  hazardVulnerable,
  hourBucket,
  isNewHour,
  logistic,
  riskDecay,
  updateRiskAccumulator,
} from "../decision/hazard.js";
import { outreachDrawConsumed, outreachHourlyProbability } from "../decision/outreach.js";
import { groupPacedSpeedMps } from "../decision/pace.js";
import { policyRefusedFor } from "../decision/pets.js";
import { BR, hit } from "../decision/probe.js";
import { chooseShelterByUtility } from "../decision/utilityChooser.js";
import { arriveAtDoor, isPriorityForAdmission } from "../shelters/admit.js";
import type { Shelter } from "../shelters/shelter.js";
import type { SmokeField } from "../smoke/field.js";
import {
  buildRouteLeg,
  buildRouteNodes,
  pathIndexFor,
  positionAlongApproach,
  positionAlongLeg,
} from "./route.js";
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

  // --- the Scenario-E / L1 hooks -------------------------------------------
  //
  // These four are **optional**, and the omission is a statement rather than a
  // convenience: a `StepWorld` without them is a world in which no closure
  // schedule exists and the L1 regime is not configured, which is every archived
  // arm outside the SE family and every WP7-era harness. Omitting one and then
  // configuring the mechanism it serves is a hard error at the call site, not a
  // silent degradation — see the throw in the re-entry block.

  /**
   * `network.hasClosureSchedule()` — gates the `routeNodes` allocation, and
   * therefore gates whether `reactToClosureWave` is reachable at all. Absent or
   * `false` means "no schedule", which is what `world/build.ts` reports when
   * `closures === null`.
   */
  readonly hasClosureSchedule?: boolean;
  /** `network.getClosureVersion()`. Constant `0` in a run without waves. */
  closureVersion?(): number;
  /** `network.isBlocked(a, b)` over certified node ids, undirected. */
  isBlocked?(nodeIdA: number, nodeIdB: number): boolean;

  /** `anyShelterOpen(context, tick)` — operating ∧ open. Pure in `tick`. */
  anyShelterOpen(tick: number): boolean;
  /**
   * `anyShelterAvailable(context, tick)` — operating ∧ open ∧ has space for this
   * priority class ∧ reachable from `fromNode` ∧ not excluded by belief. The
   * caller may prefilter on the resident-independent conjuncts as long as every
   * admission invalidates the view. **L0/legacy re-entry only.**
   */
  anyShelterAvailable(
    tick: number,
    fromNode: number,
    isPriority: boolean,
    believedFull: ReadonlySet<string> | null,
  ): boolean;
  /**
   * `anyUntriedReachableShelter(context, tick)` — operating ∧ open ∧ tree ≠ null
   * ∧ reachable ∧ not believed full. **L1 re-entry only, and deliberately NOT
   * filtered on `hasSpaceFor`**: reusing the availability view would silently
   * reintroduce the omniscience L1 removes (WP8-SPEC-decision.md §10). None of
   * its conjuncts change on admission, so it needs no admission epoch.
   */
  anyUntriedReachableShelter?(
    tick: number,
    fromNode: number,
    believedFull: ReadonlySet<string>,
  ): boolean;
  /** Called after a successful `admit()` so an availability view can be refreshed. */
  onAdmission(shelter: Shelter): void;
}

/** `network.getClosureVersion()`, or `0` where the world declares no waves. */
function closureVersionOf(w: StepWorld): number {
  return w.closureVersion === undefined ? 0 : w.closureVersion();
}

/**
 * Advance one resident by one tick.
 *
 * @param a    the resident, mutated in place
 * @param w    the world view (see {@link StepWorld})
 * @param tick the Repast tick count; the schedule's **first tick is 1**
 */
export function stepResident(a: Resident, w: StepWorld, tick: number): void {
  // --- §1.5 steps 1-2: context lookup + per-tick param reads (hoisted) -----
  const minutesPerTick = w.minutesPerTick;
  const cfg = a.decisionConfig;
  const da = a.decision;
  const layer = cfg !== null && da !== null;
  const l1 = useL1(cfg);
  let walkingSpeedMps = a.attributes !== null ? a.attributes.walkingSpeedMps : w.walkingSpeedMps;

  // --- §1.5 step 3: V34 group pace. Derived, never mutating the sample. ----
  if (layer && da.groupSpeedDeltaMps > 0) {
    hit(BR.PACE_ON);
    walkingSpeedMps = groupPacedSpeedMps(walkingSpeedMps, da.groupSpeedDeltaMps);
  }

  // --- §1.5 step 4: clock ---------------------------------------------------
  const dtHours = minutesPerTick / 60;

  // --- §1.5 step 5: exposure, for EVERY non-SHELTERED state -----------------
  if (a.state !== "SHELTERED") {
    const c = w.smoke.concentrationForTick(tick, minutesPerTick);
    a.exposureUgM3h += c * dtHours;
    a.vweUgM3h += c * a.ageRR * a.comorbidityRR * dtHours;
    // A stuck pusher is EN_ROUTE but waiting, so it breathes at the resting
    // rate while still booking `exposureWhileTravelingUgM3h`.
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
  if (a.state === "UNAWARE" || a.state === "PRE_EVAC") {
    // SECOND concentration lookup this tick — see the module doc (QUIRK 21).
    // It happens for UNAWARE residents too, and it double-counts a miss.
    const cNow = w.smoke.concentrationForTick(tick, minutesPerTick);

    if (layer) {
      // --- 6b: hour bucket -------------------------------------------------
      const hour = hourBucket(tick, minutesPerTick);
      const newHour = isNewHour(hour, a.lastDecisionHour);
      hit(newHour ? BR.NEWHOUR : BR.SAMEHOUR);
      let d1Fired = false;
      if (newHour) {
        // --- 6c: z_R decay + increment. NO RNG — this is what lets the E0
        // null execute the block and stay byte-identical.
        a.lastDecisionHour = hour;
        const decay = riskDecay(cfg.riskHalfLifeH);
        a.zR = updateRiskAccumulator(a.zR, decay, cNow);
        hit(cNow >= UNHEALTHY_UGM3 ? BR.CUE_FIRES : BR.CUE_ZERO);
      }

      // --- 6d: outreach (V41) ----------------------------------------------
      if (a.state === "UNAWARE") {
        hit(BR.UNAWARE_BLOCK);
        if (!newHour) {
          hit(BR.D1_SKIP_HOUR);
        } else if (!(cfg.lambdaOutreachPerDay > 0.0)) {
          hit(BR.D1_SKIP_LAMBDA);
        }
        // Triple short-circuit: the draw is the THIRD operand, so no stream
        // advance unless `newHour` and `lambda > 0.0` both hold (QUIRK 28).
        if (outreachDrawConsumed(cfg, newHour)) {
          hit(BR.D1);
          d1Fired = true;
          if (a.decisionRng!.nextDouble() < outreachHourlyProbability(cfg)) {
            assertNoLayerTransition(a.name, cfg, "outreach conversion UNAWARE → PRE_EVAC");
            a.state = "PRE_EVAC"; // now aware (spec: AWARE_IDLE)
            a.awareTick = tick;
          }
        }
        if (a.state === "UNAWARE") {
          // A RE-TEST, not an `else`: a resident converted on this tick falls
          // through into the hazard branch with the SAME `newHour`.
          hit(BR.UNAWARE_RETURN);
          return; // still unaware; exposure already accrued above
        }
        hit(BR.CONVERTED);
      }

      if (cfg.enableHazardDeparture === 1) {
        // --- 6e: the hazard logistic (V36-V40) -----------------------------
        if (newHour) {
          const open = w.anyShelterOpen(tick);
          const vulnerable = hazardVulnerable(a.attributes);
          const bRiskEff = effectiveBRisk(cfg, vulnerable);
          const u = hazardLogOdds(cfg, bRiskEff, a.zR, open, a.thetaScaled, a.barrierCost);
          const p = logistic(u);
          hit(BR.HAZARD_BRANCH);
          hit(open ? BR.OPEN_TRUE : BR.OPEN_FALSE);
          hit(vulnerable ? BR.VULN_TRUE : BR.VULN_FALSE);
          // QUIRK 1: `open &&` gates the draw and it is the SECOND operand.
          // While every shelter is closed, `p` is computed and thrown away and
          // the private stream does NOT advance. Hoisting the draw out of this
          // `if` desynchronises every resident and produces a different,
          // entirely plausible run.
          if (open) {
            hit(BR.D2);
            if (d1Fired) {
              hit(BR.D1_THEN_D2);
            }
            if (a.decisionRng!.nextDouble() < p) {
              assertNoLayerTransition(a.name, cfg, "hazard departure PRE_EVAC → EN_ROUTE");
              a.state = "EN_ROUTE";
              a.evacuationTick = tick;
            }
          }
          hit(a.state === "EN_ROUTE" ? BR.HAZARD_FIRED : BR.HAZARD_WAIT);
        }
        if (a.state !== "EN_ROUTE") {
          // OUTSIDE the `if (newHour)`: on the 59 non-hour ticks of each hour a
          // PRE_EVAC resident under hazard departure accrues exposure and
          // returns. It never plans, never moves, never consumes RNG.
          return; // waiting; exposure already accrued above
        }
      } else {
        // --- 6f: latch site A (layer on, hazard off) -----------------------
        // Byte-identical to site B below; the two are textually distinct in the
        // certified source and are kept distinct here so the branch counters
        // (BR-23/24 vs BR-25/26) mean what the oracle says they mean.
        if (cNow >= w.evacuationThresholdUgM3 && w.anyShelterOpen(tick)) {
          hit(BR.LATCH_A_FIRE);
          a.state = "EN_ROUTE";
          a.evacuationTick = tick;
        } else {
          hit(BR.LATCH_A_WAIT);
          return;
        }
      }
    } else {
      // --- 6g: latch site B (layer OFF) ------------------------------------
      if (cNow >= w.evacuationThresholdUgM3 && w.anyShelterOpen(tick)) {
        hit(BR.LATCH_B_FIRE);
        a.state = "EN_ROUTE";
        a.evacuationTick = tick;
      } else {
        hit(BR.LATCH_B_WAIT);
        return; // still waiting outdoors; exposure already accrued above
      }
    }
  }

  // --- §1.5 step 7: REFUSED_ALL_FULL re-entry, re-checked EVERY tick --------
  if (a.state === "REFUSED_ALL_FULL") {
    if (l1 && w.anyUntriedReachableShelter === undefined) {
      throw new Error(
        `resident ${a.name} needs the L1 re-entry predicate, but this StepWorld declares no ` +
          "anyUntriedReachableShelter: the availability view must NOT be reused for it, because " +
          "it filters on hasSpaceFor and would reintroduce the omniscience L1 removes",
      );
    }
    const somewhereToTry = l1
      ? w.anyUntriedReachableShelter!(tick, a.currentNode, a.believedFull!)
      : w.anyShelterAvailable(
          tick,
          a.currentNode,
          isPriorityForAdmission(a.attributes),
          a.believedFull,
        );
    hit(l1 ? BR.REENTRY_L1 : BR.REENTRY_L0);
    hit(somewhereToTry ? BR.REENTRY_GRANTED : BR.REENTRY_BLOCKED);
    if (!somewhereToTry) {
      return; // still nowhere to go; keeps accruing exposure outdoors
    }
    a.state = "EN_ROUTE";
    a.retargetCount = 0; // the L0 cap of 8 is per EPISODE, not per run
    a.targetShelter = null;
    a.leg = null;
    a.routeNodes = null;
    a.legTravelM = 0;
  }

  // --- §1.5 step 8 ----------------------------------------------------------
  if (a.state !== "EN_ROUTE") {
    return; // terminal states persist in place (still accruing if outside)
  }

  // --- §1.5 step 9: stuck ---------------------------------------------------
  if (!Number.isNaN(a.stuckUntilTick)) {
    if (tick < a.stuckUntilTick) {
      hit(BR.STUCK_HELD);
      return; // stuck: outdoors, resting, accruing
    }
    hit(BR.STUCK_SERVED);
    // Note the delay-served path keeps the STALE path — the resident walks
    // through the closed street. That is the modelled consequence of pushing.
    a.stuckUntilTick = Number.NaN;
  }

  // --- §1.5 step 10: closure-wave reaction ----------------------------------
  // `routeNodes` is null unless a closure schedule exists, so this block is
  // unreachable in every run without closures even if the version counter moved.
  if (a.leg !== null && a.routeNodes !== null && closureVersionOf(w) !== a.seenClosureVersion) {
    // The reroute branch clears the leg, and the resident then walks the
    // off-network stretch back to `nodes[lastReached]` — which is booked into
    // both `snapGapM` and `distanceTraveledM` (QUIRK 27). So the standing point
    // must be materialised BEFORE the leg goes away.
    const here = materialisePosition(a);
    a.posLon = here.lon;
    a.posLat = here.lat;
    const pathIndex = pathIndexFor(a.leg, a.legApproachM, a.legTravelM);
    const network: ClosureNetworkView = {
      closureVersion: () => closureVersionOf(w),
      isBlocked: (x, y) => (w.isBlocked === undefined ? false : w.isBlocked(x, y)),
    };
    reactToClosureWave(a, network, tick, minutesPerTick, pathIndex);
    if (!Number.isNaN(a.stuckUntilTick)) {
      return; // pushed through and got stuck right here
    }
  }

  // --- §1.5 step 11: planning ----------------------------------------------
  let leg = a.leg;
  if (leg === null) {
    if (l1) {
      hit(BR.PLAN_L1);
      chooseShelterByUtility(a, w, tick, walkingSpeedMps);
    } else {
      hit(BR.PLAN_L0);
      chooseNetworkNearestShelter(a, w, tick);
    }
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
    const isPriority = isPriorityForAdmission(a.attributes);
    if (isPriority) {
      hit(BR.PRIORITY);
    }
    // Structurally false without the layer; with it, the SITE's own policy.
    const policyRefused = policyRefusedFor(shelter, da, cfg);
    if (policyRefused && da !== null) {
      if (da.hasPet && !(shelter.petIntake ?? cfg!.petPolicyAdmitDefault)) {
        hit(BR.DOOR_PET);
      }
      if (da.hasDependents && shelter.adultsOnly) {
        hit(BR.DOOR_DEP);
      }
    }
    const openAt = shelter.isOpenAt(tick);
    const outcome = arriveAtDoor(shelter, tick, isPriority, policyRefused);
    if (outcome === "admitted") {
      hit(BR.DOOR_ADMIT);
      a.state = "SHELTERED";
      a.arrivalTick = tick;
      w.onAdmission(shelter);
      return;
    }
    // Refused (policy / closed / capacity). `recordPolicyRefusal()` has already
    // fired inside `arriveAtDoor`, BEFORE the belief update, and a closed door
    // incremented no counter at all (QUIRK 18).
    if (!policyRefused && !openAt) {
      hit(BR.DOOR_CLOSED);
    } else if (!policyRefused) {
      hit(BR.DOOR_CAPACITY);
    }
    // L1 records every refusal; L0 records only policy refusals.
    if (l1) {
      hit(BR.BELIEF_L1);
    } else if (policyRefused) {
      hit(BR.BELIEF_L0);
    } else {
      hit(BR.BELIEF_NONE);
    }
    if (a.believedFull !== null && recordsBelief(l1, policyRefused)) {
      a.believedFull.add(shelter.id);
    }
    // The resident REMAINS at this shelter's street node and re-plans from
    // there next tick (A-17).
    a.currentNode = shelter.graphNode;
    a.targetShelter = null;
    a.leg = null;
    a.routeNodes = null;
    a.legTravelM = 0;
    a.retargetCount++; // every refusal, in BOTH regimes (QUIRK 15)
    // Only the CAP is L0-only: L1 is bounded by its belief set instead.
    if (!l1 && a.retargetCount > MAX_RETARGETS) {
      hit(BR.CAP_FIRED);
      a.state = "REFUSED_ALL_FULL";
    }
  }
}

/**
 * `chooseNetworkNearestShelter` (PORT_MAP §1.6.2) — minimum tree distance from
 * the resident's CURRENT node among operating, open, reachable sites that still
 * have space for its priority class.
 *
 * Four details are the port:
 *
 *  - **`anyReachable` is set BEFORE the belief and space tests**, so "everywhere
 *    is full" (REFUSED_ALL_FULL, re-checked every tick) and "nothing is on my
 *    component" (UNREACHABLE, terminal) stay distinguishable. Arm A's 28
 *    unreachable residents are the second case and are a pure graph property.
 *  - **`excludedByBelief` sits between them** — the one line WP8 adds. It is
 *    null-safe, so it is structurally false with the layer off and the legacy
 *    chooser is literally unchanged; under L0 it carries the policy refusals
 *    that stop a pet owner re-selecting the same refusing door forever.
 *  - **Strict `<`**, so an exact distance tie is broken by iteration order —
 *    which is why the shelter list is held in CSV load order and never in a map.
 *    L1's tie-break is order-*independent*; making the two consistent breaks one
 *    of them (QUIRK 14).
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
    if (excludedByBelief(a.believedFull, shelter)) {
      hit(BR.SKIP_BELIEF_L0);
      continue; // already turned this resident away on policy (L0)
    }
    const hasSpace = shelter.hasSpaceFor(isPriority);
    hit(hasSpace ? BR.L0_SPACE : BR.L0_NOSPACE);
    if (hasSpace && dM < bestDistM) {
      bestDistM = dM;
      best = shelter;
    }
  }

  if (best !== null) {
    a.targetShelter = best;
    if (Number.isNaN(a.networkDistToShelterM)) {
      hit(BR.V11_FIRST);
      a.networkDistToShelterM = bestDistM;
    } else {
      hit(BR.V11_STALE);
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
    if (w.hasClosureSchedule === true) {
      hit(BR.ROUTENODES_ON);
      a.routeNodes = buildRouteNodes(w.graph, w.geometry, best.routeTree!, a.currentNode);
    } else {
      hit(BR.ROUTENODES_OFF);
      a.routeNodes = null;
    }
    a.seenClosureVersion = closureVersionOf(w);
  } else if (anyReachable) {
    hit(BR.TERM_REFUSED);
    a.state = "REFUSED_ALL_FULL";
  } else {
    hit(BR.TERM_UNREACH);
    a.state = "UNREACHABLE";
  }
}

/**
 * The resident's display coordinate, materialised on demand (DR-S3 action A1).
 *
 * The tick loop reads it in exactly two places: render frames, and the
 * plan/reroute path (`GisAgent.java:518`), where the standing point has to be
 * real before the leg is discarded. Everywhere else the position is the scalar
 * `legTravelM`, and that is the whole difference between 31.85 s and 2.14 s on
 * the default preset.
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
