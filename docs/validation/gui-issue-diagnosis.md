# GUI Issue Diagnosis — "strange shapes" & agents vanishing near tick 1800

**Question investigated (2026-07-24):** the Repast visualization shows agents as
strange shapes, and they disappear after around 1800 ticks. Is this
(a) visualization-only, (b) an agent-lifecycle issue, or (c) a routing issue?

**Verdict: a combination of (a) and (c) — and definitively NOT (b).**

| Symptom | Verdict | Cause |
|---|---|---|
| Strange shapes | **Visualization-only** | Stock-demo style leftovers in the scenario's three display descriptors |
| Disappear ~tick 1800 | **Visualization-only (perception)** | All agents finish arriving at tick 1835/1866 and stack motionless on 2 shelter points for the remaining ~16,900 ticks |
| Agents moving oddly across the map | **Routing-layer data defect (real — CORRECTED)** | "Wormhole" edges from corrupted `PDX_F_NODE`/`PDX_T_NODE` attributes sent ~45% of agents on long straight-line off-street legs |

**Update (same day):** the §3 routing defect was subsequently corrected and
validated — see `STREET_NETWORK_VALIDATION.md` (node-site validation layer in
`StreetNetwork`, 27 corrupt IDs corrected, 50→0 impossible edges, all routing
tests pass). The display styling (§1) and the co-location perception (§2)
remain as described and are deliberately untouched.

## 1. Strange shapes — visualization configuration, not model state

The scenario registers **three** displays (`Geography.rs/scenario.xml`), each
with different, partly stale styling:

| Display | Type | GisAgent (resident) style | Shelter style |
|---|---|---|---|
| "GIS (legacy)" (`display_1.xml`) | 2D legacy `DisplayGIS` | **SLD `star`, size 34, fill `#CCFF33`** (lime-green stars) | *no style entry at all* (default rendering) |
| "GIS (edited style)" (`display_3.xml`) | GIS 3D | `EditedMarkStyle` → pale-yellow circle 15 px (`styles/geography.agents.GisAgent.style_0.xml`) | **`geography.agents.RadioTower.style_0.xml` → `./icons/radio.png`** — a radio-tower icon from the deleted stock demo |
| "GIS (3D)" (`display_2.xml`) | GIS 3D | `GisAgentStyle.java` — yellow circle, scale 0.2 (small) | `TowerAgentStyle.java` (another stock-demo tower) |

So depending on which display tab is active, residents are big lime **stars**
or small yellow circles, and shelters render as **radio towers** — all
inherited from the Repast "Geography" demo the project was built from. No
style encodes agent state (PRE_EVAC/EN_ROUTE/SHELTERED/…), so state changes
are invisible. This is purely cosmetic: the exported data is untouched by
display styling.

*Deferred fix (cosmetic, safe any time):* keep a single display, bind Shelter
to a building-like mark, and style GisAgent by `getState()` so arrival/refusal
is visible during runs.

## 2. Disappearance ~tick 1800 — agents converge and stop; nothing is removed

Evidence from the exported data (both runs, `agents.csv`):

- Every agent evacuates at **tick 960** and the **last shelter arrival is tick
  1835 (seed 42) / 1866 (seed 1776194289)** — exactly the "around 1800 ticks"
  the GUI shows.
- From then until the end of the run (tick 18,720) **no agent moves**: 49 (of
  50) / 100 (of 100) agents sit at *exactly* the shelter point coordinates —
  44 stacked on OCC and 5 on CJ in the seed-42 run — visually indistinguishable
  from one or two marks (partly hidden behind the shelter's own mark). The one
  UNREACHABLE agent stays motionless at its encampment.
- **Lifecycle is intact**: `ContextCreator`/`GisAgent` contain no
  `context.remove()`; the end-of-run export enumerates all 50/100 agents alive
  in the context, and the final-state census reconciles 37/37 verification
  checks (`scripts/analyze_run.py`).

So agents don't disappear — they co-locate and freeze, which at city zoom looks
like disappearance. This is correct model behavior being displayed unhelpfully.

## 3. Routing-layer defect (real, affects data, visible in the GUI)

Discovered while cross-checking `total_travel_distance_m` against
`network_dist_to_shelter_m`:

- **22/50 (seed 42) and 48/100 (seed 1776194289) agents walked discrete,
  repeatable surpluses** over their shortest-path distance — clusters at
  ~1.7, 9.2, 17.3, 24.5, 40.8, 65.0 km — identical values shared by agents
  starting at *different* encampments.
- Probe of `data/Streets.shp` (reproducing `StreetNetwork`'s graph
  construction exactly) found the cause: **27 node IDs, all in a contiguous
  `107657–107723` block, are claimed at coordinates 9–18.5 km apart by
  different features** (55 features affected — short "UNNAMED RD" stubs,
  I-5 freeway ramp pieces, street ends like SE Harney St / SE Lambert St /
  SE 82nd Ave / NW Skyline Blvd). The shapefile has **zero multi-part
  features**, ruling out geometry truncation; this is an attribute defect in
  the RLIS-derived `PDX_F_NODE`/`PDX_T_NODE` columns.
- Because `StreetNetwork` trusts attribute topology, each defective feature
  becomes a **"wormhole" edge**: its Dijkstra weight is its short polyline
  length (tens of metres) but it connects nodes kilometres apart. Shortest
  paths cross town "for free" (recorded `network_dist_to_shelter_m` is
  under-estimated), while the walking agent physically traverses the gap as a
  long straight geodesic leg — off the street grid, at 1.3 m/s. Observed
  surpluses match the measured gaps (e.g. surplus 9,230 m ≈ gap 9,270 m;
  17,260 ≈ 17,219; 24,540 ≈ 2 × 12,204 through the NW Skyline pair).
- **GUI signature:** agents visibly gliding across the map in straight lines
  (through the river / off-street) — a large part of the "agents move
  strangely" impression.
- **Data impact:** the detour cohort's travel time (median 578 vs 38 min) and
  exposure (median 648 vs 199 µg·m⁻³·h) are inflated ~15× / ~3×; shelter
  *choice* can also be wrong (network-nearest judged through a wormhole).
  Flagged per-agent in every `analysis/summary.json` under
  `routing_anomaly`.

*Fix applied (after this diagnosis was written):* `StreetNetwork` now clusters
node claims by location, reattaches or splits corrupted sites with full
provenance, and audits every edge — `routing_anomaly.n_flagged` dropped to 0
(the single residual flag is a 213 m encampment-snap first leg, verified).
Method, evidence and before/after results: `STREET_NETWORK_VALIDATION.md`.
`STRUC_TYPE`/`TYPE`-based freeway exclusion remains tracked as roadmap #6.

## 4. How this was verified

- `Geography.rs/scenario.xml`, `display_1/2/3.xml`, `styles/*.xml`,
  `GisAgentStyle.java`, `ContextCreator.java`, `GisAgent.java`,
  `StreetNetwork.java`, `OutcomeLogger.java` (code reading).
- `scripts/analyze_run.py` verification suite: 37/37 cross-checks per run.
- Read-only `Streets.shp` probe (session scratchpad; Web-Mercator → WGS84,
  first-feature-wins node registry identical to `addStreet`).
