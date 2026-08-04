/**
 * Main-thread instrumentation for the WP10 UI-thread investigation
 * (DR-WP10-uithread-perf).
 *
 * The gated probe (`../worker/probe.ts`) answers *how big is the worst gap*. It
 * cannot answer *what was inside it*, which is the question a fix has to be
 * chosen from. This adds three things, all allocation-free once started:
 *
 *  1. **Per-message timing.** Handler entry and exit are stamped, so the time
 *     the UI thread spends in application code is separable from the time it
 *     spends anywhere else (message deserialization, GC, browser internals).
 *  2. **Gap attribution.** Every gap at or above {@link ATTRIB_MS} records how
 *     many stream messages were processed inside it, how many bytes they
 *     carried, how much handler self-time they cost, and how many animation
 *     frames fired. A 200 ms gap containing 300 messages and 190 ms of handler
 *     time is a throughput problem; the same gap containing zero messages and
 *     zero handler time is not application code at all.
 *  3. **Paint cadence.** A self-rescheduling `requestAnimationFrame` loop, so
 *     "frames arriving" can be compared with "frames the page could ever have
 *     painted".
 *
 * Everything is preallocated in the constructor. The instrument must not be
 * able to manufacture the event it is looking for — the same rule
 * `../worker/probe.ts` was written under, and the reason its histogram is
 * reused verbatim here rather than reinvented.
 */

import * as Comlink from "comlink";

import type { StreamMessage } from "../../src/worker/protocol.js";
import {
  smokeAsset,
  synthConfig,
  synthCsvMap,
  synthGeometry,
  synthTopology,
  type SynthWorldOptions,
} from "../../test/worker/world.js";
import type { ProfilingSimWorkerApi, TransferAudit } from "./profileWorker.js";

