/**
 * The skip-vs-fail policy, tested at both altitudes.
 *
 * 1. **Unit** — the decision function, the strict env parse and the banner
 *    contents, driven from an injected env and an injected filesystem probe.
 * 2. **End-to-end** — a real child `vitest run` over
 *    `fixtures/artifact-gate-proof.spec.ts`, once with the env var off and once
 *    with it on. This is the part that matters: WP9 requires gates provably able
 *    to fail, and a gate that quietly disappears cannot be proven able to fail.
 *    Asserting that `decideGate()` returns `"fail"` is an opinion; watching a
 *    vitest process exit non-zero with the banner in its output is evidence.
 *
 * The same run also proves the policy is not simply fail-everything: the fixture
 * carries a second gate whose artifact IS present, which must pass in both modes.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { collectFiles } from "../scan.js";

import {
  ARTIFACT_SOURCES,
  REQUIRE_ARTIFACTS_ENV,
  WEBSIM_ROOT,
  artifactGate,
  artifactGateReport,
  displayPath,
  gatedFixturePresent,
  parseRequireArtifacts,
  type ArtifactGateSpec,
} from "../artifact-gate.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const PROOF_CONFIG = path.join(HERE, "fixtures", "artifact-gate-proof.config.ts");
const VITEST_CLI = path.join(WEBSIM_ROOT, "node_modules", "vitest", "vitest.mjs");

const ABSENT = path.join(WEBSIM_ROOT, "pipeline", "out", "no-such-artifact", "missing.tsv");
const PRESENT = path.join(WEBSIM_ROOT, "package.json");

const spec = (over: Partial<ArtifactGateSpec> = {}): ArtifactGateSpec => ({
  gate: "unit:example",
  suite: "an example gated suite",
  evidence: "1,234 bit-identity comparisons against the certified dumps",
  artifacts: [{ source: "world-fixtures", path: ABSENT }],
  ...over,
});

/** A probe that answers from a set rather than the real filesystem. */
const probeWith =
  (present: readonly string[]) =>
  (p: string): boolean =>
    present.includes(p);

describe(`${REQUIRE_ARTIFACTS_ENV} parsing`, () => {
  it("is off when unset, and off for every documented falsy spelling", () => {
    expect(parseRequireArtifacts({})).toBe(false);
    for (const v of ["", "0", "false", "no", "off", "OFF", " False "]) {
      expect(parseRequireArtifacts({ [REQUIRE_ARTIFACTS_ENV]: v }), v).toBe(false);
    }
  });

  it("is on for every documented truthy spelling, case and space insensitive", () => {
    for (const v of ["1", "true", "yes", "on", "TRUE", " On "]) {
      expect(parseRequireArtifacts({ [REQUIRE_ARTIFACTS_ENV]: v }), v).toBe(true);
    }
  });

  it("throws on an unrecognised value instead of defaulting to the permissive one", () => {
    // A typo must not silently restore the behaviour this policy removes.
    for (const v of ["ture", "2", "y", "enabled", "strict"]) {
      expect(() => parseRequireArtifacts({ [REQUIRE_ARTIFACTS_ENV]: v }), v).toThrow(
        /not a recognised boolean/u,
      );
    }
  });
});

describe("artifactGate decision", () => {
  it("runs when every declared artifact is present, in both modes", () => {
    const s = spec({ artifacts: [{ source: "graph-asset", path: PRESENT }] });
    for (const env of [{}, { [REQUIRE_ARTIFACTS_ENV]: "1" }]) {
      const gate = artifactGate(s, env, probeWith([PRESENT]));
      expect(gate.satisfied).toBe(true);
      expect(gate.action).toBe("run");
      expect(gate.report).toBe("");
    }
  });

  it("skips loudly when an artifact is absent and the var is off", () => {
    const gate = artifactGate(spec(), {}, probeWith([]));
    expect(gate.satisfied).toBe(false);
    expect(gate.action).toBe("skip-loudly");
    expect(gate.report).not.toBe("");
  });

  it("fails when an artifact is absent and the var is on", () => {
    const gate = artifactGate(spec(), { [REQUIRE_ARTIFACTS_ENV]: "1" }, probeWith([]));
    expect(gate.action).toBe("fail");
  });

  it("treats a partially-present artifact set as absent, and names only what is missing", () => {
    const gate = artifactGate(
      spec({
        artifacts: [
          { source: "graph-asset", path: PRESENT },
          { source: "world-fixtures", path: ABSENT },
        ],
      }),
      {},
      probeWith([PRESENT]),
    );
    expect(gate.action).toBe("skip-loudly");
    expect(gate.missing.map((m) => m.path)).toEqual([ABSENT]);
    expect(gate.report).toContain(`MISSING:  [world-fixtures] ${displayPath(ABSENT)}`);
    expect(gate.report).toContain(`present:  [graph-asset] ${displayPath(PRESENT)}`);
  });
});

