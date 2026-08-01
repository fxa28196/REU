/**
 * The closure sub-tree of `stepResident`, driven END TO END — the gap a
 * mutation sweep of the WP8 closures runtime found on 2026-07-31.
 *
 * ## Why this file exists
 *
 * `reaction.oracle.test.ts` is the bit-exact gate on `reactToClosureWave`, and
 * it is a strong one. But it calls that function **directly**, and it checks the
 * step-9/step-10 entry gate and the stuck-ventilation rule by *re-deriving* them
 * inside the test file from `ticks.tsv` (`oracleEnters`, and the `stuckNow ?
 * RESTING : WALKING` replay in SE-F7). Both derivations are transcriptions of
 * the rule, not executions of it. `sim.hook.test.ts` does run the real
 * `Simulation`, but its mini-world has `enableDecisionLayer = 0`, so `push` is
 * structurally `false` there and no resident can ever become stuck.
 *
 * The consequence, measured rather than suspected: with the whole 736-case
 * engine suite and the WP8 validation gates green, three separate defects in
 * `agents/step.ts` survived undetected —
 *
 *  1. a stuck EN_ROUTE resident breathing at `INHALATION_WALKING_M3H` instead of
 *     `INHALATION_RESTING_M3H` (a 166% error on its air volume and inhaled dose
 *     for the whole delay);
 *  2. the step-9 hold changed from `tick < stuckUntilTick` to `<=`, holding
 *     every stuck resident one tick too long;
 *  3. the early `return` after a stuck push deleted, so a resident that has just
 *     been immobilised still walks a full step on that tick.
 *
 * All three are on the path a real Scenario-E run takes; none of them is
 * reachable from a fixture that stops at `reactToClosureWave`'s signature. So
 * this file drives the real `stepResident` over a real tick sequence, with the
 * decision layer armed, a closure wave in front of the walker, and `pStuck = 1`.
 *
 * ## What is oracle here and what is not — stated exactly
 *
 * **Nothing in this file is a Java-derived number.** The bit-exact evidence for
 * the reaction lives next door in `reaction.oracle.test.ts`, and the two
 * ventilation constants are pinned against the certified source in
 * `agents/stateMachine.ts`'s own suite. What is asserted here is *which rule
 * applies on which tick* — the transcription of `GisAgent.step()`'s block 5 /
 * step 9 / step 10 ordering (PORT_MAP §1.5, WP8-SPEC-closures.md §10, QUIRK
 * 16/17/18/20) — and it is asserted by executing the port, not by restating it.
 * Air volume is used as the probe because it is the one accumulator the smoke
 * concentration does not enter, so it isolates the ventilation rate exactly.
 */

import { describe, expect, it } from "vitest";

import { Resident } from "../../src/agents/resident.js";
import type { RouteLeg, RouteNodes } from "../../src/agents/route.js";
import { stepResident, type StepWorld } from "../../src/agents/step.js";
import {
  INHALATION_RESTING_M3H,
  INHALATION_WALKING_M3H,
} from "../../src/agents/stateMachine.js";
import { ClosureRuntime } from "../../src/closures/runtime.js";
import { parseClosureSchedule } from "../../src/closures/schedule.js";
import { pairKey, pushRuleFires } from "../../src/decision/closureReaction.js";
import { DECISION_PARAM_FALLBACKS, type DecisionConfig } from "../../src/decision/config.js";
import type { DecisionAttributes } from "../../src/agents/eLayerSampler.js";
import { buildRoutingGraph, type RoutingGraph } from "../../src/graph/csr.js";
import { computeTree, makeScratch, retainTree } from "../../src/graph/dijkstra.js";
import type { CsvRow } from "../../src/loader/csv.js";
import { JavaRandom } from "../../src/rng/JavaRandom.js";
import { Shelter } from "../../src/shelters/shelter.js";
import { SmokeField } from "../../src/smoke/field.js";

// ---------------------------------------------------------------------------
// The walker, its leg and the world it steps in
// ---------------------------------------------------------------------------

