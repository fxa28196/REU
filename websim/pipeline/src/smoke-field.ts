/**
 * smoke-field.ts — port of `geography.env.SmokeField`'s constructor reducer
 * (PORT_MAP §1.7, plan Q9).
 *
 * The reducer, exactly: filter rows to the named county case-insensitively,
 * key by whole hours since the V13 anchor, accumulate `{sum, count}` across all
 * monitors and POCs IN FILE ORDER, then emit a dense array where
 * `hourly[h] = count > 0 ? (sum / count) * scale : NaN`. Length is
 * `maxHourIndex + 1`, so trailing gap hours inside the window are NaN entries
 * and hours past the last observation simply do not exist.
 *
 * Three properties are contractual and easy to break:
 *   1. **NaN is a gap, never a zero.** A missing hour stays NaN through the whole
 *      pipeline and is encoded as JSON `null`. `concentrationForTick` is what
 *      turns NaN into 0.0 — and it increments `out_of_range_lookups` when it
 *      does, which the badge treats as INVALID. Fabricating a zero here would
 *      erase that signal.
 *   2. **File-order accumulation.** Floating-point addition is not associative;
 *      summing the same monitors in a different order can move the last bits of
 *      an hourly mean. Rows are consumed in the order `CsvLoader` yields them.
 *   3. **The scale multiplies real values only** and is applied ONCE, at
 *      construction (V47). `NaN * scale` is NaN anyway; the explicit branch keeps
 *      the gap semantics visible.
 *
 * `peakHourly()` starts its running maximum at 0, so an all-NaN or all-negative
 * field reports 0 rather than -Infinity. That is Java's behaviour and the
 * manifest's peak is defined by it.
 */

import { javaDoubleThrows, javaParseDouble, type CsvRow } from "./csv-loader.js";

/** V13 anchor: simulation hour 0 = local midnight starting the study window. */
export const SIM_START_LOCAL = "2020-09-07T00:00" as const;

/** The only county whose monitors define the field (`ContextCreator` passes this). */
export const FIELD_COUNTY = "Multnomah" as const;

export interface SmokeFieldResult {
  /** Dense hourly µg/m³ from the anchor; NaN marks a gap. */
  readonly hourly: readonly number[];
  /** `hourly.length` — the slice count the `simulationHours <= slices - 1` bound uses. */
  readonly hours: number;
  /** Max non-NaN value, floored at 0 exactly as Java's `peakHourly()` is. */
  readonly peakHourly: number;
  /** Rows whose county matched and that contributed to a mean. */
  readonly rowsAccumulated: number;
  /** Rows with a matching county but a missing/unparseable field, i.e. skipped. */
  readonly rowsSkipped: number;
  /** Hours inside the window with no observation at all (NaN entries). */
  readonly gapHours: number;
}

/**
 * Whole hours between two local timestamps, matching
 * `ChronoUnit.HOURS.between(start, obs)`: complete units only, truncated toward
 * zero. Computed on a UTC epoch so no host time zone or DST rule can intrude —
 * both operands are `LocalDateTime`s in Java, which carry no zone at all.
 */
export function hoursBetweenLocal(startEpochMs: number, obsEpochMs: number): number {
  const deltaMs = obsEpochMs - startEpochMs;
  return Math.trunc(deltaMs / 3_600_000);
}

/**
 * Parse `yyyy-MM-dd` + `HH:mm` into a UTC epoch, rejecting anything Java's
 * `LocalDate.parse` / `LocalTime.parse` would reject. Returns NaN on a malformed
 * value; the caller must treat that as the exception Java throws.
 *
 * `Time Local` is truncated to its first 5 characters exactly as
 * `SmokeField` does (`HH:mm:ss` inputs are accepted, seconds discarded).
 */
export function parseLocalDateTime(dateStr: string, timeStr: string): number {
  const time = timeStr.length === 5 ? timeStr : timeStr.slice(0, 5);
  const d = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(dateStr);
  const t = /^(\d{2}):(\d{2})$/u.exec(time);
  if (d === null || t === null) {
    return Number.NaN;
  }
  const year = Number(d[1]);
  const month = Number(d[2]);
  const day = Number(d[3]);
  const hour = Number(t[1]);
  const minute = Number(t[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return Number.NaN;
  }
  const ms = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  // Date.UTC rolls 2020-02-31 over to March; LocalDate.parse rejects it.
  const back = new Date(ms);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) {
    return Number.NaN;
  }
  return ms;
}

