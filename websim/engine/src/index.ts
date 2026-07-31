/**
 * Engine plane — the deterministic simulation core.
 *
 * Landed so far: WP3 (RNG streams + fdlibm mathx, `./rng`, `./mathx`), WP5
 * (routing graph + CsvLoader, `./graph` and `./loader`) and WP6 (`./world`,
 * `./agents`, `./shelters`, `./closures` — the `ContextCreator` build, the two
 * attribute samplers, the shelter object, and closure-schedule parsing). Still
 * to come over WP7–WP8: smoke field, the agent tick loop, closure-wave
 * application, snapshot ring, outcome writer.
 *
 * Every surface is reached through its own subpath export rather than
 * re-exported here: the loader is a ~200-line dependency-free parser that build
 * scripts import on its own, and the graph pulls in `geographiclib-geodesic`.
 */

/** Reported as `engine` in the executed manifest (plan Q5: `java_version` -> "n/a"). */
export const ENGINE_NAME = "websim-ts" as const;

/** Engine version string; participates in the deterministic `sim_id` hash. */
export const ENGINE_VERSION = "0.0.1" as const;

/**
 * Within-tick agent ordering strategies (plan Q1). `shuffle-mt` — a Fisher–Yates
 * permutation drawn from the colt MT default stream — is the shipped default;
 * `identity` exists only for internal determinism tests.
 */
export const AGENT_ORDER_STRATEGIES = ["shuffle-mt", "identity"] as const;
export type AgentOrderStrategy = (typeof AGENT_ORDER_STRATEGIES)[number];

export const DEFAULT_AGENT_ORDER: AgentOrderStrategy = "shuffle-mt";

/**
 * Structural guard from never-regress gotcha 3: the inclusive final tick reads
 * hour index === simulationHours, so a run window of H hours needs H + 1 smoke
 * slices. Overrunning silently books fabricated zero-concentration lookups.
 * Returns the largest legal simulationHours for a series of `slices` slices.
 */
export function maxSimulationHours(slices: number): number {
  if (!Number.isInteger(slices) || slices < 1) {
    throw new RangeError(`smoke series must have >= 1 integral slices, got ${slices}`);
  }
  return slices - 1;
}
