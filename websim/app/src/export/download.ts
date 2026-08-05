/**
 * export/download.ts — v2-web run exports + the replay token (WP12c, plan §6.6).
 *
 * The three output files come from the ENGINE's own `exportOutputs`
 * (`SimWorkerApi.exportOutputs` → `SimHost.exportOutputs` →
 * `output/logger.ts#writeRunOutputs`) — this module never assembles a CSV row
 * or a simulation-JSON line itself, because a second writer would be a second,
 * unverified model of the output format. The "parity format" toggle simply
 * selects the engine's `parity` flavour (byte-faithful to the certified Java
 * writer, quirks included, for validation diffing); the default is `v2-web`.
 *
 * ## Executed parameters come from the engine, never the UI store
 *
 * Plan Q5: "ExecutedManifest is emitted by the engine from the values it
 * actually used — never from the UI store." The engine has no separate
 * manifest RPC; what it does emit is `simulation.json`, whose
 * `reproducibility.parameters` block `SimHost.exportOutputs` fills from
 * `built.config` — the values the run executed. `parseExecutedParameters`
 * reads that block back (from the v2-web flavour, whose JSON is parseable by
 * construction; parity JSON can legally contain Java's bare-`NaN` quirk),
 * checks 41-parameter completeness, and re-validates it as a `RunConfig`. The
 * export manifest's `parameter_diff` is then configured-vs-EXECUTED — the
 * negative-zeroing lesson, applied to exports.
 *
 * ## Replay token
 *
 * Plan §6.6: config hash ‖ engine version ‖ asset SHAs. `replayToken` is the
 * PURE composition (tested directly); the hashes that feed it are WebCrypto
 * SHA-256 via the loader's `sha256Hex`. `sim_id` is the deterministic hash of
 * the shared `simIdPreimageString` — same config + same engine + same assets
 * ⇒ same `sim_id`, which is what makes replay a checkable claim.
 *
 * ## What this module refuses to fabricate
 *
 * - No `websim_commit` claim: build-time commit embedding lands with the WP14
 *   deploy pipeline, so the manifest says exactly that instead of "unknown"
 *   masquerading as a value.
 * - Constructed smoke series (codes 1/2) stamp `CONSTRUCTED_SERIES_LABEL`
 *   into the manifest's annotations; `smokeScale ≠ 1` adds a counterfactual
 *   note. Live numbers carry the live provenance class, verbatim.
 */

import { ENGINE_NAME, ENGINE_VERSION } from "@websim/engine";
import type { OutputFlavour, RunOutputs } from "@websim/engine/output";
import type { ExportRequest } from "@websim/engine/worker";
import type {
  AssetManifest,
  FormatterMode,
  ManifestParameterDiff,
  RunConfig,
  SimIdPreimage,
} from "@websim/shared";
import {
  SIMULATION_SCHEMA_PARITY,
  SIMULATION_SCHEMA_V2,
  assetDigestList,
  canonicalExecutedParameters,
  checkManifestParameterCompleteness,
  configuredVsExecuted,
  orderRunConfig,
  parseRunConfig,
  simIdPreimage,
  simIdPreimageString,
} from "@websim/shared";
import { PARAM_NAMES } from "@websim/shared/schema";

import { CONSTRUCTED_SERIES_LABEL, PROVENANCE_CLASSES } from "../index.js";
import { sha256Hex } from "../assets/loader.js";

// ---------------------------------------------------------------------------
// Replay token (pure)
// ---------------------------------------------------------------------------

/** Token format id; bump if the composition ever changes. */
export const REPLAY_TOKEN_FORMAT = "websim-replay/v1" as const;

/** Field delimiter — the same `‖` the shared `simIdPreimageString` uses. */
export const REPLAY_TOKEN_DELIMITER = "‖" as const;

/**
 * Compose the deterministic replay token: config hash ‖ engine version ‖ asset
 * SHAs (plan §6.6). PURE — the caller supplies the already-computed hashes.
 * The asset list is sorted so the token is independent of input order (the
 * same rule `assetDigestList` applies for `sim_id`), and every part is
 * rejected if it contains the delimiter, because a token whose fields cannot
 * be split back apart is not a token.
 */
export function replayToken(
  configHash: string,
  engineVersion: string,
  assetShas: readonly string[],
): string {
  if (configHash.length === 0) {
    throw new Error("replayToken: configHash must be non-empty");
  }
  if (engineVersion.length === 0) {
    throw new Error("replayToken: engineVersion must be non-empty");
  }
  const parts = [configHash, engineVersion, ...assetShas];
  for (const part of parts) {
    if (part.includes(REPLAY_TOKEN_DELIMITER)) {
      throw new Error(
        `replayToken: a field contains the token delimiter '${REPLAY_TOKEN_DELIMITER}': ${part}`,
      );
    }
  }
  const sortedShas = [...assetShas].sort();
  return [REPLAY_TOKEN_FORMAT, configHash, engineVersion, sortedShas.join(",")].join(
    REPLAY_TOKEN_DELIMITER,
  );
}

