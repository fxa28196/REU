/**
 * tier4-census.ts — the exact bit-match census, and the attribution of every
 * divergence in it.
 *
 * `IMPLEMENTATION_PLAN.md` §5.1 Tier 4:
 *
 * > **Tier 4 — structural identity where the shuffle is inert (measured,
 * > reported):** arms where capacity never binds (B, C expected — verified
 * > empirically) should reproduce per-agent rows exactly (key-joined, parity
 * > formatter). The replay harness publishes, per archived config, the exact
 * > bit-match census; **any divergence not attributable to the declared
 * > within-tick-order channel is a release-blocking bug.**
 *
 * ## Bound, do not explain
 *
 * `DR-WP7-order-attribution.md` set the method and this module follows it:
 * where the within-tick shuffle makes per-agent identity impossible, do **not**
 * assert an explanation — measure the consequences the channel must have, and
 * bound the observation against a permutation distribution sampled from the
 * channel itself. The WP7 result is the shape of the answer: 114 observed
 * `final_state` flips at arm A / seed 42, sitting at the 31st percentile of a
 * 200-permutation distribution running 94–144.
 *
 * A bound is not a proof of mechanism, and this module never claims one. What
 * it does claim is falsifiable: *there is no divergence outside the channel's
 * reach*, and {@link attributeDivergence} names the rows and columns that would
 * make that false.
 *
 * ## The sharp test, and why it is row-partitioned rather than per-column
 *
 * A per-column verdict ("`final_state` differs, that's the ordering channel")
 * is unfalsifiable — every outcome column differs for a reassigned resident, so
 * a routing bug hides inside the same column list. Two partitions make it
 * testable, and both are *mechanism* arguments rather than conveniences.
 *
 * **1. Residents nobody turned away must be byte-identical.** The only coupling
 * between residents in this model is shelter occupancy, and it is observed at
 * exactly one place: the door. A resident whose `door_refusals` is `0` in
 * **both** runs was never turned away in either, so no other resident's arrival
 * order ever entered their trajectory — same route, same ticks, same exposure
 * integral, same bytes. One differing cell on such a row is a divergence the
 * declared channel cannot reach, and is release-blocking.
 *
 * Measured across the twelve diverging working-set configurations: **zero** such
 * rows. Every single divergent row was refused at a door in at least one of the
 * two runs.
 *
 * **2. Nothing the world build decided may move.** `age_years`, `sex`,
 * `walking_speed_mps`, the comorbidity flags, `starting_encampment`,
 * `start_lon` / `start_lat`, `snap_gap_m`, `network_dist_to_shelter_m` and the
 * risk multipliers are all fixed before tick 1, by streams the within-tick
 * shuffle does not touch ({@link BUILD_TIME_COLUMNS}). Measured: not one of them
 * differs on any configuration. A sampler, snapping or graph defect lands here
 * and nowhere else, which is what makes their silence evidence.
 *
 * The `differentAssignment` / `sameAssignment` split is published too, but it is
 * **not** the release rule and must not be mistaken for one: `shelter_reached`
 * is empty for every refused resident, so two residents refused everywhere look
 * like "the same assignment" while their whole journey — which door they tried,
 * in what order, how far they walked — is exactly what the channel moved.
 * Treating that as a defect reports 30–190 false findings per configuration.
 *
 * These are also the partitions a real defect breaks. A 10 % error in the
 * movement step length leaves every aggregate gate green — that is measured
 * history on this project — but it moves `total_travel_distance_m` on residents
 * no door ever refused, which lands in partition 1 and turns the census red with
 * the column named.
 *
 * ## The caution this module is required to carry
 *
 * Where the ER / SE / SE2 replays reproduce per-agent rows exactly, that is
 * **not** evidence that the port matches Java exactly in general.
 *
 * It used to say why in a way that was false, and the correction matters enough
 * to record rather than quietly overwrite. The old text — copied into
 * `VALIDATION_REPORT.json` as `tiers.tier4.caution` — read "…with
 * `REFUSED_ALL_FULL = 1`: no shelter saturates, so the shuffle channel has
 * nothing to act on." Doors **do** saturate in those runs.
 * `docs/runs/scenario-e/SE-E18-seed42/shelters.csv` has 9 of its 36 sites at or
 * above capacity and 291 capacity refusals;
 * `docs/runs/phase-e/ER-A-n6842-seed42/shelters.csv` has 8 and 295. Across the
 * five configurations that match exactly it is 8–12 of 36 and 291–443, and
 * {@link SaturationFacts.capacityBinds} is `true` on every one of them.
 *
 * What is true is the thing the old sentence over-generalised from: those runs
 * end with `REFUSED_ALL_FULL = 1`, i.e. almost nobody is **ultimately** turned
 * away. That is a different claim. A resident refused at a full door can be
 * admitted at the next one, which is a per-door capacity refusal with no
 * terminal `REFUSED_ALL_FULL` — so "hardly anyone ends up shut out" and "no door
 * ever fills" are not interchangeable, and only the first is true here.
 *
 * The consequence runs the opposite way from the one the old text implied.
 * Because doors saturate, the within-tick shuffle-order channel **is** armed on
 * those configurations: 274–349 of 6,842 rows were refused at some door in at
 * least one run, so the channel had that many journeys it could have rearranged,
 * and rearranged none. The exact per-row agreement with the Java archive is
 * therefore *more* notable, not less.
 *
 * What still limits it is the channel's **reach**. The twelve diverging
 * configurations saturate 33–43 of their 36–46 sites, record 6,253–17,511
 * capacity refusals, leave 240–4,754 residents in `REFUSED_ALL_FULL` and contest
 * 2,711–5,128 rows — an order of magnitude more exposure — and there the
 * balanced `final_state` flips do appear. An exact match measured where the
 * reach is small is not a claim about where it is large.
 *
 * {@link SaturationFacts} is measured on the **archive** side of every config
 * precisely so the report can state which regime a config was in rather than
 * letting an exact match generalise. Since the correction, the report's caution
 * is *generated* from those numbers — see `tier4Caution()` in
 * `../report/schema.ts` — so prose and measurement cannot drift apart again.
 */

