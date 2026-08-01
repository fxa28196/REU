/**
 * provenance.ts — the `source_integrity` block for runs the PORT produces.
 *
 * ## Why the headless runner does not do this itself
 *
 * `headless.ts` refuses to invent environment facts (see its module doc): it
 * defaults `sourceIntegrity` to `null`, and a `simulation.json` with no
 * `source_integrity` block is an honest statement that the runner did not know.
 * That default is right for the runner and wrong for an *evidence* run.
 *
 * Gate (h) — `verify_E_runs.py:check_manifest`, ported in
 * `harness/gate-hi-manifest.ts` — tests `dirty is False` by identity, so a
 * missing block, `null` and `"unknown"` all FAIL. That is deliberate: "a run
 * whose provenance is unknown is not a run whose tree was clean." The archived
 * Java runs satisfy it (594 checks, 0 failures); the port's own replays did not,
 * because they carried no block at all. The port therefore failed a gate it
 * itself ports, on all twelve runs, for the reason "it never said".
 *
 * This module lets a *script* say it — explicitly, at the call site, from facts
 * it actually measures. It is not wired into `runHeadless`'s defaults and must
 * not be: the browser has no git and no shapefile, and a runner that silently
 * stamped provenance it could not verify would be the exact failure this whole
 * block exists to expose.
 *
 * ## What the two halves mean
 *
 * **`git_working_tree_dirty`** is the port's analogue of
 * `OutcomeLogger.gitWorkingTreeDirty()` (TECHNICAL_REFERENCE §12.4): *"true when
 * the run may have executed uncommitted model code."* Java compares file mtimes
 * under `src/geography` against `.git/HEAD`'s mtime and admits the heuristic is
 * conservative; `docs/critique-response/09-SYSTEM-AUDIT.md` §133-136 records
 * that this produced a **false `false`** on eight archived D manifests and
 * prescribes the fix — *"replace the heuristic with `git status --porcelain`"*.
 * This module is that fix, applied to the port's own sources
 * ({@link PORT_SOURCE_PATHS}). It is three-state exactly as Java's is: `true`,
 * `false`, or the string `"unknown"` when git cannot be consulted at all.
 *
 * It reports what it finds. A dirty tree yields `true`, gate (h) then goes red,
 * and that is the gate working: the run really did execute code that is not in
 * any commit, so nobody could reproduce it from the recorded hash. There is no
 * override, no allowlist and no "assume clean" flag, because every one of those
 * would reintroduce the false `false` the audit caught.
 *
 * **`files`** is the SHA-256 census of the read-only `Geography/` inputs, at the
 * same 13 paths `OutcomeLogger.writeSourceIntegrity()` lists and in that order,
 * so a port manifest and a Java manifest can be diffed line for line. These are
 * bytes the process actually read off disk, not facts about them taken on trust.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { sha256Hex } from "@websim/pipeline/archive";
import type { DatasetDigest, SourceIntegrity } from "@websim/engine/output";

/**
 * The 13 paths, relative to `Geography/`, in `writeSourceIntegrity`'s order
 * (TECHNICAL_REFERENCE §12.3). The comment there records that this list was once
 * wrong — it checksummed retired `shelters_{A,B}_placement_*.csv` files that
 * still existed on disk while omitting every shelter file that actually drove a
 * run — so the three 2026 study arms below are load-bearing, not decorative.
 */
export const SOURCE_INTEGRITY_FILES: readonly string[] = [
  "data/Streets.shp",
  "data/Streets.dbf",
  "data/Streets.shx",
  "data/Streets.prj",
  "data/Streets.cpg",
  "data/airnow/aqs_hourly_pm25_portland_2020-09.csv",
  "data/shelters/shelters_2020-09.csv",
  "data/shelters/shelters_2026_current_placement.csv",
  "data/shelters/shelters_2026_expanded_capacity.csv",
  "data/shelters/shelters_2026_expanded_plus_new_sites.csv",
  "data/encampments/irp_campsite_reports_sample.csv",
  "data/registry/variables.csv",
  "data/registry/assumptions.csv",
];

