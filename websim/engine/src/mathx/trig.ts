/**
 * fdlibm `sin` / `cos`, ported to TypeScript, including the full Payne–Hanek argument
 * reduction so the routines are correct over the whole double range rather than only over
 * the small arguments this model happens to produce today.
 *
 * <p><b>Provenance.</b> Four Sun/FreeBSD fdlibm files, ported verbatim:
 * <ul>
 *   <li>`s_sin.c` / `s_cos.c` — the top-level quadrant dispatch ({@link fdlibmSin},
 *       {@link fdlibmCos});</li>
 *   <li>`k_sin.c` / `k_cos.c` — the polynomial kernels on |x| &le; pi/4
 *       (`kernelSin`, `kernelCos`);</li>
 *   <li>`e_rem_pio2.c` — reduction of x modulo pi/2 into a double-double remainder
 *       (`remPio2`), with its `npio2_hw` table;</li>
 *   <li>`k_rem_pio2.c` — the multi-precision fallback for |x| &gt; 2^19 * pi/2
 *       (`kernelRemPio2`), with the 66-word `two_over_pi` table.</li>
 * </ul>
 * These are the routines `java.lang.StrictMath.sin` and `StrictMath.cos` are specified
 * against.
 *
 * <p><b>Call site.</b> GeographicLib-Java 1.49 — the library the certified model uses for
 * every geodesic solve — calls `java.lang.Math` (never `StrictMath`) 12 times for `sin`
 * and 13 times for `cos` (DR-S1 §3.2). The geodesic `Direct` solve that moves every agent
 * every tick therefore rides on these two functions. DR-S1 established that bit-identity
 * with the *archived* Java is unattainable in a browser at any budget, because HotSpot
 * substitutes x86-64 LIBM intrinsics for `Math.sin`/`Math.cos` that are neither fdlibm nor
 * specified; the job of this module is the reachable one — **JS &equiv; JS across engines**
 * (DR-S1 §5.4), since ECMA-262 leaves `Math.sin`/`Math.cos` implementation-approximated.
 *
 * <p><b>Domain note, measured not assumed.</b> GeographicLib's `sincosd` reduces its
 * argument to [-45&deg;, +45&deg;] before calling `Math.sin`, i.e. |x| &le; pi/4, which
 * takes the kernel path with no reduction at all; its series evaluations reach a few
 * radians, i.e. the "medium size" path. The `kernelRemPio2` path below is exercised only
 * by arguments above 2^19*(pi/2) &asymp; 8.2e5, which this model never produces. It is
 * ported and fixture-tested anyway so that `mathx` is a general replacement for
 * `Math.sin`/`Math.cos` and no future call site has to check its argument range first.
 */

import { getHighWord, getLowWord, insertWords, scalbn } from "./bits.js";

/* eslint-disable @typescript-eslint/naming-convention -- names mirror the fdlibm sources */

// --------------------------------------------------------------- k_sin.c ---
const half = 5.0e-01;
const S1 = -1.66666666666666324348e-01; /* 0xBFC55555 55555549 */
const S2 = 8.33333333332248946124e-03; /* 0x3F811111 1110F8A6 */
const S3 = -1.98412698298579493134e-04; /* 0xBF2A01A0 19C161D5 */
const S4 = 2.75573137070700676789e-06; /* 0x3EC71DE3 57B1FE7D */
const S5 = -2.50507602534068634195e-08; /* 0xBE5AE5E6 8A2B9CEB */
const S6 = 1.58969099521155010221e-10; /* 0x3DE5D93A 5ACFD57C */

// --------------------------------------------------------------- k_cos.c ---
const one = 1.0;
const C1 = 4.16666666666666019037e-02; /* 0x3FA55555 5555554C */
const C2 = -1.38888888888741095749e-03; /* 0xBF56C16C 16C15177 */
const C3 = 2.48015872894767294178e-05; /* 0x3EFA01A0 19CB1590 */
const C4 = -2.75573143513906633035e-07; /* 0xBE927E4F 809C52AD */
const C5 = 2.08757232129817482790e-09; /* 0x3E21EE9E BDB4B1C4 */
const C6 = -1.13596475577881948265e-11; /* 0xBDA8FAE9 BE8838D4 */