import type { RawFrame } from "./frame.js";
import { IDENTITY_EXCLUDE, WALLCLOCK_RE } from "./constants.js";

// ---------------------------------------------------------------------------
// exclusions
// ---------------------------------------------------------------------------

/**
 * Columns excluded from the cell census, and the reason each is excluded.
 *
 * `sim_id` / `commit` are `verify_E_runs.py`'s own `IDENTITY_EXCLUDE`.
 * `data_version` is the third: the headless runner records the honest
 * placeholder `"unavailable"` because it cannot read the Java build's data
 * version tag, and comparing a placeholder to a tag would report 6,842
 * divergences that say nothing about the model.
 *
 * `time_started_local` and `time_arrived_local` are deliberately **not** here.
 * The certified script's most load-bearing comment says why: they are sim-clock
 * instants derived from the tick and the smoke anchor, i.e. outcomes, and among
 * the sharpest identity evidence available.
 */
export const TIER4_EXCLUDED: Readonly<Record<string, string>> = Object.freeze({
  sim_id: "run identity (verify_E_runs.py IDENTITY_EXCLUDE)",
  commit: "run identity (verify_E_runs.py IDENTITY_EXCLUDE)",
  data_version:
    "environment: headless.ts records the placeholder 'unavailable' rather than inventing " +
    "the Java build's data_version_tag",
});

function isExcluded(column: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(TIER4_EXCLUDED, column) ||
    IDENTITY_EXCLUDE.has(column) ||
    WALLCLOCK_RE.test(column)
  );
}

// ---------------------------------------------------------------------------
// the census
// ---------------------------------------------------------------------------

export interface ColumnCensus {
  readonly column: string;
  readonly cells: number;
  readonly identical: number;
}

export interface BitMatchCensus {
  readonly table: string;
  readonly keyColumn: string;
  /** Keys present on both sides — the census is defined on the join. */
  readonly rows: number;
  readonly keysPortOnly: readonly string[];
  readonly keysArchiveOnly: readonly string[];
  readonly comparedColumns: readonly string[];
  readonly excludedColumns: readonly string[];
  /** Columns one side has and the other does not. */
  readonly columnsPortOnly: readonly string[];
  readonly columnsArchiveOnly: readonly string[];
  readonly comparedCells: number;
  readonly identicalCells: number;
  readonly rowsIdentical: number;
  readonly perColumn: readonly ColumnCensus[];
  /** Only the columns with at least one differing cell, worst first. */
  readonly divergentColumns: readonly ColumnCensus[];
}

function indexOf(frame: RawFrame, key: string): Map<string, readonly string[]> {
  const at = frame.columns.indexOf(key);
  if (at < 0) {
    throw new Error(`bitMatchCensus: no key column '${key}'`);
  }
  const out = new Map<string, readonly string[]>();
  for (const row of frame.rows) {
    out.set(row[at] ?? "", row);
  }
  return out;
}

/**
 * The exact cell-by-cell census of two runs' one table, joined on `key`.
 *
 * Raw text on both sides. No coercion, no tolerance, no rounding: a cell either
 * is the same bytes or it is not, which is the only definition under which
 * "bit-match census" means anything.
 */
