/**
 * Pure chart-data transforms for the Run screen (WP11).
 *
 * Everything here is deterministic, DOM-free and side-effect-free so
 * `app/test/chart-transforms.test.ts` can exercise it under plain node. The
 * React components in this directory hold no numeric logic of their own — they
 * call these functions and hand the result to uPlot.
 *
 * ## Missing data is missing — never zero
 *
 * The project rule: a hole in a series renders as a **gap**, never as an
 * invented `0`. `NaN` is the missing-value marker throughout this module —
 * {@link smokeStripData} copies it through untouched and
 * {@link toStackedArea} lets it propagate upward through the cumulative sums
 * (a hole in one layer makes every layer above it a hole too, because the
 * stack's height is genuinely unknown there). uPlot's gap semantics are
 * `null`-based, so the chart boundary converts with
 * {@link nanToNullForGaps} — that conversion is the ONLY legal fate of a NaN;
 * coercing it to a number is a bug.
 */

import { STATES, UNHEALTHY_UGM3 } from "@websim/engine/agents";
import type { MetricSeries } from "../state/stream";

/**
 * Stacking order for {@link toStackedArea} — **exactly the engine's `STATES`
 * order** (`PRE_EVAC`, `EN_ROUTE`, `SHELTERED`, `UNREACHABLE`,
 * `REFUSED_ALL_FULL`, `UNAWARE`), bottom band first. The order is the engine's,
 * fixed here so the chart, the legend and `stateCensus`'s row indexing can
 * never disagree about which band is which.
 */
export const STACKING_ORDER = STATES;

/**
 * uPlot aligned data for a stacked area: row 0 is the x-values (hours), row
 * `k >= 1` is the CUMULATIVE count of `STACKING_ORDER[0..k-1]` at each hour.
 * Band `k`'s visual thickness at hour `h` is `data[k][h] - data[k-1][h]`
 * (recovered by {@link deStackValue}).
 */
export type StackedAreaData = [hours: number[], ...cumulativeCounts: number[][]];

/**
 * Cumulative-stack `series.stateCensus` (indexed `[stateIndex][hourIndex]`)
 * into uPlot aligned data. Stacking order = {@link STACKING_ORDER} (the
 * engine's STATES order). A missing or NaN census cell propagates NaN into its
 * own and every higher cumulative row at that hour — missing renders as
 * missing, never as a zero-thickness band.
 */
export function toStackedArea(series: Pick<MetricSeries, "hours" | "stateCensus">): StackedAreaData {
  const n = series.hours.length;
  const cumulative = new Array<number>(n).fill(0);
  const rows: number[][] = [];
  for (let s = 0; s < STACKING_ORDER.length; s++) {
    const layer = series.stateCensus[s];
    const row = new Array<number>(n);
    for (let h = 0; h < n; h++) {
      const v = layer?.[h] ?? Number.NaN;
      const cum = (cumulative[h] ?? Number.NaN) + v; // NaN propagates upward
      cumulative[h] = cum;
      row[h] = cum;
    }
    rows.push(row);
  }
  return [series.hours.slice(), ...rows];
}

/**
 * Recover the per-state (de-stacked) count from cumulative aligned data:
 * `data[seriesIdx][dataIdx] - data[seriesIdx - 1][dataIdx]` (row 1 is already
 * the bottom band's own value). Returns NaN when either operand is a gap —
 * used by the census chart's legend so a hover readout shows the REAL state
 * count, never the cumulative sum.
 */
export function deStackValue(
  data: ArrayLike<ArrayLike<number | null | undefined>>,
  seriesIdx: number,
  dataIdx: number,
): number {
  const upper = data[seriesIdx]?.[dataIdx];
  if (upper == null || Number.isNaN(upper)) {
    return Number.NaN;
  }
  if (seriesIdx <= 1) {
    return upper;
  }
  const lower = data[seriesIdx - 1]?.[dataIdx];
  if (lower == null || Number.isNaN(lower)) {
    return Number.NaN;
  }
  return upper - lower;
}

/** `[hours, smokeUgM3]` — uPlot aligned data for the smoke strip. */
export type SmokeStripData = [hours: number[], smokeUgM3: number[]];

