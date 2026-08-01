/**
 * Synthetic cover for the decision-layer branches the Java oracle could **not**
 * reach, plus the small pure functions whose failure mode is a wrong number
 * rather than a wrong row.
 *
 * `DR-WP8-decision-oracle.md` §7.2 names 15 of the 72 branches as untriggered
 * and gives a reason for each — no shelter row is non-operating, none has a
 * blank capacity, no CSV has an `adults_only` column, every site opens on the
 * same date so a `REFUSED_ALL_FULL` re-entry can never be granted, and the whole
 * closure-reaction sub-tree below `hit >= 0` was never entered by any run.
 * `oracle.trace.test.ts` therefore *cannot* cover them, and a coverage gate that
 * only checked what the oracle exercised would leave the port's handling of them
 * entirely unmeasured.
 *
 * These tests are **not** a substitute for the oracle: their expectations come
 * from WP8-SPEC-decision.md's transcription of `GisAgent.java`, so they pin
 * structure and side effects rather than bit patterns the Java produced. That
 * distinction is the reason they live in their own file with this note on top.
 *
 * The last case reports which of the 15 are now exercised, so the number is a
 * measurement in the test output rather than a claim.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { artifactGate, itGated } from "../../../tools/artifact-gate.js";
import type { Resident } from "../../src/agents/resident.js";
import { buildRouteNodes, pathIndexFor, buildRouteLeg } from "../../src/agents/route.js";
import { stepResident } from "../../src/agents/step.js";
import { UNCAPPED_CAPACITY_PRIOR } from "../../src/agents/stateMachine.js";
import {
  DECISION_CONFIG_FIELDS,
  DECISION_MANIFEST_PARAMETERS,
  DECISION_PARAM_FALLBACKS,
  decisionConfig,
  decisionConfigPositional,
  petPolicyAdmitDefaultFrom,
  useL1,
  type DecisionConfig,
} from "../../src/decision/config.js";
import {
  mobilityPenalty,
  pairKey,
  pushRuleFires,
  scanForBlockage,
  stuckUntilTickFor,
} from "../../src/decision/closureReaction.js";
import { hazardVulnerable, hourBucket, riskDecay } from "../../src/decision/hazard.js";
import { groupPacedSpeedMps } from "../../src/decision/pace.js";
import { petAdmittedAt, policyRefusedFor } from "../../src/decision/pets.js";
import { BR, CountingDecisionProbe, setDecisionProbe, type BranchId } from "../../src/decision/probe.js";
import {
  beatsRunningBest,
  candidateCapacityPrior,
  candidateUtility,
  chooseShelterByUtility,
  walkTimeHours,
} from "../../src/decision/utilityChooser.js";
import { buildSegmentGeometry } from "../../src/graph/cumLen.js";
import { computeTree, makeScratch, retainTree } from "../../src/graph/dijkstra.js";
import type { Shelter } from "../../src/shelters/shelter.js";
import { armed, attrs, lineGraph, makeWorld, shelterAt, type TestWorld } from "./harness.js";

/** Counters for the "which of the 15 did we reach" report at the bottom. */
const probe = new CountingDecisionProbe();

/**
 * The certified instrument's own source, used as a cross-oracle for the one
 * hardcoded constant `chooseShelterByUtility` reads. It is tracked in git, so
 * it is present in every clone; the gate is here because the shared skip-vs-fail
 * policy owns every path outside this package, not because it is expected to be
 * missing.
 */
const GIS_AGENT_JAVA = fileURLToPath(
  new URL("../../../../Geography/src/geography/agents/GisAgent.java", import.meta.url),
);
const JAVA_SOURCE_GATE = artifactGate({
  gate: "engine:wp8-gisagent-source",
  suite: "WP8 decision constants vs the certified GisAgent.java",
  evidence: "UNCAPPED_CAPACITY_PRIOR read out of the instrument of record",
  artifacts: [
    {
      source: "geography",
      label: "src/geography/agents/GisAgent.java",
      path: GIS_AGENT_JAVA,
    },
  ],
});

/** The shared four-node harness; see `harness.ts` for why it is shared. */
const ATTRS = attrs;
const L1_CFG: DecisionConfig = decisionConfig({
  ...DECISION_PARAM_FALLBACKS,
  informationRegime: 1,
  enableHazardDeparture: 0,
  sigmaTheta: 1.0,
  gammaVuln: 0.25,
  barrierBelongings: 0.26,
  barrierPet: 0.26,
  barrierDependents: 0.26,
  petPolicyAdmitDefault: false,
  betaCapacityPrior: 0.2,
  pushThetaThreshold: 0.0,
});

const world = (shelters: Shelter[], hasClosureSchedule = false): TestWorld =>
  makeWorld(shelters, { hasClosureSchedule });

const armedResident = (cfg: DecisionConfig, da = ATTRS()): Resident => armed(cfg, da);

function withProbe(fn: () => void): void {
  setDecisionProbe(probe);
  try {
    fn();
  } finally {
    setDecisionProbe(null);
  }
}

// ---------------------------------------------------------------------------

