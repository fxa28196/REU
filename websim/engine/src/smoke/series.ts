/**
 * The SEVERE SMOKE SERIES: the registry, the run-window **fail-fast**, and the
 * `out_of_range_lookups == 0` gate (WP8-SPEC-severe-triage-pets.md §1;
 * `ContextCreator.java:206-214, 304-340, 510-535`; `SmokeField.java:118-167`).
 *
 * `smoke/field.ts` is the reducer's runtime half — index an hour, count a
 * fabricated zero. This module is everything the *series selection* decides,
 * and all four of these have already cost this project a run:
 *
 * 1. **The severe arrays are PARSED, never synthesised** (QUIRK 1). The builder
 *    scales and re-rounds HALF_UP **per monitor row, to 1 dp, before**
 *    `SmokeField` averages the monitors, and it also repeats four whole plateau
 *    days and truncates the tail. So `severe_v1 !== 1.75 x observed`: the length
 *    is 456 rather than 576 and the peak is `984.75`, not `1.75 x 562.7 =
 *    984.725`. Nothing here ever multiplies the observed array — the three
 *    entries below name three separate committed CSVs, and
 *    `pipeline/scripts/build-smoke-severe.ts` re-derives their bytes.
 * 2. **`peak !== embeddedScale x observedPeak`**, for the same reason, and
 *    `2496.1` is **not** the peak double: the field peak is
 *    `2496.1000000000004` and `2496.1 === 2496.1000000000004` is `false`
 *    (QUIRK 7). {@link SMOKE_SERIES} therefore pins the exact doubles and
 *    {@link severeSeriesPeakWithin} compares with the gate's own slack.
 * 3. **`simulationHours <= slices - 1`** (never-regress gotcha 3, QUIRK 18).
 *    `endAt(endTick)` is *inclusive*, so the last executed tick reads hour index
 *    `endHours`, and valid indices are `0 .. hours()-1`. One hour too many and
 *    every non-sheltered resident books a fabricated `0.0` for that tick.
 *    **There is no fail-fast in the Java** — `ContextCreator.java:806` clamps
 *    with `Math.min` to precisely the failing value and writes a file anyway.
 *    {@link assertRunWindowFitsSeries} is the port's added last line, and it is
 *    a **declared divergence**, not a port of anything.
 * 4. **A gap and an out-of-window index are the same branch** (QUIRK 4), so
 *    `out_of_range_lookups` cannot tell them apart and neither may we. The
 *    counter is gate (j.4) and {@link assertNoFabricatedHours} is how a run
 *    refuses to be reported as valid.
 *
 * Zero RNG anywhere in this file, and that guarantee is load-bearing: changing
 * `smokeSeriesCode` or `smokeScale` must not shift a single stream position, or
 * SE/SEnc stops being a clean control pair at fixed seed (§5.1).
 */

import { SmokeField, type SmokeSeriesAsset } from "./field.js";

/** The three registered series. `ContextCreator.java:512-513` selects on this. */
export const SMOKE_SERIES_CODES = [0, 1, 2] as const;
export type SmokeSeriesCode = (typeof SMOKE_SERIES_CODES)[number];

export interface SmokeSeriesSpec {
  readonly code: SmokeSeriesCode;
  /** Path exactly as `ContextCreator.java:77, 213-214` spells it. */
  readonly csv: string;
  /** `true` for codes 1 and 2 — the two constructed counterfactuals. */
  readonly counterfactual: boolean;
  /** The transform **already baked into the CSV bytes**, not the run's `smokeScale`. */
  readonly embeddedScale: number;
  /** `hours()` — the dense hourly array length. */
  readonly slices: number;
  /**
   * `peakHourly()` at `smokeScale = 1.0`, as an **exact double**. Series 2's is
   * `2496.1000000000004`; writing `2496.1` here would make a correct asset fail.
   */
  readonly peakUgM3: number;
  /** The builder-sidecar figure gate (j.3) compares against (`984.75` / `2496.10`). */
  readonly builderPeakUgM3: number;
  /** `slices - 1` — gotcha 3. */
  readonly maxSimulationHours: number;
  /** Provenance sidecar; `null` for the observed series. */
  readonly sidecar: string | null;
}

