/**
 * deploy-check.ts — WP4 publication gate (plan §4, Q4).
 *
 *   tsx pipeline/scripts/deploy-check.ts [--assets <dir>] [--raw <csv>]
 *                                        [--salt <hex>] [--json]
 *
 * Greps **every public asset** for raw campsite coordinates, raw `inc_id`s,
 * below-k display cells and salt material, and exits non-zero on a hit. This is
 * deliberately an independent check on the built bytes: `build-encampments.ts`
 * being correct is not accepted as evidence that its output is clean, because
 * the failure this guards against is a *mistake*, and a mistake is exactly the
 * thing that also convinces the builder it did the right thing.
 *
 * Detectors, because a coordinate can leak in more than one shape:
 *
 * 1. **Binary** — the IEEE-754 bit pattern of a raw lon/lat at any byte offset,
 *    either endianness. Catches a float64 array filled before snapping.
 * 2. **Text pair** — the lon *and* the lat of the same raw report both present
 *    in one asset as decimal literals. This is what a leaked location looks
 *    like, and it is the criterion that actually maps onto the harm.
 * 3. **Text component** — one raw lon or one raw lat on its own.
 * 4. **Ids** — a raw `inc_id`, or anything with its shape (`NN-NNNNNN`).
 * 5. **Small cells** — any published density cell carrying fewer than
 *    `PUBLISHED_MIN_CELL_COUNT` reports. A fine grid cell with a count of 1 is a
 *    location, so this blocks even though nothing "raw" appears in the file.
 * 6. **Salt material** — the build's `inc_id` salt in any public asset, as hex
 *    text (whole or a 16-hex window of it), as raw bytes, or as base64.
 *    Publishing the salt would turn the shipped pseudonyms back into report ids.
 *
 * **Why 1, 2 and 4 block but a lone 3 does not.** Every raw coordinate in the
 * feed is a 6-decimal-place value in a narrow bounding box, so 6 dp public data
 * about *other* things collides with it at a measurable rate — the shipped
 * shelter CSVs, which are named facilities at geocoded street addresses, contain
 * a handful of lone lon or lat values that equal a raw campsite component while
 * their partner component does not match any raw report. Those are coincidences,
 * not locations, and blocking on them would train whoever runs this gate to
 * ignore it. Lone components are therefore reported as **advisory**, naming the
 * raw rows they matched so a human can adjudicate, while anything that
 * identifies a *place* or a *person* blocks.
 *
 * The binary detector has no such ambiguity and needs no allowlist: no exported
 * street-node or polyline coordinate round-trips at 6 dp (exporter census
 * `node_roundtrip_6dp: 0` / `polyline_roundtrip_6dp: 0` over 1,495,352 values),
 * so a sanctioned public float64 cannot equal a raw one. For the same reason a
 * 6 dp decimal literal has no business inside a `.bin` we produced, so a lone
 * component **does** block there.
 *
 * This is also why `pack-graph.ts` ships the correction census at full precision
 * rather than the 6 dp form the archived manifests carry: the 6 dp form collided
 * with two raw values, and structuring the collision out beats explaining it.
 *
 * **The salt has to be supplied.** Absence of the salt cannot be proved without
 * the salt, exactly as absence of raw coordinates cannot be proved without the
 * raw feed, so with no salt reference this gate refuses to pass rather than
 * passing quietly. In practice that fixes an ordering: run the gate, then decide
 * the salt's custody. There is no flag to skip the check.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { parseEncampmentCsv } from "./build-encampments.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const PIPELINE_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(PIPELINE_ROOT, "..", "..");

export const DEFAULT_ASSET_DIR = join(PIPELINE_ROOT, "out", "assets");
export const DEFAULT_RAW_CSV = join(PIPELINE_ROOT, "local-raw", "irp_campsite_reports_sample.csv");
/** Where `build-encampments.ts` leaves the build's salt when it is withheld. */
export const DEFAULT_SALT_FILE = join(PIPELINE_ROOT, "local-raw", "encampment-salt.txt");

/**
 * The k-anonymity floor the gate enforces on any published density cell.
 *
 * **Deliberately a second, independent copy of `DISPLAY_MIN_CELL_COUNT`.** If
 * this constant were imported from the builder, lowering the builder's k would
 * lower the gate with it and the output would still "pass" — the gate would
 * measure the builder's intent instead of the published bytes. Divergence is
 * caught loudly instead: `encampments.test.ts` asserts the two are equal, so a
 * deliberate change has to be made in both places and a careless one fails.
 */