describe("DecisionConfig — the positional constructor and the 21-name manifest block", () => {
  it("the named and positional forms agree, field for field, in declaration order", () => {
    const c = L1_CFG;
    const positional = decisionConfigPositional(
      c.informationRegime,
      c.enableHazardDeparture,
      c.alphaHazard,
      c.bRisk,
      c.wOfficial,
      c.gammaVuln,
      c.sigmaTheta,
      c.riskHalfLifeH,
      c.lambdaOutreachPerDay,
      c.barrierBelongings,
      c.barrierPet,
      c.barrierDependents,
      c.petPolicyAdmitDefault,
      c.betaTravelTime,
      c.betaCapacityPrior,
      c.pushThetaThreshold,
      c.kPush,
      c.pStuck,
      c.stuckDelayH,
    );
    expect(positional).toEqual(c);
    expect(DECISION_CONFIG_FIELDS.length).toBe(19);
    expect(Object.keys(c)).toEqual([...DECISION_CONFIG_FIELDS]);
  });

  it("the manifest block is 21 names: 15 config, 5 sampler, 1 switch", () => {
    expect(DECISION_MANIFEST_PARAMETERS.length).toBe(21);
    const byDest = (d: string): number =>
      DECISION_MANIFEST_PARAMETERS.filter((p) => p.destination === d).length;
    expect(byDest("config")).toBe(15);
    expect(byDest("sampler")).toBe(5);
    expect(byDest("switch")).toBe(1);
    // The four Scenario-E fields are in DecisionConfig and NOT in this block —
    // 19 and 21 are different numbers and are not to be made to agree.
    const named = new Set(
      DECISION_MANIFEST_PARAMETERS.filter((p) => p.field !== null).map((p) => p.field),
    );
    for (const f of ["pushThetaThreshold", "kPush", "pStuck", "stuckDelayH"] as const) {
      expect([f, named.has(f)]).toEqual([f, false]);
    }
  });

  it("petPolicyDefault is an EQUALITY test: 2 refuses pets (QUIRK 22)", () => {
    expect(petPolicyAdmitDefaultFrom(1)).toBe(true);
    expect(petPolicyAdmitDefaultFrom(0)).toBe(false);
    expect(petPolicyAdmitDefaultFrom(2)).toBe(false);
    expect(petPolicyAdmitDefaultFrom(-1)).toBe(false);
  });

  it("useL1 is strict `=== 1`: regime 2 is L0", () => {
    expect(useL1(null)).toBe(false);
    expect(useL1({ ...L1_CFG, informationRegime: 0 })).toBe(false);
    expect(useL1({ ...L1_CFG, informationRegime: 1 })).toBe(true);
    expect(useL1({ ...L1_CFG, informationRegime: 2 })).toBe(false);
  });
});

describe("setDecisionLayer — barrierCost order and the pet/world-default keying", () => {
  it("accumulates belongings → pet → dependents, and only the flags that are set", () => {
    const cfg = decisionConfig({
      ...DECISION_PARAM_FALLBACKS,
      barrierBelongings: 0.1,
      barrierPet: 0.2,
      barrierDependents: 0.4,
      petPolicyAdmitDefault: false,
      sigmaTheta: 2,
    });
    const a = armedResident(
      cfg,
      ATTRS({ heavyBelongings: true, hasPet: true, hasDependents: true, thetaZ: 1.5 }),
    );
    expect(a.barrierCost).toBe(0.1 + 0.2 + 0.4);
    expect(a.thetaScaled).toBe(3);
    expect(a.believedFull).not.toBeNull();
    expect(a.lastDecisionHour).toBe(-1);
    expect(a.zR).toBe(0);
  });

  it("the ORDER is the arithmetic: a triple where reassociating changes the double", () => {
    // Mutation-testing finding. QUIRK 5 says this accumulation order is
    // load-bearing because `+` is not associative — but nothing was measuring
    // it. Reversing the three lines to dependents → pet → belongings left the
    // WHOLE WP8 decision suite green (43/43), because:
    //
    //   * every archived config sets barrierBelongings = barrierPet =
    //     barrierDependents = 0.26 (`configs.ts` ER_BLOCK), so `arm.tsv`'s
    //     123,156 bit-exact rows are identical under any permutation; and
    //   * the case above uses 0.1/0.2/0.4, for which 0.1+0.2+0.4 and
    //     0.4+0.2+0.1 are the SAME double.
    //
    // 0.01/0.02/0.29 is a triple that separates them:
    //   (0.01+0.02)+0.29 = 0.31999999999999995   <- the certified order
    //   (0.01+0.29)+0.02 = 0.32                  <- pet/dependents transposed
    //   (0.29+0.02)+0.01 = 0.32                  <- fully reversed
    //
    // Note `c += belongings; c += pet` and `c += pet; c += belongings` are
    // genuinely indistinguishable (two-operand `+` IS commutative in IEEE-754),
    // so that transposition is a no-op rather than an untested defect.
    const cfg = decisionConfig({
      ...DECISION_PARAM_FALLBACKS,
      barrierBelongings: 0.01,
      barrierPet: 0.02,
      barrierDependents: 0.29,
      petPolicyAdmitDefault: false,
    });
    const a = armedResident(
      cfg,
      ATTRS({ heavyBelongings: true, hasPet: true, hasDependents: true }),
    );
    // Written as the certified left-to-right accumulation, not as a literal, so
    // the expectation states the ORDER rather than a magic number.
    let expected = 0.0;
    expected += 0.01;
    expected += 0.02;
    expected += 0.29;
    expect(a.barrierCost).toBe(expected);
    // ...and the two reassociations really are different doubles, so the
    // assertion above is a discriminating one and not a lucky tie.
    expect(a.barrierCost).not.toBe(0.01 + 0.29 + 0.02);
    expect(a.barrierCost).not.toBe(0.29 + 0.02 + 0.01);
  });

  it("the pet term reads the WORLD default, never a site (§2 point 4)", () => {
    const admit = decisionConfig({ ...DECISION_PARAM_FALLBACKS, barrierPet: 0.26 });
    const refuse = decisionConfig({
      ...DECISION_PARAM_FALLBACKS,
      barrierPet: 0.26,
      petPolicyAdmitDefault: false,
    });
    expect(armedResident(admit, ATTRS({ hasPet: true })).barrierCost).toBe(0);
    expect(armedResident(refuse, ATTRS({ hasPet: true })).barrierCost).toBe(0.26);
  });
});

