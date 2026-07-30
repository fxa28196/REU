# Scenario-E spec checkpoint — severe event + obstacle layer

Status: SPEC. Written 2026-07-29 at HEAD `e1e2596`, immediately after Phase E
closed. Follows the `E-LAYER-SPEC.md` pattern: everything here is specified and
registry-ready but **not yet implemented**, except the two data generators and
their outputs, which are built, validated and committed.

Scenario E asks what happens to the same city and the same population under a
far worse event — Palisades-scale in severity, not in geography. It is a
**counterfactual**, and every artifact is labelled as one.

## 0. What is already DONE (committed, do not rebuild)

| Artifact | Commit | State |
|---|---|---|
| `scripts/build_smoke_severe.py` + `Geography/data/airnow/aqs_hourly_pm25_synthetic_severe_v1.csv` | `1fb0308` | Built, 19 self-checks PASS. Peak 984.75 µg/m³ (1.75× observed 562.7), 456 h, 3,890 rows. Byte-identical dialect round-trip; deterministic; every value has an observed pre-image; two-spell structure preserved; episode stretched 188 h → 284 h by whole days. Provenance sidecar `.provenance.json`. |
| `scripts/build_closures_E.py` + `Geography/data/closures/closures_E_r1.csv`, `closures_E_r1_extreme.csv` | `7224cef` | Built. base = 3 pedestrian-legal Willamette bridges + 15 named arterials, one wave at hour 79; extreme = 4 bridges + 30 arterials, waves at 79 and 150. Real RLIS `PDX_F_NODE`/`PDX_T_NODE` ids. Freeway TYPEs excluded exactly as the model excludes them (U-27/V26). Reports in `docs/runs/scenario-e-closures/` carry the connectivity proof that **no shelter loses all unblocked incident edges and none is severed from its component**. |

CSV schema: `node_a,node_b,activation_hour,label,kind` (kind ∈ {bridge, arterial}).

## 1. Registry rows to add BEFORE any code (rule R1)

Numbering continues from V45 (`shelterPolicyVariant`, already shipped). All are
evidence class **A** — constructed counterfactual / modelling decision — so the
`ScienceRegistry` DOI and uncertainty fail-fast rules do not bind, but every row
still carries a sweep range because every one will actually be swept.

- **V46 `smokeSeriesCode`** — 0 = observed Sept-2020 Multnomah AQS, 1 = synthetic severe v1. Severity is carried by this plus V48, *not* by the scenario code, which only labels the arm for the verify tooling.
- **V47 `smokeScale`** — multiplier on every hourly value, applied at `SmokeField` construction so exposure, dose and hours-above-unhealthy scale coherently from one place. Central 1.75, swept 1.5 / 1.75 / 2.0. The 1.75 makes the synthetic peak comparable to the worst hourly PM2.5 of the January 2025 Palisades/Eaton fires — an **analogy used to choose a number**, never an import of those measurements.
- **V48 `closuresCode`** — 0 none / 1 base / 2 extreme. Blocked edges leave the routing graph at a scheduled wave, forcing residents already walking to choose between pushing through and rerouting.
- **V49 `pStuck`** — probability a pusher is delayed rather than passing freely. Swept 0.1–0.5. UNSOURCED (A-35).
- **V50 `stuckDelayH`** — hours a stuck resident waits, at resting ventilation 0.61 m³/h. Central 3, swept 1–6. **A delay, never a terminal state**: no evidence supports modelling immobilisation or harm, and inventing one would put an unfalsifiable outcome into the results.
- **V51 `pushThetaThreshold` (+ `kPush`)** — one row, two coefficients, as V36 does for `z_R`/`bRisk` and V43 for `betaT`/`betaS`. Threshold swept −0.5…+1.0, `kPush` 0.5–2.0.

