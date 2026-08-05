/**
 * paramMeta.ts — the run-controls disclosure taxonomy and per-parameter
 * control metadata (WP11, plan §6.3).
 *
 * PURE module: no React, no DOM, no store. Everything `SliderDrawer` renders is
 * driven from here, and `app/test/param-meta.test.ts` pins every listed name to
 * `BASE_CONFIG` so the drawer can never advertise a parameter the schema does
 * not have.
 *
 * What is deliberately NOT here (schema group "advanced", plan §6.3):
 *   - `shelterArrivalDistanceM` — dead parameter, manifest-only. The UI must
 *     never offer it as a control.
 *   - `minutesPerTick` — pinned to 1.0; widening it is a contract-version
 *     change, not a slider.
 *   - `evacuationThresholdUgM3` — convention constant (55.5 ug/m3). It is a
 *     concentration threshold, never an "AQI category".
 *
 * Bounds are pulled from `@websim/shared` `PARAM_META` hard bounds at module
 * construction, so they cannot drift from the schema.
 */

import type { ParamName } from "@websim/shared/schema";
import { PARAM_META, maxSimulationHours } from "@websim/shared/schema";
import type { PresetDefinition } from "@websim/shared/presets/definitions";
import { SCENARIO_CHAIN } from "@websim/engine/world";

// ---------------------------------------------------------------------------
// Disclosure levels
// ---------------------------------------------------------------------------

/**
 * The disclosure taxonomy: which parameters each drawer section lists, in
 * manifest order within each level. 38 of the 41 parameters appear; the three
 * "advanced" parameters above are deliberately absent.
 */
export const PARAM_LEVELS = {
  core: [
    "scenarioCode",
    "numAgents",
    "randomSeed",
    "simulationHours",
    "smokeSeriesCode",
    "smokeScale",
  ],
  demographics: ["walkingSpeedMps", "enableHeterogeneity", "groupSpeedDeltaMps"],
  sheltersPolicy: [
    "respectShelterOpeningDates",
    "triageReserveFraction",
    "petPolicyDefault",
    "shelterPolicyVariant",
  ],
  decisionLayer: [
    "enableDecisionLayer",
    "pAwareInit",
    "pHeavyBelongings",
    "pHasPet",
    "pHasDependents",
    "lambdaOutreachPerDay",
    "informationRegime",
    "enableHazardDeparture",
    "sigmaTheta",
    "alphaHazard",
    "bRisk",
    "wOfficial",
    "gammaVuln",
    "riskHalfLifeH",
    "barrierBelongings",
    "barrierPet",
    "barrierDependents",
    "betaTravelTime",
    "betaCapacityPrior",
  ],
  closures: [
    "closuresCode",
    "pStuck",
    "stuckDelayH",
    "pushThetaThreshold",
    "kPush",
    "closureDraw",
  ],
} as const satisfies Readonly<Record<string, readonly ParamName[]>>;

export type LevelKey = keyof typeof PARAM_LEVELS;

/** Section order for the drawer. Array, never object-key iteration. */
export const LEVEL_KEYS: readonly LevelKey[] = [
  "core",
  "demographics",
  "sheltersPolicy",
  "decisionLayer",
  "closures",
];

export const LEVEL_LABELS: Readonly<Record<LevelKey, string>> = {
  core: "Core",
  demographics: "Demographics & movement",
  sheltersPolicy: "Shelters & policy",
  decisionLayer: "Decision layer (Phase E)",
  closures: "Closures (Scenario E)",
};

/** Every parameter the drawer surfaces, in section order. */
export type ControlParamName = (typeof PARAM_LEVELS)[LevelKey][number];

export const ALL_CONTROL_PARAMS: readonly ControlParamName[] = LEVEL_KEYS.flatMap(
  (key) => PARAM_LEVELS[key],
);

// ---------------------------------------------------------------------------
// Per-parameter control metadata
// ---------------------------------------------------------------------------

export interface SelectOption {
  readonly value: number;
  readonly label: string;
}

/** Condition under which a control is enabled; disabled (greyed) otherwise. */
export interface EnabledWhen {
  readonly param: ParamName;
  readonly equals: number;
}

