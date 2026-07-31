import { describe, expect, it } from "vitest";

import {
  REQUIRE_ARTIFACTS_ENV,
  artifactGate,
  parseRequireArtifacts,
} from "../../tools/artifact-gate.js";
import { IN_BROWSER_GATES, MISSING_ARCHIVE_POLICY, TIER_LADDER } from "../src/index.js";

describe("@websim/validation scaffold", () => {
  it("declares tiers 0 through 4 in order", () => {
    expect(TIER_LADDER.map((t) => t.tier)).toEqual([0, 1, 2, 3, 4]);
  });

  it("gates release on tiers 0-3 and reports tier 4", () => {
    const gates = TIER_LADDER.filter((t) => t.releaseGate).map((t) => t.tier);
    expect(gates).toEqual([0, 1, 2, 3]);
  });

  it("keeps the out-of-range lookup check in the in-browser subset", () => {
    expect(IN_BROWSER_GATES).toContain("oor-zero");
  });

  it("never skips silently when the archive is absent", () => {
    expect(MISSING_ARCHIVE_POLICY).toBe("fail-loudly");
  });

  it("backs that declaration with the shared skip-vs-fail helper, not just a string", () => {
    // The constant above is a claim. These assertions are the thing it claims:
    // an absent artifact is never "run", it is announced, and the announcement
    // becomes a hard failure on a runner that has the artifacts.
    const absent = { source: "archive-bundles" as const, path: "/definitely/not/here.json" };
    const off = artifactGate(
      {
        gate: "validation:policy-selfcheck",
        suite: "policy self-check",
        evidence: "the archive-derived gates this package will own from WP9 onward",
        artifacts: [absent],
      },
      {},
      () => false,
    );
    expect(off.action).toBe("skip-loudly");
    expect(off.report).toContain("DEGRADED");

    const on = artifactGate(
      {
        gate: "validation:policy-selfcheck",
        suite: "policy self-check",
        evidence: "the archive-derived gates this package will own from WP9 onward",
        artifacts: [absent],
      },
      { [REQUIRE_ARTIFACTS_ENV]: "1" },
      () => false,
    );
    expect(on.action).toBe("fail");
    expect(parseRequireArtifacts({ [REQUIRE_ARTIFACTS_ENV]: "1" })).toBe(true);
  });
});
