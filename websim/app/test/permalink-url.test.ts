/**
 * permalink-url.test.ts — WP12c permalink surface (`src/permalink/url.ts`).
 *
 * Node-only: the module's DOM touchpoints (`readLocationHash`/
 * `writeLocationHash`) are no-op-safe without a `window`, and everything else
 * is pure or store-driven. The acceptance clause lives in the FIRST describe:
 * config → URL → config is identical for EVERY preset in `PRESET_DEFINITIONS`
 * — all of them, unmodified AND modified, not a sample.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  PERMALINK_VERSION,
  bytesToBase64Url,
  configsEqual,
  diffRunConfigs,
} from "@websim/shared";
import type { RunConfig } from "@websim/shared";
import { PRESET_DEFINITIONS, PRESET_IDS, materialisePreset } from "@websim/shared/presets/definitions";
import type { PresetId } from "@websim/shared/presets/definitions";

import {
  applyPermalinkToStore,
  decodePermalink,
  encodePermalink,
  isPermalinkError,
  knownPresetId,
  migrationNotice,
  permalinkApplyOrder,
  readLocationHash,
  resolveDecodedPermalink,
  writeLocationHash,
} from "../src/permalink/url.js";
import { applyParam, presetBaselineBadge, presetConfig, useAppStore } from "../src/state/store.js";

// Reset the singleton store between tests (same pattern as store.test.ts).
const pristine = useAppStore.getInitialState();
beforeEach(() => {
  useAppStore.setState(pristine, true);
});

/** Encode → decode → resolve, asserting the round trip lands on `config`. */
function roundTrip(presetId: PresetId, config: RunConfig, tick: number | null = null): void {
  const hash = encodePermalink({ presetId, config, tick });
  const parsed = decodePermalink(hash);
  expect(isPermalinkError(parsed)).toBe(false);
  const resolved = resolveDecodedPermalink(parsed);
  if (!resolved.ok) {
    throw new Error(`round trip failed for '${presetId}': ${resolved.error}`);
  }
  expect(resolved.presetId).toBe(presetId);
  expect(resolved.tick).toBe(tick);
  expect(diffRunConfigs(resolved.config, config)).toEqual([]);
}

/** A deliberately-modified variant of a preset config (all values in-range). */
function modifiedVariant(config: RunConfig): RunConfig {
  let next = applyParam(config, "numAgents", config.numAgents === 500 ? 501 : 500);
  next = applyParam(next, "randomSeed", config.randomSeed + 95);
  next = applyParam(next, "smokeScale", config.smokeScale === 2 ? 1.5 : 2);
  return next;
}

// ---------------------------------------------------------------------------
// ACCEPTANCE CLAUSE: config → URL → config for EVERY preset
// ---------------------------------------------------------------------------

describe("round-trip property over every shipped preset", () => {
  it("covers the full PRESET_DEFINITIONS list, not a sample", () => {
    expect(PRESET_DEFINITIONS.length).toBe(PRESET_IDS.length);
    expect(PRESET_DEFINITIONS.length).toBeGreaterThan(0);
  });

  for (const definition of PRESET_DEFINITIONS) {
    it(`round-trips '${definition.id}' unmodified`, () => {
      roundTrip(definition.id, materialisePreset(definition));
    });

    it(`round-trips '${definition.id}' with modified params + seed + tick`, () => {
      roundTrip(definition.id, modifiedVariant(materialisePreset(definition)), 120);
    });
  }
});

// ---------------------------------------------------------------------------
// Encode details
// ---------------------------------------------------------------------------

