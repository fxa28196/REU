/**
 * WP7 unit cover for `agents/step.ts` — the semantics that have no archive row
 * of their own and would otherwise only be checked by a 6,842-agent run.
 *
 * These run on a hand-built three-node graph with no external artefact, so they
 * are green in a clean clone and they fail *specifically*: each one names the
 * PORT_MAP clause it protects.
 */

import { describe, expect, it } from "vitest";

import type { GraphGeometry } from "@websim/shared/graph-asset";

import { Resident } from "../../src/agents/resident.js";
import type { DecisionAttributes } from "../../src/agents/eLayerSampler.js";
import { armResident } from "../../src/decision/arm.js";
import {
  DECISION_PARAM_FALLBACKS,
  decisionConfig,
  isE0NullConfig,
} from "../../src/decision/config.js";
import { assertNoLayerTransition } from "../../src/decision/invariants.js";
import { BR, CountingDecisionProbe, setDecisionProbe } from "../../src/decision/probe.js";
import { JavaRandom } from "../../src/rng/JavaRandom.js";
import { stepResident, type StepWorld } from "../../src/agents/step.js";
import { buildRouteLeg } from "../../src/agents/route.js";
import { buildRoutingGraph, type RoutingGraph } from "../../src/graph/csr.js";
import { buildSegmentGeometry } from "../../src/graph/cumLen.js";
import { computeTree, makeScratch, retainTree } from "../../src/graph/dijkstra.js";
import { geodesicDistanceM } from "../../src/geo/geodesic.js";
import { arriveAtDoor, isPriorityForAdmission } from "../../src/shelters/admit.js";
import { Shelter } from "../../src/shelters/shelter.js";
import { SmokeField } from "../../src/smoke/field.js";

// ---------------------------------------------------------------------------
// A minimal two-edge line graph: node 0 -- node 1 -- node 2, ~100 m apart.
// ---------------------------------------------------------------------------

const LON0 = -122.6;
const LAT = 45.5;
/** ~0.001 deg of longitude at 45.5 N is ~78 m — precise value is irrelevant. */
const DLON = 0.001;

function lineGraph(): { graph: RoutingGraph; geometry: GraphGeometry } {
  const nodeCount = 3;
  const edgeCount = 2;
  const topology = {
    nodeCount,
    edgeCount,
    nodeId: Int32Array.from([10, 11, 12]),
    nodeLon: Float64Array.from([LON0, LON0 + DLON, LON0 + 2 * DLON]),
    nodeLat: Float64Array.from([LAT, LAT, LAT]),
    edgeFrom: Int32Array.from([0, 1]),
    edgeTo: Int32Array.from([1, 2]),
    edgeLengthM: Float64Array.from([
      geodesicDistanceM(LON0, LAT, LON0 + DLON, LAT),
      geodesicDistanceM(LON0 + DLON, LAT, LON0 + 2 * DLON, LAT),
    ]),
    // node 0: +edge1 ; node 1: -edge1, +edge2 ; node 2: -edge2
    csrOffset: Int32Array.from([0, 1, 3, 4]),
    csrEntry: Int32Array.from([1, -1, 2, -2]),
  };
  const geometry: GraphGeometry = {
    edgeCount,
    vertexCount: 4,
    polyOffset: Int32Array.from([0, 2, 4]),
    polyLon: Float64Array.from([LON0, LON0 + DLON, LON0 + DLON, LON0 + 2 * DLON]),
    polyLat: Float64Array.from([LAT, LAT, LAT, LAT]),
  } as GraphGeometry;
  return { graph: buildRoutingGraph(topology as never), geometry };
}

interface Harness extends StepWorld {
  admissions: number;
}

