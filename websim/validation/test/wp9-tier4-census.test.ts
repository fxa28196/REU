/**
 * wp9-tier4-census.test.ts — the Tier-4 census and its attribution, corroded.
 *
 * `tier4-attribution.test.ts` measures the real arm-A divergence against the
 * real archive; it needs the packed graph, a 30-second run and the 375 MB
 * oracle, and it skips loudly in a clean clone. That file proves the *finding*.
 * This one proves the *instrument*, on synthetic frames small enough to reason
 * about by hand, and it runs everywhere.
 *
 * The distinction matters because of the failure this project keeps
 * re-learning: an attribution that returns `ORDER-CHANNEL` for every input is
 * indistinguishable from a correct one as long as the port happens to be right.
 * Each case below takes a run that IS the ordering channel and breaks it in one
 * specific way, then requires the verdict to flip to `UNEXPLAINED` **and** the
 * reason to name the thing that was broken.
 *
 * The eight-resident world: 4 beds across 2 shelters, 8 residents, 4 sheltered
 * and 4 refused. Capacity binds — both sites are full and four residents were
 * turned away — which is the regime in which the shuffle channel can move an
 * outcome at all.
 */

import { describe, expect, it } from "vitest";

import { readFrame } from "../src/harness/frame.js";
import {
  attributeDivergence,
  bitMatchCensus,
  saturationFacts,
  TIER4_EXCLUDED,
} from "../src/harness/tier4-census.js";

// ---------------------------------------------------------------------------
// the fixture world
// ---------------------------------------------------------------------------

const AGENT_COLS = [
  "agent_id",
  "sim_id",
  "commit",
  "data_version",
  "final_state",
  "shelter_reached",
  "total_travel_distance_m",
  "door_refusals",
  "cumulative_dose_ugm3h",
] as const;

interface Agent {
  id: string;
  state: string;
  site: string;
  dist: string;
  doors: string;
  dose: string;
}

/** Four sheltered (two per site), four refused. */
function baseAgents(): Agent[] {
  return [
    { id: "a1", state: "SHELTERED", site: "S1", dist: "1000.0000", doors: "0", dose: "10.0000" },
    { id: "a2", state: "SHELTERED", site: "S1", dist: "1100.0000", doors: "0", dose: "11.0000" },
    { id: "a3", state: "SHELTERED", site: "S2", dist: "1200.0000", doors: "0", dose: "12.0000" },
    { id: "a4", state: "SHELTERED", site: "S2", dist: "1300.0000", doors: "0", dose: "13.0000" },
    { id: "a5", state: "REFUSED_ALL_FULL", site: "", dist: "1400.0000", doors: "1", dose: "14.0000" },
    { id: "a6", state: "REFUSED_ALL_FULL", site: "", dist: "1500.0000", doors: "1", dose: "15.0000" },
    { id: "a7", state: "REFUSED_ALL_FULL", site: "", dist: "1600.0000", doors: "1", dose: "16.0000" },
    { id: "a8", state: "REFUSED_ALL_FULL", site: "", dist: "1700.0000", doors: "1", dose: "17.0000" },
  ];
}

function agentsCsv(rows: readonly Agent[], simId = "sim-x"): string {
  const body = rows.map(
    (r) =>
      `${r.id},${simId},abc123,v1,${r.state},${r.site},${r.dist},${r.doors},${r.dose}`,
  );
  return `${[AGENT_COLS.join(","), ...body].join("\r\n")}\r\n`;
}

const SHELTER_COLS =
  "shelter_id,capacity,final_occupancy,refused_count,policy_refused,mean_travel_dist_m_admitted";

function sheltersCsv(
  means: readonly [string, string] = ["1050.00", "1250.00"],
  occupancy: readonly [number, number] = [2, 2],
  refused: readonly [number, number] = [2, 2],
): string {
  return (
    `${SHELTER_COLS}\r\n` +
    `S1,2,${occupancy[0]},${refused[0]},0,${means[0]}\r\n` +
    `S2,2,${occupancy[1]},${refused[1]},0,${means[1]}\r\n`
  );
}

function attribute(
  port: { agents: string; shelters: string },
  archive: { agents: string; shelters: string },
  runDir = "fixture/eight-residents",
): ReturnType<typeof attributeDivergence> {
  return attributeDivergence({
    runDir,
    portAgents: readFrame(port.agents, "port/agents.csv"),
    portShelters: readFrame(port.shelters, "port/shelters.csv"),
    archiveAgents: readFrame(archive.agents, "java/agents.csv"),
    archiveShelters: readFrame(archive.shelters, "java/shelters.csv"),
  });
}

