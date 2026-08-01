/**
 * r3-own-engine.ts — the Tier-2 **own-engine** R3 identity, WP8's flagship.
 *
 * `IMPLEMENTATION_PLAN.md` §5.1 Tier 2:
 *
 * > TS E0-degenerate run vs TS no-layer run: shared-column projection
 * > **byte-identical** under `verify_E_runs.py` (a) exclusion discipline
 * > (excluding only sim_id/commit/wallclock — never the `*_local` columns).
 *
 * and `WP8-SPEC-archive-gates.md` §2.6 names the second arm, the *closures-inert
 * variant*: the same identity with the Scenario-E closure layer present but
 * parameterised so that it cannot change an outcome.
 *
 * The comparator itself is `r3-identity.ts` and is **not touched by this
 * module**. Everything here is about producing the two runs and presenting them
 * to that comparator in the shape the certified Python was written for.
 *
 * ── Why a reference projection is needed at all ────────────────────────────
 *
 * In the Java archive the R3 reference is a run written by an *older writer*:
 * `docs/runs/present-day-three-arm/` carries 49 `agents.csv` columns, the E0
 * nulls carry 55 (logger v1) or 59 (logger v2). The six Phase-E attribute
 * columns and the four Scenario-E counters are therefore **null-only**, which is
 * exactly what `compare_table`'s `e_only_cols` allowance is for
 * (`WP8-SPEC-archive-gates.md` §2.2).
 *
 * The port has **one** writer. `writeAgentsCsv` always emits the full 59-column
 * v2 header (`engine/src/output/logger.ts:238`), so an own-engine pair has
 * identical column *sets* and the Phase-E block lands in the **shared**
 * projection — where a layer-on run reports `1 / 0 / … / -0.386471` against a
 * layer-off run's six empty fields. That is a writer-version artefact, not a
 * modelling divergence: with the layer off those attributes do not exist, and
 * the archive encodes their absence by not having the columns.
 *
 * So three projections are computed and all three are reported. None of them
 * changes a rule inside the comparator; they change which *reference frame* is
 * handed to it.
 *
 * | id | reference frame | agents cols compared | what it proves |
 * |---|---|---|---|
 * | `strict` | untouched, 59 cols | 57 | the raw feed — every differing column named |
 * | `e-appended` | minus the 6 Phase-E cols (53) | 51 | strongest passing form: counters still compared |
 * | `archive-shaped` | minus all 10 appended cols (49) | 47 | the archive's own dimensions (§2.5) |
 *
 * `strict` is the honest one: if anything outside the Phase-E block moves, it
 * shows up there and the other two are meaningless. `e-appended` is the one a
 * gate should assert on, because it still compares `blockages_encountered`,
 * `push_throughs`, `reroutes` and `stuck_events` — which the archive-shaped
 * projection gives away. `archive-shaped` exists so the measured dimensions can
 * be quoted against the archived line "agents **47 cols × 6,842 rows**".
 *
 * ── The arming seam, why it is here, and what it is now ────────────────────
 *
 * `ContextCreator.java:772-804` step 11 calls `setDecisionLayer` on every
 * created resident, and **`engine/src/sim.ts` carries that call site**:
 * `Simulation`'s constructor resolves the run's single `DecisionConfig` through
 * `sim.ts#resolveDecisionConfig` (taking `SimulationOptions.decision` when a
 * caller hand-assembles a world, `world.decisionConfig` otherwise, and refusing
 * to run when the two disagree or when either contradicts
 * `enableDecisionLayer`), then calls `armResident` over the residents it has
 * just created, in creation order, before tick 1. `Simulation.armedResidents`
 * counts them; {@link R3Run.simArmedResidents} carries that counter out
 * unchanged, and {@link R3Run.armedResidents} re-counts independently from
 * `decisionConfig !== null` rather than trusting it.
 *
 * That was not always true, and this seam is the shape of the gap it closed.
 * For most of WP8 `armResident` was exported and oracle-tested while `sim.ts`
 * invoked it nowhere, so `a.decisionConfig === null` for every resident in
 * every full-engine run and `step.ts` took the WP7 legacy branch whatever
 * `enableDecisionLayer` said. R3 passed *vacuously* — it compared two runs
 * neither of which had a layer — and a vacuous pass reported as the flagship
 * criterion would have been the worst available outcome for this work package.
 * So the harness grew its own arming path and ran both arms, the unarmed one
 * carrying {@link OwnEngineR3Pair.armedResidents} as the witness. The engine is
 * wired now; the seam stays because a *caller* that can arm, count and compare
 * is what turns "the layer ran" from an inherited claim into a measurement.
 *
 * {@link R3RunOptions.armDecisionLayer} is therefore no longer the difference
 * between a live layer and a dead one. It is the difference between measuring
 * the shipped path and cross-checking it:
 *
 *  - `= false` — **the shipped path, untouched.** This module does nothing to
 *    the run; every resident carrying a `DecisionConfig` at tick 1 was armed by
 *    `Simulation`, so `simArmedResidents` and `armedResidents` are readings of
 *    the engine's own wiring and nothing else. This is the ONLY configuration
 *    in which this harness can observe that wiring at all — see the warning
 *    below — and `test/wp8-r3-own-engine.test.ts` runs one full-scale pair per
 *    arm this way for exactly that reason.
 *  - `= true` — {@link armFromWorld} re-applies step 11 through the engine's own
 *    `armResident`, from the same sampled attributes (`world.residents[i]
 *    .decision`) and a `DecisionConfig` rebuilt here. `armResident` only assigns
 *    and derives — it draws no randomness — so re-applying it changes nothing
 *    the model reads. What it buys is an arming the *caller* performed and can
 *    therefore count and assert on, rather than one it has to take on trust.
 *    (It is not invisible to a `DecisionProbe`: the arming-time branches
 *    BR-AWARE_INIT / BR-UNAWARE_INIT / BR-PACE_OFF are counted twice on this
 *    path. Per-tick branches, which is what a run-level probe is usually after,
 *    are unaffected.)
 *
 * The `= true` path **overwrites** `Resident.decisionConfig` with its own
 * instance, which is invisible at the call site and used to be an unchecked
 * redundancy. It is now a cross-check: {@link armFromWorld} compares the config
 * it built field-for-field against `world.decisionConfig` and throws on the
 * first disagreement, BEFORE assigning anything. The two are equal by
 * construction — `armFromWorld` and `world/build.ts:531` both feed the same
 * `RunConfig` through the same 19-argument positional `decisionConfigPositional`,
 * and the one textual difference (`c.petPolicyDefault === 1` here vs
 * `petPolicyAdmitDefaultFrom(...)` there) is the same predicate — so the
 * assertion is expected to hold; its job is to make a future drift a failure
 * instead of a silent substitution of the harness's coefficients for the
 * shipped ones.
 *
 * ⚠️ **What that cross-check still cannot see, and why the shipped pair is
 * mandatory.** `armFromWorld` proves the two *coefficient sources* agree. It
 * cannot prove `Simulation` armed anybody, because on that path the harness
 * arms them itself: `world.decisionConfig` is built by `buildWorld` and exists
 * whether or not the constructor's loop runs. This is measured, not feared — a
 * verification pass disabled that loop outright and the flagship suite, whose
 * every armed pair passed `armDecisionLayer: true`, stayed green on all 24 of
 * its cases; the experiment reproduces today, with only the
 * `armDecisionLayer: false` cases added since going red. Such a case is the
 * only thing in this harness that can see the engine stop arming.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PARAM_NAMES, parseRunConfig, PRESETS, type RunConfig } from "@websim/shared";
import { decodeCsvBytes, readCsvText, type CsvRow } from "@websim/engine/loader";
import { resolveClosuresCsv, type WorldBuildResult, type WorldDataSource } from "@websim/engine/world";
import type { Simulation } from "@websim/engine/sim";
import { sha256Hex } from "@websim/pipeline/archive";

// `engine/package.json` publishes no `./decision` subpath, and adding one is
// outside this suite's write scope. A relative deep import is the same thing
// `pipeline/scripts/build-committed-slice.ts:76` already does for `./graph`
// internals, and it resolves through the workspace source tree either way.
import { armResident } from "../../../engine/src/decision/arm.js";
import {
  DECISION_CONFIG_FIELDS,
  decisionConfigPositional,
  type DecisionConfig,
} from "../../../engine/src/decision/config.js";

import {
  GEOGRAPHY_DIR,
  runHeadless,
  runHeadlessAsync,
  type HeadlessResult,
} from "../headless.js";
import { E_AGENT_COLS, E_SHELTER_COLS, SE_AGENT_COLS } from "./constants.js";
import { runFromDocuments, type RunDocuments, type RunView } from "./run-view.js";

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

/**
 * Default `--write` target for the operator CLI.
 *
 * NOT written to by the test suite. `tools/check-scratch.ts` polices every
 * direct child of `pipeline/out/` against an allowlist, and this name is not on
 * it, so an evidence dump left here is a (correctly) reported leftover — clean
 * it up, or add the entry to `PRODUCED_ENTRIES` naming this script as producer.
 */
