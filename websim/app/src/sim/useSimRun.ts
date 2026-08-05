/**
 * `useSimRun` — the WP11 hook that owns the SimWorkerClient lifecycle, plus the
 * pure Run-screen logic (exported, DOM-free, tested in
 * `app/test/run-screen.test.ts`).
 *
 * ## Lifecycle
 *
 * Boot happens once per page (module-level singleton): `loadAppAssets()` →
 * dynamic-import `SimWorkerClient` → `loadGraph` (fresh copies from the loader,
 * TRANSFERRED to the worker) → ready. The stream port is wired straight into
 * the app store's one reducer (`applyStream`), which stamps every reduced
 * number `provenance: "live"`.
 *
 * `SimWorkerClient` is imported DYNAMICALLY inside the boot path — its module
 * imports `@websim/engine/worker/simWorker?worker`, which only Vite's bundler
 * understands. A static value import would make this module (and every pure
 * helper below) unloadable in Node tests; `import type` is erased, so the
 * types still flow.
 *
 * ## Run lanes (WP11 scope)
 *
 * `start(config)` assembles the InitPayload (see {@link planRunCsvs}) and then
 * `runFreely()`s to the end of the run window. WP11 ships play / pause /
 * compute-to-end ONLY: paced playback speeds and arbitrary timeline scrubbing
 * (`scrubTo`) are WP12 — the Scrubber renders the speed control but it is
 * display-only until then.
 *
 * ## Encampments honesty (plan Q4)
 *
 * The raw campsite CSV is never a public asset. The worker's
 * `data/encampments/irp_campsite_reports_sample.csv` input is SYNTHESISED from
 * `encampments-public.bin`: one row per original report row (order preserved
 * via `rowSlot`), coordinates replaced by the snapped street-node coordinate,
 * `inc_id` replaced by the salted hash. The engine's one build-time draw is
 * uniform over report ROWS and it snaps each coordinate to the nearest node,
 * so every draw lands on the same node the raw feed lands on; what is NOT
 * reproduced is the raw-coordinate `snap_gap_m` (≈0 here) — the documented
 * public-default trade-off (IMPLEMENTATION_PLAN §4 encampments row).
 *
 * ## Badge
 *
 * The store's badge is config-derived (preset baselines). Run evidence here
 * can only VETO: `summary.outOfRangeLookups > 0` (or an executed≠configured
 * divergence, none detectable in WP11) derives INVALID via the badge machine
 * and overwrites the store badge. It never upgrades.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { RunConfig } from "@websim/shared/config";
import { diffRunConfigs } from "@websim/shared/config";
import type { EncampmentsPublic } from "@websim/shared/graph-asset";
import type { PresetDefinition } from "@websim/shared/presets/definitions";
import { STATES } from "@websim/engine/agents";
import { ENCAMPMENTS_CSV, resolveClosuresCsv, resolveScenario, ticksPerHour } from "@websim/engine/world";
import type { InitPayload, RunPhase, RunSummary, WaveProgressEvent } from "@websim/engine/worker";

import type { BadgeState } from "../index.js";
import { badgeExplanation, deriveBadge, type BadgeInput } from "../badge/machine.js";
import type { ShelterInfo } from "../charts/transforms.js";
import type { DensityCell, ShelterView } from "../map/layers.js";
import type {
  AppAssets,
  ArchiveBundleEntry,
  ArchiveIndex,
  EncampmentDisplay,
} from "../assets/loader.js";
import { loadAppAssets } from "../assets/loader.js";
import useAppStore from "../state/store.js";
import type { MetricSeries } from "../state/stream.js";
// TYPE-ONLY on purpose — see the module doc. The value is dynamic-imported.
import type { SimWorkerClient } from "./client.js";

// ---------------------------------------------------------------------------
// Pure run planning
// ---------------------------------------------------------------------------

/** The CSV inputs one configuration needs, exactly as `ContextCreator` asks. */
export interface RunCsvPlan {
  /** Shelters file for the scenario code, after any `_elayer` rewrite. */
  readonly sheltersCsv: string;
  /** Closure schedule, or `null` when `closuresCode === 0`. */
  readonly closuresCsv: string | null;
  /** Always `ENCAMPMENTS_CSV` — synthesised from the public asset. */
  readonly encampmentsCsv: string;
  readonly scenarioName: string;
  /** Certified fallthrough: an unlisted scenarioCode ran arm A (R15). */
  readonly fellThrough: boolean;
}

