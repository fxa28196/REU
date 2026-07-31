/**
 * golden.ts — derive the committed golden summaries from the archive.
 *
 * Plan §4 (`golden-summaries/*.json`) and §5.1 Tier 3: the browser harness has
 * to check statistical envelopes against 375 MB of Java runs that hosted CI will
 * never see. These digests are the shippable form of that oracle — small enough
 * to commit, exact enough to fail a real regression.
 *
 * Two rules the whole module obeys:
 *
 *  1. **Every number carries its provenance.** `sources.json` is a table keyed by
 *     run directory holding the SHA-256 and byte length of every archive file
 *     read, and each value block in every other file is keyed by (or names) that
 *     run directory — so each number resolves to the exact bytes it came from.
 *     The table is normalised into one file rather than repeated in all five,
 *     because inlining it cost 50 KB per file (165 KB of pure duplication).
 *     Nothing is quoted from the plan, PORT_MAP, or a previous report — if a
 *     figure is not derivable from the archive bytes, it is not here.
 *  2. **Hashes are defined on raw text.** `verify_2026_runs.py` hashes a pandas
 *     re-serialisation of `agents.csv`, which makes the digest depend on pandas'
 *     float repr. The gate discipline in PORT_MAP §6.2 is raw text
 *     (`dtype=str, keep_default_na=False`), so these hashes are taken over the
 *     archive's own bytes. The invariant tested is identical (cross-arm equality
 *     within a seed); the digest value is not, and the file says so.
 */

import path from "node:path";

import { parseArchiveCsv, type ArchiveTable } from "./csv.js";
import { readWithIdentity, sha256Hex, type FileIdentity } from "./files.js";
import { readManifestText } from "./manifest.js";
import type { ArchivedRun } from "./discover.js";

export const GOLDEN_SCHEMA_PREFIX = "reu-wildfire-shelter-abm/golden-summary/v1";

/**
 * Columns that define "the same population" across arms — verbatim from
 * `scripts/verify_2026_runs.py:44` (POP_COLS).
 */
export const POP_COLS = [
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
] as const;

export interface SourceRecord {
  readonly run_dir: string;
  readonly files: readonly FileIdentity[];
}

export const PROVENANCE_NOTE =
  "Every key of `values` is (or names) a run directory. Resolve it in sources.json for the " +
  "SHA-256 and byte length of the archive files the numbers were derived from.";

export interface GoldenFile {
  readonly schema: string;
  readonly about: string;
  readonly method: string;
  readonly provenance: { readonly source_index: "sources.json"; readonly note: string };
  readonly values: unknown;
}

const PROVENANCE = { source_index: "sources.json", note: PROVENANCE_NOTE } as const;

// ---------------------------------------------------------------------------
// loading
// ---------------------------------------------------------------------------

export interface LoadedRun {
  readonly run: ArchivedRun;
  readonly manifest: ReturnType<typeof readManifestText>["manifest"];
  readonly agents: ArchiveTable | null;
  readonly shelters: ArchiveTable | null;
  readonly files: readonly FileIdentity[];
}

export function loadRun(archiveRoot: string, run: ArchivedRun): LoadedRun {
  const dir = path.join(archiveRoot, ...run.runDir.split("/"));
  const files: FileIdentity[] = [];

  const m = readWithIdentity(dir, "simulation.json");
  files.push(m.id);
  const { manifest } = readManifestText(m.text, `${run.runDir}/simulation.json`);

  let shelters: ArchiveTable | null = null;
  if (run.hasShelters) {
    const s = readWithIdentity(dir, "shelters.csv");
    files.push(s.id);
    shelters = parseArchiveCsv(s.text, `${run.runDir}/shelters.csv`);
  }

  let agents: ArchiveTable | null = null;
  if (run.hasAgents) {
    const a = readWithIdentity(dir, "agents.csv");
    files.push(a.id);
    agents = parseArchiveCsv(a.text, `${run.runDir}/agents.csv`);
  }

  return { run, manifest, agents, shelters, files };
}

function sourceOf(loaded: LoadedRun): SourceRecord {
  return { run_dir: loaded.run.runDir, files: loaded.files };
}

/** Config key: the run name with its seed erased, e.g. `A-seed42` → `A-seed*`. */
export function configKey(run: ArchivedRun): string {
  return `${run.family}/${run.name.replace(/seed\d+/u, "seed*")}`;
}