// ---------------------------------------------------------------------------
// Pure helpers around the engine's output
// ---------------------------------------------------------------------------

/** Schema id of the simulation file a flavour produces. */
export function simulationSchemaFor(
  flavour: OutputFlavour,
): typeof SIMULATION_SCHEMA_V2 | typeof SIMULATION_SCHEMA_PARITY {
  return flavour === "parity" ? SIMULATION_SCHEMA_PARITY : SIMULATION_SCHEMA_V2;
}

export interface ExportFileNames {
  readonly agents: string;
  readonly shelters: string;
  readonly simulation: string;
  readonly manifest: string;
  readonly replayToken: string;
}

/**
 * File names per flavour. Parity keeps the Java writer's `simulation.json`
 * name so an archive diff is name-for-name; v2-web is `simulation.v2.json`
 * (plan §6.6). The manifest and token sidecars ship with both.
 */
export function exportFileNames(flavour: OutputFlavour): ExportFileNames {
  return {
    agents: "agents.csv",
    shelters: "shelters.csv",
    simulation: flavour === "parity" ? "simulation.json" : "simulation.v2.json",
    manifest: "manifest.executed.json",
    replayToken: "replay-token.txt",
  };
}

/**
 * Read the EXECUTED parameter block back out of the engine's own v2-web
 * `simulation.json` text. Throws (never guesses) when the text is not
 * parseable JSON, when any of the 41 parameters is missing or unexpected, or
 * when the block fails `RunConfig` validation. Pass v2-web text only: the
 * parity flavour may contain the archive's bare-`NaN` quirk, which no JSON
 * parser reads — by design.
 */
export function parseExecutedParameters(simulationJsonV2: string): RunConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(simulationJsonV2);
  } catch (error) {
    throw new Error(
      "executed-parameter readback: the engine's simulation JSON did not parse " +
        `(was a parity-flavour text passed instead of v2-web?): ${
          error instanceof Error ? error.message : String(error)
        }`,
    );
  }
  const reproducibility = (parsed as { reproducibility?: unknown }).reproducibility;
  const parameters = (reproducibility as { parameters?: unknown } | undefined)?.parameters;
  if (typeof parameters !== "object" || parameters === null) {
    throw new Error(
      "executed-parameter readback: simulation JSON carries no reproducibility.parameters block",
    );
  }
  const completeness = checkManifestParameterCompleteness(Object.keys(parameters));
  if (!completeness.ok) {
    throw new Error(
      "executed-parameter readback: the engine's parameter block is not the full 41-name " +
        `manifest (missing: ${completeness.missing.join(", ") || "none"}; unexpected: ${
          completeness.unexpected.join(", ") || "none"
        })`,
    );
  }
  return parseRunConfig(parameters, "engine-executed parameters");
}

/** WebCrypto SHA-256 of the canonical executed-parameter serialisation. */
export async function configHashOf(executed: RunConfig): Promise<string> {
  return sha256Hex(new TextEncoder().encode(canonicalExecutedParameters(executed)));
}

/** Deterministic `sim_id`: SHA-256 of the shared preimage string (plan Q5). */
export async function simIdFor(executed: RunConfig, assets: AssetManifest): Promise<string> {
  const preimage = simIdPreimage(executed, ENGINE_VERSION, assets);
  return sha256Hex(new TextEncoder().encode(simIdPreimageString(preimage)));
}

/**
 * Timestamp the engine will print into `generated_utc`. v2-web: true UTC.
 * Parity: the QUIRK — local wall time in a field named UTC, as the certified
 * Java writer does (`LocalDateTime.now()`); the quirk class is reproduced, not
 * Java's exact fractional-second formatting.
 */
export function generatedTimestampFor(flavour: OutputFlavour, date: Date): string {
  if (flavour === "v2-web") {
    return date.toISOString();
  }
  const p2 = (n: number): string => String(n).padStart(2, "0");
  const p3 = (n: number): string => String(n).padStart(3, "0");
  return (
    `${date.getFullYear()}-${p2(date.getMonth() + 1)}-${p2(date.getDate())}` +
    `T${p2(date.getHours())}:${p2(date.getMinutes())}:${p2(date.getSeconds())}.${p3(date.getMilliseconds())}`
  );
}

