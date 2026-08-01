/**
 * wp8-r3-own-engine.test.ts — WP8's flagship acceptance criterion, as a gate.
 *
 * `IMPLEMENTATION_PLAN.md` §5.1 Tier 2 and §8 WP8:
 *
 * > **Tier-2 own-engine R3 byte-identity** (flagship) + closures-inert variant
 *
 * The comparator is `harness/r3-identity.ts` — the transcription of
 * `verify_E_runs.py`'s `compare_table()` / `check_r3()` — and **this file does
 * not touch it**. The operator exclusion set is empty everywhere below, so the
 * only columns ever dropped are `sim_id`, `commit` and anything
 * wall-clock-shaped; `time_started_local` and `time_arrived_local` are compared,
 * and so are `random_seed` and `data_version`.
 *
 * ── Two scenarios, and why the second one is not the first ─────────────────
 *
 * | scenario | null side | reference side | what varies |
 * |---|---|---|---|
 * | `shipped` | E0-degenerate preset, armed by `Simulation` alone | no-layer preset | `enableDecisionLayer` |
 * | `armed` | E0-degenerate preset, decision layer live | no-layer preset | `enableDecisionLayer` |
 * | `closures-inert` | armed E0-degenerate, `closuresCode 3` on an all-inert schedule | the **same armed config**, `closuresCode 0` | the closure schedule only |
 *
 * The closures-inert reference is the same E0-degenerate configuration rather
 * than the no-layer one on purpose. Comparing an armed closures run against an
 * unarmed no-layer run moves two variables at once, and a pass would prove
 * neither of them inert.
 *
 * `shipped` and `armed` differ only in who calls `armResident`, and the suite
 * asserts they produce identical bytes — see "the shipped path" below.
 *
 * ── The finding this suite used to keep visible, and how it was retired ────
 *
 * `ContextCreator.java:772-804` step 11 arms every resident with
 * `setDecisionLayer`. For most of WP8 the port had that function
 * (`engine/src/decision/arm.ts`, `armResident`), oracle-tested — and **no call
 * site for it in `engine/src/sim.ts`**. Every full-engine run therefore took the
 * WP7 legacy branch whatever `enableDecisionLayer` said, and R3 passed
 * *vacuously*: it compared two runs neither of which had a decision layer.
 *
 * That call site now exists. `Simulation`'s constructor resolves the run's one
 * `DecisionConfig` (`sim.ts#resolveDecisionConfig`, which fail-fasts in both
 * directions rather than quietly picking a side) and calls `armResident` over
 * the residents it has just created, in creation order, before tick 1;
 * `SimulationOptions.decision` exists for callers that hand-assemble a world;
 * and `Simulation.armedResidents` is the witness a caller can assert on.
 *
 * Six assertions went red the moment that landed — deliberately, because they
 * were written to pin the defect. They were RETIRED here, not relaxed:
 *
 *  - `arm X: the shipped pass is VACUOUS` (x3) required `armedResidents === 0`
 *    and the six Phase-E columns empty on both sides. Both are false by design
 *    now — the null side reports 6,842 armed and a populated Phase-E block — so
 *    the cases were deleted, which is what their own comments instructed.
 *  - `arm X: SHIPPED ... byte-identical on all 57 shared columns` (x3) was only
 *    ever true *because* those six columns were blank on both sides. With the
 *    layer live they differ, so the strict projection is no longer a pass/fail
 *    frame. The `ARMED` cases below already make the stronger, still-true
 *    statements — the strict projection differs on the six Phase-E columns and
 *    NOTHING else, and the 51-column and 47-column projections are
 *    byte-identical — and they are the flagship now.
 *
 * Nothing was loosened to get here: no tolerance moved, `expectClean` still
 * demands 0 failed, 0 skipped and exactly 12 checks, and both negative controls
 * still have to go red.
 *
 * ── The shipped path, and why deleting it was the one real loss ────────────
 *
 * The `shipped` (`armDecisionLayer: false`) runs went out with those six cases.
 * Retiring each case was right; retiring the runs with them was not, and it cost
 * this file the only thing in it that could see the engine.
 *
 * Every `armed`, `closures-inert` and negative-control pair passes
 * `armDecisionLayer: true`, which routes through `harness/r3-own-engine.ts`'s
 * `armFromWorld`. That function arms the residents ITSELF, from
 * `world.residents[i].decision` and a `DecisionConfig` it rebuilds — so it
 * produces a live decision layer whether or not `Simulation` produced one. The
 * harness module doc names the hazard verbatim; this file then walked into it.
 *
 * Measured, not argued, and measured twice. A verification pass replaced the
 * constructor's `if (this.decisionConfig !== null)` with `if (false as boolean)`
 * — a total revert of the WP8 wiring — and this suite reported **all 24 of its
 * then-cases green**. The experiment was repeated when the cases below were
 * written: with the same line disabled the file goes red **6 failed / 30 passed
 * of 36**, and every one of the 24 pre-existing cases is still in the passing
 * 30. The six reds are the six added here.
 *
 * So one `armDecisionLayer: false` pair per arm is back, and the cases on it are
 * the ones that hold clause 1:
 *
 *  - `SHIPPED — the ENGINE arms the run` asserts `Simulation.armedResidents`
 *    (the constructor's own counter, carried out as `R3Run.simArmedResidents`)
 *    is 6,842 on the E0-null side and 0 on the layer-off reference, plus the
 *    independent recount from `decisionConfig !== null`. This is the case that
 *    goes red under the revert above.
 *  - the two `SHIPPED` projections re-prove the flagship identity on a run this
 *    file did not touch.
 *  - `the harness's arming is a CROSS-CHECK` requires the engine-armed and
 *    re-armed runs to be byte-identical on all three documents, which is what
 *    licenses reading the `armed` results as statements about the shipped model.
 *
 * `armFromWorld` was hardened at the same time: it now compares its rebuilt
 * `DecisionConfig` field-for-field against `world.decisionConfig` before
 * overwriting anything, so the `= true` path is a cross-check of the shipped
 * coefficients rather than a way around them.
 *
 * Gated on `pipeline/out/assets` and `Geography/`.
 */

