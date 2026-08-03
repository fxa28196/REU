/**
 * wp9-fixtures.ts — synthetic runs for the WP9 gate corrosion suite.
 *
 * The WP8 fixture (`test/helpers/wp8-fixtures.ts`) carries only the columns the
 * WP8 gates read. The WP9 gates read a different slice of the export — the
 * heterogeneity block for (c), the exposure/travel/routing block for
 * `analyze_run`, the four-way occupancy witnesses for (b) — so this module
 * builds its own, deliberately *complete* run rather than extending a fixture
 * another work package owns.
 *
 * ## The contract this module has to keep
 *
 * A corrosion test proves nothing unless the **baseline is green**. "The gate
 * went red" is only evidence when the same input with one field put back goes
 * green, because otherwise the red might be an artefact of a fixture that was
 * never valid. Every corrosion case here therefore starts from
 * {@link wp9Fixture} with no overrides, asserts green, then changes exactly one
 * thing.
 *
 * ## Nothing here is an oracle
 *
 * The *expected values* in every WP9 archive test come from the archive and
 * from `WP8-SPEC-archive-gates.md`. These fixtures only ever answer the
 * question "can this gate fail?". A gate that has only ever been observed green
 * — on any data, archived or synthetic — is exactly the failure mode this
 * project has hit three times, and a fixture built by the same test that grades
 * it verifies only itself.
 *
 * ## The population
 *
 * 100 residents with an internally consistent story:
 *
 *  - rows 0–9 are UNAWARE: zero distance, blank departure tick, zero dose;
 *  - rows 10–19 are PRE_EVAC (high-barrier stayers, so gate (f) is green);
 *  - rows 20–99 are SHELTERED across two shelters (48 + 32 = 80);
 *  - `asthma_flag` alternates within the (c) stratum with **identical** gait
 *    and dose distributions in both cells, so the negative control is green by
 *    construction and a single injected asthma effect turns it red;
 *  - every exposure/travel aggregate in the manifest is computed from the rows
 *    by {@link buildManifest} using the same definitions `OutcomeLogger` uses,
 *    so `analyze_run`'s recomputation is green.
 */

import { runFromDocuments, type RunView } from "../../src/harness/index.js";
import { gini, nanMax, nanMean, nanSum, pctl } from "../../src/gates/index.js";

export const FIXTURE_N = 100;
export const FIXTURE_UNAWARE = 10;
export const FIXTURE_PRE_EVAC = 10;
export const FIXTURE_SHELTERED = FIXTURE_N - FIXTURE_UNAWARE - FIXTURE_PRE_EVAC;
/** Rows 20–67 go to S1, rows 68–99 to S2. */
export const FIXTURE_S1_OCC = 48;
export const FIXTURE_S2_OCC = FIXTURE_SHELTERED - FIXTURE_S1_OCC;

export const FIXTURE_SIM_ID = "sim-20260731-000000-seed42";
export const FIXTURE_COMMIT = "a".repeat(40);
export const FIXTURE_DATA_VERSION = "abcdef012345";
export const FIXTURE_MINUTES_PER_TICK = 1.0;
/** `smokeSeriesCode 2`'s registered unscaled peak. */
export const FIXTURE_FIELD_PEAK = 2496.1;

export const FIXTURE_AGENT_COLUMNS: readonly string[] = [
  "agent_id",
  "sim_id",
  "commit",
  "random_seed",
  "data_version",
  "starting_encampment",
  "start_lon",
  "start_lat",
  "shelter_reached",
  "reached_shelter",
  "time_started_tick",
  "time_started_local",
  "time_arrived_tick",
  "time_arrived_local",
  "travel_time_min",
  "total_travel_distance_m",
  "network_dist_to_shelter_m",
  "avg_pm25_ugm3",
  "peak_pm25_ugm3",
  "cumulative_dose_ugm3h",
  "exposure_while_traveling_ugm3h",
  "vwe_ugm3h",
  "hours_above_unhealthy",
  "age_rr",
  "comorbidity_rr",
  "final_state",
  "planned_route_m",
  "snap_gap_m",
  "door_refusals",
  "walking_speed_mps",
  "age_years",
  "sex",
  "mobility_limited",
  "asthma_flag",
  "copd_flag",
  "chronic_physical",
  "inhaled_dose_ug",
  "aware_initial",
  "aware_tick",
  "heavy_belongings",
  "has_pet",
  "has_dependents",
  "theta_z",
  "blockages_encountered",
  "push_throughs",
  "reroutes",
  "stuck_events",
];

