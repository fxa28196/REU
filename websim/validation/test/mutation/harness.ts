/**
 * harness.ts — the machinery behind WP9's mutation gate.
 *
 * Plan §5.2: *"a CI job injects a seed perturbation (and one formatter
 * perturbation) into a replay and asserts the gate suite goes **red** — the
 * gates are proven able to fail, never observed-green-by-vacuity."*
 *
 * This module is the part that touches the filesystem and spawns vitest. It is
 * deliberately boring, because it edits **certified port source** and has to put
 * every byte back:
 *
 *  1. a SHA-256 manifest of every file the catalogue can touch is taken BEFORE
 *     anything is written, and re-verified after every restore;
 *  2. the original bytes are also written to a backup file under the sanctioned
 *     scratch root (`pipeline/out/test-tmp/`, README §8.2) before the source is
 *     touched, so a killed process leaves a recoverable copy AND a `check:scratch`
 *     violation naming it — loud, not silent;
 *  3. `restoreAll()` runs from `finally` and from SIGINT/SIGTERM, and throws if a
 *     restored file's digest does not equal its pre-experiment digest.
 *
 * Nothing here is allowed to `git checkout` its way out of trouble: the whole
 * point is that the restoration is proved by digest, not by trusting a VCS
 * command that would also silently discard unrelated work in progress.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of `websim/`. */
export const WEBSIM_ROOT: string = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

/** The vitest CLI entry point, invoked as a child so exit codes are observable. */
export const VITEST_CLI: string = path.join(WEBSIM_ROOT, "node_modules", "vitest", "vitest.mjs");

/**
 * Where original bytes are parked while an injection is live.
 *
 * `pipeline/out/test-tmp` is the ONE directory `tools/check-scratch.ts` sanctions
 * for test scratch, and it requires the directory to be **empty** when a run
 * ends. A crashed mutation run therefore shows up twice: as a backup file that
 * can be replayed by hand, and as a red `npm run check:scratch`.
 */
export const BACKUP_ROOT: string = path.join(
  WEBSIM_ROOT,
  "pipeline",
  "out",
  "test-tmp",
  "mutation-backup",
);

// ---------------------------------------------------------------------------
// digests
// ---------------------------------------------------------------------------

