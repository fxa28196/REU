# WP8-SPEC-decision — the Phase-E decision layer, exactly

**Status:** specification only. No code in this document has been written to the engine yet.
**Authority:** this document is subordinate to the Java sources it quotes. Where it and the Java
disagree, the Java wins and this document is the defect.

**Primary source**
`Geography/src/geography/agents/GisAgent.java` (1,040 lines, read in full at the commit under
`de7c045`). Every line citation below is `GisAgent.java:<line>` unless another file is named.

**Secondary sources**
`Geography/src/geography/agents/ELayerSampler.java` (207 lines) — the sampled attributes.
`Geography/src/geography/agents/ContextCreator.java` — build-time wiring (the decision layer is
wired in ContextCreator's **step 11**, lines 772–804).
`Geography/src/geography/agents/Shelter.java` (209 lines) — capacity, windows, policy columns.
`Geography/src/geography/routing/StreetNetwork.java` — `NodePath` / `coordOffset` / `isBlocked`.

**Port-side references**
`websim/docs/PORT_MAP.md` §1.4 (state machine), §1.5 (step order), §1.6.2 (choosers), §1.6.3
(closure reaction), §1.8 (RNG), §2.6 (parameter surface).
`websim/docs/IMPLEMENTATION_PLAN.md` §8 (WP8 scope and acceptance), §5 (validation tiers).

**How to read this document.** §1–§13 are the behaviour, in evaluation order. §14 is the RNG
draw-site register. §15 is the numbered QUIRKS list — read it before writing a line of code; it is
the part that a plausible-looking port gets wrong. §16 is the register of WP7 latch points and
declared-but-inert fields that WP8 must fill, by file and line.

---

## 0. The one-paragraph summary

The decision layer is a **strictly opt-in overlay**. Every agent carries `decisionConfig == null`
and `decisionAttributes == null` unless `enableDecisionLayer == 1`, and every new code path in
`step()` is gated on `decisionConfig != null && decisionAttributes != null`
(`GisAgent.java:369`, `320`, `551`, `664`, `797`). With the layer off, `step()` executes the WP7
legacy path *statement for statement*. With the layer on but every mechanism degenerate (the "E0
null"), the executed statements differ but the *values* do not, and the run is byte-identical to the
archived legacy arm — that identity (R3) is WP8's flagship acceptance criterion.

---

## 1. `DecisionConfig` — every field, exactly

`GisAgent.java:114–169`. A `public static final class` nested in `GisAgent`; **all fields
`public final`**, one instance shared by every agent in a run (`ContextCreator.java:781–789`
constructs it once, outside the per-resident loop, and hands the *same reference* to all of them).

### 1.1 Field table

Order is declaration order (`:117–141`), which is **also constructor-parameter order**
(`:143–148`). The constructor is positional and unnamed; permuting it silently rewires the model.

| # | Field | Java type | Batch parameter | `intParam`/`doubleParam` fallback | ER (baseline-real) value | V-number |
|---|---|---|---|---|---|---|
| 1 | `informationRegime` | `int` | `informationRegime` | `0` | `1` | V42 |
| 2 | `enableHazardDeparture` | `int` | `enableHazardDeparture` | `0` | `1` | V44 |
| 3 | `alphaHazard` | `double` | `alphaHazard` | `-8.0` | `-8.0` | V38 |
| 4 | `bRisk` | `double` | `bRisk` | `0.4` | `0.4` | V36 |
| 5 | `wOfficial` | `double` | `wOfficial` | `1.1` | `1.1` | V37 |
| 6 | `gammaVuln` | `double` | `gammaVuln` | `0.0` | `0.25` | V39 |
| 7 | `sigmaTheta` | `double` | `sigmaTheta` | `0.0` | `1.0` | V35 |
| 8 | `riskHalfLifeH` | `double` | `riskHalfLifeH` | `48.0` | `48.0` | V36 |
| 9 | `lambdaOutreachPerDay` | `double` | `lambdaOutreachPerDay` | `0.0` | `0.0` | V41 |
| 10 | `barrierBelongings` | `double` | `barrierBelongings` | `0.0` | `0.26` | V40 |
| 11 | `barrierPet` | `double` | `barrierPet` | `0.0` | `0.26` | V40 |
| 12 | `barrierDependents` | `double` | `barrierDependents` | `0.0` | `0.26` | V40 |
| 13 | `petPolicyAdmitDefault` | `boolean` | `petPolicyDefault` (`int`) | `1` → `true` | `0` → `false` | V32/A-29 |
| 14 | `betaTravelTime` | `double` | `betaTravelTime` | `1.0` | `1.0` | V43 |
| 15 | `betaCapacityPrior` | `double` | `betaCapacityPrior` | `0.0` | `0.2` | V43/A-32 |
| 16 | `pushThetaThreshold` | `double` | `pushThetaThreshold` | `-0.25` | (Scenario E only) | V51 |
| 17 | `kPush` | `double` | `kPush` | `1.0` | (Scenario E only) | V51 |
| 18 | `pStuck` | `double` | `pStuck` | `0.3` | (Scenario E only) | V49 |
| 19 | `stuckDelayH` | `double` | `stuckDelayH` | `3.0` | (Scenario E only) | V50 |

The `int → boolean` conversion for field 13 happens **at the call site**, not in the constructor:

```java
// ContextCreator.java:785
barrierDependents, petPolicyDefault == 1,
```

so any value other than exactly `1` yields `false`. `petPolicyDefault = 2` refuses pets.

### 1.2 The 21 E-layer manifest parameters, and where each one goes

`ContextCreator.java:811–826` lists the parameter names written into the executed manifest. The
Phase-E block is exactly 21 names (`enableDecisionLayer` … `betaCapacityPrior`); `shelterPolicyVariant`
is listed after it and belongs to the shelter loader, and the Scenario-E block (`smokeSeriesCode` …
`closureDraw`) follows that.

| # | Manifest parameter | Destination |
|---|---|---|
| 1 | `enableDecisionLayer` | master switch (`ContextCreator.java:778`); nothing else |
| 2 | `pAwareInit` | `ELayerSampler` ctor arg `pAware` |
| 3 | `pHeavyBelongings` | `ELayerSampler` ctor arg `pHeavy` |
| 4 | `pHasPet` | `ELayerSampler` ctor arg `pPet` |
| 5 | `pHasDependents` | `ELayerSampler` ctor arg `pDependents` |
| 6 | `groupSpeedDeltaMps` | `ELayerSampler` ctor arg `groupSpeedDeltaMps` |
| 7 | `lambdaOutreachPerDay` | `DecisionConfig.lambdaOutreachPerDay` |
| 8 | `informationRegime` | `DecisionConfig.informationRegime` |
| 9 | `enableHazardDeparture` | `DecisionConfig.enableHazardDeparture` |
| 10 | `sigmaTheta` | `DecisionConfig.sigmaTheta` |
| 11 | `alphaHazard` | `DecisionConfig.alphaHazard` |
| 12 | `bRisk` | `DecisionConfig.bRisk` |
| 13 | `wOfficial` | `DecisionConfig.wOfficial` |
| 14 | `gammaVuln` | `DecisionConfig.gammaVuln` |
| 15 | `riskHalfLifeH` | `DecisionConfig.riskHalfLifeH` |
| 16 | `barrierBelongings` | `DecisionConfig.barrierBelongings` |
| 17 | `barrierPet` | `DecisionConfig.barrierPet` |
| 18 | `barrierDependents` | `DecisionConfig.barrierDependents` |
| 19 | `petPolicyDefault` | `DecisionConfig.petPolicyAdmitDefault` (`== 1`) |
| 20 | `betaTravelTime` | `DecisionConfig.betaTravelTime` |
| 21 | `betaCapacityPrior` | `DecisionConfig.betaCapacityPrior` |

So **15 of the 21** land in `DecisionConfig`; five feed the sampler, one is the switch. The
remaining four `DecisionConfig` fields (16–19) come from the **Scenario-E** parameter block
(`ContextCreator.java:315–321`), which is why `DecisionConfig` has 19 fields and the Phase-E
manifest block has 21 names. Do not try to make those two numbers agree.

### 1.3 Verified against an archived batch file

`Geography/batch/batch_params_2026_ER_A_seed42.xml` (the baseline-real arm-A run) carries exactly
the ER column above. Two things in it are load-bearing:

- `<parameter name="alphaHazard" type="constant" constant_type="double" value="-8.0"/>` — note
  `constant_type="double"`, **not** `"number"`. Repast's batch reader zeroes negative `"number"`
  constants (never-regress gotcha 4). A port that regenerates batch files must promote negatives.
- `<parameter name="lambdaOutreachPerDay" ... value="0.0"/>` — **outreach is switched off in the
  archived baseline-real arms.** The 64.4% of residents sampled `awareInitial == false` therefore
  remain `UNAWARE` for the whole run, accruing exposure, never departing. That is not a bug; it is
  the configuration, and it is a large share of the ER effect. Do not "helpfully" default it on.

---

## 2. Build-time wiring: `setDecisionLayer`

`ContextCreator.java:772–804`, step 11, runs **after** the placement loop completes:

```java
ELayerSampler eSampler = null;
if (enableDecisionLayer == 1) {
    eSampler = new ELayerSampler(seed, pAwareInit, pHeavyBelongings,
            pHasPet, pHasDependents, groupSpeedDeltaMps);
    GisAgent.DecisionConfig decisionConfig = new GisAgent.DecisionConfig(
            informationRegime, enableHazardDeparture, alphaHazard, bRisk,
            wOfficial, gammaVuln, sigmaTheta, riskHalfLifeH,
            lambdaOutreachPerDay, barrierBelongings, barrierPet,
            barrierDependents, petPolicyDefault == 1,
            betaTravelTime, betaCapacityPrior,
            pushThetaThreshold, kPush, pStuck, stuckDelayH);
    for (GisAgent resident : createdResidents) {
        resident.setDecisionLayer(decisionConfig, eSampler.sample());
    }
}
```

`createdResidents` is in **creation order**, which is also the `ELayerSampler` call order and the
`index` used for the decision seed. WP6 already ports this loop (`websim/engine/src/world/build.ts`
step 11, lines 449–464) and it is Tier-1 gated; WP8 does not touch it.

`setDecisionLayer` itself (`GisAgent.java:934–959`):

```java
public void setDecisionLayer(DecisionConfig config, ELayerSampler.DecisionAttributes da) {
    this.decisionConfig = config;
    this.decisionAttributes = da;
    this.decisionRng = new java.util.Random(da.decisionSeed);
    this.thetaScaled = config.sigmaTheta * da.thetaZ;
    double c = 0.0;
    if (da.heavyBelongings) c += config.barrierBelongings;
    if (da.hasPet && !config.petPolicyAdmitDefault) c += config.barrierPet;
    if (da.hasDependents) c += config.barrierDependents;
    this.barrierCost = c;
    this.believedFull = new java.util.HashSet<String>();
    if (da.awareInitial) {
        this.awareTick = 0.0;      // aware from the start; state stays PRE_EVAC
    } else {
        this.state = State.UNAWARE;
        this.awareTick = Double.NaN;
    }
}
```

Five things this establishes, all mandatory:

1. **`decisionRng` is per agent, constructed once, at build.** It is `new java.util.Random(long)`
   over `da.decisionSeed = runSeed * 2654435761L + index * 104729L`
   (`ELayerSampler.java:170`), wrapped at 64 signed bits. `websim/engine/src/rng/streams.ts:50`
   already exposes `agentDecisionSeed(runSeed, index)` and
   `StreamRegistry.agentStream(index)` (`streams.ts:111`). The stream must **persist across ticks**;
   re-creating it per tick would restart the sequence and is the single easiest way to produce a
   plausible-but-wrong port.
2. **`thetaScaled = sigmaTheta * thetaZ`, precomputed.** `thetaZ` is the raw standard normal from
   the sampler and is *never* scaled anywhere else.
3. **`barrierCost` accumulation order is belongings → pet → dependents.** Floating-point addition
   is not associative; keep the order.
4. **The pet term is keyed to the world default, not to any site.** `da.hasPet &&
   !config.petPolicyAdmitDefault`. Per-site policy is discovered at the door and never enters
   `barrierCost`. (Rationale in the Javadoc at `:929–932`: the departure-suppressing burden is
   *anticipating* refusal.)
5. **`believedFull` is allocated in BOTH regimes**, L0 included (`:952` and the comment at
   `:944–951`). Under L0 it records *policy* refusals only; without it a pet owner re-selects the
   same refusing door forever, because the omniscient chooser filters on live capacity but nothing
   filters on intake policy.

Also: an initially-unaware resident's `state` is set to `UNAWARE` **at build**, before tick 1.

### 2.1 `ELayerSampler.DecisionAttributes` (the E-layer attributes each agent carries)

`ELayerSampler.java:86–115`, all `public final`, immutable:

| Field | Type | Meaning | Source of value |
|---|---|---|---|
| `awareInitial` | `boolean` | knows shelters exist at t0 (V29) | draw ① `< pAware` |
| `heavyBelongings` | `boolean` | heavy belongings / cart (V31) | draw ② `< pHeavy` |
| `hasPet` | `boolean` | travels with a pet (V32) | draw ③ `< pPet` |
| `hasDependents` | `boolean` | travels with dependent children (V33) | draw ④ `< pDependents` |
| `thetaZ` | `double` | **raw** standard normal trait (V35) | draw ⑤ `nextGaussian()` |
| `groupSpeedDeltaMps` | `double` | `hasDependents ? param : 0.0` (V34) | derived, no draw |
| `decisionSeed` | `long` | private stream seed | derived, no draw |

All five draws are **unconditional and in that fixed order** (`ELayerSampler.java:164–168`). Ported
and gated in WP6 at `websim/engine/src/agents/eLayerSampler.ts:116–145`.

Note `heavyBelongings` is a **barrier cost only** — never a walking-speed penalty
(`ELayerSampler.java:52–55`: load carriage does not slow self-selected walking, Bastien 2005). A
port that reduces speed for it is inventing physics the model deliberately rejected.

---

## 3. `step()` — the complete evaluation order

`GisAgent.java:304–593`, `@ScheduledMethod(start = 1, interval = 1)`. **The first tick is 1.**
The 13 blocks below are PORT_MAP §1.5's numbering and WP7's block comments in `step.ts`.

```
 1. context / geography lookup                                   :306–307
 2. per-tick parameter reads                                     :309–316
 3. group pace (V34)                                             :320–324
 4. clock: tick, dtHours                                         :325–326
 5. EXPOSURE — every non-SHELTERED state                         :332–359
 6. DEPARTURE — UNAWARE / PRE_EVAC only                          :365–448
      6a. cNow (second smoke lookup this tick)                   :366–367
      6b. [layer] hour bucket + newHour                          :371–372
      6c. [layer] z_R decay + increment (no RNG)                 :373–380
      6d. [layer] UNAWARE → outreach draw → maybe PRE_EVAC       :384–393
      6e. [layer] hazard branch (enableHazardDeparture == 1)     :395–421
      6f. [layer] hazard-off branch = legacy latch inline        :422–432
      6g. [no layer] legacy latch                                :433–447
 7. REFUSED_ALL_FULL re-entry, re-checked EVERY tick             :459–478
 8. if (state != EN_ROUTE) return                                :480–482
 9. stuck check                                                  :488–494
10. closure-wave reaction                                        :495–504
11. planning (routePath == null)                                 :507–520
12. movement                                                     :522–543
13. arrival at the door                                          :545–592
```

### 3.1 Block 2 — parameter reads

```java
double minutesPerTick = (Double) params.getValue("minutesPerTick");
double walkingSpeedMps = (attributes != null)
        ? attributes.walkingSpeedMps
        : (Double) params.getValue("walkingSpeedMps");
```

`(Double)` is a hard cast; `minutesPerTick` and `walkingSpeedMps` must be `number`-typed batch
parameters. The port hoists these to `StepWorld` (they cannot change during a run) — a hoist WP7
already documents at `step.ts:35–44` and which WP8 keeps.

### 3.2 Block 3 — group pace (V34)

```java
// GisAgent.java:320–324
if (decisionConfig != null && decisionAttributes != null
        && decisionAttributes.groupSpeedDeltaMps > 0.0) {
    walkingSpeedMps = Math.max(0.40,
            walkingSpeedMps - decisionAttributes.groupSpeedDeltaMps);
}
```

**There is no second agent.** Read that carefully, because "group pace" invites a wrong port. The
model does not create a household, does not synchronise two agents, and does not search for
companions. A resident with `hasDependents == true` carries a *scalar* speed decrement
(`groupSpeedDeltaMps`, the `groupSpeedDeltaMps` parameter, sourced midpoint 0.06 m/s from
Moussaid et al. 2010 for **one** extra member), and the pace of the "group" is set by that one
resident and nothing else. The rationale is in `ELayerSampler.java:75–83`: household size beyond
the adult is unrecorded, so one extra member is the least-assuming option.

Mechanics that matter:

- The reduction is **derived, never stored**: `attributes.walkingSpeedMps` is not mutated
  (`ELayerSampler.java:81–82` says so explicitly). It is recomputed from the sample every tick.
- It is therefore **not cumulative** across ticks.
- The floor is `Math.max(0.40, …)`. 0.40 is the V27 truncated-normal lower bound, so a
  group-paced resident can never be slower than the slowest sampled individual.
- The guard is `> 0.0` strictly. With `groupSpeedDeltaMps = 0.0` (the E0 null, and the fallback)
  the whole block is skipped and `Math.max` never runs — which matters, because `Math.max(0.40, v)`
  with `v < 0.40` would otherwise *raise* the speed of a slow walker. Since the sampler bounds
  speed at `[0.40, 2.20]` this cannot bite today, but the guard is what makes that true.
- The adjusted speed is what feeds **both** the movement step length (`:526`) **and**
  `chooseShelterByUtility`'s `ownSpeedMps` (`:509`). It does **not** feed
  `chooseNetworkNearestShelter`, which is distance-only.

### 3.3 Block 5 — exposure (unchanged from WP7, restated because block 6 depends on it)

`GisAgent.java:332–359`. Runs for **every** state except `SHELTERED` — including `UNAWARE`. The
resident that departs this tick has already been booked at RESTING ventilation; the resident that
arrives this tick has already been booked at WALKING ventilation. Ported at `step.ts:124–147`.

The only decision-layer coupling is `stuckNow`:

```java
boolean stuckNow = !Double.isNaN(stuckUntilTick) && tick < stuckUntilTick;
double ventilationM3h = (state == State.EN_ROUTE && !stuckNow)
        ? INHALATION_WALKING_M3H : INHALATION_RESTING_M3H;
```

A stuck pusher is `EN_ROUTE` (so `exposureWhileTravelingUgM3h` still accrues, `:349–351`) but
breathes at rest. `step.ts:131–133` already implements this against the inert `stuckUntilTick`.

### 3.4 Block 6 — the departure block, in full

```java
// GisAgent.java:365–448
if (state == State.UNAWARE || state == State.PRE_EVAC) {
    double cNow = (smokeField == null) ? 0.0
            : smokeField.concentrationForTick(tick, minutesPerTick);

    if (decisionConfig != null && decisionAttributes != null) {
        int hour = (int) Math.floor(tick * minutesPerTick / 60.0);
        boolean newHour = hour > lastDecisionHour;
        if (newHour) {
            lastDecisionHour = hour;
            double decay = Math.pow(2.0, -1.0 / decisionConfig.riskHalfLifeH);
            zR = zR * decay + (cNow >= UNHEALTHY_UGM3 ? 1.0 / 24.0 : 0.0);
        }

        if (state == State.UNAWARE) {
            if (newHour && decisionConfig.lambdaOutreachPerDay > 0.0
                    && decisionRng.nextDouble() < decisionConfig.lambdaOutreachPerDay / 24.0) {
                state = State.PRE_EVAC;   // now aware (spec: AWARE_IDLE)
                awareTick = tick;
            }
            if (state == State.UNAWARE) {
                return; // still unaware; exposure already accrued above
            }
        }

        if (decisionConfig.enableHazardDeparture == 1) {
            if (newHour) {
                boolean open = anyShelterOpen(context, tick);
                boolean vulnerable = attributes != null
                        && (attributes.copd || attributes.asthma
                                || attributes.ageYears >= 65 || attributes.mobilityLimited);
                double bRiskEff = decisionConfig.bRisk
                        * (1.0 + (vulnerable ? decisionConfig.gammaVuln : 0.0));
                double u = decisionConfig.alphaHazard + bRiskEff * zR
                        + decisionConfig.wOfficial * (open ? 1.0 : 0.0)
                        + thetaScaled - barrierCost;
                double p = 1.0 / (1.0 + Math.exp(-u));
                if (open && decisionRng.nextDouble() < p) {
                    state = State.EN_ROUTE;
                    evacuationTick = tick;
                }
            }
            if (state != State.EN_ROUTE) {
                return; // waiting; exposure already accrued above
            }
        } else {
            double evacThreshold = (Double) params.getValue("evacuationThresholdUgM3");
            if (cNow >= evacThreshold && anyShelterOpen(context, tick)) {
                state = State.EN_ROUTE;
                evacuationTick = tick;
            } else {
                return;
            }
        }
    } else {
        double evacThreshold = (Double) params.getValue("evacuationThresholdUgM3");
        if (cNow >= evacThreshold && anyShelterOpen(context, tick)) {
            state = State.EN_ROUTE;
            evacuationTick = tick;
        } else {
            return; // still waiting outdoors; exposure already accrued above
        }
    }
}
```

Everything about this block is covered in §4–§6 and §11.

### 3.5 Block 7 — REFUSED_ALL_FULL re-entry, with the L1 fork

```java
// GisAgent.java:459–478
if (state == State.REFUSED_ALL_FULL) {
    boolean somewhereToTry = useL1()
            ? anyUntriedReachableShelter(context, tick)
            : anyShelterAvailable(context, tick);
    if (!somewhereToTry) {
        return;
    }
    state = State.EN_ROUTE;
    retargetCount = 0;
    targetShelter = null;
    routePath = null;
    routeNodes = null;
    pathIndex = 0;
}
```

`routeNodes = null` is the one line WP7's port at `step.ts:164–173` is missing (it has no
`routeNodes` field yet). Note `retargetCount = 0` — the L0 cap of 8 is **per episode**, not per run.

### 3.6 Blocks 9–10 — stuck and closure reaction

```java
// GisAgent.java:488–504
if (!Double.isNaN(stuckUntilTick)) {
    if (tick < stuckUntilTick) {
        return;                      // stuck: outdoors, resting, accruing
    }
    stuckUntilTick = Double.NaN;     // delay served; resume the PUSHED path
}
if (routePath != null && routeNodes != null
        && network.getClosureVersion() != seenClosureVersion) {
    reactToClosureWave(tick, minutesPerTick);
    if (!Double.isNaN(stuckUntilTick)) {
        return;                      // pushed through and got stuck right here
    }
}
```

Note the delay-served path keeps the **stale** path — the resident walks through the closed street.
Note also that `routeNodes` is `null` unless `network.hasClosureSchedule()`
(`:644–645`, `:735–736`), so the reaction block is unreachable in every run without closures even
if the version counter somehow moved.

### 3.7 Block 11 — planning, with the L1 fork

```java
// GisAgent.java:507–520
if (routePath == null) {
    if (useL1()) {
        chooseShelterByUtility(context, tick, walkingSpeedMps);
    } else {
        chooseNetworkNearestShelter(context, tick);
    }
    if (routePath == null) {
        return;   // the chooser set UNREACHABLE or REFUSED_ALL_FULL
    }
    Point here = (Point) geography.getGeometry(this);
    snapGapM += StreetNetwork.geodesicDistanceM(here.getCoordinate(), routePath.get(0));
}
```

`walkingSpeedMps` here is the **group-pace-adjusted** value from block 3.

### 3.8 Block 13 — the door, with the policy gate

```java
// GisAgent.java:545–592
if (pathIndex >= routePath.size()) {
    boolean policyRefused = decisionConfig != null && decisionAttributes != null
            && ((decisionAttributes.hasPet && !petAdmittedAt(targetShelter))
                    || (decisionAttributes.hasDependents && targetShelter.isAdultsOnly()));
    if (!policyRefused && targetShelter.isOpenAt(tick)
            && targetShelter.admit(isPriorityForAdmission())) {
        state = State.SHELTERED;
        arrivalTick = tick;
    } else {
        if (policyRefused) {
            targetShelter.recordPolicyRefusal();
        }
        if (useL1()) {
            believedFull.add(targetShelter.getId());
        } else if (policyRefused) {
            believedFull.add(targetShelter.getId());
        }
        currentNodeId = targetShelter.getGraphNodeId();
        targetShelter = null;
        routePath = null;
        routeNodes = null;
        pathIndex = 0;
        retargetCount++;
        if (!useL1() && retargetCount > MAX_RETARGETS) {
            state = State.REFUSED_ALL_FULL;
        }
    }
}
```

Four separate side-effect asymmetries live in these 45 lines and each one moves a published number:

- **`&&` short-circuits.** A closed door never reaches `admit()`, so a closed-door arrival
  increments **no** counter. A capacity refusal increments `refusedCount` (inside `admit`,
  `Shelter.java:106–109`). A policy refusal increments `refusedCount` **and**
  `policyRefusedCount` (`Shelter.java:175–178`) — and *does not* call `admit()` at all, so it does
  not consume a bed check. `websim/engine/src/shelters/admit.ts:69–84` already encodes this.
- **`recordPolicyRefusal()` fires before the belief update.**
- **Belief update is regime-dependent**: L1 records every refusal; L0 records only policy refusals.
  A capacity refusal under L0 is *not* remembered (the omniscient chooser will see the shelter is
  full next tick anyway).
- **`retargetCount++` fires for every refusal**, policy / closed / capacity alike, in both regimes.
  Only the *cap* is L0-only.

---

## 4. Hazard departure (V36–V40)

### 4.1 The hour bucket

```java
int hour = (int) Math.floor(tick * minutesPerTick / 60.0);
boolean newHour = hour > lastDecisionHour;
```

`lastDecisionHour` is an `int` initialised to `-1` (`GisAgent.java:257`), so hour 0 is a new hour.

This is **bit-identically the same expression** `SmokeField.concentrationForTick` uses for its hour
index (`SmokeField.java:140`: `int hourIndex = (int) Math.floor((tick * minutesPerTick) / 60.0);`).
That is not a coincidence and the port must keep them in step: the concentration `cNow` that feeds
`z_R` on a new hour is *that hour's* concentration, sampled on the hour's first tick.

At `minutesPerTick = 1.0` (every archived run) the new-hour ticks are **1, 60, 120, 180, …** —
hour 0 is evaluated at tick 1, hour *h ≥ 1* at tick `60h`.

`lastDecisionHour` only advances while the resident is `UNAWARE` or `PRE_EVAC`. Once `EN_ROUTE` the
whole block is skipped forever (there is no transition back into `PRE_EVAC`), so `z_R` and
`lastDecisionHour` freeze at their departure-time values.

### 4.2 The risk accumulator `z_R` (V36)

```java
double decay = Math.pow(2.0, -1.0 / decisionConfig.riskHalfLifeH);
zR = zR * decay + (cNow >= UNHEALTHY_UGM3 ? 1.0 / 24.0 : 0.0);
```

- `z_R` is in **cumulative unhealthy-exposure DAYS**, hence the `1.0/24.0` increment per unhealthy
  hour. It is *not* a PM2.5 integral. (Sourced form, Castillo; `GisAgent.java:251–253`.)
- Half-life decay: `2^(-1/riskHalfLifeH)`, one application per new hour. At the default
  `riskHalfLifeH = 48.0` this is `0.9856...` per hour.
- The threshold is **`>=` 55.5**, inclusive — the mirror image of the strict `>` used for
  `hoursAboveUnhealthy` in block 5. Both read `UNHEALTHY_UGM3`. `stateMachine.ts:113–120` already
  exposes both predicates (`countsAsAboveUnhealthy` strict, `riskCueFires` inclusive) precisely so
  the pair cannot be "harmonised" by accident.
- **No RNG is consumed.** This is what lets the E0 null stay byte-identical while still executing
  the block.
- `zR` accrues while `UNAWARE` too — the accumulator is a physiological cue, not an informed one.
- `decay` is recomputed every hour for every agent. Caching it per run is numerically identical
  (same inputs, deterministic `pow`) and is permitted; caching it *per agent* is also identical.
  Nothing else may be reassociated.

### 4.3 The log-odds `u` and the draw

```java
boolean open = anyShelterOpen(context, tick);
boolean vulnerable = attributes != null
        && (attributes.copd || attributes.asthma
                || attributes.ageYears >= 65 || attributes.mobilityLimited);
double bRiskEff = decisionConfig.bRisk
        * (1.0 + (vulnerable ? decisionConfig.gammaVuln : 0.0));
double u = decisionConfig.alphaHazard + bRiskEff * zR
        + decisionConfig.wOfficial * (open ? 1.0 : 0.0)
        + thetaScaled - barrierCost;
double p = 1.0 / (1.0 + Math.exp(-u));
if (open && decisionRng.nextDouble() < p) {
    state = State.EN_ROUTE;
    evacuationTick = tick;
}
```

Term by term:

| Term | Value | Notes |
|---|---|---|
| `alphaHazard` | intercept, default `-8.0` | A-30 provisional |
| `bRiskEff * zR` | `bRisk * (1 + γ·1{vulnerable})` × accumulator | `bRiskEff` is computed **first**, then multiplied by `zR` |
| `wOfficial * (open?1:0)` | official-cue indicator | the *same* `open` that gates the draw |
| `+ thetaScaled` | `sigmaTheta * thetaZ`, precomputed | persistent trait, constant over the run |
| `- barrierCost` | `c_i`, precomputed | Wachinger constraint: a high-barrier resident may never depart even at peak PM2.5 |

Evaluation order is **strictly left to right**:
`((((alpha + bRiskEff*zR) + wOfficial*openInd) + thetaScaled) - barrierCost)`. Do not reassociate,
do not factor, do not fold `- barrierCost` into `alpha`.

**The `vulnerable` predicate here is NOT the reporting `isVulnerable`.** Hazard vulnerability is
`copd || asthma || ageYears >= 65 || mobilityLimited` (four terms, age **65**). The D-3 reporting
stratum in `output/logger.ts:268–270` is
`ageYears >= 55 || mobilityLimited || asthma || copd || chronicPhysical` (five terms, age **55**).
They are different sets and the port must keep two separate predicates. See QUIRK 9.

`vulnerable` is `false` for every resident when heterogeneity is off (`attributes == null`), so
`gammaVuln` is inert without `enableHeterogeneity = 1`.

**The draw is gated by `open` with short-circuit `&&`.** When no shelter is open the resident
consumes **no draw at all** — `p` is computed and thrown away. This is the single most fragile
line in the hazard mechanism: an implementation that draws first and tests `open` afterwards
produces a different, entirely plausible-looking population. See QUIRK 1.

`p` is the logistic `1/(1+e^{-u})`. With `u` very negative, `exp(-u)` overflows to `+Infinity` and
`p` evaluates to `0.0` — `nextDouble() < 0.0` is always false, no departure, and no NaN. With `u`
very positive, `exp(-u)` underflows to `0.0` and `p == 1.0`; `nextDouble()` returns `[0,1)` so the
comparison is always true. Both limits behave identically in Java and JS.

### 4.4 The "still waiting" return

```java
if (state != State.EN_ROUTE) {
    return; // waiting; exposure already accrued above
}
```

Placed **outside** `if (newHour)`, so on the 59 non-hour ticks of each hour a `PRE_EVAC` resident
under hazard departure does exactly one thing: accrue exposure, and return. It never plans, never
moves, never consumes RNG.

Conversely, on the tick the hazard fires the resident falls straight through to blocks 7–13 and
**plans and walks in the same tick**. Departure is not deferred to the next tick.

---

## 5. The information regime, outreach, and what `UNAWARE` may do

### 5.1 `awareTick`

- `awareInitial == true` → `awareTick = 0.0`, state stays `PRE_EVAC` (`:953–955`).
- `awareInitial == false` → `awareTick = NaN`, state becomes `UNAWARE` at build (`:956–957`).
- outreach conversion → `awareTick = tick` (the double tick, on an hour boundary), state becomes
  `PRE_EVAC` (`:387–388`).
- never converted → `awareTick` stays `NaN`, exported as an **empty cell**
  (`output/logger.ts:316`: `Number.isNaN(a.awareTick) ? "" : longCast(a.awareTick)`).

Note the deliberate state-vocabulary decision at `GisAgent.java:92–99`: the E-layer spec's
`AWARE_IDLE` is represented by `PRE_EVAC`, and `ARRIVED_FULL` by the existing refusal-at-door
mechanic. **`UNAWARE` is the only new enum value** and it appears in output only when
`pAwareInit < 1`. Do not add enum values.

### 5.2 Outreach (V41)

```java
if (state == State.UNAWARE) {
    if (newHour && decisionConfig.lambdaOutreachPerDay > 0.0
            && decisionRng.nextDouble() < decisionConfig.lambdaOutreachPerDay / 24.0) {
        state = State.PRE_EVAC;
        awareTick = tick;
    }
    if (state == State.UNAWARE) {
        return;
    }
}
```

- Rate is **per day**, converted by dividing by `24.0` at the use site. Write
  `lambda / 24.0`, not `lambda * (1.0/24.0)` — see QUIRK 4.
- **Triple short-circuit**: no draw unless `newHour` *and* `lambda > 0.0`. With `lambda == 0.0`
  (the fallback, the E0 null, **and every archived ER/SE arm**) the outreach mechanism consumes
  zero draws for the entire run.
- Conversion is a **memoryless hourly Bernoulli** — there is no contact list, no spatial outreach
  team, no dependence on other agents or on shelters.
- The check `if (state == State.UNAWARE) return;` is a *re-test*, not an `else`. A resident that
  converted on this tick **falls through into the hazard/latch branch in the same tick** and can
  depart immediately (same `newHour`, so the hazard draw is live). That is a genuine two-draw tick.

### 5.3 What an `UNAWARE` resident may and may not do

**May / does:**
- accrue exposure, dose, air volume, peak, `outdoorHours`, `hoursAboveUnhealthy` (block 5 runs —
  the guard is `state != SHELTERED`, `:332`), at **resting** ventilation (`state != EN_ROUTE`);
- perform the **second smoke lookup** at `:366–367`, which increments `outOfRangeLookups` a second
  time on any out-of-range tick, exactly as a `PRE_EVAC` resident does;
- advance `lastDecisionHour` and accumulate `z_R` (so an unaware resident arrives at awareness with
  a fully-formed risk cue);
- consume one outreach draw per hour, when `lambda > 0`.

**May not:**
- depart (the `return` at `:391` is before every departure branch);
- plan a route, move, arrive, be admitted, be refused, or be counted in any shelter statistic;
- reach `REFUSED_ALL_FULL` or `UNREACHABLE`;
- be affected by `informationRegime` — awareness and the L0/L1 regime are orthogonal switches.

An `UNAWARE` resident at end of run exports `final_state = "UNAWARE"`, empty `awareTick`, and a full
run's worth of exposure. With `lambda = 0` and `pAwareInit = 0.356`, that is ~64% of the population.

### 5.4 `useL1()`

```java
// GisAgent.java:663–666
private boolean useL1() {
    return decisionConfig != null && decisionAttributes != null
            && decisionConfig.informationRegime == 1;
}
```

Strict `== 1`. `informationRegime = 2` is L0. Called in four places: block 7 (`:466`), block 11
(`:508`), and twice in block 13 (`:567`, `:588`). It is **not** consulted by the outreach or hazard
code — awareness and regime are independent.

---

## 6. Belief exclusion, and how it bounds L1

### 6.1 `excludedByBelief`

```java
// GisAgent.java:657–659
private boolean excludedByBelief(Shelter shelter) {
    return believedFull != null && believedFull.contains(shelter.getId());
}
```

Null-safe, so it is **always false with the layer off** — that is what keeps the legacy choosers
literally unchanged. Called from `chooseNetworkNearestShelter` (`:620`) and `anyShelterAvailable`
(`:905`).

`chooseShelterByUtility` (`:710`) and `anyUntriedReachableShelter` (`:859`) call
`believedFull.contains(...)` **directly, without the null guard**, because both are reachable only
under `useL1()`, and `useL1()` implies `setDecisionLayer` ran, which always allocates the set
(`:952`). Preserve that structure; do not "defensively" add a null check that changes nothing but
suggests the invariant is weaker than it is.

### 6.2 What goes into the set, and when

| Regime | Capacity refusal | Closed-door refusal | Policy refusal |
|---|---|---|---|
| legacy (layer off) | set is `null`, nothing recorded | — | impossible (`policyRefused` structurally false) |
| L0 (layer on, regime 0) | **not** recorded | **not** recorded | recorded |
| L1 (layer on, regime 1) | recorded | recorded | recorded |

(`GisAgent.java:567–576`. Under L1 the `if (useL1())` branch fires first and records
unconditionally, so the `else if (policyRefused)` is L0-only.)

### 6.3 Beliefs never expire — and why that is sound

`GisAgent.java:260–265`:

> Never cleared, and never wrong: occupancy is monotone (no departures are modelled) and policy is
> fixed, so a site once refused stays refused for this resident. New capacity only ever appears as a
> NEWLY OPENED site, which by construction is not yet in the set.

### 6.4 The termination bound: belief set vs retry cap

This is the asymmetry a port must not smooth over.

- **L0 / legacy**: bounded by `retargetCount > MAX_RETARGETS` (`MAX_RETARGETS = 8`,
  `GisAgent.java:226`), applied at `:588`. The counter is **per episode** — `:474` resets it to 0
  on every `REFUSED_ALL_FULL` → `EN_ROUTE` re-entry.
- **L1**: **no cap at all** (`!useL1() &&` at `:588`). The belief set is the bound: every refusal
  permanently removes one site from the candidate set, so an episode terminates after at most
  `|reachable open operating sites|` refusals, at which point `chooseShelterByUtility` finds
  `anyReachable == true` with no candidate and sets `REFUSED_ALL_FULL` (`:738–739`). Re-entry then
  requires `anyUntriedReachableShelter`, which is false, so the resident stays put until a new site
  opens.

The comment at `:586–587` gives the reason the cap is skipped under L1 rather than just raised:
"retries are belief-driven decisions, never counter-capped (U-16: closed-at-selection sites never
burned retries either)."