export const PUBLISHED_MIN_CELL_COUNT = 5;
/** Read-only fallback: the feed as committed in the Java model's data tree. */
export const FALLBACK_RAW_CSV = join(
  REPO_ROOT,
  "Geography",
  "data",
  "encampments",
  "irp_campsite_reports_sample.csv",
);

export type FindingKind =
  | "raw-coordinate-bits"
  | "raw-coordinate-pair"
  | "raw-coordinate-component"
  | "raw-inc-id"
  | "inc-id-shape"
  | "display-cell-below-k"
  | "display-grid-unreadable"
  | "salt-material";

export interface Finding {
  readonly kind: FindingKind;
  readonly asset: string;
  readonly offset: number;
  readonly detail: string;
  /** Blocking findings fail the gate; advisory ones are printed for review. */
  readonly blocking: boolean;
}

export interface RawReference {
  /** Bit patterns of every raw lon and lat, as unsigned 64-bit BigInts. */
  readonly coordBits: ReadonlySet<bigint>;
  /** Decimal text of every raw lon (and variants) → the rows it belongs to. */
  readonly lonText: ReadonlyMap<string, readonly number[]>;
  /** Decimal text of every raw lat (and variants) → the rows it belongs to. */
  readonly latText: ReadonlyMap<string, readonly number[]>;
  readonly incIds: ReadonlySet<string>;
  readonly rowCount: number;
}

const bitBuf = new ArrayBuffer(8);
const bitView = new DataView(bitBuf);

function bitsOf(x: number): bigint {
  bitView.setFloat64(0, x, false);
  return bitView.getBigUint64(0, false);
}

/**
 * Build the reference set the assets are scanned against.
 *
 * Text variants matter: the same coordinate can be written `-122.692724`,
 * `-122.6927240` or (after a JSON round trip) `-122.692724`. Only forms that
 * still identify the raw value to sub-metre precision are included — a 2 dp
 * truncation is not a leak and would generate noise.
 */
export function buildRawReference(csvText: string): RawReference {
  const parsed = parseEncampmentCsv(csvText);
  const coordBits = new Set<bigint>();
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
  parsed.rows.forEach((row, r) => {
    for (const [v, map] of [
      [row.lon, lonText],
      [row.lat, latText],
    ] as const) {
      coordBits.add(bitsOf(v));
      // Sub-metre-equivalent renderings only: a 2 dp truncation is not a leak.
      for (const form of [String(v), v.toFixed(5), v.toFixed(6), v.toFixed(7)]) {
        add(map, form, r);
      }
    }
    if (row.incId.length > 0) {
      incIds.add(row.incId);
    }
  });
  return { coordBits, lonText, latText, incIds, rowCount: parsed.rows.length };
}

/** Decimal literals with ≥ 5 fractional digits — the resolution a leak needs. */
const DECIMAL_LITERAL = /-?\d{1,3}\.\d{5,}/g;
/** The feed's report-id shape, e.g. `26-150147`. */
const INC_ID_SHAPE = /\b\d{2}-\d{6}\b/g;

/** Assets we produce ourselves; a 6 dp coordinate literal in one is never right. */
function isOwnBinary(name: string): boolean {
  return name.endsWith(".bin") || name.endsWith(".bin.br");
}

/** Files that must contain a readable density grid if they exist at all. */
const DENSITY_ASSET_NAME = /(^|\/)encampments-display[^/]*\.json$/u;

/**
 * Every counted grid cell anywhere in a JSON asset, with the path it was found
 * at. A node counts as a cell when it carries a numeric `count` **and** either
 * sits under a key called `cells` or carries a numeric index pair (`i`/`j` or
 * `x`/`y`).
 *
 * Structural rather than schema-driven on purpose: a density layer that was
 * renamed, nested inside another document or emitted with a different `schema`
 * string is still a density layer, and the gate has to see it. It is not
 * exhaustive — a layer that renamed *both* the array and its index fields would
 * slip past — so it is a floor on the gate's reach, not a proof of its
 * completeness. The cost of the reach it does have is that an unrelated future
 * asset shaped like counted cells is held to the same floor, which is the safe
 * direction to be wrong in and fails loudly rather than silently.
 */
