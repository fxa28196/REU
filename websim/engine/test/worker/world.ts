/**
 * A synthetic but **fully exercised** world, built through the real
 * `buildWorld()` and driven by the real `Simulation`.
 *
 * ## Why synthetic, and what "synthetic" does and does not mean here
 *
 * The WP10 acceptance criteria have to be measured **in a browser worker**, and
 * a browser worker cannot read `Geography/` — the encampment feed is
 * deliberately not a public asset (plan §4, Q4), and the packed graph is 12 MB
 * of git-ignored build output. So the world here is generated in memory.
 *
 * What is *not* synthetic is any part of the engine. The CSVs below are parsed
 * by the ported `CsvLoader`, resolved through `resolveScenario`'s real path
 * chain, and handed to the real 12-step `buildWorld` — same samplers, same four
 * RNG streams, same `ContextCreator` step 11 arming, same `ClosureRuntime`. Only
 * the *bytes* are invented. A snapshot bug in the engine is therefore fully
 * reachable from here; only an asset-decoding bug is not, and that is covered by
 * the Node suites that run on the real 88,100-node graph.
 *
 * ## The world is tuned to reach the state a snapshot has to carry
 *
 * A snapshot-replay property over a world where nothing happens proves nothing.
 * {@link assertWorldIsExercised} is the gate on that: it fails unless the run
 * actually produced admissions, refusals, at least four distinct resident
 * states, non-empty belief sets, advanced per-agent decision streams, fired
 * closure waves and a non-empty blocked set. Every acceptance test calls it, so
 * a change that quietly makes the world trivial turns the property tests red
 * instead of leaving them green and vacuous.
 *
 * Layout:
 *
 * ```
 *   main 20 x 20 four-connected grid          island: 4 nodes, no bridge
 *   node index = row * 20 + col               indices 400..403
 *   node id    = 5000 + index                 ids 5400..5403
 * ```
 *
 * The island exists so `UNREACHABLE` is reachable: camps placed on it can see no
 * shelter at all, which is a state the main grid alone never produces.
 */

import { geodesicDistanceM } from "../../src/geo/geodesic.js";
import type { GraphGeometry, GraphTopology } from "@websim/shared/graph-asset";
import type { SmokeSeriesAsset } from "../../src/smoke/field.js";
import { buildSimulation, makeAssetBundle, type SimBundle, type SimRunConfig } from "../../src/worker/build.js";
import { buildRoutingGraph } from "../../src/graph/csr.js";
import { decodeCsvBytes, readCsvText, type CsvRow } from "../../src/loader/csv.js";
import type { WorldDataSource } from "../../src/world/build.js";
import type { Simulation } from "../../src/sim.js";
import { runCensus, type RunCensus } from "../../src/worker/census.js";

export const GRID = 20;
export const MAIN_NODES = GRID * GRID;
export const ISLAND_NODES = 4;
export const NODE_COUNT = MAIN_NODES + ISLAND_NODES;
export const NODE_ID_BASE = 5000;

/** Portland-ish, so the geodesic runs on realistic latitudes. */
export const LON0 = -122.68;
export const LAT0 = 45.52;
/** ~312 m per grid step at this latitude — long enough that a typical walk
 * spans more than one simulated hour, which is what puts residents mid-route
 * when a closure wave lands. */
export const DLON = 0.004;
export const DLAT = 0.0028;

export const SHELTERS_CSV_PATH = "data/shelters/shelters_2026_current_placement.csv";
export const CLOSURES_CSV_PATH = "data/closures/closures_E_r1.csv";
export const ENCAMPMENTS_CSV_PATH = "data/encampments/irp_campsite_reports_sample.csv";

export function nodeLon(index: number): number {
  if (index >= MAIN_NODES) {
    // Far enough away that no snap ever confuses the island with the grid.
    return LON0 + 0.4 + (index - MAIN_NODES) * DLON;
  }
  return LON0 + (index % GRID) * DLON;
}

export function nodeLat(index: number): number {
  if (index >= MAIN_NODES) {
    return LAT0 + 0.4;
  }
  return LAT0 + Math.floor(index / GRID) * DLAT;
}

