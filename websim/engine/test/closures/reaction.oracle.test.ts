/**
 * WP8 acceptance, half two: **gate (l)'s COMPONENTS, against the certified
 * agent-reaction oracle.**
 *
 * ## Why this file has to exist at all
 *
 * WP8-SPEC-closures.md §0 is blunt: *every certified Scenario-E run recorded
 * zero blockage events.* All four counters sum to 0 in all 48 archived run
 * directories, including the 15 v2 runs at 72 closed edges and 6 waves.
 * Gate (l) therefore passes on the all-zero branch, and the port could ship a
 * completely wrong `reactToClosureWave` with every archived comparison still
 * green (§11.3 lists five wrong ports that all satisfy the identity
 * `blockages ≡ pushes + reroutes`).
 *
 * So the components are gated here, against
 * `pipeline/out/closure-fixtures/reaction/` — 570 adjudication rows produced by
 * calling the certified `GisAgent.step()` on live agents in a world where waves
 * were placed *on top of* traced walkers. 351 blockage events, 147 pushes, 204
 * reroutes, 102 stuck events, 135 grandfatherings, 27 deferred adjudications,
 * where the archive has zero of each.
 *
 * ## What is oracle and what is reconstructed — stated exactly
 *
 * **Oracle (certified Java, never re-derived here).** Every expected value:
 * the decision label, the four counter deltas, `stuckUntilTick` as raw IEEE-754
 * bits, the post-reaction `currentNodeId`, and the agent's private
 * `java.util.Random` internal seed *before and after* the tick.
 *
 * **Reconstructed here (fixture construction, not model behaviour).** Which
 * edges each variant closes. `ReactionOracle.pickEdges` chooses them purely off
 * the probe snapshot — the first ahead edge, the last behind edge, five
 * consecutive ahead edges, or an ahead edge plus one three further on — and
 * `probe.tsv` ships that snapshot (node chain, `coordOffset`, `pathIndex`) in
 * full. So the closed sets are recomputable without touching the model, and the
 * recomputation is **checked, not trusted**: `events.tsv` carries, per walker,
 * how many edges that walker contributed to the wave, and every one of those
 * numbers must come out right before a single decision is compared.
 *
 * ## The RNG check is the sharp one
 *
 * `ticks.tsv` carries the raw `java.util.Random` seed field before and after
 * each tick. This engine has bit-exact `java.util.Random` from WP0, so the test
 * seeds the port's stream with the *certified pre-state* and asserts the
 * *certified post-state* afterwards. That is stronger than counting draws: it
 * proves the draw happened at the right place with the right generator, and it
 * fails a port that "keeps the stream aligned" by drawing on the reroute branch
 * (spec §14.2) even when the decision would have come out the same.
 *
 * ## What is deliberately NOT asserted, and why
 *
 *  - **Wave-2 rows for walkers that REROUTED at wave 1.** A reroute discards the
 *    node chain and re-plans over the recomputed trees; the new chain is not in
 *    the dump, so the port cannot rebuild the input. Those rows are counted and
 *    reported, never silently dropped. Every wave-2 row for a walker that PUSHED
 *    *is* asserted — and those are the interesting ones (QUIRK 5, 6, 20).
 *  - **`ahead_edges` on REROUTE rows.** The dumper computes that column from the
 *    *post-step* `routeNodes` with the *pre-step* `pathIndex`
 *    (`ReactionOracle.routeNodesSnapshot` reads the live field), so on a reroute
 *    row it describes the freshly planned chain and is not a pre-scan quantity.
 *    It is asserted on PUSH / GRANDFATHERED / NOT_REACHED rows, where the chain
 *    is unchanged and it is exactly the ahead-edge count the scan walked.
 */

import { expect, it } from "vitest";

import { artifactGate, describeGated } from "../../../tools/artifact-gate.js";
import { Resident } from "../../src/agents/resident.js";
import type { DecisionAttributes } from "../../src/agents/eLayerSampler.js";
import type { PopulationAttributes } from "../../src/agents/populationSampler.js";
import type { RouteNodes } from "../../src/agents/route.js";
import {
  reactToClosureWave,
  pairKey,
  type ClosureNetworkView,
} from "../../src/decision/closureReaction.js";
import { DECISION_PARAM_FALLBACKS, type DecisionConfig } from "../../src/decision/config.js";
import { JavaRandom } from "../../src/rng/JavaRandom.js";
import {
  INHALATION_RESTING_M3H,
  INHALATION_WALKING_M3H,
} from "../../src/agents/stateMachine.js";
import { bitsToDouble, closureRef, hexD, readVerifiedDump, tsvRows } from "./helpers.js";

