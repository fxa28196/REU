// SPIKE S2 -- wire-size measurement for the exported certified graph.
//
// Reads websim/pipeline/out/graph-dump/*.tsv, verifies the decimal<->hex
// round-trip of every exported double, packs several candidate binary layouts
// and measures gzip + brotli for each. No engine code lives here; this exists
// only to answer "does the corrected graph fit the <= 3 MB brotli budget".
//
//   node websim/pipeline/scripts/measure-graph-wire.mjs [dumpDir]

import { readFileSync, writeFileSync, statSync, readdirSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync, brotliCompressSync, brotliDecompressSync, constants as Z } from 'node:zlib';

const dumpDir = resolve(process.argv[2] ?? join(import.meta.dirname, '..', 'out', 'graph-dump'));
const outDir = resolve(join(import.meta.dirname, '..', 'out', 'wire'));
mkdirSync(outDir, { recursive: true });

const MB = (n) => (n / 1048576).toFixed(3) + ' MB';
const KB = (n) => (n / 1024).toFixed(1) + ' KB';

// ---- hex float parser (verifies Double.toString round-trip) ----------------
function hexFloat(s) {
  let i = 0, sign = 1;
  if (s[i] === '-') { sign = -1; i++; } else if (s[i] === '+') { i++; }
  if (s.slice(i, i + 2) !== '0x') throw new Error('not hex float: ' + s);
  i += 2;
  const p = s.indexOf('p', i);
  const mant = s.slice(i, p);
  const exp = parseInt(s.slice(p + 1), 10);
  const dot = mant.indexOf('.');
  const lead = dot < 0 ? mant : mant.slice(0, dot);
  const frac = dot < 0 ? '' : mant.slice(dot + 1);
  // lead is "0" (subnormal) or "1"; frac has <= 13 hex digits => exact in f64
  let v = parseInt(lead, 16);
  if (frac.length) v += parseInt(frac, 16) / Math.pow(16, frac.length);
  return sign * v * Math.pow(2, exp);
}

const t0 = Date.now();

// ---- nodes ------------------------------------------------------------------
const nodeLines = readFileSync(join(dumpDir, 'nodes.tsv'), 'utf8').split('\n');
const nNodes = nodeLines.filter((l, i) => i > 0 && l.length).length;
const nodeId = new Int32Array(nNodes);
const nodeLon = new Float64Array(nNodes);
const nodeLat = new Float64Array(nNodes);
const nodeIndex = new Map();
let hexMismatch = 0, k = 0;
for (let i = 1; i < nodeLines.length; i++) {
  const l = nodeLines[i];
  if (!l.length) continue;
  const f = l.split('\t');
  const id = Number(f[0]);
  const lon = Number(f[1]), lat = Number(f[2]);
  if (lon !== hexFloat(f[3]) || lat !== hexFloat(f[4])) hexMismatch++;
  nodeId[k] = id; nodeLon[k] = lon; nodeLat[k] = lat;
  nodeIndex.set(id, k);
  k++;
}

// ---- edges ------------------------------------------------------------------
const edgeLines = readFileSync(join(dumpDir, 'edges.tsv'), 'utf8').split('\n');
const nEdges = edgeLines.filter((l, i) => i > 0 && l.length).length;
const edgeFrom = new Int32Array(nEdges);
const edgeTo = new Int32Array(nEdges);
const edgeLen = new Float64Array(nEdges);
const edgeNCoords = new Int32Array(nEdges);
const names = [];
let lenHexMismatch = 0;
k = 0;
for (let i = 1; i < edgeLines.length; i++) {
  const l = edgeLines[i];
  if (!l.length) continue;
  const f = l.split('\t');
  const len = Number(f[4]);
  if (len !== hexFloat(f[3])) lenHexMismatch++;
  edgeFrom[k] = nodeIndex.get(Number(f[1]));
  edgeTo[k] = nodeIndex.get(Number(f[2]));
  edgeLen[k] = len;
  edgeNCoords[k] = Number(f[5]);
  names.push(f[6] ?? '');
  k++;
}

// ---- adjacency (CSR, entries in certified feature order) --------------------
const adjLines = readFileSync(join(dumpDir, 'adjacency.tsv'), 'utf8').split('\n');
const csrOffset = new Int32Array(nNodes + 1);
const csrEntry = new Int32Array(2 * nEdges);
let ptr = 0, row = 0;
for (let i = 1; i < adjLines.length; i++) {
  const l = adjLines[i];
  if (!l.length) continue;
  const f = l.split('\t');
  csrOffset[row] = ptr;
  const deg = Number(f[1]);
  for (let d = 0; d < deg; d++) {
    const [idx, dir] = f[2 + d].split(':');
    // signed 1-based edge id: +e forward (from->to), -e reversed
    csrEntry[ptr++] = dir === '+' ? Number(idx) + 1 : -(Number(idx) + 1);
  }
  row++;
}
csrOffset[nNodes] = ptr;

