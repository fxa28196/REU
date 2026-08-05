/**
 * Tests for tools/deploy-check.ts — the WP14 publish guard over app/dist.
 *
 * Every rule is proved able to FAIL on a seeded positive fixture (a gate that
 * cannot be shown to fail is decoration — §8.2's own standard), and the clean
 * fixture is proved to pass. Fixtures are synthetic trees under a fresh OS
 * temp dir per test; no real asset, no real raw row, and no DOM.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  PLACEHOLDER_QUARANTINE,
  buildRawReference,
  compareStagedAssets,
  isViteChunk,
  runDeployCheck,
  scanPlaceholders,
  scanRawEncampmentData,
  verdictExitCode,
} from "../deploy-check.js";
import { createHash } from "node:crypto";

// Synthetic raw feed — BOM + CRLF + quoted fields, the real feed's dialect.
// Coordinates are inside the Portland bounding box but invented.
const RAW_CSV =
  "﻿" +
  '"lon","lat","inc_date","inc_id","is_vehicle"\r\n' +
  '"-122.612345","45.523456","2026-07-23","26-150147","No"\r\n' +
  '"-122.698765","45.487654","2026-07-23","26-150146","Yes"\r\n';

const RAW_LON = -122.612345;
const RAW_LAT = 45.523456;

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A minimal CLEAN fixture: pipeline assets (manifest + one data CSV + one
 * extra unlisted file), archive bundles, and a dist staged from them plus the
 * Vite outputs (index.html + hashed chunks).
 */
function makeFixture(): { root: string; dist: string; pipeAssets: string; pipeBundles: string; raw: string } {
  const root = mkdtempSync(join(tmpdir(), "deploy-check-"));
  tempDirs.push(root);

  const pipeAssets = join(root, "pipeline-out", "assets");
  const pipeBundles = join(root, "pipeline-out", "archive-bundles");
  const dist = join(root, "dist");
  mkdirSync(join(pipeAssets, "data"), { recursive: true });
  mkdirSync(pipeBundles, { recursive: true });
  mkdirSync(join(dist, "assets", "data"), { recursive: true });
  mkdirSync(join(dist, "archive-bundles"), { recursive: true });

  const shelterCsv = "shelter_id,name,lon,lat,capacity,status\r\nS1,Alpha Hall,-122.5,45.5,100,operating\r\n";
  const manifest = JSON.stringify({
    schema: "reu-wildfire-shelter-abm/assets/v1",
    assets: { "assets/data/shelters.csv": { sha256: sha256(shelterCsv), bytes: shelterCsv.length } },
  });
  const bundle = JSON.stringify({ headline: { sheltered: 2060 } });
  const extraBin = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9]);

  // pipeline side
  writeFileSync(join(pipeAssets, "assets-manifest.json"), manifest);
  writeFileSync(join(pipeAssets, "data", "shelters.csv"), shelterCsv);
  writeFileSync(join(pipeAssets, "extra.bin"), extraBin); // unlisted but pipeline-produced
  writeFileSync(join(pipeBundles, "index.json"), bundle);

  // dist side = staged copies + Vite outputs
  writeFileSync(join(dist, "assets", "assets-manifest.json"), manifest);
  writeFileSync(join(dist, "assets", "data", "shelters.csv"), shelterCsv);
  writeFileSync(join(dist, "assets", "extra.bin"), extraBin);
  writeFileSync(join(dist, "archive-bundles", "index.json"), bundle);
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>Capacity Is Not Access</title>");
  writeFileSync(join(dist, "assets", "index-Cyq9Cr2y.js"), 'console.log("app")');
  writeFileSync(join(dist, "assets", "index-CKiDnQvI.css"), "body{margin:0}");

  const raw = join(root, "raw.csv");
  writeFileSync(raw, RAW_CSV);
  return { root, dist, pipeAssets, pipeBundles, raw };
}

function check(f: ReturnType<typeof makeFixture>) {
  return runDeployCheck({
    distDir: f.dist,
    pipelineAssetsDir: f.pipeAssets,
    pipelineBundlesDir: f.pipeBundles,
    rawCsvPath: f.raw,
  });
}

describe("raw reference parsing", () => {
  it("parses the BOM+CRLF quoted dialect and both rows", () => {
    const ref = buildRawReference(RAW_CSV);
    expect(ref.rowCount).toBe(2);
    expect(ref.coordValues.has(RAW_LON)).toBe(true);
    expect(ref.coordValues.has(RAW_LAT)).toBe(true);
    expect(ref.incIds.has("26-150147")).toBe(true);
    expect(ref.lonText.has("-122.612345")).toBe(true);
  });
});

