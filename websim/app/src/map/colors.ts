/**
 * Map colour vocabulary (WP11) — every colour the Run-screen map renders.
 *
 * ## Agent state colours
 *
 * {@link STATE_COLORS} is total over the engine's `STATES` (typed
 * `Record<State, RGB>`, so a new state fails the compile here before it can
 * render uncoloured; `app/test/map-layers.test.ts` re-asserts totality at
 * runtime). The palette is Okabe & Ito's colourblind-safe categorical set
 * (Okabe, M. & Ito, K., "Color Universal Design", 2008) plus the grey commonly
 * appended to it, chosen against the app's dark background (#14161a):
 *
 * - black is omitted (invisible on the dark theme), yellow is held in reserve;
 * - SHELTERED shares its green with the shelter occupancy fill on purpose —
 *   sheltered residents are drawn as shelter counters, not dots (`layers.ts`
 *   collapses them to alpha 0), so the green disc at a shelter *is* the
 *   SHELTERED population.
 *
 * ## Smoke scrim ramp — DISPLAY CONVENTION, NOT SCIENCE
 *
 * The scrim opacity anchors in {@link SMOKE_SCRIM_ANCHORS} are a rendering
 * convention and carry no health or exposure meaning whatsoever:
 *
 * - `0 µg/m³` → fully transparent (no smoke, no tint; a data gap — `NaN` — is
 *   also fully transparent, never a fabricated tint);
 * - `55.5 µg/m³` → first clearly visible amber tint. 55.5 is the engine's
 *   `UNHEALTHY_UGM3` — the EPA "Unhealthy" breakpoint **lower-bound
 *   concentration** (µg/m³). It is a concentration threshold; it is never a
 *   24-hour AQI category, and this file must not describe it as one.
 * - `562.7 µg/m³` → the ramp's "heavy" ceiling. This is simply the worst hour
 *   of the certified 2020 smoke series, adopted as the display ceiling so the
 *   ramp's full range is actually exercised by the data. It is not a
 *   breakpoint, standard, or category of any kind.
 *
 * Between anchors the alpha is linear; above the ceiling it clamps. The ramp is
 * monotone non-decreasing over all finite inputs (tested). The scrim is
 * county-uniform because the model's smoke field is a county-uniform scalar
 * (A-01) — the tint deliberately renders no spatial structure the model does
 * not have.
 */

import { UNHEALTHY_UGM3 } from "@websim/engine/agents";
import type { State } from "@websim/engine/agents";

/** Immutable rgb triple, channels 0–255. */
export type RGB = readonly [number, number, number];

/**
 * Mutable-typed rgba tuple, channels 0–255 — deck.gl's `Color` type is a
 * mutable tuple, so accessor return values use this alias.
 */
export type RGBA = [number, number, number, number];

/**
 * Okabe-Ito-based colour per agent state, total over `STATES`.
 *
 * PRE_EVAC          sky blue       — aware, waiting to depart
 * EN_ROUTE          orange         — walking
 * SHELTERED         bluish green   — study endpoint (rendered via shelter fill)
 * UNREACHABLE       vermillion     — terminal: nothing reachable on the graph
 * REFUSED_ALL_FULL  reddish purple — everywhere full *right now* (re-checked)
 * UNAWARE           grey           — not yet reached by outreach
 */
export const STATE_COLORS: Record<State, RGB> = {
  PRE_EVAC: [86, 180, 233],
  EN_ROUTE: [230, 159, 0],
  SHELTERED: [0, 158, 115],
  UNREACHABLE: [213, 94, 0],
  REFUSED_ALL_FULL: [204, 121, 167],
  UNAWARE: [153, 153, 153],
};

/**
 * Defect marker for a state byte outside the `STATES` table (the frame encoder
 * writes 255 for an unknown state). Magenta is deliberately *not* in the
 * Okabe-Ito set: it can never be mistaken for a real state, so a wire-format
 * drift is visible instead of quietly recoloured.
 */
export const UNKNOWN_STATE_RGBA: RGBA = [255, 0, 255, 255];

/** Streets — the basemap. Muted slate over the #14161a background. */
export const STREET_RGBA: RGBA = [74, 80, 88, 255];

