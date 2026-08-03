/**
 * Frame and metric streams as **transferable** buffers (plan §3.4).
 *
 * The UI thread renders; it never computes model numbers and it never copies a
 * large buffer. Both are achieved the same way: the worker fills typed arrays it
 * owns, hands the underlying `ArrayBuffer`s to `postMessage`'s transfer list, and
 * allocates fresh ones for the next batch. Transfer is O(1) and detaches the
 * sender's view, so there is exactly one owner of every byte at every moment.
 *
 * ## The one thing an encoder must never do
 *
 * Reading the model to build a frame must not *change* the model. There is a
 * loaded gun here: `SmokeField.concentrationForTick` increments
 * `outOfRangeLookups` on a NaN lookup, and that counter is a **model output** —
 * gate (i) asserts `out_of_range_lookups == 0` and never-regress gotcha 3 is
 * detected through it. An encoder that called it once per rendered frame would
 * inflate the counter by the frame count, turning a rendering decision into a
 * validation failure (or, worse, masking a real one). So frames read
 * {@link SmokeField.concentrationAtHour}, which is the same lookup with no
 * counter, and report a gap as `NaN` rather than as the model's fabricated `0`.
 *
 * `engine/test/worker/frames.test.ts` gates that by digesting the whole
 * simulation before and after encoding a batch, and separately by encoding
 * frames over a run window whose final hour is off the end of the smoke series —
 * the case where the counter would move.
 *
 * Positions come from `materialisePosition`, the on-demand display coordinate
 * (DR-S3 action A1). That is a pure read, and it is why the tick loop can skip
 * the geodesic `Direct` entirely: the coordinate is computed at render cadence
 * here, not 60 times per simulated hour in the model.
 */

import { materialisePosition } from "../agents/step.js";
import { STATES } from "../agents/stateMachine.js";
import type { Simulation } from "../sim.js";
import type { SmokeField } from "../smoke/field.js";

/** State-name → code, matching `STATES` order (also the snapshot's encoding). */
const STATE_CODE = new Map<string, number>(STATES.map((s, i) => [s, i]));

/** One batch of rendered frames. Every typed array owns its own buffer. */
export interface FrameBatch {
  readonly frameCount: number;
  readonly residentCount: number;
  readonly shelterCount: number;
  /** Tick of each frame. */
  readonly ticks: Int32Array;
  /** `[frame][resident] -> (lon, lat)`, Float32 — display precision, ~1 cm. */
  readonly positions: Float32Array;
  /** `[frame][resident] -> STATES index`. */
  readonly states: Uint8Array;
  /** `[frame][shelter] -> occupancy`. */
  readonly occupancy: Int32Array;
  /** Concentration at each frame's hour; `NaN` for a gap — never a fabricated 0. */
  readonly smokeUgM3: Float64Array;
}

/** The buffers to hand to `postMessage`'s transfer list. */
export function frameBatchTransferables(b: FrameBatch): ArrayBuffer[] {
  return [
    b.ticks.buffer as ArrayBuffer,
    b.positions.buffer as ArrayBuffer,
    b.states.buffer as ArrayBuffer,
    b.occupancy.buffer as ArrayBuffer,
    b.smokeUgM3.buffer as ArrayBuffer,
  ];
}

/**
 * Per-simulated-hour aggregate metrics, one row per hour.
 *
 * Deliberately a *separate* stream from the frames: the UI decimates frames hard
 * (30 fps of a 312-hour run is not 18,720 frames of anything useful) but charts
 * need every hour. Both are transferable; neither is derivable from the other.
 */
