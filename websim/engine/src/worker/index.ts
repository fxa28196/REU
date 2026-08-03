/**
 * `@websim/engine/worker` — WP10: the worker runtime, streaming, snapshots and
 * the Compare backend.
 *
 * Layering, outermost first:
 *
 * | Module | Depends on a host API? | Where it is tested |
 * |---|---|---|
 * | `simWorker.ts` | yes (`Worker`, Comlink) | browser only |
 * | `api.ts` | no | Node + browser |
 * | `simHost.ts` | no | Node + browser |
 * | `snapshot.ts`, `digest.ts`, `ring.ts`, `frames.ts`, `sssp.ts`, `build.ts` | no | Node |
 *
 * `simWorker.ts` is deliberately absent from this barrel: importing it *runs*
 * `Comlink.expose`, which is a side effect a Node test must never trigger. It is
 * reached by its own path, from a `new Worker(...)` URL.
 */

export * from "./api.js";
export * from "./build.js";
export * from "./census.js";
export * from "./digest.js";
export * from "./fieldContract.js";
export * from "./frames.js";
export * from "./protocol.js";
export * from "./ring.js";
export * from "./simHost.js";
export * from "./snapshot.js";
export * from "./sssp.js";
