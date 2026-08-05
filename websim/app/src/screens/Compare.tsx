/**
 * Compare screen (WP12a) — archived certified bundle vs a live browser run.
 *
 * Two slots: LEFT is the selected preset's archived bundle ("Certified Java
 * run"), RIGHT is a live run of the current configuration executed in the
 * Compare screen's OWN second worker on the deterministic lane
 * (`useCompareRun` → `runExact`, display ceiling off). Below them: delta
 * cards over the six headline metrics and per-shelter diverging bars.
 *
 * All logic is in exported pure functions (`../compare/deltas.ts`), tested in
 * Node; this file only wires store/hook state into markup.
 *
 * ## Range-across-draws rule (V48/A-34, plan §6.2)
 *
 * For a multi-draw closure family (`closuresCode === 3`) the archived side is
 * a `FamilyPresentation` of kind `"range"` — `presentFamily` cannot return
 * anything else for such a preset — and this screen renders the range with
 * EVERY draw listed. Delta cards are not rendered for range families: a delta
 * against one draw would present a single draw's schedule as the family's
 * result. The live slot is a single run under one draw and is labelled as
 * exactly that, never as the family's result.
 *
 * ## Honesty framing (plan §6.4)
 *
 * The two provenance chips are the `PROVENANCE_CLASSES` labels verbatim, on
 * every slot that shows numbers. Constructed smoke series carry
 * `CONSTRUCTED_SERIES_LABEL`. SE/SE2 presets render their declared archive
 * exception (`pushThetaThreshold`: archived runs executed 0.0 via the Repast
 * negative-"number" batch defect; web presets carry the corrected −0.25) so
 * live-vs-archived closure comparisons are framed correctly. A live result
 * produced by a config that is no longer selected is dimmed and captioned,
 * and `outOfRangeLookups > 0` renders the INVALID warning.
 */

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";

import { provenanceQuirk } from "@websim/shared";
import type { PresetId } from "@websim/shared/presets/definitions";

import { CONSTRUCTED_SERIES_LABEL, PROVENANCE_CLASSES } from "../index.js";
import { isConstructedSeries } from "../controls/paramMeta.js";
import useAppStore, { presetDefinition } from "../state/store.js";
import { archiveBundleEntryFor, formatCount, sameRunConfig, useSimRun } from "../sim/useSimRun.js";
import { useCompareRun } from "../compare/useCompareRun.js";
import {
  HEADLINE_METRICS,
  HEADLINE_METRIC_DECIMALS,
  HEADLINE_METRIC_LABELS,
  deltaCards,
  familyDrawEntries,
  formatPercentDelta,
  formatSigned,
  headlineFromArchiveBundle,
  isMultiDrawFamily,
  maxAbsShelterDelta,
  presentFamily,
  shelterDeltas,
  sheltersFromArchiveBundle,
} from "../compare/deltas.js";
import type {
  DrawHeadline,
  FamilyPresentation,
  HeadlineNumbers,
  ShelterOccupancyRow,
} from "../compare/deltas.js";

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

const rowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  fontSize: "0.85rem",
  padding: "1px 0",
};

