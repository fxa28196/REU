/**
 * claims.ts — the websim claim registry consumed by `npm run lint:claims`.
 *
 * This is the TypeScript counterpart of the repo-root `docs/claims.yaml` +
 * `scripts/lint_claims.py` pair, scoped to `websim/**`. It runs from WP0 day 1
 * (plan §5.3, risk W19) so that retired claims and the two never-regress
 * citation/severity gotchas cannot re-enter the web deliverable through UI copy,
 * preset labels, tooltips, JSON asset metadata or documentation.
 *
 * NOTE FOR READERS: this file deliberately contains the banned strings — they
 * are the patterns. It is therefore quarantined from the scan (see QUARANTINE
 * below), and so is its test file. Nothing else in `websim/` may contain them.
 *
 * Entry fields
 *   id          stable slug; appears in linter output and in README references.
 *               Ids never embed a banned token, so prose may cite a rule by id.
 *   status      live | corrected | corrected-pending | refuted | retired | banned
 *               Everything except `live` is scanned for; `live` entries exist to
 *               document why a superficially similar string is acceptable.
 *   pattern     RegExp applied to whole-file text (the `g` flag is added if absent).
 *   why         why the claim has this status AND the pattern's precision
 *               rationale (how false positives are avoided).
 *   replacement what to say instead (required for corrected / corrected-pending).
 *   backstopFor id of the specific rule this rule backs up. A backstop hit is
 *               suppressed when it overlaps a hit from the rule it backs, so a
 *               single sentence produces one finding, not two.
 */

export type ClaimStatus =
  | "live"
  | "corrected"
  | "corrected-pending"
  | "refuted"
  | "retired"
  | "banned";

export interface ClaimRule {
  readonly id: string;
  readonly status: ClaimStatus;
  readonly pattern: RegExp;
  readonly why: string;
  readonly replacement?: string;
  readonly backstopFor?: string;
}

