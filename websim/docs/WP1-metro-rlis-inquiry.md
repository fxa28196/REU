> # ⛔ SUPERSEDED — 2026-08-02 — THIS LETTER WAS NEVER SENT
>
> **Outcome: the researcher reports that Oregon Metro approved redistribution of the
> RLIS-derived street data, relayed 2026-08-02, asking only that the source be credited
> formally.** The question this letter was drafted to ask has therefore been answered by
> other means, and the letter was never sent to Metro or to anyone else.
>
> **The decision record is `websim/docs/DR-WP1-data-rights.md`. Read that first.** It is the
> operative record; this file is not.
>
> **What the outcome is, stated at its true strength:** what exists is the *researcher's
> report* of approval. **No written determination from Oregon Metro is filed anywhere in this
> repository** — no letter, no email, no reference number, no named contact, no date of
> approval, no licence URL. Any future publication that needs documentary evidence must
> obtain it. If that becomes necessary, **this draft is the template to use** — its figures
> were independently re-derived on 2026-07-31 and are the reason it is retained rather than
> deleted.
>
> **Why this file is kept:** it is the reasoning record. Its §0.1a corrections, §0.1b
> visibility findings and the measured description of the derived product in the letter body
> remain the most complete account of what this project actually publishes from RLIS, and
> §6.1 of the decision record carries the load-bearing part forward.
>
> **Do not act on the instructions in the body below.** §0.1's fill-in table, §0.2's
> "where to find the contact", §0.3's pre-send checks and §0.4's "what to do with the answer"
> are all instructions for sending a letter that will not be sent. Two of them are also now
> stale: the repository-visibility question in §0.3 is answered (PUBLIC, verified 2026-07-31)
> and §0.4's "if the answer is no (c)" branch — rebuild from OpenStreetMap — is not being
> exercised.

---

# WP1 — Metro RLIS redistribution inquiry (DRAFT, not sent)

**Status:** draft for the user to review, fill in, and send personally. Nothing here has
been sent to anyone. Facts in the letter are sourced from `websim/docs/WP1-GROUND-rlis.md`;
where that document could not establish something, this draft says so rather than guessing.
**Two things that document lists as undetermined were determined on 2026-07-31** — repository
visibility (§6 item 6) and the RLIS content of the archived run outputs (§6 item 9) — and are
now stated here as fact. See §0.1b. `WP1-GROUND-rlis.md` §2.4, §6 item 6 and §6 item 9 still
carry the old "cannot determine" wording and are now stale; they were not edited by this pass.
*(Update 2026-08-02: §2.4 and §6 item 6 have since been corrected in place. **§6 item 9 has
not** — it still wrongly guesses that the archived `agents.csv` coordinates are RLIS graph
positions. §0.1b item 3 below is the correct account.)*

---

## PART 0 — NOTES TO SELF (do not send this part)

### 0.1 Fill in before sending

| # | Placeholder | Where it appears | Note |
|---|---|---|---|
| 1 | `[RECIPIENT NAME / TITLE]`, `[MAILING OR EMAIL ADDRESS]` | letter header | see §0.2 |
| 2 | `[YOUR NAME]` | opening line, sign-off | |
| 3 | `[YOUR INSTITUTION]`, `[REU PROGRAM NAME]` | opening line, sign-off | the host institution running the REU, and the program/site name if it has one |
| 4 | `[FACULTY MENTOR NAME, TITLE, INSTITUTION]` | opening line, sign-off | confirm your mentor is willing to be named and cc'd before you name them |
| 5 | `[MENTOR EMAIL]` | sign-off | |
| 6 | `[PROJECT / DEPLOYMENT URL — or "not yet public"]` | paragraph 3 | **"not yet public" is the verified answer today** — re-checked this pass: no `gh-pages` branch, no deploy workflow, no tracked build output, no CNAME, and the app is a scaffold with no map in it. Only change this if you have deployed something since; do not paste a live URL that already serves the assets |
| 7 | `[DATE YOU NEED A REPLY BY]` and `[EVENT/DEADLINE]` | timeline paragraph | give a real date and a real reason (symposium, semester end) |
| 8 | `[YOUR EMAIL]`, `[YOUR PHONE — optional]` | sign-off | |
| 9 | **Confirm the sentence "this copy was inherited with the project before I joined it" is true of you** | paragraph 4 | The repo establishes that the file was *supplied with the inherited project* and *predates version control here* (`LICENSE` L71–75, `Geography/data/README.md` L28). It does **not** establish anything about when you joined — that is yours to confirm. The file's only git appearance is commit `0637ce7`, 2026-07-24, authored by Fatima Asghar. If the wording is not accurate for you, say instead: "this copy was supplied with the inherited project and predates this repository's version control." Do not send an unverifiable personal claim to a public agency. |

