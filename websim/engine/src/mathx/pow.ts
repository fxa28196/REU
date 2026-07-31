/**
 * fdlibm `__ieee754_pow`, ported to TypeScript.
 *
 * <p><b>Provenance.</b> Sun/FreeBSD fdlibm `e_pow.c` (including the CYGNUS-local fix that
 * replaced the implementation-defined `(hx>>31)+1` with an unsigned shift), the routine
 * `java.lang.StrictMath.pow` is specified against. Constant values, branch order and
 * expression association are verbatim; the many `SET_LOW_WORD(v, 0)` truncations that
 * split a double into a 24-bit-mantissa "high" part and an exact tail are the whole
 * mechanism of the algorithm and must not be simplified away.
 *
 * <p><b>Call site.</b> `GisAgent.java:378` — `double decay = Math.pow(2.0, -1.0 /
 * decisionConfig.riskHalfLifeH);` the per-tick exponential decay of the Phase-E risk
 * accumulator. It is applied once per agent per tick and compounds over the whole run, so
 * an engine-dependent last ulp here does not stay a last ulp.
 *
 * Method (from the source comments):
 *   1. compute and return log2(x) in two pieces: log2(x) = w1 + w2, w1 has 53-24 = 29 bits
 *   2. perform y*log2(x) = n + y' by simulating multi-precision arithmetic
 *   3. return x**y = 2**n * exp(y'*log2)
 */

import {
  getHighWord,
  getLowWord,
  scalbn,
  setHighWord,
  setLowWord,
} from "./bits.js";

/* eslint-disable @typescript-eslint/naming-convention -- names mirror fdlibm e_pow.c */
const bp = [1.0, 1.5] as const;
const dp_h = [0.0, 5.84962487220764160156e-01] as const; /* 0x3FE2B803 40000000 */
const dp_l = [0.0, 1.35003920212974897128e-08] as const; /* 0x3E4CFDEB 43CFD006 */
const zero = 0.0;
const one = 1.0;
const two = 2.0;
const two53 = 9007199254740992.0; /* 0x43400000 00000000 */
const huge = 1.0e300;
const tiny = 1.0e-300;
/* poly coefs for (3/2)*(log(x)-2s-2/3*s**3 */
const L1 = 5.99999999999994648725e-01; /* 0x3FE33333 33333303 */
const L2 = 4.28571428578550184252e-01; /* 0x3FDB6DB6 DB6FABFF */
const L3 = 3.33333329818377432918e-01; /* 0x3FD55555 518F264D */
const L4 = 2.72728123808534006489e-01; /* 0x3FD17460 A91D4101 */
const L5 = 2.30660745775561754067e-01; /* 0x3FCD864A 93C9DB65 */
const L6 = 2.06975017800338417784e-01; /* 0x3FCA7E28 4A454EEF */
const P1 = 1.66666666666666019037e-01; /* 0x3FC55555 5555553E */
const P2 = -2.77777777770155933842e-03; /* 0xBF66C16C 16BEBD93 */
const P3 = 6.61375632143793436117e-05; /* 0x3F11566A AF25DE2C */
const P4 = -1.65339022054652515390e-06; /* 0xBEBBBD41 C5D26BF1 */
const P5 = 4.13813679705723846039e-08; /* 0x3E663769 72BEA4D0 */
const lg2 = 6.93147180559945286227e-01; /* 0x3FE62E42 FEFA39EF */
const lg2_h = 6.93147182464599609375e-01; /* 0x3FE62E43 00000000 */
const lg2_l = -1.90465429995776804525e-09; /* 0xBE205C61 0CA86C39 */
const ovt = 8.0085662595372944372e-17; /* -(1024-log2(ovfl+.5ulp)) */
const cp = 9.61796693925975554329e-01; /* 0x3FEEC709 DC3A03FD = 2/(3ln2) */
const cp_h = 9.61796700954437255859e-01; /* 0x3FEEC709 E0000000 = (float)cp */
const cp_l = -7.02846165095275826516e-09; /* 0xBE3E2FE0 145B01F5 = tail of cp_h */
const ivln2 = 1.44269504088896338700e0; /* 0x3FF71547 652B82FE = 1/ln2 */
const ivln2_h = 1.44269502162933349609e0; /* 0x3FF71547 60000000 = 24b 1/ln2 */
const ivln2_l = 1.92596299112661746887e-08; /* 0x3E54AE0B F85DDF44 = 1/ln2 tail */
/* eslint-enable @typescript-eslint/naming-convention */

