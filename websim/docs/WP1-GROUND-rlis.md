# WP1-GROUND-rlis — what RLIS data this project actually uses, and what the browser port would actually publish

**Status:** grounding document. Facts only, each traced to a file in this repo.
**Date:** 2026-07-31 · **Repo commit at investigation time:** `de7c045`
**Correction (re-checked 2026-07-31):** the header previously said "`websim/` untracked."
That is **wrong** — `git ls-files websim/` returns **305 tracked files**, including
`shared/src/graph-asset.ts`, `pipeline/scripts/build-encampments.ts` and
`pipeline/scripts/deploy-check.ts`. What remains untracked is only what `.gitignore` excludes:
`pipeline/local-raw/` and `pipeline/out/` (both re-verified as containing **zero** tracked
files). The disclosure conclusions are unchanged; the framing of "what a public repository
would expose" is not — it would expose the asset format spec and the builder, not just the
Java-side data.
**Purpose:** supply the verified factual base for WP1's written redistribution inquiry to
Oregon Metro (plan `IMPLEMENTATION_PLAN.md` L623–630, Q3 L595, risk W1 L779) and for the
mentor/IRB memo. This is **not** legal advice and contains no drafted correspondence.

**Method note.** Everything below is either (a) quoted from a repo file with a path and
line number, (b) read out of a built artifact's own header bytes, or (c) computed by me
directly from `Geography/data/Streets.dbf` / `Streets.shp` in this session. Where (c), I
say so and give the method. Section 6 lists everything I could **not** establish. Nothing
in this document was inferred from Metro's website, Metro's published terms, or any other
external source — no network access was used.

---

## 0. The short answer

1. **One RLIS layer is used: the street centerlines**, shipped as the five-file shapefile
   `Geography/data/Streets.{shp,dbf,shx,prj,cpg}` (50,679,721 bytes total). No other
   RLIS/Metro layer exists anywhere in the repo.
2. **No license, metadata, attribution or terms-of-use file was shipped with that data.**
   The shapefile has no `.xml` metadata sidecar and no accompanying README from the
   supplier. Everything the repo says about its terms is the project's own — and every
   one of those statements says the terms are **unverified**.
3. **The derived pedestrian graph census in the plan is correct as corrected by DR-S2:**
   88,100 nodes / 109,434 edges / 171 components / largest 59,725 / 25 affected attribute
   ids / **3 reattached, 22 split**. I re-verified the input side independently: the DBF
   holds exactly 112,070 records and exactly 2,636 of them carry the five excluded freeway
   TYPE codes.
4. **The crux, and it cuts against the comfortable framing.** The published bundle is
   *not* only a topology. `graph-topology.bin` + `graph-geometry.bin` together are a
   **bit-exact, lossless reconstruction of the full WGS84 centerline geometry of 109,434 of
   the 112,070 RLIS features (97.6%)** — 88,100 node coordinates, 440,708 interior polyline
   vertices, 8 endpoint exceptions, zero loss (`graph-assets.report.json`
   `polylineVertexMismatches: 0`). It also carries the **RLIS `PDX_F_NODE`/`PDX_T_NODE`
   node ids** and a **20,283-entry RLIS street-name table**. What it does *not* carry is
   36 of the 39 DBF attribute columns and the 2,636 excluded freeway features. The plan's
   own instruction — "`graph.bin` is treated as redistribution — no 'it's transformed'
   shortcut" (`IMPLEMENTATION_PLAN.md` L595) — is the right call, and the measurements in
   §4 below are why.
5. **RLIS-derived coordinates also leak into three other shipped assets**, which the plan's
   Q3 discussion does not mention: the public encampment asset, the shelter CSVs for arm C
   and the random-siting arms, and the 25-record correction census. See §4.4.
6. **The OSM fallback is named but not specified.** There is no acquisition script, no
   extract, no conversion code, and no attribution/share-alike analysis anywhere in the
   repo. Separately: **OSM is already in the lineage of the shipped 2026 shelter
   coordinates** (all 36 rows are Nominatim geocodes), which is an existing attribution
   question independent of any fallback. See §5.

---

## 1. Which RLIS datasets/layers are used

### 1.1 The one layer

| Field | Value | Source of the fact |
|---|---|---|
| Files | `Streets.shp` 17,035,988 B · `Streets.dbf` 33,734,352 B · `Streets.shx` 896,660 B · `Streets.prj` 425 B · `Streets.cpg` 5 B | directory listing; matches `Geography/data/README.md` L26 |
| Also at repo root | `Streets.zip` 16,219,928 B — the same five files, **untracked** (`.gitignore` L27–28: "Redundant archive: the extracted, tracked copy lives at `Geography/data/Streets.*`") | `git ls-files Streets.zip` returns nothing |
| Attributed to | "Portland Metro Regional Land Information System (RLIS) street centerlines" | `Geography/data/README.md` L27; `LICENSE` L70; `StreetNetwork.java` L23 |
| Basis of the attribution | **Schema inference, not a supplier record.** "schema confirmed by the `PDX_F_NODE`/`PDX_T_NODE`, `LCITY`/`RCITY`, `CFCC`, `LEFTADD1` attribute set" | `Geography/data/README.md` L27; `docs/science/DATA_SOURCES.md` L25 "inferred from schema; acquisition route unknown" |
| Geometry type | Shapefile type 3 = PolyLine | I read bytes 32–36 of `Streets.shp` |
| CRS as stored | `PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere", … UNIT["Meter",1.0]]` (EPSG:3857) | full text of `Geography/data/Streets.prj` |
| Encoding | `UTF-8` | full text of `Geography/data/Streets.cpg` |
| Records | **112,070**, zero deleted | I parsed the DBF header and scanned all records |
| Attribute columns | **39** (list in §1.2) | I parsed the DBF field descriptors |

