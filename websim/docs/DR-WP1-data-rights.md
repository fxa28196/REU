# DR-WP1 — Data redistribution rights: Oregon Metro RLIS and City of Portland campsite reports

**Status:** DECIDED — closes the WP1 rights track (plan §8 WP1, Q3 L595, risk W1 L779,
acceptance L628–630).
**Date of record:** 2026-08-02.
**Basis:** the researcher's report of approval from both bodies, **relayed 2026-08-02.**
**Companion record:** `DR-WP1-irb-determination.md` (human-subjects question — separate).

---

## 1. The decision, in one paragraph

The researcher reports that **Oregon Metro has approved** redistribution of the RLIS-derived
street data and that **the City of Portland has approved** redistribution of the
campsite-report-derived products, relayed 2026-08-02, with the request that **both sources be
credited formally**, no particular citation format required. On that basis the project
proceeds with publication of the derived assets and stops treating redistribution as an open
ship-blocker. The attribution wording adopted in response is recorded in §5.

The researcher's words, verbatim: *"oregan metro has approved the city has approved just need
to say somewere, yea this was taken from them, formaly but no need for an exact citation."*

---

## 2. What evidence exists, and what does not — read this before citing §1

| | |
|---|---|
| **What exists** | The researcher's report that both bodies approved, relayed 2026-08-02, recorded in this file. |
| **What does not exist, anywhere in this repository** | A written determination from Oregon Metro. A written determination from the City of Portland. A licence text, a terms URL, a reference or ticket number, a named contact at either body, a date on which either approval was granted, or any correspondence with either body. |

**There is no paperwork in this repository, and none is claimed.** This record does not say
"Metro has granted permission" in the voice of a filed document, because no filed document
says it. It says the researcher reports that approval was given, which is what is true.

Two specific cautions for anyone reusing this record:

- **Do not infer scope from silence.** The report says "approved"; it does not record what
  question was asked, what was shown to either body, or whether either body saw the technical
  description in §4. The approval is recorded at the generality at which it was given.
- **Any future publication that needs documentary evidence must obtain it.** A journal, a
  funder, a data-repository deposit (`.zenodo.json` currently declares
  `"access_right": "open"` with an RLIS carve-out in free text), an institutional review of
  the deliverable, or any downstream party who asks "under what terms?" cannot be answered
  from this file. Getting that in writing is a real outstanding task, not a formality this
  record discharges. The draft inquiry letter that would do it for Metro still exists,
  unsent, at `WP1-metro-rlis-inquiry.md`.

This is the correct strength for the record. The WP1 grounding work exists because this
project has previously shipped prose slightly stronger than its evidence; recording a verbal
approval accurately is the outcome that workstream was for.

---

## 3. What the project uses from each source

### 3.1 Oregon Metro — RLIS street centerlines

**One layer, and only one.** A repo-wide search for `*.shp`/`*.dbf`/`*.prj` returns nothing
else from Metro (`WP1-GROUND-rlis.md` §1.1).

| Property | Value |
|---|---|
| Files | `Geography/data/Streets.{shp,dbf,shx,prj,cpg}`, 50,679,721 B total |
| Features | 112,070 PolyLine records, zero deleted |
| Attributes | 39 DBF columns |
| CRS as stored | EPSG:3857 (`WGS_1984_Web_Mercator_Auxiliary_Sphere`) |
| Extent | Multnomah 47,789 / Washington 33,754 / Clackamas 30,417 / Columbia 106 / Yamhill 4 |
| Vintage | files written 2026-03-12; feature updates through 2026-02-26 (`UPD_DATE` max) |
| `Streets.shp` SHA-256 | `f5e5e311b625f129f94fcf6d3150f8feb521ea5a79039ade43514ebfb35810a8` |
| Columns the model reads | 5 physical (`TYPE`, `FULL_NAME`, `STREETNAME`, `PDX_F_NODE`, `PDX_T_NODE`) |

