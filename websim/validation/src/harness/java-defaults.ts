/**
 * java-defaults.ts — `ContextCreator.build()`'s parameter fallback table.
 *
 * Repast builds a batch run's parameter schema from the params file it was
 * given, so a params file written before a parameter existed simply does not
 * carry it and `parm.getValue(name)` throws. `ContextCreator` therefore reads
 * every switch through `intParam(parm, name, fallback)` /
 * `doubleParam(parm, name, fallback)`, and the comment above that block states
 * the contract these fallbacks keep:
 *
 * > *"All three default to the pre-existing behaviour, so the archived baseline
 * > reproduces byte-identically unless a switch is turned on."*
 *
 * That is what makes replaying a pre-Phase-E archived manifest legitimate at
 * all. The `present-day-three-arm/` runs were executed by a build whose logger
 * wrote **11** parameters; the `phase-e/` runs wrote 33; `scenario-e/` 40 and
 * `scenario-e-v2/` 41. A replay driven from an 11-parameter manifest is missing
 * 30 names, and the only defensible thing to fill them with is the value the
 * Java code itself would have used — which for every one of them is the
 * behaviour-preserving default recorded here.
 *
 * ## Transcribed, with line numbers, from the instrument
 *
 * `Geography/src/geography/agents/ContextCreator.java`, `build()`:
 *
 * | block | lines | names |
 * |---|---|---|
 * | scenario / feature switches | 248–255 | `scenarioCode` … `triageReserveFraction` |
 * | Phase-E decision layer (V29–V45) | 264–302 | `enableDecisionLayer` … `shelterPolicyVariant` |
 * | Scenario-E smoke + closures (V46–V51) | 312–322 | `smokeSeriesCode` … `closureDraw` |
 *
 * The seven names NOT here — `numAgents`, `minutesPerTick`, `walkingSpeedMps`,
 * `shelterArrivalDistanceM`, `simulationHours`, `randomSeed`,
 * `evacuationThresholdUgM3` — are read *without* a fallback (`parm.getValue`,
 * or `RandomHelper.getSeed()`), so a manifest that lacked one would describe a
 * run that could not have happened. {@link javaCodeDefault} refuses to invent
 * them, and the replay builder turns that refusal into a hard error rather than
 * a silent substitution.
 *
 * ## Two values in here are load-bearing and easy to get wrong
 *
 *  - `pushThetaThreshold: -0.25`. Negative, and it is the fourth never-regress
 *    gotcha: Repast's batch loader zeroes negative `constant_type="number"`
 *    constants, which is why archived Scenario-E runs *executed* 0.0 while the
 *    registry says −0.25. The **code** default is −0.25; the **executed** value
 *    in those runs is 0.0 and comes from the manifest, which always wins here.
 *  - `groupSpeedDeltaMps: 0.0`, not the sourced 0.06. The instrument's own
 *    comment explains why: a sourced default would make the
 *    "every default is behaviour-preserving" guarantee false.
 */

/**
 * Every name `ContextCreator` reads through a fallback, with that fallback.
 *
 * Frozen and exported as data rather than baked into the replay builder so that
 * a test can assert it against the archived manifests — the `phase-e/`
 * manifests carry 33 of these names explicitly, and every one of them agrees
 * with this table wherever the batch file did not override it.
 */
export const JAVA_CODE_DEFAULTS: Readonly<Record<string, number>> = Object.freeze({
  // -- scenario / feature switches (ContextCreator.java:248–255) -------------
  scenarioCode: 0,
  enableHeterogeneity: 0,
  respectShelterOpeningDates: 0,
  triageReserveFraction: 0.0,

  // -- Phase-E decision layer, V29–V45 (ContextCreator.java:264–302) ---------
  enableDecisionLayer: 0,
  pAwareInit: 1.0,
  pHeavyBelongings: 0.284,
  pHasPet: 0.117,
  pHasDependents: 0.0044,
  groupSpeedDeltaMps: 0.0,
  lambdaOutreachPerDay: 0.0,
  informationRegime: 0,
  enableHazardDeparture: 0,
  sigmaTheta: 0.0,
  alphaHazard: -8.0,
  bRisk: 0.4,
  wOfficial: 1.1,
  gammaVuln: 0.0,
  riskHalfLifeH: 48.0,
  barrierBelongings: 0.0,
  barrierPet: 0.0,
  barrierDependents: 0.0,
  petPolicyDefault: 1,
  betaTravelTime: 1.0,
  betaCapacityPrior: 0.0,
  shelterPolicyVariant: 0,

  // -- Scenario E, V46–V51 (ContextCreator.java:312–322) --------------------
  smokeSeriesCode: 0,
  smokeScale: 1.0,
  closuresCode: 0,
  pStuck: 0.3,
  stuckDelayH: 3.0,
  pushThetaThreshold: -0.25,
  kPush: 1.0,
  closureDraw: 1,
});

/**
 * The seven parameters `ContextCreator` reads with no fallback at all. A
 * manifest missing one of these is not a manifest a replay may guess around.
 */
export const NO_FALLBACK_PARAMS: readonly string[] = Object.freeze([
  "numAgents",
  "minutesPerTick",
  "walkingSpeedMps",
  "shelterArrivalDistanceM",
  "simulationHours",
  "randomSeed",
  "evacuationThresholdUgM3",
]);

/** The Java code default for `name`, or `undefined` if it has none. */
export function javaCodeDefault(name: string): number | undefined {
  return Object.prototype.hasOwnProperty.call(JAVA_CODE_DEFAULTS, name)
    ? JAVA_CODE_DEFAULTS[name]
    : undefined;
}
