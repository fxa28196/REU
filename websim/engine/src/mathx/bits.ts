/**
 * IEEE-754 bit-pattern helpers — the primitive layer of `mathx`.
 *
 * Determinism work never compares floating-point values as decimal text: the
 * shortest-round-trip decimal form of a double hides last-ulp divergence, which is
 * precisely what a bit-parity port must detect. Everything crosses the Java/TS boundary
 * as a raw hex bit pattern instead.
 *
 * <p>The `getHighWord` / `setHighWord` / `insertWords` family reproduces the fdlibm C
 * macros of the same names (`fdlibm.h` `GET_HIGH_WORD`, `SET_HIGH_WORD`, `INSERT_WORDS`,
 * `EXTRACT_WORDS`, `GET_LOW_WORD`). The kernels in this directory manipulate exponent
 * fields directly, and doing that through a shared `ArrayBuffer` view is both exact and
 * allocation-free.
 *
 * <p>This file was `engine/src/rng/bits.ts` through WP2-S5; WP3 moved it under `mathx/`
 * so the math module has no dependency on the RNG module. `rng/bits.ts` is now a
 * re-export of this file — there is exactly one implementation.
 */

const scratch = new ArrayBuffer(8);
const f64 = new Float64Array(scratch);
const f32 = new Float32Array(scratch);
const u32 = new Uint32Array(scratch);

// Word order inside the shared buffer. Every realistic target is little-endian, but
// deriving it costs nothing and removes a silent-corruption failure mode.
f64[0] = 1.0; // 0x3ff0000000000000
const LITTLE_ENDIAN = u32[1] === 0x3ff00000;

/** Index of the high 32 bits of a double in the shared Uint32 view. */
export const HI = LITTLE_ENDIAN ? 1 : 0;
/** Index of the low 32 bits of a double in the shared Uint32 view. */
export const LO = LITTLE_ENDIAN ? 0 : 1;

function pad8(v: number): string {
  return (v >>> 0).toString(16).padStart(8, "0");
}

/** `Long.toHexString(Double.doubleToRawLongBits(x))`, zero-padded to 16 chars. */
export function doubleToHex(x: number): string {
  f64[0] = x;
  return pad8(u32[HI]!) + pad8(u32[LO]!);
}

/** Inverse of {@link doubleToHex}: 16 hex digits back to the double they encode. */
export function hexToDouble(hex: string): number {
  if (!/^[0-9a-fA-F]{16}$/u.test(hex)) {
    throw new RangeError(`expected 16 hex digits, got '${hex}'`);
  }
  u32[HI] = Number.parseInt(hex.slice(0, 8), 16) >>> 0;
  u32[LO] = Number.parseInt(hex.slice(8), 16) >>> 0;
  return f64[0]!;
}

/** `Integer.toHexString(Float.floatToRawIntBits(x))`, zero-padded to 8 chars. */
export function floatToHex(x: number): string {
  f32[0] = Math.fround(x);
  return pad8(u32[0]!);
}

/** Two's-complement hex of a Java `long`, zero-padded to 16 chars. */
export function longToHex(x: bigint): string {
  return BigInt.asUintN(64, x).toString(16).padStart(16, "0");
}

/** Two's-complement hex of a Java `int`, zero-padded to 8 chars. */
export function intToHex(x: number): string {
  return pad8(x);
}

/** Raw high/low words of a double, for the fdlibm kernels. */
export function decomposeDouble(x: number): { hi: number; lo: number } {
  f64[0] = x;
  return { hi: u32[HI]! | 0, lo: u32[LO]! >>> 0 };
}

/** fdlibm `GET_HIGH_WORD(i, x)` — the high word as a **signed** 32-bit int. */
export function getHighWord(x: number): number {
  f64[0] = x;
  return u32[HI]! | 0;
}

/** fdlibm `GET_LOW_WORD(i, x)` — the low word as an **unsigned** 32-bit int. */
export function getLowWord(x: number): number {
  f64[0] = x;
  return u32[LO]! >>> 0;
}

/** fdlibm `SET_HIGH_WORD(x, v)` — replace x's high word, keeping its low word. */
export function setHighWord(x: number, hi: number): number {
  f64[0] = x;
  u32[HI] = hi >>> 0;
  return f64[0]!;
}

/** fdlibm `SET_LOW_WORD(x, v)` — replace x's low word, keeping its high word. */
export function setLowWord(x: number, lo: number): number {
  f64[0] = x;
  u32[LO] = lo >>> 0;
  return f64[0]!;
}

/** fdlibm `INSERT_WORDS(d, hi, lo)` — build a double from two 32-bit words. */
export function insertWords(hi: number, lo: number): number {
  u32[HI] = hi >>> 0;
  u32[LO] = lo >>> 0;
  return f64[0]!;
}

/**
 * C `scalbn(x, n)` = `x * 2^n`, computed without a `pow` call and without an
 * intermediate overflow or underflow for the exponent ranges the fdlibm kernels use.
 *
 * <p>`2 ** n` is exact for every representable power of two, so the single-step case is
 * exact. The chunking loops exist only so that a large `n` cannot produce an infinite or
 * zero intermediate that a later multiplication could not recover from.
 */
export function scalbn(x: number, n: number): number {
  let r = x;
  let k = n;
  while (k > 1023) {
    r *= 2 ** 1023;
    k -= 1023;
  }
  while (k < -1022) {
    r *= 2 ** -1022;
    k += 1022;
  }
  return r * 2 ** k;
}
