/**
 * definitions.ts — the source of truth for the shipped presets.
 *
 * PORT_MAP §3.3 bundle values, resolved against the read-only batch files in
 * `Geography/batch/`. Each definition is expressed as an override set over the
 * behaviour-preserving base, and materialised to a fully-explicit 41-parameter
 * JSON file by `pipeline/scripts/build-presets.ts`. `test/presets.test.ts` pins
 * the JSON to the materialised object, so the two can never drift.
 *
 * WHY THE JSON IS FULLY EXPLICIT (plan §6.3 / R7): a difference between two
 * configs is the only thing that can explain a difference between two runs. A
 * preset that leaned on an omitted-parameter default would make that false, and
 * would also re-import the Repast batch-fallback semantics the browser build
 * deliberately does not have (plan Q2: no browser path exercises a fallback).
 *
 * ── Ambiguities in PORT_MAP §3.3 and how they were resolved ────────────────
 *
 * 1. The A/B/C three-arm bundle is described as "no E/SE params (all inert
 *    fallbacks)". Geography/batch/batch_params_2026_{A,B,C}_seed42.xml confirm
 *    it: the files carry exactly ten parameters. The remaining 31 are written
 *    here at the values ContextCreator's `intParam`/`doubleParam` calls fall
 *    back to (verified line by line against ContextCreator.java 248–322), so the
 *    explicit preset executes identically to the archived ten-parameter file.
 *
 * 2. `triageReserveFraction` appears in no bundle except arm D. It is absent
 *    from every A/B/C/E0/ER/SE/SE2 batch file, so it takes its 0.0 fallback —
 *    which the Java source annotates as bit-identical to first-come-first-served.
 *    Confirmed present with value 0.10 in batch_params_2026_D_seed42_r10.xml.
 *
 * 3. `closureDraw` is absent from the SE (severe v1) batch files;
 *    batch_params_2026_SE_E18_seed42.xml carries closuresCode=1 with no draw. It
 *    therefore takes its fallback of 1. The parameter only selects a file for
 *    the code-3 worst family, so the value is inert at closuresCode 1.
 *
 * 4. `smokeSeriesCode` / `smokeScale` are absent from A/B/C/E0/ER files → 0 and
 *    1.0, the observed series at unit scale.
 *
 * 5. `pushThetaThreshold` is written −0.25 in the SE and SE2 presets, matching
 *    the batch files as authored and the V51 registered value. The archived runs
 *    EXECUTED 0.0, because Repast's batch loader zeroes negative
 *    `constant_type="number"` constants; the SE/SE2 files were later corrected to
 *    `constant_type="double"`. Web presets carry the corrected value (plan §6.4),
 *    so a live SE run is not bit-comparable to the archived SE run on this
 *    parameter, and the UI must say so.
 *
 * 6. The SE bundle's batch-file comment says "456 h" while its
 *    `simulationHours` value is 455. 455 is correct and is what the file
 *    executes: the window must be ≤ the series' slice count − 1. The comment is
 *    the error the smoke-window gate exists to catch.
 *
 * ── WP8 additions ──────────────────────────────────────────────────────────
 *
 * The WP8 set adds ER arm C, SE-E19, SE2-E18-d2 and the E0 nulls for arms B and
 * C, taking the shipped set to 13. Each archived preset now names the exact
 * archived run directories its parameter block must diff clean against
 * (`archivedManifests`), and `shared/test/preset-archive-parity.test.ts` reads
 * those `simulation.json` files as the expected value. That is a stronger check
 * than the batch-file comparison in `validation/test/preset-batch-parity.test.ts`
 * and a *different* one: the batch file says what was asked for, the manifest
 * says what executed. Both are run, because the whole point of the
 * `pushThetaThreshold` episode is that the two can disagree.
 *
 * 7. **The E0-null presets diff clean against all three archives at once.** The
 *    same 41-parameter config matches `phase-e/` (33 parameters, no Scenario-E
 *    block), `scenario-e/` (40, block present, no `closureDraw`) and
 *    `scenario-e-v2/` (41). The Scenario-E parameters the older manifests omit
 *    take exactly the code fallbacks the preset already carries, and the v2 null
 *    records `pushThetaThreshold: -0.25` — the code fallback — because those
 *    batch files omit the Scenario-E block entirely. So the nulls are the one
 *    family with no archive exception at all.
 *
 * 8. **Every SE / SE2 preset carries one documented archive exception**:
 *    `pushThetaThreshold`, preset −0.25 vs archived executed 0.0. See
 *    `archiveExceptions` and the `pushtheta-batch-zeroing` entry in the
 *    provenance ledger (`manifest.ts#PROVENANCE_QUIRKS`), which every UI surface
 *    showing these presets must render.
 */