export function densityCellsIn(value: unknown, path = "$"): { path: string; count: number }[] {
  const out: { path: string; count: number }[] = [];
  const numeric = (record: Record<string, unknown>, key: string): boolean => typeof record[key] === "number";
  const walk = (node: unknown, at: string, insideCells: boolean): void => {
    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, `${at}[${index}]`, insideCells));
      return;
    }
    if (node === null || typeof node !== "object") {
      return;
    }
    const record = node as Record<string, unknown>;
    const indexed = (numeric(record, "i") && numeric(record, "j")) || (numeric(record, "x") && numeric(record, "y"));
    if ((insideCells || indexed) && typeof record["count"] === "number") {
      out.push({ path: at, count: record["count"] });
    }
    // `cells` may also be keyed by cell id rather than indexed, so the flag
    // survives one more level down while no count has been seen yet.
    const stillLooking = insideCells && typeof record["count"] !== "number";
    for (const [key, child] of Object.entries(record)) {
      walk(child, `${at}.${key}`, key === "cells" || stillLooking);
    }
  };
  walk(value, path, false);
  return out;
}

/** Detector 5: a published density cell that carries fewer than k reports. */
export function scanDisplayGrid(name: string, bytes: Uint8Array, k = PUBLISHED_MIN_CELL_COUNT): Finding[] {
  if (!name.endsWith(".json")) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("utf8"));
  } catch (error) {
    // Only an asset that claims to be the density layer has to parse. Anything
    // else that is not JSON is some other build's business.
    return DENSITY_ASSET_NAME.test(name)
      ? [
          {
            kind: "display-grid-unreadable",
            asset: name,
            offset: 0,
            detail: `density layer did not parse as JSON (${(error as Error).message}) — its cell counts cannot be checked`,
            blocking: true,
          },
        ]
      : [];
  }
  const cells = densityCellsIn(parsed);
  if (cells.length === 0) {
    return DENSITY_ASSET_NAME.test(name)
      ? [
          {
            kind: "display-grid-unreadable",
            asset: name,
            offset: 0,
            detail: "density layer carries no `cells` array with counts — nothing here can be checked against k",
            blocking: true,
          },
        ]
      : [];
  }
  return cells
    // `!(count >= k)` rather than `count < k` so a NaN count — which passes no
    // comparison and would otherwise sail through — is a finding too.
    .filter((cell) => !(cell.count >= k))
    .map((cell) => ({
      kind: "display-cell-below-k" as const,
      asset: name,
      offset: 0,
      detail:
        `${cell.path} has count ${cell.count}, below the k = ${k} floor — a cell this small is a ` +
        "location, not a density",
      blocking: true,
    }));
}

/**
 * Detector 6: the build's salt in a public asset.
 *
 * Written independently of `build-encampments.saltMaterialIn` — same property,
 * different code — so that a defect in the builder's own guard cannot silence
 * this one too. Windows rather than whole-string matching: eight bytes of a
 * 32-byte salt is still salt material, and a false positive at that width has
 * probability about 2⁻⁶⁴ per position.
 */
export function scanSalt(name: string, bytes: Uint8Array, saltHex: string): Finding[] {
  const hex = saltHex.trim().toLowerCase();
  if (!/^[0-9a-f]{32,}$/u.test(hex) || hex.length % 2 !== 0) {
    throw new Error(
      `deploy-check: salt must be an even number of hex characters, at least 16 bytes; got ${saltHex.length}`,
    );
  }
  const findings: Finding[] = [];
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lower = buffer.toString("latin1").toLowerCase();
  const report = (offset: number, detail: string): void => {
    findings.push({ kind: "salt-material", asset: name, offset, detail, blocking: true });
  };

  for (let start = 0; start + 16 <= hex.length; start++) {
    const window = hex.slice(start, start + 16);
    const at = lower.indexOf(window);
    if (at >= 0) {
      report(at, `salt hex offset ${start}..${start + 16} present as text ('${window}')`);
      break;
    }
  }
  const raw = Buffer.from(hex, "hex");
  for (let start = 0; start + 8 <= raw.length; start++) {
    const at = buffer.indexOf(raw.subarray(start, start + 8));
    if (at >= 0) {
      report(at, `salt bytes ${start}..${start + 8} present verbatim`);
      break;
    }
  }
  const b64 = raw.toString("base64");
  const b64At = buffer.toString("latin1").indexOf(b64);
  if (b64At >= 0) {
    report(b64At, "salt present as base64");
  }
  return findings;
}