export const R3_OUT_DIR = here("../../../pipeline/out/r3-own-engine");

// ---------------------------------------------------------------------------
// configurations
// ---------------------------------------------------------------------------

/** The three archived geometries the E0 nulls are proved against. */
export const R3_ARMS = ["A", "B", "C"] as const;
export type R3Arm = (typeof R3_ARMS)[number];

/**
 * `{ nullPreset, refPreset }` per arm. The two presets in each row differ in
 * **exactly one field**, `enableDecisionLayer` — asserted below rather than
 * asserted about, because "the presets are the same apart from the switch" is
 * the entire premise of R3 and a silent drift would make the identity trivial.
 */
const ARM_PRESETS: Readonly<Record<R3Arm, { readonly nul: string; readonly ref: string }>> = {
  A: { nul: "E0_null_A", ref: "A_present_day" },
  B: { nul: "E0_null_B", ref: "B_capacity_meets_demand" },
  C: { nul: "E0_null_C", ref: "C_expanded_plus_new_sites" },
};

function preset(name: string): RunConfig {
  const raw = (PRESETS as unknown as Record<string, unknown>)[name];
  if (raw === undefined) {
    throw new Error(`no preset '${name}'`);
  }
  return parseRunConfig(raw, `preset ${name}`);
}

/** Field names on which the E0-null and the no-layer preset may differ. */
const ALLOWED_PRESET_DELTA = new Set(["enableDecisionLayer"]);

