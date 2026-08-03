/**
 * catalogue.ts — WP9's mutation catalogue: the defects the gate suite is
 * REQUIRED to notice, and the measured magnitude at which it notices each.
 *
 * Plan §5.2 names two injections (a seed perturbation and one formatter
 * perturbation). This catalogue carries those two and six more, because the
 * project's own history says aggregate gates are insensitive in ways nobody
 * predicts:
 *
 *  - a **10 % movement step-length error** once passed all 1,084 tests
 *    (`engine/test/oracle/movement.oracle.test.ts` header, DR-FIXA);
 *  - a **0.012 % walking-ventilation error** (1.62 → 1.6202 m³/h) once passed
 *    the entire suite;
 *  - WP8's decision layer was bit-verified and **called from nowhere**;
 *  - the third WP8 acceptance gate deleted the whole wiring and the flagship
 *    test still passed 24/24.
 *
 * ## What a row means
 *
 * Every row is a real textual edit to real port source, applied to the working
 * tree, run against a real vitest child process, and reverted with the bytes
 * proven back by SHA-256. `smallestDetected` is **measured**, not asserted: the
 * runner walks the ladder from coarsest to finest and records the finest rung
 * that still turns the suite red. `detector` names the test that caught that
 * rung. `blindBelow` records the finest rung that everything stayed green for —
 * the honest statement of where sensitivity stops.
 *
 * ## Why the CI gate runs the FINEST detected rung
 *
 * Running the 10 % movement error would prove almost nothing: a gate that only
 * catches 10 % is the gate this project already knows how to be wrong with. The
 * gate runs the smallest rung that was measured to be detected, so a regression
 * in sensitivity — someone widening a tolerance, deleting an oracle row,
 * replacing a bit-comparison with `toBeCloseTo` — turns the job red even though
 * the port itself still works.
 *
 * ## Anchors are checked on every `npm test`
 *
 * `mutation-catalogue.test.ts` asserts every `find` string occurs **exactly
 * once** in its file. A refactor that moves the code makes the catalogue stale,
 * and a stale catalogue injects nothing and would prove nothing — so it fails
 * the ordinary suite rather than quietly passing the mutation job.
 */

/** One rung of an injection's magnitude ladder. */
export interface Rung {
  /** Stable id, used on the command line and in the report. */
  readonly id: string;
  /** Human-readable magnitude, e.g. "10 % (x1.1)" or "1 ULP". */
  readonly label: string;
  /** Exact source substring to replace. Must occur exactly once. */
  readonly find: string;
  /** Its replacement. */
  readonly replace: string;
}

export interface Detector {
  /** `websim/`-relative POSIX path of the test file that caught it. */
  readonly file: string;
  /** Substring of the failing test's full name. */
  readonly test: string;
}

export interface Injection {
  readonly id: string;
  readonly title: string;
  /** Why this defect is in the catalogue at all. */
  readonly why: string;
  /** `websim/`-relative POSIX path of the file that gets edited. */
  readonly file: string;
  /**
   * Vitest positional filters for the FAST scope: the files that plausibly own
   * this behaviour, plus enough neighbours that "nothing caught it" is a real
   * finding rather than an artefact of a narrow selection. The FULL scope
   * ignores this and runs everything.
   */
  readonly scope: readonly string[];
  /** Coarsest rung first. */
  readonly ladder: readonly Rung[];
  /**
   * MEASURED: the finest rung that turned the suite red, or `null` if every rung
   * left it green (a blind spot — see `blindSpot`).
   */
  readonly smallestDetected: string | null;
  /** MEASURED: which test caught `smallestDetected`. */
  readonly detector: Detector | null;
  /** MEASURED: the coarsest rung that everything stayed green for, if any. */
  readonly blindBelow: string | null;
  /**
   * `true` when the fast scope needs `pipeline/out` / `docs/runs` artifacts to
   * catch this. Injections marked `false` are provable on a clean clone and are
   * the ones the hosted CI job runs.
   */
  readonly needsArtifacts: boolean;
  /** Free-text note carried into the report — blind spots, surprises, caveats. */
  readonly note?: string;
}

