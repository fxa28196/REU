# 05 — The assignment upper bound: geography vs coordination failure

**Question the critique poses.** Arms B and C both set total shelter capacity exactly
equal to the population (6,842). A feasible near-perfect assignment therefore exists on
paper. The critique claims the true optimum is **~99.8% for both arms**, and concludes
that C's advantage "exists ONLY because of the myopia assumption" — that a dispatcher or
a live-occupancy feed would erase it.

**Answer, in one line.** The critique's 99.8% number is arithmetically correct but
substantively misleading, and its conclusion is wrong. On the street network the model
actually routes over, the optimum is 91.5% (B) and 96.0% (C) and **the model already
attains it exactly** — coordination failure in headcount is **zero** in all 18 runs. The
99.8% figure is reachable only after repairing a street-graph defect *and* assigning
residents walks of up to 62 km. Under any walking distance a real evacuee would accept,
C beats B by **more** than the model reports, not less.

Reproduce with:

```
python scripts/analysis/upper_bound.py --arms B C --seed 42 43 44 45 46 47 48 49 50
python scripts/analysis/upper_bound.py --arms B C --seed 42 --weld-m 1.0
```

---

## 1. Method

Script: `scripts/analysis/upper_bound.py` (v1.0.0).

1. Rebuild the validated street graph with `scripts/test_routing.py::build_graphs()` —
   the same node-site clustering (100 m cluster, 10 m reattach) that
   `geography.routing.StreetNetwork` uses. 112,070 features, 89,345 nodes.
2. Snap every agent's `start_lon`/`start_lat` and every operating shelter to its nearest
   graph node with the same planar degree-distance metric as
   `StreetNetwork.nearestNode`. The 6,842 residents collapse to 2,254 distinct start
   nodes, which is what makes the exact solve cheap.
3. One Dijkstra per shelter over the whole graph → exact network distance from every
   node to every shelter.
4. **Max flow** — source → start-node group (capacity = residents there) → shelter
   (if reachable) → sink (capacity = shelter capacity). The max flow is the largest
   number of residents that *any* assignment, however clairvoyant, could shelter.
5. **Min-cost max flow** minimising total network distance → the optimal mean walk.

**Solver provenance.** Neither `networkx` nor `scipy` is installed in this environment
(verified: both `import` calls fail; only `numpy 2.5.0` and `pandas` are present). Both
solvers are therefore implemented from scratch in the script: **Dinic's algorithm** with
an iterative blocking-flow DFS for max flow, and **successive shortest paths** with a
layered Bellman-Ford relaxation for min-cost flow.

**Optimality certificates.** Every min-cost run is independently certified, not merely
asserted:

- the min-cost flow value equals the independently computed max flow (all 18 runs);
- the residual graph contains no negative cycle. Because the residual graph is
  bipartite, every cycle contracts onto the 36/46-node shelter side, where Bellman-Ford
  settles the question exactly. Worst residual cycle cost: **+0.000 m** in all 18 runs.

A flow that is maximum and has no improving residual cycle is provably a min-cost max
flow. These are exact optima, not heuristics.

### Three reachability regimes

| Regime | Definition |
|---|---|
| **strict** | finite network distance in this independently rebuilt graph |
| **model-consistent** (headline) | strict, plus every (start-node, shelter) pair the model itself demonstrably realised |
| **connectivity-repaired** | ignore the graph's component split entirely; any resident may use any shelter |

The middle regime is the honest headline. The Java graph resolves a handful of boundary
snaps differently from this rebuild — 5 agents per run reach
`Stark_Street_Motel_Shelt` at 26,030.31 m in a component this rebuild places them
outside. Under the strict regime alone the "bound" would sit 5 *below* the model's own
result and would not be a valid upper bound at all. Adding the demonstrated pairs
guarantees the bound is ≥ the model. **The conclusion is identical under either
regime**: strict gives 6,259 vs a model result of 6,264 that fills every strictly
reachable space, so the model is at 100% of the optimum either way. This is not
circular.

### The time budget never binds

`simulationHours = 312`, all agents depart at tick 960, so each has 17,760 minutes of
walking. At the slowest sampled gait (0.4042 m/s) that is a **430,716 m** budget against
a longest-needed distance of 32,247 m. The time-budget-constrained optimum equals the
unconstrained optimum in all 18 runs (`time_budget_binds: false`). *This is itself a
finding*: the 312-hour episode makes the time constraint vacuous, which is what lets the
"optimum" assign absurd walks — see §4.

---

## 2. Headline result: coordination failure is zero

Mean over 9 seeds each, arms B and C, on the street network **the model actually uses**:

| | model | **optimum (max-flow)** | **coordination failure** | capacity stranded by network topology | residents with no reachable shelter |
|---|---|---|---|---|---|
| **B** | 6,260 (91.49%) | **6,260 (91.49%)** | **0** | 582 | 19 |
| **C** | 6,566 (95.97%) | **6,566 (95.97%)** | **0** | 276 | 19 |

