import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseRunConfig, safeParseRunConfig } from "../src/config.js";
import {
  DEFAULT_PRESET_ID,
  materialisePreset,
  presetConfig,
  presetDefinition,
  presetFileName,
  PRESET_DEFINITIONS,
  PRESET_IDS,
  PRESET_JSON,
  PRESETS,
  serialisePreset,
} from "../src/presets/index.js";
import { PARAM_COUNT, PARAM_META, PARAM_NAMES, RunConfigSchema } from "../src/schema.js";

const PRESET_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "presets");

/** Values taken straight from the read-only batch files, as a cross-check. */
const BATCH_FILE_EXPECTATIONS = {
  A_present_day: { scenarioCode: 0, simulationHours: 312, enableDecisionLayer: 0 },
  B_capacity_meets_demand: { scenarioCode: 1, simulationHours: 312, enableDecisionLayer: 0 },
  C_expanded_plus_new_sites: { scenarioCode: 2, simulationHours: 312, enableDecisionLayer: 0 },
  E0_null_A: {
    scenarioCode: 0,
    enableDecisionLayer: 1,
    pAwareInit: 1,
    informationRegime: 0,
    enableHazardDeparture: 0,
    sigmaTheta: 0,
    gammaVuln: 0,
    petPolicyDefault: 1,
    shelterPolicyVariant: 0,
  },
  ER_baseline_real_A: {
    scenarioCode: 0,
    enableDecisionLayer: 1,
    pAwareInit: 0.356,
    groupSpeedDeltaMps: 0.06,
    informationRegime: 1,
    enableHazardDeparture: 1,
    sigmaTheta: 1,
    gammaVuln: 0.25,
    barrierBelongings: 0.26,
    barrierPet: 0.26,
    barrierDependents: 0.26,
    petPolicyDefault: 0,
    betaCapacityPrior: 0.2,
    shelterPolicyVariant: 1,
  },
  SE_severe_v1_E18: {
    scenarioCode: 18,
    simulationHours: 455,
    smokeSeriesCode: 1,
    smokeScale: 1,
    closuresCode: 1,
    closureDraw: 1,
    pStuck: 0.3,
    stuckDelayH: 3,
    pushThetaThreshold: -0.25,
    kPush: 1,
  },
  SE2_worst_plausible_E18_d1: {
    scenarioCode: 18,
    simulationHours: 455,
    smokeSeriesCode: 2,
    smokeScale: 1,
    closuresCode: 3,
    closureDraw: 1,
    pushThetaThreshold: -0.25,
  },
} as const;

describe("preset inventory", () => {
  it("ships the bundles WP0 requires, with unique ids", () => {
    expect(new Set(PRESET_IDS).size).toBe(PRESET_IDS.length);
    for (const required of [
      "A_present_day",
      "B_capacity_meets_demand",
      "C_expanded_plus_new_sites",
      "E0_null_A",
      "ER_baseline_real_A",
      "SE_severe_v1_E18",
      "SE2_worst_plausible_E18_d1",
    ]) {
      expect(PRESET_IDS).toContain(required);
    }
  });

  it("has one definition, one JSON file and one loaded config per id", () => {
    expect(PRESET_DEFINITIONS.map((d) => d.id).sort()).toEqual([...PRESET_IDS].sort());
    expect(Object.keys(PRESET_JSON).sort()).toEqual([...PRESET_IDS].sort());
    expect(Object.keys(PRESETS).sort()).toEqual([...PRESET_IDS].sort());
  });

  it("starts a fresh run from the study configuration (plan Q2)", () => {
    const fresh = PRESETS[DEFAULT_PRESET_ID];
    expect(fresh.numAgents).toBe(2037);
    expect(fresh.randomSeed).toBe(42);
    expect(fresh.enableHeterogeneity).toBe(1);
    expect(fresh.respectShelterOpeningDates).toBe(1);
    expect(fresh.simulationHours).toBe(312);
  });
});

describe("preset completeness", () => {
  it("carries all 41 parameters explicitly in every preset", () => {
    for (const id of PRESET_IDS) {
      const raw = PRESET_JSON[id] as Record<string, unknown>;
      expect(Object.keys(raw).sort(), `${id} key set`).toEqual([...PARAM_NAMES].sort());
      expect(Object.keys(raw), `${id} parameter count`).toHaveLength(PARAM_COUNT);
    }
  });

  it("validates every preset against the schema", () => {
    for (const id of PRESET_IDS) {
      const result = safeParseRunConfig(PRESET_JSON[id]);
      expect(
        result.ok,
        `${id} failed validation: ${result.ok ? "" : JSON.stringify(result.issues)}`,
      ).toBe(true);
    }
  });

  it("fails validation when any single parameter is stripped from any preset", () => {
    // The acceptance criterion from plan WP0: a preset missing any parameter
    // fails a unit test. Checked for every preset × every parameter, so a
    // future optional field cannot slip through on one bundle.
    for (const id of PRESET_IDS) {
      for (const name of PARAM_NAMES) {
        const stripped: Record<string, unknown> = { ...(PRESET_JSON[id] as object) };
        delete stripped[name];
        expect(
          RunConfigSchema.safeParse(stripped).success,
          `${id} without ${name} was accepted`,
        ).toBe(false);
      }
    }
  });

  it("keeps every preset value inside its certified envelope", () => {
    // Every shipped preset is an archived configuration (or the study default),
    // so all of them must be able to earn at least ENGINE-CERTIFIED. A preset
    // outside the envelope would mean the badge machine calls an archived run
    // EXPLORATORY.
    for (const id of PRESET_IDS) {
      const config = PRESETS[id];
      for (const name of PARAM_NAMES) {
        const meta = PARAM_META[name];
        const value = config[name];
        expect(value, `${id}.${name} below envelope`).toBeGreaterThanOrEqual(meta.certifiedMin);
        expect(value, `${id}.${name} above envelope`).toBeLessThanOrEqual(meta.certifiedMax);
      }
    }
  });
});