/**
 * Resolve the CSV paths for `config` using the ENGINE's own resolvers
 * (`resolveScenario` / `resolveClosuresCsv`) so the UI cannot maintain a
 * second, driftable scenario table. `exists` is consulted for the
 * `shelterPolicyVariant = 1` `_elayer` rewrite; a missing variant throws the
 * engine's own `BuildFailFastError` here, before any worker round trip.
 */
export function planRunCsvs(
  config: Pick<
    RunConfig,
    "scenarioCode" | "shelterPolicyVariant" | "smokeSeriesCode" | "closuresCode" | "closureDraw"
  >,
  exists: (dataRelativePath: string) => boolean,
): RunCsvPlan {
  const scenario = resolveScenario(config, exists);
  return {
    sheltersCsv: scenario.sheltersCsv,
    closuresCsv: resolveClosuresCsv(config.closuresCode, config.closureDraw),
    encampmentsCsv: ENCAMPMENTS_CSV,
    scenarioName: scenario.scenarioName,
    fellThrough: scenario.fellThrough,
  };
}

/**
 * Synthesise the worker's encampments CSV from the public node-slot asset.
 * One line per original report ROW, in row order (the engine's uniform draw is
 * over rows); columns are exactly the three `ContextCreator` consumes.
 */
export function synthesiseEncampmentsCsv(pub: EncampmentsPublic): string {
  const lines: string[] = ["lon,lat,inc_id"];
  for (let r = 0; r < pub.rowCount; r++) {
    const slot = pub.rowSlot[r]!;
    lines.push(`${pub.nodeLon[slot]!},${pub.nodeLat[slot]!},${pub.rowHashHex[r]!}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Narrow the schema-clamped series code to the loader's literal union. */
export function smokeSeriesCodeOf(config: Pick<RunConfig, "smokeSeriesCode">): 0 | 1 | 2 {
  const code = config.smokeSeriesCode;
  if (code === 0 || code === 1 || code === 2) {
    return code;
  }
  // parseRunConfig + the engine fail-fast both forbid this; reaching it is a bug.
  throw new Error(`smokeSeriesCode ${code} is not a registered series (0/1/2)`);
}

/** Inclusive final scheduled tick of the configured run window. */
export function endTickFor(config: Pick<RunConfig, "simulationHours" | "minutesPerTick">): number {
  return Math.round(config.simulationHours * ticksPerHour(config.minutesPerTick));
}

// ---------------------------------------------------------------------------
// Pure shelter-CSV display parsing (map + occupancy panel metadata)
// ---------------------------------------------------------------------------

/** Display-only shelter metadata parsed from the ACTIVE scenario's CSV. */
export interface ShelterMeta {
  readonly id: string;
  readonly name: string;
  readonly lon: number;
  readonly lat: number;
  /** Parsed bed count; blank/unlimited capacity renders as 0 (display only). */
  readonly capacity: number;
  /** `status` column === "operating". */
  readonly operating: boolean;
}

/** Minimal RFC-4180-ish field split (double quotes, doubled-quote escape). */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Minimal display parse of a shelters CSV: `shelter_id,name,lon,lat,capacity,
 * status` only (header-addressed, so column order is free). Rows whose
 * coordinates fail to parse are skipped silently — mirroring the engine's
 * certified skip — so the display list stays index-parallel to the worker's
 * shelter order (the engine builds shelters in CSV file order and ALSO skips
 * nothing on capacity, only on its own parse rules; coordinate-malformed rows
 * fail the engine build loudly via `requireDouble`, so in practice shipped
 * files parse 1:1).
 *
 * This is display metadata only — the worker parses the same text with the
 * ported CsvLoader; nothing parsed here feeds the simulation.
 */
export function parseSheltersCsvMinimal(text: string): ShelterMeta[] {
  const lines = text.split(/\r?\n/u).filter((l) => l.length > 0);
  const headerLine = lines[0];
  if (headerLine === undefined) {
    return [];
  }
  // Strip a leading BOM (U+FEFF) — `decodeCsvBytes` deliberately preserves it.
  const header = splitCsvLine(
    headerLine.charCodeAt(0) === 0xfeff ? headerLine.slice(1) : headerLine,
  );
  const idCol = header.indexOf("shelter_id");
  const nameCol = header.indexOf("name");
  const lonCol = header.indexOf("lon");
  const latCol = header.indexOf("lat");
  const capCol = header.indexOf("capacity");
  const statusCol = header.indexOf("status");
  const metas: ShelterMeta[] = [];
  for (let r = 1; r < lines.length; r++) {
    const f = splitCsvLine(lines[r]!);
    const at = (col: number): string => (col >= 0 ? (f[col] ?? "") : "");
    const lon = Number(at(lonCol));
    const lat = Number(at(latCol));
    if (at(lonCol).trim() === "" || at(latCol).trim() === "" || !Number.isFinite(lon) || !Number.isFinite(lat)) {
      continue;
    }
    const capRaw = at(capCol).trim();
    const capacity = /^\d+$/u.test(capRaw) ? Number(capRaw) : 0;
    metas.push({
      id: at(idCol),
      name: at(nameCol),
      lon,
      lat,
      capacity,
      operating: at(statusCol).trim().toLowerCase() === "operating",
    });
  }
  return metas;
}

/**
 * Map-layer shelter views: metadata + the frame's occupancy, index-parallel
 * (the worker's occupancy array is in the same CSV file order). `openNow` is
 * the `status` column only — per-tick open/close DATE windows on the map are
 * WP12. No frame yet → occupancy 0 (nothing admitted in this session — a
 * fact, not a fabrication).
 */
export function shelterViewsFrom(
  metas: readonly ShelterMeta[],
  occupancy: Int32Array | null,
): ShelterView[] {
  return metas.map((m, i): ShelterView => ({
    id: m.id,
    name: m.name,
    lon: m.lon,
    lat: m.lat,
    capacity: m.capacity,
    occupancy: occupancy !== null && i < occupancy.length ? occupancy[i]! : 0,
    openNow: m.operating,
  }));
}

/** The occupancy panel's static half. */
export function shelterInfosFrom(metas: readonly ShelterMeta[]): ShelterInfo[] {
  return metas.map((m): ShelterInfo => ({ name: m.name, capacity: m.capacity }));
}

// ---------------------------------------------------------------------------
// Pure encampment display conversion (k-anonymised cells → map polygons)
// ---------------------------------------------------------------------------

/**
 * Convert the shipped k-anonymised density layer (`encampments-display.json`,
 * k = 5, ≥150 m cells) into the map's `DensityCell[]`. A level-L cell spans
 * `step * 2^L` on each axis with level-relative indices; the SW corner is
 * `origin + index * span`. This is the ONLY encampment layer the map renders —
 * cells, never points, and never the un-floored public node counts.
 */
export function densityCellsFromDisplay(display: EncampmentDisplay): DensityCell[] {
  const { originLon, originLat, stepLon, stepLat } = display.grid;
  return display.cells.map((cell): DensityCell => {
    const scale = 2 ** cell.level;
    const spanLon = stepLon * scale;
    const spanLat = stepLat * scale;
    const x0 = originLon + cell.i * spanLon;
    const y0 = originLat + cell.j * spanLat;
    const x1 = x0 + spanLon;
    const y1 = y0 + spanLat;
    return {
      cellX: cell.i,
      cellY: cell.j,
      count: cell.count,
      position: [x0, y0],
      polygon: [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
    };
  });
}

// ---------------------------------------------------------------------------
// Pure archive-bundle mapping (archived-instant-display)
// ---------------------------------------------------------------------------

/**
 * The archive bundle for a preset: the preset's `archiveFamily` IS the
 * bundle's `run_dir` (both are `docs/runs/`-relative). `null` for fresh-run
 * presets and for presets whose family has no shipped bundle.
 */
export function archiveBundleEntryFor(
  index: ArchiveIndex,
  definition: PresetDefinition,
): ArchiveBundleEntry | null {
  if (definition.archiveFamily === null) {
    return null;
  }
  return index.bundles.find((b) => b.run_dir === definition.archiveFamily) ?? null;
}

/** Headline numbers of one certified archived run (bundle `headline` block). */
export interface ArchivedHeadline {
  readonly nAgents: number;
  readonly sheltered: number;
  readonly unreachable: number;
  readonly refusedAllFull: number;
  /** Person-hours above the 55.5 µg/m³ concentration threshold. */
  readonly personHoursAboveUnhealthy: number;
}

/**
 * Extract the archived headline from a bundle JSON. Returns `null` (render
 * "unavailable", never zeros) when the block is missing or non-numeric.
 */
export function archiveHeadline(bundle: unknown): ArchivedHeadline | null {
  if (typeof bundle !== "object" || bundle === null) {
    return null;
  }
  const headline = (bundle as { headline?: unknown }).headline;
  if (typeof headline !== "object" || headline === null) {
    return null;
  }
  const h = headline as Record<string, unknown>;
  const num = (key: string): number | null => (typeof h[key] === "number" ? (h[key] as number) : null);
  const nAgents = num("n_agents");
  const sheltered = num("sheltered");
  const unreachable = num("unreachable");
  const refusedAllFull = num("refused_all_full");
  const personHours = num("total_person_hours_above_unhealthy");
  if (
    nAgents === null ||
    sheltered === null ||
    unreachable === null ||
    refusedAllFull === null ||
    personHours === null
  ) {
    return null;
  }
  return {
    nAgents,
    sheltered,
    unreachable,
    refusedAllFull,
    personHoursAboveUnhealthy: personHours,
  };
}

// ---------------------------------------------------------------------------
// Pure live readouts
// ---------------------------------------------------------------------------

const SHELTERED_IDX = STATES.indexOf("SHELTERED");
const UNREACHABLE_IDX = STATES.indexOf("UNREACHABLE");
const REFUSED_IDX = STATES.indexOf("REFUSED_ALL_FULL");

/** Live headline from the latest reduced metric row. */
export interface LiveHeadline {
  readonly hour: number;
  readonly sheltered: number;
  readonly unreachable: number;
  readonly refusedAllFull: number;
}

export function liveHeadline(metrics: MetricSeries): LiveHeadline | null {
  const last = metrics.hours.length - 1;
  if (last < 0) {
    return null;
  }
  const at = (stateIdx: number): number => metrics.stateCensus[stateIdx]?.[last] ?? Number.NaN;
  return {
    hour: metrics.hours[last]!,
    sheltered: at(SHELTERED_IDX),
    unreachable: at(UNREACHABLE_IDX),
    refusedAllFull: at(REFUSED_IDX),
  };
}

/** Ticks at which closure waves begin, in arrival order, deduplicated. */
export function waveStartTicks(waves: readonly WaveProgressEvent[]): number[] {
  const ticks: number[] = [];
  for (const wave of waves) {
    if (wave.phase === "start" && !ticks.includes(wave.tick)) {
      ticks.push(wave.tick);
    }
  }
  return ticks;
}

/** Display-only integer/decimal formatting ("—" for non-finite, never 0). */
export function formatCount(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
}

// ---------------------------------------------------------------------------
// Pure run-lane state (page-level; drives the start guard and Play/Pause)
// ---------------------------------------------------------------------------

/**
 * True when a run leg is active PAGE-WIDE. `runInFlight` is raised
 * synchronously at the top of `start()`/`resumeToEnd()` (before any await) and
 * lowered in their `finally`, so it covers the whole init window; the
 * stream-driven `runPhase` backs it up across any transient in which the two
 * disagree. Both live in the store, so the answer survives the Run screen
 * unmounting while the module-level worker session keeps executing.
 */
export function runLaneBusy(runInFlight: boolean, runPhase: RunPhase): boolean {
  return runInFlight || runPhase === "building" || runPhase === "running";
}

/** Parameter-wise equality via the shared manifest differ (never `===`). */
export function sameRunConfig(a: RunConfig, b: RunConfig): boolean {
  return diffRunConfigs(a, b).length === 0;
}

/**
 * True when live run evidence on screen was produced by a configuration that
 * is no longer the selected one. Only reachable by editing the config while a
 * leg is in flight (idle-time edits clear the evidence in the store instead —
 * see `shouldClearRunEvidence`); the Run screen must then caption/dim every
 * stream-derived number rather than let it sit next to the new selection.
 */
export function liveEvidenceIsStale(
  lastRunConfig: RunConfig | null,
  config: RunConfig,
  hasLiveEvidence: boolean,
): boolean {
  return hasLiveEvidence && lastRunConfig !== null && !sameRunConfig(lastRunConfig, config);
}

// ---------------------------------------------------------------------------
// Pure badge wiring
// ---------------------------------------------------------------------------

/** Run evidence → the badge machine's input shape. */
export function badgeInputAfterRun(presetUnmodified: boolean, summary: RunSummary): BadgeInput {
  return {
    presetUnmodified,
    // WP11 makes no in-browser archive comparison and runs no gate subset;
    // unknown never upgrades (badge machine rule), so these stay null.
    matchesArchive: null,
    gateSubsetGreen: null,
    outOfRangeLookups: summary.outOfRangeLookups,
    // No executed-parameter readback exists on the wire in WP11; the engine
    // fail-fasts instead of silently rewriting, so false is the honest value.
    executedDiffersFromConfigured: false,
  };
}

/**
 * The honest one-liner under the badge chip. The store's badge is
 * CONFIG-level (preset baselines verified offline), so the wording must claim
 * exactly that — the badge machine's sentences describe in-browser evidence
 * this session did not gather, and are used only for the INVALID veto, whose
 * evidence (the out-of-range count) this session DID gather.
 */
export function runBadgeExplanation(
  badge: BadgeState,
  modifiedCount: number,
  summary: RunSummary | null,
): string {
  switch (badge) {
    case "INVALID": {
      if (summary !== null) {
        return badgeExplanation("INVALID", badgeInputAfterRun(modifiedCount === 0, summary));
      }
      return "Invalid: the badge evidence is internally inconsistent, so these results cannot support any claim about this configuration.";
    }
    case "ARCHIVE-VALIDATED":
      return (
        "Unmodified preset whose configuration matches a certified archived Java run " +
        "(parity verified offline). No in-browser archive comparison has run in this session."
      );
    case "ENGINE-CERTIFIED":
      return (
        "Unmodified fresh-run default. The engine's certification gates ran offline; " +
        "this configuration has no archived counterpart."
      );
    case "EXPLORATORY":
      return modifiedCount > 0
        ? `This configuration differs from the selected preset on ${modifiedCount} parameter(s); its numbers are exploratory only.`
        : "This configuration matches no shipped preset; its numbers are exploratory only.";
  }
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

interface SimSession {
  readonly assets: AppAssets;
  readonly client: SimWorkerClient;
  encampments: EncampmentsPublic | null;
}

let sessionPromise: Promise<SimSession> | null = null;

/**
 * One session per page: assets + worker + graph transfer + stream wiring.
 * A failed boot clears the promise so a reload-free retry can work in dev.
 */
function bootSession(): Promise<SimSession> {
  if (sessionPromise === null) {
    sessionPromise = (async (): Promise<SimSession> => {
      const assets = await loadAppAssets();
      // Dynamic on purpose — see the module doc (`?worker` is Vite-only).
      const { SimWorkerClient: ClientCtor } = await import("./client.js");
      const client = await ClientCtor.start();
      client.onStream((message) => {
        useAppStore.getState().applyStream(message);
      });
      const graph = await assets.graphForWorker();
      await client.loadGraph(graph.topology, graph.geometry);
      return { assets, client, encampments: null };
    })();
    sessionPromise.catch(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}

export interface SimRunHandle {
  /** Assets fetched, worker booted, graph decoded in the worker. */
  readonly ready: boolean;
  /**
   * A run (or resume) leg is active — STORE-derived (`runInFlight` ∨
   * `runPhase`), never per-hook-instance state, so it stays true across a Run
   * screen unmount/remount while the page-level worker session keeps ticking.
   */
  readonly running: boolean;
  readonly error: string | null;
  /** Summary of the last completed/paused run leg (store-held), `null` before any. */
  readonly summary: RunSummary | null;
  /** The verified asset accessors, once booted (graph for the map, CSVs…). */
  readonly assets: AppAssets | null;
  /** Build the world for `config` and free-run to the end of the window. */
  readonly start: (config: RunConfig) => Promise<void>;
  /** Ask the run loop to stop at the next slice boundary. */
  readonly pause: () => Promise<void>;
  /** Resume a paused run to the end of the window ("compute to end"). */
  readonly resumeToEnd: () => Promise<void>;
}

export function useSimRun(): SimRunHandle {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<AppAssets | null>(null);
  const sessionRef = useRef<SimSession | null>(null);
  // The run-in-flight guard and the leg summary are PAGE-level facts owned by
  // the store (they must survive this hook unmounting mid-run); this hook only
  // subscribes to them.
  const runInFlight = useAppStore((s) => s.runInFlight);
  const runPhase = useAppStore((s) => s.runPhase);
  const summary = useAppStore((s) => s.runSummary);

  useEffect(() => {
    let cancelled = false;
    bootSession().then(
      (session) => {
        if (!cancelled) {
          sessionRef.current = session;
          setAssets(session.assets);
          setReady(true);
        }
      },
      (err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  /** INVALID is the only run-evidence override; baselines stay config-derived. */
  const applyRunBadge = useCallback((runSummary: RunSummary): void => {
    const store = useAppStore.getState();
    const input = badgeInputAfterRun(
      store.presetId !== null && store.modifiedFromPreset.length === 0,
      runSummary,
    );
    if (deriveBadge(input) === "INVALID") {
      store.setBadge("INVALID");
    }
  }, []);

  const runLeg = useCallback(
    async (client: SimWorkerClient): Promise<void> => {
      // Free-running playback (display ceiling ON via runFreely). Pacing by
      // speed setting and arbitrary scrubTo are WP12; WP11 is play / pause /
      // compute-to-end only.
      const runSummary = await client.runFreely();
      useAppStore.getState().setRunSummary(runSummary);
      applyRunBadge(runSummary);
    },
    [applyRunBadge],
  );

  const start = useCallback(
    async (config: RunConfig): Promise<void> => {
      // The guard reads the STORE (survives unmount/remount), never a local
      // ref: a remounted hook must still see a leg the previous mount started.
      const store = useAppStore.getState();
      if (runLaneBusy(store.runInFlight, store.runPhase)) {
        return;
      }
      // Synchronously — before ANY await — raise the in-flight guard, wipe the
      // previous run's evidence, and record the executed config. A second
      // click during the whole boot/asset/init window re-enters above and
      // returns; nothing can double-init the worker.
      store.markRunStarting(config);
      try {
        const session = sessionRef.current ?? (await bootSession());
        sessionRef.current = session;
        setError(null);

        const manifestHas = (dataPath: string): boolean =>
          session.assets.manifest.assets[`assets/${dataPath}`] !== undefined;
        const plan = planRunCsvs(config, manifestHas);
        const csv: Record<string, string> = {};
        csv[plan.sheltersCsv] = await session.assets.csvText(plan.sheltersCsv);
        if (plan.closuresCsv !== null) {
          csv[plan.closuresCsv] = await session.assets.csvText(plan.closuresCsv);
        }
        if (session.encampments === null) {
          session.encampments = await session.assets.encampmentsPublic();
        }
        csv[plan.encampmentsCsv] = synthesiseEncampmentsCsv(session.encampments);

        const smokeAsset = await session.assets.smoke(smokeSeriesCodeOf(config));
        const payload: InitPayload = {
          config,
          csv,
          smokeAsset,
          // The governance gate ran offline in the asset pipeline
          // (registry-snapshot.json; failure fails the asset build).
          registryValidated: true,
        };
        await session.client.init(payload);
        await runLeg(session.client);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        // Covers the WHOLE leg — init included — success or failure.
        useAppStore.getState().markRunSettled();
      }
    },
    [runLeg],
  );

  const pause = useCallback(async (): Promise<void> => {
    try {
      // bootSession() is the cached page-level promise: after a remount it is
      // already resolved whenever a run is actually in flight.
      const session = sessionRef.current ?? (await bootSession());
      sessionRef.current = session;
      await session.client.pause();
    } catch (err) {
      // Same error contract as start()/resumeToEnd(): a rejected RPC (worker
      // torn down, postMessage failure…) surfaces in the UI, never as an
      // unhandled rejection.
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const resumeToEnd = useCallback(async (): Promise<void> => {
    const store = useAppStore.getState();
    if (runLaneBusy(store.runInFlight, store.runPhase)) {
      return;
    }
    store.markResumeStarting();
    try {
      const session = sessionRef.current ?? (await bootSession());
      sessionRef.current = session;
      await runLeg(session.client);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      useAppStore.getState().markRunSettled();
    }
  }, [runLeg]);

  return {
    ready,
    running: runLaneBusy(runInFlight, runPhase),
    error,
    summary,
    assets,
    start,
    pause,
    resumeToEnd,
  };
}
