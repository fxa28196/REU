/**
 * `SimHost` — the run lifecycle, streaming and scrub machinery, with **no**
 * dependency on Worker, Comlink or any host API.
 *
 * That independence is the point. `simWorker.ts` is a thirty-line adapter that
 * exposes this class over Comlink and forwards its stream to a `MessagePort`;
 * everything with behaviour lives here, so the whole of WP10's logic is testable
 * in Node *and* the identical object is what runs inside the browser worker. The
 * alternative — logic inside the worker entry point — is untestable except
 * through a browser, which in practice means untested.
 *
 * ## The loop
 *
 * `Simulation.runUntil(t)` is synchronous and resumes from its own tick counter.
 * The host therefore never "steps"; it computes the next tick at which something
 * must happen — a frame, a snapshot, a closure wave, the slice boundary, the end
 * — runs straight to it, does that thing, and repeats. Between slices it yields
 * to the worker's event loop so `pause` is answered promptly.
 *
 * **Where a call boundary falls is not observable to the model.** Nothing in the
 * engine reads wall-clock time or a call counter, so `runUntil(600);
 * runUntil(1200)` executes exactly the ticks `runUntil(1200)` would. That is not
 * an argument the host is allowed to make on its own credit:
 * `engine/test/worker/host.test.ts` runs the same configuration at four
 * different slice cadences and asserts one digest.
 *
 * ## Scrub
 *
 * `scrubTo(t)` restores the newest keyframe at or before `t` and fast-forwards.
 * Fast-forwarding is a plain `runUntil`, so a scrub lands on exactly the state a
 * straight run would have been in — which is the byte-identity property, and it
 * is measured (`engine/test/worker/snapshot.property.test.ts`, and in three real
 * browsers by `engine/test-browser/worker/snapshot.worker.test.ts`).
 *
 * Scrubbing **forward** is not a scrub at all, it is just running, and it is
 * handled as such. Scrubbing **backwards past every keyframe** is refused rather
 * than approximated: with `snapshotEveryTicks = 0` there are no keyframes and
 * the honest answer is "this run was configured without scrub", not a silent
 * landing on the wrong tick.
 */

import { STATES } from "../agents/stateMachine.js";
import type { ClosureWaveReport } from "../closures/runtime.js";
import { writeRunOutputs, type OutputEnvironment, type RunOutcome, type RunOutputs, type OutputFlavour } from "../output/logger.js";

import { buildSimulation, performanceNow, type BuildSimulationRequest, type SimBundle } from "./build.js";
import { runCensus, type RunCensus } from "./census.js";
import { digestSimulation, simulationTokens } from "./digest.js";
import { FrameEncoder, MetricEncoder, frameBatchTransferables, metricBatchTransferables } from "./frames.js";
import {
  RUN_OPTION_DEFAULTS,
  type RunOptions,
  type RunPhase,
  type RunStatus,
  type RunSummary,
  type StreamMessage,
  type WaveProgressEvent,
} from "./protocol.js";
import { SnapshotRing, type RingStats, type SnapshotRingOptions } from "./ring.js";
import { captureSnapshot, restoreSnapshot, type SimSnapshot, type SnapshotTarget } from "./snapshot.js";

/**
 * Sink for stream messages, plus the buffers to transfer with each one.
 *
 * A function rather than a `MessagePort` so the host stays host-agnostic; the
 * worker adapter passes `(msg, transfer) => port.postMessage(msg, transfer)` and
 * a Node test passes a collector.
 */
export type StreamSink = (message: StreamMessage, transfer: ArrayBuffer[]) => void;

export interface SimHostOptions {
  readonly ring?: SnapshotRingOptions;
  /** Where stream messages go. Defaults to discarding them. */
  readonly sink?: StreamSink;
}