export interface MetricBatch {
  readonly rowCount: number;
  /** Simulated hour of each row. */
  readonly hours: Int32Array;
  /** `[row][state]` census over `STATES`. */
  readonly stateCensus: Int32Array;
  /** `[row]` total shelter occupancy. */
  readonly occupied: Int32Array;
  /** `[row]` total refusals across all shelters. */
  readonly refusals: Int32Array;
  /** `[row]` mean cumulative exposure (µg/m³·h) over all residents. */
  readonly meanExposureUgM3h: Float64Array;
  /** `[row]` mean cumulative inhaled dose (µg) over all residents. */
  readonly meanInhaledDoseUg: Float64Array;
  /** `[row]` concentration at that hour; `NaN` for a gap. */
  readonly smokeUgM3: Float64Array;
}

export function metricBatchTransferables(b: MetricBatch): ArrayBuffer[] {
  return [
    b.hours.buffer as ArrayBuffer,
    b.stateCensus.buffer as ArrayBuffer,
    b.occupied.buffer as ArrayBuffer,
    b.refusals.buffer as ArrayBuffer,
    b.meanExposureUgM3h.buffer as ArrayBuffer,
    b.meanInhaledDoseUg.buffer as ArrayBuffer,
    b.smokeUgM3.buffer as ArrayBuffer,
  ];
}

/**
 * Concentration for a tick, WITHOUT touching the out-of-range counter.
 *
 * See the module doc: this is the difference between a render path and a model
 * path, and it is the reason `concentrationForTick` is not called here.
 */
export function displayConcentration(smoke: SmokeField, tick: number, minutesPerTick: number): number {
  return smoke.concentrationAtHour(Math.floor((tick * minutesPerTick) / 60));
}

/**
 * Accumulates frames into fixed-capacity buffers and emits a {@link FrameBatch}
 * when full.
 *
 * Fixed capacity rather than growth: the allocation is then one predictable
 * cost per batch instead of a doubling copy at an unpredictable moment, and the
 * emitted buffers are exactly the size the UI receives.
 */
export class FrameEncoder {
  readonly capacity: number;
  private readonly n: number;
  private readonly m: number;
  private ticks: Int32Array;
  private positions: Float32Array;
  private states: Uint8Array;
  private occupancy: Int32Array;
  private smoke: Float64Array;
  private filled = 0;

  constructor(residentCount: number, shelterCount: number, capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`frame batch capacity must be a positive integer, got ${capacity}`);
    }
    this.n = residentCount;
    this.m = shelterCount;
    this.capacity = capacity;
    this.ticks = new Int32Array(capacity);
    this.positions = new Float32Array(capacity * residentCount * 2);
    this.states = new Uint8Array(capacity * residentCount);
    this.occupancy = new Int32Array(capacity * shelterCount);
    this.smoke = new Float64Array(capacity);
  }

  get pending(): number {
    return this.filled;
  }

  get full(): boolean {
    return this.filled >= this.capacity;
  }

  /** Read one frame out of the live simulation. Does not mutate the model. */
  capture(sim: Simulation, smoke: SmokeField): void {
    if (this.filled >= this.capacity) {
      throw new RangeError("frame encoder is full; flush before capturing again");
    }
    const f = this.filled;
    this.ticks[f] = sim.tick;
    this.smoke[f] = displayConcentration(smoke, sim.tick, sim.minutesPerTick);
    const pBase = f * this.n * 2;
    const sBase = f * this.n;
    for (let i = 0; i < this.n; i++) {
      const r = sim.residents[i]!;
      const pos = materialisePosition(r);
      this.positions[pBase + 2 * i] = pos.lon;
      this.positions[pBase + 2 * i + 1] = pos.lat;
      this.states[sBase + i] = STATE_CODE.get(r.state) ?? 255;
    }
    const oBase = f * this.m;
    for (let j = 0; j < this.m; j++) {
      this.occupancy[oBase + j] = sim.shelters[j]!.occupancy;
    }
    this.filled++;
  }

  /**
   * Emit everything captured so far and re-arm with fresh buffers.
   *
   * Returns `null` when nothing is pending, so a caller can flush
   * unconditionally at the end of a run without emitting an empty batch.
   */
  flush(): FrameBatch | null {
    if (this.filled === 0) {
      return null;
    }
    const f = this.filled;
    const batch: FrameBatch = {
      frameCount: f,
      residentCount: this.n,
      shelterCount: this.m,
      // `subarray` would alias the buffer we are about to keep filling, and a
      // transferred alias detaches the whole thing. `slice` copies exactly the
      // used prefix; at capacity it is the entire buffer either way.
      ticks: this.ticks.slice(0, f),
      positions: this.positions.slice(0, f * this.n * 2),
      states: this.states.slice(0, f * this.n),
      occupancy: this.occupancy.slice(0, f * this.m),
      smokeUgM3: this.smoke.slice(0, f),
    };
    this.ticks = new Int32Array(this.capacity);
    this.positions = new Float32Array(this.capacity * this.n * 2);
    this.states = new Uint8Array(this.capacity * this.n);
    this.occupancy = new Int32Array(this.capacity * this.m);
    this.smoke = new Float64Array(this.capacity);
    this.filled = 0;
    return batch;
  }
}