// ----------------------------------------------------------- e_rem_pio2.c ---
const zero = 0.0;
const two24 = 1.67772160000000000000e07; /* 0x41700000 00000000 */
const invpio2 = 6.36619772367581382433e-01; /* 0x3FE45F30 6DC9C883 */
const pio2_1 = 1.57079632673412561417e0; /* 0x3FF921FB 54400000 */
const pio2_1t = 6.07710050650619224932e-11; /* 0x3DD0B461 1A626331 */
const pio2_2 = 6.07710050630396597660e-11; /* 0x3DD0B461 1A600000 */
const pio2_2t = 2.02226624879595063154e-21; /* 0x3BA3198A 2E037073 */
const pio2_3 = 2.02226624871116645580e-21; /* 0x3BA3198A 2E000000 */
const pio2_3t = 8.47842766036889956997e-32; /* 0x397B839A 252049C1 */

/** High words of n*(pi/2) for n = 1..32, used to detect cancellation. */
const npio2_hw = [
  0x3ff921fb, 0x400921fb, 0x4012d97c, 0x401921fb, 0x401f6a7a, 0x4022d97c, 0x4025fdbb,
  0x402921fb, 0x402c463a, 0x402f6a7a, 0x4031475c, 0x4032d97c, 0x40346b9c, 0x4035fdbb,
  0x40378fdb, 0x403921fb, 0x403ab41b, 0x403c463a, 0x403dd85a, 0x403f6a7a, 0x40407e4c,
  0x4041475c, 0x4042106c, 0x4042d97c, 0x4043a28c, 0x40446b9c, 0x404534ac, 0x4045fdbb,
  0x4046c6cb, 0x40478fdb, 0x404858eb, 0x404921fb,
] as const;

// ----------------------------------------------------------- k_rem_pio2.c ---
/** 2/pi in 24-bit chunks (the `two_over_pi` table). */
const two_over_pi = [
  0xa2f983, 0x6e4e44, 0x1529fc, 0x2757d1, 0xf534dd, 0xc0db62, 0x95993c, 0x439041,
  0xfe5163, 0xabdebb, 0xc561b7, 0x246e3a, 0x424dd2, 0xe00649, 0x2eea09, 0xd1921c,
  0xfe1deb, 0x1cb129, 0xa73ee8, 0x8235f5, 0x2ebb44, 0x84e99c, 0x7026b4, 0x5f7e41,
  0x3991d6, 0x398353, 0x39f49c, 0x845f8b, 0xbdf928, 0x3b1ff8, 0x97ffde, 0x05980f,
  0xef2f11, 0x8b5a0a, 0x6d1f6d, 0x367ecf, 0x27cb09, 0xb74f46, 0x3f669e, 0x5fea2d,
  0x7527ba, 0xc7ebe5, 0xf17b3d, 0x0739f7, 0x8a5292, 0xea6bfb, 0x5fb11f, 0x8d5d08,
  0x560330, 0x46fc7b, 0x6babf0, 0xcfbc20, 0x9af436, 0x1da9e3, 0x91615e, 0xe61b08,
  0x659985, 0x5f14a0, 0x68408d, 0xffd880, 0x4d7327, 0x310606, 0x1556ca, 0x73a8c9,
  0x60e27b, 0xc08c6b,
] as const;

/** pi/2 in 24-bit chunks. */
const PIo2 = [
  1.57079625129699707031e0, /* 0x3FF921FB 40000000 */
  7.54978941586159635335e-08, /* 0x3E74442D 00000000 */
  5.39030252995776476554e-15, /* 0x3CF84698 80000000 */
  3.28200341580791294123e-22, /* 0x3B78CC51 60000000 */
  1.27065575308067607349e-29, /* 0x39F01B83 80000000 */
  1.22933308981111328932e-36, /* 0x387A2520 40000000 */
  2.73370053816464559624e-44, /* 0x36E38222 80000000 */
  2.16741683877804819444e-51, /* 0x3569F31D 00000000 */
] as const;

const init_jk = [2, 3, 4, 6] as const;
const twon24 = 5.96046447753906250000e-08; /* 0x3E700000 00000000 */

/* eslint-enable @typescript-eslint/naming-convention */

/** Documented raw bit patterns of the reduction constants; asserted by the test suite. */
export const FDLIBM_TRIG_CONSTANT_BITS: ReadonlyArray<readonly [string, number, string]> = [
  ["S1", S1, "bfc5555555555549"],
  ["S6", S6, "3de5d93a5acfd57c"],
  ["C1", C1, "3fa555555555554c"],
  ["C6", C6, "bda8fae9be8838d4"],
  ["invpio2", invpio2, "3fe45f306dc9c883"],
  ["pio2_1", pio2_1, "3ff921fb54400000"],
  ["pio2_1t", pio2_1t, "3dd0b4611a626331"],
  ["pio2_2", pio2_2, "3dd0b4611a600000"],
  ["pio2_2t", pio2_2t, "3ba3198a2e037073"],
  ["pio2_3", pio2_3, "3ba3198a2e000000"],
  ["pio2_3t", pio2_3t, "397b839a252049c1"],
  ["PIo2[0]", PIo2[0], "3ff921fb40000000"],
  ["PIo2[7]", PIo2[7], "3569f31d00000000"],
];

