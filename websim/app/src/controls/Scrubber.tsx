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

/** Playback speeds: simulated minutes per wall second, or "max" (unpaced). */
export const SPEED_SETTINGS = [1, 10, 60, 600, "max"] as const;
export type SpeedSetting = (typeof SPEED_SETTINGS)[number];

export const MINUTES_PER_DAY = 1440;

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

export function speedLabel(setting: SpeedSetting): string {
  return setting === "max" ? "max" : `${setting}x`;
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

      <span aria-label="Simulated clock" style={{ minWidth: "7.5rem" }}>
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
