/**
 * Belief exclusion, and the asymmetry that bounds L1
 * (`GisAgent.java:657-659`, `:567-576`, WP8-SPEC-decision.md §6).
 *
 * ## Two call shapes, deliberately not unified
 *
 * `excludedByBelief` is **null-safe**, so it is always `false` with the layer
 * off — that is what keeps the legacy chooser and `anyShelterAvailable`
 * literally unchanged. `chooseShelterByUtility` and `anyUntriedReachableShelter`
 * instead call `believedFull.contains(...)` **directly, without a null guard**,
 * because both are reachable only under `useL1()`, and `useL1()` implies the
 * layer is armed, which always allocates the set. Adding a "defensive" null
 * check there changes nothing but suggests the invariant is weaker than it is,
 * so the port keeps the two shapes distinct — {@link excludedByBelief} for the
 * L0/legacy sites, a plain `Set.has` for the L1 ones.
 *
 * ## What goes into the set, and when
 *
 * | Regime | Capacity refusal | Closed-door refusal | Policy refusal |
 * |---|---|---|---|
 * | legacy (layer off) | set is `null` | — | structurally impossible |
 * | L0 (layer on, regime ≠ 1) | **not** recorded | **not** recorded | recorded |
 * | L1 (layer on, regime 1) | recorded | recorded | recorded |
 *
 * Under L1 the `if (useL1())` branch fires first and records unconditionally, so
 * the `else if (policyRefused)` arm is L0-only. {@link recordsBelief} is that
 * two-line rule, isolated because `door.tsv` dumps the classification for every
 * refusal in the run and the port is checked against it row for row.
 *
 * ## Beliefs never expire — and that is sound, not lazy
 *
 * Occupancy is monotone (no departures are modelled) and policy is fixed, so a
 * site once refused stays refused *for this resident*. New capacity only ever
 * appears as a newly opened site, which by construction is not yet in the set.
 *
 * ## The termination bound
 *
 * L0/legacy is bounded by `retargetCount > MAX_RETARGETS`, **per episode** — the
 * counter resets on every `REFUSED_ALL_FULL → EN_ROUTE` re-entry (QUIRK 16). L1
 * has **no cap at all**: the belief set is the bound, because every refusal
 * permanently removes one site, so an episode terminates after at most
 * `|reachable open operating sites|` refusals. `retargetCount` still increments
 * in both regimes and can exceed 8 under L1 (QUIRK 15).
 *
 * `believedFull` is a `HashSet<String>` in Java used **only** for `add` and
 * `contains` — never iterated, never sized into an output — so a `Set<string>`
 * is a faithful port (QUIRK 13). Do not ever add an iteration over it.
 */

import type { Shelter } from "../shelters/shelter.js";

/** `excludedByBelief(shelter)` — null-safe, and therefore inert with the layer off. */
export function excludedByBelief(believedFull: ReadonlySet<string> | null, shelter: Shelter): boolean {
  return believedFull !== null && believedFull.has(shelter.id);
}

/**
 * Whether a refusal at the door is written into the belief set.
 *
 * L1 records every refusal; L0 records only policy refusals. A capacity refusal
 * under L0 is deliberately *not* remembered — the omniscient chooser will see
 * the shelter is full next tick anyway — while the policy recording is what
 * prevents the infinite `refuse → retarget → cap → re-entry resets the counter`
 * cycle a pet owner would otherwise ride forever.
 */
export function recordsBelief(useL1Regime: boolean, policyRefused: boolean): boolean {
  return useL1Regime || policyRefused;
}