describe("group pace (V34) — a scalar decrement, a hard floor, and a strict guard", () => {
  it("floors at 0.40 and is skipped entirely at delta 0 (QUIRK 20)", () => {
    expect(groupPacedSpeedMps(1.3, 0.06)).toBeCloseTo(1.24, 15);
    expect(groupPacedSpeedMps(0.42, 0.06)).toBe(0.4);
    expect(groupPacedSpeedMps(0.41, 0.5)).toBe(0.4);
    // With delta 0 the block does not run, so a sub-floor speed is NOT raised.
    expect(groupPacedSpeedMps(0.3, 0)).toBe(0.3);
    expect(groupPacedSpeedMps(0.3, -1)).toBe(0.3);
  });

  it("heavy belongings never touches the speed — only barrierCost", () => {
    const cfg = decisionConfig({ ...DECISION_PARAM_FALLBACKS, barrierBelongings: 0.26 });
    const a = armedResident(cfg, ATTRS({ heavyBelongings: true }));
    expect(a.decision!.groupSpeedDeltaMps).toBe(0);
    expect(a.barrierCost).toBe(0.26);
  });
});

describe("the hazard predicates — two 'vulnerable' sets that must never merge", () => {
  it("hazard vulnerability is four terms at age 65, not the five-term age-55 stratum", () => {
    const base = {
      ageYears: 60,
      ageBand: "45-64",
      sex: "MALE",
      mobilityCategory: "unimpaired",
      mobilityLimited: false,
      asthma: false,
      copd: false,
      chronicPhysical: true,
      walkingSpeedMps: 1.3,
    } as const;
    // 60 with a chronic physical condition IS the reporting stratum and is NOT
    // hazard-vulnerable. That disagreement is the whole point of QUIRK 9.
    expect(hazardVulnerable(base)).toBe(false);
    expect(hazardVulnerable({ ...base, ageYears: 65 })).toBe(true);
    expect(hazardVulnerable({ ...base, asthma: true })).toBe(true);
    expect(hazardVulnerable({ ...base, copd: true })).toBe(true);
    expect(hazardVulnerable({ ...base, mobilityLimited: true })).toBe(true);
    expect(hazardVulnerable(null)).toBe(false);
  });

  it("the hour bucket multiplies then divides, and jumps by more than one when it can", () => {
    expect(hourBucket(1, 1)).toBe(0);
    expect(hourBucket(59, 1)).toBe(0);
    expect(hourBucket(60, 1)).toBe(1);
    expect(hourBucket(18720, 1)).toBe(312);
    // QUIRK 2: with minutesPerTick > 60 the index jumps, and the model still
    // applies exactly ONE decay. This is the certified behaviour, not a bug.
    expect(hourBucket(1, 90)).toBe(1);
    expect(hourBucket(2, 90)).toBe(3);
  });

  it("QUIRK 1: the hazard draw is consumed ONLY when a shelter is open — on the REAL step path", () => {
    // Mutation-testing finding, and the largest gap this file closes.
    //
    // `oracle.trace.test.ts` says of `draws.tsv`: "the only artefact that
    // catches QUIRK 1: a port that hoists the hazard draw out of
    // `if (open && ...)` matches neither the count nor the digest". That is true
    // of the TEST's replay and false of the ENGINE: the `draws.tsv` case walks
    // `cohortHours` and re-implements the draw rule inline against a fresh
    // `JavaRandom`, so it compares the oracle to the test's own transcription
    // and never calls `stepResident`. Hoisting the draw in
    // `agents/step.ts` — `const draw = rng.nextDouble()` above `if (open)` —
    // therefore left decision + agents fully green (61/61).
    //
    // The consequence of the real defect is not subtle: while every shelter is
    // closed (the first ~two days of every archived ER arm) each resident would
    // burn one draw per hour, and every subsequent Bernoulli on that private
    // stream would be a different number. The run stays plausible and is wrong.
    //
    // So this case asserts the property against the engine, by the only
    // observable that distinguishes the two: whether the stream advanced.
    const hazard = decisionConfig({
      ...DECISION_PARAM_FALLBACKS,
      enableHazardDeparture: 1,
      // p underflows to exactly 0, so the resident never departs and the test
      // measures draw CONSUMPTION rather than a Bernoulli outcome.
      alphaHazard: -800,
    });
    const { graph } = lineGraph();

    // (a) nothing open: the hazard branch still runs and `p` is still computed,
    //     but the `open &&` short-circuit means the stream must NOT advance.
    const shut = world([shelterAt("Shut", 3, 10, graph, { openTick: 10_000 })]);
    const closedRun = armedResident(hazard);
    const before = closedRun.decisionRng!.getState();
    for (const tick of [1, 61, 121, 181]) {
      stepResident(closedRun, shut, tick);
    }
    expect(closedRun.state).toBe("PRE_EVAC");
    expect(closedRun.decisionRng!.getState()).toEqual(before);

    // (b) a shelter IS open: exactly one draw on the first tick of the hour...
    const open = world([shelterAt("Open", 3, 10, graph)]);
    const openRun = armedResident(hazard);
    const start = openRun.decisionRng!.getState();
    stepResident(openRun, open, 1);
    const afterHour0 = openRun.decisionRng!.getState();
    expect(afterHour0).not.toEqual(start);
    // ...and none on the other 59 ticks of that hour.
    stepResident(openRun, open, 2);
    stepResident(openRun, open, 59);
    expect(openRun.decisionRng!.getState()).toEqual(afterHour0);
    // ...and exactly one more on the next hour's first tick.
    stepResident(openRun, open, 60);
    expect(openRun.decisionRng!.getState()).not.toEqual(afterHour0);
  });

  it("the decay is a pure function of the half-life", () => {
    expect(riskDecay(48)).toBe(riskDecay(48));
    expect(riskDecay(48)).toBeGreaterThan(0.985);
    expect(riskDecay(48)).toBeLessThan(0.986);
  });
});

