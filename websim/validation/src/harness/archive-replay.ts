/**
 * archive-replay.ts — the ER / SE / SE2 archive-replay matrix, its executed
 * configurations, and `score_scenarioE.py` over written CSV text.
 *
 * This is the shared core of WP8 acceptance clause 3: *the port reproduces the
 * archived Phase-E / Scenario-E outcomes*. Two callers consume it and they must
 * not be allowed to drift apart —
 *
 *  - `validation/scripts/wp8-archive-replay.ts`, the operator CLI that writes
 *    the twelve replays and the report under `pipeline/out/wp8-replay/`, and
 *  - `validation/test/wp8-archive-replay.test.ts`, the CI gate that runs the
 *    same configurations and asserts the same metrics against the archive.
 *
 * The script used to own all of this privately, which made the headline result
 * of WP8 the output of a program nothing ran under `npm test`. The extraction is
 * the whole point: a claim defended by a script an operator has to remember to
 * invoke is a claim nothing defends.
 *
 * ## Where the configuration comes from, and why it matters
 *
 * `WP8-SPEC-archive-gates.md` §5.6 item 4 is explicit: *"when replaying an
 * archived SE/SE2 bundle for byte-comparison, the engine must be driven from the
 * **archived executed manifest** (`pushThetaThreshold = 0.0`), not from the
 * preset (−0.25)"*. So {@link buildReplayConfig} does not read `PRESETS` for the
 * parameter values at all — it reads `reproducibility.parameters` out of the
 * archived `simulation.json` and builds the `RunConfig` from those executed
 * numbers, with the Java **code fallbacks** ({@link CODE_FALLBACKS}) filling any
 * name the manifest legitimately lacks (the 33-parameter `phase-e/` manifests
 * predate the Scenario-E block). Which fallback applied to which name is
 * returned, not hidden, so a reader can see exactly what was substituted.
 *
 * The preset-vs-executed delta is returned too. At the archived configurations
 * there is exactly one — `pushThetaThreshold` 0.0 vs −0.25 — and it is inert
 * because the parameter is consulted only at a blockage encounter and the
 * archive records zero of those.
 *
 * ## Metric definitions
 *
 * Every metric in {@link RunMetrics} is `scripts/score_scenarioE.py`'s,
 * transcribed: `capacity_refusals = sum(refused_count) − sum(policy_refused)`;
 * `attempt_share_aware = mean(time_started_tick != "")` over
 * `aware_initial == 1`; doses read from `inhaled_dose_ug`. They are computed off
 * **written CSV text**, not off live engine objects, so a number compared to the
 * archive is a number that survived the formatter — and the archive side is
 * scored by the same function over the archived bytes, which is what makes the
 * comparison an equality between two files rather than between a file and a
 * belief.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { PARAM_NAMES, PRESETS, parseRunConfig, type RunConfig } from "@websim/shared";
import { describeArchive } from "@websim/pipeline/archive";

import { readFrame } from "./frame.js";
import { JAVA_CODE_DEFAULTS } from "./java-defaults.js";

// ---------------------------------------------------------------------------
// The replay matrix
// ---------------------------------------------------------------------------

export interface ReplayCase {
  /** Directory name under `<archive root>/<archive>/`. */
  readonly run: string;
  readonly archive: "phase-e" | "scenario-e" | "scenario-e-v2";
  /** The shipped preset this configuration corresponds to, for the delta print. */
  readonly preset: keyof typeof PRESETS;
  readonly family: "ER-A" | "ER-C" | "SE-E18" | "SE2-E18-d1";
}

export const REPLAY_SEEDS = [42, 43, 44] as const;

