/**
 * schema.ts — THE single Zod schema for the 41 runtime parameters.
 *
 * Plan §3.1: one schema is the single source of truth for UI form validation,
 * permalink encode/decode, preset generation/validation and the executed-manifest
 * completeness check. Nothing in `websim/` may define a second parameter list.
 *
 * Authority chain for every value below:
 *   - names + fixed order  : `ContextCreator.build()` `pNames[]` (the array the
 *                            manifest is written from — "every new parameter MUST
 *                            appear here or the manifest silently lies").
 *   - types + fallbacks    : PORT_MAP §2 tables, cross-checked against the
 *                            `intParam` / `doubleParam` calls in ContextCreator.
 *   - registry ids + sweeps: Geography/data/registry/variables.csv
 *                            (`variable_id`, `uncertainty` columns).
 *   - bundle values        : PORT_MAP §3.3, resolved against Geography/batch/*.xml.
 *
 * TWO RANGES PER PARAMETER, deliberately distinct (plan §5.4 badge machine):
 *   - HARD  range = what this schema accepts. It is a *structural* bound: an
 *     engine fail-fast, a documented physical bound, or an explicit plan §6.3
 *     slider bound. Outside it the engine cannot run meaningfully.
 *   - CERTIFIED range = the registered envelope (registry sweep range, widened
 *     where an archived bundle executes a degenerate value such as the R3 null's
 *     `sigmaTheta = 0`). Inside it a custom run can earn ENGINE-CERTIFIED;
 *     outside it the badge drops to EXPLORATORY. The badge machine *requires*
 *     out-of-envelope configs to be representable, so the hard range is
 *     deliberately wider than the certified range — this schema must never be
 *     the thing that makes EXPLORATORY unreachable.
 *
 * WP8 (Phase E + Scenario E) ADDS NO PARAMETER. The 21 decision-layer names and
 * the 7 Scenario-E names the archive gates check for were already in the WP0
 * surface — verified name for name against `scripts/verify_E_runs.py`'s
 * `E_PARAMS` / `SE_PARAMS`. What WP8 adds here is the *grouping*
 * ({@link E_PARAM_NAMES}, {@link SE_PARAM_NAMES}, {@link CLOSURE_DRAW_PARAM}), so
 * manifest-completeness gates (h) and (i) can be run from the same single source
 * instead of a second, drifting copy of "which 21", plus the batch constant-type
 * rule ({@link repastConstantType}) that keeps a negative from being emitted as a
 * `"number"` Repast would zero.
 *
 * NEGATIVE VALUES: every parameter here is a plain TypeScript `number`. Repast's
 * batch loader zeroes negative `constant_type="number"` values (PORT_MAP §2.8,
 * §6.7.4) — the defect that made archived Scenario-E runs execute
 * `pushThetaThreshold = 0.0` instead of the registered −0.25. There is no
 * "number vs double" distinction to get wrong here, so that defect is
 * unreproducible by construction. Pinned by the "negative-capable parameters"
 * block in `test/schema.test.ts` and, on the instrument side, by
 * `validation/test/preset-batch-parity.test.ts`, which audits every archived
 * batch file for a negative constant still typed `"number"`.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Parameter names, in the manifest's fixed order
// ---------------------------------------------------------------------------

/**
 * The 41 runtime parameters in `ContextCreator.build()`'s `pNames[]` order.
 * This order is load-bearing: `simulation.json`'s `reproducibility.parameters`
 * block is emitted in it, so parity diffs against the Java archive depend on it.
 * Append only — never reorder, never remove.
 */
export const PARAM_NAMES = [
  // §2.1 infrastructure / core run control
  "numAgents",
  "minutesPerTick",
  "walkingSpeedMps",
  "shelterArrivalDistanceM",
  "simulationHours",
  "randomSeed",
  "evacuationThresholdUgM3",
  "scenarioCode",
  "enableHeterogeneity",
  "respectShelterOpeningDates",
  "triageReserveFraction",
  // §2.6 Phase-E decision layer (V29–V45)
  "enableDecisionLayer",
  "pAwareInit",
  "pHeavyBelongings",
  "pHasPet",
  "pHasDependents",
  "groupSpeedDeltaMps",
  "lambdaOutreachPerDay",
  "informationRegime",
  "enableHazardDeparture",
  "sigmaTheta",
  "alphaHazard",
  "bRisk",
  "wOfficial",
  "gammaVuln",
  "riskHalfLifeH",
  "barrierBelongings",
  "barrierPet",
  "barrierDependents",
  "petPolicyDefault",
  "betaTravelTime",
  "betaCapacityPrior",
  "shelterPolicyVariant",
  // §2.7 Scenario-E smoke + closures (V46–V51)
  "smokeSeriesCode",
  "smokeScale",
  "closuresCode",
  "pStuck",
  "stuckDelayH",
  "pushThetaThreshold",
  "kPush",
  "closureDraw",
] as const;

export type ParamName = (typeof PARAM_NAMES)[number];

/**
 * Asserted in `test/schema.test.ts`. If a parameter is added or removed, this
 * constant and the test must both be updated deliberately — the schema can
 * never grow or shrink silently.
 */
export const PARAM_COUNT = 41 as const;

// ---------------------------------------------------------------------------
// WP8 gate (h)/(i) groupings — the exact name lists the archive gates check
// ---------------------------------------------------------------------------