/**
 * The premise check: the two presets of an arm differ only in the master
 * switch. Returns the differing field names so a caller can report them.
 */
export function presetDelta(arm: R3Arm): readonly string[] {
  const { nul, ref } = ARM_PRESETS[arm];
  const a = preset(nul) as unknown as Record<string, number>;
  const b = preset(ref) as unknown as Record<string, number>;
  return PARAM_NAMES.filter((k) => a[k] !== b[k]);
}

export interface R3ConfigOptions {
  readonly numAgents?: number;
  readonly simulationHours?: number;
  readonly seed?: number;
  /**
   * `3` + `closureDraw 1` selects `closures_E_r1_worst.csv`, which the
   * closures-inert arm overlays with an hour-shifted derivative. `0` is the
   * plain no-closures configuration.
   */
  readonly closuresCode?: number;
}

function withOverrides(base: RunConfig, o: R3ConfigOptions): RunConfig {
  return {
    ...base,
    numAgents: o.numAgents ?? base.numAgents,
    simulationHours: o.simulationHours ?? base.simulationHours,
    randomSeed: o.seed ?? base.randomSeed,
    closuresCode: o.closuresCode ?? base.closuresCode,
  };
}

export function r3NullConfig(arm: R3Arm, o: R3ConfigOptions = {}): RunConfig {
  return withOverrides(preset(ARM_PRESETS[arm].nul), o);
}

export function r3ReferenceConfig(arm: R3Arm, o: R3ConfigOptions = {}): RunConfig {
  return withOverrides(preset(ARM_PRESETS[arm].ref), o);
}

export interface NegativeControlOptions extends R3ConfigOptions {
  /**
   * `0` (default) is the archived L0 regime. `1` is the ER regime; `Simulation`
   * declares `anyUntriedReachableShelter`, so it completes a run.
   *
   * The default stays 0 so that the negative control moves the layer's
   * *coefficients* and nothing else — see {@link r3NegativeControlConfig}.
   */
  readonly informationRegime?: 0 | 1;
}

/**
 * The message `stepResident` throws the first time an L1 resident re-enters from
 * `REFUSED_ALL_FULL` over a `StepWorld` that declares no
 * `anyUntriedReachableShelter` (`engine/src/agents/step.ts`).
 *
 * `Simulation` **does** declare it now, so no full-engine run raises this and
 * `informationRegime = 1` runs to completion. The constant is kept because the
 * fail-fast it names is still live and still load-bearing: `StepWorld` makes the
 * predicate optional, several unit fixtures implement the interface by hand, and
 * the one thing `step.ts` must never do is quietly fall back to
 * `anyShelterAvailable` — that view is prefiltered on `hasSpaceFor` and would
 * restore precisely the omniscience L1 exists to remove, while every "the run
 * completes" assertion stayed green. Recorded as a constant so a suite can
 * assert the exact failure rather than "it throws something".
 */
export const L1_MISSING_PREDICATE = "needs the L1 re-entry predicate";

/**
 * The **negative control**: the arm's E0-degenerate config with the decision
 * layer moved to its baseline-real (ER) parameterisation and nothing else
 * touched — same geometry, same shelter CSV (`shelterPolicyVariant` stays 0),
 * same smoke series, same seed.
 *
 * Values from `WP8-SPEC-archive-gates.md` §1.8, right-hand column, **except**
 * `informationRegime`, which defaults to the archived-E0 value 0 here rather
 * than the ER value 1. That default was originally forced — the engine could not
 * finish an L1 run at all — and is now a choice: `Simulation` declares
 * `anyUntriedReachableShelter` and regime 1 completes, but holding the regime at
 * 0 keeps the control a one-variable experiment on the layer's *coefficients*.
 * Regime 1 changes which predicate `stepResident` consults, which is a different
 * mechanism and is exercised on its own (`test/wp8-r3-own-engine.test.ts`, the
 * L1 case, which passes `informationRegime: 1` here and counts BR-28).
 * Everything that decides *whether a resident departs* still moves: hazard
 * departure on, `sigmaTheta` 1.0, the three barriers at 0.26, `pAwareInit`
 * 0.356, `gammaVuln` 0.25, pets refused by default.
 *
 * Its job is to make the armed R3 pass falsifiable: if arming a *non*-degenerate
 * layer also produced a byte-identical run, the arming would be reaching nothing
 * and the identity would be an artefact of the harness rather than a property of
 * the model. R3 must go **red** here.
 */