const MINUTES_PER_TICK = 1;
const DT_HOURS = MINUTES_PER_TICK / 60;
/** 5 m/s x 60 s x 1 min — a 300 m step, so one tick is well inside one edge. */
const WALKING_SPEED_MPS = 5;
const STEP_LENGTH_M = WALKING_SPEED_MPS * 60 * MINUTES_PER_TICK;

/** Certified node ids along the walk, walker first, shelter last. */
const CHAIN_IDS = [700, 701, 702, 703];
/** Vertex index of each chain node in {@link straightLeg}'s `xy`. */
const CHAIN_OFFSETS = [0, 1, 2, 3];
const EDGE_M = 12_000;

/**
 * A four-vertex leg: one vertex per chain node, 12 km apart, straight east.
 *
 * Synthetic on purpose. `buildRouteLeg` is gated by the WP5/WP7 suites against
 * the real geometry; what this file needs is a leg whose vertex/`cumM`
 * relationship is arithmetic rather than geographic, so `pathIndexFor`'s answer
 * is inspectable by hand and the grandfathering boundary is exact.
 */
function straightLeg(): RouteLeg {
  const xy = new Float64Array(2 * CHAIN_IDS.length);
  const cumM = new Float64Array(CHAIN_IDS.length);
  for (let i = 0; i < CHAIN_IDS.length; i++) {
    xy[2 * i] = -122.6 + i * 0.15;
    xy[2 * i + 1] = 45.5;
    cumM[i] = i * EDGE_M;
  }
  return { vertexCount: CHAIN_IDS.length, xy, cumM, totalM: cumM[CHAIN_IDS.length - 1]! };
}

function chainRouteNodes(): RouteNodes {
  return {
    nodes: Int32Array.from([0, 1, 2, 3]),
    nodeIds: Int32Array.from(CHAIN_IDS),
    coordOffset: Int32Array.from(CHAIN_OFFSETS),
  };
}

/**
 * The armed Scenario-E config. `pStuck = 1.0` makes the third draw's outcome
 * deterministic, which is what turns "a push happened" into "a stuck resident
 * exists" without pinning this file to a particular RNG state.
 */
const ARMED: DecisionConfig = {
  ...DECISION_PARAM_FALLBACKS,
  sigmaTheta: 1.0,
  pushThetaThreshold: -0.25,
  kPush: 1.0,
  pStuck: 1.0,
  stuckDelayH: 0.05, // x (60 / 1) = 3.0 ticks
};
const STUCK_DELAY_TICKS = ARMED.stuckDelayH * (60.0 / MINUTES_PER_TICK);

const DECISION: DecisionAttributes = {
  awareInitial: true,
  heavyBelongings: false,
  hasPet: false,
  hasDependents: false,
  thetaZ: 1.0,
  groupSpeedDeltaMps: 0,
  decisionSeed: 42n,
};

/** A `StepWorld` whose closure view is mutable, and whose graph is never read. */
interface Harness {
  readonly world: StepWorld;
  version: number;
  readonly blocked: Set<string>;
}

function harness(shelters: readonly Shelter[] = []): Harness {
  const state = { version: 0, blocked: new Set<string>() };
  const world: StepWorld = {
    // Never dereferenced while the resident holds a leg; the one case that does
    // re-plan supplies shelters with a null `routeTree`, which the chooser skips
    // before it can touch the graph.
    graph: undefined as never,
    geometry: undefined as never,
    seg: undefined as never,
    smoke: new SmokeField([600, 600, 600, 600, 600, 600]),
    shelters,
    minutesPerTick: MINUTES_PER_TICK,
    walkingSpeedMps: WALKING_SPEED_MPS,
    evacuationThresholdUgM3: 55.5,
    hasClosureSchedule: true,
    closureVersion: () => state.version,
    isBlocked: (a, b) => state.blocked.has(pairKey(a, b)),
    anyShelterOpen: () => true,
    anyShelterAvailable: () => false,
    onAdmission: () => undefined,
  };
  return {
    world,
    get version() {
      return state.version;
    },
    set version(v: number) {
      state.version = v;
    },
    blocked: state.blocked,
  };
}

