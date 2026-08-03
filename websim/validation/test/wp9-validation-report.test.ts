/**
 * wp9-validation-report.test.ts — the shipped artifact, and its validator.
 *
 * `VALIDATION_REPORT.json` is read by the UI badge to decide ARCHIVE-VALIDATED
 * (plan §5.4). It is therefore consumed by code that did not write it, so the
 * only thing standing between a typo and a badge that lies is the validator —
 * and a validator nobody has watched fail is decoration.
 *
 * Every case below takes a report that IS valid and breaks it in one way, then
 * requires the validator to complain about **that** thing. The two that matter
 * most are not type checks at all:
 *
 *  - `overall` must be the roll-up of the three tier verdicts the same document
 *    carries. A report claiming green over a red Tier-4 census is the exact lie
 *    this work package exists to prevent.
 *  - a configuration may not carry `unexplained` findings and a verdict other
 *    than `UNEXPLAINED`. "Explained it away in prose" has to be unrepresentable.
 *
 * Runs in a clean clone: no archive, no packed graph, no engine.
 */

import { describe, expect, it } from "vitest";

import type { CheckResult } from "../src/harness/checks.js";
import type { Tier4Attribution } from "../src/harness/tier4-census.js";
import type { ReplayedRun } from "../src/harness/working-set-replay.js";
import {
  buildValidationReport,
  configSha256,
  ENVIRONMENT_CHECK_SUFFIX,
  rollUp,
  tier4Caution,
  validateValidationReport,
  VALIDATION_REPORT_SCHEMA,
  type ReportInputs,
  type ValidationReport,
} from "../src/report/index.js";
import { PARAM_NAMES, parseRunConfig, PRESETS } from "@websim/shared";

// ---------------------------------------------------------------------------
// fixtures: a minimal but structurally real report
// ---------------------------------------------------------------------------

const CONFIG = parseRunConfig(PRESETS.A_present_day, "preset A_present_day");

function replayed(runDir: string, cls: ReplayedRun["target"]["cls"] = "pre-e"): ReplayedRun {
  return {
    target: { runDir, archive: runDir.split("/")[0]!, run: runDir.split("/")[1]!, cls, inWorkingSet: true, why: "fixture" },
    built: {
      config: CONFIG,
      fromManifest: PARAM_NAMES.slice(0, 11),
      fromFallback: { closuresCode: 0 },
      arm: "A",
      scenarioName: "A_present_day_real_locations",
      seed: 42,
    },
  } as unknown as ReplayedRun;
}

function pass(name: string): CheckResult {
  return { name, status: "PASS", detail: "", lines: [] };
}
function fail(name: string, detail = "broken"): CheckResult {
  return { name, status: "FAIL", detail, lines: [] };
}

/**
 * `saturation` is overridable because the Tier-4 caution is derived from it:
 * the regime a configuration was measured in is exactly what the caution has to
 * report, so the tests need to be able to move it.
 */
function attribution(
  runDir: string,
  verdict: Tier4Attribution["verdict"],
  saturation: Partial<Tier4Attribution["saturation"]> = {},
): Tier4Attribution {
  const unexplained = verdict === "UNEXPLAINED" ? ["a divergence outside the declared channel"] : [];
  return {
    runDir,
    agents: {
      table: "agents.csv",
      keyColumn: "agent_id",
      rows: 6842,
      keysPortOnly: [],
      keysArchiveOnly: [],
      comparedColumns: [],
      excludedColumns: [],
      columnsPortOnly: [],
      columnsArchiveOnly: [],
      comparedCells: 355784,
      identicalCells: verdict === "EXACT" ? 355784 : 355000,
      rowsIdentical: verdict === "EXACT" ? 6842 : 6728,
      perColumn: [],
      divergentColumns: [],
    },
    shelters: {
      table: "shelters.csv",
      keyColumn: "shelter_id",
      rows: 36,
      keysPortOnly: [],
      keysArchiveOnly: [],
      comparedColumns: [],
      excludedColumns: [],
      columnsPortOnly: [],
      columnsArchiveOnly: [],
      comparedCells: 360,
      identicalCells: 360,
      rowsIdentical: 36,
      perColumn: [],
      divergentColumns: [],
    },
    saturation: {
      capacityRefusals: 500,
      policyRefusals: 0,
      refusedAllFull: 4754,
      sheltered: 2060,
      designedBeds: 2234,
      saturatedSites: 36,
      sites: 36,
      capacityBinds: true,
      ...saturation,
    },
    partition: {
      neverRefused: 6000,
      neverRefusedBitIdentical: 6000,
      neverRefusedDivergent: 0,
      neverRefusedDivergentColumns: {},
      doorContested: 842,
      doorContestedDivergent: 296,
      sameAssignment: 6728,
      sameAssignmentDivergent: 152,
      differentAssignment: 114,
      buildTimeColumnsDivergent: {},
    },
    order: null,
    envelope: { applicable: false, reason: "fixture" },
    verdict,
    unexplained,
  };
}

