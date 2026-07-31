/**
 * build-smoke.ts — WP4(a). Reduce the three launch AQS series to precomputed
 * hourly arrays (plan §4 asset table, Q9; PORT_MAP §1.7, §4.3).
 *
 *   npx tsx pipeline/scripts/build-smoke.ts          # write
 *   npx tsx pipeline/scripts/build-smoke.ts --check  # verify, exit 1 on drift
 *
 * Acceptance (plan §4): 576 / 456 / 456 slices with peaks 562.7 / 984.75 /
 * 2496.1 µg/m³. Those are asserted here as a build gate, not just in a test, so
 * a silently different input file cannot produce an asset at all.
 *
 * Three semantics that the JSON encoding must not lose:
 *   - `hourly[h] === null` is a DATA GAP, not zero concentration. The engine's
 *     `concentrationForTick` is the only place a gap becomes 0.0, and it charges
 *     an `out_of_range_lookups` increment for doing so (plan Q11: any increment
 *     is an INVALID badge, not a warning). Encoding gaps as 0 here would erase
 *     that entire mechanism.
 *   - `embedded_scale` is the transform ALREADY BAKED INTO THE CSV (1.0 / 1.75 /
 *     4.436), not the user's runtime `smokeScale`. Effective severity is
 *     `embedded_scale × smokeScale`; conflating the two is plan risk W14's
 *     double-applied-scale hazard.
 *   - `counterfactual_label` is non-null for series 1 and 2 and must ride along
 *     with the data everywhere it is displayed. These series are constructed,
 *     never measured.
 *
 * The sidecars' free-text `statement` field is referenced by digest rather than
 * copied: it contains a place-name severity comparison that `tools/claims.ts`
 * bans outright (`banned-severity-mention`). Nothing is lost — `sidecar_file` +
 * `sidecar_sha256` name the exact bytes — and the banned phrasing cannot ride a
 * generated asset into UI copy.
 */

import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  checkMode,
  failBuild,
  geographyPath,
  readUtf8,
  repoRelativePosix,
  sha256File,
  toJsonBytes,
  toolVersions,
  writeAsset,
  type WriteResult,
} from "../src/asset-io.js";
import { readCsvText } from "../src/csv-loader.js";
import { FIELD_COUNTY, reduceSmokeField, SIM_START_LOCAL } from "../src/smoke-field.js";

export const SMOKE_ASSET_SCHEMA = "reu-wildfire-shelter-abm/smoke-series/v1" as const;

export interface SmokeSeriesSource {
  readonly code: 0 | 1 | 2;
  /** Repo-relative CSV the `smokeSeriesCode` selector maps to in `ContextCreator`. */
  readonly csv: string;
  /** Provenance sidecar, absent for the observed series. */
  readonly sidecar: string | null;
  /** Transform already embedded in the CSV bytes (V46/V47). */
  readonly embeddedScale: number;
  /** Expected slice count — a build gate, from the plan's acceptance row. */
  readonly expectedSlices: number;
  /** Expected peak µg/m³ — the other half of the same gate. */
  readonly expectedPeak: number;
  readonly label: string;
}

/** `smokeSeriesCode` → file, exactly as `ContextCreator` resolves it. */
export const SMOKE_SOURCES: readonly SmokeSeriesSource[] = [
  {
    code: 0,
    csv: "Geography/data/airnow/aqs_hourly_pm25_portland_2020-09.csv",
    sidecar: null,
    embeddedScale: 1.0,
    expectedSlices: 576,
    expectedPeak: 562.7,
    label: "Observed EPA AQS, Portland metro, September 2020",
  },
  {
    code: 1,
    csv: "Geography/data/airnow/aqs_hourly_pm25_synthetic_severe_v1.csv",
    sidecar: "Geography/data/airnow/aqs_hourly_pm25_synthetic_severe_v1.provenance.json",
    embeddedScale: 1.75,
    expectedSlices: 456,
    expectedPeak: 984.75,
    label: "Severe counterfactual v1 (central)",
  },
  {
    code: 2,
    csv: "Geography/data/airnow/aqs_hourly_pm25_synthetic_severe_v2.csv",
    sidecar: "Geography/data/airnow/aqs_hourly_pm25_synthetic_severe_v2.provenance.json",
    embeddedScale: 4.436,
    expectedSlices: 456,
    expectedPeak: 2496.1,
    label: "Worst-plausible counterfactual v2",
  },
];

/** Peaks are compared at 0.05 µg/m³, well inside the CSV's own 2-decimal grid. */
const PEAK_TOLERANCE = 0.05;

interface SidecarFields {
  readonly label: string;
  readonly generator: string | null;
  readonly severityAnchor: string | null;
  readonly deterministic: string | null;
  readonly parameters: unknown;
  readonly sourceFile: string | null;
  readonly sha256: string;
}

function readSidecar(repoRelative: string): SidecarFields {
  const abs = geographyPath(repoRelative);
  const parsed: unknown = JSON.parse(readUtf8(abs));
  const o = parsed as Record<string, unknown>;
  const str = (k: string): string | null => (typeof o[k] === "string" ? (o[k] as string) : null);
  return {
    label: str("label") ?? "CONSTRUCTED COUNTERFACTUAL -- NOT MEASURED DATA",
    generator: str("generator"),
    severityAnchor: str("severity_anchor"),
    deterministic: str("deterministic"),
    parameters: o["parameters"] ?? null,
    sourceFile: str("source_file"),
    sha256: sha256File(abs),
  };
}