export function sha256Of(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** SHA-256 of a file's exact bytes — no newline normalisation, no encoding. */
export function sha256File(absolute: string): string {
  return sha256Of(readFileSync(absolute));
}

/** `websim/`-relative POSIX path → SHA-256, for every file the run may touch. */
export type SourceManifest = ReadonlyMap<string, string>;

export function buildManifest(relPaths: readonly string[]): SourceManifest {
  // A manifest taken while a previous run's injection is still applied would
  // certify that injection as the pristine baseline, and every later
  // "restoration verified" line would be a lie about the wrong bytes. Refuse.
  const stale = leftoverBackups();
  if (stale.length > 0) {
    throw new Error(
      "REFUSING to take a pre-experiment manifest: a previous mutation run left parked " +
        `originals under ${BACKUP_ROOT}, which means it died mid-injection and the working ` +
        "tree may still carry that injection. Recover first:\n" +
        stale.map((s) => `  ${s.rel}  <-  ${s.backupPath}`).join("\n") +
        "\n  npx tsx validation/test/mutation/run-mutation-gate.ts --restore-only",
    );
  }
  const m = new Map<string, string>();
  for (const rel of [...new Set(relPaths)].sort()) {
    const abs = path.join(WEBSIM_ROOT, rel);
    if (!existsSync(abs)) {
      throw new Error(`mutation manifest: ${rel} does not exist under ${WEBSIM_ROOT}`);
    }
    m.set(rel, sha256File(abs));
  }
  return m;
}

export interface ManifestDrift {
  readonly rel: string;
  readonly expected: string;
  readonly actual: string | "MISSING";
}

/** Every file whose current digest differs from the pre-experiment manifest. */
export function manifestDrift(manifest: SourceManifest): readonly ManifestDrift[] {
  const drift: ManifestDrift[] = [];
  for (const [rel, expected] of manifest) {
    const abs = path.join(WEBSIM_ROOT, rel);
    const actual = existsSync(abs) ? sha256File(abs) : ("MISSING" as const);
    if (actual !== expected) {
      drift.push({ rel, expected, actual });
    }
  }
  return drift;
}

// ---------------------------------------------------------------------------
// crash recovery
// ---------------------------------------------------------------------------

/**
 * A backup file that outlived the run that made it.
 *
 * MEASURED FAILURE, not a hypothetical. `runSuite` blocks in `spawnSync`, and a
 * Node process blocked in a synchronous call cannot service SIGINT/SIGTERM until
 * that call returns. A hard kill during a long child run therefore CAN leave a
 * source file mutated. It happened once during the WP9 sweep: a 10-minute
 * harness timeout fired mid-control and left the negative-control comment in
 * `engine/src/agents/step.ts`.
 *
 * The consequence that actually matters is not the stray comment — it is that
 * the NEXT run would take its "pre-experiment" manifest over the mutated file
 * and then certify that mutation as pristine. {@link leftoverBackups} exists so
 * that cannot happen: the manifest step refuses to proceed while any backup
 * survives, and {@link recoverFromBackups} is the documented way out.
 */
export interface LeftoverBackup {
  /** `websim/`-relative POSIX path of the source the backup belongs to. */
  readonly rel: string;
  readonly backupPath: string;
}

function unmangle(name: string): string {
  return name.replace(/__/gu, "/");
}

/** Every parked original still sitting in the backup root. */
export function leftoverBackups(): readonly LeftoverBackup[] {
  if (!existsSync(BACKUP_ROOT)) return [];
  return readdirSync(BACKUP_ROOT)
    .filter((n) => n.endsWith(".ts") || n.endsWith(".mts"))
    .map((n) => ({ rel: unmangle(n), backupPath: path.join(BACKUP_ROOT, n) }))
    .sort((a, b) => a.rel.localeCompare(b.rel));
}

export interface Recovery {
  readonly rel: string;
  readonly wasMutated: boolean;
  readonly sha256: string;
}

/**
 * Copy every parked original back over its source and report the resulting
 * digests. Deliberately dumb: no git, no heuristics, just the bytes that were
 * saved before the edit.
 */
export function recoverFromBackups(): readonly Recovery[] {
  const out: Recovery[] = [];
  for (const b of leftoverBackups()) {
    const abs = path.join(WEBSIM_ROOT, b.rel);
    const original = readFileSync(b.backupPath);
    const wasMutated = !existsSync(abs) || sha256File(abs) !== sha256Of(original);
    writeFileSync(abs, original);
    out.push({ rel: b.rel, wasMutated, sha256: sha256File(abs) });
    rmSync(b.backupPath, { force: true });
  }
  if (existsSync(BACKUP_ROOT) && readdirSync(BACKUP_ROOT).length === 0) {
    rmSync(BACKUP_ROOT, { recursive: true, force: true });
  }
  return out;
}

// ---------------------------------------------------------------------------
// apply / restore
// ---------------------------------------------------------------------------

export interface LiveEdit {
  readonly rel: string;
  readonly absolute: string;
  readonly originalBytes: Buffer;
  readonly originalSha: string;
  readonly backupPath: string;
}

/**
 * A set of edits that is guaranteed to be undoable.
 *
 * Construct once per process, apply/restore many times. `restoreAll` is
 * idempotent and safe to call from `finally` and from a signal handler.
 */
export class EditSession {
  private readonly live = new Map<string, LiveEdit>();
  private disarmed = false;

  constructor(readonly manifest: SourceManifest) {
    mkdirSync(BACKUP_ROOT, { recursive: true });
    const onSignal = (): void => {
      this.restoreAll();
      process.exit(130);
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
    process.on("exit", () => {
      // Last line of defence: never leave a mutated source behind, even if a
      // caller forgot its own `finally`.
      this.restoreAll();
    });
  }

  /**
   * Replace `find` with `replace` in `rel`, requiring EXACTLY one occurrence.
   *
   * A zero-occurrence anchor means the catalogue has gone stale against a
   * refactor and the "injection" would have been a no-op that trivially proved
   * nothing; a multi-occurrence anchor means the blast radius is not the one the
   * catalogue documents. Both are errors, not warnings.
   */
  apply(rel: string, find: string, replace: string): void {
    if (this.disarmed) {
      throw new Error("EditSession has been disarmed; construct a new one");
    }
    const expected = this.manifest.get(rel);
    if (expected === undefined) {
      throw new Error(`${rel} is not in the pre-experiment manifest — refusing to edit it`);
    }
    const absolute = path.join(WEBSIM_ROOT, rel);
    if (this.live.has(rel)) {
      throw new Error(`${rel} already has a live injection; restore before re-applying`);
    }
    const originalBytes = readFileSync(absolute);
    const originalSha = sha256Of(originalBytes);
    if (originalSha !== expected) {
      throw new Error(
        `${rel} does not match the pre-experiment manifest (${originalSha} != ${expected}). ` +
          "Something else changed it; refusing to inject on top of an unknown baseline.",
      );
    }
    const text = originalBytes.toString("utf8");
    const occurrences = text.split(find).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `anchor for ${rel} matched ${occurrences} times, expected exactly 1.\n` +
          `  anchor: ${JSON.stringify(find)}\n` +
          "  A stale anchor makes the injection a no-op, which would prove nothing.",
      );
    }
    const backupPath = path.join(BACKUP_ROOT, rel.replace(/[\\/]/gu, "__"));
    writeFileSync(backupPath, originalBytes);
    writeFileSync(absolute, text.replace(find, replace), "utf8");
    this.live.set(rel, { rel, absolute, originalBytes, originalSha, backupPath });
  }

  /** Put every live edit back and prove it by digest. Throws on any mismatch. */
  restoreAll(): void {
    const failures: string[] = [];
    for (const edit of [...this.live.values()]) {
      writeFileSync(edit.absolute, edit.originalBytes);
      const after = sha256File(edit.absolute);
      if (after !== edit.originalSha) {
        failures.push(`${edit.rel}: restored to ${after}, expected ${edit.originalSha}`);
      } else {
        rmSync(edit.backupPath, { force: true });
        this.live.delete(edit.rel);
      }
    }
    if (failures.length > 0) {
      throw new Error(`RESTORATION FAILED — DO NOT COMMIT:\n  ${failures.join("\n  ")}`);
    }
  }

  /** Remove the (now empty) backup directory so `check:scratch` stays green. */
  disarm(): void {
    this.restoreAll();
    this.disarmed = true;
    rmSync(BACKUP_ROOT, { recursive: true, force: true });
  }

  get liveCount(): number {
    return this.live.size;
  }
}