/**
 * The 21 Phase-E decision-layer parameters, gate (h)'s subject.
 *
 * Transcribed **verbatim and in order** from `scripts/verify_E_runs.py:85-92`
 * (`E_PARAMS`), which is the authority for manifest-completeness gate (h)
 * (`verify_E_runs.py:615-624`; `WP8-SPEC-archive-gates.md` §3.3):
 *
 * ```python
 * missing = [p for p in E_PARAMS if p not in run.params]     # 21 entries
 * PASS iff not missing
 * ```
 *
 * These names are a *subset* of {@link PARAM_NAMES} and carry no independent
 * definition — {@link E_PARAM_NAMES_ARE_PARAMS} below is the compile-time proof,
 * and `test/schema.test.ts` re-asserts membership at runtime. The list exists so
 * the port can run gate (h) without re-deriving "which 21", which is precisely
 * the kind of re-derivation that silently drifts.
 *
 * Note what is NOT here: `shelterPolicyVariant` is V45/Phase-E but sits outside
 * `E_PARAMS` in the Python, and `triageReserveFraction` is an arm-D lever, not a
 * decision-layer parameter. Both are still required by the 41-parameter schema;
 * they are simply not part of gate (h)'s 21.
 */
export const E_PARAM_NAMES = [
  "enableDecisionLayer",
  "pAwareInit",
  "pHeavyBelongings",
  "pHasPet",
  "pHasDependents",
  "groupSpeedDeltaMps",
  "lambdaOutreachPerDay",
  "informationRegime",
  "enableHazardDeparture",
  "sigmaTheta",
  "alphaHazard",
  "bRisk",
  "wOfficial",
  "gammaVuln",
  "riskHalfLifeH",
  "barrierBelongings",
  "barrierPet",
  "barrierDependents",
  "petPolicyDefault",
  "betaTravelTime",
  "betaCapacityPrior",
] as const satisfies readonly ParamName[];

/** Asserted in `test/schema.test.ts`; gate (h)'s message hardcodes "all 21". */
export const E_PARAM_COUNT = 21 as const;

/**
 * The 7 core Scenario-E parameters, gate (i)'s subject.
 *
 * Transcribed verbatim from `scripts/verify_E_runs.py:97-100` (`SE_PARAMS`),
 * checked by `verify_E_runs.py:630-641` (`WP8-SPEC-archive-gates.md` §3.3).
 *
 * `closureDraw` is deliberately absent — see {@link CLOSURE_DRAW_PARAM}.
 */
export const SE_PARAM_NAMES = [
  "smokeSeriesCode",
  "smokeScale",
  "closuresCode",
  "pStuck",
  "stuckDelayH",
  "pushThetaThreshold",
  "kPush",
] as const satisfies readonly ParamName[];

/** Asserted in `test/schema.test.ts`. */
export const SE_PARAM_COUNT = 7 as const;

/**
 * The conditional half of gate (i).
 *
 * `closureDraw` is **not** in {@link SE_PARAM_NAMES}. The Python's own comment
 * (`verify_E_runs.py:94-96`) says why: *"it entered the manifest with the
 * worst-case family, so the archived v1 SE runs legitimately lack it."* Gate (i)
 * therefore asserts its presence only when `closuresCode == 3`:
 *
 * ```python
 * code = int(float(run.params.get("closuresCode", 0)))
 * if code == 3:
 *     PASS iff "closureDraw" in run.params
 * ```
 *
 * The web schema requires it unconditionally — every `RunConfig` is 41/41 — so a
 * shipped preset satisfies the conditional trivially. The constant exists so the
 * gate port reads the same name the Python does.
 */
export const CLOSURE_DRAW_PARAM = "closureDraw" as const satisfies ParamName;

/** The closure family for which gate (i) requires `closureDraw`. */
export const WORST_FAMILY_CLOSURES_CODE = 3 as const;

/** The 21 gate-(h) names as a type. */
export type EParamName = (typeof E_PARAM_NAMES)[number];
/** The 7 gate-(i) names as a type. */
export type SeParamName = (typeof SE_PARAM_NAMES)[number];

/**
 * Compile-time proof that both gate lists name only real parameters. The
 * `satisfies` clauses above already enforce it; these assignments state the
 * relationship in the direction a reader cares about (subset of `ParamName`) and
 * fail loudly if a future refactor loosens the constants. Same pattern as
 * `config.ts#_ParamKeysMatch`.
 */
type _EParamsAreParams = EParamName extends ParamName ? true : never;
type _SeParamsAreParams = SeParamName extends ParamName ? true : never;
const _eParamsAreParams: _EParamsAreParams = true;
const _seParamsAreParams: _SeParamsAreParams = true;
void _eParamsAreParams;
void _seParamsAreParams;

// ---------------------------------------------------------------------------
// Smoke series ↔ maximum run window (gotcha: simulationHours ≤ slices − 1)
// ---------------------------------------------------------------------------

/**
 * Longest run window each smoke series supports, = that series' hourly slice
 * count − 1 (plan §6.3; the gate that caught the 456-vs-455 error). Hour indices
 * are 0-based and the engine reads `hour` and `hour + 1`, so the last legal
 * window end is one hour short of the slice count.
 */
export const MAX_SIMULATION_HOURS_BY_SERIES: Readonly<Record<0 | 1 | 2, number>> = {
  0: 575,
  1: 455,
  2: 455,
};

/** Human labels for the three series; the UI must never show a bare code. */
export const SMOKE_SERIES_LABELS: Readonly<Record<0 | 1 | 2, string>> = {
  0: "Observed 2020 (Multnomah County hourly PM2.5, peak 562.7 ug/m3)",
  1: "Severe v1 — CONSTRUCTED COUNTERFACTUAL (embedded 1.75x, peak 984.75 ug/m3)",
  2: "Worst-plausible v2 — CONSTRUCTED COUNTERFACTUAL (embedded 4.436x, peak 2496.1 ug/m3, Canberra-anchored)",
};

/** Maximum legal `simulationHours` for a series code. */
export function maxSimulationHours(smokeSeriesCode: number): number {
  const key = smokeSeriesCode as 0 | 1 | 2;
  return MAX_SIMULATION_HOURS_BY_SERIES[key] ?? 0;
}

