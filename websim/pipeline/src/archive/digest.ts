/**
 * digest.ts — turn one archived run directory into a compact display bundle.
 *
 * Plan §4 (`archive-bundles/*.json`) and §6.2 (archived-instant-display): every
 * preset must render the certified Java result the instant it is selected, while
 * the live TS run computes behind it. That means the bundle has to carry
 * everything the Run screen paints — headline metrics, the hourly state census,
 * per-shelter occupancy, the exposure histogram and the shelters table — at a
 * size that loads in well under two seconds on a throttled connection
 * (~100–200 KB, lazily fetched per preset).
 *
 * ── What is measured vs what is derived ────────────────────────────────────
 *
 * `headline`, `smoke_field`, `closures` and `executed_parameters` are copied
 * verbatim from `simulation.json`: they are the instrument's own report and are
 * never recomputed here, so a bundle can never quietly disagree with the
 * manifest it claims to display.
 *
 * `hourly`, `occupancy`, `exposure_histogram`, `marginals` and `identities` are
 * DERIVED from `agents.csv`, because the archive stores no time series at all —
 * only per-agent summary rows. The derivation is exact but its semantics are a
 * choice, so they are stated in the bundle itself (`hourly.semantics`) rather
 * than only in this comment:
 *
 *   state at hour h is sampled at tick h × ticksPerHour;
 *     not_departed = time_started_tick is empty, or > that tick
 *     en_route     = departed by that tick and not yet arrived
 *     sheltered    = time_arrived_tick ≤ that tick
 *
 * SHELTERED is terminal in the state machine (PORT_MAP §1.4), so `sheltered` and
 * every per-shelter occupancy series are monotone non-decreasing and the last
 * sample must equal `shelters.csv`'s `final_occupancy` — which the bundle checks
 * and reports as a gate rather than assuming.
 *
 * REFUSED_ALL_FULL and UNREACHABLE agents are counted in `en_route` for the
 * whole post-departure window: the archive records no tick at which an agent
 * gave up, and inventing one would be fabrication. `terminal_states` carries the
 * end-of-run truth, and the semantics string says so.
 */

import path from "node:path";

import { parseArchiveCsv, type ArchiveTable } from "./csv.js";
import { identify, readWithIdentity, type FileIdentity } from "./files.js";
import {
  hourlySampleCount,
  readManifestText,
  ticksPerHour,
  type SimulationManifest,
} from "./manifest.js";
import type { ArchivedRun } from "./discover.js";

export const ARCHIVE_BUNDLE_SCHEMA = "reu-wildfire-shelter-abm/archive-bundle/v1";

/** Terminal states in the closed vocabulary (PORT_MAP §5.1). */
export const TERMINAL_STATES = [
  "SHELTERED",
  "EN_ROUTE",
  "UNREACHABLE",
  "REFUSED_ALL_FULL",
  "PRE_EVAC",
  "UNAWARE",
] as const;

