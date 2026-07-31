# DR-WP5 — Graph runtime + CsvLoader port

**Status: CLOSED with measurements. Every WP5 acceptance criterion was run and
passed. Two defects were found and fixed — one in this work package's own
starting assumption, one inherited from WP4's shipped asset.**

| Artefact | Path |
|---|---|
| Routing layer | `websim/engine/src/graph/` (`csr`, `dijkstra`, `paths`, `cumLen`, `strtreeSnap`, `blocked`) |
| Geodesic handle | `websim/engine/src/geo/geodesic.ts` |
| CsvLoader port | `websim/engine/src/loader/csv.ts` (`pipeline/src/csv-loader.ts` re-exports it) |
| Adversarial CSV oracle | `websim/pipeline/java-exporter/src-csv/`, `dump-csv-fixtures.ps1` |
| Committed CSV fixture | `websim/engine/test/fixtures/csv/adversarial.tsv` |
| Parity tests | `engine/test/graph/{trees,snap}.parity.test.ts`, `engine/test/loader/csv.{adversarial,shipped}.test.ts` |
| Regression lock on the WP4 fix | `pipeline/test/encampments-snap.parity.test.ts` |

---

## 1. Acceptance, as run

| Criterion | Result |
|---|---|
| Every shelter-tree distance array bit-equal to the F1 Java dumps, arms A/B/C | **118/118 trees; 3,539,712 / 3,539,712 distances bit-equal** (IEEE-754 bits, not tolerance) |
| …predecessor edges | **3,539,712 / 3,539,712 equal** as certified directed edge ids (`featureIndex*2 + dir`) |
| …reachable sets | **118/118**; zero nodes finite in our tree and absent from Java's, and `reachableCount` equals `distM.size()` for every tree |
| Committed stride-sampled oracle | **7,552 / 7,552 rows** bit-equal |
| `pathToSource` / `nodesToSource` / `coordOffset` probes | **768 node chains + 768 coordinate paths (182,250 vertices)** bit-equal |
| Snap equals Java for all camp points (local raw path) | **3,400 / 3,400** node ids; **3,400 / 3,400** resolved node coordinates bit-equal |
| Snap equals Java for all shelters | **508 / 508** across all 13 configured shelter CSVs |
| CsvLoader adversarial byte fixtures byte-equal | **68 / 68 parse invocations** (34 inputs × `read`/`readStrict`): 60 row sets and 10 throws, keys/values/messages compared as UTF-8 bytes |
| Every shipped CSV parses identically to a Java-exported parse | 13 shelter CSVs (508 rows: id, name, capacity, lon/lat **as bits**), the 3,400-row BOM+CRLF+QUOTE_ALL encampment sample, 2 closure schedules |
| `npm run ci` | **green — 852 tests / 48 files, typecheck clean, claim linter 0 hits / 189 files** |

Every tree comparison first verifies the fixture file's SHA-256 against the
committed `engine/test/fixtures/world/manifest.json`, so a stale or half-written
dump fails loudly rather than quietly weakening the comparison.

---

## 2. Where the comparison is tolerance-based, and why

Two quantities cannot be bit-compared, and both are named rather than buried.

### 2.1 `snap_gap_m` — tolerance 1e-8 m, budget from DR-S1

The snap *gap* is a geodesic `Inverse`. DR-S1 established that the certified
model runs **GeographicLib-Java 1.49** (the only jar in Repast Simphony 2.11.0
providing `net/sf/geographiclib/Geodesic.class`) while the port runs
**geographiclib-js 2.x**, with a measured `Direct` agreement ceiling of
3.159e-9 m and an adopted budget of **1e-8 m**. Measured here on the real data:

```
encampments (3,400 points):  max |snap_gap_m − Java| = 3.181e-9 m
shelters    (508 points):    max |snap_gap_m − Java| = 1.416e-9 m
```

Both are inside the DR-S1 budget with ~3× margin. **The node CHOICE is not
tolerance-based** — it is exact, 3,908/3,908 — and the choice is what routing
depends on; the gap is a reported diagnostic that feeds `snapGapM`.

**How much of it is actually not bit-equal** (added 2026-07-31, so "tolerance" is a
measured statement rather than a hedge):

```
encampments:  3,160 / 3,400   rows differ in bits  (92.9%)
shelters:       470 /   508   rows differ in bits  (92.5%)
Tier-1 world dumps:
            247,884 / 266,838 resident rows differ in bits  (92.9%)
            of which  6,390 / 6,842 at A-seed42  (452 bit-equal)
```

