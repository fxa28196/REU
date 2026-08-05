/**
 * Provenance screen (WP12b).
 *
 * Renders, from data that exists in this build — nothing synthesised:
 *
 *  1. the governance registry snapshot (`assets/registry-snapshot.json`),
 *     validated at asset-build time (plan Q10) and digest-verified here before
 *     display; if the asset is absent an honest "not built" panel renders;
 *  2. the graph corruption-correction census, read from the shipped topology
 *     container itself (produced by the read-only Java exporter, plan Q8);
 *  3. the asset manifest — per-asset SHA-256, size, source file — plus the
 *     build commit and timestamp (plan Q5);
 *  4. the last run's configured-vs-executed diff view (`ExecutedDiff`);
 *  5. the provenance quirk ledger (`PROVENANCE_QUIRKS`, currently the
 *     pushThetaThreshold batch-zeroing note every SE/SE2 surface must carry);
 *  6. the full data-attribution record (the one-line credit is in the page
 *     footer on every screen).
 *
 * On the executed-vs-configured evidence: the WP11/WP12 wire carries no
 * executed-parameter readback. What IS true, and is what the caption under the
 * diff states, is the engine's fail-fast contract — the typed config cannot be
 * silently rewritten (the Repast negative-"number" zeroing is unreproducible
 * by construction, divergence register item 6) and a config the engine cannot
 * execute throws instead of running. The diff therefore shows the executed
 * leg's 41 parameters as both configured and executed, under a caption that
 * says exactly where that equality comes from.
 *
 * All logic lives in `../provenance/registry.ts` (pure, Node-tested).
 */
import { useEffect, useState } from "react";
import type { CSSProperties, ReactElement } from "react";

import { PROVENANCE_QUIRKS } from "@websim/shared";
import { unpackTopology } from "@websim/shared/graph-asset";

import { DATA_ATTRIBUTION, PROVENANCE_CLASSES } from "../index.js";
import { ExecutedDiff } from "../badge/ExecutedDiff.js";
import useAppStore from "../state/store.js";
import { formatCount } from "../sim/useSimRun.js";
import {
  assetByteFetcher,
  blockingAssumptions,
  formatBytes,
  graphCorrectionsView,
  groupVariablesByEvidenceClass,
  loadRegistrySnapshot,
  manifestRows,
  sharedScreenAssets,
} from "../provenance/registry.js";
import type {
  GraphCorrectionsView,
  ManifestRow,
  RegistrySnapshotLoad,
} from "../provenance/registry.js";

const FAILED_RED = "#d55e00"; // Okabe-Ito vermillion, matching .panel-warn

const pageStyle: CSSProperties = {
  height: "100%",
  overflowY: "auto",
  padding: "0.75rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  maxWidth: "70rem",
};

const tableStyle: CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
  fontSize: "0.78rem",
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

const monoStyle: CSSProperties = { fontFamily: "ui-monospace, monospace", fontSize: "0.72rem" };

