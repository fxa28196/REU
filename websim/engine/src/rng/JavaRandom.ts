/**
 * Bit-exact clone of `java.util.Random` (JDK 17 semantics).
 *
 * Backs three of the model's four streams (PORT_MAP §1.8): `PopulationSampler`
 * (`seed*1000003+17`), `ELayerSampler` (`seed*1000003+7919`) and the per-agent decision
 * streams (`runSeed*2654435761 + index*104729`).
 *
 * <p>Spec cloned: 48-bit LCG with the `0x5DEECE66D` scramble; `nextDouble` from a
 * 26-bit and a 27-bit draw; `nextInt(bound)` with the power-of-two fast path and the
 * modulo-rejection loop; `nextGaussian` as Marsaglia polar **with the cached second
 * deviate**; `nextLong` as a signed high word plus a signed low word.
 *
 * <p>The 48-bit state is held as two 24-bit halves so every intermediate stays inside
 * the 2^53 exact-integer range of a double -- a single-number state would need a
 * 2^48 x 2^35 product, which is not exact. {@link JavaRandomBigIntReference} implements
 * the same contract straight from the spec with BigInt and exists only to cross-check
 * this fast path in tests.
 */

import { fdlibmLog } from "../mathx/log.js";

/** Java's LCG multiplier `0x5DEECE66D`, split into 24-bit halves. */
const MULT_HI = 0x5de; //      1502
const MULT_LO = 0xece66d; // 15525485
const ADDEND = 0xb;
const TWO24 = 0x1000000;
const MASK24 = 0xffffff;

/** `2^-53`, Java's `Random.DOUBLE_UNIT`. */
const DOUBLE_UNIT = 2 ** -53;
/** `2^27`, the shift applied to the high 26-bit draw in `nextDouble`. */
const TWO27 = 0x8000000;

/** Serialisable generator state (plan §3.5 snapshots must capture the Gaussian cache). */
export interface JavaRandomState {
  /** High 24 bits of the 48-bit seed. */
  readonly hi: number;
  /** Low 24 bits of the 48-bit seed. */
  readonly lo: number;
  readonly haveNextNextGaussian: boolean;
  readonly nextNextGaussian: number;
}

function scramble(seed: bigint): bigint {
  // (seed ^ 0x5DEECE66DL) & ((1L << 48) - 1)
  return BigInt.asUintN(48, seed ^ 0x5deece66dn);
}

export class JavaRandom {
  private hi = 0;
  private lo = 0;
  private haveNextNextGaussian = false;
  private nextNextGaussian = 0;

  /**
   * @param seed the Java `long` seed. Pass a bigint for seeds outside the safe-integer
   *   range -- e.g. anything produced by the plan's overflowing derivation formulas.
   */
  constructor(seed: bigint | number) {
    this.setSeed(seed);
  }

  /** Mirrors `Random.setSeed(long)`, including the Gaussian-cache reset. */
  setSeed(seed: bigint | number): void {
    const s = scramble(typeof seed === "bigint" ? seed : BigInt(Math.trunc(seed)));
    this.hi = Number(s >> 24n);
    this.lo = Number(s & 0xffffffn);
    this.haveNextNextGaussian = false;
    this.nextNextGaussian = 0;
  }

  /** The 48-bit seed, for assertions and snapshots. */
  get seed48(): bigint {
    return (BigInt(this.hi) << 24n) | BigInt(this.lo);
  }

  getState(): JavaRandomState {
    return {
      hi: this.hi,
      lo: this.lo,
      haveNextNextGaussian: this.haveNextNextGaussian,
      nextNextGaussian: this.nextNextGaussian,
    };
  }

  setState(state: JavaRandomState): void {
    this.hi = state.hi;
    this.lo = state.lo;
    this.haveNextNextGaussian = state.haveNextNextGaussian;
    this.nextNextGaussian = state.nextNextGaussian;
  }

  /**
   * `protected int next(int bits)` -- advances the LCG and returns the top `bits` bits
   * as a Java `int`.
   */
  next(bits: number): number {
    // seed = (seed * 0x5DEECE66D + 0xB) & ((1 << 48) - 1), in 24-bit halves.
    // Every partial product below is < 2^48, so all arithmetic is exact in a double.
    const lowProd = this.lo * MULT_LO + ADDEND;
    const carry = Math.floor(lowProd / TWO24);
    const newLo = lowProd - carry * TWO24;
    const newHi = (this.hi * MULT_LO + this.lo * MULT_HI + carry) % TWO24;
    this.hi = newHi;
    this.lo = newLo;

    const shift = 48 - bits;
    if (shift >= 24) {
      return newHi >>> (shift - 24);
    }
    // Java's `(int)` narrowing is exactly JS `| 0` (both take the low 32 bits, signed).
    return ((newHi << (24 - shift)) | (newLo >>> shift)) | 0;
  }

