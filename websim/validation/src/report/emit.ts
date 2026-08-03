/**
 * emit.ts — building `VALIDATION_REPORT.json` from a replay run.
 *
 * The emitter is deliberately dumb: it *transcribes* results, it does not
 * decide them. Every verdict in the document is computed from a census or a
 * check list produced elsewhere, and {@link buildValidationReport} rolls the
 * tiers up with `red > degraded > green` rather than accepting a status a
 * caller hands it. A tier that could not be run comes out `degraded`, never
 * green — the same skip-vs-fail discipline `tools/artifact-gate.ts` applies to
 * the suite, applied to the artifact the badge reads.
 *
 * ## What `config_sha256` is for
 *
 * Plan §5.4 earns ARCHIVE-VALIDATED per *configuration*: the executed manifest
 * (params + asset SHAs) has to match an archived bundle config **and** that
 * config's replay has to have passed in the shipped report. The UI cannot do
 * that lookup against a run *directory* — a user arrives with 41 parameter
 * values, not a path. So each Tier-3 entry carries the SHA-256 of its executed
 * parameters, canonicalised as `name=value` lines in `PARAM_NAMES` order with
 * `JSON.stringify`'d numbers. Same 41 numbers → same digest → the badge
 * resolves without the archive being present.
 *
 * ## Asset SHAs come from the build, not from a re-read
 *
 * `pipeline/out/assets/assets-manifest.json` already records a SHA-256 per
 * built asset, produced by the build step that wrote them. The report copies
 * those entries and adds the digest of the manifest file itself, so a reader
 * can tell whether two reports describe the same assets by comparing one hash.
 * Re-hashing the files here would produce a number that agrees with the
 * manifest right up until it silently does not.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PARAM_NAMES, type RunConfig } from "@websim/shared";
import { sha256Hex } from "@websim/pipeline/archive";

import type { CheckResult } from "../harness/checks.js";
import type { Tier4Attribution } from "../harness/tier4-census.js";
import type { ReplayedRun } from "../harness/working-set-replay.js";

import {
  rollUp,
  tier4Caution,
  VALIDATION_REPORT_SCHEMA,
  type AssetRecord,
  type CheckCensus,
  type TierStatus,
  type Tier3ConfigResult,
  type Tier4ConfigResult,
  type ValidationReport,
} from "./schema.js";

// The Tier-4 caution the report has to carry is no longer a constant here. It
// was one, and the constant was FALSE: it said "no shelter saturates" of runs
// whose own `capacity_binds` / `saturated_sites` / `capacity_refusals` fields,
// printed two lines above it in the same JSON object, said the opposite. It is
// now computed from those fields by `tier4Caution()` in schema.ts, which is also
// where the reasoning and the correction are written down; `buildValidationReport`
// calls it, and `validateValidationReport` re-derives it and rejects any document
// where the prose and the numbers disagree.

/**
 * SHA-256 of a run's executed parameters — the badge's lookup key.
 *
 * Canonical form: one `name=JSON.stringify(value)` line per name in
 * `PARAM_NAMES` order, LF-terminated including a trailing newline. Written out
 * rather than `JSON.stringify(config)` because object key order is an
 * implementation detail and this digest is a contract.
 */
export function configSha256(config: RunConfig): string {
  const asRecord = config as unknown as Record<string, number>;
  const text = PARAM_NAMES.map((n) => `${n}=${JSON.stringify(asRecord[n])}`).join("\n");
  return sha256Hex(`${text}\n`);
}

function censusOf(results: readonly CheckResult[]): CheckCensus {
  return {
    passed: results.filter((c) => c.status === "PASS").length,
    failed: results.filter((c) => c.status === "FAIL").length,
    skipped: results.filter((c) => c.status === "SKIP").length,
    total: results.length,
  };
}

export interface Tier3Input {
  readonly run: ReplayedRun;
  readonly results: readonly CheckResult[];
}

/**
 * The one check whose FAIL is a fact about the runner rather than the model,
 * matched on the suffix `check_manifest` gives it.
 *
 * Gate (h)'s provenance sub-check tests `git_working_tree_dirty is False` by
 * identity. `validation/src/provenance.ts` measures that with
 * `git status --porcelain` over the TypeScript sources and reports what it
 * finds — so on an uncommitted tree the check is RED and the gate is *working*:
 * nobody could reproduce those bytes from the recorded commit.
 *
 * It is classified, not excused: {@link buildValidationReport} only moves it out
 * of `failures` when the same document's `build.git_working_tree_dirty` is
 * `true`, and the schema validator re-checks that. On a clean tree the failure
 * counts and the configuration is red.
 */
