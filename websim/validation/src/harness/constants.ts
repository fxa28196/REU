/**
 * constants.ts — the module-level constants of `scripts/verify_E_runs.py`.
 *
 * Every list, set, regex and threshold below is transcribed from the certified
 * Python (lines 84–156), in the same order, with the same membership. They are
 * gathered in one module because several of them are *load-bearing by omission*
 * — `closureDraw` is deliberately absent from {@link SE_PARAMS}, and only two
 * column names are in {@link IDENTITY_EXCLUDE} — and an omission is much easier
 * to review when the lists sit next to each other with the reason attached.
 */

/**
 * The 21 Phase-E parameters (`ContextCreator` pNames tail, commit c88de56).
 * Gate (h) requires all 21 in `reproducibility.parameters`.
 */
export const E_PARAMS: readonly string[] = [
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
];

/**
 * The 7 core Scenario-E parameters (V46–V51; `shelterPolicyVariant` is
 * V45/Phase-E). Verbatim from the Python's comment: `closureDraw` is checked
 * separately because *"it entered the manifest with the worst-case family, so
 * the archived v1 SE runs legitimately lack it."* Adding it here would turn
 * nine correct archived runs red.
 */
export const SE_PARAMS: readonly string[] = [
  "smokeSeriesCode",
  "smokeScale",
  "closuresCode",
  "pStuck",
  "stuckDelayH",
  "pushThetaThreshold",
  "kPush",
];

/** Scenario-E appended `agents.csv` counters (V48–V51 audit trail). */
export const SE_AGENT_COLS: readonly string[] = [
  "blockages_encountered",
  "push_throughs",
  "reroutes",
  "stuck_events",
];

/**
 * Appended-only output columns (`OutcomeLogger`, commit c88de56). The pre-E
 * archive predates them, so the R3 comparison necessarily excludes them — and
 * may exclude *only* them.
 */
export const E_AGENT_COLS: readonly string[] = [
  "aware_initial",
  "aware_tick",
  "heavy_belongings",
  "has_pet",
  "has_dependents",
  "theta_z",
];

export const E_SHELTER_COLS: readonly string[] = ["policy_refused"];

/**
 * Run-identity columns that differ between any two runs by construction:
 * `sim_id` embeds a wall-clock stamp, `commit` is HEAD at run time.
 *
 * Verbatim from the source, and the single most load-bearing comment in the
 * gate suite: *"Deliberately NOT excluded: time_started_local /
 * time_arrived_local. Those are sim-clock instants derived from the tick and
 * the smoke-field anchor, i.e. outcomes, and they are among the sharpest
 * identity evidence available."*
 */
export const IDENTITY_EXCLUDE: ReadonlySet<string> = new Set(["sim_id", "commit"]);

/** Any future wall-clock column picked up automatically. */
export const WALLCLOCK_RE =
  /(^|_)(generated|created|wallclock|timestamp|run_at|export(ed)?_at)(_|$)/iu;

/** Gate (d)'s vocabulary map; the R3 census check reads its keys. */
export const STATE_TO_CENSUS: Readonly<Record<string, string>> = {
  PRE_EVAC: "pre_evac",
  EN_ROUTE: "en_route",
  SHELTERED: "sheltered",
  UNREACHABLE: "unreachable",
  REFUSED_ALL_FULL: "refused_all_full",
  UNAWARE: "unaware",
};

/**
 * `decision_layer` realised-share key → the parameter that must have produced
 * it. Gate (g.1). Insertion order is the Python's iteration order and therefore
 * the order the check lines appear in.
 */
export const CENSUS_TO_PARAM: readonly (readonly [string, string])[] = [
  ["realised_aware", "pAwareInit"],
  ["realised_heavy_belongings", "pHeavyBelongings"],
  ["realised_pet", "pHasPet"],
  ["realised_dependents", "pHasDependents"],
];

/** `decision_layer` realised-share key → the `agents.csv` column. Gate (g.2). */
export const CENSUS_TO_COLUMN: readonly (readonly [string, string])[] = [
  ["realised_aware", "aware_initial"],
  ["realised_heavy_belongings", "heavy_belongings"],
  ["realised_pet", "has_pet"],
  ["realised_dependents", "has_dependents"],
];

/**
 * Verbatim: *"The manifest prints realised shares with %.4f, so a realised k/n
 * can sit up to 5e-5 from the value the sampler actually produced. Slack, not
 * tolerance."* It is **added to** 3 binomial SE in (g.1) and is the whole
 * budget in (g.2).
 */
export const ROUND_SLACK = 1e-4;

/** The shared-key census compared between an R3 null and its reference. */
export const R3_POPULATION_KEYS: readonly string[] = [
  "pre_evac",
  "sheltered",
  "en_route",
  "unreachable",
  "refused_all_full",
  "n_agents",
];
