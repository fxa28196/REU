/**
 * wp8-fixtures.ts — synthetic runs for the WP8 gate corrosion suite.
 *
 * A corrosion test is only worth anything if the *baseline* is green: "the gate
 * went red" proves nothing unless the same input with one thing put back goes
 * green. So this module builds one run that passes every ported gate, and
 * exposes it through a single `overrides` seam. Each corrosion case then
 * changes exactly one thing and asserts exactly one check flips.
 *
 * The fixture is deliberately *shaped like* the archive rather than copied from
 * it: 1,000 residents chosen so the realised shares are exact decimals
 * (356 aware, 284 heavy belongings, 117 pets, 4 dependents — the archived
 * targets to four places), the v2 59-column-era column set for the columns the
 * gates read, a 41-parameter manifest, and a two-wave closure schedule. Nothing
 * here is an oracle: the *expected values* in every archive test come from the
 * archive, and these fixtures only ever answer "can this gate fail?".
 */

import {
  frameOf,
  type ManifestJson,
  type RawFrame,
  type RunView,
  runFromDocuments,
} from "../../src/harness/index.js";

/** Columns of the fixture `agents.csv` — the gate-relevant subset of v2. */
export const FIXTURE_AGENT_COLUMNS: readonly string[] = [
  "agent_id",
  "sim_id",
  "commit",
  "random_seed",
  "data_version",
  "time_started_tick",
  "time_started_local",
  "final_state",
  "total_travel_distance_m",
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
  "capacity",
  "final_occupancy",
  "refused_count",
  "policy_refused",
];

/** Residents in the fixture population. Chosen so every share is exact. */
export const FIXTURE_N = 1000;

/** Counts that make the realised shares equal the archived targets exactly. */
export const FIXTURE_MARGINALS = {
  aware: 356,
  heavyBelongings: 284,
  pet: 117,
  dependents: 4,
} as const;

/**
 * Residents 0…116 carry both belongings and a pet, so the high-barrier stratum
 * (gate (f)) has 117 members; the first 50 of them never depart.
 */
export const FIXTURE_HIGH_BARRIER = FIXTURE_MARGINALS.pet;
export const FIXTURE_HIGH_BARRIER_STAYED = 50;

export interface AgentOverride {
  /** Row index to patch. */
  readonly row: number;
  readonly column: string;
  readonly value: string;
}

export interface FixtureOptions {
  readonly name?: string;
  /** Per-cell patches applied after the base population is generated. */
  readonly agentPatches?: readonly AgentOverride[];
  /** Whole-column replacement, `(rowIndex) => cellText`. */
  readonly agentColumns?: Readonly<Record<string, (row: number) => string>>;
  /** Columns to drop from `agents.csv` entirely. */
  readonly dropAgentColumns?: readonly string[];
  /** Deep-ish patches to `simulation.json`, merged one level into each block. */
  readonly manifest?: {
    readonly parameters?: Readonly<Record<string, unknown>>;
    readonly dropParameters?: readonly string[];
    readonly decisionLayer?: Readonly<Record<string, unknown>> | null;
    readonly closures?: Readonly<Record<string, unknown>> | null;
    readonly population?: Readonly<Record<string, unknown>>;
    readonly sourceIntegrity?: Readonly<Record<string, unknown>> | null;
  };
  readonly shelterPatches?: readonly AgentOverride[];
}

/** The 21 Phase-E parameters at the archived baseline-real values. */
const E_PARAM_VALUES: Readonly<Record<string, number>> = {
  enableDecisionLayer: 1,
  pAwareInit: 0.356,
  pHeavyBelongings: 0.284,
  pHasPet: 0.117,
  pHasDependents: 0.004,
  groupSpeedDeltaMps: 0.06,
  lambdaOutreachPerDay: 0.0,
  informationRegime: 1,
  enableHazardDeparture: 1,
  sigmaTheta: 1.0,
  alphaHazard: -8.0,
  bRisk: 0.4,
  wOfficial: 1.1,
  gammaVuln: 0.25,
  riskHalfLifeH: 48.0,
  barrierBelongings: 0.26,
  barrierPet: 0.26,
  barrierDependents: 0.26,
  petPolicyDefault: 0,
  betaTravelTime: 1.0,
  betaCapacityPrior: 0.2,
};

/**
 * The 7 Scenario-E parameters plus `closureDraw`. `pushThetaThreshold` is 0.0
 * here because that is what every archived SE/SE2 manifest *executed* — the
 * Repast batch parser zeroes negative `constant_type="number"` constants, and
 * the manifests were truthful about it throughout. Web presets carry the
 * corrected −0.25; a fixture that pretended the archive did would be quietly
 * rewriting the record this project keeps on purpose.
 */
