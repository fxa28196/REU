/**
 * Round-trip proof for the packed graph asset (WP4 (a) + (b)).
 *
 * Two tiers, and both matter:
 *
 * - a **synthetic dump** exercising every structural corner (negative ids,
 *   sparse ids, two components, interior vertices, an endpoint exception,
 *   repeated names) — runs everywhere, including a clean clone;
 * - the **real 88,100-node dump**, when it is present — the only place the
 *   109,434-edge bit-exactness claim and the 3 MB wire budget can actually be
 *   measured. It is artifact-gated rather than faked when the dump is absent,
 *   because `pipeline/out/` is git-ignored and a test that silently passes on
 *   missing data is worse than one that says, loudly, that it did not run.
 */

import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { artifactGate, describeGated } from "../../tools/artifact-gate.js";

import {
  componentCensus,
  readContainerHeader,
  unpackGeometry,
  unpackNames,
  unpackTopology,
  verifySectionDigests,
} from "@websim/shared";
import { createHash } from "node:crypto";

import {
  DEFAULT_DUMP_DIR,
  EXPECTED_CENSUS,
  assertProductionCensus,
  doubleToBits,
  hexToDouble,
  packGraph,
  readGraphDump,
  verifyPack,
} from "../scripts/pack-graph.js";
import { syntheticGraph, writeSyntheticDump } from "./helpers/synthetic-dump.js";

const TMP = join(import.meta.dirname, "..", "out", "test-tmp", "graph-asset");
const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

describe("hexToDouble", () => {
  it("reproduces Java's hex bit pattern exactly, including negatives and powers of two", () => {
    expect(hexToDouble("0x1.b8b156b238b3fp4")).toBe(27.54329557054302);
    expect(hexToDouble("0x1.8a084857f864ap7")).toBe(197.01617693812506);
    expect(hexToDouble("-0x1.eb3842cce2c75p6")).toBe(-122.80494232305666);
    expect(hexToDouble("0x1.0p0")).toBe(1);
    expect(hexToDouble("-0x1.0p0")).toBe(-1);
    expect(hexToDouble("0x1.0p-1")).toBe(0.5);
  });

  it("rejects malformed input rather than guessing", () => {
    expect(() => hexToDouble("27.5")).toThrow(/not a Java hex double/u);
    expect(() => hexToDouble("0x1.8a08")).toThrow(/no binary exponent/u);
    expect(() => hexToDouble("0x2.0p0")).toThrow(/non-0\/1 leading digit/u);
  });
});

