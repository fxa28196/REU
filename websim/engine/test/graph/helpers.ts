/**
 * Shared loading + comparison helpers for the WP5 graph tests.
 *
 * Two fixture tiers, and which one a test can use decides whether it runs in a
 * clean checkout:
 *
 *  - `engine/test/fixtures/world/` is **committed** (manifest + stride-sampled
 *    oracle rows) — but every tree oracle still needs the graph to compare
 *    against, and the graph asset lives under the git-ignored `pipeline/out/`.
 *  - `pipeline/out/` holds the full 108 MB tree dumps and the packed asset.
 *
 * So every parity test here is artifact-gated through the shared skip-vs-fail
 * policy in `tools/artifact-gate.ts` (plan §5.3): the suite runs when the
 * artifacts are there, prints a loud attributed banner and is reported as
 * SKIPPED when they are not, and is a hard FAILURE when they are not and
 * `WEBSIM_REQUIRE_ARTIFACTS` is set. The always-green cover is the synthetic
 * unit suite alongside these files.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { unpackGeometry, unpackTopology, type GraphGeometry } from "@websim/shared/graph-asset";

import type { ArtifactRef } from "../../../tools/artifact-gate.js";
import { buildRoutingGraph, type RoutingGraph } from "../../src/graph/csr.js";

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

export const ASSET_DIR = here("../../../pipeline/out/assets");
export const WORLD_FIXTURE_DIR = here("../../../pipeline/out/world-fixtures");
export const COMMITTED_FIXTURE_DIR = here("../fixtures/world");
export const GEOGRAPHY_DIR = here("../../../../Geography");
export const LOCAL_RAW_DIR = here("../../../pipeline/local-raw");

/**
 * The artifact refs the WP5 gates are declared from — one place, so a banner
 * always names the file that `assetsPresent()` and friends actually probe.
 */
export const GRAPH_ASSET_REFS: readonly ArtifactRef[] = [
  { source: "graph-asset", label: "topology", path: `${ASSET_DIR}/graph-topology.bin` },
  { source: "graph-asset", label: "geometry", path: `${ASSET_DIR}/graph-geometry.bin` },
];

export const TREE_FIXTURE_REF: ArtifactRef = {
  source: "world-fixtures",
  label: "trees/A/index.tsv",
  path: `${WORLD_FIXTURE_DIR}/trees/A/index.tsv`,
};

export const SNAP_FIXTURE_REF: ArtifactRef = {
  source: "world-fixtures",
  label: "snap/camp-snap.tsv",
  path: `${WORLD_FIXTURE_DIR}/snap/camp-snap.tsv`,
};

export const GEOGRAPHY_SHELTERS_REF: ArtifactRef = {
  source: "geography",
  label: "shelters_2026_current_placement.csv",
  path: `${GEOGRAPHY_DIR}/data/shelters/shelters_2026_current_placement.csv`,
};

export function assetsPresent(): boolean {
  return GRAPH_ASSET_REFS.every((r) => existsSync(r.path));
}

export function treeFixturesPresent(): boolean {
  return existsSync(TREE_FIXTURE_REF.path);
}

export function snapFixturesPresent(): boolean {
  return existsSync(SNAP_FIXTURE_REF.path);
}

let cachedGraph: { graph: RoutingGraph; geometry: GraphGeometry } | null = null;

/** Load the packed WP4 asset once per test file and re-shape it for routing. */
export function loadGraph(): { graph: RoutingGraph; geometry: GraphGeometry } {
  if (cachedGraph === null) {
    const topoBytes = new Uint8Array(readFileSync(`${ASSET_DIR}/graph-topology.bin`));
    const topology = unpackTopology(topoBytes);
    const geomBytes = new Uint8Array(readFileSync(`${ASSET_DIR}/graph-geometry.bin`));
    const geometry = unpackGeometry(geomBytes, topology);
    cachedGraph = { graph: buildRoutingGraph(topology), geometry };
  }
  return cachedGraph;
}

/**
 * Decode the F1 fixture float encoding: `%016x` of `Double.doubleToRawLongBits`.
 * BigInt in, typed-array out — no floating-point arithmetic touches the value,
 * so what comes back is the exact double Java held.
 */
const bitsBuf = new ArrayBuffer(8);
const bitsU64 = new BigUint64Array(bitsBuf);
const bitsF64 = new Float64Array(bitsBuf);

export function bitsToDouble(hex16: string): number {
  bitsU64[0] = BigInt(`0x${hex16}`);
  return bitsF64[0]!;
}

export function doubleToBits(v: number): string {
  bitsF64[0] = v;
  return bitsU64[0]!.toString(16).padStart(16, "0");
}

/** Raw IEEE-754 identity. `NaN === NaN` is false and `0 === -0` is true; neither is wanted. */
export function sameBits(a: number, b: number): boolean {
  return doubleToBits(a) === doubleToBits(b);
}

/** Iterate the non-comment, non-empty lines of a TSV dump. */
export function* dataLines(text: string): Generator<string> {
  let start = 0;
  const n = text.length;
  while (start < n) {
    let end = text.indexOf("\n", start);
    if (end === -1) {
      end = n;
    }
    let stop = end;
    if (stop > start && text.charCodeAt(stop - 1) === 13) {
      stop -= 1;
    }
    if (stop > start && text.charCodeAt(start) !== 35 /* # */) {
      yield text.slice(start, stop);
    }
    start = end + 1;
  }
}

export interface ManifestDump {
  readonly name: string;
  readonly path: string;
  readonly lines: number;
  readonly bytes: number;
  readonly sha256: string;
}

export interface WorldManifest {
  readonly graphCensus: Record<string, number>;
  readonly configs: readonly { id: string; sheltersCsv: string; closuresCsv: string | null }[];
  readonly dumps: readonly ManifestDump[];
}

export function worldManifest(): WorldManifest {
  return JSON.parse(readFileSync(`${COMMITTED_FIXTURE_DIR}/manifest.json`, "utf8")) as WorldManifest;
}