**Provenance gap, unchanged by this decision.** No licence, metadata, attribution or
terms-of-use file was ever shipped with the data; the attribution to Metro is a *schema
inference*, not a supplier record; the download date, downloading party and RLIS release
identifier are unrecoverable (`LICENSE` L66–80; `Geography/data/README.md` L28–30;
`WP1-GROUND-rlis.md` §2.1, §6 items 1–4). The approval in §1 resolves *may we redistribute*.
It does not retroactively supply a release identifier or a provenance chain, and
`DATA_SOURCES.md` L35–38's "not citable as provenanced data" remains substantively true for
the citability question even once the licence row is updated.

### 3.2 City of Portland — Impact Reduction Program campsite reports

| Property | Value |
|---|---|
| File | `Geography/data/encampments/irp_campsite_reports_sample.csv`, 3,400 data rows |
| Publisher | City of Portland, Impact Reduction Program ("One Point of Contact"), collected via 311 and pdxreporter.org |
| Endpoint | ArcGIS Feature Service `COP_OpenData_Miscellaneous/MapServer/1396` on the City's open-data host |
| Retrieved | 2026-07-24 by `scripts/fetch-encampments.ps1`, 17 OBJECTID windows of 200 |
| Distinct coordinates | 3,317 from 3,400 reports (no de-duplication is performed anywhere) |
| Licence as recorded | the free-text phrase "City of Portland open data (public)" (`Geography/data/README.md` L166; `LICENSE` L89–91) — no licence text, no terms URL |

**Two facts about this feed that the approval does not change**, both from
`WP1-GROUND-encampment.md`: the City's live service retains only a rolling recent window
(zero 2020 records, `Geography/data/README.md` L169), so a frozen copy in a public repository
preserves reports the City would otherwise age out; and the total size of the City's
underlying dataset is not recorded anywhere, so "3,400" cannot be expressed as a fraction of
it (§6 item 5).

---

## 4. What the project publishes that is derived from each

This is the surface the approval has to cover, so it is enumerated rather than characterised.

### 4.1 Derived from RLIS

| # | What is published | Measured content |
|---|---|---|
| 1 | `graph-topology.bin` (2,704,134 B brotli) | 88,078 RLIS `PDX_*_NODE` ids plus 22 synthetic negatives, 88,100 nodes in all (`attr_node_ids` 88,078 + `sites_split_synthetic` 22 = `final_graph_nodes` 88,100), 88,100 exact reprojected junction coordinates as float64, 109,434 edges, Java-computed geodesic edge weights, CSR adjacency, the census (including `input_sha256` of the four source members), and the 25 correction records at full precision |
| 2 | `graph-geometry.bin` (4,320,498 B brotli) | 440,708 interior polyline vertices as lossless float64 lon/lat, plus 8 endpoint exceptions |
| 3 | `graph-names.bin` (229,773 B brotli) | per-edge name index + a 20,283-entry RLIS street-name table |
| 4 | `encampments-public.bin` | 2,482 published locations that **are RLIS graph-node coordinates**; 2,480 of its published identifiers are `PDX_*_NODE` values |
| 5 | 8 shipped shelter CSVs | 10 RLIS-graph-sited rows each, **80 rows** total; 79 of 80 sit exactly on an RLIS graph node at 6 dp (the one exception, a row in `shelters_2026_random_sites_r5.csv` 93.8 m off-node, is an open inconsistency noted in `WP1-GROUND-rlis.md` §4.4) |
| 6 | **The complete source shapefile** | All five `Streets.*` files are tracked in git from the repository's baseline commit `0637ce7` (2026-07-24), and the repository is public (§7). This is redistribution of the *source layer*, happening today — not a derived product. |
| 7 | Archived run outputs under `docs/runs/` | 51 `shelters.csv` files containing **510 rows** whose coordinates are RLIS graph-node positions; 136 `agents.csv` files whose distance columns (`network_dist_to_shelter_m`, `planned_route_m`, `total_travel_distance_m`, `snap_gap_m`) are computed on the RLIS-derived graph |

