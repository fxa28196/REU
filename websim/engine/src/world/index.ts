/**
 * `engine/src/world` — the `ContextCreator.build()` port (PORT_MAP §1.3).
 *
 * ```ts
 * const graph  = buildRoutingGraph(unpackTopology(bytes));
 * const world  = buildWorld(config, { graph, data, smokeHours });
 * // world.residents / world.shelters / world.closures are the initial world;
 * // Tier-1 identity is defined on exactly those three plus the run window.
 * ```
 *
 * Nothing in this module reads a clock, a DOM or `Math.random`. The only
 * randomness is the three build-time streams, positioned by the step order in
 * `build.ts`.
 */

export {
  buildWorld,
  ENCAMPMENTS_CSV,
  type WorldBuildConfig,
  type WorldBuildInput,
  type WorldBuildResult,
  type WorldDataSource,
  type WorldResident,
  type CampSite,
} from "./build.js";

export {
  SCENARIO_CHAIN,
  SEVERE_LABEL_CODES,
  SHELTERS_DIR,
  CLOSURES_DIR,
  CLOSURE_WORST_DRAWS,
  SMOKE_SERIES_CSV,
  BuildFailFastError,
  checkSelectorCodes,
  elayerFileName,
  resolveClosuresCsv,
  resolveScenario,
  type ResolvedScenario,
  type ScenarioEntry,
} from "./scenario.js";

export {
  SIM_START,
  DateParseError,
  checkRunWindow,
  parseIsoDateToEpochDay,
  tickForDate,
  ticksPerHour,
  toEpochDay,
  type RunWindow,
} from "./time.js";
