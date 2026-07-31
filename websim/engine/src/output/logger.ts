/**
 * `OutcomeLogger` — the three-file results pipeline (PORT_MAP §5), in **two
 * flavours over one internal state**.
 *
 * ## Why two flavours and not two writers
 *
 * `parity` reproduces the certified writer byte for byte, quirks included:
 * `%.Nf` rounds the shortest round-tripping decimal HALF_UP (never `toFixed`),
 * `(long)` casts truncate, `%n` is CRLF, empty strata print a bare `NaN` into
 * JSON (which is not valid JSON, and is the archive's actual bytes),
 * `door_refusals` carries `retargetCount` under a name that does not describe
 * it, and `utilization` divides **final** occupancy by capacity, not peak.
 *
 * `v2-web` fixes exactly those *reporting* defects and nothing else. It does
 * **not** touch engine semantics: the double concentration lookup still
 * double-counts `out_of_range_lookups`, a closed-door arrival still increments
 * no refusal counter. Those are behaviour, they are what the archive measured,
 * and a "fix" there would silently produce a different simulation.
 *
 * Both flavours read the same {@link RunOutcome}. That is the property that
 * makes the pair trustworthy: a divergence between them can only be a
 * formatting decision, never a second model.
 *
 * ## What this port cannot reproduce, and says so
 *
 * `sim_id` (wall clock), `generated_utc` (which is local time despite the name),
 * `git_commit`, `java_version`, the working-tree dirty flag and every SHA-256
 * are environment facts, not model output. They arrive through
 * {@link OutputEnvironment} so a replay harness can substitute the archive's own
 * values and diff the rest. `street_network_validation` and `governance` are
 * emitted only when the caller supplies them — exactly as Java omits both blocks
 * when its report or registry is null — because the browser engine consumes a
 * pre-baked graph and never runs the validation itself.
 */

import { javaFormatFixed } from "../mathx/format.js";
import type { Resident } from "../agents/resident.js";
import type { PopulationAttributes, PopulationMarginals } from "../agents/populationSampler.js";
import type { DecisionMarginals } from "../agents/eLayerSampler.js";
import type { Shelter } from "../shelters/shelter.js";
import { localTimeStringForTick } from "../world/time.js";
import { POPULATION_PUBLISHED_TARGETS } from "../agents/populationSampler.js";

export type OutputFlavour = "parity" | "v2-web";

/** `PopulationSampler.publishedTargets()`, verbatim. */
export const POPULATION_PUBLISHED_TARGETS_TEXT =
  "targets: mobility 0.192 (PIT 2019, lower bound) | asthma 0.150 " +
  "(Zellmer 2025) | COPD 0.105 (Zellmer 2025) | any respiratory 0.239 " +
  "(independent draws) | chronic physical 0.391 (Pathways 2026, local) | " +
  "age bands 0.527/0.423/0.050 (Pathways 2026)";

/** `ELayerSampler.publishedTargets()`, verbatim (WP8 fills the block; the string is fixed here). */
export const DECISION_PUBLISHED_TARGETS_TEXT =
  "targets: aware 0.356 (Hines 2021, N=73, same event) | belongings " +
  "0.284 (A-27 midpoint of 0.108-0.46) | pet 0.117 (Henwood 2020) | " +
  "dependents 0.0044 (HUD 2025 PIT OR-501)";

void POPULATION_PUBLISHED_TARGETS; // the numeric twin; the text above is the manifest's

export interface DatasetDigest {
  readonly file: string;
  /** Lowercase hex, or the literal `"unavailable"` Java writes on failure. */
  readonly sha256: string;
}

export interface SourceIntegrity {
  readonly note: string;
  /** `true` / `false`, or the string `"unknown"` — U-21's three-state token. */
  readonly gitWorkingTreeDirty: boolean | "unknown";
  readonly files: readonly DatasetDigest[];
}

/** Environment facts the engine cannot know. See the module doc. */
export interface OutputEnvironment {
  readonly simId: string;
  readonly commit: string;
  readonly dataVersionTag: string;
  /** `System.getProperty("java.version")` in Java; `"n/a"` in the browser (plan Q5). */
  readonly javaVersion: string;
  readonly repastVersion: string;
  /** What Java writes into `generated_utc` — which is `LocalDateTime.now()`. */
  readonly generatedTimestamp: string;
  readonly inputDatasets: readonly DatasetDigest[];
  readonly sourceIntegrity: SourceIntegrity | null;
  /** Pre-rendered block bodies; omitted (as Java omits them) when absent. */
  readonly streetNetworkValidationJson?: string | undefined;
  readonly governanceJson?: string | undefined;
}

