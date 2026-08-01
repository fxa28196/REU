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
 * - degraded   → banner + a SKIPPED placeholder suite; `fn` is NOT collected
 * - strict     → banner + a single real failing test; `fn` is NOT collected
 *
 * ## Why the degraded branch drops the body instead of `describe.skip(suite, fn)`
 *
 * Because vitest **executes a skipped suite's body anyway**. `describe.skip`
 * marks the suite's mode, but the collector still calls the factory — it has to,
 * to learn which tests exist in order to report them as skipped. So anything the
 * body does *outside* an `it` runs regardless of the gate's verdict, and the
 * idiom every oracle suite reaches for first — read the manifest once at the top
 * of the describe, then generate cases from it — throws ENOENT straight past the
 * gate on precisely the run the gate exists for: a clean clone, where
 * `pipeline/out/` is git-ignored and absent.
 *
 * The failure was not confined to the offending suite either. A throw during
 * collection kills the whole FILE, so sibling gates that were satisfied never
 * ran and vitest reported `no tests` — a gate that silently took working
 * evidence down with it.
 *
 * Dropping the body costs the per-test skip granularity (the run reports one
 * skipped placeholder naming the gate, not N skipped cases) and buys the
 * guarantee that the gate's verdict cannot be pre-empted by what the body
 * happens to touch. That is the right trade: the policy's promise is "reported,
 * never silently swallowed", and one attributed SKIPPED entry carrying the gate
 * id keeps that promise, whereas the old shape only kept it for suites that
 * happened to confine every read to an `it`. A guarantee that depends on how the
 * caller wrote its body is not a guarantee.
 *
 * `tools/test/fixtures/artifact-gate-proof.spec.ts`'s `proof:collect-read` gate
 * pins this: its body reads a missing file at collection time, and the child
 * vitest run in `tools/test/artifact-gate.test.ts` requires that to skip cleanly
 * with the var off and fail with the POLICY banner (not ENOENT) with it on.
 */
export function describeGated(gate: ArtifactGate, fn: () => void): void {
  announce(gate);
  if (gate.action === "run") {
    describe(gate.spec.suite, fn);
    return;
  }
  if (gate.action === "skip-loudly") {
    describe.skip(gate.spec.suite, () => {
      // A placeholder, so the run still REPORTS a skip attributed to this gate.
      // Its body never executes (vitest runs suite factories at collection, but
      // never a skipped test's callback), and it touches nothing regardless.
      it(`artifacts absent — suite not collected (${gate.spec.gate})`, () => {
        /* unreachable: registered skipped */
      });
    });
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