export const FIXTURE_SHELTER_COLUMNS: readonly string[] = [
  "shelter_id",
  "name",
  "lon",
  "lat",
  "capacity",
  "operating",
  "peak_occupancy",
  "final_occupancy",
  "refused_count",
  "utilization",
  "mean_travel_dist_m_admitted",
  "policy_refused",
];

/** The 21 Phase-E parameters at archived baseline-real values. */
const E_PARAM_VALUES: Readonly<Record<string, unknown>> = {
  enableDecisionLayer: 1,
  pAwareInit: 0.9,
  pHeavyBelongings: 0.3,
  pHasPet: 0.2,
  pHasDependents: 0.1,
  groupSpeedDeltaMps: 0.06,
  lambdaOutreachPerDay: 0.0,
  informationRegime: 1,
  enableHazardDeparture: 1,
  sigmaTheta: 1.0,
  alphaHazard: -8.0,
  bRisk: 0.4,
  wOfficial: 1.1,
  gammaVuln: 0.0,
  riskHalfLifeH: 48.0,
  barrierBelongings: 0.26,
  barrierPet: 0.26,
  barrierDependents: 0.26,
  petPolicyDefault: 0,
  betaTravelTime: 1.0,
  betaCapacityPrior: 0.2,
};

const SE_PARAM_VALUES: Readonly<Record<string, unknown>> = {
  smokeSeriesCode: 2,
  smokeScale: 1.0,
  closuresCode: 0,
  pStuck: 0.3,
  stuckDelayH: 3.0,
  pushThetaThreshold: 0.0,
  kPush: 1.0,
};

export interface CellPatch {
  readonly row: number;
  readonly column: string;
  readonly value: string;
}

export interface Wp9FixtureOptions {
  readonly name?: string;
  readonly agentPatches?: readonly CellPatch[];
  readonly shelterPatches?: readonly CellPatch[];
  readonly dropAgentColumns?: readonly string[];
  /** Applied to `simulation.json` AFTER it is derived from the rows. */
  readonly manifestPatch?: (m: Record<string, unknown>) => void;
  /**
   * When true the manifest aggregates are recomputed from the (patched) rows,
   * so a row edit stays self-consistent. Default false: the point of most
   * corrosion cases is precisely that the manifest and the rows disagree.
   */
  readonly recomputeManifest?: boolean;
}

interface Row {
  readonly cells: Record<string, string>;
}

