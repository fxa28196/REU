/**
 * SPIKE WP2-S3 — synthetic SoA agent tick loop on REAL routed paths.
 *
 * Per-tick work per agent mirrors the certified `step()` order (PORT_MAP §1.5)
 * for the dominant case (EN_ROUTE, non-stuck), with the §3.6 grafts applied:
 *
 *   2/3. per-agent speed + group-pace `max(0.40, v - delta)`
 *   5.   exposure block: exposure, vwe, ventilation-weighted air volume,
 *        inhaled dose = c * IR * dt, travel exposure, strict `c > 55.5` hours,
 *        peak, outdoor hours  (8 accumulators, county-uniform `c` hoisted)
 *   6.   hourly-per-agent risk-cue decay + ONE hazard logistic with `Math.exp`
 *        (staggered by agent so ~n/60 agents evaluate each tick, as in a real
 *        run where the hourly boundary is per-agent state, not a global barrier)
 *   12.  movement: cumulative-length vertex consumption (pure array arithmetic)
 *        + exactly ONE `Geodesic.Direct` for the final partial segment
 *
 * DELIBERATELY PESSIMISTIC: every agent is EN_ROUTE for every measured tick.
 * In a real run agents start UNAWARE (no movement, no Direct call) and finish
 * SHELTERED (exposure block skipped entirely), so this is an upper bound on
 * per-tick cost, not an average. Agents that consume their path are recycled to
 * the path head ("treadmill") so the population never drains.
 *
 * Paths are real: predecessor chains out of real Dijkstra trees, real street
 * polylines, real per-segment cumulative geodesic lengths.
 */

import { INVERSE_MASK_JAVA_STANDARD, WGS84 } from "./geodesic.js";
import type { CsrGraph } from "./graph-csr.js";

export { DIRECT_MASK_JAVA_STANDARD, DIRECT_MASK_POSITION_ONLY } from "./geodesic.js";

export interface AgentPaths {
  /** Vertex pool: path p occupies [offset[p], offset[p+1]). */
  offset: Int32Array;
  lon: Float64Array;
  lat: Float64Array;
  /** Cumulative metres from the path head; offset[p] entry is 0. */
  cumM: Float64Array;
  /** Forward azimuth of segment k -> k+1; last vertex of each path is NaN. */
  azi: Float64Array;
  vertexCount: number;
  buildMs: number;
  bytes: number;
  /** Diagnostics on the routed population. */
  meanVertices: number;
  meanLengthM: number;
  maxVertices: number;
}

/** Normalise an azimuth into (-180, 180], matching GeographicLib conventions. */
function normAzi(a: number): number {
  let x = a;
  while (x > 180) x -= 360;
  while (x <= -180) x += 360;
  return x;
}

/**
 * Build one path per agent by walking `predEdge` from the agent's start node
 * back to the tree source, appending each edge's polyline in traversal order
 * (PORT_MAP `pathToSource`: each edge contributes coords.length - 1 vertices).
 */
