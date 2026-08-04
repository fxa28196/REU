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
  /**
   * **Display-only** ceiling on how often a frame is *captured*, in frames per
   * wall-clock second. Default `0` — no ceiling, which is the behaviour every
   * released configuration has today.
   *
   * ## What it is for
   *
   * At max speed the worker outruns the display by one to two orders of
   * magnitude. Measured at 6,842 residents / 455 h with `frameEveryTicks: 1`
   * (DR-WP10-uithread-perf §5.1): the page is sent **12.1–15.6 frame messages
   * for every animation frame it can paint** on this box (Chromium 907 msg/s vs
   * 60 Hz, Firefox 460–512 vs 32.8–36.3, WebKit 483 vs 39.9), and **91.7–93.6 %
   * of the 1.68 GB streamed can never be rendered**. At 800 residents the worker
   * is ~9x faster still and the ratio reaches 31.6 (WebKit) to 135.8 (Chromium).
   * On WebKit — whose `MessagePort` dispatch costs 264–535 µs per message
   * against 3.1–5.0 µs on the other two, so it is *message*-bound rather than
   * byte-bound — that surplus is the difference between a 3.6 s tick loop and a
   * 21.6 s wall clock.
   *
   * ## What it does and does not change
   *
   * It suppresses the **capture** of a display frame, never a tick. The
   * simulation still executes every tick, in the same order, through the same
   * `runUntil` boundaries: `SimHost.nextStopTick` is driven by
   * {@link frameEveryTicks} alone and is not consulted here, so the sequence of
   * calls into the model is bit-for-bit the sequence an uncapped run makes.
   * `engine/test/worker/host.test.ts` gates that by digest.
   *
   * A frame is a **pure read** of the model (`FrameEncoder.capture` →
   * `materialisePosition`, `SmokeField.concentrationAtHour`), so not taking one
   * cannot perturb anything. Nothing derived from frames reaches an export, an
   * output CSV, a digest or a census — `SimHost.exportOutputs` reads the
   * residents and shelters directly.
   *
   * ## Why the default is `0` and not 60
   *
   * DR-WP10-uithread-perf §8.3 recommends defaulting this to 60. It cannot be,
   * as things stand, and the reason is a gate rather than a preference. A
   * wall-clock ceiling makes {@link RunSummary.framesEmitted} and the number of
   * frame batches on the stream **functions of how fast the machine ran**, and
   * `engine/test-browser/worker/compare.worker.test.ts` — the only test of WP10
   * acceptance clause 3, "Compare runs two synced workers" — asserts that two
   * independently scheduled workers agree on both of those exactly, at six
   * stops. They would not, and could not, under a ceiling. Defaulting it on and
   * exempting Compare would leave the shipped default gated by nothing at all.
   *
   * So it ships opt-in: free-running playback (the Run screen at max speed) sets
   * it; anything that steps to a tick and compares — Compare, the gates, the
   * validation harness — leaves it off and keeps frame emission a deterministic
   * function of the tick sequence. {@link RunSummary.framesSuppressed} reports
   * what it cost so a caller is never guessing.
   */
  readonly maxFramesPerSecond?: number;
  /** Stop at this tick instead of the schedule's end. */
  readonly untilTick?: number;
}

export const RUN_OPTION_DEFAULTS = {
  sliceTicks: 240,
  frameEveryTicks: 60,
  frameBatchSize: 8,
  metricBatchSize: 24,
  snapshotEveryTicks: 60,
  maxFramesPerSecond: 0,
} as const;

/** Summary a client gets back from a completed or paused run. */
export interface RunSummary {
  readonly tick: number;
  readonly endTick: number;
  readonly phase: RunPhase;
  readonly runMs: number;
  readonly buildMs: number;
  /**
   * Display frames captured. With {@link RunOptions.maxFramesPerSecond} at its
   * `0` default this is a pure function of the tick sequence and the frame
   * cadence; under a ceiling it depends on wall-clock speed and must not be
   * compared across two machines or two runs.
   */
  readonly framesEmitted: number;
  /**
   * Display frames the {@link RunOptions.maxFramesPerSecond} ceiling declined to
   * capture. Always `0` when the ceiling is off.
   *
   * Reported rather than silent because "the UI showed 1,800 frames of a 27,300
   * tick run" is a fact a caller is entitled to, and because a non-zero value
   * here is the marker that {@link framesEmitted} is wall-clock-dependent.
   */
  readonly framesSuppressed: number;
  readonly metricRowsEmitted: number;
  readonly snapshotsTaken: number;
  readonly wavesFired: number;
  /** `Simulation.armedResidents` — the witness that the decision layer ran. */
  readonly armedResidents: number;
  readonly outOfRangeLookups: number;
}
