/**
 * WP11 map builders — pure-logic tests (no DOM, no WebGL, no deck.gl import).
 *
 * The four contract points the task pins:
 *  1. agent layer data wraps the SAME Float32Array (identity, zero-copy);
 *  2. state → colour is total over the engine's `STATES`;
 *  3. shelter radius is monotone in capacity;
 *  4. the smoke scrim ramp is monotone with its documented anchors — and the
 *     anchors are display convention (55.5 is the engine's own concentration
 *     threshold constant, never re-typed here).
 */

import { describe, expect, it } from "vitest";

import { STATES, UNHEALTHY_UGM3 } from "@websim/engine/agents";
import type { GraphGeometry } from "@websim/shared/graph-asset";

import {
  buildAgentLayerData,
  buildEncampmentDensityCells,
  buildShelterData,
  buildStreetPaths,
  fitViewport,
  PORTLAND_VIEW,
  SHELTER_MIN_RADIUS_M,
} from "../src/map/layers.js";
import type { ShelterView } from "../src/map/layers.js";
import {
  SHELTER_FILL_CLOSED_RGBA,
  SHELTER_FILL_OPEN_RGBA,
  SHELTER_RING_CLOSED_RGBA,
  SMOKE_SCRIM_ANCHORS,
  smokeScrimAlpha,
  smokeScrimRGBA,
  STATE_COLORS,
  UNKNOWN_STATE_RGBA,
} from "../src/map/colors.js";

// ---------------------------------------------------------------------------
// 1. state → colour totality
// ---------------------------------------------------------------------------

describe("STATE_COLORS", () => {
  it("is total over STATES with valid, distinct rgb channels", () => {
    const seen = new Array<string>();
    for (const name of STATES) {
      const rgb = STATE_COLORS[name];
      expect(rgb, `state ${name} has no colour`).toBeDefined();
      expect(rgb).toHaveLength(3);
      for (const ch of rgb) {
        expect(Number.isInteger(ch)).toBe(true);
        expect(ch).toBeGreaterThanOrEqual(0);
        expect(ch).toBeLessThanOrEqual(255);
      }
      seen.push(rgb.join(","));
    }
    // No two states share a colour — colour is a channel, not the only one,
    // but a collision would silently merge two states on the map.
    expect(new Set(seen).size).toBe(STATES.length);
  });
});

// ---------------------------------------------------------------------------
// 2. agent layer data — zero-copy identity + state colouring
// ---------------------------------------------------------------------------