/** `ReactionOracle.CONFIGS` — the three decision configurations it dumps. */
const CFG: Record<string, { layer: number; pStuck: number; sigmaTheta: number }> = {
  armed: { layer: 1, pStuck: 0.3, sigmaTheta: 1.0 },
  armedStuck1: { layer: 1, pStuck: 1.0, sigmaTheta: 1.0 },
  layerOff: { layer: 0, pStuck: 0.3, sigmaTheta: 1.0 },
};
const STUCK_DELAY_H = 3.0;
const PUSH_THETA_THRESHOLD = -0.25;
const K_PUSH = 1.0;
const MINUTES_PER_TICK = 1.0;
/** `ReactionOracle.TICKS_PER_HOUR` — wave 2 is one hour after wave 1. */
const WAVE2_OFFSET_TICKS = 60;

function configFor(name: string): DecisionConfig | null {
  const c = CFG[name]!;
  if (c.layer === 0) {
    return null; // `decisionConfig == null` — the safe degenerate (QUIRK 21)
  }
  return {
    ...DECISION_PARAM_FALLBACKS,
    sigmaTheta: c.sigmaTheta,
    pushThetaThreshold: PUSH_THETA_THRESHOLD,
    kPush: K_PUSH,
    pStuck: c.pStuck,
    stuckDelayH: STUCK_DELAY_H,
  };
}

// --- the probe snapshot ------------------------------------------------------

interface Chain {
  readonly waveTick: number;
  readonly pathIndex: number;
  /** Certified node ids, walker → shelter. */
  readonly nodeIds: number[];
  readonly coordOffset: number[];
}

function loadProbe(): Map<string, Chain> {
  const out = new Map<string, Chain>();
  for (const r of tsvRows(readVerifiedDump("reaction.probe", "reaction/probe.tsv"))) {
    const key = `${r[0]!}|${r[1]!}|${r[2]!}`;
    let c = out.get(key) as { waveTick: number; pathIndex: number; nodeIds: number[]; coordOffset: number[] } | undefined;
    if (c === undefined) {
      c = { waveTick: Number(r[3]), pathIndex: Number(r[4]), nodeIds: [], coordOffset: [] };
      out.set(key, c as Chain);
    }
    expect(Number(r[5]), `${key} probe row order`).toBe(c.nodeIds.length);
    c.nodeIds.push(Number(r[6]));
    c.coordOffset.push(Number(r[7]));
    // The dump's own `ahead` flag is `coordOffset[k] >= pathIndex`; re-derive it
    // so the grandfathering predicate (QUIRK 12) is checked on 3,492 rows before
    // any of it is used to rebuild a wave.
    expect(Number(r[8]), `${key} ahead flag at k=${r[5]!}`).toBe(
      Number(r[7]) >= c.pathIndex ? 1 : 0,
    );
  }
  return out;
}

/** `ReactionOracle.pickEdges` — fixture construction, transcribed. */
function pickEdges(
  variant: string,
  chain: Chain,
): { wave1: [number, number][]; wave2: [number, number][] } {
  const n = chain.nodeIds.length;
  const edge = (k: number): [number, number] => [chain.nodeIds[k]!, chain.nodeIds[k + 1]!];
  let firstAhead = -1;
  let lastBehind = -1;
  for (let k = 0; k + 1 < n; k++) {
    if (chain.coordOffset[k]! >= chain.pathIndex) {
      if (firstAhead < 0) {
        firstAhead = k;
      }
    } else {
      lastBehind = k;
    }
  }
  const wave1: [number, number][] = [];
  const wave2: [number, number][] = [];
  if (variant === "behind") {
    expect(lastBehind, "an edge behind the walker").toBeGreaterThanOrEqual(0);
    wave1.push(edge(lastBehind));
    return { wave1, wave2 };
  }
  expect(firstAhead, "an edge ahead of the walker").toBeGreaterThanOrEqual(0);
  if (variant === "ahead") {
    wave1.push(edge(firstAhead));
  } else if (variant === "multi5") {
    for (let k = firstAhead, added = 0; k + 1 < n && added < 5; k++, added++) {
      wave1.push(edge(k));
    }
  } else {
    wave1.push(edge(firstAhead));
    let second = -1;
    for (let k = firstAhead + 3; k + 1 < n; k++) {
      second = k;
      break;
    }
    wave2.push(edge(second < 0 ? firstAhead : second));
  }
  return { wave1, wave2 };
}

