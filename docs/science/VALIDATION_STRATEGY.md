# Validation Strategy

How each subsystem will be shown to behave correctly — specified **before**
implementation, so that tests are not written to fit whatever the code
happens to do.

For every subsystem: **what could go wrong**, **what evidence demonstrates
correctness**, **the concrete test**, and **the pass criterion**. A subsystem
without a passing validation is reported as unvalidated in any results that
depend on it.

Levels used below:
- **L1 Analytic** — closed-form expected value; exact or near-exact agreement.
- **L2 Internal consistency** — invariants that must hold in every run.
- **L3 Empirical** — comparison against independent observed data.
- **L4 Behavioural/face validity** — qualitative pattern a domain expert expects.
- **L5 Reproducibility** — identical inputs give identical outputs.

Test artefacts live in `Geography/test/` (to be created) and, where a full
JUnit harness is not warranted, as documented headless-run checks recorded in
`docs/validation/`.

---

## 1. Street network construction

**Failure modes:** wrong node identity (topology silently disconnected);
edge weights in wrong units; duplicated/one-way edges; features dropped.

| Level | Test | Pass criterion |
|---|---|---|
| L2 | Node/edge census on load | 112,070 edges; 0 features lacking `PDX_F_NODE`/`PDX_T_NODE`; every edge present in both directions (undirected invariant) |
| L1 | Geodesic length of a known straight segment vs an independent geodesic calculator | agreement < 0.1 % |
| L2 | Connected-component analysis | Report component count and the size of the giant component; **the fraction of agents outside it must be published**, not silently absorbed |
| L3 | Sample ~20 street names/lengths against an external map | Names match; lengths within digitisation tolerance |
| L4 | Render the graph over the street layer in the GUI | Visual coincidence with the drawn streets |

**Already observed (commit `5092fde`):** 89,322 nodes / 112,070 edges, 0
missing node ids, 1 of 100 agents unreachable — consistent with a
non-trivially-disconnected real street file. The component analysis is the
outstanding item.

## 2. Routing and shortest paths

**Failure modes:** Dijkstra returning non-optimal paths; asymmetric distances
in an undirected graph; path reconstruction not matching the reported distance.

| Level | Test | Pass criterion |
|---|---|---|
| L1 | Hand-built 5-node toy graph with known optimum | Exact match of distance and path |
| L2 | **Path/distance consistency**: recompute the geodesic length of the reconstructed polyline | Equals the tree's reported network distance within 1e-6 relative |
| L2 | **Symmetry**: d(shelter→agent) from the tree vs a fresh Dijkstra from the agent | Equal within floating-point tolerance |
| L2 | **Triangle/monotonicity**: distances along a reconstructed path decrease monotonically toward the source | No increases |
| L3 | 5 agent–shelter pairs vs an external routing engine (e.g. OSRM/Google walking distance) | Within ~15 % (different networks/rules; large deviations indicate a real defect) |

## 3. Movement kinematics

**Failure modes:** agents exceeding the speed limit; overshooting vertices;
distance accumulator disagreeing with displacement; drift from the street line.

| Level | Test | Pass criterion |
|---|---|---|
| L1 | Single agent, straight path, *n* ticks | `distanceTraveledM` = n · walkingSpeedMps · 60 · minutesPerTick, exactly, until arrival |
| L2 | Per-tick displacement ≤ step length + ε for every agent, every tick | No violations |
| L2 | Agent position lies on (or within cm of) its routed polyline | Max perpendicular deviation < 1 m |
| L1 | Total path length walked = network distance reported at selection | Agreement < 0.5 % |
| L4 | GUI: agents visibly track streets, no teleporting or oscillation | Qualitative pass (screenshot recorded) |

## 4. Exposure accumulation (V6/V7/V8)

**Failure modes:** Δt unit errors (minutes vs hours) — the classic 60× error;
exposure not accruing in non-EN_ROUTE states; double counting at state changes.

| Level | Test | Pass criterion |
|---|---|---|
| L1 | Constant field C = 100 µg/m³, agent alive 60 ticks at 1 min/tick | exposure = 100 µg·m⁻³·h exactly (this test *is* the unit check) |
| L1 | Same with RR_age = 2, RR_com = 1.5 | vwe = 300 µg·m⁻³·h exactly |
| L2 | Population invariant: Σ agent exposure equals Σ over ticks of (n_agents × C × Δt) under a uniform field | Equality within 1e-9 relative |
| L2 | Every agent in every state accrues exposure (Decision 3) | No agent finishes with exposure = 0 while the field was non-zero |
| L1 | Threshold counter (V8) with a synthetic square-wave field | Counted hours equal the constructed number exactly |

## 5. PM2.5 field construction (V5)

**Failure modes:** time-index misalignment (off-by-one hour, local vs GMT);
interpolation fabricating structure; missing-data holes filled silently.

