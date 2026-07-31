/**
 * build-encampments.ts — WP4: the PUBLIC encampment layer (plan Q4, §4).
 *
 *   tsx pipeline/scripts/build-encampments.ts [--raw <csv>] [--graph <bin>]
 *                                             [--out <dir>] [--destroy-salt]
 *
 * The input is 3,400 precise, current, complaint-reported campsite locations.
 * Republishing them is a targeting/sweep risk and is a hard ship-blocker, so Q4
 * fixes the public default and this script implements exactly that, no options:
 *
 * - every report's coordinate is replaced by the coordinate of the **nearest
 *   street node**, using the same degree-space nearest-neighbour the engine
 *   snaps with, so the sim-relevant quantity (which node a resident starts at)
 *   survives and the precise location does not;
 * - the node table is **deduplicated per node** — a node many reports share is
 *   carried once;
 * - `inc_id` becomes a **salted SHA-256 truncated to 12 hex**; the salt is
 *   **freshly generated on every build** (never loaded back from disk), is
 *   written only into the git-ignored local path, and `--destroy-salt` deletes
 *   it so the mapping cannot be reversed even by the people who built the asset;
 * - `inc_date` and `is_vehicle` are **dropped entirely** — they are never read,
 *   never hashed, never counted;
 * - the display layer is a **≥ 150 m grid density** surface that additionally
 *   satisfies **k-anonymity at k = `DISPLAY_MIN_CELL_COUNT`**: no published cell
 *   carries fewer than k reports. The map never receives points, not even
 *   snapped ones.
 *
 * Snap gaps are deliberately NOT published: a per-report distance from a public
 * node is a circle through the raw location. They are computed, reported to the
 * console and written to the git-ignored local report only.
 *
 * **Salt custody is an OPEN USER DECISION, not a decision this script makes.**
 * Withheld (kept at the git-ignored local path) keeps the pseudonym→`inc_id`
 * mapping re-derivable by whoever holds the machine; destroyed makes the
 * published hashes irreversible for everyone, including the authors, and so
 * removes the ability to answer a later provenance question about a specific
 * row. `--destroy-salt` implements the destroy option; the default writes the
 * fresh salt to the git-ignored path and says so loudly. See
 * `docs/DR-Q4-encampment-disclosure.md`.
 *
 * `deploy-check.ts` re-proves all of this against the built bytes; this script
 * being correct is not accepted as evidence that the output is clean.
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildContainer,
  f64Section,
  i32Section,
  u8Section,
  unpackEncampmentsPublic,
  unpackTopology,
  ENCAMPMENT_HASH_BYTES,
} from "@websim/shared";
// WP5: the STRtree tie-break lives in the engine so the asset and the runtime
// snapper cannot drift. See engine/src/graph/strtreeSnap.ts for the derivation.
import { hashMapTableLength, hashOrderKey } from "@websim/engine/graph";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const PIPELINE_ROOT = resolve(HERE, "..");

export const DEFAULT_LOCAL_RAW_DIR = join(PIPELINE_ROOT, "local-raw");
export const DEFAULT_RAW_CSV = join(DEFAULT_LOCAL_RAW_DIR, "irp_campsite_reports_sample.csv");
export const DEFAULT_ASSET_DIR = join(PIPELINE_ROOT, "out", "assets");
export const DEFAULT_TOPOLOGY = join(DEFAULT_ASSET_DIR, "graph-topology.bin");
/** Basename of the withheld-salt file, in one place: `deploy-check.ts` looks for it. */
export const SALT_FILE_NAME = "encampment-salt.txt";
export const SALT_FILE = join(DEFAULT_LOCAL_RAW_DIR, SALT_FILE_NAME);

/**
 * Display-grid design band. Fixed, not derived from the data: a grid whose
 * origin or step depended on the reports would leak their extent. Every report
 * must fall inside it or the build fails.
 */
export const GRID_DESIGN_LAT_BAND = { min: 45.0, max: 46.0 } as const;
/** Plan Q4 floor: no display cell may be smaller than this in either direction. */
export const GRID_MIN_CELL_M = 150 as const;
/** Grid origin. Absolute and data-independent, so a cell index reveals nothing. */
export const GRID_ORIGIN = { lon: -180, lat: -90 } as const;

/**
 * **k-anonymity floor for the published display layer.** No cell may ship with
 * fewer than this many reports behind it.
 *
 * Rationale. The 150 m cell size alone is not a disclosure control: on the real
 * feed it produced 1,863 cells of which 1,773 carried fewer than 5 reports and
 * 1,100 carried exactly one. A 150 m cell holding a count of 1 *is* a campsite
 * location to within a block — the precise thing Q4 exists to prevent (plan risk
 * W2, ship-blocker). Publishing it would have handed back most of the precision
 * that node-snapping had just removed.
 *
 * k = 5 is the smallest cell count in common statistical-disclosure practice
 * (the threshold US federal health and education statistics use for small-count
 * suppression) and is the value the plan's own reporting already measured
 * against — the pre-fix builder printed a `cells with count < 5` census but did
 * nothing about it. It is a *floor*, chosen to be defensible rather than
 * optimal: raising it is a one-line change and strictly safer; lowering it needs
 * the Q4 sign-off that the exact-coordinate asset needs, because it re-opens the
 * same risk. It is deliberately duplicated in `deploy-check.ts` so that lowering
 * it here cannot silently relax the publication gate.
 */