Graph bundle total: **7,254,405 B brotli (6.918 MB)** across items 1–3. Every one lists
`"source_file": "Geography/data/Streets.shp"` and the source SHA-256 in
`assets-manifest.json`.

*One correction worth preserving:* the per-agent `start_lon`/`start_lat` in the archived
`agents.csv` files are **not** RLIS positions. They are raw campsite-report coordinates at
6 dp (`ContextCreator.java` L743–746; `OutcomeLogger.java` L192–198). An earlier draft of
`WP1-GROUND-rlis.md` §6 item 9 guessed otherwise; the guess is wrong and must not be
repeated. Those coordinates belong to §4.2, not §4.1.

### 4.2 Derived from the City campsite feed

| # | What is published | Measured content |
|---|---|---|
| 1 | `encampments-display.json` (43,379 B) | 506 published grid cells, **0 below the k = 5 floor**, 99.1% of reports retained |
| 2 | `encampments-public.bin` (94,856 B) | 2,482 exact street-node coordinates at which at least one report snapped; per-node counts are trivially derivable (1,849 nodes carry exactly one report; 2,466 of 2,482 carry fewer than five). Dates and vehicle flags dropped; `inc_id` replaced by a salted hash |
| 3 | **The raw feed itself** | `irp_campsite_reports_sample.csv` is tracked in git and the repository is public, so all 3,400 rows with all five fields are already published |
| 4 | Archived run outputs under `docs/runs/` | 135 of 136 tracked `agents.csv` files carry `start_lon`/`start_lat`/`snap_gap_m`; across 918,865 rows with start coordinates, **all 3,400** municipal incident identifiers and **all 3,317** distinct coordinate pairs appear, at 6 dp |

*Correctly scoped out:* the 154 archived `simulation.json` files contain zero raw encampment
identifiers and zero raw encampment coordinate pairs; the 154 archived `shelters.csv` files
hold 106 distinct facility coordinate pairs for named public shelters, **zero** of which
equal a raw encampment coordinate. Do not describe either as an encampment exposure
(`WP1-encampment-policy-memo.md` §0.3).

**The disclosure controls are not superseded by this approval.** `DR-Q4-encampment-disclosure.md`
(k = 5 floor, per-build salt, deploy gate) exists for privacy reasons that have nothing to do
with redistribution rights, and its one open user decision — salt custody — is untouched.
Rights and disclosure are different questions; clearing one does not clear the other.

---

## 5. The attribution wording adopted

The researcher's only stated condition is that the sources be **credited formally somewhere**,
with no exact citation format required. The wording adopted in response is being written
under the same authorisation as this record, and lands in the repository's existing source
statements rather than in a new standalone file:

- **`LICENSE`** — §3 (L66–80, RLIS) and §4 (L89–91, the City feed).
- **`Geography/data/README.md`** — the RLIS licence row (L29–30) and the campsite-feed
  provenance rows (L164–166).
- **`docs/science/DATA_SOURCES.md`** — the D0 licence row (L29), the action-required
  paragraph (L35–38), and the D2b entry (from L270).

Those five statements are the ones that read "⚠️ **UNVERIFIED for redistribution**" or
equivalent *before this pass*, and they were the reason a reader would have concluded the
project had no rights to what it ships.

> **Verification state — updated 2026-08-02 after an independent check.** When this record
> was first written the attribution wording had **not** yet landed, and this block said so.
> It has since landed and been verified against the working tree: `LICENSE` §3 and §4,
> `Geography/data/README.md` (both the RLIS row and the campsite-feed row),
> `docs/science/DATA_SOURCES.md` (D0 and D2b) now each name their source and no longer mark
> the terms unverified. `git diff` over those files shows attribution text only. The former
> "⚠️ UNVERIFIED for redistribution" wording is gone from all of them.
>
> The check that still matters to a later reader is one of **strength, not presence**: each
> of those statements must continue to say that what exists is the researcher's *report* of
> approval, relayed 2026-08-02, with no written determination on file. If any of them is ever
> rewritten into the voice of a filed document — "Metro has granted permission", a licence
> name, a reference number, a contact, or an approval date — that is a regression against §2
> and must be reverted.

