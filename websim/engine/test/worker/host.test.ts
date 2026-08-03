/**
 * `SimHost`: the run lifecycle, the streams, wave progress and scrub.
 *
 * The through-line of this file is one claim: **the host adds nothing to the
 * model.** Slicing the tick loop, emitting frames, taking snapshots, pausing and
 * resuming, and streaming metrics must all leave the same bytes behind as a bare
 * `sim.run()`. Each is asserted by digest against the bare run rather than
 * against another hosted run, so two equally-wrong hosts cannot agree with each
 * other.
 */

import { describe, expect, it } from "vitest";

import { digestSimulation } from "../../src/worker/digest.js";
import { SimHost, type StreamSink } from "../../src/worker/simHost.js";
import { makeAssetBundle, type SimBundle } from "../../src/worker/build.js";
import { buildRoutingGraph } from "../../src/graph/csr.js";
import type { StreamMessage } from "../../src/worker/protocol.js";

import {
  buildSynthWorld,
  memoryDataSource,
  smokeAsset,
  synthConfig,
  synthCsvMap,
  synthGeometry,
  synthTopology,
  type SynthWorldOptions,
} from "./world.js";

async function digestOf(b: SimBundle): Promise<string> {
  return digestSimulation(b.sim, b.smoke, b.world.streams);
}

interface Collected {
  readonly messages: StreamMessage[];
  readonly transfers: ArrayBuffer[][];
  readonly sink: StreamSink;
}

function collector(onMessage?: (m: StreamMessage) => void): Collected {
  const messages: StreamMessage[] = [];
  const transfers: ArrayBuffer[][] = [];
  return {
    messages,
    transfers,
    sink: (m, t) => {
      messages.push(m);
      transfers.push(t);
      onMessage?.(m);
    },
  };
}

/** A host initialised on the synthetic world, exactly as the worker does it. */
function makeHost(options: SynthWorldOptions = {}, sink?: StreamSink): SimHost {
  const topology = synthTopology();
  const assets = makeAssetBundle(buildRoutingGraph(topology), synthGeometry(topology));
  const config = synthConfig(options);
  const host = new SimHost(sink === undefined ? {} : { sink });
  host.init({
    config,
    assets,
    data: memoryDataSource(synthCsvMap()),
    smokeAsset: smokeAsset(config.simulationHours, options.smokeGapHours ?? []),
    registryValidated: true,
  });
  return host;
}

describe("SimHost — the host adds nothing to the model", () => {
  it("a hosted full run is byte-identical to a bare sim.run()", async () => {
    const bare = buildSynthWorld();
    bare.sim.run();
    const expected = await digestOf(bare);

    const host = makeHost({}, collector().sink);
    const summary = await host.run();
    expect(summary.phase).toBe("finished");
    expect(summary.tick).toBe(bare.sim.endTick);
    expect(await host.digest(), "the host changed the run").toBe(expected);
  }, 120_000);

  it("is invariant to the slice cadence, the frame cadence and the snapshot cadence", async () => {
    const bare = buildSynthWorld();
    bare.sim.run();
    const expected = await digestOf(bare);

    const cases = [
      { sliceTicks: 1, frameEveryTicks: 1, snapshotEveryTicks: 1, frameBatchSize: 1, metricBatchSize: 1 },
      { sliceTicks: 7, frameEveryTicks: 13, snapshotEveryTicks: 60, frameBatchSize: 3, metricBatchSize: 5 },
      { sliceTicks: 240, frameEveryTicks: 60, snapshotEveryTicks: 120, frameBatchSize: 8, metricBatchSize: 24 },
      { sliceTicks: 100_000, frameEveryTicks: 0, snapshotEveryTicks: 0, frameBatchSize: 8, metricBatchSize: 24 },
    ];
    for (const opts of cases) {
      const host = makeHost({}, collector().sink);
      await host.run(opts);
      expect(await host.digest(), `cadence ${JSON.stringify(opts)} changed the run`).toBe(expected);
    }
  }, 300_000);

  it("pausing and resuming leaves the same bytes as an uninterrupted run", async () => {
    const bare = buildSynthWorld();
    bare.sim.run();
    const expected = await digestOf(bare);

    const host = makeHost({}, collector().sink);
    // Pause after the first slice, then resume repeatedly.
    let resumes = 0;
    for (;;) {
      const p = host.run({ sliceTicks: 137 });
      host.pause();
      const s = await p;
      resumes++;
      if (s.phase === "finished") {
        break;
      }
      expect(resumes, "pause/resume did not converge").toBeLessThan(50);
    }
    expect(resumes, "the run finished in one slice; pause was never exercised").toBeGreaterThan(3);
    expect(await host.digest()).toBe(expected);
  }, 300_000);
});