export const DISPLAY_MIN_CELL_COUNT = 5 as const;

/**
 * How far a below-k cell may be merged upward before it is suppressed instead.
 *
 * Cells that miss k are not dropped on sight: they are merged into the cell one
 * level coarser (2× the step in each direction, so level L is a 150 m × 2^L
 * cell) and re-tested, which keeps a sparse area on the map at a resolution that
 * is honest about how sparse it is. Level 5 is 4.8 km — already coarser than any
 * neighbourhood this study reasons about — so beyond it a "cell" would say
 * nothing a reader could use, and the remainder is suppressed outright and
 * counted in the published census rather than smeared over the region.
 *
 * Merging is strictly safer than publishing: a coarser cell with more reports in
 * it is less identifying in both directions. The cap exists for utility, not for
 * privacy.
 */
export const DISPLAY_MAX_MERGE_LEVEL = 5 as const;

// ---------------------------------------------------------------------------
// CSV — CsvLoader.read semantics (BOM, quoted fields, trim, blank-line skip)
// ---------------------------------------------------------------------------

/** One raw report. Only the three fields Q4 permits downstream are kept. */
export interface RawReport {
  readonly lon: number;
  readonly lat: number;
  readonly incId: string;
}

export interface RawParseResult {
  readonly rows: readonly RawReport[];
  readonly linesRead: number;
  readonly skippedMalformed: number;
  readonly headers: readonly string[];
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let sb = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          sb += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        sb += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(sb.trim());
      sb = "";
    } else {
      sb += c;
    }
  }
  out.push(sb.trim());
  return out;
}

/**
 * Parse the campsite feed the way the Java model does.
 *
 * `ContextCreator` wraps the two `Double.parseDouble` calls in a try/catch and
 * silently skips the row on failure; that behaviour defines which reports exist,
 * so it is mirrored rather than tightened. Any change here changes the agent
 * population.
 */
export function parseEncampmentCsv(text: string): RawParseResult {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = body.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  const headerLine = lines[0];
  if (headerLine === undefined) {
    throw new Error("encampment CSV is empty");
  }
  const headers = splitCsvLine(headerLine);
  const lonCol = headers.indexOf("lon");
  const latCol = headers.indexOf("lat");
  const idCol = headers.indexOf("inc_id");
  if (lonCol < 0 || latCol < 0 || idCol < 0) {
    throw new Error(`encampment CSV needs lon/lat/inc_id columns, found [${headers.join(", ")}]`);
  }
  const rows: RawReport[] = [];
  let skipped = 0;
  let linesRead = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim().length === 0) {
      continue;
    }
    linesRead++;
    const f = splitCsvLine(line);
    const lonText = f[lonCol];
    const latText = f[latCol];
    const lon = lonText === undefined || lonText === "" ? Number.NaN : Number(lonText);
    const lat = latText === undefined || latText === "" ? Number.NaN : Number(latText);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      skipped++;
      continue;
    }
    rows.push({ lon, lat, incId: f[idCol] ?? "" });
  }
  return { rows, linesRead, skippedMalformed: skipped, headers };
}

// ---------------------------------------------------------------------------
// degree-space nearest neighbour
// ---------------------------------------------------------------------------

export interface SnapTarget {
  readonly nodeId: Int32Array;
  readonly nodeLon: Float64Array;
  readonly nodeLat: Float64Array;
}

export interface SnapHit {
  readonly index: number;
  /** Squared degree-space distance to the winner. */
  readonly bestSq: number;
  /** Other nodes at exactly the same squared distance. */
  readonly exactTies: number;
  /**
   * True when Java's metric (`sqrt`, compared with `<`) cannot separate the
   * winner from the runner-up, so JTS's traversal order — not the geometry —
   * would decide. Zero of these means the snap is order-independent.
   */
  readonly ambiguous: boolean;
}

