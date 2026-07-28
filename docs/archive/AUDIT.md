> **SUPERSEDED — HISTORICAL RECORD ONLY.** This document describes an earlier
> state of the model and does not reflect the final submission. For the current
> model and results see `docs/final/PRESENT_DAY_THREE_ARM_RESULTS.md` and the
> audits alongside it. Retained for provenance.

# Scientific Audit

A complete audit of the model's scientific validity as of the exposure-endpoint
milestone. Covers: (0) the study-endpoint scope decision; (1) every variable,
parameter, dataset, equation and assumption with its evidence class and
downstream influence; (2) the dependency graph; (3) the end-to-end pipeline
diagram; (4) a per-metric validity verdict; (5) a roadmap prioritised by
scientific-validity gain; (6) the street-dataset verification.

Evidence classes: **M** measured Â· **L** literature-derived Â· **C** calibrated Â·
**A** assumed Â· **P** placeholder awaiting evidence.

---

## 0. Study endpoint (scope decision, not a simplification)

**The endpoint of the simulation for each resident is ARRIVAL AT A SHELTER.**
Exposure accumulates only while a resident is outside; on arrival, accumulation
stops. Residents who never reach shelter (`UNREACHABLE`, `REFUSED_ALL_FULL`)
remain outside and keep accruing for the whole event.

**Why this matches the research objective.** The question (slide 4) is where to
place clean-air shelters to reduce the smoke *reaching* unsheltered residents.
The quantity a placement decision can change is the **outdoor exposure time**
during evacuation â€” how far and how long someone must travel, and whether they
can reach shelter at all. Shelter benefit is thus represented as *reduced
outdoor exposure time through better placement and accessibility*.

**Why indoor air quality (Î³) was removed.** Modelling indoor filtration would
introduce an indoor/outdoor ratio Î³ that is (a) not requested anywhere in the
project slides or by the mentor, and (b) unsupported by any acquired data â€”
a second uncertain, unsourced parameter that would dominate absolute benefit
estimates while adding no information about *placement*. Removing it makes the
benefit definition sharp and fully evidence-based: a shelter helps by ending
outdoor exposure sooner. This is a deliberate scope definition; if the advisor
later wants indoor performance modelled, it re-enters as a documented future
extension (F-INDOOR), not a silent default.

Effect of the change (validated): with exposure ending at arrival, per-resident
exposure now **varies with travel time** â€” exposure Gini rose from 0.00
(uniform, Î³=1 artefact) to **0.63**. The metric became discriminating.

---

## 1. Variable / parameter / dataset / assumption inventory

### 1a. Input datasets

| ID | Dataset | Class | Enters at | Influences | Evidence |
|---|---|---|---|---|---|
| D0 | Streets.shp (RLIS centerlines) | **M** | `ContextCreator` graph build | routing, all distances, shelter/agent snapping | City of Portland shapefile (slide 8); provenance date unknown (DATA_SOURCES D0) |
| D3 | AQS hourly PM2.5 88502 | **M** | `SmokeField` | every exposure quantity | EPA AQS, public domain, checksummed |
| D1 | Shelters 2020-09 | **M** coords / **P** capacity | `ContextCreator` shelter load | assignment, capacity, travel | JOHS+Street Roots; coords geocoded; **capacity 99 unconfirmed** |
| D2b | Encampments (IRP) | **M** location / **A** as-2020-proxy | `ContextCreator` agent placement | start points â†’ travel, exposure | Real City data but **2025â€“26 used for 2020** (DATA_SOURCES D2b) |

### 1b. Parameters (parameters.xml)

