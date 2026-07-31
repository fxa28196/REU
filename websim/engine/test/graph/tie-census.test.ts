/**
 * The tie census over the CERTIFIED corpus — the measurement that licenses
 * `engine/test/oracle/tie-oracle.test.ts` to be synthetic.
 *
 * That oracle pins down what `StreetNetwork.computeTree` does at an exact double
 * distance tie, on small synthetic graphs built through the certified API. The
 * justification for not cutting the fixture out of the real Portland graph is a
 * factual claim about the real graph:
 *
 *   1. all 109,434 certified edge lengths are **pairwise distinct** as raw
 *      IEEE-754 doubles, so no two-hop detour can tie; and
 *   2. across all 118 certified shelter trees — 3,539,712 node rows — **no**
 *      node has two or more incoming relaxations `dist[u] + len(u,v)` that are
 *      bit-equal to `dist[v]`.
 *
 * Until this file existed, that claim appeared only in prose: in the tie
 * oracle's docblock, in the Java dumper's docblock and in README §2.1 — which
 * opens "Every number below is produced by a test in this tree, not quoted from
 * a plan". It was not. This file measures it, so the scope limit on the tie
 * oracle is evidence rather than assertion, and so the day the certified graph
 * changes and a real tie appears, the suite says so instead of the README
 * quietly becoming false.
 *
 * The census is computed from the port's own `computeTree` output, which
 * `trees.parity.test.ts` proves bit-equal to the Java dumps for all 3,539,712
 * distances and all 3,539,712 predecessor edges. Measuring the tie structure of
 * a distance array that is bit-equal to Java's is measuring Java's.
 *
 * Artifact-gated: needs the packed graph asset and the F1 tree dumps, both
 * git-ignored. On a clean clone it skips loudly, and under
 * `WEBSIM_REQUIRE_ARTIFACTS` the absence is a hard failure (README §8.1).
 */

import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

import { artifactGate, describeGated } from "../../../tools/artifact-gate.js";
import { computeTree, makeScratch } from "../../src/graph/dijkstra.js";
import { javaParseDouble, readCsvText, decodeCsvBytes } from "../../src/loader/csv.js";
import { DegreeSpaceNodeIndex } from "../../src/graph/strtreeSnap.js";
import {
  GEOGRAPHY_DIR,
  GEOGRAPHY_SHELTERS_REF,
  GRAPH_ASSET_REFS,
  TREE_FIXTURE_REF,
  doubleToBits,
  loadGraph,
} from "./helpers.js";

const ARMS = [
  { arm: "A", csv: "data/shelters/shelters_2026_current_placement.csv" },
  { arm: "B", csv: "data/shelters/shelters_2026_expanded_capacity.csv" },
  { arm: "C", csv: "data/shelters/shelters_2026_expanded_plus_new_sites.csv" },
] as const;

