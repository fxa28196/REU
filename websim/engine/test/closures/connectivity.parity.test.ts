/**
 * WP8-SPEC-closures §17.3 — **graph parity against the five archived
 * connectivity reports.**
 *
 * `docs/runs/scenario-e-closures/*.json` certify the *schedules*, not a run:
 * for each of the five committed families they record the graph the schedule was
 * drawn against and, per cumulative wave state, the three severance gates
 *
 *  - **S1** no shelter loses every incident edge,
 *  - **S2** no shelter leaves the largest post-closure fragment of its own
 *    pre-closure component,
 *  - **S3** no encampment demand point loses ALL shelter access,
 *
 * plus `components_before/after`, `components_split_by_the_closures` and
 * `nodes_losing_reachability`.
 *
 * Re-deriving them from the port's own packed graph is the one closure check
 * that is **independent of the tick loop**, and therefore independent of §0's
 * silence: it validates the node-id vocabulary the schedules are written in. If
 * the port's graph does not reproduce the `graph` block, the node ids in the
 * schedules do not mean what the schedules think they mean and every closure is
 * silently misplaced (§13.2).
 *
 * ## Provenance of the algorithm, stated plainly
 *
 * The certified model **never** computes connected components of the blocked
 * graph. That analysis lives only in `scripts/build_closures_E.py`, the schedule
 * certifier, and the Java oracle transcribes it from there
 * (`ConnectivityOracle.java`, DR-WP8-closure-oracle §2.3) rather than from any
 * `geography.*` class. This file transcribes the same traversal a third time,
 * into TypeScript, and — like the Java one — is **checked, not trusted**: a
 * wrong transcription could not agree with the archive on 12 fields × 21
 * cumulative wave states.
 *
 * ## The one vocabulary the port cannot check, declared
 *
 * The certifier cuts on RLIS **attribute** node pairs; `ClosureWave.apply()`
 * cuts on **graph** node pairs, and they differ at the 25 corrected node sites.
 * DR-WP8-closure-oracle §4.1 proved the two select the identical feature set for
 * all 268 closed pairs of all five schedules. The packed asset does not carry
 * attribute ids, so this file can only re-derive the **graph**-pair half — that
 * exactly one feature joins each closed pair (archived check 2's "0 ambiguous",
 * read in the graph vocabulary). The attribute-pair half stays a Java-side
 * result and is named here rather than quietly assumed.
 */

import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

import { artifactGate, describeGated, type ArtifactRef } from "../../../tools/artifact-gate.js";
import type { RoutingGraph } from "../../src/graph/csr.js";
import { GRAPH_ASSET_REFS, loadGraph } from "../graph/helpers.js";
import { ARCHIVED_REPORT_DIR, archivedReportRef, geographyRef } from "./helpers.js";
import {
  ENCAMPMENTS_CSV,
  SCHEDULES,
  SHELTERS_C_CSV,
  closureCsvRows,
  loadPoints,
  loadShelters,
  snapIndexFor,
} from "./world.js";
import { fileURLToPath } from "node:url";

const GRAPH_REPORT = fileURLToPath(
  new URL("../../../pipeline/out/graph-assets.report.json", import.meta.url),
);

// --- component analysis (build_closures_E.py:459-476, transcribed) -----------

interface Comps {
  /** Component id per node index. */
  readonly cid: Int32Array;
  /** Node count per component, in discovery order. */
  readonly size: Int32Array;
}

/**
 * Connected components of the graph with `cutFeature` removed.
 *
 * Iterative DFS in node-index order, which is the packed asset's node discovery
 * order. Component *ids* depend on that order; every quantity reported below is
 * invariant under it except `mainFrag`'s tie-break between two exactly
 * equal-sized fragments of one pre-closure component — an open item the Java
 * oracle also records (DR §10), unobserved in all five families.
 */
