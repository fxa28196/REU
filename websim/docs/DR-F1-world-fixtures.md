# DR-F1 — Java fixture exporter for WP5 (routing) and WP6 (world build)

**Status:** CLOSED with measurements. All three deliverables produced; **164 self-checks
green, 0 failures**; **byte-identity verified across two independent runs (190 files,
0 differences)**. One documentation defect found and fixed (**F1-F1**), one pre-existing
structural fact recorded for the user (**F1-O1**).

**Date:** 2026-07-31 · **Repo commit at task time:** `de7c045` (websim/ untracked)
**Environment:** Windows 11, JDK 17.0.19+10, Repast Simphony 2.11.0

---

## 1. What was produced

| # | Deliverable | Where | Size |
|---|---|---|---|
| (a) | **Shelter shortest-path trees** — full per-shelter Dijkstra distance array + predecessor-edge array, arms A/B/C | `pipeline/out/world-fixtures/trees/` (git-ignored) | 108 MB, 118 trees + 6 path-probe files + 3 indexes |
| (b) | **World-build fixtures** — 13 configs × seeds 42/43/44, per-resident index order | `pipeline/out/world-fixtures/{world,shelters,snap,smoke,closures}/` (git-ignored) | 45 MB, 39 resident dumps + 13 shelter tables + 3,400-camp snap table + 3 smoke series + 4 closure schedules |
| (c) | **HALF_UP formatter fixtures** | `engine/test/fixtures/format/half-up-format.tsv` (**committed**, 258 KB) + `half-up-divergences.tsv` (106 KB) | 2,702 doubles × 7 precisions |
| — | **Manifest** — every dump with SHA-256, line count, 6-line head, and all 164 self-checks | `engine/test/fixtures/world/manifest.json` (**committed**, 278 KB) | 191 dumps, 152.5 MB total |
| — | **Committed stride-sampled oracles** (so CI has a real oracle without the bulk tree) | `engine/test/fixtures/world/{trees-sample,residents-sample}.tsv` | 252 KB + 222 KB |

Every floating value in every dump is the raw `%016x` of `Double.doubleToRawLongBits`.
Decimal text for a double appears only in explicitly-labelled human-readable columns and
is never the value a port is compared against.

**Reproduce:**

```powershell
powershell -File websim\pipeline\java-exporter\dump-world-fixtures.ps1            # ~4 min
powershell -File websim\pipeline\java-exporter\dump-world-fixtures.ps1 -Verify    # ~8 min, proves byte-identity
powershell -File websim\pipeline\java-exporter\dump-world-fixtures.ps1 -SkipTrees # fast iteration (manifest marked INCOMPLETE)
```

---

## 2. What is invoked vs. what is mirrored

Nothing certified is re-implemented. The exporter computes **no** geodesic length, no
node id, no correction, no random draw, no CSV parse and no rounding of its own.

| Certified thing | Reached how | What it owns |
|---|---|---|
| `StreetNetwork#nearestNode / computeTree / geodesicDistanceM / nodeCoordinate / pathToSource / nodesToSource / hasEdge` | public API | **all** snapping, Dijkstra, path reconstruction, `coordOffset` |
| `StreetNetwork.ShortestPathTree.distM / .predecessorEdge` | private fields, read-only reflection | the tree is *read out*, never rebuilt (no enumeration API exists) |
| `StreetNetwork#addStreet / recordExcludedFeature / polylineLengthM / buildIndex / getValidationReport / resolveGraphId` | public + one private | corrupt-node correction, synthetic negative ids, adjacency order |
| `PopulationSampler(seed).sample()` | direct construction | seed derivation `seed*1000003+17`, the 8-step draw order, truncated-normal rejection loop, Gaussian cache |
| `ELayerSampler(seed, …).sample()` | direct construction | seed derivation `seed*1000003+7919`, unconditional draw order, raw `thetaZ`, `decisionSeed = seed*2654435761 + i*104729` |
| `Shelter` | direct construction + certified setters | `setReservedForPriority` clamp, open/close-window fields, pet/adults-only policy |
| `SmokeField(csv, "Multnomah", SIM_START, scale)` | direct construction | hourly mean, NaN-gap semantics, `peakHourly()` |
| `CsvLoader.read` | public static | BOM strip, quote state machine, per-field trim, short-row padding |
| `ScienceRegistry.load` | public static | the governance fail-fast (invoked and recorded, though it feeds no fixture) |
| `ContextCreator#tickForDate` | private static, reflection | the open/close tick arithmetic incl. the **+1 day** close offset |
| `ContextCreator` constants (`STREETS_SHP`, `NON_PEDESTRIAN_TYPES`, `ENCAMPMENTS_CSV`, `SMOKE_*`, `SHELTERS_*`, `CLOSURES_*`, `SIM_START`, `SCENARIO_*_NAME`, registry paths) | private static fields, reflection | the exporter cannot drift from a renamed data file or a changed TYPE set |
| `repast.simphony.random.RandomHelper#init/setSeed/nextIntFromTo` | public static, reflection | the Repast **default stream** — the one build-time draw per resident |
| `ContextCreator#loadFeaturesFromShapefile` | private, reflection | shapefile read + Web-Mercator→WGS84 reprojection |