export function bitMatchCensus(
  table: string,
  port: RawFrame,
  archive: RawFrame,
  key: string,
): BitMatchCensus {
  const portCols = port.columns;
  const archCols = archive.columns;
  const archSet = new Set(archCols);
  const portSet = new Set(portCols);
  const shared = portCols.filter((c) => archSet.has(c));
  const compared = shared.filter((c) => !isExcluded(c));
  const excluded = shared.filter((c) => isExcluded(c));

  const portRows = indexOf(port, key);
  const archRows = indexOf(archive, key);
  const keys = [...archRows.keys()].filter((k) => portRows.has(k));

  const pIdx = compared.map((c) => portCols.indexOf(c));
  const aIdx = compared.map((c) => archCols.indexOf(c));
  const identical = new Array<number>(compared.length).fill(0);
  let rowsIdentical = 0;
  for (const k of keys) {
    const pr = portRows.get(k) as readonly string[];
    const ar = archRows.get(k) as readonly string[];
    let rowSame = true;
    for (let c = 0; c < compared.length; c += 1) {
      if (pr[pIdx[c] as number] === ar[aIdx[c] as number]) {
        identical[c] = (identical[c] as number) + 1;
      } else {
        rowSame = false;
      }
    }
    if (rowSame) rowsIdentical += 1;
  }

  const perColumn: ColumnCensus[] = compared.map((column, c) => ({
    column,
    cells: keys.length,
    identical: identical[c] as number,
  }));

  return {
    table,
    keyColumn: key,
    rows: keys.length,
    keysPortOnly: [...portRows.keys()].filter((k) => !archRows.has(k)).sort(),
    keysArchiveOnly: [...archRows.keys()].filter((k) => !portRows.has(k)).sort(),
    comparedColumns: compared,
    excludedColumns: excluded,
    columnsPortOnly: portCols.filter((c) => !archSet.has(c)),
    columnsArchiveOnly: archCols.filter((c) => !portSet.has(c)),
    comparedCells: keys.length * compared.length,
    identicalCells: identical.reduce((a, b) => a + b, 0),
    rowsIdentical,
    perColumn,
    divergentColumns: perColumn
      .filter((c) => c.identical < c.cells)
      .sort((a, b) => a.identical - b.identical),
  };
}

// ---------------------------------------------------------------------------
// did capacity bind at all?
// ---------------------------------------------------------------------------

export interface SaturationFacts {
  /** `sum(refused_count) − sum(policy_refused)` over `shelters.csv`. */
  readonly capacityRefusals: number;
  readonly policyRefusals: number;
  /** Residents whose terminal state is `REFUSED_ALL_FULL`. */
  readonly refusedAllFull: number;
  readonly sheltered: number;
  readonly designedBeds: number;
  /** Sites whose `final_occupancy` reached their `capacity`. */
  readonly saturatedSites: number;
  readonly sites: number;
  /**
   * True when at least one site filled AND at least one resident was turned
   * away for capacity — the two conditions the within-tick order channel needs
   * in order to change who gets a bed.
   */
  readonly capacityBinds: boolean;
}

/** Measured on ONE run — call it on the ARCHIVE side, which is the oracle. */
export function saturationFacts(agents: RawFrame, shelters: RawFrame): SaturationFacts {
  const numeric = (frame: RawFrame, col: string): readonly number[] =>
    frame.has(col) ? frame.num(col) : [];
  const sum = (xs: readonly number[]): number =>
    xs.reduce((a, b) => a + (Number.isNaN(b) ? 0 : b), 0);

  const refused = Math.trunc(sum(numeric(shelters, "refused_count")));
  const policy = Math.trunc(sum(numeric(shelters, "policy_refused")));
  const capacityRefusals = refused - policy;

  const state = agents.column("final_state");
  const refusedAllFull = state.filter((s) => s === "REFUSED_ALL_FULL").length;
  const sheltered = state.filter((s) => s === "SHELTERED").length;

  const cap = shelters.column("capacity");
  const occ = shelters.has("final_occupancy") ? shelters.column("final_occupancy") : cap.map(() => "");
  let designedBeds = 0;
  let saturatedSites = 0;
  for (let i = 0; i < cap.length; i += 1) {
    if (cap[i] === "") continue;
    const c = Math.trunc(Number(cap[i]));
    designedBeds += c;
    if (occ[i] !== "" && Math.trunc(Number(occ[i])) >= c) saturatedSites += 1;
  }

  return {
    capacityRefusals,
    policyRefusals: policy,
    refusedAllFull,
    sheltered,
    designedBeds,
    saturatedSites,
    sites: cap.length,
    capacityBinds: saturatedSites > 0 && capacityRefusals > 0,
  };
}

