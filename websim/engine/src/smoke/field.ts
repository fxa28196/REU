/**
 * `SmokeField` — the county-uniform hourly PM2.5 field (PORT_MAP §1.7,
 * `geography/env/SmokeField.java`).
 *
 * The CSV parse itself is an asset-build step (`pipeline/scripts/build-smoke.ts`
 * emits `smoke-{0,1,2}.json`: one dense hourly array, `null` where the certified
 * builder would have left `Double.NaN`). What is ported here is everything the
 * *run* depends on, and every one of these is load-bearing:
 *
 *  1. **`scaleFactor` is applied once, at construction, to real values only.**
 *     A gap stays a gap — a scaled NaN must never become a fabricated zero.
 *  2. **A NaN lookup returns `0.0` AND increments `outOfRangeLookups`.** Both
 *     halves matter: the zero enters exposure arithmetic, and the counter is a
 *     validation gate (verify_E_runs (j): `out_of_range_lookups == 0`).
 *  3. **Gap and out-of-window are the same branch.** `concentrationAtHour`
 *     returns NaN for both, so the counter cannot distinguish them and the
 *     archived semantics must not either.
 *  4. **`hourIndex = (int) floor(tick * minutesPerTick / 60.0)`** — the `(int)`
 *     is a truncating cast, but `floor` has already run, so the two agree for
 *     the non-negative ticks the schedule produces.
 *  5. **`peakHourly()` initialises its maximum at 0**, not −∞: an all-NaN field
 *     reports 0.0, not −Infinity.
 *
 * The agent step calls {@link concentrationForTick} **twice** on a tick where a
 * resident is still PRE_EVAC (PORT_MAP §1.5 steps 5 and 6). That double lookup
 * is reproduced by `agents/step.ts`, which is why the counter can exceed the
 * tick count. See `ENGINE_SEMANTICS_QUIRKS.double-concentration-lookup`.
 */

/** The V13 anchor label carried into `simulation.json`. */
export const SMOKE_COUNTY = "Multnomah" as const;

export interface SmokeSeriesAsset {
  readonly schema: string;
  readonly series: number;
  readonly slices: number;
  /** Hourly µg/m³; `null` is the certified `Double.NaN` gap. */
  readonly hourly: readonly (number | null)[];
  readonly embedded_scale?: number;
  readonly anchor?: string;
  readonly counterfactual_label?: string | null;
}

export class SmokeField {
  /** Hour 0 = `SIM_START`. `NaN` marks a gap, exactly as in Java. */
  readonly hourlyUgM3: Float64Array;
  readonly county: string;
  /** The V47 multiplier this field was constructed with. */
  readonly scaleFactor: number;

  private oorLookups = 0;

  /**
   * @param hourly       dense hourly means; `null`/`NaN` entries stay NaN
   * @param scaleFactor  V47 `smokeScale`, applied here once to real values only
   */
  constructor(hourly: readonly (number | null)[], scaleFactor = 1, county: string = SMOKE_COUNTY) {
    this.county = county;
    this.scaleFactor = scaleFactor;
    const a = new Float64Array(hourly.length);
    for (let h = 0; h < hourly.length; h++) {
      const v = hourly[h];
      // Java: `(sc == null || sc[1] == 0) ? NaN : (sum/count) * scaleFactor`.
      a[h] = v === null || v === undefined || Number.isNaN(v) ? Number.NaN : v * scaleFactor;
    }
    this.hourlyUgM3 = a;
  }

  static fromAsset(asset: SmokeSeriesAsset, scaleFactor = 1, county: string = SMOKE_COUNTY): SmokeField {
    if (asset.hourly.length !== asset.slices) {
      throw new Error(
        `smoke asset declares ${asset.slices} slices but carries ${asset.hourly.length} values`,
      );
    }
    return new SmokeField(asset.hourly, scaleFactor, county);
  }

  /** `hours()` — the number of hourly slices, i.e. `hourlyUgM3.length`. */
  hours(): number {
    return this.hourlyUgM3.length;
  }

  /** NaN when the hour is a gap **or** outside the window — one branch, as in Java. */
  concentrationAtHour(hourIndex: number): number {
    if (hourIndex < 0 || hourIndex >= this.hourlyUgM3.length) {
      return Number.NaN;
    }
    return this.hourlyUgM3[hourIndex]!;
  }

  /**
   * Concentration for the hour containing `tick`. A NaN result is reported as
   * `0.0` **and counted** — never fabricated silently.
   */
  concentrationForTick(tick: number, minutesPerTick: number): number {
    const hourIndex = Math.floor((tick * minutesPerTick) / 60);
    const c = this.concentrationAtHour(hourIndex);
    if (Number.isNaN(c)) {
      this.oorLookups++;
      return 0;
    }
    return c;
  }

  /** Max over non-NaN hours; **initialised at 0**, so an all-gap field reports 0. */
  peakHourly(): number {
    let mx = 0;
    for (let h = 0; h < this.hourlyUgM3.length; h++) {
      const v = this.hourlyUgM3[h]!;
      if (!Number.isNaN(v) && v > mx) {
        mx = v;
      }
    }
    return mx;
  }

  get outOfRangeLookups(): number {
    return this.oorLookups;
  }

  /** Snapshot/restore support (plan §3.5): the counter is run state. */
  setOutOfRangeLookups(n: number): void {
    this.oorLookups = n;
  }
}
