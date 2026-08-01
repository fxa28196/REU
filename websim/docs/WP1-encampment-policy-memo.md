# WP1 — Encampment derived-product policy memo (DRAFT FOR REVIEW, NOT SENT)

---

## PART 0 — NOTES TO SELF (delete this entire part before sending)

**This document has not been sent to anyone. It is a draft for you to review, correct, and send yourself.**

### 0.1 What you must fill in before this goes out

| Placeholder | What goes there | Notes |
|---|---|---|
| `[MENTOR NAME]`, `[MENTOR TITLE]` | Faculty mentor | |
| `[INSTITUTION]` | Your institution | Also appears in the sign-off block |
| `[IRB / HUMAN SUBJECTS OFFICE NAME]` | The office, if one is involved | See 0.2 — you may not need this |
| `[YOUR NAME]`, `[YOUR ROLE]` | You | |
| `[DATE SENT]` | The day you actually send it | Do not backdate |
| `[RESPONSE-BY DATE]` | A date you actually need it by | Give at least two weeks; this asks for a real decision |
| *(IRB status)* | The IRB STATUS block in §8 | **Not a literal placeholder** — §8 has tick-boxes marked "mentor to complete", and that is deliberate: whether this study needs IRB review is the mentor's determination, not yours (§6 item 2). I found no IRB protocol number, determination letter or exemption record anywhere in the repository, so there is nothing for you to transcribe |
| `[IRB OFFICE]` | Named office, if §8's third tick-box is used | Only needed if the mentor refers the question onward |

**Repository visibility is no longer a fill-in.** It was established on 2026-07-31: the
remote `https://github.com/fxa28196/REU.git` is **PUBLIC**. §1, §3.5 and §6 are written on
that verified answer and contain no placeholder for it. See 0.3 and 0.7.

### 0.2 Who to send it to, and in what order

1. **Faculty mentor first.** The mentor decides whether an IRB is even in scope. This study uses municipal administrative data the project did not collect from human subjects, which frequently changes the answer, and **nothing in the repository states a determination either way**. Do not assume you need IRB review, and do not assume you do not.
2. **IRB / human-subjects office second, only if the mentor says so.** If the mentor says an IRB determination is needed, send them the same memo unchanged, plus whatever their intake form requires.
3. **Do not send anything to the City of Portland from this memo.** The City licence question (§7, Decision L) is real and now urgent, but it belongs in its own message, and it should go out only after the mentor has seen this one.

### 0.3 Established on 2026-07-31 — the answers that used to be pre-send checks

Both of the blocking pre-send checks in earlier drafts have been carried out. They are
recorded here rather than left as instructions, because they are done.

- **Repository visibility: PUBLIC.** Established 2026-07-31 by retrieving the repository
  page for `https://github.com/fxa28196/REU.git`, which rendered a full public file listing
  and project description. **Consequence: the raw campsite feed is already published**, and
  this memo's earlier framing — "a decision before anything is published" — was false and has
  been removed throughout. What is published is enumerated in §1.
- **Archived model output: already published, and it does contain the raw values.** Earlier
  drafts flagged this as an unaudited risk. It is no longer unaudited. `git ls-files` against
  the published branch returns **136** archived `agents.csv` files, of which **135** carry
  `start_lon`, `start_lat` and `snap_gap_m` (one older 27-column file carries
  `starting_encampment` only). I did not stop at the header contract: across **918,865**
  agent rows carrying start coordinates, **all 3,400** of the feed's municipal incident
  identifiers and **all 3,317** of its distinct coordinate pairs appear, at six decimal
  places. The archive is ~375 MB across 15 run directories and 475 tracked files.
- **Fair scoping of the rest of the archive.** The 154 archived `simulation.json` and 154
  archived `shelters.csv` files are also published, and I checked both rather than assuming.
  A full token scan of all 154 `simulation.json` files found **zero** raw encampment
  identifiers and **zero** raw encampment coordinate *pairs* — they hold aggregate run
  statistics and per-shelter records. (Two lone coordinate components do occur across those
  files — one longitude value and one latitude value, never both halves of the same report.
  That is the same coincidence phenomenon §3.6 describes for the shelter tables, and I state
  it so a reviewer who runs the scan finds nothing I did not.) The 154 `shelters.csv`
  files hold **106** distinct facility coordinate pairs for named public shelters, of which
  **zero** equal a raw encampment coordinate. Do not let these two be described as an
  encampment exposure. They are not one.
- **`websim/` is committed but NOT published — do not overstate this one.** Earlier drafts of
  this note said the whole `websim/` tree being tracked meant the asset builder, the
  publication gate and the asset format spec were public. **That is not supported.** `websim/`
  is 305 tracked files on the *local* branch `websim-port` (commit `5f10415`, 2026-07-31),
  which has no upstream configured, no remote-tracking ref, and appears in no fetched remote
  branch; `git ls-tree origin/main -- websim/` returns **zero** files, and so do the other
  three published branches. The same is true of `.github/`. Residual caveat, stated because it
  is real: remote-tracking refs are only as fresh as the last fetch (2026-07-30), and a push
  made from a different clone could not be detected locally. Treat "the format spec is not yet
  public" as true today and as something that changes the moment you push this branch.
- **Decide how much to say about where the salt file lives.** §3.5 and §4.4 currently say only
  "a cloud-synchronised Desktop folder" — they do **not** name the provider and do not give a
  path, which is deliberate. If your mentor needs the specific location to judge custody
  (Decision B), you may want to name it verbally rather than in a document that gets filed.

### 0.4 What artifact to file when it comes back signed

- Save the signed copy as `websim/docs/WP1-SIGNOFF-encampment.md` (or attach the scanned/emailed signature alongside it), recording: options selected under R, L, A and B, any conditions attached, signatory name and role, and date.
- **Then update four places so the decision is not stranded in one file:**
  1. `websim/docs/DR-Q4-encampment-disclosure.md` §3 — which records salt custody as an OPEN USER DECISION, states that the build does not decide it, and instructs that the answer be written into that section. It is unanswered today.
  2. `websim/docs/IMPLEMENTATION_PLAN.md` §10 item 1 — the user-flag/veto entry.
  3. `websim/docs/WP1-GROUND-encampment.md` §6 item 3 — which currently records "no sign-off artefact exists anywhere in `websim/docs/`".
  4. `websim/docs/WP1-GROUND-encampment.md` §3.1 and §6 item 1 — **both still say the remote's visibility could not be determined.** That is now false. The ground record has not yet been corrected; this memo is ahead of it. Fix it, or the two documents disagree in front of a reviewer.
- Plan §8 WP1 treats "encampment policy signed" as the acceptance criterion that unblocks WP4 asset *publication* and WP14 public deploy. Nothing else is blocked by it — development on local assets continues either way. Say that to the mentor if they worry that saying no stops the project. **But note the change in stakes:** WP1 sign-off no longer gates only future publication, because Decisions R and L concern publication that has already happened.

### 0.5 Things I deliberately did not do in the memo

- I did not argue for publication. The memo is written to make a "no" easy to give. One precise exception, so you are not surprised by it: §7 A1 records that A1 is the option I would choose if the decision were mine. It is labelled as my opinion, it is immediately followed by "I am not asking you to ratify that", and A1 is the most restrictive publication option on the list. Delete that sentence if you would rather the memo carry no preference at all.
- I did not soften §5. Two of the controls are weaker than their names suggest, and the memo says so in the same words I would use to a reviewer.
- I did not argue with your decision of 2026-07-31 to leave the repository public pending this review. §1 records it as a fact, once, without comment, because the reviewer needs to know the state they are ruling on. An adversarial pass over this document specifically hunted for pressure language; it found one sentence — a bolded "this is the only option that reduces exposure without also destroying provenance" attached to R2 — and neutralised it into a plain comparison across R2/R3/R4/R5. The risk lines under each R option are unchanged, because a risk line that omits the risk is not neutrality.
- I did not describe the City feed as confidential or leaked. It is not. The City publishes it, and §2 says so before it says anything critical.
- I did not include a single raw coordinate or raw incident identifier anywhere in this file, including in the notes.

