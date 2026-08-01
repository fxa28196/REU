/**
 * The tick loop — Repast's schedule, ported (PORT_MAP §1.1, §1.2).
 *
 * ## The three things the schedule actually guarantees
 *
 * 1. **First tick is 1, and the final tick is inclusive.** `step()` is
 *    `@ScheduledMethod(start = 1, interval = 1)` and `endAt(endTick)` runs the
 *    tick it names. That is *why* `simulationHours ≤ smokeSlices − 1`: the last
 *    tick reads hour index `simulationHours`, and a series with exactly
 *    `simulationHours` slices books fabricated zeros there (never-regress gotcha
 *    3, caught only by the `out_of_range_lookups == 0` gate).
 * 2. **Priority order within a tick.** `ClosureWave.apply()` at FIRST_PRIORITY
 *    (WP8), then every agent's `step()` at RANDOM_PRIORITY, then
 *    `OutcomeLogger.export()` once at LAST_PRIORITY. Nothing else is scheduled —
 *    there is no per-tick logger and no smoke-update method; agents pull
 *    concentration.
 * 3. **The agent order inside a tick is shuffled from the Repast default
 *    stream.** This engine draws its own documented Fisher–Yates permutation
 *    (`shuffleMt`) from the same colt MT stream — Repast's shuffle *semantics*,
 *    not its algorithm (plan Q1). It is the single declared Java-vs-TS
 *    divergence channel, and it can only matter where capacity binds (arm A) or
 *    an L0 distance tie occurs.
 *
 * ## Where the order becomes an outcome
 *
 * Arm A binds hard: 2,234 beds against 6,842 residents. Whoever steps first on
 * the tick a shelter fills gets the last bed. That is why the availability view
 * below is invalidated by **every** admission rather than recomputed per tick:
 * a resident stepping later in the same tick must see the bed that the resident
 * before it just took. Caching the resident-independent conjuncts is a
 * prefilter, not a relaxation — `anyShelterAvailable` is a disjunction, and
 * every conjunct dropped from the per-resident loop is one that cannot change
 * between two residents within a tick unless an admission happened, which bumps
 * the epoch.
 *
 * ## The constructor is also `ContextCreator`'s step 11
 *
 * Repast's `ContextCreator` creates the residents (step 10) and then, in a
 * separate pass over the same list, arms each of them with the run's one
 * `DecisionConfig` (step 11, `setDecisionLayer`). The port splits that across a
 * build/run seam the certified model does not have — `buildWorld` samples the
 * E-attributes and constructs the config, this constructor performs the arming —
 * so the constructor below ends with the second half of step 11, over the
 * residents it has just created, in creation order, before tick 1.
 *
 * It is not optional plumbing. Until it existed, `Resident.decisionConfig` was
 * `null` in every run this class produced, `step.ts`'s `layer` flag was
 * unconditionally false, and an `informationRegime = 1` / hazard-departure /
 * pet-policy configuration executed the WP7 legacy path and reported a
 * plausible-looking wrong run. `engine/test/decision/wiring.test.ts` is the gate
 * that now fails if it goes away again; {@link Simulation.armedResidents} is the
 * witness a caller can assert on.
 */

import type { GraphGeometry } from "@websim/shared/graph-asset";

import { Resident } from "./agents/resident.js";
import { stepResident, type StepWorld } from "./agents/step.js";
import { ClosureRuntime, type ClosureWaveReport } from "./closures/runtime.js";
import { armResident } from "./decision/arm.js";
import { DECISION_CONFIG_FIELDS, type DecisionConfig } from "./decision/config.js";
import type { RoutingGraph } from "./graph/csr.js";
import type { SegmentGeometry } from "./graph/cumLen.js";
import { shuffleMt } from "./rng/streams.js";
import type { Shelter } from "./shelters/shelter.js";
import type { SmokeField } from "./smoke/field.js";
import type { WorldBuildResult } from "./world/build.js";

export type AgentOrder = "shuffle-mt" | "identity";