/**
 * A resident already walking the chain, armed, `travelledM` metres in.
 *
 * `1.25 x EDGE_M` puts it between chain nodes 1 and 2, so `pathIndexFor` reports
 * vertex 2: chain edge 0 and chain edge 1 are behind it (grandfathered) and only
 * chain edge 2 is ahead. That is the boundary the whole grandfathering rule
 * turns on, and it is where the interesting cases live.
 */
function walker(travelledM = 1.25 * EDGE_M): Resident {
  const a = new Resident({
    index: 0,
    name: "walker",
    encampmentId: null,
    startLon: -122.6,
    startLat: 45.5,
    startNode: 0,
    attributes: null,
  });
  a.state = "EN_ROUTE";
  a.leg = straightLeg();
  a.routeNodes = chainRouteNodes();
  a.legApproachM = 0;
  a.legTravelM = travelledM;
  a.legFromLon = -122.6;
  a.legFromLat = 45.5;
  a.posLon = -122.6;
  a.posLat = 45.5;
  a.currentNode = 0;
  a.seenClosureVersion = 0;
  a.decisionConfig = ARMED;
  a.decision = DECISION;
  a.thetaScaled = ARMED.sigmaTheta * DECISION.thetaZ; // 1.0 -> pushes
  a.barrierCost = 0;
  // What `armResident` does, without needing a StreamRegistry: the private
  // stream is constructed ONCE (QUIRK 25). `JavaRandom` is WP0-gated bit for
  // bit, so any seed gives a legitimate stream; `pStuck = 1.0` makes the draw's
  // OUTCOME independent of it, which is why no seed is pinned here.
  a.decisionRng = new JavaRandom(DECISION.decisionSeed);
  return a;
}

// ---------------------------------------------------------------------------

