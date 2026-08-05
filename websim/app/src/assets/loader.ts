/**
 * `assets/loader.ts` — the UI plane's only door to the built assets (WP11).
 *
 * Plan Q5 discipline, enforced here rather than hoped for at call sites: the
 * asset manifest (`@websim/shared/assets`) is fetched first, and **every**
 * manifest-listed asset fetch is SHA-256-verified against its manifest entry
 * before a single byte is handed to a caller. A mismatch throws an Error naming
 * the asset id, the expected digest and the actual digest — the negative-zeroing
 * lesson (Repast silently zeroing negative "number" constants) generalised:
 * never serve unverified bytes silently.
 *
 * Verified bytes are cached per asset id, so `graphForWorker()` +
 * `graphForMap()` cost one fetch pair, not two. Each call returns **fresh
 * `slice(0)` copies** of the cached bytes: the worker's copies get TRANSFERRED
 * (detached) by `SimWorkerClient.loadGraph`, and a detached buffer must never be
 * the map's decode input — or the cache's contents.
 *
 * URL layout (see `scripts/stage-assets.ts` and `vite.config.ts`): the pipeline
 * output is staged into Vite's `public/` dir, so an asset id in the manifest
 * (`"assets/graph-topology.bin"`, `"assets/data/shelters/….csv"`) **is** its
 * URL path relative to `import.meta.env.BASE_URL`. The `.br` variants listed in
 * the manifest are for hosts that serve pre-compressed files; `fetch()` sees
 * transfer encoding transparently, so the runtime always requests the plain
 * file and hashes the decoded bytes.
 */

import { safeParseAssetManifest, type AssetManifest } from "@websim/shared/assets";
import { unpackEncampmentsPublic, type EncampmentsPublic } from "@websim/shared/graph-asset";
import { decodeCsvBytes } from "@websim/engine/loader";
import type { SmokeSeriesAsset } from "@websim/engine/smoke";

// ---------------------------------------------------------------------------
// asset ids / paths
// ---------------------------------------------------------------------------

/** The manifest's own URL path. It is the root of trust and has no digest entry. */
export const ASSET_MANIFEST_PATH = "assets/assets-manifest.json" as const;

/** Manifest id of the eager routing-topology container. */
export const GRAPH_TOPOLOGY_ID = "assets/graph-topology.bin" as const;

/** Manifest id of the display-polyline geometry container. */
export const GRAPH_GEOMETRY_ID = "assets/graph-geometry.bin" as const;

/** Manifest id of the k-anonymised encampment density layer. */
export const ENCAMPMENT_DISPLAY_ID = "assets/encampments-display.json" as const;

/**
 * Manifest id of the PUBLIC encampment node tables (plan Q4): node-snapped
 * coordinates + salted row hashes, the shipped substitute for the raw campsite
 * CSV (which is never a public asset). WP11 integration addition: the Run
 * screen synthesises the worker's encampments CSV from this asset.
 */
export const ENCAMPMENTS_PUBLIC_ID = "assets/encampments-public.bin" as const;

/** Manifest id of one smoke series JSON. */
export function smokeAssetId(code: 0 | 1 | 2): string {
  return `assets/smoke-${code}.json`;
}

// ---------------------------------------------------------------------------
// public shapes
// ---------------------------------------------------------------------------

export interface GraphBuffers {
  readonly topology: ArrayBuffer;
  readonly geometry: ArrayBuffer;
}

/**
 * `encampments-display.json`, typed to its real shape
 * (`reu-wildfire-shelter-abm/encampment-density/v2`): grid-cell densities only,
 * k-anonymised at k = 5. The map renders this layer; it never receives points.
 */
export interface EncampmentDisplayGrid {
  readonly originLon: number;
  readonly originLat: number;
  readonly stepLon: number;
  readonly stepLat: number;
  readonly minCellWidthM: number;
  readonly minCellHeightM: number;
}

export interface EncampmentDisplayCell {
  readonly i: number;
  readonly j: number;
  /** Merge level: a level-L cell spans 150 m × 2^L; indices are level-relative. */
  readonly level: number;
  readonly count: number;
}

export interface EncampmentDisplay {
  readonly schema: string;
  readonly note: string;
  readonly grid: EncampmentDisplayGrid;
  readonly k: number;
  readonly maxMergeLevel: number;
  readonly cells: readonly EncampmentDisplayCell[];
  readonly published: number;
  readonly suppressed: number;
  readonly suppressedCells: number;
  readonly total: number;
  readonly minPublishedCount: number;
  readonly cellsBelowK: number;
  readonly levelCensus: Readonly<Record<string, number>>;
}