/** Documented raw bit patterns of the constants above; asserted by the test suite. */
export const FDLIBM_POW_CONSTANT_BITS: ReadonlyArray<readonly [string, number, string]> = [
  ["dp_h[1]", dp_h[1], "3fe2b80340000000"],
  ["dp_l[1]", dp_l[1], "3e4cfdeb43cfd006"],
  ["L1", L1, "3fe3333333333303"],
  ["L2", L2, "3fdb6db6db6fabff"],
  ["L3", L3, "3fd55555518f264d"],
  ["L4", L4, "3fd17460a91d4101"],
  ["L5", L5, "3fcd864a93c9db65"],
  ["L6", L6, "3fca7e284a454eef"],
  ["lg2", lg2, "3fe62e42fefa39ef"],
  ["lg2_h", lg2_h, "3fe62e4300000000"],
  ["lg2_l", lg2_l, "be205c610ca86c39"],
  ["cp", cp, "3feec709dc3a03fd"],
  ["cp_h", cp_h, "3feec709e0000000"],
  ["cp_l", cp_l, "be3e2fe0145b01f5"],
  ["ivln2", ivln2, "3ff71547652b82fe"],
  ["ivln2_h", ivln2_h, "3ff7154760000000"],
  ["ivln2_l", ivln2_l, "3e54ae0bf85ddf44"],
];