The L0 policy-refusal recording exists precisely to prevent an infinite cycle:
`EN_ROUTE → policy refusal → retarget → … → cap → REFUSED_ALL_FULL → re-entry resets counter →
repeat` (`:944–951`).

---

## 7. `chooseShelterByUtility` — the L1 destination choice (V43)

`GisAgent.java:693–743`. Constant: `UNCAPPED_CAPACITY_PRIOR = 10000.0` (`:679`).

```java
private void chooseShelterByUtility(Context context, double tick, double ownSpeedMps) {
    double bestV = Double.NEGATIVE_INFINITY;
    Shelter best = null;
    double bestDistM = Double.NaN;
    boolean anyReachable = false;

    for (Object obj : context.getObjects(Shelter.class)) {
        Shelter shelter = (Shelter) obj;
        if (!shelter.isOperating() || !shelter.isOpenAt(tick)
                || shelter.getRouteTree() == null) {
            continue;
        }
        double dM = shelter.getRouteTree().distanceTo(currentNodeId);
        if (Double.isInfinite(dM)) {
            continue;
        }
        anyReachable = true;
        if (believedFull.contains(shelter.getId())) {
            continue;
        }
        double cap = (shelter.getCapacity() == null)
                ? UNCAPPED_CAPACITY_PRIOR : shelter.getCapacity().doubleValue();
        double walkTimeH = dM / (ownSpeedMps * 3600.0);
        double v = -decisionConfig.betaTravelTime * walkTimeH
                + decisionConfig.betaCapacityPrior * Math.log(Math.max(1.0, cap));
        if (v > bestV || (v == bestV && best != null
                && shelter.getId().compareTo(best.getId()) < 0)) {
            bestV = v;
            best = shelter;
            bestDistM = dM;
        }
    }

    if (best != null) {
        targetShelter = best;
        if (Double.isNaN(networkDistToShelterM)) {
            networkDistToShelterM = bestDistM;   // V11, first selection only
        }
        plannedRouteM += bestDistM;
        routePath = network.pathToSource(best.getRouteTree(), currentNodeId);
        pathIndex = 0;
        routeNodes = network.hasClosureSchedule()
                ? network.nodesToSource(best.getRouteTree(), currentNodeId) : null;
        seenClosureVersion = network.getClosureVersion();
    } else if (anyReachable) {
        state = State.REFUSED_ALL_FULL;
    } else {
        state = State.UNREACHABLE;
    }
}
```

