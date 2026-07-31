/**
 * fdlibm `__ieee754_hypot`, ported to TypeScript.
 *
 * <p><b>Provenance.</b> Sun/FreeBSD fdlibm `e_hypot.c` — the file `java.lang.StrictMath.hypot`
 * is specified against. The scaling ladder, the exact `t1`/`t2` splitting of the larger
 * operand and the branch order are preserved verbatim.
 *
 * <p><b>Status of this kernel: available, deliberately unused by the geodesic solver.</b>
 * `geographiclib`'s own `Math.hypot` helper is *not* the libm `hypot`: it is
 * `sqrt(x*x + y*y)`, and the upstream source carries the comment "Built in Math.hypot gives
 * incorrect results from GeodSolve92". Routing the vendored solver through this kernel would
 * therefore be a behaviour change dressed as a determinism fix. The kernel is provided
 * because plan Q12/DR-WP3 §5 names `hypot` in the list of transcendentals the port must own,
 * and because `sqrt(x*x+y*y)` overflows where `hypot` does not — any future call site that
 * needs the numerically safe form now has a deterministic one to use.
 */

import { getHighWord, getLowWord, insertWords, setHighWord } from "./bits.js";

/**
 * Bit-exact equivalent of Java's `StrictMath.hypot(x, y)`.
 *
 * @returns `sqrt(x*x + y*y)` without intermediate overflow or underflow
 */
export function fdlibmHypot(x: number, y: number): number {
  let ha = getHighWord(x) & 0x7fffffff;
  let hb = getHighWord(y) & 0x7fffffff;
  let a: number;
  let b: number;
  if (hb > ha) {
    a = y;
    b = x;
    const j = ha;
    ha = hb;
    hb = j;
  } else {
    a = x;
    b = y;
  }
  a = setHighWord(a, ha); /* a <- |a| */
  b = setHighWord(b, hb); /* b <- |b| */
  if (ha - hb > 0x3c00000) {
    return a + b; /* x/y > 2**60 */
  }
  let k = 0;
  if (ha > 0x5f300000) {
    /* a > 2**500 */
    if (ha >= 0x7ff00000) {
      /* Inf or NaN */
      let w = a + b; /* for sNaN */
      if (((ha & 0xfffff) | getLowWord(a)) === 0) {
        w = a;
      }
      if (((hb ^ 0x7ff00000) | getLowWord(b)) === 0) {
        w = b;
      }
      return w;
    }
    /* scale a and b by 2**-600 */
    ha -= 0x25800000;
    hb -= 0x25800000;
    k += 600;
    a = setHighWord(a, ha);
    b = setHighWord(b, hb);
  }
  if (hb < 0x20b00000) {
    /* b < 2**-500 */
    if (hb <= 0x000fffff) {
      /* subnormal b or 0 */
      if ((hb | getLowWord(b)) === 0) {
        return a;
      }
      const t1s = insertWords(0x7fd00000, 0); /* t1 = 2^1022 */
      b *= t1s;
      a *= t1s;
      k -= 1022;
    } else {
      /* scale a and b by 2^600 */
      ha += 0x25800000;
      hb += 0x25800000;
      k -= 600;
      a = setHighWord(a, ha);
      b = setHighWord(b, hb);
    }
  }
  /* medium size a and b.
   *
   * The C source reuses the cached `ha`/`hb` here; the JDK's `FdLibm.Hypot` re-reads the
   * high words of `a` and `b` instead. Those agree in every branch that writes the cache
   * back, and only the re-read form is correct after the subnormal rescale above (which
   * multiplies `a` and `b` by 2^1022 without touching `ha`/`hb`). `__HI(a)` after the
   * doubling below is exactly the C source's `ha + 0x00100000`. */
  let w = a - b;
  if (w > b) {
    const t1 = insertWords(getHighWord(a), 0);
    const t2 = a - t1;
    w = Math.sqrt(t1 * t1 - (b * -b - t2 * (a + t1)));
  } else {
    a = a + a;
    const y1 = insertWords(getHighWord(b), 0);
    const y2 = b - y1;
    const t1 = insertWords(getHighWord(a), 0);
    const t2 = a - t1;
    w = Math.sqrt(t1 * y1 - (w * -w - (t1 * y2 + t2 * b)));
  }
  if (k !== 0) {
    const t1 = setHighWord(1.0, (getHighWord(1.0) + (k << 20)) | 0);
    return t1 * w;
  }
  return w;
}
