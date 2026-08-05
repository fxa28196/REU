/**
 * Pure deck.gl layer-data builders for the Run-screen map (WP11).
 *
 * Everything here is a pure function from decoded assets / stream frames to
 * the prop objects deck.gl consumes. **No deck.gl runtime import** — the
 * builders are typed structurally, so `app/test/map-layers.test.ts` runs them
 * under plain node with no DOM and no WebGL. `MapView.tsx` is the only module
 * that instantiates actual Layer classes from these props.
 *
 * ## Zero-copy discipline
 *
 * The agent frame arrives from the sim worker as transferable Float32/Uint8
 * buffers (`@websim/engine` `FrameBatch`). {@link buildAgentLayerData} wraps
 * those arrays in deck.gl's binary-attribute form (`{length, attributes}`)
 * WITHOUT copying: `attributes.getPosition.value` is the caller's own
 * Float32Array (asserted by identity in the tests), and `getFillColor` is an
 * index accessor that reads the caller's Uint8Array live. 6,842 residents at
 * 60 fps never touch a per-frame copy.
 *
 * ## Freeways — why the de-emphasis tier defaults to empty
 *
 * The plan (§6.5) says "freeways de-emphasized + 'excluded from graph'
 * legend". The certified graph asset contains **no freeway-class features at
 * all**: the U-27 filter (RLIS `TYPE` ∈ {1110, 1120, 1121, 1122, 1123}) drops
 * 2,636 features / 614 km before export, from graph AND display (PORT_MAP
 * §1, DR-A05). So there is nothing in the asset to de-emphasise from data;
 * the honest map states that exclusion in its legend (owned by the legend
 * component, not this module). {@link buildStreetPaths} still accepts a
 * per-edge classifier so a future names/type source can dim arterials —
 * with no classifier every edge renders in the single street tier, and the
 * `startIndices` table is the geometry's own `polyOffset`, zero-copy.
 *
 * ## Determinism rules honoured here
 *
 * No `Math.random`, no `Date.now`. The density-cell builder aggregates
 * through a keyed map but the *output order* is produced by an explicit
 * numeric sort over an array — no Map/Set iteration order ever feeds the
 * order of anything displayed.
 */

import { STATES } from "@websim/engine/agents";
import type { GraphGeometry } from "@websim/shared/graph-asset";

import {
  SHELTER_FILL_CLOSED_RGBA,
  SHELTER_FILL_OPEN_RGBA,
  SHELTER_RING_CLOSED_RGBA,
  SHELTER_RING_OPEN_RGBA,
  STATE_COLORS,
  UNKNOWN_STATE_RGBA,
} from "./colors.js";
import type { RGBA } from "./colors.js";

// ---------------------------------------------------------------------------
// streets
// ---------------------------------------------------------------------------

/**
 * One PathLayer-shaped binary data table: variable-length paths through a flat
 * interleaved XY vertex buffer. `startIndices[i]` is the first *vertex* index
 * of path `i` (deck.gl's binary-data contract; pair with `_pathType: "open"`
 * and `positionFormat: "XY"` on the layer).
 */
export interface StreetPathData {
  readonly length: number;
  readonly startIndices: Int32Array | Uint32Array;
  readonly attributes: {
    readonly getPath: { readonly value: Float32Array; readonly size: 2 };
  };
}

export interface StreetPaths {
  /** The street tier — with no classifier, every edge in the asset. */
  readonly streets: StreetPathData;
  /** The de-emphasised tier; `null` when the classifier marked nothing. */
  readonly deEmphasized: StreetPathData | null;
}

/** Interleave the geometry's split lon/lat tables into one XY Float32 buffer. */
function interleaveXY(
  lon: Float64Array,
  lat: Float64Array,
  from: number,
  to: number,
  out: Float32Array,
  outBase: number,
): void {
  for (let v = from; v < to; v++) {
    out[outBase + 2 * (v - from)] = lon[v]!;
    out[outBase + 2 * (v - from) + 1] = lat[v]!;
  }
}

/**
 * Build the streets PathLayer data from the decoded geometry container.
 *
 * Without a classifier the result is a single tier whose `startIndices` IS
 * `geometry.polyOffset` (zero-copy; the only allocation is the unavoidable
 * f64→f32 interleave of the vertex table, done once per decoded graph, not
 * per frame). With a classifier, edges are partitioned into two tiers in
 * ascending edge order.
 */
