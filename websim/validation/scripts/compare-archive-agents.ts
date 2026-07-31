/**
 * Tier-4 census: per-column byte agreement between a TS `agents.csv` and an
 * archived Java one (plan §5.1 Tier 4).
 *
 * Identity is defined on **raw text**, exactly as `verify_E_runs` defines it —
 * so this compares the characters the two writers emitted, not two parsed
 * floats that happen to be close. Environment columns (`sim_id`, `commit`,
 * `data_version`) are excluded because they are wall-clock and git facts, not
 * model output; **nothing else** is excluded, and in particular the `*_local`
 * timestamp columns are compared, because the R3 exclusion discipline
 * explicitly refuses to exempt them.
 *
 * ```
 * npx tsx validation/scripts/compare-archive-agents.ts <ts.csv> <java.csv>
 * ```
 *
 * The output is a census, not a verdict. Arm A's within-tick agent order is the
 * one declared Java-vs-TS divergence channel (plan §9.2 divergence 1) and arm A
 * is precisely where capacity binds, so per-row disagreement in *who* got a bed
 * is expected there and is what this census is for: it separates "rows that
 * differ because a different resident was admitted" from "rows that differ for a
 * reason nobody declared", which is release-blocking.
 */

import { readFileSync } from "node:fs";

const EXCLUDED = new Set(["sim_id", "commit", "data_version"]);

function readCsv(path: string): { header: string[]; rows: Map<string, string[]> } {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0]!.split(",");
  const rows = new Map<string, string[]>();
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(",");
    rows.set(cells[0]!, cells);
  }
  return { header, rows };
}

function main(): void {
  const [tsPath, javaPath] = process.argv.slice(2);
  if (tsPath === undefined || javaPath === undefined) {
    throw new Error("usage: compare-archive-agents.ts <ts.csv> <java.csv>");
  }
  const ts = readCsv(tsPath);
  const ja = readCsv(javaPath);

  const shared = ts.header.filter((h) => ja.header.includes(h) && !EXCLUDED.has(h));
  const tsIdx = new Map(ts.header.map((h, i) => [h, i]));
  const jaIdx = new Map(ja.header.map((h, i) => [h, i]));

  const keysEqual =
    ts.rows.size === ja.rows.size && [...ts.rows.keys()].every((k) => ja.rows.has(k));
  console.log(`rows: ts=${ts.rows.size} java=${ja.rows.size} key sets equal=${keysEqual}`);
  console.log(
    `columns: ts=${ts.header.length} java=${ja.header.length} shared(compared)=${shared.length}`,
  );
  console.log(`ts-only columns: ${ts.header.filter((h) => !ja.header.includes(h)).join(", ")}`);

  const mismatchByCol = new Map<string, number>();
  let rowsFullyEqual = 0;
  for (const [key, tsCells] of ts.rows) {
    const jaCells = ja.rows.get(key);
    if (jaCells === undefined) {
      continue;
    }
    let rowEqual = true;
    for (const col of shared) {
      if (tsCells[tsIdx.get(col)!] !== jaCells[jaIdx.get(col)!]) {
        mismatchByCol.set(col, (mismatchByCol.get(col) ?? 0) + 1);
        rowEqual = false;
      }
    }
    if (rowEqual) {
      rowsFullyEqual++;
    }
  }

  console.log(
    `\nrows byte-identical across all ${shared.length} shared columns: ` +
      `${rowsFullyEqual} / ${ts.rows.size} (${((100 * rowsFullyEqual) / ts.rows.size).toFixed(2)}%)`,
  );
  console.log("\ncolumn                            mismatched rows");
  for (const col of shared) {
    const n = mismatchByCol.get(col) ?? 0;
    console.log(`${col.padEnd(34)}${n}`);
  }
}

main();
