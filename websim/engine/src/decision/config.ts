/**
 * `GisAgent.DecisionConfig` — the 19 run-wide Phase-E coefficients
 * (`GisAgent.java:114-169`, WP8-SPEC-decision.md §1).
 *
 * One instance per run, shared by reference with every resident
 * (`ContextCreator.java:781-789` constructs it once, **outside** the per-resident
 * loop). It is immutable, and it is deliberately built through a **positional**
 * factory: the Java constructor is positional and unnamed, so permuting the
 * arguments silently rewires the model rather than failing. {@link decisionConfig}
 * takes an object precisely so a port cannot permute it by accident, and
 * {@link DECISION_CONFIG_FIELDS} records the Java declaration order so the two
 * can be checked against each other.
 *
 * ## The two numbers that do not agree, and must not be made to
 *
 * The Phase-E manifest block is **21** parameter names; `DecisionConfig` has
 * **19** fields. Fifteen of the 21 land here, five feed `ELayerSampler` and one
 * is the master switch; the remaining four fields (16-19) come from the
 * Scenario-E parameter block. {@link DECISION_MANIFEST_PARAMETERS} is the 21, in
 * `ContextCreator.java:811-826` order, each tagged with where it goes.
 *
 * ## `petPolicyAdmitDefault` is an `int == 1` test at the CALL SITE
 *
 * `ContextCreator.java:785` passes `petPolicyDefault == 1`, so `2` means
 * *refuse* (QUIRK 22). {@link petPolicyAdmitDefaultFrom} is that expression and
 * the only supported way to produce the boolean.
 *
 * ## Negative constants and Repast's batch reader
 *
 * `alphaHazard` (−8.0) and `pushThetaThreshold` (−0.25) must be declared
 * `constant_type="double"` in a batch file; Repast's reader **zeroes** negative
 * `"number"` constants, and the archived Scenario-E runs therefore *executed*
 * `pushThetaThreshold = 0.0` (QUIRK 23, never-regress gotcha 4). This module
 * carries no batch writer, but {@link DECISION_PARAM_FALLBACKS} records the
 * fallback the certified `doubleParam` ladder uses so a preset generator has one
 * place to read the intended values from — and `pushThetaThreshold`'s archived
 * *executed* value is a property of the run, never of this type.
 */

/** Field names in `GisAgent.DecisionConfig` declaration order (`:117-141`). */
export const DECISION_CONFIG_FIELDS = [
  "informationRegime",
  "enableHazardDeparture",
  "alphaHazard",
  "bRisk",
  "wOfficial",
  "gammaVuln",
  "sigmaTheta",
  "riskHalfLifeH",
  "lambdaOutreachPerDay",
  "barrierBelongings",
  "barrierPet",
  "barrierDependents",
  "petPolicyAdmitDefault",
  "betaTravelTime",
  "betaCapacityPrior",
  "pushThetaThreshold",
  "kPush",
  "pStuck",
  "stuckDelayH",
] as const;

export type DecisionConfigField = (typeof DECISION_CONFIG_FIELDS)[number];

/** The run-wide Phase-E coefficients. All fields are `final` in Java. */
export interface DecisionConfig {
  /** `0` = L0 omniscient, `1` = L1 belief-driven. Strict `== 1` — see `useL1`. */
  readonly informationRegime: number;
  /** `1` selects the hazard logistic; anything else keeps the legacy latch. */
  readonly enableHazardDeparture: number;
  /** Logistic intercept (A-30 provisional). Negative in every real arm. */
  readonly alphaHazard: number;
  /** Coefficient on the risk accumulator `z_R` (V36). */
  readonly bRisk: number;
  /** Coefficient on the official-cue indicator `anyShelterOpen` (V37). */
  readonly wOfficial: number;
  /** Vulnerability amplification of `bRisk` (V39); inert without heterogeneity. */
  readonly gammaVuln: number;
  /** Scale of the persistent trait θ (V35). `thetaScaled = sigmaTheta * thetaZ`. */
  readonly sigmaTheta: number;
  /** Half-life of `z_R`, in hours (V36). `decay = 2^(-1/riskHalfLifeH)`. */
  readonly riskHalfLifeH: number;
  /** Outreach contacts per DAY (V41); divided by `24.0` **at the use site**. */
  readonly lambdaOutreachPerDay: number;
  /** Departure barrier for heavy belongings (V40). */
  readonly barrierBelongings: number;
  /** Departure barrier for a pet, applied only when the WORLD default refuses. */
  readonly barrierPet: number;
  /** Departure barrier for dependents (V40). */
  readonly barrierDependents: number;
  /** World default pet intake for sites with no recorded policy (`int == 1`). */
  readonly petPolicyAdmitDefault: boolean;
  /** L1 utility coefficient on walking time, hours (V43). */
  readonly betaTravelTime: number;
  /** L1 utility coefficient on `ln(max(1, capacity))` (V43/A-32). */
  readonly betaCapacityPrior: number;
  /** Scenario E: θ threshold above which a resident pushes through (V51). */
  readonly pushThetaThreshold: number;
  /** Scenario E: barrier/mobility weight in the push rule (V51). */
  readonly kPush: number;
  /** Scenario E: probability a pusher gets stuck (V49). */
  readonly pStuck: number;
  /** Scenario E: how long a stuck pusher waits, in hours (V50). */
  readonly stuckDelayH: number;
}

