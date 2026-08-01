/**
 * The SMOKE-BUILDER 19-CHECK, re-run in TypeScript against the committed
 * counterfactual CSVs (plan §5.2; WP8-SPEC-severe-triage-pets.md §1.7, §8.1).
 *
 * `pipeline/scripts/build-smoke-severe.ts` re-implements
 * `scripts/build_smoke_severe.py` — dialect, exact-decimal HALF_UP scaling,
 * episode detection, whole-day stretch, tail truncation — and this suite asserts
 * that the re-implementation lands on the committed bytes. Four independent
 * oracles have to agree:
 *
 *   1. the bytes in `Geography/data/airnow/aqs_hourly_pm25_synthetic_severe_v*.csv`;
 *   2. `output_sha256` in each committed provenance sidecar;
 *   3. every archived SE/SE2 manifest's `reproducibility.input_datasets` digest
 *      for that CSV (gate (j.1)'s block — NOT `source_integrity.files`, which is
 *      a fixed 13-entry list that always names the *observed* AQS CSV, QUIRK 24);
 *   4. the 19 check names and detail strings recorded in the sidecars.
 *
 * Nothing here compares the code against an expectation the code produced. The
 * one number that is *not* taken from an oracle is the exact peak double
 * `2496.1000000000004`, and that one is recomputed from the CSV by the reducer
 * every run — the sidecar's `2496.1` is a rounded rendering of it, which is
 * exactly the §7.3 trap this suite is written to keep sprung.
 *
 * Skipped (loudly) without the read-only `Geography/` tree.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import {
  artifactGate,
  describeGated,
  gatedFixturePresent,
  itGated,
  type ArtifactRef,
} from "../../../tools/artifact-gate.js";
import {
  PEAK_EPSILON,
  SERIES_ACCEPTANCE,
  SEVERE_BUILDS,
  buildSevereSeries,
  countyField,
  readAqsCsv,
  scaleMeasurement,
  seriesAcceptance,
  seriesStats,
  readSidecar,
} from "../../../pipeline/scripts/build-smoke-severe.js";

const REPO = fileURLToPath(new URL("../../../..", import.meta.url));
const AIRNOW = `${REPO}/Geography/data/airnow`;
const ARCHIVE = `${REPO}/docs/runs`;

const geographyRef = (file: string): ArtifactRef => ({
  source: "geography",
  label: file,
  path: `${AIRNOW}/${file}`,
});

const GATE = artifactGate({
  gate: "engine:smoke-severe-19check",
  suite: "severe smoke series — the builder's 19-check, re-derived in TypeScript",
  evidence:
    "byte-identity of the re-derived severe v1/v2 CSVs against the committed files, their " +
    "provenance sidecars and the archived manifests' input_datasets digests; the 19 named " +
    "checks; and the 576/456/456 slice + 562.7/984.75/2496.1000000000004 peak acceptance",
  artifacts: [
    geographyRef("aqs_hourly_pm25_portland_2020-09.csv"),
    geographyRef("aqs_hourly_pm25_synthetic_severe_v1.csv"),
    geographyRef("aqs_hourly_pm25_synthetic_severe_v1.provenance.json"),
    geographyRef("aqs_hourly_pm25_synthetic_severe_v2.csv"),
    geographyRef("aqs_hourly_pm25_synthetic_severe_v2.provenance.json"),
  ],
});

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

describeGated(GATE, () => {
  for (const spec of SEVERE_BUILDS) {
    const built = buildSevereSeries(spec);
    const sidecar = readSidecar(spec.sidecar) as {
      output_sha256: string;
      checks: { name: string; status: string; detail: string }[];
      counterfactual_series: { hours: number; peak_ugm3: number; mean_ugm3: number };
      rows: number;
      days_added: number;
      plateau_days_repeated: string[];
      counterfactual_episode: { hour_start: number; hour_end: number; hours: number };
      observed_episode: { hour_start: number; hour_end: number; hours: number };
    };

    it(`series ${spec.code}: all 19 checks PASS`, () => {
      expect(built.checks).toHaveLength(19);
      expect(built.checks.filter((c) => c.status === "FAIL")).toEqual([]);
    });

    it(`series ${spec.code}: the 19 check names and details match the committed sidecar`, () => {
      // Names AND details, in order. A drifting check shows up as a diff rather
      // than as a quietly different number.
      expect(built.checks.map((c) => c.name)).toEqual(sidecar.checks.map((c) => c.name));
      expect(built.checks.map((c) => c.detail)).toEqual(sidecar.checks.map((c) => c.detail));
      expect(built.checks.map((c) => c.status)).toEqual(sidecar.checks.map((c) => c.status));
    });

    it(`series ${spec.code}: re-derived bytes are identical to the committed CSV`, () => {
      expect(built.sha256).toBe(sha256(readFileSync(`${REPO}/${spec.out}`)));
      expect(built.byteIdentical).toBe(true);
      expect(built.sha256).toBe(sidecar.output_sha256);
    });

    it(`series ${spec.code}: transform structure matches the sidecar record`, () => {
      expect(built.rows).toBe(sidecar.rows);
      expect(built.daysAdded).toBe(sidecar.days_added);
      expect([...built.plateauDays]).toEqual(sidecar.plateau_days_repeated);
      expect(built.observedEpisode).toEqual({
        start: sidecar.observed_episode.hour_start,
        end: sidecar.observed_episode.hour_end,
        hours: sidecar.observed_episode.hours,
      });
      expect(built.counterfactualEpisode).toEqual({
        start: sidecar.counterfactual_episode.hour_start,
        end: sidecar.counterfactual_episode.hour_end,
        hours: sidecar.counterfactual_episode.hours,
      });
      expect(built.counterfactual.hours).toBe(sidecar.counterfactual_series.hours);
    });
  }

  it("S1-S4: 576/456/456 slices, 0 gaps, peaks at hour 140 with the exact doubles", () => {
    const acceptance = seriesAcceptance();
    expect(acceptance.map((a) => a.slices)).toEqual([576, 456, 456]);
    expect(acceptance.map((a) => a.gapHours)).toEqual([0, 0, 0]);
    expect(acceptance.map((a) => a.peakHour)).toEqual([140, 140, 140]);
    expect(acceptance.every((a) => a.slicesOk && a.peakOk)).toBe(true);
    // The exact doubles, not the sidecar's rounded renderings.
    expect(acceptance[0]!.peak).toBe(562.7);
    expect(acceptance[1]!.peak).toBe(984.75);
    expect(acceptance[2]!.peak).toBe(2496.1000000000004);
    // ... and the trap: an equality test against 2496.1 fails a correct asset.
    expect(acceptance[2]!.peak === 2496.1).toBe(false);
    expect(Math.abs(acceptance[2]!.peak - 2496.1)).toBeLessThan(PEAK_EPSILON);
  });

  it("S5/S6: hours 0 / 311 / 455 of the severe series", () => {
    const acceptance = seriesAcceptance();
    expect([acceptance[1]!.hour0, acceptance[1]!.hour311, acceptance[1]!.hour455]).toEqual([
      9.6, 307.3, 10.05,
    ]);
    expect([acceptance[2]!.hour0, acceptance[2]!.hour311, acceptance[2]!.hour455]).toEqual([
      24.35, 778.95, 25.5,
    ]);
    // Observed hour 0 is 5.5, and 1.75 x 5.5 = 9.625 != 9.6: the transform
    // rounds per monitor BEFORE the field averages them (QUIRK 1).
    expect(acceptance[0]!.hour0).toBe(5.5);
    expect(1.75 * 5.5).not.toBe(acceptance[1]!.hour0);
  });

  it("S7: hours 20 and 21 are SINGLE-monitor means in all three series", () => {
    // A port that hardcodes (a + b) / 2 is wrong for exactly these two hours,
    // both of which sit inside the minor spike that check 14 pins (QUIRK 2).
    for (const want of SERIES_ACCEPTANCE) {
      const { rows } = readAqsCsv(readFileSync(`${REPO}/${want.csv}`));
      const anchor = Date.UTC(2020, 8, 7, 0, 0);
      const perHour = new Map<number, string[]>();
      for (const r of rows) {
        if ((r["County Name"] ?? "").toLowerCase() !== "multnomah") {
          continue;
        }
        const t = r["Time Local"]!;
        const d = r["Date Local"]!;
        const ms = Date.UTC(
          Number(d.slice(0, 4)),
          Number(d.slice(5, 7)) - 1,
          Number(d.slice(8, 10)),
          Number(t.slice(0, 2)),
          Number(t.slice(3, 5)),
        );
        const hour = Math.floor((ms - anchor) / 3_600_000);
        if (hour < 0) {
          continue;
        }
        const list = perHour.get(hour) ?? [];
        list.push(r["Sample Measurement"]!);
        perHour.set(hour, list);
      }
      const singles = [...perHour.entries()].filter(([, v]) => v.length === 1).map(([h]) => h);
      expect(singles.sort((a, b) => a - b)).toEqual([20, 21]);
      const twoMonitorHours = [...perHour.values()].filter((v) => v.length === 2).length;
      expect(twoMonitorHours).toBe(want.slices - 2);

      // The reducer must divide by 1 for those hours, not by 2.
      const series = countyField(rows, "Multnomah", anchor);
      expect(series[20]).toBe(Number(perHour.get(20)![0]));
      expect(series[21]).toBe(Number(perHour.get(21)![0]));
    }
  });

  it("the exact-decimal HALF_UP scaler is not toFixed and not round-half-even", () => {
    // The two values from §1.3's worked example at hour 140.
    expect(scaleMeasurement("539.3", "1.75")).toBe("943.8"); // 943.775 -> HALF_UP
    expect(scaleMeasurement("586.1", "1.75")).toBe("1025.7"); // 1025.675 -> HALF_UP
    expect(scaleMeasurement("539.3", "4.436")).toBe("2392.3");
    expect(scaleMeasurement("586.1", "4.436")).toBe("2599.9");
    // The `.0` drop that makes hour 0 of v1 read `11`, not `11.0`.
    expect(scaleMeasurement("5.5", "1.75")).toBe("9.6"); // 9.625 -> 9.6 (HALF_UP on .625 -> .6)
    expect(scaleMeasurement("2", "1.75")).toBe("3.5");
    expect(scaleMeasurement("4", "1.75")).toBe("7");
    // Exact ties go AWAY from zero — half-to-even would give "0.2" here.
    expect(scaleMeasurement("0.25", "1")).toBe("0.3");
    expect(scaleMeasurement("0.35", "1")).toBe("0.4");
    expect(scaleMeasurement("-0.25", "1")).toBe("-0.3");
  });

  it("the field means match the sidecars' recorded counterfactual means", () => {
    for (const spec of SEVERE_BUILDS) {
      const sidecar = readSidecar(spec.sidecar) as {
        counterfactual_series: { mean_ugm3: number };
        observed_series: { mean_ugm3: number; hours: number; peak_ugm3: number };
      };
      const { rows } = readAqsCsv(readFileSync(`${REPO}/${spec.out}`));
      const stats = seriesStats(countyField(rows, "Multnomah", Date.UTC(2020, 8, 7)));
      // The sidecar rounds to 4 dp; compare at that resolution.
      expect(Math.abs(stats.mean - sidecar.counterfactual_series.mean_ugm3)).toBeLessThan(5e-5);
    }
  });

  it("the packed assets carry the same field, hour for hour", () => {
    const assetDir = fileURLToPath(new URL("../../../pipeline/out/assets", import.meta.url));
    for (const want of SERIES_ACCEPTANCE) {
      const ref: ArtifactRef = {
        source: "built-assets",
        label: `smoke-${want.code}.json`,
        path: `${assetDir}/smoke-${want.code}.json`,
      };
      if (!gatedFixturePresent(GATE, ref)) {
        continue;
      }
      const a = seriesAcceptance(assetDir).find((x) => x.code === want.code)!;
      expect(a.assetSlices).toBe(want.slices);
      expect(a.assetPeak).toBe(a.peak);
      expect(a.assetMatches).toBe(true);
    }
  });

  itGated(
    artifactGate({
      gate: "engine:smoke-severe-input-datasets",
      suite: "severe CSV digests vs the archived manifests",
      evidence:
        "gate (j.1): every archived SE/SE2 manifest's input_datasets digest for the severe CSV " +
        "equals the bytes this builder re-derives — the fourth independent oracle",
      artifacts: [{ source: "archive", label: "docs/runs", path: ARCHIVE }],
    }),
    "gate (j.1): archived input_datasets digests match the re-derived bytes",
    () => {
      const wanted = new Map(
        SEVERE_BUILDS.map((s) => [
          s.out.replace("Geography/", ""),
          buildSevereSeries(s).sha256,
        ]),
      );
      let checked = 0;
      for (const family of ["scenario-e", "scenario-e-v2"]) {
        const dir = `${ARCHIVE}/${family}`;
        if (!existsSync(dir)) {
          continue;
        }
        for (const run of readdirSync(dir)) {
          const manifest = `${dir}/${run}/simulation.json`;
          if (!existsSync(manifest)) {
            continue;
          }
          const j = JSON.parse(readFileSync(manifest, "utf8")) as {
            reproducibility: { input_datasets?: { file: string; sha256: string }[] };
          };
          for (const entry of j.reproducibility.input_datasets ?? []) {
            const want = wanted.get(entry.file);
            if (want !== undefined) {
              expect(`${run}:${entry.sha256}`).toBe(`${run}:${want}`);
              checked += 1;
            }
          }
        }
      }
      // 45 SE/SE2 runs carry a severe CSV; the 6 E0-null runs carry the observed
      // one. Assert the scan was not vacuous rather than pinning a count that a
      // future archive addition would break.
      expect(checked).toBeGreaterThan(20);
    },
  );
});
