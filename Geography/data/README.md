# Data Provenance Registry — `Geography/data/`

Every dataset in this directory, where it came from, when it was retrieved,
its licence, its checksum, and exactly how it is transformed before the model
consumes it. **Nothing may be added to this directory without an entry here.**

Scope note: this file covers *files on disk*. The wider evaluation of
candidate datasets (including those not yet acquired, with completeness,
uncertainty and limitation assessments) lives in
[`../../docs/science/DATA_SOURCES.md`](../../docs/science/DATA_SOURCES.md).
Citations with DOIs are in
[`../../docs/science/BIBLIOGRAPHY.md`](../../docs/science/BIBLIOGRAPHY.md).

Checksums are SHA-256 of the file as committed. Verify with:

```powershell
Get-FileHash Geography\data\<file> -Algorithm SHA256
```

---

## 1. `Streets.*` — Portland street centerlines (**model input, in use**)

| Field | Value |
|---|---|
| Files | `Streets.shp` (17,035,988 B), `Streets.dbf` (33,734,352 B), `Streets.shx` (896,660 B), `Streets.prj` (425 B), `Streets.cpg` (5 B) |
| Source organisation | **Regional Land Information System (RLIS), Oregon Metro** — street centerlines; schema confirmed by the `PDX_F_NODE`/`PDX_T_NODE`, `LCITY`/`RCITY`, `CFCC`, `LEFTADD1` attribute set. (RLIS is an Oregon Metro programme, **not** a City of Portland one.) |
| Provenance into this repo | Supplied with the inherited project as `Streets.zip` at the repo root (SHA-256 `DA0473722532FCA64877570B48284AE178DAC101214F32F0B14F80DC6401A7BE`, 16,219,928 B); extracted here without modification. **Original download date and RLIS release version are unknown** — the file predates this repository's version control. |
| Publication/version | ⚠️ **UNVERIFIED.** `UPD_DATE`/`CREATE_DAT` columns exist per-feature and can date the vintage; a formal RLIS release identifier has not been recovered. Flagged in DATA_SOURCES.md as an open provenance gap. |
| Attribution / redistribution | **Redistributed with the provider's approval.** Credit as: *Regional Land Information System (RLIS), Oregon Metro.* **The researcher reports that Oregon Metro approved redistribution of the RLIS-derived products in this repository (relayed 2026-08-02).** Recorded exactly that strongly and no more: **no written determination from Metro is on file anywhere in this repository** — what exists is the researcher's report of the approval. No licence name, licence version, licence URL, reference number, contact name or approval date is claimed, because none has been recorded. The *release-version* gap in the row above is a separate matter and is **not** closed by this approval. |
| Geographic coverage | Portland metropolitan area (Multnomah and adjacent counties) |
| Temporal coverage | Static snapshot (single vintage, no time dimension) |
| CRS as stored | `WGS_1984_Web_Mercator_Auxiliary_Sphere` (EPSG:3857) |
| Completeness | 112,070 polyline features; **0 features lacked `PDX_F_NODE`/`PDX_T_NODE`** node ids when the routing graph was built |

**Transformations applied before use** (`ContextCreator.loadFeaturesFromShapefile` → `build`):

1. Reprojected EPSG:3857 → **WGS84 (EPSG:4326)** at load via GeoTools
   `ReprojectingFeatureCollection`. All in-model coordinates are lon/lat degrees.
2. Each `MultiLineString` reduced to its **first** `LineString` component
   (`getGeometryN(0)`).
3. One `PortlandStreet` agent created per feature, carrying `FULL_NAME`
   (fallback `STREETNAME`, then `"unnamed street"`) and a **geodesically
   recomputed length in metres** — the DBF `LENGTH` column is *not* trusted
   because its unit is undocumented in the file.
4. Undirected routing graph built from `PDX_F_NODE`/`PDX_T_NODE`
   (88,100 nodes / 109,434 edges), edge weight = geodesic polyline length.

