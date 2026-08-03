/**
 * The synthetic world's non-vacuity gate.
 *
 * Every other WP10 acceptance test asserts that two runs agree. That assertion
 * is worth exactly as much as the amount of state the runs actually touched, so
 * this file measures it once, prints the census, and fails if the world stops
 * exercising any of the state a snapshot has to carry.
 *
 * It is the reason a WP10 "byte-identical" claim is not the WP8 failure again:
 * the property tests below it cannot pass vacuously, because this file fails
 * first if the world goes quiet.
 */

import { describe, expect, it } from "vitest";

import { assertWorldIsExercised, buildSynthWorld, censusOf } from "./world.js";

describe("synthetic WP10 world", () => {
  it("reaches every kind of state a snapshot has to carry", () => {
    const b = buildSynthWorld();
    b.sim.run();
    const census = censusOf(b.sim);
    // eslint-disable-next-line no-console -- the census IS the evidence here.
    console.log("[wp10-world]", JSON.stringify(census));
    assertWorldIsExercised(census, (cond, msg) => {
      expect(cond, msg).toBe(true);
    });
    expect(b.sim.tick).toBe(b.sim.endTick);
  });

  it("has both RNG samplers live and all closure waves scheduled", () => {
    const b = buildSynthWorld();
    expect(b.world.streams.populationSampler, "heterogeneity stream").not.toBeNull();
    expect(b.world.streams.eLayerSampler, "E-layer stream").not.toBeNull();
    expect(b.sim.closures, "closure runtime").not.toBeNull();
    expect(b.sim.closures!.schedule.waves.length).toBe(3);
    expect(b.sim.armedResidents).toBe(b.sim.residents.length);
  });

  it("reaches all six resident states, including UNREACHABLE via the island", () => {
    const b = buildSynthWorld();
    b.sim.run();
    const census = censusOf(b.sim);
    expect(census.states["UNREACHABLE"]!).toBeGreaterThan(0);
    expect(census.states["SHELTERED"]!).toBeGreaterThan(0);
    expect(census.states["REFUSED_ALL_FULL"]!).toBeGreaterThan(0);
    expect(census.distinctStates).toBe(6);
  });

  it("two builds of the same configuration are independent objects", () => {
    // The property tests compare a run against a separately built one. If the
    // two shared a `Shelter` (say, through a memoised asset bundle that also
    // memoised the world), every comparison would be a comparison with itself.
    const a = buildSynthWorld();
    const b = buildSynthWorld();
    expect(a.sim).not.toBe(b.sim);
    expect(a.sim.shelters[0]).not.toBe(b.sim.shelters[0]);
    expect(a.sim.residents[0]).not.toBe(b.sim.residents[0]);
    expect(a.world.streams).not.toBe(b.world.streams);
    a.sim.run();
    expect(b.sim.tick, "running one build advanced the other").toBe(0);
  });
});
