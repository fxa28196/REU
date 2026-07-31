/**
 * FIX A — the **direct movement oracle**. Per-tick displacement of individual
 * residents, against values computed by the certified `GisAgent.step()`.
 *
 * ## Why this file exists
 *
 * The WP7 gate established a specific, uncomfortable fact: injecting a 10 %
 * error into `step.ts`'s `stepLengthM` left **all 1,084 tests green**. Every
 * Tier-3 gate in the suite is an aggregate — sheltered census inside a nine-seed
 * band, the 54,002.8192 never-sheltered exposure identity, realised marginals,
 * `verify_E_runs` (b)(d)(e)(l) — and none of them is sensitive to a uniform
 * speed scaling that merely shifts arrival ticks inside the band. A model whose
 * movement kernel can be 10 % wrong with every gate green is not validated where
 * it matters most.
 *
 * So this file compares **one resident's cumulative distance on one tick** with
 * Java's, and it does so bit for bit wherever bit-identity is *derivable* rather
 * than hoped for.
 *
 * ## Where the certified numbers come from
 *
 * `engine/test/fixtures/movement/` is produced by
 * `pipeline/java-exporter/src-world/websim/exporter/world/MovementTrace.java`,
 * which stands up a real Repast runtime (a `DefaultContext`, a `Geography`
 * projection, a `Schedule`, a `RunEnvironment` parameter map) and steps the
 * **certified `geography.agents.GisAgent`** through it. The 15-line walk at
 * `GisAgent.java:526-542` is not transcribed anywhere: every metre in
 * `ticks.tsv` was produced by `Geodesic.WGS84.Inverse/Direct` inside the
 * certified class. Regenerate with
 * `powershell -File websim\pipeline\java-exporter\dump-movement-trace.ps1 -Verify`.
 *
 * ## Why bit-identity is available here, and exactly where it stops
 *
 * DR-S3 action A3 says per-agent `distanceTraveledM` gates are tolerance
 * comparisons. That is true **of a whole journey**, and it is why the WP7 gate
 * could not be tightened into a movement test. It is *not* true tick by tick:
 *
 *  - Java accumulates `distanceTraveledM += stepLengthM − remainingM`, and on
 *    every tick that does **not** consume the last path vertex `remainingM` is
 *    exactly `0` — the loop leaves it zeroed by the `Direct` branch. So Java's
 *    addend is exactly `stepLengthM`.
 *  - The port accumulates `advanceM = min(stepLengthM, legLengthM − legTravelM)`,
 *    which on those same ticks is exactly `stepLengthM`.
 *
 * Both sequences therefore start at `0` and apply the identical `fl(x + s)`
 * recurrence with the identical `s`. They are **bit-identical**, and a one-ULP
 * error in `stepLengthM` separates them on the first walking tick. That is the
 * whole point: the smallest detectable error is one ULP, not one per cent.
 *
 * Bit-identity stops at the tick that consumes the last vertex, because there
 * Java's residual is a live geodesic remainder and the port's is the baked
 * cumulative-length graft (DR-S3 finding S3-F2, ~1e-9 m). Those rows — and every
 * row after arrival, which carries the same frozen total — are compared against
 * {@link FINAL_TICK_TOLERANCE_M}, and the measured worst case is reported.
 *
 * The exposure accumulators are bit-identical on **every** row, including the
 * final ones: they are sums of `c * dtHours` over the same concentration
 * sequence with no geometry in them at all.
 *
 * ## What this file does NOT cover
 *
 * The mini-world rebuilt here is a two-node chain carrying one certified route
 * polyline, so it exercises the movement kernel (both halves of the speed
 * selector — three run-wide-speed configs and one with certified per-agent
 * attributes over a decoy parameter), the approach leg, the exposure block, the
 * ventilation switch, the latch and the door — not shelter choice over the full
 * graph, not retargeting, not closures. Those stay the business of
 * `world/tier1.parity.test.ts`, `graph/trees.parity.test.ts` and
 * `validation/test/wp7-vertical-slice.test.ts`. This file is the movement floor.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { GraphGeometry } from "@websim/shared/graph-asset";

import { Resident } from "../../src/agents/resident.js";
import { buildRouteLeg } from "../../src/agents/route.js";
import { materialisePosition, stepResident, type StepWorld } from "../../src/agents/step.js";
import { geodesicDistanceM } from "../../src/geo/geodesic.js";
import { buildRoutingGraph, type RoutingGraph } from "../../src/graph/csr.js";
import { buildSegmentGeometry } from "../../src/graph/cumLen.js";
import { computeTree, makeScratch, retainTree } from "../../src/graph/dijkstra.js";
import { Shelter } from "../../src/shelters/shelter.js";
import { SmokeField } from "../../src/smoke/field.js";
import { bitsToDouble, dataLines, doubleToBits } from "../world/helpers.js";

const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/movement", import.meta.url));

/**
 * Budget for the one tick per leg where the walk consumes its last vertex, and
 * for the frozen total every later row repeats.
 *
 * Measured worst case over the 24 traced legs: **1.304e-8 m**. That is the
 * DR-S3 S3-F2 residual in anger — the port's leg length comes from the baked
 * cumulative-length graft (per-edge worst 2.598e-8 m) while Java's comes from a
 * live `Inverse` per consumed vertex, and a traced leg spans up to ~180 of them.
 * The budget is set one order above the measurement, and the realised maximum is
 * printed on every run so a regression that stays inside the budget is still
 * visible.
 */
