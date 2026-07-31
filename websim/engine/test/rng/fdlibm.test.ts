import { describe, expect, it } from "vitest";

import { doubleToHex } from "../../src/rng/bits.js";
import { FDLIBM_LOG_CONSTANT_BITS, fdlibmLog } from "../../src/rng/fdlibm.js";
import { JavaRandom } from "../../src/rng/JavaRandom.js";

describe("fdlibmLog", () => {
  it("every constant's decimal literal parses to the documented bit pattern", () => {
    for (const [name, value, bits] of FDLIBM_LOG_CONSTANT_BITS) {
      expect(doubleToHex(value), name).toBe(bits);
    }
  });

  it("reproduces exactly representable logarithms", () => {
    expect(fdlibmLog(1)).toBe(0);
    expect(doubleToHex(fdlibmLog(Math.E))).toBe(doubleToHex(1));
  });

  it("handles the fdlibm edge branches", () => {
    expect(fdlibmLog(0)).toBe(-Infinity);
    expect(fdlibmLog(-0)).toBe(-Infinity);
    expect(Number.isNaN(fdlibmLog(-1))).toBe(true);
    expect(Number.isNaN(fdlibmLog(NaN))).toBe(true);
    expect(fdlibmLog(Infinity)).toBe(Infinity);
    // Subnormal scale-up path (x < 2^-1022).
    expect(fdlibmLog(5e-324)).toBeCloseTo(Math.log(5e-324), 10);
    expect(Number.isFinite(fdlibmLog(Number.MIN_VALUE))).toBe(true);
  });

  it("is within 1 ulp of Math.log across the (0,1) domain nextGaussian uses", () => {
    // Sanity bound only. The binding proof that fdlibmLog matches StrictMath.log is the
    // nextGaussian fixture parity in java-random.parity.test.ts, which fails on a single
    // wrong bit anywhere in 10 000 draws.
    const r = new JavaRandom(2026);
    let maxUlpDiff = 0;
    for (let i = 0; i < 100_000; i++) {
      const s = r.nextDouble();
      if (s === 0) continue;
      const a = fdlibmLog(s);
      const b = Math.log(s);
      if (a !== b) {
        maxUlpDiff = Math.max(maxUlpDiff, Math.abs(a - b) / Math.max(Math.abs(a), 1e-300));
      }
    }
    expect(maxUlpDiff).toBeLessThan(1e-15);
  });
});