  /** `nextInt()` -- a full-range signed 32-bit int. */
  nextInt(): number;
  /** `nextInt(bound)` -- uniform on `[0, bound)`. */
  nextInt(bound: number): number;
  nextInt(bound?: number): number {
    if (bound === undefined) {
      return this.next(32);
    }
    if (!Number.isInteger(bound) || bound <= 0) {
      throw new Error("bound must be positive");
    }
    let r = this.next(31);
    const m = bound - 1;
    if ((bound & m) === 0) {
      // Java: r = (int)((bound * (long)r) >> 31). With bound = 2^p and r in [0, 2^31),
      // that product reaches 2^61 -- outside exact double range -- but it is identically
      // r >>> (31 - p) == r >>> clz32(bound), which stays in 32-bit integer arithmetic.
      return r >>> Math.clz32(bound);
    }
    // Rejection loop. `u - r + m` overflows int in Java when the draw lands in the
    // truncated tail; `| 0` reproduces that wrap, which is what makes the test negative.
    let u = r;
    r = u % bound;
    while (((u - r + m) | 0) < 0) {
      u = this.next(31);
      r = u % bound;
    }
    return r;
  }

  /** `nextLong()` = `((long)next(32) << 32) + next(32)` -- note the signed low word. */
  nextLong(): bigint {
    const high = this.next(32);
    const low = this.next(32);
    return BigInt.asIntN(64, (BigInt(high) << 32n) + BigInt(low));
  }

  /** `nextBoolean()` = `next(1) != 0`. */
  nextBoolean(): boolean {
    return this.next(1) !== 0;
  }

  /** `nextDouble()` = `(((long)next(26) << 27) + next(27)) * 2^-53`. */
  nextDouble(): number {
    // Left-to-right evaluation matters: next(26) is drawn before next(27).
    const high = this.next(26);
    const low = this.next(27);
    return (high * TWO27 + low) * DOUBLE_UNIT;
  }

  /** `nextFloat()` = `next(24) / (float)(1 << 24)`. */
  nextFloat(): number {
    return Math.fround(this.next(24) / (1 << 24));
  }

  /**
   * `nextGaussian()` -- Marsaglia polar with the cached second deviate.
   *
   * The cache is the subtle part: a `nextGaussian` call either consumes an even number
   * of `nextDouble`s and stashes a partner, or consumes none at all. The stash survives
   * arbitrary intervening draws of other kinds, so an interleaved sequence is the only
   * thing that proves a port got it right (see the `-mixed` fixtures).
   */
  nextGaussian(): number {
    if (this.haveNextNextGaussian) {
      this.haveNextNextGaussian = false;
      return this.nextNextGaussian;
    }
    let v1: number;
    let v2: number;
    let s: number;
    do {
      v1 = 2 * this.nextDouble() - 1;
      v2 = 2 * this.nextDouble() - 1;
      s = v1 * v1 + v2 * v2;
    } while (s >= 1 || s === 0);
    // StrictMath.sqrt is IEEE-correctly-rounded (so Math.sqrt matches); StrictMath.log
    // is fdlibm and Math.log is not specified to be -- hence the explicit kernel.
    const multiplier = Math.sqrt((-2 * fdlibmLog(s)) / s);
    this.nextNextGaussian = v2 * multiplier;
    this.haveNextNextGaussian = true;
    return v1 * multiplier;
  }
}

/**
 * Straight-from-the-spec BigInt implementation of the same LCG. Slower by roughly an
 * order of magnitude and never used by the engine -- it exists so the tests can assert
 * that the 24-bit split fast path in {@link JavaRandom} is not merely self-consistent.
 */
export class JavaRandomBigIntReference {
  private seed: bigint;

  constructor(seed: bigint | number) {
    this.seed = scramble(typeof seed === "bigint" ? seed : BigInt(Math.trunc(seed)));
  }

  next(bits: number): number {
    this.seed = BigInt.asUintN(64, this.seed * 0x5deece66dn + 0xbn) & 0xffffffffffffn;
    return Number(BigInt.asIntN(32, this.seed >> BigInt(48 - bits)));
  }

  get seed48(): bigint {
    return this.seed;
  }
}

/** The 24-bit split constants, re-exported so tests can assert they recompose. */
export const LCG_MULTIPLIER_PARTS = { MULT_HI, MULT_LO, ADDEND, TWO24, MASK24 } as const;
