/**
 * The door (PORT_MAP §1.5 step 13, §1.6.2, `GisAgent.java:545-592`).
 *
 * Three rules live here because each of them has exactly one correct place and
 * putting them anywhere else is how a port loses a number quietly:
 *
 * 1. **`admit()` is never called speculatively.** It increments `refusedCount`
 *    on failure. A caller that wants a *question* answered asks
 *    {@link Shelter.hasSpaceFor}; {@link arriveAtDoor} calls `admit()` exactly
 *    once, and only when the resident is actually standing at the door.
 * 2. **`&&` short-circuits, and the short-circuit is the semantics.** Java
 *    evaluates `!policyRefused && isOpenAt(tick) && admit(...)`. A **closed**
 *    door therefore never reaches `admit()`, so a closed-door arrival increments
 *    **no** refusal counter at all — while a capacity refusal increments
 *    `refusedCount` (inside `admit`) and a policy refusal increments both
 *    `refusedCount` and `policyRefusedCount`. Reordering the clauses "for
 *    clarity" changes `shelters.csv`.
 * 3. **Priority is mobility limitation and nothing else.** Never age, never
 *    asthma, never COPD (`GisAgent.isPriorityForAdmission`), and never anyone at
 *    all when heterogeneity is off — which is one of the two reasons a triage
 *    reserve of 0 is inert.
 */

import type { PopulationAttributes } from "../agents/populationSampler.js";
import type { Shelter } from "./shelter.js";

/**
 * `GisAgent.isPriorityForAdmission()` — the arm-D triage criterion.
 *
 * The reserved fraction of a site's capacity is available only to residents
 * whose mobility is limited: it is the one sampled attribute that mechanically
 * causes the access gap (a slower walker reaches a door later and is refused by
 * someone who walked faster), so it is the only one the model can defend
 * triaging on.
 */
export function isPriorityForAdmission(attributes: PopulationAttributes | null): boolean {
  return attributes !== null && attributes.mobilityLimited;
}

/** What happened at the door. `refused*` variants all leave the resident EN_ROUTE. */
export type DoorOutcome = "admitted" | "refused-policy" | "refused-closed" | "refused-full";

/**
 * The Phase-E policy gate, evaluated **at the door** and not at selection time:
 * under L1 the resident knows locations, not intake policies, and the sourced
 * datum is "ever been TURNED AWAY over pet policy" (48.1%, Henwood 2020) —
 * people went and were refused.
 *
 * WP7 (legacy latch) never has decision attributes, so this is always `false`
 * there; it is written now so WP8 cannot invent a second version of it.
 */
export function policyRefusedAt(
  shelter: Shelter,
  hasPet: boolean,
  hasDependents: boolean,
  petPolicyAdmitDefault: boolean,
): boolean {
  const petAdmitted = shelter.petIntake ?? petPolicyAdmitDefault;
  return (hasPet && !petAdmitted) || (hasDependents && shelter.adultsOnly);
}

/**
 * Request admission at `shelter` on `tick`.
 *
 * Returns which branch of Java's `if (!policyRefused && isOpenAt && admit(...))`
 * was taken, having applied exactly the side effects that branch applies —
 * including the deliberate asymmetry that a closed door counts nothing.
 */
export function arriveAtDoor(
  shelter: Shelter,
  tick: number,
  isPriority: boolean,
  policyRefused: boolean,
): DoorOutcome {
  if (policyRefused) {
    shelter.recordPolicyRefusal();
    return "refused-policy";
  }
  if (!shelter.isOpenAt(tick)) {
    // No counter. `admit()` is never reached, so `refusedCount` does not move.
    return "refused-closed";
  }
  return shelter.admit(isPriority) ? "admitted" : "refused-full";
}