export const CLAIM_RULES: readonly ClaimRule[] = [
  // ------------------------------------------------- never-regress gotcha 1 ---
  {
    id: "banned-citation",
    status: "banned",
    pattern: /\bEvers\b[^\n]{0,24}?(?:et\s+al\.?|\(?(?:19|20)\d{2}\)?)/gi,
    why:
      "Never-regress gotcha 1 (PORT_MAP §6.4). The gamma_vuln sign is sourced to " +
      "Coughlan, Huber-Stearns, Clark & Deak 2022 (EWP WP 111, UO/OHA, n=1,200, " +
      "Scholars' Bank 1794/27179). The 'Evers et al. 2022' citation does not exist " +
      "and any reappearance is a regression. Precision: flags the surname only when " +
      "an 'et al.' or a 4-digit year follows within 24 same-line characters, i.e. " +
      "citation shape; the bare surname is left to the backstop rule below.",
    replacement:
      "Coughlan, Huber-Stearns, Clark & Deak 2022 (EWP Working Paper 111). Magnitude " +
      "remains an assumption swept 0 to +0.5.",
  },
  {
    id: "banned-citation-mention",
    status: "banned",
    backstopFor: "banned-citation",
    pattern: /\bEvers\b/gi,
    why:
      "Backstop for banned-citation: the surname has no legitimate use anywhere in " +
      "websim/, so any occurrence — including reformatted or line-wrapped citation " +
      "forms the specific pattern would miss — is a finding.",
    replacement: "Coughlan, Huber-Stearns, Clark & Deak 2022 (EWP Working Paper 111).",
  },

  // ------------------------------------------------- never-regress gotcha 2 ---
  {
    id: "banned-severity-comparison",
    status: "banned",
    pattern:
      /(?:comparable|equivalent|similar|on\s+par|akin|match(?:es|ed|ing)?|rival(?:s|ed|ling)?|as\s+(?:bad|severe|high|smoky))[^.\n]{0,40}Palisades|Palisades[^.\n]{0,40}(?:worst[\s-]+hour|worst\s+hourly|peak\s+hour|equivalent|comparable|scale|level)|Palisades[-\s](?:equivalent|scale|level|anchored)/gi,
    why:
      "Never-regress gotcha 2 (PORT_MAP §6.4, V47/A-33). Framing the constructed " +
      "severe series as matching the January 2025 Los Angeles fires' worst hour is " +
      "FALSE: the LA regulatory hourly maximum was 301.1 ug/m3, below Portland's own " +
      "observed 562.7. Precision: requires a comparison frame within 40 same-sentence " +
      "characters, so the finding names the phrasing, not the word.",
    replacement:
      "Anchor the v2 severe series to Canberra Florey 2,496.1 ug/m3 (5-6 Jan 2020, ACT " +
      "dataset 94a5-zqnn); scale 4.436 = 2496.1 / 562.7. Always carry the constructed-" +
      "counterfactual label.",
  },
  {
    id: "banned-severity-mention",
    status: "banned",
    backstopFor: "banned-severity-comparison",
    pattern: /\bPalisades\b/gi,
    why:
      "Backstop for banned-severity-comparison. websim's severe series is " +
      "Canberra-anchored, so the place name has no legitimate use in this tree at " +
      "all — including in a negated sentence, which readers quote out of context.",
    replacement: "Canberra Florey 2,496.1 ug/m3 (5-6 Jan 2020) is the v2 anchor.",
  },

  // ---------------------------------------------------- retired-phrase class ---
  {
    id: "checks-37-of-37",
    status: "refuted",
    pattern: /(?<![\d/])37\/37(?![\d/])/g,
    why:
      "'37/37 checks pass' is false: true per-run check counts are 32+2n = 104 (A/B) " +
      "and 124 (C), and 37/37 belongs to the retired 2-shelter baseline " +
      "(09-SYSTEM-AUDIT.md section 2.6). Precision: lookarounds keep longer digit or " +
      "date strings (137/370, 2026/07/28) from matching.",
  },
  {
    id: "gate-resolvable-doi",
    status: "corrected",
    pattern: /resolvable DOI/gi,
    why:
      "The pre-run registry gate checks that the source field is non-empty; it never " +
      "tested DOI resolvability ('D99'/'TODO' pass). Precision: exact literal, which " +
      "has no acceptable use.",
    replacement:
      "The gate checks that the source field is non-empty. A real resolvability check " +
      "is an open action item.",
  },
  {
    id: "same-beds-better-placed-slogan",
    status: "retired",
    pattern: /same beds,? better place[sd]/gi,
    why:
      "The slogan encodes the refuted placement attribution: the POOL control (D1) " +
      "reproduced arm C's sheltered count from ten randomly drawn candidate sites, so " +
      "the headcount gain is dispersion, not optimised placement.",
    replacement:
      "'Same beds, more doors' for access. Placement credit survives only for walking " +
      "distance, conditional on perfect information.",
  },
  {
    id: "second-best-intervention-free",
    status: "refuted",
    pattern: /second[-\s]best intervention is free/gi,
    why:
      "Rides on the refuted placement attribution and ignores the ten new sites' " +
      "siting and operating cost. Precision: exact phrase, hyphen or space.",
  },
  {
    id: "intervention-ranking-claim",
    status: "refuted",
    pattern: /ranking[^.\n]{0,80}unambiguous|unambiguous[^.\n]{0,80}ranking/gi,
    why:
      "The intervention ranking is exactly what the POOL control refuted. Precision: " +
      "context window of 80 same-sentence characters, so ordinary uses of " +
      "'unambiguous' never flag. The id deliberately avoids the word 'unambiguous' " +
      "so that prose can cite this rule without tripping it.",
  },
  {
    id: "attribution-96-placement-phrasing",
    status: "refuted",
    pattern:
      /better[-\s]placed sites shelters 96\.0|(?:put|spend)[a-z ]{0,30}(?:it|them|the same beds)\s+in better places?,? and you get 96%|ten new well-placed shelters/gi,
    why:
      "Attribution phrasings around the 96.0% headline, all refuted by the POOL " +
      "control. Precision: only the three known phrasings; the bare number 96.0 is " +
      "registered live below.",
  },
  {
    id: "mobility-19-2-held-exactly",
    status: "refuted",
    pattern:
      /marginal[^.\n]{0,40}held exactly|held exactly[^.\n]{0,60}(?:marginal|0\.192|19\.2)|(?:0\.192|19\.2%?)[^.\n]{0,40}held exactly/gi,
    why:
      "The 0.152163/0.347802 constants were solved against the 2019 PIT 55+ share, " +
      "but the sampler uses Pathways age weights, giving a coded expectation of " +
      "0.2033. Precision: 'held exactly' flags only near the marginal figures, so " +
      "'held exactly one space per person' does not match.",
  },
  {
    id: "tautology-this-is-the-finding",
    status: "retired",
    pattern:
      /This is the finding|The finding that matters most|The three sentences that matter/gi,
    why:
      "Arm B's empty-beds-vs-refusals near-equality is an identity forced by capacity " +
      "== population, a design consequence rather than a discovery, and must not be " +
      "crowned. Precision: three literal phrases only.",
  },
  {
    id: "signal-28x-within-noise",
    status: "retired",
    pattern: /28\s*(?:times|[x×])[\s\S]{0,15}the\s+within/gi,
    why:
      "Seed-to-seed spread is not a noise model for structural uncertainty, and the " +
      "pooled nine-seed treatment understates CI widths by up to 46%. Precision: " +
      "requires the 'the within...' continuation across markup and line wraps.",
  },
  {
    id: "campsite-deduplicate-claim",
    status: "refuted",
    pattern: /de-duplicate to distinct places/gi,
    why:
      "No de-duplication exists anywhere in ContextCreator; the campsite file holds " +
      "3,317 distinct coordinates from 3,400 reports. Precision: exact literal.",
  },
  {
    id: "campsite-2981-distinct",
    status: "corrected",
    pattern: /2,981 distinct/g,
    why:
      "2,981 is a seed-42 sampling outcome, not a property of the data file. " +
      "Precision: literal '2,981 distinct'.",
    replacement:
      "2,981 distinct start locations realised in one run (A2026-seed42); the source " +
      "file has 3,317 distinct coordinates from 3,400 reports.",
  },
  {
    id: "network-small-fragments",
    status: "refuted",
    pattern: /rest are small fragments/gi,
    why:
      "The second component alone holds 28,407 of the 28,901 off-giant nodes (31.8% " +
      "of the graph) and is where most arm-A shelters and campsites sit. Precision: " +
      "anchored phrase; legitimate uses of 'fragment' never flag.",
  },
  {
    id: "last-arrival-tick-1539-global",
    status: "corrected",
    pattern: /tick 1,539|hour 25\.7|\bh25\.7|last arrival in any run/gi,
    why:
      "Tick 1,539 (h25.7) is the seed-42 arm-C value, not a global maximum. " +
      "Precision: the 'tick ' prefix is required so long digit runs never flag.",
    replacement:
      "The last arrival across all 27 production runs is tick 1,973 (h32.9, seed 46); " +
      "tick 1,539 is per-seed.",
  },
  {
    id: "pre-u27-refused-counts",
    status: "retired",
    pattern:
      /4,766|refuses 562|562 people|562 turned away|562 of them|refusals to 256|cuts refusals to 256/gi,
    why:
      "Pre-U-27 headline counts (A 4,766 / B 562 / C 256 refused) were superseded by " +
      "the corrected-graph values 4,754 / 550 / 244 at commit f5eae57. Precision: the " +
      "'562' alternatives all carry disambiguating context words, so the measured " +
      "smoke peak 562.7 never flags.",
  },
  {
    id: "pre-u27-unreachable-16",
    status: "retired",
    pattern: /16, 16,? ?16|\b16 residents cannot|\b16 people who cannot|16 could\s+reach no|at 16 at seed 42/gi,
    why:
      "The pre-U-27 unreachable count (16 at seed 42) was superseded by 28 on the " +
      "pedestrian-legal graph. Precision: context-anchored alternatives only; bare " +
      "'16' (dates, hours) never flags.",
  },
  {
    id: "pre-correction-gap-values",
    status: "retired",
    pattern: /13\.0 to 24\.5|24\.5 percentage|gap from 13\.0|71\.9%? to 85\.7|back to 12\.9|24\.4 ?pp|to 0\.1 ?pp/gi,
    why:
      "The pre-correction mobility-gap trajectory (13.0 -> 24.5 -> 12.9 pp) was " +
      "superseded by the corrected-graph values 12.5 -> 23.7 -> 12.5.",
  },
  {
    id: "calibration-1-52-overpredict",
    status: "corrected-pending",
    pattern:
      /1\.52(?![^\n]{0,100}15\.6)[^.\n]{0,60}over[-\s]?predict|over[-\s]?predict[a-z]*(?![^\n]{0,100}15\.6)[^.\n]{0,60}1\.5\d?/gi,
    why:
      "The 1.52x point estimate hides that the single occupancy record is censored; " +
      "the true bracket is 1.5-15.6x. Precision: a negative lookahead suppresses the " +
      "match when '15.6' appears within 100 same-line characters, so the sanctioned " +
      "bracket wording passes while the naked point claim fails.",
    replacement:
      "Report the censored bracket: the model over-predicts the one observed occupancy " +
      "record by 1.5-15.6x (1.52x is the uncensored lower edge). Final number pending " +
      "the U-12 recalibration.",
  },
  {
    id: "or-123-rule-recovery",
    status: "corrected",
    pattern:
      /rediscover[a-z]* the (?:triage )?(?:admission )?(?:rule|reserve)|the reserve, (?:rediscovered|learned back)|odds ratio (?:of )?~?12[0-9]\b|OR ≈ ?12[0-9]\b|mobility OR ~?12[0-9]\b/gi,
    why:
      "Quoting a large conditional odds ratio as a discovery is wrong twice over: the " +
      "marginal OR is about 1, and the conditional coefficient sits on cells at " +
      "exactly 100% access (quasi-separation). Precision: flags the discovery framing " +
      "and the naked 12x number; sanity-check phrasing passes.",
    replacement:
      "The arm-D mobility coefficient is the logit recovering the admission rule we " +
      "wrote — a pipeline sanity check, not a discovery. The equity result is " +
      "marginal: 91.7% vs 92.0% pooled.",
  },
  {
    id: "aqi-category-55-5",
    status: "banned",
    pattern:
      /55\.5(?![^.\n]{0,40}\b(?:never|not|isn't|is not|rather than)\b)[^.\n]{0,40}\bAQI\b|\bAQI\b(?![^.\n]{0,40}\b(?:never|not|isn't|is not|rather than)\b)[^.\n]{0,40}55\.5/gi,
    why:
      "55.5 ug/m3 is a PM2.5 concentration threshold, never an air-quality-index " +
      "category (PORT_MAP §6.5). Precision: a negation lookahead lets an explicit " +
      "denial through, so honesty copy can state the distinction; only an assertive " +
      "pairing of the number with the index flags.",
    replacement:
      "Label 55.5 ug/m3 a concentration threshold and give the units; do not attach an " +
      "index category name to it.",
  },

  // ------------------------------------------------------------------- live ---
  {
    id: "headline-96-0-number",
    status: "live",
    pattern: /96\.0/g,
    why:
      "The number itself reproduces from primary run outputs (seed-42 arm C 6,570 of " +
      "6,842 = 96.0%) and survived the U-27 freeway filter bit-for-bit. Only the " +
      "placement-attribution phrasings around it are non-live. Registered live so the " +
      "linter documents the distinction and ignores the bare figure.",
  },
];

