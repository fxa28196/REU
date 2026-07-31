/**
 * manifest.ts — `ExecutedManifest` plus the v1-parity ↔ v2-web field maps.
 *
 * Plan Q5. The manifest is emitted BY THE ENGINE FROM THE VALUES IT ACTUALLY
 * USED, never from the UI store. That rule is the direct transfer of gotcha 4:
 * archived Scenario-E runs were configured with `pushThetaThreshold = -0.25` and
 * executed `0.0`, and only an engine-sourced manifest can expose that. The UI
 * renders `parameter_diff`; a non-empty diff drives the badge to INVALID
 * (plan §5.4).
 *
 * `sim_id` is deterministic: hash(executed parameters ‖ engine version ‖ asset
 * SHAs). The wall-clock timestamp lives in its own field so it never enters the
 * hash — the Java manifest's `sim_id` was wall-clock-derived and therefore not
 * reproducible, which is the defect this replaces.
 */

import type { AssetManifest } from "./assets.js";
import { assetDigestList } from "./assets.js";
import type { RunConfig, RunConfigDelta } from "./config.js";
import { diffRunConfigs, orderRunConfig } from "./config.js";
import type { ParamName } from "./schema.js";
import { PARAM_NAMES } from "./schema.js";

// ---------------------------------------------------------------------------
// Schema ids
// ---------------------------------------------------------------------------

/** Output schema id emitted by every user-facing export (plan Q5). */
export const SIMULATION_SCHEMA_V2 = "reu-wildfire-shelter-abm/simulation/v2-web" as const;

/**
 * Schema id reproduced byte-for-byte by the parity formatter, used only by the
 * validation harness when diffing against the Java archive (plan Q6).
 */
export const SIMULATION_SCHEMA_PARITY = "reu-wildfire-shelter-abm/simulation/v1" as const;

/** The two output representations of one internal engine state (plan Q6). */
export const FORMATTER_MODES = ["parity", "v2-web"] as const;
export type FormatterMode = (typeof FORMATTER_MODES)[number];

/**
 * Fixed parameter order for `reproducibility.parameters`. Re-exported from the
 * schema so there is exactly one list: the Java comment "every new parameter
 * MUST appear here or the manifest silently lies" applies verbatim here.
 */
export const MANIFEST_PARAMETER_ORDER: readonly ParamName[] = PARAM_NAMES;

// ---------------------------------------------------------------------------
// ExecutedManifest
// ---------------------------------------------------------------------------

export interface EngineIdentity {
  /** e.g. `"websim-ts 0.1.0"` — replaces the Java build's engine identity. */
  readonly engine: string;
  readonly engine_version: string;
  /** Always `"n/a"` in the browser build; the field is kept for comparability. */
  readonly java_version: "n/a";
  /** Hardcoded in the Java manifest; carried forward so archives stay diffable. */
  readonly repast_version: "2.11.0";
  readonly websim_commit: string;
  readonly websim_dirty: boolean;
}

export interface ManifestReproducibility {
  readonly random_seed: number;
  /**
   * Deterministic hash of `simIdPreimage(...)`. Same config + same engine + same
   * assets ⇒ same `sim_id`, which is what makes the replay token real.
   */
  readonly sim_id: string;
  /** Exactly what was hashed, so a mismatch can be diagnosed, not just noticed. */
  readonly sim_id_preimage: SimIdPreimage;
  /** True UTC ISO-8601. The parity formatter reproduces the local-time quirk. */
  readonly generated_utc: string;
  /** Non-reproducible wall clock, deliberately outside the hash. */
  readonly wall_clock_utc: string;
  /** 12-hex tag over the model input files, as in the Java manifest. */
  readonly data_version_tag: string;
  /** All 41 names in fixed order — presence is checked, not assumed. */
  readonly parameters: readonly ParamName[];
}

export interface SimIdPreimage {
  /** `name=value` pairs in `MANIFEST_PARAMETER_ORDER`, joined by `|`. */
  readonly executed_parameters: string;
  readonly engine_version: string;
  /** `"<assetId>:<sha256>"` in sorted-id order. */
  readonly asset_digests: readonly string[];
}

export interface ManifestParameterDiff {
  readonly param: ParamName;
  readonly configured: number;
  readonly executed: number;
}