/**
 * `archive-bundles/index.json`, typed to its real shape
 * (`reu-wildfire-shelter-abm/archive-bundle-index/v1`).
 */
export interface ArchiveBundleEntry {
  readonly bundle_id: string;
  readonly run_dir: string;
  readonly preset_family: string;
  readonly seed: number | null;
  /** Bare file name under `archive-bundles/` — feed it to `archiveBundle()`. */
  readonly file: string;
  readonly bytes: number;
  /** Digest of the bundle file, recorded by the bundler for the Provenance screen. */
  readonly sha256: string;
  readonly has_per_agent: boolean;
  readonly gates_failed: readonly string[];
}

export interface ArchiveIndex {
  readonly schema: string;
  readonly archive_root_note: string;
  readonly archive_census: {
    readonly run_directories_with_a_manifest: number;
    readonly with_agents_csv: number;
    readonly with_shelters_csv: number;
    readonly by_preset_family: Readonly<Record<string, number>>;
  };
  readonly bundles: readonly ArchiveBundleEntry[];
}

export interface AppAssets {
  /** Parsed + schema-validated at load; the root of every digest check below. */
  readonly manifest: AssetManifest;
  /**
   * Fresh graph buffers for `SimWorkerClient.loadGraph`, which TRANSFERS them
   * (they detach on this side). Every call returns new copies of the cached,
   * verified bytes, so a second worker (or a re-init after a crash) never
   * receives a detached buffer.
   */
  graphForWorker(): Promise<GraphBuffers>;
  /** Independent copies for main-thread decode (map layers). Never transferred. */
  graphForMap(): Promise<GraphBuffers>;
  smoke(code: 0 | 1 | 2): Promise<SmokeSeriesAsset>;
  /**
   * Verbatim CSV text for `InitPayload.csv`, keyed by data-root-relative path,
   * e.g. `"data/shelters/shelters_2026_current_placement.csv"` (manifest id
   * `"assets/" + path`). Decoded through the engine's own `decodeCsvBytes`, the
   * BOM-preserving decoder (WP5-F1): the worker re-encodes this text and parses
   * it with the ported CsvLoader, so a leading U+FEFF must survive the round
   * trip byte-for-byte — the default `TextDecoder` would silently eat it.
   */
  csvText(dataRelativePath: string): Promise<string>;
  /**
   * The public encampment node-slot tables (`assets/encampments-public.bin`),
   * digest-verified and unpacked. The engine's resident placement draws over
   * report ROWS; `rowSlot` preserves that order, so a CSV synthesised from this
   * asset lands every draw on the same street node the raw feed lands on.
   */
  encampmentsPublic(): Promise<EncampmentsPublic>;
  encampmentDisplay(): Promise<EncampmentDisplay>;
  archiveIndex(): Promise<ArchiveIndex>;
  /** One bundle JSON by its `ArchiveBundleEntry.file` name. */
  archiveBundle(fileName: string): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// pure helpers (exported so tests exercise them without a DOM)
// ---------------------------------------------------------------------------

/** Lowercase hex SHA-256 via WebCrypto — the only hash this module uses. */
export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The run-blocking digest check. Kept as its own pure function so the error
 * contract — id, expected, actual, always all three — is testable directly.
 */
export function assertDigestMatches(id: string, expected: string, actual: string): void {
  if (actual !== expected) {
    throw new Error(
      `asset '${id}' failed SHA-256 verification: expected ${expected}, actual ${actual}. ` +
        "Unverified bytes are never served (plan Q5) — restage the assets " +
        "(npm run stage-assets -w app) or rebuild the pipeline output.",
    );
  }
}

/** Parse + schema-validate the manifest text. Throws with the Zod issue list. */
export function parseManifestText(text: string): AssetManifest {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`asset manifest is not valid JSON: ${(error as Error).message}`);
  }
  const parsed = safeParseAssetManifest(value);
  if (!parsed.ok) {
    throw new Error(`asset manifest failed schema validation: ${parsed.message}`);
  }
  return parsed.manifest;
}

/**
 * Structural validation of one smoke series JSON. The bytes are already
 * digest-verified; this guards the *shape* so a pipeline regression fails here,
 * with the asset id in the message, rather than inside `SmokeField`.
 */
