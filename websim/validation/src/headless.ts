/**
 * The headless Node runner (plan WP7) — one function that takes a `RunConfig`
 * and gives back a finished run plus both output flavours.
 *
 * It is deliberately *thin*. Everything it does is either (a) reading bytes off
 * disk, which the browser does over `fetch` instead, or (b) calling the same
 * engine entry points the worker will call. There is no headless-only code path
 * inside the model: if this runner and the browser disagree, the disagreement
 * is in asset loading, which is exactly where the asset manifest's digest check
 * is designed to catch it.
 *
 * Two things it does NOT do, and both are honesty rather than laziness:
 *
 *  - It does not compute SHA-256s of the Java input files or ask git anything.
 *    Those manifest fields are environment facts (`OutputEnvironment`), and a
 *    runner that quietly invented them would make `simulation.json` look
 *    reproducible when it is not. They default to the explicit placeholder
 *    `"unavailable"` / `"n/a"`, which is also what the certified writer emits
 *    when its own lookup fails.
 *  - It does not emit `street_network_validation` or `governance`. The engine
 *    consumes a pre-baked graph and a pre-validated registry, so it has no
 *    `ValidationReport` and no `ScienceRegistry` object — and Java omits both
 *    blocks when those are null, so omitting them is the *faithful* behaviour,
 *    not a gap.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { unpackGeometry, unpackTopology, type GraphGeometry } from "@websim/shared/graph-asset";
import type { RunConfig } from "@websim/shared";

import { buildRoutingGraph, type RoutingGraph } from "@websim/engine/graph";
import { buildSegmentGeometry, type SegmentGeometry } from "@websim/engine/graph";
import { DegreeSpaceNodeIndex } from "@websim/engine/graph";
import { decodeCsvBytes, readCsvText, type CsvRow } from "@websim/engine/loader";
import { buildWorld, type WorldBuildResult, type WorldDataSource } from "@websim/engine/world";
import { SmokeField, type SmokeSeriesAsset } from "@websim/engine/smoke";
import { Simulation, type AgentOrder } from "@websim/engine/sim";
import {
  writeRunOutputs,
  type ManifestParameter,
  type OutputEnvironment,
  type RunOutcome,
  type RunOutputs,
} from "@websim/engine/output";

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

export const ASSET_DIR = here("../../pipeline/out/assets");
export const GEOGRAPHY_DIR = here("../../../Geography");

/** True when the git-ignored packed graph asset is present. */
export function headlessAssetsPresent(): boolean {
  return existsSync(`${ASSET_DIR}/graph-topology.bin`) && existsSync(`${ASSET_DIR}/graph-geometry.bin`);
}

export interface LoadedAssets {
  readonly graph: RoutingGraph;
  readonly geometry: GraphGeometry;
  readonly seg: SegmentGeometry;
  readonly snapIndex: DegreeSpaceNodeIndex;
}

let cachedAssets: LoadedAssets | null = null;

/**
 * Load (and memoise) the packed graph, its polyline geometry, the per-edge
 * cumulative-length arrays and the degree-space snapping index.
 *
 * The segment geometry is the expensive part (DR-S3 §3: 530–612 ms for 550,142
 * `Inverse` calls). It is a one-time load cost in the browser worker too, so
 * memoising it here mirrors the shipped shape rather than flattering the
 * benchmark: per-run timings below exclude it and say so.
 */
export function loadAssets(): LoadedAssets {
  if (cachedAssets === null) {
    const topology = unpackTopology(new Uint8Array(readFileSync(`${ASSET_DIR}/graph-topology.bin`)));
    const graph = buildRoutingGraph(topology);
    const geometry = unpackGeometry(
      new Uint8Array(readFileSync(`${ASSET_DIR}/graph-geometry.bin`)),
      topology,
    );
    cachedAssets = {
      graph,
      geometry,
      seg: buildSegmentGeometry(graph, geometry),
      snapIndex: new DegreeSpaceNodeIndex(graph),
    };
  }
  return cachedAssets;
}

