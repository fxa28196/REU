/**
 * stream.test.ts — the pure stream reducers (WP11).
 *
 * Everything runs in Node: the functions under test are pure over the
 * transferable batch shapes, so no worker, DOM, or store is needed.
 */

import { describe, expect, it } from "vitest";

import type { FrameBatch, MetricBatch } from "@websim/engine/worker";

import { appendMetrics, emptyMetricSeries, latestFrameOf } from "../src/state/stream.js";
import type { MetricSeries } from "../src/state/stream.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** 2 frames x 3 residents x 2 shelters, values chosen to be tellable apart. */
function twoFrameBatch(): FrameBatch {
  return {
    frameCount: 2,
    residentCount: 3,
    shelterCount: 2,
    ticks: Int32Array.from([60, 120]),
    positions: Float32Array.from([
      // frame 0
      -122.5, 45.5, -122.6, 45.6, -122.7, 45.7,
      // frame 1
      -122.51, 45.51, -122.61, 45.61, -122.71, 45.71,
    ]),
    states: Uint8Array.from([0, 1, 2, 3, 4, 5]),
    occupancy: Int32Array.from([5, 7, 9, 11]),
    smokeUgM3: Float64Array.from([12.5, 55.5]),
  };
}

/** rows x 3 states, planted so the transpose is unmistakable. */
function metricBatch(
  hours: number[],
  censusByRow: number[][],
  smoke: number[],
  exposure: number[],
): MetricBatch {
  const rows = hours.length;
  return {
    rowCount: rows,
    hours: Int32Array.from(hours),
    stateCensus: Int32Array.from(censusByRow.flat()),
    occupied: new Int32Array(rows),
    refusals: new Int32Array(rows),
    meanExposureUgM3h: Float64Array.from(exposure),
    meanInhaledDoseUg: new Float64Array(rows),
    smokeUgM3: Float64Array.from(smoke),
  };
}

// ---------------------------------------------------------------------------
// latestFrameOf
// ---------------------------------------------------------------------------

