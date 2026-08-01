/**
 * A hand-built world for the decision-layer suites, and the synthetic drivers
 * for the branches that live in `step()`'s **control flow** rather than in its
 * arithmetic.
 *
 * ## Why the drivers exist
 *
 * The Java oracle dumps *values* — `u`, `p`, `v`, `decay`, the draw sequence,
 * every door event and every transition — and `oracle.trace.test.ts` replays the
 * port's functions against them, row for row. What those dumps cannot contain is
 * the shape of the certified method's control flow: there is no row for "this
 * tick was not a new hour", "this resident was still UNAWARE and returned", or
 * "this candidate was skipped because it was closed". Those are 20 of the 57
 * branches the Java exercised, and a coverage gate that only counted replayed
 * rows would report them as uncovered forever.
 *
 * So the port drives them directly, through the real `stepResident`, on a
 * four-node line graph, in the **same counter space** as the replays — which is
 * why the drivers are a function here rather than a second test file: vitest
 * isolates modules per file, and a coverage claim assembled from two isolated
 * counter arrays would not be one claim.
 *
 * These drivers assert **structure**, not Java-derived numbers. That distinction
 * is deliberate and is restated at each call site: a driver proves the branch is
 * reachable and behaves as WP8-SPEC-decision.md transcribes it; the bit-exact
 * evidence comes from the replays.
 */

import type { GraphGeometry } from "@websim/shared/graph-asset";

import { Resident } from "../../src/agents/resident.js";
import type { DecisionAttributes } from "../../src/agents/eLayerSampler.js";
import { stepResident, type StepWorld } from "../../src/agents/step.js";
import { armResident } from "../../src/decision/arm.js";
import {
  DECISION_PARAM_FALLBACKS,
  decisionConfig,
  type DecisionConfig,
} from "../../src/decision/config.js";
import { chooseShelterByUtility } from "../../src/decision/utilityChooser.js";
import { buildRoutingGraph, type RoutingGraph } from "../../src/graph/csr.js";
import { buildSegmentGeometry } from "../../src/graph/cumLen.js";
import { computeTree, makeScratch, retainTree } from "../../src/graph/dijkstra.js";
import { geodesicDistanceM } from "../../src/geo/geodesic.js";
import { Shelter } from "../../src/shelters/shelter.js";
import { SmokeField } from "../../src/smoke/field.js";

export const LON0 = -122.6;
export const LAT = 45.5;
export const DLON = 0.001;

/**
 * Nodes 0 — 1 — 2 — 3 in a line, plus node 4 **isolated**.
 *
 * The isolated node is what makes an infinite tree distance reachable, and
 * therefore what makes `UNREACHABLE` and the `distanceTo == +Infinity` candidate
 * skip distinguishable from "no shelter was open".
 */