function MetricRow({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <div style={rowStyle}>
      <span style={{ color: "#9aa2ab" }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function ProvenanceChip({ kind }: { readonly kind: "archived" | "live" }): ReactElement {
  return (
    <span className={kind === "archived" ? "chip chip-archived" : "chip chip-live"}>
      {PROVENANCE_CLASSES[kind]}
    </span>
  );
}

/** Okabe-Ito blue/vermillion — colorblind-safe, and never the only channel. */
const DELTA_POSITIVE = "#0072B2";
const DELTA_NEGATIVE = "#D55E00";

// ---------------------------------------------------------------------------
// Archived-slot state
// ---------------------------------------------------------------------------

interface ArchivedCompareState {
  readonly presetId: PresetId;
  readonly label: string;
  readonly runDir: string;
  readonly seed: number | null;
  /** `null` = bundle fetched but headline unavailable (rendered as such). */
  readonly presentation: FamilyPresentation | null;
  /** Every draw's numbers, for the range table's per-draw columns. */
  readonly perDraw: readonly DrawHeadline[];
  /** Draws listed in the index whose bundle/headline could not be loaded. */
  readonly missingDraws: readonly number[];
  /** Per-shelter rows (single-schedule presets only). */
  readonly shelters: readonly ShelterOccupancyRow[] | null;
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

export function Compare(): ReactElement {
  const config = useAppStore((s) => s.config);
  const presetId = useAppStore((s) => s.presetId);
  const modifiedFromPreset = useAppStore((s) => s.modifiedFromPreset);

  const { ready, assets } = useSimRun();
  const compare = useCompareRun(assets);

  // ---- archived slot -------------------------------------------------------
  const [archived, setArchived] = useState<ArchivedCompareState | null>(null);
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
        const multi = isMultiDrawFamily(presetId);
        const perDraw: DrawHeadline[] = [];
        const missingDraws: number[] = [];
        let shelters: readonly ShelterOccupancyRow[] | null = null;
        let seed: number | null = null;
        if (multi) {
          for (const { draw, entry } of familyDrawEntries(index, definition)) {
            seed = seed ?? entry.seed;
            try {
              const headline = headlineFromArchiveBundle(await assets.archiveBundle(entry.file));
              if (headline === null) {
                missingDraws.push(draw);
              } else {
                perDraw.push({ draw, headline });
              }
            } catch {
              missingDraws.push(draw);
            }
          }
        } else {
          const entry = archiveBundleEntryFor(index, definition);
          if (entry !== null) {
            seed = entry.seed;
            const bundle = await assets.archiveBundle(entry.file);
            const headline = headlineFromArchiveBundle(bundle);
            if (headline !== null) {
              perDraw.push({ draw: 1, headline });
            }
            shelters = sheltersFromArchiveBundle(bundle);
          }
        }
        let presentation: FamilyPresentation | null = null;
        try {
          presentation = presentFamily(presetId, perDraw);
        } catch {
          presentation = null; // unavailable renders as unavailable, never zeros
        }
        if (!cancelled) {
          setArchived({
            presetId,
            label: definition.label,
            runDir: definition.archiveFamily ?? "",
            seed,
            presentation,
            perDraw,
            missingDraws,
            shelters,
          });
        }
      } catch {
        if (!cancelled) {
          setArchived(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assets, presetId]);

  // ---- derived display state -----------------------------------------------
  const definition = presetId === null ? null : presetDefinition(presetId);

  const liveHeadline: HeadlineNumbers | null = compare.result?.headline ?? null;
  const liveStale =
    compare.result !== null && !sameRunConfig(compare.result.config, config);

  const singleArchivedHeadline =
    archived?.presentation?.kind === "single" ? archived.presentation.headline : null;
  const rangePresentation =
    archived?.presentation?.kind === "range" ? archived.presentation : null;

  const cards = useMemo(
    () =>
      singleArchivedHeadline !== null && liveHeadline !== null
        ? deltaCards(singleArchivedHeadline, liveHeadline)
        : null,
    [singleArchivedHeadline, liveHeadline],
  );

  const shelterBars = useMemo(() => {
    if (archived?.shelters == null || compare.result?.shelters == null) {
      return null;
    }
    const deltas = shelterDeltas(archived.shelters, compare.result.shelters);
    return { deltas, scale: maxAbsShelterDelta(deltas) };
  }, [archived, compare.result]);

  // The constructed-series banner follows the config a number was produced
  // under: the executed one while a result is on screen, else the selection.
  const bannerSeriesCode =
    compare.result !== null ? compare.result.config.smokeSeriesCode : config.smokeSeriesCode;

  const progress =
    compare.status !== null && compare.status.endTick > 0
      ? Math.min(100, Math.round((100 * compare.status.tick) / compare.status.endTick))
      : null;

  const dimmed: CSSProperties | undefined = liveStale ? { opacity: 0.55 } : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "0.75rem", overflowY: "auto" }}>
      <section className="panel" aria-label="Compare overview">
        <h2 className="panel-title">Compare — archived certified run vs live browser run</h2>
        <p className="panel-sub">
          The left slot shows the selected preset&apos;s certified Java archive; the right slot
          runs the current configuration in this browser, in a dedicated second worker on the
          deterministic lane (frame emission independent of wall-clock speed). The two
          provenance classes are labelled on every number and are never merged.
        </p>
        {isConstructedSeries(bannerSeriesCode) ? (
          <p className="panel-warn">{CONSTRUCTED_SERIES_LABEL}</p>
        ) : null}
        {definition !== null && definition.archiveExceptions.length > 0 ? (
          <div>
            {definition.archiveExceptions.map((ex) => (
              <p key={ex.param} className="panel-warn">
                Declared archive exception — {ex.param}: this preset carries{" "}
                {formatCount(ex.presetValue, 2)} while the archived runs executed{" "}
                {formatCount(ex.archivedExecutedValue, 2)}.{" "}
                {provenanceQuirk(ex.quirkNote)?.note ?? ""}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        {/* ---- archived slot ---- */}
        <section className="panel" aria-label="Archived certified result">
          <ProvenanceChip kind="archived" />
          {archived === null ? (
            <p className="panel-sub">
              {presetId === null || definition?.archiveFamily === null
                ? "The selected configuration has no archived counterpart. Select an archived preset to compare against a certified Java run."
                : "Archived bundle unavailable — nothing is shown rather than fabricated numbers."}
            </p>
          ) : (
            <div>
              <h3 className="panel-title">{archived.label}</h3>
              <p className="panel-sub">
                Archived run {archived.runDir}
                {archived.seed === null ? "" : ` (seed ${archived.seed})`}
              </p>
              {archived.presentation === null ? (
                <p className="panel-sub">Headline metrics unavailable for this bundle.</p>
              ) : archived.presentation.kind === "single" ? (
                <div>
                  {HEADLINE_METRICS.map((m) => (
                    <MetricRow
                      key={m}
                      label={HEADLINE_METRIC_LABELS[m]}
                      value={formatCount(
                        archived.presentation !== null && archived.presentation.kind === "single"
                          ? archived.presentation.headline[m]
                          : Number.NaN,
                        HEADLINE_METRIC_DECIMALS[m],
                      )}
                    />
                  ))}
                </div>
              ) : (
                <div>
                  <p className="panel-warn">
                    Multi-draw closure family: results are a RANGE across the pre-committed
                    closure draws. No single draw&apos;s schedule is presented as this
                    family&apos;s result (V48/A-34).
                  </p>
                  {archived.presentation.drawCount === 0 ? (
                    <p className="panel-sub">No draw bundles are available for this family.</p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left" }}>Metric</th>
                            {archived.perDraw.map((d) => (
                              <th key={d.draw} style={{ textAlign: "right" }}>
                                draw {d.draw}
                              </th>
                            ))}
                            <th style={{ textAlign: "right" }}>range (min–max)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {archived.presentation.ranges.map((range, i) => {
                            const metric = HEADLINE_METRICS[i]!;
                            return (
                              <tr key={range.metric}>
                                <td style={{ color: "#9aa2ab" }}>{HEADLINE_METRIC_LABELS[metric]}</td>
                                {archived.perDraw.map((d) => (
                                  <td key={d.draw} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                    {formatCount(d.headline[metric], HEADLINE_METRIC_DECIMALS[metric])}
                                  </td>
                                ))}
                                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                  {formatCount(range.min, HEADLINE_METRIC_DECIMALS[metric])}
                                  {" – "}
                                  {formatCount(range.max, HEADLINE_METRIC_DECIMALS[metric])}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {archived.missingDraws.length > 0 ? (
                    <p className="panel-warn">
                      Draw(s) {archived.missingDraws.join(", ")} could not be loaded; the range
                      covers only the draws listed above.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ---- live slot ---- */}
        <section className="panel" aria-label="Live run result" style={dimmed}>
          <ProvenanceChip kind="live" />
          <div style={{ margin: "0.5rem 0" }}>
            <button
              type="button"
              disabled={!ready || compare.busy}
              onClick={() => {
                void compare.start(config);
              }}
            >
              {compare.busy ? "Running comparison…" : "Run this configuration live"}
            </button>
            {!ready ? (
              <p className="panel-sub">Loading assets and booting the simulation worker…</p>
            ) : null}
            {compare.busy ? (
              <p className="panel-sub">
                {progress === null
                  ? "Building the world…"
                  : `Computing — ${progress}% (tick ${formatCount(compare.status?.tick ?? 0)} of ${formatCount(compare.status?.endTick ?? 0)})`}
              </p>
            ) : null}
          </div>
          {modifiedFromPreset.length > 0 ? (
            <p className="panel-warn">
              The current configuration differs from the selected preset on{" "}
              {modifiedFromPreset.length} parameter(s); the live run executes the modified
              configuration while the archived slot shows the preset&apos;s certified run.
            </p>
          ) : null}
          {liveStale ? (
            <p className="panel-warn">
              These numbers were produced by the previously executed configuration, not the one
              now selected. Run again to compare the current configuration.
            </p>
          ) : null}
          {compare.error !== null ? <p className="panel-warn">{compare.error}</p> : null}
          {compare.result === null ? (
            <p className="panel-sub">
              No live numbers yet — nothing is compared until a run completes in your browser.
            </p>
          ) : (
            <div>
              {rangePresentation !== null ? (
                <p className="panel-sub">
                  Live run under closure draw {compare.result.config.closureDraw} — a single
                  schedule, shown for reference only, never as the family&apos;s result.
                </p>
              ) : null}
              {liveHeadline === null ? (
                <p className="panel-sub">
                  The run completed but its exported headline could not be parsed — no numbers
                  are shown.
                </p>
              ) : (
                <div>
                  {HEADLINE_METRICS.map((m) => (
                    <MetricRow
                      key={m}
                      label={HEADLINE_METRIC_LABELS[m]}
                      value={formatCount(liveHeadline[m], HEADLINE_METRIC_DECIMALS[m])}
                    />
                  ))}
                </div>
              )}
              {compare.result.summary.outOfRangeLookups > 0 ? (
                <p className="panel-warn">
                  {compare.result.summary.outOfRangeLookups} smoke lookup(s) fell outside the
                  loaded series — this run is INVALID and its numbers cannot support any claim.
                </p>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {/* ---- delta cards (single-schedule presets only — see module doc) ---- */}
      {cards !== null ? (
        <section className="panel" aria-label="Delta cards" style={dimmed}>
          <h3 className="panel-title">Δ live − archived</h3>
          <p className="panel-sub">
            Left value: {PROVENANCE_CLASSES.archived}. Right value: {PROVENANCE_CLASSES.live}.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.5rem" }}>
            {cards.map((card) => (
              <div key={card.metric} className="panel" style={{ padding: "0.5rem" }}>
                <p className="panel-sub" style={{ margin: 0 }}>{card.label}</p>
                <MetricRow
                  label="Archived"
                  value={formatCount(card.left, HEADLINE_METRIC_DECIMALS[card.metric])}
                />
                <MetricRow
                  label="Live"
                  value={formatCount(card.right, HEADLINE_METRIC_DECIMALS[card.metric])}
                />
                <div style={rowStyle}>
                  <span style={{ color: "#9aa2ab" }}>Δ</span>
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      color: card.delta === 0 ? undefined : card.delta > 0 ? DELTA_POSITIVE : DELTA_NEGATIVE,
                    }}
                  >
                    {formatSigned(card.delta, HEADLINE_METRIC_DECIMALS[card.metric])}{" "}
                    ({formatPercentDelta(card.percent)})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {rangePresentation !== null && liveHeadline !== null ? (
        <section className="panel" aria-label="Why there are no delta cards">
          <p className="panel-sub">
            Delta cards are not shown for a multi-draw closure family: a delta against one
            archived draw would present a single draw&apos;s schedule as the family&apos;s
            result. Compare the live value against the family&apos;s range above.
          </p>
        </section>
      ) : null}

      {/* ---- per-shelter diverging bars ---- */}
      {shelterBars !== null ? (
        <section className="panel" aria-label="Per-shelter occupancy deltas" style={dimmed}>
          <h3 className="panel-title">Per-shelter final occupancy — Δ live − archived</h3>
          <p className="panel-sub">
            Bars diverge from the center: left ({"Δ"} &lt; 0) means the live run admitted
            fewer at that site than the archived run; right means more. Sites present on only
            one side show no delta.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {shelterBars.deltas.map((d) => {
              const half =
                d.delta === null || shelterBars.scale === 0
                  ? 0
                  : (50 * Math.abs(d.delta)) / shelterBars.scale;
              return (
                <div key={d.id} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1fr) 2fr 90px", gap: 8, alignItems: "center", fontSize: "0.78rem" }}>
                  <span style={{ color: "#9aa2ab", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
                  <div style={{ position: "relative", height: 10, background: "rgba(128,128,128,0.15)" }}>
                    <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#9aa2ab" }} />
                    {d.delta !== null && d.delta !== 0 ? (
                      <div
                        style={{
                          position: "absolute",
                          top: 1,
                          bottom: 1,
                          left: d.delta > 0 ? "50%" : `${50 - half}%`,
                          width: `${half}%`,
                          background: d.delta > 0 ? DELTA_POSITIVE : DELTA_NEGATIVE,
                        }}
                      />
                    ) : null}
                  </div>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {d.delta === null ? "no match" : formatSigned(d.delta)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
