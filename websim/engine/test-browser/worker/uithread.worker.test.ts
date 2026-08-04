/**
 * WP10 acceptance criterion 2, measured rather than asserted:
 *
 * > The UI thread stays long-task-free (< 50 ms) at max speed. MEASURE it with
 * > real timings and report the distribution, not a single sample.
 *
 * ## What is actually being measured
 *
 * A self-rescheduling `MessageChannel` probe on the page. Each hop is a
 * macrotask, so the gap between two consecutive hops is the time the main thread
 * spent *not* returning to the event loop — which is exactly the definition of a
 * long task, and it is measurable identically in all three engines (the
 * `longtask` PerformanceObserver entry type is Chromium-only; it is recorded as
 * a second, independent instrument where it exists, and never gated on).
 *
 * `setTimeout(0)` would not do: browsers clamp it to 4 ms once nested five deep,
 * so the probe would report a floor of 4 ms and could not resolve anything
 * below it.
 *
 * ## The probe does real work
 *
 * A probe that ignored the incoming frames would be measuring an idle thread and
 * would stay green even if the frame payloads were being deep-copied. So the
 * message handler touches every frame batch it receives — reading positions,
 * states and occupancy — which is what a renderer does, and it counts the bytes
 * that crossed so the test can assert the worker was under real load.
 *
 * ## The probe is shown able to fail
 *
 * `blocks the main thread on purpose` deliberately spins for 120 ms and requires
 * the probe to report it. Without that, "zero long tasks" could mean "the probe
 * cannot see one".
 *
 * ## The two criterion assertions read ONE quantity (defect G1, fixed)
 *
 * They used not to. `longTasks` counted raw gaps `>= 50`, while the asserted
 * maximum was `Number(max.toFixed(2))` — a **rounded** number. Those disagree on
 * the half-open interval `[49.995, 50)`: a worst gap of 49.9951 ms is not a long
 * task by the clause and is not counted by `longTasks`, but rounds to exactly
 * `50`, so `expect(maxMs).toBeLessThan(50)` failed with
 *
 *     AssertionError: expected 50 to be less than 50
 *
 * beside a passing `expect(longTasks).toBe(0)` — two assertions about the same
 * threshold returning opposite verdicts on the same sample. Observed on WebKit.
 *
 * It failed *safe* (red where the clause was in fact satisfied), which is why it
 * survived; a gate that contradicts itself is still a broken gate, because the
 * next reader cannot tell which half to believe. The rounded value is now
 * {@link Distribution.maxMs} and is for **reading only**; the criterion asserts
 * {@link Distribution.maxExactMs}, which is the same double `longTasks` is
 * counted from, so `longTasks === 0` and `maxExactMs < 50` are now the same
 * statement. `summarise` is exported and the boundary is pinned by its own suite
 * below, including a case that reproduces the old contradiction, so the pair
 * cannot silently drift apart again.
 */

import { describe, expect, it } from "vitest";

import type { StreamMessage } from "../../src/worker/protocol.js";
import { ENGINE_LABEL, initPayload, startWorker } from "./harness.js";

interface Distribution {
  readonly samples: number;
  readonly minMs: number;
  readonly p50Ms: number;
  readonly p90Ms: number;
  readonly p99Ms: number;
  /**
   * Worst gap, rounded to 2 dp — for READING (logs, failure messages).
   *
   * Never assert a threshold against this: rounding moves a value across the
   * threshold it is being compared to. 49.9951 ms renders as `50`.
   */
  readonly maxMs: number;
  /**
   * Worst gap, exact — the double {@link Distribution.longTasks} is counted
   * from. `longTasks === 0` if and only if this is `< LONG_TASK_MS`, so the two
   * criterion assertions cannot contradict each other.
   */
  readonly maxExactMs: number;
  /** Gaps at or above the 50 ms long-task threshold. */
  readonly longTasks: number;
  readonly windowMs: number;
}

const LONG_TASK_MS = 50;

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) {
    return Number.NaN;
  }
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i]!;
}

export function summarise(gaps: readonly number[], windowMs: number): Distribution {
  const sorted = [...gaps].sort((a, b) => a - b);
  const maxExactMs = sorted[sorted.length - 1] ?? Number.NaN;
  return {
    samples: gaps.length,
    minMs: round(sorted[0] ?? Number.NaN),
    p50Ms: round(percentile(sorted, 50)),
    p90Ms: round(percentile(sorted, 90)),
    p99Ms: round(percentile(sorted, 99)),
    maxMs: round(maxExactMs),
    maxExactMs,
    longTasks: gaps.filter((g) => g >= LONG_TASK_MS).length,
    windowMs: round(windowMs),
  };
}

