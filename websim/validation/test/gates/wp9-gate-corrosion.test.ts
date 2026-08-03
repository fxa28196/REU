/**
 * wp9-gate-corrosion.test.ts — every WP9 gate, proven able to go RED.
 *
 * The archive suites (`wp9-archive-gates`, `wp9-verify-2026`,
 * `wp9-analyze-run`) prove the gates green on certified data and corrode them
 * on real archived bytes. This file does the exhaustive half on synthetic
 * fixtures, and — deliberately — **needs no artifacts**, so a clean clone with
 * no `docs/runs/` still proves that every gate can fail.
 *
 * That split matters. If the only corrosion evidence lived behind an artifact
 * gate, a hosted CI run would report a green suite in which no gate had ever
 * been shown capable of failing, which is the exact shape of the three
 * regressions this project has already had.
 *
 * ## The rule every case here follows
 *
 *  1. build the baseline fixture and assert the gate under test is **PASS**;
 *  2. change exactly one thing;
 *  3. assert that gate is **FAIL** — and, where the gates discriminate, that
 *     the neighbouring gates are still PASS.
 *
 * Step 3's second half is what stops a case from "passing" because the fixture
 * fell apart. A corrosion test that turns everything red proves only that the
 * input is broken, not that a particular gate noticed a particular thing.
 */

import { describe, expect, it } from "vitest";

import { Checks, type RunView } from "../../src/harness/index.js";
import {
  ARM_CODE,
  DETOUR_FLAG_M,
  EXPECTED_CAP,
  PEAK_PRINT_SLACK,
  SEVERE_SERIES,
  SEVERE_SERIES_HOURS,
  approx,
  checkAnalyzeRun,
  checkAsthmaControl,
  checkBedSum,
  checkSeSmoke,
  checkStates,
  checkUnawareImmobility,
  checkVerify2026,
  gini,
  nanMean,
  nanSum,
  pctl,
  populationColumnSha256,
  unreachableIdSetSha256,
  varDdof1,
} from "../../src/gates/index.js";
import {
  FIXTURE_FIELD_PEAK,
  FIXTURE_N,
  FIXTURE_S1_OCC,
  FIXTURE_SHELTERED,
  FIXTURE_UNAWARE,
  threeArmDocs,
  threeArmRuns,
  threeArmSet,
  wp9Fixture,
  type Wp9FixtureOptions,
} from "./wp9-fixtures.js";

/** Run one gate over a fixture and return the registry. */
function grade(
  gateFn: (ck: Checks, run: RunView) => unknown,
  options: Wp9FixtureOptions = {},
): Checks {
  const ck = new Checks();
  gateFn(ck, wp9Fixture(options));
  return ck;
}

function statusOf(ck: Checks, needle: string): string {
  const hits = ck.results.filter((c) => c.name.includes(needle));
  if (hits.length !== 1) {
    throw new Error(
      `expected one check matching '${needle}', got ${hits.length}: ${hits
        .map((h) => h.name)
        .slice(0, 8)
        .join(" | ")}`,
    );
  }
  return (hits[0] as { status: string }).status;
}

function onlyStatus(ck: Checks): string {
  expect(ck.results.length).toBe(1);
  return (ck.results[0] as { status: string }).status;
}

// ===========================================================================

describe("the WP9 baseline fixture is green — without which no red proves anything", () => {
  it("passes (b), (c), (d), (e), (j) and the whole analyze_run set", () => {
    for (const [label, fn] of [
      ["(b)", checkBedSum],
      ["(c)", checkAsthmaControl],
      ["(d)", checkStates],
      ["(e)", checkUnawareImmobility],
      ["(j)", checkSeSmoke],
      ["analyze_run", checkAnalyzeRun],
    ] as const) {
      const ck = grade(fn);
      expect(ck.failureReport(), label).toBe("");
      expect(ck.results.length, `${label} registered nothing`).toBeGreaterThan(0);
    }
  });

  it("has the population shape the cases below rely on", () => {
    const run = wp9Fixture();
    expect(run.agents.rows.length).toBe(FIXTURE_N);
    const states = run.agents.column("final_state");
    expect(states.filter((s) => s === "UNAWARE").length).toBe(FIXTURE_UNAWARE);
    expect(states.filter((s) => s === "SHELTERED").length).toBe(FIXTURE_SHELTERED);
    // The (c) stratum is two-valued and both cells are large enough to test.
    const ck = new Checks();
    const stratum = checkAsthmaControl(ck, run);
    expect(stratum?.n).toBe(80);
    expect(stratum?.nAsthma1).toBe(40);
    expect(stratum?.nAsthma0).toBe(40);
  });
});

// --- (b) --------------------------------------------------------------------

