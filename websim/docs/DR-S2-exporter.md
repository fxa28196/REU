# DR-S2 — Java graph exporter proof (plan WP2-S2, Q8, §4)

**Status:** CLOSED with measurements. Primary approach **worked**; the wire-size
acceptance criterion **failed for a monolithic asset**, so the pre-named fallback
(**split asset: topology now, display polylines lazy**) is **INVOKED**.

**Date:** 2026-07-30 · **Repo commit at spike time:** `de7c045` (websim/ untracked)
**Environment:** Windows 11, JDK 17.0.19+10, Repast Simphony 2.11.0, Node v24.18.0

---

## 1. What was proved

The certified Java instrument can export the corrected pedestrian street graph
headlessly, **without a Repast runtime**, and the exported census is
**field-for-field identical** to what the archived production runs recorded —
including all 25 correction records in order.

```
S2 CENSUS VERIFICATION: PASS   (21 scalar fields + 25/25 corrections)
```

No Repast bootstrap was needed. `StreetNetwork` is a plain class, and the only
part of `ContextCreator` the graph build needs (`loadFeaturesFromShapefile`) is
pure GeoTools. `ContextCreator.build()` itself is not invokable (it needs a live
`Context`, `Geography` projection, `RandomHelper`, `ScienceRegistry`, shelters and
agents) — but nothing in the graph path depends on any of that.

---

## 2. The certified path (what is invoked vs. what is glue)

`websim/pipeline/java-exporter/GraphExport.java` computes **no geometry, no
lengths, no node ids, and no corrections of its own**. Everything comes from the
production classes:

| Certified thing | How it is reached | Why it matters |
|---|---|---|
| `ContextCreator#loadFeaturesFromShapefile(String)` | private method, reflection | exact shapefile read **and** the Web-Mercator→WGS84 reprojection (`Streets.prj` is `WGS_1984_Web_Mercator_Auxiliary_Sphere`, so reprojection **does** fire) |
| `ContextCreator#NON_PEDESTRIAN_TYPES` | private static field, reflection | the U-27 TYPE set is *read*, never retyped — the exporter cannot drift from `{1110,1120,1121,1122,1123}` (printed at run: `[1110, 1120, 1121, 1122, 1123]`) |
| `ContextCreator#attr(SimpleFeature,String)` | private static method, reflection | `FULL_NAME → STREETNAME → "unnamed street"`; the label is load-bearing (it lands in the correction census as `first_feature`) |
| `StreetNetwork#addStreet`, `#recordExcludedFeature`, `#polylineLengthM`, `#buildIndex`, `#getValidationReport`, `#resolveGraphId` | public API + one private method by reflection | all geodesic (GeographicLib) edge weights, the order-dependent corrupt-node correction, synthetic negative ids, adjacency in feature order |
| `StreetNetwork.nodeCoords / adjacency / rawStreets` | private fields, read-only reflection | the graph is *read out*, not rebuilt (no public enumeration API exists) |

**The only mirrored code** is `ContextCreator.build()`'s per-feature loop, which
cannot be called in isolation. Correspondence is statement-for-statement:

| `ContextCreator.java` | `GraphExport.java` | note |
|---|---|---|
| 453 `new StreetNetwork()` | same | |
| 454 `loadFeaturesFromShapefile("./" + STREETS_SHP)` | reflective call, same argument built from the same constant | |
| 455–461 MultiLineString guard, `getGeometryN(0)`, `getCoordinates()` | identical | |
| 462–470 U-27 filter + `recordExcludedFeature(type, polylineLengthM(coords))` + `continue` | identical (TYPE set read from the production constant) | |
| 471–473 name resolution | identical, via reflective `attr` | |
| 474–479 `addStreet(f, t, coords, name)` when both node ids numeric | identical | |
| 480–482 else `polylineLengthM(coords)` | identical (counted; **0 occurrences** in this dataset) | |
| 483–485 `new PortlandStreet(...)`, `context.add`, `geography.move` | **omitted** | display layer only; touches no graph state |
| 487 `buildIndex()` | same | |

**Self-check that the mirror is faithful.** The exporter rebuilds the adjacency
independently (feature order + certified `resolveGraphId`) and diffs it against
the certified `adjacency` map — per node, per position, comparing `fromNode`,
`toNode`, `lengthM` **by raw IEEE-754 bits**, polyline length and head vertex:

```
[S2] adjacency reconstruction mismatches: 0 (expected 0)
```

---

## 3. Census: expected vs. actual — **one expectation was wrong, and it is explained**

| Metric | Plan AC (WP2-S2) | Exported (this spike) | Archived production run | Verdict |
|---|---|---|---|---|
| Nodes (`final_graph_nodes`) | 88,100 | **88,100** | 88,100 | ✅ |
| Undirected street edges | 109,434 | **109,434** | 109,434 | ✅ |
| Directed edge records | 218,868 | **218,868** | — | ✅ |
| Components | 171 | **171** | 171 | ✅ |
| Largest component | 59,725 | **59,725** | 59,725 | ✅ |
| Sites **reattached** | 4 | **3** | **3** | ❌ plan wrong |
| Sites **split synthetic** | 23 | **22** | **22** | ❌ plan wrong |
| Affected attribute ids | (not stated) | 25 | 25 | ✅ |
| Attribute node ids | — | 88,078 | 88,078 | ✅ |
| Impossible edges after fix | — | 0 | 0 | ✅ |
| Max endpoint gap | 11.9 m | 11.944725226913… m | 11.9 | ✅ |
| Freeway features excluded | — | 2,636 (614.1 km; 1110×1372, 1120×279, 1121×466, 1122×447, 1123×72) | identical | ✅ |
| Synthetic id range | −1000… | −1000 … −1021 (22 ids) | — | ✅ |

### Finding S2-F1 — "4 reattached / 23 split" is the **pre-U-27** graph

Not a defect in the exporter and not a defect in the model: the plan
(`IMPLEMENTATION_PLAN.md` L311/L585) and `PORT_MAP.md` (L614) inherited the
correction counts from `docs/validation/STREET_NETWORK_VALIDATION.md`, which was
written **before** the U-27 freeway filter landed (commit `3ee2085`). Removing
2,636 freeway features removes two corrupt-id claim sites with them.

Proved by re-running the same exporter with the filter bypassed
(`run-export.ps1 -NoU27`, a clearly-labelled diagnostic path):

| | pre-U-27 (`--no-u27`) | post-U-27 (production) |
|---|---|---|
| features | **112,070** | 109,434 |
| attr node ids | **89,322** | 88,078 |
| final graph nodes | **89,345** | 88,100 |
| affected attr ids | **27** | 25 |
| reattached | **4** | 3 |
| split synthetic | **23** | 22 |
| components / largest | **154 / 60,444** | 171 / 59,725 |