const FINAL_TICK_TOLERANCE_M = 1e-7;

/**
 * Budget for the rendered standing point. Java carries an interpolated
 * `Coordinate` forward tick by tick; the port materialises it from the leg's
 * cumulative array on demand (DR-S3 A1/A3). They lie on the same geodesic but
 * are not bit-equal. Measured worst case: **2.124e-8 m** — 12 orders of
 * magnitude below the ~0.8 m per tick a 1 % speed error moves the walker.
 */
const POSITION_TOLERANCE_M = 1e-7;

// ---------------------------------------------------------------- fixtures

interface ManifestDump {
  readonly name: string;
  readonly path: string;
  readonly lines: number;
  readonly bytes: number;
  readonly sha256: string;
}

interface TraceManifest {
  readonly dumps: readonly ManifestDump[];
  readonly selfCheckFailures: number;
  readonly end_tick: number;
  readonly minutes_per_tick: number;
  readonly idle_stride: number;
  readonly configs: number;
  readonly agents_per_config: number;
  readonly heterogeneous_decoy_mps: number;
}

interface RoutePolyline {
  readonly lon: readonly number[];
  readonly lat: readonly number[];
  /** Certified `StreetNetwork.geodesicDistanceM` from the previous vertex. */
  readonly segM: readonly number[];
}

interface LegRow {
  readonly config: number;
  readonly heterogeneous: boolean;
  /** The `walkingSpeedMps` run parameter for this config. */
  readonly runWideSpeedMps: number;
  /** The speed this resident actually walked at (attribute or parameter). */
  readonly agentSpeedMps: number;
  readonly agent: number;
  readonly startLon: number;
  readonly startLat: number;
  readonly shelterId: string;
  readonly pathSize: number;
  readonly snapGapM: number;
  readonly plannedRouteM: number;
  readonly evacTick: number;
  readonly arrivalTick: number;
  readonly retargets: number;
  readonly distanceM: number;
  readonly state: string;
}

interface TickRow {
  readonly config: number;
  readonly agent: number;
  readonly tick: number;
  readonly state: string;
  readonly pathIndex: number;
  readonly pathSize: number;
  readonly distanceM: number;
  readonly lon: number;
  readonly lat: number;
  readonly exposure: number;
  readonly travelExposure: number;
  readonly airVolume: number;
  readonly dose: number;
  readonly hoursAbove: number;
  readonly outdoorHours: number;
  readonly peak: number;
}

