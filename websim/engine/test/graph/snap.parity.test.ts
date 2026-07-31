/**
 * WP5 acceptance: snap assignments equal Java for all shelters and all camp
 * points on the local raw-coordinate path.
 *
 * The oracles are `snap/camp-snap.tsv` (every parseable row of the encampment
 * sample, snapped by the certified `StreetNetwork.nearestNode`) and the 13
 * `shelters/<arm>.tsv` tables (`graph_node` per shelter). Together: 3,908
 * points, every one produced by the certified snapper.
 *
 * Three things are asserted, and the last is the one the WP4 hand-off flagged:
 *
 *  1. The chosen node id equals Java's, for every point.
 *  2. The node coordinate the snap resolves to equals Java's, bit for bit.
 *  3. Where the certified graph is genuinely ambiguous — 192 groups of nodes at
 *     bit-identical coordinates — the tie census is reported and the tie-break
 *     is shown to be doing real work, not coincidence. WP4's builder documented
 *     "lowest node id wins" and flagged 7 order-ambiguous encampment snaps for
 *     WP5 to reconcile; this test is that reconciliation, and it shows the
 *     lowest-id rule getting one of the 7 wrong, across a component boundary.
 *
 * `snap_gap_m` is compared with a **tolerance, not by bits**: it is a geodesic
 * `Inverse`, and DR-S1 established that the Java model runs GeographicLib-Java
 * 1.49 while the port runs geographiclib-js 2.x, with a measured agreement
 * ceiling of 3.159e-9 m and an adopted budget of 1e-8 m. Claiming bit-identity
 * here would be false; the node CHOICE, which is what routing depends on, is
 * exact and is asserted as such.
 */

import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

import { artifactGate, describeGated, gatedFixturePresent } from "../../../tools/artifact-gate.js";
import { geodesicDistanceM } from "../../src/geo/geodesic.js";
import { DegreeSpaceNodeIndex } from "../../src/graph/strtreeSnap.js";
import {
  GRAPH_ASSET_REFS,
  SNAP_FIXTURE_REF,
  WORLD_FIXTURE_DIR,
  bitsToDouble,
  dataLines,
  doubleToBits,
  loadGraph,
} from "./helpers.js";

/** DR-S1's adopted budget for geodesic agreement between the two libraries. */
const GEODESIC_BUDGET_M = 1e-8;

const gate = artifactGate({
  gate: "engine:graph-snap-parity",
  suite: "nearestNode vs the certified snapper",
  evidence:
    "3,908 snap assignments (3,400 encampment reports + 13 shelter tables) checked against the " +
    "certified StreetNetwork.nearestNode, including the 192-group coincident-coordinate tie census",
  artifacts: [...GRAPH_ASSET_REFS, SNAP_FIXTURE_REF],
});

const ARM_FIXTURES = [
  "A",
  "B",
  "C",
  "E0-A",
  "E0-B",
  "E0-C",
  "ER-A",
  "ER-C",
  "ER-D",
  "SE-E18",
  "SE-E19",
  "SE-E20",
  "SE2-E18-d1",
] as const;