**Known limitations:** freeway/limited-access segments **are filtered** out of
the pedestrian graph as of U-27 — 2,636 features / 614 km carrying `TYPE` ∈
{1110, 1120, 1121, 1122, 1123} (freeway mainlines and ramps, including the
Marquam and Fremont bridge decks) are excluded before the graph is built,
leaving 109,434 of the 112,070 polylines routable; no
sidewalk, crossing, or barrier modelling; dropping to `getGeometryN(0)` discards
any multi-part geometry beyond the first part.

SHA-256 (first 16 hex chars; recompute with the command above to verify in full):
```
Streets.shp  F5E5E311B625F129…
Streets.dbf  636B9CA18B0BF0C2…
Streets.shx  0C5CECB995DD3AF5…
Streets.prj  F2E7FB14D55BDD8D…
Streets.cpg  3AD3031F5503A440…
```

---

## 2. `airnow/aqs_hourly_pm25_portland_2020-09.csv` — hourly PM2.5 (**acquired 2026-07-24; not yet wired into the model**)

| Field | Value |
|---|---|
| File | `airnow/aqs_hourly_pm25_portland_2020-09.csv` (1,513,898 B) |
| SHA-256 | `D908556C347ECDF68342CE859B1C56813CC606F695804C0BA71992604486CA08` |
| Source organisation | **U.S. Environmental Protection Agency**, Air Quality System (AQS) / AirData pre-generated files |
| Upstream file | `https://aqs.epa.gov/aqsweb/airdata/hourly_88502_2020.zip` (19.0 MB zip, SHA-256 `8762E57443C91CC059A90FD0C55D25B93775EDAA3930D8C530B9561A649D2075`; decompresses to 690.8 MB) |
| Retrieved | **2026-07-24** |
| Parameter | AQS code **88502** — "Acceptable PM2.5 AQI & Speciation Mass" (non-FRM continuous). See note below on why not 88101. |
| Licence | **U.S. federal government work — public domain** (no copyright). EPA requests acknowledgement of AQS as the source. |
| Geographic coverage | Multnomah, Washington and Clackamas Counties, Oregon — **7 monitoring sites** |
| Temporal coverage | 2020-09-01 through 2020-09-30, hourly (local time and GMT both present) |
| Completeness | 4,795 rows; Multnomah sites report **48 observations/day** (two monitors × 24 h) across the whole Sept 7–19 event window with no gaps observed |
| Uncertainty | `MDL` and `Uncertainty` columns are carried through unmodified. 88502 is *not* Federal Reference/Equivalent Method — continuous nephelometer/BAM-class instruments can be biased under dense wood-smoke aerosol. Values are **not** regulatory-grade for compliance purposes. |

**Monitors captured** (AQS state 41 / county / site, WGS84):

| County | Site | Latitude | Longitude |
|---|---|---|---|
| Multnomah | 0080 | 45.496641 | −122.602877 |
| Multnomah | 2011 | 45.562192 | −122.575705 |
| Washington | 0004 | 45.528501 | −122.972398 |
| Washington | 0005 | 45.399200 | −122.745500 |
| Washington | 0111 | 45.470191 | −122.816411 |
| Clackamas | 0004 | 45.259280 | −122.588151 |
| Clackamas | 0102 | 45.288450 | −121.782775 |

**Transformations applied** (all performed by `scripts/fetch-aqs-pm25.ps1`, which
reproduces this file exactly):

1. Download the national 2020 hourly 88502 archive; verify SHA-256.
2. Stream-filter to `State Code = "41"` (Oregon) and `Date Local` in `2020-09-*`
   → 31,019 rows.
3. Restrict to `County Name ∈ {Multnomah, Washington, Clackamas}` → 4,795 rows.
4. Re-serialise as UTF-8 CSV. **No values are altered, rounded, unit-converted,
   gap-filled, or averaged.** Units remain µg/m³ (local conditions).

