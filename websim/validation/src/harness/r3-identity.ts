/**
 * r3-identity.ts — the Tier-2 R3 identity comparator.
 *
 * Source: `scripts/verify_E_runs.py`, `compare_table()` (lines 249–337) and
 * `check_r3()` (lines 340–387). Spec: `WP8-SPEC-archive-gates.md` §2, and
 * `IMPLEMENTATION_PLAN.md` §5.1 Tier 2 ("shared-column projection
 * byte-identical under `verify_E_runs.py` (a) exclusion discipline — excluding
 * only sim_id/commit/wallclock and never the `*_local` columns").
 *
 * ── What is being proved ───────────────────────────────────────────────────
 *
 * The E0-null configuration turns the decision layer ON with every mechanism
 * degenerate (aware = 1, L0, latch departure, sigma = 0, barriers = 0, pets
 * admitted), so it must reproduce a no-layer run **by construction**. The proof
 * is a byte comparison of the two `agents.csv` files over every column they
 * share, plus the same for `shelters.csv`, plus a census cross-check. If the
 * layer is doing anything at all in its degenerate configuration, this goes
 * red.
 *
 * ── The four rules a paraphrase would break ────────────────────────────────
 *
 *  1. **Raw text, never numbers.** Both frames are loaded with
 *     `dtype=str, keep_default_na=False` and compared as strings. The
 *     docstring is explicit: *"'identical' means byte-identical field text, not
 *     float-equal after two independent parses."* Comparing parsed doubles
 *     would accept `54002.8192` against `54002.81920000001`.
 *  2. **Only two columns are excluded by name.** `sim_id` (a wall-clock stamp)
 *     and `commit` (HEAD at run time), plus anything a future writer names with
 *     a wall-clock-shaped token ({@link WALLCLOCK_RE}). `random_seed` and
 *     `data_version` **are** compared. So are `time_started_local` and
 *     `time_arrived_local` — the source comment calls them *"sim-clock instants
 *     derived from the tick and the smoke-field anchor, i.e. outcomes, and they
 *     are among the sharpest identity evidence available."* The operator
 *     exclusion set exists but its help text says *"every exclusion weakens the
 *     proof"*, and WP8 ships the gate with it **empty**.
 *  3. **Row order is not compared, keys are joined.** `order` is taken from the
 *     null frame and both sides are re-indexed onto it. Within-tick agent order
 *     is a declared divergence (README divergence 2); it must not be able to
 *     fail an identity proof, and it must not be able to hide one either —
 *     which is why the key sets are required to match exactly first.
 *  4. **The verdict is `digest equal AND no differing column`.** Not either.
 *     Two independent statements of the same fact, so a bug in one cannot pass
 *     the gate on its own.
 *
 * ── The digest's line terminator ───────────────────────────────────────────
 *
 * `sha256(A.to_csv(index=False))` inherits pandas' default `lineterminator`,
 * which is `os.linesep` — CRLF on the Windows machine every archived R3 proof
 * was produced on. {@link DEFAULT_LINE_TERMINATOR} is therefore CRLF, and the
 * archive suite asserts the port reproduces the exact SHA-256s recorded in
 * `WP8-SPEC-archive-gates.md` §2.5. That is a real oracle: those digests come
 * from the certified Python, not from this code.
 *
 * The *verdict* does not depend on the choice — both sides are serialised the
 * same way — so the terminator is a parameter rather than a hazard, and it is
 * spelled out rather than inherited from whatever platform the port runs on.
 * Emitting CRLF from Node on Linux is the whole point: the digest has to be a
 * property of the data, not of the runner.
 */

import { sha256Hex } from "@websim/pipeline/archive";

import type { Checks } from "./checks.js";
import {
  E_AGENT_COLS,
  E_SHELTER_COLS,
  IDENTITY_EXCLUDE,
  R3_POPULATION_KEYS,
  SE_AGENT_COLS,
  WALLCLOCK_RE,
} from "./constants.js";
import { sum, type RawFrame } from "./frame.js";
import { pyIntOfFloat, showValue, type RunView } from "./run-view.js";

/** pandas' `to_csv` default on the platform every archived proof ran on. */
export const DEFAULT_LINE_TERMINATOR = "\r\n";

/**
 * `DataFrame.to_csv(index=False)` for a projection of raw-text cells.
 *
 * pandas writes QUOTE_MINIMAL, i.e. it quotes a field only when it contains the
 * delimiter, the quote character or the line terminator. The archived output
 * dialect can contain none of those — `OutcomeLogger.csv()` replaces commas
 * with spaces and never emits a quote, and the archive reader rejects a file
 * that does — so no field is ever quoted and a plain join is exact. The guard
 * below turns that reasoning into an assertion instead of a comment.
 */
