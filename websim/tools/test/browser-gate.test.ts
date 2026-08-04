/**
 * The local gate covers WP10, and says so when it cannot (defect G2).
 *
 * `npm run ci` was `typecheck && test && check:scratch && lint:claims`. None of
 * those runs `test:browser`, and every WP10 acceptance clause is measured only
 * there — so the command the project uses to accept work reported green while
 * WP10's UI-thread clause was red. That is the defect; `tools/browser-gate.ts`
 * is the fix, and this file is what stops it being undone.
 *
 * Three altitudes, because each catches a different way of undoing it:
 *
 *  1. **The wiring.** `ci` must actually invoke the gate. A perfect gate that
 *     nothing calls is the defect again with more code.
 *  2. **The decision.** Absence must be `fail`, never `skip-loudly`, and it must
 *     stay `fail` regardless of `WEBSIM_REQUIRE_ARTIFACTS` — this gate has no
 *     permissive mode, and inheriting one from the in-suite policy would restore
 *     exactly the silent green being removed.
 *  3. **The process.** The CLI is spawned for real, once with the browsers
 *     present and once with Playwright pointed at an empty directory, and the
 *     exit statuses are asserted. Deciding `"fail"` in a unit test is an opinion;
 *     watching the process exit 1 with the banner is evidence.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ARTIFACT_SOURCES, REQUIRE_ARTIFACTS_ENV, WEBSIM_ROOT } from "../artifact-gate.js";
import {
  BROWSER_CONFIG,
  MATRIX_BROWSERS,
  browserArtifacts,
  browserGateSpec,
  decideBrowserGate,
} from "../browser-gate.js";

const SCRIPT = path.join(WEBSIM_ROOT, "tools", "browser-gate.ts");

const packageJson = JSON.parse(readFileSync(path.join(WEBSIM_ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

/** A probe answering from a set, so the decision can be driven either way. */
const probeWith =
  (present: readonly string[]) =>
  (p: string): boolean =>
    present.includes(p);

describe("the local gate command covers WP10", () => {
  const ci = packageJson.scripts["ci"] ?? "";

  it("runs the browser gate from `npm run ci`, at both ends", () => {
    // Probe first, so a missing browser is reported in a second rather than
    // after the Node suite; the matrix last, so cheap checks fail first.
    expect(ci, "`npm run ci` does not probe for browsers before doing ten minutes of work").toContain(
      "gate:browser -- --probe",
    );
    expect(
      ci.replace("gate:browser -- --probe", ""),
      "`npm run ci` probes for browsers but never runs the matrix",
    ).toContain("gate:browser");
  });

  it("still runs everything it ran before — the browser gate is an addition, not a swap", () => {
    for (const step of ["npm run typecheck", "npm test", "npm run check:scratch", "npm run lint:claims"]) {
      expect(ci, `\`npm run ci\` lost ${step}`).toContain(step);
    }
  });

  it("wires the gate to the script that implements it", () => {
    expect(packageJson.scripts["gate:browser"]).toBe("tsx tools/browser-gate.ts");
    // …and `test:browser` is left alone. The gate wraps the same config rather
    // than replacing it, and the README still documents `test:browser` as the
    // way to run the matrix directly, without the probe in front of it.
    expect(packageJson.scripts["test:browser"]).toContain("engine/vitest.browser.config.ts");
  });
});

describe("the gate probes for exactly the engines the matrix launches", () => {
  it("matches `engine/vitest.browser.config.ts` browser for browser", () => {
    const config = readFileSync(BROWSER_CONFIG, "utf8");
    const declared = [...config.matchAll(/browser:\s*"([a-z]+)"/gu)].map((m) => m[1]!);
    expect(declared.length, "no `browser: \"…\"` instances found in the config").toBeGreaterThan(0);
    expect(MATRIX_BROWSERS.map((b) => b.name).sort()).toEqual([...declared].sort());
  });

  it("declares one artifact per engine, each carrying the engine's name", () => {
    const refs = browserArtifacts();
    expect(refs.map((r) => r.label)).toEqual(["chromium", "firefox", "webkit"]);
    for (const ref of refs) {
      expect(ref.source).toBe("playwright-browsers");
      expect(path.isAbsolute(ref.path), ref.path).toBe(true);
    }
  });

  it("catalogues the browsers with the command that produces them", () => {
    const source = ARTIFACT_SOURCES["playwright-browsers"];
    expect(source.produce).toContain("playwright install");
    for (const engine of ["chromium", "firefox", "webkit"]) {
      expect(source.produce).toContain(engine);
    }
  });
});