// ---- polylines --------------------------------------------------------------
const polyRaw = readFileSync(join(dumpDir, 'polylines.tsv'), 'utf8');
const polyLines = polyRaw.split('\n');
const polyOffset = new Int32Array(nEdges + 1);
let vTotal = 0;
for (let i = 0; i < nEdges; i++) { polyOffset[i] = vTotal; vTotal += edgeNCoords[i]; }
polyOffset[nEdges] = vTotal;
const polyLon = new Float64Array(vTotal);
const polyLat = new Float64Array(vTotal);
let vp = 0, endpointsExact = 0, endpointsTotal = 0;
k = 0;
for (let i = 1; i < polyLines.length; i++) {
  const l = polyLines[i];
  if (!l.length) continue;
  const f = l.split('\t');
  const n = Number(f[1]);
  for (let d = 0; d < n; d++) {
    const c = f[2 + d];
    const comma = c.indexOf(',');
    polyLon[vp] = Number(c.slice(0, comma));
    polyLat[vp] = Number(c.slice(comma + 1));
    vp++;
  }
  // does the polyline endpoint coincide bit-exactly with its resolved node?
  const a = polyOffset[k], b = polyOffset[k] + n - 1;
  endpointsTotal += 2;
  if (polyLon[a] === nodeLon[edgeFrom[k]] && polyLat[a] === nodeLat[edgeFrom[k]]) endpointsExact++;
  if (polyLon[b] === nodeLon[edgeTo[k]] && polyLat[b] === nodeLat[edgeTo[k]]) endpointsExact++;
  k++;
}

console.log(`parsed in ${Date.now() - t0} ms: ${nNodes} nodes, ${nEdges} edges, ${vTotal} vertices`);
console.log(`decimal<->hex mismatches: nodes ${hexMismatch}, edge lengths ${lenHexMismatch} (expected 0/0)`);
console.log(`polyline endpoints bit-equal to their resolved node coord: ${endpointsExact}/${endpointsTotal}`);

// ---- packing helpers --------------------------------------------------------
const bytes = (ta) => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength);

/** byte-plane transpose (a.k.a. shuffle filter): plane j gets byte j of each element. */
function shuffle(buf, width) {
  const n = buf.length / width;
  const out = Buffer.allocUnsafe(buf.length);
  for (let j = 0; j < width; j++) {
    const base = j * n;
    for (let i = 0; i < n; i++) out[base + i] = buf[i * width + j];
  }
  return out;
}

function varintDeltaZigzag(arr) {
  const out = [];
  let prev = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - prev; prev = arr[i];
    let z = d < 0 ? (-d * 2 - 1) : d * 2;
    while (z >= 128) { out.push((z & 127) | 128); z = Math.floor(z / 128); }
    out.push(z);
  }
  return Buffer.from(out);
}

const br = (b, q = 11) => brotliCompressSync(b, {
  params: { [Z.BROTLI_PARAM_QUALITY]: q, [Z.BROTLI_PARAM_LGWIN]: 24, [Z.BROTLI_PARAM_SIZE_HINT]: b.length },
});
const gz = (b) => gzipSync(b, { level: 9 });

const rows = [];
function measure(label, buf, note = '') {
  const t = Date.now();
  const b = br(buf);
  rows.push({ label, raw: buf.length, gzip: gz(buf).length, brotli: b.length, ms: Date.now() - t, note });
  return b.length;
}

// ---- candidate sections -----------------------------------------------------
measure('node ids (int32 raw)', bytes(nodeId));
measure('node ids (varint delta, sorted)', varintDeltaZigzag(Array.from(nodeId)));
measure('node lon+lat (float64 raw)', Buffer.concat([bytes(nodeLon), bytes(nodeLat)]));
measure('node lon+lat (float64 byte-shuffled)',
  Buffer.concat([shuffle(bytes(nodeLon), 8), shuffle(bytes(nodeLat), 8)]));