export const ENVIRONMENT_CHECK_SUFFIX = "git_working_tree_dirty is false";

/**
 * Case-insensitive because the two certified scripts spell the same check
 * differently — `verify_E_runs.py`'s gate (h) prints `... is false`, and
 * `verify_2026_runs.py` prints `... is False`. Matching only one spelling would
 * classify nine of the cross-arm checks and none of the per-run ones, or the
 * reverse, which is the kind of half-applied rule that reads as deliberate.
 */
export function isProvenanceCheck(name: string): boolean {
  return name.toLowerCase().endsWith(ENVIRONMENT_CHECK_SUFFIX);
}

export interface ReportInputs {
  readonly generatedUtc: string;
  readonly producedBy: string;
  readonly build: {
    readonly portCommit: string;
    readonly gitWorkingTreeDirty: boolean | "unknown";
    readonly node: string;
  };
  readonly archive: { readonly present: boolean; readonly source: "env" | "default" };
  readonly assetsManifestPath: string;
  readonly goldenSummariesDir: string;
  readonly workingSetManifestPath: string;
  readonly workingSetPayloadDir: string;
  readonly tier2: { readonly status: TierStatus; readonly note: string };
  readonly tier3: readonly Tier3Input[];
  /**
   * `verify_2026_runs.py` over the replayed three-arm family. Absent means it
   * could not be run (no pre-E targets in the set), which makes Tier 3
   * `degraded` rather than green — a cross-arm identity nobody checked is not a
   * cross-arm identity that held.
   */
  readonly crossArm?: { readonly members: readonly string[]; readonly results: readonly CheckResult[] };
  readonly tier4: readonly Tier4Attribution[];
}

function readAssetsManifest(file: string): {
  manifest_sha256: string;
  build_commit: string;
  count: number;
  entries: AssetRecord[];
} {
  if (!existsSync(file)) {
    return { manifest_sha256: "unavailable", build_commit: "unavailable", count: 0, entries: [] };
  }
  const bytes = readFileSync(file);
  const parsed = JSON.parse(bytes.toString("utf8")) as {
    build_commit?: string;
    assets?: Record<string, { sha256?: string; bytes?: number }>;
  };
  const entries: AssetRecord[] = Object.entries(parsed.assets ?? {})
    .map(([p, v]) => ({ path: p, sha256: String(v.sha256 ?? ""), bytes: Number(v.bytes ?? 0) }))
    .filter((e) => /^[0-9a-f]{64}$/u.test(e.sha256))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  return {
    manifest_sha256: sha256Hex(new Uint8Array(bytes)),
    build_commit: String(parsed.build_commit ?? "unavailable"),
    count: entries.length,
    entries,
  };
}

function readGoldenSummaries(dir: string): AssetRecord[] {
  const names = [
    "index.json",
    "sources.json",
    "sheltered-envelopes.json",
    "demographic-marginals.json",
    "exposure-identities.json",
    "capacity-sums.json",
    "cross-arm-hashes.json",
  ];
  const out: AssetRecord[] = [];
  for (const n of names) {
    const file = path.join(dir, n);
    if (!existsSync(file)) continue;
    const bytes = readFileSync(file);
    out.push({ path: `golden-summaries/${n}`, sha256: sha256Hex(new Uint8Array(bytes)), bytes: bytes.length });
  }
  return out;
}

function readWorkingSet(manifestPath: string, payloadDir: string): ValidationReport["working_set"] {
  if (!existsSync(manifestPath)) {
    return { manifest_sha256: "unavailable", runs: 0, bytes: 0, payload_present: false };
  }
  const raw = readFileSync(manifestPath);
  const parsed = JSON.parse(raw.toString("utf8")) as {
    budget?: { run_count?: number; actual_bytes?: number };
  };
  return {
    manifest_sha256: sha256Hex(new Uint8Array(raw)),
    runs: Number(parsed.budget?.run_count ?? 0),
    bytes: Number(parsed.budget?.actual_bytes ?? 0),
    payload_present: existsSync(payloadDir),
  };
}

