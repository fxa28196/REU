/**
 * Run screen (WP11) — the composition layer.
 *
 * Left rail: PresetPicker over SliderDrawer. Center: MapView. Right rail: the
 * live panel (BadgePanel, archived + live headline panels, StateCensusChart,
 * SmokeStrip, OccupancyPanel). Bottom: Scrubber.
 *
 * All logic lives in exported pure functions (`../sim/useSimRun.ts`), tested
 * without a DOM; this file only wires store state and hook state into the
 * builders' components.
 *
 * ## Provenance honesty (plan §6.2 / §6.4)
 *
 * Selecting an archived preset immediately fetches its archive bundle and
 * renders the certified headline under a "Certified Java run" chip — BEFORE
 * any live run. A live run's numbers appear in their own panel under "Live
 * browser simulation" alongside; they never replace the archived panel. The
 * two chips are the two `PROVENANCE_CLASSES` labels, verbatim.
 */

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";

import type { PresetId } from "@websim/shared/presets/definitions";

import { PROVENANCE_CLASSES } from "../index.js";
import { BadgePanel } from "../badge/BadgePanel.js";
import { OccupancyPanel } from "../charts/OccupancyPanel.js";
import { SmokeStrip } from "../charts/SmokeStrip.js";
import { StateCensusChart } from "../charts/StateCensusChart.js";
import { PresetPicker } from "../controls/PresetPicker.js";
import { Scrubber } from "../controls/Scrubber.js";
import type { SpeedSetting } from "../controls/Scrubber.js";
import { SliderDrawer } from "../controls/SliderDrawer.js";
import { isConstructedSeries } from "../controls/paramMeta.js";
import { MapView } from "../map/MapView.js";
import type { DensityCell } from "../map/layers.js";
import useAppStore, { presetDefinition } from "../state/store.js";
import {
  archiveBundleEntryFor,
  archiveHeadline,
  densityCellsFromDisplay,
  endTickFor,
  formatCount,
  liveEvidenceIsStale,
  liveHeadline,
  parseSheltersCsvMinimal,
  planRunCsvs,
  runBadgeExplanation,
  shelterInfosFrom,
  shelterViewsFrom,
  useSimRun,
  waveStartTicks,
} from "../sim/useSimRun.js";
import type { ArchivedHeadline, ShelterMeta } from "../sim/useSimRun.js";

const EMPTY_OCCUPANCY = new Int32Array(0);

interface GraphBuffersState {
  readonly topology: ArrayBuffer;
  readonly geometry: ArrayBuffer;
}

interface ArchivedPanelState {
  readonly presetId: PresetId;
  readonly presetLabel: string;
  readonly runDir: string;
  readonly seed: number | null;
  readonly headline: ArchivedHeadline | null;
  readonly gatesFailed: readonly string[];
}

const headlineRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  fontSize: "0.85rem",
  padding: "1px 0",
};

