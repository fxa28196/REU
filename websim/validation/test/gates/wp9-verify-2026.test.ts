/**
 * wp9-verify-2026.test.ts — the `verify_2026_runs.py` invariant set, over the
 * 27 archived three-arm runs.
 *
 * `docs/runs/present-day-three-arm/` holds A/B/C × seeds 42–50: the experiment
 * every headline number in the chapter is drawn from. The gate's job is to
 * prove those 27 runs are *one experiment* — same population, same graph, same
 * model source, same data version within an arm — rather than 27 unrelated
 * runs that happen to share a directory.
 *
 * ## Two independent oracles, neither of them this port
 *
 *  1. **The archive itself.** Every check must be green on bytes the certified
 *     Java instrument wrote and `verify_2026_runs.py` already blessed.
 *  2. **`validation/golden-summaries/cross-arm-hashes.json`.** The two digests
 *     this gate computes have *committed* values in that file, derived by
 *     `pipeline/scripts/build-golden-summaries.ts` — a different module, in a
 *     different package, written for a different purpose. Reproducing them
 *     byte-for-byte is a real cross-check; a digest function verified only
 *     against its own output would be verifying nothing.
 *
 * The gate's *thresholds* (2234 / 6842, 3 SE, 2 SE) come from the Python. The
 * *expected digests* come from the golden summaries. Nothing in this file
 * invents a number.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { describeArchive, discoverRuns } from "@websim/pipeline/archive";

import { artifactGate, describeGated, type ArtifactRef } from "../../../tools/artifact-gate.js";
import { Checks, loadRunDir, runFromDocuments, type RunView } from "../../src/harness/index.js";
import {
  ARM_CODE,
  EXPECTED_CAP,
  EXPECTED_N_AGENTS,
  POP_COLS,
  checkVerify2026,
  populationColumnSha256,
  unreachableIdSetSha256,
  type ArmRun,
} from "../../src/gates/index.js";

const archive = describeArchive();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = path.join(HERE, "..", "..", "golden-summaries");

const THREE_ARM = "present-day-three-arm";
const SEEDS: readonly number[] = [42, 43, 44, 45, 46, 47, 48, 49, 50];

const ARCHIVE_REF: ArtifactRef = {
  source: "archive",
  label: `docs/runs/${THREE_ARM}`,
  path: path.join(archive.root, THREE_ARM),
};

const gate = artifactGate({
  gate: "validation:wp9-verify-2026",
  suite: "WP9 verify_2026_runs — cross-run invariants over the 27 archived three-arm runs",
  evidence:
    "the ported verify_2026_runs.py invariant set (U-03 capacity sums 2234/6842, within-arm " +
    "data_version_tag constancy, one source-integrity checksum set, the POP_COLS cross-arm " +
    "population digest, the U-27 UNREACHABLE id-set digest and the U-19 negative controls at " +
    "3 SE per run and 2 SE pooled) runs green over all 27 archived runs, and its two digests " +
    "reproduce the committed golden-summaries values byte-for-byte",
  artifacts: [ARCHIVE_REF],
});

// ---------------------------------------------------------------------------

interface GoldenArm {
  readonly source: string;
  readonly population_column_sha256: string;
  readonly unreachable_id_set_sha256: string;
  readonly unreachable_count: number;
}
interface GoldenSeed {
  readonly arms: Record<string, GoldenArm>;
  readonly population_identical_across_arms: boolean;
  readonly unreachable_identical_across_arms: boolean;
}

function golden(): Record<string, GoldenSeed> {
  const text = readFileSync(path.join(GOLDEN_DIR, "cross-arm-hashes.json"), "utf8");
  return (JSON.parse(text) as { values: Record<string, GoldenSeed> }).values;
}

let loaded: readonly ArmRun[] | null = null;
function threeArmRuns(): readonly ArmRun[] {
  loaded ??= discoverRuns(archive.root)
    .filter((r) => r.family === THREE_ARM)
    .map((r) => {
      const dir = path.join(archive.root, ...r.runDir.split("/"));
      const name = path.basename(dir);
      const arm = r.presetFamily;
      const seed = r.seed;
      if (seed === null) {
        throw new Error(`${r.runDir}: no seed in the archive index`);
      }
      return { arm, seed, run: loadRunDir(dir, name) };
    });
  return loaded;
}

function docsOf(runDir: string): { agentsCsv: string; sheltersCsv: string; simulationJson: string } {
  const dir = path.join(archive.root, ...runDir.split("/"));
  return {
    agentsCsv: readFileSync(path.join(dir, "agents.csv"), "utf8"),
    sheltersCsv: readFileSync(path.join(dir, "shelters.csv"), "utf8"),
    simulationJson: readFileSync(path.join(dir, "simulation.json"), "utf8"),
  };
}

/**
 * Re-grade the whole 27-run set with ONE run's bytes edited. The cross-run
 * invariants can only be corroded that way: a single run in isolation has
 * nothing to disagree with.
 */
