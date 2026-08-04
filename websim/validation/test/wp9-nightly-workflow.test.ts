/**
 * The nightly workflow's non-inertness, tested rather than inspected (defect G3).
 *
 * ## The gap this closes
 *
 * `.github/workflows/websim-nightly.yml` used to be one job guarded by
 *
 *     if: vars.WEBSIM_ARTIFACT_RUNNER == 'true' || github.event_name == 'workflow_dispatch'
 *
 * and nothing else. On the 07:10 schedule with that repository variable unset,
 * the job was SKIPPED and the workflow **reported success having executed
 * nothing** — a green nightly badge manufactured out of an unset variable.
 *
 * It was repaired into three jobs: two whose conditions are exact complements,
 * so one of them runs on every trigger, and an `if: always()` verdict job that
 * fails when neither did work. But **no test anywhere read a workflow file**, so
 * reverting the YAML to its inert single-job form left `npm test`, `npm run ci`
 * and `npm run test:strict` all green. Every other WP9 clause is defended by an
 * executable check; that one was defended by a comment.
 *
 * A property that nothing can observe is not a property the repository holds, so
 * this file observes it. It asserts, over the parsed YAML:
 *
 *  1. the two working jobs' `if:` conditions are **exact complements** — checked
 *     both textually (`!(X)` against `X`) and semantically, by evaluating both
 *     over every combination of the inputs they read and requiring **exactly
 *     one** to be active in each;
 *  2. the verdict job carries `if: always()`, `needs` every other job, and is not
 *     `continue-on-error`;
 *  3. the verdict job's script **actually exits non-zero** when neither working
 *     job did work — which is asserted by RUNNING it under `bash` with the job
 *     results substituted, not by reading it.
 *
 * ## Provably able to fail
 *
 * WP9's rule is that a gate must be shown able to go red. Two ways, both here:
 * {@link INERT_NIGHTLY} is the pre-repair single-job form as a fixture, and the
 * same `findings()` used on the shipped file is required to reject it, naming
 * the reasons. And the real YAML was physically reverted to that form during
 * development, this suite watched go red, and the file restored and verified by
 * SHA-256 — see the task record. The fixture is what keeps that reproducible.
 *
 * ## Why not a YAML dependency
 *
 * See `helpers/workflow-yaml.ts`. Short version: the subset is small and closed,
 * and the reader throws on anything outside it rather than guessing.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  asMap,
  asString,
  evaluateExpression,
  needsOf,
  parseWorkflowYaml,
  unwrapExpression,
  type YamlMap,
} from "./helpers/workflow-yaml.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
/** `websim/validation/test` → repo root → `.github/workflows`. */
const WORKFLOW_DIR = path.resolve(HERE, "..", "..", "..", ".github", "workflows");
const NIGHTLY = "websim-nightly.yml";
const ALL_WORKFLOWS = ["websim-ci.yml", "websim-mutation-gate.yml", NIGHTLY] as const;

/**
 * Read a workflow, or fail with the reason. Absence is a HARD failure and never
 * a skip: a nightly workflow that is not in the tree cannot run on GitHub
 * either, so "the file is missing" is exactly the finding this suite exists to
 * report — not a condition under which it should go quiet.
 */
function readWorkflow(file: string): string {
  const p = path.join(WORKFLOW_DIR, file);
  if (!existsSync(p)) {
    throw new Error(
      `${p} does not exist. This suite gates the structure of the nightly workflow; a missing ` +
        "workflow file is a missing nightly, not a reason to skip.",
    );
  }
  return readFileSync(p, "utf8");
}

const parsed = new Map<string, YamlMap>();
function workflow(file: string): YamlMap {
  let doc = parsed.get(file);
  if (doc === undefined) {
    doc = parseWorkflowYaml(readWorkflow(file));
    parsed.set(file, doc);
  }
  return doc;
}

// --- the structural rules ----------------------------------------------------

