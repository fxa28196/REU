/**
 * Construction of a runnable simulation from assets + a `RunConfig`, with no
 * assumption about where the bytes came from.
 *
 * `validation/src/headless.ts` does the same thing over `node:fs`; this module
 * is the browser-side twin, and the split is deliberately drawn at *byte
 * acquisition* only. Everything downstream of "here are the decoded assets" is
 * the same engine entry points in the same order, so a headless/browser
 * disagreement can only come from the bytes — which is exactly where the asset
 * manifest's SHA-256 check is aimed (plan §4).
 *
 * Nothing here reads the network. {@link AssetBundle} is decoded typed arrays
 * and {@link WorldDataSource} is parsed CSV rows; the worker's transport layer
 * (`simWorker.ts`) is what turns `fetch` responses into those, and a test can
 * supply them from memory or from disk without touching this file.
 */

import type { GraphGeometry } from "@websim/shared/graph-asset";

import { buildSegmentGeometry, type SegmentGeometry } from "../graph/cumLen.js";
import type { RoutingGraph } from "../graph/csr.js";
import { DegreeSpaceNodeIndex } from "../graph/strtreeSnap.js";
import { makeScratch, type SsspScratch } from "../graph/dijkstra.js";
import { SmokeField, type SmokeSeriesAsset } from "../smoke/field.js";
import { buildWorld, type WorldBuildConfig, type WorldBuildResult, type WorldDataSource } from "../world/build.js";
import { Simulation, type AgentOrder } from "../sim.js";
import type { ClosureWaveReport } from "../closures/runtime.js";

/** Decoded graph assets — the expensive, run-independent half of a session. */
export interface AssetBundle {
  readonly graph: RoutingGraph;
  readonly geometry: GraphGeometry;
  readonly seg: SegmentGeometry;
  readonly snapIndex: DegreeSpaceNodeIndex;
  readonly scratch: SsspScratch;
}

/**
 * Derive the run-independent bundle once per worker.
 *
 * `buildSegmentGeometry` is the costly step (DR-S3 §3: 530–612 ms over the real
 * graph) and `DegreeSpaceNodeIndex` is the second; both are pure functions of
 * the graph, so a worker that runs ten configurations pays for them once. The
 * SSSP scratch is shared for the same reason `ClosureRuntime` shares one: it is
 * overwritten by every `computeTree` call and every retained tree owns its own
 * copy.
 */
export function makeAssetBundle(graph: RoutingGraph, geometry: GraphGeometry): AssetBundle {
  return {
    graph,
    geometry,
    seg: buildSegmentGeometry(graph, geometry),
    snapIndex: new DegreeSpaceNodeIndex(graph),
    scratch: makeScratch(graph),
  };
}

/**
 * The subset of a `RunConfig` this module consumes.
 *
 * Structural rather than the `RunConfig` type itself, so `@websim/engine` does
 * not take a dependency on the schema package's inferred type for what is really
 * a bag of numbers. A real `RunConfig` satisfies it.
 */
export interface SimRunConfig extends WorldBuildConfig {
  readonly walkingSpeedMps: number;
  readonly evacuationThresholdUgM3: number;
  readonly smokeScale: number;
}

export interface BuildSimulationRequest {
  readonly config: SimRunConfig;
  readonly assets: AssetBundle;
  readonly data: WorldDataSource;
  /** The smoke series named by `config.smokeSeriesCode`, already decoded. */
  readonly smokeAsset: SmokeSeriesAsset;
  /** Default `shuffle-mt`; `identity` is for engine-internal determinism tests. */
  readonly agentOrder?: AgentOrder;
  /** `true` when the governance gate ran offline (the shipped asset pipeline). */
  readonly registryValidated?: boolean;
  readonly onHour?: ((hour: number, tick: number) => void) | undefined;
  readonly onClosureWave?: ((report: ClosureWaveReport) => void) | undefined;
}

/** A built, not-yet-started simulation and the objects that carry its state. */
export interface SimBundle {
  readonly world: WorldBuildResult;
  readonly sim: Simulation;
  readonly smoke: SmokeField;
  readonly assets: AssetBundle;
  readonly config: SimRunConfig;
  readonly buildMs: number;
}

/**
 * Build a world and a `Simulation`, in the order `ContextCreator` builds them.
 *
 * The `Simulation` constructor performs `ContextCreator`'s step 11 itself, so
 * the returned bundle is fully armed whenever `enableDecisionLayer === 1`;
 * {@link SimBundle.sim}`.armedResidents` is the witness, and the worker asserts
 * on it rather than assuming it (`simHost.ts`).
 */
export function buildSimulation(req: BuildSimulationRequest): SimBundle {
  const { config, assets } = req;
  const smoke = SmokeField.fromAsset(req.smokeAsset, config.smokeScale);
  const t0 = performanceNow();
  const world = buildWorld(config, {
    graph: assets.graph,
    data: req.data,
    smokeHours: smoke.hours(),
    snapIndex: assets.snapIndex,
    scratch: assets.scratch,
    registryValidated: req.registryValidated ?? true,
  });
  const sim = new Simulation({
    world,
    graph: assets.graph,
    geometry: assets.geometry,
    seg: assets.seg,
    smoke,
    walkingSpeedMps: config.walkingSpeedMps,
    evacuationThresholdUgM3: config.evacuationThresholdUgM3,
    agentOrder: req.agentOrder ?? "shuffle-mt",
    onHour: req.onHour,
    onClosureWave: req.onClosureWave,
  });
  return { world, sim, smoke, assets, config, buildMs: performanceNow() - t0 };
}

/**
 * `performance.now()` where it exists, `Date.now()` otherwise.
 *
 * Timing only — never model state. The engine's "no `Date`" rule is about
 * *outcomes*, and no number produced here reaches a resident.
 */
export function performanceNow(): number {
  const p = (globalThis as { performance?: { now(): number } }).performance;
  return p === undefined ? Date.now() : p.now();
}
