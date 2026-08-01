/**
 * The branch register of the decision layer, and the optional probe that counts
 * it.
 *
 * ## Why this exists in production code rather than in a test helper
 *
 * WP8's acceptance says "every decision branch the oracle exercised must be
 * exercised by a test". The oracle can say that about the Java because
 * `DecisionProbe.java` carries 72 counters *inside the certified frame*
 * (DR-WP8-decision-oracle.md §2). A port that answered the same question from
 * outside — by counting rows it happened to compare — would be measuring its
 * test fixtures, not its code. So the port carries the same 72 counters, with
 * the same ids and the same names, at the same 72 decision points, and the
 * coverage test compares **counter to counter** against `coverage-union.tsv`.
 *
 * ## What it costs when it is off
 *
 * One `!== null` test per branch point. The probe is `null` by default and is
 * never installed by `Simulation`; DR-S3 measured the tick loop as ~95% geodesic
 * and ~5% everything else, so this is not the lever and has not been made one.
 * Nothing here allocates, formats or emits while the probe is null.
 *
 * ## What it must never become
 *
 * A behaviour hook. {@link DecisionProbe.branch} returns `void`, is called
 * *after* the decision it observes, and no engine code may read a counter back.
 * The Java probe's neutrality gate is the model for that discipline: it was
 * proved by running the instrumented and uninstrumented builds side by side and
 * requiring byte identity. The TS analogue is `oracle.trace.test.ts`'s
 * probe-on/probe-off identity case.
 */

/**
 * `DecisionProbe.BRANCHES` from the Java oracle, verbatim and in dump order.
 *
 * The strings are the join key against `coverage.tsv` / `coverage-union.tsv`;
 * they are transcribed, not derived, and `oracle.trace.test.ts` asserts the two
 * lists are equal element for element. A renamed branch on either side is a
 * failing test, not a silent gap.
 */
