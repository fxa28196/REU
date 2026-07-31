/**
 * `CsvLoader` port vs the certified Java loader, on adversarial bytes.
 *
 * The fixture (`engine/test/fixtures/csv/adversarial.tsv`) is not a
 * hand-written expectation table: it is what `geography.data.CsvLoader` ACTUALLY
 * did with each byte sequence, dumped by
 * `pipeline/java-exporter/src-csv/.../CsvAdversarialDumper.java` and regenerated
 * with `dump-csv-fixtures.ps1 -Verify` (byte-identical across two runs). Inputs,
 * keys, values and throw messages all travel as hex of their UTF-8 bytes, so the
 * comparison is byte-equality and not string-equality-after-some-normalisation.
 *
 * The cases that earn their keep are the ones where an "obvious" TypeScript
 * implementation diverges:
 *
 *  - `bom-only-line`: a line holding just U+FEFF is NOT blank to Java's
 *    `trim()` (which strips only code units <= U+0020), so Java emits a row
 *    whose first value is the BOM. `String.prototype.trim()` strips U+FEFF and
 *    would have skipped the line entirely — one row difference, silently.
 *  - `trim-nbsp`: U+00A0 survives Java's `trim()` and is eaten by JS's.
 *  - `unterminated-quote`: emits the accumulated text; it does not throw.
 *  - `quote-opens-midfield`: the state machine has no "quotes must start a
 *    field" rule, so `ab"c,d"e` is ONE field.
 *  - `crlf-inside-quotes-impossible`: there are no multi-line quoted fields,
 *    because the loader reads line by line — RFC-4180 parsers get this wrong.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CsvStrictError,
  decodeCsvBytes,
  readCsvText,
  readStrictCsvText,
  type CsvRow,
} from "../../src/loader/csv.js";

const FIXTURE = fileURLToPath(new URL("../fixtures/csv/adversarial.tsv", import.meta.url));

/** The label the dumper substituted for the temp-file path in throw messages. */
const LABEL = "$FILE$";

interface Expectation {
  readonly name: string;
  readonly mode: "read" | "readStrict";
  readonly input: Uint8Array;
  readonly rows: { key: string; value: string }[][] | null;
  readonly throwMessage: string | null;
  readonly throwClass: string | null;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function hexToText(hex: string): string {
  // ignoreBOM: true keeps a leading U+FEFF as a character, which is what the
  // fixture encodes and what Java's decoder produces.
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(hexToBytes(hex));
}

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) {
    s += b.toString(16).padStart(2, "0");
  }
  return s;
}

function utf8Hex(s: string): string {
  return bytesToHex(new TextEncoder().encode(s));
}

function parseFixture(): Expectation[] {
  const text = readFileSync(FIXTURE, "utf8");
  const out: Expectation[] = [];
  let current: {
    name: string;
    mode: "read" | "readStrict";
    input: Uint8Array;
    rows: { key: string; value: string }[][] | null;
    throwMessage: string | null;
    throwClass: string | null;
  } | null = null;

  for (const line of text.split("\n")) {
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const f = line.split("\t");
    switch (f[0]) {
      case "CASE":
        current = {
          name: f[1]!,
          mode: f[2] as "read" | "readStrict",
          input: hexToBytes(f[3]!),
          rows: null,
          throwMessage: null,
          throwClass: null,
        };
        break;
      case "ROWS":
        current!.rows = [];
        break;
      case "THROW":
        current!.throwClass = f[1]!;
        current!.throwMessage = hexToText(f[2]!);
        break;
      case "ROW": {
        const row: { key: string; value: string }[] = [];
        for (let i = 3; i < f.length; i++) {
          const cell = f[i]!;
          const colon = cell.indexOf(":");
          row.push({ key: hexToText(cell.slice(0, colon)), value: hexToText(cell.slice(colon + 1)) });
        }
        current!.rows!.push(row);
        break;
      }
      case "END":
        out.push(current!);
        current = null;
        break;
      default:
        throw new Error(`unknown fixture record: ${f[0]!}`);
    }
  }
  return out;
}

const EXPECTATIONS = parseFixture();

/** Encode a parsed row the way the dumper encoded Java's, so bytes meet bytes. */
function encodeRow(row: CsvRow): string {
  const parts: string[] = [];
  for (const [k, v] of row) {
    parts.push(`${utf8Hex(k)}:${utf8Hex(v)}`);
  }
  return parts.join("\t");
}

function encodeExpected(row: { key: string; value: string }[]): string {
  return row.map((c) => `${utf8Hex(c.key)}:${utf8Hex(c.value)}`).join("\t");
}

describe("CsvLoader adversarial byte fixtures", () => {
  it("the fixture itself carries both modes for every case", () => {
    expect(EXPECTATIONS.length).toBeGreaterThanOrEqual(60);
    const names = new Set(EXPECTATIONS.map((e) => e.name));
    for (const n of names) {
      const modes = EXPECTATIONS.filter((e) => e.name === n).map((e) => e.mode).sort();
      expect(modes, n).toEqual(["read", "readStrict"]);
    }
    // The cases that exist specifically to catch a JS-flavoured implementation.
    for (const must of ["bom-only-line", "trim-nbsp", "unterminated-quote", "quote-opens-midfield"]) {
      expect(names.has(must), must).toBe(true);
    }
  });

  for (const exp of EXPECTATIONS) {
    it(`${exp.name} / ${exp.mode} reproduces Java byte-for-byte`, () => {
      const text = decodeCsvBytes(exp.input);
      if (exp.rows !== null) {
        const rows = exp.mode === "read" ? readCsvText(text) : readStrictCsvText(text, LABEL);
        expect(rows.length, "row count").toBe(exp.rows.length);
        for (let i = 0; i < rows.length; i++) {
          expect(encodeRow(rows[i]!), `row ${i}`).toBe(encodeExpected(exp.rows[i]!));
        }
      } else {
        expect(exp.throwClass).toBe("java.lang.IllegalStateException");
        let thrown: unknown = null;
        try {
          if (exp.mode === "read") {
            readCsvText(text);
          } else {
            readStrictCsvText(text, LABEL);
          }
        } catch (e) {
          thrown = e;
        }
        expect(thrown, "expected a throw").toBeInstanceOf(CsvStrictError);
        expect((thrown as Error).message).toBe(exp.throwMessage);
      }
    });
  }
});
