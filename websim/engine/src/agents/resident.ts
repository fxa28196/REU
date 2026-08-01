/**
 * One resident's mutable run state — the fields of `GisAgent` that `step()`
 * reads or writes, and nothing else.
 *
 * A class of unboxed doubles rather than a struct-of-arrays: at n ≤ 6,842 the
 * whole population is ~1 MB either way, and DR-S3 measured the tick loop's cost
 * as 95% geodesic and ~5% "everything else", so the field layout was never the
 * lever. What *is* load-bearing is that every accumulator is a `number`
 * initialised exactly as the Java field is (`0`, or `NaN` for the three
 * "hasn't happened" ticks), because `NaN` is what `agents.csv` renders as an
 * empty cell and a `0` default would silently become a real reading.
 */

import type { RouteLeg, RouteNodes } from "./route.js";
import type { PopulationAttributes } from "./populationSampler.js";
import type { DecisionAttributes } from "./eLayerSampler.js";
import type { DecisionConfig } from "../decision/config.js";
import type { JavaRandom } from "../rng/JavaRandom.js";
import type { Shelter } from "../shelters/shelter.js";
import type { State } from "./stateMachine.js";

export class Resident {
  /** Creation index — the `i` in `"Site " + i` and the decision-seed index. */
  readonly index: number;
  /** `GisAgent.getName()`, the `agent_id` column. */
  readonly name: string;
  /**
   * `inc_id` of the campsite report this resident started at; `"none"` when the
   * camp list was empty, and `null` when the CSV had no `inc_id` column at all
   * (`ContextCreator.java:740` stores whatever `campIds.get(idx)` returned, and
   * `%s` renders a null reference as the four characters `null`).
   */
  readonly encampmentId: string | null;
  readonly startLon: number;
  readonly startLat: number;
  /** Node **index** the resident was snapped to at build time. */
  readonly startNode: number;

  state: State = "PRE_EVAC";

  /** Where the resident stands, WGS84. Materialised, not carried per tick. */
  posLon: number;
  posLat: number;

  /** `GisAgent.currentNodeId` as a node **index** (A-17: never the start node after a refusal). */
  currentNode: number;

  targetShelter: Shelter | null = null;
  /** The planned leg, or `null` when a new one must be chosen. */
  leg: RouteLeg | null = null;
  /**
   * Off-network metres from where the resident stood when the leg was planned
   * to the leg's first vertex. Java walks this stretch too — the movement loop
   * starts at `geography.getGeometry(this)`, not at `routePath.get(0)`.
   */
  legApproachM = 0;
  /** Distance already walked on this leg, over `[0, legApproachM + leg.totalM]`. */
  legTravelM = 0;
  /** Standing point when the leg was planned; the approach interpolates from it. */
  legFromLon = Number.NaN;
  legFromLat = Number.NaN;

  retargetCount = 0;

  arrivalTick = Number.NaN;
  evacuationTick = Number.NaN;

  networkDistToShelterM = Number.NaN;
  distanceTraveledM = 0;
  plannedRouteM = 0;
  snapGapM = 0;

  // --- exposure vs dose: THREE distinct quantities, and one misnamed column --
  //
  // `GisAgent.java:55-66` is explicit that these must never be mixed:
  //   exposure = SUM C*dt            [ug/m3 * h]  physics of the AIR
  //   dose     = SUM C*IR(activity)*dt   [ug]     physics of the PERSON
  //   risk     = a susceptibility weight, pinned 1.0
  //
  // The field names below are the Java field names, unchanged, so every line of
  // `output/logger.ts` greps back to its source. The **column** names are also
  // the Java column names, unchanged, so the bytes stay archive-comparable. The
  // two do not line up, and that is the instrument's doing, not the port's:
  //
  //   exposureUgM3h                -> "cumulative_dose_ugm3h"   <- MISNOMER
  //   exposureWhileTravelingUgM3h  -> "exposure_while_traveling_ugm3h"
  //   vweUgM3h                     -> "vwe_ugm3h"
  //   inhaledDoseUg                -> "inhaled_dose_ug"          <- the real dose
  //
  // `cumulative_dose_ugm3h` holds EXPOSURE. Its own unit suffix says so —
  // ug/m3*h is a concentration-time, whereas a dose is a mass (ug) — but the
  // word "dose" in the column name invites exactly one future defect: someone
  // "fixing" the mismatch by wiring `inhaledDoseUg` into that column, which
  // would silently break every archived comparison. That transposition is
  // pinned against in `engine/test/output/logger.units.test.ts`
  // ("writes exposure (not dose) into cumulative_dose_ugm3h"), and the
  // discrepancy is registered in README §7. Do not rename either side.

