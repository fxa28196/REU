import { describe, expect, it } from "vitest";

import { BADGE_STATES, PROVENANCE_CLASSES } from "../src/index";
import { badgeExplanation, deriveBadge, type BadgeInput } from "../src/badge/machine";
import {
  EXECUTED_DIFF_BANNER,
  diffParams,
  executedDiffEmptyLine,
  formatParamValue,
} from "../src/badge/ExecutedDiff";
import { BADGE_COLORS, badgeColor, provenanceLabel } from "../src/badge/BadgePanel";

/** A configuration with every positive signal present — the strongest input. */
const allGreen: BadgeInput = {
  presetUnmodified: true,
  matchesArchive: true,
  gateSubsetGreen: true,
  outOfRangeLookups: 0,
  executedDiffersFromConfigured: false,
};

describe("deriveBadge", () => {
  it("earns ARCHIVE-VALIDATED only with unmodified preset + archive match + green gate", () => {
    expect(deriveBadge(allGreen)).toBe("ARCHIVE-VALIDATED");
  });

  it("INVALID: out-of-range lookups beat even ARCHIVE-VALIDATED inputs", () => {
    expect(deriveBadge({ ...allGreen, outOfRangeLookups: 1 })).toBe("INVALID");
    expect(deriveBadge({ ...allGreen, outOfRangeLookups: 217 })).toBe("INVALID");
  });

  it("INVALID: executed≠configured beats even ARCHIVE-VALIDATED inputs", () => {
    expect(deriveBadge({ ...allGreen, executedDiffersFromConfigured: true })).toBe("INVALID");
  });

  it("INVALID: both hard causes together still yield INVALID", () => {
    expect(
      deriveBadge({ ...allGreen, outOfRangeLookups: 3, executedDiffersFromConfigured: true }),
    ).toBe("INVALID");
  });

  it("a modified preset is EXPLORATORY even when archive match and gate are green", () => {
    expect(deriveBadge({ ...allGreen, presetUnmodified: false })).toBe("EXPLORATORY");
  });

  it("INVALID beats the modified-preset rule too", () => {
    expect(
      deriveBadge({ ...allGreen, presetUnmodified: false, outOfRangeLookups: 1 }),
    ).toBe("INVALID");
  });

  it("green gate without an archive comparison is ENGINE-CERTIFIED, not ARCHIVE-VALIDATED", () => {
    expect(deriveBadge({ ...allGreen, matchesArchive: null })).toBe("ENGINE-CERTIFIED");
  });

  it("green gate with a failed archive comparison is ENGINE-CERTIFIED", () => {
    expect(deriveBadge({ ...allGreen, matchesArchive: false })).toBe("ENGINE-CERTIFIED");
  });

  it("unknown gate never upgrades: archive match alone stays EXPLORATORY", () => {
    expect(deriveBadge({ ...allGreen, gateSubsetGreen: null })).toBe("EXPLORATORY");
  });

  it("a failed gate stays EXPLORATORY even with an archive match", () => {
    expect(deriveBadge({ ...allGreen, gateSubsetGreen: false })).toBe("EXPLORATORY");
  });

  it("nothing known beyond an unmodified preset is EXPLORATORY", () => {
    expect(
      deriveBadge({ ...allGreen, matchesArchive: null, gateSubsetGreen: null }),
    ).toBe("EXPLORATORY");
  });

  it("always returns a declared badge state", () => {
    const inputs: BadgeInput[] = [
      allGreen,
      { ...allGreen, presetUnmodified: false },
      { ...allGreen, matchesArchive: null, gateSubsetGreen: null },
      { ...allGreen, outOfRangeLookups: 5 },
    ];
    for (const input of inputs) {
      expect(BADGE_STATES).toContain(deriveBadge(input));
    }
  });
});

