import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it, onTestFinished } from "vitest";

import {
  ASSUMPTIONS_FILE,
  buildRealRegistrySnapshot,
  buildRegistrySnapshot,
  REGISTRY_DIR,
  VARIABLES_FILE,
} from "../scripts/build-registry.js";
import { geographyPath, OUT_DIR, readUtf8, sha256File, WEBSIM_ROOT } from "../src/asset-io.js";
import { CsvStrictError } from "../src/csv-loader.js";
import { RegistryValidationError } from "../src/registry.js";

/**
 * Plan Q10 moved the ScienceRegistry fail-fast from model startup to build time
 * because that is strictly stronger: an invalid registry cannot produce an asset
 * at all. A gate nobody has watched fail is not a gate, so these tests feed the
 * builder deliberately corrupted COPIES and require it to refuse each one.
 *
 * Corruption always happens inside {@link TEMP_ROOT}, which is git-ignored and
 * inside websim. The real registry under `Geography/` is opened read-only, and
 * the last test re-checksums it to prove that.
 */
const REAL_VARIABLES = geographyPath(join(REGISTRY_DIR, VARIABLES_FILE));
const REAL_ASSUMPTIONS = geographyPath(join(REGISTRY_DIR, ASSUMPTIONS_FILE));
const REAL_VARIABLES_SHA = sha256File(REAL_VARIABLES);
const REAL_ASSUMPTIONS_SHA = sha256File(REAL_ASSUMPTIONS);

/**
 * This file's scratch directory — a **fixed name under the sanctioned scratch
 * root**, created on demand and gone again the moment the last case that needed
 * it finishes.
 *
 * Every clause of that sentence is load-bearing, because the previous shape
 * (`mkdtempSync(join(OUT_DIR, ".tmp-registry-gate-"))` at module scope, freed in
 * `afterAll`) leaked, and `tools/check-scratch.ts` correctly reddened on the
 * leftovers:
 *
 *  - **On demand, not at module scope.** Module scope runs whenever the file is
 *    *loaded*, and loading is not running: `vitest list`, a collect-only pass and
 *    any `-t` filter that selects no case in this file all evaluated the old
 *    `mkdtempSync` and then ran no `afterAll` to undo it. Creating the directory
 *    inside {@link corruptedCopy} means a run that corrupts nothing writes
 *    nothing.
 *  - **Fixed name, not `mkdtemp`.** A random suffix makes every leak a *new*,
 *    permanent directory, so leftovers accumulate one per interrupted run. One
 *    fixed path is self-healing instead: {@link sweepStaleTempRoot} clears
 *    whatever a killed run left behind before the first case of the next run
 *    uses it, so the worst case is bounded at one directory rather than growing.
 *  - **Under `test-tmp/`.** `check-scratch.ts` permits the shared scratch root
 *    to survive as an EMPTY directory precisely so parallel workers do not race
 *    to delete each other's parent; a direct child of `pipeline/out/` is a
 *    violation on sight. `graph-asset.test.ts` and `deploy-check.test.ts`
 *    already put their scratch in the same place.
 *  - **Released per case, not in `afterAll`.** `onTestFinished` fires whether
 *    the case passed, failed or threw, and {@link releaseCaseDir} drops the root
 *    as soon as it is empty — so between two cases there is no directory to
 *    leak, and an interrupt lands in that gap rather than inside a window that
 *    stays open for the whole file. `afterAll` stays on as a cheap backstop.
 *
 * What survives a `kill -9` in the middle of a case is one known, fixed path,
 * which the next run sweeps. Nothing accumulates, and no directory at all
 * survives a run that was interrupted anywhere else.
 */
const TEMP_ROOT = join(OUT_DIR, "test-tmp", "build-registry");

let sweptStaleTempRoot = false;

/** Clear anything a killed run left in {@link TEMP_ROOT}, once per file. */
function sweepStaleTempRoot(): void {
  if (!sweptStaleTempRoot) {
    sweptStaleTempRoot = true;
    rmSync(TEMP_ROOT, { recursive: true, force: true });
  }
}