Whatever wording is adopted, two constraints follow from §2 and must hold: it must credit
Oregon Metro and the City of Portland as sources, and it must **not** assert a licence
identifier, a permission reference number, or a written determination that does not exist.
"Used with permission reported by the researcher" is defensible; "licensed under [X]" is not,
because no licence text was ever seen.

---

## 6. Two facts carried forward from the WP1 grounding work

Both remain true after the approval, and a future reader needs them, because both are
routinely understated inside this project.

### 6.1 The published street bundle is a lossless reconstruction, not "just a topology"

`graph-topology.bin` + `graph-geometry.bin` together are a **bit-exact, lossless
reconstruction of the full WGS84 centerline geometry of 109,434 of the 112,070 RLIS features
(97.6%)** — 88,100 node coordinates plus 440,708 interior polyline vertices plus 8 explicit
endpoint exceptions, at full IEEE-754 float64 precision, with `nodeCoordBitMismatches: 0`,
`polylineVertexMismatches: 0` and `edgeLengthBitMismatches: 0` in
`graph-assets.report.json`. It also carries **Metro's own `PDX_F_NODE`/`PDX_T_NODE` node
ids** and a **20,283-entry RLIS street-name table**.

This is deliberate, not accidental: `pack-graph.ts` L18–21 guarantees that nothing is
recomputed, and DR-S2 §6 S2-R1 explicitly rejected a 1.71 MB quantised variant in order to
keep it lossless. Anyone who downloads the two assets can rebuild the exact centerlines of
those 109,434 features.

What is *not* published: 34 of the 39 DBF columns, and the 2,636 excluded freeway-class
features (614.1 km), which survive only as five aggregate counts.

**Why this matters after approval.** The accurate description of the published product is *a
lossless geometric and topological derivative of 97.6% of the RLIS street centerline layer,
stripped to three attribute channels.* If anyone ever needs to describe the derived product
to Metro, to a reviewer, or in a paper, that is the sentence to use. "It's only a topology"
would not survive inspection and must not be written.

### 6.2 The k = 5 encampment floor protects REPORTS, not SITES

The k-anonymity floor on `encampments-display.json` guarantees that no published cell carries
fewer than five *reports*. It does **not** guarantee that no published cell corresponds to a
single *place*:

> **10 of the 90 finest published cells are backed by exactly one snapped street node**
> (cell counts of 5 or 6); **22 more are backed by exactly two.**
> (`WP1-encampment-policy-memo.md` §3.3, tabulated at §101 and §255–256.)

So in 10 of the 90 finest cells, a reader can infer that every report in that square came
from a single intersection somewhere inside it. The claim "no published square corresponds to
a single site" is **false** and appears in the memo's own error table as such.

Separately, the k floor is a property of **one file, not of the publication**: its sibling
`encampments-public.bin` publishes 2,482 exact street-node coordinates with per-node counts
derivable, and the gate's below-k detector is `.json`-only by construction and structurally
cannot see the binary (`WP1-GROUND-encampment.md` G3).

**Why this matters after approval.** The City's approval covers *redistribution*. It says
nothing about whether the granularity is appropriate, and the k = 5 headline must not be
quoted as though it settles that. Anyone repeating "k = 5, no cell below the floor" in a
paper or a UI tooltip is making a narrower claim than readers will hear.

---

## 7. Repository visibility — settled, and it changes the framing

**The repository is PUBLIC.** `https://github.com/fxa28196/REU.git` was retrieved on
**2026-07-31** and rendered a full public file listing and project description
(`WP1-metro-rlis-inquiry.md` §0.1b; `WP1-encampment-policy-memo.md` §0.3). This closes the
question that both grounding documents flagged as the single most important thing to
establish, and those passages are corrected in place as of 2026-08-02.

