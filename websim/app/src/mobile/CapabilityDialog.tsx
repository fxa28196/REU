/**
 * CapabilityDialog.tsx — the plan's honest "this computes a research model on
 * your device" dialog (WP13, §6.7 mobile).
 *
 * Shown before the FIRST live run of a session. It states plainly what
 * pressing Play costs, shows the RAW measured numbers next to the verdict
 * (the gate's basis is visible, never a black box), and always offers the
 * archived-only path — archived certified display is never gated.
 *
 * Native `<dialog>` + `showModal()`: focus containment, Escape handling and
 * top-layer stacking come from the platform, so there is no hand-rolled focus
 * trap to get wrong. Escape / `close` counts as "archived only" (the safe,
 * always-valid choice).
 *
 * All decision logic is the pure, tested `mobile/capability.ts`; this file
 * only renders it. {@link measurementLines} is the one pure helper living
 * here (formatting the measured numbers), exported for the Node tests.
 */

import { useEffect, useId, useRef } from "react";
import type { ReactElement } from "react";

import type { CapabilityMeasurements } from "./capability.js";
import { liveRunGate, scoreCapability, tierDescription } from "./capability.js";

// ---------------------------------------------------------------------------
// Pure display helpers (tested in app/test/capability.test.ts)
// ---------------------------------------------------------------------------

/**
 * The measured numbers, one honest line each. An unexposed signal says so
 * explicitly ("not reported by this browser") — it is never rendered as a
 * number, and a not-yet-run benchmark says "not run yet".
 */
export function measurementLines(m: CapabilityMeasurements): readonly string[] {
  return [
    m.deviceMemoryGB === null
      ? "Device memory: not reported by this browser"
      : `Device memory: ${m.deviceMemoryGB} GB (browser-reported)`,
    m.hardwareConcurrency === null
      ? "Logical cores: not reported by this browser"
      : `Logical cores: ${m.hardwareConcurrency}`,
    m.benchScorePerMs === null
      ? "2-second compute check: not run yet"
      : `2-second compute check: ${Math.round(m.benchScorePerMs).toLocaleString("en-US")} kernel iterations/ms`,
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface CapabilityDialogProps {
  readonly open: boolean;
  readonly measurements: CapabilityMeasurements;
  readonly benchRunning: boolean;
  /** Resident count of the configuration Play would run. */
  readonly numAgents: number;
  readonly onRunBenchmark: () => void;
  /** Start the live run (only reachable when the gate allows it). */
  readonly onProceed: () => void;
  /** Stay with archived certified display (always available). */
  readonly onArchivedOnly: () => void;
}

export function CapabilityDialog(props: CapabilityDialogProps): ReactElement {
  const { open, measurements, benchRunning, numAgents, onRunBenchmark, onProceed, onArchivedOnly } =
    props;
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const archivedOnlyRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
      // Initial focus lands on the safe, always-valid choice (archived-only),
      // not the first button in DOM order. Imperative rather than the
      // `autoFocus` attribute (jsx-a11y/no-autofocus): this runs only on the
      // open transition of an explicit modal, never on page load.
      archivedOnlyRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const verdict = scoreCapability(measurements);
  const gate = liveRunGate(verdict, numAgents);

  // Escape (native `cancel` → `close`) while the prop still says open =
  // the user dismissed it: treat as the safe archived-only choice.
  const handleClose = (): void => {
    if (open) {
      onArchivedOnly();
    }
  };

  return (
    <dialog ref={dialogRef} className="capability-dialog" aria-labelledby={titleId} onClose={handleClose}>
      <h2 id={titleId} className="capability-title">
        Run this simulation on your device?
      </h2>
      <p>
        This computes a research model on your device: a live run executes the full
        agent-based simulation — {numAgents.toLocaleString("en-US")} residents routed over the
        Portland street graph — in a Web Worker in this browser tab.
      </p>
      <p className="panel-sub">
        Archived certified results always display on any device, with no engine load.
      </p>

      <h3 className="capability-subtitle">Measured on this device</h3>
      <ul>
        {measurementLines(measurements).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p>{tierDescription(verdict.tier)}</p>
      {verdict.reasons.map((reason) => (
        <p key={reason} className="panel-sub">
          {reason}
        </p>
      ))}
      {gate.recommendation !== null ? <p className="panel-warn">{gate.recommendation}</p> : null}

      <div className="capability-actions">
        <button type="button" onClick={onRunBenchmark} disabled={benchRunning}>
          {benchRunning ? "Measuring (about 2 seconds)…" : "Run the 2-second device check"}
        </button>
        <button type="button" onClick={onProceed} disabled={!gate.allowed || benchRunning}>
          Start live run ({numAgents.toLocaleString("en-US")} residents)
        </button>
        <button type="button" onClick={onArchivedOnly} ref={archivedOnlyRef}>
          Show archived certified results only
        </button>
      </div>
    </dialog>
  );
}
