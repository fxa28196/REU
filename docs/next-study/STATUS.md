# Next-study audit — consolidated status

**Audit date:** 2026-08-21 · **Repo state audited:** `websim-port @ 4ca0c6c` · **Archived:** 2026-08-29

The audit was **read-only**. No manuscript, model, data, or code file has been modified — then or since.
Everything in this directory is documentation and analysis output.

---

## How the audit was executed

| | |
|---|---|
| Orchestration | One dynamic workflow — 3 phases, **17 agents, all completed** |
| Phase 1 · Inventory (4) | `inv_manuscript`, `inv_model`, `inv_data`, `inv_validation` |
| Phase 2 · Gap analysis (8) | `gap_R1` … `gap_R8` — one adversarial analyst per requirement |
| Phase 3 · Methods (5) | `method_validation_protocol`, `method_statistics`, `method_spatial`, `method_gsa`, `method_external_data` |
| Cost | 387 tool calls · 1,994,554 tokens |
| Verification | 2 adversarial critics, both PASS-WITH-FIXES, **14/14 findings resolved** (see `VERIFICATION.md`) |
| Published | https://claude.ai/code/artifact/91b8197c-8b27-4e28-85e6-e33f6b9f5f4e |

Evidence taxonomy used throughout: **VERIFIED** = read directly during the audit ·
**REPORTED** = asserted by repo documents, not re-executed · **ABSENT** = confirmed missing ·
**FETCHED / SEARCH-ONLY** = web source opened vs. search-level only.

---

## Verdict against the 8 requirements

**All eight are unmet.** Full evidence and citations in `AUDIT_REPORT.md` section 2 and the per-requirement JSONs.