/** A double bumped by exactly one ULP, written as an inline IIFE. */
const ULP_UP = (expr: string): string =>
  `(() => { const __v = ${expr}; const __b = new DataView(new ArrayBuffer(8)); ` +
  `__b.setFloat64(0, __v); __b.setBigUint64(0, __b.getBigUint64(0) + 1n); return __b.getFloat64(0); })()`;

const STEP = "engine/src/agents/step.ts";
const STATE = "engine/src/agents/stateMachine.ts";
const FORMAT = "engine/src/mathx/format.ts";
const STREAMS = "engine/src/rng/streams.ts";
const WORLD = "engine/src/world/build.ts";
const FIELD = "engine/src/smoke/field.ts";
const HAZARD = "engine/src/decision/hazard.ts";
const ELAYER = "engine/src/agents/eLayerSampler.ts";

/** The movement anchor, shared by four rungs. */
const STEP_FIND = "  const stepLengthM = walkingSpeedMps * 60 * minutesPerTick;";
const stepRung = (id: string, label: string, factor: string): Rung => ({
  id,
  label,
  find: STEP_FIND,
  replace: `  const stepLengthM = walkingSpeedMps * 60 * minutesPerTick * ${factor};`,
});

const VENT_FIND = "export const INHALATION_WALKING_M3H = 1.62;";
const ventRung = (id: string, label: string, value: string): Rung => ({
  id,
  label,
  find: VENT_FIND,
  replace: `export const INHALATION_WALKING_M3H = ${value};`,
});

const BRISK_FIND = "  return config.bRisk * (1.0 + (vulnerable ? config.gammaVuln : 0.0));";
const briskRung = (id: string, label: string, factor: string): Rung => ({
  id,
  label,
  find: BRISK_FIND,
  replace: `  return config.bRisk * ${factor} * (1.0 + (vulnerable ? config.gammaVuln : 0.0));`,
});

/**
 * The catalogue. `smallestDetected` / `detector` / `blindBelow` are filled in by
 * `run-mutation-gate.ts --measure`, which is the only sanctioned way to change
 * them: they are experimental results, not opinions.
 */
