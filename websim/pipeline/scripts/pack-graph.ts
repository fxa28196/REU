/**
 * pack-graph.ts — WP4: pack the read-only Java exporter's graph dump into the
 * shipped binary assets (plan §4, Q8; DR-S2).
 *
 *   tsx pipeline/scripts/pack-graph.ts [--dump <dir>] [--out <dir>] [--no-brotli]
 *
 * DR-S2 measured a monolithic asset at 8.794 MB brotli against a ≤ 3 MB budget
 * and invoked the pre-named fallback, so this writes a **split** asset:
 *
 *   graph-topology.bin   eager  — node table, edge endpoints, Java Float64 edge
 *                                 lengths, CSR adjacency in certified feature
 *                                 order, census + correction census
 *   graph-geometry.bin   lazy   — display polylines (interior vertices only)
 *   graph-names.bin      lazy   — street-name dictionary, display only
 *
 * Two rules this script exists to enforce:
 *
 * 1. **Nothing is recomputed.** Edge lengths and node coordinates are taken from
 *    the exporter's IEEE-754 hex columns and turned into bits directly, never
 *    via decimal arithmetic. The decimal columns are then checked *against* the
 *    hex, so a lossy dump would fail the build rather than ship silently.
 * 2. **The census is checked, not copied.** The packed census must equal the
 *    established post-U-27 production figures, and the arrays that ship must
 *    reproduce them — including the component census, recomputed from the packed
 *    CSR itself.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { brotliCompressSync, brotliDecompressSync, constants as ZLIB } from "node:zlib";
import { fileURLToPath } from "node:url";

import {
  buildContainer,
  componentCensus,
  f64Section,
  i32Section,
  unpackGeometry,
  unpackNames,
  unpackTopology,
  utf8Section,
  type GraphCensus,
  type GraphCorrection,
  type SectionInput,
} from "@websim/shared";

/**
 * The established post-U-27 production census (DR-S2 §3, finding S2-F1).
 * The plan's "4 reattached / 23 split / 154 components / 60,444 largest" figures
 * describe the PRE-U-27 graph; packing must never drift back toward them.
 */
export const EXPECTED_CENSUS = {
  final_graph_nodes: 88_100,
  undirected_street_edges: 109_434,
  components: 171,
  largest_component_nodes: 59_725,
  affected_attr_node_ids: 25,
  sites_reattached: 3,
  sites_split_synthetic: 22,
} as const;

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

// ---------------------------------------------------------------------------
// exact IEEE-754 hex parsing
// ---------------------------------------------------------------------------

const bitBuf = new ArrayBuffer(8);
const bitView = new DataView(bitBuf);

/**
 * `Double.toHexString` → the exact 64-bit pattern, assembled with BigInt.
 *
 * Deliberately not `parseFloat`-style arithmetic: the whole point of the hex
 * column is that no floating-point operation stands between Java's bits and
 * ours, including for subnormals.
 */
export function hexToDouble(s: string): number {
  let i = 0;
  let negative = false;
  if (s[i] === "-") {
    negative = true;
    i++;
  } else if (s[i] === "+") {
    i++;
  }
  if (s.slice(i, i + 2) !== "0x") {
    throw new Error(`not a Java hex double: '${s}'`);
  }
  i += 2;
  const p = s.indexOf("p", i);
  if (p < 0) {
    throw new Error(`hex double has no binary exponent: '${s}'`);
  }
  const mantissa = s.slice(i, p);
  const exponent = Number.parseInt(s.slice(p + 1), 10);
  const dot = mantissa.indexOf(".");
  const lead = dot < 0 ? mantissa : mantissa.slice(0, dot);
  const frac = dot < 0 ? "" : mantissa.slice(dot + 1);
  if (frac.length > 13) {
    throw new Error(`hex double has ${frac.length} fraction digits (max 13): '${s}'`);
  }
  const fracBits = (frac.length === 0 ? 0n : BigInt(`0x${frac}`)) << BigInt(52 - 4 * frac.length);
  let biased: bigint;
  if (lead === "1") {
    biased = BigInt(exponent + 1023);
    if (biased <= 0n || biased >= 2047n) {
      throw new Error(`hex double exponent out of normal range: '${s}'`);
    }
  } else if (lead === "0") {
    biased = 0n; // subnormal; Java always writes p-1022 here
  } else {
    throw new Error(`hex double has a non-0/1 leading digit: '${s}'`);
  }
  const bits = (negative ? 1n << 63n : 0n) | (biased << 52n) | fracBits;
  bitView.setBigUint64(0, bits, false);
  return bitView.getFloat64(0, false);
}

