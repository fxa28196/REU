/**
 * store.ts — the Zustand app store (WP11).
 *
 * One store for the whole UI plane: screen routing, the run configuration with
 * its preset lineage, the badge/provenance honesty surface, and the reduced
 * view of the worker stream. Every piece of logic a component needs is an
 * exported PURE function here or in `./stream.js`, so `app/test/store.test.ts`
 * exercises it all in Node with no DOM.
 *
 * ## Structural clamping (never advisory)
 *
 * `setParam` cannot produce an invalid config. Values are clamped to the
 * schema's HARD bounds (`PARAM_META[name].hardMin/hardMax`), `int`/`flag`
 * parameters are rounded to integers, and the never-regress invariant
 * `simulationHours <= slices - 1` is enforced cross-field on EVERY change: the
 * per-series maxima come from `maxSimulationHours` in `@websim/shared/schema`
 * (575 / 455 / 455 for series 0 / 1 / 2), verified against the shipped assets
 * `pipeline/out/assets/smoke-{0,1,2}.json`, whose `slices` fields are
 * 576 / 456 / 456. Changing `smokeSeriesCode` re-clamps `simulationHours`
 * immediately — a run window can never dangle past the end of the smoke data.
 * The result is re-validated through `parseRunConfig`, so a violation is a
 * thrown bug, not a stored config.
 *
 * `closureDraw` is stored and clamped (1..3) like any parameter, but it selects
 * a pre-committed closure schedule FILE and is only meaningful when
 * `closuresCode === 3` (the worst family); at other codes the engine ignores
 * it. `closureDrawMeaningful` is exported so the form can disable the control.
 * A change still counts as leaving the preset (and drops the badge), because a
 * config that differs from the archived one on ANY parameter is not the
 * archived config — badges are earned, never assumed.
 *
 * ## Badge and provenance honesty
 *
 * The badge is derived from (presetId, config): an unmodified preset carries
 * its baseline — ARCHIVE-VALIDATED for presets that reproduce an archived run,
 * ENGINE-CERTIFIED for the fresh-run default — and ANY parameter difference
 * drops it to EXPLORATORY. Returning a parameter to the preset value by hand
 * restores the baseline (the badge belongs to the configuration, not to the
 * gesture that produced it). `setBadge` exists for the validation machinery to
 * overwrite the derived value (e.g. INVALID); any subsequent config change
 * re-derives.
 *
 * `provenance` is `null` until the first stream message arrives and `"live"`
 * from then on: every number reduced from the stream is a live browser
 * simulation and must be labelled as such. Nothing in this store may ever set
 * `"archived"` from stream data — archived numbers come from archive bundles,
 * not from the worker.
 *
 * ## Stream buffer ownership
 *
 * Frame batches arrive with their buffers TRANSFERRED; once `applyStream` has
 * reduced a batch, the store owns those bytes and `latestFrame` holds zero-copy
 * views into them (see `stream.ts`'s module doc). Callers must not repost or
 * mutate an applied batch.
 */

import { create } from "zustand";

import type { RunConfig } from "@websim/shared/config";
import { diffRunConfigs, parseRunConfig } from "@websim/shared/config";
import type { PresetDefinition, PresetId } from "@websim/shared/presets/definitions";
import { PRESET_DEFINITIONS, materialisePreset } from "@websim/shared/presets/definitions";
import type { ParamName } from "@websim/shared/schema";
import { PARAM_META, WORST_FAMILY_CLOSURES_CODE, maxSimulationHours } from "@websim/shared/schema";
import type { RunPhase, RunStatus, RunSummary, StreamMessage, WaveProgressEvent } from "@websim/engine/worker";

import type { SpeedSetting } from "../controls/Scrubber.js";
import type { BadgeState, ProvenanceClass, Screen } from "../index.js";
import type { FrameSnapshot, MetricSeries } from "./stream.js";
import { appendMetrics, emptyMetricSeries, latestFrameOf } from "./stream.js";

// ---------------------------------------------------------------------------
// Pure config logic
// ---------------------------------------------------------------------------

