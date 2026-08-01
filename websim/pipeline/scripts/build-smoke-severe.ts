/**
 * build-smoke-severe.ts — the SEVERE-SERIES BUILDER and its 19-CHECK
 * (plan §5.2 "Smoke-builder 19-check ... validate the packed assets";
 * WP8-SPEC-severe-triage-pets.md §1.7; port of `scripts/build_smoke_severe.py`).
 *
 *   npx tsx pipeline/scripts/build-smoke-severe.ts           # run + write report
 *   npx tsx pipeline/scripts/build-smoke-severe.ts --check   # report must be unchanged
 *
 * Exit 0 iff every registered check passes, 1 otherwise (house convention, the
 * same one `scripts/analyze_run.py` uses).
 *
 * ## What this actually proves, and why it is not a re-derivation of prose
 *
 * The certified Python builder is *re-implemented here* — the CSV dialect, the
 * exact-decimal HALF_UP per-row scaling, the episode detector, the plateau
 * picker, the whole-day stretch, the tail truncation — and the result is
 * compared **byte for byte** against the committed CSVs in `Geography/`. When
 * check 2 passes, this file's SHA-256 equals the sidecar's `output_sha256`
 * (`379e2efa…` for v1, `8520633b…` for v2) *and* the digest the archived SE
 * manifests record in `reproducibility.input_datasets`. That is three
 * independent oracles agreeing on the same 3,890 rows; nothing here is checked
 * against an expectation this code produced.
 *
 * The 19 check **names and detail strings** are then compared against the
 * committed sidecars by `engine/test/smoke/severe-series.builder.test.ts`, so a
 * drifting check is caught as a diff rather than as a silently different number.
 *
 * ## The three landmines this file exists to keep disarmed
 *
 * 1. **The severe series must be PARSED, never synthesised** (QUIRK 1).
 *    `severe_v1 !== 1.75 x observed`: the transform re-rounds HALF_UP per
 *    monitor row *before* `SmokeField` averages the monitors, repeats four whole
 *    plateau days and truncates the tail. Multiplying the observed array would
 *    give 576 slices instead of 456 and a peak of 984.725 instead of 984.75.
 * 2. **`round()` is not `ROUND_HALF_UP`** — Python's is half-to-even and the TS
 *    trap is `toFixed`. Check 18 builds its expected set with
 *    {@link scaleMeasurement} itself for exactly this reason, and
 *    {@link scaleMeasurement} does exact integer decimal arithmetic, never a
 *    float multiply.
 * 3. **`2496.1` is not the peak double** (QUIRK 7). The acceptance comparison is
 *    tolerance-based against the sidecar figure *and* exact-double against the
 *    recomputed field; `assert(peak === 2496.1)` fails on a correct asset.
 *
 * ## Provenance text
 *
 * The sidecars' free-text `statement` is referenced by digest, never copied: it
 * contains a place-name severity comparison that `tools/lint-claims.ts` bans
 * outright. `severity_anchor` (the Canberra Florey 2,496.1 µg/m³ record) is
 * quoted, because that is the anchor the UI must show verbatim.
 */

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  checkMode,
  failBuild,
  geographyPath,
  sha256,
  sha256File,
  toJsonBytes,
  writeAsset,
  OUT_DIR,
} from "../src/asset-io.js";

// ---------------------------------------------------------------------------
// 0. The registered builds — exactly the arguments the committed sidecars record
// ---------------------------------------------------------------------------

export interface SevereBuildSpec {
  readonly code: 1 | 2;
  readonly src: string;
  readonly out: string;
  readonly sidecar: string;
  /** `--scale`, as the decimal STRING the builder was invoked with. */
  readonly scale: string;
  /** `--stretch`, likewise a decimal string. */
  readonly stretch: string;
  readonly tailDays: number;
  readonly county: string;
  readonly start: string;
  readonly threshold: string;
  readonly episodeMinHour: number;
  readonly sustain: number;
}

const OBSERVED_CSV = "Geography/data/airnow/aqs_hourly_pm25_portland_2020-09.csv";

export const SEVERE_BUILDS: readonly SevereBuildSpec[] = [
  {
    code: 1,
    src: OBSERVED_CSV,
    out: "Geography/data/airnow/aqs_hourly_pm25_synthetic_severe_v1.csv",
    sidecar: "Geography/data/airnow/aqs_hourly_pm25_synthetic_severe_v1.provenance.json",
    scale: "1.75",
    stretch: "1.5",
    tailDays: 3,
    county: "Multnomah",
    start: "2020-09-07T00:00",
    threshold: "55.5",
    episodeMinHour: 79,
    sustain: 3,
  },
  {
    code: 2,
    src: OBSERVED_CSV,
    out: "Geography/data/airnow/aqs_hourly_pm25_synthetic_severe_v2.csv",
    sidecar: "Geography/data/airnow/aqs_hourly_pm25_synthetic_severe_v2.provenance.json",
    scale: "4.436",
    stretch: "1.5",
    tailDays: 3,
    county: "Multnomah",
    start: "2020-09-07T00:00",
    threshold: "55.5",
    episodeMinHour: 79,
    sustain: 3,
  },
];