describe("latestFrameOf", () => {
  it("returns the LAST frame of the batch", () => {
    const batch = twoFrameBatch();
    const snap = latestFrameOf(batch);
    expect(snap.tick).toBe(120);
    expect(snap.smokeUgM3).toBe(55.5);
    expect(snap.residentCount).toBe(3);
    expect(Array.from(snap.positions)).toEqual(
      Array.from(Float32Array.from([-122.51, 45.51, -122.61, 45.61, -122.71, 45.71])),
    );
    expect(Array.from(snap.states)).toEqual([3, 4, 5]);
    expect(Array.from(snap.occupancy)).toEqual([9, 11]);
  });

  it("is zero-copy: the snapshot views alias the batch's own buffers", () => {
    const batch = twoFrameBatch();
    const snap = latestFrameOf(batch);
    // Same underlying ArrayBuffer, offset to the last frame — no copy was made.
    expect(snap.positions.buffer).toBe(batch.positions.buffer);
    expect(snap.positions.byteOffset).toBe(6 * Float32Array.BYTES_PER_ELEMENT);
    expect(snap.states.buffer).toBe(batch.states.buffer);
    expect(snap.states.byteOffset).toBe(3);
    expect(snap.occupancy.buffer).toBe(batch.occupancy.buffer);
    expect(snap.occupancy.byteOffset).toBe(2 * Int32Array.BYTES_PER_ELEMENT);
  });

  it("passes a NaN smoke gap through — never a fabricated 0", () => {
    const batch: FrameBatch = {
      ...twoFrameBatch(),
      smokeUgM3: Float64Array.from([12.5, Number.NaN]),
    };
    expect(Number.isNaN(latestFrameOf(batch).smokeUgM3)).toBe(true);
  });

  it("throws on an empty batch (the worker never flushes one)", () => {
    const batch: FrameBatch = {
      frameCount: 0,
      residentCount: 3,
      shelterCount: 2,
      ticks: new Int32Array(0),
      positions: new Float32Array(0),
      states: new Uint8Array(0),
      occupancy: new Int32Array(0),
      smokeUgM3: new Float64Array(0),
    };
    expect(() => latestFrameOf(batch)).toThrow(RangeError);
  });

  it("throws when buffer lengths do not match the declared geometry", () => {
    const batch: FrameBatch = { ...twoFrameBatch(), states: Uint8Array.from([0, 1, 2]) };
    expect(() => latestFrameOf(batch)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// appendMetrics
// ---------------------------------------------------------------------------

describe("appendMetrics", () => {
  it("transposes the batch census into [stateIndex][hourIndex]", () => {
    const series = appendMetrics(
      emptyMetricSeries(),
      metricBatch(
        [0, 1],
        [
          [4, 1, 0],
          [3, 2, 0],
        ],
        [10.0, 20.5],
        [0.5, 1.25],
      ),
    );
    expect(series.hours).toEqual([0, 1]);
    expect(series.smokeUgM3).toEqual([10.0, 20.5]);
    expect(series.meanExposureUgM3h).toEqual([0.5, 1.25]);
    expect(series.stateCensus).toEqual([
      [4, 3],
      [1, 2],
      [0, 0],
    ]);
  });

  it("appends a second batch onto every series", () => {
    const first = appendMetrics(
      emptyMetricSeries(),
      metricBatch(
        [0, 1],
        [
          [4, 1, 0],
          [3, 2, 0],
        ],
        [10.0, 20.5],
        [0.5, 1.25],
      ),
    );
    const second = appendMetrics(first, metricBatch([2], [[2, 2, 1]], [30.0], [2.0]));
    expect(second.hours).toEqual([0, 1, 2]);
    expect(second.smokeUgM3).toEqual([10.0, 20.5, 30.0]);
    expect(second.meanExposureUgM3h).toEqual([0.5, 1.25, 2.0]);
    expect(second.stateCensus).toEqual([
      [4, 3, 2],
      [1, 2, 2],
      [0, 0, 1],
    ]);
  });

  it("never mutates the input series (immutable append)", () => {
    const first = appendMetrics(
      emptyMetricSeries(),
      metricBatch([0], [[4, 1, 0]], [10.0], [0.5]),
    );
    const hoursBefore = first.hours.slice();
    const censusBefore = first.stateCensus.map((row) => row.slice());
    appendMetrics(first, metricBatch([1], [[3, 2, 0]], [20.5], [1.25]));
    expect(first.hours).toEqual(hoursBefore);
    expect(first.stateCensus).toEqual(censusBefore);
  });

  it("returns the series unchanged for an empty batch", () => {
    const series: MetricSeries = appendMetrics(
      emptyMetricSeries(),
      metricBatch([0], [[4, 1, 0]], [10.0], [0.5]),
    );
    expect(appendMetrics(series, metricBatch([], [], [], []))).toBe(series);
  });

  it("passes NaN smoke gaps through untouched", () => {
    const series = appendMetrics(
      emptyMetricSeries(),
      metricBatch([0], [[4, 1, 0]], [Number.NaN], [0.5]),
    );
    expect(Number.isNaN(series.smokeUgM3[0])).toBe(true);
  });

  it("throws when stateCensus is not a whole number of rows", () => {
    const bad = metricBatch([0, 1], [[4, 1, 0]], [10.0, 20.5], [0.5, 1.25]);
    // 3 census values over 2 rows -> 1.5 states per row.
    expect(() => appendMetrics(emptyMetricSeries(), bad)).toThrow(RangeError);
  });

  it("throws when the state count changes mid-run", () => {
    const first = appendMetrics(
      emptyMetricSeries(),
      metricBatch([0], [[4, 1, 0]], [10.0], [0.5]),
    );
    const twoStates = metricBatch([1], [[3, 2]], [20.5], [1.25]);
    expect(() => appendMetrics(first, twoStates)).toThrow(RangeError);
  });

  it("throws when batch array lengths disagree with rowCount", () => {
    const bad: MetricBatch = {
      ...metricBatch([0, 1], [[4, 1, 0], [3, 2, 0]], [10.0, 20.5], [0.5, 1.25]),
      hours: Int32Array.from([0]),
    };
    expect(() => appendMetrics(emptyMetricSeries(), bad)).toThrow(RangeError);
  });
});
