/**
 * Scrubber.tsx — the Run screen's timeline control (WP11).
 *
 * Controlled component: it owns no simulation state. The parent wires
 * `onScrub` to `SimWorkerClient.scrubTo`, `onPlay`/`onPause` to the run lanes,
 * and `onSpeed` to the tick pacing. "Compute to end" is `onScrub(endTick)` —
 * landing exactly on the final tick via the deterministic scrub path, so no
 * separate callback (and no second code path) exists for it.
 *
 * All time formatting is pure and exported (`formatTickClock`), tested in
 * `app/test/param-meta.test.ts`. One tick = one simulated minute from
 * 2020-09-07T00:00 local (engine SIM_START); days are 1-based. No `Date`
 * arithmetic — the clock is integer math on the tick index.
 */

import type { ChangeEvent, CSSProperties, JSX } from "react";

// ---------------------------------------------------------------------------
// Pure logic (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Playback speeds: **simulated minutes per wall-clock second**, or `"max"`
 * (unpaced, run as fast as the worker can).
 *
 * One tick is one simulated minute, so a setting of `1` advances one tick per
 * second and `0.1` advances one tick every ten seconds.
 *
 * The five settings at or below `1` were added 2026-08-05 because the previous
 * scale bottomed out at "one simulated minute per second" and, more to the
 * point, **nothing was paced at all**: `useSimRun` called `runFreely()` with no
 * bound, so every setting including `1` ran flat out and a 312-hour run
 * finished in about five seconds. The selector was cosmetic. It is now wired
 * (see `PACING_FRAME_MS` and `pacingFor`), and the slow half exists so the
 * evacuation is actually watchable: at `0.1` a resident takes a visible step
 * every ten seconds, which is the scale at which street-by-street routing can
 * be followed by eye.
 *
 * Ordered slowest to fastest so the select reads like a dial, and deliberately
 * SYMMETRIC about `1`: five settings slower than one simulated minute per
 * second and five faster, so "as many ways to go slow as to go fast" is a
 * property of the list rather than a wish. `app/test/param-meta.test.ts`
 * asserts that symmetry, so adding a fast setting without a slow one fails.
 */
export const SPEED_SETTINGS = [0.02, 0.05, 0.1, 0.2, 0.5, 1, 5, 10, 60, 600, 3600, "max"] as const;
export type SpeedSetting = (typeof SPEED_SETTINGS)[number];

export const MINUTES_PER_DAY = 1440;

/**
 * The pacing loop's wall-clock step, in milliseconds.
 *
 * 100 ms rather than one animation frame: the loop is a chain of worker
 * round-trips, and asking for 60 of those a second spends more time in
 * `postMessage` than in the model. At 100 ms the fastest paced setting still
 * gets ten batches a second, which the display ceiling
 * (`FREE_RUN_MAX_FPS = 60`) is already well above.
 */
export const PACING_FRAME_MS = 100;

export interface PacingStep {
  /** Ticks to advance in one step. Always at least 1: a step that advanced
   *  nothing would spin the worker without moving the simulation. */
  readonly ticks: number;
  /** Wall-clock milliseconds to wait AFTER that step. */
  readonly waitMs: number;
}

/**
 * Translate a speed setting into "advance N ticks, then wait M ms".
 *
 * Two regimes, and the split is the reason this is a function rather than a
 * multiplication:
 *
 *  - **Slower than one tick per frame** (below 10 sim-min/s): advance exactly
 *    one tick and wait `1000 / speed` ms. Fractional ticks do not exist, so the
 *    only honest way to go slower is to wait longer.
 *  - **Faster**: advance a whole frame's worth and wait one frame. Rounding is
 *    `max(1, round(...))`, so the rate is approximate at the boundary and
 *    exact everywhere it matters.
 *
 * Pure and exported so the arithmetic is tested without a worker.
 */
export function pacingFor(speed: Exclude<SpeedSetting, "max">): PacingStep {
  const msPerTick = 1000 / speed;
  if (msPerTick >= PACING_FRAME_MS) {
    return { ticks: 1, waitMs: msPerTick };
  }
  return { ticks: Math.max(1, Math.round((speed * PACING_FRAME_MS) / 1000)), waitMs: PACING_FRAME_MS };
}

/**
 * Format a tick as a simulated wall clock: `"Day D HH:MM"`.
 * Tick 0 = Day 1 00:00 (2020-09-07T00:00 local); tick 1440 = Day 2 00:00.
 * Negative or fractional input is clamped/floored — display only.
 */