import type { RunConfig, RunConfigPatch } from "../config.js";
import { orderRunConfig, parseRunConfig } from "../config.js";
import type { ParamName } from "../schema.js";

/** Ids of the shipped presets. Stable — they appear in permalinks. */
export const PRESET_IDS = [
  "default_fresh_run",
  "A_present_day",
  "B_capacity_meets_demand",
  "C_expanded_plus_new_sites",
  "E0_null_A",
  "E0_null_B",
  "E0_null_C",
  "ER_baseline_real_A",
  "ER_baseline_real_C",
  "SE_severe_v1_E18",
  "SE_severe_v1_E19",
  "SE2_worst_plausible_E18_d1",
  "SE2_worst_plausible_E18_d2",
] as const;

export type PresetId = (typeof PRESET_IDS)[number];

/**
 * A parameter on which a preset deliberately differs from the archived manifest
 * it otherwise reproduces.
 *
 * There is exactly one such parameter in the whole shipped set. The type exists
 * so the exception has to be *declared and explained* — pointing at a ledger
 * entry — rather than discovered as a diff nobody can account for.
 */
export interface ArchivedManifestException {
  readonly param: ParamName;
  /** What this preset carries. */
  readonly presetValue: number;
  /** What every listed archived manifest records as the EXECUTED value. */
  readonly archivedExecutedValue: number;
  /** Id of the `PROVENANCE_QUIRKS` entry that explains the difference. */
  readonly quirkNote: string;
}

export interface PresetDefinition {
  readonly id: PresetId;
  readonly label: string;
  /**
   * Primary archived run this preset reproduces (repo-relative under
   * `docs/runs/`), or `null` for a fresh-run default. Always the first entry of
   * {@link archivedManifests}.
   */
  readonly archiveFamily: string | null;
  /**
   * Every archived run directory whose `reproducibility.parameters` block this
   * preset must reproduce, repo-relative under `docs/runs/`. Empty for a
   * non-archived preset. An archived manifest may carry FEWER parameters than
   * the preset (33 / 40 / 41 across the three E archives); the contract is that
   * the preset agrees on every parameter the manifest names, modulo
   * {@link archiveExceptions}.
   */
  readonly archivedManifests: readonly string[];
  /** Declared, ledger-backed differences from those manifests. Usually empty. */
  readonly archiveExceptions: readonly ArchivedManifestException[];
  /**
   * `PROVENANCE_QUIRKS` ids that must be surfaced wherever this preset is used
   * — preset picker, compare view, export annotation.
   */
  readonly quirkNotes: readonly string[];
  /** Batch file the values came from, relative to the repo root. */
  readonly sourceBatchFile: string | null;
  readonly notes: string;
  readonly overrides: RunConfigPatch;
}

/**
 * The `pushThetaThreshold` exception, shared by every SE and SE2 preset.
 *
 * Archived SE/SE2 batch files were authored with −0.25 and every archived SE/SE2
 * manifest records the executed value as 0.0. The web presets carry the
 * registered −0.25 (plan §6.4 / `WP8-SPEC-archive-gates.md` §5.6 item 1), so
 * this is a deliberate, ledger-backed difference from the archive — not a
 * transcription error, and not something a diff-clean test may silently absorb.
 */
const PUSH_THETA_ARCHIVE_EXCEPTION: ArchivedManifestException = {
  param: "pushThetaThreshold",
  presetValue: -0.25,
  archivedExecutedValue: 0,
  quirkNote: "pushtheta-batch-zeroing",
};

/**
 * The behaviour-preserving base: PORT_MAP §3.2 common core plus every §2.6/§2.7
 * batch fallback. Materialising a preset is `{ ...BASE_CONFIG, ...overrides }`,
 * so a preset's `overrides` reads exactly like its batch file's delta.
 */
