/**
 * WP7 unit cover for `output/logger.ts` — the writer's own rules, checked
 * without touching an artefact so a clean clone still holds them.
 *
 * The three that have burned ports before, and are each asserted below:
 * the **empty-vs-zero comma discipline** (a disabled block is exactly 10 or 5
 * commas, never a fabricated default), the **`(long)` truncation** of tick
 * columns, and the fact that the two flavours differ only in *formatting* — the
 * numbers come from one state, so any divergence between them is a formatting
 * decision by construction.
 */

import { describe, expect, it } from "vitest";

import { Resident } from "../../src/agents/resident.js";
import {
  AGENTS_HEADER,
  SHELTERS_HEADER,
  SHELTERS_HEADER_V2,
  csvCell,
  gini,
  isVulnerable,
  jsonEsc,
  maxOf,
  minOf,
  pct,
  writeAgentsCsv,
  writeSheltersCsv,
  writeSimulationJson,
  type RunOutcome,
} from "../../src/output/logger.js";
import { Shelter } from "../../src/shelters/shelter.js";

function outcome(residents: readonly Resident[], shelters: readonly Shelter[]): RunOutcome {
  return {
    residents,
    shelters,
    seed: 42,
    minutesPerTick: 1,
    scenarioName: "A_present_day_reality",
    parameters: [
      { name: "numAgents", value: 6842, kind: "int" },
      { name: "minutesPerTick", value: 1, kind: "double" },
      { name: "alphaHazard", value: -8, kind: "double" },
    ],
    smokeCounty: "Multnomah",
    smokeStart: "2020-09-07T00:00",
    smokeHours: 576,
    smokePeakHourly: 562.7,
    outOfRangeLookups: 0,
    populationMarginals: null,
    decisionMarginals: null,
    env: {
      simId: "sim-test",
      commit: "abc",
      dataVersionTag: "tag",
      javaVersion: "n/a",
      repastVersion: "2.11.0",
      generatedTimestamp: "n/a",
      inputDatasets: [],
      sourceIntegrity: null,
    },
  };
}

function bareResident(): Resident {
  const r = new Resident({
    index: 0,
    name: "Site 0",
    encampmentId: "25-1",
    startLon: -122.5,
    startLat: 45.5,
    startNode: 0,
    attributes: null,
  });
  r.state = "REFUSED_ALL_FULL";
  r.evacuationTick = 960.9; // deliberately fractional: the column truncates
  r.exposureUgM3h = 54002.8192;
  r.vweUgM3h = 54002.8192;
  r.outdoorHours = 312;
  r.airVolumeBreathedM3 = 190.32;
  r.inhaledDoseUg = 32941.7197;
  r.peakConcUgM3 = 562.7;
  r.hoursAboveUnhealthy = 194;
  return r;
}

