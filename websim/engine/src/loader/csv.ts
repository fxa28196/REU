/**
 * `engine/src/loader/csv.ts` — a byte-faithful port of `geography.data.CsvLoader`
 * (PORT_MAP §4.2, plan §3.2 `loader/csv.ts` "verbatim"). Do NOT swap in an
 * RFC-4180 library: the Java loader's deviations from RFC-4180 are load-bearing,
 * and the archived results were produced through them.
 *
 * **WP5 promotion.** This module was written for the WP4 asset builds and lived
 * in `pipeline/src/csv-loader.ts`; the engine needs the same parser at runtime
 * (shelters, closures and encampment CSVs are shipped verbatim, plan §4.3), so
 * it now lives here and `pipeline/src/csv-loader.ts` re-exports it. Two copies
 * of a fidelity-critical parser is precisely the drift this project cannot
 * afford — the pipeline's existing tests still run, unchanged, through the
 * re-export, so they now cover this file.
 *
 * Semantics reproduced, in the order PORT_MAP lists them:
 *   - UTF-8 explicit decode; a leading U+FEFF is stripped from the HEADER line
 *     only (a BOM mid-file is data, not a marker).
 *   - `BufferedReader.readLine()` line splitting: `\n`, `\r\n` and a bare `\r`
 *     are all terminators, and a final unterminated line is still a line.
 *   - Blank lines (Java `String.trim().isEmpty()`) are skipped.
 *   - Hand-rolled quote state machine: `""` is an escaped quote, a quote may
 *     open mid-field, there are no multi-line quoted fields (the reader works
 *     line by line), an unterminated quote emits the text accumulated so far.
 *   - EVERY field is Java-`trim()`ed, including quoted content.
 *   - `read`: short rows padded with `""`, extra fields silently dropped,
 *     duplicate headers last-wins.
 *   - `readStrict`: empty file, duplicate header names, and any row whose field
 *     count differs from the header all throw.
 *
 * Java's `String.trim()` strips code units <= U+0020, which is NOT JavaScript's
 * `String.prototype.trim()` (that also strips U+00A0, U+2028, U+FEFF, …). The
 * difference is reproduced explicitly in {@link javaTrim}; using the JS builtin
 * would silently eat a non-breaking space that Java keeps, changing a parsed
 * value.
 */

/** A parsed row: header name → field value. Insertion-ordered like Java's `LinkedHashMap`. */
export type CsvRow = ReadonlyMap<string, string>;

/** Thrown for every condition on which `CsvLoader.readStrict` throws. */
export class CsvStrictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CsvStrictError";
  }
}

/**
 * Java `String.trim()`: strip leading and trailing code units <= U+0020.
 * Exported because the registry validator applies it to individual fields the
 * same way `ScienceRegistry.value()` does.
 */
export function javaTrim(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s.charCodeAt(start) <= 0x20) {
    start += 1;
  }
  while (end > start && s.charCodeAt(end - 1) <= 0x20) {
    end -= 1;
  }
  return s.slice(start, end);
}

/**
 * `BufferedReader.readLine()` splitting. A trailing terminator does not produce
 * a final empty line (readLine returns null at that point), which is why the
 * loop breaks on exhaustion rather than using `String.prototype.split`.
 */
export function readLines(text: string): string[] {
  const lines: string[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const c = text.charCodeAt(i);
    if (c === 0x0a) {
      lines.push(text.slice(start, i));
      i += 1;
      start = i;
    } else if (c === 0x0d) {
      lines.push(text.slice(start, i));
      i += text.charCodeAt(i + 1) === 0x0a ? 2 : 1;
      start = i;
    } else {
      i += 1;
    }
  }
  if (start < text.length) {
    lines.push(text.slice(start));
  }
  return lines;
}

/** `CsvLoader.splitCsv` — quoted fields, `""` escapes, every field trimmed. */
export function splitCsv(line: string): string[] {
  const out: string[] = [];
  let sb = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i] as string;
    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          sb += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        sb += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(javaTrim(sb));
      sb = "";
    } else {
      sb += c;
    }
  }
  out.push(javaTrim(sb));
  return out;
}

/**
 * `new InputStreamReader(new FileInputStream(path), StandardCharsets.UTF_8)`.
 *
 * Java's UTF-8 `CharsetDecoder` is configured to REPLACE malformed input, which
 * is what `TextDecoder` does by default (`fatal: false`), so an invalid byte
 * becomes U+FFFD in both languages rather than throwing in one and not the
 * other.
 *
 * **`ignoreBOM: true` is load-bearing and is the opposite of what it sounds
 * like.** By default `TextDecoder` DELETES a leading U+FEFF; `ignoreBOM: true`
 * means "ignore its BOM-ness and keep it as a character", which is what Java's
 * decoder does. `read`/`readStrict` then strip it themselves — and only from the
 * header line, because a BOM anywhere else is data: Java's `String.trim()`
 * removes only code units <= U+0020, and U+FEFF is not one.
 *
 * The difference is not academic. The certified loader, handed a file whose
 * second line is just a BOM, emits a row whose first value is that BOM (fixture
 * case `bom-only-line`). Decoding with the default `TextDecoder` would drop the
 * character; combined with a JS `String.prototype.trim()` — which also eats
 * U+FEFF — the line would vanish entirely and the row count would silently
 * differ from Java's by one.
 */