**There is no second RLIS/Metro layer.** A repo-wide search for `*.shp` / `*.dbf` / `*.prj`
returns only the `Streets.*` set. The stock Repast Simphony demo shapefiles that
`Geography/data/README.md` §3 still describes as "retained" (`Agents2.*`, `CookCounty.*`,
`WaterLines.*`, `Zones2.*`) are **not present on disk** — consistent with `LICENSE` L47–49
("The inherited stock-demo data … were removed in the v1.0 cleanup"). That is an internal
doc inconsistency in the data README, not an RLIS issue, but it is worth a one-line fix.

Every other model input comes from a non-Metro source and is documented as such in
`Geography/data/README.md`: EPA AQS hourly PM2.5 (§2), Multnomah County JOHS + Street Roots
for the Sept-2020 shelters (§2b), City of Portland IRP campsite reports (§2c).

### 1.2 The 39 DBF columns, and which three the model reads

I dumped the field descriptors directly from `Streets.dbf`:

```
OBJECTID N(6)      LENGTH N(24,15)   LOCALID N(6)     ZERO N(1)        PREFIX C(2)
STREETNAME C(42)   FTYPE C(4)        DIRECTION N(1)   LEFTADD1 N(5)    LEFTADD2 N(5)
RGTADD1 N(5)       RGTADD2 N(5)      LEFTZIP C(5)     RIGHTZIP C(5)    TYPE N(4)
LCOUNTY C(4)       RCOUNTY C(4)      LCITY C(15)      RCITY C(15)      SUFFIX C(2)
FULL_NAME C(48)    SIDE N(1)         SOURCE C(1)      CFCC C(3)        SUBAREA C(1)
STRUC_TYPE N(2)    LEFT_JUR C(4)     RIGHT_JUR C(4)   PRI_NM_ID N(5)   LFT_NM_ID N(5)
RGT_NM_ID N(5)     BTM_SEG_ID C(1)   PDX_F_NODE N(8)  PDX_T_NODE N(8)  UPD_DATE D(8)
CREATE_DAT D(8)    F_ZLEV N(2)       T_ZLEV N(2)      Shape_Leng N(24,15)
```

The model reads exactly **four** of them (`ContextCreator.java` L462–475):

| Column | Read at | What it contributes |
|---|---|---|
| `TYPE` | L462–464 | the U-27 pedestrian filter: features whose TYPE is in `{1110, 1120, 1121, 1122, 1123}` are excluded from **both** the routing graph and the display layer (`ContextCreator.java` L75–76, L465–469) |
| `FULL_NAME` → `STREETNAME` → `"unnamed street"` | L471–473 | the street label; load-bearing because it lands in the correction census as `first_feature` (DR-S2 §2) |
| `PDX_F_NODE` | L474, L478 | graph node id at the from-end |
| `PDX_T_NODE` | L475, L479 | graph node id at the to-end |

`LENGTH` is **deliberately not trusted** — "its unit is undocumented in the file"
(`Geography/data/README.md` L44–45). Edge weights are recomputed geodesically instead
(§3.3). The other 35 columns — address ranges, ZIPs, jurisdictions, CFCC, dates, the
various name ids — are never read and, as §4.3 shows, are never published.

### 1.3 Coverage and vintage — what the file itself says

Facts I computed from the file, because the repo's provenance documents say the vintage is
unknown and it is not entirely unknown:

| Quantity | Value | How I got it |
|---|---|---|
| Bounding box (as stored, EPSG:3857) | X −13,746,370.686 … −13,541,973.568 · Y 5,603,508.481 … 5,750,288.404 | bytes 36–68 of `Streets.shp` |
| Bounding box (converted to WGS84) | lon −123.4857 … −121.6496 · lat 44.8855 … 45.8121 | spherical Mercator inverse of the above; approximate at metre scale, adequate for stating extent |
| Counties (`LCOUNTY`) | MULT 47,789 · WASH 33,754 · CLAC 30,417 · COLU 106 · YAMH 4 | full DBF scan |
| Cities (`LCITY`, top 5) | Portland 55,201 · Beaverton 7,486 · Hillsboro 6,022 · Oregon City 4,364 · Gresham 4,040 (blank 2,466) | full DBF scan |
| DBF header "date of last update" | **2026-03-12** (year byte 126 = 1900+126) | DBF header bytes 1–3 |
| `UPD_DATE` maximum | **2026-02-26** (n = 112,070 non-empty; 3,325 rows carry a 1899 sentinel) | full DBF scan |
| `CREATE_DAT` maximum | **2026-02-25** (28,610 rows are `00000000`, 27,842 are 1899 sentinels) | full DBF scan |
| `Streets.zip` member timestamps | 2026-03-12 18:52–18:55 | zip central directory |
| First appearance in git | commit `0637ce7`, 2026-07-24, "initialize git repo with … baseline (Commit 0)" | `git log -- Geography/data/Streets.shp` |

**What this establishes and what it does not.** The snapshot **cannot predate 2026-02-26**,
because it contains features stamped as updated on that date, and all five files were
written on **2026-03-12**. So the layer is a **~March-2026 vintage**, not an old one.
That materially narrows what `Geography/data/README.md` L29 calls "⚠️ **UNVERIFIED**" and
`docs/science/DATA_SOURCES.md` L26 calls "⚠️ Unknown — predates version control." What it
still does **not** establish is a *formal RLIS release identifier* (e.g. a quarterly
release name), the download URL, the downloading party, or the date of download. DBF header
dates and zip timestamps are written by whatever tool produced the file and are not
authenticated; I present them as strong, self-consistent, circumstantial evidence, not as a
supplier record.

---

## 2. License, attribution, metadata, or terms-of-use shipped with the data

