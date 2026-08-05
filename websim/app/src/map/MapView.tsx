/**
 * MapView (WP11) — deck.gl over a blank MapLibre style.
 *
 * The basemap IS the street graph: the MapLibre style is an inline background
 * colour with **no external tiles, no fonts, no sprites, no network fetches**
 * (the deploy carries only our own assets, and the certified streets layer is
 * a better-provenance basemap than any third-party raster). deck.gl renders
 * through `@deck.gl/mapbox`'s `MapboxOverlay` control so the camera is
 * MapLibre's and the layers follow it.
 *
 * All layer *data* comes from the pure builders in `./layers.ts` (tested
 * without a DOM); this file only instantiates Layer classes from those props.
 *
 * ## Ownership of the buffers
 *
 * `SimWorkerClient.loadGraph` TRANSFERS its ArrayBuffers to the worker — the
 * caller of this component must hand `MapView` buffers it still owns (fetch
 * the asset once, copy or retain before transferring to the worker). A
 * detached buffer fails the decode loudly and renders as an error chip, never
 * as an empty-but-plausible map.
 *
 * The graph is decoded ONCE per `graph` prop identity (`useMemo`); the frame
 * arrays are wrapped zero-copy every frame (see `layers.ts`).
 *
 * ## Layer stack, bottom to top
 *
 *   1. encampment density grid (cells only — never points)
 *   2. streets (de-emphasised tier, then main tier)
 *   3. county-uniform smoke scrim — above the base geography, below the
 *      actors, so state colours stay colourblind-legible under heavy smoke.
 *      County-uniform because the model's smoke field is a county-uniform
 *      scalar (A-01); the scrim deliberately has no spatial structure.
 *   4. shelters: capacity ring + occupancy fill (SHELTERED residents appear
 *      here as the green fill, not as agent dots)
 *   5. agents (instanced scatter over the frame's own Float32 buffer)
 */

