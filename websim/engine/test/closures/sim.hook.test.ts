/**
 * The FIRST_PRIORITY schedule hook in `Simulation.runUntil`, on a hand-built
 * world.
 *
 * Two things are being pinned, and only the first is obvious.
 *
 *  1. **A wave fires on its own tick, and BEFORE every agent's `step()`.**
 *     `ScheduleParameters.FIRST_PRIORITY` is what guarantees that every resident
 *     stepping on the wave tick observes the same post-wave world, whatever its
 *     shuffle position (PORT_MAP §1.2). A hook placed after the agent loop would
 *     be invisible in almost every run and catastrophic in the one where a
 *     resident is mid-street at the wave instant.
 *  2. **`closures === null` is structurally inert.** That is the R3
 *     closures-inert property in miniature: a run with `closuresCode = 0` builds
 *     no `ClosureRuntime` at all, so `hasClosureSchedule` is false, `routeNodes`
 *     is never allocated, `closureVersion()` is a constant 0 and step 10 of
 *     `stepResident` is unreachable rather than merely quiet. The full
 *     byte-identity claim belongs to the Tier-2 suite; what is checked here is
 *     the structural precondition it rests on.
 *
 * The world is synthetic on purpose: this is a *scheduling* test, and putting
 * the 88,100-node asset behind it would make an artifact gate the price of
 * asserting a loop order.
 */

import { describe, expect, it } from "vitest";

import { Simulation } from "../../src/sim.js";
import type { WorldBuildResult, WorldBuildConfig } from "../../src/world/build.js";
import { parseClosureSchedule, type ClosureSchedule } from "../../src/closures/schedule.js";
import { buildRoutingGraph, type RoutingGraph } from "../../src/graph/csr.js";
import { buildSegmentGeometry } from "../../src/graph/cumLen.js";
import { computeTree, makeScratch, retainTree } from "../../src/graph/dijkstra.js";
import { DegreeSpaceNodeIndex } from "../../src/graph/strtreeSnap.js";
import { StreamRegistry } from "../../src/rng/streams.js";
import { Shelter } from "../../src/shelters/shelter.js";
import { SmokeField } from "../../src/smoke/field.js";
import type { GraphGeometry } from "@websim/shared/graph-asset";
import type { CsvRow } from "../../src/loader/csv.js";

const LAT = 45.5;
const LON0 = -122.6;

/** Four nodes in a line: n0 — n1 — n2 — n3, 3 features, no parallel edges. */
function lineGraph(): { graph: RoutingGraph; geometry: GraphGeometry } {
  const lon = (i: number): number => LON0 + i * 0.001;
  const topology = {
    nodeCount: 4,
    edgeCount: 3,
    nodeId: Int32Array.from([10, 11, 12, 13]),
    nodeLon: Float64Array.from([lon(0), lon(1), lon(2), lon(3)]),
    nodeLat: Float64Array.from([LAT, LAT, LAT, LAT]),
    edgeFrom: Int32Array.from([0, 1, 2]),
    edgeTo: Int32Array.from([1, 2, 3]),
    edgeLengthM: Float64Array.from([78, 78, 78]),
    csrOffset: Int32Array.from([0, 1, 3, 5, 6]),
    csrEntry: Int32Array.from([1, -1, 2, -2, 3, -3]),
  };
  const geometry: GraphGeometry = {
    edgeCount: 3,
    vertexCount: 6,
    polyOffset: Int32Array.from([0, 2, 4, 6]),
    polyLon: Float64Array.from([lon(0), lon(1), lon(1), lon(2), lon(2), lon(3)]),
    polyLat: Float64Array.from([LAT, LAT, LAT, LAT, LAT, LAT]),
  } as GraphGeometry;
  return { graph: buildRoutingGraph(topology as never), geometry };
}