export interface GateResult {
  readonly id: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface ShelterRow {
  readonly shelter_id: string;
  readonly name: string;
  readonly lon: number | null;
  readonly lat: number | null;
  /** `null` = unlimited (blank capacity cell), never 0. */
  readonly capacity: number | null;
  readonly operating: boolean;
  readonly peak_occupancy: number;
  readonly final_occupancy: number;
  readonly refused_count: number;
  readonly utilization: number | null;
  readonly mean_travel_dist_m_admitted: number | null;
  /** Only present in the 12-column variant. */
  readonly policy_refused: number | null;
}

export interface ArchiveBundle {
  readonly schema: typeof ARCHIVE_BUNDLE_SCHEMA;
  readonly bundle_id: string;
  readonly archive: {
    readonly run_dir: string;
    readonly family: string;
    readonly preset_family: string;
    readonly seed: number | null;
    readonly files: readonly FileIdentity[];
    readonly manifest_repaired_nan: boolean;
  };
  readonly provenance: Record<string, unknown>;
  readonly executed_parameters: Readonly<Record<string, number>>;
  readonly scenario: string | null;
  readonly smoke_field: Readonly<Record<string, unknown>> | null;
  readonly decision_layer: Readonly<Record<string, unknown>> | null;
  readonly closures: Readonly<Record<string, unknown>> | null;
  readonly headline: Record<string, unknown>;
  readonly shelters: readonly ShelterRow[];
  readonly per_agent: PerAgentDigest | null;
  readonly gates: readonly GateResult[];
}

export interface PerAgentDigest {
  readonly rows: number;
  readonly columns: number;
  readonly terminal_states: Readonly<Record<string, number>>;
  readonly hourly: {
    readonly hours: number;
    readonly ticks_per_hour: number;
    readonly semantics: string;
    readonly not_departed: readonly number[];
    readonly en_route: readonly number[];
    readonly sheltered: readonly number[];
    /** Only for decision-layer runs (`aware_initial` present). */
    readonly unaware: readonly number[] | null;
  };
  readonly occupancy: {
    readonly shelter_ids: readonly string[];
    readonly hours: number;
    readonly note: string;
    /** One monotone non-decreasing series per shelter, in shelters.csv order. */
    readonly series: readonly (readonly number[])[];
  };
  readonly exposure_histogram: {
    readonly column: string;
    readonly bin_width: number;
    readonly bin_count: number;
    readonly note: string;
    readonly counts: readonly number[];
    readonly quantiles: Readonly<Record<string, number>>;
    readonly mean: number;
  };
  readonly marginals: Readonly<Record<string, number>> | null;
  readonly identities: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function at(row: readonly string[], index: number): string {
  return index < 0 ? "" : (row[index] ?? "");
}

function num(raw: string): number | null {
  if (raw === "") return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
}

function requireNum(raw: string, what: string): number {
  const v = num(raw);
  if (v === null) {
    throw new Error(`${what}: expected a number, got '${raw}'`);
  }
  return v;
}

/**
 * Round a bin width to 1/2/2.5/5 × 10^k so histogram edges are readable and
 * stable across runs of similar magnitude (edges are `i × bin_width`, which the
 * bundle documents instead of storing an edges array).
 */
export function niceBinWidth(raw: number): number {
  if (!(raw > 0)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const pow = 10 ** exp;
  const frac = raw / pow;
  const step = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10;
  return step * pow;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx] as number;
}

/** Round to 6 decimals so a share never carries meaningless FP tail digits. */
function share(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 1e6) / 1e6;
}

// ---------------------------------------------------------------------------
// shelters.csv
// ---------------------------------------------------------------------------

export function readShelters(table: ArchiveTable, label: string): readonly ShelterRow[] {
  const idIdx = table.requireIndex("shelter_id");
  const nameIdx = table.requireIndex("name");
  const lonIdx = table.index("lon");
  const latIdx = table.index("lat");
  const capIdx = table.requireIndex("capacity");
  const opIdx = table.requireIndex("operating");
  const peakIdx = table.requireIndex("peak_occupancy");
  const finalIdx = table.requireIndex("final_occupancy");
  const refIdx = table.requireIndex("refused_count");
  const utilIdx = table.index("utilization");
  const mtdIdx = table.index("mean_travel_dist_m_admitted");
  const polIdx = table.index("policy_refused");

  return table.rows.map((row) => ({
    shelter_id: at(row, idIdx),
    name: at(row, nameIdx),
    lon: num(at(row, lonIdx)),
    lat: num(at(row, latIdx)),
    capacity: num(at(row, capIdx)),
    operating: at(row, opIdx) === "true",
    peak_occupancy: requireNum(at(row, peakIdx), `${label} peak_occupancy`),
    final_occupancy: requireNum(at(row, finalIdx), `${label} final_occupancy`),
    refused_count: requireNum(at(row, refIdx), `${label} refused_count`),
    utilization: num(at(row, utilIdx)),
    mean_travel_dist_m_admitted: num(at(row, mtdIdx)),
    policy_refused: num(at(row, polIdx)),
  }));
}

// ---------------------------------------------------------------------------
// agents.csv → per-agent digest
// ---------------------------------------------------------------------------

interface AgentDerivation {
  readonly digest: PerAgentDigest;
  readonly gates: readonly GateResult[];
}

function deriveFromAgents(
  agents: ArchiveTable,
  shelters: readonly ShelterRow[],
  manifest: SimulationManifest,
  label: string,
): AgentDerivation {
  const n = agents.rows.length;
  const tph = ticksPerHour(manifest);
  const hours = hourlySampleCount(manifest);

  const startIdx = agents.requireIndex("time_started_tick");
  const arriveIdx = agents.requireIndex("time_arrived_tick");
  const stateIdx = agents.requireIndex("final_state");
  const reachedIdx = agents.requireIndex("shelter_reached");
  const reachedYesIdx = agents.requireIndex("reached_shelter");
  const doseIdx = agents.requireIndex("cumulative_dose_ugm3h");
  const vweIdx = agents.index("vwe_ugm3h");
  const travelIdx = agents.requireIndex("total_travel_distance_m");
  const inhaledIdx = agents.index("inhaled_dose_ug");
  const ventIdx = agents.index("mean_ventilation_m3h");
  const awareInitIdx = agents.index("aware_initial");
  const awareTickIdx = agents.index("aware_tick");

  // Bucket by the first hour sample at which the event has happened:
  // `hourOf(tick) = ceil(tick / ticksPerHour)`, so tick 960 with 60 ticks/h is
  // "departed" at hour 16 (960 ≤ 960) and tick 961 only at hour 17.
  const hourOf = (tick: number): number => Math.ceil(tick / tph);

  const departedAt = new Array<number>(hours).fill(0);
  const arrivedAt = new Array<number>(hours).fill(0);
  const awareAt = new Array<number>(hours).fill(0);
  const hasDecisionColumns = awareInitIdx >= 0;
  let initiallyUnaware = 0;

  const shelterIds = shelters.map((s) => s.shelter_id);
  const shelterSlot = new Map<string, number>();
  shelterIds.forEach((id, i) => shelterSlot.set(id, i));
  const admitsAt: number[][] = shelterIds.map(() => new Array<number>(hours).fill(0));

  const stateCounts = new Map<string, number>();
  const doses: number[] = [];
  let doseSum = 0;
  let neverShelteredDose: string | null = null;
  let neverShelteredDoseConstant = true;
  let neverShelteredCount = 0;
  let vweMismatches = 0;
  let restingAgents = 0;
  let restingRatioExact = 0;
  let unawareWithTravel = 0;
  let unawareWithStart = 0;
  let reachedYesCount = 0;
  let shelteredStateCount = 0;
  let unknownShelterRefs = 0;
  let outOfWindowEvents = 0;

  for (const row of agents.rows) {
    const state = at(row, stateIdx);
    stateCounts.set(state, (stateCounts.get(state) ?? 0) + 1);
    if (state === "SHELTERED") shelteredStateCount += 1;
    if (at(row, reachedYesIdx) === "yes") reachedYesCount += 1;

    const startRaw = at(row, startIdx);
    if (startRaw !== "") {
      const h = hourOf(requireNum(startRaw, `${label} time_started_tick`));
      if (h >= 0 && h < hours) departedAt[h] = (departedAt[h] as number) + 1;
      else outOfWindowEvents += 1;
    }

    const arriveRaw = at(row, arriveIdx);
    if (arriveRaw !== "") {
      const h = hourOf(requireNum(arriveRaw, `${label} time_arrived_tick`));
      if (h >= 0 && h < hours) {
        arrivedAt[h] = (arrivedAt[h] as number) + 1;
        const sid = at(row, reachedIdx);
        const slot = shelterSlot.get(sid);
        if (slot === undefined) {
          unknownShelterRefs += 1;
        } else {
          const series = admitsAt[slot] as number[];
          series[h] = (series[h] as number) + 1;
        }
      } else {
        outOfWindowEvents += 1;
      }
    }

    if (hasDecisionColumns) {
      if (at(row, awareInitIdx) === "0") {
        initiallyUnaware += 1;
        const tickRaw = at(row, awareTickIdx);
        if (tickRaw !== "") {
          const h = hourOf(requireNum(tickRaw, `${label} aware_tick`));
          if (h >= 0 && h < hours) awareAt[h] = (awareAt[h] as number) + 1;
        }
      }
    }

    const dose = requireNum(at(row, doseIdx), `${label} cumulative_dose_ugm3h`);
    doses.push(dose);
    doseSum += dose;

    if (vweIdx >= 0 && at(row, vweIdx) !== at(row, doseIdx)) vweMismatches += 1;

    if (state !== "SHELTERED") {
      neverShelteredCount += 1;
      const raw = at(row, doseIdx);
      if (neverShelteredDose === null) neverShelteredDose = raw;
      else if (neverShelteredDose !== raw) neverShelteredDoseConstant = false;
    }

    if (ventIdx >= 0 && inhaledIdx >= 0 && at(row, ventIdx) === "0.6100") {
      restingAgents += 1;
      const inhaled = requireNum(at(row, inhaledIdx), `${label} inhaled_dose_ug`);
      // Exact to the archive's own %.4f rounding: 0.61 x exposure, re-rounded.
      if (Math.abs(Math.round(dose * 0.61 * 1e4) / 1e4 - inhaled) <= 1e-4) {
        restingRatioExact += 1;
      }
    }

    if (state === "UNAWARE") {
      if (num(at(row, travelIdx)) !== 0) unawareWithTravel += 1;
      if (at(row, startIdx) !== "") unawareWithStart += 1;
    }
  }

  // prefix sums → cumulative counts at each hour sample
  const cumulate = (buckets: readonly number[]): number[] => {
    const out = new Array<number>(hours).fill(0);
    let running = 0;
    for (let h = 0; h < hours; h += 1) {
      running += buckets[h] as number;
      out[h] = running;
    }
    return out;
  };

  const departedCum = cumulate(departedAt);
  const arrivedCum = cumulate(arrivedAt);
  const awareCum = cumulate(awareAt);

  const notDeparted = departedCum.map((d) => n - d);
  const enRoute = departedCum.map((d, h) => d - (arrivedCum[h] as number));
  const sheltered = arrivedCum;
  const unaware = hasDecisionColumns ? awareCum.map((a) => initiallyUnaware - a) : null;

  const occupancySeries = admitsAt.map((buckets) => cumulate(buckets));

  // exposure histogram
  const sortedDoses = [...doses].sort((a, b) => a - b);
  const maxDose = sortedDoses.length > 0 ? (sortedDoses[sortedDoses.length - 1] as number) : 0;
  const binWidth = niceBinWidth(maxDose / 40);
  const binCount = Math.max(1, Math.ceil(maxDose / binWidth) + 1);
  const counts = new Array<number>(binCount).fill(0);
  for (const d of doses) {
    const b = Math.min(binCount - 1, Math.max(0, Math.floor(d / binWidth)));
    counts[b] = (counts[b] as number) + 1;
  }

  // realised marginals (heterogeneity block; absent from the legacy 27-col file)
  let marginals: Record<string, number> | null = null;
  if (agents.has("mobility_limited")) {
    const mobIdx = agents.requireIndex("mobility_limited");
    const asthmaIdx = agents.requireIndex("asthma_flag");
    const copdIdx = agents.requireIndex("copd_flag");
    const respIdx = agents.requireIndex("any_respiratory");
    const chronicIdx = agents.requireIndex("chronic_physical");
    const vulnIdx = agents.requireIndex("vulnerable_flag");
    const ageIdx = agents.requireIndex("age_years");
    const speedIdx = agents.requireIndex("walking_speed_mps");
    let mob = 0;
    let asthma = 0;
    let copd = 0;
    let resp = 0;
    let chronic = 0;
    let vuln = 0;
    let age55 = 0;
    let speedSum = 0;
    for (const row of agents.rows) {
      if (at(row, mobIdx) === "1") mob += 1;
      if (at(row, asthmaIdx) === "1") asthma += 1;
      if (at(row, copdIdx) === "1") copd += 1;
      if (at(row, respIdx) === "1") resp += 1;
      if (at(row, chronicIdx) === "1") chronic += 1;
      if (at(row, vulnIdx) === "1") vuln += 1;
      if (requireNum(at(row, ageIdx), `${label} age_years`) >= 55) age55 += 1;
      speedSum += requireNum(at(row, speedIdx), `${label} walking_speed_mps`);
    }
    marginals = {
      n: n,
      mobility_limited: share(mob, n),
      asthma: share(asthma, n),
      copd: share(copd, n),
      any_respiratory: share(resp, n),
      chronic_physical: share(chronic, n),
      vulnerable_any: share(vuln, n),
      age_55plus: share(age55, n),
      mean_walking_speed_mps: Math.round((speedSum / n) * 1e6) / 1e6,
    };
  }

  // ---- gates (the cheap in-browser subset, run here over the archive) -------
  const gates: GateResult[] = [];
  const occupancySum = shelters.reduce((acc, s) => acc + s.final_occupancy, 0);
  const manifestSheltered = manifest.population?.sheltered ?? -1;
  gates.push({
    id: "b_bed_sum_4way",
    ok:
      occupancySum === manifestSheltered &&
      occupancySum === reachedYesCount &&
      occupancySum === shelteredStateCount,
    detail:
      `sum(final_occupancy)=${occupancySum}, manifest.population.sheltered=${manifestSheltered}, ` +
      `count(reached_shelter=yes)=${reachedYesCount}, count(final_state=SHELTERED)=${shelteredStateCount}`,
  });

  const vocabOk = [...stateCounts.keys()].every((s) =>
    (TERMINAL_STATES as readonly string[]).includes(s),
  );
  const stateSum = [...stateCounts.values()].reduce((a, b) => a + b, 0);
  const numAgents = manifest.reproducibility?.parameters?.["numAgents"] ?? -1;
  gates.push({
    id: "d_terminal_state_conservation",
    ok: vocabOk && stateSum === n && stateSum === numAgents,
    detail:
      `vocabulary ${vocabOk ? "closed" : `OPEN: ${[...stateCounts.keys()].join("|")}`}, ` +
      `sum=${stateSum}, rows=${n}, numAgents=${numAgents}`,
  });

  gates.push({
    id: "e_unaware_immobility",
    ok: unawareWithTravel === 0 && unawareWithStart === 0,
    detail: `UNAWARE with travel>0: ${unawareWithTravel}; with a start tick: ${unawareWithStart}`,
  });

  const occupancyTail = occupancySeries.map((s) => (hours > 0 ? (s[hours - 1] as number) : 0));
  const occupancyMismatches = shelters.filter(
    (s, i) => (occupancyTail[i] as number) !== s.final_occupancy,
  ).length;
  gates.push({
    id: "derived_occupancy_matches_final",
    ok: occupancyMismatches === 0 && unknownShelterRefs === 0 && outOfWindowEvents === 0,
    detail:
      `${occupancyMismatches} shelter(s) whose derived last-hour occupancy differs from ` +
      `shelters.csv final_occupancy; ${unknownShelterRefs} arrival(s) naming an unlisted ` +
      `shelter; ${outOfWindowEvents} tick(s) outside the [0, simulationHours] window`,
  });

  const oor = manifest.smoke_field?.out_of_range_lookups;
  gates.push({
    id: "j_out_of_range_lookups_zero",
    ok: oor === 0,
    detail: `smoke_field.out_of_range_lookups=${String(oor)}`,
  });

  const slices = manifest.smoke_field?.hours;
  const simHours = manifest.reproducibility?.parameters?.["simulationHours"];
  gates.push({
    id: "gotcha3_hours_le_slices_minus_1",
    ok: slices !== undefined && simHours !== undefined && simHours <= slices - 1,
    detail: `simulationHours=${String(simHours)}, smoke slices=${String(slices)}`,
  });

  if (vweIdx >= 0) {
    gates.push({
      id: "vwe_equals_dose_raw_text",
      ok: vweMismatches === 0,
      detail: `${vweMismatches} row(s) where vwe_ugm3h differs from cumulative_dose_ugm3h as raw text`,
    });
  }

  if (agents.has("blockages_encountered")) {
    const blkIdx = agents.requireIndex("blockages_encountered");
    const pushIdx = agents.requireIndex("push_throughs");
    const reIdx = agents.requireIndex("reroutes");
    const stuckIdx = agents.requireIndex("stuck_events");
    let identityBreaks = 0;
    let stuckBreaks = 0;
    let blockages = 0;
    let pushes = 0;
    let reroutes = 0;
    let stucks = 0;
    for (const row of agents.rows) {
      const b = requireNum(at(row, blkIdx), `${label} blockages_encountered`);
      const p = requireNum(at(row, pushIdx), `${label} push_throughs`);
      const r = requireNum(at(row, reIdx), `${label} reroutes`);
      const s = requireNum(at(row, stuckIdx), `${label} stuck_events`);
      if (b !== p + r) identityBreaks += 1;
      if (s > p) stuckBreaks += 1;
      blockages += b;
      pushes += p;
      reroutes += r;
      stucks += s;
    }
    gates.push({
      id: "l_counter_identities",
      ok: identityBreaks === 0 && stuckBreaks === 0,
      detail:
        `blockages=${blockages}, push_throughs=${pushes}, reroutes=${reroutes}, ` +
        `stuck_events=${stucks}; ${identityBreaks} row(s) break ` +
        `blockages==push_throughs+reroutes, ${stuckBreaks} break stuck_events<=push_throughs`,
    });
  }

  const identities: Record<string, unknown> = {
    never_sheltered_exposure_ugm3h: neverShelteredDose,
    never_sheltered_exposure_is_constant: neverShelteredDoseConstant,
    never_sheltered_count: neverShelteredCount,
    vwe_equals_dose_mismatches: vweIdx >= 0 ? vweMismatches : null,
    resting_agents_vent_0_6100: ventIdx >= 0 ? restingAgents : null,
    resting_dose_equals_exposure_times_0_61: ventIdx >= 0 ? restingRatioExact : null,
  };

  const digest: PerAgentDigest = {
    rows: n,
    columns: agents.header.length,
    terminal_states: Object.fromEntries([...stateCounts].sort(([a], [b]) => (a < b ? -1 : 1))),
    hourly: {
      hours,
      ticks_per_hour: tph,
      semantics:
        "State sampled at tick h*ticks_per_hour, h = 0..simulationHours inclusive. " +
        "not_departed = time_started_tick empty or after that tick; en_route = departed " +
        "and not yet arrived; sheltered = time_arrived_tick at or before that tick. " +
        "Agents that end REFUSED_ALL_FULL or UNREACHABLE stay in en_route after departure " +
        "because the archive records no give-up tick — see terminal_states for the " +
        "end-of-run truth. unaware (decision-layer runs only) counts agents with " +
        "aware_initial=0 whose aware_tick is empty or later than that tick, and is a " +
        "subset of not_departed.",
      not_departed: notDeparted,
      en_route: enRoute,
      sheltered,
      unaware,
    },
    occupancy: {
      shelter_ids: shelterIds,
      hours,
      note:
        "Cumulative admissions per shelter in shelters.csv load order (the order the " +
        "closure-wave recompute uses). Monotone non-decreasing because SHELTERED is " +
        "terminal; the last sample is gate-checked against final_occupancy.",
      series: occupancySeries,
    },
    exposure_histogram: {
      column: "cumulative_dose_ugm3h",
      bin_width: binWidth,
      bin_count: binCount,
      note: "Bin i spans [i*bin_width, (i+1)*bin_width); edges are not stored.",
      counts,
      quantiles: {
        p0: quantile(sortedDoses, 0),
        p25: quantile(sortedDoses, 0.25),
        p50: quantile(sortedDoses, 0.5),
        p75: quantile(sortedDoses, 0.75),
        p90: quantile(sortedDoses, 0.9),
        p99: quantile(sortedDoses, 0.99),
        p100: maxDose,
      },
      mean: n === 0 ? 0 : doseSum / n,
    },
    marginals,
    identities,
  };

  return { digest, gates };
}

// ---------------------------------------------------------------------------
// bundle
// ---------------------------------------------------------------------------

export function buildBundle(archiveRoot: string, run: ArchivedRun): ArchiveBundle {
  const dir = path.join(archiveRoot, ...run.runDir.split("/"));
  const manifestFile = readWithIdentity(dir, "simulation.json");
  const { manifest, repairedNaN } = readManifestText(manifestFile.text, `${run.runDir}/simulation.json`);

  const files: FileIdentity[] = [manifestFile.id];

  let shelters: readonly ShelterRow[] = [];
  if (run.hasShelters) {
    const sheltersFile = readWithIdentity(dir, "shelters.csv");
    files.push(sheltersFile.id);
    shelters = readShelters(
      parseArchiveCsv(sheltersFile.text, `${run.runDir}/shelters.csv`),
      `${run.runDir}/shelters.csv`,
    );
  }

  let perAgent: PerAgentDigest | null = null;
  let gates: readonly GateResult[] = [];
  if (run.hasAgents) {
    const agentsFile = readWithIdentity(dir, "agents.csv");
    files.push({ file: agentsFile.id.file, bytes: agentsFile.id.bytes, sha256: agentsFile.id.sha256 });
    const table = parseArchiveCsv(agentsFile.text, `${run.runDir}/agents.csv`);
    const derived = deriveFromAgents(table, shelters, manifest, run.runDir);
    perAgent = derived.digest;
    gates = derived.gates;
  } else {
    gates = [
      {
        id: "per_agent_products_unavailable",
        ok: true,
        detail:
          "This archived run carries no agents.csv, so the hourly census, occupancy " +
          "series, exposure histogram and realised marginals are absent rather than zero. " +
          "18 of the 154 archived manifests are in this state (all scenario-crandom-2026).",
      },
    ];
  }

  const repro = manifest.reproducibility;
  const capacitySum = shelters.reduce((acc, s) => acc + (s.capacity ?? 0), 0);
  const unlimitedShelters = shelters.filter((s) => s.capacity === null).length;

  return {
    schema: ARCHIVE_BUNDLE_SCHEMA,
    bundle_id: run.bundleId,
    archive: {
      run_dir: run.runDir,
      family: run.family,
      preset_family: run.presetFamily,
      seed: run.seed,
      files,
      manifest_repaired_nan: repairedNaN,
    },
    provenance: {
      manifest_schema: manifest.schema ?? null,
      generated_utc: manifest.generated_utc ?? null,
      generated_utc_note:
        "Local time, not UTC, in the v1 Java writer (output quirk; v2-web emits true UTC).",
      sim_id: repro?.sim_id ?? null,
      git_commit: repro?.git_commit ?? null,
      data_version_tag: repro?.data_version_tag ?? null,
      java_version: repro?.java_version ?? null,
      repast_version: repro?.repast_version ?? null,
      git_working_tree_dirty: repro?.source_integrity?.git_working_tree_dirty ?? null,
      input_datasets: repro?.input_datasets ?? [],
      street_network_validation: manifest.street_network_validation ?? null,
      governance: manifest.governance ?? null,
    },
    executed_parameters: repro?.parameters ?? {},
    scenario: manifest.scenario ?? null,
    smoke_field: manifest.smoke_field ?? null,
    decision_layer: manifest.decision_layer ?? null,
    closures: manifest.closures ?? null,
    headline: {
      ...(manifest.population ?? {}),
      capacity_total: capacitySum,
      capacity_unlimited_sites: unlimitedShelters,
      shelter_sites: shelters.length,
      final_occupancy_total: shelters.reduce((acc, s) => acc + s.final_occupancy, 0),
      peak_occupancy_total: shelters.reduce((acc, s) => acc + s.peak_occupancy, 0),
      refused_count_total: shelters.reduce((acc, s) => acc + s.refused_count, 0),
      policy_refused_total: shelters.reduce((acc, s) => acc + (s.policy_refused ?? 0), 0),
      population_sampling: manifest.population_sampling ?? null,
      stratified_exposure: manifest.stratified_exposure ?? null,
    },
    shelters,
    per_agent: perAgent,
    gates,
  };
}

/** Deterministic on-disk text for a bundle: minified, LF, trailing newline. */
export function serialiseBundle(bundle: ArchiveBundle): string {
  return `${JSON.stringify(bundle)}\n`;
}

export function identifyRunFiles(archiveRoot: string, run: ArchivedRun): readonly FileIdentity[] {
  const dir = path.join(archiveRoot, ...run.runDir.split("/"));
  const out: FileIdentity[] = [identify(dir, "simulation.json")];
  if (run.hasShelters) out.push(identify(dir, "shelters.csv"));
  if (run.hasAgents) out.push(identify(dir, "agents.csv"));
  return out;
}