/** Yield to the event loop without the browsers' nested-`setTimeout` clamp. */
function makeYield(): () => Promise<void> {
  const g = globalThis as unknown as {
    setImmediate?: (cb: () => void) => unknown;
    MessageChannel?: new () => {
      port1: { onmessage: null | (() => void); start?: () => void };
      port2: { postMessage(v: unknown): void };
    };
  };
  if (typeof g.setImmediate === "function") {
    const si = g.setImmediate.bind(globalThis);
    return () =>
      new Promise<void>((resolve) => {
        si(resolve);
      });
  }
  if (typeof g.MessageChannel === "function") {
    // `setTimeout(0)` is clamped to 4 ms once nested five deep, which on a run
    // with hundreds of slices is hundreds of milliseconds of pure waiting. A
    // MessageChannel round-trip is a macrotask with no clamp.
    const MC = g.MessageChannel;
    return () =>
      new Promise<void>((resolve) => {
        const ch = new MC();
        ch.port1.onmessage = (): void => {
          resolve();
        };
        ch.port2.postMessage(0);
      });
  }
  return () =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
}

const yieldToEventLoop = makeYield();

/**
 * Java-declared integer parameters, for the executed manifest.
 *
 * The list is duplicated from `validation/src/headless.ts` because the engine
 * cannot import the validation package (validation depends on the engine, not
 * the reverse). Duplication is a drift surface, so it is gated:
 * `engine/test/worker/manifest-params.test.ts` reads the other list out of its
 * source file and fails when the two disagree.
 */
export const INT_PARAM_NAMES: readonly string[] = [
  "numAgents",
  "simulationHours",
  "randomSeed",
  "scenarioCode",
  "enableHeterogeneity",
  "respectShelterOpeningDates",
  "enableDecisionLayer",
  "informationRegime",
  "enableHazardDeparture",
  "petPolicyDefault",
  "shelterPolicyVariant",
  "smokeSeriesCode",
  "closuresCode",
  "closureDraw",
];

export interface ExportRequest {
  readonly flavour: OutputFlavour;
  /** The 41 parameter names, in manifest order. */
  readonly paramNames: readonly string[];
  readonly env?: Partial<OutputEnvironment>;
}

export class SimHost {
  private bundle: SimBundle | null = null;
  private ring: SnapshotRing;
  private sink: StreamSink;
  private readonly ringOptions: SnapshotRingOptions;

  private phase: RunPhase = "idle";
  private pauseRequested = false;
  private runMs = 0;
  private framesEmitted = 0;
  private metricRowsEmitted = 0;
  private wavesFired = 0;
  private lastTicksPerSecond = Number.NaN;

  private frames: FrameEncoder | null = null;
  private metrics: MetricEncoder | null = null;
  private opts: Required<Omit<RunOptions, "untilTick">> = { ...RUN_OPTION_DEFAULTS };

  constructor(options: SimHostOptions = {}) {
    this.ringOptions = options.ring ?? {};
    this.ring = new SnapshotRing(this.ringOptions);
    this.sink = options.sink ?? ((): void => undefined);
  }

  /** Replace the stream sink (the worker adapter calls this at subscribe time). */
  setSink(sink: StreamSink): void {
    this.sink = sink;
  }

  get currentPhase(): RunPhase {
    return this.phase;
  }

  /** The built bundle. Throws before {@link init}. */
  get built(): SimBundle {
    if (this.bundle === null) {
      throw new Error("SimHost has no simulation: call init() first");
    }
    return this.bundle;
  }

  private get target(): SnapshotTarget {
    const b = this.built;
    return { sim: b.sim, smoke: b.smoke, streams: b.world.streams };
  }

  /**
   * Build the world and the simulation.
   *
   * The metric and wave hooks are wired **here**, at construction, because
   * `Simulation` takes them in its constructor: an `onHour` attached afterwards
   * would silently miss the hours of any run that had already started.
   */
  init(request: Omit<BuildSimulationRequest, "onHour" | "onClosureWave">): RunSummary {
    this.phase = "building";
    this.emitStatus("building");
    try {
      this.bundle = buildSimulation({
        ...request,
        onHour: (hour) => {
          this.onHour(hour);
        },
        onClosureWave: (report) => {
          this.onClosureWave(report);
        },
      });
    } catch (err) {
      this.phase = "error";
      this.emitStatus("error", err instanceof Error ? err.message : String(err));
      throw err;
    }
    this.ring = new SnapshotRing(this.ringOptions);
    this.runMs = 0;
    this.framesEmitted = 0;
    this.metricRowsEmitted = 0;
    this.wavesFired = 0;
    this.lastTicksPerSecond = Number.NaN;
    this.phase = "ready";
    this.emitStatus("ready");
    return this.summary();
  }