/**
 * fdlibm `__kernel_sin(x, y, iy)` — sin on |x| &le; pi/4.
 *
 * @param x the reduced argument
 * @param y the tail of the reduction (0 when the caller did not reduce)
 * @param iy 0 iff `y` is exactly zero
 */
function kernelSin(x: number, y: number, iy: number): number {
  const ix = getHighWord(x) & 0x7fffffff;
  if (ix < 0x3e400000) {
    /* |x| < 2**-27 */
    if (Math.trunc(x) === 0) {
      return x;
    }
  }
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (iy === 0) {
    return x + v * (S1 + z * r);
  }
  return x - (z * (half * y - v * r) - y - v * S1);
}

/** fdlibm `__kernel_cos(x, y)` — cos on |x| &le; pi/4. */
function kernelCos(x: number, y: number): number {
  const ix = getHighWord(x) & 0x7fffffff;
  if (ix < 0x3e400000) {
    /* if x < 2**-27 */
    if (Math.trunc(x) === 0) {
      return one;
    }
  }
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3fd33333) {
    /* if |x| < 0.3 */
    return one - (0.5 * z - (z * r - x * y));
  }
  let qx: number;
  if (ix > 0x3fe90000) {
    /* x > 0.78125 */
    qx = 0.28125;
  } else {
    qx = insertWords(ix - 0x00200000, 0); /* x/4 */
  }
  const hz = 0.5 * z - qx;
  const a = one - qx;
  return a - (hz - (z * r - x * y));
}

/**
 * fdlibm `__kernel_rem_pio2(x, y, e0, nx, prec, ipio2)` with `prec = 2` (double).
 *
 * The multi-precision reduction: x is supplied pre-split into 24-bit chunks, multiplied by
 * the 2/pi table, and the fractional part reassembled. `y` is written in place.
 */