### 7.1 The filter, in exact order

1. `!shelter.isOperating()` → skip. (`Shelter.operating`, a CSV column; standby sites are off.)
2. `!shelter.isOpenAt(tick)` → skip. `isOpenAt` is `tick >= openTick && tick < closeTick`
   (`Shelter.java:147–149`) — inclusive left, **exclusive right**, over `double` ticks that are
   `±Infinity` when `respectShelterOpeningDates != 1`.
3. `shelter.getRouteTree() == null` → skip.
4. `Double.isInfinite(dM)` → skip. Unreachable on the street graph.
5. **`anyReachable = true` is set HERE**, after the reachability test and **before** the belief
   filter. This is what keeps `REFUSED_ALL_FULL` and `UNREACHABLE` distinguishable.
6. `believedFull.contains(id)` → skip.
7. **No `hasSpaceFor` filter.** Deliberate, and the whole point of L1: live occupancy is the
   omniscience L1 removes. Fullness is discovered at the door. (`:685–687`.)

### 7.2 The utility expression

```
cap_j      = capacity == null ? 10000.0 : (double) capacity
walkTimeH  = dM / (ownSpeedMps * 3600.0)
V_j        = -betaTravelTime * walkTimeH + betaCapacityPrior * ln(max(1.0, cap_j))
```

