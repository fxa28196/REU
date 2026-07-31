/**
 * Asset plane — placeholder surface for WP0 part 1 (scaffold).
 *
 * WP4 fills this package with pack-graph, build-smoke, build-shelters,
 * build-encampments, build-registry (readStrict gate), build-presets,
 * build-archive-bundles, checksums and deploy-check. Edge weights are never
 * recomputed here: the read-only Java exporter is the only source of graph truth
 * (plan Q8).
 */

/** Generated assets directory, git-ignored and rebuilt from the exporter. */
export const PIPELINE_OUT_DIR = "out" as const;

/**
 * Raw encampment coordinates and raw `inc_id`s are confined to this git-ignored
 * local path (plan Q4). No public asset and no committed file may contain them;
 * the deploy job greps published assets before Pages publish.
 */
export const LOCAL_RAW_DIR = "local-raw" as const;

/** Smoke series shipped at launch: slice count and embedded peak (µg/m³). */
export interface SmokeSeriesSpec {
  readonly code: number;
  readonly label: string;
  readonly slices: number;
  readonly constructed: boolean;
}

export const SMOKE_SERIES: readonly SmokeSeriesSpec[] = [
  { code: 0, label: "Observed 2020", slices: 576, constructed: false },
  { code: 1, label: "Severe v1", slices: 456, constructed: true },
  { code: 2, label: "Worst-plausible v2", slices: 456, constructed: true },
];
