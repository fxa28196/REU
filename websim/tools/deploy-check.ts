/**
 * tools/deploy-check.ts — WP14 publish guard over the BUILT site (`app/dist`).
 *
 *   npm run deploy-check            (from websim/)
 *   tsx tools/deploy-check.ts [--dist <dir>] [--pipeline-assets <dir>]
 *                             [--pipeline-bundles <dir>] [--raw <csv>] [--json]
 *
 * The pipeline gate (`pipeline/scripts/deploy-check.ts`, WP4/Q4) proves the
 * BUILT ASSETS are clean. This gate proves the thing that actually gets
 * uploaded — the Vite output, which is those assets PLUS the app bundles,
 * sourcemaps and index.html — is clean and is the SAME assets. It fails the
 * build on three rules, each finding naming its rule:
 *
 *   **raw-encampment-data** — a raw campsite coordinate or an `inc_id`-shaped
 *   token anywhere in the built output (the WP1/Q4 ethics gate; README §1
 *   item 8; DR-Q4; DR-WP1-data-rights §4.2). Detection mirrors the pipeline
 *   gate's independently-written detectors: float64 bit patterns of raw
 *   coordinates at any byte offset (either endianness), lon+lat of the same
 *   raw report as decimal text in one file (a *located* report — blocking),
 *   lone components (advisory in text, blocking inside our own binaries,
 *   where a 6 dp coordinate literal is never legitimate), and the
 *   `NN-NNNNNN` report-id shape (blocking whether or not it matches a raw id
 *   — the shape alone reads as a report id).
 *
 *   **manifest-mismatch** — the asset manifest shipped in dist disagrees with
 *   `pipeline/out`: manifest bytes differ, a manifest-listed asset is missing
 *   from dist or hashes differently than the manifest promises, a pipeline
 *   asset or archive bundle was staged stale (bytes differ from
 *   `pipeline/out`), or dist/assets carries a file that is neither a pipeline
 *   asset nor a Vite bundle chunk. The loader verifies digests at runtime
 *   (app/src/assets/loader.ts); this rule keeps a stale staging copy from
 *   ever being uploaded at all.
 *
 *   **placeholder-marker** — a placeholder/TODO marker in user-visible text
 *   (TODO / FIXME / TKTK / all-caps PLACEHOLDER / lorem ipsum) in the built
 *   HTML, CSS, JS or JSON. A research tool that ships "TODO" has shipped a
 *   false report of completeness. Sourcemaps are exempt (developer tooling,
 *   not page text — they embed third-party library sources whose comments are
 *   not ours to edit); one known vendor-shader string is quarantined by exact
 *   window with the reason pinned (`PLACEHOLDER_QUARANTINE`), and anything
 *   not on that list blocks.
 *
 * Refusal beats silence (the pipeline gate's own rule): a missing dist, a
 * missing raw feed or missing pipeline output exits 2 — absence of raw data
 * cannot be proved without the raw data, and an unbuilt site cannot be
 * checked. There is no flag to skip any rule.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const WEBSIM_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(WEBSIM_ROOT, "..");

export const DEFAULT_DIST_DIR = join(WEBSIM_ROOT, "app", "dist");
export const DEFAULT_PIPELINE_ASSETS_DIR = join(WEBSIM_ROOT, "pipeline", "out", "assets");
export const DEFAULT_PIPELINE_BUNDLES_DIR = join(WEBSIM_ROOT, "pipeline", "out", "archive-bundles");
/** The raw feed, needed to prove its own absence from the built output. */
export const DEFAULT_RAW_CSV = join(WEBSIM_ROOT, "pipeline", "local-raw", "irp_campsite_reports_sample.csv");
/** Read-only fallback: the feed as committed in the Java model's data tree. */
export const FALLBACK_RAW_CSV = join(REPO_ROOT, "Geography", "data", "encampments", "irp_campsite_reports_sample.csv");

export type DeployRule = "raw-encampment-data" | "manifest-mismatch" | "placeholder-marker";

export interface DeployFinding {
  readonly rule: DeployRule;
  /** dist-relative path (or the manifest ids involved). */
  readonly file: string;
  readonly detail: string;
  /** Blocking findings fail the gate; advisory ones are printed for review. */
  readonly blocking: boolean;
}

// ---------------------------------------------------------------------------
// Raw-feed reference (rule: raw-encampment-data)
// ---------------------------------------------------------------------------

/** Minimal RFC-4180-ish field split (double quotes, doubled-quote escape). */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