| Param | Value | Class | Enters at | Influences | Evidence |
|---|---|---|---|---|---|
| `numAgents` | 100 | **A** | agent creation | sample size, capacity pressure | Not yet tied to PIT 2,037 (D2) |
| `minutesPerTick` | 1.0 | **A** | `SmokeField`, exposure Î”t, movement | tickâ†”hour, step length, all integrals | Modelling decision (VARIABLES V13) |
| `walkingSpeedMps` | 1.30 | **L** | movement step length | travel time â†’ exposure duration | Bohannon 1997 (PROVISIONAL for unhoused) |
| `shelterArrivalDistanceM` | 200 | **A** | (currently unused in logic) | â€” | Modelling threshold |
| `simulationHours` | 312 | **A/M** | run length, endAt | exposure window, who arrives before end | Event span Sept 7â€“19 (evidence-based); see issue #1 |
| `randomSeed` | (null=random) | infra | attribute/placement sampling | reproducibility | Recorded in manifest |
| ~~`indoorProtectionFactor` (Î³)~~ | â€” | **REMOVED** | â€” | â€” | Out of scope (Â§0) |

### 1c. Agent-level variables

| Var | Class | Enters at | Influences | Evidence |
|---|---|---|---|---|
| start node | **M** (D2b geom) | placement, routing source | route, travel, exposure duration | RLIS snap of real point |
| route / network dist (V11) | **M** (derived) | `GisAgent.chooseNetworkNearestShelter` | assignment, travel | Dijkstra on D0 |
| distanceTraveled (V9) | **M** (derived) | movement | cost of access | geodesic (Karney 2013) |
| exposure (V6) | **M** (derived) | per-tick accrual while outside | mean/median/Gini/total exposure | D3 Ã— time outside |
| exposureWhileTraveling | **M** (derived) | EN_ROUTE accrual | evacuation-only exposure | D3 Ã— travel time |
| hoursAboveUnhealthy (V8) | **M** (derived) | per-tick, C>55.5 | headline burden metric | EPA AQI breakpoint (D9) |
| RR_age (V2) | **P** =1.0 | vwe multiply | vwe, vwe-Gini | **UNSOURCED** (Di 2017 doesn't support Ã—1.45) |
| RR_comorbidity (V4) | **P** =1.0 | vwe multiply | vwe, vwe-Gini | **UNSOURCED** ("Anderson 2013" not found) |
| vwe (V7) | **MÃ—P** | per-tick | vwe stats | = exposure until RRs sourced |
| final state | **M** (derived) | movement/capacity | outcome census | logic on D0/D1 |

### 1d. Equations

| Equation | Form | Class of inputs |
|---|---|---|
| Geodesic distance/step | GeographicLib inverse/direct (WGS84) | M |
| Shortest path | Dijkstra over geodesic edge weights | M |
| Exposure | Î£_{t: outside} C(t)Â·Î”t | M (C, Î”t) |
| VWE | Î£_{t: outside} C(t)Â·RR_ageÂ·RR_comÂ·Î”t | M Ã— **P** (RRs) |
| Hours above unhealthy | Î£_{t: outside} Î”tÂ·[C(t)>55.5] | M |
| Gini | Î£Î£|x_iâˆ’x_j| / (2nÂ²xÌ„) | M (over the above) |

### 1e. Key assumptions (all flagged, none silent)

1. **Evacuation timing:** every resident begins walking at the simulation start
   and heads straight to shelter (**A**). See issue #1 â€” this currently drives
   absolute exposure more than the smoke does.
2. Encampment points from 2025â€“26 stand in for 2020 (**A**, D2b).
3. Uniform smoke field over the county (**A**, only 2 in-county monitors).
4. Undirected pedestrian graph; freeways not excluded (**A**, DATA_SOURCES D0).
5. First-come-first-served admission; no departures within the event (**A**).
6. Shelter capacity 99 (**P**, unconfirmed).

---

## 2. Dependency graph (how a scientific quantity propagates)

```
Streets.shp (D0,M) â”€â”¬â”€> StreetNetwork (nodes/edges, geodesic weights)
                    â”‚        â”‚
Encampments (D2b,A) â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€> agent start node â”€â”
                    â”‚        â”‚                     â”‚
Shelters (D1)  â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€> shelter node + Dijkstra tree â”€â”
  coords (M)                 â”‚                                 â”‚
  capacity (P) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€> capacity enforcement
                             â”‚                                 â”‚
                             â””â”€> route + network distance (V11,M) â”€â”
                                                                   â”‚
AQS PM2.5 (D3,M) â”€> SmokeField C(x,t) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                  â”‚
minutesPerTick (A) â”€> Î”t, step length â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€> movement â”€â”€â”€â”€â”€â”¤
walkingSpeedMps (L) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                  â”‚
                                                                   â–¼
                              time-outside (until arrival) â”€â”€> exposure (V6,M)
                                                                   â”‚
RR_age (P=1) â”€â”                                                    â”‚
RR_com (P=1) â”€â”´â”€> vulnerability weight â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€> VWE (V7, MÃ—P)
                                                                   â”‚
                        hours>55.5 (V8,M), distance (V9,M), state â”€â”¤
                                                                   â–¼
                        Gini / mean / median / totals (simulation-level, M)
                                                                   â”‚
                                                                   â–¼
                        agents.csv Â· shelters.csv Â· simulation.json + manifest
                                                                   â”‚
                                                                   â–¼
                        (future) strategy comparison & statistical analysis
```

Read a column downward: anything a **P** feeds is at most as trustworthy as
that placeholder. VWE inherits **P** from the RRs; everything on the exposure/
distance/Gini path is **M** except where the evacuation-timing assumption (Â§1e-1)
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

Verdicts: **Research-ready** Â· **Partially meaningful** (relative ok, absolute
caveated) Â· **Software-validation only** Â· **Not yet for conclusions**.

| Metric | Verdict | Why / dominant caveat |
|---|---|---|
| `final_state` census (sheltered/unreachable/refused) | **Research-ready** | Pure function of real geography + routing; no placeholder. The one UNREACHABLE-type finding is a real accessibility result. |
| `distance_traveled_m`, `network_dist_to_shelter_m` (V9/V11) | **Research-ready** | Real streets + real shelters + real start points; geodesic + Dijkstra. Caveat: freeways not excluded from the walk graph. |
| Shelter occupancy / utilisation / mean travel | **Research-ready** (structure) / **Partial** (capacity value) | Assignment is real; the 99 capacity is unconfirmed (P) but does not bind at n=100. |
| `exposure_ugm3h` (V6) â€” **relative** ordering | **Partially meaningful** | Ordering is driven by real travel time in real smoke â†’ meaningful (Gini 0.63). |
| `exposure_ugm3h` â€” **absolute** magnitude | **Not yet for conclusions** | Dominated by the evacuation-timing assumption (Â§1e-1): all residents evacuate at t0=Sept 7, before the smoke peak, so absolute exposure is low (mean â‰ˆ 28.5 ÂµgÂ·mÂ³Â·h; only 2.8 person-hours >55.5). Fix = issue #1. |
| `hours_above_unhealthy` (V8) | **Not yet for conclusions** | Same cause; near-zero only because evacuation precedes the smoke. |
| `vwe_ugm3h` (V7), vwe-Gini | **Software-validation only** | RR_age = RR_com = 1.0 (P), so VWE is *identical* to raw exposure â€” it carries no vulnerability information yet. The plumbing is validated; the science awaits D5/D6. |
| exposure Gini (V14) | **Partially meaningful** | Correctly reflects travel-time inequality now; will change meaning once vulnerability weighting and evacuation timing are real. |
| Reproducibility manifest | **Research-ready** | Seed, git SHA, versions, dataset SHA-256 all present. |

**Metrics currently dominated by placeholders:** VWE and vwe-Gini (RR=1.0);
absolute exposure and hours-above-unhealthy (evacuation-timing assumption). Î³ is
no longer among them (removed).

---

## 5. Roadmap prioritised by scientific-validity gain

Ranked by expected improvement to validity, not implementation ease.

| # | Work item | Validity gain | Blocked by |
|---|---|---|---|
| **1** | **Evacuation-timing / exposure-window model.** Today all residents evacuate at t0 (Sept 7), before the smoke, so absolute exposure is meaningless. Options: anchor t0 to smoke onset / advisory (Sept 10); or hold residents at encampments accruing exposure and trigger evacuation when local PM2.5 crosses a threshold. This is the single largest driver of absolute-exposure validity. | **Very high** â€” converts absolute exposure/hours-above-unhealthy from "not for conclusions" to usable | Modelling decision (defensible from the JOHS Sept-10 shelter opening + AQI advisory timing) |
| **2** | **Resolve RR_age & RR_comorbidity** (D5/D6). Until sourced, VWE = exposure and the project's central metric carries no vulnerability signal. | **Very high** â€” makes VWE real; it is the thesis's headline | Mentor / literature (Reid 2016, DeFlorio-Barker 2019, Di 2017 CRF) |
| **3** | **Population scale & capacity pressure.** Tie `numAgents` to the PIT 2,037 (D2) so 2Ã—99 capacity actually binds â†’ `REFUSED_ALL_FULL` becomes a real equity outcome. | **High** â€” activates the capacity/equity mechanism | D2 extraction; capacity confirmation (D1) |
| **4** | **Routing/movement + determinism validation** (VALIDATION_STRATEGY Â§2â€“3, Â§9). Analytic toy-graph test, path/distance consistency, seed byte-reproducibility. | **High** â€” underwrites trust in every downstream metric | none (ready now) |
| **5** | **Confirm shelter capacity** via a primary JOHS record (D1). | **Medium** | records request |
| **6** | **Freeway exclusion** from the pedestrian graph (CFCC codes present, D0). | **Medium** â€” removes non-walkable shortcuts | none (data present) |
| **7** | **Five placement strategies + sweeps** (slide 6). Deliberately AFTER 1â€“4: comparing strategies on a metric that isn't yet valid would produce misleading rankings. | **High once 1â€“4 done** | 1,2,3 |
| **8** | **Encampment temporal proxy** â€” seek any archival 2020 spatial source; else keep flagged (D2b). | **Medium** | data availability |

**Status update:** roadmap #1 (evacuation-timing model) is now **IMPLEMENTED and
validated** (`PRE_EVAC` state + sourced 55.5 Âµg/mÂ³ trigger): residents shelter in
place accruing exposure until the smoke reaches the EPA "Unhealthy" breakpoint,
then evacuate. Absolute exposure rose from mean 28.5 â†’ **379 ÂµgÂ·mÂ³Â·h** and
person-hours-above-unhealthy from 2.8 â†’ **281**, so absolute exposure is now
materially meaningful (exposure Gini 0.30). **Tracked refinement:** also gate
evacuation on shelter operating dates (Sep 10â€“11) so the transient Sep 7 PM2.5
spike does not trigger evacuation before shelters existed. **Next by validity
gain:** #2 (resolve RR_age/RR_comorbidity â€” needs mentor) then #4
(routing/movement + determinism tests).

---

## 6. Street-dataset verification

- **What the model loads:** `data/Streets.shp` (the extracted shapefile), via
  `ContextCreator.STREETS_SHP = "data/Streets.shp"`. It never reads the ZIP.
- **Is the ZIP required?** No. `Streets.zip` (repo root) is **gitignored**
  (`/Streets.zip`) and referenced by no code â€” only by prose in the docs as the
  provenance source. The extracted `Streets.*` are the tracked, loaded inputs.
- **Duplicate tracked copies?** None. Only the extracted `Streets.*` are tracked
  (~50 MB across .shp/.dbf/.shx/.prj/.cpg). The ZIP is an *untracked* local
  archive, so there is no duplication inside the repository.
- **Safe cleanup?** Deleting the local ZIP would not affect the repo or
  reproducibility (a fresh clone gets the extracted files and never needs the
  ZIP). **Decision: keep it** â€” it is the pristine source archive, costs nothing
  in the repo (gitignored), and provides a recovery path if an extracted file is
  ever corrupted. No cleanup is performed; nothing is removed or modified.
- **Reproducibility note:** the extracted `Streets.*` are checksummed in
  `Geography/data/README.md`; `simulation.json` records the `Streets.shp`
  SHA-256 per run, so the exact street input of any result is verifiable.

