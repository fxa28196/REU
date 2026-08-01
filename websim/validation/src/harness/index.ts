/**
 * harness barrel — the WP8 subset of the ported gate suite.
 *
 * `IMPLEMENTATION_PLAN.md` §8 lists WP8's acceptance as "gates (f)(g)(i)(k)(l)
 * green" plus the flagship Tier-2 R3 identity; §5.2 assigns the full (a)–(l)
 * port to WP9. This module therefore ships exactly:
 *
 * | gate | module | what it holds |
 * |---|---|---|
 * | (f) | `gate-f-wachinger` | some high-barrier resident never departs |
 * | (g) | `gate-g-census` | realised shares within 3 binomial SE + 1e-4, twice |
 * | (h) | `gate-hi-manifest` | 21 Phase-E params, clean working tree |
 * | (i) | `gate-hi-manifest` | 7 Scenario-E params (+ `closureDraw` at code 3) |
 * | (k) | `gate-k-closures` | closure census vs the schedule CSV |
 * | (l) | `gate-l-counters` | counter identities, row-wise |
 * | (a) | `r3-identity` | the Tier-2 shared-projection byte identity |
 *
 * (b)(c)(d)(e)(j) are NOT here. Some of them exist in other shapes already —
 * `pipeline/src/archive/digest.ts` computes (b), (d), (e) and an aggregate form
 * of (l) as bundle gates — and the rest belong to WP9. Claiming them here would
 * misdescribe what has been ported.
 */

export * from "./archive-replay.js";
export * from "./checks.js";
export * from "./constants.js";
export * from "./frame.js";
export * from "./run-view.js";
export * from "./gate-f-wachinger.js";
export * from "./gate-g-census.js";
export * from "./gate-hi-manifest.js";
export * from "./gate-k-closures.js";
export * from "./gate-l-counters.js";
export * from "./r3-identity.js";
export * from "./r3-own-engine.js";
export * from "./driver.js";