/** First field on which two `DecisionConfig`s disagree, or `null`. */
function firstDecisionConfigDelta(a: DecisionConfig, b: DecisionConfig): string | null {
  for (const f of DECISION_CONFIG_FIELDS) {
    if (!Object.is(a[f], b[f])) {
      return `${f}: ${String(a[f])} vs ${String(b[f])}`;
    }
  }
  return null;
}

/**
 * Which `DecisionConfig` the run is armed with, and the fail-fasts around it.
 *
 * The master switch is `enableDecisionLayer == 1` and it is *strict*, exactly as
 * `ContextCreator.java:777` is: with anything else the certified model never
 * calls `setDecisionLayer` at all, which is what makes a legacy arm
 * byte-identical rather than "identical because the coefficients happened to be
 * degenerate". So the switch and the config must agree, and a disagreement is an
 * error here rather than a quiet decision to run one of the two.
 */
function resolveDecisionConfig(
  world: WorldBuildResult,
  supplied: DecisionConfig | null | undefined,
): DecisionConfig | null {
  const fromWorld = world.decisionConfig;
  const layerOn = world.config.enableDecisionLayer === 1;
  const cfg = supplied === undefined ? fromWorld : supplied;

  if (supplied !== undefined && supplied !== null && fromWorld !== null) {
    const delta = firstDecisionConfigDelta(supplied, fromWorld);
    if (delta !== null) {
      throw new Error(
        "SimulationOptions.decision disagrees with the DecisionConfig the world build " +
          `constructed at step 11 (${delta}): the run has one set of coefficients, and two ` +
          "sources for them is how a parameter change silently fails to reach the model",
      );
    }
  }
  if (layerOn && cfg === null) {
    throw new Error(
      "enableDecisionLayer is 1 but no DecisionConfig reached Simulation: the residents would " +
        "run the WP7 legacy path while the manifest claimed a decision-layer run, which is a " +
        "plausible-looking wrong run rather than a failure",
    );
  }
  if (!layerOn && cfg !== null) {
    throw new Error(
      `enableDecisionLayer is ${world.config.enableDecisionLayer} but a DecisionConfig was ` +
        "supplied: the certified build never calls setDecisionLayer unless the switch is " +
        "exactly 1, and arming anyway would break every legacy-arm identity",
    );
  }
  return cfg;
}

export interface SimulationOptions {
  readonly world: WorldBuildResult;
  readonly graph: RoutingGraph;
  readonly geometry: GraphGeometry;
  readonly seg: SegmentGeometry;
  readonly smoke: SmokeField;
  /** Run-wide fallback speed; read only by residents without sampled attributes. */
  readonly walkingSpeedMps: number;
  readonly evacuationThresholdUgM3: number;
  /** Default `shuffle-mt`; `identity` exists for internal determinism tests only. */
  readonly agentOrder?: AgentOrder;
  /**
   * The run's `GisAgent.DecisionConfig` — the second half of `ContextCreator`'s
   * step 11 (`setDecisionLayer` over the created residents).
   *
   * **Omit it and the world's own is used.** `buildWorld` constructs the config
   * at step 11 from the same `RunConfig` that drove the build, so a caller that
   * built its world normally never needs to pass this. It exists for callers
   * that hand-assemble a {@link WorldBuildResult} (closure and step unit tests),
   * and it is checked field-for-field against `world.decisionConfig` when both
   * are present: two disagreeing sources of the run's coefficients is precisely
   * how a config change silently fails to reach the model.
   *
   * `null` means "the layer is off", and is only legal when the world's
   * `enableDecisionLayer` is not 1.
   */
  readonly decision?: DecisionConfig | null | undefined;
  /** Called once per simulated hour with the tick just completed. */
  readonly onHour?: ((hour: number, tick: number) => void) | undefined;
  /** Called once per fired closure wave, at FIRST_PRIORITY (Java's one printf). */
  readonly onClosureWave?: ((report: ClosureWaveReport) => void) | undefined;
}

