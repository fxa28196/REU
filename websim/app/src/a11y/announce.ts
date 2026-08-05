/**
 * announce.ts — WP13's pure screen-reader text plane.
 *
 * Every string a live region or a chart description speaks is built here, as a
 * pure function over the store's reduced stream shapes, so
 * `app/test/a11y.test.ts` exercises all of it in Node with no DOM.
 *
 * ## Honesty rules carried by this module
 *
 * - **Missing data is spoken as missing.** A NaN smoke value reads
 *   "PM2.5 unavailable (data gap)" — never a fabricated number, never 0.
 * - **No data is an honest empty state.** With zero metric rows every builder
 *   returns `null` / an explicit "no data yet" sentence rather than inventing
 *   an hour.
 * - **55.5 is a concentration threshold.** The smoke summary names the
 *   `UNHEALTHY_UGM3` constant as a concentration threshold, with units; it is
 *   never an index category.
 * - **Constructed series stay labelled.** When the smoke chart shows series
 *   1/2, its spoken summary carries `CONSTRUCTED_SERIES_LABEL` verbatim.
 *
 * ## Throttling (a 60 fps stream must not spam a screen reader)
 *
 * The ticker announces on simulated-HOUR change, never on display frame. The
 * gate is structural: {@link tickerMessage} reads only the METRIC series
 * (one row per simulated hour) plus the wave list, so frame batches cannot
 * change its output, and {@link nextAnnouncement} additionally refuses to
 * re-announce the hour it last spoke.
 */

import { STATES } from "@websim/engine/agents";
import type { RunStatus, WaveProgressEvent } from "@websim/engine/worker";

import { CONSTRUCTED_SERIES_LABEL } from "../index.js";
import type { MetricSeries } from "../state/stream.js";

// ---------------------------------------------------------------------------
// Shared formatting
// ---------------------------------------------------------------------------

const SHELTERED_IDX = STATES.indexOf("SHELTERED");

/** Locale-formatted number for spoken text; up to `fractionDigits` decimals. */
function fmt(value: number, fractionDigits = 0): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
}

/** Last index of the metric series, or -1 when it has no rows yet. */
function lastRow(census: Pick<MetricSeries, "hours">): number {
  return census.hours.length - 1;
}

// ---------------------------------------------------------------------------
// Live ticker
// ---------------------------------------------------------------------------

/** The wave fields the ticker reads (subset of `WaveProgressEvent`). */
export type TickerWave = Pick<WaveProgressEvent, "phase" | "wave" | "hour">;

/** The status fields the ticker reads (subset of `RunStatus`). */
export type TickerStatus = Pick<RunStatus, "phase">;

/**
 * The plan's live-region message for the CURRENT latest metric row, e.g.
 * `"Hour 79: closure wave 1; 412 sheltered; PM2.5 562 ug/m3"`.
 *
 * - `null` when no metric row exists yet (nothing to announce — the region
 *   shows its honest empty text instead).
 * - The closure-wave clause appears only when a wave STARTED at this hour.
 * - NaN smoke reads "PM2.5 unavailable (data gap)"; a NaN census cell reads
 *   "sheltered count unavailable".
 * - A `finished`/`paused` status phase appends "; run complete" / "; paused"
 *   so the end of a run is announced once, with its final numbers.
 */
export function tickerMessage(
  status: TickerStatus | null,
  census: Pick<MetricSeries, "hours" | "smokeUgM3" | "stateCensus">,
  waves: readonly TickerWave[],
): string | null {
  const last = lastRow(census);
  if (last < 0) {
    return null;
  }
  const hour = census.hours[last]!;

  const parts: string[] = [];
  for (const wave of waves) {
    if (wave.phase === "start" && wave.hour === hour) {
      parts.push(`closure wave ${fmt(wave.wave)}`);
    }
  }
  const sheltered = census.stateCensus[SHELTERED_IDX]?.[last] ?? Number.NaN;
  parts.push(Number.isFinite(sheltered) ? `${fmt(sheltered)} sheltered` : "sheltered count unavailable");
  const smoke = census.smokeUgM3[last] ?? Number.NaN;
  parts.push(Number.isFinite(smoke) ? `PM2.5 ${fmt(smoke, 1)} ug/m3` : "PM2.5 unavailable (data gap)");

  let message = `Hour ${fmt(hour)}: ${parts.join("; ")}`;
  if (status !== null && status.phase === "finished") {
    message += "; run complete";
  } else if (status !== null && status.phase === "paused") {
    message += "; paused";
  }
  return message;
}

/** One throttled announcement: the hour it belongs to plus its message. */
export interface TickerAnnouncement {
  readonly hour: number;
  readonly message: string;
}