/** Bit-exact equivalent of Java's `StrictMath.pow(x, y)`. */
export function fdlibmPow(x: number, y: number): number {
  let z: number;
  let z_h: number;
  let z_l: number;
  let p_h: number;
  let p_l: number;
  let t1: number;
  let t2: number;
  let r: number;
  let t: number;
  let u: number;
  let v: number;
  let w: number;
  let i: number;
  let j: number;
  let k: number;
  let n: number;

  const hx = getHighWord(x);
  const lx = getLowWord(x);
  const hy = getHighWord(y);
  const ly = getLowWord(y);
  let ix = hx & 0x7fffffff;
  const iy = hy & 0x7fffffff;

  /* y == zero: x**0 = 1 */
  if ((iy | ly) === 0) {
    return one;
  }

  /* +-NaN return x+y */
  if (
    ix > 0x7ff00000 ||
    (ix === 0x7ff00000 && lx !== 0) ||
    iy > 0x7ff00000 ||
    (iy === 0x7ff00000 && ly !== 0)
  ) {
    return x + y;
  }

  /*
   * determine if y is an odd int when x < 0
   *   yisint = 0 ... y is not an integer
   *   yisint = 1 ... y is an odd int
   *   yisint = 2 ... y is an even int
   */
  let yisint = 0;
  if (hx < 0) {
    if (iy >= 0x43400000) {
      yisint = 2; /* even integer y */
    } else if (iy >= 0x3ff00000) {
      k = (iy >> 20) - 0x3ff; /* exponent */
      if (k > 20) {
        j = ly >>> (52 - k);
        if ((j << (52 - k)) >>> 0 === ly) {
          yisint = 2 - (j & 1);
        }
      } else if (ly === 0) {
        j = iy >> (20 - k);
        if (j << (20 - k) === iy) {
          yisint = 2 - (j & 1);
        }
      }
    }
  }

  /* special value of y */
  if (ly === 0) {
    if (iy === 0x7ff00000) {
      /* y is +-inf */
      if (((ix - 0x3ff00000) | lx) === 0) {
        return y - y; /* inf**+-1 is NaN */
      }
      if (ix >= 0x3ff00000) {
        /* (|x|>1)**+-inf = inf, 0 */
        return hy >= 0 ? y : zero;
      }
      /* (|x|<1)**-,+inf = inf, 0 */
      return hy < 0 ? -y : zero;
    }
    if (iy === 0x3ff00000) {
      /* y is +-1 */
      return hy < 0 ? one / x : x;
    }
    if (hy === 0x40000000) {
      return x * x; /* y is 2 */
    }
    if (hy === 0x3fe00000) {
      /* y is 0.5 */
      if (hx >= 0) {
        /* x >= +0 */
        return Math.sqrt(x);
      }
    }
  }

  let ax = Math.abs(x);
  /* special value of x */
  if (lx === 0) {
    if (ix === 0x7ff00000 || ix === 0 || ix === 0x3ff00000) {
      z = ax; /* x is +-0, +-inf, +-1 */
      if (hy < 0) {
        z = one / z; /* z = (1/|x|) */
      }
      if (hx < 0) {
        if (((ix - 0x3ff00000) | yisint) === 0) {
          z = (z - z) / (z - z); /* (-1)**non-int is NaN */
        } else if (yisint === 1) {
          z = -z; /* (x<0)**odd = -(|x|**odd) */
        }
      }
      return z;
    }
  }

  /*
   * CYGNUS LOCAL + fdlibm-5.3 fix: this used to be `n = (hx>>31)+1`, but ANSI C leaves
   * the right shift of a signed negative quantity implementation defined.
   */
  n = (hx >>> 31) - 1;

  /* (x<0)**(non-int) is NaN */
  if ((n | yisint) === 0) {
    return (x - x) / (x - x);
  }

  let s = one; /* s (sign of result -ve**odd) = -1 else = 1 */
  if ((n | (yisint - 1)) === 0) {
    s = -one; /* (-ve)**(odd int) */
  }

  /* |y| is huge */
  if (iy > 0x41e00000) {
    /* if |y| > 2**31 */
    if (iy > 0x43f00000) {
      /* if |y| > 2**64, must o/uflow */
      if (ix <= 0x3fefffff) {
        return hy < 0 ? huge * huge : tiny * tiny;
      }
      if (ix >= 0x3ff00000) {
        return hy > 0 ? huge * huge : tiny * tiny;
      }
    }
    /* over/underflow if x is not close to one */
    if (ix < 0x3fefffff) {
      return hy < 0 ? s * huge * huge : s * tiny * tiny;
    }
    if (ix > 0x3ff00000) {
      return hy > 0 ? s * huge * huge : s * tiny * tiny;
    }
    /*
     * now |1-x| is tiny <= 2**-20, suffice to compute
     * log(x) by x - x^2/2 + x^3/3 - x^4/4
     */
    t = ax - one; /* t has 20 trailing zeros */
    w = t * t * (0.5 - t * (0.3333333333333333333333 - t * 0.25));
    u = ivln2_h * t; /* ivln2_h has 21 sig. bits */
    v = t * ivln2_l - w * ivln2;
    t1 = u + v;
    t1 = setLowWord(t1, 0);
    t2 = v - (t1 - u);
  } else {
    let ss: number;
    let s2: number;
    let s_h: number;
    let s_l: number;
    let t_h: number;
    let t_l: number;
    n = 0;
    /* take care of subnormal number */
    if (ix < 0x00100000) {
      ax *= two53;
      n -= 53;
      ix = getHighWord(ax);
    }
    n += (ix >> 20) - 0x3ff;
    j = ix & 0x000fffff;
    /* determine interval */
    ix = j | 0x3ff00000; /* normalize ix */
    if (j <= 0x3988e) {
      k = 0; /* |x| < sqrt(3/2) */
    } else if (j < 0xbb67a) {
      k = 1; /* |x| < sqrt(3) */
    } else {
      k = 0;
      n += 1;
      ix -= 0x00100000;
    }
    ax = setHighWord(ax, ix);

    /* compute ss = s_h + s_l = (x-1)/(x+1) or (x-1.5)/(x+1.5) */
    u = ax - bp[k]!; /* bp[0]=1.0, bp[1]=1.5 */
    v = one / (ax + bp[k]!);
    ss = u * v;
    s_h = setLowWord(ss, 0);
    /* t_h = ax + bp[k] High */
    t_h = setHighWord(zero, (((ix >> 1) | 0x20000000) + 0x00080000 + (k << 18)) | 0);
    t_l = ax - (t_h - bp[k]!);
    s_l = v * (u - s_h * t_h - s_h * t_l);
    /* compute log(ax) */
    s2 = ss * ss;
    r = s2 * s2 * (L1 + s2 * (L2 + s2 * (L3 + s2 * (L4 + s2 * (L5 + s2 * L6)))));
    r += s_l * (s_h + ss);
    s2 = s_h * s_h;
    t_h = setLowWord(3.0 + s2 + r, 0);
    t_l = r - (t_h - 3.0 - s2);
    /* u+v = ss*(1+...) */
    u = s_h * t_h;
    v = s_l * t_h + t_l * ss;
    /* 2/(3log2) * (ss+...) */
    p_h = setLowWord(u + v, 0);
    p_l = v - (p_h - u);
    z_h = cp_h * p_h; /* cp_h + cp_l = 2/(3*log2) */
    z_l = cp_l * p_h + p_l * cp + dp_l[k]!;
    /* log2(ax) = (ss+..)*2/(3*log2) = n + dp_h + z_h + z_l */
    t = n;
    t1 = setLowWord(z_h + z_l + dp_h[k]! + t, 0);
    t2 = z_l - (t1 - t - dp_h[k]! - z_h);
  }

  /* split up y into y1+y2 and compute (y1+y2)*(t1+t2) */
  const y1 = setLowWord(y, 0);
  p_l = (y - y1) * t1 + y * t2;
  p_h = y1 * t1;
  z = p_l + p_h;
  j = getHighWord(z);
  i = getLowWord(z);
  if (j >= 0x40900000) {
    /* z >= 1024 */
    if (((j - 0x40900000) | i) !== 0) {
      /* if z > 1024 */
      return s * huge * huge; /* overflow */
    }
    if (p_l + ovt > z - p_h) {
      return s * huge * huge; /* overflow */
    }
  } else if ((j & 0x7fffffff) >= 0x4090cc00) {
    /* z <= -1075 */
    if (((j - 0xc090cc00) | i) !== 0) {
      /* z < -1075 */
      return s * tiny * tiny; /* underflow */
    }
    if (p_l <= z - p_h) {
      return s * tiny * tiny; /* underflow */
    }
  }

  /* compute 2**(p_h+p_l) */
  i = j & 0x7fffffff;
  k = (i >> 20) - 0x3ff;
  n = 0;
  if (i > 0x3fe00000) {
    /* if |z| > 0.5, set n = [z+0.5] */
    n = (j + (0x00100000 >> (k + 1))) | 0;
    k = ((n & 0x7fffffff) >> 20) - 0x3ff; /* new k for n */
    t = setHighWord(zero, n & ~(0x000fffff >> k));
    n = ((n & 0x000fffff) | 0x00100000) >> (20 - k);
    if (j < 0) {
      n = -n;
    }
    p_h -= t;
  }
  t = setLowWord(p_l + p_h, 0);
  u = t * lg2_h;
  v = (p_l - (t - p_h)) * lg2 + t * lg2_l;
  z = u + v;
  w = v - (z - u);
  t = z * z;
  t1 = z - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  r = (z * t1) / (t1 - two) - (w + z * w);
  z = one - (r - z);
  j = getHighWord(z);
  j = (j + (n << 20)) | 0;
  if (j >> 20 <= 0) {
    z = scalbn(z, n); /* subnormal output */
  } else {
    z = setHighWord(z, j);
  }
  return s * z;
}
