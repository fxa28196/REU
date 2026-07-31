/**
 * `PopulationSampler` / `ELayerSampler` unit suite — no fixtures, always green.
 *
 * These tests do not compare against the Java dumps (`tier1.parity.test.ts`
 * does that). They pin the properties a future edit is most likely to break
 * *silently*, by driving the samplers with a **scripted RNG** whose draw
 * sequence is chosen so that a wrong draw ORDER produces a wrong attribute — the
 * one failure mode a fixture comparison localises poorly, because every
 * downstream resident is wrong too.
 */

import { describe, expect, it } from "vitest";

import {
  ELayerSampler,
  P_HAS_DEPENDENTS_SOURCED,
  P_HAS_PET_SOURCED,
} from "../../src/agents/eLayerSampler.js";
import { PopulationSampler, freeSpeedMean } from "../../src/agents/populationSampler.js";
import { JavaRandom } from "../../src/rng/JavaRandom.js";
import { javaFormatFixed } from "../../src/mathx/format.js";
import { agentDecisionSeed, populationSamplerSeed, eLayerSamplerSeed } from "../../src/rng/streams.js";

/**
 * A `JavaRandom` whose `nextDouble` returns a scripted sequence and whose
 * `nextGaussian` returns a scripted sequence, recording the order in which the
 * two were interleaved. Subclassing rather than duck-typing keeps the sampler's
 * parameter type honest.
 */
class ScriptedRandom extends JavaRandom {
  readonly trace: string[] = [];
  private doubles: number[];
  private gaussians: number[];
  private ints: number[];

  constructor(doubles: number[], gaussians: number[], ints: number[] = []) {
    super(0n);
    this.doubles = doubles;
    this.gaussians = gaussians;
    this.ints = ints;
  }

  override nextDouble(): number {
    const v = this.doubles.shift();
    if (v === undefined) {
      throw new Error("scripted nextDouble exhausted");
    }
    this.trace.push(`d:${v}`);
    return v;
  }

  override nextGaussian(): number {
    const v = this.gaussians.shift();
    if (v === undefined) {
      throw new Error("scripted nextGaussian exhausted");
    }
    this.trace.push(`g:${v}`);
    return v;
  }

  override nextInt(bound?: number): number {
    const v = this.ints.shift();
    if (v === undefined) {
      throw new Error("scripted nextInt exhausted");
    }
    this.trace.push(`i:${v}/${bound ?? "-"}`);
    return v;
  }
}

