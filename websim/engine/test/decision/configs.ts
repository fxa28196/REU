/**
 * The 20 decision-trace run configurations, **declared** from
 * DR-WP8-decision-oracle.md §6 and WP8-SPEC-decision.md §1.1 — *not* read out of
 * the oracle.
 *
 * This is the same deliberate choice `world/configs.ts` makes, and it is the
 * difference between a test and a tautology. If `alphaHazard` were parsed out of
 * the fixture, a port that mis-resolved it would still "pass", because it would
 * have been handed the right number. Declaring it here means the port's own
 * `DecisionConfig` has to *be* the config the exporter ran with, and
 * `oracle.trace.test.ts` cross-checks the nine fields `manifest.json` actually
 * carries (`informationRegime`, `enableHazardDeparture`, `sigmaTheta`,
 * `gammaVuln`, `barrier`, `petPolicyDefault`, `betaCapacityPrior`,
 * `pushThetaThresholdExecuted`, `pAwareInit`) before comparing a single row.
 *
 * The ten fields the manifest does **not** carry — `alphaHazard`, `bRisk`,
 * `wOfficial`, `riskHalfLifeH`, `lambdaOutreachPerDay`, `betaTravelTime`,
 * `kPush`, `pStuck`, `stuckDelayH` and the three barriers separately — are
 * pinned instead by the bit-exact comparison itself: they enter `decay`,
 * `bRiskEff`, `u`, `p`, `barrierCost` and `v`, every one of which is dumped in
 * raw bits. A wrong `bRisk` cannot survive one `hz` row.
 *
 * ## Two archive-faithfulness points, both load-bearing
 *
 * - **`pushThetaThreshold` is 0.0, not −0.25**, in every row below. The archived
 *   SE batch files declare it `constant_type="number"` and Repast's batch reader
 *   **zeroes negative `"number"` constants**; 0.0 is what the archive *ran*
 *   (QUIRK 23 / never-regress gotcha 4). An oracle reproduces what ran, not what
 *   was intended, and so does the port.
 * - **`lambdaOutreachPerDay` is 0.0 everywhere except `ERL-A`** (QUIRK 28).
 *   `ERL-A` is a synthetic coverage vehicle that corresponds to no archived arm
 *   and must never be quoted as a result about 2020; it exists because it is the
 *   only configuration in which the D1 draw site is reachable at all.
 */

import {
  decisionConfig,
  petPolicyAdmitDefaultFrom,
  type DecisionConfig,
} from "../../src/decision/config.js";

export interface TraceConfig {
  /** The `config` column of every dump row. */
  readonly id: string;
  readonly seeds: readonly number[];
  readonly scenarioCode: number;
  readonly simulationHours: number;
  /** `ELayerSampler` ctor arg — checked against the manifest, used by no test row. */
  readonly pAwareInit: number;
  readonly groupSpeedDeltaMps: number;
  /** `enableDecisionLayer == 1`; `LEG-A` is the one row where the layer is OFF. */
  readonly layerOn: boolean;
  readonly config: DecisionConfig;
  /** `true` for the two configs that correspond to no archived arm (§8 item 7). */
  readonly synthetic: boolean;
}

/** Every archived row shares these; only the E-block below differs. */
const COMMON = {
  alphaHazard: -8.0,
  bRisk: 0.4,
  wOfficial: 1.1,
  riskHalfLifeH: 48.0,
  betaTravelTime: 1.0,
  // The EXECUTED value. See the module doc.
  pushThetaThreshold: 0.0,
  kPush: 1.0,
  pStuck: 0.3,
  stuckDelayH: 3.0,
} as const;

function cfg(over: {
  informationRegime: number;
  enableHazardDeparture: number;
  gammaVuln: number;
  sigmaTheta: number;
  barrier: number;
  petPolicyDefault: number;
  betaCapacityPrior: number;
  lambdaOutreachPerDay: number;
}): DecisionConfig {
  return decisionConfig({
    ...COMMON,
    informationRegime: over.informationRegime,
    enableHazardDeparture: over.enableHazardDeparture,
    gammaVuln: over.gammaVuln,
    sigmaTheta: over.sigmaTheta,
    lambdaOutreachPerDay: over.lambdaOutreachPerDay,
    barrierBelongings: over.barrier,
    barrierPet: over.barrier,
    barrierDependents: over.barrier,
    petPolicyAdmitDefault: petPolicyAdmitDefaultFrom(over.petPolicyDefault),
    betaCapacityPrior: over.betaCapacityPrior,
  });
}

/** The degenerate E-block: L0, hazard off, every coefficient zero, pets admitted. */
const E0_BLOCK = {
  informationRegime: 0,
  enableHazardDeparture: 0,
  gammaVuln: 0.0,
  sigmaTheta: 0.0,
  barrier: 0.0,
  petPolicyDefault: 1,
  betaCapacityPrior: 0.0,
  lambdaOutreachPerDay: 0.0,
} as const;