/** Accumulates one metric row per simulated hour. */
export class MetricEncoder {
  readonly capacity: number;
  private hours: Int32Array;
  private census: Int32Array;
  private occupied: Int32Array;
  private refusals: Int32Array;
  private exposure: Float64Array;
  private dose: Float64Array;
  private smoke: Float64Array;
  private filled = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`metric batch capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
    this.hours = new Int32Array(capacity);
    this.census = new Int32Array(capacity * STATES.length);
    this.occupied = new Int32Array(capacity);
    this.refusals = new Int32Array(capacity);
    this.exposure = new Float64Array(capacity);
    this.dose = new Float64Array(capacity);
    this.smoke = new Float64Array(capacity);
  }

  get pending(): number {
    return this.filled;
  }

  get full(): boolean {
    return this.filled >= this.capacity;
  }

  capture(sim: Simulation, smoke: SmokeField, hour: number): void {
    if (this.filled >= this.capacity) {
      throw new RangeError("metric encoder is full; flush before capturing again");
    }
    const row = this.filled;
    this.hours[row] = hour;
    this.smoke[row] = displayConcentration(smoke, sim.tick, sim.minutesPerTick);
    const cBase = row * STATES.length;
    let sumExposure = 0;
    let sumDose = 0;
    for (const r of sim.residents) {
      const code = STATE_CODE.get(r.state);
      if (code !== undefined) {
        this.census[cBase + code] = this.census[cBase + code]! + 1;
      }
      sumExposure += r.exposureUgM3h;
      sumDose += r.inhaledDoseUg;
    }
    const n = sim.residents.length;
    this.exposure[row] = n === 0 ? Number.NaN : sumExposure / n;
    this.dose[row] = n === 0 ? Number.NaN : sumDose / n;
    let occ = 0;
    let ref = 0;
    for (const s of sim.shelters) {
      occ += s.occupancy;
      ref += s.refusedCount;
    }
    this.occupied[row] = occ;
    this.refusals[row] = ref;
    this.filled++;
  }

  flush(): MetricBatch | null {
    if (this.filled === 0) {
      return null;
    }
    const rows = this.filled;
    const batch: MetricBatch = {
      rowCount: rows,
      hours: this.hours.slice(0, rows),
      stateCensus: this.census.slice(0, rows * STATES.length),
      occupied: this.occupied.slice(0, rows),
      refusals: this.refusals.slice(0, rows),
      meanExposureUgM3h: this.exposure.slice(0, rows),
      meanInhaledDoseUg: this.dose.slice(0, rows),
      smokeUgM3: this.smoke.slice(0, rows),
    };
    this.hours = new Int32Array(this.capacity);
    this.census = new Int32Array(this.capacity * STATES.length);
    this.occupied = new Int32Array(this.capacity);
    this.refusals = new Int32Array(this.capacity);
    this.exposure = new Float64Array(this.capacity);
    this.dose = new Float64Array(this.capacity);
    this.smoke = new Float64Array(this.capacity);
    this.filled = 0;
    return batch;
  }
}
