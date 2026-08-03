/**
 * `SimWorkerApi` — the object a sim worker exposes over Comlink, and the only
 * surface the UI thread ever calls.
 *
 * It is deliberately a *thin* wrapper over {@link SimHost}: everything with
 * behaviour is in the host, which has no host-API dependency and is therefore
 * testable in Node. This class adds three things the host cannot have —
 * structured-clone-safe argument shapes, the asset decode step, and the
 * `MessagePort` plumbing for the stream.
 *
 * ## Why the payloads look the way they do
 *
 * A Comlink argument is structured-cloned. Typed arrays, `ArrayBuffer`s and
 * plain objects survive that; class instances, functions and `Map`s of objects
 * do not. So {@link AssetPayload} carries either the packed asset bytes (what
 * ships) or the decoded typed-array topology (what a synthetic test world
 * supplies), and the CSVs cross as text and are parsed **by the ported
 * `CsvLoader` inside the worker** — which is the plan's own choice (§4: "parsed
 * in-browser by the ported CsvLoader (keeps loader parity honest)"), not a
 * convenience. A client that parsed CSVs itself would be a second, unverified
 * loader.
 *
 * ## `loadAssets` is separate from `init` on purpose
 *
 * `buildSegmentGeometry` and `DegreeSpaceNodeIndex` are run-independent and cost
 * hundreds of milliseconds on the real graph (DR-S3 §3). Splitting them out
 * means a Compare screen that runs six configurations pays once, and it means
 * `init`'s reported `buildMs` is the *world* build rather than the world build
 * plus an amortised asset cost that would make every first run look slow.
 */

import { unpackGeometry, unpackTopology, type GraphGeometry, type GraphTopology } from "@websim/shared/graph-asset";

import { buildRoutingGraph } from "../graph/csr.js";
import { decodeCsvBytes, readCsvText, type CsvRow } from "../loader/csv.js";
import type { SmokeSeriesAsset } from "../smoke/field.js";
import type { AgentOrder } from "../sim.js";
import type { RunOutputs } from "../output/logger.js";

import { makeAssetBundle, performanceNow, type AssetBundle, type SimRunConfig } from "./build.js";
import type { RunOptions, RunSummary, StreamMessage } from "./protocol.js";
import { measureSsspWave, shelterSources, type SsspWaveMeasurement } from "./sssp.js";
import type { RunCensus } from "./census.js";
import { SimHost, type ExportRequest, type StreamSink } from "./simHost.js";
import type { RingStats, SnapshotRingOptions } from "./ring.js";

/** The minimum of `MessagePort` this module uses; avoids a DOM lib dependency. */
export interface StreamPort {
  postMessage(message: StreamMessage, transfer: ArrayBuffer[]): void;
}

/** Packed bytes (what ships) or already-decoded arrays (what a test supplies). */
export interface AssetPayload {
  readonly topology: ArrayBuffer | GraphTopology;
  readonly geometry: ArrayBuffer | GraphGeometry;
}

export interface AssetLoadReport {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly directedRecords: number;
  readonly vertexCount: number;
  readonly loadMs: number;
}

export interface InitPayload {
  readonly config: SimRunConfig;
  /**
   * Data-root-relative path → file text, e.g.
   * `"data/shelters/shelters_2026_current_placement.csv"`. Exactly the paths
   * `ContextCreator` asks for; a missing one fails the build the way a missing
   * file does.
   */
  readonly csv: Readonly<Record<string, string>>;
  readonly smokeAsset: SmokeSeriesAsset;
  readonly agentOrder?: AgentOrder;
  /** `true` when the governance gate ran offline (the shipped asset pipeline). */
  readonly registryValidated?: boolean;
}

function isTopology(v: ArrayBuffer | GraphTopology): v is GraphTopology {
  return !(v instanceof ArrayBuffer);
}

function isGeometry(v: ArrayBuffer | GraphGeometry): v is GraphGeometry {
  return !(v instanceof ArrayBuffer);
}

export class SimWorkerApi {
  private assets: AssetBundle | null = null;
  private host: SimHost;
  private readonly ringOptions: SnapshotRingOptions | undefined;
  /**
   * The live sink, owned here rather than by the host.
   *
   * `init()` replaces the host (see its doc), and a sink that lived on the host
   * would be dropped by that replacement — the stream would go silent on the
   * second configuration a Compare screen ran, which is a failure nothing in a
   * single-run test would notice. Every host the API creates is pointed at this
   * one indirection instead.
   */
  private sink: StreamSink = () => undefined;

  constructor(ringOptions?: SnapshotRingOptions) {
    this.ringOptions = ringOptions;
    this.host = this.newHost();
  }

  private newHost(): SimHost {
    const host = new SimHost(this.ringOptions === undefined ? {} : { ring: this.ringOptions });
    host.setSink((message, transfer) => {
      this.sink(message, transfer);
    });
    return host;
  }

