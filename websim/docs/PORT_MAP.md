# PORT_MAP — Authoritative merged reference for the TypeScript browser port

Wildfire shelter ABM (Repast Simphony, Java) → TypeScript web engine with slider-driven UI.
Repo root: `C:/Users/Chick/OneDrive/Desktop/reu`. Java sources under `Geography/src/geography/`.
Merged from 8 parallel reader sections (`scratchpad/understand/*.md`); contradictions between
sections were re-checked against source and are marked **[RESOLVED]** inline.

**Resolutions made during merge** (verified against source 2026-07-30):

1. **agents.csv column count**: 59 columns, not 58 (shelter-output.md arithmetic slip) and not 49
   (validation-docs' 49 = the pre-Phase-E archived families). Verified against
   `OutcomeLogger.java:150-176`: 49 legacy + 6 Phase-E + 4 Scenario-E = **59** in the current writer.
2. **PopulationSampler chronic-physical draw**: world-build.md's per-resident list ("age → sex →
   mobility → asthma → COPD → speed") was abbreviated; `PopulationSampler.java:278` confirms a
   7th unconditional `nextDouble()` for chronicPhysical *before* the speed Gaussian. The full order
   in §1.8 is authoritative.
3. **source_integrity file census**: **13 files**, not 12 (shelter-output.md "x 12" slip). Verified
   against the array literal at `OutcomeLogger.java:437-454`.
4. **Registry row counts**: `variables.csv` now has 55 rows, `assumptions.csv` 35; the
   "28 variables, 26 assumptions, 4 blocking" figure in validation-docs is what the deddfca-era
   run manifests recorded — both true at different times. A port validates against the *current*
   files but must not "fix" archived manifests.

---

## 1. Engine spec

### 1.1 Time model

- Anchor: `SIM_START = 2020-09-07T00:00` **local** (V13). Sim hour 0 = that hour.
- Tick = `minutesPerTick` simulated minutes (pinned 1.0 everywhere); `ticksPerHour = 60.0 / minutesPerTick`.
- Run length: `endHours = min(simulationHours, smokeField.hours())`; `endTick = endHours * ticksPerHour`.
- Agent `step()` is `@ScheduledMethod(start = 1, interval = 1)` — **first tick is 1**, and the
  schedule's final tick is inclusive, which is why `simulationHours ≤ slices − 1` (gotcha §6.7.3).
- Smoke hour index for a tick: `hourIndex = floor((tick * minutesPerTick) / 60.0)`.
- `timeForTick(tick) = startDateTime.plusMinutes((long)(tick * minutesPerTick))` — **truncating** cast.

### 1.2 Per-tick execution order (Repast schedule priorities)

1. **`ClosureWave.apply()`** — one-shot at `activation_hour * ticksPerHour`, FIRST_PRIORITY
   (only on wave ticks, only when `closuresCode != 0`). Per wave: block each scheduled edge that
   exists (`hasEdge` guard — phantom pairs skipped), `bumpClosureVersion()`, then recompute **every**
   shelter's Dijkstra tree in shelter-CSV load order. No RNG. All agents see the same post-wave world.
2. **All agents' `step()`** — RANDOM_PRIORITY (Repast default): the per-tick execution order is
   **shuffled, consuming draws from the RandomHelper default stream**. This shuffle decides who gets
   the last bed when capacity binds (arm A binds hard — order is outcome-relevant, see A-16).
3. **`OutcomeLogger.export()`** — `createAtEnd(LAST_PRIORITY)`, once, after everything else.

Nothing else is scheduled — no per-tick logger, no smoke update method (agents pull concentration).

### 1.3 World build sequence (`ContextCreator.build()`, once before tick 0)

1. Read params (§2); `seed = RandomHelper.getSeed()`.
2. Fail-fast: `smokeSeriesCode ∈ [0,2]`, `closuresCode ∈ [0,3]`, and if `closuresCode==3` then
   `closureDraw ∈ [1,3]` — else `IllegalStateException`. (**`scenarioCode` has NO fail-fast** —
   any unlisted value silently runs arm A.)
3. Resolve `scenarioName` + shelters CSV from `scenarioCode` (§3.1); if `shelterPolicyVariant==1`
   rewrite to `<base>_elayer.csv`, throwing if absent.
4. `ScienceRegistry.load(...)` — fail-fast governance validation; a bad registry aborts before any
   model object exists. Zero RNG.
5. Geography + (empty, display-only) "Network" projections.
6. Streets: iterate `data/Streets.shp` **in file order** (reprojected to WGS84 if needed). Per
   feature: must be MultiLineString, take only `getGeometryN(0)`; `TYPE ∈ {1110,1120,1121,1122,1123}`
   → excluded from graph AND display but counted (U-27 freeway filter); name = `FULL_NAME` →
   `STREETNAME` → `"unnamed street"`; if both `PDX_F_NODE`/`PDX_T_NODE` numeric →
   `network.addStreet(f, t, coords, name)`, else display-only. Then `network.buildIndex()`
   (node-correction + validation, §1.6) and capture the ValidationReport.
7. SmokeField: `new SmokeField(smokeCsv, "Multnomah", SIM_START, smokeScale)` (§1.7).
8. Shelters: `CsvLoader.read(sheltersCsv)`, **in file order** (order is load-bearing for closure
   waves). Per row: capacity blank→null (=unlimited), `operating = "operating".equalsIgnoreCase(status)`,
   open/close windows via `tickForDate` if `respectShelterOpeningDates==1`, triage reserve
   `floor(capacity * triageReserveFraction)` if capacity non-null and fraction > 0, optional
   `pet_intake`/`adults_only` columns; snap `nearestNode`, compute one Dijkstra tree per shelter.
9. Closures (if `closuresCode != 0`): parse CSV (fail-fast on malformed rows / negative hours; WARN
   inert if hour ≥ end), group into `TreeMap<hour, edges>`, schedule one-shot waves.
10. Residents: load encampments CSV (malformed rows silently skipped). For `i = 0..numAgents-1`:
    one default-stream draw `RandomHelper.nextIntFromTo(0, campCoords.size()-1)` (with replacement)
    → start coord + `inc_id`; `nearestNode`; construct `GisAgent("Site "+i, ...)`; if heterogeneity,
    `sampler.sample()` on the PopulationSampler stream; append to `createdResidents` (creation order —
    `context.getObjects` order is unspecified).
11. Phase-E second pass (if `enableDecisionLayer==1`): build `DecisionConfig`; for each resident in
    **creation order**, `eSampler.sample()` then `setDecisionLayer(config, attrs)`.
12. `endAt(endTick)`; wire OutcomeLogger (41-name parameter manifest, checksummed data files);
    schedule export.

### 1.4 Agent state machine

`enum State { PRE_EVAC, EN_ROUTE, SHELTERED, UNREACHABLE, REFUSED_ALL_FULL, UNAWARE }`
Initial `PRE_EVAC`; `UNAWARE` only when the decision layer sets `awareInitial == false`.

| From | To | Condition | Side effects |
|---|---|---|---|
| UNAWARE | PRE_EVAC | layer on ∧ newHour ∧ `lambdaOutreachPerDay > 0` ∧ `decisionRng.nextDouble() < λ/24` | `awareTick = tick` |
| UNAWARE | (stays) | otherwise | return (exposure already accrued) |
| PRE_EVAC | EN_ROUTE | **Legacy latch** (no layer, or layer on with `enableHazardDeparture==0`): `cNow >= evacuationThresholdUgM3` ∧ `anyShelterOpen` — every tick | `evacuationTick = tick` |
| PRE_EVAC | EN_ROUTE | **Hazard** (`enableHazardDeparture==1`): newHour ∧ open ∧ `decisionRng.nextDouble() < 1/(1+e^-u)` | `evacuationTick = tick` |
| EN_ROUTE | SHELTERED | path consumed ∧ !policyRefused ∧ `isOpenAt(tick)` ∧ `admit(isPriority)` true | `arrivalTick = tick`; occupancy++, peak updated; exposure stops forever |
| EN_ROUTE | EN_ROUTE (re-plan) | reached door but refused (policy / closed / full) | policy → `recordPolicyRefusal()`; belief update (L1 always; L0 only for policy refusals); `currentNodeId = shelter's node`; route cleared; `retargetCount++` |
| EN_ROUTE | REFUSED_ALL_FULL | (L0 only) after refusal, `retargetCount > MAX_RETARGETS (8)` | — |
| EN_ROUTE | REFUSED_ALL_FULL | chooser: `anyReachable` but nothing selectable | — |
| EN_ROUTE | UNREACHABLE | chooser: no operating+open shelter with finite tree distance | **terminal** |
| REFUSED_ALL_FULL | EN_ROUTE | re-checked **every tick**: L1 `anyUntriedReachableShelter`; L0 `anyShelterAvailable` | `retargetCount = 0`, route cleared |
| SHELTERED | — | terminal; exposure block skipped | — |

Non-enum sub-state: **stuck** (`stuckUntilTick` set, `tick < stuckUntilTick`) — EN_ROUTE, immobile,
resting ventilation. Asymmetry: UNREACHABLE terminal, REFUSED_ALL_FULL not (shelters open on
different dates). L1 has **no retarget cap** (belief set bounds termination); L0's cap of 8 is
per-episode (reset on re-entry), which is why L0 must record policy refusals into `believedFull`
or it cycles forever.

### 1.5 `step()` internal order (exact)

1. Context/geography lookup.
2. Param reads (every tick): `minutesPerTick`; `walkingSpeedMps` = per-agent sampled speed if
   heterogeneity, else run-wide param.
3. Group pace (V34): if layer on and `groupSpeedDeltaMps > 0` for this agent:
   `v = max(0.40, v − delta)` (derived; the sampled speed is never mutated).
4. Clock: `tick`, `dtHours = minutesPerTick/60`.
5. **Exposure block** — every non-SHELTERED state (incl. UNAWARE, UNREACHABLE, REFUSED_ALL_FULL, stuck):
   ```
   c = smokeField.concentrationForTick(tick, minutesPerTick)
   exposureUgM3h += c*dt;  vweUgM3h += c*ageRR*comorbidityRR*dt        // RRs pinned 1.0
   ventilation = (EN_ROUTE && !stuck) ? 1.62 : 0.61                    // m³/h
   airVolumeBreathedM3 += ventilation*dt;  inhaledDoseUg += c*ventilation*dt
   if (EN_ROUTE) exposureWhileTravelingUgM3h += c*dt                   // includes stuck ticks
   if (c > 55.5) hoursAboveUnhealthy += dt                             // STRICT >
   peakConcUgM3 = max(...);  outdoorHours += dt
   ```
6. Departure block (UNAWARE/PRE_EVAC only). Re-reads concentration (**second lookup this tick** —
   double-increments `outOfRangeLookups`). Outreach draw → hazard-or-latch branch (§1.4).
   Risk cue update (hourly, deterministic): `z_R ← z_R * 2^(−1/riskHalfLifeH) + (cNow >= 55.5 ? 1/24 : 0)`
   (note `>=` here vs strict `>` for hoursAboveUnhealthy — deliberate, do not "fix").
   Hazard log-odds:
   ```
   vulnerable = attributes != null && (copd || asthma || age>=65 || mobilityLimited)
   u = alphaHazard + bRisk*(1 + (vulnerable ? gammaVuln : 0))*z_R
       + wOfficial*1{anyShelterOpen} + sigmaTheta*thetaZ − barrierCost
   depart iff open && decisionRng.nextDouble() < 1/(1+exp(−u))    // no draw while all closed
   ```
   Barrier cost (precomputed in `setDecisionLayer`):
   `c_i = barrierBelongings*heavy + barrierPet*pet*1{!petPolicyAdmitDefault} + barrierDependents*dependents`
   (pet term keyed to the **world default**, never per-site policy — that's discovered at the door).
7. REFUSED_ALL_FULL re-entry check.
8. `if (state != EN_ROUTE) return`.
9. Stuck check: still delayed → return; delay served → clear and resume the pushed path.
10. Closure reaction: if route exists and `closureVersion != seenClosureVersion` →
    `reactToClosureWave` (§1.6.3); if newly stuck → return.
11. Planning (when `routePath == null`): L1 → `chooseShelterByUtility`, else
    `chooseNetworkNearestShelter` (§1.6.2). On failure the state was set; return. On success add
    encampment→street snap gap to `snapGapM`.
12. Movement (deterministic): `stepLengthM = v * 60 * minutesPerTick`; walk the polyline consuming
    vertices geodesically; partial segments via `Geodesic.WGS84.Direct(lat, lon, azi1, remaining)`;
    `distanceTraveledM += stepLength − remaining`.
13. Arrival at door (path consumed): policy gate
    `(hasPet && !petAdmittedAt(shelter)) || (hasDependents && shelter.isAdultsOnly())`,
    then `isOpenAt`, then `admit(isPriorityForAdmission())`. `&&` short-circuits: a **closed** door
    never calls `admit()` → no refusedCount increment for closed-door arrivals; a capacity refusal
    increments refusedCount (inside `admit`); a policy refusal increments both counters.

Priority admission: `isPriorityForAdmission()` ≡ `attributes != null && attributes.mobilityLimited`
(mobility only — never age/asthma/COPD). Priority sees full capacity; others see
`capacity − reservedForPriority`. **`admit()` failure increments `refusedCount` as a side effect —
never call speculatively.**

### 1.6 Routing layer (StreetNetwork — zero RNG, fully deterministic)

**Graph**: undirected (pedestrians ignore one-ways, A-06); edge weight = full polyline geodesic
length, `Geodesic.WGS84.Inverse(a.y, a.x, b.y, b.x).s12` summed left-to-right (GeographicLib/Karney —
NOT haversine). JTS convention: `Coordinate.x = lon, .y = lat`; every GeographicLib call swaps to (lat, lon).

**Corrupt-node-ID correction** (order-dependent on shapefile record order):
- `NODE_SITE_TOLERANCE_M = 100.0`: endpoint claims of one attribute ID within 100 m form one site;
  first site (file order) is primary and keeps the ID.
- `REATTACH_TOLERANCE_M = 10.0`: additional sites within 10 m (geodesic) of the nearest primary
  (nearest by **planar degree-space** STRtree NN) are REATTACHED; else SPLIT to synthetic negative
  ids `-1000, -1001, …` in file order. Nothing deleted; every correction exported.
- `IMPOSSIBLE_EDGE_SLACK_M = 220.0` (= 2·100 + 2·10) post-fix audit slack. Post-fix expectation: 0
  impossible edges. First-claimant wins node coordinates.
- Adjacency: `HashMap<Long, List<Edge>>`, list order = feature order. Two directed Edge records per
  feature (reversed coord copy for the back edge).

**1.6.1 Dijkstra** (`computeTree(sourceNode)`): binary-heap PQ of `{dist, nodeIdAsDouble}` (exact
below 2^53), lazy deletion, **strict `nd < old`** relaxation — at exact ties the first-relaxed
predecessor wins (depends on adjacency order + heap pop order among equal keys; distances unaffected,
path *geometry* can differ under a different heap). `blockedAdj.isEmpty()` short-circuit keeps legacy
runs bit-identical (one boolean per relaxation). Trees are computed in exactly two places: once per
shelter at build, and all shelters after each closure wave. Agents never compute trees — an
undirected graph means dist(shelter→agent) = dist(agent→shelter), read from the shelter's tree.

`pathToSource(tree, fromNode)`: starts at the **node coordinate** (may differ from raw endpoint —
the source of `snapGapM`), walks predecessor edges, appending each edge's coords reversed (each edge
contributes `coords.length − 1` vertices). `nodesToSource` mirrors it, plus `coordOffset[i]` = index
of node i's coordinate in the path (edge (k,k+1) is "ahead" iff `coordOffset[k] >= pathIndex`).

`nearestNode(c)`: JTS STRtree `nearestNeighbour` ranked by **planar Euclidean distance in degrees**
between envelope centres — NOT geodesic. Snapping metric must be reproduced exactly (anisotropy at
45.5°N: 1° lon ≈ 0.70 × 1° lat). Compare the **`sqrt`**, not the squared distance: Java ties on the
`sqrt`, and ranking on squares would silently resolve a tie Java does not have. **Ties (WP5-F2):** the
graph has 192 groups of nodes at bit-identical coordinates, and JTS then decides by traversal order,
seeded by `HashMap<Long, Coordinate>` iteration in `buildIndex()` — so the winner is the one with the
lower `spread(Long.hashCode(id)) & (table-1)` bucket (table 131,072 for 88,100 nodes), NOT the lowest
node id. Validated 7/7 against the certified snapper; "lowest id" is wrong on 1 of the 7, across a
component boundary. See `DR-WP5-graph-runtime.md` §4.

**1.6.2 The two choosers**
- L0/legacy `chooseNetworkNearestShelter`: scan `context.getObjects(Shelter.class)`; candidate =
  operating ∧ open ∧ tree != null ∧ finite `distanceTo(currentNodeId)`; `anyReachable` set BEFORE
  the belief filter; skip `believedFull` (L0: policy refusals only); among those with
  `hasSpaceFor(isPriority)`, min distance with strict `<` — **ties broken by iteration order**.
- L1 `chooseShelterByUtility`: same filter minus `hasSpaceFor` (live occupancy is the omniscience L1
  removes), minus believedFull members. Utility:
  ```
  cap_j = capacity == null ? 10000.0 : capacity
  V_j = −betaTravelTime * (dM / (ownSpeed*3600)) + betaCapacityPrior * ln(max(1, cap_j))
  ```
  max V, exact ties → lexicographically smallest shelter id (**order-independent**, unlike L0).
  `ownSpeed` is the group-pace-adjusted speed. `betaCapacityPrior = 0` reduces to nearest-reachable.
- Both on success: `plannedRouteM += bestDistM`; `networkDistToShelterM` written **once** (first
  selection only — stale for retargeted agents by design, fix D-6); routeNodes allocated only when
  `hasClosureSchedule()`.
- Failure classification: `anyReachable ? REFUSED_ALL_FULL : UNREACHABLE`.

**1.6.3 Closure reaction** (`reactToClosureWave`): first statement sets
`seenClosureVersion = getClosureVersion()` (a no-hit scan still consumes the wave — max one scan per
wave per agent). Scan remaining node chain for the first blocked ahead-edge not already in
`pushedBlockages`; no hit → return (no counter, no draw). Hit → `blockagesEncountered++`, then:
```
mobilityPenalty = mobilityLimited ? 1.0 : 0.0
push = thetaScaled >= pushThetaThreshold + kPush*(barrierCost + mobilityPenalty)   // false if layer off
```
- Push: `pushThroughs++`; record ALL currently-blocked ahead-edges in `pushedBlockages`
  (canonical `min:max` key); one `decisionRng.nextDouble() < pStuck` gamble → if stuck,
  `stuckEvents++`, `stuckUntilTick = tick + stuckDelayH * ticksPerHour`; keep the stale path.
- Reroute: `reroutes++`; `currentNodeId` = last node actually reached (largest k with
  `coordOffset[k] < pathIndex`); route cleared → re-plans **same tick** and still walks that tick.
Closures block **entry** to a street; walkers at/past the junction are grandfathered. One decision
per wave covers every blocked ahead-edge; a pushed edge is never re-litigated.

### 1.7 SmokeField semantics

- County-uniform hourly PM2.5 (Multnomah monitor mean per hour, no spatial interpolation, A-01).
  Columns consumed: `County Name` (equalsIgnoreCase filter), `Date Local` (yyyy-MM-dd),
  `Time Local` (HH:mm, truncated to 5 chars), `Sample Measurement` (double; unparseable → row skipped).
- `hourIndex = ChronoUnit.HOURS.between(startDateTime, obs)`; negative skipped; per-hour {sum,count}
  over all monitors/POCs; dense array `hourlyUgM3[h] = count>0 ? (sum/count)*scaleFactor : NaN`.
  **smokeScale applies once, at construction, to real values only — NaN gaps stay NaN.** A UI
  smoke-scale slider must rescale the stored array (or preserve NaN semantics if scaling at query).
- Lookup `concentrationForTick`: NaN (gap OR out-of-window — both) → return **0.0** and increment
  `outOfRangeLookups` (manifest-reported; the counter is part of the contract).
- `peakHourly()` = max non-NaN. Observed peak 562.7 (2-monitor mean; 588.9 is the single-monitor
  max — never conflate).

### 1.8 RNG contract — four disjoint streams (the "three-streams rule" + per-agent streams)

| Stream | Generator | Seed | Draw sites |
|---|---|---|---|
| Repast default | MersenneTwister (cern/colt via `RandomHelper`) | `randomSeed` | (a) one `nextIntFromTo(0, nCamps−1)` per resident, creation order — the ONLY build-time default draw; (b) **per-tick agent shuffle** all run long |
| PopulationSampler | `java.util.Random` | `seed*1000003 + 17` | one `sample()` per resident inside the placement loop (heterogeneity on only; otherwise never constructed) |
| ELayerSampler | `java.util.Random` | `seed*1000003 + 7919` | one `sample()` per resident, **second pass** after placement completes (layer on only) |
| Per-agent decision | `java.util.Random` | `runSeed*2654435761 + index*104729` (Java 64-bit signed overflow) | in-run: outreach Bernoulli, hazard Bernoulli, stuck Bernoulli — invariant to the tick shuffle |

**PopulationSampler per-resident order (fixed):** ① `nextDouble` age band (cumulative pick, strict
`<`, fallback last index) ② `nextInt(bandWidth)` age ③ `nextDouble` sex ④ `nextDouble` mobility
(threshold 0.347802 if age ≥ 55 else 0.152163) ⑤ `nextDouble` asthma (0.15) ⑥ `nextDouble` COPD
(0.105) ⑦ `nextDouble` chronicPhysical (0.391) ⑧ `nextGaussian` × N — truncated normal for speed,
rejection loop, bounds [0.40, 2.20], ≤ 100 attempts then clamp the **mean**. Only ⑧'s draw count varies.

Speed: mobility-limited → `truncNorm(0.95, 0.32)` (Boyce replacement, COPD delta NOT stacked);
else `mu = ageSexMean` (Bohannon rows 20s..80+, `row = clamp((age/10)−2, 0, 6)`; OTHER sex =
unweighted mean), COPD → `mu = max(0.40, mu − 0.19)` additive; `truncNorm(mu, 0.13*mu)`.
Asthma has no speed effect (deliberate).

Age bands (Pathways 2026): weights {0.527, 0.423, 0.050} over [18,45) / [45,65) / [65,90), uniform
integer within band. Sex weights {0.68432 M, 0.29271 F, 0.02297 OTHER}; sex feeds only gait means.

**ELayerSampler per-resident order (fixed, ALL unconditional):** ① aware (`< pAware`) ② heavy
③ pet ④ dependents ⑤ `nextGaussian` thetaZ (stored RAW; scaled by sigmaTheta at use — sigma=0
still consumes the draw, the R3 null). Then deterministically: `groupSpeedDeltaMps` zeroed unless
dependents; `decisionSeed` computed. Sweeping any E parameter never reshuffles who owns a pet.

**`java.util.Random` spec a port must clone bit-exactly:** 48-bit LCG
(`seed ^ 0x5DEECE66D` scramble; multiplier `0x5DEECE66D`, addend `0xB`, mod 2^48); `nextDouble` =
53-bit; `nextInt(bound)` with rejection; `nextGaussian` = Marsaglia polar **with cached second
deviate**. BigInt or split-32-bit arithmetic in TS.

**Zero-RNG paths (guaranteed):** ScienceRegistry, shapefile/graph build, shelter loading + Dijkstra,
SmokeField, closure scheduling/waves, movement, path reconstruction, legacy latch, output.

---

## 2. Full parameter surface (the future sliders)

Two schemas: GUI (`Geography.rs/parameters.xml`, 11 params, defaults = final study config) and
batch (per-file schema; absent params take **behaviour-preserving code fallbacks** via
`intParam`/`doubleParam`, NOT the scientific values). **A fresh UI run must decide which default set
it mirrors** (open question). Legend: fallback = value when a batch file omits the param.

### 2.1 Infrastructure / core run control

| name | type | GUI default | fallback | range/values used | meaning |
|---|---|---|---|---|---|
| `numAgents` | int | 500 | REQUIRED | 50 / 500 / 2037 / 6842 | resident count (V15); 6842 = 2025 Tri-County PIT unsheltered |
| `randomSeed` | int | `__NULL__` (random!) | REQUIRED | 42–50 | master seed (V16); GUI unpinned = non-reproducible |
| `minutesPerTick` | double | 1.0 | REQUIRED | pinned 1.0 | tick length (V13) |
| `simulationHours` | int | 312 | REQUIRED | 24/72/312/455 | window length; **must be ≤ smoke slices − 1** |
| `scenarioCode` | int | 0 | 0 | 0–20 | arm label + shelter CSV selector (§3.1); no fail-fast |

### 2.2 Population & demographics

| name | type | GUI default | fallback | meaning |
|---|---|---|---|---|
| `enableHeterogeneity` | int 0/1 | 1 | 0 | per-agent age/sex/mobility/asthma/COPD/chronic/speed (V18–V22) |

Sampled-constant surface (hardcoded, candidate advanced sliders): age weights {.527,.423,.050};
sex weights {.68432,.29271,.02297}; mobility P 0.152163 / 0.347802 (age≥55); asthma 0.15;
COPD 0.105; chronicPhysical 0.391 (reporting only).

### 2.3 Movement

| name | type | GUI default | fallback | meaning |
|---|---|---|---|---|
| `walkingSpeedMps` | double | 1.30 | REQUIRED (used only when heterogeneity=0) | run-wide speed (V10); published range 1.272–1.462 |
| `groupSpeedDeltaMps` | number | — | 0.0 (sourced 0.06 — the ONE E-param whose sourced value ≠ fallback) | per-extra-member slowdown (V34); `max(0.40, v−delta)`; sweep 0.04–0.08 |

Hardcoded: speed bounds [0.40, 2.20]; SPEED_CV 0.13; impaired μ/σ 0.95/0.32; COPD delta −0.19;
Bohannon age×sex mean tables (men {1.358,1.433,1.434,1.433,1.339,1.262,0.968}, women
{1.341,1.337,1.390,1.313,1.241,1.132,0.943}); step length `v·60·minutesPerTick`.

### 2.4 Smoke & environment

| name | type | GUI default | fallback | fail-fast | meaning |
|---|---|---|---|---|---|
| `smokeSeriesCode` | int | — | 0 | throws outside 0–2 | 0=observed (peak 562.7), 1=severe v1 (embedded 1.75×, peak 984.75), 2=worst v2 (embedded 4.436×, peak 2496.1, Canberra-anchored A-33) |
| `smokeScale` | number | — | 1.0 | — | C′(t) = smokeScale × C(t) at SmokeField construction (V47). Effective severity = embedded × smokeScale |
| `evacuationThresholdUgM3` | double | 55.5 | REQUIRED (latch branch) | — | latch departure threshold (EPA "Unhealthy", D9) |

Hardcoded: `UNHEALTHY_UGM3 = 55.5` (strict `>` for hours-above; `>=` for z_R and latch);
inhalation 1.62 m³/h walking / 0.61 resting (EPA EFH 2011; sweeps 1.2–2.0 / 0.4–0.8);
county filter "Multnomah"; anchor 2020-09-07T00:00.

### 2.5 Shelters & policy

| name | type | GUI default | fallback | meaning |
|---|---|---|---|---|
| `respectShelterOpeningDates` | int 0/1 | 1 | 0 | 1 = real open windows (OCC 09-10, CJ 09-11; V23); 0 = all open at tick 0 (A-02 counterfactual) |
| `triageReserveFraction` | double | 0.0 | 0.0 | per-site `floor(capacity × f)` held for mobility-limited (arm D); 0.0 = FCFS bit-identical; used {0, .10, .15, .25} |
| `shelterPolicyVariant` | int | — | 0 | 1 = `_elayer.csv` with recorded pet_intake (fail-fast if absent, V45) |
| `petPolicyDefault` | int | — | **1 (admit — inert)** | policy for sites with no recorded pet_intake; ER arms set 0 = refuse (A-29) |
| `shelterArrivalDistanceM` | double | 200.0 | n/a | **DEPRECATED (V-ARRIVAL): dead — manifest-only.** Arrival is exact path consumption |

### 2.6 Decision layer (Phase E, V29–V45; all batch-only, defensive)

| name | type | fallback | baseline-real (ER) | sweep | meaning |
|---|---|---|---|---|---|
| `enableDecisionLayer` | int | 0 | 1 | {0,1} | master switch (V44); 0 = legacy verbatim |
| `pAwareInit` | number | 1.0 | 0.356 | 0.25–0.47 | P(aware at t0) (V29, Hines 2021 26/73) |
| `pHeavyBelongings` | number | 0.284 | 0.284 | 0.108–0.46 | V31; barrier only, never speed |
| `pHasPet` | number | 0.117 | 0.117 | 0.055–0.12 | V32 (Henwood 2020) |
| `pHasDependents` | number | 0.0044 | 0.0044 | 0.004–0.03 | V33 (HUD 2025 PIT 30/6831) |
| `lambdaOutreachPerDay` | number | 0.0 | 0.0 | 0–0.2 | daily unaware→aware rate, evaluated hourly λ/24 (V41) |
| `informationRegime` | int | 0 | 1 | {0,1} | 0=L0 omniscient; 1=L1 locations-only + belief set (V42) |
| `enableHazardDeparture` | int | 0 | 1 | {0,1} | 1=logistic hazard; 0=latch (V44) |
| `sigmaTheta` | number | 0.0 | 1.0 | 0.5–1.5 | SD of persistent trait θ (V35); also gates push-through |
| `alphaHazard` | **double** (neg!) | −8.0 | −8.0 | ±1 | hazard intercept (V38, A-30 provisional) |
| `bRisk` | number | 0.4 | 0.4 | 0.25–0.55 (wide 0.2–0.8) | weight on z_R (V36) |
| `wOfficial` | number | 1.1 | 1.1 | 0.6–1.7 | weight on shelter-open cue (V37; OR 4.21 → ln 1.44 ceiling) |
| `gammaVuln` | number | 0.0 | 0.25 | 0–0.5 | vulnerability amplification of bRisk (V39, **Coughlan 2022** — never "Evers"); inert without heterogeneity |
| `riskHalfLifeH` | number | 48.0 | 48.0 | 12–72 | z_R decay half-life (V36) |
| `barrierBelongings` | number | 0.0 | 0.26 | 0.10–0.42 | per-barrier log-odds cost (V40, Tanim 2022) |
| `barrierPet` | number | 0.0 | 0.26 | 0.10–0.42 | ditto (only when world default refuses pets) |
| `barrierDependents` | number | 0.0 | 0.26 | 0.10–0.42 | ditto |
| `betaTravelTime` | number | 1.0 | 1.0 | swept ±2 orders | βT in V_j (V43) |
| `betaCapacityPrior` | number | 0.0 | 0.2 | ditto | βS, ln(capacity) prior (A-32) |

Hardcoded: `UNCAPPED_CAPACITY_PRIOR = 10000`; `MAX_RETARGETS = 8`; z_R increment 1/24;
outreach divisor 24; `DecisionConfig` constructor arg order is positional and must not be permuted:
`(informationRegime, enableHazardDeparture, alphaHazard, bRisk, wOfficial, gammaVuln, sigmaTheta,
riskHalfLifeH, lambdaOutreachPerDay, barrierBelongings, barrierPet, barrierDependents,
petPolicyAdmitDefault, betaTravelTime, betaCapacityPrior, pushThetaThreshold, kPush, pStuck, stuckDelayH)`.

### 2.7 Closures / Scenario-E obstacle layer (V46–V51; batch-only)

| name | type | fallback | SE/SE2 value | sweep | meaning |
|---|---|---|---|---|---|
| `closuresCode` | int | 0 | 1 / 3 | {0..3}, throws outside | 0=none; 1=base (1 wave @ h79, 18 edges); 2=extreme (2 waves, 34); 3=worst family (6 waves, 72 edges, first wave h2–6) |
| `closureDraw` | int | 1 | 1 (E18 also 2,3) | 1–3, throws if code 3 & outside | picks pre-committed `closures_E_r<d>_worst.csv`; NO runtime RNG |
| `pStuck` | number | 0.3 | 0.3 | 0.1–0.5 | P(pusher delayed) (V49/A-35), per-agent decision stream |
| `stuckDelayH` | number | 3.0 | 3.0 | 1–6 | delay hours at resting ventilation (V50) |
| `pushThetaThreshold` | **double** (neg!) | −0.25 | −0.25 (executed 0.0 in archived runs — parser defect, inert) | −0.5…+1.0 | push iff θ_scaled ≥ threshold + kPush·(c_i + mobilityPenalty) (V51) |
| `kPush` | number | 1.0 | 1.0 | 0.5–2.0 | burden coupling in push rule |

### 2.8 Batch-file format note

Batch XML: `<parameter name type="constant" constant_type="int|number|double" value=.../>`.
**Repast zeroes NEGATIVE `constant_type="number"` values** — negatives must be `"double"`
(§6.7.4). Generator auto-promotes. Repast batch schema comes from the batch file, not
parameters.xml — hence the defensive-fallback pattern.

---

## 3. Premade scenario bundles (exact parameter sets)

### 3.1 scenarioCode registry (label + shelter CSV only; severity lives in §2.7 params)

| code | scenarioName | shelter CSV (`data/shelters/…`) |
|---|---|---|
| 0 / any unmatched | `A_present_day_reality` | `shelters_2026_current_placement.csv` (36 sites, 2,234 beds) |
| 1 | `B_capacity_meets_demand_real_locations` | `shelters_2026_expanded_capacity.csv` (36 sites, 6,842) |
| 2 | `C_existing_expanded_plus_new_optimized_sites` | `shelters_2026_expanded_plus_new_sites.csv` (46 sites, 6,842) |
| 3 | `HISTORICAL_capacity_reference_not_a_scenario` | `shelters_2020-09.csv` (2×99 beds; calibration) |
| 4/5/6 | `CRANDOM_r1/r2/r3` | `shelters_2026_random_sites_r{1,2,3}.csv` |
| 7 | `D_need_based_admission_real_locations` | arm B's file + `triageReserveFraction > 0` |
| 8/9/10 | `CRANDOMPOOL_r4/r5/r6` | `shelters_2026_random_sites_r{4,5,6}.csv` |
| 11–14 | `BSWEEP_s080/s120/s140/s160` | `shelters_2026_bsweep_s{080,120,140,160}.csv` |
| 15–17 | `BSWEEP_s105/s110/s115` | `shelters_2026_bsweep_s{105,110,115}.csv` |
| 18/19/20 | `E18/E19/E20` severe labels | A's / C's / B's file (E20 + reserve; severity from smoke/closure params — label-only warning if smokeSeriesCode=0) |

Historical remap trap: code 2 meant "historical" pre-redesign; trust the code, not stale comments.

### 3.2 Common core (every 2026 batch file)

```
numAgents=6842, minutesPerTick=1.0, walkingSpeedMps=1.30, shelterArrivalDistanceM=200.0,
evacuationThresholdUgM3=55.5, enableHeterogeneity=1, respectShelterOpeningDates=1
```

### 3.3 Bundles

| Bundle | = core + | Notes |
|---|---|---|
| **A/B/C three-arm** | `simulationHours=312`; scenarioCode 0/1/2; seeds 42–50 | headline experiment; no E/SE params (all inert fallbacks) |
| **Official baseline** | `numAgents=50`, seed 42, 312 h, nothing else | falls back to code 0, het 0, dates 0 (pre-round-4 archive) |
| **Historical ref** | `numAgents=2037`, scenarioCode 3, seed 42, 312 h | GUI demo variant: numAgents=500 |
| **Arm D triage** | 312 h, scenarioCode 7, `triageReserveFraction ∈ {0,.10,.15,.25}`, seeds 42–44 | |
| **C-random / pool** | 312 h, codes 4–6 / 8–10, seeds 42–44 | site randomness baked offline into CSVs |
| **Bed sweep** | 312 h, codes 11–17, seeds 42–44 | |
| **Window arms** | codes 0/1/2, `simulationHours ∈ {24, 72}`, seeds 42–44 | |
| **E0 null (R3 vehicle)** | 312 h, seed 42, codes 0/1/2 + E-block all degenerate (below) | must be byte-identical to archived A/B/C |
| **ER baseline-real** | 312 h, codes {0,2,7} (D + reserve 0.10), seeds 42–44 + E_REAL block | |
| **SE severe v1** | ER verbatim, codes 18/19/20 (E20 + reserve), **`simulationHours=455`**, `smokeSeriesCode=1, smokeScale=1.0, closuresCode=1, pStuck=0.3, stuckDelayH=3.0, pushThetaThreshold=-0.25 (double), kPush=1.0` | SEnc control: same but `closuresCode=0` |
| **SE2 worst-plausible** | SE with `smokeSeriesCode=2, closuresCode=3, closureDraw=d` — E18 × d∈{1,2,3}, E19/E20 × d=1, seeds 42–44 | SE2nc control: `closuresCode=0`, no closureDraw |

E0-null E-block (decision layer ON, everything degenerate):
```
enableDecisionLayer=1, pAwareInit=1.0, pHeavyBelongings=0.284, pHasPet=0.117,
pHasDependents=0.0044, groupSpeedDeltaMps=0.0, lambdaOutreachPerDay=0.0, informationRegime=0,
enableHazardDeparture=0, sigmaTheta=0.0, alphaHazard=-8.0, bRisk=0.4, wOfficial=1.1,
gammaVuln=0.0, riskHalfLifeH=48.0, barrierBelongings=0.0, barrierPet=0.0, barrierDependents=0.0,
petPolicyDefault=1, betaTravelTime=1.0, betaCapacityPrior=0.0, shelterPolicyVariant=0
```
E_REAL = E0 null with:
```
pAwareInit=0.356, groupSpeedDeltaMps=0.06, informationRegime=1, enableHazardDeparture=1,
sigmaTheta=1.0, gammaVuln=0.25, barrierBelongings=0.26, barrierPet=0.26, barrierDependents=0.26,
petPolicyDefault=0, betaCapacityPrior=0.2, shelterPolicyVariant=1
```
Reporting rule (V48/A-34): closure effects reported as a **range across draws**, never one schedule.

---

## 4. Data pipeline

### 4.1 Inputs, load order, schemas

| # | File | Loaded by | Schema / consumed columns |
|---|---|---|---|
| 1–2 | `data/registry/variables.csv` (55 rows, 16 cols), `assumptions.csv` (35 rows, 8 cols) | `ScienceRegistry.load` via `readStrict` | governance fail-fast (vocab: evidence M/L/C/A/F; statuses; affects_* yes/no; L/M need doi; L/C need uncertainty; `assumption` class needs sensitivity_plan). NOT in data_version_tag |
| 3 | `data/Streets.shp/.dbf/.shx/.prj/.cpg` (51.7 MB) | GeoTools | 112,070 POLYLINE features, EPSG:3857 → reprojected WGS84. Only 5 of 40 DBF fields read: `TYPE` (freeway filter {1110,1120,1121,1122,1123}: 2,636 features / 614 km excluded), `FULL_NAME`, `STREETNAME`, `PDX_F_NODE`, `PDX_T_NODE`. `LENGTH`/`Shape_Leng` deliberately unused (weights recomputed geodesically) |
| 4 | smoke CSV per `smokeSeriesCode` | SmokeField | EPA AQS dialect: UTF-8 **BOM**, CRLF, QUOTE_ALL, 24 columns; consumed: County Name, Date Local, Time Local, Sample Measurement. Observed: 4,795 rows, 576 Multnomah slices. Severe v1/v2: 3,890 rows, exactly **456 slices**, deterministic transforms (v1 scale 1.75 stretch 1.5; v2 scale 4.436), provenance JSON sidecars ("CONSTRUCTED COUNTERFACTUAL — NOT MEASURED DATA") |
| 5 | shelters CSV per §3.1 | `CsvLoader.read` | 2020 file 15 cols; 2026 files 21 cols; `_elayer` 22 (+`pet_intake`: admit/refuse/blank). Consumed: `shelter_id, name, capacity` (blank→null=unlimited), `status` ("operating" case-insens.), `lon, lat, opened, closed` (ISO; close +1 day offset), optional `pet_intake`, `adults_only` (no committed file has it) |
| 6 | closures CSV (only if code≠0) | `CsvLoader.read` | header `node_a,node_b,activation_hour,label,kind`; first 3 parsed (Long/Long/Int, trimmed); malformed row / negative hour → throw; hour ≥ end → WARN inert |
| 7 | `data/encampments/irp_campsite_reports_sample.csv` | `CsvLoader.read` | 3,400 rows; `lon,lat,inc_date,inc_id,is_vehicle`; consumed lon/lat/inc_id; malformed silently skipped; 2025–26 temporal proxy for Sept 2020 (A-03, runtime WARN) |

Not read by Java: provenance sidecars, `shelters_multnomah_2026.csv`, `geocode_cache_2026.json`,
`retired/*`.

### 4.2 CsvLoader semantics (must match exactly — do NOT swap in an RFC-4180 library)

UTF-8 explicit decode (in TS: `new TextDecoder("utf-8", { ignoreBOM: true })` — the DEFAULT decoder
deletes a leading BOM, which Java does not; see WP5-F1); leading U+FEFF stripped from the header line only; blank lines skipped; hand-rolled quote state machine
(`""` escape, quote may open mid-field, no multi-line quoted fields — line-by-line reads);
**every field `.trim()`ed** including quoted content; short rows padded with `""`; extra fields
silently dropped; duplicate headers last-wins (`read`) / throw (`readStrict`); trailing empty field
after final comma produced; unterminated quote emits accumulated text.

### 4.3 Web-build preprocessing

- **Streets → compact binary graph asset** (build-time, not browser): bake the corrupt-ID
  correction offline (it depends on record order; re-running it client-side is pointless risk).
  Ship: node table (id incl. negatives, lon/lat), edge records (from, to, geodesic lengthM
  precomputed, type-class/freeway bit, name index), **polyline vertices** (agents visually walk
  them; delta-encoded int32 fixed-point). Estimate ≈ 6–8 MB flat / **~1.5–2.5 MB wire** vs 51.7 MB
  shapefile.
- **Smoke → precomputed hourly array per series** (≤ 608 floats, ~5–10 KB JSON each) with exact
  SmokeField mean/NaN semantics; keep raw CSVs server-side for provenance; port the reducer only if
  "upload your own AQS CSV" is wanted.
- **Ship verbatim** (tiny): all shelters CSVs (~230 KB), closures (~10.6 KB), registries (~77 KB,
  only if governance surface is kept).
- **Encampments**: model needs (lon, lat, inc_id) only — but see risk register R1 before shipping raw.
- Semantics that survive any format change: trim/BOM/padding; capacity blank = unlimited;
  close-date +1 day; floor() triage reserve; freeway TYPE set; name fallback; `getGeometryN(0)`;
  NaN-gap→0+counter; `min(simulationHours, hours())` cap; closure fail-fasts + FIRST_PRIORITY;
  STRtree NN in degree space.

---

## 5. Output & metrics schema

Written at run end to `output/run_seed<seed>/` (same seed → same dir → **overwrite**; arm renames
are a manual operational step). All numeric formatting `Locale.US` fixed-precision; `%n` = CRLF on
Windows; UTF-8 no BOM. Append-only contract (D-2): columns only ever appended.

### 5.1 `agents.csv` — 59 columns **[RESOLVED — verified header]**

Order: `agent_id, sim_id, commit, random_seed, data_version, starting_encampment, start_lon,
start_lat, shelter_reached, reached_shelter, time_started_tick, time_started_local,
time_arrived_tick, time_arrived_local, travel_time_min, total_travel_distance_m,
network_dist_to_shelter_m, avg_pm25_ugm3, peak_pm25_ugm3, cumulative_dose_ugm3h,
exposure_while_traveling_ugm3h, vwe_ugm3h, hours_above_unhealthy, age, asthma, copd, age_rr,
comorbidity_rr, final_state, planned_route_m, snap_gap_m, door_refusals, scenario` (33) +
heterogeneity block (11): `walking_speed_mps, age_years, age_band, sex, mobility_limited,
mobility_category, asthma_flag, copd_flag, any_respiratory, chronic_physical, vulnerable_flag` +
(5): `air_volume_breathed_m3, mean_ventilation_m3h, inhaled_dose_ug, health_risk_multiplier,
health_risk_score` + Phase-E block (6): `aware_initial, aware_tick, heavy_belongings, has_pet,
has_dependents, theta_z` + Scenario-E counters (4): `blockages_encountered, push_throughs,
reroutes, stuck_events`. Archived pre-Phase-E families carry the first 49 only.

Key cell semantics:
- Row order = Repast context iteration order (byte identity requires replicating insertion order).
- Empty-vs-zero: NaN ticks → `""`; het block disabled → exactly 10 commas; dec block → 5 commas;
  SE counters always numeric (0 outside Scenario E). Never fabricate defaults.
- Tick columns `(long)`-cast = **truncation**, not rounding; `*_local` = `timeForTick(...).toString()`.
- `avg_pm25_ugm3 = exposure/outdoorHours` ("" if 0); `travel_time_min = (arr−evac)*minutesPerTick`.
- **`door_refusals` = retargetCount** (name/source mismatch; under-reports — resets on
  REFUSED_ALL_FULL re-entry; use shelters.csv refused_count for totals).
- `theta_z` = RAW standard normal (%.6f); `vwe_ugm3h` numerically ≡ `cumulative_dose_ugm3h`
  (RRs pinned 1.0); `vulnerable_flag` = age≥55 ∨ mobility ∨ asthma ∨ copd ∨ chronicPhysical
  (reporting stratum, NOT a risk score — D-3).
- `scenario` and `name` fields comma-stripped via `csv()` (commas → spaces, no quoting).
- `final_state` vocabulary: `SHELTERED / EN_ROUTE / UNREACHABLE / REFUSED_ALL_FULL / PRE_EVAC / UNAWARE`.

### 5.2 `shelters.csv` — 12 columns

`shelter_id, name, lon(%.6f), lat(%.6f), capacity(""|int), operating(true/false), peak_occupancy,
final_occupancy, refused_count, utilization, mean_travel_dist_m_admitted, policy_refused`.
- `refused_count` **includes** policy refusals; `policy_refused` is the auditable subset.
- `utilization` = final_occupancy / capacity (%.4f; "" if capacity null) — **final, not peak**.
- `mean_travel_dist_m_admitted` over agents with `state==SHELTERED && targetShelter == s`
  (object identity); "" if none.

### 5.3 `simulation.json` — hand-assembled (no JSON library), fixed key order

Top-level: `schema` ("reu-wildfire-shelter-abm/simulation/v1"), `generated_utc` (**actually local
time**), `reproducibility` {random_seed, sim_id (wall-clock — non-reproducible), data_version_tag
(12-hex over the 4-or-5 model inputs), git_commit, java_version, repast_version ("2.11.0" hardcoded),
parameters (all 41 names in fixed order — every new param MUST be added or the manifest lies),
input_datasets [{file, sha256|"unavailable"}], source_integrity {note,
git_working_tree_dirty (true/false JSON bool | "unknown" string; **nested here, not top-level**),
files: 13-entry fixed census}}, `smoke_field` {county, start, hours, peak_hourly_ugm3 %.1f,
out_of_range_lookups}, `closures` ({code:0} exactly, or full census: schedule_file,
scheduled_undirected_edges, matching_graph_edges, wave_hours[], blocked_edges_at_end,
closure_version_at_end), `street_network_validation` (omitted if null; tolerances, counts,
corrections[]), `governance` (omitted if null; registry SHAs, evidence census M/L/C/A/F,
placeholder + blocking ids), `stratified_exposure` (omitted if sampler null; 7 strata × member
true/false = 14 entries: vulnerable_any, age55plus, mobility_limited, asthma, copd, any_respiratory,
chronic_physical; per entry n, sheltered_share, mean exposure/travel/time/speed; **empty stratum
prints bare `NaN` → invalid JSON — known defect**), `scenario`, `population_sampling`
({heterogeneity:false} | realised marginals + published_targets), `decision_layer`
({enabled:false} | realised shares incl. any/compound barrier), `population` (state census incl.
appended `unaware`; exposure stats {mean, median, min, p25, p75, p90, max, total, gini};
vwe {mean, median, total, gini}; total_person_hours_above_unhealthy; travel_m {mean, median, max}),
`shelters` [{id, capacity(int|null), operating, peak_occupancy, final_occupancy, refused}]
(no policy_refused here — CSV only).

### 5.4 Statistics formulas

- Percentile: sorted copy, linear interpolation `idx = p/100·(n−1)` (≡ numpy `method='linear'`);
  median = pct(50). Empty → 0. mean empty → 0; min init +∞ (empty → 0); **max init 0**.
- Gini: full O(n²) mean-absolute-difference `ΣΣ|xi−xj| / (2n²μ)`; 0 if n==0 or μ==0. (Sorted
  O(n log n) equivalent is mathematically identical — acceptable substitution for large n.)
- `jsonEsc` escapes only `\` and `"` (control chars/newlines would corrupt JSON); `jsonVal`:
  Number/Boolean bare, null → null, else quoted.

### 5.5 Byte-identity checklist for the output layer

Java `%.Nf` uses HALF_UP decimal rounding — JS `toFixed` rounds the binary double (ties differ:
`(0.615).toFixed(2)` → `"0.61"`); need a Java-compatible formatter. `(long)` casts → `Math.trunc`.
Environment-dependent manifest fields (git_commit, dirty flag, java_version, generated_utc, sim_id,
SHA-256s) need a browser policy (build-time embed / "unavailable" / schema bump).

---

## 6. Validation assets

### 6.1 Golden runs (375 MB under `docs/runs/`, full per-agent CSVs)

| Family | Dirs | Content |
|---|---|---|
| `present-day-three-arm/` | {A,B,C}-seed{42..50} (27) | headline; commit deddfca, U-27 graph |
| `phase-e/` | 3 E0 nulls + ER-{A,C,D}-seed{42,43,44} (12) | R3 nulls + baseline-real |
| `scenario-e/` | nulls + SE/SEnc × E{18,19,20} × 3 seeds (21) | severe v1 |
| `scenario-e-v2/` | nulls + SE2 (E18×d{1,2,3}, E19/E20×d1) + SE2nc (27) | worst-plausible v2 |
| `phaseD-bed-sweep/` (21), `phaseD-windows/` (18), `scenario-d-2026/` (8), `scenario-crandom-2026/` (18), `historical-reference/`, `final-baseline/` | | |

Each dir: `agents.csv` (6,843 lines in n=6842 families), `shelters.csv`, `simulation.json`.

Seed-42 headline (machine-readable: `docs/final/results-2026/6_SEED_ROBUSTNESS.csv`):

| | A | B | C |
|---|---|---|---|
| sheltered | 2,060 (30.1%) [2,053–2,064] | 6,264 (91.6%) | 6,570 (96.0%) |
| refused_all_full | 4,754 | 550 | 244 |
| unreachable | 28 [26–36] — **identical across arms within a seed** (pure graph property) | 28 | 28 |
| mean walk (m) | 18,244 | 7,896 | 5,904 |
| person-hours unhealthy | 928,918 | 119,973 | 59,200 |
| mean exposure (µg·m⁻³·h) | 37,802 | 4,789 | 2,363 |

Hand-checkable unit-test facts: never-sheltered resident exposure = **54,002.8 µg·m⁻³·h** exactly
(avg 173.09, peak 562.7, hours_above 194.0); resting dose = exposure × 0.61 to FP precision;
graph: 109,434 edges, 88,100 nodes, 171 components (largest 59,725), 2,636 freeway features / 614 km
removed; wormhole fix: impossible edges 50→0, max endpoint gap 18.5 km→11.9 m, **3 reattached,
22 split synthetic** (25 affected attribute ids; synthetic ids −1000…−1021). The widely quoted
"27 / 4 / 23" is the **pre-U-27** graph (112,070 features → 89,345 nodes, 154 components, largest
60,444) and does not describe any archived run — measured both ways in DR-S2. Realised marginals at
n=6,842 (`%.4f`, OutcomeLogger order mobility / asthma / COPD / any-resp / 55+ / mean speed):
**seed 42** 0.1988 / 0.1478 / 0.1079 / 0.2381 / 0.2622 / 1.2805 (52 archived manifests);
seed 43 0.1995 / 0.1523 / 0.0978 / 0.2343 / 0.2562 / 1.2796; seed 44 0.2093 / 0.1481 / 0.1004 /
0.2331 / 0.2726 / 1.2752. The previously quoted "0.195 / 0.147 / 0.104 / 0.235 / 0.259 / 1.280 at
seed 42" is **seed 48's** row (`docs/runs/present-day-three-arm/A-seed48`) — finding F1-F1,
re-derived from the certified sampler in `DR-F1-world-fixtures.md`.

### 6.2 Gates a port's test suite should reimplement (from `scripts/verify_E_runs.py`)

Identity is defined on **raw text** (`dtype=str, keep_default_na=False`) — byte-identical fields.
(a) **R3 null identity**: column delta ⊆ {E block, SE block, policy_refused}; key sets equal;
shared-projection byte-identity (excluding only `sim_id`, `commit`, wallclock-regex columns —
**never** `time_started_local`/`time_arrived_local`, `random_seed`, `data_version`); null has
all-zero SE counters, `unaware == 0`, zero policy refusals; population census identical.
(b) **U-03 bed sum** (4-way): Σ final_occupancy == population.sheltered == count(reached=="yes")
== count(final_state=="SHELTERED").
(c) **Asthma negative control** (stratum copd==0 & mobility==0): speed |Δmean| ≤ 0.02 m/s; dose
|z| ≤ 3; timing observed, never gated (V39: asthma → timing only, never gait, never dose).
(d) **Terminal-state conservation**: vocabulary closed; counts sum to n and to numAgents; per-state
CSV == manifest.
(e) **UNAWARE immobility**: travel 0, empty start tick.
(f) **Wachinger acceptance** (E arms): ≥ 1 high-barrier resident (≥2 barriers, or heavy+pet) still
UNAWARE/PRE_EVAC at end — monotone risk-only triggers forbidden.
(g) **E-census plausibility**: realised vs configured within 3 binomial SE + 1e-4 rounding slack;
manifest census == CSV means.
(h) **Manifest completeness**: all 21 E params present; `git_working_tree_dirty is False` (identity).
(i) 7 SE params present; closureDraw only when code 3.
(j) **Severe-series provenance**: series CSV in input_datasets; hours == 456;
|peak − series_peak × smokeScale| ≤ 0.06; **out_of_range_lookups == 0** (the gate that caught 456-vs-455).
(k) **Closure census vs schedule CSV**: code match; code 0 ⇒ block == {"code"}; scheduled ==
matching == row count; blocked_edges_at_end == distinct undirected pairs; version == wave count;
wave_hours == sorted distinct hours.
(l) **Counter identities**: code 0 ⇒ all four SE counters zero-sum; else per row
`blockages == push_throughs + reroutes` and `stuck_events ≤ push_throughs`; stuck share within
3 SE of pStuck.

Plus from `verify_2026_runs.py`: capacity sums per arm (A 2,234; B/C 6,842; sweep caps 5474…10947);
data_version_tag constant within arm; population byte-identical across arms within a seed (POP_COLS
hash); UNREACHABLE id-set hash identical across arms within seed; U-19 negative controls at 3 SE
per-run / 2 SE pooled. From `analyze_run.py` (32 + 2n checks): recomputed stats within atol 0.51
(gini 5e-3); `vwe ≡ dose` row-wise < 1e-6; travel-time identity < 0.05; per-agent
peak ≤ field peak + 0.01, avg ≤ peak + 0.01; all RRs 1.0; walked ≤ planned + snap + 200 m
(observation; max residual seen 8.9 m).

Generator self-checks reusable as fixtures: smoke builder 19 checks/series (byte round-trip,
determinism, every value = scale × observed, episode structure); closure builder S1/S2/S3
connectivity gates at every cumulative wave state (A-34: closures can never isolate a shelter door).

### 6.3 R3 strategy for the port (honest assessment)

Java-archive byte-identity requires: bit-exact `java.util.Random`, bit-exact colt MersenneTwister,
**and Repast's per-tick shuffle algorithm** — the shuffle is outcome-relevant because capacity binds
in arm A (A-16 is a BLOCKING assumption valid only while capacity never binds). Recommended tiers:
1. (Optional, expensive) full structural identity vs `docs/runs/present-day-three-arm/A-seed42/`.
2. (Baseline) **own-engine R3**: TS degenerate-config run must be byte-identical to the TS
   no-layer run on the shared-column projection, same exclusion discipline.
3. (Always) statistical cross-validation vs the 375 MB archive: sheltered counts within 9-seed
   ranges; unreachable identical across arms; realised marginals; the 54,002.8 exposure identity;
   dose = exposure × 0.61 resting.

### 6.4 The four never-regress gotchas

1. **Evers → Coughlan (V39)**: γ_vuln sign is sourced to Coughlan, Huber-Stearns, Clark & Deak 2022
   (EWP WP 111, UO/OHA, n=1,200, Scholars' Bank 1794/27179); "Evers et al. 2022" **does not exist**
   — any reappearance is a regression. Magnitude is an assumption swept 0…+0.5.
2. **Palisades correction (V47/A-33)**: the phrase "comparable to the Palisades worst hour" is
   **FALSE — never use it** (LA regulatory hourly max 301.1 < Portland's observed 562.7). v2's
   anchor is Canberra Florey 2,496.1 µg/m³ (5–6 Jan 2020, ACT dataset 94a5-zqnn); scale
   4.436 = 2496.1/562.7. Synthetic series must always carry "CONSTRUCTED COUNTERFACTUAL — NOT
   MEASURED DATA" labels in any UI.
3. **`simulationHours ≤ slices − 1`**: the inclusive final tick reads hour index ==
   simulationHours; overrun silently books fabricated-zero lookups (caught only by the
   out_of_range_lookups == 0 gate). Observed 576 slices / 312 h (slack hid it); severe files 456
   slices / **455 h**.
4. **Repast batch zeroes negative `"number"` constants** → use `"double"` (affected: alphaHazard,
   pushThetaThreshold; archived SE/SE2 manifests truthfully record executed
   pushThetaThreshold = 0.0 — inert, zero blockage events occurred). Port-transferable lesson:
   **emit an executed-parameter manifest distinct from the UI/preset config** so silent coercions
   (clamped slider, NaN parse) stay visible.

### 6.5 Secondary standing facts

`door_refusals` under-reports (use shelters.csv); V11 stale for retargeted agents (test_routing.py
fails on current output *by design*); `generated_utc` is local; sha256 "unavailable" on failure is
silent; two peak figures (562.7 mean vs 588.9 single-monitor); 55.5 is a concentration threshold,
never an AQI category; **V51 measure-zero result** — all 24 closure runs recorded zero blockage
events (closures act entirely through rerouted geometry at documented severities); claim linter
(`lint_claims.py` + `docs/claims.yaml`) bans retired phrases ("37/37", "resolvable DOI", etc.).

---

## 7. Port risk register (deduplicated, ranked)

| # | Risk | Severity | Notes / mitigation |
|---|---|---|---|
| R1 | **Encampment data ethics**: 3,400 precise current (2025–26) coordinates of complaint-reported homeless encampments + linkable `inc_id`, carried into every output row. Public data but publishing an interactive map creates targeting/sweep-facilitation risk. | Critical (ship-blocker for public deploy) | Ship a derived product: snap/dedupe/jitter or ~100 m grid, replace inc_id with opaque hash; or gate raw layer behind non-public deployment |
| R2 | **RLIS streets license unverified for redistribution** — a derived graph asset is redistribution. | Critical (ship-blocker) | Resolve with Metro, or rebuild from OSM (breaks node ids, corrupt-ID quirk, and Java-archive reproducibility) |
| R3 | **Bit-reproducibility scope**: Repast tick-shuffle algorithm + colt MersenneTwister + `java.util.Random` all load-bearing; shuffle decides admissions when capacity binds. | High | Decide fidelity tier (§6.3) before engine design; per-agent decision streams already shuffle-invariant |
| R4 | **Java number formatting**: `%.Nf` HALF_UP vs JS toFixed binary rounding; `(long)` truncation; Locale.US; CRLF. Byte-level output parity needs a custom formatter. | High (if CSV parity is a goal) | Implement Java-compatible decimal formatter; Math.trunc |
| R5 | **Performance**: 6,842 agents × 27,300 ticks; per-wave recompute = 36–46 Dijkstra SSSPs over 88k nodes (tens of seconds in Java); O(n²) Gini. | High | Web worker / WASM; typed-array graph; sorted-Gini substitution (identical math); per-tick param reads should be hoisted (Java re-reads every tick — semantics, not necessity) |
| R6 | **Geodesic math**: GeographicLib Karney on WGS84 ellipsoid (Inverse + Direct), not haversine; (lat,lon) argument swap everywhere; left-to-right FP accumulation order. | High | Use geographiclib-js (same algorithm); verify double-for-double vs Java on sample pairs |
| R7 | **Two parameter-default sets disagree** (GUI = study config; batch fallbacks = archived baseline). A fresh UI run must pick one; presets must set explicit values regardless. | High | Make presets fully explicit (generator philosophy: "a difference between two files is the only thing that can explain a difference between two runs") |
| R8 | **Order-dependence everywhere**: shapefile record order (node correction, synthetic ids, adjacency, tie-breaks), shelter CSV order (wave recompute), creation order (all sampler streams), context iteration order (CSV rows, L0 ties). | High | Bake graph offline; preserve explicit ordered lists; never iterate unordered maps for anything outcome-relevant |
| R9 | **Executed-vs-configured manifest**: browser lacks git/SHA/env fields; and the negative-zeroing incident shows why executed params must be recorded independently of the UI config. | Medium-High | Embed build-time provenance; always emit executed-parameter manifest |
| R10 | **Quirks: reproduce or fix (decide consciously, per-item)**: NaN in empty-strata JSON (invalid JSON); `door_refusals` naming; utilization uses final occupancy; `generated_utc` local; max() init 0; jsonEsc incomplete; sha256 "unavailable"; double concentration lookup / outOfRangeLookups double-count; closed-door arrival not counted refused. | Medium | Default: reproduce for validation parity, then fix behind a schema bump |
| R11 | **CsvLoader dialect**: trim-all (incl. quoted), BOM, padding, extra-field drop, dup-header last-wins, no multiline quotes. A standard CSV lib breaks parity. | Medium | Port the loader (~100 lines) |
| R12 | **Dijkstra tie-breaking** (strict `<` + Java binary-heap pop order) affects path geometry (not distances) at exact ties. | Medium | Implement identical binary heap; ties rare with geodesic doubles but not impossible |
| R13 | **STRtree nearest-neighbour in planar degree space** (snapping + reattach) — using geodesic NN would snap differently near-equidistant nodes. | Medium | Reproduce degree-space metric exactly |
| R14 | **smokeScale slider semantics**: construction-time scaling with NaN preservation; series 1/2 already embed transforms (effective severity = embedded × slider). UI must not double-apply or fabricate zeros. | Medium | Rescale stored array; show effective severity |
| R15 | **`scenarioCode` no fail-fast** (unknown → arm A silently) vs fail-fast smoke/closure codes; historical code remap trap. | Medium | UI dropdown eliminates free-typed codes; keep fail-fast asymmetry documented |
| R16 | **Synthetic smoke labeling**: severe series must carry counterfactual labels in the UI (never plotted as measured); Palisades phrasing banned (§6.4.2). | Medium | Label in chart legends + presets |
| R17 | **Off-by-one run length** (§6.4.3): a slider pairing simulationHours with a series must enforce ≤ slices − 1. | Medium | Validate in UI; surface outOfRangeLookups |
| R18 | **Governance layer**: ScienceRegistry fail-fast + manifest blocks — keep, stub, or drop affects manifest schema and comparability. | Low-Medium | Decide early; registry CSVs are also good provenance UI content |
| R19 | **`shelterArrivalDistanceM` is dead** — exposing it as a slider would imply behavior that doesn't exist. | Low | Omit or mark manifest-only |
| R20 | **Repast-specific behaviors that vanish**: batch negative-number defect, `%n` platform dependence, wall-clock sim_id. Don't cargo-cult; document divergences. | Low | Schema/versioning note |

---

## Cross-file linkage quick map

- Engine: `agents/GisAgent.java` (1,040 ln), `agents/ContextCreator.java` (1,006 ln),
  `routing/StreetNetwork.java` (674 ln), `env/SmokeField.java`, `agents/Shelter.java` (208 ln),
  `agents/PopulationSampler.java`, `agents/ELayerSampler.java`.
- I/O: `data/CsvLoader.java` (159 ln), `output/OutcomeLogger.java` (817 ln),
  `science/ScienceRegistry.java` (317 ln).
- Specs: `docs/final/TECHNICAL_REFERENCE.md`, `docs/critique-response/E-LAYER-SPEC.md`,
  `14-SCENARIO-E-SPEC.md`, `13-PHASE-E-PREDICTIONS.md`, `docs/validation/STREET_NETWORK_VALIDATION.md`.
- Verifiers: `scripts/verify_E_runs.py`, `verify_2026_runs.py`, `analyze_run.py`,
  `test_routing.py`, `score_scenarioE.py`, `lint_claims.py`.
