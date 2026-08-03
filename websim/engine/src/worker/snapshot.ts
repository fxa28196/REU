/**
 * Snapshot / restore of a whole running `Simulation` (plan §3.5).
 *
 * ## The property this exists to satisfy
 *
 * > Snapshot at S, replay to T must be **byte-identical** to a straight run to
 * > T, for random (S, T).
 *
 * That is the gate on the pause/scrub feature, and it is only as strong as the
 * *completeness* of what is captured. Three pieces of state are easy to forget
 * and each one breaks the property in a way that aggregate statistics hide:
 *
 * 1. **The agent-order permutation array.** `Simulation.order` is shuffled *in
 *    place* every tick, and `shuffleMt` is a descending Fisher–Yates over the
 *    array's *current* contents. Tick N+1's permutation is therefore a function
 *    of tick N's, not of the RNG alone. Restore the MT state but not the array
 *    and every subsequent tick draws the right numbers into the wrong
 *    permutation — a divergence that only shows up where capacity binds, i.e.
 *    exactly where the model is interesting and exactly where a mean-value check
 *    is blindest.
 * 2. **The per-agent decision streams.** `Resident.decisionRng` is constructed
 *    once at arming (QUIRK 25) and advanced by every outreach / hazard / stuck
 *    Bernoulli. It is 6,842 independent generators, not one.
 * 3. **The closure layer's cursor and blocked set.** `ClosureRuntime` fires
 *    waves off a monotone cursor and never un-blocks anything, so a restore that
 *    rewinds the tick but not the cursor silently skips every wave in the
 *    replayed window.
 *
 * ## What is copied and what is aliased
 *
 * Mutable state is **copied**: every number into a typed array, every `Set` into
 * an insertion-ordered array of its members, every RNG into its state record.
 *
 * Four object kinds are **aliased by reference**, and each is aliased because it
 * is write-once:
 *
 *  - `RouteLeg` / `RouteNodes` — built by `buildRouteLeg` / `buildRouteNodes`
 *    and thereafter only ever *replaced* (`a.leg = …`), never mutated in place.
 *  - `ShortestPathTree` — a closure wave assigns a freshly `retainTree`d object
 *    to `shelter.routeTree`; the old tree is untouched, which is the whole
 *    mechanism `reactToClosureWave` adjudicates (closures/runtime.ts QUIRK 34).
 *  - `DecisionConfig` — one run-wide instance shared by reference.
 *  - `DecisionAttributes` — sampled once at build.
 *
 * `engine/test/worker/field-coverage.test.ts` ("snapshot aliasing assumptions")
 * is the guard on that reasoning: it runs a simulation with closures and asserts
 * that the objects a snapshot aliased are byte-unchanged at the end of the run,
 * so "immutable in practice" is a measurement rather than a comment.
 *
 * ## Restoring into a different `Simulation`
 *
 * {@link restoreSnapshot} works both ways: rewinding the instance the snapshot
 * came from (the scrub path) and loading it into a separately built instance of
 * the same configuration (the stronger property, and what the worker's
 * `scrubTo` uses when it has to rebuild). Cross-instance restore is why the
 * build-time shelter fields are carried too.
 */

import { STATES, type State } from "../agents/stateMachine.js";
import type { Resident } from "../agents/resident.js";
import type { RouteLeg, RouteNodes } from "../agents/route.js";
import type { ClosureRuntime, ClosureWaveReport } from "../closures/runtime.js";
import type { DecisionConfig } from "../decision/config.js";
import type { DecisionAttributes } from "../agents/eLayerSampler.js";
import type { ShortestPathTree } from "../graph/dijkstra.js";
import type { JavaRandomState } from "../rng/JavaRandom.js";
import type { StreamRegistryState } from "../rng/streams.js";
import type { Shelter } from "../shelters/shelter.js";
import type { SmokeField } from "../smoke/field.js";
import type { Simulation } from "../sim.js";

import {
  assertFieldContract,
  RESIDENT_NUMBER_FIELDS,
  SHELTER_NUMBER_FIELDS,
  type ResidentNumberField,
  type ShelterNumberField,
} from "./fieldContract.js";

