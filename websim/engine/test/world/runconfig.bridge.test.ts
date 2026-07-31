/**
 * The contract-plane bridge: a `RunConfig` from `@websim/shared` must drive
 * `buildWorld` with no adapter, no coercion and no missing field.
 *
 * `WorldBuildConfig` is declared in the engine (it names the parameters
 * `ContextCreator.build()` actually reads, which is 18 of the 41), and
 * `RunConfig` is inferred from the Zod schema. Nothing forces them to agree —
 * except this file. The assertion is compile-time, so a parameter renamed on
 * either side breaks `npm run typecheck` rather than surfacing as a silent
 * fallback at run time, which is exactly the failure mode risk R7 warns about.
 *
 * The runtime half checks that every shipped preset really does carry all 18,
 * because "fully explicit, zero fallbacks" is a claim the presets make.
 */

import { describe, expect, it } from "vitest";

import { PARAM_NAMES, parseRunConfig, PRESETS, type RunConfig } from "@websim/shared";

import type { WorldBuildConfig } from "../../src/world/build.js";

/**
 * Compile-time proof that a `RunConfig` IS a `WorldBuildConfig`. If the engine
 * ever needs a parameter the schema does not define — or defines with a wider
 * type — this stops compiling.
 */
type _RunConfigDrivesBuild = RunConfig extends WorldBuildConfig ? true : never;
const _bridge: _RunConfigDrivesBuild = true;
void _bridge;

/** Every key the build reads must be a declared parameter name. */
const BUILD_PARAMS: readonly (keyof WorldBuildConfig)[] = [
  "numAgents",
  "minutesPerTick",
  "simulationHours",
  "randomSeed",
  "scenarioCode",
  "enableHeterogeneity",
  "respectShelterOpeningDates",
  "triageReserveFraction",
  "enableDecisionLayer",
  "pAwareInit",
  "pHeavyBelongings",
  "pHasPet",
  "pHasDependents",
  "groupSpeedDeltaMps",
  "shelterPolicyVariant",
  "smokeSeriesCode",
  "closuresCode",
  "closureDraw",
];

describe("RunConfig -> WorldBuildConfig bridge", () => {
  it("names only declared parameters", () => {
    for (const name of BUILD_PARAMS) {
      expect(PARAM_NAMES as readonly string[], `${name} is a declared parameter`).toContain(name);
    }
    expect(new Set(BUILD_PARAMS).size).toBe(BUILD_PARAMS.length);
  });

  it("is satisfied by every shipped preset, with no fallback anywhere", () => {
    const ids = Object.keys(PRESETS);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const config = parseRunConfig(PRESETS[id as keyof typeof PRESETS], `preset ${id}`);
      for (const name of BUILD_PARAMS) {
        expect(config[name], `preset ${id} declares ${name}`).toBeTypeOf("number");
        expect(Number.isFinite(config[name]), `preset ${id} ${name} is finite`).toBe(true);
      }
      // The build reads it as a `WorldBuildConfig`; this is the value-level
      // counterpart of the type assertion above.
      const forBuild: WorldBuildConfig = config;
      expect(forBuild.numAgents).toBe(config.numAgents);
    }
  });
});