/** One parameter of the 41-name manifest, with the Java type it was declared as. */
export interface ManifestParameter {
  readonly name: string;
  readonly value: number;
  /** `int` renders bare; `double`/`number` render through `Double.toString`. */
  readonly kind: "int" | "double";
}

/** Everything the writers read. Assembled once, consumed by both flavours. */
export interface RunOutcome {
  readonly residents: readonly Resident[];
  readonly shelters: readonly Shelter[];
  readonly seed: number;
  readonly minutesPerTick: number;
  readonly scenarioName: string;
  readonly parameters: readonly ManifestParameter[];
  readonly smokeCounty: string;
  readonly smokeStart: string;
  readonly smokeHours: number;
  readonly smokePeakHourly: number;
  readonly outOfRangeLookups: number;
  /** `null` when heterogeneity is off — the block then prints `{"heterogeneity": false}`. */
  readonly populationMarginals: PopulationMarginals | null;
  /** `null` when the decision layer is off. */
  readonly decisionMarginals: DecisionMarginals | null;
  readonly env: OutputEnvironment;
}

// ---------------------------------------------------------------------------
// Java string helpers
// ---------------------------------------------------------------------------

/** `OutcomeLogger.csv(String)` — commas become spaces; there is no quoting. */
export function csvCell(s: string | null): string {
  return s === null ? "" : s.replaceAll(",", " ");
}

/** `OutcomeLogger.jsonEsc(String)` — escapes only `\` and `"`, exactly as Java. */
export function jsonEsc(s: string | null): string {
  return s === null ? "" : s.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

/** `String.valueOf((long) d)` — truncation toward zero, never a round. */
function longCast(d: number): string {
  return String(Math.trunc(d));
}

/** `%.Nf`, or `""` where Java's guard writes an empty cell for a NaN. */
function f(value: number, precision: number): string {
  return javaFormatFixed(value, precision);
}

/**
 * `Double.toString(d)` for the magnitudes the manifest carries. JS renders an
 * integral double without the `.0` Java always prints, which is the only
 * difference in this range.
 */
function javaDoubleToString(d: number): string {
  if (Number.isNaN(d)) {
    return "NaN";
  }
  if (!Number.isFinite(d)) {
    return d > 0 ? "Infinity" : "-Infinity";
  }
  const s = String(d);
  return Number.isInteger(d) && !s.includes("e") && !s.includes("E") ? `${s}.0` : s;
}

function paramLiteral(p: ManifestParameter): string {
  return p.kind === "int" ? String(Math.trunc(p.value)) : javaDoubleToString(p.value);
}

// ---------------------------------------------------------------------------
// statistics (OutcomeLogger's own, transcribed)
// ---------------------------------------------------------------------------

export function sum(x: readonly number[]): number {
  let s = 0;
  for (const v of x) {
    s += v;
  }
  return s;
}

export function mean(x: readonly number[]): number {
  return x.length === 0 ? 0 : sum(x) / x.length;
}

/** `min` initialises at +∞ and returns 0 for an empty array. */
export function minOf(x: readonly number[]): number {
  let m = Number.POSITIVE_INFINITY;
  for (const v of x) {
    m = Math.min(m, v);
  }
  return x.length === 0 ? 0 : m;
}

/** `max` initialises at **0**, not −∞ — an all-negative array reports 0 (R10). */
export function maxOf(x: readonly number[]): number {
  let m = 0;
  for (const v of x) {
    m = Math.max(m, v);
  }
  return m;
}

/** Sorted copy, linear interpolation at `idx = p/100 · (n−1)` (≡ numpy 'linear'). */
export function pct(x: readonly number[], p: number): number {
  if (x.length === 0) {
    return 0;
  }
  const s = [...x].sort((a, b) => a - b);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) {
    return s[lo]!;
  }
  return s[lo]! + (idx - lo) * (s[hi]! - s[lo]!);
}

/**
 * Gini (V14) — the literal O(n²) mean-absolute-difference double loop.
 *
 * The plan sanctions the sorted O(n log n) identity as mathematically
 * equivalent, and it is; the literal form is kept because it is also
 * *arithmetically* equivalent (same additions, same order, same rounding), and
 * at n = 6,842 it costs ~50 ms. Parity is worth 50 ms.
 */
