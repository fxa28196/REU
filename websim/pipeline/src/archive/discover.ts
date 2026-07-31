/**
 * discover.ts — enumerate and classify the archived runs under `docs/runs/`.
 *
 * A "run" is any directory holding a `simulation.json`. Two facts about the real
 * archive drive the shape of this module, and both contradict PORT_MAP §6.1's
 * "Each dir: agents.csv, shelters.csv, simulation.json":
 *
 *   1. 154 directories hold a manifest but only 136 also hold `agents.csv`. The
 *      18 `scenario-crandom-2026/` runs are manifest + shelters only, so every
 *      per-agent product (hourly census, occupancy series, exposure histogram,
 *      realised marginals) is UNAVAILABLE for them rather than zero.
 *   2. `agents.csv` comes in four widths — 27 (legacy `final-baseline`), 49
 *      (pre-Phase-E families), 55 (Phase-E: + the 6 decision columns) and 59
 *      (Scenario E: + the 4 closure counters). Column presence is therefore
 *      always tested, never assumed.
 *
 * `presetFamily` maps a run onto the preset families the app ships (plan §6.1
 * left rail) so `build-archive-bundles.ts` can prove coverage of each.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/** Preset families the app ships, plus the archive-only families. */
export const PRESET_FAMILIES = [
  "A", // three-arm present-day reality
  "B", // three-arm capacity meets demand
  "C", // three-arm expanded + new sites
  "D", // arm-D triage reserve
  "E0", // E0 null (degenerate decision layer) — the R3 vehicle
  "ER", // Phase-E baseline-real
  "SE", // Scenario E severe v1
  "SEnc", // Scenario E severe v1, no-closure control
  "SE2", // Scenario E worst-plausible v2
  "SE2nc", // Scenario E worst-plausible v2, no-closure control
  "BS", // Phase-D bed sweep
  "W", // Phase-D opening windows
  "CR", // C-random draws
  "CP", // C-random pool draws
  "HISTREF", // historical reference (n=2,037)
  "LEGACY", // pre-2026 final-baseline
] as const;

export type PresetFamily = (typeof PRESET_FAMILIES)[number];

/** The five families the task requires archive-bundle coverage for. */
export const REQUIRED_BUNDLE_FAMILIES: readonly PresetFamily[] = [
  "A",
  "B",
  "C",
  "ER",
  "SE",
  "SE2",
  "E0",
];

export interface ArchivedRun {
  /** POSIX path relative to the archive root, e.g. `present-day-three-arm/A-seed42`. */
  readonly runDir: string;
  /** First path segment, e.g. `present-day-three-arm`. */
  readonly family: string;
  /** Leaf directory name, e.g. `A-seed42`. */
  readonly name: string;
  readonly presetFamily: PresetFamily;
  /** Seed parsed from the directory name, or `null` when it carries none. */
  readonly seed: number | null;
  readonly hasAgents: boolean;
  readonly hasShelters: boolean;
  /** Bundle id / filename stem: `family__name` with `/` replaced. */
  readonly bundleId: string;
}

function classify(family: string, name: string): PresetFamily {
  if (family === "final-baseline") return "LEGACY";
  if (family === "historical-reference") return "HISTREF";
  if (/^E0null-/u.test(name)) return "E0";
  if (/^ER-/u.test(name)) return "ER";
  if (/^SE2nc-/u.test(name)) return "SE2nc";
  if (/^SE2-/u.test(name)) return "SE2";
  if (/^SEnc-/u.test(name)) return "SEnc";
  if (/^SE-/u.test(name)) return "SE";
  if (/^BS\d/u.test(name)) return "BS";
  if (/^W\d/u.test(name)) return "W";
  if (/^CP\d/u.test(name)) return "CP";
  if (/^CR\d/u.test(name)) return "CR";
  if (/^D-/u.test(name)) return "D";
  if (/^A-/u.test(name)) return "A";
  if (/^B-/u.test(name)) return "B";
  if (/^C-/u.test(name)) return "C";
  throw new Error(
    `discover: cannot classify archived run '${family}/${name}'. Add a rule rather ` +
      "than defaulting — an unclassified run would silently drop out of coverage checks.",
  );
}

function seedOf(name: string): number | null {
  const m = /seed(\d+)/u.exec(name);
  return m ? Number(m[1]) : null;
}

/**
 * Walk the archive root two levels deep (family/, family/run/) and return every
 * run directory in a stable, sorted order.
 */
export function discoverRuns(archiveRoot: string): readonly ArchivedRun[] {
  const runs: ArchivedRun[] = [];

  const consider = (family: string, name: string, dir: string): void => {
    if (!existsSync(path.join(dir, "simulation.json"))) {
      return;
    }
    runs.push({
      runDir: name === family ? family : `${family}/${name}`,
      family,
      name,
      presetFamily: classify(family, name),
      seed: seedOf(name),
      hasAgents: existsSync(path.join(dir, "agents.csv")),
      hasShelters: existsSync(path.join(dir, "shelters.csv")),
      bundleId: name === family ? family : `${family}__${name}`,
    });
  };

  for (const family of readdirSync(archiveRoot).sort()) {
    const familyDir = path.join(archiveRoot, family);
    if (!statSync(familyDir).isDirectory()) continue;
    // A family directory may itself be a run (`final-baseline/`).
    consider(family, family, familyDir);
    for (const name of readdirSync(familyDir).sort()) {
      const dir = path.join(familyDir, name);
      if (!statSync(dir).isDirectory()) continue;
      consider(family, name, dir);
    }
  }

  runs.sort((a, b) => (a.runDir < b.runDir ? -1 : a.runDir > b.runDir ? 1 : 0));
  return runs;
}

/** Census of discovered runs by preset family — the coverage proof. */
export function familyCensus(
  runs: readonly ArchivedRun[],
): ReadonlyMap<PresetFamily, readonly ArchivedRun[]> {
  const byFamily = new Map<PresetFamily, ArchivedRun[]>();
  for (const run of runs) {
    const list = byFamily.get(run.presetFamily) ?? [];
    list.push(run);
    byFamily.set(run.presetFamily, list);
  }
  return byFamily;
}
