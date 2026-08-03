/**
 * The sim-worker entry point (plan §3.4, "`sim-worker` (1): owns the engine").
 *
 * Everything this file does is adapt {@link SimWorkerApi} to the host: expose it
 * over Comlink and nothing else. It is short on purpose — code that only runs
 * inside a `Worker` can only be tested inside a browser, so the less of it there
 * is, the more of WP10 is covered by tests that run everywhere.
 *
 * Instantiate from the UI thread with the standard Vite worker form, which
 * bundles this module and its imports:
 *
 * ```ts
 * const worker = new Worker(
 *   new URL("@websim/engine/worker/simWorker.js", import.meta.url),
 *   { type: "module" },
 * );
 * const api = Comlink.wrap<SimWorkerApi>(worker);
 * ```
 *
 * `app/src/sim/client.ts` wraps that, including the stream port, so a screen
 * never touches Comlink directly.
 */

import * as Comlink from "comlink";

import { SimWorkerApi } from "./api.js";

/**
 * The exposed instance.
 *
 * One per worker, created at module evaluation. `SimWorkerApi.init` throws away
 * its `SimHost` and builds a new one per configuration, so a single worker can
 * run many runs without any state leaking between them — which is what Compare
 * relies on when it re-runs one side.
 */
const api = new SimWorkerApi();

Comlink.expose(api);

export type { SimWorkerApi };