/** Scan one asset's bytes. */
export function scanAsset(name: string, bytes: Uint8Array, reference: RawReference): Finding[] {
  const findings: Finding[] = [];

  // 1. binary: raw float64 bit patterns at any alignment, either endianness
  if (bytes.length >= 8) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let o = 0; o + 8 <= bytes.length; o++) {
      for (const littleEndian of [false, true]) {
        if (reference.coordBits.has(view.getBigUint64(o, littleEndian))) {
          findings.push({
            kind: "raw-coordinate-bits",
            asset: name,
            offset: o,
            detail: `${littleEndian ? "little" : "big"}-endian float64 ${view.getFloat64(o, littleEndian)}`,
            blocking: true,
          });
        }
      }
    }
  }

  // 2 + 3. text: decode as latin1 so every byte maps to a character and a
  // literal embedded in binary padding is still found.
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");
  const lonRows = new Map<number, { token: string; offset: number }>();
  const latRows = new Map<number, { token: string; offset: number }>();
  const componentHits: Finding[] = [];
  for (const m of text.matchAll(DECIMAL_LITERAL)) {
    const token = m[0];
    const normalised = String(Number(token));
    for (const [map, seen, axis] of [
      [reference.lonText, lonRows, "lon"],
      [reference.latText, latRows, "lat"],
    ] as const) {
      const rows = map.get(token) ?? map.get(normalised);
      if (rows === undefined) {
        continue;
      }
      for (const r of rows) {
        if (!seen.has(r)) {
          seen.set(r, { token, offset: m.index });
        }
      }
      componentHits.push({
        kind: "raw-coordinate-component",
        asset: name,
        offset: m.index,
        detail: `${axis} literal '${token}' equals raw report row(s) ${rows.join(", ")}`,
        // In our own binaries a 6 dp coordinate literal is never legitimate.
        blocking: isOwnBinary(name),
      });
    }
  }

  // A raw report is only *located* when both of its components are present.
  for (const [row, lon] of lonRows) {
    const lat = latRows.get(row);
    if (lat !== undefined) {
      findings.push({
        kind: "raw-coordinate-pair",
        asset: name,
        offset: Math.min(lon.offset, lat.offset),
        detail: `raw report row ${row} fully located: lon '${lon.token}' @${lon.offset} + lat '${lat.token}' @${lat.offset}`,
        blocking: true,
      });
    }
  }
  findings.push(...componentHits);

  for (const m of text.matchAll(INC_ID_SHAPE)) {
    const token = m[0];
    findings.push({
      kind: reference.incIds.has(token) ? "raw-inc-id" : "inc-id-shape",
      asset: name,
      offset: m.index,
      detail: `report id '${token}'`,
      blocking: true,
    });
  }

  return findings;
}

/** Every publishable file under `dir`, recursively, sorted for stable output. */
export function listPublicAssets(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d).sort()) {
      const p = join(d, entry);
      if (statSync(p).isDirectory()) {
        walk(p);
      } else {
        out.push(p);
      }
    }
  };
  if (existsSync(dir)) {
    walk(dir);
  }
  return out;
}

export interface DeployCheckResult {
  readonly assetDir: string;
  readonly rawSource: string;
  readonly rawRows: number;
  /** k the published cells were held to. */
  readonly minCellCount: number;
  /** False when no salt was supplied — then salt absence is UNPROVEN, not proved. */
  readonly saltChecked: boolean;
  readonly assetsScanned: readonly { readonly name: string; readonly bytes: number }[];
  readonly findings: readonly Finding[];
  readonly blocking: readonly Finding[];
  readonly advisory: readonly Finding[];
}

export interface DeployCheckOptions {
  /** Hex salt of the build under test. Without it the salt gate cannot run. */
  readonly salt?: string | null;
  readonly minCellCount?: number;
}

export function runDeployCheck(
  assetDir: string,
  rawCsvPath: string,
  options: DeployCheckOptions = {},
): DeployCheckResult {
  const salt = options.salt ?? null;
  const k = options.minCellCount ?? PUBLISHED_MIN_CELL_COUNT;
  const reference = buildRawReference(readFileSync(rawCsvPath, "utf8"));
  const files = listPublicAssets(assetDir);
  const findings: Finding[] = [];
  const scanned: { name: string; bytes: number }[] = [];
  for (const path of files) {
    const name = relative(assetDir, path).split("\\").join("/");
    const bytes = new Uint8Array(readFileSync(path));
    scanned.push({ name, bytes: bytes.length });
    findings.push(...scanAsset(name, bytes, reference));
    findings.push(...scanDisplayGrid(name, bytes, k));
    if (salt !== null) {
      findings.push(...scanSalt(name, bytes, salt));
    }
  }
  return {
    assetDir,
    rawSource: rawCsvPath,
    rawRows: reference.rowCount,
    minCellCount: k,
    saltChecked: salt !== null,
    assetsScanned: scanned,
    findings,
    blocking: findings.filter((f) => f.blocking),
    advisory: findings.filter((f) => !f.blocking),
  };
}