// ---------------------------------------------------------------------------
// Field definitions — one entry per parameter, each carrying its registry id
// ---------------------------------------------------------------------------

/** 0/1 switch. Literal union so the type system carries the two legal values. */
const flag01 = (description: string) =>
  z.union([z.literal(0), z.literal(1)]).describe(description);

/**
 * The 41 field schemas. Two Zod schemas are built from this one object (the full
 * `RunConfigSchema` and the partial `RunConfigPatchSchema`) so the "single
 * source" property survives.
 */
const runConfigFields = {
  // --- §2.1 infrastructure / core run control -------------------------------
  numAgents: z
    .int()
    .min(50)
    .max(6842)
    .describe(
      "V15 — resident count. 6,842 = the 2025 Tri-County Point-in-Time unsheltered " +
        "count for Multnomah County; arms also run 50 / 500 / 2,037. Bounds are the " +
        "plan §6.3 core-slider bounds.",
    ),
  minutesPerTick: z
    .number()
    .min(1)
    .max(1)
    .describe(
      "V13 — tick length in minutes. PINNED to 1.0: registry uncertainty is 'none', " +
        "every archived run uses 1.0, and the hourly machinery (z_R increment 1/24, " +
        "outreach divisor 24, hours-above accounting) assumes it. Widening this is a " +
        "contract-version change, not a slider.",
    ),
  walkingSpeedMps: z
    .number()
    .min(0.4)
    .max(2.2)
    .describe(
      "V10 — run-wide walking speed (m/s), used ONLY when enableHeterogeneity = 0; " +
        "with heterogeneity on it is declared but ignored. Hard bounds are the V27 " +
        "speed bounds [0.40, 2.20]; published age-sex cell range is 1.272–1.462.",
    ),
  shelterArrivalDistanceM: z
    .number()
    .min(0)
    .max(10000)
    .describe(
      "V-ARRIVAL — DEPRECATED / DEAD. Arrival is exact path consumption, so this value " +
        "changes nothing; it survives as a manifest field only, and the UI must never " +
        "offer it as a control (plan §6.3).",
    ),
  simulationHours: z
    .int()
    .min(1)
    .max(575)
    .describe(
      "V-SIMH — run window length in hours. Must be ≤ the selected smoke series' " +
        "slice count − 1 (575 / 455 / 455); the cross-field check below enforces it. " +
        "Arms run 24 / 72 / 312 / 455.",
    ),
  randomSeed: z
    .int()
    .min(-2147483648)
    .max(2147483647)
    .describe(
      "V16 — master seed for the colt MT19937 default stream and every derived " +
        "stream. Java `int` range, negatives included (RNG fixtures cover seed −1). " +
        "The GUI schema leaves this unpinned; the web build never does.",
    ),
  evacuationThresholdUgM3: z
    .number()
    .min(0)
    .max(500)
    .describe(
      "V-EVAC — PM2.5 concentration in ug/m3 at or above which an aware resident " +
        "latches to departure. 55.5 in every certified run; it is a concentration " +
        "threshold and must never be labelled as an index category.",
    ),
  scenarioCode: z
    .int()
    .min(0)
    .max(20)
    .describe(
      "Arm label + shelter-CSV selector (PORT_MAP §3.1 registry, codes 0–20). No " +
        "registry variable id: it selects data, it is not a modelled quantity. There " +
        "is deliberately NO engine fail-fast — an unmatched code silently means arm A " +
        "— so the UI exposes a dropdown of the registry, never a free-typed code.",
    ),
  enableHeterogeneity: flag01(
    "V18–V22 (switch) — 1 = each resident carries sampled age / sex / mobility / " +
      "asthma / COPD attributes and its own walking speed; 0 = every resident walks " +
      "at walkingSpeedMps with no attributes. Batch fallback is 0, the study value 1.",
  ),
  respectShelterOpeningDates: flag01(
    "V23 — 1 = shelters open on their real dates; 0 = all sites open at tick 0, the " +
      "A-02 counterfactual. Batch fallback is 0, the study value 1.",
  ),
  triageReserveFraction: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Arm D's only lever (no registry variable id; PORT_MAP §2.5). Each site holds " +
        "floor(capacity x f) beds for mobility-limited residents. 0.0 is " +
        "bit-identical to first-come-first-served; arm D runs {0, .10, .15, .25}.",
    ),

  // --- §2.6 Phase-E decision layer (V29–V45) --------------------------------
  enableDecisionLayer: flag01(
    "V44 — master switch. 0 = legacy pre-Phase-E behaviour verbatim; 1 = the " +
      "awareness / hazard / barrier / choice layer runs. Every other decision " +
      "parameter is inert at 0.",
  ),
  pAwareInit: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "V29 — P(resident is aware of the shelter option at t0). Sourced 0.356 " +
        "(26/73); registry sweep 0.25–0.47 (Wilson interval). The R3 null sets 1.0 " +
        "to degenerate the mechanism, which is why the certified envelope reaches 1.0.",
    ),
  pHeavyBelongings: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "V31 — P(resident carries belongings it will not abandon). A departure barrier " +
        "only; it never touches walking speed. Sourced 0.284, swept 0.108–0.46.",
    ),
  pHasPet: z
    .number()
    .min(0)
    .max(1)
    .describe("V32 — P(resident has a pet). Sourced 0.117, swept 0.055–0.12."),
  pHasDependents: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "V33 — P(resident has dependents). Sourced 0.0044 (30/6831), swept 0.004–0.03.",
    ),
  groupSpeedDeltaMps: z
    .number()
    .min(0)
    .max(1.8)
    .describe(
      "V34 — per-extra-group-member slowdown (m/s), applied as max(0.40, v − delta). " +
        "The ONE decision parameter whose sourced value (0.06) differs from its " +
        "behaviour-preserving batch fallback (0.0); swept 0.04–0.08.",
    ),
  lambdaOutreachPerDay: z
    .number()
    .min(0)
    .max(24)
    .describe(
      "V41 — daily rate at which unaware residents become aware, evaluated hourly as " +
        "lambda/24. Swept 0–0.2 per day including 0 (no outreach).",
    ),
  informationRegime: flag01(
    "V42 — 0 = L0 omniscient (every resident knows every shelter's state); 1 = L1 " +
      "locations-only, each resident maintaining its own belief set. L2 is specified " +
      "but deferred, so the switch is binary.",
  ),
  enableHazardDeparture: flag01(
    "V44 — 1 = departure is a per-hour logistic hazard; 0 = the legacy concentration " +
      "latch at evacuationThresholdUgM3.",
  ),
  sigmaTheta: z
    .number()
    .min(0)
    .max(5)
    .describe(
      "V35 — standard deviation of the persistent per-resident risk trait theta. " +
        "Also gates the push-through rule. Swept 0.5–1.5; the R3 null uses 0.0.",
    ),
  alphaHazard: z
    .number()
    .min(-20)
    .max(5)
    .describe(
      "V38 — logistic hazard intercept in log-odds. NEGATIVE by construction (−8.0, " +
        "provisional per A-30, swept ±1). This is one of the two parameters Repast's " +
        "batch loader zeroes when typed 'number' instead of 'double'; in TypeScript " +
        "it is an ordinary double and cannot be zeroed.",
    ),
  bRisk: z
    .number()
    .min(0)
    .max(5)
    .describe(
      "V36 — weight on the accumulated risk cue z_R in the departure hazard. " +
        "Sourced 0.4; swept 0.25–0.55, wide sweep 0.2–0.8.",
    ),
  wOfficial: z
    .number()
    .min(0)
    .max(5)
    .describe(
      "V37 — weight on the shelter-open official cue in log-odds. Sourced 1.1; swept " +
        "0.6–1.7 (the odds-ratio 4.21 implies a ln 1.44 ceiling).",
    ),
  gammaVuln: z
    .number()
    .min(0)
    .max(5)
    .describe(
      "V39 — vulnerability amplification of bRisk. Sign is sourced to Coughlan, " +
        "Huber-Stearns, Clark & Deak 2022 (EWP Working Paper 111); the magnitude " +
        "remains an assumption swept 0 to +0.5. Inert without heterogeneity.",
    ),
  riskHalfLifeH: z
    .number()
    .min(0.5)
    .max(8760)
    .describe(
      "V36 — half-life in hours of the accumulated risk cue z_R. Sourced 48.0, swept " +
        "12–72.",
    ),
  barrierBelongings: z
    .number()
    .min(0)
    .max(5)
    .describe(
      "V40 — log-odds departure cost of the belongings barrier. Baseline-real 0.26 " +
        "(Tanim 2022 midpoint), swept 0.10–0.42; batch fallback 0.0 (inert).",
    ),
  barrierPet: z
    .number()
    .min(0)
    .max(5)
    .describe(
      "V40 — log-odds departure cost of the pet barrier, charged only when the " +
        "world's default policy refuses pets. Baseline-real 0.26, swept 0.10–0.42.",
    ),
  barrierDependents: z
    .number()
    .min(0)
    .max(5)
    .describe(
      "V40 — log-odds departure cost of the dependents barrier. Baseline-real 0.26, " +
        "swept 0.10–0.42.",
    ),
  petPolicyDefault: flag01(
    "A-29 (V45 companion) — policy applied to shelter sites with no recorded " +
      "pet_intake value. 1 = admit (the inert batch fallback); 0 = refuse, the " +
      "conservative reading the baseline-real arms use.",
  ),
  betaTravelTime: z
    .number()
    .min(0)
    .max(1000)
    .describe(
      "V43 — weight on travel time in the shelter-choice utility. Sourced 1.0, swept " +
        "across roughly two orders of magnitude either side.",
    ),
  betaCapacityPrior: z
    .number()
    .min(0)
    .max(1000)
    .describe(
      "V43 / A-32 — weight on the ln(capacity) prior in the shelter-choice utility. " +
        "Baseline-real 0.2, batch fallback 0.0; uncapped capacity is treated as 10000.",
    ),
  shelterPolicyVariant: flag01(
    "V45 — 1 = read this arm's '_elayer' shelter CSV, which carries recorded " +
      "pet_intake policy (fail-fast if the file is absent); 0 = the archived file " +
      "untouched, keeping data_version_tag comparable with the three-arm chain.",
  ),

  // --- §2.7 Scenario-E smoke + closures (V46–V51) ---------------------------
  smokeSeriesCode: z
    .int()
    .min(0)
    .max(2)
    .describe(
      "V46 — hourly PM2.5 series selector. 0 = observed Sept-2020 Multnomah series " +
        "(peak 562.7 ug/m3); 1 = CONSTRUCTED severe v1 (embedded 1.75x, peak 984.75); " +
        "2 = CONSTRUCTED worst-plausible v2 (embedded 4.436x, peak 2496.1, anchored to " +
        "Canberra Florey 5–6 Jan 2020). Series 1 and 2 are counterfactuals and must " +
        "always carry that label. The engine throws outside 0–2, so these are hard " +
        "bounds.",
    ),
  smokeScale: z
    .number()
    .min(0.25)
    .max(3)
    .describe(
      "V47 — runtime multiplier applied to every hourly value at SmokeField " +
        "construction: C'(t) = smokeScale x C(t). Effective severity = embedded " +
        "transform x smokeScale, and the UI must show that product, never stack a " +
        "second transform silently. Bounds are the plan §6.3 slider bounds.",
    ),
  closuresCode: z
    .int()
    .min(0)
    .max(3)
    .describe(
      "V48 — street-closure schedule family. 0 = none (bit-identical to every " +
        "non-Scenario-E arm); 1 = base severe (1 wave at hour 79, 18 edges); 2 = " +
        "extreme (2 waves, 34 edges); 3 = worst family (6 waves, 72 edges, first wave " +
        "hours 2–6). The engine throws outside 0–3.",
    ),
  pStuck: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "V49 — P(a resident that pushes through a blockage is delayed rather than " +
        "passing freely). Drawn on the per-agent decision stream. Unsourced (A-35), " +
        "swept 0.1–0.5, central 0.3.",
    ),
  stuckDelayH: z
    .number()
    .min(0)
    .max(168)
    .describe(
      "V50 — hours a stuck resident waits en route at resting ventilation before " +
        "continuing. A delay, never a terminal state. Unsourced (A-35), swept 1–6 h, " +
        "central 3.0.",
    ),
  pushThetaThreshold: z
    .number()
    .min(-5)
    .max(5)
    .describe(
      "V51 — risk-trait threshold for pushing through a blockage: push iff " +
        "theta_scaled >= threshold + kPush x (barrier cost + mobility penalty). " +
        "NEGATIVE by construction (−0.25 = P(push | unburdened) ~ 0.60), swept " +
        "−0.5…+1.0. Archived Scenario-E runs EXECUTED 0.0 because Repast's batch " +
        "loader zeroes negative 'number' constants; web presets carry the corrected " +
        "−0.25, and live-vs-archived closure comparisons must say so.",
    ),
  kPush: z
    .number()
    .min(0)
    .max(10)
    .describe(
      "V51 (paired coefficient) — burden coupling in the push-through rule. Central " +
        "1.0, swept 0.5–2.0. Shares V51's row deliberately: one decision rule, two " +
        "coefficients.",
    ),
  closureDraw: z
    .int()
    .min(1)
    .max(3)
    .describe(
      "V48 (companion) — selects one pre-committed closure schedule file for the " +
        "code-3 worst family. NO runtime RNG is involved. Ignored for codes 0–2; the " +
        "engine throws for code 3 outside 1–3. Closure effects are reported as a " +
        "range across draws, never from a single schedule (A-34).",
    ),
} as const;

