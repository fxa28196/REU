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
 * (b)(c)(d)(e)(j) are NOT here — they are WP9's, and live in `../gates/`.
 * `pipeline/src/archive/digest.ts` computes (b), (d), (e) and an aggregate form
 * of (l) as bundle gates. Claiming them here would misdescribe what has been
 * ported.
 *
 * WP9 adds five modules to this barrel, none of which is a gate:
 *
 * | module | what it is |
 * |---|---|
 * | `java-defaults` | `ContextCreator`'s parameter fallback table, so a pre-Phase-E manifest can be replayed without inventing values |
 * | `working-set-replay` | the replay runner over the curated working set, driven from archived EXECUTED manifests |
 * | `tier3-golden` | Tier-3 comparisons against the committed golden-summary digests |
 * | `tier3-replay` | points the ported gate suite at a replayed run — the right instrument per run class |
 * | `tier4-census` | the exact bit-match census and the attribution of every divergence in it |
 */

export * from "./archive-replay.js";
export * from "./java-defaults.js";
export * from "./working-set-replay.js";
export * from "./tier3-golden.js";
export * from "./tier3-replay.js";
export * from "./tier4-census.js";
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