### 0.6 Corrections applied by an independent re-check of this memo (2026-07-31)

Every number below was re-derived from the raw feed, the built assets and the pipeline
source, not from this project's own prose. Seven statements did not survive.

| # | What the memo said | What is true | Where |
|---|---|---|---|
| 1 | "no published square corresponds to a single site" | **False.** k = 5 floors *reports*, not sites. 10 of the 90 finest published cells are backed by exactly one snapped street node (counts 5 or 6); 22 more by exactly two. | §3.3 |
| 2 | finest cells hold "between 5 and 14" reports | **5 to 12.** The maximum of 14 is a level-3 cell (~1.2 km), not a 150 m one. Per-level ranges: 5–12 / 5–12 / 5–13 / 5–14 / 5–13 / 5–11. | §5 |
| 3 | the pre-fix layer was "published anyway" | It was **written to the local build directory**; nothing was ever deployed or served. Overstating our own failure is still a false statement to a reviewer. | §3.3 note |
| 4 | advisory findings "distributed evenly across every shelter file" | **19 of 20** files; the three-row 2020 file has none. And they are only **six distinct coordinate literals** repeated across near-identical rosters — which is a *stronger* coincidence argument than the one the memo made. | §3.6 |
| 5 | "Every preset already has a certified Java run behind it" | **7 of 8.** The eighth is `default_fresh_run` — the preset a visitor lands on — which is deliberately never archive-validated. This makes option A5 slightly more expensive than the memo implied. | §7 A5 |
| 6 | dropping the date "removes the temporal dimension that makes a location actionable" | Overclaims. It narrows what a reader learns; a visitor does not need the date. | §3.2 |
| 7 | snap displacement is "materially finer than the 150 m grid cell" per "our build record" | The build record states numbers, not that characterisation. Median and p95 are below 150 m; the **maximum is not**. | §3.1 |

Two checks the memo previously did not make, both now stated in it: the on-disk salt was
confirmed to be the salt that built the shipped asset (3,400/3,400 pseudonyms re-derived), and
all 38 manifest digests were verified against the files on disk (38/38).

The disclosure guarantee was re-tested rather than assumed, and re-tested again after the
rewrite described in §0.7 rather than inherited from the previous revision: the project's own
six-detector publication gate was run **against the bytes of this revision** and exits 0 with
zero raw coordinates, zero raw incident identifiers, zero salt material, zero below-k cells and
zero advisory findings. An independent scan against the raw feed confirms it separately: none
of the 3,400 raw longitudes, none of the 3,400 raw latitudes and none of the 3,400 raw incident
identifiers appear in this file, and it contains no decimal literal of five or more places. The
claim linter (`npm run lint:claims`) is clean.

### 0.7 The framing correction of 2026-07-31 — what changed, and what did not

This is a second and larger correction than §0.6, and it is to the memo's *premise* rather
than to its numbers.

**What changed.** Every earlier revision was written as a decision to be taken *before*
anything was published, with repository visibility recorded as an unresolved blocking
question. The question is resolved: the repository is public, and has been throughout. The
memo now opens with what is already published (§1), states the verified finding in §3.5 and
§6 rather than an unknown, and asks **three** questions instead of one (§7: Decision R on the
already-public copy, Decision L on the City licence, Decision A on the website). Decisions R
and L are live regardless of what is decided about the website; that is said in the memo in
those words.

**What got heavier.** The persistence argument (§2, §5) was previously an argument about a
proposed product. It now describes something in effect today: a frozen public copy of a feed
the City ages out. It is the strongest single argument in the memo and is no longer
hypothetical.

**What did not change.** Every measured figure in §3, §4, §5 and §7 stands as re-derived, and
every §0.6 correction is preserved verbatim — including that k = 5 floors reports and not
sites, and the 5–12 range for the finest cells. The pipeline's disclosure controls are exactly
as strong, or as weak, as they were. The controls simply never governed the artifacts that
turn out to be published, which is the point §4.6 makes.

### 0.8 Adversarial re-verification of the rewrite (2026-07-31, later the same day)

A separate pass re-derived the tracked-file counts from `git ls-files` rather than from this
memo's prose, and hunted for framing that still assumed nothing had been published. **Every
count in this memo survived**: 136 `agents.csv` (135 carrying all three coordinate columns),
154 `simulation.json`, 154 `shelters.csv`, 475 tracked files across 15 run directories, 3,400
data rows in the feed, 106 distinct shelter coordinate pairs, 305 `websim/` files, 39 built
assets, 96 advisory findings from six distinct literals. The §4.6 republication claim was
re-measured end to end and matched exactly: **918,865** of 918,915 rows carry start
coordinates, and **3,400/3,400** identifiers and **3,317/3,317** coordinate pairs appear.

Four changes were made, none of them to a measured figure:

1. **§1, §0.3, §4.6, §7 R5 — `simulation.json` scope widened.** Those passages asserted only
   "zero raw encampment identifiers". A coordinate scan was then run against them: still
   clean — **no file carries both halves of the same raw report** — but two lone components do
   appear. The memo now says so, so that a reviewer running the same scan finds nothing the
   memo withheld.
2. **§7 R2 — one bolded sentence neutralised** (see §0.5).
3. **§5 — "cannot be arithmetically narrowed to one" made explicit**, because without a noun it
   could be misread as the guarantee §3.3 retracts.
4. **§4.1 — "credibility catastrophe" replaced** with a plain statement of what the failure is.

**One thing the pass explicitly did not confirm.** It was put to this pass as established that
`websim/` is public. **It is not, and the evidence points the other way**: `git ls-tree` finds
zero `websim/` files on `origin/main` and on all three other remote branches, and
`websim-port` has no upstream. §0.3 and §3.5 already state this correctly and were left alone.
Do not let anyone "correct" the memo to say the asset builder and the publication gate are
public — that would be a false statement to a mentor and an IRB. It becomes true the moment
the branch is pushed, and the caveat about fetch staleness in §0.3 still applies.

---
---

## PART 1 — THE MEMO

**To:** [MENTOR NAME], [MENTOR TITLE], [INSTITUTION]
**Cc:** [IRB / HUMAN SUBJECTS OFFICE NAME] *(if applicable — see §6)*
**From:** [YOUR NAME], [YOUR ROLE], [INSTITUTION]
**Date:** [DATE SENT]
**Subject:** Decisions requested — an already-public encampment dataset, its licence, and what an interactive website may additionally show
**Response requested by:** [RESPONSE-BY DATE]
**Status:** No interactive website exists and none has been deployed. **But the raw source data and the model's run archive are already published**, because this project's GitHub repository is public — verified 2026-07-31 (§1). This memo therefore asks for three decisions, not one, and two of them are live whatever you decide about the website.

---

### 1. The concern, in plain language

**I have to start with what is already public, because it changes what I am asking you.**

This project's GitHub repository — the one holding the model, its input data and its run
archive — **is public.** I established this on 2026-07-31 by retrieving the repository page,
which returned a full public file listing and project description. Earlier versions of this
memo said the repository's visibility could not be determined and framed everything as a
decision to be taken before publication. That framing was wrong. Everything below is written
on the verified answer.

