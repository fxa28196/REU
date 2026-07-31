/**
 * `ELayerSampler` — the Phase-E decision-layer attributes (V29, V31–V35) plus
 * the per-agent decision-stream seed.
 *
 * Verbatim port of `geography/agents/ELayerSampler.java`.
 *
 * ## Five unconditional draws, in this order (PORT_MAP §1.8)
 *
 * ① `nextDouble` aware · ② `nextDouble` heavy belongings · ③ `nextDouble` pet ·
 * ④ `nextDouble` dependents · ⑤ `nextGaussian` θ_z.
 *
 * **Unconditional is the whole point.** `sigmaTheta = 0` — the R3 degenerate
 * null — still consumes ⑤, because θ is stored RAW and scaled at use. If a port
 * "optimised" the draw away when sigma is zero, the E0-null configuration would
 * stop being byte-identical to the archived no-layer runs and the R3 vehicle
 * would silently stop proving anything. The same reasoning covers ②–④: the
 * realised E-population must not move when a barrier coefficient is swept, so
 * who owns a pet is decided before any coefficient is read.
 *
 * The F1 fixture export turned that from a claim into a measurement: the
 * belongings / pet / dependents / θ columns are identical across all ten
 * decision-layer configs at a seed **even though `pAwareInit` differs**
 * (1.0 in E0, 0.356 in ER/SE) — see `DR-F1-world-fixtures.md` §3.
 *
 * ## The second pass
 *
 * This sampler runs in `ContextCreator`'s **step 11**, a separate loop over the
 * residents in creation order, after placement has finished. Interleaving it
 * into the placement loop would not change this stream's own sequence, but the
 * certified model does not do that, and the manifest census is written from the
 * counters below — so the pass stays a pass.
 */

import type { JavaRandom } from "../rng/JavaRandom.js";
import { agentDecisionSeed } from "../rng/streams.js";

// Sourced values, kept for provenance and preset generation. The engine always
// reads the configured parameter — these are never silently substituted.
export const P_AWARE_INIT_SOURCED = 0.356;
export const P_HEAVY_BELONGINGS_SOURCED = 0.284;
export const P_HAS_PET_SOURCED = 0.117;
export const P_HAS_DEPENDENTS_SOURCED = 0.0044;
export const GROUP_SPEED_DELTA_SOURCED_MPS = 0.06;

/** One resident's sampled decision attributes. Immutable, exported verbatim. */
export interface DecisionAttributes {
  /** Knows shelters exist at t0 (V29). */
  readonly awareInitial: boolean;
  /** Heavy belongings / cart (V31) — a barrier cost, never a speed penalty. */
  readonly heavyBelongings: boolean;
  readonly hasPet: boolean;
  readonly hasDependents: boolean;
  /** RAW standard-normal trait draw (V35); scaled by `sigmaTheta` at use. */
  readonly thetaZ: number;
  /** Group-pace reduction while travelling (V34); 0 unless `hasDependents`. */
  readonly groupSpeedDeltaMps: number;
  /** Seed for this agent's private in-run decision stream, as a Java `long`. */
  readonly decisionSeed: bigint;
}

/** Realised marginals, in the order the manifest census writes them. */
export interface DecisionMarginals {
  readonly sampled: number;
  readonly awareShare: number;
  readonly heavyBelongingsShare: number;
  readonly petShare: number;
  readonly dependentsShare: number;
  /** At least one of belongings / pet / dependents. */
  readonly anyBarrierShare: number;
  /** Two or more barriers — the compound stratum A-28 reports. */
  readonly compoundBarrierShare: number;
}

export interface ELayerSamplerOptions {
  readonly runSeed: bigint;
  readonly pAware: number;
  readonly pHeavy: number;
  readonly pPet: number;
  readonly pDependents: number;
  readonly groupSpeedDeltaMps: number;
}

export class ELayerSampler {
  private readonly rng: JavaRandom;
  private readonly runSeed: bigint;
  private readonly pAware: number;
  private readonly pHeavy: number;
  private readonly pPet: number;
  private readonly pDependents: number;
  private readonly groupSpeedDeltaMps: number;

  private nSampled = 0;
  private nAware = 0;
  private nHeavy = 0;
  private nPet = 0;
  private nDependents = 0;
  private nAnyBarrier = 0;
  private nCompoundBarrier = 0;

  /**
   * @param rng this sampler's own stream (`eLayerSamplerSeed(runSeed)`), which
   *   must be distinct from both the Repast default stream and
   *   `PopulationSampler`'s.
   */
  constructor(rng: JavaRandom, options: ELayerSamplerOptions) {
    this.rng = rng;
    this.runSeed = options.runSeed;
    this.pAware = options.pAware;
    this.pHeavy = options.pHeavy;
    this.pPet = options.pPet;
    this.pDependents = options.pDependents;
    this.groupSpeedDeltaMps = options.groupSpeedDeltaMps;
  }

  /** Samples one resident. Call order must match agent creation order. */
  sample(): DecisionAttributes {
    const index = this.nSampled;
    const awareInitial = this.rng.nextDouble() < this.pAware; // ①
    const heavyBelongings = this.rng.nextDouble() < this.pHeavy; // ②
    const hasPet = this.rng.nextDouble() < this.pPet; // ③
    const hasDependents = this.rng.nextDouble() < this.pDependents; // ④
    const thetaZ = this.rng.nextGaussian(); // ⑤
    const groupSpeedDeltaMps = hasDependents ? this.groupSpeedDeltaMps : 0;
    const decisionSeed = agentDecisionSeed(this.runSeed, index);

    this.nSampled++;
    if (awareInitial) this.nAware++;
    if (heavyBelongings) this.nHeavy++;
    if (hasPet) this.nPet++;
    if (hasDependents) this.nDependents++;
    const barriers =
      (heavyBelongings ? 1 : 0) + (hasPet ? 1 : 0) + (hasDependents ? 1 : 0);
    if (barriers >= 1) this.nAnyBarrier++;
    if (barriers >= 2) this.nCompoundBarrier++;

    return {
      awareInitial,
      heavyBelongings,
      hasPet,
      hasDependents,
      thetaZ,
      groupSpeedDeltaMps,
      decisionSeed,
    };
  }

  marginals(): DecisionMarginals {
    return {
      sampled: this.nSampled,
      awareShare: this.share(this.nAware),
      heavyBelongingsShare: this.share(this.nHeavy),
      petShare: this.share(this.nPet),
      dependentsShare: this.share(this.nDependents),
      anyBarrierShare: this.share(this.nAnyBarrier),
      compoundBarrierShare: this.share(this.nCompoundBarrier),
    };
  }

  private share(count: number): number {
    return this.nSampled === 0 ? Number.NaN : count / this.nSampled;
  }
}