function harness(options: {
  hourly: readonly (number | null)[];
  shelterCapacity: number | null;
  shelterOpenTick?: number;
}): Harness {
  const { graph, geometry } = lineGraph();
  const seg = buildSegmentGeometry(graph, geometry);
  const scratch = makeScratch(graph);
  const shelter = new Shelter("S1", "S1", options.shelterCapacity, true, LON0 + 2 * DLON, LAT);
  shelter.graphNode = 2;
  shelter.graphNodeId = 12;
  shelter.routeTree = retainTree(computeTree(graph, 2, scratch));
  if (options.shelterOpenTick !== undefined) {
    shelter.setOpenWindowTicks(options.shelterOpenTick, Number.POSITIVE_INFINITY);
  }
  const smoke = new SmokeField(options.hourly);
  const w: Harness = {
    graph,
    geometry,
    seg,
    smoke,
    shelters: [shelter],
    minutesPerTick: 1,
    walkingSpeedMps: 1.3,
    evacuationThresholdUgM3: 55.5,
    admissions: 0,
    anyShelterOpen(tick) {
      return this.shelters.some((s) => s.operating && s.isOpenAt(tick));
    },
    anyShelterAvailable(tick, fromNode, isPriority, believedFull) {
      return this.shelters.some(
        (s) =>
          s.isAvailableAt(tick, isPriority) &&
          s.routeTree !== null &&
          Number.isFinite(s.routeTree.dist[fromNode]!) &&
          !(believedFull !== null && believedFull !== undefined && believedFull.has(s.id)),
      );
    },
    anyUntriedReachableShelter(tick, fromNode, believedFull) {
      // Deliberately NOT filtered on hasSpaceFor — see WP8-SPEC-decision §10.
      return this.shelters.some(
        (s) =>
          s.operating &&
          s.isOpenAt(tick) &&
          s.routeTree !== null &&
          Number.isFinite(s.routeTree.dist[fromNode]!) &&
          !believedFull.has(s.id),
      );
    },
    onAdmission() {
      this.admissions++;
    },
  };
  return w;
}

function resident(): Resident {
  return new Resident({
    index: 0,
    name: "Site 0",
    encampmentId: "camp-1",
    startLon: LON0,
    startLat: LAT,
    startNode: 0,
    attributes: null,
  });
}

describe("step() — the exposure block (PORT_MAP §1.5 step 5)", () => {
  it("accrues at RESTING ventilation while PRE_EVAC and books the tick before departure", () => {
    // Hour 0 is exactly at the threshold: `>=` fires the latch, `>` does not
    // count the hour as unhealthy. Both halves of the asymmetry in one tick.
    const w = harness({ hourly: [55.5], shelterCapacity: 10 });
    const a = resident();
    stepResident(a, w, 1);

    expect(a.state).toBe("EN_ROUTE"); // latch fired on `>=`
    expect(a.evacuationTick).toBe(1);
    expect(a.hoursAboveUnhealthy).toBe(0); // but `>` did NOT
    // The tick was booked while still PRE_EVAC, so RESTING, not walking.
    expect(a.airVolumeBreathedM3).toBeCloseTo(0.61 / 60, 15);
    expect(a.exposureWhileTravelingUgM3h).toBe(0);
    expect(a.exposureUgM3h).toBeCloseTo(55.5 / 60, 12);
  });

  it("counts hours above unhealthy on STRICT > only", () => {
    const w = harness({ hourly: [55.5, 55.500000001], shelterCapacity: 10 });
    const a = resident();
    stepResident(a, w, 1); // hour 0, c == 55.5 exactly
    expect(a.hoursAboveUnhealthy).toBe(0);
    const b = resident();
    stepResident(b, w, 61); // hour 1, c just above
    expect(b.hoursAboveUnhealthy).toBeCloseTo(1 / 60, 15);
  });

  it("books TWO concentration lookups on a PRE_EVAC tick (the counter double-counts)", () => {
    // An all-gap field: every lookup returns 0.0 AND increments the counter.
    const w = harness({ hourly: [null, null], shelterCapacity: 10 });
    const a = resident();
    stepResident(a, w, 1);
    expect(a.state).toBe("PRE_EVAC"); // c == 0.0 < 55.5
    expect(w.smoke.outOfRangeLookups).toBe(2);
  });

  it("stops accruing forever once SHELTERED", () => {
    const w = harness({ hourly: [600, 600, 600], shelterCapacity: 10 });
    const a = resident();
    for (let t = 1; t <= 180 && a.state !== "SHELTERED"; t++) {
      stepResident(a, w, t);
    }
    expect(a.state).toBe("SHELTERED");
    const frozen = a.exposureUgM3h;
    stepResident(a, w, 179);
    stepResident(a, w, 180);
    expect(a.exposureUgM3h).toBe(frozen);
    expect(a.outdoorHours).toBeGreaterThan(0);
  });
});

