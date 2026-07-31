/**
 * Java `String.format(Locale.US, "%.Nf", double)` emulator.
 *
 * <p><b>Why this exists (PORT_MAP §5.5, plan §1.2 stack row, plan Q6).</b> Every numeric
 * cell in `agents.csv`, `shelters.csv` and `simulation.json` is written with `%.Nf`, and
 * the archive is compared byte-for-byte. JavaScript's `toFixed` is **not** a substitute and
 * is banned from engine source by `engine/test/mathx/no-tofixed.test.ts`.
 *
 * <p><b>The two failure modes `toFixed` has, and what Java actually does.</b>
 *
 * <ol>
 *   <li><b>Ties.</b> `toFixed` rounds the <i>exact binary value</i> of the double.
 *       Java rounds the double's <i>shortest round-trip decimal</i>, HALF_UP. The double
 *       nearest 0.615 is 0.6149999999999999911182158029987476766109466552734375, so
 *       `(0.615).toFixed(2) === "0.61"` while `String.format("%.2f", 0.615)` is
 *       <code>"0.62"</code>. Same for 1.005 → `"1.00"` vs <code>"1.01"</code>.</li>
 *   <li><b>Large magnitudes.</b> `(1e23).toFixed(2)` is `"99999999999999991611392.00"` —
 *       the exact value of the double, digit for digit. Java prints
 *       <code>"99999999999999990000000.00"</code>: not the exact value either, but the
 *       digits of whatever decimal `FloatingDecimal` chose, zero-filled. Neither is the
 *       "true" answer; the output above 2^53 is a property of the formatter, which is why
 *       this module refuses that region outright (see the boundary note below).</li>
 * </ol>
 *
 * <p><b>Algorithm, mirroring `java.util.Formatter`.</b> `Formatter$FormatSpecifier.print(double)`
 * builds a `FormattedFloatingDecimal` in `DECIMAL_FLOAT` form, whose digits come from
 * `FloatingDecimal.getBinaryToASCIIConverter(d)` — the shortest decimal that round-trips to
 * `d` — and then calls `applyPrecision`, which rounds that decimal digit string HALF_UP to
 * N places. So:
 *
 * <ol>
 *   <li>take the shortest round-trip decimal of |d| (JavaScript's `Number#toString` is
 *       specified, in ECMA-262 §6.1.6.1.20, to produce exactly that — the fewest digits
 *       that still round-trip);</li>
 *   <li>round it to N places with <b>exact integer arithmetic on `BigInt`</b>, half away
 *       from zero;</li>
 *   <li>re-assemble, restoring the sign — including for negative zero and for negatives
 *       that round to zero, which Java prints as <code>"-0.00"</code>.</li>
 * </ol>
 *
 * Step 2 never touches a float, so the rounding decision cannot be perturbed by the very
 * binary representation the format is trying to escape.
 *
 * <p><b>Measured boundary, and the guard that contains it.</b> JDK 17 predates JDK-19's
 * `DoubleToDecimal` rewrite, so its `FloatingDecimal` still carries JDK-4511638: for some
 * inputs its decimal-exponent estimate is one off and it emits a *non-shortest* decimal
 * that still round-trips. Measured over the fixture (4,166 values × 7 precisions = 29,162
 * comparisons against real `String.format` output), this port matches Java on **all but two
 * rows: ±1e23**, where JDK 17 prints `9.999999999999999E22`-derived digits and the shortest
 * decimal is `1e23`. Both round-trip to the same double — the double's ulp there is
 * 1.7e7, so every digit below the eighth is a property of *which* decimal representative
 * the formatter picked, not of the number.
 *
 * <p>That regime is fenced off rather than guessed at. {@link javaFormatFixed} **throws**
 * for |value| ≥ 2^53 — the magnitude at which doubles stop representing consecutive
 * integers and therefore stop determining their own sub-unit decimal digits. Every `%.Nf`
 * column in the output schema (PORT_MAP §5.1–5.3) is at least six orders of magnitude
 * below that bound: the largest is total exposure summed over 6,842 agents, ≈ 2e9. The
 * guard is unreachable in production and turns a would-be silent byte-identity failure at
 * some future call site into a loud one.
 */

/**
 * The magnitude at or above which this formatter refuses to answer: 2^53, where doubles
 * stop representing consecutive integers. See the class comment — above this bound the
 * digits `%.Nf` prints are an artefact of JDK 17 `FloatingDecimal`'s internal choice of
 * decimal representative (JDK-4511638), which is not reproducible from the double alone.
 */
