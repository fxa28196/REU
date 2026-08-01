/**
 * The gate that was missing: **is the decision layer actually reached?**
 *
 * WP8 shipped a complete, oracle-verified Phase-E layer — `armResident` is a
 * bit-faithful port of `setDecisionLayer`, every coefficient is trace-checked
 * against a live-Repast dump, and 1,369 tests were green — while
 * `engine/src/sim.ts` contained **no call site for any of it**. Every
 * `Simulation` built its `Resident`s without a `DecisionConfig`, so
 * `step.ts`'s `layer` flag was unconditionally false and the engine executed the
 * WP7 legacy path whatever `enableDecisionLayer`, `informationRegime` or the
 * barrier coefficients said. The observable consequences were a run that
 * sheltered 1.58x–5.62x the archived count, `policy_refusals = 0` against 495–709
 * archived, and three different Scenario-E configs all sheltering *exactly*
 * 2,060 residents because all three were the same legacy run.
 *
 * Nothing failed. That is the point of this file. Every existing suite either
 * called the decision functions directly (`decision.units`, `oracle.trace`) or
 * compared the build (`world/tier1.parity`), and the one seam nobody tested was
 * whether the tick loop could *see* what the build had sampled. So the cases
 * below assert reachability rather than arithmetic:
 *
 * 1. build step 11 constructs the run's ONE `DecisionConfig`;
 * 2. `Simulation` arms every resident with that instance, by reference;
 * 3. a layer-off world still arms nobody (the overlay stays opt-in);
 * 4. the two ways the switch and the config can disagree are hard errors;
 * 5. an `informationRegime = 1` config **completes a run** — it could not before,
 *    because `Simulation` declared no `anyUntriedReachableShelter`;
 * 6. that predicate does **not** filter on live capacity (WP8-SPEC-decision.md
 *    §10 — reusing the availability view restores L1's omniscience silently);
 * 7. `policy_refusals` is non-zero where the archive says it must be;
 * 8. the E0 null still takes **zero** decision-layer transitions, which is the
 *    invariant the Tier-2 R3 flagship rests on.
 *
 * Every case runs on the four-node line graph and a synthetic
 * {@link WorldDataSource}, so the file is always green — an absent graph asset
 * cannot silently retire the gate that exists because a clause went unnoticed
 * for a whole work package.
 */

import { afterEach, describe, expect, it } from "vitest";

import { buildSegmentGeometry } from "../../src/graph/cumLen.js";
import { readCsvText, type CsvRow } from "../../src/loader/csv.js";
import { BR, CountingDecisionProbe, setDecisionProbe } from "../../src/decision/probe.js";
import { isE0NullConfig, type DecisionConfig } from "../../src/decision/config.js";
import { Simulation } from "../../src/sim.js";
import { SmokeField } from "../../src/smoke/field.js";
import {
  buildWorld,
  type WorldBuildConfig,
  type WorldBuildResult,
  type WorldDataSource,
} from "../../src/world/build.js";
import { DLON, LAT, LON0, lineGraph } from "./harness.js";

// ---------------------------------------------------------------------------
// a synthetic world: four nodes in a line, one shelter at the far end
// ---------------------------------------------------------------------------

const lon = (i: number): number => LON0 + i * DLON;

/** The 19 `DecisionConfig` coefficients at their `ContextCreator` fallbacks. */
const FALLBACKS = {
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
} as const;

const BASE: WorldBuildConfig = {
  numAgents: 8,
  minutesPerTick: 1,
  simulationHours: 3,
  randomSeed: 42,
  scenarioCode: 0,
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
  closuresCode: 0,
  closureDraw: 1,
  ...FALLBACKS,
};

/** E0 null: layer on, every mechanism degenerate — the R3 vehicle's shape. */
const E0_LAYER = { enableDecisionLayer: 1, pAwareInit: 1 } as const;

/**
 * The ER (baseline-real) decision block, minus `pAwareInit`.
 *
 * `pAwareInit` stays 1.0 in most cases below so that departure timing is the
 * latch's and the case is about wiring rather than about outreach; the cases
 * that need unaware residents say so.
 */