// ---------------------------------------------------------------------------
// attribution
// ---------------------------------------------------------------------------

/**
 * Columns the world build fixes before tick 1, and which the within-tick
 * shuffle therefore cannot move.
 *
 * Sampled demographics and speeds, the campsite draw and its coordinates, the
 * snapped network distance, the risk multipliers, and the Phase-E attribute
 * block (drawn per resident at build time from its own streams). Divergence in
 * ANY of them is a world-build, sampler, snapping or graph defect and is
 * release-blocking.
 *
 * `snap_gap_m` is here deliberately, and it is the one to watch. README §6
 * divergence 9 records that the geodesic snap *distance* is tolerance-equal at
 * 1e-8 m rather than bit-equal — 6,390 of 6,842 rows differ in the raw double at
 * A-seed42, max |Δ| 3.181e-9 m. The 4-decimal output formatter absorbs that
 * entirely, so in the **written CSV** the column is byte-identical on all
 * seventeen configurations, and it is asserted as such. If it ever stops being
 * so, that is a genuinely new fact about the formatter or the geodesic and the
 * census should say so loudly rather than carry a standing exemption.
 */
export const BUILD_TIME_COLUMNS: readonly string[] = Object.freeze([
  "random_seed",
  "starting_encampment",
  "start_lon",
  "start_lat",
  "network_dist_to_shelter_m",
  "snap_gap_m",
  "scenario",
  "walking_speed_mps",
  "age",
  "age_years",
  "age_band",
  "sex",
  "mobility_limited",
  "mobility_category",
  "asthma",
  "asthma_flag",
  "copd",
  "copd_flag",
  "any_respiratory",
  "chronic_physical",
  "vulnerable_flag",
  "age_rr",
  "comorbidity_rr",
  "health_risk_multiplier",
  "aware_initial",
  "heavy_belongings",
  "has_pet",
  "has_dependents",
  "theta_z",
]);

export interface ContestPartition {
  /**
   * Rows whose `door_refusals` is `0` in BOTH runs — residents no shelter ever
   * turned away, and therefore residents no other resident's arrival order
   * could have reached.
   */
  readonly neverRefused: number;
  readonly neverRefusedBitIdentical: number;
  /** Release-blocking when non-zero. */
  readonly neverRefusedDivergent: number;
  /** Columns implicated on those rows, worst first: `column → rows`. */
  readonly neverRefusedDivergentColumns: Readonly<Record<string, number>>;
  /** Rows refused at least once in at least one run — the channel's reach. */
  readonly doorContested: number;
  readonly doorContestedDivergent: number;
  /**
   * Published for context, NOT a release rule: `shelter_reached` is empty for
   * every refused resident, so "same assignment" lumps together residents whose
   * journeys the channel rearranged completely. See the module doc.
   */
  readonly sameAssignment: number;
  readonly sameAssignmentDivergent: number;
  readonly differentAssignment: number;
  /** Build-time columns that moved. Must be empty; release-blocking otherwise. */
  readonly buildTimeColumnsDivergent: Readonly<Record<string, number>>;
}

/**
 * The only two `final_state` transitions the declared channel can produce.
 *
 * The channel is *the within-tick shuffle deciding who reaches the door
 * first*, so its entire output is a permutation of who occupies a finite set of
 * beds: a resident either keeps a bed someone else got, or gets one someone
 * else lost. `UNREACHABLE` is a graph property settled before any admission
 * decision and `PRE_EVAC` / `EN_ROUTE` are horizon states; none of them is
 * reachable by reordering arrivals at a door.
 *
 * Stated as a set rather than as "one side is SHELTERED" because those are not
 * the same rule, and the difference is a real defect class:
 * `SHELTERED → UNREACHABLE` satisfies the weaker one while being exactly the
 * kind of divergence that is NOT the shuffle.
 */
export const CHANNEL_TRANSITIONS: ReadonlySet<string> = new Set([
  "SHELTERED->REFUSED_ALL_FULL",
  "REFUSED_ALL_FULL->SHELTERED",
]);