/**
 * The salt to check against: `--salt`, then `$ENCAMPMENT_SALT`, then the file
 * `build-encampments.ts` writes when the salt is withheld. `null` means the gate
 * cannot prove the salt is absent and must refuse to pass.
 */
export function resolveSalt(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  saltFile: string,
): { salt: string | null; source: string } {
  const flag = argv.indexOf("--salt");
  if (flag >= 0 && argv[flag + 1] !== undefined) {
    return { salt: argv[flag + 1]!.trim(), source: "--salt" };
  }
  const fromEnv = env["ENCAMPMENT_SALT"];
  if (fromEnv !== undefined && fromEnv.trim().length > 0) {
    return { salt: fromEnv.trim(), source: "$ENCAMPMENT_SALT" };
  }
  if (existsSync(saltFile)) {
    const text = readFileSync(saltFile, "utf8").trim();
    if (text.length > 0) {
      return { salt: text, source: saltFile };
    }
  }
  return { salt: null, source: "none" };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv: readonly string[]): number {
  const arg = (flag: string, fallback: string): string => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : fallback;
  };
  const assetDir = resolve(arg("--assets", DEFAULT_ASSET_DIR));
  let rawCsv = resolve(arg("--raw", DEFAULT_RAW_CSV));
  const asJson = argv.includes("--json");
  const { salt, source: saltSource } = resolveSalt(argv, process.env, resolve(arg("--salt-file", DEFAULT_SALT_FILE)));

  if (!existsSync(rawCsv)) {
    if (existsSync(FALLBACK_RAW_CSV)) {
      rawCsv = FALLBACK_RAW_CSV;
    } else {
      process.stderr.write(
        `deploy-check: no raw feed at ${rawCsv} and no fallback at ${FALLBACK_RAW_CSV}.\n` +
          "  Absence of raw data cannot be proved without the raw data. Refusing to pass.\n",
      );
      return 2;
    }
  }
  if (!existsSync(assetDir)) {
    process.stderr.write(`deploy-check: no asset directory at ${assetDir} — nothing was built. Refusing to pass.\n`);
    return 2;
  }
  if (salt === null) {
    process.stderr.write(
      `deploy-check: no salt at ${DEFAULT_SALT_FILE}, no --salt and no $ENCAMPMENT_SALT.\n` +
        "  Absence of the salt cannot be proved without the salt. Refusing to pass.\n" +
        "  Run this gate BEFORE deciding the salt's custody; if it was already destroyed,\n" +
        "  rebuild (`npm run build:encampments`) and check the assets that build produces.\n",
    );
    return 2;
  }

  const result = runDeployCheck(assetDir, rawCsv, { salt });
  if (result.assetsScanned.length === 0) {
    process.stderr.write(`deploy-check: ${assetDir} is empty — nothing was built. Refusing to pass.\n`);
    return 2;
  }

  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(
      `deploy-check: ${result.assetsScanned.length} public asset(s) in ${assetDir}\n` +
        `  reference: ${result.rawRows} raw report(s) from ${result.rawSource}\n` +
        `  salt reference: ${saltSource}; density-cell floor k = ${result.minCellCount}\n`,
    );
    for (const a of result.assetsScanned) {
      process.stdout.write(`    ${a.name}  ${a.bytes} bytes\n`);
    }
    for (const f of result.blocking) {
      process.stdout.write(`  LEAK      ${f.asset}@${f.offset}  ${f.kind}: ${f.detail}\n`);
    }
    for (const f of result.advisory) {
      process.stdout.write(`  advisory  ${f.asset}@${f.offset}  ${f.kind}: ${f.detail}\n`);
    }
    process.stdout.write(
      result.blocking.length === 0
        ? `  zero raw coordinates, zero raw inc_ids, zero salt material, zero cells below ` +
            `k = ${result.minCellCount}: PASS` +
            ` (${result.advisory.length} advisory lone-component coincidence(s))\n`
        : `  ${result.blocking.length} blocking finding(s): FAIL — do not publish\n`,
    );
  }
  return result.blocking.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
