# Scientific Variable Registry — Wildfire Smoke Shelter ABM

Living registry of every scientific variable in the model. Numbering follows
`PROJECT_ASSESSMENT.md` Phase 3. Rules: **no invented values** — every number
is either literature-sourced (citation + DOI), a flagged modeling decision, or
a derived quantity; provisional values are marked and swept in sensitivity
analysis.

Format per variable: purpose · implementation location · scientific mechanism
· assumptions · limitations · source.

---

## V13 — `minutesPerTick` (tick ↔ wall-clock mapping)

- **Purpose:** Defines the simulated duration of one Repast schedule tick;
  the Δt underlying every future exposure integral (exposure-hours, VWE) and
  the alignment of the run to the Sept 7–19, 2020 hourly PM2.5 record.
- **Implementation:** `Geography.rs/parameters.xml` (`minutesPerTick`,
  default **1.0 min/tick**); consumed in `GisAgent.step()` to compute per-tick
  step length.
- **Scientific mechanism:** With 1 min/tick, 60 ticks aggregate to one hourly
  PM2.5 observation (AirNow's native resolution) with no partial-hour
  remainder; the Sept 7–19 2020 event (12 days) spans 17,280 ticks.
- **Assumptions:** All agent processes (movement, later exposure accrual) are
  well-approximated as piecewise-constant over 1-minute intervals.
- **Limitations / rationale for value:** This is a **modeling decision, not a
  literature value** (flagged per Phase 3). 1 min was chosen over 5 min
  because a 5-min tick at 1.3 m/s walks ~390 m/tick — longer than many street
  segments, causing systematic overshoot in path-following; a 1-min tick
  (~78 m) stays below typical segment lengths. Candidate for pre-registration.
- **Source:** none required (decision variable); recorded here + commit log.

## V10 — `walkingSpeedMps` (mobility)

- **Purpose:** Resident walking speed; controls time-to-shelter and therefore
  en-route smoke exposure; a declared sensitivity-sweep axis ("mobility
  assumptions", slides 5/9).
- **Implementation:** `Geography.rs/parameters.xml` (`walkingSpeedMps`,
  default **1.30 m/s**); consumed in `GisAgent.step()`
  (`stepLengthM = walkingSpeedMps × 60 × minutesPerTick`).
- **Scientific mechanism:** Comfortable (self-selected) gait speed of adults;
  replaces the stock demo's uncited anisotropic 0.00015 °/tick (~12–17 m/min
  depending on heading at 45.5° N).
- **Source:** Bohannon RW (1997). *Comfortable and maximum walking speed of
  adults aged 20–79 years: reference values and determinants.* Age and Ageing
  26(1):15–19. **DOI: 10.1093/ageing/26.1.15**. Reported mean comfortable
  speeds range 127.2 cm/s (women, 8th decade) to 146.2 cm/s (men, 5th
  decade); 1.30 m/s lies within this measured range.
- **Assumptions:** Healthy-adult reference values approximate the mobility of
  the modeled population at baseline.
- **Limitations:** **PROVISIONAL.** Bohannon's cohort is healthy adults;
  unhoused adults with chronic illness or mobility impairments may be slower,
  and smoke itself reduces exertion capacity. The parameter is deliberately
  sweepable; population-specific speeds (and age-dependence, cf. V1) should
  be revisited with the mentor before results are quoted. Candidate
  literature for refinement: Fazel et al. 2014 (Lancet) on homeless-population
  health burden; Studenski et al. 2011 (JAMA, gait speed and aging).

## — `shelterArrivalDistanceM` (arrival threshold)

- **Purpose:** Radius within which a resident at the end of a street path is
  considered to have reached the target shelter.
- **Implementation:** `Geography.rs/parameters.xml`
  (`shelterArrivalDistanceM`, default **200 m**); consumed in
  `GisAgent.step()` end-of-path check.
- **Scientific mechanism:** Threshold replacing the stock demo's 0.002-degree
  radius, which was direction-dependent at Portland's latitude (~222 m N–S vs
  ~156 m E–W); 200 m is the same order of magnitude, now isotropic.
- **Assumptions:** Once within 200 m of a shelter, final approach (building
  entry, street crossing) is not explicitly simulated.
- **Limitations:** Modeling threshold, not a literature value (flagged). Will
  shrink naturally when true street-graph routing (roadmap commit 4) lets
  agents terminate exactly at shelter-adjacent street nodes.
- **Source:** none required (decision variable, flagged).

## V9 — `distanceTraveledM` (derived)

- **Purpose:** Cumulative geodesic metres walked per agent; cost-of-access
  covariate and future equity metric; exposure accrues during travel.
- **Implementation:** Accumulator on `GisAgent` (`getDistanceTraveledM()`),
  incremented by `stepLengthM` on each movement tick.
