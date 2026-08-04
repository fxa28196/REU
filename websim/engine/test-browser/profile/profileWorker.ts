/**
 * A **profiling** sim-worker entry point (DR-WP10-uithread-perf).
 *
 * It is byte-for-byte the shipped `simWorker.ts` except for one substitution:
 * the `StreamPort` handed to {@link SimWorkerApi.subscribe} is wrapped, so the
 * worker can observe what `postMessage` did to the buffers it was given.
 *
 * That substitution is the whole point. The plan (§3.4) specifies transferables
 * and `engine/test/worker/api.test.ts` asserts the *call site* passes five of
 * them; neither shows the host actually detached anything. A structured clone
 * would satisfy the call-site assertion exactly. The only place detachment is
 * observable is in the sender, immediately after the call, by reading
 * `ArrayBuffer.byteLength` — 0 means the buffer was transferred out, non-zero
 * means the engine copied it and the worker still owns the bytes.
 *
 * Nothing under `engine/src/` is modified or re-implemented here: the run
 * lifecycle, the encoders and the transfer lists all come from the shipped
 * `SimWorkerApi`.
 */

import * as Comlink from "comlink";

import { SimWorkerApi, type StreamPort } from "../../src/worker/api.js";
import type { StreamMessage } from "../../src/worker/protocol.js";

/** Per-message rows kept for the cadence analysis. */
const CAP = 64_000;

/** Message-kind codes shared with the main-thread instrument. */
export const KIND_FRAMES = 0;
export const KIND_METRICS = 1;
export const KIND_WAVE = 2;
export const KIND_STATUS = 3;

export interface TransferAudit {
  /** `performance.timeOrigin` inside the worker, for aligning the two clocks. */
  readonly timeOrigin: number;
  readonly messages: number;
  readonly messagesWithTransfer: number;
  /** Buffers handed to `postMessage`'s transfer list. */
  readonly buffersOffered: number;
  /** Buffers whose `byteLength` was 0 immediately after the call (transferred). */
  readonly buffersDetached: number;
  /** Buffers still owned by the worker after the call (structured-cloned). */
  readonly buffersStillLive: number;
  /** Bytes the worker still owned after posting — 0 iff every buffer moved. */
  readonly liveBytesAfterPost: number;
  /** Typed-array views inside the batch that were 0-length after the call. */
  readonly viewsDetached: number;
  readonly viewsStillLive: number;
  readonly transferablesOnFirstFrame: number;
  readonly postMsSum: number;
  readonly postMsMax: number;
  /** `timeOrigin + performance.now()` at each send, for cadence. */
  readonly sendTimes: Float64Array;
  readonly sendKinds: Uint8Array;
  readonly sendBytes: Float64Array;
  readonly postMs: Float64Array;
  readonly recorded: number;
  readonly dropped: number;
}

const sendTimes = new Float64Array(CAP);
const sendKinds = new Uint8Array(CAP);
const sendBytes = new Float64Array(CAP);
const postMs = new Float64Array(CAP);

let messages = 0;
let messagesWithTransfer = 0;
let buffersOffered = 0;
let buffersDetached = 0;
let buffersStillLive = 0;
let liveBytesAfterPost = 0;
let viewsDetached = 0;
let viewsStillLive = 0;
let transferablesOnFirstFrame = -1;
let postSum = 0;
let postMax = 0;
let recorded = 0;
let dropped = 0;

function kindCode(m: StreamMessage): number {
  switch (m.kind) {
    case "frames":
      return KIND_FRAMES;
    case "metrics":
      return KIND_METRICS;
    case "wave":
      return KIND_WAVE;
    default:
      return KIND_STATUS;
  }
}

/** Views inside a frame batch, so detachment can be checked on the views too. */
function batchViews(m: StreamMessage): ArrayBufferView[] {
  if (m.kind === "frames") {
    return [m.batch.ticks, m.batch.positions, m.batch.states, m.batch.occupancy, m.batch.smokeUgM3];
  }
  if (m.kind === "metrics") {
    return [
      m.batch.hours,
      m.batch.stateCensus,
      m.batch.occupied,
      m.batch.refusals,
      m.batch.meanExposureUgM3h,
      m.batch.meanInhaledDoseUg,
      m.batch.smokeUgM3,
    ];
  }
  return [];
}

class ProfilingSimWorkerApi extends SimWorkerApi {
  override subscribe(port: StreamPort): void {
    const wrapped: StreamPort = {
      postMessage: (message: StreamMessage, transfer: ArrayBuffer[]): void => {
        // Sizes MUST be read before the call: a transferred buffer reports 0.
        let offeredBytes = 0;
        for (const b of transfer) {
          offeredBytes += b.byteLength;
        }
        const views = batchViews(message);
        const t0 = performance.now();
        port.postMessage(message, transfer);
        const t1 = performance.now();

        messages++;
        const dt = t1 - t0;
        postSum += dt;
        if (dt > postMax) {
          postMax = dt;
        }
        if (transfer.length > 0) {
          messagesWithTransfer++;
          if (message.kind === "frames" && transferablesOnFirstFrame < 0) {
            transferablesOnFirstFrame = transfer.length;
          }
          for (const b of transfer) {
            buffersOffered++;
            if (b.byteLength === 0) {
              buffersDetached++;
            } else {
              buffersStillLive++;
              liveBytesAfterPost += b.byteLength;
            }
          }
          for (const v of views) {
            if (v.byteLength === 0) {
              viewsDetached++;
            } else {
              viewsStillLive++;
            }
          }
        }
        if (recorded < CAP) {
          sendTimes[recorded] = performance.timeOrigin + t0;
          sendKinds[recorded] = kindCode(message);
          sendBytes[recorded] = offeredBytes;
          postMs[recorded] = dt;
          recorded++;
        } else {
          dropped++;
        }
      },
    };
    super.subscribe(wrapped);
  }

  /** Reset the audit between configurations in one worker. */
  resetAudit(): void {
    messages = 0;
    messagesWithTransfer = 0;
    buffersOffered = 0;
    buffersDetached = 0;
    buffersStillLive = 0;
    liveBytesAfterPost = 0;
    viewsDetached = 0;
    viewsStillLive = 0;
    transferablesOnFirstFrame = -1;
    postSum = 0;
    postMax = 0;
    recorded = 0;
    dropped = 0;
  }

  transferAudit(): TransferAudit {
    return {
      timeOrigin: performance.timeOrigin,
      messages,
      messagesWithTransfer,
      buffersOffered,
      buffersDetached,
      buffersStillLive,
      liveBytesAfterPost,
      viewsDetached,
      viewsStillLive,
      transferablesOnFirstFrame,
      postMsSum: postSum,
      postMsMax: postMax,
      sendTimes: sendTimes.slice(0, recorded),
      sendKinds: sendKinds.slice(0, recorded),
      sendBytes: sendBytes.slice(0, recorded),
      postMs: postMs.slice(0, recorded),
      recorded,
      dropped,
    };
  }
}

Comlink.expose(new ProfilingSimWorkerApi());

export type { ProfilingSimWorkerApi };