export interface RawReference {
  /** Exact float64 values of every raw lon and lat (Set-of-number lookups). */
  readonly coordValues: ReadonlySet<number>;
  /** Decimal text renderings of every raw lon → the raw rows carrying it. */
  readonly lonText: ReadonlyMap<string, readonly number[]>;
  /** Decimal text renderings of every raw lat → the raw rows carrying it. */
  readonly latText: ReadonlyMap<string, readonly number[]>;
  readonly incIds: ReadonlySet<string>;
  readonly rowCount: number;
}

/**
 * Parse the raw campsite CSV (BOM + CRLF, quoted fields; header names
 * `lon`,`lat`,`inc_id`) into the reference the built output is scanned
 * against. Written independently of the pipeline gate's parser on purpose —
 * same property, different code — so one defective parser cannot blind both
 * gates. Only sub-metre-identifying text forms are included: `String(v)` and
 * `toFixed(5..7)`; a 2 dp truncation is not a leak and would only make noise.
 */
export function buildRawReference(csvText: string): RawReference {
  const text = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
  const lines = text.split(/\r?\n/u).filter((l) => l.length > 0);
  const header = splitCsvLine(lines[0] ?? "");
  const lonCol = header.indexOf("lon");
  const latCol = header.indexOf("lat");
  const idCol = header.indexOf("inc_id");
  if (lonCol < 0 || latCol < 0 || idCol < 0) {
    throw new Error(`deploy-check: raw feed header lacks lon/lat/inc_id (got: ${header.join(",")})`);
  }
  const coordValues = new Set<number>();
  const lonText = new Map<string, number[]>();
  const latText = new Map<string, number[]>();
  const incIds = new Set<string>();
  const add = (map: Map<string, number[]>, key: string, row: number): void => {
    const rows = map.get(key);
    if (rows === undefined) {
      map.set(key, [row]);
    } else if (!rows.includes(row)) {
      rows.push(row);
    }
  };
  let rowCount = 0;
  for (let r = 1; r < lines.length; r++) {
    const f = splitCsvLine(lines[r]!);
    const lon = Number(f[lonCol]);
    const lat = Number(f[latCol]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      continue;
    }
    const row = rowCount++;
    for (const [v, map] of [
      [lon, lonText],
      [lat, latText],
    ] as const) {
      coordValues.add(v);
      for (const form of [String(v), v.toFixed(5), v.toFixed(6), v.toFixed(7)]) {
        add(map, form, row);
      }
    }
    const id = (f[idCol] ?? "").trim();
    if (id.length > 0) {
      incIds.add(id);
    }
  }
  return { coordValues, lonText, latText, incIds, rowCount };
}

/** Decimal literals with ≥ 5 fractional digits — the resolution a leak needs. */
const DECIMAL_LITERAL = /-?\d{1,3}\.\d{5,}/g;
/** The feed's report-id shape, e.g. `26-150147`. */
const INC_ID_SHAPE = /\b\d{2}-\d{6}\b/g;

/** Our own binary assets: a 6 dp coordinate literal inside one is never right. */
function isOwnBinary(name: string): boolean {
  return name.endsWith(".bin") || name.endsWith(".bin.br");
}