describe("(b) the U-03 four-way bed sum can fail", () => {
  it("is PASS on the baseline, and the four terms genuinely agree", () => {
    const ck = new Checks();
    const totals = checkBedSum(ck, wp9Fixture());
    expect(onlyStatus(ck)).toBe("PASS");
    expect(totals.occupancy).toBe(FIXTURE_SHELTERED);
    expect(totals.reachedShelterYes).toBe(FIXTURE_SHELTERED);
    expect(totals.finalStateSheltered).toBe(FIXTURE_SHELTERED);
  });

  it("goes red when the shelter ledger drifts from the manifest", () => {
    const ck = grade(checkBedSum, {
      shelterPatches: [{ row: 0, column: "final_occupancy", value: String(FIXTURE_S1_OCC + 1) }],
    });
    expect(onlyStatus(ck)).toBe("FAIL");
  });

  it("goes red when the manifest census drifts from the CSV", () => {
    const ck = grade(checkBedSum, {
      manifestPatch: (m) => {
        (m["population"] as Record<string, unknown>)["sheltered"] = FIXTURE_SHELTERED - 1;
      },
    });
    expect(onlyStatus(ck)).toBe("FAIL");
  });

  it("goes red when reached_shelter and final_state stop agreeing", () => {
    // The pair a two-way check would miss: `final_state` and the manifest
    // census both still say 80, and only the third witness moved.
    const ck = grade(checkBedSum, {
      agentPatches: [{ row: 25, column: "reached_shelter", value: "no" }],
    });
    expect(onlyStatus(ck)).toBe("FAIL");
  });

  it("goes red — not vacuously green — when the manifest has no census at all", () => {
    const ck = grade(checkBedSum, {
      manifestPatch: (m) => {
        delete (m["population"] as Record<string, unknown>)["sheltered"];
      },
    });
    expect(onlyStatus(ck)).toBe("FAIL");
  });

  it("does not accept a stringified count for an integer one", () => {
    // Python's `2060 == "2060"` is False. A port using JS `==` would pass this.
    const ck = grade(checkBedSum, {
      manifestPatch: (m) => {
        (m["population"] as Record<string, unknown>)["sheltered"] = String(FIXTURE_SHELTERED);
      },
    });
    expect(onlyStatus(ck)).toBe("FAIL");
  });
});

// --- (c) --------------------------------------------------------------------

