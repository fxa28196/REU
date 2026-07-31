/**
 * The six-state resident automaton (PORT_MAP §1.4, `GisAgent.State`).
 *
 * The transition table below is **data, not prose**: `step.ts` reads its guards
 * through the predicates exported here and `stateMachine.test.ts` asserts the
 * table's shape, so a table row and the code cannot drift apart the way a
 * comment and the code can.
 *
 * ## The two asymmetries that a port gets wrong
 *
 * 1. **`UNREACHABLE` is terminal; `REFUSED_ALL_FULL` is not.** They look like
 *    siblings — both mean "I have nowhere to go" — but shelters open on
 *    different real dates (OCC 2020-09-10, CJ 2020-09-11), so "everywhere is
 *    full right now" must be re-evaluated **every tick**, while "nothing is
 *    reachable on the street graph" can never change without a closure wave
 *    (and a wave only ever removes edges). Treating REFUSED_ALL_FULL as
 *    terminal left 99 real beds unused in the certified model's own history.
 * 2. **`MAX_RETARGETS = 8` is per EPISODE, not per run.** Re-entry from
 *    REFUSED_ALL_FULL resets `retargetCount` to 0. That is why L0 must record
 *    policy refusals into `believedFull`: without it, the omniscient chooser
 *    re-selects the refusing door, the counter caps, the agent drops to
 *    REFUSED_ALL_FULL, re-entry resets the counter, and the cycle never ends.
 *    (L1 is uncapped by design — the belief set is the bound.)
 *
 * ## The other asymmetry: `>` vs `>=`
 *
 * `hoursAboveUnhealthy` accrues on **strict `>`** 55.5 while the legacy latch
 * and the Phase-E risk cue `z_R` both fire on **`>=`** 55.5. This is deliberate
 * in the certified source and is *not* to be "harmonised": the archived
 * `hours_above_unhealthy` column and every departure tick depend on it.
 * {@link UNHEALTHY_UGM3} is the single constant both read.
 *
 * WP7 ships the LEGACY-LATCH rows only. The hazard/outreach rows are declared
 * here (so the table is the whole contract, and so WP8 cannot quietly invent a
 * different one) and carry `layer: true`; `step.ts` asserts it never reaches
 * one while `decisionConfig` is null.
 */

/** `GisAgent.State`, with the exact `toString()` spellings `final_state` carries. */
export const STATES = [
  "PRE_EVAC",
  "EN_ROUTE",
  "SHELTERED",
  "UNREACHABLE",
  "REFUSED_ALL_FULL",
  "UNAWARE",
] as const;

export type State = (typeof STATES)[number];

/**
 * EPA "Unhealthy" breakpoint lower bound, µg/m³ (`GisAgent.UNHEALTHY_UGM3`).
 * A **concentration** threshold — never a 24-hour AQI category.
 */
export const UNHEALTHY_UGM3 = 55.5;

/** `GisAgent.INHALATION_WALKING_M3H` — moderate activity, EPA EFH (2011) ch. 6. */
export const INHALATION_WALKING_M3H = 1.62;

/** `GisAgent.INHALATION_RESTING_M3H` — light activity, same source. */
export const INHALATION_RESTING_M3H = 0.61;

/** `GisAgent.MAX_RETARGETS`. L0 only, and **per episode** — see the module doc. */
export const MAX_RETARGETS = 8;

/** V34 floor on the group-pace-adjusted speed (`Math.max(0.40, v − delta)`). */
export const GROUP_PACE_FLOOR_MPS = 0.4;

/** `chooseShelterByUtility`'s documented ln-cap for capacity-unlimited sites. */
export const UNCAPPED_CAPACITY_PRIOR = 10000;

/** States in which a resident is outdoors and still accruing exposure. */
export function accruesExposure(state: State): boolean {
  return state !== "SHELTERED";
}

/**
 * States from which the certified `step()` returns before the movement block.
 * `EN_ROUTE` is the only state that walks; everything else either departs into
 * it this tick or persists in place.
 */
export function isTerminalForMovement(state: State): boolean {
  return state !== "EN_ROUTE";
}

/**
 * `UNREACHABLE` is the only genuinely absorbing state. `SHELTERED` is absorbing
 * for behaviour but is not "terminal" in the same sense — it is the study
 * endpoint, and the distinction matters because the exposure block skips
 * SHELTERED while still running for UNREACHABLE.
 */
export function isAbsorbing(state: State): boolean {
  return state === "UNREACHABLE" || state === "SHELTERED";
}

