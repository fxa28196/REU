/**
 * `engine/src/smoke` — the hourly PM2.5 field and the series that feed it.
 *
 * Two halves, deliberately separate:
 *   - `field.ts` is the **runtime** object (`SmokeField.java`): index an hour,
 *     count a fabricated zero, report the peak.
 *   - `series.ts` is everything **series selection** decides: the three
 *     registered CSVs and their exact slice counts and peak doubles, the
 *     `simulationHours <= slices - 1` fail-fast, and the
 *     `out_of_range_lookups == 0` gate.
 *
 * Nothing in either file draws RNG, and that is load-bearing: sweeping
 * `smokeSeriesCode` or `smokeScale` must not move a single stream position
 * (WP8-SPEC-severe-triage-pets.md §5.1).
 *
 * NOTE for the `engine/package.json` owner: the `"./smoke"` subpath still points
 * at `./src/smoke/field.ts`. Repointing it here would export the series surface
 * to the app and validation packages; until then they reach it by path.
 */

export { SmokeField, SMOKE_COUNTY, type SmokeSeriesAsset } from "./field.js";

export {
  FABRICATED_HOURS_MESSAGE,
  FabricatedSmokeHoursError,
  RunWindowOverrunError,
  SEVERE_PEAK_GATE_SLACK,
  SEVERE_SERIES_CODES,
  SMOKE_SERIES,
  SMOKE_SERIES_CODES,
  SmokeSeriesError,
  assertNoFabricatedHours,
  assertRunWindowFitsSeries,
  assertSmokeSeriesCode,
  endHoursFor,
  finalTickHourIndex,
  lookupsPerTick,
  maxSimulationHoursForSlices,
  severeSeriesPeakWithin,
  smokeFieldForRun,
  smokeSeriesSpec,
  type RunWindowInput,
  type SmokeSeriesCode,
  type SmokeSeriesSpec,
} from "./series.js";