import { beforeAll, expect, it } from "vitest";

// `engine/package.json` publishes no `./decision` subpath, so the branch probe —
// the only seam that can witness *which* re-entry predicate a full-scale run
// consulted — is reached the same relative way `harness/r3-own-engine.ts`
// reaches `armResident`.
import {
  BR,
  CountingDecisionProbe,
  setDecisionProbe,
} from "../../engine/src/decision/probe.js";
import { artifactGate, describeGated, type ArtifactRef } from "../../tools/artifact-gate.js";
import {
  Checks,
  E_AGENT_COLS,
  R3_ARMS,
  SE_AGENT_COLS,
  buildInertClosureSchedule,
  checkR3,
  compareTable,
  frameOf,
  overlayDataSource,
  projectReference,
  r3NegativeControlConfig,
  r3NullConfig,
  runR3Configuration,
  runOwnEngineR3PairAsync,
  runR3ConfigurationAsync,
  unexpectedPresetDelta,
  type OwnEngineR3Pair,
  type R3Arm,
  type R3Projection,
} from "../src/harness/index.js";
import { ASSET_DIR, GEOGRAPHY_DIR } from "../src/headless.js";

const TOPOLOGY: ArtifactRef = {
  source: "graph-asset",
  label: "topology",
  path: `${ASSET_DIR}/graph-topology.bin`,
};
const GEOMETRY: ArtifactRef = {
  source: "graph-asset",
  label: "geometry",
  path: `${ASSET_DIR}/graph-geometry.bin`,
};
const CLOSURES: ArtifactRef = {
  source: "geography",
  label: "data/closures/closures_E_r1_worst.csv",
  path: `${GEOGRAPHY_DIR}/data/closures/closures_E_r1_worst.csv`,
};

const gate = artifactGate({
  gate: "validation:wp8-r3-own-engine",
  suite: "WP8 flagship — Tier-2 own-engine R3 byte-identity",
  evidence:
    "the plan's Tier-2 acceptance: a TS E0-degenerate run and a TS no-layer run, arms A/B/C at " +
    "seed 42, compared column-for-column as raw text under the ported verify_E_runs (a) " +
    "exclusion discipline, plus the closures-inert variant (an all-inert closure schedule " +
    "loaded and its runtime built, changing nothing)",
  artifacts: [TOPOLOGY, GEOMETRY, CLOSURES],
});

