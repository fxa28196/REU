/**
 * `SmokeStrip` — line chart of ambient smoke concentration (µg/m³) over
 * simulation hours, with a fixed horizontal reference line at 55.5 µg/m³.
 *
 * Honesty invariants owned by this component:
 *
 * - **55.5 is a CONCENTRATION threshold, never an "AQI category".** The label
 *   text spells that out and derives the number from the engine's single
 *   `UNHEALTHY_UGM3` constant, so the chart cannot drift from the model.
 * - **Constructed series wear the banner.** When `isConstructed` is true (smoke
 *   series 1/2 — the constructed counterfactuals), the exact
 *   `CONSTRUCTED_SERIES_LABEL` renders in a high-visibility banner ABOVE the
 *   chart, not in a tooltip.
 * - **Missing data renders as a gap.** NaN survives `smokeStripData` and is
 *   converted to `null` only at the uPlot boundary (`nanToNullForGaps`), so
 *   holes are visible holes — never zeros, never interpolated across.
 */

import { useMemo } from "react";
import type { CSSProperties, ReactElement } from "react";
import type uPlot from "uplot";

import { UNHEALTHY_UGM3 } from "@websim/engine/agents";

import { CONSTRUCTED_SERIES_LABEL } from "../index";
import { SMOKE_SCRIM_RGB } from "../map/colors";
import type { MetricSeries } from "../state/stream";
import { nanToNullForGaps, rgbToCss, smokeStripData, smokeYRange } from "./transforms";
import { CHART_FONT, CHART_PANEL_BG, CHART_TEXT, darkAxis, useUplot } from "./useUplot";
import type { UplotOptionsSansWidth } from "./useUplot";

/**
 * Smoke line stroke — THE smoke colour: the map scrim's Okabe-Ito amber
 * (`SMOKE_SCRIM_RGB`), derived so chart and map can never disagree about what
 * smoke looks like. (Also keeps this single-series line clear of PRE_EVAC's
 * sky blue in the census chart alongside.)
 */
export const SMOKE_STROKE = rgbToCss(SMOKE_SCRIM_RGB);

/**
 * Reference line — neutral chart ink, dashed: it is an annotation, not a
 * second data series, and its identity comes from its on-chart label.
 */
export const THRESHOLD_COLOR = CHART_TEXT;

/**
 * The reference line's on-chart label. `${UNHEALTHY_UGM3}` renders "55.5" from
 * the engine's own constant — a concentration threshold, not an AQI category.
 */
export const UNHEALTHY_REFERENCE_LABEL =
  `${UNHEALTHY_UGM3} ug/m3 - EPA Unhealthy breakpoint (concentration threshold)` as const;

/**
 * uPlot plugin drawing a dashed horizontal reference line at `value` on the
 * `y` scale, with `label` sitting just above it. Draws in the `draw` hook so
 * it overlays the series, in canvas pixels (uPlot's `bbox`/`valToPos(…, true)`
 * space), scaled by devicePixelRatio.
 */
export function thresholdLinePlugin(value: number, label: string, color: string): uPlot.Plugin {
  return {
    hooks: {
      draw: (u: uPlot): void => {
        const y = u.valToPos(value, "y", true);
        if (!Number.isFinite(y) || y < u.bbox.top || y > u.bbox.top + u.bbox.height) {
          return;
        }
        const pxRatio =
          typeof devicePixelRatio === "number" && Number.isFinite(devicePixelRatio)
            ? devicePixelRatio
            : 1;
        const ctx = u.ctx;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, Math.round(pxRatio));
        ctx.setLineDash([6 * pxRatio, 4 * pxRatio]);
        ctx.beginPath();
        ctx.moveTo(u.bbox.left, y);
        ctx.lineTo(u.bbox.left + u.bbox.width, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = `${Math.round(11 * pxRatio)}px system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(label, u.bbox.left + 8 * pxRatio, y - 4 * pxRatio);
        ctx.restore();
      },
    },
  };
}

export interface SmokeStripProps {
  readonly series: Pick<MetricSeries, "hours" | "smokeUgM3">;
  /**
   * True when the displayed series is a CONSTRUCTED counterfactual (smoke
   * series 1/2): renders the mandatory `CONSTRUCTED_SERIES_LABEL` banner
   * above the chart.
   */
  readonly isConstructed: boolean;
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

const bannerStyle: CSSProperties = {
  background: SMOKE_STROKE,
  color: "#14161a",
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: "0.04em",
  padding: "4px 8px",
  borderRadius: 4,
  marginBottom: 6,
  textAlign: "center",
};

export function SmokeStrip({ series, isConstructed, height = 160 }: SmokeStripProps): ReactElement {
  const data = useMemo<uPlot.AlignedData>(() => {
    const [hours, smoke] = smokeStripData(series);
    return [hours, nanToNullForGaps(smoke)];
  }, [series]);

  const options = useMemo<UplotOptionsSansWidth>(
    () => ({
      height,
      scales: {
        x: { time: false },
        y: {
          range: (_u: uPlot, _min: number, max: number): [number, number] => smokeYRange(max),
        },
      },
      series: [
        { label: "Hour" },
        {
          label: "Smoke ug/m3",
          stroke: SMOKE_STROKE,
          width: 2,
          spanGaps: false, // a null IS the gap; never bridge it
          points: { show: false },
        },
      ],
      axes: [darkAxis("Hour of simulation"), darkAxis("ug/m3")],
      plugins: [thresholdLinePlugin(UNHEALTHY_UGM3, UNHEALTHY_REFERENCE_LABEL, THRESHOLD_COLOR)],
    }),
    [height],
  );

  const containerRef = useUplot(options, data);

  return (
    <div style={panelStyle}>
      {isConstructed ? <div role="note" style={bannerStyle}>{CONSTRUCTED_SERIES_LABEL}</div> : null}
      <div ref={containerRef} />
    </div>
  );
}