describe("rule raw-encampment-data", () => {
  const ref = buildRawReference(RAW_CSV);

  it("blocks a lon+lat text pair of the same raw row in any file", () => {
    const f = scanRawEncampmentData(
      "assets/chunk-abc.js",
      Buffer.from(`var p=[${RAW_LON},${RAW_LAT}];`),
      ref,
    );
    expect(f.some((x) => x.blocking && x.detail.includes("fully located"))).toBe(true);
    expect(f.every((x) => x.rule === "raw-encampment-data")).toBe(true);
  });

  it("reports a lone text component as advisory in text files, blocking in our binaries", () => {
    const lone = Buffer.from(`var lon=${RAW_LON};`);
    const inJs = scanRawEncampmentData("assets/chunk-abc.js", lone, ref);
    expect(inJs.length).toBeGreaterThan(0);
    expect(inJs.every((x) => !x.blocking)).toBe(true);
    const inBin = scanRawEncampmentData("assets/encampments-public.bin", lone, ref);
    expect(inBin.some((x) => x.blocking)).toBe(true);
  });

  it("blocks the raw coordinate as float64 bytes at any offset, either endianness", () => {
    for (const littleEndian of [true, false]) {
      const buf = Buffer.alloc(17);
      if (littleEndian) {
        buf.writeDoubleLE(RAW_LAT, 3); // deliberately unaligned
      } else {
        buf.writeDoubleBE(RAW_LAT, 3);
      }
      const f = scanRawEncampmentData("assets/some.bin", buf, ref);
      expect(f.some((x) => x.blocking && x.detail.includes("float64"))).toBe(true);
    }
  });

  it("blocks a raw inc_id and any inc_id-shaped token", () => {
    const real = scanRawEncampmentData("index.html", Buffer.from("report 26-150147 here"), ref);
    expect(real.some((x) => x.blocking && x.detail.includes("raw inc_id"))).toBe(true);
    const shaped = scanRawEncampmentData("index.html", Buffer.from("id 99-123456."), ref);
    expect(shaped.some((x) => x.blocking && x.detail.includes("inc_id-shaped"))).toBe(true);
  });

  it("stays silent on clean coordinates and dates", () => {
    const f = scanRawEncampmentData(
      "assets/chunk.js",
      Buffer.from("center:[-122.66,45.52] built 2026-08-02 v=45.499999"),
      ref,
    );
    expect(f).toEqual([]);
  });
});

describe("rule placeholder-marker", () => {
  it("blocks TODO/FIXME/TKTK/PLACEHOLDER/lorem ipsum in user-visible text", () => {
    for (const text of ["a TODO b", "FIXME later", "TKTK", "the PLACEHOLDER text", "Lorem Ipsum dolor"]) {
      const f = scanPlaceholders("index.html", Buffer.from(text));
      expect(f.some((x) => x.blocking && x.rule === "placeholder-marker"), text).toBe(true);
    }
  });

  it("ignores lowercase placeholder= (the HTML attribute) and sourcemaps", () => {
    expect(scanPlaceholders("index.html", Buffer.from('<input placeholder="seed">'))).toEqual([]);
    expect(scanPlaceholders("assets/x-12345678.js.map", Buffer.from("TODO FIXME"))).toEqual([]);
  });

  it("downgrades the pinned vendor shader window to advisory, and ONLY that window", () => {
    const quarantined = scanPlaceholders(
      "assets/index-abc.js",
      Buffer.from("color = vec4(1.0); // TODO , geometry.position);"),
    );
    expect(quarantined.length).toBe(1);
    expect(quarantined[0]!.blocking).toBe(false);
    const other = scanPlaceholders("assets/index-abc.js", Buffer.from("// TODO wire this up"));
    expect(other.some((x) => x.blocking)).toBe(true);
    // The quarantine list itself stays pinned: growing it is a reviewed act.
    expect(PLACEHOLDER_QUARANTINE.map((q) => q.window)).toEqual(["TODO , geometry.position"]);
  });
});