export class Simulation implements StepWorld {
  readonly graph: RoutingGraph;
  readonly geometry: GraphGeometry;
  readonly seg: SegmentGeometry;
  readonly smoke: SmokeField;
  readonly shelters: readonly Shelter[];
  readonly residents: readonly Resident[];

  readonly minutesPerTick: number;
  readonly walkingSpeedMps: number;
  readonly evacuationThresholdUgM3: number;
  readonly ticksPerHour: number;
  readonly endTick: number;

  /**
   * The Scenario-E closure layer, or `null` when the run declares no schedule.
   *
   * `null` is the port's `network.hasClosureSchedule() == false`
   * (WP8-SPEC-closures.md §2): `declareClosureSchedule()` runs at build step 9,
   * before any resident exists, so the two are equivalent at every moment a
   * resident can observe them. With it null, `routeNodes` is never allocated and
   * step 10 of `stepResident` is structurally unreachable — which is what makes
   * a `closuresCode = 0` run byte-identical to the same run with this runtime
   * compiled in (the R3 closures-inert variant).
   */
  readonly closures: ClosureRuntime | null;

  /**
   * The run-wide `DecisionConfig` every resident was armed with, or `null` when
   * the layer is off. One instance, shared by reference — never a per-resident
   * copy (`ContextCreator.java:781` constructs it outside the loop).
   */
  readonly decisionConfig: DecisionConfig | null;

  /**
   * Residents that {@link armResident} was called on — `0` when the layer is
   * off, `residents.length` when it is on.
   *
   * A counter rather than an inferred property, because "the decision layer is
   * live" was for a whole work package a claim about code that no run could
   * distinguish from its negation: `armResident` had no call site, so every
   * `informationRegime` and every barrier coefficient was inert while the
   * engine still produced a plausible run. A caller that wants to *state* the
   * layer ran should read this and assert on it.
   */
  readonly armedResidents: number;

  private readonly world: WorldBuildResult;
  private readonly order: Int32Array;
  private readonly agentOrder: AgentOrder;
  private readonly onHour: ((hour: number, tick: number) => void) | undefined;
  private readonly onClosureWave: ((report: ClosureWaveReport) => void) | undefined;

  /** Last completed tick; 0 before the run starts. */
  private tickValue = 0;

  // --- the per-tick views (see the class doc) -------------------------------
  private openTick = Number.NaN;
  private openValue = false;
  private availTick = Number.NaN;
  private availEpoch = -1;
  private admissionEpoch = 0;
  private availAny: Shelter[] = [];
  private availPriority: Shelter[] = [];
  private untriedTick = Number.NaN;
  private untriedOpen: Shelter[] = [];