/** Raw bit pattern of a double, for bit-exactness assertions. */
export function doubleToBits(x: number): bigint {
  bitView.setFloat64(0, x, false);
  return bitView.getBigUint64(0, false);
}

// ---------------------------------------------------------------------------
// dump reader
// ---------------------------------------------------------------------------

export interface GraphDump {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly nodeId: Int32Array;
  readonly nodeLon: Float64Array;
  readonly nodeLat: Float64Array;
  readonly edgeFrom: Int32Array;
  readonly edgeTo: Int32Array;
  readonly edgeLengthM: Float64Array;
  readonly edgeNCoords: Int32Array;
  readonly edgeLabel: readonly string[];
  readonly csrOffset: Int32Array;
  readonly csrEntry: Int32Array;
  readonly polyOffset: Int32Array;
  readonly polyLon: Float64Array;
  readonly polyLat: Float64Array;
  readonly census: GraphCensus;
  readonly corrections: readonly GraphCorrection[];
  /** decimal-vs-hex disagreements found while reading (must be 0). */
  readonly decimalHexMismatches: { nodes: number; edgeLengths: number };
}

function dataLines(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const l = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (l.length === 0 || l.startsWith("#")) {
      continue;
    }
    out.push(l);
  }
  return out;
}

/** Read the exporter dump directory into typed arrays. */
export function readGraphDump(dumpDir: string): GraphDump {
  const nodeLines = dataLines(readFileSync(join(dumpDir, "nodes.tsv"), "utf8"));
  const nodeCount = nodeLines.length;
  const nodeId = new Int32Array(nodeCount);
  const nodeLon = new Float64Array(nodeCount);
  const nodeLat = new Float64Array(nodeCount);
  const nodeIndexById = new Map<number, number>();
  let nodeMismatch = 0;
  for (let i = 0; i < nodeCount; i++) {
    const f = nodeLines[i]!.split("\t");
    const id = Number(f[0]);
    // Hex is authoritative; the decimal column is the cross-check.
    const lon = hexToDouble(f[3]!);
    const lat = hexToDouble(f[4]!);
    if (Number(f[1]) !== lon || Number(f[2]) !== lat) {
      nodeMismatch++;
    }
    nodeId[i] = id;
    nodeLon[i] = lon;
    nodeLat[i] = lat;
    if (nodeIndexById.has(id)) {
      throw new Error(`nodes.tsv: duplicate node id ${id}`);
    }
    nodeIndexById.set(id, i);
  }

  const edgeLines = dataLines(readFileSync(join(dumpDir, "edges.tsv"), "utf8"));
  const edgeCount = edgeLines.length;
  const edgeFrom = new Int32Array(edgeCount);
  const edgeTo = new Int32Array(edgeCount);
  const edgeLengthM = new Float64Array(edgeCount);
  const edgeNCoords = new Int32Array(edgeCount);
  const edgeLabel: string[] = new Array<string>(edgeCount);
  let lengthMismatch = 0;
  for (let i = 0; i < edgeCount; i++) {
    const f = edgeLines[i]!.split("\t");
    if (Number(f[0]) !== i) {
      throw new Error(`edges.tsv: row ${i} declares feature index ${f[0]} — feature order is load-bearing`);
    }
    const from = nodeIndexById.get(Number(f[1]));
    const to = nodeIndexById.get(Number(f[2]));
    if (from === undefined || to === undefined) {
      throw new Error(`edges.tsv row ${i}: endpoint ${f[1]}/${f[2]} is not in nodes.tsv`);
    }
    const len = hexToDouble(f[3]!);
    if (Number(f[4]) !== len) {
      lengthMismatch++;
    }
    edgeFrom[i] = from;
    edgeTo[i] = to;
    edgeLengthM[i] = len;
    edgeNCoords[i] = Number(f[5]);
    edgeLabel[i] = f[6] ?? "";
  }

  // CSR, entries in the certified adjacency order (= shapefile feature order).
  const adjLines = dataLines(readFileSync(join(dumpDir, "adjacency.tsv"), "utf8"));
  if (adjLines.length !== nodeCount) {
    throw new Error(`adjacency.tsv has ${adjLines.length} rows but there are ${nodeCount} nodes`);
  }
  const degree = new Int32Array(nodeCount);
  const parsedRows: number[][] = new Array<number[]>(nodeCount);
  for (const line of adjLines) {
    const f = line.split("\t");
    const nodeIdx = nodeIndexById.get(Number(f[0]));
    if (nodeIdx === undefined) {
      throw new Error(`adjacency.tsv: node ${f[0]} is not in nodes.tsv`);
    }
    if (parsedRows[nodeIdx] !== undefined) {
      throw new Error(`adjacency.tsv: node ${f[0]} appears twice`);
    }
    const deg = Number(f[1]);
    const entries: number[] = new Array<number>(deg);
    for (let d = 0; d < deg; d++) {
      const cell = f[2 + d];
      if (cell === undefined) {
        throw new Error(`adjacency.tsv: node ${f[0]} declares degree ${deg} but has ${f.length - 2} entries`);
      }
      const colon = cell.indexOf(":");
      const featureIdx = Number(cell.slice(0, colon));
      const dir = cell[colon + 1];
      entries[d] = dir === "+" ? featureIdx + 1 : -(featureIdx + 1);
    }
    degree[nodeIdx] = deg;
    parsedRows[nodeIdx] = entries;
  }
  const csrOffset = new Int32Array(nodeCount + 1);
  for (let i = 0; i < nodeCount; i++) {
    csrOffset[i + 1] = csrOffset[i]! + degree[i]!;
  }
  const csrEntry = new Int32Array(csrOffset[nodeCount]!);
  for (let i = 0; i < nodeCount; i++) {
    const row = parsedRows[i];
    if (row === undefined) {
      throw new Error(`adjacency.tsv: no row for node index ${i}`);
    }
    csrEntry.set(row, csrOffset[i]!);
  }

  // Polylines, oriented from → to, one row per feature index.
  const polyLines = dataLines(readFileSync(join(dumpDir, "polylines.tsv"), "utf8"));
  if (polyLines.length !== edgeCount) {
    throw new Error(`polylines.tsv has ${polyLines.length} rows but there are ${edgeCount} edges`);
  }
  const polyOffset = new Int32Array(edgeCount + 1);
  for (let e = 0; e < edgeCount; e++) {
    polyOffset[e + 1] = polyOffset[e]! + edgeNCoords[e]!;
  }
  const vertexTotal = polyOffset[edgeCount]!;
  const polyLon = new Float64Array(vertexTotal);
  const polyLat = new Float64Array(vertexTotal);
  for (const line of polyLines) {
    const f = line.split("\t");
    const e = Number(f[0]);
    const n = Number(f[1]);
    if (n !== edgeNCoords[e]) {
      throw new Error(`polylines.tsv edge ${e}: ${n} vertices but edges.tsv says ${edgeNCoords[e]}`);
    }
    let w = polyOffset[e]!;
    for (let d = 0; d < n; d++) {
      const cell = f[2 + d]!;
      const comma = cell.indexOf(",");
      polyLon[w] = Number(cell.slice(0, comma));
      polyLat[w] = Number(cell.slice(comma + 1));
      w++;
    }
  }

  const census = JSON.parse(readFileSync(join(dumpDir, "census.json"), "utf8")) as GraphCensus;
  const corrections = readCorrections(join(dumpDir, "corrections.tsv"), census);

  return {
    nodeCount,
    edgeCount,
    nodeId,
    nodeLon,
    nodeLat,
    edgeFrom,
    edgeTo,
    edgeLengthM,
    edgeNCoords,
    edgeLabel,
    csrOffset,
    csrEntry,
    polyOffset,
    polyLon,
    polyLat,
    census,
    corrections,
    decimalHexMismatches: { nodes: nodeMismatch, edgeLengths: lengthMismatch },
  };
}

