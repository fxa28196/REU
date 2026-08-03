/**
 * working-set-replay.ts — the WP9 replay runner over the curated working set.
 *
 * WP8 built {@link ../harness/archive-replay.ts} for twelve Phase-E /
 * Scenario-E configurations. This module is that machinery *extended* to the
 * whole validation working set, which is what `IMPLEMENTATION_PLAN.md` §8 WP9
 * asks for:
 *
 * > Acceptance: all Tier-3 gates green on replays of A/B/C seeds 42–44, ER,
 * > SE-E18, SE2-E18-d1, E0 nulls.
 *
 * Three things it does NOT do, each deliberately:
 *
 *  1. **It never writes a configuration by hand.** Every run is driven from the
 *     archived *executed* manifest (`reproducibility.parameters`), exactly as
 *     `WP8-SPEC-archive-gates.md` §5.6 item 4 requires. A parameter the manifest
 *     does not carry is filled from `ContextCreator`'s own fallback
 *     ({@link JAVA_CODE_DEFAULTS}) and the fill is **reported**, never hidden.
 *     The `present-day-three-arm/` manifests carry 11 of the 41 names, so 30 of
 *     them are filled that way and the module's contract is that a reader can
 *     see all 30.
 *  2. **It does not re-implement a gate.** Tier 3 is scored by the ported gate
 *     suite in `../gates/` and `./`, in the certified scripts' own order and
 *     with their own check names.
 *  3. **It does not decide what a run class is from its directory name.** The
 *     arm and seed come out of the archived manifest's executed parameters
 *     (`scenarioCode`, `randomSeed`), so a run filed under the wrong name is a
 *     loud mismatch rather than a silent mis-scoring.
 *
 * ## Which gates apply to which run class, and why it is not one list
 *
 * The certified Python has two entry points, and they are not interchangeable:
 * `verify_E_runs.py` grades Phase-E / Scenario-E runs and `verify_2026_runs.py`
 * grades the three-arm family. Running the E suite over a `present-day-three-arm`
 * run would fail gate (h) — *"all 21 Phase-E parameters in the manifest"* — on
 * every one of them, because those runs were written by a logger that predates
 * the block. That failure would be an artefact of pointing the wrong instrument
 * at the run, not a finding.
 *
 * | class | driven by | gates |
 * |---|---|---|
 * | `pre-e` (`present-day-three-arm/`) | `verify_2026_runs.py` | cross-arm set + `analyze_run` |
 * | `null` (`E0null-*`) | `verify_E_runs.py --null … --reference …` | (a) + (b)–(h) + `analyze_run` |
 * | `er` (`ER-*`) | `verify_E_runs.py --er` | (b)–(h) + `analyze_run` |
 * | `se` (`SE*`, `SE2*`) | `verify_E_runs.py --se` | (b)–(l) + `analyze_run` |
 *
 * ## The two grafts, declared here rather than discovered later
 *
 * 1. **The `closures` block.** `engine/src/output/logger.ts` emits the literal
 *    `"closures": {"code": 0}` for every run, so the engine's own
 *    `simulation.json` cannot carry the census gate (k) reads. The block is
 *    spliced in from the **live `ClosureRuntime`** at end of run — the same
 *    objects Java's writer interrogates — and every replayed run records
 *    whether it was grafted. What is not under test is the logger's
 *    serialisation of that block, because there is none.
 * 2. **`source_integrity`.** `runHeadless` refuses to invent environment facts,
 *    so a replay stamps the measured block from `../provenance.ts`. On a dirty
 *    working tree that block reports `git_working_tree_dirty: true` and gate
 *    (h)'s second sub-check goes **red — correctly**, because the run executed
 *    code that is in no commit. There is no override. The acceptance suite
 *    therefore asserts that sub-check's verdict *equals the measured tree
 *    state* rather than asserting it passes, which is a two-directional claim:
 *    on a clean tree it demands PASS.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { PARAM_NAMES, parseRunConfig, type RunConfig } from "@websim/shared";
import { describeArchive, WORKING_SET, type WorkingSetEntry } from "@websim/pipeline/archive";
import { resolveClosuresCsv, SCENARIO_CHAIN } from "@websim/engine/world";
import type { DatasetDigest, SourceIntegrity } from "@websim/engine/output";

import { runHeadlessAsync, type HeadlessResult } from "../headless.js";

import { JAVA_CODE_DEFAULTS, NO_FALLBACK_PARAMS } from "./java-defaults.js";
import { loadRunDir, runFromDocuments, type RunDocuments, type RunView } from "./run-view.js";

// ---------------------------------------------------------------------------
// The replay matrix
// ---------------------------------------------------------------------------

/** Which certified script grades a run, in that script's own vocabulary. */
export type ReplayClass = "pre-e" | "null" | "er" | "se";