Coordination failure is **exactly 0 in every one of the 18 runs** (min 0, max 0). The
greedy myopic search — walk to the nearest non-full shelter, get refused, re-plan,
bounded by `MAX_RETARGETS = 8` (`Geography/src/geography/agents/GisAgent.java:125`) —
attains the exact assignment optimum in headcount. A perfect dispatcher with live
occupancy would shelter **zero additional residents** in either arm.

The direct confirmation is in the occupancy data. From
`Geography/output/B2026-n6842-seed42/shelters.csv` and the C equivalent:

- **Arm B:** all 33 main-component shelters at **100.00%** utilisation (6,242 / 6,242).
  Zero shelters below capacity.
- **Arm C:** all 43 main-component shelters at **100.00%** utilisation (6,548 / 6,548).
  Zero shelters below capacity.

There is no free reachable space left for a dispatcher to route anyone into. The binding
constraint is not coordination.

---

## 3. What actually binds: a severed street graph

The ceiling is set by the connected-component structure of `Geography/data/Streets.shp`.
The graph has 154 components; the two large ones are:

| component | graph nodes | residents | shelters | capacity (B) | servable | stranded |
|---|---|---|---|---|---|---|
| comp 1 | 28,407 | 6,809 | 33 | 6,242 | 6,242 | 0 |
| comp 79 | 60,444 | **17** | 3 | **600** | 17 | **583** |

Three east-county shelters — `Gresham_Womens_Shelter`, `Rockwood_Bridge_Shelter`,
`Stark_Street_Motel_Shelt` — sit in a component only **17 of 6,842** residents can
reach. In arm B that strands 578–585 spaces; in arm C, 268–279. Their realised
occupancy is 0, 3 and 19 respectively, against capacities of 276, 159 and 165.

**This split is a data defect, not real geography, and the project should record it as
such.** The evidence is unambiguous:

- The two components **spatially interpenetrate**. comp 1 spans lon [−122.836, −122.473],
  lat [45.433, 45.650]; comp 79 spans lon [−123.463, −121.650], lat [44.886, 45.812].
  One contains the other. These are not two separate places.
- **194 pairs of nodes from different components lie within 1 metre of each other**
  (388 distinct nodes, 54 distinct component pairs), including the comp 1 ↔ comp 79
  pair. The closest sampled cross-component pair is at *identical* coordinates
  (−122.70207, 45.43298), 0 m apart.

The cause is in the construction rule. `StreetNetwork` welds street endpoints by the
shapefile's `PDX_F_NODE`/`PDX_T_NODE` **attribute ids** (clustered within 100 m). Where
two features physically meet but carry inconsistent attribute ids, the junction is never
welded and the county graph is severed even though the streets touch. `test_routing.py`
already prints `components_fixed: (154, 60444)` but no check fails on it, so the
implication was never surfaced.

Welding only the physically coincident junctions (`--weld-m 1.0`) — the minimal,
geometry-respecting repair — takes **52 welds** and collapses the graph from 154
components to 102, with a single giant component of 89,054 of 89,345 nodes.

---

## 4. The critique's 99.8%: right number, wrong conclusion

On the repaired network, mean over 9 seeds:

| | model | optimum | coordination failure | optimal mean walk | longest assigned walk |
|---|---|---|---|---|---|
| **B** | 6,260 | **6,826 (99.77%)** | 566 | 8,200 m | **61.6 km** |
| **C** | 6,566 | **6,826 (99.77%)** | 260 | 4,700 m | **56.8 km** |

So the critique's arithmetic is **correct**: repair the network and both arms have a
99.8% optimum, identical to three significant figures. Credit where due — that claim
holds, and it is worth stating plainly in the paper.

But the conclusion drawn from it does not follow, because of *how* that optimum is
purchased. The extra 566 (B) and 260 (C) placements are all assignments to the east-county
shelters, at network distances up to **61.6 km on foot**. The only reason the solver is
allowed to do this is that the 312-hour episode leaves the time budget non-binding
(§1). No evacuation plan would ever direct an unsheltered resident to walk 60 km.

Cap the assignable walking distance at anything realistic and the 99.8% evaporates —
and, decisively, **the repaired network makes no difference at all at any cap ≤ 20 km**,
because the stranded shelters are 30–60 km away by network. Mean over 9 seeds:

| walking cap | B optimum | C optimum | **C − B** | B % | C % |
|---|---|---|---|---|---|
| 2 km | 3,748 | 4,370 | **+623** | 54.8 | 63.9 |
| 3 km | 4,707 | 5,524 | **+816** | 68.8 | 80.7 |
| **5 km** | **5,235** | **6,148** | **+913** | **76.5** | **89.8** |
| 8 km | 5,810 | 6,390 | **+580** | 84.9 | 93.4 |
| 10 km | 6,211 | 6,551 | **+340** | 90.8 | 95.8 |
| 15 km | 6,245 | 6,551 | **+306** | 91.3 | 95.8 |
| 20 km | 6,245 | 6,551 | **+306** | 91.3 | 95.8 |

