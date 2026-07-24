# Street Network Validation — corrupt node attributes, correction, and proof

**Date:** 2026-07-24 · **Status: correction implemented and validated; all
routing tests pass.** This document records the highest-priority integrity
defect found in the model to date, the correction, and the evidence that the
corrected network is physically defensible.

## 1. Problem discovered

The results-analysis workflow (`scripts/analyze_run.py`) cross-checks each
agent's walked distance (`total_travel_distance_m`) against its shortest-path
distance (`network_dist_to_shelter_m`). In the pre-fix demonstration runs,
**22/50 (seed 42) and 48/100 (seed 1776194289) agents walked discrete,
repeatable surpluses** — clusters at ~1.7, 9.2, 17.3, 24.5, 40.8, 65.0 km —
shared by agents starting at *different* encampments.

Cause: `StreetNetwork` keyed graph nodes by the `PDX_F_NODE`/`PDX_T_NODE`
attributes in `Streets.dbf`, trusting them as authoritative topology. A small
block of those attributes is **corrupt: the same node ID is claimed at
locations up to 18.5 km apart by different features.** Each such feature became
a **"wormhole" edge** — Dijkstra weight = its short polyline length (tens of
metres), physical span = kilometres. Shortest paths crossed town "for free"
(recorded network distances were *under*-estimates), while walking agents
physically traversed the gap as long straight off-street legs at 1.3 m/s
(inflating travel time ~15× and exposure ~3× for the affected cohort, and
sometimes changing which shelter was judged "nearest").

## 2. Evidence

- Independent probe of `data/Streets.shp` (Web Mercator → WGS84, reproducing
  the exact graph construction): **27 node IDs, all in the contiguous block
  107657–107723, claimed at positions 9–18.5 km apart** across ~55 features —
  short "UNNAMED RD" stubs, I-5 freeway ramp pieces, and street ends
  (SE Harney St, SE Lambert St, SE 82nd Ave, NW Skyline Blvd, …).
- The shapefile has **zero multi-part features** — geometry truncation ruled
  out; this is purely an attribute defect.
- Legacy-graph audit (`scripts/test_routing.py`): **50 edges** whose
  node-to-node span exceeds their polyline length + 220 m slack — impossible
  jumps by construction.
- Observed per-agent surpluses match the measured attribute displacements
  (e.g. surplus 9,230 m ≈ gap 9,270 m; 17,260 ≈ 17,219; 24,540 ≈ 2 × 12,204
  through the NW Skyline Blvd pair).
- Full per-agent flags: `analysis/summary.json → routing_anomaly` of the
  archived pre-fix runs (`Geography/output/archive-pre-networkfix/`).

## 3. Correction method (nothing deleted, full provenance)

Implemented in `geography.routing.StreetNetwork` (graph finalisation inside
`buildIndex()`); the source shapefile is **not modified** — corrections happen
at load time and are logged:

1. **Claim clustering.** Every feature endpoint registers a claim
   (attribute ID + coordinate). Claims of one ID within
   `NODE_SITE_TOLERANCE_M = 100 m` form one *node site*. Rationale: legitimate
   RLIS endpoint scatter is sub-metre; the smallest corrupt displacement is
   ~1.65 km — 100 m separates the regimes with wide margin.
2. **Correction of extra sites.** The first site keeps the attribute ID
   (primary). Every additional site — the corruption signature — is:
   - **REATTACHED** to an existing primary node within
     `REATTACH_TOLERANCE_M = 10 m` (same physical junction), else
   - **SPLIT** into a synthetic node (negative ID) at its true location.
   Every correction is recorded (kind, attribute ID, graph ID, displacement,
   lon/lat, first claiming feature, claim count) and exported in every
   `simulation.json` under `street_network_validation.corrections`.
3. **Edge audit.** Every edge's endpoint coordinates are checked against its
   resolved nodes (max residual gap reported) and the geographic distance
   between its connected nodes is compared with its polyline length —
   any edge spanning farther than it is long (+220 m slack) is counted as an
   impossible jump. **Post-fix count: 0.**
4. **Connectivity census.** Components are recomputed and reported.

Result on this dataset: **27 corrupt attribute IDs → 4 sites reattached by
geometry, 23 split to synthetic nodes** (graph: 89,322 attribute IDs →
89,345 final nodes; all 112,070 features retained as edges).

## 4. Validation results

### Graph level

| Check | Legacy (attribute-trusting) | Corrected |
|---|---|---|
| Impossible-span edges | **50** | **0** |
| Max endpoint gap | ~18,552 m | **11.9 m** |
| Components (count / largest) | 154 / 60,444 | **154 / 60,444 — unchanged** |

