/**
 * Badge panel — the chip, the provenance line, the honest sentence, and the
 * attribution footer, in one place.
 *
 * Colors are Okabe-Ito (colorblind-safe) and match the badge's meaning:
 * ARCHIVE-VALIDATED green, ENGINE-CERTIFIED blue, EXPLORATORY amber, INVALID
 * vermillion with watermark-style emphasis. The provenance line renders one of
 * the two `PROVENANCE_CLASSES` labels verbatim — a live number must never wear
 * the archived class, or the reverse. The footer renders
 * `DATA_ATTRIBUTION_LINE` verbatim, visible without interaction.
 */
import { memo } from "react";
import type { CSSProperties, ReactElement } from "react";

import { DATA_ATTRIBUTION_LINE, PROVENANCE_CLASSES } from "../index";
import type { BadgeState, ProvenanceClass } from "../index";
import { inkOn } from "../a11y/contrast.js";

/** Okabe-Ito chip color per badge state. */
export const BADGE_COLORS: Record<BadgeState, string> = {
  "ARCHIVE-VALIDATED": "#009E73",
  "ENGINE-CERTIFIED": "#0072B2",
  EXPLORATORY: "#E69F00",
  INVALID: "#D55E00",
};

/** Pure lookup, exported for tests. */
export function badgeColor(state: BadgeState): string {
  return BADGE_COLORS[state];
}

/**
 * Non-colour glyph per badge state (WP13: colour is never the sole channel —
 * the chip already carries the state NAME as text; the glyph adds a shape
 * channel). Total over `BadgeState`; all four distinct (pinned in
 * `app/test/a11y.test.ts`).
 */
export const BADGE_GLYPHS: Record<BadgeState, string> = {
  "ARCHIVE-VALIDATED": "✓",
  "ENGINE-CERTIFIED": "◆",
  EXPLORATORY: "△",
  INVALID: "✕",
};

/** Pure lookup, exported for tests and the top-bar chip. */
export function badgeGlyph(state: BadgeState): string {
  return BADGE_GLYPHS[state];
}

/**
 * Pure mapping from provenance class to its required display label.
 * `null` (no numbers on screen yet) yields `null` — the panel then says so
 * instead of guessing a class.
 */
export function provenanceLabel(provenance: ProvenanceClass | null): string | null {
  return provenance === null ? null : PROVENANCE_CLASSES[provenance];
}

export interface BadgePanelProps {
  readonly badge: BadgeState;
  readonly provenance: ProvenanceClass | null;
  readonly explanation: string;
}

const panelStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  background: "#1c1f24",
  color: "#e6e8eb",
  borderRadius: 6,
  padding: "12px 16px",
};

const watermarkStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transform: "rotate(-16deg)",
  fontSize: "3rem",
  fontWeight: 900,
  letterSpacing: "0.3em",
  color: "rgba(213, 94, 0, 0.14)",
  pointerEvents: "none",
  userSelect: "none",
};

function chipStyle(badge: BadgeState): CSSProperties {
  return {
    display: "inline-block",
    background: badgeColor(badge),
    // Not a fixed dark ink: on the ENGINE-CERTIFIED blue that measured 3.49:1
    // (axe `color-contrast`, serious). `inkOn` picks whichever ink actually
    // clears AA on this swatch — dark on green/amber/vermillion, white on blue.
    color: inkOn(badgeColor(badge)),
    fontWeight: 700,
    fontSize: "0.8rem",
    letterSpacing: "0.05em",
    padding: "2px 10px",
    borderRadius: 999,
    border: badge === "INVALID" ? "2px solid #e6e8eb" : "2px solid transparent",
  };
}

const provenanceStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "0.85rem",
  color: "#e6e8eb",
};

const noProvenanceStyle: CSSProperties = {
  ...provenanceStyle,
  color: "#9aa2ab",
  fontStyle: "italic",
};

const explanationStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: "0.85rem",
  color: "#9aa2ab",
};

const footerStyle: CSSProperties = {
  margin: "12px 0 0",
  paddingTop: 8,
  borderTop: "1px solid #2a2e35",
  fontSize: "0.72rem",
  color: "#9aa2ab",
};

/**
 * WP14 perf: memoised — the Run screen re-renders up to 60×/s while a run
 * streams frames; this panel's three props (badge, provenance class,
 * explanation string) change only on config edits or provenance transitions,
 * so the shallow compare skips virtually every frame.
 */
export const BadgePanel = memo(function BadgePanel({
  badge,
  provenance,
  explanation,
}: BadgePanelProps): ReactElement {
  const label = provenanceLabel(provenance);
  return (
    <section style={panelStyle} aria-label="Run badge and provenance">
      {badge === "INVALID" ? (
        <div aria-hidden="true" style={watermarkStyle}>
          INVALID
        </div>
      ) : null}
      <span style={chipStyle(badge)}>
        <span aria-hidden="true">{badgeGlyph(badge)} </span>
        {badge}
      </span>
      {label !== null ? (
        <p style={provenanceStyle}>{label}</p>
      ) : (
        <p style={noProvenanceStyle}>No numbers on screen — no provenance class to declare.</p>
      )}
      <p style={explanationStyle}>{explanation}</p>
      <footer style={footerStyle}>{DATA_ATTRIBUTION_LINE}</footer>
    </section>
  );
});