  /** Route the stream to `port`. Called once, right after the worker starts. */
  subscribe(port: StreamPort): void {
    this.sink = (message, transfer) => {
      port.postMessage(message, transfer);
    };
  }

  /** Decode the graph assets. Run-independent; do it once per worker. */
  loadAssets(payload: AssetPayload): AssetLoadReport {
    const t0 = performanceNow();
    const topology = isTopology(payload.topology)
      ? payload.topology
      : unpackTopology(new Uint8Array(payload.topology));
    const graph = buildRoutingGraph(topology);
    const geometry = isGeometry(payload.geometry)
      ? payload.geometry
      : unpackGeometry(new Uint8Array(payload.geometry), topology);
    this.assets = makeAssetBundle(graph, geometry);
    return {
      nodeCount: graph.nodeCount,
      edgeCount: graph.edgeCount,
      directedRecords: graph.directedRecords,
      vertexCount: geometry.vertexCount,
      loadMs: performanceNow() - t0,
    };
  }

  get assetsLoaded(): boolean {
    return this.assets !== null;
  }

  /**
   * Build the world and the simulation from a config plus the CSV texts.
   *
   * Every run gets a **fresh host**, so a second `init` cannot inherit the first
   * run's snapshot ring, frame counters or paused state. The asset bundle is
   * kept: it is a pure function of the graph.
   */
  init(payload: InitPayload): RunSummary {
    if (this.assets === null) {
      throw new Error("loadAssets() must run before init(): the worker has no graph");
    }
    const cache = new Map<string, readonly CsvRow[]>();
    const data = {
      exists: (path: string): boolean => Object.hasOwn(payload.csv, path),
      readCsv: (path: string): readonly CsvRow[] => {
        const hit = cache.get(path);
        if (hit !== undefined) {
          return hit;
        }
        const text = payload.csv[path];
        if (text === undefined) {
          throw new Error(
            `the worker was not given '${path}'. ContextCreator reads it during the build, so ` +
              "omitting it is a missing input, not an empty file.",
          );
        }
        // Through `decodeCsvBytes` rather than straight to `readCsvText`: WP5-F1
        // is that `TextDecoder` strips a leading BOM and Java does not, and the
        // ported decoder is where that difference is handled. Text that arrived
        // as text is re-encoded so it takes the identical path.
        const rows = readCsvText(decodeCsvBytes(new TextEncoder().encode(text)));
        cache.set(path, rows);
        return rows;
      },
    };
    const host = this.newHost();
    this.host = host;
    return host.init({
      config: payload.config,
      assets: this.assets,
      data,
      smokeAsset: payload.smokeAsset,
      ...(payload.agentOrder === undefined ? {} : { agentOrder: payload.agentOrder }),
      ...(payload.registryValidated === undefined ? {} : { registryValidated: payload.registryValidated }),
    });
  }

  run(options?: RunOptions): Promise<RunSummary> {
    return this.host.run(options ?? {});
  }

  pause(): void {
    this.host.pause();
  }

  summary(): RunSummary {
    return this.host.summary();
  }

  keyframeTicks(): number[] {
    return this.host.keyframeTicks();
  }

  ringStats(): RingStats {
    return this.host.ringStats();
  }

  /** Snapshot now; returns the tick, not the snapshot (it never leaves the worker). */
  snapshotNow(): number {
    return this.host.snapshotNow().tick;
  }

  scrubTo(tick: number): { readonly fromKeyframe: number; readonly replayedTicks: number } {
    return this.host.scrubTo(tick);
  }

  digest(): Promise<string> {
    return this.host.digest();
  }

  digestTokens(): string[] {
    return this.host.digestTokens();
  }

  stateCensus(): Record<string, number> {
    return this.host.stateCensus();
  }

  /** The full run census — the non-vacuity evidence a browser test needs. */
  census(): RunCensus {
    return this.host.census();
  }

  exportOutputs(request: ExportRequest): RunOutputs {
    return this.host.exportOutputs(request);
  }

  /**
   * Re-measure the closure-wave recompute on the loaded graph.
   *
   * The number plan §3.6 budgets at 5 s and DR-S3 measured at 0.17 s. It is a
   * capability probe, not a run step: `engine/src/worker/sssp.ts` explains why
   * no worker pool is wired in and this is the measurement that would detect the
   * day that stops being the right call.
   */
  measureClosureWave(repeats?: number): SsspWaveMeasurement {
    if (this.assets === null) {
      throw new Error("loadAssets() must run before measureClosureWave()");
    }
    const shelters = this.host.built.sim.shelters;
    return measureSsspWave({
      graph: this.assets.graph,
      sources: shelterSources(shelters),
      ...(repeats === undefined ? {} : { repeats }),
    });
  }
}