  /**
   * Run until the end tick (or `options.untilTick`), yielding between slices.
   *
   * Resumable: calling it again after a `pause` continues from the current tick
   * with the same encoders, so a paused-and-resumed run streams exactly the
   * frames an uninterrupted one would.
   */
  async run(options: RunOptions = {}): Promise<RunSummary> {
    const b = this.built;
    this.opts = {
      sliceTicks: options.sliceTicks ?? RUN_OPTION_DEFAULTS.sliceTicks,
      frameEveryTicks: options.frameEveryTicks ?? RUN_OPTION_DEFAULTS.frameEveryTicks,
      frameBatchSize: options.frameBatchSize ?? RUN_OPTION_DEFAULTS.frameBatchSize,
      metricBatchSize: options.metricBatchSize ?? RUN_OPTION_DEFAULTS.metricBatchSize,
      snapshotEveryTicks: options.snapshotEveryTicks ?? RUN_OPTION_DEFAULTS.snapshotEveryTicks,
    };
    if (this.opts.sliceTicks < 1 || !Number.isInteger(this.opts.sliceTicks)) {
      throw new RangeError(`sliceTicks must be a positive integer, got ${this.opts.sliceTicks}`);
    }
    if (this.frames === null && this.opts.frameEveryTicks > 0) {
      this.frames = new FrameEncoder(b.sim.residents.length, b.sim.shelters.length, this.opts.frameBatchSize);
    }
    if (this.metrics === null) {
      this.metrics = new MetricEncoder(this.opts.metricBatchSize);
    }

    const stop = Math.min(options.untilTick ?? b.sim.endTick, b.sim.endTick);
    this.pauseRequested = false;
    this.phase = "running";

    // Tick 0 is always a keyframe: without it a scrub to a tick before the first
    // periodic snapshot has nowhere to restore from.
    if (this.opts.snapshotEveryTicks > 0 && b.sim.tick === 0 && this.ring.ticks().length === 0) {
      this.ring.offer(captureSnapshot(this.target));
    }
    if (this.opts.frameEveryTicks > 0 && b.sim.tick === 0) {
      this.captureFrame();
    }

    while (b.sim.tick < stop && !this.pauseRequested) {
      const sliceEnd = Math.min(b.sim.tick + this.opts.sliceTicks, stop);
      const t0 = performanceNow();
      const startTick = b.sim.tick;
      while (b.sim.tick < sliceEnd) {
        const next = this.nextStopTick(sliceEnd);
        const waveTick = this.nextWaveTick();
        if (waveTick !== null && waveTick === next) {
          this.emitWaveStart(waveTick);
        }
        b.sim.runUntil(next);
        this.afterStop();
      }
      const dt = performanceNow() - t0;
      this.runMs += dt;
      this.lastTicksPerSecond = dt > 0 ? ((b.sim.tick - startTick) * 1000) / dt : Number.POSITIVE_INFINITY;
      this.emitStatus("running");
      if (b.sim.tick < stop) {
        await yieldToEventLoop();
      }
    }

    this.flushStreams();
    this.phase = this.pauseRequested && b.sim.tick < stop ? "paused" : b.sim.tick >= b.sim.endTick ? "finished" : "paused";
    this.emitStatus(this.phase);
    return this.summary();
  }

  /** Ask the loop to stop at the next slice boundary. */
  pause(): void {
    this.pauseRequested = true;
  }

  /**
   * The tick the loop must stop at next: whichever of the frame cadence, the
   * snapshot cadence, the next closure wave and the slice end comes first.
   */
  private nextStopTick(sliceEnd: number): number {
    const t = this.built.sim.tick;
    let next = sliceEnd;
    const fe = this.opts.frameEveryTicks;
    if (fe > 0) {
      next = Math.min(next, (Math.floor(t / fe) + 1) * fe);
    }
    const se = this.opts.snapshotEveryTicks;
    if (se > 0) {
      next = Math.min(next, (Math.floor(t / se) + 1) * se);
    }
    const wave = this.nextWaveTick();
    if (wave !== null && wave > t) {
      next = Math.min(next, wave);
    }
    return Math.max(Math.min(next, sliceEnd), t + 1);
  }

