/**
 * Group pace (V34) — `GisAgent.java:320-324`, WP8-SPEC-decision.md §3.2.
 *
 * ```java
 * if (decisionConfig != null && decisionAttributes != null
 *         && decisionAttributes.groupSpeedDeltaMps > 0.0) {
 *     walkingSpeedMps = Math.max(0.40, walkingSpeedMps - decisionAttributes.groupSpeedDeltaMps);
 * }
 * ```
 *
 * **There is no second agent.** Read that carefully, because "group pace"
 * invites a wrong port. The model does not create a household, does not
 * synchronise two agents and does not search for companions: a resident with
 * `hasDependents` carries a *scalar* speed decrement (sourced midpoint 0.06 m/s,
 * Moussaid et al. 2010, for **one** extra member), and the "group"'s pace is set
 * by that one resident and nothing else. Household size beyond the adult is
 * unrecorded in the source data, so one extra member is the least-assuming
 * option.
 *
 * Four mechanics that matter:
 *
 * - the reduction is **derived, never stored** — `attributes.walkingSpeedMps` is
 *   not mutated, and the value is recomputed from the sample every tick, so it
 *   is **not cumulative**;
 * - the floor is `Math.max(0.40, …)`, the V27 truncated-normal lower bound, so a
 *   group-paced resident is never slower than the slowest sampled individual;
 * - the guard is **`> 0.0` strictly** (QUIRK 20). With `delta === 0` the block is
 *   skipped and `Math.max` never runs — which matters, because `Math.max(0.40, v)`
 *   would otherwise *raise* the speed of a walker sampled below 0.40. The
 *   sampler bounds speed at `[0.40, 2.20]` so that cannot bite today; the guard
 *   is what makes that true rather than lucky;
 * - **heavy belongings is a barrier cost only, never a speed penalty**
 *   (`ELayerSampler.java:52-55`: load carriage does not slow self-selected
 *   walking, Bastien 2005). A port that reduces speed for it is inventing
 *   physics the model deliberately rejected.
 *
 * The adjusted speed feeds **both** the movement step length **and**
 * `chooseShelterByUtility`'s `ownSpeedMps`. It does **not** feed
 * `chooseNetworkNearestShelter`, which is distance-only.
 */

import { GROUP_PACE_FLOOR_MPS } from "../agents/stateMachine.js";

/**
 * The group-paced walking speed for this tick.
 *
 * @param walkingSpeedMps the resident's sampled (or run-wide) speed
 * @param groupSpeedDeltaMps `decisionAttributes.groupSpeedDeltaMps`; `0` unless
 *   the resident travels with dependents
 */
export function groupPacedSpeedMps(walkingSpeedMps: number, groupSpeedDeltaMps: number): number {
  if (groupSpeedDeltaMps > 0.0) {
    return Math.max(GROUP_PACE_FLOOR_MPS, walkingSpeedMps - groupSpeedDeltaMps);
  }
  return walkingSpeedMps;
}

export { GROUP_PACE_FLOOR_MPS };