describe("packed graph asset — synthetic dump", () => {
  const dir = writeSyntheticDump(join(TMP, "dump"));
  const dump = readGraphDump(dir);

  it("reads the dump with zero decimal/hex disagreement", () => {
    expect(dump.decimalHexMismatches).toEqual({ nodes: 0, edgeLengths: 0 });
    expect(dump.nodeCount).toBe(6);
    expect(dump.edgeCount).toBe(5);
  });

  it("round-trips every edge length bit-exactly and preserves the whole graph", () => {
    const packed = packGraph(dump, { brotli: false });
    const v = verifyPack(packed);
    expect(v.edgeLengthBitMismatches).toBe(0);
    expect(v.edgeLengthBitsChecked).toBe(dump.edgeCount);
    expect(v.nodeCoordBitMismatches).toBe(0);
    expect(v.polylineVertexMismatches).toBe(0);
    expect(v.nameMismatches).toBe(0);
  });

  it("recovers the certified adjacency order, not merely the adjacency set", () => {
    const packed = packGraph(dump, { brotli: false });
    const topo = unpackTopology(packed.assets[0]!.bytes);
    // node id 13 is touched by features 1 (as `to`), 2 (as `from`) and 3 (as `to`),
    // and the exporter lists them in feature order.
    const idx = Array.from(topo.nodeId).indexOf(13);
    const slice = Array.from(topo.csrEntry.subarray(topo.csrOffset[idx]!, topo.csrOffset[idx + 1]!));
    expect(slice).toEqual([-2, 3, -4]);
  });

  it("reconstructs polylines losslessly, including the endpoint that is not its node", () => {
    const packed = packGraph(dump, { brotli: false });
    const topo = unpackTopology(packed.assets[0]!.bytes);
    const geom = unpackGeometry(packed.assets[1]!.bytes, topo);
    const g = syntheticGraph();
    expect(packed.endpointExceptions).toBe(1);
    for (let e = 0; e < g.edges.length; e++) {
      const expected = g.edges[e]!.polyline;
      const got: [number, number][] = [];
      for (let v = geom.polyOffset[e]!; v < geom.polyOffset[e + 1]!; v++) {
        got.push([geom.polyLon[v]!, geom.polyLat[v]!]);
      }
      expect(got).toEqual(expected.map(([x, y]) => [x, y]));
    }
  });

  it("deduplicates repeated street names and resolves each edge back to its label", () => {
    const packed = packGraph(dump, { brotli: false });
    const names = unpackNames(packed.assets[2]!.bytes);
    expect(packed.uniqueNames).toBe(4);
    expect(names.nameIndex[0]).toBe(names.nameIndex[2]);
    for (let e = 0; e < dump.edgeCount; e++) {
      expect(names.names[names.nameIndex[e]!]).toBe(dump.edgeLabel[e]);
    }
  });

  it("recomputes the component census from the packed CSR", () => {
    const packed = packGraph(dump, { brotli: false });
    const topo = unpackTopology(packed.assets[0]!.bytes);
    expect(componentCensus(topo)).toEqual({ components: 2, largest: 4 });
  });

  it("verifies every section digest and detects a single flipped payload byte", async () => {
    const packed = packGraph(dump, { brotli: false });
    const bytes = packed.assets[0]!.bytes;
    const header = readContainerHeader(bytes);
    expect(await verifySectionDigests(bytes, header, sha256)).toEqual([]);

    const lengths = header.sections.find((s) => s.id === "edge_length_m")!;
    const tampered = new Uint8Array(bytes);
    tampered[lengths.offset] = tampered[lengths.offset]! ^ 0x01;
    expect(await verifySectionDigests(tampered, readContainerHeader(tampered), sha256)).toEqual(["edge_length_m"]);
    // and the tampered length is a different double, i.e. the digest earned it
    expect(unpackTopology(tampered).edgeLengthM[0]).not.toBe(dump.edgeLengthM[0]);
  });

  it("is a pure function of the dump — rebuilding is byte-identical", () => {
    const a = packGraph(readGraphDump(dir), { brotli: false });
    const b = packGraph(readGraphDump(dir), { brotli: false });
    for (let i = 0; i < a.assets.length; i++) {
      expect(b.assets[i]!.sha256).toBe(a.assets[i]!.sha256);
    }
  });

  it("refuses a census that is not the post-U-27 production graph", () => {
    expect(() => assertProductionCensus(dump.census, { components: 2, largest: 4 })).toThrow(/88,100/u);
  });

  it("rejects a container whose magic or version is wrong", () => {
    const packed = packGraph(dump, { brotli: false });
    const bad = new Uint8Array(packed.assets[0]!.bytes);
    bad[0] = 0x00;
    expect(() => unpackTopology(bad)).toThrow(/bad magic/u);
    const wrongVersion = new Uint8Array(packed.assets[0]!.bytes);
    new DataView(wrongVersion.buffer).setUint32(8, 99, true);
    expect(() => unpackTopology(wrongVersion)).toThrow(/format version 99/u);
  });

  it("rejects a geometry container read against the wrong topology", () => {
    const packed = packGraph(dump, { brotli: false });
    const topo = unpackTopology(packed.assets[0]!.bytes);
    expect(() => unpackGeometry(packed.assets[0]!.bytes, topo)).toThrow(/expected a geometry container/u);
  });
});

