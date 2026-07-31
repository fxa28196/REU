/**
 * SPIKE WP2-S3 — CSR loader for the S2 graph dump (plan §3.6 data structures).
 *
 * Reads `websim/pipeline/out/graph-dump/` (produced by the certified Java
 * exporter, DR-S2) into the exact typed-array shapes §3.6 specifies:
 *
 *   nodeId    Float64Array(N)      certified ids incl. the 22 synthetic negatives
 *   adjOffset Int32Array(N+1)      CSR row starts, node-index order
 *   adjEdge   Int32Array(2E)       feature index of each directed record
 *   adjOther  Int32Array(2E)       neighbour node index
 *   edgeLenM  Float64Array(E)      Java-authoritative bit-exact polyline length
 *
 * Adjacency entries are kept in the certified per-node list order (feature
 * order) because Dijkstra tie-breaking depends on it (PORT_MAP §1.6.1, R12).
 *
 * ALL SHARED BUFFERS: every array is backed by a SharedArrayBuffer so the
 * worker-pool benchmark hands the graph to workers with zero copy — which is
 * also what the app will do (one parse, N workers).
 *
 * Segment geometry (`segCumM`, `segAzi1`) is the §3.6 movement graft: per-edge
 * cumulative segment lengths + per-segment forward azimuths, precomputed once so
 * the tick loop's only runtime geodesic call is a single `Direct` for the final
 * partial segment.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { INVERSE_MASK_LENGTH_AZIMUTH, WGS84 } from "./geodesic.js";
import { parseJavaHexDouble, sameBits } from "./hexfloat.js";

function sharedF64(n: number): Float64Array {
  return new Float64Array(new SharedArrayBuffer(n * 8));
}
function sharedI32(n: number): Int32Array {
  return new Int32Array(new SharedArrayBuffer(n * 4));
}

export interface CsrGraph {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly directedRecords: number;
  readonly nodeId: Float64Array;
  readonly nodeLon: Float64Array;
  readonly nodeLat: Float64Array;
  readonly adjOffset: Int32Array;
  readonly adjEdge: Int32Array;
  readonly adjOther: Int32Array;
  readonly edgeLenM: Float64Array;
  readonly edgeFrom: Int32Array;
  readonly edgeTo: Int32Array;
  /** Vertex pool offsets, one row per feature; length E+1. */
  readonly polyOffset: Int32Array;
  readonly polyLon: Float64Array;
  readonly polyLat: Float64Array;
  /** Per-edge prefix sums of segment length (metres); polyOffset[e] entry is 0. */
  readonly segCumM: Float64Array;
  /** Forward azimuth of segment k -> k+1; last vertex of each edge holds NaN. */
  readonly segAzi1: Float64Array;
  /** Arrival azimuth at k+1 of segment k -> k+1 (reverse heading = azi2 + 180). */
  readonly segAzi2: Float64Array;
  readonly idToIndex: Map<number, number>;
  readonly stats: LoadStats;
}

export interface LoadStats {
  nodesParsedMs: number;
  edgesParsedMs: number;
  adjacencyParsedMs: number;
  polylinesParsedMs: number;
  segmentGeometryMs: number;
  totalMs: number;
  bytesRead: number;
  vertexCount: number;
  /** Decimal-vs-hex audits (expected 0 mismatches; DR-S2 proved round-trip exactness). */
  nodeCoordHexMismatches: number;
  edgeLengthHexMismatches: number;
  /** Our geodesic segment sum vs the Java-authoritative edge length. */
  segmentSumMaxAbsDiffM: number;
  segmentSumBitExactEdges: number;
  segmentSumWithin1eMinus9: number;
  /** Retained typed-array bytes for the graph itself. */
  graphBytes: number;
}

/** Split a whole-file string into lines, dropping comment/blank lines. */
function dataLines(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  const n = text.length;
  while (start < n) {
    let end = text.indexOf("\n", start);
    if (end === -1) end = n;
    let stop = end;
    if (stop > start && text.charCodeAt(stop - 1) === 13) stop--;
    if (stop > start && text.charCodeAt(start) !== 35 /* # */) {
      out.push(text.slice(start, stop));
    }
    start = end + 1;
  }
  return out;
}

