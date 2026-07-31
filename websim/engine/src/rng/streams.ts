/**
 * The four-stream RNG registry (PORT_MAP §1.8, plan §3.3 item 3).
 *
 * The model draws from four disjoint streams. Keeping them disjoint is not tidiness — it
 * is the reason a Phase-E parameter sweep does not reshuffle who owns a pet, and the reason
 * turning heterogeneity on leaves start locations bit-identical (`ContextCreator.java:726`
 * says so in a comment). Any port that collapses two streams into one still produces
 * plausible output and silently fails every archived run.
 *
 * | Stream | Generator | Seed | Draw sites |
 * |---|---|---|---|
 * | Repast default | colt `MersenneTwister` via `RandomHelper` | `randomSeed` | one `nextIntFromTo(0, nCamps−1)` per resident at build (the ONLY build-time default draw), then the per-tick agent shuffle |
 * | `PopulationSampler` | `java.util.Random` | `seed*1000003 + 17` | one `sample()` per resident, in the placement loop; **never constructed** when heterogeneity is off |
 * | `ELayerSampler` | `java.util.Random` | `seed*1000003 + 7919` | one `sample()` per resident, in a **second pass** after placement; never constructed when the layer is off |
 * | per-agent decision | `java.util.Random` | `runSeed*2654435761 + index*104729` | outreach / hazard / stuck Bernoullis, invariant to the tick shuffle |
 *
 * <p><b>Overflow is part of the contract.</b> The Java sources compute the derivations in
 * `long` arithmetic (`PopulationSampler.java:257` `new Random(seed * 1000003L + 17L)`;
 * `ELayerSampler.java:148` and `:170`), so large seeds wrap at 64 bits and the model keeps
 * the wrapped value. `BigInt.asIntN(64, …)` reproduces that — **at seed derivation only**;
 * the generators themselves stay on the fast paths proven bit-exact in DR-S5.
 *
 * <p><b>Streams are lazy by construction, not by optimisation.</b> `PopulationSampler` and
 * `ELayerSampler` are `null` in the certified model when their feature switch is off. This
 * registry mirrors that with explicit `enableHeterogeneity` / `enableDecisionLayer` flags
 * rather than constructing them eagerly, because "constructed but unused" and "not
 * constructed" are indistinguishable *only* until someone adds a draw.
 */

import { ColtMT19937, type ColtMT19937State } from "./ColtMT19937.js";
import { JavaRandom, type JavaRandomState } from "./JavaRandom.js";

/** `seed * 1000003L + 17L`, wrapped to a signed 64-bit `long`. */
export function populationSamplerSeed(runSeed: bigint): bigint {
  return BigInt.asIntN(64, runSeed * 1000003n + 17n);
}

/** `seed * 1000003L + 7919L`, wrapped to a signed 64-bit `long`. */
export function eLayerSamplerSeed(runSeed: bigint): bigint {
  return BigInt.asIntN(64, runSeed * 1000003n + 7919n);
}

/**
 * `runSeed * 2654435761L + index * 104729L`, wrapped to a signed 64-bit `long`
 * (`ELayerSampler.java:170`).
 *
 * Wrapping once at the end is equivalent to Java's wrap-per-operation because arithmetic
 * mod 2^64 is a ring homomorphism — the products and the sum all reduce consistently.
 */
export function agentDecisionSeed(runSeed: bigint, index: number): bigint {
  if (!Number.isInteger(index)) {
    throw new RangeError(`agent index must be an integer, got ${index}`);
  }
  return BigInt.asIntN(64, runSeed * 2654435761n + BigInt(index) * 104729n);
}

/** Snapshot of every stream's internal state (plan §3.5). */
export interface StreamRegistryState {
  readonly runSeed: string;
  readonly defaultStream: ColtMT19937State;
  readonly populationSampler: JavaRandomState | null;
  readonly eLayerSampler: JavaRandomState | null;
}

export interface StreamRegistryOptions {
  /** The run's master seed. Repast's `RandomHelper.getSeed()` is an `int` widened to `long`. */
  readonly runSeed: bigint | number;
  /** `enableHeterogeneity == 1` — constructs the `PopulationSampler` stream. */
  readonly enableHeterogeneity?: boolean;
  /** `enableDecisionLayer == 1` — constructs the `ELayerSampler` stream. */
  readonly enableDecisionLayer?: boolean;
}