/**
 * The `intParam` / `doubleParam` fallback ladder's defaults
 * (WP8-SPEC-decision.md §1.1, "fallback" column).
 *
 * Recorded for preset generation and for the manifest honesty note; the engine
 * always reads the configured value and never silently substitutes one of these.
 */
export const DECISION_PARAM_FALLBACKS: DecisionConfig = Object.freeze({
  informationRegime: 0,
  enableHazardDeparture: 0,
  alphaHazard: -8.0,
  bRisk: 0.4,
  wOfficial: 1.1,
  gammaVuln: 0.0,
  sigmaTheta: 0.0,
  riskHalfLifeH: 48.0,
  lambdaOutreachPerDay: 0.0,
  barrierBelongings: 0.0,
  barrierPet: 0.0,
  barrierDependents: 0.0,
  petPolicyAdmitDefault: true,
  betaTravelTime: 1.0,
  betaCapacityPrior: 0.0,
  pushThetaThreshold: -0.25,
  kPush: 1.0,
  pStuck: 0.3,
  stuckDelayH: 3.0,
});

/** Where each of `ContextCreator.java:811-826`'s 21 Phase-E names ends up. */
export type DecisionParameterDestination = "switch" | "sampler" | "config";

export interface DecisionManifestParameter {
  readonly name: string;
  readonly destination: DecisionParameterDestination;
  /** The `DecisionConfig` field it becomes, for `destination === "config"`. */
  readonly field: DecisionConfigField | null;
}

/**
 * The 21 Phase-E manifest parameter names, in `ContextCreator.java:811-826`
 * order, with their destinations. `shelterPolicyVariant` follows this block and
 * belongs to the shelter loader; the Scenario-E block follows that.
 */
export const DECISION_MANIFEST_PARAMETERS: readonly DecisionManifestParameter[] = Object.freeze([
  { name: "enableDecisionLayer", destination: "switch", field: null },
  { name: "pAwareInit", destination: "sampler", field: null },
  { name: "pHeavyBelongings", destination: "sampler", field: null },
  { name: "pHasPet", destination: "sampler", field: null },
  { name: "pHasDependents", destination: "sampler", field: null },
  { name: "groupSpeedDeltaMps", destination: "sampler", field: null },
  { name: "lambdaOutreachPerDay", destination: "config", field: "lambdaOutreachPerDay" },
  { name: "informationRegime", destination: "config", field: "informationRegime" },
  { name: "enableHazardDeparture", destination: "config", field: "enableHazardDeparture" },
  { name: "sigmaTheta", destination: "config", field: "sigmaTheta" },
  { name: "alphaHazard", destination: "config", field: "alphaHazard" },
  { name: "bRisk", destination: "config", field: "bRisk" },
  { name: "wOfficial", destination: "config", field: "wOfficial" },
  { name: "gammaVuln", destination: "config", field: "gammaVuln" },
  { name: "riskHalfLifeH", destination: "config", field: "riskHalfLifeH" },
  { name: "barrierBelongings", destination: "config", field: "barrierBelongings" },
  { name: "barrierPet", destination: "config", field: "barrierPet" },
  { name: "barrierDependents", destination: "config", field: "barrierDependents" },
  { name: "petPolicyDefault", destination: "config", field: "petPolicyAdmitDefault" },
  { name: "betaTravelTime", destination: "config", field: "betaTravelTime" },
  { name: "betaCapacityPrior", destination: "config", field: "betaCapacityPrior" },
] as const);

/** `petPolicyDefault == 1` (`ContextCreator.java:785`) — QUIRK 22. */
export function petPolicyAdmitDefaultFrom(petPolicyDefault: number): boolean {
  return petPolicyDefault === 1;
}