### 0.1a Corrections applied by an independent re-check of this letter (2026-07-31)

Every figure in the letter was re-derived from `Streets.dbf`/`Streets.shp` and from the built
assets' own header bytes, not from this project's prose. Five statements did not survive.

| # | What the letter said | What is true |
|---|---|---|
| 1 | "Three of the 39 attribute columns survive … the other 36" | **Four** columns reach the published files — `FULL_NAME` *and* `STREETNAME` both feed the single name label. `TYPE` survives as five aggregate counts. **34** are never published. |
| 2 | "about 6.9 MB compressed, **plus** a table of 20,283 street names" | The name table is **inside** the 6.9 MB (it is `graph-names.bin.br`, 229,773 B of the 7,254,405 B total). "Plus" implied an extra file. |
| 3 | "**Two** smaller published files … but **no further RLIS attributes**" | **Nine** files, and the encampment binary does carry further RLIS attributes: 2,480 of its 2,482 published node identifiers are `PDX_*_NODE` values. |
| 4 | "affecting 25 node sites … roughly 107657–107723" | 25 affected node **identifiers**, spanning **107657–107722** in our census; the 107723 upper bound is our source comment's approximation, not a measured value. Displacements run 1,654.7 m to 18,562.3 m. |
| 5 | `DATA_SOURCES.md` "L35–38 … says the terms are UNVERIFIED" | The UNVERIFIED **licence row** is L29; L35–38 is the separate action-required paragraph. Both need updating. |

Verified unchanged and correct: the `Streets.shp` SHA-256; 112,070 features with 0 deletion
flags; 39 DBF columns; EPSG:3857 from the `.prj`; shapefile type 3 (PolyLine); DBF header date
2026-03-12 and `UPD_DATE` maximum 2026-02-26; the five freeway `TYPE` codes summing to exactly
2,636; the county split (MULT 47,789 / WASH 33,754 / CLAC 30,417 / COLU 106 / YAMH 4); 88,100
nodes; 109,434 edges; 440,708 interior vertices; 20,283 unique street names; 6.918 MB brotli
total. The letter contains no coordinate and no personal data; the project's claim linter is
clean over it.

### 0.1b Repository visibility and archived outputs — determined 2026-07-31

The letter used to hedge on both of these. It no longer does, because both were checked.

**1. The repository is PUBLIC.** `https://github.com/fxa28196/REU.git` was fetched on
2026-07-31 and rendered a full public file listing and project description. This closes
`WP1-GROUND-rlis.md` §6 item 6.

**2. The five source `Streets.*` files are tracked.** `git ls-files Geography/data/Streets.*`
returns all five (`.cpg`, `.dbf`, `.prj`, `.shp`, `.shx`). Re-verified in this pass. They
entered version control at commit `0637ce7`, 2026-07-24, the repository's baseline commit.
Public repository + tracked files = **the complete source shapefile is being redistributed
today.** That is why paragraph 6 is now a disclosure rather than a bracketed maybe, and why
the letter no longer says "before anything of ours goes online."

*What is not established:* the date the repository became public. Git records when the files
were committed, not when the remote's visibility was set. Do not assert a start date for the
redistribution — say "it is public today," which is what was verified.

**3. Archived run outputs carry RLIS-derived content, but not the content that was expected.**
`WP1-GROUND-rlis.md` §6 item 9 guessed that the per-agent `agents.csv` coordinates were
positions on the RLIS graph. **That guess is wrong, and the letter must not repeat it.**
Verified this pass:

| Claim | Verified result |
|---|---|
| `agents.csv` files tracked under `docs/runs/` | **136** (`git ls-files`) |
| …carrying `start_lon` / `start_lat` / `snap_gap_m` | **135 of 136.** One file predates the schema and has none of the three. |
| Are `start_lon`/`start_lat` RLIS graph positions? | **No.** They are the raw campsite-report coordinate at 6 dp, copied straight from the source feed. `ContextCreator.java` L743–746 calls it "the **real campsite-report coordinate**"; `OutcomeLogger.java` L192–198 formats it at `%.6f`. The snapped RLIS node is computed (`network.nearestNode`) and held as `startNodeId`, but **no node-id column is written to any of the four header variants.** |
| What in `agents.csv` *is* RLIS-derived | the distance columns — `network_dist_to_shelter_m`, `planned_route_m`, `total_travel_distance_m`, `snap_gap_m` — all computed on the RLIS graph. Scalars, not coordinates. |
| `shelters.csv` files tracked under `docs/runs/` | **154** |
| …carrying rows whose `lon`/`lat` **are** RLIS graph-node coordinates | **51 files, 510 rows** — `NEW_optimized_site_*` ×330 and `NEW_random_site_*` ×180. These are the arm-C and random-siting new sites, sited on the RLIS graph per `WP1-GROUND-rlis.md` §4.4. The run outputs drop the `coord_source` column, so the provenance is only visible from the source tables. |

