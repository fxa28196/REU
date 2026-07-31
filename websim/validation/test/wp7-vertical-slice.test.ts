/**
 * WP7 acceptance — the arm-A vertical slice, end to end (plan §8 WP7, §5.1
 * Tier 3).
 *
 * This is the plan's go/no-go, so the assertions are the plan's own words:
 * sheltered inside the 9-seed archive band; `unreachable` **exact**; realised
 * marginals **equal, not close**; the 54,002.8 never-sheltered exposure
 * identity exact; dose ≡ exposure × 0.61; `verify_E_runs` gates (b), (d), (e)
 * and (l); and the 2,037 × 312 h performance budget.
 *
 * Gated on `pipeline/out/assets` because the packed graph is git-ignored. A
 * clean clone SKIPS this file loudly and runs the always-green unit cover in
 * `engine/test/agents/step.units.test.ts` instead; a runner that has the assets
 * sets `WEBSIM_REQUIRE_ARTIFACTS=1` and turns absence into a failure.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { PARAM_NAMES, parseRunConfig, PRESETS, type RunConfig } from "@websim/shared";
import { javaFormatFixed } from "@websim/engine/mathx";

import { artifactGate, describeGated, type ArtifactRef } from "../../tools/artifact-gate.js";
import { runHeadless, type HeadlessResult } from "../src/headless.js";
import envelopes from "../golden-summaries/sheltered-envelopes.json" with { type: "json" };

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

const TOPOLOGY: ArtifactRef = {
  source: "graph-asset",
  label: "topology",
  path: here("../../pipeline/out/assets/graph-topology.bin"),
};
const GEOMETRY: ArtifactRef = {
  source: "graph-asset",
  label: "geometry",
  path: here("../../pipeline/out/assets/graph-geometry.bin"),
};
const GEOGRAPHY: ArtifactRef = {
  source: "geography",
  label: "shelters_2026_current_placement.csv",
  path: here("../../../Geography/data/shelters/shelters_2026_current_placement.csv"),
};

const gate = artifactGate({
  gate: "validation:wp7-vertical-slice",
  suite: "WP7 vertical slice — arm A end to end",
  evidence:
    "Tier-3 statistical cross-validation of a full arm-A run (seed 42, heterogeneity on, " +
    "opening dates on, 312 h) at n=2,037 and n=6,842 against docs/runs/present-day-three-arm: " +
    "sheltered inside the 9-seed band, unreachable exact, realised marginals exact, the " +
    "54,002.8192 never-sheltered exposure identity, dose = exposure x 0.61, verify_E_runs " +
    "gates (b)(d)(e)(l), and the 2,037 x 312 h performance budget",
  artifacts: [TOPOLOGY, GEOMETRY, GEOGRAPHY],
});

/** The archived seed-42 marginals, in `OutcomeLogger` order (finding F1-F1). */
const ARCHIVED_MARGINALS_SEED42 = ["0.1988", "0.1478", "0.1079", "0.2381", "0.2622", "1.2805"];

const BAND = (
  envelopes as {
    values: Record<
      string,
      {
        sheltered: { min: number; max: number };
        refused_all_full: { min: number; max: number };
        unreachable: { min: number; max: number };
      }
    >;
  }
).values["present-day-three-arm/A-seed*"]!;

function armA(numAgents: number): RunConfig {
  return {
    ...parseRunConfig(PRESETS.A_present_day, "preset A_present_day"),
    numAgents,
    randomSeed: 42,
    simulationHours: 312,
  };
}

function census(r: HeadlessResult): Record<string, number> {
  const out: Record<string, number> = {
    PRE_EVAC: 0,
    EN_ROUTE: 0,
    SHELTERED: 0,
    UNREACHABLE: 0,
    REFUSED_ALL_FULL: 0,
    UNAWARE: 0,
  };
  for (const a of r.sim.residents) {
    out[a.state] = (out[a.state] ?? 0) + 1;
  }
  return out;
}

let small: HeadlessResult | null = null;
let large: HeadlessResult | null = null;

function run2037(): HeadlessResult {
  small ??= runHeadless({ config: armA(2037), paramNames: PARAM_NAMES });
  return small;
}
function run6842(): HeadlessResult {
  large ??= runHeadless({ config: armA(6842), paramNames: PARAM_NAMES });
  return large;
}