export class StreamRegistry {
  /** Repast's default stream: `RandomHelper` over colt's `MersenneTwister`. */
  readonly defaultStream: ColtMT19937;

  /** `null` exactly when the certified model would not have constructed it. */
  readonly populationSampler: JavaRandom | null;

  /** `null` exactly when the certified model would not have constructed it. */
  readonly eLayerSampler: JavaRandom | null;

  /** The master seed as a Java `long`. */
  readonly runSeed: bigint;

  constructor(options: StreamRegistryOptions) {
    const seed =
      typeof options.runSeed === "bigint"
        ? options.runSeed
        : BigInt(Math.trunc(options.runSeed));
    this.runSeed = seed;

    // RandomHelper seeds colt's MersenneTwister with the run seed narrowed to int, which
    // is what Repast's own `setSeed(int)` accepts.
    this.defaultStream = new ColtMT19937(Number(BigInt.asIntN(32, seed)));

    this.populationSampler =
      options.enableHeterogeneity === true ? new JavaRandom(populationSamplerSeed(seed)) : null;
    this.eLayerSampler =
      options.enableDecisionLayer === true ? new JavaRandom(eLayerSamplerSeed(seed)) : null;
  }

  /**
   * The per-agent decision stream for `index` (creation order).
   *
   * A factory rather than a cached array: the model constructs `new Random(decisionSeed)`
   * per agent and the seed is a pure function of `(runSeed, index)`, so an agent's stream
   * is reproducible from its index alone and never depends on the tick shuffle.
   */
  agentStream(index: number): JavaRandom {
    return new JavaRandom(agentDecisionSeed(this.runSeed, index));
  }

  getState(): StreamRegistryState {
    return {
      runSeed: this.runSeed.toString(),
      defaultStream: this.defaultStream.getState(),
      populationSampler: this.populationSampler?.getState() ?? null,
      eLayerSampler: this.eLayerSampler?.getState() ?? null,
    };
  }

  setState(state: StreamRegistryState): void {
    if (state.runSeed !== this.runSeed.toString()) {
      throw new Error(
        `snapshot run seed ${state.runSeed} does not match registry seed ${this.runSeed}`,
      );
    }
    this.defaultStream.setState(state.defaultStream);
    if ((state.populationSampler === null) !== (this.populationSampler === null)) {
      throw new Error("snapshot PopulationSampler presence does not match registry");
    }
    if (state.populationSampler !== null && this.populationSampler !== null) {
      this.populationSampler.setState(state.populationSampler);
    }
    if ((state.eLayerSampler === null) !== (this.eLayerSampler === null)) {
      throw new Error("snapshot ELayerSampler presence does not match registry");
    }
    if (state.eLayerSampler !== null && this.eLayerSampler !== null) {
      this.eLayerSampler.setState(state.eLayerSampler);
    }
  }
}

/**
 * The `shuffle-mt` within-tick agent order (plan §3.3, "GRAFT — supersedes fidelity-first's
 * fixed creation order").
 *
 * <p>This is **our own documented permutation**, not a clone of anything in Java: Repast's
 * scheduler shuffles agents each tick, but reverse-engineering its internal ordering is out
 * of scope, so the port replicates the *semantics* (a uniform permutation drawn from the
 * colt default stream every tick) rather than the byte sequence. The declared consequence
 * is recorded in the plan's divergence register: within-tick ordering is the sole
 * Java-vs-TS divergence channel, and it can only matter where shelter capacity binds or an
 * L0 distance tie occurs.
 *
 * <p>Convention, fixed here so it never drifts: descending Fisher–Yates, `j` drawn as
 * `defaultStream.nextIntFromTo(0, i)` for `i = n−1 … 1`, swapping `order[i]` and `order[j]`.
 * Build-time draws all precede tick 1, so Tier-1 initial-world identity is unaffected.
 *
 * @param order mutated in place
 * @param stream the registry's `defaultStream`
 */
export function shuffleMt(order: Int32Array | number[], stream: ColtMT19937): void {
  for (let i = order.length - 1; i > 0; i--) {
    const j = stream.nextIntFromTo(0, i);
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
}