measure('edge from/to (int32 node index)', Buffer.concat([bytes(edgeFrom), bytes(edgeTo)]));
measure('edge lengths (float64 raw)', bytes(edgeLen));
measure('edge lengths (float64 byte-shuffled)', shuffle(bytes(edgeLen), 8));
measure('CSR offsets+entries (int32)', Buffer.concat([bytes(csrOffset), bytes(csrEntry)]));
measure('polyline offsets (int32)', bytes(polyOffset));
measure('polyline verts (float64 raw)', Buffer.concat([bytes(polyLon), bytes(polyLat)]));
measure('polyline verts (float64 byte-shuffled)',
  Buffer.concat([shuffle(bytes(polyLon), 8), shuffle(bytes(polyLat), 8)]), 'lossless');

// lossy display variant: int32 @1e-7 deg, delta+zigzag varint within each polyline
const qLon = new Int32Array(vTotal), qLat = new Int32Array(vTotal);
let maxErrDegLon = 0, maxErrDegLat = 0;
for (let i = 0; i < vTotal; i++) {
  qLon[i] = Math.round(polyLon[i] * 1e7);
  qLat[i] = Math.round(polyLat[i] * 1e7);
  maxErrDegLon = Math.max(maxErrDegLon, Math.abs(qLon[i] / 1e7 - polyLon[i]));
  maxErrDegLat = Math.max(maxErrDegLat, Math.abs(qLat[i] / 1e7 - polyLat[i]));
}
const qBuf = [];
for (let e = 0; e < nEdges; e++) {
  const a = polyOffset[e], b = polyOffset[e + 1];
  qBuf.push(varintDeltaZigzag(Array.from(qLon.subarray(a, b))));
  qBuf.push(varintDeltaZigzag(Array.from(qLat.subarray(a, b))));
}
measure('polyline verts (int32 1e-7 delta varint) [LOSSY]', Buffer.concat(qBuf),
  `max err ${(maxErrDegLat * 111320).toFixed(4)} m lat / ${(maxErrDegLon * 78710).toFixed(4)} m lon`);

// name table (display only)
measure('street name table (utf8, per-edge)', Buffer.from(names.join('\n'), 'utf8'));

// ---- bundles ----------------------------------------------------------------
const topology = Buffer.concat([
  bytes(nodeId), bytes(nodeLon), bytes(nodeLat),
  bytes(edgeFrom), bytes(edgeTo), bytes(edgeLen),
  bytes(csrOffset), bytes(csrEntry),
]);
const topologyShuffled = Buffer.concat([
  varintDeltaZigzag(Array.from(nodeId)), shuffle(bytes(nodeLon), 8), shuffle(bytes(nodeLat), 8),
  bytes(edgeFrom), bytes(edgeTo), shuffle(bytes(edgeLen), 8),
  bytes(csrOffset), bytes(csrEntry),
]);
const polyLossless = Buffer.concat([bytes(polyOffset), shuffle(bytes(polyLon), 8), shuffle(bytes(polyLat), 8)]);
const polyLossy = Buffer.concat([bytes(polyOffset), ...qBuf]);

measure('BUNDLE A: topology only (naive f64)', topology);
const brTopo = measure('BUNDLE B: topology only (shuffled+varint)', topologyShuffled);
const brPolyLossless = measure('BUNDLE C: polylines lossless (shuffled f64)', polyLossless);
const brPolyLossy = measure('BUNDLE D: polylines lossy int32 1e-7', polyLossy);
measure('BUNDLE E: B + C (everything, lossless)', Buffer.concat([topologyShuffled, polyLossless]));
measure('BUNDLE F: B + D (topology exact, display quantised)', Buffer.concat([topologyShuffled, polyLossy]));

// ---- refinement 1: spatial (Morton) node order ------------------------------
// Node INDEX assignment is ours to choose; ordering spatially makes the high
// bytes of the float64 planes locally constant.
const morton = (x, y) => {
  let r = 0n, X = BigInt(x >>> 0), Y = BigInt(y >>> 0);
  for (let b = 0n; b < 32n; b++) r |= ((X >> b) & 1n) << (2n * b) | ((Y >> b) & 1n) << (2n * b + 1n);
  return r;
};
const perm = Array.from({ length: nNodes }, (_, i) => i);
const mkey = new Array(nNodes);
for (let i = 0; i < nNodes; i++) {
  mkey[i] = morton(Math.round((nodeLon[i] + 180) * 1e6), Math.round((nodeLat[i] + 90) * 1e6));
}
perm.sort((a, b) => (mkey[a] < mkey[b] ? -1 : mkey[a] > mkey[b] ? 1 : 0));
const sLon = new Float64Array(nNodes), sLat = new Float64Array(nNodes), sId = new Int32Array(nNodes);
for (let i = 0; i < nNodes; i++) { sLon[i] = nodeLon[perm[i]]; sLat[i] = nodeLat[perm[i]]; sId[i] = nodeId[perm[i]]; }
measure('node lon+lat (float64 shuffled, MORTON order)',
  Buffer.concat([shuffle(bytes(sLon), 8), shuffle(bytes(sLat), 8)]));
