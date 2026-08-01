/**
 * wp8-archive-gates.test.ts — the ported gates, run over the certified archive.
 *
 * The order here is the one the task demands and the one that makes the
 * evidence mean anything: **prove the gates green on data the port did not
 * produce, first.** All 60 Phase-E / Scenario-E run directories under
 * `docs/runs/` — 12 `phase-e/`, 21 `scenario-e/`, 27 `scenario-e-v2/` — are
 * loaded from disk and put through gates (f)(g)(h)(i)(k)(l). Those runs were
 * produced by the certified Java instrument at commits `7224cef`, `bb8707d`,
 * `495d845` and `257017d`, and were verified by `scripts/verify_E_runs.py`
 * before this port existed. If a TS gate disagrees with them, the TS gate is
 * wrong.
 *
 * Then, in the same suite and on the same bytes, each gate is corroded: one
 * field of one real archived run is changed and the gate that owns it is
 * required to go red. `test/wp8-gate-corrosion.test.ts` does the same thing
 * exhaustively on synthetic fixtures; doing it here as well closes the gap
 * between "the gate can fail on data I built" and "the gate can fail on data
 * the instrument built".
 *
 * ── What the counts assert ─────────────────────────────────────────────────
 *
 * `WP8-SPEC-archive-gates.md` §3.7 records the full suite's per-run check
 * counts (11 / 19 / 24 / 25). This subset omits (b)(c)(d)(e)(j), i.e. 6 checks
 * from an `--er` run and 10 from an `--se` run, giving 5 / 9 / 14 / 15. The
 * suite asserts the resulting grand total exactly, so a gate that silently
 * stopped registering a check turns the run red instead of quiet.
 *
 * Gated on the archive AND on `Geography/` (gate (k) reads the closure
 * schedules out of the read-only instrument tree) through the shared
 * skip-vs-fail policy: a clean clone SKIPS loudly, a runner with
 * `WEBSIM_REQUIRE_ARTIFACTS=1` fails.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, it } from "vitest";

import { describeArchive, discoverRuns, REPO_ROOT } from "@websim/pipeline/archive";

import { artifactGate, describeGated, type ArtifactRef } from "../../tools/artifact-gate.js";
import {
  Checks,
  E_PARAMS,
  SE_AGENT_COLS,
  SE_PARAMS,
  checkSeCounters,
  geographyScheduleSource,
  intParam,
  loadRunDir,
  runFromDocuments,
  runWp8Gates,
  type RunArm,
  type RunView,
} from "../src/harness/index.js";

const archive = describeArchive();
const GEOGRAPHY_DIR = path.join(REPO_ROOT, "Geography");
const schedules = geographyScheduleSource(GEOGRAPHY_DIR);

/** The three archives whose runs carry a Phase-E decision layer. */
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
  gate: "validation:wp8-archive-gates",
  suite: "WP8 gates (f)(g)(h)(i)(k)(l) — over the certified Java archive",
  evidence:
    "the ported gates run over all 60 archived Phase-E / Scenario-E runs and agree with the " +
    "certified verify_E_runs.py verdict on every one of them (603 checks, 0 failures, 9 " +
    "by-design skips), plus per-gate corrosion on real archived bytes — without it the gates " +
    "have only ever been observed against fixtures this repository wrote itself",
  artifacts: [ARCHIVE_REF, CLOSURES_REF],
});

// ---------------------------------------------------------------------------

interface ArchivedCase {
  readonly runDir: string;
  readonly dir: string;
  readonly arm: RunArm;
  readonly presetFamily: string;
}

/**
 * How `verify_E_runs.py` was invoked over each family when the archive was
 * certified: the E0 nulls through `--null`, the baseline-real arms through
 * `--er`, and everything in the SE families through `--se`. Reproducing the
 * invocation is what makes the check counts comparable.
 */
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
    }));
}