describe("rule manifest-mismatch", () => {
  it("passes on a faithfully staged tree", () => {
    const f = makeFixture();
    const findings = compareStagedAssets(f.dist, f.pipeAssets, f.pipeBundles);
    expect(findings).toEqual([]);
  });

  it("blocks when the dist manifest bytes differ from pipeline/out", () => {
    const f = makeFixture();
    writeFileSync(join(f.dist, "assets", "assets-manifest.json"), "{}");
    const findings = compareStagedAssets(f.dist, f.pipeAssets, f.pipeBundles);
    expect(findings.some((x) => x.blocking && x.detail.includes("not byte-identical"))).toBe(true);
  });

  it("blocks when a manifest-listed asset is missing from dist or hashes differently", () => {
    const f = makeFixture();
    writeFileSync(join(f.dist, "assets", "data", "shelters.csv"), "tampered");
    const tampered = compareStagedAssets(f.dist, f.pipeAssets, f.pipeBundles);
    expect(tampered.some((x) => x.blocking && x.detail.includes("manifest promises"))).toBe(true);

    rmSync(join(f.dist, "assets", "data", "shelters.csv"));
    const missing = compareStagedAssets(f.dist, f.pipeAssets, f.pipeBundles);
    expect(missing.some((x) => x.blocking && x.detail.includes("missing from dist"))).toBe(true);
  });

  it("blocks stale unlisted pipeline files and stale archive bundles", () => {
    const f = makeFixture();
    writeFileSync(join(f.dist, "assets", "extra.bin"), Buffer.from([9, 9]));
    writeFileSync(join(f.dist, "archive-bundles", "index.json"), "{}");
    const findings = compareStagedAssets(f.dist, f.pipeAssets, f.pipeBundles);
    expect(findings.filter((x) => x.detail.includes("stale staging")).length).toBeGreaterThanOrEqual(2);
  });

  it("blocks an unexplained file in dist/assets (neither pipeline asset nor Vite chunk)", () => {
    const f = makeFixture();
    writeFileSync(join(f.dist, "assets", "notes.txt"), "who put this here");
    const findings = compareStagedAssets(f.dist, f.pipeAssets, f.pipeBundles);
    expect(findings.some((x) => x.blocking && x.file === "assets/notes.txt")).toBe(true);
  });

  it("recognises Vite chunk names and nothing else", () => {
    expect(isViteChunk("index-Cyq9Cr2y.js")).toBe(true);
    expect(isViteChunk("simWorker-S7_VXPWm.js.map")).toBe(true);
    expect(isViteChunk("index-CKiDnQvI.css")).toBe(true);
    expect(isViteChunk("notes.txt")).toBe(false);
    expect(isViteChunk("data/shelters.csv")).toBe(false);
    expect(isViteChunk("nested/index-Cyq9Cr2y.js")).toBe(false);
  });
});

describe("runDeployCheck end to end", () => {
  it("passes the clean fixture with exit code 0", () => {
    const result = check(makeFixture());
    expect(result.refusals).toEqual([]);
    expect(result.blocking).toEqual([]);
    expect(verdictExitCode(result)).toBe(0);
    expect(result.filesScanned).toBeGreaterThan(0);
    expect(result.rawRows).toBe(2);
  });

  it("fails (exit 1) with the rule named when a leak, a mismatch and a placeholder are seeded", () => {
    const f = makeFixture();
    writeFileSync(
      join(f.dist, "index.html"),
      `<p>TODO finish this</p><p>${RAW_LON} ${RAW_LAT} 26-150147</p>`,
    );
    writeFileSync(join(f.dist, "assets", "assets-manifest.json"), "{}");
    const result = check(f);
    expect(verdictExitCode(result)).toBe(1);
    const rules = new Set(result.blocking.map((x) => x.rule));
    expect(rules.has("raw-encampment-data")).toBe(true);
    expect(rules.has("manifest-mismatch")).toBe(true);
    expect(rules.has("placeholder-marker")).toBe(true);
  });

  it("REFUSES (exit 2) rather than passing when dist, pipeline assets or the raw feed is absent", () => {
    const f = makeFixture();
    const noDist = runDeployCheck({
      distDir: join(f.root, "no-dist"),
      pipelineAssetsDir: f.pipeAssets,
      pipelineBundlesDir: f.pipeBundles,
      rawCsvPath: f.raw,
    });
    expect(verdictExitCode(noDist)).toBe(2);
    expect(noDist.refusals.length).toBeGreaterThan(0);

    const noRaw = runDeployCheck({
      distDir: f.dist,
      pipelineAssetsDir: f.pipeAssets,
      pipelineBundlesDir: f.pipeBundles,
      rawCsvPath: join(f.root, "no-raw.csv"),
    });
    expect(verdictExitCode(noRaw)).toBe(2);
    expect(noRaw.refusals.some((r) => r.includes("cannot be proved without the raw data"))).toBe(true);

    const noPipe = runDeployCheck({
      distDir: f.dist,
      pipelineAssetsDir: join(f.root, "no-pipe"),
      pipelineBundlesDir: f.pipeBundles,
      rawCsvPath: f.raw,
    });
    expect(verdictExitCode(noPipe)).toBe(2);
  });
});
