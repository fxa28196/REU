/**
 * gate-j-severe-series.ts — gate (j), severe-series provenance.
 *
 * Source: `scripts/verify_E_runs.py`, `check_se_smoke()` (lines 644–669) and
 * the `SEVERE_SERIES` table (lines 106–111). Spec:
 * `WP8-SPEC-archive-gates.md` §3.3.
 *
 * ── This is the gate that caught the 456-vs-455 incident ───────────────────
 *
 * The synthetic severe series is 456 hourly samples long, so the last valid
 * *lookup* hour is 455 and `simulationHours` must be `slices − 1`. A run
 * configured at 456 h reads one hour past the end of the field on its final
 * tick. The model does not crash on that — it clamps, counts the miss in
 * `smoke_field.out_of_range_lookups`, and produces a run that looks entirely
 * plausible. Four checks, no one of which is sufficient alone, close it:
 *
 *  - **j.1** the manifest *checksums the file it read*. Without this, j.2–j.4
 *    verify a series nobody can identify afterwards.
 *  - **j.2** `smoke_field.hours == 456`. The length is a property of the data
 *    file, and it is the number the `simulationHours <= slices - 1` constraint
 *    is derived from.
 *  - **j.3** `peak_hourly_ugm3 == unscaled_peak * smokeScale`, within **0.06**.
 *    The manifest prints `%.1f`, so the slack is a *print* budget (half a unit
 *    in the last place is 0.05; 0.06 is the source's value and is transcribed
 *    rather than recomputed). This is the check that proves the scale factor
 *    actually reached the field — a `smokeScale` that was parsed and dropped
 *    leaves every other number in the manifest looking correct.
 *  - **j.4** `out_of_range_lookups == 0`. The direct witness. It is last
 *    because the first three tell you *which* series was read; this one tells
 *    you the run stayed inside it.
 *
 * ── `-1` sentinels, not `.get(key, 0)` ─────────────────────────────────────
 *
 * `int(smoke.get("hours", -1))` and `int(smoke.get("out_of_range_lookups", -1))`
 * default to **−1**, a value that fails both comparisons. An absent key is a
 * failure, never a pass by default. The peak defaults to `nan`, and
 * `abs(nan - want) <= 0.06` is `False`. Three different absent-key defaults,
 * all chosen so that absence is red.
 *
 * ── The SKIP is a real SKIP ────────────────────────────────────────────────
 *
 * `smokeSeriesCode` outside {1, 2} means the run used the *observed* AirNow
 * series, which has a different length and no registered peak. The Python skips
 * — it does not silently pass — so the 18 ER/E0 runs that never had a severe
 * series contribute a visible SKIP line to the census rather than nothing.
 */

import type { Checks } from "../harness/checks.js";
import { floatParam, intParam, showValue, type ManifestJson, type RunView } from "../harness/run-view.js";

export interface SevereSeries {
  /** The dataset path the manifest must carry a checksum for. */
  readonly file: string;
  /** Unscaled peak, µg·m⁻³, from the builders' provenance sidecars. */
  readonly unscaledPeak: number;
}

/**
 * `smokeSeriesCode -> (file the manifest must checksum, unscaled peak µg/m³)`.
 *
 * Verbatim from `verify_E_runs.py` lines 106–111, including the comment
 * *"Peaks from the builders' provenance sidecars (19/19 checks each)"*. These
 * are data, not thresholds: 984.75 and 2496.10 are properties of two committed
 * CSV files, and changing either here would make the gate agree with a series
 * that does not exist.
 */
export const SEVERE_SERIES: ReadonlyMap<number, SevereSeries> = new Map([
  [1, { file: "data/airnow/aqs_hourly_pm25_synthetic_severe_v1.csv", unscaledPeak: 984.75 }],
  [2, { file: "data/airnow/aqs_hourly_pm25_synthetic_severe_v2.csv", unscaledPeak: 2496.1 }],
]);

/** The registered length of both severe series, in hourly slices. */
export const SEVERE_SERIES_HOURS = 456;

/** `%.1f` print slack on the manifest's peak, transcribed from the source. */
export const PEAK_PRINT_SLACK = 0.06;

/** `int(mapping.get(key, -1))` — absence is a failing sentinel, not a zero. */
function intOr(mapping: ManifestJson, key: string, sentinel: number): number {
  const raw = mapping[key];
  return raw === undefined ? sentinel : intParam(mapping, key, sentinel);
}

/**
 * Gate (j). Registers exactly four checks for a severe-series run, or a single
 * SKIP for an observed-series run.
 */
export function checkSeSmoke(ck: Checks, run: RunView): void {
  const series = intParam(run.params, "smokeSeriesCode", 0);
  const scale = floatParam(run.params, "smokeScale", 1.0);
  const smokeRaw = run.manifest["smoke_field"];
  const smoke: ManifestJson =
    smokeRaw !== null && typeof smokeRaw === "object" && !Array.isArray(smokeRaw)
      ? (smokeRaw as ManifestJson)
      : {};
  const datasets = run.repro["input_datasets"];
  const files = Array.isArray(datasets)
    ? datasets.map((d) =>
        d !== null && typeof d === "object" ? String((d as Record<string, unknown>)["file"] ?? "") : "",
      )
    : [];

  const registered = SEVERE_SERIES.get(series);
  if (registered === undefined) {
    ck.skip(
      `(j) [${run.name}] severe-series provenance`,
      `smokeSeriesCode=${series} (observed series)`,
    );
    return;
  }

  const okFile = files.includes(registered.file);
  ck.add(
    `(j) [${run.name}] manifest checksums the severe series it read`,
    okFile,
    `input_datasets carries ${registered.file}: ${okFile ? "True" : "False"}`,
  );

  const hours = intOr(smoke, "hours", -1);
  ck.add(
    `(j) [${run.name}] severe series length is ${SEVERE_SERIES_HOURS} h`,
    hours === SEVERE_SERIES_HOURS,
    `smoke_field.hours=${hours}`,
  );

  // `float(smoke.get("peak_hourly_ugm3", float("nan")))` — absence is NaN, and
  // `abs(NaN - want) <= 0.06` is false, so absence fails.
  const peakRaw = smoke["peak_hourly_ugm3"];
  const peak = peakRaw === undefined ? Number.NaN : Number(peakRaw);
  const want = registered.unscaledPeak * scale;
  ck.add(
    `(j) [${run.name}] peak == ${registered.unscaledPeak} x smokeScale`,
    Math.abs(peak - want) <= PEAK_PRINT_SLACK,
    `peak=${showValue(peakRaw)} want=${want.toFixed(2)} (scale=${scale}); the manifest prints ` +
      `%.1f so slack is ${PEAK_PRINT_SLACK}`,
  );

  const oor = intOr(smoke, "out_of_range_lookups", -1);
  ck.add(
    `(j) [${run.name}] out_of_range_lookups == 0`,
    oor === 0,
    `out_of_range_lookups=${oor}`,
  );
}
