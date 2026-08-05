/**
 * `compare/deltas.ts` — the PURE logic plane of the Compare screen (WP12a).
 *
 * Everything here is a pure function over plain data — no store, no DOM, no
 * worker — so `app/test/compare-deltas.test.ts` exercises the whole surface in
 * Node, including against the real shipped archive bundles.
 *
 * ## The two provenance classes never mix silently
 *
 * A `HeadlineNumbers` carries no provenance of its own; the CALLER attributes
 * each side ("Certified Java run" vs "Live browser simulation",
 * `PROVENANCE_CLASSES` in `../index.ts`) and the Compare screen renders the
 * chip on every slot. The extraction functions return `null` — never zeros —
 * when a field is missing or non-numeric: an unavailable number renders as
 * unavailable.
 *
 * The SAME six fields exist on both sides by construction: the archived
 * bundle's `headline` block and the live engine's v2-web `simulation.v2.json`
 * `population` block are both derived from the manifest `population` schema
 * (`engine/src/output/logger.ts` writes `sheltered`, `refused_all_full`,
 * `unreachable`, `total_person_hours_above_unhealthy`, `travel_m.mean`,
 * `vwe_ugm3h.total`), so no side ever needs a fabricated placeholder.
 *
 * ## THE range-across-draws rule (V48/A-34, plan §6.2)
 *
 * For a multi-draw closure family (`closuresCode === 3`, `closureDraw` 1..3,
 * each draw a pre-committed schedule FILE) the UI must render a RANGE ACROSS
 * DRAWS and must refuse to present a single draw's schedule as the family's
 * result. {@link presentFamily} enforces that as a discriminated return type
 * the component cannot ignore: for a multi-draw preset it can ONLY return
 * `kind: "range"` — there is no code path to `kind: "single"`, whatever the
 * caller passes — and the test suite pins that for every shipped
 * `closuresCode === 3` preset.
 */

import type { PresetDefinition } from "@websim/shared/presets/definitions";
import { PRESET_DEFINITIONS, materialisePreset } from "@websim/shared/presets/definitions";
import { WORST_FAMILY_CLOSURES_CODE } from "@websim/shared/schema";

import type { ArchiveBundleEntry, ArchiveIndex } from "../assets/loader.js";

// ---------------------------------------------------------------------------
// Headline numbers — the six metrics both provenance classes can supply
// ---------------------------------------------------------------------------

/**
 * The six headline metrics of one completed run. Sources:
 *
 *  - archived: bundle `headline` block (`headlineFromArchiveBundle`);
 *  - live: the v2-web `simulation.v2.json` export's `population` block
 *    (`headlineFromSimulationJson`) — emitted by the ENGINE from the run it
 *    executed, never assembled from UI state.
 */
export interface HeadlineNumbers {
  readonly sheltered: number;
  /** `refused_all_full` — terminal refusals after every shelter was full. */
  readonly refused: number;
  readonly unreachable: number;
  /** Person-hours above the 55.5 µg/m³ concentration threshold. */
  readonly personHoursAboveUnhealthy: number;
  /** `travel_m.mean` — mean distance travelled per agent, metres. */
  readonly meanWalkM: number;
  /** `vwe_ugm3h.total` — total ventilation-weighted exposure (dose), µg/m³·h. */
  readonly totalDoseUgM3h: number;
}

export type HeadlineMetric = keyof HeadlineNumbers;

/** Display order of the delta cards / range rows. */
export const HEADLINE_METRICS: readonly HeadlineMetric[] = [
  "sheltered",
  "refused",
  "unreachable",
  "personHoursAboveUnhealthy",
  "meanWalkM",
  "totalDoseUgM3h",
];

/** 55.5 µg/m³ is a concentration threshold — never an air-quality category. */
export const HEADLINE_METRIC_LABELS: Readonly<Record<HeadlineMetric, string>> = {
  sheltered: "Sheltered",
  refused: "Refused (all full)",
  unreachable: "Unreachable",
  personHoursAboveUnhealthy: "Person-hours above 55.5 µg/m³ (concentration threshold)",
  meanWalkM: "Mean travel distance (m)",
  totalDoseUgM3h: "Total dose — ventilation-weighted exposure (µg/m³·h)",
};