### 2.1 Where the certified code resisted headless invocation

`ContextCreator.build()` **cannot** be called: it requires a live Repast `Context`, a
`Geography` GIS projection, `RunEnvironment`/`ISchedule`, a `Parameters` schema and a
`Geography.rs` scenario directory, none of which exist headlessly. Three of its loops are
therefore **mirrored statement-for-statement**, with the display-only side effects
omitted:

| Mirrored block | Source lines | Omitted |
|---|---|---|
| per-feature street loop | `ContextCreator.java` L455–L486 | `new PortlandStreet(...)`, `context.add`, `geography.move` (display layer, no graph state) |
| shelter loop | L546–L591 | `context.add`, `geography.move`; the `System.out` census printfs |
| resident placement + Phase-E second pass | L710–L790 | `new GisAgent(...)`, `context.add`, `geography.move`, `agent.setStartCoord` (all provenance/display; consume no RNG) |
| scenarioCode → shelter CSV chain | L343–L426 | nothing — but the *mapping* is mirrored (the file **names** are read from the certified constants) |
| closure schedule parse | L639–L707 | the Repast `schedule.schedule(...)` call; the fail-fasts and census are mirrored |

Two further certified paths were deliberately **not** exercised, because they change no
fixture: `network.declareClosureSchedule()` (only sets `hasClosureSchedule()`, which
agents read at run time) and `ClosureWave.apply()` (post-wave trees are a run-time state,
not a build-time one — `ContextCreator` builds shelters at step 8, *before* closures at
step 9, so every dumped tree is correctly the unblocked tree).

### 2.2 How the mirror is held honest

The mirror is not trusted; it is checked, and the run **exits non-zero** if any check fails.

1. **Adjacency reconstruction** — the graph is rebuilt independently from `rawStreets` +
   the certified `resolveGraphId` and diffed against the certified `adjacency` map by raw
   IEEE-754 bits: **0 mismatches**, 218,868 directed-edge identities assigned.
2. **Census assertion** — `88,100 / 109,434 / 171 / 59,725 / 25 affected / 3 reattached /
   22 split / 0 impossible edges`, all exact, with the "4/23 is the **pre-U-27** graph,
   never correct toward it" warning wired into the failure message (DR-S2 §3).
3. **Realised marginals vs the archive** — at every seed, the six
   `population_sampling` values reproduce the archived `simulation.json` at `%.4f`
   **exactly** (see §4).
4. **The three-streams rule, made executable** — cross-config digest invariants (§3).
5. **Two-run byte-identity** — 190 files, 0 differences.

---

## 3. The three-streams rule as executable invariants

PORT_MAP §1.8's RNG-discipline claims are asserted over the dumps themselves, at all
three seeds. All green:

