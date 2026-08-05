/**
 * a11y.test.ts — WP13's pure accessibility logic, in Node with no DOM.
 *
 * Covers: the live-ticker message + its HOUR-change throttle, the chart text
 * summaries (aria-describedby targets), the data-table models, the
 * reduced-motion decision, the scrubber's spoken value, and the non-colour
 * glyph channels (badge + state legend).
 */
import { describe, expect, it } from "vitest";

import { STATES } from "@websim/engine/agents";

import { BADGE_STATES, CONSTRUCTED_SERIES_LABEL } from "../src/index.js";
import {
  CHART_EMPTY_SUMMARY,
  TICKER_EMPTY_TEXT,
  censusChartSummary,
  nextAnnouncement,
  smokeChartSummary,
  tickerMessage,
} from "../src/a11y/announce.js";
import type { TickerWave } from "../src/a11y/announce.js";
import { MISSING_CELL, censusTableModel, smokeTableModel } from "../src/a11y/DataTable.js";
import { REDUCED_MOTION_QUERY, runCenterMode } from "../src/a11y/useReducedMotion.js";
import { BADGE_GLYPHS, badgeGlyph } from "../src/badge/BadgePanel.js";
import { scrubberValueText } from "../src/controls/Scrubber.js";
import { STATE_GLYPHS } from "../src/map/colors.js";
import type { MetricSeries } from "../src/state/stream.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SHELTERED_IDX = STATES.indexOf("SHELTERED");

/** Two metric rows (hours 78, 79); SHELTERED 400 → 412; smoke 400 → 562. */
function twoRowSeries(): MetricSeries {
  const stateCensus = STATES.map(() => [0, 0]);
  stateCensus[SHELTERED_IDX] = [400, 412];
  return {
    hours: [78, 79],
    smokeUgM3: [400, 562],
    stateCensus,
    meanExposureUgM3h: [1, 2],
  };
}

const EMPTY: MetricSeries = { hours: [], smokeUgM3: [], stateCensus: [], meanExposureUgM3h: [] };

const WAVE_AT_79: TickerWave = { phase: "start", wave: 1, hour: 79 };

// ---------------------------------------------------------------------------
// tickerMessage — the plan's exact message style
// ---------------------------------------------------------------------------

describe("tickerMessage", () => {
  it("emits the plan's message style with a wave clause at the wave hour", () => {
    expect(tickerMessage(null, twoRowSeries(), [WAVE_AT_79])).toBe(
      "Hour 79: closure wave 1; 412 sheltered; PM2.5 562 ug/m3",
    );
  });

  it("omits the wave clause when no wave started at the latest hour", () => {
    expect(tickerMessage(null, twoRowSeries(), [{ phase: "start", wave: 1, hour: 40 }])).toBe(
      "Hour 79: 412 sheltered; PM2.5 562 ug/m3",
    );
  });

  it("ignores 'done' wave events (start already announced that hour)", () => {
    expect(tickerMessage(null, twoRowSeries(), [{ phase: "done", wave: 1, hour: 79 }])).toBe(
      "Hour 79: 412 sheltered; PM2.5 562 ug/m3",
    );
  });

  it("returns null with no metric rows — nothing is fabricated", () => {
    expect(tickerMessage(null, EMPTY, [])).toBeNull();
    expect(tickerMessage({ phase: "running" }, EMPTY, [])).toBeNull();
  });

  it("speaks a NaN smoke value as a data gap, never a number", () => {
    const series = twoRowSeries();
    series.smokeUgM3[1] = Number.NaN;
    const message = tickerMessage(null, series, []);
    expect(message).toContain("PM2.5 unavailable (data gap)");
    expect(message).not.toContain("NaN");
  });

  it("speaks a NaN census cell as unavailable", () => {
    const series = twoRowSeries();
    series.stateCensus[SHELTERED_IDX]![1] = Number.NaN;
    expect(tickerMessage(null, series, [])).toContain("sheltered count unavailable");
  });

  it("appends run-complete / paused from the status phase", () => {
    expect(tickerMessage({ phase: "finished" }, twoRowSeries(), [])).toMatch(/; run complete$/u);
    expect(tickerMessage({ phase: "paused" }, twoRowSeries(), [])).toMatch(/; paused$/u);
    expect(tickerMessage({ phase: "running" }, twoRowSeries(), [])).not.toMatch(/complete|paused/u);
  });
});

describe("nextAnnouncement — the HOUR-change throttle", () => {
  it("announces a new hour and refuses to re-announce the same hour", () => {
    const first = nextAnnouncement(null, null, twoRowSeries(), []);
    expect(first).not.toBeNull();
    expect(first!.hour).toBe(79);
    // Same latest hour again (e.g. 60 fps frame batches between rows): silent.
    expect(nextAnnouncement(79, null, twoRowSeries(), [])).toBeNull();
    // A previous hour on record: the new row announces.
    expect(nextAnnouncement(78, null, twoRowSeries(), [])).not.toBeNull();
  });

  it("stays silent with no data", () => {
    expect(nextAnnouncement(null, null, EMPTY, [])).toBeNull();
  });

  it("has honest empty text for the region's resting state", () => {
    expect(TICKER_EMPTY_TEXT).toContain("No live simulation data yet");
  });
});

// ---------------------------------------------------------------------------
// Chart summaries (aria-describedby targets)
// ---------------------------------------------------------------------------