export interface SmokeAssetBuild {
  readonly source: SmokeSeriesSource;
  readonly relativePath: string;
  readonly bytes: Buffer;
  readonly slices: number;
  readonly peak: number;
  readonly gapHours: number;
  readonly sourceAbsolutePath: string;
  readonly sourceSha256: string;
}

/**
 * Build all three series in memory. Pure: same inputs → same bytes, no clock and
 * no filesystem writes, which is what makes `--check` a real reproducibility
 * assertion rather than a re-run.
 */
export function buildSmokeAssets(): SmokeAssetBuild[] {
  const builds: SmokeAssetBuild[] = [];
  for (const source of SMOKE_SOURCES) {
    const abs = geographyPath(source.csv);
    const rows = readCsvText(readUtf8(abs));
    // scaleFactor 1.0: the runtime smokeScale is the browser's to apply, and the
    // severe CSVs already carry their own transform in their bytes.
    const field = reduceSmokeField(rows, FIELD_COUNTY, SIM_START_LOCAL, 1.0);

    if (field.hours !== source.expectedSlices) {
      throw new Error(
        `smoke series ${source.code}: ${field.hours} slices from ${source.csv}, ` +
          `expected ${source.expectedSlices} (plan §4 acceptance)`,
      );
    }
    if (Math.abs(field.peakHourly - source.expectedPeak) > PEAK_TOLERANCE) {
      throw new Error(
        `smoke series ${source.code}: peak ${field.peakHourly} µg/m³ from ${source.csv}, ` +
          `expected ${source.expectedPeak} ± ${PEAK_TOLERANCE} (plan §4 acceptance)`,
      );
    }

    const sidecar = source.sidecar === null ? null : readSidecar(source.sidecar);
    const real = field.hourly.filter((v) => !Number.isNaN(v));
    const mean = real.length === 0 ? null : real.reduce((a, b) => a + b, 0) / real.length;

    const payload = {
      schema: SMOKE_ASSET_SCHEMA,
      series: source.code,
      slices: field.hours,
      // null encodes NaN. Never 0 — see the header note on gap semantics.
      hourly: field.hourly.map((v) => (Number.isNaN(v) ? null : v)),
      embedded_scale: source.embeddedScale,
      anchor: SIM_START_LOCAL,
      counterfactual_label: sidecar === null ? null : sidecar.label,
      provenance: {
        label: source.label,
        constructed: source.sidecar !== null,
        county: FIELD_COUNTY,
        reducer: "SmokeField constructor (PORT_MAP §1.7): county-uniform hourly mean, NaN gaps",
        source_file: source.csv,
        source_sha256: sha256File(abs),
        sidecar_file: source.sidecar,
        sidecar_sha256: sidecar === null ? null : sidecar.sha256,
        sidecar_statement:
          sidecar === null
            ? null
            : "referenced by digest, not copied: the sidecar's free-text statement contains a " +
              "place-name severity comparison banned by tools/claims.ts",
        generator: sidecar === null ? null : sidecar.generator,
        severity_anchor: sidecar === null ? null : sidecar.severityAnchor,
        deterministic: sidecar === null ? null : sidecar.deterministic,
        embedded_transform: sidecar === null ? null : sidecar.parameters,
        peak_ugm3: field.peakHourly,
        mean_ugm3: mean,
        gap_hours: field.gapHours,
        rows_accumulated: field.rowsAccumulated,
        rows_skipped: field.rowsSkipped,
        max_simulation_hours: field.hours - 1,
      },
    };

    builds.push({
      source,
      relativePath: `assets/smoke-${source.code}.json`,
      bytes: toJsonBytes(payload),
      slices: field.hours,
      peak: field.peakHourly,
      gapHours: field.gapHours,
      sourceAbsolutePath: abs,
      sourceSha256: sha256File(abs),
    });
  }
  return builds;
}

/** Asset-manifest rows for the smoke assets, used by `checksums.ts`. */
export function smokeManifestInputs(): { readonly id: string; readonly sourceFile: string }[] {
  return SMOKE_SOURCES.map((s) => ({ id: `assets/smoke-${s.code}.json`, sourceFile: s.csv }));
}

function main(): void {
  const check = checkMode();
  for (const source of SMOKE_SOURCES) {
    const abs = geographyPath(source.csv);
    if (!existsSync(abs)) {
      failBuild(`build-smoke: missing input ${repoRelativePosix(abs)}`);
    }
  }
  let builds: SmokeAssetBuild[];
  try {
    builds = buildSmokeAssets();
  } catch (e) {
    return failBuild(`build-smoke: ${e instanceof Error ? e.message : String(e)}`);
  }
  let drift = 0;
  const results: WriteResult[] = [];
  for (const b of builds) {
    const r = writeAsset(b.relativePath, b.bytes, check);
    results.push(r);
    if (check && !r.unchanged) {
      drift += 1;
    }
    process.stdout.write(
      `${check ? (r.unchanged ? "ok      " : "DRIFT   ") : "wrote   "} ${r.id}  ` +
        `${b.slices} slices, peak ${b.peak} µg/m³, ${b.gapHours} gap hour(s), ${r.bytes} bytes\n`,
    );
  }
  process.stderr.write(
    `build-smoke: ${results.length} series ${check ? "checked" : "written"} ` +
      `(${JSON.stringify(toolVersions("build-smoke"))})\n`,
  );
  if (check && drift > 0) {
    failBuild(`build-smoke: ${drift} asset(s) differ from a fresh build — rerun without --check.`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