/**
 * Acceptance for all three packed series (plan §4). Slices are exact integers;
 * peaks are the **exact field doubles** — note series 2's is NOT `2496.1`.
 */
export const SERIES_ACCEPTANCE: readonly {
  readonly code: 0 | 1 | 2;
  readonly csv: string;
  readonly slices: number;
  readonly peak: number;
  readonly builderPeak: number;
}[] = [
  { code: 0, csv: OBSERVED_CSV, slices: 576, peak: 562.7, builderPeak: 562.7 },
  { code: 1, csv: SEVERE_BUILDS[0]!.out, slices: 456, peak: 984.75, builderPeak: 984.75 },
  {
    code: 2,
    csv: SEVERE_BUILDS[1]!.out,
    slices: 456,
    peak: 2496.1000000000004,
    builderPeak: 2496.1,
  },
];

/** Peaks compare at |Δ| < 1e-9 (§7.3 fix (b)), never with `===` against 2496.1. */
export const PEAK_EPSILON = 1e-9;

// ---------------------------------------------------------------------------
// 1. CSV dialect — UTF-8 BOM, CRLF, QUOTE_ALL, no trimming
// ---------------------------------------------------------------------------

export interface AqsFile {
  readonly fields: readonly string[];
  readonly rows: readonly Record<string, string>[];
}

/**
 * `csv.DictReader` over a `utf-8-sig` handle opened with `newline=""`.
 *
 * Deliberately **not** the ported `CsvLoader`: that one trims every field, and a
 * trimming reader cannot round-trip bytes. Short rows would take `restval`
 * (`None`); the AQS files have none, and a short row here would be a real defect
 * rather than something to paper over, so it throws.
 */
export function readAqsCsv(bytes: Buffer): AqsFile {
  let text = bytes.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let sawAny = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      sawAny = true;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      sawAny = true;
    } else if (c === ",") {
      record.push(field);
      field = "";
      sawAny = true;
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      if (sawAny || record.length > 0 || field.length > 0) {
        record.push(field);
        records.push(record);
      }
      field = "";
      record = [];
      sawAny = false;
    } else {
      field += c;
      sawAny = true;
    }
  }
  if (sawAny || record.length > 0 || field.length > 0) {
    record.push(field);
    records.push(record);
  }
  const header = records.shift();
  if (header === undefined) {
    throw new Error("empty CSV: no header line");
  }
  const rows = records.map((cells, index) => {
    if (cells.length !== header.length) {
      throw new Error(
        `row ${index + 2} has ${cells.length} cells, header has ${header.length}; the AQS ` +
          "files are rectangular and a ragged row would break the byte round-trip",
      );
    }
    const out: Record<string, string> = {};
    header.forEach((name, i) => {
      out[name] = cells[i]!;
    });
    return out;
  });
  return { fields: header, rows };
}

/** `csv.writer(quoting=QUOTE_ALL, lineterminator="\r\n")` + a UTF-8 BOM. */
export function renderCsv(
  fields: readonly string[],
  rows: readonly Record<string, string>[],
): Buffer {
  const quote = (v: string): string => `"${v.split('"').join('""')}"`;
  const parts: string[] = [`${fields.map(quote).join(",")}\r\n`];
  for (const row of rows) {
    const cells: string[] = [];
    for (const f of fields) {
      const v = row[f];
      if (v === undefined) {
        throw new Error(`row is missing column ${JSON.stringify(f)}`);
      }
      cells.push(quote(v));
    }
    parts.push(`${cells.join(",")}\r\n`);
  }
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(parts.join(""), "utf8")]);
}

// ---------------------------------------------------------------------------
// 2. Exact decimal scaling — the one arithmetic that must not go through a float
// ---------------------------------------------------------------------------

interface DecimalValue {
  /** Unscaled integer digits, sign carried separately so `-0.0` survives. */
  readonly digits: bigint;
  readonly exponent: number;
  readonly negative: boolean;
}

function parseDecimal(text: string): DecimalValue {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/u.exec(text);
  if (m === null || (m[2] ?? "").length + (m[3] ?? "").length === 0) {
    throw new Error(`not a plain decimal literal: ${JSON.stringify(text)}`);
  }
  const int = m[2] ?? "";
  const frac = m[3] ?? "";
  return {
    digits: BigInt(`${int}${frac}` === "" ? "0" : `${int}${frac}`),
    exponent: frac.length,
    negative: m[1] === "-",
  };
}

/**
 * `(Decimal(val) * scale).quantize(Decimal("0.1"), ROUND_HALF_UP)`, then
 * `format(x, "f")` with a trailing `".0"` dropped.
 *
 * All-integer arithmetic: the product of two exact decimals is exact, and the
 * quantisation is a single `HALF_UP` (ties **away from zero**, which is what
 * Python's `ROUND_HALF_UP` means — not JS's `Math.round`, which is ties-toward-
 * +∞ and disagrees on every negative tie).
 *
 * The source writes one decimal place and drops a trailing `.0` (`"11"`, not
 * `"11.0"`), which is why `Double.parseDouble("11")` and the field value
 * `(11.0 + 8.2) / 2 = 9.6` — not `1.75 x 5.5 = 9.625` — is hour 0 of v1.
 */