/** A {@link WorldDataSource} over the read-only `Geography/` tree. */
export function geographyDataSource(): WorldDataSource {
  const cache = new Map<string, readonly CsvRow[]>();
  return {
    exists(path: string): boolean {
      return existsSync(`${GEOGRAPHY_DIR}/${path}`);
    },
    readCsv(path: string): readonly CsvRow[] {
      const hit = cache.get(path);
      if (hit !== undefined) {
        return hit;
      }
      const rows = readCsvText(decodeCsvBytes(readFileSync(`${GEOGRAPHY_DIR}/${path}`)));
      cache.set(path, rows);
      return rows;
    },
  };
}

export function loadSmokeAsset(seriesCode: number): SmokeSeriesAsset {
  return JSON.parse(
    readFileSync(`${ASSET_DIR}/smoke-${seriesCode}.json`, "utf8"),
  ) as SmokeSeriesAsset;
}

/**
 * The 41-name parameter manifest, with each name's declared Java type.
 *
 * The type matters because `jsonVal` calls `Object.toString()`: a Repast
 * `Integer` renders `6842`, a `Double` renders `1.0`. Getting this wrong makes
 * the manifest diff noisily against the archive for no modelling reason, so the
 * int set is written out rather than inferred from whether a value happens to be
 * integral (`smokeScale = 1.0` is a double and must print `1.0`).
 */
const INT_PARAMS = new Set<string>([
  "numAgents",
  "simulationHours",
  "randomSeed",
  "scenarioCode",
  "enableHeterogeneity",
  "respectShelterOpeningDates",
  "enableDecisionLayer",
  "informationRegime",
  "enableHazardDeparture",
  "petPolicyDefault",
  "shelterPolicyVariant",
  "smokeSeriesCode",
  "closuresCode",
  "closureDraw",
]);

export function manifestParameters(
  config: RunConfig,
  names: readonly string[],
): readonly ManifestParameter[] {
  return names.map((name) => ({
    name,
    value: (config as unknown as Record<string, number>)[name]!,
    kind: INT_PARAMS.has(name) ? ("int" as const) : ("double" as const),
  }));
}

