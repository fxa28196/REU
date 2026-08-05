/**
 * SliderDrawer.tsx — collapsible parameter drawer for the Run screen (WP11).
 *
 * Renders one collapsible section per disclosure level from
 * `paramMeta.ts#PARAM_LEVELS`. Every control is a real `<input type="range">`
 * or `<select>` with its value and unit visible; controls whose
 * `enabledWhen` condition fails in the current config are disabled with the
 * condition shown in the tooltip.
 *
 * Honesty surfaces owned here:
 *  - selecting smoke series 1 or 2 renders `CONSTRUCTED_SERIES_LABEL`
 *    verbatim next to the select (they are counterfactuals, not measured data);
 *  - the `simulationHours` slider max tightens to the selected series' slice
 *    count − 1 via `effectiveMax` (the 456-vs-455 gate, enforced in the UI);
 *  - the "modified from preset" chip lists the exact parameter names that
 *    differ from the active preset, straight from the store.
 */

import type { ChangeEvent, CSSProperties, JSX } from "react";

import type { RunConfig } from "@websim/shared/config";
import type { ParamName } from "@websim/shared/schema";

import { CONSTRUCTED_SERIES_LABEL } from "../index.js";
import useAppStore from "../state/store.js";
import type { ControlParamName } from "./paramMeta.js";
import {
  LEVEL_KEYS,
  LEVEL_LABELS,
  PARAM_CONTROL_META,
  PARAM_LEVELS,
  effectiveMax,
  isConstructedSeries,
  isParamEnabled,
} from "./paramMeta.js";

/** The slice of the app store this component reads/calls. */
interface SliderDrawerSlice {
  readonly config: RunConfig;
  readonly modifiedFromPreset: readonly ParamName[];
  setParam(name: ParamName, value: number): void;
}

const COLORS = {
  bg: "#14161a",
  panel: "#1c1f24",
  text: "#e6e8eb",
  muted: "#9aa2ab",
  accent: "#E69F00", // Okabe-Ito orange
} as const;

const rootStyle: CSSProperties = {
  background: COLORS.panel,
  color: COLORS.text,
  padding: "0.75rem",
  borderRadius: "6px",
  fontFamily: "system-ui, sans-serif",
  fontSize: "0.85rem",
  maxWidth: "26rem",
};

const sectionStyle: CSSProperties = {
  marginBottom: "0.5rem",
  border: `1px solid #2a2e35`,
  borderRadius: "4px",
  padding: "0.25rem 0.5rem",
};

const summaryStyle: CSSProperties = {
  cursor: "pointer",
  fontWeight: 600,
  padding: "0.25rem 0",
};

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(9rem, 1fr) minmax(7rem, 1.2fr) auto",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.2rem 0",
};

const labelStyle: CSSProperties = { color: COLORS.text };

const valueStyle: CSSProperties = {
  color: COLORS.muted,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

const disabledRowStyle: CSSProperties = { ...rowStyle, opacity: 0.45 };

const chipStyle: CSSProperties = {
  display: "inline-block",
  border: `1px solid ${COLORS.accent}`,
  color: COLORS.accent,
  borderRadius: "999px",
  padding: "0.15rem 0.6rem",
  marginBottom: "0.5rem",
  fontSize: "0.8rem",
};

const constructedStyle: CSSProperties = {
  gridColumn: "1 / -1",
  color: COLORS.accent,
  fontWeight: 600,
  fontSize: "0.75rem",
  letterSpacing: "0.02em",
};

const selectStyle: CSSProperties = {
  background: COLORS.bg,
  color: COLORS.text,
  border: `1px solid ${COLORS.muted}`,
  borderRadius: "4px",
  padding: "0.15rem 0.25rem",
  maxWidth: "14rem",
};

function ParamControl(props: {
  readonly name: ControlParamName;
  readonly config: RunConfig;
  readonly setParam: (name: ParamName, value: number) => void;
}): JSX.Element {
  const { name, config, setParam } = props;
  const meta = PARAM_CONTROL_META[name];
  const enabled = isParamEnabled(name, config);
  const value = config[name];
  const inputId = `param-${name}`;
  const hint =
    meta.enabledWhen === undefined
      ? meta.label
      : `${meta.label} — enabled when ${meta.enabledWhen.param} = ${meta.enabledWhen.equals}`;

  const handleChange = (
    event: ChangeEvent<HTMLInputElement> | ChangeEvent<HTMLSelectElement>,
  ): void => {
    setParam(name, Number(event.currentTarget.value));
  };

  return (
    <div style={enabled ? rowStyle : disabledRowStyle} title={hint}>
      <label htmlFor={inputId} style={labelStyle}>
        {meta.label}
      </label>
      {meta.control === "select" ? (
        <select
          id={inputId}
          style={selectStyle}
          value={value}
          disabled={!enabled}
          onChange={handleChange}
        >
          {(meta.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={inputId}
          type="range"
          style={{ width: "100%", accentColor: COLORS.accent }}
          min={meta.min}
          max={effectiveMax(name, config)}
          step={meta.step}
          value={value}
          disabled={!enabled}
          onChange={handleChange}
        />
      )}
      <span style={valueStyle}>
        {String(value)}
        {meta.units === "" ? "" : ` ${meta.units}`}
      </span>
      {name === "smokeSeriesCode" && isConstructedSeries(value) ? (
        <div style={constructedStyle}>{CONSTRUCTED_SERIES_LABEL}</div>
      ) : null}
    </div>
  );
}

export function SliderDrawer(): JSX.Element {
  const config = useAppStore((s: SliderDrawerSlice) => s.config);
  const setParam = useAppStore((s: SliderDrawerSlice) => s.setParam);
  const modifiedFromPreset = useAppStore((s: SliderDrawerSlice) => s.modifiedFromPreset);

  return (
    <div style={rootStyle}>
      {modifiedFromPreset.length > 0 ? (
        <span style={chipStyle} title="Parameters changed since the preset was applied">
          Modified from preset: {modifiedFromPreset.join(", ")}
        </span>
      ) : null}
      {LEVEL_KEYS.map((level, index) => (
        <details key={level} open={index === 0} style={sectionStyle}>
          <summary style={summaryStyle}>{LEVEL_LABELS[level]}</summary>
          {PARAM_LEVELS[level].map((name) => (
            <ParamControl key={name} name={name} config={config} setParam={setParam} />
          ))}
        </details>
      ))}
    </div>
  );
}