describeGated(gate, () => {
  it("snaps all 3,400 encampment reports to the node Java chose", () => {
    const { graph } = loadGraph();
    const index = new DegreeSpaceNodeIndex(graph);
    const text = readFileSync(`${WORLD_FIXTURE_DIR}/snap/camp-snap.tsv`, "utf8");

    let total = 0;
    let nodeMatched = 0;
    let coordMatched = 0;
    let ties = 0;
    let tiesDecidedByHashOrder = 0;
    let lowestIdWouldDiffer = 0;
    let maxGapDeltaM = 0;
    let gapBitDifferent = 0;
    const lowestIdMisses: string[] = [];

    for (const line of dataLines(text)) {
      const f = line.split("\t");
      const lon = bitsToDouble(f[2]!);
      const lat = bitsToDouble(f[3]!);
      const javaNode = Number(f[4]);
      const javaGap = bitsToDouble(f[7]!);

      const snap = index.nearest(lon, lat);
      total++;
      if (graph.nodeId[snap.node] === javaNode) {
        nodeMatched++;
      } else {
        expect(graph.nodeId[snap.node], `camp ${f[0]!} (${f[1]!}) node`).toBe(javaNode);
      }

      if (doubleToBits(graph.nodeLon[snap.node]!) === f[5] && doubleToBits(graph.nodeLat[snap.node]!) === f[6]) {
        coordMatched++;
      } else {
        expect(doubleToBits(graph.nodeLon[snap.node]!), `camp ${f[0]!} node lon`).toBe(f[5]);
        expect(doubleToBits(graph.nodeLat[snap.node]!), `camp ${f[0]!} node lat`).toBe(f[6]);
      }

      const gap = geodesicDistanceM(lon, lat, graph.nodeLon[snap.node]!, graph.nodeLat[snap.node]!);
      const delta = Math.abs(gap - javaGap);
      if (delta > maxGapDeltaM) {
        maxGapDeltaM = delta;
      }
      if (doubleToBits(gap) !== f[7]!) {
        gapBitDifferent++;
      }

      if (snap.tiedCount > 1) {
        ties++;
        if (snap.tieKind === "hash-order") {
          tiesDecidedByHashOrder++;
        }
        const candidates = index.nearestCandidates(lon, lat).nodes.map((n) => graph.nodeId[n]!);
        const lowest = Math.min(...candidates);
        if (lowest !== javaNode) {
          lowestIdWouldDiffer++;
          lowestIdMisses.push(`camp ${f[0]!}: ids ${candidates.join("/")}, Java chose ${javaNode}`);
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `[WP5] encampment snaps: ${nodeMatched}/${total} node ids equal Java, ` +
        `${coordMatched}/${total} node coordinates bit-equal, ${ties} coordinate ties ` +
        `(${tiesDecidedByHashOrder} decided by HashMap bucket order), ` +
        `max |snap_gap_m - Java| = ${maxGapDeltaM.toExponential(3)} m ` +
        `(${gapBitDifferent}/${total} rows differ in bits); ` +
        `"lowest node id wins" would have been wrong on ${lowestIdWouldDiffer}: ` +
        `${lowestIdMisses.join("; ") || "none"}`,
    );

    expect(total).toBe(3400);
    expect(nodeMatched).toBe(total);
    expect(coordMatched).toBe(total);
    expect(maxGapDeltaM).toBeLessThan(GEODESIC_BUDGET_M);

    // README §6 divergence 9: snap_gap_m is the one quantity here compared with a
    // tolerance, so the tolerance is asserted to be *necessary*, not just
    // sufficient. Measured 3,160/3,400 (92.9%). Pinned as a floor so the register
    // entry cannot go stale unnoticed, and as a positive max so a degenerate
    // all-zero comparison cannot pass.
    expect(gapBitDifferent).toBeGreaterThanOrEqual(3000);
    expect(maxGapDeltaM).toBeGreaterThan(0);

    // The reconciliation WP4 asked for: the ties are real, and the intuitive
    // rule is not sufficient. If this ever drops to 0 the graph changed and the
    // tie-break's evidence base needs revisiting.
    expect(ties).toBe(7);
    expect(tiesDecidedByHashOrder).toBe(7);
    expect(lowestIdWouldDiffer).toBe(1);
  }, 300_000);

  it("snaps every shelter of all 13 configured CSVs to the node Java chose", () => {
    const { graph } = loadGraph();
    const index = new DegreeSpaceNodeIndex(graph);

    let total = 0;
    let matched = 0;
    let ties = 0;
    let maxGapDeltaM = 0;
    let files = 0;

    for (const arm of ARM_FIXTURES) {
      const path = `${WORLD_FIXTURE_DIR}/shelters/${arm}.tsv`;
      // `expect(files).toBe(13)` below already refuses a shrunken set; this says
      // out loud WHICH member vanished, and refuses it immediately under strict.
      if (
        !gatedFixturePresent(gate, {
          source: "world-fixtures",
          label: `shelters/${arm}.tsv`,
          path,
        })
      ) {
        continue;
      }
      files++;
      for (const line of dataLines(readFileSync(path, "utf8"))) {
        const f = line.split("\t");
        const lon = bitsToDouble(f[5]!);
        const lat = bitsToDouble(f[6]!);
        const javaNode = Number(f[12]);
        const javaGap = bitsToDouble(f[15]!);

        const snap = index.nearest(lon, lat);
        total++;
        if (graph.nodeId[snap.node] === javaNode) {
          matched++;
        } else {
          expect(graph.nodeId[snap.node], `${arm} shelter ${f[1]!}`).toBe(javaNode);
        }
        expect(doubleToBits(graph.nodeLon[snap.node]!), `${arm} ${f[1]!} node lon`).toBe(f[13]);
        expect(doubleToBits(graph.nodeLat[snap.node]!), `${arm} ${f[1]!} node lat`).toBe(f[14]);
        if (snap.tiedCount > 1) {
          ties++;
        }
        const gap = geodesicDistanceM(lon, lat, graph.nodeLon[snap.node]!, graph.nodeLat[snap.node]!);
        const delta = Math.abs(gap - javaGap);
        if (delta > maxGapDeltaM) {
          maxGapDeltaM = delta;
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `[WP5] shelter snaps: ${matched}/${total} node ids equal Java across ${files} shelter CSVs, ` +
        `${ties} coordinate ties, max |snap_gap_m - Java| = ${maxGapDeltaM.toExponential(3)} m`,
    );
    expect(files).toBe(13);
    expect(matched).toBe(total);
    expect(total).toBeGreaterThan(500);
    expect(maxGapDeltaM).toBeLessThan(GEODESIC_BUDGET_M);
  }, 300_000);

  it("censuses the coincident-coordinate groups the tie-break exists for", () => {
    const { graph } = loadGraph();
    const groups = new Map<string, number[]>();
    for (let i = 0; i < graph.nodeCount; i++) {
      const key = `${doubleToBits(graph.nodeLon[i]!)}|${doubleToBits(graph.nodeLat[i]!)}`;
      const g = groups.get(key);
      if (g === undefined) {
        groups.set(key, [i]);
      } else {
        g.push(i);
      }
    }
    let multi = 0;
    let largest = 1;
    for (const g of groups.values()) {
      if (g.length > 1) {
        multi++;
        largest = Math.max(largest, g.length);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[WP5] coincident-coordinate groups: ${multi}, largest ${largest}`);
    expect(multi).toBe(192);
    expect(largest).toBe(2);
  }, 120_000);
});