/** Structural view of the private state {@link captureSimulation} reaches for. */
interface SimulationInternals {
  tickValue: number;
  order: Int32Array;
  openTick: number;
  openValue: boolean;
  availTick: number;
  availEpoch: number;
  admissionEpoch: number;
  availAny: Shelter[];
  availPriority: Shelter[];
  untriedTick: number;
  untriedOpen: Shelter[];
}

interface ShelterInternals extends Record<ShelterNumberField, number> {
  routeTree: ShortestPathTree | null;
  petIntake: boolean | null;
  adultsOnly: boolean;
}

interface ClosureRuntimeInternals {
  version: number;
  cursor: number;
  reports: ClosureWaveReport[];
}

interface BlockedEdgesInternals {
  flags: Uint8Array;
  pairs: Set<string>;
  pairEndpoints: number[];
}

const NUM_STRIDE = RESIDENT_NUMBER_FIELDS.length;
const SHELTER_STRIDE = SHELTER_NUMBER_FIELDS.length;

/** State-name → code, so the per-resident state is one byte. */
const STATE_CODE = new Map<State, number>(STATES.map((s, i) => [s, i]));

/** The per-resident columns of a snapshot. */
export interface ResidentColumns {
  readonly count: number;
  /** `RESIDENT_NUMBER_FIELDS` laid out `[resident][field]`, stride 33. */
  readonly nums: Float64Array;
  /** Index into `STATES`. */
  readonly state: Uint8Array;
  /** Shelter index into `Simulation.shelters`, or −1. */
  readonly targetShelter: Int32Array;
  readonly leg: (RouteLeg | null)[];
  readonly routeNodes: (RouteNodes | null)[];
  /** Insertion-ordered members, or `null` when the set itself is null. */
  readonly believedFull: (readonly string[] | null)[];
  readonly pushedBlockages: (readonly string[] | null)[];
  readonly decisionRng: (JavaRandomState | null)[];
  readonly decisionConfig: (DecisionConfig | null)[];
  readonly decision: (DecisionAttributes | null)[];
}

export interface ShelterColumns {
  readonly count: number;
  /** `SHELTER_NUMBER_FIELDS` laid out `[shelter][field]`. */
  readonly nums: Float64Array;
  readonly routeTree: (ShortestPathTree | null)[];
  /** Tri-state pet policy encoded 0 = refuse, 1 = admit, 2 = unrecorded. */
  readonly petIntake: Uint8Array;
  readonly adultsOnly: Uint8Array;
}

export interface BlockedEdgesSnapshot {
  readonly flags: Uint8Array;
  readonly pairs: readonly string[];
  readonly pairEndpoints: Int32Array;
}

export interface ClosureSnapshot {
  readonly version: number;
  readonly cursor: number;
  readonly reports: readonly ClosureWaveReport[];
  readonly blocked: BlockedEdgesSnapshot;
}

/** Everything a `Simulation` needs to be put back exactly where it was. */
export interface SimSnapshot {
  /** Last completed tick. */
  readonly tick: number;
  /** The live agent-order permutation — see the module doc, item 1. */
  readonly order: Int32Array;
  readonly admissionEpoch: number;
  readonly residents: ResidentColumns;
  readonly shelters: ShelterColumns;
  readonly streams: StreamRegistryState;
  readonly closures: ClosureSnapshot | null;
  readonly smokeOutOfRangeLookups: number;
  /** Bytes the copied (non-aliased) part of this snapshot occupies. */
  readonly approxBytes: number;
}

/** `Simulation` plus the two collaborators whose state is also run state. */
export interface SnapshotTarget {
  readonly sim: Simulation;
  readonly smoke: SmokeField;
  /** `world.streams`. Carried explicitly: `Simulation` does not expose it. */
  readonly streams: {
    getState(): StreamRegistryState;
    setState(state: StreamRegistryState): void;
  };
}

