/**
 * fdlibm `__ieee754_exp`, ported to TypeScript.
 *
 * <p><b>Provenance.</b> Sun/FreeBSD fdlibm `e_exp.c`, the routine `java.lang.StrictMath.exp`
 * is specified against. Constant values, branch order and expression association are
 * verbatim.
 *
 * <p><b>Call site.</b> `GisAgent.java:413` — `double p = 1.0 / (1.0 + Math.exp(-u));` the
 * logistic that turns the Phase-E decision utility into an outreach/hazard Bernoulli
 * probability. That probability is compared against a per-agent `nextDouble()`, so a
 * last-ulp difference in `exp` can flip an agent's decision at a knife edge. Routing it
 * through fdlibm makes the JS side reproducible across engines (plan §3.3: "all
 * transcendentals via fdlibm"; DR-S1 §5.4: the module's job is JS ≡ JS).
 *
 * Method (from the source comments):
 *   1. r = x - k*ln2, |r| <= 0.5*ln2, k integer
 *   2. exp(r) approximated by r + r*R/(2 - R) with a degree-10 even polynomial R(r^2)
 *   3. exp(x) = 2^k * exp(r)
 */

import { getHighWord, getLowWord, setHighWord } from "./bits.js";

/* eslint-disable @typescript-eslint/naming-convention -- names mirror fdlibm e_exp.c */
const one = 1.0;
const halF = [0.5, -0.5] as const;
const huge = 1.0e300;
const twom1000 = 9.33263618503218878990e-302; /* 2**-1000 = 0x01700000 0 */
const o_threshold = 7.09782712893383973096e2; /* 0x40862E42 FEFA39EF */
const u_threshold = -7.45133219101941108420e2; /* 0xC0874910 D52D3051 */
const ln2HI = [6.93147180369123816490e-01, -6.93147180369123816490e-01] as const;
const ln2LO = [1.90821492927058770002e-10, -1.90821492927058770002e-10] as const;
const invln2 = 1.44269504088896338700e0; /* 0x3FF71547 652B82FE */
const P1 = 1.66666666666666019037e-01; /* 0x3FC55555 5555553E */
const P2 = -2.77777777770155933842e-03; /* 0xBF66C16C 16BEBD93 */
const P3 = 6.61375632143793436117e-05; /* 0x3F11566A AF25DE2C */
const P4 = -1.65339022054652515390e-06; /* 0xBEBBBD41 C5D26BF1 */
const P5 = 4.13813679705723846039e-08; /* 0x3E663769 72BEA4D0 */
/* eslint-enable @typescript-eslint/naming-convention */

/** Documented raw bit patterns of the constants above; asserted by the test suite. */
export const FDLIBM_EXP_CONSTANT_BITS: ReadonlyArray<readonly [string, number, string]> = [
  ["twom1000", twom1000, "0170000000000000"],
  ["o_threshold", o_threshold, "40862e42fefa39ef"],
  ["u_threshold", u_threshold, "c0874910d52d3051"],
  ["ln2HI[0]", ln2HI[0], "3fe62e42fee00000"],
  ["ln2LO[0]", ln2LO[0], "3dea39ef35793c76"],
  ["invln2", invln2, "3ff71547652b82fe"],
  ["P1", P1, "3fc555555555553e"],
  ["P2", P2, "bf66c16c16bebd93"],
  ["P3", P3, "3f11566aaf25de2c"],
  ["P4", P4, "bebbbd41c5d26bf1"],
  ["P5", P5, "3e66376972bea4d0"],
];

/** Bit-exact equivalent of Java's `StrictMath.exp(x)`. */
export function fdlibmExp(x: number): number {
  let y: number;
  let hi = 0;
  let lo = 0;
  let k = 0;

  let hx = getHighWord(x);
  const xsb = (hx >>> 31) & 1; /* sign bit of x */
  hx &= 0x7fffffff; /* high word of |x| */

  /* filter out non-finite argument */
  if (hx >= 0x40862e42) {
    /* if |x| >= 709.78... */
    if (hx >= 0x7ff00000) {
      const lx = getLowWord(x);
      if (((hx & 0xfffff) | lx) !== 0) {
        return x + x; /* NaN */
      }
      return xsb === 0 ? x : 0.0; /* exp(+-inf) = {inf, 0} */
    }
    if (x > o_threshold) {
      return huge * huge; /* overflow */
    }
    if (x < u_threshold) {
      return twom1000 * twom1000; /* underflow */
    }
  }

  /* argument reduction */
  if (hx > 0x3fd62e42) {
    /* if |x| > 0.5 ln2 */
    if (hx < 0x3ff0a2b2) {
      /* and |x| < 1.5 ln2 */
      hi = x - ln2HI[xsb]!;
      lo = ln2LO[xsb]!;
      k = 1 - xsb - xsb;
    } else {
      // C's (int) cast of a double truncates toward zero; Math.trunc is the same for
      // every argument this branch can produce (|invln2*x| < 1025).
      k = Math.trunc(invln2 * x + halF[xsb]!);
      const t = k;
      hi = x - t * ln2HI[0]; /* t*ln2HI is exact here */
      lo = t * ln2LO[0];
    }
    x = hi - lo;
  } else if (hx < 0x3e300000) {
    /* when |x| < 2**-28 */
    if (huge + x > one) {
      return one + x; /* trigger inexact */
    }
  } else {
    k = 0;
  }

  /* x is now in primary range */
  const t = x * x;
  const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) {
    return one - ((x * c) / (c - 2.0) - x);
  }
  y = one - (lo - (x * c) / (2.0 - c) - hi);
  if (k >= -1021) {
    /* add k to y's exponent */
    return setHighWord(y, (getHighWord(y) + (k << 20)) | 0);
  }
  y = setHighWord(y, (getHighWord(y) + ((k + 1000) << 20)) | 0);
  return y * twom1000;
}