function round(x: number): number {
  return Number.isFinite(x) ? Number(x.toFixed(2)) : x;
}

/** A macrotask ping loop that records the gap between consecutive hops. */
class MainThreadProbe {
  readonly gaps: number[] = [];
  private readonly channel = new MessageChannel();
  private running = false;
  private last = 0;
  private started = 0;

  start(): void {
    this.running = true;
    this.started = performance.now();
    this.last = this.started;
    this.channel.port1.onmessage = (): void => {
      const now = performance.now();
      this.gaps.push(now - this.last);
      this.last = now;
      if (this.running) {
        this.channel.port2.postMessage(0);
      }
    };
    this.channel.port1.start();
    this.channel.port2.postMessage(0);
  }

  stop(): Distribution {
    this.running = false;
    const d = summarise(this.gaps, performance.now() - this.started);
    this.channel.port1.close();
    this.channel.port2.close();
    return d;
  }
}

/** Chromium-only second instrument; `null` where the entry type is unknown. */
function startLongTaskObserver(): { stop(): number[] } | null {
  const PO = (globalThis as { PerformanceObserver?: typeof PerformanceObserver }).PerformanceObserver;
  if (PO === undefined) {
    return null;
  }
  const durations: number[] = [];
  try {
    const obs = new PO((list) => {
      for (const entry of list.getEntries()) {
        durations.push(entry.duration);
      }
    });
    obs.observe({ entryTypes: ["longtask"] });
    return {
      stop: () => {
        obs.disconnect();
        return durations;
      },
    };
  } catch {
    return null;
  }
}