describe("encodePermalink", () => {
  it("returns a #-prefixed fragment in the plan §6.6 form", () => {
    const hash = encodePermalink({ presetId: "A_present_day", config: presetConfig("A_present_day") });
    expect(hash.startsWith("#p=A_present_day&d=")).toBe(true);
  });

  it("lifts a randomSeed difference into seed= and leaves the diff empty", () => {
    const config = applyParam(presetConfig("A_present_day"), "randomSeed", 137);
    const hash = encodePermalink({ presetId: "A_present_day", config });
    expect(hash).toContain("seed=137");
    const parsed = decodePermalink(hash);
    if (isPermalinkError(parsed)) {
      throw new Error(parsed.error);
    }
    expect(parsed.diff).toEqual({});
    expect(parsed.seed).toBe(137);
  });

  it("omits seed= and t= when neither differs from the preset / start", () => {
    const hash = encodePermalink({ presetId: "A_present_day", config: presetConfig("A_present_day") });
    expect(hash).not.toContain("seed=");
    expect(hash).not.toContain("t=");
  });

  it("encodes the tick as t=", () => {
    const hash = encodePermalink({
      presetId: "A_present_day",
      config: presetConfig("A_present_day"),
      tick: 4740,
    });
    expect(hash).toContain("t=4740");
  });
});

// ---------------------------------------------------------------------------
// Decode failures — every arm is an {error}, never a wrong config
// ---------------------------------------------------------------------------

function fragmentWithEnvelope(presetId: string, envelope: unknown): string {
  const d = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(envelope)));
  return `#p=${presetId}&d=${d}`;
}

describe("decodePermalink failure arms", () => {
  it("returns the MIGRATION NOTICE for a stale schema version, and applies nothing", () => {
    const stale = fragmentWithEnvelope("A_present_day", { v: PERMALINK_VERSION + 1, d: { numAgents: 999 } });
    const parsed = decodePermalink(stale);
    if (!isPermalinkError(parsed)) {
      throw new Error("stale link decoded as applicable");
    }
    expect(parsed.error).toContain("MIGRATION NOTICE");
    expect(parsed.error).toContain(`v${PERMALINK_VERSION + 1}`);
    expect(parsed.error).toContain(`v${PERMALINK_VERSION}`);
    expect(parsed.error).toContain("A_present_day");
    expect(parsed.error).toContain("numAgents");

    const before = useAppStore.getState().config;
    const applied = applyPermalinkToStore(parsed);
    expect(applied.ok).toBe(false);
    expect(configsEqual(useAppStore.getState().config, before)).toBe(true);
  });

  it("rejects a fragment with no preset id", () => {
    const parsed = decodePermalink("#d=abc");
    expect(isPermalinkError(parsed)).toBe(true);
  });

  it("rejects a mangled base64url diff", () => {
    const parsed = decodePermalink("#p=A_present_day&d=!!!not-base64!!!");
    expect(isPermalinkError(parsed)).toBe(true);
  });

  it("rejects a non-integer seed", () => {
    const parsed = decodePermalink("#p=A_present_day&seed=4.5");
    expect(isPermalinkError(parsed)).toBe(true);
  });

  it("rejects an unknown parameter name inside the diff", () => {
    const parsed = decodePermalink(
      fragmentWithEnvelope("A_present_day", { v: PERMALINK_VERSION, d: { notAParam: 1 } }),
    );
    expect(isPermalinkError(parsed)).toBe(true);
  });
});

describe("resolveDecodedPermalink failure arms", () => {
  it("rejects a preset id this build does not ship", () => {
    const resolved = resolveDecodedPermalink({
      presetId: "no_such_preset",
      diff: {},
      seed: null,
      tick: null,
    });
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.error).toContain("no_such_preset");
    }
  });

  it("rejects a diff that violates simulationHours <= slices - 1 cross-field", () => {
    // default_fresh_run is series 0; series 1 caps the window at 455 h, so
    // 500 h is per-param legal but cross-field invalid — the never-regress
    // invariant must hold through the permalink door too.
    const parsed = decodePermalink(
      fragmentWithEnvelope("default_fresh_run", {
        v: PERMALINK_VERSION,
        d: { smokeSeriesCode: 1, simulationHours: 500 },
      }),
    );
    if (isPermalinkError(parsed)) {
      throw new Error(parsed.error);
    }
    const resolved = resolveDecodedPermalink(parsed);
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.error).toContain("simulationHours");
    }
  });
});

// ---------------------------------------------------------------------------
// Store application
// ---------------------------------------------------------------------------

