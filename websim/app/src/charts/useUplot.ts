/**
 * `useUplot` — the one place a chart component touches the uPlot instance
 * lifecycle: create on mount (sized to the container via ResizeObserver),
 * `setData` on data change, `destroy` on unmount. Components stay declarative;
 * every number they show is produced by the pure functions in `transforms.ts`.
 *
 * The dark chart chrome (axis/grid/tick colors on the #1c1f24 panel) also
 * lives here so the Run screen's charts share one look.
 */

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

/** Panel surface the charts draw on (project dark UI). */
export const CHART_PANEL_BG = "#1c1f24";
/** Primary text on the dark UI. */
export const CHART_TEXT = "#e6e8eb";
/** Muted text / axis ink on the dark UI. */
export const CHART_MUTED = "#9aa2ab";
/** Recessive gridline stroke (muted ink at low alpha). */
export const CHART_GRID_STROKE = "rgba(154, 162, 171, 0.12)";
/** Tick stroke — slightly stronger than the grid, still recessive. */
export const CHART_TICK_STROKE = "rgba(154, 162, 171, 0.35)";
/** Axis/legend font. */
export const CHART_FONT = '11px system-ui, -apple-system, "Segoe UI", sans-serif';

/** Width used before the container has laid out (first paint, hidden tabs). */
export const FALLBACK_WIDTH = 480;

/** A dark-theme uPlot axis: muted ink, recessive grid, optional axis label. */
export function darkAxis(label?: string): uPlot.Axis {
  const axis: uPlot.Axis = {
    stroke: CHART_MUTED,
    font: CHART_FONT,
    labelFont: CHART_FONT,
    grid: { stroke: CHART_GRID_STROKE, width: 1 },
    ticks: { stroke: CHART_TICK_STROKE, width: 1 },
  };
  if (label !== undefined) {
    axis.label = label;
  }
  return axis;
}

/** uPlot options minus `width` — the hook owns width via the ResizeObserver. */
export type UplotOptionsSansWidth = Omit<uPlot.Options, "width">;

/**
 * Manage one uPlot instance inside a `<div ref={...}>`.
 *
 * - **Create** on mount at the container's current width (falling back to
 *   {@link FALLBACK_WIDTH} before layout); a ResizeObserver keeps the width in
 *   step with the container afterwards. Height comes from `options.height`.
 * - **Recreate** only when the `options` object identity changes — memoize
 *   options in the component (`useMemo`) so this is rare.
 * - **`setData`** (no teardown) when `data` identity changes.
 * - **Destroy** the instance and disconnect the observer on unmount.
 */
export function useUplot(
  options: UplotOptionsSansWidth,
  data: uPlot.AlignedData,
): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  const dataRef = useRef(data);

  useEffect(() => {
    const el = containerRef.current;
    if (el === null) {
      return undefined;
    }
    const width = el.clientWidth > 0 ? Math.floor(el.clientWidth) : FALLBACK_WIDTH;
    const plot = new uPlot({ ...options, width }, dataRef.current, el);
    plotRef.current = plot;

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry === undefined) {
          return;
        }
        const nextWidth = Math.floor(entry.contentRect.width);
        if (nextWidth > 0 && nextWidth !== plot.width) {
          plot.setSize({ width: nextWidth, height: options.height });
        }
      });
      observer.observe(el);
    }

    return () => {
      observer?.disconnect();
      plotRef.current = null;
      plot.destroy();
    };
  }, [options]);

  // Declared AFTER the create effect: on a simultaneous options+data change the
  // instance is rebuilt first (with the previous data from dataRef), then this
  // effect delivers the new data to the new instance.
  useEffect(() => {
    dataRef.current = data;
    plotRef.current?.setData(data);
  }, [data]);

  return containerRef;
}