/** Rule 1 over one file's bytes: coordinates (bits + text) and inc_id shapes. */
export function scanRawEncampmentData(name: string, bytes: Uint8Array, ref: RawReference): DeployFinding[] {
  const findings: DeployFinding[] = [];

  // Binary: raw float64 values at any byte offset, either endianness. A
  // Set<number> lookup on the decoded value equals the pipeline gate's
  // bit-pattern comparison for these normal, non-NaN coordinates.
  if (bytes.length >= 8) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let o = 0; o + 8 <= bytes.length; o++) {
      for (const littleEndian of [false, true]) {
        const v = view.getFloat64(o, littleEndian);
        if (ref.coordValues.has(v)) {
          findings.push({
            rule: "raw-encampment-data",
            file: name,
            detail: `raw coordinate ${v} present as ${littleEndian ? "little" : "big"}-endian float64 at byte ${o}`,
            blocking: true,
          });
        }
      }
    }
  }

  // Text: latin1 so every byte maps to a character and a literal embedded in
  // binary padding is still found.
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");
  const lonRows = new Map<number, string>();
  const latRows = new Map<number, string>();
  const componentFindings: DeployFinding[] = [];
  for (const m of text.matchAll(DECIMAL_LITERAL)) {
    const token = m[0];
    const normalised = String(Number(token));
    for (const [map, seen, axis] of [
      [ref.lonText, lonRows, "lon"],
      [ref.latText, latRows, "lat"],
    ] as const) {
      const rows = map.get(token) ?? map.get(normalised);
      if (rows === undefined) {
        continue;
      }
      for (const r of rows) {
        if (!seen.has(r)) {
          seen.set(r, token);
        }
      }
      componentFindings.push({
        rule: "raw-encampment-data",
        file: name,
        detail:
          `${axis} literal '${token}' at offset ${m.index} equals raw report row(s) ${rows.join(", ")}` +
          (isOwnBinary(name) ? " inside our own binary asset" : " (lone component — coincidence-prone at 6 dp)"),
        blocking: isOwnBinary(name),
      });
    }
  }
  // A raw report is *located* only when both of its components are present.
  for (const [row, lonToken] of lonRows) {
    const latToken = latRows.get(row);
    if (latToken !== undefined) {
      findings.push({
        rule: "raw-encampment-data",
        file: name,
        detail: `raw report row ${row} fully located: lon '${lonToken}' + lat '${latToken}' both present as text`,
        blocking: true,
      });
    }
  }
  findings.push(...componentFindings);

  for (const m of text.matchAll(INC_ID_SHAPE)) {
    const token = m[0];
    findings.push({
      rule: "raw-encampment-data",
      file: name,
      detail: ref.incIds.has(token)
        ? `raw inc_id '${token}' at offset ${m.index}`
        : `inc_id-shaped token '${token}' at offset ${m.index} (NN-NNNNNN reads as a report id)`,
      blocking: true,
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Placeholder markers (rule: placeholder-marker)
// ---------------------------------------------------------------------------

/** Markers that mean "unfinished" when they reach a shipped page. */
const PLACEHOLDER_MARKERS: readonly RegExp[] = [
  /\bTODO\b/g,
  /\bFIXME\b/g,
  /\bTKTK\b/g,
  // All-caps only: `placeholder=` is a legitimate HTML/ARIA attribute.
  /\bPLACEHOLDER\b/g,
  /lorem ipsum/gi,
];

/**
 * Known vendor false positives, quarantined by EXACT window text with the
 * reason recorded — the claim-linter's quarantine discipline. Anything not on
 * this list blocks; growing this list is a reviewed act.
 */
export const PLACEHOLDER_QUARANTINE: readonly { readonly window: string; readonly reason: string }[] = [
  {
    window: "TODO , geometry.position",
    reason:
      "deck.gl GLSL shader source shipped as a JS string literal; a shader comment, " +
      "never rendered as page text and not ours to edit",
  },
];

/** Files whose text a user can meet: built page, styles, bundles, JSON data. */
function isUserVisibleText(name: string): boolean {
  if (name.endsWith(".map")) {
    // Sourcemaps embed third-party library SOURCES (comments included); they
    // are developer tooling, not page text. Rule 1 still scans them.
    return false;
  }
  return (
    name.endsWith(".html") || name.endsWith(".css") || name.endsWith(".js") || name.endsWith(".json")
  );
}

/** Rule 3 over one file's text. */
export function scanPlaceholders(name: string, bytes: Uint8Array): DeployFinding[] {
  if (!isUserVisibleText(name)) {
    return [];
  }
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("utf8");
  const findings: DeployFinding[] = [];
  for (const marker of PLACEHOLDER_MARKERS) {
    marker.lastIndex = 0;
    for (const m of text.matchAll(marker)) {
      const window = text.slice(Math.max(0, m.index - 10), m.index + m[0].length + 40);
      const quarantined = PLACEHOLDER_QUARANTINE.find((q) => window.includes(q.window));
      findings.push({
        rule: "placeholder-marker",
        file: name,
        detail:
          quarantined !== undefined
            ? `'${m[0]}' at offset ${m.index} — quarantined vendor string (${quarantined.reason})`
            : `placeholder marker '${m[0]}' at offset ${m.index} in user-visible text: …${window.trim()}…`,
        blocking: quarantined === undefined,
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Manifest / staged-asset agreement (rule: manifest-mismatch)
// ---------------------------------------------------------------------------

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Every file under `dir`, dist-style forward-slash relative paths, sorted. */
export function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d).sort()) {
      const p = join(d, entry);
      if (statSync(p).isDirectory()) {
        walk(p);
      } else {
        out.push(relative(dir, p).split("\\").join("/"));
      }
    }
  };
  if (existsSync(dir)) {
    walk(dir);
  }
  return out;
}

/** A Vite bundle chunk staged into dist/assets by the build itself. */
export function isViteChunk(relPath: string): boolean {
  // Top-level only, `name-<8-char base64url hash>.js|.css` (+ `.map`).
  return /^[^/]+-[A-Za-z0-9_-]{8}\.(?:js|css)(?:\.map)?$/u.test(relPath);
}

/**
 * Rule 2: the dist tree must carry EXACTLY the pipeline's built assets —
 * manifest byte-identical, every manifest entry verified against dist bytes,
 * every pipeline asset/bundle staged byte-identical, and nothing in
 * dist/assets that is neither a pipeline asset nor a Vite chunk.
 */
export function compareStagedAssets(
  distDir: string,
  pipelineAssetsDir: string,
  pipelineBundlesDir: string | null,
): DeployFinding[] {
  const findings: DeployFinding[] = [];
  const block = (file: string, detail: string): void => {
    findings.push({ rule: "manifest-mismatch", file, detail, blocking: true });
  };

  // 1. The manifest itself, byte for byte.
  const distManifestPath = join(distDir, "assets", "assets-manifest.json");
  const pipeManifestPath = join(pipelineAssetsDir, "assets-manifest.json");
  if (!existsSync(distManifestPath)) {
    block("assets/assets-manifest.json", "asset manifest missing from dist — nothing in dist is verifiable");
    return findings; // every later check keys off the manifest
  }
  const distManifestBytes = readFileSync(distManifestPath);
  const pipeManifestBytes = readFileSync(pipeManifestPath);
  if (!distManifestBytes.equals(pipeManifestBytes)) {
    block(
      "assets/assets-manifest.json",
      "asset manifest in dist is not byte-identical to pipeline/out/assets/assets-manifest.json — restage (npm run stage-assets -w app) and rebuild",
    );
  }

  // 2. Every manifest-listed asset exists in dist and hashes as promised.
  let manifest: { assets?: Record<string, { sha256?: unknown }> };
  try {
    manifest = JSON.parse(pipeManifestBytes.toString("utf8")) as typeof manifest;
  } catch (error) {
    block("assets/assets-manifest.json", `pipeline manifest is not valid JSON: ${(error as Error).message}`);
    return findings;
  }
  for (const [id, entry] of Object.entries(manifest.assets ?? {})) {
    const distPath = join(distDir, id);
    if (!existsSync(distPath)) {
      block(id, "manifest-listed asset missing from dist");
      continue;
    }
    const actual = sha256Hex(readFileSync(distPath));
    if (typeof entry.sha256 !== "string" || actual !== entry.sha256) {
      block(id, `dist bytes hash ${actual}, manifest promises ${String(entry.sha256)}`);
    }
  }

  // 3. Every pipeline output file staged byte-identical (covers .br variants
  //    and any file the manifest does not list), both directions for bundles.
  const treeCompare = (fromDir: string, toDir: string, prefix: string): void => {
    for (const rel of listFiles(fromDir)) {
      const toPath = join(toDir, rel);
      if (!existsSync(toPath)) {
        block(`${prefix}/${rel}`, `present in ${prefix === "assets" ? "pipeline/out/assets" : "pipeline/out/archive-bundles"} but missing from dist — stale staging`);
        continue;
      }
      if (sha256Hex(readFileSync(join(fromDir, rel))) !== sha256Hex(readFileSync(toPath))) {
        block(`${prefix}/${rel}`, "dist copy differs from pipeline/out — stale staging");
      }
    }
  };
  treeCompare(pipelineAssetsDir, join(distDir, "assets"), "assets");
  if (pipelineBundlesDir !== null && existsSync(pipelineBundlesDir)) {
    treeCompare(pipelineBundlesDir, join(distDir, "archive-bundles"), "archive-bundles");
  }

  // 4. Nothing unexplained rides along inside dist/assets.
  const pipelineSet = new Set(listFiles(pipelineAssetsDir));
  for (const rel of listFiles(join(distDir, "assets"))) {
    if (!pipelineSet.has(rel) && !isViteChunk(rel)) {
      block(`assets/${rel}`, "file in dist/assets is neither a pipeline asset nor a Vite bundle chunk — unverifiable bytes must not ship");
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export interface DeployCheckOptions {
  readonly distDir?: string;
  readonly pipelineAssetsDir?: string;
  readonly pipelineBundlesDir?: string | null;
  readonly rawCsvPath?: string;
}

export interface DeployCheckResult {
  readonly distDir: string;
  readonly rawSource: string | null;
  readonly rawRows: number;
  readonly filesScanned: number;
  /** Non-empty = the gate REFUSED to run (exit 2), it did not pass. */
  readonly refusals: readonly string[];
  readonly findings: readonly DeployFinding[];
  readonly blocking: readonly DeployFinding[];
  readonly advisory: readonly DeployFinding[];
}

/** 0 = pass; 1 = blocking findings — do not publish; 2 = refused to run. */
export function verdictExitCode(result: DeployCheckResult): 0 | 1 | 2 {
  if (result.refusals.length > 0) {
    return 2;
  }
  return result.blocking.length > 0 ? 1 : 0;
}

export function runDeployCheck(options: DeployCheckOptions = {}): DeployCheckResult {
  const distDir = resolve(options.distDir ?? DEFAULT_DIST_DIR);
  const pipelineAssetsDir = resolve(options.pipelineAssetsDir ?? DEFAULT_PIPELINE_ASSETS_DIR);
  const pipelineBundlesDir =
    options.pipelineBundlesDir === null ? null : resolve(options.pipelineBundlesDir ?? DEFAULT_PIPELINE_BUNDLES_DIR);
  let rawCsvPath = resolve(options.rawCsvPath ?? DEFAULT_RAW_CSV);
  if (!existsSync(rawCsvPath) && options.rawCsvPath === undefined && existsSync(FALLBACK_RAW_CSV)) {
    rawCsvPath = FALLBACK_RAW_CSV;
  }

  const refusals: string[] = [];
  if (!existsSync(distDir)) {
    refusals.push(`no built site at ${distDir} — run 'npm run build -w app' first; an unbuilt site cannot be checked`);
  }
  if (!existsSync(pipelineAssetsDir)) {
    refusals.push(`no pipeline assets at ${pipelineAssetsDir} — the manifest has nothing to agree with`);
  }
  if (!existsSync(rawCsvPath)) {
    refusals.push(
      `no raw feed at ${rawCsvPath} (or ${FALLBACK_RAW_CSV}) — absence of raw data cannot be proved without the raw data`,
    );
  }
  const files = refusals.length === 0 ? listFiles(distDir) : [];
  if (refusals.length === 0 && files.length === 0) {
    refusals.push(`${distDir} is empty — nothing was built`);
  }
  if (refusals.length > 0) {
    return {
      distDir,
      rawSource: null,
      rawRows: 0,
      filesScanned: 0,
      refusals,
      findings: [],
      blocking: [],
      advisory: [],
    };
  }

  const reference = buildRawReference(readFileSync(rawCsvPath, "utf8"));
  const findings: DeployFinding[] = [];
  for (const rel of files) {
    const bytes = new Uint8Array(readFileSync(join(distDir, rel)));
    findings.push(...scanRawEncampmentData(rel, bytes, reference));
    findings.push(...scanPlaceholders(rel, bytes));
  }
  findings.push(...compareStagedAssets(distDir, pipelineAssetsDir, pipelineBundlesDir));

  return {
    distDir,
    rawSource: rawCsvPath,
    rawRows: reference.rowCount,
    filesScanned: files.length,
    refusals: [],
    findings,
    blocking: findings.filter((f) => f.blocking),
    advisory: findings.filter((f) => !f.blocking),
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv: readonly string[]): number {
  const arg = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dist = arg("--dist");
  const pipeAssets = arg("--pipeline-assets");
  const pipeBundles = arg("--pipeline-bundles");
  const raw = arg("--raw");
  const options: DeployCheckOptions = {
    ...(dist !== undefined ? { distDir: dist } : {}),
    ...(pipeAssets !== undefined ? { pipelineAssetsDir: pipeAssets } : {}),
    ...(pipeBundles !== undefined ? { pipelineBundlesDir: pipeBundles } : {}),
    ...(raw !== undefined ? { rawCsvPath: raw } : {}),
  };
  const result = runDeployCheck(options);
  const code = verdictExitCode(result);

  if (argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return code;
  }
  for (const refusal of result.refusals) {
    process.stderr.write(`deploy-check: REFUSING to pass: ${refusal}\n`);
  }
  if (result.refusals.length > 0) {
    return code;
  }
  process.stdout.write(
    `deploy-check: ${result.filesScanned} file(s) in ${result.distDir}\n` +
      `  reference: ${result.rawRows} raw report(s) from ${result.rawSource}\n`,
  );
  for (const f of result.blocking) {
    process.stdout.write(`  BLOCK     [${f.rule}] ${f.file}: ${f.detail}\n`);
  }
  for (const f of result.advisory) {
    process.stdout.write(`  advisory  [${f.rule}] ${f.file}: ${f.detail}\n`);
  }
  process.stdout.write(
    code === 0
      ? `  no blocking finding under any rule (raw-encampment-data, manifest-mismatch, ` +
          `placeholder-marker): PASS — ${result.advisory.length} advisory finding(s) printed above for review\n`
      : `  ${result.blocking.length} blocking finding(s): FAIL — do not publish\n`,
  );
  return code;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
