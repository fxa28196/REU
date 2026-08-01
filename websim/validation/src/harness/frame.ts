/**
 * frame.ts — the raw-text frame the ported gates read, with pandas semantics.
 *
 * `scripts/verify_E_runs.py` loads every output table as
 *
 * ```python
 * pd.read_csv(path, dtype=str, keep_default_na=False)
 * ```
 *
 * and the class docstring says why: *"'identical' means byte-identical field
 * text, not float-equal after two independent parses."* Two consequences the
 * port has to honour exactly:
 *
 *  1. **No type inference and no NA coercion.** An empty field stays the empty
 *     *string*; it never becomes `NaN`, `None`, `0` or `"nan"`. Every gate that
 *     wants a number asks for one explicitly through {@link RawFrame.num}.
 *  2. **The numeric view is `pd.to_numeric(col, errors="coerce")`** — empty and
 *     unparseable cells become `NaN`, and the gates then `.fillna(0)`. That
 *     "coerce, do not raise" behaviour is load-bearing: gate (l) sums counters
 *     over runs whose columns predate a block, and gate (f) reads barrier flags
 *     that are blank whenever the decision layer is off.
 *
 * Parsing itself is delegated to `@websim/pipeline/archive`'s `parseArchiveCsv`,
 * which already models the `OutcomeLogger` wire dialect (unquoted, CRLF, ragged
 * rows rejected). Having one parser in the tree is deliberate: a second one
 * would be a second place for the empty-vs-zero rule to drift.
 *
 * ── Divergence register (numeric coercion) ─────────────────────────────────
 *
 * `pd.to_numeric` additionally accepts a few tokens this port maps to `NaN`
 * instead: `inf` / `infinity` (pandas → ±∞), and PEP-515 underscore separators
 * such as `1_000` (pandas → 1000). Neither can appear in an archived output
 * file — `OutcomeLogger` emits `%d` / `%.Nf` / the empty string and writes the
 * empty string for every non-finite value (WP8-SPEC-archive-gates §1.5) — and
 * the difference is one-directional: this port turns an exotic token into
 * `NaN`, which `.fillna(0)` then reads as 0, exactly as it reads a blank. To
 * make sure the difference stays theoretical rather than silent,
 * {@link RawFrame.coercionLosses} counts the cells that were **non-empty and
 * still coerced to NaN**, and the archive suite asserts that count is zero
 * across every column the gates consume.
 */

import { parseArchiveCsv } from "@websim/pipeline/archive";

/**
 * A decimal literal in the shape `OutcomeLogger` can emit: optional sign,
 * digits with an optional fractional part (or a bare fractional part), optional
 * exponent. Deliberately narrower than `Number()`, which would accept `0x1f`,
 * `0b11`, `Infinity` and — worst of all — the empty string, which `Number("")`
 * reads as **0** where pandas reads NaN.
 */
const DECIMAL_LITERAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/u;

/**
 * `pd.to_numeric(value, errors="coerce")` for one cell.
 *
 * Leading and trailing whitespace is stripped first (pandas does the same);
 * everything that is not a decimal literal becomes `NaN`.
 */
export function toNumericCoerce(raw: string): number {
  const text = raw.trim();
  if (text === "" || !DECIMAL_LITERAL.test(text)) {
    return Number.NaN;
  }
  return Number(text);
}

/** `.fillna(fill)` over a coerced column. */
export function fillNa(values: readonly number[], fill = 0): readonly number[] {
  return values.map((v) => (Number.isNaN(v) ? fill : v));
}

export interface RawFrame {
  /** Human label used in error messages, e.g. `ER-A-n6842-seed42/agents.csv`. */
  readonly label: string;
  /** Column names in file order — the analogue of `list(df.columns)`. */
  readonly columns: readonly string[];
  /** Data rows, each with exactly `columns.length` raw cells. */
  readonly rows: readonly (readonly string[])[];
  has(column: string): boolean;
  /** Raw text of a column. Throws when absent, like pandas' `KeyError`. */
  column(column: string): readonly string[];
  /** `pd.to_numeric(df[col], errors="coerce")`. */
  num(column: string): readonly number[];
  /** `pd.to_numeric(df[col], errors="coerce").fillna(fill)`. */
  numFilled(column: string, fill?: number): readonly number[];
  /**
   * Cells in `column` that were **non-empty** yet still coerced to `NaN`. Zero
   * everywhere in the archive; a non-zero value means a token this port and
   * pandas may read differently, and the archive suite fails on it.
   */
  coercionLosses(column: string): number;
}

class Frame implements RawFrame {
  readonly #index: ReadonlyMap<string, number>;
  readonly #numCache = new Map<string, readonly number[]>();

  constructor(
    readonly label: string,
    readonly columns: readonly string[],
    readonly rows: readonly (readonly string[])[],
  ) {
    const index = new Map<string, number>();
    // Last wins, matching both pandas' duplicate-column handling for `df[name]`
    // on a de-duplicated frame and the archive reader's documented rule. No
    // archived output file has a duplicate header today.
    columns.forEach((name, i) => index.set(name, i));
    this.#index = index;
  }

  has(column: string): boolean {
    return this.#index.has(column);
  }

  #at(column: string): number {
    const i = this.#index.get(column);
    if (i === undefined) {
      throw new Error(
        `${this.label}: no column '${column}'; columns are [${this.columns.join(", ")}]`,
      );
    }
    return i;
  }

  column(column: string): readonly string[] {
    const i = this.#at(column);
    return this.rows.map((row) => row[i] ?? "");
  }

  num(column: string): readonly number[] {
    const hit = this.#numCache.get(column);
    if (hit !== undefined) {
      return hit;
    }
    const i = this.#at(column);
    const out = this.rows.map((row) => toNumericCoerce(row[i] ?? ""));
    this.#numCache.set(column, out);
    return out;
  }

  numFilled(column: string, fill = 0): readonly number[] {
    return fillNa(this.num(column), fill);
  }

  coercionLosses(column: string): number {
    const i = this.#at(column);
    let lost = 0;
    for (const row of this.rows) {
      const raw = (row[i] ?? "").trim();
      if (raw !== "" && Number.isNaN(toNumericCoerce(raw))) {
        lost += 1;
      }
    }
    return lost;
  }
}

/** Build a frame from raw CSV text (the archived `OutcomeLogger` dialect). */
export function readFrame(text: string, label: string): RawFrame {
  const table = parseArchiveCsv(text, label);
  return new Frame(label, table.header, table.rows);
}

/** Build a frame from already-split cells — used by the corrosion fixtures. */
export function frameOf(
  label: string,
  columns: readonly string[],
  rows: readonly (readonly string[])[],
): RawFrame {
  for (const [i, row] of rows.entries()) {
    if (row.length !== columns.length) {
      throw new Error(
        `${label}: row ${i + 1} has ${row.length} field(s), header has ${columns.length}`,
      );
    }
  }
  return new Frame(label, columns, rows);
}

/** Mean of a numeric column view — `Series.mean()`, NaN over an empty frame. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  let total = 0;
  for (const v of values) {
    total += v;
  }
  return total / values.length;
}

/** Sum of a numeric column view — `Series.sum()`, 0 over an empty frame. */
export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    total += v;
  }
  return total;
}