function readFixture(name: string): string {
  return readFileSync(`${FIXTURE_DIR}/${name}`, "utf8");
}

const manifest = JSON.parse(readFixture("manifest.json")) as TraceManifest;

function readRoutes(): Map<number, RoutePolyline> {
  const out = new Map<number, { lon: number[]; lat: number[]; segM: number[] }>();
  for (const line of dataLines(readFixture("routes.tsv"))) {
    const f = line.split("\t");
    const agent = Number(f[0]);
    let poly = out.get(agent);
    if (poly === undefined) {
      poly = { lon: [], lat: [], segM: [] };
      out.set(agent, poly);
    }
    if (poly.lon.length !== Number(f[1])) {
      throw new Error(`routes.tsv: agent ${agent} vertex order broken at ${f[1]}`);
    }
    poly.lon.push(bitsToDouble(f[2]!));
    poly.lat.push(bitsToDouble(f[3]!));
    poly.segM.push(bitsToDouble(f[4]!));
  }
  return out as Map<number, RoutePolyline>;
}

function readLegs(): LegRow[] {
  const out: LegRow[] = [];
  for (const line of dataLines(readFixture("legs.tsv"))) {
    const f = line.split("\t");
    out.push({
      config: Number(f[0]),
      heterogeneous: f[1] === "1",
      runWideSpeedMps: bitsToDouble(f[2]!),
      agentSpeedMps: bitsToDouble(f[3]!),
      agent: Number(f[4]),
      startLon: bitsToDouble(f[6]!),
      startLat: bitsToDouble(f[7]!),
      shelterId: f[8]!,
      pathSize: Number(f[10]),
      snapGapM: bitsToDouble(f[11]!),
      plannedRouteM: bitsToDouble(f[12]!),
      evacTick: bitsToDouble(f[14]!),
      arrivalTick: bitsToDouble(f[15]!),
      retargets: Number(f[16]),
      distanceM: bitsToDouble(f[17]!),
      state: f[18]!,
    });
  }
  return out;
}

function readTicks(): Map<string, TickRow[]> {
  const out = new Map<string, TickRow[]>();
  for (const line of dataLines(readFixture("ticks.tsv"))) {
    const f = line.split("\t");
    const row: TickRow = {
      config: Number(f[0]),
      agent: Number(f[1]),
      tick: Number(f[2]),
      state: f[3]!,
      pathIndex: Number(f[4]),
      pathSize: Number(f[5]),
      distanceM: bitsToDouble(f[6]!),
      lon: bitsToDouble(f[7]!),
      lat: bitsToDouble(f[8]!),
      exposure: bitsToDouble(f[9]!),
      travelExposure: bitsToDouble(f[10]!),
      airVolume: bitsToDouble(f[11]!),
      dose: bitsToDouble(f[12]!),
      hoursAbove: bitsToDouble(f[13]!),
      outdoorHours: bitsToDouble(f[14]!),
      peak: bitsToDouble(f[15]!),
    };
    const key = `${row.config}/${row.agent}`;
    const list = out.get(key);
    if (list === undefined) {
      out.set(key, [row]);
    } else {
      list.push(row);
    }
  }
  return out;
}

function readSmoke(): (number | null)[] {
  const out: (number | null)[] = [];
  for (const line of dataLines(readFixture("smoke.tsv"))) {
    const f = line.split("\t");
    if (out.length !== Number(f[0])) {
      throw new Error(`smoke.tsv: hour order broken at ${f[0]}`);
    }
    out.push(f[1] === "nan" ? null : bitsToDouble(f[1]!));
  }
  return out;
}

const ROUTES = readRoutes();
const LEGS = readLegs();
const TICKS = readTicks();
const HOURLY = readSmoke();

// ------------------------------------------------------------- mini world