/**
 * `smokeSeriesCode` -> everything the run needs to know about the series.
 *
 * Every number here was recomputed from the committed CSVs by the `SmokeField`
 * reducer (WP8-SPEC-severe-triage-pets.md §1.1, §8.4-A) and is re-proved on each
 * build by `pipeline/scripts/build-smoke-severe.ts`. None of it is derived from
 * any other row: multiplying row 0 by `embeddedScale` reproduces neither row 1
 * nor row 2 (note 1 above).
 */
export const SMOKE_SERIES: Readonly<Record<SmokeSeriesCode, SmokeSeriesSpec>> = {
  0: {
    code: 0,
    csv: "data/airnow/aqs_hourly_pm25_portland_2020-09.csv",
    counterfactual: false,
    embeddedScale: 1.0,
    slices: 576,
    peakUgM3: 562.7,
    builderPeakUgM3: 562.7,
    maxSimulationHours: 575,
    sidecar: null,
  },
  1: {
    code: 1,
    csv: "data/airnow/aqs_hourly_pm25_synthetic_severe_v1.csv",
    counterfactual: true,
    embeddedScale: 1.75,
    slices: 456,
    peakUgM3: 984.75,
    builderPeakUgM3: 984.75,
    maxSimulationHours: 455,
    sidecar: "data/airnow/aqs_hourly_pm25_synthetic_severe_v1.provenance.json",
  },
  2: {
    code: 2,
    csv: "data/airnow/aqs_hourly_pm25_synthetic_severe_v2.csv",
    counterfactual: true,
    embeddedScale: 4.436,
    slices: 456,
    // NOT 2496.1 — see note 2. This literal is the exact field peak.
    peakUgM3: 2496.1000000000004,
    builderPeakUgM3: 2496.1,
    maxSimulationHours: 455,
    sidecar: "data/airnow/aqs_hourly_pm25_synthetic_severe_v2.provenance.json",
  },
};

/** The two codes gate (j) applies to; code 0 makes gate (j) *skip*, not pass. */
export const SEVERE_SERIES_CODES: readonly SmokeSeriesCode[] = [1, 2];

/** Gate (j.3)'s slack, sized for the manifest's `%.1f` HALF_UP rendering. */
export const SEVERE_PEAK_GATE_SLACK = 0.06;

/** Thrown where `ContextCreator` throws `IllegalStateException` on a selector. */
export class SmokeSeriesError extends Error {
  override readonly name = "SmokeSeriesError";
}

/**
 * The port's added guard for gotcha 3. Distinct class so a caller can catch the
 * window overrun without swallowing a selector error, and so the UI can render
 * the required copy rather than a stack trace.
 */
export class RunWindowOverrunError extends Error {
  override readonly name = "RunWindowOverrunError";
  readonly simulationHours: number;
  readonly slices: number;
  readonly maxSimulationHours: number;

  constructor(message: string, detail: { simulationHours: number; slices: number }) {
    super(message);
    this.simulationHours = detail.simulationHours;
    this.slices = detail.slices;
    this.maxSimulationHours = detail.slices - 1;
  }
}

/** End-of-run gate (j.4): the run produced fabricated zero-concentration hours. */
export class FabricatedSmokeHoursError extends Error {
  override readonly name = "FabricatedSmokeHoursError";
  readonly outOfRangeLookups: number;

  constructor(message: string, outOfRangeLookups: number) {
    super(message);
    this.outOfRangeLookups = outOfRangeLookups;
  }
}

/**
 * The user-visible sentence plan §1.6 requires verbatim on an INVALID badge.
 * Exported so the app cannot paraphrase it into something softer.
 */
export const FABRICATED_HOURS_MESSAGE =
  "run window exceeded smoke data; results contain fabricated zero-concentration hours";

/**
 * `ContextCreator.java:326-330` — `smokeSeriesCode` outside `[0, 2]` throws
 * before any model object exists. Unlike `simulationHours`, this one really is
 * a Java fail-fast, so it is a port, not an addition.
 */
export function assertSmokeSeriesCode(code: number): SmokeSeriesCode {
  if (!Number.isInteger(code) || code < 0 || code > 2) {
    throw new SmokeSeriesError(
      `smokeSeriesCode=${code} is not a registered series (0=observed, ` +
        `1=severe v1, 2=worst-plausible v2)`,
    );
  }
  return code as SmokeSeriesCode;
}

