/**
 * The proof fixture for the skip-vs-fail policy (plan §5.3, WP9).
 *
 * This file is NOT part of `npm test`: the tools project collects `*.test.ts`
 * only, and this is a `.spec.ts` run by `tools/test/artifact-gate.test.ts` in a
 * child vitest process through `artifact-gate-proof.config.ts`. That is
 * deliberate — one of the two gates below is meant to FAIL, and the point of
 * the exercise is to observe a real vitest run go red rather than to trust a
 * unit test's opinion about what a decision function returns.
 *
 * Two gates, so the run is informative in both directions:
 *
 *  - `proof:present` points at a file that is committed and therefore always
 *    there. It must run and pass in every mode. Without it, a policy that
 *    simply failed everything would look identical to a correct one.
 *  - `proof:absent` points at a path under the git-ignored `pipeline/out/` that
 *    is never created. It must be SKIPPED (with the loud banner) when
 *    `WEBSIM_REQUIRE_ARTIFACTS` is off, and must FAIL when it is on.
 */

import path from "node:path";

import { expect, it } from "vitest";

import { WEBSIM_ROOT, artifactGate, describeGated } from "../../artifact-gate.js";

const presentGate = artifactGate({
  gate: "proof:present",
  suite: "policy proof — artifact present",
  evidence: "the proof that a satisfied gate still runs, i.e. the policy is not fail-everything",
  artifacts: [
    {
      source: "policy-proof",
      label: "committed-stand-in",
      // package.json is committed, so this gate is satisfied in every checkout.
      path: path.join(WEBSIM_ROOT, "package.json"),
    },
  ],
});

describeGated(presentGate, () => {
  it("runs when its artifact is present", () => {
    expect(presentGate.satisfied).toBe(true);
    expect(presentGate.action).toBe("run");
  });
});

const absentGate = artifactGate({
  gate: "proof:absent",
  suite: "policy proof — artifact hidden",
  evidence: "a bit-identity comparison against an oracle dump (stand-in for the real gates)",
  artifacts: [
    {
      source: "policy-proof",
      label: "hidden-stand-in",
      path: path.join(
        WEBSIM_ROOT,
        "pipeline",
        "out",
        "artifact-gate-proof",
        "deliberately-absent.tsv",
      ),
    },
  ],
});

describeGated(absentGate, () => {
  it("would compare the oracle, if the oracle were here", () => {
    // Never reached: the gate is either skipped or replaced by a failing test.
    expect(absentGate.satisfied).toBe(true);
  });
});