/**
 * Every context the two working jobs' conditions are allowed to read, crossed.
 *
 * `WEBSIM_ARTIFACT_RUNNER` unset is the case that produced the original defect,
 * so it is first and it is not optional.
 */
const CONTEXTS: ReadonlyArray<{ readonly label: string; readonly ctx: Record<string, unknown> }> = (
  [undefined, "", "false", "true", "TRUE"] as const
).flatMap((runner) =>
  ([undefined, false, true] as const).flatMap((force) =>
    (["schedule", "workflow_dispatch"] as const).map((event) => ({
      label: `runner=${String(runner)} force=${String(force)} event=${event}`,
      ctx: {
        vars: runner === undefined ? {} : { WEBSIM_ARTIFACT_RUNNER: runner },
        inputs: force === undefined ? {} : { force_artifact_runner: force },
        github: { event_name: event },
      },
    })),
  ),
);

interface Structure {
  readonly jobs: YamlMap;
  readonly verdictId: string | null;
  readonly workIds: readonly string[];
}

function structure(doc: YamlMap): Structure {
  const jobs = asMap(doc["jobs"], "jobs");
  const ids = Object.keys(jobs);
  const verdictIds = ids.filter((id) => unwrapExpression(asString(asMap(jobs[id], id)["if"]) ?? "") === "always()");
  return {
    jobs,
    verdictId: verdictIds.length === 1 ? verdictIds[0]! : null,
    workIds: ids.filter((id) => !verdictIds.includes(id)),
  };
}

/**
 * Everything wrong with a nightly workflow's structure, as sentences. Empty
 * means the workflow cannot report success having executed nothing.
 *
 * Written as a findings list rather than as assertions so the SAME function can
 * be pointed at the inert fixture and required to reject it.
 */
export function findings(doc: YamlMap): string[] {
  const out: string[] = [];
  const { jobs, verdictId, workIds } = structure(doc);

  if (verdictId === null) {
    out.push(
      "no single job carries `if: always()`; without one, a workflow whose every job is " +
        "skipped reports SUCCESS having run nothing",
    );
  } else {
    const verdict = asMap(jobs[verdictId], verdictId);
    const declared = needsOf(verdict);
    for (const id of workIds) {
      if (!declared.includes(id)) {
        out.push(`the verdict job \`${verdictId}\` does not \`need\` \`${id}\`, so it cannot see its result`);
      }
    }
    if (asString(verdict["continue-on-error"]) === "true") {
      out.push(`the verdict job \`${verdictId}\` is continue-on-error, so its failure would not fail the run`);
    }
    if (asString(verdict["if"]) !== "always()") {
      out.push(`the verdict job \`${verdictId}\` must carry a bare \`if: always()\``);
    }
  }

  if (workIds.length < 2) {
    out.push(
      `only ${workIds.length} working job(s); a single conditional job is the inert form — when ` +
        "its condition is false the workflow does nothing and says nothing",
    );
  }

  // Exact complements, textually: one condition is the negation of the other.
  const conditions = workIds.map((id) => ({
    id,
    expr: unwrapExpression(asString(asMap(jobs[id], id)["if"]) ?? ""),
  }));
  const negated = conditions.filter((c) => c.expr.startsWith("!("));
  const plain = conditions.filter((c) => c.expr.length > 0 && !c.expr.startsWith("!("));
  const complementary = negated.some((n) => plain.some((p) => n.expr === `!(${p.expr})`));
  if (workIds.length >= 2 && !complementary) {
    out.push(
      "no pair of working jobs carries exactly complementary conditions " +
        `(${conditions.map((c) => `${c.id}: ${c.expr === "" ? "<unconditional>" : c.expr}`).join(" | ")})`,
    );
  }

  // …and semantically: in every context, exactly one working job is active.
  for (const { label, ctx } of CONTEXTS) {
    const active = workIds.filter((id) => {
      const raw = asString(asMap(jobs[id], id)["if"]);
      return raw === undefined || evaluateExpression(unwrapExpression(raw), ctx);
    });
    if (active.length !== 1) {
      out.push(
        `${active.length} working job(s) active at ${label} — exactly one must be, or the ` +
          `workflow ${active.length === 0 ? "runs nothing" : "duplicates work"}`,
      );
    }
  }
  return out;
}