Because the repository is public, the following are on the open internet today:

- **The raw campsite feed.** The file `Geography/data/encampments/irp_campsite_reports_sample.csv`
  is tracked in git and present on the published branch. **3,400 data rows**; five columns —
  longitude, latitude, incident date, municipal incident identifier, vehicle flag — with
  coordinates at **six decimal places**. It entered version control on 2026-07-24 and has been
  published ever since.
- **The run archive republishes those same raw values, per simulated person.** Of the **136**
  archived `agents.csv` files that are tracked and published, **135** carry `start_lon`,
  `start_lat` and `snap_gap_m` alongside `starting_encampment`. I did not rely on the logger's
  header contract for this — I measured the file contents. Across **918,865** published agent
  rows carrying start coordinates, **all 3,400 of the feed's municipal incident identifiers and
  all 3,317 of its distinct coordinate pairs appear**, at six decimal places. The archive is
  about 375 MB across 15 run directories.
- **Two other archive file types are published and I want them scoped fairly, not lumped in.**
  The 154 archived `simulation.json` files: a full scan found **zero** raw encampment
  identifiers and **no raw encampment coordinate pair** — they hold aggregate run statistics
  and per-shelter records. (Two lone coordinate components occur, one longitude and one
  latitude, never both halves of the same report — the coincidence pattern of §3.6.) The 154 archived
  `shelters.csv` files: **106** distinct coordinate pairs for named public shelter facilities,
  of which **zero** equal a raw encampment coordinate. Neither is an encampment exposure and I
  do not want them counted as one.

**The mitigating context, stated before the criticism rather than after it.** This feed is
**City of Portland open data.** It was retrieved from the City's public ArcGIS feature service
`COP_OpenData_Miscellaneous/MapServer/1396` on 2026-07-24 by a documented script in this
repository (`scripts/fetch-encampments.ps1`; provenance at `Geography/data/README.md:164-171`).
The City publishes this data itself. Every individual record in our copy was public at the
moment it was collected. **This is not a leak of confidential information and should not be
described as one**, by me or by anyone reading this.

**What is nevertheless genuinely wrong, and why I am writing.** Three things, and the first is
the one I would put in front of a reviewer if I could only put one:

1. **Persistence.** The City's feed **retains only a rolling recent window** — it holds zero
   records for 2020, the year this simulation actually models (`Geography/data/README.md:169`).
   Our copy is frozen. A frozen public copy therefore preserves, indefinitely and in a form
   search engines index, reports that the City's own retention behaviour would otherwise age
   out. **Every record was public when collected; that is not the same as every record being
   public forever, and our republication is what converts the one into the other.** This was
   the strongest argument in this memo when it described a proposal. It is stronger now,
   because it describes something already in effect.
2. **Licence.** The repository records the terms only as the free-text phrase "City of Portland
   open data (public)" (`Geography/data/README.md:166`) and "Subject to the City of Portland's
   open-data terms" (`LICENSE:89-91`). There is **no licence text, no terms URL and no written
   determination** anywhere in the repository. Whether redistribution is permitted is
   **unestablished** — and redistribution is already happening.
3. **The disclosure controls do not govern what is published.** I built a k = 5 aggregation
   floor, node-snapping, field-dropping, salted pseudonyms and a six-detector publication gate,
   and I believe they are substantial (§3). They govern the *browser port's asset builder*.
   They do not govern the raw CSV that is already public, and they do not govern the run
   archive. And the k floor counts **reports, not sites**: 10 of the 90 finest published cells
   are backed by exactly one snapped street node, and 22 more by exactly two (§3.3).

**The underlying ethical concern is unchanged and is the reason any of this matters.** A
public, well-designed, searchable map of where unsheltered people are sleeping helps someone
find them. The people it helps find are among the most vulnerable in the city, they did not
consent to being in this dataset, and the realistic uses of that information — encampment
sweeps, private removal, harassment, violence — are harms we would be making easier rather than
harms we would be studying.

**So the decision in front of you is no longer one question, it is three.** I am asking all
three because the first two do not wait on the third:

- **(a) Is the already-public raw copy acceptable as it stands, or should it be withdrawn, or
  should the repository's history be rewritten to remove it?** (§7, Decision R.)
- **(b) Does the City's licence permit the redistribution that is already occurring?** (§7,
  Decision L.)
- **(c) What, if anything, may an interactive public website additionally show?** (§7,
  Decision A.)

**(a) and (b) are live whatever you decide about (c).** If the answer to (c) is "publish
nothing", (a) and (b) still need answers, because the raw feed and the run archive are already
out there and were out there before this memo was written.

**A decision to publish no derived layer is a complete and acceptable answer, and it costs the
project less than you might expect (§7, A5). A decision to withdraw or rewrite what is already
published is also available and I have costed it honestly (§7, Decision R).**

**One fact recorded without comment, because you are entitled to know the state you are ruling
on:** on 2026-07-31 the researcher decided to leave the repository public for now, pending this
review.

---

### 2. What the underlying data is

| | |
|---|---|
| Source | City of Portland, Impact Reduction Program campsite reports, collected via 311 and pdxreporter.org, retrieved from the City's public open-data ArcGIS endpoint |
| Retrieved | 2026-07-24, by a documented script in this repository |
| Size | 3,400 rows; 3,317 distinct coordinate pairs; 3,400 distinct incident identifiers (every row uniquely identified) |
| Fields | longitude, latitude, incident date, incident id, vehicle flag |
| Precision | coordinates rounded to six decimal places at fetch time |
| Date range | 2025-01-08 to 2026-07-23 |
| Licence as recorded | "City of Portland open data (public)" / "Subject to the City of Portland's open-data terms" — **no licence text, terms URL, or written determination exists in our records** (see §6) |
| Publication status | **Already public.** Tracked in git since 2026-07-24 in a public repository (§1) |

Two properties of the source matter for the ethics and are the project's own findings, not mine:

- **These are complaint-generated reports**, biased toward camps visible from the street. They are not a census of unsheltered people, and the project documents this.
- **The City's feed retains only a rolling recent window.** It holds zero records for 2020, the year the simulation actually models; we use 2025–26 points as a spatial-distribution proxy and the model prints that warning on every run. The implication is uncomfortable, it is now a description of the present rather than of a proposal, and I want it stated rather than buried: **our snapshot is frozen, the City's feed is not, and our snapshot is already public.** Republishing a derivative of a rolling feed preserves, indefinitely, information the City's own retention behaviour would otherwise age out. That is a way our product is *worse* than the source even while being derived from it — and it is in effect today, not contingent on anything I might build next.

---

### 3. What the browser port's implementation does to prevent identification

Everything in this section I re-verified directly against the built assets and the source on 2026-07-31, not by reading our own documentation. Where a number is quoted, I recomputed it.

**Read this section with §1 in mind.** These are controls on the browser port's asset builder.
They are real and I would defend each one. They are also, today, controls on an artifact that
is not the artifact causing the exposure — which is the point §4.6 makes, and it is why I did
not put this section first.

#### 3.1 Node-snapping — the raw coordinate is discarded before anything else happens

*Plain English:* every reported camp location is replaced by the location of the nearest street intersection, and the original point is thrown away before any file is written.

