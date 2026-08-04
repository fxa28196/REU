/**
 * browser-gate.ts — `npm run gate:browser`, and the WP10 half of `npm run ci`.
 *
 * ## The defect this closes (G2)
 *
 * `npm run ci` was `typecheck && test && check:scratch && lint:claims`. Not one
 * of those runs `test:browser`, and **every WP10 acceptance clause is measured
 * only there**: snapshot-replay byte identity in a real `Worker`, the UI-thread
 * long-task budget, Compare's two synced workers, and the three-engine
 * determinism digests. So a developer running the command the project uses to
 * accept work saw green while WP10's second clause was red. The hosted
 * `cross-engine` job does catch it, so GitHub was never fooled — but the command
 * people actually type to decide "this is done" did not cover the work package
 * it was being used to accept.
 *
 * ## The tension, and how it is resolved
 *
 * `test:browser` needs ~400 MB of Playwright browser builds that `npm ci` does
 * not fetch, which is exactly why it was kept out of `npm test` (see
 * `engine/vitest.browser.config.ts`). Making `ci` depend on it unconditionally
 * would turn a fresh clone's first `npm run ci` into a mysterious failure.
 *
 * The resolution is the discipline `tools/artifact-gate.ts` already enforces
 * inside the suite, applied to the browsers: **declare what is needed, what
 * evidence is lost without it, and the one command that produces it; probe;
 * never disappear silently.** The browsers are a catalogue entry
 * (`playwright-browsers`) like any other artifact, and the banner printed when
 * they are absent names the WP10 clauses that are consequently unverified and
 * prints `npx playwright install chromium firefox webkit`.
 *
 * The one place this gate departs from the in-suite policy is its default:
 * **there is no permissive mode.** In-suite gates default to a loud skip because
 * their artifacts are 375 MB of run archives and 660 MB of oracle dumps that
 * most machines legitimately do not have. These browsers are one documented
 * command away, and the whole point of the fix is that `npm run ci` must not
 * report green over unverified WP10 clauses. So absence is a hard failure with
 * the remedy printed, and a fresh clone's failure is informative rather than
 * mysterious. Silently skipping is the outcome that is not on offer.
 *
 * ## Usage
 *
 *     npm run gate:browser              # probe, then run the matrix
 *     npm run gate:browser -- --probe   # probe only; run nothing
 *     npm run gate:browser -- --browser=firefox   # extra args go to vitest
 *
 * `npm run ci` calls it twice on purpose: `--probe` first, so a missing browser
 * is reported in under a second instead of after the ten-minute Node suite, and
 * the full matrix last, so the cheap checks fail first when they are going to.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, firefox, webkit, type BrowserType } from "playwright";

import {
  WEBSIM_ROOT,
  artifactGate,
  type ArtifactGate,
  type ArtifactGateSpec,
  type ArtifactRef,
} from "./artifact-policy.js";

/**
 * The engines the matrix runs in. Asserted against
 * `engine/vitest.browser.config.ts` in `tools/test/browser-gate.test.ts`, so the
 * gate cannot end up probing for a different set than the config launches.
 */
export const MATRIX_BROWSERS: ReadonlyArray<{ readonly name: string; readonly type: BrowserType }> = [
  { name: "chromium", type: chromium },
  { name: "firefox", type: firefox },
  { name: "webkit", type: webkit },
];

export const BROWSER_CONFIG = path.join(WEBSIM_ROOT, "engine", "vitest.browser.config.ts");

/**
 * Where Playwright would find each engine's executable.
 *
 * `executablePath()` computes the location from the registry without launching
 * anything; it throws for a build the installed driver knows nothing about, and
 * that is reported as a missing path rather than crashing the gate — "the driver
 * cannot even name this browser" and "the browser is not downloaded" both mean
 * the matrix cannot run, and both must produce the banner.
 */
export function browserArtifacts(
  browsers: ReadonlyArray<{ readonly name: string; readonly type: BrowserType }> = MATRIX_BROWSERS,
): readonly ArtifactRef[] {
  return browsers.map(({ name, type }) => {
    let executable: string;
    try {
      executable = type.executablePath();
    } catch {
      executable = path.join(WEBSIM_ROOT, "<playwright-registry>", name, "<not-installed>");
    }
    return { source: "playwright-browsers", path: executable, label: name };
  });
}

export function browserGateSpec(artifacts: readonly ArtifactRef[] = browserArtifacts()): ArtifactGateSpec {
  return {
    gate: "engine:wp10-browser-matrix",
    suite: "the WP10 browser acceptance matrix (npm run test:browser)",
    evidence:
      "every WP10 acceptance clause — snapshot-replay byte identity IN A WORKER, the UI-thread " +
      "long-task budget at 800 and at 6,842 residents, Compare's two synced workers — plus the " +
      "three-engine cross-engine determinism digests. None of it is measured anywhere else.",
    artifacts,
    text: {
      strictHead:
        "!! WP10 IS UNVERIFIED — the browser matrix has no browsers to run in. FAILING.",
      strictPolicy:
        "this gate has NO permissive mode. `npm run ci` must not report green over unverified\n" +
        "WP10 clauses, and the browsers are one command away — so absence is a hard failure\n" +
        "rather than a loud skip. Run the `produce:` command above, then re-run `npm run ci`.",
      // Unreachable: `decideBrowserGate` always evaluates strict. Supplied so a
      // future permissive mode cannot inherit a sentence that names the wrong
      // environment variable.
      degradedHead: "!! WP10 BROWSER MATRIX SKIPPED — this run is DEGRADED, not fully green.",
      degradedPolicy:
        "the WP10 acceptance clauses above were not measured by this run. " +
        "Install the browsers with the `produce:` command and re-run `npm run ci`.",
    },
  };
}

/**
 * Decide. Always strict: {@link artifactGate}'s permissive branch is deliberately
 * unreachable here (see the module header).
 */
export function decideBrowserGate(
  spec: ArtifactGateSpec = browserGateSpec(),
  probe?: (p: string) => boolean,
): ArtifactGate {
  return artifactGate(spec, {}, probe, true);
}

// --- CLI ---------------------------------------------------------------------

function main(argv: readonly string[]): number {
  const probeOnly = argv.includes("--probe");
  const passthrough = argv.filter((a) => a !== "--probe");

  const gate = decideBrowserGate();
  if (gate.action !== "run") {
    process.stderr.write(`\n${gate.report}\n\n`);
    return 1;
  }

  const present = gate.probed.map((p) => p.label ?? "?").join(", ");
  if (probeOnly) {
    process.stderr.write(
      `browser gate: ${gate.probed.length} engine(s) present (${present}); ` +
        "the WP10 matrix will run at the end of this gate.\n",
    );
    return 0;
  }

  process.stderr.write(`browser gate: running the WP10 matrix in ${present}.\n`);
  const vitestCli = path.join(WEBSIM_ROOT, "node_modules", "vitest", "vitest.mjs");
  const child = spawnSync(
    process.execPath,
    [vitestCli, "run", "--config", BROWSER_CONFIG, ...passthrough],
    { cwd: WEBSIM_ROOT, stdio: "inherit" },
  );
  if (child.error !== undefined) {
    throw child.error;
  }
  return child.status ?? 1;
}

// Run only when invoked as a script. `tools/test/browser-gate.test.ts` imports
// this module to inspect the spec and the decision; importing it must never
// launch a browser matrix.
const invoked = process.argv[1];
if (invoked !== undefined && path.resolve(invoked) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)));
}