function aheadEdgeCount(chain: Chain, pathIndex: number): number {
  let n = 0;
  for (let k = 0; k + 1 < chain.nodeIds.length; k++) {
    if (chain.coordOffset[k]! >= pathIndex) {
      n++;
    }
  }
  return n;
}

// --- the per-tick snapshots --------------------------------------------------

interface Snap {
  readonly state: string;
  readonly pathIndex: number;
  readonly routeNodesLen: number;
  readonly routePathLen: number;
  readonly seenVersion: number;
  readonly stuckUntilHex: string;
  readonly currentNode: number;
  readonly pushedSet: number;
  readonly blockages: number;
  readonly pushes: number;
  readonly reroutes: number;
  readonly stucks: number;
  readonly airHex: string;
  readonly rngState: string;
}

interface TickSnap {
  readonly pre: Snap;
  readonly post: Snap;
}

/**
 * `Snap.cols()`, in declaration order — 18 columns, twice, after the six key
 * columns. Read positionally because that is how the dump is written; the width
 * is asserted so a future column addition fails here rather than silently
 * shifting every field.
 */
const SNAP_WIDTH = 18;

function readSnap(r: readonly string[], at: number): Snap {
  return {
    state: r[at]!,
    pathIndex: Number(r[at + 1]),
    routeNodesLen: Number(r[at + 2]),
    routePathLen: Number(r[at + 3]),
    seenVersion: Number(r[at + 4]),
    stuckUntilHex: r[at + 5]!,
    currentNode: Number(r[at + 6]),
    pushedSet: Number(r[at + 8]),
    blockages: Number(r[at + 9]),
    pushes: Number(r[at + 10]),
    reroutes: Number(r[at + 11]),
    stucks: Number(r[at + 12]),
    airHex: r[at + 14]!,
    rngState: r[at + 17]!,
  };
}

function loadTicks(): Map<string, TickSnap> {
  const rows = tsvRows(readVerifiedDump("reaction.ticks", "reaction/ticks.tsv"));
  const out = new Map<string, TickSnap>();
  for (const r of rows) {
    expect(r.length, "ticks.tsv width").toBe(6 + 2 * SNAP_WIDTH);
    out.set(`${r[0]!}|${r[1]!}|${r[2]!}|${r[3]!}|${r[4]!}`, {
      pre: readSnap(r, 6),
      post: readSnap(r, 6 + SNAP_WIDTH),
    });
  }
  return out;
}

// --- the port-side resident --------------------------------------------------

function makeRouteNodes(chain: Chain): RouteNodes {
  // `nodes` are graph INDICES in the engine. This harness has no graph, so it
  // uses the chain position as the index and keeps the certified ids alongside
  // — a bijection, which is all `reactToClosureWave` needs (QUIRK 27). The
  // reroute assertion converts back through the same map.
  const k = chain.nodeIds.length;
  const nodes = new Int32Array(k);
  for (let i = 0; i < k; i++) {
    nodes[i] = i;
  }
  return {
    nodes,
    nodeIds: Int32Array.from(chain.nodeIds),
    coordOffset: Int32Array.from(chain.coordOffset),
  };
}

function rngFromRawSeed(raw: string): JavaRandom {
  const s = BigInt(raw);
  const rng = new JavaRandom(0);
  rng.setState({
    hi: Number(s >> 24n),
    lo: Number(s & 0xffffffn),
    haveNextNextGaussian: false,
    nextNextGaussian: 0,
  });
  return rng;
}

const REACTION_ARTIFACTS = [
  closureRef("manifest.json"),
  closureRef("reaction/probe.tsv"),
  closureRef("reaction/events.tsv"),
  closureRef("reaction/ticks.tsv"),
];