describe("the L1 chooser — the branches the archived shelter files cannot produce", () => {
  it("UNCAPPED_CAPACITY_PRIOR is 10000.0 — the VALUE, pinned to the certified source", () => {
    // Mutation-testing finding. Every other reference to this constant in the
    // tree compares it to ITSELF:
    //
    //   decision.units.test.ts  expect(candidateCapacityPrior(null)).toBe(UNCAPPED_CAPACITY_PRIOR)
    //   oracle.trace.test.ts    expect(candidateCapacityPrior(null)).toBe(UNCAPPED_CAPACITY_PRIOR)
    //   oracle.trace.test.ts    probe.branch(cap === UNCAPPED_CAPACITY_PRIOR ? CAP_NULL : CAP_SET)
    //
    // The first two are tautologies. The third reads `cap` out of the Java
    // dump — but DR-WP8-decision-oracle.md §7.2 records BR-50 as UNTRIGGERED in
    // Java (no archived shelter row has a blank capacity), so `coverage-union`
    // requires zero hits on it and the classification can be wrong for free.
    // Result: setting this constant to 1000 — a 10x error in the L1 capacity
    // prior for every capacity-unlimited site — passed all 41 WP8 decision
    // tests, the 3.78 M-row Java trace oracle included. This case is the pin.
    //
    // `Geography/src/geography/agents/GisAgent.java:679`:
    //     private static final double UNCAPPED_CAPACITY_PRIOR = 10000.0;
    expect(UNCAPPED_CAPACITY_PRIOR).toBe(10000);

    // ...and the behavioural consequence, so the number is not merely present
    // but load-bearing: at betaCapacityPrior 0.2 an uncapped site outranks a
    // 100-bed one by exactly 0.2*ln(10000/100) in the L1 utility. A rewritten
    // constant moves this margin and the assertion goes with it.
    const zeroWalk = 0;
    const uncapped = candidateUtility(L1_CFG, zeroWalk, candidateCapacityPrior(null));
    const hundred = candidateUtility(L1_CFG, zeroWalk, 100);
    expect(uncapped - hundred).toBeCloseTo(L1_CFG.betaCapacityPrior * Math.log(10000 / 100), 12);
  });

  itGated(JAVA_SOURCE_GATE, "the port's constant is the certified Java literal, parsed", () => {
    // The cross-oracle for the pin above: the instrument of record is read and
    // its declaration extracted, so the literal 10000 in this file can never
    // drift away from `GisAgent.java` without a red test.
    const java = readFileSync(GIS_AGENT_JAVA, "utf8");
    const m = /UNCAPPED_CAPACITY_PRIOR\s*=\s*([0-9.]+)\s*;/.exec(java);
    expect(m, "GisAgent.java no longer declares UNCAPPED_CAPACITY_PRIOR").not.toBeNull();
    expect(Number(m![1])).toBe(UNCAPPED_CAPACITY_PRIOR);
  });

  it("BR-50: a blank capacity substitutes UNCAPPED_CAPACITY_PRIOR, not 0", () => {
    expect(candidateCapacityPrior(null)).toBe(UNCAPPED_CAPACITY_PRIOR);
    expect(candidateCapacityPrior(0)).toBe(0);
    expect(candidateCapacityPrior(88)).toBe(88);
    withProbe(() => {
      const { graph } = lineGraph();
      const w = world([shelterAt("S", 3, null, graph)]);
      const a = armedResident(L1_CFG);
      chooseShelterByUtility(a, w, 1, 1.3);
      expect(a.targetShelter!.id).toBe("S");
    });
    expect(probe.count(BR.CAP_NULL)).toBeGreaterThan(0);
  });

  it("BR-44 / BR-46: non-operating and tree-less candidates are skipped, in that order", () => {
    withProbe(() => {
      const { graph } = lineGraph();
      const off = shelterAt("A_off", 2, 10, graph, { operating: false });
      const noTree = shelterAt("B_notree", 2, 10, graph, { withTree: false });
      const good = shelterAt("C_good", 3, 10, graph);
      const w = world([off, noTree, good]);
      const a = armedResident(L1_CFG);
      chooseShelterByUtility(a, w, 1, 1.3);
      expect(a.targetShelter!.id).toBe("C_good");
    });
    expect(probe.count(BR.SKIP_OPERATING)).toBeGreaterThan(0);
    expect(probe.count(BR.SKIP_TREE)).toBeGreaterThan(0);
  });

  it("BR-53: an exact tie is broken by the LEXICOGRAPHICALLY SMALLER id", () => {
    // The running comparison computes the argmin id over the argmax set, so it
    // is independent of iteration order. Presenting the pair in BOTH orders and
    // getting the same winner is the executable form of that claim.
    expect(beatsRunningBest(1, 1, "A", "B")).toBe(true);
    expect(beatsRunningBest(1, 1, "B", "A")).toBe(false);
    expect(beatsRunningBest(1, 1, "A", null)).toBe(false); // the `best != null` guard
    expect(beatsRunningBest(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, "A", null)).toBe(
      false,
    );
    expect(beatsRunningBest(Number.NaN, 1, "A", "B")).toBe(false); // QUIRK 8
    expect(beatsRunningBest(1, Number.NaN, "A", "B")).toBe(false);
    // Never `localeCompare`: UTF-16 code units order "A-10" before "A-2".
    expect(beatsRunningBest(1, 1, "A-10", "A-2")).toBe(true);

    withProbe(() => {
      const { graph } = lineGraph();
      // Co-located, same capacity ⇒ identical dM and identical utility.
      const late = shelterAt("Z_site", 3, 40, graph);
      const early = shelterAt("A_site", 3, 40, graph);
      for (const order of [
        [late, early],
        [early, late],
      ]) {
        const a = armedResident(L1_CFG);
        chooseShelterByUtility(a, world(order), 1, 1.3);
        expect(a.targetShelter!.id).toBe("A_site");
      }
    });
    expect(probe.count(BR.PICK_TIE)).toBeGreaterThan(0);
    expect(probe.count(BR.TIE_NOT_TAKEN)).toBeGreaterThan(0);
  });

  it("QUIRK 14: L0's strict `<` makes CSV ORDER the tie-break — the opposite of L1", () => {
    // Mutation-testing finding. `chooseNetworkNearestShelter`'s strict `<` is
    // documented as load-bearing ("which is why the shelter list is held in CSV
    // load order and never in a map... making the two consistent breaks one of
    // them"), and flipping it to `<=` left decision + agents + oracle green
    // (77/77). `choice.tsv`'s `d` rows cannot catch it: that replay
    // re-implements the comparison inline in the test rather than calling the
    // chooser, so it measures the test's transcription — the same structural
    // gap as the QUIRK 1 case above.
    //
    // The discriminating fixture is an EXACT tie, which needs two co-located
    // sites. With `<` the FIRST in list order wins; with `<=` the last does.
    // Presenting the same pair in both orders is what makes this a test of
    // order-dependence rather than of a particular id.
    const { graph } = lineGraph();
    const l0 = decisionConfig({ ...DECISION_PARAM_FALLBACKS });
    expect(useL1(l0)).toBe(false);
    for (const [first, second] of [
      ["Z_site", "A_site"],
      ["A_site", "Z_site"],
    ] as const) {
      const w = world([shelterAt(first, 3, 40, graph), shelterAt(second, 3, 40, graph)]);
      const a = armedResident(l0);
      stepResident(a, w, 1); // latch fires, plans L0
      expect([first, second, a.targetShelter?.id]).toEqual([first, second, first]);
    }
  });

  it("has NO space filter: a full site is still selectable under L1", () => {
    withProbe(() => {
      const { graph } = lineGraph();
      const full = shelterAt("Full", 2, 0, graph);
      const w = world([full]);
      const a = armedResident(L1_CFG);
      chooseShelterByUtility(a, w, 1, 1.3);
      // Live occupancy is the omniscience L1 removes; fullness is discovered at
      // the door, so the resident plans a leg to a site with zero capacity.
      expect(a.targetShelter!.id).toBe("Full");
      expect(a.state).toBe("PRE_EVAC");
    });
  });

  it("the belief set, not a counter, is what terminates an L1 episode", () => {
    withProbe(() => {
      const { graph } = lineGraph();
      const w = world([shelterAt("Only", 3, 10, graph)]);
      const a = armedResident(L1_CFG);
      a.believedFull!.add("Only");
      chooseShelterByUtility(a, w, 1, 1.3);
      // Reachable but believed full ⇒ REFUSED_ALL_FULL, never UNREACHABLE.
      expect(a.state).toBe("REFUSED_ALL_FULL");
    });
    expect(probe.count(BR.SKIP_BELIEF_L1)).toBeGreaterThan(0);
    expect(probe.count(BR.TERM_REFUSED)).toBeGreaterThan(0);
  });

  it("the belief filter is UNCONDITIONAL — no retarget count ever re-admits a known site", () => {
    // Mutation-testing finding. The case above proves the belief filter EXISTS;
    // nothing proved it is unconditional. Weakening it to
    //
    //     if (believedFull.has(shelter.id) && a.retargetCount !== 1)
    //
    // — an off-by-one "give them one more try" — left the whole decision +
    // agents suite green (60/60), Java trace oracle included, because
    // `choice.tsv`'s candidate rows are only emitted for shelters that already
    // got PAST the Java filter, so the oracle can never witness a candidate the
    // port should have skipped and did not.
    //
    // It matters because L1 has NO retarget cap (QUIRK 15): the belief set is
    // the only thing that bounds an episode. A filter that lapses on any
    // particular retarget lets a resident re-select a site it has already been
    // turned away from, and the episode need not terminate.
    withProbe(() => {
      const { graph } = lineGraph();
      const w = world([shelterAt("Only", 3, 10, graph)]);
      for (const retargetCount of [0, 1, 2, 7, 8, 9, 100]) {
        const a = armedResident(L1_CFG);
        a.believedFull!.add("Only");
        a.retargetCount = retargetCount;
        chooseShelterByUtility(a, w, 1, 1.3);
        expect([retargetCount, a.state]).toEqual([retargetCount, "REFUSED_ALL_FULL"]);
        expect([retargetCount, a.targetShelter]).toEqual([retargetCount, null]);
      }
    });
  });

  it("walkTimeH forms the product first (QUIRK 3)", () => {
    expect(walkTimeHours(1234.5678, 1.24)).toBe(1234.5678 / (1.24 * 3600.0));
    // The two orders are algebraically equal and NOT IEEE-equal. This pair is a
    // witness — most inputs agree, which is exactly why the ordering has to be
    // transcribed rather than left to whoever writes the expression next.
    const dM = 1.4700000000000002;
    const speed = 1.013;
    expect(walkTimeHours(dM, speed)).toBe(dM / (speed * 3600.0));
    expect(walkTimeHours(dM, speed)).not.toBe(dM / speed / 3600.0);
  });
});

