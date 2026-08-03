/**
 * The wire contract between the UI thread and a sim worker.
 *
 * Two channels, on purpose.
 *
 *  - **Control** is request/response and goes over Comlink: `init`, `run`,
 *    `pause`, `scrubTo`, `snapshot`, `exportOutputs`. Low rate, needs replies,
 *    benefits from `await`.
 *  - **Stream** is fire-and-forget and goes over a dedicated `MessagePort` the
 *    client hands the worker at subscribe time: frame batches, metric batches,
 *    wave progress, status. High rate, no replies, and every payload carries
 *    transferable buffers.
 *
 * Comlink *can* carry a transfer list, but every proxied callback is a
 * round-trip through its own `MessageChannel` with a wrapping/unwrapping pass on
 * both sides. A raw port for the stream keeps the hot path to one `postMessage`
 * per batch with the buffers detached rather than copied, and leaves the
 * ergonomic RPC where the ergonomics matter.
 *
 * Every message is a plain object with a `kind` discriminant, so a client can
 * switch on it without instanceof and a test can assert on the shape without
 * standing up a worker.
 */

import type { ClosureWaveReport } from "../closures/runtime.js";
import type { FrameBatch, MetricBatch } from "./frames.js";

/** Lifecycle of a hosted run. */
export type RunPhase = "idle" | "building" | "ready" | "running" | "paused" | "finished" | "error";

/** What the worker is doing, sampled at slice boundaries. */
export interface RunStatus {
  readonly kind: "status";
  readonly phase: RunPhase;
  readonly tick: number;
  readonly endTick: number;
  readonly hour: number;
  readonly endHours: number;
  /** Wall-clock ms spent inside the tick loop so far. */
  readonly runMs: number;
  /** Ticks per wall-clock second over the last slice; `NaN` before the first. */
  readonly ticksPerSecond: number;
  /** Snapshot ring occupancy, for the scrub UI. */
  readonly keyframeTicks: readonly number[];
  readonly message?: string;
}

/**
 * Closure-wave progress — the "recomputing routes…" the plan names.
 *
 * `start` is emitted **before** the tick that carries the wave is executed, so
 * the UI can show the notice while the 46 shortest-path trees are being rebuilt
 * rather than after. It is derived by peeking the parsed schedule, which is
 * immutable after build, so the prediction cannot disagree with what fires.
 */
export interface WaveProgressEvent {
  readonly kind: "wave";
  readonly phase: "start" | "done";
  /** 1-based wave number in schedule order. */
  readonly wave: number;
  readonly tick: number;
  readonly hour: number;
  /** Shelter trees that will be / were recomputed. */
  readonly shelterCount: number;
  /** Wall-clock ms the recompute took; only on `done`. */
  readonly elapsedMs?: number;
  /** The engine's own report; only on `done`. */
  readonly report?: ClosureWaveReport;
}

export interface FrameMessage {
  readonly kind: "frames";
  readonly batch: FrameBatch;
}

export interface MetricMessage {
  readonly kind: "metrics";
  readonly batch: MetricBatch;
}

/** Everything that can arrive on the stream port. */
export type StreamMessage = FrameMessage | MetricMessage | WaveProgressEvent | RunStatus;

/** Knobs the UI sets on a run; all optional, all with documented defaults. */
export interface RunOptions {
  /**
   * Ticks executed between yields to the worker's event loop. Default 240 (four
   * simulated hours at `minutesPerTick = 1`).
   *
   * This is what keeps the worker answering `pause` promptly; it has **no**
   * effect on results. `Simulation.runUntil` resumes from its own tick counter
   * and nothing in the model observes where a call boundary fell, which
   * `engine/test/worker/host.test.ts` asserts by digest rather than in prose.
   */
  readonly sliceTicks?: number;
  /** Emit a frame every N ticks. Default 60 (one per simulated hour). `0` disables frames. */
  readonly frameEveryTicks?: number;
  /** Frames per emitted batch. Default 8. */
  readonly frameBatchSize?: number;
  /** Metric rows per emitted batch. Default 24. */
  readonly metricBatchSize?: number;
  /** Take a snapshot every N ticks. Default 60. `0` disables snapshots (and scrub). */
  readonly snapshotEveryTicks?: number;
  /** Stop at this tick instead of the schedule's end. */
  readonly untilTick?: number;
}

export const RUN_OPTION_DEFAULTS = {
  sliceTicks: 240,
  frameEveryTicks: 60,
  frameBatchSize: 8,
  metricBatchSize: 24,
  snapshotEveryTicks: 60,
} as const;

/** Summary a client gets back from a completed or paused run. */
export interface RunSummary {
  readonly tick: number;
  readonly endTick: number;
  readonly phase: RunPhase;
  readonly runMs: number;
  readonly buildMs: number;
  readonly framesEmitted: number;
  readonly metricRowsEmitted: number;
  readonly snapshotsTaken: number;
  readonly wavesFired: number;
  /** `Simulation.armedResidents` — the witness that the decision layer ran. */
  readonly armedResidents: number;
  readonly outOfRangeLookups: number;
}