/**
 * Exact nearest node in **degree space**, matching `StreetNetwork.nearestNode`.
 *
 * Java ranks candidates with `Coordinate.distance` = `sqrt(dx² + dy²)` on
 * degenerate point envelopes, i.e. plain planar distance in degrees — no
 * projection, no geodesic. The search here minimises the *squared* distance,
 * which has the same argmin and avoids 300 M square roots; the sqrt is only
 * brought back to decide whether Java's comparison could have tied.
 *
 * **Tie-break rule (WP5 correction): the lower `HashMap` bucket wins.** The
 * certified graph contains 192 groups of nodes that share a bit-identical
 * coordinate, so for a query nearest to such a group JTS's `STRtree` decides by
 * traversal order and nothing in the geometry separates the candidates. That
 * traversal order is seeded by `HashMap<Long, Coordinate>.entrySet()` in
 * `buildIndex()`, which is reproducible — see `engine/src/graph/strtreeSnap.ts`
 * for the derivation and its evidence.
 *
 * This function previously documented "lowest node id wins", which WP5 measured
 * against the certified `StreetNetwork.nearestNode` for all 3,400 reports and
 * found **wrong on 1 of the 7 tied queries** — encampment 523, ids
 * 74194 / 16952934, where Java chose the larger id and the two nodes sit in
 * *different components*, so the choice decided whether that resident could
 * reach a shelter at all. The rule is imported from the engine rather than
 * re-derived here, so the asset and the runtime cannot disagree.
 *
 * `ambiguous` still counts exactly the queries the rule had to decide, so the
 * condition stays measured rather than assumed away.
 */
export function nearestNodeIndex(target: SnapTarget, lon: number, lat: number): SnapHit {
  const { nodeId, nodeLon, nodeLat } = target;
  const n = nodeLon.length;
  const mask = hashMapTableLength(n) - 1;
  let bestSq = Number.POSITIVE_INFINITY;
  let bestIdx = -1;
  let bestKey = 0;
  let ties = 0;
  let secondSq = Number.POSITIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    const dx = nodeLon[i]! - lon;
    const dy = nodeLat[i]! - lat;
    const d = dx * dx + dy * dy;
    if (d < bestSq) {
      secondSq = bestSq;
      bestSq = d;
      bestIdx = i;
      bestKey = hashOrderKey(nodeId[i]!, mask);
      ties = 0;
    } else if (d === bestSq) {
      ties++;
      const key = hashOrderKey(nodeId[i]!, mask);
      // Lower bucket wins; a genuine bucket collision falls through to the
      // lowest node id, which is the order this scan already runs in.
      if (key < bestKey) {
        bestKey = key;
        bestIdx = i;
      }
    } else if (d < secondSq) {
      secondSq = d;
    }
  }
  const ambiguous = ties > 0 || (Number.isFinite(secondSq) && Math.sqrt(bestSq) === Math.sqrt(secondSq));
  return { index: bestIdx, bestSq, exactTies: ties, ambiguous };
}

// ---------------------------------------------------------------------------
// display grid
// ---------------------------------------------------------------------------

/** WGS84 metres per degree of latitude at `lat` (standard series, < 1 m error). */
export function metresPerDegreeLat(lat: number): number {
  const p = (lat * Math.PI) / 180;
  return 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p) - 0.0023 * Math.cos(6 * p);
}

/** WGS84 metres per degree of longitude at `lat`. */
export function metresPerDegreeLon(lat: number): number {
  const p = (lat * Math.PI) / 180;
  return 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p);
}

export interface GridSpec {
  readonly originLon: number;
  readonly originLat: number;
  readonly stepLon: number;
  readonly stepLat: number;
  readonly minCellWidthM: number;
  readonly minCellHeightM: number;
}

/**
 * Grid steps chosen so **every** cell in the design band is at least
 * `GRID_MIN_CELL_M` across. Longitude cells are widest in degrees where the
 * metre-per-degree is smallest (the poleward edge of the band), so that edge
 * sets the step and every other latitude gets a larger cell.
 */
export function buildGridSpec(minCellM: number = GRID_MIN_CELL_M): GridSpec {
  const lats = [GRID_DESIGN_LAT_BAND.min, GRID_DESIGN_LAT_BAND.max];
  const minMPerLat = Math.min(...lats.map(metresPerDegreeLat));
  const minMPerLon = Math.min(...lats.map(metresPerDegreeLon));
  const stepLat = minCellM / minMPerLat;
  const stepLon = minCellM / minMPerLon;
  return {
    originLon: GRID_ORIGIN.lon,
    originLat: GRID_ORIGIN.lat,
    stepLon,
    stepLat,
    minCellWidthM: stepLon * minMPerLon,
    minCellHeightM: stepLat * minMPerLat,
  };
}

/**
 * One published cell. `level` is mandatory: a cell index is only meaningful with
 * the level it was counted at, because level L indexes cells of
 * `stepLon × 2^L` by `stepLat × 2^L` from the same absolute origin.
 */
export interface DisplayCell {
  readonly i: number;
  readonly j: number;
  readonly level: number;
  readonly count: number;
}

export interface BaseCell {
  readonly i: number;
  readonly j: number;
  readonly count: number;
}

export interface KAnonymityResult {
  readonly cells: readonly DisplayCell[];
  /** Cells at the coarsest level that still missed k and were dropped. */
  readonly suppressedCells: number;
  /** Reports inside those cells. Published as an aggregate, never as a place. */
  readonly suppressedCount: number;
  /** How many published cells came from each merge level. */
  readonly levelCensus: Readonly<Record<number, number>>;
}