| Req | Requirement | Status | The load-bearing finding |
|---|---|---|---|
| R1 | Independent shelter-use observations | **ABSENT** | The entire event record is one newsroom snapshot (~90 + ~40 of 198 beds, night of 2020-09-15) plus one 211 sentence. The repo's own words: these are "the only quantitative behavioural calibration targets this project has". Zero turnaway records exist anywhere. |
| R2 | Locally estimated behavioral coefficients | **ABSENT** | All six hazard coefficients, both choice weights, all barrier costs and the outreach rate are classed ASSUMED. E9 calibration deferred with no run archive; the computed alphaHazard correction (-8.7) was never adopted. One genuinely local estimate exists: the Hines N=73 survey (awareness 0.356, attempt 0.385). |
| R3 | Identified awareness to access effect | **ABSENT** | No experiment or quasi-experiment; zero activation delay is hard-coded; no outreach/arrival timing exists. The awareness attribution is a residual with unexcluded competitors (A-04 capacity unit, population vintage, assumed coefficients). |
| R4 | Out-of-sample spatial validation | **ABSENT** | By the repo's own review: "no hold-out, no resampling of campsite locations, no spatial cross-validation". The surviving optimizer credit (walking distance) is entirely in-sample. No exact p-median or equity baseline, so the greedy heuristic's optimality gap is unquantified. |
| R5 | Feasible candidate facilities | **ABSENT** | No parcel, building, zoning, floor-area, filtration, staffing or cost data anywhere. Scenario C's 10 sites average ~349 spaces — larger than any real facility in the county (largest: 175). |
| R6 | Spatially resolved smoke exposure | **ABSENT** | One scalar per hour county-wide. Exactly **2 in-county PM2.5 monitors in 2020** (verified against EPA's own monitor file). Every exposure statistic is, in the repo's own phrase, "an access/duration statistic wearing exposure units". |
| R7 | Global uncertainty / sensitivity analysis | **ABSENT** | **Zero methodological hits for Sobol / Morris / LHS anywhere.** Every executed sweep is one-factor; headlines carry only seed ranges (~11 residents) while known input uncertainty is far larger. |
| R8 | Broader significance | **ABSENT** | One county, one observed series; the "severe" arms are transforms of it. ERL's scope page (fetched) explicitly rejects city-scale case studies that do not show broader significance. |

### The three structural manuscript defects

| # | Claim | Location | Why it fails |
|---|---|---|---|
| **S1** | The abstract asserts the 1.5-15.6x calibration bracket against "the one (approximate) observed occupancy record" | `tex:75-76` vs `tex:929-935`; `md:27` | The Calibration subsection **denies a record exists**; the ~130/198 provenance appears nowhere in the manuscript; the superseded md abstract says the opposite. Internal contradiction on the paper's only external anchor. |
| **S2** | "…applies identically to all three scenarios, so it does not affect the comparison between them" | `tex:944-945` | **Tested by the project's own archived experiment and failed.** Under measured awareness 0.356, arms A, C and D shelter within 0-1 residents of each other against a between-seed spread of ~47 residents; sheltered share is ~17.8%, not 30.1%; the mobility gap inverts; the triage reserve arbitrates nothing. The manuscript presents the awareness layer as hypothetical future work though it is implemented and archived. **A reviewer who finds the archives will read this as selective disclosure — the single most dangerous item in the audit.** |
| **S3** | Present-tense system claims: "The present 36-facility system shelters 30.1% of residents"; "550 people were refused shelter" | `md:27, 45, 315, 319`; `tex:56-57, 1043-1047` | Model outputs under universal awareness and omniscient choice, with zero observed turnaway records and FCFS order-dependence still an open blocking assumption (A-16) — phrased as facts about the real system. |

Thirteen further wording/scoping defects (W1-W13) are tabulated in `AUDIT_REPORT.md` section 6. All are text-fixable.

---

## Completed work

1. The full 17-agent audit ran to completion — every agent finished.
2. All 10 commissioned deliverables produced (see `REQUIREMENTS.md` for the brief).
3. All 8 requirements analysed adversarially, one agent each, with file:line citations.
4. Adversarial verification completed; **14/14 critic findings resolved**.
5. Report published as the artifact *Capacity vs. Evidence*.
6. Chunk 1 of the 7-chunk plan (audit + methodology architecture + train/validation split + outcome metrics) **closed**.
7. **2026-08-29:** all artifacts recovered from session-transcript provenance after the working
   scratchpad was cleared, and committed here (see "Provenance" below).

## Unfinished work

1. **Chunks 2-7 never started:** behavioral model (2), spatial validation (3), facility feasibility (4),
   smoke exposure (5), global sensitivity (6), manuscript rewrite (7).
2. **Phase 0 truth-repairs not applied** — S1, S2, S3 and W1-W13 are all still live in the manuscript.
   This is intentional: the brief forbade modification.
3. **Time-sensitive captures — executed 2026-10-02.** The full encampment feed was snapshotted
   (`scripts/snapshot-encampments.ps1`; 189,899 records, manifest and SHA-256 under
   `Geography/data/encampments/snapshots/`). The Aug-2026 AQS pull returned no Oregon rows (EPA
   posts certified data months later), so the month was captured from EPA AirNow's public hourly
   files instead (`scripts/fetch-airnow-hourly.ps1`; 6 monitors, 4,426 rows, provisional until AQS
   posts). Both are credited in `Geography/data/README.md` §2d–2e. Neither is a model input.
4. **Two open author decisions:** whether Phase-0 repairs land before or after the camera-ready,
   and which branch hosts next-study work.

## Scientific findings

1. **All eight requirements are unmet.** Internal validity is unusually strong; external validity rests
   on **two observations** — one newspaper occupancy snapshot and one N=73 retrospective survey.
2. **S2 is the headline finding.** The manuscript's claim that universal awareness "does not affect the
   comparison" is disconfirmed by the project's own undisclosed archived runs.
3. **"Awareness dominates capacity" is currently an assumption, not a result.** With no global SA it has
   never been tested across joint uncertainty. The regime grid with P(regime) and the boundary a*(K)
   is the design that would settle it.
4. **A severity-matched second Portland episode does not exist** (DEQ, fetched): all Portland
   very-unhealthy/hazardous days on record occurred in 2020. This is a hard external constraint —
   it forces a prospective arm, a records request, or a second city.
5. **Three unidentifiability results are structural, not fixable by more data of the same kind:**
   `wOfficial` is perfectly collinear with the hazard intercept (departure requires an open shelter in
   the code); barrier costs are unidentifiable from arrival-conditioned data (selection); `betaCapacity`
   is unidentified from a 99-vs-99 event.
6. **Exposure statistics are access statistics in disguise** under a uniform field — and with only two
   in-county monitors this cannot be repaired from the regulatory network alone.
7. **The reproducibility apparatus is publication-grade and should be foregrounded**, since the
   optimizer itself is conventional and cannot carry an IJGIS novelty claim.
8. **Most of the repair is cheap:** ~60-85% of the corrective science is text edits and in-repo
   computation on data already present.

## Remaining evidence gaps

| Gap | Nature |
|---|---|
| Sept-2020 nightly occupancy logs | Acquirable — the county's Jan-2024 winter AAR proves it compiles per-facility nightly Guests/Capacity tables; never requested |
| Any turnaway / refusal record, ever | Absent everywhere; every refusal figure in the deliverables is model output |
| Arrival/departure timestamps; outreach timing | Requires prospective instrumentation |
| PurpleAir Portland 2020 sensor density | SEARCH-ONLY — the one unresolved feasibility question blocking the fusion smoke surface |
| Indoor shelter PM2.5 / infiltration factor | Absent; the only route back to any "clean-air-capable" claim |
| Facility physical attributes (floor area, HVAC/MERV, staffing, cost) | Public HVAC data absent everywhere; needs a walk-through audit |
| D16 dose defect | Open and unfixed — author decision; V25's 0.61 m3/h resting rate is not in the cited EPA source |
| Identified awareness effect | Requires a stepped-wedge or cluster-randomised design; no observational route exists |
| Second-city / second-event evidence | Seattle/King County package identified and fetched; not assembled |

## Recommended next implementation phase

**Phase 0 (truth alignment) first.** Text-only, zero new runs, and it is the only item with a deadline:
resolve S1 by picking one calibration story and importing the Street Roots + Hines provenance into the
tex (the md declares itself superseded — retire it); resolve S2 with a short *behavioral conditioning*
subsection disclosing the ER measured-awareness results, and delete the "applies identically" sentence;
recondition the S3 present-tense sentences; clear W1, W2, W10, W11, W12; propagate the in-sample caveat
to the results doc, README, `scenario_c_report.json` and the deck; harmonise the 1.1x/1.2x knife-edge;
add an executed-sweep run-family column to the registry; extend `claims.yaml` with the new linter rules.

**In parallel, the two captures that expire** (snapshot the encampment feed, which retains no history;
pull Aug-2026 hourly PM2.5) were executed on 2026-10-02; see "Unfinished work" item 3. The feed
snapshot should be repeated weekly through fire season.

**Then Chunk 2 (behavioral model), gated on one decision:** the E9 rule says the single 2020 occupancy
record may serve calibration **or** validation, never both. The audit recommends keeping alphaHazard
survey-derived and quarantining the record for scoring. Confirm that before any fitting.

**If the camera-ready delays Chunk 2, start Chunk 3 instead** — spatial validation is the
highest-value executable work at ~80-85% ready today, on data already in the repo.

---

## Provenance of these files

The audit ran in a session scratchpad under the system temp directory. That directory was
**cleared by temp cleanup on 2026-08-28**, destroying all 18 working artifacts.

They were reconstructed on 2026-08-29 from the session transcript, which retains the full tool
I/O of the original run:

- **The 17 agent JSONs** were recovered from the transcript's tool-result blocks. All 17 parse as
  valid JSON and **match the pre-wipe file sizes byte-for-byte**.
- **`next-study-audit.html`** was rebuilt by replaying the original `Write` call plus the 12
  post-verification `Edit` calls, then re-applying the ten requirement-tag insertions. All 14
  critic fixes were re-verified present in the rebuilt file, along with all 10 sections,
  both appendices and 11 requirement chips.
- **`AUDIT_REPORT.md`** is a Markdown rendering of that HTML, for reading on GitHub.
- **`REQUIREMENTS.md`** is the verbatim commissioning brief, recovered from the transcript.

The canonical rendered copy remains the published artifact:
https://claude.ai/code/artifact/91b8197c-8b27-4e28-85e6-e33f6b9f5f4e

Not recoverable (fetched supporting evidence, re-fetchable from source): `deq_smoke_trends.txt`,
`deq_smoke_trends_2025.txt`, `jan2024_aar.txt`, `annual2020.zip`. Their findings are quoted with
citations inside `method_external_data.json`.