function copySet(s: ReadonlySet<string> | null): readonly string[] | null {
  return s === null ? null : Array.from(s);
}

function captureBlocked(runtime: ClosureRuntime): BlockedEdgesSnapshot {
  const blocked = runtime.blocked as unknown as BlockedEdgesInternals;
  assertFieldContract("BlockedEdges", blocked);
  return {
    flags: blocked.flags.slice(),
    pairs: Array.from(blocked.pairs),
    pairEndpoints: Int32Array.from(blocked.pairEndpoints),
  };
}

function restoreBlocked(runtime: ClosureRuntime, snap: BlockedEdgesSnapshot): void {
  const blocked = runtime.blocked as unknown as BlockedEdgesInternals;
  assertFieldContract("BlockedEdges", blocked);
  if (blocked.flags.length !== snap.flags.length) {
    throw new SnapshotShapeError(
      `blocked-edge flag array is ${blocked.flags.length} records, snapshot has ` +
        `${snap.flags.length}: this snapshot came from a different graph`,
    );
  }
  blocked.flags.set(snap.flags);
  blocked.pairs.clear();
  for (const k of snap.pairs) {
    blocked.pairs.add(k);
  }
  blocked.pairEndpoints.length = 0;
  for (let i = 0; i < snap.pairEndpoints.length; i++) {
    blocked.pairEndpoints.push(snap.pairEndpoints[i]!);
  }
}

/** Thrown when a snapshot does not fit the simulation it is being restored into. */
export class SnapshotShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotShapeError";
  }
}

/**
 * Capture the complete mutable state of a running simulation.
 *
 * Cost is O(residents + shelters + blocked records) and allocates a fresh set of
 * typed arrays each call; nothing in the live model is touched, which
 * `engine/test/worker/snapshot.property.test.ts` gates by digesting the
 * simulation on both sides of the call.
 */