/** The pre-repair file, verbatim in shape: one job, one condition, no verdict. */
const INERT_NIGHTLY = `name: websim nightly full-archive validation

on:
  schedule:
    - cron: "10 7 * * *"
  workflow_dispatch:

permissions:
  contents: read

defaults:
  run:
    working-directory: websim

jobs:
  full-archive:
    name: full-archive replay (Tiers 1-4) + VALIDATION_REPORT.json
    if: \${{ vars.WEBSIM_ARTIFACT_RUNNER == 'true' || github.event_name == 'workflow_dispatch' }}
    runs-on: \${{ vars.WEBSIM_ARTIFACT_RUNNER_LABEL || 'self-hosted' }}
    timeout-minutes: 180
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Full suite (artifact-gated suites REQUIRED to run)
        run: npm run test:strict
`;

// --- the suite ---------------------------------------------------------------

describe("the nightly workflow cannot report success having run nothing", () => {
  it("parses, and every workflow in the tree parses with it", () => {
    // Anti-vacuity for the reader itself: it must actually be reading these
    // files, not silently returning an empty document that satisfies nothing.
    for (const file of ALL_WORKFLOWS) {
      const doc = workflow(file);
      expect(Object.keys(asMap(doc["jobs"], "jobs")).length, file).toBeGreaterThan(0);
      expect(asString(doc["name"]), file).toMatch(/websim/u);
    }
    const nightly = workflow(NIGHTLY);
    expect(Object.keys(asMap(nightly["jobs"], "jobs"))).toEqual([
      "full-archive",
      "degraded-clean-clone",
      "nightly-verdict",
    ]);
  });

  it("has no structural defect: complementary conditions and an always() verdict", () => {
    expect(findings(workflow(NIGHTLY))).toEqual([]);
  });

  it("is able to fail — the same check rejects the inert single-job form", () => {
    const bad = findings(parseWorkflowYaml(INERT_NIGHTLY));
    expect(bad.length, "the inert form was accepted").toBeGreaterThan(0);
    expect(bad.join("\n")).toContain("if: always()");
    expect(bad.join("\n")).toContain("only 1 working job");
    // The exact context that produced the original defect: a scheduled run with
    // the repository variable unset. It must be named.
    expect(bad.join("\n")).toContain("0 working job(s) active at runner=undefined");
  });

  it("names the two complementary conditions explicitly, so a rewrite is visible", () => {
    const jobs = asMap(workflow(NIGHTLY)["jobs"], "jobs");
    const full = unwrapExpression(asString(asMap(jobs["full-archive"], "full-archive")["if"]) ?? "");
    const degraded = unwrapExpression(
      asString(asMap(jobs["degraded-clean-clone"], "degraded-clean-clone")["if"]) ?? "",
    );
    expect(full).toBe("vars.WEBSIM_ARTIFACT_RUNNER == 'true' || inputs.force_artifact_runner");
    expect(degraded).toBe(`!(${full})`);
  });

  it("routes a scheduled run with no artifact runner to the DEGRADED job, not to nothing", () => {
    const jobs = asMap(workflow(NIGHTLY)["jobs"], "jobs");
    const ctx = { vars: {}, inputs: {}, github: { event_name: "schedule" } };
    const active = Object.keys(jobs).filter((id) => {
      const raw = asString(asMap(jobs[id], id)["if"]);
      return raw === undefined || evaluateExpression(unwrapExpression(raw), ctx);
    });
    // The verdict job is always() so it is active too; the point is WHICH
    // working job runs — and that it is not none, which was the defect.
    expect(active).toContain("degraded-clean-clone");
    expect(active).toContain("nightly-verdict");
    expect(active).not.toContain("full-archive");
    // …and the job that runs is titled so a green tick cannot be misread.
    expect(asString(asMap(jobs["degraded-clean-clone"], "d")["name"])).toContain("DEGRADED");
  });
});

