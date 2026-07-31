/**
 * scenario-index.ts — the certified `scenarioCode` → shelter-file chain and the
 * `closuresCode`/`closureDraw` → schedule-file chain, transcribed from
 * `ContextCreator.build()` (read-only source of truth) and PORT_MAP §3.1/§2.7.
 *
 * Transcribed, not re-derived. The Java `if/else if` ladder is the only
 * authority on which file an arm reads, and a re-derivation from the file names
 * would quietly disagree the moment a code is remapped — which has already
 * happened once (PORT_MAP's "historical remap trap": code 2 meant HISTORICAL
 * before the redesign, and stale comments still say so).
 *
 * Three behaviours are reproduced exactly because they are fail-fast contracts:
 *   - **Unmatched codes fall through to arm A.** The Java `else` branch has no
 *     range check, so `scenarioCode=99` silently runs arm A. The web UI never
 *     offers an unmatched code, but the index records the fallback so the
 *     browser resolves a permalink the same way the instrument would.
 *   - **`shelterPolicyVariant=1` (V45) swaps in `<base>_elayer.csv` and throws
 *     when that file is absent** — never a silent fallback, because a run that
 *     asked for recorded pet policy and got the blanket default would
 *     misattribute every pet-owner outcome.
 *   - **`closuresCode` and `closureDraw` are range-checked** (0..3, draws 1..3),
 *     because a typo'd selector must stop the run rather than execute a
 *     different schedule than the manifest claims.
 */

/** Shelter CSVs live under this repo-relative directory. */
export const SHELTERS_DIR = "Geography/data/shelters";
/** Closure schedules live under this repo-relative directory. */
export const CLOSURES_DIR = "Geography/data/closures";

const A = "shelters_2026_current_placement.csv";
const B = "shelters_2026_expanded_capacity.csv";
const C = "shelters_2026_expanded_plus_new_sites.csv";
const HISTORICAL = "shelters_2020-09.csv";

export interface ScenarioEntry {
  readonly code: number;
  /** `scenarioName` as written into `simulation.json`. */
  readonly scenarioName: string;
  /** Shelter CSV file name (within {@link SHELTERS_DIR}) at `shelterPolicyVariant=0`. */
  readonly sheltersFile: string;
  /** The V45 variant file name; present only when the file exists on disk. */
  readonly elayerFile: string;
  /** True when this code needs `triageReserveFraction > 0` to differ from its base arm. */
  readonly reserveDriven: boolean;
}

/**
 * The ladder, in Java branch order. Code 0 is written explicitly even though it
 * is the `else` fallback, so the table reads as a table.
 */
export const SCENARIO_CHAIN: readonly ScenarioEntry[] = [
  { code: 0, scenarioName: "A_present_day_reality", sheltersFile: A, elayerFile: elayer(A), reserveDriven: false },
  { code: 1, scenarioName: "B_capacity_meets_demand_real_locations", sheltersFile: B, elayerFile: elayer(B), reserveDriven: false },
  { code: 2, scenarioName: "C_existing_expanded_plus_new_optimized_sites", sheltersFile: C, elayerFile: elayer(C), reserveDriven: false },
  { code: 3, scenarioName: "HISTORICAL_capacity_reference_not_a_scenario", sheltersFile: HISTORICAL, elayerFile: elayer(HISTORICAL), reserveDriven: false },
  { code: 4, scenarioName: "CRANDOM_r1_existing_expanded_plus_ten_RANDOM_sites", sheltersFile: "shelters_2026_random_sites_r1.csv", elayerFile: elayer("shelters_2026_random_sites_r1.csv"), reserveDriven: false },
  { code: 5, scenarioName: "CRANDOM_r2_existing_expanded_plus_ten_RANDOM_sites", sheltersFile: "shelters_2026_random_sites_r2.csv", elayerFile: elayer("shelters_2026_random_sites_r2.csv"), reserveDriven: false },
  { code: 6, scenarioName: "CRANDOM_r3_existing_expanded_plus_ten_RANDOM_sites", sheltersFile: "shelters_2026_random_sites_r3.csv", elayerFile: elayer("shelters_2026_random_sites_r3.csv"), reserveDriven: false },
  // Arm D reads arm B's file verbatim: same 36 sites, same 6,842 spaces. Only
  // the intake rule (triageReserveFraction) differs.
  { code: 7, scenarioName: "D_need_based_admission_real_locations", sheltersFile: B, elayerFile: elayer(B), reserveDriven: true },
  { code: 8, scenarioName: "CRANDOMPOOL_r4_random_from_arm_C_candidate_set", sheltersFile: "shelters_2026_random_sites_r4.csv", elayerFile: elayer("shelters_2026_random_sites_r4.csv"), reserveDriven: false },
  { code: 9, scenarioName: "CRANDOMPOOL_r5_random_from_arm_C_candidate_set", sheltersFile: "shelters_2026_random_sites_r5.csv", elayerFile: elayer("shelters_2026_random_sites_r5.csv"), reserveDriven: false },
  { code: 10, scenarioName: "CRANDOMPOOL_r6_random_from_arm_C_candidate_set", sheltersFile: "shelters_2026_random_sites_r6.csv", elayerFile: elayer("shelters_2026_random_sites_r6.csv"), reserveDriven: false },
  { code: 11, scenarioName: "BSWEEP_s080_capacity_0.8x_demand_real_locations", sheltersFile: "shelters_2026_bsweep_s080.csv", elayerFile: elayer("shelters_2026_bsweep_s080.csv"), reserveDriven: false },
  { code: 12, scenarioName: "BSWEEP_s120_capacity_1.2x_demand_real_locations", sheltersFile: "shelters_2026_bsweep_s120.csv", elayerFile: elayer("shelters_2026_bsweep_s120.csv"), reserveDriven: false },
  { code: 13, scenarioName: "BSWEEP_s140_capacity_1.4x_demand_real_locations", sheltersFile: "shelters_2026_bsweep_s140.csv", elayerFile: elayer("shelters_2026_bsweep_s140.csv"), reserveDriven: false },
  { code: 14, scenarioName: "BSWEEP_s160_capacity_1.6x_demand_real_locations", sheltersFile: "shelters_2026_bsweep_s160.csv", elayerFile: elayer("shelters_2026_bsweep_s160.csv"), reserveDriven: false },
  { code: 15, scenarioName: "BSWEEP_s105_capacity_1.05x_demand_real_locations", sheltersFile: "shelters_2026_bsweep_s105.csv", elayerFile: elayer("shelters_2026_bsweep_s105.csv"), reserveDriven: false },
  { code: 16, scenarioName: "BSWEEP_s110_capacity_1.1x_demand_real_locations", sheltersFile: "shelters_2026_bsweep_s110.csv", elayerFile: elayer("shelters_2026_bsweep_s110.csv"), reserveDriven: false },
  { code: 17, scenarioName: "BSWEEP_s115_capacity_1.15x_demand_real_locations", sheltersFile: "shelters_2026_bsweep_s115.csv", elayerFile: elayer("shelters_2026_bsweep_s115.csv"), reserveDriven: false },
  { code: 18, scenarioName: "E18_severe_counterfactual_over_A_present_day", sheltersFile: A, elayerFile: elayer(A), reserveDriven: false },
  { code: 19, scenarioName: "E19_severe_counterfactual_over_C_expanded_plus_new_sites", sheltersFile: C, elayerFile: elayer(C), reserveDriven: false },
  { code: 20, scenarioName: "E20_severe_counterfactual_over_D_need_based_admission", sheltersFile: B, elayerFile: elayer(B), reserveDriven: true },
];