export interface HeadlessOptions {
  readonly config: RunConfig;
  readonly paramNames: readonly string[];
  readonly agentOrder?: AgentOrder;
  /**
   * Re-seeds the Repast default stream **after** the world build and before the
   * first tick, so the run draws a *different* within-tick permutation sequence
   * while every build-time draw stays bit-identical.
   *
   * This exists for exactly one purpose: the order-permutation census
   * (`validation/scripts/order-permutation-census.ts`), which has to sample the
   * distribution of Java-vs-TS divergence that divergence 1 predicts. It is
   * legitimate precisely because the default stream has only two draw sites
   * (`world/build.ts:415`, one camp draw per resident, all of them before tick 1;
   * and `sim.ts:153`, the per-tick shuffle) — so moving the stream between them
   * changes the permutation channel and nothing else. `undefined` leaves the
   * stream exactly where the build left it, which is the certified-faithful path
   * and the only one any gate runs on.
   */
  readonly shuffleStreamSeed?: number;
  /**
   * Substitutes the world data source. Defaults to {@link geographyDataSource},
   * i.e. the read-only `Geography/` tree.
   *
   * The only current caller is the R3 closures-inert proof
   * (`harness/r3-own-engine.ts`), which needs a closure schedule whose every
   * activation hour lands at or after the run end so that
   * `hasClosureSchedule()` is true, `ClosureRuntime` is built and `routeNodes`
   * is allocated while **no wave ever fires**. `Geography/` holds no such file
   * and is read-only, so the schedule is derived from a certified one and
   * overlaid here rather than written into the instrument tree.
   */
  readonly data?: WorldDataSource;
  /**
   * Runs after the world build and `Simulation` construction and **before tick
   * 1** — the moment `ContextCreator` finishes and Repast starts the schedule.
   *
   * This is a harness seam, not a model seam, and it is **optional in both
   * directions**. `Simulation`'s constructor performs `ContextCreator.java`'s
   * step 11 (`setDecisionLayer` over `createdResidents`) itself, so a run that
   * passes no `beforeRun` still gets a fully armed decision layer whenever
   * `enableDecisionLayer` says so — that is the shipped path, and it is what
   * `validation/test/wp8-r3-own-engine.test.ts`'s `SHIPPED` cases measure by
   * leaving this hook `undefined`.
   *
   * It exists because that call site once did not: for most of WP8 `armResident`
   * was exported and unit-tested while `engine/src/sim.ts` invoked it nowhere,
   * so every full-engine run executed the WP7 legacy path whatever
   * `enableDecisionLayer` said, and the R3 flagship could only be measured
   * against a live layer by arming the residents from outside.
   *
   * It is kept, wired engine and all, because "the layer is armed" is a claim a
   * *caller* should be able to make, count and cross-check rather than inherit:
   * `harness/r3-own-engine.ts#armFromWorld` re-applies step 11 from the same
   * sampled attributes, asserts its `DecisionConfig` field-for-field against
   * `world.decisionConfig` first, and returns a count the suite asserts on. This
   * is the only place a caller can reach the world and the simulation together
   * at the exact moment `ContextCreator` finishes. Every use is labelled;
   * nothing outside the validation harness calls it.
   */
  readonly beforeRun?: ((sim: Simulation, world: WorldBuildResult) => void) | undefined;
  readonly env?: Partial<OutputEnvironment>;
  readonly onHour?: ((hour: number, tick: number) => void) | undefined;
}

export interface HeadlessResult {
  readonly world: WorldBuildResult;
  readonly sim: Simulation;
  readonly outcome: RunOutcome;
  readonly parity: RunOutputs;
  readonly v2: RunOutputs;
  /** Wall-clock milliseconds, split so the one-time asset cost is never hidden. */
  readonly timings: {
    readonly assetsMs: number;
    readonly buildMs: number;
    readonly runMs: number;
    readonly outputMs: number;
  };
}

export function runHeadless(options: HeadlessOptions): HeadlessResult {
  const built = buildHeadless(options);
  const tRun = performance.now();
  built.sim.run();
  return finishHeadless(built, options, performance.now() - tRun);
}

/**
 * {@link runHeadless}, driving the tick loop in slices and yielding to the
 * event loop between them.
 *
 * **Bit-identical to the synchronous form.** `Simulation.runUntil` resumes from
 * its own `tick` counter and nothing in the model observes where a call
 * boundary fell, so `runUntil(600); runUntil(1200)` executes exactly the ticks
 * `run()` would, in exactly the same order, with exactly the same RNG draws.
 * The suite asserts that rather than asserting it in prose
 * (`test/wp8-r3-own-engine.test.ts`, "slicing the tick loop is bit-identical").
 *
 * It exists because a 6,842 x 312 h run is one uninterrupted synchronous block
 * of 15-60 s, and vitest's worker answers a heartbeat RPC on the same thread:
 * a file that chains twenty of them reports `Timeout calling "onTaskUpdate"` as
 * an unhandled error and exits non-zero even with every assertion green.
 * Observed on this tree at 175 s and again at 520 s. Yielding once per
 * simulated day keeps the longest block near a second.
 */
