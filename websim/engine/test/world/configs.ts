/**
 * The 13 archived build configurations the F1 exporter dumped, declared from
 * PORT_MAP §3.3 — **not** read out of the oracle.
 *
 * This is deliberate and it is the difference between a test and a tautology.
 * If the configs were parsed from the fixture headers, a port that mis-resolved
 * `scenarioCode 7` to the wrong shelter file would still "pass", because it
 * would have been handed the right file. Declaring them here means the port's
 * own `resolveScenario` has to produce the path the exporter used, and
 * `tier1.parity.test.ts` asserts exactly that against `manifest.json`'s
 * `sheltersCsv` before it compares a single resident.
 *
 * Sources: PORT_MAP §3.3 (bundle table + the E0-null and E_REAL parameter
 * blocks) and §2.7 (SE / SE2 severity params).
 */

import type { WorldBuildConfig } from "../../src/world/build.js";

/** Every 2026 batch file's common core (§3.2). */
const CORE = {
  numAgents: 6842,
  minutesPerTick: 1,
  enableHeterogeneity: 1,
  respectShelterOpeningDates: 1,
} as const;

/** Decision layer OFF — the legacy arms. E params are inert but must be stated. */
const LAYER_OFF = {
  enableDecisionLayer: 0,
  pAwareInit: 1,
  pHeavyBelongings: 0.284,
  pHasPet: 0.117,
  pHasDependents: 0.0044,
  groupSpeedDeltaMps: 0,
  shelterPolicyVariant: 0,
} as const;

/** E0 null: layer ON, every knob degenerate (the R3 vehicle). */
const E0 = {
  enableDecisionLayer: 1,
  pAwareInit: 1,
  pHeavyBelongings: 0.284,
  pHasPet: 0.117,
  pHasDependents: 0.0044,
  groupSpeedDeltaMps: 0,
  shelterPolicyVariant: 0,
} as const;

/** E_REAL: baseline-real. `pAwareInit` 0.356, group pace 0.06, `_elayer` file. */
const E_REAL = {
  enableDecisionLayer: 1,
  pAwareInit: 0.356,
  pHeavyBelongings: 0.284,
  pHasPet: 0.117,
  pHasDependents: 0.0044,
  groupSpeedDeltaMps: 0.06,
  shelterPolicyVariant: 1,
} as const;

/** No closures, observed smoke, 312 h. */
const OBSERVED = {
  simulationHours: 312,
  smokeSeriesCode: 0,
  closuresCode: 0,
  closureDraw: 1,
} as const;

/** Severe v1 + base closures, 455 h (gotcha 3: 456 slices ⇒ 455 hours). */
const SEVERE_V1 = {
  simulationHours: 455,
  smokeSeriesCode: 1,
  closuresCode: 1,
  closureDraw: 1,
} as const;

/** Worst-plausible v2 + the worst closure family, draw 1. */
const SEVERE_V2_D1 = {
  simulationHours: 455,
  smokeSeriesCode: 2,
  closuresCode: 3,
  closureDraw: 1,
} as const;

export interface FixtureConfig {
  /** Matches the fixture file stem and the manifest `configs[].id`. */
  readonly id: string;
  readonly config: Omit<WorldBuildConfig, "randomSeed">;
  /** Slices in the selected series — 576 observed, 456 both severe. */
  readonly smokeHours: number;
  /** The shelter table fixture is per config (not per seed). */
  readonly shelterFixture: string;
  /** Closure fixture stem, when the config schedules one. */
  readonly closureFixture: string | null;
}

function cfg(
  id: string,
  scenarioCode: number,
  triageReserveFraction: number,
  layer: typeof LAYER_OFF | typeof E0 | typeof E_REAL,
  severity: typeof OBSERVED | typeof SEVERE_V1 | typeof SEVERE_V2_D1,
  closureFixture: string | null,
): FixtureConfig {
  return {
    id,
    config: { ...CORE, ...layer, ...severity, scenarioCode, triageReserveFraction },
    smokeHours: severity.smokeSeriesCode === 0 ? 576 : 456,
    shelterFixture: id,
    closureFixture,
  };
}

export const FIXTURE_CONFIGS: readonly FixtureConfig[] = [
  cfg("A", 0, 0, LAYER_OFF, OBSERVED, null),
  cfg("B", 1, 0, LAYER_OFF, OBSERVED, null),
  cfg("C", 2, 0, LAYER_OFF, OBSERVED, null),
  cfg("E0-A", 0, 0, E0, OBSERVED, null),
  cfg("E0-B", 1, 0, E0, OBSERVED, null),
  cfg("E0-C", 2, 0, E0, OBSERVED, null),
  cfg("ER-A", 0, 0, E_REAL, OBSERVED, null),
  cfg("ER-C", 2, 0, E_REAL, OBSERVED, null),
  // Arm D: arm B's file plus the reserve. The file carries the sites, the
  // parameter carries the intake rule.
  cfg("ER-D", 7, 0.1, E_REAL, OBSERVED, null),
  cfg("SE-E18", 18, 0, E_REAL, SEVERE_V1, "schedule-c1"),
  cfg("SE-E19", 19, 0, E_REAL, SEVERE_V1, "schedule-c1"),
  cfg("SE-E20", 20, 0.1, E_REAL, SEVERE_V1, "schedule-c1"),
  cfg("SE2-E18-d1", 18, 0, E_REAL, SEVERE_V2_D1, "schedule-c3-d1"),
];

export const FIXTURE_SEEDS: readonly number[] = [42, 43, 44];

/**
 * Realised marginals per seed at n = 6,842, `%.4f`, in `OutcomeLogger` order:
 * mobility / asthma / COPD / any-respiratory / 55+ / mean speed.
 *
 * **These are the archive's, not the plan's.** The widely quoted
 * `0.195 / 0.147 / 0.104 / 0.235 / 0.259 / 1.280 at seed 42` is **seed 48's**
 * row (`docs/runs/present-day-three-arm/A-seed48`) — finding F1-F1. Seed 42's
 * are below, and 52 archived manifests agree with them.
 */
export const ARCHIVED_MARGINALS: ReadonlyMap<number, readonly string[]> = new Map([
  [42, ["0.1988", "0.1478", "0.1079", "0.2381", "0.2622", "1.2805"]],
  [43, ["0.1995", "0.1523", "0.0978", "0.2343", "0.2562", "1.2796"]],
  [44, ["0.2093", "0.1481", "0.1004", "0.2331", "0.2726", "1.2752"]],
]);