const JAVA = { agents: agentsCsv(baseAgents(), "sim-java"), shelters: sheltersCsv() };

// ---------------------------------------------------------------------------

describe("Tier-4 bit-match census", () => {
  it("counts every compared cell and excludes only the declared identity columns", () => {
    const c = bitMatchCensus(
      "agents.csv",
      readFrame(agentsCsv(baseAgents(), "sim-ts"), "port"),
      readFrame(JAVA.agents, "java"),
      "agent_id",
    );
    expect(c.rows).toBe(8);
    // 9 columns, 3 excluded (sim_id, commit, data_version) -> 6 compared.
    expect(c.comparedColumns.length).toBe(6);
    expect([...c.excludedColumns].sort()).toEqual(["commit", "data_version", "sim_id"]);
    expect(Object.keys(TIER4_EXCLUDED).sort()).toEqual(["commit", "data_version", "sim_id"]);
    expect(c.comparedCells).toBe(48);
    expect(c.identicalCells).toBe(48);
    expect(c.rowsIdentical).toBe(8);
    expect(c.divergentColumns).toEqual([]);
  });

  it("never excludes the *_local outcome columns, whatever else it excludes", () => {
    // The certified script's most load-bearing comment: those are sim-clock
    // instants derived from the tick, i.e. outcomes, and are among the sharpest
    // identity evidence available. A future edit that adds them to the
    // exclusion list has to break this.
    const csv =
      "agent_id,time_started_local,time_arrived_local\r\na1,2020-09-07T01:00,2020-09-07T02:00\r\n";
    const c = bitMatchCensus("agents.csv", readFrame(csv, "p"), readFrame(csv, "j"), "agent_id");
    expect(c.comparedColumns).toContain("time_started_local");
    expect(c.comparedColumns).toContain("time_arrived_local");
    expect(c.excludedColumns).toEqual([]);
  });

  it("reports a differing cell as a divergent column rather than averaging it away", () => {
    const rows = baseAgents();
    rows[0]!.dist = "1000.0001";
    const c = bitMatchCensus(
      "agents.csv",
      readFrame(agentsCsv(rows), "port"),
      readFrame(JAVA.agents, "java"),
      "agent_id",
    );
    expect(c.identicalCells).toBe(47);
    expect(c.rowsIdentical).toBe(7);
    expect(c.divergentColumns.map((d) => d.column)).toEqual(["total_travel_distance_m"]);
  });
});

describe("saturation facts decide whether the channel could act at all", () => {
  it("capacity binds when a site filled AND someone was refused for capacity", () => {
    const f = saturationFacts(readFrame(JAVA.agents, "j"), readFrame(JAVA.shelters, "js"));
    expect(f.saturatedSites).toBe(2);
    expect(f.capacityRefusals).toBe(4);
    expect(f.refusedAllFull).toBe(4);
    expect(f.designedBeds).toBe(4);
    expect(f.capacityBinds).toBe(true);
  });

  it("does NOT bind when nothing filled — the ER/SE/SE2 regime", () => {
    const roomy = sheltersCsv(["1050.00", "1250.00"], [2, 2], [0, 0]).replace(
      /^S1,2,/mu,
      "S1,500,",
    );
    const f = saturationFacts(readFrame(JAVA.agents, "j"), readFrame(roomy, "js"));
    expect(f.capacityRefusals).toBe(0);
    expect(f.capacityBinds).toBe(false);
  });
});

