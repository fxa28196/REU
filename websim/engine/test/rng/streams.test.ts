/**
 * WP3 acceptance: the four-stream registry (PORT_MAP §1.8, plan §3.3 item 3).
 *
 * <p>The seed derivations are cross-checked against values **computed in Java** and
 * recorded in `engine/test/fixtures/rng/java-random.json` by `RngFixtureDumper`, including
 * the two that genuinely overflow signed 64 bits. That is what makes this a parity test
 * rather than a restatement of the same TypeScript expression twice.
 *
 * <p>The disjointness properties are asserted as behaviour, because they are the properties
 * the science depends on: `ContextCreator.java:726` states that turning heterogeneity on
 * must leave start locations bit-identical, and PORT_MAP §1.8 states that sweeping a
 * Phase-E parameter must never reshuffle who owns a pet.
 */

import { describe, expect, it } from "vitest";

import { ColtMT19937 } from "../../src/rng/ColtMT19937.js";
import {
  agentDecisionSeed,
  eLayerSamplerSeed,
  populationSamplerSeed,
  shuffleMt,
  StreamRegistry,
} from "../../src/rng/streams.js";
import { javaRandomFixtures } from "./fixtures.js";

/** The Java-computed seed recorded under a given `seedNote` substring. */
function javaSeed(noteFragment: string): bigint {
  const seq = javaRandomFixtures.sequences.find((s) => s.seedNote.includes(noteFragment));
  if (seq === undefined) {
    throw new Error(`no fixture sequence with seedNote containing '${noteFragment}'`);
  }
  return BigInt(seq.seed);
}

describe("seed derivation vs values computed in Java", () => {
  it("PopulationSampler = seed*1000003 + 17", () => {
    expect(populationSamplerSeed(42n)).toBe(javaSeed("seed*1000003L+17L with seed=42"));
  });

  it("ELayerSampler = seed*1000003 + 7919", () => {
    expect(eLayerSamplerSeed(42n)).toBe(javaSeed("seed*1000003L+7919L with seed=42"));
  });

  it("per-agent = runSeed*2654435761 + index*104729", () => {
    expect(agentDecisionSeed(2147483647n, 1)).toBe(
      javaSeed("with seed=2147483647,index=1"),
    );
  });

  it("reproduces Java's signed 64-bit overflow, which the model keeps", () => {
    const wrapping = 9223372036854775783n;
    expect(populationSamplerSeed(wrapping)).toBe(
      javaSeed("seed=9223372036854775783L -- OVERFLOWS"),
    );
    expect(agentDecisionSeed(wrapping, 6841)).toBe(
      javaSeed("with seed=9223372036854775783L,index=6841"),
    );
    // Non-vacuity: without the wrap these are different numbers.
    expect(wrapping * 1000003n + 17n).not.toBe(populationSamplerSeed(wrapping));
  });

  it("rejects a non-integer agent index rather than silently truncating", () => {
    expect(() => agentDecisionSeed(42n, 1.5)).toThrow(RangeError);
  });
});

describe("StreamRegistry construction", () => {
  it("constructs the optional samplers only when their switch is on", () => {
    const off = new StreamRegistry({ runSeed: 42 });
    expect(off.populationSampler).toBeNull();
    expect(off.eLayerSampler).toBeNull();

    const on = new StreamRegistry({
      runSeed: 42,
      enableHeterogeneity: true,
      enableDecisionLayer: true,
    });
    expect(on.populationSampler).not.toBeNull();
    expect(on.eLayerSampler).not.toBeNull();
    expect(on.populationSampler!.seed48).toBe(
      // scramble(seed) = (seed ^ 0x5DEECE66D) & (2^48 - 1)
      BigInt.asUintN(48, populationSamplerSeed(42n) ^ 0x5deece66dn),
    );
  });

  it("seeds the default stream exactly as RandomHelper does", () => {
    const registry = new StreamRegistry({ runSeed: 42 });
    const direct = new ColtMT19937(42);
    for (let i = 0; i < 100; i++) {
      expect(registry.defaultStream.nextIntFromTo(0, 45)).toBe(direct.nextIntFromTo(0, 45));
    }
  });

  it("accepts a bigint seed and narrows it to int for the colt stream", () => {
    // RandomHelper.getSeed() is an int; the model widens it to long only for the derived
    // Random seeds. A registry built from a long-valued seed must still seed colt with the
    // narrowed int, not with a silently clamped or NaN value.
    const registry = new StreamRegistry({ runSeed: 4294967338n }); // 2^32 + 42
    const direct = new ColtMT19937(42);
    expect(registry.defaultStream.nextIntFromTo(0, 45)).toBe(direct.nextIntFromTo(0, 45));
  });

  it("gives every agent an independent, index-addressable stream", () => {
    const registry = new StreamRegistry({ runSeed: 42 });
    const a = registry.agentStream(7);
    const b = registry.agentStream(7);
    // Reconstructible from the index alone -- the property that makes per-agent decisions
    // invariant to the within-tick shuffle.
    expect(a.nextDouble()).toBe(b.nextDouble());
    expect(registry.agentStream(8).nextDouble()).not.toBe(registry.agentStream(7).nextDouble());
  });
});