function inputs(over: Partial<ReportInputs> = {}): ReportInputs {
  return {
    generatedUtc: "2026-08-02T00:00:00.000Z",
    producedBy: "test",
    build: { portCommit: "deadbeef", gitWorkingTreeDirty: false, node: "v22.0.0" },
    archive: { present: true, source: "default" },
    assetsManifestPath: "/nonexistent/assets-manifest.json",
    goldenSummariesDir: "/nonexistent/golden",
    workingSetManifestPath: "/nonexistent/working-set.manifest.json",
    workingSetPayloadDir: "/nonexistent/data",
    tier2: { status: "green", note: "fixture" },
    tier3: [{ run: replayed("present-day-three-arm/A-seed42"), results: [pass("(t3) fine")] }],
    crossArm: { members: ["present-day-three-arm/A-seed42"], results: [pass("(2026) fine")] },
    tier4: [attribution("present-day-three-arm/A-seed42", "EXACT")],
    ...over,
  };
}

/** Deep-clone so a corrosion case cannot leak into the next one. */
function mutate(report: ValidationReport, f: (r: Record<string, unknown>) => void): unknown {
  const copy = JSON.parse(JSON.stringify(report)) as Record<string, unknown>;
  f(copy);
  return copy;
}

// ---------------------------------------------------------------------------

describe("the emitted report is valid, and says what it measured", () => {
  it("a green run validates and carries the badge list", () => {
    const report = buildValidationReport(inputs());
    expect(validateValidationReport(report)).toEqual([]);
    expect(report.schema).toBe(VALIDATION_REPORT_SCHEMA);
    expect(report.overall).toBe("green");
    expect(report.archive_validated).toEqual(["present-day-three-arm/A-seed42"]);
    // The caution is not decoration, and it is not prose written beside the
    // numbers either: it is computed from them. See the dedicated describe
    // block below for why that changed and what it now has to survive.
    expect(report.tiers.tier4.caution).toBe(tier4Caution(report.tiers.tier4.configs));
    expect(report.tiers.tier4.caution).toMatch(/An EXACT verdict does NOT generalise\./u);
  });

  it("counts the cross-arm checks in the Tier-3 census rather than losing them", () => {
    const report = buildValidationReport(inputs());
    expect(report.tiers.tier3.checks.total).toBe(2);
    expect(report.tiers.tier3.cross_arm.members).toEqual(["present-day-three-arm/A-seed42"]);
  });

  it("Tier 3 is DEGRADED, not green, when the cross-arm set was never scored", () => {
    const { crossArm: _dropped, ...rest } = inputs();
    const report = buildValidationReport(rest as ReportInputs);
    expect(report.tiers.tier3.cross_arm.status).toBe("degraded");
    expect(report.tiers.tier3.status).toBe("degraded");
    expect(report.overall).toBe("degraded");
    expect(report.archive_validated).toEqual([]);
    expect(validateValidationReport(report)).toEqual([]);
  });

  it("a red cross-arm identity turns Tier 3 red and empties the badge list", () => {
    const report = buildValidationReport(
      inputs({ crossArm: { members: ["x"], results: [fail("(2026) population hash differs")] } }),
    );
    expect(report.tiers.tier3.status).toBe("red");
    expect(report.overall).toBe("red");
    expect(report.archive_validated).toEqual([]);
  });

  it("an UNEXPLAINED Tier-4 verdict is release-blocking for the whole build", () => {
    const report = buildValidationReport(
      inputs({
        tier3: [
          { run: replayed("present-day-three-arm/A-seed42"), results: [pass("(t3) fine")] },
          { run: replayed("present-day-three-arm/B-seed42"), results: [pass("(t3) fine")] },
        ],
        tier4: [
          attribution("present-day-three-arm/A-seed42", "UNEXPLAINED"),
          attribution("present-day-three-arm/B-seed42", "EXACT"),
        ],
      }),
    );
    expect(report.tiers.tier4.status).toBe("red");
    expect(report.tiers.tier4.unexplained).toBe(1);
    expect(report.overall).toBe("red");
    // Not just the offending config: Tier 4 is a claim about the build.
    expect(report.archive_validated).toEqual([]);
  });

  it("config_sha256 is a function of the 41 executed parameters and nothing else", () => {
    const a = configSha256(CONFIG);
    expect(a).toMatch(/^[0-9a-f]{64}$/u);
    expect(configSha256({ ...CONFIG })).toBe(a);
    expect(configSha256({ ...CONFIG, randomSeed: 43 })).not.toBe(a);
  });

  it("missing asset/golden/working-set inputs degrade to a stated placeholder, never to a fake hash", () => {
    const report = buildValidationReport(inputs());
    expect(report.assets.manifest_sha256).toBe("unavailable");
    expect(report.assets.entries).toEqual([]);
    expect(report.golden_summaries).toEqual([]);
    expect(report.working_set.manifest_sha256).toBe("unavailable");
    expect(report.working_set.payload_present).toBe(false);
  });
});