So this is not a near-miss that happens to fall outside bit equality on a handful of
rows — **the overwhelming majority of rows differ**, all of them in the last few ulp.
That is what two GeographicLib implementations look like, and it is why the claim has
to be written as a tolerance everywhere it appears. `tier1.parity.test.ts` now
asserts the census in both directions: the max delta stays inside 1e-8 m, *and* the
bit-difference count stays above a floor, so the tolerance cannot silently become a
bit comparison without a test failing first. Registered as README §6 divergence 9.

### 2.2 `segCumM` — not bit-identical to anything Java produced, by construction

DR-S3 finding S3-F2, re-measured here independently on the production graph
rather than quoted:

```
659,576 vertices over 109,434 edges
raw prefix sums bit-equal to the Java edge length:   5,848
                        within 1e-9 m:              81,560
                        worst residual:              2.598e-8 m
```

DR-S3 action **A2 is implemented**: each edge's final cumulative entry is
overwritten with `edgeLengthM[e]`, so **109,434 / 109,434** edge totals are
bit-equal to the Java-authoritative weight and the sub-nanometre residual lands
inside the last segment. Path totals therefore close exactly against routed
distances.

DR-S3 action **A3 stands and is restated here**: `segCumM` is mathematically
equivalent but **not bit-equivalent** to Java's carry-forward movement loop.
WP7's per-agent `distanceTraveledM` and coordinate gates must be tolerance
comparisons. Nothing in this work package claims otherwise, and
`SegmentGeometryStats` carries the residual so the tolerance stays a measured
number.

---

## 3. FINDING WP5-F1 — `TextDecoder` silently deletes a leading BOM (fixed)

`decodeCsvBytes` originally used `new TextDecoder("utf-8")`. **That is not a
UTF-8 decode of the bytes**: by default `TextDecoder` *removes* a leading U+FEFF
instead of decoding it, which Java's `InputStreamReader(…, UTF_8)` does not do.

Caught by the adversarial fixture `bom-only-line` (`a,b\n<BOM>\n1,2\n`), where
the certified loader emits **a row whose first value is the BOM** — U+FEFF is
above U+0020, so Java's `String.trim()` keeps it and the line is not blank.

The failure is a compound one, and both halves are the kind that never announce
themselves:

- default `TextDecoder` deletes the character, and
- JS `String.prototype.trim()` (which this port deliberately does not use)
  *also* strips U+FEFF,

so a natural TypeScript implementation would have skipped the line entirely and
returned **one fewer row than Java** with no error anywhere.

Fixed by `new TextDecoder("utf-8", { ignoreBOM: true })` — a flag whose name is
the opposite of its effect: it means "ignore its BOM-ness, keep it as a
character". The header BOM is then stripped by `read`/`readStrict` themselves,
which is where Java strips it, and only from the header line.