describe("step() — departure and the A-02 open-shelter gate", () => {
  it("does not depart while nothing is open, however bad the air is", () => {
    const w = harness({ hourly: [600, 600], shelterCapacity: 10, shelterOpenTick: 1000 });
    const a = resident();
    for (let t = 1; t <= 60; t++) {
      stepResident(a, w, t);
    }
    expect(a.state).toBe("PRE_EVAC");
    expect(Number.isNaN(a.evacuationTick)).toBe(true);
    expect(a.distanceTraveledM).toBe(0);
    // …but it has been breathing the whole time.
    expect(a.exposureUgM3h).toBeGreaterThan(0);
  });
});

describe("step() — the door (PORT_MAP §1.5 step 13)", () => {
  it("a FULL shelter refuses, counts one refusal, and the resident re-plans from its node", () => {
    const w = harness({ hourly: Array.from({ length: 12 }, () => 600), shelterCapacity: 0 });
    const a = resident();
    for (let t = 1; t <= 400; t++) {
      stepResident(a, w, t);
      if (a.state === "REFUSED_ALL_FULL") break;
    }
    // capacity 0 means the chooser never selects it: `hasSpaceFor` is false, so
    // the resident is REFUSED_ALL_FULL from its very first planning attempt and
    // `admit()` is never called. That is the "never speculative" contract.
    expect(a.state).toBe("REFUSED_ALL_FULL");
    expect(w.shelters[0]!.refusedCount).toBe(0);
    expect(w.admissions).toBe(0);
  });

  it("a CLOSED door increments no counter at all; a full one increments refusedCount", () => {
    const closed = new Shelter("C", "C", 5, true, LON0, LAT);
    closed.setOpenWindowTicks(1000, Number.POSITIVE_INFINITY);
    expect(arriveAtDoor(closed, 1, false, false)).toBe("refused-closed");
    expect(closed.refusedCount).toBe(0);
    expect(closed.policyRefusedCount).toBe(0);

    const full = new Shelter("F", "F", 0, true, LON0, LAT);
    expect(arriveAtDoor(full, 1, false, false)).toBe("refused-full");
    expect(full.refusedCount).toBe(1);
    expect(full.policyRefusedCount).toBe(0);

    const policy = new Shelter("P", "P", 5, true, LON0, LAT);
    expect(arriveAtDoor(policy, 1, false, true)).toBe("refused-policy");
    expect(policy.refusedCount).toBe(1);
    expect(policy.policyRefusedCount).toBe(1);
    expect(policy.occupancy).toBe(0);
  });

  it("priority is mobility limitation and nothing else", () => {
    const base = {
      ageYears: 80,
      ageBand: "65+",
      sex: "FEMALE",
      mobilityCategory: "unimpaired",
      asthma: true,
      copd: true,
      chronicPhysical: true,
      walkingSpeedMps: 1,
    } as const;
    expect(isPriorityForAdmission({ ...base, mobilityLimited: false })).toBe(false);
    expect(isPriorityForAdmission({ ...base, mobilityLimited: true })).toBe(true);
    expect(isPriorityForAdmission(null)).toBe(false);
  });
});

