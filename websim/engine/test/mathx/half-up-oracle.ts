/**
 * Loader for the **secondary** HALF_UP oracle: the TSV family produced by the
 * world-fixture track's dumper,
 * `pipeline/java-exporter/src-world/websim/exporter/world/HalfUpFormat.java`.
 *
 * <p>The **canonical** oracle is `engine/test/fixtures/mathx/mathx-format.json`
 * (see `./fixtures.ts`) — that is the table the WP3 parity gate runs on. This
 * family exists because two concurrent tracks each built a HALF_UP oracle from a
 * different dumper. Rather than delete the duplicate, it is kept and *pointed at
 * the canonical one*: two independent dumpers agreeing character-for-character
 * on Java's own output is a far stronger statement than either table alone, and
 * it costs one test.
 *
 * <p>Like the mathx loaders, these fixtures are **required, never optional**: a
 * missing file fails the suite loudly rather than skipping it (plan risk W18).
 * They live under `engine/test/fixtures/`, not under the git-ignored
 * `pipeline/out/`, so a clean checkout has them.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** One row of `half-up-format.tsv`. */
export interface HalfUpRow {
  readonly idx: number;
  /** `%016x` of `Double.doubleToRawLongBits` — the authoritative input. */
  readonly bits: string;
  /** `Double.toString` — round-trip exact, convenience only. */
  readonly shortestRepr: string;
  /** `String.format(Locale.US, "%.Nf", v)` for N = 0..6, indexed by N. */
  readonly formatted: readonly string[];
  /** `(long) v` as a decimal string — Java narrowing-cast semantics. */
  readonly longCast: string;
}

/** One row of `half-up-divergences.tsv`. */
export interface HalfUpDivergenceRow {
  readonly idx: number;
  readonly bits: string;
  readonly shortestRepr: string;
  readonly precision: number;
  /** What `String.format` printed. */
  readonly javaOut: string;
  /**
   * What the dumper computed as `new BigDecimal(v).setScale(N, HALF_UP)`.
   *
   * <p>**Known-defective in the committed bytes** — see
   * `half-up-cross-oracle.test.ts`. The dumper restored BigDecimal's missing
   * negative zero only for the literal `-0.0`, so every other negative value
   * that rounds to zero appears here unsigned and was booked as a divergence it
   * is not. `HalfUpFormat.java` is now corrected; the committed TSV predates the
   * correction, and the test derives its census from ground truth so that it
   * holds both before and after a regeneration.
   */
  readonly exactHalfUp: string;
  readonly className: string;
}

function loadText(name: string): string {
  const path = fileURLToPath(new URL(`../fixtures/format/${name}`, import.meta.url));
  try {
    return readFileSync(path, "utf8");
  } catch (cause) {
    throw new Error(
      `HALF_UP cross-oracle fixture '${name}' is missing. Regenerate it with the world ` +
        `dumper (pipeline/java-exporter, HalfUpFormat) — this suite must not be skipped.`,
      { cause },
    );
  }
}

function* dataLines(text: string): Generator<string> {
  for (const line of text.split("\n")) {
    const trimmed = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (trimmed.length > 0 && !trimmed.startsWith("#")) {
      yield trimmed;
    }
  }
}

function parseRows(): readonly HalfUpRow[] {
  const rows: HalfUpRow[] = [];
  for (const line of dataLines(loadText("half-up-format.tsv"))) {
    const f = line.split("\t");
    if (f.length !== 11) {
      throw new Error(`half-up-format.tsv: expected 11 columns, got ${f.length}: ${line}`);
    }
    rows.push({
      idx: Number(f[0]),
      bits: f[1]!,
      shortestRepr: f[2]!,
      formatted: f.slice(3, 10),
      longCast: f[10]!,
    });
  }
  return rows;
}

function parseDivergences(): readonly HalfUpDivergenceRow[] {
  const rows: HalfUpDivergenceRow[] = [];
  for (const line of dataLines(loadText("half-up-divergences.tsv"))) {
    const f = line.split("\t");
    if (f.length !== 7) {
      throw new Error(`half-up-divergences.tsv: expected 7 columns, got ${f.length}: ${line}`);
    }
    rows.push({
      idx: Number(f[0]),
      bits: f[1]!,
      shortestRepr: f[2]!,
      precision: Number(f[3]),
      javaOut: f[4]!,
      exactHalfUp: f[5]!,
      className: f[6]!,
    });
  }
  return rows;
}

export const halfUpRows = parseRows();
export const halfUpDivergences = parseDivergences();

/**
 * True when `javaOut` is `exactHalfUp` with a minus sign glued on and the value
 * is a zero — i.e. the row is an artefact of BigDecimal having no negative zero,
 * not a shortest-representation divergence.
 */
export function isNegativeZeroArtefact(row: HalfUpDivergenceRow): boolean {
  return (
    row.javaOut.startsWith("-") &&
    row.javaOut.slice(1) === row.exactHalfUp &&
    /^-0(\.0*)?$/u.test(row.javaOut)
  );
}
