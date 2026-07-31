/**
 * csv.ts — raw-text reader for archived `agents.csv` / `shelters.csv`.
 *
 * This is NOT the CsvLoader port (that lives in `engine/src/loader` and models
 * the model's *input* dialect, PORT_MAP §4.2). This reads the model's *output*
 * dialect, which the Java `OutcomeLogger` writes and which is much narrower:
 *
 *   - CRLF line terminators (`%n` on Windows), UTF-8, no BOM in practice;
 *   - **no quoting at all** — `OutcomeLogger.csv()` replaces commas with spaces
 *     instead of quoting (PORT_MAP §5.1), so a bare `split(",")` is exact;
 *   - empty-vs-zero is meaningful (`""` ticks, `""` capacity = unlimited), so
 *     fields are never coerced, trimmed, or NA-mapped.
 *
 * Verified against the whole archive before this reader was written: 290/290
 * CSV files are CRLF and 0/290 contain a double quote.
 *
 * Keeping the cells as raw strings is not laziness — the gate suite defines
 * identity on raw text (`dtype=str, keep_default_na=False`, PORT_MAP §6.2), and
 * every hash in `golden-summaries/` is a hash of archive bytes rather than of a
 * re-formatted parse. Numeric views are opt-in via `numberAt`.
 */

export interface ArchiveTable {
  /** Header cells in file order. */
  readonly header: readonly string[];
  /** Data rows, each with exactly `header.length` raw cells. */
  readonly rows: readonly (readonly string[])[];
  /** Column index, or -1 when the column is absent from this run's schema. */
  index(name: string): number;
  has(name: string): boolean;
  /** Column index; throws when absent. Use when absence is a bug, not a variant. */
  requireIndex(name: string): number;
}

class Table implements ArchiveTable {
  readonly #byName: ReadonlyMap<string, number>;

  constructor(
    readonly header: readonly string[],
    readonly rows: readonly (readonly string[])[],
    readonly label: string,
  ) {
    const byName = new Map<string, number>();
    header.forEach((name, i) => {
      // Duplicate header names: last wins, matching CsvLoader's documented
      // dup-header behaviour (PORT_MAP §4.2 / risk R11). No archived output
      // file has duplicates today; the rule is written down so a future one
      // cannot resolve silently the other way.
      byName.set(name, i);
    });
    this.#byName = byName;
  }

  index(name: string): number {
    return this.#byName.get(name) ?? -1;
  }

  has(name: string): boolean {
    return this.#byName.has(name);
  }

  requireIndex(name: string): number {
    const i = this.index(name);
    if (i < 0) {
      throw new Error(
        `${this.label}: required column '${name}' is absent; header is [${this.header.join(", ")}]`,
      );
    }
    return i;
  }
}

/**
 * Parse an archived output CSV.
 *
 * Throws on a ragged row rather than padding or truncating: a field-count
 * mismatch means either the append-only column contract (PORT_MAP §5) was
 * broken or a value contained an unescaped comma, and both would silently shift
 * every downstream column if absorbed.
 */
export function parseArchiveCsv(text: string, label = "archive csv"): ArchiveTable {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (body.includes('"')) {
    throw new Error(
      `${label}: contains a double quote; the archived output dialect is unquoted ` +
        "(OutcomeLogger.csv() strips commas). Refusing to guess an escaping rule.",
    );
  }
  const lines = body.split(/\r\n|\n/u);
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  if (lines.length === 0) {
    throw new Error(`${label}: file is empty`);
  }
  const header = (lines[0] as string).split(",");
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = (lines[i] as string).split(",");
    if (cells.length !== header.length) {
      throw new Error(
        `${label}: line ${i + 1} has ${cells.length} field(s), header has ${header.length}`,
      );
    }
    rows.push(cells);
  }
  return new Table(header, rows, label);
}

/** Raw cell, or `""` when the column is absent from this run's schema. */
export function cell(table: ArchiveTable, row: readonly string[], name: string): string {
  const i = table.index(name);
  return i < 0 ? "" : (row[i] ?? "");
}

/**
 * Numeric view of a cell. `""` maps to `null` (empty is meaningful and is never
 * zero, PORT_MAP §5.1), anything unparseable throws.
 */
export function numberAt(row: readonly string[], index: number, label: string): number | null {
  const raw = row[index] ?? "";
  if (raw === "") {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${label}: cell '${raw}' at column ${index} is not a finite number`);
  }
  return value;
}