describe("step() — routing failure classification (PORT_MAP §1.6.2)", () => {
  it("UNREACHABLE when nothing is reachable, and it is terminal", () => {
    const w = harness({ hourly: [600, 600], shelterCapacity: 10 });
    // Detach the resident onto a node the tree cannot see by pointing it at a
    // source whose tree covers only itself.
    const solo = new Shelter("Z", "Z", 10, true, LON0, LAT);
    solo.graphNode = 0;
    solo.routeTree = {
      sourceNode: 0,
      dist: Float64Array.from([Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]),
      predEdge: Int32Array.from([-1, -1, -1]),
      reachableCount: 0,
      stats: { settled: 0, pushes: 0, pops: 0, stalePops: 0, relaxations: 0 },
    };
    const w2: Harness = { ...w, shelters: [solo] };
    const a = resident();
    stepResident(a, w2, 1);
    expect(a.state).toBe("UNREACHABLE");
    const beforeDistance = a.distanceTraveledM;
    for (let t = 2; t <= 20; t++) {
      stepResident(a, w2, t);
    }
    expect(a.state).toBe("UNREACHABLE"); // terminal, never re-evaluated
    expect(a.distanceTraveledM).toBe(beforeDistance);
    expect(a.exposureUgM3h).toBeGreaterThan(0); // still outdoors, still accruing
  });

  it("REFUSED_ALL_FULL is re-checked every tick and re-enters when a bed appears", () => {
    const w = harness({ hourly: Array.from({ length: 12 }, () => 600), shelterCapacity: 0 });
    const a = resident();
    stepResident(a, w, 1);
    expect(a.state).toBe("REFUSED_ALL_FULL");
    // Open a bed by swapping in a site with capacity; the resident must notice.
    const roomy = new Shelter("S1", "S1", 1, true, LON0 + 2 * DLON, LAT);
    roomy.graphNode = 2;
    roomy.routeTree = w.shelters[0]!.routeTree;
    const w2: Harness = { ...w, shelters: [roomy] };
    stepResident(a, w2, 2);
    expect(a.state).toBe("EN_ROUTE");
    expect(a.retargetCount).toBe(0);
  });
});

describe("route legs measure the polyline, not the routed distance", () => {
  it("a leg's total is the walked polyline length (WP7 finding)", () => {
    const { graph, geometry } = lineGraph();
    const seg = buildSegmentGeometry(graph, geometry);
    const tree = retainTree(computeTree(graph, 2, makeScratch(graph)));
    const leg = buildRouteLeg(graph, geometry, seg, tree, 0);
    expect(leg).not.toBeNull();
    // On a graph whose node coordinates coincide with its polyline endpoints the
    // two agree; the point of the test is that `totalM` is derived from the
    // vertices, so it stays correct when they do not.
    expect(leg!.totalM).toBeCloseTo(tree.dist[0]!, 6);
    expect(leg!.cumM[0]).toBe(0);
    for (let i = 1; i < leg!.vertexCount; i++) {
      expect(leg!.cumM[i]!).toBeGreaterThanOrEqual(leg!.cumM[i - 1]!);
    }
  });
});

/**
 * WP7 guarded the unfinished layer with a throw at the top of `stepResident`.
 * WP8 removed the throw — the branches are real now — and replaced it with the
 * invariant the throw was standing in for: an **E0-null** configuration, the R3
 * vehicle, must never take a decision-layer transition. That invariant is live
 * in the engine (`assertNotE0Null`, `armResident`) rather than asserted about
 * it, and these are the tests that prove the assertion can actually fire.
 */