describe("badgeExplanation", () => {
  it("INVALID names the out-of-range cause with its count", () => {
    const input: BadgeInput = { ...allGreen, outOfRangeLookups: 4 };
    const text = badgeExplanation(deriveBadge(input), input);
    expect(text).toContain("4 smoke lookup(s)");
    expect(text).toContain("fabricated zero");
  });

  it("INVALID names the executed-differs cause", () => {
    const input: BadgeInput = { ...allGreen, executedDiffersFromConfigured: true };
    const text = badgeExplanation(deriveBadge(input), input);
    expect(text).toContain("executed different parameter values");
  });

  it("INVALID with both causes names both", () => {
    const input: BadgeInput = {
      ...allGreen,
      outOfRangeLookups: 2,
      executedDiffersFromConfigured: true,
    };
    const text = badgeExplanation(deriveBadge(input), input);
    expect(text).toContain("2 smoke lookup(s)");
    expect(text).toContain("executed different parameter values");
  });

  it("EXPLORATORY distinguishes modified preset, failed gate, and never-run gate", () => {
    const modified: BadgeInput = { ...allGreen, presetUnmodified: false };
    expect(badgeExplanation("EXPLORATORY", modified)).toContain("modifies a preset");

    const failedGate: BadgeInput = { ...allGreen, gateSubsetGreen: false };
    expect(badgeExplanation("EXPLORATORY", failedGate)).toContain("gate subset failed");

    const unknownGate: BadgeInput = { ...allGreen, gateSubsetGreen: null };
    expect(badgeExplanation("EXPLORATORY", unknownGate)).toContain("has not run");
  });

  it("ENGINE-CERTIFIED never claims an archive match", () => {
    const unknownArchive: BadgeInput = { ...allGreen, matchesArchive: null };
    expect(badgeExplanation("ENGINE-CERTIFIED", unknownArchive)).toContain(
      "no archive comparison",
    );
    const failedArchive: BadgeInput = { ...allGreen, matchesArchive: false };
    expect(badgeExplanation("ENGINE-CERTIFIED", failedArchive)).toContain(
      "did not match the certified archive",
    );
  });

  it("every state yields exactly one sentence", () => {
    for (const state of BADGE_STATES) {
      const text = badgeExplanation(state, allGreen);
      expect(text.length).toBeGreaterThan(0);
      // One sentence: a single terminal period, no sentence break inside.
      expect(text.trim().endsWith(".")).toBe(true);
      expect(text.trim().slice(0, -1)).not.toContain(". ");
    }
  });
});

describe("diffParams", () => {
  it("returns [] when executed equals configured", () => {
    const params = { a: 1, b: 2.5, c: 0 };
    expect(diffParams(params, { ...params })).toEqual([]);
  });

  it("returns only the changed params, with both values", () => {
    const configured = { alpha: 1, beta: 2, gamma: 3 };
    const executed = { alpha: 1, beta: -2, gamma: 3 };
    expect(diffParams(configured, executed)).toEqual([
      { name: "beta", configured: 2, executed: -2 },
    ]);
  });

  it("a key missing from executed counts as differing (null on the executed side)", () => {
    expect(diffParams({ a: 1, b: 2 }, { a: 1 })).toEqual([
      { name: "b", configured: 2, executed: null },
    ]);
  });

  it("a key missing from configured counts as differing (null on the configured side)", () => {
    expect(diffParams({ a: 1 }, { a: 1, z: 9 })).toEqual([
      { name: "z", configured: null, executed: 9 },
    ]);
  });

  it("rows are sorted by name regardless of insertion order", () => {
    const configured = { zed: 1, mid: 2, abc: 3 };
    const executed = { zed: 10, mid: 20, abc: 30 };
    expect(diffParams(configured, executed).map((r) => r.name)).toEqual(["abc", "mid", "zed"]);
  });

  it("uses Object.is: NaN equals itself, +0 and -0 differ", () => {
    expect(diffParams({ a: Number.NaN }, { a: Number.NaN })).toEqual([]);
    expect(diffParams({ a: 0 }, { a: -0 })).toEqual([
      { name: "a", configured: 0, executed: -0 },
    ]);
  });
});

describe("ExecutedDiff copy", () => {
  it("pins the INVALID banner wording", () => {
    expect(EXECUTED_DIFF_BANNER).toBe(
      "The engine executed different values than configured - results are INVALID for the configured claim.",
    );
  });

  it("renders the 41/41 empty state from the configured param count", () => {
    expect(executedDiffEmptyLine(41)).toBe("Executed = configured (41/41 params)");
  });

  it("never renders a missing value as a number", () => {
    expect(formatParamValue(null)).toBe("(missing)");
    expect(formatParamValue(7)).toBe("7");
  });
});

describe("BadgePanel pure helpers", () => {
  it("maps every badge state to its Okabe-Ito color", () => {
    expect(badgeColor("ARCHIVE-VALIDATED")).toBe("#009E73");
    expect(badgeColor("ENGINE-CERTIFIED")).toBe("#0072B2");
    expect(badgeColor("EXPLORATORY")).toBe("#E69F00");
    expect(badgeColor("INVALID")).toBe("#D55E00");
    for (const state of BADGE_STATES) {
      expect(BADGE_COLORS[state]).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("renders the exact provenance class labels, and null when no numbers exist", () => {
    expect(provenanceLabel("archived")).toBe(PROVENANCE_CLASSES.archived);
    expect(provenanceLabel("live")).toBe(PROVENANCE_CLASSES.live);
    expect(provenanceLabel("archived")).toBe("Certified Java run");
    expect(provenanceLabel("live")).toBe("Live browser simulation");
    expect(provenanceLabel(null)).toBeNull();
  });
});
