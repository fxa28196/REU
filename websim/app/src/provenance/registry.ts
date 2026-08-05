/**
 * provenance/registry.ts — the pure logic behind the WP12b screens
 * (Archive + Provenance). Everything here runs in Node with no DOM;
 * `app/test/provenance.test.ts` exercises it directly.
 *
 * ## Registry browser (plan Q10 / §6.1 screen 4)
 *
 * The governance registry (`Geography/data/registry/{variables,assumptions}.csv`)
 * is NEVER read from the browser. The pipeline runs the full readStrict-
 * equivalent validation at build time (`pipeline/src/registry.ts`; a violation
 * fails the asset build) and ships the validated snapshot as
 * `assets/registry-snapshot.json`, listed in the asset manifest. This module
 * loads that snapshot through the same digest discipline the verified loader
 * applies to every other asset (SHA-256 against the manifest entry, mismatch
 * throws), then re-derives the censuses FROM THE ROWS and refuses to return a
 * snapshot whose embedded summary numbers disagree with its own rows — the
 * screen must never display two numbers that cannot both be true.
 *
 * If the snapshot asset is absent from the manifest the result is an explicit
 * `"not-built"` state, which the Provenance screen renders as an honest
 * "registry asset not built" panel. Nothing is synthesised.
 *
 * ## Archive browser helpers
 *
 * Grouping, lineage extraction and the replay-preset match are pure functions
 * over the archive index / bundle JSON shapes documented in
 * `../assets/loader.ts`. A bundle's "Replay in browser" preset is the shipped
 * preset whose `archivedManifests` names the bundle's exact `run_dir` — the
 * exact-string rule matters, because the arm-A preset reproduces `A-seed42`
 * only; offering it as a replay of the seed-43 bundle would run a different
 * configuration than the one on screen.
 *
 * All grouping walks plain arrays in input order — no Map/Set iteration feeds
 * any displayed order.
 */

import type { AssetManifest } from "@websim/shared/assets";
import { assetIds } from "@websim/shared/assets";
import type { GraphCensus, GraphCorrection } from "@websim/shared/graph-asset";
import type { PresetDefinition } from "@websim/shared/presets/definitions";
import { PRESET_DEFINITIONS } from "@websim/shared/presets/definitions";

import type { AppAssets, ArchiveBundleEntry } from "../assets/loader.js";
import { assertDigestMatches, loadAppAssets, sha256Hex } from "../assets/loader.js";

// ---------------------------------------------------------------------------
// shared verified-asset access for the WP12b screens
// ---------------------------------------------------------------------------

let assetsPromise: Promise<AppAssets> | null = null;

/**
 * One verified-loader instance shared by the Archive and Provenance screens.
 *
 * Deliberately NOT the `useSimRun` session: that singleton also boots the sim
 * worker and transfers the graph, and browsing the archive is specified as
 * instant, zero compute. This promise costs one manifest fetch; per-asset bytes
 * are cached inside the returned `AppAssets` and by the browser's HTTP cache.
 * A failed boot clears the promise so a reload-free retry works in dev.
 */
export function sharedScreenAssets(): Promise<AppAssets> {
  if (assetsPromise === null) {
    assetsPromise = loadAppAssets();
    assetsPromise.catch(() => {
      assetsPromise = null;
    });
  }
  return assetsPromise;
}

/**
 * Byte fetcher for manifest-listed assets the `AppAssets` surface has no
 * accessor for (the registry snapshot). Same URL layout as the loader: an
 * asset id IS its URL path under the deployment base.
 */
export function assetByteFetcher(baseUrl: string): (id: string) => Promise<ArrayBuffer> {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return async (id: string): Promise<ArrayBuffer> => {
    const response = await fetch(base + id);
    if (!response.ok) {
      throw new Error(`asset fetch failed for '${base + id}': HTTP ${response.status}`);
    }
    return response.arrayBuffer();
  };
}

