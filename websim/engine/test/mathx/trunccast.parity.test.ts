/**
 * WP3 acceptance: Java's three narrowing conversions, against fixtures from a real JVM.
 *
 * The suite deliberately proves the *difference* between them, because a port that uses one
 * everywhere still passes every in-range test and fails only at the boundaries the model
 * actually reaches (a 6,842-agent × 455-hour run produces tick counts, and colt's
 * `nextIntFromTo` produces long→int wraps, on every draw).
 */

import { describe, expect, it } from "vitest";

import { hexToDouble } from "../../src/mathx/bits.js";
import {
  doubleToInt,
  doubleToLong,
  intToLong,
  longToInt,
  wrapLong,
  INT_MAX,
  INT_MIN,
  LONG_MAX,
  LONG_MIN,
} from "../../src/mathx/truncCast.js";
import { truncCastFixture } from "./fixtures.js";

describe("Java (long) d and (int) d — saturating", () => {
  it("matches every fixture case", () => {
    expect(truncCastFixture.doubleCases.length).toBeGreaterThan(1000);
    const failures: string[] = [];
    for (const c of truncCastFixture.doubleCases) {
      const d = hexToDouble(c.bits);
      const actualLong = doubleToLong(d).toString();
      if (actualLong !== c.toLong) {
        failures.push(`(long) ${d} = ${actualLong}, Java ${c.toLong}`);
      }
      const actualInt = doubleToInt(d);
      if (actualInt !== c.toInt) {
        failures.push(`(int) ${d} = ${actualInt}, Java ${c.toInt}`);
      }
      if (failures.length >= 10) {
        break;
      }
    }
    expect(failures).toEqual([]);
  });

  it("saturates rather than wrapping — the distinction Math.trunc and |0 both lose", () => {
    expect(doubleToInt(3e9)).toBe(INT_MAX);
    expect(3e9 | 0).toBe(-1294967296); // what a naive port produces
    expect(doubleToInt(-3e9)).toBe(INT_MIN);
    expect(doubleToLong(1e300)).toBe(LONG_MAX);
    expect(doubleToLong(-1e300)).toBe(LONG_MIN);
    expect(doubleToLong(Number.POSITIVE_INFINITY)).toBe(LONG_MAX);
    expect(doubleToLong(Number.NEGATIVE_INFINITY)).toBe(LONG_MIN);
  });

  it("maps NaN to zero, which Math.trunc does not", () => {
    expect(doubleToInt(Number.NaN)).toBe(0);
    expect(doubleToLong(Number.NaN)).toBe(0n);
    expect(Number.isNaN(Math.trunc(Number.NaN))).toBe(true);
  });

  it("truncates toward zero, never rounds (PORT_MAP §5.1 tick columns)", () => {
    expect(doubleToLong(1.9)).toBe(1n);
    expect(doubleToLong(-1.9)).toBe(-1n);
    expect(doubleToInt(-0.5)).toBe(0);
  });
});

describe("Java (int) l — wrapping", () => {
  it("matches every fixture case", () => {
    expect(truncCastFixture.longCases.length).toBeGreaterThan(500);
    const failures: string[] = [];
    for (const c of truncCastFixture.longCases) {
      const actual = longToInt(BigInt(c.value));
      if (actual !== c.toInt) {
        failures.push(`(int) ${c.value}L = ${actual}, Java ${c.toInt}`);
        if (failures.length >= 10) {
          break;
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("wraps rather than saturating — the opposite of the double casts", () => {
    expect(longToInt(4294967296n)).toBe(0);
    expect(longToInt(2147483648n)).toBe(INT_MIN);
    expect(longToInt(LONG_MAX)).toBe(-1);
    expect(longToInt(LONG_MIN)).toBe(0);
    // Same numeric argument, opposite answers: this is the whole point of two functions.
    expect(doubleToInt(2147483648)).toBe(INT_MAX);
    expect(longToInt(2147483648n)).toBe(INT_MIN);
  });
});

describe("long widening and the 64-bit wrap used by the seed derivations", () => {
  it("intToLong is exact over the int range", () => {
    expect(intToLong(INT_MAX)).toBe(2147483647n);
    expect(intToLong(INT_MIN)).toBe(-2147483648n);
  });

  it("wrapLong reproduces Java long overflow", () => {
    expect(wrapLong(LONG_MAX + 1n)).toBe(LONG_MIN);

    // The dumper evaluated PORT_MAP §1.8's two overflowing seed derivations *in Java* and
    // emitted the results at fixed positions 12 and 13 of `longCases`. Comparing against
    // those is a real cross-check of the wrap, not a restatement of our own arithmetic.
    const seed = 9223372036854775783n;
    expect(truncCastFixture.longCases[12]?.value).toBe(
      wrapLong(seed * 1000003n + 17n).toString(),
    );
    expect(truncCastFixture.longCases[13]?.value).toBe(
      wrapLong(seed * 2654435761n + 6841n * 104729n).toString(),
    );
    // Non-vacuity: both expressions really do overflow, so the wrap is load-bearing.
    expect(seed * 1000003n + 17n).toBeGreaterThan(LONG_MAX);
    expect(wrapLong(seed * 1000003n + 17n)).not.toBe(seed * 1000003n + 17n);
  });
});