export function gini(x: readonly number[]): number {
  const n = x.length;
  const m = mean(x);
  if (n === 0 || m === 0) {
    return 0;
  }
  let absDiff = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i]!;
    for (let j = 0; j < n; j++) {
      absDiff += Math.abs(xi - x[j]!);
    }
  }
  return absDiff / (2 * n * n * m);
}

// ---------------------------------------------------------------------------
// agents.csv
// ---------------------------------------------------------------------------

export const AGENTS_HEADER =
  "agent_id,sim_id,commit,random_seed,data_version," +
  "starting_encampment,start_lon,start_lat,shelter_reached,reached_shelter," +
  "time_started_tick,time_started_local,time_arrived_tick,time_arrived_local," +
  "travel_time_min,total_travel_distance_m,network_dist_to_shelter_m," +
  "avg_pm25_ugm3,peak_pm25_ugm3,cumulative_dose_ugm3h,exposure_while_traveling_ugm3h," +
  "vwe_ugm3h,hours_above_unhealthy,age,asthma,copd,age_rr,comorbidity_rr,final_state," +
  "planned_route_m,snap_gap_m,door_refusals," +
  "scenario,walking_speed_mps,age_years,age_band,sex," +
  "mobility_limited,mobility_category,asthma_flag,copd_flag," +
  "any_respiratory,chronic_physical,vulnerable_flag," +
  "air_volume_breathed_m3,mean_ventilation_m3h," +
  "inhaled_dose_ug,health_risk_multiplier,health_risk_score," +
  "aware_initial,aware_tick,heavy_belongings,has_pet," +
  "has_dependents,theta_z," +
  "blockages_encountered,push_throughs,reroutes,stuck_events";

/** The `v2-web` header: two columns renamed to say what they hold. */
export const AGENTS_HEADER_V2 = AGENTS_HEADER.replace(
  ",door_refusals,",
  ",retarget_count,",
).replace(",age,asthma,copd,age_rr,", ",age_years_legacy,asthma_legacy,copd_legacy,age_rr,");

/**
 * `isVulnerable` — the D-3 reporting stratum: 55+, mobility-limited, asthma,
 * COPD, or any chronic physical condition. A union of measured attributes with
 * **no weights** — not a risk score, and never to be turned into one.
 */
export function isVulnerable(at: PopulationAttributes): boolean {
  return at.ageYears >= 55 || at.mobilityLimited || at.asthma || at.copd || at.chronicPhysical;
}