// ---------------------------------------------------------------------------
// registry snapshot: types + structural parse with cross-checks
// ---------------------------------------------------------------------------

/** Manifest id of the build-time-validated governance registry snapshot. */
export const REGISTRY_SNAPSHOT_ID = "assets/registry-snapshot.json" as const;

/** Schema id the shipped snapshot carries. */
export const REGISTRY_SNAPSHOT_SCHEMA = "reu-wildfire-shelter-abm/registry-snapshot/v1" as const;

/**
 * Evidence classes in the registry's own fixed order (`ScienceRegistry`
 * renders the census as {M=…, L=…, C=…, A=…, F=…}). The long names follow the
 * assumption-classification vocabulary the same registry declares
 * (measured, literature, calibrated, assumption, future_work).
 */
export const EVIDENCE_CLASS_ORDER = ["M", "L", "C", "A", "F"] as const;

export const EVIDENCE_CLASS_LABELS: Readonly<Record<string, string>> = {
  M: "M — measured",
  L: "L — literature",
  C: "C — calibrated",
  A: "A — assumption",
  F: "F — future work",
};

export interface RegistryVariableRow {
  readonly variable_id: string;
  readonly name: string;
  readonly evidence_class: string;
  readonly status: string;
  readonly doi_or_dataset: string;
  readonly uncertainty: string;
}

export interface RegistryAssumptionRow {
  readonly assumption_id: string;
  readonly statement: string;
  readonly classification: string;
  readonly status: string;
}

export interface RegistrySnapshot {
  readonly schema: string;
  /** The gate sentence the pipeline stamped (validation ran and PASSED). */
  readonly gate: string;
  /** What the gate checked — and, explicitly, what it did not. */
  readonly gate_scope: string;
  readonly variables_path: string;
  readonly variables_sha256: string;
  readonly assumptions_path: string;
  readonly assumptions_sha256: string;
  readonly variable_count: number;
  readonly assumption_count: number;
  readonly evidence_class_census: Readonly<Record<string, number>>;
  readonly assumption_class_census: Readonly<Record<string, number>>;
  readonly placeholder_variable_ids: readonly string[];
  readonly placeholder_note: string;
  readonly blocking_assumption_ids: readonly string[];
  readonly summary_line: string;
  readonly variables: readonly RegistryVariableRow[];
  readonly assumptions: readonly RegistryAssumptionRow[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(obj: Record<string, unknown>, key: string, where: string): string {
  const v = obj[key];
  if (typeof v !== "string") {
    throw new Error(`${where}: '${key}' is not a string`);
  }
  return v;
}

function num(obj: Record<string, unknown>, key: string, where: string): number {
  const v = obj[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`${where}: '${key}' is not a finite number`);
  }
  return v;
}

function strArray(obj: Record<string, unknown>, key: string, where: string): readonly string[] {
  const v = obj[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    throw new Error(`${where}: '${key}' is not an array of strings`);
  }
  return v as readonly string[];
}

function numRecord(obj: Record<string, unknown>, key: string, where: string): Readonly<Record<string, number>> {
  const v = obj[key];
  if (!isRecord(v)) {
    throw new Error(`${where}: '${key}' is not an object`);
  }
  for (const [k, x] of Object.entries(v)) {
    if (typeof x !== "number" || !Number.isFinite(x)) {
      throw new Error(`${where}: '${key}.${k}' is not a finite number`);
    }
  }
  return v as Readonly<Record<string, number>>;
}

/** Same members regardless of order (each list is also checked duplicate-free). */
function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((v, i) => v === bs[i]);
}

/**
 * Structural parse + cross-checks of the shipped registry snapshot.
 *
 * The cross-checks re-derive every summary figure from the rows and throw on
 * any disagreement: a snapshot whose census, placeholder list or blocking list
 * does not match its own rows is refused, never rendered.
 */