/**
 * A two-node chain carrying one certified route polyline as its single edge.
 *
 * The edge's length is the sum of the certified per-vertex geodesic segments —
 * the very distances Java's movement loop measures as it consumes the polyline —
 * so `buildSegmentGeometry`'s A2 snap lands the leg's cumulative array on Java's
 * own walked length rather than on a re-derived one. Nothing about the graph is
 * invented: every coordinate and every metre comes out of `routes.tsv`.
 */
function chainWorld(poly: RoutePolyline): { graph: RoutingGraph; geometry: GraphGeometry } {
  const n = poly.lon.length;
  let total = 0;
  for (let i = 1; i < n; i++) {
    total += poly.segM[i]!;
  }
  const topology = {
    nodeCount: 2,
    edgeCount: 1,
    nodeId: Int32Array.from([1, 2]),
    nodeLon: Float64Array.from([poly.lon[0]!, poly.lon[n - 1]!]),
    nodeLat: Float64Array.from([poly.lat[0]!, poly.lat[n - 1]!]),
    edgeFrom: Int32Array.from([0]),
    edgeTo: Int32Array.from([1]),
    edgeLengthM: Float64Array.from([total]),
    csrOffset: Int32Array.from([0, 1, 2]),
    csrEntry: Int32Array.from([1, -1]),
  };
  const geometry: GraphGeometry = {
    edgeCount: 1,
    vertexCount: n,
    polyOffset: Int32Array.from([0, n]),
    polyLon: Float64Array.from(poly.lon),
    polyLat: Float64Array.from(poly.lat),
  } as GraphGeometry;
  return { graph: buildRoutingGraph(topology as never), geometry };
}

interface Replay {
  readonly resident: Resident;
  readonly world: StepWorld;
}

function replayWorld(leg: LegRow, poly: RoutePolyline): Replay {
  const { graph, geometry } = chainWorld(poly);
  const seg = buildSegmentGeometry(graph, geometry);
  const n = poly.lon.length;
  const shelter = new Shelter(leg.shelterId, leg.shelterId, 1_000_000, true, poly.lon[n - 1]!, poly.lat[n - 1]!);
  shelter.graphNode = 1;
  shelter.graphNodeId = 2;
  shelter.routeTree = retainTree(computeTree(graph, 1, makeScratch(graph)));
  const smoke = new SmokeField(HOURLY);
  const world: StepWorld = {
    graph,
    geometry,
    seg,
    smoke,
    shelters: [shelter],
    minutesPerTick: manifest.minutes_per_tick,
    // Under the heterogeneous config this is the DECOY: 37 m/s, a value no
    // resident may ever walk at. A port that read the run-wide parameter
    // instead of the per-agent attribute would be ~27x too fast on tick one.
    walkingSpeedMps: leg.runWideSpeedMps,
    evacuationThresholdUgM3: 55.5,
    anyShelterOpen(tick) {
      return shelter.operating && shelter.isOpenAt(tick);
    },
    anyShelterAvailable(tick, fromNode, isPriority) {
      return (
        shelter.isAvailableAt(tick, isPriority) &&
        shelter.routeTree !== null &&
        Number.isFinite(shelter.routeTree.dist[fromNode]!)
      );
    },
    onAdmission() {
      /* capacity never binds in the traced world */
    },
  };
  const resident = new Resident({
    index: leg.agent,
    name: `Trace ${leg.agent}`,
    encampmentId: `synthetic-${leg.agent}`,
    startLon: leg.startLon,
    startLat: leg.startLat,
    startNode: 0,
    attributes: leg.heterogeneous
      ? {
          ageYears: 40,
          ageBand: "18-44",
          sex: "MALE",
          mobilityLimited: false,
          mobilityCategory: "unimpaired",
          asthma: false,
          copd: false,
          chronicPhysical: false,
          walkingSpeedMps: leg.agentSpeedMps,
        }
      : null,
  });
  return { resident, world };
}

// -------------------------------------------------------------- the gates

