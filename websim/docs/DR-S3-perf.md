# DR-S3 — Performance harness on the real graph (plan WP2-S3, §3.6 budgets)

**Status: CLOSED with measurements. Every §3.6 budget is met — the closure wave and the
worst case outright, the default preset once the first rung of the escalation ladder is
applied. The WASM escalation decision record is NOT opened.**

One budget — the default preset — is met on this machine with roughly 2× margin, but
sits **exactly on the line** once a 2× derate for a slower reference laptop in a browser
is applied: across five runs it lands at 95%–116% of budget derated, flipping between
"met (tight)" and "at risk" run to run. It is recovered, with 14–16× margin, by the
*first* rung of the plan's escalation ladder (tuning), which is measured here rather
than assumed. WASM is not needed and should not be started.

| Artefact | Path |
|---|---|
| Harness | `websim/validation/spikes/perf/` |
| CLI | `npx tsx validation/spikes/perf/run-s3-perf.ts` |
| Machine-readable results | `websim/validation/spikes/perf/s3-results.json` |
| Recorded console transcript | `websim/validation/spikes/perf/s3-console.txt` |
| Regression tests | `websim/validation/test/spike-s3-perf.test.ts` (7 tests) |

**Host for every number below:** Windows 11, Node v24.18.0, Intel i7-11700KF @ 3.60 GHz
(16 logical cores), 15.9 GB. This is a **desktop**, not the plan's "reference laptop" —
see §6 for how that is handled.

---

## 1. Verdict table

Ranges are the observed spread over five runs on the same host; the parenthesised figure
is the percentage of budget consumed.

| Budget (§3.6) | Measured here | Derated 2× | Verdict |
|---|---|---|---|
| Closure wave: 46 SSSPs ≤ 5 s (stretch 0.5–1.5 s) | **0.12–0.17 s** (1 thread, 2–3%) | 0.24–0.35 s (5–7%) | **MET** — also clears the stretch target |
| Default preset 2,037 × 312 h = 38,132,640 agent-ticks ≤ 60 s | **28.50–34.86 s** (48–58%) | 57–70 s (**95–116%**) | **ON THE LINE** untuned — flips between met-tight and at-risk run to run |
| Worst case 6,842 × 455 h = 186,786,600 agent-ticks + 6 waves ≤ 8 min | **151–176 s** (31–37%) | 302–352 s (63–73%) | **MET (tight)** untuned |
| Default preset, **tuned** | **1.85–2.14 s** (3–4%) | 3.7–4.3 s (6–7%) | **MET** |
| Worst case + 6 waves, **tuned** | **10.50–13.10 s** (2–3%) | 21–26 s (4–5%) | **MET** |

**Escalation decision: do NOT open the WASM decision record.** The plan's ladder is
`hoist/pool tuning → SSSP pool widening → Rust/WASM`. Rung 1 alone moves the only
borderline budget from 95–116% to 6–7% of budget at 2× derate — a 15× margin where there
was none. Rung 2 (the SSSP worker pool) turns out to be unnecessary for the budget and is
a *pessimisation* at this graph size unless the pool is persistent (§4). WASM (rung 3)
would be optimising a loop that, once rung 1 is applied, spends 97% of its time on
budgeted headroom.

**The one-line reason the untuned number is borderline and the tuned number is not:**
geodesic `Direct` is **95.3% of tick-loop wall**, and under the §3.6 graft nothing inside
a tick reads its result (§5).

---

## 2. What was built

Seven modules under `validation/spikes/perf/`, all Node + TypeScript, no WASM:

| File | Role |
|---|---|
| `hexfloat.ts` | Java `Double.toHexString` parser + IEEE-754 bit/ULP comparison |
| `geodesic.ts` | Typed handle on `geographiclib-geodesic` with explicit outmasks |
| `graph-csr.ts` | S2 dump → CSR typed arrays (all SharedArrayBuffer-backed) + per-edge cumulative segment geometry |
| `dijkstra.ts` | Binary-heap SSSP, lazy deletion, strict `<`, optional blocked-edge filter |
| `agent-tick.ts` | SoA agent tick loop on **real routed paths**, four movement variants |
| `sssp-worker.ts` | Pool worker; CSR and output slabs are shared, nothing is copied back |
| `run-s3-perf.ts` | Stage driver + budget projection + verdicts |