| Invariant | Scope | Result |
|---|---|---|
| camp-assignment vector identical | all **13** configs at a seed | ✅ — the `nextIntFromTo(0, 3399)` per resident really is the only build-time default-stream draw, and it is scenario- and E-parameter-independent |
| sampled demographics identical | all **13** configs at a seed | ✅ — `PopulationSampler` is genuinely on its own stream |
| belongings / pet / dependents / `thetaZ` identical | all **10** decision-layer configs at a seed | ✅ — **even though `pAwareInit` is 1.0 in E0 and 0.356 in ER/SE**: "sweeping any E parameter never reshuffles who owns a pet" is now proven, not asserted |
| full E block (incl. `decisionSeed`) identical within an E-parameter family | 3 E0 configs / 7 ER+SE configs | ✅ |
| the two families **differ** | E0 vs ER at seed 42 | ✅ — so the checks above are not vacuous; `pAwareInit` is the sole cause |
| `RandomHelper` ≡ `new Uniform(new MersenneTwister(seed))` | 6,842 draws × 3 seeds over the production range `(0, 3399)` | ✅ — registry/`init()` construction consumes no draws |

Config matrix (13): `A`, `B`, `C`; `E0-A/B/C` (R3 vehicle, layer ON + every knob
degenerate); `ER-A/C/D` (baseline-real, `shelterPolicyVariant=1`, D at
`triageReserveFraction=0.10`); `SE-E18/E19/E20` (455 h, severe v1, `closuresCode=1`);
`SE2-E18-d1` (worst-plausible v2, `closuresCode=3 closureDraw=1`).

---

## 4. Finding F1-F1 — the published "seed 42" marginals are **seed 48**'s

`IMPLEMENTATION_PLAN.md` L370 / L642 and `PORT_MAP.md` L617 state that the seed-42
realised marginals are `mobility 0.195, asthma 0.147, COPD 0.104, any-resp 0.235,
55+ 0.259, mean speed 1.280`. The certified `PopulationSampler` at seed 42, n = 6,842,
produces **`0.1988 / 0.1478 / 0.1079 / 0.2381 / 0.2622 / 1.2805`**.

The exporter is not wrong — the docs were. Every archived manifest agrees with the
exporter:

| seed | archived `population_sampling` (`%.4f`) | archived run | manifests |
|---|---|---|---|
| **42** | 0.1988 / 0.1478 / 0.1079 / 0.2381 / 0.2622 / 1.2805 | `docs/runs/phase-e/E0null-A-n6842-seed42` | **52** |
| 43 | 0.1995 / 0.1523 / 0.0978 / 0.2343 / 0.2562 / 1.2796 | `docs/runs/phase-e/ER-A-n6842-seed43` | 41 |
| 44 | 0.2093 / 0.1481 / 0.1004 / 0.2331 / 0.2726 / 1.2752 | `docs/runs/phase-e/ER-A-n6842-seed44` | 41 |
| **48** | **0.1954 / 0.1475 / 0.1039 / 0.2353 / 0.2587 / 1.2805** | `docs/runs/present-day-three-arm/A-seed48` | 3 |

Rendered at `%.3f`, seed 48 is `0.195 / 0.147 / 0.104 / 0.235 / 0.259 / **1.280**` — the
quoted quintuple exactly, all six values, including the tie-breaking sixth (seed 42's mean
renders `1.281` at 3 dp while seed 48's renders `1.280`, even though both are `1.2805` at
4 dp). The attribution to seed 42 is a mislabel, not a rounding artefact.

**Actions taken:** corrected `IMPLEMENTATION_PLAN.md` (both sites) and `PORT_MAP.md`, and
replaced the hard-coded expectation in the exporter with the **archive-derived per-seed
table** at `%.4f`, so WP6 is now gated on a stronger check at three seeds rather than a
weaker one at one. Same failure class as DR-S2's finding S2-F1: a figure copied forward
from a different run and then quoted as a contract.

---

## 5. Observation F1-O1 — the shelters are split across two graph components

Not introduced by this task, and already embedded in the archive, but it is load-bearing
for WP5 and was not written down anywhere:

| component | nodes | bbox (lon / lat) | shelters |
|---|---|---|---|
| City of Portland | **27,543** | −122.84…−122.47 / 45.43…45.65 | **33 of 36** in arms A/B (43 of 46 in C) |
| wider tri-county metro | **59,725** (the "largest component") | −123.46…−121.65 / 44.89…45.81 | **3** — `Gresham_Womens_Shelter`, `Rockwood_Bridge_Shelter`, `Stark_Street_Motel_Shelt` |

