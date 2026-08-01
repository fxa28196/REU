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
import {
  E_PARAM_COUNT,
  E_PARAM_NAMES,
  PARAM_COUNT,
  PARAM_META,
  PARAM_NAMES,
  repastConstantType,
  RunConfigSchema,
  SE_PARAM_COUNT,
  SE_PARAM_NAMES,
  negativeValuedParams,
} from "../src/schema.js";
import { PROVENANCE_QUIRKS } from "../src/manifest.js";

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
  ER_baseline_real_C: {
    scenarioCode: 2,
    simulationHours: 312,
    enableDecisionLayer: 1,
    pAwareInit: 0.356,
    informationRegime: 1,
    enableHazardDeparture: 1,
    shelterPolicyVariant: 1,
    triageReserveFraction: 0,
  },
  E0_null_B: { scenarioCode: 1, enableDecisionLayer: 1, pAwareInit: 1, sigmaTheta: 0 },
  E0_null_C: { scenarioCode: 2, enableDecisionLayer: 1, pAwareInit: 1, sigmaTheta: 0 },
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
  SE_severe_v1_E19: {
    scenarioCode: 19,
    simulationHours: 455,
    smokeSeriesCode: 1,
    smokeScale: 1,
    closuresCode: 1,
    closureDraw: 1,
    pushThetaThreshold: -0.25,
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
  SE2_worst_plausible_E18_d2: {
    scenarioCode: 18,
    simulationHours: 455,
    smokeSeriesCode: 2,
    smokeScale: 1,
    closuresCode: 3,
    closureDraw: 2,
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

  it("ships the bundles WP8 adds", () => {
    // WP8 config surface: ER arms A and C, SE-E18, SE-E19, SE2-E18-d1,
    // SE2-E18-d2 and the E0 nulls for arms A/B/C.
    for (const required of [
      "E0_null_A",
      "E0_null_B",
      "E0_null_C",
      "ER_baseline_real_A",
      "ER_baseline_real_C",
      "SE_severe_v1_E18",
      "SE_severe_v1_E19",
      "SE2_worst_plausible_E18_d1",
      "SE2_worst_plausible_E18_d2",
    ]) {
      expect(PRESET_IDS).toContain(required);
    }
    expect(PRESET_IDS).toHaveLength(13);
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

  it("fails validation when any of the 21 E or 7 SE parameters is stripped", () => {
    // The same invariant as the test above, restated over the WP8 surface
    // specifically. It is deliberately NOT a replacement: the loop above covers
    // all 41 and must keep doing so. This one names the 28 the archive gates
    // (h) and (i) care about, so a future "make it optional" change to one of
    // them fails a test whose title says why it matters.
    const wp8Surface = [...E_PARAM_NAMES, ...SE_PARAM_NAMES];
    expect(wp8Surface).toHaveLength(E_PARAM_COUNT + SE_PARAM_COUNT);
    expect(new Set(wp8Surface).size).toBe(28);
    for (const id of PRESET_IDS) {
      for (const name of wp8Surface) {
        const stripped: Record<string, unknown> = { ...(PRESET_JSON[id] as object) };
        delete stripped[name];
        expect(
          RunConfigSchema.safeParse(stripped).success,
          `${id} without WP8 parameter ${name} was accepted`,
        ).toBe(false);
      }
      // closureDraw is gate (i)'s conditional extra and is outside SE_PARAM_NAMES;
      // the web schema still requires it unconditionally.
      const withoutDraw: Record<string, unknown> = { ...(PRESET_JSON[id] as object) };
      delete withoutDraw["closureDraw"];
      expect(RunConfigSchema.safeParse(withoutDraw).success).toBe(false);
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
    expect(PRESETS.SE_severe_v1_E19.simulationHours).toBe(455);
    expect(PRESETS.SE2_worst_plausible_E18_d1.simulationHours).toBe(455);
    expect(PRESETS.SE2_worst_plausible_E18_d2.simulationHours).toBe(455);
  });

  it("types every negative preset value as a Repast 'double', never a 'number'", () => {
    // Never-regress gotcha 4: Repast's batch loader silently zeroes negative
    // constant_type="number" constants (scripts/make_batch_params_E.py:113-122).
    // Two of the 28 WP8 parameters are negative by construction, so the rule
    // applies to this surface and is checked here rather than assumed.
    const negatives = new Set<string>();
    for (const id of PRESET_IDS) {
      const config = PRESETS[id];
      for (const name of negativeValuedParams(config)) {
        negatives.add(name);
        expect(repastConstantType(name, config[name]), `${id}.${name}`).toBe("double");
        expect(PARAM_META[name].negativeCapable, `${name} is negative but not flagged`).toBe(true);
      }
      // ... and no positive double is ever promoted, or the rule would be
      // vacuously satisfiable by typing everything "double".
      for (const name of PARAM_NAMES) {
        if (config[name] >= 0 && PARAM_META[name].kind === "double") {
          expect(repastConstantType(name, config[name]), `${id}.${name}`).toBe("number");
        }
      }
    }
    expect([...negatives].sort()).toEqual(["alphaHazard", "pushThetaThreshold"]);
    // Both live inside the WP8 surface: alphaHazard is one of the 21 E
    // parameters, pushThetaThreshold one of the 7 SE parameters.
    expect(E_PARAM_NAMES as readonly string[]).toContain("alphaHazard");
    expect(SE_PARAM_NAMES as readonly string[]).toContain("pushThetaThreshold");
  });

  it("records provenance metadata and quirk notes on every WP8 preset", () => {
    const ledgerIds = PROVENANCE_QUIRKS.map((q) => q.id);
    for (const definition of PRESET_DEFINITIONS) {
      if (definition.archiveFamily === null) {
        expect(definition.archivedManifests).toEqual([]);
      } else {
        expect(definition.archivedManifests[0], `${definition.id} primary archive`).toBe(
          definition.archiveFamily,
        );
        for (const runDir of definition.archivedManifests) {
          expect(runDir, `${definition.id} archive path`).toMatch(
            /^(?:present-day-three-arm|phase-e|scenario-e|scenario-e-v2)\/[A-Za-z0-9-]+$/u,
          );
        }
      }
      for (const id of definition.quirkNotes) {
        expect(ledgerIds, `${definition.id} cites unknown quirk ${id}`).toContain(id);
      }
      for (const e of definition.archiveExceptions) {
        expect(ledgerIds).toContain(e.quirkNote);
        expect(PARAM_NAMES as readonly string[]).toContain(e.param);
      }
    }
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