  /** Tick of the next wave that has not fired, or `null`. */
  private nextWaveTick(): number | null {
    const c = this.built.sim.closures;
    if (c === null) {
      return null;
    }
    const w = c.schedule.waves[c.wavesApplied];
    return w === undefined ? null : w.tick;
  }

  private afterStop(): void {
    const t = this.built.sim.tick;
    if (this.opts.frameEveryTicks > 0 && t % this.opts.frameEveryTicks === 0) {
      this.captureFrame();
    }
    if (this.opts.snapshotEveryTicks > 0 && t % this.opts.snapshotEveryTicks === 0) {
      this.ring.offer(captureSnapshot(this.target));
    }
  }

  private captureFrame(): void {
    const enc = this.frames;
    if (enc === null) {
      return;
    }
    const b = this.built;
    enc.capture(b.sim, b.smoke);
    this.framesEmitted++;
    if (enc.full) {
      this.emitFrames();
    }
  }

  private emitFrames(): void {
    const batch = this.frames?.flush() ?? null;
    if (batch !== null) {
      this.sink({ kind: "frames", batch }, frameBatchTransferables(batch));
    }
  }

  private emitMetrics(): void {
    const batch = this.metrics?.flush() ?? null;
    if (batch !== null) {
      this.sink({ kind: "metrics", batch }, metricBatchTransferables(batch));
    }
  }

  private flushStreams(): void {
    this.emitFrames();
    this.emitMetrics();
  }

  private onHour(hour: number): void {
    const enc = this.metrics;
    if (enc === null) {
      return;
    }
    const b = this.built;
    enc.capture(b.sim, b.smoke, hour);
    this.metricRowsEmitted++;
    if (enc.full) {
      this.emitMetrics();
    }
  }

  private waveStartMs = Number.NaN;

  private emitWaveStart(tick: number): void {
    const c = this.built.sim.closures;
    if (c === null) {
      return;
    }
    const w = c.schedule.waves[c.wavesApplied];
    if (w === undefined) {
      return;
    }
    this.waveStartMs = performanceNow();
    const ev: WaveProgressEvent = {
      kind: "wave",
      phase: "start",
      wave: c.wavesApplied + 1,
      tick,
      hour: w.hour,
      shelterCount: this.built.sim.shelters.length,
    };
    this.sink(ev, []);
  }

  private onClosureWave(report: ClosureWaveReport): void {
    this.wavesFired++;
    const elapsed = Number.isNaN(this.waveStartMs) ? Number.NaN : performanceNow() - this.waveStartMs;
    this.waveStartMs = Number.NaN;
    const ev: WaveProgressEvent = {
      kind: "wave",
      phase: "done",
      wave: report.wave,
      tick: report.tick,
      hour: report.hour,
      shelterCount: report.sheltersRecomputed,
      elapsedMs: elapsed,
      report,
    };
    this.sink(ev, []);
  }

  private emitStatus(phase: RunPhase, message?: string): void {
    const b = this.bundle;
    const status: RunStatus = {
      kind: "status",
      phase,
      tick: b?.sim.tick ?? 0,
      endTick: b?.sim.endTick ?? 0,
      hour: b === null ? 0 : Math.floor(b.sim.tick / b.sim.ticksPerHour),
      endHours: b?.world.endHours ?? 0,
      runMs: this.runMs,
      ticksPerSecond: this.lastTicksPerSecond,
      keyframeTicks: this.ring.ticks(),
      ...(message === undefined ? {} : { message }),
    };
    this.sink(status, []);
  }

  // --- snapshots and scrub --------------------------------------------------

  /** Take a snapshot now and file it in the ring. */
  snapshotNow(): SimSnapshot {
    const snap = captureSnapshot(this.target);
    this.ring.offer(snap);
    return snap;
  }

  /** Restore a snapshot this host produced. Does not touch the ring. */
  restore(snap: SimSnapshot): void {
    restoreSnapshot(this.target, snap);
  }

  ringStats(): RingStats {
    return this.ring.stats();
  }

  keyframeTicks(): number[] {
    return this.ring.ticks();
  }

