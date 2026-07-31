/**
 * build-committed-slice.ts — cut a small, committable, self-contained oracle out
 * of the git-ignored certified artifacts, so a **clean checkout runs real
 * bit-identity assertions** instead of skipping every parity suite.
 *
 *   npx tsx pipeline/scripts/build-committed-slice.ts [--nodes 20000] [--check]
 *
 * ## The problem this exists to solve
 *
 * `pipeline/out/` is git-ignored (45 MB of world dumps, 108 MB of tree dumps, a
 * 20 MB asset tree). Every parity suite is therefore `skipIf(!assetsPresent())`,
 * and a fresh clone executed **zero** bit-identity comparisons against the Java
 * oracle. The committed stride samples (`engine/test/fixtures/world/*.tsv`) did
 * not help: comparing them still needs the packed graph to route on, and the
 * packed graph is the thing that is absent.
 *
 * ## Why a distance ball is a *sound* slice, not a convenient one
 *
 * Take the certified tree for one shelter, sort its nodes by the distance Java
 * recorded, and keep every node whose distance is `<= R` for some cut R (ties at
 * R included). Call that set B, and induce the subgraph on it — every edge with
 * both endpoints in B, in the original edge order, with each node's adjacency
 * slice filtered but never reordered.
 *
 * Running Dijkstra from the same source over that subgraph reproduces the
 * **full-graph** answer for every node of B, exactly:
 *
 *  - *Distances.* Prefix distances along a shortest path are non-decreasing, so
 *    a shortest path to `v` with `d(v) <= R` only ever passes through nodes with
 *    distance `<= d(v) <= R` — all of them in B, all of those edges induced. So
 *    the path survives the cut, and no cut can create a shorter one.
 *  - *Predecessors.* `predEdge[v]` is set by the last strict improvement of
 *    `dist[v]`, and relaxations only happen when a node is settled, in
 *    non-decreasing distance order. Every node that can relax `v` therefore has
 *    distance `<= d(v) <= R` and is in B, with its adjacency order preserved.
 *
 * What that argument does *not* prove is the exact-tie case: at an exact double
 * tie the winner depends on `PriorityQueue` pop order, and the heap of the slice
 * has never held the out-of-ball entries the full-graph heap held. That is why
 * the generator does not assume the slice is faithful — it **verifies** it,
 * re-running the port over the slice and refusing to write a fixture whose
 * distances and predecessor edges are not all bit-equal to the Java dump.
 *
 * ## What is emitted
 *
 * `engine/test/fixtures/graph-slice/`
 *   `slice-topology.bin`  a real `websim/graph-asset` topology container the
 *                         production `unpackTopology` reads unchanged. Edge
 *                         lengths are the certified Java doubles, byte for byte:
 *                         they are copied out of the packed asset, never
 *                         recomputed. One extra section, `slice_edge_source`,
 *                         maps slice edge index -> certified feature index so a
 *                         slice predecessor can be translated back into the
 *                         certified directed edge id the Java dump names.
 *   `slice-tree.tsv`      the Java rows for exactly the ball, verbatim.
 *   `provenance.json`     SHA-256 of every input and every output, the census
 *                         deltas, and the parameters this run used.
 *
 * `--check` rebuilds and compares against what is committed instead of writing,
 * which is what makes the fixture reproducible rather than merely present.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildContainer,
  f64Section,
  i32Section,
  unpackTopology,
  utf8Section,
  type GraphCensus,
} from "@websim/shared/graph-asset";

import { buildRoutingGraph } from "../../engine/src/graph/csr.js";
import { computeTree, makeScratch } from "../../engine/src/graph/dijkstra.js";

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

const ASSET_DIR = here("../out/assets");
const WORLD_FIXTURE_DIR = here("../out/world-fixtures");
const OUT_DIR = here("../../engine/test/fixtures/graph-slice");
const WORLD_MANIFEST = here("../../engine/test/fixtures/world/manifest.json");

/** Arm A, shelter row 0 — the first tree the F1 exporter dumped. */
const SOURCE_TREE = "trees/A/tree-000.tsv";
const SOURCE_TREE_MANIFEST_NAME = "trees.A.0";
const SOURCE_SHELTER_CSV = "data/shelters/shelters_2026_current_placement.csv";

