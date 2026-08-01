/**
 * The shelter POLICY COLUMNS — `pet_intake` and `adults_only`
 * (WP8-SPEC-severe-triage-pets.md §3.1-§3.2; `ContextCreator.java:569-582`,
 * `Shelter.java:70-79`, `GisAgent.java:668-674`).
 *
 * Two optional CSV columns, **two different vocabularies**, and that is not a
 * typo in the Java:
 *
 * | column | recognised as *set* | mapping |
 * |---|---|---|
 * | `pet_intake` | any non-blank value | `"admit"` (case-insensitive, trimmed) -> `true`; **every other non-blank string -> `false`** |
 * | `adults_only` | any non-blank value | `"1"` (case-**sensitive**) or `"true"`/`"yes"` (case-insensitive) -> `true`; anything else -> `false` |
 *
 * So `pet_intake = "yes"` means **REFUSE** — not `null`, and emphatically not
 * `true` (QUIRK 12). `Boolean.valueOf("admit".equalsIgnoreCase(petCol.trim()))`
 * has no third outcome; only a **blank or absent** cell leaves the tri-state at
 * `null`, which is the only value that defers to the run-wide
 * `petPolicyDefault`.
 *
 * The tri-state is why {@link petAdmittedAt} uses `??` and never `||`: with
 * `||`, a recorded `false` would fall through to the default and silently admit
 * pets at a site that refuses them. `false ?? true === false`.
 *
 * ## What the `_elayer` variant actually contains
 *
 * `shelterPolicyVariant = 1` swaps the arm's shelter CSV for its `_elayer` twin
 * (the blind 4-character `.csv` chop lives in `world/scenario.ts`; it fails loud
 * when the twin is absent, by design). All three twins carry 22 columns — the
 * base 21 plus `pet_intake` — and **none** carries `adults_only`, so
 * `adultsOnly` is `false` for every archived run and the `hasDependents` half of
 * the door gate never fires there. It is still ported: `pHasDependents` is a
 * live parameter and a user-supplied file could carry the column.
 *
 * Recomputed, all three twins: 4 `admit`, 29 `refuse`, and 3 (A/B) or 13 (C)
 * blank. The four `admit` sites are the same in all three — `Laurelwood_Center`,
 * `River_District_Navigatio`, `Walnut_Park_Shelter`, `Willamette_Center` — the 4
 * of 48 upstream facilities with `pets_allowed = 1`. Their **bed** totals are
 * arm-specific (422 / 1,292 / 633); the often-quoted "422 beds" is arm A only.
 *
 * ## The two-place asymmetry (QUIRK 14)
 *
 * The pet *door gate* reads the SITE's policy; the pet *barrier cost* reads the
 * WORLD default (`decision/pets.ts`, `GisAgent.java:941`). Two different
 * predicates, deliberately: the modelled departure burden is *anticipating*
 * refusal, while the refusal itself is discovered at the door.
 *
 * Zero RNG: policy refusal is deterministic (§5.1).
 */

import type { Shelter } from "./shelter.js";

/** `String.trim()` — Java trims by code point <= U+0020, JS trims Unicode space. */
function javaTrim(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) <= 0x20) {
    start += 1;
  }
  while (end > start && value.charCodeAt(end - 1) <= 0x20) {
    end -= 1;
  }
  return value.slice(start, end);
}

/**
 * `pet_intake` -> the tri-state.
 *
 * `undefined` (column absent) and blank both give `null`; every other value
 * gives a boolean, and only the literal `admit` gives `true`.
 */
export function parsePetIntake(cell: string | undefined | null): boolean | null {
  if (cell === undefined || cell === null) {
    return null;
  }
  const v = javaTrim(cell);
  if (v.length === 0) {
    return null;
  }
  // Java: Boolean.valueOf("admit".equalsIgnoreCase(v)) — no third outcome.
  return v.toLowerCase() === "admit";
}

/**
 * `adults_only` -> a plain boolean, default `false`.
 *
 * Note `"1"` is compared with `equals` (case-sensitive, though it cannot
 * matter for a digit) while `"true"`/`"yes"` use `equalsIgnoreCase`. `"01"`,
 * `"y"`, `"TRUE "` (already trimmed -> `"TRUE"`, so that one *is* true) — the
 * exact set matters because a user-supplied CSV is the only way this column
 * ever arrives.
 */