function componentMap(graph: RoutingGraph, cutFeature: Uint8Array): Comps {
  const n = graph.nodeCount;
  const cid = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const stack = new Int32Array(n);
  const { csrOffset, csrOther, csrDirected } = graph;
  for (let start = 0; start < n; start++) {
    if (cid[start]! >= 0) {
      continue;
    }
    const idx = sizes.length;
    cid[start] = idx;
    let sp = 0;
    stack[sp++] = start;
    let size = 0;
    while (sp > 0) {
      const node = stack[--sp]!;
      size++;
      const lo = csrOffset[node]!;
      const hi = csrOffset[node + 1]!;
      for (let k = lo; k < hi; k++) {
        if (cutFeature[csrDirected[k]! >>> 1] !== 0) {
          continue;
        }
        const other = csrOther[k]!;
        if (cid[other]! >= 0) {
          continue;
        }
        cid[other] = idx;
        stack[sp++] = other;
      }
    }
    sizes.push(size);
  }
  return { cid, size: Int32Array.from(sizes) };
}

/** Canonical `min|max` node-index key → the features joining that pair. */
function featuresByPair(graph: RoutingGraph): Map<string, number[]> {
  const m = new Map<string, number[]>();
  for (let e = 0; e < graph.edgeCount; e++) {
    const a = graph.edgeFrom[e]!;
    const b = graph.edgeTo[e]!;
    const k = a <= b ? `${a}|${b}` : `${b}|${a}`;
    const l = m.get(k);
    if (l === undefined) {
      m.set(k, [e]);
    } else {
      l.push(e);
    }
  }
  return m;
}

interface ArchivedReport {
  readonly graph: Record<string, unknown>;
  readonly connectivity_check: readonly Record<string, unknown>[];
  readonly checks: readonly { name: string; detail: string }[];
}

const CONNECTIVITY_ARTIFACTS: ArtifactRef[] = [
  ...GRAPH_ASSET_REFS,
  { source: "graph-asset", label: "graph-assets.report.json", path: GRAPH_REPORT },
  geographyRef(SHELTERS_C_CSV),
  geographyRef(ENCAMPMENTS_CSV),
  ...SCHEDULES.map((s) => geographyRef(s.csv)),
  ...SCHEDULES.map((s) => archivedReportRef(s.report)),
];

