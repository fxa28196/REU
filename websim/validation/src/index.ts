/**
 * Validation plane — the tier vocabulary plus the ported gate harness.
 *
 * WP8 lands the first real tenants: `harness/` holds the transcribed
 * `verify_E_runs.py` gates (f)(g)(h)(i)(k)(l) and the Tier-2 R3 identity
 * comparator, all of which read raw-text frames and therefore run equally over
 * an archived run directory and over the TS engine's own output. WP9 adds the
 * remaining gates ((b)(c)(d)(e)(j)), verify_2026, analyze_run, the replay
 * runner over the LFS working set, the Tier-4 divergence-attribution report and
 * the harness mutation test.
 */

export * from "./harness/index.js";
export * from "./provenance.js";

export interface TierSpec {
  readonly tier: 0 | 1 | 2 | 3 | 4;
  readonly name: string;
  /** True when the tier is a release gate that must be green in CI. */
  readonly releaseGate: boolean;
}

/** Tier ladder (plan §5.1). Release gate: Tiers 0–3 green; Tier 4 reviewed. */
export const TIER_LADDER: readonly TierSpec[] = [
  { tier: 0, name: "component bit-parity", releaseGate: true },
  { tier: 1, name: "initial-world identity", releaseGate: true },
  { tier: 2, name: "own-engine R3", releaseGate: true },
  { tier: 3, name: "statistical cross-validation vs archive", releaseGate: true },
  { tier: 4, name: "structural identity where the shuffle is inert", releaseGate: false },
];

/**
 * Gate subset cheap enough to run in the browser after every user run; feeds the
 * badge (plan §5.2). Ids match the verify_E_runs letters plus two identities.
 */
export const IN_BROWSER_GATES = ["b", "d", "e", "l", "oor-zero", "bed-sum"] as const;
export type InBrowserGate = (typeof IN_BROWSER_GATES)[number];

/**
 * Missing archive data degrades loudly — the harness never reports a skipped
 * gate as a passing gate (plan §5.3, risk W18).
 */
export const MISSING_ARCHIVE_POLICY = "fail-loudly" as const;
