/**
 * fdlibm `atan` and `__ieee754_atan2`, ported to TypeScript.
 *
 * <p><b>Provenance.</b> Sun/FreeBSD fdlibm `s_atan.c` ({@link fdlibmAtan}) and
 * `e_atan2.c` ({@link fdlibmAtan2}) — the routines `java.lang.StrictMath.atan` and
 * `StrictMath.atan2` are specified against. `atan2` delegates to `atan` in the general
 * case, which is why both live in one file: they are one algorithm with a quadrant
 * wrapper, and splitting them would invite two divergent copies of the reduction table.
 *
 * <p><b>Call site.</b> GeographicLib-Java 1.49 calls `Math.atan2` 16 times — more than any
 * other transcendental (DR-S1 §3.2) — throughout `Geodesic.Direct`/`GeodesicLine.Position`,
 * the movement path every agent takes every tick. As with {@link import("./trig.js")}, the
 * reachable goal is JS ≡ JS across engines (ECMA-262 leaves `Math.atan2`
 * implementation-approximated), not JS ≡ the archived HotSpot-intrinsic Java.
 *
 * Method for `atan` (from the source comments): reduce |x| into one of five intervals
 * using `atan(x) = atan(t) + atan((x-t)/(1+x*t))` for t in {0.5, 1, 1.5, inf}, then
 * evaluate an odd degree-21 polynomial in the reduced argument.
 */

import { getHighWord, getLowWord, setHighWord } from "./bits.js";

/* eslint-disable @typescript-eslint/naming-convention -- names mirror the fdlibm sources */

// --------------------------------------------------------------- s_atan.c ---
const atanhi = [
  4.63647609000806093515e-01, /* atan(0.5)hi 0x3FDDAC67 0561BB4F */
  7.85398163397448278999e-01, /* atan(1.0)hi 0x3FE921FB 54442D18 */
  9.82793723247329054082e-01, /* atan(1.5)hi 0x3FEF730B D281F69B */
  1.57079632679489655800e0, /* atan(inf)hi 0x3FF921FB 54442D18 */
] as const;

const atanlo = [
  2.26987774529616870924e-17, /* atan(0.5)lo 0x3C7A2B7F 222F65E2 */
  3.06161699786838301793e-17, /* atan(1.0)lo 0x3C81A626 33145C07 */
  1.39033110312309984516e-17, /* atan(1.5)lo 0x3C700788 7AF0CBBD */
  6.12323399573676603587e-17, /* atan(inf)lo 0x3C91A626 33145C07 */
] as const;

const aT = [
  3.33333333333329318027e-01, /* 0x3FD55555 5555550D */
  -1.99999999998764832476e-01, /* 0xBFC99999 9998EBC4 */
  1.42857142725034663711e-01, /* 0x3FC24924 920083FF */
  -1.11111104054623557880e-01, /* 0xBFBC71C6 FE231671 */
  9.09088713343650656196e-02, /* 0x3FB745CD C54C206E */
  -7.69187620504482999495e-02, /* 0xBFB3B0F2 AF749A6D */
  6.66107313738753120669e-02, /* 0x3FB10D66 A0D03D51 */
  -5.83357013379057348645e-02, /* 0xBFADDE2D 52DEFD9A */
  4.97687799461593236017e-02, /* 0x3FA97B4B 24760DEB */
  -3.65315727442169155270e-02, /* 0xBFA2B444 2C6A6C2F */
  1.62858201153657823623e-02, /* 0x3F90AD3A E322DA11 */
] as const;

const one = 1.0;
const huge = 1.0e300;

// -------------------------------------------------------------- e_atan2.c ---
const tiny = 1.0e-300;
const zero = 0.0;
const pi_o_4 = 7.8539816339744827900e-01; /* 0x3FE921FB 54442D18 */
const pi_o_2 = 1.5707963267948965580e0; /* 0x3FF921FB 54442D18 */
const pi = 3.1415926535897931160e0; /* 0x400921FB 54442D18 */
const pi_lo = 1.2246467991473531772e-16; /* 0x3CA1A626 33145C07 */

/* eslint-enable @typescript-eslint/naming-convention */

/** Documented raw bit patterns of the constants above; asserted by the test suite. */
export const FDLIBM_ATAN_CONSTANT_BITS: ReadonlyArray<readonly [string, number, string]> = [
  ["atanhi[0]", atanhi[0], "3fddac670561bb4f"],
  ["atanhi[3]", atanhi[3], "3ff921fb54442d18"],
  ["atanlo[0]", atanlo[0], "3c7a2b7f222f65e2"],
  ["atanlo[3]", atanlo[3], "3c91a62633145c07"],
  ["aT[0]", aT[0], "3fd555555555550d"],
  ["aT[10]", aT[10], "3f90ad3ae322da11"],
  ["pi_o_4", pi_o_4, "3fe921fb54442d18"],
  ["pi_o_2", pi_o_2, "3ff921fb54442d18"],
  ["pi", pi, "400921fb54442d18"],
  ["pi_lo", pi_lo, "3ca1a62633145c07"],
];

