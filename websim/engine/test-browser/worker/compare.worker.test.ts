/**
 * WP10 acceptance criterion 3, in three real browsers:
 *
 * > Compare runs two synced workers.
 *
 * ## What this file is for
 *
 * Nothing else in the suite covers this clause, and two nearby tests look as if
 * they might. They do not:
 *
 *  - `engine/test/worker/api.test.ts > "keeps streaming after a second init —
 *    the Compare re-run case"` uses **one** `SimWorkerApi`, two configurations,
 *    sequentially, in Node. It proves the sink survives a re-`init`; it says
 *    nothing about two workers, and nothing about them being in step.
 *  - `snapshot.worker.test.ts`'s positive control does start two workers, but at
 *    **different seeds**, and asserts that they *differ*. That is the negative
 *    of this clause.
 *
 * So the clause is measured here, and only here.
 *
 * ## What "two synced workers" is taken to mean
 *
 * Compare drives two independent engines from one timeline. Three things have to
 * be true and each is asserted separately, because each can break without the
 * others:
 *
 *  1. **Synchronised clocks.** The UI commands both sides to a common tick and
 *     both *land on it exactly* — not near it, not at the next slice boundary.
 *     Asserted at six stops, on the control channel (`RunSummary.tick`) and
 *     independently on the stream channel (the last `RunStatus` each worker
 *     pushed down its own `MessagePort`), because a Compare screen reads the
 *     stream, not the RPC return value.
 *  2. **Byte identity at the same seed.** Two separate `Worker`s, two separate
 *     module graphs, two separate heaps, same configuration → the same SHA-256
 *     over the complete reflective state, at every stop. This is the property
 *     that lets Compare attribute a delta to the configuration rather than to
 *     the process it happened to run in.
 *  3. **Divergence at a different seed.** Without it, 1 and 2 could both hold
 *     because the digest is a constant.
 *
 * ## Non-vacuity
 *
 * Three separate guards, because "two digests agreed" is worthless if the runs
 * did nothing:
 *
 *  - the six stop digests must be **six distinct values**, so the comparison is
 *    shown to discriminate along the axis it is used on;
 *  - both workers' `RunCensus` must pass {@link assertWorldIsExercised}, which
 *    requires admissions, refusals, belief sets, advanced decision streams,
 *    fired closure waves and a non-empty blocked set;
 *  - both workers must actually have streamed frames and metrics to their own
 *    port, since a Compare screen that renders nothing is not a Compare screen.
 *
 * ## Independence
 *
 * `two workers are two engines, not one aliased proxy` advances **one** side
 * past the other and requires the other to stay put. Without it, every equality
 * above would still pass if `startWorker` handed back the same worker twice.
 */

import { describe, expect, it } from "vitest";

import { assertWorldIsExercised } from "../../test/worker/world.js";
import type { RunStatus, StreamMessage } from "../../src/worker/protocol.js";
import { ENGINE_LABEL, initPayload, startWorker, type WorkerHandle } from "./harness.js";

/**
 * Six synchronisation points across a 720-tick run.
 *
 * Uneven on purpose — gaps of 120, 120, 120, 180, 120 ticks, some shorter than
 * the 240-tick slice and one longer — so a stop is reached both inside a slice
 * and after a full one, and neither case is the only one exercised. The last is
 * the horizon, so the final comparison is of two completed runs.
 */
const STOPS: readonly number[] = [60, 180, 300, 420, 600, 720];

const RUN = { sliceTicks: 240, frameEveryTicks: 60, frameBatchSize: 4, snapshotEveryTicks: 60 } as const;

/** The newest `RunStatus` this worker pushed down its own stream port, or `null`. */
function lastStatus(w: WorkerHandle): RunStatus | null {
  for (let i = w.messages.length - 1; i >= 0; i--) {
    const m: StreamMessage = w.messages[i]!;
    if (m.kind === "status") {
      return m;
    }
  }
  return null;
}

/**
 * Wait for `w`'s **stream** to deliver the status that settles the run at
 * `tick`, then return it.
 *
 * Two things make this a wait rather than a read, and both were found by running
 * it, not by reasoning about it:
 *
 *  1. The control channel and the stream are different ports by design
 *     (`protocol.ts`), and nothing orders a Comlink reply against a
 *     `postMessage` on an unrelated `MessagePort`. `await api.run(...)`
 *     resolving does not mean the matching `RunStatus` has reached the page:
 *     reading synchronously found Firefox still at tick 0 and WebKit a whole
 *     stop behind.
 *  2. `SimHost.run` emits `RunStatus` **twice** at the last tick when the slice
 *     boundary and the stop coincide — once with `phase: "running"` at the end
 *     of the slice, then once with the settled phase after the loop. Both carry
 *     the same tick, so "the newest status with this tick" is ambiguous for as
 *     long as the second is in flight, and two workers could legitimately be
 *     read one on each side of it. `phase !== "running"` names the terminal one;
 *     `SimHost.run` always settles to `paused` or `finished`, never `running`.
 *
 * The 10 s bound is a delivery budget, not a tolerance: the tick and the phase
 * are still compared for exact equality, and a stream that never converges fails
 * with the last thing it did say.
 *
 * Because a single `MessagePort` delivers in order, the terminal status for tick
 * T having arrived also means every frame, metric and wave event the worker
 * emitted before it has arrived. That is what makes the frame-count comparisons
 * at the end of the lockstep case safe to read.
 */