export const ENGINE_LABEL: string =
  (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? "unknown-engine";

/** Short engine name, so a table is readable. */
export const ENGINE: string = /Firefox/u.test(ENGINE_LABEL)
  ? "firefox"
  : /Chrome|Chromium|HeadlessChrome/u.test(ENGINE_LABEL)
    ? "chromium"
    : "webkit";

/** Histogram resolution, matching `../worker/probe.ts`. */
export const BIN_MS = 0.1;
export const HISTOGRAM_MAX_MS = 500;
const BINS = Math.round(HISTOGRAM_MAX_MS / BIN_MS);
/** Gaps at or above this get a full attribution row. */
export const ATTRIB_MS = 15;
const ATTRIB_CAP = 1024;
const MSG_CAP = 70_000;
const RAF_CAP = 40_000;

export interface GapAttribution {
  /** Gap length, ms. */
  readonly gapMs: number;
  /** `performance.now()` at the hop that closed the gap. */
  readonly endMs: number;
  /** Stream messages whose handler ran inside the gap. */
  readonly messages: number;
  readonly frameMessages: number;
  readonly bytes: number;
  /** Handler self-time (entry→exit) summed over those messages. */
  readonly handlerMs: number;
  /** Animation-frame callbacks that fired inside the gap. */
  readonly rafs: number;
  /** `gapMs - handlerMs`: everything that was not application code. */
  readonly unaccountedMs: number;
}

export interface ProfileResult {
  readonly engine: string;
  readonly samples: number;
  readonly p50Ms: number;
  readonly p90Ms: number;
  readonly p99Ms: number;
  readonly p999Ms: number;
  readonly maxMs: number;
  readonly longTasks: number;
  readonly over25Ms: number;
  readonly windowMs: number;
  readonly worstMs: readonly number[];
  /** The attribution rows, worst gap first. */
  readonly gaps: readonly GapAttribution[];
  readonly gapsDropped: number;

  // --- message stream ------------------------------------------------------
  readonly messages: number;
  readonly frameMessages: number;
  readonly framesSeen: number;
  readonly bytesReceived: number;
  readonly bytesPerFrameMessage: number;
  readonly residentCount: number;
  /** Handler self-time over the whole window. */
  readonly handlerMsSum: number;
  readonly handlerMsMax: number;
  readonly handlerMsP99: number;
  /** Share of the measurement window spent inside the message handler. */
  readonly handlerDutyPct: number;
  /** Messages per second of wall clock. */
  readonly messagesPerSecond: number;
  readonly megabytesPerSecond: number;
  /** Largest run of messages processed back-to-back without an rAF in between. */
  readonly maxMessageBurst: number;

  // --- paint cadence -------------------------------------------------------
  readonly rafCount: number;
  readonly rafPerSecond: number;
  readonly rafMaxGapMs: number;
  /** Frame messages received per animation frame — how many can never be painted. */
  readonly framesPerPaint: number;

  // --- witness -------------------------------------------------------------
  readonly residentsTouched: number;
  readonly occupancySum: number;
}

interface Counters {
  messages: number;
  frameMessages: number;
  bytes: number;
  handlerMs: number;
  rafs: number;
}

/**
 * Probe + message log + rAF log, sharing one set of counters so a gap can be
 * attributed without any allocation at sample time.
 */
export class AttributingProbe {
  private readonly hist = new Int32Array(BINS + 1);
  private readonly tail = new Float64Array(4096);
  private readonly channel = new MessageChannel();

  // Attribution rows, as parallel arrays (no object churn on the hot path).
  private readonly gGap = new Float64Array(ATTRIB_CAP);
  private readonly gEnd = new Float64Array(ATTRIB_CAP);
  private readonly gMsgs = new Int32Array(ATTRIB_CAP);
  private readonly gFrameMsgs = new Int32Array(ATTRIB_CAP);
  private readonly gBytes = new Float64Array(ATTRIB_CAP);
  private readonly gHandler = new Float64Array(ATTRIB_CAP);
  private readonly gRaf = new Int32Array(ATTRIB_CAP);
  private gUsed = 0;
  private gDropped = 0;

  // Per-message log.
  private readonly mEnter = new Float64Array(MSG_CAP);
  private readonly mSelf = new Float64Array(MSG_CAP);
  private readonly mBytes = new Float64Array(MSG_CAP);
  private readonly mKind = new Uint8Array(MSG_CAP);
  private mUsed = 0;

  private readonly rafAt = new Float64Array(RAF_CAP);
  private rafUsed = 0;
  private rafRunning = false;

  private tailUsed = 0;
  private tailDropped = 0;
  private count = 0;
  private max = 0;
  private running = false;
  private last = 0;
  private started = 0;

  /** Snapshot of the counters at the previous hop, for gap attribution. */
  private atHop: Counters = { messages: 0, frameMessages: 0, bytes: 0, handlerMs: 0, rafs: 0 };
  readonly live: Counters = { messages: 0, frameMessages: 0, bytes: 0, handlerMs: 0, rafs: 0 };

  /** Longest run of messages with no animation frame in between. */
  private burst = 0;
  private maxBurst = 0;

  /**
   * `"immediate"` re-posts the ping from inside the handler, which is the
   * accepted probe's design (`../worker/probe.ts`) and samples at ~1.8·10⁵ Hz on
   * Firefox. `"timeout"` re-posts from a `setTimeout(0)`, which browsers clamp
   * to 4 ms once nested five deep and therefore samples ~700x more slowly.
   *
   * The knob exists to answer one question and only one: does the probe's own
   * traffic — millions of `MessageEvent` objects on the thread being measured —
   * contribute to the cold-page stall it reports? A probe that manufactures the
   * event it is looking for is the one failure mode this measurement cannot
   * have, and asserting it does not is not the same as showing it.
   */
  start(hopVia: "immediate" | "timeout" | "vsync" = "immediate"): void {
    this.running = true;
    this.hopVia = hopVia;
    this.started = performance.now();
    this.last = this.started;
    this.channel.port1.onmessage = (): void => {
      const now = performance.now();
      const gap = now - this.last;
      this.last = now;
      this.count++;
      if (gap > this.max) {
        this.max = gap;
      }
      const bin = gap < HISTOGRAM_MAX_MS ? (gap * (1 / BIN_MS)) | 0 : BINS;
      this.hist[bin]!++;
      if (gap >= 5) {
        if (this.tailUsed < this.tail.length) {
          this.tail[this.tailUsed++] = gap;
        } else {
          this.tailDropped++;
        }
      }
      if (gap >= ATTRIB_MS) {
        if (this.gUsed < ATTRIB_CAP) {
          const i = this.gUsed++;
          this.gGap[i] = gap;
          this.gEnd[i] = now;
          this.gMsgs[i] = this.live.messages - this.atHop.messages;
          this.gFrameMsgs[i] = this.live.frameMessages - this.atHop.frameMessages;
          this.gBytes[i] = this.live.bytes - this.atHop.bytes;
          this.gHandler[i] = this.live.handlerMs - this.atHop.handlerMs;
          this.gRaf[i] = this.live.rafs - this.atHop.rafs;
        } else {
          this.gDropped++;
        }
      }
      this.atHop.messages = this.live.messages;
      this.atHop.frameMessages = this.live.frameMessages;
      this.atHop.bytes = this.live.bytes;
      this.atHop.handlerMs = this.live.handlerMs;
      this.atHop.rafs = this.live.rafs;
      if (this.running) {
        this.hop();
      }
    };
    this.channel.port1.start();
    this.hop();
    this.startRaf();
  }

  private hopVia: "immediate" | "timeout" | "vsync" = "immediate";

  private hop(): void {
    if (this.hopVia === "immediate") {
      this.channel.port2.postMessage(0);
      return;
    }
    // `"vsync"` samples at ~60 Hz: 2,400 events over a 40 s window instead of
    // ~8·10⁶, i.e. the probe's own allocation stops being a plausible cause of
    // anything, while still resolving a 138 ms gap without ambiguity.
    setTimeout(this.repost, this.hopVia === "vsync" ? 16 : 0);
  }

  private readonly repost = (): void => {
    if (this.running) {
      this.channel.port2.postMessage(0);
    }
  };

  private startRaf(): void {
    const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => number })
      .requestAnimationFrame;
    if (typeof raf !== "function") {
      return;
    }
    this.rafRunning = true;
    const tick = (): void => {
      if (!this.rafRunning) {
        return;
      }
      this.live.rafs++;
      this.burst = 0;
      if (this.rafUsed < RAF_CAP) {
        this.rafAt[this.rafUsed++] = performance.now();
      }
      raf(tick);
    };
    raf(tick);
  }

  /** Call at the TOP of the stream-message handler. Returns the entry stamp. */
  onMessageEnter(kind: number, bytes: number): number {
    const t = performance.now();
    if (this.mUsed < MSG_CAP) {
      this.mEnter[this.mUsed] = t;
      this.mKind[this.mUsed] = kind;
      this.mBytes[this.mUsed] = bytes;
    }
    return t;
  }

  /** Call at the BOTTOM of the stream-message handler with the entry stamp. */
  onMessageExit(enter: number, isFrame: boolean, bytes: number): void {
    const self = performance.now() - enter;
    if (this.mUsed < MSG_CAP) {
      this.mSelf[this.mUsed] = self;
      this.mUsed++;
    }
    this.live.messages++;
    if (isFrame) {
      this.live.frameMessages++;
    }
    this.live.bytes += bytes;
    this.live.handlerMs += self;
    this.burst++;
    if (this.burst > this.maxBurst) {
      this.maxBurst = this.burst;
    }
  }

  stop(): {
    readonly windowMs: number;
    readonly samples: number;
    readonly p50Ms: number;
    readonly p90Ms: number;
    readonly p99Ms: number;
    readonly p999Ms: number;
    readonly maxMs: number;
    readonly longTasks: number;
    readonly over25Ms: number;
    readonly worstMs: readonly number[];
    readonly tailDropped: number;
    readonly gaps: readonly GapAttribution[];
    readonly gapsDropped: number;
    readonly handlerMsSum: number;
    readonly handlerMsMax: number;
    readonly handlerMsP99: number;
    readonly rafCount: number;
    readonly rafMaxGapMs: number;
    readonly maxMessageBurst: number;
    readonly messages: number;
    readonly frameMessages: number;
    readonly bytes: number;
  } {
    this.running = false;
    this.rafRunning = false;
    const windowMs = performance.now() - this.started;
    this.channel.port1.close();
    this.channel.port2.close();

    const atOrAbove = (ms: number): number => {
      let n = 0;
      for (let b = Math.round(ms / BIN_MS); b <= BINS; b++) {
        n += this.hist[b]!;
      }
      return n;
    };
    const worst = Array.from(this.tail.subarray(0, this.tailUsed))
      .sort((a, b) => b - a)
      .slice(0, 10)
      .map((x) => r2(x));

    const gaps: GapAttribution[] = [];
    for (let i = 0; i < this.gUsed; i++) {
      gaps.push({
        gapMs: r2(this.gGap[i]!),
        endMs: r2(this.gEnd[i]!),
        messages: this.gMsgs[i]!,
        frameMessages: this.gFrameMsgs[i]!,
        bytes: this.gBytes[i]!,
        handlerMs: r2(this.gHandler[i]!),
        rafs: this.gRaf[i]!,
        unaccountedMs: r2(this.gGap[i]! - this.gHandler[i]!),
      });
    }
    gaps.sort((a, b) => b.gapMs - a.gapMs);

    const selfSorted = Array.from(this.mSelf.subarray(0, this.mUsed)).sort((a, b) => a - b);
    const p99Self =
      selfSorted.length === 0
        ? Number.NaN
        : selfSorted[Math.min(selfSorted.length - 1, Math.ceil(0.99 * selfSorted.length) - 1)]!;

    let rafMaxGap = 0;
    for (let i = 1; i < this.rafUsed; i++) {
      const d = this.rafAt[i]! - this.rafAt[i - 1]!;
      if (d > rafMaxGap) {
        rafMaxGap = d;
      }
    }

    return {
      windowMs: r2(windowMs),
      samples: this.count,
      p50Ms: this.percentile(50),
      p90Ms: this.percentile(90),
      p99Ms: this.percentile(99),
      p999Ms: this.percentile(99.9),
      maxMs: r2(this.max),
      longTasks: atOrAbove(50),
      over25Ms: atOrAbove(25),
      worstMs: worst,
      tailDropped: this.tailDropped,
      gaps: gaps.slice(0, 12),
      gapsDropped: this.gDropped,
      handlerMsSum: r2(this.live.handlerMs),
      handlerMsMax: r2(selfSorted[selfSorted.length - 1] ?? Number.NaN),
      handlerMsP99: r2(p99Self),
      rafCount: this.live.rafs,
      rafMaxGapMs: r2(rafMaxGap),
      maxMessageBurst: this.maxBurst,
      messages: this.live.messages,
      frameMessages: this.live.frameMessages,
      bytes: this.live.bytes,
    };
  }

  private percentile(p: number): number {
    if (this.count === 0) {
      return Number.NaN;
    }
    const target = Math.ceil((p / 100) * this.count);
    let seen = 0;
    for (let b = 0; b <= BINS; b++) {
      seen += this.hist[b]!;
      if (seen >= target) {
        return b === BINS ? r2(this.max) : r2((b + 1) * BIN_MS);
      }
    }
    return r2(this.max);
  }
}

