/**
 * The model's time model (PORT_MAP §1.1) and `ContextCreator.tickForDate`.
 *
 * Sim hour 0 is **2020-09-07T00:00 local** (V13). There is no time zone and no
 * clock: the engine never touches `Date`, because a run must produce identical
 * numbers on a laptop in Portland and a CI box in UTC. Dates in the shelter CSVs
 * are converted to ticks with integer day arithmetic only.
 *
 * ## `tickForDate` — the `+1 day` close offset
 *
 * The shelter source gives DATES, not hours. `ContextCreator` reads an `opened`
 * date as 00:00 that day (`dayOffset = 0`) and a `closed` date as 00:00 the
 * FOLLOWING day (`dayOffset = 1`), so a site "closed 2020-09-19" operates
 * through the end of the 19th. Blank or absent dates take the caller's fallback,
 * which is ∓Infinity — always open. Getting the offset wrong shortens every
 * shelter's window by 24 h and is invisible in any single-number check.
 *
 * ## Run length
 *
 * `endHours = min(simulationHours, smokeSlices)` and `endTick = endHours *
 * ticksPerHour`. Separately, gotcha 3 says a legal run needs
 * `simulationHours <= smokeSlices − 1`: the schedule's final tick is inclusive
 * and reads hour index `simulationHours`, so an exactly-equal window silently
 * books fabricated zero-concentration lookups. {@link checkRunWindow} reports
 * that as a violation; the engine surfaces it rather than clamping, because the
 * archived `out_of_range_lookups == 0` gate is the only thing that ever caught
 * it.
 */

/** V13 anchor: `LocalDateTime.of(2020, 9, 7, 0, 0)`. */
export const SIM_START = Object.freeze({ year: 2020, month: 9, day: 7, hour: 0, minute: 0 });

/** `java.time.LocalDate.DAYS_0000_TO_1970`. */
const DAYS_0000_TO_1970 = 719528;

function isLeapYear(year: number): boolean {
  return (year & 3) === 0 && (year % 100 !== 0 || year % 400 === 0);
}

const MONTH_LENGTHS: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function lengthOfMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return MONTH_LENGTHS[month - 1]!;
}

/**
 * `java.time.LocalDate.toEpochDay`, transcribed. Integer division in Java
 * truncates toward zero, which is what `Math.trunc` does here; the two agree
 * because every intermediate is exact well inside 2^53.
 */
export function toEpochDay(year: number, month: number, day: number): number {
  let total = 365 * year;
  if (year >= 0) {
    total += Math.trunc((year + 3) / 4) - Math.trunc((year + 99) / 100) + Math.trunc((year + 399) / 400);
  } else {
    total -= Math.trunc(year / -4) - Math.trunc(year / -100) + Math.trunc(year / -400);
  }
  total += Math.trunc((367 * month - 362) / 12);
  total += day - 1;
  if (month > 2) {
    total -= 1;
    if (!isLeapYear(year)) {
      total -= 1;
    }
  }
  return total - DAYS_0000_TO_1970;
}

const SIM_START_EPOCH_DAY = toEpochDay(SIM_START.year, SIM_START.month, SIM_START.day);
const SIM_START_MINUTE_OF_DAY = SIM_START.hour * 60 + SIM_START.minute;

/** Thrown where Java throws `DateTimeParseException` — an unparseable date aborts the build. */
export class DateParseError extends Error {
  constructor(text: string, reason: string) {
    super(`could not parse date "${text}": ${reason}`);
    this.name = "DateParseError";
  }
}

/** `DateTimeFormatter.ISO_LOCAL_DATE` for the plain (unsigned, 4-digit-year) form. */
const ISO_LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** Parse an ISO local date to its epoch day, with Java's strictness. */
export function parseIsoDateToEpochDay(text: string): number {
  const m = ISO_LOCAL_DATE.exec(text);
  if (m === null) {
    throw new DateParseError(text, "expected ISO_LOCAL_DATE (yyyy-MM-dd)");
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) {
    throw new DateParseError(text, `month ${month} is out of range`);
  }
  if (day < 1 || day > lengthOfMonth(year, month)) {
    throw new DateParseError(text, `day ${day} is out of range for month ${month}`);
  }
  return toEpochDay(year, month, day);
}

/**
 * Tick at 00:00 local on `isoDate`, relative to {@link SIM_START}.
 *
 * @param isoDate     the CSV cell; `null`/blank returns `fallback`
 * @param ticksPerHour `60 / minutesPerTick`
 * @param fallback    an always-open bound (−∞ for `opened`, +∞ for `closed`)
 * @param dayOffset   0 for an opening date, **1 for a closing date**
 */
export function tickForDate(
  isoDate: string | null | undefined,
  ticksPerHour: number,
  fallback: number,
  dayOffset: number,
): number {
  if (isoDate === null || isoDate === undefined || isoDate.trim().length === 0) {
    return fallback;
  }
  const epochDay = parseIsoDateToEpochDay(isoDate.trim()) + dayOffset;
  // Duration.between(...).toMinutes() — whole minutes, exact.
  const minutes = (epochDay - SIM_START_EPOCH_DAY) * 1440 - SIM_START_MINUTE_OF_DAY;
  const hours = minutes / 60;
  return hours * ticksPerHour;
}

