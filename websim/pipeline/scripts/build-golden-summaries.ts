/**
 * build-golden-summaries.ts — derive `validation/golden-summaries/*.json` from
 * the archive (plan §4 golden-summaries row, §5.1 Tier 3, WP9).
 *
 *   npx tsx pipeline/scripts/build-golden-summaries.ts          # write
 *   npx tsx pipeline/scripts/build-golden-summaries.ts --check  # verify, exit 1 on drift
 *
 * These files ARE committed (unlike archive bundles): hosted CI never sees the
 * 375 MB archive, so the digests are the oracle Tier-3 checks compare against.
 * `--check` is the CI form and re-derives everything from the archive; it is
 * skipped, loudly, only when the archive is absent.
 *
 * Scope: the digested runs are the three-arm family at all nine seeds plus every
 * run of the shipped preset families (E0 / ER / SE / SEnc / SE2 / SE2nc). The
 * Phase-D sweeps, arm D, C-random and the legacy baselines are excluded — they
 * are not preset families, and including them would triple the file sizes for
 * envelopes nothing checks.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildGoldenSummaries,
  describeArchive,
  discoverRuns,
  GOLDEN_FILE_NAMES,
  loadRun,
  missingArchiveBanner,
  serialiseGolden,
  type ArchivedRun,
  type LoadedRun,
} from "../src/archive/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, "..", "..", "validation", "golden-summaries");

const check = process.argv.slice(2).includes("--check");

const location = describeArchive();
if (!location.present) {
  process.stderr.write(`${missingArchiveBanner(location)}\n`);
  process.stderr.write("build-golden-summaries: cannot derive digests without the archive.\n");
  process.exit(1);
}

/** Families whose runs back a shipped preset or a Tier-3 envelope. */
const DIGESTED_FAMILIES = new Set(["A", "B", "C", "E0", "ER", "SE", "SEnc", "SE2", "SE2nc"]);

const runs: readonly ArchivedRun[] = discoverRuns(location.root).filter((r) =>
  DIGESTED_FAMILIES.has(r.presetFamily),
);

const loaded: LoadedRun[] = [];
for (const run of runs) {
  loaded.push(loadRun(location.root, run));
}

const { files, index } = buildGoldenSummaries(loaded);

mkdirSync(OUT_DIR, { recursive: true });

let drift = 0;
const write = (name: string, text: string): void => {
  const file = path.join(OUT_DIR, name);
  if (check) {
    let onDisk = "";
    try {
      onDisk = readFileSync(file, "utf8");
    } catch {
      process.stdout.write(`MISSING  ${name}\n`);
      drift += 1;
      return;
    }
    if (onDisk.replace(/\r\n/gu, "\n") !== text) {
      process.stdout.write(`DRIFT    ${name}\n`);
      drift += 1;
    } else {
      process.stdout.write(`ok       ${name} (${(Buffer.byteLength(text) / 1024).toFixed(1)} KB)\n`);
    }
  } else {
    writeFileSync(file, text, "utf8");
    process.stdout.write(`wrote    ${name} (${(Buffer.byteLength(text) / 1024).toFixed(1)} KB)\n`);
  }
};

for (const name of GOLDEN_FILE_NAMES) {
  write(name, serialiseGolden(files[name] as never));
}
write("index.json", serialiseGolden(index));

process.stderr.write(
  `build-golden-summaries: ${loaded.length} archived run(s) digested from ${location.root}\n`,
);

if (check && drift > 0) {
  process.stderr.write(
    `build-golden-summaries: ${drift} file(s) differ from the archive — re-run without ` +
      "--check and review the diff before committing.\n",
  );
  process.exitCode = 1;
}