function r2(x: number): number {
  return Number.isFinite(x) ? Number(x.toFixed(2)) : x;
}

export interface ProfiledWorker {
  readonly api: Comlink.Remote<ProfilingSimWorkerApi>;
  readonly probe: AttributingProbe;
  residentsTouched(): number;
  occupancySum(): number;
  bytesPerFrameMessage(): number;
  residentCount(): number;
  framesSeen(): number;
  terminate(): void;
}

export interface ProfileWorkerOptions {
  /**
   * Walk every resident of every frame, the way a renderer would. Default
   * `true` — the gated test does this, and a handler that ignored the payload
   * would measure an idle thread.
   */
  readonly walkPayload?: boolean;
}

/**
 * Start the profiling worker, subscribe to its stream, load the synthetic
 * graph, and route every stream message through {@link AttributingProbe}.
 */
export async function startProfiledWorker(
  probe: AttributingProbe,
  options: ProfileWorkerOptions = {},
): Promise<ProfiledWorker> {
  const walk = options.walkPayload ?? true;
  const worker = new Worker(new URL("./profileWorker.ts", import.meta.url), { type: "module" });
  const api = Comlink.wrap<ProfilingSimWorkerApi>(worker);

  let residentsTouched = 0;
  let occupancySum = 0;
  let bytesPerFrameMessage = 0;
  let residentCount = 0;
  let framesSeen = 0;

  const channel = new MessageChannel();
  channel.port1.onmessage = (ev: MessageEvent<StreamMessage>): void => {
    const m = ev.data;
    const isFrame = m.kind === "frames";
    let bytes = 0;
    if (isFrame) {
      bytes =
        m.batch.positions.byteLength +
        m.batch.states.byteLength +
        m.batch.occupancy.byteLength +
        m.batch.ticks.byteLength +
        m.batch.smokeUgM3.byteLength;
    } else if (m.kind === "metrics") {
      bytes = m.batch.stateCensus.byteLength + m.batch.meanExposureUgM3h.byteLength;
    }
    const kind = isFrame ? 0 : m.kind === "metrics" ? 1 : m.kind === "wave" ? 2 : 3;
    const enter = probe.onMessageEnter(kind, bytes);
    if (isFrame) {
      framesSeen += m.batch.frameCount;
      residentCount = m.batch.residentCount;
      bytesPerFrameMessage = bytes;
      if (walk) {
        const { positions, states, occupancy } = m.batch;
        for (let i = 0; i < states.length; i++) {
          if (positions[2 * i]! < 0 && states[i]! < 8) {
            residentsTouched++;
          }
        }
        for (let j = 0; j < occupancy.length; j++) {
          occupancySum += occupancy[j]!;
        }
      }
    }
    probe.onMessageExit(enter, isFrame, bytes);
  };
  channel.port1.start();
  await api.subscribe(Comlink.transfer(channel.port2, [channel.port2]));

  const topology = synthTopology();
  await api.loadAssets(Comlink.transfer({ topology, geometry: synthGeometry(topology) }, []));

  return {
    api,
    probe,
    residentsTouched: () => residentsTouched,
    occupancySum: () => occupancySum,
    bytesPerFrameMessage: () => bytesPerFrameMessage,
    residentCount: () => residentCount,
    framesSeen: () => framesSeen,
    terminate: () => {
      channel.port1.close();
      worker.terminate();
    },
  };
}

