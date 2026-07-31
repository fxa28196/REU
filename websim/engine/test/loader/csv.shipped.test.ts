/**
 * Every shipped CSV parses identically to the Java-exported parse.
 *
 * The oracles are the F1 world fixtures, each of which was produced by handing
 * the certified `CsvLoader` the same file and dumping what it extracted:
 *
 *  - `shelters/<arm>.tsv` — `shelter_id`, `name`, `capacity`, and `lon`/`lat` as
 *    raw IEEE-754 bits, for all 13 shelter CSVs the configs use.
 *  - `snap/camp-snap.tsv` — `inc_id`, `lon`, `lat` for all 3,400 rows of the
 *    encampment sample, in file order after the "malformed rows are silently
 *    skipped" filter.
 *  - `closures/schedule-*.tsv` — `node_a`, `node_b`, `activation_hour`.
 *
 * The encampment file is the interesting one: it is `Export-Csv -Encoding utf8`
 * output — a UTF-8 BOM, CRLF terminators and QUOTE_ALL — so it exercises the
 * BOM strip, the quote state machine and the trim on quoted content on real
 * data, not on a constructed case.
 *
 * Coordinates are compared as BITS, not as decimals: the geodesic snap and every
 * routed distance downstream are functions of these doubles, so "close enough"
 * is not a meaningful standard here.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { artifactGate, describeGated, gatedFixturePresent } from "../../../tools/artifact-gate.js";
import { javaParseDouble, readCsvText, decodeCsvBytes } from "../../src/loader/csv.js";
import {
  GEOGRAPHY_DIR,
  GEOGRAPHY_SHELTERS_REF,
  WORLD_FIXTURE_DIR,
  bitsToDouble,
  dataLines,
  doubleToBits,
  worldManifest,
} from "../graph/helpers.js";

const gate = artifactGate({
  gate: "engine:loader-shipped-csv",
  suite: "shipped CSVs vs the Java-exported parse",
  evidence:
    "every shipped CSV re-parsed and compared with the certified CsvLoader's own extraction — " +
    "13 shelter tables (ids, names, capacities, coordinates as bits), the 3,400-row encampment " +
    "sample (BOM + CRLF + QUOTE_ALL), and both closure schedules",
  artifacts: [
    {
      source: "world-fixtures",
      label: "shelters/A.tsv",
      path: `${WORLD_FIXTURE_DIR}/shelters/A.tsv`,
    },
    {
      source: "world-fixtures",
      label: "snap/camp-snap.tsv",
      path: `${WORLD_FIXTURE_DIR}/snap/camp-snap.tsv`,
    },
    GEOGRAPHY_SHELTERS_REF,
    {
      source: "geography",
      label: "irp_campsite_reports_sample.csv",
      path: `${GEOGRAPHY_DIR}/data/encampments/irp_campsite_reports_sample.csv`,
    },
  ],
});

function readShipped(relative: string): string {
  return decodeCsvBytes(readFileSync(fileURLToPath(new URL(`file:///${GEOGRAPHY_DIR}/${relative}`))));
}

/** Fixture file name per config id (the dumper's arm labels). */
const ARM_FILES = [
  "A",
  "B",
  "C",
  "E0-A",
  "E0-B",
  "E0-C",
  "ER-A",
  "ER-C",
  "ER-D",
  "SE-E18",
  "SE-E19",
  "SE-E20",
  "SE2-E18-d1",
] as const;

