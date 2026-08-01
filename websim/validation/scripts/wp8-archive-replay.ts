/**
 * wp8-archive-replay.ts — run the archived ER / SE / SE2 configurations through
 * the TS engine and put the result next to the Java bytes.
 *
 * ```
 * npx tsx validation/scripts/wp8-archive-replay.ts                 # all 12 runs
 * npx tsx validation/scripts/wp8-archive-replay.ts --only ER-A-n6842-seed42
 * ```
 *
 * ## This script is no longer the only thing that runs these numbers
 *
 * The matrix, the executed-manifest configuration builder and the
 * `score_scenarioE.py` transcription all live in
 * `validation/src/harness/archive-replay.ts` now, and
 * `validation/test/wp8-archive-replay.test.ts` — an artifact-gated CI test —
 * drives the same code and asserts the port's metrics against the ARCHIVE. That
 * matters: WP8's headline scientific claim used to exist only as this script's
 * stdout, which is a claim no gate defends. This file's remaining job is the
 * evidence dump — the twelve run directories, the closure census sidecars and
 * the report — not the assertion.
 *
 * See `harness/archive-replay.ts` for why the configuration comes from the
 * archived *executed* manifest rather than the shipped preset
 * (WP8-SPEC-archive-gates.md §5.6 item 4), which eight Scenario-E names fall
 * back to `ContextCreator.doubleParam`'s code defaults on a 33-parameter
 * `phase-e/` manifest, and what every metric means. The preset-vs-executed
 * delta is printed per run rather than hidden; at these configurations it is
 * exactly one name, `pushThetaThreshold` 0.0 vs −0.25, and it is inert because
 * the parameter is consulted only at a blockage encounter and the archive
 * records zero of those.
 *
 * ## What it writes (all inside `pipeline/out/`, which this agent owns)
 *
 * ```
 * pipeline/out/wp8-replay/<run>/agents.csv          parity flavour, CRLF
 * pipeline/out/wp8-replay/<run>/shelters.csv
 * pipeline/out/wp8-replay/<run>/simulation.json     engine writer, verbatim
 * pipeline/out/wp8-replay/<run>/closure-census.json engine ClosureRuntime read-out
 * pipeline/out/wp8-replay/replay-report.json        per-run metrics + timings
 * ```
 *
 * `closure-census.json` exists because of a real engine gap, stated plainly:
 * `engine/src/output/logger.ts:600` emits the literal `"closures": {"code": 0}`
 * for every run, so the engine's own `simulation.json` cannot carry the census
 * gate (k) reads. The numbers in the sidecar are taken from the **live**
 * `ClosureRuntime` at the end of the run (`blockedEdgeCount` off the network,
 * `closureVersion`, the parsed `waveHours`) — i.e. from the same objects Java's
 * writer interrogates — not from the schedule file the gate compares them to.
 * The comparison is therefore still engine-vs-CSV, but the serialisation step is
 * NOT under test here. See the report's `openItems`.
 *
 * ## The `source_integrity` block, and gate (h)
 *
 * These manifests carry one, from `validation/src/provenance.ts`. They did not
 * before, and gate (h) — which tests `git_working_tree_dirty is False` by
 * identity — therefore recorded `failed: 1` on all twelve TS runs while passing
 * 594/594 on the archived Java runs. The port did not satisfy a gate the port
 * itself ports, for the reason "it never said".
 *
 * It says now, and it says what it measures: `git status --porcelain` over the
 * TypeScript sources that decide these numbers, plus the SHA-256 census of the
 * `Geography/` inputs actually read. **A dirty tree yields `true` and gate (h)
 * stays red**, because the run really did execute code that is in no commit and
 * nobody could reproduce it from the recorded hash. There is deliberately no
 * flag to assert otherwise — that is the false `false`
 * `docs/critique-response/09-SYSTEM-AUDIT.md` caught on eight archived D
 * manifests, and it is not worth a green line.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PARAM_NAMES } from "@websim/shared";

import { headlessAssetsPresent, runHeadless, GEOGRAPHY_DIR } from "../src/headless.js";
import {
  ARCHIVE_REPLAY_CASES,
  archiveRunDir,
  buildReplayConfig,
  readArchivedManifest,
  scoreRun,
  type RunMetrics,
} from "../src/harness/archive-replay.js";
import { portSourceIntegrity } from "../src/provenance.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT_ROOT = path.join(REPO_ROOT, "websim", "pipeline", "out", "wp8-replay");

// ---------------------------------------------------------------------------

interface ClosureCensus {
  readonly code: number;
  readonly schedule_file: string | null;
  readonly scheduled_undirected_edges: number | null;
  readonly matching_graph_edges: number | null;
  readonly wave_hours: readonly number[] | null;
  readonly blocked_edges_at_end: number | null;
  readonly closure_version_at_end: number | null;
}

/**
 * The `closures` block Java's `OutcomeLogger` would have written, read out of
 * the live engine objects at end of run. `blocked_edges_at_end` comes off the
 * **network** (`ClosureRuntime.blockedEdgeCount`), never off the CSV, exactly as
 * WP8-SPEC-archive-gates §3.4 requires of the producer.
 */
