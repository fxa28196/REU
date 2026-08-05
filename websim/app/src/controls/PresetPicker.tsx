/**
 * PresetPicker.tsx — grouped preset list for the Run screen (WP11).
 *
 * Groups the 13 shipped presets by id prefix (pure logic in
 * `paramMeta.ts#groupPresets`, tested without DOM) and renders one button per
 * preset. Selecting calls the store's `applyPreset`; the active preset is
 * highlighted. Preset labels come verbatim from
 * `@websim/shared` `PRESET_DEFINITIONS` — the SE/SE2 labels already carry
 * their "CONSTRUCTED COUNTERFACTUAL" marking and must not be shortened.
 */

import { memo } from "react";
import type { CSSProperties, JSX } from "react";

import type { PresetId } from "@websim/shared/presets/definitions";
import { PRESET_DEFINITIONS } from "@websim/shared/presets/definitions";

import useAppStore from "../state/store.js";
import { groupPresets } from "./paramMeta.js";

/** The slice of the app store this component reads/calls. */
interface PresetPickerSlice {
  readonly activePresetId: string | null;
  applyPreset(id: PresetId): void;
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

const groupHeadingStyle: CSSProperties = {
  color: COLORS.muted,
  fontSize: "0.75rem",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  margin: "0.6rem 0 0.25rem",
};

const listStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
};

const itemButtonStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: COLORS.bg,
  color: COLORS.text,
  border: "1px solid #2a2e35",
  borderRadius: "4px",
  padding: "0.35rem 0.5rem",
  marginBottom: "0.25rem",
  cursor: "pointer",
  fontSize: "0.8rem",
  lineHeight: 1.3,
};

const activeItemButtonStyle: CSSProperties = {
  ...itemButtonStyle,
  border: `1px solid ${COLORS.accent}`,
  boxShadow: `inset 2px 0 0 ${COLORS.accent}`,
  color: COLORS.text,
};

const GROUPS = groupPresets(PRESET_DEFINITIONS);

/**
 * WP14 perf: memoised — the Run screen re-renders up to 60×/s while a run
 * streams frames, and this subtree depends only on its own store selectors
 * (which still trigger their own re-renders when a preset changes).
 */
export const PresetPicker = memo(function PresetPicker(): JSX.Element {
  const activePresetId = useAppStore((s: PresetPickerSlice) => s.activePresetId);
  const applyPreset = useAppStore((s: PresetPickerSlice) => s.applyPreset);

  return (
    <nav style={rootStyle} aria-label="Preset picker">
      {GROUPS.map((group) => (
        <div key={group.label}>
          <h3 style={groupHeadingStyle}>{group.label}</h3>
          <ul style={listStyle}>
            {group.presets.map((preset) => {
              const active = preset.id === activePresetId;
              return (
                <li key={preset.id}>
                  <button
                    type="button"
                    style={active ? activeItemButtonStyle : itemButtonStyle}
                    aria-pressed={active}
                    title={preset.notes}
                    onClick={() => applyPreset(preset.id)}
                  >
                    {preset.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
});
