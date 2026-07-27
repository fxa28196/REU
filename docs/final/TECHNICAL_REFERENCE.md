# Technical Reference — Complete Breakdown

**Wildfire-Smoke Clean-Air Shelter Placement: an Agent-Based Model of Multnomah County**

Fatima Asghar · NSF REU *Computational Modeling Serving Portland* · Portland State University
Mentor: Prof. Christof Teuscher
Repository: `https://github.com/fxa28196/REU` · Branch `phase2/human-agent-modeling` · Commit `c0cd113`
Document generated 2026-07-26 from the 27-run experiment set.

---

## 0. How to read this document

This is the **complete** technical record. Every number reported anywhere in this
project can be traced from here to the line of code that produced it, the data file
it came from, and the published source that justifies it. Nothing is asserted
without one of three labels:

| Label | Meaning |
|---|---|
| **M** — measured | Comes from a dataset. The dataset, its URL, its retrieval date and its SHA-256 are given. |
| **L** — literature | Comes from a published paper. Authors, journal, DOI and the exact reported quantity are given. |
| **A** — assumption | Nobody measured it and no paper reports it. It is named, its direction of bias is stated, and it is registered in `Geography/data/registry/assumptions.csv`. |

The project enforces this mechanically. `ScienceRegistry.java` refuses to start a
run if any variable claiming class **M** or **L** lacks a resolvable DOI or dataset
id, or if any **L**/**C** variable lacks a sweepable uncertainty range. A citation
defect stops the simulation; it cannot silently become a result.

**Companion documents.** The polished narrative version of this material is
`docs/final/PRESENTATION.md`. The plain-language summary is
`docs/final/readable/RESULTS_EXPLAINED.md`. The publication chapter is
`docs/chapter/chapter.tex`.

---

## 1. The research question and the claim

### 1.1 The question

> If the September 2020 wildfire smoke event returned today, what would happen to
> the people living outside in Multnomah County — and which intervention actually
> helps: **more shelter capacity, or better-placed shelter capacity?**

### 1.2 The claim, stated precisely

**Claimed:** *For a fixed total shelter capacity, placing new capacity at optimized
locations outperforms enlarging existing facilities — in aggregate outcomes and in
equity — under the modelled assumptions.*

**Not claimed:**
- That this reproduces what happened in 2020. It does not, and the calibration
  check says so explicitly (§13.6).
- That any person gets sick. No health outcome is simulated. The model measures
  smoke exposure and inhaled mass, not disease.
- That the optimized sites are buildable. They are street-network nodes chosen by
  an algorithm, with no zoning, cost, staffing or siting analysis behind them.

### 1.3 Why the three scenarios are in this order

The three arms are **not three guesses**. Each one answers the question the previous
arm measured.

```
   A (reality)  ──measures──▶  "capacity is the binding constraint"
        │
        └── so B relieves capacity, and NOTHING else ──▶ measures:
                     "578 beds sit empty while 562 people are turned away"
                          │
                          └── so C spends the IDENTICAL capacity differently ──▶
                                       measures the placement effect alone
```

**A is a measurement, not a treatment.** Its only job is to reveal which constraint
binds. Because B and C hold total system capacity exactly equal at 6,842, a B→C
difference isolates *where the marginal capacity sits* and nothing else.

---

## 2. System architecture

### 2.1 Stack

| Layer | Technology | Version |
|---|---|---|
| Simulation framework | Repast Simphony (`ContextBuilder`, `@ScheduledMethod`, GIS projection) | 2.11.0 |
| Language | Java | Temurin JDK 17.0.19+10 |
| Build | Gradle wrapper | 8.14.3 |
| Geodesy | GeographicLib-Java (`net.sf.geographiclib`) — bundled with Repast | 1.49 |
| Geometry / spatial index | JTS (`Envelope`, `STRtree`, `GeometryFactory`), GeoTools reprojection | via Repast 2.11.0 |
| Analysis | Python 3.14.6, pandas 3.0.5, matplotlib 3.11, pyshp | — |
| Rendering | Repast WorldWind GIS display (`GisAgentStyle`, `PortlandStreetStyle`) | — |

Repast Simphony is cited as North et al. (2013), *Complex Adaptive Systems Modeling*
1(1):3, DOI `10.1186/2194-3206-1-3` — the citation the Repast developers themselves
request.

### 2.2 Class inventory — `Geography/src/geography/`

| Path | Lines | Role |
|---|---|---|
| `agents/ContextCreator.java` | 426 | Repast `ContextBuilder`: loads registries, streets/graph, smoke field, shelters (snap + Dijkstra tree each), places residents at real encampment points, schedules the end-of-run export. |
| `agents/GisAgent.java` | 466 | The unsheltered-resident agent: state machine, per-tick walking along a routed path, exposure/dose accrual, shelter selection and re-routing after refusal. |
| `agents/PopulationSampler.java` | 371 | Draws heterogeneous resident attributes (age, sex, mobility, asthma, COPD, chronic physical) and per-agent walking speed from a dedicated seed-derived RNG. |
| `agents/PortlandStreet.java` | 29 | Value object for a street centerline feature (name + geodesic length); display only. |
| `agents/Shelter.java` | 125 | Clean-air shelter: capacity/occupancy accounting, `admit()`/`hasSpace()`, opening-window ticks, graph node id and its Dijkstra tree. |
| `data/CsvLoader.java` | 159 | UTF-8 CSV reader (strips BOM) for all committed data files; `readStrict` variant rejects ragged rows and duplicate headers. |
| `env/SmokeField.java` | 147 | Hourly county-uniform PM2.5 field from the EPA AQS CSV; maps schedule ticks to hours and to local wall-clock time. |
| `output/OutcomeLogger.java` | 682 | End-of-run export of `agents.csv`, `shelters.csv`, `simulation.json` (reproducibility manifest, checksums, governance, stratified exposure). |
| `routing/StreetNetwork.java` | 494 | Routable pedestrian graph over RLIS centerlines: node-site validation/correction, STRtree snapping, Dijkstra trees, path reconstruction. |
| `science/ScienceRegistry.java` | 316 | Fail-fast loader/validator for `variables.csv` and `assumptions.csv`, plus their SHA-256s for the manifest. |
| `styles/GisAgentStyle.java` | 168 | WorldWind display style for residents (colour/icon by state). |
| `styles/MyNetworkStyle.java` | 36 | Display style for network projection edges. |
| `styles/PortlandStreetStyle.java` | 47 | Surface-shape style for street polylines. |
| `styles/TowerAgentStyle.java` | 65 | Marker style for `Shelter` agents (legacy class name from the stock Repast demo). |

### 2.3 Execution pipeline

```
  ScienceRegistry.load()          ← fail-fast: bad citation ⇒ no run at all
        ↓
  Streets.shp  ──reproject 3857→4326──▶  StreetNetwork
        │                                   ├─ node-site validation (wormhole fix)
        │                                   ├─ STRtree index
        │                                   └─ one Dijkstra tree per shelter
        ↓
  shelters CSV ──geocoded coords──▶ Shelter agents (capacity, open window, node id)
        ↓
  encampment CSV ──uniform sample (seeded)──▶ 6,842 start points
        ↓
  PopulationSampler ──separate RNG stream──▶ per-resident attributes + walking speed
        ↓
  AQS PM2.5 CSV ──hourly county mean──▶ SmokeField
        ↓
  ┌──────────── 18,720 ticks (312 h at 1 min/tick) ────────────┐
  │  every tick, every agent:                                  │
  │    accrue exposure + inhaled dose if outdoors              │
  │    PRE_EVAC → EN_ROUTE when PM2.5 ≥ 55.5 AND a door is open│
  │    walk exact geodesic arc-length along the routed path    │
  │    on arrival: admit() → SHELTERED, or re-plan from here   │
  └────────────────────────────────────────────────────────────┘
        ↓
  OutcomeLogger → agents.csv (49 cols) + shelters.csv + simulation.json
```

---

## 3. Data provenance — every input dataset

Rule enforced by `Geography/data/README.md`: *"Nothing may be added to this
directory without an entry here."* Verify any checksum with
`Get-FileHash Geography\data\<file> -Algorithm SHA256`.

### 3.1 D3 — PM2.5 observations (class M)

| Property | Value |
|---|---|
| File | `Geography/data/airnow/aqs_hourly_pm25_portland_2020-09.csv` (1,513,898 bytes) |
| SHA-256 | `D908556C347ECDF68342CE859B1C56813CC606F695804C0BA71992604486CA08` |
| Source | U.S. EPA, Air Quality System (AQS) pre-generated hourly files |
| URL | `https://aqs.epa.gov/aqsweb/airdata/hourly_88502_2020.zip` |
| Retrieved | 2026-07-24, reproducible via `scripts/fetch-aqs-pm25.ps1` |
| Licence | U.S. federal government work — **public domain** |
| Rows | 4,795 (7 monitors, tri-county); 1,454 Multnomah |
| Parameter | AQS code **88502** — "Acceptable PM2.5 AQI & Speciation Mass" |

**Why 88502 and not 88101.** The FRM/FEM series 88101 was downloaded and inspected
(SHA-256 `CA69E410…A793C`) and contains **no Multnomah County monitors** — only
Harney, Klamath and Lane County sites report hourly 88101 in Oregon. 88502 is what
Oregon DEQ's Portland-area continuous monitors report and what feeds AirNow's
real-time AQI. This is a documented limitation, not a preference: 88502 is
"acceptable for AQI" but is not a Federal Reference Method.

**Transformations (none alter a value).** `scripts/fetch-aqs-pm25.ps1`: download the
national archive → verify SHA-256 → stream-filter `State Code = "41"` and
`Date Local` in `2020-09-*` (31,019 rows) → restrict to Multnomah/Washington/
Clackamas (4,795 rows) → re-serialise UTF-8. *No values are altered, rounded,
unit-converted, gap-filled, or averaged.*

**The event, verified independently from the raw file** (`SMOKE_FIELD_AUDIT.md` §2):

| Quantity | Value |
|---|---|
| Simulation window | 2020-09-07 00:00 → 2020-09-19 23:00 — **312 of 312 hourly slices present, zero gaps** |
| Peak, county hourly mean | **562.7 µg/m³ at 2020-09-12 20:00** ← *the value the model integrates* |
| Peak, single monitor | 588.9 µg/m³, site 2011, 2020-09-13 21:00 |
| Mean over window | 173.09 µg/m³ |
| Hours ≥ 55.5 µg/m³ | **194 of 312** |
| Full-window integral | 54,002.7 µg·m⁻³·h (model: 54,002.8 — **ratio 1.0000**) |

> **Two "peak" figures exist and must not be conflated.** 562.7 is the two-monitor
> hourly *mean*; 588.9 is the highest single-monitor hour.

**Primary-agency corroboration.** EPA's own AQS qualifier `IT` = *"Wildfire – U.S."*
is set on **1,576 rows**, spanning exactly 2020-09-07 → 2020-09-19 — the simulation
window to the day. This is EPA attesting the observations are wildfire-influenced.

**Instrument limitation.** All 7 monitors use method 771 (heated-inlet
nephelometry), POC 3 — one instrument type, no method diversity, no FRM
co-location, and the `Uncertainty` column is empty in all 4,795 rows. A heated
inlet volatilises semi-volatile organics, a large mass fraction of fresh wood
smoke, so **these readings likely understate true PM2.5 during the event**.

Daily maxima (Multnomah only), a validation observation rather than a model input:

| Date 2020 | Max hourly µg/m³ | Mean hourly µg/m³ |
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

### 3.2 D0 — Street centerlines (class M, provenance incomplete)

| Property | Value |
|---|---|
| Files | `Streets.shp` (17,035,988 B), `.dbf` (33,734,352 B), `.shx`, `.prj`, `.cpg` |
| SHA-256 (`.shp`) | `f5e5e311b625f129f94fcf6d3150f8feb521ea5a79039ade43514ebfb35810a8` |
| SHA-256 (`.dbf`) | `636B9CA18B0BF0C2…` |
| Source | Portland Metro RLIS street centerlines — inferred from the `PDX_F_NODE`/`PDX_T_NODE`, `LCITY`/`RCITY`, `CFCC`, `LEFTADD1` attribute schema |
| Retrieval date | ⚠️ **Unknown** — supplied with the inherited project as `Streets.zip`, predates version control |
| Licence | ⚠️ **Unverified for redistribution** |
| Features | 112,070 polylines; **0 features lacked node IDs** |
| Stored CRS | EPSG:3857 (Web Mercator, metres) |

This is the one dataset whose provenance is genuinely incomplete, and it is
labelled as such: **usable for modelling, not citable as provenanced data**.

**Transformations.** (1) Reproject EPSG:3857 → **EPSG:4326** at load via GeoTools
`ReprojectingFeatureCollection`; all in-model coordinates are lon/lat degrees.
(2) Each `MultiLineString` reduced to its first component. (3) Length **recomputed
geodesically** — the DBF `LENGTH` column is deliberately untrusted because its unit
is undocumented. (4) Undirected graph from `PDX_F_NODE`/`PDX_T_NODE`: **89,322 nodes
/ 112,070 edges**.

> **Why the `.dbf` is checksummed separately.** The routing graph is built from node-ID
> *attributes* stored in `Streets.dbf`, not from the geometry in `Streets.shp`. A
> modified `.dbf` with an unchanged `.shp` would silently change every route under
> an identical `data_version_tag`. This was a real gap, closed by the
> `source_integrity` block (§12.3).

### 3.3 D2b — Encampment locations (class M, used as a temporal proxy)

| Property | Value |
|---|---|
| File | `Geography/data/encampments/irp_campsite_reports_sample.csv` — 3,400 points |
| SHA-256 | `3e557de5db4668c5d30fd7a6fc13bcc38b5e37bab4b9becaf9b3dc35366285ca` |
| Source | City of Portland **IRP Campsite Reports** (Impact Reduction Program / One Point of Contact, via 311 and pdxreporter.org) |
| Endpoint | ArcGIS `COP_OpenData_Miscellaneous/MapServer/1396` |
| Retrieved | 2026-07-24 via `scripts/fetch-encampments.ps1` |
| Licence | City of Portland open data (public) |
| Temporal coverage | **2025-01-08 … 2026-07-23** |

⚠️ **The critical limitation, stated at runtime by the model itself.** The open feed
is a rolling recent window and retains **zero records for 2020**. These are real
reported Portland encampment locations, temporally displaced by five years, used as
a **spatial-distribution proxy**. `ContextCreator` prints this warning on every run:

```
[WARN] Encampment start locations are REAL City-of-Portland campsite reports but from
2025-2026 (the open-data feed retains no 2020 records); they are used as a spatial
proxy for the Sept 2020 distribution. See DATA_SOURCES D2b. Complaint-driven ->
visibility bias.
```

Second limitation: the reports are **complaint-driven**, so they are biased toward
visible, complained-about camps. This is not a census.

In the reported runs, residents occupy **2,981 distinct real campsite locations**.

### 3.4 D10 — Population count (class M)

| Property | Value |
|---|---|
| Source | **2025 Tri-County Point-in-Time Count**, PSU Homelessness Research & Action Collaborative, published 2025-11-04 |
| URL | `https://hsd.multco.us/wp-content/uploads/2025/11/2025-Tri-County-PITC-Report-11.04.25.pdf` · PDXScholar `hrac_pub/52` |
| Reported | 10,526 people experiencing homelessness in Multnomah County, **>65% unsheltered ⇒ ≈ 6,842** |
| Used as | `numAgents = 6842` |

**Why the unsheltered subset and not another denominator.** Two alternatives were
considered and rejected:
- **Total homeless (10,526)** — includes sheltered people, who are already indoors
  and do not walk.
- **HSD annual throughput (6,731)** — unique individuals served across a *year*;
  counts turnover, and those people were sheltered.

**The source's own caveat, which must travel with the number:** the PIT report
states that *changes in the approach to including administrative data substantially
augmented the 2025 unsheltered count*. Part of the reported 75% rise since 2023 is
methodological rather than real growth. **2019 → 2025 is not a clean time series and
must never be presented as one.**

This replaced the 2019 figure of 2,037 — a 3.4× correction. Retaining a 2019
denominator inside an otherwise present-day study was the vintage inconsistency
this project corrected everywhere else.

### 3.5 Demographic and health sources

| Attribute | Value used | Class | Source |
|---|---|---|---|
| Age bands 18-44 / 45-64 / 65+ | 0.527 / 0.423 / 0.050 | M | **Pathways Study 2026**, N=541, Multnomah County (PSU HRAC / OHSU), Table 2.1. Local and contemporaneous. |
| Sex male / female / other | 0.68432 / 0.29271 / 0.02297 | M | 2019 Multnomah PIT unsheltered; corroborated by HUD 2023 AHAR national unsheltered (68.2/30.1/0.9) |
| Mobility limitation (marginal) | 0.192 | M | 2019 Multnomah PIT: 391/2,037. **A LOWER BOUND** — asked only of survey completers, divided by the full population |
| Mobility age gradient | ×2.286 at 55+ (0.1522 / 0.3478) | A (donor-imputed) | **CASPEH 2023** (UCSF Benioff, n=3,198): 22% overall vs 32% at 50+. The *ratio* is borrowed; the local *marginal* is held exactly |
| Asthma | 0.15 | L | **Zellmer et al. 2025**, *J Gen Intern Med*, DOI `10.1007/s11606-025-09814-x` — EHR-diagnosed, n=20,139 adults with recent homelessness: 14.9% vs 7.1% housed |
| COPD | 0.105 | L | Same source: 10.5% vs 3.0% housed |
| Chronic physical condition | 0.391 | M | Pathways 2026 (local) |

**Why not ACS / BRFSS / NHIS for asthma and COPD.** Their housing-unit sampling
frames structurally exclude unsheltered people. Zellmer is an EHR-based study of
the actual population of interest. It is, however, **Minnesota data imported to
Oregon** — a named limitation (§17, L8).

**Why asthma and COPD are sampled independently of age.** This is evidence-based,
not convenience: Brown et al. 2017 (*The Gerontologist*, DOI
`10.1093/geront/gnw011`, n=350 homeless adults 50+) reports asthma-or-COPD at
26.3%, essentially equal to CASPEH's 25% across all ages. No material age gradient
exists to model.

**Uncertainty ranges carried.** Asthma 0.15–0.24 (EHR-diagnosed undercounts the
never-diagnosed; self-report — Lewer 2019, *BMJ Open*, DOI
`10.1136/bmjopen-2018-025192`, n=1,336 — overcounts at 18.3%; the two biases
bracket the truth). COPD 0.04–0.14.

### 3.6 Behavioural source — the awareness figure

PSU, *Stories from the Outside* (n=73): **65% of surveyed unsheltered residents had
never heard of the clean-air shelters**. This is the one sourced behavioural
parameter in the project, and it is **not implemented** — the model assumes
universal awareness (assumption A-12, blocking). Its consequence is stated
directly: every "got inside" figure is an **upper bound**.

---

## 4. How the shelter inventory was built

This is the part of the data work with the longest audit trail, because the county
publishes its shelter list in **five incompatible units**.

### 4.1 Sources

| Source | URL | What it gave |
|---|---|---|
| Multnomah County HSD *List of Shelters*, stamped "updated July 2026" | `https://hsd.multco.us/emergency-shelters/list-of-shelters/` | 48 inventory rows: name, address, facility type, capacity + unit, provider, population served |
| HSD *Day Centers* | `https://hsd.multco.us/emergency-shelters/day-centers/` | 10–11 day centres, **no capacity published for any** |
| HSD data dashboard | `https://hsd.multco.us/data-dashboard/` | ⚠️ Unusable — figures behind a Tableau embed with no static series |
| portland.gov Safe Rest Villages | `https://www.portland.gov/united/saferestvillages` | City village addresses |
| Commissioner Ryan announcement, 2022-03-03 | `https://www.portland.gov/ryan/news/2022/3/3/…` | Village siting |
| Street Roots, 2022-03-09 | `https://www.streetroots.org/housing/2022/03/09/srvs-sited/` | Village siting corroboration |

### 4.2 The unit-conversion method

*"Do not assume every listed number is beds"* — the official list mixes five units.
The rule applied: **never convert an ambiguous unit to a single number.**

| Unit as published | Count | People per unit | Basis |
|---|---|---|---|
| **Beds** ("88 congregate beds") | 1,066 | **1.0** exact | A bed is one sleeping place for one person. |
| **Motel rooms** (adults) | 341 | **1.0 – 1.5** | Listings state "individuals *and couples*", so occupancy ≥1 and ≤2. |
| **Village units / pods** | 205 | **1.0 – 1.2** | Predominantly single-occupancy; one site lists "men, women, couples". |
| **Family units** ("28 families") | 85 | **2.5 – 4.0** | A household, not a person. No local sheltered-family size published. **The weakest conversion in the table.** |
| **Unstated** (youth "30") | 60 | **1.0** | Unit not stated; treated as people — the most conservative reading, since it cannot inflate the total. |

Point multipliers actually applied in the build: **beds ×1.0, motel rooms ×1.25,
village units ×1.1, family rooms ×3.25** — midpoints of the published ranges. Every
row records its own audit trail in a `capacity_basis` column, e.g.
`58_rooms_x1.25_per_SHELTER_CAPACITY_AUDIT_s2`.

**County-wide converted total:**

| Category | Published | People (low) | People (high) |
|---|---|---|---|
| Congregate beds | 1,015 beds | 1,015 | 1,015 |
| Village pods stated as beds | 18 beds | 18 | 18 |
| Behavioral Health Resource Center | 33 beds | 33 | 33 |
| Motel rooms (adults) | 341 rooms | 341 | 512 |
| Village sleeping units / pods | 205 units | 205 | 246 |
| Family units and rooms | 85 families | 213 | 340 |
| Youth (unit unstated) | 60 | 60 | 60 |
| **Total** | | **≈ 1,885** | **≈ 2,224** |

> **Defensible statement:** Multnomah County's entire year-round emergency shelter
> system in July 2026 provides indoor space for roughly **1,900–2,200 people**.

Caveats that travel with it: it is July 2026, not 2020; several listed sites have
announced 2026 closures so the forward figure is lower; it counts *year-round*
shelter, which is not interchangeable with smoke-respite capacity; and the family
conversion drives the ±170-person spread.

### 4.3 Geocoding — how each coordinate was obtained

**Design decision, recorded verbatim in `scripts/geocode_shelters.py`:**

> *"I did NOT put coordinates in shelters_multnomah_2026.csv on purpose. Guessing
> lat/lon from an address is exactly the kind of plausible-looking fabrication that
> has already cost you once in this project."*

The raw inventory file is deliberately **coordinate-free**. Coordinates enter only
through a geocoder, and each row records which one and at what confidence.

| Facility group | Geocoder | `coord_source` value |
|---|---|---|
| Base 29 HSD facilities | OpenStreetMap **Nominatim** | `nominatim_osm_from_hsd_2026_address` |
| 7 recovered City villages + Doreen's Place | Nominatim | `nominatim_osm_from_recovered_city_address` |
| (2020 file, for reference) OCC + Mount Scott | **US Census** geocoder `Public_AR_Current` | — |
| (2020 file) Charles Jordan | **Esri World** geocoder, score 99.52, cross-checked against Wikipedia (agree to ~15 m) | — |

Implementation safeguards in both geocoding scripts:
- Identifying User-Agent (*"Nominatim requires a real identifying User-Agent… they
  will block a generic one"*), `time.sleep(1.1)` rate limit (*"do not remove"*).
- Two-attempt query ladder: full `"{address}, {city}, {state}, {country}"`, then a
  looser retry.
- **A Multnomah bounding box** `LAT 45.42–45.65, LON −122.95 to −122.35` — with the
  comment *"A geocoder that silently returns the centroid of another state must not
  enter the dataset."*
- On-disk cache so results are inspectable after the fact.

### 4.4 The hundred-block trick

Two City villages publish only an intersection or a block, and Nominatim refuses
`&`-style intersection queries. Verbatim from `scripts/add_missing_shelters_2026.py`:

```python
# Published only as "122nd & E Burnside" and "the 106th block of SE Reedway".
# Nominatim will not resolve an "&" intersection query, so these are geocoded
# to the corresponding hundred-block address instead. That is an approximation
# of a few hundred metres and the coord_confidence column says so.
```

| Site | Published as | Query actually sent | Result | `coord_confidence` |
|---|---|---|---|---|
| Menlo Park SRV | `NE 122nd Ave & E Burnside St` | **`12200 E Burnside St, Portland, OR`** | −122.537593, 45.522410 | `geocoded_intersection_approximated_to_block` |
| Reedway SRV | `SE 106th Ave & SE Reedway St` | **`10600 SE Reedway St, Portland, OR`** | −122.606664, 45.481822 | `geocoded_block_level` |
| Queer Affinity Village | `2300 block SW Naito` | `2300 SW Naito Pkwy, Portland, OR` | −122.677686, 45.506081 | `geocoded_block_level` |

The geocode cache preserves the failures: `"NE 122nd Ave & E Burnside St, …": null`
and `"SE 106th Ave & SE Reedway St, …": null`. Only **3 of 36** rows carry
non-street-address confidence.

Doreen's Place (90 beds, 610 NW Broadway) initially failed and was recovered by
shortening the query to `610 NW Broadway` — a solvable geocoding failure, not
missing data.

### 4.5 Reconciliation: from 29 modelled facilities to 36

| | Facilities | People-capacity |
|---|---|---|
| Previously modelled | 29 | 1,816 |
| + six locatable City villages | 35 | ≈2,114 |
| + Doreen's Place | 36 | ≈2,204 |
| **Executed inventory** | **36** | **2,234** |
| Still missing | — | ≈207 |

Modelled capacity had been roughly **18% low**.

### 4.6 What remains excluded, and why

| Excluded | Size | Reason |
|---|---|---|
| **Clinton Triangle** | 160 units | **No published street address.** The largest single site in the inventory; Urban Alchemy-managed. |
| **Multnomah Safe Rest Village** | 28 units | No published street address; Urban Alchemy-managed. |
| Combined | ≈207 people | Real capacity is ~207 people higher than modelled. |
| **10–11 day centres** | capacity unpublished | No capacity figure is published for any of them, so including them would require inventing a number. |

The day-centre exclusion carries a scientific point that cuts **against** the
project's own framing and is stated anyway:

> During a *daytime* smoke episode, day centres are arguably the most relevant
> clean-air spaces available. Their absence understates daytime shelter
> availability. **That is a named limitation, not a silent omission.**

### 4.7 The capacity audit's negative result

The July 2026 HSD list was checked against the September 2020 clean-air
activations to see whether it could confirm the historical 198-bed figure. It
cannot: the 2026 list is a **year-round shelter system**, different in time,
purpose and function from a smoke activation. **Assumption A-04 therefore remains
blocking.** A negative audit result is reported as a result.

### 4.8 The file the model actually loads

`ContextCreator.java:84`:

```java
private static final String SHELTERS_A_CSV = "data/shelters/shelters_2026_current_placement.csv";
```

Header (21 columns):

```
shelter_id,name,address,city,state,zip,lon,lat,capacity,capacity_basis,opened,closed,
status,coord_source,coord_confidence,facility_type,provider,closure_date,
priority_vulnerable,raw_capacity,raw_unit
```

Sample rows, verbatim:

```
Arbor_Lodge_Shelter,Arbor Lodge Shelter,1952 N Lombard St,Portland,OR,,-122.686753,45.576626,88,88_beds_x1.0_per_SHELTER_CAPACITY_AUDIT_s2,2020-09-07,2020-09-19,operating,nominatim_osm_from_hsd_2026_address,geocoded_street_address,congregate,Do Good Multnomah,,0,88,beds
Bybee_Lakes_Hope_Center,Bybee Lakes Hope Center,14355 N Bybee Lake Ct,Portland,OR,,-122.757778,45.626297,175,175_beds_x1.0_per_SHELTER_CAPACITY_AUDIT_s2,2020-09-07,2020-09-19,operating,nominatim_osm_from_hsd_2026_address,geocoded_street_address,congregate,Helping Hands Reentry,,0,175,beds
Clark_Center,Clark Center,1431 SE Martin Luther King Jr Blvd,Portland,OR,,-122.661942,45.512502,90,90_beds_x1.0_per_SHELTER_CAPACITY_AUDIT_s2,2020-09-07,2020-09-19,operating,nominatim_osm_from_hsd_2026_address,geocoded_street_address,congregate,Transition Projects,,0,90,beds
```

Independently verified: **36 data rows summing to exactly 2,234 capacity.**

---

## 5. How the agents were made

### 5.1 The RNG rule that protects the baseline

This is the single most important engineering constraint in the population layer.

Repast's `@ScheduledMethod` defaults to `RANDOM_PRIORITY` with shuffle, and the
agent step order draws from **the same default RNG stream as encampment
placement**. Any new draw on the default stream would rewrite the entire
population — silently, and identically-looking. The sampler therefore uses its own
stream:

**`PopulationSampler.java:251`**

```java
	/**
	 * @param seed the run's random seed; the attribute stream is derived from it
	 *             deterministically but kept separate from Repast's default
	 *             stream (see class doc).
	 */
	public PopulationSampler(long seed) {
		this.rng = new Random(seed * 1000003L + 17L);
	}

	/** Samples one resident. Call order defines the population for a given seed. */
	public Attributes sample() {
		AgeBand band = AGE_BANDS[pick(AGE_WEIGHTS)];
		// Age uniform within the published band (01-POPULATION.md §3.2 Option A:
		// "sample age uniformly within published bands; zero invented structure").
		// A fitted continuous distribution was considered and REJECTED — nothing
		// constrains the within-band shape, so a curve would manufacture precision.
		int ageYears = band.lowInclusive + rng.nextInt(band.highExclusive - band.lowInclusive);

		Sex sex = SEXES[pick(SEX_WEIGHTS)];

		boolean mobilityLimited =
				rng.nextDouble() < (ageYears >= 55 ? MOBILITY_P_55_PLUS : MOBILITY_P_UNDER_55);
		MobilityCategory mobilityCategory = mobilityLimited
				? MobilityCategory.AMBULANT_NO_AID : MobilityCategory.UNIMPAIRED;

		boolean asthma = rng.nextDouble() < P_ASTHMA;
		boolean copd = rng.nextDouble() < P_COPD;
		boolean chronicPhysical = rng.nextDouble() < P_CHRONIC_PHYSICAL;
```

**Verified consequence:** adding the entire heterogeneity layer left the archived
baseline **byte-identical**.

Note the rejected alternative in the comment. Age is sampled *uniformly within
published bands* because nothing constrains the within-band shape; fitting a smooth
curve would have manufactured precision that no source supports.

**`PopulationSampler.java:54`** — the age weights and their citation:

```java
	private static final AgeBand[] AGE_BANDS = AgeBand.values();
	/** Pathways Study 2026 (N = 541, Multnomah County, PSU HRAC / OHSU), Table 2.1:
	 *  18-24 6.3% + 25-34 20.3% + 35-44 26.1% = 52.7%; 45-54 25.3% + 55-64 17.0%
	 *  = 42.3%; 65+ 5.0%. Adults only — the survey does not cover minors.
	 *  <b>Supersedes the 2019 PIT bands</b> for the present-day study: Pathways is
	 *  local, current, and contemporaneous with the 2026 shelter network. */
	private static final double[] AGE_WEIGHTS = { 0.527, 0.423, 0.050 };
```

### 5.2 Walking speed — the one attribute that changes outcomes

Walking speed is where demography becomes access. Everything else in the resident
record is a reporting stratum.

**`PopulationSampler.java:280`**

```java
		double speed;
		if (mobilityLimited) {
			// Boyce's impaired categories already embed a slower, less able
			// walker, so the COPD decrement is NOT stacked on top of them —
			// same no-double-counting rule that makes mobility a replacement
			// rather than a multiplier (03-MOVEMENT.md §3).
			speed = truncatedNormal(IMPAIRED_SPEED_MEAN, IMPAIRED_SPEED_SD);
		} else {
			double mu = freeSpeedMean(ageYears, sex);
			if (copd) {
				mu = Math.max(SPEED_MIN_MPS, mu + COPD_SPEED_DELTA_MPS);
			}
			speed = truncatedNormal(mu, SPEED_CV * mu);
		}
```

Three deliberate design rules are visible in eleven lines:
1. Mobility limitation **replaces** the age×sex speed rather than multiplying it.
2. The COPD decrement is **not stacked** on the impaired speed — no double-counting.
3. The decrement is **additive** in m/s, matching how the source reports it.

**`PopulationSampler.java:316`** — the mean table lookup and truncation:

```java
	private static double freeSpeedMean(int ageYears, Sex sex) {
		int row = Math.max(0, Math.min(6, (ageYears / 10) - 2));
		switch (sex) {
			case MALE:   return SPEED_MEAN_MEN[row];
			case FEMALE: return SPEED_MEAN_WOMEN[row];
			default:     return 0.5 * (SPEED_MEAN_MEN[row] + SPEED_MEAN_WOMEN[row]);
		}
	}

	/** Normal(mean, sd) resampled until inside the [0.40, 2.20] m/s guard. */
	private double truncatedNormal(double mean, double sd) {
		for (int attempt = 0; attempt < 100; attempt++) {
			double v = mean + sd * rng.nextGaussian();
			if (v >= SPEED_MIN_MPS && v <= SPEED_MAX_MPS) {
				return v;
			}
		}
		// Unreachable for the parameter values above; clamp rather than loop forever.
		return Math.max(SPEED_MIN_MPS, Math.min(SPEED_MAX_MPS, mean));
	}
```

**`PopulationSampler.java:154` and `:175`/`:200`** — every literal, with its source:

```java
	private static final double[] SPEED_MEAN_MEN =
			{ 1.358, 1.433, 1.434, 1.433, 1.339, 1.262, 0.968 };
	private static final double[] SPEED_MEAN_WOMEN =
			{ 1.341, 1.337, 1.390, 1.313, 1.241, 1.132, 0.943 };

	private static final double IMPAIRED_SPEED_MEAN = 0.95;
	private static final double IMPAIRED_SPEED_SD   = 0.32;
	private static final double SPEED_CV = 0.13;
	private static final double SPEED_MIN_MPS = 0.40;
	private static final double SPEED_MAX_MPS = 2.20;
	private static final double COPD_SPEED_DELTA_MPS = -0.19;
```

| Parameter | Value | Class | Source |
|---|---|---|---|
| Age×sex mean gait speed (7 decade rows × 2 sexes) | table above | L | **Bohannon & Williams Andrews 2011**, *Physiotherapy* 97(3):182–189, DOI `10.1016/j.physio.2010.12.004` — meta-analysis, 41 studies, **n = 23,111** |
| Within-population CV | 0.13 | L | **Bohannon 1997**, *Age and Ageing* 26(1):15–19, DOI `10.1093/ageing/26.1.15` |
| Mobility-impaired speed | N(0.95, 0.32) m/s | L (verified-in-secondary) | **Boyce, Shields & Silcock 1999**, *Fire Technology* 35(1):51–67, DOI `10.1023/A:1015339216366`, via Tinaburri 2018 |
| COPD decrement | **−0.19 m/s** | L | **Buekers et al. 2024**, *European Respiratory Review* 33(172):230253, DOI `10.1183/16000617.0253-2023`, PMID 38657998 — 25 studies, 1,015 COPD vs 2,229 controls, usual gait speed **−19 cm/s (95% CI −28 to −11)**. Authors rate the evidence **LOW** |
| Speed guard | [0.40, 2.20] m/s | A | numerical guard |

**The methodological trap that was avoided.** The SD is taken from Bohannon 1997's
within-population CV, **never** derived from the 2011 meta-analysis's confidence
intervals. Those CIs are *between-study* intervals; using them would understate the
true spread of individual walking speeds by 3–5×.

**Why asthma gets no speed effect.** This is a searched-for negative result, not an
oversight. Registered as assumption **A-23**:

> The literature supports lower total, moderate and vigorous physical *activity*
> among adults with asthma, but **no verified quantitative comfortable-gait-speed
> decrement was found**. Borrowing the COPD estimate for asthma would be an
> invention. The asymmetry between the two conditions in the results is therefore a
> consequence of evidence availability, not of a modelling preference.

That asymmetry then **shows up in the results** (§14) as asthma having essentially
no access penalty while COPD does — which is the correct behaviour of an honest
model, and is reported as a finding.

### 5.3 Realised vs target marginals (seed 42)

The sampler's console output on every run:

```
[Population] heterogeneity ON - realised: mobility 0.195 | asthma 0.147 | COPD 0.104 |
             any respiratory 0.235 | age 55+ 0.259 | mean walking speed 1.280 m/s
[Population] targets: mobility 0.192 (PIT 2019, lower bound) | asthma 0.150 (Zellmer 2025) |
             COPD 0.105 (Zellmer 2025) | any respiratory 0.239 (independent draws) |
             chronic physical 0.391 (Pathways 2026, local) | age bands 0.527/0.423/0.050
```

| Attribute | Target | Realised | Source |
|---|---|---|---|
| Age 18-44 / 45-64 / 65+ | 52.7 / 42.3 / 5.0% | **52.8 / 42.0 / 5.2%** | Pathways 2026 |
| Male / Female / other | 68.4 / 29.3 / 2.3% | **68.6 / 29.2 / 2.2%** | 2019 PIT |
| Mobility limitation | 19.2% | **19.9%** | 2019 PIT (lower bound) |
| Asthma | 15.0% | **14.8%** | Zellmer 2025 |
| COPD | 10.5% | **10.8%** | Zellmer 2025 |
| Chronic physical condition | 39.1% | **39.6%** | Pathways 2026 |

---

## 6. The street network and routing

### 6.1 The graph

89,322 nodes / 112,070 edges, built from the `PDX_F_NODE`/`PDX_T_NODE` attributes.
**Undirected** — pedestrians are not bound by one-way vehicle restrictions
(assumption A-06, classified *literature* rather than *assumption* because it is
standard practice).

Edge weights are **geodesic polyline lengths on the WGS84 ellipsoid**, not planar
distances and not the DBF's undocumented `LENGTH` column.

**`StreetNetwork.java:214`**

```java
	/** Geodesic (WGS84 ellipsoid) distance in metres between two lon/lat coordinates. */
	public static double geodesicDistanceM(Coordinate a, Coordinate b) {
		return Geodesic.WGS84.Inverse(a.y, a.x, b.y, b.x).s12;
	}

	/** Geodesic length in metres of a lon/lat polyline. */
	public static double polylineLengthM(Coordinate[] coords) {
		double total = 0;
		for (int i = 1; i < coords.length; i++) {
			total += geodesicDistanceM(coords[i - 1], coords[i]);
		}
		return total;
	}
```

Geodesy: **Karney 2013**, *Journal of Geodesy* 87(1):43–55, DOI
`10.1007/s00190-012-0578-z`.

### 6.2 The wormhole defect — a real bug, found and fixed

This is the most consequential defect discovered in the project, and it is
documented because a reader must know it existed to trust the corrected numbers.

**The symptom.** 27 node IDs (a contiguous block, 55 features: unnamed road stubs,
I-5 ramps, SE Harney, SE Lambert, SE 82nd, NW Skyline) were claimed by different
features' `PDX_F_NODE`/`PDX_T_NODE` attributes at locations **9–18.5 km apart**.

**The diagnosis.** `Streets.shp` has **zero multi-part features** — so this was not
a geometry problem. It was a pure **attribute defect** in the DBF.

**The effect.** Those edges weighed *metres* but spanned *kilometres*. Dijkstra
under-costed them, so agents routed through them and then physically walked the gap
in a straight line. 22 of 50 agents (and 48 of 100 in a larger check) had inflated
journeys: travel ×15, dose ×3, with discrete distance surpluses clustering at
1.7 / 9.2 / 17.3 / 24.5 / 40.8 / 65 km. Shelter *choice* could be wrong, not just
shelter distance.

**The fix — validate, correct, and record; delete nothing.**

**`StreetNetwork.java:286`**

```java
		// Pass 2 -- every ADDITIONAL site of an ID is a corrupt-attribute
		// symptom: correct it (reattach by geometry, else split), with provenance.
		for (List<NodeSite> sites : sitesByAttrId.values()) {
			if (sites.size() == 1) {
				continue;
			}
			report.affectedAttrIds++;
			NodeSite primary = sites.get(0);
			for (int i = 1; i < sites.size(); i++) {
				NodeSite s = sites.get(i);
				s.distFromPrimaryM = geodesicDistanceM(s.anchor, primary.anchor);
				NodeSite near = (NodeSite) primaryIndex.nearestNeighbour(
						new Envelope(s.anchor), s, CENTRE_DISTANCE);
				if (near != null && geodesicDistanceM(s.anchor, near.anchor) <= REATTACH_TOLERANCE_M) {
					s.graphId = near.graphId;
					s.reattached = true;
					report.reattachedSites++;
					report.corrections.add(new Correction("REATTACHED", s));
				} else {
					s.graphId = nextSyntheticId--;
					report.splitSites++;
					report.corrections.add(new Correction("SPLIT", s));
				}
			}
		}
```

**`StreetNetwork.java:71`** — the two tolerances that define the regimes:

```java
	public static final double NODE_SITE_TOLERANCE_M = 100.0;
	public static final double REATTACH_TOLERANCE_M = 10.0;
	public static final double IMPOSSIBLE_EDGE_SLACK_M =
			2 * NODE_SITE_TOLERANCE_M + 2 * REATTACH_TOLERANCE_M;
```

The 100 m threshold is justified by an empty band in the data: legitimate endpoint
scatter is **sub-metre**, and the smallest corrupt displacement observed is
**~1.65 km**. Any threshold between those two regimes gives the same graph
(assumption A-14, with that sweep as its sensitivity plan).

**Results of the fix** (`docs/validation/STREET_NETWORK_VALIDATION.md`):

| Metric | Before | After |
|---|---|---|
| Impossible edges | 50 | **0** |
| Max endpoint gap | 18.5 km | **11.9 m** |
| Graph components | 154 / 60,444 | **unchanged** |
| Success rates | — | unchanged |
| Seed-42 max travel | 875 min / 68.3 km | 212 min / 16.5 km |
| Person-hours > Unhealthy | 326 / 294 | 259 / 137 |
| Sites reattached ≤10 m | — | 4 |
| Sites split to synthetic negative IDs | — | 23 |

Nothing was deleted. Every correction is written to `simulation.json` under
`street_network_validation`, so a reader can see exactly which nodes were touched.

**Independent validation.** `scripts/test_routing.py` reimplements Dijkstra in
Python and reproduces the Java distances **exactly** (tests T1–T5), confirms
realised speeds of 1.300–1.376 m/s sit inside the Bohannon bounds, and explains the
one residual flag (a 213 m encampment snap leg). All pass.

### 6.3 Dijkstra, one tree per shelter

**`StreetNetwork.java:435`**

```java
	/** Dijkstra from the given source over the whole reachable component. */
	public ShortestPathTree computeTree(long sourceNode) {
		ShortestPathTree tree = new ShortestPathTree(sourceNode);
		// PQ entries: {distance, node}; stale entries skipped on poll.
		PriorityQueue<double[]> queue = new PriorityQueue<double[]>(
				64, (a, b) -> Double.compare(a[0], b[0]));

		tree.distM.put(sourceNode, 0.0);
		queue.add(new double[] { 0.0, sourceNode });

		while (!queue.isEmpty()) {
			double[] head = queue.poll();
			double d = head[0];
			long node = (long) head[1];
			Double best = tree.distM.get(node);
			if (best != null && d > best.doubleValue()) {
				continue; // stale queue entry
			}
			List<Edge> edges = adjacency.get(node);
			if (edges == null) {
				continue;
			}
			for (Edge e : edges) {
				double nd = d + e.lengthM;
				Double old = tree.distM.get(e.toNode);
				if (old == null || nd < old.doubleValue()) {
					tree.distM.put(e.toNode, nd);
					tree.predecessorEdge.put(e.toNode, e);
					queue.add(new double[] { nd, e.toNode });
				}
			}
		}
		return tree;
	}
```

Algorithm: **Dijkstra 1959**, *Numerische Mathematik* 1(1):269–271, DOI
`10.1007/BF01386390`.

**Why one tree per shelter rather than one per agent.** The graph is undirected, so
distance(shelter → agent) = distance(agent → shelter). Building 36–46 trees once at
setup makes every subsequent "how far is this agent from that shelter?" query an
**O(1) hash lookup**. With 6,842 agents re-evaluating choices over 18,720 ticks,
per-agent search would be computationally impossible; this is what makes a full
312-hour run take about 40 seconds.

**`ContextCreator.java:242`** — tree construction:

```java
			Coordinate c = new Coordinate(lon, lat);
			geography.move(shelter, fac.createPoint(c));
			long nodeId = network.nearestNode(c);
			shelter.setGraphNodeId(nodeId);
			shelter.setRouteTree(network.computeTree(nodeId));
```

**`StreetNetwork.java:406`** — STRtree snapping, with its own honest caveat:

```java
	/**
	 * Nearest graph node to a lon/lat coordinate. Candidate ranking uses
	 * planar degree distance (adequate for snapping at street scale; the
	 * anisotropy at 45.5 N only matters between near-equidistant nodes).
	 */
	public long nearestNode(Coordinate c) {
		if (!indexBuilt) {
			throw new IllegalStateException("buildIndex() must be called before nearestNode()");
		}
		Object hit = nodeIndex.nearestNeighbour(new Envelope(c), Long.valueOf(-1L), CENTRE_DISTANCE);
		return ((Long) hit).longValue();
	}
```

### 6.4 Movement — exact arc-length, never straight-line

**`GisAgent.java:276`**

```java
		GeometryFactory fac = new GeometryFactory();
		Point myPoint = (Point) geography.getGeometry(this);
		Coordinate current = myPoint.getCoordinate();

		double stepLengthM = walkingSpeedMps * 60.0 * minutesPerTick;
		double remainingM = stepLengthM;
		while (remainingM > 0 && pathIndex < routePath.size()) {
			Coordinate next = routePath.get(pathIndex);
			double dM = StreetNetwork.geodesicDistanceM(current, next);
			if (dM <= remainingM) {
				current = next;
				pathIndex++;
				remainingM -= dM;
			} else {
				GeodesicData toNext = Geodesic.WGS84.Inverse(current.y, current.x, next.y, next.x);
				GeodesicData moved = Geodesic.WGS84.Direct(current.y, current.x, toNext.azi1, remainingM);
				current = new Coordinate(moved.lon2, moved.lat2);
				remainingM = 0;
			}
		}
		distanceTraveledM += stepLengthM - remainingM;
		geography.move(this, fac.createPoint(current));
```

Each tick the resident receives a budget of `speed × 60 × minutesPerTick` metres,
consumes whole polyline segments while they fit, then finishes the remainder with a
GeographicLib **direct** solve along the segment's initial azimuth. Movement follows
the routed street polyline at exact geodesic arc length. `distanceTraveledM`
accumulates only metres actually consumed, so a resident that reaches its
destination mid-tick is not credited with the unused budget.

**Why `minutesPerTick = 1.0`.** At 1.30 m/s a tick advances ≈78 m, below typical
street-segment length — so an agent cannot overshoot a segment endpoint and skip a
turn.

---

## 7. The environment: the smoke field

### 7.1 Construction

**`SmokeField.java:46`**

```java
		// Accumulate mean concentration per (date, hour) across all in-county
		// monitors and POCs. Keyed by hour-of-event so gaps are explicit.
		TreeMap<Integer, double[]> sumCount = new TreeMap<Integer, double[]>(); // hourIndex -> {sum,count}
		int maxHour = -1;

		List<Map<String, String>> rows = CsvLoader.read(csvPath);
		for (Map<String, String> row : rows) {
			if (!county.equalsIgnoreCase(row.get("County Name"))) {
				continue;
			}
			String dateStr = row.get("Date Local");   // yyyy-MM-dd
			String timeStr = row.get("Time Local");    // HH:mm
			String valStr = row.get("Sample Measurement");
			if (dateStr == null || timeStr == null || valStr == null || valStr.isEmpty()) {
				continue;
			}
			double val;
			try {
				val = Double.parseDouble(valStr);
			} catch (NumberFormatException e) {
				continue;
			}
			LocalDateTime obs = LocalDateTime.of(
					LocalDate.parse(dateStr),
					LocalTime.parse(timeStr.length() == 5 ? timeStr : timeStr.substring(0, 5)));
			int hourIndex = (int) ChronoUnit.HOURS.between(startDateTime, obs);
			if (hourIndex < 0) {
				continue; // before the simulation start
			}
			double[] sc = sumCount.get(hourIndex);
			if (sc == null) {
				sc = new double[] { 0, 0 };
				sumCount.put(hourIndex, sc);
			}
			sc[0] += val;
			sc[1] += 1;
```

### 7.2 Missing data is never silently zero

**`SmokeField.java:88` and `:110`**

```java
		hourlyUgM3 = new double[maxHour + 1];
		for (int h = 0; h <= maxHour; h++) {
			double[] sc = sumCount.get(h);
			// Missing hours remain Double.NaN so a gap is never silently zero
			// (VALIDATION_STRATEGY §5). Callers treat NaN as "no data".
			hourlyUgM3[h] = (sc == null || sc[1] == 0) ? Double.NaN : sc[0] / sc[1];
		}
```

```java
	public double concentrationForTick(double tick, double minutesPerTick) {
		int hourIndex = (int) Math.floor((tick * minutesPerTick) / 60.0);
		double c = concentrationAtHour(hourIndex);
		if (Double.isNaN(c)) {
			outOfRangeLookups++;
			return 0.0;
		}
		return c;
	}

	/** Local wall-clock time corresponding to a schedule tick (V13 anchor). */
	public LocalDateTime timeForTick(double tick, double minutesPerTick) {
		return startDateTime.plusMinutes((long) (tick * minutesPerTick));
	}
```

`outOfRangeLookups` is exported in `simulation.json` and **must be 0 for a clean
run**. In all 27 reported runs it is 0 — the 312-hour window has no gaps.

### 7.3 Why the field is spatially uniform (assumption A-01)

Only **two regulatory monitors sit inside Multnomah County**. Any spatial
interpolant would be fitting two points and manufacturing gradients the data cannot
support. The sensitivity plan is written and unexecuted: compare against
inverse-distance weighting over all seven tri-county monitors, adopting it *only*
if it beats the uniform field in leave-one-out cross-validation.

**Consequence for the results.** Because concentration is uniform in space,
placement cannot help by moving people into cleaner air — it can only help by
reducing *time outdoors*. This makes the causal story unusually clean: the entire
placement effect is a travel-time effect.

---

## 8. The decision model

### 8.1 State machine

**`GisAgent.java:90`**

```java
	/** Outcome state (docs/science/DESIGN_SPEC.md Decision 3). */
	public enum State {
		PRE_EVAC,          // sheltering in place at the encampment, awaiting the smoke trigger
		EN_ROUTE,          // walking toward a shelter
		SHELTERED,         // admitted; remains for the rest of the run
		UNREACHABLE,       // no shelter reachable on the street graph
		REFUSED_ALL_FULL   // every reachable operating shelter was at capacity
	}
```

```
                    PM2.5 ≥ 55.5 AND a shelter is open
      PRE_EVAC ──────────────────────────────────────────▶ EN_ROUTE
         │                                                    │
         │ (below threshold, or nothing open:                 ├──▶ SHELTERED   (admit() succeeded — terminal)
         │  stays outdoors, exposure accrues)                 │
         │                                                    ├──▶ UNREACHABLE (no shelter reachable on the graph)
         │                                                    │
         │                                                    └──▶ REFUSED_ALL_FULL
         │                                                              │
         └──────────────────────────────────────────────────────────────┘
                    re-evaluated EVERY tick: if capacity or a new
                    opening appears, returns to EN_ROUTE
```

Exposure accrues in **every state except `SHELTERED`**. Arrival at a shelter is the
study endpoint.

### 8.2 The tick loop

**`GisAgent.java:173`**

```java
	@ScheduledMethod(start = 1, interval = 1)
	public void step() {
		Context context = ContextUtils.getContext(this);
		Geography geography = (Geography) context.getProjection("Geography");

		Parameters params = RunEnvironment.getInstance().getParameters();
		double minutesPerTick = (Double) params.getValue("minutesPerTick");
		// Per-agent speed when heterogeneity is enabled (V10 revised: Bohannon &
		// Williams Andrews 2011 age×sex means, or Boyce 1999 by replacement for
		// mobility-limited residents); otherwise the run-wide constant.
		double walkingSpeedMps = (attributes != null)
				? attributes.walkingSpeedMps
				: (Double) params.getValue("walkingSpeedMps");
		double tick = RunEnvironment.getInstance().getCurrentSchedule().getTickCount();
		double dtHours = minutesPerTick / 60.0;
```

**`GisAgent.java:249`** — the state-machine spine:

```java
		if (state == State.REFUSED_ALL_FULL) {
			if (!anyShelterAvailable(context, tick)) {
				return; // still nowhere to go; keeps accruing exposure outdoors
			}
			state = State.EN_ROUTE;
			retargetCount = 0;
			targetShelter = null;
			routePath = null;
			pathIndex = 0;
		}

		if (state != State.EN_ROUTE) {
			return; // terminal states persist in place (still accruing if outside)
		}

		// --- Routing (capacity-aware) ---------------------------------------
		if (routePath == null) {
			chooseNetworkNearestShelter(context, tick);
			if (routePath == null) {
				// state was set by chooseNetworkNearestShelter (UNREACHABLE or
				// REFUSED_ALL_FULL); the agent persists and keeps accruing.
				return;
			}
			Point here = (Point) geography.getGeometry(this);
			snapGapM += StreetNetwork.geodesicDistanceM(here.getCoordinate(), routePath.get(0));
		}
```

Note `snapGapM`: the off-network metres between where a resident actually stands and
the first routed waypoint. This exists because a few encampments sit 200–500 m from
any mapped street. It is exported per agent so the gap is auditable rather than
hidden inside the distance total.

### 8.3 Evacuation: a conjunctive trigger

**`GisAgent.java:217`**

```java
		// PRE_EVAC: shelter in place at the encampment, accruing outdoor
		// exposure, until local PM2.5 crosses the evacuation threshold (default
		// the EPA "Unhealthy" AQI breakpoint 55.5 µg/m³ — a sourced value,
		// DATA_SOURCES D9), then begin evacuating. This ties evacuation to the
		// smoke event rather than assuming everyone leaves at t0 (AUDIT.md #1).
		if (state == State.PRE_EVAC) {
			double evacThreshold = (Double) params.getValue("evacuationThresholdUgM3");
			double cNow = (smokeField == null) ? 0.0
					: smokeField.concentrationForTick(tick, minutesPerTick);
			// Departure requires BOTH the smoke trigger and somewhere open to walk
			// to. With the opening-date gate enabled this is the A-02 mitigation:
			// the real shelters opened on Sept 10-11, days after the first
			// threshold crossing, so residents cannot arrive before a door exists
			// to arrive at. With the gate disabled every shelter is open from tick
			// 0 and this reduces to the previous smoke-only trigger.
			if (cNow >= evacThreshold && anyShelterOpen(context, tick)) {
				state = State.EN_ROUTE;
				evacuationTick = tick;
			} else {
				return; // still waiting outdoors; exposure already accrued above
			}
		}
```

**The threshold, 55.5 µg/m³, and its versioning trap.** This is the lower bound of
EPA's *Unhealthy* AQI category — chosen because it is **stable across both the
pre-2024 and post-2024 breakpoint tables**. The categories above it are not:
*Very Unhealthy* begins at 150.5 pre-2024 vs 125.5 post-2024; *Hazardous* at 250.5
vs 225.5. A second trap is documented: AQI breakpoints are defined on **24-hour
average** concentrations while AirNow's real-time display uses NowCast on hourly
data. *A model that counts hourly observations above 55.5 is measuring something
different from either* — so the metric is named `hours_above_unhealthy` and defined
as a concentration threshold, never called an AQI category.

**`GisAgent.java:373`**

```java
	/** True if at least one operating shelter is open at this tick. Cheap: the
	 *  scenario has three shelters. */
	private static boolean anyShelterOpen(Context context, double tick) {
		for (Object obj : context.getObjects(Shelter.class)) {
			Shelter shelter = (Shelter) obj;
			if (shelter.isOperating() && shelter.isOpenAt(tick)) {
				return true;
			}
		}
		return false;
	}
```

*(The comment's "three shelters" is a stale remark from the 2020 scenario; the loop
is correct for any count and runs over 36–46 shelters in the reported runs.)*

### 8.4 Shelter selection — capacity-aware, from the current position

**`GisAgent.java:332`**

```java
	private void chooseNetworkNearestShelter(Context context, double tick) {
		double bestDistM = Double.POSITIVE_INFINITY;
		Shelter best = null;
		boolean anyReachable = false;

		for (Object obj : context.getObjects(Shelter.class)) {
			Shelter shelter = (Shelter) obj;
			if (!shelter.isOperating() || !shelter.isOpenAt(tick)
					|| shelter.getRouteTree() == null) {
				continue;
			}
			double dM = shelter.getRouteTree().distanceTo(currentNodeId);
			if (Double.isInfinite(dM)) {
				continue;
			}
			anyReachable = true;
			if (shelter.hasSpace() && dM < bestDistM) {
				bestDistM = dM;
				best = shelter;
			}
		}

		if (best != null) {
			targetShelter = best;
			if (Double.isNaN(networkDistToShelterM)) {
				networkDistToShelterM = bestDistM;
			}
			plannedRouteM += bestDistM;
			routePath = network.pathToSource(best.getRouteTree(), currentNodeId);
			pathIndex = 0;
		} else if (anyReachable) {
			state = State.REFUSED_ALL_FULL;
		} else {
			state = State.UNREACHABLE;
		}
	}
```

The `anyReachable` flag preserves a distinction that matters for policy: *"reachable
but every one was full"* (a capacity problem) versus *"nothing reachable at all"* (a
geography or graph-connectivity problem). Collapsing them would have hidden the
finding in §13.4.

### 8.5 Admission

**`Shelter.java:66`**

```java
    /**
     * Attempts to admit one resident. Returns true and increments occupancy if
     * there is room (or the shelter is not capacity-limited); otherwise records
     * a refusal and returns false.
     */
    public boolean admit() {
        if (capacity != null && occupancy >= capacity) {
            refusedCount++;
            return false;
        }
        occupancy++;
        if (occupancy > peakOccupancy) {
            peakOccupancy = occupancy;
        }
        return true;
    }

    /** True if this shelter can currently admit at least one more resident. */
    public boolean hasSpace() {
        return capacity == null || occupancy < capacity;
    }

    /** True if this shelter is physically open at the given tick. Always true
     *  when the opening-date gate is disabled (openTick = -inf, closeTick = +inf). */
    public boolean isOpenAt(double tick) {
        return tick >= openTick && tick < closeTick;
    }

    /** True if this shelter can be selected and entered right now: operating in
     *  the scenario, open on the calendar, and not yet full. */
    public boolean isAvailableAt(double tick) {
        return operating && isOpenAt(tick) && hasSpace();
    }
```

### 8.6 Refusal at the door — the D-6 fix

**The bug.** A resident refused at a full shelter used to re-plan its route from
`startNodeId`, which is **immutable and points at the encampment**. The agent was
standing at the shelter door, so the new route began by walking all the way back to
where it started. At n=50 no shelter ever filled, so the bug was invisible to every
byte-identity gate; at production scale it would have corrupted the headline
distance and dose figures.

**The fix — `GisAgent.java:299`:**

```java
		if (pathIndex >= routePath.size()) {
			// Reached the shelter's street node: request admission (V12).
			if (targetShelter.isOpenAt(tick) && targetShelter.admit()) {
				state = State.SHELTERED;
				arrivalTick = tick;
			} else {
				// Filled since selection: the resident REMAINS at this
				// shelter's street node and re-plans from there next tick,
				// excluding full shelters (A-17 / Finding A: never re-plan
				// from the immutable start node — that walked refused agents
				// back to their encampment, inflating distance and dose).
				// Bounded to avoid livelock.
				currentNodeId = targetShelter.getGraphNodeId();
				targetShelter = null;
				routePath = null;
				pathIndex = 0;
				retargetCount++;
				if (retargetCount > MAX_RETARGETS) {
					state = State.REFUSED_ALL_FULL;
				}
			}
		}
```

**The guard that keeps it fixed.** `scripts/analyze_run.py` v1.1.0 added **check
#38**: every agent's walked distance must satisfy

```
    walked ≤ planned_route_m + snap_gap_m + 200 m
```

with `planned_route_m`, `snap_gap_m` and `door_refusals` exported as QC columns on
every agent row. In the archived capacity-binding reference run (n=400, 250 agents
refused at least once, 53 refused-then-sheltered) the **maximum unexplained walked
distance was 8.9 m**.

### 8.7 Refusal as a waiting state, not a terminal one

**`GisAgent.java:240`**

```java
		// REFUSED_ALL_FULL means "no shelter is available to me RIGHT NOW". Once
		// shelters open on different real dates (OCC 2020-09-10, CJ 2020-09-11)
		// that is no longer a permanent condition: a resident turned away from
		// the only open shelter must be able to try the second when it opens.
		// Treating it as terminal left CJ's 99 real beds entirely unused.
		// It is re-evaluated each tick and is final only at end of run.
		// This cannot livelock: capacity never increases (no departures are
		// modelled) and each shelter opens once, so re-entry is bounded by the
		// number of opening events.
		if (state == State.REFUSED_ALL_FULL) {
			if (!anyShelterAvailable(context, tick)) {
				return; // still nowhere to go; keeps accruing exposure outdoors
			}
			state = State.EN_ROUTE;
			retargetCount = 0;
			targetShelter = null;
			routePath = null;
			pathIndex = 0;
		}
```

This was a **real bug found by adding a real feature**: once shelter opening dates
were honoured, residents refused at the Convention Center on Sept 10 never tried
Charles Jordan when it opened on Sept 11 — leaving 99 real beds at 0% occupancy.
The livelock argument is given in the comment and holds because capacity never
grows and each shelter opens exactly once.

**Known residue, reported not hidden:** `door_refusals` **under-reports**, because
it resets when an agent re-enters the waiting state. Use `shelters.csv
refused_count` for totals. This is documented in the data dictionary.

---

## 9. Exposure, dose, and risk — three separate quantities

This section describes the single most important scientific correction in the
project.

### 9.1 The contract

**`GisAgent.java:54`** — stated as a comment block at the top of the accrual code:

```java
	// ---- THREE DISTINCT QUANTITIES, DELIBERATELY NOT MIXED ------------------
	// 1. EXPOSURE  (exposureUgM3h)  = SUM C(t)*dt              [ug/m3 * h]
	//    Environmental concentration-time. Physics of the AIR. Verified against
	//    raw EPA AQS data to a ratio of 1.0000. Untouched by this block.
	// 2. INHALED DOSE (inhaledDoseUg) = SUM C(t)*IR(activity)*dt   [ug]
	//    Physics of the PERSON: how much particulate mass actually entered the
	//    airway. Differs from exposure only by ventilation rate, which depends
	//    on ACTIVITY (walking vs waiting), not on diagnosis.
	// 3. HEALTH RISK (healthRiskMultiplier) = a susceptibility weight.
	//    Biology. Currently 1.0 for everyone because no defensible
	//    population-specific coefficient exists (A-09, A-22). The slot exists so
	//    that risk can never be silently folded into dose.
	// The cardinal rule: ventilation is PHYSICS and may vary with activity;
	// susceptibility is BIOLOGY and stays out of the dose term entirely.
```

### 9.2 The equations

**(1) Exposure** — physics of the air, µg·m⁻³·h:

```
    E_i  =  Σ_t  C(t) · Δt          for all t where state_i(t) ≠ SHELTERED
```

**(2) Inhaled dose** — physics of the person, µg:

```
    D_i  =  Σ_t  C(t) · IR(activity_i(t)) · Δt

           where IR = 1.62 m³/h if EN_ROUTE (walking)
                 IR = 0.61 m³/h otherwise  (outdoors, waiting)
```

**(3) Health risk** — biology:

```
    R_i  =  D_i · w_i             where w_i = 1.0 for every i, BY DESIGN
```

**(4) Person-hours above the Unhealthy threshold:**

```
    H  =  Σ_i Σ_t  Δt              for all t where C(t) > 55.5 and state_i(t) ≠ SHELTERED
```

**(5) Gini coefficient of exposure:**

```
    G  =  Σ_i Σ_j |x_i − x_j|  /  (2 n² x̄)
```

### 9.3 The accrual code

**`GisAgent.java:189`**

```java
		// --- Exposure accrues while OUTSIDE; arrival at shelter is the study
		// endpoint and stops it (DESIGN_SPEC "Study endpoint"). SHELTERED
		// residents accrue nothing further; EN_ROUTE, UNREACHABLE and
		// REFUSED_ALL_FULL residents are all still outside and keep accruing.
		if (smokeField != null && state != State.SHELTERED) {
			double c = smokeField.concentrationForTick(tick, minutesPerTick);
			exposureUgM3h += c * dtHours;
			vweUgM3h += c * ageRR * comorbidityRR * dtHours;
			// Inhaled dose: ventilation depends on ACTIVITY only. A resident who
			// is walking breathes more air than one waiting, so inhales more
			// particulate from the same concentration. No health attribute
			// enters here - susceptibility is applied downstream, if ever.
			double ventilationM3h = (state == State.EN_ROUTE)
					? INHALATION_WALKING_M3H : INHALATION_RESTING_M3H;
			airVolumeBreathedM3 += ventilationM3h * dtHours;
			inhaledDoseUg += c * ventilationM3h * dtHours;
			if (state == State.EN_ROUTE) {
				exposureWhileTravelingUgM3h += c * dtHours;
			}
			if (c > UNHEALTHY_UGM3) {
				hoursAboveUnhealthy += dtHours;
			}
			if (c > peakConcUgM3) {
				peakConcUgM3 = c;
			}
			outdoorHours += dtHours;
		}
```

**`GisAgent.java:69`** — the constants:

```java
	public static final double INHALATION_WALKING_M3H = 1.62;

	/** Ventilation while outdoors but not walking (awaiting the smoke trigger, or
	 *  stranded after refusal), m3/h. Light-activity adult cell, same source and
	 *  same caveat. Sweep 0.4-0.8. */
	public static final double INHALATION_RESTING_M3H = 0.61;

	/** Person-hours are counted above this PM2.5 concentration (µg/m³): the EPA
	 *  "Unhealthy" AQI breakpoint lower bound, stable across the pre/post-2024
	 *  tables (DATA_SOURCES D9). This is a concentration threshold, not the
	 *  24-hour-average AQI category. */
	public static final double UNHEALTHY_UGM3 = 55.5;
```

Ventilation rates: **U.S. EPA (2011)**, *Exposure Factors Handbook: 2011 Edition*,
Chapter 6 (Inhalation Rates), EPA/600/R-09/052F. Evidence class **L
(VERIFIED-IN-SECONDARY)** — the table cells were not re-read from the primary during
implementation, and both values carry sweep ranges (walking 1.2–2.0, resting
0.4–0.8 m³/h). Comfortable walking sits at the light/moderate boundary and the
**moderate** cell was chosen, which is conservative in the direction that *increases*
modelled walking dose — i.e. it works against the paper's own conclusion.

### 9.4 Risk weighting is switched off, visibly

**`GisAgent.java:446`**

```java
	/**
	 * Susceptibility weight applied to inhaled dose to obtain health risk.
	 * <b>Returns 1.0 for every resident.</b> This is deliberate and is the
	 * structural guarantee that biology is never folded into the physics: no
	 * defensible person-level susceptibility coefficient exists for this
	 * population (A-09, A-22; docs/final/HEALTH_MODEL_AUDIT.md). The method
	 * exists so a sourced coefficient has exactly one place to land, and so a
	 * reader can see that risk weighting is switched off rather than absent.
	 */
	public double getHealthRiskMultiplier() { return 1.0; }
	/** Health-risk score = inhaled dose × susceptibility weight. Numerically
	 *  identical to inhaled dose while the weight is 1.0, by design. */
	public double getHealthRiskScore() { return inhaledDoseUg * getHealthRiskMultiplier(); }
```

### 9.5 Why the risk weights are 1.0 — the citation failures

The project's original design specified `VWE = PM2.5 × RR_age × RR_comorbidity`
with RR_age = 1.45 for 65+ and RR_COPD = 1.80. **Both citations failed
verification.** This is documented rather than quietly corrected, because the
failure mode is instructive.

| Claimed | Cited to | What the record actually says |
|---|---|---|
| RR_age **×1.45** for 65+ | Di et al. 2017 | The paper is real and excellent — Di Q, Wang Y, Zanobetti A, et al., *NEJM* 376(26):2513–2522, DOI `10.1056/NEJMoa1702747`, 60,925,443 Medicare beneficiaries. It reports **HR 1.073 (95% CI 1.071–1.075) per 10 µg/m³ annual PM2.5**. The value 1.45 does not appear in it. More fundamentally, **the cohort is entirely aged 65+**, so the study design *cannot* produce an age-contrast multiplier. |
| RR_COPD **×1.80** | "Anderson et al. 2013" | **No such paper exists.** The nearest record is Atkinson RW, Carey IM, Kent AJ, van Staa TP, **Anderson HR**, Cook DG (2013), *Epidemiology* 24(1):44–53, DOI `10.1097/EDE.0b013e318276ccb8` — a **cardiovascular** study of 836,557 English primary-care patients with **no COPD effect-modification estimate**. Wrong first author, wrong journal, wrong outcome. |
| RR_asthma **×1.40** | "Zanobetti & Schwartz 2009, *Epidemiology* 20(5):708–716" | The real record is *Environmental Health Perspectives* 117(6):898–903, DOI `10.1289/ehp.0800108` — wrong journal, volume and pages, and it is a national all-cause-mortality time series that **does not report asthma as an effect modifier**. |
| RR under-18 **×1.22** | "GBD MAPS / Kloog et al. 2013" | "GBD MAPS" is a report series, not a paper; "Kloog 2013" is ambiguous. **Unverifiable as written.** |
| Gini methodology | Mudway et al. 2019; Holland et al. 2014 | Mudway is a London Low Emission Zone children's respiratory study; Holland is an EU cost-benefit analysis. **Neither establishes a method for computing a Gini coefficient of exposure.** (The formula in the code is standard and self-evident.) |
| — | Bell, Zanobetti & Dominici 2014 | A real, well-conducted paper — **about ozone**. It cannot support any PM2.5 parameter. Removed from the implementation guide but still live in an older proposal draft. |

**The deeper problem, beyond the bad citations.** Even with correct numbers,
`dose × RR` is a **category error**. A relative risk is a ratio of *health outcome
rates* between exposed groups; it is not a multiplier on *exposure*. The correct
multiplier for weighting an exposure would be a ratio of exposure–response
*coefficients*, which is a different quantity. The same underlying data give an age
multiplier anywhere from 1.008 to 2.5 depending purely on which scale you choose.
And no RR could ever be *validated* here, because **no health outcome is
simulated**.

**Independent check on the age question.** Kondo et al. 2019's meta-analysis
reports an elderly:adult relative-risk-ratio of **1.008 (95% CI 0.996–1.020)** across
8 studies — a **null result**. The proposed 1.45 is not merely unsourced; the best
available evidence says the true value is close to 1.

**The resolution.** Susceptibility weights are held at 1.0 and **stratified
reporting is the primary metric**: outcomes are reported separately for each group
rather than collapsed into a weighted index. The `vwe_ugm3h` column is retained
(append-only schema contract) and is numerically identical to raw exposure while the
weights are inert.

### 9.6 Inhalation rate is also held constant (A-22)

No defensible population-specific ventilation multiplier for adults with asthma or
COPD during walking was identified. Obstructive disease alters breathing *pattern*
in ways that do not translate cleanly into inhaled volume per minute, so any figure
would be *an assumption wearing a citation*. The required wording is recorded
verbatim:

> Asthma and COPD increase susceptibility to smoke exposure but were not converted
> into extra inhaled dose because no population-specific dose multiplier was
> identified.

### 9.7 The finding this separation made visible

Because exposure and dose are computed separately, an effect appeared that a
single-metric model would have missed entirely:

> **Optimized placement cut inhaled dose by 12.57% while cutting exposure by only
> 5.65%** — because placement removes *walking* time, and walking ventilation is
> 2.7× resting ventilation. **Exposure alone understates the benefit of placement by
> more than half.**

*(Those figures are from the earlier fixed-capacity placement experiment; the
present three-arm design reports the same mechanism at larger magnitude, §13.)*

---

## 10. Scenario construction

### 10.1 Arm B — capacity to demand, largest-remainder apportionment

**`scripts/build_scenario_bc_2026.py:34`**

```python
def main():
    rows = list(csv.DictReader(open(SRC, encoding="utf-8-sig")))
    cols = list(rows[0].keys())
    caps = [int(r["capacity"]) for r in rows]
    total = sum(caps)
    factor = TARGET / total
    print(f"A: {len(rows)} facilities, {total} spaces")
    print(f"B: scaling every facility by {factor:.4f} to reach {TARGET}")

    # Largest-remainder apportionment: scale, floor, then hand the leftover
    # spaces to the facilities with the largest fractional parts. Guarantees the
    # total is EXACTLY the target rather than a rounding drift.
    exact = [c * factor for c in caps]
    new = [int(x) for x in exact]
    leftover = TARGET - sum(new)
    order = sorted(range(len(rows)), key=lambda i: -(exact[i] - new[i]))
    for i in order[:leftover]:
        new[i] += 1
    assert sum(new) == TARGET, sum(new)

    for r, old, cap in zip(rows, caps, new):
        r["capacity"] = str(cap)
        r["capacity_basis"] = (f"SCENARIO_B_capacity_expansion_{old}x{factor:.4f}"
                               f"_real_location_unchanged")
```

`factor = 6842 / 2234 ≈ 3.0627`. Coordinates, facility count and *relative* facility
size are all unchanged, so an A→B difference is attributable to capacity alone. The
largest-remainder step guarantees the system total is **exactly** 6,842 rather than
drifting by a few beds through rounding — which matters because B and C must hold
capacity **identical** for the B→C comparison to isolate placement.

### 10.2 Arm C — modest existing growth plus ten new sites

**`scripts/build_scenario_c_2026.py:37`**

```python
TOTAL = 6842          # held equal to Scenario B
EXISTING_FACTOR = 1.5  # "just slightly larger" - modest expansion of real sites
N_NEW = 10            # new facilities to build
GRID_M = 600.0
MAX_CANDIDATES = 500
```

**`scripts/build_scenario_c_2026.py:86`**

```python
    # ---- existing facilities: fixed location, modest expansion --------------
    real = list(csv.DictReader(open(REAL, encoding="utf-8-sig")))
    cols = list(real[0].keys())
    base = [int(r["capacity"]) for r in real]
    exist_cap = [int(round(c * EXISTING_FACTOR)) for c in base]
    exist_total = sum(exist_cap)
    new_total = TOTAL - exist_total
    if new_total <= 0:
        sys.exit(f"ERROR: existing expansion {exist_total} already meets/exceeds {TOTAL}")
    print(f"  existing {len(real)} x{EXISTING_FACTOR}: {sum(base)} -> {exist_total}")
    print(f"  remaining for {N_NEW} new sites: {new_total}")

    # split the new capacity evenly, largest-remainder to hit the total exactly
    per = new_total // N_NEW
    new_caps = [per] * N_NEW
    for i in range(new_total - per * N_NEW):
        new_caps[i] += 1
    assert exist_total + sum(new_caps) == TOTAL

    exist_nodes = [nearest(float(r["lon"]), float(r["lat"])) for r in real]
    print("  Dijkstra from each existing facility ...")
    D_exist = {n: dijkstra(adj, n) for n in set(exist_nodes)}
```

**C never moves an existing shelter.** All 36 real facilities stay at their real
coordinates — a real shelter system cannot be picked up and set down somewhere else.
C only decides where the *new* capacity goes. Demand is first absorbed by existing
sites nearest-with-room; only the **residual** drives new-site placement.

### 10.3 The p-median placement algorithm

**`scripts/optimize_2026_placement.py:130`**

```python
    facs = sorted(csv.DictReader(open(SRC, encoding="utf-8-sig")),
                  key=lambda r: -int(r["capacity"]))
    remaining = dict(demand)
    chosen, placements = set(), []
    for f in facs:
        cap = int(f["capacity"])
        best, best_cost, best_take = None, 1e30, None
        for c in cands:
            if c in chosen:
                continue
            dc = D[c]
            reach = sorted(((dc[n], n) for n in remaining if n in dc))
            cost, taken, left = 0.0, {}, cap
            for d, n in reach:
                if left <= 0:
                    break
                k = min(left, remaining[n])
                cost += d * k
                taken[n] = k
                left -= k
            cost += left * 60000.0
            if cost < best_cost:
                best_cost, best, best_take = cost, c, taken
        if best is None:
            break
        chosen.add(best)
        for n, k in best_take.items():
            remaining[n] -= k
            if remaining[n] <= 0:
                del remaining[n]
        placements.append((f, best, coords[best]))
```

**Objective.** Minimise Σ(network distance × residents served), plus a **60,000 m
penalty per unfilled bed** — an explicitly-declared tuning constant, not a measured
quantity. Facilities are placed largest-capacity-first; served demand is decremented
before the next facility is placed.

**Candidate generation — `optimize_2026_placement.py:98`:**

```python
    deg = GRID_M / 111320.0
    dl = [coords[n] for n in demand]
    lo_lon, hi_lon = min(p[0] for p in dl) - 0.02, max(p[0] for p in dl) + 0.02
    lo_lat, hi_lat = min(p[1] for p in dl) - 0.02, max(p[1] for p in dl) + 0.02
    cells = {}
    for n, (lo, la) in coords.items():
        if lo_lon <= lo <= hi_lon and lo_lat <= la <= hi_lat:
            cells.setdefault((round(lo / deg), round(la / deg)), n)
    cands = list(cells.values())[:MAX_CANDIDATES]
    print(f"  {len(cands)} candidate sites (~{GRID_M:.0f} m grid)")
```

The 89,322-node graph is thinned to at most 500 candidates by keeping one node per
~600 m grid cell inside the demand bounding box, then a full Dijkstra runs from each.

**Complexity and the guarantee that is NOT claimed.** Greedy selection over
|V| candidates is O(|V|·n) per facility, against an NP-hard exact p-median. The
greedy solution does **not** carry the classic (1 − 1/e) submodularity guarantee,
because shelter catchments overlap. This is stated rather than glossed: the result
is a *good* placement, not a *provably near-optimal* one.

**A gotcha that bit and was fixed.** `optimize_2026_placement.py` originally
hardcoded the path `finalA-n2037-seed42/agents.csv`. The `n2037` fragment embedded
the population size in a directory name, so changing the population would have
silently fed the *previous* population's demand geography into the new optimum. It
now takes `--src/--run/--dest/--report` CLI arguments.

### 10.4 The three arms as parameters

Every arm is identical except `scenarioCode`, and every seed identical except
`randomSeed`, so a difference between two parameter files is the **only** thing that
can explain a difference between two runs.

```xml
<sweep runs="1">
	<parameter name="numAgents" type="constant" constant_type="int" value="6842"/>
	<parameter name="randomSeed" type="constant" constant_type="int" value="42"/>
	<parameter name="minutesPerTick" type="constant" constant_type="number" value="1.0"/>
	<parameter name="walkingSpeedMps" type="constant" constant_type="number" value="1.30"/>
	<parameter name="shelterArrivalDistanceM" type="constant" constant_type="number" value="200.0"/>
	<parameter name="evacuationThresholdUgM3" type="constant" constant_type="number" value="55.5"/>
	<parameter name="simulationHours" type="constant" constant_type="int" value="312"/>
	<parameter name="scenarioCode" type="constant" constant_type="int" value="0"/>
	<parameter name="enableHeterogeneity" type="constant" constant_type="int" value="1"/>
	<parameter name="respectShelterOpeningDates" type="constant" constant_type="int" value="1"/>
</sweep>
```

| `scenarioCode` | Arm | Shelter file |
|---|---|---|
| 0 | **A** — reality | `shelters_2026_current_placement.csv` (36 sites, 2,234) |
| 1 | **B** — capacity to demand at real locations | `shelters_2026_expanded_capacity.csv` (36 sites, 6,842) |
| 2 | **C** — same capacity, ten new optimal sites | `shelters_2026_expanded_plus_new_sites.csv` (46 sites, 6,842) |
| 3 | historical 2×99 reference (**not an arm** — calibration only) | `shelters_2020-09.csv` |

**An engineering trap worth recording.** Repast's batch schema comes from the
**batch params file**, not `parameters.xml`. New parameters must be added to each
batch file *or* read defensively; the code uses `intParam(parm, name, fallback)`
inside a try/catch so archived parameter files still run. Flags are `int` 0/1
because `IntConverter` is proven in this Repast version; `Boolean`/`String`
converters were not risked.

---

## 11. Experimental design

### 11.1 What is held constant

| Held identical across all three arms | Verified how |
|---|---|
| The 6,842 residents: ids, start coordinates, ages, sexes, mobility, asthma, COPD, walking speeds | SHA-256 over the joined per-agent attribute vector matches across A, B, C **for all nine seeds** (`verify_2026_runs.py`) |
| The smoke field | Same input file, same checksum in every manifest |
| The street graph and its corrections | Same `Streets.shp`/`.dbf` checksums in every manifest |
| Every parameter except `scenarioCode` | Diff of the batch XML files |
| Total system capacity (B vs C only) | 6,842 in both, enforced by `assert` in both build scripts |

### 11.2 What varies

Only the shelter file — and between B and C, **only the coordinates and the split of
a fixed bed total**.

### 11.3 Replication

27 runs: three arms × nine seeds (42–50), executed in three batches of three seeds.

| Batch | Seeds | Model commit at run time |
|---|---|---|
| 1 | 42, 43, 44 | `7e1a271` |
| 2 | 45, 46, 47 | `706496d` |
| 3 | 48, 49, 50 | `97ebd5d` |

Batch parameter files: `Geography/batch/batch_params_2026_{A,B,C}_seed{42..50}.xml`.
Archived manifests: `docs/runs/present-day-three-arm/<arm>-seed<seed>/`.

---

## 12. Reproducibility infrastructure

### 12.1 The protocol, learned the hard way

**Commit code FIRST, then run, then verify the manifest.**

This rule exists because it was violated twice, both times caught by audit:

1. Nine runs were stamped with commit `6616232`, which **lacked the COPD code and
   scenario C** — they had been run from a dirty working tree. All nine were
   re-run from committed code.
2. The first pass of the 2026 nine-run set stamped `fff4c37`, which **predates
   scenario C and the start-coordinate columns**. All nine were re-run; the results
   came back bit-identical, which incidentally proved the new columns perturb
   nothing.

### 12.2 The manifest

**`OutcomeLogger.java:242`**

```java
		File f = new File(outDir, "simulation.json");
		try (PrintWriter w = new PrintWriter(f, "UTF-8")) {
			w.println("{");
			w.println("  \"schema\": \"reu-wildfire-shelter-abm/simulation/v1\",");
			w.println("  \"generated_utc\": \"" + LocalDateTime.now() + "\",");
			w.println("  \"reproducibility\": {");
			w.println("    \"random_seed\": " + seed + ",");
			w.println("    \"sim_id\": \"" + jsonEsc(simId) + "\",");
			w.println("    \"data_version_tag\": \"" + jsonEsc(dataVersionTag) + "\",");
			w.println("    \"git_commit\": \"" + jsonEsc(gitCommit()) + "\",");
			w.println("    \"java_version\": \"" + jsonEsc(System.getProperty("java.version")) + "\",");
			w.println("    \"repast_version\": \"2.11.0\",");
			w.print("    \"parameters\": {");
			for (int i = 0; i < paramNames.length; i++) {
				w.print((i == 0 ? "" : ", ") + "\"" + paramNames[i] + "\": " + jsonVal(paramValues[i]));
			}
			w.println("},");
			w.println("    \"input_datasets\": [");
			for (int i = 0; i < inputDataFiles.length; i++) {
				w.println("      {\"file\": \"" + jsonEsc(inputDataFiles[i]) + "\", \"sha256\": \""
						+ sha256(inputDataFiles[i]) + "\"}" + (i < inputDataFiles.length - 1 ? "," : ""));
			}
			w.println("    ],");
			writeSourceIntegrity(w);
			w.println("  },");
```

**`OutcomeLogger.java:72`** — the data version tag:

```java
		this.simId = "sim-" + java.time.LocalDateTime.now()
				.format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")) + "-seed" + seed;
		StringBuilder cat = new StringBuilder();
		for (String fpath : inputDataFiles) {
			cat.append(sha256(fpath));
		}
		this.dataVersionTag = sha256OfString(cat.toString()).substring(0, 12);
		this.outDir = new File("output/run_seed" + seed);
		this.outDir.mkdirs();
```

### 12.3 Source integrity — the wider census

**`OutcomeLogger.java:338`**

```java
	private void writeSourceIntegrity(PrintWriter w) {
		String[] files = {
			"data/Streets.shp", "data/Streets.dbf", "data/Streets.shx",
			"data/Streets.prj", "data/Streets.cpg",
			"data/airnow/aqs_hourly_pm25_portland_2020-09.csv",
			"data/shelters/shelters_2020-09.csv",
			// The three present-day study arms. These replaced
			// shelters_{A,B}_placement_*.csv, which belonged to the retired
			// capacity-equalized 2020 design: those files still existed on disk,
			// so this block kept checksumming them and silently omitted every
			// shelter file that actually drove a run.
			"data/shelters/shelters_2026_current_placement.csv",
			"data/shelters/shelters_2026_expanded_capacity.csv",
			"data/shelters/shelters_2026_expanded_plus_new_sites.csv",
			"data/encampments/irp_campsite_reports_sample.csv",
			"data/registry/variables.csv", "data/registry/assumptions.csv",
		};
		w.println("    \"source_integrity\": {");
		w.println("      \"note\": \"Full checksum census including shapefile sidecars and the "
				+ "governance registries. data_version_tag intentionally covers only the four "
				+ "model inputs, to stay comparable with earlier archived runs.\",");
		w.println("      \"git_working_tree_dirty\": " + gitWorkingTreeDirty() + ",");
		w.println("      \"files\": [");
		for (int i = 0; i < files.length; i++) {
			w.println("        {\"file\": \"" + jsonEsc(files[i]) + "\", \"sha256\": \""
					+ sha256(files[i]) + "\"}" + (i < files.length - 1 ? "," : ""));
		}
		w.println("      ]");
		w.println("    }");
	}
```

Note the comment: this block **itself had a bug** — it was checksumming retired
shelter files that still existed on disk while omitting every file that actually
drove a run. Fixed and recorded.

### 12.4 The dirty-tree flag

**`OutcomeLogger.java:369`**

```java
	/**
	 * True when tracked model sources are newer than the recorded git HEAD, i.e.
	 * the run may have executed uncommitted code. An audit found nine archived
	 * runs stamped a commit that could not reproduce them; this flag makes that
	 * condition visible in the manifest instead of silent. Heuristic and
	 * deliberately conservative: it compares file modification times against the
	 * HEAD ref's own timestamp, so it errs toward reporting "true".
	 */
	private static String gitWorkingTreeDirty() {
		try {
			File head = new File(".git/HEAD");
			if (!head.exists()) head = new File("../.git/HEAD");
			if (!head.exists()) return "\"unknown\"";
			String h = new String(Files.readAllBytes(head.toPath()), StandardCharsets.UTF_8).trim();
			File ref = head;
			if (h.startsWith("ref:")) {
				File candidate = new File(head.getParentFile(), h.substring(4).trim());
				if (candidate.exists()) ref = candidate;
			}
			long headTime = ref.lastModified();
			File src = new File("src/geography");
			if (!src.exists()) src = new File("Geography/src/geography");
			return String.valueOf(newestFileTime(src) > headTime);
		} catch (Exception e) {
			return "\"unknown\"";
		}
	}
```

⚠️ **Location gotcha:** the flag lives at
`reproducibility.source_integrity.git_working_tree_dirty`, **not** at the top of the
reproducibility block.

### 12.5 The governance layer

**`ScienceRegistry.java:155`** — the "no invented values" rule, mechanised:

```java
			// Rule 3: affects_* are yes/no and at least one must be yes — a variable
			// that affects nothing does not belong in the registry.
			boolean anyAffect = false;
			for (String col : AFFECTS_COLUMNS) {
				String v = value(r, col);
				if (!v.equals("yes") && !v.equals("no")) {
					throw new IllegalStateException(path + " [" + id + "]: " + col
							+ " must be yes or no, got '" + v + "'");
				}
				anyAffect |= v.equals("yes");
			}
			if (!anyAffect && !"deprecated".equals(status)) {
				throw new IllegalStateException(path + " [" + id
						+ "]: every affects_* flag is 'no'; a variable that affects nothing"
						+ " must be marked deprecated or removed");
			}

			// Rules 4 and 5 mechanise "no invented values": a measured or literature
			// value must name a resolvable source, and a literature or calibrated
			// value must state a range that can actually be swept.
			String doi = value(r, "doi_or_dataset");
			String uncertainty = value(r, "uncertainty");
			if (("L".equals(cls) || "M".equals(cls)) && (doi.isEmpty() || "none".equals(doi))) {
				throw new IllegalStateException(path + " [" + id + "]: evidence_class " + cls
						+ " requires a DOI or dataset id in doi_or_dataset");
			}
			if (("L".equals(cls) || "C".equals(cls)) && (uncertainty.isEmpty() || "none".equals(uncertainty))) {
				throw new IllegalStateException(path + " [" + id + "]: evidence_class " + cls
						+ " requires a non-'none' uncertainty range so it can be sensitivity-tested");
			}
```

Called **first** in `ContextCreator.build()` (line 154), before any model object is
constructed:

```java
ScienceRegistry registry = ScienceRegistry.load(VARIABLES_CSV, ASSUMPTIONS_CSV);
```

Registry contents in the reported runs: **28 variables, 26 assumptions**, of which
**4 are blocking** (A-04, A-09, A-12, A-16). The manifest's `governance` block
carries the counts, the evidence census, and the named placeholders and blockers, so
a reader of any single run file can see the project's own list of what it does not
know.

### 12.6 The cross-run verifier

`scripts/verify_2026_runs.py` checks six invariants across all 27 runs:

1. Manifest `random_seed` matches the directory seed; `scenarioCode` matches the
   arm; `numAgents == 6842`.
2. `git_working_tree_dirty` is `false` in **every** manifest.
3. `data_version_tag` is identical across all nine seeds **within** each arm. (It
   differs *between* arms by design — the tag covers the four model inputs, and each
   arm loads a different shelter file.)
4. The `source_integrity` checksum set is identical across **all 27** runs — the same
   model source and the same street/smoke/encampment data produced every run.
5. `agents.csv` holds exactly 6,842 rows.
6. Within each seed, the population is byte-identical across arms (SHA-256 over the
   joined attribute vector).

Result: **ALL INVARIANTS HOLD for 27 runs.**

```
data_version_tag by arm: {'A': 'bdce237a6a6a', 'B': '5f8ece625e63', 'C': '5859e3007f0d'}
commits: ['706496d', '7e1a271', '97ebd5d']
population identical across arms within each seed: True
```

### 12.7 Operational gotchas

| Gotcha | Consequence | Mitigation |
|---|---|---|
| Output directories are keyed by **seed only** (`output/run_seed<N>`) | The next arm at the same seed silently overwrites the previous arm's results | Every run is renamed to `<arm>2026-n6842-seed<N>` **immediately** after it finishes, before the next run starts |
| Stale run directories | `compare_scenarios.py` once misclassified leftover `finalC-*` dirs as arm A and overwrote real A data | Delete stale run dirs before re-running |
| `generated_utc` is local time, not UTC | Minor manifest inaccuracy | Documented |
| `sha256()` returned `"unavailable"` silently on failure | A missing input could pass unnoticed | Documented defect |

---

## 13. Results — the full 27-run record

### 13.1 Headline, seed 42, with the range across all nine seeds

| | **A — today** | **B — bigger existing sites** | **C — same beds, 10 new sites** |
|---|---|---|---|
| Facilities | 36 | 36 | **46** (36 real + 10 new) |
| Total beds | 2,234 | 6,842 | 6,842 |
| **Got inside** | **2,060 (30.1%)** [2,053–2,064] | **6,264 (91.6%)** [6,257–6,268] | **6,570 (96.0%)** [6,563–6,574] |
| Turned away (all full) | 4,766 [4,762–4,773] | 562 [558–569] | **256** [252–263] |
| Could not reach any shelter | 16 [14–25] | 16 [14–25] | 16 [14–25] |
| **Beds left empty** | 174 [170–181] | **578** [574–585] | 272 [268–279] |
| Average walk | 18,260 m [17,996–18,410] | 7,938 m [7,841–8,522] | **5,689 m** [5,198–5,689] |
| Average hours in unhealthy air | 135.8 | 17.5 | **8.6** |
| Person-hours in unhealthy air | 928,934 [928,236–930,338] | 119,921 [119,155–121,255] | **59,060** [58,189–60,311] |
| Average inhaled dose | 23,374 µg [23,357–23,410] | 3,056 µg [3,039–3,089] | **1,534 µg** [1,513–1,566] |
| Mean exposure (µg·m⁻³·h) | 37,802 | 4,789 | 2,361 |

**No range overlaps between arms on any headline metric.** The effect is far larger
than seed noise.

**Relative changes:**

| Comparison | Sheltered | Exposure | Person-hours | Walking |
|---|---|---|---|---|
| A → B | ×3.04 | **−87.3%** | −87.1% | −56.5% |
| B → C | +4.9% | **−50.7%** | −50.8% | −28.3% |
| A → C | ×3.19 | **−93.8%** | −93.6% | −68.8% |

### 13.2 Every individual run

Full table: `docs/final/results-2026/6_SEED_ROBUSTNESS.csv`.

| Arm | Seed | Commit | Got inside | % | Turned away | Unreachable | Beds empty | Avg walk (m) | Avg dose (µg) | Person-h > unhealthy | Total exposure (µg·m⁻³·h) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A | 42 | 7e1a271 | 2,060 | 30.1 | 4,766 | 16 | 174 | 18,260 | 23,374 | 928,934 | 258,641,539 |
| A | 43 | 7e1a271 | 2,055 | 30.0 | 4,762 | 25 | 179 | 18,356 | 23,400 | 929,924 | 258,912,202 |
| A | 44 | 7e1a271 | 2,056 | 30.0 | 4,762 | 24 | 178 | 18,281 | 23,395 | 929,750 | 258,859,976 |
| A | 45 | 706496d | 2,055 | 30.0 | 4,771 | 16 | 179 | 18,234 | 23,399 | 929,910 | 258,911,050 |
| A | 46 | 706496d | 2,053 | 30.0 | 4,773 | 16 | 181 | 17,996 | 23,405 | 930,201 | 259,012,014 |
| A | 47 | 706496d | 2,053 | 30.0 | 4,771 | 18 | 181 | 18,354 | 23,410 | 930,338 | 259,021,883 |
| A | 48 | 97ebd5d | 2,053 | 30.0 | 4,766 | 23 | 181 | 18,410 | 23,410 | 930,309 | 259,019,858 |
| A | 49 | 97ebd5d | 2,064 | 30.2 | 4,764 | 14 | 170 | 18,214 | 23,357 | 928,236 | 258,432,011 |
| A | 50 | 97ebd5d | 2,055 | 30.0 | 4,767 | 20 | 179 | 18,390 | 23,402 | 929,950 | 258,914,152 |
| **A mean** | | | **2,056** | **30.0** | **4,766.9** | 19.1 | 178.0 | 18,277 | 23,395 | 929,728 | 258,858,298 |
| B | 42 | 7e1a271 | 6,264 | 91.6 | 562 | 16 | 578 | 7,938 | 3,056 | 119,921 | 32,765,083 |
| B | 43 | 7e1a271 | 6,259 | 91.5 | 558 | 25 | 583 | 7,939 | 3,080 | 120,881 | 33,034,278 |
| B | 44 | 7e1a271 | 6,260 | 91.5 | 558 | 24 | 582 | 8,085 | 3,077 | 120,805 | 32,989,513 |
| B | 45 | 706496d | 6,259 | 91.5 | 567 | 16 | 583 | 8,120 | 3,082 | 120,929 | 33,039,715 |
| B | 46 | 706496d | 6,257 | 91.4 | 569 | 16 | 585 | 7,841 | 3,088 | 121,188 | 33,134,453 |
| B | 47 | 706496d | 6,257 | 91.4 | 567 | 18 | 585 | 7,886 | 3,088 | 121,174 | 33,134,856 |
| B | 48 | 97ebd5d | 6,257 | 91.4 | 562 | 23 | 585 | 8,002 | 3,089 | 121,255 | 33,140,379 |
| B | 49 | 97ebd5d | 6,268 | 91.6 | 560 | 14 | 574 | 8,522 | 3,039 | 119,155 | 32,557,100 |
| B | 50 | 97ebd5d | 6,259 | 91.5 | 563 | 20 | 583 | 7,898 | 3,080 | 120,867 | 33,033,528 |
| **B mean** | | | **6,260** | **91.5** | **562.9** | 19.1 | 582.0 | 8,026 | 3,075 | 120,686 | 32,980,989 |
| C | 42 | 7e1a271 | 6,570 | 96.0 | 256 | 16 | 272 | 5,689 | 1,534 | 59,060 | 16,156,745 |
| C | 43 | 7e1a271 | 6,565 | 96.0 | 252 | 25 | 277 | 5,198 | 1,551 | 59,659 | 16,399,286 |
| C | 44 | 7e1a271 | 6,566 | 96.0 | 252 | 24 | 276 | 5,443 | 1,551 | 59,724 | 16,364,848 |
| C | 45 | 706496d | 6,565 | 96.0 | 261 | 16 | 277 | 5,637 | 1,559 | 60,088 | 16,429,603 |
| C | 46 | 706496d | 6,563 | 95.9 | 263 | 16 | 279 | 5,434 | 1,565 | 60,244 | 16,520,544 |
| C | 47 | 706496d | 6,563 | 95.9 | 261 | 18 | 279 | 5,387 | 1,564 | 60,154 | 16,515,268 |
| C | 48 | 97ebd5d | 6,563 | 95.9 | 256 | 23 | 279 | 5,603 | 1,566 | 60,311 | 16,525,765 |
| C | 49 | 97ebd5d | 6,574 | 96.1 | 254 | 14 | 268 | 5,415 | 1,513 | 58,189 | 15,934,738 |
| C | 50 | 97ebd5d | 6,565 | 96.0 | 257 | 20 | 277 | 5,507 | 1,558 | 60,015 | 16,425,124 |
| **C mean** | | | **6,566** | **96.0** | **256.9** | 19.1 | 276.0 | 5,479 | 1,551 | 59,716 | 16,363,547 |

**Observation worth noting.** `Could not reach` is **identical across all three arms
within each seed** (e.g. 16 in seed 42, 25 in seed 43, 14 in seed 49). That is the
expected signature of a pure graph-connectivity property: those residents sit on
street-graph components with no shelter in them, and no amount of capacity or
re-placement reaches them. The variation is between *seeds* (which residents were
sampled), never between *arms*. This is a useful internal consistency check that
falls out of the design.

### 13.3 Seed-to-seed spread, quantified

| Metric | A spread | B spread | C spread |
|---|---|---|---|
| Got inside | 11 people (0.5% of the mean) | 11 (0.2%) | 11 (0.2%) |
| Turned away | 11 (0.2%) | 11 (2.0%) | 11 (4.3%) |
| Total exposure | 0.23% of the mean | 1.8% | 3.6% |

The **smallest** between-arm gap on "got inside" is B→C at 306 people. The
**largest** within-arm spread is 11. The between-arm signal is roughly **28×** the
within-arm noise on that metric.

### 13.4 The finding that matters most

> **Scenario B leaves 578 beds empty while turning 562 people away.**

Those two numbers are nearly equal. B has no shortage. It has exactly enough beds
for exactly the population — and it still fails 562 people, because the beds are
where the *buildings* are, not where the *people* are. **This is a geography
failure, cleanly separated from a capacity failure**, and it is what C exists to fix.

C spends the **identical 6,842 beds**. Instead of tripling the size of buildings
already in the wrong places, it grows them 1.5× and puts the difference into ten new
shelters where people actually are. Result: **refusals halve (562 → 256), empty beds
halve (578 → 272), walking drops 28%, and inhaled dose halves again.**

### 13.5 Intervention ranking

| Rank | Intervention | Effect |
|---|---|---|
| **1** | Add capacity to meet demand | Exposure **−87.3%** — this dominates everything |
| **2** | Place the marginal capacity well | A further **−50.7%** on top of #1, at **zero additional beds** |
| 3 | Earlier opening | Not isolated in this experiment; large in the 2020-timing runs |
| 4 | Transport assistance | Not modelled; implied by the mobility gap |

The honest summary is that **capacity is the first-order effect and placement is the
second-order effect — but the second-order effect is free.**

### 13.6 Calibration: the model over-predicts, and says so

Against the one observed occupancy record — Street Roots, 2020-09-16: approximately
**90 occupants at the Oregon Convention Center and 40 at Charles Jordan, ≈130 of 198
beds** — the historical reference configuration fills **198 of 198**.

**That is a 1.52× over-prediction**, and it is attributed to assumption A-12
(universal shelter awareness), against local survey evidence that 65% of unsheltered
residents had never heard of the shelters.

Consequently the required wording is fixed, and used everywhere:

> *"Optimized shelter placement improves outcomes under the modelled assumptions"*

**never** *"recreates what actually happened"*.

---

## 14. Equity results

### 14.1 Who gets inside, by group (seed 42)

| Group | Share | **A** | **B** | **C** |
|---|---|---|---|---|
| Everyone | 100% | 30.1 | 91.6 | **96.0** |
| Walks without difficulty | 80.1% | 32.7 | 96.4 | 98.6 |
| **Has trouble walking** | **19.9%** | **19.7** | **71.9** | **85.7** |
| Age 18–44 | 52.8% | 30.6 | 93.1 | 96.8 |
| Age 45–64 | 42.0% | 30.4 | 90.8 | 95.8 |
| **Age 65+** | **5.2%** | **22.4** | **82.4** | **89.8** |
| Male | 68.6% | 30.2 | 92.1 | 96.1 |
| Female | 29.2% | 29.7 | 90.6 | 95.9 |
| Other / not stated | 2.2% | 32.0 | 88.7 | 94.7 |
| Has asthma | 14.8% | 29.2 | 90.6 | 95.7 |
| **Has COPD** | **10.8%** | **22.2** | **86.2** | **93.8** |
| Long-term physical condition | 39.6% | 30.2 | 91.1 | 95.8 |
| Counted as more vulnerable | 71.1% | 28.2 | 88.8 | 94.7 |

### 14.2 The second key finding: capacity expansion alone widens the equity gap

The gap between residents who walk easily and residents who do not:

| | A | B | C |
|---|---|---|---|
| Walks without difficulty | 32.7% | 96.4% | 98.6% |
| Has trouble walking | 19.7% | 71.9% | 85.7% |
| **Gap (percentage points)** | **13.0** | **24.5** | **12.9** |

> **Pouring 4,608 beds into the same buildings widens the mobility gap from 13.0 to
> 24.5 percentage points**, because extra capacity at an existing site is captured
> first by whoever can walk there fastest. Spending that identical capacity on
> well-placed new sites brings the gap back to 12.9 **while lifting the slowest
> group from 71.9% to 85.7%.**

The same shape holds for age 65+ (22.4 → 82.4 → 89.8) and COPD (22.2 → 86.2 → 93.8).

**This is a publishable result that a capacity-only analysis cannot produce.** An
equity metric that only tracked *aggregate* access would score B as a near-total
success.

### 14.3 The asymmetry that validates the method

**Asthma shows almost no access penalty. COPD shows a large one.**

This is correct, and it is the direct consequence of §5.2: COPD carries a
published gait-speed decrement (Buekers 2024, −0.19 m/s) and asthma does not.
Diagnosis is never a dose multiplier (decision D-3), so a condition can only affect
outcomes by affecting *movement*. Asthma affects nothing, so it shows nothing.

Had the project borrowed COPD's number for asthma "for symmetry", it would have
manufactured a finding. The asymmetry is therefore reported as **evidence that the
model is not inventing effects.**

### 14.4 Mean inhaled dose by group (seed 42, µg)

| Group | A | B | C |
|---|---|---|---|
| Everyone | 23,374 | 3,056 | 1,534 |
| Walks without difficulty | 22,514 | 1,436 | **679** |
| Has trouble walking | 26,842 | 9,585 | 4,981 |
| Age 65+ | 25,944 | 6,104 | 3,614 |
| Has COPD | 25,995 | 4,859 | 2,296 |
| Has asthma | 23,684 | 3,379 | 1,636 |
| Counted as more vulnerable | 24,017 | 3,980 | 1,995 |

**Note the ratio.** In A, the mobility-limited group's dose is 1.19× the unimpaired
group's. In B it is **6.7×**. In C it falls back to 7.3× — still high, but on a base
14× smaller in absolute terms. The relative gap persists even as absolute harm
collapses, which is exactly why both must be reported.

### 14.5 The gap is narrowed, not closed

**14.3% of residents with mobility limitations are still outside in scenario C.**
Ten new shelters are not enough to reach everyone. Placement is a large improvement,
not a solution.

---

## 15. Verification and validation

### 15.1 What was checked, and how

| Check | Method | Result |
|---|---|---|
| **Exposure integration** | Recompute Σ C·dt from the raw EPA AQS CSV in Python, independently of the model | **Ratio 1.0000** (54,002.7 vs 54,002.8 µg·m⁻³·h) |
| **Routing correctness** | `scripts/test_routing.py` — Python Dijkstra reimplementation, tests T1–T5 | Reproduces Java distances **exactly**; all pass |
| **Realised walking speeds** | Distance ÷ time from exported rows, checked against Bohannon bounds | 1.300–1.376 m/s, inside published range |
| **Determinism** | Re-run at seed 42 | **Bit-for-bit identical** |
| **Baseline invariance** | Add the entire heterogeneity layer, re-run baseline, compare all 25 shared columns | **Byte-identical**; `shelters.csv` byte-identical |
| **Run-file consistency** | `scripts/analyze_run.py` — 37 cross-checks between `agents.csv`, `shelters.csv`, `simulation.json` | **37/37 pass** |
| **Walked ≤ planned** (check #38) | `walked ≤ planned_route_m + snap_gap_m + 200 m`, per agent | Max unexplained 8.9 m in the capacity-binding reference |
| **Population identity across arms** | SHA-256 over the joined attribute vector | Identical for A/B/C in **all nine seeds** |
| **Cross-run invariants** | `scripts/verify_2026_runs.py`, six invariants | **All hold for 27 runs** |
| **Street-graph integrity** | Impossible-edge count after correction | 50 → **0**; components unchanged |

### 15.2 Tests whose answers can be checked by hand

Following the standard set by the Van Pelt chapter in this volume, several checks
were designed so a reader can verify them without running anything:

- **Exposure of a resident who never shelters** must equal the full-window integral,
  54,002.8 µg·m⁻³·h. Exported unsheltered agents show exactly that, with
  `avg_pm25 = 173.09`, `peak_pm25 = 562.7`, `hours_above_unhealthy = 194.0` — every
  one matching the independently-computed raw-data value.
- **Person-hours above threshold** for such a resident must be 194, the count of
  hours above 55.5 µg/m³ in the record. It is.
- **A resident's inhaled dose while purely resting** must equal exposure × 0.61.
  It does, to floating-point precision.

### 15.3 What is NOT validated

- **No health outcome.** No case, hospitalisation or death is predicted, so no
  health prediction can be validated.
- **No absolute occupancy claim.** The one observed occupancy record is
  over-predicted 1.52× (§13.6).
- **No spatial exposure validation.** With two in-county monitors, a spatial field
  cannot be validated at all — which is why it is uniform.
- **No behavioural validation.** Awareness, willingness to travel, queueing and
  abandonment are unmodelled.

---

## 16. The governance registries

### 16.1 Variables — 28 entries

Full file: `Geography/data/registry/variables.csv`.

| ID | Name | Units | Class | Source / DOI | Status |
|---|---|---|---|---|---|
| V13 | `minutesPerTick` | min/tick | A | none | implemented |
| V10 | `walkingSpeedMps` | m/s | L | `10.1093/ageing/26.1.15` | implemented |
| V-EVAC | `evacuationThresholdUgM3` | µg/m³ | L | D9 (EPA AQI) | implemented |
| V15 | `numAgents` | count | A→M | D10 (2025 PIT) | implemented |
| V16 | `randomSeed` | — | A | none | implemented |
| V-SIMH | `simulationHours` | h | M | D3 | implemented |
| V-ARRIVAL | `shelterArrivalDistanceM` | m | A | none | **deprecated** |
| V5 | `smokeField` | µg/m³ | M | D3 | implemented |
| V6 | `cumulative_dose_ugm3h` | µg/m³·h | M | D3 | implemented |
| V7 | `vwe_ugm3h` | µg/m³·h | A | none | **placeholder** |
| V2 | `age_rr` | — | A | none | **placeholder (1.0)** |
| V4 | `comorbidity_rr` | — | A | none | **placeholder (1.0)** |
| V8 | `hours_above_unhealthy` | h | M | D9 | implemented |
| V9 | `total_travel_distance_m` | m | M | `10.1007/s00190-012-0578-z` | implemented |
| V11 | `network_dist_to_shelter_m` | m | M | `10.1007/BF01386390` | implemented |
| V12 | `shelterCapacity` | persons | A | D1 | implemented |
| V14 | `gini` | — | M | D3 | implemented |
| V-NODETOL | `NODE_SITE_TOLERANCE_M` | m | A | none | implemented |
| V-REATTACH | `REATTACH_TOLERANCE_M` | m | A | none | implemented |
| V-STARTLOC | `startingEncampment` | lon/lat | M | D2b | implemented |
| V18 | `ageYears` / `ageBand` | years | M | D10 / Pathways 2026 | implemented |
| V19 | `sex` | category | M | D10 | implemented |
| V20 | `mobilityLimited` | bool/category | M | D10 + D11 | implemented |
| V21a | `asthma` | bool | L | `10.1007/s11606-025-09814-x` | implemented |
| V21b | `copd` | bool | L | `10.1007/s11606-025-09814-x` | implemented |
| V23 | `shelterOpenTick` | tick | M | D1 | implemented |
| V24 | `copdSpeedDeltaMps` | m/s | L | `10.1183/16000617.0253-2023` | implemented |
| V25 | `inhaled_dose_ug` | µg | L | EPA/600/R-09/052F | implemented |

**Selected entries in full:**

**V24 — `copdSpeedDeltaMps`.** *Mechanism:* applied additively to the age×sex
comfortable gait speed before dispersion is sampled; NOT stacked on the Boyce
mobility-limited speed, because those categories already embed an impaired walker.
*Math:* `mu_copd = max(0.40, mu[age,sex] − 0.19) m/s`. *Uncertainty:* −0.11 to
−0.28 m/s (the published 95% CI); **evidence rated low quality by the review
authors, so the point estimate must be swept, not assumed.**

**V25 — `inhaled_dose_ug`.** *Mechanism:* exposure weighted by ventilation rate,
which depends on **activity only**. *"No health attribute enters this term —
susceptibility is a separate multiplier held at 1.0. This is the physics of the
person, distinct from exposure (physics of the air) and from health risk
(biology)."* *Uncertainty:* walking 1.2–2.0, resting 0.4–0.8 m³/h.

**V2 — `age_rr` (placeholder).** *Source field reads:* **"UNSOURCED — Di et al 2017
cannot yield an age contrast (cohort entirely 65+); Kondo 2019 meta-RRR is 1.008
(0.996–1.020), i.e. null."**

**V12 — `shelterCapacity`.** *Source field reads:* **"99 per site is
newsroom-sourced and unconfirmed by a primary agency document."** *Sensitivity plan:*
confirm against a primary source and sweep capacity while refusal results are being
quoted.

### 16.2 Assumptions — 26 entries, 4 blocking

Full file: `Geography/data/registry/assumptions.csv`.

| ID | Statement (abbreviated) | Status |
|---|---|---|
| A-01 | PM2.5 field is spatially uniform across the county | active |
| A-02 | All residents evacuate simultaneously at the first threshold crossing after a shelter opens | active (partially mitigated) |
| A-03 | 2025–26 campsite locations represent the 2020 spatial distribution | active |
| **A-04** | **Each operating shelter has a nightly capacity of 99** | **BLOCKING** |
| A-05 | Every mapped street centerline is walkable | active |
| A-06 | Pedestrians ignore one-way restrictions ⇒ undirected graph | active (*literature*) |
| A-07 | An admitted resident remains for the rest of the event | active |
| A-08 | Admission is first-come first-served, not needs-based triage | active |
| **A-09** | **Susceptibility weights are 1.0, so the burden index equals raw exposure** | **BLOCKING** |
| A-10 | The declared shelter arrival radius is not applied | active |
| A-11 | The modelled population is adults only | active |
| **A-12** | **All residents know the shelters exist and where they are** | **BLOCKING** |
| A-13 | Every resident walks at the same constant speed | **RETIRED** (heterogeneity implemented) |
| A-14 | Endpoint claims within 100 m are the same junction | active |
| A-15 | Cumulative exposure is an index, not an inhaled dose | active (superseded in practice by V25) |
| A-17 | A refused resident re-routes from its current position | active (true as implemented) |
| **A-16** | **Agent execution order within a tick does not affect outcomes** | **BLOCKING** |
| A-18 | Mobility limitation uses an age gradient borrowed from a California donor population | active |
| A-19 | Every mobility-limited resident walks as an unaided ambulant-impaired person | active |
| A-20 | Shelters open at 00:00 local on their recorded opening date | active |
| A-21 | A resident refused for capacity waits and re-attempts when another shelter opens | active |
| A-22 | Inhalation rate is identical regardless of asthma or COPD status | active |
| A-23 | Asthma has no effect on walking speed | active |
| A-24 | (Retired scenario C) capacity equals population, demonstration only | active |
| A-25 | Ventilation depends only on whether a resident is walking | active |
| A-26 | The placement experiment holds total capacity equal to the population | active |

**The four blocking assumptions, in full:**

**A-04 — shelter capacity.** *"Newsroom-sourced and consistent across
contemporaneous reports but not confirmed by a primary agency document… now the
single largest driver of the headline result: the number sheltered equals total
capacity exactly in every run."* The 2026 capacity audit (§4.7) could not resolve it
because the July 2026 list is a different system.

**A-09 — susceptibility weights inert.** *"The slide-cited relative risks could not
be verified and the multiplicative formulation is a category error, so the weights
remain inert."* Mitigation in force: stratified reporting as the primary metric.

**A-12 — universal awareness.** *"A placeholder pending the awareness stage,
contradicted by the local record in which 65% of surveyed unhoused residents never
heard about the shelters."* Sensitivity plan: replace with an awareness Bernoulli of
0.35 and sweep 0.25–0.45. **This is the single biggest honest caveat in the project:
every "got inside" figure is an upper bound.**

**A-16 — order-independent admission.** *"True only while shelter capacity never
binds."* Its prerequisite — two-phase order-independent admission — was never
implemented. **It does not affect the B→C placement comparison**, because capacity
is not binding in either arm; it matters most in arm A, where capacity binds hard.

**Two assumptions whose bias direction is stated explicitly, and which cut against
the project's own conclusions:**

- **A-19** — every mobility-limited resident is given Boyce's **fastest** impaired
  category. CASPEH found 20% of a 22% mobility-limited population use an aid, so
  real speeds are likely **lower** and the measured access disparity likely
  **larger** than reported. The modelled penalty is deliberately conservative.
- **A-20** — shelters open at 00:00, the earliest defensible reading and the one
  most generous to the shelter system. Real sites opened later in the day, so
  pre-opening outdoor exposure is **understated**. *"The direction of the bias is
  known and stated rather than tuned."*

---

## 17. Limitations

1. **C's ten new sites are street-network nodes, not real venues.** They are
   theoretical optima. No siting, zoning, construction cost, staffing or indoor air
   filtration is modelled.
2. **The 1.5× existing-expansion factor and the choice of ten new sites are policy
   parameters**, not measured quantities. Different values give different
   magnitudes; the *direction* is what the comparison establishes.
3. **B's uniform 3.06× scale-up is likewise a construct.** Real buildings have
   physical limits.
4. **Two real facilities are missing** — Clinton Triangle (160 units, the largest
   single site) and Multnomah SRV (28) — neither publishes a street address. Real
   capacity is ≈207 people higher than modelled.
5. **Ten day centres are excluded** because none publishes a capacity. In a
   *daytime* smoke episode these are plausibly the most relevant clean-air spaces
   that exist, so arm A understates daytime availability.
6. **Three shelter coordinates are block- or intersection-level**, accurate to a few
   hundred metres.
7. **Sex and mobility distributions are 2019** inside an otherwise 2026 study. No
   local replacement was found. Age and chronic-condition data are 2026 (Pathways).
8. **Asthma and COPD prevalences are imported from Minnesota** (Zellmer 2025) — the
   right *population* (adults with recent homelessness, EHR-diagnosed) but the wrong
   *place*.
9. **A-12: universal awareness.** Local evidence says 65% never heard of the
   shelters. Every "got inside" figure is an **upper bound**.
10. **A-16: admission is order-dependent.** Residents are served in shuffle order
    rather than by need. Matters most in arm A.
11. **Encampment locations are 2025–26 reports** used as a spatial proxy for 2020,
    and they are complaint-driven, so they carry visibility bias.
12. **All facilities are modelled as open from hour 0** — appropriate for a
    year-round present-day system, but not a claim about activation timing.
13. **The PM2.5 field is spatially uniform** (two in-county monitors), so placement
    can only help by reducing time outdoors, never by moving people into cleaner air.
14. **The monitors are non-FRM heated-inlet nephelometers**, which likely
    *understate* true PM2.5 during a fresh wood-smoke event.
15. **No health outcome is modelled.** Exposure and inhaled dose are physical
    quantities; no illness, hospitalisation or death is predicted or claimed.
16. **The street layer's provenance is incomplete** — RLIS release version, retrieval
    date and redistribution licence are unrecovered.
17. **Freeway and ramp segments are not filtered** from the pedestrian graph (A-05),
    although the classification attributes needed to do so are present.
18. **The greedy p-median carries no approximation guarantee** because shelter
    catchments overlap.

---

## 18. Complete bibliography

### Methods and algorithms

1. **North MJ, Collier NT, Ozik J, Tatara ER, Macal CM, Bragen M, Sydelko P** (2013). Complex adaptive systems modeling with Repast Simphony. *Complex Adaptive Systems Modeling* 1(1):3. DOI `10.1186/2194-3206-1-3`.
2. **Karney CFF** (2013). Algorithms for geodesics. *Journal of Geodesy* 87(1):43–55. DOI `10.1007/s00190-012-0578-z`.
3. **Dijkstra EW** (1959). A note on two problems in connexion with graphs. *Numerische Mathematik* 1(1):269–271. DOI `10.1007/BF01386390`.

### Movement and mobility

4. **Bohannon RW, Williams Andrews A** (2011). Normal walking speed: a descriptive meta-analysis. *Physiotherapy* 97(3):182–189. DOI `10.1016/j.physio.2010.12.004`. *41 studies, n = 23,111.*
5. **Bohannon RW** (1997). Comfortable and maximum walking speed of adults aged 20–79 years: reference values and determinants. *Age and Ageing* 26(1):15–19. DOI `10.1093/ageing/26.1.15`.
6. **Boyce KE, Shields TJ, Silcock GWH** (1999). Toward the characterization of building occupancies for fire safety engineering: capabilities of disabled people moving horizontally. *Fire Technology* 35(1):51–67. DOI `10.1023/A:1015339216366`. *Verified in secondary via Tinaburri (2018), FEMTC.*
7. **Buekers J, et al.** (2024). Gait differences between COPD and healthy controls: systematic review and meta-analysis. *European Respiratory Review* 33(172):230253. DOI `10.1183/16000617.0253-2023`. PMID 38657998.

### Population health

8. **Zellmer S, et al.** (2025). *Journal of General Internal Medicine*. DOI `10.1007/s11606-025-09814-x`. *n = 20,139 adults with recent homelessness, EHR-diagnosed.*
9. **Brown RT, et al.** (2017). *The Gerontologist*. DOI `10.1093/geront/gnw011`. *n = 350 homeless adults 50+.*
10. **Lewer D, et al.** (2019). *BMJ Open*. DOI `10.1136/bmjopen-2018-025192`. *n = 1,336.*
11. **Fazel S, Geddes JR, Kushel M** (2014). The health of homeless people in high-income countries. *The Lancet* 384(9953):1529–1540. DOI `10.1016/S0140-6736(14)61132-6`.
12. **Snyder LD, Eisner MD** (2004). Obstructive lung disease among the urban homeless. *Chest* 125(5):1719–1725. DOI `10.1378/chest.125.5.1719`. *Spirometry-confirmed, n = 68.*
13. **Murphy ER** (2019). Transportation and homelessness: a systematic review. *Journal of Social Distress and the Homeless* 28(2):96–105. DOI `10.1080/10530789.2019.1582202`.

### Air pollution and wildfire smoke

14. **Di Q, Wang Y, Zanobetti A, Wang Y, Koutrakis P, Choirat C, Dominici F, Schwartz JD** (2017). Air pollution and mortality in the Medicare population. *NEJM* 376(26):2513–2522. DOI `10.1056/NEJMoa1702747`.
15. **Reid CE, Brauer M, Johnston FH, Jerrett M, Balmes JR, Elliott CT** (2016). Critical review of health impacts of wildfire smoke exposure. *Environmental Health Perspectives* 124(9):1334–1343. DOI `10.1289/ehp.1409277`.
16. **DeFlorio-Barker S, Crooks J, Reyes J, Rappold AG** (2019). Cardiopulmonary effects of fine particulate matter exposure among older adults during wildfire and non-wildfire periods. *Environmental Health Perspectives* 127(3):037006. DOI `10.1289/EHP3860`.
17. **DeVries R, Kriebel D, Sama S** (2017). Outdoor air pollution and COPD-related emergency department visits, hospital admissions, and mortality: a meta-analysis. *COPD* 14(1):113–121. DOI `10.1080/15412555.2016.1216956`.
18. **Alman BL, et al.** (2016). *Environmental Health* 15:64. DOI `10.1186/s12940-016-0146-8`.
19. **Anderson JO, Thundiyil JG, Stolbach A** (2012). Clearing the air: a review of the effects of particulate matter air pollution on human health. *Journal of Medical Toxicology* 8(2):166–175. DOI `10.1007/s13181-011-0203-1`. *Cited here as the nearest real record to a nonexistent "Anderson et al. 2013"; it does not report the RR that was attributed to it.*

### Data sources

20. **U.S. EPA.** *Air Quality System (AQS) pre-generated hourly data files, parameter 88502, 2020.* Retrieved 2026-07-24 from `https://aqs.epa.gov/aqsweb/airdata/download_files.html`
21. **U.S. EPA.** *Technical Assistance Document for the Reporting of Daily Air Quality — the Air Quality Index (AQI).* `https://www.airnow.gov/publications/air-quality-index/technical-assistance-document-for-reporting-the-daily-aqi/`
22. **U.S. EPA** (2011). *Exposure Factors Handbook: 2011 Edition*, Chapter 6: Inhalation Rates. EPA/600/R-09/052F.
23. **Portland State University, Homelessness Research & Action Collaborative** (2025). *2025 Tri-County Point-in-Time Count.* Published 2025-11-04. `https://hsd.multco.us/wp-content/uploads/2025/11/2025-Tri-County-PITC-Report-11.04.25.pdf` · PDXScholar `hrac_pub/52`
24. **Portland State University, Regional Research Institute** (2019). *2019 Point-in-Time Count of Homelessness in Portland/Gresham/Multnomah County, Oregon.* PDXScholar `rri_facpubs/63`.
25. **Portland State University / OHSU** (2026). *Pathways Study Findings*, published 2026-04-09. *N = 541, Multnomah County.*
26. **UCSF Benioff Homelessness and Housing Initiative** (2023). *Toward a New Understanding: the California Statewide Study of People Experiencing Homelessness (CASPEH).* *n = 3,198.*
27. **Multnomah County Health & Human Services.** *List of Shelters* (updated July 2026). `https://hsd.multco.us/emergency-shelters/list-of-shelters/`
28. **City of Portland.** *Safe Rest Villages.* `https://www.portland.gov/united/saferestvillages`
29. **City of Portland.** *IRP Campsite Reports*, ArcGIS FeatureServer `COP_OpenData_Miscellaneous/MapServer/1396`. Retrieved 2026-07-24.
30. **Oregon Department of Environmental Quality** (2023). *Wildfire Smoke Trends and the Air Quality Index.* `https://www.oregon.gov/deq/wildfires/Documents/WildfireSmokeTrendsReport.pdf`
31. **Multnomah County Joint Office of Homeless Services** (2020). News releases, 2020-09-10 and 2020-09-18.
32. **Portland State University.** *Stories from the Outside.* *n = 73.*
33. **Pollard J** (2020-09-16). Portland's houseless face health risks amidst toxic air, trouble accessing resources. *Street Roots.* `https://www.streetroots.org/news-stories/2020/09/16/homeless-portland-amid-wildfire-smoke/`
34. **Henry M, Watt R, Mahathey A, Ouellette J, Sitler A** (2023). *The 2022 Annual Homelessness Assessment Report (AHAR) to Congress, Part 1.* U.S. Department of Housing and Urban Development.

### Figures guidance

35. **Rougier NP, Droettboom M, Bourne PE** (2014). Ten simple rules for better figures. *PLOS Computational Biology* 10(9):e1003833. DOI `10.1371/journal.pcbi.1003833`.

### Sources deliberately NOT used

- **Bell ML, Zanobetti A, Dominici F** (2014). Who is more affected by ozone pollution? *American Journal of Epidemiology* 180(1):15–28. DOI `10.1093/aje/kwu115`. — A real, well-conducted paper **about ozone**. It cannot support a PM2.5 parameter.
- **Atkinson RW, Carey IM, Kent AJ, van Staa TP, Anderson HR, Cook DG** (2013). *Epidemiology* 24(1):44–53. DOI `10.1097/EDE.0b013e318276ccb8`. — Correct record for what was miscited as "Anderson et al. 2013"; it is a **cardiovascular** study with no COPD effect-modification estimate.
- **Zanobetti A, Schwartz J** (2009). *Environmental Health Perspectives* 117(6):898–903. DOI `10.1289/ehp.0800108`. — Correct record for a miscitation; it does **not** report asthma as an effect modifier.
- **"GBD MAPS / Kloog et al. 2013"** — not a resolvable single reference.
- **Mudway et al. 2019; Holland et al. 2014** — neither establishes a method for computing a Gini coefficient of exposure.

---

## 19. Output schema

### 19.1 `agents.csv` — 49 columns

Exact header of `Geography/output/A2026-n6842-seed42/agents.csv`:

```
agent_id,sim_id,commit,random_seed,data_version,starting_encampment,start_lon,start_lat,
shelter_reached,reached_shelter,time_started_tick,time_started_local,time_arrived_tick,
time_arrived_local,travel_time_min,total_travel_distance_m,network_dist_to_shelter_m,
avg_pm25_ugm3,peak_pm25_ugm3,cumulative_dose_ugm3h,exposure_while_traveling_ugm3h,
vwe_ugm3h,hours_above_unhealthy,age,asthma,copd,age_rr,comorbidity_rr,final_state,
planned_route_m,snap_gap_m,door_refusals,scenario,walking_speed_mps,age_years,age_band,
sex,mobility_limited,mobility_category,asthma_flag,copd_flag,any_respiratory,
chronic_physical,vulnerable_flag,air_volume_breathed_m3,mean_ventilation_m3h,
inhaled_dose_ug,health_risk_multiplier,health_risk_score
```

| Column | Meaning |
|---|---|
| `agent_id` | Synthetic resident id. |
| `sim_id`, `commit`, `random_seed`, `data_version` | Provenance stamped on **every row**, so a detached CSV is still traceable. |
| `starting_encampment` | `inc_id` of the real campsite report this resident was placed at. |
| `start_lon`, `start_lat` | The actual start coordinate — demand geography auditable without re-joining any file. |
| `shelter_reached`, `reached_shelter` | Shelter id admitted to (blank if never); yes/no. |
| `time_started_tick` / `_local` | Departure tick and local time. |
| `time_arrived_tick` / `_local` | Admission tick and local time. |
| `travel_time_min` | Departure→admission minutes. **Includes any wait** for a second shelter to open; not pure walking time. |
| `total_travel_distance_m` | Geodesic metres actually walked (V9). |
| `network_dist_to_shelter_m` | Network distance from the START node to the FIRST selected shelter (V11). |
| `avg_pm25_ugm3`, `peak_pm25_ugm3` | Mean and maximum PM2.5 experienced outdoors. |
| `cumulative_dose_ugm3h` | **Exposure** (V6): Σ C·dt. A concentration-time index, NOT an inhaled mass. |
| `exposure_while_traveling_ugm3h` | Exposure accrued only while EN_ROUTE. |
| `vwe_ugm3h` | Exposure Burden Index (V7). **Identical to exposure** while RR weights are 1.0. |
| `hours_above_unhealthy` | Hours outdoors with C > 55.5 µg/m³ (V8). |
| `age`, `asthma`, `copd`, `age_rr`, `comorbidity_rr` | Legacy columns, retained for schema stability. `age_rr` and `comorbidity_rr` are **always 1.0**. |
| `final_state` | SHELTERED / REFUSED_ALL_FULL / UNREACHABLE / EN_ROUTE / PRE_EVAC. |
| `planned_route_m`, `snap_gap_m`, `door_refusals` | QC columns for check #38. `door_refusals` **under-reports** (resets on waiting-state re-entry). |
| `scenario` | Arm label. |
| `walking_speed_mps` | This resident's comfortable gait speed (V10). |
| `age_years`, `age_band`, `sex` | V18, V19. |
| `mobility_limited`, `mobility_category` | V20. |
| `asthma_flag`, `copd_flag`, `any_respiratory`, `chronic_physical` | V21a, V21b. |
| `vulnerable_flag` | 55+ OR mobility-limited OR asthma OR COPD. **A reporting stratum, not a risk score.** |
| `air_volume_breathed_m3`, `mean_ventilation_m3h` | Makes the dose auditable. |
| `inhaled_dose_ug` | **Inhaled dose** (V25): Σ C·IR(activity)·dt, µg. Activity-weighted, NOT health-weighted. |
| `health_risk_multiplier`, `health_risk_score` | Always 1.0 by design; score identical to dose. |

### 19.2 `shelters.csv` — 9 columns

`shelter_id`, `name`, `lon`, `lat`, `capacity`, `operating`, `peak_occupancy`,
`final_occupancy`, `refused_count`, `utilization`, `mean_travel_dist_m_admitted`.

**Deliberately not exported:** *average exposure reduction per shelter*. That is a
**counterfactual** — it would require knowing what each admitted resident's exposure
would have been had that shelter not existed. It is not fabricated from a single run.

### 19.3 `simulation.json`

Blocks: `schema`, `generated_utc`, `reproducibility` (seed, sim_id,
data_version_tag, git_commit, java/repast versions, all parameters, per-input
SHA-256s, `source_integrity`), `smoke_field`, `street_network_validation`,
`governance`, `stratified_exposure`, `scenario`, `population_sampling`,
`population`, `shelters`.

---

## 20. How to reproduce every number

### 20.1 Environment

| Component | Location / version |
|---|---|
| Repast Simphony | `C:\Users\<user>\RepastSimphony-2.11.0` |
| JDK | Temurin 17.0.19+10 |
| Gradle | 8.14.3 wrapper (`gradlew compileJava`) |
| Python | 3.14.6 + pandas 3.0.5 + matplotlib 3.11 + pyshp |

### 20.2 One run

```powershell
# From the repo root. Compile first:
.\Geography\gradlew.bat -p Geography compileJava

# Run arm A, seed 42, headless (no Eclipse, no GUI):
powershell -File scripts\run-headless.ps1 `
    -ParamsFile "batch\batch_params_2026_A_seed42.xml" -TimeoutSec 600

# Output lands in Geography\output\run_seed42\  -- RENAME IT IMMEDIATELY,
# because output directories are keyed by SEED ONLY and the next arm at the
# same seed will overwrite it:
Rename-Item Geography\output\run_seed42 A2026-n6842-seed42
```

A full 312-hour run at n = 6,842 takes **about 40–70 seconds**.

### 20.3 The whole experiment

```powershell
# Regenerate all 27 batch parameter files (seeds are CLI arguments):
python scripts\make_batch_params_2026.py 42 43 44
python scripts\make_batch_params_2026.py 45 46 47
python scripts\make_batch_params_2026.py 48 49 50

# ... run each of the 27, renaming after each ...

# Verify every cross-run invariant and emit the robustness table:
python scripts\verify_2026_runs.py

# Rebuild every results CSV and figure:
python scripts\make_2026_results.py
python scripts\make_readable_results.py

# Per-run consistency (37 checks + check #38):
python scripts\analyze_run.py Geography\output\A2026-n6842-seed42

# Independent routing validation:
python scripts\test_routing.py
```

### 20.4 Rebuilding the scenario inputs from scratch

```powershell
python scripts\add_missing_shelters_2026.py       # geocode the recovered villages
python scripts\build_scenario_bc_2026.py          # arm B: 3.0627x largest-remainder
python scripts\optimize_2026_placement.py --src ... --run ... --dest ... --report ...
python scripts\build_scenario_c_2026.py           # arm C: 1.5x existing + 10 new
```

### 20.5 File index

| Path | What it is |
|---|---|
| `Geography/src/geography/` | The model (14 Java classes, §2.2) |
| `Geography/data/` | All inputs + `README.md` provenance registry |
| `Geography/data/registry/` | `variables.csv` (28), `assumptions.csv` (26) |
| `Geography/batch/batch_params_2026_*.xml` | 27 parameter files |
| `Geography/output/<arm>2026-n6842-seed<N>/` | Full run output (gitignored — large) |
| `docs/runs/present-day-three-arm/` | **27 archived run manifests** (tracked) |
| `docs/final/TECHNICAL_REFERENCE.md` | This document |
| `docs/final/PRESENTATION.md` | The polished narrative version |
| `docs/final/PRESENT_DAY_THREE_ARM_RESULTS.md` | The headline results report |
| `docs/final/results-2026/` | 6 result CSVs + 6 figures |
| `docs/final/readable/` | Plain-language results + figures |
| `docs/final/*_AUDIT.md` | Health model, smoke field, shelter capacity, claim validation, system audits |
| `docs/science/` | Design spec, data sources, metrics dictionary, bibliography, validation strategy |
| `docs/validation/STREET_NETWORK_VALIDATION.md` | The wormhole defect, before/after |
| `docs/chapter/` | The publication chapter (LaTeX) |
| `scripts/` | 17 build, run, analysis and verification scripts |

---

## 21. Recommended citation

> Asghar, F. (2026). *Wildfire Smoke Shelter Placement Agent-Based Model*
> (Version 1.0) [Computer software]. NSF Research Experience for Undergraduates,
> Portland State University. `https://github.com/fxa28196/REU`

Every result in this document was produced at commit `c0cd113` on branch
`phase2/human-agent-modeling`, from runs stamped `7e1a271`, `706496d` and `97ebd5d`,
each with a clean working tree.

---

## 22. Statement on tool use

I directed this research, made all research decisions, and wrote the manuscript.
Claude (Anthropic) assisted with coding, data acquisition scripting, verification
tooling and documentation drafting. Every citation in this document was checked
against the publisher record, and the citation audit in §9.5 — which found and
corrected six citation defects in the project's own original design, including two
attributions to papers that do not report the claimed values and one to a paper that
does not exist — is a direct product of that checking. I reviewed, revised and
approved all outputs and take full responsibility for the final text.
