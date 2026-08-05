/**
 * permalink/url.ts — the UI plane's permalink surface (WP12c, plan §6.6).
 *
 * The CODEC lives in `@websim/shared/permalink` and is NOT reimplemented here:
 * `encodePermalink`/`decodePermalink`/`resolvePermalink` in the shared plane
 * already own the fragment grammar (`#p=<presetId>&d=<base64url(diff)>&seed=…&
 * t=<tick>`), the `PERMALINK_VERSION` stamp and the stale-link flag. This module
 * wraps that codec with the four things only the app can supply:
 *
 *  1. preset lineage — a link encodes a DIFF against a named preset, so encoding
 *     needs `presetConfig(id)` and decoding needs the preset registry to reject
 *     ids this build does not ship;
 *  2. the store transaction — applying a link must go through `applyPreset` +
 *     `setParam` so badge derivation, structural clamping and the run-evidence
 *     honesty rules all fire exactly as if the user had clicked the UI;
 *  3. `window.location.hash` I/O, kept in two tiny wrappers so everything else
 *     in this file runs (and is tested) in Node;
 *  4. the MIGRATION NOTICE: a stale or unknown schema version NEVER applies —
 *     the shared codec still decodes the payload so the notice can say what the
 *     link asked for, but this module refuses to run it (plan §6.6: "stale links
 *     show a migration notice", never a silently wrong config).
 *
 * ## Seed placement
 *
 * The fragment's `seed=` key is the outer, explicit form of "same config, new
 * seed" (see the shared codec's `PermalinkPayload.seed` doc). Encoding therefore
 * lifts a `randomSeed` difference OUT of the diff and into `seed=`; decoding
 * lets `resolvePermalink` fold it back (its rule: `seed=` wins over any
 * `randomSeed` inside the diff). Round-trip identity is unaffected — the
 * property test in `app/test/permalink-url.test.ts` proves config → URL →
 * config for every shipped preset.
 *
 * ## Apply order
 *
 * `setParam` clamps `simulationHours` against the CURRENT series' `slices − 1`
 * ceiling, so a diff that changes both `smokeSeriesCode` and `simulationHours`
 * must apply the series first — otherwise a valid target (series 0, 575 h)
 * would transiently clamp against the old series' ceiling. `permalinkApplyOrder`
 * hoists the series; every other parameter keeps manifest order. The final
 * store config is verified against the resolved config, so an ordering bug is
 * a thrown error, never a silently different run.
 */

import { useEffect, useRef, useState } from "react";

import type {
  PermalinkPayload,
  RunConfig,
  RunConfigPatch,
} from "@websim/shared";
import {
  PERMALINK_VERSION,
  decodePermalink as decodePermalinkFragment,
  diffRunConfigs,
  diffToPatch,
  encodePermalink as encodePermalinkFragment,
  resolvePermalink,
} from "@websim/shared";
import type { PresetId } from "@websim/shared/presets/definitions";
import { PRESET_IDS } from "@websim/shared/presets/definitions";
import type { ParamName } from "@websim/shared/schema";

import useAppStore, { presetConfig } from "../state/store.js";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** What `encodePermalink` reads: the store's preset lineage + config. */
export interface PermalinkState {
  readonly presetId: PresetId;
  readonly config: RunConfig;
  /** Timeline position to encode as `t=`; omit / `null` for start-of-run. */
  readonly tick?: number | null;
}

/** A successfully decoded (current-version) permalink. */
export interface DecodedPermalink {
  readonly presetId: string;
  /** Parameter overrides vs the preset — the `d=` payload. */
  readonly diff: RunConfigPatch;
  /** Seed override from `seed=`, or `null` (use the preset/diff value). */
  readonly seed: number | null;
  /** Timeline position from `t=`, or `null` (start of run). */
  readonly tick: number | null;
}

export interface PermalinkError {
  readonly error: string;
}

export type PermalinkParse = DecodedPermalink | PermalinkError;

export function isPermalinkError(parsed: PermalinkParse): parsed is PermalinkError {
  return "error" in parsed;
}

/** Result of resolving/applying a parsed permalink against this build's presets. */
export type ResolvedPermalink =
  | {
      readonly ok: true;
      readonly presetId: PresetId;
      /** The full validated 41-parameter config the link resolves to. */
      readonly config: RunConfig;
      readonly tick: number | null;
    }
  | { readonly ok: false; readonly error: string };

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

