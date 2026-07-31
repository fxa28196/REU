/**
 * Tests for the websim claim linter.
 *
 * Three obligations, in order of importance:
 *   1. the linter DETECTS every registered rule (seeded fixture strings);
 *   2. the linter does NOT fire on the sanctioned phrasings that sit closest to
 *      each ban (negative fixtures — the false-positive traps);
 *   3. the real `websim/` tree is currently clean.
 *
 * This file is quarantined from the scan (tools/claims.ts QUARANTINE) because
 * the fixtures below necessarily contain the strings being detected.
 */

import { describe, expect, it } from "vitest";

import {
  CLAIM_RULES,
  QUARANTINE,
  type ClaimRule,
} from "../claims.js";
import { collectFiles, scanText, scanTree } from "../scan.js";

const ACTIVE_RULES = CLAIM_RULES.filter((r) => r.status !== "live");

function ruleIds(text: string): string[] {
  return [...new Set(scanText(text).map((h) => h.ruleId))].sort();
}

/** One seeded violation per active rule. */
const POSITIVE_FIXTURES: ReadonlyArray<{ rule: string; text: string }> = [
  {
    rule: "banned-citation",
    text: "The gamma_vuln sign is sourced to Evers et al. 2022 for the vulnerable stratum.",
  },
  {
    rule: "banned-citation",
    text: "Vulnerability weighting follows Evers (2022), swept 0 to +0.5.",
  },
  {
    rule: "banned-citation-mention",
    text: "See the Evers working paper for the sign of the vulnerability term.",
  },
  {
    rule: "banned-severity-comparison",
    text: "The severe v2 peak is comparable to the Palisades worst hour.",
  },
  {
    rule: "banned-severity-comparison",
    text: "Series 2 is a Palisades-equivalent counterfactual for Multnomah County.",
  },
  {
    rule: "banned-severity-mention",
    text: "The Palisades fires happened in a different airshed entirely.",
  },
  { rule: "checks-37-of-37", text: "All 37/37 checks pass across all 27 runs." },
  {
    rule: "gate-resolvable-doi",
    text: "The model refuses to start if a variable lacks a resolvable DOI.",
  },
  {
    rule: "same-beds-better-placed-slogan",
    text: "Headline slide: SAME BEDS, BETTER PLACED.",
  },
  {
    rule: "second-best-intervention-free",
    text: "The study finds that the second-best intervention is free.",
  },
  {
    rule: "intervention-ranking-claim",
    text: "The ranking of the three interventions is unambiguous.",
  },
  {
    rule: "attribution-96-placement-phrasing",
    text: "Ten new well-placed shelters lift access to 96.0%.",
  },
  {
    rule: "mobility-19-2-held-exactly",
    text: "The local marginal is held exactly by the sampler constants.",
  },
  { rule: "tautology-this-is-the-finding", text: "This is the finding." },
  {
    rule: "signal-28x-within-noise",
    text: "The between-arm signal is roughly 28x the within-arm noise.",
  },
  {
    rule: "campsite-deduplicate-claim",
    text: "From the complaint reports we de-duplicate to distinct places.",
  },
  {
    rule: "campsite-2981-distinct",
    text: "The file contains 2,981 distinct real locations.",
  },
  {
    rule: "network-small-fragments",
    text: "The main piece holds most intersections; the rest are small fragments.",
  },
  {
    rule: "last-arrival-tick-1539-global",
    text: "The last arrival in any run is tick 1,539.",
  },
  {
    rule: "pre-u27-refused-counts",
    text: "Arm B leaves 578 beds empty while 562 turned away.",
  },
  {
    rule: "pre-u27-unreachable-16",
    text: "Exactly 16 residents cannot reach any shelter at all.",
  },
  {
    rule: "pre-correction-gap-values",
    text: "The mobility gap moves 13.0 to 24.5 pp between arms.",
  },
  {
    rule: "calibration-1-52-overpredict",
    text: "The model over-predicts the observed occupancy record by 1.52x.",
  },
  {
    rule: "or-123-rule-recovery",
    text: "The classifier rediscovered the admission rule on its own.",
  },
  {
    rule: "aqi-category-55-5",
    text: "The 55.5 line is the AQI category boundary drawn on the strip chart.",
  },
];

/** Sanctioned phrasings that must stay green — the false-positive traps. */
const NEGATIVE_FIXTURES: ReadonlyArray<{ label: string; text: string }> = [
  {
    label: "the corrected gamma_vuln citation",
    text: "Vulnerability sign: Coughlan, Huber-Stearns, Clark & Deak 2022 (EWP WP 111).",
  },
  {
    label: "the Canberra-anchored severity statement",
    text: "Severe v2 is anchored to Canberra Florey 2,496.1 ug/m3 (5-6 Jan 2020); scale 4.436.",
  },
  {
    label: "the observed 2020 peak",
    text: "Observed series peak: 562.7 ug/m3 mean across monitors, 588.9 single-monitor.",
  },
  {
    label: "the default population",
    text: "Fresh runs use 2,037 agents at seed 42, 1-minute ticks, up to 455 h.",
  },
  {
    label: "digit runs that merely contain 37/37",
    text: "Checksums 137/370 written on 2026/07/28 are unrelated to any check count.",
  },
  {
    label: "the sanctioned censored calibration bracket",
    text: "The model over-predicts the one occupancy record by 1.5-15.6x; 1.52x is the lower edge.",
  },
  {
    label: "the concentration-threshold denial",
    text: "55.5 ug/m3 is a threshold, not an AQI category.",
  },
  {
    label: "the live 96.0 headline number",
    text: "Arm C shelters 6,570 of 6,842 agents at seed 42, or 96.0%.",
  },
  {
    label: "capacity phrasing that contains 'held exactly'",
    text: "Each bed is held exactly one space per person for the whole run.",
  },
  {
    label: "an ordinary use of 'unambiguous'",
    text: "The executed manifest makes the parameter set unambiguous.",
  },
];

