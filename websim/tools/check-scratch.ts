/**
 * check-scratch.ts — `npm run check:scratch`.
 *
 * `pipeline/out/` is the ONE directory the builders may write to
 * (`pipeline/src/asset-io.ts#assertInsideOut`), which also makes it the one
 * directory every test that needs a temporary file reaches for. It is git
 * ignored in full, so nothing here is ever caught by `git status`: scratch left
 * behind by a test simply accumulates, silently, until a later run trips over
 * it.
 *
 * That is not hypothetical. Two failure modes were observed in this tree:
 *
 *  1. **A cleanup that never fired.** `pipeline/test/graph-asset.test.ts` freed
 *     its temp directory from `process.on("beforeExit", ...)`. Vitest runs test
 *     files inside a pooled worker that is not exited normally, so the handler
 *     never ran and `out/test-tmp/graph-asset/dump/` survived every run. Fixed
 *     to `afterAll` alongside this guard; the guard is what keeps it fixed.
 *  2. **Ad-hoc verification scratch.** Five directories
 *     (`.clean-run-scratch-fresh`, `.clean-run-scratch-leftover`,
 *     `.recreated-during-clean-run`, `.stub-trash-from-restore`,
 *     `.wrapper-scratch`) left by clean-clone simulations that moved
 *     `pipeline/out` aside and put it back imperfectly.
 *
 * Leftovers are worse than untidy here. `pipeline/test/reproducibility.test.ts`
 * documents the concrete harm: its artifact gate originally probed
 * `pipeline/out` itself, another suite re-created that directory mid-run, and
 * the gate then decided the artifacts were present when they were not. Scratch
 * under `out/` can flip an artifact gate's verdict, so "a stale directory" and
 * "a test suite that lies about what it proved" are the same bug.
 *
 * ## The rule
 *
 * Every direct child of `pipeline/out` is either
 *
 *   - **produced** — named in {@link PRODUCED_ENTRIES}, i.e. some documented
 *     build step or Java dump writes it; or
 *   - **the sanctioned scratch root** `test-tmp`, which may exist but must be
 *     EMPTY when a run is over; or
 *   - **a violation**.
 *
 * `test-tmp` is allowed to survive as an empty directory on purpose. Several
 * test files share it and vitest runs them in parallel workers, so a rule of
 * "the root itself must be gone" would be a race: whichever file finished last
 * would win, and the others would intermittently fail deleting a parent another
 * worker had already removed. Requiring it to be *empty* is race-free — each
 * file removes only the subdirectory it created — and still catches every case
 * of a test leaving bytes behind, which is the property that matters.
 *
 * ## Where it runs, and why not inside the suite
 *
 * `npm run ci` runs it AFTER `npm test`. It cannot be a test: a test executes
 * while the suite is still running, so it would be asserting against a tree that
 * other workers are still writing to. The end state is only observable from
 * outside, once the runner has exited. The guard's own logic is unit-tested in
 * `tools/test/check-scratch.test.ts` against a fake filesystem, and end to end
 * against a real temporary tree, so it is shown able to fail rather than
 * observed-green-by-vacuity.
 *
 * Usage:
 *
 *   tsx tools/check-scratch.ts            # report and exit 1 on any violation
 *   tsx tools/check-scratch.ts --clean    # delete the violations, then exit 0
 *   tsx tools/check-scratch.ts --json     # machine-readable findings
 *   tsx tools/check-scratch.ts --out DIR  # police DIR instead (used by the tests)
 */

import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of `websim/`. */
export const WEBSIM_ROOT: string = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
/** The scratch-prone directory this guard polices. */
export const OUT_DIR: string = path.join(WEBSIM_ROOT, "pipeline", "out");

/**
 * Direct children of `pipeline/out` that a documented step produces.
 *
 * An ALLOWLIST rather than a denylist of known-bad names, deliberately. A
 * denylist only catches the leftovers someone already thought of; this catches
 * the next one too. The cost is that adding a real artifact directory means
 * adding a line here — which is the loud direction to be wrong in, and the entry
 * has to name its producer, so the list doubles as the map of what `out/`
 * legitimately contains.
 */
export const PRODUCED_ENTRIES: ReadonlyMap<string, string> = new Map([
  ["assets", "npm run build:data / build:graph / build:encampments -w @websim/pipeline"],
  ["archive-bundles", "npm run build:archive-bundles -w @websim/pipeline"],
  ["graph-assets.report.json", "npm run build:graph -w @websim/pipeline"],
  ["graph-dump", "pipeline/java-exporter/run-export.ps1"],
  ["graph-dump-nou27", "pipeline/java-exporter/run-export.ps1 (the U-27-disabled control dump)"],
  ["rng-full", "pipeline/java-exporter/dump-rng-volume.ps1"],
  ["wire", "node pipeline/scripts/measure-graph-wire.mjs"],
  ["world-fixtures", "pipeline/java-exporter/dump-world-fixtures.ps1"],
  ["closure-fixtures", "pipeline/java-exporter/dump-closure-fixtures.ps1 (WP8 closure-wave oracle)"],
  [
    "decision-fixtures",
    "pipeline/java-exporter/dump-decision-trace.ps1 (WP8 decision-layer oracle)",
  ],
  ["smoke-severe", "npx tsx pipeline/scripts/build-smoke-severe.ts (the 19-check severe series)"],
  ["wp8-replay", "npx tsx validation/scripts/wp8-archive-replay.ts (WP8 ER/SE/SE2 replay)"],
]);