describe("stepResident through a closure wave — blocks 5, 9 and 10 as one sequence", () => {
  it("SE-MT1: a stuck pusher breathes RESTING while held and WALKING on entry and resume", () => {
    // QUIRK 16/18 and WP8-SPEC-closures §10, executed rather than transcribed:
    //
    //   tick T          block 5 runs BEFORE steps 9-10, so the tick a resident
    //                   is immobilised is still booked at WALKING
    //   ticks T+1..T+2  `tick < stuckUntilTick` -> RESTING
    //   tick T+3        strict `<` is false -> WALKING again
    //
    // Air volume is the probe: it is the one accumulator the concentration does
    // not enter, so a wrong ventilation rate cannot hide behind the smoke field.
    const h = harness();
    const a = walker();
    // Block the one edge AHEAD of the walker, and one BEHIND it. The behind one
    // must be grandfathered, or the scan would hit the wrong edge and this case
    // would be measuring something else.
    h.blocked.add(pairKey(CHAIN_IDS[2]!, CHAIN_IDS[3]!));
    h.blocked.add(pairKey(CHAIN_IDS[0]!, CHAIN_IDS[1]!));
    h.version = 1;

    const T = 1;
    const rates: number[] = [];
    let air = a.airVolumeBreathedM3;
    for (let tick = T; tick <= T + STUCK_DELAY_TICKS; tick++) {
      const before = a.airVolumeBreathedM3;
      stepResident(a, h.world, tick);
      rates.push(a.airVolumeBreathedM3 - before);
    }

    // The push actually happened — otherwise every assertion below is vacuous.
    expect([a.blockagesEncountered, a.pushThroughs, a.reroutes, a.stuckEvents]).toEqual([
      1, 1, 0, 1,
    ]);

    // Bit-exact, replaying the SAME double operations block 5 performs, so the
    // rate is pinned to the last bit rather than to a tolerance.
    const want = [
      INHALATION_WALKING_M3H, // T:   stuck field was still NaN when block 5 ran
      INHALATION_RESTING_M3H, // T+1: held
      INHALATION_RESTING_M3H, // T+2: held
      INHALATION_WALKING_M3H, // T+3: strict `<` -> served, walking again
    ];
    expect(rates.length).toBe(want.length);
    for (let i = 0; i < want.length; i++) {
      const expected = air + want[i]! * DT_HOURS;
      expect(expected - air, `tick ${T + i} ventilation`).toBe(rates[i]);
      air = expected;
    }
    expect(a.airVolumeBreathedM3).toBe(air);
  });

  it("SE-MT2: a stuck pusher does not move on the tick it is stuck, and resumes on exactly T+D", () => {
    // Two separate off-by-ones live here and neither is visible in the air
    // volume: deleting step 10's early `return` lets the resident walk a full
    // step on the tick it was immobilised, and relaxing step 9's `tick <
    // stuckUntilTick` to `<=` holds it one tick too long.
    const h = harness();
    const a = walker();
    h.blocked.add(pairKey(CHAIN_IDS[2]!, CHAIN_IDS[3]!));
    h.version = 1;

    const T = 1;
    const moved: number[] = [];
    for (let tick = T; tick <= T + STUCK_DELAY_TICKS; tick++) {
      const before = a.distanceTraveledM;
      stepResident(a, h.world, tick);
      moved.push(a.distanceTraveledM - before);
    }

    expect(a.stuckEvents, "the resident really was immobilised").toBe(1);
    // The delay is `tick + stuckDelayH * (60 / minutesPerTick)`, evaluated with
    // the division first (QUIRK 3) — 1 + 3.0 here.
    expect(moved, "no movement on T, T+1, T+2; a full step on T+3").toEqual([
      0,
      0,
      0,
      STEP_LENGTH_M,
    ]);
    // ... and the field is back to the NaN sentinel once served.
    expect(Number.isNaN(a.stuckUntilTick)).toBe(true);
  });

  it("SE-MT3: the wave is consumed once, and a second tick under the same version re-scans nothing", () => {
    // QUIRK 17: `seenClosureVersion` is consumed unconditionally as the first
    // statement of the reaction, so a no-hit scan still burns the wave. Driven
    // here through `stepResident` with an edge that is BEHIND the walker, which
    // is the case that hits nothing at all.
    const h = harness();
    const a = walker();
    h.blocked.add(pairKey(CHAIN_IDS[0]!, CHAIN_IDS[1]!)); // behind: grandfathered
    h.version = 1;

    stepResident(a, h.world, 1);
    expect(a.seenClosureVersion, "the wave is burned by the scan").toBe(1);
    expect([a.blockagesEncountered, a.pushThroughs, a.reroutes]).toEqual([0, 0, 0]);
    expect(a.distanceTraveledM, "a grandfathered walker keeps walking").toBe(STEP_LENGTH_M);

    // Same version on the next tick: step 10 must not be re-entered.
    stepResident(a, h.world, 2);
    expect([a.blockagesEncountered, a.pushThroughs, a.reroutes]).toEqual([0, 0, 0]);
    expect(a.distanceTraveledM).toBe(2 * STEP_LENGTH_M);
  });

  it("SE-MT4: step 10 is guarded on routeNodes, not on the leg alone", () => {
    // `GisAgent.step()`'s conjunct is `routePath != null && routeNodes != null &&
    // version != seen`. The second conjunct is defensive today — both choosers
    // write the two together — but it is the certified text, and a port that
    // dropped it would dereference a null chain rather than skip the block.
    const h = harness();
    const a = walker();
    a.routeNodes = null;
    h.blocked.add(pairKey(CHAIN_IDS[2]!, CHAIN_IDS[3]!));
    h.version = 1;

    expect(() => stepResident(a, h.world, 1)).not.toThrow();
    expect(a.seenClosureVersion, "no chain, no scan, no version consumed").toBe(0);
    expect([a.blockagesEncountered, a.pushThroughs, a.reroutes, a.stuckEvents]).toEqual([
      0, 0, 0, 0,
    ]);
    expect(a.distanceTraveledM).toBe(STEP_LENGTH_M);
  });

  it("SE-MT5: a rerouting walker stops where it stands and re-plans from that node", () => {
    // `thetaScaled` below the push threshold, so the same wave takes the other
    // branch. `currentNode = nodes[lastReached]` is the node whose coordinate the
    // walker has already passed — chain index 1 at `pathIndex` 2 — and the leg,
    // the chain and both leg-length scalars are cleared so step 11 re-plans.
    const h = harness();
    const a = walker();
    a.thetaScaled = -1.0; // -1.0 >= -0.25 is false -> reroute
    h.blocked.add(pairKey(CHAIN_IDS[2]!, CHAIN_IDS[3]!));
    h.version = 1;

    stepResident(a, h.world, 1);
    expect([a.blockagesEncountered, a.pushThroughs, a.reroutes, a.stuckEvents]).toEqual([
      1, 0, 1, 0,
    ]);
    expect(a.currentNode, "stands at the last chain node it reached").toBe(1);
    expect(a.leg).toBeNull();
    expect(a.routeNodes).toBeNull();
    expect(a.legTravelM).toBe(0);
    expect(a.legApproachM).toBe(0);
    // No shelter has a tree in this harness, so the re-plan finds nothing on the
    // component and the resident terminates UNREACHABLE rather than stranding.
    expect(a.state).toBe("UNREACHABLE");
  });
});