// --- the verdict script, executed --------------------------------------------

interface VerdictRun {
  readonly status: number | null;
  readonly output: string;
}

/** The verdict step's script, with `${{ needs.<job>.result }}` substituted. */
function verdictScript(results: Readonly<Record<string, string>>): string {
  const jobs = asMap(workflow(NIGHTLY)["jobs"], "jobs");
  const verdict = asMap(jobs["nightly-verdict"], "nightly-verdict");
  const steps = verdict["steps"];
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error("the verdict job has no steps");
  }
  const script = asString(asMap(steps[0], "the verdict step")["run"]);
  if (script === undefined) {
    throw new Error("the verdict job's first step has no `run:` script");
  }
  return script.replace(/\$\{\{\s*needs\.([A-Za-z0-9_-]+)\.result\s*\}\}/gu, (_m, job: string) => {
    const value = results[job];
    if (value === undefined) {
      throw new Error(
        `the verdict script reads needs.${job}.result, which this test does not supply — ` +
          "a job was renamed and the substitution would have been silently empty",
      );
    }
    return value;
  });
}

function runVerdict(full: string, degraded: string): VerdictRun {
  const probe = spawnSync("bash", ["-c", "exit 0"], { encoding: "utf8" });
  if (probe.error !== undefined || probe.status !== 0) {
    throw new Error(
      "`bash` is not available, so the verdict script could not be executed. This check is not " +
        "skipped when bash is missing: the clause 'the verdict job fails when neither branch did " +
        "work' would then be unverified, and an unverified clause must be reported, not hidden. " +
        "Install Git Bash (Windows) or run on a POSIX shell.",
    );
  }
  const dir = mkdtempSync(path.join(tmpdir(), "websim-verdict-"));
  try {
    const summary = path.join(dir, "step-summary.md");
    const child = spawnSync(
      "bash",
      ["-c", verdictScript({ "full-archive": full, "degraded-clean-clone": degraded })],
      {
        encoding: "utf8",
        env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return { status: child.status, output: `${child.stdout ?? ""}\n${child.stderr ?? ""}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("the verdict job's script, run", () => {
  /** `[full-archive result, degraded result, expected exit status]`. */
  const CASES: ReadonlyArray<readonly [string, string, number]> = [
    // The defect itself: nothing ran. Must be a failure.
    ["skipped", "skipped", 1],
    ["skipped", "cancelled", 1],
    ["cancelled", "cancelled", 1],
    // Real work happened. Must pass.
    ["success", "skipped", 0],
    ["skipped", "success", 0],
    // A red job stays red through the verdict.
    ["failure", "skipped", 1],
    ["skipped", "failure", 1],
    ["success", "failure", 1],
  ];

  it("fails when neither branch did work, and passes when one did", () => {
    for (const [full, degraded, expected] of CASES) {
      const run = runVerdict(full, degraded);
      expect(run.status, `full=${full} degraded=${degraded}\n${run.output}`).toBe(expected);
    }
  });

  it("says WHY, on the run page, when nothing ran", () => {
    const run = runVerdict("skipped", "skipped");
    expect(run.status).toBe(1);
    expect(run.output).toContain("::error title=Nightly ran nothing");
    expect(run.output).toContain("skipped/skipped");
  });

  it("is not fail-always — a degraded-only nightly is green and says it was degraded", () => {
    const run = runVerdict("skipped", "success");
    expect(run.status).toBe(0);
    expect(run.output).not.toContain("::error");
  });

  it("notices if a job is renamed out from under it", () => {
    // The substitution is keyed by job id. If `nightly-verdict` stopped reading
    // one of the two results, or read a third, this test would be substituting
    // into a script that no longer matches the jobs it gates.
    expect(() => verdictScript({ "full-archive": "success" })).toThrow(
      /needs\.degraded-clean-clone\.result/u,
    );
  });
});
