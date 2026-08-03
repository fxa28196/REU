/**
 * An **allocation-free** main-thread long-task probe.
 *
 * ## Why this exists next to the one in `uithread.worker.test.ts`
 *
 * That file's probe pushes every gap into a growing `number[]`. At 800 residents
 * / 24 simulated hours it collects ~10⁵ samples and the growth is invisible. At
 * production scale — 6,842 residents / 455 simulated hours — the same loop
 * collects **~10⁷** samples, and a `number[]` that reaches ten million entries
 * reallocates and copies ~84 MB *on the thread being measured*. An instrument
 * that can report its own reallocation as a long task has the one failure mode a
 * responsiveness measurement must not have, so this one cannot allocate at all.
 *
 * **That is a mechanism argument, not an observed effect, and the difference
 * matters.** Both probes were run at production scale on Firefox: the growing
 * array reported a worst gap of 178 ms, the histogram 152, 152, 174 and 183 ms
 * over four runs. The ranges overlap, so nothing here says the 800-resident
 * file's numbers were inflated, and — more importantly — it rules out the
 * comfortable explanation for the production-scale finding. The Firefox stall
 * `uithread.scale.worker.test.ts` reports is **not** the instrument.
 *
 * `uithread.worker.test.ts` is deliberately left alone. Its numbers are the
 * measurement of record for the 800-resident case and its probe is sound at that
 * sample count; changing it would invalidate an accepted result to fix a problem
 * it does not have.
 *
 * ## What it costs per sample
 *
 * One subtraction, one integer index, one array increment, two compares. No
 * allocation of any kind after `start()`, so nothing the probe does can produce
 * the event it is looking for.
 *
 * ## What it gives up
 *
 * Exact percentiles. Gaps are binned at {@link BIN_MS} and every reported
 * percentile is the bin's **upper** edge, so a percentile is never understated.
 * The two numbers the acceptance clause is actually about — the maximum gap and
 * the count of gaps at or over the threshold — are exact: the max is tracked as
 * a raw double and the counts come out of the histogram, which is lossless for
 * counting.
 */

/** Histogram resolution. 0.1 ms is finer than Firefox's and WebKit's clock. */
export const BIN_MS = 0.1;
/** Gaps at or above this go in the overflow bin; the exact max is still kept. */
export const HISTOGRAM_MAX_MS = 500;
const BINS = Math.round(HISTOGRAM_MAX_MS / BIN_MS);
/** Gaps at or above this are also kept verbatim, up to {@link TAIL_CAPACITY}. */
export const TAIL_MS = 5;
const TAIL_CAPACITY = 4096;

export interface GapDistribution {
  readonly samples: number;
  /** Bin upper edge; `NaN` with no samples. */
  readonly p50Ms: number;
  readonly p90Ms: number;
  readonly p99Ms: number;
  readonly p999Ms: number;
  /** Exact, not binned. */
  readonly maxMs: number;
  /** Exact count of gaps >= 50 ms — the acceptance clause's own number. */
  readonly longTasks: number;
  /** Exact count of gaps >= 25 ms — half the budget, i.e. the headroom signal. */
  readonly over25Ms: number;
  /** Exact count of gaps >= {@link HISTOGRAM_MAX_MS}. */
  readonly overflow: number;
  /** Wall-clock span of the measurement. */
  readonly windowMs: number;
  /** The largest individual gaps, descending, capped for readability. */
  readonly worstMs: readonly number[];
  /** Gaps >= {@link TAIL_MS} that the verbatim buffer had no room for. */
  readonly tailDropped: number;
  readonly binMs: number;
}

/**
 * A macrotask ping loop that records the gap between consecutive hops.
 *
 * Each hop is a macrotask, so the gap between two hops is time the main thread
 * spent not returning to the event loop — the definition of a long task, and
 * measurable identically in all three engines (`PerformanceObserver`'s
 * `longtask` entry type is Chromium-only). `setTimeout(0)` cannot be used: it is
 * clamped to 4 ms once nested five deep, so it could not resolve anything below
 * that floor.
 */
export class LongTaskProbe {
  private readonly hist = new Int32Array(BINS + 1);
  private readonly tail = new Float64Array(TAIL_CAPACITY);
  private readonly channel = new MessageChannel();
  private tailUsed = 0;
  private tailDropped = 0;
  private count = 0;
  private max = 0;
  private running = false;
  private last = 0;
  private started = 0;

  start(): void {
    this.running = true;
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
      if (gap >= TAIL_MS) {
        if (this.tailUsed < TAIL_CAPACITY) {
          this.tail[this.tailUsed++] = gap;
        } else {
          this.tailDropped++;
        }
      }
      if (this.running) {
        this.channel.port2.postMessage(0);
      }
    };
    this.channel.port1.start();
    this.channel.port2.postMessage(0);
  }

  /** Samples collected so far, without stopping. */
  get samples(): number {
    return this.count;
  }

  stop(): GapDistribution {
    this.running = false;
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
      .slice(0, 12)
      .map((x) => Number(x.toFixed(2)));

    return {
      samples: this.count,
      p50Ms: this.percentile(50),
      p90Ms: this.percentile(90),
      p99Ms: this.percentile(99),
      p999Ms: this.percentile(99.9),
      maxMs: Number(this.max.toFixed(2)),
      longTasks: atOrAbove(50),
      over25Ms: atOrAbove(25),
      overflow: this.hist[BINS]!,
      windowMs: Number(windowMs.toFixed(2)),
      worstMs: worst,
      tailDropped: this.tailDropped,
      binMs: BIN_MS,
    };
  }

  /** Upper edge of the bin the percentile falls in; never understates. */
  private percentile(p: number): number {
    if (this.count === 0) {
      return Number.NaN;
    }
    const target = Math.ceil((p / 100) * this.count);
    let seen = 0;
    for (let b = 0; b <= BINS; b++) {
      seen += this.hist[b]!;
      if (seen >= target) {
        return b === BINS ? this.max : Number(((b + 1) * BIN_MS).toFixed(2));
      }
    }
    return this.max;
  }
}