describe("gate (h)'s provenance sub-check is classified, not excused", () => {
  const hCheck = `(h) [TS present-day-three-arm/A-seed42] ${ENVIRONMENT_CHECK_SUFFIX}`;

  it("a dirty tree earns NO badge even when every tier is green", () => {
    const report = buildValidationReport(
      inputs({ build: { portCommit: "deadbeef", gitWorkingTreeDirty: true, node: "v22.0.0" } }),
    );
    expect(report.overall).toBe("green");
    expect(report.tiers.tier3.status).toBe("green");
    // …and yet:
    expect(report.archive_validated).toEqual([]);
  });

  it("on a DIRTY tree it is an environment failure and the config stays green", () => {
    const report = buildValidationReport(
      inputs({
        build: { portCommit: "deadbeef", gitWorkingTreeDirty: true, node: "v22.0.0" },
        tier3: [{ run: replayed("present-day-three-arm/A-seed42"), results: [pass("(t3) fine"), fail(hCheck)] }],
      }),
    );
    const config = report.tiers.tier3.configs[0]!;
    expect(config.status).toBe("green");
    expect(config.failures).toEqual([]);
    expect(config.environment_failures).toHaveLength(1);
    // Still counted. A classified failure is not a hidden one.
    expect(config.checks.failed).toBe(1);
    expect(validateValidationReport(report)).toEqual([]);
  });

  it("on a CLEAN tree the very same failure is a model failure and turns the config red", () => {
    const report = buildValidationReport(
      inputs({
        build: { portCommit: "deadbeef", gitWorkingTreeDirty: false, node: "v22.0.0" },
        tier3: [{ run: replayed("present-day-three-arm/A-seed42"), results: [pass("(t3) fine"), fail(hCheck)] }],
      }),
    );
    const config = report.tiers.tier3.configs[0]!;
    expect(config.status).toBe("red");
    expect(config.failures).toHaveLength(1);
    expect(config.environment_failures).toEqual([]);
    expect(report.overall).toBe("red");
  });

  it("no other check name can be classified as environment, even on a dirty tree", () => {
    const report = buildValidationReport(
      inputs({
        build: { portCommit: "deadbeef", gitWorkingTreeDirty: true, node: "v22.0.0" },
        tier3: [
          {
            run: replayed("present-day-three-arm/A-seed42"),
            results: [fail("(t3) realised marginals EQUAL the archive (not close)")],
          },
        ],
      }),
    );
    expect(report.tiers.tier3.configs[0]!.environment_failures).toEqual([]);
    expect(report.tiers.tier3.configs[0]!.status).toBe("red");
  });
});