- `ownSpeedMps` is the **group-pace-adjusted** speed (block 3), not `attributes.walkingSpeedMps`.
- `dM` is the **routed network distance** from `currentNodeId` (`ShortestPathTree.distanceTo`),
  not the polyline length the resident will actually walk. (Those differ — see
  `websim/engine/src/agents/route.ts` module doc, "a leg is NOT as long as the route it follows".)
- `ownSpeedMps * 3600.0` is computed first, then the division. Not `dM / ownSpeedMps / 3600.0`.
- `-betaTravelTime * walkTimeH` is `(-betaTravelTime) * walkTimeH` by Java precedence (unary minus
  binds tighter than `*`). Numerically identical to `-(betaTravelTime * walkTimeH)` for finite
  values, but write it as Java does.
- `Math.max(1.0, cap)` floors the log argument at 1, so `ln` is never negative and never `-Infinity`
  for a zero-capacity site.
- With `betaCapacityPrior = 0.0` the second term is `0.0 * ln(...)` — which is `0.0` for any finite
  log, so this **exactly** reduces to nearest-reachable-by-time, i.e. the legacy geometry with
  ties broken differently (see 7.3). It does not reduce to `chooseNetworkNearestShelter`, because
  the space filter is gone and the tie-break differs.

### 7.3 Iteration order and tie-breaking — the part that differs from L0

The comparison is:

```java
if (v > bestV || (v == bestV && best != null && shelter.getId().compareTo(best.getId()) < 0))
```

Worked through, this running comparison computes **the lexicographically smallest `id` among the
argmax set**, and is therefore **independent of iteration order** — unlike
`chooseNetworkNearestShelter`, whose strict `<` makes iteration order the tie-break. That
difference is deliberate and is stated in the Javadoc at `:689–690`.

Three edge cases the expression encodes and a rewrite would lose:

- `best != null` guard: on the first candidate, if `v == Double.NEGATIVE_INFINITY` then
  `v > bestV` is false and `v == bestV` is true but `best` is null, so the candidate is **not
  selected**. If it is the only candidate, the resident becomes `REFUSED_ALL_FULL`
  (`anyReachable` was already true).
- `v == NaN`: both `>` and `==` are false in Java **and in JS**, so a NaN-utility site is never
  selected — but `anyReachable` was already set, so the resident falls to `REFUSED_ALL_FULL`
  rather than `UNREACHABLE`. A transcription of the expression reproduces this for free; a
  "cleaner" `Math.max`-based rewrite does not.
- `String.compareTo(...) < 0` must be ported as JS `a < b` on the two id strings (both compare
  UTF-16 code units, sign-identical). **Never `localeCompare`.** See QUIRK 6.

### 7.4 On success / on failure

Success and failure blocks are **byte-identical to `chooseNetworkNearestShelter`'s**
(`:629–651` vs `:726–742`), including:

- `networkDistToShelterM` is written **once**, guarded by `Double.isNaN(...)` — V11 keeps its
  documented meaning ("the nearest shelter you can actually reach" from the START node) and is
  stale for retargeted residents *by design*.
- `plannedRouteM += bestDistM` on every selection, including re-plans.
- `routePath = network.pathToSource(tree, currentNodeId)`.
- `routeNodes` allocated **only** when `network.hasClosureSchedule()`.
- `seenClosureVersion = network.getClosureVersion()` — a freshly planned path is by construction
  already wave-aware.
- classification: `anyReachable ? REFUSED_ALL_FULL : UNREACHABLE`.

### 7.5 The L0 chooser, for contrast

`GisAgent.java:604–652`, unchanged from WP7 except that `excludedByBelief` is now live:

```java
anyReachable = true;
if (excludedByBelief(shelter)) {
    continue;   // already turned this resident away on policy (L0)
}
if (shelter.hasSpaceFor(isPriorityForAdmission()) && dM < bestDistM) {
    bestDistM = dM;
    best = shelter;
}
```

Strict `<` ⇒ **first-in-iteration-order wins an exact distance tie**. WP7 already holds the shelter
list in CSV load order for this reason (`step.ts:70–71`, `step.ts:255–259`). WP8 adds only the
`excludedByBelief` line at the position shown — after `anyReachable`, before the space test.