/**
 * The HOUR-change throttle. Returns the announcement for the latest metric
 * row only when that row's hour differs from `lastAnnouncedHour`; `null`
 * otherwise (same hour, or no data). This is the ONLY gate a live region
 * needs: at any playback speed the DOM text changes at most once per simulated
 * hour, so a polite screen reader queue is never flooded by display frames.
 */
export function nextAnnouncement(
  lastAnnouncedHour: number | null,
  status: TickerStatus | null,
  census: Pick<MetricSeries, "hours" | "smokeUgM3" | "stateCensus">,
  waves: readonly TickerWave[],
): TickerAnnouncement | null {
  const last = lastRow(census);
  if (last < 0) {
    return null;
  }
  const hour = census.hours[last]!;
  if (lastAnnouncedHour !== null && hour === lastAnnouncedHour) {
    return null;
  }
  const message = tickerMessage(status, census, waves);
  return message === null ? null : { hour, message };
}

/** Honest empty text the live region shows before any metric row arrives. */
export const TICKER_EMPTY_TEXT =
  "No live simulation data yet. Press Play to run this configuration in your browser.";

// ---------------------------------------------------------------------------
// Chart text alternatives (aria-describedby targets)
// ---------------------------------------------------------------------------

/** Honest empty sentence shared by both chart summaries. */
export const CHART_EMPTY_SUMMARY =
  "No data yet: no live simulation rows have arrived. Press Play to run this configuration.";

/**
 * Visually-hidden summary for the state-census stacked-area chart: the hour
 * range and the latest row's per-state counts, in the engine's `STATES` order.
 * A NaN cell is spoken as "unavailable" — never as a number.
 */
export function censusChartSummary(
  series: Pick<MetricSeries, "hours" | "stateCensus">,
): string {
  const last = lastRow(series);
  if (last < 0) {
    return CHART_EMPTY_SUMMARY;
  }
  const first = series.hours[0]!;
  const hour = series.hours[last]!;
  const counts = STATES.map((state, s) => {
    const v = series.stateCensus[s]?.[last] ?? Number.NaN;
    return `${state} ${Number.isFinite(v) ? fmt(v) : "unavailable"}`;
  });
  return (
    `Stacked area chart of resident states over ${fmt(last + 1)} hourly rows ` +
    `(hour ${fmt(first)} to hour ${fmt(hour)}). At hour ${fmt(hour)}: ${counts.join(", ")}.`
  );
}

/**
 * Visually-hidden summary for the smoke strip: hour range, latest and peak
 * concentration, hours above the threshold, and the gap count. `thresholdUgM3`
 * is the engine's `UNHEALTHY_UGM3` (the component passes it in, so this module
 * needs no chart import); it is described as a concentration threshold with
 * units. `isConstructed` appends `CONSTRUCTED_SERIES_LABEL` verbatim.
 */
export function smokeChartSummary(
  series: Pick<MetricSeries, "hours" | "smokeUgM3">,
  thresholdUgM3: number,
  isConstructed: boolean,
): string {
  const constructedSuffix = isConstructed ? ` This series is a ${CONSTRUCTED_SERIES_LABEL}.` : "";
  const last = lastRow(series);
  if (last < 0) {
    return CHART_EMPTY_SUMMARY + constructedSuffix;
  }
  const first = series.hours[0]!;
  const hour = series.hours[last]!;
  let peak = Number.NaN;
  let peakHour = Number.NaN;
  let above = 0;
  let gaps = 0;
  for (let h = 0; h <= last; h++) {
    const v = series.smokeUgM3[h] ?? Number.NaN;
    if (!Number.isFinite(v)) {
      gaps++;
      continue;
    }
    if (!Number.isFinite(peak) || v > peak) {
      peak = v;
      peakHour = series.hours[h]!;
    }
    if (v > thresholdUgM3) {
      above++;
    }
  }
  const latest = series.smokeUgM3[last] ?? Number.NaN;
  const latestText = Number.isFinite(latest)
    ? `${fmt(latest, 1)} ug/m3`
    : "unavailable (data gap)";
  const peakText = Number.isFinite(peak)
    ? `peak ${fmt(peak, 1)} ug/m3 at hour ${fmt(peakHour)}`
    : "no finite values yet";
  const gapText = gaps > 0 ? ` ${fmt(gaps)} hour(s) missing, rendered as gaps.` : "";
  return (
    `Line chart of smoke concentration in ug/m3 over ${fmt(last + 1)} hourly rows ` +
    `(hour ${fmt(first)} to hour ${fmt(hour)}). Latest ${latestText}; ${peakText}; ` +
    `${fmt(above)} of ${fmt(last + 1)} hours above the ${fmt(thresholdUgM3, 1)} ug/m3 ` +
    `concentration threshold.${gapText}${constructedSuffix}`
  );
}
