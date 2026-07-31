/**
 * WP3 acceptance: `javaFormatFixed` reproduces `String.format(Locale.US, "%.Nf", d)`
 * bit-for-bit — every character, over the full tie table, for N = 0..6.
 *
 * <p>Three things are proved here, not one:
 * <ol>
 *   <li><b>Parity.</b> Every fixture row matches Java's output exactly.</li>
 *   <li><b>Non-vacuity.</b> The fixture contains rows where Java disagrees with rounding
 *       the exact binary double — i.e. rows `toFixed` gets wrong. Without those the parity
 *       assertion would be satisfiable by `toFixed`, and the whole formatter would be
 *       pointless. The count is frozen, and `toFixed` is separately shown to fail them.</li>
 *   <li><b>Sign discipline.</b> Negative zero and negatives that round to zero keep their
 *       minus sign, which is where a naive `value < 0` check silently drops it.</li>
 * </ol>
 */

import { describe, expect, it } from "vitest";

import { hexToDouble } from "../../src/mathx/bits.js";
import {
  javaFormatFixed,
  javaFormatFixedOrEmpty,
  FIXED_FORMAT_MAX_MAGNITUDE,
} from "../../src/mathx/format.js";
import { formatFixture } from "./fixtures.js";

/** Fixture rows the formatter accepts, i.e. everything inside its documented domain. */
const inDomain = formatFixture.cases.filter((c) => {
  const v = hexToDouble(c.bits);
  return !Number.isFinite(v) || Math.abs(v) < FIXED_FORMAT_MAX_MAGNITUDE;
});

describe("javaFormatFixed vs java.util.Formatter", () => {
  it("matches every in-domain fixture row for every precision 0..6", () => {
    expect(formatFixture.precisions).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(formatFixture.cases.length).toBe(formatFixture.nCases);

    const failures: string[] = [];
    for (const c of inDomain) {
      const value = hexToDouble(c.bits);
      for (let p = 0; p <= 6; p++) {
        const actual = javaFormatFixed(value, p);
        const expected = c.formatted[p]!;
        if (actual !== expected) {
          failures.push(`%.${p}f of 0x${c.bits} (${value}) = '${actual}', Java '${expected}'`);
          if (failures.length >= 10) {
            break;
          }
        }
      }
      if (failures.length >= 10) {
        break;
      }
    }
    expect(failures).toEqual([]);
  });

  it("covers a non-trivial table, almost all of it in domain", () => {
    expect(formatFixture.nCases).toBeGreaterThan(4000);
    // The out-of-domain rows are the deliberate 2^53+ probes, not the bulk of the table.
    expect(formatFixture.nCases - inDomain.length).toBeLessThan(20);
  });
});

describe("the 2^53 guard is placed where the measured divergence actually is", () => {
  /**
   * The guard's justification is empirical, so the empirical claim is asserted, not
   * asserted-about. This walks the **whole** fixture — including the rows the formatter
   * refuses — computes what the shortest-decimal algorithm would have produced, and pins
   * down exactly which values JDK 17's `FloatingDecimal` disagrees with.
   */
  function unguardedFormat(value: number, precision: number): string {
    const negative = value < 0 || Object.is(value, -0);
    const text = Math.abs(value).toString();
    let mantissa = text;
    let exponent = 0;
    const e = text.indexOf("e");
    if (e >= 0) {
      mantissa = text.slice(0, e);
      exponent = Number.parseInt(text.slice(e + 1), 10);
    }
    let fractionLength = 0;
    const dot = mantissa.indexOf(".");
    if (dot >= 0) {
      fractionLength = mantissa.length - dot - 1;
      mantissa = mantissa.slice(0, dot) + mantissa.slice(dot + 1);
    }
    const scale = fractionLength - exponent;
    const unscaled = BigInt(mantissa);
    let rounded: bigint;
    if (scale <= precision) {
      rounded = unscaled * 10n ** BigInt(precision - scale);
    } else {
      const divisor = 10n ** BigInt(scale - precision);
      const q = unscaled / divisor;
      const r = unscaled % divisor;
      rounded = r * 2n >= divisor ? q + 1n : q;
    }
    const padded = rounded.toString().padStart(precision + 1, "0");
    const cut = padded.length - precision;
    const frac = precision > 0 ? `.${padded.slice(cut)}` : "";
    return `${negative ? "-" : ""}${padded.slice(0, cut)}${frac}`;
  }

  it("only ±1e23 diverges across the entire 4,166-value × 7-precision table", () => {
    const divergent = new Set<string>();
    for (const c of formatFixture.cases) {
      const value = hexToDouble(c.bits);
      if (!Number.isFinite(value)) {
        continue;
      }
      for (let p = 0; p <= 6; p++) {
        if (unguardedFormat(value, p) !== c.formatted[p]) {
          divergent.add(c.bits);
        }
      }
    }
    // 0x44b52d02c7e14af6 = 1e23, 0xc4b52d02c7e14af6 = -1e23. JDK-4511638: JDK 17's
    // FloatingDecimal emits 9.999999999999999E22 rather than the shortest 1.0E23.
    expect([...divergent].sort()).toEqual(["44b52d02c7e14af6", "c4b52d02c7e14af6"]);
    for (const bits of divergent) {
      expect(Math.abs(hexToDouble(bits))).toBeGreaterThanOrEqual(FIXED_FORMAT_MAX_MAGNITUDE);
    }
  });

  it("refuses the whole out-of-domain region rather than guessing", () => {
    expect(() => javaFormatFixed(1e23, 2)).toThrow(/2\^53/u);
    expect(() => javaFormatFixed(-1e23, 0)).toThrow(RangeError);
    expect(() => javaFormatFixed(FIXED_FORMAT_MAX_MAGNITUDE, 0)).toThrow(RangeError);
    // ...and accepts everything just below it, including the largest value the model's
    // own columns could plausibly reach (total exposure over 6,842 agents ≈ 2e9).
    expect(javaFormatFixed(FIXED_FORMAT_MAX_MAGNITUDE - 2, 2)).toBe("9007199254740990.00");
    expect(javaFormatFixed(2.1e9, 4)).toBe("2100000000.0000");
    // Non-finite values are unaffected by the magnitude guard.
    expect(javaFormatFixed(Number.POSITIVE_INFINITY, 2)).toBe("Infinity");
  });
});