export function captureSnapshot(target: SnapshotTarget): SimSnapshot {
  const { sim, smoke, streams } = target;
  const internals = sim as unknown as SimulationInternals;
  assertFieldContract("Simulation", internals);
  assertFieldContract("SmokeField", smoke as unknown as object);

  const residents = sim.residents;
  const n = residents.length;
  const shelterIndex = new Map<Shelter, number>();
  for (let i = 0; i < sim.shelters.length; i++) {
    shelterIndex.set(sim.shelters[i]!, i);
  }

  const nums = new Float64Array(n * NUM_STRIDE);
  const state = new Uint8Array(n);
  const targetShelter = new Int32Array(n);
  const leg: (RouteLeg | null)[] = new Array<RouteLeg | null>(n);
  const routeNodes: (RouteNodes | null)[] = new Array<RouteNodes | null>(n);
  const believedFull: (readonly string[] | null)[] = new Array<readonly string[] | null>(n);
  const pushedBlockages: (readonly string[] | null)[] = new Array<readonly string[] | null>(n);
  const decisionRng: (JavaRandomState | null)[] = new Array<JavaRandomState | null>(n);
  const decisionConfig: (DecisionConfig | null)[] = new Array<DecisionConfig | null>(n);
  const decision: (DecisionAttributes | null)[] = new Array<DecisionAttributes | null>(n);
  let setMembers = 0;

  for (let i = 0; i < n; i++) {
    const r = residents[i]! as Resident & Record<ResidentNumberField, number>;
    const base = i * NUM_STRIDE;
    for (let f = 0; f < NUM_STRIDE; f++) {
      nums[base + f] = r[RESIDENT_NUMBER_FIELDS[f]!];
    }
    const code = STATE_CODE.get(r.state);
    if (code === undefined) {
      throw new SnapshotShapeError(`resident ${r.name} is in unknown state '${String(r.state)}'`);
    }
    state[i] = code;
    targetShelter[i] = r.targetShelter === null ? -1 : (shelterIndex.get(r.targetShelter) ?? -1);
    if (r.targetShelter !== null && targetShelter[i] === -1) {
      throw new SnapshotShapeError(
        `resident ${r.name} targets shelter ${r.targetShelter.id}, which is not in ` +
          "Simulation.shelters — the snapshot cannot name it by index",
      );
    }
    leg[i] = r.leg;
    routeNodes[i] = r.routeNodes;
    const bf = copySet(r.believedFull);
    const pb = copySet(r.pushedBlockages);
    believedFull[i] = bf;
    pushedBlockages[i] = pb;
    setMembers += (bf?.length ?? 0) + (pb?.length ?? 0);
    decisionRng[i] = r.decisionRng === null ? null : r.decisionRng.getState();
    decisionConfig[i] = r.decisionConfig;
    decision[i] = r.decision;
  }

  const m = sim.shelters.length;
  const sNums = new Float64Array(m * SHELTER_STRIDE);
  const routeTree: (ShortestPathTree | null)[] = new Array<ShortestPathTree | null>(m);
  const petIntake = new Uint8Array(m);
  const adultsOnly = new Uint8Array(m);
  for (let i = 0; i < m; i++) {
    const s = sim.shelters[i]! as unknown as ShelterInternals;
    assertFieldContract("Shelter", s as unknown as object);
    const base = i * SHELTER_STRIDE;
    for (let f = 0; f < SHELTER_STRIDE; f++) {
      sNums[base + f] = s[SHELTER_NUMBER_FIELDS[f]!];
    }
    routeTree[i] = s.routeTree;
    petIntake[i] = s.petIntake === null ? 2 : s.petIntake ? 1 : 0;
    adultsOnly[i] = s.adultsOnly ? 1 : 0;
  }

  let closures: ClosureSnapshot | null = null;
  if (sim.closures !== null) {
    const c = sim.closures as unknown as ClosureRuntimeInternals;
    assertFieldContract("ClosureRuntime", c as unknown as object);
    closures = {
      version: c.version,
      cursor: c.cursor,
      reports: c.reports.slice(),
      blocked: captureBlocked(sim.closures),
    };
  }

  const approxBytes =
    nums.byteLength +
    state.byteLength +
    targetShelter.byteLength +
    sNums.byteLength +
    petIntake.byteLength +
    adultsOnly.byteLength +
    internals.order.byteLength +
    setMembers * 24 +
    (closures === null
      ? 0
      : closures.blocked.flags.byteLength + closures.blocked.pairEndpoints.byteLength);

  return {
    tick: internals.tickValue,
    order: internals.order.slice(),
    admissionEpoch: internals.admissionEpoch,
    residents: {
      count: n,
      nums,
      state,
      targetShelter,
      leg,
      routeNodes,
      believedFull,
      pushedBlockages,
      decisionRng,
      decisionConfig,
      decision,
    },
    shelters: { count: m, nums: sNums, routeTree, petIntake, adultsOnly },
    streams: streams.getState(),
    closures,
    smokeOutOfRangeLookups: smoke.outOfRangeLookups,
    approxBytes,
  };
}

/**
 * Put a simulation back exactly where {@link captureSnapshot} found it.
 *
 * Every per-tick cache in `Simulation` is *invalidated* rather than restored:
 * `openTick`, `availTick` and `untriedTick` are set to `NaN`, which is the
 * "nothing cached" sentinel the constructor uses. They are pure functions of the
 * tick, the admission epoch and the shelter list, so recomputing beats trusting
 * that a rewind left them coherent. The admission epoch itself IS restored,
 * because it is a monotone counter a later comparison reads.
 */
