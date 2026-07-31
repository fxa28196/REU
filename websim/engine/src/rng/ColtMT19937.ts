/**
 * Bit-exact clone of cern/colt `MersenneTwister` + the `Uniform` scaling layer, as
 * reached through Repast's `RandomHelper` default stream (PORT_MAP §1.8).
 *
 * Verified against `colt-1.2.0-no_hep.jar` shipped in Repast Simphony 2.11.0
 * (`eclipse/plugins/repast.simphony.core_2.11.0/lib/`), decompiled with `javap -c -p`;
 * see `docs/DR-S5-rng.md` for the bytecode evidence.
 *
 * <p><b>Two deviations from textbook MT19937 that a naive port gets wrong:</b>
 * <ol>
 *   <li>colt's seeding uses an <i>arithmetic</i> right shift (`mt[i-1] >> 30`, bytecode
 *       `ishr`) where reference MT19937 uses a logical one. For any seed whose expansion
 *       passes through a negative word -- which is almost immediately, for almost every
 *       seed -- the two state tables diverge and every subsequent draw differs.</li>
 *   <li>colt's `RandomEngine.raw()` <i>rejects zero</i> and scales by 2^-32, so it is
 *       supported on [2^-32, 1 - 2^-32] rather than [0, 1).</li>
 * </ol>
 */

const N = 624;
const M = 397;
/** 0x9908b0df as a signed int. */
const MATRIX_A = 0x9908b0df | 0;
/** 0x80000000 as a signed int -- the "most significant w-r bits" mask. */
const UPPER_MASK = 0x80000000 | 0;
/** 0x7fffffff -- the "least significant r bits" mask. */
const LOWER_MASK = 0x7fffffff;
const TEMPERING_MASK_B = 0x9d2c5680 | 0;
const TEMPERING_MASK_C = 0xefc60000 | 0;
const SEED_MULTIPLIER = 1812433253;

/** colt's `MersenneTwister.DEFAULT_SEED`. */
export const COLT_DEFAULT_SEED = 4357;

/** `2.3283064365386963E-10` in colt's source; exactly 2^-32. */
const RAW_SCALE = 2.3283064365386963e-10;
/** `-9.223372036854776E18` in colt's source; exactly -(2^63) == (double)Long.MIN_VALUE. */
const LONG_MIN_AS_DOUBLE = -9.223372036854776e18;
/** `5.421010862427522E-20` in colt's source; exactly 2^-64. */
const TWO_POW_MINUS_64 = 5.421010862427522e-20;

/** Serialisable generator state (plan §3.5: 624 words + index). */
export interface ColtMT19937State {
  readonly mt: Int32Array;
  readonly mti: number;
}

export class ColtMT19937 {
  private readonly mt = new Int32Array(N);
  private mti = N;

  constructor(seed: number = COLT_DEFAULT_SEED) {
    this.setSeed(seed);
  }

  /**
   * colt `protected void setSeed(int seed)`.
   *
   * Note `>>` (arithmetic), matching bytecode `ishr`. Reference MT19937 uses `>>>`.
   */
  setSeed(seed: number): void {
    const mt = this.mt;
    mt[0] = seed | 0;
    for (let i = 1; i < N; i++) {
      const prev = mt[i - 1]!;
      mt[i] = (Math.imul(SEED_MULTIPLIER, prev ^ (prev >> 30)) + i) | 0;
    }
    this.mti = N;
  }

  /** colt `protected void nextBlock()` -- regenerates all 624 words. */
  private nextBlock(): void {
    const mt = this.mt;
    let y: number;
    let kk = 0;
    for (; kk < N - M; kk++) {
      y = (mt[kk]! & UPPER_MASK) | (mt[kk + 1]! & LOWER_MASK);
      mt[kk] = mt[kk + M]! ^ (y >>> 1) ^ ((y & 1) !== 0 ? MATRIX_A : 0);
    }
    for (; kk < N - 1; kk++) {
      y = (mt[kk]! & UPPER_MASK) | (mt[kk + 1]! & LOWER_MASK);
      mt[kk] = mt[kk + (M - N)]! ^ (y >>> 1) ^ ((y & 1) !== 0 ? MATRIX_A : 0);
    }
    y = (mt[N - 1]! & UPPER_MASK) | (mt[0]! & LOWER_MASK);
    mt[N - 1] = mt[M - 1]! ^ (y >>> 1) ^ ((y & 1) !== 0 ? MATRIX_A : 0);
    this.mti = 0;
  }

