/**
 * Shared plumbing for the WP10 browser acceptance tests: spawn a **real**
 * `Worker` running the **shipped** entry point, wrap it in Comlink, and wire the
 * stream port.
 *
 * The worker URL points at `engine/src/worker/simWorker.ts`, not at a test
 * double. That matters: `simWorker.ts` is the only WP10 module that cannot be
 * exercised outside a browser, so if these tests instantiated their own
 * `Comlink.expose` shim, the one file the browser tests exist to cover would be
 * the one file they did not run.
 */

import * as Comlink from "comlink";

import type { SimWorkerApi } from "../../src/worker/api.js";
import type { StreamMessage } from "../../src/worker/protocol.js";
import {
  smokeAsset,
  synthConfig,
  synthCsvMap,
  synthGeometry,
  synthTopology,
  type SynthWorldOptions,
} from "../../test/worker/world.js";

export interface WorkerHandle {
  readonly api: Comlink.Remote<SimWorkerApi>;
  /**
   * Every stream message received so far, oldest first — unless the worker was
   * started with {@link StartWorkerOptions.retainMessages} `false`, in which
   * case this stays empty and only the counters move.
   */
  readonly messages: StreamMessage[];
  /** Total bytes of transferable payload received (frames + metrics). */
  bytes(): number;
  /** Stream messages received, whether or not they were retained. */
  messageCount(): number;
  terminate(): void;
}

export interface StartWorkerOptions {
  /**
   * Keep every stream message in {@link WorkerHandle.messages}. Default `true`.
   *
   * The production-scale UI-thread measurement streams ~1.7 GB in ~27 k frame
   * batches; retaining those would put the page under memory pressure that has
   * nothing to do with the thing being measured and everything to do with the
   * test harness, and would eventually OOM the tab. Set `false` there. Every
   * other test wants the log and keeps the default.
   */
  readonly retainMessages?: boolean;
}

/** Engine label for failure messages — a bare mismatch names no culprit. */
export const ENGINE_LABEL: string =
  (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? "unknown-engine";

/**
 * Which engine this run is in — for the ONE place gating differs by engine.
 *
 * Per `docs/DR-WP10-clause2-decision.md` (researcher sign-off, 2026-08-04), the
 * UI-thread long-task budget (clause 2a) is asserted on Chromium only; Firefox
 * and WebKit run the identical measurement and report it ungated (clause 2b),
 * because their red numbers reproduce on a cold page with nothing under test.
 * Every OTHER gate — determinism digests, snapshot replay, transfer semantics,
 * non-vacuity, positive controls — runs unconditionally in all three engines.
 *
 * Order matters: Chromium's UA contains `AppleWebKit` too, and everything
 * contains `Mozilla`, so Firefox is tested first, then Chrome, then bare WebKit.
 */
export const ENGINE_KIND: "chromium" | "firefox" | "webkit" | "unknown" = ENGINE_LABEL.includes("Firefox")
  ? "firefox"
  : ENGINE_LABEL.includes("Chrome")
    ? "chromium"
    : ENGINE_LABEL.includes("AppleWebKit")
      ? "webkit"
      : "unknown";

/**
 * Whether this engine GATES the long-task budget, or only reports it.
 *
 * Deliberately `!== firefox && !== webkit` rather than `=== chromium`: if a UA
 * string ever changes shape and detection returns `"unknown"`, the budget is
 * asserted — a possible false red that names itself — instead of the only gated
 * engine silently joining the report-only set. Fail loud, never un-gate quietly.
 */
export const GATES_LONG_TASK_BUDGET: boolean = ENGINE_KIND !== "firefox" && ENGINE_KIND !== "webkit";

/**
 * Start a worker, subscribe to its stream, and load the synthetic graph.
 *
 * `onMessage` runs on the UI thread for every stream message, which is where the
 * long-task probe measures from.
 */
export async function startWorker(
  onMessage?: (m: StreamMessage) => void,
  options: StartWorkerOptions = {},
): Promise<WorkerHandle> {
  const retain = options.retainMessages ?? true;
  const worker = new Worker(new URL("../../src/worker/simWorker.ts", import.meta.url), {
    type: "module",
  });
  const api = Comlink.wrap<SimWorkerApi>(worker);
  const messages: StreamMessage[] = [];
  let bytes = 0;
  let count = 0;

  const channel = new MessageChannel();
  channel.port1.onmessage = (ev: MessageEvent<StreamMessage>): void => {
    const m = ev.data;
    count++;
    if (retain) {
      messages.push(m);
    }
    if (m.kind === "frames") {
      bytes +=
        m.batch.positions.byteLength +
        m.batch.states.byteLength +
        m.batch.occupancy.byteLength +
        m.batch.ticks.byteLength +
        m.batch.smokeUgM3.byteLength;
    } else if (m.kind === "metrics") {
      bytes += m.batch.stateCensus.byteLength + m.batch.meanExposureUgM3h.byteLength;
    }
    onMessage?.(m);
  };
  channel.port1.start();
  await api.subscribe(Comlink.transfer(channel.port2, [channel.port2]));

  const topology = synthTopology();
  await api.loadAssets(
    Comlink.transfer({ topology, geometry: synthGeometry(topology) }, []),
  );

  return {
    api,
    messages,
    bytes: () => bytes,
    messageCount: () => count,
    terminate: () => {
      channel.port1.close();
      worker.terminate();
    },
  };
}

/** The init payload for the synthetic world, structured-clone safe. */
export function initPayload(options: SynthWorldOptions = {}) {
  const config = synthConfig(options);
  return {
    config,
    csv: synthCsvMap(),
    smokeAsset: smokeAsset(config.simulationHours, options.smokeGapHours ?? []),
    registryValidated: true,
  };
}