describe("FIX-A movement oracle — the fixture is what the exporter says it is", () => {
  it("carries four configs, six residents each, and a real walking window", () => {
    expect(LEGS.length).toBe(24);
    // Three run-wide speeds plus the heterogeneous decoy.
    expect(new Set(LEGS.map((l) => l.runWideSpeedMps)).size).toBe(4);
    // The heterogeneous config exercises `attributes.walkingSpeedMps`, and its
    // run-wide parameter is a decoy nobody walks at — so if the assertion below
    // ever passes trivially, the config has stopped testing the selector.
    const het = LEGS.filter((l) => l.heterogeneous);
    expect(het.length).toBe(6);
    expect(new Set(het.map((l) => l.agentSpeedMps)).size).toBe(6);
    for (const l of het) {
      expect(l.agentSpeedMps).not.toBe(l.runWideSpeedMps);
    }
    expect(manifest.heterogeneous_decoy_mps).toBe(37);
    for (const leg of LEGS) {
      expect(leg.state).toBe("SHELTERED");
      expect(leg.retargets).toBe(0);
      expect(leg.arrivalTick - leg.evacTick).toBeGreaterThanOrEqual(10);
    }
    // Every traced resident has at least ten EN_ROUTE rows, so the bit-exact
    // interior-tick comparison below is never vacuous for any of them.
    for (const [key, rows] of TICKS) {
      const enRoute = rows.filter((r) => r.state === "EN_ROUTE").length;
      expect(enRoute, `${key} EN_ROUTE rows`).toBeGreaterThanOrEqual(10);
    }
  });

  it("is byte-for-byte the dump the exporter recorded, with every self-check green", () => {
    // The exporter digests each file as it writes it. Re-checking those digests
    // here is what stops a hand-edited or half-regenerated fixture from quietly
    // weakening the comparison below — the same discipline `committed-slice`
    // applies to its provenance block.
    expect(manifest.selfCheckFailures).toBe(0);
    const names = manifest.dumps.map((d) => d.name).sort();
    expect(names).toEqual([
      "movement.legs",
      "movement.routes",
      "movement.smoke",
      "movement.ticks",
    ]);
    for (const dump of manifest.dumps) {
      const bytes = readFileSync(`${FIXTURE_DIR}/${dump.path.split("/").pop()!}`);
      expect(bytes.length, `${dump.name} bytes`).toBe(dump.bytes);
      expect(createHash("sha256").update(bytes).digest("hex"), `${dump.name} sha256`).toBe(
        dump.sha256,
      );
    }
  });

  it("rebuilds each certified route polyline vertex for vertex", () => {
    for (const [agent, poly] of ROUTES) {
      const { graph, geometry } = chainWorld(poly);
      const seg = buildSegmentGeometry(graph, geometry);
      const tree = retainTree(computeTree(graph, 1, makeScratch(graph)));
      const leg = buildRouteLeg(graph, geometry, seg, tree, 0);
      expect(leg, `agent ${agent}`).not.toBeNull();
      expect(leg!.vertexCount).toBe(poly.lon.length);
      for (let i = 0; i < poly.lon.length; i++) {
        expect(doubleToBits(leg!.xy[2 * i]!), `agent ${agent} vertex ${i} lon`).toBe(
          doubleToBits(poly.lon[i]!),
        );
        expect(doubleToBits(leg!.xy[2 * i + 1]!), `agent ${agent} vertex ${i} lat`).toBe(
          doubleToBits(poly.lat[i]!),
        );
      }
    }
  });
});