export const INJECTIONS: readonly Injection[] = [
  // -------------------------------------------------------------- plan §5.2
  {
    id: "seed.replay-run-seed",
    title: "seed perturbation — the replay's own run seed, +1",
    why:
      "Plan §5.2 names this one explicitly. `buildWorld` derives every stream from " +
      "`config.randomSeed`, so +1 here is the smallest possible perturbation of a replay: " +
      "same parameters, same assets, same archive bundle, one different integer.",
    file: WORLD,
    scope: [
      // `engine/test/worker/` carries the ONE ungated detector (see the note).
      // The whole directory rather than the single file, so "nothing else in the
      // worker plane noticed" stays a real finding rather than an artefact of a
      // one-file selection.
      "engine/test/worker/",
      "engine/test/world/",
      "engine/test/determinism/",
      "engine/test/rng/streams.test.ts",
    ],
    ladder: [
      {
        id: "plus1",
        label: "+1 (the smallest integer seed can move)",
        find: "  const seed = BigInt(Math.trunc(config.randomSeed));",
        replace: "  const seed = BigInt(Math.trunc(config.randomSeed)) + 1n;",
      },
    ],
    smallestDetected: "plus1",
    detector: {
      file: "engine/test/worker/world.census.test.ts",
      test: "reaches all six resident states",
    },
    blindBelow: null,
    needsArtifacts: false,
    note:
      "RE-MEASURED 2026-08-03 (`--measure --only seed.replay-run-seed --filter " +
      "engine/test/worker/,engine/test/world/,engine/test/determinism/," +
      "engine/test/rng/streams.test.ts --require-artifacts`): THREE failing tests, and " +
      "exactly ONE of them runs on a clean clone. `engine/test/world/tier1.parity.test.ts` " +
      "(gate engine:world-tier1-parity) and `engine/test/world/committed.parity.test.ts` (gate " +
      "engine:world-committed-oracle) both need the packed graph asset; " +
      "`engine/test/worker/world.census.test.ts` needs nothing - WP10's synthetic world is " +
      "built in memory through the real 12-step `buildWorld` - so it is the recorded " +
      "detector and this row is NO LONGER deferred. That reverses the previous measurement " +
      "(2026-08-02), which was taken while the WP10 file was absent and concluded that a " +
      "clean clone caught the plan's own named injection with NOTHING.\n" +
      "  READ THE MECHANISM BEFORE TRUSTING IT. The detector is a state-census assertion, " +
      "`expect(census.distinctStates).toBe(6)`; it catches a seed offset INCIDENTALLY, not " +
      "by design. Nothing in it compares a seed, a stream or a derived value. Measured " +
      "directly (build the synthetic world at randomSeed 42 vs 43 - `config.randomSeed` is " +
      "read in exactly one place, build.ts:280, so +1 IS seed 43): UNAWARE goes 1 -> 0 of " +
      "300 residents and distinctStates goes 6 -> 5. The margin is ONE resident. Nearly " +
      "every other census field moves too (SHELTERED 36 both ways, UNREACHABLE 38 -> 51, " +
      "REFUSED_ALL_FULL 216 -> 199, stuckEvents 19 -> 16, pushThroughs 58 -> 46), but the " +
      "test's other three assertions are `> 0` bounds and every one of them still holds at " +
      "seed 43 - which is why the whole file yields exactly ONE failing test, not four. The " +
      "detection rests entirely on that single agent staying unaware at seed 42. A legitimate change " +
      "to the synthetic world's tuning can therefore cost this row its detector without " +
      "touching the port - which turns the gate red rather than quiet, but red for a reason " +
      "that is not a sensitivity regression. The designed clean-clone seed detector remains " +
      "`seed.population-derivation` below (bit-level stream comparison, five ungated tests); " +
      "this row now proves the plan's LITERAL injection as well, at a margin that is " +
      "documented rather than assumed.",
  },
  {
    id: "seed.population-derivation",
    title: "seed perturbation — the PopulationSampler derivation constant, 17 → 18",
    why:
      "`seed*1000003 + 17` is a certified constant (PopulationSampler.java:257). A port that " +
      "collapses or mis-derives a stream still produces perfectly plausible demographics; " +
      "only a bit-level stream comparison notices. +1 is the smallest change available.",
    file: STREAMS,
    scope: ["engine/test/rng/", "engine/test/determinism/", "engine/test/world/"],
    ladder: [
      {
        id: "plus1",
        label: "+1 on the derived 64-bit seed",
        find: "  return BigInt.asIntN(64, runSeed * 1000003n + 17n);",
        replace: "  return BigInt.asIntN(64, runSeed * 1000003n + 18n);",
      },
    ],
    smallestDetected: "plus1",
    detector: {
      file: "engine/test/rng/streams.test.ts",
      test: "PopulationSampler = seed*1000003 + 17",
    },
    blindBelow: null,
    needsArtifacts: false,
    note:
      "MEASURED 2026-08-02, fast scope: nine failing tests, five of them clean-clone. The seed " +
      "derivation is pinned by value AND by consequence (the cross-engine corpus digest and " +
      "the realised marginals both move), which is the redundancy a seed constant deserves.",
  },
  {
    id: "formatter.half-up",
    title: "formatter perturbation — HALF_UP becomes HALF_DOWN at exact ties",
    why:
      "Plan §5.2's second named injection. Every numeric cell in the archive is " +
      "`String.format(\"%.Nf\")`, and Java rounds the SHORTEST ROUND-TRIP DECIMAL half away " +
      "from zero. Flipping `>=` to `>` changes output only for exact decimal ties " +
      "(0.615 -> \"0.61\" instead of \"0.62\") — the narrowest possible formatter defect, " +
      "and precisely the one `toFixed` would have shipped.",
    file: FORMAT,
    scope: ["engine/test/mathx/", "engine/test/output/", "engine/test/determinism/"],
    ladder: [
      {
        id: "half-down",
        label: "ties only (>= becomes >)",
        find: "  return remainder * 2n >= divisor ? quotient + 1n : quotient;",
        replace: "  return remainder * 2n > divisor ? quotient + 1n : quotient;",
      },
    ],
    smallestDetected: "half-down",
    detector: {
      file: "engine/test/mathx/format.parity.test.ts",
      test: "matches every in-domain fixture row for every precision 0..6",
    },
    blindBelow: null,
    needsArtifacts: false,
    note:
      "MEASURED 2026-08-02, fast scope: seven failing tests, all clean-clone. The cross-engine " +
      "corpus digest moves too, so a formatter defect is caught by the determinism gate as " +
      "well as by the formatter's own 29,162-comparison fixture.",
  },
  {
    id: "formatter.negative-zero",
    title: "formatter perturbation — -0.0 prints as \"0.00\" instead of \"-0.00\"",
    why:
      "Strictly smaller than the tie perturbation: it changes the output for exactly ONE " +
      "input double out of 2^64. Java's `Double.compare(value, 0.0) == -1` is true for -0.0; " +
      "dropping the `Object.is` term is the kind of one-value divergence a byte-identity " +
      "claim lives or dies on and a statistical gate can never see.",
    file: FORMAT,
    scope: ["engine/test/mathx/", "engine/test/output/"],
    ladder: [
      {
        id: "one-input",
        label: "one input value (-0.0)",
        find: "  const negative = value < 0 || Object.is(value, -0);",
        replace: "  const negative = value < 0;",
      },
    ],
    smallestDetected: "one-input",
    detector: {
      file: "engine/test/mathx/format.parity.test.ts",
      test: "keeps the sign of negative zero",
    },
    blindBelow: null,
    needsArtifacts: false,
    note:
      "MEASURED 2026-08-02, fast scope: five failing tests, all clean-clone. One input double " +
      "out of 2^64 is the finest defect anywhere in this catalogue, and a test names it.",
  },

  // ------------------------------------------------- the WP7 movement blind spot
  {
    id: "movement.step-length",
    title: "movement step-length error — the WP7 blind spot",
    why:
      "A 10 % error here passed every one of the 1,084 tests that existed at WP7, because " +
      "every Tier-3 gate is an aggregate and a uniform speed scaling just shifts arrival " +
      "ticks inside the nine-seed band. FIX A added a per-tick displacement oracle against " +
      "the certified `GisAgent.step()`; the ladder measures what that bought.",
    file: STEP,
    scope: ["engine/test/oracle/", "engine/test/agents/", "engine/test/closures/"],
    ladder: [
      stepRung("10pct", "10 % (x1.1)", "1.1"),
      stepRung("1pct", "1 % (x1.01)", "1.01"),
      stepRung("0.01pct", "0.01 % (x1.0001)", "1.0001"),
      stepRung("1e-9", "1e-7 % (x1.000000001)", "1.000000001"),
      {
        id: "1ulp",
        label: "1 ULP (~2.2e-14 %)",
        find: STEP_FIND,
        replace: `  const stepLengthM = ${ULP_UP("walkingSpeedMps * 60 * minutesPerTick")};`,
      },
    ],
    smallestDetected: "1ulp",
    detector: {
      file: "engine/test/oracle/movement.oracle.test.ts",
      test: "reproduces every interior walking tick BIT FOR BIT",
    },
    blindBelow: null,
    needsArtifacts: false,
    note:
      "MEASURED 2026-08-02, fast scope: RED at EVERY rung from 10 % down to ONE ULP, all " +
      "clean-clone. The WP7 blind spot is closed and the closure is now quantified - FIX A " +
      "did not merely improve sensitivity from 10 %, it took it to the last bit. Two " +
      "independent detectors: the per-tick Java displacement oracle, and the closure-wave " +
      "step sequence, which pins the stuck/resume tick arithmetic and fires from 10 % down.",
  },

  // ------------------------------------------- the walking-ventilation blind spot
  {
    id: "exposure.walking-ventilation",
    title: "walking-ventilation rate error — 1.62 m³/h",
    why:
      "1.62 -> 1.6202 (0.0123 %) once passed the entire suite. It moves `inhaled_dose_ug` and " +
      "`air_volume_breathed_m3` for every EN_ROUTE tick of every walking resident and nothing " +
      "else — no state change, no arrival-tick shift, so every count-based gate is blind by " +
      "construction and only a value oracle can see it.",
    file: STATE,
    scope: [
      "engine/test/oracle/",
      "engine/test/agents/",
      "engine/test/closures/",
      "engine/test/output/",
      "validation/test/mutation/blind-spots.test.ts",
    ],
    ladder: [
      ventRung("1pct", "1 % (1.6362)", "1.6362"),
      ventRung("0.0123pct", "0.0123 % (1.6202) — the historic miss", "1.6202"),
      ventRung("1e-7pct", "1e-7 % (1.6200000016)", "1.6200000016"),
      ventRung("1ulp", "1 ULP (1.4e-14 %)", "1.6200000000000003"),
    ],
    smallestDetected: "1ulp",
    detector: {
      file: "validation/test/mutation/blind-spots.test.ts",
      test: "INHALATION_WALKING_M3H is the double nearest 1.62, bit for bit",
    },
    blindBelow: null,
    needsArtifacts: false,
    note:
      "BLIND SPOT FOUND AND CLOSED, 2026-08-02. Before the closer the finest DETECTED rung was " +
      "1e-7 % and ONE ULP was green - across the fast scope and across the full suite. The " +
      "mechanism is arithmetic, not oversight: at the movement oracle's own settings " +
      "(minutesPerTick = 1, 5,760 ticks) the per-tick increment 1.62/60 DOES differ from " +
      "1.6200000000000003/60, but the two running sums are BIT-IDENTICAL after 5,760 " +
      "additions, because the accumulated discrepancy stays below half an ULP of the total " +
      "and is absorbed. No accumulator-based oracle can catch it, so the closer asserts the " +
      "constant's raw bits and executes the absorption to prove that assertion is not " +
      "redundant.",
  },

  // ------------------------------------------------------- severe-series indexing
  {
    id: "smoke.series-index-shift",
    title: "one-tick shift in the (severe) smoke-series index",
    why:
      "`hourIndex = (int) floor(tick * minutesPerTick / 60)` is the lookup that decides which " +
      "hour of the 456-slice severe array every resident breathes. A one-tick shift keeps the " +
      "series, the peak and the length intact and moves only WHEN each concentration is felt — " +
      "and, at the end of the window, walks one index past the array, which is exactly the " +
      "`out_of_range_lookups` condition gate (j.4) exists for (QUIRK 4, the 456-vs-455 catch).",
    file: FIELD,
    scope: [
      "engine/test/smoke/",
      "engine/test/oracle/",
      "engine/test/agents/",
      "pipeline/test/smoke-field.test.ts",
    ],
    ladder: [
      {
        id: "plus1tick",
        label: "+1 tick",
        find: "    const hourIndex = Math.floor((tick * minutesPerTick) / 60);",
        replace: "    const hourIndex = Math.floor(((tick + 1) * minutesPerTick) / 60);",
      },
    ],
    smallestDetected: "plus1tick",
    detector: {
      file: "engine/test/oracle/movement.oracle.test.ts",
      test: "reproduces every interior walking tick BIT FOR BIT",
    },
    blindBelow: null,
    needsArtifacts: false,
    note:
      "MEASURED 2026-08-02, fast scope: exactly ONE failing test in the whole selection, and " +
      "it is the movement oracle rather than anything under engine/test/smoke/ or the " +
      "smoke-field suite. Worth knowing rather than celebrating: the smoke tests pin the " +
      "SERIES (length, peak, provenance) and the gates pin out_of_range_lookups, but the " +
      "tick -> hour LOOKUP is pinned only where a certified per-tick exposure trace exists. " +
      "One detector is thin cover for the quirk that produced the 456-vs-455 catch.",
  },

  // ------------------------------------------------------ decision-layer drift
  {
    id: "decision.brisk-coefficient",
    title: "decision-layer coefficient drift — effective bRisk",
    why:
      "WP8's decision layer was fully implemented, bit-verified against a live-Repast oracle, " +
      "and called from nowhere; the acceptance gate then deleted the entire wiring and the " +
      "flagship test passed 24/24. A coefficient drift is the quiet version of that failure: " +
      "the layer still runs, the code path is still reached, every count is still plausible, " +
      "and only a draw-level oracle can tell that the Bernoulli threshold moved.",
    file: HAZARD,
    scope: [
      "engine/test/decision/",
      "engine/test/oracle/",
      "engine/test/determinism/",
      "validation/test/mutation/blind-spots.test.ts",
    ],
    ladder: [
      briskRung("1pct", "1 % (x1.01)", "1.01"),
      briskRung("0.01pct", "0.01 % (x1.0001)", "1.0001"),
      briskRung("1e-7pct", "1e-7 % (x1.000000001)", "1.000000001"),
      {
        id: "1ulp",
        label: "1 ULP on the returned coefficient",
        find: BRISK_FIND,
        replace: `  return ${ULP_UP("config.bRisk * (1.0 + (vulnerable ? config.gammaVuln : 0.0))")};`,
      },
    ],
    smallestDetected: "1ulp",
    detector: {
      file: "validation/test/mutation/blind-spots.test.ts",
      test: "effectiveBRisk reproduces every row",
    },
    blindBelow: null,
    needsArtifacts: false,
    note:
      "CLEAN-CLONE BLIND SPOT FOUND AND CLOSED, 2026-08-02. Every rung - 1 %, 0.01 %, 1e-7 %, " +
      "one ULP - was RED, but all four failing tests lived in ONE artifact-gated file, " +
      "engine/test/decision/oracle.trace.test.ts, which needs the 477 MB git-ignored " +
      "pipeline/out/decision-fixtures dump. On a clean clone, and therefore in the hosted CI " +
      "job, a 1 % drift in the hazard coefficient was caught by NOTHING - WP8's failure shape " +
      "exactly. Closed by cutting a 424-row stratified slice of that dump " +
      "(fixtures/decision-hz-slice.tsv; all 16 config x open x vulnerable strata) and checking " +
      "bRiskEff, u and p bit for bit against it, the same remedy " +
      "engine/test/fixtures/graph-slice/ already established for the graph.",
  },

  // ---------------------------------------------------------- RNG draw order
  {
    id: "rng.draw-order-swap",
    title: "swapped RNG draw order — ELayerSampler ② and ③",
    why:
      "The five per-resident draws are consumed in a fixed order (aware, belongings, pet, " +
      "dependents, theta). Swapping two of them consumes exactly the same number of doubles " +
      "from exactly the same stream and leaves the stream state at the end of the pass " +
      "BIT-IDENTICAL — only who owns a pet and who owns heavy belongings changes. Every " +
      "stream-state check, every draw-count check and every marginal on the untouched fields " +
      "is blind to it by construction.",
    file: ELAYER,
    scope: [
      "engine/test/world/",
      "engine/test/determinism/",
      "engine/test/decision/",
      "engine/test/agents/",
    ],
    ladder: [
      {
        id: "swap-2-3",
        label: "two draws transposed (stream state unchanged)",
        find:
          "    const heavyBelongings = this.rng.nextDouble() < this.pHeavy; // ②\n" +
          "    const hasPet = this.rng.nextDouble() < this.pPet; // ③",
        replace:
          "    const hasPet = this.rng.nextDouble() < this.pPet; // ③\n" +
          "    const heavyBelongings = this.rng.nextDouble() < this.pHeavy; // ②",
      },
    ],
    smallestDetected: "swap-2-3",
    detector: {
      file: "engine/test/determinism/corpus.digest.test.ts",
      test: "reproduces every committed section digest",
    },
    blindBelow: null,
    needsArtifacts: false,
    note:
      "MEASURED 2026-08-02, fast scope: three failing tests, one of them clean-clone. The " +
      "cross-engine corpus is the only ungated detector, and it catches the swap because its " +
      "scenario.world section tokenises the five per-resident draws INDIVIDUALLY rather than " +
      "only digesting the stream state - which a transposition leaves untouched by " +
      "construction.",
  },
];

