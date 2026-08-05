/**
 * Tests for `src/assets/loader.ts` (WP11).
 *
 * Everything runs in Node against a `globalThis.fetch` stub serving tiny
 * in-memory fixtures whose SHA-256s are computed with the same WebCrypto
 * primitive the loader uses. The three contract points under test:
 *
 *  1. a digest PASS serves bytes (and caches them — one fetch per asset id);
 *  2. a digest MISMATCH throws an Error naming the asset id, the expected and
 *     the actual hash — unverified bytes are never served;
 *  3. `graphForWorker()` and `graphForMap()` return independent copies, so
 *     detaching the worker's buffers (the transfer) cannot reach the map's.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ASSET_MANIFEST_PATH,
  ENCAMPMENT_DISPLAY_ID,
  GRAPH_GEOMETRY_ID,
  GRAPH_TOPOLOGY_ID,
  assertDigestMatches,
  loadAppAssets,
  parseArchiveIndex,
  parseManifestText,
  parseSmokeSeriesAsset,
  sha256Hex,
  smokeAssetId,
} from "../src/assets/loader.js";

const BASE = "https://sim.test/app/";
const encoder = new TextEncoder();

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const TOPOLOGY_BYTES = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
const GEOMETRY_BYTES = Uint8Array.from([9, 8, 7, 6, 5]);
const SMOKE_1 = {
  schema: "reu-wildfire-shelter-abm/smoke-series/v1",
  series: 1,
  slices: 3,
  hourly: [12.5, null, 40.25],
};
// Leading EF BB BF: the BOM the certified Java loader KEEPS as a character.
const CSV_PATH = "data/shelters/fixture.csv";
const CSV_BYTES = Uint8Array.from([0xef, 0xbb, 0xbf, ...encoder.encode("name,beds\nalpha,10\n")]);
const ENCAMPMENTS = {
  schema: "reu-wildfire-shelter-abm/encampment-density/v2",
  note: "fixture",
  grid: { originLon: -180, originLat: -90, stepLon: 0.001, stepLat: 0.001, minCellWidthM: 150, minCellHeightM: 150 },
  k: 5,
  maxMergeLevel: 5,
  cells: [{ i: 1, j: 2, level: 0, count: 5 }],
  published: 5,
  suppressed: 0,
  suppressedCells: 0,
  total: 5,
  minPublishedCount: 5,
  cellsBelowK: 0,
  levelCensus: { "0": 1 },
};
const ARCHIVE_INDEX = {
  schema: "reu-wildfire-shelter-abm/archive-bundle-index/v1",
  archive_root_note: "fixture note",
  archive_census: {
    run_directories_with_a_manifest: 1,
    with_agents_csv: 1,
    with_shelters_csv: 1,
    by_preset_family: { LEGACY: 1 },
  },
  bundles: [
    {
      bundle_id: "final-baseline",
      run_dir: "final-baseline",
      preset_family: "LEGACY",
      seed: null,
      file: "final-baseline.json",
      bytes: 2,
      sha256: "a".repeat(64),
      has_per_agent: true,
      gates_failed: [],
    },
  ],
};

async function manifestEntry(bytes: Uint8Array): Promise<Record<string, unknown>> {
  return {
    sha256: await sha256Hex(bytes),
    bytes: bytes.length,
    source_file: "Geography/test/fixture",
    source_sha256: "0".repeat(64),
    build_commit: "fixture",
    built_utc: "2026-01-01T00:00:00Z",
    tool_versions: { node: "fixture" },
  };
}

/** URL → served bytes. Mutated per test to corrupt or drop files. */
let files: Map<string, Uint8Array>;
/** Every URL the stub actually served, in order. */
let fetchLog: string[];
let realFetch: typeof fetch;

async function buildFiles(): Promise<Map<string, Uint8Array>> {
  const smoke1Bytes = encoder.encode(JSON.stringify(SMOKE_1));
  const encampmentBytes = encoder.encode(JSON.stringify(ENCAMPMENTS));
  const manifest = {
    schema: "reu-wildfire-shelter-abm/assets/v1",
    built_utc: "2026-01-01T00:00:00Z",
    build_commit: "fixture",
    assets: {
      [GRAPH_TOPOLOGY_ID]: await manifestEntry(TOPOLOGY_BYTES),
      [GRAPH_GEOMETRY_ID]: await manifestEntry(GEOMETRY_BYTES),
      [smokeAssetId(1)]: await manifestEntry(smoke1Bytes),
      [`assets/${CSV_PATH}`]: await manifestEntry(CSV_BYTES),
      [ENCAMPMENT_DISPLAY_ID]: await manifestEntry(encampmentBytes),
    },
  };
  return new Map<string, Uint8Array>([
    [BASE + ASSET_MANIFEST_PATH, encoder.encode(JSON.stringify(manifest))],
    [BASE + GRAPH_TOPOLOGY_ID, TOPOLOGY_BYTES],
    [BASE + GRAPH_GEOMETRY_ID, GEOMETRY_BYTES],
    [BASE + smokeAssetId(1), smoke1Bytes],
    [`${BASE}assets/${CSV_PATH}`, CSV_BYTES],
    [BASE + ENCAMPMENT_DISPLAY_ID, encampmentBytes],
    [`${BASE}archive-bundles/index.json`, encoder.encode(JSON.stringify(ARCHIVE_INDEX))],
    [`${BASE}archive-bundles/final-baseline.json`, encoder.encode(JSON.stringify({ run: "final-baseline" }))],
    [`${BASE}archive-bundles/broken.json`, encoder.encode("{ not json")],
  ]);
}