function baseRows(): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < FIXTURE_N; i += 1) {
    const unaware = i < FIXTURE_UNAWARE;
    const preEvac = !unaware && i < FIXTURE_UNAWARE + FIXTURE_PRE_EVAC;
    const sheltered = !unaware && !preEvac;
    const shelter = sheltered ? (i < FIXTURE_UNAWARE + FIXTURE_PRE_EVAC + FIXTURE_S1_OCC ? "S1" : "S2") : "";

    // Travel: 600 m planned + 10 m snap, walked exactly planned + snap.
    const planned = sheltered ? 600 + (i % 5) * 10 : 0;
    const snap = sheltered ? 10 : 0;
    const walked = sheltered ? planned + snap : 0;
    const startTick = unaware ? "" : "60";
    // 10 min per 600 m at 1 m/s, rounded to the tick grid.
    const arriveTick = sheltered ? 60 + 10 + (i % 5) : null;
    const travelMin = arriveTick === null ? "" : ((arriveTick - 60) * FIXTURE_MINUTES_PER_TICK).toFixed(2);

    // Exposure: everyone accrues dose; UNAWARE residents accrue the most
    // because they never leave. Two asthma cells share the same values.
    const dose = unaware ? 5000 + (i % 5) * 100 : preEvac ? 4000 + (i % 5) * 100 : 1000 + (i % 8) * 50;
    const avgPm = 120 + (i % 7);
    const peakPm = 300 + (i % 7);

    // (c) stratum: copd == 0 & mobility_limited == 0 for rows 0..79.
    //
    // Within it asthma alternates on `i % 2`, and every gait/dose value depends
    // on `floor(i / 2) % 8` — a bucket that is CONSTANT across each adjacent
    // pair, so the asthma-1 and asthma-0 cells hold the identical multiset of
    // values and both means agree exactly. That exactness is the point: it puts
    // the baseline at delta = 0 and z = 0, so a corrosion case's red is
    // attributable to the injected effect and not to how the fixture happened
    // to land. (Keying the values on `i % 8` instead would correlate the bucket
    // with asthma parity and sit the baseline at |z| ~ 2 — inside the gate, but
    // only just, and for no reason anyone could defend.)
    const inStratum = i < 80;
    const asthma = inStratum ? (i % 2 === 0 ? 1 : 0) : 0;
    const copd = inStratum ? 0 : 1;
    const mobility = 0;
    const bucket = Math.floor(i / 2) % 8;
    const speed = 1.2 + (bucket - 3.5) * 0.01;
    const inhaled = 2000 + (bucket - 3.5) * 100;

    const cells: Record<string, string> = {
      agent_id: `Site ${String(i).padStart(3, "0")}`,
      sim_id: FIXTURE_SIM_ID,
      commit: FIXTURE_COMMIT,
      random_seed: "42",
      data_version: FIXTURE_DATA_VERSION,
      starting_encampment: `25-${100000 + i}`,
      start_lon: (-122.6 - i * 0.0001).toFixed(6),
      start_lat: (45.5 + i * 0.0001).toFixed(6),
      shelter_reached: shelter,
      reached_shelter: sheltered ? "yes" : "no",
      time_started_tick: startTick,
      time_started_local: unaware ? "" : "2020-09-07T01:00",
      time_arrived_tick: arriveTick === null ? "" : String(arriveTick),
      time_arrived_local: arriveTick === null ? "" : "2020-09-07T01:10",
      travel_time_min: travelMin,
      total_travel_distance_m: walked.toFixed(2),
      network_dist_to_shelter_m: planned.toFixed(2),
      avg_pm25_ugm3: avgPm.toFixed(2),
      peak_pm25_ugm3: peakPm.toFixed(2),
      cumulative_dose_ugm3h: dose.toFixed(4),
      exposure_while_traveling_ugm3h: (sheltered ? 100 : 0).toFixed(4),
      vwe_ugm3h: dose.toFixed(4),
      hours_above_unhealthy: (unaware ? 24 : 12).toFixed(4),
      age_rr: "1.000",
      comorbidity_rr: "1.000",
      final_state: unaware ? "UNAWARE" : preEvac ? "PRE_EVAC" : "SHELTERED",
      planned_route_m: planned.toFixed(2),
      snap_gap_m: snap.toFixed(2),
      door_refusals: "0",
      walking_speed_mps: speed.toFixed(4),
      age_years: String(30 + (i % 40)),
      sex: i % 2 === 0 ? "MALE" : "FEMALE",
      mobility_limited: String(mobility),
      asthma_flag: String(asthma),
      copd_flag: String(copd),
      chronic_physical: String(i % 5 === 0 ? 1 : 0),
      inhaled_dose_ug: inhaled.toFixed(4),
      aware_initial: unaware ? "0" : "1",
      aware_tick: unaware ? "" : "0",
      // High-barrier stayers: rows 10–19 carry belongings AND a pet, so gate
      // (f) has a non-empty stratum with survivors.
      heavy_belongings: preEvac ? "1" : "0",
      has_pet: preEvac ? "1" : "0",
      has_dependents: "0",
      theta_z: "0.000000",
      blockages_encountered: "0",
      push_throughs: "0",
      reroutes: "0",
      stuck_events: "0",
    };
    rows.push({ cells });
  }
  return rows;
}

function column(rows: readonly Row[], name: string): number[] {
  return rows.map((r) => {
    const text = (r.cells[name] ?? "").trim();
    return text === "" ? Number.NaN : Number(text);
  });
}

