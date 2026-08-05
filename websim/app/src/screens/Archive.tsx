/**
 * Archive screen (WP12b) — browser over the shipped archive bundles.
 *
 * Everything shown here is a digest of the read-only certified Java run
 * archive (`docs/runs/`), served as static JSON: the index renders instantly
 * with zero compute, and selecting a bundle fetches exactly one bundle file.
 * Every number carries the "Certified Java run" provenance class — nothing on
 * this screen is a live browser number.
 *
 * "Replay in browser" appears only on bundles whose exact `run_dir` a shipped
 * preset diffs clean against (`replayPresetFor`): it applies that preset to
 * the store and switches to the Run screen, where the archived headline
 * renders immediately and the badge is earned by the configuration — never
 * inherited from this screen.
 *
 * Bundles with a non-empty `gates_failed` render the failed gate names in
 * red; a failed gate is a recorded fact about the archived run.
 *
 * All logic is in `../provenance/registry.ts` (pure, Node-tested); this file
 * only wires state into markup.
 */
import { useEffect, useState } from "react";
import type { CSSProperties, ReactElement } from "react";

import { PROVENANCE_CLASSES } from "../index.js";
import { WARN_TEXT } from "../a11y/contrast.js";
import type { ArchiveBundleEntry, ArchiveIndex } from "../assets/loader.js";
import useAppStore from "../state/store.js";
import { archiveHeadline, formatCount } from "../sim/useSimRun.js";
import type { ArchivedHeadline } from "../sim/useSimRun.js";
import {
  bundleGatesFailedLine,
  bundleLineage,
  formatBytes,
  gateRows,
  groupBundlesByFamily,
  replayPresetFor,
  sharedScreenAssets,
} from "../provenance/registry.js";
import type { BundleLineage, GateRow } from "../provenance/registry.js";

// Okabe-Ito vermillion lightened for AA as TEXT, matching .panel-warn. Raw
// #d55e00 measures 4.27:1 on the panel surface, under WCAG 1.4.3 AA's 4.5:1 —
// the same axe color-contrast defect found on the Provenance screen; these
// rows are only reachable once a bundle with a failed gate is on screen.
const FAILED_RED = WARN_TEXT;

const pageStyle: CSSProperties = {
  height: "100%",
  overflowY: "auto",
  padding: "0.75rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const layoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 380px",
  gap: "0.5rem",
  alignItems: "start",
};

const tableStyle: CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
  fontSize: "0.8rem",
};

const cellStyle: CSSProperties = {
  padding: "3px 10px 3px 0",
  borderBottom: "1px solid #2a2e35",
  textAlign: "left",
  verticalAlign: "top",
};

const headCellStyle: CSSProperties = {
  ...cellStyle,
  color: "#9aa2ab",
  fontWeight: 600,
};

const monoStyle: CSSProperties = { fontFamily: "ui-monospace, monospace", fontSize: "0.75rem" };

const buttonStyle: CSSProperties = {
  background: "#14161a",
  color: "#e6e8eb",
  border: "1px solid #2a2e35",
  borderRadius: 4,
  padding: "2px 8px",
  fontSize: "0.75rem",
  cursor: "pointer",
};

interface BundleDetail {
  readonly bundleId: string;
  readonly lineage: BundleLineage;
  readonly headline: ArchivedHeadline | null;
  readonly gates: readonly GateRow[] | null;
}