export interface ExecutedManifest {
  readonly schema: typeof SIMULATION_SCHEMA_V2 | typeof SIMULATION_SCHEMA_PARITY;
  readonly formatter_mode: FormatterMode;
  readonly engine: EngineIdentity;
  readonly reproducibility: ManifestReproducibility;
  /** What the user asked for. */
  readonly configured_parameters: RunConfig;
  /** What the engine actually used, post-parse and post-clamp. */
  readonly executed_parameters: RunConfig;
  /** Empty in a healthy run; non-empty drives the badge to INVALID. */
  readonly parameter_diff: readonly ManifestParameterDiff[];
  /**
   * Parameters for which the engine had to fall back to a code default. Always
   * empty on a browser run (plan Q2: no browser path exercises a batch
   * fallback); a non-empty list is a contract violation worth surfacing.
   */
  readonly fallbacks_hit: readonly ParamName[];
  readonly assets: AssetManifest;
  /** Count of smoke lookups outside the loaded window; > 0 ⇒ INVALID (Q11). */
  readonly out_of_range_lookups: number;
}

// ---------------------------------------------------------------------------
// sim_id
// ---------------------------------------------------------------------------

/** Canonical `name=value|name=value|…` serialisation in fixed parameter order. */
export function canonicalExecutedParameters(executed: RunConfig): string {
  const ordered = orderRunConfig(executed);
  return MANIFEST_PARAMETER_ORDER.map((name) => `${name}=${formatParamValue(ordered[name])}`).join(
    "|",
  );
}

/**
 * Canonical numeric rendering for the `sim_id` preimage.
 *
 * `String(x)` is used rather than a fixed-precision format so no information is
 * lost, with two normalisations: `-0` renders as `"-0"` (JS `String(-0)` is
 * `"0"`, which would collapse two distinct doubles), and non-finite values throw
 * rather than hashing as `"NaN"` — a non-finite parameter is a bug, and hashing
 * it would produce a stable id for an invalid run.
 */
