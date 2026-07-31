/**
 * The public encampment layer (WP4 (c), plan Q4).
 *
 * The claims under test are privacy claims, so they are tested as *absence*
 * claims wherever possible: the built bytes must not contain a raw coordinate,
 * a raw report id, a date or a vehicle flag. Asserting that the builder called
 * the right function would prove nothing about what shipped.
 *
 * The real 3,400-row feed is git-ignored and local-only, so these run on a
 * synthetic feed with the same shape; the real-feed run is asserted in
 * `deploy-check.test.ts`'s real-asset tier and by the CLI itself.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { unpackEncampmentsPublic } from "@websim/shared";

import {
  DISPLAY_MAX_MERGE_LEVEL,
  DISPLAY_MIN_CELL_COUNT,
  GRID_MIN_CELL_M,
  SALT_BYTES,
  buildDisplayGrid,
  buildEncampments,
  buildGridSpec,
  freshSalt,
  kAnonymiseCells,
  metresPerDegreeLat,
  metresPerDegreeLon,
  nearestNodeIndex,
  parseEncampmentCsv,
  saltMaterialIn,
  saltedId,
  type RawReport,
  type SnapTarget,
} from "../scripts/build-encampments.js";
import { PUBLISHED_MIN_CELL_COUNT } from "../scripts/deploy-check.js";

/** Four street nodes, two of them at a bit-identical coordinate (the real graph
 *  has 192 such groups, so the tie path must be covered). */
const TARGET: SnapTarget = {
  nodeId: Int32Array.from([-1000, 11, 12, 13]),
  nodeLon: Float64Array.from([-122.681, -122.671, -122.661, -122.661]),
  nodeLat: Float64Array.from([45.511, 45.521, 45.531, 45.531]),
};

const CSV =
  "﻿" +
  '"lon","lat","inc_date","inc_id","is_vehicle"\r\n' +
  '"-122.680900","45.511100","2026-07-23","26-150147","No"\r\n' +
  '"-122.681100","45.510900","2026-07-22","26-150146","Yes"\r\n' +
  '"-122.670500","45.521400","2026-07-21","26-150133","No"\r\n' +
  '"-122.661000","45.531000","2026-07-20","26-150131","Yes"\r\n' +
  '"not-a-number","45.500000","2026-07-19","26-150130","No"\r\n' +
  "\r\n";

describe("parseEncampmentCsv", () => {
  const parsed = parseEncampmentCsv(CSV);

  it("mirrors CsvLoader: BOM stripped, quotes removed, blank lines skipped", () => {
    expect(parsed.headers).toEqual(["lon", "lat", "inc_date", "inc_id", "is_vehicle"]);
    expect(parsed.linesRead).toBe(5);
    expect(parsed.rows).toHaveLength(4);
  });

  it("skips an unparseable coordinate the way ContextCreator's try/catch does", () => {
    expect(parsed.skippedMalformed).toBe(1);
    expect(parsed.rows.map((r) => r.incId)).not.toContain("26-150130");
  });

  it("parses coordinates to the same doubles Java's Double.parseDouble produces", () => {
    expect(parsed.rows[0]!.lon).toBe(-122.6809);
    expect(parsed.rows[0]!.lat).toBe(45.5111);
  });
});

describe("degree-space nearest neighbour", () => {
  it("picks the true nearest node", () => {
    expect(nearestNodeIndex(TARGET, -122.6705, 45.5214).index).toBe(1);
  });

  it("flags a query that two coincident nodes tie on, instead of hiding the choice", () => {
    const hit = nearestNodeIndex(TARGET, -122.661, 45.531);
    expect(hit.exactTies).toBe(1);
    expect(hit.ambiguous).toBe(true);
    // documented tie-break: lowest node id (= lowest index) wins
    expect(TARGET.nodeId[hit.index]).toBe(12);
  });

  it("reports no ambiguity when the geometry separates the candidates", () => {
    expect(nearestNodeIndex(TARGET, -122.6809, 45.5111).ambiguous).toBe(false);
  });
});

