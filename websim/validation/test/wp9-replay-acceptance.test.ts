/**
 * wp9-replay-acceptance.test.ts — WP9's acceptance clause, as a gate.
 *
 * > Acceptance: all Tier-3 gates green on replays of A/B/C seeds 42–44, ER,
 * > SE-E18, SE2-E18-d1, E0 nulls; Tier-4 report shows zero unexplained
 * > divergences. — `IMPLEMENTATION_PLAN.md` §8, WP9
 *
 * Seventeen archived configurations are replayed through the TS engine from
 * their **archived executed manifests**, scored by the ported gate suite, and
 * censused cell by cell against the Java bytes. The engine work happens once in
 * `beforeAll`; every case below reads the results.
 *
 * ## What makes this file evidence rather than ceremony
 *
 * Three things, and they are the three failures this project has actually had:
 *
 *  1. **The check census is asserted, not just the verdict.** A gate that
 *     silently stops registering checks leaves every verdict green and only the
 *     count notices. Each E-class configuration must register exactly the
 *     number of `(a)`–`(l)` checks `WP8-SPEC-archive-gates.md` §3.7 measured
 *     from the certified Python, via the ported `expectedCheckCount`.
 *  2. **The parameter provenance is asserted.** "Driven from the archived
 *     executed manifest" is checked as a number per run — 11 of 41 for a
 *     `present-day-three-arm` manifest, 40 for an E0 null, 33 for `phase-e/`,
 *     41 for `scenario-e-v2/` — so a replay quietly falling back to a preset
 *     changes a count and turns this red.
 *  3. **The Tier-4 census is corroded on the real frames.** A passing census is
 *     indistinguishable from a census that cannot fail, so one case takes the
 *     real arm-A comparison, moves one cell, and requires the verdict to flip
 *     to UNEXPLAINED naming the column.
 *
 * ## The one check that is allowed to be red, and the two-directional assertion
 *
 * Gate (h)'s `git_working_tree_dirty is false` tests a fact about the runner.
 * `validation/src/provenance.ts` measures it with `git status --porcelain` over
 * the port's own sources and reports what it finds, so on an uncommitted tree
 * the check is RED and the gate is working. This file does not skip it: it
 * requires the check's verdict to **equal** the measured tree state, so on a
 * clean tree it demands a PASS. Every other check must pass.
 */

import { beforeAll, expect, it } from "vitest";

import { describeArchive, WORKING_SET } from "@websim/pipeline/archive";

import { artifactGate, describeGated, type ArtifactRef } from "../../tools/artifact-gate.js";
import { expectedCheckCount } from "../src/gates/index.js";
import {
  assetInputDatasets,
  attributeDivergence,
  buildTargetConfig,
  censusLine,
  Checks,
  geographyScheduleSource,
  intParam,
  JAVA_CODE_DEFAULTS,
  loadGoldenSummaries,
  loadRunDir,
  readFrame,
  replayTarget,
  scoreTier3,
  scoreTier3CrossArm,
  targetDir,
  WP9_REPLAY_TARGETS,
  type CheckResult,
  type PermutationEnvelope,
  type ReplayedRun,
  type Tier4Attribution,
} from "../src/harness/index.js";
import { gitWorkingTreeDirty, portSourceIntegrity } from "../src/provenance.js";
import { buildValidationReport, isProvenanceCheck, validateValidationReport } from "../src/report/index.js";
import { ASSET_DIR, GEOGRAPHY_DIR } from "../src/headless.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));
const REPO_ROOT = path.resolve(here("../../.."));
const archive = describeArchive();

