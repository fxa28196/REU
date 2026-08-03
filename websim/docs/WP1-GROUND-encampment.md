# WP1-GROUND — Encampment data: what this project holds, what the browser port would publish, and what is still an open decision

Status: **ground-truth record, not a decision record.** Produced for the WP1
rights/ethics track (plan §8 WP1, §10 item 1) so that the memo to the mentor/IRB
and any correspondence with the City rests on measured facts rather than on the
plan's own prose. Companion to `DR-Q4-encampment-disclosure.md`, which decides;
this file only establishes.

**Constraint honoured by this file: it contains zero raw coordinates and zero
raw encampment identifiers.** Field names, aggregate counts, design constants
and distribution shapes only. Every claim below is either cited to a file and
line, or re-derived by a command recorded in §7, or explicitly marked as a gap.

**Verification date:** 2026-07-31, against working tree at commit
`de7c045` (`de7c0455c1c1dd8769982271c8d3665d103cc7d6`, dirty).

---

## 0. The five findings that matter, before the detail

| # | Finding | Where |
|---|---|---|
| **G1** | All three numbers on the record — **506 published cells, 0 below k, 99.1 % of reports retained** — **verify exactly** against the built asset and against a fresh re-derivation. | §2 |
| **G2** | The raw feed is **not** confined to the git-ignored path. A **byte-identical copy is tracked in git** at `Geography/data/encampments/`, and `deploy-check.ts` deliberately falls back to it. The `websim/.gitignore` comment "never enter git" is true of the websim subtree only, not of this repository. | §3.1 |
| **G3** | The k = 5 floor protects the **display JSON only**. Its sibling published asset `encampments-public.bin` discloses, for **2,482 exact street-node coordinates**, that at least one campsite report snapped there — and per-node report counts are trivially derivable from it: **1,849 nodes carry exactly one report; 2,466 of 2,482 carry fewer than five**. The gate's below-k detector is `.json`-only by construction and structurally cannot see this file. This is Q4's *sanctioned* node-snapped default, but it is a materially stronger disclosure than the 506-cell grid, and no existing record reconciles the two. | §2.4, §4.2 |
| **G4** | **Nothing consumes `encampments-public.bin`.** The engine's world builder reads the **raw CSV path** and carries raw `lon`/`lat`/`inc_id` into every resident and into the `agents.csv` export (including a per-agent snap gap, the exact quantity the disclosure record says must never be published per report). The port is therefore *not yet wired* to its own disclosure control. The UI does not exist yet, and the raw CSV is **not** currently in the built asset directory — so nothing has leaked; but this must be closed before any deploy. | §4.3 |
| **G5** | **Salt material cannot reach public output** on the evidence available: three independent controls, all exercised, gate verified green on the real bytes. One structural weakness: **nothing binds a salt to the build it came from**, so the gate can be satisfied vacuously by a salt from a different build. | §3.3 |

---

## 1. The source data

### 1.1 Provenance

| Property | Value | Citation |
|---|---|---|
| Dataset id in this project | **D2b** | `docs/science/DATA_SOURCES.md:270` |
| Publisher | **City of Portland**, Impact Reduction Program ("One Point of Contact") campsite reports, collected via 311 and pdxreporter.org | `Geography/data/README.md:164`; `docs/final/TECHNICAL_REFERENCE.md:258` |
| Endpoint | ArcGIS Feature Service `COP_OpenData_Miscellaneous/MapServer/1396`, on the City's open-data host | `Geography/data/README.md:164`; `scripts/fetch-encampments.ps1:31` |
| Licence as recorded | "City of Portland open data (public)" | `Geography/data/README.md:166` |
| Retrieved | **2026-07-24**, by `scripts/fetch-encampments.ps1` | `Geography/data/README.md:165` |
| Retrieval method | Systematic sample across the OBJECTID range: 17 windows × 200 records, stride 4,000, filtered `duplicate=0`, ordered by OBJECTID, geometry returned in EPSG:4326 | `scripts/fetch-encampments.ps1:23-27,41-47` |
| Precision as stored | Coordinates **rounded to 6 decimal places at fetch time** | `scripts/fetch-encampments.ps1:51-52` |
| File | `Geography/data/encampments/irp_campsite_reports_sample.csv` | — |
| SHA-256 | `3e557de5db4668c5d30fd7a6fc13bcc38b5e37bab4b9becaf9b3dc35366285ca` | verified §7; matches `Geography/data/README.md:163` |

**This is a sample, not the whole feed.** The retrieval walks the OBJECTID range
in windows; it is explicitly not a census of the service, and the fetch script
says the reproducible quantity is the *spatial distribution*, not the exact rows
(`Geography/data/README.md:167`).

### 1.2 Fields (names only)

The CSV header carries exactly five columns:

```
lon, lat, inc_date, inc_id, is_vehicle
```

Verified by reading the header line (§7). Matches the plan's inventory at
`docs/IMPLEMENTATION_PLAN.md:472`.

Of these, the public builder reads **three** — `lon`, `lat`, `inc_id`
(`pipeline/scripts/build-encampments.ts:189-193`) — and drops `inc_date` and
`is_vehicle` entirely: they are "never read, never hashed, never counted"
(`build-encampments.ts:22-23`). Confirmed structurally: `RawReport` has only
`lon`, `lat`, `incId` fields (`build-encampments.ts:130-134`), so the dropped
columns have no representation anywhere downstream of the parser.

### 1.3 Size and time period