export function parseRegistrySnapshot(value: unknown): RegistrySnapshot {
  const where = REGISTRY_SNAPSHOT_ID;
  if (!isRecord(value)) {
    throw new Error(`${where}: not a JSON object`);
  }
  const schema = str(value, "schema", where);
  if (schema !== REGISTRY_SNAPSHOT_SCHEMA) {
    throw new Error(`${where}: schema '${schema}' is not '${REGISTRY_SNAPSHOT_SCHEMA}'`);
  }

  const rawVariables = value["variables"];
  const rawAssumptions = value["assumptions"];
  if (!Array.isArray(rawVariables) || !Array.isArray(rawAssumptions)) {
    throw new Error(`${where}: 'variables'/'assumptions' must be arrays`);
  }

  const variables: RegistryVariableRow[] = rawVariables.map((row, i): RegistryVariableRow => {
    if (!isRecord(row)) {
      throw new Error(`${where}: variables[${i}] is not an object`);
    }
    const at = `${where} variables[${i}]`;
    return {
      variable_id: str(row, "variable_id", at),
      name: str(row, "name", at),
      evidence_class: str(row, "evidence_class", at),
      status: str(row, "status", at),
      doi_or_dataset: str(row, "doi_or_dataset", at),
      uncertainty: str(row, "uncertainty", at),
    };
  });
  const assumptions: RegistryAssumptionRow[] = rawAssumptions.map((row, i): RegistryAssumptionRow => {
    if (!isRecord(row)) {
      throw new Error(`${where}: assumptions[${i}] is not an object`);
    }
    const at = `${where} assumptions[${i}]`;
    return {
      assumption_id: str(row, "assumption_id", at),
      statement: str(row, "statement", at),
      classification: str(row, "classification", at),
      status: str(row, "status", at),
    };
  });

  const snapshot: RegistrySnapshot = {
    schema,
    gate: str(value, "gate", where),
    gate_scope: str(value, "gate_scope", where),
    variables_path: str(value, "variables_path", where),
    variables_sha256: str(value, "variables_sha256", where),
    assumptions_path: str(value, "assumptions_path", where),
    assumptions_sha256: str(value, "assumptions_sha256", where),
    variable_count: num(value, "variable_count", where),
    assumption_count: num(value, "assumption_count", where),
    evidence_class_census: numRecord(value, "evidence_class_census", where),
    assumption_class_census: numRecord(value, "assumption_class_census", where),
    placeholder_variable_ids: strArray(value, "placeholder_variable_ids", where),
    placeholder_note: str(value, "placeholder_note", where),
    blocking_assumption_ids: strArray(value, "blocking_assumption_ids", where),
    summary_line: str(value, "summary_line", where),
    variables,
    assumptions,
  };

  // -- cross-checks: every summary figure must agree with the rows -----------
  if (snapshot.variable_count !== variables.length) {
    throw new Error(
      `${where}: variable_count ${snapshot.variable_count} != ${variables.length} variable row(s)`,
    );
  }
  if (snapshot.assumption_count !== assumptions.length) {
    throw new Error(
      `${where}: assumption_count ${snapshot.assumption_count} != ${assumptions.length} assumption row(s)`,
    );
  }
  for (const cls of EVIDENCE_CLASS_ORDER) {
    const fromRows = variables.filter((v) => v.evidence_class === cls).length;
    const embedded = snapshot.evidence_class_census[cls] ?? 0;
    if (fromRows !== embedded) {
      throw new Error(
        `${where}: evidence_class_census.${cls} is ${embedded} but ${fromRows} row(s) carry class ${cls}`,
      );
    }
  }
  const placeholderFromRows = variables.filter((v) => v.status === "placeholder").map((v) => v.variable_id);
  if (!sameMembers(placeholderFromRows, snapshot.placeholder_variable_ids)) {
    throw new Error(`${where}: placeholder_variable_ids disagrees with the variable rows`);
  }
  const blockingFromRows = assumptions.filter((a) => a.status === "blocking").map((a) => a.assumption_id);
  if (!sameMembers(blockingFromRows, snapshot.blocking_assumption_ids)) {
    throw new Error(`${where}: blocking_assumption_ids disagrees with the assumption rows`);
  }

  return snapshot;
}