function scheduleAtHour(graph: RoutingGraph, hour: number): ClosureSchedule {
  const rows: CsvRow[] = [
    new Map([
      ["node_a", "11"],
      ["node_b", "12"],
      ["activation_hour", String(hour)],
      ["label", "TEST"],
      ["kind", "arterial"],
    ]),
  ];
  return parseClosureSchedule({
    rows,
    csvPath: "data/closures/test.csv",
    graph,
    ticksPerHour: 60,
    runEndHours: 24,
  });
}

function miniWorld(closures: ClosureSchedule | null): {
  world: WorldBuildResult;
  graph: RoutingGraph;
  geometry: GraphGeometry;
} {
  const { graph, geometry } = lineGraph();
  const scratch = makeScratch(graph);
  const shelter = new Shelter("S", "S", 100, true, graph.nodeLon[3]!, LAT);
  shelter.graphNode = 3;
  shelter.graphNodeId = graph.nodeId[3]!;
  shelter.routeTree = retainTree(computeTree(graph, 3, scratch));

  const config: WorldBuildConfig = {
    numAgents: 1,
    minutesPerTick: 1,
    simulationHours: 4,
    randomSeed: 42,
    scenarioCode: 1,
    enableHeterogeneity: 0,
    respectShelterOpeningDates: 0,
    triageReserveFraction: 0,
    enableDecisionLayer: 0,
    pAwareInit: 1,
    pHeavyBelongings: 0,
    pHasPet: 0,
    pHasDependents: 0,
    groupSpeedDeltaMps: 0,
    shelterPolicyVariant: 0,
    smokeSeriesCode: 0,
    closuresCode: closures === null ? 0 : 1,
    closureDraw: 1,
    // The 19 DecisionConfig coefficients at their batch fallbacks. The layer is
    // OFF in this world, so `buildWorld` would construct no config from them and
    // `Simulation` arms nobody; they are stated because the type requires every
    // parameter to be named rather than defaulted.
    lambdaOutreachPerDay: 0,
    informationRegime: 0,
    enableHazardDeparture: 0,
    sigmaTheta: 0,
    alphaHazard: -8,
    bRisk: 0.4,
    wOfficial: 1.1,
    gammaVuln: 0,
    riskHalfLifeH: 48,
    barrierBelongings: 0,
    barrierPet: 0,
    barrierDependents: 0,
    petPolicyDefault: 1,
    betaTravelTime: 1,
    betaCapacityPrior: 0,
    pushThetaThreshold: -0.25,
    kPush: 1,
    pStuck: 0.3,
    stuckDelayH: 3,
  };

  const world: WorldBuildResult = {
    config,
    scenario: {
      scenarioName: "test",
      sheltersCsv: "x",
      baseSheltersCsv: "x",
      fellThrough: false,
      reserveDriven: false,
      severeLabelWithoutSevereSeries: false,
    },
    shelters: [shelter],
    operatingShelters: 1,
    residents: [
      {
        index: 0,
        campIndex: 0,
        incId: "c0",
        startLon: graph.nodeLon[0]!,
        startLat: LAT,
        startNode: 0,
        startNodeId: graph.nodeId[0]!,
        buildSnapGapM: 0,
        attributes: null,
        decision: null,
      },
    ],
    // Layer off: build step 11 constructs nothing, so `Simulation` arms nobody
    // and this world exercises the legacy path, which is what these cases are
    // about.
    decisionConfig: null,
    camps: [],
    campRowsRead: 0,
    closures,
    ticksPerHour: 60,
    endHours: 4,
    endTick: 240,
    overrunsSmokeSeries: false,
    smokeCsv: "x",
    populationMarginals: null,
    decisionMarginals: null,
    streams: new StreamRegistry({ runSeed: 42 }),
    snapIndex: new DegreeSpaceNodeIndex(graph),
    warnings: [],
  };
  return { world, graph, geometry };
}