function kernelRemPio2(x: readonly number[], y: number[], e0: number, nx: number): number {
  const prec = 2;
  const iq = new Int32Array(20);
  const f = new Float64Array(20);
  const fq = new Float64Array(20);
  const q = new Float64Array(20);

  let z: number;
  let fw: number;
  let i: number;
  let j: number;
  let k: number;
  let carry: number;
  let n: number;
  let ih: number;

  /* initialize jk */
  const jk = init_jk[prec]!;
  const jp = jk;

  /* determine jx, jv, q0; note that 3 > q0 */
  const jx = nx - 1;
  let jv = Math.trunc((e0 - 3) / 24);
  if (jv < 0) {
    jv = 0;
  }
  let q0 = e0 - 24 * (jv + 1);

  /* set up f[0] to f[jx+jk] where f[jx+jk] = ipio2[jv+jk] */
  j = jv - jx;
  const m = jx + jk;
  for (i = 0; i <= m; i++, j++) {
    f[i] = j < 0 ? zero : two_over_pi[j]!;
  }

  /* compute q[0], q[1], ... q[jk] */
  for (i = 0; i <= jk; i++) {
    fw = 0.0;
    for (j = 0; j <= jx; j++) {
      fw += x[j]! * f[jx + i - j]!;
    }
    q[i] = fw;
  }

  let jz = jk;

  // The C source jumps back here with `goto recompute`.
  for (;;) {
    /* distill q[] into iq[] reversingly */
    for (i = 0, j = jz, z = q[jz]!; j > 0; i++, j--) {
      fw = Math.trunc(twon24 * z);
      iq[i] = Math.trunc(z - two24 * fw);
      z = q[j - 1]! + fw;
    }

    /* compute n */
    z = scalbn(z, q0); /* actual value of z */
    z -= 8.0 * Math.floor(z * 0.125); /* trim off integer >= 8 */
    n = Math.trunc(z);
    z -= n;
    ih = 0;
    if (q0 > 0) {
      /* need iq[jz-1] to determine n */
      i = iq[jz - 1]! >> (24 - q0);
      n += i;
      iq[jz - 1] = (iq[jz - 1]! - (i << (24 - q0))) | 0;
      ih = iq[jz - 1]! >> (23 - q0);
    } else if (q0 === 0) {
      ih = iq[jz - 1]! >> 23;
    } else if (z >= 0.5) {
      ih = 2;
    }

    if (ih > 0) {
      /* q > 0.5 */
      n += 1;
      carry = 0;
      for (i = 0; i < jz; i++) {
        /* compute 1-q */
        j = iq[i]!;
        if (carry === 0) {
          if (j !== 0) {
            carry = 1;
            iq[i] = (0x1000000 - j) | 0;
          }
        } else {
          iq[i] = (0xffffff - j) | 0;
        }
      }
      if (q0 > 0) {
        /* rare case: chance is 1 in 12 */
        switch (q0) {
          case 1:
            iq[jz - 1] = iq[jz - 1]! & 0x7fffff;
            break;
          case 2:
            iq[jz - 1] = iq[jz - 1]! & 0x3fffff;
            break;
          default:
            break;
        }
      }
      if (ih === 2) {
        z = one - z;
        if (carry !== 0) {
          z -= scalbn(one, q0);
        }
      }
    }

    /* check if recomputation is needed */
    if (z === zero) {
      j = 0;
      for (i = jz - 1; i >= jk; i--) {
        j |= iq[i]!;
      }
      if (j === 0) {
        /* need recomputation */
        for (k = 1; iq[jk - k] === 0; k++) {
          /* k = number of terms needed */
        }
        for (i = jz + 1; i <= jz + k; i++) {
          /* add q[jz+1] to q[jz+k] */
          f[jx + i] = two_over_pi[jv + i]!;
          fw = 0.0;
          for (j = 0; j <= jx; j++) {
            fw += x[j]! * f[jx + i - j]!;
          }
          q[i] = fw;
        }
        jz += k;
        continue; /* goto recompute */
      }
    }
    break;
  }

  /* chop off zero terms */
  if (z === 0.0) {
    jz -= 1;
    q0 -= 24;
    while (iq[jz] === 0) {
      jz--;
      q0 -= 24;
    }
  } else {
    /* break z into 24-bit chunks if necessary */
    z = scalbn(z, -q0);
    if (z >= two24) {
      fw = Math.trunc(twon24 * z);
      iq[jz] = Math.trunc(z - two24 * fw);
      jz += 1;
      q0 += 24;
      iq[jz] = Math.trunc(fw);
    } else {
      iq[jz] = Math.trunc(z);
    }
  }

  /* convert integer "bit" chunk to floating-point value */
  fw = scalbn(one, q0);
  for (i = jz; i >= 0; i--) {
    q[i] = fw * iq[i]!;
    fw *= twon24;
  }

  /* compute PIo2[0,...,jp] * q[jz,...,0] */
  for (i = jz; i >= 0; i--) {
    fw = 0.0;
    for (k = 0; k <= jp && k <= jz - i; k++) {
      fw += PIo2[k]! * q[i + k]!;
    }
    fq[jz - i] = fw;
  }

  /* compress fq[] into y[] (prec == 2) */
  fw = 0.0;
  for (i = jz; i >= 0; i--) {
    fw += fq[i]!;
  }
  y[0] = ih === 0 ? fw : -fw;
  fw = fq[0]! - fw;
  for (i = 1; i <= jz; i++) {
    fw += fq[i]!;
  }
  y[1] = ih === 0 ? fw : -fw;

  return n & 7;
}

/**
 * fdlibm `__ieee754_rem_pio2(x, y)` — return `n` and write the double-double remainder
 * `x - n*(pi/2)` into `y[0] + y[1]`.
 */