export function loadCsrGraph(dumpDir: string, opts: { auditHex?: boolean } = {}): CsrGraph {
  const auditHex = opts.auditHex ?? true;
  const t0 = performance.now();
  let bytesRead = 0;

  // ---------------------------------------------------------------- nodes ---
  const nodesText = readFileSync(resolve(dumpDir, "nodes.tsv"), "utf8");
  bytesRead += nodesText.length;
  const nodeLines = dataLines(nodesText);
  const N = nodeLines.length;
  const nodeId = sharedF64(N);
  const nodeLon = sharedF64(N);
  const nodeLat = sharedF64(N);
  const idToIndex = new Map<number, number>();
  let nodeCoordHexMismatches = 0;
  for (let i = 0; i < N; i++) {
    const f = nodeLines[i]!.split("\t");
    const id = Number(f[0]);
    const lon = Number.parseFloat(f[1]!);
    const lat = Number.parseFloat(f[2]!);
    nodeId[i] = id;
    nodeLon[i] = lon;
    nodeLat[i] = lat;
    idToIndex.set(id, i);
    if (auditHex) {
      if (!sameBits(lon, parseJavaHexDouble(f[3]!))) nodeCoordHexMismatches++;
      if (!sameBits(lat, parseJavaHexDouble(f[4]!))) nodeCoordHexMismatches++;
    }
  }
  const tNodes = performance.now();

  // ---------------------------------------------------------------- edges ---
  const edgesText = readFileSync(resolve(dumpDir, "edges.tsv"), "utf8");
  bytesRead += edgesText.length;
  const edgeLines = dataLines(edgesText);
  const E = edgeLines.length;
  const edgeLenM = sharedF64(E);
  const edgeFrom = sharedI32(E);
  const edgeTo = sharedI32(E);
  let edgeLengthHexMismatches = 0;
  for (let e = 0; e < E; e++) {
    const f = edgeLines[e]!.split("\t");
    const idx = Number(f[0]);
    const len = Number.parseFloat(f[4]!);
    edgeLenM[idx] = len;
    edgeFrom[idx] = idToIndex.get(Number(f[1]))!;
    edgeTo[idx] = idToIndex.get(Number(f[2]))!;
    if (auditHex && !sameBits(len, parseJavaHexDouble(f[3]!))) edgeLengthHexMismatches++;
  }
  const tEdges = performance.now();

  // ------------------------------------------------------------ adjacency ---
  const adjText = readFileSync(resolve(dumpDir, "adjacency.tsv"), "utf8");
  bytesRead += adjText.length;
  const adjLines = dataLines(adjText);
  const adjOffset = sharedI32(N + 1);
  // Pass 1: degrees, in node-index order.
  for (const line of adjLines) {
    const tab1 = line.indexOf("\t");
    const tab2 = line.indexOf("\t", tab1 + 1);
    const idx = idToIndex.get(Number(line.slice(0, tab1)))!;
    adjOffset[idx + 1] = Number(tab2 === -1 ? line.slice(tab1 + 1) : line.slice(tab1 + 1, tab2));
  }
  for (let i = 0; i < N; i++) adjOffset[i + 1]! += adjOffset[i]!;
  const R = adjOffset[N]!;
  const adjEdge = sharedI32(R);
  const adjOther = sharedI32(R);
  // Pass 2: fill, preserving the certified per-node list order.
  for (const line of adjLines) {
    const parts = line.split("\t");
    const idx = idToIndex.get(Number(parts[0]))!;
    let w = adjOffset[idx]!;
    for (let k = 2; k < parts.length; k++) {
      const entry = parts[k]!;
      const c1 = entry.indexOf(":");
      const c2 = entry.indexOf(":", c1 + 1);
      adjEdge[w] = Number(entry.slice(0, c1));
      adjOther[w] = idToIndex.get(Number(entry.slice(c2 + 1)))!;
      w++;
    }
  }
  const tAdj = performance.now();

  // ------------------------------------------------------------ polylines ---
  const polyText = readFileSync(resolve(dumpDir, "polylines.tsv"), "utf8");
  bytesRead += polyText.length;
  const polyLines = dataLines(polyText);
  const polyOffset = sharedI32(E + 1);
  const rows: string[][] = new Array<string[]>(E);
  for (const line of polyLines) {
    const parts = line.split("\t");
    const e = Number(parts[0]);
    rows[e] = parts;
    polyOffset[e + 1] = Number(parts[1]);
  }
  for (let e = 0; e < E; e++) polyOffset[e + 1]! += polyOffset[e]!;
  const V = polyOffset[E]!;
  const polyLon = sharedF64(V);
  const polyLat = sharedF64(V);
  for (let e = 0; e < E; e++) {
    const parts = rows[e]!;
    let w = polyOffset[e]!;
    for (let k = 2; k < parts.length; k++) {
      const pair = parts[k]!;
      const comma = pair.indexOf(",");
      polyLon[w] = Number.parseFloat(pair.slice(0, comma));
      polyLat[w] = Number.parseFloat(pair.slice(comma + 1));
      w++;
    }
  }
  const tPoly = performance.now();

  // ------------------------------------------- segment geometry (§3.6 graft) ---
  const segCumM = sharedF64(V);
  const segAzi1 = sharedF64(V);
  const segAzi2 = sharedF64(V);
  let segmentSumMaxAbsDiffM = 0;
  let segmentSumBitExactEdges = 0;
  let segmentSumWithin1eMinus9 = 0;
  for (let e = 0; e < E; e++) {
    const lo = polyOffset[e]!;
    const hi = polyOffset[e + 1]!;
    segCumM[lo] = 0;
    let acc = 0;
    for (let k = lo; k + 1 < hi; k++) {
      const r = WGS84.Inverse(polyLat[k]!, polyLon[k]!, polyLat[k + 1]!, polyLon[k + 1]!, INVERSE_MASK_LENGTH_AZIMUTH);
      segAzi1[k] = r.azi1;
      segAzi2[k] = r.azi2;
      acc += r.s12;
      segCumM[k + 1] = acc;
    }
    segAzi1[hi - 1] = Number.NaN;
    segAzi2[hi - 1] = Number.NaN;
    const diff = Math.abs(acc - edgeLenM[e]!);
    if (diff > segmentSumMaxAbsDiffM) segmentSumMaxAbsDiffM = diff;
    if (sameBits(acc, edgeLenM[e]!)) segmentSumBitExactEdges++;
    if (diff <= 1e-9) segmentSumWithin1eMinus9++;
  }
  const tSeg = performance.now();

  const graphBytes =
    nodeId.byteLength +
    nodeLon.byteLength +
    nodeLat.byteLength +
    adjOffset.byteLength +
    adjEdge.byteLength +
    adjOther.byteLength +
    edgeLenM.byteLength +
    edgeFrom.byteLength +
    edgeTo.byteLength +
    polyOffset.byteLength +
    polyLon.byteLength +
    polyLat.byteLength +
    segCumM.byteLength +
    segAzi1.byteLength +
    segAzi2.byteLength;

  return {
    nodeCount: N,
    edgeCount: E,
    directedRecords: R,
    nodeId,
    nodeLon,
    nodeLat,
    adjOffset,
    adjEdge,
    adjOther,
    edgeLenM,
    edgeFrom,
    edgeTo,
    polyOffset,
    polyLon,
    polyLat,
    segCumM,
    segAzi1,
    segAzi2,
    idToIndex,
    stats: {
      nodesParsedMs: tNodes - t0,
      edgesParsedMs: tEdges - tNodes,
      adjacencyParsedMs: tAdj - tEdges,
      polylinesParsedMs: tPoly - tAdj,
      segmentGeometryMs: tSeg - tPoly,
      totalMs: tSeg - t0,
      bytesRead,
      vertexCount: V,
      nodeCoordHexMismatches,
      edgeLengthHexMismatches,
      segmentSumMaxAbsDiffM,
      segmentSumBitExactEdges,
      segmentSumWithin1eMinus9,
      graphBytes,
    },
  };
}