describe("the fixture is non-vacuous — it contains rows toFixed gets wrong", () => {
  it("Java disagrees with exact-binary rounding on a frozen number of rows", () => {
    // `exactBinary` is `new BigDecimal(double).setScale(N, HALF_UP)` — rounding the exact
    // binary value, which is precisely what `Number#toFixed` does. If this ever reached
    // zero the parity assertion above would stop discriminating.
    expect(formatFixture.nCasesWhereToFixedWouldDiffer).toBe(23);

    const counted = formatFixture.cases.filter((c) =>
      c.formatted.some((s, i) => s !== c.exactBinary[i]),
    ).length;
    expect(counted).toBe(formatFixture.nCasesWhereToFixedWouldDiffer);
  });

  it("toFixed actually fails those rows, and javaFormatFixed passes them", () => {
    const divergent = inDomain.filter((c) =>
      c.formatted.some((s, i) => s !== c.exactBinary[i]),
    );
    expect(divergent.length).toBeGreaterThan(0);

    let toFixedFailures = 0;
    for (const c of divergent) {
      const value = hexToDouble(c.bits);
      for (let p = 0; p <= 6; p++) {
        expect(javaFormatFixed(value, p)).toBe(c.formatted[p]);
        if (Number.isFinite(value)) {
          // Deliberate use of the banned API, inside the test that proves why it is banned.
          const viaToFixed = value.toFixed(p);
          if (viaToFixed !== c.formatted[p]) {
            toFixedFailures++;
          }
        }
      }
    }
    expect(toFixedFailures).toBeGreaterThan(0);
  });

  it("the documented headline cases behave as PORT_MAP §5.5 states", () => {
    expect(javaFormatFixed(0.615, 2)).toBe("0.62");
    expect((0.615).toFixed(2)).toBe("0.61"); // the disqualifying counter-example
    expect(javaFormatFixed(1.005, 2)).toBe("1.01");
    expect((1.005).toFixed(2)).toBe("1.00");
    expect(javaFormatFixed(2.675, 2)).toBe("2.68");
    expect((2.675).toFixed(2)).toBe("2.67");
    // Not every "…5" literal discriminates: 8.835's double sits *above* the tie, so both
    // routes agree. Only the ones whose double falls below it separate the two algorithms.
    expect(javaFormatFixed(8.835, 2)).toBe("8.84");
    expect((8.835).toFixed(2)).toBe("8.84");
  });
});

describe("sign, zero and non-finite handling", () => {
  it("keeps the sign of negative zero", () => {
    expect(javaFormatFixed(-0, 2)).toBe("-0.00");
    expect(javaFormatFixed(0, 2)).toBe("0.00");
  });

  it("keeps the sign of negatives that round to zero", () => {
    expect(javaFormatFixed(-1e-9, 2)).toBe("-0.00");
    expect(javaFormatFixed(-0.0004, 3)).toBe("-0.000");
  });

  it("formats non-finite values the way Java does", () => {
    expect(javaFormatFixed(Number.NaN, 2)).toBe("NaN");
    expect(javaFormatFixed(Number.POSITIVE_INFINITY, 2)).toBe("Infinity");
    expect(javaFormatFixed(Number.NEGATIVE_INFINITY, 2)).toBe("-Infinity");
  });

  it("emits no decimal point at precision 0", () => {
    expect(javaFormatFixed(2.5, 0)).toBe("3"); // HALF_UP, not half-even
    expect(javaFormatFixed(3.5, 0)).toBe("4");
    expect(javaFormatFixed(-2.5, 0)).toBe("-3");
    expect(javaFormatFixed(0, 0)).toBe("0");
  });

  it("rejects an invalid precision rather than guessing", () => {
    expect(() => javaFormatFixed(1, -1)).toThrow(RangeError);
    expect(() => javaFormatFixed(1, 1.5)).toThrow(RangeError);
  });
});

describe("javaFormatFixedOrEmpty (PORT_MAP §5.1 empty-vs-zero)", () => {
  it("returns the empty string for absent values, never a fabricated zero", () => {
    expect(javaFormatFixedOrEmpty(null, 2)).toBe("");
    expect(javaFormatFixedOrEmpty(undefined, 2)).toBe("");
    expect(javaFormatFixedOrEmpty(Number.NaN, 2)).toBe("");
    expect(javaFormatFixedOrEmpty(0, 2)).toBe("0.00");
  });
});