/**
 * Drop one case's directory, and the shared root too once it is empty.
 *
 * `rmdirSync` rather than a recursive `rmSync` on the root on purpose: it fails
 * with ENOTEMPTY when a case that asked for two corrupted copies still holds
 * one, and with ENOENT when a sibling already tidied up. Both mean "not mine to
 * remove yet", so both are swallowed; anything that is *not* a directory-still-
 * in-use error would be swallowed too, which is acceptable for a cleanup path
 * that `check-scratch.ts` independently audits after the run.
 */
function releaseCaseDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  try {
    rmdirSync(TEMP_ROOT);
  } catch {
    /* still in use by this case, or already gone */
  }
}

afterAll(() => {
  rmSync(TEMP_ROOT, { recursive: true, force: true });
});

let caseCounter = 0;

/** A copy of the real registry with optional corruption applied to either file. */
function corruptedCopy(
  mutate: { variables?: (text: string) => string; assumptions?: (text: string) => string } = {},
): string {
  sweepStaleTempRoot();
  caseCounter += 1;
  const dir = join(TEMP_ROOT, `case-${caseCounter}`);
  mkdirSync(dir, { recursive: true });
  onTestFinished(() => {
    releaseCaseDir(dir);
  });
  for (const [file, source, fn] of [
    [VARIABLES_FILE, REAL_VARIABLES, mutate.variables],
    [ASSUMPTIONS_FILE, REAL_ASSUMPTIONS, mutate.assumptions],
  ] as const) {
    if (fn === undefined) {
      copyFileSync(source, join(dir, file));
    } else {
      writeFileSync(join(dir, file), fn(readUtf8(source)), "utf8");
    }
  }
  return dir;
}

/**
 * Append a syntactically valid 16-field variable row. Defaults satisfy every
 * rule, so a single overridden column isolates exactly one violation.
 */
function variableRow(overrides: Partial<Record<string, string>> = {}): string {
  const base: Record<string, string> = {
    variable_id: "V999",
    name: "gate probe",
    description: "gate probe",
    mechanism: "gate probe",
    math: "n/a",
    units: "n/a",
    evidence_class: "A",
    source: "gate probe",
    doi_or_dataset: "none",
    uncertainty: "none",
    affects_movement: "yes",
    affects_exposure: "no",
    affects_shelter_access: "no",
    affects_reporting: "no",
    status: "implemented",
    implementation: "n/a",
    ...overrides,
  };
  return [
    "variable_id",
    "name",
    "description",
    "mechanism",
    "math",
    "units",
    "evidence_class",
    "source",
    "doi_or_dataset",
    "uncertainty",
    "affects_movement",
    "affects_exposure",
    "affects_shelter_access",
    "affects_reporting",
    "status",
    "implementation",
  ]
    .map((c) => base[c] as string)
    .join(",");
}

function assumptionRow(overrides: Partial<Record<string, string>> = {}): string {
  const base: Record<string, string> = {
    assumption_id: "A999",
    statement: "gate probe",
    classification: "measured",
    rationale: "gate probe",
    affects: "nothing",
    sensitivity_plan: "swept in the gate test",
    status: "active",
    source_or_doc: "gate probe",
    ...overrides,
  };
  return [
    "assumption_id",
    "statement",
    "classification",
    "rationale",
    "affects",
    "sensitivity_plan",
    "status",
    "source_or_doc",
  ]
    .map((c) => base[c] as string)
    .join(",");
}

const appendVariable = (row: string) => (text: string) => `${text}${row}\n`;
const appendAssumption = (row: string) => (text: string) => `${text}${row}\n`;

function buildFrom(dir: string): void {
  buildRegistrySnapshot(dir, "temp-registry");
}

