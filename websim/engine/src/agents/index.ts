/**
 * `engine/src/agents` — the samplers (WP6) and the tick step (WP7/WP8).
 *
 * The samplers' draw orders are the strongest determinism contract in the
 * model: get one draw wrong and every later resident's whole attribute vector
 * shifts, silently and plausibly. `step.ts` is the other half — the §1.5 order,
 * verbatim, with the Phase-E branches (WP8) gated on the layer being armed. The
 * decision layer itself lives in `engine/src/decision`.
 */

export {
  PopulationSampler,
  freeSpeedMean,
  AGE_BAND_LABELS,
  SEX_LABELS,
  MOBILITY_CATEGORY_LABELS,
  POPULATION_PUBLISHED_TARGETS,
  type AgeBandLabel,
  type SexLabel,
  type MobilityCategoryLabel,
  type PopulationAttributes,
  type PopulationMarginals,
} from "./populationSampler.js";

export {
  ELayerSampler,
  P_AWARE_INIT_SOURCED,
  P_HEAVY_BELONGINGS_SOURCED,
  P_HAS_PET_SOURCED,
  P_HAS_DEPENDENTS_SOURCED,
  GROUP_SPEED_DELTA_SOURCED_MPS,
  type DecisionAttributes,
  type DecisionMarginals,
  type ELayerSamplerOptions,
} from "./eLayerSampler.js";

export { STATES, TRANSITIONS, LEGACY_TRANSITIONS, UNHEALTHY_UGM3, INHALATION_WALKING_M3H, INHALATION_RESTING_M3H, MAX_RETARGETS, GROUP_PACE_FLOOR_MPS, UNCAPPED_CAPACITY_PRIOR, accruesExposure, countsAsAboveUnhealthy, isAbsorbing, isTerminalForMovement, latchFires, riskCueFires, ventilationM3h, type State, type Transition } from "./stateMachine.js";

export { Resident } from "./resident.js";

export { stepResident, materialisePosition, type StepWorld } from "./step.js";

export {
  buildRouteLeg,
  buildRouteNodes,
  legVertexAt,
  pathIndexFor,
  positionAlongApproach,
  positionAlongLeg,
  type PositionLonLat,
  type RouteLeg,
  type RouteNodes,
} from "./route.js";