export interface OrderChannelEvidence {
  /** (1) `final_state` flips, split by direction. */
  readonly shelteredLost: number;
  readonly shelteredGained: number;
  readonly nonShelterFlips: number;
  /** Every observed `archive->port` transition over the flipped rows. */
  readonly transitions: Readonly<Record<string, number>>;
  /** Transitions outside {@link CHANNEL_TRANSITIONS}. Must be empty. */
  readonly foreignTransitions: Readonly<Record<string, number>>;
  readonly balanced: boolean;
  /** (2) Sites whose admitted CARDINALITY differs. Must be zero. */
  readonly sitesWithDifferentAdmittedCount: number;
  readonly sites: number;
  /** (3) The `mean_travel_dist_m_admitted` 2×2, keyed `set/col`. */
  readonly meanTravel: {
    readonly sameSetSameCol: number;
    readonly sameSetDiffCol: number;
    readonly diffSetSameCol: number;
    readonly diffSetDiffCol: number;
  };
  /** (4) Residents admitted to the same site in both runs. */
  readonly coAdmitted: number;
  readonly coAdmittedDistanceTextDiffers: number;
  /**
   * …of those, the ones no door ever refused in either run. Their walk is
   * untouchable by arrival order, so a difference there is release-blocking
   * where the wider co-admitted count is merely informative: a resident refused
   * at one door and admitted at the next legitimately walks a different
   * distance when the order changes which door was full.
   */
  readonly coAdmittedNeverRefused: number;
  readonly coAdmittedNeverRefusedDistanceTextDiffers: number;
  /** (5) The door ledger closes against each side's own agents. */
  readonly doorLedgerPort: readonly [number, number];
  readonly doorLedgerArchive: readonly [number, number];
}

export type Tier4Verdict = "EXACT" | "ORDER-CHANNEL" | "UNEXPLAINED";

export interface EnvelopePlacement {
  readonly applicable: boolean;
  readonly reason: string;
  readonly streams?: number;
  readonly min?: number;
  readonly max?: number;
  readonly observed?: number;
  readonly inside?: boolean;
}

export interface Tier4Attribution {
  readonly runDir: string;
  readonly agents: BitMatchCensus;
  readonly shelters: BitMatchCensus;
  readonly saturation: SaturationFacts;
  readonly partition: ContestPartition;
  readonly order: OrderChannelEvidence | null;
  readonly envelope: EnvelopePlacement;
  readonly verdict: Tier4Verdict;
  /**
   * Every reason the divergence is NOT accounted for by the declared channel.
   * Empty is the only releasable value; non-empty is release-blocking and is
   * reported as such rather than argued away.
   */
  readonly unexplained: readonly string[];
}

function cellAt(frame: RawFrame, row: readonly string[], column: string): string {
  const at = frame.columns.indexOf(column);
  return at < 0 ? "" : (row[at] ?? "");
}

/** `shelter_id → the set of agent_ids admitted there`, from an `agents.csv`. */
function admittedSets(frame: RawFrame): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const id = frame.column("agent_id");
  const state = frame.column("final_state");
  const site = frame.column("shelter_reached");
  for (let i = 0; i < id.length; i += 1) {
    if (state[i] !== "SHELTERED") continue;
    const key = site[i] as string;
    let set = out.get(key);
    if (set === undefined) {
      set = new Set();
      out.set(key, set);
    }
    set.add(id[i] as string);
  }
  return out;
}

function partitionRows(port: RawFrame, archive: RawFrame, census: BitMatchCensus): ContestPartition {
  const portRows = indexOf(port, "agent_id");
  const archRows = indexOf(archive, "agent_id");
  const cols = census.comparedColumns;
  const pIdx = cols.map((c) => port.columns.indexOf(c));
  const aIdx = cols.map((c) => archive.columns.indexOf(c));
  const buildTime = new Set(BUILD_TIME_COLUMNS);

  let neverRefused = 0;
  let neverRefusedBit = 0;
  let neverRefusedDiv = 0;
  let contested = 0;
  let contestedDiv = 0;
  let sameAssignment = 0;
  let sameAssignmentDiv = 0;
  let different = 0;
  const implicated: Record<string, number> = {};
  const buildTimeMoved: Record<string, number> = {};

  for (const [k, ar] of archRows) {
    const pr = portRows.get(k);
    if (pr === undefined) continue;

    const bad: string[] = [];
    for (let c = 0; c < cols.length; c += 1) {
      if (pr[pIdx[c] as number] !== ar[aIdx[c] as number]) bad.push(cols[c] as string);
    }
    for (const column of bad) {
      if (buildTime.has(column)) buildTimeMoved[column] = (buildTimeMoved[column] ?? 0) + 1;
    }

    const sameState = cellAt(port, pr, "final_state") === cellAt(archive, ar, "final_state");
    const sameSite = cellAt(port, pr, "shelter_reached") === cellAt(archive, ar, "shelter_reached");
    if (sameState && sameSite) {
      sameAssignment += 1;
      if (bad.length > 0) sameAssignmentDiv += 1;
    } else {
      different += 1;
    }

    // Raw text, not `Number(...)`: a blank `door_refusals` is not a zero, and
    // reading it as one would move a resident into the untouched bucket on the
    // strength of a missing value.
    const untouched =
      cellAt(port, pr, "door_refusals") === "0" && cellAt(archive, ar, "door_refusals") === "0";
    if (!untouched) {
      contested += 1;
      if (bad.length > 0) contestedDiv += 1;
      continue;
    }
    neverRefused += 1;
    if (bad.length === 0) {
      neverRefusedBit += 1;
      continue;
    }
    neverRefusedDiv += 1;
    for (const column of bad) implicated[column] = (implicated[column] ?? 0) + 1;
  }

  return {
    neverRefused,
    neverRefusedBitIdentical: neverRefusedBit,
    neverRefusedDivergent: neverRefusedDiv,
    neverRefusedDivergentColumns: Object.fromEntries(
      Object.entries(implicated).sort(([, a], [, b]) => b - a),
    ),
    doorContested: contested,
    doorContestedDivergent: contestedDiv,
    sameAssignment,
    sameAssignmentDivergent: sameAssignmentDiv,
    differentAssignment: different,
    buildTimeColumnsDivergent: Object.fromEntries(
      Object.entries(buildTimeMoved).sort(([, a], [, b]) => b - a),
    ),
  };
}

