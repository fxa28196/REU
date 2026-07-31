import { describe, expect, it } from "vitest";

import { readCsvText } from "../src/csv-loader.js";
import {
  concentrationForTick,
  hoursBetweenLocal,
  parseLocalDateTime,
  reduceSmokeField,
  SIM_START_LOCAL,
} from "../src/smoke-field.js";

/**
 * Synthetic AQS-shaped rows. Real files are 1.5 MB and 24 columns; the reducer
 * only reads four of them, so a four-column fixture exercises the same code path
 * while making each semantic visible.
 */
function aqs(rows: readonly (readonly [string, string, string, string])[]): string {
  const header = '"County Name","Date Local","Time Local","Sample Measurement"';
  const body = rows.map((r) => r.map((f) => `"${f}"`).join(",")).join("\r\n");
  return `${header}\r\n${body}\r\n`;
}

describe("hour indexing", () => {
  it("counts complete hours from the anchor and truncates toward zero", () => {
    const start = parseLocalDateTime("2020-09-07", "00:00");
    expect(hoursBetweenLocal(start, parseLocalDateTime("2020-09-07", "00:59"))).toBe(0);
    expect(hoursBetweenLocal(start, parseLocalDateTime("2020-09-07", "01:00"))).toBe(1);
    expect(hoursBetweenLocal(start, parseLocalDateTime("2020-09-06", "23:00"))).toBe(-1);
  });

  it("truncates Time Local to five characters like SmokeField does", () => {
    expect(parseLocalDateTime("2020-09-07", "05:30:00")).toBe(
      parseLocalDateTime("2020-09-07", "05:30"),
    );
  });

  it("rejects a date that does not exist rather than rolling it over", () => {
    // Date.UTC would silently turn 2020-02-31 into 2020-03-02; LocalDate.parse
    // throws. A rolled-over date would land observations in the wrong hour.
    expect(Number.isNaN(parseLocalDateTime("2020-02-31", "00:00"))).toBe(true);
  });
});

describe("SmokeField reducer", () => {
  it("averages all in-county monitors for an hour, in file order", () => {
    const field = reduceSmokeField(
      readCsvText(
        aqs([
          ["Multnomah", "2020-09-07", "00:00", "10"],
          ["Multnomah", "2020-09-07", "00:00", "20"],
        ]),
      ),
    );
    expect(field.hourly).toEqual([15]);
    expect(field.rowsAccumulated).toBe(2);
  });

  it("matches the county case-insensitively and ignores other counties", () => {
    const field = reduceSmokeField(
      readCsvText(
        aqs([
          ["MULTNOMAH", "2020-09-07", "00:00", "10"],
          ["Clackamas", "2020-09-07", "00:00", "999"],
        ]),
      ),
    );
    expect(field.hourly).toEqual([10]);
  });

  it("leaves a missing hour as NaN rather than zero", () => {
    // The whole gap contract: a fabricated zero here would look like clean air
    // and would never trip the out-of-range counter downstream.
    const field = reduceSmokeField(
      readCsvText(
        aqs([
          ["Multnomah", "2020-09-07", "00:00", "10"],
          ["Multnomah", "2020-09-07", "02:00", "30"],
        ]),
      ),
    );
    expect(field.hours).toBe(3);
    expect(Number.isNaN(field.hourly[1] as number)).toBe(true);
    expect(field.gapHours).toBe(1);
  });

  it("drops observations before the anchor without shortening the array", () => {
    const field = reduceSmokeField(
      readCsvText(
        aqs([
          ["Multnomah", "2020-09-06", "23:00", "500"],
          ["Multnomah", "2020-09-07", "00:00", "10"],
        ]),
      ),
    );
    expect(field.hourly).toEqual([10]);
  });

  it("skips a row whose measurement is blank or unparseable", () => {
    const field = reduceSmokeField(
      readCsvText(
        aqs([
          ["Multnomah", "2020-09-07", "00:00", ""],
          ["Multnomah", "2020-09-07", "00:00", "abc"],
          ["Multnomah", "2020-09-07", "00:00", "8"],
        ]),
      ),
    );
    expect(field.hourly).toEqual([8]);
    expect(field.rowsSkipped).toBe(2);
  });

  it("applies the scale to real values only and leaves gaps NaN", () => {
    const field = reduceSmokeField(
      readCsvText(
        aqs([
          ["Multnomah", "2020-09-07", "00:00", "10"],
          ["Multnomah", "2020-09-07", "02:00", "30"],
        ]),
      ),
      "Multnomah",
      SIM_START_LOCAL,
      2.0,
    );
    expect(field.hourly[0]).toBe(20);
    expect(Number.isNaN(field.hourly[1] as number)).toBe(true);
    expect(field.hourly[2]).toBe(60);
  });

  it("reports peakHourly as 0 for an all-gap field, matching Java's floor at 0", () => {
    const field = reduceSmokeField(readCsvText(aqs([["Multnomah", "2020-09-07", "00:00", ""]])));
    expect(field.hours).toBe(0);
    expect(field.peakHourly).toBe(0);
  });
});

describe("concentrationForTick", () => {
  const hourly = [10, Number.NaN, 30];

  it("maps ticks to hours by floor(tick * minutesPerTick / 60)", () => {
    expect(concentrationForTick(hourly, 0, 1.0)).toEqual({ value: 10, outOfRange: false });
    expect(concentrationForTick(hourly, 59, 1.0)).toEqual({ value: 10, outOfRange: false });
    expect(concentrationForTick(hourly, 120, 1.0)).toEqual({ value: 30, outOfRange: false });
  });

  it("returns 0.0 AND flags out-of-range for a gap hour", () => {
    // Plan Q11: any increment of out_of_range_lookups makes the run INVALID.
    // Both halves matter — the zero without the flag is the fabricated value.
    expect(concentrationForTick(hourly, 60, 1.0)).toEqual({ value: 0, outOfRange: true });
  });

  it("returns 0.0 AND flags out-of-range past the end of the window", () => {
    expect(concentrationForTick(hourly, 999, 1.0)).toEqual({ value: 0, outOfRange: true });
  });
});