/** `ContextCreator`: `csv.substring(0, len - 4) + "_elayer.csv"`. */
export function elayer(sheltersFile: string): string {
  return `${sheltersFile.slice(0, sheltersFile.length - 4)}_elayer.csv`;
}

/** The `else` branch: any unmatched code is arm A, with no range error. */
export const FALLBACK_SCENARIO = SCENARIO_CHAIN[0] as ScenarioEntry;

/** Resolve a code through the Java ladder, falling back to arm A. */
export function scenarioForCode(code: number): ScenarioEntry {
  return SCENARIO_CHAIN.find((e) => e.code === code) ?? FALLBACK_SCENARIO;
}

/**
 * The codes for which `smokeSeriesCode = 0` produces the label-only warning
 * `ContextCreator` prints: an E arm whose severity was never actually turned on.
 */
export const SEVERE_LABEL_CODES: readonly number[] = [18, 19, 20];

// --- closures (V48) ---------------------------------------------------------

/** Number of committed worst-family draws; `closureDraw` outside 1..3 fails fast. */
export const CLOSURE_WORST_DRAWS = 3;

export interface ClosureEntry {
  readonly code: number;
  readonly draw: number | null;
  readonly file: string;
  readonly label: string;
}

/** `closuresCode` 0 schedules nothing; 1/2/3 select base, extreme and the worst family. */
export const CLOSURE_CHAIN: readonly ClosureEntry[] = [
  { code: 1, draw: null, file: "closures_E_r1.csv", label: "base" },
  { code: 2, draw: null, file: "closures_E_r1_extreme.csv", label: "extreme" },
  { code: 3, draw: 1, file: "closures_E_r1_worst.csv", label: "worst family draw 1" },
  { code: 3, draw: 2, file: "closures_E_r2_worst.csv", label: "worst family draw 2" },
  { code: 3, draw: 3, file: "closures_E_r3_worst.csv", label: "worst family draw 3" },
];

/**
 * Resolve a closure schedule. Returns `null` for code 0 (nothing scheduled,
 * nothing declared) and throws the Java fail-fast messages otherwise.
 */
export function closuresForCode(code: number, draw = 1): ClosureEntry | null {
  if (code < 0 || code > 3) {
    throw new Error(
      `closuresCode=${code} is not a registered schedule (V48: 0=none, 1=base, 2=extreme, 3=worst family)`,
    );
  }
  if (code === 0) {
    return null;
  }
  if (code === 3 && (draw < 1 || draw > CLOSURE_WORST_DRAWS)) {
    throw new Error(
      `closureDraw=${draw} but only draws 1..${CLOSURE_WORST_DRAWS} are committed (V48 worst family)`,
    );
  }
  const entry = CLOSURE_CHAIN.find((e) => e.code === code && (e.draw === null || e.draw === draw));
  if (entry === undefined) {
    throw new Error(`closuresCode=${code} draw=${draw} has no committed schedule`);
  }
  return entry;
}

/**
 * Full resolution of the shelter file an executed config reads, including the
 * V45 variant swap and its fail-fast. `variantExists` is injected so the browser
 * can answer from the shipped index while the pipeline answers from the disk.
 */
export function resolveShelterFile(
  scenarioCode: number,
  shelterPolicyVariant: number,
  variantExists: (fileName: string) => boolean,
): string {
  const entry = scenarioForCode(scenarioCode);
  if (shelterPolicyVariant !== 1) {
    return entry.sheltersFile;
  }
  if (!variantExists(entry.elayerFile)) {
    throw new Error(
      `shelterPolicyVariant=1 but ${SHELTERS_DIR}/${entry.elayerFile} does not exist; ` +
        "run scripts/build_shelter_policy_elayer.py",
    );
  }
  return entry.elayerFile;
}
