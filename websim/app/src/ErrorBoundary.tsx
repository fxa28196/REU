/**
 * ErrorBoundary (WP14) — the screen body's crash surface.
 *
 * A research tool that white-screens on a malformed asset is worse than one
 * that says what broke: a blank page reads as "nothing here", which is a false
 * report, while an honest failure panel is a true one. This boundary wraps the
 * screen body in `App.tsx`, so a render-time throw in any screen degrades to a
 * visible "this panel failed" message carrying the real error text and a
 * reload affordance — never a white screen, and never fabricated content.
 *
 * What it deliberately does NOT do:
 *   - It renders no numbers and no substitute data. An error state shows the
 *     error, full stop (the empty-state honesty rule from `app/src/index.ts`).
 *   - It does not catch worker/async failures — those already surface through
 *     `useSimRun().error` and the Run screen's error chip. React error
 *     boundaries only see render/lifecycle throws, and that is the one class
 *     of failure that would otherwise blank the page.
 *
 * The message-shaping logic is the exported pure `describeCaughtError`, tested
 * in Node without a DOM (app tests never need a browser).
 */

import { Component } from "react";
import type { ErrorInfo, ReactElement, ReactNode } from "react";

/**
 * Pure: turn whatever a render path threw into the one-line text the failure
 * panel shows. React lets code `throw` anything; the panel must never render
 * "[object Object]" or blank — an unidentifiable throw is reported as exactly
 * that, which is still a true statement.
 */
export function describeCaughtError(error: unknown): string {
  if (error instanceof Error) {
    // name + message ("Error: …", "RangeError: …") — the text a console shows.
    return error.message.length > 0 ? `${error.name}: ${error.message}` : error.name;
  }
  if (typeof error === "string" && error.length > 0) {
    return error;
  }
  return `non-Error value thrown (${Object.prototype.toString.call(error)})`;
}

export interface ErrorBoundaryProps {
  /** Names the wrapped region in the failure copy, e.g. "Run screen". */
  readonly label: string;
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly failed: boolean;
  readonly message: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false, message: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { failed: true, message: describeCaughtError(error) };
  }

  override componentDidCatch(_error: unknown, _info: ErrorInfo): void {
    // The panel is the report; nothing else to notify in a static deploy.
  }

  private readonly retry = (): void => {
    // Re-attempt the render in place (transient failures — e.g. a mid-stream
    // state the next store update repairs). If the throw is deterministic the
    // panel comes straight back, which is honest.
    this.setState({ failed: false, message: null });
  };

  private readonly reload = (): void => {
    window.location.reload();
  };

  override render(): ReactElement | ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }
    return (
      <div role="alert" className="panel error-boundary-panel">
        <h2 className="panel-title">This panel failed: {this.props.label}</h2>
        <p>
          The {this.props.label} hit an error while rendering and has been stopped so the rest
          of the page stays usable. Nothing shown elsewhere on this page is affected, and no
          substitute data has been rendered in its place.
        </p>
        <p className="panel-warn" style={{ fontFamily: "monospace", overflowWrap: "anywhere" }}>
          {this.state.message}
        </p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" onClick={this.retry}>
            Try to render this panel again
          </button>
          <button type="button" onClick={this.reload}>
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}