// ---------------------------------------------------------------------------
// The schema
// ---------------------------------------------------------------------------

/**
 * THE schema. `strictObject` means: no optionals, no defaults-by-omission and no
 * unknown keys. A `RunConfig` names all 41 parameters explicitly or it is not a
 * `RunConfig` — plan Q2 ("no browser path ever exercises a batch fallback") and
 * R7 ("a difference between two configs is the only thing that can explain a
 * difference between two runs") are enforced here, not by convention.
 */
export const RunConfigSchema = z
  .strictObject(runConfigFields)
  .superRefine((cfg, ctx) => {
    // Q11: `simulationHours ≤ slices − 1` is enforced structurally, not by a
    // warning. This is the gate that caught the 456-vs-455 window error; running
    // past the end of the smoke data fabricates zero-concentration hours and
    // pushes the badge to INVALID.
    const limit = maxSimulationHours(cfg.smokeSeriesCode);
    if (cfg.simulationHours > limit) {
      ctx.addIssue({
        code: "custom",
        path: ["simulationHours"],
        message:
          `simulationHours ${cfg.simulationHours} exceeds the maximum ${limit} for ` +
          `smokeSeriesCode ${cfg.smokeSeriesCode}: the run window must stay within ` +
          "the smoke series' slice count minus one, or the engine reads " +
          "out-of-range hours and fabricates zero concentrations.",
      });
    }
  });