describe("claim registry", () => {
  it("has unique, non-empty rule ids", () => {
    const ids = CLAIM_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length > 0)).toBe(true);
  });

  it("documents every rule and gives a replacement wherever one is required", () => {
    for (const rule of CLAIM_RULES) {
      expect(rule.why.length, `rule ${rule.id} has no rationale`).toBeGreaterThan(40);
      if (rule.status.startsWith("corrected")) {
        expect(rule.replacement, `rule ${rule.id} is ${rule.status} but has no replacement`)
          .toBeTruthy();
      }
    }
  });

  it("points every backstop at a real specific rule", () => {
    const ids = new Set(CLAIM_RULES.map((r) => r.id));
    for (const rule of CLAIM_RULES) {
      if (rule.backstopFor === undefined) continue;
      expect(ids.has(rule.backstopFor), `${rule.id} backs a missing rule`).toBe(true);
    }
  });

  it("never lets a rule id embed a banned token (prose must be able to cite ids)", () => {
    const selfReferential = CLAIM_RULES.filter(
      (r: ClaimRule) => scanText(r.id).length > 0,
    ).map((r) => r.id);
    expect(selfReferential).toEqual([]);
  });

  it("exercises every active rule with at least one seeded fixture", () => {
    const covered = new Set(POSITIVE_FIXTURES.map((f) => f.rule));
    const uncovered = ACTIVE_RULES.map((r) => r.id).filter((id) => !covered.has(id));
    expect(uncovered, "every active rule needs a seeded violation fixture").toEqual([]);
  });
});

describe("detection of seeded violations", () => {
  for (const fixture of POSITIVE_FIXTURES) {
    it(`flags ${fixture.rule}: ${JSON.stringify(fixture.text.slice(0, 48))}`, () => {
      expect(ruleIds(fixture.text)).toContain(fixture.rule);
    });
  }

  it("reports line and column of the offending text", () => {
    const text = ["clean line", "also clean", "  All 37/37 checks pass."].join("\n");
    const hits = scanText(text, "fixture.md");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      file: "fixture.md",
      line: 3,
      column: 7,
      ruleId: "checks-37-of-37",
      status: "refuted",
      matched: "37/37",
    });
  });

  it("collapses a backstop hit into the specific rule's finding", () => {
    const ids = ruleIds("The peak is comparable to the Palisades worst hour.");
    expect(ids).toEqual(["banned-severity-comparison"]);
  });

  it("still fires the backstop when the specific pattern misses", () => {
    const ids = ruleIds("Nothing here resembles the Palisades airshed.");
    expect(ids).toEqual(["banned-severity-mention"]);
  });
});

describe("sanctioned phrasings stay green", () => {
  for (const fixture of NEGATIVE_FIXTURES) {
    it(`does not flag ${fixture.label}`, () => {
      expect(scanText(fixture.text, fixture.label)).toEqual([]);
    });
  }
});

describe("the real websim tree", () => {
  const scan = scanTree();

  it("is currently clean", () => {
    const rendered = scan.hits
      .map((h) => `${h.file}:${h.line}:${h.column} ${h.ruleId} -> '${h.matched}'`)
      .join("\n");
    expect(rendered).toBe("");
    expect(scan.hits).toEqual([]);
  });

  it("actually scanned the deliverable files", () => {
    expect(scan.filesScanned).toContain("README.md");
    expect(scan.filesScanned).toContain("package.json");
    expect(scan.filesScanned).toContain("shared/src/index.ts");
    expect(scan.filesScanned.length).toBeGreaterThan(20);
  });

  it("excludes dependencies, lockfiles and generated asset output", () => {
    for (const rel of scan.filesScanned) {
      expect(rel.startsWith("node_modules/")).toBe(false);
      expect(rel.includes("/node_modules/")).toBe(false);
      expect(rel).not.toBe("package-lock.json");
      expect(rel.startsWith("pipeline/out/")).toBe(false);
      expect(rel.startsWith("pipeline/local-raw/")).toBe(false);
    }
  });

  it("finds real text through the file walker, not just in memory", () => {
    const probe: ClaimRule = {
      id: "probe-engine-name",
      status: "banned",
      pattern: /websim-ts/g,
      why: "test probe proving the walker reads files and attributes hits to them",
    };
    const probed = scanTree(undefined, [probe]);
    expect(probed.hits.map((h) => h.file)).toContain("engine/src/index.ts");
  });

  it("keeps the quarantine list exactly as reviewed", () => {
    expect(QUARANTINE.map((q) => q.path)).toEqual([
      "docs/IMPLEMENTATION_PLAN.md",
      "docs/PORT_MAP.md",
      "tools/claims.ts",
      "tools/test/lint-claims.test.ts",
    ]);
    for (const entry of QUARANTINE) {
      expect(entry.reason.length, `${entry.path} needs a reason`).toBeGreaterThan(30);
    }
  });

  it("has no stale quarantine entry and never scans a quarantined file", () => {
    expect(scan.staleQuarantine).toEqual([]);
    const scanned = new Set(collectFiles());
    for (const entry of QUARANTINE) {
      expect(scanned.has(entry.path), `${entry.path} was scanned despite quarantine`).toBe(
        false,
      );
    }
  });
});