export interface ParamControlMeta {
  readonly label: string;
  /** Display units; "" when the value is unitless. */
  readonly units: string;
  /** `<input type="range">` step. 1 for every int / select. */
  readonly step: number;
  /** Hard schema bound (structural), from shared `PARAM_META`. */
  readonly min: number;
  readonly max: number;
  readonly control: "range" | "select";
  readonly options?: readonly SelectOption[];
  readonly enabledWhen?: EnabledWhen;
}

/** Registry dropdown for `scenarioCode` (risk R15: a dropdown, never a free code). */
export const SCENARIO_OPTIONS: readonly SelectOption[] = SCENARIO_CHAIN.map((entry) => ({
  value: entry.code,
  label: `${entry.code} — ${entry.scenarioName}`,
}));

/**
 * Smoke series options. Series 1 and 2 are constructed counterfactuals; every
 * surface that shows them must also render `CONSTRUCTED_SERIES_LABEL` from
 * `app/src/index.ts` (SliderDrawer does, next to this select).
 */
export const SMOKE_SERIES_OPTIONS: readonly SelectOption[] = [
  { value: 0, label: "Observed 2020" },
  { value: 1, label: "Severe v1 - CONSTRUCTED" },
  { value: 2, label: "Worst-plausible v2 - CONSTRUCTED (Canberra-anchored)" },
];

/** Smoke series codes that are constructed counterfactuals, not measured data. */
export const CONSTRUCTED_SMOKE_SERIES_CODES: readonly number[] = [1, 2];

export function isConstructedSeries(smokeSeriesCode: number): boolean {
  return CONSTRUCTED_SMOKE_SERIES_CODES.includes(smokeSeriesCode);
}

const hard = (name: ParamName): { min: number; max: number } => ({
  min: PARAM_META[name].hardMin,
  max: PARAM_META[name].hardMax,
});

