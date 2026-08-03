/**
 * wp9-archive-gates.test.ts — gates (a)–(l) over the certified Java archive.
 *
 * This is half of the WP9 evidence and it is deliberately the half that runs
 * first: **prove the gates green on data the port did not produce.** All 60
 * Phase-E / Scenario-E run directories under `docs/runs/` — 12 `phase-e/`,
 * 21 `scenario-e/`, 27 `scenario-e-v2/` — go through the full
 * `verify_E_runs.py` invocation, the WP8 subset plus the WP9 additions
 * (b)(c)(d)(e)(j), in the source's own order.
 *
 * Those runs came from the certified Java instrument at commits `7224cef`,
 * `bb8707d`, `495d845` and `257017d`, and were verified by
 * `scripts/verify_E_runs.py` before this port existed. If a TS gate disagrees
 * with them, the TS gate is wrong.
 *
 * ## The census is the assertion
 *
 * `WP8-SPEC-archive-gates.md` §3.7 records the per-run check counts the
 * certified Python produced on 2026-07-31: **11** for `--er`, **19 / 24 / 25**
 * for `--se` at `closuresCode` 0 / 1 / 3, and 11 for a null's per-run half. The
 * archive's own totals follow — v1 matrix `9×24 + 9×19 = 387`, v2 matrix
 * `15×25 + 9×19 = 546`, grand total **933**; the ER matrix `9×11 = 99`.
 *
 * The suite asserts every one of those numbers, per run and in aggregate. That
 * is the instrument that detects the failure this project keeps re-learning: a
 * gate that silently stops registering a check leaves the *verdict* green and
 * the *count* wrong, and only the count notices.
 *
 * The second half — every gate proven able to go red — is
 * `wp9-gate-corrosion.test.ts` (synthetic, runs in a clean clone) and the
 * corrosion cases at the bottom of this file (real archived bytes).
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, it } from "vitest";

import { describeArchive, discoverRuns, REPO_ROOT } from "@websim/pipeline/archive";

import { artifactGate, describeGated, type ArtifactRef } from "../../../tools/artifact-gate.js";
import {
  Checks,
  geographyScheduleSource,
  intParam,
  loadRunDir,
  runFromDocuments,
  type RunView,
} from "../../src/harness/index.js";
import {
  ASTHMA_CONTROL_COLUMNS,
  SEVERE_SERIES,
  SEVERE_SERIES_HOURS,
  checkAsthmaControl,
  checkBedSum,
  checkSeSmoke,
  checkStates,
  checkUnawareImmobility,
  expectedCheckCount,
  runVerifyEChecks,
  runVerifyENull,
  type RunArm,
} from "../../src/gates/index.js";

const archive = describeArchive();
const GEOGRAPHY_DIR = path.join(REPO_ROOT, "Geography");
const schedules = geographyScheduleSource(GEOGRAPHY_DIR);

const E_FAMILIES: readonly string[] = ["phase-e", "scenario-e", "scenario-e-v2"];

const ARCHIVE_REF: ArtifactRef = {
  source: "archive",
  label: "docs/runs (phase-e, scenario-e, scenario-e-v2)",
  path: path.join(archive.root, "scenario-e-v2"),
};
const CLOSURES_REF: ArtifactRef = {
  source: "geography",
  label: "data/closures",
  path: path.join(GEOGRAPHY_DIR, "data", "closures", "closures_E_r1_worst.csv"),
};

const gate = artifactGate({
  gate: "validation:wp9-archive-gates",
  suite: "WP9 gates (a)-(l) — the full verify_E_runs invocation over the certified Java archive",
  evidence:
    "the completed gate suite — (b) bed sum, (c) asthma negative control, (d) terminal-state " +
    "conservation, (e) UNAWARE immobility and (j) severe-series provenance, on top of the WP8 " +
    "subset — runs over all 60 archived Phase-E / Scenario-E runs and reproduces the check " +
    "census WP8-SPEC-archive-gates.md §3.7 recorded from the certified verify_E_runs.py " +
    "(11/19/24/25 per run; 933 over the two SE matrices; 99 over the ER matrix), plus per-gate " +
    "corrosion on real archived bytes",
  artifacts: [ARCHIVE_REF, CLOSURES_REF],
});

// ---------------------------------------------------------------------------

interface ArchivedCase {
  readonly runDir: string;
  readonly dir: string;
  readonly arm: RunArm;
  readonly presetFamily: string;
  readonly family: string;
}

function armOf(presetFamily: string): RunArm {
  if (presetFamily === "E0") return "null";
  if (presetFamily === "ER") return "er";
  return "se";
}

function archivedCases(): readonly ArchivedCase[] {
  return discoverRuns(archive.root)
    .filter((r) => E_FAMILIES.includes(r.family))
    .map((r) => ({
      runDir: r.runDir,
      dir: path.join(archive.root, ...r.runDir.split("/")),
      arm: armOf(r.presetFamily),
      presetFamily: r.presetFamily,
      family: r.family,
    }));
}

let loaded: readonly { readonly info: ArchivedCase; readonly run: RunView }[] | null = null;
function runs(): readonly { readonly info: ArchivedCase; readonly run: RunView }[] {
  loaded ??= archivedCases().map((info) => ({
    info,
    run: loadRunDir(info.dir, path.basename(info.dir)),
  }));
  return loaded;
}

function docs(runDir: string): { agentsCsv: string; sheltersCsv: string; simulationJson: string } {
  const dir = path.join(archive.root, ...runDir.split("/"));
  return {
    agentsCsv: readFileSync(path.join(dir, "agents.csv"), "utf8"),
    sheltersCsv: readFileSync(path.join(dir, "shelters.csv"), "utf8"),
    simulationJson: readFileSync(path.join(dir, "simulation.json"), "utf8"),
  };
}

/** Apply one textual edit to one archived document and rebuild the run. */
function corrode(
  runDir: string,
  edit: (d: { agentsCsv: string; sheltersCsv: string; simulationJson: string }) => void,
): RunView {
  const d = docs(runDir);
  const before = { ...d };
  edit(d);
  if (
    d.agentsCsv === before.agentsCsv &&
    d.sheltersCsv === before.sheltersCsv &&
    d.simulationJson === before.simulationJson
  ) {
    throw new Error(`corrode(${runDir}): the edit changed nothing, so the case proves nothing`);
  }
  return runFromDocuments({ name: `CORRODED ${path.basename(runDir)}`, ...d });
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

const ER_RUN = "phase-e/ER-A-n6842-seed42";
const SE2_RUN = "scenario-e-v2/SE2-E18-d1-seed42";

function gradeArchived(runDir: string, arm: RunArm): Checks {
  const ck = new Checks();
  const dir = path.join(archive.root, ...runDir.split("/"));
  runVerifyEChecks(ck, loadRunDir(dir, path.basename(dir)), { arm, schedules });
  return ck;
}

function gradeCorroded(
  runDir: string,
  arm: RunArm,
  edit: (d: { agentsCsv: string; sheltersCsv: string; simulationJson: string }) => void,
): Checks {
  const ck = new Checks();
  runVerifyEChecks(ck, corrode(runDir, edit), { arm, schedules });
  return ck;
}

// ---------------------------------------------------------------------------

describeGated(gate, () => {
  it("finds the 60 archived Phase-E / Scenario-E runs", () => {
    const cases = archivedCases();
    expect(cases.length).toBe(60);
    const byFamily = new Map<string, number>();
    for (const c of cases) {
      byFamily.set(c.presetFamily, (byFamily.get(c.presetFamily) ?? 0) + 1);
    }
    expect(Object.fromEntries([...byFamily].sort())).toEqual({
      E0: 9,
      ER: 9,
      SE: 9,
      SE2: 15,
      SE2nc: 9,
      SEnc: 9,
    });
  }, 60_000);

  it("passes gates (b)-(l) on every archived run, with the §3.7 check census", () => {
    const ck = new Checks();
    let expectedTotal = 0;
    const perClass = new Map<string, number>();
    for (const { info, run } of runs()) {
      const before = ck.results.length;
      runVerifyEChecks(ck, run, { arm: info.arm, schedules });
      const registered = ck.results.length - before;
      const want = expectedCheckCount(info.arm, intParam(run.params, "closuresCode", 0));
      expect(registered, `${info.runDir} registered ${registered} checks, want ${want}`).toBe(want);
      expectedTotal += want;
      perClass.set(info.presetFamily, (perClass.get(info.presetFamily) ?? 0) + registered);
    }

    // eslint-disable-next-line no-console -- the census IS the evidence.
    console.log(
      `[wp9-gates] ${runs().length} archived runs -> ${ck.summary()}; per family ` +
        JSON.stringify(Object.fromEntries([...perClass].sort())),
    );

    expect(ck.failureReport()).toBe("");
    expect(ck.results.length).toBe(expectedTotal);

    // §3.7's numbers, restated as the archive's own totals.
    const per = Object.fromEntries(perClass);
    expect(per["ER"]).toBe(9 * 11); // "99/99 invariants"
    expect(per["E0"]).toBe(9 * 11); // the per-run half of a --null invocation
    expect((per["SE"] ?? 0) + (per["SEnc"] ?? 0)).toBe(387); // 9x24 + 9x19
    expect((per["SE2"] ?? 0) + (per["SE2nc"] ?? 0)).toBe(546); // 15x25 + 9x19
    expect((per["SE"] ?? 0) + (per["SEnc"] ?? 0) + (per["SE2"] ?? 0) + (per["SE2nc"] ?? 0)).toBe(933);
    expect(expectedTotal).toBe(1131);
  }, 900_000);

  it("records exactly the by-design skips, and no others", () => {
    const ck = new Checks();
    for (const { info, run } of runs()) {
      runVerifyEChecks(ck, run, { arm: info.arm, schedules });
    }
    const bySkip = new Map<string, number>();
    for (const s of ck.skipped) {
      bySkip.set(s.detail, (bySkip.get(s.detail) ?? 0) + 1);
    }
    // (f) on the 9 E0 nulls; (e) wherever a run has no UNAWARE residents;
    // (j) on the observed-series runs, which are not --se and never reach it.
    expect(bySkip.get("not an E arm (--er); the null has zero barrier cost by design")).toBe(9);
    expect(bySkip.get("no UNAWARE residents in this run")).toBe(9);
    // Every archived SE run carries a severe series, so (j) never skips.
    expect([...bySkip.keys()].filter((k) => k.includes("observed series"))).toEqual([]);
    expect(ck.skipped.length).toBe(18);
  }, 900_000);

  // --- per-gate facts the archive establishes -------------------------------

  it("(b) the four-way bed sum agrees on all 60 runs, and is never vacuous", () => {
    for (const { info, run } of runs()) {
      const ck = new Checks();
      const totals = checkBedSum(ck, run);
      expect(ck.failureReport(), info.runDir).toBe("");
      // A four-way identity that is 0 == 0 == 0 == 0 would pass while proving
      // nothing. Every archived run shelters somebody.
      expect(totals.occupancy, info.runDir).toBeGreaterThan(0);
      expect(totals.reachedShelterYes).toBe(totals.finalStateSheltered);
    }
  }, 900_000);

  it("(c) the asthma stratum is populated and two-valued in every archived run", () => {
    for (const { info, run } of runs()) {
      for (const col of ASTHMA_CONTROL_COLUMNS) {
        expect(run.agents.has(col), `${info.runDir}/${col}`).toBe(true);
      }
      const ck = new Checks();
      const stratum = checkAsthmaControl(ck, run);
      expect(ck.failureReport(), info.runDir).toBe("");
      expect(stratum, info.runDir).not.toBeNull();
      // The gate's own "empty or single-valued" failure mode is the one that
      // would make it vacuous, so the archive is asserted past it explicitly.
      expect(stratum?.n ?? 0, info.runDir).toBeGreaterThan(1000);
      expect(stratum?.nAsthma1 ?? 0, info.runDir).toBeGreaterThan(100);
      expect(stratum?.nAsthma0 ?? 0, info.runDir).toBeGreaterThan(100);
    }
  }, 900_000);

  it("(d) the archive's final_state vocabulary is closed, and the census reconciles", () => {
    const seen = new Set<string>();
    for (const { info, run } of runs()) {
      const ck = new Checks();
      const census = checkStates(ck, run);
      expect(ck.failureReport(), info.runDir).toBe("");
      expect(census.unknownStates, info.runDir).toEqual([]);
      for (const s of census.counts.keys()) seen.add(s);
      expect(census.rows).toBe(6842);
    }
    // The archive exercises ALL SIX vocabulary members, EN_ROUTE included —
    // measured, not assumed. A gate whose vocabulary was wider than the data
    // could not distinguish a closed vocabulary from an unused one.
    expect([...seen].sort()).toEqual([
      "EN_ROUTE",
      "PRE_EVAC",
      "REFUSED_ALL_FULL",
      "SHELTERED",
      "UNAWARE",
      "UNREACHABLE",
    ]);
  }, 900_000);

  it("(e) UNAWARE residents exist in the archive and none of them moved", () => {
    let withUnaware = 0;
    let totalUnaware = 0;
    for (const { info, run } of runs()) {
      const ck = new Checks();
      const census = checkUnawareImmobility(ck, run);
      expect(ck.failureReport(), info.runDir).toBe("");
      if (census !== null) {
        withUnaware += 1;
        totalUnaware += census.nUnaware;
        expect(census.moved, info.runDir).toEqual([]);
        expect(census.started, info.runDir).toEqual([]);
      }
    }
    // 51 of the 60 runs have UNAWARE residents; the 9 E0 nulls have none by
    // construction (pAwareInit == 1). A gate that only ever SKIPped would be
    // worthless, so the population it graded is asserted, not assumed.
    expect(withUnaware).toBe(51);
    expect(totalUnaware).toBeGreaterThan(10_000);
  }, 900_000);

  it("(j) the archive's severe series are 456 h and scale exactly, on both codes", () => {
    const codes = new Map<number, number>();
    for (const { info, run } of runs()) {
      if (info.arm !== "se") continue;
      const ck = new Checks();
      checkSeSmoke(ck, run);
      expect(ck.failureReport(), info.runDir).toBe("");
      expect(ck.skipped.length, `${info.runDir} skipped (j)`).toBe(0);
      const code = intParam(run.params, "smokeSeriesCode", 0);
      codes.set(code, (codes.get(code) ?? 0) + 1);
      const smoke = run.manifest["smoke_field"] as Record<string, unknown>;
      // The 456-vs-455 incident, stated as data: the field is 456 slices long,
      // so the last valid lookup hour is 455 and the run must stay inside it.
      expect(smoke["hours"], info.runDir).toBe(SEVERE_SERIES_HOURS);
      expect(smoke["out_of_range_lookups"], info.runDir).toBe(0);
    }
    // 18 v1 runs on series 1, 24 v2 runs on series 2.
    expect(Object.fromEntries([...codes].sort())).toEqual({ 1: 18, 2: 24 });
    expect([...SEVERE_SERIES.keys()].sort()).toEqual([1, 2]);
  }, 900_000);

  it("reads every WP9-consumed column without a single lossy coercion", () => {
    const columns = [
      "asthma_flag",
      "copd_flag",
      "mobility_limited",
      "walking_speed_mps",
      "inhaled_dose_ug",
      "total_travel_distance_m",
      "final_occupancy",
    ];
    let checked = 0;
    for (const { info, run } of runs()) {
      for (const col of columns) {
        const frame = col === "final_occupancy" ? run.shelters : run.agents;
        if (!frame.has(col)) continue;
        checked += 1;
        expect(frame.coercionLosses(col), `${info.runDir}/${col}`).toBe(0);
      }
    }
    expect(checked).toBeGreaterThan(400);
  }, 900_000);

  // --- the --null / --reference arm -----------------------------------------

  it("reproduces all nine archived R3 null->reference invocations, 23 checks each", () => {
    // `WP8-SPEC-archive-gates.md` §2.5, re-verified 2026-07-31: eight archived
    // pairs (nine including the third v2 arm), all byte-identical, at
    // 20 P / 0 F / 3 S for the `phase-e/` nulls and 21 / 0 / 2 for the two SE
    // families — the difference being the Scenario-E counter sub-check, which
    // the older logger generation has no columns for.
    //
    // Gate (a) itself is WP8's; what is new here is the WHOLE invocation —
    // `main()`'s `--null X --reference Y` path, which is (a)x12 followed by the
    // per-run gates with `e_arm=False`. That composition had never run.
    const digests: Readonly<Record<string, readonly [string, string]>> = {
      A: [
        "7d1e668cae3afd950602afc9a572a67a23d54941862490a7d38e2ed202df9815",
        "32451215888c63cd2ceeedaffb8c42349655a0eb211aafa5be66e0577ede62b4",
      ],
      B: [
        "188beabf9b22fc6c854f201a7a8489d96eb6f9c62b3a22821617c322654aa425",
        "041d36cb98835e3c90d55d64ac2ef8defc72bc34c8d39d50b35cbd60b4223924",
      ],
      C: [
        "be84bc5f1cf94bf9208a804c75829b600a6e7b169b9d3985f9ad82867a6c23f8",
        "6d458751b9d15a43cb56d26ca33dd944cde4c4a17d81b025cea7413dbb0a8387",
      ],
    };
    const pairs: readonly (readonly [string, string, number])[] = [
      ["phase-e/E0null-A-n6842-seed42", "A", 3],
      ["phase-e/E0null-B-n6842-seed42", "B", 3],
      ["phase-e/E0null-C-n6842-seed42", "C", 3],
      ["scenario-e/E0null-A-seed42", "A", 2],
      ["scenario-e/E0null-B-seed42", "B", 2],
      ["scenario-e/E0null-C-seed42", "C", 2],
      ["scenario-e-v2/E0null-A-seed42", "A", 2],
      ["scenario-e-v2/E0null-B-seed42", "B", 2],
      ["scenario-e-v2/E0null-C-seed42", "C", 2],
    ];

    let total = 0;
    for (const [nullDir, arm, wantSkips] of pairs) {
      const nullPath = path.join(archive.root, ...nullDir.split("/"));
      const refPath = path.join(archive.root, "present-day-three-arm", `${arm}-seed42`);
      const ck = new Checks();
      const r3 = runVerifyENull(
        ck,
        loadRunDir(nullPath, path.basename(nullPath)),
        loadRunDir(refPath, `${arm}-seed42`),
      );

      expect(ck.failureReport(), nullDir).toBe("");
      expect(ck.results.length, `${nullDir} check count`).toBe(23);
      expect(ck.skipped.length, `${nullDir} skips`).toBe(wantSkips);
      expect(ck.passed.length, `${nullDir} passes`).toBe(23 - wantSkips);

      const [wantAgents, wantShelters] = digests[arm] as readonly [string, string];
      expect(r3.agents?.shaNull, `${nullDir} agents digest`).toBe(wantAgents);
      expect(r3.agents?.shaRef, `${nullDir} agents ref digest`).toBe(wantAgents);
      expect(r3.shelters?.shaNull, `${nullDir} shelters digest`).toBe(wantShelters);
      expect(r3.shelters?.shaRef, `${nullDir} shelters ref digest`).toBe(wantShelters);
      expect(r3.agents?.identical).toBe(true);
      expect(r3.shelters?.identical).toBe(true);
      // §2.5: agents 47 cols x 6,842 rows; shelters 11 x 36 (A, B) or 11 x 46 (C).
      expect(r3.agents?.columns.length).toBe(47);
      expect(r3.agents?.keys.length).toBe(6842);
      expect(r3.shelters?.columns.length).toBe(11);
      expect(r3.shelters?.keys.length).toBe(arm === "C" ? 46 : 36);
      total += ck.results.length;
    }
    expect(total).toBe(9 * 23);
  }, 900_000);

  it("the --null arm goes red when the E0 null stops reproducing its reference", () => {
    // The composed invocation, corroded: one cell of the null's agents.csv
    // changed to the same NUMBER with different TEXT. A comparator that parsed
    // before comparing would pass this.
    const nullPath = path.join(archive.root, "phase-e", "E0null-A-n6842-seed42");
    const refPath = path.join(archive.root, "present-day-three-arm", "A-seed42");
    const d = {
      agentsCsv: readFileSync(path.join(nullPath, "agents.csv"), "utf8"),
      sheltersCsv: readFileSync(path.join(nullPath, "shelters.csv"), "utf8"),
      simulationJson: readFileSync(path.join(nullPath, "simulation.json"), "utf8"),
    };
    const lines = d.agentsCsv.split("\r\n");
    const header = (lines[0] as string).split(",");
    const iDist = header.indexOf("total_travel_distance_m");
    const row = (lines[1] as string).split(",");
    row[iDist] = `${row[iDist] as string}0`; // 23638.21 -> 23638.210
    lines[1] = row.join(",");
    d.agentsCsv = lines.join("\r\n");

    const ck = new Checks();
    const r3 = runVerifyENull(
      ck,
      runFromDocuments({ name: "CORRODED E0null-A", ...d }),
      loadRunDir(refPath, "A-seed42"),
    );
    expect(statusOf(ck, "agents.csv: shared-projection byte-identity")).toBe("FAIL");
    expect(r3.agents?.perColumn.map((c) => c.column)).toEqual(["total_travel_distance_m"]);
    // shelters.csv is untouched and must stay green.
    expect(statusOf(ck, "shelters.csv: shared-projection byte-identity")).toBe("PASS");
  }, 300_000);

  // --- corrosion, on real archived bytes ------------------------------------
  //
  // Each case first proves the untouched run green on the gate under test, then
  // changes one field of the SAME bytes and requires that gate — and, where it
  // discriminates, only that gate — to go red.

  it("(b) goes red when one real shelter's occupancy is off by one", () => {
    expect(statusOf(gradeArchived(ER_RUN, "er"), "(b)")).toBe("PASS");
    const ck = gradeCorroded(ER_RUN, "er", (d) => {
      const lines = d.sheltersCsv.split("\r\n");
      const row = (lines[1] as string).split(",");
      row[7] = String(Number(row[7]) + 1); // final_occupancy
      lines[1] = row.join(",");
      d.sheltersCsv = lines.join("\r\n");
    });
    expect(statusOf(ck, "(b)")).toBe("FAIL");
  }, 120_000);

  it("(b) goes red when the manifest census and the CSV disagree about who got in", () => {
    const ck = gradeCorroded(ER_RUN, "er", (d) => {
      d.simulationJson = d.simulationJson.replace('"sheltered": 1215', '"sheltered": 1216');
    });
    expect(statusOf(ck, "(b)")).toBe("FAIL");
  }, 120_000);

  it("(c) goes red when a real run is edited to give asthmatics a slower gait", () => {
    expect(statusOf(gradeArchived(ER_RUN, "er"), "(c)")).toBe("PASS");
    const ck = gradeCorroded(ER_RUN, "er", (d) => {
      const lines = d.agentsCsv.split("\r\n");
      const header = (lines[0] as string).split(",");
      const iAsthma = header.indexOf("asthma_flag");
      const iSpeed = header.indexOf("walking_speed_mps");
      for (let i = 1; i < lines.length; i += 1) {
        const line = lines[i] as string;
        if (line === "") continue;
        const row = line.split(",");
        if (row[iAsthma] === "1") {
          // −0.05 m/s: 2.5x the 0.02 m/s absolute gate, and a mechanism that
          // does not exist in the model.
          row[iSpeed] = (Number(row[iSpeed]) - 0.05).toFixed(4);
          lines[i] = row.join(",");
        }
      }
      d.agentsCsv = lines.join("\r\n");
    });
    expect(statusOf(ck, "(c)")).toBe("FAIL");
  }, 120_000);

  it("(d) goes red when a real run invents a final_state", () => {
    expect(statusOf(gradeArchived(ER_RUN, "er"), "final_state vocabulary")).toBe("PASS");
    const ck = gradeCorroded(ER_RUN, "er", (d) => {
      d.agentsCsv = d.agentsCsv.replace(",PRE_EVAC,", ",WAITING,");
    });
    expect(statusOf(ck, "final_state vocabulary")).toBe("FAIL");
    // ...and the census check goes red too, because the row left PRE_EVAC.
    expect(statusOf(ck, "agents.csv census == simulation.json census")).toBe("FAIL");
  }, 120_000);

  it("(d) goes red when the manifest census drifts from the CSV by one row", () => {
    const ck = gradeCorroded(ER_RUN, "er", (d) => {
      d.simulationJson = d.simulationJson.replace('"unreachable": 4,', '"unreachable": 5,');
    });
    expect(statusOf(ck, "agents.csv census == simulation.json census")).toBe("FAIL");
    expect(statusOf(ck, "final_state vocabulary")).toBe("PASS");
    expect(statusOf(ck, "state counts sum to numAgents")).toBe("PASS");
  }, 120_000);

  it("(e) goes red when one real UNAWARE resident is given a departure tick", () => {
    expect(statusOf(gradeArchived(ER_RUN, "er"), "(e)")).toBe("PASS");
    const ck = gradeCorroded(ER_RUN, "er", (d) => {
      const lines = d.agentsCsv.split("\r\n");
      const header = (lines[0] as string).split(",");
      const iState = header.indexOf("final_state");
      const iStart = header.indexOf("time_started_tick");
      for (let i = 1; i < lines.length; i += 1) {
        const row = (lines[i] as string).split(",");
        if (row[iState] === "UNAWARE") {
          row[iStart] = "960";
          lines[i] = row.join(",");
          break;
        }
      }
      d.agentsCsv = lines.join("\r\n");
    });
    expect(statusOf(ck, "(e)")).toBe("FAIL");
  }, 120_000);

  it("(e) goes red when a real UNAWARE resident's distance is BLANKED, not just moved", () => {
    // The `fillna(-1)` sentinel. A blank distance is a failure, not a zero —
    // the reflex `fillna(0)` would pass this and delete the gate's teeth.
    const ck = gradeCorroded(ER_RUN, "er", (d) => {
      const lines = d.agentsCsv.split("\r\n");
      const header = (lines[0] as string).split(",");
      const iState = header.indexOf("final_state");
      const iDist = header.indexOf("total_travel_distance_m");
      for (let i = 1; i < lines.length; i += 1) {
        const row = (lines[i] as string).split(",");
        if (row[iState] === "UNAWARE") {
          row[iDist] = "";
          lines[i] = row.join(",");
          break;
        }
      }
      d.agentsCsv = lines.join("\r\n");
    });
    expect(statusOf(ck, "(e)")).toBe("FAIL");
  }, 120_000);

  it("(j) goes red on a real run at 455 slices — the incident this gate caught", () => {
    expect(gradeArchived(SE2_RUN, "se").failed.length).toBe(0);
    const ck = gradeCorroded(SE2_RUN, "se", (d) => {
      d.simulationJson = d.simulationJson.replace('"hours": 456', '"hours": 455');
    });
    expect(statusOf(ck, "severe series length is 456 h")).toBe("FAIL");
    expect(statusOf(ck, "out_of_range_lookups == 0")).toBe("PASS");
  }, 120_000);

  it("(j) goes red when a real run read one hour past the end of its field", () => {
    const ck = gradeCorroded(SE2_RUN, "se", (d) => {
      d.simulationJson = d.simulationJson.replace(
        '"out_of_range_lookups": 0',
        '"out_of_range_lookups": 1',
      );
    });
    expect(statusOf(ck, "out_of_range_lookups == 0")).toBe("FAIL");
    expect(statusOf(ck, "severe series length is 456 h")).toBe("PASS");
  }, 120_000);

  it("(j) goes red when smokeScale was parsed and dropped on the way to the field", () => {
    const ck = gradeCorroded(SE2_RUN, "se", (d) => {
      // The parameter says the field was scaled 2x; the field peak says it was
      // not. Every other number in the manifest still looks correct.
      d.simulationJson = d.simulationJson.replace('"smokeScale": 1.0', '"smokeScale": 2.0');
    });
    expect(statusOf(ck, "x smokeScale")).toBe("FAIL");
    expect(statusOf(ck, "manifest checksums the severe series")).toBe("PASS");
  }, 120_000);

  it("(j) goes red when the manifest stops checksumming the series it read", () => {
    const ck = gradeCorroded(SE2_RUN, "se", (d) => {
      d.simulationJson = d.simulationJson.replace(
        "data/airnow/aqs_hourly_pm25_synthetic_severe_v2.csv",
        "data/airnow/aqs_hourly_pm25_portland_2020-09.csv",
      );
    });
    expect(statusOf(ck, "manifest checksums the severe series")).toBe("FAIL");
  }, 120_000);
});