/** De-emphasised street tier (see `layers.ts` on why this defaults to unused). */
export const STREET_DEEMPHASIZED_RGBA: RGBA = [46, 50, 56, 255];

/** Shelter capacity ring, open: near-white so the ring reads at small sizes. */
export const SHELTER_RING_OPEN_RGBA: RGBA = [230, 232, 235, 210];

/** Shelter occupancy fill, open — the SHELTERED green (see module doc). */
export const SHELTER_FILL_OPEN_RGBA: RGBA = [0, 158, 115, 220];

/** Shelter capacity ring when the shelter is closed at this tick: muted grey. */
export const SHELTER_RING_CLOSED_RGBA: RGBA = [154, 162, 171, 130];

/** Shelter occupancy fill when closed: grey — never the open green. */
export const SHELTER_FILL_CLOSED_RGBA: RGBA = [110, 116, 124, 150];

/** Encampment density cells — Okabe-Ito blue, alpha scaled by density. */
export const ENCAMPMENT_DENSITY_RGB: RGB = [0, 114, 178];

/**
 * Fill for one encampment density cell. Alpha grows with `sqrt(count/max)` so
 * sparse cells stay visible without the densest cell saturating the map;
 * monotone non-decreasing in `count` for a fixed `maxCount`.
 */
export function encampmentDensityRGBA(count: number, maxCount: number): RGBA {
  const [r, g, b] = ENCAMPMENT_DENSITY_RGB;
  if (!(count > 0) || !(maxCount > 0)) {
    return [r, g, b, 0];
  }
  const t = Math.sqrt(Math.min(count / maxCount, 1));
  return [r, g, b, Math.round(24 + t * 96)];
}

/**
 * Smoke scrim anchor points — a **display convention, not science** (see the
 * module doc for what each number is and is not).
 */
export const SMOKE_SCRIM_ANCHORS = {
  /** No smoke → no tint. */
  clearUgM3: 0,
  /**
   * First clearly visible tint, at the EPA "Unhealthy" breakpoint lower-bound
   * **concentration** (µg/m³) — the engine's own constant, imported so 55.5 is
   * defined in exactly one place. Never an AQI category.
   */
  visibleUgM3: UNHEALTHY_UGM3,
  /** Ramp ceiling: the certified 2020 series' worst hour. Display anchor only. */
  heavyUgM3: 562.7,
  clearAlpha: 0,
  visibleAlpha: 46,
  heavyAlpha: 140,
} as const;

/** Scrim tint colour — amber (Okabe-Ito orange). */
export const SMOKE_SCRIM_RGB: RGB = [230, 159, 0];

/**
 * Scrim alpha (0–255) for a concentration in µg/m³.
 *
 * Piecewise-linear through the anchors, clamped at the ceiling; monotone
 * non-decreasing over all finite inputs. `NaN` (a data gap in the smoke
 * series) and negative values return 0 — a gap is rendered as *no* smoke
 * claim, never as a fabricated tint.
 */
export function smokeScrimAlpha(ugM3: number): number {
  const a = SMOKE_SCRIM_ANCHORS;
  if (!Number.isFinite(ugM3) || ugM3 <= a.clearUgM3) {
    return a.clearAlpha;
  }
  if (ugM3 >= a.heavyUgM3) {
    return a.heavyAlpha;
  }
  if (ugM3 >= a.visibleUgM3) {
    const t = (ugM3 - a.visibleUgM3) / (a.heavyUgM3 - a.visibleUgM3);
    return Math.round(a.visibleAlpha + t * (a.heavyAlpha - a.visibleAlpha));
  }
  const t = (ugM3 - a.clearUgM3) / (a.visibleUgM3 - a.clearUgM3);
  return Math.round(a.clearAlpha + t * (a.visibleAlpha - a.clearAlpha));
}

/** Full scrim rgba for a concentration in µg/m³ (colour fixed, alpha ramped). */
export function smokeScrimRGBA(ugM3: number): RGBA {
  const [r, g, b] = SMOKE_SCRIM_RGB;
  return [r, g, b, smokeScrimAlpha(ugM3)];
}
