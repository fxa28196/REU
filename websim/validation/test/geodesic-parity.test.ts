/**
 * geodesic-parity.test.ts — SPIKE WP2-S1 result, frozen as a regression.
 *
 * The spike measured stock `geographiclib-geodesic` against 20,000 Direct problems
 * dumped from the certified GeographicLib-Java 1.49 inside Repast Simphony 2.11.0
 * (see websim/docs/DR-S1-geodesic.md). The decision to keep the stock JS library
 * rests on ONE number: the maximum position disagreement, measured at 3.159e-9 m.
 *
 * This test re-derives that number on every CI run so the decision cannot rot
 * silently under a dependency bump, a Node upgrade, or a fixture edit. It asserts
 * the budget (1e-8 m), NOT the exact measurement — the exact value is engine
 * dependent, the budget is the contract.
 *
 * The fixtures are generated artefacts of `pipeline/java-exporter/build-and-dump.ps1`
 * (which needs a JDK + a Repast install). If they are absent the test fails loudly
 * rather than skipping: MISSING_ARCHIVE_POLICY is "fail-loudly", and a silently
 * skipped parity gate is exactly the failure mode risk W18 describes.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  compareFixture,
  maxRoundTripClosureM,
  parseFixture,
  Q12_FALLBACK_TRIGGER_M,
  S1_MAX_POSITION_ERROR_BUDGET_M,
} from "../src/geodesic-parity.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "pipeline", "java-exporter", "fixtures");

const MODES = ["uniform", "prodshape"] as const;

describe("SPIKE S1 — geodesic Direct parity vs certified Java", () => {
  it("ships both fixture sets (regenerate with pipeline/java-exporter/build-and-dump.ps1)", () => {
    for (const mode of MODES) {
      expect(existsSync(join(FIXTURE_DIR, `geodesic-direct-${mode}.tsv`)), `missing fixture for mode=${mode}`).toBe(
        true,
      );
    }
  });

  for (const mode of MODES) {
    describe(`mode=${mode}`, () => {
      const fixture = parseFixture(join(FIXTURE_DIR, `geodesic-direct-${mode}.tsv`));

      it("carries 10,000 tuples dumped from GeographicLib-Java 1.49", () => {
        expect(fixture.tuples.length).toBe(10_000);
        expect(fixture.meta.join(" ")).toContain("GeographicLib-Java version=1.49");
      });

      it("agrees with certified Java to within the S1 position-error budget", () => {
        const report = compareFixture(mode, fixture);
        expect(report.maxErrorM).toBeLessThan(S1_MAX_POSITION_ERROR_BUDGET_M);
        // ... and by a wide margin below the plan Q12 verbatim-port trigger.
        expect(report.maxErrorM).toBeLessThan(Q12_FALLBACK_TRIGGER_M / 100);
      });

      it("disagrees only in the last few bits — never structurally", () => {
        const report = compareFixture(mode, fixture);
        // A structural divergence (wrong algorithm, wrong ellipsoid, swapped
        // lat/lon arguments) would blow these up by many orders of magnitude.
        expect(BigInt(report.maxUlpLat2)).toBeLessThanOrEqual(8n);
        expect(BigInt(report.maxUlpLon2)).toBeLessThanOrEqual(8n);
        expect(report.ulpHistogramBoth[">16"] ?? 0).toBe(0);
      });

      it("records that agreement is NOT bit-exact (the honest spike finding)", () => {
        const report = compareFixture(mode, fixture);
        // Documented reality, asserted so a future "we are bit-exact" claim in the
        // README or a manifest cannot pass CI while this is false.
        expect(report.bitExactFraction).toBeLessThan(1);
        expect(report.bitExactFraction).toBeGreaterThan(0.3);
      });
    });
  }

  it("keeps the Java-vs-JS epsilon within the library's own round-trip closure tier", () => {
    // The plan's cumulative-length hoist already accepts the round-trip error; S1's
    // finding is only meaningful if the port error is not materially larger.
    const fixture = parseFixture(join(FIXTURE_DIR, "geodesic-direct-prodshape.tsv"));
    const roundTrip = maxRoundTripClosureM(fixture);
    const parity = compareFixture("prodshape", fixture).maxErrorM;
    expect(roundTrip).toBeLessThan(S1_MAX_POSITION_ERROR_BUDGET_M);
    expect(parity).toBeLessThan(10 * roundTrip);
  });
});