export const PARAM_CONTROL_META: Readonly<Record<ControlParamName, ParamControlMeta>> = {
  // --- core ---------------------------------------------------------------
  scenarioCode: {
    label: "Scenario (shelter network)",
    units: "",
    step: 1,
    ...hard("scenarioCode"),
    control: "select",
    options: SCENARIO_OPTIONS,
  },
  numAgents: {
    label: "Resident count",
    units: "residents",
    step: 1,
    ...hard("numAgents"),
    control: "range",
  },
  randomSeed: {
    label: "Random seed",
    units: "",
    step: 1,
    ...hard("randomSeed"),
    control: "range",
  },
  simulationHours: {
    label: "Run window",
    units: "h",
    step: 1,
    ...hard("simulationHours"),
    control: "range",
  },
  smokeSeriesCode: {
    label: "Smoke series",
    units: "",
    step: 1,
    ...hard("smokeSeriesCode"),
    control: "select",
    options: SMOKE_SERIES_OPTIONS,
  },
  smokeScale: {
    label: "Smoke scale multiplier",
    units: "x",
    step: 0.001,
    ...hard("smokeScale"),
    control: "range",
  },

  // --- demographics & movement --------------------------------------------
  walkingSpeedMps: {
    label: "Walking speed (uniform)",
    units: "m/s",
    step: 0.01,
    ...hard("walkingSpeedMps"),
    control: "range",
    // The engine uses this ONLY when heterogeneity is off (V10).
    enabledWhen: { param: "enableHeterogeneity", equals: 0 },
  },
  enableHeterogeneity: {
    label: "Resident heterogeneity",
    units: "",
    step: 1,
    ...hard("enableHeterogeneity"),
    control: "select",
    options: [
      { value: 0, label: "Off — uniform walking speed" },
      { value: 1, label: "On — sampled age / sex / mobility / asthma / COPD" },
    ],
  },
  groupSpeedDeltaMps: {
    label: "Group slowdown per extra member",
    units: "m/s",
    step: 0.01,
    ...hard("groupSpeedDeltaMps"),
    control: "range",
  },

  // --- shelters & policy ---------------------------------------------------
  respectShelterOpeningDates: {
    label: "Shelter opening dates",
    units: "",
    step: 1,
    ...hard("respectShelterOpeningDates"),
    control: "select",
    options: [
      { value: 0, label: "All sites open at tick 0 (A-02 counterfactual)" },
      { value: 1, label: "Real opening dates" },
    ],
  },
  triageReserveFraction: {
    label: "Triage reserve fraction (arm D lever)",
    units: "fraction",
    step: 0.01,
    ...hard("triageReserveFraction"),
    control: "range",
  },
  petPolicyDefault: {
    label: "Pet policy at unrecorded sites",
    units: "",
    step: 1,
    ...hard("petPolicyDefault"),
    control: "select",
    options: [
      { value: 0, label: "Refuse pets" },
      { value: 1, label: "Admit pets" },
    ],
  },
  shelterPolicyVariant: {
    label: "Shelter CSV variant",
    units: "",
    step: 1,
    ...hard("shelterPolicyVariant"),
    control: "select",
    options: [
      { value: 0, label: "Archived shelter file" },
      { value: 1, label: "Recorded pet-policy variant (_elayer)" },
    ],
  },

  // --- decision layer (Phase E) --------------------------------------------
  enableDecisionLayer: {
    label: "Decision layer master switch",
    units: "",
    step: 1,
    ...hard("enableDecisionLayer"),
    control: "select",
    options: [
      { value: 0, label: "Off — legacy pre-Phase-E behaviour" },
      { value: 1, label: "On — awareness / hazard / barrier / choice" },
    ],
  },
  pAwareInit: {
    label: "Initial awareness probability",
    units: "probability",
    step: 0.001,
    ...hard("pAwareInit"),
    control: "range",
  },
  pHeavyBelongings: {
    label: "P(heavy belongings)",
    units: "probability",
    step: 0.001,
    ...hard("pHeavyBelongings"),
    control: "range",
  },
  pHasPet: {
    label: "P(has pet)",
    units: "probability",
    step: 0.001,
    ...hard("pHasPet"),
    control: "range",
  },
  pHasDependents: {
    label: "P(has dependents)",
    units: "probability",
    step: 0.0001,
    ...hard("pHasDependents"),
    control: "range",
  },
  lambdaOutreachPerDay: {
    label: "Outreach awareness rate",
    units: "per day",
    step: 0.01,
    ...hard("lambdaOutreachPerDay"),
    control: "range",
  },
  informationRegime: {
    label: "Information regime",
    units: "",
    step: 1,
    ...hard("informationRegime"),
    control: "select",
    options: [
      { value: 0, label: "L0 — omniscient" },
      { value: 1, label: "L1 — locations only (per-resident beliefs)" },
    ],
  },
  enableHazardDeparture: {
    label: "Departure model",
    units: "",
    step: 1,
    ...hard("enableHazardDeparture"),
    control: "select",
    options: [
      { value: 0, label: "Concentration latch at threshold" },
      { value: 1, label: "Per-hour logistic hazard" },
    ],
  },
  sigmaTheta: {
    label: "Risk-trait spread (sigma theta)",
    units: "log-odds",
    step: 0.01,
    ...hard("sigmaTheta"),
    control: "range",
  },
  alphaHazard: {
    label: "Hazard intercept (alpha)",
    units: "log-odds",
    step: 0.1,
    ...hard("alphaHazard"),
    control: "range",
  },
  bRisk: {
    label: "Risk-cue weight (b_risk)",
    units: "log-odds",
    step: 0.01,
    ...hard("bRisk"),
    control: "range",
  },
  wOfficial: {
    label: "Official-cue weight (w_official)",
    units: "log-odds",
    step: 0.01,
    ...hard("wOfficial"),
    control: "range",
  },
  gammaVuln: {
    label: "Vulnerability amplification (gamma)",
    units: "log-odds multiplier",
    step: 0.01,
    ...hard("gammaVuln"),
    control: "range",
  },
  riskHalfLifeH: {
    label: "Risk-cue half-life",
    units: "h",
    step: 0.5,
    ...hard("riskHalfLifeH"),
    control: "range",
  },
  barrierBelongings: {
    label: "Belongings barrier",
    units: "log-odds",
    step: 0.01,
    ...hard("barrierBelongings"),
    control: "range",
  },
  barrierPet: {
    label: "Pet barrier",
    units: "log-odds",
    step: 0.01,
    ...hard("barrierPet"),
    control: "range",
  },
  barrierDependents: {
    label: "Dependents barrier",
    units: "log-odds",
    step: 0.01,
    ...hard("barrierDependents"),
    control: "range",
  },
  betaTravelTime: {
    label: "Travel-time weight (beta_T)",
    units: "utility/min",
    step: 0.01,
    ...hard("betaTravelTime"),
    control: "range",
  },
  betaCapacityPrior: {
    label: "Capacity-prior weight (beta_C)",
    units: "utility/ln(bed)",
    step: 0.01,
    ...hard("betaCapacityPrior"),
    control: "range",
  },

  // --- closures (Scenario E) -----------------------------------------------
  closuresCode: {
    label: "Street-closure family",
    units: "",
    step: 1,
    ...hard("closuresCode"),
    control: "select",
    options: [
      { value: 0, label: "0 — none" },
      { value: 1, label: "1 — base severe (1 wave at hour 79, 18 edges)" },
      { value: 2, label: "2 — extreme (2 waves, 34 edges)" },
      { value: 3, label: "3 — worst family (6 waves, 72 edges)" },
    ],
  },
  pStuck: {
    label: "P(stuck at pushed blockage)",
    units: "probability",
    step: 0.01,
    ...hard("pStuck"),
    control: "range",
  },
  stuckDelayH: {
    label: "Stuck delay",
    units: "h",
    step: 0.5,
    ...hard("stuckDelayH"),
    control: "range",
  },
  pushThetaThreshold: {
    label: "Push-through threshold",
    units: "log-odds",
    step: 0.05,
    ...hard("pushThetaThreshold"),
    control: "range",
  },
  kPush: {
    label: "Push burden coupling (k_push)",
    units: "",
    step: 0.1,
    ...hard("kPush"),
    control: "range",
  },
  closureDraw: {
    label: "Committed closure schedule draw",
    units: "",
    step: 1,
    ...hard("closureDraw"),
    control: "select",
    options: [
      { value: 1, label: "Draw 1 (closures_E_r1_worst.csv)" },
      { value: 2, label: "Draw 2 (closures_E_r2_worst.csv)" },
      { value: 3, label: "Draw 3 (closures_E_r3_worst.csv)" },
    ],
    // Only selects a file for the code-3 worst family; inert otherwise.
    enabledWhen: { param: "closuresCode", equals: 3 },
  },
};