/**
 * Honesty annotations for the executed smoke configuration (plan §6.4):
 * series 1/2 carry the constructed-counterfactual label VERBATIM; a non-unit
 * `smokeScale` is flagged as a counterfactual rescale. Empty for the observed
 * series at unit scale.
 */
export function smokeExportAnnotations(
  executed: Pick<RunConfig, "smokeSeriesCode" | "smokeScale">,
): readonly string[] {
  const notes: string[] = [];
  if (executed.smokeSeriesCode === 1) {
    notes.push(`${CONSTRUCTED_SERIES_LABEL} (smokeSeriesCode 1, severe v1)`);
  } else if (executed.smokeSeriesCode === 2) {
    notes.push(
      `${CONSTRUCTED_SERIES_LABEL} (smokeSeriesCode 2, worst-plausible v2, Canberra-anchored)`,
    );
  }
  if (executed.smokeScale !== 1) {
    notes.push(
      `smokeScale ${executed.smokeScale}: effective severity = embedded series × ` +
        `${executed.smokeScale} — a counterfactual rescale, not the series as shipped`,
    );
  }
  return notes;
}

// ---------------------------------------------------------------------------
// Export manifest
// ---------------------------------------------------------------------------

/** Schema id of `manifest.executed.json`. */
export const EXPORT_MANIFEST_SCHEMA = "reu-wildfire-shelter-abm/export-manifest/v1" as const;

export interface RunExportManifest {
  readonly schema: typeof EXPORT_MANIFEST_SCHEMA;
  /** Schema of the accompanying simulation file. */
  readonly simulation_schema: typeof SIMULATION_SCHEMA_V2 | typeof SIMULATION_SCHEMA_PARITY;
  readonly formatter_mode: FormatterMode;
  /** `PROVENANCE_CLASSES.live`, verbatim — these are live browser numbers. */
  readonly provenance_class: (typeof PROVENANCE_CLASSES)["live"];
  readonly engine: {
    readonly engine: typeof ENGINE_NAME;
    readonly engine_version: string;
    readonly java_version: "n/a";
    readonly repast_version: "2.11.0";
    /** Why there is no commit field yet — stated, not faked. */
    readonly build_note: string;
  };
  readonly reproducibility: {
    readonly random_seed: number;
    readonly sim_id: string;
    readonly sim_id_preimage: SimIdPreimage;
    readonly config_hash_sha256: string;
    readonly replay_token: string;
    /** True UTC of the export action (outside every hash). */
    readonly generated_utc: string;
  };
  /** What the UI asked for (manifest order). */
  readonly configured_parameters: RunConfig;
  /** What the engine executed — read back from its own emission (module doc). */
  readonly executed_parameters: RunConfig;
  /** Configured-vs-executed. Empty in a healthy run; never hidden. */
  readonly parameter_diff: readonly ManifestParameterDiff[];
  readonly smoke_series_annotations: readonly string[];
  /** The verified asset manifest — the SHAs behind the replay token. */
  readonly assets: AssetManifest;
}

export interface BuildExportManifestArgs {
  readonly flavour: OutputFlavour;
  readonly configured: RunConfig;
  readonly executed: RunConfig;
  readonly assets: AssetManifest;
  readonly simId: string;
  readonly configHash: string;
  readonly token: string;
  readonly generatedUtc: string;
}

/** Assemble `manifest.executed.json`'s object. Pure. */
export function buildExportManifest(args: BuildExportManifestArgs): RunExportManifest {
  return {
    schema: EXPORT_MANIFEST_SCHEMA,
    simulation_schema: simulationSchemaFor(args.flavour),
    formatter_mode: args.flavour,
    provenance_class: PROVENANCE_CLASSES.live,
    engine: {
      engine: ENGINE_NAME,
      engine_version: ENGINE_VERSION,
      java_version: "n/a",
      repast_version: "2.11.0",
      build_note:
        "websim commit embedding arrives with the WP14 deploy pipeline; this build does " +
        "not carry its commit, so no commit is claimed here.",
    },
    reproducibility: {
      random_seed: args.executed.randomSeed,
      sim_id: args.simId,
      sim_id_preimage: simIdPreimage(args.executed, ENGINE_VERSION, args.assets),
      config_hash_sha256: args.configHash,
      replay_token: args.token,
      generated_utc: args.generatedUtc,
    },
    configured_parameters: orderRunConfig(args.configured),
    executed_parameters: orderRunConfig(args.executed),
    parameter_diff: configuredVsExecuted(args.configured, args.executed),
    smoke_series_annotations: smokeExportAnnotations(args.executed),
    assets: args.assets,
  };
}