/**
 * Partial form, used by the permalink codec and the "modified from preset" diff
 * chip. Built from the same field object, so it can never drift from the full
 * schema. The cross-field window check does not apply — a patch is not a run.
 */
export const RunConfigPatchSchema = z.strictObject(runConfigFields).partial();

/** Field-level access for the UI form builder and for tests. */
export const RUN_CONFIG_FIELDS = runConfigFields;

// ---------------------------------------------------------------------------
// Parameter metadata (V-numbers, groups, envelopes, batch fallbacks)
// ---------------------------------------------------------------------------

/**
 * Slider taxonomy groups from plan §6.3, plus `advanced` for the three
 * parameters the taxonomy deliberately does not surface as sliders
 * (minutesPerTick is pinned, evacuationThresholdUgM3 is a convention constant,
 * shelterArrivalDistanceM is dead).
 */
export type ParamGroup =
  | "core"
  | "demographics-movement"
  | "shelters-policy"
  | "decision-layer"
  | "closures"
  | "advanced";

export interface ParamMeta {
  /** Registry variable id, or an explicit note when the registry has no row. */
  readonly registryId: string;
  readonly group: ParamGroup;
  readonly kind: "int" | "double" | "flag";
  readonly units: string;
  /** Bounds this schema accepts (structural). */
  readonly hardMin: number;
  readonly hardMax: number;
  /** Registered envelope; outside it the badge drops to EXPLORATORY. */
  readonly certifiedMin: number;
  readonly certifiedMax: number;
  /** Value the Java engine falls back to when a batch file omits it; null = required. */
  readonly batchFallback: number | null;
  /** Value the Repast GUI schema ships; null = not present in the GUI schema. */
  readonly guiDefault: number | null;
  /** True where the registered value is negative — see the header note. */
  readonly negativeCapable: boolean;
  /** True for parameters retained for manifest comparability only. */
  readonly deprecated: boolean;
}

