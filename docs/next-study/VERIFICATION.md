# Adversarial verification of the audit report

Two independent critic agents reviewed the finished report before publication
(workflow `wopehf5gk`, 2 agents, 118 tool calls, 249,652 tokens, 2026-08-21).

| Critic | Scope | Verdict | Findings |
|---|---|---|---|
| `critic:completeness` | Report vs. the commissioning brief's 10 deliverables | **PASS-WITH-FIXES** | 1 MAJOR + 5 MINOR |
| `critic:fidelity` | Every claim vs. the 17 agent JSONs (no-fabrication check) | **PASS-WITH-FIXES** | 1 BLOCKER + 2 MAJOR + 5 MINOR |

**All 14 findings were resolved before publication** — 13 as edits to the report, 1 by
substantiation. Resolution was re-verified on 2026-08-29 against the rebuilt report.

## Completeness critic

| # | Sev | Finding | Resolution |
|---|---|---|---|
| C1 | MAJOR | Evidence-level conflation: the §1 "Reproducibility chain" bullet carried a single `VERIFIED` chip, but Appendix B defines run counts and byte-identity passes as `REPORTED` (read from repo reports, not re-executed). A repo-asserted result was presented as audit-verified fact — on the report's strongest claim. | Chip split into `VERIFIED (mechanisms + hash records)` + `REPORTED (pass results, not re-executed)`; the TypeScript-port clause tagged `REPORTED` separately; the "One-dimensional sensitivity" bullet likewise split into `VERIFIED (archives present)` / `REPORTED (statistics)`. |
| C2 | MINOR | Two censuses of the same registry appeared to contradict: §1 gave `M=15, L=11, A=29` (=55) while §10 gave `~11 local, ~10 transferred, ~15 assumed` (=~36), with no text distinguishing the taxonomies. | §10 now states both explicitly: the evidence-class census over all 55 rows, and the LOCAL/TRANSFERRED/ASSUMED provenance census over the ~36 behavioral/exposure coefficients among them. |
| C3 | MINOR | §7 Phase 1 asserted a records request "resolves A-04" — the outcome of records not yet obtained, and whose existence the report elsewhere only hedges as "almost certainly exist". | Reworded to "could resolve A-04 if the records state capacity and its unit". |
| C4 | MINOR | The absent transportation mechanism was named twice as a missing component but had no method or plan step in §7/§8, and no explicit out-of-scope statement — while deliverable 8 requires a method per missing component. | A `Transportation (absent from the model)` row was added to the §8 method table: a request/fulfillment queue behind an R3-gated mechanism switch, estimated from Phase-4 dispatch logs, with the walk-only scope boundary to be disclosed in the manuscript until then. |
| C5 | MINOR | The subtitle promised a requirement-by-requirement audit, but `R1`–`R8` appeared only once, in Appendix B's agent roster — no section or row carried its requirement id. | All ten §2 gap rows tagged with their requirement ids (11 chips; the outreach/transport/staffing row carries both `R1` and `R3`). |
| C6 | MINOR | Garbled magnitude in the report's self-declared most dangerous item (S2): "within 0-1 residents of each other against 47 of seed noise" — units ambiguous, and §3 separately cited "~11 residents", leaving the reader unable to judge whether the arm equality sat inside or outside noise. | Rewritten as "within 0-1 residents of each other, while the between-seed spread is ~47 residents (seeds 42-44)". |

## Fidelity critic

| # | Sev | Finding | Resolution |
|---|---|---|---|
| F1 | **BLOCKER** | Time-sensitive item 1 (the live Aug-2026 DEQ advisory: advisory since Aug 3, metro AQI ~160, county pointing residents to libraries) was chipped `EXTERNAL-FETCHED`, but its sole source in `method_external_data.json` is labeled `SEARCH-RESULT-ONLY`. No FETCHED entry covers those facts. A search-level source was presented as fetched. | Chip changed to `EXTERNAL-SEARCH-ONLY`, with a parenthetical separating the FETCHED DEQ severity comparison through 2025 from the search-level Aug-2026 advisory facts. |
| F2 | MAJOR | The meta strip's "387 tool calls" and "~2.0M audit tokens" appeared in no source JSON; the only 387 in the sources is `verify_E_runs.py`'s pass count, raising a borrowed-number concern. | **Substantiated, not deleted.** Both figures come from the orchestrator's own accounting in `tasks/wwf2cuqnd.output`: `totalToolCalls: 387`, `totalTokens: 1,994,554`. Independently re-verified 2026-08-29. |
| F3 | MAJOR | §1's first bullet carried a single `VERIFIED` chip covering the independent TypeScript re-implementation and its Tier 0-4 fidelity ladder — but both `inv_validation.json` and `gap_R7.json` label exactly that item `REPORTED` (websim test suite not executed by the audit). | TS-port clause split out and tagged `REPORTED`. |
| F4 | MINOR | §5 promised "every row labeled by verification level", but the EQUATES row's chip read `RULED OUT` — a content judgment, not a verification level; its source is `SEARCH-RESULT-ONLY`. | Row relabeled `SEARCH-ONLY`, keeping "Does not cover the event — ends 2019; ruled out" as the text. |
| F5 | MINOR | "DEQ Wildfire Smoke Trends reports (2023 + 2025 eds.)" — no source calls the second one a 2025 edition; the URL suggests a 2024 edition covering data through 2025. | Reworded to "(May 2023 + the update covering data through 2025)". |
| F6 | MINOR | §4's turnaway-instrument taxonomy dropped a category from `gap_R1.json`, changing the proposed field instrument. | `behavioral` restored: "(capacity / pets / belongings / dependents / behavioral / other)". |
| F7 | MINOR | W9's location compressed `gap_R2.json`'s citation into one continuous range `tex:1058-1067`, implying lines 1060-1065 are cited when they are not. | Cited as the source does: `tex:1058-1059, 1066-1067`. |
| F8 | MINOR | S1 rendered the superseded md abstract's sentence inside quotation marks as "no record could be located" — a shortened form presented as verbatim. | Quoted in full: "No observational occupancy record could be located" (`md:27`). |

## Standing caveat (from the report's own Appendix B)

Run counts, byte-identity passes, and archived statistics were **read from the repository's
reports, not re-executed** — the verification scripts write into the tree and require local run
artifacts, and the audit was strictly read-only. No observations, coefficients, or records were
invented; absences are reported as absences.
