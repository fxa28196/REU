/**
 * fdlibm `__ieee754_atanh`, ported to TypeScript.
 *
 * <p><b>Provenance and its one honest gap.</b> Sun/FreeBSD fdlibm `e_atanh.c`. Unlike every
 * other kernel in this directory there is **no `StrictMath.atanh`** — `java.lang.StrictMath`
 * has no inverse hyperbolic functions at all — so this port cannot be checked against an
 * independent Java oracle the way `log`, `exp`, `pow`, `sin`, `cos`, `atan`, `atan2`,
 * `sqrt`, `cbrt`, `log1p` and `hypot` are. What the fixture suite can and does check:
 *
 * <ol>
 *   <li>the argument reduction is exercised against a Java column computed as
 *       {@code 0.5 * StrictMath.log1p(...)} over the same decomposition — that validates
 *       every branch and the `log1p` port underneath, but it is a <i>composite</i> oracle,
 *       not an independent implementation of `atanh` (labelled as such in the fixture);</li>
 *   <li>an independent-formula cross-check in TypeScript against
 *       `0.5 * fdlibmLog((1+x)/(1-x))`, which shares no code path with this file below
 *       {@link fdlibmLog1p};</li>
 *   <li>cross-engine byte identity, which is the property this file actually exists to
 *       buy and which holds by construction: every operation below is IEEE-754 double
 *       arithmetic plus {@link fdlibmLog1p}.</li>
 * </ol>
 *
 * <p><b>Call site and exposure.</b> Exactly one, and it is inert: `geographiclib`'s
 * `Geodesic` constructor computes the authalic radius squared `_c2` as
 * `(a^2 + b^2 * atanh(sqrt(e2)) / sqrt(e2)) / 2`. `_c2` is consumed only by the `AREA`
 * output mask, which this port never requests (`DIRECT_MASK_*` / `INVERSE_MASK_*` in
 * `engine/src/geo/geodesic.ts`). It is routed here anyway because leaving one host
 * transcendental in the vendored solver would leave the cross-engine gate asserting a
 * property that happens to hold rather than one that must.
 */

import { getHighWord, getLowWord, setHighWord } from "./bits.js";
import { fdlibmLog1p } from "./log1p.js";

const one = 1.0;
const huge = 1e300;
const zero = 0.0;

/**
 * Bit-exact equivalent of fdlibm's `atanh(x)`.
 *
 * @param x any double
 * @returns `NaN` for |x| > 1 or NaN input, `+-Infinity` at `x = +-1`
 */
export function fdlibmAtanh(x: number): number {
  const hx = getHighWord(x);
  const lx = getLowWord(x);
  const ix = hx & 0x7fffffff;
  // fdlibm writes `(ix|((lx|(-lx))>>31)) > 0x3ff00000`; on an unsigned `lx` that shift is
  // exactly "is the low word non-zero", spelled out here because JS `|` re-signs its operands.
  if ((ix | (lx !== 0 ? 1 : 0)) > 0x3ff00000) {
    /* |x| > 1 */
    return (x - x) / (x - x);
  }
  if (ix === 0x3ff00000) {
    return x / zero;
  }
  if (ix < 0x3e300000 && huge + x > zero) {
    return x; /* |x| < 2**-28 */
  }
  const ax = setHighWord(x, ix); /* ax <- |x| */
  let t: number;
  if (ix < 0x3fe00000) {
    /* |x| < 0.5 */
    t = ax + ax;
    t = 0.5 * fdlibmLog1p(t + (t * ax) / (one - ax));
  } else {
    t = 0.5 * fdlibmLog1p((ax + ax) / (one - ax));
  }
  return hx >= 0 ? t : -t;
}