/**
 * Authored files that legitimately contain banned strings, with the reason. The
 * linter reports the quarantine count on every run, and a unit test pins this
 * list exactly so it cannot grow silently into an escape hatch.
 *
 * Paths are POSIX, relative to `websim/`.
 */
export interface QuarantineEntry {
  readonly path: string;
  readonly reason: string;
}

export const QUARANTINE: readonly QuarantineEntry[] = [
  {
    path: "docs/IMPLEMENTATION_PLAN.md",
    reason:
      "Verbatim copy of the authoritative plan; it names the banned phrasings in " +
      "order to ban them. Read-only reference, not a deliverable.",
  },
  {
    path: "docs/PORT_MAP.md",
    reason:
      "Verbatim copy of the authoritative engine reference; §6.4 quotes the banned " +
      "phrasings as the never-regress gotchas. Read-only reference, not a deliverable.",
  },
  {
    path: "tools/claims.ts",
    reason: "The rule definitions themselves — the banned strings are the patterns.",
  },
  {
    path: "tools/test/lint-claims.test.ts",
    reason:
      "Seeded violation fixtures: the tests prove detection, so they must contain the " +
      "strings being detected.",
  },
];

/**
 * Generated or vendored files excluded from the scan. These are not authored
 * prose and carry no claims; lockfile integrity hashes are base64 and can
 * contain digit/slash runs that resemble retired numeric claims.
 */
export const EXCLUDED_FILE_NAMES: ReadonlySet<string> = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

/** Directory names never descended into. */
export const EXCLUDED_DIR_NAMES: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  ".github",
  "dist",
  "build",
  "coverage",
  ".vite",
  ".turbo",
  ".cache",
]);

/** Paths (POSIX, relative to websim/) never descended into. */
export const EXCLUDED_DIR_PATHS: ReadonlySet<string> = new Set([
  "pipeline/out",
  "pipeline/local-raw",
]);

/**
 * Extensions scanned. JSON is scanned as raw text rather than parsed, which
 * covers both string values and keys — strictly stronger than walking values.
 */
export const SCANNED_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".jsonc",
  ".md",
  ".mdx",
  ".html",
  ".css",
  ".svg",
  ".yml",
  ".yaml",
  ".txt",
]);
