/**
 * The WP10 flagship property, in Node.
 *
 * > Snapshot at S, replay to T is **byte-identical** to a straight run to T.
 *
 * The browser half of the same claim is
 * `engine/test-browser/worker/snapshot.worker.test.ts`, which runs it inside a
 * real `Worker` in Chromium, Firefox and WebKit. This file is where the property
 * is checked in depth, because Node is where a failure is debuggable.
 *
 * ## The three things that make this test worth running
 *
 * 1. **The comparator is reflective.** `digest.ts` discovers fields with
 *    `Object.keys` at run time, so it cannot be blind to the same field the
 *    snapshot forgot. A field-list comparator would have compared the snapshot
 *    to itself.
 * 2. **The replay is preceded by deliberate pollution.** After snapshotting at
 *    S the simulation is run all the way to the end, so every accumulator, every
 *    RNG, every belief set and the blocked-edge set are as far from their
 *    tick-S values as the run can put them. A restore that misses a field then
 *    leaves the end-of-run value behind, and the digest says so. Snapshot →
 *    immediately restore → replay would prove nothing: not restoring at all
 *    would pass it.
 * 3. **The world is non-vacuous.** `world.census.test.ts` fails if the
 *    configuration stops producing admissions, refusals, beliefs, pushed
 *    blockages, fired waves and four-plus states; this file re-asserts the
 *    census on the reference run so a vacuous world cannot make it green.
 */

import { describe, expect, it } from "vitest";

import { digestSimulation, firstTokenDelta, simulationTokens } from "../../src/worker/digest.js";
import { captureSnapshot, restoreSnapshot, type SnapshotTarget } from "../../src/worker/snapshot.js";
import type { SimBundle } from "../../src/worker/build.js";

import { assertWorldIsExercised, buildSynthWorld, censusOf, type SynthWorldOptions } from "./world.js";

function targetOf(b: SimBundle): SnapshotTarget {
  return { sim: b.sim, smoke: b.smoke, streams: b.world.streams };
}

async function digestOf(b: SimBundle): Promise<string> {
  return digestSimulation(b.sim, b.smoke, b.world.streams);
}

function tokensOf(b: SimBundle): string[] {
  return simulationTokens(b.sim, b.smoke, b.world.streams);
}

/** A fresh world run straight to `tick`. */
async function straightRunDigest(tick: number, options?: SynthWorldOptions): Promise<string> {
  const b = buildSynthWorld(options);
  b.sim.runUntil(tick);
  return digestOf(b);
}

/** Deterministic (S, T) pairs — "random", but reproducible on failure. */
function samplePairs(endTick: number, count: number): { s: number; t: number }[] {
  let seed = 0x2545f491;
  const next = (): number => {
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed / 0x1_0000_0000;
  };
  const out: { s: number; t: number }[] = [];
  for (let i = 0; i < count; i++) {
    const s = 1 + Math.floor(next() * (endTick - 2));
    const t = s + 1 + Math.floor(next() * (endTick - s - 1));
    out.push({ s, t: Math.min(t, endTick) });
  }
  return out;
}