// ---------------------------------------------------------------------------
// Bundle assembly
// ---------------------------------------------------------------------------

/** The slice of `SimWorkerClient` this module needs — structural, so tests fake it. */
export interface RunExportSource {
  readonly api: {
    exportOutputs(request: ExportRequest): RunOutputs | Promise<RunOutputs>;
  };
}

export interface ExportFile {
  readonly name: string;
  readonly mimeType: string;
  readonly text: string;
}

export interface RunExportOptions {
  /** The parity toggle: `"v2-web"` (default surface) or `"parity"` (for validation). */
  readonly flavour: OutputFlavour;
  /** What the UI asked for — diffed against the engine's executed values. */
  readonly configured: RunConfig;
  /** The verified asset manifest (its SHAs feed `sim_id` and the token). */
  readonly assets: AssetManifest;
  /** Clock, injectable for tests. */
  readonly now?: () => Date;
}

export interface RunExportBundle {
  readonly flavour: OutputFlavour;
  /** agents, shelters, simulation, manifest, token — in download order. */
  readonly files: readonly ExportFile[];
  readonly manifest: RunExportManifest;
  readonly executed: RunConfig;
  readonly simId: string;
  readonly configHash: string;
  readonly replayToken: string;
}

const CSV_MIME = "text/csv;charset=utf-8";
const JSON_MIME = "application/json;charset=utf-8";
const TEXT_MIME = "text/plain;charset=utf-8";

/**
 * Assemble the full export bundle. Two engine calls, both read-only formatting
 * of the same finished run state: the first (always v2-web) exists to read the
 * EXECUTED parameters back, because `sim_id` hashes them and therefore cannot
 * be known before them; the second emits the requested flavour with the
 * deterministic `sim_id` and the flavour-correct timestamp embedded.
 */
export async function buildRunExportBundle(
  client: RunExportSource,
  options: RunExportOptions,
): Promise<RunExportBundle> {
  const paramNames = PARAM_NAMES;
  const probe = await client.api.exportOutputs({ flavour: "v2-web", paramNames });
  const executed = parseExecutedParameters(probe.simulationJson);

  const configHash = await configHashOf(executed);
  const simId = await simIdFor(executed, options.assets);
  const token = replayToken(configHash, ENGINE_VERSION, [...assetDigestList(options.assets)]);
  const wallClock = options.now === undefined ? new Date() : options.now();

  const outputs = await client.api.exportOutputs({
    flavour: options.flavour,
    paramNames,
    env: {
      simId,
      generatedTimestamp: generatedTimestampFor(options.flavour, wallClock),
    },
  });

  const manifest = buildExportManifest({
    flavour: options.flavour,
    configured: options.configured,
    executed,
    assets: options.assets,
    simId,
    configHash,
    token,
    generatedUtc: wallClock.toISOString(),
  });

  const names = exportFileNames(options.flavour);
  const files: readonly ExportFile[] = [
    { name: names.agents, mimeType: CSV_MIME, text: outputs.agentsCsv },
    { name: names.shelters, mimeType: CSV_MIME, text: outputs.sheltersCsv },
    { name: names.simulation, mimeType: JSON_MIME, text: outputs.simulationJson },
    { name: names.manifest, mimeType: JSON_MIME, text: `${JSON.stringify(manifest, null, 2)}\n` },
    { name: names.replayToken, mimeType: TEXT_MIME, text: `${token}\n` },
  ];

  return { flavour: options.flavour, files, manifest, executed, simId, configHash, replayToken: token };
}

// ---------------------------------------------------------------------------
// Browser download plumbing
// ---------------------------------------------------------------------------

/**
 * Default saver: Blob → `URL.createObjectURL` → synthetic anchor click →
 * revoke. The revoke is queued as a macrotask because the click's download
 * starts in the same task; revoking inside it is a known abort race in some
 * engines. Browser-only by nature — tests inject a collector instead.
 */
export function saveBlobFile(file: ExportFile): void {
  const blob = new Blob([file.text], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  }
}

/**
 * The Run/Compare screens' export action: build the bundle from the engine's
 * own writers, then save all five files. Returns the bundle so the caller can
 * surface `sim_id`, the token, or a non-empty `parameter_diff`.
 */
export async function downloadRunOutputs(
  client: RunExportSource,
  options: RunExportOptions & { readonly save?: (file: ExportFile) => void },
): Promise<RunExportBundle> {
  const bundle = await buildRunExportBundle(client, options);
  const save = options.save ?? saveBlobFile;
  for (const file of bundle.files) {
    save(file);
  }
  return bundle;
}