describe(`UI-thread responsiveness at max speed [${ENGINE_LABEL}]`, () => {
  it("the probe detects a long task when one exists (positive control)", async () => {
    const probe = new MainThreadProbe();
    probe.start();
    // Let the loop turn over first — the block has to fall BETWEEN two hops, or
    // the probe would never have started and the control would prove nothing.
    await new Promise<void>((r) => setTimeout(r, 30));
    const warmSamples = probe.gaps.length;
    expect(warmSamples, "the probe never ran").toBeGreaterThan(0);

    const spinUntil = performance.now() + 120;
    while (performance.now() < spinUntil) {
      /* deliberately blocking the event loop */
    }
    await new Promise<void>((r) => setTimeout(r, 30));

    const d = probe.stop();
    // eslint-disable-next-line no-console -- the control's own numbers.
    console.log(`[wp10-uithread-control] ${ENGINE_LABEL}`, JSON.stringify(d));
    expect(d.samples).toBeGreaterThan(warmSamples);
    // `maxExactMs`, not `maxMs`: every threshold comparison in this file reads
    // the raw double, so the control is graded on the same quantity the
    // criterion is (see the header note on defect G1).
    expect(d.maxExactMs, `${ENGINE_LABEL}: the probe missed a 120 ms block`).toBeGreaterThanOrEqual(
      LONG_TASK_MS,
    );
    expect(d.longTasks, "the probe recorded no long task despite a 120 ms block").toBeGreaterThan(0);
  }, 60_000);

  it("stays long-task-free while a worker streams frames every tick", async () => {
    let framesSeen = 0;
    let residentsTouched = 0;
    let occupancySum = 0;

    const onMessage = (m: StreamMessage): void => {
      if (m.kind !== "frames") {
        return;
      }
      framesSeen += m.batch.frameCount;
      // Do what a renderer does: walk the payload. A handler that ignored the
      // buffers would measure an idle thread.
      const { positions, states, occupancy } = m.batch;
      for (let i = 0; i < states.length; i++) {
        if (positions[2 * i]! < 0 && states[i]! < 8) {
          residentsTouched++;
        }
      }
      for (let j = 0; j < occupancy.length; j++) {
        occupancySum += occupancy[j]!;
      }
    };

    const w = await startWorker(onMessage);
    try {
      // 800 residents, 24 simulated hours, a frame EVERY tick in batches of one:
      // the highest message rate the protocol can produce.
      await w.api.init(initPayload({ numAgents: 800, simulationHours: 24 }));

      const observer = startLongTaskObserver();
      const probe = new MainThreadProbe();
      probe.start();
      const summary = await w.api.run({
        sliceTicks: 30,
        frameEveryTicks: 1,
        frameBatchSize: 1,
        metricBatchSize: 1,
        snapshotEveryTicks: 120,
      });
      const dist = probe.stop();
      const longTaskEntries = observer?.stop() ?? null;

      // eslint-disable-next-line no-console -- the distribution IS the deliverable.
      console.log(
        `[wp10-uithread] ${ENGINE_LABEL}`,
        JSON.stringify({
          ...dist,
          framesSeen,
          bytesReceived: w.bytes(),
          workerRunMs: round(summary.runMs),
          workerTicks: summary.tick,
          residentsTouched,
          occupancySum,
          longtaskObserverEntries: longTaskEntries === null ? "unsupported" : longTaskEntries.length,
          longtaskObserverMaxMs:
            longTaskEntries === null || longTaskEntries.length === 0
              ? null
              : round(Math.max(...longTaskEntries)),
        }),
      );

      // --- non-vacuity: the worker really was under load -------------------
      expect(summary.tick, "the worker did not run").toBe(24 * 60);
      expect(framesSeen, "no frames reached the UI thread").toBeGreaterThan(1000);
      expect(w.bytes(), "no payload bytes reached the UI thread").toBeGreaterThan(5_000_000);
      expect(residentsTouched, "the handler did not walk the payload").toBeGreaterThan(100_000);
      expect(dist.samples, "the probe collected too few samples to be a distribution").toBeGreaterThan(
        200,
      );
      expect(dist.windowMs, "the measurement window was too short").toBeGreaterThan(200);

      // --- the instrument does not contradict itself ------------------------
      // Defect G1: the count and the maximum must be two readings of ONE
      // quantity. If they ever disagree the two criterion assertions below are
      // asserting different things and the verdict is unreadable, so that is
      // caught here, before the verdict, with a message that names it.
      expect(
        dist.longTasks === 0,
        `${ENGINE_LABEL}: the instrument contradicted itself — longTasks=${dist.longTasks} but ` +
          `maxExactMs=${dist.maxExactMs} (rendered ${dist.maxMs}) against a ${LONG_TASK_MS} ms ` +
          "threshold. The count and the maximum must be read off the same number.",
      ).toBe(dist.maxExactMs < LONG_TASK_MS);

      // --- the criterion ----------------------------------------------------
      expect(
        dist.longTasks,
        `${ENGINE_LABEL}: ${dist.longTasks} main-thread gap(s) >= ${LONG_TASK_MS} ms while ` +
          `streaming ${framesSeen} frames (max ${dist.maxMs} ms, p99 ${dist.p99Ms} ms)`,
      ).toBe(0);
      // `maxExactMs`, never the rounded `maxMs` — a 49.9951 ms worst gap is not
      // a long task and must not be rounded into one (header note, defect G1).
      expect(
        dist.maxExactMs,
        `${ENGINE_LABEL}: worst main-thread gap ${dist.maxMs} ms`,
      ).toBeLessThan(LONG_TASK_MS);
    } finally {
      w.terminate();
    }
  }, 300_000);

  it("transfers frame buffers instead of copying them", async () => {
    // The mechanism, proved in this engine: a transferred ArrayBuffer is
    // DETACHED on the sender's side. If the protocol copied instead, the
    // sender's view would survive — and a 6 MB-per-second copy would be exactly
    // the thing that puts a long task on the UI thread.
    const ch = new MessageChannel();
    const payload = new Float64Array(1024);
    payload[0] = 42;
    const buffer = payload.buffer;
    expect(buffer.byteLength).toBe(8192);
    const received = new Promise<number>((resolve) => {
      ch.port1.onmessage = (ev: MessageEvent<{ buf: ArrayBuffer }>): void => {
        resolve(new Float64Array(ev.data.buf)[0]!);
      };
      ch.port1.start();
    });
    ch.port2.postMessage({ buf: buffer }, [buffer]);
    expect(buffer.byteLength, `${ENGINE_LABEL}: the buffer was copied, not transferred`).toBe(0);
    expect(await received).toBe(42);
    ch.port1.close();
    ch.port2.close();
  }, 60_000);

  it("a paused worker stops streaming promptly", async () => {
    // Responsiveness of the control channel, not just the stream: `pause` is
    // answered at the next slice boundary, and the plan's whole reason for
    // slicing is that the UI must be able to stop a run.
    const w = await startWorker();
    try {
      await w.api.init(initPayload({ numAgents: 400, simulationHours: 24 }));
      const running = w.api.run({ sliceTicks: 60, frameEveryTicks: 30, snapshotEveryTicks: 0 });
      await w.api.pause();
      const t0 = performance.now();
      const s = await running;
      const elapsed = performance.now() - t0;
      // eslint-disable-next-line no-console -- the latency is the measurement.
      console.log(
        `[wp10-pause] ${ENGINE_LABEL}`,
        JSON.stringify({ pauseLatencyMs: round(elapsed), tickAtPause: s.tick, phase: s.phase }),
      );
      expect(s.phase).toBe("paused");
      expect(s.tick, "pause did not stop the run early").toBeLessThan(24 * 60);
      expect(elapsed, "pause took longer than a frame budget to be honoured").toBeLessThan(250);
    } finally {
      w.terminate();
    }
  }, 300_000);
});