export function smokeSeriesSpec(code: number): SmokeSeriesSpec {
  return SMOKE_SERIES[assertSmokeSeriesCode(code)];
}

/** `slices - 1`: the largest `simulationHours` a series of this length supports. */
export function maxSimulationHoursForSlices(slices: number): number {
  if (!Number.isInteger(slices) || slices < 1) {
    throw new RangeError(`a smoke series must have >= 1 integral slices, got ${slices}`);
  }
  return slices - 1;
}

/** `ContextCreator.java:806` — `Math.min(simulationHours, smokeField.hours())`. */
export function endHoursFor(simulationHours: number, slices: number): number {
  return Math.min(simulationHours, slices);
}

/**
 * The hour index the **inclusive final tick** reads.
 *
 * `endTick = endHours * (60 / minutesPerTick)` and
 * `hourIndex = floor(endTick * minutesPerTick / 60)`, which is `endHours` for
 * every `minutesPerTick` the schedule accepts. Computed the long way round
 * rather than asserted, because the composition is the thing that goes wrong.
 */
export function finalTickHourIndex(
  simulationHours: number,
  slices: number,
  minutesPerTick: number,
): number {
  const endHours = endHoursFor(simulationHours, slices);
  const endTick = endHours * (60.0 / minutesPerTick);
  return Math.floor((endTick * minutesPerTick) / 60.0);
}

export interface RunWindowInput {
  readonly simulationHours: number;
  /** `smokeField.hours()` for the series the run actually selected. */
  readonly slices: number;
  readonly minutesPerTick?: number;
  /** Only for the message; omit when the series is not one of the three. */
  readonly smokeSeriesCode?: number;
}

/**
 * **THE FAIL-FAST** (never-regress gotcha 3; WP8-SPEC-severe-triage-pets.md
 * §1.6, plan Q11 "engine fail-fast as the last line").
 *
 * A violation **throws**. It does not clamp, it does not warn, and it does not
 * return a boolean the caller may ignore — those are exactly the three shapes
 * that let the 456-hour matrix reach disk. The Java clamp
 * (`Math.min(simulationHours, hours())`) is *not* a guard: it clamps to
 * `hours()`, which is precisely the failing value, and the run then writes 13
 * archives' worth of results carrying `out_of_range_lookups > 0`
 * (`Geography/output/superseded-456h/`, retained as the primary evidence).
 *
 * **Declared divergence.** A Java run at 456 h produces a file, not an
 * exception. The port refuses because a browser has no `superseded-456h/`
 * directory to retain the mistake in.
 */
export function assertRunWindowFitsSeries(input: RunWindowInput): void {
  const { simulationHours, slices } = input;
  const minutesPerTick = input.minutesPerTick ?? 1.0;
  if (!Number.isInteger(slices) || slices < 1) {
    throw new RangeError(`a smoke series must have >= 1 integral slices, got ${slices}`);
  }
  const limit = maxSimulationHoursForSlices(slices);
  if (simulationHours <= limit) {
    return;
  }
  const hourIndex = finalTickHourIndex(simulationHours, slices, minutesPerTick);
  const endTick = endHoursFor(simulationHours, slices) * (60.0 / minutesPerTick);
  const series =
    input.smokeSeriesCode === undefined
      ? "the selected series"
      : `smokeSeriesCode=${input.smokeSeriesCode} (${
          SMOKE_SERIES[input.smokeSeriesCode as SmokeSeriesCode]?.csv ?? "unregistered"
        })`;
  throw new RunWindowOverrunError(
    `simulationHours=${simulationHours} exceeds the maximum ${limit} for ${series}: ` +
      `the series has ${slices} hourly slices, so valid hour indices are 0..${limit}. ` +
      `endAt() is inclusive, so the final tick ${endTick} reads hour index ${hourIndex}, ` +
      "which does not exist — every non-sheltered resident would book a FABRICATED " +
      `0.0 ug/m3 for that tick and out_of_range_lookups would end non-zero. ` +
      `Set simulationHours <= ${limit}. (Never-regress gotcha 3: simulationHours <= slices - 1. ` +
      "The certified Java clamps with Math.min and writes the file anyway; this " +
      "fail-fast is a declared port divergence — WP8-SPEC-severe-triage-pets.md §1.6.)",
    { simulationHours, slices },
  );
}