import { useEffect, useMemo, useRef } from "react";
import type { ReactElement } from "react";
import { Map as MaplibreMap } from "maplibre-gl";
import type { IControl, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { PathLayer, PolygonLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { Layer, LayersList } from "@deck.gl/core";
import { unpackGeometry, unpackTopology } from "@websim/shared/graph-asset";

import {
  buildAgentLayerData,
  buildEncampmentDensityCells,
  buildShelterData,
  buildStreetPaths,
} from "./layers.js";
import type {
  AgentFrame,
  DensityCell,
  EncampmentDensitySource,
  ShelterDatum,
  ShelterView,
  StreetPaths,
} from "./layers.js";
import {
  encampmentDensityRGBA,
  smokeScrimRGBA,
  STREET_DEEMPHASIZED_RGBA,
  STREET_RGBA,
} from "./colors.js";

export { fitViewport, PORTLAND_VIEW } from "./layers.js";
export type { ShelterView, AgentFrame } from "./layers.js";

export interface MapViewProps {
  /** Undecoded graph asset containers; decoded here once per prop identity. */
  readonly graph: { readonly topology: ArrayBuffer; readonly geometry: ArrayBuffer } | null;
  /** Current display frame (single-frame views over the stream batch). */
  readonly frame: AgentFrame | null;
  readonly shelters: readonly ShelterView[];
  /** County-uniform concentration, µg/m³; `NaN` = gap (no tint), `null` = no scrim. */
  readonly smokeUgM3: number | null;
  /**
   * Encampment density input — either a precomputed `DensityCell[]` or the
   * public encampment node tables (`EncampmentsPublic`-shaped). Anything else
   * renders no density layer. Cells only, never points.
   */
  readonly encampmentDensity?: unknown;
}

/** Blank inline style: our streets are the basemap (see module doc). */
const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#14161a" } }],
};

/**
 * Scrim extent: a fixed rectangle generously covering the RLIS tri-county
 * metro. Display convention only — the smoke scalar is county-uniform (A-01),
 * so the rectangle's edges carry no meaning beyond "cover the map".
 */
const SCRIM_POLYGON: [number, number][] = [
  [-123.5, 45.0],
  [-121.6, 45.0],
  [-121.6, 46.0],
  [-123.5, 46.0],
];

interface DecodedGraph {
  readonly streetPaths: StreetPaths;
  readonly error: null;
}

interface DecodeFailure {
  readonly streetPaths: null;
  readonly error: string;
}

function decodeGraph(
  graph: { readonly topology: ArrayBuffer; readonly geometry: ArrayBuffer },
): DecodedGraph | DecodeFailure {
  try {
    const topology = unpackTopology(new Uint8Array(graph.topology));
    const geometry = unpackGeometry(new Uint8Array(graph.geometry), topology);
    return { streetPaths: buildStreetPaths(geometry), error: null };
  } catch (err) {
    return { streetPaths: null, error: `graph asset failed to decode: ${String(err)}` };
  }
}

function asDensitySource(v: unknown): EncampmentDensitySource | null {
  if (typeof v !== "object" || v === null) {
    return null;
  }
  const o = v as { nodeLon?: unknown; nodeLat?: unknown; rowSlot?: unknown };
  if (
    o.nodeLon instanceof Float64Array &&
    o.nodeLat instanceof Float64Array &&
    o.rowSlot instanceof Int32Array
  ) {
    return { nodeLon: o.nodeLon, nodeLat: o.nodeLat, rowSlot: o.rowSlot };
  }
  return null;
}

function asDensityCells(v: unknown): readonly DensityCell[] | null {
  if (!Array.isArray(v)) {
    return null;
  }
  if (v.length === 0) {
    return [];
  }
  const first: unknown = v[0];
  if (typeof first !== "object" || first === null) {
    return null;
  }
  const c = first as { count?: unknown; polygon?: unknown; cellX?: unknown };
  return typeof c.count === "number" && Array.isArray(c.polygon) && typeof c.cellX === "number"
    ? (v as DensityCell[])
    : null;
}

function buildDeckLayers(
  streetPaths: StreetPaths | null,
  densityCells: readonly DensityCell[] | null,
  shelterData: readonly ShelterDatum[],
  frame: AgentFrame | null,
  smokeUgM3: number | null,
): LayersList {
  const layers: Layer[] = [];

  if (densityCells !== null && densityCells.length > 0) {
    let maxCount = 1;
    for (const c of densityCells) {
      if (c.count > maxCount) {
        maxCount = c.count;
      }
    }
    layers.push(
      new PolygonLayer<DensityCell>({
        id: "encampment-density",
        data: densityCells as DensityCell[],
        getPolygon: (d: DensityCell) => d.polygon,
        getFillColor: (d: DensityCell) => encampmentDensityRGBA(d.count, maxCount),
        stroked: false,
        filled: true,
        pickable: false,
      }),
    );
  }

  if (streetPaths !== null) {
    const de = streetPaths.deEmphasized;
    if (de !== null) {
      layers.push(
        new PathLayer({
          id: "streets-deemphasized",
          data: de,
          _pathType: "open",
          positionFormat: "XY",
          widthUnits: "pixels",
          getWidth: 0.8,
          getColor: STREET_DEEMPHASIZED_RGBA,
          jointRounded: false,
          capRounded: false,
          pickable: false,
        }),
      );
    }
    layers.push(
      new PathLayer({
        id: "streets",
        data: streetPaths.streets,
        _pathType: "open",
        positionFormat: "XY",
        widthUnits: "pixels",
        getWidth: 1.3,
        getColor: STREET_RGBA,
        jointRounded: false,
        capRounded: false,
        pickable: false,
      }),
    );
  }

  if (smokeUgM3 !== null) {
    const rgba = smokeScrimRGBA(smokeUgM3);
    if (rgba[3] > 0) {
      layers.push(
        new PolygonLayer<[number, number][]>({
          id: "smoke-scrim",
          data: [SCRIM_POLYGON],
          getPolygon: (d: [number, number][]) => d,
          getFillColor: rgba,
          stroked: false,
          filled: true,
          pickable: false,
        }),
      );
    }
  }

  if (shelterData.length > 0) {
    layers.push(
      new ScatterplotLayer<ShelterDatum>({
        id: "shelter-capacity-ring",
        data: shelterData as ShelterDatum[],
        getPosition: (d: ShelterDatum) => d.position,
        getRadius: (d: ShelterDatum) => d.capacityRadiusM,
        radiusUnits: "meters",
        radiusMinPixels: 4,
        stroked: true,
        filled: false,
        getLineColor: (d: ShelterDatum) => d.ringColor,
        lineWidthUnits: "pixels",
        getLineWidth: 2,
        pickable: false,
      }),
      new ScatterplotLayer<ShelterDatum>({
        id: "shelter-occupancy-fill",
        data: shelterData as ShelterDatum[],
        getPosition: (d: ShelterDatum) => d.position,
        getRadius: (d: ShelterDatum) => d.occupancyRadiusM,
        radiusUnits: "meters",
        stroked: false,
        filled: true,
        getFillColor: (d: ShelterDatum) => d.fillColor,
        pickable: false,
      }),
    );
  }

  if (frame !== null && frame.residentCount > 0) {
    const agents = buildAgentLayerData(frame);
    layers.push(
      new ScatterplotLayer({
        id: "agents",
        data: agents.data,
        getFillColor: agents.getFillColor,
        radiusUnits: "pixels",
        getRadius: 2.2,
        stroked: false,
        filled: true,
        pickable: false,
        updateTriggers: { getFillColor: agents.updateTriggers.getFillColor },
      }),
    );
  }

  return layers;
}

export function MapView({
  graph,
  frame,
  shelters,
  smokeUgM3,
  encampmentDensity,
}: MapViewProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);

  // Decode ONCE per graph prop identity — the heavy step (container header
  // checks, census cross-checks, f64→f32 interleave) never runs per frame.
  const decoded = useMemo(() => (graph === null ? null : decodeGraph(graph)), [graph]);

  const densityCells = useMemo(() => {
    const src = asDensitySource(encampmentDensity);
    if (src !== null) {
      return buildEncampmentDensityCells(src);
    }
    return asDensityCells(encampmentDensity);
  }, [encampmentDensity]);

  const shelterData = useMemo(() => buildShelterData(shelters), [shelters]);

  // Map + overlay lifecycle. Declared before the layers effect so the overlay
  // exists by the time the first layers effect runs in the same commit.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return undefined;
    }
    const map = new MaplibreMap({
      container,
      style: BLANK_STYLE,
      center: [-122.66, 45.52],
      zoom: 10.5,
      attributionControl: false,
    });
    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    // MapboxOverlay implements the mapbox-gl IControl shape; maplibre's is
    // structurally identical, the nominal types just differ.
    map.addControl(overlay as unknown as IControl);
    overlayRef.current = overlay;
    return () => {
      overlayRef.current = null;
      map.removeControl(overlay as unknown as IControl);
      map.remove();
    };
  }, []);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (overlay === null) {
      return;
    }
    overlay.setProps({
      layers: buildDeckLayers(
        decoded === null ? null : decoded.streetPaths,
        densityCells,
        shelterData,
        frame,
        smokeUgM3,
      ),
    });
  }, [decoded, densityCells, shelterData, frame, smokeUgM3]);

  const decodeError = decoded === null ? null : decoded.error;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#14161a" }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {decodeError !== null ? (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            background: "#1c1f24",
            color: "#e6e8eb",
            padding: "6px 10px",
            fontSize: 12,
            borderRadius: 4,
            maxWidth: "80%",
          }}
        >
          {decodeError}
        </div>
      ) : null}
    </div>
  );
}
