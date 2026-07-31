/**
 * Tests for the committed golden summaries (plan §4, §5.1 Tier 3).
 *
 * Two layers, deliberately:
 *
 *  1. **Always** — structural and self-consistency checks that need no archive:
 *     the index's per-file SHA-256 matches the file's own bytes, every `values`
 *     key resolves in `sources.json`, the cross-arm identities actually hold,
 *     and the facts a port has to reproduce are present and internally
 *     consistent. This is what hosted CI runs.
 *  2. **When the archive is present** — the digests are re-derived from
 *     `docs/runs/` and compared byte-for-byte. When it is absent the shared
 *     skip-vs-fail policy (`tools/artifact-gate.ts`) prints the loud banner and
 *     reports the suite as SKIPPED instead of quietly reporting green (plan
 *     §5.3, risk W18) — and turns the same absence into a hard failure on a
 *     runner that sets `WEBSIM_REQUIRE_ARTIFACTS`.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildGoldenSummaries,
  describeArchive,
  discoverRuns,
  GOLDEN_FILE_NAMES,
  loadRun,
  serialiseGolden,
  sha256Hex,
} from "@websim/pipeline/archive";

import { artifactGate, describeGated } from "../../tools/artifact-gate.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, "..", "golden-summaries");

const read = (name: string): string => readFileSync(path.join(DIR, name), "utf8");
const parse = <T>(name: string): T => JSON.parse(read(name)) as T;

interface GoldenFileShape {
  readonly schema: string;
  readonly about: string;
  readonly method: string;
  readonly provenance: { readonly source_index: string };
  readonly values: Record<string, unknown>;
}
interface IndexShape {
  readonly schema: string;
  readonly files: readonly { file: string; schema: string; sha256: string }[];
  readonly archive_census: Record<string, unknown>;
}

const index = parse<IndexShape>("index.json");
const sources = parse<GoldenFileShape>("sources.json");

const archive = describeArchive();

describe("golden summaries — shape and self-consistency", () => {
  it("commits exactly the files the index lists, plus the index and README", () => {
    const onDisk = readdirSync(DIR).sort();
    expect(onDisk).toEqual([...GOLDEN_FILE_NAMES, "README.md", "index.json"].sort());
    expect(index.files.map((f) => f.file)).toEqual([...GOLDEN_FILE_NAMES]);
  });

  it("records a SHA-256 per file that matches the file's own bytes", () => {
    for (const entry of index.files) {
      // Normalise CRLF: git may check the file out with Windows line endings.
      const text = read(entry.file).replace(/\r\n/gu, "\n");
      expect(sha256Hex(text), entry.file).toBe(entry.sha256);
    }
  });

  it("points every file at the normalised provenance table", () => {
    for (const name of GOLDEN_FILE_NAMES) {
      const file = parse<GoldenFileShape>(name);
      expect(file.provenance.source_index, name).toBe("sources.json");
      expect(file.method.length, name).toBeGreaterThan(80);
    }
  });

  it("gives every source a run directory and a SHA-256 per file", () => {
    const table = sources.values as Record<string, { run_dir: string; files: unknown[] }>;
    expect(Object.keys(table).length).toBeGreaterThan(0);
    for (const [key, record] of Object.entries(table)) {
      expect(record.run_dir).toBe(key);
      expect(record.files.length).toBeGreaterThan(0);
      for (const f of record.files as { file: string; bytes: number; sha256: string }[]) {
        expect(f.sha256, `${key}/${f.file}`).toMatch(/^[0-9a-f]{64}$/u);
        expect(f.bytes).toBeGreaterThan(0);
      }
    }
  });

  it("resolves every value key back to a source — no orphan numbers", () => {
    const table = sources.values as Record<string, unknown>;
    const marginals = parse<GoldenFileShape>("demographic-marginals.json");
    const exposure = parse<GoldenFileShape>("exposure-identities.json");
    for (const key of [...Object.keys(marginals.values), ...Object.keys(exposure.values)]) {
      expect(table[key], key).toBeDefined();
    }
    const envelopes = parse<GoldenFileShape>("sheltered-envelopes.json");
    for (const group of Object.values(envelopes.values) as { by_seed: Record<string, { source: string }> }[]) {
      for (const seedEntry of Object.values(group.by_seed)) {
        expect(table[seedEntry.source], seedEntry.source).toBeDefined();
      }
    }
  });
});

describe("golden summaries — the facts a port must reproduce", () => {
  it("holds the nine-seed three-arm envelope, with unreachable identical across arms", () => {
    const values = parse<GoldenFileShape>("sheltered-envelopes.json").values as Record<
      string,
      { seeds: number[]; sheltered: { min: number; max: number; n_seeds: number }; unreachable: { min: number; max: number } }
    >;
    for (const arm of ["A", "B", "C"]) {
      const group = values[`present-day-three-arm/${arm}-seed*`];
      expect(group, arm).toBeDefined();
      expect(group?.seeds).toEqual([42, 43, 44, 45, 46, 47, 48, 49, 50]);
      expect(group?.sheltered.n_seeds).toBe(9);
      expect(group?.sheltered.min).toBeLessThan(group?.sheltered.max as number);
    }
    // The unreachable envelope is a pure graph property, so it must be identical
    // across the three arms rather than merely similar.
    const un = ["A", "B", "C"].map((a) => values[`present-day-three-arm/${a}-seed*`]?.unreachable);
    expect(un[1]).toEqual(un[0]);
    expect(un[2]).toEqual(un[0]);
  });

  it("holds the cross-arm population and UNREACHABLE hashes for all nine seeds", () => {
    const values = parse<GoldenFileShape>("cross-arm-hashes.json").values as Record<
      string,
      {
        population_identical_across_arms: boolean;
        unreachable_identical_across_arms: boolean;
        population_column_sha256: string | null;
        unreachable_id_set_sha256: string | null;
        arms: Record<string, { unreachable_count: number }>;
      }
    >;
    const seeds = Object.keys(values).map(Number).sort((a, b) => a - b);
    expect(seeds).toEqual([42, 43, 44, 45, 46, 47, 48, 49, 50]);
    const popHashes = new Set<string>();
    for (const seed of seeds) {
      const v = values[String(seed)];
      expect(Object.keys(v?.arms ?? {}).sort(), String(seed)).toEqual(["A", "B", "C"]);
      expect(v?.population_identical_across_arms, String(seed)).toBe(true);
      expect(v?.unreachable_identical_across_arms, String(seed)).toBe(true);
      expect(v?.population_column_sha256, String(seed)).toMatch(/^[0-9a-f]{64}$/u);
      popHashes.add(v?.population_column_sha256 as string);
    }
    // ...and different BETWEEN seeds, or the hash would be measuring nothing.
    expect(popHashes.size).toBe(seeds.length);
  });

  it("holds the never-sheltered exposure identity as a single exact value per run", () => {
    const values = parse<GoldenFileShape>("exposure-identities.json").values as Record<
      string,
      {
        never_sheltered: { count: number; distinct_exposure_values: number; exposure_ugm3h: string | null };
        vwe_equals_dose_mismatch_rows: number | null;
      }
    >;
    const a42 = values["present-day-three-arm/A-seed42"];
    expect(a42?.never_sheltered.distinct_exposure_values).toBe(1);
    expect(a42?.never_sheltered.exposure_ugm3h).toBe("54002.8192");
    // The vwe/dose identity is byte-level and must hold in every digested run.
    for (const [key, v] of Object.entries(values)) {
      if (v.vwe_equals_dose_mismatch_rows !== null) {
        expect(v.vwe_equals_dose_mismatch_rows, key).toBe(0);
      }
    }
  });

  it("holds the U-03 capacity sums: arm A 2,234 beds, arms B and C 6,842", () => {
    const values = parse<GoldenFileShape>("capacity-sums.json").values as Record<
      string,
      { capacity_sums_seen: number[]; shelter_site_counts_seen: number[]; constant_within_config: boolean }
    >;
    expect(values["present-day-three-arm/A-seed*"]?.capacity_sums_seen).toEqual([2234]);
    expect(values["present-day-three-arm/B-seed*"]?.capacity_sums_seen).toEqual([6842]);
    expect(values["present-day-three-arm/C-seed*"]?.capacity_sums_seen).toEqual([6842]);
    expect(values["present-day-three-arm/A-seed*"]?.shelter_site_counts_seen).toEqual([36]);
    expect(values["present-day-three-arm/C-seed*"]?.shelter_site_counts_seen).toEqual([46]);
    for (const [key, v] of Object.entries(values)) {
      expect(v.constant_within_config, key).toBe(true);
    }
  });

  it("keeps the derived marginals and the manifest's own report as separate blocks", () => {
    const values = parse<GoldenFileShape>("demographic-marginals.json").values as Record<
      string,
      {
        derived_from_agents_csv: Record<string, number>;
        manifest_population_sampling: Record<string, number | null>;
      }
    >;
    const a42 = values["present-day-three-arm/A-seed42"];
    expect(a42).toBeDefined();
    const derived = a42?.derived_from_agents_csv as Record<string, number>;
    const reported = a42?.manifest_population_sampling as Record<string, number>;
    // The instrument reports 4 decimals; the derived share is exact to 1e-6.
    // They must agree once the derived value is rounded the same way.
    expect(Math.round(derived["mobility_limited"] as number * 1e4) / 1e4).toBe(
      reported["realised_mobility_limited"],
    );
    expect(Math.round(derived["asthma"] as number * 1e4) / 1e4).toBe(reported["realised_asthma"]);
    expect(Math.round(derived["copd"] as number * 1e4) / 1e4).toBe(reported["realised_copd"]);
    expect(Math.round(derived["age_55plus"] as number * 1e4) / 1e4).toBe(
      reported["realised_age_55plus"],
    );
  });

  it("shares one population across arms within a seed — the marginals must match exactly", () => {
    const values = parse<GoldenFileShape>("demographic-marginals.json").values as Record<
      string,
      { derived_from_agents_csv: Record<string, number> }
    >;
    for (let seed = 42; seed <= 50; seed += 1) {
      const a = values[`present-day-three-arm/A-seed${seed}`]?.derived_from_agents_csv;
      const b = values[`present-day-three-arm/B-seed${seed}`]?.derived_from_agents_csv;
      const c = values[`present-day-three-arm/C-seed${seed}`]?.derived_from_agents_csv;
      expect(b, String(seed)).toEqual(a);
      expect(c, String(seed)).toEqual(a);
    }
  });
});

describeGated(
  artifactGate({
    gate: "validation:golden-summaries-rederived",
    suite: "golden summaries — re-derived from the archive",
    evidence:
      "every committed golden summary re-derived from the 375 MB archive and compared BYTE for " +
      "byte — without it the committed digests are only self-consistent, never re-earned",
    artifacts: [{ source: "archive", label: archive.source, path: archive.root }],
  }),
  () => {
  it("matches the committed bytes exactly", () => {
    const DIGESTED = new Set(["A", "B", "C", "E0", "ER", "SE", "SEnc", "SE2", "SE2nc"]);
    const runs = discoverRuns(archive.root).filter((r) => DIGESTED.has(r.presetFamily));
    const loaded = runs.map((r) => loadRun(archive.root, r));
    const { files, index: rebuiltIndex } = buildGoldenSummaries(loaded);
    for (const name of GOLDEN_FILE_NAMES) {
      expect(serialiseGolden(files[name] as never), name).toBe(read(name).replace(/\r\n/gu, "\n"));
    }
    expect(serialiseGolden(rebuiltIndex)).toBe(read("index.json").replace(/\r\n/gu, "\n"));
  }, 600_000);
  },
);
