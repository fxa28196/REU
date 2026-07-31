/**
 * build-registry.ts — WP4(c). Run the FULL `ScienceRegistry.load()` governance
 * validation over `Geography/data/registry/*.csv` and emit the validated
 * snapshot (plan Q10, §4 asset table; PORT_MAP §4.1).
 *
 *   npx tsx pipeline/scripts/build-registry.ts
 *   npx tsx pipeline/scripts/build-registry.ts --check
 *   npx tsx pipeline/scripts/build-registry.ts --registry-dir <dir> --dry-run
 *
 * Q10 relocated the model's startup fail-fast to build time because that is
 * STRICTLY STRONGER: a registry defect stops the asset from existing at all,
 * rather than stopping a page that already shipped. So a validation failure here
 * exits non-zero and writes nothing — no partial snapshot, no "degraded"
 * marker, no warning path. `--registry-dir` exists so the gate can be proved
 * against a deliberately corrupted COPY in a temp directory; the real registry
 * under `Geography/` is opened read-only and never written.
 *
 * What the gate does not do: check that a DOI resolves. It checks the field is
 * non-empty and not the literal `none`. Saying more is the `gate-resolvable-doi`
 * claim `tools/claims.ts` bans.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  checkMode,
  failBuild,
  geographyPath,
  readUtf8,
  sha256File,
  toJsonBytes,
  writeAsset,
} from "../src/asset-io.js";
import {
  censusOf,
  validateAssumptions,
  validateVariables,
  type RegistryAssumption,
  type RegistryCensus,
  type RegistryVariable,
} from "../src/registry.js";

export const REGISTRY_SNAPSHOT_SCHEMA = "reu-wildfire-shelter-abm/registry-snapshot/v1" as const;

/** Repo-relative registry directory. Registry files are governance metadata: PORT_MAP §4.1 notes they are deliberately NOT part of `data_version_tag`. */
export const REGISTRY_DIR = "Geography/data/registry";
export const VARIABLES_FILE = "variables.csv";
export const ASSUMPTIONS_FILE = "assumptions.csv";

export interface RegistryValidation {
  readonly variables: readonly RegistryVariable[];
  readonly assumptions: readonly RegistryAssumption[];
  readonly census: RegistryCensus;
}

/**
 * Validate both registries from already-decoded text. Throws
 * `RegistryValidationError` on the first violation, with the Java message.
 */
export function validateRegistry(
  variablesText: string,
  assumptionsText: string,
  variablesLabel: string,
  assumptionsLabel: string,
): RegistryValidation {
  const variables = validateVariables(variablesText, variablesLabel);
  const assumptions = validateAssumptions(assumptionsText, assumptionsLabel);
  return { variables, assumptions, census: censusOf(variables, assumptions) };
}

export interface RegistrySnapshotBuild {
  readonly relativePath: string;
  readonly bytes: Buffer;
  readonly census: RegistryCensus;
}

/**
 * Validate the registry at `dir` (absolute) and build the snapshot bytes.
 * Deterministic: rows in file order, no clock, no host paths — `variables_path`
 * is recorded repo-relative so two machines produce identical bytes.
 */
export function buildRegistrySnapshot(dir: string, repoRelativeDir: string): RegistrySnapshotBuild {
  const variablesPath = join(dir, VARIABLES_FILE);
  const assumptionsPath = join(dir, ASSUMPTIONS_FILE);
  for (const p of [variablesPath, assumptionsPath]) {
    if (!existsSync(p)) {
      throw new Error(`registry file missing: ${p}`);
    }
  }
  const variablesLabel = `${repoRelativeDir}/${VARIABLES_FILE}`;
  const assumptionsLabel = `${repoRelativeDir}/${ASSUMPTIONS_FILE}`;
  const { variables, assumptions, census } = validateRegistry(
    readUtf8(variablesPath),
    readUtf8(assumptionsPath),
    variablesLabel,
    assumptionsLabel,
  );

  const snapshot = {
    schema: REGISTRY_SNAPSHOT_SCHEMA,
    gate:
      "full ScienceRegistry readStrict-equivalent validation ran at build time and PASSED; " +
      "a violation fails the asset build, so an invalid registry cannot ship (plan Q10)",
    gate_scope:
      "vocabularies, unique non-empty ids, affects_* yes/no with at least one yes unless " +
      "deprecated, L/M require a non-'none' doi_or_dataset, L/C require a non-'none' " +
      "uncertainty, assumption-class rows require a sensitivity_plan. DOI resolvability is " +
      "NOT checked.",
    variables_path: variablesLabel,
    variables_sha256: sha256File(variablesPath),
    assumptions_path: assumptionsLabel,
    assumptions_sha256: sha256File(assumptionsPath),
    variable_count: census.variableCount,
    assumption_count: census.assumptionCount,
    evidence_class_census: census.evidenceClassCensus,
    assumption_class_census: census.assumptionClassCensus,
    placeholder_variable_ids: census.placeholderVariableIds,
    placeholder_note:
      "placeholder variables are present but inert and must never be quoted as results",
    blocking_assumption_ids: census.blockingAssumptionIds,
    summary_line: census.summaryLine,
    variables: variables.map((v) => ({
      variable_id: v.id,
      name: v.name,
      evidence_class: v.evidenceClass,
      status: v.status,
      doi_or_dataset: v.doiOrDataset,
      uncertainty: v.uncertainty,
    })),
    assumptions: assumptions.map((a) => ({
      assumption_id: a.id,
      statement: a.statement,
      classification: a.classification,
      status: a.status,
    })),
  };

  return { relativePath: "assets/registry-snapshot.json", bytes: toJsonBytes(snapshot), census };
}

/** Build against the real, read-only registry. */
export function buildRealRegistrySnapshot(): RegistrySnapshotBuild {
  return buildRegistrySnapshot(geographyPath(REGISTRY_DIR), REGISTRY_DIR);
}

/** Asset-manifest rows for this builder, used by `checksums.ts`. */
export function registryManifestInputs(): { readonly id: string; readonly sourceFile: string }[] {
  return [
    { id: "assets/registry-snapshot.json", sourceFile: `${REGISTRY_DIR}/${VARIABLES_FILE}` },
  ];
}

function argValue(argv: readonly string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

function main(): void {
  const argv = process.argv.slice(2);
  const check = checkMode(argv);
  const dryRun = argv.includes("--dry-run");
  const overrideDir = argValue(argv, "--registry-dir");
  const dir = overrideDir ?? geographyPath(REGISTRY_DIR);
  const label = overrideDir ?? REGISTRY_DIR;

  let build: RegistrySnapshotBuild;
  try {
    build = buildRegistrySnapshot(dir, label);
  } catch (e) {
    // The gate. Non-zero exit, nothing written.
    return failBuild(
      `build-registry: GOVERNANCE VALIDATION FAILED — ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  process.stdout.write(`${build.census.summaryLine}\n`);
  if (dryRun) {
    process.stderr.write("build-registry: validation passed (--dry-run, nothing written).\n");
    return;
  }
  if (overrideDir !== undefined) {
    return failBuild(
      "build-registry: --registry-dir is a validation-only mode; pass --dry-run. " +
        "Refusing to write a snapshot built from a registry outside Geography/.",
    );
  }
  const r = writeAsset(build.relativePath, build.bytes, check);
  process.stdout.write(
    `${check ? (r.unchanged ? "ok      " : "DRIFT   ") : "wrote   "} ${r.id}  ${r.bytes} bytes\n`,
  );
  if (check && !r.unchanged) {
    failBuild("build-registry: snapshot differs from a fresh build — rerun without --check.");
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