describe("stream disjointness (the properties the science depends on)", () => {
  it("turning heterogeneity on does not perturb the default stream", () => {
    // ContextCreator.java:726 -- "the RandomHelper draw below stays the only default-stream
    // draw per resident, so start locations are bit-identical whether heterogeneity is on
    // or off". Constructing PopulationSampler must therefore consume nothing from colt.
    const off = new StreamRegistry({ runSeed: 42 });
    const on = new StreamRegistry({
      runSeed: 42,
      enableHeterogeneity: true,
      enableDecisionLayer: true,
    });
    for (let i = 0; i < 500; i++) {
      expect(on.defaultStream.nextIntFromTo(0, 45)).toBe(off.defaultStream.nextIntFromTo(0, 45));
    }
  });

  it("draining the ELayerSampler does not perturb the PopulationSampler or the default stream", () => {
    const a = new StreamRegistry({
      runSeed: 42,
      enableHeterogeneity: true,
      enableDecisionLayer: true,
    });
    const b = new StreamRegistry({
      runSeed: 42,
      enableHeterogeneity: true,
      enableDecisionLayer: true,
    });
    for (let i = 0; i < 1000; i++) {
      b.eLayerSampler!.nextDouble();
    }
    expect(a.populationSampler!.nextDouble()).toBe(b.populationSampler!.nextDouble());
    expect(a.defaultStream.nextIntFromTo(0, 45)).toBe(b.defaultStream.nextIntFromTo(0, 45));
    // ...and per-agent streams are pure functions of (runSeed, index), so they are
    // untouched too: sweeping an E parameter never reshuffles who owns a pet.
    expect(a.agentStream(3).nextDouble()).toBe(b.agentStream(3).nextDouble());
  });

  it("the three JavaRandom streams are mutually distinct at the same seed", () => {
    const r = new StreamRegistry({
      runSeed: 42,
      enableHeterogeneity: true,
      enableDecisionLayer: true,
    });
    const p = r.populationSampler!.nextDouble();
    const e = r.eLayerSampler!.nextDouble();
    const a = r.agentStream(0).nextDouble();
    expect(new Set([p, e, a]).size).toBe(3);
  });
});

describe("snapshot round-trip (plan §3.5)", () => {
  it("restores all four streams to a byte-identical continuation", () => {
    const live = new StreamRegistry({
      runSeed: 42,
      enableHeterogeneity: true,
      enableDecisionLayer: true,
    });
    for (let i = 0; i < 137; i++) {
      live.defaultStream.nextIntFromTo(0, 45);
      live.populationSampler!.nextGaussian(); // leaves the Gaussian cache half-consumed
      live.eLayerSampler!.nextDouble();
    }
    const snapshot = live.getState();

    const expected: number[] = [];
    for (let i = 0; i < 50; i++) {
      expected.push(live.defaultStream.nextIntFromTo(0, 45));
      expected.push(live.populationSampler!.nextGaussian());
      expected.push(live.eLayerSampler!.nextDouble());
    }

    const restored = new StreamRegistry({
      runSeed: 42,
      enableHeterogeneity: true,
      enableDecisionLayer: true,
    });
    restored.setState(snapshot);
    const replayed: number[] = [];
    for (let i = 0; i < 50; i++) {
      replayed.push(restored.defaultStream.nextIntFromTo(0, 45));
      replayed.push(restored.populationSampler!.nextGaussian());
      replayed.push(restored.eLayerSampler!.nextDouble());
    }
    expect(replayed).toEqual(expected);
  });

  it("refuses a snapshot from a different seed or a different stream configuration", () => {
    const withLayer = new StreamRegistry({ runSeed: 42, enableDecisionLayer: true });
    const withoutLayer = new StreamRegistry({ runSeed: 42 });
    expect(() => withoutLayer.setState(withLayer.getState())).toThrow(/ELayerSampler/u);

    const otherSeed = new StreamRegistry({ runSeed: 43, enableDecisionLayer: true });
    expect(() => otherSeed.setState(withLayer.getState())).toThrow(/run seed/u);
  });
});

describe("shuffleMt (plan §3.3 within-tick agent order)", () => {
  it("is a permutation, and is reproducible from the stream state", () => {
    const a = new StreamRegistry({ runSeed: 42 });
    const b = new StreamRegistry({ runSeed: 42 });
    const orderA = Int32Array.from({ length: 200 }, (_, i) => i);
    const orderB = Int32Array.from({ length: 200 }, (_, i) => i);
    shuffleMt(orderA, a.defaultStream);
    shuffleMt(orderB, b.defaultStream);
    expect([...orderA]).toEqual([...orderB]);
    expect([...orderA].sort((x, y) => x - y)).toEqual([...Array(200).keys()]);
    // A shuffle that returned identity would satisfy "is a permutation" vacuously.
    expect([...orderA]).not.toEqual([...Array(200).keys()]);
  });

  it("consumes exactly n-1 draws from the default stream", () => {
    const counted = new StreamRegistry({ runSeed: 42 });
    const reference = new StreamRegistry({ runSeed: 42 });
    const order = Int32Array.from({ length: 64 }, (_, i) => i);
    shuffleMt(order, counted.defaultStream);
    for (let i = 0; i < 63; i++) {
      reference.defaultStream.nextIntFromTo(0, 64 - 1 - i);
    }
    expect(counted.defaultStream.nextInt()).toBe(reference.defaultStream.nextInt());
  });

  it("handles degenerate lengths without drawing", () => {
    const r = new StreamRegistry({ runSeed: 42 });
    const ref = new StreamRegistry({ runSeed: 42 });
    shuffleMt([], r.defaultStream);
    shuffleMt([9], r.defaultStream);
    expect(r.defaultStream.nextInt()).toBe(ref.defaultStream.nextInt());
  });
});