export function scaleMeasurement(valStr: string, scaleStr: string): string {
  const a = parseDecimal(valStr);
  const b = parseDecimal(scaleStr);
  const negative = a.negative !== b.negative;
  // value = digits * 10^-exponent; product exponent adds.
  const product = a.digits * b.digits;
  const exponent = a.exponent + b.exponent;
  // Quantise to one decimal: q = HALF_UP(product / 10^(exponent - 1)).
  const shift = exponent - 1;
  let q: bigint;
  if (shift <= 0) {
    q = product * 10n ** BigInt(-shift);
  } else {
    const den = 10n ** BigInt(shift);
    const whole = product / den;
    const rem = product % den;
    q = rem * 2n >= den ? whole + 1n : whole;
  }
  const intPart = q / 10n;
  const fracDigit = q % 10n;
  const sign = negative ? "-" : "";
  return fracDigit === 0n ? `${sign}${intPart}` : `${sign}${intPart}.${fracDigit}`;
}

/**
 * `int((Decimal(epLen) * (stretch - 1) / 24).quantize(1, ROUND_HALF_UP))`, as
 * exact rational arithmetic. The v1/v2 case is `188 * 0.5 / 24 = 3.9166… -> 4`.
 */
export function addedDays(episodeHours: number, stretchStr: string): number {
  const s = parseDecimal(stretchStr);
  const one = 10n ** BigInt(s.exponent);
  const stretchMinusOne = (s.negative ? -s.digits : s.digits) - one; // × 10^-exponent
  const num = BigInt(episodeHours) * stretchMinusOne;
  const den = 24n * one;
  if (num <= 0n) {
    return 0;
  }
  // HALF_UP on a positive rational: floor((2n + d) / 2d).
  return Number((2n * num + den) / (2n * den));
}

// ---------------------------------------------------------------------------
// 3. Calendar helpers — whole days on a UTC epoch, so no host zone can intrude
// ---------------------------------------------------------------------------

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

function parseLocal(dateStr: string, timeStr: string): number {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(dateStr);
  const t = /^(\d{2}):(\d{2})$/u.exec(timeStr);
  if (d === null || t === null) {
    throw new Error(`unparseable timestamp ${JSON.stringify(`${dateStr} ${timeStr}`)}`);
  }
  return Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
}