export function buildStreetPaths(
  geometry: GraphGeometry,
  isDeEmphasized?: (edge: number) => boolean,
): StreetPaths {
  const { edgeCount, vertexCount, polyOffset, polyLon, polyLat } = geometry;

  if (isDeEmphasized === undefined) {
    const value = new Float32Array(vertexCount * 2);
    interleaveXY(polyLon, polyLat, 0, vertexCount, value, 0);
    return {
      streets: {
        length: edgeCount,
        startIndices: polyOffset,
        attributes: { getPath: { value, size: 2 } },
      },
      deEmphasized: null,
    };
  }

  const deFlags = new Uint8Array(edgeCount);
  let deEdges = 0;
  let deVerts = 0;
  for (let e = 0; e < edgeCount; e++) {
    if (isDeEmphasized(e)) {
      deFlags[e] = 1;
      deEdges++;
      deVerts += polyOffset[e + 1]! - polyOffset[e]!;
    }
  }

  const mainEdges = edgeCount - deEdges;
  const mainVerts = vertexCount - deVerts;
  const mainStart = new Uint32Array(mainEdges + 1);
  const deStart = new Uint32Array(deEdges + 1);
  const mainValue = new Float32Array(mainVerts * 2);
  const deValue = new Float32Array(deVerts * 2);

  let mi = 0;
  let mv = 0;
  let di = 0;
  let dv = 0;
  for (let e = 0; e < edgeCount; e++) {
    const from = polyOffset[e]!;
    const to = polyOffset[e + 1]!;
    if (deFlags[e] === 1) {
      deStart[di] = dv;
      interleaveXY(polyLon, polyLat, from, to, deValue, dv * 2);
      dv += to - from;
      di++;
    } else {
      mainStart[mi] = mv;
      interleaveXY(polyLon, polyLat, from, to, mainValue, mv * 2);
      mv += to - from;
      mi++;
    }
  }
  mainStart[mainEdges] = mv;
  deStart[deEdges] = dv;

  return {
    streets: {
      length: mainEdges,
      startIndices: mainStart,
      attributes: { getPath: { value: mainValue, size: 2 } },
    },
    deEmphasized:
      deEdges === 0
        ? null
        : {
            length: deEdges,
            startIndices: deStart,
            attributes: { getPath: { value: deValue, size: 2 } },
          },
  };
}

// ---------------------------------------------------------------------------
// agents
// ---------------------------------------------------------------------------

/** One display frame's agent arrays, as the worker stream delivers them. */
export interface AgentFrame {
  /** `[resident] -> (lon, lat)` interleaved; length ≥ residentCount * 2. */
  readonly positions: Float32Array;
  /** `[resident] -> STATES index` (255 = unknown); length ≥ residentCount. */
  readonly states: Uint8Array;
  readonly residentCount: number;
}

/** What a ScatterplotLayer needs, wrapping the frame's own buffers. */
export interface AgentLayerData {
  readonly data: {
    readonly length: number;
    readonly attributes: {
      readonly getPosition: { readonly value: Float32Array; readonly size: 2 };
    };
  };
  readonly getFillColor: (object: unknown, info: { readonly index: number }) => RGBA;
  /** Pass to the layer's `updateTriggers.getFillColor` (state array identity). */
  readonly updateTriggers: { readonly getFillColor: Uint8Array };
}

/**
 * Per-state fill table in `STATES` byte order. SHELTERED is alpha 0: sheltered
 * residents collapse into the shelter occupancy counters (the green shelter
 * fill) instead of stacking thousands of dots on shelter doorsteps.
 */
const AGENT_RGBA: readonly RGBA[] = STATES.map((name): RGBA => {
  const [r, g, b] = STATE_COLORS[name];
  return name === "SHELTERED" ? [r, g, b, 0] : [r, g, b, 255];
});

/**
 * Wrap one frame's transferable buffers for the agents ScatterplotLayer —
 * zero-copy (see module doc). Throws if the arrays cannot hold
 * `residentCount` residents, which catches an un-sliced multi-frame batch
 * only when it is *too small*, never by copying it.
 */