describe("public encampment asset", () => {
  const rows = parseEncampmentCsv(CSV).rows;
  const built = buildEncampments(rows, TARGET, "0123456789abcdef");
  const asset = unpackEncampmentsPublic(built.publicAsset);

  it("keeps one entry per report row and deduplicates the node table", () => {
    expect(asset.rowCount).toBe(4);
    // rows 0 and 1 both snap to node −1000
    expect(built.distinctNodes).toBe(3);
    expect(asset.rowSlot[0]).toBe(asset.rowSlot[1]);
  });

  it("carries only street-node coordinates, bit-identical to the graph's", () => {
    for (let s = 0; s < asset.nodeCount; s++) {
      const i = asset.nodeIndex[s]!;
      expect(asset.nodeLon[s]).toBe(TARGET.nodeLon[i]);
      expect(asset.nodeLat[s]).toBe(TARGET.nodeLat[i]);
      expect(asset.nodeId[s]).toBe(TARGET.nodeId[i]);
    }
  });

  it("contains no raw coordinate as bits and no raw coordinate as text", () => {
    const view = new DataView(built.publicAsset.buffer, built.publicAsset.byteOffset, built.publicAsset.byteLength);
    const rawBits = new Set<number>();
    for (const r of rows) {
      rawBits.add(r.lon);
      rawBits.add(r.lat);
    }
    for (let o = 0; o + 8 <= built.publicAsset.length; o++) {
      expect(rawBits.has(view.getFloat64(o, true))).toBe(false);
      expect(rawBits.has(view.getFloat64(o, false))).toBe(false);
    }
    const text = Buffer.from(built.publicAsset).toString("latin1");
    for (const r of rows) {
      expect(text).not.toContain(r.lon.toFixed(6));
      expect(text).not.toContain(r.lat.toFixed(6));
    }
  });

  it("contains no raw inc_id, no date and no vehicle flag", () => {
    const text = Buffer.from(built.publicAsset).toString("latin1");
    for (const r of rows) {
      expect(text).not.toContain(r.incId);
    }
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/u);
    expect(text).not.toMatch(/is_vehicle|inc_date/u);
  });

  it("hashes report ids with the salt: 12 hex, stable, and salt-dependent", () => {
    expect(asset.rowHashHex[0]).toMatch(/^[0-9a-f]{12}$/u);
    expect(saltedId("0123456789abcdef", "26-150147")).toBe(asset.rowHashHex[0]);
    expect(saltedId("a-different-salt", "26-150147")).not.toBe(asset.rowHashHex[0]);
    expect(new Set(asset.rowHashHex).size).toBe(asset.rowCount);
  });

  it("records how many start nodes the tie-break rule decided", () => {
    expect(built.ambiguousSnaps).toBe(1);
  });
});

describe("display density grid", () => {
  const spec = buildGridSpec();

  it("never produces a cell smaller than the 150 m floor, anywhere in the band", () => {
    expect(spec.minCellWidthM).toBeGreaterThanOrEqual(GRID_MIN_CELL_M);
    expect(spec.minCellHeightM).toBeGreaterThanOrEqual(GRID_MIN_CELL_M);
    for (let lat = 45; lat <= 46; lat += 0.05) {
      expect(spec.stepLat * metresPerDegreeLat(lat)).toBeGreaterThanOrEqual(GRID_MIN_CELL_M);
      expect(spec.stepLon * metresPerDegreeLon(lat)).toBeGreaterThanOrEqual(GRID_MIN_CELL_M);
    }
  });

  it("uses an absolute origin, so a cell index carries no data-derived offset", () => {
    expect(spec.originLon).toBe(-180);
    expect(spec.originLat).toBe(-90);
  });

  // k = 1, level 0 disables the disclosure filter so the *gridding* mechanic is
  // what is under test here. The k-anonymity block below covers the filter, and
  // each of these two cases is re-run at the shipping default to show that the
  // same input publishes nothing.
  it("emits counts per cell and never a point", () => {
    const grid = buildDisplayGrid([-122.681, -122.671], [45.511, 45.521], [2, 1], spec, 1, 0);
    expect(grid.total).toBe(3);
    expect(grid.cells).toHaveLength(2);
    for (const cell of grid.cells) {
      expect(Number.isInteger(cell.i)).toBe(true);
      expect(Number.isInteger(cell.j)).toBe(true);
      expect(Object.keys(cell).sort()).toEqual(["count", "i", "j", "level"]);
    }
    const serialised = JSON.stringify(grid);
    expect(serialised).not.toContain("-122.681");
    expect(serialised).not.toContain("45.511");

    // at the shipping default those two cells (counts 2 and 1) are not publishable
    const shipped = buildDisplayGrid([-122.681, -122.671], [45.511, 45.521], [2, 1], spec);
    expect(shipped.cells).toEqual([]);
    expect(shipped.suppressed).toBe(3);
  });

  it("merges points that fall in the same cell", () => {
    const grid = buildDisplayGrid([-122.681, -122.6811], [45.511, 45.5111], [1, 1], spec, 1, 0);
    expect(grid.cells).toHaveLength(1);
    expect(grid.cells[0]!.count).toBe(2);
    expect(buildDisplayGrid([-122.681, -122.6811], [45.511, 45.5111], [1, 1], spec).cells).toEqual([]);
  });

  it("refuses to grid a point outside the band the 150 m floor was proved on", () => {
    expect(() => buildDisplayGrid([-122.681], [47.5], [1], spec)).toThrow(/outside the fixed display band/u);
  });
});