export function r3NegativeControlConfig(arm: R3Arm, o: NegativeControlOptions = {}): RunConfig {
  return {
    ...r3NullConfig(arm, o),
    pAwareInit: 0.356,
    groupSpeedDeltaMps: 0.06,
    informationRegime: o.informationRegime ?? 0,
    enableHazardDeparture: 1,
    sigmaTheta: 1.0,
    gammaVuln: 0.25,
    barrierBelongings: 0.26,
    barrierPet: 0.26,
    barrierDependents: 0.26,
    petPolicyDefault: 0,
    betaCapacityPrior: 0.2,
  };
}

// ---------------------------------------------------------------------------
// running
// ---------------------------------------------------------------------------

/**
 * Every field on which two `DecisionConfig`s disagree, rendered for a message.
 *
 * `DECISION_CONFIG_FIELDS` is the engine's own list in `GisAgent.DecisionConfig`
 * declaration order, so a field added to the type without being added to the
 * list would go uncompared — which is why the list lives next to the type and
 * `engine/test/decision/decision.units.test.ts` pins it to the 19 names.
 * `Object.is` rather than `===` so a `NaN` coefficient cannot compare unequal to
 * itself and a `-0` cannot pass as `0`.
 */
function decisionConfigDelta(harness: DecisionConfig, engine: DecisionConfig): readonly string[] {
  return DECISION_CONFIG_FIELDS.filter((f) => !Object.is(harness[f], engine[f])).map(
    (f) => `${f}: harness ${String(harness[f])} vs engine ${String(engine[f])}`,
  );
}

/**
 * `ContextCreator` step 11, re-performed on a constructed `Simulation` by the
 * caller.
 *
 * `Simulation`'s constructor performs step 11 itself, so this is not what stands
 * between a run and a live decision layer — see the module doc, "the arming
 * seam". It is the way a caller arms *explicitly*, gets a count back, and can
 * therefore assert on the arming instead of assuming it.
 *
 * It **overwrites** the config `Simulation` resolved with the one it builds
 * below, so before it assigns anything it compares the two field-for-field
 * against `world.decisionConfig` — the same object `resolveDecisionConfig`
 * hands the constructor when the world was built normally — and throws on the
 * first disagreement. That makes this path a cross-check of the shipped
 * coefficients rather than a way around them. It does **not** witness that
 * `Simulation` armed anyone: `world.decisionConfig` is a build product and
 * exists whether or not the constructor's loop ran. Only an
 * `armDecisionLayer: false` run can witness that.
 *
 * The `DecisionConfig` is built with `decisionConfigPositional` — the port of
 * the 19-argument positional constructor at `ContextCreator.java:781-789`, in
 * that exact argument order — and the attributes come from
 * `world.residents[i].decision`, which build step 11 already sampled in creation
 * order. Nothing is re-drawn; the RNG is untouched.
 *
 * Returns how many residents were armed.
 */
export function armFromWorld(sim: Simulation, world: WorldBuildResult, c: RunConfig): number {
  if (c.enableDecisionLayer !== 1) {
    return 0;
  }
  const cfg = decisionConfigPositional(
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
    c.petPolicyDefault === 1,
    c.betaTravelTime,
    c.betaCapacityPrior,
    c.pushThetaThreshold,
    c.kPush,
    c.pStuck,
    c.stuckDelayH,
  );

  // The cross-check, BEFORE the first assignment. `buildWorld` constructs the
  // run's DecisionConfig at step 11 from the same RunConfig; if the two
  // construction sites ever drift, this run would silently measure the
  // harness's coefficients while reporting the shipped ones.
  const engineConfig = world.decisionConfig;
  if (engineConfig === null) {
    throw new Error(
      "armFromWorld: enableDecisionLayer is 1 but buildWorld constructed no DecisionConfig — " +
        "there is nothing to cross-check the harness's coefficients against, and arming anyway " +
        "would make this run a measurement of the harness rather than of the engine",
    );
  }
  const delta = decisionConfigDelta(cfg, engineConfig);
  if (delta.length > 0) {
    throw new Error(
      `armFromWorld: the DecisionConfig built here disagrees with world.decisionConfig on ` +
        `${delta.length} field(s) — ${delta.join("; ")}. The run has ONE set of coefficients; ` +
        "overwriting the engine's with the harness's would measure the harness instead.",
    );
  }

  if (sim.residents.length !== world.residents.length) {
    throw new Error(
      `armFromWorld: ${sim.residents.length} sim residents vs ${world.residents.length} world ` +
        "residents — creation order is the decision-seed index and cannot be re-derived",
    );
  }
  let armed = 0;
  for (const [i, wr] of world.residents.entries()) {
    const da = wr.decision;
    if (da === null) {
      throw new Error(
        `armFromWorld: world resident ${i} has no sampled E-attributes but ` +
          "enableDecisionLayer is 1 — build step 11 did not run",
      );
    }
    armResident(sim.residents[i]!, cfg, da);
    armed++;
  }
  return armed;
}