| Quantity | Value | How established |
|---|---|---|
| Data rows | **3,400** | re-counted; matches `Geography/data/README.md:163` |
| Distinct coordinate pairs | **3,317** | re-counted (§7) |
| Distinct `inc_id` values | **3,400** — every row has a unique identifier | re-counted (§7) |
| Rows dropped by the parser as malformed | **0** | builder console output; `parseEncampmentCsv` skip counter |
| Earliest `inc_date` | **2025-01-08** | re-derived; matches `Geography/data/README.md:167` |
| Latest `inc_date` | **2026-07-23** | re-derived; matches `docs/final/TECHNICAL_REFERENCE.md:263` |
| Rows by calendar year | 2025: **2,400**; 2026: **1,000** | re-derived (§7) |
| `is_vehicle` distribution | two values present, split **2,117 / 1,283** | re-derived (§7) |
| Geographic extent | Portland city extent; the exact bounding box is recorded at `Geography/data/README.md:166` and is deliberately not reproduced here | — |

**The temporal caveat is the project's own and is load-bearing.** The City's
open feed retains only a rolling recent window and holds **zero records for
2020**, the year the simulation models. The 2025–26 points are used as a
*spatial-distribution proxy*, and the Java model prints a warning to that effect
on every run (`docs/final/TECHNICAL_REFERENCE.md:265-275`; the ported warning is
at `engine/src/world/build.ts:372-375`).

**The reporting bias is also the project's own.** These are complaint-generated
reports (311 / web), so they are biased toward camps visible from the street and
are not a census of unsheltered people
(`Geography/data/README.md:167`; `docs/final/TECHNICAL_REFERENCE.md:277-278`).

### 1.4 What kind of data this is, stated plainly

3,400 six-decimal-place locations of reported homeless encampments in a single
city, each with a stable municipal incident identifier, each dated, over an
18-month window ending eight days before this record was written. The project's
own risk register classes republishing them as a **targeting / sweep-facilitation
risk** and a **critical ship-blocker** (`docs/IMPLEMENTATION_PLAN.md:780`, risk
W2; original framing at `:720`, risk R1). Nothing in this document disputes that
classification.

---

## 2. What the disclosure-control pipeline actually does

Implementation: `pipeline/scripts/build-encampments.ts` (913 lines).
Gate: `pipeline/scripts/deploy-check.ts` (585 lines).

### 2.1 The transformation chain, in order

1. **Parse** — `parseEncampmentCsv` mirrors the Java `CsvLoader`/`ContextCreator`
   semantics exactly, including silently skipping rows whose coordinates fail to
   parse, because that behaviour defines which reports exist in the model
   (`build-encampments.ts:173-216`).
2. **Snap** — every report's coordinate is replaced by the coordinate of the
   **nearest street node** in degree space, using the same nearest-neighbour rule
   the engine uses, with the coincident-coordinate tie-break imported from the
   engine so asset and runtime cannot drift (`build-encampments.ts:270-304`). The
   raw coordinate does not survive this step into any output.
3. **Deduplicate per node** — a node many reports share is carried once, in
   ascending node-index order "so the table order carries no trace of report
   order or report dates" (`build-encampments.ts:610-627`).
4. **Pseudonymise** — `inc_id` becomes `SHA-256(salt ‖ ":" ‖ inc_id)` truncated
   to 12 hex characters / 6 bytes (`build-encampments.ts:577-580`;
   `shared/src/graph-asset.ts:768`).
5. **Drop** — `inc_date` and `is_vehicle` never enter the pipeline (§1.2).
6. **Aggregate for display** — a fixed ≥ 150 m grid density surface, then
   k-anonymity (§2.2).
7. **Withhold snap gaps** — per-report distance from its snapped node is computed
   but written **only** to the git-ignored local report, because "a per-report
   distance from a public node is a circle through the raw location"
   (`build-encampments.ts:28-31, 602-607`).

### 2.2 The grid and aggregation scheme, precisely

| Property | Value | Citation |
|---|---|---|
| Origin | **lon −180, lat −90** — absolute and data-independent, "so a cell index reveals nothing" | `build-encampments.ts:83` |
| Design band | latitude **45.0 – 46.0**, fixed, not derived from the data; a report outside it fails the build | `build-encampments.ts:79`, `:494-502` |
| Minimum cell size | **150 m** in both directions anywhere in the band | `build-encampments.ts:81`, `:337-351` |
| Step (longitude) | 0.001936401598526039° | built asset `grid.stepLon` |
| Step (latitude) | 0.0013497493447979243° | built asset `grid.stepLat` |
| Realised cell at Portland's latitude (~45.5) | **≈ 151.3 m E–W × 150.0 m N–S** | computed (§7) |
| Cell index | `i = floor((lon − originLon)/stepLon)`, `j = floor((lat − originLat)/stepLat)` | `build-encampments.ts:503-504` |
| Weighting | one count per **report**, attached to its snapped node, so a node absorbing several reports contributes its full weight | `build-encampments.ts:629-639`, `:658-673` |
| k-anonymity floor | **k = 5** | `build-encampments.ts:106` |
| Merge rule | a cell below k folds into its parent `(floor(i/2), floor(j/2))` — a quadtree on the same absolute origin — and is re-tested one level coarser | `build-encampments.ts:432-444` |
| Level semantics | level L spans `150 m × 2^L`; **indices are level-relative**, and `level` is mandatory on every published cell | `build-encampments.ts:353-363` |
| Merge cap | **level 5** = 4.8 km nominal (≈ 4.84 × 4.80 km realised at 45.5); anything still below k there is **suppressed and counted** | `build-encampments.ts:123`, `:428-431` |
| Published cell record | `{ i, j, level, count }` — no coordinates | built asset, verified (§7) |

