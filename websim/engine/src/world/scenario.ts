/**
 * Step 2–3 of `ContextCreator.build()`: the selector fail-fasts and the
 * `scenarioCode → (scenarioName, shelters CSV)` chain, including the
 * `shelterPolicyVariant` rewrite.
 *
 * ## The asymmetry is deliberate — do not "fix" it
 *
 * `smokeSeriesCode`, `closuresCode` and (when `closuresCode === 3`)
 * `closureDraw` are **fail-fast**: an unregistered value throws, because a
 * typo'd params file must stop the run rather than silently select a different
 * severity than its manifest claims.
 *
 * `scenarioCode` has **no fail-fast**. Java's chain ends in a bare `else` that
 * assigns arm A, so code 99 runs arm A and reports `A_present_day_reality`.
 * PORT_MAP §1.3 step 2 records this as a certified behaviour and risk R15 records
 * the mitigation (a UI dropdown, not a range check), so this port reproduces the
 * fallthrough exactly and {@link resolveScenario} returns `fellThrough: true`
 * instead of throwing.
 *
 * ## Historical remap trap
 *
 * `scenarioCode = 2` meant "historical" before the redesign and means arm C now.
 * Trust the code chain, never a stale comment. Code 3 is the historical
 * reference, and it is explicitly *not a scenario*.
 */

export const SHELTERS_DIR = "data/shelters";
export const CLOSURES_DIR = "data/closures";

/** `CLOSURE_WORST_DRAWS` in `ContextCreator`. */
export const CLOSURE_WORST_DRAWS = 3;

/** Smoke series files, indexed by `smokeSeriesCode`. */
export const SMOKE_SERIES_CSV: readonly string[] = [
  "data/airnow/aqs_hourly_pm25_portland_2020-09.csv",
  "data/airnow/aqs_hourly_pm25_synthetic_severe_v1.csv",
  "data/airnow/aqs_hourly_pm25_synthetic_severe_v2.csv",
];

const A_CSV = "shelters_2026_current_placement.csv";
const B_CSV = "shelters_2026_expanded_capacity.csv";
const C_CSV = "shelters_2026_expanded_plus_new_sites.csv";
const HISTORICAL_CSV = "shelters_2020-09.csv";

export interface ScenarioEntry {
  readonly code: number;
  readonly scenarioName: string;
  /** File name inside {@link SHELTERS_DIR}. */
  readonly sheltersFile: string;
  /** Arm D / E20 pattern: the file carries the sites, the parameter the intake rule. */
  readonly reserveDriven: boolean;
}

/**
 * The chain, transcribed from `ContextCreator.java:343-426` in source order.
 * Index 0 is also the `else` fallthrough.
 */
export const SCENARIO_CHAIN: readonly ScenarioEntry[] = [
  { code: 0, scenarioName: "A_present_day_reality", sheltersFile: A_CSV, reserveDriven: false },
  { code: 1, scenarioName: "B_capacity_meets_demand_real_locations", sheltersFile: B_CSV, reserveDriven: false },
  { code: 2, scenarioName: "C_existing_expanded_plus_new_optimized_sites", sheltersFile: C_CSV, reserveDriven: false },
  { code: 3, scenarioName: "HISTORICAL_capacity_reference_not_a_scenario", sheltersFile: HISTORICAL_CSV, reserveDriven: false },
  { code: 4, scenarioName: "CRANDOM_r1_existing_expanded_plus_ten_RANDOM_sites", sheltersFile: "shelters_2026_random_sites_r1.csv", reserveDriven: false },
  { code: 5, scenarioName: "CRANDOM_r2_existing_expanded_plus_ten_RANDOM_sites", sheltersFile: "shelters_2026_random_sites_r2.csv", reserveDriven: false },
  { code: 6, scenarioName: "CRANDOM_r3_existing_expanded_plus_ten_RANDOM_sites", sheltersFile: "shelters_2026_random_sites_r3.csv", reserveDriven: false },
  { code: 7, scenarioName: "D_need_based_admission_real_locations", sheltersFile: B_CSV, reserveDriven: true },
  { code: 8, scenarioName: "CRANDOMPOOL_r4_random_from_arm_C_candidate_set", sheltersFile: "shelters_2026_random_sites_r4.csv", reserveDriven: false },
  { code: 9, scenarioName: "CRANDOMPOOL_r5_random_from_arm_C_candidate_set", sheltersFile: "shelters_2026_random_sites_r5.csv", reserveDriven: false },
  { code: 10, scenarioName: "CRANDOMPOOL_r6_random_from_arm_C_candidate_set", sheltersFile: "shelters_2026_random_sites_r6.csv", reserveDriven: false },
  { code: 11, scenarioName: "BSWEEP_s080_capacity_0.8x_demand_real_locations", sheltersFile: "shelters_2026_bsweep_s080.csv", reserveDriven: false },
  { code: 12, scenarioName: "BSWEEP_s120_capacity_1.2x_demand_real_locations", sheltersFile: "shelters_2026_bsweep_s120.csv", reserveDriven: false },
  { code: 13, scenarioName: "BSWEEP_s140_capacity_1.4x_demand_real_locations", sheltersFile: "shelters_2026_bsweep_s140.csv", reserveDriven: false },
  { code: 14, scenarioName: "BSWEEP_s160_capacity_1.6x_demand_real_locations", sheltersFile: "shelters_2026_bsweep_s160.csv", reserveDriven: false },
  { code: 15, scenarioName: "BSWEEP_s105_capacity_1.05x_demand_real_locations", sheltersFile: "shelters_2026_bsweep_s105.csv", reserveDriven: false },
  { code: 16, scenarioName: "BSWEEP_s110_capacity_1.1x_demand_real_locations", sheltersFile: "shelters_2026_bsweep_s110.csv", reserveDriven: false },
  { code: 17, scenarioName: "BSWEEP_s115_capacity_1.15x_demand_real_locations", sheltersFile: "shelters_2026_bsweep_s115.csv", reserveDriven: false },
  { code: 18, scenarioName: "E18_severe_counterfactual_over_A_present_day", sheltersFile: A_CSV, reserveDriven: false },
  { code: 19, scenarioName: "E19_severe_counterfactual_over_C_expanded_plus_new_sites", sheltersFile: C_CSV, reserveDriven: false },
  { code: 20, scenarioName: "E20_severe_counterfactual_over_D_need_based_admission", sheltersFile: B_CSV, reserveDriven: true },
];

