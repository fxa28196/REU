/**
 * SPIKE WP2-S3 — SSSP pool worker.
 *
 * Receives the CSR as SharedArrayBuffers (zero copy — one parse, N workers, the
 * shape the app will use) plus the shelter sources this worker owns and the
 * SharedArrayBuffer-backed `dist`/`predEdge` slabs it must fill. Nothing is
 * copied back: the closure wave finishes when the last worker signals done.
 */

import { parentPort, workerData } from "node:worker_threads";

import { computeTree, makeScratch } from "./dijkstra.js";

interface WorkerInput {
  nodeCount: number;
  directedRecords: number;
  adjOffset: SharedArrayBuffer;
  adjEdge: SharedArrayBuffer;
  adjOther: SharedArrayBuffer;
  edgeLenM: SharedArrayBuffer;
  distSlab: SharedArrayBuffer;
  predSlab: SharedArrayBuffer;
  sources: number[];
  slots: number[];
  blocked: SharedArrayBuffer | null;
}

const w = workerData as WorkerInput;
const adjOffset = new Int32Array(w.adjOffset);
const adjEdge = new Int32Array(w.adjEdge);
const adjOther = new Int32Array(w.adjOther);
const edgeLenM = new Float64Array(w.edgeLenM);
const blocked = w.blocked === null ? null : new Uint8Array(w.blocked);
const scratch = makeScratch(w.nodeCount, w.directedRecords);

const perTreeMs: number[] = [];
let settledTotal = 0;
const tStart = performance.now();

for (let k = 0; k < w.sources.length; k++) {
  const t0 = performance.now();
  const r = computeTree(adjOffset, adjEdge, adjOther, edgeLenM, w.sources[k]!, scratch, blocked);
  // Publish into the retained per-shelter slabs (§3.6: 46 x 88,100 x 12 B).
  const slot = w.slots[k]!;
  new Float64Array(w.distSlab, slot * w.nodeCount * 8, w.nodeCount).set(scratch.dist);
  new Int32Array(w.predSlab, slot * w.nodeCount * 4, w.nodeCount).set(scratch.predEdge);
  perTreeMs.push(performance.now() - t0);
  settledTotal += r.settled;
}

parentPort!.postMessage({
  wallMs: performance.now() - tStart,
  perTreeMs,
  settledTotal,
  trees: w.sources.length,
});
