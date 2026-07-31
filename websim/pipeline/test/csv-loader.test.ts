import { describe, expect, it } from "vitest";

import {
  CsvStrictError,
  javaParseDouble,
  javaTrim,
  readCsvText,
  readLines,
  readStrictCsvText,
  splitCsv,
} from "../src/csv-loader.js";

const BOM = "﻿";
const NBSP = " ";

/**
 * PORT_MAP section 4.2 is explicit that the Java loader's non-RFC-4180
 * behaviours are load-bearing. Each one gets a test here, because the failure
 * mode of getting one wrong is not a crash — it is a slightly different parsed
 * value that propagates into results nobody re-derives.
 */
describe("CsvLoader port: line splitting", () => {
  it("treats LF, CRLF and a bare CR as terminators, like BufferedReader.readLine", () => {
    expect(readLines("a\nb\r\nc\rd")).toEqual(["a", "b", "c", "d"]);
  });

  it("does not emit a phantom final line for a trailing terminator", () => {
    expect(readLines("a\nb\n")).toEqual(["a", "b"]);
    expect(readLines("a\r\nb\r\n")).toEqual(["a", "b"]);
  });

  it("returns an unterminated final line", () => {
    expect(readLines("a\nb")).toEqual(["a", "b"]);
  });
});

describe("CsvLoader port: field splitting", () => {
  it("trims every field, including quoted content", () => {
    expect(splitCsv('  a  , " b " ,c')).toEqual(["a", "b", "c"]);
  });

  it("honours the doubled-quote escape", () => {
    expect(splitCsv('"say ""hi""",x')).toEqual(['say "hi"', "x"]);
  });

  it("lets a quote open mid-field", () => {
    expect(splitCsv('ab"c,d",e')).toEqual(["abc,d", "e"]);
  });

  it("emits the accumulated text of an unterminated quote", () => {
    expect(splitCsv('a,"bcd')).toEqual(["a", "bcd"]);
  });

  it("produces a trailing empty field after a final comma", () => {
    expect(splitCsv("a,b,")).toEqual(["a", "b", ""]);
  });
});

describe("CsvLoader port: javaTrim", () => {
  it("strips only code units <= U+0020, unlike the JS builtin", () => {
    // JS trim removes U+00A0; Java's String.trim does not. A shelter name or a
    // capacity field containing one must survive exactly as Java leaves it.
    const padded = `${NBSP}x${NBSP}`;
    expect(javaTrim(padded)).toBe(padded);
    expect(padded.trim()).toBe("x");
    expect(javaTrim("\t\n x \r ")).toBe("x");
  });
});

describe("CsvLoader.read semantics", () => {
  it("strips a BOM from the header line only", () => {
    const rows = readCsvText(`${BOM}a,b\n1,2\n`);
    expect([...(rows[0] as ReadonlyMap<string, string>).keys()]).toEqual(["a", "b"]);
    // A BOM inside a data field is data, not a marker: javaTrim leaves U+FEFF.
    const inner = readCsvText(`a\n${BOM}1\n`);
    expect((inner[0] as ReadonlyMap<string, string>).get("a")).toBe(`${BOM}1`);
  });

  it("skips blank lines", () => {
    expect(readCsvText("a\n1\n   \n2\n")).toHaveLength(2);
  });

  it("pads short rows with empty strings and drops extra fields", () => {
    const rows = readCsvText("a,b,c\n1\n1,2,3,4\n");
    const short = rows[0] as ReadonlyMap<string, string>;
    expect([short.get("a"), short.get("b"), short.get("c")]).toEqual(["1", "", ""]);
    const long = rows[1] as ReadonlyMap<string, string>;
    expect([...long.values()]).toEqual(["1", "2", "3"]);
  });

  it("resolves duplicate headers last-wins while keeping first position", () => {
    const rows = readCsvText("a,b,a\n1,2,3\n");
    const row = rows[0] as ReadonlyMap<string, string>;
    expect(row.get("a")).toBe("3");
    expect([...row.keys()]).toEqual(["a", "b"]);
  });

  it("returns no rows for an empty file rather than throwing", () => {
    expect(readCsvText("")).toEqual([]);
  });
});

describe("CsvLoader.readStrict semantics", () => {
  it("throws on an empty file", () => {
    expect(() => readStrictCsvText("", "f.csv")).toThrow(CsvStrictError);
  });

  it("throws on duplicate header names", () => {
    expect(() => readStrictCsvText("a,b,a\n1,2,3\n", "f.csv")).toThrow(/duplicate column name 'a'/u);
  });

  it("throws when a row's field count differs from the header", () => {
    // The exact scenario the strict variant exists for: an unquoted comma in a
    // prose field shifts every later column and silently drops the last one.
    expect(() => readStrictCsvText("a,b\n1,2,3\n", "f.csv")).toThrow(
      /line 2 has 3 fields but the header declares 2/u,
    );
  });

  it("counts blank lines when numbering the offending line", () => {
    expect(() => readStrictCsvText("a,b\n\n1,2,3\n", "f.csv")).toThrow(/line 3 has 3 fields/u);
  });
});

describe("javaParseDouble", () => {
  it("parses the plain decimal forms the data files use", () => {
    expect(javaParseDouble("4.7")).toBe(4.7);
    expect(javaParseDouble(" -0.5 ")).toBe(-0.5);
    expect(javaParseDouble("1e3")).toBe(1000);
    expect(javaParseDouble("5.")).toBe(5);
    expect(javaParseDouble(".5")).toBe(0.5);
    expect(javaParseDouble("2d")).toBe(2);
  });

  it("rejects the strings Double.parseDouble rejects", () => {
    // Number("") is 0 and Number("0x10") is 16 — both would silently invent a
    // measurement where Java throws and the caller skips the row.
    for (const bad of ["", "  ", "0x10", "1,5", "abc", "--1", "1e", "NaNf"]) {
      expect(Number.isNaN(javaParseDouble(bad))).toBe(true);
    }
  });

  it("accepts the special literals Java accepts, so a poisoned hour stays poisoned", () => {
    expect(Number.isNaN(javaParseDouble("NaN"))).toBe(true);
    expect(javaParseDouble("Infinity")).toBe(Number.POSITIVE_INFINITY);
    expect(javaParseDouble("-Infinity")).toBe(Number.NEGATIVE_INFINITY);
  });
});