describeGated(
  artifactGate({
    gate: "engine:graph-tie-census",
    suite: "exact-tie census over the certified corpus",
    evidence:
      "the measurement that licenses the exact-tie oracle to be synthetic: 109,434 certified " +
      "edge lengths pairwise distinct as raw doubles, and zero nodes carrying two or more " +
      "bit-equal incoming relaxations across all 118 certified shelter trees",
    artifacts: [...GRAPH_ASSET_REFS, TREE_FIXTURE_REF, GEOGRAPHY_SHELTERS_REF],
  }),
  () => {
    it("finds no duplicate edge length among the 109,434 certified weights", () => {
      const { graph } = loadGraph();
      const seen = new Set<string>();
      const duplicated = new Set<string>();
      for (let e = 0; e < graph.edgeCount; e++) {
        const bits = doubleToBits(graph.edgeLengthM[e]!);
        if (seen.has(bits)) {
          duplicated.add(bits);
        } else {
          seen.add(bits);
        }
      }
      // eslint-disable-next-line no-console
      console.log(
        `[tie-census] ${graph.edgeCount} certified edge lengths, ${seen.size} distinct raw ` +
          `doubles, ${duplicated.size} value(s) carried by more than one edge`,
      );
      expect(graph.edgeCount).toBe(109_434);
      expect(seen.size, "distinct edge-length doubles").toBe(graph.edgeCount);
      expect(
        [...duplicated],
        "a repeated edge length would make a two-hop detour able to tie, which would change " +
          "what the synthetic tie oracle is allowed to claim about the real graph",
      ).toEqual([]);
    });

    it(
      "finds no node with two bit-equal incoming relaxations in any of the 118 certified trees",
      () => {
        const { graph } = loadGraph();
        const index = new DegreeSpaceNodeIndex(graph);
        const scratch = makeScratch(graph);
        // Reused across trees; only the entries touched in a pass are read back.
        const incoming = new Int32Array(graph.nodeCount);

        let trees = 0;
        let rows = 0;
        let tieNodes = 0;
        let widest = 0;
        /** Nodes with at least one exact arrival — the detector's non-vacuity proof. */
        let arrivals = 0;
        const examples: string[] = [];

        for (const { arm, csv } of ARMS) {
          const shelters = readCsvText(decodeCsvBytes(readFileSync(`${GEOGRAPHY_DIR}/${csv}`)));
          for (let i = 0; i < shelters.length; i++) {
            const row = shelters[i]!;
            const source = index.nearest(
              javaParseDouble(row.get("lon") ?? ""),
              javaParseDouble(row.get("lat") ?? ""),
            );
            const tree = computeTree(graph, source.node, scratch);
            const { dist } = tree;

            // Count, for every reachable v, how many reachable neighbours u relax
            // onto EXACTLY dist[v]. The winning predecessor is one of them; a
            // second one is a tie, and a tie is the only place the strict `<`
            // relaxation is observable.
            let reachable = 0;
            for (let u = 0; u < graph.nodeCount; u++) {
              if (!Number.isFinite(dist[u]!)) {
                continue;
              }
              reachable++;
              const lo = graph.csrOffset[u]!;
              const hi = graph.csrOffset[u + 1]!;
              for (let k = lo; k < hi; k++) {
                const v = graph.csrOther[k]!;
                if (!Number.isFinite(dist[v]!)) {
                  continue;
                }
                if (dist[u]! + graph.edgeLengthM[graph.csrDirected[k]! >>> 1]! === dist[v]!) {
                  incoming[v] = incoming[v]! + 1;
                }
              }
            }
            // Second pass over the same reachable set: read the counters, then
            // clear them so the next tree starts from zero without refilling
            // 88,100 slots 118 times.
            for (let v = 0; v < graph.nodeCount; v++) {
              const n = incoming[v]!;
              if (n === 0) {
                continue;
              }
              incoming[v] = 0;
              arrivals++;
              if (n >= 2) {
                tieNodes++;
                widest = Math.max(widest, n);
                if (examples.length < 5) {
                  examples.push(`${arm}[${i}] node ${graph.nodeId[v]!} has ${n} bit-equal arrivals`);
                }
              }
            }
            rows += reachable;
            trees++;
          }
        }

        // eslint-disable-next-line no-console
        console.log(
          `[tie-census] ${trees}/${trees} certified trees, ${rows} reachable node rows scanned, ` +
            `${arrivals} node(s) with an exact incoming relaxation, ` +
            `${tieNodes} node(s) with >= 2 bit-equal incoming relaxations` +
            (tieNodes === 0 ? "" : ` (widest ${widest}-way: ${examples.join("; ")})`),
        );
        expect(trees).toBe(118);
        expect(rows).toBe(3_539_712);
        // NON-VACUITY. "Zero ties" is only meaningful if the detector fires at
        // all: every reachable node except its tree's source is reached by its
        // predecessor at EXACTLY its distance, by construction of the
        // relaxation. So the arrival count must be the row count minus one per
        // tree. A detector that silently found nothing would report 0 here and
        // be caught, instead of reporting "0 ties" and being believed.
        expect(arrivals, "nodes with >= 1 exact arrival = rows - one source per tree").toBe(
          rows - trees,
        );
        expect(
          examples,
          "a real tie in the certified corpus would mean the synthetic tie oracle is no longer " +
            "the only place the tie policy can be exercised — and that the strict `<` relaxation " +
            "is observable in production routing, which it currently is not",
        ).toEqual([]);
        expect(tieNodes).toBe(0);
      },
      600_000,
    );
  },
);