function corrodeOne(
  runDir: string,
  edit: (d: { agentsCsv: string; sheltersCsv: string; simulationJson: string }) => void,
): Checks {
  const target = path.basename(runDir);
  const patched: ArmRun[] = threeArmRuns().map((r) => {
    if (r.run.name !== target) {
      return r;
    }
    const d = docsOf(runDir);
    const before = { ...d };
    edit(d);
    if (
      d.agentsCsv === before.agentsCsv &&
      d.sheltersCsv === before.sheltersCsv &&
      d.simulationJson === before.simulationJson
    ) {
      throw new Error(`corrodeOne(${runDir}): the edit changed nothing, so the case proves nothing`);
    }
    return { ...r, run: runFromDocuments({ name: target, ...d }) as RunView };
  });
  const ck = new Checks();
  checkVerify2026(ck, patched);
  return ck;
}

function statusOf(ck: Checks, needle: string): string {
  const hits = ck.results.filter((c) => c.name.includes(needle));
  if (hits.length !== 1) {
    throw new Error(
      `expected one check matching '${needle}', got ${hits.length}: ${hits
        .map((h) => h.name)
        .join(" | ")}`,
    );
  }
  return (hits[0] as { status: string }).status;
}

// ---------------------------------------------------------------------------

describeGated(gate, () => {
  it("finds all 27 three-arm runs, three arms per seed", () => {
    const runs = threeArmRuns();
    expect(runs.length).toBe(27);
    const perSeed = new Map<number, string[]>();
    for (const r of runs) {
      perSeed.set(r.seed, [...(perSeed.get(r.seed) ?? []), r.arm].sort());
    }
    expect([...perSeed.keys()].sort((a, b) => a - b)).toEqual([...SEEDS]);
    for (const [seed, arms] of perSeed) {
      expect(arms, `seed ${seed}`).toEqual(["A", "B", "C"]);
    }
  }, 300_000);

  it("holds every verify_2026 invariant across the 27 runs", () => {
    const ck = new Checks();
    checkVerify2026(ck, threeArmRuns());

    // eslint-disable-next-line no-console -- the census IS the evidence.
    console.log(`[wp9-2026] 27 archived runs -> ${ck.summary()}`);

    expect(ck.failureReport()).toBe("");
    expect(ck.skipped.length).toBe(0);
    // 27 runs x (5 per-run + 1 capacity + 2 negative controls) = 216,
    // + 3 data_version_tag + 1 integrity set + 9 population + 9 unreachable
    // + 6 pooled negative controls = 244.
    expect(ck.results.length).toBe(244);
  }, 600_000);

  it("reproduces the committed golden cross-arm digests byte-for-byte", () => {
    const want = golden();
    let compared = 0;
    for (const { arm, seed, run } of threeArmRuns()) {
      const entry = want[String(seed)]?.arms[arm];
      expect(entry, `no golden entry for seed ${seed} arm ${arm}`).toBeDefined();
      expect(populationColumnSha256(run), `${arm}-seed${seed} population digest`).toBe(
        entry?.population_column_sha256,
      );
      expect(unreachableIdSetSha256(run), `${arm}-seed${seed} unreachable digest`).toBe(
        entry?.unreachable_id_set_sha256,
      );
      compared += 2;
    }
    expect(compared).toBe(54);
  }, 600_000);

  it("holds the U-03 capacity sums the plan quotes: A 2234, B and C 6842", () => {
    // Stated separately from the gate so the two headline numbers are asserted
    // by name rather than only inside a pass/fail line.
    expect(EXPECTED_CAP).toEqual({ A: 2234, B: 6842, C: 6842 });
    expect(ARM_CODE).toEqual({ A: 0, B: 1, C: 2 });
    expect(EXPECTED_N_AGENTS).toBe(6842);
    for (const { arm, run } of threeArmRuns()) {
      let cap = 0;
      for (const cell of run.shelters.column("capacity")) {
        if (cell !== "") cap += Math.trunc(Number(cell));
      }
      expect(cap, `${run.name} capacity sum`).toBe(EXPECTED_CAP[arm]);
    }
  }, 600_000);

  it("sees data_version_tag differ BETWEEN arms — the invariant is within-arm", () => {
    // The source comment is explicit: each arm loads a different shelter file
    // by design. A port that asserted one global tag would fail 27 correct
    // runs; this pins the shape the gate is actually written against.
    const byArm = new Map<string, Set<string>>();
    for (const { arm, run } of threeArmRuns()) {
      const tag = String(run.repro["data_version_tag"]);
      byArm.set(arm, new Set([...(byArm.get(arm) ?? []), tag]));
    }
    for (const [arm, tags] of byArm) {
      expect(tags.size, `arm ${arm} tags`).toBe(1);
    }
    const distinct = new Set([...byArm.values()].map((s) => [...s][0]));
    expect(distinct.size).toBe(3);
  }, 600_000);

  // --- corrosion, on real archived bytes ------------------------------------

  it("goes red when one arm's shelter capacity sum drifts (U-03)", () => {
    const ck = corrodeOne(`${THREE_ARM}/A-seed42`, (d) => {
      const lines = d.sheltersCsv.split("\r\n");
      const row = (lines[1] as string).split(",");
      row[4] = String(Number(row[4]) + 1); // capacity
      lines[1] = row.join(",");
      d.sheltersCsv = lines.join("\r\n");
    });
    expect(statusOf(ck, "[A-seed42] shelter capacity sum")).toBe("FAIL");
  }, 600_000);

  it("goes red when one seed's data_version_tag drifts inside its arm", () => {
    const ck = corrodeOne(`${THREE_ARM}/A-seed43`, (d) => {
      d.simulationJson = d.simulationJson.replace(
        '"data_version_tag": "bdce237a6a6a"',
        '"data_version_tag": "ffffffffffff"',
      );
    });
    expect(statusOf(ck, "arm A: data_version_tag identical across seeds")).toBe("FAIL");
    expect(statusOf(ck, "arm B: data_version_tag identical across seeds")).toBe("PASS");
  }, 600_000);

  it("goes red when one run was compiled from different source", () => {
    const ck = corrodeOne(`${THREE_ARM}/B-seed44`, (d) => {
      // ONE checksum inside source_integrity.files, changed. Nothing else
      // moves: the run stays internally consistent, every per-run check on it
      // stays green, and only the CROSS-run identity notices — which is the
      // whole reason this gate exists alongside the per-run ones.
      const m = JSON.parse(d.simulationJson) as Record<string, unknown>;
      const repro = m["reproducibility"] as Record<string, unknown>;
      const integrity = repro["source_integrity"] as Record<string, unknown>;
      const files = integrity["files"] as { sha256: string }[];
      expect(files.length).toBeGreaterThan(1);
      (files[0] as { sha256: string }).sha256 = "deadbeef".repeat(8);
      d.simulationJson = JSON.stringify(m);
    });
    expect(statusOf(ck, "source_integrity checksum set identical across all runs")).toBe("FAIL");
    // The run itself is still internally fine — this is a cross-run-only red.
    expect(statusOf(ck, "[B-seed44] git_working_tree_dirty is False")).toBe("PASS");
    expect(statusOf(ck, "[B-seed44] scenarioCode == arm code")).toBe("PASS");
  }, 600_000);

  it("goes red when one arm silently re-sampled the population (POP_COLS)", () => {
    const ck = corrodeOne(`${THREE_ARM}/C-seed42`, (d) => {
      const lines = d.agentsCsv.split("\r\n");
      const header = (lines[0] as string).split(",");
      const iAge = header.indexOf("age_years");
      const row = (lines[1] as string).split(",");
      row[iAge] = String(Number(row[iAge]) + 1);
      lines[1] = row.join(",");
      d.agentsCsv = lines.join("\r\n");
    });
    expect(statusOf(ck, "seed 42: population identical across arms")).toBe("FAIL");
    expect(statusOf(ck, "seed 43: population identical across arms")).toBe("PASS");
    // ...and it is genuinely the POPULATION check, not a knock-on: the same
    // seed's UNREACHABLE identity is untouched.
    expect(statusOf(ck, "seed 42: UNREACHABLE id set identical across arms")).toBe("PASS");
  }, 600_000);

  it("goes red when the UNREACHABLE id set differs across arms (U-27)", () => {
    const ck = corrodeOne(`${THREE_ARM}/B-seed42`, (d) => {
      // Move one stranded resident into REFUSED_ALL_FULL. The population
      // columns are untouched, so ONLY the U-27 identity can see it.
      d.agentsCsv = d.agentsCsv.replace(",UNREACHABLE,", ",REFUSED_ALL_FULL,");
    });
    expect(statusOf(ck, "seed 42: UNREACHABLE id set identical across arms")).toBe("FAIL");
    expect(statusOf(ck, "seed 42: population identical across arms")).toBe("PASS");
    expect(statusOf(ck, "seed 43: UNREACHABLE id set identical across arms")).toBe("PASS");
  }, 600_000);

  it("goes red when a run's manifest seed stops matching its directory", () => {
    const ck = corrodeOne(`${THREE_ARM}/A-seed45`, (d) => {
      d.simulationJson = d.simulationJson.replace('"random_seed": 45', '"random_seed": 46');
    });
    expect(statusOf(ck, "[A-seed45] manifest random_seed == directory seed")).toBe("FAIL");
  }, 600_000);

  it("goes red when an arm carries the wrong scenarioCode", () => {
    const ck = corrodeOne(`${THREE_ARM}/C-seed44`, (d) => {
      d.simulationJson = d.simulationJson.replace('"scenarioCode": 2', '"scenarioCode": 1');
    });
    expect(statusOf(ck, "[C-seed44] scenarioCode == arm code")).toBe("FAIL");
  }, 600_000);

  it("goes red when a run came from a dirty working tree", () => {
    const ck = corrodeOne(`${THREE_ARM}/B-seed48`, (d) => {
      d.simulationJson = d.simulationJson.replace(
        '"git_working_tree_dirty": false',
        '"git_working_tree_dirty": true',
      );
    });
    expect(statusOf(ck, "[B-seed48] git_working_tree_dirty is False")).toBe("FAIL");
  }, 600_000);

  it("goes red when a mechanism links asthma to shelter access (U-19)", () => {
    const ck = corrodeOne(`${THREE_ARM}/A-seed42`, (d) => {
      // Strand every asthmatic that got inside. There is no mechanism in the
      // model that could do this; the negative control exists to notice one
      // appearing.
      const lines = d.agentsCsv.split("\r\n");
      const header = (lines[0] as string).split(",");
      const iAsthma = header.indexOf("asthma_flag");
      const iState = header.indexOf("final_state");
      const iReached = header.indexOf("reached_shelter");
      for (let i = 1; i < lines.length; i += 1) {
        const line = lines[i] as string;
        if (line === "") continue;
        const row = line.split(",");
        if (row[iAsthma] === "1" && row[iState] === "SHELTERED") {
          row[iState] = "REFUSED_ALL_FULL";
          row[iReached] = "no";
          lines[i] = row.join(",");
        }
      }
      d.agentsCsv = lines.join("\r\n");
    });
    expect(statusOf(ck, "[A-seed42] asthma negative control within 3 SE")).toBe("FAIL");
    expect(statusOf(ck, "arm A pooled asthma_flag: negative control within 2 SE")).toBe("FAIL");
    // The chronic-physical control on the same run is a different stratum and
    // must not be dragged red by the asthma edit alone... except that the two
    // strata overlap, so this asserts only that the ASTHMA one moved.
    expect(statusOf(ck, "[A-seed43] asthma negative control within 3 SE")).toBe("PASS");
  }, 600_000);

  it("goes red when agents.csv loses a row", () => {
    const ck = corrodeOne(`${THREE_ARM}/A-seed49`, (d) => {
      const lines = d.agentsCsv.split("\r\n");
      lines.splice(1, 1);
      d.agentsCsv = lines.join("\r\n");
    });
    expect(statusOf(ck, `[A-seed49] agents.csv holds exactly ${EXPECTED_N_AGENTS} rows`)).toBe(
      "FAIL",
    );
  }, 600_000);

  it("keeps POP_COLS in the order the digest is taken over", () => {
    // The digest is over a projection, so column ORDER is part of its
    // definition. Pinned against the source list rather than recomputed from
    // it, because a reordering would silently change every digest.
    expect(POP_COLS).toEqual([
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
    ]);
  });
});