describe("agents.csv", () => {
  it("has exactly 59 columns and one row per resident", () => {
    expect(AGENTS_HEADER.split(",")).toHaveLength(59);
    const csv = writeAgentsCsv(outcome([bareResident()], []), "parity");
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.split(",")).toHaveLength(59);
  });

  it("emits exactly 10 commas for a disabled heterogeneity block and 5 for the E block", () => {
    const row = writeAgentsCsv(outcome([bareResident()], []), "parity").split("\r\n")[1]!;
    const cells = row.split(",");
    // Columns 34..44 (1-based) are the heterogeneity block; 50..55 the E block.
    expect(cells.slice(33, 44).every((c) => c === "")).toBe(true);
    expect(cells.slice(49, 55).every((c) => c === "")).toBe(true);
    // …and the Scenario-E counters are ALWAYS numeric, never empty.
    expect(cells.slice(55, 59)).toEqual(["0", "0", "0", "0"]);
  });

  it("truncates tick columns rather than rounding them", () => {
    const cells = writeAgentsCsv(outcome([bareResident()], []), "parity")
      .split("\r\n")[1]!
      .split(",");
    expect(cells[10]).toBe("960"); // time_started_tick, from 960.9
    expect(cells[12]).toBe(""); // time_arrived_tick: NaN renders empty, not 0
    expect(cells[13]).toBe(""); // time_arrived_local likewise
  });

  /**
   * The instrument's own misnomer, pinned so a future edit cannot quietly swap
   * the four exposure/dose fields into each other's columns.
   *
   * `GisAgent.java:55-66` names three deliberately distinct quantities —
   * exposure (`exposureUgM3h`, SUM C·dt), inhaled dose (`inhaledDoseUg`,
   * SUM C·IR·dt) and a susceptibility weight — and then
   * `OutcomeLogger.java:154` writes exposure into a column called
   * `cumulative_dose_ugm3h`. The column says "dose" and holds *exposure*; the
   * real dose is two columns further right in `inhaled_dose_ug`. The port keeps
   * the Java field names (so every line of `logger.ts` still greps back to its
   * source) and keeps the Java column names (so the bytes stay archive-
   * comparable), which means the misnomer is reproduced on purpose.
   *
   * Reproducing it on purpose is only safe if it is *pinned*: the four values
   * below are mutually distinguishable, so any transposition — the obvious
   * future defect, "fixing" the column by wiring `inhaledDoseUg` into it —
   * fails here instead of silently changing every archived comparison.
   */
  it("writes exposure (not dose) into cumulative_dose_ugm3h — the instrument's misnomer", () => {
    const r = bareResident();
    r.exposureUgM3h = 1111.1111;
    r.exposureWhileTravelingUgM3h = 2222.2222;
    r.vweUgM3h = 3333.3333;
    r.inhaledDoseUg = 4444.4444;

    const header = AGENTS_HEADER.split(",");
    const cells = writeAgentsCsv(outcome([r], []), "parity").split("\r\n")[1]!.split(",");
    const at = (col: string): string => cells[header.indexOf(col)]!;

    expect(at("cumulative_dose_ugm3h")).toBe("1111.1111");
    expect(at("exposure_while_traveling_ugm3h")).toBe("2222.2222");
    expect(at("vwe_ugm3h")).toBe("3333.3333");
    expect(at("inhaled_dose_ug")).toBe("4444.4444");
    // health_risk_score is dose x multiplier, and the multiplier is pinned 1.0,
    // so it tracks the DOSE column and not the misnamed one.
    expect(at("health_risk_score")).toBe("4444.4444");
    // The v2 flavour fixes the counter name but deliberately does NOT rename
    // this column: doing so would break archive-comparability for a quantity
    // whose meaning is already documented here.
    expect(AGENTS_HEADER).toContain("cumulative_dose_ugm3h");
  });

  it("uses CRLF in parity and LF in v2, and renames the misnamed column in v2", () => {
    const run = outcome([bareResident()], []);
    expect(writeAgentsCsv(run, "parity")).toContain("\r\n");
    expect(writeAgentsCsv(run, "v2-web").includes("\r")).toBe(false);
    expect(AGENTS_HEADER).toContain(",door_refusals,");
    expect(writeAgentsCsv(run, "v2-web").split("\n")[0]).toContain(",retarget_count,");
  });
});

describe("shelters.csv", () => {
  it("has 12 columns in parity and 13 in v2 (utilization split final/peak)", () => {
    expect(SHELTERS_HEADER.split(",")).toHaveLength(12);
    expect(SHELTERS_HEADER_V2.split(",")).toHaveLength(13);
  });

  it("utilization uses FINAL occupancy in parity, and v2 publishes both", () => {
    const s = new Shelter("S", "S", 4, true, -122.5, 45.5);
    s.admit(false);
    s.admit(false);
    s.admit(false); // peak 3
    const run = outcome([], [s]);
    const parity = writeSheltersCsv(run, "parity").split("\r\n")[1]!.split(",");
    expect(parity[6]).toBe("3"); // peak_occupancy
    expect(parity[7]).toBe("3"); // final_occupancy
    expect(parity[9]).toBe("0.7500"); // utilization, from FINAL
    const v2 = writeSheltersCsv(run, "v2-web").split("\n")[1]!.split(",");
    expect(v2[9]).toBe("0.7500"); // utilization_final
    expect(v2[10]).toBe("0.7500"); // utilization_peak
  });

  it("blank capacity means unlimited and renders as an empty utilization cell", () => {
    const s = new Shelter("S", "S", null, true, -122.5, 45.5);
    expect(s.admit(false)).toBe(true);
    const row = writeSheltersCsv(outcome([], [s]), "parity").split("\r\n")[1]!.split(",");
    expect(row[4]).toBe(""); // capacity
    expect(row[9]).toBe(""); // utilization
  });
});

