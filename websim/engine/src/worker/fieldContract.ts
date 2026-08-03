/**
 * The field contract the snapshot machinery is written against, and the guard
 * that makes a drift in the engine core a loud failure instead of a silent
 * incomplete snapshot.
 *
 * ## Why this file exists at all
 *
 * `snapshot.ts` has to save and restore state that the engine core keeps in
 * TypeScript-`private` fields — `Simulation.tickValue`, `Shelter.occupancyValue`,
 * `ClosureRuntime.version`, `BlockedEdges.pairs`. `private` is erased at compile
 * time, so reading them works; the danger is the opposite direction. If someone
 * renames `occupancyValue` to `occupants`, a snapshot that reads
 * `(s as never).occupancyValue` silently captures `undefined`, restore silently
 * writes a dead property, and **the byte-identity property still passes** —
 * because the live field was never touched in either direction, so both runs
 * agree. A missing field is invisible to a self-consistent comparison.
 *
 * That is the exact shape of the failure this project keeps re-learning (a claim
 * true today that nothing would notice breaking), so it is closed structurally:
 * every private name the snapshot depends on is listed here, and
 * {@link assertFieldContract} checks that each is an **own property of the live
 * object** before any capture is allowed. A rename in the frozen core then fails
 * with the missing name, on the first snapshot, rather than degrading into a
 * snapshot of nothing.
 *
 * The public field lists are here for the same reason in the other direction:
 * `engine/test/worker/field-coverage.test.ts` reflects over a freshly
 * constructed `Resident`/`Shelter` and fails when an own property exists that
 * no list mentions. Add a field to the engine core and the snapshot suite goes
 * red until the field is either snapshotted or explicitly declared immutable.
 */

/**
 * `Resident` fields the snapshot carries as plain numbers, in a fixed order.
 *
 * The order is the layout of the per-resident stride inside
 * {@link import("./snapshot.js").ResidentColumns.nums}; it is written down once
 * and read by index everywhere, so capture and restore cannot disagree about
 * which slot is which.
 */
export const RESIDENT_NUMBER_FIELDS = [
  "posLon",
  "posLat",
  "currentNode",
  "legApproachM",
  "legTravelM",
  "legFromLon",
  "legFromLat",
  "retargetCount",
  "arrivalTick",
  "evacuationTick",
  "networkDistToShelterM",
  "distanceTraveledM",
  "plannedRouteM",
  "snapGapM",
  "exposureUgM3h",
  "vweUgM3h",
  "exposureWhileTravelingUgM3h",
  "hoursAboveUnhealthy",
  "inhaledDoseUg",
  "airVolumeBreathedM3",
  "peakConcUgM3",
  "outdoorHours",
  "thetaScaled",
  "barrierCost",
  "awareTick",
  "zR",
  "lastDecisionHour",
  "seenClosureVersion",
  "blockagesEncountered",
  "pushThroughs",
  "reroutes",
  "stuckEvents",
  "stuckUntilTick",
] as const;

export type ResidentNumberField = (typeof RESIDENT_NUMBER_FIELDS)[number];

/** `Resident` fields the snapshot carries by other means than a number slot. */
export const RESIDENT_REFERENCE_FIELDS = [
  "state", // -> STATES index
  "targetShelter", // -> shelter index, or -1
  "leg", // -> reference; RouteLeg is immutable once built
  "routeNodes", // -> reference; RouteNodes is immutable once built
  "believedFull", // -> deep copy, insertion order preserved
  "pushedBlockages", // -> deep copy, insertion order preserved
  "decisionRng", // -> JavaRandomState
  "decisionConfig", // -> reference (one run-wide instance)
  "decision", // -> reference (immutable sampled attributes)
] as const;

/**
 * `Resident` fields no tick can change, so the snapshot does not carry them.
 *
 * Every one of these is `readonly` in the class, which is the reason they are
 * listed rather than snapshotted — but `readonly` is also compile-time only, so
 * `engine/test/worker/field-coverage.test.ts` runs a full simulation and asserts
 * they are byte-unchanged from construction rather than trusting the modifier.
 */