export interface R3RunOptions {
  readonly config: RunConfig;
  readonly label: string;
  /**
   * `false` is the shipped path: the run is left entirely to `Simulation`.
   * `true` re-arms through {@link armFromWorld}, which cross-checks the
   * coefficients but cannot witness the engine's own arming. See the module doc.
   */
  readonly armDecisionLayer: boolean;
  readonly data?: WorldDataSource;
}

/**
 * Proof that the closure layer really was loaded, and really did nothing.
 *
 * Without these numbers "the closures-inert run is byte-identical" is
 * indistinguishable from "the schedule silently failed to load", which is the
 * one way that test could pass while proving nothing.
 */
export interface ClosureWitness {
  readonly runtimePresent: boolean;
  readonly hasClosureSchedule: boolean;
  readonly scheduledEdges: number;
  readonly matchingGraphEdges: number;
  readonly waves: number;
  readonly inertWaves: number;
  readonly inertRows: number;
  readonly waveHours: readonly number[];
  readonly wavesApplied: number;
  readonly closureVersionAtEnd: number;
  readonly blockedEdgesAtEnd: number;
  /** Residents that finished the run still holding an allocated `routeNodes`. */
  readonly residentsWithRouteNodes: number;
}

export interface R3Run {
  readonly label: string;
  readonly docs: RunDocuments;
  readonly view: RunView;
  /** Residents that reached tick 1 with `decisionConfig !== null`. */
  readonly armedResidents: number;
  /**
   * `Simulation.armedResidents` — the ENGINE's own count of the residents its
   * constructor called `armResident` on, carried out unchanged.
   *
   * Distinct from {@link armedResidents}, which is recounted here from
   * `decisionConfig !== null` over the finished run, and distinct again from
   * anything {@link armFromWorld} did. Under `armDecisionLayer: false` the two
   * must agree and both are readings of the shipped wiring; under
   * `armDecisionLayer: true` they must still agree, because the harness arms the
   * same residents the engine already did.
   */
  readonly simArmedResidents: number;
  readonly runMs: number;
  readonly census: Readonly<Record<string, number>>;
  readonly closures: ClosureWitness;
}

export function runR3Configuration(o: R3RunOptions): R3Run {
  let armed = 0;
  return collect(
    o,
    runHeadless({
      config: o.config,
      paramNames: PARAM_NAMES,
      ...(o.data === undefined ? {} : { data: o.data }),
      beforeRun: o.armDecisionLayer
        ? (sim, world): void => {
            armed = armFromWorld(sim, world, o.config);
          }
        : undefined,
    }),
    () => armed,
  );
}

/**
 * {@link runR3Configuration} over {@link runHeadlessAsync} — same run, driven in
 * slices so a long file does not starve vitest's worker heartbeat.
 */
export async function runR3ConfigurationAsync(o: R3RunOptions): Promise<R3Run> {
  let armed = 0;
  const result = await runHeadlessAsync({
    config: o.config,
    paramNames: PARAM_NAMES,
    ...(o.data === undefined ? {} : { data: o.data }),
    beforeRun: o.armDecisionLayer
      ? (sim, world): void => {
          armed = armFromWorld(sim, world, o.config);
        }
      : undefined,
  });
  return collect(o, result, () => armed);
}

function collect(o: R3RunOptions, result: HeadlessResult, armedCount: () => number): R3Run {
  const armed = armedCount();
  // Count what actually reached the tick loop rather than what we think we did.
  const actuallyArmed = result.sim.residents.filter((r) => r.decisionConfig !== null).length;
  if (o.armDecisionLayer && actuallyArmed !== armed) {
    throw new Error(
      `${o.label}: armed ${armed} residents but ${actuallyArmed} carry a DecisionConfig`,
    );
  }

  const census: Record<string, number> = {};
  for (const r of result.sim.residents) {
    census[r.state] = (census[r.state] ?? 0) + 1;
  }

  const schedule = result.world.closures;
  const runtime = result.sim.closures;
  const closures: ClosureWitness = {
    runtimePresent: runtime !== null,
    hasClosureSchedule: result.sim.hasClosureSchedule,
    scheduledEdges: schedule?.scheduledEdges ?? 0,
    matchingGraphEdges: schedule?.matchingGraphEdges ?? 0,
    waves: schedule?.waves.length ?? 0,
    inertWaves: schedule?.waves.filter((w) => w.inert).length ?? 0,
    inertRows: schedule?.inertRows ?? 0,
    waveHours: schedule?.waveHours ?? [],
    wavesApplied: runtime?.wavesApplied ?? 0,
    closureVersionAtEnd: result.sim.closureVersion(),
    blockedEdgesAtEnd: runtime?.blockedEdgeCount ?? 0,
    residentsWithRouteNodes: result.sim.residents.filter((r) => r.routeNodes !== null).length,
  };

  const docs: RunDocuments = {
    name: o.label,
    agentsCsv: result.parity.agentsCsv,
    sheltersCsv: result.parity.sheltersCsv,
    simulationJson: result.parity.simulationJson,
  };
  return {
    label: o.label,
    docs,
    view: runFromDocuments(docs),
    armedResidents: actuallyArmed,
    simArmedResidents: result.sim.armedResidents,
    runMs: result.timings.runMs,
    census,
    closures,
  };
}