describeGated(gate, () => {
  it("assets and archive summary are both present", () => {
    expect(existsSync(TOPOLOGY.path)).toBe(true);
    expect(BAND.sheltered.min).toBeLessThanOrEqual(BAND.sheltered.max);
  });

  it("n=6,842: sheltered lands inside the 9-seed archive band, unreachable is EXACT", () => {
    const r = run6842();
    const c = census(r);
    expect(c.SHELTERED).toBeGreaterThanOrEqual(BAND.sheltered.min);
    expect(c.SHELTERED).toBeLessThanOrEqual(BAND.sheltered.max);
    expect(c.REFUSED_ALL_FULL).toBeGreaterThanOrEqual(BAND.refused_all_full.min);
    expect(c.REFUSED_ALL_FULL).toBeLessThanOrEqual(BAND.refused_all_full.max);
    // "identical across arms within a seed — a pure graph property": 33 of 36
    // arm-A sites sit in the 27,543-node Portland component, so 28 residents
    // start on the 59,725-node regional one with no shelter on it.
    expect(c.UNREACHABLE).toBe(28);
  }, 60_000);

  it("n=6,842: realised marginals are EQUAL to the archive, not merely close", () => {
    const pm = run6842().world.populationMarginals;
    expect(pm).not.toBeNull();
    const got = [
      pm!.mobilityLimitedShare,
      pm!.asthmaShare,
      pm!.copdShare,
      pm!.anyRespiratoryShare,
      pm!.age55PlusShare,
      pm!.meanWalkingSpeedMps,
    ].map((v) => javaFormatFixed(v, 4));
    expect(got).toEqual(ARCHIVED_MARGINALS_SEED42);
  }, 60_000);

  it("the never-sheltered exposure identity is a single exact value, 54002.8192", () => {
    for (const r of [run2037(), run6842()]) {
      const never = r.sim.residents.filter((a) => a.state !== "SHELTERED");
      expect(never.length).toBeGreaterThan(0);
      const distinct = new Set(never.map((a) => javaFormatFixed(a.exposureUgM3h, 4)));
      expect([...distinct]).toEqual(["54002.8192"]);
      const a = never[0]!;
      expect(javaFormatFixed(a.exposureUgM3h / a.outdoorHours, 2)).toBe("173.09");
      expect(javaFormatFixed(a.peakConcUgM3, 2)).toBe("562.70");
      expect(javaFormatFixed(a.hoursAboveUnhealthy, 4)).toBe("194.0000");
    }
  }, 60_000);

  it("dose == exposure x 0.61 for every resident that stayed at resting ventilation", () => {
    const r = run6842();
    let rows = 0;
    let worstRel = 0;
    for (const a of r.sim.residents) {
      if (javaFormatFixed(a.meanVentilationM3h, 4) !== "0.6100") {
        continue;
      }
      rows++;
      const expected = a.exposureUgM3h * 0.61;
      expect(javaFormatFixed(a.inhaledDoseUg, 4)).toBe(javaFormatFixed(expected, 4));
      worstRel = Math.max(worstRel, Math.abs(a.inhaledDoseUg - expected) / expected);
    }
    expect(rows).toBeGreaterThan(0);
    // Sum(0.61*x) is not bit-equal to 0.61*Sum(x) over 18,720 accumulations —
    // the certified model carries the same residual, so this is a bound on
    // floating-point drift, not a tolerance for a modelling difference.
    expect(worstRel).toBeLessThan(1e-12);
  }, 60_000);

  it("vwe is byte-identical to exposure (both RRs pinned at 1.0)", () => {
    for (const a of run6842().sim.residents) {
      expect(a.vweUgM3h).toBe(a.exposureUgM3h);
      expect(a.ageRR).toBe(1);
      expect(a.comorbidityRR).toBe(1);
    }
  }, 60_000);

  it("gate (b): the U-03 four-way bed sum closes", () => {
    for (const r of [run2037(), run6842()]) {
      const occupancy = r.world.shelters.reduce((s, x) => s + x.occupancy, 0);
      const sheltered = r.sim.residents.filter((a) => a.state === "SHELTERED").length;
      const withTarget = r.sim.residents.filter(
        (a) => a.state === "SHELTERED" && a.targetShelter !== null,
      ).length;
      expect(occupancy).toBe(sheltered);
      expect(withTarget).toBe(sheltered);
    }
  }, 60_000);

  it("gate (d): terminal-state conservation, closed vocabulary", () => {
    for (const r of [run2037(), run6842()]) {
      const c = census(r);
      const total = Object.values(c).reduce((s, v) => s + v, 0);
      expect(total).toBe(r.world.config.numAgents);
      expect(total).toBe(r.sim.residents.length);
    }
  }, 60_000);

  it("gate (e): no UNAWARE resident ever moves (and there are none without the layer)", () => {
    for (const r of [run2037(), run6842()]) {
      for (const a of r.sim.residents) {
        if (a.state === "UNAWARE") {
          expect(a.distanceTraveledM).toBe(0);
          expect(Number.isNaN(a.evacuationTick)).toBe(true);
        }
      }
      expect(census(r).UNAWARE).toBe(0);
    }
  }, 60_000);

  it("gate (l): closuresCode 0 leaves all four Scenario-E counters at zero", () => {
    for (const a of run6842().sim.residents) {
      expect(a.blockagesEncountered).toBe(0);
      expect(a.pushThroughs).toBe(0);
      expect(a.reroutes).toBe(0);
      expect(a.stuckEvents).toBe(0);
    }
  }, 60_000);

  it("A-17: nobody walks further than planned + snap gap (+200 m tolerance)", () => {
    for (const r of [run2037(), run6842()]) {
      for (const a of r.sim.residents) {
        expect(a.distanceTraveledM).toBeLessThanOrEqual(a.plannedRouteM + a.snapGapM + 200);
      }
    }
  }, 60_000);

  it("out_of_range_lookups is 0 at 312 h against the 576-slice observed series", () => {
    expect(run6842().outcome.outOfRangeLookups).toBe(0);
    expect(run2037().outcome.outOfRangeLookups).toBe(0);
  }, 60_000);

  it("both output flavours are produced, and only the v2 one is parseable JSON", () => {
    const r = run2037();
    expect(r.parity.agentsCsv.split("\r\n")[0]!.split(",")).toHaveLength(59);
    expect(r.parity.agentsCsv.endsWith("\r\n")).toBe(true);
    expect(r.v2.agentsCsv.includes("\r")).toBe(false);
    expect(() => JSON.parse(r.v2.simulationJson)).not.toThrow();
    // Parity keeps the writer's own defects; with every stratum populated at
    // n=2,037 both happen to parse, so the assertion is on the shape instead.
    expect(r.parity.simulationJson).toContain('"repast_version": "2.11.0"');
    expect(r.parity.sheltersCsv.split("\r\n")[0]!.split(",")).toHaveLength(12);
  }, 60_000);

  it("the run is deterministic: the same config twice is byte-identical", () => {
    const a = runHeadless({ config: armA(500), paramNames: PARAM_NAMES });
    const b = runHeadless({ config: armA(500), paramNames: PARAM_NAMES });
    expect(b.parity.agentsCsv).toBe(a.parity.agentsCsv);
    expect(b.parity.sheltersCsv).toBe(a.parity.sheltersCsv);
    expect(b.parity.simulationJson).toBe(a.parity.simulationJson);
  }, 60_000);

  it("the shuffle is load-bearing: identity order gives a different admission set", () => {
    const shuffled = runHeadless({ config: armA(500), paramNames: PARAM_NAMES });
    const identity = runHeadless({
      config: armA(500),
      paramNames: PARAM_NAMES,
      agentOrder: "identity",
    });
    // Same world (build-time draws precede tick 1), so the populations match…
    expect(identity.world.residents[0]!.startNode).toBe(shuffled.world.residents[0]!.startNode);
    // …and where capacity binds the order decides who gets the last bed. If this
    // ever stops differing, the declared divergence channel has gone inert and
    // the Tier-4 attribution argument needs re-deriving, not silencing.
    expect(identity.parity.agentsCsv).not.toBe(shuffled.parity.agentsCsv);
  }, 60_000);

  it("performance: 2,037 x 312 h stays inside the plan's 60 s budget", () => {
    const r = run2037();
    expect(r.timings.runMs).toBeLessThan(60_000);
    console.log(
      `[wp7-perf] 2,037 x 312 h = 38,132,640 agent-ticks in ${(r.timings.runMs / 1000).toFixed(2)} s ` +
        `(assets ${r.timings.assetsMs.toFixed(0)} ms one-time, build ${r.timings.buildMs.toFixed(0)} ms, ` +
        `output ${r.timings.outputMs.toFixed(0)} ms)`,
    );
  }, 120_000);
});
