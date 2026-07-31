import { describe, expect, it } from "vitest";

import { doubleToHex, floatToHex, intToHex, longToHex } from "../../src/rng/bits.js";
import { COLT_CONSTANTS, ColtMT19937 } from "../../src/rng/ColtMT19937.js";
import { coltFixtures, digestTokens, firstDivergence } from "./fixtures.js";
import type { FixtureSequence } from "./fixtures.js";

function generate(seq: FixtureSequence): string[] {
  const seed = Number(seq.seed);
  const mt = new ColtMT19937(seed);
  const out: string[] = new Array<string>(seq.count);

  switch (seq.kind) {
    case "nextInt":
      for (let i = 0; i < seq.count; i++) out[i] = intToHex(mt.nextInt());
      break;
    case "raw":
      for (let i = 0; i < seq.count; i++) out[i] = doubleToHex(mt.raw());
      break;
    case "nextDouble":
      for (let i = 0; i < seq.count; i++) out[i] = doubleToHex(mt.nextDouble());
      break;
    case "nextLong":
      for (let i = 0; i < seq.count; i++) out[i] = longToHex(mt.nextLong());
      break;
    case "nextFloat":
      for (let i = 0; i < seq.count; i++) out[i] = floatToHex(mt.nextFloat());
      break;
    case "nextIntFromTo": {
      const [from, to] = seq.params.split(",").map(Number) as [number, number];
      for (let i = 0; i < seq.count; i++) out[i] = intToHex(mt.nextIntFromTo(from, to));
      break;
    }
    case "uniformNextInt":
      for (let i = 0; i < seq.count; i++) out[i] = intToHex(mt.uniformDefaultNextInt());
      break;
    default:
      throw new Error(`unknown fixture kind: ${seq.kind}`);
  }
  return out;
}

describe("ColtMT19937 vs cern.jet.random fixtures", () => {
  it("dumped fixtures are present and well formed", () => {
    expect(coltFixtures.generator).toBe("cern.jet.random.engine.MersenneTwister");
    expect(coltFixtures.drawsPerSequence).toBe(10_000);
    expect(coltFixtures.sequences.length).toBeGreaterThan(100);
  });

  it("Repast RandomHelper takes the same path as new Uniform(new MersenneTwister(seed))", () => {
    // Recorded by the dumper against the real Repast runtime: this is what licenses
    // modelling the default stream as a bare seeded MersenneTwister (PORT_MAP 1.8).
    expect(coltFixtures.randomHelperCrossCheck).toMatch(/^IDENTICAL over \d+ draws$/);
  });

  for (const seq of coltFixtures.sequences) {
    it(`${seq.id} is bit-exact (${seq.count} draws)`, () => {
      const tokens = generate(seq);
      expect(tokens).toHaveLength(seq.count);

      const head = tokens.slice(0, seq.head.length);
      const at = firstDivergence(head, seq.head);
      expect(
        at,
        at < 0
          ? ""
          : `first divergence at draw ${at}: java=${seq.head[at]} ts=${head[at]} (seed ${seq.seed} = ${seq.seedNote})`,
      ).toBe(-1);

      expect(digestTokens(tokens)).toBe(seq.sha256);
    });
  }
});