function tier3Entry(input: Tier3Input, treeDirty: boolean | "unknown"): Tier3ConfigResult {
  const { run, results } = input;
  const all = results
    .filter((c) => c.status === "FAIL")
    .map((c) => ({ name: c.name, detail: c.detail }));
  const isEnvironment = (name: string): boolean => treeDirty === true && isProvenanceCheck(name);
  return {
    run_dir: run.target.runDir,
    run_class: run.target.cls,
    in_working_set: run.target.inWorkingSet,
    config_sha256: configSha256(run.built.config),
    params_from_manifest: run.built.fromManifest.length,
    params_from_java_code_default: Object.keys(run.built.fromFallback).length,
    checks: censusOf(results),
    failures: all.filter((f) => !isEnvironment(f.name)),
    environment_failures: all
      .filter((f) => isEnvironment(f.name))
      .map((f) => ({
        name: f.name,
        detail:
          `${f.detail}  [ENVIRONMENT: the port's own sources are uncommitted, so provenance.ts ` +
          "reports true and gate (h) is correct to be red; this is a fact about the runner]",
      })),
    status: all.filter((f) => !isEnvironment(f.name)).length === 0 ? "green" : "red",
  };
}

function tier4Entry(a: Tier4Attribution): Tier4ConfigResult {
  const flips =
    a.order === null ? 0 : a.order.shelteredLost + a.order.shelteredGained + a.order.nonShelterFlips;
  return {
    run_dir: a.runDir,
    verdict: a.verdict,
    agents_cells_compared: a.agents.comparedCells,
    agents_cells_identical: a.agents.identicalCells,
    agents_rows: a.agents.rows,
    agents_rows_identical: a.agents.rowsIdentical,
    shelters_cells_compared: a.shelters.comparedCells,
    shelters_cells_identical: a.shelters.identicalCells,
    capacity_binds: a.saturation.capacityBinds,
    saturated_sites: a.saturation.saturatedSites,
    sites: a.saturation.sites,
    capacity_refusals: a.saturation.capacityRefusals,
    refused_all_full: a.saturation.refusedAllFull,
    rows_never_refused_divergent: a.partition.neverRefusedDivergent,
    rows_never_refused: a.partition.neverRefused,
    rows_door_contested: a.partition.doorContested,
    rows_same_assignment_divergent: a.partition.sameAssignmentDivergent,
    build_time_columns_divergent: a.partition.buildTimeColumnsDivergent,
    final_state_flips: flips,
    final_state_transitions: a.order?.transitions ?? {},
    envelope_applicable: a.envelope.applicable,
    envelope_note: a.envelope.applicable
      ? `${a.envelope.reason}; observed ${String(a.envelope.observed)} in ` +
        `[${String(a.envelope.min)}, ${String(a.envelope.max)}] — ${a.envelope.inside === true ? "inside" : "OUTSIDE"}`
      : a.envelope.reason,
    unexplained: a.unexplained,
  };
}

const NOTE =
  "Emitted by the WP9 replay harness. Every configuration is driven from its ARCHIVED EXECUTED " +
  "manifest (reproducibility.parameters), never from a shipped preset; parameters the manifest " +
  "does not carry are filled from ContextCreator's own documented fallbacks and counted in " +
  "params_from_java_code_default. Tier-3 verdicts are the ported verify_E_runs / " +
  "verify_2026_runs / analyze_run gates over the PORT's written CSV text, plus the committed " +
  "golden-summary digests of the Java archive. Tier-4 is a raw-text cell census with every " +
  "divergence attributed; an UNEXPLAINED verdict is release-blocking.";