export function buildAgentPaths(
  g: CsrGraph,
  startNodes: Int32Array,
  predEdge: Int32Array,
  maxVerticesPerPath = 20000,
): AgentPaths {
  const t0 = performance.now();
  const n = startNodes.length;
  const offset = new Int32Array(n + 1);

  // Pass 1: size each path.
  const chainEdges: Int32Array[] = new Array<Int32Array>(n);
  const tmp: number[] = [];
  for (let p = 0; p < n; p++) {
    tmp.length = 0;
    let cur = startNodes[p]!;
    let verts = 1;
    for (;;) {
      const e = predEdge[cur]!;
      if (e < 0) break;
      const nc = g.polyOffset[e + 1]! - g.polyOffset[e]!;
      verts += nc - 1;
      tmp.push(e);
      const a = g.edgeFrom[e]!;
      const b = g.edgeTo[e]!;
      cur = cur === a ? b : a;
      if (verts > maxVerticesPerPath) break;
    }
    chainEdges[p] = Int32Array.from(tmp);
    offset[p + 1] = verts;
  }
  for (let p = 0; p < n; p++) offset[p + 1]! += offset[p]!;
  const V = offset[n]!;

  const lon = new Float64Array(V);
  const lat = new Float64Array(V);
  const cumM = new Float64Array(V);
  const azi = new Float64Array(V);

  // Pass 2: fill. Walk from the agent's node toward the source, so the head of
  // the array is where the agent stands and the tail is the shelter door.
  let sumLen = 0;
  let maxVertices = 0;
  for (let p = 0; p < n; p++) {
    const chain = chainEdges[p]!;
    let w = offset[p]!;
    let cur = startNodes[p]!;
    let acc = 0;
    // Head vertex = the node coordinate the agent stands on.
    lon[w] = g.nodeLon[cur]!;
    lat[w] = g.nodeLat[cur]!;
    cumM[w] = 0;
    for (let ci = 0; ci < chain.length; ci++) {
      const e = chain[ci]!;
      const lo = g.polyOffset[e]!;
      const hi = g.polyOffset[e + 1]!;
      const forward = g.edgeFrom[e]! === cur;
      if (forward) {
        // vertices lo+1 .. hi-1, segment k -> k+1 azimuth = segAzi1[k]
        for (let k = lo; k + 1 < hi; k++) {
          azi[w] = g.segAzi1[k]!;
          const segLen = g.segCumM[k + 1]! - g.segCumM[k]!;
          acc += segLen;
          w++;
          lon[w] = g.polyLon[k + 1]!;
          lat[w] = g.polyLat[k + 1]!;
          cumM[w] = acc;
        }
      } else {
        // traverse hi-1 .. lo; reverse heading of segment k -> k+1 is azi2+180
        for (let k = hi - 2; k >= lo; k--) {
          azi[w] = normAzi(g.segAzi2[k]! + 180);
          const segLen = g.segCumM[k + 1]! - g.segCumM[k]!;
          acc += segLen;
          w++;
          lon[w] = g.polyLon[k]!;
          lat[w] = g.polyLat[k]!;
          cumM[w] = acc;
        }
      }
      const a = g.edgeFrom[e]!;
      const b = g.edgeTo[e]!;
      cur = cur === a ? b : a;
    }
    azi[w] = Number.NaN; // terminal vertex
    sumLen += acc;
    const nv = offset[p + 1]! - offset[p]!;
    if (nv > maxVertices) maxVertices = nv;
  }

  return {
    offset,
    lon,
    lat,
    cumM,
    azi,
    vertexCount: V,
    buildMs: performance.now() - t0,
    bytes: offset.byteLength + lon.byteLength + lat.byteLength + cumM.byteLength + azi.byteLength,
    meanVertices: V / n,
    meanLengthM: sumLen / n,
    maxVertices,
  };
}

export interface AgentSoa {
  n: number;
  // hot movement fields
  pathId: Int32Array;
  vertexIdx: Int32Array;
  travelledM: Float64Array;
  curLon: Float64Array;
  curLat: Float64Array;
  speedMps: Float64Array;
  groupDelta: Float64Array;
  // exposure accumulators
  exposureUgM3h: Float64Array;
  vweUgM3h: Float64Array;
  airVolumeBreathedM3: Float64Array;
  inhaledDoseUg: Float64Array;
  exposureWhileTravelingUgM3h: Float64Array;
  hoursAboveUnhealthy: Float64Array;
  peakConcUgM3: Float64Array;
  outdoorHoursH: Float64Array;
  distanceTraveledM: Float64Array;
  // decision fields
  zRisk: Float64Array;
  thetaZ: Float64Array;
  barrierCost: Float64Array;
  vulnerable: Uint8Array;
  hourPhase: Int32Array;
  // counters
  arrivals: Int32Array;
  bytes: number;
}

