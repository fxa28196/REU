/**
 * WP10 acceptance criterion 2, at the population the product ships with:
 *
 * > The UI thread stays long-task-free (< 50 ms) at max speed.
 *
 * ## Why this file exists alongside `uithread.worker.test.ts`
 *
 * That file measures the same clause at **800 residents / 24 simulated hours**.
 * Production is **6,842 residents** and up to **455 hours** — 61,606 bytes per
 * frame instead of 7,228, i.e. 8.52x the per-frame payload, over 27,300 ticks
 * instead of 1,440. At the smaller scale Firefox's worst main-thread gap was
 * already 40 ms against a 50 ms threshold: 20 % headroom at one-eighth of the
 * payload. The clause was therefore true as measured and unmeasured as
 * shipped, and nothing would have gone red if scaling broke it. This file is
 * that measurement, gated.
 *
 * The run options are **identical** to the 800-resident file's (`sliceTicks` 30,
 * a frame every tick, batches of one, `snapshotEveryTicks` 120) so that the only
 * thing that changes between the two is the scale. Anything else would make the
 * comparison meaningless.
 *
 * ## The probe
 *
 * {@link LongTaskProbe}, not the growing-array probe in the 800-resident file.
 * At this scale the loop collects ~10⁷ samples and a `number[]` that reaches ten
 * million entries reallocates ~84 MB **on the thread being measured** — an
 * instrument that can manufacture the event it is looking for. Both were run
 * here before choosing: Firefox reported 178 ms with the growing array and 152,
 * 152, 174, 183 ms with the histogram. Indistinguishable, which is the useful
 * result — the finding below survives the instrument being taken out of it. See
 * `probe.ts`.
 *
 * ## MEASURED RESULT ON THIS BOX — the clause does NOT hold at this scale
 *
 * Windows 11, 16 cores, headless, **each engine run on its own** (2026-08-03):
 *
 * ```
 * engine    samples     p50   p90   p99   p99.9  max     >=50ms  >=25ms  window
 * Chromium  9,432,875   0.1   0.1   0.1   0.2      5.8 ms      0       0   33.4 s
 * Firefox  10,931,957   0.1   0.1   0.1   1.1    183   ms      2      11   62.5 s
 * WebKit      134,618   0.1   1.1   6.1  25.1     34   ms      0     166   57.9 s
 * ```
 *
 * **Firefox exceeds the budget: two gaps at or over 50 ms, worst 183 ms — 3.7x
 * the threshold.** WebKit passes here with 32 % headroom but puts 166 gaps at or
 * over half the budget. Chromium is nowhere near the limit.
 *
 * The single-run table understates how load-dependent two of the three are, so
 * every run taken on this box is listed — isolated (one engine, this file only),
 * serialised (`--no-file-parallelism` over the whole browser suite), and three-up
 * (`npm run test:browser` as configured today, all three engines sharing 16
 * cores). Format is `longTasks / maxMs`:
 *
 * ```
 * engine    isolated                serialised        three-up
 * Chromium  0/5.7  0/5.8            0/6.4  0/6.5      0/8
 * Firefox   2/152  2/152  2/174     3/209  3/223      2/174  4/150  3/127
 *           2/183
 * WebKit    0/34   0/42             0/42   1/66       2/76   4/76   2/138
 * ```
 *
 * Read honestly, that says three different things:
 *
 *  - **Chromium passes**, with 6x headroom, under every condition.
 *  - **Firefox fails, always.** Nine runs, never fewer than two long tasks,
 *    worst gap 127–223 ms. Not jitter, not load, not the instrument.
 *  - **WebKit has no usable headroom.** It passes when it has the box to itself
 *    and crosses the threshold as soon as it does not. Calling its failures a
 *    CI artifact would be too kind: p99.9 sits at 25–28 ms with 146–452 gaps at
 *    or over half the budget, so 50 ms is inside its normal spread. The clause
 *    is *marginal* on WebKit, and marginal is a finding.
 *
 * One piece of collateral, recorded because it is caused by this file: under
 * three-up parallelism the 800-resident `uithread.worker.test.ts` now fails on
 * Firefox too (1–2 long tasks, 95–102 ms), where it passed before this file
 * existed. Its measurement window is only ~1.6 s, so one stall anywhere on the
 * box lands inside it. `--no-file-parallelism` removes that collateral (that
 * file passes in both serialised runs above) and is the recommended switch; it
 * lives in `engine/vitest.browser.config.ts`, outside this change's scope, so it
 * is recorded here rather than applied.
 *
 * ## What causes it — and it is NOT the frame stream
 *
 * A 2x2 on Firefox at the same scale, frames disabled in every cell so the UI
 * thread receives 14,560 bytes in total (measured, same box, same day):
 *
 * ```
 *                        snapshotEveryTicks 120        snapshotEveryTicks 0
 *   sliceTicks  30       max 157 ms, 2 long tasks      max 11 ms, 0
 *   sliceTicks 240       max  27 ms, 0 long tasks      max 14 ms, 0
 * ```
 *
 * The stall reproduces with **no frames at all**, so the transferable frame
 * protocol is exonerated — and separately confirmed: at max frame rate with
 * `snapshotEveryTicks: 0`, streaming the full 1.68 GB in 27,300 batches, Firefox
 * reports `max 12 ms, 0 long tasks`. What costs 157 ms is the **snapshot ring at
 * production population** (228 snapshots taken, 122 MB resident by
 * `RingStats.approxBytes`) combined with the short slice cadence, which yields
 * to the worker's event loop 910 times instead of 114. Both factors are needed;
 * neither alone exceeds 27 ms. The signature is a Firefox garbage collection
 * over the worker's ring stalling the page.
 *
 * That localisation matters for the fallback: the lever is the ring's footprint
 * and the yield cadence, not the frame protocol. Two nearby configurations were
 * measured at production scale **on Firefox**, the engine that fails, and both
 * are clean: the protocol's own defaults (a frame every 60 ticks, batches of 8,
 * 240-tick slices) give `max 11 ms, 0 long tasks`, and max frame rate with scrub
 * disabled gives `max 12 ms, 0`. Neither was measured on Chromium or WebKit —
 * both pass the gated case there, so there was nothing to localise.
 *
 * ## What this gate is and is not sensitive to
 *
 * Measured by mutation on Chromium at production scale, so that "0 long tasks"
 * is not mistaken for "the gate cannot see anything":
 *
 * ```
 * mutation                                   max      >=50ms  verdict here
 * (none, as shipped)                           5.8 ms      0  pass
 * frameBatchSize forced to 512 (10 MB/msg)    23.3 ms      0  pass
 * frameBatchSize forced to 2048 (42 MB/msg)   53.1 ms      3  RED, names the clause
 * transfer list dropped (frames COPIED)        7.1 ms      0  pass — see below
 * FrameEncoder sized 800 instead of 6,842       —          —  RED, non-vacuity guard
 * ```
 *
 * The copy-instead-of-transfer mutation does **not** trip this gate: at
 * 61,606 bytes per message a structured clone costs the UI thread far less than
 * a frame budget, and the cost that does exist lands on the worker (its run time
 * doubled, 33 s → 73 s). That defect is gated elsewhere and exactly —
 * `engine/test/worker/api.test.ts > "streams to the subscribed port, with
 * transfer lists"` asserts five transferables per frame message and goes red
 * with `expected +0 to be 5`. Recorded here so nobody reads this file as
 * covering the transfer mechanism. What it does cover is the payload a single
 * UI-thread callback has to absorb.
 *
 * ## Cost
 *
 * ~40 s (Chromium) to ~70 s (WebKit) per engine, so ~3 minutes added to
 * `npm run test:browser`. That is the price of measuring the clause where it is
 * claimed rather than at one-eighth of it. The `testTimeout` values below are
 * wall-clock budgets, not assertions — nothing here grades anything on time
 * except the main-thread gap itself.
 */