export function formatTickClock(tick: number): string {
  const t = Math.max(0, Math.floor(tick));
  const day = Math.floor(t / MINUTES_PER_DAY) + 1;
  const minuteOfDay = t % MINUTES_PER_DAY;
  const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
  const mm = String(minuteOfDay % 60).padStart(2, "0");
  return `Day ${day} ${hh}:${mm}`;
}

/** Marker position along the track, in percent (0–100). 0 when endTick <= 0. */
export function markerLeftPercent(tick: number, endTick: number): number {
  if (!(endTick > 0)) {
    return 0;
  }
  const clamped = Math.min(Math.max(tick, 0), endTick);
  return (clamped / endTick) * 100;
}

/** Parse a speed select's string value back to a `SpeedSetting`; falls back to 1. */
export function parseSpeedSetting(raw: string): SpeedSetting {
  if (raw === "max") {
    return "max";
  }
  const numeric = Number(raw);
  for (const setting of SPEED_SETTINGS) {
    if (setting === numeric) {
      return setting;
    }
  }
  return 1;
}

/**
 * Label a speed in the unit a viewer can actually reason about.
 *
 * `"1x"` meant nothing here: one times WHAT? These say how much simulated time
 * passes per real second, which is the only question a viewer is asking when
 * they reach for this control. Below one simulated minute per second the rate
 * is inverted into "one minute per N seconds", because "0.1 min/s" is a worse
 * way of saying "a minute every ten seconds".
 */
export function speedLabel(setting: SpeedSetting): string {
  if (setting === "max") {
    return "max (unpaced)";
  }
  if (setting < 1) {
    return `1 sim-min / ${Math.round(1 / setting)}s`;
  }
  if (setting < 60) {
    return `${setting} sim-min / s`;
  }
  const hours = setting / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} sim-h / s`;
}

/**
 * How long a full run takes at a given speed, in wall-clock seconds.
 *
 * Rendered beside the selector so nobody picks the slowest setting on a
 * 455-hour run without being told that is a three-day wait. `null` for `"max"`,
 * which is bounded by the machine and not by the clock.
 */
export function estimatedRunSeconds(setting: SpeedSetting, endTick: number): number | null {
  return setting === "max" ? null : endTick / setting;
}

/** `estimatedRunSeconds` rendered for humans: "about 4 min", "about 2.3 days". */
export function formatDuration(seconds: number): string {
  if (seconds < 90) {
    return `about ${Math.round(seconds)} s`;
  }
  if (seconds < 5400) {
    return `about ${Math.round(seconds / 60)} min`;
  }
  if (seconds < 172_800) {
    return `about ${(seconds / 3600).toFixed(1)} h`;
  }
  return `about ${(seconds / 86_400).toFixed(1)} days`;
}

/**
 * Spoken value of the range input (`aria-valuetext`, WP13): the simulated
 * clock rather than a raw tick number — "Day 1 01:19 of Day 4 23:00". The
 * current tick is clamped into the track's range, like the rendered `value`.
 */
export function scrubberValueText(tick: number, endTick: number): string {
  return `${formatTickClock(Math.min(tick, endTick))} of ${formatTickClock(endTick)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ScrubberProps {
  /** Current tick (1 tick = 1 simulated minute). */
  readonly tick: number;
  /** Last tick of the run window. */
  readonly endTick: number;
  /** Ticks at which the engine holds keyframes (cheap scrub targets). */
  readonly keyframeTicks: readonly number[];
  readonly playing: boolean;
  /**
   * Disables the button while it reads "Play" (e.g. assets/worker still
   * booting). Never disables "Pause" — a running leg must stay stoppable.
   */
  readonly playDisabled?: boolean;
  readonly speed: SpeedSetting;
  readonly onPlay: () => void;
  readonly onPause: () => void;
  readonly onScrub: (tick: number) => void;
  readonly onSpeed: (speed: SpeedSetting) => void;
  /** Ticks at which closure waves land — drawn as triangle markers. */
  readonly waveTicks: readonly number[];
}

const COLORS = {
  bg: "#14161a",
  panel: "#1c1f24",
  text: "#e6e8eb",
  muted: "#9aa2ab",
  accent: "#E69F00", // Okabe-Ito orange
} as const;

const rootStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  background: COLORS.panel,
  color: COLORS.text,
  padding: "0.5rem 0.75rem",
  borderRadius: "6px",
  fontFamily: "system-ui, sans-serif",
  fontSize: "0.85rem",
};

const buttonStyle: CSSProperties = {
  background: COLORS.bg,
  color: COLORS.text,
  border: `1px solid ${COLORS.muted}`,
  borderRadius: "4px",
  padding: "0.25rem 0.6rem",
  cursor: "pointer",
};