describe("absence is a hard failure, not a loud skip", () => {
  const spec = browserGateSpec();
  const paths = spec.artifacts.map((a) => a.path);

  it("runs when every engine is present", () => {
    const gate = decideBrowserGate(spec, probeWith(paths));
    expect(gate.satisfied).toBe(true);
    expect(gate.action).toBe("run");
    expect(gate.report).toBe("");
  });

  it("fails — never skips — when one engine is missing", () => {
    const gate = decideBrowserGate(spec, probeWith(paths.slice(1)));
    expect(gate.action, "a missing browser must not produce a silent or loud SKIP").toBe("fail");
    expect(gate.missing.map((m) => m.label)).toEqual(["chromium"]);
  });

  it("does not inherit the in-suite policy's permissive default", () => {
    // The in-suite gates read WEBSIM_REQUIRE_ARTIFACTS and default to a loud
    // skip. This one is strict unconditionally: it passes no environment to the
    // policy at all, so there is no variable that can turn `npm run ci` green
    // over unmeasured WP10 clauses. The process-level proof is below.
    const gate = decideBrowserGate(spec, probeWith([]));
    expect(gate.strict).toBe(true);
    expect(gate.action).toBe("fail");
  });

  it("names the WP10 clauses that are unverified, and the one command that fixes it", () => {
    const report = decideBrowserGate(spec, probeWith([])).report;
    expect(report).toContain("WP10 IS UNVERIFIED");
    expect(report).toContain("engine:wp10-browser-matrix");
    expect(report).toContain("snapshot-replay byte identity");
    expect(report).toContain("long-task budget");
    expect(report).toContain("Compare's two synced workers");
    expect(report).toContain("npx playwright install chromium firefox webkit");
    for (const engine of ["chromium", "firefox", "webkit"]) {
      expect(report, `the banner does not name ${engine}`).toContain(`playwright-browsers/${engine}`);
    }
    // The remedy must not be a variable that would change nothing here.
    expect(report, "the banner offers an env var this gate does not read").not.toContain(
      `set ${REQUIRE_ARTIFACTS_ENV}=1`,
    );
  });

  it("prefixes every line so the banner cannot be skimmed past", () => {
    for (const line of decideBrowserGate(spec, probeWith([])).report.split("\n")) {
      expect(line.startsWith("!!"), line).toBe(true);
    }
  });
});

// --- the process, run --------------------------------------------------------

interface Run {
  readonly status: number | null;
  readonly output: string;
}

function runGate(browsersPath?: string, requireArtifacts?: string): Run {
  const env: Record<string, string | undefined> = { ...process.env, NO_COLOR: "1" };
  delete env[REQUIRE_ARTIFACTS_ENV];
  if (browsersPath !== undefined) {
    env["PLAYWRIGHT_BROWSERS_PATH"] = browsersPath;
  }
  if (requireArtifacts !== undefined) {
    env[REQUIRE_ARTIFACTS_ENV] = requireArtifacts;
  }
  const child = spawnSync(process.execPath, ["--import", "tsx", SCRIPT, "--probe"], {
    cwd: WEBSIM_ROOT,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { status: child.status, output: `${child.stdout ?? ""}\n${child.stderr ?? ""}` };
}

describe("end-to-end: the gate is provably able to fail", () => {
  it(
    "exits non-zero with the banner when Playwright has no browsers",
    () => {
      // A clean clone, simulated exactly as a clean clone experiences it: the
      // driver is installed (it is a devDependency) and the ~400 MB of browser
      // builds are not.
      const empty = mkdtempSync(path.join(tmpdir(), "websim-no-browsers-"));
      try {
        const run = runGate(empty);
        expect(run.status, run.output).toBe(1);
        expect(run.output).toContain("WP10 IS UNVERIFIED");
        expect(run.output).toContain("npx playwright install");
        // And it did not quietly succeed with a warning, which is the one
        // outcome this whole gate exists to remove.
        expect(run.output).not.toContain("the WP10 matrix will run");
      } finally {
        rmSync(empty, { recursive: true, force: true });
      }
    },
    120_000,
  );

  it(
    "stays red even with the in-suite permissive variable turned on",
    () => {
      // `WEBSIM_REQUIRE_ARTIFACTS=0` is the setting that makes every other gate
      // in this tree skip. If it made this one skip, `npm run ci` on a runner
      // that sets it would be green with WP10 unmeasured — the defect again.
      const empty = mkdtempSync(path.join(tmpdir(), "websim-no-browsers-"));
      try {
        const run = runGate(empty, "0");
        expect(run.status, run.output).toBe(1);
        expect(run.output).toContain("WP10 IS UNVERIFIED");
      } finally {
        rmSync(empty, { recursive: true, force: true });
      }
    },
    120_000,
  );

  it(
    "exits zero on a machine that has them, without launching the matrix",
    () => {
      // `--probe` must be cheap: this asserts the probe path returns without
      // starting vitest, so putting it at the head of `npm run ci` costs a
      // second rather than the matrix's several minutes.
      const run = runGate();
      expect(run.status, run.output).toBe(0);
      expect(run.output).toContain("3 engine(s) present");
      expect(run.output).not.toContain("RUN  v");
    },
    120_000,
  );
});