// ---------------------------------------------------------------------------
// reference projections
// ---------------------------------------------------------------------------

/** The archive's `OutcomeLogger` dialect: unquoted fields, CRLF, trailing CRLF. */
const CRLF = "\r\n";

/**
 * Drop named columns from a raw `OutcomeLogger` CSV, producing the CSV an older
 * writer would have emitted.
 *
 * Text in, text out, deliberately: the projection has to be indistinguishable
 * from a file on disk, because the comparator's whole contract is that it reads
 * raw field text. Ragged rows and absent names are hard errors — a projection
 * that silently dropped nothing would turn a failing gate green.
 */
export function dropCsvColumns(csv: string, drop: readonly string[]): string {
  const lines = csv.split(CRLF);
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  const header = lines[0];
  if (header === undefined) {
    throw new Error("dropCsvColumns: empty document");
  }
  const columns = header.split(",");
  const dropSet = new Set(drop);
  const missing = drop.filter((c) => !columns.includes(c));
  if (missing.length > 0) {
    throw new Error(`dropCsvColumns: no such column(s) ${JSON.stringify(missing)}`);
  }
  const keep = columns.map((c, i) => [c, i] as const).filter(([c]) => !dropSet.has(c)).map(([, i]) => i);
  const out: string[] = [keep.map((i) => columns[i]!).join(",")];
  for (let r = 1; r < lines.length; r++) {
    const cells = (lines[r] as string).split(",");
    if (cells.length !== columns.length) {
      throw new Error(
        `dropCsvColumns: row ${r} has ${cells.length} field(s), header has ${columns.length}`,
      );
    }
    out.push(keep.map((i) => cells[i]!).join(","));
  }
  return `${out.join(CRLF)}${CRLF}`;
}

/** The three reference shapes described in the module doc. */
export type R3Projection = "strict" | "e-appended" | "archive-shaped";

export const R3_PROJECTIONS: readonly R3Projection[] = ["strict", "e-appended", "archive-shaped"];

function agentColumnsDropped(p: R3Projection): readonly string[] {
  if (p === "strict") return [];
  if (p === "e-appended") return E_AGENT_COLS;
  return [...E_AGENT_COLS, ...SE_AGENT_COLS];
}

function shelterColumnsDropped(p: R3Projection): readonly string[] {
  return p === "strict" ? [] : E_SHELTER_COLS;
}

/**
 * Re-shape a reference run as the writer generation the archive's R3 reference
 * came from. `strict` returns the run untouched.
 */
export function projectReference(run: R3Run, p: R3Projection): RunView {
  if (p === "strict") {
    return run.view;
  }
  const docs: RunDocuments = {
    name: `${run.label} [${p}]`,
    agentsCsv: dropCsvColumns(run.docs.agentsCsv, agentColumnsDropped(p)),
    sheltersCsv: dropCsvColumns(run.docs.sheltersCsv, shelterColumnsDropped(p)),
    simulationJson: run.docs.simulationJson,
  };
  return runFromDocuments(docs);
}

// ---------------------------------------------------------------------------
// the closures-inert schedule
// ---------------------------------------------------------------------------

/**
 * The certified worst-case draw-1 schedule with every activation hour pushed
 * past the run end.
 *
 * `WP8-SPEC-archive-gates.md` §1.4 records the certified reader's third
 * outcome: *"`hour >= end` → WARN, inert"*, and `closures/schedule.ts` ports it
 * as {@link ClosureWave.inert}. A schedule made entirely of such rows is the
 * sharpest form of "scheduled but parameterised inert": `hasClosureSchedule()`
 * is true, `ClosureRuntime` is constructed, `assertIntegralWaveTicks` runs,
 * every planned leg allocates `routeNodes`, `seenClosureVersion` is stamped —
 * and **not one wave ever fires**, so `getClosureVersion()` never moves and
 * step 10 of `stepResident` stays unreachable. The run must therefore be
 * byte-identical to the same run with `closuresCode = 0`.
 *
 * The archived schedules all activate inside a 312 h window (the earliest is
 * h2), and `Geography/` is read-only, so the file is derived here instead:
 * node ids, order and row count verbatim, `activation_hour + offset`. The
 * provenance sidecar records the source digest and the transform so the file
 * can never be mistaken for a certified asset.
 */