export const FIXED_FORMAT_MAX_MAGNITUDE = 2 ** 53;

/**
 * `String.format(Locale.US, "%.<precision>f", value)`.
 *
 * @param value any double, including ±0, ±Infinity and NaN
 * @param precision digits after the decimal point; 0 emits no decimal point at all
 * @throws RangeError if `precision` is not a non-negative integer, or if
 *   `|value| >= 2^53` (see {@link FIXED_FORMAT_MAX_MAGNITUDE})
 */
export function javaFormatFixed(value: number, precision: number): string {
  if (!Number.isInteger(precision) || precision < 0) {
    throw new RangeError(`precision must be a non-negative integer, got ${precision}`);
  }
  if (Number.isNaN(value)) {
    return "NaN";
  }
  // Java: `boolean neg = Double.compare(value, 0.0) == -1`, which is true for -0.0.
  const negative = value < 0 || Object.is(value, -0);
  if (!Number.isFinite(value)) {
    return negative ? "-Infinity" : "Infinity";
  }

  const magnitude = Math.abs(value);
  if (magnitude >= FIXED_FORMAT_MAX_MAGNITUDE) {
    throw new RangeError(
      `javaFormatFixed cannot guarantee parity with String.format above 2^53 ` +
        `(got ${value}). JDK 17's FloatingDecimal (JDK-4511638) may emit a non-shortest ` +
        `decimal there — e.g. it prints 1e23 as 99999999999999990000000 — and the choice ` +
        `is not recoverable from the double. No column in PORT_MAP §5.1-5.3 reaches this ` +
        `magnitude; if a new one does, port FloatingDecimal.dtoa rather than relaxing this.`,
    );
  }
  const { digits, scale } = shortestDecimal(magnitude);
  const rounded = roundHalfUp(digits, scale, precision);

  const padded = rounded.toString().padStart(precision + 1, "0");
  const cut = padded.length - precision;
  const intPart = padded.slice(0, cut);
  const fracPart = precision > 0 ? `.${padded.slice(cut)}` : "";
  return `${negative ? "-" : ""}${intPart}${fracPart}`;
}

/**
 * Convenience for the `simulation.json` / CSV writers: format with Java's own `%.Nf` and
 * substitute `""` when the value is absent, matching PORT_MAP §5.1's empty-vs-zero rule
 * ("NaN ticks → `""`; never fabricate defaults").
 */
export function javaFormatFixedOrEmpty(
  value: number | null | undefined,
  precision: number,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "";
  }
  return javaFormatFixed(value, precision);
}

/** A finite non-negative double as `digits × 10^-scale`, digits being a decimal string. */
interface Decimal {
  readonly digits: string;
  readonly scale: number;
}

/**
 * The shortest decimal that round-trips to `x` (x ≥ 0, finite), split into an integer digit
 * string and a power-of-ten scale.
 *
 * ECMA-262 §6.1.6.1.20 (`Number::toString`) specifies the result as the representation with
 * the fewest significant digits that still round-trips, which is the same property
 * `Double.toString` / `FloatingDecimal` provide on the Java side. Both plain
 * (`"0.001"`, `"123.5"`) and exponential (`"1e+23"`, `"5e-324"`) forms are parsed.
 */
function shortestDecimal(x: number): Decimal {
  const text = x.toString();
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

  // x = mantissa * 10^(exponent - fractionLength) = digits * 10^-scale
  return { digits: mantissa, scale: fractionLength - exponent };
}

/**
 * Round `digits × 10^-scale` to `precision` decimal places, half away from zero, returning
 * the unscaled integer (i.e. the result × 10^precision). All arithmetic is exact.
 *
 * The caller has already taken the absolute value, so "half away from zero" and Java's
 * `RoundingMode.HALF_UP` coincide.
 */
function roundHalfUp(digits: string, scale: number, precision: number): bigint {
  const unscaled = BigInt(digits);
  if (scale <= precision) {
    return unscaled * 10n ** BigInt(precision - scale);
  }
  const divisor = 10n ** BigInt(scale - precision);
  const quotient = unscaled / divisor;
  const remainder = unscaled % divisor;
  return remainder * 2n >= divisor ? quotient + 1n : quotient;
}
