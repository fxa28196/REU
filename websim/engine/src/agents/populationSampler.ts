/**
 * `PopulationSampler` — per-resident heterogeneous attributes (V18–V22) and the
 * comfortable walking speed (V10 revised).
 *
 * Verbatim port of `geography/agents/PopulationSampler.java`. Every constant is
 * transcribed from that file (which in turn transcribes the evidence review);
 * nothing here is fitted, rounded or "cleaned up".
 *
 * ## The draw order is the contract (PORT_MAP §1.8)
 *
 * Eight draws per resident, in this fixed order, on this sampler's **own**
 * `java.util.Random` stream (`seed * 1000003 + 17`):
 *
 * | # | draw | consumer |
 * |---|---|---|
 * | ① | `nextDouble` | age band (cumulative pick, strict `<`, fallback last index) |
 * | ② | `nextInt(bandWidth)` | age within band, uniform |
 * | ③ | `nextDouble` | sex |
 * | ④ | `nextDouble` | mobility limitation (threshold depends on the age from ②) |
 * | ⑤ | `nextDouble` | asthma |
 * | ⑥ | `nextDouble` | COPD |
 * | ⑦ | `nextDouble` | chronic physical — **unconditional**, and reporting-only |
 * | ⑧ | `nextGaussian` × N | truncated-normal speed (rejection loop) |
 *
 * ⑦ is the one a reader of the class Javadoc would miss: the doc comment lists
 * "age → sex → mobility → asthma → COPD → speed" and omits it, but
 * `PopulationSampler.java:278` draws it unconditionally before the speed
 * Gaussian. Dropping it shifts every subsequent resident's entire attribute
 * vector. PORT_MAP records this as merge resolution 2.
 *
 * Only ⑧'s draw count varies (rejection), and only ⑧ is a Gaussian — which
 * matters because `java.util.Random.nextGaussian` caches a second deviate, so
 * an odd/even mismatch in the rejection loop desynchronises the stream for
 * every later resident, not just this one.
 */

import type { JavaRandom } from "../rng/JavaRandom.js";

// ---------------------------------------------------------------------------
// V18 age — Pathways Study 2026 (N = 541, Multnomah County, PSU HRAC / OHSU)
// ---------------------------------------------------------------------------

export const AGE_BAND_LABELS = ["18-44", "45-64", "65+"] as const;
export type AgeBandLabel = (typeof AGE_BAND_LABELS)[number];

/** `[lowInclusive, highExclusive)` per band; 90 is a numerical guard, not a measurement. */
const AGE_BAND_BOUNDS: readonly (readonly [number, number])[] = [
  [18, 45],
  [45, 65],
  [65, 90],
];

const AGE_WEIGHTS: readonly number[] = [0.527, 0.423, 0.05];

// ---------------------------------------------------------------------------
// V19 sex — same source; feeds gait means and nothing else
// ---------------------------------------------------------------------------

export const SEX_LABELS = ["MALE", "FEMALE", "OTHER"] as const;
export type SexLabel = (typeof SEX_LABELS)[number];

const SEX_WEIGHTS: readonly number[] = [0.68432, 0.29271, 0.02297];

// ---------------------------------------------------------------------------
// V20 mobility — local lower bound with a CASPEH-derived age gradient
// ---------------------------------------------------------------------------

const MOBILITY_P_UNDER_55 = 0.152163;
const MOBILITY_P_55_PLUS = 0.347802;

export const MOBILITY_CATEGORY_LABELS = ["unimpaired", "ambulant_impaired_no_aid"] as const;
export type MobilityCategoryLabel = (typeof MOBILITY_CATEGORY_LABELS)[number];

// ---------------------------------------------------------------------------
// V21 respiratory + chronic physical
// ---------------------------------------------------------------------------

const P_ASTHMA = 0.15;
const P_COPD = 0.105;
/** Reporting stratum only (Pathways 2026). Drawn unconditionally — see the header. */
const P_CHRONIC_PHYSICAL = 0.391;

