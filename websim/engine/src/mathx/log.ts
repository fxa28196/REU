/**
 * fdlibm `__ieee754_log`, ported to TypeScript.
 *
 * <p><b>Provenance.</b> Sun/FreeBSD fdlibm `e_log.c` — the file `java.lang.StrictMath.log`
 * is specified against (`StrictMath`'s javadoc names fdlibm 5.3 as the definition, and the
 * JDK either delegates to the C or ships a line-by-line Java translation of it). Structure,
 * constant values, expression association and branch order are preserved verbatim;
 * reassociating any of the polynomial expressions changes the last ulp and breaks parity.
 *
 * <p><b>Why this file exists.</b> `java.util.Random.nextGaussian()` computes its
 * Marsaglia-polar multiplier as `StrictMath.sqrt(-2 * StrictMath.log(s) / s)`.
 * `StrictMath.sqrt` is IEEE-754 correctly rounded, so JS `Math.sqrt` matches it by
 * definition -- but `StrictMath.log` is *fdlibm*, whose result is NOT the correctly
 * rounded logarithm and is not guaranteed by ECMA-262 for `Math.log` (the spec leaves
 * `Math.log` implementation-approximated). A port that calls `Math.log` is therefore
 * making a bet on the host engine, per platform, per version. Bit-exact `nextGaussian`
 * requires reproducing fdlibm's algorithm exactly, which is what this does. The same
 * argument applies to the model's own `Math.log` call at `GisAgent.java:717`
 * (`betaCapacityPrior * Math.log(Math.max(1.0, cap))`).
 *
 * Method:
 *   1. argument reduction: x = 2^k * (1+f), |f| <= 2^-1 (roughly [sqrt(2)/2, sqrt(2)])
 *   2. approximate log(1+f) via s = f/(2+f) and a degree-14 odd polynomial in s
 *   3. log(x) = k*ln2 + log(1+f)
 */

import { decomposeDouble, setHighWord } from "./bits.js";

/* eslint-disable @typescript-eslint/naming-convention -- names mirror fdlibm e_log.c */
const ln2_hi = 6.93147180369123816490e-01; /* 3fe62e42 fee00000 */
const ln2_lo = 1.90821492927058770002e-10; /* 3dea39ef 35793c76 */
const two54 = 1.80143985094819840000e16; /*  43500000 00000000 */
const Lg1 = 6.666666666666735130e-01; /* 3FE55555 55555593 */
const Lg2 = 3.999999999940941908e-01; /* 3FD99999 9997FA04 */
const Lg3 = 2.857142874366239149e-01; /* 3FD24924 94229359 */
const Lg4 = 2.222219843214978396e-01; /* 3FCC71C5 1D8E78AF */
const Lg5 = 1.818357216161805012e-01; /* 3FC74664 96CB03DE */
const Lg6 = 1.531383769920937332e-01; /* 3FC39A09 D078C69F */
const Lg7 = 1.479819860511658591e-01; /* 3FC2F112 DF3E5244 */
/* eslint-enable @typescript-eslint/naming-convention */

/** The documented raw bit patterns of the constants above; asserted by the test suite. */
export const FDLIBM_LOG_CONSTANT_BITS: ReadonlyArray<readonly [string, number, string]> = [
  ["ln2_hi", ln2_hi, "3fe62e42fee00000"],
  ["ln2_lo", ln2_lo, "3dea39ef35793c76"],
  ["two54", two54, "4350000000000000"],
  ["Lg1", Lg1, "3fe5555555555593"],
  ["Lg2", Lg2, "3fd999999997fa04"],
  ["Lg3", Lg3, "3fd2492494229359"],
  ["Lg4", Lg4, "3fcc71c51d8e78af"],
  ["Lg5", Lg5, "3fc7466496cb03de"],
  ["Lg6", Lg6, "3fc39a09d078c69f"],
  ["Lg7", Lg7, "3fc2f112df3e5244"],
];

const zero = 0.0;

/**
 * Bit-exact equivalent of Java's `StrictMath.log(x)`.
 *
 * @param x any double
 * @returns fdlibm's natural logarithm: `-Infinity` at +-0, `NaN` for x < 0 or NaN input
 */
export function fdlibmLog(x: number): number {
  let hx = decomposeDouble(x).hi;
  const lx = decomposeDouble(x).lo;

  let k = 0;
  if (hx < 0x00100000) {
    /* x < 2**-1022 (this branch also catches negatives and +-0) */
    if (((hx & 0x7fffffff) | lx) === 0) {
      return -two54 / zero; /* log(+-0) = -inf */
    }
    if (hx < 0) {
      return (x - x) / zero; /* log(-#) = NaN */
    }
    k -= 54;
    x *= two54; /* subnormal number, scale up x */
    hx = decomposeDouble(x).hi;
  }
  if (hx >= 0x7ff00000) {
    return x + x; /* +inf or NaN propagates */
  }
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  const i0 = (hx + 0x95f64) & 0x100000;

  /* __HI(x) = hx | (i ^ 0x3ff00000): normalize x or x/2 */
  x = setHighWord(x, hx | (i0 ^ 0x3ff00000));

  k += i0 >> 20;
  const f = x - 1.0;

  if ((0x000fffff & (2 + hx)) < 3) {
    /* |f| < 2**-20 */
    if (f === zero) {
      if (k === 0) {
        return zero;
      }
      const dk0 = k;
      return dk0 * ln2_hi + dk0 * ln2_lo;
    }
    const r0 = f * f * (0.5 - 0.33333333333333333 * f);
    if (k === 0) {
      return f - r0;
    }
    const dk0 = k;
    return dk0 * ln2_hi - (r0 - dk0 * ln2_lo - f);
  }

  const s = f / (2.0 + f);
  const dk = k;
  const z = s * s;
  let i = hx - 0x6147a;
  const w = z * z;
  const j = 0x6b851 - hx;
  // R(z) = Lg1*z + Lg2*z^2 + ... + Lg7*z^7, split into even (t1) and odd (t2) halves.
  // t2 is multiplied by z, NOT by s -- with s the series is off by a factor of s and
  // the result is silently wrong by ~1e-2 rather than failing loudly.
  const t1 = w * (Lg2 + w * (Lg4 + w * Lg6));
  const t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)));
  i |= j;
  const r = t2 + t1;

  if (i > 0) {
    const hfsq = 0.5 * f * f;
    if (k === 0) {
      return f - (hfsq - s * (hfsq + r));
    }
    return dk * ln2_hi - (hfsq - (s * (hfsq + r) + dk * ln2_lo) - f);
  }
  if (k === 0) {
    return f - s * (f - r);
  }
  return dk * ln2_hi - (s * (f - r) - dk * ln2_lo - f);
}