function parseDate(dateStr: string): number {
  return parseLocal(dateStr, "00:00");
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const p = (v: number, w: number): string => String(v).padStart(w, "0");
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1, 2)}-${p(d.getUTCDate(), 2)}`;
}

/** `datetime.__str__` — `"2020-08-31 16:00:00"`, space-separated with seconds. */
function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const p = (v: number, w: number): string => String(v).padStart(w, "0");
  return (
    `${formatDate(ms)} ${p(d.getUTCHours(), 2)}:${p(d.getUTCMinutes(), 2)}:${p(d.getUTCSeconds(), 2)}`
  );
}

/**
 * CPython's `%.<n>f`: round the **exact binary value**, ties-to-even.
 *
 * `toFixed` also rounds the exact binary value, and at `n >= 1` decimals an
 * exact tie is impossible — a tie needs the value to equal `k/10^(n+1)` with `k`
 * odd, whose lowest-terms denominator keeps a factor of 5 and so is never a
 * dyadic rational. The two therefore agree for every input this file formats.
 * (This is a *Python* parity helper. Java's `%.1f` is a different animal — it
 * rounds the shortest decimal representation HALF_UP — and the engine formats
 * those through `mathx/format.ts`, never here.)
 */
function pyFixed(value: number, decimals: number): string {
  if (decimals < 1) {
    throw new Error("pyFixed is only tie-free at >= 1 decimal; %.0f needs half-even");
  }
  return value.toFixed(decimals);
}

/** `str(float)` for the offsets list: `8.0`, not `8`. */
function pyFloatRepr(value: number): string {
  return Number.isInteger(value) && Math.abs(value) < 1e16 ? `${value}.0` : String(value);
}

// ---------------------------------------------------------------------------
// 4. The SmokeField reducer, as the Python builder reimplements it
// ---------------------------------------------------------------------------

/** `null` is Java's `Double.NaN` — an hour with no reporting monitor. */
export type Series = readonly (number | null)[];

/**
 * `county_field` — unweighted mean over **every in-county row landing in the
 * hour** (all monitors, all POCs), NOT a fixed 2-monitor mean (QUIRK 2). Hours
 * 20 and 21 have a single reporting monitor in all three series, both inside the
 * minor spike that check 14 pins.
 */
export function countyField(
  rows: readonly Record<string, string>[],
  county: string,
  startMs: number,
): Series {
  const sums = new Map<number, { sum: number; count: number }>();
  let maxHour = -1;
  const lower = county.toLowerCase();
  for (const row of rows) {
    const name = row["County Name"];
    if (name === undefined || name.toLowerCase() !== lower) {
      continue;
    }
    const valStr = row["Sample Measurement"];
    if (valStr === undefined || valStr === "") {
      continue;
    }
    const val = Number(valStr);
    if (!Number.isFinite(val) && valStr.trim().toLowerCase() !== "nan") {
      continue; // Python: `except ValueError: continue`
    }
    const hour = Math.floor(
      (parseLocal(row["Date Local"]!, row["Time Local"]!) - startMs) / MS_PER_HOUR,
    );
    if (hour < 0) {
      continue;
    }
    let sc = sums.get(hour);
    if (sc === undefined) {
      sc = { sum: 0, count: 0 };
      sums.set(hour, sc);
    }
    sc.sum += val;
    sc.count += 1;
    if (hour > maxHour) {
      maxHour = hour;
    }
  }
  const out: (number | null)[] = [];
  for (let h = 0; h <= maxHour; h++) {
    const sc = sums.get(h);
    out.push(sc === undefined || sc.count === 0 ? null : sc.sum / sc.count);
  }
  return out;
}

export interface SeriesStats {
  readonly hours: number;
  readonly peak: number;
  readonly peakHour: number;
  readonly mean: number;
  readonly gaps: readonly number[];
}

export function seriesStats(series: Series): SeriesStats {
  const vals: number[] = [];
  const gaps: number[] = [];
  let peak = 0;
  let peakHour = 0;
  let bestKey: [number, number] = [0, 0];
  series.forEach((v, h) => {
    if (v === null) {
      gaps.push(h);
    } else {
      vals.push(v);
    }
    // Python: max(range(n), key=lambda h: (series[h] is not None, series[h] or 0.0))
    const key: [number, number] = [v === null ? 0 : 1, v ?? 0];
    if (h === 0 || key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
      bestKey = key;
      peakHour = h;
    }
  });
  for (const v of vals) {
    if (v > peak) {
      peak = v;
    }
  }
  return {
    hours: series.length,
    peak: vals.length === 0 ? 0 : Math.max(...vals),
    peakHour,
    mean: vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length,
    gaps,
  };
}

/** First `sustain`-hour crossing at/after `minHour`, then the whole run. */
export function detectEpisode(
  series: Series,
  threshold: number,
  minHour: number,
  sustain: number,
): [number, number] {
  const n = series.length;
  let start = -1;
  for (let h = minHour; h <= n - sustain; h++) {
    let all = true;
    for (let k = 0; k < sustain; k++) {
      const v = series[h + k];
      if (v === null || v === undefined || !(v >= threshold)) {
        all = false;
        break;
      }
    }
    if (all) {
      start = h;
      break;
    }
  }
  if (start < 0) {
    throw new Error(
      `no sustained crossing of ${threshold} ug/m3 for ${sustain} h at/after hour ${minHour}`,
    );
  }
  let end = start;
  while (end + 1 < n) {
    const v = series[end + 1];
    if (v === null || v === undefined || !(v >= threshold)) {
      break;
    }
    end += 1;
  }
  return [start, end];
}

/** Maximal runs of hours at/above `threshold`, as `[start, end]` pairs. */
export function contiguousRuns(series: Series, threshold: number): [number, number][] {
  const runs: [number, number][] = [];
  let start = -1;
  series.forEach((v, h) => {
    const above = v !== null && v >= threshold;
    if (above && start < 0) {
      start = h;
    }
    if (!above && start >= 0) {
      runs.push([start, h - 1]);
      start = -1;
    }
  });
  if (start >= 0) {
    runs.push([start, series.length - 1]);
  }
  return runs;
}

// ---------------------------------------------------------------------------
// 5. The transform
// ---------------------------------------------------------------------------

type MonitorIndex = Map<string, Map<number, Record<string, string>[]>>;

/** `monitor key -> {local date -> [rows in file order]}`, insertion-ordered. */
function indexMonitors(rows: readonly Record<string, string>[]): MonitorIndex {
  const monitors: MonitorIndex = new Map();
  for (const row of rows) {
    const key = [row["State Code"], row["County Code"], row["Site Num"], row["POC"]].join(" ");
    let byDay = monitors.get(key);
    if (byDay === undefined) {
      byDay = new Map();
      monitors.set(key, byDay);
    }
    const day = parseDate(row["Date Local"]!);
    const list = byDay.get(day);
    if (list === undefined) {
      byDay.set(day, [row]);
    } else {
      list.push(row);
    }
  }
  return monitors;
}

const KEY_COLS = [
  "State Code",
  "County Code",
  "Site Num",
  "POC",
  "Parameter Code",
  "Latitude",
  "Longitude",
  "Datum",
  "Parameter Name",
  "Units of Measure",
  "MDL",
  "Method Type",
  "Method Code",
  "Method Name",
  "State Name",
  "County Name",
] as const;

function monitorIdentity(rows: readonly Record<string, string>[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    set.add(KEY_COLS.map((c) => row[c] ?? "").join(" "));
  }
  return [...set].sort();
}

/** Local calendar days lying ENTIRELY inside the episode. */
function interiorDays(
  allDays: readonly number[],
  startMs: number,
  epStart: number,
  epEnd: number,
): number[] {
  return allDays.filter((day) => {
    const h0 = Math.floor((day - startMs) / MS_PER_HOUR);
    return h0 >= epStart && h0 + 23 <= epEnd;
  });
}

/** Highest-mean contiguous run of `width` days; ties resolved earliest. */
function pickPlateau(
  series: Series,
  startMs: number,
  days: readonly number[],
  width: number,
): { index: number; mean: number } {
  let bestI = 0;
  let bestMean: number | null = null;
  for (let i = 0; i + width <= days.length; i++) {
    let total = 0;
    let count = 0;
    for (const day of days.slice(i, i + width)) {
      const h0 = Math.floor((day - startMs) / MS_PER_HOUR);
      for (let h = h0; h < h0 + 24; h++) {
        const v = series[h];
        if (v !== null && v !== undefined) {
          total += v;
          count += 1;
        }
      }
    }
    const mean = count === 0 ? 0 : total / count;
    if (bestMean === null || mean > bestMean) {
      bestI = i;
      bestMean = mean;
    }
  }
  return { index: bestI, mean: bestMean ?? 0 };
}

/** Output day sequence: observed days with the plateau block duplicated. */
function buildDayPlan(
  allDays: readonly number[],
  plateau: readonly number[],
  addDays: number,
): number[] {
  if (addDays <= 0 || plateau.length === 0) {
    return [...allDays];
  }
  const block: number[] = [];
  while (block.length < addDays) {
    block.push(...plateau);
  }
  block.length = addDays;
  const after = allDays.indexOf(plateau[plateau.length - 1]!) + 1;
  return [...allDays.slice(0, after), ...block, ...allDays.slice(after)];
}

/** Materialise the output rows, monitor-major then time-ascending. */
function emitRows(
  monitors: MonitorIndex,
  dayPlan: readonly number[],
  baseDay: number,
  scale: string,
  keepThrough: number | null,
): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const byDay of monitors.values()) {
    for (let pos = 0; pos < dayPlan.length; pos++) {
      const srcDay = dayPlan[pos]!;
      const tgtDay = baseDay + pos * MS_PER_DAY;
      if (keepThrough !== null && tgtDay > keepThrough) {
        break;
      }
      const deltaDays = Math.round((tgtDay - srcDay) / MS_PER_DAY);
      for (const row of byDay.get(srcDay) ?? []) {
        const next: Record<string, string> = { ...row };
        next["Date Local"] = formatDate(tgtDay);
        next["Date GMT"] = formatDate(parseDate(row["Date GMT"]!) + deltaDays * MS_PER_DAY);
        next["Sample Measurement"] = scaleMeasurement(row["Sample Measurement"]!, scale);
        out.push(next);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 6. The 19 checks
// ---------------------------------------------------------------------------

export interface CheckResult {
  readonly name: string;
  readonly status: "PASS" | "FAIL";
  readonly detail: string;
}

class Checks {
  readonly results: CheckResult[] = [];

  add(name: string, ok: boolean, detail: string | number = ""): void {
    this.results.push({ name, status: ok ? "PASS" : "FAIL", detail: String(detail) });
  }

  get failed(): CheckResult[] {
    return this.results.filter((c) => c.status === "FAIL");
  }
}

export interface SevereBuildResult {
  readonly spec: SevereBuildSpec;
  /** Bytes this implementation produced. */
  readonly bytes: Buffer;
  readonly sha256: string;
  /** SHA-256 of the committed CSV in `Geography/` — the byte-identity oracle. */
  readonly committedSha256: string;
  readonly byteIdentical: boolean;
  readonly checks: readonly CheckResult[];
  readonly observed: SeriesStats;
  readonly counterfactual: SeriesStats;
  readonly outSeries: Series;
  readonly rows: number;
  readonly observedEpisode: { start: number; end: number; hours: number };
  readonly counterfactualEpisode: { start: number; end: number; hours: number };
  readonly plateauDays: readonly string[];
  readonly daysAdded: number;
}

/**
 * Re-derive one severe series and run its 19 checks.
 *
 * The check order, names and detail formats are those of
 * `scripts/build_smoke_severe.py` lines 415-551. Do not reorder: the committed
 * sidecars record the same 19 in the same order and the test diffs them.
 */
export function buildSevereSeries(spec: SevereBuildSpec): SevereBuildResult {
  const ck = new Checks();
  const srcPath = geographyPath(spec.src);
  const srcBytes = readFileSync(srcPath);
  const { fields, rows: srcRows } = readAqsCsv(srcBytes);
  const startMs = parseLocal(spec.start.slice(0, 10), spec.start.slice(11));
  const threshold = Number(spec.threshold);

  const srcDays = [...new Set(srcRows.map((r) => parseDate(r["Date Local"]!)))].sort((a, b) => a - b);
  const baseDay = srcDays[0]!;
  const monitors = indexMonitors(srcRows);

  // 1 — the writer must be byte-faithful before any transform is trustworthy.
  ck.add(
    "writer round-trips the observed CSV byte-identically",
    sha256(renderCsv(fields, srcRows)) === sha256(srcBytes),
    "dialect: UTF-8 BOM, CRLF, QUOTE_ALL",
  );

  const inSeries = countyField(srcRows, spec.county, startMs);
  const inStats = seriesStats(inSeries);

  const [epStart, epEnd] = detectEpisode(inSeries, threshold, spec.episodeMinHour, spec.sustain);
  const epLen = epEnd - epStart + 1;

  let addDays = addedDays(epLen, spec.stretch);
  const inner = interiorDays(srcDays, startMs, epStart, epEnd);
  const width = inner.length === 0 ? 0 : Math.min(addDays, inner.length);
  let plateau: number[] = [];
  if (width > 0) {
    const picked = pickPlateau(inSeries, startMs, inner, width);
    plateau = inner.slice(picked.index, picked.index + width);
  } else {
    addDays = 0;
  }
  const dayPlan = buildDayPlan(srcDays, plateau, addDays);

  const outThreshold = threshold * Number(spec.scale);
  const fullRows = emitRows(monitors, dayPlan, baseDay, spec.scale, null);
  const fullSeries = countyField(fullRows, spec.county, startMs);
  const [, fullEpEnd] = detectEpisode(fullSeries, outThreshold, spec.episodeMinHour, spec.sustain);
  const keepThrough =
    spec.tailDays >= 0
      ? parseDate(formatDate(startMs + fullEpEnd * MS_PER_HOUR)) + spec.tailDays * MS_PER_DAY
      : null;

  const outRows = emitRows(monitors, dayPlan, baseDay, spec.scale, keepThrough);
  const outSeries = countyField(outRows, spec.county, startMs);
  const outStats = seriesStats(outSeries);
  const [outEpStart, outEpEnd] = detectEpisode(
    outSeries,
    outThreshold,
    spec.episodeMinHour,
    spec.sustain,
  );
  const outBlob = renderCsv(fields, outRows);
  const outSha = sha256(outBlob);

  // 2 — determinism: two builds are byte-identical.
  const again = renderCsv(fields, emitRows(monitors, dayPlan, baseDay, spec.scale, keepThrough));
  ck.add("deterministic: two builds are byte-identical", sha256(again) === outSha, outSha.slice(0, 16));

  // 3-6 — structure.
  const firstLine = (b: Buffer): string => b.toString("utf8").split("\r\n")[0]!;
  ck.add(
    "header line identical to the observed file",
    firstLine(outBlob) === firstLine(srcBytes),
    `${fields.length} columns`,
  );
  ck.add(
    "column set and order identical",
    JSON.stringify(readAqsCsv(outBlob).fields) === JSON.stringify(fields),
    fields.length,
  );
  const srcIdentity = monitorIdentity(srcRows);
  ck.add(
    "monitor identity columns unchanged",
    JSON.stringify(monitorIdentity(outRows)) === JSON.stringify(srcIdentity),
    `${srcIdentity.length} monitor/site tuples`,
  );
  const outCounties = [...new Set(outRows.map((r) => r["County Name"]!))].sort();
  const srcCounties = [...new Set(srcRows.map((r) => r["County Name"]!))].sort();
  ck.add(
    "county name values unchanged",
    JSON.stringify(outCounties) === JSON.stringify(srcCounties),
    outCounties.join(","),
  );

  // 7 — date/time shapes.
  const badFmt = outRows.filter(
    (r) =>
      (r["Date Local"] ?? "").length !== 10 ||
      (r["Time Local"] ?? "").length !== 5 ||
      (r["Date Local"] ?? "")[4] !== "-" ||
      (r["Time Local"] ?? "")[2] !== ":",
  );
  ck.add("date/time formats are yyyy-MM-dd and HH:mm", badFmt.length === 0, `${badFmt.length} malformed`);

  // 8 — the GMT-to-local offset set.
  const offsets = (rs: readonly Record<string, string>[]): number[] => {
    const set = new Set<number>();
    for (const r of rs) {
      const gmt = parseLocal(r["Date GMT"]!, r["Time GMT"]!);
      const loc = parseLocal(r["Date Local"]!, r["Time Local"]!);
      set.add((gmt - loc) / MS_PER_HOUR);
    }
    return [...set].sort((a, b) => a - b);
  };
  const outOff = offsets(outRows);
  const srcOff = offsets(srcRows);
  const renderOffsets = (o: readonly number[]): string => `[${o.map(pyFloatRepr).join(", ")}]`;
  ck.add(
    "GMT-to-local offset preserved",
    JSON.stringify(outOff) === JSON.stringify(srcOff),
    `${renderOffsets(outOff)} vs ${renderOffsets(srcOff)}`,
  );

  // 9-10 — anchoring.
  const localMs = (r: Record<string, string>): number => parseLocal(r["Date Local"]!, r["Time Local"]!);
  const firstIn = Math.min(...srcRows.map(localMs));
  const firstOut = Math.min(...outRows.map(localMs));
  ck.add(
    "file hour 0 timestamp matches the observed file",
    firstOut === firstIn,
    `${formatDateTime(firstOut)} vs ${formatDateTime(firstIn)}`,
  );
  ck.add(
    `simulation anchor ${spec.start} is inside the series`,
    outStats.hours > 0 && outSeries[0] !== null,
    `hour 0 = ${pyFixed(outSeries[0] ?? Number.NaN, 1)} ug/m3`,
  );

  // 11-12 — no gaps, in the field and in the file.
  ck.add(
    `no NaN/gap hours in the ${spec.county} field`,
    outStats.gaps.length === 0,
    `${outStats.gaps.length} gaps`,
  );
  const lastOut = Math.max(...outRows.map(localMs));
  const spanHours = Math.floor((lastOut - firstOut) / MS_PER_HOUR) + 1;
  const stamps = new Set(outRows.map(localMs));
  let missing = 0;
  for (let h = 0; h < spanHours; h++) {
    if (!stamps.has(firstOut + h * MS_PER_HOUR)) {
      missing += 1;
    }
  }
  ck.add("file hours contiguous with no gaps", missing === 0, `${missing} missing of ${spanHours}`);

  // 13-17 — transform fidelity. tol = one monitor's worth of 1-dp rounding.
  const tol = 0.051;
  const scaleF = Number(spec.scale);
  let pre = 0;
  for (let h = 0; h < epStart; h++) {
    if (Math.abs((outSeries[h] ?? 0) - scaleF * (inSeries[h] ?? 0)) > tol) {
      pre += 1;
    }
  }
  ck.add(
    "pre-episode hours preserved exactly (scaled, not moved)",
    pre === 0,
    `${pre} of ${epStart} hours differ`,
  );

  const inSpike = contiguousRuns(inSeries, threshold)[0]!;
  const outSpike = contiguousRuns(outSeries, outThreshold)[0]!;
  ck.add(
    "minor spike unmoved",
    inSpike[0] === outSpike[0] && inSpike[1] === outSpike[1],
    `hours ${outSpike[0]}-${outSpike[1]} vs ${inSpike[0]}-${inSpike[1]}`,
  );
  const cleanIn = epStart - inSpike[1] - 1;
  const cleanOut = outEpStart - outSpike[1] - 1;
  ck.add("clean interval between spells unchanged", cleanIn === cleanOut, `${cleanOut} h vs ${cleanIn} h`);

  const outLen = outEpEnd - outEpStart + 1;
  ck.add(
    "episode stretched by whole days",
    outLen === epLen + 24 * addDays,
    `${outLen} h = ${epLen} h + ${addDays} x 24 h (${pyFixed(outLen / epLen, 3)}x)`,
  );
  ck.add("episode start unmoved", outEpStart === epStart, `hour ${outEpStart}`);

  // 18 — built with scaleMeasurement itself, NOT a rounding helper (QUIRK: the
  // half-to-even/HALF_UP disagreement would manufacture false mismatches).
  const observedImages = new Set<string>();
  for (const v of new Set(srcRows.map((r) => r["Sample Measurement"]!))) {
    observedImages.add(scaleMeasurement(v, spec.scale));
  }
  const novel = new Set<string>();
  for (const v of new Set(outRows.map((r) => r["Sample Measurement"]!))) {
    if (!observedImages.has(v)) {
      novel.add(v);
    }
  }
  ck.add(
    "every value is scale x an observed value",
    novel.size === 0,
    `${novel.size} values with no observed pre-image`,
  );

  // 19 — peak scaled by `scale`, within the per-monitor rounding tolerance.
  ck.add(
    `peak scaled by ${spec.scale}`,
    Math.abs(outStats.peak - scaleF * inStats.peak) <= tol,
    `${pyFixed(outStats.peak, 2)} vs ${pyFixed(scaleF * inStats.peak, 2)}`,
  );

  const committedPath = geographyPath(spec.out);
  const committedSha = existsSync(committedPath) ? sha256File(committedPath) : "";
  return {
    spec,
    bytes: outBlob,
    sha256: outSha,
    committedSha256: committedSha,
    byteIdentical: committedSha === outSha,
    checks: ck.results,
    observed: inStats,
    counterfactual: outStats,
    outSeries,
    rows: outRows.length,
    observedEpisode: { start: epStart, end: epEnd, hours: epLen },
    counterfactualEpisode: { start: outEpStart, end: outEpEnd, hours: outLen },
    plateauDays: plateau.map(formatDate),
    daysAdded: addDays,
  };
}

// ---------------------------------------------------------------------------
// 7. Acceptance over all three series + the packed assets
// ---------------------------------------------------------------------------

export interface SeriesAcceptance {
  readonly code: 0 | 1 | 2;
  readonly slices: number;
  readonly slicesOk: boolean;
  readonly peak: number;
  readonly peakOk: boolean;
  readonly peakHour: number;
  readonly gapHours: number;
  readonly hour0: number | null;
  readonly hour311: number | null;
  readonly hour455: number | null;
  /** `null` when `pipeline/out/assets/smoke-<code>.json` has not been built. */
  readonly assetSlices: number | null;
  readonly assetPeak: number | null;
  readonly assetMatches: boolean | null;
}

/**
 * Recompute all three fields from the committed CSVs and, when the packed
 * assets exist, prove the assets carry the same numbers (plan §5.2: the
 * 19-check validates the **packed assets**, not merely the inputs).
 */
export function seriesAcceptance(assetDir = `${OUT_DIR}/assets`): SeriesAcceptance[] {
  const out: SeriesAcceptance[] = [];
  for (const want of SERIES_ACCEPTANCE) {
    const { rows } = readAqsCsv(readFileSync(geographyPath(want.csv)));
    const series = countyField(rows, "Multnomah", parseLocal("2020-09-07", "00:00"));
    const stats = seriesStats(series);
    const assetPath = `${assetDir}/smoke-${want.code}.json`;
    let assetSlices: number | null = null;
    let assetPeak: number | null = null;
    let assetMatches: boolean | null = null;
    if (existsSync(assetPath)) {
      const asset = JSON.parse(readFileSync(assetPath, "utf8")) as {
        slices: number;
        hourly: (number | null)[];
      };
      assetSlices = asset.slices;
      let peak = 0;
      for (const v of asset.hourly) {
        if (v !== null && v > peak) {
          peak = v;
        }
      }
      assetPeak = peak;
      assetMatches =
        asset.slices === stats.hours &&
        asset.hourly.length === series.length &&
        asset.hourly.every((v, i) => v === series[i]);
    }
    out.push({
      code: want.code,
      slices: stats.hours,
      slicesOk: stats.hours === want.slices,
      peak: stats.peak,
      // Tolerance, never `===` against 2496.1 (QUIRK 7 / §7.3).
      peakOk: Math.abs(stats.peak - want.peak) < PEAK_EPSILON,
      peakHour: stats.peakHour,
      gapHours: stats.gaps.length,
      hour0: series[0] ?? null,
      hour311: series[311] ?? null,
      hour455: series[455] ?? null,
      assetSlices,
      assetPeak,
      assetMatches,
    });
  }
  return out;
}

export interface SevereReport {
  readonly schema: string;
  readonly builds: readonly {
    readonly series: number;
    readonly csv: string;
    readonly scale: string;
    readonly sha256: string;
    readonly committed_sha256: string;
    readonly byte_identical: boolean;
    readonly sidecar_output_sha256: string;
    readonly sidecar_matches: boolean;
    readonly rows: number;
    readonly checks: readonly CheckResult[];
    readonly passed: number;
    readonly total: number;
  }[];
  readonly acceptance: readonly SeriesAcceptance[];
}

interface Sidecar {
  readonly output_sha256?: string;
  readonly checks?: readonly CheckResult[];
}

export function readSidecar(repoRelative: string): Sidecar {
  return JSON.parse(readFileSync(geographyPath(repoRelative), "utf8")) as Sidecar;
}

export function buildSevereReport(): SevereReport {
  const builds = SEVERE_BUILDS.map((spec) => {
    const r = buildSevereSeries(spec);
    const sidecar = readSidecar(spec.sidecar);
    return {
      series: spec.code,
      csv: spec.out,
      scale: spec.scale,
      sha256: r.sha256,
      committed_sha256: r.committedSha256,
      byte_identical: r.byteIdentical,
      sidecar_output_sha256: sidecar.output_sha256 ?? "",
      sidecar_matches: sidecar.output_sha256 === r.sha256,
      rows: r.rows,
      checks: r.checks,
      passed: r.checks.filter((c) => c.status === "PASS").length,
      total: r.checks.length,
    };
  });
  return {
    schema: "reu-wildfire-shelter-abm/smoke-severe-19check/v1",
    builds,
    acceptance: seriesAcceptance(),
  };
}

function main(): void {
  const check = checkMode();
  let report: SevereReport;
  try {
    report = buildSevereReport();
  } catch (e) {
    return failBuild(`build-smoke-severe: ${e instanceof Error ? e.message : String(e)}`);
  }

  let failures = 0;
  for (const b of report.builds) {
    process.stdout.write(`\nseries ${b.series} (scale x${b.scale}) -> ${b.csv}\n`);
    for (const c of b.checks) {
      process.stdout.write(`  ${c.status.padEnd(4)} ${c.name.padEnd(55)} ${c.detail}\n`);
      if (c.status === "FAIL") {
        failures += 1;
      }
    }
    process.stdout.write(`  verification  : ${b.passed}/${b.total} passed\n`);
    process.stdout.write(
      `  bytes         : ${b.sha256.slice(0, 16)} ` +
        `${b.byte_identical ? "== committed CSV" : `!= committed ${b.committed_sha256.slice(0, 16)}`} ` +
        `${b.sidecar_matches ? "== sidecar output_sha256" : "!= sidecar output_sha256"}\n`,
    );
    if (!b.byte_identical) {
      failures += 1;
    }
    if (!b.sidecar_matches) {
      failures += 1;
    }
  }

  process.stdout.write("\nacceptance (recomputed field vs plan §4)\n");
  for (const a of report.acceptance) {
    const assetNote =
      a.assetMatches === null
        ? "packed asset ABSENT (npm run build:smoke -w @websim/pipeline)"
        : a.assetMatches
          ? "packed asset matches hour-for-hour"
          : "packed asset DIFFERS";
    process.stdout.write(
      `  series ${a.code}: ${a.slices} slices ${a.slicesOk ? "ok" : "WRONG"}, ` +
        `peak ${a.peak} ${a.peakOk ? "ok" : "WRONG"} (hour ${a.peakHour}), ` +
        `${a.gapHours} gap hour(s) — ${assetNote}\n`,
    );
    if (!a.slicesOk || !a.peakOk || a.assetMatches === false) {
      failures += 1;
    }
  }

  const bytes = toJsonBytes(report);
  const w = writeAsset("smoke-severe/severe-series-19check.json", bytes, check);
  process.stdout.write(
    `\n${check ? (w.unchanged ? "ok      " : "DRIFT   ") : "wrote   "} ${w.id}  ${w.bytes} bytes\n`,
  );
  if (check && !w.unchanged) {
    failures += 1;
  }
  if (failures > 0) {
    failBuild(`build-smoke-severe: ${failures} failure(s)`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