/** The baseline-real E-block: L1, hazard on, σθ = 1, γ = 0.25, barriers 0.26. */
const ER_BLOCK = {
  informationRegime: 1,
  enableHazardDeparture: 1,
  gammaVuln: 0.25,
  sigmaTheta: 1.0,
  barrier: 0.26,
  petPolicyDefault: 0,
  betaCapacityPrior: 0.2,
  lambdaOutreachPerDay: 0.0,
} as const;

const THREE_SEEDS = [42, 43, 44] as const;
const SEED_42 = [42] as const;

export const TRACE_CONFIGS: readonly TraceConfig[] = [
  {
    id: "E0-A",
    seeds: THREE_SEEDS,
    scenarioCode: 0,
    simulationHours: 312,
    pAwareInit: 1.0,
    groupSpeedDeltaMps: 0.0,
    layerOn: true,
    config: cfg(E0_BLOCK),
    synthetic: false,
  },
  {
    id: "E0-B",
    seeds: THREE_SEEDS,
    scenarioCode: 1,
    simulationHours: 312,
    pAwareInit: 1.0,
    groupSpeedDeltaMps: 0.0,
    layerOn: true,
    config: cfg(E0_BLOCK),
    synthetic: false,
  },
  {
    id: "E0-C",
    seeds: THREE_SEEDS,
    scenarioCode: 2,
    simulationHours: 312,
    pAwareInit: 1.0,
    groupSpeedDeltaMps: 0.0,
    layerOn: true,
    config: cfg(E0_BLOCK),
    synthetic: false,
  },
  {
    id: "ER-A",
    seeds: THREE_SEEDS,
    scenarioCode: 0,
    simulationHours: 312,
    pAwareInit: 0.356,
    groupSpeedDeltaMps: 0.06,
    layerOn: true,
    config: cfg(ER_BLOCK),
    synthetic: false,
  },
  {
    id: "ER-C",
    seeds: THREE_SEEDS,
    scenarioCode: 2,
    simulationHours: 312,
    pAwareInit: 0.356,
    groupSpeedDeltaMps: 0.06,
    layerOn: true,
    config: cfg(ER_BLOCK),
    synthetic: false,
  },
  {
    // The layer is OFF. Its `DecisionConfig` is stated for the manifest
    // cross-check only; no resident in this run carries one.
    id: "LEG-A",
    seeds: SEED_42,
    scenarioCode: 0,
    simulationHours: 312,
    pAwareInit: 1.0,
    groupSpeedDeltaMps: 0.0,
    layerOn: false,
    config: cfg(E0_BLOCK),
    synthetic: false,
  },
  {
    // ER with outreach switched ON — the ONLY configuration in which the D1
    // draw site is reachable. Synthetic; never a result about 2020.
    id: "ERL-A",
    seeds: SEED_42,
    scenarioCode: 0,
    simulationHours: 312,
    pAwareInit: 0.356,
    groupSpeedDeltaMps: 0.06,
    layerOn: true,
    config: cfg({ ...ER_BLOCK, lambdaOutreachPerDay: 1.0 }),
    synthetic: true,
  },
  {
    // L0 with the pet default flipped to refuse — the combination that makes
    // BR-49 (L0 belief exclusion) and BR-69 (L0 belief recorded) reachable.
    id: "L0P-A",
    seeds: SEED_42,
    scenarioCode: 0,
    simulationHours: 312,
    pAwareInit: 1.0,
    groupSpeedDeltaMps: 0.0,
    layerOn: true,
    config: cfg({ ...E0_BLOCK, petPolicyDefault: 0 }),
    synthetic: false,
  },
  {
    id: "SE-E18",
    seeds: SEED_42,
    scenarioCode: 18,
    simulationHours: 455,
    pAwareInit: 0.356,
    groupSpeedDeltaMps: 0.06,
    layerOn: true,
    config: cfg(ER_BLOCK),
    synthetic: false,
  },
];

/**
 * The second JVM's single config (`cov-closures/`): arm A, L1, **latch**
 * departure so the whole population is on the street at once, and the
 * worst-family closure schedule. Synthetic — it exists because
 * `StreetNetwork.blockEdge()` mutates the shared graph permanently, so a second
 * closure arm in the same process would run on the first one's mutilated graph.
 */
export const SEC_A: TraceConfig = {
  id: "SEC-A",
  seeds: SEED_42,
  scenarioCode: 0,
  simulationHours: 312,
  pAwareInit: 1.0,
  groupSpeedDeltaMps: 0.06,
  layerOn: true,
  config: cfg({ ...ER_BLOCK, enableHazardDeparture: 0, sigmaTheta: 1.0 }),
  synthetic: true,
};

const BY_ID = new Map<string, TraceConfig>(
  [...TRACE_CONFIGS, SEC_A].map((c) => [c.id, c] as const),
);

export function traceConfig(id: string): TraceConfig {
  const c = BY_ID.get(id);
  if (c === undefined) {
    throw new Error(
      `decision dump names config ${JSON.stringify(id)}, which engine/test/decision/configs.ts ` +
        "does not declare. Declaring configs here rather than reading them from the fixture is " +
        "what stops the comparison being a tautology, so an unknown id is a failure, not a skip.",
    );
  }
  return c;
}
