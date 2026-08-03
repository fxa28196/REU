/**
 * `SimWorkerApi` driven in Node — everything the browser worker does except
 * being in a worker.
 *
 * The point of testing it here as well as in the browser is coverage of the
 * *shapes*: a Comlink argument is structured-cloned, so every payload has to
 * survive that, and a structured-clone failure in a browser is a stack trace
 * inside a worker with no source map. Here it is a normal assertion.
 *
 * The real packed-asset decode is exercised too (artifact-gated): the synthetic
 * world hands `loadAssets` decoded typed arrays, so without this the container
 * branch of `loadAssets` would never run outside WP11.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { artifactGate, describeGated, type ArtifactRef } from "../../../tools/artifact-gate.js";
import { SimWorkerApi } from "../../src/worker/api.js";
import { digestSimulation } from "../../src/worker/digest.js";
import type { StreamMessage } from "../../src/worker/protocol.js";

import { buildSynthWorld, smokeAsset, synthConfig, synthCsvMap, synthGeometry, synthTopology } from "./world.js";

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));
const ASSET_DIR = here("../../../pipeline/out/assets");

interface Port {
  readonly messages: StreamMessage[];
  readonly transfers: ArrayBuffer[][];
  postMessage(m: StreamMessage, t: ArrayBuffer[]): void;
}

function fakePort(): Port {
  const messages: StreamMessage[] = [];
  const transfers: ArrayBuffer[][] = [];
  return {
    messages,
    transfers,
    postMessage(m, t) {
      messages.push(m);
      transfers.push(t);
    },
  };
}

function newApi(): { api: SimWorkerApi; port: Port } {
  const api = new SimWorkerApi();
  const port = fakePort();
  api.subscribe(port);
  const topology = synthTopology();
  api.loadAssets({ topology, geometry: synthGeometry(topology) });
  return { api, port };
}

function initPayload(overrides: { readonly numAgents?: number; readonly randomSeed?: number } = {}) {
  const config = synthConfig(overrides);
  return {
    config,
    csv: synthCsvMap(),
    smokeAsset: smokeAsset(config.simulationHours),
    registryValidated: true,
  };
}

describe("SimWorkerApi", () => {
  it("refuses to init before assets are loaded", () => {
    const api = new SimWorkerApi();
    expect(() => api.init(initPayload())).toThrow(/loadAssets/u);
  });

  it("reports the decoded graph census from loadAssets", () => {
    const { api } = newApi();
    expect(api.assetsLoaded).toBe(true);
  });

  it("names the missing CSV instead of building an empty world", () => {
    const api = new SimWorkerApi();
    const topology = synthTopology();
    api.loadAssets({ topology, geometry: synthGeometry(topology) });
    const payload = initPayload();
    const csv = { ...payload.csv };
    delete csv["data/encampments/irp_campsite_reports_sample.csv"];
    expect(() => api.init({ ...payload, csv })).toThrow(/irp_campsite_reports_sample\.csv/u);
  });

  it("produces the same bytes as a directly built simulation", async () => {
    const bare = buildSynthWorld();
    bare.sim.run();
    const expected = await digestSimulation(bare.sim, bare.smoke, bare.world.streams);

    const { api } = newApi();
    api.init(initPayload());
    await api.run({ frameEveryTicks: 60, snapshotEveryTicks: 60 });
    expect(await api.digest(), "going through the worker API changed the run").toBe(expected);
  }, 120_000);

  it("streams to the subscribed port, with transfer lists", async () => {
    const { api, port } = newApi();
    api.init(initPayload());
    await api.run({ frameEveryTicks: 180, frameBatchSize: 2, snapshotEveryTicks: 0 });
    const kinds = new Set(port.messages.map((m) => m.kind));
    expect(kinds).toContain("frames");
    expect(kinds).toContain("metrics");
    expect(kinds).toContain("status");
    expect(kinds).toContain("wave");
    for (let i = 0; i < port.messages.length; i++) {
      if (port.messages[i]!.kind === "frames") {
        expect(port.transfers[i]!.length).toBe(5);
      }
    }
  }, 120_000);

  it("keeps streaming after a second init — the Compare re-run case", async () => {
    // `init` replaces the host. A sink owned by the host would be dropped and
    // the second configuration would stream nothing, which no single-run test
    // would notice.
    const { api, port } = newApi();
    api.init(initPayload());
    await api.run({ frameEveryTicks: 360, snapshotEveryTicks: 0, untilTick: 360 });
    const first = port.messages.length;
    expect(first).toBeGreaterThan(0);

    api.init(initPayload({ randomSeed: 43 }));
    await api.run({ frameEveryTicks: 360, snapshotEveryTicks: 0, untilTick: 360 });
    expect(port.messages.length, "the stream went silent after re-init").toBeGreaterThan(first);
  }, 120_000);

  it("re-initialising resets the ring, the counters and the tick", async () => {
    const { api } = newApi();
    api.init(initPayload());
    await api.run({ snapshotEveryTicks: 60, frameEveryTicks: 0 });
    expect(api.summary().tick).toBe(720);
    expect(api.keyframeTicks().length).toBeGreaterThan(5);

    api.init(initPayload());
    expect(api.summary().tick).toBe(0);
    expect(api.summary().framesEmitted).toBe(0);
    expect(api.keyframeTicks()).toEqual([]);
  }, 120_000);

  it("snapshots and scrubs through the API surface", async () => {
    const { api } = newApi();
    api.init(initPayload());
    await api.run({ snapshotEveryTicks: 120, frameEveryTicks: 0 });
    const tick = api.snapshotNow();
    expect(tick).toBe(720);
    const info = api.scrubTo(300);
    expect(info.fromKeyframe).toBeLessThanOrEqual(300);

    const reference = buildSynthWorld();
    reference.sim.runUntil(300);
    expect(await api.digest()).toBe(
      await digestSimulation(reference.sim, reference.smoke, reference.world.streams),
    );
  }, 120_000);

  it("measures the closure wave on the loaded graph", async () => {
    const { api } = newApi();
    api.init(initPayload());
    await api.run({ frameEveryTicks: 0, snapshotEveryTicks: 0, untilTick: 60 });
    const m = api.measureClosureWave(2);
    expect(m.trees).toBe(4);
    expect(m.reachableTotal).toBeGreaterThan(0);
    expect(m.headroom).toBeGreaterThan(1);
  }, 120_000);

  it("returns a state census whose total is the population", async () => {
    const { api } = newApi();
    api.init(initPayload());
    await api.run({ frameEveryTicks: 0, snapshotEveryTicks: 0 });
    const census = api.stateCensus();
    expect(Object.values(census).reduce((a, b) => a + b, 0)).toBe(300);
  }, 120_000);

  it("every payload it accepts survives a structured clone", () => {
    // Comlink structured-clones its arguments. A `Map`, a class instance or a
    // function in a payload throws DataCloneError inside the worker, where the
    // error is least debuggable.
    const topology = synthTopology();
    const assetPayload = { topology, geometry: synthGeometry(topology) };
    expect(() => structuredClone(assetPayload)).not.toThrow();
    expect(() => structuredClone(initPayload())).not.toThrow();
    const cloned = structuredClone(assetPayload);
    expect(cloned.topology.nodeId).toBeInstanceOf(Int32Array);
    expect(cloned.topology.nodeId.length).toBe(topology.nodeId.length);
  });

  it("every value it returns survives a structured clone", async () => {
    const { api } = newApi();
    api.init(initPayload());
    const summary = await api.run({ frameEveryTicks: 60, snapshotEveryTicks: 60, untilTick: 300 });
    expect(() => structuredClone(summary)).not.toThrow();
    expect(() => structuredClone(api.keyframeTicks())).not.toThrow();
    expect(() => structuredClone(api.ringStats())).not.toThrow();
    expect(() => structuredClone(api.stateCensus())).not.toThrow();
    expect(() => structuredClone(api.measureClosureWave(1))).not.toThrow();
    expect(() =>
      structuredClone(api.exportOutputs({ flavour: "v2-web", paramNames: Object.keys(api.summary()) })),
    ).not.toThrow();
  }, 120_000);
});

const realAssets: ArtifactRef[] = [
  { source: "graph-asset", label: "graph-topology.bin", path: `${ASSET_DIR}/graph-topology.bin` },
  { source: "graph-asset", label: "graph-geometry.bin", path: `${ASSET_DIR}/graph-geometry.bin` },
];

describeGated(
  artifactGate({
    gate: "engine:wp10-worker-real-assets",
    suite: "SimWorkerApi decodes the shipped packed graph containers",
    evidence:
      "that the worker's loadAssets container branch decodes the real 88,100-node asset, not " +
      "only the decoded typed arrays a synthetic test world hands it",
    artifacts: realAssets,
  }),
  () => {
    it("loads the real topology and geometry from packed bytes", () => {
      const api = new SimWorkerApi();
      const topology = readFileSync(`${ASSET_DIR}/graph-topology.bin`);
      const geometry = readFileSync(`${ASSET_DIR}/graph-geometry.bin`);
      const report = api.loadAssets({
        topology: topology.buffer.slice(
          topology.byteOffset,
          topology.byteOffset + topology.byteLength,
        ) as ArrayBuffer,
        geometry: geometry.buffer.slice(
          geometry.byteOffset,
          geometry.byteOffset + geometry.byteLength,
        ) as ArrayBuffer,
      });
      expect(report.nodeCount).toBe(88_100);
      expect(report.edgeCount).toBe(109_434);
      expect(report.directedRecords).toBe(218_868);
      expect(report.vertexCount).toBeGreaterThan(0);
      // eslint-disable-next-line no-console -- the load cost is a WP10 number.
      console.log(
        "[wp10-assets]",
        JSON.stringify({ loadMs: Number(report.loadMs.toFixed(1)), nodes: report.nodeCount }),
      );
    }, 300_000);
  },
);