export function parseAdultsOnly(cell: string | undefined | null): boolean {
  if (cell === undefined || cell === null) {
    return false;
  }
  const v = javaTrim(cell);
  if (v.length === 0) {
    return false;
  }
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

/**
 * Apply both optional columns to a freshly constructed shelter, exactly as the
 * CSV load loop does: **absent or blank leaves the field at its initialiser**
 * (`null` / `false`), so a file without the columns behaves as it always did.
 */
export function applyPolicyColumns(
  shelter: Shelter,
  row: { get(column: string): string | undefined },
): void {
  const petCol = row.get("pet_intake");
  if (petCol !== undefined && javaTrim(petCol).length > 0) {
    shelter.petIntake = parsePetIntake(petCol);
  }
  const adultsCol = row.get("adults_only");
  if (adultsCol !== undefined && javaTrim(adultsCol).length > 0) {
    shelter.adultsOnly = parseAdultsOnly(adultsCol);
  }
}

/**
 * `petAdmittedAt(shelter)` (`GisAgent.java:670-674`) — the site's own recorded
 * policy when it has one, otherwise the run-wide default.
 *
 * `??`, never `||`: see the class doc. `decision/pets.ts` exposes the same
 * question against a `DecisionConfig`; this is the primitive it is built on, and
 * the hazard side needs it without also asking about dependents.
 */
export function petAdmittedAt(
  shelter: Pick<Shelter, "petIntake">,
  petPolicyAdmitDefault: boolean,
): boolean {
  return shelter.petIntake ?? petPolicyAdmitDefault;
}

/**
 * `petPolicyDefault` is an **int 0/1** in the manifest and a **boolean** in
 * `DecisionConfig` (`ContextCreator.java:785` passes `petPolicyDefault == 1`).
 * `1 = admit` is the inert default; `0 = refuse` is the ER/SE configuration
 * (A-29: the 2020 record is silent, so unrecorded sites refuse). Getting this
 * polarity backwards produces a run with **zero** policy refusals that otherwise
 * looks entirely healthy — QUIRK 13.
 */
export function petPolicyAdmitDefaultFromInt(petPolicyDefault: number): boolean {
  return petPolicyDefault === 1;
}

export interface PetPolicyCensus {
  readonly sites: number;
  readonly operatingSites: number;
  /** Operating sites recording `pet_intake = admit`. */
  readonly admitSites: number;
  /** Operating sites recording any other non-blank value. */
  readonly refuseSites: number;
  /** Operating sites with no recorded policy — the `petPolicyDefault` path. */
  readonly unrecordedSites: number;
  /** Beds at operating `admit` sites (`capacity === null` counts as 0 beds). */
  readonly admitBeds: number;
  /** Beds across operating, capacity-limited sites. */
  readonly operatingBeds: number;
  /** Operating sites that would admit a pet owner **under this default**. */
  readonly effectiveAdmitSites: number;
  readonly effectiveAdmitBeds: number;
}

/**
 * Census of where a pet owner can actually be admitted, given the run-wide
 * default. The `effective*` fields are the ones that matter behaviourally:
 * flipping `petPolicyDefault` from 0 to 1 moves every **blank** site into the
 * admitting set, which is exactly what makes `Peninsula_Crossing_SRV`,
 * `Queer_Affinity_Village` and `Doreens_Place` go from 10 / 22 / 64 policy
 * refusals to zero.
 */
export function petPolicyCensus(
  shelters: readonly Shelter[],
  petPolicyAdmitDefault: boolean,
): PetPolicyCensus {
  let operatingSites = 0;
  let admitSites = 0;
  let refuseSites = 0;
  let unrecordedSites = 0;
  let admitBeds = 0;
  let operatingBeds = 0;
  let effectiveAdmitSites = 0;
  let effectiveAdmitBeds = 0;
  for (const s of shelters) {
    if (!s.operating) {
      continue;
    }
    operatingSites += 1;
    const beds = s.capacity ?? 0;
    operatingBeds += beds;
    if (s.petIntake === null) {
      unrecordedSites += 1;
    } else if (s.petIntake) {
      admitSites += 1;
      admitBeds += beds;
    } else {
      refuseSites += 1;
    }
    if (petAdmittedAt(s, petPolicyAdmitDefault)) {
      effectiveAdmitSites += 1;
      effectiveAdmitBeds += beds;
    }
  }
  return {
    sites: shelters.length,
    operatingSites,
    admitSites,
    refuseSites,
    unrecordedSites,
    admitBeds,
    operatingBeds,
    effectiveAdmitSites,
    effectiveAdmitBeds,
  };
}
