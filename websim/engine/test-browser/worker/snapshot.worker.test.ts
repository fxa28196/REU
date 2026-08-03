/**
 * WP10 acceptance criterion 1, measured where it is claimed:
 *
 * > The snapshot-replay byte-identity property holds **IN THE WORKER**, not
 * > merely in Node: snapshot at tick N, restore, continue, and prove the output
 * > is byte-identical to an uninterrupted run.
 *
 * Executed in Chromium, Firefox and WebKit by
 * `engine/vitest.browser.config.ts`, inside a real `Worker` running the shipped
 * `simWorker.ts`, driven over Comlink from the page.
 *
 * ## Why "in the worker" is a different claim from "in Node"
 *
 * Three things differ and each has broken a port before: the JS engine is
 * SpiderMonkey or JavaScriptCore rather than V8; the module graph is bundled by
 * Vite rather than loaded by Node's ESM loader; and the payloads have crossed a
 * structured-clone boundary, which turns typed arrays into copies and would
 * quietly drop anything not clone-safe. A property proved in Node says nothing
 * about any of them.
 *
 * ## Non-vacuity
 *
 * Every case asserts the worker's own run census first. Two digests agreeing
 * about a run in which nobody moved is not evidence, and the census is fetched
 * *from inside the worker* precisely so the page can prove the runs were real.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { assertWorldIsExercised } from "../../test/worker/world.js";
import { ENGINE_LABEL, initPayload, startWorker, type WorkerHandle } from "./harness.js";

let w: WorkerHandle;

beforeAll(async () => {
  w = await startWorker();
}, 120_000);

describe(`snapshot-replay byte identity IN A WORKER [${ENGINE_LABEL}]`, () => {
  it("runs in a real browser with a real Worker, not a Node shim", () => {
    const g = globalThis as { window?: unknown; document?: unknown; Worker?: unknown };
    expect(g.window, "no window: this did not run in a browser").toBeDefined();
    expect(g.document, "no document: this did not run in a browser").toBeDefined();
    expect(typeof g.Worker, "no Worker constructor").toBe("function");
  });

  it("the worker's run is non-vacuous", async () => {
    await w.api.init(initPayload());
    await w.api.run({ frameEveryTicks: 0, snapshotEveryTicks: 0 });
    const census = await w.api.census();
    // eslint-disable-next-line no-console -- the census IS the evidence here.
    console.log(`[wp10-browser-census] ${ENGINE_LABEL}`, JSON.stringify(census));
    assertWorldIsExercised(census, (cond, msg) => {
      expect(cond, `${ENGINE_LABEL}: ${msg}`).toBe(true);
    });
  }, 240_000);

  it("snapshot at N, pollute to the end, scrub back, replay to T == straight run to T", async () => {
    const T = 500;

    // Reference: a second worker that only ever runs forwards to T.
    const ref = await startWorker();
    try {
      await ref.api.init(initPayload());
      await ref.api.run({ untilTick: T, frameEveryTicks: 0, snapshotEveryTicks: 0 });
      const expected = await ref.api.digest();
      expect(expected, "digest must be a SHA-256 hex string").toMatch(/^[0-9a-f]{64}$/u);

      // Subject: snapshots every 60 ticks, runs to the very end (720) — which
      // pollutes every accumulator, RNG stream, belief set and the blocked-edge
      // set far past T — then scrubs back through the ring and replays.
      await w.api.init(initPayload());
      await w.api.run({ snapshotEveryTicks: 60, frameEveryTicks: 60 });
      const summary = await w.api.summary();
      expect(summary.tick).toBe(720);
      expect(summary.phase).toBe("finished");

      const scrub = await w.api.scrubTo(T);
      expect(scrub.fromKeyframe, "scrub must restore a keyframe at or before T").toBeLessThanOrEqual(T);
      expect(scrub.fromKeyframe, "a scrub that replayed nothing would prove nothing").toBeLessThan(T);
      expect(scrub.replayedTicks).toBeGreaterThan(0);

      const observed = await w.api.digest();
      if (observed !== expected) {
        const a = await ref.api.digestTokens();
        const b = await w.api.digestTokens();
        let delta = "no token differs, yet the digests do";
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
          if (a[i] !== b[i]) {
            delta = `token ${i}: ${a[i]} != ${b[i]}`;
            break;
          }
        }
        throw new Error(`${ENGINE_LABEL}: worker replay diverged. ${delta}`);
      }
      expect(observed, `${ENGINE_LABEL}: worker replay is not byte-identical`).toBe(expected);
    } finally {
      ref.terminate();
    }
  }, 300_000);

  it("holds for several (N, T) pairs, each landing on the straight run's bytes", async () => {
    const ref = await startWorker();
    try {
      const expected = new Map<number, string>();
      for (const t of [130, 305, 610]) {
        await ref.api.init(initPayload());
        await ref.api.run({ untilTick: t, frameEveryTicks: 0, snapshotEveryTicks: 0 });
        expected.set(t, await ref.api.digest());
      }
      // Three different digests, or the comparison is not discriminating.
      expect(new Set(expected.values()).size).toBe(3);

      await w.api.init(initPayload());
      await w.api.run({ snapshotEveryTicks: 60, frameEveryTicks: 0 });
      for (const [t, want] of expected) {
        const info = await w.api.scrubTo(t);
        expect(info.fromKeyframe).toBeLessThanOrEqual(t);
        expect(await w.api.digest(), `${ENGINE_LABEL}: scrub to ${t}`).toBe(want);
      }
    } finally {
      ref.terminate();
    }
  }, 300_000);

  it("continuing after a scrub is byte-identical to never having scrubbed", async () => {
    const ref = await startWorker();
    try {
      await ref.api.init(initPayload());
      await ref.api.run({ frameEveryTicks: 0, snapshotEveryTicks: 0 });
      const expected = await ref.api.digest();

      await w.api.init(initPayload());
      await w.api.run({ snapshotEveryTicks: 60, frameEveryTicks: 0 });
      await w.api.scrubTo(120);
      await w.api.scrubTo(600);
      await w.api.scrubTo(240);
      await w.api.run({ frameEveryTicks: 0, snapshotEveryTicks: 60 });
      expect(await w.api.summary().then((s) => s.tick)).toBe(720);
      expect(await w.api.digest(), `${ENGINE_LABEL}: scrub-and-continue diverged`).toBe(expected);
    } finally {
      ref.terminate();
    }
  }, 300_000);

  it("the comparison would notice a divergence (positive control)", async () => {
    // Guards every equality above. Two workers with different seeds must
    // produce different digests; if they did not, the digest would be a
    // constant and every assertion in this file would be vacuous.
    const other = await startWorker();
    try {
      await w.api.init(initPayload({ randomSeed: 42 }));
      await w.api.run({ untilTick: 400, frameEveryTicks: 0, snapshotEveryTicks: 0 });
      await other.api.init(initPayload({ randomSeed: 43 }));
      await other.api.run({ untilTick: 400, frameEveryTicks: 0, snapshotEveryTicks: 0 });
      expect(await other.api.digest()).not.toBe(await w.api.digest());
    } finally {
      other.terminate();
    }
  }, 300_000);

  it("a refused scrub does not silently land somewhere approximate", async () => {
    await w.api.init(initPayload());
    await w.api.run({ untilTick: 400, frameEveryTicks: 0, snapshotEveryTicks: 0 });
    await expect(w.api.scrubTo(100)).rejects.toThrow(/no keyframe/u);
    expect(await w.api.summary().then((s) => s.tick)).toBe(400);
  }, 240_000);
});