  /** colt `public int nextInt()` -- tempered output word, full signed 32-bit range. */
  nextInt(): number {
    if (this.mti === N) {
      this.nextBlock();
    }
    let y = this.mt[this.mti++]!;
    y ^= y >>> 11;
    y ^= (y << 7) & TEMPERING_MASK_B;
    y ^= (y << 15) & TEMPERING_MASK_C;
    y ^= y >>> 18;
    return y | 0;
  }

  /**
   * colt `RandomEngine.raw()` -- uniform on (0, 1), **zero rejected**, scaled by 2^-32.
   * This is the only entropy source `nextIntFromTo` consumes.
   */
  raw(): number {
    let v: number;
    do {
      v = this.nextInt();
    } while (v === 0);
    return (v >>> 0) * RAW_SCALE;
  }

  /** colt `RandomEngine.nextLong()` -- high word drawn first, then low word. */
  nextLong(): bigint {
    const high = this.nextInt();
    const low = this.nextInt();
    return BigInt.asIntN(64, (BigInt(high >>> 0) << 32n) | BigInt(low >>> 0));
  }

  /**
   * colt `RandomEngine.nextDouble()` -- from a full 64-bit draw, retried until the
   * long-to-double conversion lands strictly inside (0, 1).
   */
  nextDouble(): number {
    let d: number;
    do {
      d = (Number(this.nextLong()) - LONG_MIN_AS_DOUBLE) * TWO_POW_MINUS_64;
    } while (!(d > 0 && d < 1));
    return d;
  }

  /** colt `RandomEngine.nextFloat()` -- `(float) raw()`, retried while >= 1. */
  nextFloat(): number {
    let f: number;
    do {
      f = Math.fround(this.raw());
    } while (f >= 1);
    return f;
  }

  /**
   * colt `Uniform.nextIntFromTo(int from, int to)` -- **the W15 formula**:
   *
   * ```java
   * return (int) ((long) from + (long) ((1L + (long) to - (long) from) * randomGenerator.raw()));
   * ```
   *
   * Load-bearing details, all confirmed against bytecode:
   * <ul>
   *   <li>the width `1 + to - from` is computed in <b>long</b>, so the full int range
   *       gives width 2^32 rather than wrapping to 0;</li>
   *   <li>`width` is widened to double (`l2d`) and multiplied by `raw()` as a
   *       <b>double</b> product -- not a 64-bit integer multiply;</li>
   *   <li>the double-to-long conversion (`d2l`) truncates <b>toward zero</b>, which only
   *       equals `floor` when the product is non-negative -- it is not, for `to < from`;</li>
   *   <li>the final `(int)` (`l2i`) is a <b>narrowing wrap</b>, not a clamp.</li>
   * </ul>
   *
   * Because `raw()` never returns 0 and is at most 1 - 2^-32, the result is in
   * `[from, to]` for `from <= to`; with `from = Integer.MIN_VALUE, to = Integer.MAX_VALUE`
   * it can never return `Integer.MIN_VALUE`.
   */
  nextIntFromTo(from: number, to: number): number {
    const width = 1 + to - from; // exact: |width| <= 2^32, well inside 2^53
    return (from + Math.trunc(width * this.raw())) | 0;
  }

  /**
   * colt `Uniform.nextInt()` for a default-constructed `Uniform(engine)`.
   *
   * Deliberately named to be hard to misuse: it is **not** a full-range int. colt's
   * `Uniform.nextInt()` is `nextIntFromTo((int) Math.round(min), (int) Math.round(max))`
   * and `new Uniform(engine)` sets `min = 0, max = 1`, so it returns only 0 or 1.
   */
  uniformDefaultNextInt(): number {
    return this.nextIntFromTo(0, 1);
  }

  getState(): ColtMT19937State {
    return { mt: Int32Array.from(this.mt), mti: this.mti };
  }

  setState(state: ColtMT19937State): void {
    this.mt.set(state.mt);
    this.mti = state.mti;
  }
}

/** Constants re-exported so the test suite can assert the documented literals. */
export const COLT_CONSTANTS = {
  N,
  M,
  MATRIX_A,
  UPPER_MASK,
  LOWER_MASK,
  TEMPERING_MASK_B,
  TEMPERING_MASK_C,
  SEED_MULTIPLIER,
  RAW_SCALE,
  LONG_MIN_AS_DOUBLE,
  TWO_POW_MINUS_64,
} as const;