function formatParamValue(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Non-finite parameter value cannot enter a sim_id preimage: ${String(value)}`);
  }
  return Object.is(value, -0) ? "-0" : String(value);
}

/** Build the exact preimage for `sim_id`. Hashing happens in the engine. */
export function simIdPreimage(
  executed: RunConfig,
  engineVersion: string,
  assets: AssetManifest,
): SimIdPreimage {
  return {
    executed_parameters: canonicalExecutedParameters(executed),
    engine_version: engineVersion,
    asset_digests: assetDigestList(assets),
  };
}

/**
 * Flatten a preimage to the single string that gets hashed.
 *
 * `shared` stays dependency-light and does not implement SHA-256; the engine
 * hashes this string with the same primitive it uses everywhere else, so there
 * is one hash implementation in the codebase rather than two.
 */
export function simIdPreimageString(preimage: SimIdPreimage): string {
  return [
    preimage.executed_parameters,
    preimage.engine_version,
    preimage.asset_digests.join(","),
  ].join("‖");
}

// ---------------------------------------------------------------------------
// Completeness + diff checks
// ---------------------------------------------------------------------------

export interface ManifestCompleteness {
  readonly ok: boolean;
  readonly missing: readonly ParamName[];
  readonly unexpected: readonly string[];
}

/**
 * The check plan §3.1 folds into the schema: a manifest that omits a parameter
 * is a manifest that lies about the run.
 */
export function checkManifestParameterCompleteness(
  parameters: readonly string[],
): ManifestCompleteness {
  const present = new Set(parameters);
  const missing = MANIFEST_PARAMETER_ORDER.filter((name) => !present.has(name));
  const expected = new Set<string>(MANIFEST_PARAMETER_ORDER);
  const unexpected = parameters.filter((name) => !expected.has(name));
  return { ok: missing.length === 0 && unexpected.length === 0, missing, unexpected };
}

/** Configured-vs-executed diff, in manifest order. */
export function configuredVsExecuted(
  configured: RunConfig,
  executed: RunConfig,
): readonly ManifestParameterDiff[] {
  return diffRunConfigs(configured, executed).map((delta: RunConfigDelta) => ({
    param: delta.param,
    configured: delta.base,
    executed: delta.other,
  }));
}

// ---------------------------------------------------------------------------
// Q6 field maps: v1-parity ↔ v2-web
// ---------------------------------------------------------------------------

/**
 * How a v1 output field maps onto the v2-web output.
 *
 * The rule this table encodes (plan Q6): **number values never differ between
 * modes — only representation and key names.** Anything that would change a
 * number is engine semantics, not formatting, and belongs in
 * {@link ENGINE_SEMANTICS_QUIRKS} instead.
 */
export interface SimulationFieldMapping {
  /** Stable id; appears in the v2 changelog and in export annotations. */
  readonly id: string;
  /** Where the field lives — the file, and the key path within it. */
  readonly file: "simulation.json" | "agents.csv" | "shelters.csv";
  /** v1 key (or the v1 behaviour, when the key name is unchanged). */
  readonly parityKey: string;
  /** v2-web key(s). More than one where v1 collapsed two quantities into one. */
  readonly v2Keys: readonly string[];
  /** `retained` = the quirk is NOT fixed in v2-web; it is correct behaviour. */
  readonly v2Status: "fixed" | "retained";
  readonly parityBehaviour: string;
  readonly v2Behaviour: string;
}

/**
 * The seven v1 output quirks (plan Q6). Parity mode reproduces all seven; v2-web
 * fixes six and deliberately retains HALF_UP rounding, because HALF_UP is
 * *correct* — it is JavaScript's `toFixed`, which rounds the binary double, that
 * is wrong. `toFixed` is never used in either mode.
 */
export const SIMULATION_FIELD_MAP: readonly SimulationFieldMapping[] = [
  {
    id: "nan-strata",
    file: "simulation.json",
    parityKey: "stratified_exposure.<stratum>.*",
    v2Keys: ["stratified_exposure.<stratum>.*"],
    v2Status: "fixed",
    parityBehaviour:
      "An empty stratum prints bare NaN, which is not valid JSON — the archive contains files no strict parser will read.",
    v2Behaviour: "An empty stratum emits null for every statistic; n stays 0.",
  },
  {
    id: "door-refusals-naming",
    file: "agents.csv",
    parityKey: "door_refusals",
    v2Keys: ["retarget_count_at_end"],
    v2Status: "fixed",
    parityBehaviour:
      "The column is named for door refusals but carries retargetCount, which resets on REFUSED_ALL_FULL re-entry and therefore under-reports refusals.",
    v2Behaviour:
      "Renamed to what it measures, with a note pointing at shelters.csv refused_count for actual refusal totals. The number is unchanged.",
  },
  {
    id: "utilization-final-only",
    file: "shelters.csv",
    parityKey: "utilization",
    v2Keys: ["utilization_final", "utilization_peak"],
    v2Status: "fixed",
    parityBehaviour:
      "`utilization` is final_occupancy / capacity — final, not peak — but the name does not say so, and peak is not emitted at all.",
    v2Behaviour:
      "Two explicitly named columns. `utilization_final` is bit-identical to v1's `utilization`.",
  },
  {
    id: "generated-utc-local",
    file: "simulation.json",
    parityKey: "generated_utc",
    v2Keys: ["generated_utc"],
    v2Status: "fixed",
    parityBehaviour: "The field is named UTC but holds local time.",
    v2Behaviour: "True UTC. Parity mode still reproduces the local-time quirk.",
  },
  {
    id: "json-escaping",
    file: "simulation.json",
    parityKey: "(all string values)",
    v2Keys: ["(all string values)"],
    v2Status: "fixed",
    parityBehaviour:
      "jsonEsc escapes only backslash and double-quote; a control character or newline in a name would corrupt the file.",
    v2Behaviour: "Full JSON string escaping.",
  },
  {
    id: "crlf-line-endings",
    file: "agents.csv",
    parityKey: "(line terminator)",
    v2Keys: ["(line terminator)"],
    v2Status: "fixed",
    parityBehaviour: "Java's %n resolves to CRLF on the Windows build host.",
    v2Behaviour: "LF.",
  },
  {
    id: "half-up-rounding",
    file: "agents.csv",
    parityKey: "(all fixed-precision numbers)",
    v2Keys: ["(all fixed-precision numbers)"],
    v2Status: "retained",
    parityBehaviour:
      "Java %.Nf rounds the decimal value HALF_UP, so 0.615 formats as 0.62 where JS toFixed gives 0.61.",
    v2Behaviour:
      "HALF_UP is retained in v2-web — it is the correct behaviour, and both modes share one formatter. toFixed is never used.",
  },
];

/**
 * Quirks that are NOT formatting. Changing these changes physics or counters and
 * breaks Tier 3, so both modes reproduce them forever (plan Q6). They are listed
 * here so nobody "fixes" one while cleaning up the field map above.
 */
export interface EngineSemanticsQuirk {
  readonly id: string;
  readonly behaviour: string;
  readonly whyReproduced: string;
  readonly reproducedIn: "both";
}

export const ENGINE_SEMANTICS_QUIRKS: readonly EngineSemanticsQuirk[] = [
  {
    id: "double-concentration-lookup",
    behaviour:
      "The agent step reads the smoke concentration twice per tick, so an out-of-window lookup increments out_of_range_lookups twice.",
    whyReproduced:
      "The counter is a validation gate input and the second read participates in exposure accounting; removing it changes numbers.",
    reproducedIn: "both",
  },
  {
    id: "closed-door-not-counted-refused",
    behaviour:
      "Arriving at a shelter that is closed for the hour does not increment refusedCount; only a full-capacity or policy refusal does.",
    whyReproduced:
      "refused_count is compared against the archive; recounting closed doors would shift every arm's refusal totals.",
    reproducedIn: "both",
  },
];

/** Look up a field mapping by id. */
export function fieldMapping(id: string): SimulationFieldMapping | undefined {
  return SIMULATION_FIELD_MAP.find((m) => m.id === id);
}