const TOPOLOGY: ArtifactRef = { source: "graph-asset", label: "topology", path: `${ASSET_DIR}/graph-topology.bin` };
const GEOMETRY: ArtifactRef = { source: "graph-asset", label: "geometry", path: `${ASSET_DIR}/graph-geometry.bin` };
const ARCHIVE_REF: ArtifactRef = {
  source: "archive",
  label: "docs/runs (three-arm, phase-e, scenario-e, scenario-e-v2)",
  path: targetDir(WP9_REPLAY_TARGETS[0]!, archive.root),
};
const CLOSURES: ArtifactRef = {
  source: "geography",
  label: "data/closures/closures_E_r1_worst.csv",
  path: `${GEOGRAPHY_DIR}/data/closures/closures_E_r1_worst.csv`,
};

const gate = artifactGate({
  gate: "validation:wp9-replay-acceptance",
  suite: "WP9 acceptance — Tier-3 gates green and Tier-4 fully attributed on the working-set replays",
  evidence:
    `the port replaying all ${WP9_REPLAY_TARGETS.length} working-set configurations from their ` +
    "archived EXECUTED manifests, scored by the ported verify_E_runs / verify_2026_runs / " +
    "analyze_run gates and by the committed golden-summary digests, plus the exact per-cell " +
    "bit-match census against the Java bytes with every divergence attributed to the declared " +
    "within-tick-order channel",
  artifacts: [TOPOLOGY, GEOMETRY, ARCHIVE_REF, CLOSURES],
});

// ---------------------------------------------------------------------------

const PREPARE_TIMEOUT_MS = 3_600_000;
const CASE_TIMEOUT_MS = 120_000;

const ORDER_CENSUS_RUN = "present-day-three-arm/A-seed42";
const ARM_A = ORDER_CENSUS_RUN;

/**
 * `ContextCreator`'s four scenario/feature switches. Every batch file states
 * them, because they are what selects a scenario; their archived values are
 * therefore not evidence about the fallback table one way or the other.
 */
const STUDY_SWITCHES: ReadonlySet<string> = new Set([
  "scenarioCode",
  "enableHeterogeneity",
  "respectShelterOpeningDates",
  "triageReserveFraction",
]);

interface Scored {
  readonly run: ReplayedRun;
  readonly results: readonly CheckResult[];
  readonly tier4: Tier4Attribution;
}

const scored = new Map<string, Scored>();
let crossArm: readonly CheckResult[] = [];
let treeDirty: boolean | "unknown" = "unknown";

function resultFor(runDir: string): Scored {
  const hit = scored.get(runDir);
  if (hit === undefined) throw new Error(`${runDir} was not replayed`);
  return hit;
}

/** `(a)`–`(l)` only: the certified script's own checks, excluding this file's additions. */
function verifyEChecks(results: readonly CheckResult[]): readonly CheckResult[] {
  return results.filter((c) => /^\([a-l]\)/u.test(c.name));
}

beforeAll(async () => {
  if (gate.action !== "run") return;

  const schedules = geographyScheduleSource(GEOGRAPHY_DIR);
  const golden = loadGoldenSummaries();
  const sourceIntegrity = portSourceIntegrity({ repoRoot: REPO_ROOT, geographyDir: GEOGRAPHY_DIR });
  treeDirty = sourceIntegrity.gitWorkingTreeDirty;

  const assetsManifest = `${ASSET_DIR}/assets-manifest.json`;
  const runs = new Map<string, ReplayedRun>();
  for (const t of WP9_REPLAY_TARGETS) {
    runs.set(
      t.runDir,
      await replayTarget(t, {
        archiveRoot: archive.root,
        sourceIntegrity,
        inputDatasets: assetInputDatasets(buildTargetConfig(t, archive.root).config, assetsManifest),
      }),
    );
  }

  const envelope = JSON.parse(
    readFileSync(here("../order-census/order-permutation-census.json"), "utf8"),
  ) as PermutationEnvelope;

  for (const t of WP9_REPLAY_TARGETS) {
    const run = runs.get(t.runDir) as ReplayedRun;
    const ck = new Checks();
    const reference = t.r3Reference === undefined ? undefined : runs.get(t.r3Reference);
    scoreTier3(ck, run, { schedules, golden, ...(reference === undefined ? {} : { reference }) });
    scored.set(t.runDir, {
      run,
      results: ck.results,
      tier4: attributeDivergence({
        runDir: t.runDir,
        portAgents: run.view.agents,
        portShelters: run.view.shelters,
        archiveAgents: run.archivedView.agents,
        archiveShelters: run.archivedView.shelters,
        envelope: { census: envelope, sampledAt: ORDER_CENSUS_RUN },
      }),
    });
  }

  const ck = new Checks();
  scoreTier3CrossArm(
    ck,
    WP9_REPLAY_TARGETS.filter((t) => t.cls === "pre-e").map((t) => runs.get(t.runDir) as ReplayedRun),
  );
  crossArm = ck.results;
}, PREPARE_TIMEOUT_MS);