export async function runHeadlessAsync(
  options: HeadlessOptions & { readonly sliceTicks?: number },
): Promise<HeadlessResult> {
  const built = buildHeadless(options);
  const slice = options.sliceTicks ?? built.world.ticksPerHour * 24;
  if (!Number.isInteger(slice) || slice < 1) {
    throw new RangeError(`sliceTicks must be a positive integer, got ${String(slice)}`);
  }
  const tRun = performance.now();
  for (let stop = slice; ; stop += slice) {
    built.sim.runUntil(stop);
    if (built.sim.tick >= built.world.endTick) {
      break;
    }
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
  return finishHeadless(built, options, performance.now() - tRun);
}

interface BuiltRun {
  readonly world: WorldBuildResult;
  readonly sim: Simulation;
  readonly smoke: SmokeField;
  readonly assetsMs: number;
  readonly buildMs: number;
}

/** Everything up to (and not including) the first tick. */
function buildHeadless(options: HeadlessOptions): BuiltRun {
  const { config } = options;

  const tAssets = performance.now();
  const assets = loadAssets();
  const assetsMs = performance.now() - tAssets;

  const smokeAsset = loadSmokeAsset(config.smokeSeriesCode);
  const smoke = SmokeField.fromAsset(smokeAsset, config.smokeScale);

  const tBuild = performance.now();
  const world = buildWorld(config, {
    graph: assets.graph,
    data: options.data ?? geographyDataSource(),
    smokeHours: smoke.hours(),
    snapIndex: assets.snapIndex,
    // The governance gate runs at asset-build time (`build-registry.ts` fails
    // the asset build on a bad registry), which is step 4 moved offline.
    registryValidated: true,
  });
  const buildMs = performance.now() - tBuild;

  // Order-permutation census only; see `HeadlessOptions.shuffleStreamSeed`. The
  // build is already finished at this point, so its draws are untouched.
  if (options.shuffleStreamSeed !== undefined) {
    world.streams.defaultStream.setSeed(options.shuffleStreamSeed);
  }

  const sim = new Simulation({
    world,
    graph: assets.graph,
    geometry: assets.geometry,
    seg: assets.seg,
    smoke,
    walkingSpeedMps: config.walkingSpeedMps,
    evacuationThresholdUgM3: config.evacuationThresholdUgM3,
    agentOrder: options.agentOrder ?? "shuffle-mt",
    onHour: options.onHour,
  });

  // ContextCreator finishes here; Repast's schedule has not started. See
  // `HeadlessOptions.beforeRun` for why this seam exists at all.
  options.beforeRun?.(sim, world);

  return { world, sim, smoke, assetsMs, buildMs };
}

/** Everything after the last tick: the manifest, both output flavours. */
function finishHeadless(
  built: BuiltRun,
  options: HeadlessOptions,
  runMs: number,
): HeadlessResult {
  const { config } = options;
  const { world, sim, smoke, assetsMs, buildMs } = built;

  const env: OutputEnvironment = {
    simId: "sim-headless",
    commit: "unknown",
    dataVersionTag: "unavailable",
    javaVersion: "n/a",
    repastVersion: "2.11.0",
    generatedTimestamp: "n/a",
    inputDatasets: [],
    sourceIntegrity: null,
    ...options.env,
  };

  const outcome: RunOutcome = {
    residents: sim.residents,
    shelters: world.shelters,
    seed: config.randomSeed,
    minutesPerTick: config.minutesPerTick,
    scenarioName: world.scenario.scenarioName,
    parameters: manifestParameters(config, options.paramNames),
    smokeCounty: smoke.county,
    smokeStart: "2020-09-07T00:00",
    smokeHours: smoke.hours(),
    smokePeakHourly: smoke.peakHourly(),
    outOfRangeLookups: smoke.outOfRangeLookups,
    populationMarginals: world.populationMarginals,
    decisionMarginals: world.decisionMarginals,
    env,
  };

  const tOut = performance.now();
  const parity = writeRunOutputs(outcome, "parity");
  const v2 = writeRunOutputs(outcome, "v2-web");
  const outputMs = performance.now() - tOut;

  return {
    world,
    sim,
    outcome,
    parity,
    v2,
    timings: { assetsMs, buildMs, runMs, outputMs },
  };
}