Assumptions **A-33** (severe series is a constructed counterfactual; the LA import was considered and deferred because the model's county-uniform mean would dilute a spatially localised plume, understating the very event it was chosen to represent), **A-34** (closure schedule constructed; no incident record exists; connectivity-checked), **A-35** (push/stuck mechanics unsourced; the rule deliberately REUSES θ_i (V35) and c_i (V40) rather than introducing a second risk construct, so only three new unsourced quantities enter).

Each row needs the 16-column `variables.csv` shape and the 8-column
`assumptions.csv` shape, with commas inside fields kept quoted —
`CsvLoader.readStrict` rejects ragged rows outright.

## 2. Obstacle layer — patch plan against the real routing code

Verified against `StreetNetwork.java` at `7224cef`.

**Constraints the design must respect.** `adjacency` is `Map<Long, List<Edge>>`
with each undirected street stored twice, once per direction. Node ids can be
**negative** (synthetic split nodes start at −1000), so no pair key may assume
non-negative. `computeTree` is plain Dijkstra, relaxation loop at lines 484–492.
`pathToSource` already walks the node chain internally but discards it. Trees
are built once per shelter and stored on `Shelter` (36–46 trees, 88,100 nodes).

**2.1 Blocking.** Add `Map<Long, Set<Long>> blockedAdj` plus an `int
closureVersion`. The relaxation loop gains exactly one guarded line:

```java
if (!blockedAdj.isEmpty() && isBlocked(node, e.toNode)) continue;
```

The `isEmpty()` short-circuit is the whole R3 argument: with `closuresCode=0`
the obstacle layer costs one boolean test and can change nothing. **Do not** key
blocked edges by `Set<String>` of `"a|b"` — string building inside a loop that
runs ~10 M times across 46 trees is the one place this could actually cost
something. The nested-map form is exact (no hash collisions, negative ids fine).

**2.2 Expose the node path.** Add `List<Long> nodesToSource(tree, fromNode)`
mirroring `pathToSource`, so an agent can test its own remaining route against
the blocked set without `StreetNetwork` knowing anything about agents.

**2.3 `ContextCreator`.** `closuresCode` via `intParam(...,0)`; map 1/2 to the
committed CSVs; add the chosen file to `dataFiles` so it is checksummed into the
manifest; group rows by `activation_hour` and schedule a **one-shot per wave**
(`ScheduleParameters.createOneTime`) that blocks that wave's edges, bumps
`closureVersion`, then recomputes every shelter tree **once**
(36–46 SSSPs ≈ tens of seconds, 1–2 waves — never per tick). Append
`closuresCode` to the manifest arrays. WARN, never fail, if
`scenarioCode ∈ {18,19,20}` but `smokeSeriesCode == 0`.

**2.4 `GisAgent` — the decision.** New fields `List<Long> routeNodes`,
`int seenClosureVersion`, `double stuckUntilTick`, and counters
`blockagesEncountered / pushThroughs / reroutes / stuckEvents` (exported
append-only). At the top of the movement block, a stuck agent returns early —
still outdoors, still accruing dose, which **is** the penalty. Once per wave,
scan the remaining `routeNodes` for a blocked consecutive pair; an agent whose
route is untouched makes no decision, which is the honest behaviour. On a hit:

```java
double mobilityPenalty = (attributes != null && attributes.mobilityLimited) ? 1.0 : 0.0;
boolean push = thetaScaled >= cfg.pushThetaThreshold
             + cfg.kPush * (barrierCost + mobilityPenalty);
```

Push → keep the stale path and walk through; with `pStuck` set
`stuckUntilTick = tick + stuckDelayH * ticksPerHour`. Reroute → drop the path
and re-plan next tick from `currentNodeId` using the recomputed trees; existing
UNREACHABLE / REFUSED_ALL_FULL classification handles the no-route case
unchanged. This is the user's requirement rendered directly: a healthy
unencumbered resident gambles, an older or heavily-encumbered one reroutes.

## 3. Scenario codes and the run matrix

18 = severe over arm A's CSV, 19 = over C's, 20 = over D's (B's CSV +
`triageReserveFraction`), mirroring how code 7 reads arm B's file. Codes are
**labels for the verify tooling**; severity is carried by `smokeSeriesCode` +
`closuresCode`.

Minimum matrix: {18,19,20} × seeds {42,43,44}. If time permits, the same three
arms with `closuresCode=0` to separate the smoke effect from the obstacle
effect. Raise `simulationHours` to ≤ 456 (the severe series length;
`ContextCreator` already clamps via `min(simulationHours, smokeField.hours())`).

## 4. Predictions to register BEFORE running (rule R2)

Append to `13-PHASE-E-PREDICTIONS.md`. **Read the Phase-E outcome first**: under
measured awareness only ~1,220 of 6,842 residents depart and capacity never
binds, so any Scenario-E prediction phrased in terms of beds is probably asking
the wrong question. Suggested set: (1) attempts rise with severity but arm 18
stays awareness-limited, and dose per capita rises superlinearly in the scale
factor; (2) C's advantage over A **widens** under closures via multi-site
redundancy — the reverse of P-E2's compression, and worth stating loudly
because it would be the first condition under which placement matters again;
(3) D's mobility protection grows only if closures reintroduce capacity
pressure — if they do not, D stays inert as it is today; (4) push-through
concentrates in low-c_i / high-θ residents; (5) hours-above-unhealthy becomes
bimodal (sheltered-early vs stranded-behind-closures).

## 5. Verification

`gradlew compileJava` after each chunk. **Re-run the three E0 nulls and confirm
the shared-projection hashes are unchanged** — `7d1e668cae3afd95` (A),
`188beabf9b22fc6c` (B), `be84bc5f1cf94bf9` (C). Then `verify_E_runs.py` on the
Scenario-E runs, plus: closure count in the manifest matches the CSV, no
post-discovery blocked-pair traversal without a push-through record, and
`out_of_range_lookups == 0`. Always finish with `lint_claims.py` exit 0 and
`verify_2026_runs.py` exit 0.

**Run discipline, learned the hard way this cycle:** never let anything write to
the repo while runs execute. Six ER runs stamped `git_working_tree_dirty=true`
because agent-authored scripts landed mid-run; `verify_E_runs.py` caught it and
the whole matrix had to be re-run. Commit first, then run, then rename the
seed-keyed output directory immediately.