describe("k-anonymity on the published display layer", () => {
  const spec = buildGridSpec();

  it("keeps the gate's k and the builder's k identical", () => {
    // deploy-check declares its own copy on purpose (see its header). Equal here
    // means a deliberate change has to be made twice; a careless one fails.
    expect(PUBLISHED_MIN_CELL_COUNT).toBe(DISPLAY_MIN_CELL_COUNT);
    expect(DISPLAY_MIN_CELL_COUNT).toBeGreaterThanOrEqual(5);
  });

  it("never publishes a cell below k, at any level", () => {
    const cells = [
      { i: 100, j: 200, count: 9 }, // publishes at level 0
      { i: 102, j: 200, count: 4 }, // 4 + 1 = 5 with its level-1 sibling
      { i: 103, j: 200, count: 1 },
      { i: 900, j: 900, count: 1 }, // isolated: never reaches k, suppressed
    ];
    const result = kAnonymiseCells(cells);
    expect(result.cells.every((c) => c.count >= DISPLAY_MIN_CELL_COUNT)).toBe(true);
    expect(result.cells).toEqual([
      { i: 100, j: 200, level: 0, count: 9 },
      { i: 51, j: 100, level: 1, count: 5 },
    ]);
    expect(result.suppressedCells).toBe(1);
    expect(result.suppressedCount).toBe(1);
    expect(result.levelCensus).toEqual({ 0: 1, 1: 1 });
  });

  it("conserves every report: published + suppressed = input", () => {
    const cells = Array.from({ length: 400 }, (_, n) => ({
      i: 1000 + ((n * 7) % 37),
      j: 2000 + ((n * 13) % 41),
      count: 1 + (n % 4),
    }));
    const result = kAnonymiseCells(cells);
    const input = cells.reduce((sum, c) => sum + c.count, 0);
    const published = result.cells.reduce((sum, c) => sum + c.count, 0);
    expect(published + result.suppressedCount).toBe(input);
    expect(result.cells.every((c) => c.count >= DISPLAY_MIN_CELL_COUNT)).toBe(true);
  });

  it("cannot be read back down: a merged cell always spans at least two children", () => {
    // A parent is only published from children that FAILED k, each ≤ k−1, so a
    // parent reaching k needs two or more of them. A single dense child can
    // never hide inside a merged cell.
    const result = kAnonymiseCells([{ i: 40, j: 60, count: DISPLAY_MIN_CELL_COUNT + 3 }]);
    expect(result.cells).toEqual([{ i: 40, j: 60, level: 0, count: DISPLAY_MIN_CELL_COUNT + 3 }]);
    const lonely = kAnonymiseCells([{ i: 40, j: 60, count: DISPLAY_MIN_CELL_COUNT - 1 }]);
    expect(lonely.cells).toEqual([]);
    expect(lonely.suppressedCount).toBe(DISPLAY_MIN_CELL_COUNT - 1);
  });

  it("suppresses rather than merging past the level cap", () => {
    const far = [
      { i: 0, j: 0, count: 3 },
      { i: 1 << (DISPLAY_MAX_MERGE_LEVEL + 4), j: 0, count: 3 },
    ];
    const capped = kAnonymiseCells(far);
    expect(capped.cells).toEqual([]);
    expect(capped.suppressedCount).toBe(6);
    // the same pair does combine once the cap is lifted far enough
    const uncapped = kAnonymiseCells(far, DISPLAY_MIN_CELL_COUNT, DISPLAY_MAX_MERGE_LEVEL + 5);
    expect(uncapped.cells).toHaveLength(1);
    expect(uncapped.cells[0]!.count).toBe(6);
  });

  it("marks every published cell with the level its index is relative to", () => {
    const grid = buildDisplayGrid(
      [-122.681, -122.6812, -122.671, -122.6712, -122.6714],
      [45.511, 45.5112, 45.521, 45.5212, 45.5214],
      [3, 3, 2, 2, 2],
      spec,
    );
    expect(grid.cells.length).toBeGreaterThan(0);
    for (const cell of grid.cells) {
      expect(Number.isInteger(cell.level)).toBe(true);
      expect(cell.level).toBeGreaterThanOrEqual(0);
      expect(cell.level).toBeLessThanOrEqual(DISPLAY_MAX_MERGE_LEVEL);
      expect(cell.count).toBeGreaterThanOrEqual(DISPLAY_MIN_CELL_COUNT);
    }
    expect(grid.minPublishedCount).toBeGreaterThanOrEqual(DISPLAY_MIN_CELL_COUNT);
    expect(grid.cellsBelowK).toBe(0);
    expect(grid.published + grid.suppressed).toBe(grid.total);
    expect(grid.k).toBe(DISPLAY_MIN_CELL_COUNT);
  });

  it("rejects a nonsensical k or level cap instead of silently widening the layer", () => {
    expect(() => kAnonymiseCells([], 0)).toThrow(/positive integer/u);
    expect(() => kAnonymiseCells([], 5, -1)).toThrow(/non-negative integer/u);
  });
});