describe("the validator can fail — one break at a time", () => {
  const valid = buildValidationReport(inputs());

  it("rejects a non-object and a wrong schema string", () => {
    expect(validateValidationReport(null)).toEqual(["root: expected an object"]);
    expect(
      validateValidationReport(mutate(valid, (r) => { r["schema"] = "something/else"; })).join(),
    ).toMatch(/^schema: expected/u);
  });

  it("rejects a deleted required field", () => {
    for (const key of ["generated_utc", "build", "archive", "assets", "working_set", "tiers"]) {
      const problems = validateValidationReport(mutate(valid, (r) => { delete r[key]; }));
      expect(problems.join("\n"), key).toMatch(new RegExp(key, "u"));
    }
  });

  it("rejects a check census whose parts do not sum to its total", () => {
    const problems = validateValidationReport(
      mutate(valid, (r) => {
        ((r["tiers"] as Record<string, Record<string, Record<string, number>>>)["tier3"]!["checks"]!)["total"] = 99;
      }),
    );
    expect(problems.join("\n")).toMatch(/passed\+failed\+skipped = 2 but total = 99/u);
  });

  it("rejects a report whose `overall` disagrees with its own tier verdicts", () => {
    const problems = validateValidationReport(
      mutate(valid, (r) => {
        ((r["tiers"] as Record<string, Record<string, unknown>>)["tier4"]!)["status"] = "red";
      }),
    );
    expect(problems.join("\n")).toMatch(/overall says "green" but the three tier verdicts/u);
  });

  it("rejects a configuration that carries unexplained findings under a non-UNEXPLAINED verdict", () => {
    const problems = validateValidationReport(
      mutate(valid, (r) => {
        const configs = (r["tiers"] as Record<string, Record<string, unknown[]>>)["tier4"]!["configs"]!;
        (configs[0] as Record<string, unknown>)["unexplained"] = ["quietly explained away"];
      }),
    );
    expect(problems.join("\n")).toMatch(/release-blocking/u);
  });

  it("rejects an UNEXPLAINED verdict with an empty findings list", () => {
    const problems = validateValidationReport(
      mutate(valid, (r) => {
        const configs = (r["tiers"] as Record<string, Record<string, unknown[]>>)["tier4"]!["configs"]!;
        (configs[0] as Record<string, unknown>)["verdict"] = "UNEXPLAINED";
      }),
    );
    expect(problems.join("\n")).toMatch(/verdict UNEXPLAINED with an empty unexplained list/u);
  });

  it("rejects a tier4 summary count that disagrees with the per-config verdicts", () => {
    const problems = validateValidationReport(
      mutate(valid, (r) => {
        ((r["tiers"] as Record<string, Record<string, unknown>>)["tier4"]!)["unexplained"] = 3;
      }),
    );
    expect(problems.join("\n")).toMatch(/says 3 but 0 configuration\(s\) carry that verdict/u);
  });

  it("rejects a config whose status disagrees with its own failure list", () => {
    const problems = validateValidationReport(
      mutate(valid, (r) => {
        const configs = (r["tiers"] as Record<string, Record<string, unknown[]>>)["tier3"]!["configs"]!;
        (configs[0] as Record<string, unknown>)["failures"] = [{ name: "x", detail: "y" }];
      }),
    );
    expect(problems.join("\n")).toMatch(/status is green with 1 model failure/u);
  });

  it("rejects an environment excuse on a clean tree", () => {
    const problems = validateValidationReport(
      mutate(valid, (r) => {
        const configs = (r["tiers"] as Record<string, Record<string, unknown[]>>)["tier3"]!["configs"]!;
        (configs[0] as Record<string, unknown>)["environment_failures"] = [{ name: "x", detail: "y" }];
      }),
    );
    expect(problems.join("\n")).toMatch(/no environment excuse for a failing check/u);
  });

  it("rejects a malformed SHA and an empty configuration list", () => {
    expect(
      validateValidationReport(
        mutate(valid, (r) => {
          const configs = (r["tiers"] as Record<string, Record<string, unknown[]>>)["tier3"]!["configs"]!;
          (configs[0] as Record<string, unknown>)["config_sha256"] = "NOTAHASH";
        }),
      ).join("\n"),
    ).toMatch(/config_sha256: expected 64 lowercase hex/u);
    expect(
      validateValidationReport(
        mutate(valid, (r) => {
          (r["tiers"] as Record<string, Record<string, unknown[]>>)["tier3"]!["configs"] = [];
        }),
      ).join("\n"),
    ).toMatch(/a report over zero configurations is not evidence/u);
  });
});

describe("the roll-up rule", () => {
  it("red beats degraded beats green — a tier that could not run is never green", () => {
    expect(rollUp(["green", "green", "green"])).toBe("green");
    expect(rollUp(["green", "degraded", "green"])).toBe("degraded");
    expect(rollUp(["green", "degraded", "red"])).toBe("red");
    expect(rollUp(["red", "green", "green"])).toBe("red");
  });
});

// ---------------------------------------------------------------------------
// the caution must agree with the numbers printed beside it
// ---------------------------------------------------------------------------

