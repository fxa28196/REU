/**
 * SPIKE WP2-S1 (plan Q12) — geodesic `Direct` parity measurement.
 *
 * Reusable core shared by the CLI (`validation/scripts/spike-s1-geodesic-parity.ts`)
 * and the regression test (`validation/test/geodesic-parity.test.ts`). Compares stock
 * `geographiclib-geodesic` against IEEE-754 hex fixtures dumped from the certified
 * GeographicLib-Java 1.49 that ships inside Repast Simphony 2.11.0.
 *
 * See websim/docs/DR-S1-geodesic.md for the measured outcome and the decision.
 */

import { readFileSync } from "node:fs";
import geodesicPkg from "geographiclib-geodesic";

interface GeodesicResult {
  readonly lat2?: number;
  readonly lon2?: number;
  readonly azi2?: number;
  readonly s12?: number;
}

/**
 * NB: keep this as an object, never destructure the methods off it —
 * geographiclib's `Direct`/`Inverse` are prototype methods that rely on `this`.
 */
export const WGS84 = (
  geodesicPkg as unknown as {
    Geodesic: {
      WGS84: {
        Direct: (lat1: number, lon1: number, azi1: number, s12: number) => GeodesicResult;
        Inverse: (lat1: number, lon1: number, lat2: number, lon2: number) => GeodesicResult;
      };
    };
  }
).Geodesic.WGS84;

// --- IEEE-754 hex <-> double -------------------------------------------------
const scratch = new DataView(new ArrayBuffer(8));

export function hexToDouble(hex: string): number {
  scratch.setBigUint64(0, BigInt(`0x${hex}`));
  return scratch.getFloat64(0);
}

export function doubleToBits(d: number): bigint {
  scratch.setFloat64(0, d);
  return scratch.getBigUint64(0);
}

export function doubleToHex(d: number): string {
  return doubleToBits(d).toString(16).padStart(16, "0");
}

/** Total-order key so ULP distance is well defined across sign and zero. */
const SIGN_BIT = 0x8000000000000000n;
const MAG_MASK = 0x7fffffffffffffffn;

export function ulpDistance(a: number, b: number): bigint {
  const key = (bits: bigint): bigint => (bits & SIGN_BIT ? -(bits & MAG_MASK) : bits);
  const ka = key(doubleToBits(a));
  const kb = key(doubleToBits(b));
  return ka > kb ? ka - kb : kb - ka;
}

// --- local flat-earth error metric -------------------------------------------
// Standard WGS84 degree-length series. Used only as a scale factor to turn a
// degree difference into metres, so its own ~cm/deg accuracy is irrelevant at the
// sub-nanometre magnitudes involved.
export function metresPerDegreeLat(latDeg: number): number {
  const p = (latDeg * Math.PI) / 180;
  return 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p) - 0.0023 * Math.cos(6 * p);
}

export function metresPerDegreeLon(latDeg: number): number {
  const p = (latDeg * Math.PI) / 180;
  return 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p);
}

// --- fixture parsing ----------------------------------------------------------
export interface Tuple {
  readonly lat1: number;
  readonly lon1: number;
  readonly azi1: number;
  readonly s12: number;
  readonly lat2: number;
  readonly lon2: number;
  readonly azi2: number;
  readonly lat2Hex: string;
  readonly lon2Hex: string;
  readonly azi2Hex: string;
}

export interface Fixture {
  readonly meta: readonly string[];
  readonly tuples: readonly Tuple[];
}

export function parseFixture(path: string): Fixture {
  const text = readFileSync(path, "utf8");
  const meta: string[] = [];
  const tuples: Tuple[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (line.startsWith("#")) {
      meta.push(line.replace(/^#\s?/, ""));
      continue;
    }
    if (line.startsWith("lat1\t")) continue; // column header
    const f = line.split("\t");
    if (f.length !== 7) throw new Error(`bad fixture row in ${path}: ${line}`);
    const [h0, h1, h2, h3, h4, h5, h6] = f as [string, string, string, string, string, string, string];
    tuples.push({
      lat1: hexToDouble(h0),
      lon1: hexToDouble(h1),
      azi1: hexToDouble(h2),
      s12: hexToDouble(h3),
      lat2: hexToDouble(h4),
      lon2: hexToDouble(h5),
      azi2: hexToDouble(h6),
      lat2Hex: h4,
      lon2Hex: h5,
      azi2Hex: h6,
    });
  }
  if (tuples.length === 0) throw new Error(`fixture ${path} contained no data rows`);
  return { meta, tuples };
}

// --- comparison ---------------------------------------------------------------
export interface WorstRow {
  readonly index: number;
  readonly errorM: number;
  readonly lat1: number;
  readonly lon1: number;
  readonly azi1: number;
  readonly s12: number;
  readonly javaLat2Hex: string;
  readonly jsLat2Hex: string;
  readonly javaLon2Hex: string;
  readonly jsLon2Hex: string;
  readonly ulpLat2: string;
  readonly ulpLon2: string;
}

export interface ParityReport {
  readonly mode: string;
  readonly n: number;
  readonly bitExactLat2: number;
  readonly bitExactLon2: number;
  readonly bitExactBoth: number;
  readonly bitExactAzi2: number;
  readonly bitExactFraction: number;
  readonly maxUlpLat2: string;
  readonly maxUlpLon2: string;
  readonly maxUlpAzi2: string;
  readonly ulpHistogramBoth: Record<string, number>;
  readonly maxErrorM: number;
  readonly meanErrorM: number;
  readonly p50ErrorM: number;
  readonly p99ErrorM: number;
  readonly worst: readonly WorstRow[];
}

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i] as number;
}