describe("(c) the asthma negative control can fail", () => {
  /** Patch all 40 asthma-1 rows of the stratum to one constant value. */
  const asthmaCell = (column: string, value: string): Wp9FixtureOptions => ({
    agentPatches: Array.from({ length: 40 }, (_, k) => ({ row: k * 2, column, value })),
  });

  it("has a baseline at delta = 0 on both arms — no accidental headroom", () => {
    const ck = grade(checkAsthmaControl);
    expect(onlyStatus(ck)).toBe("PASS");
    const lines = ck.results[0]?.lines ?? [];
    expect(lines.some((l) => l.startsWith("walking_speed_mps:") && l.includes("|delta|=0.0000"))).toBe(
      true,
    );
    expect(lines.some((l) => l.startsWith("inhaled_dose_ug:") && l.includes("z=0.00"))).toBe(true);
  });

  it("goes red when asthmatics are given a slower gait than the 0.02 m/s gate", () => {
    // Baseline mean is 1.2000 in both cells, so this is a clean −0.03 delta.
    const ck = grade(checkAsthmaControl, asthmaCell("walking_speed_mps", "1.1700"));
    expect(onlyStatus(ck)).toBe("FAIL");
  });

  it("brackets the gait gate at 0.02 m/s: 0.019 passes, 0.021 fails", () => {
    // The gate is ABSOLUTE, so this pins it at 0.02 rather than at "any
    // difference at all" — a gate that fired on sampling noise would be the
    // first one somebody turned off.
    expect(onlyStatus(grade(checkAsthmaControl, asthmaCell("walking_speed_mps", "1.1810")))).toBe(
      "PASS",
    );
    expect(onlyStatus(grade(checkAsthmaControl, asthmaCell("walking_speed_mps", "1.1790")))).toBe(
      "FAIL",
    );
  });

  it("goes red on a dose difference past |z| = 3, on the studentised arm", () => {
    // The dose arm is z-based, not absolute: at these magnitudes (~2,000 µg,
    // SE ~37) a 0.02 budget would be unmeetable and a 200 µg one vacuous.
    // +200 µg is ~5.4 SE.
    const ck = grade(checkAsthmaControl, asthmaCell("inhaled_dose_ug", "2200.0000"));
    expect(onlyStatus(ck)).toBe("FAIL");
    expect(ck.results[0]?.lines.some((l) => l.includes("|z|<=3 ? NO"))).toBe(true);
  });

  it("does NOT go red on a dose difference inside |z| = 3", () => {
    // ~+100 µg is ~2.7 SE. The pair with the case above is what makes the
    // studentised threshold a claim rather than a coincidence.
    const ck = grade(checkAsthmaControl, asthmaCell("inhaled_dose_ug", "2100.0000"));
    expect(onlyStatus(ck)).toBe("PASS");
  });

  it("goes red — not skips — when the conditioning stratum is empty", () => {
    // The failure mode that would make the control vacuous. A gate that
    // reported SKIP here would be silently untested on every future run whose
    // heterogeneity columns were not populated.
    const ck = grade(checkAsthmaControl, {
      agentPatches: Array.from({ length: FIXTURE_N }, (_, i) => ({
        row: i,
        column: "copd_flag",
        value: "1",
      })),
    });
    expect(onlyStatus(ck)).toBe("FAIL");
    expect(ck.results[0]?.detail).toContain("empty");
  });

  it("goes red when the stratum is single-valued", () => {
    const ck = grade(checkAsthmaControl, {
      agentPatches: Array.from({ length: FIXTURE_N }, (_, i) => ({
        row: i,
        column: "asthma_flag",
        value: "0",
      })),
    });
    expect(onlyStatus(ck)).toBe("FAIL");
    expect(ck.results[0]?.detail).toContain("single-valued");
  });

  it("goes red when a column it needs is missing", () => {
    const ck = grade(checkAsthmaControl, { dropAgentColumns: ["inhaled_dose_ug"] });
    expect(onlyStatus(ck)).toBe("FAIL");
    expect(ck.results[0]?.detail).toContain("inhaled_dose_ug");
  });

  it("prints the gammaVuln caveat when the timing channel is live, and not otherwise", () => {
    const off = grade(checkAsthmaControl);
    expect(off.results[0]?.lines.some((l) => l.startsWith("CAVEAT"))).toBe(false);
    const on = grade(checkAsthmaControl, {
      manifestPatch: (m) => {
        const p = (m["reproducibility"] as Record<string, unknown>)["parameters"] as Record<
          string,
          unknown
        >;
        p["gammaVuln"] = 0.25;
      },
    });
    expect(on.results[0]?.lines.some((l) => l.startsWith("CAVEAT gammaVuln=0.25"))).toBe(true);
    // ...and the caveat does NOT change the verdict. It is an adjudication
    // note, not a tolerance.
    expect(onlyStatus(on)).toBe("PASS");
  });

  it("reports departure timing as an OBSERVATION and never gates it", () => {
    // A huge timing difference must not move the verdict — V39 permits it.
    const ck = grade(checkAsthmaControl, {
      agentPatches: Array.from({ length: 40 }, (_, k) => ({
        row: k * 2,
        column: "time_started_tick",
        value: "9999",
      })),
    });
    expect(onlyStatus(ck)).toBe("PASS");
    expect(ck.results[0]?.lines.some((l) => l.includes("OBSERVATION time_started_tick"))).toBe(true);
  });

  it("uses ddof=1, which is what makes the z arm the right size", () => {
    // A port that used the population variance would shrink the SE by
    // sqrt((n-1)/n) and manufacture exceedances. Pinned directly.
    expect(varDdof1([1, 2, 3, 4])).toBeCloseTo(5 / 3, 12);
    expect(varDdof1([7])).toBeNaN();
  });
});

// --- (d) --------------------------------------------------------------------

describe("(d) terminal-state conservation can fail", () => {
  it("registers exactly three checks and passes all of them on the baseline", () => {
    const ck = grade(checkStates);
    expect(ck.results.length).toBe(3);
    expect(ck.failureReport()).toBe("");
  });

  it("goes red on a state outside the closed vocabulary", () => {
    const ck = grade(checkStates, {
      agentPatches: [{ row: 0, column: "final_state", value: "WAITING" }],
    });
    expect(statusOf(ck, "final_state vocabulary")).toBe("FAIL");
  });

  it("goes red when the run sampled a different population than it was asked for", () => {
    const ck = grade(checkStates, {
      manifestPatch: (m) => {
        const p = (m["reproducibility"] as Record<string, unknown>)["parameters"] as Record<
          string,
          unknown
        >;
        p["numAgents"] = FIXTURE_N + 1;
      },
    });
    expect(statusOf(ck, "state counts sum to numAgents")).toBe("FAIL");
    expect(statusOf(ck, "final_state vocabulary")).toBe("PASS");
  });

  it("goes red when the CSV census and the manifest census disagree", () => {
    const ck = grade(checkStates, {
      manifestPatch: (m) => {
        (m["population"] as Record<string, unknown>)["unaware"] = FIXTURE_UNAWARE + 1;
      },
    });
    expect(statusOf(ck, "agents.csv census == simulation.json census")).toBe("FAIL");
  });

  it("goes red when a manifest key is ABSENT but the CSV has rows in that state", () => {
    // The asymmetric rule: absence alone is fine (pre-Phase-E manifests have no
    // `unaware` key), absence WITH rows is not.
    const ck = grade(checkStates, {
      manifestPatch: (m) => {
        delete (m["population"] as Record<string, unknown>)["unaware"];
      },
    });
    expect(statusOf(ck, "agents.csv census == simulation.json census")).toBe("FAIL");
    expect(ck.results[2]?.detail).toContain("ABSENT");
  });

  it("stays green when a manifest key is absent and the CSV has NO rows in that state", () => {
    // The other half of the same rule. Getting this wrong turns 94 correct
    // pre-Phase-E runs red.
    const ck = grade(checkStates, {
      agentPatches: Array.from({ length: FIXTURE_UNAWARE }, (_, i) => ({
        row: i,
        column: "final_state",
        value: "PRE_EVAC",
      })),
      manifestPatch: (m) => {
        const pop = m["population"] as Record<string, unknown>;
        delete pop["unaware"];
        pop["pre_evac"] = 20;
      },
    });
    expect(statusOf(ck, "agents.csv census == simulation.json census")).toBe("PASS");
  });

  it("does not fail on an absent numAgents — the source clause is conditional", () => {
    const ck = grade(checkStates, {
      manifestPatch: (m) => {
        const p = (m["reproducibility"] as Record<string, unknown>)["parameters"] as Record<
          string,
          unknown
        >;
        delete p["numAgents"];
      },
    });
    expect(statusOf(ck, "state counts sum to numAgents")).toBe("PASS");
  });
});