export const BASE_CONFIG: RunConfig = {
  // §3.2 common core (every 2026 batch file)
  numAgents: 6842,
  minutesPerTick: 1.0,
  walkingSpeedMps: 1.3,
  shelterArrivalDistanceM: 200.0,
  simulationHours: 312,
  randomSeed: 42,
  evacuationThresholdUgM3: 55.5,
  scenarioCode: 0,
  enableHeterogeneity: 1,
  respectShelterOpeningDates: 1,
  // Fallbacks — ContextCreator.java lines 248–322
  triageReserveFraction: 0.0,
  enableDecisionLayer: 0,
  pAwareInit: 1.0,
  pHeavyBelongings: 0.284,
  pHasPet: 0.117,
  pHasDependents: 0.0044,
  groupSpeedDeltaMps: 0.0,
  lambdaOutreachPerDay: 0.0,
  informationRegime: 0,
  enableHazardDeparture: 0,
  sigmaTheta: 0.0,
  alphaHazard: -8.0,
  bRisk: 0.4,
  wOfficial: 1.1,
  gammaVuln: 0.0,
  riskHalfLifeH: 48.0,
  barrierBelongings: 0.0,
  barrierPet: 0.0,
  barrierDependents: 0.0,
  petPolicyDefault: 1,
  betaTravelTime: 1.0,
  betaCapacityPrior: 0.0,
  shelterPolicyVariant: 0,
  smokeSeriesCode: 0,
  smokeScale: 1.0,
  closuresCode: 0,
  pStuck: 0.3,
  stuckDelayH: 3.0,
  pushThetaThreshold: -0.25,
  kPush: 1.0,
  closureDraw: 1,
};

/**
 * E0-null decision block: the layer is ON with every mechanism degenerate, so
 * the run must reproduce the archived arm it shadows. Written out in full rather
 * than by reference to BASE_CONFIG, because PORT_MAP §3.3 states it as a block
 * and the R3 identity depends on each value.
 */
const E0_NULL_BLOCK: RunConfigPatch = {
  enableDecisionLayer: 1,
  pAwareInit: 1.0,
  pHeavyBelongings: 0.284,
  pHasPet: 0.117,
  pHasDependents: 0.0044,
  groupSpeedDeltaMps: 0.0,
  lambdaOutreachPerDay: 0.0,
  informationRegime: 0,
  enableHazardDeparture: 0,
  sigmaTheta: 0.0,
  alphaHazard: -8.0,
  bRisk: 0.4,
  wOfficial: 1.1,
  gammaVuln: 0.0,
  riskHalfLifeH: 48.0,
  barrierBelongings: 0.0,
  barrierPet: 0.0,
  barrierDependents: 0.0,
  petPolicyDefault: 1,
  betaTravelTime: 1.0,
  betaCapacityPrior: 0.0,
  shelterPolicyVariant: 0,
};

/** E_REAL = the E0-null block with the twelve sourced values switched on. */
const E_REAL_BLOCK: RunConfigPatch = {
  ...E0_NULL_BLOCK,
  pAwareInit: 0.356,
  groupSpeedDeltaMps: 0.06,
  informationRegime: 1,
  enableHazardDeparture: 1,
  sigmaTheta: 1.0,
  gammaVuln: 0.25,
  barrierBelongings: 0.26,
  barrierPet: 0.26,
  barrierDependents: 0.26,
  petPolicyDefault: 0,
  betaCapacityPrior: 0.2,
  shelterPolicyVariant: 1,
};

/** Scenario-E severity block shared by SE (v1) and SE2 (worst-plausible v2). */
const SCENARIO_E_BLOCK: RunConfigPatch = {
  simulationHours: 455,
  smokeScale: 1.0,
  pStuck: 0.3,
  stuckDelayH: 3.0,
  pushThetaThreshold: -0.25,
  kPush: 1.0,
};

/**
 * The three E0-null archives every null preset must reproduce, parameterised by
 * arm. Note the directory-naming inconsistency in the archive itself: the
 * `phase-e/` runs carry the `-n6842-` infix and the two Scenario-E archives do
 * not. These strings are the real directory names, checked against the
 * filesystem by `preset-archive-parity.test.ts`.
 */
const e0NullArchives = (arm: "A" | "B" | "C"): readonly string[] => [
  `phase-e/E0null-${arm}-n6842-seed42`,
  `scenario-e/E0null-${arm}-seed42`,
  `scenario-e-v2/E0null-${arm}-seed42`,
];