describe("simulation.json", () => {
  it("renders int params bare and double params through Double.toString", () => {
    const json = writeSimulationJson(outcome([bareResident()], []), "parity");
    expect(json).toContain('"numAgents": 6842');
    expect(json).toContain('"minutesPerTick": 1.0');
    expect(json).toContain('"alphaHazard": -8.0');
  });

  it("is parseable in both flavours when the caller supplies no manifest blocks", () => {
    const run = outcome([bareResident()], [new Shelter("S", "S", 4, true, -122.5, 45.5)]);
    for (const flavour of ["parity", "v2-web"] as const) {
      expect(() => JSON.parse(writeSimulationJson(run, flavour))).not.toThrow();
    }
  });

  it("omits stratified_exposure when heterogeneity is off, exactly as Java does", () => {
    expect(writeSimulationJson(outcome([bareResident()], []), "parity")).not.toContain(
      "stratified_exposure",
    );
  });
});

describe("the statistics helpers reproduce OutcomeLogger's own quirks", () => {
  it("max initialises at 0, so an all-negative array reports 0", () => {
    expect(maxOf([-5, -2, -9])).toBe(0);
    expect(maxOf([])).toBe(0);
  });

  it("min initialises at +Infinity but returns 0 for an empty array", () => {
    expect(minOf([3, 1, 2])).toBe(1);
    expect(minOf([])).toBe(0);
  });

  it("percentile interpolates linearly at idx = p/100 * (n-1)", () => {
    expect(pct([0, 10], 50)).toBe(5);
    expect(pct([0, 1, 2, 3], 25)).toBeCloseTo(0.75, 12);
    expect(pct([], 50)).toBe(0);
  });

  it("gini is 0 for a constant vector and (n-1)/n at maximum inequality", () => {
    expect(gini([5, 5, 5, 5])).toBe(0);
    expect(gini([0, 0, 0, 4])).toBeCloseTo(3 / 4, 12);
    expect(gini([])).toBe(0);
    expect(gini([0, 0])).toBe(0); // mean 0 short-circuit
  });
});

describe("string helpers", () => {
  it("csv() replaces every comma with a space and never quotes", () => {
    expect(csvCell("a,b,c")).toBe("a b c");
    expect(csvCell(null)).toBe("");
  });

  it("jsonEsc escapes only backslash and quote — the documented incompleteness", () => {
    expect(jsonEsc('a"b\\c')).toBe('a\\"b\\\\c');
    expect(jsonEsc("line\nbreak")).toBe("line\nbreak");
  });

  it("isVulnerable is the D-3 union, including the chronic-physical term (U-07)", () => {
    const base = {
      ageYears: 30,
      ageBand: "18-44",
      sex: "MALE",
      mobilityLimited: false,
      mobilityCategory: "unimpaired",
      asthma: false,
      copd: false,
      chronicPhysical: false,
      walkingSpeedMps: 1.3,
    } as const;
    expect(isVulnerable(base)).toBe(false);
    expect(isVulnerable({ ...base, chronicPhysical: true })).toBe(true);
    expect(isVulnerable({ ...base, ageYears: 55 })).toBe(true);
    expect(isVulnerable({ ...base, ageYears: 54 })).toBe(false);
  });
});