  /**
   * Land the simulation exactly on `tick`.
   *
   * Forward is a plain run. Backwards restores the newest keyframe at or before
   * the target and fast-forwards from there. Returns the keyframe used, so a
   * caller (and the test suite) can assert the scrub was a real restore and not
   * a lucky no-op.
   */
  scrubTo(tick: number): { readonly fromKeyframe: number; readonly replayedTicks: number } {
    const b = this.built;
    const target = Math.max(0, Math.min(tick, b.sim.endTick));
    if (target >= b.sim.tick) {
      const from = b.sim.tick;
      b.sim.runUntil(target);
      return { fromKeyframe: from, replayedTicks: target - from };
    }
    const key = this.ring.nearestAtOrBefore(target);
    if (key === null) {
      throw new Error(
        `cannot scrub back to tick ${target}: no keyframe at or before it. This run was ` +
          "started with snapshotEveryTicks = 0, so it has no scrub history; re-run with " +
          "snapshots enabled rather than accepting an approximate landing.",
      );
    }
    restoreSnapshot(this.target, key);
    b.sim.runUntil(target);
    return { fromKeyframe: key.tick, replayedTicks: target - key.tick };
  }

  // --- read-out -------------------------------------------------------------

  /** SHA-256 over the complete reflective state digest (`digest.ts`). */
  async digest(): Promise<string> {
    const b = this.built;
    return digestSimulation(b.sim, b.smoke, b.world.streams);
  }

  /** The digest's tokens, for localising a mismatch. */
  digestTokens(): string[] {
    const b = this.built;
    return simulationTokens(b.sim, b.smoke, b.world.streams);
  }

  summary(): RunSummary {
    const b = this.bundle;
    return {
      tick: b?.sim.tick ?? 0,
      endTick: b?.sim.endTick ?? 0,
      phase: this.phase,
      runMs: this.runMs,
      buildMs: b?.buildMs ?? 0,
      framesEmitted: this.framesEmitted,
      metricRowsEmitted: this.metricRowsEmitted,
      snapshotsTaken: this.ring.stats().taken,
      wavesFired: this.wavesFired,
      armedResidents: b?.sim.armedResidents ?? 0,
      outOfRangeLookups: b?.smoke.outOfRangeLookups ?? 0,
    };
  }

  /**
   * What the run actually did (`census.ts`).
   *
   * Exposed from the host, and through the worker API, because the WP10
   * acceptance criteria are measured inside a worker: a browser test that can
   * only see two digests cannot show the runs behind them did anything.
   */
  census(): RunCensus {
    return runCensus(this.built.sim);
  }

  /** State census over `STATES`, for a cheap UI read-out without a frame. */
  stateCensus(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const s of STATES) {
      out[s] = 0;
    }
    for (const r of this.built.sim.residents) {
      out[r.state] = (out[r.state] ?? 0) + 1;
    }
    return out;
  }

  /** `OutcomeLogger.export()` — the LAST_PRIORITY step, once, at the caller's request. */
  exportOutputs(request: ExportRequest): RunOutputs {
    const b = this.built;
    const cfg = b.config as unknown as Record<string, number>;
    const env: OutputEnvironment = {
      simId: "sim-worker",
      commit: "unknown",
      dataVersionTag: "unavailable",
      javaVersion: "n/a",
      repastVersion: "2.11.0",
      generatedTimestamp: "n/a",
      inputDatasets: [],
      sourceIntegrity: null,
      ...request.env,
    };
    const outcome: RunOutcome = {
      residents: b.sim.residents,
      shelters: b.world.shelters,
      seed: b.config.randomSeed,
      minutesPerTick: b.config.minutesPerTick,
      scenarioName: b.world.scenario.scenarioName,
      parameters: request.paramNames.map((name) => ({
        name,
        value: cfg[name]!,
        kind: INT_PARAM_NAMES.includes(name) ? ("int" as const) : ("double" as const),
      })),
      smokeCounty: b.smoke.county,
      smokeStart: "2020-09-07T00:00",
      smokeHours: b.smoke.hours(),
      smokePeakHourly: b.smoke.peakHourly(),
      outOfRangeLookups: b.smoke.outOfRangeLookups,
      populationMarginals: b.world.populationMarginals,
      decisionMarginals: b.world.decisionMarginals,
      env,
    };
    return writeRunOutputs(outcome, request.flavour);
  }
}