const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

const bitsBuf = new ArrayBuffer(8);
const bitsU64 = new BigUint64Array(bitsBuf);
const bitsF64 = new Float64Array(bitsBuf);
function bitsToDouble(hex: string): number {
  bitsU64[0] = BigInt(`0x${hex}`);
  return bitsF64[0]!;
}
function doubleToBits(v: number): string {
  bitsF64[0] = v;
  return bitsU64[0]!.toString(16).padStart(16, "0");
}

function* dataLines(text: string): Generator<string> {
  for (const line of text.split("\n")) {
    const l = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (l.length > 0 && !l.startsWith("#")) {
      yield l;
    }
  }
}

function fail(msg: string): never {
  process.stderr.write(`build-committed-slice: ${msg}\n`);
  process.exit(1);
}

interface OracleRow {
  readonly nodeId: number;
  readonly distHex: string;
  readonly predDirected: number;
}

function main(): void {
  const argv = process.argv.slice(2);
  const check = argv.includes("--check");
  const nIdx = argv.indexOf("--nodes");
  const targetNodes = nIdx >= 0 ? Number(argv[nIdx + 1]) : 20_000;
  if (!Number.isInteger(targetNodes) || targetNodes < 100) {
    fail(`--nodes ${String(argv[nIdx + 1])} is not a sane node budget`);
  }

  const topoPath = `${ASSET_DIR}/graph-topology.bin`;
  const treePath = `${WORLD_FIXTURE_DIR}/${SOURCE_TREE}`;
  for (const p of [topoPath, treePath, WORLD_MANIFEST]) {
    if (!existsSync(p)) {
      fail(`${p} is absent — run the exporter and the packers first`);
    }
  }

  // --- inputs, digested before they are believed --------------------------
  const topoBytes = new Uint8Array(readFileSync(topoPath));
  const treeBytes = new Uint8Array(readFileSync(treePath));
  const topoSha = sha256(topoBytes);
  const treeSha = sha256(treeBytes);

  const worldManifest = JSON.parse(readFileSync(WORLD_MANIFEST, "utf8")) as {
    dumps: { name: string; sha256: string }[];
  };
  const declared = worldManifest.dumps.find((d) => d.name === SOURCE_TREE_MANIFEST_NAME);
  if (declared === undefined) {
    fail(`the committed world manifest has no dump named ${SOURCE_TREE_MANIFEST_NAME}`);
  }
  if (declared.sha256 !== treeSha) {
    fail(
      `${SOURCE_TREE} digest ${treeSha} != committed manifest ${declared.sha256} — ` +
        `the dump is stale or partial, and a slice cut from it would be worthless`,
    );
  }

  const topology = unpackTopology(topoBytes);
  const graph = buildRoutingGraph(topology);

  // --- the certified tree -------------------------------------------------
  const treeText = Buffer.from(treeBytes).toString("utf8");
  const header = treeText.slice(0, treeText.indexOf("\n# node_id"));
  const sourceNodeId = Number(/source_node=(-?\d+)/u.exec(header)![1]);
  const reachableDeclared = Number(/reachable_nodes=(\d+)/u.exec(header)![1]);
  const sourceIndex = graph.nodeIndexById.get(sourceNodeId);
  if (sourceIndex === undefined) {
    fail(`source node ${sourceNodeId} is not in the packed graph`);
  }

  const rows: OracleRow[] = [];
  for (const line of dataLines(treeText)) {
    const f = line.split("\t");
    rows.push({ nodeId: Number(f[0]), distHex: f[1]!, predDirected: Number(f[2]) });
  }
  if (rows.length !== reachableDeclared) {
    fail(`${SOURCE_TREE} has ${rows.length} rows but declares ${reachableDeclared} reachable`);
  }

  // --- the ball: nearest `targetNodes`, then every tie at the cut radius ---
  const byDist = [...rows].sort((a, b) => bitsToDouble(a.distHex) - bitsToDouble(b.distHex));
  const cutIdx = Math.min(targetNodes, byDist.length) - 1;
  const radiusM = bitsToDouble(byDist[cutIdx]!.distHex);
  const ball = byDist.filter((r) => bitsToDouble(r.distHex) <= radiusM);

  const keepIndex = new Int32Array(graph.nodeCount).fill(-1);
  const sliceNodes: number[] = [];
  for (const r of ball) {
    const i = graph.nodeIndexById.get(r.nodeId);
    if (i === undefined) {
      fail(`tree node ${r.nodeId} is not in the packed graph`);
    }
    sliceNodes.push(i);
  }
  // Node ids must stay strictly ascending; the packed table already is, so
  // sorting by ORIGINAL INDEX gives ascending ids for free.
  sliceNodes.sort((a, b) => a - b);
  for (let i = 0; i < sliceNodes.length; i++) {
    keepIndex[sliceNodes[i]!] = i;
  }
  const nodeCount = sliceNodes.length;
  if (keepIndex[sourceIndex]! < 0) {
    fail("the source node fell outside its own ball");
  }

  // --- induced edges, in original feature order ---------------------------
  const sliceEdgeOf = new Int32Array(graph.edgeCount).fill(-1);
  const edgeSource: number[] = [];
  for (let e = 0; e < graph.edgeCount; e++) {
    if (keepIndex[graph.edgeFrom[e]!]! >= 0 && keepIndex[graph.edgeTo[e]!]! >= 0) {
      sliceEdgeOf[e] = edgeSource.length;
      edgeSource.push(e);
    }
  }
  const edgeCount = edgeSource.length;

  const nodeId = new Int32Array(nodeCount);
  const nodeLon = new Float64Array(nodeCount);
  const nodeLat = new Float64Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    const o = sliceNodes[i]!;
    nodeId[i] = graph.nodeId[o]!;
    nodeLon[i] = graph.nodeLon[o]!;
    nodeLat[i] = graph.nodeLat[o]!;
  }
  const edgeFrom = new Int32Array(edgeCount);
  const edgeTo = new Int32Array(edgeCount);
  const edgeLengthM = new Float64Array(edgeCount);
  for (let s = 0; s < edgeCount; s++) {
    const o = edgeSource[s]!;
    edgeFrom[s] = keepIndex[graph.edgeFrom[o]!]!;
    edgeTo[s] = keepIndex[graph.edgeTo[o]!]!;
    // The certified geodesic weight, copied bit for bit — never recomputed.
    edgeLengthM[s] = graph.edgeLengthM[o]!;
  }

  // --- CSR: each kept node's certified adjacency slice, filtered in place --
  const csrOffset = new Int32Array(nodeCount + 1);
  const entries: number[] = [];
  for (let i = 0; i < nodeCount; i++) {
    csrOffset[i] = entries.length;
    const o = sliceNodes[i]!;
    for (let k = graph.csrOffset[o]!; k < graph.csrOffset[o + 1]!; k++) {
      const directed = graph.csrDirected[k]!;
      const e = directed >>> 1;
      const s = sliceEdgeOf[e]!;
      if (s < 0) {
        continue; // leaves the ball
      }
      entries.push((directed & 1) === 0 ? s + 1 : -(s + 1));
    }
  }
  csrOffset[nodeCount] = entries.length;
  const csrEntry = Int32Array.from(entries);

  let maxDegree = 0;
  for (let i = 0; i < nodeCount; i++) {
    maxDegree = Math.max(maxDegree, csrOffset[i + 1]! - csrOffset[i]!);
  }
  let negatives = 0;
  for (let i = 0; i < nodeCount; i++) {
    if (nodeId[i]! < 0) {
      negatives++;
    }
  }

  const census: GraphCensus = {
    // Derived for the slice, NOT the certified whole-graph census. The fields
    // `unpackTopology` cross-checks are the slice's own true counts; the
    // provenance of what it was cut from is spelled out alongside.
    slice_of: "pipeline/out/assets/graph-topology.bin",
    slice_source_sha256: topoSha,
    slice_source_node_id: sourceNodeId,
    slice_radius_m_hex: doubleToBits(radiusM),
    features: edgeCount,
    attr_node_ids: nodeCount,
    final_graph_nodes: nodeCount,
    affected_attr_node_ids: 0,
    sites_reattached: 0,
    sites_split_synthetic: 0,
    impossible_edges_after_fix: 0,
    components: 1,
    largest_component_nodes: nodeCount,
    undirected_street_edges: edgeCount,
    directed_edge_records: csrEntry.length,
    node_ids_negative: negatives,
    max_degree: maxDegree,
    polyline_vertices_total: 0,
  };

  const container = buildContainer(
    "topology",
    { nodes: nodeCount, edges: edgeCount },
    [
      i32Section("node_id", nodeId, "varint-delta-zigzag"),
      f64Section("node_lon", nodeLon),
      f64Section("node_lat", nodeLat),
      i32Section("edge_from", edgeFrom),
      i32Section("edge_to", edgeTo),
      f64Section("edge_length_m", edgeLengthM),
      i32Section("csr_offset", csrOffset),
      i32Section("csr_entry", csrEntry),
      // Slice-only: certified feature index behind each slice edge, so a slice
      // predecessor translates back into the certified directed edge id.
      i32Section("slice_edge_source", Int32Array.from(edgeSource)),
      utf8Section("census_json", JSON.stringify(census)),
      utf8Section("corrections_json", "[]"),
    ],
    sha256,
  );

  // --- verify the slice against the certified dump BEFORE writing it ------
  const sliceTopology = unpackTopology(container);
  const sliceGraph = buildRoutingGraph(sliceTopology);
  const sliceSource = sliceGraph.nodeIndexById.get(sourceNodeId)!;
  const tree = computeTree(sliceGraph, sliceSource, makeScratch(sliceGraph));

  let distMatched = 0;
  let predMatched = 0;
  const distBad: string[] = [];
  const predBad: string[] = [];
  for (const r of ball) {
    const i = sliceGraph.nodeIndexById.get(r.nodeId)!;
    if (doubleToBits(tree.dist[i]!) === r.distHex) {
      distMatched++;
    } else if (distBad.length < 5) {
      distBad.push(`node ${r.nodeId}: ${doubleToBits(tree.dist[i]!)} != ${r.distHex}`);
    }
    const got = tree.predEdge[i]!;
    const certified = got < 0 ? -1 : edgeSource[got >>> 1]! * 2 + (got & 1);
    if (certified === r.predDirected) {
      predMatched++;
    } else if (predBad.length < 5) {
      predBad.push(`node ${r.nodeId}: pred ${certified} != ${r.predDirected}`);
    }
  }
  if (distMatched !== ball.length || predMatched !== ball.length) {
    fail(
      `the slice is NOT faithful (${distMatched}/${ball.length} distances, ` +
        `${predMatched}/${ball.length} predecessors) — do not commit it.\n` +
        [...distBad, ...predBad].map((s) => `  ${s}`).join("\n"),
    );
  }
  if (tree.reachableCount !== nodeCount) {
    fail(`slice reaches ${tree.reachableCount} of ${nodeCount} nodes; the ball is not connected`);
  }

  // --- emitted files ------------------------------------------------------
  const oracleLines = [
    `# certified shelter-tree rows for the committed graph slice`,
    `# source=${SOURCE_TREE}\tshelter_csv=${SOURCE_SHELTER_CSV}\tshelter_index=0`,
    `# source_node=${sourceNodeId}\tball_nodes=${nodeCount}\tball_edges=${edgeCount}`,
    `# radius_m_hex=${doubleToBits(radiusM)}\tfull_tree_reachable=${reachableDeclared}`,
    `# node_id\tdist_m_hex\tpredecessor_directed_edge`,
    ...ball
      .slice()
      .sort((a, b) => a.nodeId - b.nodeId)
      .map((r) => `${r.nodeId}\t${r.distHex}\t${r.predDirected}`),
    "",
  ];
  const oracleBytes = new TextEncoder().encode(oracleLines.join("\n"));

  const provenance = {
    what:
      "A distance-ball slice of the certified street graph plus the certified " +
      "shelter-tree rows for exactly that ball. Committed so a clean checkout " +
      "executes real bit-identity assertions with pipeline/out absent.",
    generator: "websim/pipeline/scripts/build-committed-slice.ts",
    inputs: {
      graph_topology: { path: "websim/pipeline/out/assets/graph-topology.bin", sha256: topoSha },
      shelter_tree: {
        path: `websim/pipeline/out/world-fixtures/${SOURCE_TREE}`,
        sha256: treeSha,
        world_manifest_name: SOURCE_TREE_MANIFEST_NAME,
      },
      shelter_csv: `Geography/${SOURCE_SHELTER_CSV}`,
    },
    parameters: { target_nodes: targetNodes, tie_inclusive_at_radius: true },
    slice: {
      source_node_id: sourceNodeId,
      nodes: nodeCount,
      edges: edgeCount,
      directed_records: csrEntry.length,
      max_degree: maxDegree,
      negative_node_ids: negatives,
      radius_m_hex: doubleToBits(radiusM),
      full_graph_nodes: graph.nodeCount,
      full_graph_edges: graph.edgeCount,
      full_tree_reachable: reachableDeclared,
    },
    verified_at_build: {
      distances_bit_equal: distMatched,
      predecessor_edges_equal: predMatched,
      of_rows: ball.length,
      reachable_count: tree.reachableCount,
    },
    outputs: {
      "slice-topology.bin": { bytes: container.length, sha256: sha256(container) },
      "slice-tree.tsv": { bytes: oracleBytes.length, sha256: sha256(oracleBytes) },
    },
  };
  const provenanceBytes = new TextEncoder().encode(`${JSON.stringify(provenance, null, 2)}\n`);

  const files: [string, Uint8Array][] = [
    ["slice-topology.bin", container],
    ["slice-tree.tsv", oracleBytes],
    ["provenance.json", provenanceBytes],
  ];

  if (check) {
    let drift = 0;
    for (const [name, bytes] of files) {
      const path = `${OUT_DIR}/${name}`;
      if (!existsSync(path)) {
        process.stdout.write(`MISSING  ${name}\n`);
        drift++;
        continue;
      }
      const onDisk = new Uint8Array(readFileSync(path));
      const same = sha256(onDisk) === sha256(bytes);
      process.stdout.write(`${same ? "ok      " : "DRIFT   "} ${name}  ${sha256(bytes)}\n`);
      if (!same) {
        drift++;
      }
    }
    if (drift > 0) {
      fail(`${drift} committed slice file(s) do not reproduce`);
    }
    process.stdout.write("build-committed-slice: the committed slice reproduces exactly.\n");
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  let total = 0;
  for (const [name, bytes] of files) {
    writeFileSync(`${OUT_DIR}/${name}`, bytes);
    total += bytes.length;
    process.stdout.write(`wrote    ${name}  ${bytes.length} bytes  ${sha256(bytes)}\n`);
  }
  process.stdout.write(
    `build-committed-slice: ${nodeCount} nodes, ${edgeCount} edges, ` +
      `${csrEntry.length} directed records, ${ball.length} oracle rows, ` +
      `${(total / 1024 / 1024).toFixed(3)} MB committed; ` +
      `${distMatched}/${ball.length} distances and ${predMatched}/${ball.length} ` +
      `predecessor edges verified bit-equal against ${SOURCE_TREE}.\n`,
  );
}

main();