function remPio2(x: number, y: number[]): number {
  let z = 0.0;
  let w: number;
  let t: number;
  let r: number;
  let fn: number;
  let i: number;
  let j: number;
  let n: number;

  const hx = getHighWord(x);
  const ix = hx & 0x7fffffff;

  if (ix <= 0x3fe921fb) {
    /* |x| ~<= pi/4, no need for reduction */
    y[0] = x;
    y[1] = 0;
    return 0;
  }
  if (ix < 0x4002d97c) {
    /* |x| < 3pi/4, special case with n = +-1 */
    if (hx > 0) {
      z = x - pio2_1;
      if (ix !== 0x3ff921fb) {
        /* 33+53 bit pi is good enough */
        y[0] = z - pio2_1t;
        y[1] = z - y[0]! - pio2_1t;
      } else {
        /* near pi/2, use 33+33+53 bit pi */
        z -= pio2_2;
        y[0] = z - pio2_2t;
        y[1] = z - y[0]! - pio2_2t;
      }
      return 1;
    }
    /* negative x */
    z = x + pio2_1;
    if (ix !== 0x3ff921fb) {
      y[0] = z + pio2_1t;
      y[1] = z - y[0]! + pio2_1t;
    } else {
      z += pio2_2;
      y[0] = z + pio2_2t;
      y[1] = z - y[0]! + pio2_2t;
    }
    return -1;
  }
  if (ix <= 0x413921fb) {
    /* |x| ~<= 2^19*(pi/2), medium size */
    t = Math.abs(x);
    n = Math.trunc(t * invpio2 + half);
    fn = n;
    r = t - fn * pio2_1;
    w = fn * pio2_1t; /* 1st round, good to 85 bits */
    if (n < 32 && ix !== npio2_hw[n - 1]) {
      y[0] = r - w; /* quick check: no cancellation */
    } else {
      j = ix >> 20;
      y[0] = r - w;
      i = j - ((getHighWord(y[0]!) >> 20) & 0x7ff);
      if (i > 16) {
        /* 2nd iteration needed, good to 118 bits */
        t = r;
        w = fn * pio2_2;
        r = t - w;
        w = fn * pio2_2t - (t - r - w);
        y[0] = r - w;
        i = j - ((getHighWord(y[0]!) >> 20) & 0x7ff);
        if (i > 49) {
          /* 3rd iteration needed, 151 bits accuracy */
          t = r; /* will cover all possible cases */
          w = fn * pio2_3;
          r = t - w;
          w = fn * pio2_3t - (t - r - w);
          y[0] = r - w;
        }
      }
    }
    y[1] = r - y[0]! - w;
    if (hx < 0) {
      y[0] = -y[0]!;
      y[1] = -y[1]!;
      return -n;
    }
    return n;
  }

  /* all other (large) arguments */
  if (ix >= 0x7ff00000) {
    /* x is inf or NaN */
    y[0] = x - x;
    y[1] = y[0];
    return 0;
  }
  /* set z = scalbn(|x|, ilogb(x) - 23) */
  const low = getLowWord(x);
  const e0 = (ix >> 20) - 1046; /* e0 = ilogb(z) - 23 */
  z = insertWords((ix - (e0 << 20)) | 0, low);
  const tx: number[] = [0, 0, 0];
  for (i = 0; i < 2; i++) {
    tx[i] = Math.trunc(z);
    z = (z - tx[i]!) * two24;
  }
  tx[2] = z;
  let nx = 3;
  while (tx[nx - 1] === zero) {
    nx--; /* skip zero term */
  }
  n = kernelRemPio2(tx, y, e0, nx);
  if (hx < 0) {
    y[0] = -y[0]!;
    y[1] = -y[1]!;
    return -n;
  }
  return n;
}

/** Bit-exact equivalent of Java's `StrictMath.sin(x)` (fdlibm `s_sin.c`). */
export function fdlibmSin(x: number): number {
  const y: number[] = [0, 0];
  const ix = getHighWord(x) & 0x7fffffff;

  /* |x| ~< pi/4 */
  if (ix <= 0x3fe921fb) {
    return kernelSin(x, 0.0, 0);
  }
  /* sin(Inf or NaN) is NaN */
  if (ix >= 0x7ff00000) {
    return x - x;
  }
  /* argument reduction needed */
  const n = remPio2(x, y);
  switch (n & 3) {
    case 0:
      return kernelSin(y[0]!, y[1]!, 1);
    case 1:
      return kernelCos(y[0]!, y[1]!);
    case 2:
      return -kernelSin(y[0]!, y[1]!, 1);
    default:
      return -kernelCos(y[0]!, y[1]!);
  }
}

/** Bit-exact equivalent of Java's `StrictMath.cos(x)` (fdlibm `s_cos.c`). */
export function fdlibmCos(x: number): number {
  const y: number[] = [0, 0];
  const ix = getHighWord(x) & 0x7fffffff;

  /* |x| ~< pi/4 */
  if (ix <= 0x3fe921fb) {
    return kernelCos(x, 0.0);
  }
  /* cos(Inf or NaN) is NaN */
  if (ix >= 0x7ff00000) {
    return x - x;
  }
  /* argument reduction needed */
  const n = remPio2(x, y);
  switch (n & 3) {
    case 0:
      return kernelCos(y[0]!, y[1]!);
    case 1:
      return -kernelSin(y[0]!, y[1]!, 1);
    case 2:
      return -kernelCos(y[0]!, y[1]!);
    default:
      return kernelSin(y[0]!, y[1]!, 1);
  }
}