  /** SUM C*dt. Serialises to the misnamed `cumulative_dose_ugm3h` — see above. */
  exposureUgM3h = 0;
  /** Vulnerability-weighted exposure; numerically == `exposureUgM3h` while the RRs are 1.0. */
  vweUgM3h = 0;
  /** The EN_ROUTE-only share of `exposureUgM3h`; serialises to `exposure_while_traveling_ugm3h`. */
  exposureWhileTravelingUgM3h = 0;
  hoursAboveUnhealthy = 0;
  /** SUM C*IR(activity)*dt, in ug. The ACTUAL dose; serialises to `inhaled_dose_ug`. */
  inhaledDoseUg = 0;
  airVolumeBreathedM3 = 0;
  peakConcUgM3 = 0;
  outdoorHours = 0;

  /** Pinned at 1.0 by design (A-09): risk is never folded into the physics. */
  readonly ageRR = 1;
  readonly comorbidityRR = 1;

  readonly attributes: PopulationAttributes | null;

  // --- Phase E / Scenario E (WP8) -------------------------------------------
  //
  // Every field below is `null`/`NaN`/`0`/`-1` exactly as the Java field is, and
  // the layer is a **strictly opt-in overlay**: with `decisionConfig === null`
  // and `decision === null`, `step()` executes the legacy path statement for
  // statement. `armResident` (`decision/arm.ts`) is the only writer of the first
  // five, and it is the port of `setDecisionLayer`.

  /** The ONE run-wide config instance, shared by reference with every resident. */
  decisionConfig: DecisionConfig | null = null;
  decision: DecisionAttributes | null = null;
  /**
   * The private in-run stream, constructed **once** at arming (QUIRK 25).
   * `StreamRegistry.agentStream` is a factory; calling it per tick would restart
   * the sequence at draw 0 and make every hour's Bernoulli identical.
   */
  decisionRng: JavaRandom | null = null;
  /** `sigmaTheta * thetaZ`, precomputed; constant over the run. */
  thetaScaled = 0;
  /** `c_i`, precomputed belongings → pet → dependents (order is the arithmetic). */
  barrierCost = 0;

  awareTick = Number.NaN;
  /** Cumulative unhealthy-exposure DAYS (V36). Init `0.0`. */
  zR = 0;
  /** **Init −1**, not 0 — so hour 0 is a new hour. */
  lastDecisionHour = -1;
  /** Allocated in BOTH regimes when the layer is armed; `null` when it is not. */
  believedFull: Set<string> | null = null;

  /** The planned leg's node chain; `null` unless a closure schedule is active. */
  routeNodes: RouteNodes | null = null;
  /** `network.getClosureVersion()` as of the last plan or scan. Init `0`. */
  seenClosureVersion = 0;
  /** Edges this resident has already gambled on; lazily allocated on first push. */
  pushedBlockages: Set<string> | null = null;

  blockagesEncountered = 0;
  pushThroughs = 0;
  reroutes = 0;
  stuckEvents = 0;
  stuckUntilTick = Number.NaN;

  constructor(init: {
    index: number;
    name: string;
    encampmentId: string | null;
    startLon: number;
    startLat: number;
    startNode: number;
    attributes: PopulationAttributes | null;
  }) {
    this.index = init.index;
    this.name = init.name;
    this.encampmentId = init.encampmentId;
    this.startLon = init.startLon;
    this.startLat = init.startLat;
    this.startNode = init.startNode;
    this.currentNode = init.startNode;
    this.posLon = init.startLon;
    this.posLat = init.startLat;
    this.attributes = init.attributes;
  }

  /** `getMeanVentilationM3h()` — NaN when the resident never spent a tick outdoors. */
  get meanVentilationM3h(): number {
    return this.outdoorHours > 0 ? this.airVolumeBreathedM3 / this.outdoorHours : Number.NaN;
  }

  /** `getHealthRiskMultiplier()` — 1.0 for every resident, deliberately (A-09/A-22). */
  get healthRiskMultiplier(): number {
    return 1;
  }

  /** `getHealthRiskScore()` — dose × susceptibility, numerically ≡ dose while the weight is 1. */
  get healthRiskScore(): number {
    return this.inhaledDoseUg * this.healthRiskMultiplier;
  }
}