/** The 4-connected grid plus the island chain, in a deterministic edge order. */
export function synthTopology(): GraphTopology {
  const edgeFrom: number[] = [];
  const edgeTo: number[] = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const i = r * GRID + c;
      if (c + 1 < GRID) {
        edgeFrom.push(i);
        edgeTo.push(i + 1);
      }
      if (r + 1 < GRID) {
        edgeFrom.push(i);
        edgeTo.push(i + GRID);
      }
    }
  }
  for (let k = 0; k < ISLAND_NODES - 1; k++) {
    edgeFrom.push(MAIN_NODES + k);
    edgeTo.push(MAIN_NODES + k + 1);
  }
  const edgeCount = edgeFrom.length;

  const nodeId = new Int32Array(NODE_COUNT);
  const lon = new Float64Array(NODE_COUNT);
  const lat = new Float64Array(NODE_COUNT);
  for (let i = 0; i < NODE_COUNT; i++) {
    nodeId[i] = NODE_ID_BASE + i;
    lon[i] = nodeLon(i);
    lat[i] = nodeLat(i);
  }

  const edgeLengthM = new Float64Array(edgeCount);
  for (let e = 0; e < edgeCount; e++) {
    const a = edgeFrom[e]!;
    const b = edgeTo[e]!;
    edgeLengthM[e] = geodesicDistanceM(lon[a]!, lat[a]!, lon[b]!, lat[b]!);
  }

  // CSR in node order; within a node, features in ascending feature index —
  // the same "as-loaded feature order" rule the packed asset obeys.
  const buckets: number[][] = Array.from({ length: NODE_COUNT }, () => []);
  for (let e = 0; e < edgeCount; e++) {
    buckets[edgeFrom[e]!]!.push(e + 1);
    buckets[edgeTo[e]!]!.push(-(e + 1));
  }
  const csrOffset = new Int32Array(NODE_COUNT + 1);
  const entries: number[] = [];
  for (let n = 0; n < NODE_COUNT; n++) {
    csrOffset[n] = entries.length;
    const b = buckets[n]!;
    b.sort((x, y) => Math.abs(x) - Math.abs(y));
    for (const v of b) {
      entries.push(v);
    }
  }
  csrOffset[NODE_COUNT] = entries.length;

  return {
    nodeCount: NODE_COUNT,
    edgeCount,
    nodeId,
    nodeLon: lon,
    nodeLat: lat,
    edgeFrom: Int32Array.from(edgeFrom),
    edgeTo: Int32Array.from(edgeTo),
    edgeLengthM,
    csrOffset,
    csrEntry: Int32Array.from(entries),
    census: {
      nodes: NODE_COUNT,
      edges: edgeCount,
      components: 2,
      largestComponent: MAIN_NODES,
      reattached: 0,
      syntheticSplit: 0,
    },
    corrections: [],
  } as unknown as GraphTopology;
}

/** Two-vertex polylines: every edge is a straight segment between its nodes. */
export function synthGeometry(topology: GraphTopology): GraphGeometry {
  const e = topology.edgeCount;
  const polyOffset = new Int32Array(e + 1);
  const polyLon = new Float64Array(e * 2);
  const polyLat = new Float64Array(e * 2);
  for (let i = 0; i < e; i++) {
    polyOffset[i] = i * 2;
    const a = topology.edgeFrom[i]!;
    const b = topology.edgeTo[i]!;
    polyLon[i * 2] = topology.nodeLon[a]!;
    polyLat[i * 2] = topology.nodeLat[a]!;
    polyLon[i * 2 + 1] = topology.nodeLon[b]!;
    polyLat[i * 2 + 1] = topology.nodeLat[b]!;
  }
  polyOffset[e] = e * 2;
  return { edgeCount: e, vertexCount: e * 2, polyOffset, polyLon, polyLat };
}

/**
 * Four shelters, capacities deliberately far below the population so admission
 * contention (and therefore `REFUSED_ALL_FULL`, belief sets and the shuffle's
 * only observable channel) is reached in every run.
 */
export const SHELTER_NODES = [0, GRID - 1, MAIN_NODES - GRID, MAIN_NODES - 1] as const;
export const SHELTER_CAPACITIES = [12, 8, 10, 6] as const;

