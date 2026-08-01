/**
 * The TRIAGE RESERVE — arm D's need-based admission
 * (WP8-SPEC-severe-triage-pets.md §2; `ContextCreator.java:560-568, 605-622`,
 * `Shelter.java:52-58, 117-141`).
 *
 * The reserve is three lines of arithmetic and four ways to get it wrong:
 *
 * 1. **FLOOR, not round** (`ContextCreator.java:567`). "Hold 10%" that rounded
 *    up would hold *more* than 10% at every odd-sized site, and the conservative
 *    direction is the one that cannot flatter the intervention. The realised
 *    share is therefore always **below** the nominal fraction — 9.62% / 9.75% /
 *    9.68% at f = 0.10 on the three arm files, never 10.00%.
 * 2. **The IEEE double product, never exact decimal** (QUIRK 8). Java computes
 *    `(int) Math.floor(capacity.intValue() * triageReserveFraction)` on a
 *    `double`. `90 * 0.7 === 62.99999999999999`, so Java holds **62** where a
 *    decimal library would hold 63 — and 90 is a real arm-A capacity
 *    (`Clark_Center`, `Gresham_Womens_Shelter`, `Doreens_Place`). 49 such pairs
 *    exist in `capacity ∈ [1,1000] x f ∈ {0.01..0.99}`. Routing this through a
 *    decimal library would be a silent, plausible, wrong answer.
 * 3. **The guard is `capacity != null && fraction > 0.0`, strict `>`.** Exactly
 *    `0.0` skips the setter *entirely*, so the field keeps its initialiser `0`.
 *    That is why arms A/B/C reproduce bit-identically to the pre-arm-D engine:
 *    not "the reserve is zero", but "the reserve was never touched".
 * 4. **`capacity === null` means UNLIMITED, not zero** (QUIRK 9). A blank
 *    `capacity` cell disables the reserve outright — `setReservedForPriority`
 *    forces 0 — and `hasSpaceFor` returns `true` forever.
 *
 * **The reserve is never released.** There is no path: `reservedForPriority` is
 * written once at build time, occupancy is monotone (no departures are
 * modelled), and `ClosureWave.apply()` touches no capacity state. It is a hard
 * ceiling of `capacity - reserved` on non-priority admissions for the whole run,
 * and the only way those beds are ever used is a mobility-limited arrival. The
 * one thing that *looks* like a release is a shelter **opening** on a later
 * calendar date — an open-window event, which is what makes `REFUSED_ALL_FULL`
 * non-terminal. See {@link releaseRule}.
 *
 * Zero RNG: a reserve sweep is pure arithmetic and never reshuffles anything
 * (§5.1). What it *does* change is who reaches which door first — but only
 * through the per-tick agent shuffle, which is a different stream entirely.
 */

import type { Shelter } from "./shelter.js";

/** The fractions the archive actually ran (`PORT_MAP.md:346`): 131/18/3/1 runs. */
export const ARCHIVED_TRIAGE_FRACTIONS: readonly number[] = [0.0, 0.1, 0.15, 0.25];

/**
 * `(int) Math.floor(capacity.intValue() * triageReserveFraction)`, with the
 * `capacity != null && fraction > 0.0` guard folded in.
 *
 * Returns the number of beds to hold back, or `0` when the site is not
 * capacity-limited or the run is not using need-based admission. Note the
 * multiplication is a plain IEEE `double` product — see class doc point 2.
 */
export function triageReserveFor(capacity: number | null, triageReserveFraction: number): number {
  if (capacity === null || !(triageReserveFraction > 0.0)) {
    return 0;
  }
  // `(int)` truncation after Math.floor: identical for the non-negative products
  // the guard admits, and Math.trunc keeps the cast visible for a negative
  // fraction a UI might allow (the Shelter-side clamp then pulls it back to 0).
  return Math.trunc(Math.floor(capacity * triageReserveFraction));
}

export interface TriageCensus {
  /** `true` when `triageReserveFraction > 0.0` — the `[Triage] ... ON` branch. */
  readonly enabled: boolean;
  readonly fraction: number;
  /** Beds held back across **operating, capacity-limited** sites. */
  readonly reservedTotal: number;
  /** Capacity of those same sites. */
  readonly operatingCapacity: number;
  /** `100 * reservedTotal / operatingCapacity`, 0 when there is no capacity. */
  readonly realisedPercent: number;
  /** Operating sites whose reserve is strictly positive. */
  readonly sitesWithReserve: number;
  /** Operating sites with a blank capacity: unlimited, so never reserved. */
  readonly uncappedOperatingSites: number;
}