// --- (e) --------------------------------------------------------------------

describe("(e) UNAWARE immobility can fail", () => {
  it("is PASS on the baseline over a non-empty UNAWARE population", () => {
    const ck = new Checks();
    const census = checkUnawareImmobility(ck, wp9Fixture());
    expect(onlyStatus(ck)).toBe("PASS");
    expect(census?.nUnaware).toBe(FIXTURE_UNAWARE);
  });

  it("goes red when an UNAWARE resident walked", () => {
    const ck = grade(checkUnawareImmobility, {
      agentPatches: [{ row: 3, column: "total_travel_distance_m", value: "0.01" }],
    });
    expect(onlyStatus(ck)).toBe("FAIL");
  });

  it("goes red when an UNAWARE resident's distance is BLANK — the fillna(-1) sentinel", () => {
    // The single most reversible decision in this gate. `fillna(0)` would pass
    // this and delete the gate's teeth without failing anything else.
    const ck = grade(checkUnawareImmobility, {
      agentPatches: [{ row: 3, column: "total_travel_distance_m", value: "" }],
    });
    expect(onlyStatus(ck)).toBe("FAIL");
    expect(ck.results[0]?.lines.some((l) => l.includes("moved"))).toBe(true);
  });

  it("goes red when an UNAWARE resident has a departure tick", () => {
    const ck = grade(checkUnawareImmobility, {
      agentPatches: [{ row: 3, column: "time_started_tick", value: "60" }],
    });
    expect(onlyStatus(ck)).toBe("FAIL");
  });

  it("treats tick 0 as a real departure, not as absence", () => {
    // The reason the departure witness is tested as TEXT. A numeric `== 0` test
    // would read a first-tick departure as "never left".
    const ck = grade(checkUnawareImmobility, {
      agentPatches: [{ row: 3, column: "time_started_tick", value: "0" }],
    });
    expect(onlyStatus(ck)).toBe("FAIL");
  });

  it("SKIPs — never passes — when the run has no UNAWARE residents", () => {
    const ck = new Checks();
    const census = checkUnawareImmobility(
      ck,
      wp9Fixture({
        agentPatches: Array.from({ length: FIXTURE_UNAWARE }, (_, i) => ({
          row: i,
          column: "final_state",
          value: "PRE_EVAC",
        })),
      }),
    );
    expect(onlyStatus(ck)).toBe("SKIP");
    expect(census).toBeNull();
  });
});

// --- (j) --------------------------------------------------------------------