describe("SimHost — streaming", () => {
  it("emits frames on the requested cadence, with transferable buffers", async () => {
    const c = collector();
    const host = makeHost({}, c.sink);
    await host.run({ frameEveryTicks: 120, frameBatchSize: 2, snapshotEveryTicks: 0 });

    const frameMsgs = c.messages.filter((m) => m.kind === "frames");
    const ticks: number[] = [];
    for (const m of frameMsgs) {
      if (m.kind === "frames") {
        for (const t of m.batch.ticks) {
          ticks.push(t);
        }
      }
    }
    // Tick 0 plus every 120th tick to the end (720).
    expect(ticks).toEqual([0, 120, 240, 360, 480, 600, 720]);
    for (let i = 0; i < c.messages.length; i++) {
      if (c.messages[i]!.kind === "frames") {
        expect(c.transfers[i]!.length, "a frame batch was emitted without its transfer list").toBe(5);
      }
    }
  }, 120_000);

  it("emits one metric row per simulated hour, in order", async () => {
    const c = collector();
    const host = makeHost({}, c.sink);
    await host.run({ frameEveryTicks: 0, metricBatchSize: 4, snapshotEveryTicks: 0 });
    const hours: number[] = [];
    for (const m of c.messages) {
      if (m.kind === "metrics") {
        for (const h of m.batch.hours) {
          hours.push(h);
        }
      }
    }
    expect(hours).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  }, 120_000);

  it("emits wave progress BEFORE the recompute, and the report after", async () => {
    // The "recomputing routes…" notice is only useful if it precedes the work.
    // The check is not on message order alone — it is on the *engine's own
    // version counter* at the moment `start` is delivered.
    const versionAtStart: number[] = [];
    const order: string[] = [];
    let host: SimHost | null = null;
    const sink: StreamSink = (m) => {
      if (m.kind === "wave") {
        order.push(`${m.phase}:${m.wave}`);
        if (m.phase === "start" && host !== null) {
          versionAtStart.push(host.built.sim.closureVersion());
        }
      }
    };
    host = makeHost({}, sink);
    await host.run({ frameEveryTicks: 0, snapshotEveryTicks: 0 });

    expect(order).toEqual(["start:1", "done:1", "start:2", "done:2", "start:3", "done:3"]);
    // Version 0 before wave 1 fires, 1 before wave 2, 2 before wave 3.
    expect(versionAtStart).toEqual([0, 1, 2]);

    const done = [] as { hour: number; tick: number; shelters: number }[];
    // Re-run collecting the payloads.
    const c = collector();
    const h2 = makeHost({}, c.sink);
    await h2.run({ frameEveryTicks: 0, snapshotEveryTicks: 0 });
    for (const m of c.messages) {
      if (m.kind === "wave" && m.phase === "done") {
        done.push({ hour: m.hour, tick: m.tick, shelters: m.shelterCount });
        expect(m.report, "a done event carried no engine report").toBeDefined();
        expect(m.elapsedMs!).toBeGreaterThanOrEqual(0);
      }
    }
    expect(done.map((d) => d.hour)).toEqual([2, 4, 6]);
    expect(done.map((d) => d.tick)).toEqual([120, 240, 360]);
    expect(done.every((d) => d.shelters === 4)).toBe(true);
  }, 240_000);

  it("reports a status with a keyframe list the scrub UI can use", async () => {
    const c = collector();
    const host = makeHost({}, c.sink);
    await host.run({ sliceTicks: 180, snapshotEveryTicks: 120, frameEveryTicks: 0 });
    const statuses = c.messages.filter((m) => m.kind === "status");
    expect(statuses.length).toBeGreaterThan(3);
    const last = statuses[statuses.length - 1]!;
    expect(last.kind).toBe("status");
    if (last.kind === "status") {
      expect(last.phase).toBe("finished");
      expect(last.tick).toBe(720);
      expect(last.keyframeTicks).toContain(0);
      expect(last.keyframeTicks).toContain(720);
      expect(last.ticksPerSecond).toBeGreaterThan(0);
    }
  }, 120_000);
});

