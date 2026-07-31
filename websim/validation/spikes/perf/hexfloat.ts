/**
 * Java `Double.toHexString` parser — SPIKE WP2-S3 support.
 *
 * The S2 graph dump carries every coordinate and every edge length twice: as
 * `Double.toString` (round-trip exact) and as `Double.toHexString` (bit-literal).
 * The perf harness parses the decimals (fast path) and audits them against the
 * hex twins, so a silent precision regression in the loader cannot hide behind a
 * green benchmark.
 *
 * Accepted grammar (exactly what `Double.toHexString` emits for finite values):
 *   [-]0x{1|0}.{hexdigits}p{[-]decimal}
 * Zero is emitted as `0x0.0p0`. Subnormals get a `0x0.` lead digit.
 */

/** Parse one `Double.toHexString` token to the exact double it denotes. */
export function parseJavaHexDouble(token: string): number {
  let i = 0;
  let sign = 1;
  if (token.charCodeAt(0) === 45 /* - */) {
    sign = -1;
    i = 1;
  } else if (token.charCodeAt(0) === 43 /* + */) {
    i = 1;
  }
  if (token.charCodeAt(i) !== 48 /* 0 */ || (token.charCodeAt(i + 1) | 32) !== 120 /* x */) {
    throw new Error(`not a Java hex double: ${token}`);
  }
  i += 2;

  const dot = token.indexOf(".", i);
  const p = token.indexOf("p", i);
  if (p < 0) throw new Error(`missing binary exponent: ${token}`);

  const intPart = token.slice(i, dot < 0 ? p : dot);
  const fracPart = dot < 0 ? "" : token.slice(dot + 1, p);
  const exp = Number.parseInt(token.slice(p + 1), 10);

  // Lead digit is 0 or 1 for Double.toHexString; the fraction is <= 13 hex
  // digits (52 bits), so `mantissa` and `16 ** n` are both exact doubles and
  // the division is exact.
  let mantissa = intPart.length === 0 ? 0 : Number.parseInt(intPart, 16);
  if (fracPart.length > 0) {
    mantissa += Number.parseInt(fracPart, 16) / Math.pow(16, fracPart.length);
  }
  return sign * mantissa * Math.pow(2, exp);
}

/** Raw IEEE-754 bit comparison (the only honest "same double" test). */
const cmpBuf = new ArrayBuffer(16);
const cmpF64 = new Float64Array(cmpBuf);
const cmpU32 = new Uint32Array(cmpBuf);

export function sameBits(a: number, b: number): boolean {
  cmpF64[0] = a;
  cmpF64[1] = b;
  return cmpU32[0] === cmpU32[2] && cmpU32[1] === cmpU32[3];
}

/** Signed ULP distance between two finite doubles (0 = bit-identical). */
export function ulpDistance(a: number, b: number): number {
  if (a === b && Object.is(a, b)) return 0;
  cmpF64[0] = a;
  cmpF64[1] = b;
  const ai = orderedInt(cmpU32[0]!, cmpU32[1]!);
  const bi = orderedInt(cmpU32[2]!, cmpU32[3]!);
  const d = ai - bi;
  return d < 0n ? Number(-d) : Number(d);
}

function orderedInt(lo: number, hi: number): bigint {
  const raw = (BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0);
  // Map IEEE-754 bit patterns onto a monotone integer line.
  return (hi & 0x8000_0000) !== 0 ? 0x8000_0000_0000_0000n - raw : raw + 0x8000_0000_0000_0000n;
}