describe("colt constants and nextIntFromTo semantics (W15)", () => {
  it("the magic literals are the values the bytecode holds", () => {
    expect(COLT_CONSTANTS.MATRIX_A).toBe(-1727483681); // 0x9908b0df
    expect(COLT_CONSTANTS.UPPER_MASK).toBe(-2147483648);
    expect(COLT_CONSTANTS.LOWER_MASK).toBe(2147483647);
    expect(COLT_CONSTANTS.TEMPERING_MASK_B).toBe(-1658038656); // 0x9d2c5680
    expect(COLT_CONSTANTS.TEMPERING_MASK_C).toBe(-272236544); // 0xefc60000
    expect(COLT_CONSTANTS.SEED_MULTIPLIER).toBe(1812433253);
  });

  it("the scaling constants are exact powers of two", () => {
    expect(COLT_CONSTANTS.RAW_SCALE).toBe(2 ** -32);
    expect(COLT_CONSTANTS.TWO_POW_MINUS_64).toBe(2 ** -64);
    expect(COLT_CONSTANTS.LONG_MIN_AS_DOUBLE).toBe(-(2 ** 63));
  });

  // These sweep hundreds of thousands of draws. Calling expect() per iteration costs
  // more than the generator does and pushed the suite past its timeout under parallel
  // load, so each loop accumulates plain counters and asserts once at the end.
  it("raw() rejects zero and is supported on [2^-32, 1 - 2^-32]", () => {
    const mt = new ColtMT19937(42);
    let min = Infinity;
    let max = -Infinity;
    let outOfRange = 0;
    for (let i = 0; i < 200_000; i++) {
      const v = mt.raw();
      if (!(v > 0 && v < 1)) outOfRange++;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(outOfRange).toBe(0);
    expect(min).toBeGreaterThanOrEqual(2 ** -32);
    expect(max).toBeLessThanOrEqual(1 - 2 ** -32);
  });

  it("nextIntFromTo over the full int range uses long width 2^32 and never returns MIN_VALUE", () => {
    // The whole point of colt computing the width in long: 1 + MAX - MIN == 2^32.
    // An int-width port would compute 0 here and return `from` every time.
    const mt = new ColtMT19937(2026);
    let sawMinValue = 0;
    let outOfRange = 0;
    let sawNegative = false;
    let sawPositive = false;
    for (let i = 0; i < 200_000; i++) {
      const v = mt.nextIntFromTo(-2147483648, 2147483647);
      if (v === -2147483648) sawMinValue++; // raw() never returns 0 => low end excluded
      if (v < -2147483647 || v > 2147483647) outOfRange++;
      if (v < 0) sawNegative = true;
      if (v > 0) sawPositive = true;
    }
    expect(sawMinValue).toBe(0);
    expect(outOfRange).toBe(0);
    expect(sawNegative && sawPositive).toBe(true);
  });

  it("nextIntFromTo stays in [from, to] for ordinary and negative ranges", () => {
    const mt = new ColtMT19937(9);
    for (const [from, to] of [
      [0, 45],
      [1, 6],
      [-5, 5],
      [-100, -1],
      [0, 0],
      [0, 6841],
    ] as const) {
      let outOfRange = 0;
      for (let i = 0; i < 20_000; i++) {
        const v = mt.nextIntFromTo(from, to);
        if (v < from || v > to) outOfRange++;
      }
      expect(outOfRange, `range ${from}..${to}`).toBe(0);
    }
  });

  it("an inverted range (to < from) truncates toward zero rather than flooring", () => {
    // Documented, not endorsed. For (from=10, to=3) the width is 1 + 3 - 10 = -6, so
    // width*raw() lies in (-6, 0) and d2l truncates *up* toward zero, giving offsets
    // {0, -1, -2, -3, -4, -5} -- i.e. results {5..10}, which includes `from` and
    // excludes `to`. A port that used Math.floor would produce {4..9} instead. The
    // matching Java fixture (mt-s*-nextIntFromTo-10_3) is what actually pins this.
    const mt = new ColtMT19937(3);
    const seen = new Set<number>();
    for (let i = 0; i < 20_000; i++) {
      seen.add(mt.nextIntFromTo(10, 3));
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([5, 6, 7, 8, 9, 10]);
  });

  it("colt seeding uses an arithmetic shift, so it diverges from reference MT19937", () => {
    // Reference MT19937 init_genrand uses `>>> 30`. If a port copies that, the state
    // tables differ as soon as a negative word appears. This asserts the difference is
    // real (i.e. that the distinction is load-bearing, not pedantry).
    const colt = new ColtMT19937(42);
    const reference = referenceMt19937(42);
    let differs = false;
    for (let i = 0; i < 64; i++) {
      if (colt.nextInt() !== reference()) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });

  it("state round-trips exactly across a block boundary", () => {
    const mt = new ColtMT19937(11);
    for (let i = 0; i < 620; i++) mt.nextInt(); // land near the 624-word refill
    const snapshot = mt.getState();
    const expected = Array.from({ length: 50 }, () => intToHex(mt.nextInt()));
    mt.setState(snapshot);
    const replayed = Array.from({ length: 50 }, () => intToHex(mt.nextInt()));
    expect(replayed).toEqual(expected);
  });
});

/** Textbook MT19937 (logical shift in init_genrand) -- used only as a contrast. */
function referenceMt19937(seed: number): () => number {
  const mt = new Int32Array(624);
  mt[0] = seed | 0;
  for (let i = 1; i < 624; i++) {
    const prev = mt[i - 1]!;
    mt[i] = (Math.imul(1812433253, prev ^ (prev >>> 30)) + i) | 0;
  }
  let mti = 624;
  return () => {
    if (mti === 624) {
      for (let kk = 0; kk < 624; kk++) {
        const y = (mt[kk]! & -2147483648) | (mt[(kk + 1) % 624]! & 2147483647);
        mt[kk] = mt[(kk + 397) % 624]! ^ (y >>> 1) ^ ((y & 1) !== 0 ? -1727483681 : 0);
      }
      mti = 0;
    }
    let y = mt[mti++]!;
    y ^= y >>> 11;
    y ^= (y << 7) & -1658038656;
    y ^= (y << 15) & -272236544;
    y ^= y >>> 18;
    return y | 0;
  };
}