/** Ventilation rate for the tick, m³/h (`GisAgent.step()` exposure block). */
export function ventilationM3h(state: State, stuckNow: boolean): number {
  return state === "EN_ROUTE" && !stuckNow ? INHALATION_WALKING_M3H : INHALATION_RESTING_M3H;
}

/**
 * The legacy bright-line latch guard (`cNow >= evacuationThresholdUgM3`).
 *
 * **`>=`, not `>`** — the mirror image of the strict `>` used for
 * `hoursAboveUnhealthy`. Both live in this module so the pair is visible at
 * once; `assertThresholdAsymmetry` is the executable form of that claim.
 */
export function latchFires(cNow: number, evacuationThresholdUgM3: number): boolean {
  return cNow >= evacuationThresholdUgM3;
}

/** `if (c > UNHEALTHY_UGM3) hoursAboveUnhealthy += dt` — **strict**. */
export function countsAsAboveUnhealthy(c: number): boolean {
  return c > UNHEALTHY_UGM3;
}

/** `zR = zR*decay + (cNow >= UNHEALTHY_UGM3 ? 1/24 : 0)` — **inclusive**. */
export function riskCueFires(cNow: number): boolean {
  return cNow >= UNHEALTHY_UGM3;
}

export interface Transition {
  readonly from: State;
  /** `null` where the row is a documented *non*-transition (UNAWARE stays put). */
  readonly to: State | null;
  readonly condition: string;
  readonly sideEffects: string;
  /** `true` when the row can only fire with the Phase-E decision layer armed. */
  readonly layer: boolean;
}

/**
 * PORT_MAP §1.4, row for row and in the same order. Rows with `layer: true`
 * belong to WP8; `step.ts`'s legacy branch must never take one.
 */
export const TRANSITIONS: readonly Transition[] = [
  {
    from: "UNAWARE",
    to: "PRE_EVAC",
    condition: "newHour ∧ lambdaOutreachPerDay > 0 ∧ decisionRng.nextDouble() < λ/24",
    sideEffects: "awareTick = tick",
    layer: true,
  },
  {
    from: "UNAWARE",
    to: null,
    condition: "otherwise",
    sideEffects: "return (exposure already accrued)",
    layer: true,
  },
  {
    from: "PRE_EVAC",
    to: "EN_ROUTE",
    condition: "LEGACY LATCH: cNow >= evacuationThresholdUgM3 ∧ anyShelterOpen — every tick",
    sideEffects: "evacuationTick = tick",
    layer: false,
  },
  {
    from: "PRE_EVAC",
    to: "EN_ROUTE",
    condition: "HAZARD: newHour ∧ open ∧ decisionRng.nextDouble() < 1/(1+e^-u)",
    sideEffects: "evacuationTick = tick",
    layer: true,
  },
  {
    from: "EN_ROUTE",
    to: "SHELTERED",
    condition: "path consumed ∧ !policyRefused ∧ isOpenAt(tick) ∧ admit(isPriority)",
    sideEffects: "arrivalTick = tick; occupancy++, peak updated; exposure stops forever",
    layer: false,
  },
  {
    from: "EN_ROUTE",
    to: "EN_ROUTE",
    condition: "reached door but refused (policy / closed / full)",
    sideEffects:
      "policy → recordPolicyRefusal(); belief update; currentNodeId = shelter node; route cleared; retargetCount++",
    layer: false,
  },
  {
    from: "EN_ROUTE",
    to: "REFUSED_ALL_FULL",
    condition: "L0 only: after refusal, retargetCount > MAX_RETARGETS (8)",
    sideEffects: "—",
    layer: false,
  },
  {
    from: "EN_ROUTE",
    to: "REFUSED_ALL_FULL",
    condition: "chooser: anyReachable but nothing selectable",
    sideEffects: "—",
    layer: false,
  },
  {
    from: "EN_ROUTE",
    to: "UNREACHABLE",
    condition: "chooser: no operating+open shelter with finite tree distance",
    sideEffects: "TERMINAL",
    layer: false,
  },
  {
    from: "REFUSED_ALL_FULL",
    to: "EN_ROUTE",
    condition: "re-checked EVERY tick: L0 anyShelterAvailable; L1 anyUntriedReachableShelter",
    sideEffects: "retargetCount = 0; target, route and pathIndex cleared",
    layer: false,
  },
  {
    from: "SHELTERED",
    to: null,
    condition: "terminal; exposure block skipped",
    sideEffects: "—",
    layer: false,
  },
];

/** The legacy-latch subset — the rows WP7 is allowed to take. */
export const LEGACY_TRANSITIONS: readonly Transition[] = TRANSITIONS.filter((t) => !t.layer);