export function parseSmokeSeriesAsset(id: string, value: unknown, code: 0 | 1 | 2): SmokeSeriesAsset {
  if (typeof value !== "object" || value === null) {
    throw new Error(`smoke asset '${id}' is not a JSON object`);
  }
  const a = value as { schema?: unknown; series?: unknown; slices?: unknown; hourly?: unknown };
  if (typeof a.schema !== "string") {
    throw new Error(`smoke asset '${id}' carries no schema string`);
  }
  if (a.series !== code) {
    throw new Error(`smoke asset '${id}' declares series ${String(a.series)}, expected ${code}`);
  }
  if (!Array.isArray(a.hourly) || typeof a.slices !== "number" || a.hourly.length !== a.slices) {
    throw new Error(
      `smoke asset '${id}' declares ${String(a.slices)} slices but carries ` +
        `${Array.isArray(a.hourly) ? a.hourly.length : "no"} hourly values`,
    );
  }
  for (let h = 0; h < a.hourly.length; h++) {
    const v: unknown = a.hourly[h];
    // `null` is the certified Double.NaN gap and must stay null; anything else
    // non-numeric would fabricate exposure input.
    if (v !== null && typeof v !== "number") {
      throw new Error(`smoke asset '${id}' hourly[${h}] is neither a number nor null`);
    }
  }
  return value as SmokeSeriesAsset;
}

/** Structural validation of the encampment density layer. */
export function parseEncampmentDisplay(value: unknown): EncampmentDisplay {
  if (typeof value !== "object" || value === null) {
    throw new Error(`asset '${ENCAMPMENT_DISPLAY_ID}' is not a JSON object`);
  }
  const v = value as { schema?: unknown; grid?: unknown; cells?: unknown; k?: unknown };
  if (typeof v.schema !== "string" || typeof v.grid !== "object" || v.grid === null) {
    throw new Error(`asset '${ENCAMPMENT_DISPLAY_ID}' carries no schema/grid`);
  }
  if (!Array.isArray(v.cells) || typeof v.k !== "number") {
    throw new Error(`asset '${ENCAMPMENT_DISPLAY_ID}' carries no cells array / k`);
  }
  return value as EncampmentDisplay;
}

/** Structural validation of the archive-bundle index. */
export function parseArchiveIndex(value: unknown): ArchiveIndex {
  if (typeof value !== "object" || value === null) {
    throw new Error("archive-bundles/index.json is not a JSON object");
  }
  const v = value as { schema?: unknown; bundles?: unknown };
  if (typeof v.schema !== "string") {
    throw new Error("archive-bundles/index.json carries no schema string");
  }
  if (!Array.isArray(v.bundles)) {
    throw new Error("archive-bundles/index.json carries no bundles array");
  }
  for (let i = 0; i < v.bundles.length; i++) {
    const b: unknown = v.bundles[i];
    if (typeof b !== "object" || b === null) {
      throw new Error(`archive index bundles[${i}] is not an object`);
    }
    // Every field `ArchiveBundleEntry` declares is checked before the cast —
    // the same standard `parseSmokeSeriesAsset` holds itself to. This is the
    // one JSON payload with no manifest digest, so the shape check is the only
    // thing standing between a stale/hand-edited index and a render-time
    // TypeError (e.g. `gatesFailed.length` on undefined in Run.tsx).
    const e = b as {
      bundle_id?: unknown;
      run_dir?: unknown;
      preset_family?: unknown;
      seed?: unknown;
      file?: unknown;
      bytes?: unknown;
      sha256?: unknown;
      has_per_agent?: unknown;
      gates_failed?: unknown;
    };
    if (typeof e.bundle_id !== "string" || typeof e.file !== "string" || typeof e.sha256 !== "string") {
      throw new Error(`archive index bundles[${i}] is missing bundle_id/file/sha256`);
    }
    if (typeof e.run_dir !== "string" || typeof e.preset_family !== "string") {
      throw new Error(`archive index bundles[${i}] is missing run_dir/preset_family`);
    }
    if (e.seed !== null && typeof e.seed !== "number") {
      throw new Error(`archive index bundles[${i}].seed is neither a number nor null`);
    }
    if (typeof e.bytes !== "number") {
      throw new Error(`archive index bundles[${i}].bytes is not a number`);
    }
    if (typeof e.has_per_agent !== "boolean") {
      throw new Error(`archive index bundles[${i}].has_per_agent is not a boolean`);
    }
    if (!Array.isArray(e.gates_failed) || e.gates_failed.some((g) => typeof g !== "string")) {
      throw new Error(`archive index bundles[${i}].gates_failed is not an array of strings`);
    }
  }
  return value as ArchiveIndex;
}

// ---------------------------------------------------------------------------
// loader
// ---------------------------------------------------------------------------

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`asset fetch failed for '${url}': HTTP ${response.status}`);
  }
  return response.arrayBuffer();
}

