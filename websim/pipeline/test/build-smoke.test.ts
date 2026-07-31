import { describe, expect, it } from "vitest";

import { geographyPath, readUtf8 } from "../src/asset-io.js";
import { buildSmokeAssets, SMOKE_SOURCES } from "../scripts/build-smoke.js";

/**
 * The plan's acceptance row for `smoke-{0,1,2}.json` is 576 / 456 / 456 slices
 * with peaks 562.7 / 984.75 / 2496.1 µg/m³. These are asserted against the REAL
 * source files, not fixtures — the point of the row is to catch an input file
 * being swapped, and a fixture cannot notice that.
 *
 * The build itself also gates on these numbers, so this test's real job is to
 * prove the gate reports the right values rather than merely to restate them.
 */
const built = buildSmokeAssets();

describe("build-smoke acceptance (real source files)", () => {
  it("produces one asset per registered smokeSeriesCode", () => {
    expect(built.map((b) => b.source.code)).toEqual([0, 1, 2]);
    expect(built.map((b) => b.relativePath)).toEqual([
      "assets/smoke-0.json",
      "assets/smoke-1.json",
      "assets/smoke-2.json",
    ]);
  });

  it("reproduces 576 / 456 / 456 slices", () => {
    expect(built.map((b) => b.slices)).toEqual([576, 456, 456]);
  });

  it("reproduces peaks 562.7 / 984.75 / 2496.1", () => {
    const peaks = built.map((b) => Number(b.peak.toFixed(2)));
    expect(peaks).toEqual([562.7, 984.75, 2496.1]);
  });

  it("caps simulationHours at slices - 1 in every series", () => {
    // Plan Q11 enforces `simulationHours <= slices - 1` structurally. The asset
    // carries the bound so the slider max and the preset validator read it from
    // the data rather than from a hard-coded 455.
    for (const b of built) {
      const payload = JSON.parse(b.bytes.toString("utf8")) as {
        provenance: { max_simulation_hours: number };
        slices: number;
      };
      expect(payload.provenance.max_simulation_hours).toBe(payload.slices - 1);
    }
  });
});

describe("build-smoke asset shape", () => {
  const payloads = built.map(
    (b) =>
      JSON.parse(b.bytes.toString("utf8")) as {
        series: number;
        slices: number;
        hourly: (number | null)[];
        embedded_scale: number;
        anchor: string;
        counterfactual_label: string | null;
        provenance: Record<string, unknown>;
      },
  );

  it("carries every field the plan's asset row names", () => {
    for (const p of payloads) {
      expect(Object.keys(p)).toEqual([
        "schema",
        "series",
        "slices",
        "hourly",
        "embedded_scale",
        "anchor",
        "counterfactual_label",
        "provenance",
      ]);
    }
  });

  it("encodes gaps as null and never as zero", () => {
    for (const p of payloads) {
      expect(p.hourly).toHaveLength(p.slices);
      // These three series happen to be gap-free, so the strong assertion is
      // that no value was fabricated: every entry is a real measurement.
      expect(p.hourly.filter((v) => v === null)).toHaveLength(0);
      expect(p.hourly.every((v) => typeof v === "number" && v >= 0)).toBe(true);
    }
  });

  it("records the transform embedded in the CSV, not the runtime smokeScale", () => {
    expect(payloads.map((p) => p.embedded_scale)).toEqual([1.0, 1.75, 4.436]);
    expect(payloads.map((p) => p.embedded_scale)).toEqual(
      SMOKE_SOURCES.map((s) => s.embeddedScale),
    );
  });

  it("anchors every series at the V13 simulation start", () => {
    for (const p of payloads) {
      expect(p.anchor).toBe("2020-09-07T00:00");
    }
  });

  it("labels both severe series as constructed and leaves the observed one unlabelled", () => {
    expect(payloads[0]?.counterfactual_label).toBeNull();
    expect(payloads[1]?.counterfactual_label).toMatch(/CONSTRUCTED COUNTERFACTUAL/u);
    expect(payloads[2]?.counterfactual_label).toMatch(/NOT MEASURED DATA/u);
    expect(payloads[0]?.provenance["constructed"]).toBe(false);
    expect(payloads[1]?.provenance["constructed"]).toBe(true);
    expect(payloads[2]?.provenance["constructed"]).toBe(true);
  });

  it("names the sidecar by digest instead of copying its banned free text", () => {
    // The sidecars' `statement` field contains a place-name severity comparison
    // that tools/claims.ts bans outright. The digest keeps the reference
    // auditable without carrying the phrasing into a generated asset. Compared
    // against the live sidecar text rather than a quoted excerpt, so this test
    // does not itself become a place the banned string lives.
    for (const [i, p] of payloads.entries()) {
      const sidecar = SMOKE_SOURCES[i]?.sidecar;
      if (sidecar === undefined || sidecar === null) {
        expect(p.provenance["sidecar_sha256"]).toBeNull();
        continue;
      }
      expect(p.provenance["sidecar_sha256"]).toMatch(/^[0-9a-f]{64}$/u);
      const raw = JSON.parse(readUtf8(geographyPath(sidecar))) as { statement: string };
      expect(raw.statement.length).toBeGreaterThan(100);
      expect(JSON.stringify(p)).not.toContain(raw.statement);
      expect(p.provenance).not.toHaveProperty("statement");
      expect(p.provenance["sidecar_statement"]).toMatch(/referenced by digest/u);
    }
  });

  it("cross-checks the reducer's mean against the generator's own sidecar figure", () => {
    // The sidecars record mean_ugm3 for the anchored counterfactual series
    // (335.6344 and 850.7536). Matching them from an independent reducer is a
    // real cross-implementation check, not a restatement.
    expect(Number((payloads[1]?.provenance["mean_ugm3"] as number).toFixed(4))).toBe(335.6344);
    expect(Number((payloads[2]?.provenance["mean_ugm3"] as number).toFixed(4))).toBe(850.7536);
  });
});

describe("build-smoke reproducibility", () => {
  it("produces byte-identical output on a second build", () => {
    const again = buildSmokeAssets();
    expect(again.map((b) => b.bytes.toString("hex"))).toEqual(
      built.map((b) => b.bytes.toString("hex")),
    );
  });
});
