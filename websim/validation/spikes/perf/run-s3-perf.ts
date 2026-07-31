/**
 * SPIKE WP2-S3 CLI — performance harness on the REAL graph (plan §3.6 budgets).
 *
 *   npx tsx validation/spikes/perf/run-s3-perf.ts
 *   npx tsx validation/spikes/perf/run-s3-perf.ts --stages load,sssp,pool,tick
 *   npx tsx validation/spikes/perf/run-s3-perf.ts --json validation/spikes/perf/s3-results.json
 *
 * Stages
 *   load  CSR + segment geometry from the S2 dump, with decimal-vs-hex audits
 *   sssp  46 single-threaded full-graph trees from the REAL 46 shelter sources,
 *         legacy (no closures) and post-wave (blocked-edge test per relaxation)
 *   pool  the same 46 trees across a 4-worker pool over SharedArrayBuffers
 *   tick  SoA agent tick loop: calibration at 7,000 agents, then the two
 *         budgeted workloads run END TO END rather than extrapolated
 *
 * Everything printed here is measured on this machine. Nothing is asserted.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import {
  DIRECT_MASK_JAVA_STANDARD,
  DIRECT_MASK_POSITION_ONLY,
  buildAgentPaths,
  buildAgents,
  runTicks,
  type AgentPaths,
  type TickStats,
} from "./agent-tick.js";
import { computeTree, makeScratch } from "./dijkstra.js";
import { loadCsrGraph, nearestNodeIndexDegreeSpace, type CsrGraph } from "./graph-csr.js";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, "../../../..");
const DUMP_DIR = resolve(REPO, "websim/pipeline/out/graph-dump");
const SHELTER_CSV = resolve(REPO, "Geography/data/shelters/shelters_2026_expanded_plus_new_sites.csv");

// ------------------------------------------------------------- plan budgets ---
const BUDGETS = {
  defaultPreset: { agents: 2037, hours: 312, ticksPerHour: 60, wallBudgetS: 60 },
  worstCase: { agents: 6842, hours: 455, ticksPerHour: 60, wallBudgetS: 480, waves: 6 },
  closureWaveS: 5,
  closureWaveTargetS: 1.5,
} as const;

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}
const stages = new Set((flag("--stages") ?? "load,sssp,pool,tick").split(",").map((s) => s.trim()));
const jsonOut = flag("--json") ?? resolve(here, "s3-results.json");

function mb(bytes: number): string {
  return `${(bytes / 1048576).toFixed(2)} MB`;
}
function stat(xs: number[]): { min: number; p50: number; mean: number; p95: number; max: number; sum: number } {
  const s = [...xs].sort((a, b) => a - b);
  const sum = xs.reduce((a, b) => a + b, 0);
  return {
    min: s[0]!,
    p50: s[Math.floor(s.length * 0.5)]!,
    mean: sum / s.length,
    p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]!,
    max: s[s.length - 1]!,
    sum,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const results: Record<string, any> = {
  spike: "WP2-S3 perf harness on the real graph",
  generatedUtc: new Date().toISOString(),
  host: {
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    cpu: (await import("node:os")).cpus()[0]?.model ?? "unknown",
    logicalCores: (await import("node:os")).cpus().length,
    totalMemGb: Number(((await import("node:os")).totalmem() / 1073741824).toFixed(1)),
  },
  budgets: BUDGETS,
};

// ================================================================== load ===
console.log("=== SPIKE S3 — stage: load ===");
const g: CsrGraph = loadCsrGraph(DUMP_DIR);
const ls = g.stats;
console.log(`  nodes ${g.nodeCount}  edges ${g.edgeCount}  directed records ${g.directedRecords}`);
console.log(`  polyline vertices ${ls.vertexCount}`);
console.log(
  `  parse ms: nodes ${ls.nodesParsedMs.toFixed(0)} edges ${ls.edgesParsedMs.toFixed(0)} ` +
    `adj ${ls.adjacencyParsedMs.toFixed(0)} poly ${ls.polylinesParsedMs.toFixed(0)} ` +
    `segGeom ${ls.segmentGeometryMs.toFixed(0)}  TOTAL ${ls.totalMs.toFixed(0)}`,
);
console.log(`  CSR + geometry retained: ${mb(ls.graphBytes)} (text read ${mb(ls.bytesRead)})`);
console.log(`  decimal-vs-hex mismatches: node coords ${ls.nodeCoordHexMismatches}, edge lengths ${ls.edgeLengthHexMismatches}`);
console.log(
  `  segment-sum vs Java edge length: bit-exact ${ls.segmentSumBitExactEdges}/${g.edgeCount}, ` +
    `<=1e-9 m ${ls.segmentSumWithin1eMinus9}/${g.edgeCount}, max |diff| ${ls.segmentSumMaxAbsDiffM.toExponential(3)} m`,
);
results["load"] = { ...ls, nodeCount: g.nodeCount, edgeCount: g.edgeCount, directedRecords: g.directedRecords };

// --- CSR correctness gate: components must reproduce the S2/Java census ------
const census = JSON.parse(readFileSync(resolve(DUMP_DIR, "census.json"), "utf8")) as {
  components: number;
  largest_component_nodes: number;
  final_graph_nodes: number;
  undirected_street_edges: number;
  directed_edge_records: number;
};
const comp = new Int32Array(g.nodeCount).fill(-1);
const compSizes: number[] = [];
{
  const stack = new Int32Array(g.nodeCount);
  for (let s0 = 0; s0 < g.nodeCount; s0++) {
    if (comp[s0]! >= 0) continue;
    const c = compSizes.length;
    let sp = 0;
    stack[sp++] = s0;
    comp[s0] = c;
    let size = 0;
    while (sp > 0) {
      const u = stack[--sp]!;
      size++;
      for (let k = g.adjOffset[u]!; k < g.adjOffset[u + 1]!; k++) {
        const v = g.adjOther[k]!;
        if (comp[v]! < 0) {
          comp[v] = c;
          stack[sp++] = v;
        }
      }
    }
    compSizes.push(size);
  }
}
const largest = Math.max(...compSizes);
const censusOk =
  compSizes.length === census.components &&
  largest === census.largest_component_nodes &&
  g.nodeCount === census.final_graph_nodes &&
  g.edgeCount === census.undirected_street_edges &&
  g.directedRecords === census.directed_edge_records;
console.log(
  `  CSR census gate: components ${compSizes.length}/${census.components}, ` +
    `largest ${largest}/${census.largest_component_nodes} -> ${censusOk ? "PASS" : "FAIL"}`,
);
const sortedComps = [...compSizes].sort((a, b) => b - a);
console.log(`  component sizes (top 5): ${sortedComps.slice(0, 5).join(", ")}`);
// Characterise the two dominant components — SSSP cost is component-bounded, so
// where the shelters sit is a first-order fact about the closure-wave budget.
const compOrder = compSizes.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]);
const compGeom: { size: number; bbox: number[]; centroid: number[] }[] = [];
for (const [size, c] of compOrder.slice(0, 2)) {
  let minLon = 1e9;
  let maxLon = -1e9;
  let minLat = 1e9;
  let maxLat = -1e9;
  let sl = 0;
  let sa = 0;
  let cnt = 0;
  for (let i = 0; i < g.nodeCount; i++) {
    if (comp[i] !== c) continue;
    const lo = g.nodeLon[i]!;
    const la = g.nodeLat[i]!;
    if (lo < minLon) minLon = lo;
    if (lo > maxLon) maxLon = lo;
    if (la < minLat) minLat = la;
    if (la > maxLat) maxLat = la;
    sl += lo;
    sa += la;
    cnt++;
  }
  compGeom.push({ size, bbox: [minLon, minLat, maxLon, maxLat], centroid: [sl / cnt, sa / cnt] });
  console.log(
    `    component ${size} nodes: bbox lon[${minLon.toFixed(4)}, ${maxLon.toFixed(4)}] ` +
      `lat[${minLat.toFixed(4)}, ${maxLat.toFixed(4)}] centroid ${(sl / cnt).toFixed(4)}, ${(sa / cnt).toFixed(4)}`,
  );
}
results["componentGeometry"] = compGeom;
results["csrCensusGate"] = {
  pass: censusOk,
  components: compSizes.length,
  largest,
  topComponentSizes: sortedComps.slice(0, 5),
  expected: census,
};
if (!censusOk) throw new Error("CSR census gate FAILED — the loader does not reproduce the certified graph");

// ------------------------------------------------ 46 real shelter sources ---
const shelterText = readFileSync(SHELTER_CSV, "utf8");
const shelterRows = shelterText.split(/\r?\n/).filter((l) => l.trim().length > 0);
const header = shelterRows[0]!.split(",");
const lonCol = header.indexOf("lon");
const latCol = header.indexOf("lat");
const shelterSources: number[] = [];
const shelterNames: string[] = [];
const snapGapDeg: number[] = [];
for (let r = 1; r < shelterRows.length; r++) {
  const f = shelterRows[r]!.split(",");
  const lon = Number.parseFloat(f[lonCol]!);
  const lat = Number.parseFloat(f[latCol]!);
  const idx = nearestNodeIndexDegreeSpace(g, lon, lat);
  shelterSources.push(idx);
  shelterNames.push(f[0]!);
  const dx = g.nodeLon[idx]! - lon;
  const dy = g.nodeLat[idx]! - lat;
  snapGapDeg.push(Math.hypot(dx, dy));
}
const distinctSources = new Set(shelterSources).size;
console.log(
  `  shelter sources: ${shelterSources.length} rows -> ${distinctSources} DISTINCT nodes ` +
    `(max degree-space snap gap ${Math.max(...snapGapDeg).toExponential(3)} deg)`,
);

/**
 * FINDING S3-F1: two of the 46 shelter rows snap to the SAME street node, so the
 * engine's per-shelter tree set contains a duplicate. The engine still computes
 * 46 trees (one per Shelter object). The task's benchmark asks for 46 DISTINCT
 * sources, so the collided pair is nudged to its next-nearest distinct node —
 * still a genuine shelter-adjacent node, and the harder (46-tree) workload.
 */