describe("the build salt", () => {
  const TMP = join(import.meta.dirname, "..", "out", "test-tmp", "encampment-salt");
  afterAll(() => rmSync(TMP, { recursive: true, force: true }));

  it("is regenerated on every build instead of being read back off disk", () => {
    mkdirSync(TMP, { recursive: true });
    const file = join(TMP, "encampment-salt.txt");
    const first = freshSalt(file);
    expect(readFileSync(file, "utf8").trim()).toBe(first);
    const second = freshSalt(file);
    expect(second).not.toBe(first);
    expect(readFileSync(file, "utf8").trim()).toBe(second);
    expect(first).toMatch(new RegExp(`^[0-9a-f]{${SALT_BYTES * 2}}$`, "u"));
    expect(existsSync(file)).toBe(true);
    if (process.platform !== "win32") {
      // 0600: a courtesy on top of the git-ignore, not the control itself
      expect(statSync(file).mode & 0o077).toBe(0);
    }
  });

  it("changes the published pseudonyms, which is the point of regenerating it", () => {
    const a = saltedId("a".repeat(64), "26-150147");
    const b = saltedId("b".repeat(64), "26-150147");
    expect(a).not.toBe(b);
  });

  it("moves the pseudonyms and nothing else: the display layer stays byte-identical", () => {
    // The accepted cost of a per-build salt is that `encampments-public.bin` is
    // no longer reproducible. This pins how far that cost reaches — the
    // k-anonymised density layer, which is what the map actually renders, does
    // not depend on the salt and is identical across builds.
    const rows = parseEncampmentCsv(CSV).rows;
    const first = buildEncampments(rows, TARGET, "a".repeat(64));
    const second = buildEncampments(rows, TARGET, "b".repeat(64));
    expect(JSON.stringify(second.display)).toBe(JSON.stringify(first.display));
    expect(Buffer.from(second.publicAsset).equals(Buffer.from(first.publicAsset))).toBe(false);
    // ...and the difference is confined to the hash column
    const a = unpackEncampmentsPublic(first.publicAsset);
    const b = unpackEncampmentsPublic(second.publicAsset);
    expect(Array.from(b.rowSlot)).toEqual(Array.from(a.rowSlot));
    expect(Array.from(b.nodeId)).toEqual(Array.from(a.nodeId));
    expect(b.rowHashHex).not.toEqual(a.rowHashHex);
  });

  it("is detected by the builder's own guard as hex, as bytes and as base64", () => {
    const salt = "0123456789abcdef".repeat(4);
    const raw = Buffer.from(salt, "hex");
    expect(saltMaterialIn(new TextEncoder().encode(`x${salt}y`), salt)).toBe(true);
    // a 16-hex window is still salt material
    expect(saltMaterialIn(new TextEncoder().encode(`lead-in ${salt.slice(20, 40)} tail`), salt)).toBe(true);
    expect(saltMaterialIn(new Uint8Array(raw), salt)).toBe(true);
    expect(saltMaterialIn(new TextEncoder().encode(raw.toString("base64")), salt)).toBe(true);
    expect(saltMaterialIn(new TextEncoder().encode("nothing to see here"), salt)).toBe(false);
    // the shipped pseudonym is derived FROM the salt but is not salt material
    expect(saltMaterialIn(new TextEncoder().encode(saltedId(salt, "26-150147")), salt)).toBe(false);
  });
});

describe("snap semantics the public build depends on", () => {
  it("preserves report order, so the engine's uniform draw lands on the same node", () => {
    const rows: RawReport[] = [
      { lon: -122.661, lat: 45.531, incId: "a" },
      { lon: -122.6809, lat: 45.5111, incId: "b" },
      { lon: -122.6705, lat: 45.5214, incId: "c" },
    ];
    const built = buildEncampments(rows, TARGET, "salt");
    const asset = unpackEncampmentsPublic(built.publicAsset);
    const nodeIdForRow = Array.from(asset.rowSlot).map((s) => asset.nodeId[s]!);
    expect(nodeIdForRow).toEqual([12, -1000, 11]);
  });
});