function orderChannelEvidence(
  portAgents: RawFrame,
  archAgents: RawFrame,
  portShelters: RawFrame,
  archShelters: RawFrame,
): OrderChannelEvidence {
  const portRows = indexOf(portAgents, "agent_id");
  const archRows = indexOf(archAgents, "agent_id");

  let lost = 0;
  let gained = 0;
  let other = 0;
  let coAdmitted = 0;
  let coAdmittedDiff = 0;
  let coAdmittedClean = 0;
  let coAdmittedCleanDiff = 0;
  let doorPort = 0;
  let doorArchive = 0;
  const transitions: Record<string, number> = {};
  for (const [k, ar] of archRows) {
    const pr = portRows.get(k);
    if (pr === undefined) continue;
    const js = cellAt(archAgents, ar, "final_state");
    const ps = cellAt(portAgents, pr, "final_state");
    if (js !== ps) {
      const t = `${js}->${ps}`;
      transitions[t] = (transitions[t] ?? 0) + 1;
      if (js === "SHELTERED") lost += 1;
      else if (ps === "SHELTERED") gained += 1;
      else other += 1;
    } else if (
      js === "SHELTERED" &&
      cellAt(archAgents, ar, "shelter_reached") === cellAt(portAgents, pr, "shelter_reached")
    ) {
      coAdmitted += 1;
      const distanceDiffers =
        cellAt(archAgents, ar, "total_travel_distance_m") !==
        cellAt(portAgents, pr, "total_travel_distance_m");
      if (distanceDiffers) coAdmittedDiff += 1;
      if (
        cellAt(portAgents, pr, "door_refusals") === "0" &&
        cellAt(archAgents, ar, "door_refusals") === "0"
      ) {
        coAdmittedClean += 1;
        if (distanceDiffers) coAdmittedCleanDiff += 1;
      }
    }
    doorPort += Number(cellAt(portAgents, pr, "door_refusals"));
    doorArchive += Number(cellAt(archAgents, ar, "door_refusals"));
  }

  const mine = admittedSets(portAgents);
  const theirs = admittedSets(archAgents);
  const portSites = indexOf(portShelters, "shelter_id");
  const archSites = indexOf(archShelters, "shelter_id");
  let cardinalityDiff = 0;
  let sameSetSameCol = 0;
  let sameSetDiffCol = 0;
  let diffSetSameCol = 0;
  let diffSetDiffCol = 0;
  for (const [site, ar] of archSites) {
    const A = mine.get(site) ?? new Set<string>();
    const B = theirs.get(site) ?? new Set<string>();
    if (A.size !== B.size) cardinalityDiff += 1;
    const setSame = A.size === B.size && [...A].every((k) => B.has(k));
    const pr = portSites.get(site);
    const colSame =
      pr !== undefined &&
      cellAt(portShelters, pr, "mean_travel_dist_m_admitted") ===
        cellAt(archShelters, ar, "mean_travel_dist_m_admitted");
    if (setSame && colSame) sameSetSameCol += 1;
    else if (setSame) sameSetDiffCol += 1;
    else if (colSame) diffSetSameCol += 1;
    else diffSetDiffCol += 1;
  }

  const siteSum = (frame: RawFrame): number => {
    if (!frame.has("refused_count")) return 0;
    return frame.num("refused_count").reduce((a, b) => a + (Number.isNaN(b) ? 0 : b), 0);
  };

  return {
    shelteredLost: lost,
    shelteredGained: gained,
    nonShelterFlips: other,
    transitions: Object.fromEntries(Object.entries(transitions).sort(([, a], [, b]) => b - a)),
    foreignTransitions: Object.fromEntries(
      Object.entries(transitions)
        .filter(([t]) => !CHANNEL_TRANSITIONS.has(t))
        .sort(([, a], [, b]) => b - a),
    ),
    balanced: other === 0 && lost === gained,
    sitesWithDifferentAdmittedCount: cardinalityDiff,
    sites: archSites.size,
    meanTravel: { sameSetSameCol, sameSetDiffCol, diffSetSameCol, diffSetDiffCol },
    coAdmitted,
    coAdmittedDistanceTextDiffers: coAdmittedDiff,
    coAdmittedNeverRefused: coAdmittedClean,
    coAdmittedNeverRefusedDistanceTextDiffers: coAdmittedCleanDiff,
    doorLedgerPort: [siteSum(portShelters), doorPort],
    doorLedgerArchive: [siteSum(archShelters), doorArchive],
  };
}

