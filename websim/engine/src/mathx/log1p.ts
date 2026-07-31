/**
 * fdlibm `log1p`, ported to TypeScript.
 *
 * <p><b>Provenance.</b> Sun/FreeBSD fdlibm `s_log1p.c` — the file `java.lang.StrictMath.log1p`
 * is specified against. Structure, constant values, expression association and branch order
 * are preserved verbatim; reassociating any of the polynomial expressions changes the last
 * ulp and breaks parity.
 *
 * <p><b>Call site.</b> `geographiclib-geodesic` computes `atanh` (used for the authalic
 * radius `_c2`) through `log1p`, and the shipped package reaches for the host `Math.log1p`,
 * which ECMA-262 §21.3.2 declares implementation-approximated. WP7 task C1 routes the
 * vendored solver through {@link fdlibmLog1p} instead so the geodesic plane is byte-identical
 * on V8, SpiderMonkey and JavaScriptCore rather than merely close.
 *
 * Method (from the source comments):
 *   1. argument reduction: 1+x = 2^k * (1+f), |f| <= sqrt(2)/2, with a correction term `c`
 *      recovering the bits of `x` lost to the rounding of `1+x`
 *   2. approximate log(1+f) via s = f/(2+f) and a degree-14 odd polynomial in s
 *   3. log1p(x) = k*ln2 + log(1+f) + c
 */

import { getHighWord, setHighWord } from "./bits.js";

/* eslint-disable @typescript-eslint/naming-convention -- names mirror fdlibm s_log1p.c */
const ln2_hi = 6.93147180369123816490e-01; /* 3fe62e42 fee00000 */
const ln2_lo = 1.90821492927058770002e-10; /* 3dea39ef 35793c76 */
const two54 = 1.80143985094819840000e16; /*  43500000 00000000 */
const Lp1 = 6.666666666666735130e-01; /* 3FE55555 55555593 */
const Lp2 = 3.999999999940941908e-01; /* 3FD99999 9997FA04 */
const Lp3 = 2.857142874366239149e-01; /* 3FD24924 94229359 */
const Lp4 = 2.222219843214978396e-01; /* 3FCC71C5 1D8E78AF */
const Lp5 = 1.818357216161805012e-01; /* 3FC74664 96CB03DE */
const Lp6 = 1.531383769920937332e-01; /* 3FC39A09 D078C69F */
const Lp7 = 1.479819860511658591e-01; /* 3FC2F112 DF3E5244 */
/* eslint-enable @typescript-eslint/naming-convention */

/** The documented raw bit patterns of the constants above; asserted by the test suite. */
export const FDLIBM_LOG1P_CONSTANT_BITS: ReadonlyArray<readonly [string, number, string]> = [
  ["ln2_hi", ln2_hi, "3fe62e42fee00000"],
  ["ln2_lo", ln2_lo, "3dea39ef35793c76"],
  ["two54", two54, "4350000000000000"],
  ["Lp1", Lp1, "3fe5555555555593"],
  ["Lp2", Lp2, "3fd999999997fa04"],
  ["Lp3", Lp3, "3fd2492494229359"],
  ["Lp4", Lp4, "3fcc71c51d8e78af"],
  ["Lp5", Lp5, "3fc7466496cb03de"],
  ["Lp6", Lp6, "3fc39a09d078c69f"],
  ["Lp7", Lp7, "3fc2f112df3e5244"],
];

const zero = 0.0;

/** fdlibm's `(int)0xbfd2bec3`, the high word of the -0.2929 branch cut, as a signed int. */
const NEG_0_2929_HI = 0xbfd2bec3 | 0;

/**
 * Bit-exact equivalent of Java's `StrictMath.log1p(x)`.
 *
 * @param x any double
 * @returns fdlibm's `log(1 + x)`: `-Infinity` at x = -1, `NaN` for x < -1 or NaN input
 */
export function fdlibmLog1p(x: number): number {
  const hx = getHighWord(x);
  const ax = hx & 0x7fffffff;

  let k = 1;
  let f = 0.0;
  let hu = 0;
  let c = 0.0;

  if (hx < 0x3fda827a) {
    /* x < 0.41422 */
    if (ax >= 0x3ff00000) {
      /* x <= -1.0 */
      if (x === -1.0) {
        return -two54 / zero; /* log1p(-1) = -inf */
      }
      return (x - x) / (x - x); /* log1p(x < -1) = NaN */
    }
    if (ax < 0x3e200000) {
      /* |x| < 2**-29 */
      if (two54 + x > zero && ax < 0x3c900000) {
        /* |x| < 2**-54 */
        return x;
      }
      return x - x * x * 0.5;
    }
    if (hx > 0 || hx <= NEG_0_2929_HI) {
      /* -0.2929 < x < 0.41422 */
      k = 0;
      f = x;
      hu = 1;
    }
  }
  if (hx >= 0x7ff00000) {
    return x + x;
  }
  if (k !== 0) {
    let u: number;
    if (hx < 0x43400000) {
      u = 1.0 + x;
      hu = getHighWord(u);
      k = (hu >> 20) - 1023;
      /* correction term */
      c = k > 0 ? 1.0 - (u - x) : x - (u - 1.0);
      c /= u;
    } else {
      u = x;
      hu = getHighWord(u);
      k = (hu >> 20) - 1023;
      c = 0;
    }
    hu &= 0x000fffff;
    if (hu < 0x6a09e) {
      u = setHighWord(u, hu | 0x3ff00000); /* normalize u */
    } else {
      k += 1;
      u = setHighWord(u, hu | 0x3fe00000); /* normalize u/2 */
      hu = (0x00100000 - hu) >> 2;
    }
    f = u - 1.0;
  }

  const hfsq = 0.5 * f * f;
  if (hu === 0) {
    /* |f| < 2**-20 */
    if (f === zero) {
      if (k === 0) {
        return zero;
      }
      c += k * ln2_lo;
      return k * ln2_hi + c;
    }
    const r0 = hfsq * (1.0 - 0.66666666666666666 * f);
    if (k === 0) {
      return f - r0;
    }
    return k * ln2_hi - (r0 - (k * ln2_lo + c) - f);
  }
  const s = f / (2.0 + f);
  const z = s * s;
  const r = z * (Lp1 + z * (Lp2 + z * (Lp3 + z * (Lp4 + z * (Lp5 + z * (Lp6 + z * Lp7))))));
  if (k === 0) {
    return f - (hfsq - s * (hfsq + r));
  }
  return k * ln2_hi - (hfsq - (s * (hfsq + r) + (k * ln2_lo + c)) - f);
}