For real project files the outcome is unchanged either way (the encampment
sample's BOM is on the header), so this would have shipped green. It is recorded
because the next person to write a byte-level decode in this codebase will hit
the same default.

## 4. FINDING WP5-F2 — the STRtree tie-break, and one wrong snap in the WP4 asset (fixed)

WP4 flagged this for WP5 to reconcile: the certified graph has **192 groups of
nodes at bit-identical coordinates** (all pairs; 384 nodes), and for a query
nearest to such a group JTS's `STRtree.nearestNeighbour` decides by traversal
order, not geometry. For at least two groups the two nodes are in **different
components** (74194/16952934 → components 1/86; 73653/17014746 → 50/86), so the
tie decides whether a resident can reach a shelter at all. `build-encampments.ts`
had documented "lowest node id wins" as an explicit *choice*, not a derivation.

**Measured against the certified snapper: that rule is wrong.** Over the 3,400
encampment reports there are exactly **7** tied queries, and the lowest-id rule
disagrees with Java on **1** of them — camp index 523, where Java chose the
*larger* id 16952934 over 74194, across the component boundary.

The mechanism was reconstructed rather than guessed:

1. `buildIndex()` inserts nodes in `HashMap<Long, Coordinate>.entrySet()` order.
2. `HashMap` iterates buckets ascending, so an entry's position is ordered by
   `spread(Long.hashCode(id)) & (table − 1)`, with
   `Long.hashCode(v) = (int)(v ^ (v >>> 32))` and `spread(h) = h ^ (h >>> 16)`.
3. The table is the smallest power of two ≥ 16 with `count <= 0.75 × table` —
   **131,072** for 88,100 nodes.
4. JTS's STR packing sorts with the stable `Collections.sort`; coincident
   coordinates compare equal on both the x and y passes, so a pair keeps its
   input order, lands in one leaf, and is pushed into the branch-and-bound
   `PriorityQueue` at equal distance, where the earlier entry polls first.

So **lower bucket index wins**. Evidence: **7 of 7** observed ties reproduced,
including the one lowest-id gets wrong; **0** of the 192 groups has its two
members in the same bucket, so the rule never needs its fall-through (lowest node
id, implemented and reported via `SnapResult.tieKind` so a future graph degrades
loudly). This is a reconstruction validated on 3,908 oracle points, not a
first-principles proof of JTS internals — stated plainly so it is re-checked if
the graph or the JTS version changes.

`build-encampments.ts` now imports the rule from
`engine/src/graph/strtreeSnap.ts` rather than re-deriving it, so the public asset
and the runtime snapper cannot drift. `encampments-public.bin` and
`assets-manifest.json` were rebuilt; the census it publishes
(`order_ambiguous_snaps = 7`) is unchanged — only the resolution of one of those
seven changed, and it changed to Java's answer.

---

## 5. What was promoted, and what changed in promotion

DR-S3's spike code was promoted rather than rewritten, keeping its measured
behaviour:

| Spike | Production | Change |
|---|---|---|
| `graph-csr.ts` (TSV → CSR) | `graph/csr.ts` | reads the **packed WP4 asset** instead of the raw dump; keeps the `+`/`−` direction flag, which the spike discarded, and converts it to the certified directed edge id |
| `dijkstra.ts` | `graph/dijkstra.ts` | predecessor is the directed edge id, not the feature index; blocked set is a `BlockedEdges` so the `isEmpty()` short-circuit is a field read; sift loops annotated against `java.util.PriorityQueue` |
| segment geometry | `graph/cumLen.ts` | DR-S3 action A2 applied (final entry snapped) |
| `nearestNodeIndexDegreeSpace` (brute force) | `graph/strtreeSnap.ts` | STR-packed tree, full tie-set enumeration, hash-order tie-break |
| `geodesic.ts` | `geo/geodesic.ts` | unchanged in behaviour |

Two production behaviours the spike explicitly did **not** claim are now proved:

- **Blocking is by node pair, not by feature.** `blockEdge(a, b)` blocks every
  feature between that pair; a per-feature flag array would leave a parallel edge
  open. Covered by a dedicated test with two parallel features.
- **Pop-order identity at exact ties.** The spike said "not claimed here … WP5's
  job against Java tree dumps". It is now claimed, on 3.54 M predecessor
  comparisons, and additionally guarded without the dumps by a separate literal
  transcription of `java.util.PriorityQueue` in the unit suite.

DR-S3 action **A5** (cache trees by source node — 46 shelters, 44 distinct nodes)
is **not** implemented here: the tree cache belongs to the world build (WP6) and
the closure-wave recompute (WP8), which own the shelter objects. Left as an open
action rather than silently dropped.

---

## 6. Test tiering, and what a clean checkout runs

`pipeline/out/` is git-ignored (44 MB dump, packed asset, 108 MB of tree
fixtures), so the parity tiers are `describe.skipIf(...)` exactly as
`pipeline/test/graph-asset.test.ts` already is. In a clean checkout the
always-green cover is:

- the synthetic graph suite (CSR direction-flag inversion, Dijkstra vs brute
  force by bits over 200 random graphs, Dijkstra vs a literal `PriorityQueue`
  transcription over 150 tie-heavy graphs, blocked-pair semantics, path
  orientation and `coordOffset`, cumulative-length snap, snapper vs brute force
  over 2,000 queries), and
- **the full CsvLoader adversarial suite**, whose fixture *is* committed.

The tree/snap tiers need `pipeline/out/`; they are what was run for §1 above.

---

## 7. Compliance

Nothing outside `websim/` was created, modified or deleted.
`Geography/src/geography/{routing/StreetNetwork,data/CsvLoader}.java` were
**read**, and `CsvLoader.java` was **compiled read-only into
`websim/pipeline/java-exporter/out-csv/`** by `dump-csv-fixtures.ps1`; no output
was written into `Geography/`. `dump-csv-fixtures.ps1 -Verify` confirms the
fixture regenerates byte-identically across two runs
(`sha256 f638096d9b1a05b91892f9db9474ce1da9fb5dd2330fcf16a563edefe3ae7b4a`).
`npm run ci` is green.