/**
 * Apply the reserve to a loaded shelter list and return the load-time census.
 *
 * Mirrors the two Java loops exactly, and their asymmetry is deliberate:
 *
 * - the **setter** runs inside the CSV load loop, so it touches *every* row,
 *   operating or not (`ContextCreator.java:565-568`);
 * - the **census** counts only `isOperating() && getCapacity() != null`
 *   (`:609-611`), and iterates `context.getObjects(Shelter.class)`, whose order
 *   is unspecified — inert here because it only sums, but never copy that
 *   iteration into anything order-sensitive.
 *
 * Call this once, at build. It is idempotent for a given fraction, but it is not
 * a runtime knob: see the "never released" note in the class doc.
 */
export function applyTriageReserve(
  shelters: readonly Shelter[],
  triageReserveFraction: number,
): TriageCensus {
  const enabled = triageReserveFraction > 0.0;
  if (enabled) {
    for (const s of shelters) {
      if (s.capacity !== null) {
        s.setReservedForPriority(triageReserveFor(s.capacity, triageReserveFraction));
      }
    }
  }
  return triageCensus(shelters, triageReserveFraction);
}

/** The `[Triage]` census without mutating anything — safe to call at any time. */
export function triageCensus(
  shelters: readonly Shelter[],
  triageReserveFraction: number,
): TriageCensus {
  let reservedTotal = 0;
  let operatingCapacity = 0;
  let sitesWithReserve = 0;
  let uncappedOperatingSites = 0;
  for (const s of shelters) {
    if (!s.operating) {
      continue;
    }
    if (s.capacity === null) {
      uncappedOperatingSites += 1;
      continue;
    }
    reservedTotal += s.reservedForPriority;
    operatingCapacity += s.capacity;
    if (s.reservedForPriority > 0) {
      sitesWithReserve += 1;
    }
  }
  return {
    enabled: triageReserveFraction > 0.0,
    fraction: triageReserveFraction,
    reservedTotal,
    operatingCapacity,
    realisedPercent: operatingCapacity === 0 ? 0.0 : (100.0 * reservedTotal) / operatingCapacity,
    sitesWithReserve,
    uncappedOperatingSites,
  };
}

/**
 * The exact `[Triage]` line `ContextCreator` prints at load, both branches.
 *
 * Reproduced verbatim (including the `%.3f` / `%.2f%%` shapes) because it is the
 * only human-readable statement of the realised-vs-nominal gap, and a run log
 * that quietly dropped it would let a reader assume "10%" meant 10%.
 */
export function triageLoadMessage(
  census: TriageCensus,
  fixed: (value: number, decimals: number) => string,
): string {
  if (!census.enabled) {
    return (
      "[Triage] need-based admission OFF (triageReserveFraction=0): admission is " +
      "first-come, first-served exactly as in arms A/B/C."
    );
  }
  return (
    `[Triage] need-based admission ON: reserve fraction ${fixed(census.fraction, 3)} -> ` +
    `${census.reservedTotal} of ${census.operatingCapacity} operating spaces held for ` +
    `mobility-limited arrivals (${fixed(census.realisedPercent, 2)}% realised after ` +
    "per-site floor)"
  );
}

/**
 * The release rule, stated as code so it cannot be "improved" by accident.
 *
 * There is exactly one question a caller can ask about releasing reserved beds,
 * and the answer is always the same one. Kept as a function rather than a
 * comment because WP8 reviewers asked for the rule to be *testable*: a future
 * change that adds a release path will fail the unit that asserts this returns
 * `"never"` for every input.
 */
export function releaseRule(): "never" {
  return "never";
}

/**
 * Would a **non-priority** arrival be turned away purely because of the reserve?
 *
 * `occupancy >= capacity - reserved` while `occupancy < capacity`. Diagnostic
 * only — it never mutates, so it is safe where {@link Shelter.admit} is not
 * (QUIRK 10). This is the state the archive says never occurred in the E arms:
 * zero of 36 sites in `SE-E20-seed42` stopped at `capacity - reserve`, because
 * arm B carries 6,842 beds for 6,842 residents and capacity never binds.
 */
export function blockedOnlyByReserve(shelter: Shelter): boolean {
  if (shelter.capacity === null || shelter.reservedForPriority === 0) {
    return false;
  }
  return !shelter.hasSpaceFor(false) && shelter.hasSpaceFor(true);
}
