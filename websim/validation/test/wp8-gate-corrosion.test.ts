/**
 * wp8-gate-corrosion.test.ts — proving every ported gate can go RED.
 *
 * `IMPLEMENTATION_PLAN.md` §5.2 requires the gate suite to be *proven able to
 * fail*, "never observed-green-by-vacuity", and this repository has already
 * been bitten once by a suite that only ever ran on data that satisfied it.
 * The archive suite next door proves the gates pass on certified-good runs;
 * this file proves each of them fails on data that is wrong in exactly one way.
 *
 * The method, applied identically to every case:
 *
 *  1. build the fixture run that passes **every** gate (baseline, asserted
 *     first — a corrosion test whose baseline is already red proves nothing);
 *  2. change exactly one thing;
 *  3. assert the specific check that owns that thing flipped to FAIL, and — for
 *     the sharp cases — that its neighbours did not.
 *
 * Several cases are deliberately chosen to be ones a *paraphrased* port would
 * pass: the row-wise counter identity balanced in aggregate, the `is False`
 * identity test on `git_working_tree_dirty`, `blocked_edges_at_end` counted as
 * rows rather than distinct pairs, and the manifest-census-vs-CSV cross-check
 * that a run can fail while every parameter is still plausible.
 *
 * No archive is needed here, so the suite is ungated and runs on a clean clone.
 */

import { describe, expect, it } from "vitest";

import {
  Checks,
  checkECensus,
  checkManifest,
  checkSeClosures,
  checkSeCounters,
  checkSeManifest,
  checkWachinger,
  inMemoryScheduleSource,
  runWp8Gates,
  type CheckStatus,
  type RunView,
} from "../src/harness/index.js";

import {
  FIXTURE_HIGH_BARRIER,
  FIXTURE_HIGH_BARRIER_STAYED,
  FIXTURE_N,
  FIXTURE_SCHEDULE_CSV,
  FIXTURE_SCHEDULE_FILE,
  fixtureRun,
  fixtureRunViaDocuments,
  type FixtureOptions,
} from "./helpers/wp8-fixtures.js";

const schedules = inMemoryScheduleSource({ [FIXTURE_SCHEDULE_FILE]: FIXTURE_SCHEDULE_CSV });

/** Every check whose name contains `needle`, with its status. */
function statuses(ck: Checks, needle: string): readonly CheckStatus[] {
  return ck.results.filter((c) => c.name.includes(needle)).map((c) => c.status);
}

/** The single check whose name contains `needle`; throws if it is not unique. */
function only(ck: Checks, needle: string): { status: CheckStatus; detail: string } {
  const hits = ck.results.filter((c) => c.name.includes(needle));
  if (hits.length !== 1) {
    throw new Error(
      `expected exactly one check matching '${needle}', found ${hits.length}: ` +
        `${hits.map((h) => h.name).join(" | ")}`,
    );
  }
  const hit = hits[0] as { status: CheckStatus; detail: string };
  return { status: hit.status, detail: hit.detail };
}

/** Run one gate over a fixture and hand back the registry. */
function gate(fn: (ck: Checks, run: RunView) => unknown, options: FixtureOptions = {}): Checks {
  const ck = new Checks();
  fn(ck, fixtureRun(options));
  return ck;
}

function closureGate(options: FixtureOptions = {}, source = schedules): Checks {
  const ck = new Checks();
  checkSeClosures(ck, fixtureRun(options), source);
  return ck;
}

// ---------------------------------------------------------------------------
// The baseline. Everything below depends on this being green.
// ---------------------------------------------------------------------------

describe("WP8 gate corrosion — the baseline fixture is green", () => {
  it("passes all 15 checks of the closuresCode-3 gate subset", () => {
    const ck = new Checks();
    runWp8Gates(ck, fixtureRun(), { arm: "se", schedules });
    expect(ck.failureReport()).toBe("");
    // (f)1 + (g)2 + (h)2 + (i)2 + (k)6 + (l)2 — the driver's own count table.
    expect(ck.results.length).toBe(15);
    expect(ck.skipped.length).toBe(0);
  });

  it("passes identically when routed through the real CSV/JSON reader", () => {
    // The in-memory fixture and the `runFromDocuments` path must agree, or the
    // corrosion cases would be exercising a shortcut the archive never takes.
    const ck = new Checks();
    runWp8Gates(ck, fixtureRunViaDocuments(), { arm: "se", schedules });
    expect(ck.failureReport()).toBe("");
    expect(ck.results.length).toBe(15);
  });

  it("has the stratum sizes the (f) cases rely on", () => {
    const ck = new Checks();
    const facts = checkWachinger(ck, fixtureRun());
    expect(facts).toEqual({ nHigh: FIXTURE_HIGH_BARRIER, nStay: FIXTURE_HIGH_BARRIER_STAYED });
  });
});