describe("PopulationSampler draw order", () => {
  it("draws exactly 6 doubles, 1 int and >=1 gaussian per resident, in the fixed order", () => {
    // Distinct thresholds are chosen so that each returned value can only have
    // been consumed by its intended consumer:
    //   ① 0.99 -> past 0.527+0.423 = 0.95, so the 65+ band
    //   ③ 0.99 -> past 0.68432+0.29271 = 0.97703, so OTHER
    //   ④ 0.30 -> below 0.347802 (the 55+ threshold) but above 0.152163: only a
    //             correct AGE-AWARE threshold makes this resident mobility-limited,
    //             so a port that read the age from the wrong draw fails here
    //   ⑤ 0.20 -> above 0.15, no asthma
    //   ⑥ 0.05 -> below 0.105, COPD
    //   ⑦ 0.99 -> above 0.391, no chronic-physical (proves the draw is consumed)
    const rng = new ScriptedRandom([0.99, 0.99, 0.3, 0.2, 0.05, 0.99], [0], [2]);
    const a = new PopulationSampler(rng).sample();

    expect(rng.trace).toEqual([
      "d:0.99",
      "i:2/25",
      "d:0.99",
      "d:0.3",
      "d:0.2",
      "d:0.05",
      "d:0.99",
      "g:0",
    ]);
    expect(a.ageBand).toBe("65+");
    expect(a.ageYears).toBe(67);
    expect(a.sex).toBe("OTHER");
    expect(a.mobilityLimited).toBe(true);
    expect(a.mobilityCategory).toBe("ambulant_impaired_no_aid");
    expect(a.asthma).toBe(false);
    expect(a.copd).toBe(true);
    expect(a.chronicPhysical).toBe(false);
    // Mobility-limited: Boyce N(0.95, 0.32) BY REPLACEMENT — the COPD delta is
    // NOT stacked, so a gaussian of 0 gives exactly the impaired mean.
    expect(a.walkingSpeedMps).toBe(0.95);
  });

  it("applies the COPD delta additively and never to a mobility-limited resident", () => {
    // Unimpaired 30-year-old male with COPD: mu = 1.433 + (-0.19) = 1.243.
    const rng = new ScriptedRandom([0, 0, 0.9, 0.9, 0.05, 0.9], [0], [12]);
    const a = new PopulationSampler(rng).sample();
    expect(a.ageYears).toBe(30);
    expect(a.sex).toBe("MALE");
    expect(a.mobilityLimited).toBe(false);
    expect(a.copd).toBe(true);
    expect(a.walkingSpeedMps).toBe(1.433 + -0.19);
  });

  it("asthma has no speed effect (deliberate asymmetry, V39)", () => {
    const withAsthma = new ScriptedRandom([0, 0, 0.9, 0.05, 0.9, 0.9], [0.5], [12]);
    const without = new ScriptedRandom([0, 0, 0.9, 0.9, 0.9, 0.9], [0.5], [12]);
    const a = new PopulationSampler(withAsthma).sample();
    const b = new PopulationSampler(without).sample();
    expect(a.asthma).toBe(true);
    expect(b.asthma).toBe(false);
    expect(a.walkingSpeedMps).toBe(b.walkingSpeedMps);
  });

  it("rejects out-of-guard gaussians and clamps the MEAN after 100 attempts", () => {
    // A mobility-limited resident: N(0.95, 0.32). +10 sigma and -10 sigma both
    // fall outside [0.40, 2.20], so the first two draws are rejected.
    const impaired: [number[], number[]] = [[0.99, 0.99, 0.3, 0.9, 0.9, 0.9], [10, -10, 0.5]];
    const rng = new ScriptedRandom(impaired[0].slice(), impaired[1].slice(), [2]);
    const a = new PopulationSampler(rng).sample();
    expect(a.mobilityLimited).toBe(true);
    expect(a.walkingSpeedMps).toBe(0.95 + 0.32 * 0.5);

    // 100 rejections in a row -> the clamped mean, not an infinite loop.
    const doomed = new ScriptedRandom(
      impaired[0].slice(),
      Array.from({ length: 100 }, () => 100),
      [2],
    );
    expect(new PopulationSampler(doomed).sample().walkingSpeedMps).toBe(0.95);
  });

  it("uses the last index when the categorical weights do not reach the draw", () => {
    // Age weights sum to 1.0 but floating-point accumulation can leave a hair
    // below; the fallback is the certified behaviour, so u = 1 - 1e-16 must not
    // throw or return -1.
    const rng = new ScriptedRandom([1 - Number.EPSILON / 2, 1 - Number.EPSILON / 2, 0.9, 0.9, 0.9, 0.9], [0], [2]);
    const a = new PopulationSampler(rng).sample();
    expect(a.ageBand).toBe("65+");
    expect(a.sex).toBe("OTHER");
  });

  it("maps age and sex onto the Bohannon decade rows, with the 18-19 guard", () => {
    expect(freeSpeedMean(18, "MALE")).toBe(1.358); // clamped up to the 20s row
    expect(freeSpeedMean(25, "MALE")).toBe(1.358);
    expect(freeSpeedMean(89, "FEMALE")).toBe(0.943); // clamped down to the 80+ row
    expect(freeSpeedMean(45, "OTHER")).toBe(0.5 * (1.434 + 1.39));
  });
});

