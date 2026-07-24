# Scientific Audit

A complete audit of the model's scientific validity as of the exposure-endpoint
milestone. Covers: (0) the study-endpoint scope decision; (1) every variable,
parameter, dataset, equation and assumption with its evidence class and
downstream influence; (2) the dependency graph; (3) the end-to-end pipeline
diagram; (4) a per-metric validity verdict; (5) a roadmap prioritised by
scientific-validity gain; (6) the street-dataset verification.

Evidence classes: **M** measured · **L** literature-derived · **C** calibrated ·
**A** assumed · **P** placeholder awaiting evidence.

---

## 0. Study endpoint (scope decision, not a simplification)

**The endpoint of the simulation for each resident is ARRIVAL AT A SHELTER.**
Exposure accumulates only while a resident is outside; on arrival, accumulation
stops. Residents who never reach shelter (`UNREACHABLE`, `REFUSED_ALL_FULL`)
remain outside and keep accruing for the whole event.

**Why this matches the research objective.** The question (slide 4) is where to
place clean-air shelters to reduce the smoke *reaching* unsheltered residents.
The quantity a placement decision can change is the **outdoor exposure time**
during evacuation — how far and how long someone must travel, and whether they
can reach shelter at all. Shelter benefit is thus represented as *reduced
outdoor exposure time through better placement and accessibility*.

**Why indoor air quality (γ) was removed.** Modelling indoor filtration would
introduce an indoor/outdoor ratio γ that is (a) not requested anywhere in the
project slides or by the mentor, and (b) unsupported by any acquired data —
a second uncertain, unsourced parameter that would dominate absolute benefit
estimates while adding no information about *placement*. Removing it makes the
benefit definition sharp and fully evidence-based: a shelter helps by ending
outdoor exposure sooner. This is a deliberate scope definition; if the advisor
later wants indoor performance modelled, it re-enters as a documented future
extension (F-INDOOR), not a silent default.

Effect of the change (validated): with exposure ending at arrival, per-resident
exposure now **varies with travel time** — exposure Gini rose from 0.00
(uniform, γ=1 artefact) to **0.63**. The metric became discriminating.

---

## 1. Variable / parameter / dataset / assumption inventory

### 1a. Input datasets

| ID | Dataset | Class | Enters at | Influences | Evidence |
|---|---|---|---|---|---|
| D0 | Streets.shp (RLIS centerlines) | **M** | `ContextCreator` graph build | routing, all distances, shelter/agent snapping | City of Portland shapefile (slide 8); provenance date unknown (DATA_SOURCES D0) |
| D3 | AQS hourly PM2.5 88502 | **M** | `SmokeField` | every exposure quantity | EPA AQS, public domain, checksummed |
| D1 | Shelters 2020-09 | **M** coords / **P** capacity | `ContextCreator` shelter load | assignment, capacity, travel | JOHS+Street Roots; coords geocoded; **capacity 99 unconfirmed** |
| D2b | Encampments (IRP) | **M** location / **A** as-2020-proxy | `ContextCreator` agent placement | start points → travel, exposure | Real City data but **2025–26 used for 2020** (DATA_SOURCES D2b) |

### 1b. Parameters (parameters.xml)

| Param | Value | Class | Enters at | Influences | Evidence |
|---|---|---|---|---|---|
| `numAgents` | 100 | **A** | agent creation | sample size, capacity pressure | Not yet tied to PIT 2,037 (D2) |
| `minutesPerTick` | 1.0 | **A** | `SmokeField`, exposure Δt, movement | tick↔hour, step length, all integrals | Modelling decision (VARIABLES V13) |
| `walkingSpeedMps` | 1.30 | **L** | movement step length | travel time → exposure duration | Bohannon 1997 (PROVISIONAL for unhoused) |
| `shelterArrivalDistanceM` | 200 | **A** | (currently unused in logic) | — | Modelling threshold |
| `simulationHours` | 312 | **A/M** | run length, endAt | exposure window, who arrives before end | Event span Sept 7–19 (evidence-based); see issue #1 |
| `randomSeed` | (null=random) | infra | attribute/placement sampling | reproducibility | Recorded in manifest |
| ~~`indoorProtectionFactor` (γ)~~ | — | **REMOVED** | — | — | Out of scope (§0) |

### 1c. Agent-level variables