/** Named-argument form of the positional `DecisionConfig` constructor. */
export function decisionConfig(init: DecisionConfig): DecisionConfig {
  return Object.freeze({
    informationRegime: init.informationRegime,
    enableHazardDeparture: init.enableHazardDeparture,
    alphaHazard: init.alphaHazard,
    bRisk: init.bRisk,
    wOfficial: init.wOfficial,
    gammaVuln: init.gammaVuln,
    sigmaTheta: init.sigmaTheta,
    riskHalfLifeH: init.riskHalfLifeH,
    lambdaOutreachPerDay: init.lambdaOutreachPerDay,
    barrierBelongings: init.barrierBelongings,
    barrierPet: init.barrierPet,
    barrierDependents: init.barrierDependents,
    petPolicyAdmitDefault: init.petPolicyAdmitDefault,
    betaTravelTime: init.betaTravelTime,
    betaCapacityPrior: init.betaCapacityPrior,
    pushThetaThreshold: init.pushThetaThreshold,
    kPush: init.kPush,
    pStuck: init.pStuck,
    stuckDelayH: init.stuckDelayH,
  });
}

/**
 * The positional constructor, argument for argument
 * (`GisAgent.java:143-148` / `ContextCreator.java:781-789`).
 *
 * Exists so a caller that is transcribing the Java call site can transcribe it
 * literally, and so `decision/config.test.ts` can assert the two forms agree.
 */
export function decisionConfigPositional(
  informationRegime: number,
  enableHazardDeparture: number,
  alphaHazard: number,
  bRisk: number,
  wOfficial: number,
  gammaVuln: number,
  sigmaTheta: number,
  riskHalfLifeH: number,
  lambdaOutreachPerDay: number,
  barrierBelongings: number,
  barrierPet: number,
  barrierDependents: number,
  petPolicyAdmitDefault: boolean,
  betaTravelTime: number,
  betaCapacityPrior: number,
  pushThetaThreshold: number,
  kPush: number,
  pStuck: number,
  stuckDelayH: number,
): DecisionConfig {
  return decisionConfig({
    informationRegime,
    enableHazardDeparture,
    alphaHazard,
    bRisk,
    wOfficial,
    gammaVuln,
    sigmaTheta,
    riskHalfLifeH,
    lambdaOutreachPerDay,
    barrierBelongings,
    barrierPet,
    barrierDependents,
    petPolicyAdmitDefault,
    betaTravelTime,
    betaCapacityPrior,
    pushThetaThreshold,
    kPush,
    pStuck,
    stuckDelayH,
  });
}

/**
 * `useL1()` (`GisAgent.java:663-666`) — **strict `== 1`**.
 *
 * `informationRegime = 2` is L0, not "some other L1". Awareness and regime are
 * orthogonal: this predicate is consulted by the re-entry test, the planning
 * fork and the two door branches, and by nothing in the outreach or hazard code.
 */
export function useL1(config: DecisionConfig | null): boolean {
  return config !== null && config.informationRegime === 1;
}

/**
 * The **E0 null**: the layer is armed but every mechanism is degenerate, so the
 * run must stay byte-identical to the same arm with the layer off (R3, WP8's
 * flagship acceptance criterion).
 *
 * This is not a cosmetic classification. {@link DecisionConfig}s that satisfy it
 * carry an *active assertion*: `step.ts` throws if a decision-layer transition
 * (outreach conversion, hazard departure) is ever taken under one, and
 * `armResident` throws if an E0-null run produces an initially-unaware resident.
 * Without that, "R3 passed" would only mean "the values happened to agree on the
 * arms we ran", which is exactly the claim R3 exists to make unfalsifiable-proof.
 *
 * `betaTravelTime` is **not** in the conjunction: it multiplies a term the
 * degenerate config never evaluates (L0 planning does not call the utility
 * chooser), and the archived E0 arms leave it at 1.0.
 */
export function isE0NullConfig(config: DecisionConfig): boolean {
  return (
    config.informationRegime === 0 &&
    config.enableHazardDeparture !== 1 &&
    config.lambdaOutreachPerDay === 0 &&
    config.sigmaTheta === 0 &&
    config.gammaVuln === 0 &&
    config.barrierBelongings === 0 &&
    config.barrierPet === 0 &&
    config.barrierDependents === 0 &&
    config.betaCapacityPrior === 0 &&
    config.petPolicyAdmitDefault
  );
}