/**
 * Enforce the k-anonymity floor by **merging upward, then suppressing**.
 *
 * At each level every cell that reaches k is published at that level and leaves
 * the pool; everything left is folded into its parent cell — `floor(i/2)`,
 * `floor(j/2)`, which is a quadtree anchored on the same absolute origin, so a
 * parent index is as data-independent as a base index — and re-tested one level
 * coarser. Whatever still misses k at `maxLevel` is suppressed.
 *
 * Two properties this relies on, both worth stating because they are what makes
 * the output safe rather than merely smaller:
 *
 * - **Every published count is ≥ k.** Nothing is published that was not tested,
 *   and a merged cell is only published when the merged count passes.
 * - **A published parent never equals one of its children.** Its count is the
 *   sum of the children that *failed* k, each of which is ≤ k−1, so a parent
 *   reaching k needs at least two non-empty children. The coarse cell therefore
 *   cannot be read back down to a single fine cell.
 *
 * A reader can still infer "no child of this merged cell reached k". That is a
 * statement about counts, not about places, and it is strictly less than the
 * pre-fix layer disclosed.
 */
export function kAnonymiseCells(
  base: readonly BaseCell[],
  k: number = DISPLAY_MIN_CELL_COUNT,
  maxLevel: number = DISPLAY_MAX_MERGE_LEVEL,
): KAnonymityResult {
  if (!Number.isInteger(k) || k < 1) {
    throw new Error(`build-encampments: k must be a positive integer, got ${k}`);
  }
  if (!Number.isInteger(maxLevel) || maxLevel < 0) {
    throw new Error(`build-encampments: maxLevel must be a non-negative integer, got ${maxLevel}`);
  }
  const cells: DisplayCell[] = [];
  const levelCensus: Record<number, number> = {};
  let pool: BaseCell[] = base.map((c) => ({ i: c.i, j: c.j, count: c.count }));
  for (let level = 0; ; level++) {
    const failed: BaseCell[] = [];
    for (const cell of pool) {
      if (cell.count >= k) {
        cells.push({ i: cell.i, j: cell.j, level, count: cell.count });
        levelCensus[level] = (levelCensus[level] ?? 0) + 1;
      } else {
        failed.push(cell);
      }
    }
    if (level >= maxLevel) {
      pool = failed;
      break;
    }
    const parents = new Map<string, { i: number; j: number; count: number }>();
    for (const cell of failed) {
      const pi = Math.floor(cell.i / 2);
      const pj = Math.floor(cell.j / 2);
      const key = `${pi}/${pj}`;
      const parent = parents.get(key);
      if (parent === undefined) {
        parents.set(key, { i: pi, j: pj, count: cell.count });
      } else {
        parent.count += cell.count;
      }
    }
    pool = [...parents.values()];
  }
  cells.sort((a, b) => a.level - b.level || a.j - b.j || a.i - b.i);
  return {
    cells,
    suppressedCells: pool.length,
    suppressedCount: pool.reduce((sum, c) => sum + c.count, 0),
    levelCensus,
  };
}

export interface DisplayGrid {
  readonly schema: "reu-wildfire-shelter-abm/encampment-density/v2";
  readonly note: string;
  readonly grid: GridSpec;
  /** The k-anonymity floor this layer was filtered at. */
  readonly k: number;
  readonly maxMergeLevel: number;
  readonly cells: readonly DisplayCell[];
  /** Reports behind the published cells. */
  readonly published: number;
  /** Reports withheld because their cell never reached k. Aggregate only. */
  readonly suppressed: number;
  readonly suppressedCells: number;
  /** `published + suppressed` — every report the layer was built from. */
  readonly total: number;
  /** Smallest published count; must be ≥ `k`, and is re-checked at deploy. */
  readonly minPublishedCount: number;
  /** Must be 0. Kept in the file so the property is visible, not just asserted. */
  readonly cellsBelowK: number;
  readonly levelCensus: Readonly<Record<number, number>>;
}

/**
 * Density surface over the **snapped** node coordinates, weighted by how many
 * reports each node absorbed, then reduced to cells that satisfy k-anonymity.
 * Built from the public asset's own contents, so it cannot carry information the
 * public asset does not already carry — and after `kAnonymiseCells`, it carries
 * strictly less.
 */
