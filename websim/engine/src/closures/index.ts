/**
 * `engine/src/closures` — the Scenario-E closure layer, both halves.
 *
 * * **Build (WP6, `schedule.ts`).** Turn the CSV into an ascending-hour wave map
 *   with file order preserved inside each hour, throw where Java throws, and
 *   count the phantom pairs the manifest census reports.
 * * **Run (WP8, `runtime.ts`).** `ClosureWave.apply()`: block the wave's edges
 *   in file order, bump the closure version once, recompute every shelter tree
 *   in shelter-CSV load order.
 *
 * The third piece — one resident's *reaction* to finding a blocked edge ahead of
 * it — is not here: it reads three `DecisionConfig` fields and the per-agent
 * decision stream, so it lives with the decision layer as
 * `decision/closureReaction.ts`. The two meet at `ClosureNetworkView`, which
 * `Simulation` satisfies from {@link ClosureRuntime}.
 */

export {
  ClosureRuntime,
  ClosureRuntimeError,
  assertIntegralWaveTicks,
  type ClosureRuntimeOptions,
  type ClosureWaveReport,
} from "./runtime.js";

export {
  parseClosureSchedule,
  ClosureScheduleError,
  type ClosureSchedule,
  type ClosureWave,
  type ScheduledClosure,
  type ParseClosureScheduleOptions,
} from "./schedule.js";