Consequence: for both sources, redistribution is **already happening**, and has been since at
least the date the remote became visible. The honest framing of the approval is therefore
*"we have been distributing this; the terms are now reported as permitting it"* — not *"we
were granted permission before we started."*

*Not established:* the date the repository became public. Git records when files were
committed, not when the remote's visibility was set. Do not assert a start date for the
redistribution.

---

## 8. What this record does and does not close

| Question | Status |
|---|---|
| May the project redistribute the RLIS-derived assets? | **Closed** by §1, at the strength described in §2. |
| May the project redistribute the campsite-derived products? | **Closed** by §1, at the strength described in §2. |
| Is the source shapefile's presence in a public repository covered? | **Reported as covered** — the approval was for "this was taken from them," and §4.1 item 6 is part of what is taken. Not separately confirmed. |
| Are the archived run outputs covered? | **Reported as covered** on the same basis (§4.1 item 7, §4.2 item 4). Not separately confirmed. |
| Is there documentary evidence? | **No.** §2. Outstanding for any publication that needs it. |
| Is there an RLIS release identifier / citable provenance? | **No** — unchanged. `DATA_SOURCES.md` L35–38's citability gap is a provenance problem, not a licence problem, and approval does not fix it. |
| Is the OSM fallback still needed? | **No longer a rights-driven requirement.** It was contingent on a refusal (`IMPLEMENTATION_PLAN.md` L842–843). It remains unspecified — no acquisition script, no extract, no converter, no ODbL analysis (`WP1-GROUND-rlis.md` §5.3). |
| Is the pre-existing OSM/Nominatim question closed? | **No.** All 36 shipped 2026 shelter coordinates are Nominatim geocodes, and the Esri World geocoder was used for `shelters_2020-09.csv`. Neither body's approval touches those, and neither has been analysed (`WP1-GROUND-rlis.md` §5.4, §6 items 11–12). |
| Are the encampment disclosure controls affected? | **No.** `DR-Q4` stands; salt custody is still open. |
| Is the human-subjects question closed? | Separately — see `DR-WP1-irb-determination.md`. |

---

## 9. What this supersedes

| Record | Item | Now |
|---|---|---|
| `WP1-metro-rlis-inquiry.md` | The entire draft letter | **Superseded, never sent.** Banner added 2026-08-02. Retained as the reasoning record and as the template if written evidence is ever needed. |
| `WP1-encampment-policy-memo.md` | §7 Decision L, the City licence question | **Superseded, never sent.** Banner added 2026-08-02. |
| `WP1-GROUND-rlis.md` §2.4, §6 item 6 | Repository visibility "cannot determine" | **Corrected in place** 2026-08-02: PUBLIC, verified 2026-07-31. |
| `WP1-GROUND-rlis.md` §6 item 3 | "The actual licence… somebody must read Metro's current terms" | **Corrected in place** 2026-08-02: answered by report, not by reading the terms. |
| `WP1-GROUND-encampment.md` §3.1, §4.1, §5, §6 item 1 | Repository visibility unresolved | **Corrected in place** 2026-08-02: PUBLIC. |
| `WP1-GROUND-encampment.md` §6 item 2 | City licence "unestablished" | **Corrected in place** 2026-08-02. |
| Plan acceptance `IMPLEMENTATION_PLAN.md` L628–630 | "written license outcome filed **or** timebox expiry" | Satisfied by neither branch literally. The outcome is a **reported verbal approval**, filed here. Recorded honestly rather than dressed as the written branch. |

---

## 10. One-line summary for anyone citing this later

Both source bodies are reported by the researcher to have approved redistribution, relayed
2026-08-02, on condition that they be credited; the project credits them; **no written
determination from either body exists in this repository**, so any publication needing
documentary evidence must obtain it first.