/** Deterministic tiny LCG so the harness is reproducible without the RNG port. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function buildAgents(n: number, paths: AgentPaths, seed = 42): AgentSoa {
  const rnd = lcg(seed);
  const nPaths = paths.offset.length - 1;
  const a: AgentSoa = {
    n,
    pathId: new Int32Array(n),
    vertexIdx: new Int32Array(n),
    travelledM: new Float64Array(n),
    curLon: new Float64Array(n),
    curLat: new Float64Array(n),
    speedMps: new Float64Array(n),
    groupDelta: new Float64Array(n),
    exposureUgM3h: new Float64Array(n),
    vweUgM3h: new Float64Array(n),
    airVolumeBreathedM3: new Float64Array(n),
    inhaledDoseUg: new Float64Array(n),
    exposureWhileTravelingUgM3h: new Float64Array(n),
    hoursAboveUnhealthy: new Float64Array(n),
    peakConcUgM3: new Float64Array(n),
    outdoorHoursH: new Float64Array(n),
    distanceTraveledM: new Float64Array(n),
    zRisk: new Float64Array(n),
    thetaZ: new Float64Array(n),
    barrierCost: new Float64Array(n),
    vulnerable: new Uint8Array(n),
    hourPhase: new Int32Array(n),
    arrivals: new Int32Array(n),
    bytes: 0,
  };
  for (let i = 0; i < n; i++) {
    const p = i % nPaths;
    a.pathId[i] = p;
    a.vertexIdx[i] = paths.offset[p]!;
    a.curLon[i] = paths.lon[paths.offset[p]!]!;
    a.curLat[i] = paths.lat[paths.offset[p]!]!;
    // truncated-normal-ish speeds inside the published 0.40-2.20 bounds
    a.speedMps[i] = Math.min(2.2, Math.max(0.4, 1.3 + (rnd() - 0.5) * 0.64));
    a.groupDelta[i] = rnd() < 0.25 ? 0.15 : 0;
    a.thetaZ[i] = (rnd() - 0.5) * 2;
    a.barrierCost[i] = rnd() * 0.8;
    a.vulnerable[i] = rnd() < 0.42 ? 1 : 0;
    a.hourPhase[i] = i % 60;
  }
  let bytes = 0;
  for (const v of Object.values(a)) {
    if (ArrayBuffer.isView(v)) bytes += (v as ArrayBufferView).byteLength;
  }
  a.bytes = bytes;
  return a;
}

export interface TickOptions {
  ticks: number;
  minutesPerTick: number;
  /**
   * "direct"   = one Geodesic.Direct per moving agent-tick (the §3.6 hot path)
   * "deferred" = Direct only every `directEveryTicks` ticks, i.e. the display
   *              coordinate is materialised at render cadence instead of every
   *              tick. Physics is driven by `travelledM` + the cumulative array,
   *              which never reads the interpolated coordinate — see DR-S3.
   * "literal"  = what the certified Java actually executes (GisAgent.java
   *              lines 523-541): one `Inverse` PER VERTEX consumed to measure
   *              the distance from the agent's carried position, plus an
   *              `Inverse` + `Direct` pair for the final partial segment. This
   *              is the cost the §3.6 cumulative-length graft exists to remove.
   * "none"     = array-only lower bound (no geodesic at all)
   */
  geodesic: "direct" | "deferred" | "literal" | "none";
  directMask: number;
  /** Only used by "deferred". */
  directEveryTicks?: number;
  /** Hourly PM2.5 slices; NaN encodes gap/out-of-window -> 0.0 + counter. */
  smokeHourly: Float64Array;
}

export interface TickStats {
  wallMs: number;
  agentTicks: number;
  agentTicksPerSecond: number;
  directCalls: number;
  inverseCalls: number;
  hazardEvaluations: number;
  vertexAdvances: number;
  arrivals: number;
  outOfRangeLookups: number;
  /** Anti-DCE guard: the harness prints this so nothing can be optimised away. */
  checksum: number;
}

