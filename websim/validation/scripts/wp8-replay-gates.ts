/**
 * wp8-replay-gates.ts — run the ported gate suite over the PORT's own output.
 *
 * `wp8-archive-gates.test.ts` already runs gates (f)(g)(h)(i)(k)(l) over the 60
 * archived Java runs and agrees with `verify_E_runs.py` on all 603 checks. That
 * proves the gates are faithful. It does not prove anything about the engine.
 * This script closes the other half: the same gate code, the same schedules on
 * disk, run over the twelve TS replays `wp8-archive-replay.ts` wrote.
 *
 * ```
 * npx tsx validation/scripts/wp8-archive-replay.ts     # produce the runs first
 * npx tsx validation/scripts/wp8-replay-gates.ts
 * ```
 *
 * ## Two grafts, both declared
 *
 * 1. **The `closures` block.** `engine/src/output/logger.ts:600` writes the
 *    literal `"closures": {"code": 0}` unconditionally, so the engine's own
 *    `simulation.json` cannot carry the census gate (k) reads. This script
 *    splices in `closure-census.json`, which the replay script read out of the
 *    live `ClosureRuntime` (blocked pair count off the network, version count,
 *    parsed wave hours). The gate then compares those engine numbers against the
 *    schedule CSV in `Geography/data/closures/`, which is what the gate is for.
 *    What is NOT under test is the logger's serialisation of the block, because
 *    there is none. Printed as `GRAFT` in the header of every SE/SE2 run.
 *
 * 2. ~~**`git_working_tree_dirty`**~~ — **no longer a graft, and never was a
 *    fix.** This used to read: the headless runner writes no `source_integrity`
 *    block at all, so gate (h)'s sub-check has nothing to read and is left to
 *    FAIL rather than papered over. The first half is fixed:
 *    `wp8-archive-replay.ts` now stamps a measured block from
 *    `validation/src/provenance.ts`, so the port states its provenance instead
 *    of declining to.
 *
 *    The sub-check can still fail, and when it does the reason is now a fact
 *    about the tree rather than about the writer. Gate (h) demands the JSON
 *    boolean `false` by identity; the block carries `git status --porcelain`
 *    over the TypeScript sources that decide these numbers. Run the replay on an
 *    uncommitted tree and it reports `true` and (h) goes red — correctly, since
 *    nobody could reproduce those bytes from the recorded commit. Read the
 *    `detail` column: `git_working_tree_dirty=true` is the port telling the
 *    truth, and `git_working_tree_dirty=undefined` is the older failure this
 *    paragraph used to describe.
 *
 * Everything else — (f), (g.1), (g.2), (i), (k.1)–(k.7), (l.0)–(l.3) — reads
 * engine bytes with no substitution whatsoever.
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  Checks,
  geographyScheduleSource,
  runFromDocuments,
  runWp8Gates,
  type RunArm,
} from "../src/harness/index.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const GEOGRAPHY_DIR = path.join(REPO_ROOT, "Geography");
const REPLAY_ROOT = path.join(REPO_ROOT, "websim", "pipeline", "out", "wp8-replay");
const ARCHIVE_ROOT = path.join(REPO_ROOT, "docs", "runs");

const schedules = geographyScheduleSource(GEOGRAPHY_DIR);

interface Target {
  readonly run: string;
  readonly archive: string;
  readonly arm: RunArm;
}

const TARGETS: readonly Target[] = [
  ...[42, 43, 44].map((s) => ({ run: `ER-A-n6842-seed${s}`, archive: "phase-e", arm: "er" as const })),
  ...[42, 43, 44].map((s) => ({ run: `ER-C-n6842-seed${s}`, archive: "phase-e", arm: "er" as const })),
  ...[42, 43, 44].map((s) => ({ run: `SE-E18-seed${s}`, archive: "scenario-e", arm: "se" as const })),
  ...[42, 43, 44].map((s) => ({
    run: `SE2-E18-d1-seed${s}`,
    archive: "scenario-e-v2",
    arm: "se" as const,
  })),
];

/** Splice the engine's live closure census into the manifest text. */
function graftClosures(simulationJson: string, censusPath: string): { text: string; grafted: boolean } {
  if (!existsSync(censusPath)) return { text: simulationJson, grafted: false };
  const census = JSON.parse(readFileSync(censusPath, "utf8")) as Record<string, unknown>;
  if (census["code"] === 0) return { text: simulationJson, grafted: false };
  const block = {
    code: census["code"],
    schedule_file: census["schedule_file"],
    scheduled_undirected_edges: census["scheduled_undirected_edges"],
    matching_graph_edges: census["matching_graph_edges"],
    wave_hours: census["wave_hours"],
    blocked_edges_at_end: census["blocked_edges_at_end"],
    closure_version_at_end: census["closure_version_at_end"],
  };
  const replaced = simulationJson.replace(
    '  "closures": {"code": 0},',
    `  "closures": ${JSON.stringify(block)},`,
  );
  if (replaced === simulationJson) {
    throw new Error(`${censusPath}: could not find the hardcoded closures line to graft over`);
  }
  return { text: replaced, grafted: true };
}

interface RunReport {
  readonly run: string;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly grafted: boolean;
  readonly failures: readonly { readonly name: string; readonly detail: string }[];
}

function main(): void {
  const reports: RunReport[] = [];
  for (const t of TARGETS) {
    const dir = path.join(REPLAY_ROOT, t.run);
    if (!existsSync(dir)) {
      console.error(`MISSING ${t.run} — run wp8-archive-replay.ts first`);
      process.exitCode = 2;
      continue;
    }
    const agentsCsv = readFileSync(path.join(dir, "agents.csv"), "utf8");
    const sheltersCsv = readFileSync(path.join(dir, "shelters.csv"), "utf8");
    const { text: simulationJson, grafted } = graftClosures(
      readFileSync(path.join(dir, "simulation.json"), "utf8"),
      path.join(dir, "closure-census.json"),
    );

    const lines: string[] = [];
    const ck = new Checks((l) => lines.push(l));
    const run = runFromDocuments({ name: `TS ${t.run}`, agentsCsv, sheltersCsv, simulationJson });
    runWp8Gates(ck, run, { arm: t.arm, schedules });

    console.log(
      `\n===== ${t.run}  (arm --${t.arm}${grafted ? ", closures block GRAFTED from engine ClosureRuntime" : ""}) =====`,
    );
    for (const l of lines) console.log(l);
    console.log(`--- ${ck.summary()}`);

    reports.push({
      run: t.run,
      passed: ck.passed.length,
      failed: ck.failed.length,
      skipped: ck.skipped.length,
      grafted,
      failures: ck.failed.map((c) => ({ name: c.name, detail: c.detail })),
    });
  }

  console.log("\n\n================ SUMMARY: ported gates over TS output ================");
  console.log("run                     pass fail skip  failing checks");
  for (const r of reports) {
    console.log(
      `${r.run.padEnd(22)}  ${String(r.passed).padStart(4)} ${String(r.failed).padStart(4)} ` +
        `${String(r.skipped).padStart(4)}  ${r.failures.map((f) => f.name).join(" ; ")}`,
    );
  }
  const totalFail = reports.reduce((a, r) => a + r.failed, 0);
  console.log(`\nTOTAL failing checks over ${reports.length} TS runs: ${totalFail}`);

  writeFileSync(
    path.join(REPLAY_ROOT, "replay-gates.json"),
    `${JSON.stringify({ schema: "websim/wp8-replay-gates/v1", archiveRoot: ARCHIVE_ROOT, reports }, null, 2)}\n`,
  );
}

main();
