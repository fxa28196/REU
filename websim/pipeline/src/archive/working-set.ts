/**
 * working-set.ts — the curated ~40 MB validation working set (plan §5.3, W18).
 *
 * The full archive is ~374 MB across 475 files and lives outside the repo.
 * Hosted CI cannot have it, so Tiers 1–3 run on a curated subset chosen to
 * exercise **every gate class** at least once. This module is the definition of
 * that subset — which runs, and *why each one is in it* — plus the gate-class
 * vocabulary the coverage check is written against.
 *
 * IMPORTANT — this is a manifest, not a payload. Committing the working set
 * itself (git-lfs, repo quota) is a user decision (plan §10 item 3), so nothing
 * here adds LFS or checks in a binary. The deliverable is:
 *
 *   - `working-set.manifest.json` — the run list, per-file SHA-256 and byte
 *     sizes, the coverage matrix, and the total size;
 *   - `verify-working-set.ts` — materialise (copy from a local archive) and/or
 *     verify a local working set against that manifest.
 *
 * The 9-seed envelope deliberately does NOT drive membership. Carrying all 27
 * three-arm runs would cost ~73 MB on its own; the envelope is instead published
 * as a committed digest in `validation/golden-summaries/sheltered-envelopes.json`,
 * which is exactly what golden summaries exist for. The working set carries
 * three seeds per arm so the *cross-seed* invariants (data_version_tag
 * constancy, pooled negative controls, seed-varying unreachable id sets) still
 * have real data.
 */

/** Gate classes the working set must cover, keyed to PORT_MAP §6.2 / plan §5.2. */
export const GATE_CLASSES = {
  "a-r3-identity": "R3 null identity: E0-null run vs its no-layer counterpart, shared-column projection",
  "b-bed-sum": "U-03 four-way bed sum",
  "c-asthma-negative-control": "asthma stratum speed/dose negative control (U-19)",
  "d-terminal-conservation": "closed terminal-state vocabulary, counts sum to n and numAgents",
  "e-unaware-immobility": "UNAWARE agents never travel and never get a start tick",
  "f-wachinger-acceptance": "at least one high-barrier resident still UNAWARE/PRE_EVAC at end",
  "g-e-census-plausibility": "realised vs configured decision-layer census within 3 binomial SE",
  "h-manifest-21-e-params": "all 21 Phase-E parameters present in the manifest",
  "i-manifest-7-se-params": "all 7 Scenario-E parameters present; closureDraw only at code 3",
  "j-severe-series-provenance": "456-slice severe series, peak scaling, out_of_range_lookups == 0",
  "k-closure-census": "closure block agrees with the schedule CSV; code 0 => block == {code}",
  "l-counter-identities": "blockages == push_throughs + reroutes; stuck_events <= push_throughs",
  "cap-sums": "capacity sums per arm (A 2234, B/C 6842)",
  "pop-cross-arm-hash": "population byte-identical across arms within a seed",
  "unreachable-id-hash": "UNREACHABLE id set identical across arms within a seed",
  "data-version-constancy": "data_version_tag constant across seeds within an arm",
  "exposure-identity": "never-sheltered exposure identity and vwe == dose",
  "analyze-run-recompute": "recomputed statistics vs manifest (atol 0.51, gini 5e-3)",
  "tier1-initial-world": "world-build identity fixtures (camp vector, demographics, seeds)",
  "closure-free-baseline": "no-closure control for the severe families",
} as const;

export type GateClass = keyof typeof GATE_CLASSES;

export interface WorkingSetEntry {
  /** Run directory, relative to the archive root. */
  readonly runDir: string;
  readonly why: string;
  readonly gateClasses: readonly GateClass[];
}

/**
 * The curated set. Ordered by role, not alphabetically, so the rationale reads
 * as an argument rather than a list.
 */