// ---------------------------------------------------------------------------
// running vitest as a child
// ---------------------------------------------------------------------------

export type TestStatus = "passed" | "failed" | "skipped" | "pending" | "todo";

export interface TestOutcome {
  /** `websim/`-relative POSIX path of the test file. */
  readonly file: string;
  readonly name: string;
  readonly status: TestStatus;
}

export interface SuiteResult {
  /** vitest's exit code. 0 = green. Anything else = red. */
  readonly exitCode: number;
  readonly red: boolean;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly failures: readonly TestOutcome[];
  /** Every file that reported at least one test, relative + POSIX. */
  readonly files: readonly string[];
  readonly durationMs: number;
  /** stdout+stderr, kept for the report when the JSON reporter produced nothing. */
  readonly output: string;
}

interface JsonAssertion {
  readonly fullName?: string;
  readonly title?: string;
  readonly status?: string;
}

interface JsonFile {
  readonly name?: string;
  readonly assertionResults?: readonly JsonAssertion[];
}

interface JsonReport {
  readonly testResults?: readonly JsonFile[];
}

export interface RunOptions {
  /**
   * Extra vitest argv: positional filters (substrings matched against test file
   * paths) and/or flags such as `--project engine`. Empty means "the whole suite".
   */
  readonly filters: readonly string[];
  /** `WEBSIM_REQUIRE_ARTIFACTS`. Left off means artifact-gated suites skip loudly. */
  readonly requireArtifacts?: boolean;
  /** Stop at the first failing file. Set for detection runs; never for green runs. */
  readonly bail?: boolean;
  readonly timeoutMs?: number;
}

function toRel(p: string): string {
  const abs = path.isAbsolute(p) ? p : path.join(WEBSIM_ROOT, p);
  return path.relative(WEBSIM_ROOT, abs).split(path.sep).join("/");
}

/**
 * Run vitest in a child process and read its verdict out of the JSON reporter.
 *
 * The exit code alone is not enough: "red" has to be attributable to a NAMED
 * test, or an injection that merely breaks the TypeScript transform would look
 * exactly like an injection the gates caught.
 */
export function runSuite(options: RunOptions): SuiteResult {
  const outFile = path.join(
    BACKUP_ROOT,
    `vitest-${process.pid}-${Math.random().toString(36).slice(2)}.json`,
  );
  mkdirSync(BACKUP_ROOT, { recursive: true });
  const argv = [
    VITEST_CLI,
    "run",
    ...options.filters,
    "--reporter=json",
    `--outputFile=${outFile}`,
    // A second, terse console reporter so a human watching CI sees progress and
    // the failure text; the JSON file is what this module actually parses.
    "--reporter=dot",
  ];
  if (options.bail === true) {
    argv.push("--bail=1");
  }
  const started = Date.now();
  const child = spawnSync(process.execPath, argv, {
    cwd: WEBSIM_ROOT,
    env: {
      ...process.env,
      WEBSIM_REQUIRE_ARTIFACTS: options.requireArtifacts === true ? "1" : "0",
      // Vitest's own colour codes would end up in the report file.
      NO_COLOR: "1",
      CI: "1",
    },
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    timeout: options.timeoutMs ?? 60 * 60_000,
  });
  const durationMs = Date.now() - started;
  const output = `${child.stdout ?? ""}\n${child.stderr ?? ""}`;

  let report: JsonReport = {};
  if (existsSync(outFile)) {
    try {
      report = JSON.parse(readFileSync(outFile, "utf8")) as JsonReport;
    } catch {
      report = {};
    }
    rmSync(outFile, { force: true });
  }

  const failures: TestOutcome[] = [];
  const files = new Set<string>();
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const f of report.testResults ?? []) {
    const rel = toRel(f.name ?? "");
    files.add(rel);
    for (const a of f.assertionResults ?? []) {
      const status = (a.status ?? "unknown") as TestStatus;
      const name = a.fullName ?? a.title ?? "(unnamed)";
      if (status === "failed") {
        failed++;
        failures.push({ file: rel, name, status });
      } else if (status === "passed") {
        passed++;
      } else {
        skipped++;
      }
    }
  }

  const exitCode = child.status ?? (child.signal !== null ? 137 : 1);
  return {
    exitCode,
    red: exitCode !== 0,
    passed,
    failed,
    skipped,
    failures,
    files: [...files].sort(),
    durationMs,
    output,
  };
}