/** Display decimals per metric (counts exact; continuous metrics 2 dp). */
export const HEADLINE_METRIC_DECIMALS: Readonly<Record<HeadlineMetric, number>> = {
  sheltered: 0,
  refused: 0,
  unreachable: 0,
  personHoursAboveUnhealthy: 2,
  meanWalkM: 2,
  totalDoseUgM3h: 2,
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * Extract the six metrics from a manifest-shaped block (`headline` in a bundle,
 * `population` in a v2-web export — the keys are identical). `null` when ANY
 * field is missing or non-numeric: a partial headline rendered with silent
 * zeros would fabricate data, so the whole extraction refuses instead.
 */
function headlineFromBlock(block: unknown): HeadlineNumbers | null {
  const b = recordOf(block);
  if (b === null) {
    return null;
  }
  const sheltered = finiteNumber(b["sheltered"]);
  const refused = finiteNumber(b["refused_all_full"]);
  const unreachable = finiteNumber(b["unreachable"]);
  const personHours = finiteNumber(b["total_person_hours_above_unhealthy"]);
  const travel = recordOf(b["travel_m"]);
  const meanWalkM = travel === null ? null : finiteNumber(travel["mean"]);
  const vwe = recordOf(b["vwe_ugm3h"]);
  const totalDose = vwe === null ? null : finiteNumber(vwe["total"]);
  if (
    sheltered === null ||
    refused === null ||
    unreachable === null ||
    personHours === null ||
    meanWalkM === null ||
    totalDose === null
  ) {
    return null;
  }
  return {
    sheltered,
    refused,
    unreachable,
    personHoursAboveUnhealthy: personHours,
    meanWalkM,
    totalDoseUgM3h: totalDose,
  };
}

/** Headline of one certified archived run (bundle `headline` block). */
export function headlineFromArchiveBundle(bundle: unknown): HeadlineNumbers | null {
  const b = recordOf(bundle);
  return b === null ? null : headlineFromBlock(b["headline"]);
}

/**
 * Headline of one LIVE run, from the parsed v2-web `simulation.v2.json` the
 * engine exported (`population` block). The engine writes this from the run it
 * actually executed (plan Q5), which is why the live side reads the export
 * rather than re-adding numbers in the UI.
 */
export function headlineFromSimulationJson(json: unknown): HeadlineNumbers | null {
  const j = recordOf(json);
  return j === null ? null : headlineFromBlock(j["population"]);
}

/** `JSON.parse` guarded: `null` on malformed text, never a throw at render. */
export function parseSimulationJsonText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Delta cards
// ---------------------------------------------------------------------------

export interface DeltaCard {
  readonly metric: HeadlineMetric;
  readonly label: string;
  readonly left: number;
  readonly right: number;
  /** `right - left` — sign preserved (positive = right side higher). */
  readonly delta: number;
  /**
   * `100 * delta / |left|`, sign-aware (an increase is positive regardless of
   * the baseline's sign). `null` when `left === 0` — a percent of a zero
   * baseline is undefined, and rendering ∞ or 0 would both be fabrications.
   */
  readonly percent: number | null;
}

/** One card per {@link HEADLINE_METRICS} entry, in that order. */
export function deltaCards(left: HeadlineNumbers, right: HeadlineNumbers): DeltaCard[] {
  return HEADLINE_METRICS.map((metric): DeltaCard => {
    const l = left[metric];
    const r = right[metric];
    const delta = r - l;
    return {
      metric,
      label: HEADLINE_METRIC_LABELS[metric],
      left: l,
      right: r,
      delta,
      percent: l === 0 ? null : (100 * delta) / Math.abs(l),
    };
  });
}

// ---------------------------------------------------------------------------
// Range across draws (V48/A-34)
// ---------------------------------------------------------------------------

/** One archived draw's headline, keyed by its pre-committed draw number. */
export interface DrawHeadline {
  readonly draw: number;
  readonly headline: HeadlineNumbers;
}

export interface DrawFamilyRange {
  readonly metric: string;
  readonly min: number;
  readonly max: number;
  /** Every draw included in the range, ascending — all of them are listed. */
  readonly draws: readonly number[];
}

/**
 * The [min, max] of one metric across a family's draws. Throws on an empty
 * input (there is no honest range of nothing) and on a duplicated draw number
 * (counting one schedule twice would fake the family's spread).
 */
export function rangeAcrossDraws(
  bundlesByDraw: ReadonlyArray<{ draw: number; headline: HeadlineNumbers }>,
  metric: HeadlineMetric,
): DrawFamilyRange {
  if (bundlesByDraw.length === 0) {
    throw new RangeError("rangeAcrossDraws: no draws supplied — a range of nothing cannot be presented");
  }
  const draws = bundlesByDraw.map((b) => b.draw).sort((a, b) => a - b);
  for (let i = 1; i < draws.length; i++) {
    if (draws[i] === draws[i - 1]) {
      throw new RangeError(`rangeAcrossDraws: draw ${draws[i]!} appears more than once`);
    }
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const b of bundlesByDraw) {
    const v = b.headline[metric];
    if (v < min) {
      min = v;
    }
    if (v > max) {
      max = v;
    }
  }
  return { metric, min, max, draws };
}

/**
 * True when `presetId` belongs to a multi-draw closure family: its
 * materialised config carries `closuresCode === 3` (the worst family), whose
 * `closureDraw` selects one of three pre-committed schedule files. Derived
 * from the preset's own 41-parameter config — never from a second, driftable
 * list of ids. Unknown ids throw: silently answering `false` for a typo would
 * open the single-schedule door this module exists to close.
 */
export function isMultiDrawFamily(presetId: string): boolean {
  const def = PRESET_DEFINITIONS.find((d) => d.id === presetId);
  if (def === undefined) {
    throw new Error(`isMultiDrawFamily: unknown preset id '${presetId}'`);
  }
  return materialisePreset(def).closuresCode === WORST_FAMILY_CLOSURES_CODE;
}

/**
 * What the Compare screen is ALLOWED to render for a preset's archived side.
 *
 * Discriminated on `kind` so a component cannot ignore the rule: a multi-draw
 * family NEVER yields `kind: "single"` — with zero, one, or many bundles the
 * result is `kind: "range"` (an empty family renders "no draw bundles
 * available", still never a single schedule). A single-schedule preset
 * requires exactly one bundle; anything else is a caller bug and throws.
 */
export type FamilyPresentation =
  | { readonly kind: "single"; readonly headline: HeadlineNumbers }
  | { readonly kind: "range"; readonly ranges: DrawFamilyRange[]; readonly drawCount: number };

export function presentFamily(
  presetId: string,
  bundles: ReadonlyArray<DrawHeadline>,
): FamilyPresentation {
  if (isMultiDrawFamily(presetId)) {
    return {
      kind: "range",
      ranges: bundles.length === 0 ? [] : HEADLINE_METRICS.map((m) => rangeAcrossDraws(bundles, m)),
      drawCount: bundles.length,
    };
  }
  if (bundles.length !== 1) {
    throw new Error(
      `presentFamily: preset '${presetId}' is a single-schedule preset and needs exactly one ` +
        `bundle, got ${bundles.length}`,
    );
  }
  return { kind: "single", headline: bundles[0]!.headline };
}

// ---------------------------------------------------------------------------
// Locating a family's draw bundles in the archive index
// ---------------------------------------------------------------------------

/** `…-d<draw>-seed<seed>` — the archive's draw-family run-dir convention. */
const DRAW_RUN_DIR = /^(.*-d)(\d+)(-seed\d+)$/u;

export interface FamilyDrawEntry {
  readonly draw: number;
  readonly entry: ArchiveBundleEntry;
}

/**
 * Every archived bundle that is a DRAW SIBLING of `definition.archiveFamily`:
 * same run-dir stem, same seed, any draw — e.g. for
 * `scenario-e-v2/SE2-E18-d1-seed42` the entries for d1, d2 and d3 at seed 42.
 * Sorted ascending by draw (numeric sort of parsed run-dirs — no Map/Set
 * iteration feeds this order). Empty for fresh-run presets and for run dirs
 * that do not follow the draw convention.
 */
export function familyDrawEntries(
  index: ArchiveIndex,
  definition: PresetDefinition,
): FamilyDrawEntry[] {
  if (definition.archiveFamily === null) {
    return [];
  }
  const anchor = DRAW_RUN_DIR.exec(definition.archiveFamily);
  if (anchor === null) {
    return [];
  }
  const stem = anchor[1]!;
  const seedSuffix = anchor[3]!;
  const out: FamilyDrawEntry[] = [];
  for (const entry of index.bundles) {
    const m = DRAW_RUN_DIR.exec(entry.run_dir);
    if (m !== null && m[1] === stem && m[3] === seedSuffix) {
      out.push({ draw: Number(m[2]), entry });
    }
  }
  out.sort((a, b) => a.draw - b.draw);
  return out;
}

// ---------------------------------------------------------------------------
// Per-shelter diverging bars
// ---------------------------------------------------------------------------

export interface ShelterOccupancyRow {
  readonly id: string;
  readonly name: string;
  readonly finalOccupancy: number;
  /** `null` = unlimited-capacity site (the archive records these as null). */
  readonly capacity: number | null;
}

/** Per-shelter rows of an archived bundle (`shelters` block). `null` when malformed. */
export function sheltersFromArchiveBundle(bundle: unknown): ShelterOccupancyRow[] | null {
  const b = recordOf(bundle);
  const rows = b === null ? null : b["shelters"];
  if (!Array.isArray(rows)) {
    return null;
  }
  const out: ShelterOccupancyRow[] = [];
  for (const row of rows as unknown[]) {
    const r = recordOf(row);
    if (r === null || typeof r["shelter_id"] !== "string") {
      return null;
    }
    const finalOccupancy = finiteNumber(r["final_occupancy"]);
    if (finalOccupancy === null) {
      return null;
    }
    out.push({
      id: r["shelter_id"],
      name: typeof r["name"] === "string" ? r["name"] : r["shelter_id"],
      finalOccupancy,
      capacity: finiteNumber(r["capacity"]),
    });
  }
  return out;
}

/**
 * Per-shelter rows of a LIVE v2-web `simulation.v2.json` export (`shelters`
 * block: `{id, capacity, operating, peak_occupancy, final_occupancy,
 * refused}`). The export carries no display name, so `name` falls back to the
 * id — the id is the same `shelter_id` key the archived side uses, which is
 * what the delta join relies on.
 */
export function sheltersFromSimulationJson(json: unknown): ShelterOccupancyRow[] | null {
  const j = recordOf(json);
  const rows = j === null ? null : j["shelters"];
  if (!Array.isArray(rows)) {
    return null;
  }
  const out: ShelterOccupancyRow[] = [];
  for (const row of rows as unknown[]) {
    const r = recordOf(row);
    if (r === null || typeof r["id"] !== "string") {
      return null;
    }
    const finalOccupancy = finiteNumber(r["final_occupancy"]);
    if (finalOccupancy === null) {
      return null;
    }
    out.push({
      id: r["id"],
      name: r["id"],
      finalOccupancy,
      capacity: finiteNumber(r["capacity"]),
    });
  }
  return out;
}

export interface ShelterDelta {
  readonly id: string;
  readonly label: string;
  /** Final occupancy on each side; `null` = the site is absent on that side. */
  readonly left: number | null;
  readonly right: number | null;
  /** `right - left`; `null` unless BOTH sides have the site. */
  readonly delta: number | null;
}

/**
 * Join two per-shelter lists by id: left-side rows first in their file order,
 * then right-only rows in theirs (both orders are CSV file order — no Map
 * iteration). A site present on one side only keeps its number and a `null`
 * delta; inventing a 0 for the missing side would fabricate an occupancy.
 */
export function shelterDeltas(
  left: readonly ShelterOccupancyRow[],
  right: readonly ShelterOccupancyRow[],
): ShelterDelta[] {
  const out: ShelterDelta[] = [];
  for (const l of left) {
    const r = right.find((row) => row.id === l.id);
    out.push({
      id: l.id,
      label: l.name,
      left: l.finalOccupancy,
      right: r === undefined ? null : r.finalOccupancy,
      delta: r === undefined ? null : r.finalOccupancy - l.finalOccupancy,
    });
  }
  for (const r of right) {
    if (!left.some((row) => row.id === r.id)) {
      out.push({ id: r.id, label: r.name, left: null, right: r.finalOccupancy, delta: null });
    }
  }
  return out;
}

/** Scale anchor for the diverging bars: the largest |Δ|, 0 when none exists. */
export function maxAbsShelterDelta(deltas: readonly ShelterDelta[]): number {
  let max = 0;
  for (const d of deltas) {
    if (d.delta !== null && Math.abs(d.delta) > max) {
      max = Math.abs(d.delta);
    }
  }
  return max;
}

// ---------------------------------------------------------------------------
// Display formatting (pure; "—" for the undisplayable, never a fabricated 0)
// ---------------------------------------------------------------------------

/** Signed count: "+1,234" / "-12" / "0" ("—" for non-finite). */
export function formatSigned(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
    signDisplay: "exceptZero",
  });
}

/**
 * Signed percent with one decimal; a `null` (zero baseline) renders as the
 * honest explanation, not as 0% or ∞%.
 */
export function formatPercentDelta(percent: number | null): string {
  if (percent === null) {
    return "n/a (baseline is 0)";
  }
  if (!Number.isFinite(percent)) {
    return "—";
  }
  return `${percent.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  })}%`;
}
