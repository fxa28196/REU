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
 * Three gates, so the run is informative in every direction:
 *
 *  - `proof:present` points at a file that is committed and therefore always
 *    there. It must run and pass in every mode. Without it, a policy that
 *    simply failed everything would look identical to a correct one.
 *  - `proof:absent` points at a path under the git-ignored `pipeline/out/` that
 *    is never created. It must be SKIPPED (with the loud banner) when
 *    `WEBSIM_REQUIRE_ARTIFACTS` is off, and must FAIL when it is on.
 *  - `proof:collect-read` is the same absent case, but its body reads the
 *    missing artifact at **collection time** rather than inside an `it`. That is
 *    the shape that broke the clean-clone property: `describe.skip(suite, fn)`
 *    still *executes* `fn` — vitest has to walk it to learn which tests to
 *    report as skipped — so a top-level `readFileSync` threw ENOENT straight
 *    past the gate and killed the file before the policy could speak. A gate
 *    that only holds when the suite body is written a particular way is not a
 *    gate, so the guarantee is tested here rather than left to a convention.
 */

import { readFileSync } from "node:fs";
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

/**
 * The regression case: a gated body that touches the filesystem at COLLECTION
 * time. Written the way a real oracle suite naturally wants to be written —
 * parse the manifest once, then generate cases from it — which is exactly why
 * the hole was reachable by accident rather than by carelessness.
 */
const COLLECT_READ_PATH = path.join(
  WEBSIM_ROOT,
  "pipeline",
  "out",
  "artifact-gate-proof",
  "collection-time-absent.tsv",
);

const collectReadGate = artifactGate({
  gate: "proof:collect-read",
  suite: "policy proof — hidden artifact read at collection time",
  evidence:
    "the proof that a skipped gate does not execute its body, i.e. that the gate holds for " +
    "suites that read their fixtures while vitest is collecting rather than inside an it()",
  artifacts: [
    { source: "policy-proof", label: "collect-time-stand-in", path: COLLECT_READ_PATH },
  ],
});

describeGated(collectReadGate, () => {
  // NOT inside an `it`. If describeGated ever executes a skipped body again,
  // this throws ENOENT during collection and the whole file dies before the
  // policy banner can be printed — which is the defect this fixture pins.
  const manifest = readFileSync(COLLECT_READ_PATH, "utf8");
  it("would parse the manifest it just read", () => {
    expect(manifest.length).toBeGreaterThan(0);
  });
});
