/**
 * Archive screen — honest WP12 placeholder. The archive bundles are already
 * shipped and the Run screen's archived panel reads them; the browsing UI is
 * WP12. No fake data.
 */
import type { ReactElement } from "react";

export function Archive(): ReactElement {
  return (
    <div className="placeholder-wrap">
      <section className="panel placeholder-panel" aria-label="Archive placeholder">
        <h2 className="panel-title">Archive — ships in WP12</h2>
        <p className="panel-sub">
          WP12 adds a browser over the shipped archive bundles — digests of the certified,
          read-only Java run archive — filterable by preset family and seed, each entry showing
          its headline metrics and its recorded SHA-256, all under the &quot;Certified Java run&quot;
          provenance class. Until then, an archived preset&apos;s headline is visible on the Run
          screen the moment the preset is selected.
        </p>
      </section>
    </div>
  );
}
