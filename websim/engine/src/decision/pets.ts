/**
 * Pet policy and the triage hook (WP8-SPEC-decision.md §8, §9).
 *
 * ## The two-place asymmetry that makes the pet mechanism work
 *
 * - **`barrierCost` reads the WORLD default only** (`GisAgent.java:941`:
 *   `hasPet && !petPolicyAdmitDefault`). A pet owner in a world that refuses
 *   pets by default carries `barrierPet` in its departure log-odds whether or
 *   not the specific site it would pick admits pets — the modelled burden is
 *   *anticipating* refusal.
 * - **The door gate reads the SITE's own policy** (`:552`), falling back to the
 *   default only when the site records none.
 *
 * So under ER (`petPolicyDefault = 0`, `shelterPolicyVariant = 1`) a pet owner
 * is suppressed from departing by `barrierPet`, but if it does depart and picks
 * one of the four pets-allowed facilities it is admitted. That interaction is
 * the mechanism, not an inconsistency.
 *
 * ## `petIntake` is tri-state; use `??`, never `||` (QUIRK 11)
 *
 * `true` admit, `false` refuse, `null` unrecorded — only `null` defers to the
 * world default. With `||`, a recorded `false` would fall through to the default
 * and silently admit pets at a site that refuses them. The shelter-side
 * implementation (`shelters/admit.ts:52-60`) already gets this right and is the
 * one this module calls; {@link petAdmittedAt} exists because the *hazard*
 * side needs the same question answered for a single site without also asking
 * about dependents.
 *
 * ## Triage priority is mobility limitation and nothing else
 *
 * `isPriorityForAdmission()` reads `PopulationSampler.Attributes`, **not**
 * `DecisionAttributes`: it is entirely independent of the decision layer and is
 * `false` for every resident when heterogeneity is off. Not age, not asthma, not
 * COPD — those carry no behavioural consequence in this model, so triaging on
 * them would be a claim the simulation cannot support. Mobility does: a slower
 * walker reaches a door later and is refused by someone who walked faster.
 *
 * A mobility-limited resident is therefore read by **three** separate
 * mechanisms — the hazard `vulnerable` term (γ amplification), the door's
 * priority reserve, and the push rule's `mobilityPenalty`. None of them is the
 * others, and this module re-exports the shelter-side predicate rather than
 * defining a fourth.
 */

import { isPriorityForAdmission, policyRefusedAt } from "../shelters/admit.js";
import type { Shelter } from "../shelters/shelter.js";
import type { DecisionAttributes } from "../agents/eLayerSampler.js";
import type { DecisionConfig } from "./config.js";

/**
 * `petAdmittedAt(shelter)` (`GisAgent.java:670-674`).
 *
 * Dereferences the config without a null check in Java, because it is called
 * only from the door gate — which is guarded on the layer being armed and, by
 * short-circuit, on `decisionAttributes.hasPet`.
 */
export function petAdmittedAt(shelter: Shelter, config: DecisionConfig): boolean {
  return shelter.petIntake ?? config.petPolicyAdmitDefault;
}

/**
 * The door's policy gate for a resident carrying decision attributes
 * (`GisAgent.java:551-553`):
 * `(hasPet && !petAdmittedAt(site)) || (hasDependents && site.isAdultsOnly())`.
 *
 * Structurally `false` with the layer off, which is why WP7 could pass a
 * literal `false`.
 */
export function policyRefusedFor(
  shelter: Shelter,
  da: DecisionAttributes | null,
  config: DecisionConfig | null,
): boolean {
  if (da === null || config === null) {
    return false;
  }
  return policyRefusedAt(shelter, da.hasPet, da.hasDependents, config.petPolicyAdmitDefault);
}

export { isPriorityForAdmission };
