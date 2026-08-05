/**
 * stream.ts — pure reducers over the sim worker's stream payloads (WP11).
 *
 * Everything here is a pure function over the transferable batch shapes in
 * `@websim/engine/worker/frames` — no store, no DOM, no timers — so the whole
 * surface is unit-testable in Node (`app/test/stream.test.ts`).
 *
 * ## Buffer ownership (read before touching `latestFrameOf`)
 *
 * Frame and metric batches arrive on the stream port with their `ArrayBuffer`s
 * **TRANSFERRED**: the worker's views are detached the moment the message is
 * posted, so the receiving side — ultimately the app store — is the sole owner
 * of every byte (`frames.ts` module doc: "exactly one owner of every byte at
 * every moment"). Two consequences are load-bearing:
 *
 *  1. `latestFrameOf` returns **zero-copy `subarray` views** over the batch's
 *     buffers. That is safe precisely because of the ownership rule: the worker
 *     re-arms its encoder with *fresh* buffers after every flush
 *     (`FrameEncoder.flush`), so nothing will ever write into the buffer a
 *     snapshot aliases. The snapshot keeps the whole batch buffer alive; at
 *     display cadence that is the intended cost (one batch), not a leak.
 *  2. A batch must be treated as consumed once it has been reduced. Callers
 *     must not post it anywhere else — its buffers would detach under the
 *     snapshot that aliases them.
 *
 * ## Honesty
 *
 * `NaN` smoke values pass through untouched. A `NaN` is the encoder's marker
 * for an out-of-range hour ("never a fabricated 0" — `frames.ts`), and turning
 * it into a number here would forge data the model never produced. Charts
 * render the gap.
 */

import type { FrameBatch, MetricBatch } from "@websim/engine/worker";

/** The single most recent display frame, as zero-copy views (see module doc). */
export interface FrameSnapshot {
  readonly tick: number;
  /** Concentration at this frame's hour; `NaN` for a gap — never a fabricated 0. */
  readonly smokeUgM3: number;
  readonly residentCount: number;
  /** `[resident] -> (lon, lat)` — view into the owning batch's buffer. */
  readonly positions: Float32Array;
  /** `[resident] -> STATES index` — view into the owning batch's buffer. */
  readonly states: Uint8Array;
  /** `[shelter] -> occupancy` — view into the owning batch's buffer. */
  readonly occupancy: Int32Array;
}

/**
 * Accumulated per-hour chart series, shaped for uPlot (one plain array per
 * line). `stateCensus` is TRANSPOSED relative to `MetricBatch.stateCensus`:
 * `stateCensus[stateIndex][hourIndex]`, one row per agent state in `STATES`
 * order, because a chart draws one line per state across all hours.
 */
export interface MetricSeries {
  readonly hours: number[];
  readonly smokeUgM3: number[];
  /** `[stateIndex][hourIndex]` census — transposed from the batch layout. */
  readonly stateCensus: number[][];
  readonly meanExposureUgM3h: number[];
}

/** A fresh, empty series — the store's initial and post-reset metrics value. */
export function emptyMetricSeries(): MetricSeries {
  return { hours: [], smokeUgM3: [], stateCensus: [], meanExposureUgM3h: [] };
}

/**
 * The last frame of a batch, as zero-copy `subarray` views.
 *
 * The worker only ever flushes non-empty batches (`FrameEncoder.flush` returns
 * `null` at zero pending), so an empty batch here is a caller bug and throws
 * rather than yielding a snapshot full of `undefined`.
 */
export function latestFrameOf(batch: FrameBatch): FrameSnapshot {
  const f = batch.frameCount - 1;
  if (f < 0) {
    throw new RangeError("latestFrameOf: batch has no frames");
  }
  const n = batch.residentCount;
  const m = batch.shelterCount;
  if (
    batch.ticks.length !== batch.frameCount ||
    batch.smokeUgM3.length !== batch.frameCount ||
    batch.positions.length !== batch.frameCount * n * 2 ||
    batch.states.length !== batch.frameCount * n ||
    batch.occupancy.length !== batch.frameCount * m
  ) {
    throw new RangeError(
      `latestFrameOf: batch buffer lengths do not match frameCount ${batch.frameCount} ` +
        `x residentCount ${n} / shelterCount ${m}`,
    );
  }
  return {
    tick: batch.ticks[f]!,
    smokeUgM3: batch.smokeUgM3[f]!,
    residentCount: n,
    positions: batch.positions.subarray(f * n * 2, (f + 1) * n * 2),
    states: batch.states.subarray(f * n, (f + 1) * n),
    occupancy: batch.occupancy.subarray(f * m, (f + 1) * m),
  };
}

/**
 * Immutable append: a NEW series whose arrays are copies of `series`'s with the
 * batch's rows appended (and the census transposed into per-state rows).
 * Neither input is mutated; an empty batch returns `series` unchanged.
 *
 * The state count is derived from the batch itself (`stateCensus.length /
 * rowCount`) rather than imported from the engine, so this module stays a pure
 * function of its inputs; a mid-run change of state count is impossible in the
 * protocol and therefore throws.
 */
export function appendMetrics(series: MetricSeries, batch: MetricBatch): MetricSeries {
  const rows = batch.rowCount;
  if (!Number.isInteger(rows) || rows < 0) {
    throw new RangeError(`appendMetrics: rowCount must be a non-negative integer, got ${rows}`);
  }
  if (rows === 0) {
    return series;
  }
  if (
    batch.hours.length !== rows ||
    batch.smokeUgM3.length !== rows ||
    batch.meanExposureUgM3h.length !== rows
  ) {
    throw new RangeError(`appendMetrics: batch array lengths do not match rowCount ${rows}`);
  }
  const stateCount = batch.stateCensus.length / rows;
  if (!Number.isInteger(stateCount)) {
    throw new RangeError(
      `appendMetrics: stateCensus length ${batch.stateCensus.length} is not a multiple of rowCount ${rows}`,
    );
  }
  const priorStates = series.stateCensus.length;
  if (priorStates !== 0 && priorStates !== stateCount) {
    throw new RangeError(
      `appendMetrics: state count changed mid-run (series has ${priorStates}, batch has ${stateCount})`,
    );
  }
  const hours = series.hours.slice();
  const smokeUgM3 = series.smokeUgM3.slice();
  const meanExposureUgM3h = series.meanExposureUgM3h.slice();
  const stateCensus: number[][] = [];
  for (let s = 0; s < stateCount; s++) {
    stateCensus.push(priorStates === 0 ? [] : series.stateCensus[s]!.slice());
  }
  for (let r = 0; r < rows; r++) {
    hours.push(batch.hours[r]!);
    smokeUgM3.push(batch.smokeUgM3[r]!);
    meanExposureUgM3h.push(batch.meanExposureUgM3h[r]!);
    const base = r * stateCount;
    for (let s = 0; s < stateCount; s++) {
      stateCensus[s]!.push(batch.stateCensus[base + s]!);
    }
  }
  return { hours, smokeUgM3, stateCensus, meanExposureUgM3h };
}