export function sheltersCsv(): string {
  const lines = ["shelter_id,name,capacity,status,lon,lat,pet_intake,adults_only"];
  for (let i = 0; i < SHELTER_NODES.length; i++) {
    const node = SHELTER_NODES[i]!;
    lines.push(
      [
        `SH${i}`,
        `Shelter ${i}`,
        String(SHELTER_CAPACITIES[i]!),
        "operating",
        nodeLon(node).toFixed(6),
        nodeLat(node).toFixed(6),
        // One site refuses pets and one is adults-only, so the policy-refusal
        // counters (a separate column from capacity refusals) are non-zero.
        i === 1 ? "refuse" : "admit",
        i === 2 ? "1" : "0",
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * Camps: a dense band across the middle of the grid plus a handful on the
 * island. `inc_id`s are opaque tokens — this is synthetic data, there is nothing
 * to disclose.
 */
export function encampmentsCsv(): string {
  const lines = ["inc_id,lon,lat"];
  let k = 0;
  for (let r = 4; r < GRID - 4; r += 2) {
    for (let c = 2; c < GRID - 2; c += 2) {
      const i = r * GRID + c;
      lines.push(`synth-${k},${nodeLon(i).toFixed(6)},${nodeLat(i).toFixed(6)}`);
      k++;
    }
  }
  for (let j = 0; j < ISLAND_NODES; j++) {
    const i = MAIN_NODES + j;
    lines.push(`synth-island-${j},${nodeLon(i).toFixed(6)},${nodeLat(i).toFixed(6)}`);
  }
  return lines.join("\n") + "\n";
}

/**
 * Two waves that sever the grid's middle rows, at hours 2 and 4.
 *
 * The cuts are horizontal (every vertical edge across a row boundary), so a
 * resident already walking north when the wave lands finds its planned node
 * chain blocked — the exact condition `reactToClosureWave` adjudicates, and the
 * only way `pushedBlockages` / `reroutes` / `stuckEvents` become non-zero.
 */
export function closuresCsv(): string {
  const lines = ["node_a,node_b,activation_hour,label,kind"];
  for (const [row, hour] of [
    [7, 2],
    [12, 4],
    [4, 6],
  ] as const) {
    for (let c = 0; c < GRID; c++) {
      const a = row * GRID + c;
      const b = (row + 1) * GRID + c;
      lines.push(`${NODE_ID_BASE + a},${NODE_ID_BASE + b},${hour},SYNTH-R${row},arterial`);
    }
  }
  return lines.join("\n") + "\n";
}

/**
 * A smoke series that crosses the 55.5 µg/m³ threshold at hour 1 and stays
 * above it, so the legacy latch and the hazard hazard-rate both fire.
 *
 * `slices` is `hours + 1`: the inclusive final tick reads hour index
 * `simulationHours`, and a series with exactly `simulationHours` slices books
 * fabricated zeros there. That is never-regress gotcha 3, and the build throws
 * on it rather than warning.
 */
export function smokeAsset(hours: number, gapHours: readonly number[] = []): SmokeSeriesAsset {
  const slices = hours + 1;
  const hourly: (number | null)[] = [];
  for (let h = 0; h < slices; h++) {
    // A `null` slice is the asset encoding of Java's NaN gap. A model lookup at
    // that hour returns 0.0 **and increments** `outOfRangeLookups`, which is the
    // counter gate (i) reads — the reason `frames.ts` must never use
    // `concentrationForTick` to render a frame.
    hourly.push(gapHours.includes(h) ? null : h === 0 ? 20 : 90 + 40 * Math.sin(h / 3));
  }
  return { schema: "smoke-series/1", series: 0, slices, hourly } as unknown as SmokeSeriesAsset;
}

export interface SynthWorldOptions {
  readonly numAgents?: number;
  readonly simulationHours?: number;
  readonly randomSeed?: number;
  readonly closures?: boolean;
  readonly decisionLayer?: boolean;
  /** Hours whose smoke slice is a NaN gap, so `outOfRangeLookups` moves. */
  readonly smokeGapHours?: readonly number[];
}

/**
 * A `SimRunConfig` for the synthetic world.
 *
 * Every switch that has a snapshot consequence is ON by default: heterogeneity
 * (a `PopulationSampler` stream), the decision layer (an `ELayerSampler` stream
 * plus 6,842-style per-agent streams), information regime 1 (belief sets),
 * hazard departure (per-tick Bernoullis), closures (a `ClosureRuntime`, blocked
 * set and version counter) and a triage reserve (per-shelter reserved counts).
 */
export function synthConfig(options: SynthWorldOptions = {}): SimRunConfig {
  const simulationHours = options.simulationHours ?? 12;
  return {
    numAgents: options.numAgents ?? 300,
    minutesPerTick: 1,
    simulationHours,
    randomSeed: options.randomSeed ?? 42,
    scenarioCode: 0,
    enableHeterogeneity: 1,
    respectShelterOpeningDates: 0,
    triageReserveFraction: 0.2,
    enableDecisionLayer: (options.decisionLayer ?? true) ? 1 : 0,
    pAwareInit: 0.85,
    pHeavyBelongings: 0.35,
    pHasPet: 0.25,
    pHasDependents: 0.3,
    groupSpeedDeltaMps: 0.06,
    shelterPolicyVariant: 0,
    smokeSeriesCode: 0,
    closuresCode: (options.closures ?? true) ? 1 : 0,
    closureDraw: 1,
    lambdaOutreachPerDay: 6,
    informationRegime: 1,
    enableHazardDeparture: 1,
    sigmaTheta: 1,
    alphaHazard: -1,
    bRisk: 0.4,
    wOfficial: 1.1,
    gammaVuln: 0.25,
    riskHalfLifeH: 48,
    barrierBelongings: 0.3,
    barrierPet: 0.4,
    barrierDependents: 0.5,
    petPolicyDefault: 1,
    betaTravelTime: 1,
    betaCapacityPrior: 0.2,
    // Low enough that residents whose route is cut will gamble on pushing
    // through, which is the only writer of `pushedBlockages`.
    pushThetaThreshold: -2,
    kPush: 1,
    pStuck: 0.3,
    stuckDelayH: 2,
    walkingSpeedMps: 1.3,
    evacuationThresholdUgM3: 55.5,
    smokeScale: 1,
  };
}

/** The CSV map an in-memory `WorldDataSource` (or `SimWorkerApi.init`) needs. */
export function synthCsvMap(): Record<string, string> {
  return {
    [SHELTERS_CSV_PATH]: sheltersCsv(),
    [CLOSURES_CSV_PATH]: closuresCsv(),
    [ENCAMPMENTS_CSV_PATH]: encampmentsCsv(),
  };
}

/** In-memory `WorldDataSource` over the synthetic CSV texts. */
export function memoryDataSource(csv: Record<string, string>): WorldDataSource {
  const cache = new Map<string, readonly CsvRow[]>();
  return {
    exists: (p) => Object.hasOwn(csv, p),
    readCsv: (p) => {
      const hit = cache.get(p);
      if (hit !== undefined) {
        return hit;
      }
      const text = csv[p];
      if (text === undefined) {
        throw new Error(`synthetic world has no '${p}'`);
      }
      const rows = readCsvText(decodeCsvBytes(new TextEncoder().encode(text)));
      cache.set(p, rows);
      return rows;
    },
  };
}

/**
 * Build the synthetic world end to end, through the same `buildSimulation` the
 * worker calls.
 *
 * The asset bundle is rebuilt every call rather than memoised. That costs a few
 * milliseconds on a 404-node graph and buys the thing the property tests need:
 * two "identical" worlds that share **no** mutable object, so a snapshot test
 * cannot pass because two simulations were accidentally aliasing one shelter.
 */
export function buildSynthWorld(options: SynthWorldOptions = {}): SimBundle {
  const topology = synthTopology();
  const assets = makeAssetBundle(buildRoutingGraph(topology), synthGeometry(topology));
  const config = synthConfig(options);
  return buildSimulation({
    config,
    assets,
    data: memoryDataSource(synthCsvMap()),
    smokeAsset: smokeAsset(config.simulationHours, options.smokeGapHours ?? []),
    registryValidated: true,
  });
}

/**
 * Census of what a finished run actually reached — the non-vacuity evidence.
 *
 * A thin re-export of `src/worker/census.ts`. The census lives in `src/` because
 * the browser acceptance tests need the worker to be able to *send* it; keeping
 * a second copy here would let the two drift and would let a browser test and a
 * Node test disagree about what "exercised" means.
 */
export type WorldExercise = RunCensus;

export function censusOf(sim: Simulation): RunCensus {
  return runCensus(sim);
}

/**
 * Fail unless the run reached the state a snapshot has to carry.
 *
 * Every WP10 acceptance test calls this **before** asserting byte-identity, so
 * that "the digests matched" can never mean "both runs did nothing".
 */
export function assertWorldIsExercised(
  census: WorldExercise,
  assert: (condition: boolean, message: string) => void,
): void {
  assert(census.armedResidents > 0, `decision layer never armed (${census.armedResidents})`);
  assert(census.distinctStates >= 4, `only ${census.distinctStates} distinct states reached`);
  assert(census.admissions > 0, "no resident was ever admitted");
  assert(census.refusals > 0, "no resident was ever refused (capacity never bound)");
  assert(census.policyRefusals > 0, "no pet/adults-only policy refusal occurred");
  assert(census.residentsWithBeliefs > 0, "no resident ever recorded a belief");
  assert(census.advancedDecisionStreams > 0, "no per-agent decision stream advanced");
  assert(census.movedResidents > 0, "no resident moved");
  assert(census.wavesFired > 0, "no closure wave fired");
  assert(census.blockedPairs > 0, "the blocked-edge set stayed empty");
  assert(
    census.blockagesEncountered > 0,
    "no resident ever met a blocked edge, so the closure-reaction state is untouched",
  );
}