export function initPayload(options: SynthWorldOptions = {}) {
  const config = synthConfig(options);
  return {
    config,
    csv: synthCsvMap(),
    smokeAsset: smokeAsset(config.simulationHours, options.smokeGapHours ?? []),
    registryValidated: true,
  };
}

/** Assemble the reported row from a stopped probe plus the worker's own view. */
export function summarise(
  stopped: ReturnType<AttributingProbe["stop"]>,
  w: ProfiledWorker,
): ProfileResult {
  const secs = stopped.windowMs / 1000;
  return {
    engine: ENGINE,
    samples: stopped.samples,
    p50Ms: stopped.p50Ms,
    p90Ms: stopped.p90Ms,
    p99Ms: stopped.p99Ms,
    p999Ms: stopped.p999Ms,
    maxMs: stopped.maxMs,
    longTasks: stopped.longTasks,
    over25Ms: stopped.over25Ms,
    windowMs: stopped.windowMs,
    worstMs: stopped.worstMs,
    gaps: stopped.gaps,
    gapsDropped: stopped.gapsDropped,
    messages: stopped.messages,
    frameMessages: stopped.frameMessages,
    framesSeen: w.framesSeen(),
    bytesReceived: stopped.bytes,
    bytesPerFrameMessage: w.bytesPerFrameMessage(),
    residentCount: w.residentCount(),
    handlerMsSum: stopped.handlerMsSum,
    handlerMsMax: stopped.handlerMsMax,
    handlerMsP99: stopped.handlerMsP99,
    handlerDutyPct: r2((100 * stopped.handlerMsSum) / stopped.windowMs),
    messagesPerSecond: r2(stopped.messages / secs),
    megabytesPerSecond: r2(stopped.bytes / 1e6 / secs),
    maxMessageBurst: stopped.maxMessageBurst,
    rafCount: stopped.rafCount,
    rafPerSecond: r2(stopped.rafCount / secs),
    rafMaxGapMs: stopped.rafMaxGapMs,
    framesPerPaint: r2(stopped.rafCount === 0 ? Number.NaN : w.framesSeen() / stopped.rafCount),
    residentsTouched: w.residentsTouched(),
    occupancySum: w.occupancySum(),
  };
}