describe("attribution: the divergence IS the ordering channel, or it is release-blocking", () => {
  it("EXACT when every compared cell is byte-identical", () => {
    const a = attribute({ agents: agentsCsv(baseAgents(), "sim-ts"), shelters: sheltersCsv() }, JAVA);
    expect(a.verdict).toBe("EXACT");
    expect(a.unexplained).toEqual([]);
    expect(a.order).toBeNull();
    expect(a.agents.identicalCells).toBe(a.agents.comparedCells);
    expect(a.partition.sameAssignment).toBe(8);
    expect(a.partition.neverRefused).toBe(4);
    expect(a.partition.neverRefusedDivergent).toBe(0);
    expect(a.partition.doorContested).toBe(4);
  });

  it("ORDER-CHANNEL for a balanced bed swap that leaves cardinality and distances alone", () => {
    // a4 loses its S2 bed to a5. Beds conserved, S2 still admits 2, and the
    // per-agent distances of everyone else are untouched.
    const rows = baseAgents();
    rows[3] = { ...rows[3]!, state: "REFUSED_ALL_FULL", site: "", doors: "1" };
    rows[4] = { ...rows[4]!, state: "SHELTERED", site: "S2", doors: "0" };
    const a = attribute(
      { agents: agentsCsv(rows, "sim-ts"), shelters: sheltersCsv(["1050.00", "1350.00"]) },
      JAVA,
    );
    expect(a.unexplained).toEqual([]);
    expect(a.verdict).toBe("ORDER-CHANNEL");
    expect(a.order?.balanced).toBe(true);
    expect(a.order?.shelteredLost).toBe(1);
    expect(a.order?.shelteredGained).toBe(1);
    expect(a.order?.nonShelterFlips).toBe(0);
    expect(a.order?.sitesWithDifferentAdmittedCount).toBe(0);
    // S1's set is unchanged and its mean is unchanged; S2's set changed and so
    // did its mean. That 2x2 is the "iff" the real attribution turns on.
    expect(a.order?.meanTravel).toEqual({
      sameSetSameCol: 1,
      sameSetDiffCol: 0,
      diffSetSameCol: 0,
      diffSetDiffCol: 1,
    });
    expect(a.partition.differentAssignment).toBe(2);
    expect(a.partition.neverRefusedDivergent).toBe(0);
    expect(a.partition.buildTimeColumnsDivergent).toEqual({});
  });

  it("UNEXPLAINED when a co-admitted resident's distance moves — the movement-defect case", () => {
    // The exact shape of a 10% step-length error: the resident reached the same
    // door in both runs, so nothing about who-got-the-bed can account for it.
    const rows = baseAgents();
    rows[0]!.dist = "1100.0000";
    const a = attribute({ agents: agentsCsv(rows, "sim-ts"), shelters: sheltersCsv() }, JAVA);
    expect(a.verdict).toBe("UNEXPLAINED");
    expect(a.partition.neverRefusedDivergent).toBe(1);
    expect(a.partition.neverRefusedDivergentColumns).toEqual({ total_travel_distance_m: 1 });
    expect(a.unexplained.join("\n")).toMatch(/refused at NO door in EITHER run/u);
    expect(a.unexplained.join("\n")).toMatch(/total_travel_distance_m×1/u);
    expect(a.order?.coAdmittedNeverRefusedDistanceTextDiffers).toBe(1);
  });

  it("a door-contested resident's changed journey is NOT a finding", () => {
    // The false-positive this partition exists to avoid. a5 was refused
    // somewhere in both runs and ends refused everywhere in both; the order
    // decided WHICH doors were full when they knocked, so their walk, their
    // dose and their refusal count are all legitimately different. A rule keyed
    // on "same final_state and same shelter_reached" would report this — and
    // 30-190 more like it per configuration — as a release-blocking defect.
    const rows = baseAgents();
    rows[4] = { ...rows[4]!, dist: "1450.0000", doors: "2", dose: "14.5000" };
    // …and the extra knock shows up in the site's own ledger, because it has to:
    // the door-ledger check below caught the first version of this fixture,
    // where it did not.
    const a = attribute(
      { agents: agentsCsv(rows, "sim-ts"), shelters: sheltersCsv(["1050.00", "1250.00"], [2, 2], [3, 2]) },
      JAVA,
    );
    expect(a.partition.sameAssignmentDivergent).toBe(1);
    expect(a.partition.neverRefusedDivergent).toBe(0);
    expect(a.partition.doorContestedDivergent).toBe(1);
    expect(a.unexplained).toEqual([]);
    expect(a.verdict).toBe("ORDER-CHANNEL");
  });

  it("UNEXPLAINED when a build-time column moves, whoever the resident is", () => {
    // A sampler / snapping / graph defect. It lands on a door-contested
    // resident, so partition 1 stays silent — the build-time column set is what
    // catches it, and it must, because nothing the shuffle does can reach a
    // value fixed before tick 1.
    const header = AGENT_COLS.join(",");
    const withAge = (rows: readonly Agent[], ages: readonly string[], simId: string): string =>
      `${[
        `${header},age_years`,
        ...rows.map(
          (r, i) => `${r.id},${simId},abc123,v1,${r.state},${r.site},${r.dist},${r.doors},${r.dose},${ages[i]}`,
        ),
      ].join("\r\n")}\r\n`;
    const ages = ["30", "31", "32", "33", "34", "35", "36", "37"];
    const moved = [...ages];
    moved[5] = "99";
    const a = attribute(
      { agents: withAge(baseAgents(), moved, "sim-ts"), shelters: sheltersCsv() },
      { agents: withAge(baseAgents(), ages, "sim-java"), shelters: sheltersCsv() },
    );
    expect(a.partition.buildTimeColumnsDivergent).toEqual({ age_years: 1 });
    expect(a.partition.neverRefusedDivergent).toBe(0);
    expect(a.verdict).toBe("UNEXPLAINED");
    expect(a.unexplained.join("\n")).toMatch(/world-build column\(s\) moved: age_years×1/u);
  });

  it("UNEXPLAINED when the flips are not balanced — beds appeared or vanished", () => {
    const rows = baseAgents();
    rows[3] = { ...rows[3]!, state: "REFUSED_ALL_FULL", site: "", doors: "1" };
    const a = attribute(
      { agents: agentsCsv(rows, "sim-ts"), shelters: sheltersCsv(["1050.00", "1200.00"], [2, 1]) },
      JAVA,
    );
    expect(a.verdict).toBe("UNEXPLAINED");
    expect(a.unexplained.join("\n")).toMatch(/not a balanced swap set: 1 lost \/ 0 gained/u);
    expect(a.unexplained.join("\n")).toMatch(/admitted a different\s+NUMBER of residents/u);
  });

  it("UNEXPLAINED when a swap lands on UNREACHABLE — balanced, and still not the channel", () => {
    // This case is why `balanced` is not sufficient on its own. a4 loses its
    // bed to a5, so the counts balance perfectly (1 lost, 1 gained, 0 flips
    // with SHELTERED on neither side) — but a4 comes out UNREACHABLE, which is
    // a graph property settled before any admission decision. Reordering
    // arrivals at a door cannot produce it. The weaker "one side is SHELTERED"
    // rule passes this; the transition-set rule catches it.
    const rows = baseAgents();
    rows[3] = { ...rows[3]!, state: "UNREACHABLE", site: "" };
    rows[4] = { ...rows[4]!, state: "SHELTERED", site: "S2", doors: "0" };
    const a = attribute(
      { agents: agentsCsv(rows, "sim-ts"), shelters: sheltersCsv(["1050.00", "1350.00"]) },
      JAVA,
    );
    expect(a.order?.balanced).toBe(true);
    expect(a.order?.nonShelterFlips).toBe(0);
    expect(a.order?.foreignTransitions).toEqual({ "SHELTERED->UNREACHABLE": 1 });
    expect(a.verdict).toBe("UNEXPLAINED");
    expect(a.unexplained.join("\n")).toMatch(/cannot produce: SHELTERED->UNREACHABLE×1/u);
  });

  it("records the transition histogram even when the verdict is ORDER-CHANNEL", () => {
    const rows = baseAgents();
    rows[3] = { ...rows[3]!, state: "REFUSED_ALL_FULL", site: "", doors: "1" };
    rows[4] = { ...rows[4]!, state: "SHELTERED", site: "S2", doors: "0" };
    const a = attribute(
      { agents: agentsCsv(rows, "sim-ts"), shelters: sheltersCsv(["1050.00", "1350.00"]) },
      JAVA,
    );
    expect(a.order?.transitions).toEqual({
      "SHELTERED->REFUSED_ALL_FULL": 1,
      "REFUSED_ALL_FULL->SHELTERED": 1,
    });
    expect(a.order?.foreignTransitions).toEqual({});
    expect(a.verdict).toBe("ORDER-CHANNEL");
  });

  it("UNEXPLAINED when a site's admitted set is identical but its mean travel moved", () => {
    // The sharp one: the column carrying an error of its own rather than a set
    // difference. Nothing else about the run changes.
    const a = attribute(
      { agents: agentsCsv(baseAgents(), "sim-ts"), shelters: sheltersCsv(["1050.01", "1250.00"]) },
      JAVA,
    );
    expect(a.verdict).toBe("UNEXPLAINED");
    expect(a.order?.meanTravel.sameSetDiffCol).toBe(1);
    expect(a.unexplained.join("\n")).toMatch(/identical admitted set but a different/u);
  });

  it("UNEXPLAINED when the door ledger stops closing on the port's side", () => {
    const a = attribute(
      {
        agents: agentsCsv(baseAgents(), "sim-ts"),
        shelters: sheltersCsv(["1050.00", "1250.00"], [2, 2], [2, 3]),
      },
      JAVA,
    );
    expect(a.verdict).toBe("UNEXPLAINED");
    expect(a.unexplained.join("\n")).toMatch(/port's door ledger does not close/u);
  });

  it("UNEXPLAINED when there is divergence but nothing ever saturated", () => {
    // No site full, no capacity refusal: the channel had nothing to act on, so
    // ANY divergence here is outside it — this is the caution made executable.
    const roomyShelters =
      `${SHELTER_COLS}\r\nS1,500,2,0,0,1050.00\r\nS2,500,2,0,0,1250.00\r\n`;
    const roomyAgents = baseAgents().map((r) =>
      r.state === "REFUSED_ALL_FULL" ? { ...r, state: "EN_ROUTE", doors: "0" } : r,
    );
    const portAgents = roomyAgents.map((r, i) => (i === 0 ? { ...r, dose: "10.0001" } : r));
    const a = attribute(
      { agents: agentsCsv(portAgents, "sim-ts"), shelters: roomyShelters },
      { agents: agentsCsv(roomyAgents, "sim-java"), shelters: roomyShelters },
    );
    expect(a.saturation.capacityBinds).toBe(false);
    expect(a.verdict).toBe("UNEXPLAINED");
    expect(a.unexplained.join("\n")).toMatch(/no binding capacity/u);
  });

  it("UNEXPLAINED when the two runs do not even describe the same residents", () => {
    const short = baseAgents().slice(0, 7);
    const a = attribute({ agents: agentsCsv(short, "sim-ts"), shelters: sheltersCsv() }, JAVA);
    expect(a.verdict).toBe("UNEXPLAINED");
    expect(a.unexplained.join("\n")).toMatch(/key sets differ/u);
  });
});

describe("the permutation envelope is applied only where it was sampled", () => {
  const flipped = (): string => {
    const rows = baseAgents();
    rows[3] = { ...rows[3]!, state: "REFUSED_ALL_FULL", site: "", doors: "1" };
    rows[4] = { ...rows[4]!, state: "SHELTERED", site: "S2", doors: "0" };
    return agentsCsv(rows, "sim-ts");
  };
  const census = {
    final_state_divergence: { streams: 200, min: 94, max: 144, observed: 114 },
  };

  it("declines to place an observation in a distribution sampled somewhere else", () => {
    const a = attributeDivergence({
      runDir: "fixture/eight-residents",
      portAgents: readFrame(flipped(), "p"),
      portShelters: readFrame(sheltersCsv(["1050.00", "1350.00"]), "ps"),
      archiveAgents: readFrame(JAVA.agents, "j"),
      archiveShelters: readFrame(JAVA.shelters, "js"),
      envelope: { census, sampledAt: "present-day-three-arm/A-seed42" },
    });
    expect(a.envelope.applicable).toBe(false);
    expect(a.envelope.reason).toMatch(/sampled at present-day-three-arm\/A-seed42/u);
    // Not applicable is not a failure — DR-WP7 forbids the placement, not the run.
    expect(a.verdict).toBe("ORDER-CHANNEL");
  });

  it("flags an observation outside the sampled support where the census DOES apply", () => {
    const a = attributeDivergence({
      runDir: "fixture/eight-residents",
      portAgents: readFrame(flipped(), "p"),
      portShelters: readFrame(sheltersCsv(["1050.00", "1350.00"]), "ps"),
      archiveAgents: readFrame(JAVA.agents, "j"),
      archiveShelters: readFrame(JAVA.shelters, "js"),
      envelope: { census, sampledAt: "fixture/eight-residents" },
    });
    // 2 flips against a support of [94, 144].
    expect(a.envelope.applicable).toBe(true);
    expect(a.envelope.inside).toBe(false);
    expect(a.verdict).toBe("UNEXPLAINED");
    expect(a.unexplained.join("\n")).toMatch(/OUTSIDE the sampled permutation support \[94, 144\]/u);
  });
});
