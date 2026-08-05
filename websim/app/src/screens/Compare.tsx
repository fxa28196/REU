/**
 * Compare screen — honest WP12 placeholder. No fake data: nothing is rendered
 * that looks like a comparison, because none has been computed.
 */
import type { ReactElement } from "react";

export function Compare(): ReactElement {
  return (
    <div className="placeholder-wrap">
      <section className="panel placeholder-panel" aria-label="Compare placeholder">
        <h2 className="panel-title">Compare — ships in WP12</h2>
        <p className="panel-sub">
          WP12 runs two configurations in two synced workers on the deterministic lane
          (`runExact`, display ceiling off, so frame emission is a pure function of the tick
          sequence) and renders side-by-side maps with delta cards over the engine&apos;s own run
          census. Nothing is shown here yet because no comparison has been computed.
        </p>
      </section>
    </div>
  );
}