const usedNodes = new Set<number>();
const benchSources: number[] = [];
for (let r = 0; r < shelterSources.length; r++) {
  let idx = shelterSources[r]!;
  if (usedNodes.has(idx)) {
    const f = shelterRows[r + 1]!.split(",");
    const lon = Number.parseFloat(f[lonCol]!);
    const lat = Number.parseFloat(f[latCol]!);
    let bestD2 = Number.POSITIVE_INFINITY;
    let best = -1;
    for (let i = 0; i < g.nodeCount; i++) {
      if (usedNodes.has(i)) continue;
      const dx = g.nodeLon[i]! - lon;
      const dy = g.nodeLat[i]! - lat;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    idx = best;
  }
  usedNodes.add(idx);
  benchSources.push(idx);
}
console.log(`  benchmark sources: ${new Set(benchSources).size} distinct (collided rows nudged to next-nearest node)`);

// Which component does each shelter live in? This explains the settled-node
// spread and is the reason the archived runs carry UNREACHABLE agents at all.
const shelterCompCount = new Map<number, number>();
for (const idx of benchSources) {
  const c = comp[idx]!;
  shelterCompCount.set(c, (shelterCompCount.get(c) ?? 0) + 1);
}
const shelterCompSummary = [...shelterCompCount.entries()]
  .map(([c, n]) => ({ componentSize: compSizes[c]!, shelters: n }))
  .sort((a, b) => b.shelters - a.shelters);
console.log(
  `  shelter placement by component size: ${shelterCompSummary
    .map((x) => `${x.shelters} in a ${x.componentSize}-node component`)
    .join("; ")}`,
);
results["sources"] = {
  rows: shelterSources.length,
  distinctAfterSnap: distinctSources,
  benchmarkDistinct: new Set(benchSources).size,
  collidedRows: shelterSources.length - distinctSources,
  csv: SHELTER_CSV,
  maxSnapGapDeg: Math.max(...snapGapDeg),
  shelterNamesSample: shelterNames.slice(0, 3),
  byComponent: shelterCompSummary,
};

// ================================================================== sssp ===
const scratch = makeScratch(g.nodeCount, g.directedRecords);
let ssspLegacy: ReturnType<typeof stat> | null = null;
let ssspBlocked: ReturnType<typeof stat> | null = null;

if (stages.has("sssp")) {
  console.log("\n=== SPIKE S3 — stage: sssp (single-threaded, 46 full-graph trees) ===");
  // warm up the JIT on a source we then re-measure
  for (let k = 0; k < 3; k++) {
    computeTree(g.adjOffset, g.adjEdge, g.adjOther, g.edgeLenM, benchSources[0]!, scratch, null);
  }

  // Retain all 46 trees, as §3.6 requires for instant re-plans.
  const distSlab = new Float64Array(46 * g.nodeCount);
  const predSlab = new Int32Array(46 * g.nodeCount);
  const perTree: number[] = [];
  const settled: number[] = [];
  const relax: number[] = [];
  const stale: number[] = [];
  for (let s = 0; s < benchSources.length; s++) {
    const t0 = performance.now();
    const r = computeTree(g.adjOffset, g.adjEdge, g.adjOther, g.edgeLenM, benchSources[s]!, scratch, null);
    const dtMs = performance.now() - t0;
    distSlab.set(scratch.dist, s * g.nodeCount);
    predSlab.set(scratch.predEdge, s * g.nodeCount);
    perTree.push(dtMs);
    settled.push(r.settled);
    relax.push(r.relaxations);
    stale.push(r.stalePops);
  }
  ssspLegacy = stat(perTree);
  const st = stat(settled);
  console.log(
    `  per-tree ms: min ${ssspLegacy.min.toFixed(2)} p50 ${ssspLegacy.p50.toFixed(2)} ` +
      `mean ${ssspLegacy.mean.toFixed(2)} p95 ${ssspLegacy.p95.toFixed(2)} max ${ssspLegacy.max.toFixed(2)}`,
  );
  console.log(`  46-tree TOTAL single-threaded: ${ssspLegacy.sum.toFixed(1)} ms`);
  console.log(
    `  settled nodes/tree: min ${st.min} mean ${st.mean.toFixed(0)} max ${st.max} ` +
      `(largest component 59,725); stale pops mean ${stat(stale).mean.toFixed(0)}`,
  );
  console.log(`  retained trees: ${mb(distSlab.byteLength + predSlab.byteLength)} (plan estimate ~49 MB)`);

  // Post-wave variant: blockedAdj non-empty -> one flag test per relaxation.
  const blocked = new Uint8Array(g.edgeCount);
  const rnd = (() => {
    let s = 7 >>> 0;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  })();
  let blockedCount = 0;
  for (let e = 0; e < g.edgeCount; e++) {
    if (rnd() < 0.004) {
      blocked[e] = 1;
      blockedCount++;
    }
  }
  const perTreeB: number[] = [];
  for (let s = 0; s < benchSources.length; s++) {
    const t0 = performance.now();
    computeTree(g.adjOffset, g.adjEdge, g.adjOther, g.edgeLenM, benchSources[s]!, scratch, blocked);
    perTreeB.push(performance.now() - t0);
  }
  ssspBlocked = stat(perTreeB);
  console.log(
    `  POST-WAVE (${blockedCount} blocked features, flag test per relaxation): ` +
      `mean ${ssspBlocked.mean.toFixed(2)} ms/tree, 46-tree TOTAL ${ssspBlocked.sum.toFixed(1)} ms`,
  );
  console.log(`  mem after retaining 46 trees: rss ${mb(process.memoryUsage().rss)}`);

  // Pessimistic bound: SSSP cost is component-bounded, and 43/46 real shelters
  // sit in the 27,543-node Portland component. If a future graph fix (or an
  // OSM swap) merged the components, every tree would settle the whole 59,725+
  // regional component instead. Measure that case rather than guess it.
  const bigComp = compOrder[0]![1];
  const bigNodes: number[] = [];
  for (let i = 0; i < g.nodeCount && bigNodes.length < 46; i++) if (comp[i] === bigComp) bigNodes.push(i);
  const perTreeBig: number[] = [];
  for (const src of bigNodes) {
    const t0 = performance.now();
    computeTree(g.adjOffset, g.adjEdge, g.adjOther, g.edgeLenM, src, scratch, null);
    perTreeBig.push(performance.now() - t0);
  }
  const ssspBig = stat(perTreeBig);
  console.log(
    `  PESSIMISTIC (46 sources in the 59,725-node component): mean ${ssspBig.mean.toFixed(2)} ms/tree, ` +
      `46-tree TOTAL ${ssspBig.sum.toFixed(1)} ms`,
  );

  results["sssp"] = {
    legacyPerTreeMs: ssspLegacy,
    postWavePerTreeMs: ssspBlocked,
    blockedFeatures: blockedCount,
    settledPerTree: st,
    relaxationsPerTree: stat(relax),
    stalePopsPerTree: stat(stale),
    retainedTreeBytes: distSlab.byteLength + predSlab.byteLength,
    projectedPool4WallMs: ssspLegacy.sum / 4,
    pessimisticLargestComponentPerTreeMs: ssspBig,
  };
  console.log(
    `  PROJECTED pool-of-4 wall (perfect split): ${(ssspLegacy.sum / 4).toFixed(1)} ms legacy / ` +
      `${(ssspBlocked.sum / 4).toFixed(1)} ms post-wave`,
  );
}

// ================================================================== pool ===
if (stages.has("pool")) {
  console.log("\n=== SPIKE S3 — stage: pool (4 workers, SharedArrayBuffer CSR, zero copy) ===");
  const poolResults: Record<string, unknown> = {};
  for (const workers of [1, 2, 4, 8]) {
    const distSlab = new SharedArrayBuffer(46 * g.nodeCount * 8);
    const predSlab = new SharedArrayBuffer(46 * g.nodeCount * 4);
    const buckets: { sources: number[]; slots: number[] }[] = Array.from({ length: workers }, () => ({
      sources: [],
      slots: [],
    }));
    for (let s = 0; s < benchSources.length; s++) {
      const b = buckets[s % workers]!;
      b.sources.push(benchSources[s]!);
      b.slots.push(s);
    }
    const t0 = performance.now();
    const done = await Promise.all(
      buckets.map(
        (b) =>
          new Promise<{ wallMs: number; perTreeMs: number[]; trees: number }>((res, rej) => {
            const w = new Worker(new URL("./sssp-worker.ts", import.meta.url), {
              workerData: {
                nodeCount: g.nodeCount,
                directedRecords: g.directedRecords,
                adjOffset: g.adjOffset.buffer,
                adjEdge: g.adjEdge.buffer,
                adjOther: g.adjOther.buffer,
                edgeLenM: g.edgeLenM.buffer,
                distSlab,
                predSlab,
                sources: b.sources,
                slots: b.slots,
                blocked: null,
              },
            });
            w.on("message", (m) => {
              res(m as { wallMs: number; perTreeMs: number[]; trees: number });
              void w.terminate();
            });
            w.on("error", rej);
          }),
      ),
    );
    const wall = performance.now() - t0;
    const busiest = Math.max(...done.map((d) => d.wallMs));
    console.log(
      `  ${String(workers).padStart(2)} workers: wall ${wall.toFixed(1)} ms ` +
        `(busiest worker ${busiest.toFixed(1)} ms, spawn+transfer overhead ${(wall - busiest).toFixed(1)} ms)`,
    );
    poolResults[`workers${workers}`] = { wallMs: wall, busiestWorkerMs: busiest, perWorker: done.map((d) => d.wallMs) };
  }
  results["pool"] = poolResults;
}

// ================================================================== tick ===
if (stages.has("tick")) {
  console.log("\n=== SPIKE S3 — stage: tick (SoA agent loop on real routed paths) ===");

  // One real tree to route from; agents start at random reachable nodes.
  computeTree(g.adjOffset, g.adjEdge, g.adjOther, g.edgeLenM, benchSources[0]!, scratch, null);
  const reachable: number[] = [];
  for (let i = 0; i < g.nodeCount; i++) if (Number.isFinite(scratch.dist[i]!)) reachable.push(i);
  const PATHS = 7000;
  let s = 12345 >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const starts = new Int32Array(PATHS);
  for (let p = 0; p < PATHS; p++) starts[p] = reachable[Math.floor(rnd() * reachable.length)]!;
  const paths: AgentPaths = buildAgentPaths(g, starts, scratch.predEdge);
  console.log(
    `  routed ${PATHS} real paths in ${paths.buildMs.toFixed(0)} ms: ` +
      `${paths.vertexCount} vertices (${mb(paths.bytes)}), mean ${paths.meanVertices.toFixed(1)} verts / ` +
      `${(paths.meanLengthM / 1000).toFixed(2)} km, max ${paths.maxVertices} verts`,
  );
  results["paths"] = {
    paths: PATHS,
    buildMs: paths.buildMs,
    vertexCount: paths.vertexCount,
    bytes: paths.bytes,
    meanVertices: paths.meanVertices,
    meanLengthM: paths.meanLengthM,
    maxVertices: paths.maxVertices,
    reachableNodes: reachable.length,
  };

  // Smoke: real shape (456 hourly slices, 562.7 peak class) with a NaN gap.
  const smoke = new Float64Array(456);
  for (let h = 0; h < smoke.length; h++) {
    smoke[h] = 40 + 500 * Math.exp(-((h - 210) ** 2) / (2 * 60 ** 2));
  }
  smoke[300] = Number.NaN;

  const runOne = (
    n: number,
    ticks: number,
    geodesic: "direct" | "deferred" | "literal" | "none",
    mask: number,
    label: string,
    directEveryTicks = 60,
  ): TickStats => {
    const a = buildAgents(n, paths, 42);
    // warm up the JIT with a short pass on the same shapes
    runTicks(buildAgents(Math.min(n, 512), paths, 7), paths, {
      ticks: 200,
      minutesPerTick: 1,
      geodesic,
      directMask: mask,
      directEveryTicks,
      smokeHourly: smoke,
    });
    const st = runTicks(a, paths, {
      ticks,
      minutesPerTick: 1,
      geodesic,
      directMask: mask,
      directEveryTicks,
      smokeHourly: smoke,
    });
    console.log(
      `  ${label.padEnd(46)} ${(st.wallMs / 1000).toFixed(2)} s  ` +
        `${(st.agentTicksPerSecond / 1e6).toFixed(3)} M agent-ticks/s  ` +
        `(${st.agentTicks.toLocaleString("en-US")} agent-ticks, ${st.directCalls.toLocaleString("en-US")} Direct, ` +
        `${st.hazardEvaluations.toLocaleString("en-US")} logistics, agents SoA ${mb(a.bytes)})`,
    );
    return st;
  };

  const CAL_TICKS = 3000;
  // The literal Java movement loop, for reference: one Inverse PER VERTEX
  // consumed from the carried coordinate + an Inverse/Direct pair for the
  // partial segment (GisAgent.java 523-541). Shorter run — it is very slow.
  const calLiteral = runOne(
    7000,
    600,
    "literal",
    DIRECT_MASK_JAVA_STANDARD,
    "reference 7000 x 600 [LITERAL Java movement]",
  );
  const calDirect = runOne(7000, CAL_TICKS, "direct", DIRECT_MASK_JAVA_STANDARD, "calibration 7000 x 3000 [Direct STANDARD]");
  const calMask = runOne(7000, CAL_TICKS, "direct", DIRECT_MASK_POSITION_ONLY, "calibration 7000 x 3000 [Direct lat/lon only]");
  const calDefer30 = runOne(
    7000,
    CAL_TICKS,
    "deferred",
    DIRECT_MASK_JAVA_STANDARD,
    "calibration 7000 x 3000 [Direct every 30 ticks]",
    30,
  );
  const calDefer60 = runOne(
    7000,
    CAL_TICKS,
    "deferred",
    DIRECT_MASK_JAVA_STANDARD,
    "calibration 7000 x 3000 [Direct every 60 ticks]",
    60,
  );
  const calNone = runOne(7000, CAL_TICKS, "none", DIRECT_MASK_JAVA_STANDARD, "calibration 7000 x 3000 [no geodesic]");

  // The budgeted workloads, run end to end.
  const d = BUDGETS.defaultPreset;
  const wc = BUDGETS.worstCase;
  const fullDefault = runOne(
    d.agents,
    d.hours * d.ticksPerHour,
    "direct",
    DIRECT_MASK_JAVA_STANDARD,
    `BUDGET default ${d.agents} x ${d.hours} h`,
  );
  const fullWorst = runOne(
    wc.agents,
    wc.hours * wc.ticksPerHour,
    "direct",
    DIRECT_MASK_JAVA_STANDARD,
    `BUDGET worst-case ${wc.agents} x ${wc.hours} h`,
  );

  // Same two workloads with the ONE tuning lever that matters (see DR-S3): the
  // interpolated display coordinate is materialised at render cadence, not every
  // tick. Physics reads `travelledM` + the cumulative array, never `curLon/Lat`.
  const tunedDefault = runOne(
    d.agents,
    d.hours * d.ticksPerHour,
    "deferred",
    DIRECT_MASK_JAVA_STANDARD,
    `TUNED default ${d.agents} x ${d.hours} h [Direct/60]`,
    60,
  );
  const tunedWorst = runOne(
    wc.agents,
    wc.hours * wc.ticksPerHour,
    "deferred",
    DIRECT_MASK_JAVA_STANDARD,
    `TUNED worst-case ${wc.agents} x ${wc.hours} h [Direct/60]`,
    60,
  );

  results["tick"] = {
    calibration: {
      literalJavaMovement: calLiteral,
      directStandard: calDirect,
      directPositionOnly: calMask,
      deferred30: calDefer30,
      deferred60: calDefer60,
      noGeodesic: calNone,
      geodesicShareOfWall: 1 - calNone.wallMs / calDirect.wallMs,
      positionOnlyMaskSaving: 1 - calMask.wallMs / calDirect.wallMs,
    },
    budgetedDefault: fullDefault,
    budgetedWorstCase: fullWorst,
    tunedDefault,
    tunedWorstCase: tunedWorst,
  };
  console.log(
    `  geodesic Direct is ${((1 - calNone.wallMs / calDirect.wallMs) * 100).toFixed(1)}% of tick-loop wall ` +
      `(STANDARD mask); lat/lon-only mask saves ${((1 - calMask.wallMs / calDirect.wallMs) * 100).toFixed(1)}%`,
  );
  console.log(
    `  §3.6 cumulative-length graft buys ${(calLiteral.wallMs / calLiteral.agentTicks / (calDirect.wallMs / calDirect.agentTicks)).toFixed(2)}x ` +
      `over the literal Java movement loop ` +
      `(${(calLiteral.inverseCalls / calLiteral.agentTicks).toFixed(2)} Inverse + ` +
      `${(calLiteral.directCalls / calLiteral.agentTicks).toFixed(2)} Direct per agent-tick literal, vs ` +
      `${(calDirect.directCalls / calDirect.agentTicks).toFixed(2)} Direct grafted); ` +
      `default preset would be ${((calLiteral.wallMs / calLiteral.agentTicks) * 38132640) / 1000 > 0 ? (((calLiteral.wallMs / calLiteral.agentTicks) * 38132640) / 1000).toFixed(0) : "?"} s literal`,
  );

  // -------------------------------------------------------- verdicts ---
  console.log("\n=== SPIKE S3 — verdict vs plan §3.6 budgets ===");
  const verdicts: Record<string, unknown> = {};

  // Reference-machine derating. The plan's budgets are stated for "the reference
  // laptop"; this harness ran on a desktop i7-11700KF in Node. A mid-range laptop
  // in a browser is conservatively 2x slower on this kind of scalar float code.
  const DERATE = 2.0;

  const emit = (
    key: string,
    label: string,
    measuredS: number,
    budgetS: number,
    extra: Record<string, unknown> = {},
  ): void => {
    const deratedS = measuredS * DERATE;
    const verdict = deratedS <= budgetS ? (measuredS <= budgetS * 0.35 ? "MET" : "MET (tight)") : "AT RISK";
    console.log(
      `  ${label.padEnd(52)} ${measuredS.toFixed(2)} s vs ${budgetS} s ` +
        `(${((measuredS / budgetS) * 100).toFixed(0)}% here; ${((deratedS / budgetS) * 100).toFixed(0)}% at ${DERATE}x derate) -> ${verdict}`,
    );
    verdicts[key] = { measuredS, deratedS, budgetS, verdict, derate: DERATE, ...extra };
  };

  const waveS = ssspBlocked !== null ? ssspBlocked.sum / 1000 : Number.NaN;
  if (!Number.isNaN(waveS)) {
    emit("closureWave", "closure wave (46 SSSPs, post-wave, 1 thread)", waveS, BUDGETS.closureWaveS, {
      targetS: BUDGETS.closureWaveTargetS,
      meetsStretchTarget: waveS * DERATE <= BUDGETS.closureWaveTargetS,
    });
  }
  emit("defaultPreset", `default 2,037 x 312 h (${fullDefault.agentTicks.toLocaleString("en-US")} at)`, fullDefault.wallMs / 1000, d.wallBudgetS);
  const wcTotalS = fullWorst.wallMs / 1000 + (Number.isNaN(waveS) ? 0 : waveS * wc.waves);
  emit("worstCase", `worst case 6,842 x 455 h + ${wc.waves} waves`, wcTotalS, wc.wallBudgetS, {
    tickS: fullWorst.wallMs / 1000,
    waveS,
    waves: wc.waves,
  });
  emit("defaultPresetTuned", "default 2,037 x 312 h [TUNED: Direct/60]", tunedDefault.wallMs / 1000, d.wallBudgetS);
  emit(
    "worstCaseTuned",
    `worst case 6,842 x 455 h + ${wc.waves} waves [TUNED]`,
    tunedWorst.wallMs / 1000 + (Number.isNaN(waveS) ? 0 : waveS * wc.waves),
    wc.wallBudgetS,
  );
  results["verdicts"] = verdicts;

  const anyAtRisk = Object.values(verdicts).some((v) => (v as { verdict: string }).verdict === "AT RISK");
  const tunedClear =
    (verdicts["defaultPresetTuned"] as { verdict: string }).verdict !== "AT RISK" &&
    (verdicts["worstCaseTuned"] as { verdict: string }).verdict !== "AT RISK";
  const wasmDr = anyAtRisk && !tunedClear;
  console.log(
    `\n  ESCALATION: untuned any-at-risk=${anyAtRisk}; tuned clears every budget=${tunedClear} ` +
      `-> open WASM decision record? ${wasmDr ? "YES" : "NO"}`,
  );
  results["escalation"] = { anyAtRiskUntuned: anyAtRisk, tunedClearsAllBudgets: tunedClear, openWasmDecisionRecord: wasmDr };
}

writeFileSync(jsonOut, `${JSON.stringify(results, null, 2)}\n`, "utf8");
console.log(`\nwrote ${jsonOut}`);