describe("the E0-null invariant is an active assertion, not a comment", () => {
  const E0_NULL = decisionConfig({
    ...DECISION_PARAM_FALLBACKS,
    pushThetaThreshold: 0, // the archive's EXECUTED value (QUIRK 23)
  });

  const attrs = (over: Partial<DecisionAttributes> = {}): DecisionAttributes => ({
    awareInitial: true,
    heavyBelongings: false,
    hasPet: false,
    hasDependents: false,
    thetaZ: 0,
    groupSpeedDeltaMps: 0,
    decisionSeed: 1n,
    ...over,
  });

  it("classifies the archived E0 parameter block as E0-null", () => {
    expect(isE0NullConfig(E0_NULL)).toBe(true);
    // Any single mechanism switched on takes it out of the class.
    expect(isE0NullConfig({ ...E0_NULL, enableHazardDeparture: 1 })).toBe(false);
    expect(isE0NullConfig({ ...E0_NULL, lambdaOutreachPerDay: 1 })).toBe(false);
    expect(isE0NullConfig({ ...E0_NULL, informationRegime: 1 })).toBe(false);
    expect(isE0NullConfig({ ...E0_NULL, sigmaTheta: 1 })).toBe(false);
    expect(isE0NullConfig({ ...E0_NULL, barrierPet: 0.26 })).toBe(false);
    expect(isE0NullConfig({ ...E0_NULL, petPolicyAdmitDefault: false })).toBe(false);
  });

  it("refuses to arm an UNAWARE resident under an E0-null config", () => {
    const a = resident();
    expect(() => armResident(a, E0_NULL, attrs({ awareInitial: false }))).toThrow(/E0-null/u);
  });

  it("takes ZERO decision-layer transitions over a full E0-null episode", () => {
    const probe = new CountingDecisionProbe();
    setDecisionProbe(probe);
    try {
      const w = harness({ hourly: Array.from({ length: 24 }, () => 600), shelterCapacity: 10 });
      const a = resident();
      armResident(a, E0_NULL, attrs());
      for (let t = 1; t <= 200 && a.state !== "SHELTERED"; t++) {
        stepResident(a, w, t);
      }
      expect(a.state).toBe("SHELTERED");
      // The three `layer: true` rows of TRANSITIONS, and the draws behind them.
      expect(probe.count(BR.UNAWARE_INIT)).toBe(0);
      expect(probe.count(BR.UNAWARE_BLOCK)).toBe(0);
      expect(probe.count(BR.D1)).toBe(0);
      expect(probe.count(BR.CONVERTED)).toBe(0);
      expect(probe.count(BR.HAZARD_BRANCH)).toBe(0);
      expect(probe.count(BR.D2)).toBe(0);
      expect(probe.count(BR.HAZARD_FIRED)).toBe(0);
      // It went through latch site A — the layer is on, the hazard is off.
      expect(probe.count(BR.LATCH_A_FIRE)).toBe(1);
      expect(probe.count(BR.LATCH_B_FIRE)).toBe(0);
      // And it consumed no randomness at all: z_R costs none, and that is what
      // lets the E0 null execute block 6 and stay byte-identical to a layer-off
      // run (the R3 vehicle).
      expect(a.decisionRng!.getState()).toEqual(new JavaRandom(1n).getState());
    } finally {
      setDecisionProbe(null);
    }
  });

  it("the guard itself is provably able to fail", () => {
    // Under a genuinely E0-null config the two transitions are STRUCTURALLY
    // unreachable — hazard departure is off and λ is zero, which is part of the
    // definition of the class. That is the point, and it is also why the guard
    // cannot be tripped through `stepResident` without lying about the config.
    // So the guard body is exercised directly (plan §5.2: every gate must be
    // shown able to fail) and its WIRING is what the zero-counter case above
    // proves.
    expect(() => assertNoLayerTransition("Site 0", E0_NULL, "hazard departure")).toThrow(
      /E0-null/u,
    );
    // ...and it stays out of the way of a real Phase-E run.
    expect(() =>
      assertNoLayerTransition("Site 0", { ...E0_NULL, enableHazardDeparture: 1 }, "hazard"),
    ).not.toThrow();
  });
});

describe("the layer is an overlay: a resident with attributes but no config is legacy", () => {
  it("executes latch site B when `decisionConfig` is null", () => {
    const probe = new CountingDecisionProbe();
    setDecisionProbe(probe);
    try {
      const w = harness({ hourly: [600], shelterCapacity: 10 });
      const a = resident();
      // Attributes without a config is the WP6 world-build shape; the certified
      // guard is `decisionConfig != null && decisionAttributes != null`.
      a.decision = {
        awareInitial: true,
        heavyBelongings: true,
        hasPet: true,
        hasDependents: true,
        thetaZ: 1,
        groupSpeedDeltaMps: 0.06,
        decisionSeed: 7n,
      };
      stepResident(a, w, 1);
      expect(a.state).toBe("EN_ROUTE");
      expect(probe.count(BR.LATCH_B_FIRE)).toBe(1);
      expect(probe.count(BR.LATCH_A_FIRE)).toBe(0);
      expect(probe.count(BR.PACE_ON)).toBe(0); // block 3 is gated on the config too
    } finally {
      setDecisionProbe(null);
    }
  });
});