// ---------------------------------------------------------------------------
// 1. sheltered envelopes
// ---------------------------------------------------------------------------

export function shelteredEnvelopes(loadedRuns: readonly LoadedRun[]): GoldenFile {
  const groups = new Map<
    string,
    { preset_family: string; by_seed: Record<string, unknown> }
  >();

  for (const loaded of loadedRuns) {
    const key = configKey(loaded.run);
    const seed = loaded.run.seed;
    if (seed === null) continue;
    const pop = loaded.manifest.population;
    if (pop === undefined) continue;
    const group = groups.get(key) ?? {
      preset_family: loaded.run.presetFamily,
      by_seed: {},
    };
    group.by_seed[String(seed)] = {
      source: loaded.run.runDir,
      sheltered: pop.sheltered ?? null,
      refused_all_full: pop.refused_all_full ?? null,
      unreachable: pop.unreachable ?? null,
      pre_evac: pop.pre_evac ?? null,
      en_route: pop.en_route ?? null,
      n_agents: pop.n_agents ?? null,
      total_person_hours_above_unhealthy: pop.total_person_hours_above_unhealthy ?? null,
      mean_exposure_ugm3h: pop.exposure_ugm3h?.["mean"] ?? null,
      mean_travel_m: pop.travel_m?.["mean"] ?? null,
    };
    groups.set(key, group);
  }

  const values: Record<string, unknown> = {};
  for (const [key, group] of [...groups].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const seeds = Object.keys(group.by_seed)
      .map(Number)
      .sort((a, b) => a - b);
    const pick = (field: string): number[] =>
      seeds
        .map((s) => (group.by_seed[String(s)] as Record<string, unknown>)[field])
        .filter((v): v is number => typeof v === "number");
    const envelope = (field: string): Record<string, number> | null => {
      const vals = pick(field);
      if (vals.length === 0) return null;
      return { min: Math.min(...vals), max: Math.max(...vals), n_seeds: vals.length };
    };
    values[key] = {
      preset_family: group.preset_family,
      seeds,
      sheltered: envelope("sheltered"),
      refused_all_full: envelope("refused_all_full"),
      unreachable: envelope("unreachable"),
      by_seed: group.by_seed,
    };
  }

  return {
    schema: `${GOLDEN_SCHEMA_PREFIX}/sheltered-envelopes`,
    about:
      "Per archived configuration, the seed-to-seed envelope of the headline population " +
      "outcomes. Tier 3 requires a live sheltered count to land inside the archived range " +
      "for the same configuration (plan §5.1).",
    method:
      "Values are copied verbatim from each run's simulation.json `population` block; " +
      "min/max are taken over the seeds present. A configuration key is the run directory " +
      "name with its seed digits replaced by `*`, so all seeds of one config group together.",
    provenance: PROVENANCE,
    values,
  };
}

// ---------------------------------------------------------------------------
// 2. realised demographic marginals
// ---------------------------------------------------------------------------

function realisedMarginals(agents: ArchiveTable): Record<string, number> {
  const n = agents.rows.length;
  const idx = {
    mob: agents.requireIndex("mobility_limited"),
    asthma: agents.requireIndex("asthma_flag"),
    copd: agents.requireIndex("copd_flag"),
    resp: agents.requireIndex("any_respiratory"),
    chronic: agents.requireIndex("chronic_physical"),
    vuln: agents.requireIndex("vulnerable_flag"),
    age: agents.requireIndex("age_years"),
    speed: agents.requireIndex("walking_speed_mps"),
    sex: agents.requireIndex("sex"),
  };
  let mob = 0;
  let asthma = 0;
  let copd = 0;
  let resp = 0;
  let chronic = 0;
  let vuln = 0;
  let age55 = 0;
  let speedSum = 0;
  let male = 0;
  for (const row of agents.rows) {
    if (row[idx.mob] === "1") mob += 1;
    if (row[idx.asthma] === "1") asthma += 1;
    if (row[idx.copd] === "1") copd += 1;
    if (row[idx.resp] === "1") resp += 1;
    if (row[idx.chronic] === "1") chronic += 1;
    if (row[idx.vuln] === "1") vuln += 1;
    if (Number(row[idx.age]) >= 55) age55 += 1;
    if (row[idx.sex] === "MALE") male += 1;
    speedSum += Number(row[idx.speed]);
  }
  const r6 = (x: number): number => Math.round(x * 1e6) / 1e6;
  return {
    n,
    mobility_limited: r6(mob / n),
    asthma: r6(asthma / n),
    copd: r6(copd / n),
    any_respiratory: r6(resp / n),
    chronic_physical: r6(chronic / n),
    vulnerable_any: r6(vuln / n),
    age_55plus: r6(age55 / n),
    male: r6(male / n),
    mean_walking_speed_mps: r6(speedSum / n),
  };
}