export function buildDisplayGrid(
  lons: readonly number[],
  lats: readonly number[],
  weights: readonly number[],
  spec: GridSpec = buildGridSpec(),
  k: number = DISPLAY_MIN_CELL_COUNT,
  maxLevel: number = DISPLAY_MAX_MERGE_LEVEL,
): DisplayGrid {
  const counts = new Map<string, { i: number; j: number; count: number }>();
  let total = 0;
  for (let n = 0; n < lons.length; n++) {
    const lat = lats[n]!;
    if (lat < GRID_DESIGN_LAT_BAND.min || lat > GRID_DESIGN_LAT_BAND.max) {
      throw new Error(
        `build-encampments: snapped latitude ${lat} is outside the fixed display band ` +
          `[${GRID_DESIGN_LAT_BAND.min}, ${GRID_DESIGN_LAT_BAND.max}] — the grid step is only ` +
          `proved ≥ ${GRID_MIN_CELL_M} m inside it`,
      );
    }
    const i = Math.floor((lons[n]! - spec.originLon) / spec.stepLon);
    const j = Math.floor((lat - spec.originLat) / spec.stepLat);
    const key = `${i}/${j}`;
    const cell = counts.get(key);
    const w = weights[n]!;
    total += w;
    if (cell === undefined) {
      counts.set(key, { i, j, count: w });
    } else {
      cell.count += w;
    }
  }
  const base = [...counts.values()].sort((a, b) => (a.j - b.j) || (a.i - b.i));
  const anonymised = kAnonymiseCells(base, k, maxLevel);
  const published = anonymised.cells.reduce((sum, c) => sum + c.count, 0);
  const belowK = anonymised.cells.filter((c) => c.count < k).length;
  if (belowK > 0 || published + anonymised.suppressedCount !== total) {
    // Not reachable through `kAnonymiseCells`; asserted because the whole point
    // of the layer is that this cannot happen.
    throw new Error(
      `build-encampments: k-anonymity pass is inconsistent — ${belowK} cell(s) below k=${k}, ` +
        `${published} + ${anonymised.suppressedCount} != ${total}`,
    );
  }
  return {
    schema: "reu-wildfire-shelter-abm/encampment-density/v2",
    note:
      `Density of node-snapped campsite reports on a fixed ≥ ${GRID_MIN_CELL_M} m grid, ` +
      `k-anonymised at k = ${k}: no cell carries fewer than ${k} reports. A cell that missed ` +
      `k was merged into its parent cell (level L spans ${GRID_MIN_CELL_M} m x 2^L, indices ` +
      "are level-relative) and re-tested; what still missed k at the coarsest level was " +
      "suppressed and is reported only as an aggregate. Cell indices are absolute " +
      "(origin -180/-90) and carry no point locations. The map renders this layer only; " +
      "it never receives points.",
    grid: spec,
    k,
    maxMergeLevel: maxLevel,
    cells: anonymised.cells,
    published,
    suppressed: anonymised.suppressedCount,
    suppressedCells: anonymised.suppressedCells,
    total,
    // 0 when nothing was published: `Infinity` would serialise as JSON `null`
    // and a null would read as "not checked" rather than "no cells".
    minPublishedCount:
      anonymised.cells.length === 0 ? 0 : Math.min(...anonymised.cells.map((c) => c.count)),
    cellsBelowK: belowK,
    levelCensus: anonymised.levelCensus,
  };
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

export interface EncampmentBuild {
  readonly publicAsset: Uint8Array;
  readonly display: DisplayGrid;
  /** Never published: written to the git-ignored local path only. */
  readonly localReport: Record<string, unknown>;
  readonly rowCount: number;
  readonly distinctNodes: number;
  readonly ambiguousSnaps: number;
  /** Census of the *unfiltered* base grid — local diagnostics, never published. */
  readonly baseCensus: {
    readonly cells: number;
    readonly cellsBelowK: number;
    readonly reportsBelowK: number;
    readonly minCount: number;
  };
}

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** Salted, truncated report id: `sha256(salt || ":" || inc_id)`, first 12 hex. */
export function saltedId(salt: string, incId: string): string {
  return createHash("sha256").update(`${salt}:${incId}`, "utf8").digest("hex").slice(0, ENCAMPMENT_HASH_BYTES * 2);
}

export function buildEncampments(
  rows: readonly RawReport[],
  target: SnapTarget,
  salt: string,
  gridSpec: GridSpec = buildGridSpec(),
): EncampmentBuild {
  const rowCount = rows.length;
  const snappedIndex = new Int32Array(rowCount);
  const gapsM: number[] = new Array<number>(rowCount);
  let ambiguous = 0;
  let exactTieRows = 0;
  for (let r = 0; r < rowCount; r++) {
    const row = rows[r]!;
    const hit = nearestNodeIndex(target, row.lon, row.lat);
    snappedIndex[r] = hit.index;
    if (hit.ambiguous) {
      ambiguous++;
    }
    if (hit.exactTies > 0) {
      exactTieRows++;
    }
    // Local diagnostics only. A published per-row gap is a circle through the
    // raw location, so this array never leaves the git-ignored report.
    const dLat = target.nodeLat[hit.index]! - row.lat;
    const dLon = target.nodeLon[hit.index]! - row.lon;
    gapsM[r] = Math.hypot(dLat * metresPerDegreeLat(row.lat), dLon * metresPerDegreeLon(row.lat));
  }

  // Deduplicate per node, ascending by node index so the table order carries no
  // trace of report order or report dates.
  const distinct = [...new Set(Array.from(snappedIndex))].sort((a, b) => a - b);
  const slotOf = new Map<number, number>();
  distinct.forEach((nodeIdx, slot) => slotOf.set(nodeIdx, slot));

  const nodeCount = distinct.length;
  const campNodeIndex = Int32Array.from(distinct);
  const campNodeId = new Int32Array(nodeCount);
  const campNodeLon = new Float64Array(nodeCount);
  const campNodeLat = new Float64Array(nodeCount);
  const weights: number[] = new Array<number>(nodeCount).fill(0);
  for (let s = 0; s < nodeCount; s++) {
    const idx = distinct[s]!;
    campNodeId[s] = target.nodeId[idx]!;
    campNodeLon[s] = target.nodeLon[idx]!;
    campNodeLat[s] = target.nodeLat[idx]!;
  }

  const rowSlot = new Int32Array(rowCount);
  const hashBytes = new Uint8Array(rowCount * ENCAMPMENT_HASH_BYTES);
  for (let r = 0; r < rowCount; r++) {
    const slot = slotOf.get(snappedIndex[r]!)!;
    rowSlot[r] = slot;
    weights[slot]! += 1;
    const hex = saltedId(salt, rows[r]!.incId);
    for (let b = 0; b < ENCAMPMENT_HASH_BYTES; b++) {
      hashBytes[r * ENCAMPMENT_HASH_BYTES + b] = Number.parseInt(hex.slice(b * 2, b * 2 + 2), 16);
    }
  }

  const publicAsset = buildContainer(
    "encampments",
    // `order_ambiguous_snaps` is a count, not a location: it travels with the
    // asset so a consumer can see how many start nodes were decided by the
    // tie-break rule rather than by geometry.
    { rows: rowCount, nodes: nodeCount, order_ambiguous_snaps: ambiguous },
    [
      i32Section("camp_node_index", campNodeIndex),
      i32Section("camp_node_id", campNodeId),
      f64Section("camp_node_lon", campNodeLon),
      f64Section("camp_node_lat", campNodeLat),
      i32Section("camp_row_slot", rowSlot),
      u8Section("camp_row_hash", hashBytes),
    ],
    sha256,
  );

  const lons = Array.from(campNodeLon);
  const lats = Array.from(campNodeLat);
  // The unfiltered base grid is built ONLY to census what the k-anonymity pass
  // removed. It is never written to a public path — a 150 m cell holding one
  // report is the disclosure this fix exists to stop, so its census lives in the
  // git-ignored local report beside the snap gaps.
  const baseGrid = buildDisplayGrid(lons, lats, weights, gridSpec, 1, 0);
  const baseCensus = {
    cells: baseGrid.cells.length,
    cellsBelowK: baseGrid.cells.filter((c) => c.count < DISPLAY_MIN_CELL_COUNT).length,
    reportsBelowK: baseGrid.cells
      .filter((c) => c.count < DISPLAY_MIN_CELL_COUNT)
      .reduce((sum, c) => sum + c.count, 0),
    minCount: baseGrid.minPublishedCount,
  };
  const display = buildDisplayGrid(lons, lats, weights, gridSpec);

  const sortedGaps = [...gapsM].sort((a, b) => a - b);
  const q = (p: number): number => sortedGaps[Math.min(sortedGaps.length - 1, Math.floor(p * sortedGaps.length))] ?? 0;
  const localReport = {
    warning: "LOCAL ONLY — contains snap-gap statistics derived from raw coordinates. Never publish.",
    rows: rowCount,
    distinct_snapped_nodes: nodeCount,
    reports_per_node_max: Math.max(0, ...weights),
    snap_gap_m: {
      min: sortedGaps[0] ?? 0,
      p50: q(0.5),
      p95: q(0.95),
      max: sortedGaps[sortedGaps.length - 1] ?? 0,
      mean: sortedGaps.reduce((a, b) => a + b, 0) / Math.max(1, sortedGaps.length),
    },
    snap_ambiguous_rows: ambiguous,
    snap_exact_tie_rows: exactTieRows,
    // k-anonymity census, BEFORE and AFTER. The "before" numbers describe a
    // layer that was never published and never will be.
    display_grid_k: DISPLAY_MIN_CELL_COUNT,
    display_grid_max_merge_level: DISPLAY_MAX_MERGE_LEVEL,
    display_cells_before_k_anonymity: baseCensus.cells,
    display_cells_before_below_k: baseCensus.cellsBelowK,
    display_reports_in_below_k_cells: baseCensus.reportsBelowK,
    display_min_cell_count_before: baseCensus.minCount,
    display_cells_published: display.cells.length,
    display_min_cell_count_published: display.minPublishedCount,
    display_reports_published: display.published,
    display_reports_suppressed: display.suppressed,
    display_cells_suppressed: display.suppressedCells,
    display_level_census: display.levelCensus,
  };

  return {
    publicAsset,
    display,
    localReport,
    rowCount,
    distinctNodes: nodeCount,
    ambiguousSnaps: ambiguous,
    baseCensus,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** Bytes of entropy behind each build's pseudonym salt. */
export const SALT_BYTES = 32 as const;

/**
 * A **fresh** salt for this build, written to the git-ignored local path.
 *
 * The previous version loaded an existing salt back off disk when one was there,
 * which meant one salt covered every build the machine ever made: a single file
 * on one laptop reversed the pseudonyms in every asset ever published from it,
 * and a salt that outlives its build is a salt nobody remembers to destroy.
 * Generating fresh per build bounds the blast radius of a salt disclosure to one
 * asset, and makes `--destroy-salt` a complete answer rather than a partial one.
 *
 * The cost is real and is accepted: `camp_row_hash` is a different pseudonym in
 * every build, so `encampments-public.bin` is no longer byte-reproducible across
 * builds and its manifest digest changes on every rebuild. Nothing downstream
 * joins on the pseudonym — it exists so a row can be discussed without naming
 * it — and buying byte-stability with a permanent salt is exactly the trade Q4
 * forbids.
 *
 * The file is written with mode 0600, but that is a courtesy, not the control:
 * the control is `pipeline/local-raw/` being git-ignored, and the custody
 * decision below.
 */
export function freshSalt(saltFile: string): string {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  mkdirSync(resolve(saltFile, ".."), { recursive: true });
  writeFileSync(saltFile, `${salt}\n`, { mode: 0o600 });
  return salt;
}

/**
 * Builder-side guard: the salt must not appear in anything we are about to write
 * to the public asset directory, as hex text, as raw bytes, or as base64.
 *
 * `deploy-check.ts` proves the same property independently and is the gate that
 * actually blocks publication; this exists so a mistake fails at the moment it
 * is made rather than at the moment someone remembers to run the gate. Matching
 * on 16-hex windows (8 of the 32 bytes) rather than the whole string means a
 * truncated or partially-overwritten salt is still caught.
 */
export function saltMaterialIn(bytes: Uint8Array, saltHex: string): boolean {
  const hex = saltHex.trim().toLowerCase();
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");
  const lower = text.toLowerCase();
  for (let start = 0; start + 16 <= hex.length; start++) {
    if (lower.includes(hex.slice(start, start + 16))) {
      return true;
    }
  }
  const raw = Buffer.from(hex, "hex");
  const haystack = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let start = 0; start + 8 <= raw.length; start++) {
    if (haystack.includes(raw.subarray(start, start + 8))) {
      return true;
    }
  }
  return text.includes(raw.toString("base64")) || lower.includes(hex);
}

function main(argv: readonly string[]): number {
  const arg = (flag: string, fallback: string): string => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : fallback;
  };
  const rawPath = resolve(arg("--raw", DEFAULT_RAW_CSV));
  const topologyPath = resolve(arg("--graph", DEFAULT_TOPOLOGY));
  const outDir = resolve(arg("--out", DEFAULT_ASSET_DIR));
  const localDir = resolve(arg("--local-out", DEFAULT_LOCAL_RAW_DIR));
  const destroySalt = argv.includes("--destroy-salt");

  if (!existsSync(rawPath)) {
    process.stderr.write(
      `build-encampments: no raw feed at ${rawPath}\n` +
        `  Q4 confines raw coordinates to the git-ignored local path. Copy the feed there:\n` +
        `    cp Geography/data/encampments/irp_campsite_reports_sample.csv websim/pipeline/local-raw/\n`,
    );
    return 1;
  }
  if (!existsSync(topologyPath)) {
    process.stderr.write(`build-encampments: no packed graph at ${topologyPath} — run pack-graph.ts first\n`);
    return 1;
  }

  const parsed = parseEncampmentCsv(readFileSync(rawPath, "utf8"));
  const topo = unpackTopology(new Uint8Array(readFileSync(topologyPath)));
  process.stdout.write(
    `build-encampments: ${parsed.rows.length} report(s) from ${parsed.linesRead} data line(s)` +
      ` (${parsed.skippedMalformed} skipped), snapping against ${topo.nodeCount} street nodes\n` +
      `  columns present in the raw feed: [${parsed.headers.join(", ")}] — only lon/lat/inc_id are read\n`,
  );

  const saltFile = join(localDir, SALT_FILE_NAME);
  const salt = freshSalt(saltFile);
  const t0 = Date.now();
  const built = buildEncampments(parsed.rows, topo, salt);
  process.stdout.write(`  snapped in ${Date.now() - t0} ms\n`);

  // Prove the container reads back before anything is written.
  const readBack = unpackEncampmentsPublic(built.publicAsset);
  if (readBack.rowCount !== built.rowCount || readBack.nodeCount !== built.distinctNodes) {
    process.stderr.write("build-encampments: FATAL public asset did not round-trip\n");
    return 1;
  }
  for (let s = 0; s < readBack.nodeCount; s++) {
    const idx = readBack.nodeIndex[s]!;
    if (readBack.nodeId[s] !== topo.nodeId[idx] || readBack.nodeLon[s] !== topo.nodeLon[idx]) {
      process.stderr.write(`build-encampments: FATAL entry ${s} is not a street node from the packed graph\n`);
      return 1;
    }
  }

  const displayJson = `${JSON.stringify(built.display, null, 2)}\n`;

  // Refuse to write a public asset that carries the salt or a below-k cell.
  // Both are re-proved from the written bytes by `deploy-check.ts`; this is the
  // earlier of the two gates, not a replacement for it.
  const publishable: readonly (readonly [string, Uint8Array])[] = [
    ["encampments-public.bin", built.publicAsset],
    ["encampments-display.json", new TextEncoder().encode(displayJson)],
  ];
  for (const [name, bytes] of publishable) {
    if (saltMaterialIn(bytes, salt)) {
      process.stderr.write(`build-encampments: FATAL ${name} contains salt material — refusing to write\n`);
      return 1;
    }
  }
  const below = built.display.cells.filter((c) => c.count < DISPLAY_MIN_CELL_COUNT);
  if (below.length > 0) {
    process.stderr.write(
      `build-encampments: FATAL ${below.length} display cell(s) below k=${DISPLAY_MIN_CELL_COUNT} — refusing to write\n`,
    );
    return 1;
  }

  mkdirSync(outDir, { recursive: true });
  mkdirSync(localDir, { recursive: true });
  writeFileSync(join(outDir, "encampments-public.bin"), built.publicAsset);
  writeFileSync(join(outDir, "encampments-display.json"), displayJson);
  writeFileSync(join(localDir, "encampments-local-report.json"), `${JSON.stringify(built.localReport, null, 2)}\n`);

  const gaps = built.localReport["snap_gap_m"] as Record<string, number>;
  process.stdout.write(
    `  encampments-public.bin      ${built.publicAsset.length} bytes  sha256=${sha256(built.publicAsset).slice(0, 12)}…\n` +
      `  encampments-display.json    ${built.display.cells.length} cell(s), ` +
      `min cell ${built.display.grid.minCellWidthM.toFixed(1)} × ${built.display.grid.minCellHeightM.toFixed(1)} m\n` +
      `  ${built.rowCount} report(s) → ${built.distinctNodes} distinct street node(s)\n` +
      `  snap gap (LOCAL ONLY): p50 ${gaps["p50"]!.toFixed(1)} m, p95 ${gaps["p95"]!.toFixed(1)} m, ` +
      `max ${gaps["max"]!.toFixed(1)} m\n` +
      `  order-ambiguous snaps: ${built.ambiguousSnaps} (0 means the snap does not depend on index traversal order)\n`,
  );

  const levels = Object.entries(built.display.levelCensus)
    .map(([level, n]) => `L${level}:${n}`)
    .join(" ");
  process.stdout.write(
    `  k-anonymity (k=${DISPLAY_MIN_CELL_COUNT}, max merge level ${DISPLAY_MAX_MERGE_LEVEL}):\n` +
      `    before  ${built.baseCensus.cells} base cell(s), ${built.baseCensus.cellsBelowK} below k ` +
      `(${built.baseCensus.reportsBelowK} report(s)), smallest cell count ${built.baseCensus.minCount}\n` +
      `    after   ${built.display.cells.length} published cell(s) [${levels}], ` +
      `smallest cell count ${built.display.minPublishedCount}, ${built.display.cellsBelowK} below k\n` +
      `    reports ${built.display.published} published, ${built.display.suppressed} suppressed ` +
      `in ${built.display.suppressedCells} cell(s) that never reached k at any level\n`,
  );

  process.stdout.write(
    `  salt: FRESH ${SALT_BYTES}-byte salt for this build, written to ${saltFile} (git-ignored)\n` +
      "        every build gets a new one; a previous salt is never read back\n",
  );
  if (destroySalt) {
    rmSync(saltFile, { force: true });
    process.stdout.write(
      "  salt: DESTROYED — the inc_id → hash mapping is now irreversible, for everyone,\n" +
        "        including us. deploy-check can no longer prove the salt is absent from the\n" +
        "        assets, so run it BEFORE destroying (`npm run check:deploy`).\n",
    );
  } else {
    process.stdout.write(
      "  salt: WITHHELD at the git-ignored local path.\n" +
        "        OPEN DECISION (user-owned, plan Q4): withhold or destroy? Withholding keeps the\n" +
        "        hash → inc_id mapping re-derivable by whoever holds this machine; destroying\n" +
        "        (`--destroy-salt`) makes it irreversible and gives up the ability to answer a\n" +
        "        later provenance question about a specific row. This build does not decide it.\n" +
        "        See websim/docs/DR-Q4-encampment-disclosure.md.\n",
    );
  }
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