/**
 * The defect this block exists for, stated plainly so it cannot ship twice.
 *
 * `VALIDATION_REPORT.json`'s `tiers.tier4.caution` said of the ER / SE / SE2
 * runs: "…no shelter saturates, so the shuffle channel has nothing to act on."
 * That is false. `docs/runs/scenario-e/SE-E18-seed42/shelters.csv` has 9 of its
 * 36 sites at or above capacity; `docs/runs/phase-e/ER-A-n6842-seed42` has 8.
 * The report's OWN adjacent fields already said so — `capacity_binds: true` on
 * all seventeen configurations, `saturated_sites` 8-12 of 36 and
 * `capacity_refusals` 291-443 on the five EXACT ones.
 *
 * It shipped because **nothing asserted that the report's prose agreed with the
 * numbers emitted beside it**. That is the class, and this block closes it with
 * two mechanisms — the second being the one that generalises:
 *
 *  1. a targeted rule that names the contradiction in words, so the failure is
 *     a bug report rather than a character offset; and
 *  2. exact re-derivation. The caution is GENERATED from the same document's
 *     fields, and `validateValidationReport` recomputes it from the untyped
 *     document and rejects any mismatch. Every number in the sentence therefore
 *     has a field beside it that has to agree — including in an artifact edited
 *     by hand after emission, which a check on the emitter alone would miss.
 *
 * Each case flips exactly one measurement (or one phrase) and requires the
 * validator to complain about that thing. They all start from a report asserted
 * clean, so none of them is vacuous.
 */