describe("snapshot-replay byte identity (Node)", () => {
  it("the reference run is non-vacuous", () => {
    const b = buildSynthWorld();
    b.sim.run();
    assertWorldIsExercised(censusOf(b.sim), (cond, msg) => {
      expect(cond, msg).toBe(true);
    });
  });

  it("capturing a snapshot does not perturb the simulation", async () => {
    const b = buildSynthWorld();
    b.sim.runUntil(300);
    const before = await digestOf(b);
    captureSnapshot(targetOf(b));
    captureSnapshot(targetOf(b));
    expect(await digestOf(b), "capture mutated the model").toBe(before);
  });

  it("snapshot at S, pollute to the end, restore, replay to T == straight run to T", async () => {
    const reference = buildSynthWorld();
    const endTick = reference.sim.endTick;
    const pairs = samplePairs(endTick, 6);

    for (const { s, t } of pairs) {
      const expected = await straightRunDigest(t);

      const b = buildSynthWorld();
      b.sim.runUntil(s);
      const snap = captureSnapshot(targetOf(b));
      // Pollution: drive every accumulator, RNG and set as far from their
      // tick-S values as this run can.
      b.sim.run();
      expect(b.sim.tick, "the pollution run must actually advance").toBeGreaterThan(s);
      restoreSnapshot(targetOf(b), snap);
      expect(b.sim.tick, "restore must rewind the tick counter").toBe(s);
      b.sim.runUntil(t);

      const observed = await digestOf(b);
      if (observed !== expected) {
        const ref = buildSynthWorld();
        ref.sim.runUntil(t);
        throw new Error(
          `S=${s} T=${t}: replay diverged. ${String(firstTokenDelta(tokensOf(ref), tokensOf(b)))}`,
        );
      }
      expect(observed, `S=${s} T=${t}`).toBe(expected);
    }
  }, 120_000);

  it("restores into a SEPARATELY built simulation of the same configuration", async () => {
    // Stronger than the rewind above: nothing of the source run's object graph
    // is reused except what the snapshot itself carries, so a field the
    // snapshot omits cannot be supplied by "it was already right".
    const s = 250;
    const t = 620;
    const expected = await straightRunDigest(t);

    const source = buildSynthWorld();
    source.sim.runUntil(s);
    const snap = captureSnapshot(targetOf(source));

    const fresh = buildSynthWorld();
    // Advance the fresh instance to a DIFFERENT tick first, so "it happened to
    // already be in the right state" cannot be the reason the test passes.
    fresh.sim.runUntil(430);
    restoreSnapshot(targetOf(fresh), snap);
    expect(fresh.sim.tick).toBe(s);
    fresh.sim.runUntil(t);

    const observed = await digestOf(fresh);
    if (observed !== expected) {
      const ref = buildSynthWorld();
      ref.sim.runUntil(t);
      throw new Error(`cross-instance replay diverged. ${String(firstTokenDelta(tokensOf(ref), tokensOf(fresh)))}`);
    }
    expect(observed).toBe(expected);
  }, 120_000);

  it("restoring the same snapshot twice lands in the same place both times", async () => {
    const b = buildSynthWorld();
    b.sim.runUntil(200);
    const snap = captureSnapshot(targetOf(b));
    b.sim.runUntil(500);
    const first = await (async () => {
      restoreSnapshot(targetOf(b), snap);
      b.sim.runUntil(400);
      return digestOf(b);
    })();
    b.sim.runUntil(700);
    restoreSnapshot(targetOf(b), snap);
    b.sim.runUntil(400);
    expect(await digestOf(b)).toBe(first);
  }, 120_000);

  it("the digest is sensitive: two different ticks digest differently", async () => {
    // Non-vacuity of the comparator itself. A digest that returned a constant
    // would make every assertion above pass.
    const a = await straightRunDigest(300);
    const b = await straightRunDigest(301);
    expect(a).not.toBe(b);
  });

  it("the digest is sensitive to a single flipped resident field", async () => {
    const b = buildSynthWorld();
    b.sim.runUntil(300);
    const before = await digestOf(b);
    const victim = b.sim.residents[7]!;
    const saved = victim.exposureUgM3h;
    // One ulp. A digest that formatted numbers for display would miss this.
    victim.exposureUgM3h = saved + Number.EPSILON * Math.abs(saved);
    expect(await digestOf(b), "a one-ulp change was invisible to the digest").not.toBe(before);
    victim.exposureUgM3h = saved;
    expect(await digestOf(b)).toBe(before);
  });

  it("the digest sees a change in the agent-order permutation array", async () => {
    // The order array is the field most easily forgotten (see snapshot.ts's
    // module doc). If the digest could not see it, the mutation matrix in
    // snapshot.mutation.test.ts could not gate it either.
    const b = buildSynthWorld();
    b.sim.runUntil(120);
    const before = await digestOf(b);
    const order = (b.sim as unknown as { order: Int32Array }).order;
    const t0 = order[0]!;
    order[0] = order[1]!;
    order[1] = t0;
    expect(await digestOf(b)).not.toBe(before);
  });
});
