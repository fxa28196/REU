/**
 * The clean-checkout oracle: real bit-identity assertions against the certified
 * Java artifacts, with `pipeline/out/` **absent**.
 *
 * Every other parity suite in this repo is gated on the git-ignored
 * `pipeline/out/` tree, so a fresh clone used to execute zero comparisons
 * against the Java model — the port could have been replaced with `return 0`
 * and CI would still have been green. This file has no such gate. It runs
 * always, from committed bytes only, and it is deliberately the one file that
 * must never grow a `skipIf`.
 *
 * Three things are proved here, all from `engine/test/fixtures/`:
 *
 *  1. **Shelter-tree distances and predecessor edges.** `graph-slice/` holds a
 *     distance-ball cut of the certified street graph — 20,000 nodes with their
 *     certified geodesic edge weights, carried as raw IEEE-754 bytes — plus the
 *     rows the Java `StreetNetwork.computeTree` dump recorded for exactly those
 *     nodes. Running the port's Dijkstra over the slice must reproduce every
 *     distance bit for bit, every predecessor as the certified **directed** edge
 *     id, and the reachable set exactly. See
 *     `pipeline/scripts/build-committed-slice.ts` for why a ball is a sound cut
 *     (prefix distances along a shortest path are non-decreasing, so a shortest
 *     path to a ball node never leaves the ball) and for the build-time check
 *     that refuses to emit a slice which does not reproduce the dump.
 *
 *  2. **World-build columns, i.e. the RNG in anger.** `world/residents-sample.tsv`
 *     is a stride-sample of the 39 certified per-resident dumps. Replaying it
 *     exercises the Repast default stream (the camp draw), the population
 *     sampler (band, age, sex, mobility, comorbidities, and the truncated-normal
 *     walking speed bit for bit) and the E-layer sampler (aware/heavy/pet/
 *     dependents, raw θ_z, group delta, and the per-agent decision seed as a
 *     Java long). Stride 220 over 6,842 residents means a single missed or
 *     extra draw anywhere in the sequence moves every later row.
 *
 *  3. **The fixtures are what the generator says they are.** `provenance.json`
 *     carries the SHA-256 of the certified inputs the slice was cut from and of
 *     the two files that were cut; both are re-checked here, and every section
 *     digest inside the container is recomputed. A fixture that rots, is
 *     truncated, or is hand-edited fails loudly rather than quietly weakening
 *     the comparison.
 *
 * **What this file does NOT cover**, stated so the coverage is not overclaimed:
 * the ball is one shelter's neighbourhood, not the whole 88,100-node graph, and
 * a 20,000-node slice cannot answer a nearest-node query over the full graph.
 * So `start_node` / `snap_gap_m` of the resident dumps and the whole-graph tree
 * census stay the business of `graph/snap.parity.test.ts`,
 * `graph/trees.parity.test.ts` and `world/tier1.parity.test.ts`, which need
 * `pipeline/out/`. This file is the floor, not the ceiling.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  readContainerHeader,
  readI32Section,
  unpackTopology,
  verifySectionDigests,
} from "@websim/shared/graph-asset";

import { buildRoutingGraph } from "../../src/graph/csr.js";
import { computeTree, makeScratch } from "../../src/graph/dijkstra.js";
import { DegreeSpaceNodeIndex } from "../../src/graph/strtreeSnap.js";
import { buildWorld, type WorldBuildResult } from "../../src/world/build.js";
import { FIXTURE_CONFIGS } from "../world/configs.js";
import { COMMITTED_FIXTURE_DIR, dataLines, doubleToBits, geographyDataSource } from "../world/helpers.js";

const SLICE_DIR = fileURLToPath(new URL("../fixtures/graph-slice", import.meta.url));

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

interface Provenance {
  readonly inputs: {
    readonly graph_topology: { path: string; sha256: string };
    readonly shelter_tree: { path: string; sha256: string; world_manifest_name: string };
  };
  readonly slice: {
    readonly source_node_id: number;
    readonly nodes: number;
    readonly edges: number;
    readonly directed_records: number;
    readonly full_graph_nodes: number;
    readonly full_tree_reachable: number;
  };
  readonly outputs: Record<string, { bytes: number; sha256: string }>;
}

const provenance = JSON.parse(
  readFileSync(`${SLICE_DIR}/provenance.json`, "utf8"),
) as Provenance;
const sliceBytes = new Uint8Array(readFileSync(`${SLICE_DIR}/slice-topology.bin`));
const oracleBytes = new Uint8Array(readFileSync(`${SLICE_DIR}/slice-tree.tsv`));

describe("committed graph slice — provenance", () => {
  it("carries the digests the generator recorded, for both emitted files", () => {
    expect(sha256(sliceBytes)).toBe(provenance.outputs["slice-topology.bin"]!.sha256);
    expect(sliceBytes.length).toBe(provenance.outputs["slice-topology.bin"]!.bytes);
    expect(sha256(oracleBytes)).toBe(provenance.outputs["slice-tree.tsv"]!.sha256);
    expect(oracleBytes.length).toBe(provenance.outputs["slice-tree.tsv"]!.bytes);
  });

  it("names the certified artifacts it was cut from, by digest", () => {
    expect(provenance.inputs.graph_topology.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(provenance.inputs.shelter_tree.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(provenance.inputs.graph_topology.path).toContain("graph-topology.bin");
    expect(provenance.inputs.shelter_tree.world_manifest_name).toBe("trees.A.0");
  });

  it("passes the production container's own per-section digest check", async () => {
    const header = readContainerHeader(sliceBytes);
    expect(header.kind).toBe("topology");
    expect(await verifySectionDigests(sliceBytes, header, sha256)).toEqual([]);
  });

  it("is small enough to belong in git", () => {
    // The point of the slice is that it CAN be committed; a regression that
    // quietly regrew it to the 20 MB asset would defeat the whole arrangement.
    const total = sliceBytes.length + oracleBytes.length;
    expect(total).toBeLessThan(5 * 1024 * 1024);
  });
});

describe("shelter-tree distances vs the certified Java dump (no pipeline/out)", () => {
  it("reproduces every distance, predecessor edge and the reachable set", () => {
    const topology = unpackTopology(sliceBytes);
    const graph = buildRoutingGraph(topology);
    expect(graph.nodeCount).toBe(provenance.slice.nodes);
    expect(graph.edgeCount).toBe(provenance.slice.edges);
    expect(graph.directedRecords).toBe(provenance.slice.directed_records);

    // slice edge index -> certified feature index, so a slice predecessor can be
    // stated in the certified `featureIndex * 2 + dir` identity the dump uses.
    const edgeSource = readI32Section(
      sliceBytes,
      readContainerHeader(sliceBytes),
      "slice_edge_source",
    );
    expect(edgeSource.length).toBe(graph.edgeCount);

    const sourceId = provenance.slice.source_node_id;
    const source = graph.nodeIndexById.get(sourceId);
    expect(source, `source node ${sourceId} is in the slice`).toBeDefined();

    const tree = computeTree(graph, source!, makeScratch(graph));

    const text = Buffer.from(oracleBytes).toString("utf8");
    const seen = new Uint8Array(graph.nodeCount);
    let distMatched = 0;
    let predMatched = 0;
    let rows = 0;
    for (const line of dataLines(text)) {
      const t1 = line.indexOf("\t");
      const t2 = line.indexOf("\t", t1 + 1);
      const nodeId = Number(line.slice(0, t1));
      const distHex = line.slice(t1 + 1, t2);
      const predDirected = Number(line.slice(t2 + 1));

      const i = graph.nodeIndexById.get(nodeId);
      expect(i, `node ${nodeId} is in the slice`).toBeDefined();
      seen[i!] = 1;

      const gotDist = doubleToBits(tree.dist[i!]!);
      if (gotDist === distHex) {
        distMatched++;
      } else {
        expect(gotDist, `node ${nodeId} distance`).toBe(distHex);
      }

      const raw = tree.predEdge[i!]!;
      const gotPred = raw < 0 ? -1 : edgeSource[raw >>> 1]! * 2 + (raw & 1);
      if (gotPred === predDirected) {
        predMatched++;
      } else {
        expect(gotPred, `node ${nodeId} predecessor directed edge`).toBe(predDirected);
      }
      rows++;
    }

    // The reachable SET, not just the shared rows: a node the port reaches that
    // the certified dump never listed is a failure even if every shared distance
    // matched.
    let extra = 0;
    for (let k = 0; k < graph.nodeCount; k++) {
      if (seen[k] === 0 && Number.isFinite(tree.dist[k]!)) {
        extra++;
      }
    }
    expect(extra, "nodes the port reaches that the Java tree does not list").toBe(0);
    expect(tree.reachableCount).toBe(rows);

    // eslint-disable-next-line no-console
    console.log(
      `[clean-clone] shelter tree: ${distMatched}/${rows} distances bit-equal, ` +
        `${predMatched}/${rows} predecessor edges equal, reachable set exact ` +
        `(ball of ${graph.nodeCount} nodes / ${graph.edgeCount} edges cut from the ` +
        `${provenance.slice.full_graph_nodes}-node certified graph)`,
    );
    expect(rows).toBe(provenance.slice.nodes);
    expect(distMatched).toBe(rows);
    expect(predMatched).toBe(rows);
  }, 120_000);
});

describe("world-build columns vs the certified per-resident dumps (no pipeline/out)", () => {
  it("reproduces every sampled resident's draws across all 39 config-seed pairs", () => {
    // The slice is a real piece of the certified graph, so `buildWorld` runs its
    // production path over it. What the slice cannot answer is a nearest-node
    // query over the whole graph, so `start_node` and `snap_gap_m` — the only
    // two whole-graph columns — are not compared here; they are the subject of
    // `graph/snap.parity.test.ts` and `world/tier1.parity.test.ts`.
    const graph = buildRoutingGraph(unpackTopology(sliceBytes));
    const index = new DegreeSpaceNodeIndex(graph);
    const data = geographyDataSource();
    const worlds = new Map<string, WorldBuildResult>();

    const sample = readFileSync(`${COMMITTED_FIXTURE_DIR}/residents-sample.tsv`, "utf8");
    let rows = 0;
    let fieldsCompared = 0;
    const pairs = new Set<string>();

    for (const line of dataLines(sample)) {
      const f = line.split("\t");
      const configId = f[0]!;
      const seed = Number(f[1]);
      const key = `${configId}@${seed}`;
      pairs.add(key);

      let w = worlds.get(key);
      if (w === undefined) {
        const fixture = FIXTURE_CONFIGS.find((c) => c.id === configId);
        expect(fixture, `config ${configId} is declared`).toBeDefined();
        w = buildWorld(
          { ...fixture!.config, randomSeed: seed },
          {
            graph,
            data,
            smokeHours: fixture!.smokeHours,
            snapIndex: index,
            computeShelterTrees: false,
            registryValidated: true,
          },
        );
        worlds.set(key, w);
      }

      const i = Number(f[2]);
      const r = w.residents[i]!;
      const at = `${key}[${i}]`;
      expect(r.index, `${at} index`).toBe(i);
      expect(r.campIndex, `${at} camp_idx`).toBe(Number(f[3]));
      expect(r.incId, `${at} inc_id`).toBe(f[4]!);
      expect(doubleToBits(r.startLon), `${at} camp lon`).toBe(f[5]!);
      expect(doubleToBits(r.startLat), `${at} camp lat`).toBe(f[6]!);

      const a = r.attributes!;
      expect(a.ageBand, `${at} age band`).toBe(f[9]!);
      expect(a.ageYears, `${at} age`).toBe(Number(f[10]));
      expect(a.sex, `${at} sex`).toBe(f[11]!);
      expect(a.mobilityLimited ? 1 : 0, `${at} mobility`).toBe(Number(f[12]));
      expect(a.mobilityCategory, `${at} mobility category`).toBe(f[13]!);
      expect(a.asthma ? 1 : 0, `${at} asthma`).toBe(Number(f[14]));
      expect(a.copd ? 1 : 0, `${at} copd`).toBe(Number(f[15]));
      expect(a.chronicPhysical ? 1 : 0, `${at} chronic physical`).toBe(Number(f[16]));
      expect(doubleToBits(a.walkingSpeedMps), `${at} speed`).toBe(f[17]!);
      fieldsCompared += 14;

      if (w.config.enableDecisionLayer === 1) {
        const d = r.decision!;
        expect(d.awareInitial ? 1 : 0, `${at} aware`).toBe(Number(f[18]));
        expect(d.heavyBelongings ? 1 : 0, `${at} heavy`).toBe(Number(f[19]));
        expect(d.hasPet ? 1 : 0, `${at} pet`).toBe(Number(f[20]));
        expect(d.hasDependents ? 1 : 0, `${at} dependents`).toBe(Number(f[21]));
        expect(doubleToBits(d.thetaZ), `${at} theta_z`).toBe(f[22]!);
        expect(doubleToBits(d.groupSpeedDeltaMps), `${at} group delta`).toBe(f[23]!);
        expect(d.decisionSeed.toString(), `${at} decision seed`).toBe(f[24]!);
        fieldsCompared += 7;
      } else {
        expect(r.decision, `${at} decision block`).toBeNull();
        expect(f.slice(18).join(""), `${at} E columns empty`).toBe("");
        fieldsCompared += 2;
      }
      rows++;
    }

    // eslint-disable-next-line no-console
    console.log(
      `[clean-clone] world build: ${rows} stride-sampled residents over ${pairs.size} ` +
        `config-seed pairs, ${fieldsCompared} certified field comparisons, all equal`,
    );
    expect(pairs.size).toBe(39);
    expect(rows).toBe(1248);
  }, 600_000);
});