export interface ReplayTarget {
  /** Run directory relative to the archive root, POSIX separators. */
  readonly runDir: string;
  /** Family directory (`present-day-three-arm`, `phase-e`, …). */
  readonly archive: string;
  /** Leaf directory name. */
  readonly run: string;
  readonly cls: ReplayClass;
  /**
   * `true` when the run is a member of plan §5.3's curated ~40 MB working set;
   * `false` for the runs plan §8's WP9 acceptance line adds on top of it
   * (the three-arm seed-44 column).
   */
  readonly inWorkingSet: boolean;
  /** Why the run is in the set — verbatim from `WORKING_SET` where it has one. */
  readonly why: string;
  /**
   * For an E0 null: the archived run whose rows it must reproduce, i.e. gate
   * (a)'s `--reference`. Both sides are replayed by the port, so the identity
   * proved here is the port's own R3 at the archived configurations.
   */
  readonly r3Reference?: string;
}

/** The three-arm runs plan §8 adds to §5.3's working set for WP9 acceptance. */
const ACCEPTANCE_ONLY: readonly string[] = [
  "present-day-three-arm/A-seed44",
  "present-day-three-arm/B-seed44",
  "present-day-three-arm/C-seed44",
];

function classify(runDir: string): { cls: ReplayClass; r3Reference?: string } {
  const [family, run] = runDir.split("/") as [string, string];
  if (family === "present-day-three-arm") {
    return { cls: "pre-e" };
  }
  const nullMatch = /^E0null-([ABC])-(?:n\d+-)?seed(\d+)$/u.exec(run);
  if (nullMatch !== null) {
    return {
      cls: "null",
      r3Reference: `present-day-three-arm/${nullMatch[1]}-seed${nullMatch[2]}`,
    };
  }
  if (run.startsWith("ER-")) {
    return { cls: "er" };
  }
  if (run.startsWith("SE-") || run.startsWith("SEnc-") || run.startsWith("SE2")) {
    return { cls: "se" };
  }
  throw new Error(
    `working-set-replay: cannot classify ${runDir}. Add it explicitly rather than letting a ` +
      "run be graded by the wrong certified script.",
  );
}

function toTarget(entry: WorkingSetEntry | { runDir: string; why: string }, inWorkingSet: boolean): ReplayTarget {
  const [archive, run] = entry.runDir.split("/") as [string, string];
  return {
    runDir: entry.runDir,
    archive,
    run,
    inWorkingSet,
    why: entry.why,
    ...classify(entry.runDir),
  };
}

/**
 * The WP9 replay set: every member of the curated working set, plus the
 * three-arm seed-44 column plan §8's acceptance line names.
 *
 * Derived from `WORKING_SET` rather than re-listed, so the two cannot drift.
 * `wp9-working-set-replay.test.ts` asserts that every `WORKING_SET` entry has a
 * target here — a run silently dropping out of the replay set is precisely the
 * quiet coverage loss this project keeps re-learning about.
 */
export const WP9_REPLAY_TARGETS: readonly ReplayTarget[] = [
  ...WORKING_SET.map((e) => toTarget(e, true)),
  ...ACCEPTANCE_ONLY.map((runDir) =>
    toTarget(
      {
        runDir,
        why:
          "plan §8 WP9 acceptance names A/B/C seeds 42–44; §5.3's 40 MB working set stops at " +
          "seed 43, so the seed-44 column is replayed from the full archive and is not a " +
          "working-set member.",
      },
      false,
    ),
  ),
];

/** Absolute path of an archived run directory (honours `WEBSIM_ARCHIVE_ROOT`). */
export function targetDir(t: ReplayTarget, archiveRoot = describeArchive().root): string {
  return path.join(archiveRoot, ...t.runDir.split("/"));
}

