/**
 * Hazard departure (V36-V40) — the risk accumulator, the logistic and the draw
 * (`GisAgent.java:365-421`, WP8-SPEC-decision.md §4).
 *
 * Every expression here is separated into its own named function for exactly one
 * reason: the Java oracle dumps `decay`, `bRiskEff`, `u` and `p` as raw IEEE-754
 * bits out of the certified frame that computed them
 * (DR-WP8-decision-oracle.md §3), so each intermediate has a bit-exact
 * expectation of its own and a wrong term cannot hide inside a right total.
 *
 * ## The five things a readable rewrite gets wrong
 *
 * 1. **`open &&` gates the draw, and it is the SECOND operand** (QUIRK 1).
 *    `if (open && rng.nextDouble() < p)`. While every shelter is closed — the
 *    first ~two days of every archived ER arm — `u` and `p` are computed and
 *    thrown away and the stream does **not** advance. Hoisting the draw out of
 *    the `if` "so it can be logged" desynchronises every resident's private
 *    stream and produces a completely different, entirely plausible run. That is
 *    why {@link hazardDrawConsumed} exists as a named predicate: the question
 *    "does this hour consume a draw?" has one answer and one place to read it.
 * 2. **`u` accumulates strictly left to right** (QUIRK 5):
 *    `((((alpha + bRiskEff*zR) + wOfficial*openInd) + thetaScaled) - barrierCost)`.
 *    Do not factor, do not reassociate, do not fold `-barrierCost` into `alpha`.
 * 3. **`bRiskEff` is computed FIRST, then multiplied by `zR`** — not
 *    `bRisk*zR*(1+γ)`.
 * 4. **`vulnerable` here is NOT the reporting `isVulnerable`** (QUIRK 9). Four
 *    terms and age **65** here; five terms and age **55** in
 *    `output/logger.ts`. Sharing a helper silently changes one or the other.
 * 5. **Transcendentals route through `mathx`** (QUIRK 24). `Math.pow`/`Math.exp`
 *    are implementation-approximated in ECMA-262, so their last ulp is a
 *    property of the browser build, and the logistic can amplify a last-ulp
 *    difference into a flipped Bernoulli at a knife edge.
 *
 * ## The one place this module is NOT bit-equal to the archived Java
 *
 * `GisAgent` calls `Math.exp`, which JDK 17 intrinsifies to an x86-64 LIBM stub
 * that is not `StrictMath`; `mathx` is fdlibm and therefore *is* `StrictMath`.
 * DR-S1 §5.4 fixed the target as **JS === JS across engines**, not JS === the
 * archived intrinsics, so `p` is expected to differ from the Java frame's in the
 * last ulp or two. `oracle.trace.test.ts` measures it rather than assuming it:
 * over 330,613 dumped hazard evaluations, 91.27 % are bit-equal and the maximum
 * deviation is **2 ulp** — and over the 86,670 hazard Bernoullis the oracle
 * actually resolved, **zero** land on the other side of the comparison. `decay`
 * (`pow(2, -1/48)`) is bit-equal on all 1,724,278 dumped values, so `z_R` itself
 * is exact. Everything else here is pure IEEE arithmetic and is bit-equal by
 * construction.
 *
 * ## The hour bucket
 *
 * `hour = (int) floor(tick * minutesPerTick / 60.0)` is **bit-identically** the
 * expression `SmokeField.concentrationForTick` uses for its hour index, so the
 * `cNow` that feeds `z_R` on a new hour is that hour's concentration sampled on
 * the hour's first tick. `newHour` is a monotone-index test, not an
 * elapsed-time test (QUIRK 2): with `minutesPerTick > 60` the index jumps by
 * more than one and the model still applies exactly one decay and one
 * increment. That under-decays `z_R`; it is the certified behaviour.
 */

import { riskCueFires, UNHEALTHY_UGM3 } from "../agents/stateMachine.js";
import type { PopulationAttributes } from "../agents/populationSampler.js";
import { fdlibmExp, fdlibmPow } from "../mathx/index.js";
import { doubleToInt } from "../mathx/truncCast.js";
import type { DecisionConfig } from "./config.js";

/** `(int) Math.floor(tick * minutesPerTick / 60.0)` — multiply, THEN divide. */
export function hourBucket(tick: number, minutesPerTick: number): number {
  return doubleToInt(Math.floor((tick * minutesPerTick) / 60.0));
}