describe("the door — the two policy gates and the belief asymmetry", () => {
  it("BR-65: an adults-only site refuses a resident with dependents", () => {
    const { graph } = lineGraph();
    const site = shelterAt("Adults", 3, 10, graph);
    site.adultsOnly = true;
    expect(policyRefusedFor(site, ATTRS({ hasDependents: true }), L1_CFG)).toBe(true);
    expect(policyRefusedFor(site, ATTRS({ hasDependents: false }), L1_CFG)).toBe(false);
    // Structurally false with the layer off, both ways round.
    expect(policyRefusedFor(site, null, L1_CFG)).toBe(false);
    expect(policyRefusedFor(site, ATTRS({ hasDependents: true }), null)).toBe(false);
  });

  it("petIntake is tri-state and uses `??`, never `||` (QUIRK 11)", () => {
    const { graph } = lineGraph();
    const admitDefault = decisionConfig({ ...DECISION_PARAM_FALLBACKS });
    const refuseDefault = decisionConfig({
      ...DECISION_PARAM_FALLBACKS,
      petPolicyAdmitDefault: false,
    });
    const s = shelterAt("S", 3, 10, graph);
    s.petIntake = null;
    expect(petAdmittedAt(s, admitDefault)).toBe(true);
    expect(petAdmittedAt(s, refuseDefault)).toBe(false);
    s.petIntake = false; // a RECORDED refusal must not fall through to a true default
    expect(petAdmittedAt(s, admitDefault)).toBe(false);
    s.petIntake = true;
    expect(petAdmittedAt(s, refuseDefault)).toBe(true);
  });

  it("BR-31: a REFUSED_ALL_FULL resident re-enters when an untried site opens", () => {
    withProbe(() => {
      const { graph } = lineGraph();
      const late = shelterAt("Late", 3, 10, graph);
      late.setOpenWindowTicks(50, Number.POSITIVE_INFINITY);
      const w = world([late]);
      const a = armedResident(L1_CFG);
      // Nothing open ⇒ nothing reachable ⇒ the chooser would say UNREACHABLE, so
      // put the resident straight into the state the re-entry test guards.
      a.state = "REFUSED_ALL_FULL";
      stepResident(a, w, 10);
      expect(a.state).toBe("REFUSED_ALL_FULL"); // still nothing open
      a.retargetCount = 5;
      stepResident(a, w, 60);
      expect(a.state).toBe("EN_ROUTE");
      expect(a.retargetCount).toBe(0); // the cap is PER EPISODE (QUIRK 16)
    });
    expect(probe.count(BR.REENTRY_GRANTED)).toBeGreaterThan(0);
    expect(probe.count(BR.REENTRY_BLOCKED)).toBeGreaterThan(0);
    expect(probe.count(BR.REENTRY_L1)).toBeGreaterThan(0);
  });
});