function closureCensus(
  code: number,
  runtime: { blockedEdgeCount: number; closureVersion: number; schedule: {
    csvPath: string; scheduledEdges: number; matchingGraphEdges: number; waveHours: readonly number[];
  } } | null,
): ClosureCensus {
  if (runtime === null) {
    return {
      code,
      schedule_file: null,
      scheduled_undirected_edges: null,
      matching_graph_edges: null,
      wave_hours: null,
      blocked_edges_at_end: null,
      closure_version_at_end: null,
    };
  }
  return {
    code,
    schedule_file: runtime.schedule.csvPath,
    scheduled_undirected_edges: runtime.schedule.scheduledEdges,
    matching_graph_edges: runtime.schedule.matchingGraphEdges,
    wave_hours: [...runtime.schedule.waveHours],
    blocked_edges_at_end: runtime.blockedEdgeCount,
    closure_version_at_end: runtime.closureVersion,
  };
}

// ---------------------------------------------------------------------------

interface ReplayRecord {
  readonly run: string;
  readonly archive: string;
  readonly family: string;
  readonly seed: number;
  readonly hours: number;
  readonly smokeSeriesCode: number;
  readonly closuresCode: number;
  readonly closureDraw: number;
  readonly configSource: {
    readonly fromManifest: number;
    readonly fromFallback: Readonly<Record<string, number>>;
    readonly presetDelta: Readonly<Record<string, readonly [number, number]>>;
  };
  readonly port: RunMetrics;
  readonly archived: RunMetrics;
  readonly closureCensus: ClosureCensus;
  readonly archivedClosures: unknown;
  readonly runMs: number;
}