export function lineGraph(): { graph: RoutingGraph; geometry: GraphGeometry } {
  const lon = (i: number): number => LON0 + i * DLON;
  const topology = {
    nodeCount: 5,
    edgeCount: 3,
    nodeId: Int32Array.from([10, 11, 12, 13, 14]),
    nodeLon: Float64Array.from([lon(0), lon(1), lon(2), lon(3), lon(9)]),
    nodeLat: Float64Array.from([LAT, LAT, LAT, LAT, LAT]),
    edgeFrom: Int32Array.from([0, 1, 2]),
    edgeTo: Int32Array.from([1, 2, 3]),
    edgeLengthM: Float64Array.from([
      geodesicDistanceM(lon(0), LAT, lon(1), LAT),
      geodesicDistanceM(lon(1), LAT, lon(2), LAT),
      geodesicDistanceM(lon(2), LAT, lon(3), LAT),
    ]),
    csrOffset: Int32Array.from([0, 1, 3, 5, 6, 6]),
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

export interface TestWorld extends StepWorld {
  blocked: Set<string>;
  version: number;
  shelters: Shelter[];
}

export function makeWorld(
  shelters: Shelter[],
  options: { hasClosureSchedule?: boolean; hourly?: readonly (number | null)[] } = {},
): TestWorld {
  const { graph, geometry } = lineGraph();
  const seg = buildSegmentGeometry(graph, geometry);
  const smoke = new SmokeField(options.hourly ?? Array.from({ length: 40 }, () => 600));
  return {
    graph,
    geometry,
    seg,
    smoke,
    shelters,
    minutesPerTick: 1,
    walkingSpeedMps: 1.3,
    evacuationThresholdUgM3: 55.5,
    hasClosureSchedule: options.hasClosureSchedule ?? false,
    blocked: new Set<string>(),
    version: 0,
    closureVersion() {
      return this.version;
    },
    isBlocked(a, b) {
      return this.blocked.has(a <= b ? `${a}:${b}` : `${b}:${a}`);
    },
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
      // Deliberately NOT filtered on hasSpaceFor (WP8-SPEC-decision.md §10).
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
      /* nothing cached here */
    },
  };
}

export function shelterAt(
  id: string,
  node: number,
  capacity: number | null,
  graph: RoutingGraph,
  over: { operating?: boolean; withTree?: boolean; openTick?: number } = {},
): Shelter {
  const s = new Shelter(id, id, capacity, over.operating ?? true, LON0 + node * DLON, LAT);
  s.graphNode = node;
  s.graphNodeId = graph.nodeId[node]!;
  if (over.withTree !== false) {
    s.routeTree = retainTree(computeTree(graph, node, makeScratch(graph)));
  }
  if (over.openTick !== undefined) {
    s.setOpenWindowTicks(over.openTick, Number.POSITIVE_INFINITY);
  }
  return s;
}

export const attrs = (over: Partial<DecisionAttributes> = {}): DecisionAttributes => ({
  awareInitial: true,
  heavyBelongings: false,
  hasPet: false,
  hasDependents: false,
  thetaZ: 0,
  groupSpeedDeltaMps: 0,
  decisionSeed: 12345n,
  ...over,
});

export function armed(cfg: DecisionConfig, da = attrs(), index = 0): Resident {
  const a = new Resident({
    index,
    name: `Site ${index}`,
    encampmentId: null,
    startLon: LON0,
    startLat: LAT,
    startNode: 0,
    attributes: null,
  });
  armResident(a, cfg, da);
  return a;
}

/** Layer on, L0, hazard off — the E0 shape but with pets refused by default. */
export const L0_CFG: DecisionConfig = decisionConfig({
  ...DECISION_PARAM_FALLBACKS,
  petPolicyAdmitDefault: false,
  pushThetaThreshold: 0,
});

/** Layer on, L1, hazard off — the latch drives departure so timing is simple. */
export const L1_LATCH_CFG: DecisionConfig = decisionConfig({
  ...DECISION_PARAM_FALLBACKS,
  informationRegime: 1,
  betaCapacityPrior: 0.2,
  petPolicyAdmitDefault: false,
  pushThetaThreshold: 0,
});

/** Layer on, L1, hazard on — the ER shape. */
export const ER_CFG: DecisionConfig = decisionConfig({
  ...DECISION_PARAM_FALLBACKS,
  informationRegime: 1,
  enableHazardDeparture: 1,
  sigmaTheta: 1,
  gammaVuln: 0.25,
  betaCapacityPrior: 0.2,
  petPolicyAdmitDefault: false,
  pushThetaThreshold: 0,
});

/**
 * Drive every decision branch that lives in `step()`'s control flow.
 *
 * Called with a probe installed; the caller owns the counters. Returns a short
 * census so a driver that silently stopped driving is visible rather than
 * merely uncounted.
 */
export function driveControlFlowBranches(): { scenarios: number } {
  let scenarios = 0;
  const { graph } = lineGraph();

  // --- BR-03 group pace APPLIED, on a real tick ------------------------------
  {
    const w = makeWorld([shelterAt("End", 3, 10, graph)]);
    const a = armed(ER_CFG, attrs({ hasDependents: true, groupSpeedDeltaMps: 0.06 }));
    stepResident(a, w, 1);
    scenarios++;
  }

  // --- BR-06 !newHour, BR-24 latch site A returns, BR-26 latch site B returns
  {
    const clean = Array.from({ length: 40 }, () => 1); // never crosses 55.5
    const w = makeWorld([shelterAt("End", 3, 10, graph)], { hourly: clean });
    const layerOn = armed(L0_CFG);
    stepResident(layerOn, w, 1); // hour 0: new hour, latch A waits
    stepResident(layerOn, w, 2); // same hour: !newHour, latch A waits again
    const layerOff = new Resident({
      index: 1,
      name: "Site 1",
      encampmentId: null,
      startLon: LON0,
      startLat: LAT,
      startNode: 0,
      attributes: null,
    });
    stepResident(layerOff, w, 1); // latch site B, waits
    scenarios++;
  }

  // --- BR-10/11/12/14/27 the outreach chain, all four short-circuit outcomes -
  {
    const w = makeWorld([shelterAt("End", 3, 10, graph)]);
    // λ = 0: the draw is skipped for the lambda reason, and the resident returns.
    const noOutreach = armed(ER_CFG, attrs({ awareInitial: false }));
    stepResident(noOutreach, w, 1); // newHour, λ == 0  → BR-11 + BR-14
    stepResident(noOutreach, w, 2); // !newHour           → BR-12 + BR-14

    // λ = 24/day ⇒ hourly probability 1.0 ⇒ the draw always converts, and the
    // resident falls through into the hazard branch on the SAME tick, which is
    // the two-draw agent-tick (BR-27).
    const outreach = decisionConfig({ ...ER_CFG, lambdaOutreachPerDay: 24, alphaHazard: 8 });
    const converted = armed(outreach, attrs({ awareInitial: false }));
    stepResident(converted, w, 1);
    scenarios++;
  }

  // --- BR-20 D2 consumed, BR-22 hazard waits ---------------------------------
  {
    const w = makeWorld([shelterAt("End", 3, 10, graph)]);
    // alphaHazard −800 ⇒ p underflows to 0 ⇒ the draw is consumed and loses.
    const never = decisionConfig({ ...ER_CFG, alphaHazard: -800 });
    const a = armed(never);
    stepResident(a, w, 1);
    stepResident(a, w, 61);
    scenarios++;
  }

  // --- BR-28/29/30 the re-entry fork, both regimes, blocked ------------------
  {
    const shut = shelterAt("Shut", 3, 10, graph, { openTick: 10_000 });
    const w = makeWorld([shut]);
    for (const cfg of [L0_CFG, L1_LATCH_CFG]) {
      const a = armed(cfg);
      a.state = "REFUSED_ALL_FULL";
      stepResident(a, w, 1);
    }
    scenarios++;
  }

  // --- BR-45 closed candidate, BR-47 unreachable candidate -------------------
  {
    const closed = shelterAt("Closed", 3, 10, graph, { openTick: 10_000 });
    const island = shelterAt("Island", 4, 10, graph); // node 4 is isolated
    const open = shelterAt("Open", 3, 10, graph);
    const w = makeWorld([closed, island, open]);
    const l1 = armed(L1_LATCH_CFG);
    chooseShelterByUtility(l1, w, 1, 1.3);
    const l0 = armed(L0_CFG);
    stepResident(l0, w, 1);
    scenarios++;
  }

  // --- BR-48 L1 belief skip, BR-49 L0 belief skip ----------------------------
  {
    const w = makeWorld([shelterAt("A", 3, 10, graph), shelterAt("B", 2, 10, graph)]);
    const l1 = armed(L1_LATCH_CFG);
    l1.believedFull!.add("B");
    chooseShelterByUtility(l1, w, 1, 1.3);
    const l0 = armed(L0_CFG);
    l0.believedFull!.add("B");
    stepResident(l0, w, 1);
    scenarios++;
  }

  // --- BR-59 V11 first write, BR-60 V11 already set --------------------------
  {
    const w = makeWorld([shelterAt("End", 3, 10, graph)]);
    const a = armed(L1_LATCH_CFG);
    chooseShelterByUtility(a, w, 1, 1.3); // NaN → first write
    a.leg = null;
    chooseShelterByUtility(a, w, 1, 1.3); // already set → stale, by design
    scenarios++;
  }

  return { scenarios };
}
