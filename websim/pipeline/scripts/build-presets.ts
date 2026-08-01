/**
 * build-presets.ts — materialise the shipped presets, twice.
 *
 * 1. `shared/src/presets/*.json` — the CONTRACT artifact. `presets/index.ts`
 *    imports these, so they are what the app runs and what every test pins.
 * 2. `pipeline/out/assets/presets/*.json` + `presets/index.json` — the SHIPPED
 *    asset (plan §4 asset table, row `presets/*.json`: "fully-explicit
 *    RunConfig, 41/41 params, zero fallbacks; CI-diffed against archived
 *    manifests"). `checksums.ts` already reserves `assets/presets/` for this
 *    builder, so the bytes enter `assets-manifest.json` and the browser's
 *    load-time digest gate covers them like every other asset.
 *
 * The two copies are byte-identical per preset by construction — the same
 * `serialisePreset` output is written to both paths — and `--check` verifies
 * both, so they cannot drift apart.
 *
 * The definitions live in `shared` because they are contract data the browser
 * needs; the writer lives here because `shared` must stay filesystem-free.
 *
 *   npx tsx pipeline/scripts/build-presets.ts          # write
 *   npx tsx pipeline/scripts/build-presets.ts --check  # verify, exit 1 on drift
 *
 * `--check` is the CI form. `shared/test/presets.test.ts` also pins the contract
 * JSON to the definitions, and `shared/test/preset-archive-parity.test.ts` pins
 * every archived preset to the archived `simulation.json` it claims to
 * reproduce, so drift fails the test suite even if this script is never run.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Imported through subpaths rather than the package barrel on purpose: the
// barrel re-exports `presets/index.ts`, which imports the very JSON files this
// script writes, so the barrel would be unloadable on a clean checkout.
import { parseRunConfig } from "@websim/shared/config";
import {
  materialisePreset,
  presetFileName,
  PRESET_DEFINITIONS,
  serialisePreset,
} from "@websim/shared/presets/definitions";

import { parseRequireArtifacts, REQUIRE_ARTIFACTS_ENV } from "../../tools/artifact-policy.js";
import { OUT_DIR, toJsonBytes, writeAsset, type WriteResult } from "../src/asset-io.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PRESET_DIR = join(HERE, "..", "..", "shared", "src", "presets");

/** Asset id prefix under `pipeline/out`; matched by checksums.ts. */
const ASSET_PREFIX = "assets/presets";

/**
 * Catalogue of the shipped preset assets.
 *
 * The app can import `@websim/shared` and get the definitions directly; this
 * file exists for the *asset* consumer — a build that fetches presets over the
 * wire and must still be able to render the picker, the provenance line and,
 * critically, the quirk notes. Dropping `quirkNotes` here would make it possible
 * to ship an SE preset without the honesty note attached, which is exactly the
 * failure the note exists to prevent.
 */
interface PresetCatalogueEntry {
  readonly id: string;
  readonly file: string;
  readonly label: string;
  readonly archive_family: string | null;
  readonly archived_manifests: readonly string[];
  readonly archive_exceptions: readonly {
    readonly param: string;
    readonly preset_value: number;
    readonly archived_executed_value: number;
    readonly quirk_note: string;
  }[];
  readonly quirk_notes: readonly string[];
  readonly source_batch_file: string | null;
  readonly notes: string;
}

const check = process.argv.slice(2).includes("--check");

/**
 * Whether an ABSENT shipped-asset copy counts as a defect. See
 * {@link accountForAsset}; the parse is the project-wide one so a typo in the
 * variable throws instead of silently reading as "off".
 */
const requireArtifacts = parseRequireArtifacts();

/**
 * Account for one shipped-asset copy under `--check`, and report the drift it
 * contributes.
 *
 * ABSENT and STALE are different states and only one of them is a defect of this
 * builder. `pipeline/out/` is git-ignored in full, so on a fresh clone the asset
 * copies simply have not been built yet; `writeAsset` reports that case with the
 * same `unchanged: false` it uses for a copy whose bytes really did drift.
 * Counting the absent case as drift made `--check` — and with it `npm run ci` —
 * fail on every clean checkout, which is the one environment CI has to be green
 * in. Present-but-different is still drift, so a genuinely stale copy is still
 * caught.
 *
 * Under `WEBSIM_REQUIRE_ARTIFACTS` the absent case is a defect too. That is the
 * mode a runner which HAS built the assets uses, so "the builder quietly stopped
 * writing its asset copy" still turns red rather than turning quiet — the same
 * skip-vs-fail posture `tools/artifact-policy.ts` applies to gated suites.
 */