The graph is loaded exactly as §3.6 specifies: `adjOffset/adjEdge/adjOther: Int32Array`,
`edgeLenM: Float64Array` (the Java-authoritative bit-exact lengths, never recomputed),
`nodeId: Float64Array` including the 22 synthetic negatives, adjacency held in certified
per-node feature order because Dijkstra tie-breaking depends on it (R12).

### Correctness gates run before any timing is believed

- **CSR census gate:** an independent connected-components pass over the loaded CSR
  reproduces **171 / 171 components and largest 59,725 / 59,725**, plus node, edge and
  directed-record counts, against `graph-dump/census.json`. A loader that scrambled the
  adjacency could not reproduce these; the harness `throw`s if it fails.
- **Decimal-vs-hex audit:** every node coordinate and every edge length is parsed from
  the decimal column and checked bit-for-bit against its `Double.toHexString` twin —
  **0 mismatches** over 176,200 coordinates + 109,434 lengths.
- **Dijkstra vs brute force:** 200 random graphs, every distance compared by raw IEEE-754
  bits against an O(V²) reference; plus blocked-edge, unreachable, and exact-tie
  predecessor cases. Full suite: **467/467 green** (was 460 before this spike), typecheck
  clean, claim linter clean (0 hits / 92 files).

---

## 3. Load

```
nodes 88,100   edges 109,434   directed records 218,868   polyline vertices 659,576
parse ms: nodes ~100-120  edges ~120-132  adjacency ~90-98  polylines ~185-218  segment geometry ~530-612   TOTAL 1.02-1.18 s
CSR + geometry retained: 31.27 MB   (from 44.24 MB of TSV)
```

Segment geometry (per-edge cumulative lengths + both azimuths, 550,142 `Inverse` calls)
is 530–612 ms of the ~1.0–1.2 s. In the app this is a one-time cost inside the worker that
already owns the 49 ms brotli decode measured in DR-S2 — comfortably inside the 1 s
parse AC.

### FINDING S3-F2 — the JS segment sum is *not* bit-equal to the Java edge length

Summing our `geographiclib-js` `Inverse` segment lengths across each polyline reproduces
the Java-authoritative edge length **bit-exactly for only 5,848 of 109,434 edges**;
81,560 agree within 1e-9 m, and the **worst disagreement is 2.598e-8 m** (26 nanometres).

This is a non-issue for physics and a real issue for any bit-identity claim:

- Routing is unaffected — the harness (and the port) use `edgeLenM` straight from the
  Java dump for Dijkstra weights and never recompute them.
- The cumulative array is used only for *within-edge* interpolation, where 26 nm is
  ~9 orders of magnitude below the plan's "walked ≤ planned + snap + 200 m" bound.
- But WP5 must not assert that the cumulative array is bit-identical to Java-derived
  distances. Recommend: build `segCumM` by prefix-summing as here, then **snap the final
  entry of each edge to `edgeLenM[e]`**, so path totals stay exactly Java-consistent and
  the residual lands inside the last segment.

---

## 4. SSSP — 46 distinct sources, full-graph trees

Sources are the real 46 shelters of `shelters_2026_expanded_plus_new_sites.csv`, snapped
with the certified **planar degree-space** metric (PORT_MAP §1.6 `nearestNode`), not
geodesic.

```
per-tree ms:  min 2.20   p50 2.44   mean 2.68   p95 5.3    max 7.6     (spread over 5 runs)
46-tree TOTAL, single-threaded, legacy (no closures):      122.8 - 146.1 ms
46-tree TOTAL, post-wave (443 blocked features):           122.7 - 174.4 ms
settled nodes/tree: min 27,543   mean 29,642   max 59,725
stale heap pops/tree (lazy deletion): mean 3,761
retained 46 trees (dist Float64 + predEdge Int32):  46.38 MB   (plan estimated ~49 MB)
```

Across five runs the 46-tree total ranged **122.8 – 174.4 ms**. Even the slowest is
**~29× inside the 5 s budget** and clears the 0.5–1.5 s stretch target single-threaded.