// ---------------------------------------------------------------------------

describeGated(gate, () => {
  it("the replay set is the working set plus plan §8's seed-44 column, and nothing was dropped", () => {
    // A run silently leaving the replay set is a coverage loss nothing else
    // would notice: every per-config case below is generated FROM this list.
    for (const entry of WORKING_SET) {
      const target = WP9_REPLAY_TARGETS.find((t) => t.runDir === entry.runDir);
      expect(target, `${entry.runDir} is in WORKING_SET but not in the replay set`).toBeDefined();
      expect(target?.inWorkingSet).toBe(true);
    }
    expect(WP9_REPLAY_TARGETS.length).toBe(WORKING_SET.length + 3);
    expect(WP9_REPLAY_TARGETS.filter((t) => !t.inWorkingSet).map((t) => t.runDir)).toEqual([
      "present-day-three-arm/A-seed44",
      "present-day-three-arm/B-seed44",
      "present-day-three-arm/C-seed44",
    ]);
    const byClass = new Map<string, number>();
    for (const t of WP9_REPLAY_TARGETS) byClass.set(t.cls, (byClass.get(t.cls) ?? 0) + 1);
    expect(Object.fromEntries([...byClass].sort())).toEqual({ "pre-e": 9, er: 1, null: 3, se: 4 });
    expect(scored.size).toBe(WP9_REPLAY_TARGETS.length);
  });

  it("every configuration came from its ARCHIVED EXECUTED manifest, and says what was filled", () => {
    // 11 / 33 / 40 / 41 are the logger generations. A replay that silently fell
    // back to a shipped preset would not change a verdict — it would change
    // these counts, which is why they are the assertion.
    const expected: Readonly<Record<string, number>> = {
      "present-day-three-arm": 11,
      "phase-e": 33,
      "scenario-e": 40,
      "scenario-e-v2": 41,
    };
    for (const t of WP9_REPLAY_TARGETS) {
      const { built } = resultFor(t.runDir).run;
      expect(built.fromManifest.length, t.runDir).toBe(expected[t.archive]);
      expect(
        built.fromManifest.length + Object.keys(built.fromFallback).length,
        `${t.runDir}: every one of the 41 names must be accounted for`,
      ).toBe(41);
      for (const [name, value] of Object.entries(built.fromFallback)) {
        expect(value, `${t.runDir} ${name}`).toBe(JAVA_CODE_DEFAULTS[name]);
      }
      // The arm comes from the executed scenarioCode via SCENARIO_CHAIN, so a
      // run filed under the wrong name is a mismatch rather than a silent
      // mis-scoring.
      expect(t.runDir, `${t.runDir} resolved arm ${built.arm}`).toMatch(
        new RegExp(`(^present-day-three-arm/${built.arm}-|E0null-${built.arm}-|ER-${built.arm}-|SE)`, "u"),
      );
    }
  });

  it("JAVA_CODE_DEFAULTS agrees with the archived manifests that state those values explicitly", () => {
    // The fallback table is a transcription of ContextCreator.build(), and a
    // transcription is exactly what drifts. The E0-null manifests carry 29 of
    // its 34 names EXPLICITLY, written by the Java logger, and every one of
    // them must equal the table — an oracle this port did not produce. The one
    // name that legitimately differs is the switch the null exists to turn on.
    let compared = 0;
    for (const arm of ["A", "B", "C"]) {
      const dir = targetDir(
        WP9_REPLAY_TARGETS.find((t) => t.runDir === `scenario-e/E0null-${arm}-seed42`)!,
        archive.root,
      );
      const params = (
        JSON.parse(readFileSync(path.join(dir, "simulation.json"), "utf8")) as {
          reproducibility: { parameters: Record<string, number> };
        }
      ).reproducibility.parameters;
      for (const [name, fallback] of Object.entries(JAVA_CODE_DEFAULTS)) {
        if (!(name in params)) continue;
        // The four study switches are set explicitly by every batch file — they
        // are what a scenario IS — so their archived values say nothing about
        // the fallback table. The V29-V51 blocks are the ones the E0 null
        // leaves alone, and they are the whole point of this check.
        if (STUDY_SWITCHES.has(name)) continue;
        if (name === "enableDecisionLayer") {
          expect(params[name], `E0null-${arm} must have the layer ON`).toBe(1);
          continue;
        }
        compared += 1;
        expect(params[name], `E0null-${arm}-seed42 ${name}`).toBe(fallback);
      }
    }
    expect(compared).toBe(3 * 28);
  });

  // --- Tier 3 --------------------------------------------------------------

  for (const t of WP9_REPLAY_TARGETS) {
    it(
      `Tier 3 green on ${t.runDir}`,
      () => {
        const { results } = resultFor(t.runDir);
        const failures = results.filter((c) => c.status === "FAIL");
        const provenance = failures.filter((c) => isProvenanceCheck(c.name));
        const model = failures.filter((c) => !isProvenanceCheck(c.name));
        expect(
          model.map((c) => `${c.name}: ${c.detail}`),
          `${t.runDir}\n  ${model.map((c) => `${c.name}: ${c.detail}`).join("\n  ")}`,
        ).toEqual([]);
        // Two-directional: on a clean tree the provenance sub-check must PASS.
        // It is never skipped and never excused, only required to tell the truth.
        //
        // Gate (h) belongs to `verify_E_runs.py`, so it runs on the E classes
        // only; the three-arm family is graded by `verify_2026_runs.py`, whose
        // own provenance check is asserted with the cross-arm set below. Both
        // spellings are covered by `isProvenanceCheck`.
        const wantProvenance = t.cls !== "pre-e" && treeDirty === true ? 1 : 0;
        expect(provenance.length, `${t.runDir} provenance sub-check vs measured tree state`).toBe(
          wantProvenance,
        );
        // Not vacuous: the gates really ran on this configuration.
        expect(results.length).toBeGreaterThan(20);
      },
      CASE_TIMEOUT_MS,
    );
  }

  it("each E-class configuration registers exactly the §3.7 check census", () => {
    // The instrument that detects a gate quietly ceasing to register a check.
    const seen: Record<string, number> = {};
    for (const t of WP9_REPLAY_TARGETS) {
      if (t.cls === "pre-e") continue;
      const { run, results } = resultFor(t.runDir);
      const closuresCode = intParam(run.view.params, "closuresCode", 0);
      const arm = t.cls === "null" ? "null" : t.cls;
      // A null's transcript is gate (a)'s twelve checks plus the eleven the
      // Python's `check_run(..., e_arm=False)` half registers.
      const want = t.cls === "null" ? 12 + 11 : expectedCheckCount(arm, closuresCode);
      const got = verifyEChecks(results).length;
      expect(got, `${t.runDir} (${arm}, closuresCode ${closuresCode})`).toBe(want);
      seen[t.runDir] = got;
    }
    expect(Object.values(seen).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it("gate (a) ran on all three E0 nulls, against their replayed pre-E references", () => {
    for (const arm of ["A", "B", "C"]) {
      const runDir = `scenario-e/E0null-${arm}-seed42`;
      const a = resultFor(runDir).results.filter((c) => c.name.startsWith("(a) "));
      expect(a.length, runDir).toBe(12);
      expect(a.filter((c) => c.status !== "PASS"), runDir).toEqual([]);
      expect(
        a.some((c) => c.name.includes("shared-projection byte-identity")),
        `${runDir}: the identity check itself must be present`,
      ).toBe(true);
    }
  });

  it("verify_2026's cross-arm identities hold over the nine replayed three-arm runs", () => {
    const failures = crossArm.filter((c) => c.status === "FAIL");
    const model = failures.filter((c) => !isProvenanceCheck(c.name));
    expect(model.map((c) => `${c.name}: ${c.detail}`)).toEqual([]);
    // Same two-directional rule as the per-run suite: on a clean tree there is
    // one provenance check per run and every one of them must PASS.
    expect(failures.length - model.length).toBe(treeDirty === true ? 9 : 0);
    expect(crossArm.length).toBeGreaterThan(0);
    // Not vacuous: the two identities the gate exists for really registered.
    expect(crossArm.some((c) => c.name.includes("population"))).toBe(true);
    expect(crossArm.some((c) => c.name.toLowerCase().includes("unreachable"))).toBe(true);
  });

  // --- Tier 4 --------------------------------------------------------------

  it("publishes the exact bit-match census for every archived configuration", () => {
    const lines: string[] = [];
    for (const t of WP9_REPLAY_TARGETS) {
      const a = resultFor(t.runDir).tier4;
      lines.push(
        `${t.runDir.padEnd(38)} ${a.verdict.padEnd(14)} ` +
          `capacity_binds=${String(a.saturation.capacityBinds).padEnd(5)} ` +
          `saturated=${String(a.saturation.saturatedSites).padStart(2)}/${a.saturation.sites} ` +
          `cap-refusals=${String(a.saturation.capacityRefusals).padStart(5)}  ${censusLine(a.agents)}`,
      );
      // The census must be defined on the whole archived population — a census
      // over a join that lost rows would flatter every percentage in it.
      expect(a.agents.rows, t.runDir).toBe(6842);
      expect(a.agents.keysPortOnly, t.runDir).toEqual([]);
      expect(a.agents.keysArchiveOnly, t.runDir).toEqual([]);
      expect(a.agents.comparedColumns.length, t.runDir).toBeGreaterThanOrEqual(45);
    }
    console.log(`\n[wp9 tier-4 census]\n${lines.join("\n")}\n`);
  });

  for (const t of WP9_REPLAY_TARGETS) {
    it(`Tier 4 attributed on ${t.runDir}`, () => {
      const a = resultFor(t.runDir).tier4;
      expect(
        a.unexplained,
        `${t.runDir} carries divergence outside the declared within-tick-order channel:\n  ` +
          a.unexplained.join("\n  "),
      ).toEqual([]);
      expect(a.verdict).not.toBe("UNEXPLAINED");
    });
  }

  it("zero UNEXPLAINED divergences across the whole replay set", () => {
    const all = WP9_REPLAY_TARGETS.map((t) => resultFor(t.runDir).tier4);
    const bad = all.filter((a) => a.verdict === "UNEXPLAINED");
    expect(bad.map((a) => `${a.runDir}: ${a.unexplained.join("; ")}`)).toEqual([]);
    console.log(
      `[wp9 tier-4] ${all.filter((a) => a.verdict === "EXACT").length} EXACT, ` +
        `${all.filter((a) => a.verdict === "ORDER-CHANNEL").length} ORDER-CHANNEL, 0 UNEXPLAINED`,
    );
  });

  it("an EXACT verdict is reported together with the regime that made it possible", () => {
    // The caution, mechanised. Every configuration that reproduces per-agent
    // rows exactly must ALSO record whether capacity bound — otherwise "the
    // port matches Java exactly" generalises past where it was measured.
    for (const t of WP9_REPLAY_TARGETS) {
      const a = resultFor(t.runDir).tier4;
      if (a.verdict !== "EXACT") continue;
      expect(typeof a.saturation.capacityBinds, t.runDir).toBe("boolean");
      expect(a.saturation.sites, t.runDir).toBeGreaterThan(0);
      expect(a.saturation.designedBeds, t.runDir).toBeGreaterThan(0);
    }
  });

  // --- the census must be able to fail, on these very frames ---------------

  it("goes red when ONE cell of the real arm-A comparison is perturbed", () => {
    const { run } = resultFor(ARM_A);
    const before = resultFor(ARM_A).tier4;
    expect(before.unexplained).toEqual([]);

    // Move one resident's walked distance by a metre. This is the shape of a
    // movement-arithmetic defect, and it is the defect class this project has
    // measured going undetected: a 10 % error in the step length left every
    // aggregate gate green.
    const lines = run.docs.agentsCsv.split("\r\n");
    const header = (lines[0] as string).split(",");
    const distAt = header.indexOf("total_travel_distance_m");
    const stateAt = header.indexOf("final_state");
    const doorAt = header.indexOf("door_refusals");
    const idAt = header.indexOf("agent_id");
    expect(distAt).toBeGreaterThan(0);
    expect(doorAt).toBeGreaterThan(0);

    // The target has to be a resident NO door refused in EITHER run. Those are
    // the rows the declared channel provably cannot reach, so they are the rows
    // on which a movement defect has nowhere to hide. Aiming at a door-contested
    // resident instead does NOT go red — correctly, because the order really did
    // change which door was full when they knocked — and the first version of
    // this case made exactly that mistake and let a perturbation through.
    const archiveIds = run.archivedView.agents.column("agent_id");
    const archiveDoors = run.archivedView.agents.column("door_refusals");
    const javaDoors = new Map(archiveIds.map((id, i) => [id, archiveDoors[i]] as const));
    let touched = 0;
    let touchedId = "";
    const perturbed = lines.map((line, i) => {
      if (i === 0 || line.length === 0 || touched > 0) return line;
      const cells = line.split(",");
      if (cells[stateAt] !== "SHELTERED") return line;
      if (cells[doorAt] !== "0" || javaDoors.get(cells[idAt] as string) !== "0") return line;
      cells[distAt] = (Number(cells[distAt]) + 1).toFixed(4);
      touched += 1;
      touchedId = cells[idAt] as string;
      return cells.join(",");
    });
    expect(touched, "no never-refused sheltered resident to perturb").toBe(1);
    expect(touchedId).not.toBe("");

    const after = attributeDivergence({
      runDir: ARM_A,
      portAgents: readFrame(perturbed.join("\r\n"), "perturbed/agents.csv"),
      portShelters: run.view.shelters,
      archiveAgents: run.archivedView.agents,
      archiveShelters: run.archivedView.shelters,
    });
    expect(after.verdict).toBe("UNEXPLAINED");
    expect(after.partition.neverRefusedDivergent).toBe(1);
    expect(after.unexplained.join("\n")).toMatch(/refused at NO door in EITHER run/u);
    expect(after.unexplained.join("\n")).toMatch(/total_travel_distance_m×1/u);
  }, CASE_TIMEOUT_MS);

  it("does NOT go red when a door-contested resident's journey differs", () => {
    // The complement, and the reason the release rule is keyed on door
    // refusals rather than on "same terminal state at the same shelter": at
    // arm A, 152 residents reach the same terminal state at the same shelter
    // and still differ in bytes, every one of them refused somewhere. A rule
    // that flagged those would report 30-190 release-blocking findings per
    // configuration and the census would be unusable.
    const a = resultFor(ARM_A).tier4;
    expect(a.partition.sameAssignmentDivergent).toBeGreaterThan(0);
    expect(a.partition.neverRefusedDivergent).toBe(0);
    expect(a.partition.neverRefused).toBeGreaterThan(0);
    expect(a.verdict).toBe("ORDER-CHANNEL");
    console.log(
      `[wp9 tier-4 partition] ${ARM_A}: ${a.partition.neverRefused} never-refused ` +
        `(${a.partition.neverRefusedDivergent} divergent), ${a.partition.doorContested} ` +
        `door-contested (${a.partition.doorContestedDivergent} divergent); ` +
        `same-assignment-divergent ${a.partition.sameAssignmentDivergent} — all door-contested`,
    );
  });

  it("goes red when the archive operand is swapped for a different seed's bytes", () => {
    // The other way a comparison stops meaning anything: comparing the right
    // port run against the wrong archive run. Everything downstream still
    // "works", so only a real difference in the bytes catches it.
    const { run } = resultFor(ARM_A);
    const other = loadRunDir(
      targetDir(WP9_REPLAY_TARGETS.find((t) => t.runDir === "present-day-three-arm/A-seed43")!, archive.root),
      "JAVA A-seed43",
    );
    const a = attributeDivergence({
      runDir: ARM_A,
      portAgents: run.view.agents,
      portShelters: run.view.shelters,
      archiveAgents: other.agents,
      archiveShelters: other.shelters,
    });
    expect(a.verdict).toBe("UNEXPLAINED");
    expect(a.agents.identicalCells).toBeLessThan(a.agents.comparedCells);
  }, CASE_TIMEOUT_MS);

  // --- the shipped artifact ------------------------------------------------

  it("emits a VALIDATION_REPORT.json that passes its own schema", () => {
    const report = buildValidationReport({
      generatedUtc: new Date().toISOString(),
      producedBy: "validation/test/wp9-replay-acceptance.test.ts",
      build: {
        portCommit: "test",
        gitWorkingTreeDirty: gitWorkingTreeDirty(REPO_ROOT),
        node: process.version,
      },
      archive: { present: archive.present, source: archive.source },
      assetsManifestPath: `${ASSET_DIR}/assets-manifest.json`,
      goldenSummariesDir: here("../golden-summaries"),
      workingSetManifestPath: here("../working-set/working-set.manifest.json"),
      workingSetPayloadDir: here("../working-set/data"),
      tier2: { status: "green", note: "gate (a) over the three E0 nulls, counted in their Tier-3 census" },
      tier3: WP9_REPLAY_TARGETS.map((t) => ({ run: resultFor(t.runDir).run, results: resultFor(t.runDir).results })),
      crossArm: {
        members: WP9_REPLAY_TARGETS.filter((t) => t.cls === "pre-e").map((t) => t.runDir),
        results: crossArm,
      },
      tier4: WP9_REPLAY_TARGETS.map((t) => resultFor(t.runDir).tier4),
    });

    expect(validateValidationReport(report)).toEqual([]);
    expect(report.tiers.tier3.configs.length).toBe(WP9_REPLAY_TARGETS.length);
    expect(report.tiers.tier4.configs.length).toBe(WP9_REPLAY_TARGETS.length);
    expect(report.tiers.tier4.unexplained).toBe(0);
    expect(report.tiers.tier4.status).toBe("green");
    expect(report.tiers.tier3.status).toBe("green");
    // The asset SHAs the badge compares against are really in there.
    expect(report.assets.manifest_sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(report.assets.entries.length).toBeGreaterThan(0);
    expect(report.golden_summaries.length).toBe(7);
    expect(report.working_set.runs).toBe(WORKING_SET.length);
    // Conservative on purpose: a build from an uncommitted tree earns no
    // badge, because nobody can re-derive its numbers from the recorded commit.
    expect(report.archive_validated.length).toBe(
      gitWorkingTreeDirty(REPO_ROOT) === false ? WP9_REPLAY_TARGETS.length : 0,
    );
  }, CASE_TIMEOUT_MS);
});
