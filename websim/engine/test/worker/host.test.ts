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
import { RUN_OPTION_DEFAULTS, type StreamMessage } from "../../src/worker/protocol.js";

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

/**
 * `RunOptions.maxFramesPerSecond` — the display-cadence ceiling
 * (DR-WP10-uithread-perf §8.3 D1).
 *
 * The ceiling exists because at max speed the worker hands the page 12–136
 * frames for every one it can paint, so 92–99 % of the bytes are rendered by
 * nobody. It is the **only** wall-clock-dependent decision in `SimHost`, which
 * makes it the one place a display optimisation could leak into the model. Every
 * test below is about that fence rather than about the saving:
 *
 *  - the model is byte-identical with the ceiling on, against the *bare*
 *    `sim.run()` reference this file uses throughout — not against another
 *    hosted run, so two equally-wrong hosts cannot agree;
 *  - the ceiling is proven to have actually fired (a green determinism test
 *    under a ceiling that suppressed nothing would be vacuous);
 *  - the frames that *do* come out are a subsequence of the uncapped ones, plus
 *    the forced first and last — it drops pictures, it does not invent or
 *    reorder them;
 *  - metric rows, which charts read and which must not be lossy, are untouched;
 *  - and the default is pinned OFF, with the reason, because flipping it is what
 *    would break Compare.
 */
describe("SimHost — the display-cadence ceiling drops frames, never ticks", () => {
  /** Ticks of every frame the sink received, in arrival order. */
  function frameTicks(c: Collected): number[] {
    const out: number[] = [];
    for (const m of c.messages) {
      if (m.kind === "frames") {
        for (const t of m.batch.ticks) {
          out.push(t);
        }
      }
    }
    return out;
  }

  it("is OFF by default, and turning it on is a Compare decision, not a tuning one", () => {
    // Pinned deliberately. `compare.worker.test.ts` — the only test of WP10
    // acceptance clause 3 — asserts that two independently scheduled workers
    // report the same `framesEmitted` and the same number of frame batches at
    // six stops. Under a wall-clock ceiling both are functions of how fast each
    // machine happened to run, so neither equality could hold. If this line is
    // ever changed, that gate has to be answered first.
    expect(
      RUN_OPTION_DEFAULTS.maxFramesPerSecond,
      "the display ceiling was defaulted on; see compare.worker.test.ts clause 3",
    ).toBe(0);

    const host = makeHost({}, collector().sink);
    expect(host.summary().framesSuppressed).toBe(0);
  });

  it("a capped run is byte-identical to a bare sim.run(), and really did suppress frames", async () => {
    const bare = buildSynthWorld();
    bare.sim.run();
    const expected = await digestOf(bare);

    // Frame per tick — the configuration the WP10 production-scale gate uses —
    // against a 1 fps ceiling, so on any machine that runs 720 ticks in under
    // twelve minutes the ceiling has to swallow almost all of them.
    const c = collector();
    const host = makeHost({}, c.sink);
    const summary = await host.run({
      sliceTicks: 30,
      frameEveryTicks: 1,
      frameBatchSize: 1,
      snapshotEveryTicks: 120,
      maxFramesPerSecond: 1,
    });

    expect(summary.tick, "the ceiling skipped ticks — it must only skip pictures").toBe(bare.sim.endTick);
    expect(await host.digest(), "the display ceiling changed the run").toBe(expected);

    // Non-vacuity: without this the digest equality above proves nothing.
    expect(
      summary.framesSuppressed,
      "the ceiling suppressed nothing, so the byte-identity above was not tested",
    ).toBeGreaterThan(600);
    // Every scheduled frame is accounted for exactly once — shown or declined.
    // The forced end-of-run frame replaces the declined attempt at that tick
    // rather than inflating the total, so this is 721 (ticks 0…720), not 722.
    expect(
      summary.framesEmitted + summary.framesSuppressed,
      "shown + declined must equal the frames the cadence scheduled",
    ).toBe(721);
    expect(summary.framesEmitted).toBeLessThan(30);
  }, 300_000);

  it("keeps the first and last frame, and every frame it keeps is one the uncapped run made", async () => {
    const uncapped = collector();
    await makeHost({}, uncapped.sink).run({ frameEveryTicks: 1, frameBatchSize: 1, snapshotEveryTicks: 0 });
    const all = frameTicks(uncapped);
    expect(all[0]).toBe(0);
    expect(all[all.length - 1]).toBe(720);
    expect(all.length).toBe(721);

    const capped = collector();
    const summary = await makeHost({}, capped.sink).run({
      frameEveryTicks: 1,
      frameBatchSize: 1,
      snapshotEveryTicks: 0,
      maxFramesPerSecond: 1,
    });
    const kept = frameTicks(capped);

    expect(summary.framesSuppressed, "the ceiling did not fire").toBeGreaterThan(600);
    expect(kept.length, "the sink saw a different number of frames than the summary counted").toBe(
      summary.framesEmitted,
    );
    // The display must start on the initial state and END ON THE STATE THE RUN
    // STOPPED AT: a map frozen thousands of ticks behind the metrics would be a
    // worse defect than the one the ceiling fixes.
    expect(kept[0], "the ceiling swallowed the opening frame").toBe(0);
    expect(kept[kept.length - 1], "the display did not land on the final state").toBe(720);
    // Strictly increasing, and a subsequence of the uncapped ticks: dropped, not
    // reordered, not invented, not interpolated.
    const allSet = new Set(all);
    for (let i = 0; i < kept.length; i++) {
      expect(allSet.has(kept[i]!), `frame at tick ${kept[i]} is not a tick the uncapped run framed`).toBe(true);
      if (i > 0) {
        expect(kept[i]!, "frames came out of order").toBeGreaterThan(kept[i - 1]!);
      }
    }
  }, 300_000);

  it("does not decimate the metric stream — charts stay lossless", async () => {
    // The frames are the lossy display path; the metric rows are not, and a
    // ceiling that quietly thinned them would silently change every chart.
    const c = collector();
    await makeHost({}, c.sink).run({
      frameEveryTicks: 1,
      frameBatchSize: 1,
      metricBatchSize: 4,
      snapshotEveryTicks: 0,
      maxFramesPerSecond: 1,
    });
    const hours: number[] = [];
    for (const m of c.messages) {
      if (m.kind === "metrics") {
        for (const h of m.batch.hours) {
          hours.push(h);
        }
      }
    }
    expect(hours).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  }, 300_000);

  it("a ceiling too high to bite leaves the frame stream exactly as it was", async () => {
    // The other end of the range: the ceiling must be a no-op when the display
    // can keep up, or it would be a second, hidden cadence knob.
    const reference = collector();
    await makeHost({}, reference.sink).run({ frameEveryTicks: 120, frameBatchSize: 2, snapshotEveryTicks: 0 });

    const c = collector();
    const summary = await makeHost({}, c.sink).run({
      frameEveryTicks: 120,
      frameBatchSize: 2,
      snapshotEveryTicks: 0,
      maxFramesPerSecond: 1e6,
    });
    expect(frameTicks(c)).toEqual(frameTicks(reference));
    expect(summary.framesSuppressed).toBe(0);
  }, 300_000);

  it("rejects a ceiling that is not a finite count per second", async () => {
    for (const bad of [-1, -0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const host = makeHost({}, collector().sink);
      await expect(
        host.run({ maxFramesPerSecond: bad, untilTick: 60 }),
        `maxFramesPerSecond ${String(bad)} was accepted`,
      ).rejects.toThrow(RangeError);
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
