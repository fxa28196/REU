# DR-WP8 — the Java CLOSURE-WAVE oracle

**Status: CLOSED with measurements.** The dumper compiles, runs, and regenerates
byte-identically across two independent runs. **1,024 self-checks, 0 failures.**
Every wave of both certified Scenario-E schedules is represented, and the five
archived connectivity reports are reproduced **field for field: 402 fields
compared, 0 mismatches.**

| Artefact | Path |
|---|---|
| Dumper source | `websim/pipeline/java-exporter/src-closures/websim/exporter/closures/` |
| Run command | `websim/pipeline/java-exporter/dump-closure-fixtures.ps1` |
| Dumps + SHA-256 manifest | `websim/pipeline/out/closure-fixtures/` (git-ignored) |
| Certified sources read (never written) | `Geography/src/geography/{agents/ContextCreator,agents/GisAgent,agents/Shelter,agents/ELayerSampler,agents/PopulationSampler,routing/StreetNetwork,env/SmokeField,data/CsvLoader}.java` |
| Archived targets | `docs/runs/scenario-e-closures/*.json`, `Geography/batch/batch_params_2026_{SE_E18,SE2_E18_d1}_seed4{2,3,4}.xml` |
| Spec this implements | `websim/docs/WP8-SPEC-closures.md` (§3, §13, §17.2, §17.3) |

```powershell
# full run (waves + reaction + connectivity, seeds 42-44), ~7 min after compile
powershell -File websim\pipeline\java-exporter\dump-closure-fixtures.ps1

# the acceptance run actually executed for this DR (doubles the runtime)
powershell -File websim\pipeline\java-exporter\dump-closure-fixtures.ps1 -Verify

# parts / seeds / full post-wave trees
powershell -File websim\pipeline\java-exporter\dump-closure-fixtures.ps1 -Parts connectivity
powershell -File websim\pipeline\java-exporter\dump-closure-fixtures.ps1 -Seeds '42' -FullTrees
```

---

## 1. Acceptance, as run

