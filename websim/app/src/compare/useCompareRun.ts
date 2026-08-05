/**
 * `useCompareRun` — the WP12a hook that owns the Compare screen's OWN
 * `SimWorkerClient` (the page's SECOND worker; the first is `useSimRun`'s
 * page-level session, which this module never touches).
 *
 * ## Why a second worker
 *
 * The Run screen's worker session is a page singleton whose stream is wired
 * into the app store; `init()` on it would destroy the Run screen's evidence.
 * The Compare screen therefore runs its live slot in a separate worker, booted
 * lazily on the first comparison run. `AppAssets.graphForWorker()` returns
 * fresh copies of the verified graph bytes per call precisely so a second
 * worker can be fed without touching the first's (`assets/loader.ts`).
 *
 * ## Deterministic lane, no frames
 *
 * Compare legs run on `runExact` (display ceiling OFF — `sim/client.ts`: the
 * lane for "anything that will diff two runs"). {@link COMPARE_RUN_OPTIONS}
 * additionally disables display frames and snapshots: a frame is a pure READ
 * of the model (`engine/src/worker/protocol.ts` — nothing derived from frames
 * reaches an export, a census or a digest), and the Compare numbers come from
 * the engine's own v2-web export, so streaming ~GB of unwatched frames out of
 * the second worker would cost wall clock and buy nothing. Snapshots serve
 * scrubbing, which Compare does not offer.
 *
 * ## Where the live numbers come from
 *
 * After the leg completes, the hook calls `exportOutputs({flavour: "v2-web"})`
 * and parses `simulation.v2.json`: the ENGINE emits those numbers from the run
 * it executed (plan Q5 — never assembled from UI state). Every number surfaced
 * here is a live browser simulation and the screen must chip it as such;
 * nothing in this module can mint the archived provenance class.
 *
 * ## Module-level session + leg guard
 *
 * Like `useSimRun`'s session, the client and the in-flight leg live at module
 * level: the worker keeps executing if the user switches screens mid-run, a
 * remount re-attaches to the leg's completion, and the completed result
 * (with the config it EXECUTED, for staleness attribution) survives the screen
 * unmounting. The guard is the module-level leg promise — `SimWorkerApi.init`
 * replaces the worker's host, so overlapping legs on one worker must be
 * structurally impossible, not merely discouraged.
 *
 * `SimWorkerClient` is imported DYNAMICALLY (same reason as `useSimRun`: its
 * module imports the Vite-only `?worker` form, and a static value import would
 * make this module unloadable in Node tests; `import type` is erased).
 */

import { useCallback, useEffect, useState } from "react";

import type { RunConfig } from "@websim/shared/config";
import { PARAM_NAMES } from "@websim/shared/schema";
import type { InitPayload, RunStatus, RunSummary } from "@websim/engine/worker";

import type { AppAssets } from "../assets/loader.js";
import type { LaneRunOptions, SimWorkerClient } from "../sim/client.js";
import { planRunCsvs, smokeSeriesCodeOf, synthesiseEncampmentsCsv } from "../sim/useSimRun.js";
import type { HeadlineNumbers, ShelterOccupancyRow } from "./deltas.js";
import {
  headlineFromSimulationJson,
  parseSimulationJsonText,
  sheltersFromSimulationJson,
} from "./deltas.js";

/**
 * Compare-lane run options (everything but the ceiling, which `runExact`
 * pins to 0): no display frames, no snapshot ring. Outcome-neutral by the
 * engine's own contract — see the module doc.
 */
export const COMPARE_RUN_OPTIONS: LaneRunOptions = {
  frameEveryTicks: 0,
  snapshotEveryTicks: 0,
};

/** A completed compare leg, attributed to the config it EXECUTED. */
export interface CompareRunResult {
  /** The exact config the leg executed — staleness checks compare against THIS. */
  readonly config: RunConfig;
  readonly summary: RunSummary;
  /** `null` when the export could not be parsed — rendered as unavailable. */
  readonly headline: HeadlineNumbers | null;
  readonly shelters: readonly ShelterOccupancyRow[] | null;
}

// ---------------------------------------------------------------------------
// Module-level session (page singleton — see module doc)
// ---------------------------------------------------------------------------

interface CompareSession {
  readonly client: SimWorkerClient;
}

let compareSessionPromise: Promise<CompareSession> | null = null;
/** Non-null exactly while a compare leg is in flight — the page-wide guard. */
let compareLegPromise: Promise<void> | null = null;
let lastCompareResult: CompareRunResult | null = null;
let lastCompareError: string | null = null;