function accountForAsset(asset: WriteResult): number {
  if (asset.unchanged) {
    return 0;
  }
  if (existsSync(asset.absolutePath)) {
    process.stdout.write(`DRIFT    ${asset.id}\n`);
    return 1;
  }
  if (requireArtifacts) {
    process.stdout.write(`MISSING  ${asset.id} (${REQUIRE_ARTIFACTS_ENV} is on)\n`);
    return 1;
  }
  process.stdout.write(`notbuilt ${asset.id}\n`);
  return 0;
}

mkdirSync(PRESET_DIR, { recursive: true });

let drift = 0;
/** Shipped-asset copies that are simply not built here (clean-clone state). */
let notBuilt = 0;
const catalogue: PresetCatalogueEntry[] = [];

for (const definition of PRESET_DEFINITIONS) {
  // Validate before writing: a preset that does not satisfy the schema must
  // never reach disk, where it would look authoritative.
  const config = parseRunConfig(materialisePreset(definition), `preset ${definition.id}`);
  const text = serialisePreset(config);
  const fileName = presetFileName(definition.id);
  const path = join(PRESET_DIR, fileName);

  catalogue.push({
    id: definition.id,
    file: fileName,
    label: definition.label,
    archive_family: definition.archiveFamily,
    archived_manifests: definition.archivedManifests,
    archive_exceptions: definition.archiveExceptions.map((e) => ({
      param: e.param,
      preset_value: e.presetValue,
      archived_executed_value: e.archivedExecutedValue,
      quirk_note: e.quirkNote,
    })),
    quirk_notes: definition.quirkNotes,
    source_batch_file: definition.sourceBatchFile,
    notes: definition.notes,
  });

  if (check) {
    let onDisk = "";
    try {
      onDisk = readFileSync(path, "utf8");
    } catch {
      process.stdout.write(`MISSING  ${definition.id}\n`);
      drift += 1;
      continue;
    }
    // Normalise line endings: git may check the file out with CRLF on Windows.
    if (onDisk.replace(/\r\n/gu, "\n") !== text) {
      process.stdout.write(`DRIFT    ${definition.id}\n`);
      drift += 1;
    } else {
      process.stdout.write(`ok       ${definition.id}\n`);
    }
  } else {
    writeFileSync(path, text, "utf8");
    process.stdout.write(`wrote    ${definition.id}\n`);
  }

  // The shipped asset copy. `writeAsset` refuses to write outside
  // `pipeline/out` (asset-io.ts#assertInsideOut) and is a no-op in check mode.
  const asset = writeAsset(`${ASSET_PREFIX}/${fileName}`, Buffer.from(text, "utf8"), check);
  if (check) {
    const contributed = accountForAsset(asset);
    drift += contributed;
    if (contributed === 0 && !asset.unchanged) {
      notBuilt += 1;
    }
  }
}

const catalogueBytes = toJsonBytes({
  schema: "reu-wildfire-shelter-abm/presets/v1",
  count: catalogue.length,
  presets: catalogue,
});
const catalogueAsset = writeAsset(`${ASSET_PREFIX}/index.json`, catalogueBytes, check);
if (check) {
  const contributed = accountForAsset(catalogueAsset);
  drift += contributed;
  if (contributed === 0 && !catalogueAsset.unchanged) {
    notBuilt += 1;
  }
}

if (check && drift > 0) {
  process.stderr.write(
    `build-presets: ${drift} preset file(s) differ from the definitions — ` +
      "run `npx tsx pipeline/scripts/build-presets.ts` and commit the result.\n",
  );
  process.exitCode = 1;
} else {
  const outLabel = `${OUT_DIR.split(/[\\/]/u).slice(-2).join("/")}/${ASSET_PREFIX}`;
  // Say what was actually verified. Claiming the asset copies were "checked"
  // when they were absent would be the exact kind of unearned green this
  // builder's --check exists to prevent.
  const where =
    check && notBuilt > 0
      ? `to shared/src/presets (${outLabel} not built here — ${notBuilt} asset file(s) absent)`
      : `to shared/src/presets and ${outLabel}`;
  process.stderr.write(
    `build-presets: ${PRESET_DEFINITIONS.length} preset(s) ${check ? "checked" : "written"} ` +
      `${where}.\n`,
  );
}