function buildManifest(rows: readonly Row[]): Record<string, unknown> {
  const state = rows.map((r) => r.cells["final_state"] ?? "");
  const countOf = (s: string): number => state.filter((x) => x === s).length;
  const dose = column(rows, "cumulative_dose_ugm3h");
  const travel = column(rows, "total_travel_distance_m");
  const hours = column(rows, "hours_above_unhealthy");

  const round4 = (v: number): number => Math.round(v * 1e4) / 1e4;
  const round2 = (v: number): number => Math.round(v * 1e2) / 1e2;

  const shelterOcc: Record<string, number> = { S1: 0, S2: 0 };
  const shelterRefused: Record<string, number> = { S1: 12, S2: 3 };
  for (const r of rows) {
    const sid = r.cells["shelter_reached"] ?? "";
    if (r.cells["final_state"] === "SHELTERED" && sid in shelterOcc) {
      shelterOcc[sid] = (shelterOcc[sid] ?? 0) + 1;
    }
  }

  const parameters: Record<string, unknown> = {
    numAgents: rows.length,
    minutesPerTick: FIXTURE_MINUTES_PER_TICK,
    simulationHours: 455,
    randomSeed: 42,
    scenarioCode: 0,
    ...E_PARAM_VALUES,
    ...SE_PARAM_VALUES,
  };

  return {
    schema: "reu-wildfire-shelter-abm/simulation/v1",
    generated_utc: "2026-07-31T00:00:00",
    reproducibility: {
      random_seed: 42,
      sim_id: FIXTURE_SIM_ID,
      git_commit: FIXTURE_COMMIT,
      data_version_tag: FIXTURE_DATA_VERSION,
      parameters,
      input_datasets: [
        { file: "data/Streets.shp", sha256: "0".repeat(64) },
        { file: "data/airnow/aqs_hourly_pm25_synthetic_severe_v2.csv", sha256: "1".repeat(64) },
      ],
      source_integrity: {
        git_working_tree_dirty: false,
        files: [{ file: "data/Streets.shp", sha256: "0".repeat(64) }],
      },
    },
    smoke_field: {
      county: "Multnomah",
      start: "2020-09-07T00:00",
      hours: 456,
      peak_hourly_ugm3: FIXTURE_FIELD_PEAK,
      out_of_range_lookups: 0,
    },
    decision_layer: {
      enabled: true,
      n_sampled: rows.length,
      realised_aware: round4(nanMean(column(rows, "aware_initial"))),
      realised_heavy_belongings: round4(nanMean(column(rows, "heavy_belongings"))),
      realised_pet: round4(nanMean(column(rows, "has_pet"))),
      realised_dependents: round4(nanMean(column(rows, "has_dependents"))),
    },
    population: {
      n_agents: rows.length,
      pre_evac: countOf("PRE_EVAC"),
      sheltered: countOf("SHELTERED"),
      en_route: countOf("EN_ROUTE"),
      unreachable: countOf("UNREACHABLE"),
      refused_all_full: countOf("REFUSED_ALL_FULL"),
      unaware: countOf("UNAWARE"),
      exposure_ugm3h: {
        mean: round4(nanMean(dose)),
        median: round4(pctl(dose, 50)),
        min: round4(Math.min(...dose)),
        p25: round4(pctl(dose, 25)),
        p75: round4(pctl(dose, 75)),
        p90: round4(pctl(dose, 90)),
        max: round4(nanMax(dose)),
        total: round4(nanSum(dose)),
        gini: round4(gini(dose)),
      },
      vwe_ugm3h: {
        mean: round4(nanMean(dose)),
        median: round4(pctl(dose, 50)),
        total: round4(nanSum(dose)),
        gini: round4(gini(dose)),
      },
      total_person_hours_above_unhealthy: round2(nanSum(hours)),
      travel_m: {
        mean: round2(nanMean(travel)),
        median: round2(pctl(travel, 50)),
        max: round2(nanMax(travel)),
      },
    },
    shelters: [
      {
        id: "S1",
        capacity: 500,
        operating: true,
        peak_occupancy: shelterOcc["S1"],
        final_occupancy: shelterOcc["S1"],
        refused: shelterRefused["S1"],
      },
      {
        id: "S2",
        capacity: 600,
        operating: true,
        peak_occupancy: shelterOcc["S2"],
        final_occupancy: shelterOcc["S2"],
        refused: shelterRefused["S2"],
      },
    ],
    closures: { code: 0 },
  };
}

function buildShelters(rows: readonly Row[]): string[][] {
  const occ: Record<string, number> = { S1: 0, S2: 0 };
  for (const r of rows) {
    const sid = r.cells["shelter_reached"] ?? "";
    if (r.cells["final_state"] === "SHELTERED" && sid in occ) {
      occ[sid] = (occ[sid] ?? 0) + 1;
    }
  }
  return [
    ["S1", "Alpha Center", "-122.65", "45.55", "500", "true", String(occ["S1"]), String(occ["S1"]), "12", "0.0960", "620.00", "0"],
    ["S2", "Beta Center", "-122.70", "45.60", "600", "true", String(occ["S2"]), String(occ["S2"]), "3", "0.0533", "630.00", "0"],
  ];
}

