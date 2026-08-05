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
 * ## What causes it — and it is NOT the frame stream, NOR (withdrawn) the ring
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
 * reports `max 12 ms, 0 long tasks`.
 *
 * **This file used to continue: "what costs 157 ms is the snapshot ring at
 * production population (228 snapshots, 122 MB) combined with the short slice
 * cadence… the signature is a Firefox garbage collection over the worker's ring
 * stalling the page." That attribution is WITHDRAWN.** It is quoted rather than
 * silently deleted because a gate that changes its story without saying so is
 * worse than one that shows its working. `DR-WP10-uithread-perf` §7 disproves
 * it: every
 * cell of the 2x2 above was a single run of a bimodal event, and every cell that
 * stalled happened to be the first run in its page. Holding the ring's footprint
 * fixed and varying its churn 16x changes nothing (57 snapshots / 126 MB → 18 ms,
 * 0 long tasks; 911 snapshots / 144 MB → 11 ms, 0). Removing the ring **and** the
 * frames from a cold page does not help: 153–158 ms, 2 long tasks, with a ring of
 * 0 MB. And the same gated configuration is clean on its second and third run in
 * the same page (23 ms, 15 ms).
 *
 * What the DR measured instead, and what this file must not be read as
 * contradicting: on a cold Firefox page the accepted probe records **138–143 ms
 * followed by 64–65 ms, three runs out of three, at t ≈ 3.4 s and t ≈ 4.9 s, with
 * no worker, no simulation, no frame stream and no ring — nothing under test at
 * all.** Inside the gap: zero messages handled, 0.00 ms of handler self-time, one
 * animation-frame callback that did nothing, and `requestAnimationFrame` itself
 * stalled alongside. Read literally, therefore, **the clause this file gates is
 * false on Firefox and no change to `websim` can make it true.** DR §8 sets out
 * what closing it would require — a differential empty-page control, which is a
 * renegotiation of a WP10 acceptance criterion and needs sign-off under plan
 * §9.3, not an edit made inside this file.
 *
 * **That sign-off has now happened: `docs/DR-WP10-clause2-decision.md`,
 * researcher decision 2026-08-04.** The clause is restated as 2a (budget gated,
 * Chromium only) and 2b (measured and reported, ungated, Firefox and WebKit).
 * This file implements exactly that: the criterion assertions below execute when
 * `GATES_LONG_TASK_BUDGET` is true; every other assertion — non-vacuity, the
 * positive control, the probe-tail guard — still gates in all three engines. The
 * measurements and history in this header are retained untouched because they
 * are the evidence the decision was made on.
 *
 * One consequence follows immediately and is not optional: **this gate is
 * non-deterministic.** Of five isolated Firefox runs of the gated configuration
 * on 2026-08-03, three were red and two would have passed. Isolated re-runs on
 * the same box the same day: Firefox 2/150, 2/206, 2/158 (three of three red);
 * WebKit 0/41, 0/35, 0/38 (three of three green, but with 158–172 gaps at or over
 * half the budget and p99.9 at 26 ms — no headroom, which is itself the finding);
 * Chromium 0/5.6, 0/5.9, 0/5.7.
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