function FactRow({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.8rem", padding: "1px 0" }}>
      <span style={{ color: "#9aa2ab" }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere", textAlign: "right" }}>{value}</span>
    </div>
  );
}

interface ManifestBlock {
  readonly buildCommit: string;
  readonly builtUtc: string;
  readonly rows: readonly ManifestRow[];
}

export function Provenance(): ReactElement {
  const lastRunConfig = useAppStore((s) => s.lastRunConfig);
  const runSummary = useAppStore((s) => s.runSummary);

  const [registry, setRegistry] = useState<RegistrySnapshotLoad | null>(null);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [manifestBlock, setManifestBlock] = useState<ManifestBlock | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<GraphCorrectionsView | null>(null);
  const [correctionsError, setCorrectionsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async (): Promise<void> => {
      let assets;
      try {
        assets = await sharedScreenAssets();
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setManifestError(message);
          setRegistryError(message);
          setCorrectionsError(message);
        }
        return;
      }
      if (cancelled) {
        return;
      }
      setManifestBlock({
        buildCommit: assets.manifest.build_commit,
        builtUtc: assets.manifest.built_utc,
        rows: manifestRows(assets.manifest),
      });

      try {
        const loaded = await loadRegistrySnapshot(
          assets.manifest,
          assetByteFetcher(import.meta.env.BASE_URL),
        );
        if (!cancelled) {
          setRegistry(loaded);
        }
      } catch (err) {
        if (!cancelled) {
          setRegistryError(err instanceof Error ? err.message : String(err));
        }
      }

      try {
        const graph = await assets.graphForMap();
        const topology = unpackTopology(new Uint8Array(graph.topology));
        if (!cancelled) {
          setCorrections(graphCorrectionsView(topology.census, topology.corrections));
        }
      } catch (err) {
        if (!cancelled) {
          setCorrectionsError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const executedDiffConfig: Record<string, number> | null =
    lastRunConfig === null ? null : { ...lastRunConfig };

  return (
    <div style={pageStyle}>
      {/* ---- 1. governance registry ---------------------------------------- */}
      <section className="panel" aria-label="Governance registry">
        <h2 className="panel-title">Governance registry</h2>
        {registry === null && registryError === null ? (
          <p className="panel-sub">Loading the registry snapshot…</p>
        ) : null}
        {registryError !== null ? (
          <p className="panel-warn">Registry snapshot unavailable: {registryError}</p>
        ) : null}
        {registry !== null && registry.state === "not-built" ? (
          <p className="panel-warn">Registry asset not built. {registry.message}</p>
        ) : null}
        {registry !== null && registry.state === "loaded" ? (
          <div>
            <p className="panel-sub" style={monoStyle}>
              {registry.snapshot.summary_line}
            </p>
            <p className="panel-sub">
              Gate: {registry.snapshot.gate} Scope: {registry.snapshot.gate_scope}
            </p>
            <FactRow
              label={registry.snapshot.variables_path}
              value={`SHA-256 ${registry.snapshot.variables_sha256}`}
            />
            <FactRow
              label={registry.snapshot.assumptions_path}
              value={`SHA-256 ${registry.snapshot.assumptions_sha256}`}
            />

            <h3 className="panel-title">
              Variables ({formatCount(registry.snapshot.variable_count)}) by evidence class
            </h3>
            {groupVariablesByEvidenceClass(registry.snapshot.variables).map((group) => (
              <div key={group.evidenceClass}>
                <h4 className="panel-title">
                  {group.label} ({formatCount(group.variables.length)})
                </h4>
                {group.variables.length === 0 ? (
                  <p className="panel-sub">No variables in this class.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={headCellStyle}>Id</th>
                          <th style={headCellStyle}>Name</th>
                          <th style={headCellStyle}>Status</th>
                          <th style={headCellStyle}>DOI / dataset</th>
                          <th style={headCellStyle}>Uncertainty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.variables.map((v) => (
                          <tr key={v.variable_id}>
                            <td style={{ ...cellStyle, ...monoStyle }}>{v.variable_id}</td>
                            <td style={cellStyle}>
                              {v.name}
                              {v.status === "placeholder" ? (
                                <span style={{ color: FAILED_RED, fontWeight: 600 }}> (placeholder — inert)</span>
                              ) : null}
                            </td>
                            <td style={cellStyle}>{v.status}</td>
                            <td style={{ ...cellStyle, ...monoStyle }}>{v.doi_or_dataset}</td>
                            <td style={cellStyle}>{v.uncertainty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            <p className="panel-sub">{registry.snapshot.placeholder_note}.</p>

            <h3 className="panel-title">
              Assumptions ({formatCount(registry.snapshot.assumption_count)})
            </h3>
            {blockingAssumptions(registry.snapshot.assumptions).length > 0 ? (
              <div>
                <p className="panel-warn">
                  Blocking assumptions (must be resolved before publication):{" "}
                  {blockingAssumptions(registry.snapshot.assumptions)
                    .map((a) => a.assumption_id)
                    .join(", ")}
                </p>
              </div>
            ) : null}
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={headCellStyle}>Id</th>
                    <th style={headCellStyle}>Classification</th>
                    <th style={headCellStyle}>Status</th>
                    <th style={headCellStyle}>Statement</th>
                  </tr>
                </thead>
                <tbody>
                  {registry.snapshot.assumptions.map((a) => (
                    <tr key={a.assumption_id}>
                      <td style={{ ...cellStyle, ...monoStyle }}>{a.assumption_id}</td>
                      <td style={cellStyle}>{a.classification}</td>
                      <td style={a.status === "blocking" ? { ...cellStyle, color: FAILED_RED, fontWeight: 700 } : cellStyle}>
                        {a.status}
                      </td>
                      <td style={cellStyle}>{a.statement}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      {/* ---- 2. graph correction census ------------------------------------ */}
      <section className="panel" aria-label="Street graph correction census">
        <h2 className="panel-title">Street graph corruption-correction census</h2>
        <p className="panel-sub">
          Read from the shipped graph asset, which the read-only Java exporter produced from the
          certified StreetNetwork build (plan Q8) — the correction is never re-implemented in the
          browser. The unpacker cross-checks these figures against the arrays it decodes.
        </p>
        {corrections === null && correctionsError === null ? (
          <p className="panel-sub">Decoding the graph asset…</p>
        ) : null}
        {correctionsError !== null ? (
          <p className="panel-warn">Graph asset unavailable: {correctionsError}</p>
        ) : null}
        {corrections !== null ? (
          <div>
            {corrections.facts.map((fact) => (
              <FactRow key={fact.label} label={fact.label} value={fact.value} />
            ))}
            <h3 className="panel-title">
              Correction records ({formatCount(corrections.reattached.length)} reattached,{" "}
              {formatCount(corrections.split.length)} split)
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={headCellStyle}>Kind</th>
                    <th style={headCellStyle}>Attr node id</th>
                    <th style={headCellStyle}>Graph node id</th>
                    <th style={headCellStyle}>Distance from primary (m)</th>
                    <th style={headCellStyle}>Claims</th>
                  </tr>
                </thead>
                <tbody>
                  {[...corrections.reattached, ...corrections.split].map((c) => (
                    <tr key={`${c.kind}-${c.graph_node_id}`}>
                      <td style={cellStyle}>{c.kind}</td>
                      <td style={{ ...cellStyle, ...monoStyle }}>{String(c.attr_node_id)}</td>
                      <td style={{ ...cellStyle, ...monoStyle }}>{String(c.graph_node_id)}</td>
                      <td style={cellStyle}>{c.dist_from_primary_m.toFixed(1)}</td>
                      <td style={cellStyle}>{String(c.claims)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      {/* ---- 3. asset manifest ---------------------------------------------- */}
      <section className="panel" aria-label="Asset manifest">
        <h2 className="panel-title">Asset manifest</h2>
        <p className="panel-sub">
          Every asset is fetched and SHA-256-verified against this manifest before a byte is used
          (plan Q5); a mismatch blocks the run.
        </p>
        {manifestBlock === null && manifestError === null ? (
          <p className="panel-sub">Loading the asset manifest…</p>
        ) : null}
        {manifestError !== null ? (
          <p className="panel-warn">Asset manifest unavailable: {manifestError}</p>
        ) : null}
        {manifestBlock !== null ? (
          <div>
            <FactRow label="Build commit" value={manifestBlock.buildCommit} />
            <FactRow label="Built (UTC)" value={manifestBlock.builtUtc} />
            <FactRow label="Assets listed" value={formatCount(manifestBlock.rows.length)} />
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={headCellStyle}>Asset</th>
                    <th style={headCellStyle}>Size</th>
                    <th style={headCellStyle}>SHA-256</th>
                    <th style={headCellStyle}>Source file</th>
                  </tr>
                </thead>
                <tbody>
                  {manifestBlock.rows.map((row) => (
                    <tr key={row.id}>
                      <td style={{ ...cellStyle, ...monoStyle }}>{row.id}</td>
                      <td style={cellStyle}>{formatBytes(row.bytes)}</td>
                      <td style={{ ...cellStyle, ...monoStyle }}>{row.sha256}</td>
                      <td style={{ ...cellStyle, ...monoStyle }}>{row.sourceFile}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      {/* ---- 4. configured vs executed -------------------------------------- */}
      <section className="panel" aria-label="Configured versus executed parameters">
        <h2 className="panel-title">Configured vs executed (last run)</h2>
        {executedDiffConfig === null ? (
          <p className="panel-sub">
            No run has executed in this session, so there is no executed configuration to diff.
            Run a configuration on the Run screen first.
          </p>
        ) : (
          <div>
            <span className="chip chip-live">{PROVENANCE_CLASSES.live}</span>
            <ExecutedDiff configured={executedDiffConfig} executed={executedDiffConfig} />
            <p className="panel-sub">
              Evidence basis: this build carries no wire-level executed-parameter readback, and
              none ran in this session. The equality shown is the engine&apos;s fail-fast
              contract — the typed browser config has no silent-rewrite path (the Repast batch
              loader&apos;s zeroing of negative &quot;number&quot; constants is unreproducible
              by construction, divergence register item 6), and a configuration the engine
              cannot execute throws before running instead of running something else.
              {runSummary === null
                ? " The last leg recorded no completion summary (it may have failed or been interrupted); the parameters shown are what was submitted to the engine."
                : ""}
            </p>
          </div>
        )}
      </section>

      {/* ---- 5. provenance quirk ledger -------------------------------------- */}
      <section className="panel" aria-label="Provenance quirk ledger">
        <h2 className="panel-title">Provenance quirk ledger</h2>
        {PROVENANCE_QUIRKS.length === 0 ? (
          <p className="panel-sub">No provenance notes are registered.</p>
        ) : (
          PROVENANCE_QUIRKS.map((quirk) => (
            <div key={quirk.id}>
              <h3 className="panel-title" style={monoStyle}>
                {quirk.id}
              </h3>
              <FactRow label="Parameter" value={quirk.param} />
              <FactRow label="Archived runs executed" value={String(quirk.archivedExecutedValue)} />
              <FactRow label="Web presets carry" value={String(quirk.presetValue)} />
              <p className="panel-sub">Note (verbatim): {quirk.note}</p>
              <p className="panel-sub">Impact: {quirk.impact}</p>
              <p className="panel-sub">Sources: {quirk.sources.join("; ")}</p>
            </div>
          ))
        )}
      </section>

      {/* ---- 6. data attribution ---------------------------------------------- */}
      <section className="panel" aria-label="Data attribution record">
        <h2 className="panel-title">Data attribution</h2>
        {DATA_ATTRIBUTION.map((entry) => (
          <div key={entry.layer}>
            <h3 className="panel-title">{entry.layer}</h3>
            <p className="panel-sub">{entry.credit}</p>
            <p className="panel-sub">{entry.note}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