/**
 * A {@link RunView} built through the real CSV/JSON reader, so every corrosion
 * case exercises `runFromDocuments` — the same path the archive and the engine
 * use — rather than an in-memory shortcut that could diverge from it.
 */
export function wp9Fixture(options: Wp9FixtureOptions = {}): RunView {
  const rows = baseRows();
  for (const patch of options.agentPatches ?? []) {
    const row = rows[patch.row];
    if (row === undefined) {
      throw new Error(`wp9Fixture: no agents row ${patch.row}`);
    }
    if (!(patch.column in row.cells)) {
      throw new Error(`wp9Fixture: no agents column '${patch.column}'`);
    }
    row.cells[patch.column] = patch.value;
  }

  // The manifest is derived from the ORIGINAL rows unless asked otherwise, so a
  // row edit puts the CSV and the manifest into disagreement — which is exactly
  // what most of these gates exist to detect.
  const manifest = buildManifest(options.recomputeManifest === true ? rows : baseRows());
  options.manifestPatch?.(manifest);

  const dropped = new Set(options.dropAgentColumns ?? []);
  const columns = FIXTURE_AGENT_COLUMNS.filter((c) => !dropped.has(c));
  const agentsCsv = [
    columns.join(","),
    ...rows.map((r) => columns.map((c) => r.cells[c] ?? "").join(",")),
  ].join("\r\n");

  const shelterRows = buildShelters(options.recomputeManifest === true ? rows : baseRows());
  for (const patch of options.shelterPatches ?? []) {
    const ci = FIXTURE_SHELTER_COLUMNS.indexOf(patch.column);
    const row = shelterRows[patch.row];
    if (ci < 0 || row === undefined) {
      throw new Error(`wp9Fixture: no shelters cell (${patch.row}, ${patch.column})`);
    }
    row[ci] = patch.value;
  }
  const sheltersCsv = [
    FIXTURE_SHELTER_COLUMNS.join(","),
    ...shelterRows.map((r) => r.join(",")),
  ].join("\r\n");

  return runFromDocuments({
    name: options.name ?? "WP9-FIXTURE-seed42",
    agentsCsv: `${agentsCsv}\r\n`,
    sheltersCsv: `${sheltersCsv}\r\n`,
    simulationJson: JSON.stringify(manifest),
  });
}

// ---------------------------------------------------------------------------
// The three-arm fixture set, for `verify_2026_runs.py`'s cross-run invariants.
//
// Those invariants compare runs to EACH OTHER, so a single run cannot corrode
// them. This builds a conformant A/B/C x seed set at the real scale (6,842
// residents, capacity 2234/6842/6842) with the minimal column set the gate
// reads, so a clean clone with no archive can still prove every cross-run check
// able to fail.
// ---------------------------------------------------------------------------

/** Columns `verify_2026_runs.py` reads: POP_COLS plus the outcome state. */
export const TWENTY26_AGENT_COLUMNS: readonly string[] = [
  "agent_id",
  "starting_encampment",
  "start_lon",
  "start_lat",
  "age_years",
  "sex",
  "mobility_limited",
  "asthma_flag",
  "copd_flag",
  "chronic_physical",
  "walking_speed_mps",
  "final_state",
];

export const TWENTY26_N = 6842;
const TWENTY26_ARM_CODE: Readonly<Record<string, number>> = { A: 0, B: 1, C: 2 };
const TWENTY26_CAP: Readonly<Record<string, number>> = { A: 2234, B: 6842, C: 6842 };
/** Per-arm sheltered counts; the rest are refused, with a fixed 28 unreachable. */
const TWENTY26_SHELTERED: Readonly<Record<string, number>> = { A: 2060, B: 6264, C: 6570 };
const TWENTY26_UNREACHABLE = 28;
/** One tag per arm — each arm loads a different shelter file, by design. */
const TWENTY26_TAG: Readonly<Record<string, string>> = {
  A: "aaaaaaaaaaaa",
  B: "bbbbbbbbbbbb",
  C: "cccccccccccc",
};

export interface ThreeArmDocs {
  readonly arm: string;
  readonly seed: number;
  readonly name: string;
  agentsCsv: string;
  sheltersCsv: string;
  simulationJson: string;
}

