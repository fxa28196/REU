/**
 * manifest.ts — reading archived `simulation.json` (schema
 * `reu-wildfire-shelter-abm/simulation/v1`).
 *
 * The v1 manifest is hand-assembled by Java with a fixed key order and NO JSON
 * library (PORT_MAP §5.3), which has two consequences this reader must respect:
 *
 *   1. Blocks are conditional. Across the 154 archived manifests: `governance`,
 *      `scenario`, `population_sampling` and `stratified_exposure` appear in 135
 *      (absent only from the legacy `final-baseline`); `decision_layer` in 60;
 *      `closures` in 48. Parameter blocks are equally conditional — 11 core
 *      params everywhere, +22 Phase-E params in 60 runs, +7 Scenario-E params in
 *      48, and `closureDraw` in only 27. Every accessor is therefore optional.
 *   2. Empty strata emit bare `NaN`, which is not valid JSON (PORT_MAP §5.3 /
 *      risk R10). No archived manifest trips it today (154/154 parse), but the
 *      reader repairs it rather than crashing the whole bundle build if one
 *      ever does, and records the repair so it is visible instead of silent.
 */

export interface ManifestFileRef {
  readonly file: string;
  readonly sha256: string;
}

export interface SimulationManifest {
  readonly schema?: string;
  readonly generated_utc?: string;
  readonly reproducibility?: {
    readonly random_seed?: number;
    readonly sim_id?: string;
    readonly data_version_tag?: string;
    readonly git_commit?: string;
    readonly java_version?: string;
    readonly repast_version?: string;
    readonly parameters?: Readonly<Record<string, number>>;
    readonly input_datasets?: readonly ManifestFileRef[];
    readonly source_integrity?: {
      readonly git_working_tree_dirty?: boolean;
      readonly files?: readonly ManifestFileRef[];
    };
  };
  readonly smoke_field?: {
    readonly county?: string;
    readonly start?: string;
    readonly hours?: number;
    readonly peak_hourly_ugm3?: number;
    readonly out_of_range_lookups?: number;
  };
  readonly street_network_validation?: Readonly<Record<string, unknown>>;
  readonly governance?: Readonly<Record<string, unknown>>;
  readonly stratified_exposure?: Readonly<Record<string, unknown>>;
  readonly scenario?: string;
  readonly population_sampling?: Readonly<Record<string, unknown>>;
  readonly decision_layer?: Readonly<Record<string, unknown>>;
  readonly closures?: Readonly<Record<string, unknown>>;
  readonly population?: {
    readonly n_agents?: number;
    readonly pre_evac?: number;
    readonly sheltered?: number;
    readonly en_route?: number;
    readonly unreachable?: number;
    readonly refused_all_full?: number;
    readonly exposure_ugm3h?: Readonly<Record<string, number>>;
    readonly vwe_ugm3h?: Readonly<Record<string, number>>;
    readonly total_person_hours_above_unhealthy?: number;
    readonly travel_m?: Readonly<Record<string, number>>;
  };
  readonly shelters?: readonly Readonly<Record<string, unknown>>[];
}

export interface ManifestReadResult {
  readonly manifest: SimulationManifest;
  /**
   * `true` when bare `NaN` tokens had to be rewritten to `null` before parsing —
   * the invalid-JSON quirk. Surfaced into the bundle so it is never silent.
   */
  readonly repairedNaN: boolean;
}

/** Bare `NaN` / `Infinity` tokens in value position, outside string literals. */
const BARE_NON_JSON = /(?<=[:[,]\s*)(?:NaN|-?Infinity)(?=\s*[,\]}])/gu;

export function readManifestText(text: string, label = "simulation.json"): ManifestReadResult {
  try {
    return { manifest: JSON.parse(text) as SimulationManifest, repairedNaN: false };
  } catch (first) {
    const repaired = text.replace(BARE_NON_JSON, "null");
    if (repaired === text) {
      throw new Error(`${label}: not parseable as JSON (${String(first)})`);
    }
    try {
      return { manifest: JSON.parse(repaired) as SimulationManifest, repairedNaN: true };
    } catch (second) {
      throw new Error(
        `${label}: not parseable even after rewriting bare NaN/Infinity (${String(second)})`,
      );
    }
  }
}

/** Ticks per simulated hour, from the executed `minutesPerTick`. */
export function ticksPerHour(manifest: SimulationManifest): number {
  const minutes = manifest.reproducibility?.parameters?.["minutesPerTick"];
  if (minutes === undefined || !(minutes > 0)) {
    throw new Error("manifest: minutesPerTick is missing or non-positive");
  }
  const ticks = 60 / minutes;
  if (!Number.isInteger(ticks)) {
    throw new Error(
      `manifest: minutesPerTick=${minutes} does not divide an hour into whole ticks; ` +
        "the hourly census would have to interpolate, which it must never do",
    );
  }
  return ticks;
}

/**
 * Number of hourly samples a run covers: `simulationHours + 1`.
 *
 * The final tick is inclusive and reads hour index == `simulationHours`
 * (never-regress gotcha 3), which is exactly why `simulationHours` must be
 * `≤ slices − 1`. The census length must match that, not `simulationHours`.
 */
export function hourlySampleCount(manifest: SimulationManifest): number {
  const hours = manifest.reproducibility?.parameters?.["simulationHours"];
  if (hours === undefined || !Number.isInteger(hours) || hours < 0) {
    throw new Error("manifest: simulationHours is missing or not a non-negative integer");
  }
  return hours + 1;
}