/**
 * The NEGATIVE CONTROL, and it is not optional.
 *
 * "The suite went red" proves nothing unless the suite would have been green
 * without the injection. This rung is a semantics-preserving edit to the same
 * file the movement rungs touch — a comment, nothing else — and the gate
 * requires it to leave the suite GREEN. If it goes red, the whole run is void:
 * something other than the injection is failing and every "detected" verdict in
 * that run is unattributable.
 */
export const NEGATIVE_CONTROL: Injection = {
  id: "control.no-op",
  title: "negative control — a comment-only edit must leave the suite GREEN",
  why:
    "Without this, a tree that is red for an unrelated reason reports every injection as " +
    "'detected' and the mutation gate becomes the most confident useless test in the repo.",
  file: STEP,
  // Overridden at run time by `run-mutation-gate.ts`, which sets the control's
  // scope to the UNION of the scopes actually exercised in that run — the
  // greenness being relied on has to be the greenness proved, and `--only`
  // changes which that is. The list here is the union over the full catalogue,
  // i.e. what a run with no `--only` uses.
  scope: [
    "engine/test/agents/",
    "engine/test/closures/",
    "engine/test/decision/",
    "engine/test/determinism/",
    "engine/test/mathx/",
    "engine/test/oracle/",
    "engine/test/output/",
    "engine/test/rng/",
    "engine/test/rng/streams.test.ts",
    "engine/test/smoke/",
    "engine/test/worker/",
    "engine/test/world/",
    "pipeline/test/smoke-field.test.ts",
    "validation/test/mutation/blind-spots.test.ts",
  ],
  ladder: [
    {
      id: "comment",
      label: "comment only",
      find: "  // --- §1.5 step 12: movement ----------------------------------------------",
      replace:
        "  // --- §1.5 step 12: movement ----------------------------------------------\n" +
        "  // mutation-gate negative control: this line changes no behaviour at all.",
    },
  ],
  smallestDetected: null,
  detector: null,
  blindBelow: null,
  needsArtifacts: false,
};

/** Every file the catalogue is allowed to touch — the manifest's domain. */
export function catalogueFiles(): readonly string[] {
  return [...new Set([...INJECTIONS.map((i) => i.file), NEGATIVE_CONTROL.file])].sort();
}

export function injectionById(id: string): Injection {
  const all = [...INJECTIONS, NEGATIVE_CONTROL];
  const hit = all.find((i) => i.id === id);
  if (hit === undefined) {
    throw new Error(`no injection with id '${id}'. Known: ${all.map((i) => i.id).join(", ")}`);
  }
  return hit;
}

export function rungById(injection: Injection, rungId: string): Rung {
  const hit = injection.ladder.find((r) => r.id === rungId);
  if (hit === undefined) {
    throw new Error(
      `injection '${injection.id}' has no rung '${rungId}'. ` +
        `Known: ${injection.ladder.map((r) => r.id).join(", ")}`,
    );
  }
  return hit;
}
