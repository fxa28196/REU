/**
 * The one-configuration runner shared by the WP10 profile files.
 *
 * Extracted verbatim from `wp10-uithread.profile.ts` so the replicate pass in
 * `wp10-replicate.profile.ts` measures the identical thing rather than a second
 * copy that can drift. Nothing here asserts a budget; see the header of
 * `wp10-uithread.profile.ts`.
 */

import { expect } from "vitest";

import {
  AttributingProbe,
  ENGINE,
  initPayload,
  sendCadence,
  startProfiledWorker,
  summarise,
  type ProfileResult,
} from "./instrument.js";
import type { TransferAudit } from "./profileWorker.js";

export const RESIDENTS = 6842;
export const HOURS = 455;

export interface Cfg {
  readonly sliceTicks: number;
  readonly frameEveryTicks: number;
  readonly frameBatchSize: number;
  readonly metricBatchSize: number;
  readonly snapshotEveryTicks: number;
  /**
   * Display-cadence ceiling, frames per wall-clock second. Omitted (or `0`) is
   * the shipped default and is what every cell measured for
   * DR-WP10-uithread-perf used, so those numbers stay comparable.
   */
  readonly maxFramesPerSecond?: number;
}

/** The configuration the gated test uses, i.e. the one that is red. */
export const GATED: Cfg = {
  sliceTicks: 30,
  frameEveryTicks: 1,
  frameBatchSize: 1,
  metricBatchSize: 1,
  snapshotEveryTicks: 120,
};

/** Sends the worker made inside an absolute-time window. */
export function sendsInWindow(audit: TransferAudit, absStart: number, absEnd: number): number {
  let n = 0;
  for (let i = 0; i < audit.recorded; i++) {
    const t = audit.sendTimes[i]!;
    if (t >= absStart && t <= absEnd) {
      n++;
    }
  }
  return n;
}

export async function runConfig(
  label: string,
  cfg: Cfg,
  opts: { residents?: number; hours?: number; walkPayload?: boolean } = {},
): Promise<void> {
  const residents = opts.residents ?? RESIDENTS;
  const hours = opts.hours ?? HOURS;
  const probe = new AttributingProbe();
  const w = await startProfiledWorker(probe, {
    ...(opts.walkPayload === undefined ? {} : { walkPayload: opts.walkPayload }),
  });
  try {
    await w.api.init(initPayload({ numAgents: residents, simulationHours: hours }));
    await w.api.resetAudit();

    const mainOrigin = performance.timeOrigin;
    probe.start();
    const summary = await w.api.run(cfg);
    const stopped = probe.stop();
    const ring = await w.api.ringStats();
    const audit = await w.api.transferAudit();
    const result: ProfileResult = summarise(stopped, w);

    // Was the WORKER still emitting while the main thread was stalled? If yes,
    // the main thread was blocked and the queue backed up behind it. If no, the
    // stall was not confined to the page.
    const gapRows = result.gaps.map((g) => {
      const absEnd = mainOrigin + g.endMs;
      return {
        gapMs: g.gapMs,
        msgs: g.messages,
        frameMsgs: g.frameMessages,
        mb: Number((g.bytes / 1e6).toFixed(2)),
        handlerMs: g.handlerMs,
        unaccountedMs: g.unaccountedMs,
        rafs: g.rafs,
        workerSendsInGap: sendsInWindow(audit, absEnd - g.gapMs, absEnd),
      };
    });

    // eslint-disable-next-line no-console -- the distribution IS the deliverable.
    console.log(
      `[wp10-profile] ${ENGINE} ${label}`,
      JSON.stringify({
        engine: ENGINE,
        label,
        cfg,
        residents,
        hours,
        walkPayload: opts.walkPayload ?? true,
        gaps: {
          samples: result.samples,
          p50: result.p50Ms,
          p99: result.p99Ms,
          p999: result.p999Ms,
          max: result.maxMs,
          longTasks: result.longTasks,
          over25: result.over25Ms,
          windowMs: result.windowMs,
          worst: result.worstMs,
        },
        stream: {
          messages: result.messages,
          frameMessages: result.frameMessages,
          framesSeen: result.framesSeen,
          bytesReceived: result.bytesReceived,
          bytesPerFrameMessage: result.bytesPerFrameMessage,
          messagesPerSecond: result.messagesPerSecond,
          megabytesPerSecond: result.megabytesPerSecond,
          maxMessageBurst: result.maxMessageBurst,
        },
        handler: {
          sumMs: result.handlerMsSum,
          maxMs: result.handlerMsMax,
          p99Ms: result.handlerMsP99,
          dutyPct: result.handlerDutyPct,
        },
        paint: {
          rafCount: result.rafCount,
          rafPerSecond: result.rafPerSecond,
          rafMaxGapMs: result.rafMaxGapMs,
          framesPerPaint: result.framesPerPaint,
        },
        transfer: {
          messages: audit.messages,
          messagesWithTransfer: audit.messagesWithTransfer,
          buffersOffered: audit.buffersOffered,
          buffersDetached: audit.buffersDetached,
          buffersStillLive: audit.buffersStillLive,
          liveBytesAfterPost: audit.liveBytesAfterPost,
          viewsDetached: audit.viewsDetached,
          viewsStillLive: audit.viewsStillLive,
          transferablesOnFirstFrame: audit.transferablesOnFirstFrame,
        },
        send: sendCadence(audit),
        worker: {
          runMs: Math.round(summary.runMs),
          ticks: summary.tick,
          framesEmitted: summary.framesEmitted,
          framesSuppressed: summary.framesSuppressed,
          snapshotsTaken: summary.snapshotsTaken,
          ringApproxBytes: ring.approxBytes,
          ringSize: ring.ringSize,
          sparseSize: ring.sparseSize,
          ticksPerSecond: Math.round(summary.tick / (summary.runMs / 1000)),
        },
        witness: { residentsTouched: result.residentsTouched, occupancySum: result.occupancySum },
        gapRows,
      }),
    );

    // Non-vacuity only: the run must have happened. Nothing about the budget.
    expect(summary.tick, `${label}: the worker did not run to the horizon`).toBe(hours * 60);
    expect(result.samples, `${label}: the probe collected too few samples`).toBeGreaterThan(1000);
  } finally {
    w.terminate();
  }
}
