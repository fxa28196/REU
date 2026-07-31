/**
 * build-presets.ts — materialise `shared/src/presets/*.json` from the preset
 * definitions (plan §2 repo layout, `pipeline/scripts/build-presets.ts`).
 *
 * The definitions live in `shared` because they are contract data the browser
 * needs; the writer lives here because `shared` must stay filesystem-free.
 *
 *   npx tsx pipeline/scripts/build-presets.ts          # write
 *   npx tsx pipeline/scripts/build-presets.ts --check  # verify, exit 1 on drift
 *
 * `--check` is the CI form. `shared/test/presets.test.ts` also pins the JSON to
 * the definitions, so drift fails the test suite even if this script is never
 * run.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const HERE = dirname(fileURLToPath(import.meta.url));
const PRESET_DIR = join(HERE, "..", "..", "shared", "src", "presets");

const check = process.argv.slice(2).includes("--check");

mkdirSync(PRESET_DIR, { recursive: true });

let drift = 0;
for (const definition of PRESET_DEFINITIONS) {
  // Validate before writing: a preset that does not satisfy the schema must
  // never reach disk, where it would look authoritative.
  const config = parseRunConfig(materialisePreset(definition), `preset ${definition.id}`);
  const text = serialisePreset(config);
  const path = join(PRESET_DIR, presetFileName(definition.id));

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
}

if (check && drift > 0) {
  process.stderr.write(
    `build-presets: ${drift} preset file(s) differ from the definitions — ` +
      "run `npx tsx pipeline/scripts/build-presets.ts` and commit the result.\n",
  );
  process.exitCode = 1;
} else {
  process.stderr.write(
    `build-presets: ${PRESET_DEFINITIONS.length} preset(s) ${check ? "checked" : "written"}.\n`,
  );
}
