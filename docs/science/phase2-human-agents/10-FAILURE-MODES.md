# Phase 2 · Failure-Mode Analysis and Roadmap Amendments

Adversarial review of the implementation plan, performed **before** coding.
Findings are ordered by probability × damage to scientific defensibility. Each
names the mechanism, why it would or would not be visible, and the cheapest
guard. Two findings reframe the sequencing and are stated first.

---

## Finding A (CRITICAL) — the retarget path walks agents back to their encampment

**Mechanism.** When a resident is refused at a full shelter, `GisAgent` clears
`routePath` and `pathIndex`. Next tick, `chooseNetworkNearestShelter` rebuilds
the path with `pathToSource(tree, startNodeId)` — from the **immutable start
node**, not from where the agent is standing. The movement loop then reads the
agent's *actual* position (at the full shelter) and walks a straight geodesic
line to `routePath.get(0)`, which is the **encampment**, before following the
network path to the second shelter.

Walked distance becomes roughly `snap + 2·d(start, A) + d(start, B)`, all of it
off-network and all of it accruing PM2.5 at walking pace.

**Why it is invisible today.** It is unreachable at n = 50, because 2 × 99 beds
never bind and no agent is ever refused. Every byte-identity gate in
`08-ENGINEERING.md` §7 is evaluated at n = 50 — the one configuration where this
path cannot execute. Additionally `analyze_run.py` computes `routing_anomaly` but
only *prints* it; it is never added to the failing-checks list, so a 10 km detour
on every agent would still report "37/37 passed".

**Why it matters now.** Decision D-5 commits production runs to n = 2,037 against
198 beds. At that scale the refused cohort is most of the population, so the
headline result would ship with distance and exposure distributions inflated by a
routing artefact — and would read as a *capacity* finding.

**Guard.** Re-route from the agent's current graph node rather than its start
node; add a *failing* check that walked distance does not exceed the snap gap
plus the sum of planned leg distances; archive a capacity-binding reference run
so the path is exercised before production. Recorded as blocking assumption
**A-17**.

**Note on the output spec.** `07-OUTPUTS.md` §2.1 proposed exempting rerouted
agents from the walked-vs-network consistency check. That exemption would
suppress the only automated signal for this defect and must not be implemented as
written; reformulate the check per-leg instead.

---

## Finding B (CRITICAL) — every gate is evaluated where the new code is inert

At n = 50: capacity never binds (so admission arbitration, shuffle order and the
retarget path are unreachable), all agents evacuate simultaneously at tick 960
(so decision-delay code is unreachable), and the census is 49 sheltered /
1 unreachable / 0 refused (so terminal-state logic is barely exercised).

"Byte-identical at n = 50" therefore proves a change did nothing *where nothing
could happen*. The three steps the plan itself calls highest-risk are gated
exclusively on this.

**Guard.** Make the gate a **pair**: byte-identity at n = 50 **and** a
tolerance-compared capacity-binding reference (n ≈ 400, seed 42) archived as a
second golden. Cost is one extra archived run; it converts the gate from
necessary to sufficient.

---

## Findings acted on in this commit

| # | Finding | Action taken |
|---|---|---|
| C4 | `CsvLoader.read` pads short rows and discards extra fields, so one unquoted comma in a prose registry field would shift every later column with no error | Added `CsvLoader.readStrict` — rejects ragged rows and duplicate headers — and pointed the registry loader at it. `read()` deliberately untouched, because it feeds the encampment sampling that defines the baseline population |
| C5 | The drafted registry violated its own schema (a measured variable with no dataset id) | **The validator caught it on first run and refused to start.** Fixed the *data*, not the rule: the Gini row now names the provenance chain it inherits (D3) |
| C6 | The `affects_*` matrix was wrong for `randomSeed` (marked as affecting nothing but reporting, when it selects every start location) and for `numAgents` | Both rows corrected; see below — the columns remain human-asserted |

---

## Unresolved, carried forward

| Priority | Finding | Guard to implement |
|---|---|---|
| High | **`affects_*` is unfalsifiable machine-readable metadata.** No test can fail if it is wrong, yet a reviewer reads exported metadata as validated | A perturbation matrix: flip each scalar parameter one at a time at n = 50, record which output columns move, diff the observed dependency set against the registry. Until then these columns are documentation, not assurance |
| High | **Buildship compiles `src` into `bin/main`** (confirmed in `Geography/.classpath`), which sits inside the `../bin` path the scenario scans for agent classes; adding a test source set risks test classes landing there | Pin Buildship output away from `bin`; add a test asserting `Geography/bin` contains no `*Test.class` and exactly one copy of each agent class |
| High | Repast ships JUnit 4 **and** 5 plus `*.source_*.jar` variants; a wildcard include would silently skip tests written against the wrong API | Enumerate the six jars by name, exclude sources, assert a minimum executed-test count, include one deliberately-failing canary |
| High | Scenario layering as specified is unimplementable: Repast parameters *always* have a value, so "Repast wins" means a scenario file could never override one | Sentinel defaults meaning "unset" (the existing `__NULL__` seed convention is the precedent); reject unknown keys, and reject values containing `#` — `java.util.Properties` does not strip inline comments |
| Medium | The dataset checksum list is four compile-time constants, so a scenario overlaying a shelter or smoke file would produce a manifest asserting the *baseline* files' hashes | Build the list from the resolved config; instrument the loaders to record which paths were actually opened |
| Medium | `SmokeField` fails soft: a county or column mismatch matches zero rows, yielding `hours() = 0` and a zero-length run that still passes the out-of-range check | Throw on an empty field; record `effective_simulation_hours` rather than the requested value |
| Medium | `refused_count` counts only door refusals, not agents filtered out at selection, so it will be read as "people turned away" | Add a selection-time counter and cross-check it against the population census |
| Medium | `agents.csv` row order follows context iteration order; adding any context object type could reorder rows and fail a byte-diff for a non-scientific reason | Sort by agent index before writing |
| Low | Cross-JVM bit-identity is claimed, but geodesic distances use `Math` functions specified only to 1 ulp, so a last-ulp difference could flip a Dijkstra tie | Record JVM vendor, version, OS and architecture; restate the claim as "bit-for-bit on the recorded platform" |

---

## Roadmap amendments

The implementation order in `08-ENGINEERING.md` §7 stands, with three changes:

1. **Fix Finding A before any capacity-binding run**, and before the two-phase
   admission step — otherwise admission work lands on top of a broken reroute.
2. **Add the capacity-binding golden at the same step as two-phase admission**,
   so every later step is gated on both regimes.
3. **Add negative fixtures for every registry validation rule.** A rule with no
   test proving it can fail is not a rule. This is the guard against the natural
   failure mode of a governance layer: relaxing the validator until the data
   passes.