// ---------------------------------------------------------------------------
// (f) Wachinger acceptance
// ---------------------------------------------------------------------------

describe("(f) Wachinger acceptance can fail", () => {
  it("goes red when EVERY high-barrier resident departs", () => {
    const ck = gate(checkWachinger, { agentColumns: { final_state: () => "SHELTERED" } });
    const check = only(ck, "(f)");
    expect(check.status).toBe("FAIL");
    expect(check.detail).toContain(`high-barrier n=${FIXTURE_HIGH_BARRIER}`);
    expect(check.detail).toContain("end of run: 0");
  });

  it("still passes with exactly ONE stayer — the threshold really is 1", () => {
    // Resident 0 carries belongings and a pet, so it is in the stratum.
    const ck = gate(checkWachinger, {
      agentColumns: { final_state: (i) => (i === 0 ? "PRE_EVAC" : "SHELTERED") },
    });
    expect(only(ck, "(f)").status).toBe("PASS");
  });

  it("goes red when the Phase-E attribute block is absent", () => {
    const ck = gate(checkWachinger, { dropAgentColumns: ["theta_z"] });
    const check = only(ck, "(f)");
    expect(check.status).toBe("FAIL");
    expect(check.detail).toContain("no Phase-E attribute block");
  });

  it("goes red — not green — when the barrier attributes were never sampled", () => {
    // The empty-stratum branch: a gate that returned PASS here would be exactly
    // the vacuous green this file exists to rule out.
    const ck = gate(checkWachinger, {
      agentColumns: { heavy_belongings: () => "0", has_pet: () => "0", has_dependents: () => "0" },
    });
    const check = only(ck, "(f)");
    expect(check.status).toBe("FAIL");
    expect(check.detail).toContain("high-barrier stratum is EMPTY");
  });

  it("keeps the redundant belongings-and-pet disjunct alive", () => {
    // Two barriers via belongings+pet only, with dependents cleared: the
    // `barriers >= 2` clause and the disjunct agree, and both find 117.
    const ck = gate(checkWachinger, { agentColumns: { has_dependents: () => "0" } });
    expect(only(ck, "(f)").status).toBe("PASS");
    expect(only(ck, "(f)").detail).toContain(`high-barrier n=${FIXTURE_HIGH_BARRIER}`);
  });
});

// ---------------------------------------------------------------------------
// (g) E-census plausibility
// ---------------------------------------------------------------------------