Two properties the design rests on, both asserted in code and covered by tests:

- **every published count is ≥ k** — nothing is published untested
  (`build-encampments.ts:420-426`; test `encampments.test.ts:228, 248, 288`);
- **a published parent cell can never be read back down to a single child** —
  its count is the sum of children that *failed* k, each ≤ k−1, so a parent
  reaching k needs at least two non-empty children
  (`build-encampments.ts:394-398`).

### 2.3 The three numbers on the record — VERIFIED

Re-derived directly from the built asset
`pipeline/out/assets/encampments-display.json` and cross-checked against the
git-ignored build report `pipeline/local-raw/encampments-local-report.json`
(command in §7).

| Claim on the record (`DR-Q4:73`) | Verified value | Verdict |
|---|---|---|
| **506 cells survive** | `cells.length = 506`; `levelCensus` L0 90 + L1 164 + L2 124 + L3 99 + L4 18 + L5 11 = **506** | ✅ exact |
| **zero cells below threshold** | `cellsBelowK = 0`; recomputed `cells.filter(count < 5).length = 0`; `minPublishedCount = 5`, and the observed minimum count is **5** | ✅ exact |
| **99.1 % of points retained** | `published = 3371`, `total = 3400`, `suppressed = 29` in `suppressedCells = 10`. 3371 / 3400 = **99.1471 %** | ✅ exact; "99.1 %" is a correct 3-significant-figure rounding, not a rounded-up figure |

Supporting census, also verified:

- **Before the pass** (the layer that was measured but never published):
  **1,863** base cells, **1,773** of them below k, holding **2,844** reports,
  smallest cell count **1**.
- The DR's decomposition of that base grid (1,100 cells with 1 report; 379 with
  2; 190 with 3; 104 with 4; 90 at 5 or more) is internally consistent:
  1,100 + 379 + 190 + 104 = 1,773 ✅ and
  1,100 + 758 + 570 + 416 = 2,844 ✅.
- **Conservation holds:** published 3,371 + suppressed 29 = 3,400 = every report
  in the feed. The builder asserts this and refuses to write if it fails
  (`build-encampments.ts:519-526`).
- Largest published cell count: **14**.

**Test coverage of the floor:** `pipeline/test/encampments.test.ts` (29 tests)
and `pipeline/test/deploy-check.test.ts` (27 tests) both pass — **56/56**,
re-run 2026-07-31 (§7). Notably `encampments.test.ts:216` asserts the builder's
`DISPLAY_MIN_CELL_COUNT` and the gate's independently-declared
`PUBLISHED_MIN_CELL_COUNT` are equal, so lowering one silently cannot relax the
other; and `deploy-check.test.ts` proves the gate's exit codes through the CLI
against deliberately poisoned fixtures ("exits non-zero on a below-k cell and on
a leaked salt, and zero on a clean build").

### 2.4 What the floor does **not** cover — the sibling binary

`DISPLAY_MIN_CELL_COUNT` is applied inside `buildDisplayGrid`, which produces
`encampments-display.json` and nothing else. The other published artefact,
`encampments-public.bin`, is assembled separately at
`build-encampments.ts:641-656` and is not subject to any count floor.

Its sections, read from the container header of the built file (§7):

| Section | Length | What it is |
|---|---|---|
| `camp_node_index` | 2,482 × int32 | index into the public topology node table |
| `camp_node_id` | 2,482 × int32 | graph node id |
| `camp_node_lon` | 2,482 × float64 | **exact street-node longitude** |
| `camp_node_lat` | 2,482 × float64 | **exact street-node latitude** |
| `camp_row_slot` | 3,400 × int32 | per report, in file order: which of the 2,482 nodes |
| `camp_row_hash` | 3,400 × 6 bytes | salted, truncated `inc_id` pseudonym |

Header counts: `rows 3400, nodes 2482, order_ambiguous_snaps 7`.

Because `camp_row_slot` is published, the per-node report count is a one-line
computation for anyone holding the file. Re-derived:

| Reports at a node | Nodes |
|---|---|
| 1 | **1,849** |
| 2 | 428 |
| 3 | 149 |
| 4 | 40 |
| 5 | 9 |
| 6 | 6 |
| 7 | 1 |

**2,466 of 2,482 nodes (99.4 %) carry fewer than five reports; 1,849 carry
exactly one.** The DR's own argument against the pre-fix display layer — "a
150 m cell with a count of 1 is a campsite location to within a city block"
(`DR-Q4:22-23`) — applies here with more force, because a node coordinate is
exact rather than a 150 m cell, and the snap displacement is small (the
distribution is in the git-ignored local report and is deliberately not
reproduced here; it is materially finer than a 150 m cell).

Two things must be said fairly alongside that:

- **This is the sanctioned Q4 default, not a defect against spec.** Q4's public
  default *is* "node-snapped coordinates (nearest street node, the sim-relevant
  quantity)" (`IMPLEMENTATION_PLAN.md:596`, asset table `:327`). Node-level
  granularity was the decision; the k = 5 floor was added later and only to the
  display layer.
- **The node coordinates themselves are already public** — all 88,100 graph
  nodes ship in `graph-topology.bin`. What `encampments-public.bin` adds is the
  *selection*: which 2,482 of them had a campsite report, and how many.