describeGated(
  artifactGate({
    gate: "engine:closures-connectivity-parity",
    suite: "the five archived connectivity reports, re-derived from the port's graph",
    evidence:
      "the 8-field graph census and all 14 connectivity_check fields at every one of the 21 " +
      "cumulative wave states of the five committed schedules, plus the per-wave S1/S2/S3 check " +
      "details and the duplicate-edge check — re-derived from the packed graph, the certified " +
      "snap of arm C's 46 shelters and all 3,400 encampment points",
    artifacts: CONNECTIVITY_ARTIFACTS,
  }),
  () => {
    it("reproduces all five archived reports field for field", () => {
      const { graph } = loadGraph();
      const snap = snapIndexFor(graph);
      const byPair = featuresByPair(graph);
      const report = JSON.parse(readFileSync(GRAPH_REPORT, "utf8")) as {
        census: {
          features: number;
          affected_attr_node_ids: number;
          freeway_filter: { features_excluded: number; km_excluded: number };
        };
      };

      const pre = componentMap(graph, new Uint8Array(graph.edgeCount));
      const preSizesDesc = Array.from(pre.size).sort((a, b) => b - a);

      // Certified snapping, once for all five reports.
      const shelters = loadShelters(graph, SHELTERS_C_CSV);
      const shelterNodes = shelters.map((s) => s.graphNode);
      const shelterIds = shelters.map((s) => s.id);
      const campNodes = loadPoints(ENCAMPMENTS_CSV).map((p) => snap.nearest(p.lon, p.lat).node);
      expect(shelterNodes.length, "arm C shelters").toBe(46);
      expect(campNodes.length, "encampment points").toBe(3400);

      let compared = 0;
      let mismatched = 0;
      const fail: string[] = [];
      const cmp = (what: string, mine: unknown, theirs: unknown): void => {
        compared++;
        if (JSON.stringify(mine) !== JSON.stringify(theirs)) {
          mismatched++;
          fail.push(`${what}: mine=${JSON.stringify(mine)} archived=${JSON.stringify(theirs)}`);
        }
      };

      let waveStates = 0;
      for (const spec of SCHEDULES) {
        const archived = JSON.parse(
          readFileSync(`${ARCHIVED_REPORT_DIR}/${spec.report}`, "utf8"),
        ) as ArchivedReport;
        const rows = closureCsvRows(spec.csv);

        // --- the graph census block --------------------------------------
        const ag = archived.graph;
        cmp(`${spec.name}.graph.walkable_features`, graph.edgeCount, ag["walkable_features"]);
        cmp(`${spec.name}.graph.nodes`, graph.nodeCount, ag["nodes"]);
        cmp(`${spec.name}.graph.undirected_edges`, graph.edgeCount, ag["undirected_edges"]);
        cmp(
          `${spec.name}.graph.corrected_node_sites`,
          report.census.affected_attr_node_ids,
          ag["corrected_node_sites"],
        );
        cmp(`${spec.name}.graph.components`, pre.size.length, ag["components"]);
        cmp(
          `${spec.name}.graph.freeway_features_excluded`,
          report.census.freeway_filter.features_excluded,
          ag["freeway_features_excluded"],
        );
        cmp(
          `${spec.name}.graph.freeway_km_excluded`,
          Number(report.census.freeway_filter.km_excluded.toFixed(1)),
          ag["freeway_km_excluded"],
        );
        cmp(
          `${spec.name}.graph.component_sizes_top5`,
          preSizesDesc.slice(0, 5),
          ag["component_sizes_top5"],
        );
        cmp(`${spec.name}.graph.features`, graph.edgeCount, report.census.features);

        // --- the graph-pair vocabulary half of archived check 2 -----------
        let ambiguous = 0;
        for (const r of rows) {
          const a = graph.nodeIndexById.get(r.nodeA);
          const b = graph.nodeIndexById.get(r.nodeB);
          const k = a === undefined || b === undefined ? "" : a <= b ? `${a}|${b}` : `${b}|${a}`;
          if ((byPair.get(k) ?? []).length !== 1) {
            ambiguous++;
          }
        }
        expect(ambiguous, `${spec.name}: closed pairs joined by != 1 feature`).toBe(0);

        // --- connectivity_check[], per CUMULATIVE wave state --------------
        const hours = [...new Set(rows.map((r) => r.hour))].sort((a, b) => a - b);
        const preShelterByComp = new Map<number, number>();
        for (const node of shelterNodes) {
          const c = pre.cid[node]!;
          preShelterByComp.set(c, (preShelterByComp.get(c) ?? 0) + 1);
        }

        const checksByName = new Map(archived.checks.map((c) => [c.name, c.detail]));

        for (let w = 0; w < hours.length; w++) {
          const hour = hours[w]!;
          const blockedKeys = new Set<string>();
          for (const r of rows) {
            if (r.hour <= hour) {
              const a = graph.nodeIndexById.get(r.nodeA)!;
              const b = graph.nodeIndexById.get(r.nodeB)!;
              blockedKeys.add(a <= b ? `${a}|${b}` : `${b}|${a}`);
            }
          }
          const cut = new Uint8Array(graph.edgeCount);
          for (const k of blockedKeys) {
            for (const e of byPair.get(k) ?? []) {
              cut[e] = 1;
            }
          }
          const post = componentMap(graph, cut);

          // main fragment of each pre-closure component (py:628-634)
          const frag = new Map<number, Map<number, number>>();
          for (let s = 0; s < graph.nodeCount; s++) {
            const p = pre.cid[s]!;
            let inner = frag.get(p);
            if (inner === undefined) {
              inner = new Map<number, number>();
              frag.set(p, inner);
            }
            inner.set(post.cid[s]!, (inner.get(post.cid[s]!) ?? 0) + 1);
          }
          const mainFrag = new Map<number, number>();
          let lostNodes = 0;
          let splitComps = 0;
          for (const [p, inner] of [...frag.entries()].sort((x, y) => x[0] - y[0])) {
            let best = -1;
            let bestCount = -1;
            for (const [q, cnt] of [...inner.entries()].sort((x, y) => x[0] - y[0])) {
              if (cnt > bestCount) {
                bestCount = cnt;
                best = q;
              }
            }
            mainFrag.set(p, best);
            lostNodes += pre.size[p]! - bestCount;
            if (inner.size > 1) {
              splitComps++;
            }
          }

          const stranded: string[] = [];
          const severed: string[] = [];
          for (let i = 0; i < shelterNodes.length; i++) {
            const s = shelterNodes[i]!;
            let anyOpen = false;
            for (let k = graph.csrOffset[s]!; k < graph.csrOffset[s + 1]!; k++) {
              if (cut[graph.csrDirected[k]! >>> 1] === 0) {
                anyOpen = true;
                break;
              }
            }
            if (!anyOpen) {
              stranded.push(shelterIds[i]!);
            }
            if (post.cid[s]! !== mainFrag.get(pre.cid[s]!)!) {
              severed.push(shelterIds[i]!);
            }
          }
          stranded.sort();
          severed.sort();

          const postShelterByComp = new Map<number, number>();
          for (const node of shelterNodes) {
            const c = post.cid[node]!;
            postShelterByComp.set(c, (postShelterByComp.get(c) ?? 0) + 1);
          }
          let campsLostAll = 0;
          let campsLostSome = 0;
          let pairsLost = 0;
          for (const node of campNodes) {
            const before = preShelterByComp.get(pre.cid[node]!) ?? 0;
            const after = postShelterByComp.get(post.cid[node]!) ?? 0;
            pairsLost += before - after;
            if (after < before) {
              campsLostSome++;
            }
            if (before > 0 && after === 0) {
              campsLostAll++;
            }
          }

          const mine: Record<string, unknown> = {
            wave: w + 1,
            hour,
            edges_blocked: blockedKeys.size,
            shelters_with_no_unblocked_incident_edge: stranded,
            shelters_severed_from_their_component: severed,
            components_before: pre.size.length,
            components_after: post.size.length,
            components_split_by_the_closures: splitComps,
            nodes_losing_reachability: lostNodes,
            graph_nodes_total: graph.nodeCount,
            encampment_points_total: campNodes.length,
            encampment_points_losing_some_shelter_access: campsLostSome,
            encampment_points_losing_all_shelter_access: campsLostAll,
            encampment_shelter_pairs_lost: pairsLost,
          };
          const theirs = archived.connectivity_check[w];
          expect(theirs, `${spec.name} archived wave ${w + 1}`).toBeDefined();
          for (const field of Object.keys(mine)) {
            cmp(`${spec.name}.connectivity_check[${w + 1}].${field}`, mine[field], theirs![field]);
          }

          // --- the per-wave S1/S2/S3 `checks[]` details -------------------
          const want: [string, string][] = [
            [
              `S1 wave ${w + 1} (hour ${hour}): every shelter keeps an unblocked incident edge`,
              `${stranded.length} of ${shelterNodes.length} stranded`,
            ],
            [
              `S2 wave ${w + 1} (hour ${hour}): every shelter stays in the largest post-closure ` +
                "fragment of its own pre-closure component",
              `${severed.length} of ${shelterNodes.length} severed`,
            ],
            [
              `S3 wave ${w + 1} (hour ${hour}): no encampment demand point loses ALL shelter access`,
              `${campsLostAll} of ${campNodes.length} walled off`,
            ],
          ];
          for (const [name, detail] of want) {
            cmp(`${spec.name}.checks[${name.slice(0, 2)} wave ${w + 1}]`, detail, checksByName.get(name));
          }
          waveStates++;
        }

        // --- archived check 5, "no duplicate closed edge" -----------------
        const distinct = new Set(
          rows.map((r) => (r.nodeA <= r.nodeB ? `${r.nodeA}:${r.nodeB}` : `${r.nodeB}:${r.nodeA}`)),
        );
        cmp(
          `${spec.name}.checks[no duplicate closed edge]`,
          `${rows.length} rows, ${distinct.size} distinct pairs`,
          checksByName.get("no duplicate closed edge"),
        );
      }

      // eslint-disable-next-line no-console -- the census IS the evidence
      console.log(
        `[WP8 connectivity] ${compared} fields compared over ${waveStates} cumulative wave ` +
          `states of ${SCHEDULES.length} reports, ${mismatched} mismatches`,
      );
      expect(fail).toEqual([]);
      expect(waveStates).toBe(21);
      // 5 reports x 9 graph fields + 21 x 14 connectivity fields + 21 x 3 S1/S2/S3
      // details + 5 duplicate checks.
      expect(compared).toBe(5 * 9 + 21 * 14 + 21 * 3 + 5);
    }, 600_000);
  },
);