describe("(g) E-census plausibility can fail", () => {
  it("goes red when the sampler is wired to the wrong parameter", () => {
    // realised_pet 0.117 against pHasPet 0.500: ~40 binomial SE out.
    const ck = gate(checkECensus, { manifest: { parameters: { pHasPet: 0.5 } } });
    expect(statuses(ck, "3 binomial SE")).toEqual(["FAIL"]);
    expect(only(ck, "3 binomial SE").detail).toBe(`n_sampled=${FIXTURE_N}`);
  });

  it("goes red when the decision_layer block is missing entirely", () => {
    const ck = gate(checkECensus, { manifest: { decisionLayer: null } });
    const check = only(ck, "(g)");
    expect(check.status).toBe("FAIL");
    expect(check.detail).toContain("no decision_layer block");
  });

  it("goes red on a zero sample size rather than dividing by it", () => {
    const ck = gate(checkECensus, { manifest: { decisionLayer: { n_sampled: 0 } } });
    expect(only(ck, "(g)").status).toBe("FAIL");
  });

  it("SKIPS — never passes — when the layer is switched off", () => {
    const ck = gate(checkECensus, { manifest: { decisionLayer: { enabled: false } } });
    expect(only(ck, "(g)").status).toBe("SKIP");
  });

  it("collapses to the 1e-4 print slack at target 1.0 (the E0-null knife edge)", () => {
    // variance = 1 x (1-1) = 0, so tol is ROUND_SLACK exactly. 1e-4 passes...
    const edge = gate(checkECensus, {
      manifest: {
        parameters: { pAwareInit: 1.0 },
        decisionLayer: { realised_aware: 0.9999 },
      },
    });
    expect(statuses(edge, "3 binomial SE")).toEqual(["PASS"]);
    // ...and 2e-4 does not. Nothing else about the run changed.
    const over = gate(checkECensus, {
      manifest: {
        parameters: { pAwareInit: 1.0 },
        decisionLayer: { realised_aware: 0.9998 },
      },
    });
    expect(statuses(over, "3 binomial SE")).toEqual(["FAIL"]);
  });

  it("(g.2) catches a census that disagrees with the CSV it summarises", () => {
    // 2e-4 off the CSV share: still trivially inside 3 SE, so (g.1) stays
    // green. Only the independent cross-check moves — which is the whole
    // reason the Python runs two sub-checks instead of one.
    const ck = gate(checkECensus, { manifest: { decisionLayer: { realised_pet: 0.1172 } } });
    expect(statuses(ck, "3 binomial SE")).toEqual(["PASS"]);
    expect(statuses(ck, "matches agents.csv columns")).toEqual(["FAIL"]);
  });

  it("(g.2) skips when there is no attribute block to cross-check against", () => {
    const ck = gate(checkECensus, { dropAgentColumns: ["has_pet"] });
    expect(statuses(ck, "matches agents.csv columns")).toEqual(["SKIP"]);
  });
});

// ---------------------------------------------------------------------------
// (h) / (i) manifest completeness
// ---------------------------------------------------------------------------

