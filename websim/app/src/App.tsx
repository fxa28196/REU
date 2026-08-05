/**
 * App shell (WP11): top bar (title, screen tabs from `SCREENS`, badge slot),
 * screen switch, and the always-visible attribution footer.
 *
 * The top-bar badge slot is the compact chip (state + its Okabe-Ito colour);
 * the FULL BadgePanel — provenance line, honest sentence, attribution — lives
 * in the Run screen's right rail. `DATA_ATTRIBUTION_LINE` renders in the page
 * footer on EVERY screen, without interaction, as `src/index.ts` requires.
 */
import { useState } from "react";
import type { ReactElement } from "react";

import { DATA_ATTRIBUTION_LINE, SCREENS } from "./index.js";
import type { Screen } from "./index.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { inkOn } from "./a11y/contrast.js";
import { badgeColor, badgeGlyph } from "./badge/BadgePanel.js";
import { Archive } from "./screens/Archive.js";
import { Compare } from "./screens/Compare.js";
import { Provenance } from "./screens/Provenance.js";
import { Run } from "./screens/Run.js";
import { encodePermalink, usePermalinkSync } from "./permalink/url.js";
import useAppStore from "./state/store.js";
import type { PresetId, RunConfig } from "@websim/shared";

const SCREEN_LABELS: Readonly<Record<Screen, string>> = {
  run: "Run",
  compare: "Compare",
  archive: "Archive",
  provenance: "Provenance",
};

function ScreenBody({ screen }: { readonly screen: Screen }): ReactElement {
  switch (screen) {
    case "run":
      return <Run />;
    case "compare":
      return <Compare />;
    case "archive":
      return <Archive />;
    case "provenance":
      return <Provenance />;
  }
}

/**
 * Copy the current configuration's permalink to the clipboard.
 *
 * Kept here rather than in `permalink/url.ts` because it is a UI affordance,
 * not codec logic: the module stays free of clipboard/DOM concerns and remains
 * fully testable in Node. Falls back to prompting with the URL when the
 * Clipboard API is unavailable (non-secure context, older WebKit) — a research
 * tool must never silently fail to hand over a link the user asked for.
 */
async function copyPermalink(presetId: PresetId, config: RunConfig): Promise<string> {
  const fragment = encodePermalink({ presetId, config });
  const url = `${window.location.origin}${window.location.pathname}${window.location.search}${fragment}`;
  try {
    await navigator.clipboard.writeText(url);
    return "Permalink copied to the clipboard.";
  } catch {
    window.prompt("Copy this permalink:", url);
    return "Clipboard unavailable — the link is shown above.";
  }
}

export function App(): ReactElement {
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const badge = useAppStore((s) => s.badge);
  const presetId = useAppStore((s) => s.presetId);
  const config = useAppStore((s) => s.config);
  // WP12 acceptance ("config -> URL -> config round-trips identically") is a
  // property of the SHIPPED app, not of the codec alone: this mount is what
  // makes an incoming #p= link apply and every config change write one back.
  // The acceptance gate of 2026-08-04 found the hook implemented, tested and
  // never mounted — the codec passed 46 tests while the product could not read
  // a link. Do not remove this call without removing the clause.
  const { notice } = usePermalinkSync();
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  return (
    <div className="app-shell">
      {/* WP13: keyboard users skip the top bar straight to the active screen. */}
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="app-topbar">
        <h1 className="app-title">Capacity Is Not Access</h1>
        <nav className="app-tabs" aria-label="Screens">
          {SCREENS.map((s) => (
            <button
              key={s}
              type="button"
              className={s === screen ? "app-tab app-tab-active" : "app-tab"}
              aria-pressed={s === screen}
              onClick={() => setScreen(s)}
            >
              {SCREEN_LABELS[s]}
            </button>
          ))}
        </nav>
        {/* A permalink is a diff against a preset, so there is nothing to
            encode until one is selected — disabled, with the reason, rather
            than a button that silently does nothing. */}
        <button
          type="button"
          className="app-permalink-button"
          disabled={presetId === null}
          onClick={() => {
            if (presetId === null) {
              return;
            }
            void copyPermalink(presetId, config).then(setCopyStatus, (err: unknown) => {
              setCopyStatus(`Could not build a permalink: ${err instanceof Error ? err.message : String(err)}`);
            });
          }}
          title={
            presetId === null
              ? "Select a preset first — a permalink encodes the difference from one"
              : "Copy a link that reproduces exactly this configuration"
          }
        >
          Copy permalink
        </button>
        <span
          className="app-topbar-badge"
          // The ink is computed from the swatch, not fixed: see a11y/contrast.ts
          // (`.app-topbar-badge` was the axe color-contrast violation present on
          // all four screens — dark ink on the blue chip measured 3.49:1).
          style={{ background: badgeColor(badge), color: inkOn(badgeColor(badge)) }}
          title="Badge for the current configuration — details in the Run screen's badge panel"
        >
          <span aria-hidden="true">{badgeGlyph(badge)} </span>
          {badge}
        </span>
      </header>
      {/* A stale or mangled incoming link is REPORTED, never silently replaced
          by the boot config — the migration notice is the evidence. */}
      {notice === null ? null : (
        <p className="app-notice" role="status">
          {notice}
        </p>
      )}
      {copyStatus === null ? null : (
        <p className="app-notice" role="status">
          {copyStatus}
        </p>
      )}
      <main className="app-content" id="main-content" tabIndex={-1}>
        {/* WP14: a render-time throw in a screen degrades to an honest
            "this panel failed" message with the error text — never a white
            screen. Keyed by screen so switching screens retries the render. */}
        <ErrorBoundary key={screen} label={`${SCREEN_LABELS[screen]} screen`}>
          <ScreenBody screen={screen} />
        </ErrorBoundary>
      </main>
      <footer className="app-footer">{DATA_ATTRIBUTION_LINE}</footer>
    </div>
  );
}