/**
 * Per-parameter metadata. `certifiedMin`/`certifiedMax` are the registry sweep
 * range widened, where noted, to cover the degenerate values archived bundles
 * execute — every shipped preset must land inside this envelope, which
 * `test/presets.test.ts` asserts.
 */
export const PARAM_META: Readonly<Record<ParamName, ParamMeta>> = {
  numAgents: {
    registryId: "V15",
    group: "core",
    kind: "int",
    units: "count",
    hardMin: 50,
    hardMax: 6842,
    certifiedMin: 50,
    certifiedMax: 6842,
    batchFallback: null,
    guiDefault: 500,
    negativeCapable: false,
    deprecated: false,
  },
  minutesPerTick: {
    registryId: "V13",
    group: "advanced",
    kind: "double",
    units: "min/tick",
    hardMin: 1,
    hardMax: 1,
    certifiedMin: 1,
    certifiedMax: 1,
    batchFallback: null,
    guiDefault: 1,
    negativeCapable: false,
    deprecated: false,
  },
  walkingSpeedMps: {
    registryId: "V10",
    group: "demographics-movement",
    kind: "double",
    units: "m/s",
    hardMin: 0.4,
    hardMax: 2.2,
    certifiedMin: 1.272,
    certifiedMax: 1.462,
    batchFallback: null,
    guiDefault: 1.3,
    negativeCapable: false,
    deprecated: false,
  },
  shelterArrivalDistanceM: {
    registryId: "V-ARRIVAL",
    group: "advanced",
    kind: "double",
    units: "m",
    hardMin: 0,
    hardMax: 10000,
    certifiedMin: 200,
    certifiedMax: 200,
    batchFallback: null,
    guiDefault: 200,
    negativeCapable: false,
    deprecated: true,
  },
  simulationHours: {
    registryId: "V-SIMH",
    group: "core",
    kind: "int",
    units: "h",
    hardMin: 1,
    hardMax: 575,
    certifiedMin: 24,
    certifiedMax: 455,
    batchFallback: null,
    guiDefault: 312,
    negativeCapable: false,
    deprecated: false,
  },
  randomSeed: {
    registryId: "V16",
    group: "core",
    kind: "int",
    units: "-",
    hardMin: -2147483648,
    hardMax: 2147483647,
    // Production seeds are 42–50. Seeds outside that set are perfectly runnable
    // and deterministic; they simply are not part of the archived comparison, so
    // the envelope check treats the seed as always in-range and the badge relies
    // on the archived-config match instead.
    certifiedMin: -2147483648,
    certifiedMax: 2147483647,
    batchFallback: null,
    guiDefault: null,
    negativeCapable: true,
    deprecated: false,
  },
  evacuationThresholdUgM3: {
    registryId: "V-EVAC",
    group: "advanced",
    kind: "double",
    units: "ug/m3",
    hardMin: 0,
    hardMax: 500,
    certifiedMin: 55.5,
    certifiedMax: 55.5,
    batchFallback: null,
    guiDefault: 55.5,
    negativeCapable: false,
    deprecated: false,
  },
  scenarioCode: {
    registryId: "none — data selector, PORT_MAP §3.1 registry",
    group: "core",
    kind: "int",
    units: "code",
    hardMin: 0,
    hardMax: 20,
    certifiedMin: 0,
    certifiedMax: 20,
    batchFallback: 0,
    guiDefault: 0,
    negativeCapable: false,
    deprecated: false,
  },
  enableHeterogeneity: {
    registryId: "V18–V22 (switch)",
    group: "demographics-movement",
    kind: "flag",
    units: "-",
    hardMin: 0,
    hardMax: 1,
    certifiedMin: 0,
    certifiedMax: 1,
    batchFallback: 0,
    guiDefault: 1,
    negativeCapable: false,
    deprecated: false,
  },
  respectShelterOpeningDates: {
    registryId: "V23",
    group: "shelters-policy",
    kind: "flag",
    units: "-",
    hardMin: 0,
    hardMax: 1,
    certifiedMin: 0,
    certifiedMax: 1,
    batchFallback: 0,
    guiDefault: 1,
    negativeCapable: false,
    deprecated: false,
  },
  triageReserveFraction: {
    registryId: "none — arm-D lever, PORT_MAP §2.5",
    group: "shelters-policy",
    kind: "double",
    units: "fraction",
    hardMin: 0,
    hardMax: 1,
    certifiedMin: 0,
    certifiedMax: 0.25,
    batchFallback: 0,
    guiDefault: 0,
    negativeCapable: false,
    deprecated: false,
  },
  enableDecisionLayer: {
    registryId: "V44",
    group: "decision-layer",
    kind: "flag",
    units: "-",
    hardMin: 0,
    hardMax: 1,
    certifiedMin: 0,
    certifiedMax: 1,
    batchFallback: 0,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  pAwareInit: {
    registryId: "V29",
    group: "decision-layer",
    kind: "double",
    units: "probability",
    hardMin: 0,
    hardMax: 1,
    // Sweep 0.25–0.47, widened to 1.0: the R3 null executes 1.0 to degenerate
    // the awareness mechanism, and that run is certified.
    certifiedMin: 0.25,
    certifiedMax: 1,
    batchFallback: 1,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  pHeavyBelongings: {
    registryId: "V31",
    group: "decision-layer",
    kind: "double",
    units: "probability",
    hardMin: 0,
    hardMax: 1,
    certifiedMin: 0.108,
    certifiedMax: 0.46,
    batchFallback: 0.284,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  pHasPet: {
    registryId: "V32",
    group: "decision-layer",
    kind: "double",
    units: "probability",
    hardMin: 0,
    hardMax: 1,
    certifiedMin: 0.055,
    certifiedMax: 0.12,
    batchFallback: 0.117,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  pHasDependents: {
    registryId: "V33",
    group: "decision-layer",
    kind: "double",
    units: "probability",
    hardMin: 0,
    hardMax: 1,
    certifiedMin: 0.004,
    certifiedMax: 0.03,
    batchFallback: 0.0044,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  groupSpeedDeltaMps: {
    registryId: "V34",
    group: "demographics-movement",
    kind: "double",
    units: "m/s per member",
    hardMin: 0,
    hardMax: 1.8,
    // Sweep 0.04–0.08, widened down to 0.0: the behaviour-preserving fallback the
    // three-arm and R3-null bundles execute.
    certifiedMin: 0,
    certifiedMax: 0.08,
    batchFallback: 0,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  lambdaOutreachPerDay: {
    registryId: "V41",
    group: "decision-layer",
    kind: "double",
    units: "probability/day",
    hardMin: 0,
    hardMax: 24,
    certifiedMin: 0,
    certifiedMax: 0.2,
    batchFallback: 0,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  informationRegime: {
    registryId: "V42",
    group: "decision-layer",
    kind: "flag",
    units: "code",
    hardMin: 0,
    hardMax: 1,
    certifiedMin: 0,
    certifiedMax: 1,
    batchFallback: 0,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  enableHazardDeparture: {
    registryId: "V44",
    group: "decision-layer",
    kind: "flag",
    units: "-",
    hardMin: 0,
    hardMax: 1,
    certifiedMin: 0,
    certifiedMax: 1,
    batchFallback: 0,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  sigmaTheta: {
    registryId: "V35",
    group: "decision-layer",
    kind: "double",
    units: "log-odds",
    hardMin: 0,
    hardMax: 5,
    // Sweep 0.5–1.5, widened down to 0.0 for the R3 null.
    certifiedMin: 0,
    certifiedMax: 1.5,
    batchFallback: 0,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  alphaHazard: {
    registryId: "V38",
    group: "decision-layer",
    kind: "double",
    units: "log-odds",
    hardMin: -20,
    hardMax: 5,
    certifiedMin: -9,
    certifiedMax: -7,
    batchFallback: -8,
    guiDefault: null,
    negativeCapable: true,
    deprecated: false,
  },
  bRisk: {
    registryId: "V36",
    group: "decision-layer",
    kind: "double",
    units: "log-odds",
    hardMin: 0,
    hardMax: 5,
    certifiedMin: 0.2,
    certifiedMax: 0.8,
    batchFallback: 0.4,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  wOfficial: {
    registryId: "V37",
    group: "decision-layer",
    kind: "double",
    units: "log-odds",
    hardMin: 0,
    hardMax: 5,
    certifiedMin: 0.6,
    certifiedMax: 1.7,
    batchFallback: 1.1,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  gammaVuln: {
    registryId: "V39",
    group: "decision-layer",
    kind: "double",
    units: "log-odds multiplier",
    hardMin: 0,
    hardMax: 5,
    certifiedMin: 0,
    certifiedMax: 0.5,
    batchFallback: 0,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  riskHalfLifeH: {
    registryId: "V36",
    group: "decision-layer",
    kind: "double",
    units: "h",
    hardMin: 0.5,
    hardMax: 8760,
    certifiedMin: 12,
    certifiedMax: 72,
    batchFallback: 48,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  barrierBelongings: {
    registryId: "V40",
    group: "decision-layer",
    kind: "double",
    units: "log-odds",
    hardMin: 0,
    hardMax: 5,
    // Sweep 0.10–0.42, widened down to 0.0 (inert fallback).
    certifiedMin: 0,
    certifiedMax: 0.42,
    batchFallback: 0,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  barrierPet: {
    registryId: "V40",
    group: "decision-layer",
    kind: "double",
    units: "log-odds",
    hardMin: 0,
    hardMax: 5,
    certifiedMin: 0,
    certifiedMax: 0.42,
    batchFallback: 0,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  barrierDependents: {
    registryId: "V40",
    group: "decision-layer",
    kind: "double",
    units: "log-odds",
    hardMin: 0,
    hardMax: 5,
    certifiedMin: 0,
    certifiedMax: 0.42,
    batchFallback: 0,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  petPolicyDefault: {
    registryId: "A-29 (V45 companion)",
    group: "shelters-policy",
    kind: "flag",
    units: "code",
    hardMin: 0,
    hardMax: 1,
    certifiedMin: 0,
    certifiedMax: 1,
    batchFallback: 1,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  betaTravelTime: {
    registryId: "V43",
    group: "decision-layer",
    kind: "double",
    units: "utility/min",
    hardMin: 0,
    hardMax: 1000,
    // "swept +/- 2 orders of magnitude" around the sourced 1.0.
    certifiedMin: 0.01,
    certifiedMax: 100,
    batchFallback: 1,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  betaCapacityPrior: {
    registryId: "V43 / A-32",
    group: "decision-layer",
    kind: "double",
    units: "utility/ln(bed)",
    hardMin: 0,
    hardMax: 1000,
    // Same ±2 orders around 0.2, widened down to 0.0 (inert fallback).
    certifiedMin: 0,
    certifiedMax: 20,
    batchFallback: 0,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  shelterPolicyVariant: {
    registryId: "V45",
    group: "shelters-policy",
    kind: "flag",
    units: "code",
    hardMin: 0,
    hardMax: 1,
    certifiedMin: 0,
    certifiedMax: 1,
    batchFallback: 0,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  smokeSeriesCode: {
    registryId: "V46",
    group: "core",
    kind: "int",
    units: "code",
    hardMin: 0,
    hardMax: 2,
    certifiedMin: 0,
    certifiedMax: 2,
    batchFallback: 0,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  smokeScale: {
    registryId: "V47",
    group: "core",
    kind: "double",
    units: "dimensionless",
    hardMin: 0.25,
    hardMax: 3,
    // Registry sweep: effective severity 1.5x / 1.75x / 2.0x realised on series 1
    // as smokeScale 0.857 / 1.0 / 1.143.
    certifiedMin: 0.857,
    certifiedMax: 1.143,
    batchFallback: 1,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  closuresCode: {
    registryId: "V48",
    group: "closures",
    kind: "int",
    units: "code",
    hardMin: 0,
    hardMax: 3,
    certifiedMin: 0,
    certifiedMax: 3,
    batchFallback: 0,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  pStuck: {
    registryId: "V49",
    group: "closures",
    kind: "double",
    units: "probability",
    hardMin: 0,
    hardMax: 1,
    certifiedMin: 0.1,
    certifiedMax: 0.5,
    batchFallback: 0.3,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  stuckDelayH: {
    registryId: "V50",
    group: "closures",
    kind: "double",
    units: "h",
    hardMin: 0,
    hardMax: 168,
    certifiedMin: 1,
    certifiedMax: 6,
    batchFallback: 3,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  pushThetaThreshold: {
    registryId: "V51",
    group: "closures",
    kind: "double",
    units: "log-odds",
    hardMin: -5,
    hardMax: 5,
    certifiedMin: -0.5,
    certifiedMax: 1,
    batchFallback: -0.25,
    guiDefault: null,
    negativeCapable: true,
    deprecated: false,
  },
  kPush: {
    registryId: "V51 (paired coefficient)",
    group: "closures",
    kind: "double",
    units: "dimensionless",
    hardMin: 0,
    hardMax: 10,
    certifiedMin: 0.5,
    certifiedMax: 2,
    batchFallback: 1,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
  closureDraw: {
    registryId: "V48 (companion)",
    group: "closures",
    kind: "int",
    units: "code",
    hardMin: 1,
    hardMax: 3,
    certifiedMin: 1,
    certifiedMax: 3,
    batchFallback: 1,
    guiDefault: null,
    negativeCapable: false,
    deprecated: false,
  },
};

/** Parameter names whose registered value is negative (see the header note). */
export const NEGATIVE_CAPABLE_PARAMS: readonly ParamName[] = PARAM_NAMES.filter(
  (name) => PARAM_META[name].negativeCapable,
);

/** Fast membership test for permalink / manifest key validation. */
export const PARAM_NAME_SET: ReadonlySet<string> = new Set<string>(PARAM_NAMES);

export function isParamName(value: string): value is ParamName {
  return PARAM_NAME_SET.has(value);
}

/** Parameter names in a slider-taxonomy group, in manifest order. */
export function paramsInGroup(group: ParamGroup): readonly ParamName[] {
  return PARAM_NAMES.filter((name) => PARAM_META[name].group === group);
}

// ---------------------------------------------------------------------------
// Repast batch constant typing — the negative-"number" zeroing gotcha, encoded
// ---------------------------------------------------------------------------

/** `constant_type` values a Repast batch parameter file may carry. */
export type RepastConstantType = "int" | "number" | "double";

/**
 * The `constant_type` a Repast batch file must declare for `name = value`.
 *
 * The browser never *runs* a batch file, so why is this here? Because the rule
 * is a property of the parameter surface, and encoding it once — beside the
 * parameter it constrains — is what stops it being re-derived (wrongly) at the
 * three places that care: the preset→batch export a mentor re-run would use, the
 * standing audit of the instrument's own files in
 * `validation/test/preset-batch-parity.test.ts`, and any future sweep generator.
 *
 * The rule, transcribed from `scripts/make_batch_params_E.py:113-122`:
 *
 * ```python
 * # Repast's batch parser silently zeroes NEGATIVE constant_type="number"
 * # values (probe-verified 2026-07-30: value="-0.25" executed as 0.0
 * # while every positive came through; constant_type="double" executes
 * # -0.25 correctly).
 * if ptype == "number" and str(pval).lstrip().startswith("-"):
 *     ptype = "double"
 * ```
 *
 * Base type follows the generator's own tables (`make_batch_params_E.py:44-104`)
 * and therefore {@link ParamMeta.kind}: `int`/`flag` → `"int"`, `double` →
 * `"number"`, with negatives promoted to `"double"`.
 *
 * **Scope discipline (`WP8-SPEC-archive-gates.md` §6.1).** The promotion is
 * applied only to `"number"`, exactly as the generator does. The documented root
 * cause ("Repast zeroes negative `number` constants") does not fully explain the
 * archive: `alphaHazard = -8.0` and `pushThetaThreshold = -0.25` were *both*
 * negative `"number"` in the batch files the runs executed from, yet every
 * archived manifest records `alphaHazard: -8.0` and every archived SE/SE2
 * manifest records `pushThetaThreshold: 0.0`. Something about the two cases
 * differs and the repo carries no probe artefact to settle it, so this function
 * implements the **safe** rule rather than a confident model of the defect, and
 * makes no claim about negative `"int"` values (`randomSeed` is the only one, and
 * the archive contains no negative-seed batch run to learn from).
 */
export function repastConstantType(name: ParamName, value: number): RepastConstantType {
  const base: RepastConstantType = PARAM_META[name].kind === "double" ? "number" : "int";
  return base === "number" && value < 0 ? "double" : base;
}

/**
 * Parameter names a config drives negative. Used by the preset tests to prove
 * the gotcha's precondition is real for the WP8 surface rather than assumed.
 */
export function negativeValuedParams(config: Readonly<Record<ParamName, number>>): ParamName[] {
  return PARAM_NAMES.filter((name) => config[name] < 0);
}