*What it technically guarantees:* no raw coordinate from the feed survives into any published artifact *of the browser port*. The displacement is the distance from the report to the nearest street node. That distribution lives only in a git-ignored local report, which records it as numbers and does not characterise it; I have deliberately not reproduced those numbers here. What I can say from them without reproducing them: the **typical** displacement is materially finer than the 150 m grid cell described in §3.3 — the median and the 95th percentile both sit below 150 m — but the **largest** displacement in the feed exceeds 150 m by a factor of several, so "finer than a grid cell" is a statement about the bulk of the distribution and not about every report. **This is a real control against exact-coordinate disclosure and a weak one against locating a site**, and I say so again in §5.

#### 3.2 Field dropping — dates and vehicle flags never enter the pipeline

*Plain English:* the incident date and the vehicle flag are not read, not hashed, not counted, and have no representation anywhere downstream.

*What it technically guarantees:* the port's published data cannot support "a camp was here *on this date*". I verified this structurally: the internal record type carries only longitude, latitude and incident id, so the dropped columns cannot appear even by accident. I should not claim more for it than that. Dropping the date removes the ability to distinguish a report from last week from one from last year, and it removes the ability to reconstruct a site's history — but someone intending to visit a location does not need the date, and the whole feed is recent (§2). **This control narrows what a reader learns; it does not make a location un-actionable.** And note the limit that §1 forces: the incident date is a column of the raw CSV, which is already public with the date intact.

#### 3.3 k = 5 aggregation on the display layer — the map shows density, never points

*Plain English:* the map layer is a grid of squares with counts, and no square is shown unless at least five separate reports fall inside it; squares that fall short are combined with their neighbours into a bigger square and retested, and anything still too sparse is dropped entirely and reported as a total.

*The scheme, precisely:*

- Minimum cell size **150 m** in both directions.
- Grid origin is absolute and data-independent, so a cell index reveals nothing about where the data is. The latitude band is hard-coded, not derived from the reports.
- **k = 5.** A cell below k folds into its parent cell (half the index in each direction — a quadtree on the same fixed origin), doubling the cell size, and is retested. Cells are merged up to level 5 (about 4.8 km); anything still below k there is suppressed and counted.
- Every published cell carries `{i, j, level, count}` and **no coordinates**.

*Measured result — I recomputed all of these from the built asset:*

| Quantity | Value |
|---|---|
| Cells published | **506** (by merge level: 90 / 164 / 124 / 99 / 18 / 11) |
| Cells below k | **0** |
| Smallest published count | **5** |
| Largest published count | **14** — but in a *level-3* cell (~1.2 km). Per-level maxima are 12 / 12 / 13 / 14 / 13 / 11, so the largest count in any 150 m square is **12** |
| Reports reaching the map | **3,371 of 3,400 = 99.1 %** (3,371 / 3,400 = 99.147 %) |
| Reports suppressed | **29**, across **10** cells that never reached 5 at any resolution |

*What it technically guarantees:* two properties, both asserted in code and covered by tests. (a) Every published count is at least 5. (b) A merged square can never be read back down to one child: its count is the sum of children that each *failed* k, so a parent reaching 5 needs at least two non-empty children. The 29 suppressed reports are published as an aggregate deliberately, because a layer that silently drops reports is a layer whose totals lie.

*What it does NOT guarantee, and I want to correct an earlier version of this memo that said it did:* **k = 5 is a floor on reports, not on sites.** An earlier draft said "no published square corresponds to a single site." That is false, and I found it by testing it rather than by re-reading it. Because the feed contains repeat reports (3,400 reports at 3,317 distinct coordinates) and because reports are counted after snapping, a cell can reach 5 from a single street intersection. I measured how often: of the **90** finest published cells, **10 are backed by exactly one snapped street node** — every report in that 150 m square came from one intersection — and a further 22 are backed by exactly two. Those 10 cells carry counts of 5 or 6. Two mitigations are real and I state them so the correction is not read as worse than it is: the published file contains **no coordinate**, so a reader cannot tell *which* intersection; and the display layer carries no node information, so a reader holding only that file cannot even tell *which cells* are the single-node ones — I could only determine it by reading the sibling binary in §4.1. The disclosure from this file remains bounded by the 150 m cell footprint. But "at least five reports" is not the same statement as "at least five places," and this memo should not have implied it was.

*Note on how this number came to exist:* an earlier version of this builder wrote a layer of 1,863 cells, of which 1,773 held fewer than five reports and **1,100 held exactly one**. A 150 m square with a count of one is a campsite location to within a block. The builder had even measured that number and printed it to the console, and wrote the file anyway. I want to be exact about the scope of that failure, because overstating it would be its own kind of dishonesty: **that defective asset was never deployed or served to anyone.** It existed only in the local build directory, and the k = 5 floor exists because adversarial review of the built bytes caught it before any publication path existed. I mention it because it is the strongest available evidence about how much weight to put on my own assurances here — and §1 is the second-strongest. (I re-derived all four of these figures — 1,863 / 1,773 / 1,100 / smallest count 1 — from the raw feed and the current builder on 2026-07-31, rather than quoting the earlier decision record.)

#### 3.4 Salted-hash identifiers — municipal incident ids are replaced by per-build pseudonyms

*Plain English:* each report's City incident number is replaced by a short code derived from it and a secret random value that is regenerated from scratch every time the data is rebuilt.

*The scheme, precisely:* the published code is `SHA-256(salt ‖ ":" ‖ incident_id)` truncated to the first 12 hex characters (6 bytes). The salt is 32 random bytes, generated **fresh on every build** and never read back from disk; it is written to a git-ignored local path with file mode 0600. A `--destroy-salt` flag deletes it after the build.

*What it technically guarantees:* a reader who does not hold the salt cannot recover a City incident number from a published *port asset*, and therefore cannot use the City's own feed to turn a published row back into an exact dated coordinate. Because the salt is fresh per build, a salt disclosure compromises one build's mapping rather than every asset the machine has ever produced.

*What it does not guarantee, stated bluntly:* **the strength of this control is exactly the secrecy of one file, and nothing more.** The incident id space is small and structured. Anyone who obtains that salt file can reverse all 3,400 pseudonyms immediately — there is no computational cost to defeat, no key-stretching, no residual protection from truncation. Pseudonymity here is a custody question wearing a cryptography costume, and it should be evaluated as a custody question (§7, Decision B). **And it is worth being blunt about the marginal value of this control given §1:** all 3,400 raw incident identifiers are already published in the run archive, so pseudonymising them in a future asset protects against re-identification only for a reader who has the asset and has not found the archive.

#### 3.5 The git-ignored raw path

*Plain English:* within the browser-port subtree, the raw campsite file and the secret salt live in a folder that git is configured to ignore, so they are not committed alongside that code.

*What it technically guarantees:* I verified the ignore rule actually bites for both the raw CSV copy and the salt file, and for the built-asset directory. Within the browser-port subtree, the claim holds: `git ls-files` over the local-raw path and the built-asset path returns nothing.

*What it does not guarantee — three things, and the third is the serious one:*

1. **A byte-identical copy of the raw feed is tracked in git elsewhere in this repository**, at the Java model's data directory. Both copies hash to the same SHA-256; I verified this. The tracked copy is the Java model's committed input and predates the browser port, and the publication gate deliberately falls back to it so it can run on a machine that has the repository but not the local copy. This is not hidden and not accidental — but it means the comment in our ignore file claiming raw data "never enters git" **is false at repository scope**, and I would rather you hear that from me.
2. **"Not in git" is not "not replicated."** The local raw path sits inside a cloud-synchronised Desktop folder on my machine.
3. **Our GitHub remote is PUBLIC. I verified this on 2026-07-31** by retrieving the repository page, which returned a full public file listing. An earlier version of this memo said this could not be determined without a network call; it has now been determined, and the answer is the one that makes item 1 consequential rather than academic. **The raw feed — all 3,400 rows with coordinates, dates and incident ids — is therefore already published**, and so is the run archive that reproduces those same values per agent (§4.6). Every control described in §3.1–§3.4 is downstream of that. This is why §7 asks about the already-public copy first and about the website last.

   *One scope limit on my own verification, so it is not read as broader than it is.* The browser-port subtree (`websim/`, 305 files) is committed only on a **local** branch that has not been pushed: it has no upstream, no remote-tracking ref, and `git ls-tree` finds zero `websim/` files on any of the four published branches. The same is true of the CI workflow. So the asset builder, the publication gate and the asset format spec are **not** currently public — but they will be the moment that branch is pushed, which is the intent. I record this because an earlier note claimed they were already public, and that was not supported by the evidence.