function simulationFor(closures: ClosureSchedule | null): Simulation {
  const { world, graph, geometry } = miniWorld(closures);
  return new Simulation({
    world,
    graph,
    geometry,
    seg: buildSegmentGeometry(graph, geometry),
    // A flat field well above the 55.5 threshold, so the legacy latch departs
    // the single resident on tick 1 and it is EN_ROUTE when the wave lands.
    smoke: new SmokeField(Array.from({ length: 6 }, () => 600)),
    walkingSpeedMps: 1.3,
    evacuationThresholdUgM3: 55.5,
    agentOrder: "identity",
  });
}

describe("Simulation — the FIRST_PRIORITY closure hook", () => {
  it("fires the wave on its own tick, and before the agent loop", () => {
    const { graph } = lineGraph();
    const sim = simulationFor(scheduleAtHour(graph, 2));
    expect(sim.hasClosureSchedule).toBe(true);
    expect(sim.closureVersion()).toBe(0);

    sim.runUntil(119);
    expect(sim.closureVersion(), "no wave before tick 120").toBe(0);
    expect(sim.isBlocked(11, 12)).toBe(false);

    sim.runUntil(120);
    expect(sim.closureVersion(), "the wave fires ON tick 120").toBe(1);
    expect(sim.isBlocked(11, 12)).toBe(true);
    expect(sim.closures!.waveReports.map((r) => r.tick)).toEqual([120]);
  });

  it("hands every fired wave to onClosureWave, in fire order", () => {
    const { world, graph, geometry } = miniWorld(scheduleAtHour(lineGraph().graph, 1));
    const fired: number[] = [];
    const sim = new Simulation({
      world,
      graph,
      geometry,
      seg: buildSegmentGeometry(graph, geometry),
      smoke: new SmokeField(Array.from({ length: 6 }, () => 600)),
      walkingSpeedMps: 1.3,
      evacuationThresholdUgM3: 55.5,
      agentOrder: "identity",
      onClosureWave: (r) => fired.push(r.tick),
    });
    sim.run();
    expect(fired).toEqual([60]);
    expect(sim.closures!.blockedEdgeCount).toBe(1);
  });

  it("the recompute is visible to the agents that step on the wave tick", () => {
    // The shelter's tree is REPLACED before any `step()` runs, so an agent that
    // plans on the wave tick plans over the reduced graph. n1-n2 is the only
    // route, so the resident at n0 becomes UNREACHABLE the moment it re-plans.
    const { graph } = lineGraph();
    const sim = simulationFor(scheduleAtHour(graph, 1));
    const before = sim.shelters[0]!.routeTree;
    sim.runUntil(60);
    expect(sim.shelters[0]!.routeTree).not.toBe(before);
    expect(sim.shelters[0]!.routeTree!.dist[0]).toBe(Number.POSITIVE_INFINITY);
  });

  it("closuresCode 0 builds no runtime at all — the R3 inert precondition", () => {
    const sim = simulationFor(null);
    expect(sim.closures).toBeNull();
    expect(sim.hasClosureSchedule).toBe(false);
    expect(sim.closureVersion()).toBe(0);
    expect(sim.isBlocked(11, 12)).toBe(false);
    sim.run();
    expect(sim.closureVersion()).toBe(0);
    // `routeNodes` is gated on `hasClosureSchedule`, so step 10 is unreachable.
    for (const r of sim.residents) {
      expect(r.routeNodes).toBeNull();
      expect(r.seenClosureVersion).toBe(0);
      expect([
        r.blockagesEncountered,
        r.pushThroughs,
        r.reroutes,
        r.stuckEvents,
      ]).toEqual([0, 0, 0, 0]);
      expect(Number.isNaN(r.stuckUntilTick)).toBe(true);
    }
  });

  it("a resident in a closures run carries routeNodes and a stamped version", () => {
    const { graph } = lineGraph();
    const sim = simulationFor(scheduleAtHour(graph, 3));
    sim.runUntil(2);
    const r = sim.residents[0]!;
    expect(r.state).toBe("EN_ROUTE");
    expect(r.routeNodes, "routeNodes is allocated when a schedule exists").not.toBeNull();
    expect(r.seenClosureVersion).toBe(0);
  });
});
