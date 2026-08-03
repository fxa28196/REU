/**
 * A census of what a run actually did — the read-out that turns "the two runs
 * agreed" into "the two runs agreed *about something*".
 *
 * It lives in `src/` rather than in the test tree for one specific reason: the
 * WP10 acceptance criteria are measured **inside a worker**, and a test on the
 * UI thread can only see what the worker is able to send it. Without this, a
 * browser test could assert two digests match and would have no way to show that
 * the runs behind them admitted anybody, refused anybody, fired a wave or moved
 * a single resident. That is the difference between evidence and a matching pair
 * of nulls.
 *
 * It is also a genuine product surface: the Run screen's summary panel and the
 * Compare screen's delta cards are made of exactly these numbers.
 */

import { STATES } from "../agents/stateMachine.js";
import type { Simulation } from "../sim.js";

export interface RunCensus {
  /** Population count per `STATES` entry. */
  readonly states: Record<string, number>;
  /** How many states have at least one resident. */
  readonly distinctStates: number;
  readonly admissions: number;
  readonly refusals: number;
  readonly policyRefusals: number;
  readonly residentsWithBeliefs: number;
  readonly residentsWithPushedBlockages: number;
  /** Per-agent decision streams that have drawn at least once. */
  readonly advancedDecisionStreams: number;
  readonly reroutes: number;
  readonly stuckEvents: number;
  readonly pushThroughs: number;
  readonly blockagesEncountered: number;
  readonly wavesFired: number;
  readonly blockedPairs: number;
  readonly movedResidents: number;
  readonly armedResidents: number;
  readonly tick: number;
}

/** Java's `Random` seed scramble, for the "has this stream drawn?" test. */
function scrambled(seed: bigint): bigint {
  return BigInt.asUintN(48, seed ^ 0x5deece66dn);
}

/**
 * Read the census off a live simulation. Pure: touches no counter the model
 * reads, allocates nothing the model can see.
 */
export function runCensus(sim: Simulation): RunCensus {
  const states: Record<string, number> = {};
  for (const s of STATES) {
    states[s] = 0;
  }
  let beliefs = 0;
  let pushed = 0;
  let advanced = 0;
  let reroutes = 0;
  let stuck = 0;
  let pushThroughs = 0;
  let blockages = 0;
  let moved = 0;

  for (const r of sim.residents) {
    states[r.state] = (states[r.state] ?? 0) + 1;
    if ((r.believedFull?.size ?? 0) > 0) {
      beliefs++;
    }
    if ((r.pushedBlockages?.size ?? 0) > 0) {
      pushed++;
    }
    // A stream that has drawn no longer holds its construction seed. The seed
    // is a pure function of the agent index, so this needs no reference run.
    if (r.decisionRng !== null && r.decision !== null && r.decisionRng.seed48 !== scrambled(r.decision.decisionSeed)) {
      advanced++;
    }
    reroutes += r.reroutes;
    stuck += r.stuckEvents;
    pushThroughs += r.pushThroughs;
    blockages += r.blockagesEncountered;
    if (r.distanceTraveledM > 0) {
      moved++;
    }
  }

  let admissions = 0;
  let refusals = 0;
  let policyRefusals = 0;
  for (const s of sim.shelters) {
    admissions += s.occupancy;
    refusals += s.refusedCount;
    policyRefusals += s.policyRefusedCount;
  }

  return {
    states,
    distinctStates: Object.values(states).filter((v) => v > 0).length,
    admissions,
    refusals,
    policyRefusals,
    residentsWithBeliefs: beliefs,
    residentsWithPushedBlockages: pushed,
    advancedDecisionStreams: advanced,
    reroutes,
    stuckEvents: stuck,
    pushThroughs,
    blockagesEncountered: blockages,
    wavesFired: sim.closures?.wavesApplied ?? 0,
    blockedPairs: sim.closures?.blockedEdgeCount ?? 0,
    movedResidents: moved,
    armedResidents: sim.armedResidents,
    tick: sim.tick,
  };
}
