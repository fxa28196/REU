/**
 * `SimWorkerClient` — the UI plane's only door to the sim worker (plan §3.4).
 *
 * Screens never touch Comlink, `Worker`, or `MessagePort`; they hold one of
 * these. The worker entry is the engine's own adapter
 * (`@websim/engine/worker/simWorker`), instantiated through Vite's `?worker`
 * form so the module and its imports are bundled for the worker context.
 *
 * ## This file is the D1 fix's caller
 *
 * `DR-WP10-uithread-perf` §5.1 measured the frame flood: at max speed the
 * worker emits 12–136 display frames for every one the page can paint, and
 * 92–99 % of 1.68 GB is discarded unrendered. The engine grew a display-only
 * ceiling (`RunOptions.maxFramesPerSecond`, digest-proven outcome-neutral in
 * `engine/test/worker/host.test.ts`) that ships **off** because Compare and the
 * gates need frame emission to be a deterministic function of the tick sequence
 * (`protocol.ts`, "Why the default is 0 and not 60").
 *
 * The two run methods below make that split impossible to get wrong at a call
 * site:
 *
 *  - {@link SimWorkerClient.runFreely} — free-running playback. Applies
 *    {@link FREE_RUN_MAX_FPS}. The Run screen's play button.
 *  - {@link SimWorkerClient.runExact} — deterministic frame emission (ceiling
 *    off). Compare, the in-browser gate subset, "compute to end" exports, and
 *    anything that will diff two runs' streams.
 *
 * There is deliberately no plain `run(options)` passthrough: a caller must pick
 * a lane, and the lane names say what they cost.
 */
import * as Comlink from "comlink";

import type {
  AssetLoadReport,
  InitPayload,
  RunCensus,
  RunOptions,
  RunSummary,
  SimWorkerApi,
  StreamMessage,
} from "@websim/engine/worker";
import SimWorkerCtor from "@websim/engine/worker/simWorker?worker";

export type StreamListener = (message: StreamMessage) => void;

/**
 * Display ceiling for free-running playback, in frames per wall-clock second.
 *
 * 60 is the highest refresh rate any of the three engines paints headless or
 * headed on commodity hardware (DR-WP10-uithread-perf §5.1: Chromium 60 Hz,
 * Firefox ~33–36, WebKit ~40); frames above it are unpaintable by definition.
 */
export const FREE_RUN_MAX_FPS = 60;

/** Options a caller may set on either run lane — everything but the ceiling. */
export type LaneRunOptions = Omit<RunOptions, "maxFramesPerSecond">;

export class SimWorkerClient {
  private readonly listeners = new Set<StreamListener>();
  private terminated = false;

  private constructor(
    private readonly worker: Worker,
    private readonly remote: Comlink.Remote<SimWorkerApi>,
    private readonly streamPort: MessagePort,
  ) {}

  /** Boot a worker, wire the stream channel, and hand back the client. */
  static async start(): Promise<SimWorkerClient> {
    const worker = new SimWorkerCtor();
    const remote = Comlink.wrap<SimWorkerApi>(worker);
    const channel = new MessageChannel();
    const client = new SimWorkerClient(worker, remote, channel.port1);
    channel.port1.onmessage = (ev: MessageEvent<StreamMessage>): void => {
      client.dispatch(ev.data);
    };
    channel.port1.start();
    await remote.subscribe(Comlink.transfer(channel.port2, [channel.port2]));
    return client;
  }

  /** Subscribe to the stream. Returns the unsubscribe function. */
  onStream(listener: StreamListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private dispatch(message: StreamMessage): void {
    // Snapshot the set: a listener that unsubscribes (or subscribes a sibling)
    // mid-dispatch must not perturb this delivery round.
    for (const listener of [...this.listeners]) {
      listener(message);
    }
  }

  /**
   * Hand the graph asset bytes to the worker. The buffers are TRANSFERRED
   * (detached on this side) — callers must not reuse them.
   */
  async loadGraph(topology: ArrayBuffer, geometry: ArrayBuffer): Promise<AssetLoadReport> {
    return this.remote.loadAssets(Comlink.transfer({ topology, geometry }, [topology, geometry]));
  }

  /** Build the world for one configuration. Replaces any prior run's state. */
  async init(payload: InitPayload): Promise<RunSummary> {
    return this.remote.init(payload);
  }

  /**
   * Free-running playback: the display ceiling is ON at
   * {@link FREE_RUN_MAX_FPS}. `RunSummary.framesSuppressed` reports what it
   * declined; frame counts under this lane are wall-clock-dependent and must
   * never be compared across runs or machines.
   */
  async runFreely(options: LaneRunOptions = {}): Promise<RunSummary> {
    return this.remote.run({ ...options, maxFramesPerSecond: FREE_RUN_MAX_FPS });
  }

  /**
   * Deterministic lane: ceiling OFF. Frame emission is a pure function of the
   * tick sequence — required for Compare, gate runs, and stream diffing.
   */
  async runExact(options: LaneRunOptions = {}): Promise<RunSummary> {
    return this.remote.run({ ...options, maxFramesPerSecond: 0 });
  }

  /** Ask the run loop to stop at the next slice boundary. */
  async pause(): Promise<void> {
    return this.remote.pause();
  }

  /** Land the simulation exactly on `tick` (backwards restores a keyframe). */
  async scrubTo(tick: number): Promise<{ readonly fromKeyframe: number; readonly replayedTicks: number }> {
    return this.remote.scrubTo(tick);
  }

  /** The engine's own outcome census (states, admissions, refusals…). */
  async census(): Promise<RunCensus> {
    return this.remote.census();
  }

  /** Cheap per-state headcount without a frame. */
  async stateCensus(): Promise<Record<string, number>> {
    return this.remote.stateCensus();
  }

  /** SHA-256 over the complete reflective state digest. */
  async digest(): Promise<string> {
    return this.remote.digest();
  }

  /**
   * Everything else on the API, typed, for screens with a legitimate need
   * (Provenance's manifest export, Compare's ring stats) — still Comlink-free
   * at the call site.
   */
  get api(): Comlink.Remote<SimWorkerApi> {
    return this.remote;
  }

  get isTerminated(): boolean {
    return this.terminated;
  }

  /** Tear the worker down. The client is unusable afterwards. */
  terminate(): void {
    this.terminated = true;
    this.listeners.clear();
    this.streamPort.close();
    this.worker.terminate();
  }
}
