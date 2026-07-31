/**
 * verify-working-set.ts — fetch and/or verify a local copy of the curated
 * validation working set against its committed manifest (plan §5.3, W18).
 *
 *   npx tsx pipeline/scripts/verify-working-set.ts --fetch    # materialise from an archive
 *   npx tsx pipeline/scripts/verify-working-set.ts            # verify SHAs of the local copy
 *   npx tsx pipeline/scripts/verify-working-set.ts --dest D   # use D instead of the default
 *
 * Default destination is `validation/working-set/data/`, which is git-ignored.
 * "Fetch" copies from a local archive (`WEBSIM_ARCHIVE_ROOT`, else `docs/runs/`)
 * because there is no remote to fetch from: the archive is the user's local
 * 375 MB tree, and publishing it is a separate, user-owned decision.
 *
 * Verification is byte-exact against the manifest SHAs. A run whose bytes differ
 * from the manifest is a hard failure, not a warning: the golden summaries were
 * derived from those exact bytes, so a mismatch invalidates every downstream
 * comparison.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describeArchive, sha256Hex } from "../src/archive/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKING_SET_DIR = path.join(HERE, "..", "..", "validation", "working-set");
const MANIFEST_FILE = path.join(WORKING_SET_DIR, "working-set.manifest.json");

const argv = process.argv.slice(2);
const doFetch = argv.includes("--fetch");
const destIdx = argv.indexOf("--dest");
const destRoot =
  destIdx >= 0 && argv[destIdx + 1] !== undefined
    ? path.resolve(argv[destIdx + 1] as string)
    : path.join(WORKING_SET_DIR, "data");

interface ManifestFile {
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
}
interface ManifestEntry {
  readonly run_dir: string;
  readonly files: readonly ManifestFile[];
}
interface WorkingSetManifest {
  readonly budget: { readonly actual_bytes: number; readonly run_count: number };
  readonly entries: readonly ManifestEntry[];
}

if (!existsSync(MANIFEST_FILE)) {
  process.stderr.write(
    `verify-working-set: no manifest at ${MANIFEST_FILE}. Run ` +
      "`npx tsx pipeline/scripts/build-working-set-manifest.ts` against a local archive first.\n",
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_FILE, "utf8")) as WorkingSetManifest;

if (doFetch) {
  const location = describeArchive();
  if (!location.present) {
    process.stderr.write(
      `verify-working-set --fetch: no source archive at ${location.root}. There is no remote ` +
        "to fetch from; point WEBSIM_ARCHIVE_ROOT at a local copy of docs/runs/.\n",
    );
    process.exit(1);
  }
  let copied = 0;
  for (const entry of manifest.entries) {
    const from = path.join(location.root, ...entry.run_dir.split("/"));
    const to = path.join(destRoot, ...entry.run_dir.split("/"));
    mkdirSync(to, { recursive: true });
    for (const f of entry.files) {
      copyFileSync(path.join(from, f.file), path.join(to, f.file));
      copied += 1;
    }
  }
  process.stdout.write(`fetched ${copied} file(s) into ${destRoot}\n`);
}

let ok = 0;
const problems: string[] = [];
for (const entry of manifest.entries) {
  const dir = path.join(destRoot, ...entry.run_dir.split("/"));
  for (const f of entry.files) {
    const full = path.join(dir, f.file);
    if (!existsSync(full)) {
      problems.push(`MISSING  ${entry.run_dir}/${f.file}`);
      continue;
    }
    const bytes = readFileSync(full);
    if (bytes.byteLength !== f.bytes) {
      problems.push(
        `SIZE     ${entry.run_dir}/${f.file}: ${bytes.byteLength} bytes, manifest says ${f.bytes}`,
      );
      continue;
    }
    const sha = sha256Hex(bytes);
    if (sha !== f.sha256) {
      problems.push(`SHA      ${entry.run_dir}/${f.file}: ${sha} != ${f.sha256}`);
      continue;
    }
    ok += 1;
  }
}

process.stdout.write(
  `verify-working-set: ${ok} file(s) verified, ${problems.length} problem(s), root ${destRoot}\n`,
);
for (const p of problems) {
  process.stdout.write(`  ${p}\n`);
}
if (problems.length > 0) {
  process.stderr.write(
    "verify-working-set: local working set does NOT match the manifest. The golden summaries " +
      "were derived from the manifest's exact bytes, so downstream comparisons are invalid " +
      "until this is resolved.\n",
  );
  process.exitCode = 1;
}