**The correction does not change connectivity**: the wormholes linked places
already inside the same component, and split/reattached stubs remain connected
through their valid endpoints. It only removes physically impossible shortcuts.

### Routing tests (`scripts/test_routing.py`) — ALL PASS on both re-runs

| Test | What it verifies | Result |
|---|---|---|
| T1 | Independent Python Dijkstra over an independently rebuilt graph reproduces each sampled agent's exported `network_dist_to_shelter_m` | exact agreement (≤ 0.1 m display precision), 31 sampled agents incl. worst-detour agent |
| T2 | walked distance ≈ encampment-snap gap + network distance | max error 8.9 m (tolerance 80 m = one movement step) |
| T3 | effective walking speed of **every** arrived agent within literature bounds (Bohannon 1997, comfortable gait 1.27–1.46 m/s; model constant 1.30) | 1.300–1.376 m/s |
| T4 | network ≥ straight-line distance; circuity ≤ 3.0 | circuity observed 0.99–1.51 |
| T5 | zero impossible-span edges in the corrected graph | 0 (legacy: 50) |

### Before / after — demonstration runs (identical seeds, agents, parameters)

| Metric | Seed 42 before | Seed 42 after | Seed 1776194289 before | after |
|---|---|---|---|---|
| Sheltered / total (success) | 49/50 | 49/50 | 100/100 | 100/100 |
| Unreachable / refused | 1 / 0 | 1 / 0 | 0 / 0 | 0 / 0 |
| Travel time, arrived (med · max min) | 56 · 875 | **49 · 212** | 70 · 906 | **68 · 211** |
| Distance walked (med · max km) | 4.41 · 68.30 | **3.88 · 16.54** | 5.52 · 70.68 | **5.34 · 16.50** |
| Exposure µg·m⁻³·h (med · mean · Gini) | 226 · 1442 · 0.80 | 216 · 1331 · 0.82 | 242 · 388 · 0.29 | 239 · 259 · **0.16** |
| VWE | ≡ exposure (RRs = 1.0) | ≡ exposure | ≡ exposure | ≡ exposure |
| Person-hours > Unhealthy | 326 | **259** | 294 | **137** |
| Shelter occupancy OCC / CJ | 44 / 5 | 43 / 6 | 97 / 3 | 96 / 4 |
| Agents whose assigned shelter changed | — | 2 | — | 1 |
| Last arrival (tick) | 1835 | **1172** | 1866 | **1171** |
| Detour-flagged agents (> 200 m surplus) | 22 | **0** | 48 | **1**¹ |

¹ Site 95, surplus 213 m — fully explained by its encampment sitting 213 m from
the nearest street node (the first walking leg), verified by T2. Not a graph
defect.

Interpretation: success rates and the fast half of the travel distribution were
essentially unaffected (medians move ≤ 7 min), but the *tails* — max travel
time, max distance, exposure means, person-hours above Unhealthy, and the
exposure Gini among sheltered agents — were substantially corrupted by the
wormholes and are now physically defensible. The seed-42 Gini *rises* slightly
(0.80 → 0.82) because the lone UNREACHABLE agent now stands out even more
against cheaper sheltered journeys — the correct equity signal.

## 5. Remaining limitations

1. **Split stubs may dangle.** 23 sites became synthetic nodes; features whose
   *both* endpoints are corrupt and non-coincident with any junction become
   short isolated spurs. They are real street pieces whose true connections are
   unknowable from the corrupt attributes; we do not invent connections.
   (No sampled agent snapped to one; `nearestNode` could in principle.)
2. **Geometric coincidence is not merged in general** — two *different* node
   IDs at the same location remain distinct nodes (pre-existing RLIS property,
   unchanged by this fix).
3. **The source `Streets.dbf` is untouched** (by design). Anyone rebuilding a
   graph from the raw attributes without this validation layer re-creates the
   wormholes. Upstream RLIS should eventually be notified.
4. **Commit stamping:** the post-fix demonstration runs record
   `git_commit = 14bf5f5…` (the parent commit) because they were executed from
   the corrected working tree immediately before the combined commit; the
   presence of the `street_network_validation` block in their manifests
   unambiguously identifies the corrected build.
5. Freeway centerlines remain routable for pedestrians (tracked roadmap item);
   encampment snap gaps up to ~213 m are walked as straight first legs.

## 6. How to re-verify

```powershell
cd Geography; .\gradlew.bat compileJava; cd ..
powershell -File scripts\run-headless.ps1          # writes output/run_seed<seed>/
python scripts\analyze_run.py                       # 37 consistency checks + figures
python scripts\test_routing.py                      # T1-T5 routing validation
```

Pre-fix baselines are preserved under
`Geography/output/archive-pre-networkfix/` (gitignored, regenerable at commit
`14bf5f5` with the same seeds).