/** Codes that are severity LABELS only — severity comes from the smoke/closure params. */
export const SEVERE_LABEL_CODES: readonly number[] = [18, 19, 20];

/** `<base>_elayer.csv` — the V45 recorded-pet-policy variant. */
export function elayerFileName(sheltersFile: string): string {
  return `${sheltersFile.slice(0, sheltersFile.length - 4)}_elayer.csv`;
}

/** Thrown where Java throws `IllegalStateException` during build. */
export class BuildFailFastError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildFailFastError";
  }
}

/** The selector fail-fasts, in `ContextCreator`'s order (smoke → closures → draw). */
export function checkSelectorCodes(config: {
  readonly smokeSeriesCode: number;
  readonly closuresCode: number;
  readonly closureDraw: number;
}): void {
  if (config.smokeSeriesCode < 0 || config.smokeSeriesCode > 2) {
    throw new BuildFailFastError(
      `smokeSeriesCode=${config.smokeSeriesCode} is not a registered series ` +
        `(V46: 0=observed, 1=severe v1, 2=worst-case v2)`,
    );
  }
  if (config.closuresCode < 0 || config.closuresCode > 3) {
    throw new BuildFailFastError(
      `closuresCode=${config.closuresCode} is not a registered schedule ` +
        `(V48: 0=none, 1=base, 2=extreme, 3=worst family)`,
    );
  }
  if (
    config.closuresCode === 3 &&
    (config.closureDraw < 1 || config.closureDraw > CLOSURE_WORST_DRAWS)
  ) {
    throw new BuildFailFastError(
      `closureDraw=${config.closureDraw} but only draws 1..${CLOSURE_WORST_DRAWS} ` +
        `are committed (V48 worst family)`,
    );
  }
}

export interface ResolvedScenario {
  readonly scenarioName: string;
  /** Path relative to the Geography data root, after any `_elayer` rewrite. */
  readonly sheltersCsv: string;
  /** The pre-rewrite path, for provenance. */
  readonly baseSheltersCsv: string;
  /** `true` when `scenarioCode` matched no branch and fell through to arm A. */
  readonly fellThrough: boolean;
  readonly reserveDriven: boolean;
  /** `true` for codes 18–20 with `smokeSeriesCode === 0` — a label-only run. */
  readonly severeLabelWithoutSevereSeries: boolean;
}

/**
 * Resolve the scenario chain and apply the `_elayer` rewrite.
 *
 * @param exists a predicate over data-root-relative paths. `shelterPolicyVariant
 *   = 1` with a missing variant is a **fail-fast**, never a silent fallback: a
 *   run that asked for recorded pet policy and quietly got the blanket default
 *   would misattribute every pet-owner outcome.
 */
export function resolveScenario(
  config: {
    readonly scenarioCode: number;
    readonly shelterPolicyVariant: number;
    readonly smokeSeriesCode: number;
  },
  exists: (path: string) => boolean,
): ResolvedScenario {
  const matched = SCENARIO_CHAIN.find((e) => e.code === config.scenarioCode);
  const entry = matched ?? SCENARIO_CHAIN[0]!;
  const base = `${SHELTERS_DIR}/${entry.sheltersFile}`;
  let sheltersCsv = base;

  if (config.shelterPolicyVariant === 1) {
    const variant = elayerFileName(base);
    if (!exists(variant)) {
      throw new BuildFailFastError(
        `shelterPolicyVariant=1 but ${variant} does not exist; ` +
          `run scripts/build_shelter_policy_elayer.py`,
      );
    }
    sheltersCsv = variant;
  }

  return {
    scenarioName: entry.scenarioName,
    sheltersCsv,
    baseSheltersCsv: base,
    fellThrough: matched === undefined,
    reserveDriven: entry.reserveDriven,
    severeLabelWithoutSevereSeries:
      SEVERE_LABEL_CODES.includes(config.scenarioCode) && config.smokeSeriesCode === 0,
  };
}

/** `closuresCode`/`closureDraw` → schedule file, or `null` when code 0. */
export function resolveClosuresCsv(closuresCode: number, closureDraw: number): string | null {
  if (closuresCode === 0) {
    return null;
  }
  if (closuresCode === 3) {
    return `${CLOSURES_DIR}/closures_E_r${closureDraw}_worst.csv`;
  }
  if (closuresCode === 2) {
    return `${CLOSURES_DIR}/closures_E_r1_extreme.csv`;
  }
  return `${CLOSURES_DIR}/closures_E_r1.csv`;
}
