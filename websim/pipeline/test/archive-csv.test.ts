/**
 * Dialect tests for the archived-output CSV reader.
 *
 * These pin the four properties the whole digest layer leans on: CRLF is not
 * data, quoting does not exist, empty is not zero, and a ragged row is a hard
 * error rather than something to pad.
 */

import { describe, expect, it } from "vitest";

import { cell, numberAt, parseArchiveCsv } from "../src/archive/csv.js";

describe("parseArchiveCsv", () => {
  it("reads CRLF rows without leaving carriage returns in cells", () => {
    const t = parseArchiveCsv("a,b\r\n1,2\r\n3,4\r\n");
    expect(t.header).toEqual(["a", "b"]);
    expect(t.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("accepts LF-only input too, so a normalised checkout still parses", () => {
    const t = parseArchiveCsv("a,b\n1,2\n");
    expect(t.rows).toEqual([["1", "2"]]);
  });

  it("strips a UTF-8 BOM from the header", () => {
    const t = parseArchiveCsv("﻿agent_id,x\r\nSite 0,1\r\n");
    expect(t.header[0]).toBe("agent_id");
    expect(t.requireIndex("agent_id")).toBe(0);
  });

  it("keeps empty cells empty rather than mapping them to zero", () => {
    const t = parseArchiveCsv("capacity,final_occupancy\r\n,7\r\n");
    const row = t.rows[0] as readonly string[];
    expect(cell(t, row, "capacity")).toBe("");
    expect(numberAt(row, t.requireIndex("capacity"), "cap")).toBeNull();
    expect(numberAt(row, t.requireIndex("final_occupancy"), "occ")).toBe(7);
  });

  it("rejects a double quote instead of guessing an escaping rule", () => {
    expect(() => parseArchiveCsv('a,b\r\n"x",2\r\n', "fixture")).toThrow(/double quote/u);
  });

  it("rejects a ragged row rather than shifting every later column", () => {
    expect(() => parseArchiveCsv("a,b,c\r\n1,2\r\n", "fixture")).toThrow(
      /line 2 has 2 field\(s\), header has 3/u,
    );
  });

  it("reports an absent column as -1 and only throws when it is required", () => {
    const t = parseArchiveCsv("a,b\r\n1,2\r\n");
    expect(t.index("policy_refused")).toBe(-1);
    expect(t.has("policy_refused")).toBe(false);
    expect(() => t.requireIndex("policy_refused")).toThrow(/required column/u);
  });

  it("treats a trailing newline as a terminator, not an empty row", () => {
    expect(parseArchiveCsv("a\r\n1\r\n").rows).toHaveLength(1);
    expect(parseArchiveCsv("a\r\n1").rows).toHaveLength(1);
  });
});