/** The twelve archived runs the port replays: four families x three seeds. */
export const ARCHIVE_REPLAY_CASES: readonly ReplayCase[] = [
  ...REPLAY_SEEDS.map((s) => ({
    run: `ER-A-n6842-seed${s}`,
    archive: "phase-e" as const,
    preset: "ER_baseline_real_A" as const,
    family: "ER-A" as const,
  })),
  ...REPLAY_SEEDS.map((s) => ({
    run: `ER-C-n6842-seed${s}`,
    archive: "phase-e" as const,
    preset: "ER_baseline_real_C" as const,
    family: "ER-C" as const,
  })),
  ...REPLAY_SEEDS.map((s) => ({
    run: `SE-E18-seed${s}`,
    archive: "scenario-e" as const,
    preset: "SE_severe_v1_E18" as const,
    family: "SE-E18" as const,
  })),
  ...REPLAY_SEEDS.map((s) => ({
    run: `SE2-E18-d1-seed${s}`,
    archive: "scenario-e-v2" as const,
    preset: "SE2_worst_plausible_E18_d1" as const,
    family: "SE2-E18-d1" as const,
  })),
];

/**
 * `ContextCreator.{int,double}Param(parm, name, fallback)` fallbacks.
 *
 * These are the values the Java build actually executed when a batch file
 * omitted a name — the case that matters here is the eight Scenario-E names a
 * 33-parameter `phase-e/` manifest does not carry. The archived E0-null
 * manifests corroborate `pushThetaThreshold = -0.25`
 * (WP8-SPEC-archive-gates.md §1.8, §6.1 evidence table).
 *
 * WP9 needed the same mechanism for the 11-parameter `present-day-three-arm/`
 * manifests, which are missing 30 names rather than 8, so the table now IS
 * {@link JAVA_CODE_DEFAULTS} — one transcription of `ContextCreator.build()`
 * instead of two that could disagree. Widening it changes nothing for the
 * twelve WP8 cases: a name the manifest carries is never looked up here, and
 * those manifests carry all 33 of the others.
 */
export const CODE_FALLBACKS: Readonly<Record<string, number>> = JAVA_CODE_DEFAULTS;

export interface ArchivedManifest {
  readonly reproducibility: { readonly parameters: Record<string, number> };
  readonly closures: Record<string, unknown> | null;
  readonly smoke_field: Record<string, unknown>;
  readonly population: Record<string, number>;
  readonly decision_layer: Record<string, unknown>;
}

/** Absolute path of an archived run directory (honours `WEBSIM_ARCHIVE_ROOT`). */
export function archiveRunDir(c: ReplayCase, archiveRoot = describeArchive().root): string {
  return path.join(archiveRoot, c.archive, c.run);
}

export function readArchivedManifest(c: ReplayCase, archiveRoot?: string): ArchivedManifest {
  return JSON.parse(
    readFileSync(path.join(archiveRunDir(c, archiveRoot), "simulation.json"), "utf8"),
  ) as ArchivedManifest;
}

export interface BuiltReplayConfig {
  readonly config: RunConfig;
  /** Names taken from the archived manifest. */
  readonly fromManifest: readonly string[];
  /** Names filled from the Java code fallback, with the value used. */
  readonly fromFallback: Readonly<Record<string, number>>;
  /** Preset-vs-executed differences, `name: [preset, executed]`. */
  readonly presetDelta: Readonly<Record<string, readonly [number, number]>>;
}

/** The archived EXECUTED configuration of one run, plus its provenance. */
export function buildReplayConfig(c: ReplayCase, archiveRoot?: string): BuiltReplayConfig {
  const params = readArchivedManifest(c, archiveRoot).reproducibility.parameters;
  const raw: Record<string, number> = {};
  const fromManifest: string[] = [];
  const fromFallback: Record<string, number> = {};
  for (const name of PARAM_NAMES) {
    const executed = params[name];
    if (executed !== undefined) {
      raw[name] = executed;
      fromManifest.push(name);
      continue;
    }
    const fallback = CODE_FALLBACKS[name];
    if (fallback === undefined) {
      throw new Error(`${c.run}: manifest lacks ${name} and there is no documented code fallback`);
    }
    raw[name] = fallback;
    fromFallback[name] = fallback;
  }
  const config = parseRunConfig(raw, `archived manifest ${c.archive}/${c.run}`);

  const preset = parseRunConfig(PRESETS[c.preset], `preset ${c.preset}`) as unknown as Record<
    string,
    number
  >;
  const presetDelta: Record<string, readonly [number, number]> = {};
  for (const name of PARAM_NAMES) {
    // randomSeed differs by construction (presets ship seed 42); not a finding.
    if (name === "randomSeed") continue;
    const p = preset[name]!;
    const e = (config as unknown as Record<string, number>)[name]!;
    if (p !== e) presetDelta[name] = [p, e];
  }
  return { config, fromManifest, fromFallback, presetDelta };
}