- **Scientific mechanism:** Derived quantity — no external value. Geodesic
  (WGS84 ellipsoid) rather than degree-based, per V10's unit correction.
- **Limitations:** Until commit 5 (agents persist), the accumulator is lost
  when an agent arrives and self-removes; it becomes reportable with the
  outcome-logging system (roadmap commit 11).

## V11 — `networkDistToShelterM` (shelter accessibility)

- **Purpose:** Street-network distance (metres) from a resident's starting
  node to the shelter it selects — "the nearest shelter you can *actually
  reach*" (slide 7) and the future Gap-index strategy input.
- **Implementation:** `GisAgent.getNetworkDistToShelterM()`; computed at
  route selection from the chosen shelter's Dijkstra tree
  (`geography.routing.StreetNetwork`). **Recorded at the FIRST selection
  only** (initial accessibility from the start node). After a capacity
  refusal the resident re-plans from the refusing shelter's node (D-6 /
  A-17); those legs do not overwrite V11. Total planned walking across all
  legs is the QC column `planned_route_m` (`GisAgent.getPlannedRouteM()`),
  against which walked distance is checked (walked ≤ planned +
  `snap_gap_m` + 200 m, a failing check in `scripts/analyze_run.py`).
- **Scientific mechanism:** Shortest-path distance over the RLIS street
  graph (nodes = `PDX_F_NODE`/`PDX_T_NODE` intersection ids; edge weights =
  geodesic polyline lengths in metres). Undirected graph — pedestrians are
  not bound by one-way vehicle restrictions (assumption, documented).
- **Assumptions:** All mapped street centerlines are walkable (no
  freeway-pedestrian exclusion yet); grade separation is honored via the
  RLIS node ids themselves.
- **Limitations:** Freeway/highway segments (CFCC codes) are not yet
  filtered from the pedestrian graph — flagged for the data-curation pass
  (roadmap commits 6–7). NaN when no shelter is reachable (disconnected
  component); that outcome becomes a logged state in roadmap commit 5.
- **Source:** derived quantity; graph algorithm standard (Dijkstra 1959,
  Numer. Math. 1:269–271, DOI: 10.1007/BF01386390).

## Outcome states — `GisAgent.State` (commit 5)

- **Purpose:** Explicit per-agent outcome vocabulary
  (`EN_ROUTE` / `SHELTERED` / `UNREACHABLE`; `REFUSED_ALL_FULL` reserved for
  capacity enforcement, roadmap commit 6) matching the Phase 5 logging
  schema's `finalState` field.
- **Implementation:** `GisAgent.getState()`, `getArrivalTick()`,
  `getTargetShelter()`; agents are **never removed from the context** — a
  sheltered agent persists at its shelter, an unreachable agent persists at
  its start location.
- **Scientific mechanism:** Outcome measurement requires the full
  population denominator. The stock demo deleted agents on both arrival and
  failure, making the two outcomes indistinguishable and biasing any future
  exposure statistic toward survivors (survivorship bias —
  PROJECT_ASSESSMENT.md risk 2). Persistent states make every agent
  countable in exposure-hours, VWE, and Gini computations.
- **Assumptions:** A SHELTERED agent stays sheltered (no departures within
  the event window); an UNREACHABLE agent shelters in place at its start
  location for the whole event.
- **Limitations:** States are currently terminal; re-evaluation (e.g.,
  leaving a full shelter) arrives with capacity enforcement in commit 6.
- **Source:** design requirement from the project brief (Agent ID /
  Final outcome record) — no external value.

## Movement-geometry implementation note (commit 3)

All movement arithmetic in `GisAgent.step()` — shelter-distance ranking, path
orientation, vertex advance, per-tick displacement — now uses GeographicLib's
solutions of the geodesic inverse/direct problems on the WGS84 ellipsoid
(`net.sf.geographiclib.Geodesic`, bundled inside Repast 2.11's GIS plugin;
Karney 2013, *Algorithms for geodesics*, J. Geodesy 87:43–55,
DOI: 10.1007/s00190-012-0578-z).

Two deliberate residuals, both scheduled for roadmap commit 4 (street-graph
routing):

1. **Nearest-street selection** still ranks candidate streets by JTS planar
   degree distance (point-to-polyline). At city scale the anisotropy
   (cos 45.5° ≈ 0.70 between E–W and N–S degree lengths) can misrank streets
   whose distances differ by less than ~30%; acceptable for a heuristic that
   routing will replace outright.
2. **Vertex overshoot:** an agent advances its path index when the next
   vertex is closer than one tick's step length, then walks a full step —
   it may overshoot short segments slightly, as the stock demo did.

The movement schedule now starts at tick 1 (was tick 30). The stock demo's
30-tick idle had no documented meaning; once ticks acquired time semantics
(V13), an arbitrary 30-simulated-minute delay before anyone seeks shelter
would have been an undocumented scenario assumption.
