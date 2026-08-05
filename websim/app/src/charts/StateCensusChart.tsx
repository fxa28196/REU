/**
 * `StateCensusChart` — stacked area of the per-state resident census over
 * simulation hours.
 *
 * - **Stacking order = the engine's `STATES` order** (bottom band first):
 *   PRE_EVAC, EN_ROUTE, SHELTERED, UNREACHABLE, REFUSED_ALL_FULL, UNAWARE.
 *   `transforms.toStackedArea` builds the cumulative rows; uPlot bands clip
 *   each band's fill down to the band below it.
 * - **Colors come from `STATE_COLORS`** (map/colors.ts — the Okabe-Ito
 *   colorblind-safe categorical assignment shared with the map layer), so a
 *   state is the same hue on the map and in this chart.
 * - **The legend readout de-stacks.** A hovered value shows the REAL count of
 *   that state (`deStackValue`), never the cumulative sum the plotted row
 *   happens to hold.
 */

import { useId, useMemo } from "react";
import type { CSSProperties, ReactElement } from "react";
import type uPlot from "uplot";

import { STATES } from "@websim/engine/agents";
import type { State } from "@websim/engine/agents";

import { censusChartSummary } from "../a11y/announce.js";
import { censusTableModel, DataTableToggle } from "../a11y/DataTable.js";
import { STATE_COLORS } from "../map/colors";
import type { RGB } from "../map/colors";
import type { MetricSeries } from "../state/stream";
import { deStackValue, rgbToCss, toStackedArea } from "./transforms";
import { CHART_FONT, CHART_PANEL_BG, CHART_TEXT, darkAxis, useUplot } from "./useUplot";
import type { UplotOptionsSansWidth } from "./useUplot";

/**
 * One uPlot series per state, in STATES order (indices 1..6 of the aligned
 * data). Fill carries the identity (STATE_COLORS); the 1px panel-colored
 * stroke is the separator line between adjacent stacked fills. The legend
 * value formatter de-stacks, so hover readouts are true per-state counts
 * ("--" over a gap).
 */
export function buildCensusSeries(colors: Readonly<Record<State, RGB>>): uPlot.Series[] {
  return STATES.map((state): uPlot.Series => {
    return {
      label: state,
      stroke: CHART_PANEL_BG,
      width: 1,
      fill: rgbToCss(colors[state]),
      points: { show: false },
      value: (u: uPlot, _raw: number, seriesIdx: number, idx: number | null): string | number => {
        if (idx === null) {
          return "--";
        }
        const count = deStackValue(u.data, seriesIdx, idx);
        return Number.isNaN(count) ? "--" : count;
      },
    };
  });
}

/**
 * Bands clipping each cumulative series' fill down to the series below it:
 * `{series: [upper, lower]}` for consecutive pairs (2,1)…(count,count-1). The
 * bottom series (index 1) fills to the zero baseline on its own.
 */
export function censusBands(count: number): uPlot.Band[] {
  const bands: uPlot.Band[] = [];
  for (let upper = 2; upper <= count; upper++) {
    bands.push({ series: [upper, upper - 1] });
  }
  return bands;
}

export interface StateCensusChartProps {
  readonly series: Pick<MetricSeries, "hours" | "stateCensus">;
  /** Plot height in CSS px (plotting area + axes). */
  readonly height?: number;
}

const panelStyle: CSSProperties = {
  background: CHART_PANEL_BG,
  color: CHART_TEXT,
  font: CHART_FONT,
  borderRadius: 6,
  padding: "8px 8px 4px",
};

export function StateCensusChart({ series, height = 220 }: StateCensusChartProps): ReactElement {
  const data = useMemo<uPlot.AlignedData>(() => toStackedArea(series), [series]);

  const options = useMemo<UplotOptionsSansWidth>(
    () => ({
      height,
      scales: {
        x: { time: false },
        y: {
          range: (_u: uPlot, _min: number, max: number): [number, number] => [
            0,
            Number.isFinite(max) && max > 0 ? max * 1.03 : 1,
          ],
        },
      },
      series: [{ label: "Hour" }, ...buildCensusSeries(STATE_COLORS)],
      bands: censusBands(STATES.length),
      axes: [darkAxis("Hour of simulation"), darkAxis("Residents")],
    }),
    [height],
  );

  const containerRef = useUplot(options, data);

  // WP13: accessible name + visually-hidden summary + data-table alternative
  // carrying the DE-STACKED per-state counts (the true numbers, not the
  // cumulative plotting rows).
  const summaryId = useId();
  const summary = useMemo(() => censusChartSummary(series), [series]);
  const tableModel = useMemo(() => censusTableModel(series), [series]);

  return (
    <div style={panelStyle}>
      <div
        ref={containerRef}
        role="img"
        aria-label="Resident state census by simulation hour — stacked area chart"
        aria-describedby={summaryId}
      />
      <p id={summaryId} className="visually-hidden">
        {summary}
      </p>
      <DataTableToggle
        chartName="state census"
        caption="Resident count per state by simulation hour — the same numbers the stacked-area chart encodes (per-state counts, de-stacked)."
        model={tableModel}
      />
    </div>
  );
}
