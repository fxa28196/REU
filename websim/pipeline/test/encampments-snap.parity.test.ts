/**
 * The public encampment asset's snap, against the certified Java snapper.
 *
 * WP4 shipped `build-encampments.ts` with a documented "lowest node id wins"
 * tie-break and flagged 7 order-ambiguous snaps for WP5 to reconcile. WP5's
 * reconciliation (`engine/test/graph/snap.parity.test.ts`) found the rule wrong
 * on one of them — encampment 523, ids 74194 / 16952934, whose two candidate
 * nodes sit in **different components**, so the choice decides whether that
 * resident can reach a shelter at all — and replaced it with the `HashMap`
 * bucket order that seeds JTS's STRtree traversal.
 *
 * This test is the regression lock on that correction, checked against the
 * builder's OWN function rather than the engine's, so the two implementations
 * agreeing is not assumed. It needs the git-ignored packed asset and the F1
 * oracle, so it is artifact-gated like the other real-feed tiers — loud and
 * reported as skipped without them, hard failure under WEBSIM_REQUIRE_ARTIFACTS.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { unpackTopology } from "@websim/shared";

import { artifactGate, describeGated } from "../../tools/artifact-gate.js";
import { nearestNodeIndex, type SnapTarget } from "../scripts/build-encampments.js";

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));
const TOPOLOGY = here("../out/assets/graph-topology.bin");
const ORACLE = here("../out/world-fixtures/snap/camp-snap.tsv");

const bitsBuf = new ArrayBuffer(8);
const bitsU64 = new BigUint64Array(bitsBuf);
const bitsF64 = new Float64Array(bitsBuf);
function bitsToDouble(hex16: string): number {
  bitsU64[0] = BigInt(`0x${hex16}`);
  return bitsF64[0]!;
}

describeGated(
  artifactGate({
    gate: "pipeline:encampments-snap-parity",
    suite: "build-encampments snap vs the certified nearestNode",
    evidence:
      "the regression lock on the tie-break correction: all 3,400 encampment reports snapped by " +
      "the BUILDER's own function and compared against the certified Java snapper, including " +
      "encampment 523 whose two candidate nodes sit in different components",
    artifacts: [
      { source: "graph-asset", label: "topology", path: TOPOLOGY },
      { source: "world-fixtures", label: "snap/camp-snap.tsv", path: ORACLE },
    ],
  }),
  () => {
  it("chooses the same street node as Java for all 3,400 reports", () => {
    const topology = unpackTopology(new Uint8Array(readFileSync(TOPOLOGY)));
    const target: SnapTarget = {
      nodeId: topology.nodeId,
      nodeLon: topology.nodeLon,
      nodeLat: topology.nodeLat,
    };

    let total = 0;
    let matched = 0;
    let ambiguous = 0;
    const misses: string[] = [];
    for (const line of readFileSync(ORACLE, "utf8").split("\n")) {
      if (line.length === 0 || line.startsWith("#")) {
        continue;
      }
      const f = line.split("\t");
      const hit = nearestNodeIndex(target, bitsToDouble(f[2]!), bitsToDouble(f[3]!));
      total++;
      if (hit.ambiguous) {
        ambiguous++;
      }
      if (topology.nodeId[hit.index] === Number(f[4])) {
        matched++;
      } else {
        misses.push(`camp ${f[0]!}: got ${topology.nodeId[hit.index]!}, Java chose ${f[4]!}`);
      }
    }

    expect(misses.join("; ")).toBe("");
    expect(total).toBe(3400);
    expect(matched).toBe(3400);
    // The census the public asset header carries; 0 would mean the graph lost
    // its coincident-coordinate groups and the tie-break's evidence needs a look.
    expect(ambiguous).toBe(7);
  }, 300_000);
  },
);
