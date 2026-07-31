/**
 * The exact-tie oracle: what the certified Java `StreetNetwork.computeTree`
 * actually does when two relaxations land on **bit-identical** distances.
 *
 * ## The gap this closes
 *
 * The port relaxes with strict `nd < old`, so at an exact tie the *first-relaxed*
 * predecessor wins and never yields. Distances are tie-independent; path
 * *geometry* is not (PORT_MAP R12). Mutating that `<` to `<=` therefore changes
 * predecessor edges and nothing else — and it survived **every** distance-and-
 * predecessor oracle in this repo, including the committed slice and the full
 * 3,539,712-row corpus, because:
 *
 *  - all 109,434 certified edge lengths are **pairwise distinct** as raw
 *    IEEE-754 doubles (0 duplicate-length groups), so no two-hop detour can tie;
 *  - across all 118 certified shelter trees, **zero** nodes have two or more
 *    incoming relaxations `dist[u] + len(u,v)` bit-equal to `dist[v]`.
 *
 * The real graph contains no tie at all, so no cut of it — however large — can
 * pin the tie policy down. That is a property of the certified data, not a hole
 * in the fixtures, and it is why this file exists.
 *
 * ## What the oracle is
 *
 * `pipeline/java-exporter/src-tie/.../TieOracleDumper.java` runs the **certified**
 * `StreetNetwork` (`addStreet` → `buildIndex` → `computeTree`) over six small
 * synthetic graphs whose weights are real WGS84 geodesics between real certified
 * graph node positions. Exact ties are forced two ways, both of which are
 * properties of the certified code rather than of the fixture:
 *
 *  - **identical polylines** — `polylineLengthM` is a pure function of its
 *    coordinate array, so duplicated geometry has a bit-identical length;
 *  - **left-associative prefix sums** — `polylineLengthM` accumulates from `0.0`
 *    in vertex order and Dijkstra accumulates from `dist[source] == 0.0` in the
 *    same order, so a "long block" feature spanning `P0..Pk` carries *exactly*
 *    the double the chain `P0→…→Pk` accumulates.
 *
 * Nothing about the tie policy is asserted by the dumper or reconstructed here:
 * the Java model was run and its answer recorded. The dumper refuses to write a
 * fixture unless a `<=` relaxation would disagree with it, and this file
 * re-establishes that independently below.
 *
 * ## Bounded unknowns, stated rather than papered over
 *
 *  1. The tie *cases* are synthetic. The certified corpus has none, so there is
 *     no evidence about how the real Portland graph behaves at a tie — because
 *     it never gets there. What is certified here is the **policy**, exercised
 *     on real geodesic weights.
 *  2. `heap-equal-keys` places six nodes at one coordinate. Coincident positions
 *     are the only way to give two *distinct* nodes an exactly equal source
 *     distance, and `computeTree` reads no coordinate — only edge weights and
 *     adjacency order. `nearestNode` is never called on these graphs.
 *
 * This file has no `skipIf`: it runs from committed bytes with `pipeline/out/`
 * absent, like `committed-slice.test.ts`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { GraphTopology } from "@websim/shared/graph-asset";

import { BlockedEdges } from "../../src/graph/blocked.js";
import { buildRoutingGraph, type RoutingGraph } from "../../src/graph/csr.js";
import { computeTree, makeScratch } from "../../src/graph/dijkstra.js";
import { bitsToDouble, dataLines, doubleToBits } from "../world/helpers.js";

const FIXTURE = fileURLToPath(new URL("../fixtures/graph-tie/tie-oracle.tsv", import.meta.url));

// ------------------------------------------------------------------ parsing

interface Scenario {
  readonly id: string;
  readonly note: string;
  readonly sourceNode: number;
  readonly declaredNodes: number;
  readonly declaredFeatures: number;
  readonly declaredBlocked: number;
  /** node id → anchor index (documentation only; computeTree reads no coordinate). */
  readonly anchorOf: Map<number, number>;
  readonly featureFrom: number[];
  readonly featureTo: number[];
  readonly featureLengthHex: string[];
  readonly featureCoordCount: number[];
  /** node id → certified directed edge ids, in certified adjacency order. */
  readonly adjacency: Map<number, number[]>;
  readonly blocked: [number, number][];
  /** node id → [distHex, predecessor directed edge id]. */
  readonly tree: Map<number, [string, number]>;
  /** node id → certified tie candidates (length ≥ 2 by construction of the dump). */
  readonly ties: Map<number, number[]>;
}

