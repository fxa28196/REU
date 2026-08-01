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

  /**
   * The banner's ONLY job, beyond naming what is missing, is to tell the reader
   * the command that materialises it. The WP8 oracles shipped without catalogue
   * entries, so their gates declared `source: "world-fixtures"` and every banner
   * told a developer missing the 477 MB decision dump to run
   * `dump-world-fixtures.ps1` — a command that produces a different artifact
   * entirely and leaves the gate exactly as unsatisfied as before. A banner that
   * confidently prints the wrong remedy is worse than no banner.
   */
  it("names the real producer for each WP8 oracle, not a borrowed one", () => {
    expect(ARTIFACT_SOURCES["decision-fixtures"].produce).toContain("dump-decision-trace.ps1");
    expect(ARTIFACT_SOURCES["closure-fixtures"].produce).toContain("dump-closure-fixtures.ps1");
    // …and they are genuinely distinct from the source they used to borrow.
    for (const id of ["decision-fixtures", "closure-fixtures"] as const) {
      expect(ARTIFACT_SOURCES[id].produce, id).not.toBe(
        ARTIFACT_SOURCES["world-fixtures"].produce,
      );
    }
  });

  it("renders that producer into the banner a missing decision dump prints", () => {
    const missing = path.join(WEBSIM_ROOT, "pipeline", "out", "decision-fixtures", "hour.tsv");
    const text = artifactGateReport(
      spec({
        gate: "engine:wp8-decision-oracle",
        artifacts: [{ source: "decision-fixtures", path: missing }],
      }),
      [{ source: "decision-fixtures", path: missing, present: false }],
      false,
    );
    expect(text).toContain("produce: powershell -File websim/pipeline/java-exporter/dump-decision-trace.ps1");
    expect(text).not.toContain("dump-world-fixtures.ps1");
  });
});

/**
 * A ref may not declare one source while pointing into another's directory.
 * That is how the wrong-command banner arose: the ref carried the right *path*
 * and the wrong *source*, and nothing connected the two. The types cannot catch
 * it — every source id is a valid `ArtifactSourceId` for every path — so it is
 * caught here, over the tree's own text.
 */
describe("no gate borrows a source it does not point at", () => {
  /** Directory under `pipeline/out/` → the source id a ref into it must use. */
  const OWNED_DIRS: ReadonlyMap<string, string> = new Map([
    ["decision-fixtures", "decision-fixtures"],
    ["closure-fixtures", "closure-fixtures"],
  ]);
  /** `source: "x"` followed, within one object literal, by the path field. */
  const REF_LITERAL = /source:\s*"([a-z0-9-]+)"[\s\S]{0,240}?path:\s*([^\n,]+)/gu;

  it("matches every ref's declared source to the directory its path names", () => {
    const offenders: string[] = [];
    let refs = 0;
    let owned = 0;
    for (const rel of collectFiles(WEBSIM_ROOT)) {
      if (!rel.endsWith(".ts") || rel.startsWith("tools/")) {
        continue;
      }
      const text = readFileSync(path.join(WEBSIM_ROOT, rel), "utf8");
      for (const m of text.matchAll(REF_LITERAL)) {
        refs += 1;
        const declared = m[1] ?? "";
        const pathExpr = m[2] ?? "";
        for (const [dir, required] of OWNED_DIRS) {
          // Matches both the literal directory name and the SCREAMING_CASE
          // constant the helpers build their paths from.
          const names = pathExpr.includes(dir) || pathExpr.includes(constantFor(dir));
          if (!names) {
            continue;
          }
          owned += 1;
          if (declared !== required) {
            offenders.push(`${rel}: path names ${dir}/ but declares source "${declared}"`);
          }
        }
      }
    }
    expect(offenders, "the banner would print the wrong produce: command").toEqual([]);
    // Anti-vacuity: the scan really did visit refs, and really did reach the
    // WP8 oracle refs rather than passing because it matched nothing.
    expect(refs, "the ref scan matched no artifact refs at all").toBeGreaterThan(10);
    expect(owned, "the ref scan never reached a WP8 oracle ref").toBeGreaterThan(0);
  });

  it("is able to fail — the same scan flags the borrow that was there", () => {
    const seeded = 'x = { source: "world-fixtures", label: n, path: `${DECISION_FIXTURE_DIR}/${n}` }';
    const m = [...seeded.matchAll(REF_LITERAL)];
    expect(m).toHaveLength(1);
    expect(m[0]?.[1]).toBe("world-fixtures");
    expect(m[0]?.[2]).toContain(constantFor("decision-fixtures"));
  });
});

