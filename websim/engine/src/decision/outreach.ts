/**
 * The information regime's one mechanism: outreach conversion (V41)
 * (`GisAgent.java:384-393`, WP8-SPEC-decision.md §5).
 *
 * ```java
 * if (newHour && decisionConfig.lambdaOutreachPerDay > 0.0
 *         && decisionRng.nextDouble() < decisionConfig.lambdaOutreachPerDay / 24.0) {
 *     state = State.PRE_EVAC;
 *     awareTick = tick;
 * }
 * if (state == State.UNAWARE) {
 *     return;
 * }
 * ```
 *
 * Four properties, each of which a plausible rewrite loses:
 *
 * - **Triple short-circuit.** No draw unless `newHour` **and** `lambda > 0.0`
 *   strictly. `lambdaOutreachPerDay = 0.0` is the fallback, the E0 null, **and
 *   every archived ER/SE arm** (QUIRK 28), so in the archive this mechanism
 *   consumes zero draws for the entire run and nothing ever rescues the 64% of
 *   residents sampled `awareInitial == false`. A port whose ER run converts
 *   anyone has a bug.
 * - **`lambda / 24.0`, a division of a variable** (QUIRK 4). Not
 *   `lambda * (1.0/24.0)`: `1.0/24.0` is `0.041666666666666664` and the two
 *   differ for many `lambda`.
 * - **Memoryless hourly Bernoulli.** No contact list, no outreach team, no
 *   dependence on other agents or on shelters.
 * - **The follow-up `if (state == UNAWARE) return;` is a RE-TEST, not an
 *   `else`.** A resident converted on this tick falls through into the
 *   hazard/latch branch in the *same* tick, with the *same* `newHour`, so its
 *   hazard draw is live. That is the genuine two-draw agent-tick the oracle
 *   counts as BR-27, and it fired 4,414 times in `ERL-A`.
 *
 * Awareness and the L0/L1 regime are orthogonal switches: nothing here reads
 * `informationRegime`, and `UNAWARE` is the only new enum value in the model.
 */

import type { DecisionConfig } from "./config.js";

/**
 * Whether the D1 outreach draw is consumed this agent-tick — the first two
 * operands of the short-circuit chain, with the draw itself left to the caller
 * so the stream advances at exactly the right moment.
 */
export function outreachDrawConsumed(config: DecisionConfig, newHour: boolean): boolean {
  return newHour && config.lambdaOutreachPerDay > 0.0;
}

/** The per-hour conversion probability: `lambdaOutreachPerDay / 24.0`. */
export function outreachHourlyProbability(config: DecisionConfig): number {
  return config.lambdaOutreachPerDay / 24.0;
}