export const DECISION_BRANCHES = [
  /* 00 */ "BR-01 build: awareInitial=true -> PRE_EVAC, awareTick=0",
  /* 01 */ "BR-02 build: awareInitial=false -> UNAWARE, awareTick=NaN",
  /* 02 */ "BR-03 block3 group pace APPLIED (groupSpeedDeltaMps > 0)",
  /* 03 */ "BR-04 block3 group pace SKIPPED (groupSpeedDeltaMps == 0)",
  /* 04 */ "BR-05 block6b newHour == true",
  /* 05 */ "BR-06 block6b newHour == false",
  /* 06 */ "BR-07 block6c zR increment FIRES (cNow >= 55.5)",
  /* 07 */ "BR-08 block6c zR increment ZERO (cNow < 55.5)",
  /* 08 */ "BR-09 departure block entered while UNAWARE",
  /* 09 */ "BR-10 D1 outreach draw CONSUMED",
  /* 10 */ "BR-11 D1 skipped: lambdaOutreachPerDay == 0",
  /* 11 */ "BR-12 D1 skipped: !newHour",
  /* 12 */ "BR-13 outreach conversion UNAWARE -> PRE_EVAC",
  /* 13 */ "BR-14 UNAWARE return (still unaware)",
  /* 14 */ "BR-15 hazard branch entered (enableHazardDeparture == 1)",
  /* 15 */ "BR-16 hazard: open == true",
  /* 16 */ "BR-17 hazard: open == false (D2 suppressed by short-circuit)",
  /* 17 */ "BR-18 hazard: vulnerable == true (gammaVuln applied)",
  /* 18 */ "BR-19 hazard: vulnerable == false",
  /* 19 */ "BR-20 D2 hazard draw CONSUMED",
  /* 20 */ "BR-21 hazard departure FIRED (-> EN_ROUTE)",
  /* 21 */ "BR-22 hazard 'still waiting' return",
  /* 22 */ "BR-23 latch site A (layer on, hazard off) FIRED",
  /* 23 */ "BR-24 latch site A returned (waiting)",
  /* 24 */ "BR-25 latch site B (layer OFF) FIRED",
  /* 25 */ "BR-26 latch site B returned (waiting)",
  /* 26 */ "BR-27 same agent-tick D1 then D2 (two draws)",
  /* 27 */ "BR-28 REFUSED_ALL_FULL re-entry evaluated under L1",
  /* 28 */ "BR-29 REFUSED_ALL_FULL re-entry evaluated under L0/legacy",
  /* 29 */ "BR-30 REFUSED_ALL_FULL re-entry BLOCKED (return)",
  /* 30 */ "BR-31 REFUSED_ALL_FULL re-entry GRANTED (-> EN_ROUTE, counter reset)",
  /* 31 */ "BR-32 stuck HELD (tick < stuckUntilTick, return)",
  /* 32 */ "BR-33 stuck delay SERVED (stuckUntilTick cleared)",
  /* 33 */ "BR-34 closure scan: NO hit (version consumed, return)",
  /* 34 */ "BR-35 closure scan: HIT (blockagesEncountered++)",
  /* 35 */ "BR-36 push rule TRUE",
  /* 36 */ "BR-37 push rule FALSE (reroute)",
  /* 37 */ "BR-38 D3 stuck draw CONSUMED",
  /* 38 */ "BR-39 stuck event SET (draw < pStuck)",
  /* 39 */ "BR-40 push through WITHOUT stuck",
  /* 40 */ "BR-41 reroute executed (currentNodeId rewound)",
  /* 41 */ "BR-42 planning: chooseShelterByUtility (L1)",
  /* 42 */ "BR-43 planning: chooseNetworkNearestShelter (L0/legacy)",
  /* 43 */ "BR-44 candidate skipped: !isOperating",
  /* 44 */ "BR-45 candidate skipped: !isOpenAt(tick)",
  /* 45 */ "BR-46 candidate skipped: routeTree == null",
  /* 46 */ "BR-47 candidate skipped: distanceTo == +Infinity (unreachable)",
  /* 47 */ "BR-48 candidate skipped: believedFull (L1)",
  /* 48 */ "BR-49 candidate skipped: excludedByBelief (L0)",
  /* 49 */ "BR-50 L1 candidate capacity == null -> UNCAPPED_CAPACITY_PRIOR",
  /* 50 */ "BR-51 L1 candidate capacity != null",
  /* 51 */ "BR-52 L1 selection by strict v > bestV",
  /* 52 */ "BR-53 L1 selection by TIE-BREAK (v == bestV && id.compareTo < 0)",
  /* 53 */ "BR-54 L1 tie at bestV NOT taken (id.compareTo >= 0)",
  /* 54 */ "BR-55 L0 candidate has space and dM < bestDistM (selected)",
  /* 55 */ "BR-56 L0 candidate has NO space",
  /* 56 */ "BR-57 chooser -> REFUSED_ALL_FULL (anyReachable, none selectable)",
  /* 57 */ "BR-58 chooser -> UNREACHABLE (nothing reachable)",
  /* 58 */ "BR-59 networkDistToShelterM FIRST write (V11 NaN guard)",
  /* 59 */ "BR-60 networkDistToShelterM already set (retarget leg)",
  /* 60 */ "BR-61 routeNodes ALLOCATED (hasClosureSchedule)",
  /* 61 */ "BR-62 routeNodes null (no closure schedule)",
  /* 62 */ "BR-63 door: ADMITTED -> SHELTERED",
  /* 63 */ "BR-64 door: policyRefused via PET",
  /* 64 */ "BR-65 door: policyRefused via DEPENDENTS (adults-only site)",
  /* 65 */ "BR-66 door: refused because !isOpenAt (closed; NO counter)",
  /* 66 */ "BR-67 door: refused on CAPACITY (admit() returned false)",
  /* 67 */ "BR-68 door: belief recorded under L1",
  /* 68 */ "BR-69 door: belief recorded under L0 (policy refusal only)",
  /* 69 */ "BR-70 door: NO belief recorded (L0 capacity/closed refusal)",
  /* 70 */ "BR-71 door: L0 cap fired (retargetCount > 8 -> REFUSED_ALL_FULL)",
  /* 71 */ "BR-72 door: priority arrival (isPriorityForAdmission == true)",
] as const;