/** Definition lookup (array scan — no Map iteration feeds any displayed order). */
export function presetDefinition(id: PresetId): PresetDefinition {
  const def = PRESET_DEFINITIONS.find((d) => d.id === id);
  if (def === undefined) {
    throw new Error(`unknown preset id '${id}'`);
  }
  return def;
}

/** The fully-explicit 41-parameter config a preset materialises to. */
export function presetConfig(id: PresetId): RunConfig {
  return materialisePreset(presetDefinition(id));
}

/**
 * Baseline badge a preset's UNMODIFIED config carries: presets that reproduce
 * an archived run are ARCHIVE-VALIDATED; the fresh-run default is
 * ENGINE-CERTIFIED (its own notes: "never ARCHIVE-VALIDATED").
 */
export function presetBaselineBadge(id: PresetId): BadgeState {
  return presetDefinition(id).archiveFamily !== null ? "ARCHIVE-VALIDATED" : "ENGINE-CERTIFIED";
}

/**
 * Parameter names on which `config` differs from the selected preset, in
 * manifest order (via `diffRunConfigs`). Empty when no preset is selected.
 */
export function modifiedParams(presetId: PresetId | null, config: RunConfig): readonly ParamName[] {
  if (presetId === null) {
    return [];
  }
  return diffRunConfigs(presetConfig(presetId), config).map((d) => d.param);
}

/**
 * Badge derived from (presetId, config): the preset baseline when the config
 * matches the preset exactly, EXPLORATORY on any difference (or no preset).
 */
export function deriveBadge(presetId: PresetId | null, config: RunConfig): BadgeState {
  if (presetId === null) {
    return "EXPLORATORY";
  }
  return modifiedParams(presetId, config).length === 0
    ? presetBaselineBadge(presetId)
    : "EXPLORATORY";
}

/** True when `closureDraw` selects anything — i.e. the worst closure family. */
export function closureDrawMeaningful(config: RunConfig): boolean {
  return config.closuresCode === WORST_FAMILY_CLOSURES_CODE;
}

/**
 * Honesty rule for run evidence on config change: changing the SELECTED
 * configuration while no run leg is in flight must wipe the previous run's
 * on-screen evidence (stream state + summary), because those numbers were
 * computed under a configuration that is no longer selected. While a leg IS in
 * flight the evidence is kept — the run is still executing under
 * `lastRunConfig` — and the Run screen renders it as STALE via the
 * `lastRunConfig`-vs-`config` mismatch instead (clearing mid-run would let the
 * still-streaming worker refill a truncated, misleading series).
 */
export function shouldClearRunEvidence(runInFlight: boolean, configChanged: boolean): boolean {
  return configChanged && !runInFlight;
}

/**
 * Structurally clamp one value: hard schema bounds, integer rounding for
 * `int`/`flag` kinds, and for `simulationHours` the cross-field ceiling
 * `slices - 1` of the CURRENT smoke series.
 */
export function clampParamValue(name: ParamName, value: number, config: RunConfig): number {
  const meta = PARAM_META[name];
  const v = meta.kind === "double" ? value : Math.round(value);
  const max =
    name === "simulationHours"
      ? Math.min(meta.hardMax, maxSimulationHours(config.smokeSeriesCode))
      : meta.hardMax;
  return Math.min(Math.max(v, meta.hardMin), max);
}

/**
 * A NEW config with `name` set to the clamped `value`, then re-clamped
 * cross-field so `simulationHours <= slices - 1` holds for whatever series the
 * result selects (this is what re-clamps hours when the SERIES changes). A
 * non-finite value is a no-op — there is no meaningful clamp target for NaN.
 * The result is re-validated; a failure here is a bug, never a stored state.
 */
export function applyParam(config: RunConfig, name: ParamName, value: number): RunConfig {
  if (!Number.isFinite(value)) {
    return config;
  }
  const next: Record<ParamName, number> = { ...config };
  next[name] = clampParamValue(name, value, config);
  const limit = maxSimulationHours(next.smokeSeriesCode);
  if (next.simulationHours > limit) {
    next.simulationHours = limit;
  }
  return parseRunConfig(next, `setParam('${name}')`);
}