// ---------------------------------------------------------------------------
// Pure helpers the drawer renders from
// ---------------------------------------------------------------------------

/** `false` when the param's `enabledWhen` condition fails in `config`. */
export function isParamEnabled(
  name: ControlParamName,
  config: Readonly<Record<ParamName, number>>,
): boolean {
  const condition = PARAM_CONTROL_META[name].enabledWhen;
  return condition === undefined || config[condition.param] === condition.equals;
}

/**
 * Effective slider max given the rest of the config. `simulationHours` must
 * stay ≤ the selected smoke series' slice count − 1 (575 / 455 / 455) — the
 * gate that caught the 456-vs-455 window error.
 */
export function effectiveMax(
  name: ControlParamName,
  config: Readonly<Record<ParamName, number>>,
): number {
  const staticMax = PARAM_CONTROL_META[name].max;
  if (name === "simulationHours") {
    return Math.min(staticMax, maxSimulationHours(config.smokeSeriesCode));
  }
  return staticMax;
}

// ---------------------------------------------------------------------------
// Preset grouping (pure — PresetPicker renders from this)
// ---------------------------------------------------------------------------

export const PRESET_GROUP_LABELS = [
  "Scenarios",
  "E0 null",
  "Phase E",
  "Scenario E severe",
  "Worst-plausible v2",
] as const;

export type PresetGroupLabel = (typeof PRESET_GROUP_LABELS)[number];

/** Group a preset id by its stable id prefix. */
export function presetGroupLabel(id: string): PresetGroupLabel {
  if (id.startsWith("SE2_")) {
    return "Worst-plausible v2";
  }
  if (id.startsWith("SE_")) {
    return "Scenario E severe";
  }
  if (id.startsWith("ER_")) {
    return "Phase E";
  }
  if (id.startsWith("E0_")) {
    return "E0 null";
  }
  return "Scenarios"; // default_fresh_run, A_*, B_*, C_*
}

export interface PresetGroup {
  readonly label: PresetGroupLabel;
  readonly presets: readonly PresetDefinition[];
}

/** Groups in fixed order; empty groups dropped. Arrays only, stable order. */
export function groupPresets(definitions: readonly PresetDefinition[]): readonly PresetGroup[] {
  return PRESET_GROUP_LABELS.map((label) => ({
    label,
    presets: definitions.filter((definition) => presetGroupLabel(definition.id) === label),
  })).filter((group) => group.presets.length > 0);
}
