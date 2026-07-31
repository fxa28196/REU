/**
 * asset-io.ts — the shared write path for every WP4 builder.
 *
 * Two rules hold this file together:
 *
 *  1. **Every builder is byte-reproducible.** Asset payloads contain no clock, no
 *     random value, no absolute path and no host-dependent line ending. Rebuild
 *     twice on two machines and the bytes match, which is what makes
 *     `assets-manifest.json` digests a real load-time gate rather than a
 *     changing decoration. The one clock-derived field in the tree — the
 *     manifest's `built_utc` — is pinnable via `SOURCE_DATE_EPOCH` and is
 *     excluded from `--check` comparisons for exactly that reason.
 *  2. **Writes never leave `websim/`.** `Geography/`, `docs/` and `scripts/` are
 *     read-only inputs; {@link assertInsideOut} enforces that on every write, so
 *     a mistyped relative path fails loudly instead of touching the certified
 *     tree.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** `websim/pipeline`. */
export const PIPELINE_ROOT = resolve(HERE, "..");
/** `websim/`. */
export const WEBSIM_ROOT = resolve(PIPELINE_ROOT, "..");
/** Repository root — the parent of `websim/`, containing the read-only `Geography/`. */
export const REPO_ROOT = resolve(WEBSIM_ROOT, "..");
/** The only directory WP4 builders may write to. */
export const OUT_DIR = join(PIPELINE_ROOT, "out");
/** Read-only certified input tree. Nothing here is ever opened for writing. */
export const GEOGRAPHY_DIR = join(REPO_ROOT, "Geography");

/** Resolve a path inside the read-only `Geography/` tree from a repo-relative one. */
export function geographyPath(repoRelative: string): string {
  return join(REPO_ROOT, repoRelative);
}

/** Repo-relative POSIX path, the form recorded in `source_file`. */
export function repoRelativePosix(absolutePath: string): string {
  return relative(REPO_ROOT, absolutePath).split(sep).join("/");
}

/** Throw unless `target` is inside `pipeline/out` (hard rule 1 of the build charter). */
export function assertInsideOut(target: string): string {
  const abs = resolve(target);
  const rel = relative(OUT_DIR, abs);
  if (rel.startsWith("..") || resolve(OUT_DIR, rel) !== abs) {
    throw new Error(`refusing to write outside pipeline/out: ${abs}`);
  }
  return abs;
}

/** Lowercase hex SHA-256 of bytes. */
export function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** SHA-256 of a file's bytes, for `source_sha256`. */
export function sha256File(path: string): string {
  return sha256(readFileSync(path));
}

/**
 * Read a project data file the way `CsvLoader` does: bytes → UTF-8 string. The
 * BOM is deliberately left in place; the loader strips it from the header line
 * itself, and stripping it here would hide a real defect in a future input.
 */
export function readUtf8(path: string): string {
  return readFileSync(path).toString("utf8");
}

/**
 * Serialise JSON deterministically: two-space indent, LF endings, trailing
 * newline. Key order is the caller's construction order, which the builders fix
 * explicitly, so the output diffs like source.
 */
export function toJsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`.replace(/\r\n/gu, "\n"), "utf8");
}

export interface WriteResult {
  /** Path relative to `pipeline/out`, POSIX-separated — the asset id. */
  readonly id: string;
  readonly absolutePath: string;
  readonly bytes: number;
  readonly sha256: string;
  /** True when `--check` ran and the on-disk bytes already matched. */
  readonly unchanged: boolean;
}

/**
 * Write (or, in check mode, verify) one asset. Check mode never writes, so it is
 * safe to run against a tree a reviewer is inspecting.
 */
export function writeAsset(relativePath: string, bytes: Buffer, check: boolean): WriteResult {
  const abs = assertInsideOut(join(OUT_DIR, relativePath));
  const id = relative(OUT_DIR, abs).split(sep).join("/");
  let existing: Buffer | undefined;
  try {
    existing = readFileSync(abs);
  } catch {
    existing = undefined;
  }
  const unchanged = existing !== undefined && existing.equals(bytes);
  if (!check && !unchanged) {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, bytes);
  }
  return { id, absolutePath: abs, bytes: bytes.length, sha256: sha256(bytes), unchanged };
}

/**
 * websim git commit, suffixed `-dirty` when the working tree has changes (plan
 * Q5: a dirty build must never claim a clean commit). Read-only git plumbing;
 * falls back to `"unknown"` outside a checkout rather than failing the build.
 */
export function buildCommit(): string {
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return status.trim().length > 0 ? `${head}-dirty` : head;
  } catch {
    return "unknown";
  }
}

/**
 * True UTC build timestamp. `SOURCE_DATE_EPOCH` (the reproducible-builds
 * convention) pins it so a release build can be byte-reproduced years later.
 */
export function builtUtc(): string {
  const pinned = process.env["SOURCE_DATE_EPOCH"];
  if (pinned !== undefined && /^\d+$/u.test(pinned)) {
    return new Date(Number(pinned) * 1000).toISOString();
  }
  return new Date().toISOString();
}

/** Tool versions recorded on every asset this pipeline builds. */
export function toolVersions(builder: string): Record<string, string> {
  return {
    builder,
    node: process.versions.node,
    pipeline: "0.0.1",
  };
}

/** Parse the `--check` flag shared by all four builders. */
export function checkMode(argv: readonly string[] = process.argv.slice(2)): boolean {
  return argv.includes("--check");
}

/** Exit non-zero from a builder, printing why. Never throws. */
export function failBuild(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
