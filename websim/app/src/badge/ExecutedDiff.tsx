/**
 * Configured-vs-executed diff view (plan §5.4 supporting evidence).
 *
 * Shows ONLY the parameters whose executed value differs from the configured
 * one. Any non-empty diff means the run cannot support the configured claim —
 * the badge machine independently derives INVALID from the same signal
 * (`executedDiffersFromConfigured`), and this view is where the user sees why.
 *
 * `diffParams` is the pure, tested core; the component only renders its rows.
 */
import type { CSSProperties, ReactElement } from "react";

/** One differing parameter. `null` marks a key missing on that side. */
export interface ParamDiffRow {
  readonly name: string;
  readonly configured: number | null;
  readonly executed: number | null;
}

/**
 * Pure diff of two parameter records. A key present on only one side counts
 * as differing (the missing side is `null`). Rows are sorted by name so the
 * displayed order is a deterministic function of the inputs — never of object
 * or collection iteration order. Value equality is `Object.is`, so NaN equals
 * itself and +0 / -0 are treated as different values.
 */
export function diffParams(
  configured: Record<string, number>,
  executed: Record<string, number>,
): ParamDiffRow[] {
  const names: string[] = Object.keys(configured);
  for (const name of Object.keys(executed)) {
    if (!Object.prototype.hasOwnProperty.call(configured, name)) {
      names.push(name);
    }
  }
  names.sort();

  const rows: ParamDiffRow[] = [];
  for (const name of names) {
    const c = configured[name];
    const e = executed[name];
    const differs = c === undefined || e === undefined || !Object.is(c, e);
    if (differs) {
      rows.push({
        name,
        configured: c === undefined ? null : c,
        executed: e === undefined ? null : e,
      });
    }
  }
  return rows;
}

/** Banner shown whenever the diff is non-empty. Wording pinned by tests. */
export const EXECUTED_DIFF_BANNER =
  "The engine executed different values than configured - results are INVALID for the configured claim." as const;

/** Empty-state line, e.g. "Executed = configured (41/41 params)". */
export function executedDiffEmptyLine(paramCount: number): string {
  return `Executed = configured (${paramCount}/${paramCount} params)`;
}

/** `null` (missing key) renders as an explicit gap, never as a number. */
export function formatParamValue(value: number | null): string {
  return value === null ? "(missing)" : String(value);
}

export interface ExecutedDiffProps {
  readonly configured: Record<string, number>;
  readonly executed: Record<string, number>;
}

const emptyStyle: CSSProperties = {
  color: "#9aa2ab",
  fontSize: "0.85rem",
  margin: 0,
};

const bannerStyle: CSSProperties = {
  background: "#D55E00",
  color: "#14161a",
  fontWeight: 700,
  padding: "8px 12px",
  borderRadius: 4,
  marginBottom: 8,
};

const tableStyle: CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
  color: "#e6e8eb",
  fontSize: "0.85rem",
};

const headCellStyle: CSSProperties = {
  textAlign: "left",
  color: "#9aa2ab",
  fontWeight: 600,
  padding: "4px 12px 4px 0",
  borderBottom: "1px solid #2a2e35",
};

const cellStyle: CSSProperties = {
  padding: "4px 12px 4px 0",
  borderBottom: "1px solid #2a2e35",
  fontVariantNumeric: "tabular-nums",
};

const executedCellStyle: CSSProperties = {
  ...cellStyle,
  color: "#D55E00",
  fontWeight: 700,
};

export function ExecutedDiff({ configured, executed }: ExecutedDiffProps): ReactElement {
  const rows = diffParams(configured, executed);
  if (rows.length === 0) {
    return <p style={emptyStyle}>{executedDiffEmptyLine(Object.keys(configured).length)}</p>;
  }
  return (
    <div>
      <div role="alert" style={bannerStyle}>
        {EXECUTED_DIFF_BANNER}
      </div>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={headCellStyle}>Parameter</th>
            <th style={headCellStyle}>Configured</th>
            <th style={headCellStyle}>Executed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td style={cellStyle}>{row.name}</td>
              <td style={cellStyle}>{formatParamValue(row.configured)}</td>
              <td style={executedCellStyle}>{formatParamValue(row.executed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