function main(): void {
  const argv = process.argv.slice(2);
  let only: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only") {
      only = argv[i + 1] ?? null;
      i++;
    } else {
      throw new Error(`unknown argument ${argv[i]}`);
    }
  }

  if (!headlessAssetsPresent()) {
    console.error(
      "SKIP: pipeline/out/assets/graph-{topology,geometry}.bin absent — this run produced NO " +
        "numbers and must not be reported as a pass.",
    );
    process.exit(2);
  }
  console.log(`[replay] Geography dir: ${GEOGRAPHY_DIR}`);

  const cases =
    only === null ? ARCHIVE_REPLAY_CASES : ARCHIVE_REPLAY_CASES.filter((c) => c.run === only);
  if (cases.length === 0) throw new Error(`--only ${only} matched no case`);

  // Measured once — the digest census is 13 files including a 17 MB shapefile,
  // and `git status` is a subprocess. Neither can change between runs of one
  // invocation, and pretending otherwise would only make the manifests differ.
  const sourceIntegrity = portSourceIntegrity({
    repoRoot: REPO_ROOT,
    geographyDir: GEOGRAPHY_DIR,
  });
  console.log(
    `[replay] source_integrity: git_working_tree_dirty=${String(
      sourceIntegrity.gitWorkingTreeDirty,
    )}, ${sourceIntegrity.files.length} input digests` +
      (sourceIntegrity.gitWorkingTreeDirty === false
        ? ""
        : "  <-- gate (h) requires the JSON boolean false and will FAIL on these runs"),
  );

  mkdirSync(OUT_ROOT, { recursive: true });
  const records: ReplayRecord[] = [];

  for (const c of cases) {
    const built = buildReplayConfig(c);
    const { config } = built;
    const t0 = performance.now();
    const result = runHeadless({ config, paramNames: PARAM_NAMES, env: { sourceIntegrity } });
    const runMs = performance.now() - t0;

    const outDir = path.join(OUT_ROOT, c.run);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, "agents.csv"), result.parity.agentsCsv);
    writeFileSync(path.join(outDir, "shelters.csv"), result.parity.sheltersCsv);
    writeFileSync(path.join(outDir, "simulation.json"), result.parity.simulationJson);

    const census = closureCensus(config.closuresCode, result.sim.closures);
    writeFileSync(path.join(outDir, "closure-census.json"), `${JSON.stringify(census, null, 2)}\n`);

    const port = scoreRun(
      result.parity.agentsCsv,
      result.parity.sheltersCsv,
      result.parity.simulationJson,
    );
    const dir = archiveRunDir(c);
    const archived = scoreRun(
      readFileSync(path.join(dir, "agents.csv"), "utf8"),
      readFileSync(path.join(dir, "shelters.csv"), "utf8"),
      readFileSync(path.join(dir, "simulation.json"), "utf8"),
    );

    records.push({
      run: c.run,
      archive: c.archive,
      family: c.family,
      seed: config.randomSeed,
      hours: config.simulationHours,
      smokeSeriesCode: config.smokeSeriesCode,
      closuresCode: config.closuresCode,
      closureDraw: config.closureDraw,
      configSource: {
        fromManifest: built.fromManifest.length,
        fromFallback: built.fromFallback,
        presetDelta: built.presetDelta,
      },
      port,
      archived,
      closureCensus: census,
      archivedClosures: readArchivedManifest(c).closures,
      runMs,
    });

    console.log(
      `[replay] ${c.run.padEnd(22)} ${(runMs / 1000).toFixed(1)}s  ` +
        `sheltered ${String(port.sheltered).padStart(5)} (archive ${archived.sheltered})  ` +
        `cap-ref ${String(port.capacity_refusals).padStart(4)} (${archived.capacity_refusals})  ` +
        `policy ${String(port.policy_refusals).padStart(4)} (${archived.policy_refusals})  ` +
        `dose ${port.mean_dose_ug} (${archived.mean_dose_ug})  ` +
        `oor ${port.out_of_range_lookups}  counters ` +
        `${port.blockage_events}/${port.pushes}/${port.reroutes}/${port.stuck}`,
    );
  }

  const reportPath = path.join(OUT_ROOT, "replay-report.json");
  writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        schema: "websim/wp8-archive-replay/v1",
        generated: new Date().toISOString(),
        note:
          "Configurations are driven from the ARCHIVED EXECUTED manifest parameters " +
          "(WP8-SPEC-archive-gates §5.6 item 4), not from the shipped presets. " +
          "closureCensus is read from the live ClosureRuntime because " +
          "engine/src/output/logger.ts:600 hardcodes '\"closures\": {\"code\": 0}'. " +
          "The metrics asserted in CI are validation/test/wp8-archive-replay.test.ts's, " +
          "over the same harness/archive-replay.ts code; this report is the evidence dump.",
        sourceIntegrity: {
          git_working_tree_dirty: sourceIntegrity.gitWorkingTreeDirty,
          input_digests: sourceIntegrity.files.length,
        },
        runs: records,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\n[replay] wrote ${records.length} run(s) + ${reportPath}`);
}

main();