/**
 * One conformant arm/seed run. Population columns depend ONLY on the seed —
 * never on the arm — which is the invariant the POP_COLS digest tests; the
 * UNREACHABLE set is the first 28 residents in every arm, which is the
 * invariant the U-27 digest tests.
 *
 * The two U-19 negative controls are green by construction: the sheltered/
 * refused split is assigned by `agent_id` order and `asthma_flag` /
 * `chronic_physical` alternate on a stride coprime with it, so each stratum's
 * access rate matches the overall rate to well inside 2 SE.
 */
export function threeArmDocs(arm: string, seed: number): ThreeArmDocs {
  const sheltered = TWENTY26_SHELTERED[arm] as number;
  const rows: string[][] = [];
  for (let i = 0; i < TWENTY26_N; i += 1) {
    const unreachable = i < TWENTY26_UNREACHABLE;
    // Deterministic, seed-dependent, arm-INDEPENDENT scatter of who gets in.
    const rank = (i * 2_654_435_761 + seed * 97) % TWENTY26_N;
    const state = unreachable ? "UNREACHABLE" : rank < sheltered ? "SHELTERED" : "REFUSED_ALL_FULL";
    rows.push([
      `Site ${String(i).padStart(4, "0")}`,
      `25-${100000 + ((i * 7 + seed) % 5000)}`,
      (-122.6 - ((i * 13 + seed) % 1000) * 0.0001).toFixed(6),
      (45.5 + ((i * 17 + seed) % 1000) * 0.0001).toFixed(6),
      String(20 + ((i * 3 + seed) % 60)),
      i % 2 === 0 ? "MALE" : "FEMALE",
      String(i % 5 === 0 ? 1 : 0),
      String(i % 7 === 0 ? 1 : 0),
      String(i % 11 === 0 ? 1 : 0),
      String(i % 13 === 0 ? 1 : 0),
      (1.2 + ((i + seed) % 20) * 0.001).toFixed(4),
      state,
    ]);
  }

  const cap = TWENTY26_CAP[arm] as number;
  const shelterRows: string[][] = [
    ["S1", "Alpha", String(Math.floor(cap / 2)), "0"],
    ["S2", "Beta", String(cap - Math.floor(cap / 2)), "0"],
  ];

  const manifest = {
    schema: "reu-wildfire-shelter-abm/simulation/v1",
    reproducibility: {
      random_seed: seed,
      sim_id: `sim-fixture-seed${seed}`,
      git_commit: "f".repeat(40),
      data_version_tag: TWENTY26_TAG[arm],
      parameters: { numAgents: TWENTY26_N, scenarioCode: TWENTY26_ARM_CODE[arm], minutesPerTick: 1.0 },
      source_integrity: {
        git_working_tree_dirty: false,
        // Identical across every arm and seed: one model source, one build.
        files: [
          { file: "src/Model.java", sha256: "1".repeat(64) },
          { file: "src/Agent.java", sha256: "2".repeat(64) },
        ],
      },
    },
    population: { n_agents: TWENTY26_N },
  };

  return {
    arm,
    seed,
    name: `${arm}-seed${seed}`,
    agentsCsv: `${[TWENTY26_AGENT_COLUMNS.join(","), ...rows.map((r) => r.join(","))].join("\r\n")}\r\n`,
    sheltersCsv: `${[["shelter_id", "name", "capacity", "final_occupancy"].join(","), ...shelterRows.map((r) => r.join(","))].join("\r\n")}\r\n`,
    simulationJson: JSON.stringify(manifest),
  };
}

/** A conformant A/B/C set over the given seeds (default two seeds, six runs). */
export function threeArmSet(seeds: readonly number[] = [42, 43]): ThreeArmDocs[] {
  const out: ThreeArmDocs[] = [];
  for (const arm of ["A", "B", "C"]) {
    for (const seed of seeds) {
      out.push(threeArmDocs(arm, seed));
    }
  }
  return out;
}

/** Turn a doc set into the `ArmRun` shape `checkVerify2026` consumes. */
export function threeArmRuns(
  docs: readonly ThreeArmDocs[],
): { arm: string; seed: number; run: RunView }[] {
  return docs.map((d) => ({
    arm: d.arm,
    seed: d.seed,
    run: runFromDocuments({
      name: d.name,
      agentsCsv: d.agentsCsv,
      sheltersCsv: d.sheltersCsv,
      simulationJson: d.simulationJson,
    }),
  }));
}