describe("censusChartSummary", () => {
  it("summarises the hour range and the latest per-state counts in STATES order", () => {
    const text = censusChartSummary(twoRowSeries());
    expect(text).toContain("hour 78 to hour 79");
    expect(text).toContain("SHELTERED 412");
    for (const state of STATES) {
      expect(text).toContain(state);
    }
  });

  it("is the honest empty sentence with no rows", () => {
    expect(censusChartSummary(EMPTY)).toBe(CHART_EMPTY_SUMMARY);
  });

  it("speaks NaN cells as unavailable", () => {
    const series = twoRowSeries();
    series.stateCensus[SHELTERED_IDX]![1] = Number.NaN;
    expect(censusChartSummary(series)).toContain("SHELTERED unavailable");
  });
});

describe("smokeChartSummary", () => {
  it("names peak, threshold count and units — threshold as a concentration, never an index", () => {
    const text = smokeChartSummary(twoRowSeries(), 55.5, false);
    expect(text).toContain("peak 562 ug/m3 at hour 79");
    expect(text).toContain("2 of 2 hours above the 55.5 ug/m3 concentration threshold");
    expect(text).not.toMatch(/AQI/u);
  });

  it("counts gaps and reports them as gaps", () => {
    const series = twoRowSeries();
    series.smokeUgM3[0] = Number.NaN;
    const text = smokeChartSummary(series, 55.5, false);
    expect(text).toContain("1 hour(s) missing, rendered as gaps");
    expect(text).toContain("1 of 2 hours above");
  });

  it("carries the constructed-counterfactual label verbatim when flagged", () => {
    expect(smokeChartSummary(twoRowSeries(), 55.5, true)).toContain(CONSTRUCTED_SERIES_LABEL);
    expect(smokeChartSummary(EMPTY, 55.5, true)).toContain(CONSTRUCTED_SERIES_LABEL);
    expect(smokeChartSummary(twoRowSeries(), 55.5, false)).not.toContain(CONSTRUCTED_SERIES_LABEL);
  });

  it("is the honest empty sentence with no rows", () => {
    expect(smokeChartSummary(EMPTY, 55.5, false)).toBe(CHART_EMPTY_SUMMARY);
  });
});

// ---------------------------------------------------------------------------
// Data-table models
// ---------------------------------------------------------------------------

describe("censusTableModel", () => {
  it("has Hour + one column per state, rows carrying the true de-stacked counts", () => {
    const model = censusTableModel(twoRowSeries());
    expect(model.columns).toEqual(["Hour", ...STATES]);
    expect(model.rows).toHaveLength(2);
    expect(model.rows[1]![0]).toBe("79");
    expect(model.rows[1]![1 + SHELTERED_IDX]).toBe("412");
  });

  it("renders NaN as the missing marker, never 0", () => {
    const series = twoRowSeries();
    series.stateCensus[SHELTERED_IDX]![1] = Number.NaN;
    const model = censusTableModel(series);
    expect(model.rows[1]![1 + SHELTERED_IDX]).toBe(MISSING_CELL);
  });

  it("is empty (not fabricated) with no rows", () => {
    expect(censusTableModel(EMPTY).rows).toHaveLength(0);
  });
});

describe("smokeTableModel", () => {
  it("is [Hour, PM2.5] with one-decimal formatting and missing markers", () => {
    const series = twoRowSeries();
    series.smokeUgM3[0] = 400.25;
    series.smokeUgM3[1] = Number.NaN;
    const model = smokeTableModel(series);
    expect(model.columns).toEqual(["Hour", "PM2.5 ug/m3"]);
    expect(model.rows[0]).toEqual(["78", "400.3"]);
    expect(model.rows[1]).toEqual(["79", MISSING_CELL]);
  });
});

// ---------------------------------------------------------------------------
// Reduced motion + scrubber + glyph channels
// ---------------------------------------------------------------------------

describe("runCenterMode (reduced-motion branch as a pure decision)", () => {
  it("swaps the animated map for the census flow chart under reduced motion", () => {
    expect(runCenterMode(true)).toBe("census-flow");
    expect(runCenterMode(false)).toBe("animated-map");
  });

  it("queries the standard media feature", () => {
    expect(REDUCED_MOTION_QUERY).toBe("(prefers-reduced-motion: reduce)");
  });
});

describe("scrubberValueText (aria-valuetext)", () => {
  it("speaks the simulated clock, clamped to the track", () => {
    expect(scrubberValueText(79, 1440)).toBe("Day 1 01:19 of Day 2 00:00");
    expect(scrubberValueText(99999, 1440)).toBe("Day 2 00:00 of Day 2 00:00");
  });
});

describe("non-colour channels (WP13: colour is never the sole channel)", () => {
  it("STATE_GLYPHS is total over STATES with distinct glyphs", () => {
    const glyphs = STATES.map((s) => STATE_GLYPHS[s]);
    expect(glyphs.every((g) => typeof g === "string" && g.length > 0)).toBe(true);
    expect(new Set(glyphs).size).toBe(STATES.length);
  });

  it("BADGE_GLYPHS is total over BADGE_STATES with distinct glyphs", () => {
    const glyphs = BADGE_STATES.map((b) => badgeGlyph(b));
    expect(glyphs).toEqual(BADGE_STATES.map((b) => BADGE_GLYPHS[b]));
    expect(glyphs.every((g) => typeof g === "string" && g.length > 0)).toBe(true);
    expect(new Set(glyphs).size).toBe(BADGE_STATES.length);
  });
});
