/**
 * useReducedMotion.ts — `prefers-reduced-motion` wiring (WP13, §6.7).
 *
 * Under reduced motion the Run screen's center swaps the per-frame agent
 * animation (MapView) for the state-census flow chart, which advances once
 * per simulated hour — no continuous motion. The DECISION is the pure,
 * Node-tested {@link runCenterMode}; the hook only reads the media query.
 *
 * The hook is `useSyncExternalStore`-based so a live preference change (OS
 * setting flipped mid-session) re-renders immediately, and it is safe under
 * Node/SSR: with no `window.matchMedia` it reports `false` (motion allowed)
 * and subscribes to nothing.
 */

import { useSyncExternalStore } from "react";

/** The media query, verbatim. */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** What the Run screen's center panel renders. */
export type RunCenterMode = "animated-map" | "census-flow";

/**
 * THE reduced-motion branch, as a pure decision: `true` (user prefers reduced
 * motion) → the state-census flow chart replaces the per-frame agent
 * animation; `false` → the animated map.
 */
export function runCenterMode(prefersReducedMotion: boolean): RunCenterMode {
  return prefersReducedMotion ? "census-flow" : "animated-map";
}

function canQuery(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function subscribe(onStoreChange: () => void): () => void {
  if (!canQuery()) {
    return () => undefined;
  }
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => {
    mql.removeEventListener("change", onStoreChange);
  };
}

function getSnapshot(): boolean {
  return canQuery() && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** `true` when the user's OS/browser asks for reduced motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