### Worker pool: measured, and it does not pay

46 trees split over a real `worker_threads` pool with the CSR passed as
SharedArrayBuffers (zero copy) and results written straight into shared output slabs:

| Workers | Busiest worker | Wall incl. spawn | Spawn + transfer |
|---|---|---|---|
| 1 | 126.1 ms | 244.0 ms | 117.9 ms |
| 2 | 67.8 ms | 194.3 ms | 126.5 ms |
| 4 | **41.6 ms** | 182.1 ms | 140.5 ms |
| 8 | 32.7 ms | 209.3 ms | 176.6 ms |

**Projected pool-of-4 wall (perfect split of the single-threaded total): 29.3–35.6 ms.**
Measured busiest-worker time at 4 workers is 41.6–66.6 ms across runs — the gap is uneven
tree sizes plus each worker paying its own JIT warm-up.

Spawn dominates every configuration. In the app the pool is created once at load and
reused, so the honest steady-state wave figure is the **busiest-worker time, ~42–67 ms
at 4 workers**, versus ~123–146 ms single-threaded. Both are far inside budget, so **the pool
is an optional latency nicety, not a requirement** — and if it is built, it must be a
persistent pool, never spawned per wave.

### FINDING S3-F1 — 46 shelters, 44 distinct street nodes

Two of the 46 shelter rows snap to the *same* street node. The engine computes one tree
per `Shelter` object, so it does 46 SSSPs where 44 would do; a source-keyed cache is a
free ~4% saving. The benchmark deliberately used 46 **distinct** sources (the collided
pair nudged to its next-nearest node) so the reported figure is the harder workload.

### FINDING S3-F3 — the shelter-bearing component is *not* the largest component

The corrected graph's two dominant components are:

| Nodes | bbox lon | bbox lat | Reading |
|---|---|---|---|
| 59,725 | −123.4625 … −121.6496 | 44.8855 … 45.8121 | the wide tri-county/regional network |
| 27,543 | −122.8365 … −122.4726 | 45.4325 … 45.6499 | the City of Portland core |

**43 of the 46 shelters sit in the 27,543-node Portland component; only 3 sit in the
59,725-node "largest" component.** This is certified behaviour — the harness reproduces
the census exactly — and it explains why archived runs carry UNREACHABLE agents at all.
Two consequences for perf:

1. SSSP cost is component-bounded, so most trees settle 27,543 nodes, not 88,100.
2. If a future graph fix or an OSM swap merged the components, per-tree cost rises. That
   was measured, not guessed: **46 sources inside the 59,725-node component cost
   5.56–7.92 ms/tree, 256–364 ms for all 46** — still 14× inside the 5 s budget.

---

## 5. Agent tick loop

7,000 agents on **real routed paths**: random reachable start nodes, predecessor chains
out of a real Dijkstra tree, real street polylines with real cumulative geodesic lengths.

```
7,000 paths built in 40-60 ms: 1,779,948 vertices (54.35 MB), mean 254.3 vertices / 11.64 km, max 742
agents SoA (22 typed-array fields): 1.02 MB at n=7,000
```

Per-tick per-agent work follows the certified `step()` order (PORT_MAP §1.5): speed +
group pace `max(0.40, v−δ)`; the full 8-accumulator exposure block including
`dose = c · IR · dt`, strict `c > 55.5` hours-above and peak; an hourly-per-agent risk-cue
decay plus **one hazard logistic with `Math.exp`** (staggered so ~n/60 agents evaluate
per tick); then movement.

### The measurement that decides everything

| Movement variant | agent-ticks/s | Relative |
|---|---|---|
| **LITERAL Java** (`Inverse` per vertex consumed + `Inverse`+`Direct` for the partial) | 0.323 M | 1.0× |
| §3.6 graft: cumulative array + **one `Direct`/agent-tick** | **1.249 M** | 3.9× |
| …with `Direct` outmask reduced to lat/lon only | 1.332 M | 4.1× |
| `Direct` materialised every 30 ticks | 15.267 M | 47.3× |
| `Direct` materialised every 60 ticks | 19.713 M | 61.0× |
| no geodesic at all (array-only floor) | 26.683 M | 82.6× |