describe("preset JSON is generated, not hand-maintained", () => {
  it("matches the definitions byte for byte", () => {
    for (const definition of PRESET_DEFINITIONS) {
      const expected = serialisePreset(parseRunConfig(materialisePreset(definition)));
      const onDisk = readFileSync(join(PRESET_DIR, presetFileName(definition.id)), "utf8");
      // Line endings are normalised: git may check the file out with CRLF.
      expect(onDisk.replace(/\r\n/gu, "\n"), `${definition.id}.json is stale`).toBe(expected);
    }
  });

  it("loads the JSON file, not the definition, as the runtime config", () => {
    for (const id of PRESET_IDS) {
      expect(PRESETS[id]).toEqual(PRESET_JSON[id]);
    }
  });

  it("writes parameters in the manifest's fixed order", () => {
    for (const id of PRESET_IDS) {
      expect(Object.keys(PRESET_JSON[id] as object), `${id} key order`).toEqual([...PARAM_NAMES]);
    }
  });
});

describe("preset values match the read-only batch files", () => {
  it("reproduces each bundle's declared parameter values", () => {
    for (const [id, expectations] of Object.entries(BATCH_FILE_EXPECTATIONS)) {
      const config = PRESETS[id as keyof typeof BATCH_FILE_EXPECTATIONS];
      for (const [param, value] of Object.entries(expectations)) {
        expect(config[param as keyof typeof config], `${id}.${param}`).toBe(value);
      }
    }
  });

  it("applies the common core to every archived preset", () => {
    // PORT_MAP §3.2: every 2026 batch file carries these seven values.
    for (const definition of PRESET_DEFINITIONS) {
      if (definition.archiveFamily === null) {
        continue;
      }
      const config = PRESETS[definition.id];
      expect(config.numAgents, `${definition.id}.numAgents`).toBe(6842);
      expect(config.minutesPerTick).toBe(1);
      expect(config.walkingSpeedMps).toBe(1.3);
      expect(config.shelterArrivalDistanceM).toBe(200);
      expect(config.evacuationThresholdUgM3).toBe(55.5);
      expect(config.enableHeterogeneity).toBe(1);
      expect(config.respectShelterOpeningDates).toBe(1);
    }
  });

  it("carries the corrected negative pushThetaThreshold in the Scenario-E presets", () => {
    // Archived Scenario-E runs EXECUTED 0.0 because Repast's batch loader zeroes
    // negative constant_type="number" values. Web presets carry the registered
    // -0.25 (plan §6.4), so this is a deliberate, documented difference from the
    // archive, not a transcription error.
    expect(PRESETS.SE_severe_v1_E18.pushThetaThreshold).toBe(-0.25);
    expect(PRESETS.SE2_worst_plausible_E18_d1.pushThetaThreshold).toBe(-0.25);
    expect(PRESETS.SE_severe_v1_E18.alphaHazard).toBe(-8);
  });

  it("keeps the Scenario-E window at 455 hours, not the 456 its comment claims", () => {
    expect(PRESETS.SE_severe_v1_E18.simulationHours).toBe(455);
    expect(PRESETS.SE2_worst_plausible_E18_d1.simulationHours).toBe(455);
  });

  it("records provenance for every archived preset", () => {
    for (const definition of PRESET_DEFINITIONS) {
      if (definition.archiveFamily === null) {
        expect(definition.sourceBatchFile).toBeNull();
      } else {
        expect(definition.sourceBatchFile, `${definition.id} has no source file`).toMatch(
          /^Geography\/batch\/.+\.xml$/u,
        );
      }
      expect(definition.label.length).toBeGreaterThan(0);
      expect(definition.notes.length).toBeGreaterThan(0);
    }
  });
});

describe("preset lookup", () => {
  it("resolves known ids and rejects unknown ones", () => {
    expect(presetConfig("A_present_day")).toEqual(PRESETS.A_present_day);
    expect(presetConfig("not_a_preset")).toBeUndefined();
    expect(presetDefinition("SE_severe_v1_E18")?.archiveFamily).toBe("scenario-e/SE-E18-seed42");
    expect(presetDefinition("not_a_preset")).toBeUndefined();
  });
});
