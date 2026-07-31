/**
 * Typed handle on `geographiclib-geodesic` for the WP2-S3 harness.
 *
 * The package ships untyped-ish results where every field is optional (they are
 * populated per outmask). Every call site here passes an outmask that includes
 * the fields it reads, so those fields are declared required — the alternative
 * is a `!` on every hot-loop field access, which is noise, not safety.
 *
 * NB: keep `WGS84` as an object and never destructure its methods —
 * geographiclib's `Direct`/`Inverse` are prototype methods that rely on `this`.
 */

import geodesicPkg from "geographiclib-geodesic";

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
export const WGS84 = Geodesic.WGS84;

/** What Java's `Geodesic.Direct(lat1, lon1, azi1, s12)` computes. */
export const DIRECT_MASK_JAVA_STANDARD: number = Geodesic.STANDARD;
/** Tuning lever: only lat2/lon2 are read by the movement code. */
export const DIRECT_MASK_POSITION_ONLY: number = Geodesic.LATITUDE | Geodesic.LONGITUDE;
/** What Java's `Geodesic.Inverse(lat1, lon1, lat2, lon2)` computes. */
export const INVERSE_MASK_JAVA_STANDARD: number = Geodesic.STANDARD;
/** Segment-geometry precompute needs the length and both azimuths only. */
export const INVERSE_MASK_LENGTH_AZIMUTH: number = Geodesic.DISTANCE | Geodesic.AZIMUTH;