export function buildAgentLayerData(frame: AgentFrame): AgentLayerData {
  const { positions, states, residentCount } = frame;
  if (!Number.isInteger(residentCount) || residentCount < 0) {
    throw new RangeError(`residentCount must be a non-negative integer, got ${residentCount}`);
  }
  if (positions.length < residentCount * 2) {
    throw new RangeError(
      `positions holds ${positions.length} floats; ${residentCount} residents need ${residentCount * 2}`,
    );
  }
  if (states.length < residentCount) {
    throw new RangeError(`states holds ${states.length} bytes; need ${residentCount}`);
  }
  const getFillColor = (_object: unknown, info: { readonly index: number }): RGBA => {
    const code = states[info.index];
    const rgba = code === undefined ? undefined : AGENT_RGBA[code];
    return rgba ?? UNKNOWN_STATE_RGBA;
  };
  return {
    data: { length: residentCount, attributes: { getPosition: { value: positions, size: 2 } } },
    getFillColor,
    updateTriggers: { getFillColor: states },
  };
}

// ---------------------------------------------------------------------------
// shelters
// ---------------------------------------------------------------------------

/** The UI-plane view of one shelter at the current tick. */
export interface ShelterView {
  readonly id: string;
  readonly name: string;
  readonly lon: number;
  readonly lat: number;
  readonly capacity: number;
  readonly occupancy: number;
  /** Open at the tick being displayed (shelters open on different real dates). */
  readonly openNow: boolean;
}

/** Derived render datum for the two shelter ScatterplotLayers. */
export interface ShelterDatum {
  readonly id: string;
  readonly name: string;
  readonly position: [number, number];
  /** Outer ring radius — area proportional to capacity. */
  readonly capacityRadiusM: number;
  /** Inner fill radius — occupied share of the capacity *area*. */
  readonly occupancyRadiusM: number;
  /** occupancy / capacity, clamped to [0, 1]. */
  readonly occupancyFraction: number;
  readonly openNow: boolean;
  readonly fillColor: RGBA;
  readonly ringColor: RGBA;
}

/** Metres of ring radius per √person of capacity (radius ~ sqrt(capacity)). */
export const SHELTER_RADIUS_M_PER_SQRT_CAPACITY = 22;

/** Floor so a tiny shelter is still clickable/visible at metro zoom. */
export const SHELTER_MIN_RADIUS_M = 60;

/**
 * Derive the shelter render data. Radius grows with sqrt(capacity) so *area*
 * is proportional to beds (monotone non-decreasing in capacity, tested); the
 * occupancy disc fills the ring in area terms (`r_occ = r_cap * sqrt(frac)`),
 * so a half-full shelter shows a half-filled ring by area. A shelter closed
 * at this tick renders entirely grey.
 */
export function buildShelterData(shelters: readonly ShelterView[]): ShelterDatum[] {
  return shelters.map((s): ShelterDatum => {
    const capacityRadiusM = Math.max(
      SHELTER_MIN_RADIUS_M,
      SHELTER_RADIUS_M_PER_SQRT_CAPACITY * Math.sqrt(Math.max(s.capacity, 0)),
    );
    const rawFraction = s.capacity > 0 ? s.occupancy / s.capacity : s.occupancy > 0 ? 1 : 0;
    const occupancyFraction = Math.min(Math.max(rawFraction, 0), 1);
    return {
      id: s.id,
      name: s.name,
      position: [s.lon, s.lat],
      capacityRadiusM,
      occupancyRadiusM: capacityRadiusM * Math.sqrt(occupancyFraction),
      occupancyFraction,
      openNow: s.openNow,
      fillColor: s.openNow ? SHELTER_FILL_OPEN_RGBA : SHELTER_FILL_CLOSED_RGBA,
      ringColor: s.openNow ? SHELTER_RING_OPEN_RGBA : SHELTER_RING_CLOSED_RGBA,
    };
  });
}

// ---------------------------------------------------------------------------
// encampment density grid — never points
// ---------------------------------------------------------------------------

/**
 * Grid cell size in degrees (~390 m east-west / ~560 m north-south at
 * Portland's latitude). The grid is anchored at (0°, 0°) — a pure function of
 * the cell size, never of the data — so the same input always yields the
 * same cells.
 */
export const ENCAMPMENT_CELL_SIZE_DEG = 0.005;

/** One aggregated density cell. `position` is the cell's SW corner. */
export interface DensityCell {
  readonly cellX: number;
  readonly cellY: number;
  readonly count: number;
  readonly position: [number, number];
  readonly polygon: [number, number][];
}

/**
 * The public encampment layer's node tables (a structural subset of
 * `EncampmentsPublic` from `@websim/shared/graph-asset`): already-public
 * street-node coordinates plus the per-report slot table. Raw report
 * coordinates never exist in this asset.
 */