**Geodesic `Direct` is 95.3% of tick-loop wall.** Everything else in a tick — eight
float accumulators, the branchy exposure block, the movement arithmetic, the hourly
`Math.exp` — costs 4.7%.

Two consequences:

- **The §3.6 cumulative-length graft is load-bearing, and now quantified: 3.9×.** The
  literal Java loop does 2.60 `Inverse` + 0.99 `Direct` per agent-tick (a 1.3 m/s agent
  covers 78 m/tick against a 45.8 m mean segment, so it crosses ~1.7 vertices and lands
  mid-segment). Ported literally, the default preset would take **~118–134 s** — it would
  MISS the 60 s budget outright, on a desktop, before any derate. The plan was right to
  graft; this is the number that proves it.
- **The remaining single `Direct` is the whole cost.** Removing it is the tuning lever.

### The budgeted workloads, run end to end (not extrapolated)

| Workload | agent-ticks | Untuned | Tuned (`Direct`/60) | Speed-up |
|---|---|---|---|---|
| default 2,037 × 312 h | 38,132,640 | **28.50–34.86 s** | **1.85–2.14 s** | 15.4–16.3× |
| worst case 6,842 × 455 h | 186,786,600 | **150.45–179.20 s** | **9.77–12.05 s** | 14.9–15.4× |

Ranges are the observed spread over five runs on the same host.

### The tuning lever, and exactly what it costs

**Lever: materialise the interpolated display coordinate at render cadence, not every
tick.** Under the §3.6 graft the agent's position along its path is the scalar
`travelledM`; the lat/lon is a pure function of it,
`Direct(vertex[j], azi[j], travelledM − cum[j])`. Nothing in the tick reads that lat/lon.

This was **verified against the certified source, not assumed.** In
`Geography/src/geography/agents/GisAgent.java` the agent's stored geometry is read in
exactly two places inside `step()`:

- line 523, `Point myPoint = geography.getGeometry(this)` — the movement block's own
  carried position, which the graft replaces with `travelledM`;
- line 518, `Point here = geography.getGeometry(this)` in the planning branch, feeding
  `snapGapM += geodesicDistanceM(here, routePath.get(0))`.

**Requirement (do not skip):** line 518 fires whenever `routePath == null`, which
includes the *reroute* path after a closure wave, where the agent is standing
mid-segment. So the port must materialise the coordinate **on demand at plan/reroute
time** as well as at render time. Those are rare events; the tick loop itself never needs
it. `geography.move()` (line 543) is display-only and has no port cost.

**Honest caveat on fidelity.** This lever is a strictly *smaller* semantic change than
the graft the plan has already adopted, but it is not free of one:

- Java carries `current` forward and measures `dM` from that interpolated point.
  Mathematically the residual arc is exact (the interpolated point lies on the same
  geodesic), so the graft is mathematically equivalent — but **not bit-equivalent**, on
  the order of the 1e-9 m per-segment residuals of S3-F2.
- §3.6 describes the graft as "semantics unchanged". That is true to ~1e-9 m per tick,
  **not to the bit.** WP7's per-agent gates must therefore treat `distanceTraveledM` and
  agent coordinates as tolerance comparisons, not bit-identity comparisons. This is the
  single most important thing in this document for downstream work packages.

Secondary levers, measured and *not* recommended as primary:

- Reducing the `Direct` outmask to `LATITUDE|LONGITUDE`: 1.3–8.8% in-loop across runs,
  versus 17% in an isolated microbenchmark — result-object allocation, not the geodesic
  series, dominates.
- A cached `GeodesicLine` per segment is **4.1× cheaper per call** (168 ns vs 693 ns
  microbenchmarked) but costs 934 ns to construct. Agents cross ~1.7 segments per tick,
  so a per-agent cache never amortises; a global per-graph-segment cache would, at a
  memory cost that was not measured. Only worth revisiting if the primary lever is
  blocked.

---

## 6. Derating, and why "MET" is stated carefully

