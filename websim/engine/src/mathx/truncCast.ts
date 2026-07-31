/**
 * Java primitive narrowing conversions — `(long) d`, `(int) d`, `(int) l`.
 *
 * <p>Three different behaviours hide behind one C-like cast syntax, and mixing them up is
 * the classic source of silent off-by-2^32 errors in a port:
 *
 * <table>
 *   <tr><th>Java</th><th>JLS</th><th>Behaviour</th><th>This module</th></tr>
 *   <tr><td>`(long) aDouble`</td><td>5.1.3</td><td>truncate toward zero, then
 *       <b>saturate</b> at ±Long.MAX/MIN; NaN → 0</td><td>{@link doubleToLong}</td></tr>
 *   <tr><td>`(int) aDouble`</td><td>5.1.3</td><td>truncate toward zero, then
 *       <b>saturate</b> at ±Integer.MAX/MIN; NaN → 0</td><td>{@link doubleToInt}</td></tr>
 *   <tr><td>`(int) aLong`</td><td>5.1.3</td><td>keep the low 32 bits — <b>wraps</b>,
 *       never saturates</td><td>{@link longToInt}</td></tr>
 * </table>
 *
 * `Math.trunc` alone is a substitute for none of them: it neither saturates nor wraps, and
 * it returns `NaN` for `NaN`.
 *
 * <p><b>Call sites in the certified model.</b>
 * <ul>
 *   <li>`OutcomeLogger` writes every tick column through a `(long)` cast — PORT_MAP §5.1,
 *       "Tick columns `(long)`-cast = <b>truncation</b>, not rounding".</li>
 *   <li>`GisAgent.java:371` and `SmokeField.java:140` compute the smoke hour index as
 *       `(int) Math.floor(tick * minutesPerTick / 60.0)`.</li>
 *   <li>`ContextCreator.java:567` computes the triage reserve as
 *       `(int) Math.floor(capacity.intValue() * triageReserveFraction)`.</li>
 *   <li>colt's `Uniform.nextIntFromTo` ends in a `(long)`→`(int)` <b>wrap</b>, which is why
 *       {@link longToInt} exists separately (see `ColtMT19937.nextIntFromTo`).</li>
 * </ul>
 */

/** `Long.MAX_VALUE`. */
export const LONG_MAX = 9223372036854775807n;
/** `Long.MIN_VALUE`. */
export const LONG_MIN = -9223372036854775808n;
/** `Integer.MAX_VALUE`. */
export const INT_MAX = 2147483647;
/** `Integer.MIN_VALUE`. */
export const INT_MIN = -2147483648;

/**
 * Java `(long) d` — truncate toward zero, saturating at the `long` bounds.
 *
 * NaN → `0n`; `+Infinity` and anything ≥ 2^63 → `Long.MAX_VALUE`; `-Infinity` and anything
 * ≤ −2^63 → `Long.MIN_VALUE`.
 */
export function doubleToLong(d: number): bigint {
  if (Number.isNaN(d)) {
    return 0n;
  }
  const t = Math.trunc(d);
  // 2^63 is not representable as a double bound by `<=`, so compare against the exact
  // powers of two rather than against LONG_MAX (which rounds up to 2^63 as a double).
  if (t >= 9223372036854775808) {
    return LONG_MAX;
  }
  if (t <= -9223372036854775808) {
    return LONG_MIN;
  }
  return BigInt(t);
}

/**
 * Java `(int) d` — truncate toward zero, **saturating** at the `int` bounds.
 *
 * This is emphatically not a 32-bit wrap: `(int) 3e9` is `2147483647` in Java, whereas
 * JavaScript's `3e9 | 0` is `-1294967296`.
 */
export function doubleToInt(d: number): number {
  if (Number.isNaN(d)) {
    return 0;
  }
  const t = Math.trunc(d);
  if (t >= INT_MAX) {
    return INT_MAX;
  }
  if (t <= INT_MIN) {
    return INT_MIN;
  }
  // `| 0` is a no-op on the value (t is already in int range) but normalises the negative
  // zero `Math.trunc` returns for -0.5: Java's `int` has no -0, and a stray -0 escaping
  // into an output column would print as "-0".
  return t | 0;
}

/**
 * Java `(int) l` — narrowing a `long` to an `int` keeps the low 32 bits and reinterprets
 * them as signed. This one **wraps**.
 */
export function longToInt(l: bigint): number {
  return Number(BigInt.asIntN(32, l));
}

/** Java `(long) i` — widening; total and exact, present for symmetry at call sites. */
export function intToLong(i: number): bigint {
  return BigInt(i | 0);
}

/**
 * Java 64-bit signed `long` arithmetic wrap, applied to an expression already evaluated in
 * `bigint`. PORT_MAP §1.8's seed derivations (`seed*1000003 + 17`,
 * `runSeed*2654435761 + index*104729`) overflow for large seeds and the model keeps the
 * wrapped value, so the wrap is part of the contract rather than a defect.
 */
export function wrapLong(v: bigint): bigint {
  return BigInt.asIntN(64, v);
}