// ---------------------------------------------------------------------------
// The configuration, from the archived executed manifest
// ---------------------------------------------------------------------------

export type ArmLetter = "A" | "B" | "C";

export interface BuiltTargetConfig {
  readonly config: RunConfig;
  /** Names taken verbatim from the archived manifest. */
  readonly fromManifest: readonly string[];
  /** Names filled from `ContextCreator`'s fallback, with the value used. */
  readonly fromFallback: Readonly<Record<string, number>>;
  /**
   * Which shelter table the run executed against — the capacity family, taken
   * from `resolveScenario`'s own chain rather than from the directory name.
   */
  readonly arm: ArmLetter;
  /** The resolved scenario name, so the arm letter can be checked, not trusted. */
  readonly scenarioName: string;
  readonly seed: number;
}

/**
 * The shelter CSV each capacity family reads, from
 * `engine/src/world/scenario.ts`'s chain.
 *
 * Derived from the resolved scenario rather than from `scenarioCode` directly,
 * because the code→arm mapping is not the identity beyond arm C: the
 * Scenario-E severity *labels* 18/19/20 run over arms A/C/D's shelter tables,
 * and code 7 (arm D) and 20 both read arm B's. `SCENARIO_CHAIN` is the one
 * place that mapping lives, and a code that resolves to a table outside this
 * map is a hard error rather than a guess.
 */
const ARM_OF_SHELTER_FILE: Readonly<Record<string, ArmLetter>> = {
  "shelters_2026_current_placement.csv": "A",
  "shelters_2026_expanded_capacity.csv": "B",
  "shelters_2026_expanded_plus_new_sites.csv": "C",
};

/**
 * Build one run's `RunConfig` from its archived executed manifest.
 *
 * Every one of the 41 names is resolved in exactly one of two ways and the
 * provenance of each is returned: the manifest carried it, or
 * `ContextCreator.{int,double}Param` would have supplied its documented
 * behaviour-preserving default. A name in neither category — one of
 * {@link NO_FALLBACK_PARAMS} — is a hard error, because a manifest that omits
 * `numAgents` describes a run that cannot be reconstructed and guessing would
 * make the reconstruction a fiction.
 */
export function buildTargetConfig(t: ReplayTarget, archiveRoot?: string): BuiltTargetConfig {
  const manifest = JSON.parse(
    readFileSync(path.join(targetDir(t, archiveRoot), "simulation.json"), "utf8"),
  ) as { reproducibility?: { parameters?: Record<string, number> } };
  const params = manifest.reproducibility?.parameters;
  if (params === undefined) {
    throw new Error(`${t.runDir}/simulation.json has no reproducibility.parameters block`);
  }

  const raw: Record<string, number> = {};
  const fromManifest: string[] = [];
  const fromFallback: Record<string, number> = {};
  for (const name of PARAM_NAMES) {
    const executed = params[name];
    if (executed !== undefined) {
      raw[name] = executed;
      fromManifest.push(name);
      continue;
    }
    if (NO_FALLBACK_PARAMS.includes(name)) {
      throw new Error(
        `${t.runDir}: the manifest omits '${name}', which ContextCreator reads with NO fallback. ` +
          "A replay may not invent it.",
      );
    }
    const fallback = JAVA_CODE_DEFAULTS[name];
    if (fallback === undefined) {
      throw new Error(`${t.runDir}: manifest lacks ${name} and there is no documented code fallback`);
    }
    raw[name] = fallback;
    fromFallback[name] = fallback;
  }

  const config = parseRunConfig(raw, `archived manifest ${t.runDir}`);
  // `SCENARIO_CHAIN` directly rather than `resolveScenario`, which needs a
  // filesystem probe for the `_elayer` rewrite. The rewrite changes the pet
  // policy inside a table, never which capacity family it is, so the base entry
  // is the right operand and the probe would only add a dependency.
  const scenario = SCENARIO_CHAIN.find((e) => e.code === config.scenarioCode);
  if (scenario === undefined) {
    throw new Error(
      `${t.runDir}: scenarioCode ${config.scenarioCode} matches no entry in SCENARIO_CHAIN. ` +
        "Java's chain falls through to arm A here; a REPLAY must not, because a fell-through " +
        "code means the archived run is not the run this target names.",
    );
  }
  const arm = ARM_OF_SHELTER_FILE[scenario.sheltersFile];
  if (arm === undefined) {
    throw new Error(
      `${t.runDir}: scenarioCode ${config.scenarioCode} resolves to ` +
        `${scenario.sheltersFile}, which is not one of the A/B/C capacity families. ` +
        "Add it to ARM_OF_SHELTER_FILE deliberately rather than letting the cross-arm gate guess.",
    );
  }
  return {
    config,
    fromManifest,
    fromFallback,
    arm,
    scenarioName: scenario.scenarioName,
    seed: config.randomSeed,
  };
}