#### 3.6 The automated deploy check

*Plain English:* before anything can be published from the browser port, an automated gate reads every file we would ship and searches it for raw campsite coordinates, raw incident numbers, small map cells, and the secret salt; if it finds any, publication fails.

*The six detectors:* (1) the raw binary bit-pattern of a raw longitude or latitude at any byte offset in either endianness; (2) both the longitude *and* the latitude of the same raw report present as text in one file — the shape an actual leaked location takes; (3) one raw longitude or latitude alone; (4) a raw incident id or anything matching its format; (5) any published density cell below k; (6) the build's salt as hex text, raw bytes, or base64.

*What it technically guarantees, with the live result:* I ran the gate against all **39** built asset files on 2026-07-31. It reported **0 blocking findings** and confirmed it had actually checked for salt material. It reported 96 advisory findings, all of one kind: a single longitude or latitude in a shelter file coincidentally equal to one component of a raw report while the other component does not match. These are named facilities at geocoded street addresses, and six decimal places collide at a measurable rate inside a narrow bounding box. The distribution is the reason I read them as coincidence rather than leakage, and it is more specific than "spread evenly": the 96 findings trace to only **six distinct coordinate literals**, five of which recur in 19 of the 20 shipped shelter files and one of which appears in a single file. They appear in **no** encampment asset, and the twentieth shelter file — the three-row September-2020 table — has none at all. Six repeated values across near-identical files is what duplication of the same shelter roster looks like; it is not what a leak looks like. The gate reports them for human adjudication rather than blocking, on the reasoning that blocking on coincidences trains people to ignore the gate. The 56 tests behind the builder and the gate all pass (29 + 27, re-run 2026-07-31), and they include deliberately poisoned fixtures proving the gate's exit codes actually fire.

*What it does not guarantee — four limits, all structural, and the fourth is the one §1 forces:*

1. **It is a `.json`-only check for small cells.** The below-k detector returns immediately for any file not ending in `.json`. It therefore cannot inspect our binary assets even in principle. This is a correct reading of its stated scope, not a bug — but see §4.1.
2. **It proves properties of one directory.** It reads the built-asset folder. It cannot prove anything about a file served from somewhere else in a deployment.
3. **Nothing binds a salt to the build it produced.** The gate proves "*this* salt is absent from *these* files". If the salt supplied is not the one that built those files, the check passes vacuously. In the normal order — build, then immediately check — this cannot happen. In any order where the two drift apart, it can. A one-line fix exists (publish a fingerprint of the salt in the manifest and require a match) and **is not implemented**; I confirmed the asset header and the manifest entries carry no salt fingerprint of any kind.

   For the specific build in front of you I closed this gap by hand rather than assuming it: I re-derived all **3,400** published pseudonyms from the on-disk salt and the raw feed and compared them byte-for-byte against the shipped asset — 3,400 of 3,400 matched, so the salt that gate ran against **is** the salt that built these files, and that run was not vacuous. I also verified all 38 manifest digests against the files on disk (38/38). That is a manual check of one build, not a property of the pipeline, and it does not survive the next rebuild.
4. **It has never run against the repository.** The gate scans a build directory. It has no view of what is committed to git, and it therefore did not and could not flag the raw CSV in the Java model's data directory or the 135 coordinate-bearing files in the run archive — the two things that are actually published. A gate that guards a door nobody is walking through is not a dishonest control, but it is not the control this project turned out to need.

---

### 4. What these controls do NOT guarantee

I want this section read as carefully as the last one.

#### 4.1 The k = 5 headline is true of one file, not of the publication

The 506-cell, zero-below-k, 99.1 % figures describe the **display layer**. They do not describe the other encampment asset we currently build, and no existing record in this project reconciles the two. That second asset publishes, for **2,482 exact street-node coordinates**, that at least one campsite report snapped there — and because it also publishes which node each of the 3,400 reports went to, the per-node report count is a one-line computation for anyone holding the file. I recomputed that distribution:

| Reports at a node | Number of nodes |
|---|---|
| 1 | **1,849** |
| 2 | 428 |
| 3 | 149 |
| 4 | 40 |
| 5 or more | 16 |

**2,466 of 2,482 nodes — 99.4 % — carry fewer than five reports. 1,849 carry exactly one.** In practical terms this file is a point map of where reported camps were, displaced only by the small distance from each report to its nearest street intersection. It is a *stronger* disclosure than the 506-cell grid, not a weaker one, and the k = 5 gate structurally cannot see it because it is not a `.json` file.

Two things must be said fairly alongside that. First, this is the **sanctioned design**, not a defect: node-snapped coordinates were the approved public default in our own project plan, and the k = 5 floor was added later and only to the display layer. Second, the street-node coordinates themselves are already public — all 88,100 nodes of the street graph ship in another asset. What this file adds is the **selection**: which 2,482 of them had a camp reported, and how many.

I am putting this in front of you rather than resolving it myself because **shipping a "k = 5" claim that is true of the file it names and not true of the deployment, in front of an IRB, is the failure mode I would be least able to defend: it is both a real disclosure and a false statement about our own controls.** It is worse than either honest alternative in §7.

#### 4.2 The general spatial pattern is not private, and is not meant to be

Aggregation resists identification of an individual site. It does not make the general spatial pattern private — and **the general spatial pattern is the scientific point of the work.** A layer showing which parts of Portland have concentrated unsheltered populations relative to shelter locations is precisely what the research is about. Any version of this project that publishes anything at all publishes that. There is no technical control that lets us have the finding and withhold the pattern, and I do not want to imply otherwise by listing enough safeguards that the question feels answered. **The question of whether it is acceptable to publish the pattern is a judgement about research ethics, not a question the pipeline can answer, and it is one of the questions I am actually asking you.**

#### 4.3 This is k-anonymity, not differential privacy

The counts we publish are **exact**, not noised. k-anonymity bounds identification of an individual report within a cell. It makes no formal claim about what someone who already holds an auxiliary dataset can infer, and it makes no claim at all about attribute disclosure — a reader who already knows a site exists in a given block can read that block's count directly. **And per §1, the auxiliary dataset in this case is our own repository.**

#### 4.4 Salt custody is an unresolved human-process question, not a solved technical one

Per §3.4, the pseudonyms are exactly as strong as the secrecy of one 32-byte file, which currently exists on disk inside a cloud-synchronised folder. The realistic failure is not an attacker; it is a backup, a shared machine, or simply forgetting. This is Decision B in §7.

#### 4.5 The controls are not yet wired into the product

The disclosure controls described above are properties of the **asset builder**. They are not yet properties of the **product**. Specifically, and I verified all three:

- The simulation engine still reads the **raw CSV path** to build its population.
- Residents are constructed carrying the raw coordinate and the raw incident id, and the per-agent export writes them out at six decimal places, along with each agent's distance from its raw location to its snapped node — the exact quantity our own disclosure record says must never be published, because a per-report distance from a public node is a circle drawn through the raw location.
- **Nothing in the engine, the app, or the shared library consumes the safe public asset.** It has no consumer at all.

