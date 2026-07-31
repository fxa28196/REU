/**
 * build-archive-bundles.ts — digest `docs/runs/` into per-configuration display
 * bundles (plan §4 `archive-bundles/*.json`, §6.2 archived-instant-display).
 *
 *   npx tsx pipeline/scripts/build-archive-bundles.ts            # all runs
 *   npx tsx pipeline/scripts/build-archive-bundles.ts --presets  # shipped preset families only
 *   npx tsx pipeline/scripts/build-archive-bundles.ts --only A-seed42
 *   npx tsx pipeline/scripts/build-archive-bundles.ts --report   # size/gate report, no write
 *
 * Output: `pipeline/out/archive-bundles/<family>__<run>.json` plus an
 * `index.json` the app lazy-loads from. `pipeline/out/` is git-ignored; these
 * are build products of the read-only archive, not source.
 *
 * The archive is never modified. If it is absent the script exits 1 with the
 * loud banner rather than writing an empty index — a silently-empty bundle set
 * would make the Archive screen look merely uninteresting instead of broken.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildBundle,
  describeArchive,
  discoverRuns,
  familyCensus,
  missingArchiveBanner,
  REQUIRED_BUNDLE_FAMILIES,
  serialiseBundle,
  sha256Hex,
  type ArchivedRun,
} from "../src/archive/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, "..", "out", "archive-bundles");

const argv = process.argv.slice(2);
const presetsOnly = argv.includes("--presets");
const reportOnly = argv.includes("--report");
const onlyIdx = argv.indexOf("--only");
const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : undefined;

const location = describeArchive();
if (!location.present) {
  process.stderr.write(`${missingArchiveBanner(location)}\n`);
  process.exit(1);
}

const all = discoverRuns(location.root);
let runs: readonly ArchivedRun[] = all;
if (presetsOnly) {
  runs = runs.filter((r) => REQUIRED_BUNDLE_FAMILIES.includes(r.presetFamily));
}
if (only !== undefined) {
  runs = runs.filter((r) => r.runDir.includes(only) || r.bundleId.includes(only));
}

if (runs.length === 0) {
  process.stderr.write("build-archive-bundles: selection matched no archived runs.\n");
  process.exit(1);
}

if (!reportOnly) {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
}

interface IndexEntry {
  readonly bundle_id: string;
  readonly run_dir: string;
  readonly preset_family: string;
  readonly seed: number | null;
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly has_per_agent: boolean;
  readonly gates_failed: readonly string[];
}

const entries: IndexEntry[] = [];
const bySizeFamily = new Map<string, number[]>();
let totalBytes = 0;
const failures: string[] = [];

for (const run of runs) {
  let text: string;
  let bundleGatesFailed: string[];
  let hasPerAgent: boolean;
  try {
    const bundle = buildBundle(location.root, run);
    text = serialiseBundle(bundle);
    bundleGatesFailed = bundle.gates.filter((g) => !g.ok).map((g) => g.id);
    hasPerAgent = bundle.per_agent !== null;
  } catch (err) {
    failures.push(`${run.runDir}: ${String(err)}`);
    continue;
  }

  const file = `${run.bundleId}.json`;
  const bytes = Buffer.byteLength(text, "utf8");
  totalBytes += bytes;
  const sizes = bySizeFamily.get(run.presetFamily) ?? [];
  sizes.push(bytes);
  bySizeFamily.set(run.presetFamily, sizes);

  if (!reportOnly) {
    writeFileSync(path.join(OUT_DIR, file), text, "utf8");
  }

  entries.push({
    bundle_id: run.bundleId,
    run_dir: run.runDir,
    preset_family: run.presetFamily,
    seed: run.seed,
    file,
    bytes,
    sha256: sha256Hex(text),
    has_per_agent: hasPerAgent,
    gates_failed: bundleGatesFailed,
  });
}

const census = familyCensus(all);
const missingFamilies = REQUIRED_BUNDLE_FAMILIES.filter(
  (f) => !entries.some((e) => e.preset_family === f),
);

const index = {
  schema: "reu-wildfire-shelter-abm/archive-bundle-index/v1",
  archive_root_note:
    "Bundles are digests of the read-only Java archive. The archive itself is never " +
    "copied into websim/ and never shipped raw.",
  archive_census: {
    run_directories_with_a_manifest: all.length,
    with_agents_csv: all.filter((r) => r.hasAgents).length,
    with_shelters_csv: all.filter((r) => r.hasShelters).length,
    by_preset_family: Object.fromEntries(
      [...census]
        .map(([f, rs]): [string, number] => [f, rs.length])
        .sort((x, y) => (x[0] < y[0] ? -1 : 1)),
    ),
  },
  bundles: entries,
};

if (!reportOnly) {
  writeFileSync(
    path.join(OUT_DIR, "index.json"),
    `${JSON.stringify(index, null, 2)}\n`,
    "utf8",
  );
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

const fmtKb = (b: number): string => `${(b / 1024).toFixed(1)} KB`;

process.stdout.write(`archive root: ${location.root} (${location.source})\n`);
process.stdout.write(
  `runs discovered: ${all.length} (agents.csv in ${all.filter((r) => r.hasAgents).length})\n`,
);
process.stdout.write(`bundles built: ${entries.length}${reportOnly ? " (report only, nothing written)" : ""}\n\n`);

process.stdout.write("size by preset family (min / median / max / count):\n");
for (const [family, sizes] of [...bySizeFamily].sort(([a], [b]) => (a < b ? -1 : 1))) {
  const sorted = [...sizes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] as number;
  process.stdout.write(
    `  ${family.padEnd(8)} ${fmtKb(sorted[0] as number).padStart(10)} ` +
      `${fmtKb(median).padStart(10)} ${fmtKb(sorted[sorted.length - 1] as number).padStart(10)}  n=${sizes.length}\n`,
  );
}
process.stdout.write(`\ntotal: ${fmtKb(totalBytes)} across ${entries.length} bundle(s)\n`);

const overBudget = entries.filter((e) => e.bytes > 200 * 1024);
if (overBudget.length > 0) {
  process.stdout.write(
    `\n${overBudget.length} bundle(s) exceed the 200 KB plan budget:\n` +
      overBudget
        .slice(0, 10)
        .map((e) => `  ${e.bundle_id}: ${fmtKb(e.bytes)}\n`)
        .join(""),
  );
}

const withFailedGates = entries.filter((e) => e.gates_failed.length > 0);
if (withFailedGates.length > 0) {
  process.stdout.write(`\ngate failures in ${withFailedGates.length} bundle(s):\n`);
  for (const e of withFailedGates) {
    process.stdout.write(`  ${e.bundle_id}: ${e.gates_failed.join(", ")}\n`);
  }
}

if (missingFamilies.length > 0) {
  process.stderr.write(
    `\nbuild-archive-bundles: NO bundle for required preset family/families ` +
      `${missingFamilies.join(", ")} — coverage requirement not met.\n`,
  );
  process.exitCode = 1;
}

if (failures.length > 0) {
  process.stderr.write(`\nbuild-archive-bundles: ${failures.length} run(s) failed to digest:\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exitCode = 1;
}

if (process.exitCode === undefined || process.exitCode === 0) {
  process.stderr.write(
    `build-archive-bundles: ${entries.length} bundle(s), ${fmtKb(totalBytes)} total, ` +
      `${withFailedGates.length} with a failed gate.\n`,
  );
}