/**
 * Repository-relative paths whose git state decides `git_working_tree_dirty` for
 * a port run: the model, the shared schema/presets, and the harness that drives
 * them.
 *
 * Wider than Java's `src/geography` because the port's equivalent of "the model"
 * is genuinely spread over three packages, and narrower than "the whole repo"
 * because a dirty `docs/` or a scratch note under `pipeline/out/` cannot change
 * a number. Anything that CAN change a number is here.
 */
export const PORT_SOURCE_PATHS: readonly string[] = [
  "websim/engine/src",
  "websim/shared/src",
  "websim/validation/src",
  "websim/validation/scripts",
];

/** `git status --porcelain` over the given paths, or `null` if git failed. */
export type PorcelainRunner = (repoRoot: string, paths: readonly string[]) => string | null;

const defaultPorcelain: PorcelainRunner = (repoRoot, paths) => {
  try {
    return execFileSync("git", ["status", "--porcelain", "--", ...paths], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
};

/**
 * Java's three-state flag, computed from porcelain status rather than mtimes.
 *
 * `null` from the runner — git absent, not a repository, a permissions failure —
 * becomes `"unknown"`, never `false`. Untracked files count as dirty because
 * `--porcelain` lists them with `??` and an untracked source file is precisely
 * the case that cannot be reproduced from the recorded commit.
 *
 * The runner is injectable so the three states can be proved without a git
 * repository to mutate (`validation/test/provenance.test.ts`).
 */
export function gitWorkingTreeDirty(
  repoRoot: string,
  paths: readonly string[] = PORT_SOURCE_PATHS,
  run: PorcelainRunner = defaultPorcelain,
): boolean | "unknown" {
  const out = run(repoRoot, paths);
  if (out === null) {
    return "unknown";
  }
  return out.split("\n").some((l) => l.trim() !== "");
}

/** SHA-256 over the raw bytes, or Java's own `"unavailable"` token. */
export function datasetDigest(geographyDir: string, file: string): DatasetDigest {
  const full = path.join(geographyDir, file);
  if (!existsSync(full)) {
    return { file, sha256: "unavailable" };
  }
  try {
    return { file, sha256: sha256Hex(new Uint8Array(readFileSync(full))) };
  } catch {
    return { file, sha256: "unavailable" };
  }
}

export interface PortProvenanceOptions {
  readonly repoRoot: string;
  readonly geographyDir: string;
  readonly sourcePaths?: readonly string[];
  readonly porcelain?: PorcelainRunner;
}

const NOTE =
  "Port replay provenance, NOT a certified Java run. git_working_tree_dirty is " +
  "`git status --porcelain` over the TypeScript sources that decide this run's numbers " +
  "(websim/engine/src, websim/shared/src, websim/validation/{src,scripts}) — the port's " +
  "analogue of OutcomeLogger.gitWorkingTreeDirty(), using the porcelain status " +
  "09-SYSTEM-AUDIT prescribed in place of the mtime heuristic that returned a false " +
  "'false'. files is the SHA-256 census of the read-only Geography/ inputs, at the same 13 " +
  "paths and in the same order OutcomeLogger.writeSourceIntegrity() lists.";

/** The block a port evidence run should carry. Measured, never assumed. */
export function portSourceIntegrity(o: PortProvenanceOptions): SourceIntegrity {
  return {
    note: NOTE,
    gitWorkingTreeDirty: gitWorkingTreeDirty(
      o.repoRoot,
      o.sourcePaths ?? PORT_SOURCE_PATHS,
      o.porcelain ?? defaultPorcelain,
    ),
    files: SOURCE_INTEGRITY_FILES.map((f) => datasetDigest(o.geographyDir, f)),
  };
}