| Var | Class | Enters at | Influences | Evidence |
|---|---|---|---|---|
| start node | **M** (D2b geom) | placement, routing source | route, travel, exposure duration | RLIS snap of real point |
| route / network dist (V11) | **M** (derived) | `GisAgent.chooseNetworkNearestShelter` | assignment, travel | Dijkstra on D0 |
| distanceTraveled (V9) | **M** (derived) | movement | cost of access | geodesic (Karney 2013) |
| exposure (V6) | **M** (derived) | per-tick accrual while outside | mean/median/Gini/total exposure | D3 × time outside |
| exposureWhileTraveling | **M** (derived) | EN_ROUTE accrual | evacuation-only exposure | D3 × travel time |
| hoursAboveUnhealthy (V8) | **M** (derived) | per-tick, C>55.5 | headline burden metric | EPA AQI breakpoint (D9) |
| RR_age (V2) | **P** =1.0 | vwe multiply | vwe, vwe-Gini | **UNSOURCED** (Di 2017 doesn't support ×1.45) |
| RR_comorbidity (V4) | **P** =1.0 | vwe multiply | vwe, vwe-Gini | **UNSOURCED** ("Anderson 2013" not found) |
| vwe (V7) | **M×P** | per-tick | vwe stats | = exposure until RRs sourced |
| final state | **M** (derived) | movement/capacity | outcome census | logic on D0/D1 |

### 1d. Equations

| Equation | Form | Class of inputs |
|---|---|---|
| Geodesic distance/step | GeographicLib inverse/direct (WGS84) | M |
| Shortest path | Dijkstra over geodesic edge weights | M |
| Exposure | Σ_{t: outside} C(t)·Δt | M (C, Δt) |
| VWE | Σ_{t: outside} C(t)·RR_age·RR_com·Δt | M × **P** (RRs) |
| Hours above unhealthy | Σ_{t: outside} Δt·[C(t)>55.5] | M |
| Gini | ΣΣ|x_i−x_j| / (2n²x̄) | M (over the above) |

### 1e. Key assumptions (all flagged, none silent)

1. **Evacuation timing:** every resident begins walking at the simulation start
   and heads straight to shelter (**A**). See issue #1 — this currently drives
   absolute exposure more than the smoke does.
2. Encampment points from 2025–26 stand in for 2020 (**A**, D2b).
3. Uniform smoke field over the county (**A**, only 2 in-county monitors).
4. Undirected pedestrian graph; freeways not excluded (**A**, DATA_SOURCES D0).
5. First-come-first-served admission; no departures within the event (**A**).
6. Shelter capacity 99 (**P**, unconfirmed).

---

## 2. Dependency graph (how a scientific quantity propagates)

```
Streets.shp (D0,M) ─┬─> StreetNetwork (nodes/edges, geodesic weights)
                    │        │
Encampments (D2b,A) ┼────────┼─> agent start node ─┐
                    │        │                     │
Shelters (D1)  ─────┴────────┼─> shelter node + Dijkstra tree ─┐
  coords (M)                 │                                 │
  capacity (P) ──────────────┼─────────────────────> capacity enforcement
                             │                                 │
                             └─> route + network distance (V11,M) ─┐
                                                                   │
AQS PM2.5 (D3,M) ─> SmokeField C(x,t) ──────────┐                  │
minutesPerTick (A) ─> Δt, step length ──────────┼──> movement ─────┤
walkingSpeedMps (L) ────────────────────────────┘                  │
                                                                   ▼
                              time-outside (until arrival) ──> exposure (V6,M)
                                                                   │
RR_age (P=1) ─┐                                                    │
RR_com (P=1) ─┴─> vulnerability weight ──────────────────────> VWE (V7, M×P)
                                                                   │
                        hours>55.5 (V8,M), distance (V9,M), state ─┤
                                                                   ▼
                        Gini / mean / median / totals (simulation-level, M)
                                                                   │
                                                                   ▼
                        agents.csv · shelters.csv · simulation.json + manifest
                                                                   │
                                                                   ▼
                        (future) strategy comparison & statistical analysis
```

Read a column downward: anything a **P** feeds is at most as trustworthy as
that placeholder. VWE inherits **P** from the RRs; everything on the exposure/
distance/Gini path is **M** except where the evacuation-timing assumption (§1e-1)
scales it.

---

## 3. Complete scientific pipeline

```
EPA PM2.5 (AQS 88502)
            \
             \
Encampments (IRP) ---> Agents ---> Routing (Dijkstra) ---> Shelter Assignment
                                          \                     (capacity)
                                           \
                                   Exposure Accumulation   <-- stops at ARRIVAL
                                    (only while outside)        (study endpoint)
                                          |
                                          v
                              Vulnerability Modifiers  (RR_age, RR_com = 1.0, P)
                                          |
                                          v
                        Vulnerability-Weighted Exposure  (= exposure until sourced)
                                          |
                                          v
                    Agent Metrics / Shelter Metrics / Simulation Metrics
                                          |
                                          v
                     Strategy Comparison & Statistical Analysis   (future)
```

---

## 4. Per-metric validity verdict

Verdicts: **Research-ready** · **Partially meaningful** (relative ok, absolute
caveated) · **Software-validation only** · **Not yet for conclusions**.

| Metric | Verdict | Why / dominant caveat |
|---|---|---|
| `final_state` census (sheltered/unreachable/refused) | **Research-ready** | Pure function of real geography + routing; no placeholder. The one UNREACHABLE-type finding is a real accessibility result. |
| `distance_traveled_m`, `network_dist_to_shelter_m` (V9/V11) | **Research-ready** | Real streets + real shelters + real start points; geodesic + Dijkstra. Caveat: freeways not excluded from the walk graph. |
| Shelter occupancy / utilisation / mean travel | **Research-ready** (structure) / **Partial** (capacity value) | Assignment is real; the 99 capacity is unconfirmed (P) but does not bind at n=100. |
| `exposure_ugm3h` (V6) — **relative** ordering | **Partially meaningful** | Ordering is driven by real travel time in real smoke → meaningful (Gini 0.63). |
| `exposure_ugm3h` — **absolute** magnitude | **Not yet for conclusions** | Dominated by the evacuation-timing assumption (§1e-1): all residents evacuate at t0=Sept 7, before the smoke peak, so absolute exposure is low (mean ≈ 28.5 µg·m³·h; only 2.8 person-hours >55.5). Fix = issue #1. |
| `hours_above_unhealthy` (V8) | **Not yet for conclusions** | Same cause; near-zero only because evacuation precedes the smoke. |
| `vwe_ugm3h` (V7), vwe-Gini | **Software-validation only** | RR_age = RR_com = 1.0 (P), so VWE is *identical* to raw exposure — it carries no vulnerability information yet. The plumbing is validated; the science awaits D5/D6. |
| exposure Gini (V14) | **Partially meaningful** | Correctly reflects travel-time inequality now; will change meaning once vulnerability weighting and evacuation timing are real. |
| Reproducibility manifest | **Research-ready** | Seed, git SHA, versions, dataset SHA-256 all present. |

**Metrics currently dominated by placeholders:** VWE and vwe-Gini (RR=1.0);
absolute exposure and hours-above-unhealthy (evacuation-timing assumption). γ is
no longer among them (removed).

---

## 5. Roadmap prioritised by scientific-validity gain

Ranked by expected improvement to validity, not implementation ease.

| # | Work item | Validity gain | Blocked by |
|---|---|---|---|
| **1** | **Evacuation-timing / exposure-window model.** Today all residents evacuate at t0 (Sept 7), before the smoke, so absolute exposure is meaningless. Options: anchor t0 to smoke onset / advisory (Sept 10); or hold residents at encampments accruing exposure and trigger evacuation when local PM2.5 crosses a threshold. This is the single largest driver of absolute-exposure validity. | **Very high** — converts absolute exposure/hours-above-unhealthy from "not for conclusions" to usable | Modelling decision (defensible from the JOHS Sept-10 shelter opening + AQI advisory timing) |
| **2** | **Resolve RR_age & RR_comorbidity** (D5/D6). Until sourced, VWE = exposure and the project's central metric carries no vulnerability signal. | **Very high** — makes VWE real; it is the thesis's headline | Mentor / literature (Reid 2016, DeFlorio-Barker 2019, Di 2017 CRF) |
| **3** | **Population scale & capacity pressure.** Tie `numAgents` to the PIT 2,037 (D2) so 2×99 capacity actually binds → `REFUSED_ALL_FULL` becomes a real equity outcome. | **High** — activates the capacity/equity mechanism | D2 extraction; capacity confirmation (D1) |
| **4** | **Routing/movement + determinism validation** (VALIDATION_STRATEGY §2–3, §9). Analytic toy-graph test, path/distance consistency, seed byte-reproducibility. | **High** — underwrites trust in every downstream metric | none (ready now) |
| **5** | **Confirm shelter capacity** via a primary JOHS record (D1). | **Medium** | records request |
| **6** | **Freeway exclusion** from the pedestrian graph (CFCC codes present, D0). | **Medium** — removes non-walkable shortcuts | none (data present) |
| **7** | **Five placement strategies + sweeps** (slide 6). Deliberately AFTER 1–4: comparing strategies on a metric that isn't yet valid would produce misleading rankings. | **High once 1–4 done** | 1,2,3 |
| **8** | **Encampment temporal proxy** — seek any archival 2020 spatial source; else keep flagged (D2b). | **Medium** | data availability |

**Immediate next action (this roadmap's #1):** implement the evacuation-timing
model, because it is the highest-validity gain and unblocks meaningful absolute
exposure before any strategy comparison.

---

## 6. Street-dataset verification

- **What the model loads:** `data/Streets.shp` (the extracted shapefile), via
  `ContextCreator.STREETS_SHP = "data/Streets.shp"`. It never reads the ZIP.
- **Is the ZIP required?** No. `Streets.zip` (repo root) is **gitignored**
  (`/Streets.zip`) and referenced by no code — only by prose in the docs as the
  provenance source. The extracted `Streets.*` are the tracked, loaded inputs.
- **Duplicate tracked copies?** None. Only the extracted `Streets.*` are tracked
  (~50 MB across .shp/.dbf/.shx/.prj/.cpg). The ZIP is an *untracked* local
  archive, so there is no duplication inside the repository.
- **Safe cleanup?** Deleting the local ZIP would not affect the repo or
  reproducibility (a fresh clone gets the extracted files and never needs the
  ZIP). **Decision: keep it** — it is the pristine source archive, costs nothing
  in the repo (gitignored), and provides a recovery path if an extracted file is
  ever corrupted. No cleanup is performed; nothing is removed or modified.
- **Reproducibility note:** the extracted `Streets.*` are checksummed in
  `Geography/data/README.md`; `simulation.json` records the `Streets.shp`
  SHA-256 per run, so the exact street input of any result is verifiable.