export const PRESET_DEFINITIONS: readonly PresetDefinition[] = [
  {
    id: "default_fresh_run",
    label: "Default — fresh run (study configuration)",
    archiveFamily: null,
    archivedManifests: [],
    archiveExceptions: [],
    quirkNotes: [],
    sourceBatchFile: null,
    notes:
      "Plan Q2: a fresh UI run mirrors the Repast GUI schema / final study configuration " +
      "(heterogeneity on, opening dates on) with two deliberate deviations — the seed is " +
      "pinned to 42 instead of the GUI's unpinned draw, and numAgents is 2,037 rather than " +
      "the GUI's 500. Not an archived configuration: it earns ENGINE-CERTIFIED, never " +
      "ARCHIVE-VALIDATED.",
    overrides: { numAgents: 2037 },
  },
  {
    id: "A_present_day",
    label: "Arm A — present-day reality (36 sites, 2,234 beds)",
    archiveFamily: "present-day-three-arm/A-seed42",
    archivedManifests: ["present-day-three-arm/A-seed42"],
    archiveExceptions: [],
    quirkNotes: [],
    sourceBatchFile: "Geography/batch/batch_params_2026_A_seed42.xml",
    notes:
      "Every clean-air-capable facility the county actually operates today, at its real " +
      "address and real capacity. The decision layer is off, so all 22 Phase-E parameters " +
      "sit at their inert fallbacks.",
    overrides: { scenarioCode: 0 },
  },
  {
    id: "B_capacity_meets_demand",
    label: "Arm B — capacity meets demand at real locations (36 sites, 6,842 beds)",
    archiveFamily: "present-day-three-arm/B-seed42",
    archivedManifests: ["present-day-three-arm/B-seed42"],
    archiveExceptions: [],
    quirkNotes: [],
    sourceBatchFile: "Geography/batch/batch_params_2026_B_seed42.xml",
    notes:
      "Placement identical to arm A, capacity scaled to the population, so an A→B " +
      "difference is attributable to capacity alone.",
    overrides: { scenarioCode: 1 },
  },
  {
    id: "C_expanded_plus_new_sites",
    label: "Arm C — expanded capacity plus new sites (46 sites, 6,842 beds)",
    archiveFamily: "present-day-three-arm/C-seed42",
    archivedManifests: ["present-day-three-arm/C-seed42"],
    archiveExceptions: [],
    quirkNotes: [],
    sourceBatchFile: "Geography/batch/batch_params_2026_C_seed42.xml",
    notes:
      "Arm B's capacity redistributed across more doors. Facility count and per-facility " +
      "capacity differ from B only through the shelter CSV the scenario code selects.",
    overrides: { scenarioCode: 2 },
  },
  {
    id: "E0_null_A",
    label: "E0 null — decision layer on, every mechanism degenerate (arm A geometry)",
    archiveFamily: "phase-e/E0null-A-n6842-seed42",
    archivedManifests: e0NullArchives("A"),
    archiveExceptions: [],
    quirkNotes: [],
    sourceBatchFile: "Geography/batch/batch_params_2026_E0null_A_seed42.xml",
    notes:
      "The R3 vehicle: the decision layer runs with awareness at 1.0, L0 information, latch " +
      "departure, zero trait spread and zero barriers, so it must reproduce the archived " +
      "arm-A seed-42 run on every outcome column. Any divergence is a defect in the layer, " +
      "not a finding. One config, three archives: the same 41 parameters diff clean against " +
      "the phase-e null (33 recorded parameters), the scenario-e null (40) and the " +
      "scenario-e-v2 null (41).",
    overrides: { scenarioCode: 0, ...E0_NULL_BLOCK },
  },
  {
    id: "E0_null_B",
    label: "E0 null — decision layer on, every mechanism degenerate (arm B geometry)",
    archiveFamily: "phase-e/E0null-B-n6842-seed42",
    archivedManifests: e0NullArchives("B"),
    archiveExceptions: [],
    quirkNotes: [],
    sourceBatchFile: "Geography/batch/batch_params_2026_E0null_B_seed42.xml",
    notes:
      "The arm-B R3 vehicle. Same degenerate decision block as the arm-A null, arm B's " +
      "shelter file (36 sites, 6,842 beds) via scenarioCode 1. Reproduces " +
      "present-day-three-arm/B-seed42 (sheltered 6,264, unreachable 28, refused-all-full 550).",
    overrides: { scenarioCode: 1, ...E0_NULL_BLOCK },
  },
  {
    id: "E0_null_C",
    label: "E0 null — decision layer on, every mechanism degenerate (arm C geometry)",
    archiveFamily: "phase-e/E0null-C-n6842-seed42",
    archivedManifests: e0NullArchives("C"),
    archiveExceptions: [],
    quirkNotes: [],
    sourceBatchFile: "Geography/batch/batch_params_2026_E0null_C_seed42.xml",
    notes:
      "The arm-C R3 vehicle. Same degenerate decision block, arm C's shelter file (46 sites, " +
      "6,842 beds) via scenarioCode 2. Reproduces present-day-three-arm/C-seed42 " +
      "(sheltered 6,570, unreachable 28, refused-all-full 244).",
    overrides: { scenarioCode: 2, ...E0_NULL_BLOCK },
  },
  {
    id: "ER_baseline_real_A",
    label: "ER baseline-real — sourced decision layer (arm A geometry)",
    archiveFamily: "phase-e/ER-A-n6842-seed42",
    archivedManifests: ["phase-e/ER-A-n6842-seed42"],
    archiveExceptions: [],
    quirkNotes: [],
    sourceBatchFile: "Geography/batch/batch_params_2026_ER_A_seed42.xml",
    notes:
      "Awareness 0.356 measured for this event, L1 locations-only information, logistic " +
      "hazard departure, barriers at the Tanim midpoints, pets refused at unrecorded sites " +
      "(A-29), capacity prior on. Predictions were registered before any run.",
    overrides: { scenarioCode: 0, ...E_REAL_BLOCK },
  },
  {
    id: "ER_baseline_real_C",
    label: "ER baseline-real — sourced decision layer (arm C geometry)",
    archiveFamily: "phase-e/ER-C-n6842-seed42",
    archivedManifests: ["phase-e/ER-C-n6842-seed42"],
    archiveExceptions: [],
    quirkNotes: [],
    sourceBatchFile: "Geography/batch/batch_params_2026_ER_C_seed42.xml",
    notes:
      "The arm-A baseline-real decision block verbatim over arm C's geometry (46 sites, " +
      "6,842 beds, scenarioCode 2), so an ER-A vs ER-C difference is attributable to the " +
      "shelter network alone. Arm D (scenarioCode 7 + triageReserveFraction 0.10) is " +
      "archived too but is not shipped as a preset: it is a triage-lever arm, not a " +
      "geometry arm.",
    overrides: { scenarioCode: 2, ...E_REAL_BLOCK },
  },
  {
    id: "SE_severe_v1_E18",
    label: "SE severe v1 (E18) — CONSTRUCTED COUNTERFACTUAL, arm A geometry",
    archiveFamily: "scenario-e/SE-E18-seed42",
    archivedManifests: ["scenario-e/SE-E18-seed42"],
    archiveExceptions: [PUSH_THETA_ARCHIVE_EXCEPTION],
    quirkNotes: ["pushtheta-batch-zeroing"],
    sourceBatchFile: "Geography/batch/batch_params_2026_SE_E18_seed42.xml",
    notes:
      "ER baseline-real verbatim plus the severe v1 smoke series (embedded 1.75x, peak " +
      "984.75 ug/m3) and the base closure schedule (1 wave at hour 79, 18 edges), over a " +
      "455-hour window. Concentrations are a labelled counterfactual and must never be " +
      "reported as observed magnitudes.",
    overrides: {
      scenarioCode: 18,
      ...E_REAL_BLOCK,
      ...SCENARIO_E_BLOCK,
      smokeSeriesCode: 1,
      closuresCode: 1,
      closureDraw: 1,
    },
  },
  {
    id: "SE_severe_v1_E19",
    label: "SE severe v1 (E19) — CONSTRUCTED COUNTERFACTUAL, arm C geometry",
    archiveFamily: "scenario-e/SE-E19-seed42",
    archivedManifests: ["scenario-e/SE-E19-seed42"],
    archiveExceptions: [PUSH_THETA_ARCHIVE_EXCEPTION],
    quirkNotes: ["pushtheta-batch-zeroing"],
    sourceBatchFile: "Geography/batch/batch_params_2026_SE_E19_seed42.xml",
    notes:
      "SE-E18's configuration over arm C's geometry (scenarioCode 19 → 46 sites, 6,842 " +
      "beds), same severe v1 series and same 18-edge closure schedule. Capacity refusals are " +
      "NOT identically zero in this arm — SE-E19-seed44 records 2 — so a gate written for " +
      "E20's exact zeros would be wrong here.",
    overrides: {
      scenarioCode: 19,
      ...E_REAL_BLOCK,
      ...SCENARIO_E_BLOCK,
      smokeSeriesCode: 1,
      closuresCode: 1,
      closureDraw: 1,
    },
  },
  {
    id: "SE2_worst_plausible_E18_d1",
    label: "SE2 worst-plausible v2, draw 1 (E18) — CONSTRUCTED COUNTERFACTUAL, arm A geometry",
    archiveFamily: "scenario-e-v2/SE2-E18-d1-seed42",
    archivedManifests: ["scenario-e-v2/SE2-E18-d1-seed42"],
    archiveExceptions: [PUSH_THETA_ARCHIVE_EXCEPTION],
    quirkNotes: ["pushtheta-batch-zeroing"],
    sourceBatchFile: "Geography/batch/batch_params_2026_SE2_E18_d1_seed42.xml",
    notes:
      "Smoke anchored to the worst verified hourly PM2.5 over an intact non-evacuated city " +
      "(2,496.1 ug/m3, Florey station, Canberra, 5–6 Jan 2020; embedded 4.436x) with the " +
      "worst closure family (6 waves, 72 edges, first wave hours 2–6) at pre-committed draw " +
      "1. Closure effects must be reported as a range across draws 1–3, never from this one " +
      "schedule (A-34).",
    overrides: {
      scenarioCode: 18,
      ...E_REAL_BLOCK,
      ...SCENARIO_E_BLOCK,
      smokeSeriesCode: 2,
      closuresCode: 3,
      closureDraw: 1,
    },
  },
  {
    id: "SE2_worst_plausible_E18_d2",
    label: "SE2 worst-plausible v2, draw 2 (E18) — CONSTRUCTED COUNTERFACTUAL, arm A geometry",
    archiveFamily: "scenario-e-v2/SE2-E18-d2-seed42",
    archivedManifests: ["scenario-e-v2/SE2-E18-d2-seed42"],
    archiveExceptions: [PUSH_THETA_ARCHIVE_EXCEPTION],
    quirkNotes: ["pushtheta-batch-zeroing"],
    sourceBatchFile: "Geography/batch/batch_params_2026_SE2_E18_d2_seed42.xml",
    notes:
      "Draw 1's configuration with the second pre-committed worst schedule " +
      "(closures_E_r2_worst.csv: waves at hours 5, 92, 130, 163, 214, 263 rather than 3, 44, " +
      "72, 142, 265, 303). closureDraw selects a committed FILE — no runtime RNG is involved " +
      "— and it is the only parameter that differs from draw 1. Shipping two draws is what " +
      "makes A-34's range presentation possible in the UI; draw 3 is archived and can be " +
      "added the same way.",
    overrides: {
      scenarioCode: 18,
      ...E_REAL_BLOCK,
      ...SCENARIO_E_BLOCK,
      smokeSeriesCode: 2,
      closuresCode: 3,
      closureDraw: 2,
    },
  },
];

/**
 * Materialise a definition into a fully-explicit, schema-validated
 * 41-parameter config.
 *
 * The merge is written out rather than spread because `RunConfigPatch` is a
 * partial: `{ ...BASE_CONFIG, ...overrides }` would type every parameter as
 * possibly-undefined, and the fix must not be a cast that hides a real gap. The
 * result is parsed, so a definition that produces an invalid config throws here
 * rather than reaching a preset file.
 */
export function materialisePreset(definition: PresetDefinition): RunConfig {
  const merged: Record<string, number> = { ...BASE_CONFIG };
  for (const [name, value] of Object.entries(definition.overrides)) {
    if (value !== undefined) {
      merged[name] = value;
    }
  }
  return parseRunConfig(merged, `preset '${definition.id}'`);
}

/** Canonical on-disk JSON filename for a preset id. */
export function presetFileName(id: PresetId): string {
  return `${id}.json`;
}

/**
 * Canonical on-disk text for a preset: keys in manifest order, two-space indent,
 * LF line endings, trailing newline. Deterministic so `--check` and the unit
 * test can compare bytes rather than parsed values.
 */
export function serialisePreset(config: RunConfig): string {
  return `${JSON.stringify(orderRunConfig(config), null, 2)}\n`;
}