export function pandasToCsv(
  columns: readonly string[],
  rows: readonly (readonly string[])[],
  lineTerminator: string = DEFAULT_LINE_TERMINATOR,
): string {
  const needsQuoting = (cell: string): boolean =>
    cell.includes(",") || cell.includes('"') || cell.includes("\n") || cell.includes("\r");
  const out: string[] = [columns.join(",")];
  for (const row of rows) {
    for (const cell of row) {
      if (needsQuoting(cell)) {
        throw new Error(
          `to_csv: cell ${JSON.stringify(cell)} would need QUOTE_MINIMAL quoting; the ` +
            "archived output dialect cannot produce one, so this is a reader bug, not a " +
            "dialect to guess at.",
        );
      }
    }
    out.push(row.join(","));
  }
  return `${out.join(lineTerminator)}${lineTerminator}`;
}

export interface ColumnDiff {
  readonly column: string;
  readonly differingRows: number;
}

export interface CompareTableResult {
  /** Shared columns actually compared, in the null frame's column order. */
  readonly columns: readonly string[];
  /** Columns present only in the null / only in the reference. */
  readonly onlyNull: readonly string[];
  readonly onlyRef: readonly string[];
  /** Keys compared, in the null frame's row order. */
  readonly keys: readonly string[];
  readonly shaNull: string;
  readonly shaRef: string;
  readonly perColumn: readonly ColumnDiff[];
  /** `ok = (ha == hb) and not per_col`. */
  readonly identical: boolean;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function padLeft(text: string, width: number): string {
  return text.length >= width ? text : " ".repeat(width - text.length) + text;
}

/** Python's `repr()` of a string, as the diagnostic lines print it. */
function repr(text: string): string {
  return `'${text.replace(/\\/gu, "\\\\").replace(/'/gu, "\\'")}'`;
}

/**
 * Byte-compare two output tables on the columns they share.
 *
 * Registers between one and four checks, exactly as the Python does: the
 * column-set delta, key uniqueness, key-set equality, and the projection
 * identity — with early returns that skip the later ones when an earlier one
 * makes them meaningless.
 *
 * Returns `null` when the comparison could not be reached.
 */
export function compareTable(
  ck: Checks,
  label: string,
  nullDf: RawFrame,
  refDf: RawFrame,
  key: string,
  eOnlyCols: readonly string[],
  extraExclude: ReadonlySet<string>,
  lineTerminator: string = DEFAULT_LINE_TERMINATOR,
): CompareTableResult | null {
  const nullCols = nullDf.columns;
  const refCols = refDf.columns;
  const refSet = new Set(refCols);
  const nullSet = new Set(nullCols);
  const onlyNull = nullCols.filter((c) => !refSet.has(c));
  const onlyRef = refCols.filter((c) => !nullSet.has(c));

  const allowed = new Set(eOnlyCols);
  const okCols = onlyRef.length === 0 && onlyNull.every((c) => allowed.has(c));
  ck.add(
    `(a) ${label}: column-set delta is only the Phase-E block`,
    okCols,
    `null-only=${onlyNull.length > 0 ? JSON.stringify(onlyNull) : "[]"} ` +
      `ref-only=${onlyRef.length > 0 ? JSON.stringify(onlyRef) : "[]"}`,
  );

  const shared = nullCols.filter((c) => refSet.has(c));
  const excluded = shared.filter(
    (c) => IDENTITY_EXCLUDE.has(c) || extraExclude.has(c) || WALLCLOCK_RE.test(c),
  );
  const excludedSet = new Set(excluded);
  const cols = shared.filter((c) => !excludedSet.has(c));
  if (!cols.includes(key)) {
    ck.add(
      `(a) ${label}: key column '${key}' present and comparable`,
      false,
      `'${key}' missing from the shared projection`,
    );
    return null;
  }
  ck.observe(
    `comparing ${cols.length} shared columns; excluded as run-identity: ` +
      `${excluded.length > 0 ? JSON.stringify(excluded) : "[]"}`,
  );

  const nullKeys = nullDf.column(key);
  const refKeys = refDf.column(key);
  const dupN = nullKeys.length - new Set(nullKeys).size;
  const dupR = refKeys.length - new Set(refKeys).size;
  if (dupN > 0 || dupR > 0) {
    ck.add(
      `(a) ${label}: ${key} is unique on both sides`,
      false,
      `duplicates null=${dupN} ref=${dupR}`,
    );
    return null;
  }
  ck.add(
    `(a) ${label}: ${key} is unique on both sides`,
    true,
    `null=${nullDf.rows.length} rows, ref=${refDf.rows.length} rows`,
  );

  const nset = new Set(nullKeys);
  const rset = new Set(refKeys);
  const missing = [...rset].filter((k) => !nset.has(k)).sort();
  const extra = [...nset].filter((k) => !rset.has(k)).sort();
  ck.add(
    `(a) ${label}: ${key} sets match`,
    missing.length === 0 && extra.length === 0,
    `in ref only=${missing.length} (${JSON.stringify(missing.slice(0, 3))}), ` +
      `in null only=${extra.length} (${JSON.stringify(extra.slice(0, 3))})`,
  );

  const order = nullKeys.filter((k) => rset.has(k));
  if (order.length === 0) {
    ck.add(
      `(a) ${label}: shared-projection byte-identity`,
      false,
      "no common keys to compare",
    );
    return null;
  }

  const project = (frame: RawFrame, keys: readonly string[]): (readonly string[])[] => {
    const byKey = new Map<string, readonly string[]>();
    const keyIdx = frame.columns.indexOf(key);
    for (const row of frame.rows) {
      byKey.set(row[keyIdx] ?? "", row);
    }
    const colIdx = cols.map((c) => frame.columns.indexOf(c));
    return keys.map((k) => {
      const row = byKey.get(k);
      if (row === undefined) {
        throw new Error(`${label}: key ${k} vanished between the key-set check and the join`);
      }
      return colIdx.map((i) => row[i] ?? "");
    });
  };

  const a = project(nullDf, order);
  const b = project(refDf, order);

  const perColumn: ColumnDiff[] = [];
  const masks = new Map<string, boolean[]>();
  for (const [ci, column] of cols.entries()) {
    const mask: boolean[] = [];
    let n = 0;
    for (let r = 0; r < order.length; r += 1) {
      const differs = (a[r] as readonly string[])[ci] !== (b[r] as readonly string[])[ci];
      mask.push(differs);
      if (differs) n += 1;
    }
    if (n > 0) {
      perColumn.push({ column, differingRows: n });
      masks.set(column, mask);
    }
  }

  const shaNull = sha256Hex(pandasToCsv(cols, a, lineTerminator));
  const shaRef = sha256Hex(pandasToCsv(cols, b, lineTerminator));
  const lines = [`sha256(null projection) = ${shaNull}`, `sha256(ref  projection) = ${shaRef}`];

  if (perColumn.length > 0) {
    lines.push(
      `${perColumn.length} of ${cols.length} shared columns differ ` +
        `(rows compared: ${order.length}):`,
    );
    const ranked = [...perColumn].sort(
      (x, y) => y.differingRows - x.differingRows || (x.column < y.column ? -1 : 1),
    );
    for (const d of ranked.slice(0, 20)) {
      lines.push(`  ${pad(d.column, 32)} ${padLeft(String(d.differingRows), 6)} differing rows`);
    }
    if (ranked.length > 20) {
      lines.push(`  ... and ${ranked.length - 20} more columns`);
    }

    // The first five DISTINCT keys that differ, each with the columns that
    // differ on that row and both values. A bare FAIL is useless for debugging,
    // and a gate nobody can act on is a gate somebody will disable.
    const anyRow: boolean[] = new Array<boolean>(order.length).fill(false);
    for (const mask of masks.values()) {
      for (let r = 0; r < order.length; r += 1) {
        if (mask[r] === true) anyRow[r] = true;
      }
    }
    const badRows: number[] = [];
    let totalBad = 0;
    for (let r = 0; r < order.length; r += 1) {
      if (anyRow[r] === true) {
        totalBad += 1;
        if (badRows.length < 5) badRows.push(r);
      }
    }
    lines.push(`first ${badRows.length} differing ${key}s (of ${totalBad}):`);
    for (const r of badRows) {
      const badCols = cols.filter((c) => masks.get(c)?.[r] === true);
      lines.push(`  ${order[r]}  (${badCols.length} column(s) differ)`);
      for (const c of badCols.slice(0, 6)) {
        const ci = cols.indexOf(c);
        lines.push(
          `      ${pad(c, 30)} null=${pad(repr((a[r] as readonly string[])[ci] ?? ""), 22)} ` +
            `ref=${repr((b[r] as readonly string[])[ci] ?? "")}`,
        );
      }
      if (badCols.length > 6) {
        lines.push(`      ... and ${badCols.length - 6} more columns on this row`);
      }
    }
  }

  const identical = shaNull === shaRef && perColumn.length === 0;
  ck.add(
    `(a) ${label}: shared-projection byte-identity`,
    identical,
    `${cols.length} cols x ${order.length} rows`,
    lines,
  );

  return { columns: cols, onlyNull, onlyRef, keys: order, shaNull, shaRef, perColumn, identical };
}

export interface R3Result {
  readonly agents: CompareTableResult | null;
  readonly shelters: CompareTableResult | null;
}

/**
 * Gate (a) in full: both table comparisons, the all-zero counter requirement,
 * the population census on the shared keys, `population.unaware == 0`, and zero
 * policy refusals.
 *
 * `extraExclude` defaults to EMPTY and should stay that way — the Python's
 * `--exclude-col` help text says *"Use only with a written justification —
 * every exclusion weakens the proof."*
 */
export function checkR3(
  ck: Checks,
  nullRun: RunView,
  refRun: RunView,
  extraExclude: ReadonlySet<string> = new Set(),
  lineTerminator: string = DEFAULT_LINE_TERMINATOR,
): R3Result {
  // The archive predates BOTH appended blocks: the six Phase-E attribute
  // columns AND the four Scenario-E counters, so the null may carry all ten as
  // null-only columns. The counters must additionally be all-zero in the null
  // (checked below) or the exclusion would hide live obstacle activity.
  const agents = compareTable(
    ck,
    "agents.csv",
    nullRun.agents,
    refRun.agents,
    "agent_id",
    [...E_AGENT_COLS, ...SE_AGENT_COLS],
    extraExclude,
    lineTerminator,
  );
  const shelters = compareTable(
    ck,
    "shelters.csv",
    nullRun.shelters,
    refRun.shelters,
    "shelter_id",
    E_SHELTER_COLS,
    extraExclude,
    lineTerminator,
  );

  const present = SE_AGENT_COLS.filter((c) => nullRun.agents.has(c));
  if (present.length > 0) {
    const tot = Math.trunc(
      present.reduce((acc, c) => acc + sum(nullRun.agents.numFilled(c)), 0),
    );
    ck.add(
      "(a) null run has all-zero Scenario-E counters",
      tot === 0,
      `sum over ${JSON.stringify(present)} = ${tot}`,
    );
  } else {
    ck.skip(
      "(a) null run has all-zero Scenario-E counters",
      "agents.csv predates the Scenario-E counter block",
    );
  }

  // simulation.json population census, shared keys only.
  const np = nullRun.population;
  const rp = refRun.population;
  const bad = R3_POPULATION_KEYS.filter((k) => !samePopulationValue(np[k], rp[k]));
  ck.add(
    "(a) simulation.json population census identical on shared keys",
    bad.length === 0,
    bad.length > 0
      ? bad.map((k) => `${k}: null=${showValue(np[k])} ref=${showValue(rp[k])}`).join("; ")
      : R3_POPULATION_KEYS.map((k) => `${k}=${showValue(np[k])}`).join(" "),
  );

  if (!("unaware" in np)) {
    ck.add(
      "(a) null run reports population.unaware == 0",
      false,
      "manifest has no population.unaware key (pre-Phase-E writer?)",
    );
  } else {
    ck.add(
      "(a) null run reports population.unaware == 0",
      pyIntOfFloat(np["unaware"], "population.unaware") === 0,
      `unaware=${showValue(np["unaware"])}`,
    );
  }

  // The pet / adults-only gates must be completely inert in the null.
  if (nullRun.shelters.has("policy_refused")) {
    const tot = Math.trunc(sum(nullRun.shelters.numFilled("policy_refused")));
    ck.add("(a) null run has zero policy refusals", tot === 0, `sum(policy_refused)=${tot}`);
  } else {
    ck.skip("(a) null run has zero policy refusals", "shelters.csv has no policy_refused column");
  }

  return { agents, shelters };
}

/**
 * `np_.get(k) != rp.get(k)` with Python's `==`: JSON numbers compare
 * numerically, absence equals absence, and a number never equals a string.
 */
function samePopulationValue(a: unknown, b: unknown): boolean {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  if (typeof a === "number" && typeof b === "number") {
    return a === b;
  }
  return JSON.stringify(a) === JSON.stringify(b) && typeof a === typeof b;
}