describe("the loud banner", () => {
  const banner = (strict: boolean): string =>
    artifactGateReport(spec(), [{ source: "world-fixtures", path: ABSENT, present: false }], strict);

  it("names the gate, the suite, the forgone evidence, the file and how to get it", () => {
    const text = banner(false);
    expect(text).toContain("unit:example");
    expect(text).toContain("an example gated suite");
    expect(text).toContain("1,234 bit-identity comparisons against the certified dumps");
    expect(text).toContain(displayPath(ABSENT));
    expect(text).toContain(ARTIFACT_SOURCES["world-fixtures"].produce);
  });

  it("says the run is degraded, and how to make the same state fatal", () => {
    const text = banner(false);
    expect(text).toContain("DEGRADED");
    expect(text).toContain(`set ${REQUIRE_ARTIFACTS_ENV}=1`);
  });

  it("says FAILING, not degraded, once the var is on", () => {
    const text = banner(true);
    expect(text).toContain("FAILING");
    expect(text).not.toContain("DEGRADED");
  });

  it("prefixes every line so a degraded run cannot be skimmed past", () => {
    for (const line of banner(false).split("\n")) {
      expect(line.startsWith("!!"), line).toBe(true);
    }
  });

  it("renders websim-internal and repo-external paths readably", () => {
    expect(displayPath(path.join(WEBSIM_ROOT, "pipeline", "out", "x.bin"))).toBe(
      "websim/pipeline/out/x.bin",
    );
    expect(displayPath(path.join(WEBSIM_ROOT, "..", "Geography", "batch"))).toBe(
      "<repo>/Geography/batch",
    );
  });
});

describe("gate specs are forced to be self-describing", () => {
  it("rejects a gate that will not say what it proves", () => {
    for (const over of [{ gate: " " }, { suite: "" }, { evidence: "  " }]) {
      expect(() => artifactGate(spec(over), {}, probeWith([]))).toThrow(/non-empty/u);
    }
  });

  it("rejects a gate with no artifacts — that is a plain describe()", () => {
    expect(() => artifactGate(spec({ artifacts: [] }), {}, probeWith([]))).toThrow(
      /declares no artifacts/u,
    );
  });

  it("rejects an unknown source and a relative probe path", () => {
    expect(() =>
      artifactGate(
        spec({ artifacts: [{ source: "not-a-source" as "graph-asset", path: ABSENT }] }),
        {},
        probeWith([]),
      ),
    ).toThrow(/unknown source/u);
    expect(() =>
      artifactGate(spec({ artifacts: [{ source: "graph-asset", path: "out/x.bin" }] }), {}, probeWith([])),
    ).toThrow(/relative path/u);
  });
});

describe("the artifact catalogue", () => {
  it("gives every source a unique id and a real answer to 'how do I get this?'", () => {
    const entries = Object.entries(ARTIFACT_SOURCES);
    expect(new Set(entries.map(([, s]) => s.id)).size).toBe(entries.length);
    for (const [key, source] of entries) {
      expect(source.id, key).toBe(key);
      expect(source.what.trim().length, key).toBeGreaterThan(20);
      expect(source.produce.trim().length, key).toBeGreaterThan(20);
      expect(typeof source.external, key).toBe("boolean");
    }
  });
});

describe("per-fixture probes inside a satisfied gate", () => {
  const gate = (strict: boolean) =>
    artifactGate(spec(), strict ? { [REQUIRE_ARTIFACTS_ENV]: "1" } : {}, probeWith([PRESENT]));

  it("reports a present member without complaint", () => {
    expect(
      gatedFixturePresent(gate(false), { source: "world-fixtures", path: PRESENT }, probeWith([PRESENT])),
    ).toBe(true);
  });

  it("returns false loudly when a member is absent and the var is off", () => {
    expect(
      gatedFixturePresent(gate(false), { source: "world-fixtures", path: ABSENT }, probeWith([])),
    ).toBe(false);
  });

  it("throws when a member is absent and the var is on, so the set cannot shrink quietly", () => {
    expect(() =>
      gatedFixturePresent(gate(true), { source: "world-fixtures", path: ABSENT }, probeWith([])),
    ).toThrow(/ARTIFACT-GATED FIXTURE ABSENT/u);
  });
});

// --- the policy cannot be bypassed -------------------------------------------

/**
 * Strip block and line comments so a *mention* of `describe.runIf(false)` in
 * prose (the checksums suite documents that trap) is not read as a use of it.
 * Naive about `//` inside string literals; no test file in this tree has one,
 * and a false positive here is a loud, easily-diagnosed failure rather than a
 * silent hole — which is the right way round for this particular check.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/(^|[^:])\/\/[^\n]*/gu, "$1");
}