/** Bit-exact equivalent of Java's `StrictMath.atan(x)`. */
export function fdlibmAtan(x: number): number {
  let id: number;

  const hx = getHighWord(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x44100000) {
    /* if |x| >= 2^66 */
    const low = getLowWord(x);
    if (ix > 0x7ff00000 || (ix === 0x7ff00000 && low !== 0)) {
      return x + x; /* NaN */
    }
    return hx > 0 ? atanhi[3] + atanlo[3] : -atanhi[3] - atanlo[3];
  }
  if (ix < 0x3fdc0000) {
    /* |x| < 0.4375 */
    if (ix < 0x3e400000) {
      /* |x| < 2**-27 */
      if (huge + x > one) {
        return x; /* raise inexact */
      }
    }
    id = -1;
  } else {
    x = Math.abs(x);
    if (ix < 0x3ff30000) {
      /* |x| < 1.1875 */
      if (ix < 0x3fe60000) {
        /* 7/16 <= |x| < 11/16 */
        id = 0;
        x = (2.0 * x - one) / (2.0 + x);
      } else {
        /* 11/16 <= |x| < 19/16 */
        id = 1;
        x = (x - one) / (x + one);
      }
    } else if (ix < 0x40038000) {
      /* |x| < 2.4375 */
      id = 2;
      x = (x - 1.5) / (one + 1.5 * x);
    } else {
      /* 2.4375 <= |x| < 2^66 */
      id = 3;
      x = -1.0 / x;
    }
  }
  /* end of argument reduction */
  let z = x * x;
  const w = z * z;
  /* break sum from i=0 to 10 aT[i]z**(i+1) into odd and even poly */
  const s1 =
    z * (aT[0] + w * (aT[2] + w * (aT[4] + w * (aT[6] + w * (aT[8] + w * aT[10])))));
  const s2 = w * (aT[1] + w * (aT[3] + w * (aT[5] + w * (aT[7] + w * aT[9]))));
  if (id < 0) {
    return x - x * (s1 + s2);
  }
  z = atanhi[id]! - (x * (s1 + s2) - atanlo[id]! - x);
  return hx < 0 ? -z : z;
}

/** Bit-exact equivalent of Java's `StrictMath.atan2(y, x)`. */
export function fdlibmAtan2(y: number, x: number): number {
  const hx = getHighWord(x);
  const lx = getLowWord(x);
  const hy = getHighWord(y);
  const ly = getLowWord(y);
  const ix = hx & 0x7fffffff;
  const iy = hy & 0x7fffffff;

  /* x or y is NaN */
  if (
    (ix | (lx !== 0 ? 1 : 0)) > 0x7ff00000 ||
    (iy | (ly !== 0 ? 1 : 0)) > 0x7ff00000
  ) {
    return x + y;
  }
  if (((hx - 0x3ff00000) | lx) === 0) {
    return fdlibmAtan(y); /* x = 1.0 */
  }
  const m = ((hy >> 31) & 1) | ((hx >> 30) & 2); /* 2*sign(x) + sign(y) */

  /* when y = 0 */
  if ((iy | ly) === 0) {
    switch (m) {
      case 0:
      case 1:
        return y; /* atan(+-0, +anything) = +-0 */
      case 2:
        return pi + tiny; /* atan(+0, -anything) = pi */
      default:
        return -pi - tiny; /* atan(-0, -anything) = -pi */
    }
  }
  /* when x = 0 */
  if ((ix | lx) === 0) {
    return hy < 0 ? -pi_o_2 - tiny : pi_o_2 + tiny;
  }

  /* when x is INF */
  if (ix === 0x7ff00000) {
    if (iy === 0x7ff00000) {
      switch (m) {
        case 0:
          return pi_o_4 + tiny; /* atan(+INF, +INF) */
        case 1:
          return -pi_o_4 - tiny; /* atan(-INF, +INF) */
        case 2:
          return 3.0 * pi_o_4 + tiny; /* atan(+INF, -INF) */
        default:
          return -3.0 * pi_o_4 - tiny; /* atan(-INF, -INF) */
      }
    }
    switch (m) {
      case 0:
        return zero; /* atan(+..., +INF) */
      case 1:
        return -zero; /* atan(-..., +INF) */
      case 2:
        return pi + tiny; /* atan(+..., -INF) */
      default:
        return -pi - tiny; /* atan(-..., -INF) */
    }
  }
  /* when y is INF */
  if (iy === 0x7ff00000) {
    return hy < 0 ? -pi_o_2 - tiny : pi_o_2 + tiny;
  }

  /* compute y/x */
  const k = (iy - ix) >> 20;
  let z: number;
  if (k > 60) {
    z = pi_o_2 + 0.5 * pi_lo; /* |y/x| > 2**60 */
  } else if (hx < 0 && k < -60) {
    z = 0.0; /* |y|/x < -2**60 */
  } else {
    z = fdlibmAtan(Math.abs(y / x)); /* safe to do y/x */
  }
  switch (m) {
    case 0:
      return z; /* atan(+,+) */
    case 1:
      // Sign flip through the bit pattern, not `-z`: fdlibm does it this way so that a
      // zero result comes back as -0.0 rather than +0.0.
      return setHighWord(z, (getHighWord(z) ^ 0x80000000) | 0); /* atan(-,+) */
    case 2:
      return pi - (z - pi_lo); /* atan(+,-) */
    default:
      return z - pi_lo - pi; /* atan(-,-) */
  }
}