export function demographicMarginals(loadedRuns: readonly LoadedRun[]): GoldenFile {
  const values: Record<string, unknown> = {};

  for (const loaded of loadedRuns) {
    if (loaded.agents === null || !loaded.agents.has("mobility_limited")) continue;
    const derived = realisedMarginals(loaded.agents);
    const ps = loaded.manifest.population_sampling ?? {};
    values[loaded.run.runDir] = {
      preset_family: loaded.run.presetFamily,
      seed: loaded.run.seed,
      derived_from_agents_csv: derived,
      manifest_population_sampling: {
        realised_mobility_limited: ps["realised_mobility_limited"] ?? null,
        realised_asthma: ps["realised_asthma"] ?? null,
        realised_copd: ps["realised_copd"] ?? null,
        realised_any_respiratory: ps["realised_any_respiratory"] ?? null,
        realised_age_55plus: ps["realised_age_55plus"] ?? null,
        mean_walking_speed_mps: ps["mean_walking_speed_mps"] ?? null,
      },
    };
  }

  return {
    schema: `${GOLDEN_SCHEMA_PREFIX}/demographic-marginals`,
    about:
      "Realised demographic marginals per archived run. Tier 3 requires these to be EQUAL, " +
      "not close: the PopulationSampler is bit-exact, so a live run at the same seed must " +
      "reproduce the same shares exactly (plan §5.1).",
    method:
      "`derived_from_agents_csv` counts raw flag cells in agents.csv (`1` is true, anything " +
      "else false) over all rows and divides by the row count, rounded to 1e-6. " +
      "`age_55plus` uses age_years >= 55. `manifest_population_sampling` is the " +
      "instrument's own 4-decimal report, kept alongside so the rounding gap between the " +
      "two is visible rather than reconciled.",
    provenance: PROVENANCE,
    values,
  };
}

// ---------------------------------------------------------------------------
// 3. exposure identities
// ---------------------------------------------------------------------------