export function compareFixture(mode: string, fixture: Fixture): ParityReport {
  const { tuples } = fixture;
  let bitExactLat2 = 0;
  let bitExactLon2 = 0;
  let bitExactBoth = 0;
  let bitExactAzi2 = 0;
  let maxUlpLat2 = 0n;
  let maxUlpLon2 = 0n;
  let maxUlpAzi2 = 0n;
  let errorSum = 0;
  const errors: number[] = [];
  const ulpHistogramBoth: Record<string, number> = {};
  const worst: WorstRow[] = [];

  for (let i = 0; i < tuples.length; i++) {
    const t = tuples[i] as Tuple;
    const r = WGS84.Direct(t.lat1, t.lon1, t.azi1, t.s12);
    const jsLat2 = r.lat2 as number;
    const jsLon2 = r.lon2 as number;
    const jsAzi2 = r.azi2 as number;

    const okLat = doubleToHex(jsLat2) === t.lat2Hex;
    const okLon = doubleToHex(jsLon2) === t.lon2Hex;
    if (okLat) bitExactLat2++;
    if (okLon) bitExactLon2++;
    if (doubleToHex(jsAzi2) === t.azi2Hex) bitExactAzi2++;
    if (okLat && okLon) bitExactBoth++;

    const uLat = ulpDistance(jsLat2, t.lat2);
    const uLon = ulpDistance(jsLon2, t.lon2);
    const uAzi = ulpDistance(jsAzi2, t.azi2);
    if (uLat > maxUlpLat2) maxUlpLat2 = uLat;
    if (uLon > maxUlpLon2) maxUlpLon2 = uLon;
    if (uAzi > maxUlpAzi2) maxUlpAzi2 = uAzi;

    const uBoth = uLat > uLon ? uLat : uLon;
    const key = uBoth === 0n ? "0" : uBoth === 1n ? "1" : uBoth <= 4n ? "2-4" : uBoth <= 16n ? "5-16" : ">16";
    ulpHistogramBoth[key] = (ulpHistogramBoth[key] ?? 0) + 1;

    const errM = Math.hypot(
      (jsLat2 - t.lat2) * metresPerDegreeLat(t.lat1),
      (jsLon2 - t.lon2) * metresPerDegreeLon(t.lat1),
    );
    errorSum += errM;
    errors.push(errM);

    if (errM > 0) {
      worst.push({
        index: i,
        errorM: errM,
        lat1: t.lat1,
        lon1: t.lon1,
        azi1: t.azi1,
        s12: t.s12,
        javaLat2Hex: t.lat2Hex,
        jsLat2Hex: doubleToHex(jsLat2),
        javaLon2Hex: t.lon2Hex,
        jsLon2Hex: doubleToHex(jsLon2),
        ulpLat2: uLat.toString(),
        ulpLon2: uLon.toString(),
      });
      worst.sort((a, b) => b.errorM - a.errorM);
      if (worst.length > 5) worst.length = 5;
    }
  }

  const sorted = [...errors].sort((a, b) => a - b);
  return {
    mode,
    n: tuples.length,
    bitExactLat2,
    bitExactLon2,
    bitExactBoth,
    bitExactAzi2,
    bitExactFraction: bitExactBoth / tuples.length,
    maxUlpLat2: maxUlpLat2.toString(),
    maxUlpLon2: maxUlpLon2.toString(),
    maxUlpAzi2: maxUlpAzi2.toString(),
    ulpHistogramBoth,
    maxErrorM: sorted[sorted.length - 1] as number,
    meanErrorM: errorSum / tuples.length,
    p50ErrorM: percentile(sorted, 0.5),
    p99ErrorM: percentile(sorted, 0.99),
    worst,
  };
}

/**
 * Geodesic round-trip closure: `|Inverse(p1, Direct(p1, azi, s)) - s|`.
 *
 * This is the epsilon the plan's cumulative-length hoist (§3.4) implicitly accepts
 * when it replaces Java's per-tick `Inverse(current, next).s12` with scalar
 * arithmetic on baked edge lengths. Reported alongside the parity numbers so the
 * two epsilons can be compared on the same scale.
 */
export function maxRoundTripClosureM(fixture: Fixture): number {
  let maxClosure = 0;
  for (const t of fixture.tuples) {
    const r = WGS84.Direct(t.lat1, t.lon1, t.azi1, t.s12);
    const back = WGS84.Inverse(t.lat1, t.lon1, r.lat2 as number, r.lon2 as number).s12 as number;
    const closure = Math.abs(back - t.s12);
    if (closure > maxClosure) maxClosure = closure;
  }
  return maxClosure;
}

/**
 * Measured ceiling from SPIKE S1 (DR-S1-geodesic.md): max position disagreement
 * between stock geographiclib-js and certified Java over 20,000 Portland-bbox
 * Direct problems was 3.159e-9 m. The budget is set one order of magnitude above
 * the measurement, and two orders below the plan's 1e-6 m fallback trigger.
 */
export const S1_MAX_POSITION_ERROR_BUDGET_M = 1e-8;

/** Plan Q12 contingency trigger: above this, port Java's `Geodesic.Direct` verbatim. */
export const Q12_FALLBACK_TRIGGER_M = 1e-6;