export const INERT_HOUR_OFFSET = 1000;

export interface InertScheduleResult {
  /** `data/closures/...` — the path `resolveClosuresCsv` asks the loader for. */
  readonly overlayPath: string;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  /** The derived CSV text; nothing is written unless `writeTo` is given. */
  readonly derivedText: string;
  readonly derivedSha256: string;
  /** Where it was written, or `null` when it was kept in memory. */
  readonly derivedPath: string | null;
  readonly rows: number;
  readonly sourceHours: readonly number[];
  readonly derivedHours: readonly number[];
}

export interface InertScheduleOptions {
  readonly closuresCode?: number;
  readonly closureDraw?: number;
  readonly offset?: number;
  /**
   * Directory to write the derived CSV and its provenance sidecar to.
   *
   * Omitted by default, and that default matters: `tools/check-scratch.ts`
   * treats any unlisted child of `pipeline/out/` as a leftover that can flip an
   * artifact gate's verdict, so the CI suite keeps the schedule in memory and
   * only the operator CLI (`--write`) puts it on disk.
   */
  readonly writeTo?: string;
}

export function buildInertClosureSchedule(o: InertScheduleOptions = {}): InertScheduleResult {
  const closuresCode = o.closuresCode ?? 3;
  const closureDraw = o.closureDraw ?? 1;
  const offset = o.offset ?? INERT_HOUR_OFFSET;
  const overlayPath = resolveClosuresCsv(closuresCode, closureDraw);
  if (overlayPath === null) {
    throw new Error(`closuresCode ${closuresCode} selects no schedule`);
  }
  const sourcePath = path.join(GEOGRAPHY_DIR, overlayPath);
  const sourceText = readFileSync(sourcePath, "utf8");

  const lines = sourceText.split(/\r?\n/u).filter((l) => l.length > 0);
  const header = (lines[0] as string).split(",");
  const hourIdx = header.indexOf("activation_hour");
  if (hourIdx < 0) {
    throw new Error(`${sourcePath}: no activation_hour column`);
  }
  const sourceHours = new Set<number>();
  const derivedHours = new Set<number>();
  const out: string[] = [lines[0] as string];
  for (let i = 1; i < lines.length; i++) {
    const cells = (lines[i] as string).split(",");
    const hour = Number((cells[hourIdx] as string).trim());
    if (!Number.isInteger(hour)) {
      throw new Error(`${sourcePath}: row ${i + 1} has a non-integral activation_hour`);
    }
    sourceHours.add(hour);
    derivedHours.add(hour + offset);
    cells[hourIdx] = String(hour + offset);
    out.push(cells.join(","));
  }
  const derivedText = `${out.join("\n")}\n`;

  let derivedPath: string | null = null;
  if (o.writeTo !== undefined) {
    mkdirSync(o.writeTo, { recursive: true });
    derivedPath = path.join(o.writeTo, path.basename(overlayPath).replace(".csv", "_inert.csv"));
    writeFileSync(derivedPath, derivedText);
  }

  const result: InertScheduleResult = {
    overlayPath,
    sourcePath,
    sourceSha256: sha256Hex(sourceText),
    derivedText,
    derivedSha256: sha256Hex(derivedText),
    derivedPath,
    rows: lines.length - 1,
    sourceHours: [...sourceHours].sort((a, b) => a - b),
    derivedHours: [...derivedHours].sort((a, b) => a - b),
  };
  if (o.writeTo !== undefined) {
    const { derivedText: _omit, ...provenance } = result;
    writeFileSync(
      path.join(o.writeTo, "closures-inert-provenance.json"),
      `${JSON.stringify(
        {
          schema: "websim/r3-closures-inert/v1",
          what:
            "the certified closure schedule with every activation_hour shifted past the run " +
            "end, so the schedule is loaded and the runtime built while no wave can fire",
          transform: `activation_hour += ${offset}`,
          NOT_A_CERTIFIED_ASSET: true,
          ...provenance,
        },
        null,
        2,
      )}\n`,
    );
  }
  return result;
}

/**
 * A {@link WorldDataSource} over `Geography/` that serves in-memory CSV text in
 * place of one path. Every other read goes to the read-only instrument tree
 * unchanged.
 *
 * The overlay is text rather than a filename so the CI suite can run the
 * closures-inert proof without writing anything to `pipeline/out/`.
 */
export function overlayDataSource(
  overlayPath: string,
  overlayCsv: string,
  geographyDir = GEOGRAPHY_DIR,
): WorldDataSource {
  const cache = new Map<string, readonly CsvRow[]>();
  return {
    exists(p: string): boolean {
      return p === overlayPath ? true : existsSync(path.join(geographyDir, p));
    },
    readCsv(p: string): readonly CsvRow[] {
      const hit = cache.get(p);
      if (hit !== undefined) {
        return hit;
      }
      const rows =
        p === overlayPath
          ? readCsvText(overlayCsv)
          : readCsvText(decodeCsvBytes(readFileSync(path.join(geographyDir, p))));
      cache.set(p, rows);
      return rows;
    },
  };
}