/** Expected check count for one run under this subset — the driver's table. */
function expectedChecks(run: RunView, arm: RunArm): number {
  if (arm !== "se") {
    return 5;
  }
  const code = intParam(run.params, "closuresCode", 0);
  if (code === 0) return 9;
  return code === 3 ? 15 : 14;
}

let loaded: readonly { readonly info: ArchivedCase; readonly run: RunView }[] | null = null;
function runs(): readonly { readonly info: ArchivedCase; readonly run: RunView }[] {
  loaded ??= archivedCases().map((info) => ({ info, run: loadRunDir(info.dir, path.basename(info.dir)) }));
  return loaded;
}

/** Read a run's three documents as text, for the corrosion cases. */
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

function gateStatus(ck: Checks, needle: string): string {
  const hits = ck.results.filter((c) => c.name.includes(needle));
  if (hits.length !== 1) {
    throw new Error(
      `expected one check matching '${needle}', got ${hits.length}: ${hits.map((h) => h.name).join(" | ")}`,
    );
  }
  return (hits[0] as { status: string }).status;
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
    // 9 E0 nulls (3 per archive), 9 ER, 9 SE + 9 SEnc, 15 SE2 + 9 SE2nc.
    expect(Object.fromEntries([...byFamily].sort())).toEqual({
      E0: 9,
      ER: 9,
      SE: 9,
      SE2: 15,
      SE2nc: 9,
      SEnc: 9,
    });
  }, 60_000);

  it("passes every gate on every archived run, with the expected check census", () => {
    const ck = new Checks();
    let expectedTotal = 0;
    const perClass = new Map<string, number>();
    for (const { info, run } of runs()) {
      const before = ck.results.length;
      runWp8Gates(ck, run, { arm: info.arm, schedules });
      const registered = ck.results.length - before;
      const want = expectedChecks(run, info.arm);
      expect(registered, `${info.runDir} registered ${registered} checks`).toBe(want);
      expectedTotal += want;
      perClass.set(info.presetFamily, (perClass.get(info.presetFamily) ?? 0) + registered);
    }

    // eslint-disable-next-line no-console -- the census IS the evidence.
    console.log(
      `[wp8-gates] ${runs().length} archived runs -> ${ck.summary()}; per family ` +
        JSON.stringify(Object.fromEntries([...perClass].sort())),
    );

    expect(ck.failureReport()).toBe("");
    expect(ck.results.length).toBe(expectedTotal);
    // 9 E0 nulls x 5 + 9 ER x 5 + 9 SE x 14 + 9 SEnc x 9 + 15 SE2 x 15 + 9 SE2nc x 9.
    expect(expectedTotal).toBe(603);
    // The only skips are gate (f) on the nine E0 nulls, which have zero barrier
    // cost by design. Anything else skipping would be evidence quietly lost.
    expect(ck.skipped.length).toBe(9);
    expect(new Set(ck.skipped.map((c) => c.detail))).toEqual(
      new Set(["not an E arm (--er); the null has zero barrier cost by design"]),
    );
  }, 600_000);

  it("reads every gate-consumed column without a single lossy coercion", () => {
    // The one place this port could differ from `pd.to_numeric` is an exotic
    // token (`inf`, `1_000`). This asserts the archive contains none, so the
    // documented divergence in `frame.ts` stays theoretical.
    const columns = [
      "heavy_belongings",
      "has_pet",
      "has_dependents",
      "aware_initial",
      ...SE_AGENT_COLS,
    ];
    let checked = 0;
    for (const { info, run } of runs()) {
      for (const col of columns) {
        if (!run.agents.has(col)) continue;
        checked += 1;
        expect(run.agents.coercionLosses(col), `${info.runDir}/${col}`).toBe(0);
      }
    }
    expect(checked).toBeGreaterThan(200);
  }, 600_000);

  it("sees the archive's measure-zero push result: all four counters zero everywhere", () => {
    // WP8-SPEC-archive-gates §4.4: "every one of the four Scenario-E counters
    // is 0 in every run of the archive", across 24 closure runs at two smoke
    // series and four schedules.
    //
    // COUNT RECONCILIATION, measured here rather than quoted. 48 archived runs
    // carry the 59-column counter block: the 42 SE/SEnc/SE2/SE2nc runs
    // (9 + 9 + 15 + 9) plus the 6 E0 nulls in `scenario-e/` and
    // `scenario-e-v2/`. The 12 `phase-e/` runs are logger v1 (55 columns) and
    // predate the block. §4.4's closing line — "48 SE-family runs total" —
    // agrees with that; its earlier phrasing, "all 48 SE/SEnc/SE2/SE2nc runs
    // plus the 6 E0-nulls", double-counts the nulls and would give 54. The
    // bytes say 48, and 42 + 6 = 48 is the reading that is consistent with the
    // per-family census asserted above.
    let withCounters = 0;
    let closureRuns = 0;
    for (const { run } of runs()) {
      if (!SE_AGENT_COLS.every((c) => run.agents.has(c))) continue;
      withCounters += 1;
      const ck = new Checks();
      const totals = checkSeCounters(ck, run);
      expect(totals).not.toBeNull();
      expect(totals?.blockages).toBe(0);
      expect(totals?.pushThroughs).toBe(0);
      expect(totals?.reroutes).toBe(0);
      expect(totals?.stuckEvents).toBe(0);
      expect(totals?.residentsBlocked).toBe(0);
      if (intParam(run.params, "closuresCode", 0) !== 0) closureRuns += 1;
    }
    expect(withCounters).toBe(48);
    // 9 v1 closure runs (code 1) + 15 v2 closure runs (code 3).
    expect(closureRuns).toBe(24);
  }, 600_000);

  it("holds the archived parameter census: 21 E everywhere, 7 SE in the SE families", () => {
    for (const { info, run } of runs()) {
      for (const p of E_PARAMS) {
        expect(p in run.params, `${info.runDir} missing ${p}`).toBe(true);
      }
      if (info.arm === "se") {
        for (const p of SE_PARAMS) {
          expect(p in run.params, `${info.runDir} missing ${p}`).toBe(true);
        }
      }
    }
    const totals = new Set(runs().map(({ run }) => Object.keys(run.params).length));
    // 33 (phase-e), 40 (scenario-e), 41 (scenario-e-v2) — spec §1.1/§3.3.
    expect([...totals].sort((a, b) => a - b)).toEqual([33, 40, 41]);
  }, 600_000);

  // --- corrosion, on real archived bytes -----------------------------------

  it("(f) goes red when a real archived run is edited so nobody stays home", () => {
    const clean = new Checks();
    runWp8Gates(clean, loadRunDir(path.join(archive.root, "phase-e", "ER-A-n6842-seed42")), {
      arm: "er",
    });
    expect(gateStatus(clean, "(f)")).toBe("PASS");

    const ck = new Checks();
    runWp8Gates(
      ck,
      corrode("phase-e/ER-A-n6842-seed42", (d) => {
        d.agentsCsv = d.agentsCsv.replace(/,PRE_EVAC,/gu, ",SHELTERED,").replace(/,UNAWARE,/gu, ",SHELTERED,");
      }),
      { arm: "er" },
    );
    expect(gateStatus(ck, "(f)")).toBe("FAIL");
  }, 120_000);

  it("(g) goes red when a real manifest's target parameter is moved", () => {
    const ck = new Checks();
    runWp8Gates(
      ck,
      corrode("phase-e/ER-A-n6842-seed42", (d) => {
        d.simulationJson = d.simulationJson.replace('"pHasPet": 0.117', '"pHasPet": 0.5');
      }),
      { arm: "er" },
    );
    expect(gateStatus(ck, "3 binomial SE")).toBe("FAIL");
    // ...and the CSV cross-check, which reads no parameter, is untouched.
    expect(gateStatus(ck, "matches agents.csv columns")).toBe("PASS");
  }, 120_000);

  it("(g.2) goes red when a real manifest's realised share is nudged off its CSV", () => {
    const ck = new Checks();
    runWp8Gates(
      ck,
      corrode("phase-e/ER-A-n6842-seed42", (d) => {
        d.simulationJson = d.simulationJson.replace(
          '"realised_pet": 0.1171',
          '"realised_pet": 0.1174',
        );
      }),
      { arm: "er" },
    );
    expect(gateStatus(ck, "3 binomial SE")).toBe("PASS");
    expect(gateStatus(ck, "matches agents.csv columns")).toBe("FAIL");
  }, 120_000);

  it("(h) goes red when a real run's provenance stops saying the tree was clean", () => {
    for (const replacement of ['"git_working_tree_dirty": true', '"git_working_tree_dirty": "unknown"']) {
      const ck = new Checks();
      runWp8Gates(
        ck,
        corrode("phase-e/ER-A-n6842-seed42", (d) => {
          d.simulationJson = d.simulationJson.replace('"git_working_tree_dirty": false', replacement);
        }),
        { arm: "er" },
      );
      expect(gateStatus(ck, "git_working_tree_dirty"), replacement).toBe("FAIL");
    }
  }, 120_000);

  it("(i) goes red when a real SE manifest loses a Scenario-E parameter", () => {
    const ck = new Checks();
    runWp8Gates(
      ck,
      corrode("scenario-e/SE-E18-seed42", (d) => {
        d.simulationJson = d.simulationJson.replace('"pStuck": 0.3,', "");
      }),
      { arm: "se", schedules },
    );
    expect(gateStatus(ck, "Scenario-E parameters in the manifest")).toBe("FAIL");
  }, 120_000);

  it("(k) goes red when a real closure census disagrees with the schedule on disk", () => {
    const ck = new Checks();
    runWp8Gates(
      ck,
      corrode("scenario-e-v2/SE2-E18-d1-seed42", (d) => {
        d.simulationJson = d.simulationJson.replace(
          '"blocked_edges_at_end": 72',
          '"blocked_edges_at_end": 71',
        );
      }),
      { arm: "se", schedules },
    );
    expect(gateStatus(ck, "blocked_edges_at_end")).toBe("FAIL");
    expect(gateStatus(ck, "scheduled edges == closure CSV rows")).toBe("PASS");
  }, 120_000);

  it("(k) goes red when a real run's wave hours are reordered", () => {
    const ck = new Checks();
    runWp8Gates(
      ck,
      corrode("scenario-e-v2/SE2-E18-d1-seed42", (d) => {
        d.simulationJson = d.simulationJson.replace(
          '"wave_hours": [3, 44, 72, 142, 265, 303]',
          '"wave_hours": [44, 3, 72, 142, 265, 303]',
        );
      }),
      { arm: "se", schedules },
    );
    expect(gateStatus(ck, "wave_hours match")).toBe("FAIL");
  }, 120_000);

  it("(l) goes red when one real resident records a stuck event it never earned", () => {
    const ck = new Checks();
    runWp8Gates(
      ck,
      corrode("scenario-e-v2/SE2-E18-d1-seed42", (d) => {
        // Last four columns are the counters; flip the final one on one row.
        const lines = d.agentsCsv.split("\r\n");
        const row = (lines[1] as string).split(",");
        row[row.length - 1] = "1";
        lines[1] = row.join(",");
        d.agentsCsv = lines.join("\r\n");
      }),
      { arm: "se", schedules },
    );
    expect(gateStatus(ck, "never exceed push-throughs")).toBe("FAIL");
    expect(gateStatus(ck, "exactly one decision")).toBe("PASS");
  }, 120_000);
});
