/**
 * WP5 acceptance: every shelter-tree distance array bit-equal to the Java dumps
 * for arms A/B/C.
 *
 * The oracle is the F1 export: 118 full `StreetNetwork.computeTree` results
 * (arms A/B/C, shelter-CSV file order), each carrying every reachable node's
 * distance as raw IEEE-754 bits and its predecessor as the certified directed
 * edge id. Three separate things are checked, and only the first is usually
 * thought about:
 *
 *  1. **Distances**, bit for bit. Not `toBeCloseTo` — the summation order along
 *     a path decides the last bits.
 *  2. **The reachable SET.** A node absent from a fixture is unreachable
 *     (`distanceTo` returns `+Infinity` for a key `distM` does not hold), so an
 *     extra reachable node is a failure even if every shared distance matches.
 *  3. **Predecessor edges.** Relaxation is strict `<`, so at an exact tie the
 *     first-relaxed predecessor wins and the winner depends on heap pop order.
 *     A port that matches distances but not predecessors has NOT reproduced the
 *     routing layer — it has reproduced the metric and guessed the geometry.
 *
 * Each fixture file's SHA-256 is checked against the committed manifest before
 * it is believed, so a half-written or stale dump fails loudly instead of
 * quietly weakening the comparison.
 *
 * Artifact-gated without `pipeline/out/` — the packed graph asset and the 108 MB
 * tree dumps are both git-ignored. The shared skip-vs-fail policy prints what
 * was forgone and turns the absence into a hard failure under
 * `WEBSIM_REQUIRE_ARTIFACTS` (plan §5.3).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

import { artifactGate, describeGated } from "../../../tools/artifact-gate.js";
import { javaParseDouble, readCsvText, decodeCsvBytes } from "../../src/loader/csv.js";
import { computeTree, makeScratch } from "../../src/graph/dijkstra.js";
import { nodesToSource, pathToSource } from "../../src/graph/paths.js";
import { DegreeSpaceNodeIndex } from "../../src/graph/strtreeSnap.js";
import {
  COMMITTED_FIXTURE_DIR,
  GEOGRAPHY_DIR,
  GEOGRAPHY_SHELTERS_REF,
  GRAPH_ASSET_REFS,
  TREE_FIXTURE_REF,
  WORLD_FIXTURE_DIR,
  bitsToDouble,
  dataLines,
  doubleToBits,
  loadGraph,
  worldManifest,
} from "./helpers.js";

const TREE_ARTIFACTS = [...GRAPH_ASSET_REFS, TREE_FIXTURE_REF, GEOGRAPHY_SHELTERS_REF];

const ARMS = [
  { arm: "A", csv: "data/shelters/shelters_2026_current_placement.csv" },
  { arm: "B", csv: "data/shelters/shelters_2026_expanded_capacity.csv" },
  { arm: "C", csv: "data/shelters/shelters_2026_expanded_plus_new_sites.csv" },
] as const;

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

interface ArmResult {
  arm: string;
  shelters: number;
  nodesCompared: number;
  distMatched: number;
  predMatched: number;
  reachableMatched: number;
  sourceMatched: number;
}

describeGated(
  artifactGate({
    gate: "engine:graph-trees-parity",
    suite: "shelter trees vs the certified Java dumps",
    evidence:
      "118 shelter trees over arms A/B/C — 3,539,712 distances and 3,539,712 predecessor edges " +
      "bit-equal to the certified Java dumps, plus the reachable-set and snapped-source identity",
    artifacts: TREE_ARTIFACTS,
  }),
  () => {
  it("reproduces every distance, predecessor and reachable set for arms A/B/C", () => {
    const { graph } = loadGraph();
    const index = new DegreeSpaceNodeIndex(graph);
    const scratch = makeScratch(graph);
    const manifest = worldManifest();
    const dumps = new Map(manifest.dumps.map((d) => [d.name, d]));

    const results: ArmResult[] = [];
    let treesCompared = 0;

    for (const { arm, csv } of ARMS) {
      const rows = readCsvText(decodeCsvBytes(readFileSync(`${GEOGRAPHY_DIR}/${csv}`)));
      const result: ArmResult = {
        arm,
        shelters: rows.length,
        nodesCompared: 0,
        distMatched: 0,
        predMatched: 0,
        reachableMatched: 0,
        sourceMatched: 0,
      };

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const lon = javaParseDouble(row.get("lon") ?? "");
        const lat = javaParseDouble(row.get("lat") ?? "");

        const path = `${WORLD_FIXTURE_DIR}/trees/${arm}/tree-${String(i).padStart(3, "0")}.tsv`;
        const bytes = readFileSync(path);
        const declared = dumps.get(`trees.${arm}.${i}`);
        expect(declared, `manifest entry trees.${arm}.${i}`).toBeDefined();
        expect(sha256(bytes), `${path} digest`).toBe(declared!.sha256);

        const text = bytes.toString("utf8");
        const header = text.slice(0, text.indexOf("\n# node_id"));
        const sourceId = Number(/source_node=(-?\d+)/u.exec(header)![1]);
        const reachableDeclared = Number(/reachable_nodes=(\d+)/u.exec(header)![1]);

        // --- snap, then route, both through the production path ---
        const snapped = index.nearest(lon, lat);
        const snappedId = graph.nodeId[snapped.node]!;
        expect(snappedId, `${arm}[${i}] ${row.get("shelter_id") ?? ""} source node`).toBe(sourceId);
        result.sourceMatched++;

        const tree = computeTree(graph, snapped.node, scratch);

        // --- distances + predecessors, node by node ---
        const seen = new Uint8Array(graph.nodeCount);
        let n = 0;
        for (const line of dataLines(text)) {
          const t1 = line.indexOf("\t");
          const t2 = line.indexOf("\t", t1 + 1);
          const nodeId = Number(line.slice(0, t1));
          const distHex = line.slice(t1 + 1, t2);
          const predId = Number(line.slice(t2 + 1));

          const idx = graph.nodeIndexById.get(nodeId);
          expect(idx, `${arm}[${i}] node ${nodeId} is not in the packed graph`).toBeDefined();
          seen[idx!] = 1;

          const gotDist = doubleToBits(tree.dist[idx!]!);
          if (gotDist === distHex) {
            result.distMatched++;
          } else {
            expect(gotDist, `${arm}[${i}] node ${nodeId} distance`).toBe(distHex);
          }
          const gotPred = tree.predEdge[idx!]!;
          if (gotPred === predId) {
            result.predMatched++;
          } else {
            expect(gotPred, `${arm}[${i}] node ${nodeId} predecessor edge`).toBe(predId);
          }
          n++;
        }
        expect(n, `${arm}[${i}] fixture row count`).toBe(reachableDeclared);
        result.nodesCompared += n;

        // --- the reachable SET: nothing finite that the fixture omits ---
        let extra = 0;
        for (let k = 0; k < graph.nodeCount; k++) {
          if (seen[k] === 0 && Number.isFinite(tree.dist[k]!)) {
            extra++;
          }
        }
        expect(extra, `${arm}[${i}] reachable nodes absent from the Java tree`).toBe(0);
        expect(tree.reachableCount, `${arm}[${i}] reachable count`).toBe(reachableDeclared);
        result.reachableMatched++;
        treesCompared++;
      }
      results.push(result);
    }

    const totalNodes = results.reduce((a, r) => a + r.nodesCompared, 0);
    const totalDist = results.reduce((a, r) => a + r.distMatched, 0);
    const totalPred = results.reduce((a, r) => a + r.predMatched, 0);
    // eslint-disable-next-line no-console
    console.log(
      `[WP5] shelter trees: ${treesCompared}/${treesCompared} trees ` +
        `(${results.map((r) => `${r.arm}=${r.shelters}`).join(" ")}), ` +
        `${totalDist}/${totalNodes} distances bit-equal, ` +
        `${totalPred}/${totalNodes} predecessor edges equal, ` +
        `${results.reduce((a, r) => a + r.sourceMatched, 0)}/${treesCompared} snapped sources equal`,
    );
    expect(treesCompared).toBe(118);
    expect(totalDist).toBe(totalNodes);
    expect(totalPred).toBe(totalNodes);
    expect(totalNodes).toBeGreaterThan(3_000_000);
  }, 600_000);

  it("reproduces the committed stride-sampled oracle rows", () => {
    // The same comparison against the tier that IS committed, so a checkout
    // without pipeline/out still has a meaningful oracle the moment the asset
    // is rebuilt.
    const { graph } = loadGraph();
    const index = new DegreeSpaceNodeIndex(graph);
    const scratch = makeScratch(graph);
    const sample = readFileSync(`${COMMITTED_FIXTURE_DIR}/trees-sample.tsv`, "utf8");

    const byArm = new Map<string, Map<string, string[]>>();
    for (const line of dataLines(sample)) {
      const f = line.split("\t");
      const arm = f[0]!;
      const shelterIdx = f[1]!;
      let m = byArm.get(arm);
      if (m === undefined) {
        m = new Map();
        byArm.set(arm, m);
      }
      const key = shelterIdx;
      const rows = m.get(key) ?? [];
      rows.push(`${f[2]!}\t${f[3]!}\t${f[4]!}`);
      m.set(key, rows);
    }

    let checked = 0;
    for (const { arm, csv } of ARMS) {
      const shelters = readCsvText(decodeCsvBytes(readFileSync(`${GEOGRAPHY_DIR}/${csv}`)));
      const perShelter = byArm.get(arm);
      expect(perShelter, `sample has arm ${arm}`).toBeDefined();
      for (const [idxText, rows] of perShelter!) {
        const i = Number(idxText);
        const row = shelters[i]!;
        const source = index.nearest(
          javaParseDouble(row.get("lon") ?? ""),
          javaParseDouble(row.get("lat") ?? ""),
        ).node;
        const tree = computeTree(graph, source, scratch);
        for (const r of rows) {
          const f = r.split("\t");
          const idx = graph.nodeIndexById.get(Number(f[0]))!;
          expect(doubleToBits(tree.dist[idx]!), `${arm}[${i}] node ${f[0]!}`).toBe(f[1]);
          expect(tree.predEdge[idx], `${arm}[${i}] node ${f[0]!} pred`).toBe(Number(f[2]));
          checked++;
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[WP5] committed stride sample: ${checked} oracle rows bit-equal`);
    expect(checked).toBeGreaterThan(7000);
  }, 300_000);
  },
);

describeGated(
  artifactGate({
    gate: "engine:graph-path-probes",
    suite: "pathToSource / nodesToSource vs the certified probes",
    evidence:
      "768 nodesToSource chains and 768 pathToSource coordinate paths (182,250 vertices) " +
      "bit-equal to the certified probe dumps, including every coordOffset array",
    artifacts: TREE_ARTIFACTS,
  }),
  () => {
  it("reproduces every probed coordinate path and coordOffset array", () => {
    const { graph, geometry } = loadGraph();
    const index = new DegreeSpaceNodeIndex(graph);
    const scratch = makeScratch(graph);

    let nodeProbes = 0;
    let coordProbes = 0;
    let verticesCompared = 0;
    let probeFilesRead = 0;
    let probeFilesAbsent = 0;

    for (const { arm, csv } of ARMS) {
      const shelters = readCsvText(decodeCsvBytes(readFileSync(`${GEOGRAPHY_DIR}/${csv}`)));
      for (const shelterIdx of [0, shelters.length - 1]) {
        const path = `${WORLD_FIXTURE_DIR}/trees/${arm}/paths-${String(shelterIdx).padStart(3, "0")}.tsv`;
        let text: string;
        try {
          text = readFileSync(path, "utf8");
        } catch (err) {
          // ONLY "the dumper did not probe this shelter" may be swallowed. A bare
          // `catch { continue }` here used to absorb *every* read error, which on this
          // Windows/OneDrive checkout meant a transient lock silently dropped one of the six
          // probe files — 128 chains and 24,711 vertices of certified evidence — and the
          // suite still reported success on the remainder. Evidence that disappears without
          // saying so is worse than a red run, so anything but ENOENT is rethrown.
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
            throw new Error(`probe dump ${arm}/${shelterIdx} unreadable: ${String(err)}`, {
              cause: err,
            });
          }
          probeFilesAbsent++;
          continue;
        }
        probeFilesRead++;
        const row = shelters[shelterIdx]!;
        const source = index.nearest(
          javaParseDouble(row.get("lon") ?? ""),
          javaParseDouble(row.get("lat") ?? ""),
        ).node;
        const tree = computeTree(graph, source, scratch);

        for (const line of dataLines(text)) {
          const f = line.split("\t");
          const fromIdx = graph.nodeIndexById.get(Number(f[1]))!;
          if (f[0] === "NODES") {
            const np = nodesToSource(graph, geometry, tree, fromIdx);
            if (f[2] === "null") {
              expect(np, `${arm}[${shelterIdx}] ${f[1]!}`).toBeNull();
              continue;
            }
            expect(np, `${arm}[${shelterIdx}] ${f[1]!}`).not.toBeNull();
            expect(np!.nodes.length, `${arm}[${shelterIdx}] ${f[1]!} chain length`).toBe(Number(f[2]));
            for (let k = 0; k < np!.nodes.length; k++) {
              const cell = f[3 + k]!;
              const colon = cell.indexOf(":");
              expect(graph.nodeId[np!.nodes[k]!], `${arm} ${f[1]!} node ${k}`).toBe(
                Number(cell.slice(0, colon)),
              );
              expect(np!.coordOffset[k], `${arm} ${f[1]!} coordOffset ${k}`).toBe(
                Number(cell.slice(colon + 1)),
              );
            }
            nodeProbes++;
          } else {
            const cp = pathToSource(graph, geometry, tree, fromIdx);
            if (f[2] === "null") {
              expect(cp, `${arm}[${shelterIdx}] ${f[1]!}`).toBeNull();
              continue;
            }
            expect(cp, `${arm}[${shelterIdx}] ${f[1]!}`).not.toBeNull();
            expect(cp!.vertexCount, `${arm}[${shelterIdx}] ${f[1]!} vertex count`).toBe(Number(f[2]));
            for (let k = 0; k < cp!.vertexCount; k++) {
              const cell = f[3 + k]!;
              const comma = cell.indexOf(",");
              expect(cp!.xy[k * 2], `${arm} ${f[1]!} vertex ${k} lon`).toBe(
                bitsToDouble(cell.slice(0, comma)),
              );
              expect(cp!.xy[k * 2 + 1], `${arm} ${f[1]!} vertex ${k} lat`).toBe(
                bitsToDouble(cell.slice(comma + 1)),
              );
              verticesCompared++;
            }
            coordProbes++;
          }
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `[WP5] path probes: ${nodeProbes} nodesToSource chains + ${coordProbes} pathToSource paths ` +
        `(${verticesCompared} vertices) bit-equal over ${probeFilesRead} probe dump(s)` +
        (probeFilesAbsent > 0 ? `, ${probeFilesAbsent} absent` : ""),
    );
    // The dumper probes the first and last shelter of each of the three arms, so all six
    // files exist in a populated `pipeline/out`. Asserting the file count as well as the
    // probe count is what stops a dropped dump from being reported as a smaller success:
    // the old floor of 700 would still have passed with five of six files on a slightly
    // larger arm.
    expect(probeFilesRead, "a certified probe dump went missing").toBe(2 * ARMS.length);
    expect(probeFilesAbsent).toBe(0);
    expect(nodeProbes).toBeGreaterThan(700);
    expect(coordProbes).toBe(nodeProbes);
  }, 300_000);
  },
);