describe("(j) severe-series provenance can fail", () => {
  it("registers exactly four checks and passes all of them on the baseline", () => {
    const ck = grade(checkSeSmoke);
    expect(ck.results.length).toBe(4);
    expect(ck.failureReport()).toBe("");
  });

  it("goes red at 455 slices — the incident this gate was written for", () => {
    const ck = grade(checkSeSmoke, {
      manifestPatch: (m) => {
        (m["smoke_field"] as Record<string, unknown>)["hours"] = 455;
      },
    });
    expect(statusOf(ck, `severe series length is ${SEVERE_SERIES_HOURS} h`)).toBe("FAIL");
  });

  it("goes red when the run read past the end of its field", () => {
    const ck = grade(checkSeSmoke, {
      manifestPatch: (m) => {
        (m["smoke_field"] as Record<string, unknown>)["out_of_range_lookups"] = 1;
      },
    });
    expect(statusOf(ck, "out_of_range_lookups == 0")).toBe("FAIL");
  });

  it("goes red when smokeScale never reached the field", () => {
    const ck = grade(checkSeSmoke, {
      manifestPatch: (m) => {
        const p = (m["reproducibility"] as Record<string, unknown>)["parameters"] as Record<
          string,
          unknown
        >;
        p["smokeScale"] = 0.61;
      },
    });
    expect(statusOf(ck, "x smokeScale")).toBe("FAIL");
  });

  it("accepts a scale that DID reach the field, so the check is not just 'peak changed'", () => {
    const ck = grade(checkSeSmoke, {
      manifestPatch: (m) => {
        const p = (m["reproducibility"] as Record<string, unknown>)["parameters"] as Record<
          string,
          unknown
        >;
        p["smokeScale"] = 0.61;
        // 2496.10 x 0.61 = 1522.621; the manifest prints %.1f.
        (m["smoke_field"] as Record<string, unknown>)["peak_hourly_ugm3"] = 1522.6;
      },
    });
    expect(statusOf(ck, "x smokeScale")).toBe("PASS");
  });

  it("holds the print slack at 0.06 — 0.05 passes, 0.07 fails", () => {
    const at = (delta: number): string => {
      const ck = grade(checkSeSmoke, {
        manifestPatch: (m) => {
          (m["smoke_field"] as Record<string, unknown>)["peak_hourly_ugm3"] =
            FIXTURE_FIELD_PEAK + delta;
        },
      });
      return statusOf(ck, "x smokeScale");
    };
    expect(PEAK_PRINT_SLACK).toBe(0.06);
    expect(at(0.05)).toBe("PASS");
    expect(at(0.07)).toBe("FAIL");
  });

  it("goes red when the manifest stops checksumming the series it read", () => {
    const ck = grade(checkSeSmoke, {
      manifestPatch: (m) => {
        (m["reproducibility"] as Record<string, unknown>)["input_datasets"] = [
          { file: "data/Streets.shp", sha256: "0".repeat(64) },
        ];
      },
    });
    expect(statusOf(ck, "manifest checksums the severe series")).toBe("FAIL");
  });

  it("goes red — not vacuously green — when smoke_field keys are absent", () => {
    // The −1 / NaN sentinels. `.get(key, 0)` would have made all three pass.
    const ck = grade(checkSeSmoke, {
      manifestPatch: (m) => {
        m["smoke_field"] = {};
      },
    });
    expect(statusOf(ck, `severe series length is ${SEVERE_SERIES_HOURS} h`)).toBe("FAIL");
    expect(statusOf(ck, "x smokeScale")).toBe("FAIL");
    expect(statusOf(ck, "out_of_range_lookups == 0")).toBe("FAIL");
  });

  it("SKIPs for an observed-series run rather than passing four vacuous checks", () => {
    const ck = grade(checkSeSmoke, {
      manifestPatch: (m) => {
        const p = (m["reproducibility"] as Record<string, unknown>)["parameters"] as Record<
          string,
          unknown
        >;
        p["smokeSeriesCode"] = 0;
      },
    });
    expect(onlyStatus(ck)).toBe("SKIP");
  });

  it("carries the registered series table unchanged", () => {
    // These are properties of two committed CSV files, not thresholds. Editing
    // one would make the gate agree with a series that does not exist.
    expect(SEVERE_SERIES.get(1)).toEqual({
      file: "data/airnow/aqs_hourly_pm25_synthetic_severe_v1.csv",
      unscaledPeak: 984.75,
    });
    expect(SEVERE_SERIES.get(2)).toEqual({
      file: "data/airnow/aqs_hourly_pm25_synthetic_severe_v2.csv",
      unscaledPeak: 2496.1,
    });
  });
});

// --- verify_2026 ------------------------------------------------------------