/** `decision-fixtures` → `DECISION_FIXTURE_DIR`, the helpers' naming convention. */
function constantFor(dir: string): string {
  return `${dir.replace(/-fixtures$/u, "").toUpperCase()}_FIXTURE_DIR`;
}

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

/**
 * Each mode is spawned once and shared. Three tests assert on the same two child
 * runs, and a vitest boot is ~350 ms of the budget that could otherwise go to
 * the oracle suites.
 */
const runCache = new Map<boolean, ChildRun>();
function proof(strict: boolean): ChildRun {
  let run = runCache.get(strict);
  if (run === undefined) {
    run = runProof(strict);
    runCache.set(strict, run);
  }
  return run;
}

describe("end-to-end: the policy is provably able to fail", () => {
  it(
    "skips loudly and stays green when the artifact is absent and the var is off",
    () => {
      const run = proof(false);
      expect(run.status, run.output).toBe(0);
      // the gate whose artifact exists still ran and passed
      expect(run.output).toMatch(/1 passed/u);
      // both hidden gates were SKIPPED, not passed
      expect(run.output).toMatch(/2 skipped/u);
      // and they said so, loudly, naming the artifact and the forgone evidence
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
      const run = proof(true);
      expect(run.status, run.output).not.toBe(0);
      expect(run.output).toContain(`CANNOT RUN and ${REQUIRE_ARTIFACTS_ENV} is set`);
      expect(run.output).toContain("proof:absent");
      expect(run.output).toContain("deliberately-absent.tsv");
      expect(run.output).toMatch(/2 failed/u);
      // and the satisfied gate is unaffected — strict mode is not fail-everything
      expect(run.output).toMatch(/1 passed/u);
    },
    180_000,
  );

  /**
   * The regression that motivated dropping the body in the skip branch.
   *
   * `describe.skip(suite, fn)` does not stop vitest executing `fn`: the
   * collector must walk it to learn which tests to report as skipped. So a
   * gated suite that read its fixture at collection time — the shape every
   * oracle suite reaches for first — threw ENOENT past the gate and killed the
   * FILE, taking the satisfied sibling gate down with it (`Tests no tests`)
   * on exactly the run the gate exists for: a clean clone.
   *
   * Measured before the fix, with the var OFF, on `proof:collect-read`:
   *
   *     FAIL artifact-gate-proof.spec.ts [ artifact-gate-proof.spec.ts ]
   *     Error: ENOENT: no such file or directory, open '...collection-time-absent.tsv'
   *     Test Files  1 failed (1)
   *          Tests  no tests
   *
   * A gate that only holds when the caller confines every read to an `it` is
   * not a gate, so the guarantee is pinned here rather than left to convention.
   */
  it(
    "does not execute a skipped gate's body — a collection-time read still skips cleanly",
    () => {
      const run = proof(false);
      expect(run.status, run.output).toBe(0);
      expect(run.output).toContain("proof:collect-read");
      expect(run.output).toContain("collection-time-absent.tsv");
      // The body never ran, so the read never happened.
      expect(run.output, "the skipped body executed and read the missing file").not.toContain(
        "ENOENT",
      );
      // …and the collapse mode is gone: the file was collected, and the
      // satisfied sibling gate still ran rather than dying with it.
      expect(run.output).not.toMatch(/no tests/u);
      expect(run.output).toMatch(/1 passed/u);
    },
    180_000,
  );

  it(
    "reports the POLICY violation, not a file-read error, when the var is on",
    () => {
      const run = proof(true);
      expect(run.status, run.output).not.toBe(0);
      // Strict mode must name the gate that has no artifacts, not surface an
      // incidental ENOENT from a body that should never have been collected.
      expect(run.output).toContain("REQUIRES artifacts (proof:collect-read)");
      expect(run.output, "strict mode leaked a file-read error").not.toContain("ENOENT");
    },
    180_000,
  );
});