  constructor(options: SimulationOptions) {
    const { world } = options;
    this.world = world;
    this.graph = options.graph;
    this.geometry = options.geometry;
    this.seg = options.seg;
    this.smoke = options.smoke;
    this.shelters = world.shelters;
    this.minutesPerTick = world.config.minutesPerTick;
    this.walkingSpeedMps = options.walkingSpeedMps;
    this.evacuationThresholdUgM3 = options.evacuationThresholdUgM3;
    this.ticksPerHour = world.ticksPerHour;
    this.endTick = world.endTick;
    this.agentOrder = options.agentOrder ?? "shuffle-mt";
    this.onHour = options.onHour;
    this.onClosureWave = options.onClosureWave;

    // Build step 9 produced the parsed schedule; this is step 12's scheduling of
    // one FIRST_PRIORITY `ClosureWave` per distinct activation hour. The
    // constructor throws on a non-integral wave tick (QUIRK 3) — at build, as
    // the spec requires, not on the tick that would have executed it.
    this.closures =
      world.closures === null
        ? null
        : new ClosureRuntime({
            graph: options.graph,
            shelters: world.shelters,
            schedule: world.closures,
          });

    const residents: Resident[] = [];
    for (const r of world.residents) {
      residents.push(
        new Resident({
          index: r.index,
          // `"Site " + i` — `ContextCreator`'s own naming, and the `agent_id`
          // column every archived CSV carries.
          name: `Site ${r.index}`,
          encampmentId: r.incId,
          startLon: r.startLon,
          startLat: r.startLat,
          startNode: r.startNode,
          attributes: r.attributes,
        }),
      );
    }
    this.residents = residents;
    this.order = new Int32Array(residents.length);
    for (let i = 0; i < residents.length; i++) {
      this.order[i] = i;
    }

    // --- ContextCreator step 11, second half ---------------------------------
    //
    // `for (GisAgent resident : createdResidents) resident.setDecisionLayer(...)`
    // (`ContextCreator.java:788-790`). A SEPARATE pass over the finished list,
    // after every resident has been constructed — not fused into the loop above,
    // for the same reason build step 11 is not fused into step 10 (`build.ts`
    // module doc §3): the certified model does not fuse it.
    //
    // It runs in creation order, which is the decision-seed index, and it
    // consumes no randomness — so it cannot move the shuffle stream, and a run
    // with the layer on draws its first tick's permutation from exactly where
    // the build left the default stream.
    this.decisionConfig = resolveDecisionConfig(world, options.decision);
    let armed = 0;
    if (this.decisionConfig !== null) {
      for (let i = 0; i < residents.length; i++) {
        const da = world.residents[i]!.decision;
        if (da === null) {
          throw new Error(
            `resident ${residents[i]!.name}: enableDecisionLayer is 1 but build step 11 sampled ` +
              "no DecisionAttributes for it — the E-layer draw order is the E-population and " +
              "cannot be re-derived here",
          );
        }
        armResident(residents[i]!, this.decisionConfig, da);
        armed++;
      }
    }
    this.armedResidents = armed;
  }

  get tick(): number {
    return this.tickValue;
  }

  /** Run to the schedule's inclusive final tick. */
  run(): void {
    this.runUntil(this.endTick);
  }

  /** Advance to (and including) `untilTick`. Idempotent past the end. */
  runUntil(untilTick: number): void {
    const stop = Math.min(untilTick, this.endTick);
    const n = this.residents.length;
    for (let tick = this.tickValue + 1; tick <= stop; tick++) {
      // §1.2 (1) ClosureWave.apply() at FIRST_PRIORITY.
      //
      // BEFORE the shuffle draw and before the agent loop. Ordering relative to
      // the agent loop is mandatory — FIRST_PRIORITY is what guarantees every
      // resident stepping on this tick sees the same post-wave world, whatever
      // its shuffle position. Ordering relative to `shuffleMt` is free: the wave
      // consumes no RNG at all (spec §14.1), so it cannot move the default
      // stream and cannot change the permutation drawn below.
      if (this.closures !== null) {
        const fired = this.closures.applyDueWaves(tick);
        if (this.onClosureWave !== undefined) {
          for (const report of fired) {
            this.onClosureWave(report);
          }
        }
      }

      // §1.2 (2) all agents' step() at RANDOM_PRIORITY.
      if (this.agentOrder === "shuffle-mt") {
        shuffleMt(this.order, this.world.streams.defaultStream);
      }
      for (let k = 0; k < n; k++) {
        stepResident(this.residents[this.order[k]!]!, this, tick);
      }
      this.tickValue = tick;
      if (this.onHour !== undefined && tick % this.ticksPerHour === 0) {
        this.onHour(tick / this.ticksPerHour, tick);
      }
    }
    // §1.2 (3) OutcomeLogger.export() at LAST_PRIORITY — the caller's job, once.
  }

  // --- StepWorld ------------------------------------------------------------

  anyShelterOpen(tick: number): boolean {
    if (tick !== this.openTick) {
      this.openTick = tick;
      let open = false;
      for (const s of this.shelters) {
        if (s.operating && s.isOpenAt(tick)) {
          open = true;
          break;
        }
      }
      this.openValue = open;
    }
    return this.openValue;
  }

  /**
   * `network.hasClosureSchedule()` — gates the `routeNodes` allocation and hence
   * whether step 10 is reachable at all (QUIRK 31).
   */
  get hasClosureSchedule(): boolean {
    return this.closures !== null;
  }