const SE_PARAM_VALUES: Readonly<Record<string, number>> = {
  smokeSeriesCode: 2,
  smokeScale: 1.0,
  closuresCode: 3,
  pStuck: 0.3,
  stuckDelayH: 3.0,
  pushThetaThreshold: 0.0,
  kPush: 1.0,
  closureDraw: 1,
};

/** Two waves, four edges, one duplicated pair — exercises k.5's `len(pairs)`. */
export const FIXTURE_SCHEDULE_FILE = "data/closures/fixture_closures.csv";
export const FIXTURE_SCHEDULE_CSV = [
  "node_a,node_b,activation_hour,label,kind",
  "100,200,12,ALPHA BRG,bridge",
  "300,400,12,BETA ST,arterial",
  "500,600,40,GAMMA ST,arterial",
  "700,800,40,DELTA AVE,local",
  "",
].join("\r\n");
export const FIXTURE_SCHEDULE_ROWS = 4;
export const FIXTURE_SCHEDULE_PAIRS = 4;
export const FIXTURE_SCHEDULE_WAVES: readonly number[] = [12, 40];

function baseAgentCell(column: string, i: number): string {
  switch (column) {
    case "agent_id":
      return `Site ${i}`;
    case "sim_id":
      return "sim-20260731-000000-seed42";
    case "commit":
      return "0".repeat(40);
    case "random_seed":
      return "42";
    case "data_version":
      return "abcdef012345";
    case "time_started_tick":
      return i < FIXTURE_HIGH_BARRIER_STAYED ? "" : "960";
    case "time_started_local":
      return i < FIXTURE_HIGH_BARRIER_STAYED ? "" : "2020-09-16T00:00";
    case "final_state":
      return i < FIXTURE_HIGH_BARRIER_STAYED ? "PRE_EVAC" : "SHELTERED";
    case "total_travel_distance_m":
      return i < FIXTURE_HIGH_BARRIER_STAYED ? "0.00" : "1234.56";
    case "aware_initial":
      return i < FIXTURE_MARGINALS.aware ? "1" : "0";
    case "aware_tick":
      return i < FIXTURE_MARGINALS.aware ? "0" : "";
    case "heavy_belongings":
      return i < FIXTURE_MARGINALS.heavyBelongings ? "1" : "0";
    case "has_pet":
      return i < FIXTURE_MARGINALS.pet ? "1" : "0";
    case "has_dependents":
      return i < FIXTURE_MARGINALS.dependents ? "1" : "0";
    case "theta_z":
      return "0.000000";
    case "blockages_encountered":
    case "push_throughs":
    case "reroutes":
    case "stuck_events":
      return "0";
    default:
      return "";
  }
}

function buildAgents(options: FixtureOptions): RawFrame {
  const dropped = new Set(options.dropAgentColumns ?? []);
  const columns = FIXTURE_AGENT_COLUMNS.filter((c) => !dropped.has(c));
  const rows: string[][] = [];
  for (let i = 0; i < FIXTURE_N; i += 1) {
    rows.push(
      columns.map((c) => {
        const custom = options.agentColumns?.[c];
        return custom === undefined ? baseAgentCell(c, i) : custom(i);
      }),
    );
  }
  for (const patch of options.agentPatches ?? []) {
    const ci = columns.indexOf(patch.column);
    if (ci < 0) {
      throw new Error(`fixture: no agents column '${patch.column}' to patch`);
    }
    const row = rows[patch.row];
    if (row === undefined) {
      throw new Error(`fixture: no agents row ${patch.row} to patch`);
    }
    row[ci] = patch.value;
  }
  return frameOf("fixture/agents.csv", columns, rows);
}

function buildShelters(options: FixtureOptions): RawFrame {
  const rows: string[][] = [
    ["S1", "Alpha Center", "500", "400", "12", "0"],
    ["S2", "Beta Center", "600", "550", "3", "0"],
  ];
  for (const patch of options.shelterPatches ?? []) {
    const ci = FIXTURE_SHELTER_COLUMNS.indexOf(patch.column);
    if (ci < 0) {
      throw new Error(`fixture: no shelters column '${patch.column}' to patch`);
    }
    const row = rows[patch.row];
    if (row === undefined) {
      throw new Error(`fixture: no shelters row ${patch.row} to patch`);
    }
    row[ci] = patch.value;
  }
  return frameOf("fixture/shelters.csv", FIXTURE_SHELTER_COLUMNS, rows);
}