There is no deployed site, the app is a scaffold with no map in it, and the raw CSV is not in the built-asset directory — I checked all three. So **nothing has leaked from the browser port.** But a deploy built today would defeat the control silently, and the gate would not see it, because the gate reads the asset directory and a raw file served from the web app's own folder is not in it. **Closing this is a prerequisite to any deploy regardless of which option you choose below**, and it is unscheduled engineering work.

I have to withdraw one sentence that appeared in earlier drafts of this section. It said, of the disclosure exposures generally, "none of this has leaked." That is true of the browser port and false of the project, and §4.6 is why.

#### 4.6 The archived run outputs already publish the raw data — this is the live exposure

This subsection did not exist in earlier drafts because the answer was recorded as unaudited.
It is no longer unaudited, and it is the most consequential measured finding in this memo.

The Java model's archived run outputs under `docs/runs/` are tracked in git and therefore
published (§1). Measured, not inferred from the header contract:

| Quantity | Value |
|---|---|
| Tracked `agents.csv` files in the published archive | **136** |
| Of those, carrying `start_lon`, `start_lat` and `snap_gap_m` | **135** (one older 27-column file carries `starting_encampment` only) |
| Published agent rows carrying start coordinates | **918,865** (of 918,915 rows total) |
| Coordinate precision in those rows | **six decimal places** |
| Distinct raw municipal incident identifiers appearing across the published archive | **3,400 of 3,400** — the entire feed |
| Distinct raw coordinate pairs appearing across the published archive | **3,317 of 3,317** — the entire feed |
| Archive size | ~375 MB across 15 run directories, 475 tracked files |

Three consequences follow, and I would rather state all three than the comfortable one:

1. **The whole feed is republished, not a sample of it.** Because the model samples starting
   locations across many runs with many seeds, the union of 136 published exports covers every
   report in the input. There is no aggregation, no pseudonymisation and no field-dropping in
   this path.
2. **`snap_gap_m` is published per agent.** Our own disclosure record states that a per-report
   distance from a public street node is a circle drawn through the raw location, and that it
   must never be published per report. It is published, 918,865 times, alongside the raw
   coordinate it would have reconstructed anyway.
3. **This predates every control in §3 and is unaffected by any of them.** Whatever is decided
   about the website, this is already the case, which is why Decision R in §7 is separate from
   Decision A and is asked first.

Stated fairly on the other side: this is a republication of an open-data feed, not of
confidential records (§1); the two other published archive file types are clean (154
`simulation.json` with zero raw identifiers and no raw coordinate pair, 154 `shelters.csv`
with zero raw encampment
coordinates); and I found this by looking for it rather than being told, which is the only
credit I will claim for it.

---

### 5. Could an adversary combine the published aggregate with outside knowledge to re-identify a site?

Taking the proposed display layer alone, and answering honestly:

**What the aggregate gives an adversary directly.** For the 90 finest cells, the statement is "between 5 and 12 campsite reports were made in this roughly 150-metre square over an eighteen-month window" — about one to two city blocks, with no indication of how many distinct sites those reports represent or whether any is still occupied. Two things must be said alongside that, and they point in opposite directions. Against complacency: per §3.3, 10 of these 90 cells in fact arise from a **single** street intersection, so "5 reports" does not mean "5 places." In mitigation: a reader holding **only this file** cannot tell which 10 those are — the display layer carries no node information at all — so the practical resolution for a display-only publication really is the 150 m square. The distinction matters because it means the single-node fact is a reason not to *claim* a guarantee we do not have, not by itself a reason to expect worse disclosure from option A1. (5 to 12, not 5 to 14. I recomputed the count range separately for each merge level from the built asset: the largest published count in the file, 14, sits at level 3 — a square about 1.2 km across — and no 150 m square carries more than 12. An earlier draft of this memo, and our own ground-truth record, quoted the whole file's 5–14 range as though it described the finest cells. It does not, and the corrected figure is the one that matters for judging block-level disclosure.) For the 29 *cells* at levels 4 and 5 — a different 29 from the 29 suppressed *reports* in §3.3 — the statement is about squares 2.4 km to 4.8 km across, which is a neighbourhood. **Nothing in this file locates an individual camp** — it carries no coordinate at all — and the two structural properties in §3.3 mean a merged square cannot be arithmetically read back down to a single child cell. Neither statement is the claim retracted in §3.3: this file bounds disclosure to a cell footprint, it does not establish that a cell holds more than one site.

**What an adversary with outside knowledge gains.** Someone who already knows a corridor or a block gains *confirmation and ranking* rather than location: the layer tells them which blocks are densest. For an actor conducting sweeps or private removals, ranking is genuinely useful — it is arguably the main thing they would want — even though it does not name a site. I do not think it is honest to call this "no marginal risk."

**The "it's already public" argument, and its limits.** The City publishes the underlying feed, so an adversary determined to build a camp map does not need us. That argument has four real limits, and the fourth is new to this revision.

- **(a)** I have **not** established that the City's licence permits redistribution of a derived product (§6, §7 Decision L).
- **(b)** "Already public" is not the same as "no additional harm": a curated, mapped, searchable, permanently-hosted product lowers the effort barrier substantially compared to an ArcGIS query endpoint, and effort barriers are most of what protects this population in practice.
- **(c)** Per §2, the City's feed is a rolling window and ours is a frozen snapshot, so republication defeats the City's own retention behaviour. **I regard this as the strongest argument against publishing anything derived from this feed**, and — unlike in earlier drafts, where it described a proposal — it now describes something already in effect.
- **(d)** The argument cannot be used to excuse *our own* publication, because we are the ones who did it. "The City publishes it too" is a reason the marginal harm of our copy may be smaller than it looks. It is not a reason our copy is licensed, is retention-respecting, or should stay up. Whether it should stay up is Decision R.

**One re-identification vector I want on the record because it is not currently mitigated.** If the display layer is ever *rebuilt and republished* against a refreshed feed, and both versions remain retrievable, the two exact-count releases can be differenced. Differencing successive exact-count aggregate releases over overlapping populations is a standard attack on this class of release, and our counts carry no noise that would blunt it. This is my analysis, not a measurement from the repository, and it is conditional on republication — but if you approve publishing this layer, **"the layer is published once and never refreshed, or refreshes replace rather than accumulate"** is a condition worth attaching in §7.

**And the honest bottom line for this section:** the re-identification analysis above concerns a
prospective aggregate. **The material exposure today is not an inference problem at all.** It is
§4.6 — 918,865 published rows carrying the entire feed's raw coordinates and raw municipal
identifiers at six decimal places. No adversary modelling is required for that one, and no
control in §3 touches it. §4.1's 1,849 single-report street-node locations would be the second
such exposure if the port were deployed as it stands.

---

### 6. What I could not establish, and what only you can

Two items that appeared here in earlier drafts have been **resolved** and moved into the body:
repository visibility (now §1 and §3.5 item 3 — the repository is public) and whether archived
model output containing raw coordinates has been circulated (now §4.6 — it is published, and I
measured what it contains). What remains genuinely open:

1. **Whether the City's licence permits redistribution of a derived product — or of the raw rows we have already redistributed.** Our records note the licence only as "City of Portland open data (public)" and "Subject to the City of Portland's open-data terms". There is no licence text, no terms URL, and no written determination in the repository. Whether that permits republishing a density layer, a node-level file, or the raw rows is **unestablished** — and per §1 the raw rows are already republished, so this is not a question about a future step. By contrast, the street-network dataset has an explicit written-determination workstream; this feed has no equivalent, and I think it needs one. This is Decision L in §7.
2. **Whether this study requires IRB review at all.** The data is municipal-administrative and was not collected from human subjects by this project, which often changes the answer. Nothing in our records states a determination either way. **This is a question for you, not something the project can answer**, and it is why the IRB line in the header is conditional.
3. **How complete our sample is** relative to the City's full feed. Our retrieval walks the record-id range in windows and is explicitly not a census; the size of the underlying dataset is not recorded, so "3,400" cannot be expressed as a fraction.
4. **Whether the aggregate distribution of snap displacements is itself safe to publish.** It exists only in a git-ignored local report. I deliberately did not reproduce it here and did not make that judgement. §3.1 states two qualitative facts about it — that the median and 95th percentile fall below 150 m and that the maximum does not — because §3.1's claim is unusable without them; no percentile values appear anywhere in this memo. (Note that §4.6 makes this partly moot for the *published* archive, where the per-agent snap gap is already out.)
5. **Whether copies already exist beyond our control.** A public repository can be cloned, forked, mirrored, cached by search engines and archived by third parties. I have no way to enumerate that from here, and neither does anyone else. It bears directly on Decision R: **withdrawal reduces future exposure; it does not undo publication.**

---

### 7. Decision options

Five decisions are being asked for. **R** (the already-public repository copy) and **L** (the
City licence) are live regardless of what is decided about the website. **A** (what the website
may additionally publish), **B** (salt custody) and **C** (the prerequisite condition) concern
the browser port.

Please mark one option under R, one under L, one under A and one under B, and acknowledge C.

#### Decision R — the copy that is already public

This is the decision the memo did not previously ask, because earlier drafts wrongly assumed
nothing had been published. It concerns the raw CSV (§1) and the 135 coordinate-bearing
archived exports (§4.6). **None of the options below undo publication** — see §6 item 5.

**R1 — Leave the repository public and the data in place, as it stands.**
*This is the current state.* The researcher's interim decision of 2026-07-31 was to leave it public pending this review, so choosing R1 ratifies the status quo rather than changing anything.
*Basis available to you:* the feed is City open data (§1), every record was public when collected, and the marginal harm of our copy relative to the City's own endpoint is real but bounded (§5b).
*Risk:* the persistence problem (§2, §5c) continues to operate and compounds with time — the older our frozen copy gets relative to the City's rolling window, the more it is the only place those reports exist. The licence question (Decision L) remains unanswered while redistribution continues.

**R2 — Make the repository private pending determinations.**
*Cost:* reproducibility and open-science posture take an immediate hit; anyone currently citing a commit loses access; CI and any external collaborator lose access. Reversible at any time.
*Gain:* stops further distribution immediately and cheaply, and buys time for L without deciding anything irreversibly. It changes no commit hash. For comparison, R3 and R5 leave the data retrievable from history unless paired with R4, and R4 re-anchors every commit id.

**R3 — Keep the repository public; remove the raw feed and the coordinate-bearing exports going forward, leaving history intact.**
*What it achieves:* the files disappear from the default view and from fresh clones' working trees.
*What it does not achieve:* **they remain fully retrievable from git history by anyone**, with one command. Be clear-eyed that this is a presentation change, not a disclosure change, unless it is paired with R4.

**R4 — Rewrite history to purge the raw feed and the coordinate-bearing exports from all published branches, and force-push.**
*What it achieves:* removes the data from the repository as distributed going forward — the strongest available withdrawal.
*Cost, stated without hedging:* **every commit hash on every rewritten branch changes.** This project's reproducibility claims cite commit ids; run manifests record the build commit; the archive's own provenance is commit-anchored. All of that would need re-anchoring, and any external citation of a commit breaks. It does not recall clones, forks, caches or archives already made (§6 item 5). It is irreversible in the sense that the old hashes cannot be restored without re-publishing exactly what you removed.
*I am not recommending for or against this. I am costing it so it can be chosen or ruled out on the record rather than being quietly unavailable.*

**R5 — Keep the raw feed public; strip the coordinate and identifier columns from the archived exports.**
*Rationale:* the raw CSV is a defensible republication of an open-data file with clear provenance. The 918,865-row per-agent re-emission of the same values (§4.6) is a byproduct of a logging format, not a research artifact anyone asked for.
*Cost:* archived exports lose per-agent start-location fields; any validation that joins on them would need re-derivation. Same history caveat as R3 unless paired with R4.
*Note:* the aggregate `simulation.json` files are unaffected — they carry no raw identifiers and no raw coordinate pair (§1).

#### Decision L — the City licence

**L1 — Obtain a written determination from the City before the current state is ratified.**
Ask the City's open-data contact, in writing, whether the terms permit (i) redistribution of the raw rows, (ii) publication of a derived density layer, (iii) publication of a node-level derived file. File the answer in the repository. *This is what the street-network dataset already has and this feed does not.*

**L2 — Mentor records a determination that current redistribution is covered, with the basis written down.**
Acceptable if you have a basis; the point is that **something** written must exist, because "City of Portland open data (public)" is a free-text note by a student and not a licence determination.

**L3 — Defer, and accept that redistribution continues unlicensed-of-record in the meantime.**
Listed because it is what happens by default if nobody chooses, and defaults should be visible.

#### Decision A — what the interactive website may additionally publish

**A1 — Publish the aggregate display layer only; do not publish the node-level file.**
506 cells, none below 5, 99.1 % of reports represented. The node-level file is withheld from the deployed asset set.
*Risk:* the general spatial pattern is published (§4.2) and gives an adversary block-level density ranking (§5). No coordinate is published, so no individual site is locatable to better than its 150 m cell — but note §3.3: in 10 of the 90 finest cells a reader can infer that all of that cell's reports came from a single intersection somewhere inside the square.
*Cost:* the node-level file has **no consumer today** (§4.5), so withholding it costs nothing that currently exists. It would have to be revisited before the in-browser simulation is wired to real start locations.
*My assessment:* this is the option most defensible on the current evidence, and it is the one I would choose if the decision were mine. I am not asking you to ratify that. **Note also that its marginal disclosure is smaller than it was when this memo was first drafted — not because the layer got safer, but because §4.6 is already public. That is an argument about marginal harm, not a justification, and I do not want it read as one.**

**A2 — Publish the aggregate display layer and the node-level file as it currently stands.**
*Risk, stated without hedging:* this publishes 2,482 exact street-node locations at which camps were reported, 1,849 of them carrying exactly one report. It is a usable camp map. Choosing this is choosing to publish site-level locations, and the memo should say so in exactly those words if you choose it.
*Defensible only if* the published documentation states plainly that the k = 5 figure describes one file and not the publication.

**A3 — Publish the aggregate layer and a floored version of the node-level file.**
Apply the same k = 5 rule to nodes: publish only nodes with at least five reports.
*Measured consequence:* that is **16 of 2,482 nodes**. The asset effectively disappears. This is a measurement, not a rhetorical point — node-level publication and a k = 5 floor are close to mutually exclusive on data this sparse. Listed so the option is visibly available and visibly empty.

**A4 — Approve the sign-off-conditional exact-coordinate engine binary.**
This is specced but **not built**, and our project plan records it as "blocked on sign-off, not on engineering". It would ship exact raw coordinates inside an opaque engine file, restoring the one fidelity property that node-snapping gives up (per-report snap distance) and removing any residual doubt about start-location assignment.
*Risk, stated without hedging:* this is publication of 3,400 precise, recent, dated encampment locations. **"Opaque binary" is an encoding, not a protection** — our own gate contains a binary coordinate detector precisely because a float inside a binary file is still a coordinate, and the parser for that format is committed in this repository and would become public the moment the port branch is pushed. Our own risk register classes this artifact as a critical ship-blocker, and our own plan already states the countervailing rule: *"A raw-coordinate public layer is never acceptable — not togglable, not Easter-egged."*
*Scientific gain:* one fidelity property (a per-report distance measure), which affects a validation claim, not a research finding.
**I am not requesting this option, and I do not recommend it.** It is listed because the plan requires it to be put to you explicitly rather than quietly dropped, and because you should have the chance to rule it out on the record.

**A5 — Publish no encampment-derived layer at all.**
*Risk:* none to this population from the website. **It does not resolve Decisions R or L**, which is the substantive change from earlier drafts of this memo: choosing A5 no longer means "this project publishes no encampment data."
*What the site loses, honestly:*
- **The map loses its only depiction of demand geography.** Shelters, streets and smoke would render; where people actually are would not. The central visual argument of the site — that shelter locations and population locations do not line up — becomes a claim in text rather than something a viewer can see.
- **The in-browser simulation loses its real start locations.** The model has no other source of them. It would need either synthetic or randomised start points, which breaks the initial-world bit-identity claim the port advertises against the Java model, or it would have to fall back to replaying archived certified runs only.
- **What survives:** the archived-run display path. **Seven of the eight presets** in the design have a certified Java run behind them, so a no-encampment-layer site can still show real results from real runs — it simply cannot let a visitor run a new simulation from real starting locations, and it cannot draw where people are. I should not overstate this: the **eighth preset is the default one a first-time visitor lands on** (`default_fresh_run`), and it is deliberately *not* an archived configuration — its own definition records that it "earns ENGINE-CERTIFIED, never ARCHIVE-VALIDATED." Choosing A5 therefore also means either changing the site's default preset to an archived one or accepting that the default landing experience is a live run that no longer has real start locations. That is a design consequence you should weigh, not a hidden cost I am glossing.
*This is a survivable outcome for the project and you should feel free to choose it.*

#### Decision B — salt custody

**B1 — Withhold** (current default): the fresh per-build salt stays at the git-ignored local path.
*Gains:* a provenance question about a specific published row stays answerable, and the publication gate can be re-run at any time.
*Risk:* anyone obtaining that one file reverses all 3,400 pseudonyms and, via the City's own feed, recovers exact dated coordinates. The file is in a cloud-synchronised folder. Blast radius is bounded to one build because the salt is fresh per build. *Weigh this against §4.6: the identifiers the salt protects are already public in the run archive, which lowers what a salt compromise would add without making the custody question go away.*

**B2 — Destroy** (`--destroy-salt` after the gate runs): the mapping becomes irreversible for everyone, permanently, including us.
*Cost:* **no scientific result.** I verified there is no consumer of the pseudonym anywhere in the codebase; nothing joins on it.
*Risk:* a later data-quality or ethics question about a specific published row becomes permanently unanswerable, and the gate cannot be run against that build afterwards without a rebuild.
*Ordering requirement:* run the gate first, then destroy.

#### Decision C — prerequisite condition (not optional; please acknowledge)

Regardless of the option chosen under A, **no deploy may happen until the engine stops reading the raw file and the browser export path is decided** (§4.5). I am proposing this as a hard precondition attached to whatever you sign, along with two extensions the evidence now forces:

- extend the automated gate to scan the actual deploy directory rather than only the build directory, and to treat the raw file's own hash as a blocking signature anywhere in it;
- **extend the gate, or add a separate check, to scan what is committed to git — not only what is built.** Per §3.6 limit 4, the gate has no view of the repository, which is why it never flagged the two artifacts that are actually published. Any future export format that carries raw coordinates should fail a pre-commit check, not merely a pre-deploy one.

---

### 8. Sign-off

I am asking for decisions, not for approval. If the answer is that this data should not be published in any form — including that what is already public should come down — that is a clear and workable outcome and I would rather have it now than later.

```
DECISION R (the already-public repository copy) — select one:

  [ ] R1  Leave public and in place as-is (ratifies the current state)
  [ ] R2  Make the repository private pending determinations
  [ ] R3  Remove data going forward; leave git history intact
  [ ] R4  Rewrite history and force-push  ← breaks all commit hashes
  [ ] R5  Keep the raw feed; strip coordinate/id columns from archived exports
  [ ] Other / deferred pending: _______________________________________

DECISION L (City of Portland licence) — select one:

  [ ] L1  Obtain a written determination from the City before ratifying
  [ ] L2  Mentor records a determination now. Basis: ___________________
  [ ] L3  Defer (redistribution continues unlicensed-of-record meanwhile)

DECISION A (what the website may additionally publish) — select one:

  [ ] A1  Aggregate display layer only; node-level file withheld
  [ ] A2  Aggregate display layer + node-level file as-is
  [ ] A3  Aggregate display layer + k-floored node-level file (≈16 nodes)
  [ ] A4  Exact-coordinate engine binary approved  ← requires IRB concurrence
  [ ] A5  No encampment-derived layer published at all
  [ ] Other / deferred pending: _______________________________________

DECISION B (salt custody) — select one:

  [ ] B1  Withhold the salt at the git-ignored local path
  [ ] B2  Destroy the salt after the publication gate runs

DECISION C (prerequisite) — acknowledge:

  [ ] I understand that no deploy occurs until the engine is rewired off the
      raw data path, the browser export contents are decided, and the
      disclosure check covers what is committed and not only what is built.

CONDITIONS ATTACHED (write in — e.g. "publish once, never refresh";
"unlisted URL only"; "City licence determination required first";
"re-review before any public URL"; "R decision revisited after L answers"):

  ____________________________________________________________________
  ____________________________________________________________________
  ____________________________________________________________________

IRB STATUS (mentor to complete):

  [ ] No IRB review required for this study. Basis: ____________________
  [ ] IRB review required. Protocol / determination reference: _________
  [ ] Referred to [IRB OFFICE] for determination on __________________


FACULTY MENTOR

  Name: ______________________________  Signature: ____________________

  Title / Institution: ________________________________________________

  Date: ______________________


IRB / HUMAN SUBJECTS REPRESENTATIVE (if applicable)

  Name: ______________________________  Signature: ____________________

  Title / Office: _____________________________________________________

  Date: ______________________


SUBMITTED BY

  Name: ______________________________  Signature: ____________________

  Role / Institution: _________________________________________________

  Date: ______________________
```

---

### Appendix — supporting records

| Document | What it holds |
|---|---|
| `websim/docs/WP1-GROUND-encampment.md` | The verified ground-truth record most numbers in this memo are drawn from, with the commands that produced each one. **Note:** its §3.1 and §6 item 1 still record repository visibility as undetermined and have not yet been corrected; §1 and §3.5 of this memo supersede them |
| `websim/docs/DR-Q4-encampment-disclosure.md` | The decision record for the k-anonymity floor and the fresh-salt change, including the still-blank salt-custody line |
| `websim/docs/IMPLEMENTATION_PLAN.md` | §4 Q4 (the data policy), §8 WP1 (this memo as a deliverable), §9.1 risk W2, §10 item 1 (the veto surface) |
| `Geography/data/README.md` §2c, `LICENSE` §4 | Source provenance, retrieval method and date, and the licence-as-recorded free-text phrase that §6 item 1 and Decision L turn on |

**This memo contains no raw coordinates and no raw encampment identifiers.**