  /** `network.getClosureVersion()`; constant 0 in a run without waves. */
  closureVersion(): number {
    return this.closures === null ? 0 : this.closures.closureVersion;
  }

  /** `network.isBlocked(a, b)` over certified node ids, undirected. */
  isBlocked(nodeIdA: number, nodeIdB: number): boolean {
    return this.closures === null ? false : this.closures.isBlockedByNodeId(nodeIdA, nodeIdB);
  }

  /**
   * The L0/legacy re-entry predicate.
   *
   * `believedFull` is the resident's own set and therefore cannot be folded into
   * the cached availability view, which is per tick and per admission epoch. It
   * is applied as a post-filter over the cached list: dropping it would report a
   * door this resident has already been turned away from on policy as somewhere
   * to go, and `REFUSED_ALL_FULL` would flap. Structurally inert while the
   * decision layer is off, because `believedFull` is `null` then.
   */
  anyShelterAvailable(
    tick: number,
    fromNode: number,
    isPriority: boolean,
    believedFull: ReadonlySet<string> | null,
  ): boolean {
    if (tick !== this.availTick || this.availEpoch !== this.admissionEpoch) {
      this.availTick = tick;
      this.availEpoch = this.admissionEpoch;
      this.availAny.length = 0;
      this.availPriority.length = 0;
      for (const s of this.shelters) {
        if (!s.operating || !s.isOpenAt(tick) || s.routeTree === null) {
          continue;
        }
        if (s.hasSpaceFor(false)) {
          this.availAny.push(s);
        }
        if (s.hasSpaceFor(true)) {
          this.availPriority.push(s);
        }
      }
    }
    const list = isPriority ? this.availPriority : this.availAny;
    for (const s of list) {
      if (believedFull !== null && believedFull.has(s.id)) {
        continue;
      }
      if (Number.isFinite(s.routeTree!.dist[fromNode]!)) {
        return true;
      }
    }
    return false;
  }

  /**
   * `anyUntriedReachableShelter` (`GisAgent.java:853-864`) — the **L1** re-entry
   * predicate, and deliberately a different list from the one above.
   *
   * operating ∧ open ∧ tree ≠ null ∧ reachable ∧ not believed full. There is
   * **no `hasSpaceFor` conjunct**, and that omission is the mechanism, not an
   * optimisation: L1's whole content is that a resident cannot see live
   * occupancy. `step.ts:334` carries the warning that the availability view must
   * not be reused here, and it is pointed at a real hazard — `availAny` /
   * `availPriority` are prefiltered on `hasSpaceFor`, so borrowing them would
   * make an L1 resident refuse to leave `REFUSED_ALL_FULL` for a door that is
   * full *right now*, i.e. would restore exactly the omniscience the regime
   * removes, while every test that only checks "the run completes" stayed green.
   * WP8-SPEC-decision.md §10 states the same thing as a table.
   *
   * It therefore needs its **own** cached candidate list, and — unlike
   * `anyShelterAvailable` — that list needs no admission epoch: none of its
   * conjuncts can change when a resident is admitted. A closure wave *can*
   * change `routeTree`, but waves apply at FIRST_PRIORITY before any resident
   * steps, so the per-tick key already covers it, and the list holds `Shelter`
   * references and re-reads `routeTree` at use rather than caching trees.
   */
  anyUntriedReachableShelter(
    tick: number,
    fromNode: number,
    believedFull: ReadonlySet<string>,
  ): boolean {
    if (tick !== this.untriedTick) {
      this.untriedTick = tick;
      this.untriedOpen.length = 0;
      for (const s of this.shelters) {
        if (s.operating && s.isOpenAt(tick) && s.routeTree !== null) {
          this.untriedOpen.push(s);
        }
      }
    }
    for (const s of this.untriedOpen) {
      if (believedFull.has(s.id)) {
        continue;
      }
      if (Number.isFinite(s.routeTree!.dist[fromNode]!)) {
        return true;
      }
    }
    return false;
  }

  onAdmission(_shelter: Shelter): void {
    this.admissionEpoch++;
  }
}
