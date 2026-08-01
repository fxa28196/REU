/**
 * `engine/src/decision` — the Phase-E human decision layer (WP8).
 *
 * A **strictly opt-in overlay**. Every resident carries `decisionConfig === null`
 * and `decision === null` unless the layer is armed, and every path in
 * `agents/step.ts` that reads this package is gated on both being non-null. With
 * the layer off, `step()` executes the WP7 legacy path statement for statement;
 * with it on but every mechanism degenerate (the "E0 null"), the executed
 * statements differ but the values do not, and the run is byte-identical to the
 * archived legacy arm. That identity, R3, is WP8's flagship acceptance criterion
 * and is protected here by live assertions, not by comments — see
 * {@link isE0NullConfig}, `armResident` and `step.ts`'s `assertNotE0Null`.
 *
 * The modules split along the certified source's own seams so each dumped
 * intermediate of the Java oracle has one function to compare against:
 *
 * | module | `GisAgent.java` | what the oracle pins it with |
 * |---|---|---|
 * | `config.ts` | 114-169 | `manifest.json`'s per-run block |
 * | `arm.ts` | 934-959 | `arm.tsv` (`thetaScaled`, `barrierCost`, state, `awareTick`) |
 * | `hazard.ts` | 365-421 | `hour.tsv` `b`/`zr`/`hz` rows (`decay`, `bRiskEff`, `u`, `p`) |
 * | `outreach.ts` | 384-393 | `draws.tsv` site `D1`, `transitions.tsv` cause `outreach` |
 * | `belief.ts` | 657-659, 567-576 | `door.tsv` refusal rows |
 * | `utilityChooser.ts` | 693-743 | `choice.tsv` `v`/`pick` rows |
 * | `pace.ts` | 320-324 | `choice.tsv` `plan` rows (the group-paced speed) |
 * | `pets.ts` | 670-674, 551-553 | `door.tsv` arrival rows |
 * | `closureReaction.ts` | 778-841 | `closure.tsv` |
 * | `probe.ts` | (the oracle's own `DecisionProbe`) | `coverage-union.tsv` |
 * | `invariants.ts` | — | the R3 tripwire; nothing in Java, everything in the gate |
 */

export {
  DECISION_CONFIG_FIELDS,
  DECISION_MANIFEST_PARAMETERS,
  DECISION_PARAM_FALLBACKS,
  decisionConfig,
  decisionConfigPositional,
  isE0NullConfig,
  petPolicyAdmitDefaultFrom,
  useL1,
  type DecisionConfig,
  type DecisionConfigField,
  type DecisionManifestParameter,
  type DecisionParameterDestination,
} from "./config.js";

export { armResident } from "./arm.js";

export { assertNoLayerTransition } from "./invariants.js";

export {
  effectiveBRisk,
  hazardDrawConsumed,
  hazardLogOdds,
  hazardVulnerable,
  hourBucket,
  isNewHour,
  logistic,
  riskDecay,
  updateRiskAccumulator,
} from "./hazard.js";

export { outreachDrawConsumed, outreachHourlyProbability } from "./outreach.js";

export { excludedByBelief, recordsBelief } from "./belief.js";

export {
  beatsRunningBest,
  candidateCapacityPrior,
  candidateUtility,
  chooseShelterByUtility,
  walkTimeHours,
  type ChooserWorld,
} from "./utilityChooser.js";

export { groupPacedSpeedMps, GROUP_PACE_FLOOR_MPS } from "./pace.js";

export { isPriorityForAdmission, petAdmittedAt, policyRefusedFor } from "./pets.js";

export {
  mobilityPenalty,
  pairKey,
  pushRuleFires,
  reactToClosureWave,
  scanForBlockage,
  stuckUntilTickFor,
  type ClosureNetworkView,
} from "./closureReaction.js";

export {
  BR,
  CountingDecisionProbe,
  DECISION_BRANCHES,
  hit,
  setDecisionProbe,
  type BranchId,
  type DecisionProbe,
} from "./probe.js";