The gate cannot catch this even in principle: `scanDisplayGrid` returns
immediately for any file not ending in `.json`
(`deploy-check.ts:228-231`), so the below-k detector structurally never inspects
a `.bin`. That is a correct reading of its stated scope, not a bug in it — but
it means the k = 5 property is a property of one file, not of the publication.

**No existing record reconciles §2.3 with §2.4.** That reconciliation is a
decision, and it belongs in §5.

---

## 3. The raw path, git, and the salt

### 3.1 Where raw data lives — and the claim that does not hold

`websim/.gitignore:19-23` reads:

```
# --- plan Q4: git-ignored LOCAL RAW encampment path --------------------------
# Raw encampment coordinates/inc_ids live ONLY here and never enter git or any
# public asset. Public builds use node-snapped + salted-hash assets; the deploy
# job greps published assets for raw coordinates and raw inc_ids.
pipeline/local-raw/
```

**The ignore rule works.** `git check-ignore -v` confirms
`websim/pipeline/local-raw/irp_campsite_reports_sample.csv` and
`websim/pipeline/local-raw/encampment-salt.txt` are both matched by
`websim/.gitignore:23`, and `websim/pipeline/out/` (the built assets) by
`websim/.gitignore:10`.

**The comment above it is false at repository scope.** A byte-identical copy of
the raw feed is **tracked in git**:

- `git ls-files --error-unmatch Geography/data/encampments/irp_campsite_reports_sample.csv` → tracked;
- both copies hash to `3e557de5db4668c5d30fd7a6fc13bcc38b5e37bab4b9becaf9b3dc35366285ca` (§7).

This is not an accident and is not hidden: `deploy-check.ts:86-92` defines that
tracked path as `FALLBACK_RAW_CSV` and uses it when the local-raw copy is absent
(`:524-534`), precisely so the gate can still run on a machine that has the
repository but not the local copy. The raw feed is the Java model's committed
input (`engine/src/world/build.ts:78`; `docs/final/TECHNICAL_REFERENCE.md:256`)
and predates websim.

**Consequence to state plainly in any memo:** the git-ignored path is a control
over the *websim* subtree only. It does not remove the raw feed from this
repository's history, and it does not remove it from anywhere the repository has
been pushed. The remote is `https://github.com/fxa28196/REU.git`
(`git remote -v`).

**RESOLVED 2026-07-31 — the repository is PUBLIC.** This paragraph previously
said "I could not determine whether that repository is public or private" and
called it the single most important thing for the user to check. It was checked:
the remote was retrieved on 2026-07-31 and rendered a full public file listing
and project description. **So the raw campsite feed, all 3,400 rows with all
five fields, is already published by this project**, and every downstream
statement in this document that was conditioned on "if public" should be read in
its "public" branch. *Not established:* the date the remote became publicly
visible — git records commit dates, not visibility changes.

### 3.2 What is and is not in the built asset directory

`pipeline/out/assets/` holds **39 files** (verified by running the gate, §7).
The campsite CSV is **not** among them. The two encampment artefacts present are
`encampments-display.json` (43,379 bytes) and `encampments-public.bin`
(94,856 bytes), both listed in `assets-manifest.json` with their SHA-256, the
source file they derive from, the source SHA-256, the build commit and the build
timestamp.

`assets-manifest.json` records `source_file:
Geography/data/encampments/irp_campsite_reports_sample.csv` — i.e. the manifest
names the raw path, but carries none of its contents.

### 3.3 The salt: generation, custody, and whether it can reach public output

| Property | Value | Citation |
|---|---|---|
| Size | 32 bytes, hex-encoded | `build-encampments.ts:723, 746-751` |
| Generation | **fresh on every build**; a previous salt is never read back from disk | `build-encampments.ts:746-751`, and there is no read path — `readFileSync` is never called on the salt file by the builder |
| Written to | `pipeline/local-raw/encampment-salt.txt`, mode `0600` | `build-encampments.ts:748-749` |
| Read by | **only** `deploy-check.ts` (`resolveSalt`, `:488-508`) — verified: a tree-wide grep for `SALT_FILE` / `encampment-salt` / `ENCAMPMENT_SALT` finds the builder, the gate and their tests, and nothing else | §7 |
| Destroy option | `--destroy-salt` deletes the file after the build | `build-encampments.ts:891-897` |
| Accepted cost of freshness | `camp_row_hash` differs every build, so `encampments-public.bin` is **not byte-reproducible across builds** and its manifest digest changes on every rebuild | `build-encampments.ts:735-740`; test `encampments.test.ts:329` |

**Can salt material reach public output? On the evidence: no.** Three
independent controls, all exercised:

1. **Builder refusal.** Before writing anything, the builder scans both
   publishable byte strings for the salt as hex text (any 16-hex window), as raw
   bytes (any 8-byte window) and as base64, and aborts on a hit
   (`build-encampments.ts:763-780, 839-848`).
2. **Gate re-proof, independently written.** `scanSalt`
   (`deploy-check.ts:288-324`) implements the same property in different code
   "so that a defect in the builder's own guard cannot silence this one too",
   and runs against **every** asset (`:466-468`).
3. **Refusal to pass without a salt.** With no `--salt`, no `$ENCAMPMENT_SALT`
   and no salt file, the gate exits **2** rather than passing quietly
   (`:539-547`). There is no skip flag.

Verified live: the gate over the real 39 assets reports `saltChecked: true` and
**zero** salt-material findings; `deploy-check.test.ts` asserts the same against
the real bytes ("finds the build's own salt in none of the shipped assets") and
proves the detector can fire, via a seeded fixture, through the CLI.

