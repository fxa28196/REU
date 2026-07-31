/**
 * artifact-gate.ts — the vitest face of the skip-vs-fail policy.
 *
 * The policy itself (env parsing, the artifact catalogue, the probe, the
 * decision and the banner) lives in `artifact-policy.ts`, which imports no
 * vitest and is therefore safe to load from a plain CLI. This module adds the
 * `describe`/`it` bindings and re-exports the policy surface, so a test file
 * imports exactly one module.
 *
 * See `websim/README.md` §8.1 and the §5.3 implementation note in
 * `websim/docs/IMPLEMENTATION_PLAN.md` for the policy in prose.
 */

import { existsSync } from "node:fs";

import { describe, it } from "vitest";

import {
  ARTIFACT_SOURCES,
  REQUIRE_ARTIFACTS_ENV,
  displayPath,
  type ArtifactGate,
  type ArtifactRef,
} from "./artifact-policy.js";

export * from "./artifact-policy.js";

// --- vitest bindings ---------------------------------------------------------

/**
 * Emit the banner. `console.warn` goes to stderr, which vitest prefixes with the
 * test file it came from — that is the "attributed" half of the requirement.
 */
function announce(gate: ArtifactGate): void {
  if (gate.action === "run") {
    return;
  }
  // Console output on the stderr channel is the whole point here.
  console.warn(`\n${gate.report}\n`);
}

/**
 * Register an artifact-gated `describe`.
 *
 * - satisfied  → `describe(suite, fn)`
 * - degraded   → banner + `describe.skip(suite, fn)`; vitest counts the bodies
 *                as SKIPPED, so the run reports them rather than swallowing them
 * - strict     → banner + a single real failing test; the original body is NOT
 *                collected, because collecting a body whose fixtures are absent
 *                would report a file-read error instead of the policy violation
 */
export function describeGated(gate: ArtifactGate, fn: () => void): void {
  announce(gate);
  if (gate.action === "run") {
    describe(gate.spec.suite, fn);
    return;
  }
  if (gate.action === "skip-loudly") {
    describe.skip(gate.spec.suite, fn);
    return;
  }
  describe(gate.spec.suite, () => {
    it(`REQUIRES artifacts (${gate.spec.gate})`, () => {
      throw new Error(gate.report);
    });
  });
}

/** The `it`-level form, for a single gated case inside an ungated suite. */
export function itGated(
  gate: ArtifactGate,
  name: string,
  fn: () => void | Promise<void>,
  timeout?: number,
): void {
  announce(gate);
  if (gate.action === "run") {
    it(name, fn, timeout);
    return;
  }
  if (gate.action === "skip-loudly") {
    it.skip(name, fn, timeout);
    return;
  }
  it(`${name} — REQUIRES artifacts (${gate.spec.gate})`, () => {
    throw new Error(gate.report);
  });
}

/**
 * Per-file probe *inside* a satisfied gate, for suites that walk a list of
 * fixtures where individual members may be absent.
 *
 * Returns whether the file is there. Absence is announced with the same `!!`
 * prefix and, under strict mode, throws — which inside a test body is a
 * failure, so "the fixture list quietly shrank" cannot pass unnoticed.
 */
export function gatedFixturePresent(
  gate: ArtifactGate,
  ref: ArtifactRef,
  probe: (p: string) => boolean = existsSync,
): boolean {
  if (probe(ref.path)) {
    return true;
  }
  const src = ARTIFACT_SOURCES[ref.source];
  const line =
    `!! ARTIFACT-GATED FIXTURE ABSENT — ${gate.spec.gate} is running on a reduced set.\n` +
    `!! MISSING:  [${src.id}${ref.label === undefined ? "" : `/${ref.label}`}] ${displayPath(ref.path)}\n` +
    `!! forgone:  ${gate.spec.evidence} (this member of the set only)\n` +
    `!! produce:  ${src.produce}`;
  if (gate.strict) {
    throw new Error(
      `${line}\n!! policy:   ${REQUIRE_ARTIFACTS_ENV} is on, so a reduced fixture set is a hard failure.`,
    );
  }
  // Console output on the stderr channel is the whole point here.
  console.warn(`\n${line}\n!! policy:   set ${REQUIRE_ARTIFACTS_ENV}=1 to make this a hard failure.\n`);
  return false;
}
