/**
 * build-working-set-manifest.ts — resolve the curated validation working set
 * (plan §5.3, W18) into a committed manifest.
 *
 *   npx tsx pipeline/scripts/build-working-set-manifest.ts
 *   npx tsx pipeline/scripts/build-working-set-manifest.ts --check
 *
 * The manifest — run list, per-file SHA-256 and byte sizes, coverage matrix,
 * total size — is the deliverable. The payload is NOT committed: git-lfs and the
 * repo-quota implication are a user decision (plan §10 item 3), so this script
 * never adds LFS, never writes a binary into the repo, and `verify-working-set.ts`
 * materialises a local copy into a git-ignored directory on demand.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  describeArchive,
  discoverRuns,
  GATE_CLASSES,
  identifyRunFiles,
  missingArchiveBanner,
  uncoveredGateClasses,
  WORKING_SET,
} from "../src/archive/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, "..", "..", "validation", "working-set");
const OUT_FILE = path.join(OUT_DIR, "working-set.manifest.json");

const check = process.argv.slice(2).includes("--check");

const location = describeArchive();
if (!location.present) {
  process.stderr.write(`${missingArchiveBanner(location)}\n`);
  process.exit(1);
}

const byDir = new Map(discoverRuns(location.root).map((r) => [r.runDir, r]));

const missing = WORKING_SET.filter((e) => !byDir.has(e.runDir));
if (missing.length > 0) {
  process.stderr.write(
    `build-working-set-manifest: ${missing.length} curated run(s) are not in the archive:\n` +
      missing.map((m) => `  ${m.runDir}\n`).join(""),
  );
  process.exit(1);
}

let totalBytes = 0;
const entries = WORKING_SET.map((entry) => {
  const run = byDir.get(entry.runDir) as NonNullable<ReturnType<typeof byDir.get>>;
  const files = identifyRunFiles(location.root, run);
  const bytes = files.reduce((acc, f) => acc + f.bytes, 0);
  totalBytes += bytes;
  return {
    run_dir: entry.runDir,
    preset_family: run.presetFamily,
    seed: run.seed,
    why: entry.why,
    gate_classes: entry.gateClasses,
    bytes,
    files,
  };
});

const uncovered = uncoveredGateClasses();

const manifest = {
  schema: "reu-wildfire-shelter-abm/validation-working-set/v1",
  about:
    "The curated subset of the read-only Java archive that hosted CI runs Tiers 1-3 " +
    "against (plan §5.3, risk W18). This file is a MANIFEST ONLY: the payload is not " +
    "committed, no git-lfs is configured, and materialising a local copy needs the " +
    "user's sign-off on repo size (plan §10 item 3).",
  how_to_use: [
    "npx tsx pipeline/scripts/verify-working-set.ts --fetch   # copy from a local archive",
    "npx tsx pipeline/scripts/verify-working-set.ts           # verify SHAs of a local copy",
    "WEBSIM_ARCHIVE_ROOT=<dir> points every archive-reading tool at the copy instead",
    "of docs/runs/, which is how a CI runner consumes the working set.",
  ],
  budget: {
    plan_target_bytes: 40 * 1024 * 1024,
    plan_target_note: "plan §5.3 sizes the working set at roughly 40 MB",
    actual_bytes: totalBytes,
    actual_mib: Math.round((totalBytes / (1024 * 1024)) * 100) / 100,
    run_count: entries.length,
    file_count: entries.reduce((acc, e) => acc + e.files.length, 0),
  },
  coverage: {
    gate_classes: GATE_CLASSES,
    uncovered_gate_classes: uncovered,
    note:
      "The nine-seed statistical envelope is deliberately NOT a membership driver: all 27 " +
      "three-arm runs would cost roughly 73 MB alone. It ships as a committed digest in " +
      "validation/golden-summaries/sheltered-envelopes.json instead. The working set " +
      "carries two seeds per arm so cross-seed invariants still have real data.",
  },
  entries,
};

const text = `${JSON.stringify(manifest, null, 2)}\n`;

mkdirSync(OUT_DIR, { recursive: true });
if (check) {
  let onDisk = "";
  try {
    onDisk = readFileSync(OUT_FILE, "utf8");
  } catch {
    process.stderr.write("build-working-set-manifest: manifest missing.\n");
    process.exit(1);
  }
  if (onDisk.replace(/\r\n/gu, "\n") !== text) {
    process.stderr.write("build-working-set-manifest: DRIFT against the archive.\n");
    process.exit(1);
  }
  process.stdout.write("ok       working-set.manifest.json\n");
} else {
  writeFileSync(OUT_FILE, text, "utf8");
  process.stdout.write(`wrote    working-set.manifest.json (${(text.length / 1024).toFixed(1)} KB)\n`);
}

process.stdout.write(
  `working set: ${entries.length} run(s), ${manifest.budget.actual_mib} MiB ` +
    `(plan target ~40 MB), ${uncovered.length} uncovered gate class(es)\n`,
);
if (uncovered.length > 0) {
  process.stderr.write(`  uncovered: ${uncovered.join(", ")}\n`);
  process.exitCode = 1;
}
