/**
 * `OccupancyPanel` — compact per-shelter occupancy readout: name, `occ/cap`
 * text, and a fraction bar. Plain HTML/CSS (no uPlot).
 *
 * - Rows are sorted by capacity DESCENDING via `transforms.occupancyRows`
 *   (stable, deterministic — display order is a pure function of the shelters
 *   array).
 * - The `occ/cap` TEXT is the accessible data carrier; the bar is decorative
 *   (`aria-hidden`). Identity is never color-alone.
 * - Missing occupancy (NaN) shows "--" and draws no bar — missing renders as
 *   missing, never as zero.
 */

import type { CSSProperties, ReactElement } from "react";

import { fractionBarWidthPct, occupancyRows } from "./transforms";
import type { OccupancyRow, ShelterInfo } from "./transforms";
import { CHART_FONT, CHART_MUTED, CHART_PANEL_BG, CHART_TEXT } from "./useUplot";

/** Bar fill while beds remain — Okabe-Ito blue. */
export const OCCUPANCY_BAR_COLOR = "#0072B2";

/** Bar fill at/over capacity — Okabe-Ito vermillion (paired with the ≥100% text). */
export const OCCUPANCY_FULL_COLOR = "#D55E00";

/** True when the row should wear the at-capacity color. */
export function isAtCapacity(row: Pick<OccupancyRow, "fraction">): boolean {
  return Number.isFinite(row.fraction) && row.fraction >= 1;
}

export interface OccupancyPanelProps {
  /** Per-shelter headcounts, indexed parallel to `shelters` (worker frame layout). */
  readonly occupancy: Int32Array;
  readonly shelters: readonly ShelterInfo[];
}

const panelStyle: CSSProperties = {
  background: CHART_PANEL_BG,
  color: CHART_TEXT,
  font: CHART_FONT,
  borderRadius: 6,
  padding: 8,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const nameStyle: CSSProperties = {
  flex: "0 0 40%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const countStyle: CSSProperties = {
  flex: "0 0 auto",
  minWidth: 64,
  textAlign: "right",
  color: CHART_MUTED,
  fontVariantNumeric: "tabular-nums",
};

const trackStyle: CSSProperties = {
  flex: "1 1 auto",
  height: 8,
  borderRadius: 4,
  background: "rgba(154, 162, 171, 0.18)",
  overflow: "hidden",
};

export function OccupancyPanel({ occupancy, shelters }: OccupancyPanelProps): ReactElement {
  const rows = occupancyRows(occupancy, shelters);
  return (
    <div style={panelStyle}>
      {rows.map((row, i) => {
        const widthPct = fractionBarWidthPct(row.fraction);
        const fillStyle: CSSProperties = {
          height: "100%",
          borderRadius: 4,
          width: `${widthPct}%`,
          background: isAtCapacity(row) ? OCCUPANCY_FULL_COLOR : OCCUPANCY_BAR_COLOR,
        };
        return (
          <div key={`${i}-${row.name}`} style={rowStyle}>
            <span style={nameStyle} title={row.name}>
              {row.name}
            </span>
            <span style={countStyle}>
              {Number.isNaN(row.occupancy) ? "--" : row.occupancy}/{row.capacity}
            </span>
            <div style={trackStyle} aria-hidden="true">
              <div style={fillStyle} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