function bootCompareSession(assets: AppAssets): Promise<CompareSession> {
  if (compareSessionPromise === null) {
    compareSessionPromise = (async (): Promise<CompareSession> => {
      // Dynamic on purpose — `?worker` is Vite-only (see module doc).
      const { SimWorkerClient: ClientCtor } = await import("../sim/client.js");
      const client = await ClientCtor.start();
      const graph = await assets.graphForWorker();
      await client.loadGraph(graph.topology, graph.geometry);
      return { client };
    })();
    // A failed boot clears the promise so a retry can work without a reload.
    compareSessionPromise.catch(() => {
      compareSessionPromise = null;
    });
  }
  return compareSessionPromise;
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export interface CompareRunHandle {
  /** A compare leg is executing (page-wide — survives unmount/remount). */
  readonly busy: boolean;
  readonly error: string | null;
  /** Worker status at slice boundaries, for the progress readout. */
  readonly status: RunStatus | null;
  /** The last COMPLETED leg (module-held: survives screen switches). */
  readonly result: CompareRunResult | null;
  /** Build the world for `config` in the compare worker and run to the end. */
  readonly start: (config: RunConfig) => Promise<void>;
}

export function useCompareRun(assets: AppAssets | null): CompareRunHandle {
  const [busy, setBusy] = useState<boolean>(compareLegPromise !== null);
  const [error, setError] = useState<string | null>(lastCompareError);
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [result, setResult] = useState<CompareRunResult | null>(lastCompareResult);
  const [session, setSession] = useState<CompareSession | null>(null);

  // Re-attach to a leg started before this mount: when it settles, pull the
  // module-held outcome into this instance's state.
  useEffect(() => {
    const leg = compareLegPromise;
    if (leg === null) {
      return;
    }
    let cancelled = false;
    void leg.then(() => {
      if (!cancelled) {
        setBusy(compareLegPromise !== null);
        setResult(lastCompareResult);
        setError(lastCompareError);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Status subscription to the compare worker's stream. Frames/metrics are
  // not reduced anywhere: this hook's numbers come from the export, and the
  // app store must never receive a second worker's stream.
  useEffect(() => {
    if (session === null) {
      return;
    }
    return session.client.onStream((message) => {
      if (message.kind === "status") {
        setStatus(message);
      }
    });
  }, [session]);

  const start = useCallback(
    async (config: RunConfig): Promise<void> => {
      // Page-wide guard: one compare leg at a time, whatever is mounted.
      if (compareLegPromise !== null) {
        return;
      }
      if (assets === null) {
        setError("Assets are still loading — try again in a moment.");
        return;
      }
      // Starting a new leg wipes the previous result everywhere: its numbers
      // belong to a config that is no longer the one being compared.
      lastCompareResult = null;
      lastCompareError = null;
      setBusy(true);
      setError(null);
      setResult(null);
      setStatus(null);
      const leg = (async (): Promise<void> => {
        const s = await bootCompareSession(assets);
        setSession(s);
        const manifestHas = (dataPath: string): boolean =>
          assets.manifest.assets[`assets/${dataPath}`] !== undefined;
        const plan = planRunCsvs(config, manifestHas);
        const csv: Record<string, string> = {};
        csv[plan.sheltersCsv] = await assets.csvText(plan.sheltersCsv);
        if (plan.closuresCsv !== null) {
          csv[plan.closuresCsv] = await assets.csvText(plan.closuresCsv);
        }
        csv[plan.encampmentsCsv] = synthesiseEncampmentsCsv(await assets.encampmentsPublic());
        const smokeAsset = await assets.smoke(smokeSeriesCodeOf(config));
        const payload: InitPayload = {
          config,
          csv,
          smokeAsset,
          // The governance gate ran offline in the asset pipeline (plan Q10).
          registryValidated: true,
        };
        await s.client.init(payload);
        // Deterministic lane: Compare's numbers must be a function of the
        // config alone, never of how fast this machine painted.
        const summary = await s.client.runExact(COMPARE_RUN_OPTIONS);
        const outputs = await s.client.api.exportOutputs({
          flavour: "v2-web",
          paramNames: PARAM_NAMES,
        });
        const json = parseSimulationJsonText(outputs.simulationJson);
        lastCompareResult = {
          config,
          summary,
          headline: headlineFromSimulationJson(json),
          shelters: sheltersFromSimulationJson(json),
        };
      })();
      compareLegPromise = (async (): Promise<void> => {
        try {
          await leg;
        } catch (err) {
          lastCompareError = err instanceof Error ? err.message : String(err);
        } finally {
          compareLegPromise = null;
        }
      })();
      await compareLegPromise;
      setBusy(false);
      setResult(lastCompareResult);
      setError(lastCompareError);
    },
    [assets],
  );

  return { busy, error, status, result, start };
}