describe("verify_2026 cross-run invariants can fail", () => {
  const graded = (docs = threeArmSet()): Checks => {
    const ck = new Checks();
    checkVerify2026(ck, threeArmRuns(docs));
    return ck;
  };

  it("is green on a conformant synthetic A/B/C x 2-seed set", () => {
    const ck = graded();
    expect(ck.failureReport()).toBe("");
    // 6 runs x 8 per-run + 3 tags + 1 integrity + 2 seeds x 2 digests + 6 pooled.
    expect(ck.results.length).toBe(6 * 8 + 3 + 1 + 4 + 6);
  });

  it("goes red when an arm's capacity sum drifts from its designed value", () => {
    const docs = threeArmSet();
    const target = docs.find((d) => d.arm === "A" && d.seed === 42) as (typeof docs)[number];
    target.sheltersCsv = target.sheltersCsv.replace(
      `,${Math.floor(EXPECTED_CAP["A"] as number) / 2}`,
      `,${Math.floor((EXPECTED_CAP["A"] as number) / 2) + 5}`,
    );
    const ck = graded(docs);
    expect(statusOf(ck, "[A-seed42] shelter capacity sum")).toBe("FAIL");
  });

  it("goes red when data_version_tag drifts WITHIN an arm", () => {
    const docs = threeArmSet();
    const target = docs.find((d) => d.arm === "B" && d.seed === 43) as (typeof docs)[number];
    target.simulationJson = target.simulationJson.replace("bbbbbbbbbbbb", "0000bbbbbbbb");
    const ck = graded(docs);
    expect(statusOf(ck, "arm B: data_version_tag identical across seeds")).toBe("FAIL");
    expect(statusOf(ck, "arm A: data_version_tag identical across seeds")).toBe("PASS");
  });

  it("stays green when data_version_tag differs BETWEEN arms — that is by design", () => {
    // Pinned in the opposite direction, because a port that "simplified" this
    // to one global tag would fail all 27 correct archived runs.
    const ck = graded();
    expect(statusOf(ck, "arm A: data_version_tag identical across seeds")).toBe("PASS");
    expect(statusOf(ck, "arm B: data_version_tag identical across seeds")).toBe("PASS");
    expect(statusOf(ck, "arm C: data_version_tag identical across seeds")).toBe("PASS");
  });

  it("goes red when one run was built from different source", () => {
    const docs = threeArmSet();
    const target = docs.find((d) => d.arm === "C" && d.seed === 42) as (typeof docs)[number];
    target.simulationJson = target.simulationJson.replace("2".repeat(64), "3".repeat(64));
    const ck = graded(docs);
    expect(statusOf(ck, "source_integrity checksum set identical across all runs")).toBe("FAIL");
  });

  it("goes red when the population is not identical across arms within a seed", () => {
    const docs = threeArmSet();
    const target = docs.find((d) => d.arm === "B" && d.seed === 42) as (typeof docs)[number];
    const lines = target.agentsCsv.split("\r\n");
    const row = (lines[1] as string).split(",");
    row[4] = String(Number(row[4]) + 1); // age_years
    lines[1] = row.join(",");
    target.agentsCsv = lines.join("\r\n");
    const ck = graded(docs);
    expect(statusOf(ck, "seed 42: population identical across arms")).toBe("FAIL");
    expect(statusOf(ck, "seed 43: population identical across arms")).toBe("PASS");
    expect(statusOf(ck, "seed 42: UNREACHABLE id set identical across arms")).toBe("PASS");
  });

  it("goes red when the UNREACHABLE id set differs across arms (U-27)", () => {
    const docs = threeArmSet();
    const target = docs.find((d) => d.arm === "C" && d.seed === 43) as (typeof docs)[number];
    target.agentsCsv = target.agentsCsv.replace(",UNREACHABLE", ",REFUSED_ALL_FULL");
    const ck = graded(docs);
    expect(statusOf(ck, "seed 43: UNREACHABLE id set identical across arms")).toBe("FAIL");
    expect(statusOf(ck, "seed 43: population identical across arms")).toBe("PASS");
  });

  it("goes red on a wrong seed, a wrong scenarioCode and a dirty tree", () => {
    for (const [needle, edit] of [
      [
        "[A-seed42] manifest random_seed == directory seed",
        (s: string) => s.replace('"random_seed":42', '"random_seed":43'),
      ],
      [
        "[A-seed42] scenarioCode == arm code",
        (s: string) => s.replace('"scenarioCode":0', '"scenarioCode":9'),
      ],
      [
        "[A-seed42] git_working_tree_dirty is False",
        (s: string) => s.replace('"git_working_tree_dirty":false', '"git_working_tree_dirty":true'),
      ],
      [
        "[A-seed42] numAgents == 6842",
        (s: string) => s.replace('"numAgents":6842', '"numAgents":6841'),
      ],
    ] as const) {
      const docs = threeArmSet();
      const target = docs.find((d) => d.arm === "A" && d.seed === 42) as (typeof docs)[number];
      const before = target.simulationJson;
      target.simulationJson = edit(before);
      expect(target.simulationJson, needle).not.toBe(before);
      expect(statusOf(graded(docs), needle), needle).toBe("FAIL");
    }
  });

  it("goes red when agents.csv loses a row", () => {
    const docs = threeArmSet();
    const target = docs.find((d) => d.arm === "A" && d.seed === 42) as (typeof docs)[number];
    const lines = target.agentsCsv.split("\r\n");
    lines.splice(1, 1);
    target.agentsCsv = lines.join("\r\n");
    const ck = graded(docs);
    expect(statusOf(ck, "[A-seed42] agents.csv holds exactly 6842 rows")).toBe("FAIL");
  });

  it("goes red when a mechanism links asthma to shelter access (U-19)", () => {
    const docs = threeArmSet();
    const target = docs.find((d) => d.arm === "A" && d.seed === 42) as (typeof docs)[number];
    const lines = target.agentsCsv.split("\r\n");
    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i] as string;
      if (line === "") continue;
      const row = line.split(",");
      if (row[7] === "1" && row[11] === "SHELTERED") {
        row[11] = "REFUSED_ALL_FULL";
        lines[i] = row.join(",");
      }
    }
    target.agentsCsv = lines.join("\r\n");
    const ck = graded(docs);
    expect(statusOf(ck, "[A-seed42] asthma negative control within 3 SE")).toBe("FAIL");
    expect(statusOf(ck, "arm A pooled asthma_flag: negative control within 2 SE")).toBe("FAIL");
    expect(statusOf(ck, "[A-seed43] asthma negative control within 3 SE")).toBe("PASS");
  });

  it("computes the two digests over the right things", () => {
    // Positive control on the digest functions themselves: same seed, different
    // arm -> equal; different seed -> different.
    const a42 = threeArmRuns([threeArmDocs("A", 42)])[0]?.run as RunView;
    const b42 = threeArmRuns([threeArmDocs("B", 42)])[0]?.run as RunView;
    const a43 = threeArmRuns([threeArmDocs("A", 43)])[0]?.run as RunView;
    expect(populationColumnSha256(a42)).toBe(populationColumnSha256(b42));
    expect(populationColumnSha256(a42)).not.toBe(populationColumnSha256(a43));
    expect(unreachableIdSetSha256(a42)).toBe(unreachableIdSetSha256(b42));
    expect(ARM_CODE).toEqual({ A: 0, B: 1, C: 2 });
  });
});

