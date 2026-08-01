# WP8-SPEC-closures — the Scenario-E closures runtime, specified from the certified Java

**Status:** specification only. No WP8 code exists yet. WP6 shipped
`engine/src/closures/schedule.ts` (parse-time), WP5 shipped
`engine/src/graph/blocked.ts` + `dijkstra.ts` (the blocked-edge substrate), and WP7 shipped
`engine/src/agents/step.ts` with steps 9–10 deliberately empty. This document is the
contract those three must be joined by.

**Authority.** Everything below is derived from, and cites, the certified Java. Where this
document and `PORT_MAP.md` §1.6.3 disagree, the Java wins and the disagreement is flagged
in [§16 QUIRKS](#16-quirks).

**Primary sources (read at commit `de7c045`):**

| file | what it owns |
|---|---|
| `Geography/src/geography/agents/GisAgent.java` | agent fields 192–226, exposure/ventilation 328–359, steps 9–10 at 484–504, `reactToClosureWave` 745–841, `pairKey` 843–848 |
| `Geography/src/geography/routing/StreetNetwork.java` | blocked set 211–226 + 479–556, `NodePath`/`nodesToSource` 557–607, `computeTree` 609–648, `pathToSource` 650–673 |
| `Geography/src/geography/agents/ContextCreator.java` | schedule load 629–707, `ClosureWave` 927–972, run window 806–809 |
| `Geography/src/geography/output/OutcomeLogger.java` | `ClosureCensus` 63–88, manifest block 336–356, agent counter columns 173–176 |
| `Geography/data/registry/variables.csv` | V48/V49/V50/V51 rows (the honesty notes) |
| `Geography/data/registry/assumptions.csv` | A-34 (schedules), A-35 (push/stuck mechanics) |
| `scripts/verify_E_runs.py` | gates (i)(j)(k)(l), lines 628–765 |
| `docs/runs/scenario-e-closures/*.json` | five certified connectivity reports |

---

## 0. The single most important fact about this work package

**Every certified Scenario-E run recorded ZERO blockage events.** Measured directly from the
archive (48 run directories under `docs/runs/scenario-e/` and `docs/runs/scenario-e-v2/`):
`blockages_encountered`, `push_throughs`, `reroutes` and `stuck_events` sum to 0 in every
single one, including all 15 v2 closure runs at 72 closed edges and 6 waves.

`docs/critique-response/13-PHASE-E-PREDICTIONS.md` (P-SE9 outcome) states the consequence:

> street closures in a hazard-staggered population act entirely through rerouted geometry —
> the face-to-face gamble (V51) is a measure-zero event at ANY documented severity.

The arithmetic: departures spread over ~455 h at 3–8/hour against a median walk of 24 min, so
≈ 4 of 6,842 residents are mid-walk at any wave instant, and none of their routes crossed the
18–72 closed edges among ~109,434.

**What this means for the port, stated bluntly:**

1. `ClosureWave.apply()` **is** validated by the archive — the closure census (gate k), the
   post-wave route geometry, the redistribution of door refusals and the arm-level outcomes
   all depend on it, and they reproduce or they do not.
2. `reactToClosureWave()` **is not** validated by the archive. Gate (l) passes on the
   all-zero branch. The port can therefore ship a completely wrong push/reroute
   implementation and every archived comparison will still be green.
3. So the port must gate `reactToClosureWave` on **synthetic** fixtures (§17), and the UI must
   never present a push/reroute number as archive-validated. The badge state machine
   (plan §5.4) has to treat "blockage events > 0" as an unvalidated regime.

---

## 1. Configuration surface

### 1.1 Parameters (`ContextCreator.java:304-340`, registry V48–V51)

| name | Java type | code fallback | range / fail-fast | read where |
|---|---|---|---|---|
| `closuresCode` | `int` via `intParam` | `0` | `0..3`, else `IllegalStateException` (`:331-335`) | build |
| `closureDraw` | `int` via `intParam` | `1` | when `closuresCode==3`: `1..3`, else `IllegalStateException` (`:336-340`) | build |
| `pStuck` | `double` via `doubleParam` | `0.3` | swept 0.1–0.5 (V49) | `reactToClosureWave` only |
| `stuckDelayH` | `double` via `doubleParam` | `3.0` | swept 1–6 h (V50) | `reactToClosureWave` only |
| `pushThetaThreshold` | `double` via `doubleParam` | `-0.25` | swept −0.5..+1.0 (V51) | `reactToClosureWave` only |
| `kPush` | `double` via `doubleParam` | `1.0` | swept 0.5–2.0 (V51) | `reactToClosureWave` only |

`intParam`/`doubleParam` (`ContextCreator.java:868-888`) catch `RuntimeException` and return
the fallback when a batch schema omits the parameter. That is why the E0-null runs — whose
params file declares none of the six — record `pushThetaThreshold = -0.25` in their
manifests while the SE/SE2 runs, which *do* declare it, record `0.0`. See QUIRK 26.

The last four are consulted **only inside `reactToClosureWave`**, which cannot be reached
without a wave. This is the structural reason every archived non-Scenario-E arm is
bit-identical regardless of their values (`GisAgent.java:135-141`).

### 1.2 Schedule file resolution (`ContextCreator.java:216-225, 640-642`)

```java
closuresCsv = (closuresCode == 3)
        ? CLOSURES_WORST_PREFIX + closureDraw + CLOSURES_WORST_SUFFIX   // data/closures/closures_E_r<draw>_worst.csv
        : (closuresCode == 2) ? CLOSURES_EXTREME_CSV                    // data/closures/closures_E_r1_extreme.csv
                              : CLOSURES_BASE_CSV;                      // data/closures/closures_E_r1.csv
```

Already ported verbatim as `resolveClosuresCsv` in `websim/engine/src/world/scenario.ts:184-195`
(returns `null` for code 0). Note the string concatenation: `closureDraw` is an `int`, so
`"…_r" + 2 + "_worst.csv"` — no zero padding, no formatting.

### 1.3 The committed schedules (measured, not assumed)

| file | rows | distinct undirected pairs | self-loops | activation hours | file sorted by hour |
|---|---|---|---|---|---|
| `closures_E_r1.csv` | 18 | 18 | 0 | `[79]` | yes |
| `closures_E_r1_extreme.csv` | 34 | 34 | 0 | `[79, 150]` | yes |
| `closures_E_r1_worst.csv` | 72 | 72 | 0 | `[3, 44, 72, 142, 265, 303]` | yes |
| `closures_E_r2_worst.csv` | 72 | 72 | 0 | `[5, 92, 130, 163, 214, 263]` | yes |
| `closures_E_r3_worst.csv` | 72 | 72 | 0 | `[2, 35, 37, 40, 75, 76]` | yes |

All five: header `node_a,node_b,activation_hour,label,kind`, CRLF line endings, no BOM, no
duplicate pair, no pair repeated across waves. Every pair matches a graph edge (72/72, 18/18 —
the manifests' `matching_graph_edges`). These are measurements, not invariants: the runtime
must still carry the phantom guard.

---

## 2. What WP6 already produces, and exactly what WP8 consumes

`parseClosureSchedule` (`engine/src/closures/schedule.ts:117-182`) returns:

```ts
interface ClosureSchedule {
  csvPath: string;
  waves: readonly ClosureWave[];        // ascending hour (Java TreeMap)
  scheduledEdges: number;               // every parsed row, phantoms included
  matchingGraphEdges: number;
  waveHours: readonly number[];         // ascending distinct hours
  inertRows: number;                    // ADVISORY ONLY — see QUIRK 1
}
interface ClosureWave {
  hour: number;
  tick: number;                         // hour * ticksPerHour
  edges: readonly ScheduledClosure[];   // FILE ORDER within the hour
  inert: boolean;                       // ADVISORY ONLY — see QUIRK 1
}
interface ScheduledClosure {
  nodeA: number; nodeB: number;         // certified node ids
  indexA: number; indexB: number;       // graph indices, or -1
  matchesGraphEdge: boolean;            // hasEdgeBetween(graph, indexA, indexB)
}
```

`WorldBuildResult.closures` is `ClosureSchedule | null`
(`engine/src/world/build.ts:174, 338-367, 475`). **`closures !== null` is the port's
`network.hasClosureSchedule()`** — Java's `declareClosureSchedule()`
(`StreetNetwork.java:484-491`) is called at build step 9 *before* any resident exists, so the
two are equivalent at every moment a resident can observe them.

WP8 adds, and nothing else:

* a `ClosureRuntime` owning `BlockedEdges`, `closureVersion: number`, the next-wave cursor,
  and the SSSP scratch used for recomputes;
* the FIRST_PRIORITY hook in `Simulation.runUntil` (`engine/src/sim.ts:149`);
* `Resident.routeNodes`, `Resident.seenClosureVersion`, `Resident.pushedBlockages`
  (`stuckUntilTick` and the four counters already exist,
  `engine/src/agents/resident.ts:116-124`);
* `reactToClosureWave` in `engine/src/agents/step.ts` at the marker on line 180.

---

## 3. `ClosureWave.apply()` — the exact algorithm

### 3.1 Scheduling (`ContextCreator.java:680-691`)

```java
ISchedule waveSchedule = RunEnvironment.getInstance().getCurrentSchedule();
for (Map.Entry<Integer, java.util.List<long[]>> w : waves.entrySet()) {
    int hour = w.getKey().intValue();
    closureWaveHours.add(w.getKey());
    waveSchedule.schedule(
            ScheduleParameters.createOneTime(hour * ticksPerHour,
                    ScheduleParameters.FIRST_PRIORITY),
            new ClosureWave(network, shelterList, w.getValue(), hour), "apply");
}
```

* `waves` is a `java.util.TreeMap<Integer, List<long[]>>` (`:644-645`), so `entrySet()`
  iterates in **ascending hour**. Rows sharing an hour are ONE wave (`ArrayList` append,
  file order).
* `ticksPerHour` is the `double` `60.0 / minutesPerTick` computed at `:540`.
* `hour` is an `int`; `hour * ticksPerHour` promotes to `double`. With the pinned
  `minutesPerTick = 1.0` every wave tick is an exact integer (`hour * 60.0`).
* `FIRST_PRIORITY` puts the wave ahead of every RANDOM_PRIORITY agent `step()` on the same
  tick (PORT_MAP §1.2), so all residents that tick observe the same post-wave world
  regardless of shuffle position.
* The method is bound **by name string** `"apply"`. Nothing else on `ClosureWave` is scheduled.

### 3.2 `apply()` (`ContextCreator.java:950-971`) — quoted whole

```java
/** Invoked by the schedule (method name is bound by string). */
public void apply() {
    for (long[] e : edges) {
        // Only pairs that exist as graph edges enter the blocked set:
        // a phantom pair (corrupt-id or filtered feature, warned at
        // load) blocks nothing and must not pad the manifest census.
        if (network.hasEdge(e[0], e[1])) {
            network.blockEdge(e[0], e[1]);
        }
    }
    network.bumpClosureVersion();
    int recomputed = 0;
    for (Shelter s : shelters) {
        s.setRouteTree(network.computeTree(s.getGraphNodeId()));
        recomputed++;
    }
    System.out.printf("[Closures] wave at hour %d: +%d edges blocked "
            + "(%d undirected total); %d shelter trees recomputed; "
            + "closure version now %d%n",
            hour, edges.size(), network.blockedEdgeCount(), recomputed,
            network.getClosureVersion());
}
```

### 3.3 Exact evaluation order — the port's contract

**A. Block.** For each `ScheduledClosure` in `wave.edges`, **in file order**:

1. Guard `network.hasEdge(a, b)` (`StreetNetwork.java:531-542`): scan `adjacency.get(a)` for
   an `Edge` with `e.toNode == b`. Port: `closure.matchesGraphEdge` — computed at parse time
   with the identical predicate `hasEdgeBetween` (`engine/src/graph/csr.ts:114-126`) over a
   graph that never changes, so parse-time and apply-time evaluation are provably equal.
   Re-testing at apply time is also acceptable; **skipping the guard is not** (QUIRK 5).
2. `network.blockEdge(a, b)` (`:493-497`) writes **both halves**:
   `blockedAdj[a].add(b)` and `blockedAdj[b].add(a)`, creating either `HashSet<Long>` on
   demand. Idempotent (`HashSet.add`).
   Port: `blocked.blockPair(closure.indexA, closure.indexB)`
   (`engine/src/graph/blocked.ts:63-73`), which additionally sets the per-directed-record
   `Uint8Array` flag for **every** CSR record matching the pair in either direction.

**B. Bump.** `network.bumpClosureVersion()` — `closureVersion++`, a plain Java `int`
(`StreetNetwork.java:544-552`). It starts at 0 and is bumped **once per wave**, after all of
that wave's edges are in the set and before any tree is recomputed.

**C. Recompute.** For each `Shelter` in `shelterList` — the list built in **shelter-CSV load
order** at `ContextCreator.java:545, 589`, explicitly *not* `context.getObjects` — call
`s.setRouteTree(network.computeTree(s.getGraphNodeId()))`.

* **All rows, including `operating == false`.** The list is appended unconditionally.
* Order is unobservable (Dijkstra is deterministic, per-source, RNG-free), but keep it: it is
  the certified order, it makes the recompute log reproducible, and the port's shelter array
  is already in CSV order (`engine/src/agents/step.ts:70`).
* The tree object is **replaced**. Residents holding a materialised `RouteLeg` are untouched —
  that is the entire mechanism (QUIRK 34).
* Port: `shelter.routeTree = retainTree(computeTree(graph, shelter.graphNode, scratch, blocked))`.
  `retainTree` (`engine/src/graph/dijkstra.ts:217-225`) is mandatory: `computeTree` aliases the
  shared scratch.

**D. Log.** One line. `edges.size()` is the wave's row count *including* phantoms;
`blockedEdgeCount()` is the running distinct-pair total (§4.3).

### 3.4 When a wave fires — and the off-by-one

Run window (`ContextCreator.java:806-809`):

```java
int endHours = Math.min(simulationHours, smokeField.hours());
double endTick = endHours * (60.0 / minutesPerTick);
RunEnvironment.getInstance().endAt(endTick);
```

`endAt` runs the tick it names (PORT_MAP §1.1; the same fact that forces
`simulationHours ≤ slices − 1`). Therefore:

> **A wave fires iff `waveTick <= endTick`, i.e. iff `hour <= endHours`.**

But the load-time warning (`ContextCreator.java:664-668`) fires on `hour >= endHours`:

```java
if (hour >= Math.min(simulationHours, smokeField.hours())) {
    System.out.println("[Closures][WARN] " + closuresCsv + " row " + rowNo
            + ": activation_hour " + hour + " is at/after the run end -- this wave is scheduled but inert.");
}
```

So a wave at `hour == endHours` is **warned as inert and fires anyway**. `ClosureSchedule.inert`
and `inertRows` are ports of the *warning*, not of the firing rule. Using them to skip a wave
is a one-hour silent divergence that also breaks gate (k)'s
`closure_version_at_end == wave count`. See QUIRK 1.

### 3.5 Port pseudocode for the tick hook

Insert at `engine/src/sim.ts:149`, **before** `shuffleMt` (the wave consumes no RNG, so
ordering relative to the shuffle draw cannot change the draw sequence; ordering relative to
the agent loop is mandatory):

```ts
for (let tick = this.tickValue + 1; tick <= stop; tick++) {
  // §1.2 (1) ClosureWave.apply() at FIRST_PRIORITY.
  while (this.nextWave < this.waves.length && this.waves[this.nextWave]!.tick <= tick) {
    this.applyWave(this.waves[this.nextWave]!);   // see 3.3 A-D
    this.nextWave++;
  }
  // §1.2 (2) agents...
}
```

`<= tick` rather than `=== tick` covers a wave at tick 0 (before the first agent tick, which is
1) and is a no-op for every committed schedule. If `waveTick` is not an integer the port must
**throw at build**, not round: Repast executes fractional ticks and this loop cannot
(QUIRK 3). Assert `Number.isInteger(hour * ticksPerHour)` in `parseClosureSchedule`'s caller.

---

## 4. How blocking meets the Dijkstra already ported

### 4.1 `isBlocked` (`StreetNetwork.java:508-517`)

```java
public boolean isBlocked(long a, long b) {
    if (blockedAdj.isEmpty()) {
        return false;
    }
    Set<Long> s = blockedAdj.get(Long.valueOf(a));
    return s != null && s.contains(Long.valueOf(b));
}
```

Keyed by **node pair**, never by street feature. If two features join the same pair of nodes,
blocking that pair blocks both — `blocked.ts`'s `flagHalf` reproduces this by flagging every
matching CSR record, not the first (`engine/src/graph/blocked.ts:75-90`).

### 4.2 The relaxation guard (`StreetNetwork.java:631-637`)

```java
for (Edge e : edges) {
    // Scenario-E closures (V48): a blocked street cannot carry a
    // route. Free when no closure schedule is active — the isEmpty()
    // short-circuit inside isBlocked() is a single boolean test.
    if (!blockedAdj.isEmpty() && isBlocked(node, e.toNode)) {
        continue;
    }
    double nd = d + e.lengthM;
    ...
}
```

Java re-evaluates `!blockedAdj.isEmpty()` per relaxation and relies on `&&` short-circuit.
`dijkstra.ts:108` hoists it to one read per tree:

```ts
const flags = blocked !== undefined && !blocked.isEmpty ? blocked.directedFlags : null;
```

**This hoist is only sound because `apply()` blocks every edge of a wave before it recomputes
any tree.** Nothing mutates the blocked set during a `computeTree` call. Write that
invariant down in the runtime (an assertion, not a comment) — a future "incremental
re-block" optimisation would break it silently.

The blocked edge is skipped **before** `nd` is computed, so a blocked edge contributes nothing
to `dist` and nothing to `predEdge`. Combined with the strict `nd < old` relaxation, this means
a post-wave tree is exactly the tree of the reduced graph — never a repaired version of the old
one. There is no incremental update anywhere in the certified model, and the port must not
introduce one: `blocked.ts`'s two representations (pair-key set + directed flags) exist so the
full recompute stays cheap (DR-S3: 46 trees in 0.12–0.17 s single-threaded), not so a
delta-update becomes possible.

### 4.3 `blockedEdgeCount()` (`StreetNetwork.java:519-526`)

```java
public int blockedEdgeCount() {
    int directed = 0;
    for (Set<Long> s : blockedAdj.values()) {
        directed += s.size();
    }
    return directed / 2;
}
```

`int` division, truncating. For every non-self-loop pair the two halves contribute 2, so this
is the distinct undirected-pair count — which is what `BlockedEdges.size` (`pairs.size`)
returns. They diverge on a self-loop: Java gives `1 / 2 == 0`, the port gives 1. Verified
absent from all five committed schedules; assert rather than assume (QUIRK 4).

---

## 5. Agent-side state WP8 must add

Java fields (`GisAgent.java:192-226`), with the port's shape:

| Java field | type | init | port |
|---|---|---|---|
| `routeNodes` | `StreetNetwork.NodePath` | `null` | `Resident.routeNodes: NodePath \| null` (`graph/paths.ts:50-55`) |
| `seenClosureVersion` | `int` | `0` | `Resident.seenClosureVersion: number` |
| `stuckUntilTick` | `double` | `Double.NaN` | **exists**, `resident.ts:124` |
| `pushedBlockages` | `Set<String>` | `null` | `Resident.pushedBlockages: Set<string> \| null` |
| `blockagesEncountered` | `int` | `0` | **exists**, `resident.ts:120` |
| `pushThroughs` | `int` | `0` | **exists**, `resident.ts:121` |
| `reroutes` | `int` | `0` | **exists**, `resident.ts:122` |
| `stuckEvents` | `int` | `0` | **exists**, `resident.ts:123` |
| `currentNodeId` | `long` | `startNodeId` | **exists** as `currentNode` (node *index*), `resident.ts:44` |

`routeNodes` is allocated at plan time **only when a schedule is active**
(`GisAgent.java:641-646` and `:734-737`, identical in both choosers):

```java
routeNodes = network.hasClosureSchedule()
        ? network.nodesToSource(best.getRouteTree(), currentNodeId) : null;
seenClosureVersion = network.getClosureVersion();
```

Both lines run in **both** choosers, on **every** successful selection. `seenClosureVersion` is
therefore stamped from the live version at every re-plan, which is what stops a freshly planned
leg from being adjudicated by a wave it already avoids.

`nodesToSource` (`StreetNetwork.java:579-607`) is `null` under exactly `pathToSource`'s null
conditions. The chooser only selects a shelter with a finite tree distance, so a `null` here
is a corrupt tree — throw, matching the existing `buildRouteLeg` throw in
`step.ts:296-302`.

---

## 6. Where steps 9–10 sit inside `step()`

Full order (`GisAgent.java:304-593`), the WP8 additions in **bold**:

| # | Java lines | what |
|---|---|---|
| 1–2 | 306–316 | context/geography lookup; per-agent-tick param reads (hoisted in the port) |
| 3 | 320–324 | V34 group pace, `Math.max(0.40, speed − delta)` |
| 4 | 325–326 | `tick`, `dtHours = minutesPerTick / 60.0` |
| 5 | 332–359 | **exposure + ventilation — reads `stuckUntilTick`** (§10) |
| 6 | 365–448 | departure (UNAWARE/PRE_EVAC only) |
| 7 | 459–478 | `REFUSED_ALL_FULL` re-entry, re-checked every tick |
| 8 | 480–482 | `if (state != EN_ROUTE) return;` |
| **9** | **488–494** | **stuck gate** |
| **10** | **495–504** | **closure-version check → `reactToClosureWave`** |
| 11 | 507–520 | planning (`routePath == null` → chooser, then `snapGapM += geodesic(here, path[0])`) |
| 12 | 522–543 | movement |
| 13 | 545–592 | arrival at the door |

Steps 9–10, quoted whole (`GisAgent.java:484-504`):

```java
// ---- Scenario-E obstacle layer (V48-V51) ---------------------------
// Both branches are unreachable without a closure wave: stuckUntilTick
// is only ever set at a blockage, and closureVersion only moves when a
// wave fires. Legacy arms fall straight through.
if (!Double.isNaN(stuckUntilTick)) {
    if (tick < stuckUntilTick) {
        return; // stuck at the blockage: outdoors, resting ventilation,
                // accruing dose (already booked above) — the penalty
    }
    stuckUntilTick = Double.NaN; // delay served; resume the pushed path
}
if (routePath != null && routeNodes != null
        && network.getClosureVersion() != seenClosureVersion) {
    reactToClosureWave(tick, minutesPerTick);
    if (!Double.isNaN(stuckUntilTick)) {
        return; // pushed through and got stuck right here (V49)
    }
    // a reroute cleared routePath; the planning block below re-plans
    // this same tick from the node this resident actually stands at,
    // over the trees the wave just recomputed
}
```

Consequences that must survive the port:

* **Step 9 runs before step 10.** A stuck resident never reacts to a wave; the version delta
  accumulates and is adjudicated by exactly one scan on the resume tick (QUIRK 20).
* **On the resume tick both run.** `tick >= stuckUntilTick` clears the field to NaN, then the
  version check runs in the same tick.
* **When step 10 is reached, `stuckUntilTick` is always NaN**, so the post-call test at 498 is
  exactly "did this call create a new stuck".
* **The gate is `!=`, not `>`.** `closureVersion` only increases, so they agree; use `!==`.
* **A resident whose leg is `null`** (PRE_EVAC, UNREACHABLE, REFUSED_ALL_FULL, just refused at
  a door) never enters step 10 and never consumes a version. It plans on the recomputed trees
  at step 11 and stamps the current version there.
* **Reroute keeps walking.** Clearing `routePath` at step 10 falls into step 11 in the *same*
  tick, which plans a new leg and then step 12 walks a full `stepLengthM` on it. Only the
  stuck branch skips movement.

---

## 7. `reactToClosureWave` — line by line

`GisAgent.java:778-841`, quoted whole:

```java
private void reactToClosureWave(double tick, double minutesPerTick) {
    seenClosureVersion = network.getClosureVersion();
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
        return; // remaining route untouched by this wave (or already pushed)
    }
    blockagesEncountered++;
    boolean push = false;
    if (decisionConfig != null && decisionAttributes != null) {
        double mobilityPenalty = (attributes != null && attributes.mobilityLimited)
                ? 1.0 : 0.0;
        push = thetaScaled >= decisionConfig.pushThetaThreshold
                + decisionConfig.kPush * (barrierCost + mobilityPenalty);
    }
    if (push) {
        pushThroughs++;
        // The gamble covers every closure on the remaining route as of this
        // decision, this wave's and earlier ones' alike.
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
        // stale path kept: the resident walks through the closed street
    } else {
        reroutes++;
        // Re-plan from the last node actually reached (largest k with
        // coordOffset[k] < pathIndex; 0 when the walk has not started) —
        // "where this resident stands", not the leg's original origin.
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
    }
}
```

### 7.1 Step S1 — consume the wave, unconditionally

`seenClosureVersion = network.getClosureVersion();` is the **first statement**. A scan that
finds nothing still consumes the wave, which is what bounds the work at one scan per wave per
agent. Moving this to the hit branch would make an unaffected walker rescan every tick until
it re-plans.

### 7.2 Step S2 — find the first un-pushed blocked ahead-edge

Loop bound `k + 1 < nodes.size()`: iterates edges, not nodes. A one-node chain (the resident is
standing on the shelter's own node) never enters the body.

Three conjuncts, **evaluated left to right with `&&` short-circuit**:

1. `off[k] >= pathIndex` — **"ahead"**. `>=`, not `>`. `coordOffset[k]` is the index in the
   coordinate path of node `k`'s own vertex; `pathIndex` is the count of vertices already
   consumed. `off[k] == pathIndex` means the walker's *next* target is node `k` itself, so it
   has not reached the junction and the edge `(k, k+1)` is ahead. **Closures block ENTRY to a
   street, not people already on it** — a walker at or past the junction is grandfathered
   (`GisAgent.java:750-756`).
2. `network.isBlocked(nodes[k], nodes[k+1])`.
3. `pushedBlockages == null || !pushedBlockages.contains(pairKey(...))` — an obstacle already
   gambled on is never re-litigated: no second counter, no second `pStuck` draw.

`hit` is set and the loop breaks. **`hit` is then used only as a boolean** — the identity of the
blocking edge is discarded and no per-edge quantity is recorded anywhere (QUIRK 10).

`if (hit < 0) return;` — **no counter is incremented and no RNG is drawn**.

### 7.3 Step S3 — one blockage, one decision

`blockagesEncountered++` fires exactly once, here. Its Javadoc (`GisAgent.java:1000-1001`) is
precise: *"Closure waves that actually intersected this resident's remaining route."* It counts
**wave-scans-with-a-hit**, not blocked edges. A wave that blocks five edges on your remaining
route is **one** blockage.

### 7.4 Step S4 — the push rule (V51)

```java
boolean push = false;
if (decisionConfig != null && decisionAttributes != null) {
    double mobilityPenalty = (attributes != null && attributes.mobilityLimited) ? 1.0 : 0.0;
    push = thetaScaled >= decisionConfig.pushThetaThreshold
            + decisionConfig.kPush * (barrierCost + mobilityPenalty);
}
```

* **`push` defaults to `false`.** With the decision layer off there is no trait to gamble on,
  so *every* blocked resident reroutes — the safe degenerate, warned at startup
  (`ContextCreator.java:702-706`). A port that evaluates the inequality with zero-valued
  defaults would push everyone (`0 >= -0.25` is true), inverting the mechanism (QUIRK 21).
* `thetaScaled` = `sigmaTheta * decisionAttributes.thetaZ`, precomputed once in
  `setDecisionLayer` (`GisAgent.java:938`). `thetaZ` is the **raw** standard-normal draw; the
  scaling is applied at use so a sigma sweep never reshuffles the population.
  With `sigmaTheta = 0` every resident has `thetaScaled = 0` and the whole population takes the
  same branch — but the Gaussian is still drawn at build (the unconditional-draw rule).
* `barrierCost` (`GisAgent.java:939-943`):
  ```java
  double c = 0.0;
  if (da.heavyBelongings) c += config.barrierBelongings;
  if (da.hasPet && !config.petPolicyAdmitDefault) c += config.barrierPet;
  if (da.hasDependents) c += config.barrierDependents;
  ```
  The pet term uses the **run-wide default policy**, never a per-site policy (QUIRK 25).
  Order of addition is fixed: belongings, pet, dependents. At the archived
  `barrier* = 0.26` this matters only through floating-point association; reproduce the order.
* `mobilityPenalty` reads `PopulationSampler.Attributes.mobilityLimited` — the **heterogeneity**
  sampler, not the E-layer sampler. With `enableHeterogeneity = 0`, `attributes` is `null` and
  the penalty is 0 even when the decision layer is on (QUIRK 22).
* The comparison is **`>=`**: an exact tie **pushes**.
* No RNG is consumed by this decision. It is deterministic given the trait, which is why V51 is
  auditable per agent.

**The honesty note attached to `pushThetaThreshold`.** Three layers, all of which the port must
carry into any UI or preset copy:

1. *Registry V51* (`Geography/data/registry/variables.csv:56`), status field
   **`COEFFICIENTS UNSOURCED, AGGREGATE DISCIPLINED (A-35)`**: the coefficients have no source;
   what is disciplined is the *population-level outcome*, checked against a fire-incident
   continue band. The anchors are Wood 1972 (UK FRN 953: 26% of the 60% who moved turned back),
   Bryan 1977 (NBS-GCR-77-94: 29.9% of 62.7%), and Jin 1997
   (doi:10.3801/IAFSS.FSS.5-3: 45%, 14/31, dense irritant-smoke corridor) — so the realised
   push-through share among blocked residents is checked against a **55–75% continue band**.
   The threshold *form* has precedent (Lovreglio, Ronchi & Nilsson 2016,
   doi:10.1016/j.simpat.2016.03.006 — latent-threshold perceived-risk choice shifted by
   personal characteristics). The mobility/encumbrance coupling has **no quantitative anchor**
   and its direction is labelled plausible-but-undemonstrated. Every anchor is indoor/tunnel
   fire smoke — transferability to outdoor street closures is itself registered as an
   assumption (A-35).
2. *The default's derivation* (`ContextCreator.java:317-320`):
   ```java
   // -0.25 = the band-anchored central registered in 13-PHASE-E-PREDICTIONS:
   // P(push | unburdened) = P(theta >= -0.25) ~= 0.60, the midpoint of the
   // V51 fire-incident continue-through-smoke band (55-75%).
   ```
   i.e. −0.25 is chosen so that a standard-normal unburdened trait clears it ~60% of the time.
3. *The executed-value correction* — see QUIRK 26. Every archived SE/SE2 manifest records the
   **executed** value as `0.0`, not −0.25, and the correction note in
   `13-PHASE-E-PREDICTIONS.md` is explicit that impact is **NONE** because the parameter was
   never consulted (zero blockage events). Any UI that shows −0.25 next to an archived run is
   lying about what ran.

### 7.5 Step S5a — the push branch

Order, exactly:

1. `pushThroughs++`
2. lazily allocate `pushedBlockages`
3. **second full scan** of the node chain recording **every** currently-blocked ahead-edge —
   not only the hit, and not only this wave's edges. One gamble covers the whole remaining
   obstacle set.
4. **one** `decisionRng.nextDouble()`; if `< pStuck`: `stuckEvents++` and
   `stuckUntilTick = tick + stuckDelayH * (60.0 / minutesPerTick)`.
5. the stale `routePath`/`routeNodes`/`pathIndex` are **kept** — the resident walks through the
   closed street.

The stuck deadline uses the inline expression `60.0 / minutesPerTick`, recomputed from the
per-tick parameter rather than read from a cached `ticksPerHour`. Numerically identical for
`minutesPerTick = 1.0`; reproduce the expression anyway (QUIRK 19).

Because the path is kept, `seenClosureVersion` (set at S1) is the only thing that changed on
the routing side, so the next wave will trigger exactly one more scan.

### 7.6 Step S5b — the reroute branch

1. `reroutes++`
2. `lastReached` = the largest `k` with `off[k] < pathIndex`, defaulting to 0. The loop's
   `else break` is correct only because `coordOffset` is strictly increasing — each predecessor
   edge contributes `coords.length − 1 ≥ 1` (`StreetNetwork.java:594-601`). Reproduce the
   early break or a monotone binary search; do not write an unconditional max-scan that would
   differ if the invariant were ever violated (it would mask the corruption).
3. `currentNodeId = nodes[lastReached]` — **where the resident stands**, not the leg's origin.
   With `pathIndex == 0` this is the leg origin, which is the documented "walk has not started"
   case.
4. `targetShelter = null; routePath = null; routeNodes = null; pathIndex = 0;`

`retargetCount` is **not** incremented (that counter is door refusals only), so a reroute can
never trip the L0 `MAX_RETARGETS` cap. `plannedRouteM` will grow by the new leg's
`bestDistM` at step 11; `networkDistToShelterM` is **not** overwritten (written once, first
selection only).

**The port's mandatory extra step.** Java reads the resident's live geographic position at
step 11 (`GisAgent.java:518-519`):

```java
Point here = (Point) geography.getGeometry(this);
snapGapM += StreetNetwork.geodesicDistanceM(here.getCoordinate(), routePath.get(0));
```

`here` is the interpolated mid-street point. The port never materialises that point during a
tick (`step.ts:311-327`, DR-S3 action A1), so **before clearing the leg the port must call
`materialisePosition(a)` and write the result into `a.posLon/a.posLat`.** Otherwise the new
leg's approach is measured from a stale coordinate — the last door, or the encampment — and
`snapGapM`, `distanceTraveledM` and every subsequent position are wrong. This is the single
easiest way to produce a plausible-but-wrong reroute (QUIRK 14).

---

## 8. `pathIndex`: Java's semantics and the port's mapping

### 8.1 Java

`pathIndex` is an `int` field, 0 at every plan/refusal/reroute. The movement loop
(`GisAgent.java:526-541`):

```java
double stepLengthM = walkingSpeedMps * 60.0 * minutesPerTick;
double remainingM = stepLengthM;
while (remainingM > 0 && pathIndex < routePath.size()) {
    Coordinate next = routePath.get(pathIndex);
    double dM = StreetNetwork.geodesicDistanceM(current, next);
    if (dM <= remainingM) {
        current = next;
        pathIndex++;
        remainingM -= dM;
    } else {
        ... interpolate along the geodesic; remainingM = 0;
    }
}
distanceTraveledM += stepLengthM - remainingM;
```

* `current` starts at the resident's own position, **not** `routePath[0]`. So the first
  iteration measures the off-network approach (encampment→street snap gap, or the polyline
  endpoint gap after a refusal or reroute), and `pathIndex` becomes 1 only once that approach
  is fully walked.
* `dM <= remainingM` is **inclusive**: landing exactly on a vertex consumes it.
* Therefore, writing `D(j)` for the distance from the plan-time standing point to
  `routePath[j]` and `W` for the total distance walked on this leg:

> **`pathIndex == |{ j ∈ [0, vertexCount) : D(j) <= W }|`**

* `pathIndex` is monotone non-decreasing within a leg and is reset to 0 by every plan, door
  refusal and reroute.

### 8.2 Port

The port's leg carries `cumM[j]` (distance along the polyline) and the scalar
`legApproachM` + `legTravelM` (`agents/route.ts:69-81`, `agents/resident.ts:49-56`), where
`legTravelM` is Java's `W` and `legApproachM + cumM[j]` is `D(j)`. So:

```ts
/** Java's `pathIndex` — the number of route vertices already consumed. */
function pathIndexOf(a: Resident): number {
  const leg = a.leg;
  if (leg === null) return 0;
  const s = a.legTravelM - a.legApproachM;   // distance walked ON the polyline
  if (s < 0) return 0;                       // still on the approach
  // largest j with cumM[j] <= s, plus 1; cumM is non-decreasing and cumM[0] === 0
  let lo = 0, hi = leg.vertexCount - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (leg.cumM[mid]! <= s) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}
```

Do **not** reuse `legVertexAt` (`route.ts:169-181`): it clamps to `vertexCount − 2` for
interpolation and would under-report by one at the end of a leg.

`pathIndexOf` is only called from step 10, so the hot loop is untouched. Ship a unit test that
an incrementally maintained counter and this derivation agree over a full arm-A run.

**Divergence risk (declared).** Java accumulates `W` from live geodesic measurements between
interpolated points; the port accumulates it from `cumM`. DR-S3 finding S3-F2 puts the residual
at ~1e-9 m per tick. At an *exact* vertex boundary the `<=` can therefore flip, moving
`pathIndex` by 1 and flipping one edge between "ahead" and "grandfathered". This is
unobservable in the archive (zero blockage events) and is registered as a WP8 divergence
channel, not hidden (QUIRK 30).

### 8.3 `coordOffset`

Already ported: `nodesToSource` (`graph/paths.ts:132-157`) mirrors
`StreetNetwork.nodesToSource` statement for statement, including `coordIndex += n − 1` per
predecessor edge and the defensive `null`. `nodes[0]` is the leg's origin (the agent's
`currentNode`) and `nodes[last]` is the shelter node; `coordOffset[0] === 0`. The node chain
and the coordinate path run in the **same** direction — agent → shelter.

---

## 9. `pairKey` and what it keys

`GisAgent.java:843-848`:

```java
/** Canonical undirected-pair key for {@link #pushedBlockages}. Cold path
 *  (once per blockage event), so a string key is fine here — unlike the
 *  Dijkstra relaxation, where it is banned. */
private static String pairKey(long a, long b) {
    return a <= b ? a + ":" + b : b + ":" + a;
}
```

* Operands are **graph node ids** (`long`), the same vocabulary as the closure CSV. They can be
  **negative**: synthetic split nodes are `-1000, -1001, …` (`StreetNetwork.java:208, 349`).
* `a <= b` (not `<`). At `a == b` both branches produce the same string, so the relation choice
  is immaterial — `BlockedEdges.canonicalIdKey` uses `<` (`blocked.ts:101-103`) and is
  equivalent.
* `a + ":" + b` is `Long.toString` concatenation: `-1000` renders as `"-1000"`, identical to
  JS `String(-1000)` for every id in the graph (all well inside `Number.MAX_SAFE_INTEGER`).
  A port that canonicalised with `>>> 0` or a `Uint32Array` view would collide the negatives
  (QUIRK 28).
* **The set is never iterated, never sized, never exported.** Only `add` and `contains` are
  called. Therefore the port may key `pushedBlockages` on node **indices** instead of ids,
  provided it does so consistently — index↔id is a bijection. Say so explicitly in the code so
  nobody "fixes" it later.

### 9.1 Agreement with `schedule.ts`'s build-time phantom count

`schedule.ts` counts phantoms with `hasEdgeBetween(graph, indexA, indexB)` over node
**indices**; `ClosureWave.apply()` guards with `hasEdge(a, b)` over node **ids**. These are the
same predicate on the same immutable graph:

* `nodeIndex(graph, id)` returns `-1` exactly when Java's `adjacency.get(id)` returns `null`
  (the id is not a graph node) — both then yield `false`.
* Otherwise both scan the node's adjacency for the partner.

So `matchingGraphEdges` (parse time) is exactly the number of rows that `apply()` will pass to
`blockEdge`, and `blocked_edges_at_end` is the number of **distinct pairs** among them. Gate (k)
checks all three against the CSV. The runtime must not recount with a different predicate.

**One caveat about `BlockedEdges`:** `blockPair` adds the canonical key to `pairs` even when
the pair matches no graph edge, which would flip `isEmpty` and inflate `size`. Java's
`blockEdge` behaves the same way — but `apply()` never calls it for a phantom. The port must
apply the guard for the same reason (QUIRK 5).

---

## 10. Exposure and ventilation for a stuck agent — verified, exactly

`GisAgent.java:332-359`, the decisive lines quoted:

```java
if (smokeField != null && state != State.SHELTERED) {
    double c = smokeField.concentrationForTick(tick, minutesPerTick);
    exposureUgM3h += c * dtHours;
    vweUgM3h += c * ageRR * comorbidityRR * dtHours;
    // A Scenario-E stuck resident (V50) is EN_ROUTE but WAITING at the
    // blockage, so it breathes at the resting rate — the registered
    // semantics of the delay. stuckUntilTick is NaN in every run
    // without closures, so the legacy expression is untouched there.
    boolean stuckNow = !Double.isNaN(stuckUntilTick) && tick < stuckUntilTick;
    double ventilationM3h = (state == State.EN_ROUTE && !stuckNow)
            ? INHALATION_WALKING_M3H : INHALATION_RESTING_M3H;
    airVolumeBreathedM3 += ventilationM3h * dtHours;
    inhaledDoseUg += c * ventilationM3h * dtHours;
    if (state == State.EN_ROUTE) {
        exposureWhileTravelingUgM3h += c * dtHours;
    }
    ...
}
```

**Verified: yes — a stuck EN_ROUTE resident uses `INHALATION_RESTING_M3H = 0.61`, not
`INHALATION_WALKING_M3H = 1.62`.** The port already has this correct at
`engine/src/agents/step.ts:131-133`.

Exact semantics, tick by tick, for a stuck event created at tick `T` with
`D = stuckDelayH * (60.0 / minutesPerTick)` ticks:

| tick | `stuckNow` | ventilation | moves? | why |
|---|---|---|---|---|
| `T` | `false` | **WALKING 1.62** | no | block 5 ran while `stuckUntilTick` was still NaN; the field is set later in the same tick |
| `T+1 … T+D−1` | `true` | RESTING 0.61 | no | `tick < stuckUntilTick`; step 9 returns |
| `T+D` | `false` | **WALKING 1.62** | yes | `tick < stuckUntilTick` is false — strict `<`; the field is cleared and the walk resumes |

* Exactly `D` ticks of lost movement (`T … T+D−1`), and exactly `D−1` ticks at resting.
* The one entry tick at walking is the registered over-statement: V50's status field says
  *"the decision tick itself is booked at walking ventilation, overstating the penalty by
  ~0.5% of one delay-hour per event — accepted, conservative"* (1/180 at the archived
  `stuckDelayH = 3.0`, `minutesPerTick = 1.0`).
* **The asymmetry that must not be harmonised:** the ventilation term tests `!stuckNow`, but
  `exposureWhileTravelingUgM3h` tests only `state == State.EN_ROUTE`. A stuck resident is
  *resting for the dose* and *travelling for the exposure-while-travelling column*, for all `D`
  ticks (QUIRK 17).
* `exposureUgM3h`, `vweUgM3h`, `hoursAboveUnhealthy`, `peakConcUgM3` and `outdoorHours` are
  untouched by stuck state. `distanceTraveledM` does not grow.
* The `stuckNow` test is `!Double.isNaN(x) && tick < x`. In TS,
  `!Number.isNaN(x) && tick < x` — do **not** simplify to `tick < x` alone: it happens to be
  equivalent (`tick < NaN` is false), but the explicit NaN guard is what documents that NaN is
  the sentinel, and it is what `step.ts:131` already writes.

---

## 11. Counter identities, derived — and why gate (l) is weak

### 11.1 What increments what

There are **exactly four** increment sites in the whole model, all inside
`reactToClosureWave`:

| counter | line | condition |
|---|---|---|
| `blockagesEncountered` | 795 | reached iff `hit >= 0`, i.e. the scan found an un-pushed blocked ahead-edge |
| `pushThroughs` | 804 | inside `if (push)`, unconditionally |
| `reroutes` | 823 | inside the `else`, unconditionally |
| `stuckEvents` | 817 | inside `if (push)`, guarded by `decisionRng.nextDouble() < pStuck` |

Nothing anywhere else touches them. `OutcomeLogger` reads them through
`getBlockagesEncountered()/getPushThroughs()/getReroutes()/getStuckEvents()`
(`GisAgent.java:999-1007`) into the last four `agents.csv` columns
(`OutcomeLogger.java:173-176`), always numeric, structurally 0 outside Scenario E.

### 11.2 The identity

`push` is a `boolean`, so `if (push) { pushThroughs++ } else { reroutes++ }` increments
**exactly one** of the two on **every** path that increments `blockagesEncountered`, and
neither on any path that does not. Therefore, per agent and at every instant:

> **`blockagesEncountered ≡ pushThroughs + reroutes`**

and, since `stuckEvents++` occurs only inside the push branch and at most once per push:

> **`stuckEvents ≤ pushThroughs`**

Gate (l) (`scripts/verify_E_runs.py:718-765`) checks both **per row** plus
`|stuck/pushes − pStuck| ≤ 3·SE + slack`, and for `closuresCode == 0` checks that all four sum
to zero.

### 11.3 Why the identity cannot be trusted alone

The identity is a *structural* consequence of the if/else, not a *behavioural* one. Every one
of these wrong ports satisfies it:

* `push` always `false` (e.g. the `decisionConfig != null` guard inverted, or `thetaScaled`
  never populated) → all reroutes, identity holds, mechanism inverted.
* `push` always `true` (e.g. evaluating the inequality with zero defaults when the layer is
  off: `0 >= -0.25`) → all pushes, identity holds.
* `blockagesEncountered` counted per *blocked edge* rather than per *wave-scan-with-a-hit*,
  with `pushThroughs`/`reroutes` counted the same way → identity holds, magnitudes 3–5× wrong.
* the "ahead" test written as `>` instead of `>=` → a different, smaller subject population;
  identity holds.
* the `pushedBlockages` filter omitted → the same obstacle re-litigated at every later wave;
  identity holds, counts inflated, and `stuckEvents/pushThroughs` still ≈ `pStuck`.

So the port must gate the **components**, not the sum. See §17 for the fixtures that do it.

### 11.4 The other closure gate, (k)

`verify_E_runs.py:672-716`, against the schedule CSV:

| assertion | source of truth |
|---|---|
| `closures.code == closuresCode` | manifest vs params |
| code 0 ⇒ `set(closures.keys()) == {"code"}` | the minimal block |
| `scheduled_undirected_edges == len(csv)` | every row counted, phantoms included |
| `matching_graph_edges == len(csv)` | node-id drift detector |
| `blocked_edges_at_end == len({sorted(a,b)})` | distinct pairs, Python `sorted()` on **strings** (QUIRK 37) |
| `closure_version_at_end == len(sorted set of hours)` | every wave FIRED (QUIRK 35) |
| `wave_hours == sorted distinct hours` | ascending, from the TreeMap |

---

## 12. The manifest closure census — byte format

`OutcomeLogger.java:336-356`. Hand-assembled, no JSON library, fixed key order. Code 0:

```
  "closures": {"code": 0},
```

Otherwise, exactly (two leading spaces on the outer lines, four on the inner; note that two
pairs of keys share a line, and `wave_hours` uses `", "` as the separator):

```
  "closures": {
    "code": 3,
    "schedule_file": "data/closures/closures_E_r1_worst.csv",
    "scheduled_undirected_edges": 72, "matching_graph_edges": 72,
    "wave_hours": [3, 44, 72, 142, 265, 303],
    "blocked_edges_at_end": 72, "closure_version_at_end": 6
  },
```

(verified byte-for-byte against
`docs/runs/scenario-e-v2/SE2-E18-d1-seed42/simulation.json` lines 46–52.)

* `blocked_edges_at_end` and `closure_version_at_end` are read **from the live network at
  export time** (`ClosureCensus.network`), not accumulated — so they are the end-of-run truth
  and will disagree with the schedule if a wave failed to fire.
* `schedule_file` is the path **relative to `Geography/`**, exactly as the constant declares it.
* The port emits `'  "closures": {"code": 0},'` today (`engine/src/output/logger.ts:600`);
  WP8 must add the populated branch behind the same emitter.
* Empty wave list would render `[]` — unreachable (code ≠ 0 implies ≥ 1 row).

---

## 13. The archived connectivity reports — schema and what each field asserts

Five files under `docs/runs/scenario-e-closures/`, all
`"schema": "reu-wildfire-shelter-abm/scenario-e-closures/v1"`, all produced by
`scripts/build_closures_E.py v1.0.0`. They are **inputs' provenance**, not run outputs: they
certify the schedules the runtime consumes. The port reproduces them by *carrying* them
(Provenance screen, WP12) and by *re-deriving* their S1/S2/S3 checks against its own graph — a
graph-parity test that is independent of the run loop.

| file | severity | closures | waves |
|---|---|---|---|
| `closures_E_r1_report.json` | `base` | 18 | 1 (h79) |
| `closures_E_r1_extreme_report.json` | `extreme` | 34 | 2 (h79, h150) |
| `closures_E_r1_worst_report.json` | `worst` | 72 | 6 |
| `closures_E_r2_worst_report.json` | `worst` | 72 | 6 |
| `closures_E_r3_worst_report.json` | `worst` | 72 | 6 |

### 13.1 Top-level keys, in file order

| key | type | what it asserts |
|---|---|---|
| `schema` | string | format contract; pin it |
| `generated_utc` | ISO-8601 Z | build time |
| `generator` | string | `scripts/build_closures_E.py v1.0.0` |
| `status` | string | `"CONSTRUCTED COUNTERFACTUAL - NO INCIDENT RECORD EXISTS"` — must be surfaced verbatim wherever a schedule is named (A-34) |
| `provenance_note` | prose | what is real (RLIS features, node ids, classification, the eight pedestrian-legal crossings) vs invented (which features close and when, drawn by `python random.Random(<site_seed>)`) |
| `severity` | `base\|extreme\|worst` | maps to `closuresCode` 1/2/3 |
| `site_seed` | int | 1, 2 or 3 — equals `closureDraw` for the worst family |
| `site_selection_rng` | string | `"python random.Random(<n>)"` — a **generator-side** stream, unrelated to any model stream |
| `waves` | array | per wave: `{wave, activation_hour, bridges, arterials, locals}` — the class composition |
| `worst_family_wave_windows` | object\|null | `{wave1: [2,6], later: [12,350], note}` — wave 1 anchored to the documented same-day closure pattern (A-34) |
| `class_weight_model` | object\|null | per class, the evidence status: bridges *"PURE ASSUMPTION"*, arterials *"evidence-backed dominant class"*, locals *"DECLARED ASSUMPTION"* |
| `output_csv` | string | the file the runtime reads |
| `csv_columns` | string[5] | `node_a, node_b, activation_hour, label, kind` |
| `graph` | object | the graph the schedule was drawn against (below) |
| `shelter_components` | object | shelter/demand distribution over pre-closure components |
| `demand_bounding_box` | object | the box arterial/local draws are confined to |
| `bridge_pool` / `local_pool` / `arterial_pool` | object\|null | candidate pools + draw rules |
| `closures` | array | one row per closed edge, richer than the CSV |
| `connectivity_check` | array | one entry per **cumulative** wave state (below) |
| `checks` | array | named PASS/FAIL assertions (below) |
| `limitations` | string[5] | the honesty block |

### 13.2 `graph` — the parity target for the port

```json
{"source_attributes":"Geography/data/Streets.dbf",
 "source_geometry":"Geography/data/Streets.shp (Web Mercator metres -> WGS84)",
 "freeway_filter_applied":[1110,1120,1121,1122,1123],
 "freeway_features_excluded":2636, "freeway_km_excluded":614.1,
 "walkable_features":109434, "nodes":88100, "undirected_edges":109434,
 "corrected_node_sites":25, "components":171,
 "component_sizes_top5":[59725,27543,237,55,19]}
```

Identical in all five files, and identical to the WP2-S2 census the port's packed asset already
matches (plan §8 WP2-S2: 88,100 / 109,434 / 171 / largest 59,725). `corrected_node_sites: 25`
is the 3 reattached + 22 split total. **If the port's graph does not reproduce this block, the
node ids in the schedules do not mean what the schedules think they mean, and every closure is
silently misplaced.**

### 13.3 `closures[]` — one row per closed edge

```json
{"node_a":53193,"node_b":53407,"activation_hour":3,"label":"MORRISON BRG",
 "kind":"bridge","wave":1,"rlis_type":1400,"length_m":134,
 "midpoint_lonlat":[-122.669606,45.517837]}
```

`node_a/node_b/activation_hour/label/kind` are exactly the CSV's five columns, in the CSV's row
order. `wave`, `rlis_type`, `length_m`, `midpoint_lonlat` are report-only. `midpoint_lonlat`
is the natural source for a map layer; `rlis_type` is what the freeway check asserts against.

### 13.4 `connectivity_check[]` — the severance proof, per cumulative wave state

```json
{"wave":6,"hour":303,"edges_blocked":72,
 "shelters_with_no_unblocked_incident_edge":[],
 "shelters_severed_from_their_component":[],
 "components_before":171,"components_after":179,
 "components_split_by_the_closures":1,
 "nodes_losing_reachability":22,
 "graph_nodes_total":88100,
 "encampment_points_total":3400,
 "encampment_points_losing_some_shelter_access":0,
 "encampment_points_losing_all_shelter_access":0,
 "encampment_shelter_pairs_lost":0}
```

Field by field:

* `edges_blocked` — **cumulative** through this wave (72 at wave 6, 15 at wave 1). This is the
  same quantity the runtime's `blockedEdgeCount()` reports after that wave, and it is the
  cross-check that the port's blocked set matches the certifier's.
* `shelters_with_no_unblocked_incident_edge` — gate **S1**: a shelter whose every incident edge
  is closed is walled in at its own door. Empty in all five files, all waves.
* `shelters_severed_from_their_component` — gate **S2**: a shelter that left the largest
  post-closure fragment of its own pre-closure component. Empty everywhere.
* `components_before` / `components_after` / `components_split_by_the_closures` — the closures
  *may* fragment the graph (171 → 179 in r1's final state); what they may not do is strand a
  shelter or a demand point.
* `nodes_losing_reachability` — nodes that fall out of the reachable set. Non-zero (up to 22)
  and **allowed**: they are not demand or supply points.
* `encampment_points_losing_some_shelter_access` / `…_all_shelter_access` /
  `encampment_shelter_pairs_lost` — gate **S3**: no demand point may lose *all* shelter access.
  All zero everywhere. Note the "some" and "pairs" counters are also zero in the committed
  families, which is stronger than S3 requires.

**What this constrains in the runtime:** post-wave `UNREACHABLE` can never appear at a
*shelter door* or at an *encampment start node*. It **can** in principle appear for a resident
that reroutes from a mid-street node that fell into a severed fragment — S1/S2/S3 say nothing
about mid-route nodes. Do not write a test asserting "no resident becomes UNREACHABLE after a
wave"; assert the three certified gates instead.

### 13.5 `checks[]` — named PASS/FAIL assertions

10 entries for `base`, 13 for `extreme`, 26 for `worst` (= 8 fixed + 3 per wave × 6). Fixed set:

1. no closure carries a freeway RLIS TYPE (U-27 / V26)
2. every closed node pair resolves to exactly one street feature — *"0 ambiguous"*
3. every bridge closure is on the V26 pedestrian-legal list
4. every bridge closure actually severs its crossing (detour threshold 1000 m)
5. no duplicate closed edge — *"72 rows, 72 distinct pairs"*
6. every arterial/local closure lies inside the demand bounding box
7. closure count matches the severity plan
8. wave 1 lands inside the same-day evidence window (A-34)

Then per wave *w* at hour *h*: `S1 wave w (hour h)`, `S2 wave w (hour h)`, `S3 wave w (hour h)`
with details `"0 of 46 stranded"`, `"0 of 46 severed"`, `"0 of 3400 walled off"`.

The **46** is not a run-time quantity: `scripts/build_closures_E.py:180` validates every
schedule against `shelters_2026_expanded_plus_new_sites.csv` — arm C's 46-site file, the
largest committed set — regardless of which arm will later run the schedule. So the S1/S2/S3
proof covers a superset of the 36 sites arms A/B/D use, and the port must not re-derive it
against the arm under test and expect the archived numbers.

Check 2 is worth flagging: *every closed node pair resolves to exactly one street feature*.
That is what makes the pair-keyed blocked set unambiguous for these schedules — but it is a
property of the committed data, **not** of the mechanism. `isBlocked` is still by pair, and a
schedule with parallel edges would close both (§4.1).

### 13.6 `limitations[]`

Five strings, the first of which is the required framing:

> `"CONSTRUCTED COUNTERFACTUAL: no incident record exists; the schedule is a seeded draw, so it
> cannot support any claim about what did or would happen on a particular date."`

Per A-34, closure effects must be reported as a **range across draws**, never from one
schedule. WP12's Compare screen already carries this rule; the closures runtime must expose
`closureDraw` prominently enough that a single-draw presentation is visibly incomplete.

---

## 14. RNG DRAW SITES

Draw order is the most fragile thing in this port, so this section is exhaustive and negative
as well as positive.

### 14.1 The whole closures runtime draws **once**, conditionally

| site | stream | generator | condition | count |
|---|---|---|---|---|
| `reactToClosureWave` line 816, `decisionRng.nextDouble() < decisionConfig.pStuck` | **per-agent decision stream** | `java.util.Random` | only on the **push** branch, and only when `decisionConfig != null && decisionAttributes != null` | exactly 1 per push |

That is the complete list. Everything else in this work package is provably draw-free:

* `parseClosureSchedule` / schedule loading — **zero**.
* `ClosureWave.apply()` — **zero**: `hasEdge`, `blockEdge`, `bumpClosureVersion` and
  `computeTree` are all deterministic. The Java comment at `ContextCreator.java:544` states it:
  *"Tree computation draws no RNG either way."*
* The scan loop, the `push` inequality, `pairKey`, the `pushedBlockages` bookkeeping, the
  `lastReached` search, `currentNodeId`/`routePath`/`pathIndex` resets — **zero**.
* The stuck gate (step 9) and the version check (step 10) — **zero**.
* Movement, path reconstruction, exposure, ventilation — **zero** (PORT_MAP §1.8
  "Zero-RNG paths").

### 14.2 The per-agent decision stream

Seeded once in `setDecisionLayer` (`GisAgent.java:937`):

```java
this.decisionRng = new java.util.Random(da.decisionSeed);
```

with `decisionSeed = runSeed * 2654435761L + index * 104729L`
(`ELayerSampler.java:170`), computed in **Java 64-bit signed overflow** arithmetic, where
`index` is the agent's creation index. `runSeed` is `RandomHelper.getSeed()`.

Its three consumers, and their **phase order over a run**:

| order | draw | where | agent state at the time |
|---|---|---|---|
| 1 | outreach Bernoulli, `< lambdaOutreachPerDay / 24.0` | `GisAgent.java:386` | `UNAWARE`, once per new simulated hour |
| 2 | hazard Bernoulli, `< p` | `GisAgent.java:414` | `PRE_EVAC`, once per new simulated hour |
| 3 | **stuck Bernoulli, `< pStuck`** | `GisAgent.java:816` | `EN_ROUTE`, once per push decision |

**These phases are disjoint and strictly ordered.** Block 6 (`GisAgent.java:365`) runs only for
`UNAWARE`/`PRE_EVAC`, and once a resident leaves `PRE_EVAC` it never returns (the
`REFUSED_ALL_FULL` re-entry at `:459-478` goes to `EN_ROUTE`, never back). So every stuck draw
for an agent comes **after** all of its outreach and hazard draws. Consequence: a wrong number
of stuck draws corrupts only that agent's *later* stuck decisions — it can never retroactively
change a departure time. That is a genuine containment property and it is worth a test.

**The failure mode to guard against.** A port that draws unconditionally "to keep the stream
aligned" — e.g. drawing before testing `push`, or drawing on the reroute branch — desynchronises
this agent's stream permanently. Because of the phase ordering above the damage is confined to
subsequent pushes, which is *harder* to notice, not easier. The draw must be inside
`if (push) { … }` and after `pushedBlockages` is populated.

**Ordering within the push branch.** Nothing else on this stream is consumed inside
`reactToClosureWave`, so the draw's position relative to `pushThroughs++` and the recording
loop is not observable — but reproduce it anyway (counter, then record, then draw), because a
future change that adds a second draw would otherwise silently reorder.

### 14.3 The Repast default stream is untouched by closures

The default (colt MersenneTwister) stream carries the build-time camp pick and the **per-tick
agent shuffle** (PORT_MAP §1.8). `ClosureWave.apply()` draws nothing from it, so applying the
wave before `shuffleMt` (§3.5) cannot change the shuffle sequence. The port must still apply
the wave **before** the agent loop, for the FIRST_PRIORITY semantics, not for RNG reasons.

### 14.4 Build-time streams

`PopulationSampler` (`seed*1000003 + 17`) and `ELayerSampler` (`seed*1000003 + 7919`) are
consumed entirely at world build, before tick 1. Closures change neither their seeds nor their
draw counts: `declareClosureSchedule()` and `parseClosureSchedule` run at build step 9, between
shelter loading and the resident placement loop, and neither draws.

`thetaZ` — the trait the push rule reads — is `ELayerSampler.sample()`'s **fifth and last**
draw (`ELayerSampler.java:162-169`: aware, heavy, pet, dependents, `nextGaussian`), drawn
**unconditionally** even at `sigmaTheta = 0`. Its `nextGaussian` uses Marsaglia polar with the
cached second deviate, so the *number* of underlying `nextDouble` calls varies; that is WP6's
already-gated problem, not WP8's, but the push rule's determinism depends on it.

---

## 15. Interaction summary — the full state machine WP8 must implement

```
per tick t:
  (1) FIRST_PRIORITY: for each wave with waveTick <= t and not yet applied:
        for each edge in wave.edges (file order):
          if edge.matchesGraphEdge: blocked.blockPair(indexA, indexB)
        closureVersion++
        for each shelter in CSV load order:
          shelter.routeTree = retainTree(computeTree(graph, shelter.graphNode, scratch, blocked))
  (2) shuffleMt(order, defaultStream); for each resident in that order: step()

step(resident):
  ... blocks 1-8 unchanged ...
  (9)  if !isNaN(stuckUntilTick):
         if t < stuckUntilTick: return          # no move; block 5 already booked RESTING
         stuckUntilTick = NaN
  (10) if leg !== null && routeNodes !== null && closureVersion !== seenClosureVersion:
         reactToClosureWave(t, minutesPerTick)
         if !isNaN(stuckUntilTick): return      # got stuck this tick; no move
  ... blocks 11-13 unchanged ...
```

---

## 16. QUIRKS

Numbered, each one a way to produce a plausible-but-wrong port.

1. **`inert` is a warning, not a firing rule.** Java warns on `hour >= endHours` but fires on
   `waveTick <= endTick`, i.e. `hour <= endHours`. A wave at exactly `hour == endHours` is
   warned as inert **and fires**. Using `ClosureWave.inert` / `ClosureSchedule.inertRows` to
   skip a wave silently drops it and breaks gate (k)'s
   `closure_version_at_end == wave count`.
2. **`endAt(endTick)` runs the tick it names.** The last tick is inclusive (PORT_MAP §1.1).
   Off-by-one here is the same landmine as `simulationHours ≤ slices − 1`.
3. **Fractional wave ticks.** `hour * ticksPerHour` is a `double`. Repast executes fractional
   ticks; the port's integer loop cannot. All certified configs pin `minutesPerTick = 1.0`, so
   assert `Number.isInteger(waveTick)` at build and throw otherwise — never round.
4. **`blockedEdgeCount()` is `directed / 2` with Java `int` division.** A blocked self-loop
   (`a == b`) writes one set entry and yields `1/2 == 0`; `BlockedEdges.size` would say 1.
   Zero self-loops in all five committed schedules — assert it, do not assume it.
5. **The `hasEdge` guard belongs at apply time.** `blockEdge`/`blockPair` accept any pair. If a
   phantom enters the blocked set, `blocked_edges_at_end` over-counts (gate k fails) and
   `BlockedEdges.isEmpty` flips, taking the Dijkstra flag path in a run that should never see
   it. Result-neutral for routing, fatal for the census.
6. **`!blockedAdj.isEmpty() && isBlocked(...)` is Java `&&` short-circuit, per relaxation.**
   `dijkstra.ts` hoists it to one read per tree. Sound **only** because `apply()` blocks every
   edge of a wave before recomputing any tree. Assert that invariant in the runtime.
7. **Blocking is by NODE PAIR, not by street feature.** Parallel features between the same pair
   are all blocked. `flagHalf` must flag every matching CSR record, not break at the first.
8. **Both halves.** `blockEdge` writes `a→b` and `b→a`. A one-sided implementation leaves the
   reverse traversal open and Dijkstra will happily route through it.
9. **`seenClosureVersion` is assigned in the first statement of `reactToClosureWave`.** A
   no-hit scan still consumes the wave. Moving the assignment into the hit branch makes an
   unaffected walker rescan every tick until it re-plans — same outputs, quadratic cost, and a
   different result the moment a later wave blocks something.
10. **`hit` is used only as a boolean.** The identity of the blocking edge is discarded; no
    per-edge counter exists. Do not add one and do not key anything on it.
11. **The push branch records EVERY blocked ahead-edge, not just the hit** — this wave's and
    earlier waves' alike. One gamble covers the whole remaining obstacle set.
12. **"Ahead" is `off[k] >= pathIndex`, with `>=`.** `off[k] == pathIndex` means the walker has
    *not* reached node `k`. Writing `>` grandfathers one edge too many and shrinks the subject
    population.
13. **The `lastReached` loop has an `else break`.** It is correct only because `coordOffset` is
    strictly increasing (every edge contributes `coords.length − 1 ≥ 1`). Reproduce the break
    or a monotone binary search.
14. **Reroute must materialise the position first.** Java reads `geography.getGeometry(this)`
    at step 11 — the live mid-street point. The port's `posLon/posLat` are stale during a walk,
    so WP8 must call `materialisePosition(a)` and write it back **before** clearing the leg, or
    `snapGapM` and every later coordinate are measured from the wrong origin.
15. **A rerouting resident re-plans AND walks a full step in the same tick.** A
    pushed-and-stuck resident does not move at all that tick. A pushed-not-stuck resident keeps
    the stale path and walks normally, through the closed street.
16. **`stuckNow` uses strict `<`.** At `tick == stuckUntilTick` the resident breathes at
    WALKING and resumes walking.
17. **A stuck resident is RESTING for ventilation but EN_ROUTE for
    `exposureWhileTravelingUgM3h`.** The two guards differ deliberately
    (`GisAgent.java:345` vs `:349`). Do not harmonise them.
18. **The stuck-entry tick is booked at WALKING**, because block 5 runs before steps 9–10.
    Registered as a conservative ~0.5%/event over-statement in V50. Do not "fix" it.
19. **`stuckUntilTick = tick + stuckDelayH * (60.0 / minutesPerTick)`** recomputes ticks-per-hour
    inline. Use the same expression, not a cached `ticksPerHour`, so a non-integral
    `minutesPerTick` cannot introduce an FP difference.
20. **Waves fired during a stuck delay are deferred, not lost.** Step 9's early return skips the
    version check; on the resume tick a single scan adjudicates the accumulated delta, minus
    anything already in `pushedBlockages`.
21. **`push` is `false` unless BOTH `decisionConfig` and `decisionAttributes` are non-null.**
    Evaluating the inequality with zero-valued defaults gives `0 >= -0.25 + 1.0*0` = **true**,
    i.e. everyone pushes — the exact inversion of the documented degenerate ("without a
    decision layer every blocked resident reroutes").
22. **`mobilityPenalty` reads the HETEROGENEITY sampler**, not the E-layer sampler:
    `attributes != null && attributes.mobilityLimited`. With `enableHeterogeneity = 0` it is 0
    even when the decision layer is on. Two different samplers, two different streams.
23. **The push comparison is `>=`.** An exact tie pushes.
24. **`thetaScaled = sigmaTheta * thetaZ` is precomputed at arming time.** `thetaZ` is the raw
    Gaussian; at `sigmaTheta = 0` every resident scores 0 and the entire population takes one
    branch, yet the Gaussian is still drawn (unconditional-draw rule, the R3 null).
25. **`barrierCost`'s pet term uses the run-wide `petPolicyAdmitDefault`,** not a per-site
    policy — per-site policy is discovered at the door; the departure-suppressing burden is
    *anticipating* refusal (A-29). Addition order: belongings, pet, dependents.
26. **Negative `constant_type="number"` batch constants are mangled by Repast.**
    Every SE/SE2 params file declares `pushThetaThreshold = -0.25`; every SE/SE2 manifest
    records the executed value as **`0.0`**. Fixed at `de7c045` by re-emitting negatives as
    `constant_type="double"`. Two things the port must not get wrong:
    * The repo's one-line root cause ("zeroes negative `number` constants") does **not** explain
      the counter-example in the same manifests: `alphaHazard = -8.0` was also declared
      `"number"` at run time and executed as `-8.0`. Observed behaviour is consistent with a
      truncation-toward-zero on the negative path (`-8.0 → -8`, `-0.25 → 0`), but that is a
      hypothesis, not a verified mechanism.
    * **The only safe rule:** build every archived preset from the manifest's
      `reproducibility.parameters`, never from the batch XML. E0-null manifests record
      `-0.25` because that file declares none of the six parameters and the value comes from
      `doubleParam`'s code fallback — the batch parser is never involved.
    Port-transferable lesson (PORT_MAP §6.4.4): emit an **executed**-parameter manifest
    distinct from the UI/preset config, so silent coercions stay visible.
27. **`pushedBlockages` is never iterated, sized or exported** — only `add`/`contains`. So the
    port may key it on node **indices** rather than ids. Say so in the code.
28. **Node ids can be negative** (synthetic split nodes `-1000, -1001, …`). `Long.toString` and
    JS `String()` agree; a `>>> 0` or `Uint32Array` canonicalisation would collide them.
29. **`pathIndex` counts vertices CONSUMED, and the movement loop starts at the agent's own
    position** — so vertex 0 (the node coordinate of the leg origin) is consumed only after the
    approach gap is walked, and `pathIndex == 0` genuinely means "has not started".
30. **The port derives `pathIndex` from `legTravelM`/`cumM`, Java accumulates it from live
    geodesics.** DR-S3 S3-F2's ~1e-9 m residual can flip the `<=` at an exact vertex boundary,
    moving `pathIndex` by 1. Registered WP8 divergence channel; unobservable in the archive
    (zero blockage events).
31. **`routeNodes` is allocated only when a schedule is active,** and step 10's guard is
    `routePath != null && routeNodes != null && version != seen`. The port's gate is
    `world.closures !== null`. A port that always allocates costs memory in every legacy arm
    and, worse, would make step 10 reachable in a run that must be bit-identical.
32. **`nodesToSource` returning null is a corrupt tree, not a modelling outcome** — the chooser
    already established a finite distance. Throw, matching `step.ts`'s existing
    `buildRouteLeg` throw.
33. **All shelters are recomputed, including `operating == false` ones.**
    `shelterList.add(shelter)` at `ContextCreator.java:589` is unconditional. Unobservable
    (the choosers filter on `isOperating()` first), but it sets the tree-memory and per-wave
    timing budget: the full CSV row count — **36** for arms A/B/D, **46** for arm C — not the
    operating subset.
34. **The recompute replaces the tree object; a resident's materialised leg is untouched.**
    That *is* the mechanism. A port that re-derives the leg from `shelter.routeTree` each tick
    erases the stale path and makes `reactToClosureWave` dead code — and every counter zero,
    which looks exactly like the (correct) archive.
35. **`closure_version_at_end` counts waves that FIRED.** A wave past the run end never bumps it
    and gate (k) fails.
36. **Rows sharing an activation hour are ONE wave and ONE version bump.** `wave_hours` is the
    ascending distinct-hour list. Two waves at the same hour cannot exist.
37. **Gate (k) canonicalises pairs with Python `sorted()` over `dtype=str` values** — a
    lexicographic order on strings, not numeric. Equivalent counting for the committed files
    (no leading zeros, no sign); a schedule with `"046509"` would break the gate without
    breaking the model.
38. **Within-wave edge order is NOT observable.** `engine/src/closures/schedule.ts`'s header
    says the within-wave order "can decide path geometry after the recompute" — that is
    **incorrect**: every edge of a wave is blocked before `bumpClosureVersion()` and before any
    `computeTree` call, and the blocked set is a set. Keep file order (it is free and it is the
    certified order), but do **not** write a test asserting an order-dependent outcome; it
    would pass vacuously and mislead. *(Flagged for a doc-comment fix in WP8; no code change.)*
39. **`ClosureWave` is bound by method-name string `"apply"`.** Nothing else on the object is
    scheduled, and the constructor captures `network`, `shelters`, `edges`, `hour` — a wave
    holds a live reference to the shelter list, so late mutations of that list would be seen.
    The port should pass an immutable snapshot.
40. **`blockagesEncountered` counts wave-scans-with-a-hit, not blocked edges.** A wave that
    closes five edges on your remaining route is **one** blockage. Counting per edge inflates
    all three counters while preserving gate (l)'s identity.
41. **A reroute does not increment `retargetCount`** (that is door refusals only), so it can
    never trip the L0 `MAX_RETARGETS` cap. `plannedRouteM` grows by the new leg;
    `networkDistToShelterM` is written once and stays stale by design (V11).
42. **Post-reroute `UNREACHABLE`/`REFUSED_ALL_FULL` is possible.** The S1/S2/S3 connectivity
    gates protect shelter doors and encampment start nodes — not mid-route nodes. Do not assert
    "no resident becomes UNREACHABLE after a wave".
43. **A reroute may switch shelters.** `targetShelter = null` before re-planning, so the
    recomputed trees can send the resident somewhere else entirely. That is intended.
44. **The stuck early-return happens after block 5.** So a stuck resident's dose, exposure,
    unhealthy-hours, peak and outdoor-hours all keep accruing while it waits — *the dose IS the
    penalty* (`GisAgent.java:203-207`). Only movement stops.

---

## 17. Acceptance criteria for WP8's closures half

### 17.1 Reproduces the archive (necessary, not sufficient)

* Gate **(k)** green on all 15 v2 closure runs and all 9 v1 closure runs: code, schedule file,
  `scheduled == matching == rows`, `blocked_edges_at_end == distinct pairs`,
  `closure_version_at_end == wave count`, `wave_hours` exact.
* Gate **(l)** green: all-zero counters on `closuresCode == 0`; the identity and
  `stuck ≤ pushes` per row otherwise (trivially satisfied on the archive — see §0).
* Manifest closure block byte-identical to §12 for at least one run per severity.
* **Own-engine R3 with a closures-inert variant** (plan §8, WP8 acceptance): a run with
  `closuresCode = 0` must be byte-identical on the shared projection to the same run with the
  closure runtime compiled in.
* Post-wave routing effects reproduce the archived direction: E18-v2 closure arms vs their
  `SE2nc` controls, capacity refusals `443/406/327` across draws r1/r2/r3 at seed 42 and
  sheltered counts within ≤ 2 residents across draws (P-SE10/P-SE11).

### 17.2 Gates `reactToClosureWave` where the archive cannot (mandatory)

Because §0 makes the archive silent here, the following must be **synthetic** fixtures with
hand-computed expectations, each isolating one component:

| id | fixture | asserts |
|---|---|---|
| SE-F1 | one walker, one wave closing the edge immediately ahead | `blockages 1`, exactly one of push/reroute, `hit` semantics |
| SE-F2 | the same, with the walker positioned so `off[k] == pathIndex` | grandfathering boundary is `>=` (QUIRK 12) |
| SE-F3 | the same, with the walker one vertex past the junction | grandfathered; **no** counter, **no** draw |
| SE-F4 | wave closes 5 edges on one remaining route | `blockages == 1`, not 5 (QUIRK 40) |
| SE-F5 | two waves, second closes an already-pushed edge | second scan yields no hit; no second `pStuck` draw |
| SE-F6 | two waves, second closes a NEW ahead edge after a push | second blockage adjudicated |
| SE-F7 | push with `pStuck = 1.0` | `stuckUntilTick == tick + stuckDelayH*ticksPerHour`; D ticks of no movement; D−1 ticks at 0.61 and the entry/exit ticks at 1.62 (§10 table) |
| SE-F8 | wave fires during a stuck delay | single deferred scan on the resume tick (QUIRK 20) |
| SE-F9 | reroute mid-street | `currentNode == nodes[lastReached]`; `snapGapM` grows by the geodesic from the **materialised** position (QUIRK 14); the resident still walks a full step that tick |
| SE-F10 | reroute with `pathIndex == 0` | `lastReached == 0` |
| SE-F11 | decision layer OFF + closures ON | every blocked resident reroutes; `pushThroughs == 0`; `decisionRng` never touched (QUIRK 21) |
| SE-F12 | `sigmaTheta = 0`, `pushThetaThreshold = 0`, `kPush = 1`, unburdened mobile resident | `0 >= 0` ⇒ **push** (QUIRK 23) |
| SE-F13 | mobility-limited resident, same config | `0 >= 0 + 1.0*(0 + 1.0)` ⇒ **reroute** |
| SE-F14 | per-agent stream | stuck draws come strictly after that agent's hazard draws; draw count == `pushThroughs` (§14.2) |
| SE-F15 | wave at `hour == endHours` | fires, warns, bumps the version (QUIRK 1) |
| SE-F16 | schedule with a phantom pair | not blocked; `blocked_edges_at_end` unaffected; `matching < scheduled` warned (QUIRK 5) |
| SE-F17 | schedule with a duplicate pair across two waves | `blocked_edges_at_end` counts it once; both waves still bump the version |
| SE-F18 | `pathIndexOf` vs an incrementally maintained counter over a full arm-A run | agreement at every tick (§8.2) |

### 17.3 Graph-parity against the certified connectivity reports

Re-derive, from the port's own packed graph and the committed CSVs, the `graph` census
(§13.2) and the S1/S2/S3 outcomes at every cumulative wave state (§13.4), and assert them
against all five archived reports. This validates the node-id vocabulary the schedules are
written in — independently of the tick loop, and therefore independently of §0's silence.
Use arm C's 46-site file as the shelter set, matching `build_closures_E.py:180` (§13.5).

---

## 18. Open items this spec does not resolve

* **`reactToClosureWave` has no archive-validated behaviour.** §17.2 is the mitigation, not a
  substitute. Any UI surface that reports push/reroute/stuck numbers must be badged
  differently from arm-level outcomes.
* **QUIRK 26's mechanism is unexplained.** The `-8.0`-survives/`-0.25`-zeroes pair is recorded
  as an observation with a truncation hypothesis; the port sidesteps it by reading executed
  values from manifests, but the batch-file semantics are not fully characterised.
* **QUIRK 38 is a documentation defect** in `engine/src/closures/schedule.ts`'s header comment
  (within-wave order claimed observable). No code change; the comment should be corrected when
  WP8 touches the file.
* **Fractional wave ticks** (QUIRK 3) are unexercised by any certified config. The spec
  requires a build-time throw; if a future preset needs a non-integral `minutesPerTick` the
  tick loop itself needs redesign, not just this hook.