function HeadlineRow({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <div style={headlineRowStyle}>
      <span style={{ color: "#9aa2ab" }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function ProvenanceChip({ label, kind }: { readonly label: string; readonly kind: "archived" | "live" }): ReactElement {
  return (
    <span className={kind === "archived" ? "chip chip-archived" : "chip chip-live"}>{label}</span>
  );
}

export function Run(): ReactElement {
  const config = useAppStore((s) => s.config);
  const presetId = useAppStore((s) => s.presetId);
  const badge = useAppStore((s) => s.badge);
  const provenance = useAppStore((s) => s.provenance);
  const modifiedFromPreset = useAppStore((s) => s.modifiedFromPreset);
  const latestFrame = useAppStore((s) => s.latestFrame);
  const metrics = useAppStore((s) => s.metrics);
  const status = useAppStore((s) => s.status);
  const runPhase = useAppStore((s) => s.runPhase);
  const waves = useAppStore((s) => s.waves);
  // The config the in-flight / most recent leg EXECUTED — store-held so it
  // survives screen switches, and cleared with the run evidence on idle-time
  // config edits (store.shouldClearRunEvidence).
  const lastRunConfig = useAppStore((s) => s.lastRunConfig);

  const { ready, running, error, summary, assets, start, pause, resumeToEnd } = useSimRun();

  // Display-only until WP12 wires pacing; see useSimRun's module doc.
  const [speed, setSpeed] = useState<SpeedSetting>("max");

  // ---- map graph (independent copies; never the worker's) ----------------
  const [graph, setGraph] = useState<GraphBuffersState | null>(null);
  useEffect(() => {
    if (assets === null) {
      return;
    }
    let cancelled = false;
    void assets.graphForMap().then(
      (buffers) => {
        if (!cancelled) {
          setGraph(buffers);
        }
      },
      () => undefined, // MapView renders its own decode-error chip on bad buffers
    );
    return () => {
      cancelled = true;
    };
  }, [assets]);

  // ---- k-anonymised encampment density cells -----------------------------
  const [densityCells, setDensityCells] = useState<readonly DensityCell[] | null>(null);
  useEffect(() => {
    if (assets === null) {
      return;
    }
    let cancelled = false;
    void assets.encampmentDisplay().then(
      (display) => {
        if (!cancelled) {
          setDensityCells(densityCellsFromDisplay(display));
        }
      },
      () => undefined, // no density layer is honest; fabricating one is not
    );
    return () => {
      cancelled = true;
    };
  }, [assets]);

  // ---- shelter metadata for the ACTIVE scenario --------------------------
  const [shelterMetas, setShelterMetas] = useState<readonly ShelterMeta[]>([]);
  const scenarioCode = config.scenarioCode;
  const shelterPolicyVariant = config.shelterPolicyVariant;
  const smokeSeriesCode = config.smokeSeriesCode;
  useEffect(() => {
    if (assets === null) {
      return;
    }
    let cancelled = false;
    void (async (): Promise<void> => {
      try {
        const plan = planRunCsvs(
          {
            scenarioCode,
            shelterPolicyVariant,
            smokeSeriesCode,
            // Closure paths are irrelevant to the shelter file; fixed values
            // keep this effect off the closure sliders.
            closuresCode: 0,
            closureDraw: 1,
          },
          (p) => assets.manifest.assets[`assets/${p}`] !== undefined,
        );
        const text = await assets.csvText(plan.sheltersCsv);
        if (!cancelled) {
          setShelterMetas(parseSheltersCsvMinimal(text));
        }
      } catch {
        if (!cancelled) {
          setShelterMetas([]); // missing variant etc. — the run itself will fail loudly
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assets, scenarioCode, shelterPolicyVariant, smokeSeriesCode]);

  // ---- archived-instant-display ------------------------------------------
  const [archived, setArchived] = useState<ArchivedPanelState | null>(null);
  useEffect(() => {
    if (assets === null || presetId === null) {
      setArchived(null);
      return;
    }
    const definition = presetDefinition(presetId);
    if (definition.archiveFamily === null) {
      setArchived(null);
      return;
    }
    let cancelled = false;
    void (async (): Promise<void> => {
      try {
        const index = await assets.archiveIndex();
        const entry = archiveBundleEntryFor(index, definition);
        if (entry === null) {
          if (!cancelled) {
            setArchived(null);
          }
          return;
        }
        const bundle = await assets.archiveBundle(entry.file);
        if (!cancelled) {
          setArchived({
            presetId,
            presetLabel: definition.label,
            runDir: entry.run_dir,
            seed: entry.seed,
            headline: archiveHeadline(bundle),
            gatesFailed: entry.gates_failed,
          });
        }
      } catch {
        if (!cancelled) {
          setArchived(null); // unavailable renders as unavailable, never as zeros
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assets, presetId]);

  // ---- derived display data ----------------------------------------------
  const shelterViews = useMemo(
    () => shelterViewsFrom(shelterMetas, latestFrame === null ? null : latestFrame.occupancy),
    [shelterMetas, latestFrame],
  );
  const shelterInfos = useMemo(() => shelterInfosFrom(shelterMetas), [shelterMetas]);

  // The config the last run EXECUTED decides the constructed banner while its
  // metrics are on screen; the picker's current selection decides it before
  // any live data exists.
  const metricsHaveData = metrics.hours.length > 0;
  const bannerSeriesCode =
    metricsHaveData && lastRunConfig !== null ? lastRunConfig.smokeSeriesCode : config.smokeSeriesCode;

  const live = useMemo(() => liveHeadline(metrics), [metrics]);
  const waveTicks = useMemo(() => waveStartTicks(waves), [waves]);
  const tick = status?.tick ?? latestFrame?.tick ?? 0;
  const endTick = status?.endTick ?? endTickFor(config);
  const keyframeTicks = status?.keyframeTicks ?? [];

  // Stale-evidence guard (mirror of the constructed-banner rule, applied to
  // every stream-derived number): if the selection no longer matches the
  // config the on-screen run EXECUTED — only reachable by editing mid-run —
  // every live panel is dimmed and captioned, and the out-of-range INVALID
  // warning (which belongs to the executed config) is withheld.
  const liveEvidenceOnScreen = metricsHaveData || latestFrame !== null || summary !== null;
  const liveStale = liveEvidenceIsStale(lastRunConfig, config, liveEvidenceOnScreen);

  const explanation = runBadgeExplanation(badge, modifiedFromPreset.length, summary);

  const onPlay = (): void => {
    if (runPhase === "paused") {
      void resumeToEnd();
    } else {
      // start() records the executed config in the store (markRunStarting)
      // before its first await — no separate bookkeeping here.
      void start(config);
    }
  };
  const onPause = (): void => {
    void pause();
  };
  const onScrub = (target: number): void => {
    // WP12 wires arbitrary scrubTo; WP11 supports "compute to end" only
    // (the Scrubber's end button lands here with target === endTick).
    if (target >= endTick && runPhase === "paused") {
      void resumeToEnd();
    }
  };

  return (
    <div className="run-grid">
      <aside className="run-left">
        <PresetPicker />
        <SliderDrawer />
      </aside>

      <section className="run-center" aria-label="Map">
        <MapView
          graph={graph}
          frame={latestFrame}
          shelters={shelterViews}
          smokeUgM3={latestFrame === null ? null : latestFrame.smokeUgM3}
          encampmentDensity={densityCells ?? undefined}
        />
        {!ready && error === null ? (
          <div className="map-overlay-note">Loading assets and booting the simulation worker…</div>
        ) : null}
        {liveStale ? (
          <div className="map-overlay-note">
            The map shows the run of the previously executed configuration — the selection has
            changed since it started.
          </div>
        ) : null}
        {error !== null ? <div className="map-overlay-error">{error}</div> : null}
      </section>

      <aside className="run-right">
        <BadgePanel badge={badge} provenance={provenance} explanation={explanation} />

        {archived !== null ? (
          <section className="panel" aria-label="Archived certified result">
            <ProvenanceChip label={PROVENANCE_CLASSES.archived} kind="archived" />
            <h3 className="panel-title">{archived.presetLabel}</h3>
            <p className="panel-sub">
              Archived run {archived.runDir}
              {archived.seed === null ? "" : ` (seed ${archived.seed})`}
            </p>
            {archived.headline === null ? (
              <p className="panel-sub">Headline metrics unavailable for this bundle.</p>
            ) : (
              <div>
                <HeadlineRow label="Sheltered" value={formatCount(archived.headline.sheltered)} />
                <HeadlineRow
                  label="Refused (all full)"
                  value={formatCount(archived.headline.refusedAllFull)}
                />
                <HeadlineRow label="Unreachable" value={formatCount(archived.headline.unreachable)} />
                <HeadlineRow
                  label="Person-hours above 55.5 µg/m³ (concentration threshold)"
                  value={formatCount(archived.headline.personHoursAboveUnhealthy, 2)}
                />
                <HeadlineRow label="Agents" value={formatCount(archived.headline.nAgents)} />
              </div>
            )}
            {archived.gatesFailed.length > 0 ? (
              <p className="panel-warn">Gates failed: {archived.gatesFailed.join(", ")}</p>
            ) : null}
          </section>
        ) : null}

        <section
          className="panel"
          aria-label="Live run result"
          style={liveStale ? { opacity: 0.55 } : undefined}
        >
          <ProvenanceChip label={PROVENANCE_CLASSES.live} kind="live" />
          {liveStale ? (
            <p className="panel-warn">
              These numbers were produced by the previously executed configuration, not the one now
              selected. Press Play to run the current configuration.
            </p>
          ) : null}
          {live === null ? (
            <p className="panel-sub">No live numbers yet — press Play to run this configuration in your browser.</p>
          ) : (
            <div>
              <HeadlineRow label={`Hour ${formatCount(live.hour)}`} value="" />
              <HeadlineRow label="Sheltered" value={formatCount(live.sheltered)} />
              <HeadlineRow label="Refused (all full)" value={formatCount(live.refusedAllFull)} />
              <HeadlineRow label="Unreachable" value={formatCount(live.unreachable)} />
              <p className="panel-sub">
                Person-hours above the 55.5 µg/m³ threshold ship with the WP12 export; no live value is
                computed yet.
              </p>
            </div>
          )}
          {summary !== null && summary.outOfRangeLookups > 0 && !liveStale ? (
            <p className="panel-warn">
              {summary.outOfRangeLookups} smoke lookup(s) fell outside the loaded series — this run is
              INVALID.
            </p>
          ) : null}
        </section>

        <div
          style={
            liveStale
              ? { display: "flex", flexDirection: "column", gap: "0.5rem", opacity: 0.55 }
              : { display: "flex", flexDirection: "column", gap: "0.5rem" }
          }
        >
          <StateCensusChart series={metrics} />
          <SmokeStrip series={metrics} isConstructed={isConstructedSeries(bannerSeriesCode)} />
          <OccupancyPanel
            occupancy={latestFrame === null ? EMPTY_OCCUPANCY : latestFrame.occupancy}
            shelters={shelterInfos}
          />
        </div>
      </aside>

      <footer className="run-bottom">
        <Scrubber
          tick={tick}
          endTick={endTick}
          keyframeTicks={keyframeTicks}
          playing={running}
          playDisabled={!ready}
          speed={speed}
          onPlay={onPlay}
          onPause={onPause}
          onScrub={onScrub}
          onSpeed={setSpeed}
          waveTicks={waveTicks}
        />
      </footer>
    </div>
  );
}