/** The SharedArrayBuffer views a worker needs to run SSSP with zero copy. */
export interface CsrTransfer {
  nodeCount: number;
  adjOffset: SharedArrayBuffer;
  adjEdge: SharedArrayBuffer;
  adjOther: SharedArrayBuffer;
  edgeLenM: SharedArrayBuffer;
}

export function toTransfer(g: CsrGraph): CsrTransfer {
  return {
    nodeCount: g.nodeCount,
    adjOffset: g.adjOffset.buffer as SharedArrayBuffer,
    adjEdge: g.adjEdge.buffer as SharedArrayBuffer,
    adjOther: g.adjOther.buffer as SharedArrayBuffer,
    edgeLenM: g.edgeLenM.buffer as SharedArrayBuffer,
  };
}

/**
 * `nearestNode` per PORT_MAP §1.6: planar Euclidean distance in DEGREES (not
 * geodesic). Brute force here — the production port uses an STRtree, but the
 * ranking metric is the load-bearing part and it is identical.
 */
export function nearestNodeIndexDegreeSpace(g: CsrGraph, lon: number, lat: number): number {
  let best = -1;
  let bestD2 = Number.POSITIVE_INFINITY;
  for (let i = 0; i < g.nodeCount; i++) {
    const dx = g.nodeLon[i]! - lon;
    const dy = g.nodeLat[i]! - lat;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}