import { describe, expect, it } from "vitest";

import type { StreamMessage } from "../../src/worker/protocol.js";
import { ENGINE_LABEL, initPayload, startWorker } from "./harness.js";
import { LongTaskProbe } from "./probe.js";

/** The shipping population (plan §3.3: n = 6,842) and the longest horizon. */
const RESIDENTS = 6842;
const HOURS = 455;
const TICKS = HOURS * 60;
/** `residents * 2 * 4` position bytes + `residents` state bytes + shelters + header. */
const BYTES_PER_FRAME = 61_606;
/** What the 800-resident file measures, for the ratio assertion below. */
const SMALL_SCALE_BYTES_PER_FRAME = 7_228;

const LONG_TASK_MS = 50;

describe(`UI-thread responsiveness at PRODUCTION scale [${ENGINE_LABEL}]`, () => {
  it("the allocation-free probe detects a long task when one exists (positive control)", async () => {
    // Guards the whole file. "Zero long tasks" from a probe that cannot see one
    // is not a measurement, and this probe is new — the 800-resident file's
    // control does not cover it.
    const probe = new LongTaskProbe();
    probe.start();
    // Let the loop turn over first: the block has to fall BETWEEN two hops.
    await new Promise<void>((r) => setTimeout(r, 30));
    const warm = probe.samples;
    expect(warm, "the probe never ran").toBeGreaterThan(0);

    const spinUntil = performance.now() + 120;
    while (performance.now() < spinUntil) {
      /* deliberately blocking the event loop */
    }
    await new Promise<void>((r) => setTimeout(r, 30));

    const d = probe.stop();
    // eslint-disable-next-line no-console -- the control's own numbers.
    console.log(`[wp10-uithread-scale-control] ${ENGINE_LABEL}`, JSON.stringify(d));
    expect(d.samples).toBeGreaterThan(warm);
    expect(d.maxMs, `${ENGINE_LABEL}: the probe missed a 120 ms block`).toBeGreaterThanOrEqual(
      LONG_TASK_MS,
    );
    expect(d.longTasks, "the probe recorded no long task despite a 120 ms block").toBeGreaterThan(0);
    expect(d.worstMs[0], "the verbatim tail did not record the block").toBeGreaterThanOrEqual(LONG_TASK_MS);
  }, 120_000);

  it(`stays long-task-free streaming ${RESIDENTS} residents for ${HOURS} h at max frame rate`, async () => {
    let framesSeen = 0;
    let residentsTouched = 0;
    let occupancySum = 0;
    let residentCountSeen = 0;
    let frameBytesSeen = 0;

    const onMessage = (m: StreamMessage): void => {
      if (m.kind !== "frames") {
        return;
      }
      framesSeen += m.batch.frameCount;
      residentCountSeen = m.batch.residentCount;
      frameBytesSeen =
        m.batch.positions.byteLength +
        m.batch.states.byteLength +
        m.batch.occupancy.byteLength +
        m.batch.ticks.byteLength +
        m.batch.smokeUgM3.byteLength;
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

    // `retainMessages: false`: 27,301 retained frame batches would be 1.68 GB of
    // harness-owned memory pressure that has nothing to do with the measurement.
    const w = await startWorker(onMessage, { retainMessages: false });
    try {
      await w.api.init(initPayload({ numAgents: RESIDENTS, simulationHours: HOURS }));

      const probe = new LongTaskProbe();
      probe.start();
      const summary = await w.api.run({
        sliceTicks: 30,
        frameEveryTicks: 1,
        frameBatchSize: 1,
        metricBatchSize: 1,
        snapshotEveryTicks: 120,
      });
      const dist = probe.stop();
      const ring = await w.api.ringStats();

      // eslint-disable-next-line no-console -- the distribution IS the deliverable.
      console.log(
        `[wp10-uithread-scale] ${ENGINE_LABEL}`,
        JSON.stringify({
          ...dist,
          residents: residentCountSeen,
          hours: HOURS,
          framesSeen,
          streamMessages: w.messageCount(),
          bytesReceived: w.bytes(),
          bytesPerFrame: frameBytesSeen,
          workerRunMs: Math.round(summary.runMs),
          workerTicks: summary.tick,
          snapshotsTaken: summary.snapshotsTaken,
          ringApproxBytes: ring.approxBytes,
          residentsTouched,
          occupancySum,
        }),
      );

      // --- non-vacuity: this really was the production payload ---------------
      expect(summary.tick, "the worker did not run to the production horizon").toBe(TICKS);
      expect(residentCountSeen, "the frames did not carry the production population").toBe(RESIDENTS);
      expect(
        frameBytesSeen,
        `each frame must carry the production payload, not the 800-resident one`,
      ).toBeGreaterThanOrEqual(BYTES_PER_FRAME);
      expect(
        frameBytesSeen / SMALL_SCALE_BYTES_PER_FRAME,
        "this is supposed to be ~8.5x the payload the 800-resident file measures",
      ).toBeGreaterThan(8);
      expect(framesSeen, "the UI thread did not receive a frame per tick").toBeGreaterThanOrEqual(TICKS);
      expect(w.bytes(), "the UI thread did not receive the full stream").toBeGreaterThan(1_600_000_000);
      expect(residentsTouched, "the handler did not walk the payload").toBeGreaterThan(150_000_000);
      expect(summary.snapshotsTaken, "the scrub ring was not exercised").toBeGreaterThan(200);
      // WebKit's MessageChannel hop is ~0.4 ms, so it samples ~10^5 where the
      // other two sample ~10^7. Both are distributions; neither is one sample.
      expect(dist.samples, "the probe collected too few samples to be a distribution").toBeGreaterThan(
        20_000,
      );
      expect(dist.windowMs, "the measurement window was too short").toBeGreaterThan(20_000);
      expect(dist.tailDropped, "the verbatim tail overflowed, so `worstMs` may not hold the worst").toBe(
        0,
      );

      // --- the criterion -----------------------------------------------------
      // RED AT THE TIME OF WRITING: Firefox always (2-4 long tasks, 127-223 ms),
      // WebKit whenever the box is shared (0-4 long tasks, 34-138 ms).
      // Attributed in this file's header to the snapshot ring at production
      // population (122 MB) plus the 30-tick yield cadence, NOT to the frame
      // stream — which is exonerated by a frames-disabled control that stalls
      // just as hard and a snapshots-disabled control that streams the whole
      // 1.68 GB in 12 ms. Do not silence this by widening the threshold, by
      // shrinking the population, or by shortening the horizon: the number is
      // the finding.
      expect(
        dist.longTasks,
        `${ENGINE_LABEL}: ${dist.longTasks} main-thread gap(s) >= ${LONG_TASK_MS} ms at ` +
          `${RESIDENTS} residents / ${HOURS} h (max ${dist.maxMs} ms, p99.9 ${dist.p999Ms} ms, ` +
          `worst: ${dist.worstMs.join(", ")} ms). The WP10 clause "UI thread long-task-free ` +
          `(< 50 ms) at max speed" does not hold at production scale in this engine.`,
      ).toBe(0);
      expect(
        dist.maxMs,
        `${ENGINE_LABEL}: worst main-thread gap ${dist.maxMs} ms at production scale`,
      ).toBeLessThan(LONG_TASK_MS);
    } finally {
      w.terminate();
    }
  }, 1_800_000);
});