export const RESIDENT_IMMUTABLE_FIELDS = [
  "index",
  "name",
  "encampmentId",
  "startLon",
  "startLat",
  "startNode",
  "ageRR",
  "comorbidityRR",
  "attributes",
] as const;

/**
 * `Shelter` state the snapshot carries as numbers, in a fixed slot order.
 *
 * The first five are the run-mutable counters; `openTickValue`/`closeTickValue`
 * and the snap fields are build-time constants included anyway, so that
 * restoring a snapshot into a *separately built* `Simulation` is fully defined
 * rather than defined-if-the-builds-agree.
 */
export const SHELTER_NUMBER_FIELDS = [
  "reserved",
  "occupancyValue",
  "peakOccupancyValue",
  "refusedCountValue",
  "policyRefusedCountValue",
  "openTickValue",
  "closeTickValue",
  "graphNode",
  "graphNodeId",
  "snapGapM",
] as const;

export type ShelterNumberField = (typeof SHELTER_NUMBER_FIELDS)[number];

/** `Shelter` fields carried by other means. */
export const SHELTER_REFERENCE_FIELDS = [
  "routeTree", // -> reference; a wave REPLACES the tree, never mutates it
  "petIntake", // -> tri-state
  "adultsOnly",
] as const;

/** `Shelter` identity fields fixed at construction. */
export const SHELTER_IMMUTABLE_FIELDS = ["id", "name", "capacity", "operating", "lon", "lat"] as const;

/**
 * Every private own-property name the snapshot reaches for, grouped by the
 * class that owns it. {@link assertFieldContract} is the enforcement.
 */
export const PRIVATE_FIELD_CONTRACT = {
  Simulation: [
    "tickValue",
    "order",
    "openTick",
    "openValue",
    "availTick",
    "availEpoch",
    "admissionEpoch",
    "availAny",
    "availPriority",
    "untriedTick",
    "untriedOpen",
  ],
  Shelter: [
    "reserved",
    "occupancyValue",
    "peakOccupancyValue",
    "refusedCountValue",
    "policyRefusedCountValue",
    "openTickValue",
    "closeTickValue",
  ],
  ClosureRuntime: ["version", "cursor", "reports"],
  BlockedEdges: ["flags", "pairs", "pairEndpoints"],
  SmokeField: ["oorLookups"],
} as const satisfies Record<string, readonly string[]>;

export type ContractClass = keyof typeof PRIVATE_FIELD_CONTRACT;

/** Thrown when the engine core no longer has a field the snapshot depends on. */
export class FieldContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldContractError";
  }
}

/**
 * Assert that `obj` still carries every own property {@link
 * PRIVATE_FIELD_CONTRACT} names for `cls`.
 *
 * `Object.hasOwn` rather than `in`: the fields are declared as class fields and
 * the package compiles with `useDefineForClassFields`, so each one is an own
 * data property of every instance. A prototype accessor of the same name — a
 * getter someone added while moving the state elsewhere — must NOT satisfy this
 * check, because writing to it would not be a state restore.
 */
export function assertFieldContract(cls: ContractClass, obj: object): void {
  const missing: string[] = [];
  for (const field of PRIVATE_FIELD_CONTRACT[cls]) {
    if (!Object.hasOwn(obj, field)) {
      missing.push(field);
    }
  }
  if (missing.length > 0) {
    throw new FieldContractError(
      `${cls} no longer owns ${missing.length} field(s) the snapshot depends on ` +
        `(${missing.join(", ")}). The engine core was changed without updating ` +
        "engine/src/worker/fieldContract.ts; a snapshot taken now would silently capture " +
        "undefined and restore nothing, and the byte-identity property would still pass " +
        "because both runs would be equally wrong.",
    );
  }
}