/** Result of the snapshot load: the asset either exists (verified) or it does not. */
export type RegistrySnapshotLoad =
  | { readonly state: "loaded"; readonly snapshot: RegistrySnapshot }
  | { readonly state: "not-built"; readonly message: string };

/** The honest empty-state sentence (also asserted by the tests). */
export const REGISTRY_NOT_BUILT_MESSAGE: string =
  "The governance registry snapshot asset is not in this build's asset manifest. " +
  "The registry cannot be shown: the browser never reads Geography/ directly, and " +
  "no registry contents are invented. Rebuild the pipeline assets " +
  "(build-registry runs the full validation gate) to ship it.";

/**
 * Load the registry snapshot through the manifest digest discipline: absent
 * from the manifest → `"not-built"`; present → bytes fetched, SHA-256-verified
 * against the manifest entry (mismatch throws), parsed and cross-checked.
 */
export async function loadRegistrySnapshot(
  manifest: AssetManifest,
  fetchBytes: (id: string) => Promise<ArrayBuffer>,
): Promise<RegistrySnapshotLoad> {
  const entry = manifest.assets[REGISTRY_SNAPSHOT_ID];
  if (entry === undefined) {
    return { state: "not-built", message: REGISTRY_NOT_BUILT_MESSAGE };
  }
  const bytes = await fetchBytes(REGISTRY_SNAPSHOT_ID);
  assertDigestMatches(REGISTRY_SNAPSHOT_ID, entry.sha256, await sha256Hex(bytes));
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    throw new Error(
      `asset '${REGISTRY_SNAPSHOT_ID}' passed its digest check but is not valid JSON: ${(error as Error).message}`,
    );
  }
  return { state: "loaded", snapshot: parseRegistrySnapshot(parsed) };
}

// ---------------------------------------------------------------------------
// registry grouping (evidence-class census, blocking-assumption filter)
// ---------------------------------------------------------------------------

export interface EvidenceClassGroup {
  readonly evidenceClass: string;
  readonly label: string;
  readonly variables: readonly RegistryVariableRow[];
}

/**
 * Variables grouped by evidence class in the fixed M, L, C, A, F order; row
 * order preserved within each class. Empty classes are included (C=0 and F=0
 * in the shipped registry are facts worth showing, not rows to hide).
 */
export function groupVariablesByEvidenceClass(
  variables: readonly RegistryVariableRow[],
): EvidenceClassGroup[] {
  return EVIDENCE_CLASS_ORDER.map((cls) => ({
    evidenceClass: cls,
    label: EVIDENCE_CLASS_LABELS[cls] ?? cls,
    variables: variables.filter((v) => v.evidence_class === cls),
  }));
}

/** Assumptions with status `blocking`, in row order. */
export function blockingAssumptions(
  assumptions: readonly RegistryAssumptionRow[],
): RegistryAssumptionRow[] {
  return assumptions.filter((a) => a.status === "blocking");
}

// ---------------------------------------------------------------------------
// asset manifest rows (Provenance table)
// ---------------------------------------------------------------------------

export interface ManifestRow {
  readonly id: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly sourceFile: string;
}