| Level | Test | Pass criterion |
|---|---|---|
| L2 | Field value at a monitor's own location and hour equals that monitor's reading | Exact (uniform field: equals the county mean by construction — state which) |
| L1 | Tick→timestamp mapping: tick 0 = 2020-09-07T00:00; tick 1440 = 2020-09-08T00:00 | Exact; **and** the local/GMT column choice documented |
| L3 | **Leave-one-out cross-validation** — the decision test between uniform and IDW (DESIGN_SPEC V5) | Report RMSE/MAE for both; adopt IDW **only** if it beats uniform on held-out monitors. A negative result is a publishable finding |
| L2 | Missing-hour policy | Gaps must be explicit (NaN/flag), never silently zero-filled; count and report any |
| L4 | Time series plotted against the D3 daily table in `data/README.md` | Peak on Sep 13, ~589 µg/m³ max hourly, near-baseline by Sep 19 |

## 6. Shelter assignment and capacity (V12)

**Failure modes:** occupancy exceeding capacity; refused agents never
re-routing; assignment ignoring network distance; order-dependence unreported.

| Level | Test | Pass criterion |
|---|---|---|
| L2 | Occupancy ≤ capacity at every tick, every shelter | Never violated |
| L2 | Conservation: sheltered + en-route + unreachable + refused = n_agents at all times | Exact |
| L1 | Small scenario: 3 agents, capacity-1 shelter | Exactly 1 admitted; other 2 attempt the next-nearest; final states match hand-derived expectation |
| L2 | Chosen shelter is the network-nearest *admitting* one at selection time | No agent has a strictly closer admitting alternative |
| L4 | Capacity binding produces sensible queue behaviour, not deadlock | No agent stuck in an infinite re-target loop (bounded retarget count enforced) |

## 7. Vulnerability weighting (V1–V4)

**Failure modes:** RRs applied to the wrong agents; prevalence sampling biased;
unsourced values entering results silently.

| Level | Test | Pass criterion |
|---|---|---|
| L2 | Attribute distributions in a large run match the specified input distribution | χ² / KS test not rejected at α = 0.05 |
| L1 | Two identical agents differing only in comorbidity | VWE ratio equals exactly RR_com |
| L2 | **Provenance guard**: any RR flagged `UNSOURCED` must either be 1.0 or cause a loud warning in the run manifest | Enforced in code, verified by test |
| — | Sensitivity: rerun with all RR ≡ 1 | Report how much of the strategy ranking is attributable to weighting |

## 8. Statistical outputs (V14, scoring)

| Level | Test | Pass criterion |
|---|---|---|
| L1 | Gini of a perfectly equal vector | 0.0 (within 1e-12) |
| L1 | Gini of a maximally unequal vector (one non-zero) | (n−1)/n |
| L1 | Gini against an independently implemented reference (e.g. R/Python) on the same vector | Agreement < 1e-9 |
| L2 | Metrics computed over the **full** population including unreachable agents | Denominator equals n_agents, verified |

## 9. Reproducibility (V16)

**Failure modes:** unrecorded seed; hash-iteration-order nondeterminism;
wall-clock or filesystem dependence.

| Level | Test | Pass criterion |
|---|---|---|
| L5 | Same seed, same parameters, two runs | **Byte-identical** outcome CSVs |
| L5 | Different seeds | Outputs differ, but summary statistics stay within a reported Monte-Carlo band |
| L2 | Run manifest completeness | seed, all parameter values, git SHA, and dataset checksums present in every run's manifest |
| L5 | Fresh-clone reproduction | Another machine reproduces a stored reference run from documented steps alone |
| L2 | Iteration-order determinism | Any iteration over `HashMap`/context collections that affects results must be explicitly ordered — audited, since Dijkstra tie-breaking and agent update order can otherwise vary |

## 10. Regression protection (every commit)

The standing per-commit gate, already in force since commit `eaa9605`:

1. `gradlew compileJava` — must be BUILD SUCCESSFUL.
2. Headless `RepastBatchMain` run — no exceptions; outcome-count table recorded
   in the commit message and compared with the previous commit.
3. GUI launch — scenario loads; screenshot to `docs/validation/`.
4. Any deviation in outcome counts must be **explained in the commit message**
   as intended or investigated as a regression.

**Current regression baseline:** 99 SHELTERED / 1 UNREACHABLE / 0 flagged,
graph 89,322 nodes / 112,070 edges (commit `7318f9b`).

---

## Validation status ledger

| Subsystem | Status |
|---|---|
| Street network | Partially validated (census + GUI); component analysis outstanding |
| Routing | **Not yet formally validated** — toy-graph and symmetry tests to be written |
| Movement | Partially validated (behavioural: arrivals rose 30→99); analytic tests outstanding |
| Exposure | Not implemented |
| PM2.5 field | Not implemented (data acquired) |
| Shelter/capacity | Not implemented |
| Vulnerability | Not implemented (citations blocked) |
| Statistics | Not implemented |
| Reproducibility | Seed exists but is **not recorded** — first gap to close |

**Priority:** the routing/movement analytic tests and the run manifest should
land *before* commit 8, so that the first scientific results arrive on a
validated mechanical substrate.
