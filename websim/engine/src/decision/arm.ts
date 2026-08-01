/**
 * `setDecisionLayer` (`GisAgent.java:934-959`) — arming one resident at build.
 *
 * Runs once per resident, in `ContextCreator`'s step 11, **after** placement, in
 * creation order. It consumes no randomness; it *constructs* the private stream
 * and precomputes the two per-resident constants the run-time layer reads.
 *
 * Five things it establishes, all mandatory (WP8-SPEC-decision.md §2):
 *
 * 1. **`decisionRng` is per agent, constructed ONCE, here.** `StreamRegistry`'s
 *    `agentStream(index)` is a *factory*; calling it per tick restarts the
 *    sequence at draw 0 and makes every hour's Bernoulli identical (QUIRK 25).
 *    The instance is stored on the resident and lives as long as it does.
 * 2. **`thetaScaled = sigmaTheta * thetaZ`, precomputed.** `thetaZ` is the raw
 *    standard normal and is never scaled anywhere else.
 * 3. **`barrierCost` accumulates belongings → pet → dependents, in that order.**
 *    Floating-point addition is not associative (QUIRK 5).
 * 4. **The pet term reads the WORLD default, never a site.** The modelled burden
 *    is *anticipating* refusal, so it cannot depend on which door the resident
 *    will later pick; per-site policy is discovered at the door.
 * 5. **`believedFull` is allocated in BOTH regimes.** Under L0 it records policy
 *    refusals only, and without it a pet owner re-selects the same refusing door
 *    forever — the omniscient chooser filters on live capacity, and nothing else
 *    filters on intake policy.
 *
 * An initially-unaware resident's state becomes `UNAWARE` **at build**, before
 * tick 1, and its `awareTick` is `NaN` (which `agents.csv` renders as an empty
 * cell). An initially-aware one stays `PRE_EVAC` with `awareTick = 0.0`.
 */

import type { DecisionAttributes } from "../agents/eLayerSampler.js";
import type { Resident } from "../agents/resident.js";
import { JavaRandom } from "../rng/JavaRandom.js";
import { isE0NullConfig, type DecisionConfig } from "./config.js";
import { BR, hit } from "./probe.js";

/**
 * Arm `a` with the run's shared {@link DecisionConfig} and its own sampled
 * attributes, exactly as `setDecisionLayer` does.
 *
 * @param a       the resident, mutated in place
 * @param config  the ONE config instance shared by every resident in the run
 * @param da      this resident's `ELayerSampler.sample()` result
 */
export function armResident(a: Resident, config: DecisionConfig, da: DecisionAttributes): void {
  a.decisionConfig = config;
  a.decision = da;
  a.decisionRng = new JavaRandom(da.decisionSeed);
  a.thetaScaled = config.sigmaTheta * da.thetaZ;

  // Belongings, then pet, then dependents — the order is the arithmetic.
  let c = 0.0;
  if (da.heavyBelongings) c += config.barrierBelongings;
  if (da.hasPet && !config.petPolicyAdmitDefault) c += config.barrierPet;
  if (da.hasDependents) c += config.barrierDependents;
  a.barrierCost = c;

  a.believedFull = new Set<string>();

  if (da.awareInitial) {
    a.awareTick = 0.0; // aware from the start; state stays PRE_EVAC
    hit(BR.AWARE_INIT);
  } else {
    // The E0 null exists to be byte-identical to a layer-off run, and a resident
    // that starts UNAWARE has already diverged from one: it takes the
    // `layer: true` UNAWARE row of the transition table on its very first tick.
    // Assert rather than trust the parameter sheet — R3 is the flagship gate and
    // "we set pAwareInit to 1.0" is a claim about a config file, not about code.
    if (isE0NullConfig(config)) {
      throw new Error(
        `resident ${a.name} was armed UNAWARE under an E0-null DecisionConfig: an E0-null run ` +
          "must never reach a decision-layer transition (R3 byte-identity is the basis of the " +
          "Tier-2 identity check)",
      );
    }
    a.state = "UNAWARE";
    a.awareTick = Number.NaN;
    hit(BR.UNAWARE_INIT);
  }

  // BR-03 belongs to the per-tick pace block; only its complement is counted
  // here, once per resident, because the skipped branch executes no statement.
  if (!(da.groupSpeedDeltaMps > 0.0)) {
    hit(BR.PACE_OFF);
  }
}
