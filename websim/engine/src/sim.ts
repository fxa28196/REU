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
 */

import type { GraphGeometry } from "@websim/shared/graph-asset";

import { Resident } from "./agents/resident.js";
import { stepResident, type StepWorld } from "./agents/step.js";
import type { RoutingGraph } from "./graph/csr.js";
import type { SegmentGeometry } from "./graph/cumLen.js";
import { shuffleMt } from "./rng/streams.js";
import type { Shelter } from "./shelters/shelter.js";
import type { SmokeField } from "./smoke/field.js";
import type { WorldBuildResult } from "./world/build.js";

export type AgentOrder = "shuffle-mt" | "identity";

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
  /** Called once per simulated hour with the tick just completed. */
  readonly onHour?: ((hour: number, tick: number) => void) | undefined;
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

  private readonly world: WorldBuildResult;
  private readonly order: Int32Array;
  private readonly agentOrder: AgentOrder;
  private readonly onHour: ((hour: number, tick: number) => void) | undefined;

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
      // §1.2 (1) ClosureWave.apply() at FIRST_PRIORITY — WP8.

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

  anyShelterAvailable(tick: number, fromNode: number, isPriority: boolean): boolean {
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