describe("the Tier-4 caution cannot contradict its own document", () => {
  const valid = buildValidationReport(inputs());

  /** The non-vacuity anchor every mutation case below depends on. */
  it("the emitted report is clean to begin with", () => {
    expect(validateValidationReport(valid)).toEqual([]);
  });

  it("says doors saturate — with the numbers — when the measurements say they do", () => {
    const c = valid.tiers.tier4.caution;
    const cfg = valid.tiers.tier4.configs[0]!;
    expect(cfg.capacity_binds).toBe(true);
    // The corrected claim, and the mechanism behind it.
    expect(c).toMatch(/It is NOT that capacity fails to bind/u);
    expect(c).toMatch(/the within-tick shuffle-order channel is ARMED, not inert/u);
    expect(c).toMatch(/MORE notable, not less/u);
    expect(c).toMatch(/a resident refused at\s+one full door is admitted at another/u);
    // …and it must not contain the sentence that shipped.
    expect(c).not.toMatch(/no shelter saturates/iu);
    // The figures are the document's own, not literals in a string constant.
    expect(c).toContain(`${String(cfg.saturated_sites)} of ${String(cfg.sites)} shelter sites`);
    expect(c).toContain(`${String(cfg.capacity_refusals)} residents are turned away at a full door`);
    expect(c).toContain("REFUSED_ALL_FULL = 4,754");
  });

  it("the sentence moves when the measurement moves", () => {
    const other = buildValidationReport(
      inputs({
        tier4: [
          attribution("present-day-three-arm/A-seed42", "EXACT", {
            saturatedSites: 9,
            capacityRefusals: 291,
            refusedAllFull: 1,
          }),
        ],
      }),
    );
    expect(other.tiers.tier4.caution).toContain("9 of 36 shelter sites");
    expect(other.tiers.tier4.caution).toContain("291 residents are turned away");
    expect(other.tiers.tier4.caution).toContain("REFUSED_ALL_FULL = 1,");
    expect(other.tiers.tier4.caution).not.toBe(valid.tiers.tier4.caution);
    expect(validateValidationReport(other)).toEqual([]);
  });

  // --- the flips: one measurement at a time --------------------------------

  const flip = (key: string, to: unknown): readonly string[] =>
    validateValidationReport(
      mutate(valid, (r) => {
        const configs = (r["tiers"] as Record<string, Record<string, unknown[]>>)["tier4"]!["configs"]!;
        (configs[0] as Record<string, unknown>)[key] = to;
      }),
    );

  it("REJECTS the document when capacity_binds is flipped under the caution", () => {
    expect(flip("capacity_binds", false).join("\n")).toMatch(
      /tiers\.tier4\.caution does not match the text its own measurements produce/u,
    );
  });

  it("REJECTS the document when saturated_sites is edited, and says where they part", () => {
    const joined = flip("saturated_sites", 0).join("\n");
    expect(joined).toMatch(/caution does not match/u);
    expect(joined).toMatch(/document has "[^"]*36 of 36 shelter sites/u);
    expect(joined).toMatch(/the measurements give "[^"]*0 of 36 shelter sites/u);
  });

  it("REJECTS the document when capacity_refusals is edited", () => {
    expect(flip("capacity_refusals", 1).join("\n")).toMatch(/caution does not match/u);
  });

  it("REJECTS the document when refused_all_full is edited", () => {
    expect(flip("refused_all_full", 12345).join("\n")).toMatch(/caution does not match/u);
  });

  it("REJECTS the document when sites is edited", () => {
    expect(flip("sites", 46).join("\n")).toMatch(/caution does not match/u);
  });

  // --- the exact sentence that shipped -------------------------------------

  it("REJECTS the sentence that shipped, naming the fields that contradict it", () => {
    const problems = validateValidationReport(
      mutate(valid, (r) => {
        ((r["tiers"] as Record<string, Record<string, unknown>>)["tier4"]!)["caution"] =
          "An EXACT verdict does NOT generalise. The ER / SE / SE2 configurations reproduce " +
          "per-agent rows exactly partly because they shelter 1,215-1,307 residents against arm " +
          "A's 2,234 beds with REFUSED_ALL_FULL = 1: no shelter saturates, so the within-tick " +
          "order channel has nothing to act on.";
      }),
    );
    const joined = problems.join("\n");
    expect(joined).toMatch(/caution claims "no shelter saturates" while 1 of 1 configuration\(s\)/u);
    expect(joined).toMatch(/capacity_binds=true, saturated_sites 36 of 36 and capacity_refusals 500/u);
    expect(joined).toMatch(/are different facts/u);
    // …and the re-derivation catches it independently of the phrase list.
    expect(joined).toMatch(/caution does not match/u);
  });

  it("catches the same denial however it is phrased", () => {
    for (const phrase of [
      "nothing saturated in these runs",
      "no door ever fills",
      "capacity does not bind",
      "no site reaches capacity",
      "no shelters saturate",
    ]) {
      const problems = validateValidationReport(
        mutate(valid, (r) => {
          ((r["tiers"] as Record<string, Record<string, unknown>>)["tier4"]!)["caution"] = `Fine, but ${phrase}.`;
        }),
      );
      expect(problems.join("\n"), phrase).toMatch(/caution claims/u);
    }
  });

  // --- the other branch is real, not decoration ----------------------------

  it("states the ORIGINAL claim — correctly — when nothing actually saturates", () => {
    const roomy = buildValidationReport(
      inputs({
        tier3: [{ run: replayed("phase-e/ER-A-n6842-seed42"), results: [pass("(t3) fine")] }],
        crossArm: { members: ["phase-e/ER-A-n6842-seed42"], results: [pass("(2026) fine")] },
        tier4: [
          attribution("phase-e/ER-A-n6842-seed42", "EXACT", {
            saturatedSites: 0,
            capacityRefusals: 0,
            refusedAllFull: 0,
            capacityBinds: false,
          }),
        ],
      }),
    );
    const c = roomy.tiers.tier4.caution;
    expect(c).toMatch(/no door ever filling \(capacity_binds false\)/u);
    expect(c).toMatch(/the order channel genuinely had nothing to act on/u);
    // The claim is now conditional on the measurement, not asserted over it.
    expect(c).not.toMatch(/is ARMED, not inert/u);
    // A contradiction rule that fired on the TRUE statement would be noise.
    const problems = validateValidationReport(roomy);
    expect(problems).toEqual([]);
  });

  it("contrasts the diverging regime using ITS measurements, not the exact one's", () => {
    const mixed = buildValidationReport(
      inputs({
        tier3: [
          { run: replayed("scenario-e/SE-E18-seed42"), results: [pass("(t3) fine")] },
          { run: replayed("present-day-three-arm/A-seed42"), results: [pass("(t3) fine")] },
        ],
        tier4: [
          attribution("scenario-e/SE-E18-seed42", "EXACT", {
            saturatedSites: 9,
            capacityRefusals: 291,
            refusedAllFull: 1,
          }),
          attribution("present-day-three-arm/A-seed42", "ORDER-CHANNEL", {
            saturatedSites: 33,
            capacityRefusals: 17167,
            refusedAllFull: 4754,
          }),
        ],
      }),
    );
    const c = mixed.tiers.tier4.caution;
    expect(c).toContain("9 of 36 shelter sites");
    expect(c).toContain("REFUSED_ALL_FULL = 1,");
    expect(c).toContain("saturate 33 of 36 sites, record 17,167 capacity refusals");
    expect(c).toContain("leave 4,754 residents in REFUSED_ALL_FULL");
    expect(validateValidationReport(mixed)).toEqual([]);
  });
});