/** `ticksPerHour = 60.0 / minutesPerTick`. */
export function ticksPerHour(minutesPerTick: number): number {
  return 60 / minutesPerTick;
}

export interface RunWindow {
  /** `min(simulationHours, smokeSlices)`. */
  readonly endHours: number;
  /** `endHours * ticksPerHour` — the inclusive final scheduled tick. */
  readonly endTick: number;
  readonly ticksPerHour: number;
  /**
   * `true` when `simulationHours > smokeSlices − 1` (gotcha 3). The run still
   * builds — Java's does — but every hour past the series books a fabricated
   * zero and increments `outOfRangeLookups`.
   */
  readonly overrunsSmokeSeries: boolean;
}

// ---------------------------------------------------------------------------
// `SmokeField.timeForTick(...).toString()` — the `*_local` output columns
// ---------------------------------------------------------------------------

/** `java.time.LocalDate.DAYS_PER_CYCLE`. */
const DAYS_PER_CYCLE = 146097;

export interface LocalDateTimeParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

/** `java.time.LocalDate.ofEpochDay`, transcribed (positive range is all we use). */
export function fromEpochDay(epochDay: number): { year: number; month: number; day: number } {
  let zeroDay = epochDay + DAYS_0000_TO_1970 - 60;
  let adjust = 0;
  if (zeroDay < 0) {
    const adjustCycles = Math.trunc((zeroDay + 1) / DAYS_PER_CYCLE) - 1;
    adjust = adjustCycles * 400;
    zeroDay += -adjustCycles * DAYS_PER_CYCLE;
  }
  let yearEst = Math.trunc((400 * zeroDay + 591) / DAYS_PER_CYCLE);
  const doy = (y: number): number =>
    zeroDay - (365 * y + Math.trunc(y / 4) - Math.trunc(y / 100) + Math.trunc(y / 400));
  let doyEst = doy(yearEst);
  if (doyEst < 0) {
    yearEst -= 1;
    doyEst = doy(yearEst);
  }
  yearEst += adjust;
  const marchDoy0 = doyEst;
  const marchMonth0 = Math.trunc((marchDoy0 * 5 + 2) / 153);
  const month = ((marchMonth0 + 2) % 12) + 1;
  const day = marchDoy0 - Math.trunc((marchMonth0 * 306 + 5) / 10) + 1;
  return { year: yearEst + Math.trunc(marchMonth0 / 10), month, day };
}

/**
 * `SmokeField.timeForTick(tick, minutesPerTick)` — `SIM_START.plusMinutes((long)
 * (tick * minutesPerTick))`.
 *
 * The `(long)` cast **truncates toward zero**; it is not a round. At the pinned
 * 1.0 min/tick that is the identity, but a fractional `minutesPerTick` makes the
 * difference visible in `time_started_local`, which the R3 exclusion discipline
 * explicitly refuses to exempt from byte-identity.
 */
export function timeForTick(tick: number, minutesPerTick: number): LocalDateTimeParts {
  const minutes = Math.trunc(tick * minutesPerTick);
  const total = SIM_START_MINUTE_OF_DAY + minutes;
  const dayOffset = Math.floor(total / 1440);
  const minuteOfDay = total - dayOffset * 1440;
  const { year, month, day } = fromEpochDay(SIM_START_EPOCH_DAY + dayOffset);
  return {
    year,
    month,
    day,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
  };
}

const pad = (v: number, width: number): string => String(v).padStart(width, "0");

/**
 * `java.time.LocalDateTime.toString()` for a whole-minute instant: `yyyy-MM-ddTHH:mm`.
 *
 * Java omits the seconds field when second and nano are both zero, which is
 * always the case here because {@link timeForTick} works in whole minutes. Years
 * outside 0..9999 get Java's sign/width treatment; the 2020 anchor never reaches
 * it, but emitting a 4-digit year unconditionally would be a silent lie for any
 * future re-anchoring.
 */
export function formatLocalDateTime(t: LocalDateTimeParts): string {
  const year =
    t.year < 0
      ? `-${pad(-t.year, 4)}`
      : t.year > 9999
        ? `+${String(t.year)}`
        : pad(t.year, 4);
  return `${year}-${pad(t.month, 2)}-${pad(t.day, 2)}T${pad(t.hour, 2)}:${pad(t.minute, 2)}`;
}

/** Convenience: the exact string the `*_local` CSV columns carry. */
export function localTimeStringForTick(tick: number, minutesPerTick: number): string {
  return formatLocalDateTime(timeForTick(tick, minutesPerTick));
}

export function checkRunWindow(
  simulationHours: number,
  smokeSlices: number,
  minutesPerTick: number,
): RunWindow {
  const tph = ticksPerHour(minutesPerTick);
  const endHours = Math.min(simulationHours, smokeSlices);
  return {
    endHours,
    endTick: endHours * tph,
    ticksPerHour: tph,
    overrunsSmokeSeries: simulationHours > smokeSlices - 1,
  };
}
