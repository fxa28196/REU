# HANDOFF — how to pick this project up and keep going

One page for the next person (or the same person, months later). Everything
here is a pointer to something that already exists and runs; nothing needs
to be reconstructed from memory.

## What this is

A Repast Simphony (Java 17) agent-based model of clean-air shelter access
for unsheltered residents of Multnomah County during the September 2020
wildfire-smoke event, plus a Python analysis pipeline. The model's output
is an *assignment* (who reaches shelter, when, at what exposure cost), not
a long-run trajectory.

## Run it

- Environment: `docs/setup/ENVIRONMENT_SETUP.md` (JDK 17, Repast 2.11,
  Gradle wrapper in `Geography/`).
- One run, no Eclipse:
  `powershell -File scripts\run-headless.ps1 -ParamsFile "batch\batch_params_2026_A_seed42.xml"`
  Output lands in `Geography\output\run_seed42\` (rename it immediately —
  the directory is keyed by seed only, and the next run at that seed
  overwrites it).
- Every run writes `agents.csv` (one row per resident: inputs joined to
  outcomes), `shelters.csv`, and `simulation.json` (the manifest: seed,
  commit, parameter values, input checksums, governance census). If the
  manifest's `git_working_tree_dirty` is not `false`, the run is not
  citable — commit first, then run.

## The experiment

Arms are scenario codes in `ContextCreator` (A=0 reality, B=1 capacity,
C=2 dispersion, 3=historical reference, 4–6 random-site controls, 7=D
triage reserve, 8–10 pool controls, 11–14 bed-equivalence sweep). Seeds
42–50. Archived evidence: `docs/runs/<family>/` — each family has a
`PROVENANCE.md`. Cross-run invariants: `python scripts/verify_2026_runs.py`
must exit 0.

## The analysis pipeline (run in this order after new runs)

1. `scripts/verify_2026_runs.py` — invariants; refuses bad runs.
2. `scripts/make_2026_results.py` — plain-English CSVs + figures
   (`docs/final/results-2026/`).
3. `scripts/make_phaseD_results.py` — window + bed-sweep tables.
4. `scripts/fit_outcome_models.py` — the regression component
   (`ML_MODEL_SUMMARY.md`; logistic for access, OLS for time-to-shelter;
   asthma must stay null — it is the negative control).
5. `scripts/make_ml_training_data.py` — the model-ready per-agent table.
6. `scripts/make_chapter_figures.py` — the five chapter PDFs.
7. `python scripts/lint_claims.py` — must exit 0 before any deliverable
   ships (`docs/claims.yaml` is the claim registry).

## Where the truth lives

- Scientific parameters and their sources: `Geography/data/registry/
  variables.csv` + `assumptions.csv` (fail-fast loaded at every run start;
  no parameter enters code without a row here FIRST).
- Claim status: `docs/claims.yaml` (live / corrected / refuted / retired).
- Current state + open work: `docs/critique-response/11-ROUND5-REPORT.md`.
- Exhaustive model documentation: `docs/final/TECHNICAL_REFERENCE.md`.

## Known debt (deliberate, not forgotten)

- The Java model classes (`ContextCreator`, `GisAgent`, `Shelter`,
  `StreetNetwork`, `OutcomeLogger`, `PopulationSampler`) work and are
  verified, but a consolidation refactor is planned AFTER the symposium —
  behaviour-preserving, gated on the byte-identity regression fixtures
  (`docs/runs/final-baseline/`, `capacity-binding-n400-seed42/`). Do not
  refactor and change science in the same commit.
- The human decision layer (awareness, information limits, barriers) is
  SPEC ONLY: `docs/critique-response/E-LAYER-SPEC.md`. Nothing of it is in
  code; the current model is the full-information upper bound and says so.
- Deferred sensitivities are registered where they belong: TYPE 1200/A11
  street classes (registry V26), episode-aligned window arm
  (12-PHASE-D-PREDICTIONS.md), U-12 population recalibration
  (claims.yaml calibration entry).