const ER_LAYER = {
  enableDecisionLayer: 1,
  informationRegime: 1,
  enableHazardDeparture: 0,
  sigmaTheta: 1,
  gammaVuln: 0.25,
  barrierBelongings: 0.26,
  barrierPet: 0.26,
  barrierDependents: 0.26,
  petPolicyDefault: 0,
  betaCapacityPrior: 0.2,
} as const;

function config(over: Partial<WorldBuildConfig> = {}): WorldBuildConfig {
  return { ...BASE, ...over };
}

/**
 * A {@link WorldDataSource} serving one shelter at node 3 and one campsite at
 * node 0, so every resident starts three edges from the only door.
 */
function dataSource(capacity: number | ""): WorldDataSource {
  const shelters =
    "shelter_id,name,capacity,status,lon,lat\n" +
    `S1,Far End,${String(capacity)},operating,${lon(3)},${LAT}\n`;
  const camps = `inc_id,lon,lat\nC0,${lon(0)},${LAT}\n`;
  const cache = new Map<string, readonly CsvRow[]>();
  return {
    exists: (): boolean => true,
    readCsv(path: string): readonly CsvRow[] {
      const hit = cache.get(path);
      if (hit !== undefined) {
        return hit;
      }
      const rows = readCsvText(path.includes("encampments") ? camps : shelters);
      cache.set(path, rows);
      return rows;
    },
  };
}

interface Built {
  readonly world: WorldBuildResult;
  readonly sim: Simulation;
}

/**
 * Build a world and a `Simulation` over it exactly as `headless.ts` does —
 * `buildWorld` then `new Simulation`, nothing in between. The absence of a
 * "then arm the residents" step here is the whole point: if arming needs a
 * harness seam, the shipped path does not have it.
 */
function build(cfg: WorldBuildConfig, capacity: number | "" = 100): Built {
  const { graph, geometry } = lineGraph();
  // 600 ug/m3 everywhere: above the 55.5 threshold, so the latch fires on tick 1
  // and the run is about what happens after departure.
  const smoke = new SmokeField(Array.from({ length: cfg.simulationHours + 1 }, () => 600));
  const world = buildWorld(cfg, {
    graph,
    data: dataSource(capacity),
    smokeHours: smoke.hours(),
    registryValidated: true,
  });
  const sim = new Simulation({
    world,
    graph,
    geometry,
    seg: buildSegmentGeometry(graph, geometry),
    smoke,
    walkingSpeedMps: 1.3,
    evacuationThresholdUgM3: 55.5,
    agentOrder: "identity",
  });
  return { world, sim };
}

let probe: CountingDecisionProbe | null = null;

function withProbe(): CountingDecisionProbe {
  probe = new CountingDecisionProbe();
  setDecisionProbe(probe);
  return probe;
}

afterEach(() => {
  if (probe !== null) {
    setDecisionProbe(null);
    probe = null;
  }
});

// ---------------------------------------------------------------------------
// 1-2. the build constructs the config; the Simulation arms with it
// ---------------------------------------------------------------------------

