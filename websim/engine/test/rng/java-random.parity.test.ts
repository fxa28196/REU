import { describe, expect, it } from "vitest";

import { doubleToHex, floatToHex, intToHex, longToHex } from "../../src/rng/bits.js";
import { JavaRandom, JavaRandomBigIntReference } from "../../src/rng/JavaRandom.js";
import { digestTokens, firstDivergence, javaRandomFixtures } from "./fixtures.js";
import type { FixtureSequence } from "./fixtures.js";

/** Regenerates one fixture sequence from the TS clone, as hex bit-pattern tokens. */
function generate(seq: FixtureSequence): string[] {
  const seed = BigInt(seq.seed);
  const r = new JavaRandom(seed);
  const out: string[] = new Array<string>(seq.count);

  switch (seq.kind) {
    case "nextDouble":
      for (let i = 0; i < seq.count; i++) out[i] = doubleToHex(r.nextDouble());
      break;
    case "nextGaussian":
      for (let i = 0; i < seq.count; i++) out[i] = doubleToHex(r.nextGaussian());
      break;
    case "nextLong":
      for (let i = 0; i < seq.count; i++) out[i] = longToHex(r.nextLong());
      break;
    case "nextInt":
      for (let i = 0; i < seq.count; i++) out[i] = intToHex(r.nextInt());
      break;
    case "nextFloat":
      for (let i = 0; i < seq.count; i++) out[i] = floatToHex(r.nextFloat());
      break;
    case "nextBoolean":
      for (let i = 0; i < seq.count; i++) out[i] = intToHex(r.nextBoolean() ? 1 : 0);
      break;
    case "nextIntBound": {
      const bound = Number(seq.params);
      for (let i = 0; i < seq.count; i++) out[i] = intToHex(r.nextInt(bound));
      break;
    }
    case "mixed":
      for (let i = 0; i < seq.count; i++) {
        switch (i % 8) {
          case 0: out[i] = doubleToHex(r.nextGaussian()); break;
          case 1: out[i] = doubleToHex(r.nextDouble()); break;
          case 2: out[i] = intToHex(r.nextInt(45)); break;
          case 3: out[i] = doubleToHex(r.nextGaussian()); break;
          case 4: out[i] = longToHex(r.nextLong()); break;
          case 5: out[i] = doubleToHex(r.nextGaussian()); break;
          case 6: out[i] = intToHex(r.nextBoolean() ? 1 : 0); break;
          default: out[i] = intToHex(r.nextInt(7)); break;
        }
      }
      break;
    default:
      throw new Error(`unknown fixture kind: ${seq.kind}`);
  }
  return out;
}

describe("JavaRandom vs java.util.Random fixtures", () => {
  it("dumped fixtures are present and well formed", () => {
    expect(javaRandomFixtures.generator).toBe("java.util.Random");
    expect(javaRandomFixtures.drawsPerSequence).toBe(10_000);
    expect(javaRandomFixtures.sequences.length).toBeGreaterThan(100);
  });

  for (const seq of javaRandomFixtures.sequences) {
    it(`${seq.id} is bit-exact (${seq.count} draws)`, () => {
      const tokens = generate(seq);
      expect(tokens).toHaveLength(seq.count);

      // Head first: a mismatch here names the exact draw index.
      const head = tokens.slice(0, seq.head.length);
      const at = firstDivergence(head, seq.head);
      expect(
        at,
        at < 0
          ? ""
          : `first divergence at draw ${at}: java=${seq.head[at]} ts=${head[at]} (seed ${seq.seed} = ${seq.seedNote})`,
      ).toBe(-1);

      // Then the digest over all draws.
      expect(digestTokens(tokens)).toBe(seq.sha256);
    });
  }
});

describe("JavaRandom internals", () => {
  it("the 24-bit split state agrees with the BigInt reference LCG", () => {
    const seeds: bigint[] = [
      0n,
      42n,
      -1n,
      2147483647n,
      BigInt.asIntN(64, 9223372036854775783n * 1000003n + 17n),
      BigInt.asIntN(64, 9223372036854775783n * 2654435761n + 6841n * 104729n),
    ];
    const bits = [1, 8, 24, 26, 27, 31, 32];
    for (const seed of seeds) {
      const fast = new JavaRandom(seed);
      const ref = new JavaRandomBigIntReference(seed);
      expect(fast.seed48).toBe(ref.seed48);
      for (let i = 0; i < 5000; i++) {
        const b = bits[i % bits.length]!;
        expect(fast.next(b)).toBe(ref.next(b));
        expect(fast.seed48).toBe(ref.seed48);
      }
    }
  });

  it("setSeed clears the Gaussian cache", () => {
    const r = new JavaRandom(42);
    r.nextGaussian(); // fills the cache
    expect(r.getState().haveNextNextGaussian).toBe(true);
    r.setSeed(42);
    expect(r.getState().haveNextNextGaussian).toBe(false);
    // A fresh instance must now agree draw-for-draw.
    const fresh = new JavaRandom(42);
    for (let i = 0; i < 100; i++) {
      expect(doubleToHex(r.nextGaussian())).toBe(doubleToHex(fresh.nextGaussian()));
    }
  });

  it("state round-trips exactly, including a half-consumed Gaussian pair", () => {
    const r = new JavaRandom(7);
    r.nextGaussian(); // leaves a cached deviate
    const snapshot = r.getState();
    const expected = [r.nextGaussian(), r.nextDouble(), r.nextGaussian()].map(doubleToHex);
    r.setState(snapshot);
    const replayed = [r.nextGaussian(), r.nextDouble(), r.nextGaussian()].map(doubleToHex);
    expect(replayed).toEqual(expected);
  });

  it("rejects non-positive bounds like Java does", () => {
    const r = new JavaRandom(1);
    expect(() => r.nextInt(0)).toThrow();
    expect(() => r.nextInt(-1)).toThrow();
  });

  it("nextInt(bound) stays in range for both the power-of-two and rejection paths", () => {
    const r = new JavaRandom(123);
    for (const bound of [1, 2, 16, 1073741824, 3, 45, 6842, 2147483647]) {
      let outOfRange = 0;
      for (let i = 0; i < 20_000; i++) {
        const v = r.nextInt(bound);
        if (v < 0 || v >= bound) outOfRange++;
      }
      expect(outOfRange, `bound ${bound}`).toBe(0);
    }
  });
});