describe("SimHost — scrub", () => {
  it("scrubbing back lands byte-identically on the straight run's state", async () => {
    const host = makeHost({}, collector().sink);
    await host.run({ snapshotEveryTicks: 60, frameEveryTicks: 0 });
    expect(host.summary().tick).toBe(720);

    for (const target of [90, 245, 400, 615]) {
      const reference = buildSynthWorld();
      reference.sim.runUntil(target);
      const expected = await digestOf(reference);

      const info = host.scrubTo(target);
      expect(info.fromKeyframe, "scrub must restore a keyframe at or before the target").toBeLessThanOrEqual(
        target,
      );
      expect(host.built.sim.tick).toBe(target);
      expect(await host.digest(), `scrub to ${target}`).toBe(expected);
    }
  }, 300_000);

  it("scrubbing forward is a plain run and needs no keyframe", async () => {
    const host = makeHost({}, collector().sink);
    await host.run({ untilTick: 200, snapshotEveryTicks: 0, frameEveryTicks: 0 });
    const info = host.scrubTo(500);
    expect(info.fromKeyframe).toBe(200);
    expect(info.replayedTicks).toBe(300);
    const reference = buildSynthWorld();
    reference.sim.runUntil(500);
    expect(await host.digest()).toBe(await digestOf(reference));
  }, 120_000);

  it("refuses to scrub back without keyframes rather than landing approximately", async () => {
    const host = makeHost({}, collector().sink);
    await host.run({ untilTick: 300, snapshotEveryTicks: 0, frameEveryTicks: 0 });
    expect(() => host.scrubTo(100)).toThrow(/no keyframe/u);
    expect(host.built.sim.tick, "a refused scrub must not move the simulation").toBe(300);
  }, 120_000);

  it("keeps tick 0 as a keyframe so an early scrub is always possible", async () => {
    const host = makeHost({}, collector().sink);
    await host.run({ snapshotEveryTicks: 60, frameEveryTicks: 0 });
    expect(host.keyframeTicks()[0]).toBe(0);
    host.scrubTo(0);
    expect(host.built.sim.tick).toBe(0);
    const fresh = buildSynthWorld();
    expect(await host.digest(), "scrub to 0 must reproduce the built, unstepped world").toBe(
      await digestOf(fresh),
    );
  }, 120_000);

  it("scrub then continue is byte-identical to never having scrubbed", async () => {
    const reference = buildSynthWorld();
    reference.sim.runUntil(700);
    const expected = await digestOf(reference);

    const host = makeHost({}, collector().sink);
    await host.run({ snapshotEveryTicks: 60, frameEveryTicks: 0 });
    host.scrubTo(120);
    host.scrubTo(600);
    host.scrubTo(300);
    host.scrubTo(700);
    expect(await host.digest()).toBe(expected);
  }, 300_000);
});

describe("SimHost — read-out", () => {
  it("exports both output flavours from a finished run", async () => {
    const host = makeHost({}, collector().sink);
    await host.run({ frameEveryTicks: 0, snapshotEveryTicks: 0 });
    const paramNames = Object.keys(host.built.config);
    const parity = host.exportOutputs({ flavour: "parity", paramNames });
    const v2 = host.exportOutputs({ flavour: "v2-web", paramNames });
    expect(parity.agentsCsv.split("\n")[0]!).toContain("agent_id");
    expect(parity.agentsCsv.trim().split("\n").length).toBe(host.built.sim.residents.length + 1);
    expect(parity.sheltersCsv.trim().split("\n").length).toBe(host.built.sim.shelters.length + 1);
    expect(JSON.parse(parity.simulationJson)).toBeTypeOf("object");
    expect(v2.simulationJson).not.toBe(parity.simulationJson);
  }, 120_000);

  it("summary reports the armed-resident witness, not an inference", async () => {
    const host = makeHost({}, collector().sink);
    const s = await host.run({ frameEveryTicks: 0, snapshotEveryTicks: 0 });
    expect(s.armedResidents).toBe(host.built.sim.residents.length);
    expect(s.wavesFired).toBe(3);
    expect(s.outOfRangeLookups).toBe(0);

    const off = makeHost({ decisionLayer: false }, collector().sink);
    const s2 = await off.run({ frameEveryTicks: 0, snapshotEveryTicks: 0 });
    expect(s2.armedResidents, "the layer must be OFF when the switch is off").toBe(0);
  }, 240_000);
});