export interface PermutationEnvelope {
  readonly final_state_divergence: {
    readonly streams: number;
    readonly min: number;
    readonly max: number;
    readonly observed: number;
  };
  /** The configuration the census was sampled at. */
  readonly configuration?: string;
}

export interface AttributionInputs {
  readonly runDir: string;
  readonly portAgents: RawFrame;
  readonly portShelters: RawFrame;
  readonly archiveAgents: RawFrame;
  readonly archiveShelters: RawFrame;
  /**
   * The committed permutation distribution, and the run directory it was
   * sampled at. Supplied only for that configuration: placing an observation in
   * a distribution sampled somewhere else would be the assertion
   * `DR-WP7-order-attribution.md` forbids.
   */
  readonly envelope?: { readonly census: PermutationEnvelope; readonly sampledAt: string };
}

/**
 * The full Tier-4 verdict for one archived configuration.
 *
 * Returns rather than throws. A release-blocking divergence has to appear in
 * the published report next to the census that found it, not as an exception
 * that stops the report being written.
 */
export function attributeDivergence(i: AttributionInputs): Tier4Attribution {
  const agents = bitMatchCensus("agents.csv", i.portAgents, i.archiveAgents, "agent_id");
  const shelters = bitMatchCensus("shelters.csv", i.portShelters, i.archiveShelters, "shelter_id");
  const saturation = saturationFacts(i.archiveAgents, i.archiveShelters);
  const partition = partitionRows(i.portAgents, i.archiveAgents, agents);

  const unexplained: string[] = [];
  if (agents.keysPortOnly.length > 0 || agents.keysArchiveOnly.length > 0) {
    unexplained.push(
      `agents.csv key sets differ: ${agents.keysPortOnly.length} port-only, ` +
        `${agents.keysArchiveOnly.length} archive-only`,
    );
  }
  if (shelters.keysPortOnly.length > 0 || shelters.keysArchiveOnly.length > 0) {
    unexplained.push(
      `shelters.csv key sets differ: ${shelters.keysPortOnly.length} port-only, ` +
        `${shelters.keysArchiveOnly.length} archive-only`,
    );
  }

  const cellsDiverge =
    agents.identicalCells < agents.comparedCells || shelters.identicalCells < shelters.comparedCells;
  if (!cellsDiverge) {
    return {
      runDir: i.runDir,
      agents,
      shelters,
      saturation,
      partition,
      order: null,
      envelope: {
        applicable: false,
        reason: "no divergence to place — every compared cell is byte-identical",
      },
      verdict: unexplained.length === 0 ? "EXACT" : "UNEXPLAINED",
      unexplained,
    };
  }

  // Divergence exists. Everything below decides whether it is the channel's.
  const order = orderChannelEvidence(
    i.portAgents,
    i.archiveAgents,
    i.portShelters,
    i.archiveShelters,
  );

  if (partition.neverRefusedDivergent > 0) {
    const cols = Object.entries(partition.neverRefusedDivergentColumns)
      .map(([c, n]) => `${c}×${n}`)
      .join(", ");
    unexplained.push(
      `${partition.neverRefusedDivergent} resident(s) were refused at NO door in EITHER run yet ` +
        "differ in bytes — no other resident's arrival order can reach those rows, because the " +
        `door is the only place occupancy is observed. Columns: ${cols}`,
    );
  }
  const movedAtBuild = Object.entries(partition.buildTimeColumnsDivergent);
  if (movedAtBuild.length > 0) {
    unexplained.push(
      `world-build column(s) moved: ${movedAtBuild.map(([c, n]) => `${c}×${n}`).join(", ")} — ` +
        "these are fixed before tick 1 by streams the within-tick shuffle never touches, so this " +
        "is a sampler / snapping / graph divergence, not an ordering one",
    );
  }
  if (!order.balanced) {
    unexplained.push(
      `final_state flips are not a balanced swap set: ${order.shelteredLost} lost / ` +
        `${order.shelteredGained} gained / ${order.nonShelterFlips} neither — a bed permutation ` +
        "conserves beds, so this is not one",
    );
  }
  const foreign = Object.entries(order.foreignTransitions);
  if (foreign.length > 0) {
    unexplained.push(
      `final_state transition(s) the within-tick order channel cannot produce: ` +
        `${foreign.map(([t, n]) => `${t}×${n}`).join(", ")} — the channel permutes who reaches a ` +
        `door first, so its only outputs are ${[...CHANNEL_TRANSITIONS].join(" and ")}`,
    );
  }
  if (order.sitesWithDifferentAdmittedCount > 0) {
    unexplained.push(
      `${order.sitesWithDifferentAdmittedCount} of ${order.sites} site(s) admitted a different ` +
        "NUMBER of residents — order redistributes which seat, never how many",
    );
  }
  if (order.meanTravel.sameSetDiffCol > 0) {
    unexplained.push(
      `${order.meanTravel.sameSetDiffCol} site(s) have an identical admitted set but a different ` +
        "mean_travel_dist_m_admitted — a per-agent DISTANCE defect wearing the channel's clothes",
    );
  }
  if (order.coAdmittedNeverRefusedDistanceTextDiffers > 0) {
    unexplained.push(
      `${order.coAdmittedNeverRefusedDistanceTextDiffers} of ${order.coAdmittedNeverRefused} ` +
        "residents who were admitted to the same shelter in both runs AND refused at no door in " +
        "either walked a different total_travel_distance_m — same door, same route, nobody in " +
        "their way, so any difference is ours",
    );
  }
  if (order.doorLedgerPort[0] !== order.doorLedgerPort[1]) {
    unexplained.push(
      `the port's door ledger does not close: shelters.refused_count sums to ` +
        `${order.doorLedgerPort[0]} against agents.door_refusals ${order.doorLedgerPort[1]}`,
    );
  }
  if (order.doorLedgerArchive[0] !== order.doorLedgerArchive[1]) {
    unexplained.push(
      `the ARCHIVE's door ledger does not close (${order.doorLedgerArchive[0]} vs ` +
        `${order.doorLedgerArchive[1]}) — the comparison's premise is broken, not the port`,
    );
  }
  if (!saturation.capacityBinds) {
    unexplained.push(
      "divergence with no binding capacity: no site saturated and no capacity refusal occurred " +
        "on the archive side, so the within-tick order channel had nothing to act on",
    );
  }

  const flips = order.shelteredLost + order.shelteredGained + order.nonShelterFlips;
  let envelope: EnvelopePlacement;
  if (i.envelope === undefined) {
    envelope = {
      applicable: false,
      reason:
        "no permutation census sampled at this configuration; a distribution sampled elsewhere " +
        "cannot place this observation (DR-WP7-order-attribution.md)",
      observed: flips,
    };
  } else if (i.envelope.sampledAt !== i.runDir) {
    envelope = {
      applicable: false,
      reason: `the committed census was sampled at ${i.envelope.sampledAt}, not ${i.runDir}`,
      observed: flips,
    };
  } else {
    const e = i.envelope.census.final_state_divergence;
    const inside = flips >= e.min && flips <= e.max;
    envelope = {
      applicable: true,
      reason: `${e.streams} independent permutation streams at ${i.envelope.sampledAt}`,
      streams: e.streams,
      min: e.min,
      max: e.max,
      observed: flips,
      inside,
    };
    if (!inside) {
      unexplained.push(
        `${flips} final_state flips sits OUTSIDE the sampled permutation support ` +
          `[${e.min}, ${e.max}] over ${e.streams} streams`,
      );
    }
  }

  return {
    runDir: i.runDir,
    agents,
    shelters,
    saturation,
    partition,
    order,
    envelope,
    verdict: unexplained.length === 0 ? "ORDER-CHANNEL" : "UNEXPLAINED",
    unexplained,
  };
}

/** One-line summary of a census, for a console table or a report header. */
export function censusLine(c: BitMatchCensus): string {
  const pct = c.comparedCells === 0 ? 0 : (100 * c.identicalCells) / c.comparedCells;
  return (
    `${c.table}: ${c.identicalCells}/${c.comparedCells} cells (${pct.toFixed(4)}%), ` +
    `${c.rowsIdentical}/${c.rows} rows bit-identical, ` +
    `${c.comparedColumns.length} columns compared, ${c.divergentColumns.length} divergent`
  );
}