/** The vitest skip surfaces this policy exists to replace. */
const BYPASS_CALLS =
  /\b(?:describe|it|test|suite)\s*\.\s*(?:skip|skipIf|runIf|todo)\s*(?:\.\s*\w+\s*)?\(/gu;

/**
 * The one exempt file: this one. It has to contain the bypass spellings, both as
 * the seeded fixture that proves the scan can fail and as the assertion text.
 * Same arrangement the claim linter uses for its own rule definitions. The list
 * is asserted below so it cannot grow without someone saying why.
 */
const BYPASS_SCAN_EXEMPT: readonly string[] = ["tools/test/artifact-gate.test.ts"];

describe("no test may skip outside the policy", () => {
  it("exempts exactly one file, and says why", () => {
    expect(BYPASS_SCAN_EXEMPT).toEqual(["tools/test/artifact-gate.test.ts"]);
  });

  it("finds no direct describe.skip / skipIf / runIf / todo in any test file", () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const rel of collectFiles(WEBSIM_ROOT)) {
      if (!rel.endsWith(".test.ts") && !rel.endsWith(".spec.ts")) {
        continue;
      }
      if (BYPASS_SCAN_EXEMPT.includes(rel)) {
        continue;
      }
      scanned += 1;
      const text = stripComments(readFileSync(path.join(WEBSIM_ROOT, rel), "utf8"));
      for (const m of text.matchAll(BYPASS_CALLS)) {
        offenders.push(`${rel}: ${m[0].replace(/\s+/gu, "")}`);
      }
    }
    // A gate reached through `describe.skipIf` is invisible in CI output and
    // cannot be flipped to failing by WEBSIM_REQUIRE_ARTIFACTS. Everything that
    // may not run goes through describeGated / itGated / gatedFixturePresent.
    expect(offenders, "use describeGated()/itGated() from tools/artifact-gate.ts").toEqual([]);
    // …and the scan actually visited the tree, rather than finding nothing
    // because the walk was broken.
    expect(scanned, "the bypass scan visited no test files").toBeGreaterThan(50);
  });

  it("is able to fail — the same scan flags a seeded bypass", () => {
    // Anti-vacuity: prove the regex above actually matches what it claims to.
    const seeded = stripComments(
      'describe.skipIf(!ready)("x", () => {});\nit.skip("y", () => {});\ntest.todo("z");\n',
    );
    expect([...seeded.matchAll(BYPASS_CALLS)].map((m) => m[0].replace(/\s+/gu, ""))).toEqual([
      "describe.skipIf(",
      "it.skip(",
      "test.todo(",
    ]);
    // …and that a comment mentioning one is not a match.
    expect([...stripComments("// describe.runIf(false) is describe.skip\n").matchAll(BYPASS_CALLS)])
      .toHaveLength(0);
  });
});

// --- the end-to-end proof ----------------------------------------------------

interface ChildRun {
  readonly status: number | null;
  readonly output: string;
}

function runProof(strict: boolean): ChildRun {
  // Annotated, not inferred: without it the object literal's type is narrowed to
  // just the two keys written here, and indexing it by REQUIRE_ARTIFACTS_ENV below
  // is an implicit-any error under `noImplicitAny`.
  const env: Record<string, string | undefined> = {
    ...process.env,
    NO_COLOR: "1",
    FORCE_COLOR: "0",
  };
  // The parent may itself be running under strict mode (the CI job that has the
  // artifacts does exactly that), so the off-case must clear it explicitly.
  delete env[REQUIRE_ARTIFACTS_ENV];
  if (strict) {
    env[REQUIRE_ARTIFACTS_ENV] = "1";
  }
  const child = spawnSync(process.execPath, [VITEST_CLI, "run", "--config", PROOF_CONFIG], {
    cwd: WEBSIM_ROOT,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { status: child.status, output: `${child.stdout ?? ""}\n${child.stderr ?? ""}` };
}

describe("end-to-end: the policy is provably able to fail", () => {
  it(
    "skips loudly and stays green when the artifact is absent and the var is off",
    () => {
      const run = runProof(false);
      expect(run.status, run.output).toBe(0);
      // the gate whose artifact exists still ran and passed
      expect(run.output).toMatch(/1 passed/u);
      // the gate whose artifact is hidden was SKIPPED, not passed
      expect(run.output).toMatch(/skipped/iu);
      // and it said so, loudly, naming the artifact and the forgone evidence
      expect(run.output).toContain("ARTIFACT-GATED SUITE SKIPPED");
      expect(run.output).toContain("proof:absent");
      expect(run.output).toContain("deliberately-absent.tsv");
      expect(run.output).toContain("a bit-identity comparison against an oracle dump");
      expect(run.output).toContain(`set ${REQUIRE_ARTIFACTS_ENV}=1`);
    },
    180_000,
  );

  it(
    "turns the very same state red once the var is on",
    () => {
      const run = runProof(true);
      expect(run.status, run.output).not.toBe(0);
      expect(run.output).toContain(`CANNOT RUN and ${REQUIRE_ARTIFACTS_ENV} is set`);
      expect(run.output).toContain("proof:absent");
      expect(run.output).toContain("deliberately-absent.tsv");
      expect(run.output).toMatch(/1 failed/u);
      // and the satisfied gate is unaffected — strict mode is not fail-everything
      expect(run.output).toMatch(/1 passed/u);
    },
    180_000,
  );
});