/**
 * Full scale, because that is what the criterion is stated at: n = 6,842,
 * seed 42, 312 h — the archived E0-null configuration.
 */
const N_AGENTS = 6842;
const HOURS = 312;
const SEED = 42;

/** The engine work all happens in `beforeAll`; the cases themselves are cheap. */
const PREPARE_TIMEOUT_MS = 1_800_000;
const CASE_TIMEOUT_MS = 120_000;

// --- the runs, built once, in beforeAll --------------------------------------
//
// Twenty-one full 6,842 x 312 h runs — three arms x (shipped pair + armed pair
// + closures-inert pair), plus the negative-control pair and the single L1
// probe. Two properties are load-bearing about how they are produced:
//
//  1. **Once.** Every case reads the same objects, so the suite measures one set
//     of runs rather than re-running the engine per assertion.
//  2. **With a yield between them.** `sim.run()` is one uninterrupted
//     synchronous block. Six of them back to back starve vitest's worker RPC
//     and it reports `Timeout calling "onTaskUpdate"` as an unhandled error —
//     observed at 175 s for a single case. Awaiting a macrotask between runs
//     lets the heartbeat through. It changes nothing about the runs: the engine
//     is synchronous and single-threaded either way.

const yieldToEventLoop = (): Promise<void> =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

const BASE = { numAgents: N_AGENTS, simulationHours: HOURS, seed: SEED } as const;

interface ArmRuns {
  /** `armDecisionLayer: false` — nothing but `Simulation` arms this pair. */
  readonly shipped: OwnEngineR3Pair;
  readonly armed: OwnEngineR3Pair;
  readonly closuresInert: OwnEngineR3Pair;
}

let inert: ReturnType<typeof buildInertClosureSchedule>;
const armRuns = new Map<R3Arm, ArmRuns>();
let negativeControl: OwnEngineR3Pair;

/** The `informationRegime = 1` probe: did it finish, and what did it reach? */
let l1Error: string | null = null;
let l1Consults = 0;
let l1L0Consults = 0;

/** Present only after `beforeAll`; reading it earlier is a bug, not a skip. */
function runsFor(arm: R3Arm): ArmRuns {
  const hit = armRuns.get(arm);
  if (hit === undefined) {
    throw new Error(`arm ${arm} was not prepared`);
  }
  return hit;
}

beforeAll(async () => {
  if (gate.action !== "run") {
    return;
  }
  inert = buildInertClosureSchedule();
  const inertData = overlayDataSource(inert.overlayPath, inert.derivedText);

  for (const arm of R3_ARMS) {
    // The SHIPPED pair FIRST, because it is the one that measures the engine.
    // `armDecisionLayer: false` means this file contributes nothing to the run:
    // whatever carries a DecisionConfig at tick 1 was armed by `Simulation`.
    const shipped = await runOwnEngineR3PairAsync({ arm, armDecisionLayer: false, ...BASE });
    await yieldToEventLoop();
    const armed = await runOwnEngineR3PairAsync({ arm, armDecisionLayer: true, ...BASE });
    await yieldToEventLoop();
    const closuresInert = await runOwnEngineR3PairAsync({
      arm,
      armDecisionLayer: true,
      referenceKind: "same-config",
      closuresCode: 3,
      referenceClosuresCode: 0,
      data: inertData,
      labelSuffix: "closures-inert",
      ...BASE,
    });
    await yieldToEventLoop();
    armRuns.set(arm, { shipped, armed, closuresInert });
  }

  negativeControl = await runOwnEngineR3PairAsync({
    arm: "A",
    armDecisionLayer: true,
    nullKind: "negative-control",
    informationRegime: 0,
    labelSuffix: "negctl",
    ...BASE,
  });
  await yieldToEventLoop();

  // The L1 probe. `Simulation` now declares `anyUntriedReachableShelter`, so an
  // `informationRegime = 1` run finishes; the branch probe is installed around
  // it because "it finished" alone cannot distinguish a run that consulted the
  // L1 predicate from one that never reached `REFUSED_ALL_FULL` at all.
  //
  // The probe is process-wide, so it is installed for exactly this run and
  // removed in `finally` — every other run in this file is measured with no
  // probe installed, which is also how `hit()` stays a null test for them.
  const l1Probe = new CountingDecisionProbe();
  setDecisionProbe(l1Probe);
  try {
    await runR3ConfigurationAsync({
      config: r3NegativeControlConfig("A", { ...BASE, informationRegime: 1 }),
      label: "TS-ERlayer-A-L1probe",
      armDecisionLayer: true,
    });
  } catch (err) {
    l1Error = err instanceof Error ? err.message : String(err);
  } finally {
    setDecisionProbe(null);
  }
  l1Consults = l1Probe.count(BR.REENTRY_L1);
  l1L0Consults = l1Probe.count(BR.REENTRY_L0);
}, PREPARE_TIMEOUT_MS);