/** The one directory tests may write into. Must be empty when a run ends. */
export const SCRATCH_ROOT = "test-tmp";

export interface ScratchFinding {
  /** Path relative to `websim/`, POSIX-separated. */
  readonly path: string;
  /** Absolute path, for `--clean`. */
  readonly absolute: string;
  readonly why: string;
}

/** The filesystem surface the scan needs, injected so it can be faked in tests. */
export interface DirReader {
  exists(p: string): boolean;
  readdir(p: string): string[];
}

export const nodeReader: DirReader = {
  exists: (p) => existsSync(p),
  readdir: (p) => readdirSync(p).sort(),
};

function display(root: string, abs: string): string {
  const rel = path.relative(root, abs);
  return rel.startsWith("..") ? abs : `websim/${rel.split(path.sep).join("/")}`;
}

/**
 * Every scratch violation under `outDir`, in stable order.
 *
 * A missing `outDir` is clean, not an error: that is exactly the state of a
 * fresh clone, and this guard must not be the thing that turns a clean clone
 * red.
 */
export function findScratch(
  outDir: string,
  reader: DirReader = nodeReader,
  root: string = WEBSIM_ROOT,
): ScratchFinding[] {
  if (!reader.exists(outDir)) {
    return [];
  }
  const findings: ScratchFinding[] = [];
  for (const name of reader.readdir(outDir)) {
    const abs = path.join(outDir, name);
    if (name === SCRATCH_ROOT) {
      for (const child of reader.readdir(abs)) {
        const childAbs = path.join(abs, child);
        findings.push({
          path: display(root, childAbs),
          absolute: childAbs,
          why:
            `survived the run inside the sanctioned scratch root ${SCRATCH_ROOT}/ — whatever ` +
            "created it did not clean it up (use afterAll, not process.on('beforeExit'): " +
            "vitest workers are pooled and never exit normally)",
        });
      }
      continue;
    }
    if (PRODUCED_ENTRIES.has(name)) {
      continue;
    }
    findings.push({
      path: display(root, abs),
      absolute: abs,
      why:
        "is not produced by any documented build step and is not under " +
        `${SCRATCH_ROOT}/ — scratch under out/ can flip an artifact gate's verdict, so it ` +
        "cannot be left here",
    });
  }
  return findings;
}

/** Render the report a human reads. Exported so the tests assert on it. */
export function formatReport(findings: readonly ScratchFinding[], outDir: string, root = WEBSIM_ROOT): string {
  if (findings.length === 0) {
    return (
      `check:scratch: ${display(root, outDir)} is clean — ` +
      `${PRODUCED_ENTRIES.size} produced entr(ies) allowed, ${SCRATCH_ROOT}/ empty.`
    );
  }
  const lines = [
    `!! SCRATCH LEFT BEHIND — ${findings.length} violation(s) under ${display(root, outDir)}.`,
    "!! pipeline/out is git-ignored in full, so none of this shows up in `git status`.",
  ];
  for (const f of findings) {
    lines.push(`!! LEFTOVER: ${f.path}`);
    lines.push(`!!           ${f.why}`);
  }
  lines.push("!! allowed:  " + [...PRODUCED_ENTRIES.keys()].join(", ") + `, ${SCRATCH_ROOT}/ (empty)`);
  lines.push("!! fix:      remove the leftover in the test's own afterAll, or run");
  lines.push("!!           `npm run check:scratch -- --clean` if it is stale from an earlier session.");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function main(argv: readonly string[], defaultOutDir: string = OUT_DIR): number {
  // `--out` exists so the guard can be pointed at a fixture tree and PROVEN to
  // exit 1 from a real child process, rather than only asserted about in-process.
  const flag = argv.indexOf("--out");
  const outDir = flag >= 0 && argv[flag + 1] !== undefined ? path.resolve(argv[flag + 1]!) : defaultOutDir;
  const findings = findScratch(outDir);
  if (argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ outDir, findings }, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatReport(findings, outDir)}\n`);
  }
  if (findings.length === 0) {
    return 0;
  }
  if (!argv.includes("--clean")) {
    return 1;
  }
  for (const f of findings) {
    rmSync(f.absolute, { recursive: true, force: true });
  }
  // An empty `test-tmp` is legal but pointless once its contents are gone.
  const scratchRoot = path.join(outDir, SCRATCH_ROOT);
  if (existsSync(scratchRoot) && statSync(scratchRoot).isDirectory() && readdirSync(scratchRoot).length === 0) {
    rmSync(scratchRoot, { recursive: true, force: true });
  }
  process.stdout.write(`check:scratch: removed ${findings.length} leftover(s).\n`);
  return 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