/** Manifest entries as display rows, in sorted-id order (deterministic). */
export function manifestRows(manifest: AssetManifest): ManifestRow[] {
  const rows: ManifestRow[] = [];
  for (const id of assetIds(manifest)) {
    const entry = manifest.assets[id];
    if (entry !== undefined) {
      rows.push({ id, bytes: entry.bytes, sha256: entry.sha256, sourceFile: entry.source_file });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// graph correction census (from the topology asset's embedded census)
// ---------------------------------------------------------------------------

export interface LabelledFact {
  readonly label: string;
  readonly value: string;
}

export interface GraphCorrectionsView {
  readonly facts: readonly LabelledFact[];
  readonly reattached: readonly GraphCorrection[];
  readonly split: readonly GraphCorrection[];
  /** Largest post-correction distance from the primary node, metres (0 when none). */
  readonly maxDistFromPrimaryM: number;
}

const countFmt = (n: number): string => n.toLocaleString("en-US");

/**
 * The corruption-correction census view. Cross-checks the correction records
 * against the census the same container carries and throws on disagreement —
 * the numbers shown must be the numbers the records support.
 */
export function graphCorrectionsView(
  census: GraphCensus,
  corrections: readonly GraphCorrection[],
): GraphCorrectionsView {
  const reattached = corrections.filter((c) => c.kind === "REATTACHED");
  const split = corrections.filter((c) => c.kind === "SPLIT");
  if (reattached.length !== census.sites_reattached) {
    throw new Error(
      `graph census: sites_reattached ${census.sites_reattached} != ${reattached.length} REATTACHED record(s)`,
    );
  }
  if (split.length !== census.sites_split_synthetic) {
    throw new Error(
      `graph census: sites_split_synthetic ${census.sites_split_synthetic} != ${split.length} SPLIT record(s)`,
    );
  }
  let maxDist = 0;
  for (const c of corrections) {
    if (c.dist_from_primary_m > maxDist) {
      maxDist = c.dist_from_primary_m;
    }
  }
  const facts: LabelledFact[] = [
    { label: "Street features (source shapefile)", value: countFmt(census.features) },
    { label: "Final graph nodes", value: countFmt(census.final_graph_nodes) },
    { label: "Undirected street edges", value: countFmt(census.undirected_street_edges) },
    { label: "Directed edge records", value: countFmt(census.directed_edge_records) },
    { label: "Connected components", value: countFmt(census.components) },
    { label: "Largest component (nodes)", value: countFmt(census.largest_component_nodes) },
    { label: "Corrupt-ID sites reattached", value: countFmt(census.sites_reattached) },
    { label: "Corrupt-ID sites split (synthetic nodes)", value: countFmt(census.sites_split_synthetic) },
    { label: "Synthetic (negative) node ids", value: countFmt(census.node_ids_negative) },
    { label: "Impossible edges after correction", value: countFmt(census.impossible_edges_after_fix) },
    { label: "Max distance from primary node after correction (m)", value: maxDist.toFixed(1) },
  ];
  return { facts, reattached, split, maxDistFromPrimaryM: maxDist };
}

// ---------------------------------------------------------------------------
// archive browser: grouping, lineage, replay-preset match
// ---------------------------------------------------------------------------

export interface ArchiveFamilyGroup {
  readonly family: string;
  readonly bundles: readonly ArchiveBundleEntry[];
}

/**
 * Bundles grouped by `preset_family`, families in first-appearance order and
 * bundles in index order (both deterministic functions of the shipped index).
 */
export function groupBundlesByFamily(
  bundles: readonly ArchiveBundleEntry[],
): ArchiveFamilyGroup[] {
  const groups: { family: string; bundles: ArchiveBundleEntry[] }[] = [];
  for (const bundle of bundles) {
    const hit = groups.find((g) => g.family === bundle.preset_family);
    if (hit === undefined) {
      groups.push({ family: bundle.preset_family, bundles: [bundle] });
    } else {
      hit.bundles.push(bundle);
    }
  }
  return groups;
}

/**
 * The shipped preset that reproduces this exact archived run directory, or
 * `null`. Matches `archivedManifests` by exact string, so a preset is only
 * offered as a replay of the precise configuration it diffs clean against
 * (the arm-A preset replays `A-seed42`, never the seed-43 sibling).
 */
export function replayPresetFor(runDir: string): PresetDefinition | null {
  return PRESET_DEFINITIONS.find((d) => d.archivedManifests.includes(runDir)) ?? null;
}

/** Commit lineage + identity block of one bundle JSON; missing fields are null. */
export interface BundleLineage {
  readonly manifestSchema: string | null;
  readonly simId: string | null;
  readonly gitCommit: string | null;
  readonly dataVersionTag: string | null;
  readonly generatedUtc: string | null;
  readonly generatedUtcNote: string | null;
  readonly javaVersion: string | null;
  readonly repastVersion: string | null;
  readonly workingTreeDirty: boolean | null;
  readonly scenario: string | null;
  readonly runDir: string | null;
}

function stringOrNull(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

/**
 * Extract the certified run's lineage from a bundle JSON. Absent or malformed
 * fields come back `null` and render as "unavailable" — never as a made-up
 * value.
 */
export function bundleLineage(bundle: unknown): BundleLineage {
  const empty: BundleLineage = {
    manifestSchema: null,
    simId: null,
    gitCommit: null,
    dataVersionTag: null,
    generatedUtc: null,
    generatedUtcNote: null,
    javaVersion: null,
    repastVersion: null,
    workingTreeDirty: null,
    scenario: null,
    runDir: null,
  };
  if (!isRecord(bundle)) {
    return empty;
  }
  const provenance = isRecord(bundle["provenance"]) ? (bundle["provenance"] as Record<string, unknown>) : {};
  const archive = isRecord(bundle["archive"]) ? (bundle["archive"] as Record<string, unknown>) : {};
  const dirty = provenance["git_working_tree_dirty"];
  return {
    manifestSchema: stringOrNull(provenance, "manifest_schema"),
    simId: stringOrNull(provenance, "sim_id"),
    gitCommit: stringOrNull(provenance, "git_commit"),
    dataVersionTag: stringOrNull(provenance, "data_version_tag"),
    generatedUtc: stringOrNull(provenance, "generated_utc"),
    generatedUtcNote: stringOrNull(provenance, "generated_utc_note"),
    javaVersion: stringOrNull(provenance, "java_version"),
    repastVersion: stringOrNull(provenance, "repast_version"),
    workingTreeDirty: typeof dirty === "boolean" ? dirty : null,
    scenario: typeof bundle["scenario"] === "string" ? (bundle["scenario"] as string) : null,
    runDir: stringOrNull(archive, "run_dir"),
  };
}

/** One in-archive gate record from a bundle's `gates` block. */
export interface GateRow {
  readonly id: string;
  readonly ok: boolean;
  readonly detail: string;
}

/**
 * The bundle's gate records, or `null` when the block is missing/malformed
 * ("gate records unavailable" — never a fabricated green list).
 */
export function gateRows(bundle: unknown): GateRow[] | null {
  if (!isRecord(bundle) || !Array.isArray(bundle["gates"])) {
    return null;
  }
  const rows: GateRow[] = [];
  for (const g of bundle["gates"]) {
    if (!isRecord(g) || typeof g["id"] !== "string" || typeof g["ok"] !== "boolean" || typeof g["detail"] !== "string") {
      return null;
    }
    rows.push({ id: g["id"], ok: g["ok"], detail: g["detail"] });
  }
  return rows;
}

/**
 * The red line for a bundle whose recorded gates failed, or `null` when none
 * did. Non-empty `gates_failed` MUST be rendered (red) with the gate names —
 * a failed gate is a fact about the archived run, not a detail to hide.
 */
export function bundleGatesFailedLine(entry: Pick<ArchiveBundleEntry, "gates_failed">): string | null {
  if (entry.gates_failed.length === 0) {
    return null;
  }
  return `Gates failed: ${entry.gates_failed.join(", ")}`;
}

/** Display-only byte-size formatting (exact bytes below 1 KiB, else 1 decimal). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