At a 5 km cap — already a long walk for an unsheltered person carrying possessions
through wildfire smoke — the optimal, omniscient, perfectly dispatched gap between C and
B is **913 residents (13.3 percentage points)**, three times the 306-resident gap the
model reports. C's advantage does not merely survive optimal dispatch; optimal dispatch
*widens* it.

---

## 5. Distance: where coordination failure is real and large

Coordination failure is zero in headcount but substantial in walking distance. Mean over
9 seeds, as-built network:

| | optimal mean walk (min-cost) | model mean walk, sheltered | model mean walk, all agents | overhead |
|---|---|---|---|---|
| **B** | **3,768 m** | 6,155 m | 7,938 m | **1.63×** |
| **C** | **2,670 m** | 4,530 m | 5,689 m | **1.70×** |

A dispatcher with live occupancy would cut mean walking distance by **39% (B)** and
**41% (C)** — and therefore cut travel-time smoke exposure by roughly the same
proportion — **while sheltering not one additional person**. That is the correct and
defensible version of the critique's point, and the paper should make it: myopic search
costs distance and dose, not placements.

Note the model's own reported figures of 7,938 m (B) and 5,689 m (C) are means over
**all 6,842 agents** including those who never shelter; the sheltered-only means are
6,155 m and 4,530 m. Both are stated above so the comparison is unambiguous.

For reference, the capacity-free lower bound (every resident at their own nearest
shelter, capacity ignored) is 1,840 m (B) and 1,507 m (C). The gap between that and the
min-cost optimum — 1,928 m in B, 1,163 m in C — is the pure cost of congestion, and it
is **66% larger in B than in C**. Even with perfect information, capacity at the wrong
locations forces more walking than capacity at the right ones.

---

## 6. Verdict

**Does C's advantage survive?**

- **In headcount, on the network as built: the question does not arise.** The model is
  already at the exact optimum in both arms; there is no coordination slack to recover.
  C's +306 advantage is entirely geographic — it comes from siting capacity where the
  street network can actually deliver people to it.
- **In headcount, on a repaired network with an unbounded walk: no.** Both arms reach
  6,826 (99.77%) and the gap closes. The critique is right on this narrow point. But the
  optimum gets there by walking people up to 62 km, which is not a policy.
- **In headcount, under any realistic walking distance: yes, and by more.** At a 5 km
  cap the optimal gap is 913 residents versus the model's 306.
- **In access cost: yes, decisively.** Optimal mean walk is 2,670 m in C against 3,768 m
  in B as built (29% shorter), and 4,700 m against 8,200 m repaired (43% shorter). No
  dispatcher closes that; only siting does.

**What the critique gets right, and should be conceded in the paper:** the ~99.8%
arithmetic is correct on a repaired network, and myopic search does impose a real
39–41% penalty on walking distance and travel exposure. Both belong in the limitations
section.

**What the critique gets wrong:** the inference that C's advantage "exists ONLY because
of the myopia assumption." Coordination failure in headcount is measured at exactly zero
in all 18 runs, with every reachable shelter at 100% utilisation. A live-occupancy feed
would change the headline shelter rate in neither arm.

**Independent defect this analysis surfaced, which the critique did not raise:** the
street graph is severed into interpenetrating components by an attribute-id join
failure, stranding 578 (B) / 272 (C) shelter spaces and depressing *both* arms' headline
rates. This is a bug in the routing input, it is cheaply fixable (52 welds), and it
should be disclosed and ideally fixed before publication. Fixing it does not change the
comparative conclusion — at every realistic walking distance the repaired and as-built
optima are identical — but it does mean the reported 91.6% and 96.0% are understated
relative to a correctly connected network.

---

## Appendix — provenance

- Runs: `Geography/output/{B,C}2026-n6842-seed{42..50}/` (`agents.csv`, `shelters.csv`,
  `simulation.json`), commit `7e1a271`, data tag `5f8ece625e63`.
- Street graph: `Geography/data/Streets.shp`,
  sha256 `f5e5e311b625f129f94fcf6d3150f8feb521ea5a79039ade43514ebfb35810a8`.
- Model logic cited: `Geography/src/geography/agents/GisAgent.java:125` (`MAX_RETARGETS = 8`),
  `:332-371` (`chooseNetworkNearestShelter`, strict finite-distance reachability),
  `:299-320` (door refusal, re-plan from the refusing shelter's node).
- Solvers: Dinic max-flow and successive-shortest-path min-cost flow, both implemented
  in `scripts/analysis/upper_bound.py`; `networkx` and `scipy` are not installed.
- All 18 min-cost solutions certified: flow = max-flow, worst residual cycle +0.000 m.