/**
 * Build the run's `SmokeField` from a packed asset, applying `smokeScale` once
 * and refusing a window the series cannot cover.
 *
 * This is the single constructor a run should use: it is where the fail-fast
 * becomes unavoidable rather than advisory. `smokeScale` multiplies the stored
 * array (real values only), so effective severity is
 * `embeddedScale x smokeScale` — the UI must show that product and never stack
 * the two (plan risk W14).
 */
export function smokeFieldForRun(
  asset: SmokeSeriesAsset,
  config: {
    readonly simulationHours: number;
    readonly smokeScale?: number;
    readonly minutesPerTick?: number;
    readonly smokeSeriesCode?: number;
  },
): SmokeField {
  if (config.smokeSeriesCode !== undefined) {
    const code = assertSmokeSeriesCode(config.smokeSeriesCode);
    if (asset.series !== code) {
      throw new SmokeSeriesError(
        `asset carries series ${asset.series} but the run selected smokeSeriesCode=${code} ` +
          `(${SMOKE_SERIES[code].csv}); the asset and the selector must agree or the ` +
          "manifest's input_datasets would name a file the run never read",
      );
    }
  }
  const field = SmokeField.fromAsset(asset, config.smokeScale ?? 1.0);
  assertRunWindowFitsSeries({
    simulationHours: config.simulationHours,
    slices: field.hours(),
    ...(config.minutesPerTick === undefined ? {} : { minutesPerTick: config.minutesPerTick }),
    ...(config.smokeSeriesCode === undefined ? {} : { smokeSeriesCode: config.smokeSeriesCode }),
  });
  return field;
}

/**
 * Gate (j.4), at end of run: `out_of_range_lookups == 0`.
 *
 * The counter is the ONLY signal that distinguishes a clean run from one that
 * silently averaged fabricated zeros into `exposure_ugm3h`, `vwe_ugm3h`,
 * `inhaled_dose_ug` and every `c > threshold` comparison for the affected ticks
 * (QUIRK 5). With the fail-fast above in place this can only fire if a gap sits
 * *inside* the window — the same branch, deliberately indistinguishable.
 */
export function assertNoFabricatedHours(
  field: Pick<SmokeField, "outOfRangeLookups">,
  context = "run",
): void {
  const n = field.outOfRangeLookups;
  if (n !== 0) {
    throw new FabricatedSmokeHoursError(
      `${context}: out_of_range_lookups=${n}, expected 0 — ${FABRICATED_HOURS_MESSAGE}. ` +
        "A NaN lookup returns 0.0 AND counts, so those ticks are already in the exposure " +
        "arithmetic; the run is INVALID, not merely suspect (gate (j.4)).",
      n,
    );
  }
}

/**
 * Gate (j.3): `|manifestPeak - builderPeak x smokeScale| <= 0.06`.
 *
 * The slack is not sloppiness — the manifest carries `%.1f` HALF_UP of the field
 * peak (`984.8`) while the gate compares against the builder sidecar's unrounded
 * value (`984.75`). Anything tighter fails a correct run (§7.3).
 */
export function severeSeriesPeakWithin(
  manifestPeak: number,
  builderPeak: number,
  smokeScale = 1.0,
): boolean {
  return Math.abs(manifestPeak - builderPeak * smokeScale) <= SEVERE_PEAK_GATE_SLACK;
}

/**
 * The number of `concentrationForTick` calls one tick makes, from the census
 * evaluated **at lookup time** (§1.4): the exposure block runs for every
 * resident not SHELTERED, and the departure block runs again for every UNAWARE
 * or PRE_EVAC resident. Exported because it is the identity that proves the
 * double lookup is real — `(n - sheltered) + (pre_evac + unaware)` reproduces
 * `out_of_range_lookups` to the unit in all 13 discarded 456-hour runs.
 */
export function lookupsPerTick(census: {
  readonly n: number;
  readonly sheltered: number;
  readonly preEvac: number;
  readonly unaware: number;
}): number {
  return census.n - census.sheltered + (census.preEvac + census.unaware);
}