**Schema** (24 columns, unchanged from EPA): `State Code, County Code, Site Num,
Parameter Code, POC, Latitude, Longitude, Datum, Parameter Name, Date Local
(YYYY-MM-DD), Time Local (HH:MM), Date GMT, Time GMT, Sample Measurement,
Units of Measure, MDL, Uncertainty, Qualifier, Method Type, Method Code,
Method Name, State Name, County Name, Date of Last Change`.

**Why parameter 88502 rather than 88101 (FRM/FEM):** the 2020 hourly 88101 file
was downloaded and inspected (SHA-256
`CA69E410880402F75DABAA917AF84ABB6008707F8EF7D611DD54C5CD351A793C`); it contains
**no Multnomah County monitors** — only Harney, Klamath and Lane County sites
report hourly 88101 in Oregon. 88502 is the series Oregon DEQ's Portland-area
continuous monitors report and is what feeds AirNow's real-time AQI.

**Independent corroboration of the event** (computed from this file, Multnomah
County only — this is a *validation observation*, not a model input):

| Date (2020) | Max hourly µg/m³ | Mean hourly µg/m³ |
|---|---|---|
| Sep 07 | 113.4 | 25.1 |
| Sep 08 | 5.8 | 4.0 |
| Sep 09 | 27.8 | 18.0 |
| Sep 10 | 346.6 | 152.4 |
| Sep 11 | 298.9 | 210.4 |
| Sep 12 | 586.1 | 318.8 |
| **Sep 13** | **588.9** | **426.9** |
| Sep 14 | 584.3 | 385.1 |
| Sep 15 | 439.2 | 240.5 |
| Sep 16 | 416.8 | 248.9 |
| Sep 17 | 305.6 | 178.6 |
| Sep 18 | 148.4 | 34.3 |
| Sep 19 | 10.2 | 5.5 |

This **independently confirms** the project slides' claim that the event peaked
above 500 µg/m³, and shows the smoke episode (Sep 10–18) aligns with the
Joint Office of Homeless Services' nine days of smoke-respite shelter
(Sep 10 – morning of Sep 19). See DATA_SOURCES.md D1.

**Recommended citation:** U.S. Environmental Protection Agency. *Air Quality
System (AQS) pre-generated hourly data files, parameter 88502, 2020.* Retrieved
2026-07-24 from https://aqs.epa.gov/aqsweb/airdata/download_files.html

---

## 2b. `shelters/shelters_2020-09.csv` — real Sept-2020 shelters (**model input, in use**)

| Field | Value |
|---|---|
| File | `shelters/shelters_2020-09.csv` (SHA-256 `892b72500eeaa34005c8ae00f9abb5bdba639e463f505b2794e3231e1801b302`) |
| Source | Multnomah County Joint Office of Homeless Services Sept-2020 press releases (operating dates, 24-h operation, 9-day span) + Street Roots 2020-09-16 (site names, capacity 99 each); DATA_SOURCES D1 |
| Coordinates | Geocoded from official addresses: OCC + MSCC via **US Census geocoder** (Public_AR_Current); Charles Jordan via **Esri World geocoder** (score 99.52) cross-checked against Wikipedia (agree to ~15 m). Per-row `coord_source` column records which. |
| Retrieved | 2026-07-24 |
| Licence | Government press-info (public); coordinates derived from public addresses |
| Completeness | 3 sites: OCC + Charles Jordan operating (Sep 10/Sep 11 → morning Sep 19), Mount Scott standby |
| Uncertainty / limitations | **Capacity 99 is newsroom-sourced, NOT confirmed by a primary JOHS record** (`capacity_basis` column flags this). Charles Jordan ZIP is 97203 (Esri) not 97217 (portland.gov listing). Capacity is a nightly cap, not throughput. |
| Transformations before use | `ContextCreator` loads rows, treats `status="operating"` as the active status-quo scenario (2 sites; standby excluded), snaps each to the nearest street-graph node, roots a Dijkstra tree. No coordinate modification. |