describe("buildAgentLayerData", () => {
  const residentCount = STATES.length;
  const positions = new Float32Array(residentCount * 2);
  for (let i = 0; i < residentCount; i++) {
    positions[2 * i] = -122.6 - i * 0.001;
    positions[2 * i + 1] = 45.5 + i * 0.001;
  }
  const states = new Uint8Array(residentCount);
  for (let i = 0; i < residentCount; i++) {
    states[i] = i; // one resident in every state, in STATES order
  }

  it("wraps the SAME Float32Array — identity, zero copy", () => {
    const out = buildAgentLayerData({ positions, states, residentCount });
    expect(out.data.attributes.getPosition.value).toBe(positions);
    expect(out.data.attributes.getPosition.size).toBe(2);
    expect(out.data.length).toBe(residentCount);
    expect(out.updateTriggers.getFillColor).toBe(states);
  });

  it("colours every state from STATE_COLORS, collapsing SHELTERED to alpha 0", () => {
    const out = buildAgentLayerData({ positions, states, residentCount });
    for (let i = 0; i < STATES.length; i++) {
      const name = STATES[i]!;
      const [r, g, b] = STATE_COLORS[name];
      const rgba = out.getFillColor(undefined, { index: i });
      expect(rgba.slice(0, 3)).toEqual([r, g, b]);
      // SHELTERED residents render as shelter occupancy counters, not dots.
      expect(rgba[3]).toBe(name === "SHELTERED" ? 0 : 255);
    }
  });

  it("reads the live states array (no colour snapshot taken at build time)", () => {
    const mutable = new Uint8Array(states);
    const out = buildAgentLayerData({ positions, states: mutable, residentCount });
    const enRoute = STATES.indexOf("EN_ROUTE");
    const unreachable = STATES.indexOf("UNREACHABLE");
    mutable[0] = unreachable;
    expect(out.getFillColor(undefined, { index: 0 }).slice(0, 3)).toEqual([
      ...STATE_COLORS.UNREACHABLE,
    ]);
    mutable[0] = enRoute;
    expect(out.getFillColor(undefined, { index: 0 }).slice(0, 3)).toEqual([
      ...STATE_COLORS.EN_ROUTE,
    ]);
  });

  it("renders the 255 unknown-state marker as the magenta defect colour", () => {
    const badStates = new Uint8Array([255]);
    const out = buildAgentLayerData({
      positions: new Float32Array(2),
      states: badStates,
      residentCount: 1,
    });
    expect(out.getFillColor(undefined, { index: 0 })).toEqual(UNKNOWN_STATE_RGBA);
  });

  it("rejects arrays too small for residentCount", () => {
    expect(() =>
      buildAgentLayerData({ positions: new Float32Array(2), states: new Uint8Array(2), residentCount: 2 }),
    ).toThrow(RangeError);
    expect(() =>
      buildAgentLayerData({ positions: new Float32Array(4), states: new Uint8Array(1), residentCount: 2 }),
    ).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// 3. shelter data — radius monotone in capacity
// ---------------------------------------------------------------------------

function shelter(overrides: Partial<ShelterView>): ShelterView {
  return {
    id: "s0",
    name: "Test Shelter",
    lon: -122.66,
    lat: 45.52,
    capacity: 100,
    occupancy: 0,
    openNow: true,
    ...overrides,
  };
}

describe("buildShelterData", () => {
  it("capacity radius is monotone non-decreasing in capacity", () => {
    const capacities = [0, 1, 5, 10, 25, 50, 100, 250, 500, 1000];
    const radii = capacities.map(
      (capacity) => buildShelterData([shelter({ capacity })])[0]!.capacityRadiusM,
    );
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]!).toBeGreaterThanOrEqual(radii[i - 1]!);
    }
    // Strictly increasing once above the minimum-radius floor.
    const above = radii.filter((r) => r > SHELTER_MIN_RADIUS_M);
    for (let i = 1; i < above.length; i++) {
      expect(above[i]!).toBeGreaterThan(above[i - 1]!);
    }
    // sqrt scaling: 4x the capacity doubles the radius (area ~ capacity).
    const r250 = buildShelterData([shelter({ capacity: 250 })])[0]!.capacityRadiusM;
    const r1000 = buildShelterData([shelter({ capacity: 1000 })])[0]!.capacityRadiusM;
    expect(r1000 / r250).toBeCloseTo(2, 10);
  });

  it("occupancy fill never exceeds the capacity ring and clamps overflow", () => {
    const half = buildShelterData([shelter({ capacity: 100, occupancy: 50 })])[0]!;
    expect(half.occupancyRadiusM).toBeLessThan(half.capacityRadiusM);
    expect(half.occupancyFraction).toBeCloseTo(0.5, 10);
    // Equal-area encoding: half the beds fill half the ring area.
    expect((half.occupancyRadiusM / half.capacityRadiusM) ** 2).toBeCloseTo(0.5, 10);

    const over = buildShelterData([shelter({ capacity: 100, occupancy: 140 })])[0]!;
    expect(over.occupancyFraction).toBe(1);
    expect(over.occupancyRadiusM).toBeCloseTo(over.capacityRadiusM, 10);
  });

  it("renders a closed shelter grey, never in the open green", () => {
    const closed = buildShelterData([shelter({ openNow: false, occupancy: 10 })])[0]!;
    expect(closed.fillColor).toEqual(SHELTER_FILL_CLOSED_RGBA);
    expect(closed.ringColor).toEqual(SHELTER_RING_CLOSED_RGBA);
    const open = buildShelterData([shelter({ occupancy: 10 })])[0]!;
    expect(open.fillColor).toEqual(SHELTER_FILL_OPEN_RGBA);
    expect(open.fillColor).not.toEqual(closed.fillColor);
  });
});

// ---------------------------------------------------------------------------
// 4. smoke scrim — monotone ramp with the documented anchors
// ---------------------------------------------------------------------------

describe("smoke scrim ramp", () => {
  it("anchors match the documented display convention", () => {
    // 55.5 is the engine's concentration threshold constant — single source.
    expect(SMOKE_SCRIM_ANCHORS.visibleUgM3).toBe(UNHEALTHY_UGM3);
    expect(SMOKE_SCRIM_ANCHORS.visibleUgM3).toBe(55.5);
    expect(SMOKE_SCRIM_ANCHORS.heavyUgM3).toBe(562.7);
    expect(smokeScrimAlpha(0)).toBe(0);
    expect(smokeScrimAlpha(55.5)).toBe(SMOKE_SCRIM_ANCHORS.visibleAlpha);
    expect(smokeScrimAlpha(562.7)).toBe(SMOKE_SCRIM_ANCHORS.heavyAlpha);
    expect(SMOKE_SCRIM_ANCHORS.visibleAlpha).toBeGreaterThan(0);
    expect(SMOKE_SCRIM_ANCHORS.heavyAlpha).toBeGreaterThan(SMOKE_SCRIM_ANCHORS.visibleAlpha);
  });

  it("is monotone non-decreasing over the whole finite range and clamps", () => {
    let prev = -1;
    for (let c = 0; c <= 700; c += 0.7) {
      const a = smokeScrimAlpha(c);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
    expect(smokeScrimAlpha(10_000)).toBe(SMOKE_SCRIM_ANCHORS.heavyAlpha);
  });

  it("renders a gap (NaN) and negatives as fully transparent — never a fabricated tint", () => {
    expect(smokeScrimAlpha(Number.NaN)).toBe(0);
    expect(smokeScrimAlpha(-5)).toBe(0);
    expect(smokeScrimRGBA(Number.NaN)[3]).toBe(0);
  });

  it("only the alpha ramps; the tint colour is constant", () => {
    const a = smokeScrimRGBA(10);
    const b = smokeScrimRGBA(600);
    expect(a.slice(0, 3)).toEqual(b.slice(0, 3));
  });
});

// ---------------------------------------------------------------------------
// streets — startIndices identity and partitioning
// ---------------------------------------------------------------------------

function syntheticGeometry(): GraphGeometry {
  // Two edges: edge 0 has 3 vertices, edge 1 has 2.
  return {
    edgeCount: 2,
    vertexCount: 5,
    polyOffset: new Int32Array([0, 3, 5]),
    polyLon: new Float64Array([-122.6, -122.61, -122.62, -122.7, -122.71]),
    polyLat: new Float64Array([45.5, 45.51, 45.52, 45.6, 45.61]),
  };
}

describe("buildStreetPaths", () => {
  it("without a classifier reuses polyOffset as startIndices (zero-copy)", () => {
    const geometry = syntheticGeometry();
    const { streets, deEmphasized } = buildStreetPaths(geometry);
    expect(deEmphasized).toBeNull();
    expect(streets.length).toBe(2);
    expect(streets.startIndices).toBe(geometry.polyOffset);
    expect(streets.attributes.getPath.size).toBe(2);
    const value = streets.attributes.getPath.value;
    expect(value).toHaveLength(10);
    for (let v = 0; v < geometry.vertexCount; v++) {
      expect(value[2 * v]).toBe(Math.fround(geometry.polyLon[v]!));
      expect(value[2 * v + 1]).toBe(Math.fround(geometry.polyLat[v]!));
    }
  });

  it("partitions edges into tiers with consistent startIndices", () => {
    const geometry = syntheticGeometry();
    const { streets, deEmphasized } = buildStreetPaths(geometry, (e) => e === 1);
    expect(streets.length).toBe(1);
    expect([...streets.startIndices]).toEqual([0, 3]);
    expect(streets.attributes.getPath.value).toHaveLength(6);
    expect(streets.attributes.getPath.value[0]).toBe(Math.fround(-122.6));

    expect(deEmphasized).not.toBeNull();
    expect(deEmphasized!.length).toBe(1);
    expect([...deEmphasized!.startIndices]).toEqual([0, 2]);
    expect(deEmphasized!.attributes.getPath.value).toHaveLength(4);
    expect(deEmphasized!.attributes.getPath.value[0]).toBe(Math.fround(-122.7));
    expect(deEmphasized!.attributes.getPath.value[1]).toBe(Math.fround(45.6));
  });

  it("a classifier that marks nothing yields an empty de-emphasised tier", () => {
    const { streets, deEmphasized } = buildStreetPaths(syntheticGeometry(), () => false);
    expect(deEmphasized).toBeNull();
    expect(streets.length).toBe(2);
    expect([...streets.startIndices]).toEqual([0, 3, 5]);
  });
});

// ---------------------------------------------------------------------------
// encampment density — cells only, deterministic order
// ---------------------------------------------------------------------------

describe("buildEncampmentDensityCells", () => {
  const src = {
    nodeLon: new Float64Array([-122.001, -122.002, -122.6]),
    nodeLat: new Float64Array([45.501, 45.5015, 45.52]),
    // 4 reports: two on node 0, one each on nodes 1 and 2.
    rowSlot: new Int32Array([0, 0, 1, 2]),
  };

  it("aggregates report weights into cells; total count equals the report rows", () => {
    const cells = buildEncampmentDensityCells(src);
    const total = cells.reduce((acc, c) => acc + c.count, 0);
    expect(total).toBe(src.rowSlot.length);
    // Nodes 0 and 1 fall in the same 0.005° cell → merged; node 2 stands alone.
    expect(cells).toHaveLength(2);
    const counts = cells.map((c) => c.count).sort((a, b) => a - b);
    expect(counts).toEqual([1, 3]);
  });

  it("emits grid cells, never per-report points", () => {
    const cells = buildEncampmentDensityCells(src);
    for (const c of cells) {
      // Cell corners are multiples of the grid size anchored at (0,0) —
      // a pure function of the grid, never a report/node coordinate.
      expect(c.position[0]).toBeCloseTo(c.cellX * 0.005, 10);
      expect(c.position[1]).toBeCloseTo(c.cellY * 0.005, 10);
      expect(c.polygon).toHaveLength(4);
    }
  });

  it("output order is deterministic (explicit sort, not map order)", () => {
    const a = buildEncampmentDensityCells(src);
    const b = buildEncampmentDensityCells(src);
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) {
      const prev = a[i - 1]!;
      const cur = a[i]!;
      expect(cur.cellY > prev.cellY || (cur.cellY === prev.cellY && cur.cellX > prev.cellX)).toBe(
        true,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// viewport fit
// ---------------------------------------------------------------------------

describe("fitViewport", () => {
  it("falls back to the Portland view on empty input", () => {
    expect(fitViewport([], [])).toEqual(PORTLAND_VIEW);
    expect(PORTLAND_VIEW).toEqual({ longitude: -122.66, latitude: 45.52, zoom: 10.5 });
  });

  it("centres on the bbox and zooms out for wider extents", () => {
    const tight = fitViewport([-122.7, -122.6], [45.5, 45.6]);
    const wide = fitViewport([-123.5, -121.5], [44.5, 46.5]);
    expect(tight.longitude).toBeCloseTo(-122.65, 10);
    expect(tight.latitude).toBeCloseTo(45.55, 10);
    expect(tight.zoom).toBeGreaterThan(wide.zoom);
  });
});