export const WORKING_SET: readonly WorkingSetEntry[] = [
  // -- three arms, three seeds: the statistical + cross-arm backbone ---------
  {
    runDir: "present-day-three-arm/A-seed42",
    why:
      "The flagship configuration. Capacity binds hard here (2,234 beds, 6,842 residents), " +
      "so arm A is the only arm where the within-tick order channel can move an outcome — " +
      "it is the Tier-4 attribution target and the Compare-screen validation demo.",
    gateClasses: [
      "b-bed-sum",
      "c-asthma-negative-control",
      "d-terminal-conservation",
      "cap-sums",
      "pop-cross-arm-hash",
      "unreachable-id-hash",
      "exposure-identity",
      "analyze-run-recompute",
      "tier1-initial-world",
    ],
  },
  {
    runDir: "present-day-three-arm/B-seed42",
    why:
      "Capacity == population, so admission never binds: the arm where a port should " +
      "reproduce per-agent rows structurally, and the control that isolates capacity from " +
      "placement against arm A.",
    gateClasses: ["b-bed-sum", "cap-sums", "pop-cross-arm-hash", "unreachable-id-hash"],
  },
  {
    runDir: "present-day-three-arm/C-seed42",
    why:
      "46 doors instead of 36 at the same bed count — the placement arm, and the only " +
      "three-arm run with the larger shelter table (a different CSV load order for the " +
      "closure-wave recompute).",
    gateClasses: ["b-bed-sum", "cap-sums", "pop-cross-arm-hash", "unreachable-id-hash"],
  },
  {
    runDir: "present-day-three-arm/A-seed43",
    why:
      "Second seed for arm A: makes data_version_tag constancy and the pooled negative " +
      "controls testable, and gives the unreachable id set a different value to prove the " +
      "hash is seed-sensitive rather than constant.",
    gateClasses: ["data-version-constancy", "unreachable-id-hash", "c-asthma-negative-control"],
  },
  {
    runDir: "present-day-three-arm/B-seed43",
    why: "Arm B at the second seed, so the cross-arm population hash is checked at more than one seed.",
    gateClasses: ["data-version-constancy", "pop-cross-arm-hash"],
  },
  {
    runDir: "present-day-three-arm/C-seed43",
    why: "Arm C at the second seed, completing the three-arm cross-arm identity at seed 43.",
    gateClasses: ["data-version-constancy", "pop-cross-arm-hash"],
  },

  // -- E0 nulls: the R3 identity vehicle -------------------------------------
  {
    runDir: "scenario-e/E0null-A-seed42",
    why:
      "The R3 null for arm A: the decision layer switched ON with every mechanism " +
      "degenerate, which must reproduce A-seed42 exactly. Paired with A-seed42 above, this " +
      "is the (a) gate. Taken from scenario-e/ rather than phase-e/ because it carries the " +
      "full 59-column schema, so the closure counters are present and provably zero.",
    gateClasses: ["a-r3-identity", "d-terminal-conservation", "k-closure-census", "l-counter-identities"],
  },
  {
    runDir: "scenario-e/E0null-B-seed42",
    why: "R3 null for arm B — proves the identity is not an arm-A coincidence.",
    gateClasses: ["a-r3-identity", "k-closure-census"],
  },
  {
    runDir: "scenario-e/E0null-C-seed42",
    why: "R3 null for arm C — the third and last geometry the null must reproduce.",
    gateClasses: ["a-r3-identity", "k-closure-census"],
  },

  // -- Phase E: the real decision layer --------------------------------------
  {
    runDir: "phase-e/ER-A-n6842-seed42",
    why:
      "Baseline-real decision layer: the only family with UNAWARE and PRE_EVAC survivors at " +
      "end of run, so it is the sole source of the (e) immobility and (f) Wachinger " +
      "acceptance gates and the 21-parameter manifest completeness check.",
    gateClasses: [
      "e-unaware-immobility",
      "f-wachinger-acceptance",
      "g-e-census-plausibility",
      "h-manifest-21-e-params",
    ],
  },

  // -- Scenario E v1: severe smoke + base closures ---------------------------
  {
    runDir: "scenario-e/SE-E18-seed42",
    why:
      "Severe v1: 456-slice constructed series over a 455-hour window — the configuration " +
      "the simulationHours <= slices-1 gotcha was found on — plus closuresCode 1 (one wave, " +
      "18 edges) for the closure census and counter identities.",
    gateClasses: [
      "i-manifest-7-se-params",
      "j-severe-series-provenance",
      "k-closure-census",
      "l-counter-identities",
    ],
  },
  {
    runDir: "scenario-e/SEnc-E18-seed42",
    why:
      "The no-closure control for SE-E18: identical severe smoke with closuresCode 0, so " +
      "any SE-vs-SEnc difference is attributable to closures alone. Also the code-0 case of " +
      "the (k) gate, where the closure block must reduce to {code}.",
    gateClasses: ["closure-free-baseline", "k-closure-census", "l-counter-identities"],
  },

  // -- Scenario E v2: worst-plausible -----------------------------------------
  {
    runDir: "scenario-e-v2/SE2-E18-d1-seed42",
    why:
      "Worst-plausible v2 at pre-committed draw 1: the highest-severity configuration the " +
      "app ships, closuresCode 3 (6 waves, 72 edges) so closureDraw is present and the " +
      "(i) gate's draw-only-at-code-3 rule has a positive case. Its manifest also records " +
      "the executed pushThetaThreshold = 0.0 that the honesty note is about.",
    gateClasses: [
      "i-manifest-7-se-params",
      "j-severe-series-provenance",
      "k-closure-census",
      "l-counter-identities",
    ],
  },
  {
    runDir: "scenario-e-v2/SE2nc-E18-seed42",
    why: "No-closure control for the v2 severity, completing the 2x2 (severity x closures) design.",
    gateClasses: ["closure-free-baseline", "k-closure-census"],
  },
];

/** Gate classes with no run carrying them — the coverage hole report. */
export function uncoveredGateClasses(
  set: readonly WorkingSetEntry[] = WORKING_SET,
): readonly GateClass[] {
  const covered = new Set<string>();
  for (const entry of set) {
    for (const g of entry.gateClasses) covered.add(g);
  }
  return (Object.keys(GATE_CLASSES) as GateClass[]).filter((g) => !covered.has(g));
}