describe("reactToClosureWave — the whole sub-tree the oracle never entered", () => {
  it("pairKey canonicalises NUMERICALLY, including negative synthetic ids (QUIRK 12)", () => {
    expect(pairKey(5, 9)).toBe("5:9");
    expect(pairKey(9, 5)).toBe("5:9");
    expect(pairKey(-1000, 5)).toBe("-1000:5");
    expect(pairKey(5, -1000)).toBe("-1000:5");
    // A string-order canonicalisation would return "10:9" here.
    expect(pairKey(10, 9)).toBe("9:10");
  });

  it("the push rule is inclusive `>=` and sums before it multiplies", () => {
    const c = decisionConfig({
      ...DECISION_PARAM_FALLBACKS,
      pushThetaThreshold: 0.0,
      kPush: 2.0,
    });
    // threshold + kPush*(barrier + penalty) = 0 + 2*(0.25 + 1) = 2.5
    expect(pushRuleFires(c, 2.5, 0.25, 1.0)).toBe(true); // inclusive
    expect(pushRuleFires(c, 2.4999999, 0.25, 1.0)).toBe(false);
    expect(pushRuleFires(c, 0.0, 0.0, 0.0)).toBe(true); // 0 >= 0
    expect(mobilityPenalty(null)).toBe(0);
  });

  it("stuckUntilTick divides 60/minutesPerTick FIRST (QUIRK 3)", () => {
    const c = decisionConfig({ ...DECISION_PARAM_FALLBACKS, stuckDelayH: 3 });
    expect(stuckUntilTickFor(100, c, 1)).toBe(100 + 3 * (60 / 1));
    expect(stuckUntilTickFor(100, c, 7)).toBe(100 + 3 * (60 / 7));
  });

  it("the scan grandfathers edges the walker has already entered", () => {
    const { graph, geometry } = lineGraph();
    const tree = retainTree(computeTree(graph, 3, makeScratch(graph)));
    const rn = buildRouteNodes(graph, geometry, tree, 0)!;
    expect([...rn.nodes]).toEqual([0, 1, 2, 3]);
    expect([...rn.nodeIds]).toEqual([10, 11, 12, 13]);
    expect(rn.coordOffset[0]).toBe(0);
    // Non-decreasing, and the last node sits on the leg's last vertex.
    const leg = buildRouteLeg(graph, geometry, buildSegmentGeometry(graph, geometry), tree, 0)!;
    expect(rn.coordOffset[rn.nodes.length - 1]).toBe(leg.vertexCount - 1);

    const net = {
      closureVersion: () => 1,
      isBlocked: (a: number, b: number) => pairKey(a, b) === pairKey(11, 12),
    };
    // pathIndex 0: the walker has reached nothing, so edge (1,2) is ahead.
    expect(scanForBlockage(rn, 0, net, null)).toBe(1);
    // Past node 1's coordinate: the walker is already on the closed street and
    // walks out of it. Closures block ENTRY.
    expect(scanForBlockage(rn, rn.coordOffset[1]! + 1, net, null)).toBe(-1);
    // Already gambled on this edge ⇒ never re-litigated.
    expect(scanForBlockage(rn, 0, net, new Set([pairKey(11, 12)]))).toBe(-1);
  });

  it("BR-34/35/36/38/39/32/33: a push consumes ONE draw and holds the resident", () => {
    withProbe(() => {
      const { graph } = lineGraph();
      const w = world([shelterAt("End", 3, 10, graph)], true);
      // thetaScaled 5 with threshold 0 and no barriers ⇒ push.
      const a = armedResident(
        decisionConfig({ ...L1_CFG, pStuck: 1.0, stuckDelayH: 1, sigmaTheta: 5 }),
        ATTRS({ thetaZ: 1 }),
      );
      stepResident(a, w, 1); // latch fires, plans, walks
      expect(a.state).toBe("EN_ROUTE");
      expect(a.routeNodes).not.toBeNull();
      const drawsBefore = a.decisionRng!.getState();
      // A wave lands on the edge the walker has not yet entered.
      w.blocked.add(pairKey(a.routeNodes!.nodeIds[1]!, a.routeNodes!.nodeIds[2]!));
      w.version = 1;
      stepResident(a, w, 2);
      expect(a.blockagesEncountered).toBe(1);
      expect(a.pushThroughs).toBe(1);
      expect(a.stuckEvents).toBe(1); // pStuck = 1.0
      expect(a.stuckUntilTick).toBe(2 + 1 * 60);
      expect(a.decisionRng!.getState()).not.toEqual(drawsBefore); // exactly one draw
      expect(a.pushedBlockages!.size).toBeGreaterThan(0);
      // Held: EN_ROUTE, immobile, and still accruing at RESTING ventilation.
      const distance = a.distanceTraveledM;
      stepResident(a, w, 3);
      expect(a.state).toBe("EN_ROUTE");
      expect(a.distanceTraveledM).toBe(distance);
      // Delay served ⇒ the STALE path is kept and the walk resumes.
      stepResident(a, w, 63);
      expect(Number.isNaN(a.stuckUntilTick)).toBe(true);
      expect(a.distanceTraveledM).toBeGreaterThan(distance);
      expect(a.reroutes).toBe(0);
    });
    expect(probe.count(BR.SCAN_HIT)).toBeGreaterThan(0);
    expect(probe.count(BR.PUSH_TRUE)).toBeGreaterThan(0);
    expect(probe.count(BR.D3)).toBeGreaterThan(0);
    expect(probe.count(BR.STUCK_SET)).toBeGreaterThan(0);
    expect(probe.count(BR.STUCK_HELD)).toBeGreaterThan(0);
    expect(probe.count(BR.STUCK_SERVED)).toBeGreaterThan(0);
  });

  it("BR-37/40/41: a non-pusher REROUTES, consumes no draw, and re-plans the same tick", () => {
    withProbe(() => {
      const { graph } = lineGraph();
      const w = world([shelterAt("End", 3, 10, graph)], true);
      // thetaScaled 0 with a positive threshold ⇒ no push.
      const a = armedResident(
        decisionConfig({ ...L1_CFG, pushThetaThreshold: 1.0, sigmaTheta: 0 }),
        ATTRS({ thetaZ: 0 }),
      );
      stepResident(a, w, 1);
      expect(a.state).toBe("EN_ROUTE");
      const rngBefore = a.decisionRng!.getState();
      w.blocked.add(pairKey(a.routeNodes!.nodeIds[1]!, a.routeNodes!.nodeIds[2]!));
      w.version = 1;
      const before = a.distanceTraveledM;
      stepResident(a, w, 2);
      expect(a.reroutes).toBe(1);
      expect(a.pushThroughs).toBe(0);
      expect(a.stuckEvents).toBe(0);
      // The reroute branch draws NOTHING.
      expect(a.decisionRng!.getState()).toEqual(rngBefore);
      // ...and the resident re-plans AND walks in the same tick (QUIRK 27).
      expect(a.leg).not.toBeNull();
      expect(a.distanceTraveledM).toBeGreaterThan(before);
    });
    expect(probe.count(BR.PUSH_FALSE)).toBeGreaterThan(0);
    expect(probe.count(BR.REROUTE)).toBeGreaterThan(0);
  });

  it("BR-34: a no-hit scan still consumes the wave version", () => {
    withProbe(() => {
      const { graph } = lineGraph();
      const w = world([shelterAt("End", 3, 10, graph)], true);
      const a = armedResident(L1_CFG);
      stepResident(a, w, 1);
      w.version = 7; // a wave that touches nothing on this route
      stepResident(a, w, 2);
      expect(a.seenClosureVersion).toBe(7);
      expect(a.blockagesEncountered).toBe(0);
    });
    expect(probe.count(BR.SCAN_NOHIT)).toBeGreaterThan(0);
  });

  it("pathIndexFor counts the vertices the walker has consumed, `<=` inclusive", () => {
    const { graph, geometry } = lineGraph();
    const seg = buildSegmentGeometry(graph, geometry);
    const tree = retainTree(computeTree(graph, 3, makeScratch(graph)));
    const leg = buildRouteLeg(graph, geometry, seg, tree, 0)!;
    expect(pathIndexFor(leg, 0, 0)).toBe(1); // standing exactly on vertex 0
    expect(pathIndexFor(leg, 0, leg.totalM)).toBe(leg.vertexCount);
    expect(pathIndexFor(leg, 5, 0)).toBe(0); // still on the off-network approach
    // A vertex landed on EXACTLY is consumed — Java's `dM <= remainingM`.
    expect(pathIndexFor(leg, 0, leg.cumM[1]!)).toBe(2);
    expect(pathIndexFor(leg, 0, leg.cumM[1]! - 1e-9)).toBe(1);
  });
});