export function exposureIdentities(loadedRuns: readonly LoadedRun[]): GoldenFile {
  const values: Record<string, unknown> = {};

  for (const loaded of loadedRuns) {
    const agents = loaded.agents;
    if (agents === null) continue;

    const doseIdx = agents.requireIndex("cumulative_dose_ugm3h");
    const stateIdx = agents.requireIndex("final_state");
    const vweIdx = agents.index("vwe_ugm3h");
    const ventIdx = agents.index("mean_ventilation_m3h");
    const inhaledIdx = agents.index("inhaled_dose_ug");
    const avgIdx = agents.requireIndex("avg_pm25_ugm3");
    const peakIdx = agents.requireIndex("peak_pm25_ugm3");
    const hoursIdx = agents.requireIndex("hours_above_unhealthy");

    const neverSheltered = agents.rows.filter((r) => r[stateIdx] !== "SHELTERED");
    const distinct = new Set(neverSheltered.map((r) => r[doseIdx] ?? ""));
    const first = neverSheltered[0];

    let vweMismatch = 0;
    if (vweIdx >= 0) {
      for (const r of agents.rows) {
        if (r[vweIdx] !== r[doseIdx]) vweMismatch += 1;
      }
    }

    let resting = 0;
    let restingExact = 0;
    let ventMin = Number.POSITIVE_INFINITY;
    let ventMax = Number.NEGATIVE_INFINITY;
    if (ventIdx >= 0 && inhaledIdx >= 0) {
      for (const r of agents.rows) {
        const v = Number(r[ventIdx]);
        if (v < ventMin) ventMin = v;
        if (v > ventMax) ventMax = v;
        if (r[ventIdx] === "0.6100") {
          resting += 1;
          const dose = Number(r[doseIdx]);
          const inhaled = Number(r[inhaledIdx]);
          if (Math.abs(Math.round(dose * 0.61 * 1e4) / 1e4 - inhaled) <= 1e-4) restingExact += 1;
        }
      }
    }

    values[loaded.run.runDir] = {
      preset_family: loaded.run.presetFamily,
      seed: loaded.run.seed,
      never_sheltered: {
        count: neverSheltered.length,
        distinct_exposure_values: distinct.size,
        exposure_ugm3h: distinct.size === 1 && first ? (first[doseIdx] ?? null) : null,
        avg_pm25_ugm3: distinct.size === 1 && first ? (first[avgIdx] ?? null) : null,
        peak_pm25_ugm3: distinct.size === 1 && first ? (first[peakIdx] ?? null) : null,
        hours_above_unhealthy: distinct.size === 1 && first ? (first[hoursIdx] ?? null) : null,
      },
      vwe_equals_dose_mismatch_rows: vweIdx >= 0 ? vweMismatch : null,
      resting_dose: {
        agents_at_resting_ventilation_0_6100: ventIdx >= 0 ? resting : null,
        of_which_inhaled_equals_exposure_x_0_61: ventIdx >= 0 ? restingExact : null,
        mean_ventilation_m3h_min: Number.isFinite(ventMin) ? ventMin : null,
        mean_ventilation_m3h_max: Number.isFinite(ventMax) ? ventMax : null,
      },
    };
  }

  return {
    schema: `${GOLDEN_SCHEMA_PREFIX}/exposure-identities`,
    about:
      "The hand-checkable exposure facts a port must reproduce exactly: the single " +
      "never-sheltered exposure value, the vwe/dose row identity, and the resting-dose " +
      "ratio (PORT_MAP §6.1, plan §5.1 Tier 3).",
    method:
      "`never_sheltered` selects rows whose final_state is not SHELTERED and reports the " +
      "distinct raw `cumulative_dose_ugm3h` strings; the identity holds when that count is " +
      "1. `vwe_equals_dose_mismatch_rows` compares the two columns as RAW TEXT, so it " +
      "proves byte identity rather than numeric closeness. `resting_dose` counts rows whose " +
      "`mean_ventilation_m3h` is exactly `0.6100` and, of those, how many satisfy " +
      "inhaled_dose_ug == round(exposure x 0.61, 4) — the 0.61 constant is a RESTING " +
      "ventilation rate, not a population-wide factor, and the min/max ventilation columns " +
      "are published so that is checkable. CAVEAT, and the reason the second count is " +
      "published rather than asserted: the check reconstructs the product from the archive's " +
      "4-decimal-rounded exposure, not from the engine's internal double, so a row whose " +
      "true product sits within ~3e-5 of a 4th-decimal boundary can round the other way. " +
      "Exactly one row in the whole digested set does (scenario-e-v2/SE2-E18-d1-seed42, " +
      "exposure 29457.9542 -> 17969.3521 reconstructed vs 17969.3520 recorded). A port " +
      "should compare its own internal doubles, not these reconstructions.",
    provenance: PROVENANCE,
    values,
  };
}

// ---------------------------------------------------------------------------
// 4. capacity sums
// ---------------------------------------------------------------------------

export function capacitySums(loadedRuns: readonly LoadedRun[]): GoldenFile {
  const groups = new Map<string, Record<string, unknown>>();

  for (const loaded of loadedRuns) {
    const shelters = loaded.shelters;
    if (shelters === null) continue;
    const capIdx = shelters.requireIndex("capacity");
    const occIdx = shelters.requireIndex("final_occupancy");
    let cap = 0;
    let occ = 0;
    let unlimited = 0;
    for (const row of shelters.rows) {
      const raw = row[capIdx] ?? "";
      if (raw === "") unlimited += 1;
      else cap += Number(raw);
      occ += Number(row[occIdx]);
    }
    const key = configKey(loaded.run);
    const group = (groups.get(key) ?? {
      preset_family: loaded.run.presetFamily,
      runs: {},
    }) as Record<string, unknown>;
    (group["runs"] as Record<string, unknown>)[loaded.run.runDir] = {
      shelter_sites: shelters.rows.length,
      capacity_sum: cap,
      unlimited_capacity_sites: unlimited,
      final_occupancy_sum: occ,
    };
    groups.set(key, group);
  }

  const values: Record<string, unknown> = {};
  for (const [key, group] of [...groups].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const runs = group["runs"] as Record<string, { capacity_sum: number; shelter_sites: number }>;
    const caps = [...new Set(Object.values(runs).map((r) => r.capacity_sum))].sort((a, b) => a - b);
    const sites = [...new Set(Object.values(runs).map((r) => r.shelter_sites))].sort((a, b) => a - b);
    values[key] = {
      preset_family: group["preset_family"],
      capacity_sums_seen: caps,
      shelter_site_counts_seen: sites,
      constant_within_config: caps.length === 1 && sites.length === 1,
      runs,
    };
  }

  return {
    schema: `${GOLDEN_SCHEMA_PREFIX}/capacity-sums`,
    about:
      "U-03 bed-sum inputs: the designed system capacity each archived configuration ran " +
      "with. verify_2026_runs.py asserts A == 2234 and B/C == 6842 (plan §5.1, §5.2).",
    method:
      "Sums the `capacity` column of shelters.csv over all rows. A BLANK capacity cell means " +
      "UNLIMITED, never zero (PORT_MAP §4.3), so blanks are excluded from the sum and " +
      "counted separately in `unlimited_capacity_sites`.",
    provenance: PROVENANCE,
    values,
  };
}

