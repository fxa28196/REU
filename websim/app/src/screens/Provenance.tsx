/**
 * Provenance screen — honest WP12 placeholder. The full attribution record,
 * asset digests, registry snapshot and the quirk ledger (pushtheta-batch-zeroing
 * et al.) render here in WP12. No fake data.
 */
import type { ReactElement } from "react";

export function Provenance(): ReactElement {
  return (
    <div className="placeholder-wrap">
      <section className="panel placeholder-panel" aria-label="Provenance placeholder">
        <h2 className="panel-title">Provenance — ships in WP12</h2>
        <p className="panel-sub">
          WP12 renders the full provenance record: the asset manifest with per-asset SHA-256
          digests as verified at load, the governance registry snapshot, the provenance quirk
          ledger (including the pushThetaThreshold batch-zeroing note every SE/SE2 preset must
          surface), and the complete data-attribution record. The one-line attribution is
          already in the page footer below, visible on every screen.
        </p>
      </section>
    </div>
  );
}