import type { RunStatus, StreamMessage } from "../../src/worker/protocol.js";
import { ENGINE_LABEL, GATES_LONG_TASK_BUDGET, initPayload, startWorker } from "./harness.js";
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
    let settled: RunStatus | null = null;

    const onMessage = (m: StreamMessage): void => {
      if (m.kind === "status" && m.phase === "finished") {
        settled = m;
        return;
      }
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
        // Explicit, though `0` is also the shipped default: this gate measures
        // the UNCAPPED path on purpose. `maxFramesPerSecond` (DR-WP10 §8.3 D1)
        // would cut the payload this thread absorbs by ~8x, and turning it on
        // here would be shrinking the workload to pass — the exact move DR §8.4
        // rules out. The ceiling's own effect is measured, separately and
        // without a budget attached, in `profile/wp10-cap.profile.ts`.
        maxFramesPerSecond: 0,
      });
      const dist = probe.stop();

      // Let the STREAM finish arriving before reading any counter off it.
      //
      // `await w.api.run(...)` returns over Comlink's own MessageChannel;
      // nothing orders that reply against the last `postMessage` on the
      // unrelated stream port, so the frame counters can legitimately be short
      // when the reply lands. Measured here 2026-08-03: an isolated Firefox run
      // reported `framesSeen` 27,299 of 27,300 and failed the non-vacuity guard
      // — masking the long-task result, which was ALSO red in that run. The
      // hazard is the one `compare.worker.test.ts`'s `awaitStreamTick` documents
      // and waits out; this file did not, and that was a defect in the gate.
      //
      // The wait is deliberately AFTER `probe.stop()`, so it is outside the
      // measurement window and cannot flatter or worsen a single gap. Ports
      // deliver in order and `SimHost.run` flushes the streams before emitting
      // the terminal status, so that status arriving means every frame did.
      const drainDeadline = performance.now() + 30_000;
      while (settled === null && performance.now() < drainDeadline) {
        await new Promise<void>((r) => setTimeout(r, 5));
      }
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
      expect(
        settled,
        "the worker's stream never delivered a finished status, so the frame counters below " +
          "would be read mid-flight",
      ).not.toBeNull();
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

      // --- the criterion (clause 2a: gated on Chromium only) -----------------
      // History, kept because the numbers justify the gating: Firefox was red
      // always (2 long tasks, 150-206 ms isolated on 2026-08-03), WebKit
      // whenever the box was shared. The header's original attribution to the
      // snapshot ring is WITHDRAWN; DR-WP10-uithread-perf §6.3 reproduces the
      // same 138-143 ms signature on a cold Firefox page with no worker and
      // nothing under test, so this assertion was measuring the browser as much
      // as the code.
      //
      // An earlier revision of this comment listed "narrowing the clause to
      // Chromium" among five dishonest moves. The dishonest version was
      // narrowing it SILENTLY, inside this file. What happened instead is the
      // §9.3 route this comment demanded: docs/DR-WP10-clause2-decision.md,
      // researcher sign-off 2026-08-04 — budget gated on Chromium (2a), the
      // identical measurement still taken and PRINTED on Firefox and WebKit
      // (2b), thresholds/population/horizon/probe untouched, and the
      // three-engine determinism matrix deliberately kept. The differential
      // empty-page control (DR §8.1) was considered and not chosen: both of its
      // arms sit on a positional, bimodal cold-start event, so it is
      // noise-dominated in exactly the runs that matter.
      if (GATES_LONG_TASK_BUDGET) {
        expect(
          dist.longTasks,
          `${ENGINE_LABEL}: ${dist.longTasks} main-thread gap(s) >= ${LONG_TASK_MS} ms at ` +
            `${RESIDENTS} residents / ${HOURS} h (max ${dist.maxMs} ms, p99.9 ${dist.p999Ms} ms, ` +
            `worst: ${dist.worstMs.join(", ")} ms). The WP10 clause 2a "UI thread long-task-free ` +
            `(< 50 ms) at max speed, on Chromium" does not hold at production scale.`,
        ).toBe(0);
        expect(
          dist.maxMs,
          `${ENGINE_LABEL}: worst main-thread gap ${dist.maxMs} ms at production scale`,
        ).toBeLessThan(LONG_TASK_MS);
      } else {
        // eslint-disable-next-line no-console -- clause 2b: reported, not gated.
        console.log(
          `[wp10-uithread-scale] ${ENGINE_LABEL} clause 2b (reported, ungated): ` +
            `${dist.longTasks} gap(s) >= ${LONG_TASK_MS} ms, max ${dist.maxMs} ms, ` +
            `worst: ${dist.worstMs.join(", ")} ms — see docs/DR-WP10-clause2-decision.md`,
        );
      }
    } finally {
      w.terminate();
    }
  }, 1_800_000);
});
