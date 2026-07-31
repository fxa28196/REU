/**
 * root.ts — locating the read-only Java golden archive (`docs/runs/`).
 *
 * The archive is the validation oracle (plan §1.1, §5). It is ~375 MB of
 * per-agent CSVs living OUTSIDE `websim/` and is never copied in, never
 * modified, and never shipped raw — only digests (archive bundles, golden
 * summaries) derived from it.
 *
 * Absence is reported LOUDLY and never silently skipped (plan §5.3, risk W18):
 * `describeArchive()` returns a structured verdict that callers turn into a
 * banner, and `requireArchive()` throws with the search path when a caller
 * cannot proceed without it.
 */

import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of `websim/`. */
export const WEBSIM_ROOT: string = path.resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
);

/** Absolute path of the repository root (the parent of `websim/`). */
export const REPO_ROOT: string = path.dirname(WEBSIM_ROOT);

/**
 * Environment variable that overrides the archive location, for CI runners that
 * mount the curated working set somewhere other than `docs/runs/`.
 */
export const ARCHIVE_ROOT_ENV = "WEBSIM_ARCHIVE_ROOT";

export interface ArchiveLocation {
  /** Absolute path that was checked. */
  readonly root: string;
  /** `true` when `root` exists and is a directory. */
  readonly present: boolean;
  /** Where `root` came from — used verbatim in the loud-degradation banner. */
  readonly source: "env" | "default";
}

/** Resolve the archive root without touching the filesystem beyond `stat`. */
export function describeArchive(env: NodeJS.ProcessEnv = process.env): ArchiveLocation {
  const override = env[ARCHIVE_ROOT_ENV];
  const root =
    override !== undefined && override.trim() !== ""
      ? path.resolve(override.trim())
      : path.join(REPO_ROOT, "docs", "runs");
  const source = override !== undefined && override.trim() !== "" ? "env" : "default";
  let present = false;
  try {
    present = existsSync(root) && statSync(root).isDirectory();
  } catch {
    present = false;
  }
  return { root, present, source };
}

/**
 * The banner a harness prints when the archive is missing. Deliberately verbose:
 * "degrades loudly, never skips silently" is a plan requirement, so a reader
 * scanning CI output must be able to tell a degraded run from a passing one.
 */
export function missingArchiveBanner(location: ArchiveLocation): string {
  return [
    "!! ARCHIVE ABSENT — validation is running DEGRADED, not green.",
    `!! looked for: ${location.root}`,
    `!! source:     ${location.source === "env" ? `${ARCHIVE_ROOT_ENV} override` : "default docs/runs/"}`,
    "!! Archive-derived checks did NOT run. Provide the 375 MB archive, or the",
    `!! curated working set (see websim/validation/working-set/) via ${ARCHIVE_ROOT_ENV}.`,
  ].join("\n");
}

/** Resolve the archive root or throw with the search path. */
export function requireArchive(env: NodeJS.ProcessEnv = process.env): string {
  const location = describeArchive(env);
  if (!location.present) {
    throw new Error(missingArchiveBanner(location));
  }
  return location.root;
}