## 2c. `encampments/irp_campsite_reports_sample.csv` — real encampment locations (**model input, in use; TEMPORAL PROXY**)

| Field | Value |
|---|---|
| File | `encampments/irp_campsite_reports_sample.csv` (SHA-256 `3e557de5db4668c5d30fd7a6fc13bcc38b5e37bab4b9becaf9b3dc35366285ca`; 3,400 points) |
| Source | **City of Portland IRP Campsite Reports** (Impact Reduction Program / One Point of Contact, via 311 and pdxreporter.org), obtained from the City's open-data ArcGIS Feature Service `COP_OpenData_Miscellaneous/MapServer/1396`; DATA_SOURCES D2b |
| Retrieved | 2026-07-24 via `scripts/fetch-encampments.ps1` (non-duplicate reports, systematic sample across the OBJECTID range) |
| Attribution / redistribution | **Redistributed with the provider's approval.** Credit as: *City of Portland, Impact Reduction Program campsite reports* (obtained via the City's open-data ArcGIS service). **The researcher reports that the City of Portland approved redistribution of the campsite-report-derived products in this repository (relayed 2026-08-02).** Recorded exactly that strongly and no more: **no written determination from the City is on file anywhere in this repository** — what exists is the researcher's report of the approval. No licence name, licence version, licence URL, reference number, contact name or approval date is claimed, because none has been recorded. |
| Geographic coverage | Portland (lon −122.79..−122.48, lat 45.44..45.65) |
| Temporal coverage | **2025-01-08 .. 2026-07-23** |
| ⚠️ CRITICAL limitation | The open-data feed retains only a rolling recent window — **there are ZERO records for 2020.** These are REAL reported Portland encampment locations but from 2025–26, used as a **spatial-distribution proxy** for the Sept-2020 population. This is a flagged assumption; `ContextCreator` prints a runtime warning. |
| Other limitations | Complaint-driven (311/web reports) → biased toward visible, complained-about camps; not a census of unsheltered people. Paging a live feed is not byte-reproducible — the *spatial distribution* is the reproducible quantity, not the exact rows (see the fetch script). |
| Transformations before use | `ContextCreator` samples `numAgents` points uniformly at random (seeded by `randomSeed`), snaps each to the nearest street-graph node, and records the report `inc_id` as the resident's `encampment_id`. No coordinate modification. |

## 3. Stock Repast Simphony demo data (**not used by the model; retained**)

`Agents2.*`, `CookCounty.*`, `WaterLines.*`, `Zones2.*`, `RGBTestPattern.*`,
`SP27GTIF.TIF`, `UTM2GTIF.TIF`, `README.TXT`

| Field | Value |
|---|---|
| Source | Repast Simphony's stock "Geography" GIS demo (Chicago-area sample data and GeoTIFF test patterns); `README.TXT` is the demo's own description |
| Licence | Distributed with Repast Simphony (see `Geography/repast-licenses/`) |
| Status | **Not loaded by any code path.** All demo loaders were removed in commit `eaa9605`. |
| Retained because | They are part of the inherited upstream project; deleting them is a separate, reversible decision and they cost ~1.3 MB. |
| Transformations | None — never read. |

---

## 4. Datasets required but **not yet acquired**

Tracked with full evaluations in
[`../../docs/science/DATA_SOURCES.md`](../../docs/science/DATA_SOURCES.md):
real cleaner-air shelter coordinates (D1), PIT-count demographics (D2),
comorbidity prevalence (D5/D6), meteorology (D4), social-vulnerability and
environmental-justice layers (D7). Until each lands, the corresponding model
values remain **explicitly flagged placeholders** in code and in
`docs/science/DESIGN_SPEC.md` — they are never presented as sourced values.
