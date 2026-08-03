/**
 * The closure-wave recompute, **measured on the real 88,100-node graph**.
 *
 * Plan §3.4 provisions an `sssp-pool` for this work and plan §3.6 budgets one
 * wave at 5 s wall. `engine/src/worker/sssp.ts` explains, in full, why WP10
 * ships the measurement and the seam but no pool. This file is the measurement:
 * it re-derives the number on this tree rather than citing DR-S3, and it prints
 * it so the decision is auditable rather than asserted.
 *
 * It is artifact-gated on the packed graph. On a clean clone the gate skips
 * loudly and names what evidence is forgone; with `WEBSIM_REQUIRE_ARTIFACTS` set
 * it fails instead.
 *
 * **The pass condition is deliberately weak and the print is the deliverable.**
 * A budget assertion at, say, 1 s would be a performance gate on somebody else's
 * laptop; the useful, non-flaky assertion is against the plan's own 5 s wall
 * budget, with the measured headroom printed alongside so a regression is
 * visible in the log long before it is visible in the verdict.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { artifactGate, describeGated, type ArtifactRef } from "../../../tools/artifact-gate.js";
import { unpackTopology } from "@websim/shared/graph-asset";
import { buildRoutingGraph } from "../../src/graph/csr.js";
import { DegreeSpaceNodeIndex } from "../../src/graph/strtreeSnap.js";
import { decodeCsvBytes, javaParseDouble, readCsvText } from "../../src/loader/csv.js";
import {
  CLOSURE_WAVE_BUDGET_MS,
  estimatePoolTransferBytes,
  measureSsspWave,
} from "../../src/worker/sssp.js";

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));
const ASSET_DIR = here("../../../pipeline/out/assets");
const GEOGRAPHY_DIR = here("../../../../Geography");

/** Arm C: 46 shelter rows — the wave size plan §3.4 and DR-S3 both quote. */
const SHELTERS_C = `${GEOGRAPHY_DIR}/data/shelters/shelters_2026_expanded_plus_new_sites.csv`;

const refs: ArtifactRef[] = [
  { source: "graph-asset", label: "graph-topology.bin", path: `${ASSET_DIR}/graph-topology.bin` },
  { source: "geography", label: "shelters_2026_expanded_plus_new_sites.csv", path: SHELTERS_C },
];

describeGated(
  artifactGate({
    gate: "engine:wp10-sssp-wave-measurement",
    suite: "closure-wave SSSP cost on the real graph (WP10 pool decision)",
    evidence:
      "the measured cost of one 46-tree closure wave, which is the number the 'no SSSP worker " +
      "pool' decision in engine/src/worker/sssp.ts rests on",
    artifacts: refs,
  }),
  () => {
    it("re-measures the wave and prints the headroom against the 5 s budget", () => {
      const topology = unpackTopology(new Uint8Array(readFileSync(`${ASSET_DIR}/graph-topology.bin`)));
      const graph = buildRoutingGraph(topology);
      expect(graph.nodeCount, "this is not the certified graph").toBe(88_100);

      const snap = new DegreeSpaceNodeIndex(graph);
      const rows = readCsvText(decodeCsvBytes(readFileSync(SHELTERS_C)));
      const sources = rows.map((r) =>
        snap.nearest(javaParseDouble(r.get("lon") ?? ""), javaParseDouble(r.get("lat") ?? "")).node,
      );
      expect(sources.length, "arm C is 46 shelter rows").toBe(46);

      const m = measureSsspWave({ graph, sources, repeats: 3 });
      const transferBytes = estimatePoolTransferBytes(graph);
      // eslint-disable-next-line no-console -- the measurement IS the deliverable.
      console.log(
        "[wp10-sssp]",
        JSON.stringify({
          trees: m.trees,
          medianMs: Number(m.medianMs.toFixed(1)),
          minMs: Number(m.minMs.toFixed(1)),
          maxMs: Number(m.maxMs.toFixed(1)),
          samplesMs: m.msPerWave.map((x) => Number(x.toFixed(1))),
          budgetMs: m.budgetMs,
          headroomX: Number(m.headroom.toFixed(1)),
          reachableTotal: m.reachableTotal,
          poolTransferBytesPerWorker: transferBytes,
        }),
      );

      // Non-vacuity: 46 full-graph trees must actually have been computed. The
      // certified per-tree reachable count is ~29,997 (DR-WP5: 3,539,712
      // distances over 118 trees), so 20,000 apiece is a floor that a truncated
      // or short-circuited Dijkstra could not clear.
      expect(m.reachableTotal).toBeGreaterThan(46 * 20_000);
      expect(m.medianMs, "one wave now exceeds the plan's 5 s wall budget").toBeLessThan(
        CLOSURE_WAVE_BUDGET_MS,
      );
      // The pool-setup floor, stated as a number rather than as a claim.
      expect(transferBytes).toBeGreaterThan(1_000_000);
    }, 300_000);
  },
);

it("the gate's own artifact list points at real paths", () => {
  // Cheap guard against a typo turning the gate above into a permanent skip.
  expect(refs.length).toBe(2);
  for (const r of refs) {
    expect(r.path.length).toBeGreaterThan(10);
  }
  // Geography/ is a checked-in read-only tree; if it is missing the whole
  // repository is incomplete, so this one is safe to assert unconditionally.
  expect(existsSync(GEOGRAPHY_DIR), "Geography/ is missing — this is not a full checkout").toBe(true);
});
