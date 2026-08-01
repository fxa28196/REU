/**
 * wp8-clause3-preset-driven.ts — do the SHIPPED presets give the replay's bytes?
 *
 * `wp8-archive-replay.ts` drives the engine from the archived EXECUTED manifest
 * parameters, which is what WP8-SPEC-archive-gates.md §5.6 item 4 requires for a
 * byte comparison. The shipped presets differ from those executed values in
 * exactly one parameter — `pushThetaThreshold`, −0.25 in the preset and 0.0 as
 * executed (the Repast negative-"number" batch-parser defect, recorded as an
 * `ArchivedManifestException`).
 *
 * That parameter is read only inside `reactToClosureWave` after a blockage hit.
 * This script runs the shipped presets end to end and diffs their bytes against
 * the manifest-driven replay, so the size of the difference is a measurement
 * rather than an argument from the code path.
 *
 * ```
 * npx tsx validation/scripts/wp8-clause3-preset-driven.ts
 * ```
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PARAM_NAMES, PRESETS, parseRunConfig } from "@websim/shared";

import { headlessAssetsPresent, runHeadless } from "../src/headless.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ARCHIVE_ROOT = path.join(REPO_ROOT, "docs", "runs");
const OUT_ROOT = path.join(REPO_ROOT, "websim", "pipeline", "out", "wp8-replay");

const CASES: readonly { preset: keyof typeof PRESETS; run: string; archive: string }[] = [
  { preset: "ER_baseline_real_A", run: "ER-A-n6842-seed42", archive: "phase-e" },
  { preset: "ER_baseline_real_C", run: "ER-C-n6842-seed42", archive: "phase-e" },
  { preset: "SE_severe_v1_E18", run: "SE-E18-seed42", archive: "scenario-e" },
  { preset: "SE2_worst_plausible_E18_d1", run: "SE2-E18-d1-seed42", archive: "scenario-e-v2" },
];

const sha = (s: string): string => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** Field-text comparison over the columns both files carry, keyed on `agent_id`. */
function diffCells(aCsv: string, bCsv: string): { cols: number; differing: [string, number][]; rows: number } {
  const split = (t: string): string[][] =>
    t.split(/\r?\n/).filter((l) => l !== "").map((l) => l.split(","));
  const A = split(aCsv);
  const B = split(bCsv);
  const ha = A[0]!;
  const hb = B[0]!;
  const skip = new Set(["sim_id", "commit", "data_version"]);
  const shared = ha.filter((c) => hb.includes(c) && !skip.has(c));
  // `agent_id` for agents.csv, `shelter_id` for shelters.csv — verify_E_runs.py's
  // two keys. Both are column 0, so a missing key is a hard error, not a silent
  // fall-through that would report a false "no differences".
  const key = ha[0]!;
  const ka = ha.indexOf(key);
  const kb = hb.indexOf(key);
  if (ka < 0 || kb < 0) throw new Error(`no shared key column ${key}`);
  const idx = new Map(B.slice(1).map((r, i) => [r[kb]!, i + 1]));
  const differing: [string, number][] = [];
  for (const c of shared) {
    const ia = ha.indexOf(c);
    const ib = hb.indexOf(c);
    let d = 0;
    for (let i = 1; i < A.length; i++) {
      const j = idx.get(A[i]![ka]!);
      if (j === undefined) continue;
      if (A[i]![ia] !== B[j]![ib]) d++;
    }
    if (d > 0) differing.push([c, d]);
  }
  return { cols: shared.length, differing, rows: A.length - 1 };
}

function main(): void {
  if (!headlessAssetsPresent()) {
    console.error("SKIP: packed graph assets absent — this run produced NO numbers.");
    process.exit(2);
  }
  mkdirSync(OUT_ROOT, { recursive: true });
  const out: Record<string, unknown>[] = [];

  for (const c of CASES) {
    const config = parseRunConfig(PRESETS[c.preset], `preset ${c.preset}`);
    const result = runHeadless({ config, paramNames: PARAM_NAMES });
    const replayCsv = readFileSync(path.join(OUT_ROOT, c.run, "agents.csv"), "utf8");
    const archiveCsv = readFileSync(path.join(ARCHIVE_ROOT, c.archive, c.run, "agents.csv"), "utf8");
    const replayShel = readFileSync(path.join(OUT_ROOT, c.run, "shelters.csv"), "utf8");
    const archiveShel = readFileSync(path.join(ARCHIVE_ROOT, c.archive, c.run, "shelters.csv"), "utf8");

    const rec = {
      preset: c.preset,
      run: c.run,
      pushThetaThreshold: (config as unknown as Record<string, number>)["pushThetaThreshold"],
      simulationHours: config.simulationHours,
      randomSeed: config.randomSeed,
      agentsIdenticalToReplay: sha(result.parity.agentsCsv) === sha(replayCsv),
      sheltersIdenticalToReplay: sha(result.parity.sheltersCsv) === sha(replayShel),
      vsArchive: diffCells(result.parity.agentsCsv, archiveCsv),
      vsArchiveShelters: diffCells(result.parity.sheltersCsv, archiveShel),
    };
    out.push(rec);
    console.log(JSON.stringify(rec));
  }

  const p = path.join(OUT_ROOT, "clause3-preset-driven.json");
  writeFileSync(
    p,
    `${JSON.stringify({ schema: "websim/wp8-clause3-preset-driven/v1", generated: new Date().toISOString(), runs: out }, null, 2)}\n`,
  );
  console.log(`wrote ${p}`);
}

main();