**One structural weakness, stated because it is real.** Nothing binds a salt to
the build it produced. The asset header carries `rows`, `nodes` and
`order_ambiguous_snaps` and no salt fingerprint; the manifest entry carries no
salt fingerprint either (verified §7). So `deploy-check` proves "*this* salt is
absent from *these* assets" — if the salt supplied is not the one that built the
assets, the check is vacuously green. In the normal single-machine order (build,
then immediately check) this cannot happen; in any order where assets and salt
file drift apart, it can. A one-line mitigation exists (publish a salted
fingerprint of the salt — e.g. a digest of the salt under a fixed public label —
in the manifest, and have the gate require a match) and is **not implemented**.

**Custody remains the open user decision** recorded at `DR-Q4:126-152`, and this
document adds two facts to it rather than deciding it:

- the salt file currently **exists on disk** at the git-ignored path (verified);
- that path is under `C:\Users\Chick\OneDrive\Desktop\…`, i.e. inside a
  cloud-synchronised folder. "Not in git" and "not replicated" are different
  properties, as `DR-Q4:141-143` already notes.

---

## 4. What a member of the public would actually be able to see or infer

### 4.1 What exists today

There is **no deployed site**. `websim/app/` is a scaffold: `app/src/index.ts`
declares screen names, badge states and provenance labels and nothing more; there
is no map, no layer, no export UI. So the honest answer to "what can the public
see today" is **nothing from websim** — but §3.1's visibility question is no
longer unresolved, and its answer is the larger exposure: **the repository is
PUBLIC (verified 2026-07-31), so the raw feed is already published**, entirely
independently of anything websim would add.

The rest of this section is therefore about what the **currently built assets
would disclose if deployed as they stand**, which is the question WP1 has to
answer.

### 4.2 What the two published assets would disclose

**From `encampments-display.json`** (43 KB, human-readable):

- 506 cells, each `{i, j, level, count}`, counts from 5 to 14;
- cell geometry is fully reconstructible — origin and steps are in the file, and
  a level-L cell spans `150 m × 2^L` — so a reader can draw the exact footprint
  of every cell;
- therefore: *"between 5 and **12** campsite reports fall in this ~150 m
  square"* for the 90 level-0 cells, and progressively coarser statements up to
  ~4.8 km squares for 11 cells. **Correction (re-derived 2026-07-31):** an
  earlier revision of this line quoted the whole file's 5–14 range as though it
  applied to the finest cells. It does not. Per-level count ranges are
  L0 5–12, L1 5–12, L2 5–13, L3 5–14, L4 5–13, L5 5–11 — the maximum of 14 sits
  at level 3 (~1.2 km), and no 150 m cell exceeds 12;
- plus the honest aggregates: 3,371 reports mapped, **29 reports suppressed
  across 10 cells that never reached 5 at any resolution**, published
  deliberately so the layer's totals do not lie (`DR-Q4:159-163`);
- one inference the design explicitly concedes: *"no child of this merged cell
  reached 5"* — a statement about counts, and at level 4–5 it identifies regions
  that are sparse, which is itself a (weak) signal about where isolated camps
  are not clustered.

Nothing in this file locates an individual camp.

**From `encampments-public.bin`** (95 KB, binary but trivially parsed — the
format is documented in `shared/src/graph-asset.ts` in the same repository):

- **2,482 exact street-node coordinates at which at least one campsite report
  was made**, and for each, exactly how many;
- 1,849 of those coordinates correspond to a **single** report;
- report order is preserved in `camp_row_slot`, so the 3,400 reports remain
  individually addressable as rows;
- 3,400 stable pseudonyms (`camp_row_hash`), which are **not reversible without
  the salt** — 6 bytes of a salted SHA-256 over a 32-byte secret salt — but which
  *are* linkable across anything else built from the same build.

This is the file that carries the real disclosure. Its practical content is a
point map of where reported camps were, displaced by the distance from the
report to the nearest street node — which is small. **A reader who wants a map
of camp locations gets a usable one from this file**, notwithstanding the k = 5
floor on the display layer.

### 4.3 What the engine would disclose once it runs — the unclosed wiring

This is G4, and it is the item most likely to be missed by anyone reading only
the decision record.

- The engine's world builder loads
  `data/encampments/irp_campsite_reports_sample.csv` — **the raw path** —
  through a `WorldDataSource` described as "relative to the Geography data root"
  (`engine/src/world/build.ts:78, 107-112, 371`).
- Residents are constructed with `startLon`/`startLat` set to the **raw**
  coordinate and `incId` set to the **raw** `inc_id`
  (`build.ts:435-447`).
- `agents.csv` emits `starting_encampment, start_lon, start_lat, …, snap_gap_m`
  (`engine/src/output/logger.ts:240-257`, with `snap_gap_m` at `:247`), writing the coordinates at **six
  decimal places** (`logger.ts:286-287`) and the identifier verbatim
  (`logger.ts:330`).
- **Nothing anywhere in `engine/`, `app/` or `shared/` calls
  `unpackEncampmentsPublic`** except the builder itself and its tests (verified
  by tree-wide grep, §7). The public asset has **no consumer**.

So as the port stands, a browser run would need the raw CSV to be fetchable by
the page, and a run export would republish raw coordinates and raw identifiers
per agent — plus the per-report snap gap that the disclosure record says must
never be published. **None of this has happened**: the raw CSV is not in
`pipeline/out/assets/`, there is no app, and no deploy exists. But the Q4 control
is currently a property of the *asset builder*, not of the *product*, and the
plan's own acceptance criterion for WP4 (`IMPLEMENTATION_PLAN.md:676`) tests only
the asset. Closing this — rewiring the engine's resident construction onto
`encampments-public.bin`, and deciding what `agents.csv` may contain in a browser
build — is unscheduled engineering work that gates deployment.

