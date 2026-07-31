/**
 * UI plane — placeholder surface for WP0 part 1 (scaffold).
 *
 * WP11–WP13 turn this into the Vite app (React + MapLibre/deck.gl + uPlot). The
 * scaffold only fixes the vocabulary the rest of the plan refers to: screens,
 * badge states and the two provenance classes that must never be conflated.
 */

/** Screens of the app (plan §6.1). */
export const SCREENS = ["run", "compare", "archive", "provenance"] as const;
export type Screen = (typeof SCREENS)[number];

/**
 * Badge state machine (plan §5.4), ordered strongest to weakest. A badge is
 * earned per configuration; it is never assumed and never inherited.
 */
export const BADGE_STATES = [
  "ARCHIVE-VALIDATED",
  "ENGINE-CERTIFIED",
  "EXPLORATORY",
  "INVALID",
] as const;
export type BadgeState = (typeof BADGE_STATES)[number];

/**
 * Provenance class shown next to every number (plan §6.2/§6.4). A live browser
 * number can never be presented in the archived class, or the reverse.
 */
export const PROVENANCE_CLASSES = {
  archived: "Certified Java run",
  live: "Live browser simulation",
} as const;
export type ProvenanceClass = keyof typeof PROVENANCE_CLASSES;

/** Label that must accompany every constructed (non-measured) smoke series. */
export const CONSTRUCTED_SERIES_LABEL = "CONSTRUCTED COUNTERFACTUAL — NOT MEASURED DATA" as const;