/**
 * Fetch one file from `archive-bundles/`.
 *
 * Archive bundles are deliberately NOT digest-checked here: they are not in the
 * asset manifest, because the manifest covers the pipeline-built assets whose
 * digests feed `sim_id` (a live run's replay token), while the bundles are
 * read-only digests of the certified Java archive — they never feed a live
 * computation, only the archived provenance class. Their integrity record is
 * the index's own per-bundle `sha256`/`bytes` fields, which the Provenance
 * screen renders; the honesty floor enforced here is that bytes that do not
 * parse as JSON are refused rather than passed through.
 */
async function fetchArchiveJson(base: string, fileName: string): Promise<unknown> {
  if (fileName.length === 0 || fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) {
    throw new Error(
      `archive bundle file name '${fileName}' is not a bare file name; ` +
        "use ArchiveBundleEntry.file from the archive index",
    );
  }
  const url = `${base}archive-bundles/${fileName}`;
  const text = new TextDecoder().decode(await fetchBytes(url));
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`archive bundle '${fileName}' is not valid JSON: ${(error as Error).message}`);
  }
}

/**
 * Fetch the manifest, then hand back the verified-asset accessors.
 *
 * @param baseUrl deployment base; defaults to `import.meta.env.BASE_URL`
 *                (tests pass an explicit origin and stub `globalThis.fetch`).
 */
export async function loadAppAssets(baseUrl?: string): Promise<AppAssets> {
  const base = normalizeBaseUrl(baseUrl ?? import.meta.env.BASE_URL);

  // The manifest is the root of trust, so it cannot be digest-checked against
  // itself; it is schema-validated instead, and everything else checks against it.
  const manifest = parseManifestText(new TextDecoder().decode(await fetchBytes(base + ASSET_MANIFEST_PATH)));

  // Verified bytes per asset id. A Map used for get/set only — never iterated,
  // so no displayed order can depend on it. Caching the in-flight promise also
  // collapses concurrent requests for the same asset into one fetch.
  const cache = new Map<string, Promise<ArrayBuffer>>();

  const verifiedBytes = (id: string): Promise<ArrayBuffer> => {
    const hit = cache.get(id);
    if (hit !== undefined) {
      return hit;
    }
    const pending = (async (): Promise<ArrayBuffer> => {
      const entry = manifest.assets[id];
      if (entry === undefined) {
        throw new Error(
          `asset '${id}' is not in the asset manifest — refusing to fetch bytes that cannot be verified`,
        );
      }
      const bytes = await fetchBytes(base + id);
      assertDigestMatches(id, entry.sha256, await sha256Hex(bytes));
      return bytes;
    })();
    // A rejected fetch/digest must not poison the cache: evict so a retry
    // (e.g. after restaging assets in dev) refetches instead of re-throwing.
    pending.catch(() => {
      cache.delete(id);
    });
    cache.set(id, pending);
    return pending;
  };

  const verifiedJson = async (id: string): Promise<unknown> => {
    const text = new TextDecoder().decode(await verifiedBytes(id));
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new Error(`asset '${id}' passed its digest check but is not valid JSON: ${(error as Error).message}`);
    }
  };

  // One implementation behind both graph accessors: each CALL slices fresh
  // copies out of the cache, so detaching one caller's buffers (the worker
  // transfer) can never reach another caller's — or the cache's — bytes.
  const freshGraphBuffers = async (): Promise<GraphBuffers> => {
    const [topology, geometry] = await Promise.all([
      verifiedBytes(GRAPH_TOPOLOGY_ID),
      verifiedBytes(GRAPH_GEOMETRY_ID),
    ]);
    return { topology: topology.slice(0), geometry: geometry.slice(0) };
  };

  return {
    manifest,
    graphForWorker: freshGraphBuffers,
    graphForMap: freshGraphBuffers,
    smoke: async (code: 0 | 1 | 2): Promise<SmokeSeriesAsset> => {
      const id = smokeAssetId(code);
      return parseSmokeSeriesAsset(id, await verifiedJson(id), code);
    },
    csvText: async (dataRelativePath: string): Promise<string> => {
      const bytes = await verifiedBytes(`assets/${dataRelativePath}`);
      return decodeCsvBytes(new Uint8Array(bytes));
    },
    encampmentsPublic: async (): Promise<EncampmentsPublic> =>
      unpackEncampmentsPublic(new Uint8Array(await verifiedBytes(ENCAMPMENTS_PUBLIC_ID))),
    encampmentDisplay: async (): Promise<EncampmentDisplay> =>
      parseEncampmentDisplay(await verifiedJson(ENCAMPMENT_DISPLAY_ID)),
    archiveIndex: async (): Promise<ArchiveIndex> => parseArchiveIndex(await fetchArchiveJson(base, "index.json")),
    archiveBundle: async (fileName: string): Promise<unknown> => fetchArchiveJson(base, fileName),
  };
}