/** Anchor timestamp as a UTC epoch, for {@link reduceSmokeField}. */
export function anchorEpochMs(anchor: string = SIM_START_LOCAL): number {
  const [datePart, timePart] = anchor.split("T");
  const ms = parseLocalDateTime(datePart ?? "", timePart ?? "");
  if (Number.isNaN(ms)) {
    throw new Error(`smoke anchor '${anchor}' is not a yyyy-MM-ddTHH:mm local timestamp`);
  }
  return ms;
}

/**
 * The reducer. `scaleFactor` is the V47 runtime scale; the pipeline builds at
 * 1.0 because the severe CSVs already embed their own transform, and the browser
 * applies the user's `smokeScale` to the stored array later.
 */
export function reduceSmokeField(
  rows: readonly CsvRow[],
  county: string = FIELD_COUNTY,
  anchor: string = SIM_START_LOCAL,
  scaleFactor = 1.0,
): SmokeFieldResult {
  const start = anchorEpochMs(anchor);
  const countyLower = county.toLowerCase();
  const sums = new Map<number, { sum: number; count: number }>();
  let maxHour = -1;
  let rowsAccumulated = 0;
  let rowsSkipped = 0;

  for (const row of rows) {
    const countyName = row.get("County Name");
    // Java: `county.equalsIgnoreCase(row.get("County Name"))` — false for null,
    // so a file without that column contributes nothing rather than throwing.
    if (countyName === undefined || countyName.toLowerCase() !== countyLower) {
      continue;
    }
    const dateStr = row.get("Date Local");
    const timeStr = row.get("Time Local");
    const valStr = row.get("Sample Measurement");
    if (dateStr === undefined || timeStr === undefined || valStr === undefined || valStr === "") {
      rowsSkipped += 1;
      continue;
    }
    if (javaDoubleThrows(valStr)) {
      // NumberFormatException → `continue` in Java. A literal "NaN" does NOT
      // throw there, so it falls through and poisons the hour's mean; only a
      // genuine parse failure skips the row.
      rowsSkipped += 1;
      continue;
    }
    const val = javaParseDouble(valStr);
    const obs = parseLocalDateTime(dateStr, timeStr);
    if (Number.isNaN(obs)) {
      // Java throws DateTimeParseException and the run dies. Surfacing it is
      // strictly better than the silent skip a tolerant parser would do.
      throw new Error(`unparseable observation timestamp '${dateStr}' '${timeStr}'`);
    }
    const hourIndex = hoursBetweenLocal(start, obs);
    if (hourIndex < 0) {
      continue; // before the simulation start
    }
    let sc = sums.get(hourIndex);
    if (sc === undefined) {
      sc = { sum: 0, count: 0 };
      sums.set(hourIndex, sc);
    }
    sc.sum += val;
    sc.count += 1;
    rowsAccumulated += 1;
    if (hourIndex > maxHour) {
      maxHour = hourIndex;
    }
  }

  const hourly = new Array<number>(maxHour + 1);
  let gapHours = 0;
  for (let h = 0; h <= maxHour; h += 1) {
    const sc = sums.get(h);
    if (sc === undefined || sc.count === 0) {
      hourly[h] = Number.NaN;
      gapHours += 1;
    } else {
      hourly[h] = (sc.sum / sc.count) * scaleFactor;
    }
  }

  let peak = 0;
  for (const v of hourly) {
    if (!Number.isNaN(v) && v > peak) {
      peak = v;
    }
  }

  return { hourly, hours: hourly.length, peakHourly: peak, rowsAccumulated, rowsSkipped, gapHours };
}

/**
 * `concentrationForTick` — kept here so the pipeline's own fixtures can assert
 * the NaN → 0.0 + counter contract that the badge depends on (plan Q11:
 * `out_of_range_lookups > 0` is not a warning, it is INVALID).
 */
export function concentrationForTick(
  hourly: readonly number[],
  tick: number,
  minutesPerTick: number,
): { readonly value: number; readonly outOfRange: boolean } {
  const hourIndex = Math.floor((tick * minutesPerTick) / 60.0);
  const c = hourIndex < 0 || hourIndex >= hourly.length ? Number.NaN : (hourly[hourIndex] as number);
  return Number.isNaN(c) ? { value: 0.0, outOfRange: true } : { value: c, outOfRange: false };
}