### 2.1 Shipped alongside the data: **nothing**

`Geography/data/` contains exactly five `Streets.*` files. There is **no** `.shp.xml` /
`.xml` FGDC or ISO metadata sidecar, no `.txt` terms file, no `README` from the supplier, no
`.lyr`, and no `.sbn`/`.sbx`. `Streets.zip` contains the same five files and nothing else —
I listed its central directory:

```
Streets.cpg 5        Streets.shp 17035988   Streets.dbf 33734352
Streets.prj 425      Streets.shx 896660
```

A repo-wide filename search for `*metadata*`, `*rlis*`, `*terms*` returns only unrelated
paths (`docs/eclipse/original-repast-metadata`, Gradle's `vcsMetadata`). **The supplier
shipped, or the inheriting party retained, no terms document at all.** That absence is
itself the central fact for the inquiry.

### 2.2 What the repo says about the terms — quoted in full

**`LICENSE` L66–80** (the operative statement, quoted verbatim):

> ```
> 3. THE STREET CENTERLINE DATA  --  REDISTRIBUTION TERMS UNVERIFIED
>    Geography/data/Streets.shp, .dbf, .shx, .prj, .cpg
>    Streets.zip
>
>    Portland Metro Regional Land Information System (RLIS) street centerlines,
>    inferred from the attribute schema. This file was supplied with the
>    inherited project and predates version control here: its original download
>    date, RLIS release version, and redistribution license could NOT be
>    recovered. This is documented as a known provenance gap in
>    Geography/data/README.md and docs/science/DATA_SOURCES.md (source D0), and
>    is stated in the published chapter.
>
>    Treat its redistribution as unconfirmed. If you need this layer, obtain it
>    directly from Metro / gis-pdx.opendata.arcgis.com under their terms rather
>    than relying on the copy here.
> ```

**`Geography/data/README.md` L28–30** (verbatim, table rows):

> | Provenance into this repo | Supplied with the inherited project as `Streets.zip` at the repo root (SHA-256 `DA0473722532FCA64877570B48284AE178DAC101214F32F0B14F80DC6401A7BE`, 16,219,928 B); extracted here without modification. **Original download date and RLIS release version are unknown** — the file predates this repository's version control. |
> | Publication/version | ⚠️ **UNVERIFIED.** `UPD_DATE`/`CREATE_DAT` columns exist per-feature and can date the vintage; a formal RLIS release identifier has not been recovered. Flagged in DATA_SOURCES.md as an open provenance gap. |
> | Licence | ⚠️ **UNVERIFIED for redistribution.** Metro RLIS data is commonly distributed under a Metro data licence; because the acquisition route is unknown, treat redistribution as unconfirmed until checked against Metro's current terms before any public release (roadmap commit 16). |

**`docs/science/DATA_SOURCES.md` L35–38** (verbatim):

> **Action required before publication:** re-acquire from Metro's official
> distribution (https://gis-pdx.opendata.arcgis.com / Metro RLIS) to establish a
> citable release version and explicit licence, then re-checksum. Until then the
> street layer is *usable for modelling* but **not citable as provenanced data**.

**`.zenodo.json` `notes`** (verbatim):

> "Not all files in this archive are MIT-licensed. The Portland Metro RLIS street centerline data is redistributed with UNVERIFIED terms and its provenance gap is documented; the Springer svmult class, the Repast Simphony demo data and dependency licenses, and the included public-sector datasets each carry their own terms. See the LICENSE file for the full scope statement."

### 2.3 Two statements in the repo that are inaccurate and should be fixed before anything goes to Metro

1. **`ContextCreator.java` L46** describes the layer as "real **City-of-Portland** RLIS
   street centerlines (D0)." RLIS is an **Oregon Metro** program, as every other file in the
   repo correctly states (`LICENSE` L70, `StreetNetwork.java` L23, `Geography/data/README.md`
   L27). Writing to Metro while the source code credits the City is an avoidable
   embarrassment.
2. **`IMPLEMENTATION_PLAN.md` L113** calls the streets asset "(offline, **license-clean**)."
   Read in context the phrase means "no external tile-provider terms," but standing alone
   inside a licensing conversation it asserts the exact thing WP1 exists to determine.
   Reword before this plan is shown to anyone outside the project.

### 2.4 Redistribution that is already happening — an honest framing point

- The five `Streets.*` files are **tracked in git** (`git ls-files Geography/data/` lists all
  five) and the repo has a GitHub remote, `https://github.com/fxa28196/REU.git`
  (`git remote -v`).
- `.zenodo.json` declares `"access_right": "open"` and `"license": "MIT"` with the RLIS
  carve-out only in a free-text `notes` field; `CITATION.cff` L36 carries a placeholder
  `doi: "10.5281/zenodo.XXXXXXX"`.

I **cannot determine from the repo** whether that GitHub repository is public or private, or
whether a Zenodo deposit has been made. If it is public, the complete source shapefile is
already being redistributed today, and the honest framing of the inquiry is "we hold and
have been distributing this; please tell us the terms" rather than "may we?". **Check the
repository's visibility before sending anything** — see §6.

---

## 3. What the model derives from it

The transformation is a single pass in `ContextCreator.build()` (`ContextCreator.java`
L452–487) feeding `StreetNetwork` (`Geography/src/geography/routing/StreetNetwork.java`).
DR-S2 proved that the read-only exporter reaches the same code and reproduces the archived
production census field-for-field (`DR-S2-exporter.md` §1: "S2 CENSUS VERIFICATION: PASS
(21 scalar fields + 25/25 corrections)").

### 3.1 Step by step

1. **Read.** `loadFeaturesFromShapefile("./data/Streets.shp")` via GeoTools
   (`ContextCreator.java` L454, L974–983). **112,070 features** read
   (`census.json` `shapefile_features_read: 112070`; I independently counted 112,070 DBF
   records with 0 deletion flags).
2. **Reproject EPSG:3857 → EPSG:4326.** GeoTools `ReprojectingFeatureCollection`; all
   in-model coordinates are WGS84 lon/lat degrees (`Geography/data/README.md` L38–39;
   DR-S2 §2: "`Streets.prj` is `WGS_1984_Web_Mercator_Auxiliary_Sphere`, so reprojection
   **does** fire"). *Consequence measured in DR-S2 §6 S2-R2: none of the 1,495,352 exported
   coordinate values round-trips through a 6- or 7-decimal string — the reprojection makes
   every coordinate a full-entropy double.*
3. **Take the first geometry part.** Each `MultiLineString` is reduced to
   `getGeometryN(0)` (`ContextCreator.java` L457–461). Recorded loss: none observed —
   `census.json` `features_not_multilinestring: 0`, and
   `docs/validation/STREET_NETWORK_VALIDATION.md` L35–36 states the shapefile has "**zero
   multi-part features**."
4. **U-27 freeway filter.** Features whose `TYPE` ∈ `{1110, 1120, 1121, 1122, 1123}` are
   excluded from the routing graph **and** the display layer, and counted
   (`ContextCreator.java` L462–470; the set is declared at L75–76 with the rationale at
   L66–74: "Pedestrians are prohibited on limited-access freeways … TYPE 1200-series
   highways are RETAINED (many carry sidewalks); removing them without a per-segment source
   would be an invention").
   **Excluded: 2,636 features, 614.1 km** — by type 1110×1,372 · 1120×279 · 1121×466 ·
   1122×447 · 1123×72 (`census.json` `freeway_filter`). **I verified this independently
   from the DBF**: my own TYPE tally gives 1110→1,372, 1120→279, 1121→466, 1122→447,
   1123→72, summing to exactly 2,636.
   **Retained: 112,070 − 2,636 = 109,434 features** (`census.json` `features: 109434`).
5. **Name resolution.** `FULL_NAME` → `STREETNAME` → `"unnamed street"`
   (`ContextCreator.java` L471–473).
6. **Edge creation.** `addStreet(PDX_F_NODE, PDX_T_NODE, coords, name)` when both node ids
   are numeric (L474–479). Features with non-numeric node ids would be display-only;
   `census.json` `features_display_only_nonnumeric_nodes: 0` — **this dataset has none**.
7. **Graph finalisation** — the correction layer, §3.2.
8. **Edge weights** — geodesic, §3.3.

### 3.2 The corrupt-node-id correction (this is the interesting part)

The defect, from `StreetNetwork.java` L32–38 and
`docs/validation/STREET_NETWORK_VALIDATION.md` §1: a contiguous block of `PDX_*_NODE` values
(≈107657–107723) is **corrupt in `Streets.dbf`** — the same id is claimed by different
features at locations up to ~18.5 km apart, creating "wormhole" edges whose Dijkstra weight
was metres while their physical span was kilometres.

The correction, implemented in `buildIndex()` and documented at `StreetNetwork.java` L40–57:

| Step | Rule | Constant |
|---|---|---|
| Claim clustering | every feature endpoint registers a claim (attribute id + coordinate); claims of one id within tolerance form one *node site* | `NODE_SITE_TOLERANCE_M = 100.0` (`StreetNetwork.java` L71) |
| Primary site | the **first** site of each id (in shapefile feature order) keeps the attribute id | `StreetNetwork.java` L45–46, L202 |
| Extra site → **REATTACHED** | aliased to a geometrically coincident existing primary node if one lies within tolerance | `REATTACH_TOLERANCE_M = 10.0` (`StreetNetwork.java` L75; applied at L343–347) |
| Extra site → **SPLIT** | otherwise becomes a **synthetic node with a negative id** at its true location | `nextSyntheticId = -1000` (`StreetNetwork.java` L208; applied at L349–351) |
| Audit | endpoint-to-node gap; edge span vs polyline length; component census recomputed | `IMPOSSIBLE_EDGE_SLACK_M = 2×100 + 2×10 = 220 m` (L79–80) |

**Nothing is deleted and the source shapefile is never modified** — `StreetNetwork.java`
L47 ("**corrected, never deleted**"); `STREET_NETWORK_VALIDATION.md` L49–50 ("the source
shapefile is **not modified** — corrections happen at load time and are logged").

### 3.3 Edge weights

Undirected graph (pedestrians are not bound by one-way vehicle restrictions,
`StreetNetwork.java` L29–30); edge weight = **geodesic polyline length in metres on the
WGS84 ellipsoid**, GeographicLib / Karney 2013 (`StreetNetwork.java` L27–29). The DBF
`LENGTH` column is not used (§1.2). Plan Q8 (`IMPLEMENTATION_PLAN.md` L600) fixes these
weights as computed **once by the Java instrument** and never recomputed downstream.

### 3.4 The census — plan figures vs. what is actually true

| Metric | Plan AC (WP2-S2) | **Actual (post-U-27, production)** | Pre-U-27 (diagnostic only) |
|---|---|---|---|
| Shapefile features read | — | 112,070 | 112,070 |
| Freeway features excluded | — | **2,636** (614.1 km) | 0 |
| Features → edges | 109,434 | **109,434** | 112,070 |
| Attribute node ids | — | **88,078** | 89,322 |
| Final graph nodes | 88,100 | **88,100** | 89,345 |
| Affected attribute ids | — | **25** | 27 |
| Sites **reattached** (≤ 10 m) | 4 ❌ | **3** | 4 |
| Sites **split** (synthetic) | 23 ❌ | **22** | 23 |
| Synthetic id range | — | **−1000 … −1021** | — |
| Undirected street edges | 109,434 | **109,434** | — |
| Directed edge records | — | **218,868** | — |
| Components | 171 | **171** | 154 |
| Largest component | 59,725 | **59,725** | 60,444 |
| Impossible edges after fix | — | **0** (was 50 pre-correction) | — |
| Max endpoint gap | 11.9 m | **11.944725226913 m** | — |
| Polyline vertices | — | **659,576** | — |
| Node id range | — | **−1021 … 17,023,620** | — |
| Max node degree | — | **7** | — |

Sources: `websim/pipeline/out/graph-dump/census.json` (the exporter's own output);
`DR-S2-exporter.md` §3 for the plan-vs-actual comparison and finding **S2-F1**; the
pre-U-27 column is DR-S2's `-NoU27` diagnostic re-run and matches
`docs/validation/STREET_NETWORK_VALIDATION.md` §3 verbatim.

**Consistency checks I ran on these numbers:** 112,070 − 2,636 = 109,434 ✓ ·
88,078 + 22 synthetic = 88,100 ✓ · 89,322 + 23 = 89,345 ✓ · 109,434 × 2 = 218,868 directed
records ✓ · 659,576 − 218,868 endpoints = 440,708 interior vertices, which is exactly the
`interior_vertices` count in the shipped geometry asset header ✓.

**The 4/23 figures are still live in two camera-ready documents.** DR-S2 §3 flags this and
it remains open for the user: `docs/final/TECHNICAL_REFERENCE.md` ("Sites reattached ≤10 m |
4", "split | 23") and `docs/chapter/capacity-is-not-access-source.md` ("covering 4 cases …
remaining 23"). Both describe the *published* graph and now disagree with every archived
`simulation.json`. The scientific claim (nothing deleted, connectivity unchanged) is
unaffected. **These are outside `websim/` and I did not modify them.**

### 3.5 The correction records themselves

25 records, in production order, in `census.json` `corrections` and in
`websim/pipeline/out/graph-dump/corrections.tsv`. Each carries `kind`, `attr_node_id`,
`graph_node_id`, `dist_from_primary_m`, `lon`, `lat`, `claims`, `first_feature`. The three
REATTACHED records are attribute ids 107679 → node 77406, 107671 → 17022100, 107718 →
17015842. Displacements from primary run 1,654.7 m to 18,562.3 m. **These 25 records ship
in the public asset at full float64 precision** — see §4.4.

---

## 4. What the browser port would actually publish

This is the crux the licensing question turns on, so it is measured, not characterised.
Sources: `websim/docs/DR-S2-exporter.md` §4–5; `websim/pipeline/scripts/pack-graph.ts`;
`websim/shared/src/graph-asset.ts`; `websim/pipeline/out/graph-assets.report.json`;
`websim/pipeline/out/assets/assets-manifest.json`; and the **header bytes of the built
assets themselves**, which I read directly.

### 4.1 The three graph assets, as actually built

DR-S2 §5 measured a monolithic asset at 8.794 MB brotli against a ≤ 3 MB budget and invoked
the pre-named split-asset fallback. What `pack-graph.ts` writes today:

| Asset | Raw bytes | Brotli bytes | Load | SHA-256 (first 12) |
|---|---|---|---|---|
| `graph-topology.bin` | 4,485,032 | **2,704,134** (2.579 MB) | eager | `11cac904ae2d` |
| `graph-geometry.bin` | 7,490,800 | **4,320,498** (4.120 MB) | lazy | `e69e7a08e450` |
| `graph-names.bin` | 722,832 | **229,773** (0.219 MB) | lazy | `21f55ff3e41b` |
| **total** | 12,698,664 | **7,254,405** (6.918 MB) | | |

Every one lists `"source_file": "Geography/data/Streets.shp"` and
`"source_sha256": "f5e5e311b625f129…"` in `assets-manifest.json`.

### 4.2 Section-by-section contents, read from the built files' own headers

**`graph-topology.bin`** — header `{"kind":"topology","counts":{"nodes":88100,"edges":109434,"csr_entries":218868}}`:

| Section | Type | Count | What it is |
|---|---|---|---|
| `node_id` | i32, varint-delta-zigzag | 88,100 | **the RLIS `PDX_*_NODE` ids** (plus the 22 synthetic negatives) |
| `node_lon`, `node_lat` | f64, byte-plane shuffled | 88,100 each | **exact reprojected RLIS junction coordinates** |
| `edge_from`, `edge_to` | i32 | 109,434 each | endpoint node indices |
| `edge_length_m` | f64 | 109,434 | Java-computed geodesic weights, bit-exact |
| `csr_offset`, `csr_entry` | i32 | 88,101 / 218,868 | adjacency in certified shapefile feature order |
| `census_json` | utf8 | — | the full census **including `input_sha256` of `Streets.shp/.dbf/.shx/.prj`** — I confirmed these hashes are literally present in the built file |
| `corrections_json` | utf8 | — | the 25 correction records at full precision |

**`graph-geometry.bin`** — header `{"kind":"geometry","counts":{"edges":109434,"interior_vertices":440708,"endpoint_exceptions":8}}`: interior polyline vertices as lossless f64 lon/lat, plus the 8 endpoints that are not bit-identical to their resolved node coordinate. DR-S2 §5 explains the packing: "218,860 of 218,868 polyline endpoints are bit-identical to their resolved node coordinate (8 exceptions — the reattached/split sites)."

**`graph-names.bin`** — header `{"kind":"names","counts":{"edges":109434,"unique_names":20283}}`: a per-edge i32 index plus a 284,573-byte UTF-8 name table. I counted the distinct labels in `edges.tsv` independently: **20,283**, matching exactly.

### 4.3 So: raw geometry, derived topology, or coordinates? **All three.**

- **Coordinates: yes, exactly.** 88,100 node coordinates and 440,708 interior vertices, as
  IEEE-754 float64, byte-for-byte the values GeoTools produced from the RLIS geometry.
  `pack-graph.ts` exists specifically to guarantee this: "**Nothing is recomputed.** Edge
  lengths and node coordinates are taken from the exporter's IEEE-754 hex columns and turned
  into bits directly, never via decimal arithmetic" (L18–21). The build's own verification
  reports `nodeCoordBitMismatches: 0`, `polylineVertexMismatches: 0`,
  `edgeLengthBitMismatches: 0` over 109,434 edges (`graph-assets.report.json`).
- **Geometry: recoverable in full, losslessly.** Every vertex of every retained feature is
  present or trivially reconstructible: interior vertices are stored directly; endpoints are
  the node coordinates, except 8 which are stored explicitly. **Anyone who downloads the two
  assets can rebuild the complete WGS84 centerline geometry of 109,434 of the 112,070 RLIS
  features (97.6%) with zero loss.** Not a simplification, not a quantisation — DR-S2 §6
  S2-R1 explicitly *rejected* the 1.71 MB quantised variant to keep it lossless.
- **Topology: yes, and keyed by RLIS's own identifiers.** The published node ids **are**
  the `PDX_F_NODE`/`PDX_T_NODE` values. Plan Q3 says the whole validation story "hang[s] on
  the RLIS graph" precisely because of this (`IMPLEMENTATION_PLAN.md` L595).
- **Attributes: almost entirely withheld.** Of 39 DBF columns, the published assets carry
  content from **four**: the two node-id columns and *both* name columns
  (`FULL_NAME`/`STREETNAME` collapsed to one label — that is two physical columns, not one).
  `TYPE` survives only as aggregate exclusion counts in `census_json`, never per feature.
  The remaining **34** — address ranges, ZIPs, jurisdictions, CFCC, `SOURCE`, dates,
  `Shape_Leng`, `OBJECTID`, `LOCALID` and the name-id columns — are **not published**.
  *(Correction 2026-07-31: §1.2 and §7 previously said "the other 35", which double-counts
  the `FULL_NAME`→`STREETNAME` fallback as one column. The model touches 5 physical columns;
  4 contribute to published content; 34 are never published.)*
- **The excluded features are not published at all.** The 2,636 freeway-class features
  (614.1 km) appear in the assets only as five counts.

**Bottom line for the inquiry.** The accurate description is: *a lossless geometric and
topological derivative of 97.6% of the RLIS street centerline layer, stripped to three
attributes, delivered as a 6.9 MB compressed binary designed for exact reconstruction.* It
is materially easier to re-derive a usable street layer from these assets than from most
"derived product" claims, and describing it to Metro as "just a topology" would not survive
inspection. The plan already reaches the same conclusion by policy
(`IMPLEMENTATION_PLAN.md` L595, L779); §4 is the evidence for it.

### 4.4 Three further RLIS-derived publications the Q3 discussion does not mention

1. **`encampments-public.bin`.** `build-encampments.ts` replaces every campsite coordinate
   with "the coordinate of the **nearest street node**" (L11–14) and its container carries
   sections `camp_node_index`, **`camp_node_id`**, **`camp_node_lon`**, **`camp_node_lat`**
   (L648–651). The published encampment layer is therefore literally a set of **RLIS node
   ids and RLIS node coordinates**. (This is good for the Q4 privacy analysis — the raw
   campsite coordinates never ship — but it means the RLIS question also governs this asset.)
2. **Shelter CSVs, shipped verbatim.** `assets-manifest.json` publishes
   `assets/data/shelters/*.csv` byte-identical to `Geography/data/shelters/*.csv`. I checked
   every one's `coord_source` column. **Corrected count (re-derived 2026-07-31): 8 of the 20
   shipped shelter CSVs carry RLIS-graph-sited rows, 10 rows each, 80 rows in total** —
   `shelters_2026_expanded_plus_new_sites.csv` (arm C) **and its `_elayer` twin**, plus all
   six `shelters_2026_random_sites_r*.csv`. Three `coord_source` strings are involved, not
   two: `greedy_capacity_aware_p_median_over_rlis_graph` (arm C and its twin),
   `uniform_random_street_node_in_demand_bbox_siteseed_{1,2,3}`, and
   `uniform_random_from_arm_C_candidate_set_siteseed_{4,5,6}` — the last of which an earlier
   revision of this list missed, so r4–r6 were wrongly excluded. Matching each sited row's
   coordinate against the published graph-node table at 6 dp confirms **79 of 80** sit
   exactly on an RLIS graph node. **One does not:** a single row in
   `shelters_2026_random_sites_r5.csv`, carried at full 6 dp, lies **93.8 m from the nearest
   graph node**, so it is not a graph-node coordinate despite a `coord_source` that says it
   was drawn from the arm-C candidate set. That is an unexplained inconsistency in the r5
   siting file. It does **not** change the licensing conclusion (the row is still
   RLIS-graph-derived by its own provenance string), but it is a real open item and it is
   also the row behind the one extra advisory finding the deploy gate reports in `r5`. I
   confirmed all **10 of 10** arm-C site coordinates match an RLIS graph node
   coordinate to 6 dp (node ids 33198, 39638, 43608, 44577, 49763, 52361, 55021, 60551,
   65052, 100413). The `coord_source` string itself names RLIS in the published file.
3. **The 25 correction records** ship inside `graph-topology.bin` at full float64 precision
   — 25 more RLIS-derived coordinates, in text, with their RLIS attribute ids and street
   names. `pack-graph.ts` L319–331 explains why full precision rather than the archived
   6 dp form (it is a privacy-gate interaction, not an RLIS decision).

### 4.5 One hosting fact that interacts with the license path

DR-S2 §5 closes with: "if the chosen static host cannot serve brotli, gzip applies and the
topology asset is **3.001 MB**, i.e. it lands *just over* budget. Flag for WP1's hosting
decision." The as-built topology asset is 2,704,134 B brotli (2.579 MB), and the plan
targets a static GitHub Pages deploy (`IMPLEMENTATION_PLAN.md` L35). Worth resolving in the
same WP1 pass, since hosting and rights are the same decision point.

---

## 5. The OSM fallback

### 5.1 What the plan actually commits to

Everything the repo says about the fallback, in full:

- **Q3** (`IMPLEMENTATION_PLAN.md` L595): "Only on refusal/timebox expiry: OSM rebuild
  behind the same `graph.bin` interface, with explicit validation downgrade (loss of node-id
  reproducibility; Tier 1/4 graph claims dropped to Tier-3 epsilon corridor) stated on the
  badge and recorded as a decision record."
- **WP1 acceptance** (L628–630): "written license outcome filed or timebox expiry →
  OSM-fallback decision record."
- **Risk W1** (L779): "OSM fallback behind the asset interface with explicit tier downgrade
  + decision record; nothing publishes until resolved."
- **User-flag item 2** (L842–843): "If Metro refuses, you personally approve (or veto) the
  OSM fallback, because it downgrades the validation claims the project advertises."
- **`PORT_MAP.md` L721 (R2):** "Resolve with Metro, or rebuild from OSM (breaks node ids,
  corrupt-ID quirk, and Java-archive reproducibility)."
- **`DR-S3-perf.md` L183–186:** the only *measured* statement about it — "If a future graph
  fix or an OSM swap merged the components, per-tree cost rises. That was measured, not
  guessed: **46 sources inside the 59,725-node component cost 5.56–7.92 ms/tree, 256–364 ms
  for all 46** — still 14× inside the 5 s budget."

### 5.2 What the fallback would actually cost — assembled from the repo

| Consequence | Evidence |
|---|---|
| **Node ids change, so every graph-level identity claim dies.** Node ids are the RLIS `PDX_*_NODE` values; OSM has its own. | `StreetNetwork.java` L25–26; Q3 "loss of node-id reproducibility" |
| **The corrupt-ID correction becomes meaningless.** The 25 records, the 3/22 split, the synthetic −1000…−1021 ids, the 50→0 impossible-edge result — all are properties of *this* DBF's defect. | `STREET_NETWORK_VALIDATION.md` §1–4; `PORT_MAP.md` L721 |
| **The 375 MB archived-run oracle is orphaned for graph-level gates.** | Q3: "OSM would orphan the 375 MB oracle" |
| **WP5's closed acceptance evidence stops applying.** DR-WP5 closed on "118/118 trees, 3,539,712/3,539,712 distances AND predecessor edges bit-equal, 3,908/3,908 snaps" — every one of those is against the RLIS graph. | `IMPLEMENTATION_PLAN.md` L685–688 |
| **Validation tier drops.** Tier 1 and Tier 4 graph claims fall to "Tier-3 epsilon corridor," and the badge must say so. | Q3 |
| **Component structure would likely change**, with a measured but acceptable perf effect. | `DR-S3-perf.md` L178–186 |
| **The U-27 filter needs re-specification.** It is written against RLIS `TYPE` codes `{1110,1120,1121,1122,1123}`; OSM uses `highway=motorway`/`motorway_link` etc. Nothing in the repo maps between them. | `ContextCreator.java` L66–76 |

### 5.3 What does **not** exist for the fallback

There is **no** OSM acquisition script, **no** cached extract, **no** PBF/Overpass/osmnx
code, **no** OSM→`graph.bin` converter, and **no** written analysis of OSM's own licence
terms (ODbL attribution and share-alike) anywhere in the repo. A repo-wide search for
`openstreetmap|overpass|osmnx|\bOSM\b` across `docs/`, `scripts/`, `Geography/src` and
`websim/` returns only the plan/PORT_MAP/DR-S3 mentions above plus the Nominatim geocoding
in §5.4. **The fallback is a named intention with an estimated cost, not a prepared path.**
Anyone treating it as a two-day swap is not reading the same repo I am.

### 5.4 OSM is *already* in the lineage — an existing question, not a hypothetical one

I checked the `coord_source` column of every shelter CSV. All 36 rows of the 2026 arm-A/B
placement files carry `nominatim_osm_from_hsd_2026_address` (29) or
`nominatim_osm_from_recovered_city_address` (7) — i.e. **every 2026 shelter coordinate in
the study is an OpenStreetMap Nominatim geocode**, produced by
`scripts/add_missing_shelters_2026.py` L73 (`https://nominatim.openstreetmap.org/search?`).
`docs/final/TECHNICAL_REFERENCE.md` L418 records the same. Those CSVs ship **verbatim** as
public assets (§4.4). The Sept-2020 file is different — US Census geocoder ×2 and Esri World
geocoder ×1 (`shelters_2020-09.csv`).

I make **no legal claim** about what that requires. I note only that (a) an OSM-derived
product is already inside the publication set, (b) `LICENSE` §4 lists the public-sector data
sources but does **not** mention OSM or Nominatim at all, and (c) whatever attribution
practice the project adopts for an OSM street fallback should be settled for these shelter
coordinates regardless of what Metro says.

---

## 6. What I could NOT determine

Listed exhaustively. Each is a real gap, not a hedge.

**About the RLIS data itself**

1. **The formal RLIS release identifier.** No release name, version string, or catalogue id
   exists in the file or anywhere in the repo. §1.3 narrows the vintage to "written
   2026-03-12, contains edits through 2026-02-26" — that is not a release id.
2. **The download URL and the downloading party.** Unknown. `Geography/data/README.md` L28
   says only "Supplied with the inherited project as `Streets.zip`." Who supplied it, from
   where, and under what click-through or account, is unrecoverable from the repo.
3. **The actual licence.** No licence text was shipped and I did not consult Metro's
   published terms (no external sources were used, by design). `Geography/data/README.md`
   L30's "Metro RLIS data is commonly distributed under a Metro data licence" is a hedge in
   the repo's own voice, not a finding. **Somebody must read Metro's current terms.**
4. **Whether `Streets.zip`'s SHA-256 corresponds to any Metro-published artifact.** The repo
   records `DA0473722532FCA6…` for the zip and per-file hashes for the five members; there is
   no upstream hash to compare against.
5. **Whether the DBF's corrupt node-id block is a defect in Metro's published data or was
   introduced downstream.** `STREET_NETWORK_VALIDATION.md` L140 says "Upstream RLIS should
   eventually be notified" — this has apparently not happened, and I found no record of it.
   *(If the inquiry goes out anyway, reporting the defect is probably the single most useful
   thing this project can offer Metro in return. Ids ≈107657–107723; 25 sites affected in the
   post-U-27 graph; full records in `census.json`.)*

**About the publication surface**

6. **Whether `https://github.com/fxa28196/REU.git` is public or private.** Determinable only
   by looking; I did not access the network. This changes the framing of the inquiry
   materially (§2.4).
7. **Whether a Zenodo deposit exists.** `.zenodo.json` declares `"access_right": "open"`;
   `CITATION.cff` L36 still carries a placeholder DOI. Unresolved.
8. **Whether the chapter/proceedings submission redistributes any of this data**, and what it
   states about the layer. `LICENSE` L76 says the provenance gap "is stated in the published
   chapter"; I did not audit the chapter sources (outside `websim/`).
9. **Whether any archived run outputs in `docs/runs/` (375 MB) contain RLIS-derived
   coordinates** that would themselves be redistribution if published. Archived `agents.csv`
   files carry per-agent lon/lat which are positions on the RLIS graph — plausibly yes, but I
   did not verify, and the plan ships `archive-bundles/*.json` digests rather than raw
   `agents.csv`.

**About the fallback and adjacent rights**

10. **Whether OSM coverage of the study area would even support the model's requirements**
    (pedestrian-relevant classification, node degree, component structure). No one has
    looked; §5.2's cost list is derived from what would break, not from an OSM assessment.
11. **What OSM's ODbL terms require of this project**, both for a street fallback and for the
    already-shipped Nominatim-derived shelter coordinates (§5.4). Not analysed anywhere in
    the repo, and not analysed here.
12. **Whether the Esri World geocoder result in `shelters_2020-09.csv` carries terms of its
    own.** `Geography/data/README.md` L152 records its use; `LICENSE` does not mention it.
13. **Metro's actual answer**, and whether a "derived product" carve-out exists in their
    terms. That is the entire point of the inquiry and cannot be answered from here.

---

## 7. Facts worth having in hand when the inquiry is written

Not a draft letter — just the numbers a Metro data steward would need in order to give a
useful answer, all verified above.

- **What we hold:** RLIS street centerlines, five-file shapefile, 112,070 PolyLine features,
  39 attributes, EPSG:3857, four-county extent, files written 2026-03-12 with feature updates
  through 2026-02-26. `Streets.shp` SHA-256 `f5e5e311b625f129f94fcf6d3150f8feb521ea5a79039ade43514ebfb35810a8`.
- **How we got it:** unknown — inherited with the project, no acquisition record. Stated
  plainly; it is the first thing they will ask.
- **What we want to publish:** a derived binary bundle, 6.9 MB compressed, containing the
  exact geometry of 109,434 features (freeway-class excluded), the `PDX_F_NODE`/`PDX_T_NODE`
  ids, geodesic edge lengths, adjacency, and street names — and **not** the other 35
  attribute columns. Sufficient to reconstruct those 109,434 centerlines losslessly.
- **Where:** a static, non-commercial, academic web deployment of an REU research model, with
  a provenance screen that can carry whatever attribution string Metro specifies.
- **What we can offer back:** a documented, reproducible report of the corrupt `PDX_*_NODE`
  block (§6 item 5).
- **What we need from them:** (a) may we redistribute the derived product; (b) required
  attribution wording; (c) may we redistribute the source shapefile in the git repository
  (which we may already be doing — check first); (d) the release identifier for this vintage,
  so it becomes citable.

---

## 8. Suggested corrections inside `websim/` (not applied — flagged only)

1. `IMPLEMENTATION_PLAN.md` L113: "112k street features" is the pre-U-27 count; the rendered
   layer is **109,434**. Same line: reword "license-clean" (§2.3).
2. `IMPLEMENTATION_PLAN.md` L323: the `graph.bin` row still describes a single asset with
   "delta-encoded int32 1e-7° polylines" at "~2–2.5 MB br". DR-S2 invoked the split fallback
   and rejected quantisation; the built reality is three assets, lossless f64, 6.918 MB br
   total. The row is superseded but not yet marked so.
3. Q3 (L595) and W1 (L779) discuss `graph.bin` alone. Per §4.4, the RLIS determination also
   governs `encampments-public.bin` and the shipped shelter CSVs. Worth stating explicitly so
   the inquiry's scope matches what would actually be published.

Corrections 1–3 are inside `websim/` and are safe for a follow-up edit. The `4 reattached /
23 split` staleness in `docs/final/TECHNICAL_REFERENCE.md` and
`docs/chapter/capacity-is-not-access-source.md` (§3.4) is **outside** `websim/` and remains
the user's to fix.