// ---------------------------------------------------------------------------
// V10 speed — Bohannon & Williams Andrews 2011 decade × sex means
// ---------------------------------------------------------------------------

const SPEED_MEAN_MEN: readonly number[] = [1.358, 1.433, 1.434, 1.433, 1.339, 1.262, 0.968];
const SPEED_MEAN_WOMEN: readonly number[] = [1.341, 1.337, 1.39, 1.313, 1.241, 1.132, 0.943];

const SPEED_CV = 0.13;
const IMPAIRED_SPEED_MEAN = 0.95;
const IMPAIRED_SPEED_SD = 0.32;
const SPEED_MIN_MPS = 0.4;
const SPEED_MAX_MPS = 2.2;
/**
 * Buekers 2024, applied **additively** (`mu + delta`, delta negative) and never
 * as a dose multiplier. Written as a negative constant added, not a positive
 * constant subtracted, because that is the expression Java evaluates.
 */
const COPD_SPEED_DELTA_MPS = -0.19;

/** Rejection attempts before the truncated normal gives up and clamps the MEAN. */
const TRUNC_NORMAL_ATTEMPTS = 100;

/** One resident's sampled attributes. Immutable, exported verbatim. */
export interface PopulationAttributes {
  readonly ageYears: number;
  readonly ageBand: AgeBandLabel;
  readonly sex: SexLabel;
  readonly mobilityLimited: boolean;
  readonly mobilityCategory: MobilityCategoryLabel;
  readonly asthma: boolean;
  readonly copd: boolean;
  /** Any chronic physical condition (Pathways 2026). Reporting only. */
  readonly chronicPhysical: boolean;
  readonly walkingSpeedMps: number;
}

/** Realised marginals, in the order `OutcomeLogger` writes them. */
export interface PopulationMarginals {
  readonly sampled: number;
  readonly mobilityLimitedShare: number;
  readonly asthmaShare: number;
  readonly copdShare: number;
  readonly anyRespiratoryShare: number;
  readonly chronicPhysicalShare: number;
  readonly age55PlusShare: number;
  readonly meanWalkingSpeedMps: number;
}

/**
 * Bohannon & Williams Andrews 2011 mean for this age and sex.
 *
 * `OTHER` takes the unweighted mean of the two published columns: the source has
 * no third column, and assigning a sex in order to obtain a speed would be an
 * invention. Ages 18–19 fall on the 20–29 row (an extrapolation guard).
 */
export function freeSpeedMean(ageYears: number, sex: SexLabel): number {
  // Java's `ageYears / 10` is integer division; ages here are positive, so this
  // is `Math.floor`. The clamp is Java's `Math.max(0, Math.min(6, …))`.
  const row = Math.max(0, Math.min(6, Math.floor(ageYears / 10) - 2));
  if (sex === "MALE") {
    return SPEED_MEAN_MEN[row]!;
  }
  if (sex === "FEMALE") {
    return SPEED_MEAN_WOMEN[row]!;
  }
  return 0.5 * (SPEED_MEAN_MEN[row]! + SPEED_MEAN_WOMEN[row]!);
}

export class PopulationSampler {
  private readonly rng: JavaRandom;

  private nSampled = 0;
  private nMobilityLimited = 0;
  private nAsthma = 0;
  private nCopd = 0;
  private nAnyRespiratory = 0;
  private nChronicPhysical = 0;
  private n55Plus = 0;
  private speedSum = 0;

  /**
   * @param rng the sampler's own stream — construct it via
   *   `StreamRegistry` (`populationSamplerSeed(runSeed)`), never share one.
   */
  constructor(rng: JavaRandom) {
    this.rng = rng;
  }

