/**
 * WP10 UI-thread profile — the **null control** (DR-WP10-uithread-perf).
 *
 * Eight cold-page cells stalled identically on Firefox — with frames on and
 * off, with the snapshot ring at 0, 31, 122 and 142 MB, at two populations, at
 * two slice cadences, and at the shipped `RUN_OPTION_DEFAULTS`. When a variable
 * makes no difference across that much of the design space, the honest next
 * question is whether the *remaining* constants are doing it, and there are only
 * two: the page, and the probe.
 *
 * So: no worker, no simulation, no stream. Just the probe, on a cold page, for
 * the same wall-clock duration.
 *
 *  - If a ~150 ms gap appears anyway, the WP10 gate's red number is a property
 *    of a cold Firefox page under a high-rate `MessageChannel` loop, and it says
 *    nothing about the frame protocol, the ring, or the engine.
 *  - If the page stays clean, the stall needs the worker, and the search
 *    narrows back to what the worker does.
 *
 * `N2` additionally drops the probe's own hop rate by ~700x (`setTimeout(0)`,
 * clamped to 4 ms when nested). If the stall survives that, the probe's own
 * `MessageEvent` churn is not what triggers it.
 *
 * One cell per page — the effect is positional, so the others must be skipped:
 *
 * ```
 *   npx vitest run --config engine/vitest.profile.config.mts --browser=firefox \
 *     engine/test-browser/profile/wp10-null.profile.ts -t "N1"
 * ```
 */

import { describe, expect, it } from "vitest";

import { AttributingProbe, ENGINE, ENGINE_LABEL, summarise } from "./instrument.js";

const IDLE_MS = 40_000;

async function idle(label: string, hopVia: "immediate" | "timeout" | "vsync"): Promise<void> {
  const probe = new AttributingProbe();
  probe.start(hopVia);
  await new Promise<void>((r) => {
    setTimeout(r, IDLE_MS);
  });
  const stopped = probe.stop();
  // `summarise` wants a worker; this control has none, so report the probe alone.
  void summarise;
  // eslint-disable-next-line no-console -- the distribution IS the deliverable.
  console.log(
    `[wp10-null] ${ENGINE} ${label}`,
    JSON.stringify({
      engine: ENGINE,
      label,
      hopVia,
      samples: stopped.samples,
      hopsPerSecond: Math.round(stopped.samples / (stopped.windowMs / 1000)),
      windowMs: stopped.windowMs,
      max: stopped.maxMs,
      longTasks: stopped.longTasks,
      over25: stopped.over25Ms,
      p999: stopped.p999Ms,
      worst: stopped.worstMs,
      rafCount: stopped.rafCount,
      rafMaxGapMs: stopped.rafMaxGapMs,
      gaps: stopped.gaps.slice(0, 4),
    }),
  );
  expect(stopped.samples, `${label}: the probe never ran`).toBeGreaterThan(100);
}

describe(`WP10 UI-thread null control [${ENGINE_LABEL}]`, () => {
  it("N1 cold page, probe only, full hop rate, no worker at all", async () => {
    await idle("N1-idle-full", "immediate");
  }, 300_000);

  it("N2 cold page, probe only, hops via setTimeout(0)", async () => {
    await idle("N2-idle-throttled", "timeout");
  }, 300_000);

  it("N3 cold page, probe only, ~60 Hz — the probe allocates ~3000x less", async () => {
    await idle("N3-idle-vsync", "vsync");
  }, 300_000);
});