/**
 * Defect G1, pinned.
 *
 * The criterion above is two assertions, `longTasks === 0` and `max < 50`. They
 * are only one criterion if they are two readings of the same number. They were
 * not: the count read the raw gap and the maximum read `Number(g.toFixed(2))`,
 * and rounding is precisely the operation that moves a value across the
 * threshold it is about to be compared to.
 *
 * These cases are the boundary, driven through the real `summarise()` — no
 * browser, no worker, ~1 ms — so the pair cannot drift apart again without a
 * red test naming the reason. Every rounded value below was measured with
 * `Number(x.toFixed(2))` in V8 rather than reasoned about, because binary
 * doubles decide the half-way cases and intuition gets them wrong: 49.995 is
 * stored as 49.994999999999998863 and rounds DOWN, so the contradiction window
 * is not the decimal interval one would guess.
 */
describe(`the long-task threshold is read off ONE number [${ENGINE_LABEL}]`, () => {
  /**
   * `gap → [rounded, longTasks]`. Rounding is *display*; the count and the
   * verdict are the raw gap. The `rounded` column is asserted so that the reason
   * `maxMs` may not be compared to a threshold stays visible in the test.
   */
  const CASES: ReadonlyArray<readonly [gap: number, rounded: number, longTasks: number]> = [
    [49.99, 49.99, 0],
    [49.994, 49.99, 0],
    // Rounds DOWN despite the decimal spelling — 49.995 is not representable.
    [49.995, 49.99, 0],
    // The observed WebKit case: NOT a long task, but renders as exactly "50".
    [49.9951, 50, 0],
    [49.99999, 50, 0],
    // `>=` is the threshold, so 50 itself IS a long task.
    [50, 50, 1],
    [50.004, 50, 1],
    [50.005, 50.01, 1],
    [120.4567, 120.46, 1],
  ];

  it("counts a gap as a long task if and only if the exact gap is >= 50 ms", () => {
    for (const [gap, rounded, longTasks] of CASES) {
      const d = summarise([0.1, gap, 0.2], 1000);
      expect(d.maxExactMs, `gap ${gap}: maxExactMs must be the raw double`).toBe(gap);
      expect(d.maxMs, `gap ${gap}: rendered value`).toBe(rounded);
      expect(d.longTasks, `gap ${gap}: long-task count`).toBe(longTasks);
    }
  });

  it("never lets the count and the maximum disagree about the threshold", () => {
    // The invariant the live criterion depends on, over the whole boundary.
    for (const [gap] of CASES) {
      const d = summarise([0.1, gap, 0.2], 1000);
      expect(d.longTasks === 0, `gap ${gap}: the two criterion assertions disagree`).toBe(
        d.maxExactMs < LONG_TASK_MS,
      );
    }
  });

  it("reproduces the contradiction the OLD reading produced, so the fix cannot be undone quietly", () => {
    // This is the defect itself, executed. `maxMs` is retained for display and
    // still rounds 49.9951 up to 50; asserting `maxMs < 50` therefore still
    // fails on a sample that carries zero long tasks. That is why the criterion
    // reads `maxExactMs`, and this case fails the moment anyone points the
    // criterion back at `maxMs`.
    const d = summarise([0.1, 49.9951, 0.2], 1000);
    expect(d.longTasks, "the sample contains no long task").toBe(0);
    expect(d.maxMs, "the rendered maximum still rounds up to the threshold").toBe(LONG_TASK_MS);
    expect(d.maxMs < LONG_TASK_MS, "the OLD assertion was false on a passing sample").toBe(false);
    // …and the value the criterion actually reads is on the right side of it.
    expect(d.maxExactMs).toBeLessThan(LONG_TASK_MS);
  });

  it("is not vacuous — an empty sample yields NaN rather than a passing zero", () => {
    const d = summarise([], 1000);
    expect(d.samples).toBe(0);
    expect(Number.isNaN(d.maxExactMs)).toBe(true);
    // NaN < 50 is false, so an empty distribution can never pass the criterion
    // by having "no gaps over the threshold".
    expect(d.maxExactMs < LONG_TASK_MS).toBe(false);
  });
});