/**
 * Extract `[hours, smoke]` for the smoke strip. NaN values are PRESERVED
 * bit-for-bit: NaN marks missing data and must survive this transform so the
 * chart boundary can turn it into a rendered gap ({@link nanToNullForGaps}).
 * It must never be replaced by 0 or interpolated over.
 */
export function smokeStripData(series: Pick<MetricSeries, "hours" | "smokeUgM3">): SmokeStripData {
  const n = series.hours.length;
  const smoke = new Array<number>(n);
  for (let h = 0; h < n; h++) {
    smoke[h] = series.smokeUgM3[h] ?? Number.NaN;
  }
  return [series.hours.slice(), smoke];
}

/**
 * The uPlot boundary for missing data. uPlot's path builders only break a line
 * at `null` (`NaN` coordinates would be silently skipped by canvas and the
 * neighbours joined — i.e. interpolation across the hole, which is worse than
 * a zero). This maps every NaN to `null` so the hole renders as a GAP, and
 * leaves every real value untouched.
 */
export function nanToNullForGaps(values: readonly number[]): (number | null)[] {
  return values.map((v) => (Number.isNaN(v) ? null : v));
}

/**
 * y-scale range for the smoke strip: always `[0, …]` and always tall enough to
 * keep the 55.5 µg/m³ reference line on screen (with 8 % headroom), whatever
 * the data max is — including a data max that is NaN/undefined because the
 * whole series is missing.
 */
export function smokeYRange(dataMax: number | null | undefined): [number, number] {
  const max = typeof dataMax === "number" && Number.isFinite(dataMax) ? dataMax : 0;
  return [0, Math.max(max, UNHEALTHY_UGM3) * 1.08];
}

export interface ShelterInfo {
  readonly name: string;
  readonly capacity: number;
}

export interface OccupancyRow {
  readonly name: string;
  /** Current headcount; NaN when the frame carried no value for this shelter. */
  readonly occupancy: number;
  readonly capacity: number;
  /**
   * `occupancy / capacity`. Guarded: a `capacity <= 0` shelter reports 0 (a
   * fraction of nothing is not a number — the raw division would be NaN or
   * Infinity and both would poison a width calculation). NaN occupancy stays
   * NaN — missing renders as missing.
   */
  readonly fraction: number;
}

/**
 * Per-shelter occupancy rows, sorted by capacity DESCENDING. The sort is
 * deterministic: `Array.prototype.sort` is stable (ES2019), so equal
 * capacities keep the input array's order — the display order is a pure
 * function of the shelters array, never of Map/Set iteration.
 *
 * `occupancy` is indexed parallel to `shelters` (worker frame layout); an
 * index past the end of `occupancy` yields NaN, not 0.
 */
export function occupancyRows(
  occupancy: Int32Array,
  shelters: readonly ShelterInfo[],
): OccupancyRow[] {
  const rows = shelters.map((shelter, i): OccupancyRow => {
    const occ = i < occupancy.length ? (occupancy[i] ?? Number.NaN) : Number.NaN;
    const fraction = shelter.capacity > 0 ? occ / shelter.capacity : 0;
    return { name: shelter.name, occupancy: occ, capacity: shelter.capacity, fraction };
  });
  rows.sort((a, b) => b.capacity - a.capacity);
  return rows;
}

/**
 * CSS width (percent, 0–100) for an occupancy fraction bar: clamped to
 * [0, 100], and 0 for a non-finite fraction (missing data draws no bar — the
 * row's text shows the gap).
 */
export function fractionBarWidthPct(fraction: number): number {
  if (!Number.isFinite(fraction)) {
    return 0;
  }
  return Math.min(1, Math.max(0, fraction)) * 100;
}

/**
 * `rgb(r, g, b)` CSS string from a 0–255 triple. `map/colors.ts` speaks
 * deck.gl's tuple dialect (`RGB`); uPlot and CSS speak strings — this is the
 * one converter, so chart hues are always the map's hues.
 */
export function rgbToCss(rgb: readonly [number, number, number]): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}