/** Assemble the report. The tier roll-up is computed here, never supplied. */
export function buildValidationReport(i: ReportInputs): ValidationReport {
  const tier3Configs = i.tier3.map((t) => tier3Entry(t, i.build.gitWorkingTreeDirty));
  const crossArmResults = i.crossArm?.results ?? [];
  const crossArmModelFailures = crossArmResults.filter(
    (c) => c.status === "FAIL" && !(i.build.gitWorkingTreeDirty === true && isProvenanceCheck(c.name)),
  );
  const crossArm = {
    status: (i.crossArm === undefined
      ? "degraded"
      : crossArmModelFailures.length > 0
        ? "red"
        : "green") as TierStatus,
    members: i.crossArm?.members ?? [],
    checks: censusOf(crossArmResults),
    failures: crossArmModelFailures.map((c) => ({ name: c.name, detail: c.detail })),
    environment_failures: crossArmResults
      .filter((c) => c.status === "FAIL" && !crossArmModelFailures.includes(c))
      .map((c) => ({
        name: c.name,
        detail: `${c.detail}  [ENVIRONMENT: the port's own sources are uncommitted]`,
      })),
  };
  const tier3Checks = [...tier3Configs.map((c) => c.checks), crossArm.checks].reduce<CheckCensus>(
    (acc, c) => ({
      passed: acc.passed + c.passed,
      failed: acc.failed + c.failed,
      skipped: acc.skipped + c.skipped,
      total: acc.total + c.total,
    }),
    { passed: 0, failed: 0, skipped: 0, total: 0 },
  );
  const tier3Status: TierStatus =
    tier3Configs.length === 0
      ? "degraded"
      : tier3Configs.some((c) => c.status === "red") || crossArm.status === "red"
        ? "red"
        : crossArm.status === "degraded"
          ? "degraded"
          : "green";

  const tier4Configs = i.tier4.map(tier4Entry);
  const unexplained = tier4Configs.filter((c) => c.verdict === "UNEXPLAINED").length;
  const tier4Status: TierStatus =
    tier4Configs.length === 0 ? "degraded" : unexplained > 0 ? "red" : "green";

  const overall = rollUp([i.tier2.status, tier3Status, tier4Status]);

  // ARCHIVE-VALIDATED is earned per configuration, so a single red config
  // costs that config its badge and not the others theirs — but a red or
  // degraded TIER-4 census removes the badge from everything, because the
  // Tier-4 claim is about the build rather than about one run.
  //
  // So does a dirty working tree, and that is the conservative reading on
  // purpose. Plan §5.4 grants the badge to a *build* whose replay passed; a
  // build assembled from uncommitted sources cannot be reproduced from the
  // commit this document records, so nobody can re-derive the numbers the badge
  // is vouching for. The per-configuration Tier-3 verdicts stay green — the
  // model results are real — and the badge list is empty, which is the honest
  // combination. This is why `git_working_tree_dirty` is in the document at all.
  const tier4ByRun = new Map(tier4Configs.map((c) => [c.run_dir, c]));
  const archiveValidated =
    tier4Status === "green" &&
    i.tier2.status === "green" &&
    crossArm.status === "green" &&
    i.build.gitWorkingTreeDirty === false
      ? tier3Configs
          .filter((c) => c.status === "green" && tier4ByRun.get(c.run_dir)?.verdict !== "UNEXPLAINED")
          .map((c) => c.run_dir)
      : [];

  return {
    schema: VALIDATION_REPORT_SCHEMA,
    generated_utc: i.generatedUtc,
    produced_by: i.producedBy,
    note: NOTE,
    build: {
      port_commit: i.build.portCommit,
      git_working_tree_dirty: i.build.gitWorkingTreeDirty,
      node: i.build.node,
    },
    archive: {
      present: i.archive.present,
      source: i.archive.source,
      configs_replayed: tier3Configs.length,
    },
    assets: readAssetsManifest(i.assetsManifestPath),
    golden_summaries: readGoldenSummaries(i.goldenSummariesDir),
    working_set: readWorkingSet(i.workingSetManifestPath, i.workingSetPayloadDir),
    tiers: {
      tier2_r3: { status: i.tier2.status, note: i.tier2.note },
      tier3: { status: tier3Status, checks: tier3Checks, configs: tier3Configs, cross_arm: crossArm },
      tier4: {
        status: tier4Status,
        exact: tier4Configs.filter((c) => c.verdict === "EXACT").length,
        order_channel: tier4Configs.filter((c) => c.verdict === "ORDER-CHANNEL").length,
        unexplained,
        // Derived from tier4Configs, not written beside them — see schema.ts.
        caution: tier4Caution(tier4Configs),
        configs: tier4Configs,
      },
    },
    overall,
    archive_validated: archiveValidated,
  };
}

/** Serialise stably (2-space, trailing newline) and write. Creates the directory. */
export function writeValidationReport(file: string, report: ValidationReport): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