So the honest statement is: **RLIS-derived coordinates are already public in the archived
shelter outputs, and RLIS-derived distances in the archived agent outputs** — not "the agent
coordinates are RLIS positions." Paragraph 6 says it that way.

*Separate matter, flagged not drafted:* the campsite feed itself
(`Geography/data/encampments/irp_campsite_reports_sample.csv`, 3,400 data rows, tracked) is
**City of Portland open data**, retrieved from the City's public ArcGIS feature service via
`scripts/fetch-encampments.ps1` on 2026-07-24 (`Geography/data/README.md` L159–171). The City
publishes it; this is not a leak of confidential information and must not be described as one.
It is **not Metro's data and not this letter's business** — do not raise it with Metro. It
belongs in the mentor/IRB memo, where the live questions are (i) the City feed retains only a
rolling recent window (zero 2020 records, README L169), so a frozen public copy preserves
reports the City would otherwise age out; and (ii) the terms are recorded only as the
free-text phrase "City of Portland open data (public)" (README L166, `LICENSE` L89–90) — no
licence text, no terms URL, no written determination.

### 0.2 Where to find the Metro Data Resource Center contact

**I could not verify any contact details.** No network access was used in preparing this,
and the repository contains no Metro correspondence, contact record, or acquisition record
of any kind. Every lead below is a place to *look*, not a verified address. Confirm the
recipient yourself before sending.

1. **`oregonmetro.gov`** — the Data Resource Center is the Metro department that owns RLIS.
   Look for the DRC's own pages and for a data-services request form or a named data
   steward. A department contact form is a perfectly good destination for this letter.
2. **`gis-pdx.opendata.arcgis.com`** — this is the URL the project's own `LICENSE`
   (L78–79) and `docs/science/DATA_SOURCES.md` (L35–36) name as the official distribution
   point; I confirmed both lines, but not that the URL still resolves. Open
   data portals usually attach a terms page and a steward contact to each dataset. Start
   there: **it may answer the whole question without a letter** (see §0.3 item 1).
3. **Your institution's GIS librarian or geography/planning department.** Portland-area
   institutions frequently hold RLIS data-use agreements already; if yours does, the answer
   may be "you are covered under our agreement, here is the attribution string."
4. **Your faculty mentor.** Same reason, and mentor sign-off on the letter is needed anyway.

### 0.3 Do these two things before you send

*(The old item 2 — "check whether the repository is public" — is answered. It is public; see
§0.1b. Paragraph 6 now states that outright and there is no bracketed choice left to make.)*

1. **Read Metro's current published RLIS terms first.** `WP1-GROUND-rlis.md` §6 item 3 is
   explicit that nobody has done this yet. If the published terms already permit derived
   redistribution with attribution, this letter shrinks to a one-line confirmation request —
   or becomes unnecessary. Sending a long letter that their own website already answers
   wastes a data steward's time and yours. Note this no longer makes the letter *skippable*:
   even if the terms cover the derived product, the source shapefile is out there and you
   still want that confirmed in writing.
2. **Fix two inaccurate statements in the repo first** (`WP1-GROUND-rlis.md` §2.3), because
   both are outside `websim/` and are the kind of thing that surfaces if Metro looks at the
   project:
   - `Geography/src/.../ContextCreator.java` L46 calls the layer "City-of-Portland RLIS."
     RLIS is an **Oregon Metro** program. Writing to Metro while your source code credits
     the City is avoidable.
   - `IMPLEMENTATION_PLAN.md` L113 calls the streets asset "license-clean," which asserts
     the exact thing this letter exists to determine.

### 0.4 What to do with the answer when it arrives

- **File the written reply verbatim** as a decision record in `websim/docs/`. Plan WP1
  acceptance (`IMPLEMENTATION_PLAN.md` L628–630) is "written license outcome filed or
  timebox expiry → OSM-fallback decision record." An email counts; a phone call does not
  until you have written it up and had it confirmed in writing.
