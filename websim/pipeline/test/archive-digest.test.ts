/**
 * Digest tests over a synthetic archive.
 *
 * The real archive is 375 MB and lives outside the repo, so the semantics of the
 * derived products are pinned here against a four-agent run whose every hourly
 * count can be worked out by hand. The fixture is written into a temporary
 * archive root under the git-ignored `pipeline/out/`, which also exercises the
 * `WEBSIM_ARCHIVE_ROOT` path a CI runner uses to consume the working set.
 *
 * The second half is the anti-vacuity half (risk W20): each gate is re-run
 * against a deliberately corrupted fixture and MUST go red. A gate that cannot
 * fail is not a gate.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildBundle, niceBinWidth, type ArchiveBundle } from "../src/archive/digest.js";
import { discoverRuns } from "../src/archive/discover.js";
import { describeArchive } from "../src/archive/root.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP_ROOT = path.join(HERE, "..", "out", "test-archive");
const RUN_DIR = path.join(TMP_ROOT, "present-day-three-arm", "A-seed99");

const AGENT_HEADER = [
  "agent_id",
  "time_started_tick",
  "time_arrived_tick",
  "final_state",
  "shelter_reached",
  "reached_shelter",
  "cumulative_dose_ugm3h",
  "vwe_ugm3h",
  "total_travel_distance_m",
  "mean_ventilation_m3h",
  "inhaled_dose_ug",
  "aware_initial",
  "aware_tick",
].join(",");

/**
 * Four agents over a 3-hour run (4 hourly samples, 60 ticks/h):
 *   Site 0  departs tick 0,  arrives tick 0  at S1  -> SHELTERED
 *   Site 1  departs tick 30, arrives tick 90 at S1  -> SHELTERED
 *   Site 2  departs tick 60, never arrives          -> REFUSED_ALL_FULL
 *   Site 3  never departs, never aware              -> UNAWARE
 */
const AGENT_ROWS = [
  "Site 0,0,0,SHELTERED,S1,yes,100.0000,100.0000,10.00,0.7000,70.0000,1,0",
  "Site 1,30,90,SHELTERED,S1,yes,200.0000,200.0000,20.00,0.7000,140.0000,1,0",
  "Site 2,60,,REFUSED_ALL_FULL,,no,54002.8192,54002.8192,30.00,0.7000,37801.9734,1,0",
  "Site 3,,,UNAWARE,,no,54002.8192,54002.8192,0.00,0.6100,32941.7197,0,",
];

const SHELTER_HEADER =
  "shelter_id,name,lon,lat,capacity,operating,peak_occupancy,final_occupancy,refused_count,utilization,mean_travel_dist_m_admitted";
const SHELTER_ROWS = [
  "S1,Shelter One,-122.600000,45.500000,2,true,2,2,1,1.0000,15.00",
  "S2,Shelter Two,-122.700000,45.600000,,true,0,0,0,,",
];

function manifest(overrides: Record<string, unknown> = {}): string {
  const base = {
    schema: "reu-wildfire-shelter-abm/simulation/v1",
    generated_utc: "2026-07-30T00:00:00.000000000",
    reproducibility: {
      random_seed: 99,
      sim_id: "sim-fixture",
      data_version_tag: "fixture00",
      git_commit: "0".repeat(40),
      java_version: "17.0.19",
      repast_version: "2.11.0",
      parameters: {
        numAgents: 4,
        minutesPerTick: 1.0,
        simulationHours: 3,
        randomSeed: 99,
        scenarioCode: 0,
      },
      source_integrity: { git_working_tree_dirty: false, files: [] },
    },
    smoke_field: { county: "Multnomah", hours: 5, peak_hourly_ugm3: 562.7, out_of_range_lookups: 0 },
    population: { n_agents: 4, sheltered: 2, refused_all_full: 1, unreachable: 0 },
    scenario: "fixture",
  };
  return `${JSON.stringify({ ...base, ...overrides }, null, 2)}\n`;
}

function writeFixture(opts: {
  agents?: readonly string[];
  shelters?: readonly string[];
  manifestJson?: string;
} = {}): void {
  mkdirSync(RUN_DIR, { recursive: true });
  writeFileSync(
    path.join(RUN_DIR, "agents.csv"),
    `${[AGENT_HEADER, ...(opts.agents ?? AGENT_ROWS)].join("\r\n")}\r\n`,
    "utf8",
  );
  writeFileSync(
    path.join(RUN_DIR, "shelters.csv"),
    `${[SHELTER_HEADER, ...(opts.shelters ?? SHELTER_ROWS)].join("\r\n")}\r\n`,
    "utf8",
  );
  writeFileSync(path.join(RUN_DIR, "simulation.json"), opts.manifestJson ?? manifest(), "utf8");
}