// ---------------------------------------------------------------------------
// score_scenarioE.py, over written CSV text
// ---------------------------------------------------------------------------

export interface RunMetrics {
  readonly n: number;
  readonly sheltered: number;
  readonly sheltered_share: number;
  readonly attempt_share_aware: number | null;
  readonly door_refusals_total: number;
  readonly capacity_refusals: number;
  readonly policy_refusals: number;
  readonly mean_dose_ug: number;
  readonly mean_dose_never_departed: number;
  readonly mean_hrs_unhealthy_sheltered: number;
  readonly mean_hrs_unhealthy_never: number;
  readonly blockage_events: number;
  readonly residents_blocked: number;
  readonly pushes: number;
  readonly reroutes: number;
  readonly stuck: number;
  readonly refused_all_full_final: number | null;
  readonly unreachable_final: number | null;
  readonly out_of_range_lookups: number | null;
}

/**
 * Every field of {@link RunMetrics}, written out rather than derived from
 * `Object.keys` of one instance.
 *
 * A metric added to the interface and forgotten here would silently drop out of
 * every comparison, which is the failure mode this whole module exists to close.
 * `tools/test/…` cannot check that, but {@link metricDeltas} asserts the census
 * against the object it was handed, so a mismatch fails loudly at the first
 * comparison rather than quietly forever.
 */
export const REPLAY_METRIC_FIELDS: readonly (keyof RunMetrics)[] = [
  "n",
  "sheltered",
  "sheltered_share",
  "attempt_share_aware",
  "door_refusals_total",
  "capacity_refusals",
  "policy_refusals",
  "mean_dose_ug",
  "mean_dose_never_departed",
  "mean_hrs_unhealthy_sheltered",
  "mean_hrs_unhealthy_never",
  "blockage_events",
  "residents_blocked",
  "pushes",
  "reroutes",
  "stuck",
  "refused_all_full_final",
  "unreachable_final",
  "out_of_range_lookups",
];

const round = (x: number, d: number): number => {
  if (!Number.isFinite(x)) return Number.NaN;
  const f = 10 ** d;
  return Math.round(x * f) / f;
};

const meanOf = (xs: readonly number[]): number =>
  xs.length === 0 ? Number.NaN : xs.reduce((a, b) => a + b, 0) / xs.length;