// --- analyze_run ------------------------------------------------------------

describe("analyze_run recomputation can fail", () => {
  it("goes red on each recomputed exposure statistic independently", () => {
    for (const key of ["mean", "median", "min", "p25", "p75", "p90", "max", "total", "gini"]) {
      const ck = grade(checkAnalyzeRun, {
        manifestPatch: (m) => {
          const exp = (m["population"] as Record<string, unknown>)["exposure_ugm3h"] as Record<
            string,
            number
          >;
          // Well outside max(atol, 1e-3 x magnitude) for every one of them.
          exp[key] = (exp[key] as number) * 1.5 + 1;
        },
      });
      expect(statusOf(ck, `exposure ${key} recomputed`), key).toBe("FAIL");
    }
  });

  it("goes red on each recomputed travel statistic independently", () => {
    for (const key of ["mean", "median", "max"]) {
      const ck = grade(checkAnalyzeRun, {
        manifestPatch: (m) => {
          const t = (m["population"] as Record<string, unknown>)["travel_m"] as Record<
            string,
            number
          >;
          t[key] = (t[key] as number) * 1.5 + 1;
        },
      });
      expect(statusOf(ck, `travel_m ${key} recomputed`), key).toBe("FAIL");
    }
  });

  it("goes red on a broken VWE identity and on a non-unit RR", () => {
    const vwe = grade(checkAnalyzeRun, {
      agentPatches: [{ row: 0, column: "vwe_ugm3h", value: "5000.0010" }],
    });
    expect(statusOf(vwe, "VWE == exposure row-by-row")).toBe("FAIL");

    const rr = grade(checkAnalyzeRun, {
      agentPatches: [{ row: 0, column: "comorbidity_rr", value: "1.100" }],
    });
    expect(statusOf(rr, "all RR placeholders == 1.0")).toBe("FAIL");
  });

  it("holds the VWE identity to 1e-6, not to 'close enough'", () => {
    // Row 20's dose is 1000 + (20 % 8) x 50 = 1200.0000 exactly.
    const dose = Number(wp9Fixture().agents.column("cumulative_dose_ugm3h")[20]);
    expect(dose).toBe(1200);
    const at = (delta: number): string => {
      const ck = grade(checkAnalyzeRun, {
        agentPatches: [{ row: 20, column: "vwe_ugm3h", value: String(dose + delta) }],
      });
      return statusOf(ck, "VWE == exposure row-by-row");
    };
    expect(at(5e-8)).toBe("PASS");
    expect(at(2e-6)).toBe("FAIL");
  });

  it("goes red on a broken travel-time identity, at 0.05 min", () => {
    const inside = grade(checkAnalyzeRun, {
      agentPatches: [{ row: 20, column: "travel_time_min", value: "10.04" }],
    });
    expect(statusOf(inside, "(arrived - started)")).toBe("PASS");
    const outside = grade(checkAnalyzeRun, {
      agentPatches: [{ row: 20, column: "travel_time_min", value: "10.06" }],
    });
    expect(statusOf(outside, "(arrived - started)")).toBe("FAIL");
  });

  it("goes red on both PM2.5 bounds, independently", () => {
    const overField = grade(checkAnalyzeRun, {
      agentPatches: [{ row: 0, column: "peak_pm25_ugm3", value: String(FIXTURE_FIELD_PEAK + 1) }],
    });
    expect(statusOf(overField, "per-agent peak PM2.5 <= smoke-field peak")).toBe("FAIL");
    expect(statusOf(overField, "per-agent avg PM2.5 <= peak PM2.5")).toBe("PASS");

    const overPeak = grade(checkAnalyzeRun, {
      agentPatches: [{ row: 0, column: "avg_pm25_ugm3", value: "999.00" }],
    });
    expect(statusOf(overPeak, "per-agent avg PM2.5 <= peak PM2.5")).toBe("FAIL");
    expect(statusOf(overPeak, "per-agent peak PM2.5 <= smoke-field peak")).toBe("PASS");
  });

  it("goes red when a detour exceeds 200 m, and not at 199 m (A-17)", () => {
    const at = (surplus: number): string => {
      const ck = grade(checkAnalyzeRun, {
        agentPatches: [
          { row: 20, column: "total_travel_distance_m", value: (610 + surplus).toFixed(2) },
        ],
      });
      return statusOf(ck, "(A-17)");
    };
    expect(DETOUR_FLAG_M).toBe(200);
    expect(at(199)).toBe("PASS");
    expect(at(201)).toBe("FAIL");
  });

  it("falls back to network_dist_to_shelter_m when the A-17 columns are absent", () => {
    const ck = grade(checkAnalyzeRun, { dropAgentColumns: ["planned_route_m", "snap_gap_m"] });
    const hit = ck.results.find((c) => c.name.includes("(A-17)"));
    expect(hit?.detail).toContain("network_dist_to_shelter_m (single-leg fallback");
    // The fallback lacks the snap gap, so the baseline's 10 m snap now reads as
    // a 10 m surplus — still far inside 200 m, and the check still runs.
    expect(hit?.status).toBe("PASS");
  });

  it("goes red on a census mismatch, an identity-column drift and a lost shelter", () => {
    const censusCk = grade(checkAnalyzeRun, {
      manifestPatch: (m) => {
        (m["population"] as Record<string, unknown>)["sheltered"] = FIXTURE_SHELTERED + 1;
      },
    });
    expect(statusOf(censusCk, "census SHELTERED == manifest sheltered")).toBe("FAIL");

    const idCk = grade(checkAnalyzeRun, {
      agentPatches: [{ row: 0, column: "sim_id", value: "sim-other" }],
    });
    expect(statusOf(idCk, "sim_id constant and == manifest")).toBe("FAIL");

    const shelterCk = grade(checkAnalyzeRun, {
      manifestPatch: (m) => {
        (m["shelters"] as unknown[]).shift();
      },
    });
    expect(statusOf(shelterCk, "shelter S1: shelters.csv == simulation.json")).toBe("FAIL");
    expect(statusOf(shelterCk, "shelter S2: shelters.csv == simulation.json")).toBe("PASS");
  });

  it("goes red when the smoke field recorded an out-of-range lookup", () => {
    const ck = grade(checkAnalyzeRun, {
      manifestPatch: (m) => {
        (m["smoke_field"] as Record<string, unknown>)["out_of_range_lookups"] = 1;
      },
    });
    expect(statusOf(ck, "smoke field out_of_range_lookups == 0")).toBe("FAIL");
  });
});