- **If the answer is yes (a or b):** put their exact attribution string on the provenance
  screen and in the asset manifest, and update `LICENSE` §3, `Geography/data/README.md`
  L28–30, and `docs/science/DATA_SOURCES.md` — all three currently say the terms are
  UNVERIFIED. In `DATA_SOURCES.md` that is **two separate places**: the licence row at L29
  ("⚠️ Unverified for redistribution") and the action-required paragraph at L35–38. If they
  supply a release identifier, that also closes the "not citable as provenanced data" gap at
  L35–38.
- **If the answer is no (c):** it now has a second half. Rebuilding from OSM replaces the
  *derived* assets, but a refusal would also cover the **source shapefile that is public in
  the repository today** and the archived outputs described in §0.1b. Untracking a file in a
  new commit removes it from the working tree, not from the history a clone still fetches —
  so scope that work honestly when you plan it, and say so in the reply if they ask how fast
  you can comply. Beyond that: the OSM fallback is *your personal* call, not an automatic
  one — plan L842–843 makes you the approver, because it drops the Tier 1/4 graph claims to
  a Tier-3 epsilon corridor and orphans the archived-run oracle. Before approving it, read
  `WP1-GROUND-rlis.md` §5.3: there is no OSM acquisition script, no extract, no converter,
  and no ODbL analysis anywhere in the repo. It is a named intention, not a prepared path.
- **Either way:** the determination governs four things, not just the graph assets — the
  graph bundle, `encampments-public.bin`, the shipped shelter CSVs (`WP1-GROUND-rlis.md`
  §4.4, §8 item 3), **and** the source shapefile plus archived run outputs that are already
  public in the repository (§0.1b). Apply the outcome to all four.
- **If no reply by your timebox:** record the timebox expiry, the dates you wrote, and what
  you did — that record is what makes the fallback defensible.

---
---

## PART 1 — THE LETTER

*Everything below this line is the draft to send.*

> **Before you send it, read paragraph 4 again.** It contains one sentence the repository
> cannot verify — "this copy was inherited with the project before I joined it" — and it is
> the only claim in the letter that rests on you rather than on a file. Item 9 in §0.1 gives
> a verified replacement wording. Every other factual assertion below was re-derived from the
> data files in this session.

---

**To:** [RECIPIENT NAME / TITLE], Data Resource Center, Oregon Metro
[MAILING OR EMAIL ADDRESS]

**Subject:** Redistribution question — derived pedestrian network built from RLIS street
centerlines (academic research project)

Dear [RECIPIENT NAME],

I am [YOUR NAME], an undergraduate researcher in the [REU PROGRAM NAME] at
[YOUR INSTITUTION], working with [FACULTY MENTOR NAME, TITLE, INSTITUTION]. We would like a
written determination about redistributing a product derived from RLIS street centerlines.
I should say at the outset that part of this is not a hypothetical: our research repository
is public and the source layer is in it. I set that out fully further down, and we will do
whatever you tell us about it.

**The research.** We have built an agent-based simulation of wildfire-smoke shelter access
for people experiencing homelessness in the Portland region: simulated individuals walk the
street network to smoke-relief shelters during a smoke episode, and the model measures who
reaches shelter and who does not. It is non-commercial academic work.

**What we hold, and how we got it.** One RLIS layer — the street centerlines, as a five-file
shapefile (`Streets.shp/.dbf/.shx/.prj/.cpg`): 112,070 polyline features, 39 attribute
columns, EPSG:3857, covering the Portland metropolitan region (Multnomah, Washington and
Clackamas county codes, plus a few features in Columbia and Yamhill). The files were written
2026-03-12 with feature updates through 2026-02-26; the SHA-256 of `Streets.shp` is
`f5e5e311b625f129f94fcf6d3150f8feb521ea5a79039ade43514ebfb35810a8`. I should be
straightforward: this copy was inherited with the project before I joined it, and **we have
no record of who obtained it, from where, or under what terms.** No license or metadata file
came with it. That gap is why I am writing rather than assuming.