---

## 8. Pet policy

### 8.1 `petAdmittedAt`

```java
// GisAgent.java:670–674
private boolean petAdmittedAt(Shelter shelter) {
    Boolean policy = shelter.getPetIntake();
    return policy != null ? policy.booleanValue()
            : decisionConfig.petPolicyAdmitDefault;
}
```

`Shelter.petIntake` is a **tri-state `Boolean`** (`Shelter.java:75`): `TRUE` admit, `FALSE` refuse,
`null` unrecorded. Only `null` defers to the world default. `websim/engine/src/shelters/shelter.ts:62`
already models it as `boolean | null`, and `admit.ts:58` already writes
`shelter.petIntake ?? petPolicyAdmitDefault` — note `??`, not `||`, because `false` is a real value.

`petAdmittedAt` dereferences `decisionConfig` **without a null check**. It is called only from the
door gate, which is guarded by `decisionConfig != null && decisionAttributes != null`, and only when
`decisionAttributes.hasPet` is true (short-circuit `&&` at `:552`).

### 8.2 Where the policy is loaded

`ContextCreator.java:573–582`. The `pet_intake` and `adults_only` columns are **optional**; absent
from every archived shelter CSV:

```java
String petCol = r.get("pet_intake");
if (petCol != null && !petCol.trim().isEmpty()) {
    shelter.setPetIntake(Boolean.valueOf("admit".equalsIgnoreCase(petCol.trim())));
}
String adultsCol = r.get("adults_only");
if (adultsCol != null && !adultsCol.trim().isEmpty()) {
    String v = adultsCol.trim();
    shelter.setAdultsOnly("1".equals(v) || "true".equalsIgnoreCase(v)
            || "yes".equalsIgnoreCase(v));
}
```

Note the asymmetry: `pet_intake` is `true` **only** for the exact case-insensitive string `admit`
— any other non-empty value (including `"refuse"`, `"1"`, `"yes"`) yields `FALSE`, not `null`.
`adults_only` accepts three spellings, case-insensitively for two of them and case-**sensitively**
for `"1"`. Ported at `websim/engine/src/world/build.ts:306`ff.

### 8.3 The pet variant (`shelterPolicyVariant`)

`ContextCreator.java:296–302, 418–426`. `shelterPolicyVariant = 1` replaces the arm's shelter CSV
path `X.csv` with `X_elayer.csv` and **throws** if that file does not exist. The variant file
carries the recorded `pet_intake` joined from the upstream 2026 inventory (4 of 48 facilities record
`pets_allowed=1`, 422 beds). `shelterPolicyVariant = 0` reads the archived file untouched so
`data_version_tag` and the archived three-arm chain are unaffected. ER arms set it to `1`.

### 8.4 The two-place asymmetry that makes the pet mechanism work

- **`barrierCost`** uses the *world default only* (`:941`): `hasPet && !petPolicyAdmitDefault`. A
  pet owner in a world that refuses pets by default carries `barrierPet` in its departure log-odds,
  whether or not the specific site it would pick admits pets.
- **The door gate** uses the *site's own policy* (`:552`), falling back to the default.

So with `petPolicyDefault = 0` (ER) and `shelterPolicyVariant = 1`, a pet owner is *suppressed from
departing* by `barrierPet`, but if it does depart and happens to choose one of the four
pets-allowed facilities, it is admitted. That interaction is the mechanism, not an inconsistency.

---

## 9. Triage reserve and `isPriorityForAdmission`

```java
// GisAgent.java:882–884
private boolean isPriorityForAdmission() {
    return attributes != null && attributes.mobilityLimited;
}
```

**Mobility limitation and nothing else.** Not age, not asthma, not COPD — the Javadoc at `:866–881`
states why: those attributes carry no behavioural consequence in this model, so triaging on them
would be a claim the simulation cannot support. Mobility does: a slower walker reaches a door later
and is refused by someone who walked faster.

`isPriorityForAdmission()` is **entirely independent of the decision layer** — it reads
`PopulationSampler.Attributes`, not `DecisionAttributes`. It is `false` for every resident when
`enableHeterogeneity != 1`, which is one of the two reasons a reserve of 0 is inert.

Call sites: `chooseNetworkNearestShelter` (`:623`), `anyShelterAvailable` (`:903`), the door
(`:555`). **Not** `chooseShelterByUtility` — L1 does not consult capacity at all.

Reserve mechanics (`Shelter.java:125–141`, `ContextCreator.java:565–568`):

```java
public boolean hasSpaceFor(boolean isPriority) {
    if (capacity == null) {
        return true;                       // UNLIMITED, not zero
    }
    int usable = isPriority ? capacity : capacity - reservedForPriority;
    return occupancy < usable;
}
```

```java
if (capacity != null && triageReserveFraction > 0.0) {
    shelter.setReservedForPriority(
            (int) Math.floor(capacity.intValue() * triageReserveFraction));
}
```

- `(int) Math.floor(...)` — a **floor, not a round**. Rounding up would let a rule stated as
  "hold 10%" hold more than 10% at every odd-sized site.
- `capacity.intValue() * triageReserveFraction` is `int * double` → `double` (Java promotes), then
  floored, then narrowed. In TS this is plain float multiply + `Math.floor`, but the narrowing
  should go through `doubleToInt` from `mathx/truncCast.ts`.
- Applied only when `capacity != null && fraction > 0.0`, so at fraction 0 the reserve is 0 and
  `hasSpaceFor` is arithmetically the pre-arm-D expression.
- `setReservedForPriority` clamps into `[0, capacity]` and is a no-op for unlimited sites.
- Already ported at `websim/engine/src/shelters/shelter.ts:105–124` — WP8 changes nothing here.

Interaction with Phase E: a mobility-limited resident is *both* more likely to be `vulnerable` in
the hazard term (γ amplification) *and* priority at the door *and* subject to the `mobilityPenalty`
in the push rule. Three separate mechanisms read the same attribute; none of them is the others.

---

## 10. `anyShelterOpen` / `anyShelterAvailable` / `anyUntriedReachableShelter`

```java
// GisAgent.java:888–896  — STATIC. No resident state at all.
private static boolean anyShelterOpen(Context context, double tick) {
    for (Object obj : context.getObjects(Shelter.class)) {
        Shelter shelter = (Shelter) obj;
        if (shelter.isOperating() && shelter.isOpenAt(tick)) {
            return true;
        }
    }
    return false;
}
```

```java
// GisAgent.java:900–910
private boolean anyShelterAvailable(Context context, double tick) {
    for (Object obj : context.getObjects(Shelter.class)) {
        Shelter shelter = (Shelter) obj;
        if (shelter.isAvailableAt(tick, isPriorityForAdmission()) && shelter.getRouteTree() != null
                && !Double.isInfinite(shelter.getRouteTree().distanceTo(currentNodeId))
                && !excludedByBelief(shelter)) {
            return true;
        }
    }
    return false;
}
```

```java
// GisAgent.java:853–864
private boolean anyUntriedReachableShelter(Context context, double tick) {
    for (Object obj : context.getObjects(Shelter.class)) {
        Shelter shelter = (Shelter) obj;
        if (shelter.isOperating() && shelter.isOpenAt(tick)
                && shelter.getRouteTree() != null
                && !Double.isInfinite(shelter.getRouteTree().distanceTo(currentNodeId))
                && !believedFull.contains(shelter.getId())) {
            return true;
        }
    }
    return false;
}
```

| Predicate | operating | open | tree≠null | reachable | has space | belief | Called from |
|---|---|---|---|---|---|---|---|
| `anyShelterOpen` | ✔ | ✔ | — | — | — | — | latch `:426`, `:441`; hazard gate `:404` |
| `anyShelterAvailable` | ✔ (via `isAvailableAt`) | ✔ | ✔ | ✔ | ✔ (priority-aware) | ✔ `excludedByBelief` | `REFUSED_ALL_FULL` re-entry, **L0/legacy only** `:468` |
| `anyUntriedReachableShelter` | ✔ | ✔ | ✔ | ✔ | ✗ **deliberately** | ✔ `believedFull` | `REFUSED_ALL_FULL` re-entry, **L1 only** `:467` |

`isAvailableAt(tick, isPriority)` is `operating && isOpenAt(tick) && hasSpaceFor(isPriority)`
(`Shelter.java:159–161`).

**`anyShelterOpen` is static and resident-independent** — so the port may (and WP7 does) cache it
per tick (`sim.ts:168–181`). The other two are resident-dependent through `currentNodeId`,
`isPriorityForAdmission()` and the belief set; WP7's cache
(`sim.ts:183–208`) prefilters only the resident-independent conjuncts and invalidates on **every
admission** (`sim.ts:210–212`). WP8's `anyUntriedReachableShelter` must use the **same
invalidation discipline** but a **different candidate list** — it must not filter on
`hasSpaceFor`. Reusing `availAny`/`availPriority` would silently reintroduce the omniscience L1
removes. Build a third list (operating ∧ open ∧ tree≠null) that does not need the admission epoch
at all, since none of its conjuncts change on admission.

---

## 11. The evacuation-threshold branch, and how it interacts with hazard departure

There are **three textually distinct latch sites** in `step()`, and they are not interchangeable:

| Site | Lines | Reached when |
|---|---|---|
| A | `:425–431` | layer ON, `enableHazardDeparture == 0` |
| B | `:440–446` | layer OFF (`decisionConfig == null`) |
| — | `:395–421` | layer ON, `enableHazardDeparture == 1` — the hazard, **replaces** the latch |

Sites A and B are byte-identical statement sequences:

```java
double evacThreshold = (Double) params.getValue("evacuationThresholdUgM3");
if (cNow >= evacThreshold && anyShelterOpen(context, tick)) {
    state = State.EN_ROUTE;
    evacuationTick = tick;
} else {
    return;
}
```

Facts a port must preserve:

1. **The latch and the hazard are mutually exclusive.** `enableHazardDeparture` selects one; there
   is no configuration in which both can fire. The hazard is the *replacement* for the latch, not
   an addition to it.
2. **`>=`, not `>`.** The latch fires at exactly 55.5. `hoursAboveUnhealthy` in block 5 uses strict
   `>` on the same constant. Both are deliberate (`stateMachine.ts:25–31`).
3. **The latch is evaluated every tick**; the hazard only on the first tick of each hour. This is
   the single largest behavioural difference between the two departure models and it changes every
   departure tick in the run.
4. **Both require `anyShelterOpen`** (A-02: nobody walks to a door that does not exist). The
   hazard carries the same requirement in two places — `wOfficial * (open ? 1 : 0)` lowers the odds
   before opening, *and* `open &&` hard-gates the draw. The gate is not redundant with the term:
   `wOfficial` shifts the probability, `open &&` forbids the transition and suppresses the draw.
5. **`evacuationThresholdUgM3` is read only in the latch branches.** Under hazard departure it is
   never read at all — so a run with `enableHazardDeparture = 1` is completely insensitive to it,
   and the manifest must still report it (it is in `pNames`).
6. **`z_R` is still maintained under the latch** (site A). It costs no RNG and is never read. This
   is exactly what makes the E0 null byte-identical: the block executes, produces a number, and
   nothing consumes it.

---

## 12. `reactToClosureWave` — the push/stuck decision (V49–V51)

`GisAgent.java:778–841`. Reachable only when a closure schedule is active. Full port belongs to
WP8's Scenario-E half; it is specified here because it is the third RNG draw site and because it
reads three `DecisionConfig` fields.

### 12.1 Order of operations

