/**
 * wp8-clause3-identity-order.ts — the identity-order control for the clause-3
 * order census.
 *
 * The permutation census varies the within-tick shuffle across many random
 * streams. This script runs the same configurations once more with
 * `agentOrder: "identity"`, i.e. residents stepped in creation order with no
 * shuffle at all — an ordering that is outside the shuffle family rather than a
 * draw from it. `order-permutation-census.json` carries the same control for the
 * WP7 arm-A slice, where it reads 106 `final_state` flips against 94–144 for the
 * sampled streams.
 *
 * ```
 * npx tsx validation/scripts/wp8-clause3-identity-order.ts
 * ```
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PARAM_NAMES, parseRunConfig, type RunConfig } from "@websim/shared";

import { headlessAssetsPresent, runHeadless } from "../src/headless.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ARCHIVE_ROOT = path.join(REPO_ROOT, "docs", "runs");
const OUT_ROOT = path.join(REPO_ROOT, "websim", "pipeline", "out", "wp8-replay");

const CASES: readonly { run: string; archive: string }[] = [
  { run: "ER-A-n6842-seed42", archive: "phase-e" },
  { run: "SE-E18-seed42", archive: "scenario-e" },
  { run: "SE2-E18-d1-seed42", archive: "scenario-e-v2" },
];

const CODE_FALLBACKS: Readonly<Record<string, number>> = {
  smokeSeriesCode: 0,
  smokeScale: 1.0,
  closuresCode: 0,
  pStuck: 0.3,
  stuckDelayH: 3.0,
  pushThetaThreshold: -0.25,
  kPush: 1.0,
  closureDraw: 1,
};

function buildConfig(run: string, archive: string): RunConfig {
  const manifest = JSON.parse(
    readFileSync(path.join(ARCHIVE_ROOT, archive, run, "simulation.json"), "utf8"),
  ) as { reproducibility: { parameters: Record<string, number> } };
  const params = manifest.reproducibility.parameters;
  const raw: Record<string, number> = {};
  for (const name of PARAM_NAMES) raw[name] = params[name] ?? CODE_FALLBACKS[name]!;
  return parseRunConfig(raw, `archived manifest ${archive}/${run}`);
}

/** Column-wise text comparison, keyed on `agent_id`. */
function compare(aCsv: string, bCsv: string): { cols: number; bitEqual: number; rows: number; identicalRows: number } {
  const split = (t: string): string[][] =>
    t
      .split(/\r?\n/)
      .filter((l) => l !== "")
      .map((l) => l.split(","));
  const A = split(aCsv);
  const B = split(bCsv);
  const ha = A[0]!;
  const hb = B[0]!;
  const shared = ha.filter((c) => hb.includes(c) && c !== "sim_id" && c !== "commit" && c !== "data_version");
  const keyA = ha.indexOf("agent_id");
  const keyB = hb.indexOf("agent_id");
  const idx = new Map(B.slice(1).map((r, i) => [r[keyB]!, i + 1]));
  const bad = new Array<boolean>(A.length - 1).fill(false);
  let bitEqual = 0;
  for (const c of shared) {
    const ia = ha.indexOf(c);
    const ib = hb.indexOf(c);
    let d = 0;
    for (let i = 1; i < A.length; i++) {
      const j = idx.get(A[i]![keyA]!);
      if (j === undefined) continue;
      if (A[i]![ia] !== B[j]![ib]) {
        d++;
        bad[i - 1] = true;
      }
    }
    if (d === 0) bitEqual++;
  }
  return { cols: shared.length, bitEqual, rows: A.length - 1, identicalRows: bad.filter((b) => !b).length };
}

function main(): void {
  if (!headlessAssetsPresent()) {
    console.error("SKIP: packed graph assets absent — this run produced NO numbers.");
    process.exit(2);
  }
  mkdirSync(OUT_ROOT, { recursive: true });
  const out: Record<string, unknown>[] = [];
  for (const c of CASES) {
    const config = buildConfig(c.run, c.archive);
    const result = runHeadless({ config, paramNames: PARAM_NAMES, agentOrder: "identity" });
    const archiveCsv = readFileSync(path.join(ARCHIVE_ROOT, c.archive, c.run, "agents.csv"), "utf8");
    const shuffledCsv = readFileSync(path.join(OUT_ROOT, c.run, "agents.csv"), "utf8");
    const vsArchive = compare(result.parity.agentsCsv, archiveCsv);
    const vsShuffled = compare(result.parity.agentsCsv, shuffledCsv);
    const rec = { run: c.run, agentOrder: "identity", vsArchive, vsShuffledRun: vsShuffled };
    out.push(rec);
    console.log(JSON.stringify(rec));
  }
  const p = path.join(OUT_ROOT, "clause3-identity-order.json");
  writeFileSync(
    p,
    `${JSON.stringify({ schema: "websim/wp8-clause3-identity-order/v1", generated: new Date().toISOString(), runs: out }, null, 2)}\n`,
  );
  console.log(`wrote ${p}`);
}

main();