Those two components are **disjoint in the corrected pedestrian graph**, identically in
all three arms. So the three east-county sites are unreachable from every Portland
encampment, and the ~27.5k-node Portland component — not the 59,725-node "largest
component" — is the one that actually carries the experiment. This is consistent with the
archive (`present-day-three-arm/A-seed42` records `unreachable: 28`, i.e. only the handful
of camps that land in neither of the two): if the split were an artefact, `unreachable`
would be in the thousands.

**Consequences worth carrying:**
- WP5 must **not** assume every shelter tree spans the same node set. `reachable_nodes`
  is dumped per tree and is part of the oracle.
- Arm A's binding capacity is effectively 33 sites, not 36 — worth a sentence wherever
  the 2,234-bed figure is discussed.
- Flagged for the user only; `Geography/` and `docs/` are read-only for this task and
  nothing here changes any archived number.

---

## 6. Finding F1-F2 — Java `%f` rounds the *shortest representation*, not the value

The formatter fixture is not a formality. `java.util.Formatter` converts a double to its
**shortest round-tripping decimal representation first** and then applies HALF_UP to those
digits; C's `printf` and JavaScript's `toFixed` round the **exact binary value**. The two
disagree whenever the shortest representation ends in a literal `5` at the rounding
position while the exact value sits just below it.

> **CORRECTION, 2026-07-31 (cross-oracle audit).** The census originally published
> in this section was **inflated ~5.5×** by a defect in this task's own dumper. It
> read *561 values (20.8%) diverge, giving 1,305 divergent `(value, precision)`
> rows*, with the per-precision table `343 / 290 / 253 / 185 / 116 / 87 / 31`. Those
> are the numbers this DR shipped, and they are wrong; the corrected census is
> below. The finding itself — that Java `%f` rounds the shortest representation —
> stands and is unaffected. See §6.1.

Measured over the 2,702-value table, against ground truth (what Java printed versus
what `Number#toFixed` actually returns): **231 values (8.6%) diverge**, giving **237
divergent `(value, precision)` cells out of 18,851** —

| precision N | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| divergent cells, corrected | 1 | 65 | 75 | 49 | 17 | 27 | 3 |
| *as originally dumped* | *343* | *290* | *253* | *185* | *116* | *87* | *31* |

`OutcomeLogger` uses N ∈ {1, 2, 3, 4, 6} (verified by grep); 0 and 5 are dumped for
margin. Note where the correction bites hardest: at **N = 0 the real count is 1, not
343**. Almost every N = 0 row in the shipped census was an artefact, because *every*
negative in (−0.5, 0) rounds to Java's `-0` while `BigDecimal` produces an unsigned
`0` — a difference in how the census was computed, not in how anything rounds.

Headline rows (`java_out` vs exact-value HALF_UP), all present in
`half-up-divergences.tsv`:

```
0.615  N=2 → Java 0.62   exact 0.61
1.005  N=2 → Java 1.01   exact 1.00
2.675  N=2 → Java 2.68   exact 2.67
0.15   N=1 → Java 0.2    exact 0.1
```

The fifth row this DR used to list — `-0.05 N=0 → Java -0, exact 0`, captioned
"negative zero survives `%f`" — has been **withdrawn**. It is not an instance of the
finding. `toFixed` returns `"-0"` there too; the row appeared only because the
dumper's `BigDecimal` comparand had lost the sign.

### 6.1 The dumper defect, and the cross-oracle that caught it

`BigDecimal` has no negative zero, so a dumper comparing `%f` against
`new BigDecimal(v).setScale(N, HALF_UP)` must restore the sign Java's formatter
prints. `HalfUpFormat.exactHalfUp` restored it only when
`doubleToRawLongBits(v) == bits(-0.0)` — the literal `-0.0` and nothing else. Every
other negative that rounds to zero therefore compared unequal and was booked as a
shortest-representation divergence: **1,047 of the 1,305 flagged cells (80.2%),
spanning 327 of the 561 flagged values, were artefacts.** `toFixed` reproduces Java
exactly on all 1,047, so they were never evidence of anything.