// ---------------------------------------------------------------------------
// The closures graft
// ---------------------------------------------------------------------------

export interface ClosureCensus {
  readonly code: number;
  readonly schedule_file: string | null;
  readonly scheduled_undirected_edges: number | null;
  readonly matching_graph_edges: number | null;
  readonly wave_hours: readonly number[] | null;
  readonly blocked_edges_at_end: number | null;
  readonly closure_version_at_end: number | null;
}

interface LiveClosureRuntime {
  readonly blockedEdgeCount: number;
  readonly closureVersion: number;
  readonly schedule: {
    readonly csvPath: string;
    readonly scheduledEdges: number;
    readonly matchingGraphEdges: number;
    readonly waveHours: readonly number[];
  };
}

/**
 * The `closures` block Java's `OutcomeLogger` would have written, read out of
 * the live engine objects at end of run.
 *
 * `blocked_edges_at_end` comes off the **network**
 * (`ClosureRuntime.blockedEdgeCount`), never off the CSV — WP8-SPEC-archive-gates
 * §3.4's requirement of the producer — which is what keeps gate (k) a
 * comparison between the engine and the schedule rather than between the
 * schedule and itself.
 */
export function liveClosureCensus(code: number, runtime: LiveClosureRuntime | null): ClosureCensus {
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

/** The exact line `engine/src/output/logger.ts` hardcodes. */
export const HARDCODED_CLOSURES_LINE = '  "closures": {"code": 0},';

/**
 * Splice a live closure census into the engine's `simulation.json` text.
 *
 * Throws when the hardcoded line is not found. That is the point: if the logger
 * ever starts writing a real block, this graft must fail loudly so somebody
 * removes it, rather than silently returning an ungrafted manifest that turns
 * gate (k) into a check on the literal `{"code": 0}`.
 */
export function graftClosureBlock(simulationJson: string, census: ClosureCensus): string {
  const replaced = simulationJson.replace(
    HARDCODED_CLOSURES_LINE,
    `  "closures": ${JSON.stringify(census)},`,
  );
  if (replaced === simulationJson) {
    throw new Error(
      "graftClosureBlock: could not find engine/src/output/logger.ts's hardcoded " +
        `${JSON.stringify(HARDCODED_CLOSURES_LINE)} line. If the logger now writes a real ` +
        "closures block, DELETE this graft instead of loosening the match.",
    );
  }
  return replaced;
}

// ---------------------------------------------------------------------------
// Running one target
// ---------------------------------------------------------------------------

export interface ReplayedRun {
  readonly target: ReplayTarget;
  readonly built: BuiltTargetConfig;
  /** The port's three documents, with the closures graft applied when it fired. */
  readonly docs: RunDocuments;
  /** The port's documents exactly as the engine wrote them, no graft. */
  readonly rawDocs: RunDocuments;
  readonly view: RunView;
  /** The archived Java run, read straight off `docs/runs/`. */
  readonly archivedView: RunView;
  readonly closures: ClosureCensus;
  readonly grafted: boolean;
  readonly runMs: number;
}

export interface ReplayOptions {
  readonly archiveRoot?: string;
  readonly sourceIntegrity?: SourceIntegrity;
  /**
   * `reproducibility.input_datasets`. Absent leaves it empty, which is
   * `headless.ts`'s honest default and which gate (j) correctly fails.
   * {@link assetInputDatasets} builds a true one from the asset manifest.
   */
  readonly inputDatasets?: readonly DatasetDigest[];
  /** Exposed so a caller can hold the engine objects; defaults to discarding them. */
  readonly onResult?: (t: ReplayTarget, r: HeadlessResult) => void;
}

/**
 * `input_datasets` for a replay, from the **asset build's own record** of where
 * each packed asset came from.
 *
 * The port does not read `Geography/data/airnow/*.csv` at run time — it reads
 * `pipeline/out/assets/smoke-{code}.json`, which `build-smoke` produced from
 * that CSV and recorded the source path and source SHA-256 for. Naming the CSV
 * here is therefore a true statement about this run's provenance, not a
 * borrowed one: those exact bytes are what the series is.
 *
 * Gate (j)'s first sub-check is what needs it — *"manifest checksums the severe
 * series it read"* — and without it the check fails on every severe replay for
 * the reason "the port never said", which is the same shape as the gate-(h)
 * failure `validation/src/provenance.ts` exists to fix.
 *
 * **Deliberately partial, and it says so.** Only the run-selected data inputs
 * are listed: the smoke series, and the closure schedule when one is scheduled.
 * The graph, the shelter table and the registry reach the run through other
 * packed assets whose digests the report carries separately
 * (`assets.entries`). A caller must not read this as Java's full 13-file
 * census.
 */
export function assetInputDatasets(
  config: RunConfig,
  assetsManifestPath: string,
): readonly DatasetDigest[] {
  if (!existsSync(assetsManifestPath)) return [];
  const manifest = JSON.parse(readFileSync(assetsManifestPath, "utf8")) as {
    assets?: Record<string, { source_file?: string; source_sha256?: string }>;
  };
  const assets = manifest.assets ?? {};
  const wanted = [`assets/smoke-${config.smokeSeriesCode}.json`];
  const closures = resolveClosuresCsv(config.closuresCode, config.closureDraw);
  if (closures !== null) wanted.push(`assets/${closures}`);

  const out: DatasetDigest[] = [];
  for (const key of wanted) {
    const entry = assets[key];
    const source = entry?.source_file;
    const sha = entry?.source_sha256;
    if (source === undefined || sha === undefined) continue;
    // The archive names inputs relative to `Geography/`; the asset manifest
    // names them relative to the repository root.
    out.push({ file: source.replace(/^Geography\//u, ""), sha256: sha });
  }
  return out;
}

/**
 * Replay one archived configuration through the TS engine and pair the result
 * with the archived Java bytes.
 *
 * `runHeadlessAsync` rather than `runHeadless`: a 6,842-agent 455-hour run is
 * 45 s of uninterrupted synchronous work, and vitest answers its heartbeat RPC
 * on the same thread — a file chaining seventeen of them reports a timeout as
 * an unhandled error *alongside* passing tests. Slicing is proved bit-identical
 * in `wp8-r3-own-engine.test.ts`.
 */
export async function replayTarget(t: ReplayTarget, o: ReplayOptions = {}): Promise<ReplayedRun> {
  const built = buildTargetConfig(t, o.archiveRoot);
  const started = performance.now();
  const result = await runHeadlessAsync({
    config: built.config,
    paramNames: PARAM_NAMES,
    env: {
      ...(o.sourceIntegrity === undefined ? {} : { sourceIntegrity: o.sourceIntegrity }),
      ...(o.inputDatasets === undefined ? {} : { inputDatasets: o.inputDatasets }),
    },
  });
  const runMs = performance.now() - started;
  o.onResult?.(t, result);

  const census = liveClosureCensus(
    built.config.closuresCode,
    result.sim.closures as LiveClosureRuntime | null,
  );
  const rawDocs: RunDocuments = {
    name: `TS ${t.runDir}`,
    agentsCsv: result.parity.agentsCsv,
    sheltersCsv: result.parity.sheltersCsv,
    simulationJson: result.parity.simulationJson,
  };
  // Grafting a `{"code": 0}` census over a `{"code": 0}` literal would be a
  // no-op that still reported `grafted: true`, so code 0 is left alone and the
  // flag stays honest.
  const grafted = census.code !== 0;
  const docs: RunDocuments = grafted
    ? { ...rawDocs, simulationJson: graftClosureBlock(rawDocs.simulationJson, census) }
    : rawDocs;

  return {
    target: t,
    built,
    docs,
    rawDocs,
    view: runFromDocuments(docs),
    archivedView: loadRunDir(targetDir(t, o.archiveRoot), `JAVA ${t.runDir}`),
    closures: census,
    grafted,
    runMs,
  };
}
