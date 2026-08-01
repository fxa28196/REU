/**
 * The 456-hour matrix: primary evidence for the run-window fail-fast
 * (WP8-SPEC-severe-triage-pets.md §1.6; `Geography/output/superseded-456h/`).
 *
 * `Geography/output/superseded-456h/` holds runs that were **never verified and
 * never scored** and were retained deliberately, because they are the only
 * direct measurement of what `simulationHours = slices` costs. Three facts fall
 * out of them at once, none of which the port may assume:
 *
 *   (a) `endAt(endTick)` is **inclusive** — the tick at `endTick` executes;
 *   (b) the per-tick `concentrationForTick` **double lookup** is real:
 *       `(n - sheltered) + (pre_evac + unaware)` reproduces
 *       `out_of_range_lookups` to the unit in every one of them;
 *   (c) **exactly one** tick is out of range, because all 456 slices exist with
 *       no interior gaps.
 *
 * So this suite is not "does the guard throw" (that is
 * `series.units.test.ts`) — it is "does the guard fire on precisely the
 * configurations that produced a corrupt archive, and stay silent on the 42
 * archived runs that were correct". A guard that also fires on `455` would be
 * just as broken as one that never fires, and only the archive can tell them
 * apart.
 *
 * Skipped (loudly) without the read-only `Geography/` tree; the 455-hour
 * counterpart half additionally needs `docs/runs/`.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { artifactGate, describeGated, itGated } from "../../../tools/artifact-gate.js";
import {
  RunWindowOverrunError,
  assertRunWindowFitsSeries,
  lookupsPerTick,
} from "../../src/smoke/series.js";

const REPO = fileURLToPath(new URL("../../../..", import.meta.url));
const SUPERSEDED = `${REPO}/Geography/output/superseded-456h`;
const ARCHIVE = `${REPO}/docs/runs`;

interface Manifest {
  readonly reproducibility: { readonly parameters: Record<string, number> };
  readonly smoke_field?: {
    readonly hours: number;
    readonly out_of_range_lookups: number;
    readonly peak_hourly_ugm3: number;
  };
  readonly population?: {
    readonly n_agents: number;
    readonly sheltered: number;
    readonly pre_evac: number;
    readonly unaware: number;
    readonly en_route: number;
    readonly unreachable: number;
    readonly refused_all_full: number;
  };
}

function readManifests(root: string): { name: string; manifest: Manifest }[] {
  if (!existsSync(root)) {
    return [];
  }
  const out: { name: string; manifest: Manifest }[] = [];
  for (const name of readdirSync(root).sort()) {
    const path = `${root}/${name}/simulation.json`;
    if (existsSync(path)) {
      out.push({ name, manifest: JSON.parse(readFileSync(path, "utf8")) as Manifest });
    }
  }
  return out;
}

describeGated(
  artifactGate({
    gate: "engine:smoke-window-456h",
    suite: "the discarded 456-hour matrix — why the run-window guard exists",
    evidence:
      "the out_of_range_lookups identity (n - sheltered) + (pre_evac + unaware) on the 13 " +
      "discarded 456 h runs, and the proof that the port's fail-fast fires on all of them",
    artifacts: [
      { source: "geography", label: "output/superseded-456h", path: SUPERSEDED },
    ],
  }),
  () => {
    const runs = readManifests(SUPERSEDED);

    it("finds the discarded matrix (the scan must not be vacuous)", () => {
      expect(runs.length).toBeGreaterThanOrEqual(13);
    });

    it("every discarded run booked fabricated hours, and the identity holds to the unit", () => {
      let checked = 0;
      for (const { name, manifest } of runs) {
        const p = manifest.reproducibility.parameters;
        const smoke = manifest.smoke_field;
        const pop = manifest.population;
        if (smoke === undefined || pop === undefined) {
          continue;
        }
        expect(`${name}:${p["simulationHours"]}`).toBe(`${name}:456`);
        expect(`${name}:${smoke.hours}`).toBe(`${name}:456`);
        // (a) + (c): the window overran by exactly one hour, so every lookup on
        // the final tick — and only those — was fabricated.
        expect(smoke.out_of_range_lookups).toBeGreaterThan(0);
        // (b) the double lookup, evaluated at lookup time.
        const want = lookupsPerTick({
          n: pop.n_agents,
          sheltered: pop.sheltered,
          preEvac: pop.pre_evac,
          unaware: pop.unaware,
        });
        expect(`${name}:${smoke.out_of_range_lookups}`).toBe(`${name}:${want}`);
        checked += 1;
      }
      expect(checked).toBeGreaterThanOrEqual(13);
    });

    it("the port's fail-fast would have refused every one of them", () => {
      let refused = 0;
      for (const { manifest } of runs) {
        const p = manifest.reproducibility.parameters;
        const smoke = manifest.smoke_field;
        if (smoke === undefined) {
          continue;
        }
        const config = {
          simulationHours: p["simulationHours"]!,
          slices: smoke.hours,
          minutesPerTick: p["minutesPerTick"] ?? 1,
          smokeSeriesCode: p["smokeSeriesCode"] ?? 1,
        };
        expect(() => assertRunWindowFitsSeries(config)).toThrow(RunWindowOverrunError);
        // ... and it stays silent one hour lower, which is the half that makes
        // the guard a guard rather than a blanket refusal.
        expect(() =>
          assertRunWindowFitsSeries({ ...config, simulationHours: config.simulationHours - 1 }),
        ).not.toThrow();
        refused += 1;
      }
      expect(refused).toBeGreaterThanOrEqual(13);
    });

    itGated(
      artifactGate({
        gate: "engine:smoke-window-455h-counterpart",
        suite: "the 455-hour re-runs",
        evidence:
          "the re-run at 455 h has out_of_range_lookups == 0 with an IDENTICAL population " +
          "census — the fabricated hour changed no outcome, so the guard costs nothing",
        artifacts: [{ source: "archive", label: "docs/runs/scenario-e", path: `${ARCHIVE}/scenario-e` }],
      }),
      "the 455 h re-runs are clean AND census-identical to their 456 h predecessors",
      () => {
        const reruns = new Map(readManifests(`${ARCHIVE}/scenario-e`).map((r) => [r.name, r.manifest]));
        let compared = 0;
        for (const { name, manifest } of runs) {
          const rerun = reruns.get(name);
          if (rerun === undefined) {
            continue;
          }
          expect(`${name}:${rerun.reproducibility.parameters["simulationHours"]}`).toBe(`${name}:455`);
          expect(`${name}:${rerun.smoke_field?.out_of_range_lookups}`).toBe(`${name}:0`);
          // Same census: the fabricated hour was one minute of zero
          // concentration and changed nothing that is reported.
          expect(`${name}:${JSON.stringify(censusOf(rerun))}`).toBe(
            `${name}:${JSON.stringify(censusOf(manifest))}`,
          );
          compared += 1;
        }
        expect(compared).toBeGreaterThanOrEqual(9);
      },
    );
  },
);

function censusOf(m: Manifest): Record<string, number | undefined> {
  const p = m.population;
  return {
    n: p?.n_agents,
    sheltered: p?.sheltered,
    pre_evac: p?.pre_evac,
    en_route: p?.en_route,
    unaware: p?.unaware,
    unreachable: p?.unreachable,
    refused_all_full: p?.refused_all_full,
  };
}

describeGated(
  artifactGate({
    gate: "engine:smoke-window-archive-sweep",
    suite: "no archived run violates simulationHours <= slices - 1",
    evidence:
      "the whole 375 MB archive swept for the gotcha-3 violation: every published run must " +
      "satisfy the constraint the port now enforces, and every one must carry oor == 0",
    artifacts: [{ source: "archive", label: "docs/runs", path: ARCHIVE }],
  }),
  () => {
    it("every published manifest satisfies the constraint and reports zero fabricated hours", () => {
      let checked = 0;
      const violations: string[] = [];
      for (const family of readdirSync(ARCHIVE).sort()) {
        for (const { name, manifest } of readManifests(`${ARCHIVE}/${family}`)) {
          const smoke = manifest.smoke_field;
          const simH = manifest.reproducibility.parameters["simulationHours"];
          if (smoke === undefined || simH === undefined) {
            continue;
          }
          checked += 1;
          if (simH > smoke.hours - 1 || smoke.out_of_range_lookups !== 0) {
            violations.push(
              `${family}/${name}: simulationHours=${simH}, hours=${smoke.hours}, ` +
                `oor=${smoke.out_of_range_lookups}`,
            );
          }
        }
      }
      expect(violations).toEqual([]);
      expect(checked).toBeGreaterThan(100);
    });
  },
);
