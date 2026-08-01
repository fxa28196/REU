/**
 * The E0-null invariant, as an executable assertion rather than a comment.
 *
 * ## What it protects
 *
 * The **E0 null** is the layer armed with every mechanism degenerate. Its whole
 * purpose is to be byte-identical to the same arm with the layer switched off:
 * the executed statements differ, the values do not, and that identity (R3) is
 * WP8's flagship acceptance criterion and the basis of the Tier-2 identity
 * check. An E0-null run that reached a decision-layer transition would still
 * *look* right in aggregate — the transition is rare — while R3 had silently
 * stopped proving anything. So the layer asserts instead of trusting: WP7 held
 * the line with a throw at the top of `stepResident`, and WP8 replaces that
 * throw with these two, which survive the branches becoming real.
 *
 * ## Why the guard is here and not inlined
 *
 * Under a genuinely E0-null config the two transitions are *structurally*
 * unreachable — `enableHazardDeparture` is 0 and λ is 0, which is part of the
 * definition of the class. That is the point, and it is also why the guard
 * cannot be tripped from outside without lying about the configuration. Exposing
 * it as a plain function is what makes the guard **provably able to fail**
 * (plan §5.2): a test calls it directly with an E0-null config and an arbitrary
 * transition name, and gets the error. The wiring — that the call sites are the
 * two transitions and nothing else — is proved separately, by a zero-counter
 * assertion over a full E0-null episode.
 */

import { isE0NullConfig, type DecisionConfig } from "./config.js";

/**
 * Throw if `config` is the E0 null.
 *
 * Called at the two decision-layer transitions (outreach conversion, hazard
 * departure) *after* the branch has been decided and *before* the state is
 * written, so the error names a transition that was about to happen.
 *
 * @param who    the resident's name, for the message
 * @param what   the transition, spelled as the §13 table spells it
 */
export function assertNoLayerTransition(
  who: string,
  config: DecisionConfig,
  what: string,
): void {
  if (isE0NullConfig(config)) {
    throw new Error(
      `resident ${who} took the decision-layer transition "${what}" under an E0-null ` +
        "DecisionConfig: an E0-null run must be byte-identical to the same arm with the layer " +
        "off, which is the basis of the Tier-2 R3 identity check",
    );
  }
}
