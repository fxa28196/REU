/**
 * App shell (WP11): top bar (title, screen tabs from `SCREENS`, badge slot),
 * screen switch, and the always-visible attribution footer.
 *
 * The top-bar badge slot is the compact chip (state + its Okabe-Ito colour);
 * the FULL BadgePanel — provenance line, honest sentence, attribution — lives
 * in the Run screen's right rail. `DATA_ATTRIBUTION_LINE` renders in the page
 * footer on EVERY screen, without interaction, as `src/index.ts` requires.
 */
import type { ReactElement } from "react";

import { DATA_ATTRIBUTION_LINE, SCREENS } from "./index.js";
import type { Screen } from "./index.js";
import { badgeColor } from "./badge/BadgePanel.js";
import { Archive } from "./screens/Archive.js";
import { Compare } from "./screens/Compare.js";
import { Provenance } from "./screens/Provenance.js";
import { Run } from "./screens/Run.js";
import useAppStore from "./state/store.js";

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

export function App(): ReactElement {
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const badge = useAppStore((s) => s.badge);

  return (
    <div className="app-shell">
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
        <span
          className="app-topbar-badge"
          style={{ background: badgeColor(badge) }}
          title="Badge for the current configuration — details in the Run screen's badge panel"
        >
          {badge}
        </span>
      </header>
      <main className="app-content">
        <ScreenBody screen={screen} />
      </main>
      <footer className="app-footer">{DATA_ATTRIBUTION_LINE}</footer>
    </div>
  );
}