export interface EncampmentDensitySource {
  readonly nodeLon: Float64Array;
  readonly nodeLat: Float64Array;
  /** Per report row: index into the node tables (report weights come from here). */
  readonly rowSlot: Int32Array;
}

/**
 * Aggregate encampment *reports* into grid cells — the map draws density
 * cells only, never per-report or per-node points (plan §6.5; the ethics
 * constraint, README §1 item 8, and this rendering rule point the same way).
 *
 * Each report row contributes weight 1 to the cell containing its snapped
 * street node. Aggregation uses a keyed map, but the returned array is
 * ordered by an explicit `(cellY, cellX)` numeric sort — map iteration order
 * never reaches the display.
 */
export function buildEncampmentDensityCells(
  src: EncampmentDensitySource,
  cellSizeDeg: number = ENCAMPMENT_CELL_SIZE_DEG,
): DensityCell[] {
  if (!(cellSizeDeg > 0)) {
    throw new RangeError(`cellSizeDeg must be positive, got ${cellSizeDeg}`);
  }
  const nodeCount = Math.min(src.nodeLon.length, src.nodeLat.length);
  const weights = new Float64Array(nodeCount);
  for (let r = 0; r < src.rowSlot.length; r++) {
    const slot = src.rowSlot[r]!;
    if (slot >= 0 && slot < nodeCount) {
      weights[slot] = weights[slot]! + 1;
    }
  }

  const byKey = new Map<string, { cellX: number; cellY: number; count: number }>();
  for (let n = 0; n < nodeCount; n++) {
    const w = weights[n]!;
    if (w <= 0) {
      continue;
    }
    const cellX = Math.floor(src.nodeLon[n]! / cellSizeDeg);
    const cellY = Math.floor(src.nodeLat[n]! / cellSizeDeg);
    const key = `${cellX},${cellY}`;
    const cell = byKey.get(key);
    if (cell === undefined) {
      byKey.set(key, { cellX, cellY, count: w });
    } else {
      cell.count += w;
    }
  }

  const cells = [...byKey.values()];
  cells.sort((a, b) => a.cellY - b.cellY || a.cellX - b.cellX);
  return cells.map((c): DensityCell => {
    const x0 = c.cellX * cellSizeDeg;
    const y0 = c.cellY * cellSizeDeg;
    const x1 = x0 + cellSizeDeg;
    const y1 = y0 + cellSizeDeg;
    return {
      cellX: c.cellX,
      cellY: c.cellY,
      count: c.count,
      position: [x0, y0],
      polygon: [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
    };
  });
}

// ---------------------------------------------------------------------------
// viewport
// ---------------------------------------------------------------------------

export interface FitViewport {
  readonly longitude: number;
  readonly latitude: number;
  readonly zoom: number;
}

/** The Run screen's initial camera: Portland metro. */
export const PORTLAND_VIEW: FitViewport = { longitude: -122.66, latitude: 45.52, zoom: 10.5 };

/**
 * Pure web-mercator bounds fit: centre on the bbox of the finite coordinates
 * and pick the largest zoom whose 512-px world tile still shows the whole
 * span in the given viewport (minus 0.2 zoom of breathing room, clamped to
 * [3, 16]). Empty or all-non-finite input falls back to {@link PORTLAND_VIEW}.
 */
export function fitViewport(
  nodeLons: ArrayLike<number>,
  nodeLats: ArrayLike<number>,
  viewportPx: { readonly width: number; readonly height: number } = { width: 960, height: 720 },
): FitViewport {
  const n = Math.min(nodeLons.length, nodeLats.length);
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (let i = 0; i < n; i++) {
    const lon = nodeLons[i]!;
    const lat = nodeLats[i]!;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      continue;
    }
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) {
    return PORTLAND_VIEW;
  }

  const mercY = (lat: number): number => {
    const s = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  };
  const lonFrac = (maxLon - minLon) / 360;
  const latFrac = Math.abs(mercY(minLat) - mercY(maxLat));
  const zoomX = lonFrac > 0 ? Math.log2(viewportPx.width / 512 / lonFrac) : 20;
  const zoomY = latFrac > 0 ? Math.log2(viewportPx.height / 512 / latFrac) : 20;
  const zoom = Math.min(Math.max(Math.min(zoomX, zoomY) - 0.2, 3), 16);
  return { longitude: (minLon + maxLon) / 2, latitude: (minLat + maxLat) / 2, zoom };
}