```java
seenClosureVersion = network.getClosureVersion();     // FIRST STATEMENT — :779
List<Long> nodes = routeNodes.nodes;
int[] off = routeNodes.coordOffset;
int hit = -1;
for (int k = 0; k + 1 < nodes.size(); k++) {
    if (off[k] >= pathIndex
            && network.isBlocked(nodes.get(k).longValue(), nodes.get(k + 1).longValue())
            && (pushedBlockages == null || !pushedBlockages.contains(
                    pairKey(nodes.get(k).longValue(), nodes.get(k + 1).longValue())))) {
        hit = k;
        break;
    }
}
if (hit < 0) {
    return;   // remaining route untouched by this wave (or already pushed)
}
blockagesEncountered++;
```

- **`seenClosureVersion` is consumed unconditionally, before the scan.** A no-hit scan still burns
  the wave: max one scan per wave per agent.
- **`off[k] >= pathIndex` is the grandfathering rule.** Edge `(k, k+1)` is "ahead" iff the walker
  has not yet reached node `k`'s coordinate. Closures block **entry** to a street; a walker already
  on it, including one caught mid-street, walks out.
- `pushedBlockages` is checked so a later wave never re-litigates an edge this resident already
  gambled on — no double counters, no second `pStuck` draw for one physical blockage.
- `blockagesEncountered++` only on a hit.

### 12.2 The push rule

```java
boolean push = false;
if (decisionConfig != null && decisionAttributes != null) {
    double mobilityPenalty = (attributes != null && attributes.mobilityLimited)
            ? 1.0 : 0.0;
    push = thetaScaled >= decisionConfig.pushThetaThreshold
            + decisionConfig.kPush * (barrierCost + mobilityPenalty);
}
```

- **`>=`, inclusive.**
- `mobilityPenalty` is `1.0`/`0.0` and reads `PopulationSampler.Attributes.mobilityLimited` — the
  same attribute as `isPriorityForAdmission`, a *third* consumer of it.
- `barrierCost + mobilityPenalty` is summed first, then multiplied by `kPush`, then added to the
  threshold. Keep the parenthesisation.
- **With the decision layer off, `push` stays `false`** and every blocked resident reroutes. That
  is the declared safe degenerate, flagged at startup (`ContextCreator.java:702–706`).
- The archived Scenario-E runs *configured* `pushThetaThreshold = -0.25` and *executed* `0.0`,
  because Repast zeroed the negative `"number"` constant. That defect is documented and inert;
  `websim/shared/src/manifest.ts:6–9` requires the engine-sourced manifest to expose it. WP8 must
  not silently "fix" the archived value.

### 12.3 Push branch

```java
pushThroughs++;
if (pushedBlockages == null) {
    pushedBlockages = new java.util.HashSet<String>();
}
for (int k = 0; k + 1 < nodes.size(); k++) {
    long a = nodes.get(k).longValue(), b = nodes.get(k + 1).longValue();
    if (off[k] >= pathIndex && network.isBlocked(a, b)) {
        pushedBlockages.add(pairKey(a, b));
    }
}
if (decisionRng.nextDouble() < decisionConfig.pStuck) {
    stuckEvents++;
    stuckUntilTick = tick
            + decisionConfig.stuckDelayH * (60.0 / minutesPerTick);
}
// stale path kept
```

One gamble covers **every** currently-blocked ahead-edge, this wave's and earlier ones' alike — a
second full scan records them all, including ones already in the set (`HashSet.add` is idempotent).
Exactly **one** `nextDouble()` per push event.

`pairKey` (`:846–848`) is `a <= b ? a + ":" + b : b + ":" + a` — Java `long` → `String` via string
concatenation, so `-1000` renders as `"-1000"`. In TS, node ids must be formatted the same way; if
the port carries node ids as `number` this is `String(a)`, and the canonical order is numeric, not
lexicographic. See QUIRK 12.

`stuckUntilTick = tick + stuckDelayH * (60.0 / minutesPerTick)` — the division is evaluated
**first**. See QUIRK 3.

### 12.4 Reroute branch

```java
reroutes++;
int lastReached = 0;
for (int k = 0; k < nodes.size(); k++) {
    if (off[k] < pathIndex) {
        lastReached = k;
    } else {
        break;
    }
}
currentNodeId = nodes.get(lastReached).longValue();
targetShelter = null;
routePath = null;
routeNodes = null;
pathIndex = 0;
```

The loop **breaks** at the first `off[k] >= pathIndex` — it does not scan the whole array. Since
`coordOffset` is non-decreasing this is equivalent, but the `break` also means `lastReached` stays
`0` when the walk has not started.