  /** Samples one resident. Call order defines the population for a given seed. */
  sample(): PopulationAttributes {
    const bandIndex = this.pick(AGE_WEIGHTS); // ①
    const [low, high] = AGE_BAND_BOUNDS[bandIndex]!;
    const ageYears = low + this.rng.nextInt(high - low); // ②

    const sex = SEX_LABELS[this.pick(SEX_WEIGHTS)]!; // ③

    const mobilityLimited =
      this.rng.nextDouble() < (ageYears >= 55 ? MOBILITY_P_55_PLUS : MOBILITY_P_UNDER_55); // ④
    const mobilityCategory: MobilityCategoryLabel = mobilityLimited
      ? "ambulant_impaired_no_aid"
      : "unimpaired";

    const asthma = this.rng.nextDouble() < P_ASTHMA; // ⑤
    const copd = this.rng.nextDouble() < P_COPD; // ⑥
    const chronicPhysical = this.rng.nextDouble() < P_CHRONIC_PHYSICAL; // ⑦

    let speed: number; // ⑧
    if (mobilityLimited) {
      // Boyce's impaired categories already embed a slower walker, so the COPD
      // decrement is NOT stacked on top of them.
      speed = this.truncatedNormal(IMPAIRED_SPEED_MEAN, IMPAIRED_SPEED_SD);
    } else {
      let mu = freeSpeedMean(ageYears, sex);
      if (copd) {
        mu = Math.max(SPEED_MIN_MPS, mu + COPD_SPEED_DELTA_MPS);
      }
      speed = this.truncatedNormal(mu, SPEED_CV * mu);
    }

    this.nSampled++;
    if (mobilityLimited) this.nMobilityLimited++;
    if (asthma) this.nAsthma++;
    if (copd) this.nCopd++;
    if (asthma || copd) this.nAnyRespiratory++;
    if (chronicPhysical) this.nChronicPhysical++;
    if (ageYears >= 55) this.n55Plus++;
    this.speedSum += speed;

    return {
      ageYears,
      ageBand: AGE_BAND_LABELS[bandIndex]!,
      sex,
      mobilityLimited,
      mobilityCategory,
      asthma,
      copd,
      chronicPhysical,
      walkingSpeedMps: speed,
    };
  }

  /** Normal(mean, sd) resampled until inside the [0.40, 2.20] m/s guard. */
  private truncatedNormal(mean: number, sd: number): number {
    for (let attempt = 0; attempt < TRUNC_NORMAL_ATTEMPTS; attempt++) {
      const v = mean + sd * this.rng.nextGaussian();
      if (v >= SPEED_MIN_MPS && v <= SPEED_MAX_MPS) {
        return v;
      }
    }
    // Unreachable for the published parameters; clamp rather than loop forever.
    return Math.max(SPEED_MIN_MPS, Math.min(SPEED_MAX_MPS, mean));
  }

  /** Categorical draw over already-normalised weights; strict `<`, last-index fallback. */
  private pick(weights: readonly number[]): number {
    const u = this.rng.nextDouble();
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i]!;
      if (u < acc) {
        return i;
      }
    }
    return weights.length - 1;
  }

  marginals(): PopulationMarginals {
    return {
      sampled: this.nSampled,
      mobilityLimitedShare: this.share(this.nMobilityLimited),
      asthmaShare: this.share(this.nAsthma),
      copdShare: this.share(this.nCopd),
      anyRespiratoryShare: this.share(this.nAnyRespiratory),
      chronicPhysicalShare: this.share(this.nChronicPhysical),
      age55PlusShare: this.share(this.n55Plus),
      meanWalkingSpeedMps: this.nSampled === 0 ? Number.NaN : this.speedSum / this.nSampled,
    };
  }

  private share(count: number): number {
    return this.nSampled === 0 ? Number.NaN : count / this.nSampled;
  }
}

/** Published marginals the sampler targets, for the load-time comparison. */
export const POPULATION_PUBLISHED_TARGETS = Object.freeze({
  mobilityLimited: 0.192,
  asthma: 0.15,
  copd: 0.105,
  anyRespiratory: 0.239,
  chronicPhysical: 0.391,
  ageBands: Object.freeze([0.527, 0.423, 0.05]),
});