// ---------------------------------------------------------------------------
// the pair
// ---------------------------------------------------------------------------

export interface OwnEngineR3Pair {
  readonly arm: R3Arm;
  readonly nullRun: R3Run;
  readonly refRun: R3Run;
  /** Residents carrying a live `DecisionConfig` in the E0-null run. */
  readonly armedResidents: number;
}

/**
 * Which run the E0-degenerate run is compared against.
 *
 * - `no-layer` — the arm's `enableDecisionLayer = 0` preset. This is R3 proper
 *   (plan §5.1 Tier 2): the *layer* is the only thing that varies.
 * - `same-config` — the **same** E0-degenerate preset, layered identically, with
 *   only `referenceClosuresCode` changed. This is the closures-inert variant
 *   (`WP8-SPEC-archive-gates.md` §2.6 item 2): the *closure schedule* is the only
 *   thing that varies, so a difference cannot be blamed on the decision layer.
 *   Comparing an armed closures run against an unarmed no-layer run would move
 *   two variables at once and prove neither.
 */
export type R3ReferenceKind = "no-layer" | "same-config";

export interface OwnEngineR3Options extends R3ConfigOptions {
  readonly arm: R3Arm;
  readonly armDecisionLayer: boolean;
  readonly referenceKind?: R3ReferenceKind;
  /** `negative-control` swaps the null side for {@link r3NegativeControlConfig}. */
  readonly nullKind?: "e0-null" | "negative-control";
  /** Only read when `nullKind === "negative-control"`. */
  readonly informationRegime?: 0 | 1;
  /** Applied to the reference run only. */
  readonly referenceClosuresCode?: number;
  readonly data?: WorldDataSource;
  readonly referenceData?: WorldDataSource;
  readonly labelSuffix?: string;
}

/** The two `R3RunOptions` a pair is made of, so sync and async agree exactly. */
function pairSpecs(o: OwnEngineR3Options): readonly [R3RunOptions, R3RunOptions] {
  const kind: R3ReferenceKind = o.referenceKind ?? "no-layer";
  const suffix = o.labelSuffix ?? (o.armDecisionLayer ? "armed" : "shipped");
  const negative = o.nullKind === "negative-control";
  const refOverrides: R3ConfigOptions = {
    ...o,
    ...(o.referenceClosuresCode === undefined ? {} : { closuresCode: o.referenceClosuresCode }),
  };
  return [
    {
      config: negative ? r3NegativeControlConfig(o.arm, o) : r3NullConfig(o.arm, o),
      label: `TS-${negative ? "ERlayer" : "E0null"}-${o.arm}-${suffix}`,
      armDecisionLayer: o.armDecisionLayer,
      ...(o.data === undefined ? {} : { data: o.data }),
    },
    {
      config:
        kind === "no-layer"
          ? r3ReferenceConfig(o.arm, refOverrides)
          : r3NullConfig(o.arm, refOverrides),
      label:
        kind === "no-layer"
          ? `TS-nolayer-${o.arm}-${suffix}`
          : `TS-E0null-${o.arm}-${suffix}-reference`,
      // Under `no-layer` the reference is the layer-off run by definition and
      // arming it would make the comparison a tautology; under `same-config` it
      // must be armed exactly like the null or the closure schedule stops being
      // the only difference.
      armDecisionLayer: kind === "same-config" && o.armDecisionLayer,
      ...(o.referenceData === undefined ? {} : { data: o.referenceData }),
    },
  ];
}

export function runOwnEngineR3Pair(o: OwnEngineR3Options): OwnEngineR3Pair {
  const [nullSpec, refSpec] = pairSpecs(o);
  const nullRun = runR3Configuration(nullSpec);
  const refRun = runR3Configuration(refSpec);
  return { arm: o.arm, nullRun, refRun, armedResidents: nullRun.armedResidents };
}

/** {@link runOwnEngineR3Pair}, yielding between and inside the two runs. */
export async function runOwnEngineR3PairAsync(o: OwnEngineR3Options): Promise<OwnEngineR3Pair> {
  const [nullSpec, refSpec] = pairSpecs(o);
  const nullRun = await runR3ConfigurationAsync(nullSpec);
  const refRun = await runR3ConfigurationAsync(refSpec);
  return { arm: o.arm, nullRun, refRun, armedResidents: nullRun.armedResidents };
}

/** Every field name the two presets of an arm disagree on, for reporting. */
export function unexpectedPresetDelta(arm: R3Arm): readonly string[] {
  return presetDelta(arm).filter((k) => !ALLOWED_PRESET_DELTA.has(k));
}