// --- the pandas semantics the gates are built on ----------------------------

describe("the pandas statistics the gates recompute", () => {
  it("skips NaN the way pandas does, with the two different empty cases", () => {
    expect(nanMean([1, Number.NaN, 3])).toBe(2);
    expect(nanSum([1, Number.NaN, 3])).toBe(4);
    // `.mean()` on an empty selection is NaN; `.sum()` is 0.0. Both matter.
    expect(nanMean([])).toBeNaN();
    expect(nanMean([Number.NaN])).toBeNaN();
    expect(nanSum([])).toBe(0);
    expect(nanSum([Number.NaN])).toBe(0);
  });

  it("interpolates percentiles linearly, matching numpy and OutcomeLogger.pct", () => {
    // idx = q(n-1); numpy's `linear` rule, which is what the Java writer uses.
    expect(pctl([1, 2, 3, 4], 50)).toBe(2.5);
    expect(pctl([1, 2, 3, 4], 25)).toBe(1.75);
    expect(pctl([1, 2, 3, 4], 90)).toBeCloseTo(3.7, 12);
    expect(pctl([Number.NaN, 5], 50)).toBe(5);
    expect(pctl([], 50)).toBeNaN();
  });

  it("computes Gini as mean-absolute-difference / (2 x mean)", () => {
    expect(gini([])).toBe(0);
    expect(gini([0, 0, 0])).toBe(0);
    expect(gini([5, 5, 5, 5])).toBe(0);
    // Maximally unequal 4-sample: (n-1)/n.
    expect(gini([0, 0, 0, 4])).toBeCloseTo(0.75, 12);
  });

  it("uses max(atol, rtol x magnitude) — NOT numpy's atol + rtol x b", () => {
    // The difference is six orders of magnitude at archive scale, and it is the
    // reason `atol = 0.51` is not the working tolerance on a 37,801 mean.
    expect(approx(37801.8764, 37831.8764)).toBe(true); // 30 < 37.8
    expect(approx(37801.8764, 37841.8764)).toBe(false); // 40 > 37.8
    // At small magnitudes atol governs instead.
    expect(approx(1.0, 1.4)).toBe(true);
    expect(approx(1.0, 1.6)).toBe(false);
    expect(approx(null, 1)).toBe(false);
    expect(approx(1, undefined)).toBe(false);
  });
});