describe("(h)/(i) manifest completeness can fail", () => {
  it("(h) goes red when one of the 21 Phase-E parameters is missing", () => {
    const ck = gate(checkManifest, { manifest: { dropParameters: ["gammaVuln"] } });
    const check = only(ck, "21 Phase-E parameters");
    expect(check.status).toBe("FAIL");
    expect(check.detail).toContain("gammaVuln");
  });

  it("(h) goes red on a dirty working tree", () => {
    const ck = gate(checkManifest, { manifest: { sourceIntegrity: { git_working_tree_dirty: true } } });
    expect(only(ck, "git_working_tree_dirty").status).toBe("FAIL");
  });

  it('(h) treats "unknown" provenance as a FAILURE, not as clean', () => {
    // `dirty is False` is an identity test in the Python. A truthiness port
    // would let None through and a string-coercing port would let "unknown"
    // through; both would silently accept a run whose provenance is unknown.
    for (const value of ["unknown", null, 0]) {
      const ck = gate(checkManifest, {
        manifest: { sourceIntegrity: { git_working_tree_dirty: value } },
      });
      expect(only(ck, "git_working_tree_dirty").status, JSON.stringify(value)).toBe("FAIL");
    }
  });

  it("(h) goes red when the source_integrity block is absent altogether", () => {
    const ck = gate(checkManifest, { manifest: { sourceIntegrity: null } });
    expect(only(ck, "git_working_tree_dirty").status).toBe("FAIL");
  });

  it("(i) goes red when one of the 7 Scenario-E parameters is missing", () => {
    const ck = gate(checkSeManifest, { manifest: { dropParameters: ["pStuck"] } });
    const check = only(ck, "Scenario-E parameters in the manifest");
    expect(check.status).toBe("FAIL");
    expect(check.detail).toContain("pStuck");
  });

  it("(i) requires closureDraw for the worst family", () => {
    const ck = gate(checkSeManifest, { manifest: { dropParameters: ["closureDraw"] } });
    expect(only(ck, "records closureDraw").status).toBe("FAIL");
  });

  it("(i) does NOT require closureDraw at closuresCode 1 — the archived v1 runs lack it", () => {
    const ck = gate(checkSeManifest, {
      manifest: { parameters: { closuresCode: 1 }, dropParameters: ["closureDraw"] },
    });
    expect(ck.results.length).toBe(1);
    expect(ck.failed.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (k) closure census vs schedule
// ---------------------------------------------------------------------------

describe("(k) closure census vs schedule can fail", () => {
  it("goes red when the manifest has no closures block", () => {
    const ck = closureGate({ manifest: { closures: null } });
    expect(only(ck, "closures block present").status).toBe("FAIL");
  });

  it("k.1 goes red when the writer and the parameter disagree on the code", () => {
    const ck = closureGate({ manifest: { closures: { code: 1 } } });
    expect(only(ck, "closures.code == closuresCode param").status).toBe("FAIL");
  });

  it("k.2 goes red when a no-closure run carries closure state", () => {
    const ck = closureGate({
      manifest: {
        parameters: { closuresCode: 0 },
        closures: { code: 0, schedule_file: FIXTURE_SCHEDULE_FILE },
      },
    });
    expect(only(ck, "minimal block").status).toBe("FAIL");
    expect(ck.results.length).toBe(2);
  });

  it("k.3 goes red when the scheduled-edge count does not match the CSV", () => {
    const ck = closureGate({ manifest: { closures: { scheduled_undirected_edges: 5 } } });
    expect(only(ck, "scheduled edges == closure CSV rows").status).toBe("FAIL");
  });

  it("k.4 goes red on node-id drift between the schedule and the graph", () => {
    const ck = closureGate({ manifest: { closures: { matching_graph_edges: 3 } } });
    expect(only(ck, "matches a graph edge").status).toBe("FAIL");
  });

  it("k.5 counts DISTINCT undirected pairs, not CSV rows", () => {
    // A schedule with a repeated pair: 5 rows, 4 distinct pairs. The manifest
    // that reports the live network correctly says 4; a port that had copied
    // the row count would report 5 and this is the case that separates them.
    const duplicated = inMemoryScheduleSource({
      [FIXTURE_SCHEDULE_FILE]: [
        "node_a,node_b,activation_hour,label,kind",
        "100,200,12,ALPHA BRG,bridge",
        "300,400,12,BETA ST,arterial",
        "500,600,40,GAMMA ST,arterial",
        "700,800,40,DELTA AVE,local",
        "200,100,40,ALPHA BRG REVERSED,bridge",
        "",
      ].join("\r\n"),
    });
    const honest = closureGate(
      {
        manifest: {
          closures: {
            scheduled_undirected_edges: 5,
            matching_graph_edges: 5,
            blocked_edges_at_end: 4,
          },
        },
      },
      duplicated,
    );
    expect(honest.failed.length).toBe(0);

    const rowCount = closureGate(
      {
        manifest: {
          closures: {
            scheduled_undirected_edges: 5,
            matching_graph_edges: 5,
            blocked_edges_at_end: 5,
          },
        },
      },
      duplicated,
    );
    expect(only(rowCount, "blocked_edges_at_end").status).toBe("FAIL");
  });

  it("k.6 goes red when a wave failed to fire", () => {
    const ck = closureGate({ manifest: { closures: { closure_version_at_end: 3 } } });
    expect(only(ck, "closure_version_at_end == wave count").status).toBe("FAIL");
  });

  it("k.7 compares wave_hours as an ORDERED list", () => {
    const ck = closureGate({ manifest: { closures: { wave_hours: [40, 12] } } });
    expect(only(ck, "wave_hours match").status).toBe("FAIL");
  });

  it("k.7 goes red on a wrong wave hour even when the count is right", () => {
    const ck = closureGate({ manifest: { closures: { wave_hours: [12, 41] } } });
    expect(only(ck, "wave_hours match").status).toBe("FAIL");
  });

  it("goes red when the manifest names a schedule that is not there", () => {
    const ck = closureGate({}, inMemoryScheduleSource({}));
    expect(only(ck, "closure schedule file exists").status).toBe("FAIL");
    expect(ck.results.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// (l) counter identities
// ---------------------------------------------------------------------------

/** Counter columns as functions of the row index. */
function counters(spec: {
  blk: (i: number) => string;
  psh: (i: number) => string;
  rrt: (i: number) => string;
  stk: (i: number) => string;
  // `NonNullable`, not `FixtureOptions["agentColumns"]`: the property is
  // optional, so the indexed type carries `| undefined`, and under
  // `exactOptionalPropertyTypes` a value typed `T | undefined` cannot be passed
  // for an optional `T?`. The helper always returns a record, so widening the
  // annotation was the only thing wrong — no call site or assertion changes.
}): NonNullable<FixtureOptions["agentColumns"]> {
  return {
    blockages_encountered: spec.blk,
    push_throughs: spec.psh,
    reroutes: spec.rrt,
    stuck_events: spec.stk,
  };
}

describe("(l) counter identities can fail", () => {
  it("l.0 goes red when a closure-FREE run recorded obstacle activity", () => {
    const ck = gate(checkSeCounters, {
      manifest: { parameters: { closuresCode: 0 } },
      agentPatches: [{ row: 7, column: "reroutes", value: "1" }],
    });
    const check = only(ck, "closure-free run has all-zero counters");
    expect(check.status).toBe("FAIL");
    expect(check.detail).toContain("= 1");
  });

  it("l.1 goes red when a blockage resolved to no decision", () => {
    const ck = gate(checkSeCounters, {
      agentPatches: [{ row: 3, column: "blockages_encountered", value: "1" }],
    });
    expect(only(ck, "exactly one decision").status).toBe("FAIL");
  });

  it("l.1 is ROW-WISE — an aggregate that happens to balance still fails", () => {
    // Totals: blockages 2, pushes 2, reroutes 0. Sum-of-columns balances
    // perfectly; two individual residents' ledgers do not. A port that
    // compared totals would report this run green.
    const ck = gate(checkSeCounters, {
      agentColumns: counters({
        blk: (i) => (i === 0 || i === 1 ? "1" : "0"),
        psh: (i) => (i === 0 ? "2" : "0"),
        rrt: () => "0",
        stk: () => "0",
      }),
    });
    const check = only(ck, "exactly one decision");
    expect(check.status).toBe("FAIL");
    expect(check.detail).toContain("rows where blockages != pushes + reroutes: 2");
    expect(check.detail).toContain("blockages=2 pushes=2 reroutes=0");
  });

  it("l.2 goes red when a resident got stuck more often than it pushed", () => {
    const ck = gate(checkSeCounters, {
      agentColumns: counters({
        blk: (i) => (i === 0 ? "1" : "0"),
        psh: (i) => (i === 0 ? "1" : "0"),
        rrt: () => "0",
        stk: (i) => (i === 0 ? "2" : "0"),
      }),
    });
    expect(only(ck, "never exceed push-throughs").status).toBe("FAIL");
  });

  it("l.3 runs once pushes exist, and holds the stuck share to 3 binomial SE", () => {
    // 1,000 pushes; pStuck 0.3, so 3 SE is about 0.0435. The archive never
    // reaches this branch (zero blockage events everywhere), so it is exercised
    // here or nowhere.
    const withStuck = (stuckRows: number): Checks =>
      gate(checkSeCounters, {
        agentColumns: counters({
          blk: () => "1",
          psh: () => "1",
          rrt: () => "0",
          stk: (i) => (i < stuckRows ? "1" : "0"),
        }),
      });

    const plausible = withStuck(300);
    expect(only(plausible, "stuck share").status).toBe("PASS");
    expect(only(plausible, "stuck share").detail).toContain("stuck/pushes=0.3000");

    const implausible = withStuck(900);
    expect(only(implausible, "stuck share").status).toBe("FAIL");
    expect(implausible.results.length).toBe(3);
  });

  it("l.3 is NOT registered when there were no pushes — the archive's only path", () => {
    const ck = gate(checkSeCounters);
    expect(ck.results.length).toBe(2);
    expect(statuses(ck, "stuck share")).toEqual([]);
  });

  it("goes red when the counter block is absent from a Scenario-E run", () => {
    const ck = gate(checkSeCounters, { dropAgentColumns: ["stuck_events"] });
    const check = only(ck, "Scenario-E counters present");
    expect(check.status).toBe("FAIL");
    expect(check.detail).toContain("stuck_events");
  });
});

// ---------------------------------------------------------------------------
// The driver's own refusal to skip
// ---------------------------------------------------------------------------

describe("the driver refuses to skip gate (k) silently", () => {
  it("throws rather than running a Scenario-E arm with no schedule source", () => {
    expect(() => runWp8Gates(new Checks(), fixtureRun(), { arm: "se" })).toThrow(
      /needs a ClosureScheduleSource/u,
    );
  });

  it("records (f) as a SKIP for a null arm, so the check count stays honest", () => {
    const ck = new Checks();
    runWp8Gates(ck, fixtureRun(), { arm: "null" });
    expect(statuses(ck, "(f)")).toEqual(["SKIP"]);
    expect(ck.results.length).toBe(5);
  });
});
