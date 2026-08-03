/**
 * wp9-analyze-run.test.ts — `analyze_run.py`'s cross-file verification, over
 * the archived runs it was written for.
 *
 * Where `verify_E_runs.py` checks invariants, this checks **arithmetic**: every
 * aggregate the Java `OutcomeLogger` wrote into `simulation.json` is recomputed
 * from the raw per-agent rows and compared. It is the only gate in the suite
 * that would notice a manifest and a CSV describing two different runs.
 *
 * ## Which runs, and why not all of them
 *
 * The gate reads `manifest["shelters"]`, `population.exposure_ugm3h`,
 * `population.travel_m`, `smoke_field` and `reproducibility.parameters
 * .minutesPerTick`. Every archived run with per-agent CSVs carries all of them,
 * so the suite runs over **all 136** — the 27 three-arm runs, the Phase-E and
 * Scenario-E families, the D / CR / CP / bed-sweep / window families, the
 * historical reference and the final baseline. Roughly 14,000 individual
 * checks, all of which were previously only ever exercised through the Python.
 *
 * ## The A-17 clause is the one that has caught something
 *
 * `walked <= planned + snap + 200 m` is a FAILING check, not advisory, because
 * `10-FAILURE-MODES.md` Finding A recorded that the print-only version *"would
 * let a 10 km detour still report all-passed"*. That is this project's
 * recurring lesson, written into someone else's code a year earlier. The
 * corrosion case below injects exactly that 10 km detour into one real agent.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, it } from "vitest";

import { describeArchive, discoverRuns } from "@websim/pipeline/archive";

import { artifactGate, describeGated, type ArtifactRef } from "../../../tools/artifact-gate.js";
import { Checks, loadRunDir, runFromDocuments, type RunView } from "../../src/harness/index.js";
import { DETOUR_FLAG_M, checkAnalyzeRun, routingAnomaly } from "../../src/gates/index.js";

const archive = describeArchive();

const ARCHIVE_REF: ArtifactRef = {
  source: "archive",
  label: "docs/runs (every run with per-agent CSVs)",
  path: path.join(archive.root, "present-day-three-arm"),
};

const gate = artifactGate({
  gate: "validation:wp9-analyze-run",
  suite: "WP9 analyze_run — recomputed statistics vs the manifest, over the certified archive",
  evidence:
    "the ported analyze_run.py verification (linear-interpolation percentiles, " +
    "mean-absolute-difference Gini, four-way shelter reconciliation, the VWE identity, the " +
    "travel-time identity, the PM2.5 bounds and the A-17 routing gate) recomputes every " +
    "manifest aggregate from the raw rows of every archived run with per-agent CSVs and agrees " +
    "with the certified Java writer — the only gate that would notice a manifest and a CSV " +
    "describing two different runs",
  artifacts: [ARCHIVE_REF],
});

// ---------------------------------------------------------------------------

interface Case {
  readonly runDir: string;
  readonly run: RunView;
}

let loaded: readonly Case[] | null = null;
function cases(): readonly Case[] {
  loaded ??= discoverRuns(archive.root)
    .filter((r) => r.hasAgents && r.hasShelters)
    .map((r) => {
      const dir = path.join(archive.root, ...r.runDir.split("/"));
      return { runDir: r.runDir, run: loadRunDir(dir, path.basename(dir)) };
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

function corrode(
  runDir: string,
  edit: (d: { agentsCsv: string; sheltersCsv: string; simulationJson: string }) => void,
): Checks {
  const d = docsOf(runDir);
  const before = { ...d };
  edit(d);
  if (
    d.agentsCsv === before.agentsCsv &&
    d.sheltersCsv === before.sheltersCsv &&
    d.simulationJson === before.simulationJson
  ) {
    throw new Error(`corrode(${runDir}): the edit changed nothing, so the case proves nothing`);
  }
  const ck = new Checks();
  checkAnalyzeRun(ck, runFromDocuments({ name: path.basename(runDir), ...d }));
  return ck;
}

function statusOf(ck: Checks, needle: string): string {
  const hits = ck.results.filter((c) => c.name.includes(needle));
  if (hits.length !== 1) {
    throw new Error(
      `expected one check matching '${needle}', got ${hits.length}: ${hits
        .map((h) => h.name)
        .slice(0, 6)
        .join(" | ")}`,
    );
  }
  return (hits[0] as { status: string }).status;
}

const REF = "present-day-three-arm/A-seed42";

// ---------------------------------------------------------------------------

describeGated(gate, () => {
  it("recomputes every manifest aggregate on every archived run with CSVs", () => {
    const ck = new Checks();
    let graded = 0;
    for (const { runDir, run } of cases()) {
      const before = ck.results.length;
      checkAnalyzeRun(ck, run);
      expect(ck.results.length - before, `${runDir} registered no checks`).toBeGreaterThan(20);
      graded += 1;
    }

    // eslint-disable-next-line no-console -- the census IS the evidence.
    console.log(`[wp9-analyze-run] ${graded} archived runs -> ${ck.summary()}`);

    expect(ck.failureReport()).toBe("");
    expect(ck.skipped.length).toBe(0);
    expect(graded).toBe(136);
    expect(ck.results.length).toBeGreaterThan(10_000);
  }, 900_000);

  it("has a dose column with no blank cell, so the Gini transcription is exact", () => {
    // `analyze_run.py`'s `gini()` does NOT drop NaN — it would sort one into an
    // arbitrary position and return NaN. The port transcribes that literally,
    // so the difference is only theoretical while this holds.
    for (const { runDir, run } of cases()) {
      expect(run.agents.coercionLosses("cumulative_dose_ugm3h"), runDir).toBe(0);
      const blanks = run.agents
        .column("cumulative_dose_ugm3h")
        .reduce((a, v) => a + (v.trim() === "" ? 1 : 0), 0);
      expect(blanks, `${runDir} blank dose cells`).toBe(0);
    }
  }, 900_000);

  it("finds no routing detour artifact anywhere in the archive (A-17)", () => {
    let onPlannedBasis = 0;
    let onFallbackBasis = 0;
    for (const { runDir, run } of cases()) {
      const a = routingAnomaly(run);
      expect(a.nFlagged, `${runDir}: ${a.detourMaxM} m max surplus`).toBe(0);
      expect(a.nWithRoute, runDir).toBeGreaterThan(0);
      if (a.basis.startsWith("planned_route_m")) onPlannedBasis += 1;
      else onFallbackBasis += 1;
    }
    // Both branches of the basis selection are exercised by the archive: the
    // `final-baseline` run predates the A-17 export columns. A gate whose
    // fallback path had never run would be a gate with an untested half.
    expect(onFallbackBasis).toBe(1);
    expect(onPlannedBasis).toBe(135);
  }, 900_000);

  // --- corrosion, on real archived bytes ------------------------------------

  it("goes red when one real agent walks 10 km further than it planned (A-17)", () => {
    // 10-FAILURE-MODES.md Finding A, injected: the exact defect the print-only
    // version of this check let through as "all passed".
    const ck = corrode(REF, (d) => {
      const lines = d.agentsCsv.split("\r\n");
      const header = (lines[0] as string).split(",");
      const iWalked = header.indexOf("total_travel_distance_m");
      const row = (lines[1] as string).split(",");
      row[iWalked] = String(Number(row[iWalked]) + 10_000);
      lines[1] = row.join(",");
      d.agentsCsv = lines.join("\r\n");
    });
    expect(statusOf(ck, "(A-17)")).toBe("FAIL");
  }, 300_000);

  it("brackets the A-17 threshold at 200 m: 199 m passes, 201 m fails", () => {
    const nudge = (delta: number): string => {
      const d = docsOf(REF);
      const lines = d.agentsCsv.split("\r\n");
      const header = (lines[0] as string).split(",");
      const iWalked = header.indexOf("total_travel_distance_m");
      const row = (lines[1] as string).split(",");
      row[iWalked] = (Number(row[iWalked]) + delta).toFixed(2);
      lines[1] = row.join(",");
      d.agentsCsv = lines.join("\r\n");
      const ck = new Checks();
      checkAnalyzeRun(ck, runFromDocuments({ name: "NUDGED", ...d }));
      return statusOf(ck, "(A-17)");
    };
    // Row 1 of A-seed42 walks EXACTLY planned + snap, so the surplus is the
    // nudge. Bracketing at ±1 m rather than asserting the exact boundary keeps
    // the case free of float-sum slop while still pinning the threshold to
    // 200 m — the number that matters, given the alternative was a check that
    // let a 10 km detour through.
    expect(DETOUR_FLAG_M).toBe(200);
    expect(nudge(199)).toBe("PASS");
    expect(nudge(201)).toBe("FAIL");
  }, 300_000);

  it("goes red when a manifest exposure statistic is nudged past its tolerance", () => {
    // `approx` is max(0.51, 1e-3 x magnitude), so at a mean of 37,801.88 the
    // real budget is the RELATIVE arm: 37.8, not 0.51. +40 is outside it.
    const ck = corrode(REF, (d) => {
      d.simulationJson = d.simulationJson.replace('"mean": 37801.8764', '"mean": 37841.8764');
    });
    expect(statusOf(ck, "exposure mean recomputed")).toBe("FAIL");
    expect(statusOf(ck, "exposure median recomputed")).toBe("PASS");
  }, 300_000);

  it("keeps the exposure tolerance at 0.1 % relative — measured, not assumed", () => {
    // The pair that states the tolerance honestly. 30/37801.88 = 0.079 % is
    // inside; the case above, 40/37801.88 = 0.106 %, is outside. A reader who
    // saw only `atol = 0.51` in the signature would badly misjudge this gate's
    // sensitivity, so it is pinned rather than described.
    const d = docsOf(REF);
    d.simulationJson = d.simulationJson.replace('"mean": 37801.8764', '"mean": 37831.8764');
    const ck = new Checks();
    checkAnalyzeRun(ck, runFromDocuments({ name: "NUDGED", ...d }));
    expect(statusOf(ck, "exposure mean recomputed")).toBe("PASS");
  }, 300_000);

  it("goes red on a Gini drift of 6e-3 — the 5e-3 budget is not 0.51", () => {
    // The whole reason gini gets its own atol: at 0.51 this check would accept
    // any Gini at all, since the statistic is bounded by 1.
    const ck = corrode(REF, (d) => {
      d.simulationJson = d.simulationJson.replace('"gini": 0.2996', '"gini": 0.3056');
    });
    expect(statusOf(ck, "exposure gini recomputed")).toBe("FAIL");
  }, 300_000);

  it("goes red when the VWE identity is broken on one real row", () => {
    const ck = corrode(REF, (d) => {
      const lines = d.agentsCsv.split("\r\n");
      const header = (lines[0] as string).split(",");
      const iVwe = header.indexOf("vwe_ugm3h");
      const row = (lines[1] as string).split(",");
      row[iVwe] = (Number(row[iVwe]) + 0.001).toFixed(4);
      lines[1] = row.join(",");
      d.agentsCsv = lines.join("\r\n");
    });
    expect(statusOf(ck, "VWE == exposure row-by-row")).toBe("FAIL");
    expect(statusOf(ck, "all RR placeholders == 1.0")).toBe("PASS");
  }, 300_000);

  it("goes red when an RR placeholder stops being 1.0", () => {
    const ck = corrode(REF, (d) => {
      const lines = d.agentsCsv.split("\r\n");
      const header = (lines[0] as string).split(",");
      const iRr = header.indexOf("age_rr");
      const row = (lines[1] as string).split(",");
      row[iRr] = "1.200";
      lines[1] = row.join(",");
      d.agentsCsv = lines.join("\r\n");
    });
    expect(statusOf(ck, "all RR placeholders == 1.0")).toBe("FAIL");
  }, 300_000);

  it("goes red when travel_time_min stops equalling (arrived - started) x mpt", () => {
    const ck = corrode(REF, (d) => {
      const lines = d.agentsCsv.split("\r\n");
      const header = (lines[0] as string).split(",");
      const iTt = header.indexOf("travel_time_min");
      for (let i = 1; i < lines.length; i += 1) {
        const row = (lines[i] as string).split(",");
        if ((row[iTt] ?? "") !== "") {
          row[iTt] = (Number(row[iTt]) + 0.1).toFixed(2);
          lines[i] = row.join(",");
          break;
        }
      }
      d.agentsCsv = lines.join("\r\n");
    });
    expect(statusOf(ck, "(arrived - started)")).toBe("FAIL");
  }, 300_000);

  it("goes red when one agent's peak PM2.5 exceeds the smoke field's", () => {
    const ck = corrode(REF, (d) => {
      const lines = d.agentsCsv.split("\r\n");
      const header = (lines[0] as string).split(",");
      const iPeak = header.indexOf("peak_pm25_ugm3");
      const row = (lines[1] as string).split(",");
      row[iPeak] = "9999.00";
      lines[1] = row.join(",");
      d.agentsCsv = lines.join("\r\n");
    });
    expect(statusOf(ck, "per-agent peak PM2.5 <= smoke-field peak")).toBe("FAIL");
    // ...and avg <= peak is NOT dragged red by raising the peak.
    expect(statusOf(ck, "per-agent avg PM2.5 <= peak PM2.5")).toBe("PASS");
  }, 300_000);

  it("goes red when one agent's average PM2.5 exceeds its own peak", () => {
    const ck = corrode(REF, (d) => {
      const lines = d.agentsCsv.split("\r\n");
      const header = (lines[0] as string).split(",");
      const iAvg = header.indexOf("avg_pm25_ugm3");
      const iPeak = header.indexOf("peak_pm25_ugm3");
      const row = (lines[1] as string).split(",");
      row[iAvg] = (Number(row[iPeak]) + 1).toFixed(2);
      lines[1] = row.join(",");
      d.agentsCsv = lines.join("\r\n");
    });
    expect(statusOf(ck, "per-agent avg PM2.5 <= peak PM2.5")).toBe("FAIL");
    expect(statusOf(ck, "per-agent peak PM2.5 <= smoke-field peak")).toBe("PASS");
  }, 300_000);

  it("goes red when one shelter's occupancy disagrees with the arrivals that claim it", () => {
    const ck = corrode(REF, (d) => {
      const lines = d.sheltersCsv.split("\r\n");
      const row = (lines[1] as string).split(",");
      expect(row[0]).toBe("Arbor_Lodge_Shelter");
      row[7] = String(Number(row[7]) + 1);
      lines[1] = row.join(",");
      d.sheltersCsv = lines.join("\r\n");
    });
    expect(statusOf(ck, "shelter Arbor_Lodge_Shelter: agents.csv arrivals")).toBe("FAIL");
    expect(statusOf(ck, "shelter Arbor_Lodge_Shelter: shelters.csv == simulation.json")).toBe(
      "FAIL",
    );
    expect(statusOf(ck, "sum(final_occupancy) == n sheltered")).toBe("FAIL");
    // Only the edited shelter goes red; the other 35 reconcile as before.
    expect(
      ck.results.filter((c) => c.name.includes("agents.csv arrivals") && c.status === "FAIL").length,
    ).toBe(1);
  }, 300_000);

  it("goes red when a run's identity column stops matching its manifest", () => {
    const ck = corrode(REF, (d) => {
      d.simulationJson = d.simulationJson.replace(
        '"data_version_tag": "bdce237a6a6a"',
        '"data_version_tag": "000000000000"',
      );
    });
    expect(statusOf(ck, "data_version constant and == manifest")).toBe("FAIL");
    expect(statusOf(ck, "random_seed constant and == manifest")).toBe("PASS");
  }, 300_000);

  it("goes red when reached_shelter and final_state disagree on one row", () => {
    const ck = corrode(REF, (d) => {
      const lines = d.agentsCsv.split("\r\n");
      const header = (lines[0] as string).split(",");
      const iReached = header.indexOf("reached_shelter");
      const row = (lines[1] as string).split(",");
      row[iReached] = row[iReached] === "yes" ? "no" : "yes";
      lines[1] = row.join(",");
      d.agentsCsv = lines.join("\r\n");
    });
    expect(statusOf(ck, "reached_shelter == (final_state SHELTERED)")).toBe("FAIL");
  }, 300_000);

  it("goes red when the smoke field recorded an out-of-range lookup", () => {
    const ck = corrode(REF, (d) => {
      d.simulationJson = d.simulationJson.replace(
        '"out_of_range_lookups": 0',
        '"out_of_range_lookups": 3',
      );
    });
    expect(statusOf(ck, "smoke field out_of_range_lookups == 0")).toBe("FAIL");
  }, 300_000);

  it("goes red when the person-hours total drifts past 0.51", () => {
    const ck = corrode(REF, (d) => {
      d.simulationJson = d.simulationJson.replace(
        '"total_person_hours_above_unhealthy": 928917.85',
        '"total_person_hours_above_unhealthy": 928919.85',
      );
    });
    expect(statusOf(ck, "sum(hours_above_unhealthy) == manifest person-hours")).toBe("FAIL");
  }, 300_000);

  it("goes red when a shelters.csv row is absent from simulation.json", () => {
    // The Python raises KeyError here. The port records a named FAIL instead —
    // same verdict, but the remaining checks still run and are still reported.
    const ck = corrode(REF, (d) => {
      const m = JSON.parse(d.simulationJson) as Record<string, unknown>;
      const shelters = m["shelters"] as { id: string }[];
      shelters.shift();
      d.simulationJson = JSON.stringify(m);
    });
    const hits = ck.results.filter((c) => c.name.includes("simulation.json occupancy/refused"));
    expect(hits.filter((c) => c.status === "FAIL").length).toBe(1);
    expect(hits.length).toBe(36);
    expect(
      hits.find((c) => c.status === "FAIL")?.detail.includes("absent from simulation.json.shelters"),
    ).toBe(true);
  }, 300_000);
});