measure('node ids (int32 raw, MORTON order)', bytes(sId));

// ---- refinement 2: interior-only polylines ---------------------------------
// 218,860 of 218,868 polyline endpoints are bit-equal to their resolved node
// coordinate, so endpoints are reconstructible from the node table; store only
// interior vertices plus an exception list.
const interiorCount = vTotal - 2 * nEdges;
const iLon = new Float64Array(interiorCount), iLat = new Float64Array(interiorCount);
const exceptions = [];
let ip = 0;
for (let e = 0; e < nEdges; e++) {
  const a = polyOffset[e], b = polyOffset[e + 1] - 1;
  if (polyLon[a] !== nodeLon[edgeFrom[e]] || polyLat[a] !== nodeLat[edgeFrom[e]]) exceptions.push([e, 0, polyLon[a], polyLat[a]]);
  if (polyLon[b] !== nodeLon[edgeTo[e]] || polyLat[b] !== nodeLat[edgeTo[e]]) exceptions.push([e, 1, polyLon[b], polyLat[b]]);
  for (let v = a + 1; v < b; v++) { iLon[ip] = polyLon[v]; iLat[ip] = polyLat[v]; ip++; }
}
measure('polyline INTERIOR verts (float64 shuffled)',
  Buffer.concat([shuffle(bytes(iLon.subarray(0, ip)), 8), shuffle(bytes(iLat.subarray(0, ip)), 8)]),
  `${ip} interior verts + ${exceptions.length} endpoint exceptions`);
const qi = [];
for (let e = 0, p = 0; e < nEdges; e++) {
  const n = edgeNCoords[e] - 2;
  if (n <= 0) continue;
  const lonSeg = [], latSeg = [];
  for (let v = 0; v < n; v++) { lonSeg.push(Math.round(iLon[p] * 1e7)); latSeg.push(Math.round(iLat[p] * 1e7)); p++; }
  qi.push(varintDeltaZigzag(lonSeg), varintDeltaZigzag(latSeg));
}
const brInteriorLossy = measure('polyline INTERIOR verts (int32 1e-7 varint) [LOSSY]', Buffer.concat(qi));

// ---- decode-time probe (proxy for the worker parse budget) -----------------
const bundleF = br(Buffer.concat([topologyShuffled, polyLossy]));
const tD = Date.now();
const round = brotliDecompressSync(bundleF);
const tDec = Date.now() - tD;

console.log('\n| section | raw | gzip -9 | brotli q11 | note |');
console.log('|---|---|---|---|---|');
for (const r of rows) {
  console.log(`| ${r.label} | ${MB(r.raw)} | ${MB(r.gzip)} | ${MB(r.brotli)} | ${r.note} |`);
}
console.log(`\nbrotli decompress of BUNDLE F (${MB(bundleF.length)} -> ${MB(round.length)}): ${tDec} ms (node ${process.version})`);
console.log(`budget check: topology ${MB(brTopo)}; +lossless polylines = ${MB(brTopo + brPolyLossless)}; +lossy polylines = ${MB(brTopo + brPolyLossy)} vs 3 MB`);

writeFileSync(join(outDir, 'wire-measurements.json'), JSON.stringify({
  dumpDir, nNodes, nEdges, vertices: vTotal,
  hexMismatchNodes: hexMismatch, hexMismatchEdgeLengths: lenHexMismatch,
  polylineEndpointsBitEqualToNode: endpointsExact, polylineEndpointsTotal: endpointsTotal,
  quantisationMaxErrorM: { lat: maxErrDegLat * 111320, lon: maxErrDegLon * 78710 },
  brotliDecompressMs: tDec, sections: rows,
}, null, 2) + '\n');
console.log('\nwrote ' + join(outDir, 'wire-measurements.json'));

// raw dump sizes
const dumpFiles = readdirSync(dumpDir).map((f) => ({ f, size: statSync(join(dumpDir, f)).size }));
let rawTotal = 0, gzTotal = 0;
for (const d of dumpFiles) {
  rawTotal += d.size;
  gzTotal += gz(readFileSync(join(dumpDir, d.f))).length;
}
console.log(`\nraw dump: ${dumpFiles.length} files, ${MB(rawTotal)}; gzip -9 total ${MB(gzTotal)}`);
for (const d of dumpFiles) console.log(`  ${d.f}: ${KB(d.size)}`);