function DetailRow({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.8rem", padding: "1px 0" }}>
      <span style={{ color: "#9aa2ab" }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere", textAlign: "right" }}>{value}</span>
    </div>
  );
}

/** `null` lineage fields render as an explicit gap, never as a made-up value. */
const orUnavailable = (v: string | null): string => v ?? "unavailable";

export function Archive(): ReactElement {
  const applyPreset = useAppStore((s) => s.applyPreset);
  const setScreen = useAppStore((s) => s.setScreen);

  const [index, setIndex] = useState<ArchiveIndex | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ArchiveBundleEntry | null>(null);
  const [detail, setDetail] = useState<BundleDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async (): Promise<void> => {
      try {
        const assets = await sharedScreenAssets();
        const loaded = await assets.archiveIndex();
        if (!cancelled) {
          setIndex(loaded);
        }
      } catch (err) {
        if (!cancelled) {
          setIndexError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selected === null) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setDetailError(null);
    void (async (): Promise<void> => {
      try {
        const assets = await sharedScreenAssets();
        const bundle = await assets.archiveBundle(selected.file);
        if (!cancelled) {
          setDetail({
            bundleId: selected.bundle_id,
            lineage: bundleLineage(bundle),
            headline: archiveHeadline(bundle),
            gates: gateRows(bundle),
          });
        }
      } catch (err) {
        if (!cancelled) {
          setDetailError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const onReplay = (entry: ArchiveBundleEntry): void => {
    const preset = replayPresetFor(entry.run_dir);
    if (preset !== null) {
      applyPreset(preset.id);
      setScreen("run");
    }
  };

  const groups = index === null ? [] : groupBundlesByFamily(index.bundles);

  return (
    <div style={pageStyle}>
      <section className="panel" aria-label="Archive of certified runs">
        <span className="chip chip-archived">{PROVENANCE_CLASSES.archived}</span>
        <h2 className="panel-title">Certified run archive</h2>
        <p className="panel-sub">
          Shipped digests of the read-only certified Java run archive — rendered instantly, with
          zero browser compute. &quot;Replay in browser&quot; applies the shipped preset that
          reproduces that exact archived configuration and opens the Run screen, where the badge
          is earned by the configuration itself.
        </p>
        {index !== null ? (
          <p className="panel-sub">
            {index.archive_root_note} Census: {formatCount(index.archive_census.run_directories_with_a_manifest)}{" "}
            run directories with a manifest, {formatCount(index.archive_census.with_agents_csv)} with per-agent
            rows, {formatCount(index.archive_census.with_shelters_csv)} with shelter tables;{" "}
            {formatCount(index.bundles.length)} bundles shipped.
          </p>
        ) : null}
        {indexError !== null ? (
          <p className="panel-warn">Archive index unavailable: {indexError}</p>
        ) : null}
        {index === null && indexError === null ? <p className="panel-sub">Loading the archive index…</p> : null}
      </section>

      {index !== null ? (
        <div style={layoutStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", minWidth: 0 }}>
            {groups.map((group) => (
              <section key={group.family} className="panel" aria-label={`Preset family ${group.family}`}>
                <h3 className="panel-title">
                  Family {group.family} ({formatCount(group.bundles.length)} bundle
                  {group.bundles.length === 1 ? "" : "s"})
                </h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={headCellStyle}>Bundle</th>
                        <th style={headCellStyle}>Seed</th>
                        <th style={headCellStyle}>Size</th>
                        <th style={headCellStyle}>Gates</th>
                        <th style={headCellStyle}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.bundles.map((entry) => {
                        const failed = bundleGatesFailedLine(entry);
                        const preset = replayPresetFor(entry.run_dir);
                        const isSelected = selected !== null && selected.bundle_id === entry.bundle_id;
                        return (
                          <tr
                            key={entry.bundle_id}
                            style={isSelected ? { background: "#242a33" } : undefined}
                          >
                            <td style={cellStyle}>
                              <span style={monoStyle}>{entry.bundle_id}</span>
                            </td>
                            <td style={cellStyle}>{entry.seed === null ? "—" : String(entry.seed)}</td>
                            <td style={cellStyle}>{formatBytes(entry.bytes)}</td>
                            <td style={cellStyle}>
                              {failed === null ? (
                                <span style={{ color: "#9aa2ab" }}>none failed</span>
                              ) : (
                                <span role="alert" style={{ color: FAILED_RED, fontWeight: 700 }}>
                                  {failed}
                                </span>
                              )}
                            </td>
                            <td style={cellStyle}>
                              <span style={{ display: "inline-flex", gap: 6 }}>
                                <button
                                  type="button"
                                  style={buttonStyle}
                                  onClick={() => {
                                    setSelected(entry);
                                  }}
                                >
                                  Details
                                </button>
                                {preset !== null ? (
                                  <button
                                    type="button"
                                    style={buttonStyle}
                                    title={`Applies preset '${preset.id}' and opens the Run screen`}
                                    onClick={() => {
                                      onReplay(entry);
                                    }}
                                  >
                                    Replay in browser
                                  </button>
                                ) : null}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>

          <section className="panel" aria-label="Bundle detail" style={{ position: "sticky", top: 0 }}>
            <span className="chip chip-archived">{PROVENANCE_CLASSES.archived}</span>
            {selected === null ? (
              <p className="panel-sub">Select a bundle to see its commit lineage and headline.</p>
            ) : (
              <div>
                <h3 className="panel-title" style={monoStyle}>
                  {selected.bundle_id}
                </h3>
                <DetailRow label="Archived run directory" value={selected.run_dir} />
                <DetailRow label="Bundle SHA-256 (recorded)" value={selected.sha256} />
                <DetailRow label="Per-agent rows in bundle" value={selected.has_per_agent ? "yes" : "no"} />
                {detailError !== null ? <p className="panel-warn">Bundle unavailable: {detailError}</p> : null}
                {detail === null && detailError === null ? <p className="panel-sub">Loading bundle…</p> : null}
                {detail !== null ? (
                  <div>
                    <h4 className="panel-title">Commit lineage</h4>
                    <DetailRow label="Java git commit" value={orUnavailable(detail.lineage.gitCommit)} />
                    <DetailRow label="data_version_tag" value={orUnavailable(detail.lineage.dataVersionTag)} />
                    <DetailRow label="sim_id" value={orUnavailable(detail.lineage.simId)} />
                    <DetailRow label="Manifest schema" value={orUnavailable(detail.lineage.manifestSchema)} />
                    <DetailRow label="Generated" value={orUnavailable(detail.lineage.generatedUtc)} />
                    {detail.lineage.generatedUtcNote !== null ? (
                      <p className="panel-sub">{detail.lineage.generatedUtcNote}</p>
                    ) : null}
                    <DetailRow label="Java version" value={orUnavailable(detail.lineage.javaVersion)} />
                    <DetailRow label="Repast version" value={orUnavailable(detail.lineage.repastVersion)} />
                    <DetailRow
                      label="Working tree dirty at run"
                      value={detail.lineage.workingTreeDirty === null ? "unavailable" : detail.lineage.workingTreeDirty ? "yes" : "no"}
                    />
                    <DetailRow label="Scenario" value={orUnavailable(detail.lineage.scenario)} />

                    <h4 className="panel-title">Headline (archived)</h4>
                    {detail.headline === null ? (
                      <p className="panel-sub">Headline metrics unavailable for this bundle.</p>
                    ) : (
                      <div>
                        <DetailRow label="Agents" value={formatCount(detail.headline.nAgents)} />
                        <DetailRow label="Sheltered" value={formatCount(detail.headline.sheltered)} />
                        <DetailRow label="Refused (all full)" value={formatCount(detail.headline.refusedAllFull)} />
                        <DetailRow label="Unreachable" value={formatCount(detail.headline.unreachable)} />
                        <DetailRow
                          label="Person-hours above 55.5 µg/m³ (concentration threshold)"
                          value={formatCount(detail.headline.personHoursAboveUnhealthy, 2)}
                        />
                      </div>
                    )}

                    <h4 className="panel-title">Recorded gates</h4>
                    {detail.gates === null ? (
                      <p className="panel-sub">Gate records unavailable for this bundle.</p>
                    ) : (
                      <ul style={{ margin: "4px 0", paddingLeft: "1.1rem", fontSize: "0.78rem" }}>
                        {detail.gates.map((g) => (
                          <li key={g.id} style={g.ok ? undefined : { color: FAILED_RED, fontWeight: 700 }}>
                            <span style={monoStyle}>{g.id}</span>: {g.ok ? "pass" : "FAIL"} — {g.detail}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