describe("the real registry passes the full gate", () => {
  it("validates and reports the censuses PORT_MAP records", () => {
    const build = buildRealRegistrySnapshot();
    expect(build.census.variableCount).toBe(55);
    expect(build.census.assumptionCount).toBe(35);
    const total = Object.values(build.census.evidenceClassCensus).reduce((a, b) => a + b, 0);
    expect(total).toBe(55);
  });

  it("emits file SHA-256s alongside the censuses", () => {
    const snapshot = JSON.parse(buildRealRegistrySnapshot().bytes.toString("utf8")) as {
      variables_sha256: string;
      assumptions_sha256: string;
      variable_count: number;
      evidence_class_census: Record<string, number>;
      placeholder_variable_ids: string[];
      blocking_assumption_ids: string[];
    };
    expect(snapshot.variables_sha256).toBe(REAL_VARIABLES_SHA);
    expect(snapshot.assumptions_sha256).toBe(REAL_ASSUMPTIONS_SHA);
    expect(Object.keys(snapshot.evidence_class_census)).toEqual(["M", "L", "C", "A", "F"]);
    expect(Array.isArray(snapshot.placeholder_variable_ids)).toBe(true);
    expect(Array.isArray(snapshot.blocking_assumption_ids)).toBe(true);
  });

  it("is byte-reproducible", () => {
    expect(buildRealRegistrySnapshot().bytes.toString("hex")).toBe(
      buildRealRegistrySnapshot().bytes.toString("hex"),
    );
  });
});

describe("the gate fails the build on a corrupt registry", () => {
  it("rejects an unquoted comma that shifts every later column", () => {
    // The exact defect readStrict exists for. `read` would pad and drop
    // silently; the whole point of Q10 is that this cannot ship.
    // Thrown by the readStrict layer rather than the governance layer — the
    // distinction is real (parse vs rule) and both fail the build identically.
    const dir = corruptedCopy({ variables: (t) => `${t}V999,a,b\n` });
    expect(() => buildFrom(dir)).toThrow(CsvStrictError);
    expect(() => buildFrom(dir)).toThrow(/fields but the header declares 16/u);
  });

  it("rejects a duplicate column name", () => {
    const dir = corruptedCopy({
      variables: (t) => t.replace("implementation", "name"),
    });
    expect(() => buildFrom(dir)).toThrow(/duplicate column name 'name'/u);
  });

  it("rejects an evidence_class outside the vocabulary", () => {
    const dir = corruptedCopy({
      variables: appendVariable(variableRow({ evidence_class: "X" })),
    });
    expect(() => buildFrom(dir)).toThrow(RegistryValidationError);
    expect(() => buildFrom(dir)).toThrow(/evidence_class 'X' is not one of M, L, C, A, F/u);
  });

  it("rejects a status outside the vocabulary", () => {
    const dir = corruptedCopy({ variables: appendVariable(variableRow({ status: "maybe" })) });
    expect(() => buildFrom(dir)).toThrow(/status 'maybe' is not one of implemented/u);
  });

  it("rejects a duplicate variable_id", () => {
    const dir = corruptedCopy({
      variables: (t) => `${t}${variableRow()}\n${variableRow()}\n`,
    });
    expect(() => buildFrom(dir)).toThrow(/duplicate variable_id 'V999'/u);
  });

  it("rejects an empty variable_id", () => {
    const dir = corruptedCopy({ variables: appendVariable(variableRow({ variable_id: "" })) });
    expect(() => buildFrom(dir)).toThrow(/empty variable_id/u);
  });

  it("rejects an affects_* flag that is neither yes nor no", () => {
    const dir = corruptedCopy({
      variables: appendVariable(variableRow({ affects_exposure: "maybe" })),
    });
    expect(() => buildFrom(dir)).toThrow(/affects_exposure must be yes or no, got 'maybe'/u);
  });

  it("rejects a live variable that affects nothing", () => {
    const dir = corruptedCopy({
      variables: appendVariable(variableRow({ affects_movement: "no" })),
    });
    expect(() => buildFrom(dir)).toThrow(/every affects_\* flag is 'no'/u);
  });

  it("allows a deprecated variable to affect nothing", () => {
    const dir = corruptedCopy({
      variables: appendVariable(
        variableRow({ affects_movement: "no", status: "deprecated" }),
      ),
    });
    expect(() => buildFrom(dir)).not.toThrow();
  });

  it("rejects a literature or measured variable with no source id", () => {
    // Rule 4 of "no invented values". `none` is the literal the registry uses
    // for "not applicable", so it must not satisfy the requirement.
    for (const cls of ["L", "M"]) {
      const dir = corruptedCopy({
        variables: appendVariable(
          variableRow({ evidence_class: cls, doi_or_dataset: "none", uncertainty: "0.1-0.2" }),
        ),
      });
      expect(() => buildFrom(dir)).toThrow(/requires a DOI or dataset id/u);
    }
  });

  it("rejects a literature or calibrated variable with no uncertainty range", () => {
    for (const cls of ["L", "C"]) {
      const dir = corruptedCopy({
        variables: appendVariable(
          variableRow({ evidence_class: cls, doi_or_dataset: "10.0/x", uncertainty: "" }),
        ),
      });
      expect(() => buildFrom(dir)).toThrow(/requires a non-'none' uncertainty range/u);
    }
  });

  it("rejects an assumption-class row with no sensitivity plan", () => {
    const dir = corruptedCopy({
      assumptions: appendAssumption(
        assumptionRow({ classification: "assumption", sensitivity_plan: "" }),
      ),
    });
    expect(() => buildFrom(dir)).toThrow(/requires a sensitivity_plan/u);
  });

  it("rejects an assumption classification or status outside the vocabulary", () => {
    const badClass = corruptedCopy({
      assumptions: appendAssumption(assumptionRow({ classification: "vibes" })),
    });
    expect(() => buildFrom(badClass)).toThrow(/classification 'vibes' is not one of measured/u);
    const badStatus = corruptedCopy({
      assumptions: appendAssumption(assumptionRow({ status: "pending" })),
    });
    expect(() => buildFrom(badStatus)).toThrow(/status 'pending' is not one of active/u);
  });

  it("rejects a duplicate assumption_id", () => {
    const dir = corruptedCopy({
      assumptions: (t) => `${t}${assumptionRow()}\n${assumptionRow()}\n`,
    });
    expect(() => buildFrom(dir)).toThrow(/duplicate assumption_id 'A999'/u);
  });

  it("rejects an empty registry file", () => {
    const dir = corruptedCopy({ variables: () => "" });
    expect(() => buildFrom(dir)).toThrow(/file is empty/u);
  });
});