// ---------------------------------------------------------------------------
// 5. cross-arm hashes
// ---------------------------------------------------------------------------

/** SHA-256 over the comma-joined, lexicographically sorted UNREACHABLE ids. */
export function unreachableIdSetHash(agents: ArchiveTable): { hash: string; count: number } {
  const idIdx = agents.requireIndex("agent_id");
  const stateIdx = agents.requireIndex("final_state");
  const ids = agents.rows
    .filter((r) => r[stateIdx] === "UNREACHABLE")
    .map((r) => r[idIdx] ?? "")
    .sort();
  return { hash: sha256Hex(ids.join(",")), count: ids.length };
}

/**
 * SHA-256 over the POP_COLS projection as raw text: a header line, then one line
 * per row with the raw cells in POP_COLS order, rows sorted by the raw
 * `agent_id` string, LF terminators including a trailing one.
 */
export function populationColumnHash(agents: ArchiveTable): string {
  const indices = POP_COLS.map((c) => agents.requireIndex(c));
  const idIdx = agents.requireIndex("agent_id");
  const ordered = [...agents.rows].sort((a, b) => {
    const x = a[idIdx] ?? "";
    const y = b[idIdx] ?? "";
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const lines = [POP_COLS.join(",")];
  for (const row of ordered) {
    lines.push(indices.map((i) => row[i] ?? "").join(","));
  }
  return sha256Hex(`${lines.join("\n")}\n`);
}

export function crossArmHashes(loadedRuns: readonly LoadedRun[]): GoldenFile {
  const bySeed = new Map<number, Record<string, unknown>>();

  for (const loaded of loadedRuns) {
    const agents = loaded.agents;
    const seed = loaded.run.seed;
    if (agents === null || seed === null) continue;
    if (!["A", "B", "C"].includes(loaded.run.presetFamily)) continue;
    if (loaded.run.family !== "present-day-three-arm") continue;
    const entry = bySeed.get(seed) ?? {};
    const un = unreachableIdSetHash(agents);
    entry[loaded.run.presetFamily] = {
      source: loaded.run.runDir,
      population_column_sha256: populationColumnHash(agents),
      unreachable_id_set_sha256: un.hash,
      unreachable_count: un.count,
    };
    bySeed.set(seed, entry);
  }

  const values: Record<string, unknown> = {};
  for (const [seed, arms] of [...bySeed].sort(([a], [b]) => a - b)) {
    const popHashes = new Set(
      Object.values(arms).map((v) => (v as Record<string, string>)["population_column_sha256"]),
    );
    const unHashes = new Set(
      Object.values(arms).map((v) => (v as Record<string, string>)["unreachable_id_set_sha256"]),
    );
    values[String(seed)] = {
      arms,
      population_identical_across_arms: popHashes.size === 1,
      unreachable_identical_across_arms: unHashes.size === 1,
      population_column_sha256: popHashes.size === 1 ? [...popHashes][0] : null,
      unreachable_id_set_sha256: unHashes.size === 1 ? [...unHashes][0] : null,
    };
  }

  return {
    schema: `${GOLDEN_SCHEMA_PREFIX}/cross-arm-hashes`,
    about:
      "verify_2026_runs.py's two cross-arm identities: within a seed the sampled population " +
      "and the UNREACHABLE id set must be identical across arms A, B and C, because both are " +
      "properties of the world build and the graph, not of shelter capacity (plan §5.1).",
    method:
      "population_column_sha256 = SHA-256 of the POP_COLS projection as RAW TEXT: the header " +
      "line `" +
      POP_COLS.join(",") +
      "`, then one line per row with raw cells in that order, rows sorted by the raw agent_id " +
      "string, LF terminators including a trailing newline. " +
      "unreachable_id_set_sha256 = SHA-256 of the lexicographically sorted UNREACHABLE " +
      "agent_id values joined by commas, with no trailing separator. " +
      "NOTE: verify_2026_runs.py hashes a pandas re-serialisation instead, so its digest " +
      "values differ from these by construction; the invariant under test is the same.",
    provenance: PROVENANCE,
    values,
  };
}

// ---------------------------------------------------------------------------
// index
// ---------------------------------------------------------------------------

export interface GoldenSummarySet {
  readonly files: Readonly<Record<string, GoldenFile>>;
  readonly index: Record<string, unknown>;
}

/**
 * The normalised provenance table: run directory → the archive files every
 * other summary file's numbers were read from, with byte length and SHA-256.
 */
export function sourcesFile(loadedRuns: readonly LoadedRun[]): GoldenFile {
  const sources: Record<string, SourceRecord> = {};
  for (const loaded of [...loadedRuns].sort((a, b) => (a.run.runDir < b.run.runDir ? -1 : 1))) {
    sources[loaded.run.runDir] = sourceOf(loaded);
  }
  return {
    schema: `${GOLDEN_SCHEMA_PREFIX}/sources`,
    about:
      "Provenance for every number in the other golden-summary files: the archive run " +
      "directory each value was derived from, and the byte length and SHA-256 of each file " +
      "read from it.",
    method:
      "SHA-256 is taken over the file's raw bytes as stored in docs/runs/ (CRLF line " +
      "terminators preserved). A re-derivation that reads different bytes than these must " +
      "be treated as a different archive, not as drift.",
    provenance: { source_index: "sources.json", note: "This file IS the source index." },
    values: sources,
  };
}

export const GOLDEN_FILE_NAMES = [
  "sources.json",
  "sheltered-envelopes.json",
  "demographic-marginals.json",
  "exposure-identities.json",
  "capacity-sums.json",
  "cross-arm-hashes.json",
] as const;

export function buildGoldenSummaries(loadedRuns: readonly LoadedRun[]): GoldenSummarySet {
  const files: Record<string, GoldenFile> = {
    "sources.json": sourcesFile(loadedRuns),
    "sheltered-envelopes.json": shelteredEnvelopes(loadedRuns),
    "demographic-marginals.json": demographicMarginals(loadedRuns),
    "exposure-identities.json": exposureIdentities(loadedRuns),
    "capacity-sums.json": capacitySums(loadedRuns),
    "cross-arm-hashes.json": crossArmHashes(loadedRuns),
  };

  const index = {
    schema: `${GOLDEN_SCHEMA_PREFIX}/index`,
    about:
      "Committed digests of the read-only Java golden archive (docs/runs/, ~375 MB, 154 " +
      "manifests, 136 of them with per-agent CSVs). Hosted CI never sees the archive; these " +
      "files are what Tier-3 checks compare against, and every value in them resolves " +
      "through sources.json to the archive bytes it was derived from.",
    rebuild:
      "npx tsx pipeline/scripts/build-golden-summaries.ts [--check] against a local archive " +
      "(WEBSIM_ARCHIVE_ROOT, else docs/runs/).",
    files: GOLDEN_FILE_NAMES.map((name) => ({
      file: name,
      schema: (files[name] as GoldenFile).schema,
      about: (files[name] as GoldenFile).about,
      sha256: sha256Hex(serialiseGolden(files[name] as GoldenFile)),
    })),
    archive_census: {
      runs_digested: loadedRuns.length,
      runs_with_agents_csv: loadedRuns.filter((r) => r.agents !== null).length,
      runs_with_shelters_csv: loadedRuns.filter((r) => r.shelters !== null).length,
      preset_families_digested: [
        ...new Set(loadedRuns.map((r) => r.run.presetFamily)),
      ].sort(),
    },
  };

  return { files, index };
}

/** Deterministic on-disk text: 2-space indent, LF, trailing newline. */
export function serialiseGolden(file: GoldenFile | Record<string, unknown>): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
