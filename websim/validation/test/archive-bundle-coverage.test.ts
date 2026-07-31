/**
 * Archive-bundle coverage (plan §4 archive-bundles row, §6.2, WP4 acceptance:
 * "archive bundles for every preset family").
 *
 * Builds a real bundle for one representative of every preset family the app
 * ships and asserts the three things the acceptance criterion is actually about:
 * the family is covered at all, the bundle carries the products the Run screen
 * needs, and it fits the lazy-load size budget.
 *
 * Archive-gated through the shared skip-vs-fail policy (`tools/artifact-gate.ts`,
 * plan §5.3): when `docs/runs/` is absent the suite prints the loud banner and is
 * reported as SKIPPED, never as green — and on a runner that sets
 * `WEBSIM_REQUIRE_ARTIFACTS`, the same absence is a hard failure.
 */

import { expect, it } from "vitest";

import {
  buildBundle,
  describeArchive,
  discoverRuns,
  REQUIRED_BUNDLE_FAMILIES,
  serialiseBundle,
} from "@websim/pipeline/archive";

import { artifactGate, describeGated } from "../../tools/artifact-gate.js";

const archive = describeArchive();

/** Plan §4: "~100–200 KB ea, lazy". Treated as a ceiling, not a target. */
const MAX_BUNDLE_BYTES = 200 * 1024;

describeGated(
  artifactGate({
    gate: "validation:archive-bundle-coverage",
    suite: "archive bundles cover every shipped preset family",
    evidence:
      "a real archive bundle built for one representative of every shipped preset family, " +
      "checked for family coverage, for the products the Run screen needs, and against the " +
      "200 KB lazy-load ceiling",
    artifacts: [{ source: "archive", label: archive.source, path: archive.root }],
  }),
  () => {
  // A skipped suite is still COLLECTED — vitest executes this callback to find
  // the `it`s it is about to mark skipped — so scanning the archive here would
  // ENOENT during collection on the very checkout the gate exists to protect
  // (the same trap `pipeline/test/checksums.test.ts` documents). Memoised
  // accessor: discovery still happens exactly once, but inside a test body,
  // where the gate has already decided the suite may run.
  let cachedRuns: ReturnType<typeof discoverRuns> | null = null;
  const runs = (): ReturnType<typeof discoverRuns> => (cachedRuns ??= discoverRuns(archive.root));

  // 120_000 like every other case in this file, and for a sharper reason than
  // symmetry: this is the case that MATERIALISES the memoised `runs()`, so the
  // whole `discoverRuns` walk of the 375 MB `docs/runs` archive is charged here
  // and nowhere else. It costs ~85 ms on an idle box, but it is a directory walk
  // over OneDrive-backed storage, and a walk is wall-clock work that a loaded
  // machine can stall arbitrarily. Left on vitest's 5 s default it was the
  // suite's thinnest margin by a wide margin, and it is the test that failed the
  // whole-suite run triaged here: reproduced as
  // "Test Files 1 failed | 69 passed (70) / Tests 1 failed | 1095 passed (1096)"
  // with "Error: Test timed out in 5000ms." under an 8-way background CPU load.
  // Nothing this case asserts is relaxed by the argument — no test in this tree
  // uses its timeout AS a budget assertion (the one performance budget,
  // wp7-vertical-slice.test.ts, asserts `timings.runMs` with an explicit
  // `expect`), so the number only decides how long we wait before calling a hang.
  it("finds at least one archived run for each required preset family", () => {
    for (const family of REQUIRED_BUNDLE_FAMILIES) {
      expect(
        runs().filter((r) => r.presetFamily === family).length,
        `no archived run classified as preset family ${family}`,
      ).toBeGreaterThan(0);
    }
  }, 120_000);

  for (const family of REQUIRED_BUNDLE_FAMILIES) {
    it(`builds a complete, in-budget bundle for family ${family}`, () => {
      const run = runs().find((r) => r.presetFamily === family && r.hasAgents);
      expect(run, `family ${family} has no run with agents.csv`).toBeDefined();
      const bundle = buildBundle(archive.root, run as NonNullable<typeof run>);
      const bytes = Buffer.byteLength(serialiseBundle(bundle), "utf8");

      expect(bundle.per_agent, `${family}: no per-agent digest`).not.toBeNull();
      expect(bundle.shelters.length).toBeGreaterThan(0);
      expect(Object.keys(bundle.executed_parameters).length).toBeGreaterThanOrEqual(11);
      expect(bundle.per_agent?.hourly.sheltered.length).toBe(bundle.per_agent?.hourly.hours);
      expect(bundle.per_agent?.occupancy.series.length).toBe(bundle.shelters.length);
      expect(bundle.per_agent?.exposure_histogram.counts.length).toBeGreaterThan(0);

      const failed = bundle.gates.filter((g) => !g.ok);
      expect(failed.map((g) => `${g.id}: ${g.detail}`)).toEqual([]);

      expect(bytes, `${family} bundle is ${(bytes / 1024).toFixed(1)} KB`).toBeLessThanOrEqual(
        MAX_BUNDLE_BYTES,
      );
    }, 120_000);
  }

  it("carries the Scenario-E closure block only where closures ran", () => {
    const se2 = runs().find((r) => r.presetFamily === "SE2" && r.hasAgents);
    const a = runs().find((r) => r.presetFamily === "A" && r.hasAgents);
    const se2Bundle = buildBundle(archive.root, se2 as NonNullable<typeof se2>);
    const aBundle = buildBundle(archive.root, a as NonNullable<typeof a>);
    expect(se2Bundle.closures).not.toBeNull();
    expect(aBundle.closures).toBeNull();
    // The honesty note (plan §6.4): archived SE/SE2 runs EXECUTED
    // pushThetaThreshold = 0.0 because Repast's batch loader zeroed the negative
    // "number" constant. A bundle must show the executed value, not the intent.
    expect(se2Bundle.executed_parameters["pushThetaThreshold"]).toBe(0.0);
  }, 120_000);
  },
);