describeGated(
  artifactGate({
    gate: "pipeline:graph-asset-real-dump",
    suite: "packed graph asset — real exporter dump",
    evidence:
      "the 109,434-edge bit-exactness claim and the 3 MB brotli wire budget, measured on the " +
      "real 88,100-node exporter dump instead of on the synthetic stand-in",
    artifacts: [
      { source: "graph-dump", label: "census.json", path: join(DEFAULT_DUMP_DIR, "census.json") },
    ],
  }),
  () => {
  it(
    "packs the certified graph: 109,434 bit-exact lengths, census intact, topology under 3 MB brotli",
    () => {
      const dump = readGraphDump(DEFAULT_DUMP_DIR);
      expect(dump.decimalHexMismatches).toEqual({ nodes: 0, edgeLengths: 0 });

      const packed = packGraph(dump);
      const v = verifyPack(packed);

      // (a) every edge length survives pack → unpack as the same 64 bits
      expect(v.edgeLengthBitsChecked).toBe(EXPECTED_CENSUS.undirected_street_edges);
      expect(v.edgeLengthBitMismatches).toBe(0);
      expect(v.nodeCoordBitMismatches).toBe(0);
      expect(v.polylineVertexMismatches).toBe(0);
      expect(v.nameMismatches).toBe(0);

      // and the unpacked bits are Java's bits, not just self-consistent ones
      const topo = unpackTopology(packed.assets[0]!.bytes);
      for (let e = 0; e < 32; e++) {
        expect(doubleToBits(topo.edgeLengthM[e]!)).toBe(doubleToBits(dump.edgeLengthM[e]!));
      }

      // (b) the census in the packed asset is the production graph
      expect(topo.census.final_graph_nodes).toBe(EXPECTED_CENSUS.final_graph_nodes);
      expect(topo.census.undirected_street_edges).toBe(EXPECTED_CENSUS.undirected_street_edges);
      expect(topo.census.components).toBe(EXPECTED_CENSUS.components);
      expect(topo.census.largest_component_nodes).toBe(EXPECTED_CENSUS.largest_component_nodes);
      expect(topo.census.affected_attr_node_ids).toBe(EXPECTED_CENSUS.affected_attr_node_ids);
      expect(topo.corrections.filter((c) => c.kind === "REATTACHED").length).toBe(EXPECTED_CENSUS.sites_reattached);
      expect(topo.corrections.filter((c) => c.kind === "SPLIT").length).toBe(EXPECTED_CENSUS.sites_split_synthetic);
      expect(componentCensus(topo)).toEqual({
        components: EXPECTED_CENSUS.components,
        largest: EXPECTED_CENSUS.largest_component_nodes,
      });
      assertProductionCensus(topo.census, componentCensus(topo));

      // (c) the wire budget the DR-S2 fallback was invoked to meet
      expect(v.topologyBrotliBytes).not.toBeNull();
      expect(v.topologyBrotliBytes!).toBeLessThanOrEqual(3 * 1024 * 1024);

      // DR-S2 §5: 218,860 of 218,868 polyline endpoints coincide with their node
      expect(packed.endpointExceptions).toBe(8);
    },
    120_000,
  );
  },
);

// Keep the scratch tree out of the way of the next run.
//
// `afterAll`, NOT `process.on("beforeExit", ...)`. Vitest runs each test file in
// a pooled worker that is torn down rather than exited normally, so a
// `beforeExit` handler never fires and `out/test-tmp/graph-asset/dump/` survived
// every run this file has ever made — the leak `tools/check-scratch.ts` was
// written to catch, and which that guard now keeps caught.
afterAll(() => {
  if (process.env["VITEST_KEEP_TMP"] === undefined) {
    rmSync(TMP, { recursive: true, force: true });
  }
});