### 4.4 What the gate proves today, in its own words

Run live against the real 39 assets on 2026-07-31 (§7):

```
BLOCKING findings: 0
ADVISORY findings: 96   (all raw-coordinate-component, all in shelter CSVs)
saltChecked: true    reference: 3400 raw reports    k = 5
```

The 96 advisory findings are the documented lone-component coincidences: shelter
CSVs are named facilities at geocoded street addresses, and at 6 dp in a narrow
bounding box a lone longitude or latitude occasionally equals one belonging to a
campsite report while its partner does not. The gate reports these for human
adjudication rather than blocking, and blocks on anything that identifies a
*place* (both components of the same report) or a *person* (an identifier)
(`deploy-check.ts:30-46`). That reasoning is sound and the distribution of the
findings is consistent with coincidence rather than leakage — but the
distribution is more specific than an earlier revision of this line said.
**Correction (re-derived 2026-07-31):** the 96 findings are **six distinct
coordinate literals**, not 96 independent coincidences. Five of them recur in
**19 of the 20** shipped shelter CSVs (5 per file) and one appears in a single
file, giving 5 × 19 + 1 = 96. They appear in **no** encampment asset, and the
twentieth shelter file — the three-row `shelters_2020-09.csv` — carries none.
"5 or 6 per shelter CSV, in every shelter CSV" was wrong on the last clause.

**Where the gate runs.** It is wired into CI at
`.github/workflows/websim-ci.yml:206`, but only in the `strict-artifacts` job,
which runs on a self-hosted runner gated behind a repository variable
(`:154-155`) — because it needs the built assets and the raw feed, neither of
which a clean clone has.

**Correction (re-checked 2026-07-31):** this paragraph previously said `.github/` is
untracked and "not yet committed." That is **wrong** —
`git ls-files .github/` returns `.github/workflows/websim-ci.yml`, so the CI
wiring **is** tracked. The same re-check found that `websim/` as a whole is
tracked (305 files), not untracked as this record's companion document claimed.
Neither correction changes any disclosure finding: `git ls-files` over
`pipeline/local-raw/` and `pipeline/out/` still returns **nothing**, so no raw
feed, no salt and no built asset is in git from the websim subtree. What does
change is the answer to "what would a public repository expose" — it would
expose the builder, the gate, the asset format spec and the CI wiring.

---

## 5. The remaining Q4 options, with the risk of each stated plainly

Two decisions are formally open in the existing records (salt custody,
`DR-Q4:126`; exact-coordinate binary, `IMPLEMENTATION_PLAN.md:596, 829, 835-838`).
This document adds three more that the evidence forces onto the table. All five
are the user's to make, with the mentor/IRB; none is decided here.

### Option A — Salt custody: **withhold** (current default)

The fresh per-build salt stays at the git-ignored local path.

- **Gains:** provenance questions about a specific published row stay answerable;
  the gate can be re-run at any time.
- **Risk:** anyone who obtains that one file can turn all 3,400 published
  pseudonyms back into municipal incident identifiers, and thence — via the
  City's own open feed — back into exact dated coordinates. The file currently
  lives inside a cloud-synchronised folder. The realistic failure is not an
  attacker; it is a backup, a shared machine, or simply forgetting.
- **Blast radius:** one build's mapping (freshness bounds it).

### Option B — Salt custody: **destroy** (`--destroy-salt`)

- **Gains:** the mapping is irreversible for everyone, permanently, including the
  authors. Nothing downstream joins on the pseudonym, so this costs **no
  scientific result** (`DR-Q4:145-146`, confirmed here: no consumer of the asset
  exists at all).
- **Risk:** a later data-quality or ethics question about a specific published
  row becomes permanently unanswerable; and the gate cannot run against that
  build afterwards, so a rebuild is required to re-prove anything.
- **Ordering requirement:** run the gate **before** destroying.

### Option C — The sign-off-conditional **exact-coordinate engine binary**