function agentRow(a: Resident, run: RunOutcome, flavour: OutputFlavour): string {
  const mpt = run.minutesPerTick;
  const reached = a.state === "SHELTERED";
  const shelter = reached && a.targetShelter !== null ? a.targetShelter.id : "";
  const evac = a.evacuationTick;
  const arr = a.arrivalTick;
  const startTick = Number.isNaN(evac) ? "" : longCast(evac);
  const startLocal = Number.isNaN(evac) ? "" : localTimeStringForTick(evac, mpt);
  const arrTick = Number.isNaN(arr) ? "" : longCast(arr);
  const arrLocal = Number.isNaN(arr) ? "" : localTimeStringForTick(arr, mpt);
  const travelMin = Number.isNaN(evac) || Number.isNaN(arr) ? "" : f((arr - evac) * mpt, 1);
  const outH = a.outdoorHours;
  const avgPm = outH > 0 ? f(a.exposureUgM3h / outH, 2) : "";
  const netDist = Number.isNaN(a.networkDistToShelterM) ? "" : f(a.networkDistToShelterM, 2);
  const startLonS = Number.isNaN(a.startLon) ? "" : f(a.startLon, 6);
  const startLatS = Number.isNaN(a.startLat) ? "" : f(a.startLat, 6);

  const at = a.attributes;
  const legacyAge = at === null ? "" : String(at.ageYears);
  const legacyAsthma = at === null ? "" : at.asthma ? "1" : "0";
  const legacyCopd = at === null ? "" : at.copd ? "1" : "0";
  const het =
    at === null
      ? ",,,,,,,,,,"
      : [
          f(at.walkingSpeedMps, 4),
          String(at.ageYears),
          at.ageBand,
          at.sex,
          at.mobilityLimited ? "1" : "0",
          at.mobilityCategory,
          at.asthma ? "1" : "0",
          at.copd ? "1" : "0",
          at.asthma || at.copd ? "1" : "0",
          at.chronicPhysical ? "1" : "0",
          isVulnerable(at) ? "1" : "0",
        ].join(",");

  const da = a.decision;
  const dec =
    da === null
      ? ",,,,,"
      : [
          da.awareInitial ? "1" : "0",
          Number.isNaN(a.awareTick) ? "" : longCast(a.awareTick),
          da.heavyBelongings ? "1" : "0",
          da.hasPet ? "1" : "0",
          da.hasDependents ? "1" : "0",
          f(da.thetaZ, 6),
        ].join(",");

  void flavour; // the row body is identical in both flavours; only the header differs
  return [
    a.name,
    run.env.simId,
    run.env.commit,
    String(Math.trunc(run.seed)),
    run.env.dataVersionTag,
    a.encampmentId === null ? "null" : a.encampmentId,
    startLonS,
    startLatS,
    shelter,
    reached ? "yes" : "no",
    startTick,
    startLocal,
    arrTick,
    arrLocal,
    travelMin,
    f(a.distanceTraveledM, 2),
    netDist,
    avgPm,
    f(a.peakConcUgM3, 2),
    f(a.exposureUgM3h, 4),
    f(a.exposureWhileTravelingUgM3h, 4),
    f(a.vweUgM3h, 4),
    f(a.hoursAboveUnhealthy, 4),
    legacyAge,
    legacyAsthma,
    legacyCopd,
    f(a.ageRR, 3),
    f(a.comorbidityRR, 3),
    a.state,
    f(a.plannedRouteM, 2),
    f(a.snapGapM, 2),
    String(a.retargetCount),
    csvCell(run.scenarioName),
    het,
    f(a.airVolumeBreathedM3, 4),
    f(a.meanVentilationM3h, 4),
    f(a.inhaledDoseUg, 4),
    f(a.healthRiskMultiplier, 3),
    f(a.healthRiskScore, 4),
    dec,
    String(a.blockagesEncountered),
    String(a.pushThroughs),
    String(a.reroutes),
    String(a.stuckEvents),
  ].join(",");
}

export function writeAgentsCsv(run: RunOutcome, flavour: OutputFlavour): string {
  const eol = flavour === "parity" ? "\r\n" : "\n";
  const out: string[] = [flavour === "parity" ? AGENTS_HEADER : AGENTS_HEADER_V2];
  for (const a of run.residents) {
    out.push(agentRow(a, run, flavour));
  }
  return out.join(eol) + eol;
}

// ---------------------------------------------------------------------------
// shelters.csv
// ---------------------------------------------------------------------------

export const SHELTERS_HEADER =
  "shelter_id,name,lon,lat,capacity,operating,peak_occupancy," +
  "final_occupancy,refused_count,utilization,mean_travel_dist_m_admitted,policy_refused";

/** `v2-web`: says which occupancy the ratio uses, and publishes the other one. */
export const SHELTERS_HEADER_V2 =
  "shelter_id,name,lon,lat,capacity,operating,peak_occupancy," +
  "final_occupancy,refused_count,utilization_final,utilization_peak," +
  "mean_travel_dist_m_admitted,policy_refused";

export function writeSheltersCsv(run: RunOutcome, flavour: OutputFlavour): string {
  const eol = flavour === "parity" ? "\r\n" : "\n";
  const out: string[] = [flavour === "parity" ? SHELTERS_HEADER : SHELTERS_HEADER_V2];
  for (const s of run.shelters) {
    let sumTravel = 0;
    let nAdmitted = 0;
    for (const a of run.residents) {
      // Object identity, exactly as Java's `a.getTargetShelter() == s`.
      if (a.state === "SHELTERED" && a.targetShelter === s) {
        sumTravel += a.distanceTraveledM;
        nAdmitted++;
      }
    }
    const util = s.capacity === null ? "" : f(s.occupancy / s.capacity, 4);
    const utilPeak = s.capacity === null ? "" : f(s.peakOccupancy / s.capacity, 4);
    const meanTravel = nAdmitted === 0 ? "" : f(sumTravel / nAdmitted, 2);
    const cells = [
      s.id,
      csvCell(s.name),
      f(s.lon, 6),
      f(s.lat, 6),
      s.capacity === null ? "" : String(s.capacity),
      String(s.operating),
      String(s.peakOccupancy),
      String(s.occupancy),
      String(s.refusedCount),
      util,
    ];
    if (flavour === "v2-web") {
      cells.push(utilPeak);
    }
    cells.push(meanTravel, String(s.policyRefusedCount));
    out.push(cells.join(","));
  }
  return out.join(eol) + eol;
}