| Criterion | Result |
|---|---|
| Dumper compiles | `javac` clean against the certified `geo-classes` + the Repast 2.11.0 fileTree classpath (`Geography/build.gradle`'s spec, assembled exactly as `scripts/run-headless.ps1`) |
| Dumper runs | exit 0; **1,024 self-checks, 0 failures**; 21 files, 29.4 MB |
| Every wave in the SE-E18 schedule is represented | **1 / 1** wave (hour 79, tick 4,740, 18 edges). And **6 / 6** for SE2-E18-d1 (hours 3, 44, 72, 142, 265, 303; 15+12+12+11+11+11 = 72 edges) |
| …at seeds 42, 43, 44 | all three run; **every per-wave tree rollup is bit-identical across the three seeds** (asserted, not assumed — §5) |
| Regenerated connectivity report matches the archive | **402 / 402 fields**, 5 reports, 21 cumulative wave states, **0 mismatches** |
| No model arithmetic reimplemented | the wave is `ContextCreator$ClosureWave.apply()` itself; the reaction is `GisAgent.step()` itself; §2 lists every line that is *not* certified and why |
| Dumps regenerate byte-identically | **21 files, 0 differences** across two independent runs (`-Verify`) |
| Post-wave shelter trees | **324 tree states** digested (36 shelters × 2 wave states for SE-E18, × 7 for SE2-E18-d1), covering **9,790,041 distance+predecessor entries**; 41,472 stride-sampled raw-hex rows shipped |
| Agent reaction exercised | **351 blockage events** — 147 pushes, 204 reroutes, 102 stuck events, 135 grandfatherings, 27 *deferred* adjudications — where the archive has **0** |

`npm run ci` was **not** re-run: this work package adds no TypeScript, and the
one tracked file it touches outside `src-closures/` is `websim/.gitignore`
(one line, `pipeline/java-exporter/out-closures/`).

---

## 2. What is certified, and what is not

### 2.1 Invoked, never re-implemented

The whole point of this dumper is that it *calls* the instrument of record.

* **The wave.** `ContextCreator$ClosureWave` is constructed reflectively (its
  constructor is package-private) and handed to a **real Repast `Schedule`** at
  `ScheduleParameters.createOneTime(hour * ticksPerHour,
  ScheduleParameters.FIRST_PRIORITY)` — the identical call
  `ContextCreator.java:687-690` makes — then executed. So the block→bump→recompute
  order, the `hasEdge` phantom guard, `blockEdge`'s two halves,
  `blockedEdgeCount()`'s `directed/2` truncation, `bumpClosureVersion()` and the
  36 `computeTree` recomputes are the certified ones. The dumper reads the
  network *afterwards*.
* **The reaction.** `GisAgent.step()` is called on live `GisAgent` objects inside
  a `DefaultContext` + a `"Geography"` `DefaultGeography` projection +
  `RunState` master context + a `DefaultParameters` map — the `MovementTrace`
  pattern, extended with `network.declareClosureSchedule()` before any resident
  exists (build step 9) so `routeNodes` is allocated. Not one line of the ahead
  scan, the `>=` grandfathering test, the V51 push inequality, `pairKey`, the
  `pushedBlockages` bookkeeping, the `pStuck` draw or the reroute reset is
  transcribed anywhere in `src-closures/`.
* **Everything scientific underneath**: the shapefile read, the U-27 filter, the
  corrupt-node correction and node ids (via `CertifiedGraph`, unchanged from
  WP5/F1), `nearestNode`, `computeTree`, `nodesToSource`, `isBlocked`,
  `CsvLoader`, `Shelter`, `SmokeField`, `PopulationSampler`, `ELayerSampler` and
  `GisAgent.DecisionConfig`.

### 2.2 Mirrored — two `ContextCreator.build()` blocks

Same reason `WorldFixtures` and `MovementTrace` already mirror blocks of it:
`build()` needs a `Geography.rs` scenario directory and a full Repast parameter
schema, neither of which exists in a bare exporter JVM.

| mirrored | certified lines | why it is safe |
|---|---|---|
| shelter loop | `ContextCreator.java:546-591` | CSV **file order**, certified snap, certified tree, `shelterList.add` **unconditional** (QUIRK 33). Contains no routing arithmetic — it delegates to `nearestNode`/`computeTree`. Opening windows, triage reserves and the pet/adults columns are omitted: `ClosureWave.apply()` reads none of them. |
| closure-schedule loader | `ContextCreator.java:646-679` | `TreeMap<Integer, List<long[]>>` keyed by activation hour, **file order inside an hour**, the phantom census, the `hour >= endHours` inert *warning* recorded but never used to skip a wave (QUIRK 1). It only groups rows. |

### 2.3 Written here, because the certified model does not contain it

**The connected-component analysis of the *blocked* graph.** `StreetNetwork`
computes components once, for its pre-closure `ValidationReport`; nothing in
`geography.*` ever recomputes them under closures. That analysis lives only in
`scripts/build_closures_E.py`, the schedule **certifier**. So
`ConnectivityOracle.componentMap` is transcribed from that script
(`build_closures_E.py:459-476`) and the S1/S2/S3 derivation from `:611-670` —
*not* from any `geography.*` class. It is checked, not trusted: a wrong
transcription could not agree with the archive on 12 fields × 21 wave states.
The graph it traverses, the node ids, the edge set, `nearestNode` for all 46
shelters and all 3,400 encampment points, and the pre-closure component count
all come from the certified `StreetNetwork`.

**A blocked-state reset.** The certified class has no un-block operation, and
this dumper runs 8 wave configurations and 45 reaction worlds against one graph
instance. `Certified.resetBlockedState` clears `blockedAdj` and zeroes
`closureVersion` by reflection. **It is verified, not assumed:** a 36-tree
fingerprint of the pristine arm-A shelter trees
(`8af1068a79352695570c1ed400e26227657aee327f6e51e431f31cb12e9f5545`) is taken
before anything is ever blocked and re-taken after every reset; a drift throws.
It passed 9 / 9 times.

**A minimal JSON reader** (`Json.java`) for the archived reports — pure I/O, no
external jar on the exporter classpath.

---

## 3. The shelter-tree dump: WP5's format, reused

WP5 proved 118 trees / 3,539,712 distances and predecessors bit-equal using
`src-world/.../ShelterTrees.java`'s row form. This work package **reuses that
form verbatim** rather than inventing a second one. The canonical byte stream
per tree is:

```
<node_id> \t <dist_m_hex> \t <predecessor_directed_edge> \n
```

* rows **ascending by `node_id`**, over exactly the nodes present in
  `ShortestPathTree.distM` — a node absent from the stream is unreachable
  (`+Infinity`), so the reachable **set** is part of the oracle;
* `dist_m_hex` = `%016x` of `Double.doubleToRawLongBits` — raw IEEE-754 bits;
* `predecessor_directed_edge` = `featureIndex*2 + dir` (`dir` 0 = as-loaded
  orientation, 1 = the reversed back-edge), the identity
  `CertifiedGraph.directedEdgeId` assigns; `-1` at the source;
* UTF-8, LF, no header, no trailing blank line.

**The full trees are too large to ship** (324 states × ~30 k–60 k rows ≈ 280 MB
at the measured size), so the dump is, per the task's own escape hatch:

1. `trees.tsv` — for **every** shelter, in shelter-CSV load order, at **every**
   wave state including state 0 (pre-closure): source node, reachable-node count,
   and the **SHA-256 over the FULL array** in the form above;
2. `trees-sample.tsv` — a documented deterministic subset: `Io.stride(reachable,
   128)` indices, endpoints always included, dumped as raw hex rows;
3. `waves.tsv` — a per-wave **rollup**: SHA-256 over the 36 per-shelter digests
   in load order, so one 64-hex string pins an entire wave state.

**The digest was cross-checked against an independently computed one.** Running
with `-FullTrees` writes every row to
`waves/<config>/full-trees/wave-N/tree-NNN.tsv`; Python's `hashlib.sha256` over
the bytes of `waves/SE-E18/full-trees/wave-1/tree-000.tsv` gives
`25a83319040d42a8453b43b250ea8045d665cf836b1b3d010bc88edf66174178`, which is
exactly the digest `trees.tsv` records for that tree. 324 full trees, 280 MB,
exercised once; the default dump omits them.

So the port proves **full** equality by recomputing this digest over its own
recomputed tree, and only ships 128 rows per tree for regression value.

### 3.1 What the closures actually did to the trees

Measured from the shipped `trees.tsv` (reproduce with the snippet in §8):

| config | wave | trees changed vs previous state | reachable-node delta per affected tree |
|---|---|---|---|
| SE-E18 (`closures_E_r1`) | 1 (h79) | 33 / 36 | −6 |
| SE2-E18-d1 (`closures_E_r1_worst`) | 1 (h3) | 33 / 36 | 0 |
| | 2 (h44) | 33 / 36 | −2 cumulative |
| | 3 (h72) | 33 / 36 | −16 cumulative |
| | 4 (h142) | 33 / 36 | −19 cumulative |
| | 5 (h265) | 33 / 36 | −20 cumulative |
| | 6 (h303) | 33 / 36 | −22 cumulative |

**Those cumulative losses are exactly the archived
`nodes_losing_reachability`** — `6` for r1 and `0, 2, 16, 19, 20, 22` for
r1_worst. That is two *independent* computations agreeing: the left column comes
from certified Dijkstra reachable sets, the archived column from the certifier's
component traversal. It is recorded as a **measurement made from the shipped
dumps**, not as an in-run assertion — the identity holds because every closed
edge of these schedules sits in the 27,543-node demand component and every one
of the 33 affected shelters snaps into it, and encoding that as a test would bake
in a property of the committed draws rather than of the mechanism.

The 3 unaffected trees are the shelters that snap into the disjoint
59,725-node RLIS component (`shelter_components.why_not_largest_component` in
the archived reports explains why the graph has two).

---

## 4. Part 3 — the connectivity reports, field for field

`connectivity/compare.tsv` has one row per compared field with the archived
value, the regenerated value and a match flag. **402 rows, 402 matches.**

| section | fields per report | reports / wave states | total |
|---|---|---|---|
| `graph` | `walkable_features`, `nodes`, `undirected_edges`, `corrected_node_sites`, `components`, `component_sizes_top5`, `freeway_features_excluded`, `freeway_km_excluded` | 5 reports | 40 |
| `connectivity_check[]` | all 14 emitted keys (`wave`, `hour`, `edges_blocked`, `shelters_with_no_unblocked_incident_edge`, `shelters_severed_from_their_component`, `components_before`, `components_after`, `components_split_by_the_closures`, `nodes_losing_reachability`, `graph_nodes_total`, `encampment_points_total`, `encampment_points_losing_some_shelter_access`, `encampment_points_losing_all_shelter_access`, `encampment_shelter_pairs_lost`) | 21 cumulative wave states | 294 |
| `checks[]` S1 / S2 / S3 details | e.g. `"0 of 46 stranded"` | 21 wave states × 3 | 63 |
| `checks[]` "no duplicate closed edge" | e.g. `"72 rows, 72 distinct pairs"` | 5 | 5 |

`connectivity/<name>.regen.json` carries the regenerated blocks in the archive's
own key order for direct diffing.

### 4.1 The two blocked-set vocabularies — proved equal, not assumed

`build_closures_E.py` keys its cut on
`pair_key = (min(attr_f, attr_t), max(attr_f, attr_t))` — RLIS **attribute** ids
— while `ClosureWave.apply()` keys the model's blocked set on **graph** node
ids. They differ at the 25 corrected node sites. The dumper asserts, for all
five schedules and all 268 closed pairs (18 + 34 + 72 + 72 + 72), that

* exactly one feature carries that attribute pair (**0 ambiguous** — the
  archive's check 2 re-derived), **and**
* exactly one feature joins those two graph nodes, **and**
* those two feature sets are the same set.

All three hold for every row of every schedule, so on the committed data the two
vocabularies select the identical edge set. This is a property of the data, not
of the mechanism (spec §13.5 says the same about check 2); a schedule with
parallel features would need the graph-pair reading.

### 4.2 What was NOT regenerated, and why

Reported explicitly rather than quietly omitted.

| archived field | why not regenerated |
|---|---|
| `generated_utc` | a wall clock. Regenerating it would be meaningless and would break byte-identity. |
| `site_seed`, `site_selection_rng`, `waves[].{bridges,arterials,locals}`, `worst_family_wave_windows`, `class_weight_model`, `bridge_pool`, `arterial_pool`, `local_pool`, `demand_bounding_box`, `shelter_components` | properties of the **seeded Python draw** and its candidate pools, not of the graph. Reproducing them means re-running `build_closures_E.py`'s `random.Random(site_seed)` stream, which is the certifier's job; the resulting schedules are already committed and are what this oracle consumes. |
| `closures[].{rlis_type,length_m,midpoint_lonlat}` | report-only feature attributes. `CertifiedGraph` retains the geodesic length and the polyline, but **not** the RLIS `TYPE` column, so the freeway-type check (archived check 1) cannot be re-derived without re-reading the DBF. Registered as an open item (§7). |
| `checks[]` 1, 3, 4, 6, 7, 8 (freeway TYPE, the V26 pedestrian-legal bridge list, the 1,000 m detour severance test, the demand bounding box, the severity plan, the wave-1 evidence window) | draw/label properties, again generator-side. Only the graph-connectivity checks (S1/S2/S3) and the duplicate check are graph-derivable. |
| `schema`, `generator`, `status`, `provenance_note`, `limitations`, `output_csv`, `csv_columns` | prose and constants. `schema`, `generator`, `status` and `output_csv` are **carried verbatim** into the regenerated JSON (A-34 requires `status` to travel with any named schedule); `provenance_note` and `limitations` stay in the archived file the port ships on its Provenance screen. |

**Nothing that was compared failed.** The list above is what was never in scope,
not a list of misses.

---

## 5. Part 1 — the wave dump

`waves/<config>/`:

| file | contents |
|---|---|
| `waves.tsv` | one row per wave state (0 = pre-closure): hour, tick, rows in wave, matching rows, `blockedEdgeCount()` after, `getClosureVersion()` after, tree rollup, and whether the load-time inert warning would have fired |
| `edges.tsv` | **the exact ordered set of edges each wave blocks** — CSV file order within the wave, with the CSV row number, node pair, the `hasEdge` guard outcome, label and kind |
| `blocked-pairs.tsv` | the **cumulative** canonical `min:max` blocked pair set after each wave, ascending, read out of `blockedAdj` |
| `trees.tsv` / `trees-sample.tsv` | §3 |
| `../seed-invariance.tsv` | per-wave rollup at seeds 42 / 43 / 44 |

Gate (k) is asserted per config per seed, from the **live network** rather than
from the CSV: `closure_version_at_end == wave count`, `scheduled == rows`,
`blocked_edges_at_end == distinct CSV pairs`, `matching == scheduled`,
`wave_hours` exact and ascending, no self-loop (QUIRK 4), last wave hour
`<= endHours` (with `endHours = min(simulationHours, smokeField.hours())` from
the **certified `SmokeField`** for that config's series). Wave ticks are asserted
integral (QUIRK 3).

Measured: SE-E18 → 18 scheduled / 18 matching / 18 blocked / version 1 / hours
`[79]`. SE2-E18-d1 → 72 / 72 / 72 / version 6 / hours `[3, 44, 72, 142, 265,
303]`. Both agree with the archived manifests' closure census.

**Seed invariance is asserted, not argued.** Spec §14.1 says `ClosureWave.apply()`
consumes no RNG. The dumper runs the entire wave sequence at all three seeds and
checks that the 2 (resp. 7) tree rollups, `blocked_edges_at_end` and
`closure_version_at_end` are identical across 42/43/44. They are. It separately
checks that the three batch files declare identical
scenario/closure/smoke/run-length parameters, so the invariance claim is about
the mechanism and not about three accidentally-equal configs.

Configuration is **read from the archived batch XML**, never retyped
(`RunConfig`), so a config drift shows up as a dump difference. Note QUIRK 26:
both SE families were re-emitted at `de7c045` with
`constant_type="double"` for `pushThetaThreshold = -0.25`, so the declared text
this reader takes *is* the executed value; the dumper does not emulate Repast's
batch coercion, which is a batch-file artefact rather than model behaviour.

---

## 6. Part 2 — the agent-reaction dump, and why it had to be constructed

### 6.1 The archive is silent here — restated, because it decides the design

Spec §0: **every certified Scenario-E run recorded zero blockage events.**
Departures spread over ~455 h against a ~24-minute median walk leave ≈ 4 of
6,842 residents mid-walk at any wave instant, and none of their routes crossed
the 18–72 closed edges among 109,434. So a completely wrong
`reactToClosureWave` reproduces the archive exactly. A dumper that only replayed
SE-E18 at seeds 42–44 would therefore have produced an **empty** reaction
oracle. This one instead places certified walkers where waves must reach them.

**The fixture is constructed; the answers are not.** A probe pass runs the world
with no closures and snapshots each traced walker's certified `routeNodes` chain,
`coordOffset` array and `pathIndex` at the end of tick `T-1`. Variant passes then
rebuild the byte-identical world and schedule certified `ClosureWave` objects at
`FIRST_PRIORITY` on tick `T`, closing edges chosen off those snapshots. Every
number in `events.tsv` is then read off the certified agent before and after
`step()`.

### 6.2 Matrix and results

3 configs × 3 seeds (42/43/44) × 4 variants × 12 walkers = 36 runs.

| variant | closes | observed |
|---|---|---|
| `ahead` | the first edge with `coordOffset[k] >= pathIndex` | 12 / 12 walkers adjudicate, every run |
| `behind` | the last edge with `coordOffset[k] < pathIndex` | **0 blockage events, 108 GRANDFATHERED** — the version is consumed by one scan (QUIRK 9) and no counter moves (QUIRK 12) |
| `multi5` | five consecutive ahead edges per route | **12 blockage events, not 60** (QUIRK 40) |
| `twowave` | an ahead edge at `T`, a further one at `T + 60` | second wave adjudicated; 27 of those adjudications are **deferred** |

| config | decision layer | result |
|---|---|---|
| `armed` (SE-E18's V49–V51 values) | on, `pushThetaThreshold = -0.25`, `kPush = 1.0`, `pStuck = 0.3` | both branches taken, split by each walker's own `thetaScaled` and `barrierCost` |
| `armedStuck1` | as above, `pStuck = 1.0` | `stuckEvents == pushThroughs` in every run |
| `layerOff` | `enableDecisionLayer = 0` | **0 push-throughs, all reroutes**, `decisionRng` null and untouched (QUIRK 21) |

Totals across the 36 runs: **351 blockage events = 147 pushes + 204 reroutes**
(the gate-(l) identity holds per agent in all 432 per-agent checks), **102 stuck
events ≤ 147 pushes**, 135 grandfatherings, 81 `NOT_REACHED`.

`events.tsv` carries, per adjudication: the pre-step `pathIndex`, the ahead-edge
count, the derived decision, `stuckUntilTick` as raw hex, the four counter
deltas, `thetaScaled`, `barrierCost`, `mobilityLimited`, the three barrier flags,
the raw `thetaZ` and whether the per-agent stream advanced.
`ticks.tsv` carries 86,832 before/after snapshots over a window that spans the
whole `stuckDelayH` delay, including `airVolumeBreathedM3` and `inhaledDoseUg` so
the RESTING-vs-WALKING ventilation table (spec §10) is directly checkable, and
the **raw `java.util.Random` internal seed** of each agent's decision stream, so
the port — which already has bit-exact `java.util.Random` from WP0 — can compare
stream state rather than draw counts.

### 6.3 Two deliberate deviations from the SE-E18 batch file

Both take **certified** code paths; both are necessary to get a bounded fixture
in which walkers are mid-route at a common tick. They are named here so nobody
reads the reaction dump as an archive replay.

1. `enableHazardDeparture = 0` with `enableDecisionLayer = 1`. This is the branch
   the Java itself labels *"decision layer on but hazard OFF (the R3 null): the
   legacy latch below runs identically, every tick"* (`GisAgent.java:426-433`).
   Under the county-uniform smoke field every walker then departs on the same
   tick. With SE-E18's `alphaHazard = -8.0` hazard departure staggers over 455 h,
   and a 96-hour fixture would contain almost no simultaneous walkers.
2. `pAwareInit = 1.0` (SE-E18 uses 0.356). With `lambdaOutreachPerDay = 0` an
   UNAWARE resident can never become aware and never departs.

Everything else is SE-E18: `informationRegime = 1` (L1), `sigmaTheta = 1.0`,
`barrier* = 0.26`, `petPolicyDefault = 0`, `betaTravelTime = 1.0`,
`betaCapacityPrior = 0.2`, `enableHeterogeneity` on via the certified
`PopulationSampler`, and the V49–V51 coefficients as tabulated above. Walkers
start at synthetic points offset from graph nodes, never at real campsite
coordinates (the `MovementTrace` Q4 rule).

---

## 7. Findings

### WP8-C1 — the reaction fixture needs a global ahead-edge filter (fixed)

The first `behind` run reported **1 blockage event instead of 0** in every one of
the 9 (config, seed) combinations. The cause is not the model: the 12 traced
walkers converge on the same 36 shelters, so an edge already *behind* walker *i*
can still be *ahead* of walker *j*, and closing it legitimately adjudicated *j*.

Fixed by computing the union of ahead-edge pair keys across all traced walkers
and dropping any candidate in it, so the `behind` wave contains only edges behind
**every** walker. The variant then asserts three things rather than one:
0 blockage events, at least one walker still covered, and **12 / 12
GRANDFATHERED with 0 NOT_REACHED** — i.e. every walker did enter step 10 and did
consume the version in a single scan. Without that third assertion the "0
blockages" result would also be satisfied by a port that never ran the scan at
all.

### WP8-C2 — deferred adjudication is real and observable (QUIRK 20)

27 of the 567 adjudications happen on a tick that is **not** a wave tick: a
walker stuck at a blockage returns from step 9 before step 10, so a wave that
fires during its delay is adjudicated on the resume tick. All 27 are in the
`twowave` variant (7 `armed`, 20 `armedStuck1`), and all 27 are `PUSH`.

The first version of `events.tsv` only emitted rows at wave ticks and therefore
*silently dropped* those 27 — its PUSH row count was 120 against a certified
counter total of 147. The emitter now fires on "wave tick **or** version
consumed", and the two agree at 147. Recorded because a port that adjudicated
deferred waves at the wrong tick would have been invisible in the first version
of this fixture.

### WP8-C3 — the dumper silently dumped one seed (fixed)

`-Seeds 42,43,44` binds in PowerShell as an array and renders into the java
`@argfile` as `42 43 44`; java's argfile parser splits on whitespace, so the
three seeds arrived as three separate program arguments and `args[2]` was
`"42"`. The run looked completely healthy and produced seed-42-only output. Fixed
by quoting both list arguments in the argfile and by splitting on `[,\s]+`
java-side. Recorded because the failure mode was a green run with a third of the
work missing — exactly the kind of thing the seed-invariance assertion now also
catches.

### WP8-C4 — `reactToClosureWave` remains archive-unvalidated

Restating spec §0 §18 as a finding of *this* work package, because the dump might
otherwise be read as certification. Part 2's 351 events are produced by certified
Java, so they are a **correct oracle**; they are not evidence that any archived
run ever took a push or a reroute. Any UI surface reporting push / reroute /
stuck numbers must be badged differently from arm-level outcomes.

---

## 8. Reproducing the §3.1 measurement

```python
# from websim/pipeline/out/closure-fixtures/
import collections
for f in ['waves/SE-E18/trees.tsv', 'waves/SE2-E18-d1/trees.tsv']:
    sha, reach = collections.defaultdict(dict), collections.defaultdict(dict)
    for line in open(f):
        if line.startswith('#'):
            continue
        p = line.rstrip().split('\t')
        sha[int(p[0])][int(p[2])] = p[7]
        reach[int(p[0])][int(p[2])] = int(p[6])
    for w in sorted(sha)[1:]:
        changed = sum(1 for i in sha[w] if sha[w][i] != sha[w - 1][i])
        delta = sum(reach[w][i] - reach[0][i] for i in sha[w])
        # delta is the TOTAL over 36 trees; the per-affected-tree figure in the
        # table above is delta / changed (the 3 unaffected trees contribute 0).
        print(f, w, changed, delta, delta // changed)
```

---

## 9. Compliance

Nothing outside `websim/` was created, modified or deleted. `Geography/src/**`,
`Geography/batch/**`, `Geography/data/**` and `docs/runs/scenario-e-closures/**`
were **read**; the certified sources were **compiled read-only into
`websim/pipeline/java-exporter/geo-classes/`** and the exporter into
`out-closures/` (both git-ignored). No git-mutating command was run. The only
tracked file changed outside `src-closures/` is `websim/.gitignore`, one added
line for `out-closures/`.

The connectivity part reads the real campsite-report CSV — it must, because the
archived S3 gate is defined over those 3,400 points — and writes **only counts**:
no coordinate and no snapped node id for any campsite reaches a dump.

## 10. Open items

* **`closures[].rlis_type` / archived check 1 (no closure carries a freeway RLIS
  TYPE) is not re-derived.** `CertifiedGraph` does not retain the DBF `TYPE`
  column. Re-reading `Streets.dbf` in the exporter would close it.
* **`-FullTrees` was exercised once** (324 trees, 280 MB, one digest
  independently cross-checked). It is not part of the default run and is not
  covered by the `-Verify` byte-identity pass.
* **Component-index tie-breaks.** `build_closures_E.py`'s `main_frag` picks
  `max(sorted(d), key=lambda q: (d[q], -q))`, so an exact size tie between two
  fragments of one pre-closure component would be broken by discovery order.
  The reported quantities (`nodes_losing_reachability`, `components_*`, the camp
  counters) are invariant under that choice; `shelters_severed_from_their_component`
  is not, in principle. It is empty in all five archived files and in all five
  regenerations, so the difference is unobserved rather than proved impossible.
* **Snapping ties.** WP5-F2 found 7 coordinate-tied snap queries among the 3,400
  encampment points, where Java's STRtree hash order and the Python
  `DegreeGrid`'s bucket scan could in principle disagree. This regeneration uses
  the certified `nearestNode` and still matches the archive on every camp
  counter, so no tie changed a component assignment here — but the two snappers
  are not proved identical in general.
* **The reaction fixture is 96 simulated hours and 12 walkers**, chosen so the
  dump stays reviewable. Spec §17.2's SE-F7 (the full RESTING/WALKING ventilation
  table) and SE-F18 (`pathIndexOf` vs an incrementally maintained counter) are
  *supported* by `ticks.tsv` but are assertions for the TypeScript side to make;
  this dumper does not make them.