function buildManifest(options: FixtureOptions): ManifestJson {
  const m = options.manifest ?? {};
  const parameters: Record<string, unknown> = {
    numAgents: FIXTURE_N,
    minutesPerTick: 1.0,
    simulationHours: 455,
    randomSeed: 42,
    ...E_PARAM_VALUES,
    ...SE_PARAM_VALUES,
    ...(m.parameters ?? {}),
  };
  for (const name of m.dropParameters ?? []) {
    delete parameters[name];
  }

  const decision =
    m.decisionLayer === null
      ? undefined
      : {
          enabled: true,
          n_sampled: FIXTURE_N,
          realised_aware: FIXTURE_MARGINALS.aware / FIXTURE_N,
          realised_heavy_belongings: FIXTURE_MARGINALS.heavyBelongings / FIXTURE_N,
          realised_pet: FIXTURE_MARGINALS.pet / FIXTURE_N,
          realised_dependents: FIXTURE_MARGINALS.dependents / FIXTURE_N,
          ...(m.decisionLayer ?? {}),
        };

  const closures =
    m.closures === null
      ? undefined
      : {
          code: SE_PARAM_VALUES["closuresCode"],
          schedule_file: FIXTURE_SCHEDULE_FILE,
          scheduled_undirected_edges: FIXTURE_SCHEDULE_ROWS,
          matching_graph_edges: FIXTURE_SCHEDULE_ROWS,
          wave_hours: [...FIXTURE_SCHEDULE_WAVES],
          blocked_edges_at_end: FIXTURE_SCHEDULE_PAIRS,
          closure_version_at_end: FIXTURE_SCHEDULE_WAVES.length,
          ...(m.closures ?? {}),
        };

  const manifest: Record<string, unknown> = {
    schema: "reu-wildfire-shelter-abm/simulation/v1",
    reproducibility: {
      random_seed: 42,
      sim_id: "sim-20260731-000000-seed42",
      parameters,
      ...(m.sourceIntegrity === null
        ? {}
        : { source_integrity: { git_working_tree_dirty: false, ...(m.sourceIntegrity ?? {}) } }),
    },
    population: {
      n_agents: FIXTURE_N,
      pre_evac: FIXTURE_HIGH_BARRIER_STAYED,
      sheltered: FIXTURE_N - FIXTURE_HIGH_BARRIER_STAYED,
      en_route: 0,
      unreachable: 0,
      refused_all_full: 0,
      unaware: 0,
      ...(m.population ?? {}),
    },
  };
  if (decision !== undefined) {
    manifest["decision_layer"] = decision;
  }
  if (closures !== undefined) {
    manifest["closures"] = closures;
  }
  return manifest;
}

/**
 * A {@link RunView} over hand-built frames. Bypasses `runFromDocuments` so a
 * fixture can hold a deliberately odd column set without also having to be
 * serialisable through the archive CSV dialect.
 */
export function fixtureRun(options: FixtureOptions = {}): RunView {
  const agents = buildAgents(options);
  const shelters = buildShelters(options);
  const manifest = buildManifest(options);
  const name = options.name ?? "FIXTURE-SE2-d1-seed42";
  return {
    name,
    agents,
    shelters,
    manifest,
    get repro(): ManifestJson {
      return (manifest["reproducibility"] ?? {}) as ManifestJson;
    },
    get params(): ManifestJson {
      return ((manifest["reproducibility"] as ManifestJson | undefined)?.["parameters"] ??
        {}) as ManifestJson;
    },
    get population(): ManifestJson {
      return (manifest["population"] ?? {}) as ManifestJson;
    },
    get decision(): ManifestJson {
      return (manifest["decision_layer"] ?? {}) as ManifestJson;
    },
    num(column: string) {
      return agents.num(column);
    },
    hasEBlock() {
      return ["aware_initial", "aware_tick", "heavy_belongings", "has_pet", "has_dependents", "theta_z"].every(
        (c) => agents.has(c),
      );
    },
  };
}

/**
 * Serialise a fixture through the real CSV/JSON round trip, so at least one
 * corrosion case exercises the same `runFromDocuments` path the engine and the
 * archive use rather than only the in-memory shortcut.
 */
export function fixtureRunViaDocuments(options: FixtureOptions = {}): RunView {
  const run = fixtureRun(options);
  const toCsv = (frame: RawFrame): string =>
    [frame.columns.join(","), ...frame.rows.map((r) => r.join(","))].join("\r\n") + "\r\n";
  return runFromDocuments({
    name: run.name,
    agentsCsv: toCsv(run.agents),
    sheltersCsv: toCsv(run.shelters),
    simulationJson: JSON.stringify(run.manifest),
  });
}