// ---------------------------------------------------------------------------
// simulation.json
// ---------------------------------------------------------------------------

const STRATA = [
  "vulnerable_any",
  "age55plus",
  "mobility_limited",
  "asthma",
  "copd",
  "any_respiratory",
  "chronic_physical",
] as const;

function inStratum(at: PopulationAttributes, stratum: string): boolean {
  if (stratum === "age55plus") return at.ageYears >= 55;
  if (stratum === "mobility_limited") return at.mobilityLimited;
  if (stratum === "asthma") return at.asthma;
  if (stratum === "copd") return at.copd;
  if (stratum === "any_respiratory") return at.asthma || at.copd;
  if (stratum === "chronic_physical") return at.chronicPhysical;
  return isVulnerable(at);
}

function strataCount(residents: readonly Resident[], stratum: string, member: boolean): number {
  let n = 0;
  for (const a of residents) {
    if (a.attributes !== null && inStratum(a.attributes, stratum) === member) {
      n++;
    }
  }
  return n;
}

/** NaN values are EXCLUDED from the mean, never zero-filled (which would understate it). */
function strataMean(
  residents: readonly Resident[],
  stratum: string,
  member: boolean,
  value: (a: Resident) => number,
): number {
  let s = 0;
  let n = 0;
  for (const a of residents) {
    if (a.attributes === null || inStratum(a.attributes, stratum) !== member) {
      continue;
    }
    const v = value(a);
    if (!Number.isNaN(v)) {
      s += v;
      n++;
    }
  }
  return n === 0 ? Number.NaN : s / n;
}

/**
 * `%.Nf` for a JSON *value*: parity emits Java's bare `NaN` (invalid JSON, and
 * exactly what the archive contains — the empty-stratum defect); `v2-web` emits
 * `null`, which is what a parser can actually read.
 */
function jnum(value: number, precision: number, flavour: OutputFlavour): string {
  if (Number.isNaN(value)) {
    return flavour === "parity" ? "NaN" : "null";
  }
  return f(value, precision);
}