/** `hour > lastDecisionHour`; `lastDecisionHour` starts at **−1**, so hour 0 is new. */
export function isNewHour(hour: number, lastDecisionHour: number): boolean {
  return hour > lastDecisionHour;
}

/**
 * `Math.pow(2.0, -1.0 / riskHalfLifeH)` — one application per new hour.
 *
 * Recomputed every hour for every agent in the certified model. Caching it per
 * run or per agent is numerically identical (same inputs, deterministic `pow`)
 * and is permitted; nothing else in the update may be reassociated.
 */
export function riskDecay(riskHalfLifeH: number): number {
  return fdlibmPow(2.0, -1.0 / riskHalfLifeH);
}

/**
 * `zR * decay + (cNow >= UNHEALTHY_UGM3 ? 1.0/24.0 : 0.0)`.
 *
 * `z_R` is in cumulative unhealthy-exposure **days**, which is where the `1/24`
 * comes from; it is not a PM2.5 integral. The threshold is **inclusive** `>=`
 * 55.5 — the mirror image of the strict `>` `hoursAboveUnhealthy` uses on the
 * same constant (QUIRK 10). {@link riskCueFires} is the shared predicate so the
 * pair cannot be harmonised by accident.
 *
 * **No RNG is consumed.** That is what lets the E0 null execute this block and
 * still be byte-identical to a layer-off run.
 */
export function updateRiskAccumulator(zR: number, decay: number, cNow: number): number {
  return zR * decay + (riskCueFires(cNow) ? 1.0 / 24.0 : 0.0);
}

/**
 * The hazard vulnerability predicate (`GisAgent.java:405-407`).
 *
 * `copd || asthma || ageYears >= 65 || mobilityLimited` — four terms, age
 * **65**. NOT `output/logger.ts`'s five-term, age-55 reporting stratum
 * (QUIRK 9). `false` for every resident when heterogeneity is off, which is why
 * `gammaVuln` is inert without `enableHeterogeneity = 1`.
 */
export function hazardVulnerable(attributes: PopulationAttributes | null): boolean {
  return (
    attributes !== null &&
    (attributes.copd || attributes.asthma || attributes.ageYears >= 65 || attributes.mobilityLimited)
  );
}

/** `bRisk * (1.0 + (vulnerable ? gammaVuln : 0.0))` — computed before `* zR`. */
export function effectiveBRisk(config: DecisionConfig, vulnerable: boolean): number {
  return config.bRisk * (1.0 + (vulnerable ? config.gammaVuln : 0.0));
}

/**
 * The log-odds `u`, left to right (`GisAgent.java:408-411`).
 *
 * `alphaHazard + bRiskEff*zR + wOfficial*(open?1:0) + thetaScaled - barrierCost`
 * with JavaScript's own left-associative `+`/`-`, which is Java's. The
 * `barrierCost` subtraction is the Wachinger constraint: a high-barrier resident
 * may never depart even at peak PM2.5.
 */
export function hazardLogOdds(
  config: DecisionConfig,
  bRiskEff: number,
  zR: number,
  open: boolean,
  thetaScaled: number,
  barrierCost: number,
): number {
  return (
    config.alphaHazard +
    bRiskEff * zR +
    config.wOfficial * (open ? 1.0 : 0.0) +
    thetaScaled -
    barrierCost
  );
}

/**
 * `1.0 / (1.0 + Math.exp(-u))`.
 *
 * Both limits are safe and identical in Java and JS: `u` very negative overflows
 * `exp(-u)` to `+Infinity` and `p` is `0.0` (`nextDouble() < 0.0` is never
 * true); `u` very positive underflows it to `0.0` and `p` is `1.0`
 * (`nextDouble()` returns `[0,1)`, so the comparison is always true).
 */
export function logistic(u: number): number {
  return 1.0 / (1.0 + fdlibmExp(-u));
}

/**
 * Whether the hazard Bernoulli consumes a draw this hour — i.e. whether `open`
 * is true. Named, because the answer *is* QUIRK 1 and a test asserts it directly
 * against the Java draw dump rather than inferring it from an outcome.
 */
export function hazardDrawConsumed(open: boolean): boolean {
  return open;
}

/**
 * Re-exported so a reader of this module sees the single constant that the
 * inclusive risk cue, the strict `hoursAboveUnhealthy` counter and the legacy
 * latch all read. Three call sites, two operators, all deliberate (QUIRK 10).
 */
export { UNHEALTHY_UGM3 };