export function restoreSnapshot(target: SnapshotTarget, snap: SimSnapshot): void {
  const { sim, smoke, streams } = target;
  const internals = sim as unknown as SimulationInternals;
  assertFieldContract("Simulation", internals);

  const residents = sim.residents;
  if (residents.length !== snap.residents.count) {
    throw new SnapshotShapeError(
      `simulation has ${residents.length} residents, snapshot has ${snap.residents.count}`,
    );
  }
  if (sim.shelters.length !== snap.shelters.count) {
    throw new SnapshotShapeError(
      `simulation has ${sim.shelters.length} shelters, snapshot has ${snap.shelters.count}`,
    );
  }
  if (internals.order.length !== snap.order.length) {
    throw new SnapshotShapeError(
      `agent-order array is ${internals.order.length} long, snapshot has ${snap.order.length}`,
    );
  }
  if ((sim.closures === null) !== (snap.closures === null)) {
    throw new SnapshotShapeError(
      "closure-layer presence differs between the simulation and the snapshot: a run with " +
        "closuresCode 0 has no ClosureRuntime at all and cannot be given one",
    );
  }

  const c = snap.residents;
  for (let i = 0; i < residents.length; i++) {
    const r = residents[i]! as Resident & Record<ResidentNumberField, number>;
    const base = i * NUM_STRIDE;
    for (let f = 0; f < NUM_STRIDE; f++) {
      r[RESIDENT_NUMBER_FIELDS[f]!] = c.nums[base + f]!;
    }
    r.state = STATES[c.state[i]!]!;
    const ti = c.targetShelter[i]!;
    r.targetShelter = ti < 0 ? null : sim.shelters[ti]!;
    r.leg = c.leg[i]!;
    r.routeNodes = c.routeNodes[i]!;

    const bf = c.believedFull[i]!;
    if (bf === null) {
      r.believedFull = null;
    } else if (r.believedFull === null) {
      r.believedFull = new Set(bf);
    } else {
      r.believedFull.clear();
      for (const id of bf) {
        r.believedFull.add(id);
      }
    }

    const pb = c.pushedBlockages[i]!;
    if (pb === null) {
      r.pushedBlockages = null;
    } else if (r.pushedBlockages === null) {
      r.pushedBlockages = new Set(pb);
    } else {
      r.pushedBlockages.clear();
      for (const k of pb) {
        r.pushedBlockages.add(k);
      }
    }

    const rngState = c.decisionRng[i]!;
    if (rngState === null) {
      r.decisionRng = null;
    } else if (r.decisionRng === null) {
      throw new SnapshotShapeError(
        `resident ${r.name} has no decision stream but the snapshot carries one: the ` +
          "simulation was built with a different enableDecisionLayer",
      );
    } else {
      r.decisionRng.setState(rngState);
    }
    r.decisionConfig = c.decisionConfig[i]!;
    r.decision = c.decision[i]!;
  }

  const sc = snap.shelters;
  for (let i = 0; i < sim.shelters.length; i++) {
    const s = sim.shelters[i]! as unknown as ShelterInternals;
    assertFieldContract("Shelter", s as unknown as object);
    const base = i * SHELTER_STRIDE;
    for (let f = 0; f < SHELTER_STRIDE; f++) {
      s[SHELTER_NUMBER_FIELDS[f]!] = sc.nums[base + f]!;
    }
    s.routeTree = sc.routeTree[i]!;
    s.petIntake = sc.petIntake[i] === 2 ? null : sc.petIntake[i] === 1;
    s.adultsOnly = sc.adultsOnly[i] === 1;
  }

  if (sim.closures !== null && snap.closures !== null) {
    const rt = sim.closures as unknown as ClosureRuntimeInternals;
    assertFieldContract("ClosureRuntime", rt as unknown as object);
    rt.version = snap.closures.version;
    rt.cursor = snap.closures.cursor;
    rt.reports.length = 0;
    for (const rep of snap.closures.reports) {
      rt.reports.push(rep);
    }
    restoreBlocked(sim.closures, snap.closures.blocked);
  }

  streams.setState(snap.streams);
  smoke.setOutOfRangeLookups(snap.smokeOutOfRangeLookups);

  internals.tickValue = snap.tick;
  internals.order.set(snap.order);
  internals.admissionEpoch = snap.admissionEpoch;
  // Pure caches: invalidate, never trust.
  internals.openTick = Number.NaN;
  internals.openValue = false;
  internals.availTick = Number.NaN;
  internals.availEpoch = -1;
  internals.availAny.length = 0;
  internals.availPriority.length = 0;
  internals.untriedTick = Number.NaN;
  internals.untriedOpen.length = 0;
}
