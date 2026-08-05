/**
 * DataTable.tsx — the plan's "charts with data-table toggles" (WP13, §6.7).
 *
 * Every chart renders a `DataTableToggle` under it: a real `<button>` with
 * `aria-expanded`/`aria-controls` that reveals the SAME numbers the canvas
 * draws, as a real `<table>` with a `<caption>`, `scope="col"` column headers
 * and a `scope="row"` hour header per row — a screen-reader- and
 * keyboard-first alternative to the uPlot canvas.
 *
 * The table content comes from the pure model builders below
 * ({@link censusTableModel}, {@link smokeTableModel}), tested in Node
 * (`app/test/a11y.test.ts`). Honesty: a NaN cell renders {@link MISSING_CELL}
 * ("missing") — a hole in the data is a hole in the table, never a 0 — and an
 * empty series renders an honest empty sentence instead of an empty table.
 */

import { useId, useState } from "react";
import type { ReactElement } from "react";

import { STATES } from "@websim/engine/agents";

import { ScrollRegion } from "./ScrollRegion.js";
import type { MetricSeries } from "../state/stream.js";

// ---------------------------------------------------------------------------
// Pure table models
// ---------------------------------------------------------------------------

/** Cell text for a missing (NaN) value — a gap, never a fabricated number. */
export const MISSING_CELL = "missing";

/** A rendered table: header row + body rows, all pre-formatted strings. */
export interface TableModel {
  /** Column headers; column 0 is the row-header column ("Hour"). */
  readonly columns: readonly string[];
  /** Body rows, index-parallel to `columns`. */
  readonly rows: readonly (readonly string[])[];
}

function cellText(value: number | undefined, fractionDigits = 0): string {
  const v = value ?? Number.NaN;
  if (!Number.isFinite(v)) {
    return MISSING_CELL;
  }
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
}

/**
 * Table model for the state-census chart: one row per metric hour, one column
 * per agent state in the engine's `STATES` order — the de-stacked (true)
 * per-state counts, exactly the numbers the chart's bands encode.
 */
export function censusTableModel(
  series: Pick<MetricSeries, "hours" | "stateCensus">,
): TableModel {
  const columns = ["Hour", ...STATES];
  const rows = series.hours.map((hour, h) => [
    cellText(hour),
    ...STATES.map((_state, s) => cellText(series.stateCensus[s]?.[h])),
  ]);
  return { columns, rows };
}

/**
 * Table model for the smoke strip: one row per metric hour with the ambient
 * concentration in ug/m3 (one decimal). NaN renders as {@link MISSING_CELL} —
 * the same hours the chart renders as gaps.
 */
export function smokeTableModel(
  series: Pick<MetricSeries, "hours" | "smokeUgM3">,
): TableModel {
  const columns = ["Hour", "PM2.5 ug/m3"];
  const rows = series.hours.map((hour, h) => [
    cellText(hour),
    cellText(series.smokeUgM3[h], 1),
  ]);
  return { columns, rows };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export interface DataTableProps {
  /** The `<caption>` text — names the table for AT context menus. */
  readonly caption: string;
  readonly model: TableModel;
}

/** The bare table (caption, scoped headers, scrollable wrap). */
export function DataTable({ caption, model }: DataTableProps): ReactElement {
  return (
    <table className="data-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {model.columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {model.rows.map((row, r) => (
          <tr key={row[0] ?? r}>
            <th scope="row">{row[0]}</th>
            {row.slice(1).map((cell, c) => (
              <td key={c}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface DataTableToggleProps {
  /** Short chart name for the button label, e.g. "state census". */
  readonly chartName: string;
  readonly caption: string;
  readonly model: TableModel;
}

/**
 * The per-chart toggle: `aria-expanded` button + an always-present (hidden
 * when collapsed) region carrying the table, so `aria-controls` always
 * references a real element.
 */
export function DataTableToggle({ chartName, caption, model }: DataTableToggleProps): ReactElement {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  return (
    <div>
      <button
        type="button"
        className="data-table-toggle"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? `Hide ${chartName} data table` : `View ${chartName} as data table`}
      </button>
      {/* ScrollRegion, not a div: `.data-table-wrap` scrolls and holds no
          focusable content, so without a tab stop a keyboard-only user could
          open the table and then not be able to scroll it (axe
          `scrollable-region-focusable`, WCAG 2.1.1). */}
      <ScrollRegion
        id={regionId}
        hidden={!open}
        label={`${chartName} data table`}
        className="data-table-wrap"
      >
        {model.rows.length === 0 ? (
          <p className="panel-sub">
            No rows yet — press Play to run this configuration; the table fills as hourly
            metrics arrive.
          </p>
        ) : (
          <DataTable caption={caption} model={model} />
        )}
      </ScrollRegion>
    </div>
  );
}