The defect was invisible from inside this fixture family — the dumper agreed with
itself. It surfaced only on comparing this oracle against the WP3 track's
independent one (§10, now closed), where the two disagreed on 14 cells, all of them
negatives rounding to zero, and `MathxFixtureDumper.exactBinaryRound` was right
(`Double.compare(v, 0.0) == -1`, true for every negative).

Fixed in `HalfUpFormat.java`. The committed TSV bytes deliberately still carry the
pre-fix census, so the correction is auditable rather than silently rewritten;
`engine/test/mathx/half-up-cross-oracle.test.ts` pins the artefact count in those
bytes, proves the artefacts spurious, and derives the corrected census from ground
truth so it holds before and after a regeneration.

The table is built deterministically from: hand-picked classics; a systematic
`base.<N digits>5` sweep for every N (built from decimal *text*, so the shortest
representation genuinely ends in 5); `Math.nextUp`/`nextDown` of every one of those (so a
port that pattern-matches "looks like a tie" instead of reproducing the rule breaks); a
magnitude ladder 1e−9…1e21 plus ±1e300; a 400-value `new Random(20260731)` sweep across 13
decades; denormals/±0/NaN/±Inf/`MIN_VALUE`/`MAX_VALUE`; and every published model
constant. A `long_cast` column carries `(long) v` for the `truncCast` port.

---

## 7. Dump formats (what WP5/WP6 compare against)

**`trees/<arm>/tree-NNN.tsv`** — one file per shelter, shelter-CSV **file order**
(load-bearing for the closure waves):

```
# shelter_id=…  index=N  source_node=L
# shelter_lon_hex=…  shelter_lat_hex=…  source_lon_hex=…  source_lat_hex=…
# snap_gap_m_hex=…  reachable_nodes=N  graph_nodes=88100
# node_id \t dist_m_hex \t predecessor_directed_edge
```

- Only nodes present in `tree.distM` are written; **an absent node is unreachable**
  (`distanceTo` returns `+Infinity`), so the reachable **set** is itself part of the
  oracle.
- `predecessor_directed_edge` = `featureIndex*2 + dir` (`dir` 0 = as-loaded orientation,
  1 = the reversed back-edge); the source is `-1`. `featureIndex` is the same index as
  `pipeline/out/graph-dump/edges.tsv`. Because the certified relaxation is strict
  (`nd < old`), the predecessor — hence path geometry — is heap-order dependent: **a port
  that matches distances but not predecessors has not reproduced the routing layer.**
- `trees/<arm>/paths-000.tsv` / `paths-0NN.tsv` add `pathToSource` and `nodesToSource`
  probes (128 stride-sampled sources on the first and last shelter of each arm), including
  `coordOffset` — the array that decides whether a closed street is "ahead" of a walker.

**`world/<config>-seed<N>.tsv`** — 23 columns in per-resident index order:
`i, camp_idx, inc_id, camp_lon_hex, camp_lat_hex, start_node, snap_gap_m_hex,
age_band, age_years, sex, mobility_limited, mobility_category, asthma, copd,
chronic_physical, walking_speed_mps_hex, aware_initial, heavy_belongings, has_pet,
has_dependents, theta_z_hex, group_speed_delta_mps_hex, decision_seed`.
The E block is empty (not fabricated) when the layer is off.