/** Branch indices, mirroring `DecisionProbe.BR_*` exactly. */
export const BR = {
  AWARE_INIT: 0,
  UNAWARE_INIT: 1,
  PACE_ON: 2,
  PACE_OFF: 3,
  NEWHOUR: 4,
  SAMEHOUR: 5,
  CUE_FIRES: 6,
  CUE_ZERO: 7,
  UNAWARE_BLOCK: 8,
  D1: 9,
  D1_SKIP_LAMBDA: 10,
  D1_SKIP_HOUR: 11,
  CONVERTED: 12,
  UNAWARE_RETURN: 13,
  HAZARD_BRANCH: 14,
  OPEN_TRUE: 15,
  OPEN_FALSE: 16,
  VULN_TRUE: 17,
  VULN_FALSE: 18,
  D2: 19,
  HAZARD_FIRED: 20,
  HAZARD_WAIT: 21,
  LATCH_A_FIRE: 22,
  LATCH_A_WAIT: 23,
  LATCH_B_FIRE: 24,
  LATCH_B_WAIT: 25,
  D1_THEN_D2: 26,
  REENTRY_L1: 27,
  REENTRY_L0: 28,
  REENTRY_BLOCKED: 29,
  REENTRY_GRANTED: 30,
  STUCK_HELD: 31,
  STUCK_SERVED: 32,
  SCAN_NOHIT: 33,
  SCAN_HIT: 34,
  PUSH_TRUE: 35,
  PUSH_FALSE: 36,
  D3: 37,
  STUCK_SET: 38,
  PUSH_NO_STUCK: 39,
  REROUTE: 40,
  PLAN_L1: 41,
  PLAN_L0: 42,
  SKIP_OPERATING: 43,
  SKIP_OPENAT: 44,
  SKIP_TREE: 45,
  SKIP_INF: 46,
  SKIP_BELIEF_L1: 47,
  SKIP_BELIEF_L0: 48,
  CAP_NULL: 49,
  CAP_SET: 50,
  PICK_STRICT: 51,
  PICK_TIE: 52,
  TIE_NOT_TAKEN: 53,
  L0_SPACE: 54,
  L0_NOSPACE: 55,
  TERM_REFUSED: 56,
  TERM_UNREACH: 57,
  V11_FIRST: 58,
  V11_STALE: 59,
  ROUTENODES_ON: 60,
  ROUTENODES_OFF: 61,
  DOOR_ADMIT: 62,
  DOOR_PET: 63,
  DOOR_DEP: 64,
  DOOR_CLOSED: 65,
  DOOR_CAPACITY: 66,
  BELIEF_L1: 67,
  BELIEF_L0: 68,
  BELIEF_NONE: 69,
  CAP_FIRED: 70,
  PRIORITY: 71,
} as const;

export type BranchId = (typeof BR)[keyof typeof BR];

/** Observer of decision branches. Counting only; it must never steer anything. */
export interface DecisionProbe {
  branch(id: BranchId): void;
}

let installed: DecisionProbe | null = null;

/** Install (or, with `null`, remove) the process-wide probe. Tests only. */
export function setDecisionProbe(probe: DecisionProbe | null): void {
  installed = probe;
}

/** Record one branch. Inlines to a null test when no probe is installed. */
export function hit(id: BranchId): void {
  if (installed !== null) {
    installed.branch(id);
  }
}

/** A plain counting probe — the only implementation the engine ships. */
export class CountingDecisionProbe implements DecisionProbe {
  readonly counts: Int32Array = new Int32Array(DECISION_BRANCHES.length);

  branch(id: BranchId): void {
    this.counts[id]!++;
  }

  count(id: BranchId): number {
    return this.counts[id]!;
  }

  reset(): void {
    this.counts.fill(0);
  }

  /** Branch names with a zero counter — what a coverage gate reports. */
  untriggered(): string[] {
    const out: string[] = [];
    for (let i = 0; i < DECISION_BRANCHES.length; i++) {
      if (this.counts[i] === 0) {
        out.push(DECISION_BRANCHES[i]!);
      }
    }
    return out;
  }
}