**What we would publish.** A static, public web page
[PROJECT / DEPLOYMENT URL — or "not yet public"] shipping a derived pedestrian network, not
the source shapefile: 88,100 nodes and 109,434 undirected edges, built by dropping the 2,636
limited-access freeway features (`TYPE` 1110, 1120, 1121, 1122, 1123) that pedestrians cannot
walk, reprojecting to WGS84, and recomputing edge lengths geodesically. Four of the 39
attribute columns reach the published files: `PDX_F_NODE` and `PDX_T_NODE` as node
identifiers, and `FULL_NAME`/`STREETNAME` collapsed into a single street-name label. `TYPE`
survives only as five aggregate exclusion counts, never per feature. The remaining 34
(address ranges, ZIPs, jurisdictions, CFCC, dates, the various name identifiers) are not
published at all, and neither are the excluded features. One point I want to be candid about:
so the map draws correctly and walking distances stay exact, the line geometry is carried
losslessly rather than simplified — 88,100 node coordinates plus 440,708 interior vertices at
full precision — which means someone who downloads it could reconstruct the exact centerlines
of those 109,434 features. We are not describing this as "just a topology." The bundle is
about 6.9 MB compressed in total, and that figure already includes the 20,283-entry street
name table and a 25-record correction census (the data defect described below, with its node
identifiers, coordinates and street names). Separately, **nine smaller files in the same
publication set** also
carry RLIS-derived content: one binary encampment-density asset, whose 2,482 published
locations are RLIS graph-node coordinates and 2,480 of whose identifiers are `PDX_*_NODE`
values, and eight shelter tables whose ten new-site rows each were sited from the RLIS graph.
Whatever you decide would cover those too.

**Our question.** May we publish that derived network publicly? Any of these answers is
useful, and we expect one of them is easy:

**(a)** Yes, with attribution.
**(b)** Yes, provided we use particular attribution wording or terms — tell us and we will use
them exactly.
**(c)** No, in which case we will rebuild the network from OpenStreetMap, remove the
RLIS-derived assets, and withdraw the source files described in the next paragraph. We would
rather not, since it costs us the reproducibility of our published results, but a clear no is
a good answer and we will act on it.

Alongside that: **what attribution text would you like displayed?** And **is there an existing
RLIS license or data-use agreement that already answers this?** If so, pointing us at it is
the whole reply. If you can also give us a release identifier for this vintage, we can cite
the data properly.

**The part that is already happening.** I would rather you heard this from us than found it.
All five source files — `Streets.shp`, `.dbf`, `.shx`, `.prj`, `.cpg` — are tracked in our
project's Git repository, and that repository is public. They have been under version control
since the repository's first commit on 2026-07-24; I cannot tell you the date it became
publicly visible, only that it is public now. So the complete RLIS street centerline layer is
being redistributed from our repository today. We are not asking whether we may do that — we
are telling you that we are, and asking you to tell us the terms so that we can comply with
them. If the terms permit it with attribution, we will add exactly the attribution you
specify. If they do not, we will withdraw the files, and we will treat "remove them" as
including the repository's history rather than just its current state.

The same repository holds our archived model outputs, and those carry RLIS-derived content
too. 154 per-run shelter tables are tracked; 51 of them contain 510 rows whose coordinates
are positions of RLIS graph nodes, because those shelter sites were placed on the network.
136 per-agent result tables are tracked, and their distance columns — network distance to
shelter, planned route length, distance travelled — are all computed on the RLIS-derived
graph. Whatever you decide should cover those as well. For completeness so you are not asked
to rule on something that is not yours: the point coordinates in the per-agent tables are not
RLIS positions — they come from a separate City of Portland open-data layer.

**Something we can offer.** We found what looks like a data defect: a block of
`PDX_F_NODE`/`PDX_T_NODE` values — our validation notes describe it as roughly 107657–107723 —
where one node identifier is claimed by features far apart. In our processed graph exactly **25
node identifiers** required correction, spanning 107657–107722, with the two claimed locations
of a single identifier separated by between about 1.7 km and 18.6 km. We work around it and
hold full per-record provenance. If that is useful to your data team we will write it up
however you prefer, regardless of your answer here.

**Timeline.** A reply by [DATE YOU NEED A REPLY BY] would help us, because [EVENT/DEADLINE].
Until we hear from you we publish nothing further: no web deployment of the derived network
exists today and we will not create one, and no new RLIS-derived assets go out. The
repository described above is the exception, and it stays
as it is only until you tell us otherwise — if you would like the source files taken down
while you consider the wider question, say so and we will do that first and answer the rest
afterwards. If that date is difficult, even a one-line note saying which of (a), (b) or (c)
applies would let us plan — and if this belongs with someone else, I would appreciate being
pointed there.

Thank you for your time, and for maintaining RLIS.

Sincerely,

[YOUR NAME]
[REU PROGRAM NAME], [YOUR INSTITUTION]
[YOUR EMAIL] · [YOUR PHONE — optional]

cc: [FACULTY MENTOR NAME], [MENTOR EMAIL]

*If it would help, we are glad to send the technical description of the derived product, the
processing code, or a sample of the published files.*