describeGated(gate, () => {
  it("parses all 13 shelter CSVs exactly as Java did", () => {
    const manifest = worldManifest();
    const byId = new Map(manifest.configs.map((c) => [c.id, c]));
    let rowsChecked = 0;
    let filesChecked = 0;
    for (const arm of ARM_FILES) {
      const cfg = byId.get(arm);
      expect(cfg, `manifest has no config ${arm}`).toBeDefined();
      const rows = readCsvText(readShipped(cfg!.sheltersCsv));
      const fixture = [...dataLines(readFileSync(`${WORLD_FIXTURE_DIR}/shelters/${arm}.tsv`, "utf8"))];
      expect(rows.length, `${arm} row count`).toBe(fixture.length);
      for (let i = 0; i < fixture.length; i++) {
        const f = fixture[i]!.split("\t");
        const row = rows[i]!;
        expect(Number(f[0]), `${arm} row ${i} index`).toBe(i);
        expect(row.get("shelter_id"), `${arm} row ${i} shelter_id`).toBe(f[1]);
        expect(row.get("name"), `${arm} row ${i} name`).toBe(f[2]);

        const rawCapacity = row.get("capacity") ?? "";
        if (rawCapacity.length === 0) {
          // PORT_MAP §4.1: blank capacity means unlimited, and the dumper writes
          // that as an empty column rather than inventing a number.
          expect(f[3], `${arm} row ${i} capacity`).toBe("");
        } else {
          expect(Number(f[3]), `${arm} row ${i} capacity`).toBe(Number(rawCapacity));
        }

        expect(doubleToBits(javaParseDouble(row.get("lon") ?? "")), `${arm} row ${i} lon`).toBe(f[5]);
        expect(doubleToBits(javaParseDouble(row.get("lat") ?? "")), `${arm} row ${i} lat`).toBe(f[6]);
        rowsChecked++;
      }
      filesChecked++;
    }
    expect(filesChecked).toBe(13);
    expect(rowsChecked).toBeGreaterThan(400);
  });

  it("parses the BOM + CRLF + QUOTE_ALL encampment sample exactly as Java did", () => {
    const rows = readCsvText(readShipped("data/encampments/irp_campsite_reports_sample.csv"));
    const fixture = [...dataLines(readFileSync(`${WORLD_FIXTURE_DIR}/snap/camp-snap.tsv`, "utf8"))];
    expect(fixture.length).toBe(3400);

    // The dumper mirrors ContextCreator L718-L723: a row whose lon/lat will not
    // parse is silently skipped, so the fixture's camp_idx is an index into the
    // KEPT rows. Reproduce that filter, then compare index for index.
    const kept: { incId: string; lon: number; lat: number }[] = [];
    for (const row of rows) {
      const lon = javaParseDouble(row.get("lon") ?? "");
      const lat = javaParseDouble(row.get("lat") ?? "");
      if (Number.isNaN(lon) || Number.isNaN(lat)) {
        continue;
      }
      kept.push({ incId: row.get("inc_id") ?? "", lon, lat });
    }
    expect(rows.length, "every sample row is parseable").toBe(3400);
    expect(kept.length).toBe(fixture.length);

    for (let i = 0; i < fixture.length; i++) {
      const f = fixture[i]!.split("\t");
      expect(Number(f[0]), `camp ${i} index`).toBe(i);
      expect(kept[i]!.incId, `camp ${i} inc_id`).toBe(f[1]);
      expect(doubleToBits(kept[i]!.lon), `camp ${i} lon`).toBe(f[2]);
      expect(doubleToBits(kept[i]!.lat), `camp ${i} lat`).toBe(f[3]);
    }
    // The BOM must not have leaked into the first header name, or every lookup
    // on it would have returned undefined and this test would read blanks.
    expect([...rows[0]!.keys()][0]).toBe("lon");
  });

  it("parses the closure schedules exactly as Java did", () => {
    const cases: { fixture: string; csv: string }[] = [
      { fixture: "closures/schedule-c1.tsv", csv: "data/closures/closures_E_r1.csv" },
      { fixture: "closures/schedule-c3-d1.tsv", csv: "data/closures/closures_E_r1_worst.csv" },
    ];
    let checked = 0;
    for (const c of cases) {
      const path = `${WORLD_FIXTURE_DIR}/${c.fixture}`;
      if (!gatedFixturePresent(gate, { source: "world-fixtures", label: c.fixture, path })) {
        continue;
      }
      const rows = readCsvText(readShipped(c.csv));
      const fixture = [...dataLines(readFileSync(path, "utf8"))];
      // The fixture is ordered by wave then by row order within the wave, which
      // for these files is the CSV order; compare as multisets of triples so the
      // test asserts the PARSE, not the scheduler's grouping (that is WP8's).
      const parsed = rows
        .map((r) => `${Number(r.get("node_a"))}|${Number(r.get("node_b"))}|${Number(r.get("activation_hour"))}`)
        .sort();
      const expected = fixture
        .map((line) => {
          const f = line.split("\t");
          return `${Number(f[3])}|${Number(f[4])}|${Number(f[0])}`;
        })
        .sort();
      expect(parsed, c.csv).toEqual(expected);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("reads lon/lat through Double.parseDouble semantics, not Number()", () => {
    // Guard on the helper the CSV path depends on: JS Number("") is 0 and
    // Number("0x10") is 16; Java throws for both, and every call site treats the
    // throw as "skip this row".
    expect(Number.isNaN(javaParseDouble(""))).toBe(true);
    expect(Number.isNaN(javaParseDouble("0x10"))).toBe(true);
    expect(doubleToBits(javaParseDouble("-122.686753"))).toBe(doubleToBits(-122.686753));
    expect(bitsToDouble(doubleToBits(45.576626))).toBe(45.576626);
  });
});