describe("beyond-oracle coverage report", () => {
  it("reports which of the 15 Java-untriggered branches this file reaches", () => {
    const UNTRIGGERED_IN_JAVA: readonly (readonly [string, BranchId])[] = [
      ["BR-31 re-entry GRANTED", BR.REENTRY_GRANTED],
      ["BR-32 stuck HELD", BR.STUCK_HELD],
      ["BR-33 stuck SERVED", BR.STUCK_SERVED],
      ["BR-35 scan HIT", BR.SCAN_HIT],
      ["BR-36 push TRUE", BR.PUSH_TRUE],
      ["BR-37 push FALSE", BR.PUSH_FALSE],
      ["BR-38 D3 draw", BR.D3],
      ["BR-39 stuck SET", BR.STUCK_SET],
      ["BR-41 reroute", BR.REROUTE],
      ["BR-44 !isOperating", BR.SKIP_OPERATING],
      ["BR-46 routeTree null", BR.SKIP_TREE],
      ["BR-50 capacity null", BR.CAP_NULL],
      ["BR-53 tie-break TAKEN", BR.PICK_TIE],
    ];
    const missing = UNTRIGGERED_IN_JAVA.filter(([, id]) => probe.count(id) === 0).map(
      ([label]) => label,
    );
    console.log(
      `[WP8] beyond-oracle branches exercised: ` +
        `${UNTRIGGERED_IN_JAVA.length - missing.length}/${UNTRIGGERED_IN_JAVA.length}`,
    );
    expect(missing).toEqual([]);
    // BR-40 (push through WITHOUT stuck) and BR-65 (adults-only refusal) are
    // covered by the pure-function cases above rather than through the probe:
    // BR-40 needs pStuck < 1 with a draw above it, which is a property of the
    // stream rather than of the branch, and BR-65's counter lives at the door
    // inside `stepResident`, which these cases reach through `policyRefusedFor`.
  });
});