describe("ContextCreator step 11 reaches the shipped path", () => {
  it("build step 11 constructs the run's ONE DecisionConfig from the run parameters", () => {
    const cfg = config({ ...E0_LAYER, ...ER_LAYER, pAwareInit: 0.356 });
    const { world } = build(cfg);

    const dc = world.decisionConfig;
    expect(dc, "buildWorld returned no DecisionConfig for enableDecisionLayer=1").not.toBeNull();
    // Transcribed against ContextCreator.java:781-788's argument order. The
    // int->boolean coercion is the one that has bitten before: `petPolicyDefault`
    // is tested `== 1` at the CALL SITE, so 0 (and 2) mean *refuse* (QUIRK 22).
    expect(dc!.informationRegime).toBe(1);
    expect(dc!.sigmaTheta).toBe(1);
    expect(dc!.gammaVuln).toBe(0.25);
    expect(dc!.barrierPet).toBe(0.26);
    expect(dc!.betaCapacityPrior).toBe(0.2);
    expect(dc!.petPolicyAdmitDefault).toBe(false);
    expect(dc!.alphaHazard).toBe(-8);
    expect(dc!.pushThetaThreshold).toBe(-0.25);
    expect(dc!.stuckDelayH).toBe(3);
  });

  it("Simulation arms EVERY resident, with that one instance by reference", () => {
    const cfg = config(E0_LAYER);
    const { world, sim } = build(cfg);

    expect(sim.armedResidents, "armResident was never called").toBe(cfg.numAgents);
    expect(sim.decisionConfig).toBe(world.decisionConfig);
    for (const [i, r] of sim.residents.entries()) {
      // Identity, not equality: `ContextCreator` constructs the config once,
      // outside the loop, and every resident holds the same object.
      expect(r.decisionConfig, `resident ${i} unarmed`).toBe(world.decisionConfig);
      expect(r.decision, `resident ${i} lost its sampled attributes`).toBe(
        world.residents[i]!.decision,
      );
      // The three things only `armResident` writes.
      expect(r.decisionRng, `resident ${i} has no private stream`).not.toBeNull();
      expect(r.believedFull, `resident ${i} has no belief set`).not.toBeNull();
      expect(r.awareTick, `resident ${i} was never made aware`).toBe(0);
    }
  });

  it("arms in CREATION order, so each private stream carries its own seed", () => {
    const { world, sim } = build(config({ ...E0_LAYER, numAgents: 4 }));
    // `decisionSeed` is a pure function of (runSeed, creation index). Arming out
    // of order would give resident i resident j's stream and desynchronise every
    // draw for the rest of the run without changing a single count.
    for (const [i, r] of sim.residents.entries()) {
      const expected = world.residents[i]!.decision!.decisionSeed;
      expect(r.decision!.decisionSeed, `resident ${i} seed`).toBe(expected);
    }
    const seeds = new Set(sim.residents.map((r) => r.decision!.decisionSeed));
    expect(seeds.size).toBe(4);
  });

  it("arms NOBODY when the layer is off — the overlay stays strictly opt-in", () => {
    const { world, sim } = build(config({ enableDecisionLayer: 0 }));
    expect(world.decisionConfig).toBeNull();
    expect(sim.decisionConfig).toBeNull();
    expect(sim.armedResidents).toBe(0);
    for (const r of sim.residents) {
      expect(r.decisionConfig).toBeNull();
      expect(r.decision).toBeNull();
      expect(r.decisionRng).toBeNull();
      expect(r.believedFull).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. the switch and the config cannot disagree
// ---------------------------------------------------------------------------

describe("the master switch and the DecisionConfig must agree", () => {
  function simOver(world: WorldBuildResult, decision: DecisionConfig | null | undefined): void {
    const { graph, geometry } = lineGraph();
    new Simulation({
      world,
      graph,
      geometry,
      seg: buildSegmentGeometry(graph, geometry),
      smoke: new SmokeField([600, 600, 600, 600]),
      walkingSpeedMps: 1.3,
      evacuationThresholdUgM3: 55.5,
      ...(decision === undefined ? {} : { decision }),
    });
  }

  it("throws when enableDecisionLayer=1 but no config reaches Simulation", () => {
    const { world } = build(config(E0_LAYER));
    // The exact shape of the defect this file exists for: the layer is switched
    // on, the E-population was sampled, and the tick loop would have run the
    // legacy path and produced a plausible wrong run.
    const stripped = { ...world, decisionConfig: null } as WorldBuildResult;
    expect(() => {
      simOver(stripped, undefined);
    }).toThrow(/enableDecisionLayer is 1 but no DecisionConfig/u);
  });

  it("throws when a config is supplied while the switch is off", () => {
    const armed = build(config(E0_LAYER)).world;
    const off = build(config({ enableDecisionLayer: 0 })).world;
    expect(() => {
      simOver(off, armed.decisionConfig);
    }).toThrow(/never calls setDecisionLayer unless the switch is exactly 1/u);
  });

  it("throws when the supplied config disagrees with the build's", () => {
    const { world } = build(config(E0_LAYER));
    const tampered: DecisionConfig = { ...world.decisionConfig!, bRisk: 0.5 };
    expect(() => {
      simOver(world, tampered);
    }).toThrow(/disagrees with the DecisionConfig the world build constructed/u);
  });
});

// ---------------------------------------------------------------------------
// 4. informationRegime = 1 completes a run
// ---------------------------------------------------------------------------

describe("informationRegime = 1 (L1) is executable", () => {
  it("completes a run, and really does take the L1 re-entry branch", () => {
    // Capacity 1 against 8 residents: seven are refused at the door, land in
    // REFUSED_ALL_FULL and re-enter through `anyUntriedReachableShelter` on the
    // very next tick. Before this wiring landed, `Simulation` declared no such
    // predicate and `stepResident` threw the moment the first resident got there
    // — which no test could observe, because the layer was never armed and
    // `useL1()` was therefore unconditionally false.
    const p = withProbe();
    const { sim } = build(config({ ...E0_LAYER, ...ER_LAYER }), 1);
    expect(sim.decisionConfig!.informationRegime).toBe(1);
    expect(() => {
      sim.run();
    }).not.toThrow();

    expect(p.count(BR.REENTRY_L1), "the L1 re-entry predicate was never consulted").toBeGreaterThan(
      0,
    );
    expect(p.count(BR.REENTRY_L0), "an L1 run used the L0 (omniscient) predicate").toBe(0);
    expect(sim.residents.filter((r) => r.state === "SHELTERED").length).toBe(1);
  });

  it("the L0 regime still uses the omniscient predicate", () => {
    const p = withProbe();
    const { sim } = build(config({ ...E0_LAYER, ...ER_LAYER, informationRegime: 0 }), 1);
    sim.run();
    expect(p.count(BR.REENTRY_L0)).toBeGreaterThan(0);
    expect(p.count(BR.REENTRY_L1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. anyUntriedReachableShelter does NOT filter on live capacity
// ---------------------------------------------------------------------------

describe("anyUntriedReachableShelter (WP8-SPEC-decision.md §10)", () => {
  it("ignores live occupancy, where anyShelterAvailable does not", () => {
    const { sim } = build(config({ ...E0_LAYER, ...ER_LAYER }), 1);
    const shelter = sim.shelters[0]!;
    // Fill it. This is exactly the state in which the two predicates must
    // disagree: L0 knows the door is full, L1 does not and must still send the
    // resident to find out. Reusing `availAny` here — the shortcut step.ts:334
    // warns against — would collapse them and silently restore omniscience.
    expect(shelter.admit(false)).toBe(true);
    expect(shelter.hasSpaceFor(false)).toBe(false);

    const empty = new Set<string>();
    expect(sim.anyShelterAvailable(1, 0, false, null)).toBe(false);
    expect(sim.anyUntriedReachableShelter(1, 0, empty)).toBe(true);

    // Belief is the ONLY thing that removes a door from the L1 view.
    expect(sim.anyUntriedReachableShelter(1, 0, new Set([shelter.id]))).toBe(false);
    // ...and an unreachable node is still unreachable: node 4 is isolated.
    expect(sim.anyUntriedReachableShelter(1, 4, empty)).toBe(false);
  });

  it("is invalidated by the tick, so a closing door stops being a candidate", () => {
    const { sim } = build(config({ ...E0_LAYER, ...ER_LAYER }));
    const shelter = sim.shelters[0]!;
    const empty = new Set<string>();
    expect(sim.anyUntriedReachableShelter(1, 0, empty)).toBe(true);
    shelter.setOpenWindowTicks(Number.NEGATIVE_INFINITY, 2);
    expect(sim.anyUntriedReachableShelter(1, 0, empty)).toBe(true); // cached tick 1
    expect(sim.anyUntriedReachableShelter(3, 0, empty)).toBe(false); // recomputed
  });
});

// ---------------------------------------------------------------------------
// 6. policy_refusals is non-zero where the archive says it must be
// ---------------------------------------------------------------------------

describe("the pet-intake policy actually reaches the door", () => {
  it("counts policy refusals under the ER policy (archive: 495-709, port was 0)", () => {
    // `petPolicyDefault = 0` (the ER value) means the world default REFUSES
    // pets, and this shelter records no `pet_intake` column, so the default
    // applies at the door. With `pHasPet = 1` every resident is a pet owner.
    //
    // The port reported `policy_refusals = 0` on every replayed ER/SE run
    // against 495-709 archived, for one reason: `a.decision` was null, so
    // `policyRefusedFor` returned false before it could read a policy.
    const { sim } = build(config({ ...E0_LAYER, ...ER_LAYER, pHasPet: 1 }), 100);
    expect(sim.decisionConfig!.petPolicyAdmitDefault).toBe(false);
    expect(sim.residents.every((r) => r.decision!.hasPet)).toBe(true);

    sim.run();

    const refusals = sim.shelters.reduce((n, s) => n + s.policyRefusedCount, 0);
    expect(refusals, "no resident was ever refused on policy").toBeGreaterThan(0);
    expect(sim.shelters.reduce((n, s) => n + s.occupancy, 0)).toBe(0);
  });

  it("admits the same pet owners when the world default admits", () => {
    // The negative half: same population, same geometry, `petPolicyDefault = 1`.
    // Without it, "refusals > 0" could be produced by any door failure at all.
    const { sim } = build(
      config({ ...E0_LAYER, ...ER_LAYER, pHasPet: 1, petPolicyDefault: 1 }),
      100,
    );
    expect(sim.decisionConfig!.petPolicyAdmitDefault).toBe(true);
    sim.run();
    expect(sim.shelters.reduce((n, s) => n + s.policyRefusedCount, 0)).toBe(0);
    expect(sim.shelters.reduce((n, s) => n + s.occupancy, 0)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 7. the E0-null invariant the Tier-2 R3 flagship rests on
// ---------------------------------------------------------------------------

describe("the E0 null still takes ZERO decision-layer transitions", () => {
  it("runs the legacy latch, arms every resident aware, and never converts one", () => {
    const cfg = config(E0_LAYER);
    const p = withProbe();
    const { sim } = build(cfg);
    expect(isE0NullConfig(sim.decisionConfig!), "the E0 preset is no longer degenerate").toBe(true);

    // `armResident` throws on an initially-UNAWARE resident under an E0-null
    // config, and `assertNoLayerTransition` throws on an outreach conversion or
    // a hazard departure. Both are live here: the run completing IS the
    // assertion, and neither can be satisfied by a config file claim.
    expect(() => {
      sim.run();
    }).not.toThrow();

    expect(p.count(BR.UNAWARE_INIT), "an E0-null run produced an UNAWARE resident").toBe(0);
    expect(p.count(BR.AWARE_INIT)).toBe(cfg.numAgents);
    expect(p.count(BR.D1), "an E0-null run consumed an outreach draw").toBe(0);
    expect(p.count(BR.HAZARD_BRANCH), "an E0-null run entered the hazard logistic").toBe(0);
    expect(p.count(BR.REENTRY_L1), "an E0-null run is L0 and cannot use the L1 predicate").toBe(0);
    // Latch site A is the layer-on/hazard-off site; site B is the layer-off one.
    // An armed E0 null must take A, and a legacy run must take B — the two are
    // byte-identical in effect and textually distinct on purpose.
    expect(p.count(BR.LATCH_A_FIRE)).toBe(cfg.numAgents);
    expect(p.count(BR.LATCH_B_FIRE)).toBe(0);
    for (const r of sim.residents) {
      expect(r.zR, "the risk accumulator moved under an E0 null").toBeGreaterThanOrEqual(0);
      expect(r.awareTick).toBe(0);
      expect(r.believedFull!.size).toBe(0);
    }
  });

  it("a layer-off run of the same arm takes latch site B and no layer branch", () => {
    const cfg = config({ enableDecisionLayer: 0 });
    const p = withProbe();
    const { sim } = build(cfg);
    sim.run();
    expect(p.count(BR.LATCH_B_FIRE)).toBe(cfg.numAgents);
    expect(p.count(BR.LATCH_A_FIRE)).toBe(0);
    expect(p.count(BR.AWARE_INIT)).toBe(0);
  });
});
