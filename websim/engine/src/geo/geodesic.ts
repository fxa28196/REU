/**
 * Typed handle on the **vendored** `geographiclib-geodesic` (plan §1.2: "Direct only, math
 * via fdlibm module; Inverse mooted by baked weights").
 *
 * <p><b>WP7 task C1 — divergence 11.</b> This module used to import the shipped
 * `geographiclib-geodesic` package, which calls the host `Math.sin/cos/atan/atan2/pow/log1p/
 * cbrt/atanh` directly. DR-WP3 §5 measured the result: Chromium 141, Firefox 142 and WebKit
 * 26 each produced a *different* `geo.geodesic` digest, so the cross-engine gate could only
 * bound the divergence (3.2 nm) rather than assert byte identity, which plan §1.2 and Q12
 * commitment 3 require. It now imports
 * {@link import("./vendor/geographiclib-geodesic.vendored.js")} — the same sources with
 * exactly those call sites rewritten onto the `mathx` fdlibm kernels by
 * `tools/vendor-geodesic.ts`, byte-for-byte reproducible from `node_modules` and checked as
 * such in `engine/test/geo/vendor.provenance.test.ts`.
 *
 * <p>The `geographiclib-geodesic` dependency is deliberately **kept** in `engine/package.json`:
 * it is the input to the vendoring step and the reference for the differential test, not a
 * runtime dependency of the engine any more.
 *
 * Promoted verbatim in behaviour from the WP2-S3 spike handle. Two rules that
 * cost real time to rediscover are encoded here rather than left to call sites:
 *
 *  - **Never destructure `WGS84.Direct` / `.Inverse`.** They are prototype
 *    methods that rely on `this`; a destructured reference throws at the first
 *    call, in a hot loop, in a worker.
 *  - **Always pass an explicit outmask.** The package populates result fields
 *    per mask and types them all optional; every mask constant below is paired
 *    with the result interface whose fields that mask actually fills.
 *
 * `Inverse` appears in the engine in exactly one place — precomputing per-edge
 * cumulative segment lengths (`cumLen.ts`), which is a *within-edge*
 * interpolation aid. Routing weights are never computed here: they arrive
 * Java-authoritative in the packed asset.
 */

import geodesicPkg from "./vendor/geographiclib-geodesic.vendored.js";

export interface DirectResult {
  readonly lat2: number;
  readonly lon2: number;
}

export interface InverseResult {
  readonly s12: number;
  readonly azi1: number;
  readonly azi2: number;
}

interface GeodesicApi {
  readonly STANDARD: number;
  readonly LATITUDE: number;
  readonly LONGITUDE: number;
  readonly DISTANCE: number;
  readonly AZIMUTH: number;
  readonly WGS84: {
    Direct: (lat1: number, lon1: number, azi1: number, s12: number, outmask: number) => DirectResult;
    Inverse: (lat1: number, lon1: number, lat2: number, lon2: number, outmask: number) => InverseResult;
  };
}

export const Geodesic: GeodesicApi = (geodesicPkg as unknown as { Geodesic: GeodesicApi }).Geodesic;

/** The WGS84 ellipsoid handle. Keep it an object; never destructure its methods. */
export const WGS84 = Geodesic.WGS84;

/** What Java's `Geodesic.Direct(lat1, lon1, azi1, s12)` computes. */
export const DIRECT_MASK_JAVA_STANDARD: number = Geodesic.STANDARD;

/** Movement reads lat2/lon2 only (DR-S3 §5, the render-cadence lever). */
export const DIRECT_MASK_POSITION_ONLY: number = Geodesic.LATITUDE | Geodesic.LONGITUDE;

/** What Java's `Geodesic.Inverse(lat1, lon1, lat2, lon2)` computes. */
export const INVERSE_MASK_JAVA_STANDARD: number = Geodesic.STANDARD;

/** Segment-geometry precompute needs the length and both azimuths only. */
export const INVERSE_MASK_LENGTH_AZIMUTH: number = Geodesic.DISTANCE | Geodesic.AZIMUTH;

/**
 * `StreetNetwork.geodesicDistanceM(a, b)` — note the argument order: JTS
 * `Coordinate.x` is longitude, and every GeographicLib call in the certified
 * source swaps to (lat, lon). Taking lon/lat here and swapping inside is what
 * keeps call sites reading like the Java they port.
 */
export function geodesicDistanceM(lonA: number, latA: number, lonB: number, latB: number): number {
  return WGS84.Inverse(latA, lonA, latB, lonB, INVERSE_MASK_JAVA_STANDARD).s12;
}