interface Header {
  readonly javaVersion: string;
  readonly streetNetworkSha256: string;
  readonly scenarios: number;
  readonly tieNodes: number;
  readonly maxTieCandidates: number;
  readonly mutantDisagreements: number;
}

const text = readFileSync(FIXTURE, "utf8");

function parseHeader(): Header {
  const get = (re: RegExp): string => {
    const m = re.exec(text);
    expect(m, `fixture header is missing ${String(re)}`).not.toBeNull();
    return m![1]!;
  };
  return {
    javaVersion: get(/^# java_version=(.+)$/mu),
    streetNetworkSha256: get(/^# street_network_sha256=([0-9a-f]{64})$/mu),
    scenarios: Number(get(/^# scenarios=(\d+)\t/mu)),
    tieNodes: Number(get(/\ttie_nodes=(\d+)\t/mu)),
    maxTieCandidates: Number(get(/\tmax_tie_candidates=(\d+)\t/mu)),
    mutantDisagreements: Number(get(/\tle_mutant_predecessor_disagreements=(\d+)$/mu)),
  };
}

/** anchor index → [certified node id, lon, lat], for provenance assertions. */
const anchors: [number, number, number][] = [];
const scenarios: Scenario[] = [];

{
  const byId = new Map<string, Scenario>();
  const need = (id: string): Scenario => {
    const s = byId.get(id);
    expect(s, `row references undeclared scenario ${id}`).toBeDefined();
    return s!;
  };
  for (const line of dataLines(text)) {
    const f = line.split("\t");
    switch (f[0]) {
      case "ANCHOR":
        anchors[Number(f[1])] = [Number(f[2]), bitsToDouble(f[3]!), bitsToDouble(f[4]!)];
        break;
      case "SCENARIO": {
        const s: Scenario = {
          id: f[1]!,
          sourceNode: Number(f[2]),
          declaredNodes: Number(f[3]),
          declaredFeatures: Number(f[4]),
          declaredBlocked: Number(f[5]),
          note: f[6]!,
          anchorOf: new Map(),
          featureFrom: [],
          featureTo: [],
          featureLengthHex: [],
          featureCoordCount: [],
          adjacency: new Map(),
          blocked: [],
          tree: new Map(),
          ties: new Map(),
        };
        byId.set(s.id, s);
        scenarios.push(s);
        break;
      }
      case "NODE":
        need(f[1]!).anchorOf.set(Number(f[2]), Number(f[3]));
        break;
      case "FEATURE": {
        const s = need(f[1]!);
        const i = Number(f[2]);
        s.featureFrom[i] = Number(f[3]);
        s.featureTo[i] = Number(f[4]);
        s.featureLengthHex[i] = f[5]!;
        s.featureCoordCount[i] = Number(f[6]);
        break;
      }
      case "ADJ":
        need(f[1]!).adjacency.set(Number(f[2]), f[3]!.split(",").map(Number));
        break;
      case "BLOCK":
        need(f[1]!).blocked.push([Number(f[2]), Number(f[3])]);
        break;
      case "TREE":
        need(f[1]!).tree.set(Number(f[2]), [f[3]!, Number(f[4])]);
        break;
      case "TIE":
        need(f[1]!).ties.set(Number(f[2]), f[3]!.split(",").map(Number));
        break;
      default:
        throw new Error(`unknown tie-oracle row kind ${String(f[0])}`);
    }
  }
}

const header = parseHeader();

// -------------------------------------------------------- graph construction

/**
 * Rebuild one scenario's routing graph from the dump.
 *
 * Node ids, the feature table and — critically — the per-node adjacency ORDER
 * all come from the certified `StreetNetwork.adjacency` map as it was after
 * `buildIndex()`. `buildRoutingGraph` re-derives each record's tail from the
 * signed edge id and refuses a slice whose orientation flag disagrees, so a
 * mis-transcribed fixture fails loudly here rather than quietly comparing a
 * different graph.
 */
function graphOf(s: Scenario): { graph: RoutingGraph; sourceIndex: number } {
  const ids = [...s.anchorOf.keys()].sort((a, b) => a - b);
  const indexOf = new Map(ids.map((id, i) => [id, i]));
  const nodeCount = ids.length;
  const edgeCount = s.featureFrom.length;

  const nodeId = Int32Array.from(ids);
  const nodeLon = new Float64Array(nodeCount);
  const nodeLat = new Float64Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    const anchor = anchors[s.anchorOf.get(ids[i]!)!]!;
    nodeLon[i] = anchor[1];
    nodeLat[i] = anchor[2];
  }

  const edgeFrom = new Int32Array(edgeCount);
  const edgeTo = new Int32Array(edgeCount);
  const edgeLengthM = new Float64Array(edgeCount);
  for (let e = 0; e < edgeCount; e++) {
    edgeFrom[e] = indexOf.get(s.featureFrom[e]!)!;
    edgeTo[e] = indexOf.get(s.featureTo[e]!)!;
    edgeLengthM[e] = bitsToDouble(s.featureLengthHex[e]!);
  }

  const csrOffset = new Int32Array(nodeCount + 1);
  const entries: number[] = [];
  for (let i = 0; i < nodeCount; i++) {
    csrOffset[i] = entries.length;
    for (const directed of s.adjacency.get(ids[i]!) ?? []) {
      const e = directed >>> 1;
      entries.push((directed & 1) === 0 ? e + 1 : -(e + 1));
    }
  }
  csrOffset[nodeCount] = entries.length;

  const topology: GraphTopology = {
    nodeCount,
    edgeCount,
    nodeId,
    nodeLon,
    nodeLat,
    edgeFrom,
    edgeTo,
    edgeLengthM,
    csrOffset,
    csrEntry: Int32Array.from(entries),
    census: {} as GraphTopology["census"],
    corrections: [],
  };
  return { graph: buildRoutingGraph(topology), sourceIndex: indexOf.get(s.sourceNode)! };
}

function blockedOf(s: Scenario, graph: RoutingGraph): BlockedEdges | undefined {
  if (s.blocked.length === 0) {
    return undefined;
  }
  const b = new BlockedEdges(graph);
  for (const [a, c] of s.blocked) {
    b.blockPair(graph.nodeIndexById.get(a)!, graph.nodeIndexById.get(c)!);
  }
  return b;
}

/**
 * Every relaxation that lands EXACTLY on `dist[v]`, derived from the PORT's own
 * result rather than read out of the fixture. Comparing this against the `TIE`
 * rows is what keeps the fixture from silently losing its discriminating power:
 * a future edge-weight change that dissolved the ties would leave every `TREE`
 * assertion passing and be caught only here.
 */
function tieCandidates(
  graph: RoutingGraph,
  dist: Float64Array,
  blocked: BlockedEdges | undefined,
): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (let u = 0; u < graph.nodeCount; u++) {
    if (!Number.isFinite(dist[u]!)) {
      continue;
    }
    for (let k = graph.csrOffset[u]!; k < graph.csrOffset[u + 1]!; k++) {
      const v = graph.csrOther[k]!;
      if (blocked !== undefined && blocked.isBlocked(u, v)) {
        continue;
      }
      if (!Number.isFinite(dist[v]!)) {
        continue;
      }
      if (doubleToBits(dist[u]! + graph.edgeLengthM[graph.csrDirected[k]! >>> 1]!) === doubleToBits(dist[v]!)) {
        const id = graph.nodeId[v]!;
        const list = out.get(id);
        if (list === undefined) {
          out.set(id, [graph.csrDirected[k]!]);
        } else {
          list.push(graph.csrDirected[k]!);
        }
      }
    }
  }
  return out;
}

/**
 * A deliberate MUTANT of `computeTree` whose only difference from the production
 * loop is `nd <= old` in place of `nd < old`. It exists to prove that the
 * committed oracle rejects that policy — never to relax an assertion.
 */
function computeTreeLeMutant(
  graph: RoutingGraph,
  source: number,
  blocked: BlockedEdges | undefined,
): { dist: Float64Array; predEdge: Int32Array } {
  const dist = new Float64Array(graph.nodeCount).fill(Number.POSITIVE_INFINITY);
  const predEdge = new Int32Array(graph.nodeCount).fill(-1);
  const flags = blocked !== undefined && !blocked.isEmpty ? blocked.directedFlags : null;
  const heapDist = new Float64Array(graph.directedRecords + 1);
  const heapNode = new Int32Array(graph.directedRecords + 1);
  let heapSize = 1;
  dist[source] = 0;
  heapDist[0] = 0;
  heapNode[0] = source;

  while (heapSize > 0) {
    // Explicit annotations, copied from `dijkstra.ts` along with the rest of the loop: with
    // `noUncheckedIndexedAccess` these reads feed back into the same typed arrays and TS
    // otherwise reports TS7022. The mutant has to stay a verbatim copy of production,
    // annotations included, or it stops being one — and the missing annotations were a real
    // `npm run typecheck` failure, not cosmetics.
    const d: number = heapDist[0]!;
    const u: number = heapNode[0]!;
    heapSize--;
    if (heapSize > 0) {
      const xd = heapDist[heapSize]!;
      const xn = heapNode[heapSize]!;
      let k = 0;
      const half = heapSize >>> 1;
      while (k < half) {
        let child = (k << 1) + 1;
        const right = child + 1;
        if (right < heapSize && heapDist[child]! > heapDist[right]!) {
          child = right;
        }
        if (xd <= heapDist[child]!) {
          break;
        }
        heapDist[k] = heapDist[child]!;
        heapNode[k] = heapNode[child]!;
        k = child;
      }
      heapDist[k] = xd;
      heapNode[k] = xn;
    }
    if (d > dist[u]!) {
      continue;
    }
    const lo: number = graph.csrOffset[u]!;
    const hi: number = graph.csrOffset[u + 1]!;
    for (let k: number = lo; k < hi; k++) {
      if (flags !== null && flags[k] !== 0) {
        continue;
      }
      const de = graph.csrDirected[k]!;
      const nd = d + graph.edgeLengthM[de >>> 1]!;
      const v = graph.csrOther[k]!;
      if (nd <= dist[v]!) {
        // ^^^^ THE MUTATION. Everything else is the production loop verbatim.
        dist[v] = nd;
        predEdge[v] = de;
        let i = heapSize++;
        while (i > 0) {
          const parent = (i - 1) >>> 1;
          if (heapDist[parent]! <= nd) {
            break;
          }
          heapDist[i] = heapDist[parent]!;
          heapNode[i] = heapNode[parent]!;
          i = parent;
        }
        heapDist[i] = nd;
        heapNode[i] = v;
      }
    }
  }
  return { dist, predEdge };
}

// ------------------------------------------------------------------- the tests

describe("exact-tie oracle — provenance", () => {
  it("names the certified source and the JDK it was produced under", () => {
    expect(header.streetNetworkSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(header.javaVersion).toMatch(/^17\./u);
    expect(anchors.length).toBeGreaterThanOrEqual(5);
    for (const [id, lon, lat] of anchors) {
      // Real certified graph nodes in the Portland Metro extent.
      expect(Number.isInteger(id)).toBe(true);
      expect(lon).toBeGreaterThan(-124);
      expect(lon).toBeLessThan(-121);
      expect(lat).toBeGreaterThan(45);
      expect(lat).toBeLessThan(46);
    }
  });

  it("declares the scenario count it actually carries", () => {
    expect(scenarios.length).toBe(header.scenarios);
    expect(scenarios.length).toBeGreaterThanOrEqual(6);
    for (const s of scenarios) {
      expect(s.anchorOf.size, `${s.id} node count`).toBe(s.declaredNodes);
      expect(s.featureFrom.length, `${s.id} feature count`).toBe(s.declaredFeatures);
      expect(s.blocked.length, `${s.id} blocked pairs`).toBe(s.declaredBlocked);
      expect(s.tree.size, `${s.id} tree rows`).toBeGreaterThan(0);
      expect(s.ties.size, `${s.id} carries at least one tie`).toBeGreaterThan(0);
      for (const [node, cands] of s.ties) {
        expect(cands.length, `${s.id} node ${node} is a real tie`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe("exact-tie oracle — the port vs the certified Java answer", () => {
  it("reproduces every certified distance, predecessor and reachable set at a tie", () => {
    let treeRows = 0;
    let tieNodes = 0;
    let tieCandidateRows = 0;
    let maxCandidates = 0;

    for (const s of scenarios) {
      const { graph, sourceIndex } = graphOf(s);
      const blocked = blockedOf(s, graph);
      const tree = computeTree(graph, sourceIndex, makeScratch(graph), blocked);

      const seen = new Uint8Array(graph.nodeCount);
      for (const [nodeId, [distHex, predDirected]] of s.tree) {
        const i = graph.nodeIndexById.get(nodeId);
        expect(i, `${s.id}: node ${nodeId} is in the graph`).toBeDefined();
        seen[i!] = 1;
        expect(doubleToBits(tree.dist[i!]!), `${s.id} node ${nodeId} distance`).toBe(distHex);
        expect(tree.predEdge[i!], `${s.id} node ${nodeId} predecessor directed edge`).toBe(predDirected);
        treeRows++;
      }
      // The reachable SET, not just the shared rows.
      let extra = 0;
      for (let k = 0; k < graph.nodeCount; k++) {
        if (seen[k] === 0 && Number.isFinite(tree.dist[k]!)) {
          extra++;
        }
      }
      expect(extra, `${s.id}: nodes the port reaches that the Java tree does not list`).toBe(0);
      expect(tree.reachableCount, `${s.id} reachable count`).toBe(s.tree.size);

      // The ties are re-derived from the port's own distances and must match the
      // certified census exactly — same nodes, same candidate edges, same order.
      const derived = tieCandidates(graph, tree.dist, blocked);
      const derivedTies = new Map([...derived].filter(([, c]) => c.length >= 2));
      expect(
        [...derivedTies.keys()].sort((a, b) => a - b),
        `${s.id}: nodes carrying an exact tie`,
      ).toEqual([...s.ties.keys()].sort((a, b) => a - b));
      for (const [node, certified] of s.ties) {
        expect(derivedTies.get(node), `${s.id} node ${node} tie candidates`).toEqual(certified);
        // The certified predecessor must be one of the tie candidates, and
        // specifically the FIRST-relaxed one under the certified policy.
        expect(certified, `${s.id} node ${node} pred is a candidate`).toContain(
          s.tree.get(node)![1],
        );
        tieNodes++;
        tieCandidateRows += certified.length;
        maxCandidates = Math.max(maxCandidates, certified.length);
      }
    }

    expect(tieNodes, "tie nodes asserted").toBe(header.tieNodes);
    expect(maxCandidates, "widest tie asserted").toBe(header.maxTieCandidates);
    expect(maxCandidates).toBeGreaterThanOrEqual(3);
    // eslint-disable-next-line no-console
    console.log(
      `[clean-clone] exact-tie oracle: ${scenarios.length} certified StreetNetwork scenarios, ` +
        `${treeRows} distance+predecessor rows bit-equal, ${tieNodes} nodes carrying a genuine ` +
        `exact double tie (${tieCandidateRows} tie candidates, widest ${maxCandidates}-way)`,
    );
    expect(treeRows).toBe(26); // 2 + 3 + 3 + 5 + 5 + 8 reachable nodes
  });

  it("resolves a 5-way tie by java.util.PriorityQueue pop order, not insertion order", () => {
    // `heap-equal-keys` puts six equal-key entries in the queue at once and makes
    // the FIRST-popped one a dead end. java.util.PriorityQueue.poll() moves the
    // TAIL element to the root and stops sifting at an equal child, so the entry
    // it hands back second is the last-inserted middle — not the second-inserted
    // one. Any heap that returns equal keys in insertion order picks a different
    // predecessor here while every distance stays identical.
    const s = scenarios.find((x) => x.id === "heap-equal-keys");
    expect(s, "the heap-equal-keys scenario is present").toBeDefined();
    const { graph, sourceIndex } = graphOf(s!);
    const tree = computeTree(graph, sourceIndex, makeScratch(graph));

    const far = graph.nodeIndexById.get(8)!;
    const candidates = s!.ties.get(8)!;
    expect(candidates.length).toBe(5);
    const certifiedPred = s!.tree.get(8)![1];
    expect(tree.predEdge[far]).toBe(certifiedPred);
    // The Java answer is the LAST candidate, i.e. not the first-inserted arm.
    expect(certifiedPred).toBe(candidates[candidates.length - 1]);
    expect(certifiedPred).not.toBe(candidates[0]);
  });
});

describe("exact-tie oracle — the fixture actually discriminates", () => {
  it("a '<=' relaxation is rejected by these fixtures", () => {
    // Without this, a future edit that dissolved the ties would leave the suite
    // green while quietly restoring the blind spot the fixture exists to cover.
    let disagreements = 0;
    let scenariosCaught = 0;
    for (const s of scenarios) {
      const { graph, sourceIndex } = graphOf(s);
      const blocked = blockedOf(s, graph);
      const mutant = computeTreeLeMutant(graph, sourceIndex, blocked);
      let local = 0;
      for (const [nodeId, [distHex, predDirected]] of s.tree) {
        const i = graph.nodeIndexById.get(nodeId)!;
        // The mutant must still get every DISTANCE right — that is exactly why
        // a distance oracle cannot see it.
        expect(doubleToBits(mutant.dist[i]!), `${s.id} node ${nodeId} mutant distance`).toBe(distHex);
        if (mutant.predEdge[i] !== predDirected) {
          local++;
        }
      }
      if (local > 0) {
        scenariosCaught++;
      }
      disagreements += local;
    }
    // eslint-disable-next-line no-console
    console.log(
      `[clean-clone] exact-tie discrimination: the '<=' mutant reproduces every distance but ` +
        `differs on ${disagreements} certified predecessor(s) across ${scenariosCaught}/${scenarios.length} scenarios`,
    );
    expect(disagreements, "the '<=' mutant must be caught").toBe(header.mutantDisagreements);
    expect(disagreements).toBeGreaterThanOrEqual(scenarios.length);
    expect(scenariosCaught).toBe(scenarios.length);
  });
});