describe("the gate fails the CLI, not just the library", () => {
  it("exits non-zero and writes nothing for a corrupt registry", () => {
    const dir = corruptedCopy({
      variables: appendVariable(variableRow({ evidence_class: "X" })),
    });
    let status = 0;
    let stderr = "";
    try {
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          join("pipeline", "scripts", "build-registry.ts"),
          "--registry-dir",
          dir,
          "--dry-run",
        ],
        { cwd: WEBSIM_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (e) {
      const err = e as { status?: number; stderr?: string };
      status = err.status ?? -1;
      stderr = err.stderr ?? "";
    }
    expect(status).toBe(1);
    expect(stderr).toMatch(/GOVERNANCE VALIDATION FAILED/u);
    expect(stderr).toMatch(/evidence_class 'X'/u);
  }, 60_000);

  it("refuses to write a snapshot built from a registry outside Geography/", () => {
    // A passing corrupt-directory run must not be able to overwrite the real
    // snapshot with governance data from somewhere else.
    const dir = corruptedCopy();
    let status = 0;
    let stderr = "";
    try {
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          join("pipeline", "scripts", "build-registry.ts"),
          "--registry-dir",
          dir,
        ],
        { cwd: WEBSIM_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (e) {
      const err = e as { status?: number; stderr?: string };
      status = err.status ?? -1;
      stderr = err.stderr ?? "";
    }
    expect(status).toBe(1);
    expect(stderr).toMatch(/validation-only mode/u);
  }, 60_000);
});

describe("the real registry is never modified", () => {
  it("still hashes to the digests recorded before the corruption tests ran", () => {
    expect(sha256File(REAL_VARIABLES)).toBe(REAL_VARIABLES_SHA);
    expect(sha256File(REAL_ASSUMPTIONS)).toBe(REAL_ASSUMPTIONS_SHA);
  });
});