const trackWrapStyle: CSSProperties = {
  position: "relative",
  flex: 1,
  minWidth: "10rem",
  // Head room above the input for the wave triangles.
  paddingTop: "10px",
};

const waveMarkerStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  width: 0,
  height: 0,
  transform: "translateX(-4px)",
  borderLeft: "4px solid transparent",
  borderRight: "4px solid transparent",
  borderTop: `7px solid ${COLORS.accent}`,
};

const keyframeMarkerStyle: CSSProperties = {
  position: "absolute",
  top: "10px",
  width: "1px",
  height: "6px",
  background: COLORS.muted,
  transform: "translateX(-0.5px)",
};

export function Scrubber(props: ScrubberProps): JSX.Element {
  const {
    tick,
    endTick,
    keyframeTicks,
    playing,
    playDisabled,
    speed,
    onPlay,
    onPause,
    onScrub,
    onSpeed,
    waveTicks,
  } = props;

  const handleScrub = (event: ChangeEvent<HTMLInputElement>): void => {
    onScrub(Number(event.currentTarget.value));
  };

  const estimatedSeconds = estimatedRunSeconds(speed, endTick);

  const handleSpeed = (event: ChangeEvent<HTMLSelectElement>): void => {
    onSpeed(parseSpeedSetting(event.currentTarget.value));
  };

  return (
    <div style={rootStyle}>
      <button
        type="button"
        style={buttonStyle}
        aria-label={playing ? "Pause simulation" : "Play simulation"}
        disabled={playing ? false : playDisabled === true}
        onClick={playing ? onPause : onPlay}
      >
        {playing ? "Pause" : "Play"}
      </button>

      {/* A visually-hidden label rather than `aria-label`: `aria-label` is
          PROHIBITED on the generic role a bare <span> carries, so support for
          it is not guaranteed — axe raised this node as `aria-prohibited-attr`
          (serious) in the 2026-08-05 run, as "incomplete" rather than a
          violation because the outcome is engine-dependent. Real text in the
          accessibility tree has no such ambiguity: this reads as
          "Simulated clock 03:00". */}
      <span style={{ minWidth: "7.5rem" }}>
        <span className="visually-hidden">Simulated clock </span>
        {formatTickClock(tick)}
      </span>

      <div style={trackWrapStyle}>
        {waveTicks.map((waveTick) => (
          <span
            key={`wave-${waveTick}`}
            title={`Closure wave at ${formatTickClock(waveTick)}`}
            style={{ ...waveMarkerStyle, left: `${markerLeftPercent(waveTick, endTick)}%` }}
          />
        ))}
        {keyframeTicks.map((keyframeTick) => (
          <span
            key={`kf-${keyframeTick}`}
            title={`Keyframe at ${formatTickClock(keyframeTick)}`}
            style={{ ...keyframeMarkerStyle, left: `${markerLeftPercent(keyframeTick, endTick)}%` }}
          />
        ))}
        <input
          type="range"
          aria-label="Simulation time scrubber"
          aria-valuetext={scrubberValueText(tick, endTick)}
          style={{ width: "100%", accentColor: COLORS.accent }}
          min={0}
          max={endTick}
          step={1}
          value={Math.min(tick, endTick)}
          onChange={handleScrub}
        />
      </div>

      <span style={{ color: COLORS.muted }}>/ {formatTickClock(endTick)}</span>

      <label style={{ color: COLORS.muted }}>
        Speed{" "}
        <select
          aria-label="Playback speed"
          style={{ ...buttonStyle, padding: "0.2rem 0.3rem" }}
          value={String(speed)}
          onChange={handleSpeed}
        >
          {SPEED_SETTINGS.map((setting) => (
            <option key={String(setting)} value={String(setting)}>
              {speedLabel(setting)}
            </option>
          ))}
        </select>
      </label>
      {/* The honest cost of the choice, live. The slowest setting on a 455-hour
          run is a multi-day wait, and a viewer should learn that from the
          control rather than from waiting. */}
      {estimatedSeconds === null ? null : (
        <span
          style={{ color: "var(--ws-muted)", fontSize: "0.72rem", whiteSpace: "nowrap" }}
          title="Wall-clock time for the FULL run window at this speed, if left to play"
        >
          full run: {formatDuration(estimatedSeconds)}
        </span>
      )}

      <button
        type="button"
        style={buttonStyle}
        aria-label="Compute to end of run window"
        disabled={tick >= endTick}
        onClick={() => onScrub(endTick)}
      >
        Compute to end
      </button>
    </div>
  );
}
