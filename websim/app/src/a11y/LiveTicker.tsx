/**
 * LiveTicker.tsx — the plan's live-region textual ticker (WP13, §6.7):
 * "Hour 79: closure wave 1; 412 sheltered; PM2.5 562 ug/m3".
 *
 * A visible one-line run narrative that doubles as the screen-reader channel:
 * `role="status"` (implicit `aria-live="polite"`, made explicit below) with
 * `aria-atomic` so each announcement is read whole.
 *
 * ## Throttling
 *
 * The message is derived ONLY from the metric series (one row per simulated
 * hour), the wave list and the status phase — never from display frames — via
 * the pure {@link tickerMessage}. Frame batches at 60 fps re-render this
 * component but cannot change its text, and a screen reader only speaks on a
 * DOM text CHANGE, so announcements land at most once per simulated hour (the
 * `nextAnnouncement` gate is the tested statement of this rule).
 */

import { useMemo } from "react";
import type { ReactElement } from "react";

import useAppStore from "../state/store.js";
import { TICKER_EMPTY_TEXT, tickerMessage } from "./announce.js";

export function LiveTicker(): ReactElement {
  const status = useAppStore((s) => s.status);
  const metrics = useAppStore((s) => s.metrics);
  const waves = useAppStore((s) => s.waves);

  // `metrics` identity changes once per metric batch (per simulated hour at
  // stream cadence); `status?.phase` changes only on phase transitions. The
  // memo therefore recomputes — and the DOM text can change — on hour or
  // phase boundaries only, never per display frame.
  const phase = status === null ? null : status.phase;
  const message = useMemo(
    () => tickerMessage(phase === null ? null : { phase }, metrics, waves),
    [phase, metrics, waves],
  );

  return (
    <p className="live-ticker" role="status" aria-live="polite" aria-atomic="true">
      {message ?? TICKER_EMPTY_TEXT}
    </p>
  );
}