Specced but **not built** (`IMPLEMENTATION_PLAN.md:829`: "blocked on sign-off,
not on engineering"). It would ship exact raw coordinates in an opaque engine
asset to restore camp-assignment and per-report snap-gap identity on public
builds (`:327, :596`).

- **Gains:** restores the one fidelity claim the snapped default gives up — the
  per-report snap gap — and removes any residual doubt about start-node
  assignment.
- **Risk, stated without hedging:** this is publication of 3,400 precise,
  recent, dated encampment locations. "Opaque binary" is encoding, not
  protection: the format would ship in the same open repository, and the gate's
  own binary detector exists precisely because a float64 in a `.bin` is a
  coordinate. This is the artefact the project's risk register calls a critical
  ship-blocker. The plan already states the countervailing rule: *"A
  raw-coordinate public layer is never acceptable — not togglable, not
  Easter-egged"* (`:596`).
- **Status:** requires explicit mentor **and** IRB sign-off before it may exist,
  and the plan treats that as a veto surface (`:835-838`).

### Option D — Withhold or floor `encampments-public.bin` (**newly forced by §2.4**)

The k = 5 decision was applied to the display layer while its sibling binary
kept node-level counts down to 1. Sub-options, cheapest first:

- **D1 — Do not publish it.** It has no consumer today (§4.3). Removing it from
  the deployed asset set costs nothing that currently exists, and can be revisited
  when the engine is actually wired.
- **D2 — Apply the same floor to it.** Publish only nodes carrying ≥ 5 reports —
  which on this feed is **16 of 2,482 nodes**, i.e. the asset effectively
  disappears. This is a measurement, not a rhetorical point: node-level
  publication and a k = 5 floor are close to mutually exclusive on data this
  sparse.
- **D3 — Coarsen what the engine consumes.** Have residents start from the
  k-anonymised *cells* rather than from nodes. This changes model behaviour and
  breaks the Tier-1 snap-identity claim the port advertises, so it is a
  scientific decision, not only an ethical one.
- **D4 — Publish as-is, deliberately, with the disclosure written down.** Defensible
  only if it is stated in the memo that the public asset discloses 2,482 street
  locations at which reports were made, 1,849 of them singletons — i.e. that the
  k = 5 headline describes one file and not the publication.
- **Risk of doing nothing:** the project would ship a k-anonymity claim that is
  true of the file it names and not true of the deployment, in front of an IRB.
  That is the failure mode most likely to damage the project's credibility, and
  it is worse than either honest alternative.

### Option E — Close the engine wiring before any deploy (**newly forced by §4.3**)

Not really optional; listed so it appears on the decision surface rather than the
backlog. Until the engine reads `encampments-public.bin` instead of the raw CSV,
and until the browser export path for `agents.csv` is decided, a public deploy
would republish raw coordinates, raw identifiers and per-report snap gaps.

- **Risk of deferring:** the disclosure control is currently enforced at the
  boundary of an artefact nobody consumes. A deploy built before this closes
  would defeat it entirely, and would do so silently — the existing gate scans
  `pipeline/out/assets/`, and would not see a raw CSV served from `app/public/`
  or bundled by Vite from elsewhere.
- **Cheap partial mitigation available now:** extend `deploy-check` to scan the
  actual deploy directory (not only `pipeline/out/assets/`) and to treat the raw
  CSV's own SHA-256 as a blocking signature anywhere in it. The gate itself
  notes this limit: it "cannot prove anything about a file that is published from
  somewhere else" (`DR-Q4:165-166`).

### Also open, outside Q4 but coupled to it

- ~~**Repository visibility** (§3.1) — must be established before anything else is
  reasoned about; a public repository already publishes the raw feed.~~
  **ESTABLISHED 2026-07-31: PUBLIC.** The raw feed is already published. This is
  no longer an open item; it is a fact the rest of the analysis sits on (§3.1).
- **Hosting/visibility of the deploy** — plan §10 item 3: public URL only after
  the ethics and licensing items clear; unlisted preview until then.

---

## 6. What I could not determine

Listed exhaustively, in descending order of importance.

1. ~~**Whether `https://github.com/fxa28196/REU.git` is public or private.**
   Requires a network call I am not permitted to make. Nothing in the tree
   records it. If public, the raw feed with all five fields is already published
   by this project, and the entire websim disclosure discussion is downstream of
   a larger exposure. **The user must check this personally, first.**~~
   **DETERMINED 2026-07-31: the repository is PUBLIC.** Retrieved on that date;
   it rendered a full public file listing and project description. The raw feed
   with all five fields **is** already published by this project, and the websim
   disclosure discussion **is** downstream of that larger exposure. The *date*
   the remote became public remains unknown and must not be asserted.
2. ~~**Whether the City's licence permits redistribution of a derived product.**
   The tree records the licence only as "City of Portland open data (public)"
   (`Geography/data/README.md:166`). No licence text, no terms URL, no written
   determination exists in the repository. By contrast the RLIS street data has an
   explicit written-determination workstream (plan Q3, W1); the encampment feed
   has no equivalent. Whether "open data" here permits republishing a derived
   density layer, a node-level binary, or the raw rows is **unestablished**.~~
   **ANSWERED 2026-08-02.** The researcher reports that **the City of Portland
   approved** redistribution of the campsite-report-derived products, relayed
   2026-08-02, asking only that the source be credited formally. What has *not*
   changed: the tree still records the licence only as the free-text phrase
   "City of Portland open data (public)" (`Geography/data/README.md:166`), there
   is still no licence text and no terms URL, and **no written determination from
   the City is filed anywhere in this repository** — no correspondence, no
   reference number, no named contact. Anything that needs documentary evidence
   must obtain it. Operative record: `DR-WP1-data-rights.md`. Note also that this
   answers the *rights* question only; it says nothing about whether the
   published granularity is appropriate, which is §2.4/§4.2's separate subject.
3. **Whether the mentor or an IRB has reviewed any of this.** No sign-off
   artefact exists anywhere in `websim/docs/`. Plan §8 WP1 lists the memo as a
   deliverable; `DR-Q4:150-152` leaves the salt-custody line blank. I found no
   IRB protocol number, determination letter, or exemption record in the tree.
   *(Update 2026-08-02: the mentor **has** reviewed it — see item 4. The rest of
   this item is still exactly true: there is still no IRB protocol number,
   determination letter, or exemption record anywhere in the tree.)*
4. **Whether this study required IRB review at all.** The data is
   municipal-administrative and not human-subjects data collected by the project,
   which often changes the answer. Nothing in the tree states a determination
   either way. This is a question for the faculty mentor, not something the
   repository can answer.
   *(**ANSWERED 2026-08-02: no IRB review is required.** The faculty mentor so
   determined, on the reported grounds that the work does not involve human
   subjects and is not yet a real-world application; relayed by the researcher
   2026-08-02. It is a verbal determination with no written artefact, and it is
   scoped to the current research use. Operative record:
   `DR-WP1-irb-determination.md`.)*
5. **The completeness of the sample relative to the City's full feed.** The fetch
   walks 17 OBJECTID windows of 200; the total number of records the service
   holds is not recorded anywhere in the tree, so "3,400" cannot be expressed as
   a fraction of the underlying dataset.
6. **Whether `is_vehicle`'s two observed values exhaust the field's domain**, and
   what the City's own definitions of the five fields are. No data dictionary
   from the City is stored in the tree. (This does not affect disclosure — both
   fields are dropped — but it affects anything said about the source.)
7. **Whether any archived model output already published raw coordinates.**
   `agents.csv` in the Java archive under `docs/runs/` carries
   `starting_encampment`, `start_lon`, `start_lat` and `snap_gap_m` per agent by
   the same logger contract (`docs/IMPLEMENTATION_PLAN.md:515`). I did not audit
   the ~375 MB archive, and I did not check whether any of it has been shared,
   submitted or uploaded. **If archived run outputs have been circulated, they
   contain raw coordinates and raw identifiers per agent.** This is worth a
   deliberate check by the user.
8. **The `pipeline/out/assets/data/` sub-tree's full provenance.** I confirmed
   the 39 scanned assets contain no campsite CSV, but I did not trace how each
   shelter and closure CSV got there.
9. **Whether the snap displacement distribution is safe to publish.** It exists
   in the git-ignored local report; the builder's stated reason for withholding
   it is per-report disclosure. Whether the *aggregate* percentiles could be
   published is a judgement I did not make, and I deliberately did not reproduce
   them here.

---

## 7. How every number above was produced

All commands read-only; run from the paths shown on 2026-07-31.

| Fact | Command / method |
|---|---|
| CSV header, row count, `inc_date` range, distinct `inc_id`, `is_vehicle` split, year split | `node` one-liner over `Geography/data/encampments/irp_campsite_reports_sample.csv`, printing **counts and dates only** |
| Distinct coordinate pairs (3,317) | `node` one-liner building a `Set` of `lon|lat` keys, printing **the set size only** |
| Two raw copies are byte-identical | `sha256sum Geography/data/encampments/…csv websim/pipeline/local-raw/…csv` |
| Raw copy is tracked in git | `git ls-files --error-unmatch Geography/data/encampments/irp_campsite_reports_sample.csv` |
| Ignore rules bite | `git check-ignore -v websim/pipeline/local-raw/{irp_campsite_reports_sample.csv,encampment-salt.txt} websim/pipeline/out/assets/encampments-display.json` |
| Display-layer census (506 / 0 / 3,371 / 29 / 10 / level histogram / min 5 / max 14) | `node` over `pipeline/out/assets/encampments-display.json`, destructuring away `cells` and recomputing `length`, `min`, `filter(count<5)`, `sum`, level histogram |
| Realised cell size at 45.5°, L5 size, 3371/3400 % | `node`, re-implementing the builder's `metresPerDegreeLat/Lon` series against the built `stepLon`/`stepLat` |
| `.bin` sections, header counts, per-node weight histogram | `node` parsing the container preamble (magic, `uint32` version at byte 8, `uint32` header length at byte 12, JSON header) and the `camp_row_slot` int32 section; **only the histogram was printed**, never a coordinate |
| Gate result on the real assets | `npx tsx scripts/deploy-check.ts --json`, piped through a `node` filter that prints **counts and finding kinds only** — the raw detail strings were never rendered |
| Test suites green (56/56) | `npx vitest run test/encampments.test.ts test/deploy-check.test.ts` from `websim/pipeline` |
| No consumer of the public asset | `grep -rn "unpackEncampmentsPublic\|encampments-public" --include="*.ts"` over `websim/`, excluding `node_modules` |
| Only two readers of the salt | `grep -rn "SALT_FILE\|encampment-salt\|ENCAMPMENT_SALT"` over `websim/`, excluding `node_modules` |
| Manifest carries no salt fingerprint | `node` over `pipeline/out/assets/assets-manifest.json`, printing the two encampment entries in full |

---

## 8. Source files this record rests on

| File | Role |
|---|---|
| `websim/docs/DR-Q4-encampment-disclosure.md` | the existing decision record |
| `websim/pipeline/scripts/build-encampments.ts` | the builder — snap, dedupe, hash, drop, grid, k-anonymity, salt |
| `websim/pipeline/scripts/deploy-check.ts` | the publication gate — six detectors |
| `websim/pipeline/test/encampments.test.ts`, `.../deploy-check.test.ts` | 56 passing tests behind both |
| `websim/shared/src/graph-asset.ts` | the public asset's container format and its documented contents |
| `websim/engine/src/world/build.ts`, `.../output/logger.ts` | where the engine still reads raw and what it would export |
| `websim/.gitignore` | the local-raw and pipeline/out rules |
| `websim/docs/IMPLEMENTATION_PLAN.md` §4 asset table, Q4, §8 WP1/WP4, §9.1 W2, §10 item 1 | the policy the code implements |
| `Geography/data/README.md` §2c, `docs/science/DATA_SOURCES.md` D2b, `docs/final/TECHNICAL_REFERENCE.md` §3.3 | source provenance, licence-as-recorded, temporal caveat |
| `scripts/fetch-encampments.ps1` | how the sample was retrieved and at what precision |
| `.github/workflows/websim-ci.yml` | where the gate runs (untracked in the working tree) |
