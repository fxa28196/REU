/**
 * presets/index.ts — the shipped presets, loaded from the generated JSON.
 *
 * The JSON files, not the definitions, are what the app runs. That is
 * deliberate: the definitions express a bundle as a delta for readability, and
 * the JSON is the fully-explicit 41-parameter artifact that gets shipped,
 * hashed, permalinked and diffed. Loading the artifact means a hand edit to a
 * JSON file changes what runs — and `test/presets.test.ts` catches it by pinning
 * every file to `materialisePreset(definition)`.
 *
 * Each file is validated at module load. A malformed preset is a build defect,
 * so failing loudly at import beats shipping a config the schema would reject.
 */

import type { RunConfig } from "../config.js";
import { parseRunConfig } from "../config.js";
import type { PresetDefinition, PresetId } from "./definitions.js";
import { PRESET_DEFINITIONS, PRESET_IDS } from "./definitions.js";

import defaultFreshRun from "./default_fresh_run.json" with { type: "json" };
import armA from "./A_present_day.json" with { type: "json" };
import armB from "./B_capacity_meets_demand.json" with { type: "json" };
import armC from "./C_expanded_plus_new_sites.json" with { type: "json" };
import e0NullA from "./E0_null_A.json" with { type: "json" };
import e0NullB from "./E0_null_B.json" with { type: "json" };
import e0NullC from "./E0_null_C.json" with { type: "json" };
import erBaselineRealA from "./ER_baseline_real_A.json" with { type: "json" };
import erBaselineRealC from "./ER_baseline_real_C.json" with { type: "json" };
import seSevereV1E18 from "./SE_severe_v1_E18.json" with { type: "json" };
import seSevereV1E19 from "./SE_severe_v1_E19.json" with { type: "json" };
import se2WorstPlausibleE18D1 from "./SE2_worst_plausible_E18_d1.json" with { type: "json" };
import se2WorstPlausibleE18D2 from "./SE2_worst_plausible_E18_d2.json" with { type: "json" };

export * from "./definitions.js";

/** Raw parsed JSON, before schema validation — used by completeness tests. */
export const PRESET_JSON: Readonly<Record<PresetId, unknown>> = {
  default_fresh_run: defaultFreshRun,
  A_present_day: armA,
  B_capacity_meets_demand: armB,
  C_expanded_plus_new_sites: armC,
  E0_null_A: e0NullA,
  E0_null_B: e0NullB,
  E0_null_C: e0NullC,
  ER_baseline_real_A: erBaselineRealA,
  ER_baseline_real_C: erBaselineRealC,
  SE_severe_v1_E18: seSevereV1E18,
  SE_severe_v1_E19: seSevereV1E19,
  SE2_worst_plausible_E18_d1: se2WorstPlausibleE18D1,
  SE2_worst_plausible_E18_d2: se2WorstPlausibleE18D2,
};

function loadPresets(): Readonly<Record<PresetId, RunConfig>> {
  const loaded: Partial<Record<PresetId, RunConfig>> = {};
  for (const id of PRESET_IDS) {
    loaded[id] = parseRunConfig(PRESET_JSON[id], `preset '${id}'`);
  }
  return loaded as Record<PresetId, RunConfig>;
}

/** Validated preset configurations, keyed by preset id. */
export const PRESETS: Readonly<Record<PresetId, RunConfig>> = loadPresets();

const DEFINITIONS_BY_ID: ReadonlyMap<PresetId, PresetDefinition> = new Map(
  PRESET_DEFINITIONS.map((definition) => [definition.id, definition]),
);

/** The preset a fresh UI run starts from (plan Q2). */
export const DEFAULT_PRESET_ID: PresetId = "default_fresh_run";

export function isPresetId(value: string): value is PresetId {
  return (PRESET_IDS as readonly string[]).includes(value);
}

/** Look up a preset config, or `undefined` for an unknown id (stale permalink). */
export function presetConfig(id: string): RunConfig | undefined {
  return isPresetId(id) ? PRESETS[id] : undefined;
}

/** Look up a preset's label / provenance metadata. */
export function presetDefinition(id: string): PresetDefinition | undefined {
  return isPresetId(id) ? DEFINITIONS_BY_ID.get(id) : undefined;
}