// ---------------------------------------------------------------------------
// Pure stream reduction
// ---------------------------------------------------------------------------

/** The slice of the store the stream reducer owns. */
export interface RunStreamState {
  readonly runPhase: RunPhase;
  readonly status: RunStatus | null;
  readonly latestFrame: FrameSnapshot | null;
  readonly metrics: MetricSeries;
  readonly waves: WaveProgressEvent[];
  readonly provenance: ProvenanceClass | null;
}

/** A fresh (pre-run / post-reset) stream slice. */
export function emptyRunStreamState(): RunStreamState {
  return {
    runPhase: "idle",
    status: null,
    latestFrame: null,
    metrics: emptyMetricSeries(),
    waves: [],
    provenance: null,
  };
}

/**
 * THE one reducer for every stream message kind. Pure: returns a new slice,
 * never mutates the old one. Wave events append in arrival order (a plain
 * array — never a Map/Set iteration). Every kind stamps `provenance: "live"`:
 * any number that came off the stream is a live browser simulation.
 */
export function reduceStream(state: RunStreamState, message: StreamMessage): RunStreamState {
  switch (message.kind) {
    case "frames":
      return { ...state, latestFrame: latestFrameOf(message.batch), provenance: "live" };
    case "metrics":
      return { ...state, metrics: appendMetrics(state.metrics, message.batch), provenance: "live" };
    case "wave":
      return { ...state, waves: [...state.waves, message], provenance: "live" };
    case "status":
      return { ...state, status: message, runPhase: message.phase, provenance: "live" };
  }
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

export interface AppStore {
  screen: Screen;
  setScreen(screen: Screen): void;
  /**
   * Playback pacing, in simulated minutes per wall-clock second (or `"max"`).
   *
   * It lives in the store rather than in the Run screen's local state for one
   * reason: the pacing loop in `useSimRun` re-reads it between legs, so moving
   * the selector DURING a run takes effect at the next leg instead of at the
   * next run. Kept out of `RunConfig` deliberately: it is a property of
   * watching, not of the experiment, and it must never reach the executed
   * manifest or a permalink diff.
   */
  speed: SpeedSetting;
  setSpeed(speed: SpeedSetting): void;
  presetId: PresetId | null;
  /**
   * Mirror of {@link presetId} under the name sibling WP11 components consume.
   * Only `applyPreset` changes preset identity, and it writes both fields, so
   * the two can never disagree. `presetId` is the canonical contract field.
   */
  activePresetId: PresetId | null;
  config: RunConfig;
  /**
   * Param names differing from the selected preset, in manifest order.
   * Typed as `ParamName` (a subtype of the contracted `readonly string[]`) so
   * consumers can index `PARAM_META` without a cast.
   */
  modifiedFromPreset: readonly ParamName[];
  applyPreset(id: PresetId): void;
  setParam(name: keyof RunConfig & string, value: number): void;
  badge: BadgeState;
  setBadge(badge: BadgeState): void;
  provenance: ProvenanceClass | null;
  runPhase: RunPhase;
  status: RunStatus | null;
  latestFrame: FrameSnapshot | null;
  metrics: MetricSeries;
  waves: WaveProgressEvent[];
  /** The ONE reducer for every stream message kind (delegates to `reduceStream`). */
  applyStream(m: StreamMessage): void;
  resetRun(): void;

  // ---- page-level run-lane state (survives Run screen unmount/remount) ----
  /**
   * True from the synchronous top of `useSimRun.start()`/`resumeToEnd()` until
   * that leg's promise settles (init included). This — NOT any per-component
   * ref — is the run-in-flight guard: the worker session is a page-level
   * singleton that keeps executing while the Run screen is unmounted, so the
   * guard must live in the page-level store too.
   */
  runInFlight: boolean;
  /**
   * The exact config the in-flight / most recent run leg EXECUTED (`null`
   * before any run and after run evidence is cleared). Every live panel that
   * shows stream-derived numbers attributes them to THIS config, never to the
   * picker's current selection.
   */
  lastRunConfig: RunConfig | null;
  /** Summary of the last completed/paused leg; cleared with the run evidence. */
  runSummary: RunSummary | null;
  /**
   * Synchronous start-of-leg transition for a FRESH run: wipes the previous
   * run's stream evidence + summary, records the executed config, and raises
   * the in-flight guard — all before the first `await` in `start()`.
   */
  markRunStarting(config: RunConfig): void;
  /** Start-of-leg transition for a resume: raises the guard, keeps evidence. */
  markResumeStarting(): void;
  /** End-of-leg transition (success or failure): lowers the in-flight guard. */
  markRunSettled(): void;
  setRunSummary(summary: RunSummary | null): void;
}

/** The preset the app boots into. */
export const INITIAL_PRESET_ID: PresetId = "default_fresh_run";

export const useAppStore = create<AppStore>()((set, get) => ({
  screen: "run",
  // Default "max" preserves the behaviour every existing run and test assumes;
  // the slow settings are opt-in.
  speed: "max",
  setSpeed: (speed) => {
    set({ speed });
  },
  setScreen: (screen) => {
    set({ screen });
  },

  presetId: INITIAL_PRESET_ID,
  activePresetId: INITIAL_PRESET_ID,
  config: presetConfig(INITIAL_PRESET_ID),
  modifiedFromPreset: [],
  applyPreset: (id) => {
    const s = get();
    const next = presetConfig(id);
    // Re-selecting the same preset with an unmodified config changes nothing,
    // so the (still-matching) run evidence may stay on screen.
    const configChanged = id !== s.presetId || diffRunConfigs(s.config, next).length > 0;
    if (shouldClearRunEvidence(s.runInFlight, configChanged)) {
      set({ ...emptyRunStreamState(), runSummary: null, lastRunConfig: null });
    }
    set({
      presetId: id,
      activePresetId: id,
      config: next,
      modifiedFromPreset: [],
      badge: presetBaselineBadge(id),
    });
  },
  setParam: (name, value) => {
    const s = get();
    const next = applyParam(s.config, name, value);
    // A clamped-back-to-identical value changes nothing (matches the badge's
    // no-flip rule), so it must not wipe run evidence either.
    const configChanged = diffRunConfigs(s.config, next).length > 0;
    if (shouldClearRunEvidence(s.runInFlight, configChanged)) {
      set({ ...emptyRunStreamState(), runSummary: null, lastRunConfig: null });
    }
    set({
      config: next,
      modifiedFromPreset: modifiedParams(s.presetId, next),
      badge: deriveBadge(s.presetId, next),
    });
  },

  badge: presetBaselineBadge(INITIAL_PRESET_ID),
  setBadge: (badge) => {
    set({ badge });
  },

  ...emptyRunStreamState(),
  applyStream: (m) => {
    set((s) =>
      reduceStream(
        {
          runPhase: s.runPhase,
          status: s.status,
          latestFrame: s.latestFrame,
          metrics: s.metrics,
          waves: s.waves,
          provenance: s.provenance,
        },
        m,
      ),
    );
  },
  resetRun: () => {
    set(emptyRunStreamState());
  },

  runInFlight: false,
  lastRunConfig: null,
  runSummary: null,
  markRunStarting: (config) => {
    set({ ...emptyRunStreamState(), runSummary: null, lastRunConfig: config, runInFlight: true });
  },
  markResumeStarting: () => {
    set({ runInFlight: true });
  },
  markRunSettled: () => {
    set({ runInFlight: false });
  },
  setRunSummary: (runSummary) => {
    set({ runSummary });
  },
}));

/**
 * Default export alias: the contract export is the NAMED `useAppStore`, but
 * sibling WP11 components import the hook as a default. Both resolve to the
 * same store instance.
 */
export default useAppStore;