Budgets in §3.6 are for "the reference laptop". This harness ran in Node on a desktop
i7-11700KF. A conservative **2×** derate is applied throughout for a mid-range laptop
running in a browser (scalar float + typed-array code, thermally limited cores, browser
JIT). The 2× figure is a stated assumption, not a measurement — this spike did **not**
run in a browser, and did **not** run on a laptop.

That assumption is what turns the untuned default preset from "48–58% of budget" into
"95–116%" — i.e. the untuned path has no derate margin at all, which is the whole reason
rung 1 is being adopted now rather than deferred. Two follow-ups belong to WP7:

1. Re-run `run-s3-perf.ts --stages tick` in Chrome/Firefox/WebKit on the actual reference
   laptop and replace the derate with a measurement.
2. Confirm the tuned variant is the shipped movement path before the vertical slice is
   perf-signed.

Even at a pessimistic **10×** derate, the tuned default preset (~21 s) and the tuned worst
case (~131 s) still clear their budgets.

---

## 7. What this spike did not measure

Recorded honestly so nothing downstream over-reads the numbers:

- **No browser, no laptop.** Node on a desktop only (§6).
- **No RNG, no shuffle, no admission, no closures-in-the-tick.** The per-tick agent
  shuffle (MT `nextIntFromTo` over n agents every tick) and `OutcomeLogger` are real
  costs not in this loop. The shuffle is O(n) per tick with an RNG draw each — at
  186.8 M agent-ticks that is ~1.9·10⁸ MT draws, which WP3/WP7 must measure separately.
- **The tick loop is pessimistic in one direction and optimistic in another.** Every
  agent is EN_ROUTE for every measured tick (real agents start UNAWARE and end SHELTERED,
  skipping movement and the exposure block respectively — pessimistic), agents that
  consume their path are recycled to the head (treadmill), and paths route to a single
  shelter rather than the nearest so they are longer than real routes (11.64 km mean).
  Against that, no shuffle/logging/admission work is included (optimistic).
- **Dijkstra pop-order identity with `java.util.PriorityQueue` at exact key ties is not
  claimed.** Distances are tie-independent and are bit-verified against a brute-force
  reference; path *geometry* at exact ties depends on heap pop order (R12) and is WP5's
  job against Java tree dumps.
- **`s3-results.json` is machine-specific.** It is committed as evidence for this DR, not
  as a CI gate. The committed *tests* are the CI gate.

---

## 8. Actions this spike hands downstream

| # | Action | Owner |
|---|---|---|
| A1 | Ship the movement path with the display coordinate materialised on demand (render + plan/reroute), never per tick. This is the difference between 32 s and 2 s. | WP5 / WP7 |
| A2 | Snap each edge's final `segCumM` entry to the Java-authoritative `edgeLenM[e]` (S3-F2). | WP5 |
| A3 | State in §3.6 that the cumulative-length graft is mathematically equivalent but **not bit-equivalent** (~1e-9 m/tick); make WP7's per-agent distance/coordinate gates tolerance-based. | plan §3.6 / WP7 |
| A4 | If an SSSP pool is built, make it persistent — per-wave spawn (135–220 ms) costs more than the wave (142 ms). | WP8 |
| A5 | Cache Dijkstra trees by source node: 46 shelters, 44 distinct nodes (S3-F1). | WP5 |
| A6 | Measure the per-tick MT shuffle and OutcomeLogger separately — not covered here. | WP7 |
| A7 | Re-run the tick stage in-browser on the reference laptop to replace the 2× derate assumption. | WP7 |
| A8 | Note S3-F3 (43/46 shelters in the 27,543-node component, not the 59,725-node largest) wherever unreachability is explained. | docs |

---

## 9. Compliance

Nothing outside `websim/` was created, modified or deleted — `git status --porcelain`
over `Geography/`, `docs/`, `scripts/`, `data/`, `batch/` and the repo-root files is
empty. `Geography/src/geography/agents/GisAgent.java` and
`Geography/src/geography/routing/StreetNetwork.java` were **read** to verify the tuning
lever against the certified source; neither was touched. No Java was compiled by this
spike. `npm run typecheck`, `npm test` (467/467) and `npm run lint:claims` (0 hits /
90 files) are green.