`retargetCount` is **not** reset and `believedFull` is **not** touched by a reroute. Control falls
through to block 11 in the same tick, re-plans from `currentNodeId` over the freshly recomputed
trees, and the resident **still walks that tick** — including the off-network stretch back to
`nodes[lastReached]`'s coordinate, which is booked into `snapGapM` (block 11) *and* into
`distanceTraveledM` (block 12, because the movement loop starts at the agent's own geometry).

---

## 13. States, restated as a table WP8 must satisfy

`GisAgent.java:100–107`. Six values; `toString()` spellings are the `final_state` column.

| From | To | Condition | Side effects | Layer? |
|---|---|---|---|---|
| (build) | UNAWARE | `!awareInitial` | `awareTick = NaN` | ✔ |
| UNAWARE | PRE_EVAC | `newHour ∧ λ>0 ∧ rng<λ/24` | `awareTick = tick` | ✔ |
| UNAWARE | — | otherwise | `return` | ✔ |
| PRE_EVAC | EN_ROUTE | latch: `cNow >= thr ∧ anyShelterOpen` — every tick | `evacuationTick = tick` | ✗ |
| PRE_EVAC | EN_ROUTE | hazard: `newHour ∧ open ∧ rng < 1/(1+e^-u)` | `evacuationTick = tick` | ✔ |
| EN_ROUTE | SHELTERED | path consumed ∧ `!policyRefused` ∧ `isOpenAt` ∧ `admit` | `arrivalTick = tick`; occupancy++, peak; exposure stops | ✗ |
| EN_ROUTE | EN_ROUTE | refused at door | policy → `recordPolicyRefusal`; belief update; `currentNodeId` = shelter node; route cleared; `retargetCount++` | ✗ |
| EN_ROUTE | REFUSED_ALL_FULL | **L0 only** `retargetCount > 8` | — | ✗ |
| EN_ROUTE | REFUSED_ALL_FULL | chooser: `anyReachable` ∧ nothing selectable | — | ✗ |
| EN_ROUTE | UNREACHABLE | chooser: nothing reachable | **terminal** | ✗ |
| REFUSED_ALL_FULL | EN_ROUTE | every tick: L0 `anyShelterAvailable`, L1 `anyUntriedReachableShelter` | `retargetCount = 0`; target/route/`routeNodes`/`pathIndex` cleared | ✗ |
| SHELTERED | — | terminal; exposure block skipped | — | ✗ |

Non-enum sub-state: **stuck** (`stuckUntilTick` set ∧ `tick < stuckUntilTick`) — `EN_ROUTE`,
immobile, resting ventilation, still booking `exposureWhileTravelingUgM3h`.

`stateMachine.ts:136–215` already declares every row above, with `layer: true` on the three
decision-layer rows. WP8 makes those three reachable and must not add a row that is not in this
table.

---

## 14. RNG DRAW SITES

Draw order is the most fragile thing in this port. This section is exhaustive.

### 14.1 The streams

| Stream | Generator | Seed | Constructed when |
|---|---|---|---|
| Repast default | colt `MersenneTwister` via `RandomHelper` | `randomSeed` (int) | always |
| `PopulationSampler` | `java.util.Random` | `seed*1000003 + 17` | `enableHeterogeneity == 1` |
| `ELayerSampler` | `java.util.Random` | `seed*1000003 + 7919` | `enableDecisionLayer == 1` |
| per-agent decision | `java.util.Random` | `runSeed*2654435761 + index*104729` | `enableDecisionLayer == 1`, one per agent |

All four are already implemented and Tier-0 gated (`websim/engine/src/rng/streams.ts`). WP8 adds
**no new stream** and **no new seed derivation**.

### 14.2 Build-time draws (WP6; listed for completeness, WP8 does not change them)

- Repast default: one `nextIntFromTo(0, nCamps-1)` per resident, creation order.
- `PopulationSampler`: eight-plus draws per resident, in the placement loop.
- `ELayerSampler`: **exactly five** draws per resident, in a **second pass** after placement, in
  creation order: ① aware ② heavy ③ pet ④ dependents ⑤ `nextGaussian` θ_z. All unconditional.
- Per-agent decision streams are **constructed** here (`new Random(decisionSeed)`) but **draw
  nothing** at build.

### 14.3 Run-time draws — the complete list

There are exactly **three** run-time draw sites in the whole decision layer. All three are
`decisionRng.nextDouble()` on the **agent's private stream**.

---

**D1 — outreach conversion.** `GisAgent.java:386`.

```java
if (newHour && decisionConfig.lambdaOutreachPerDay > 0.0
        && decisionRng.nextDouble() < decisionConfig.lambdaOutreachPerDay / 24.0)
```

Preconditions, in short-circuit order — **every one must hold or no draw is consumed**:
1. `state == UNAWARE` at entry to the departure block (which requires `decisionConfig != null`);
2. `newHour` — i.e. `floor(tick*minutesPerTick/60) > lastDecisionHour`;
3. `lambdaOutreachPerDay > 0.0` strictly.

Exactly one `nextDouble()` when all three hold. **Zero draws for the entire run** in every archived
E0-null and baseline-real arm, because `lambdaOutreachPerDay = 0.0` there.

---

**D2 — hazard departure Bernoulli.** `GisAgent.java:414`.

```java
if (open && decisionRng.nextDouble() < p)
```

Preconditions, in short-circuit order:
1. `state == UNAWARE || state == PRE_EVAC` at block entry, and after D1 the state must be
   `PRE_EVAC` (an unconverted `UNAWARE` returned at `:391`);
2. `decisionConfig != null && decisionAttributes != null`;
3. `enableHazardDeparture == 1`;
4. `newHour`;
5. **`open == true`** — `anyShelterOpen(context, tick)`.

Exactly one `nextDouble()` when all five hold. **`p` is computed before the test but the draw is
after `open &&`** — while every shelter is closed, `u` and `p` are computed and discarded and the
stream does not advance. In the archived ER arms (opening dates ON, shelters open on 2020-09-10/11)
that is roughly the first ~two days of hourly evaluations for every resident. Getting this wrong
desynchronises every agent's stream and produces a completely different, entirely plausible run.

---

**D3 — stuck outcome.** `GisAgent.java:816`.

```java
if (decisionRng.nextDouble() < decisionConfig.pStuck)
```

Preconditions:
1. `state == EN_ROUTE`, past the stuck check (`stuckUntilTick` NaN or expired);
2. `routePath != null && routeNodes != null` — so `hasClosureSchedule()` is true and a leg is
   planned;
3. `network.getClosureVersion() != seenClosureVersion`;
4. a blocked ahead-edge exists that is not already in `pushedBlockages`;
5. `push == true`.

Exactly one `nextDouble()` per **push event** — not per blocked edge, not per wave.

---

### 14.4 Order within one agent-tick

1. D1 (if eligible)
2. D2 (if eligible) — **D1 and D2 can both fire on the same tick**, in that order, for a resident
   that is converted by outreach and then departs in the same hour.
3. D3 (if eligible)

D3 cannot co-occur with D1/D2 in practice: D1/D2 require `UNAWARE`/`PRE_EVAC`, and on the tick a
resident departs, `routePath` is still `null` when the closure-reaction block runs at `:495` (the
planning block is at `:507`, after it). So the maximum is two draws per agent-tick.

### 14.5 Order across agents

The private streams make each agent's *sequence* independent of the per-tick shuffle — that is the
stated design goal (`ELayerSampler.java:31–35`). The shuffle still matters, because two residents
arriving at the same shelter on the same tick compete for the last bed, and because
`anyShelterAvailable` sees the admissions that happened earlier in the same tick. The port's
`shuffle-mt` order is the sole declared Java-vs-TS divergence channel (`sim.ts:16–23`) and WP8 does
not widen it.

### 14.6 Sites that consume NO randomness (assert this in tests)

`z_R` decay and increment · `barrierCost` · `thetaScaled` · both choosers · `excludedByBelief` ·
`petAdmittedAt` · `isPriorityForAdmission` · all three `anyShelter*` predicates · the legacy latch ·
movement · path reconstruction · the reroute branch of `reactToClosureWave` (only the *push* branch
draws) · closure scheduling (`closureDraw` selects a pre-committed CSV; there is no runtime draw) ·
the whole output layer.

A good WP8 test asserts the *count* of `nextDouble()` calls on a named agent's stream over a whole
run against a Java-dumped expectation, not just the outcomes.

---

## 15. QUIRKS

Numbered. Each is a place where a reasonable, readable, idiomatic port produces different numbers.

**Q1 — `open &&` gates the hazard draw, and it is the *second* operand.**
`if (open && decisionRng.nextDouble() < p)`. While every shelter is closed, no draw is consumed.
Writing `double r = rng.nextDouble(); if (open && r < p)` — the natural refactor when you want to
log `r` — advances the stream on every closed hour for every resident and desynchronises the entire
run. Same class of error: hoisting the draw out of the `if` "for clarity".

**Q2 — `newHour` is a monotone-index test, not an elapsed-time test.**
`hour > lastDecisionHour` where `hour = (int) Math.floor(tick * minutesPerTick / 60.0)`. With
`minutesPerTick > 60` the index jumps by more than one per tick, and the model still applies exactly
**one** decay and **one** increment. That under-decays `z_R`. It is the certified behaviour;
reproduce it, do not "fix" it by looping the decay `Δhour` times. (All archived runs use
`minutesPerTick = 1.0`, so this is latent — but the UI exposes the slider.)

**Q3 — division order in three expressions.** Floating-point is not associative and these are not
algebraic identities:
- `tick * minutesPerTick / 60.0` — multiply, then divide. **Not** `tick * (minutesPerTick / 60.0)`.
- `dM / (ownSpeedMps * 3600.0)` — multiply first. **Not** `dM / ownSpeedMps / 3600.0`.
- `stuckDelayH * (60.0 / minutesPerTick)` — divide first. **Not** `stuckDelayH * 60.0 / minutesPerTick`.

**Q4 — `lambda / 24.0`, not `lambda * (1/24)`; and `1.0 / 24.0` as a literal.**
`1.0/24.0 = 0.041666666666666664`. `lambda * 0.041666666666666664` ≠ `lambda / 24.0` for many
`lambda`. The `z_R` increment is written `1.0 / 24.0` and constant-folds to the same double either
way, but the outreach threshold is a *division of a variable* and must stay one.

**Q5 — left-to-right accumulation in `u` and in `barrierCost`.**
`u = ((((alpha + bRiskEff*zR) + wOfficial*ind) + thetaScaled) - barrierCost)`.
`barrierCost = ((0.0 + belongings) + pet) + dependents`, in that order, with each term added only
if its flag is set. Reordering either changes last-ulp results, which the logistic can amplify into
a flipped Bernoulli at a knife edge.

**Q6 — `String.compareTo` → JS `<`, never `localeCompare`.**
`shelter.getId().compareTo(best.getId()) < 0`. Java compares UTF-16 code units; JS relational
comparison on strings does the same; `localeCompare` and `Intl.Collator` do not (they are
locale- and ICU-version-dependent, and would reorder e.g. `"A-10"` vs `"A-2"` differently on
different platforms). Use `shelter.id < best.id`.

**Q7 — `(int)` narrowing is truncation-toward-zero with saturation, not `|0`.**
`(int) Math.floor(x)`: Java's double→int cast saturates at `Integer.MIN_VALUE`/`MAX_VALUE` and maps
`NaN` to `0`. JS `x | 0` wraps modulo 2^32 and is wrong for large values. Use
`doubleToInt` from `mathx/truncCast.ts`. Same for `(int) Math.floor(capacity * fraction)`.

**Q8 — NaN comparison is the same in Java and JS, and that is load-bearing.**
`v > bestV` and `v == bestV` are both `false` for `v = NaN` in both languages, so a NaN utility is
skipped and the resident classifies as `REFUSED_ALL_FULL` (because `anyReachable` was already set
before the utility was computed). A `Math.max`-based rewrite, or a `sort()` with a comparator, does
**not** reproduce this. Similarly `Double.isNaN(networkDistToShelterM)` → `Number.isNaN`, never
`isNaN` (the global coerces).

**Q9 — there are TWO different "vulnerable" predicates and they disagree.**
- hazard (`GisAgent.java:405–407`): `copd || asthma || ageYears >= 65 || mobilityLimited`
- reporting / D-3 stratum (`output/logger.ts:268–270`): `ageYears >= 55 || mobilityLimited ||
  asthma || copd || chronicPhysical`

Age 65 vs 55, and `chronicPhysical` present in one and absent from the other. Sharing one helper
between them silently changes either `gammaVuln`'s effect or the `is_vulnerable` column.

**Q10 — `>= 55.5` for `z_R` and the latch; strict `> 55.5` for `hoursAboveUnhealthy`.**
Same constant, three call sites, two operators, all deliberate. `stateMachine.ts` already exports
`riskCueFires` (inclusive) and `countsAsAboveUnhealthy` (strict) so the two cannot be merged.

**Q11 — `Shelter.petIntake` is tri-state; use `??`, never `||`.**
`shelter.petIntake ?? petPolicyAdmitDefault`. With `||`, a recorded `false` (refuse) would fall
through to the default and silently admit pets at a site that refuses them. Already correct at
`admit.ts:58`; do not "simplify" it.

**Q12 — `pairKey` is a string built from `long`s, and the canonical order is NUMERIC.**
`a <= b ? a + ":" + b : b + ":" + a`. The `<=` compares numbers, not strings. Synthetic node ids
are **negative** (`-1000, -1001, …` from the corrupt-node correction), so `pairKey(-1000, 5)` is
`"-1000:5"`. A port that canonicalises by comparing the *rendered strings* gets `"-1000" < "5"`
right by accident but `"10" < "9"` wrong. Compare the numbers.

**Q13 — `HashSet` here is order-free, and that is worth verifying rather than assuming.**
`believedFull` and `pushedBlockages` are `HashSet<String>` used **only** for `add` and `contains` —
never iterated, never sized into an output. So unlike the WP5 STRtree finding (where `HashMap`
bucket order decided a tie-break), there is no iteration-order dependence here. A `Set<string>` in
TS is a faithful port. Do not, however, ever add an iteration over them.

**Q14 — the L1 tie-break is order-independent; the L0 tie-break is order-DEPENDENT.**
L0 uses strict `<` on distance, so the first shelter in `context.getObjects(Shelter.class)` order
wins an exact tie. L1 uses the lexicographic-id rule and does not care about order. Both must be
implemented as written; making them consistent breaks one of them.

**Q15 — `retargetCount` counts every refusal in both regimes; only the CAP is L0-only.**
`retargetCount++` is outside the `if (!useL1() && ...)`. The `retarget_count` column is therefore
meaningful under L1 too, and can exceed 8.

**Q16 — `MAX_RETARGETS` is per EPISODE.** `retargetCount = 0` on `REFUSED_ALL_FULL` → `EN_ROUTE`
re-entry (`:474`). A resident can be refused far more than 8 times over a run.

**Q17 — `seenClosureVersion` is consumed on a no-hit scan.** It is the *first statement* of
`reactToClosureWave` (`:779`), before the scan loop. Moving it after the `if (hit < 0) return`
would make an agent re-scan the same wave on every subsequent tick.

**Q18 — the door's `&&` chain is a three-way side-effect switch.**
`!policyRefused && isOpenAt(tick) && admit(isPriority)`: policy refusal → `recordPolicyRefusal()`
(both counters), `admit` never called; closed door → **no counter at all**; capacity refusal →
`refusedCount` only, from inside `admit`. `admit()` mutates on failure and must never be called
speculatively (`Shelter.java:105–115`).

**Q19 — `capacity == null` means UNLIMITED, in two different places, with two different
consequences.** `hasSpaceFor` returns `true` unconditionally (`Shelter.java:126–128`);
`chooseShelterByUtility` substitutes `UNCAPPED_CAPACITY_PRIOR = 10000.0` into the ln term
(`:713–714`). Coercing blank capacity to `0` turns standby sites into closed ones *and* changes the
L1 utility ranking.

**Q20 — `Math.max(0.40, v - delta)` runs only when `delta > 0.0`.** With `delta == 0` the block is
skipped entirely rather than evaluating `Math.max(0.40, v)`. Hoisting the `Math.max` out of the
guard would raise the speed of any resident sampled below 0.40 — currently impossible, but the guard
is what guarantees it.

**Q21 — the second smoke lookup happens for `UNAWARE` residents too.**
`cNow` at `:366–367` is computed before the layer branch, for every `UNAWARE` or `PRE_EVAC`
resident, every tick. It double-increments `outOfRangeLookups` on out-of-range ticks — and
`out_of_range_lookups == 0` is a validation gate. Collapsing the two lookups changes a published
number even though it cannot change a decision.

**Q22 — `petPolicyDefault == 1` is an equality test, not a truthiness test.**
`ContextCreator.java:785`. Any other integer yields `false` (refuse).

**Q23 — negative `"number"` constants are zeroed by Repast's batch reader.**
`alphaHazard` (−8.0) and `pushThetaThreshold` (−0.25) must be declared `constant_type="double"`.
The archived Scenario-E runs executed `pushThetaThreshold = 0.0` because of this. Never-regress
gotcha 4; the engine-sourced manifest is the mechanism that exposes it.

**Q24 — transcendentals must route through `mathx`, not host `Math`.**
`Math.pow(2.0, -1.0/riskHalfLifeH)` → `fdlibmPow`; `Math.exp(-u)` → `fdlibmExp`;
`Math.log(Math.max(1.0, cap))` → `fdlibmLog`. ECMA-262 leaves these implementation-approximated, so
a last-ulp difference can flip a Bernoulli at a knife edge and make Chrome and Firefox disagree
(`mathx/index.ts:5–13`, `mathx/exp.ts:9–11`, `mathx/pow.ts:12`). `Math.max`, `Math.floor` and
arithmetic are exactly specified and may use the host.

**Q25 — `decisionRng` must persist for the life of the agent.** Constructed once in
`setDecisionLayer`. `StreamRegistry.agentStream(index)` is a **factory** (`streams.ts:105–113`) —
calling it per tick restarts the sequence at draw 0 and would make every hour's Bernoulli identical.
Construct once per resident at world build and store the instance on the resident.

**Q26 — `pathIndex` is a vertex index, and WP7 replaced it with a scalar.**
`reactToClosureWave`'s grandfathering test is `off[k] >= pathIndex`. WP7's movement graft
(`route.ts`, `resident.ts:54–56`) carries `legTravelM` (metres) instead of `pathIndex` (vertices).
WP8 must reconstruct the index: **`pathIndex = #{ i : legApproachM + leg.cumM[i] <= legTravelM }`**
— note `<=`, matching Java's `if (dM <= remainingM) { current = next; pathIndex++; }` at `:531–534`,
which consumes a vertex the walker lands on **exactly**. Because the port's `cumM` and Java's
per-tick geodesic re-measurement differ by the documented ~1e-9 m residual (DR-S3 A3), a walker
standing exactly on a junction is a knife edge. Compute the index with a monotone scan or binary
search over `cumM`, and make the tolerance decision explicitly and in writing rather than by
accident.

**Q27 — a reroute re-plans AND walks in the same tick.** Control falls through from `:840` to the
planning block at `:507` and then the movement block at `:522`. The resident also walks the
off-network stretch back to `nodes[lastReached]`, which is booked into **both** `snapGapM` and
`distanceTraveledM`.

**Q28 — `lambdaOutreachPerDay = 0.0` in every archived Phase-E arm.** Do not treat outreach as
"the mechanism that rescues unaware residents" when validating: in ER, nothing rescues them. If
your port's ER run converts anyone, you have a bug.

---

## 16. WP7 latch points and declared-but-inert fields WP8 must fill

Verified by reading the four named files at the current tree state.

### 16.1 `engine/src/agents/step.ts` (328 lines)

| Lines | What is there | What WP8 must do |
|---|---|---|
| **102–107** | `if (a.decision !== null) throw new Error(...must never execute a decision-layer transition — that branch is WP8)` | **Delete the throw** and replace it with the two real guards (`cfg !== null && a.decision !== null`). Nothing else in the file may keep referring to "WP8". |
| 91–92, 115–118 | `GROUP_PACE_FLOOR_MPS = 0.4` (a **duplicate** of `stateMachine.ts:67`) and `const groupSpeedDeltaMps = 0;` hard-coded | Read `a.decision.groupSpeedDeltaMps`; delete the local constant and import the one from `stateMachine.ts` so there is a single 0.40. |
| 124–147 | exposure block, complete | unchanged — but `a.stuckUntilTick` (line 131) becomes live |
| **150** | `if (a.state === "PRE_EVAC")` | must become `if (a.state === "UNAWARE" \|\| a.state === "PRE_EVAC")` |
| **152–160** | legacy latch only; no hour bucket, no `z_R`, no outreach, no hazard | insert §3.4 verbatim, preserving the three-way branch (layer+hazard / layer+latch / no layer) |
| **164–173** | `REFUSED_ALL_FULL` re-entry, `anyShelterAvailable` only | add the `useL1()` fork to `anyUntriedReachableShelter`; add `a.routeNodes = null` |
| **180–183** | comment: "`§1.5 steps 9-10: stuck / closure reaction (WP8; inert here)`" — **no code at all** | implement §3.6 |
| **186–187** | `chooseNetworkNearestShelter(a, w, tick)` unconditionally | add the `useL1()` fork to `chooseShelterByUtility` |
| **225–226** | `// WP7 has no decision attributes, so policyRefused is structurally false.` `arriveAtDoor(shelter, tick, isPriority, false)` | compute `policyRefused` via `policyRefusedAt(...)` (already written at `admit.ts:52–60`) and pass it |
| **233–243** | refusal branch: no belief update, no `routeNodes = null`, unguarded cap | add `believedFull.add(shelter.id)` under the L1/L0-policy rule; add `a.routeNodes = null`; change the cap to `if (!useL1(a, cfg) && a.retargetCount > MAX_RETARGETS)` |
| **265–308** | `chooseNetworkNearestShelter`, with `// excludedByBelief is structurally false without the decision layer.` at **280** | insert the real `excludedByBelief` call between `anyReachable = true` (279) and the space test (281) |
| — | **`chooseShelterByUtility` does not exist anywhere in the engine** | write it (§7) |

### 16.2 `engine/src/agents/stateMachine.ts` (219 lines)

| Lines | Declared | Status |
|---|---|---|
| 67 | `GROUP_PACE_FLOOR_MPS = 0.4` | **exported, never imported by `step.ts`** (which redeclares it at `step.ts:92`) |
| 70 | `UNCAPPED_CAPACITY_PRIOR = 10000` | **exported, zero call sites** — WP8's `chooseShelterByUtility` is the only consumer |
| 117–120 | `riskCueFires(cNow)` (`>= 55.5`) | **exported, zero call sites** — WP8's `z_R` update is the only consumer |
| 136–215 | `TRANSITIONS`, 11 rows | three rows carry `layer: true` (indices 0, 1, 3) and are **unreachable today** |
| 218 | `LEGACY_TRANSITIONS = TRANSITIONS.filter(t => !t.layer)` | WP8 must keep the split and add tests that the `layer: true` rows are now reachable |

Everything else in this file (`UNHEALTHY_UGM3`, `MAX_RETARGETS`, `ventilationM3h`, `latchFires`,
`countsAsAboveUnhealthy`) is already live.

### 16.3 `engine/src/agents/resident.ts` (161 lines)

**Declared but inert** — `resident.ts:116–124`, under the comment
*"Phase E / Scenario E (WP8). Declared so the output layer has one shape to read and so WP8 cannot
invent a second one; inert in WP7."*

| Line | Field | Current value | Written by |
|---|---|---|---|
| 118 | `decision: DecisionAttributes \| null` | always `null` | must be populated at construction |
| 119 | `awareTick = NaN` | never written | `setDecisionLayer` equivalent + outreach |
| 120 | `blockagesEncountered = 0` | never written | `reactToClosureWave` |
| 121 | `pushThroughs = 0` | never written | push branch |
| 122 | `reroutes = 0` | never written | reroute branch |
| 123 | `stuckEvents = 0` | never written | stuck draw |
| 124 | `stuckUntilTick = NaN` | **read** at `step.ts:131`, never written | push branch |

**Absent entirely — WP8 must add these to `Resident`** (Java field, line):

| Java field | `GisAgent.java` | Type | Notes |
|---|---|---|---|
| `decisionRng` | 246 | `JavaRandom` | one per resident, constructed once |
| `thetaScaled` | 248 | `number` | `sigmaTheta * thetaZ`, precomputed |
| `barrierCost` | 250 | `number` | precomputed, order-sensitive |
| `zR` | 254 | `number` | init `0.0` |
| `lastDecisionHour` | 257 | `number` (int) | **init `-1`**, not 0 |
| `believedFull` | 265 | `Set<string> \| null` | allocated in **both** regimes when the layer is on |
| `routeNodes` | 199 | node chain + `coordOffset` | `null` unless `hasClosureSchedule()` |
| `seenClosureVersion` | 202 | `number` (int) | init `0` |
| `pushedBlockages` | 214 | `Set<string> \| null` | init `null`, lazily allocated |

`Resident`'s constructor `init` object (`resident.ts:126–134`) does not accept `decision`, and
**this is the gap that currently makes the WP7 latch unreachable** — see 16.5.

### 16.4 `engine/src/agents/index.ts` (51 lines)

Line 37 re-exports `GROUP_PACE_FLOOR_MPS`, `UNCAPPED_CAPACITY_PRIOR` and `riskCueFires` — all three
are currently dead exports (declared for WP8, consumed by nothing). Line 41 exports `stepResident`
and `StepWorld`; `StepWorld` (`step.ts:65–89`) must gain:

- `anyUntriedReachableShelter(tick, fromNode, believedFull): boolean`
- the `DecisionConfig` (or `null`)
- access to the closure-wave state (`closureVersion`, `isBlocked`, `hasClosureSchedule`)

### 16.5 A finding: the WP7 latch is currently unreachable from a real run

`sim.ts:112–127` constructs every `Resident` like this:

```ts
new Resident({
  index: r.index,
  name: `Site ${r.index}`,
  encampmentId: r.incId,
  startLon: r.startLon,
  startLat: r.startLat,
  startNode: r.startNode,
  attributes: r.attributes,
}),
```

`r.decision` — populated at `world/build.ts:462` by the WP6 second pass and Tier-1 gated — is
**dropped on the floor**. `Resident.decision` therefore stays `null` for every resident in every
`Simulation`, so the throw at `step.ts:102–107` can only fire from a test that assigns the field by
hand, which is exactly what the one test that covers it does
(`engine/test/agents/step.units.test.ts:301–320`).

Consequences today:

1. Running an ER / E0-null preset through `Simulation` **does not throw**. It silently executes the
   legacy-latch path with the decision-layer *population* (the E-layer draws happened; the
   behaviour did not). That is a plausible-looking wrong run, which is precisely what the latch was
   built to prevent.
2. `agents.csv` emits `",,,,,"` for the six Phase-E columns in such a run
   (`output/logger.ts:310–321`), because `a.decision` is null.

WP8 must (a) thread `decision` through `sim.ts`'s constructor call and `Resident`'s `init` type, and
(b) — before doing anything else — add a regression test that a `Simulation` built with
`enableDecisionLayer: 1` reaches the decision path. Until (a) lands, **any WP8 progress claim based
on a `Simulation`-level run is unfalsifiable**, because the legacy path would produce output either
way.

### 16.6 `engine/src/sim.ts` (213 lines)

| Line | What | WP8 |
|---|---|---|
| 149 | `// §1.2 (1) ClosureWave.apply() at FIRST_PRIORITY — WP8.` — a bare comment | implement the wave: block edges, `bumpClosureVersion()`, recompute **every** shelter tree in shelter-CSV load order |
| 168–181 | `anyShelterOpen` cached per tick | unchanged (resident-independent) |
| 183–208 | `anyShelterAvailable` cached per tick + admission epoch | unchanged; **add a separate list** for `anyUntriedReachableShelter` that does *not* filter on `hasSpaceFor` (§10) |
| 210–212 | `onAdmission` bumps the epoch | must also invalidate whatever the closure wave changes (`routeTree` identities) |
| 112–127 | `Resident` construction | see 16.5 |

### 16.7 Elsewhere (not in the four named files, but blocking)

- `world/build.ts:86–105` — `WorldBuildConfig` declares only the six *sampler-facing* Phase-E
  parameters. The 15 `DecisionConfig` coefficients and the four Scenario-E coefficients are **not
  in it**, because the certified model reads them in `build()` and passes them to the agents. WP8
  needs a `DecisionConfig` object built from `RunConfig` and handed to `Simulation`, in the exact
  positional order of `GisAgent.DecisionConfig`'s constructor.
- `closures/index.ts:1–8` — `ClosureWave.apply()` and `reactToClosureWave` are explicitly deferred
  to WP8; only schedule parsing exists.
- `output/logger.ts:53–54` — `DECISION_PUBLISHED_TARGETS_TEXT` is fixed; the census block at
  `:651–663` already renders `decisionMarginals`. No WP8 change needed there.

---

## 17. What "done" looks like

From `IMPLEMENTATION_PLAN.md` §8, WP8's acceptance, restated with the decision-layer half made
concrete:

1. **Tier-2 own-engine R3 byte-identity (flagship).** Three arms × the E0-null config must produce
   byte-identical `agents.csv` / `shelters.csv` / `simulation.json` to the same arm with
   `enableDecisionLayer = 0` — with the sole, expected exception of the six Phase-E agent columns
   and the `decision_layer` manifest block, which the E0 run populates and the legacy run leaves
   empty. Anything else differing is a defect in the layer's gating.
2. **Draw-count identity**, not just outcome identity: for a named agent in an ER run, the number
   of `nextDouble()` calls on its private stream over the full run must match a Java-dumped count.
   This is the only test that catches Q1.
3. **The `layer: true` rows of `TRANSITIONS` are reachable**, and `LEGACY_TRANSITIONS` still is not
   reachable from a layer-on hazard run.
4. **`out_of_range_lookups == 0`** on every preset, with the double-lookup intact.
5. **ER/SE/SE2 presets reproduce the archived direction of effect** and the counter identities
   (`blockages_encountered`, `push_throughs`, `reroutes`, `stuck_events`).
6. **The `pushThetaThreshold` honesty note is wired into the presets and the manifest diff** —
   configured −0.25, executed 0.0 in the archive.