export function scoreRun(
  agentsCsv: string,
  sheltersCsv: string,
  simulationJson: string,
): RunMetrics {
  const a = readFrame(agentsCsv, "agents.csv");
  const sh = readFrame(sheltersCsv, "shelters.csv");
  const man = JSON.parse(simulationJson) as {
    population?: Record<string, number>;
    smoke_field?: Record<string, number>;
  };

  const n = a.rows.length;
  const numOr0 = (col: string): readonly number[] =>
    a.has(col) ? a.num(col).map((v) => (Number.isNaN(v) ? 0 : v)) : new Array<number>(n).fill(0);

  const aware = numOr0("aware_initial").map((v) => v === 1);
  const started = a.column("time_started_tick");
  const departed = started.map((s) => s.trim() !== "");
  const state = a.column("final_state");
  const sheltered = state.map((s) => s === "SHELTERED");

  const blk = numOr0("blockages_encountered");
  const psh = numOr0("push_throughs");
  const rrt = numOr0("reroutes");
  const stk = numOr0("stuck_events");
  const dose = a.num("inhaled_dose_ug");
  const hrs = a.num("hours_above_unhealthy");

  const sumCol = (frame: typeof sh, col: string): number =>
    frame.has(col) ? frame.num(col).reduce((acc, v) => acc + (Number.isNaN(v) ? 0 : v), 0) : 0;
  const refusals = Math.trunc(sumCol(sh, "refused_count"));
  const policy = Math.trunc(sumCol(sh, "policy_refused"));

  const pick = (xs: readonly number[], mask: readonly boolean[]): number[] =>
    xs.filter((_, i) => mask[i]!);

  const awareAny = aware.some(Boolean);
  return {
    n,
    sheltered: sheltered.filter(Boolean).length,
    sheltered_share: round(sheltered.filter(Boolean).length / n, 4),
    attempt_share_aware: awareAny
      ? round(meanOf(pick(departed.map((d) => (d ? 1 : 0)), aware)), 4)
      : null,
    door_refusals_total: refusals,
    capacity_refusals: refusals - policy,
    policy_refusals: policy,
    mean_dose_ug: round(meanOf(dose.filter((v) => !Number.isNaN(v))), 1),
    mean_dose_never_departed: round(
      meanOf(pick(dose, departed.map((d) => !d)).filter((v) => !Number.isNaN(v))),
      1,
    ),
    mean_hrs_unhealthy_sheltered: round(meanOf(pick(hrs, sheltered)), 2),
    mean_hrs_unhealthy_never: round(meanOf(pick(hrs, sheltered.map((s) => !s))), 2),
    blockage_events: Math.trunc(blk.reduce((x, y) => x + y, 0)),
    residents_blocked: blk.filter((v) => v > 0).length,
    pushes: Math.trunc(psh.reduce((x, y) => x + y, 0)),
    reroutes: Math.trunc(rrt.reduce((x, y) => x + y, 0)),
    stuck: Math.trunc(stk.reduce((x, y) => x + y, 0)),
    refused_all_full_final: man.population?.["refused_all_full"] ?? null,
    unreachable_final: man.population?.["unreachable"] ?? null,
    out_of_range_lookups: man.smoke_field?.["out_of_range_lookups"] ?? null,
  };
}

/** Score an archived run straight off the bytes the Java instrument wrote. */
export function scoreArchivedRun(c: ReplayCase, archiveRoot?: string): RunMetrics {
  const dir = archiveRunDir(c, archiveRoot);
  return scoreRun(
    readFileSync(path.join(dir, "agents.csv"), "utf8"),
    readFileSync(path.join(dir, "shelters.csv"), "utf8"),
    readFileSync(path.join(dir, "simulation.json"), "utf8"),
  );
}

/**
 * Every metric on which two scorings disagree, rendered `name: port vs archive`.
 *
 * `Object.is`, so a `null` that became `0` and a `NaN` that became a number are
 * both differences. The field census is asserted against both operands: a
 * metric present in the data but absent from {@link REPLAY_METRIC_FIELDS} would
 * otherwise go uncompared forever, which is exactly the silence this gate exists
 * to remove.
 */
export function metricDeltas(port: RunMetrics, archived: RunMetrics): readonly string[] {
  for (const [label, m] of [
    ["port", port],
    ["archive", archived],
  ] as const) {
    const seen = Object.keys(m).sort().join(",");
    const known = [...REPLAY_METRIC_FIELDS].sort().join(",");
    if (seen !== known) {
      throw new Error(
        `metricDeltas: the ${label} metrics carry [${seen}] but REPLAY_METRIC_FIELDS names ` +
          `[${known}] — a metric outside the census would never be compared`,
      );
    }
  }
  return REPLAY_METRIC_FIELDS.filter((k) => !Object.is(port[k], archived[k])).map(
    (k) => `${k}: port ${String(port[k])} vs archive ${String(archived[k])}`,
  );
}