describeGated(
  artifactGate({
    gate: "engine:closures-reaction-oracle",
    suite: "reactToClosureWave vs the certified Java agent-reaction oracle",
    evidence:
      "gate (l)'s COMPONENTS — every push/reroute/grandfather decision, all four counter deltas, " +
      "stuckUntilTick as raw bits and the per-agent java.util.Random state before and after — " +
      "checked against 351 certified blockage events (147 pushes, 204 reroutes, 102 stuck, 135 " +
      "grandfatherings, 27 deferred). The archive records ZERO of these, so without this suite " +
      "the whole push/reroute sub-tree is ungated (WP8-SPEC-closures.md §0, §11.3)",
    artifacts: REACTION_ARTIFACTS,
  }),
  () => {
    it("reproduces every certified adjudication, and the gate-(l) identity holds per agent", () => {
      const probe = loadProbe();
      const ticks = loadTicks();
      const events = tsvRows(readVerifiedDump("reaction.events", "reaction/events.tsv"));
      expect(events.length, "adjudication rows").toBe(567);

      // Group the rows by (config, seed, variant) and replay each group in tick
      // order, on ONE resident per walker — so `pushedBlockages` carries from
      // wave 1 into wave 2 exactly as it does in the certified run.
      const groups = new Map<string, string[][]>();
      for (const r of events) {
        const k = `${r[0]!}|${r[1]!}|${r[2]!}`;
        let g = groups.get(k);
        if (g === undefined) {
          g = [];
          groups.set(k, g);
        }
        g.push(r);
      }
      expect(groups.size, "config x seed x variant").toBe(3 * 3 * 4);

      const census: {
        rowsAsserted: number;
        rowsSkippedRerouted: number;
        skippedByDecision: Record<string, number>;
        push: number;
        reroute: number;
        grandfathered: number;
        notReached: number;
        deferred: number;
        stuck: number;
        rngStatesMatched: number;
        stuckTicksMatched: number;
        rerouteNodesMatched: number;
        aheadCountsMatched: number;
        contributedEdgesMatched: number;
        identityChecked: number;
      } = {
        rowsAsserted: 0,
        rowsSkippedRerouted: 0,
        skippedByDecision: {},
        push: 0,
        reroute: 0,
        grandfathered: 0,
        notReached: 0,
        deferred: 0,
        stuck: 0,
        rngStatesMatched: 0,
        stuckTicksMatched: 0,
        rerouteNodesMatched: 0,
        aheadCountsMatched: 0,
        contributedEdgesMatched: 0,
        identityChecked: 0,
      };

      for (const [key, rows] of groups) {
        const [config, seed, variant] = key.split("|") as [string, string, string];
        const cfg = configFor(config);

        // --- rebuild the variant's closed sets from the probe snapshot -------
        const chains: Chain[] = [];
        const contributed: number[] = [];
        const cand1: [number, number][][] = [];
        const cand2: [number, number][][] = [];
        for (let i = 0; i < 12; i++) {
          const chain = probe.get(`${config}|${seed}|${i}`);
          expect(chain, `probe chain ${config}/${seed}/${i}`).toBeDefined();
          chains.push(chain!);
          const picked = pickEdges(variant, chain!);
          cand1.push(picked.wave1);
          cand2.push(picked.wave2);
        }
        if (variant === "behind") {
          // WP8-C1: the traced walkers converge on the same 36 shelters, so an
          // edge already behind walker i can still be AHEAD of walker j. The
          // fixture drops any candidate in the global ahead-edge union, so the
          // wave contains only edges behind EVERY walker.
          const aheadKeys = new Set<string>();
          for (const c of chains) {
            for (let k = 0; k + 1 < c.nodeIds.length; k++) {
              if (c.coordOffset[k]! >= c.pathIndex) {
                aheadKeys.add(pairKey(c.nodeIds[k]!, c.nodeIds[k + 1]!));
              }
            }
          }
          for (let i = 0; i < 12; i++) {
            cand1[i] = cand1[i]!.filter((e) => !aheadKeys.has(pairKey(e[0], e[1])));
          }
        }
        for (let i = 0; i < 12; i++) {
          contributed.push(cand1[i]!.length);
        }

        const waveTick = chains[0]!.waveTick;
        const wave2Tick = waveTick + WAVE2_OFFSET_TICKS;
        const blocked1 = new Set<string>();
        for (const c of cand1) {
          for (const e of c) {
            blocked1.add(pairKey(e[0], e[1]));
          }
        }
        const blocked2 = new Set(blocked1);
        for (const c of cand2) {
          for (const e of c) {
            blocked2.add(pairKey(e[0], e[1]));
          }
        }

        // --- one resident per walker, carried across both waves --------------
        const residents: Resident[] = [];
        const rerouted = new Set<number>();
        for (let i = 0; i < 12; i++) {
          const a = new Resident({
            index: i,
            name: `probe ${i}`,
            encampmentId: null,
            startLon: 0,
            startLat: 0,
            startNode: 0,
            attributes: null,
          });
          a.state = "EN_ROUTE";
          a.routeNodes = makeRouteNodes(chains[i]!);
          residents.push(a);
        }

        rows.sort((x, y) => Number(x[7]) - Number(y[7]) || Number(x[3]) - Number(y[3]));
        for (const r of rows) {
          const agent = Number(r[3]);
          const wave = Number(r[4]);
          const deferred = Number(r[5]) === 1;
          const consumedVersion = Number(r[6]);
          const tick = Number(r[7]);
          const contributedHere = Number(r[8]);
          const prePathIndex = Number(r[9]);
          const aheadEdges = Number(r[10]);
          const decision = r[11]!;
          const stuckUntilHex = r[13]!;
          const dBlock = Number(r[14]);
          const dPush = Number(r[15]);
          const dReroute = Number(r[16]);
          const dStuck = Number(r[17]);
          const thetaScaled = bitsToDouble(r[18]!);
          const barrierCost = bitsToDouble(r[19]!);
          const mobilityLimited = r[20]! === "1";
          const rngAdvanced = Number(r[25]) === 1;

          // Gate (l)'s identity, per agent per adjudication — asserted on the
          // ORACLE first, so the port is compared to something already known to
          // satisfy it, and the identity is not "proved" by the port's own if/else.
          expect(dBlock, `${key}/a${agent}@${tick} blockages == pushes + reroutes`).toBe(
            dPush + dReroute,
          );
          expect(dStuck, `${key}/a${agent}@${tick} stuck <= pushes`).toBeLessThanOrEqual(dPush);
          census.identityChecked++;

          if (wave === 1) {
            expect(contributedHere, `${key}/a${agent} edges contributed to wave 1`).toBe(
              contributed[agent]!,
            );
            census.contributedEdgesMatched++;
          }

          if (decision === "PUSH") census.push++;
          else if (decision === "REROUTE") census.reroute++;
          else if (decision === "GRANDFATHERED") census.grandfathered++;
          else census.notReached++;
          if (deferred) census.deferred++;
          if (Number(r[12]) === 1) census.stuck++;

          const snapshot = ticks.get(`${config}|${seed}|${variant}|${agent}|${tick}`);
          expect(snapshot, `ticks.tsv row ${key}/a${agent}@${tick}`).toBeDefined();
          const { pre, post } = snapshot!;
          const version = tick >= wave2Tick && cand2.some((c) => c.length > 0) ? 2 : 1;

          // --- §1.5 steps 9 and 10, as a GATE, from certified pre-state ------
          //
          // A stuck walker returns at step 9 and never reaches step 10, so a
          // wave that fires during its delay is adjudicated on the RESUME tick
          // (QUIRK 20) — that is what the 27 `deferred` rows are. Deriving the
          // gate from `ticks.tsv`'s pre-step snapshot and asserting it against
          // the dumper's own decision label checks the port's transcription of
          // steps 9-10 on all 567 rows, including the ones where nothing
          // happened.
          const preStuck = bitsToDouble(pre.stuckUntilHex);
          const stuckNow = !Number.isNaN(preStuck) && tick < preStuck;
          const oracleEnters =
            pre.state === "EN_ROUTE" &&
            pre.routeNodesLen >= 0 &&
            pre.routePathLen >= 0 &&
            !stuckNow &&
            version !== pre.seenVersion;
          expect(oracleEnters, `${key}/a${agent}@${tick} step 10 entered (${decision})`).toBe(
            decision !== "NOT_REACHED",
          );
          if (!oracleEnters) {
            expect([dBlock, dPush, dReroute, dStuck], "NOT_REACHED moves nothing").toEqual([
              0, 0, 0, 0,
            ]);
            expect(post.seenVersion, "NOT_REACHED consumes no version").toBe(pre.seenVersion);
            continue;
          }

          const chain = chains[agent]!;
          // Is the walker still on the chain `probe.tsv` recorded? A reroute
          // discards it (QUIRK 43) and so does a DOOR REFUSAL — `step()` clears
          // `routeNodes` and moves `currentNodeId` to the shelter's node, then
          // re-plans. Either way the new chain was built over trees this dump
          // does not ship, so the port cannot rebuild the input. Detected from
          // the certified snapshot rather than from the port's own bookkeeping:
          // the leg's origin is `nodes[0]`, which is `currentNodeId` for as long
          // as the leg lives.
          const chainIntact =
            pre.currentNode === chain.nodeIds[0] && pre.routeNodesLen === chain.nodeIds.length;
          if (wave === 1 && !deferred) {
            expect(chainIntact, `${key}/a${agent}@${tick} probe chain intact at wave 1`).toBe(true);
          }
          if (!chainIntact) {
            census.rowsSkippedRerouted++;
            census.skippedByDecision[decision] = (census.skippedByDecision[decision] ?? 0) + 1;
            rerouted.add(agent);
            continue;
          }
          if (decision !== "REROUTE") {
            expect(aheadEdges, `${key}/a${agent}@${tick} ahead-edge count`).toBe(
              aheadEdgeCount(chain, prePathIndex),
            );
            census.aheadCountsMatched++;
          }

          const a = residents[agent]!;
          // The port's own carried state must already agree with the certified
          // pre-step snapshot — cumulative counters, the pushed-blockage set
          // size (QUIRK 11: the second scan records EVERY blocked ahead edge,
          // not just the hit) and the consumed version.
          expect(
            [
              a.blockagesEncountered,
              a.pushThroughs,
              a.reroutes,
              a.stuckEvents,
              a.pushedBlockages === null ? -1 : a.pushedBlockages.size,
              a.seenClosureVersion,
            ],
            `${key}/a${agent}@${tick} carried state`,
          ).toEqual([
            pre.blockages,
            pre.pushes,
            pre.reroutes,
            pre.stucks,
            pre.pushedSet,
            pre.seenVersion,
          ]);

          a.decisionConfig = cfg;
          a.decision =
            cfg === null
              ? null
              : ({
                  awareInitial: true,
                  heavyBelongings: r[22]! === "1",
                  hasPet: r[21]! === "1",
                  hasDependents: r[23]! === "1",
                  thetaZ: bitsToDouble(r[24]!),
                  groupSpeedDeltaMps: 0,
                  decisionSeed: 0n,
                } satisfies DecisionAttributes);
          a.thetaScaled = thetaScaled;
          a.barrierCost = barrierCost;
          (a as { attributes: PopulationAttributes | null }).attributes = mobilityLimited
            ? ({ mobilityLimited: true } as PopulationAttributes)
            : null;
          a.decisionRng = cfg === null ? null : rngFromRawSeed(pre.rngState);
          // Step 9 has just run: the gate above proved the walker is not held,
          // so the delay (if any) is served and the field is back to NaN.
          a.stuckUntilTick = Number.NaN;

          const blocked = version === 2 ? blocked2 : blocked1;
          const network: ClosureNetworkView = {
            closureVersion: () => version,
            isBlocked: (x, y) => blocked.has(pairKey(x, y)),
          };

          const before = {
            b: a.blockagesEncountered,
            p: a.pushThroughs,
            r: a.reroutes,
            s: a.stuckEvents,
          };
          reactToClosureWave(a, network, tick, MINUTES_PER_TICK, prePathIndex);

          expect(
            [
              a.blockagesEncountered - before.b,
              a.pushThroughs - before.p,
              a.reroutes - before.r,
              a.stuckEvents - before.s,
            ],
            `${key}/a${agent}@${tick} counter deltas (${decision})`,
          ).toEqual([dBlock, dPush, dReroute, dStuck]);
          expect(a.seenClosureVersion, `${key}/a${agent}@${tick} version consumed`).toBe(
            consumedVersion,
          );
          expect(consumedVersion, "the row's consumed version is the live one").toBe(version);

          // `stuckUntilTick` as RAW BITS: `tick + stuckDelayH * (60.0 /
          // minutesPerTick)`, or the NaN sentinel 7ff8000000000000.
          expect(hexD(a.stuckUntilTick), `${key}/a${agent}@${tick} stuckUntilTick bits`).toBe(
            stuckUntilHex,
          );
          census.stuckTicksMatched++;

          // QUIRK 11: one gamble covers EVERY currently blocked ahead edge.
          expect(
            a.pushedBlockages === null ? -1 : a.pushedBlockages.size,
            `${key}/a${agent}@${tick} pushedBlockages size`,
          ).toBe(post.pushedSet);

          if (cfg === null) {
            // QUIRK 21: the layer-off degenerate must never touch a stream.
            expect(a.decisionRng, `${key}/a${agent}@${tick} decisionRng untouched`).toBeNull();
            expect(pre.rngState, "layerOff has no decision stream").toBe("-1");
          } else {
            expect(
              a.decisionRng!.seed48.toString(),
              `${key}/a${agent}@${tick} post-draw RNG state`,
            ).toBe(post.rngState);
            expect(a.decisionRng!.seed48.toString() !== pre.rngState, "stream advanced?").toBe(
              rngAdvanced,
            );
            census.rngStatesMatched++;
          }

          if (decision === "REROUTE") {
            // `currentNodeId = nodes[lastReached]` — where the walker STANDS.
            expect(
              chain.nodeIds[a.currentNode],
              `${key}/a${agent}@${tick} reroute currentNodeId`,
            ).toBe(post.currentNode);
            expect(a.leg).toBeNull();
            expect(a.routeNodes).toBeNull();
            expect(a.targetShelter).toBeNull();
            census.rerouteNodesMatched++;
            rerouted.add(agent);
            // Restore the chain: the certified agent re-planned at step 11 and
            // this harness has no chooser, so a later row for this walker is
            // skipped (see the module doc) rather than run against a stale chain.
            a.routeNodes = makeRouteNodes(chain);
          } else {
            expect(a.routeNodes, `${key}/a${agent}@${tick} keeps its stale path`).not.toBeNull();
            expect(post.currentNode, `${key}/a${agent}@${tick} currentNodeId unchanged`).toBe(
              pre.currentNode,
            );
          }
          census.rowsAsserted++;
        }
      }

      // eslint-disable-next-line no-console -- the census IS the evidence
      console.log(`[WP8 reaction oracle] ${JSON.stringify(census)}`);

      // DR-WP8-closure-oracle §6.2's totals, re-counted from the dump.
      expect(census.push).toBe(147);
      expect(census.reroute).toBe(204);
      expect(census.grandfathered).toBe(135);
      expect(census.notReached).toBe(81);
      expect(census.stuck).toBe(102);
      expect(census.deferred).toBe(27);
      expect(census.push + census.reroute).toBe(351);
      expect(census.identityChecked).toBe(567);
      // Every row is accounted for: driven through the port, proved unreachable
      // at the step-9/10 gate, or declared unreconstructable and counted.
      expect(census.rowsAsserted + census.notReached + census.rowsSkippedRerouted).toBe(567);
      // Every REROUTE — the branch with the most moving parts — was driven.
      expect(census.rerouteNodesMatched).toBe(census.reroute);
      // Nothing at wave 1 is ever skipped: only a walker that has re-planned
      // (rerouted or refused at a door) since wave 1 loses its recorded chain.
      expect(census.skippedByDecision["REROUTE"]).toBeUndefined();
    });

    it("SE-F7: a STUCK EN_ROUTE walker breathes at the RESTING rate, bit for bit", () => {
      // WP8-SPEC-closures §10 and QUIRK 16/17/18, verified against the Java
      // rather than assumed:
      //
      //   | tick        | stuckNow | ventilation      | why                    |
      //   |-------------|----------|------------------|------------------------|
      //   | T           | false    | WALKING  1.62    | block 5 ran while the  |
      //   |             |          |                  | field was still NaN    |
      //   | T+1 … T+D-1 | true     | RESTING  0.61    | `tick < stuckUntilTick`|
      //   | T+D         | false    | WALKING  1.62    | strict `<`; resumes    |
      //
      // `ticks.tsv` records `airVolumeBreathedM3` before and after every tick
      // over a window that spans the whole delay, so the accumulation is
      // replayed forward from the window's first snapshot and compared BIT FOR
      // BIT. Air volume isolates the ventilation rate exactly — it is the one
      // accumulator the smoke concentration does not enter.
      const rows = tsvRows(readVerifiedDump("reaction.ticks", "reaction/ticks.tsv"));
      const dtHours = MINUTES_PER_TICK / 60.0;
      const byAgent = new Map<string, { tick: number; pre: Snap; post: Snap }[]>();
      for (const r of rows) {
        const k = `${r[0]!}|${r[1]!}|${r[2]!}|${r[3]!}`;
        let l = byAgent.get(k);
        if (l === undefined) {
          l = [];
          byAgent.set(k, l);
        }
        l.push({ tick: Number(r[4]), pre: readSnap(r, 6), post: readSnap(r, 6 + SNAP_WIDTH) });
      }

      let restingTicks = 0;
      let walkingTicks = 0;
      let shelteredTicks = 0;
      let entryTicksAtWalking = 0;
      let ticksReplayed = 0;
      let runs = 0;
      for (const [k, list] of byAgent) {
        list.sort((a, b) => a.tick - b.tick);
        let air = Number.NaN;
        let prevTick = Number.NaN;
        for (const { tick, pre, post } of list) {
          if (tick !== prevTick + 1) {
            air = bitsToDouble(pre.airHex); // a new contiguous window
            runs++;
          }
          prevTick = tick;
          expect(hexD(air), `${k}@${tick} carried airVolumeBreathedM3`).toBe(pre.airHex);

          if (pre.state !== "SHELTERED") {
            const preStuck = bitsToDouble(pre.stuckUntilHex);
            const stuckNow = !Number.isNaN(preStuck) && tick < preStuck;
            const rate =
              pre.state === "EN_ROUTE" && !stuckNow
                ? INHALATION_WALKING_M3H
                : INHALATION_RESTING_M3H;
            if (stuckNow) {
              restingTicks++;
            } else if (pre.state === "EN_ROUTE") {
              walkingTicks++;
              // QUIRK 18: the tick a stuck event is CREATED is booked at
              // WALKING, because block 5 runs before steps 9-10.
              if (post.stucks > pre.stucks) {
                entryTicksAtWalking++;
              }
            }
            air += rate * dtHours;
          } else {
            shelteredTicks++;
          }
          expect(hexD(air), `${k}@${tick} airVolumeBreathedM3 after`).toBe(post.airHex);
          ticksReplayed++;
        }
      }
      // eslint-disable-next-line no-console -- the census IS the evidence
      console.log(
        `[WP8 ventilation] ${ticksReplayed} certified ticks replayed over ${runs} windows: ` +
          `${restingTicks} at RESTING (stuck), ${walkingTicks} at WALKING, ${shelteredTicks} ` +
          `sheltered, ${entryTicksAtWalking} stuck-entry ticks booked at WALKING`,
      );
      // The branch must actually have been exercised, or this proves nothing.
      expect(restingTicks).toBeGreaterThan(0);
      expect(entryTicksAtWalking).toBe(102); // one per certified stuck event
    });

    it("the layerOff config produces no push-through anywhere in the dump (QUIRK 21)", () => {
      const events = tsvRows(readVerifiedDump("reaction.events", "reaction/events.tsv"));
      const off = events.filter((r) => r[0] === "layerOff");
      expect(off.length).toBeGreaterThan(0);
      expect(off.filter((r) => Number(r[15]) > 0), "layerOff pushes").toEqual([]);
      expect(off.every((r) => r[25] === "0"), "layerOff never advanced a stream").toBe(true);
    });

    it("armedStuck1 turns every push into a stuck event (pStuck = 1.0)", () => {
      const events = tsvRows(readVerifiedDump("reaction.events", "reaction/events.tsv"));
      const s1 = events.filter((r) => r[0] === "armedStuck1");
      const pushes = s1.reduce((n, r) => n + Number(r[15]), 0);
      const stucks = s1.reduce((n, r) => n + Number(r[17]), 0);
      expect(pushes).toBeGreaterThan(0);
      expect(stucks).toBe(pushes);
    });

    it("the `behind` variant moves no counter but still consumes the version", () => {
      // QUIRK 9 + QUIRK 12 together: closures block ENTRY to a street, so a
      // walker at or past the junction is grandfathered — and the wave is still
      // burned by the one scan, which is what bounds the work.
      const events = tsvRows(readVerifiedDump("reaction.events", "reaction/events.tsv"));
      const behind = events.filter((r) => r[2] === "behind");
      expect(behind.length).toBe(9 * 12);
      expect(behind.filter((r) => Number(r[14]) !== 0), "behind blockages").toEqual([]);
      expect(behind.filter((r) => r[11] !== "GRANDFATHERED"), "behind decisions").toEqual([]);
      expect(behind.every((r) => Number(r[6]) === 1), "behind consumed version 1").toBe(true);
    });

    it("multi5 closes five ahead edges but books ONE blockage (QUIRK 40)", () => {
      const events = tsvRows(readVerifiedDump("reaction.events", "reaction/events.tsv"));
      const multi = events.filter((r) => r[2] === "multi5" && Number(r[4]) === 1);
      expect(multi.length).toBe(9 * 12);
      expect(multi.every((r) => Number(r[8]) === 5), "five edges contributed each").toBe(true);
      expect(multi.every((r) => Number(r[14]) === 1), "exactly one blockage each").toBe(true);
    });
  },
);