beforeEach(async () => {
  files = await buildFiles();
  fetchLog = [];
  realFetch = globalThis.fetch;
  const stub = (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = files.get(url);
    if (body === undefined) {
      return Promise.resolve({ ok: false, status: 404 } as unknown as Response);
    }
    fetchLog.push(url);
    // Fresh exact-length buffer per response, like a real fetch.
    return Promise.resolve({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(body.slice().buffer),
    } as unknown as Response);
  };
  globalThis.fetch = stub as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

// ---------------------------------------------------------------------------
// pure helpers
// ---------------------------------------------------------------------------

describe("digest contract", () => {
  it("passes silently on a match", () => {
    expect(() => assertDigestMatches("assets/x.bin", "ab".repeat(32), "ab".repeat(32))).not.toThrow();
  });

  it("throws naming the id, the expected and the actual hash", () => {
    const expected = "ab".repeat(32);
    const actual = "cd".repeat(32);
    let message = "";
    try {
      assertDigestMatches("assets/x.bin", expected, actual);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("assets/x.bin");
    expect(message).toContain(expected);
    expect(message).toContain(actual);
  });

  it("computes the FIPS-180 empty-input SHA-256", async () => {
    expect(await sha256Hex(new Uint8Array(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("parseManifestText", () => {
  it("rejects non-JSON and schema violations with distinct messages", () => {
    expect(() => parseManifestText("{ nope")).toThrow(/not valid JSON/);
    expect(() => parseManifestText(JSON.stringify({ schema: "wrong/schema" }))).toThrow(/schema validation/);
  });
});

describe("parseSmokeSeriesAsset", () => {
  it("accepts the real shape and keeps null gaps null", () => {
    const parsed = parseSmokeSeriesAsset(smokeAssetId(1), SMOKE_1, 1);
    expect(parsed.slices).toBe(3);
    expect(parsed.hourly[1]).toBeNull();
  });

  it("rejects a series-code mismatch", () => {
    expect(() => parseSmokeSeriesAsset(smokeAssetId(2), SMOKE_1, 2)).toThrow(/declares series 1, expected 2/);
  });

  it("rejects a slices/hourly length disagreement", () => {
    const bad = { ...SMOKE_1, slices: 4 };
    expect(() => parseSmokeSeriesAsset(smokeAssetId(1), bad, 1)).toThrow(/declares 4 slices but carries 3/);
  });

  it("rejects a non-numeric non-null hourly value", () => {
    const bad = { ...SMOKE_1, hourly: [1, "gap", 3] };
    expect(() => parseSmokeSeriesAsset(smokeAssetId(1), bad, 1)).toThrow(/hourly\[1\]/);
  });
});

describe("parseArchiveIndex", () => {
  it("accepts the real shape", () => {
    const parsed = parseArchiveIndex(ARCHIVE_INDEX);
    expect(parsed.bundles).toHaveLength(1);
    expect(parsed.bundles[0]?.file).toBe("final-baseline.json");
  });

  it("rejects a bundle row missing its identity fields", () => {
    const bad = { ...ARCHIVE_INDEX, bundles: [{ bundle_id: "x" }] };
    expect(() => parseArchiveIndex(bad)).toThrow(/bundles\[0\]/);
  });
});

// ---------------------------------------------------------------------------
// loadAppAssets against the fetch stub
// ---------------------------------------------------------------------------

describe("loadAppAssets", () => {
  it("fetches and schema-validates the manifest first", async () => {
    const assets = await loadAppAssets(BASE);
    expect(assets.manifest.schema).toBe("reu-wildfire-shelter-abm/assets/v1");
    expect(fetchLog).toEqual([BASE + ASSET_MANIFEST_PATH]);
  });

  it("rejects when the manifest fails schema validation", async () => {
    files.set(BASE + ASSET_MANIFEST_PATH, encoder.encode(JSON.stringify({ schema: "wrong" })));
    await expect(loadAppAssets(BASE)).rejects.toThrow(/schema validation/);
  });

  it("serves digest-verified graph buffers and fetches each asset exactly once", async () => {
    const assets = await loadAppAssets(BASE);
    const worker = await assets.graphForWorker();
    const map = await assets.graphForMap();
    expect(new Uint8Array(worker.topology)).toEqual(TOPOLOGY_BYTES);
    expect(new Uint8Array(worker.geometry)).toEqual(GEOMETRY_BYTES);
    // Cache: two accessor calls, one fetch per underlying asset.
    expect(fetchLog.filter((u) => u === BASE + GRAPH_TOPOLOGY_ID)).toHaveLength(1);
    expect(fetchLog.filter((u) => u === BASE + GRAPH_GEOMETRY_ID)).toHaveLength(1);
    expect(map.topology.byteLength).toBe(TOPOLOGY_BYTES.length);
  });

  it("returns independent buffers: detaching the worker copy leaves the map copy intact", async () => {
    const assets = await loadAppAssets(BASE);
    const worker = await assets.graphForWorker();
    const map = await assets.graphForMap();
    expect(worker.topology).not.toBe(map.topology);
    expect(worker.geometry).not.toBe(map.geometry);
    // Simulate the Comlink transfer: detach the worker's buffers.
    structuredClone(worker.topology, { transfer: [worker.topology] });
    structuredClone(worker.geometry, { transfer: [worker.geometry] });
    expect(worker.topology.byteLength).toBe(0);
    // The map copies — and a later fresh worker copy — are unaffected.
    expect(map.topology.byteLength).toBe(TOPOLOGY_BYTES.length);
    expect(new Uint8Array(map.topology)).toEqual(TOPOLOGY_BYTES);
    const again = await assets.graphForWorker();
    expect(again.topology.byteLength).toBe(TOPOLOGY_BYTES.length);
  });

  it("throws on a digest mismatch, naming the id and both hashes, and serves no bytes", async () => {
    const corrupted = TOPOLOGY_BYTES.slice();
    corrupted[0] = corrupted[0]! ^ 0xff;
    files.set(BASE + GRAPH_TOPOLOGY_ID, corrupted);
    const assets = await loadAppAssets(BASE);
    const expected = await sha256Hex(TOPOLOGY_BYTES);
    const actual = await sha256Hex(corrupted);
    let message = "";
    try {
      await assets.graphForWorker();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(GRAPH_TOPOLOGY_ID);
    expect(message).toContain(expected);
    expect(message).toContain(actual);
  });

  it("refuses an asset id absent from the manifest without fetching it", async () => {
    const assets = await loadAppAssets(BASE);
    await expect(assets.csvText("data/shelters/not-a-real-file.csv")).rejects.toThrow(
      /'assets\/data\/shelters\/not-a-real-file\.csv' is not in the asset manifest/,
    );
    expect(fetchLog.some((u) => u.includes("not-a-real-file"))).toBe(false);
  });

  it("smoke(1) parses the verified JSON into the SmokeSeriesAsset shape", async () => {
    const assets = await loadAppAssets(BASE);
    const smoke = await assets.smoke(1);
    expect(smoke.series).toBe(1);
    expect(smoke.slices).toBe(3);
    expect(smoke.hourly).toEqual([12.5, null, 40.25]);
  });

  it("csvText preserves a leading BOM as a character (WP5-F1 parity)", async () => {
    const assets = await loadAppAssets(BASE);
    const text = await assets.csvText(CSV_PATH);
    // The certified Java loader sees U+FEFF and strips it from the header line
    // itself; the loader must not pre-strip it during decode.
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain("name,beds");
    // Round trip: re-encoding (what the worker does) restores the exact bytes.
    expect(encoder.encode(text)).toEqual(CSV_BYTES);
  });

  it("encampmentDisplay returns the typed density layer", async () => {
    const assets = await loadAppAssets(BASE);
    const layer = await assets.encampmentDisplay();
    expect(layer.k).toBe(5);
    expect(layer.cells[0]?.count).toBe(5);
  });

  it("archiveIndex and archiveBundle work without a manifest digest, but reject non-JSON", async () => {
    const assets = await loadAppAssets(BASE);
    const index = await assets.archiveIndex();
    expect(index.bundles[0]?.bundle_id).toBe("final-baseline");
    const bundle = await assets.archiveBundle("final-baseline.json");
    expect(bundle).toEqual({ run: "final-baseline" });
    await expect(assets.archiveBundle("broken.json")).rejects.toThrow(/'broken\.json' is not valid JSON/);
  });

  it("archiveBundle rejects a path that is not a bare file name", async () => {
    const assets = await loadAppAssets(BASE);
    await expect(assets.archiveBundle("../assets/graph-topology.bin")).rejects.toThrow(/bare file name/);
  });

  it("reports an HTTP failure with the URL and status", async () => {
    files.delete(BASE + GRAPH_GEOMETRY_ID);
    const assets = await loadAppAssets(BASE);
    await expect(assets.graphForMap()).rejects.toThrow(/graph-geometry\.bin': HTTP 404/);
  });

  it("retries after a failure instead of caching the rejection", async () => {
    const corrupted = GEOMETRY_BYTES.slice();
    corrupted[0] = corrupted[0]! ^ 0xff;
    files.set(BASE + GRAPH_GEOMETRY_ID, corrupted);
    const assets = await loadAppAssets(BASE);
    await expect(assets.graphForMap()).rejects.toThrow(/failed SHA-256 verification/);
    // Dev restages the assets; the next call must refetch and succeed.
    files.set(BASE + GRAPH_GEOMETRY_ID, GEOMETRY_BYTES);
    const buffers = await assets.graphForMap();
    expect(new Uint8Array(buffers.geometry)).toEqual(GEOMETRY_BYTES);
  });
});