/** Run gate (a) over a pair under one reference projection. */
function r3(pair: OwnEngineR3Pair, projection: R3Projection): Checks {
  const ck = new Checks();
  checkR3(ck, pair.nullRun.view, projectReference(pair.refRun, projection));
  return ck;
}

function expectClean(ck: Checks, what: string): void {
  expect(ck.failed.length, `${what}\n${ck.failureReport()}`).toBe(0);
  expect(ck.skipped.length, `${what}: unexpected SKIP`).toBe(0);
  expect(ck.results.length, `${what}: check census`).toBe(12);
}

/** The `N cols x M rows` detail line of the agents byte-identity check. */
function dimensionsOf(ck: Checks, table: "agents.csv" | "shelters.csv"): string {
  const hit = ck.results.find((c) => c.name === `(a) ${table}: shared-projection byte-identity`);
  if (hit === undefined) {
    throw new Error(`no byte-identity check for ${table}`);
  }
  return hit.detail;
}

// ---------------------------------------------------------------------------

describeGated(gate, () => {
  it("premise: each arm's two presets differ in enableDecisionLayer and nothing else", () => {
    for (const arm of R3_ARMS) {
      expect(unexpectedPresetDelta(arm), `arm ${arm}`).toEqual([]);
    }
  });

  it(
    "slicing the tick loop is bit-identical to running it in one block",
    async () => {
      // `beforeAll` uses `runHeadlessAsync`, which drives `Simulation.runUntil`
      // one simulated day at a time so vitest's worker heartbeat survives a
      // nine-minute file. That is only legitimate if the slice boundary is
      // invisible to the model — asserted here on all three output documents at
      // a size small enough to run twice, rather than argued for in a comment.
      const cfg = { ...r3NullConfig("A"), numAgents: 400, simulationHours: 312 };
      const whole = runR3Configuration({
        config: cfg,
        label: "slice-check-whole",
        armDecisionLayer: true,
      });
      const sliced = await runR3ConfigurationAsync({
        config: cfg,
        label: "slice-check-sliced",
        armDecisionLayer: true,
      });
      expect(sliced.docs.agentsCsv).toBe(whole.docs.agentsCsv);
      expect(sliced.docs.sheltersCsv).toBe(whole.docs.sheltersCsv);
      expect(sliced.docs.simulationJson).toBe(whole.docs.simulationJson);
    },
    CASE_TIMEOUT_MS,
  );

  it("the closures-inert schedule is the certified one with every hour past the run end", () => {
    const s = inert;
    expect(s.rows).toBe(72);
    // The certified draw-1 worst schedule: WP8-SPEC-archive-gates.md §1.2.
    expect(s.sourceHours).toEqual([3, 44, 72, 142, 265, 303]);
    expect(s.derivedHours).toEqual([1003, 1044, 1072, 1142, 1265, 1303]);
    for (const h of s.derivedHours) {
      expect(h).toBeGreaterThanOrEqual(HOURS);
    }
    expect(s.derivedSha256).not.toBe(s.sourceSha256);
    // The CI suite writes nothing: check-scratch polices pipeline/out/.
    expect(s.derivedPath).toBeNull();
  });

  for (const arm of R3_ARMS) {
    // --- 0. the SHIPPED path — the only cases that measure the engine --------
    //
    // Every `armed` case below passes `armDecisionLayer: true`, which routes
    // through the harness's own `armFromWorld` and OVERWRITES
    // `Resident.decisionConfig` with a harness-rebuilt config. That is a
    // cross-check of the coefficients, not a witness of the wiring: it arms the
    // residents itself, so it passes whether or not `Simulation` armed anybody.
    // MEASURED, not feared — with the constructor's
    // `if (this.decisionConfig !== null)` replaced by `if (false as boolean)`,
    // every one of those cases still passes and only the three SHIPPED arming
    // witnesses and the three cross-checks below go red.
    //
    // These three cases per arm are the repair. They pass
    // `armDecisionLayer: false`, so the suite contributes NOTHING to the run and
    // both witnesses below are readings of `engine/src/sim.ts` alone.

    it(
      `arm ${arm}: SHIPPED — the ENGINE arms the run: 6,842 on the null side, 0 on the reference`,
      () => {
        const { shipped } = runsFor(arm);
        // Two independent numbers, and they have to agree. `simArmedResidents`
        // is `Simulation.armedResidents`, the constructor's own counter;
        // `armedResidents` is recounted after the run from
        // `decisionConfig !== null` over the finished residents. A counter
        // incremented without arming fails the second; an arming the class does
        // not admit to fails the first.
        expect(shipped.nullRun.simArmedResidents, "Simulation.armedResidents").toBe(N_AGENTS);
        expect(shipped.armedResidents, "residents holding a DecisionConfig").toBe(N_AGENTS);
        expect(shipped.refRun.simArmedResidents).toBe(0);
        expect(shipped.refRun.armedResidents).toBe(0);
        // ... and the layer is not merely attached: pAwareInit = 1.0 makes
        // aware_initial 1 for all of them, and theta_z is a real per-resident
        // draw, so the Phase-E block is populated rather than default-filled.
        expect(new Set(shipped.nullRun.view.agents.column("aware_initial"))).toEqual(
          new Set(["1"]),
        );
        expect(new Set(shipped.nullRun.view.agents.column("theta_z")).size).toBeGreaterThan(100);
      },
      CASE_TIMEOUT_MS,
    );

    it(
      `arm ${arm}: SHIPPED — byte-identical over the 51-column e-appended projection`,
      () => {
        const ck = r3(runsFor(arm).shipped, "e-appended");
        expectClean(ck, `arm ${arm} shipped/e-appended`);
        expect(dimensionsOf(ck, "agents.csv")).toBe(`51 cols x ${N_AGENTS} rows`);
      },
      CASE_TIMEOUT_MS,
    );

    it(
      `arm ${arm}: SHIPPED — byte-identical at the archive's own 47 x 6,842 dimensions`,
      () => {
        const ck = r3(runsFor(arm).shipped, "archive-shaped");
        expectClean(ck, `arm ${arm} shipped/archive-shaped`);
        expect(dimensionsOf(ck, "agents.csv")).toBe(`47 cols x ${N_AGENTS} rows`);
        expect(dimensionsOf(ck, "shelters.csv")).toBe(`11 cols x ${arm === "C" ? 46 : 36} rows`);
      },
      CASE_TIMEOUT_MS,
    );

    it(
      `arm ${arm}: the harness's arming is a CROSS-CHECK — engine-armed and re-armed runs are byte-identical`,
      () => {
        // What licenses reading the `armed` cases below as statements about the
        // shipped model. `armFromWorld` already refuses to run unless its
        // rebuilt DecisionConfig equals `world.decisionConfig` field-for-field;
        // this is the outcome-level form of the same claim, on all three output
        // documents at full scale. If re-arming perturbed anything — an RNG
        // draw, a state, a derived barrier cost — these bytes would differ.
        const { shipped, armed } = runsFor(arm);
        expect(armed.nullRun.docs.agentsCsv).toBe(shipped.nullRun.docs.agentsCsv);
        expect(armed.nullRun.docs.sheltersCsv).toBe(shipped.nullRun.docs.sheltersCsv);
        expect(armed.nullRun.docs.simulationJson).toBe(shipped.nullRun.docs.simulationJson);
      },
      CASE_TIMEOUT_MS,
    );

    // --- 1. the armed path — the flagship ------------------------------------

    it(
      `arm ${arm}: ARMED E0-degenerate layer is live — every resident carries a DecisionConfig`,
      () => {
        const { armed } = runsFor(arm);
        expect(armed.armedResidents).toBe(N_AGENTS);
        expect(armed.refRun.armedResidents).toBe(0);
        // aware_initial is 1 for all of them (pAwareInit = 1.0), and theta_z is
        // a real draw — so the block is genuinely populated, not blank.
        expect(new Set(armed.nullRun.view.agents.column("aware_initial"))).toEqual(new Set(["1"]));
        expect(new Set(armed.nullRun.view.agents.column("theta_z")).size).toBeGreaterThan(100);
      },
      CASE_TIMEOUT_MS,
    );

    it(
      `arm ${arm}: ARMED — the strict projection differs on the six Phase-E columns and NOTHING else`,
      () => {
        const { armed } = runsFor(arm);
        const ck = new Checks();
        const cmp = compareTable(
          ck,
          "agents.csv",
          armed.nullRun.view.agents,
          armed.refRun.view.agents,
          "agent_id",
          [...E_AGENT_COLS, ...SE_AGENT_COLS],
          new Set(),
        );
        expect(cmp).not.toBeNull();
        // The layer-off writer emits columns 50-55 empty; the archive's R3
        // reference does not have them at all. That is a writer-generation
        // difference, and it is the ONLY thing allowed to move.
        expect([...(cmp?.perColumn ?? [])].map((d) => d.column).sort()).toEqual(
          [...E_AGENT_COLS].sort(),
        );
        for (const d of cmp?.perColumn ?? []) {
          expect(d.differingRows, `${d.column}`).toBe(N_AGENTS);
        }
      },
      CASE_TIMEOUT_MS,
    );

    it(
      `arm ${arm}: ARMED — byte-identical over the 51-column e-appended projection`,
      () => {
        const { armed } = runsFor(arm);
        const ck = r3(armed, "e-appended");
        expectClean(ck, `arm ${arm} armed/e-appended`);
        expect(dimensionsOf(ck, "agents.csv")).toBe(`51 cols x ${N_AGENTS} rows`);
      },
      CASE_TIMEOUT_MS,
    );

    it(
      `arm ${arm}: ARMED — byte-identical at the archive's own 47 x 6,842 dimensions`,
      () => {
        const { armed } = runsFor(arm);
        const ck = r3(armed, "archive-shaped");
        expectClean(ck, `arm ${arm} armed/archive-shaped`);
        // WP8-SPEC-archive-gates.md §2.5: "agents 47 cols x 6,842 rows;
        // shelters 11 cols x 36 rows (A, B) or 11 x 46 (C)".
        expect(dimensionsOf(ck, "agents.csv")).toBe(`47 cols x ${N_AGENTS} rows`);
        expect(dimensionsOf(ck, "shelters.csv")).toBe(`11 cols x ${arm === "C" ? 46 : 36} rows`);
      },
      CASE_TIMEOUT_MS,
    );

    // --- 2. the closures-inert variant ---------------------------------------

    it(
      `arm ${arm}: CLOSURES-INERT — the schedule really is loaded and really does nothing`,
      () => {
        const { closuresInert } = runsFor(arm);
        const w = closuresInert.nullRun.closures;
        expect(w.runtimePresent, "ClosureRuntime was not built").toBe(true);
        expect(w.hasClosureSchedule).toBe(true);
        expect(w.scheduledEdges).toBe(72);
        expect(w.matchingGraphEdges).toBe(72);
        expect(w.waves).toBe(6);
        expect(w.inertWaves).toBe(6);
        expect(w.inertRows).toBe(72);
        // Nothing fired, so the version counter never moved and step 10 of
        // stepResident stayed structurally unreachable.
        expect(w.wavesApplied).toBe(0);
        expect(w.closureVersionAtEnd).toBe(0);
        expect(w.blockedEdgesAtEnd).toBe(0);
        // ... but `routeNodes` WAS allocated, which is the code path a
        // closuresCode-0 run never executes. The reference has none.
        expect(w.residentsWithRouteNodes).toBeGreaterThan(0);
        expect(closuresInert.refRun.closures.runtimePresent).toBe(false);
        expect(closuresInert.refRun.closures.residentsWithRouteNodes).toBe(0);
      },
      CASE_TIMEOUT_MS,
    );

    it(
      `arm ${arm}: CLOSURES-INERT — byte-identical to the same run with no closures`,
      () => {
        const { closuresInert } = runsFor(arm);
        const ck = r3(closuresInert, "strict");
        expectClean(ck, `arm ${arm} closures-inert/strict`);
        expect(dimensionsOf(ck, "agents.csv")).toBe(`57 cols x ${N_AGENTS} rows`);
        expect(dimensionsOf(ck, "shelters.csv")).toBe(`12 cols x ${arm === "C" ? 46 : 36} rows`);
      },
      CASE_TIMEOUT_MS,
    );
  }

  // --- the negative control -------------------------------------------------

  it(
    "NEGATIVE CONTROL: arming the ER (baseline-real) layer on the same geometry breaks R3",
    () => {
      // Same arm, same shelter CSV, same smoke series, same seed — only the
      // decision layer's parameterisation moves (WP8-SPEC-archive-gates.md §1.8,
      // right-hand column, with informationRegime held at 0 so that the
      // *coefficients* are the only thing under test; regime 1 is executable and
      // is exercised on its own by the L1 case below). If this passed, the
      // `armed` results above would mean
      // "armResident reaches nothing", not "the degenerate layer changes
      // nothing".
      const control = negativeControl;
      expect(control.armedResidents).toBe(N_AGENTS);
      // ~64% start unaware (pAwareInit 0.356) and lambdaOutreachPerDay is 0, so
      // they never convert — the archived ER signature.
      expect(control.nullRun.census["UNAWARE"] ?? 0).toBeGreaterThan(N_AGENTS * 0.5);

      const ck = r3(control, "archive-shaped");
      expect(ck.failed.length, "the ER layer changed nothing — arming is inert").toBeGreaterThan(0);
      expect(
        ck.failed.some((c) => c.name === "(a) agents.csv: shared-projection byte-identity"),
      ).toBe(true);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    "informationRegime = 1 completes a full-scale run and really does consult the L1 re-entry predicate",
    () => {
      // This case used to assert the opposite, and was right to: `step.ts`
      // throws when an L1 resident re-enters from REFUSED_ALL_FULL and the
      // StepWorld declares no `anyUntriedReachableShelter`, and `Simulation`
      // declared none. It never bit at run time only because the layer was never
      // armed, so `useL1()` was unconditionally false — a defect hidden behind a
      // defect. Both are wired now, so the case states the positive.
      //
      // "It completed" is necessary and nowhere near sufficient: a run in which
      // no resident ever reaches REFUSED_ALL_FULL also completes, and would have
      // completed just as happily with the predicate still missing. The branch
      // counter is what separates the two, and BR-28 is incremented at exactly
      // the call site (`step.ts`, `hit(l1 ? BR.REENTRY_L1 : BR.REENTRY_L0)`).
      expect(l1Error, "informationRegime = 1 did not complete a run").toBeNull();
      expect(l1Consults, "the L1 re-entry predicate was never consulted").toBeGreaterThan(0);
      // ... and it was the L1 predicate, not the omniscient L0 one. Reusing the
      // availability view here would reintroduce exactly the omniscience L1
      // removes, while every "the run completes" assertion stayed green.
      expect(l1L0Consults, "an L1 run used the L0 (omniscient) predicate").toBe(0);
    },
    CASE_TIMEOUT_MS,
  );

  // --- the comparator must be able to fail on this data ---------------------

  it(
    "the comparator goes red when one cell of one armed E0-null row is perturbed",
    () => {
      const { armed } = runsFor("A");
      const ck = new Checks();
      const rows = armed.nullRun.view.agents.rows.map((r) => [...r]);
      const idx = armed.nullRun.view.agents.columns.indexOf("total_travel_distance_m");
      expect(idx).toBeGreaterThan(-1);
      const first = rows[0] as string[];
      first[idx] = `${first[idx]}0`; // 1234.56 -> 1234.560: same number, different text
      const perturbed = frameOf(
        "perturbed agents.csv",
        armed.nullRun.view.agents.columns,
        rows,
      );
      const cmp = compareTable(
        ck,
        "agents.csv",
        perturbed,
        armed.refRun.view.agents,
        "agent_id",
        [...E_AGENT_COLS, ...SE_AGENT_COLS],
        new Set(),
      );
      expect(cmp?.identical).toBe(false);
      expect(cmp?.perColumn.some((d) => d.column === "total_travel_distance_m")).toBe(true);
    },
    CASE_TIMEOUT_MS,
  );
});