export function decodeCsvBytes(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(view);
}

function stripHeaderBom(headerLine: string): string {
  return headerLine.length > 0 && headerLine.charCodeAt(0) === 0xfeff
    ? headerLine.slice(1)
    : headerLine;
}

/**
 * `CsvLoader.read(path)` over already-decoded text.
 *
 * Takes text rather than a path so the reducer can be unit-tested on adversarial
 * byte fixtures without touching the filesystem. {@link decodeCsvBytes} is the
 * byte entry point (browser `fetch` → `ArrayBuffer`, or Node `readFileSync`);
 * there is deliberately no path-taking overload in the engine, which owns no I/O.
 */
export function readCsvText(text: string): CsvRow[] {
  const lines = readLines(text);
  const headerLine = lines[0];
  if (headerLine === undefined) {
    return [];
  }
  const headers = splitCsv(stripHeaderBom(headerLine));
  const rows: CsvRow[] = [];
  for (let n = 1; n < lines.length; n += 1) {
    const line = lines[n] as string;
    if (javaTrim(line).length === 0) {
      continue;
    }
    const fields = splitCsv(line);
    // Java builds a LinkedHashMap: a duplicate header keeps its FIRST position
    // and takes its LAST value. `Map.set` on an existing key behaves identically.
    const row = new Map<string, string>();
    for (let i = 0; i < headers.length; i += 1) {
      row.set(headers[i] as string, i < fields.length ? (fields[i] as string) : "");
    }
    rows.push(row);
  }
  return rows;
}

/** `CsvLoader.readStrict(path)` over already-decoded text. `label` names the file in errors. */
export function readStrictCsvText(text: string, label: string): CsvRow[] {
  const lines = readLines(text);
  const headerLine = lines[0];
  if (headerLine === undefined) {
    throw new CsvStrictError(`${label}: file is empty`);
  }
  const headers = splitCsv(stripHeaderBom(headerLine));
  for (let i = 0; i < headers.length; i += 1) {
    for (let j = i + 1; j < headers.length; j += 1) {
      if (headers[i] === headers[j]) {
        throw new CsvStrictError(`${label}: duplicate column name '${headers[i] as string}'`);
      }
    }
  }
  const rows: CsvRow[] = [];
  // Java counts the header as line 1 and increments BEFORE the blank-line skip,
  // so a blank line still advances the number the error message reports.
  let lineNo = 1;
  for (let n = 1; n < lines.length; n += 1) {
    const line = lines[n] as string;
    lineNo += 1;
    if (javaTrim(line).length === 0) {
      continue;
    }
    const fields = splitCsv(line);
    if (fields.length !== headers.length) {
      throw new CsvStrictError(
        `${label}: line ${lineNo} has ${fields.length} fields but the header declares ` +
          `${headers.length} (an unquoted comma in a prose field is the usual cause)`,
      );
    }
    const row = new Map<string, string>();
    for (let i = 0; i < headers.length; i += 1) {
      row.set(headers[i] as string, fields[i] as string);
    }
    rows.push(row);
  }
  return rows;
}

/**
 * `Double.parseDouble` for the subset the data files use, returning NaN where
 * Java throws `NumberFormatException` (every call site in the model catches that
 * exception and skips the row, so NaN-means-skip is the faithful shape).
 *
 * JS `Number(s)` is NOT a drop-in: it accepts `""`, `"0x10"`, `"Infinity"` and
 * `"1_0"`-adjacent forms Java rejects, and rejects Java's `f`/`d` suffixes. Both
 * languages round decimal literals correctly, so once the grammar matches, the
 * resulting double is bit-identical.
 */
const JAVA_DOUBLE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?[fFdD]?$/u;

/**
 * Java accepts these three literals verbatim and case-sensitively, and the
 * caller then ADDS the result to its running sum — so `"NaN"` in a measurement
 * column poisons that hour's mean rather than skipping the row. Reproducing that
 * matters more than it looks: silently skipping would turn a poisoned hour into
 * a plausible-looking one.
 */
const JAVA_DOUBLE_SPECIALS: ReadonlyMap<string, number> = new Map([
  ["NaN", Number.NaN],
  ["+NaN", Number.NaN],
  ["-NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["+Infinity", Number.POSITIVE_INFINITY],
  ["-Infinity", Number.NEGATIVE_INFINITY],
]);

/**
 * Not covered: Java's hexadecimal floating-point literals (`0x1.8p3`). No
 * project data file contains one, and treating it as unparseable errs toward
 * skipping a row rather than inventing a value.
 *
 * Per the `Double.valueOf` grammar the `[fFdD]` suffix attaches to the decimal
 * alternatives only — `"NaNf"` is a parse failure, `"+NaN"` is not.
 */
export function javaParseDouble(raw: string): number {
  const s = javaTrim(raw);
  const special = JAVA_DOUBLE_SPECIALS.get(s);
  if (special !== undefined) {
    return special;
  }
  if (!JAVA_DOUBLE.test(s)) {
    return Number.NaN;
  }
  return Number(/[fFdD]$/u.test(s) ? s.slice(0, -1) : s);
}

/** True when `javaParseDouble` returning NaN means "Java would have thrown". */
export function javaDoubleThrows(raw: string): boolean {
  const s = javaTrim(raw);
  return !JAVA_DOUBLE_SPECIALS.has(s) && !JAVA_DOUBLE.test(s);
}