async function awaitStreamTick(w: WorkerHandle, tick: number, label: string): Promise<RunStatus> {
  const deadline = performance.now() + 10_000;
  for (;;) {
    const s = lastStatus(w);
    if (s !== null && s.tick === tick && s.phase !== "running") {
      return s;
    }
    if (performance.now() > deadline) {
      throw new Error(
        `${ENGINE_LABEL}: worker ${label}'s stream never settled at tick ${tick} within 10 s ` +
          `(last status: ${s === null ? "none at all" : `tick ${s.tick}, phase ${s.phase}`})`,
      );
    }
    await new Promise<void>((r) => {
      setTimeout(r, 0);
    });
  }
}

function countKind(w: WorkerHandle, kind: StreamMessage["kind"]): number {
  return w.messages.filter((m) => m.kind === kind).length;
}

/** Advance both sides to `tick` concurrently — the way Compare drives them. */
async function stepBoth(a: WorkerHandle, b: WorkerHandle, tick: number): Promise<void> {
  await Promise.all([a.api.run({ ...RUN, untilTick: tick }), b.api.run({ ...RUN, untilTick: tick })]);
}

describe(`Compare runs two synced workers [${ENGINE_LABEL}]`, () => {
  it("two workers advance in lockstep and agree byte for byte at every stop", async () => {
    const a = await startWorker();
    const b = await startWorker();
    try {
      // Two SEPARATE Workers. Not one worker with two hosts, and not one host
      // re-initialised: Compare shows two engines running side by side.
      expect(a.api, "the harness handed back one api twice").not.toBe(b.api);

      await Promise.all([a.api.init(initPayload()), b.api.init(initPayload())]);

      const digests: string[] = [];
      for (const stop of STOPS) {
        await stepBoth(a, b, stop);

        // --- 1. synchronised clocks, on the control channel ------------------
        const [sa, sb] = await Promise.all([a.api.summary(), b.api.summary()]);
        expect(sa.tick, `${ENGINE_LABEL}: worker A overshot or undershot stop ${stop}`).toBe(stop);
        expect(sb.tick, `${ENGINE_LABEL}: worker B overshot or undershot stop ${stop}`).toBe(stop);
        expect(sb.endTick, `${ENGINE_LABEL}: the two workers disagree about the horizon`).toBe(sa.endTick);
        expect(sb.phase, `${ENGINE_LABEL}: the two workers are in different phases at ${stop}`).toBe(sa.phase);
        expect(
          sb.framesEmitted,
          `${ENGINE_LABEL}: the two workers emitted different frame counts by ${stop}`,
        ).toBe(sa.framesEmitted);

        // --- 1b. synchronised clocks, on the STREAM channel -------------------
        // What a Compare screen actually reads. A control channel that agreed
        // while the two streams disagreed would still show two clocks drifting.
        const [qa, qb] = await Promise.all([awaitStreamTick(a, stop, "A"), awaitStreamTick(b, stop, "B")]);
        expect(qa.tick, `${ENGINE_LABEL}: A's stream clock disagrees with its own summary`).toBe(stop);
        expect(qb.tick, `${ENGINE_LABEL}: B's stream clock lags A at stop ${stop}`).toBe(qa.tick);
        expect(qb.phase, `${ENGINE_LABEL}: the two streams report different phases at ${stop}`).toBe(qa.phase);
        expect(qb.hour, `${ENGINE_LABEL}: the two streams report different hours at ${stop}`).toBe(qa.hour);
        expect(qb.keyframeTicks, `${ENGINE_LABEL}: the scrub rails differ at ${stop}`).toEqual(
          qa.keyframeTicks,
        );

        // --- 2. byte identity at the same seed --------------------------------
        const [da, db] = await Promise.all([a.api.digest(), b.api.digest()]);
        expect(da, "digest must be a SHA-256 hex string").toMatch(/^[0-9a-f]{64}$/u);
        if (da !== db) {
          const [ta, tb] = await Promise.all([a.api.digestTokens(), b.api.digestTokens()]);
          let delta = "no token differs, yet the digests do";
          for (let i = 0; i < Math.min(ta.length, tb.length); i++) {
            if (ta[i] !== tb[i]) {
              delta = `token ${i}: ${ta[i]} != ${tb[i]}`;
              break;
            }
          }
          throw new Error(
            `${ENGINE_LABEL}: the two synced workers diverged at tick ${stop}. ${delta}`,
          );
        }
        digests.push(da);
      }

      // eslint-disable-next-line no-console -- the lockstep trace IS the evidence.
      console.log(
        `[wp10-compare] ${ENGINE_LABEL}`,
        JSON.stringify({ stops: STOPS, digests: digests.map((d) => d.slice(0, 12)) }),
      );

      // --- non-vacuity ---------------------------------------------------------
      expect(
        new Set(digests).size,
        `${ENGINE_LABEL}: the stop digests are not all distinct, so agreeing about them proves nothing`,
      ).toBe(STOPS.length);

      const [ca, cb] = await Promise.all([a.api.census(), b.api.census()]);
      assertWorldIsExercised(ca, (cond, msg) => {
        expect(cond, `${ENGINE_LABEL}: worker A ${msg}`).toBe(true);
      });
      assertWorldIsExercised(cb, (cond, msg) => {
        expect(cond, `${ENGINE_LABEL}: worker B ${msg}`).toBe(true);
      });
      expect(cb, `${ENGINE_LABEL}: identical configurations produced different censuses`).toEqual(ca);

      for (const [label, w] of [
        ["A", a],
        ["B", b],
      ] as const) {
        expect(countKind(w, "frames"), `${ENGINE_LABEL}: worker ${label} streamed no frames`).toBeGreaterThan(
          0,
        );
        expect(
          countKind(w, "metrics"),
          `${ENGINE_LABEL}: worker ${label} streamed no metrics`,
        ).toBeGreaterThan(0);
        expect(countKind(w, "wave"), `${ENGINE_LABEL}: worker ${label} streamed no wave events`).toBeGreaterThan(
          0,
        );
      }
      expect(
        countKind(b, "frames"),
        `${ENGINE_LABEL}: the two Compare panes received different numbers of frame batches`,
      ).toBe(countKind(a, "frames"));
    } finally {
      a.terminate();
      b.terminate();
    }
  }, 300_000);

  it("two workers are two engines, not one aliased proxy", async () => {
    // Guards every equality in the lockstep case: if `startWorker` returned the
    // same engine twice, all of them would pass for the wrong reason.
    const a = await startWorker();
    const b = await startWorker();
    try {
      await Promise.all([a.api.init(initPayload()), b.api.init(initPayload())]);
      await stepBoth(a, b, 300);
      expect(await a.api.summary().then((s) => s.tick)).toBe(300);
      expect(await b.api.summary().then((s) => s.tick)).toBe(300);

      // Move ONE side. The other must not follow.
      await a.api.run({ ...RUN, untilTick: 480 });
      expect(await a.api.summary().then((s) => s.tick)).toBe(480);
      expect(
        await b.api.summary().then((s) => s.tick),
        `${ENGINE_LABEL}: advancing worker A moved worker B — these are not two engines`,
      ).toBe(300);
      expect(
        await b.api.digest(),
        `${ENGINE_LABEL}: two workers at different ticks produced the same bytes`,
      ).not.toBe(await a.api.digest());

      // And they resynchronise: bringing B up to A restores identity.
      await b.api.run({ ...RUN, untilTick: 480 });
      expect(await b.api.summary().then((s) => s.tick)).toBe(480);
      expect(
        await b.api.digest(),
        `${ENGINE_LABEL}: the two workers did not resynchronise at tick 480`,
      ).toBe(await a.api.digest());
    } finally {
      a.terminate();
      b.terminate();
    }
  }, 300_000);

  it("the same lockstep at different seeds diverges at every stop (positive control)", async () => {
    // Without this, "the digests matched" could mean "the digest is a constant".
    const a = await startWorker();
    const b = await startWorker();
    try {
      await Promise.all([
        a.api.init(initPayload({ randomSeed: 42 })),
        b.api.init(initPayload({ randomSeed: 43 })),
      ]);
      const seen: string[] = [];
      for (const stop of STOPS) {
        await stepBoth(a, b, stop);
        const [sa, sb] = await Promise.all([a.api.summary(), b.api.summary()]);
        // The clocks still synchronise — only the bytes may differ. A control
        // that also broke the clocks would not isolate the seed.
        expect(sa.tick).toBe(stop);
        expect(sb.tick).toBe(stop);
        const [da, db] = await Promise.all([a.api.digest(), b.api.digest()]);
        expect(
          db,
          `${ENGINE_LABEL}: seeds 42 and 43 produced identical bytes at tick ${stop} — the digest ` +
            "does not discriminate, so the byte-identity assertions above are vacuous",
        ).not.toBe(da);
        seen.push(`${da.slice(0, 6)}!=${db.slice(0, 6)}`);
      }
      // eslint-disable-next-line no-console -- the control's own numbers.
      console.log(`[wp10-compare-control] ${ENGINE_LABEL}`, JSON.stringify(seen));
    } finally {
      a.terminate();
      b.terminate();
    }
  }, 300_000);
});