const ALPHA_HAZARD = -8.0;
const B_RISK = 1.6;
const GAMMA_VULN = 0.25;
const W_OFFICIAL = 0.7;
const SIGMA_THETA = 0.5;
const RISK_HALF_LIFE_H = 6.0;
const UNHEALTHY = 55.5;
const VENT_EN_ROUTE = 1.62;

export function runTicks(a: AgentSoa, paths: AgentPaths, o: TickOptions): TickStats {
  const n = a.n;
  const dt = o.minutesPerTick / 60;
  const stepScale = 60 * o.minutesPerTick; // metres per tick per (m/s)
  const geodesicMode = o.geodesic;
  const directEvery = geodesicMode === "deferred" ? (o.directEveryTicks ?? 60) : 1;
  const mask = o.directMask;
  const decay = Math.pow(2, -1 / RISK_HALF_LIFE_H);

  const pOff = paths.offset;
  const pLon = paths.lon;
  const pLat = paths.lat;
  const pCum = paths.cumM;
  const pAzi = paths.azi;

  const pathId = a.pathId;
  const vertexIdx = a.vertexIdx;
  const travelledM = a.travelledM;
  const curLon = a.curLon;
  const curLat = a.curLat;
  const speedMps = a.speedMps;
  const groupDelta = a.groupDelta;
  const exposure = a.exposureUgM3h;
  const vwe = a.vweUgM3h;
  const airVol = a.airVolumeBreathedM3;
  const inhaled = a.inhaledDoseUg;
  const expTravel = a.exposureWhileTravelingUgM3h;
  const hoursAbove = a.hoursAboveUnhealthy;
  const peak = a.peakConcUgM3;
  const outdoor = a.outdoorHoursH;
  const distTravelled = a.distanceTraveledM;
  const zRisk = a.zRisk;
  const thetaZ = a.thetaZ;
  const barrierCost = a.barrierCost;
  const vulnerable = a.vulnerable;
  const hourPhase = a.hourPhase;
  const arrivalsArr = a.arrivals;

  const smoke = o.smokeHourly;
  const smokeLen = smoke.length;

  let directCalls = 0;
  let inverseCalls = 0;
  let hazardEvaluations = 0;
  let vertexAdvances = 0;
  let arrivals = 0;
  let outOfRangeLookups = 0;
  let departures = 0;

  const t0 = performance.now();
  for (let tick = 0; tick < o.ticks; tick++) {
    const materialisePosition = geodesicMode !== "none" && tick % directEvery === 0;
    // Step 5 lookup — county-uniform, hoisted out of the agent loop (§3.6).
    const slice = Math.trunc((tick * o.minutesPerTick) / 60);
    let c = slice >= 0 && slice < smokeLen ? smoke[slice]! : Number.NaN;
    if (Number.isNaN(c)) {
      c = 0;
      outOfRangeLookups += n; // the counter is per-agent-lookup in Java
    }
    const cdt = c * dt;
    const inhaledInc = cdt * VENT_EN_ROUTE;
    const airInc = VENT_EN_ROUTE * dt;
    const above = c > UNHEALTHY ? dt : 0; // STRICT >
    const cueInc = c >= UNHEALTHY ? 1 / 24 : 0; // >= here, deliberate

    for (let i = 0; i < n; i++) {
      // --- steps 2/3: speed + group pace ---
      let v = speedMps[i]!;
      const gd = groupDelta[i]!;
      if (gd > 0) v = Math.max(0.4, v - gd);

      // --- step 5: exposure block ---
      exposure[i]! += cdt;
      vwe[i]! += cdt; // ageRR * comorbidityRR pinned 1.0
      airVol[i]! += airInc;
      inhaled[i]! += inhaledInc;
      expTravel[i]! += cdt;
      if (above !== 0) hoursAbove[i]! += above;
      if (c > peak[i]!) peak[i] = c;
      outdoor[i]! += dt;

      // --- step 6: hourly risk cue + ONE hazard logistic ---
      if (((tick + hourPhase[i]!) % 60) === 0) {
        const z = zRisk[i]! * decay + cueInc;
        zRisk[i] = z;
        const u =
          ALPHA_HAZARD +
          B_RISK * (1 + (vulnerable[i]! !== 0 ? GAMMA_VULN : 0)) * z +
          W_OFFICIAL +
          SIGMA_THETA * thetaZ[i]! -
          barrierCost[i]!;
        const p = 1 / (1 + Math.exp(-u));
        hazardEvaluations++;
        if (p > 0.999999) departures++; // consume p; never true at these params
      }

      // --- step 12: movement ---
      const stepLengthM = v * stepScale;
      const p0 = pOff[pathId[i]!]!;
      const pEnd = pOff[pathId[i]! + 1]!;

      if (geodesicMode === "literal") {
        // Verbatim GisAgent.java: measure from the CARRIED coordinate, one
        // Inverse per vertex consumed, Inverse+Direct for the partial segment.
        let cLon = curLon[i]!;
        let cLat = curLat[i]!;
        let remainingM = stepLengthM;
        let jj = vertexIdx[i]!;
        while (remainingM > 0 && jj + 1 < pEnd) {
          const nLon = pLon[jj + 1]!;
          const nLat = pLat[jj + 1]!;
          const inv = WGS84.Inverse(cLat, cLon, nLat, nLon, INVERSE_MASK_JAVA_STANDARD);
          inverseCalls++;
          if (inv.s12 <= remainingM) {
            cLon = nLon;
            cLat = nLat;
            jj++;
            vertexAdvances++;
            remainingM -= inv.s12;
          } else {
            const mv = WGS84.Direct(cLat, cLon, inv.azi1, remainingM, mask);
            directCalls++;
            cLon = mv.lon2;
            cLat = mv.lat2;
            remainingM = 0;
          }
        }
        distTravelled[i]! += stepLengthM - remainingM;
        curLon[i] = cLon;
        curLat[i] = cLat;
        if (jj + 1 >= pEnd) {
          arrivals++;
          arrivalsArr[i]! += 1;
          vertexIdx[i] = p0;
          travelledM[i] = 0;
          curLon[i] = pLon[p0]!;
          curLat[i] = pLat[p0]!;
        } else {
          vertexIdx[i] = jj;
        }
        continue;
      }

      const target = travelledM[i]! + stepLengthM;
      let j = vertexIdx[i]!;
      while (j + 1 < pEnd && pCum[j + 1]! <= target) {
        j++;
        vertexAdvances++;
      }
      if (j + 1 >= pEnd) {
        // Arrived at the door: recycle to the path head (treadmill).
        arrivals++;
        arrivalsArr[i]! += 1;
        distTravelled[i]! += pCum[pEnd - 1]! - travelledM[i]!;
        vertexIdx[i] = p0;
        travelledM[i] = 0;
        curLon[i] = pLon[p0]!;
        curLat[i] = pLat[p0]!;
      } else {
        vertexIdx[i] = j;
        travelledM[i] = target;
        distTravelled[i]! += stepLengthM;
        if (materialisePosition) {
          const remaining = target - pCum[j]!;
          const r = WGS84.Direct(pLat[j]!, pLon[j]!, pAzi[j]!, remaining, mask);
          curLon[i] = r.lon2;
          curLat[i] = r.lat2;
          directCalls++;
        }
      }
    }
  }
  const wallMs = performance.now() - t0;

  let checksum = 0;
  for (let i = 0; i < n; i++) checksum += inhaled[i]! + distTravelled[i]! + curLat[i]! + zRisk[i]!;
  checksum += departures;

  const agentTicks = n * o.ticks;
  return {
    wallMs,
    agentTicks,
    agentTicksPerSecond: (agentTicks / wallMs) * 1000,
    directCalls,
    inverseCalls,
    hazardEvaluations,
    vertexAdvances,
    arrivals,
    outOfRangeLookups,
    checksum,
  };
}