/** Cadence facts derived from the worker's own send log. */
export function sendCadence(audit: TransferAudit): {
  readonly sends: number;
  readonly frameSends: number;
  readonly spanMs: number;
  readonly sendsPerSecond: number;
  readonly medianInterSendMs: number;
  readonly maxInterSendMs: number;
  readonly postMsSum: number;
  readonly postMsMax: number;
  readonly postMsMean: number;
} {
  const n = audit.recorded;
  const span = n < 2 ? 0 : audit.sendTimes[n - 1]! - audit.sendTimes[0]!;
  const deltas: number[] = [];
  let frameSends = 0;
  for (let i = 0; i < n; i++) {
    if (audit.sendKinds[i] === 0) {
      frameSends++;
    }
    if (i > 0) {
      deltas.push(audit.sendTimes[i]! - audit.sendTimes[i - 1]!);
    }
  }
  deltas.sort((a, b) => a - b);
  return {
    sends: n,
    frameSends,
    spanMs: r2(span),
    sendsPerSecond: r2(span === 0 ? Number.NaN : (n * 1000) / span),
    medianInterSendMs: r2(deltas[Math.floor(deltas.length / 2)] ?? Number.NaN),
    maxInterSendMs: r2(deltas[deltas.length - 1] ?? Number.NaN),
    postMsSum: r2(audit.postMsSum),
    postMsMax: r2(audit.postMsMax),
    postMsMean: r2(audit.messages === 0 ? Number.NaN : audit.postMsSum / audit.messages),
  };
}