/**
 * Encode the selected preset + config (and optionally a tick) as a location
 * hash, INCLUDING the leading `#` so the result is directly assignable to
 * `window.location.hash`. A `randomSeed` difference rides in `seed=`, not in
 * the diff (see the module doc).
 */
export function encodePermalink(state: PermalinkState): string {
  const preset = presetConfig(state.presetId);
  const { randomSeed, ...diffWithoutSeed } = diffToPatch(preset, state.config);
  const payload: PermalinkPayload = {
    presetId: state.presetId,
    patch: diffWithoutSeed,
    seed: randomSeed === undefined ? null : randomSeed,
    tick: state.tick ?? null,
  };
  return `#${encodePermalinkFragment(payload)}`;
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

/**
 * The migration notice a stale-version link produces. It says what the link
 * asked for — preset and override names, which the old payload still yields —
 * but the VALUES are never applied: an old schema's meaning for them is exactly
 * what this build can no longer vouch for.
 */
export function migrationNotice(
  linkVersion: number,
  presetId: string,
  overrideParams: readonly string[],
): string {
  const overrides =
    overrideParams.length === 0
      ? "no parameter overrides"
      : `overrides on ${overrideParams.join(", ")}`;
  return (
    `MIGRATION NOTICE: this permalink was written against permalink schema v${linkVersion}; ` +
    `this build reads v${PERMALINK_VERSION}. The link asked for preset '${presetId}' with ` +
    `${overrides}. Those values are NOT applied — an override written under an older schema ` +
    `is not guaranteed to mean the same thing here. Re-create the configuration in the UI ` +
    `and copy a fresh link.`
  );
}

/**
 * Decode a location hash (leading `#` optional). Returns either the parsed
 * payload or `{error}` — including, for a stale/unknown schema version, the
 * MIGRATION NOTICE. A stale link never comes back as an applicable payload.
 */
export function decodePermalink(hash: string): PermalinkParse {
  const result = decodePermalinkFragment(hash);
  if (!result.ok) {
    return { error: `This permalink could not be read: ${result.message}` };
  }
  if (result.stale) {
    return {
      error: migrationNotice(
        result.version,
        result.payload.presetId,
        Object.keys(result.payload.patch),
      ),
    };
  }
  return {
    presetId: result.payload.presetId,
    diff: result.payload.patch,
    seed: result.payload.seed,
    tick: result.payload.tick,
  };
}

// ---------------------------------------------------------------------------
// Resolve + apply
// ---------------------------------------------------------------------------

/** Narrow an arbitrary string to a shipped preset id, or `null`. */
export function knownPresetId(id: string): PresetId | null {
  return (PRESET_IDS as readonly string[]).includes(id) ? (id as PresetId) : null;
}

/**
 * Resolve a parsed permalink to the full config it denotes, WITHOUT touching
 * the store. Pure given the preset registry; this is the half the round-trip
 * property test drives.
 */
export function resolveDecodedPermalink(parsed: PermalinkParse): ResolvedPermalink {
  if (isPermalinkError(parsed)) {
    return { ok: false, error: parsed.error };
  }
  const presetId = knownPresetId(parsed.presetId);
  if (presetId === null) {
    return {
      ok: false,
      error:
        `This permalink names preset '${parsed.presetId}', which this build does not ship. ` +
        `Known presets: ${PRESET_IDS.join(", ")}.`,
    };
  }
  const payload: PermalinkPayload = {
    presetId,
    patch: parsed.diff,
    seed: parsed.seed,
    tick: parsed.tick,
  };
  const resolved = resolvePermalink(payload, presetConfig(presetId));
  if (!resolved.ok) {
    const detail = resolved.issues
      .map((i) => `${i.param ?? "(config)"}: ${i.message}`)
      .join("; ");
    return {
      ok: false,
      error: `This permalink resolves to an invalid configuration and was not applied: ${detail}`,
    };
  }
  return { ok: true, presetId, config: resolved.config, tick: parsed.tick };
}

/**
 * Order in which permalink overrides are fed to `setParam`: `smokeSeriesCode`
 * first (it owns the `simulationHours <= slices - 1` ceiling), everything else
 * in the manifest order the diff already carries.
 */
export function permalinkApplyOrder(names: readonly ParamName[]): readonly ParamName[] {
  if (!names.includes("smokeSeriesCode")) {
    return names;
  }
  return ["smokeSeriesCode", ...names.filter((n) => n !== "smokeSeriesCode")];
}

/**
 * Apply a parsed permalink to the app store: `applyPreset` for the lineage,
 * then `setParam` per override so clamping, badge derivation and run-evidence
 * clearing behave exactly as manual edits do. Returns the resolution (with the
 * `t=` tick for the caller's scrub wiring) or the error — errors leave the
 * store untouched.
 */
export function applyPermalinkToStore(parsed: PermalinkParse): ResolvedPermalink {
  const resolved = resolveDecodedPermalink(parsed);
  if (!resolved.ok) {
    return resolved;
  }
  const store = useAppStore.getState();
  store.applyPreset(resolved.presetId);
  const preset = presetConfig(resolved.presetId);
  const overridden = diffRunConfigs(preset, resolved.config).map((d) => d.param);
  for (const name of permalinkApplyOrder(overridden)) {
    useAppStore.getState().setParam(name, resolved.config[name]);
  }
  const applied = useAppStore.getState().config;
  if (diffRunConfigs(applied, resolved.config).length > 0) {
    // The resolved config passed full validation, so the store transaction can
    // only disagree through a bug (e.g. an apply-order regression). Loud, not
    // silent: a permalink that opens a DIFFERENT run than it encodes is the
    // exact failure this module exists to make impossible.
    throw new Error(
      "permalink apply bug: the store's config differs from the validated permalink config " +
        `on ${diffRunConfigs(applied, resolved.config)
          .map((d) => d.param)
          .join(", ")}`,
    );
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// window.location plumbing (the only DOM-touching lines in this module)
// ---------------------------------------------------------------------------

/** Current location hash, or `""` outside a browser. */
export function readLocationHash(): string {
  return typeof window === "undefined" ? "" : window.location.hash;
}

/**
 * Write the fragment (leading `#` included) without growing the history stack:
 * every slider drag would otherwise become a Back-button stop.
 */
export function writeLocationHash(fragment: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const url = `${window.location.pathname}${window.location.search}${fragment}`;
  if (typeof window.history?.replaceState === "function") {
    window.history.replaceState(null, "", url);
  } else {
    window.location.hash = fragment;
  }
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export interface PermalinkSyncState {
  /**
   * Decode/apply failure from the load-time read — the migration notice for a
   * stale link, or the parse error for a mangled one. `null` when the hash was
   * absent or applied cleanly. The Run screen renders this verbatim.
   */
  readonly notice: string | null;
  /** `t=` of a successfully applied link, for the caller's scrub wiring. */
  readonly appliedTick: number | null;
}

/**
 * Read the location hash once on load (applying it to the store, or surfacing
 * the notice), then keep the hash in sync with every config change.
 *
 * The write effect skips its mount invocation: on a failed apply the store
 * never changed, and overwriting the incoming (bad) link with the boot config's
 * hash would destroy the evidence the notice is about. After a successful
 * apply the store update re-fires the effect, which then writes the canonical
 * encoding of the applied config.
 */
export function usePermalinkSync(): PermalinkSyncState {
  const [notice, setNotice] = useState<string | null>(null);
  const [appliedTick, setAppliedTick] = useState<number | null>(null);
  const readOnceRef = useRef(false);
  const skipMountWriteRef = useRef(true);
  const presetId = useAppStore((s) => s.presetId);
  const config = useAppStore((s) => s.config);

  // Read once on load.
  useEffect(() => {
    if (readOnceRef.current) {
      return;
    }
    readOnceRef.current = true;
    const hash = readLocationHash();
    if (hash.replace(/^#/u, "").length === 0) {
      return;
    }
    const applied = applyPermalinkToStore(decodePermalink(hash));
    if (applied.ok) {
      setAppliedTick(applied.tick);
    } else {
      setNotice(applied.error);
    }
  }, []);

  // Write on config change (never on mount — see the hook doc).
  useEffect(() => {
    if (skipMountWriteRef.current) {
      skipMountWriteRef.current = false;
      return;
    }
    if (presetId === null) {
      // No preset lineage — a permalink is a diff vs a preset, so there is
      // nothing honest to encode. Leave whatever hash is present alone.
      return;
    }
    writeLocationHash(encodePermalink({ presetId, config, tick: null }));
  }, [presetId, config]);

  return { notice, appliedTick };
}