export function writeSimulationJson(run: RunOutcome, flavour: OutputFlavour): string {
  const eol = flavour === "parity" ? "\r\n" : "\n";
  const L: string[] = [];
  const line = (s: string): void => {
    L.push(s);
  };

  const residents = run.residents;
  const n = residents.length;
  const exposure: number[] = new Array<number>(n);
  const vwe: number[] = new Array<number>(n);
  const travel: number[] = new Array<number>(n);
  let sheltered = 0;
  let enRoute = 0;
  let unreachable = 0;
  let refused = 0;
  let preEvac = 0;
  let unaware = 0;
  let sumHoursUnhealthy = 0;
  for (let i = 0; i < n; i++) {
    const a = residents[i]!;
    exposure[i] = a.exposureUgM3h;
    vwe[i] = a.vweUgM3h;
    travel[i] = a.distanceTraveledM;
    sumHoursUnhealthy += a.hoursAboveUnhealthy;
    switch (a.state) {
      case "SHELTERED":
        sheltered++;
        break;
      case "EN_ROUTE":
        enRoute++;
        break;
      case "UNREACHABLE":
        unreachable++;
        break;
      case "REFUSED_ALL_FULL":
        refused++;
        break;
      case "PRE_EVAC":
        preEvac++;
        break;
      case "UNAWARE":
        unaware++;
        break;
    }
  }

  const env = run.env;
  line("{");
  line('  "schema": "reu-wildfire-shelter-abm/simulation/v1",');
  line(`  "generated_utc": "${env.generatedTimestamp}",`);
  line('  "reproducibility": {');
  line(`    "random_seed": ${Math.trunc(run.seed)},`);
  line(`    "sim_id": "${jsonEsc(env.simId)}",`);
  line(`    "data_version_tag": "${jsonEsc(env.dataVersionTag)}",`);
  line(`    "git_commit": "${jsonEsc(env.commit)}",`);
  line(`    "java_version": "${jsonEsc(env.javaVersion)}",`);
  line(`    "repast_version": "${env.repastVersion}",`);
  line(
    `    "parameters": {${run.parameters
      .map((p) => `"${p.name}": ${paramLiteral(p)}`)
      .join(", ")}},`,
  );
  line('    "input_datasets": [');
  env.inputDatasets.forEach((d, i) => {
    line(
      `      {"file": "${jsonEsc(d.file)}", "sha256": "${d.sha256}"}` +
        (i < env.inputDatasets.length - 1 ? "," : ""),
    );
  });
  // Java's `source_integrity` block is unconditional, so its `],` is too. Here
  // it is omitted when the caller has nothing to put in it (the browser has no
  // shapefile to hash), and the comma has to go with it or the manifest is not
  // parseable JSON — a trailing comma is a defect in either flavour.
  line(env.sourceIntegrity !== null ? "    ]," : "    ]");
  if (env.sourceIntegrity !== null) {
    const si = env.sourceIntegrity;
    line('    "source_integrity": {');
    line(`      "note": "${jsonEsc(si.note)}",`);
    line(
      `      "git_working_tree_dirty": ${si.gitWorkingTreeDirty === "unknown" ? '"unknown"' : String(si.gitWorkingTreeDirty)},`,
    );
    line('      "files": [');
    si.files.forEach((d, i) => {
      line(
        `        {"file": "${jsonEsc(d.file)}", "sha256": "${d.sha256}"}` +
          (i < si.files.length - 1 ? "," : ""),
      );
    });
    line("      ]");
    line("    }");
  }
  line("  },");
  line('  "smoke_field": {');
  line(`    "county": "${jsonEsc(run.smokeCounty)}",`);
  line(`    "start": "${run.smokeStart}",`);
  line(`    "hours": ${run.smokeHours},`);
  line(`    "peak_hourly_ugm3": ${f(run.smokePeakHourly, 1)},`);
  line(`    "out_of_range_lookups": ${run.outOfRangeLookups}`);
  line("  },");
  line('  "closures": {"code": 0},');
  if (env.streetNetworkValidationJson !== undefined) {
    line(env.streetNetworkValidationJson);
  }
  if (env.governanceJson !== undefined) {
    line(env.governanceJson);
  }

  // stratified_exposure — emitted only when heterogeneity is on, as in Java.
  if (run.populationMarginals !== null) {
    line('  "stratified_exposure": {');
    line(
      '    "definition": "vulnerable_any = age 55+ OR mobility-limited OR ' +
        'asthma OR COPD OR chronic physical condition; a REPORTING STRATUM, ' +
        'not a risk score (decision D-3)",',
    );
    line('    "strata": [');
    STRATA.forEach((s, i) => {
      for (let m = 0; m < 2; m++) {
        const member = m === 0;
        const count = strataCount(residents, s, member);
        const tail = i === STRATA.length - 1 && m === 1 ? "" : ",";
        line(
          `      {"stratum": "${s}", "member": ${String(member)}, "n": ${count}, ` +
            `"sheltered_share": ${jnum(strataMean(residents, s, member, (a) => (a.state === "SHELTERED" ? 1 : 0)), 4, flavour)}, ` +
            `"mean_exposure_ugm3h": ${jnum(strataMean(residents, s, member, (a) => a.exposureUgM3h), 2, flavour)}, ` +
            `"mean_travel_m": ${jnum(strataMean(residents, s, member, (a) => a.distanceTraveledM), 2, flavour)}, ` +
            `"mean_travel_time_min": ${jnum(strataMean(residents, s, member, (a) => travelMinutes(a, run.minutesPerTick)), 2, flavour)}, ` +
            `"mean_walking_speed_mps": ${jnum(strataMean(residents, s, member, (a) => (a.attributes === null ? Number.NaN : a.attributes.walkingSpeedMps)), 4, flavour)}}${tail}`,
        );
      }
    });
    line("    ]");
    line("  },");
  }

  line(`  "scenario": "${jsonEsc(run.scenarioName)}",`);
  const pm = run.populationMarginals;
  if (pm !== null) {
    line(
      '  "population_sampling": {"heterogeneity": true, ' +
        `"n_sampled": ${pm.sampled}, "realised_mobility_limited": ${f(pm.mobilityLimitedShare, 4)}, ` +
        `"realised_asthma": ${f(pm.asthmaShare, 4)}, "realised_copd": ${f(pm.copdShare, 4)}, ` +
        `"realised_any_respiratory": ${f(pm.anyRespiratoryShare, 4)}, ` +
        `"realised_age_55plus": ${f(pm.age55PlusShare, 4)}, ` +
        `"mean_walking_speed_mps": ${f(pm.meanWalkingSpeedMps, 4)}, ` +
        `"published_targets": "${jsonEsc(POPULATION_PUBLISHED_TARGETS_TEXT)}"},`,
    );
  } else {
    line('  "population_sampling": {"heterogeneity": false},');
  }
  if (run.decisionMarginals !== null) {
    const dm = run.decisionMarginals;
    line(
      '  "decision_layer": {"enabled": true, ' +
        `"n_sampled": ${dm.sampled}, "realised_aware": ${f(dm.awareShare, 4)}, ` +
        `"realised_heavy_belongings": ${f(dm.heavyBelongingsShare, 4)}, ` +
        `"realised_pet": ${f(dm.petShare, 4)}, "realised_dependents": ${f(dm.dependentsShare, 4)}, ` +
        `"realised_any_barrier": ${f(dm.anyBarrierShare, 4)}, ` +
        `"realised_compound_barrier": ${f(dm.compoundBarrierShare, 4)}, ` +
        `"published_targets": "${jsonEsc(DECISION_PUBLISHED_TARGETS_TEXT)}"},`,
    );
  } else {
    line('  "decision_layer": {"enabled": false},');
  }

  line('  "population": {');
  line(`    "n_agents": ${n},`);
  line(
    `    "pre_evac": ${preEvac}, "sheltered": ${sheltered}, "en_route": ${enRoute}, ` +
      `"unreachable": ${unreachable}, "refused_all_full": ${refused}, "unaware": ${unaware},`,
  );
  line(
    `    "exposure_ugm3h": {"mean": ${f(mean(exposure), 4)}, "median": ${f(pct(exposure, 50), 4)}, ` +
      `"min": ${f(minOf(exposure), 4)}, "p25": ${f(pct(exposure, 25), 4)}, ` +
      `"p75": ${f(pct(exposure, 75), 4)}, "p90": ${f(pct(exposure, 90), 4)}, ` +
      `"max": ${f(maxOf(exposure), 4)}, "total": ${f(sum(exposure), 4)}, ` +
      `"gini": ${f(gini(exposure), 4)}},`,
  );
  line(
    `    "vwe_ugm3h": {"mean": ${f(mean(vwe), 4)}, "median": ${f(pct(vwe, 50), 4)}, ` +
      `"total": ${f(sum(vwe), 4)}, "gini": ${f(gini(vwe), 4)}},`,
  );
  line(`    "total_person_hours_above_unhealthy": ${f(sumHoursUnhealthy, 2)},`);
  line(
    `    "travel_m": {"mean": ${f(mean(travel), 2)}, "median": ${f(pct(travel, 50), 2)}, ` +
      `"max": ${f(maxOf(travel), 2)}}`,
  );
  line("  },");
  line('  "shelters": [');
  run.shelters.forEach((s, i) => {
    line(
      `    {"id": "${s.id}", "capacity": ${s.capacity === null ? "null" : String(s.capacity)}` +
        `, "operating": ${String(s.operating)}` +
        `, "peak_occupancy": ${s.peakOccupancy}` +
        `, "final_occupancy": ${s.occupancy}` +
        `, "refused": ${s.refusedCount}}` +
        (i < run.shelters.length - 1 ? "," : ""),
    );
  });
  line("  ]");
  line("}");
  return L.join(eol) + eol;
}

function travelMinutes(a: Resident, minutesPerTick: number): number {
  if (Number.isNaN(a.evacuationTick) || Number.isNaN(a.arrivalTick)) {
    return Number.NaN;
  }
  return (a.arrivalTick - a.evacuationTick) * minutesPerTick;
}

export interface RunOutputs {
  readonly agentsCsv: string;
  readonly sheltersCsv: string;
  readonly simulationJson: string;
}

/** All three files, in one flavour, from one {@link RunOutcome}. */
export function writeRunOutputs(run: RunOutcome, flavour: OutputFlavour): RunOutputs {
  return {
    agentsCsv: writeAgentsCsv(run, flavour),
    sheltersCsv: writeSheltersCsv(run, flavour),
    simulationJson: writeSimulationJson(run, flavour),
  };
}