/**
 * Read the full-precision correction census and check it against the rounded
 * copy in `census.json` (which is the form the archived `simulation.json`
 * manifests carry, so it is the comparability anchor).
 *
 * Full precision is what ships. That is not cosmetic: raw encampment
 * coordinates in the source feed are 6-decimal-place values, and no exported
 * street-node coordinate round-trips at 6 dp (census `node_roundtrip_6dp: 0`).
 * Shipping corrections at full precision therefore means **no public graph asset
 * contains a 6 dp coordinate literal at all**, which is what lets
 * `deploy-check.ts` use strict single-component matching without a
 * false-positive allowlist.
 */
function readCorrections(path: string, census: GraphCensus): readonly GraphCorrection[] {
  const lines = dataLines(readFileSync(path, "utf8"));
  const out: GraphCorrection[] = [];
  for (const line of lines) {
    const f = line.split("\t");
    const kind = f[0];
    if (kind !== "SPLIT" && kind !== "REATTACHED") {
      throw new Error(`corrections.tsv: unknown correction kind '${String(kind)}'`);
    }
    out.push({
      kind,
      attr_node_id: Number(f[1]),
      graph_node_id: Number(f[2]),
      dist_from_primary_m: Number(f[3]),
      lon: Number(f[4]),
      lat: Number(f[5]),
      claims: Number(f[6]),
      first_feature: f[7] ?? "",
    });
  }
  const rounded = census["corrections"] as readonly GraphCorrection[] | undefined;
  if (rounded !== undefined) {
    if (rounded.length !== out.length) {
      throw new Error(`corrections.tsv has ${out.length} records but census.json has ${rounded.length}`);
    }
    for (let i = 0; i < out.length; i++) {
      const a = out[i]!;
      const b = rounded[i]!;
      const same =
        a.kind === b.kind &&
        a.attr_node_id === b.attr_node_id &&
        a.graph_node_id === b.graph_node_id &&
        a.claims === b.claims &&
        a.first_feature === b.first_feature &&
        Math.abs(a.lon - b.lon) <= 5e-7 &&
        Math.abs(a.lat - b.lat) <= 5e-7 &&
        Math.abs(a.dist_from_primary_m - b.dist_from_primary_m) <= 0.05 + 1e-9;
      if (!same) {
        throw new Error(
          `correction[${i}] disagrees between corrections.tsv and census.json:\n` +
            `  tsv   =${JSON.stringify(a)}\n  census=${JSON.stringify(b)}`,
        );
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// packing
// ---------------------------------------------------------------------------

export interface PackedAsset {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly brotli: number | null;
}

export interface PackGraphResult {
  readonly assets: readonly PackedAsset[];
  readonly dump: GraphDump;
  readonly interiorVertexCount: number;
  readonly endpointExceptions: number;
  readonly uniqueNames: number;
}

/** The census with its rounded `corrections` copy removed (see `packGraph`). */
function withoutCorrections(census: GraphCensus): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(census)) {
    if (k !== "corrections") {
      out[k] = v;
    }
  }
  return out;
}

/** Build the three containers in memory. Pure: same dump → identical bytes. */
export function packGraph(dump: GraphDump, options: { readonly brotli?: boolean } = {}): PackGraphResult {
  const wantBrotli = options.brotli !== false;
  const {
    nodeCount,
    edgeCount,
    nodeId,
    nodeLon,
    nodeLat,
    edgeFrom,
    edgeTo,
    edgeLengthM,
    csrOffset,
    csrEntry,
    polyOffset,
    polyLon,
    polyLat,
    census,
    corrections,
  } = dump;

  // ---- topology (eager) ----------------------------------------------------
  const topologySections: SectionInput[] = [
    // ids are strictly ascending, so delta+varint costs ~0.012 MB br vs 0.34 raw
    i32Section("node_id", nodeId, "varint-delta-zigzag"),
    f64Section("node_lon", nodeLon),
    f64Section("node_lat", nodeLat),
    i32Section("edge_from", edgeFrom),
    i32Section("edge_to", edgeTo),
    f64Section("edge_length_m", edgeLengthM),
    i32Section("csr_offset", csrOffset),
    i32Section("csr_entry", csrEntry),
    // The census ships without its `corrections` array: that array is carried by
    // `corrections_json` at full precision, and keeping the exporter's rounded
    // copy as well would (a) duplicate the one record set the provenance screen
    // reads and (b) put 6-decimal-place coordinate literals into a public asset,
    // which is the one text shape a raw campsite coordinate can take. See
    // `readCorrections` and `deploy-check.ts`.
    utf8Section("census_json", JSON.stringify(withoutCorrections(census))),
    utf8Section("corrections_json", JSON.stringify(corrections)),
  ];
  const topology = buildContainer(
    "topology",
    { nodes: nodeCount, edges: edgeCount, csr_entries: csrEntry.length },
    topologySections,
    sha256,
  );

  // ---- geometry (lazy): interior vertices + endpoint exceptions -------------
  const interiorTotal = polyOffset[edgeCount]! - 2 * edgeCount;
  const interiorOffset = new Int32Array(edgeCount + 1);
  const interiorLon = new Float64Array(interiorTotal);
  const interiorLat = new Float64Array(interiorTotal);
  const excEdge: number[] = [];
  const excEnd: number[] = [];
  const excLon: number[] = [];
  const excLat: number[] = [];
  let ip = 0;
  for (let e = 0; e < edgeCount; e++) {
    interiorOffset[e] = ip;
    const a = polyOffset[e]!;
    const b = polyOffset[e + 1]! - 1;
    if (polyLon[a] !== nodeLon[edgeFrom[e]!] || polyLat[a] !== nodeLat[edgeFrom[e]!]) {
      excEdge.push(e);
      excEnd.push(0);
      excLon.push(polyLon[a]!);
      excLat.push(polyLat[a]!);
    }
    if (polyLon[b] !== nodeLon[edgeTo[e]!] || polyLat[b] !== nodeLat[edgeTo[e]!]) {
      excEdge.push(e);
      excEnd.push(1);
      excLon.push(polyLon[b]!);
      excLat.push(polyLat[b]!);
    }
    for (let v = a + 1; v < b; v++) {
      interiorLon[ip] = polyLon[v]!;
      interiorLat[ip] = polyLat[v]!;
      ip++;
    }
  }
  interiorOffset[edgeCount] = ip;
  if (ip !== interiorTotal) {
    throw new Error(`interior vertex count ${ip} != expected ${interiorTotal}`);
  }
  const geometry = buildContainer(
    "geometry",
    { edges: edgeCount, interior_vertices: interiorTotal, endpoint_exceptions: excEdge.length },
    [
      i32Section("poly_interior_offset", interiorOffset),
      f64Section("poly_interior_lon", interiorLon),
      f64Section("poly_interior_lat", interiorLat),
      i32Section("poly_exception_edge", Int32Array.from(excEdge)),
      i32Section("poly_exception_end", Int32Array.from(excEnd)),
      f64Section("poly_exception_lon", Float64Array.from(excLon)),
      f64Section("poly_exception_lat", Float64Array.from(excLat)),
    ],
    sha256,
  );

  // ---- names (lazy): dictionary + per-edge index ---------------------------
  const nameIds = new Map<string, number>();
  const nameTable: string[] = [];
  const nameIndex = new Int32Array(edgeCount);
  for (let e = 0; e < edgeCount; e++) {
    const label = dump.edgeLabel[e] ?? "";
    if (label.includes("\n")) {
      throw new Error(`edge ${e} label contains a newline, which the name table uses as its separator`);
    }
    let id = nameIds.get(label);
    if (id === undefined) {
      id = nameTable.length;
      nameIds.set(label, id);
      nameTable.push(label);
    }
    nameIndex[e] = id;
  }
  const names = buildContainer(
    "names",
    { edges: edgeCount, unique_names: nameTable.length },
    [i32Section("edge_name_index", nameIndex), utf8Section("name_table", nameTable.join("\n"))],
    sha256,
  );

  const pack = (name: string, bytes: Uint8Array): PackedAsset => ({
    name,
    bytes,
    sha256: sha256(bytes),
    brotli: wantBrotli ? brotliSize(bytes) : null,
  });

  return {
    assets: [
      pack("graph-topology.bin", topology),
      pack("graph-geometry.bin", geometry),
      pack("graph-names.bin", names),
    ],
    dump,
    interiorVertexCount: interiorTotal,
    endpointExceptions: excEdge.length,
    uniqueNames: nameTable.length,
  };
}

/** brotli q11 / lgwin 24 — the wire encoding DR-S2 measured the budget against. */
export function brotliSize(bytes: Uint8Array): number {
  return brotliCompress(bytes).length;
}

export function brotliCompress(bytes: Uint8Array): Buffer {
  return brotliCompressSync(bytes, {
    params: {
      [ZLIB.BROTLI_PARAM_QUALITY]: 11,
      [ZLIB.BROTLI_PARAM_LGWIN]: 24,
      [ZLIB.BROTLI_PARAM_SIZE_HINT]: bytes.length,
    },
  });
}

// ---------------------------------------------------------------------------
// verification — run on every pack, not only in tests
// ---------------------------------------------------------------------------

export interface PackVerification {
  readonly edgeLengthBitsChecked: number;
  readonly edgeLengthBitMismatches: number;
  readonly nodeCoordBitMismatches: number;
  readonly polylineVertexMismatches: number;
  readonly nameMismatches: number;
  readonly components: number;
  readonly largestComponent: number;
  readonly topologyBrotliBytes: number | null;
}

/**
 * Round-trip the packed bytes through the shared unpacker and assert the result
 * is the dump again — every edge length compared as raw IEEE-754 bits.
 */
export function verifyPack(result: PackGraphResult): PackVerification {
  const [topoAsset, geomAsset, nameAsset] = result.assets;
  if (topoAsset === undefined || geomAsset === undefined || nameAsset === undefined) {
    throw new Error("verifyPack: expected three packed assets");
  }
  const dump = result.dump;
  const topo = unpackTopology(topoAsset.bytes);

  if (topo.nodeCount !== dump.nodeCount || topo.edgeCount !== dump.edgeCount) {
    throw new Error("verifyPack: node/edge counts changed through the round trip");
  }

  let lengthMismatch = 0;
  for (let e = 0; e < dump.edgeCount; e++) {
    if (doubleToBits(topo.edgeLengthM[e]!) !== doubleToBits(dump.edgeLengthM[e]!)) {
      lengthMismatch++;
    }
  }
  let coordMismatch = 0;
  for (let i = 0; i < dump.nodeCount; i++) {
    if (
      doubleToBits(topo.nodeLon[i]!) !== doubleToBits(dump.nodeLon[i]!) ||
      doubleToBits(topo.nodeLat[i]!) !== doubleToBits(dump.nodeLat[i]!) ||
      topo.nodeId[i] !== dump.nodeId[i]
    ) {
      coordMismatch++;
    }
  }
  for (let i = 0; i < dump.csrEntry.length; i++) {
    if (topo.csrEntry[i] !== dump.csrEntry[i]) {
      throw new Error(`verifyPack: CSR entry ${i} changed through the round trip`);
    }
  }
  for (let i = 0; i <= dump.nodeCount; i++) {
    if (topo.csrOffset[i] !== dump.csrOffset[i]) {
      throw new Error(`verifyPack: CSR offset ${i} changed through the round trip`);
    }
  }
  for (let e = 0; e < dump.edgeCount; e++) {
    if (topo.edgeFrom[e] !== dump.edgeFrom[e] || topo.edgeTo[e] !== dump.edgeTo[e]) {
      throw new Error(`verifyPack: edge ${e} endpoints changed through the round trip`);
    }
  }

  const geom = unpackGeometry(geomAsset.bytes, topo);
  let polyMismatch = 0;
  if (geom.vertexCount !== dump.polyOffset[dump.edgeCount]!) {
    throw new Error("verifyPack: polyline vertex total changed through the round trip");
  }
  for (let e = 0; e <= dump.edgeCount; e++) {
    if (geom.polyOffset[e] !== dump.polyOffset[e]) {
      throw new Error(`verifyPack: polyline offset ${e} changed through the round trip`);
    }
  }
  for (let v = 0; v < geom.vertexCount; v++) {
    if (
      doubleToBits(geom.polyLon[v]!) !== doubleToBits(dump.polyLon[v]!) ||
      doubleToBits(geom.polyLat[v]!) !== doubleToBits(dump.polyLat[v]!)
    ) {
      polyMismatch++;
    }
  }

  const names = unpackNames(nameAsset.bytes);
  let nameMismatch = 0;
  for (let e = 0; e < dump.edgeCount; e++) {
    if (names.names[names.nameIndex[e]!] !== dump.edgeLabel[e]) {
      nameMismatch++;
    }
  }

  const cc = componentCensus(topo);

  return {
    edgeLengthBitsChecked: dump.edgeCount,
    edgeLengthBitMismatches: lengthMismatch,
    nodeCoordBitMismatches: coordMismatch,
    polylineVertexMismatches: polyMismatch,
    nameMismatches: nameMismatch,
    components: cc.components,
    largestComponent: cc.largest,
    topologyBrotliBytes: topoAsset.brotli,
  };
}

/** Fail the build unless the packed census is the established production graph. */
export function assertProductionCensus(census: GraphCensus, cc: { components: number; largest: number }): void {
  const problems: string[] = [];
  const check = (label: string, actual: unknown, expected: number): void => {
    if (actual !== expected) {
      problems.push(`${label}: packed ${String(actual)} != expected ${expected}`);
    }
  };
  check("final_graph_nodes", census.final_graph_nodes, EXPECTED_CENSUS.final_graph_nodes);
  check("undirected_street_edges", census.undirected_street_edges, EXPECTED_CENSUS.undirected_street_edges);
  check("components", census.components, EXPECTED_CENSUS.components);
  check("largest_component_nodes", census.largest_component_nodes, EXPECTED_CENSUS.largest_component_nodes);
  check("affected_attr_node_ids", census.affected_attr_node_ids, EXPECTED_CENSUS.affected_attr_node_ids);
  check("sites_reattached", census.sites_reattached, EXPECTED_CENSUS.sites_reattached);
  check("sites_split_synthetic", census.sites_split_synthetic, EXPECTED_CENSUS.sites_split_synthetic);
  // recomputed from the packed CSR, not read from the census
  check("components (recomputed from packed CSR)", cc.components, EXPECTED_CENSUS.components);
  check("largest component (recomputed from packed CSR)", cc.largest, EXPECTED_CENSUS.largest_component_nodes);
  if (problems.length > 0) {
    throw new Error(
      `pack-graph: census check failed — the post-U-27 production graph is ` +
        `88,100 / 109,434 / 171 / 59,725 / 25 / 3 / 22 (DR-S2).\n  ${problems.join("\n  ")}`,
    );
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HERE = fileURLToPath(new URL(".", import.meta.url));
const PIPELINE_ROOT = resolve(HERE, "..");

export const DEFAULT_DUMP_DIR = join(PIPELINE_ROOT, "out", "graph-dump");
export const DEFAULT_ASSET_DIR = join(PIPELINE_ROOT, "out", "assets");

function main(argv: readonly string[]): number {
  const arg = (flag: string, fallback: string): string => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : fallback;
  };
  const dumpDir = resolve(arg("--dump", DEFAULT_DUMP_DIR));
  const outDir = resolve(arg("--out", DEFAULT_ASSET_DIR));
  const wantBrotli = !argv.includes("--no-brotli");
  const strictCensus = !argv.includes("--no-census-check");

  process.stdout.write(`pack-graph: reading ${dumpDir}\n`);
  const t0 = Date.now();
  const dump = readGraphDump(dumpDir);
  process.stdout.write(
    `  ${dump.nodeCount} nodes, ${dump.edgeCount} edges, ` +
      `${dump.polyOffset[dump.edgeCount]!} polyline vertices (${Date.now() - t0} ms)\n`,
  );
  if (dump.decimalHexMismatches.nodes !== 0 || dump.decimalHexMismatches.edgeLengths !== 0) {
    process.stderr.write(
      `pack-graph: FATAL decimal/hex disagreement in the dump ` +
        `(nodes ${dump.decimalHexMismatches.nodes}, edge lengths ${dump.decimalHexMismatches.edgeLengths})\n`,
    );
    return 1;
  }

  const packed = packGraph(dump, { brotli: wantBrotli });
  const verification = verifyPack(packed);

  if (
    verification.edgeLengthBitMismatches !== 0 ||
    verification.nodeCoordBitMismatches !== 0 ||
    verification.polylineVertexMismatches !== 0 ||
    verification.nameMismatches !== 0
  ) {
    process.stderr.write(`pack-graph: FATAL round trip is lossy: ${JSON.stringify(verification)}\n`);
    return 1;
  }
  if (strictCensus) {
    assertProductionCensus(dump.census, {
      components: verification.components,
      largest: verification.largestComponent,
    });
  }

  mkdirSync(outDir, { recursive: true });
  const manifestRows: Record<string, unknown>[] = [];
  for (const asset of packed.assets) {
    const path = join(outDir, asset.name);
    writeFileSync(path, asset.bytes);
    let brotliBytes: number | null = null;
    if (wantBrotli) {
      const compressed = brotliCompress(asset.bytes);
      // The .br sidecar is what a `Content-Encoding: br` host serves, so it is
      // the file the browser actually parses. Prove it decodes back to the
      // asset we verified rather than assuming the compressor is honest.
      const roundTrip = brotliDecompressSync(compressed);
      if (roundTrip.length !== asset.bytes.length || sha256(roundTrip) !== asset.sha256) {
        process.stderr.write(`pack-graph: FATAL ${asset.name}.br does not decompress to ${asset.name}\n`);
        return 1;
      }
      writeFileSync(`${path}.br`, compressed);
      brotliBytes = compressed.length;
    }
    manifestRows.push({ name: asset.name, bytes: asset.bytes.length, brotli_bytes: brotliBytes, sha256: asset.sha256 });
    process.stdout.write(
      `  wrote ${basename(path)}  ${mb(asset.bytes.length)} raw` +
        (brotliBytes === null ? "" : `  ${mb(brotliBytes)} brotli`) +
        `  sha256=${asset.sha256.slice(0, 12)}…\n`,
    );
  }

  const topologyBrotli = manifestRows[0]?.["brotli_bytes"];
  if (typeof topologyBrotli === "number") {
    const budget = 3 * 1024 * 1024;
    process.stdout.write(
      `\ntopology wire budget: ${mb(topologyBrotli)} brotli vs 3 MB — ` +
        `${topologyBrotli <= budget ? "PASS" : "FAIL"}\n`,
    );
    if (topologyBrotli > budget) {
      return 1;
    }
  }
  process.stdout.write(
    `edge lengths bit-exact through pack/unpack: ${verification.edgeLengthBitsChecked - verification.edgeLengthBitMismatches}` +
      `/${verification.edgeLengthBitsChecked}\n` +
      `census (recomputed from packed CSR): ${verification.components} components, ` +
      `largest ${verification.largestComponent}\n` +
      `interior vertices ${packed.interiorVertexCount}, endpoint exceptions ${packed.endpointExceptions}, ` +
      `unique street names ${packed.uniqueNames}\n`,
  );

  // The build report is NOT a publishable asset — it quotes the full census
  // including the rounded correction coordinates — so it lands beside the asset
  // directory, never inside it, where deploy-check would (correctly) flag it.
  const reportPath = join(resolve(outDir, ".."), "graph-assets.report.json");
  writeFileSync(
    reportPath,
    `${JSON.stringify({ dumpDir, assets: manifestRows, verification, census: dump.census }, null, 2)}\n`,
  );
  process.stdout.write(`report: ${reportPath}\n`);
  return 0;
}

function mb(n: number): string {
  return `${(n / 1048576).toFixed(3)} MB`;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