describe("FIX-A movement oracle — per-tick displacement against certified Java", () => {
  it("reproduces every interior walking tick BIT FOR BIT, and the rest inside 1e-7 m", () => {
    let interiorRows = 0;
    let toleranceRows = 0;
    let worstFinalM = 0;
    let worstPositionM = 0;
    let worstSnapGapM = 0;

    for (const leg of LEGS) {
      const poly = ROUTES.get(leg.agent);
      expect(poly, `route for agent ${leg.agent}`).toBeDefined();
      const rows = TICKS.get(`${leg.config}/${leg.agent}`);
      expect(rows, `ticks for ${leg.config}/${leg.agent}`).toBeDefined();

      const { resident, world } = replayWorld(leg, poly!);
      let cursor = 0;
      for (let tick = 1; tick <= manifest.end_tick && cursor < rows!.length; tick++) {
        stepResident(resident, world, tick);
        const row = rows![cursor]!;
        if (row.tick !== tick) {
          continue;
        }
        cursor++;
        const where = `config ${leg.config} agent ${leg.agent} tick ${tick}`;

        expect(resident.state, `${where} state`).toBe(row.state);

        // --- the movement kernel ------------------------------------------
        const interior = row.pathIndex >= 0 && row.pathIndex < row.pathSize;
        if (interior) {
          interiorRows++;
          expect(doubleToBits(resident.distanceTraveledM), `${where} distance (interior)`).toBe(
            doubleToBits(row.distanceM),
          );
        } else {
          toleranceRows++;
          const d = Math.abs(resident.distanceTraveledM - row.distanceM);
          worstFinalM = Math.max(worstFinalM, d);
          expect(d, `${where} distance (leg consumed)`).toBeLessThanOrEqual(
            FINAL_TICK_TOLERANCE_M,
          );
        }

        // --- the rendered standing point ----------------------------------
        const p = materialisePosition(resident);
        const off = geodesicDistanceM(p.lon, p.lat, row.lon, row.lat);
        worstPositionM = Math.max(worstPositionM, off);
        expect(off, `${where} position`).toBeLessThanOrEqual(POSITION_TOLERANCE_M);

        // --- exposure, ventilation and hours-above: no geometry, so exact --
        expect(doubleToBits(resident.exposureUgM3h), `${where} exposure`).toBe(
          doubleToBits(row.exposure),
        );
        expect(
          doubleToBits(resident.exposureWhileTravelingUgM3h),
          `${where} travel exposure`,
        ).toBe(doubleToBits(row.travelExposure));
        expect(doubleToBits(resident.airVolumeBreathedM3), `${where} air volume`).toBe(
          doubleToBits(row.airVolume),
        );
        expect(doubleToBits(resident.inhaledDoseUg), `${where} inhaled dose`).toBe(
          doubleToBits(row.dose),
        );
        expect(doubleToBits(resident.hoursAboveUnhealthy), `${where} hours above`).toBe(
          doubleToBits(row.hoursAbove),
        );
        expect(doubleToBits(resident.outdoorHours), `${where} outdoor hours`).toBe(
          doubleToBits(row.outdoorHours),
        );
        expect(doubleToBits(resident.peakConcUgM3), `${where} peak`).toBe(
          doubleToBits(row.peak),
        );
      }

      expect(cursor, `config ${leg.config} agent ${leg.agent}: rows consumed`).toBe(rows!.length);
      expect(resident.arrivalTick, `config ${leg.config} agent ${leg.agent} arrival`).toBe(
        leg.arrivalTick,
      );
      expect(resident.evacuationTick, `config ${leg.config} agent ${leg.agent} departure`).toBe(
        leg.evacTick,
      );
      worstSnapGapM = Math.max(worstSnapGapM, Math.abs(resident.snapGapM - leg.snapGapM));
    }

    // eslint-disable-next-line no-console
    console.log(
      `[FIX-A] movement oracle: ${interiorRows} interior walking ticks BIT-EXACT, ` +
        `${toleranceRows} leg-consuming/frozen rows within ${worstFinalM.toExponential(3)} m ` +
        `(budget ${FINAL_TICK_TOLERANCE_M}), worst position offset ` +
        `${worstPositionM.toExponential(3)} m, worst snap-gap offset ` +
        `${worstSnapGapM.toExponential(3)} m`,
    );
    expect(interiorRows).toBeGreaterThanOrEqual(manifest.configs * manifest.agents_per_config * 10);
    expect(toleranceRows).toBeGreaterThan(0);
  });
});