describe("applyPermalinkToStore", () => {
  it("applies an unmodified archived-preset link and keeps its baseline badge", () => {
    const applied = applyPermalinkToStore(
      decodePermalink(encodePermalink({ presetId: "A_present_day", config: presetConfig("A_present_day") })),
    );
    expect(applied.ok).toBe(true);
    const s = useAppStore.getState();
    expect(s.presetId).toBe("A_present_day");
    expect(configsEqual(s.config, presetConfig("A_present_day"))).toBe(true);
    expect(s.modifiedFromPreset).toEqual([]);
    expect(s.badge).toBe(presetBaselineBadge("A_present_day"));
  });

  it("applies a modified link, derives EXPLORATORY, and reports the tick", () => {
    const target = modifiedVariant(presetConfig("A_present_day"));
    const applied = applyPermalinkToStore(
      decodePermalink(encodePermalink({ presetId: "A_present_day", config: target, tick: 300 })),
    );
    if (!applied.ok) {
      throw new Error(applied.error);
    }
    expect(applied.tick).toBe(300);
    const s = useAppStore.getState();
    expect(configsEqual(s.config, target)).toBe(true);
    expect(s.badge).toBe("EXPLORATORY");
    expect(s.modifiedFromPreset).toContain("numAgents");
    expect(s.modifiedFromPreset).toContain("randomSeed");
  });

  it("applies a series+hours change in the safe order (series first)", () => {
    // SE preset is series 1 (455 h ceiling); the target is series 0 at 575 h.
    // Applying hours before the series would clamp 575 back to 455.
    const base = presetConfig("SE_severe_v1_E18");
    const target = applyParam(applyParam(base, "smokeSeriesCode", 0), "simulationHours", 575);
    expect(target.simulationHours).toBe(575);
    const applied = applyPermalinkToStore(
      decodePermalink(encodePermalink({ presetId: "SE_severe_v1_E18", config: target })),
    );
    expect(applied.ok).toBe(true);
    const s = useAppStore.getState();
    expect(s.config.smokeSeriesCode).toBe(0);
    expect(s.config.simulationHours).toBe(575);
    expect(configsEqual(s.config, target)).toBe(true);
  });

  it("leaves the store untouched when the link is invalid", () => {
    const before = useAppStore.getState().config;
    const applied = applyPermalinkToStore(decodePermalink("#p=&d="));
    expect(applied.ok).toBe(false);
    expect(configsEqual(useAppStore.getState().config, before)).toBe(true);
    expect(useAppStore.getState().presetId).toBe(pristine.presetId);
  });
});

// ---------------------------------------------------------------------------
// Small pure pieces
// ---------------------------------------------------------------------------

describe("pure helpers", () => {
  it("knownPresetId narrows shipped ids and rejects others", () => {
    expect(knownPresetId("A_present_day")).toBe("A_present_day");
    expect(knownPresetId("nope")).toBeNull();
    for (const id of PRESET_IDS) {
      expect(knownPresetId(id)).toBe(id);
    }
  });

  it("permalinkApplyOrder hoists smokeSeriesCode and preserves the rest", () => {
    expect(permalinkApplyOrder(["numAgents", "simulationHours"])).toEqual([
      "numAgents",
      "simulationHours",
    ]);
    expect(permalinkApplyOrder(["simulationHours", "smokeSeriesCode", "numAgents"])).toEqual([
      "smokeSeriesCode",
      "simulationHours",
      "numAgents",
    ]);
  });

  it("migrationNotice names both versions, the preset and the overrides", () => {
    const notice = migrationNotice(7, "SE_severe_v1_E18", ["pStuck", "kPush"]);
    expect(notice).toContain("MIGRATION NOTICE");
    expect(notice).toContain("v7");
    expect(notice).toContain(`v${PERMALINK_VERSION}`);
    expect(notice).toContain("SE_severe_v1_E18");
    expect(notice).toContain("pStuck, kPush");
    expect(migrationNotice(7, "X", [])).toContain("no parameter overrides");
  });

  it("location-hash wrappers are no-op-safe without a window (Node)", () => {
    expect(readLocationHash()).toBe("");
    expect(() => {
      writeLocationHash("#p=A_present_day");
    }).not.toThrow();
  });
});