Every one of those pre-U-27 numbers matches
`docs/validation/STREET_NETWORK_VALIDATION.md` §3 verbatim ("27 corrupt attribute
IDs → 4 sites reattached, 23 split … 89,322 → 89,345 … 154 / 60,444"). The
hypothesis is confirmed; nothing was forced.

**Actions taken:** corrected the two websim docs (`IMPLEMENTATION_PLAN.md`,
`PORT_MAP.md`) with a pointer to this DR.
**Action for the user (read-only for this spike):** the same stale pair also sits
in `docs/final/TECHNICAL_REFERENCE.md` (§ "Sites reattached ≤10 m | 4", "split | 23")
and `docs/chapter/capacity-is-not-access-source.md` ("covering 4 cases … remaining
23"). Those describe the *published* graph and are now inconsistent with every
archived `simulation.json` (which says 3/22). Worth a one-line fix before
camera-ready; the *scientific* claim (nothing deleted, connectivity unchanged) is
unaffected.

---

## 4. The dump

`websim/pipeline/out/graph-dump/` (git-ignored; regenerate with `run-export.ps1`):

| file | size | contents |
|---|---|---|
| `nodes.tsv` | 7.31 MB | 88,100 rows `id, lon, lat, lon_hex, lat_hex` — **includes the 22 synthetic negative ids**; sorted by id |
| `edges.tsv` | 7.96 MB | 109,434 rows in **feature order**: `idx, from_node, to_node, length_m_hex, length_m, n_coords, label` — lengths as **IEEE-754 hex Float64** |
| `adjacency.tsv` | 4.19 MB | per node, entries **in certified list order** (= feature order): `feature_idx:dir:neighbour` |
| `polylines.tsv` | 24.79 MB | 109,434 polylines, 659,576 vertices, oriented `from_node → to_node` |
| `corrections.tsv` | 2.3 KB | the 25-record correction census in production order |
| `census.json` | 6.3 KB | full `ValidationReport` + input SHA-256s + timings + precision census |
| **total** | **44.25 MB** raw / **16.93 MB** gzip −9 | |

Decimal columns use Java `Double.toString` (round-trip exact). Verified: the
JS-parsed decimals equal the exported hex for **all 176,200 node coordinates and
all 109,434 edge lengths** (`decimal<->hex mismatches: 0, 0`), so the TSV dump is
a lossless float64 carrier for a JS/TS packer.

Run cost: shapefile load 3.6 s, `buildIndex()` (correction + validation) **0.59 s**,
whole export incl. all dumps 9.5 s (run with `-Xmx6g`; heap headroom not measured —
production uses `-Xmx4g` for the same layer plus the whole model).

---

## 5. Wire size vs. the ≤ 3 MB brotli budget

Measured (`measure-graph-wire.mjs`, brotli q11 lgwin 24, gzip −9), not estimated.
"shuffled" = byte-plane transpose of the float64 arrays before compression.

| section | raw | gzip −9 | **brotli q11** |
|---|---|---|---|
| node ids, varint delta (id-sorted) | 0.084 | 0.014 | **0.012** |
| node lon+lat, float64 shuffled | 1.344 | 0.947 | **0.938** |
| node lon+lat, float64 shuffled, Morton order | 1.344 | 0.864 | 0.841 (but ids then cost 0.182 → net worse) |
| edge from/to (int32 node index) | 0.835 | 0.510 | **0.374** |
| edge lengths, float64 shuffled | 0.835 | 0.707 | **0.705** |
| CSR offsets + entries (int32) | 1.171 | 0.819 | **0.566** |
| polyline offsets (int32) | 0.417 | 0.280 | **0.142** |
| polyline vertices, float64 shuffled (lossless) | 10.064 | 6.276 | 6.082 |
| polyline **interior-only**, float64 shuffled (lossless) | 6.725 | 4.167 | **4.051** |
| polyline **interior-only**, int32 @1e-7 delta-varint (LOSSY) | 1.959 | 1.791 | **1.563** |
| street name table (utf8) | 1.442 | 0.317 | **0.245** |

| bundle | raw | gzip −9 | **brotli q11** | verdict |
|---|---|---|---|---|
| **Topology only** (node ids + coords + edge endpoints + exact lengths + CSR) | 4.269 | 3.001 | **2.571 MB** | ✅ **under 3 MB** |
| Everything, lossless float64 geometry | 14.751 | 9.557 | **8.794 MB** | ❌ 2.9× over |
| Topology exact + display-quantised geometry | 7.786 | 6.031 | **5.111 MB** | ❌ 1.7× over |

**Decision — fallback invoked.** A single monolithic `graph.bin` cannot meet
≤ 3 MB brotli; the plan's "~2–2.5 MB br" estimate (L310) was optimistic because it
assumed delta-coded int32 polylines *and* did not carry exact float64 node
coordinates. The named fallback is exactly right and is adopted:

- **Asset 1 — `graph-topology.bin`, 2.571 MB br.** Everything routing needs, all
  bit-exact: node ids (incl. −1000…−1021), node lon/lat float64, edge endpoints,
  **Java-computed float64 edge lengths**, CSR adjacency in certified feature order.
  Loads on the critical path; Dijkstra can run without any polyline.
- **Asset 2 — `graph-geometry.bin`, ≈ 4.19 MB br lossless** (interior vertices
  4.051 + offsets 0.142), fetched lazily for movement geometry and drawing.
  A quantised variant is **1.71 MB br** but is **lossy** (see risk below).
- **Asset 3 — `graph-names.bin`, 0.245 MB br**, lazy, display only.

Two packing wins found and worth carrying into WP4 `pack-graph.ts`:

1. **218,860 of 218,868 polyline endpoints are bit-identical to their resolved
   node coordinate** (8 exceptions — the reattached/split sites). Storing only
   interior vertices + an 8-entry exception list cuts the lossless geometry
   section by **33 %** (6.082 → 4.051 MB br) at zero fidelity cost.
2. Byte-plane shuffling helps float64 arrays (node coords 0.995 → 0.938; edge
   lengths 0.769 → 0.705). Morton-ordering nodes helps coordinates but costs more
   in the id table than it saves — **keep id order**.

**Worker parse:** brotli-decompressing the 5.111 MB bundle takes **49 ms** in Node
v24; the sections are designed to be zero-copy `TypedArray` views over the decoded
`ArrayBuffer`, so parse ≈ decode. Comfortably inside the 1 s AC. In production the
asset should be served with `Content-Encoding: br` so the browser decodes it (the
`DecompressionStream` API has no brotli mode) — **hosting caveat:** if the chosen
static host cannot serve brotli, gzip applies and the topology asset is
**3.001 MB**, i.e. it lands *just over* budget. Flag for WP1's hosting decision.

---

## 6. Risks / decisions handed to WP4

| id | item |
|---|---|
| S2-R1 | **Quantised geometry is not free.** int32 @1e-7 costs ≤ 5.6 mm lat / 3.9 mm lon. Physics is untouched (smoke is county-uniform; edge weights are baked), but agent lon/lat in `agents.csv` would stop being bit-identical to Java. Ship lossless geometry unless the byte-identity checklist explicitly excludes agent coordinates. |
| S2-R2 | Coordinates are **full-entropy doubles** — the reprojection from Web Mercator means *zero* of 1,495,352 exported coordinate values round-trip through a 6- or 7-decimal string. Any "just store 7 decimals" shortcut is silently lossy. |
| S2-R3 | Node ids are not dense: min −1021, max 17,023,620. Edge endpoints must be stored as **node indices**, with a separate id table for output columns. |
| S2-R4 | Max node degree is 7 — CSR entry counts fit comfortably in int32; no wide-row pathology. |
| S2-R5 | The exporter compiles the **live** `Geography/src`, not `Geography/bin` (which was stale relative to the sources at spike time). WP4 must keep doing that and record the source SHAs in the manifest. |
| S2-R6 | `census.json` already carries SHA-256 of `Streets.shp/.dbf/.shx/.prj` — wire these into the asset manifest so a data swap invalidates the graph asset. |

---

## 7. Reproduce

```powershell
# full export (compiles Geography/src into websim, never into Geography/bin)
powershell -File websim\pipeline\java-exporter\run-export.ps1
# pre-U-27 diagnostic (finding S2-F1)
powershell -File websim\pipeline\java-exporter\run-export.ps1 -NoU27 -SkipCompile
# census must equal the archived production manifest
node websim\pipeline\scripts\verify-graph-census.mjs
# wire-size + parse-time measurements
node websim\pipeline\scripts\measure-graph-wire.mjs
```

Layout note: S1/S5's fixture dumper lives under `pipeline/java-exporter/src/` with
its own `build-and-dump.ps1` → `build/`. S2 deliberately keeps `GraphExport.java`
at the `java-exporter/` root with `run-export.ps1` → `out/` + `geo-classes/`, so
the two build scripts cannot fight over one output tree. **WP4 should merge them**
into a single exporter module with one classpath builder.

Artefacts: `websim/pipeline/java-exporter/GraphExport.java`,
`run-export.ps1`, `websim/pipeline/scripts/{verify-graph-census,measure-graph-wire}.mjs`,
`websim/pipeline/out/graph-dump/`, `websim/pipeline/out/wire/wire-measurements.json`.

## 8. Honest limitations

- The per-feature loop is mirrored, not invoked (§2). Mitigated by reading the
  U-27 set and the name resolver from the production class, by the 0-mismatch
  adjacency self-check, and by the exact census/corrections match against the
  archive — but a future edit to `ContextCreator.build()`'s loop would not
  automatically propagate. WP4 should add a CI check that re-diffs the census
  against an archived `simulation.json` (the script already exists).
- Only the graph was exported. Sampler/world dumps for Tier-1 fixtures (WP4) and
  the RNG fixtures (WP3/S5) are out of this spike's scope.
- Wire numbers are brotli q11 from Node's zlib. A different brotli build could
  move them by a few percent; the 2.571 vs 8.794 MB gap is far outside that noise.
