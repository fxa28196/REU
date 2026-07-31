/**
 * fdlibm `cbrt`, ported to TypeScript.
 *
 * <p><b>Provenance.</b> Sun/FreeBSD fdlibm `s_cbrt.c` — the file `java.lang.StrictMath.cbrt`
 * is specified against. The magic exponent offsets `B1`/`B2`, the rational 23-bit
 * approximation and the single Newton step are preserved verbatim, including the
 * "chop to 20 bits and bump by one ulp" step, which is what makes the final Newton
 * correction land inside 0.667 ulp.
 *
 * <p><b>Call site.</b> `geographiclib-geodesic`'s `astroid()` solver — the near-antipodal
 * branch of the `Inverse` problem — calls `cbrt` once per invocation, and the shipped
 * package reaches for the host `Math.cbrt`, which ECMA-262 §21.3.2 declares
 * implementation-approximated. WP7 task C1 routes the vendored solver here instead.
 */

import { getHighWord, getLowWord, insertWords, setHighWord, setLowWord } from "./bits.js";

/* eslint-disable @typescript-eslint/naming-convention -- names mirror fdlibm s_cbrt.c */
const B1 = 715094163; /* B1 = (682-0.03306235651)*2**20 */
const B2 = 696219795; /* B2 = (664-0.03306235651)*2**20 */

const C = 5.42857142857142815906e-01; /* 19/35     = 0x3FE15F15, 0xF15F15F1 */
const D = -7.05306122448979611050e-01; /* -864/1225 = 0xBFE691DE, 0x2532C834 */
const E = 1.41428571428571436819e+00; /* 99/70     = 0x3FF6A0EA, 0x0EA0EA0F */
const F = 1.60714285714285720630e+00; /* 45/28     = 0x3FF9B6DB, 0x6DB6DB6E */
const G = 3.57142857142857150787e-01; /* 5/14      = 0x3FD6DB6D, 0xB6DB6DB7 */
/* eslint-enable @typescript-eslint/naming-convention */

/** The documented raw bit patterns of the constants above; asserted by the test suite. */
export const FDLIBM_CBRT_CONSTANT_BITS: ReadonlyArray<readonly [string, number, string]> = [
  ["C", C, "3fe15f15f15f15f1"],
  ["D", D, "bfe691de2532c834"],
  ["E", E, "3ff6a0ea0ea0ea0f"],
  ["F", F, "3ff9b6db6db6db6e"],
  ["G", G, "3fd6db6db6db6db7"],
];

/**
 * Bit-exact equivalent of Java's `StrictMath.cbrt(x)`.
 *
 * @param x any double
 * @returns the real cube root, sign-preserving: `cbrt(-8) === -2`, `cbrt(-0)` is `-0`
 */
export function fdlibmCbrt(x: number): number {
  let hx = getHighWord(x);
  const sign = hx & 0x80000000;
  hx ^= sign;
  if (hx >= 0x7ff00000) {
    return x + x; /* cbrt(NaN, INF) is itself */
  }
  const low = getLowWord(x);
  if ((hx | low) === 0) {
    return x; /* cbrt(0) is itself, sign included */
  }

  let ax = setHighWord(x, hx); /* ax <- |x| */

  /* rough cbrt to 5 bits */
  let t: number;
  if (hx < 0x00100000) {
    /* subnormal number */
    t = insertWords(0x43500000, 0); /* t = 2**54 */
    t *= ax;
    t = insertWords(((getHighWord(t) / 3) | 0) + B2, 0);
  } else {
    t = insertWords(((hx / 3) | 0) + B1, 0);
  }

  /* new cbrt to 23 bits, may be implemented in single precision */
  let r = (t * t) / ax;
  const s = C + r * t;
  t *= G + F / (s + E + D / s);

  /* chopped to 20 bits and make it larger than cbrt(x) */
  t = setLowWord(t, 0);
  t = setHighWord(t, (getHighWord(t) + 0x00000001) | 0);

  /* one step Newton iteration to 53 bits with error less than 0.667 ulps */
  const s2 = t * t; /* t*t is exact */
  r = ax / s2;
  const w = t + t;
  r = (r - t) / (w + r); /* r-s is exact */
  t = t + t * r;

  /* restore the sign bit */
  t = setHighWord(t, (getHighWord(t) | sign) | 0);
  return t;
}