**`shelters/<config>.tsv`** — 17 columns incl. `open_tick_hex`, `close_tick_hex`
(±Infinity when the date gate is off), `reserved_for_priority`, `pet_intake`
(`admit`/`refuse`/**`unrecorded`**), `graph_node`, `snap_gap_m_hex`, `reachable_nodes`.

**`snap/camp-snap.tsv`** — all 3,400 camps: node id, node coordinate, snap gap. Directly
satisfies WP5's "snap assignments for all 3,400 camps" criterion.

**`smoke/series-N.tsv`** — the full certified hourly array in hex. Verified: series 0 =
576 slices / peak 562.7; series 1 = 456 / 984.75; series 2 = 456 / 2496.1.

**`closures/schedule-cN[-dN].tsv`** — the parsed wave map, `wave_hour → wave_tick →
(node_a, node_b, matches_graph_edge)`. Verified: `closuresCode=1` = 18 edges / 18 matching
/ 1 wave; `closuresCode=3 draw=1` = 72 edges / 72 matching / 6 waves; 0 inert at 455 h.

---

## 8. Definition note — two different "snap gaps"

The build-time `snap_gap_m_hex` dumped here is
`geodesicDistanceM(rawCoordinate, nodeCoordinate(nearestNode(rawCoordinate)))` — the
displacement introduced by snapping. It is **not** the same quantity as `GisAgent`'s
`snapGapM` field, which starts at 0 and *accumulates* `geodesicDistanceM(here,
routePath.get(0))` on each route leg (`GisAgent.java` L519) and therefore appears in
`agents.csv`. WP6 should compare against the build-time value; WP7 owns the accumulating
one.

---

## 9. Layout, and what is committed

```
websim/pipeline/java-exporter/
  src-world/websim/exporter/world/{Io,Reflect,CertifiedGraph,ShelterTrees,HalfUpFormat,WorldFixtures}.java
  dump-world-fixtures.ps1
  out-world/                      (git-ignored javac output)
websim/pipeline/out/world-fixtures/  (git-ignored, 152 MB)
websim/engine/test/fixtures/world/{manifest.json,trees-sample.tsv,residents-sample.tsv}   COMMITTED
websim/engine/test/fixtures/format/{half-up-format.tsv,half-up-divergences.tsv}           COMMITTED
```

`src-world/` is deliberately a **separate source root** from `src/`: `build-and-dump.ps1`
(spike S1) globs `src/**.java` with only the GeographicLib jar on the classpath, and these
classes need the whole Repast/GeoTools stack. Merging the three build scripts is still the
right WP4 cleanup (DR-S2 §7) but was not done here — it would put two closed spikes at
risk for no gain to this task.

The bulk dumps are git-ignored under the existing `pipeline/out/` rule. Their SHA-256s are
committed in the manifest, and the stride-sampled `trees-sample.tsv` /
`residents-sample.tsv` give CI a real (if partial) oracle when the bulk tree is absent.

---

## 10. Honest limitations

- **The bulk oracle is not in git.** CI can verify the manifest digests only if the dumps
  are regenerated locally. The committed stride samples (64 rows/tree, 32 residents/config-seed)
  are a genuine oracle but a partial one. Same trade-off WP2-S5 made for the RNG fixtures.
- **`build()` is mirrored, not invoked** (§2.1). Mitigated by the five guards in §2.2, but
  a future edit to any of the four mirrored loops would not propagate automatically. WP4
  should add a CI check that re-diffs the manifest's `graphCensus` against an archived
  `simulation.json` (the script `pipeline/scripts/verify-graph-census.mjs` already exists).
- **Seeds 45–50 are not dumped.** The task specified 42/43/44; plan WP6 asks for 42–50.
  Extending is a one-line change to `SEEDS` and costs ~2 min/seed, but the archived
  marginal references for 45–50 exist only for arm A.
- **No post-closure-wave trees.** Build-time trees are the unblocked ones by construction
  (§2.1). WP8's `reactToClosureWave` will need a separate fixture family.
- **Historical arm (`scenarioCode=3`) and the bed-sweep / C-random families are not
  dumped.** They add no new sampler behaviour — only different shelter CSVs — and each is
  a one-line `Config` addition when needed.
- ~~**A second, independently-produced HALF_UP fixture now exists.**~~ **CLOSED
  2026-07-31.** The two families were cross-checked, and the exercise paid for itself
  twice over. Result: on the **50 doubles the tables share, all 350 Java `%f` outputs
  agree character for character** — two dumpers, two value generators, one JVM, zero
  disagreements about ground truth. The *only* disagreement was in the auxiliary
  exact-binary column, 14 cells, and it exposed the dumper defect corrected in §6.1.
  Consolidation: **`mathx-format.json` is canonical** (it is what the WP3 parity gate
  runs on, and its exact-binary column is semantically correct); the TSV family is
  **retained as a cross-check**, not deleted, because it covers 2,652 doubles the
  canonical table does not, and is now consumed by
  `engine/test/mathx/half-up-cross-oracle.test.ts`. That test also picked up **18,802
  formatter cells and 2,702 `(long) v` casts of previously unused oracle** — the TSV
  had never been read by any test — all of which the port passes.