// ---------------------------------------------------------------------------
// The push rule's decision boundary
// ---------------------------------------------------------------------------

/**
 * The double immediately below `x` — `Math.nextAfter(x, -Infinity)`, which
 * JavaScript does not ship.
 *
 * Zero is its own case: both zeros have magnitude bits 0, so incrementing the
 * pattern walks *up* into the subnormals rather than down. The step below zero
 * is `-Number.MIN_VALUE`. Getting this wrong would make the "one ULP below"
 * probe test a value ABOVE the boundary, and the case would fail for a reason
 * that has nothing to do with the push rule.
 */
function prevDouble(x: number): number {
  if (x === 0) {
    return -Number.MIN_VALUE;
  }
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, x);
  const bits = buf.getBigUint64(0);
  buf.setBigUint64(0, x > 0 ? bits - 1n : bits + 1n);
  return buf.getFloat64(0);
}

describe("pushRuleFires — the decision boundary, to one ULP", () => {
  /**
   * The certified line is
   *
   * ```java
   * push = thetaScaled >= pushThetaThreshold + kPush * (barrierCost + mobilityPenalty);
   * ```
   *
   * and the mutation sweep showed the oracle fixture leaves it a wide berth: at
   * the archived operating points the threshold can move down by 0.00369
   * (1.48% of |-0.25|) or **up by 0.0979 (39.1%)** before any of the 351
   * certified adjudications changes its answer. A 1% error, and every 1-ULP
   * error, is invisible to it.
   *
   * So the boundary is pinned directly instead of through its consequences:
   * `thetaScaled` exactly AT the certified expression must push (the comparison
   * is inclusive `>=`), and one ULP below it must not. Both sides move together
   * only if the code computes the same expression the certified source does, so
   * any perturbation of the threshold, of `kPush`, or of the comparison operator
   * flips one of the two.
   */
  const POINTS: readonly { barrier: number; penalty: number }[] = [
    { barrier: 0.0, penalty: 0.0 },
    { barrier: 0.0, penalty: 1.0 },
    { barrier: 0.35, penalty: 0.0 },
    { barrier: 0.35, penalty: 1.0 },
    { barrier: 1.25, penalty: 1.0 },
  ];

  it("fires exactly at `pushThetaThreshold + kPush * (barrierCost + penalty)`", () => {
    for (const cfg of [ARMED, { ...ARMED, kPush: 0.6 }, { ...ARMED, pushThetaThreshold: 0.0 }]) {
      for (const { barrier, penalty } of POINTS) {
        const boundary = cfg.pushThetaThreshold + cfg.kPush * (barrier + penalty);
        const where = `theta=${boundary} k=${cfg.kPush} t=${cfg.pushThetaThreshold} b=${barrier} p=${penalty}`;
        expect(pushRuleFires(cfg, boundary, barrier, penalty), `AT boundary: ${where}`).toBe(true);
        expect(
          pushRuleFires(cfg, prevDouble(boundary), barrier, penalty),
          `one ULP BELOW boundary: ${where}`,
        ).toBe(false);
      }
    }
  });

  it("sums the barrier and the penalty BEFORE multiplying by kPush", () => {
    // `k*(b+p)` and `k*b + k*p` are not the same double here: 0.12 versus
    // 0.12000000000000001. The distributed form is one ULP higher, so a port
    // that distributed the multiplication would refuse a push exactly at the
    // certified boundary.
    const k = 0.1;
    const b = 0.2;
    const p = 1.0;
    expect(k * (b + p), "the two parenthesisations really do differ").not.toBe(k * b + k * p);
    const cfg: DecisionConfig = { ...ARMED, kPush: k, pushThetaThreshold: -0.25 };
    const sumFirst = cfg.pushThetaThreshold + k * (b + p);
    expect(pushRuleFires(cfg, sumFirst, b, p)).toBe(true);
    expect(pushRuleFires(cfg, prevDouble(sumFirst), b, p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The blocked pair set's enumeration order
// ---------------------------------------------------------------------------

describe("BlockedEdges.blockedPairs — insertion order is FILE order", () => {
  /**
   * `blockedPairs()` documents itself as "in the order they were first blocked",
   * and it is the provenance read-out of the blocked set. Nothing tested that:
   * the wave oracle sorts both sides before comparing, so reversing the
   * within-wave block loop left every suite green.
   *
   * Within-wave order is genuinely NOT an outcome (QUIRK 38 — the whole wave is
   * in the set before the first `computeTree`), so this is a claim about the
   * read-out, not about routing, and it is asserted as such.
   */
  const IDS = [100, 101, 102, 103];

  function lineGraph(): RoutingGraph {
    return buildRoutingGraph({
      nodeCount: 4,
      edgeCount: 3,
      nodeId: Int32Array.from(IDS),
      nodeLon: Float64Array.from([-122.6, -122.599, -122.598, -122.597]),
      nodeLat: Float64Array.from([45.5, 45.5, 45.5, 45.5]),
      edgeFrom: Int32Array.from([0, 1, 2]),
      edgeTo: Int32Array.from([1, 2, 3]),
      edgeLengthM: Float64Array.from([10, 10, 10]),
      csrOffset: Int32Array.from([0, 1, 3, 5, 6]),
      csrEntry: Int32Array.from([1, -1, 2, -2, 3, -3]),
    } as never);
  }

  it("enumerates the pairs in the order the CSV listed them", () => {
    const graph = lineGraph();
    // Deliberately NOT in ascending node order, so "file order" and "sorted"
    // cannot be confused for one another.
    const rows: CsvRow[] = [
      [102, 103],
      [100, 101],
      [101, 102],
    ].map(
      ([a, b]) =>
        new Map([
          ["node_a", String(a)],
          ["node_b", String(b)],
          ["activation_hour", "1"],
        ]),
    );
    const schedule = parseClosureSchedule({
      rows,
      csvPath: "data/closures/order.csv",
      graph,
      ticksPerHour: 60,
      runEndHours: 96,
    });
    const scratch = makeScratch(graph);
    const shelter = new Shelter("S", "S", null, true, graph.nodeLon[3]!, graph.nodeLat[3]!);
    shelter.graphNode = 3;
    shelter.graphNodeId = graph.nodeId[3]!;
    shelter.routeTree = retainTree(computeTree(graph, 3, scratch));

    const rt = new ClosureRuntime({ graph, shelters: [shelter], schedule, scratch });
    rt.applyDueWaves(60);

    const asIds = rt.blocked
      .blockedPairs()
      .map(([a, b]) => [graph.nodeId[a]!, graph.nodeId[b]!] as const);
    expect(asIds).toEqual([
      [102, 103],
      [100, 101],
      [101, 102],
    ]);
  });
});