describe("ELayerSampler draw order", () => {
  it("draws all five variates unconditionally, in order, even at degenerate params", () => {
    // The R3 null: sigmaTheta is not this sampler's parameter at all — theta is
    // stored RAW — but pAware = 1 and every barrier probability could tempt an
    // implementation to skip a draw. None may be skipped.
    const rng = new ScriptedRandom([0.5, 0.5, 0.5, 0.5], [1.25]);
    const s = new ELayerSampler(rng, {
      runSeed: 42n,
      pAware: 1,
      pHeavy: 0,
      pPet: 0,
      pDependents: 0,
      groupSpeedDeltaMps: 0,
    });
    const d = s.sample();
    expect(rng.trace).toEqual(["d:0.5", "d:0.5", "d:0.5", "d:0.5", "g:1.25"]);
    expect(d.awareInitial).toBe(true);
    expect(d.heavyBelongings).toBe(false);
    expect(d.hasPet).toBe(false);
    expect(d.hasDependents).toBe(false);
    expect(d.thetaZ).toBe(1.25);
    expect(d.groupSpeedDeltaMps).toBe(0);
  });

  it("zeroes the group delta unless the resident has dependents", () => {
    const withDeps = new ELayerSampler(new ScriptedRandom([0.5, 0.5, 0.5, 0.001], [0]), {
      runSeed: 42n,
      pAware: 1,
      pHeavy: 0,
      pPet: 0,
      pDependents: P_HAS_DEPENDENTS_SOURCED,
      groupSpeedDeltaMps: 0.06,
    });
    const d = withDeps.sample();
    expect(d.hasDependents).toBe(true);
    expect(d.groupSpeedDeltaMps).toBe(0.06);

    const without = new ELayerSampler(new ScriptedRandom([0.5, 0.5, 0.5, 0.9], [0]), {
      runSeed: 42n,
      pAware: 1,
      pHeavy: 0,
      pPet: P_HAS_PET_SOURCED,
      pDependents: P_HAS_DEPENDENTS_SOURCED,
      groupSpeedDeltaMps: 0.06,
    });
    expect(without.sample().groupSpeedDeltaMps).toBe(0);
  });

  it("derives the per-agent decision seed from (runSeed, creation index) only", () => {
    const rng = new ScriptedRandom(
      Array.from({ length: 12 }, () => 0.5),
      [0, 0, 0],
    );
    const s = new ELayerSampler(rng, {
      runSeed: 42n,
      pAware: 1,
      pHeavy: 1,
      pPet: 1,
      pDependents: 1,
      groupSpeedDeltaMps: 0.06,
    });
    for (let i = 0; i < 3; i++) {
      expect(s.sample().decisionSeed).toBe(agentDecisionSeed(42n, i));
    }
  });
});

describe("finding F1-F1 — the published seed-42 marginals are seed 48's", () => {
  it("renders seed 48, not seed 42, as 0.195/0.147/0.104/0.235/0.259/1.280", () => {
    const render = (seed: number, precision: number): string[] => {
      const s = new PopulationSampler(new JavaRandom(populationSamplerSeed(BigInt(seed))));
      for (let i = 0; i < 6842; i++) {
        s.sample();
      }
      const m = s.marginals();
      return [
        m.mobilityLimitedShare,
        m.asthmaShare,
        m.copdShare,
        m.anyRespiratoryShare,
        m.age55PlusShare,
        m.meanWalkingSpeedMps,
      ].map((v) => javaFormatFixed(v, precision));
    };

    const QUOTED = ["0.195", "0.147", "0.104", "0.235", "0.259", "1.280"];
    expect(render(48, 3), "seed 48 at %.3f").toEqual(QUOTED);
    expect(render(42, 3), "seed 42 at %.3f").not.toEqual(QUOTED);
    // The tie-breaker: both means are 1.2805 at 4 dp, and HALF_UP on the
    // shortest representation still separates them at 3 dp.
    expect(render(42, 3)[5]).toBe("1.281");
    expect(render(48, 3)[5]).toBe("1.280");
    expect(render(42, 4)).toEqual(["0.1988", "0.1478", "0.1079", "0.2381", "0.2622", "1.2805"]);
    expect(render(48, 4)).toEqual(["0.1954", "0.1475", "0.1039", "0.2353", "0.2587", "1.2805"]);
  }, 60_000);
});

describe("stream seed derivations", () => {
  it("matches the seeds the F1 exporter recorded in its dump headers", () => {
    // `# populationSamplerSeed=42000143  eLayerSamplerSeed=42008045`
    expect(populationSamplerSeed(42n)).toBe(42000143n);
    expect(eLayerSamplerSeed(42n)).toBe(42008045n);
    expect(populationSamplerSeed(43n)).toBe(43000146n);
    expect(eLayerSamplerSeed(43n)).toBe(43008048n);
    expect(populationSamplerSeed(44n)).toBe(44000149n);
    expect(eLayerSamplerSeed(44n)).toBe(44008051n);
  });
});