function bundle(): ArchiveBundle {
  const runs = discoverRuns(TMP_ROOT);
  expect(runs).toHaveLength(1);
  return buildBundle(TMP_ROOT, runs[0] as (typeof runs)[number]);
}

function gate(b: ArchiveBundle, id: string): { ok: boolean; detail: string } {
  const g = b.gates.find((x) => x.id === id);
  if (g === undefined) throw new Error(`no gate '${id}' in [${b.gates.map((x) => x.id).join(", ")}]`);
  return g;
}

beforeAll(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
  writeFixture();
});

afterAll(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("archive bundle — derived products", () => {
  it("classifies the run and records file identity for every file it read", () => {
    const b = bundle();
    expect(b.archive.run_dir).toBe("present-day-three-arm/A-seed99");
    expect(b.archive.preset_family).toBe("A");
    expect(b.archive.seed).toBe(99);
    expect(b.archive.files.map((f) => f.file).sort()).toEqual([
      "agents.csv",
      "shelters.csv",
      "simulation.json",
    ]);
    for (const f of b.archive.files) {
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(f.bytes).toBeGreaterThan(0);
    }
  });

  it("covers simulationHours + 1 samples — the inclusive final tick (gotcha 3)", () => {
    const hourly = bundle().per_agent?.hourly;
    expect(hourly?.hours).toBe(4);
    expect(hourly?.ticks_per_hour).toBe(60);
  });

  it("derives the hourly census with the documented sample-at-tick semantics", () => {
    const hourly = bundle().per_agent?.hourly;
    // departure at tick T first shows at hour ceil(T/60): 0 -> h0, 30 -> h1, 60 -> h1.
    expect(hourly?.not_departed).toEqual([3, 1, 1, 1]);
    // arrivals: tick 0 -> h0, tick 90 -> h2.
    expect(hourly?.sheltered).toEqual([1, 1, 2, 2]);
    expect(hourly?.en_route).toEqual([0, 2, 1, 1]);
    // the never-arriving REFUSED agent stays in en_route by design; the end-of-run
    // truth lives in terminal_states.
    expect(bundle().per_agent?.terminal_states).toEqual({
      REFUSED_ALL_FULL: 1,
      SHELTERED: 2,
      UNAWARE: 1,
    });
  });

  it("counts the never-aware agent in unaware, as a subset of not_departed", () => {
    const hourly = bundle().per_agent?.hourly;
    expect(hourly?.unaware).toEqual([1, 1, 1, 1]);
    for (let h = 0; h < 4; h += 1) {
      expect((hourly?.unaware as number[])[h]).toBeLessThanOrEqual(
        (hourly?.not_departed as number[])[h] as number,
      );
    }
  });

  it("derives monotone per-shelter occupancy in shelters.csv order", () => {
    const occ = bundle().per_agent?.occupancy;
    expect(occ?.shelter_ids).toEqual(["S1", "S2"]);
    expect(occ?.series[0]).toEqual([1, 1, 2, 2]);
    expect(occ?.series[1]).toEqual([0, 0, 0, 0]);
  });

  it("bins exposure on round edges and keeps every agent in exactly one bin", () => {
    const h = bundle().per_agent?.exposure_histogram;
    expect(h?.bin_width).toBe(2000);
    expect(h?.counts.reduce((a, b) => a + b, 0)).toBe(4);
    expect(h?.quantiles["p100"]).toBeCloseTo(54002.8192, 4);
  });

  it("reports the never-sheltered exposure identity and the resting-dose ratio", () => {
    const id = bundle().per_agent?.identities as Record<string, unknown>;
    expect(id["never_sheltered_exposure_ugm3h"]).toBe("54002.8192");
    expect(id["never_sheltered_exposure_is_constant"]).toBe(true);
    expect(id["never_sheltered_count"]).toBe(2);
    expect(id["vwe_equals_dose_mismatches"]).toBe(0);
    // 0.61 is a RESTING ventilation rate, so only the resting agent satisfies it.
    expect(id["resting_agents_vent_0_6100"]).toBe(1);
    expect(id["resting_dose_equals_exposure_times_0_61"]).toBe(1);
  });

  it("treats a blank capacity as unlimited rather than zero", () => {
    const b = bundle();
    expect(b.shelters[1]?.capacity).toBeNull();
    expect(b.headline["capacity_total"]).toBe(2);
    expect(b.headline["capacity_unlimited_sites"]).toBe(1);
  });

  it("passes every gate on the clean fixture", () => {
    for (const g of bundle().gates) {
      expect(g.ok, `${g.id}: ${g.detail}`).toBe(true);
    }
  });
});

describe("archive bundle — gates can actually fail (anti-vacuity, W20)", () => {
  afterAll(() => writeFixture());

  it("bed sum goes red when the manifest disagrees with the CSVs", () => {
    writeFixture({
      manifestJson: manifest({
        population: { n_agents: 4, sheltered: 3, refused_all_full: 1, unreachable: 0 },
      }),
    });
    expect(gate(bundle(), "b_bed_sum_4way").ok).toBe(false);
  });

  it("terminal conservation goes red on a state outside the closed vocabulary", () => {
    writeFixture({
      agents: [
        ...AGENT_ROWS.slice(0, 3),
        "Site 3,,,SNOOZING,,no,54002.8192,54002.8192,0.00,0.6100,32941.7197,0,",
      ],
    });
    const g = gate(bundle(), "d_terminal_state_conservation");
    expect(g.ok).toBe(false);
    expect(g.detail).toContain("OPEN");
  });

  it("UNAWARE immobility goes red when an unaware agent has travelled", () => {
    writeFixture({
      agents: [
        ...AGENT_ROWS.slice(0, 3),
        "Site 3,,,UNAWARE,,no,54002.8192,54002.8192,12.50,0.6100,32941.7197,0,",
      ],
    });
    expect(gate(bundle(), "e_unaware_immobility").ok).toBe(false);
  });

  it("the derived occupancy check goes red when it disagrees with final_occupancy", () => {
    writeFixture({
      shelters: [
        "S1,Shelter One,-122.600000,45.500000,2,true,2,1,1,0.5000,15.00",
        ...SHELTER_ROWS.slice(1),
      ],
    });
    expect(gate(bundle(), "derived_occupancy_matches_final").ok).toBe(false);
  });

  it("the smoke-window gotcha goes red when simulationHours exceeds slices - 1", () => {
    writeFixture({
      manifestJson: manifest({
        smoke_field: { county: "Multnomah", hours: 3, peak_hourly_ugm3: 1, out_of_range_lookups: 0 },
      }),
    });
    expect(gate(bundle(), "gotcha3_hours_le_slices_minus_1").ok).toBe(false);
  });

  it("out_of_range_lookups > 0 goes red — never a warning", () => {
    writeFixture({
      manifestJson: manifest({
        smoke_field: { county: "Multnomah", hours: 5, peak_hourly_ugm3: 1, out_of_range_lookups: 4 },
      }),
    });
    expect(gate(bundle(), "j_out_of_range_lookups_zero").ok).toBe(false);
  });

  it("the vwe identity goes red on a one-digit divergence", () => {
    writeFixture({
      agents: [
        "Site 0,0,0,SHELTERED,S1,yes,100.0000,100.0001,10.00,0.7000,70.0000,1,0",
        ...AGENT_ROWS.slice(1),
      ],
    });
    expect(gate(bundle(), "vwe_equals_dose_raw_text").ok).toBe(false);
  });
});

describe("niceBinWidth", () => {
  it("snaps to 1/2/2.5/5 x 10^k so histogram edges stay readable", () => {
    expect(niceBinWidth(1350.07)).toBe(2000);
    expect(niceBinWidth(0.9)).toBe(1);
    expect(niceBinWidth(2.4)).toBe(2.5);
    expect(niceBinWidth(4.1)).toBe(5);
    expect(niceBinWidth(7)).toBe(10);
  });
});

describe("archive location", () => {
  it("honours WEBSIM_ARCHIVE_ROOT and reports its source", () => {
    const loc = describeArchive({ WEBSIM_ARCHIVE_ROOT: TMP_ROOT } as NodeJS.ProcessEnv);
    expect(loc.source).toBe("env");
    expect(loc.present).toBe(true);
  });

  it("reports absence rather than throwing, so callers can print the banner", () => {
    const loc = describeArchive({
      WEBSIM_ARCHIVE_ROOT: path.join(TMP_ROOT, "does-not-exist"),
    } as NodeJS.ProcessEnv);
    expect(loc.present).toBe(false);
  });
});
