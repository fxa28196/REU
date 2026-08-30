# Next-study audit — "Capacity Is Not Access"

A requirement-by-requirement audit of this project against **eight journal-grade validation
requirements** (IJGIS / ERL), plus a concrete next-study plan.

**Read-only.** No manuscript, model, data, or code file was modified by the audit.

| | |
|---|---|
| Audit date | 2026-08-21 |
| Repo state audited | `websim-port @ 4ca0c6c` |
| Method | 17 agents in 3 phases + 2 adversarial critics |
| Verification | Both critics PASS-WITH-FIXES; 14/14 findings resolved |
| Rendered copy | https://claude.ai/code/artifact/91b8197c-8b27-4e28-85e6-e33f6b9f5f4e |

## Start here

| File | What it is |
|---|---|
| **[STATUS.md](STATUS.md)** | **Read this first.** Verdict per requirement, completed vs. unfinished work, scientific findings, evidence gaps, and the recommended next phase. |
| [AUDIT_REPORT.md](AUDIT_REPORT.md) | The full audit report — 10 sections + 2 appendices, every claim file:line-cited. |
| [next-study-audit.html](next-study-audit.html) | The same report as a styled standalone page (source of the published artifact). |
| [REQUIREMENTS.md](REQUIREMENTS.md) | The verbatim commissioning brief: 8 requirements, 10 deliverables, 7-chunk plan. |
| [VERIFICATION.md](VERIFICATION.md) | The 14 adversarial-critic findings and how each was resolved. |

## Agent outputs (`agents/`)

The 17 structured agent outputs. The five `method_*.json` files contain the **complete
specifications** that the report only summarises — start there for implementation.

### Phase 1 — Evidence inventory
| File | Scope |
|---|---|
| `inv_manuscript.json` | Manuscript claims across both forms (md + tex), reviewer-number reconciliation |
| `inv_model.json` | Model mechanisms as actually implemented in the Java source |
| `inv_data.json` | Data assets, provenance, vintage mismatches |
| `inv_validation.json` | What validation was actually performed |

### Phase 2 — Requirement gap analysis
| File | Requirement |
|---|---|
| `gap_R1.json` | Independent shelter-use observations |
| `gap_R2.json` | Locally estimated behavioral coefficients |
| `gap_R3.json` | Identified awareness effect |
| `gap_R4.json` | Out-of-sample spatial validation |
| `gap_R5.json` | Feasible candidate facilities |
| `gap_R6.json` | Spatially resolved smoke exposure |
| `gap_R7.json` | Global uncertainty and sensitivity analysis |
| `gap_R8.json` | Broader significance |

Each uses the same schema: `requirement`, `exists_defensible`, `missing`,
`implementable_with_existing_data`, `needs_new_empirical_data`, `needs_external_acquisition`,
`claims_exceeding_evidence`, `proposed_methods`, `priority_rationale`.

### Phase 3 — Method designs
| File | Contents |
|---|---|
| `method_validation_protocol.json` | VP-1: freeze semantics F1-F7, calibration budget, temporal + spatial arms, frozen outcome metrics, acceptance criteria |
| `method_statistics.json` | Behavioral estimation: departure hazard, latent awareness chain, destination choice, identifiability and power |
| `method_spatial.json` | Temporal split, DBSCAN dedup, KDE, blocked cross-validation, baselines, scoring |
| `method_gsa.json` | Morris screening, Sobol indices, awareness x capacity regime grid, run counts and engineering hazards |
| `method_external_data.json` | External sources with per-source verification levels (FETCHED vs SEARCH-ONLY) |

## Reading the evidence labels

Every factual claim in the report carries one of:

- **VERIFIED** — read directly from the repository during the audit
- **REPORTED** — asserted by repository documents, not re-executed
- **ABSENT** — confirmed missing
- **FETCHED / SEARCH-ONLY** — external source actually opened, vs. known only from search results

Run counts, byte-identity passes, and archived statistics are **REPORTED**: the verification
scripts write into the tree and require local run artifacts, and the audit was strictly read-only.
No observations, coefficients, or records were invented; absences are reported as absences.

## Provenance

These files were reconstructed on 2026-08-29 from session-transcript tool I/O after the working
scratchpad was cleared by temp cleanup. All 17 JSONs match their pre-wipe sizes byte-for-byte and
parse as valid JSON; the HTML was rebuilt by replaying its Write + 12 Edits + tag patch, with all
14 critic fixes re-verified present. Details in [STATUS.md](STATUS.md#provenance-of-these-files).
