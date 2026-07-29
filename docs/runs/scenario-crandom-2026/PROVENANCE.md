# PROVENANCE — scenario-crandom-2026 (CR bbox + CP pool control families)

Written 2026-07-28 during Round-5 Phase A (task A2a), at repo HEAD `3cd3760`.
This file annotates the archived manifests; the manifests themselves are
records and have not been modified.

## What is archived here

18 run directories, each containing `simulation.json` and `shelters.csv`
copied verbatim from `Geography/output/<same-dirname>/`:

- `CR2026r{1,2,3}-n6842-seed{42,43,44}` — C-random **bbox** family
  (scenarioCode 4/5/6)
- `CP2026r{4,5,6}-n6842-seed{42,43,44}` — C-random **pool** family
  (scenarioCode 8/9/10)

`agents.csv` (per-agent trajectories, ~tens of MB per run) is deliberately
**not** archived here; it remains in the gitignored `Geography/output/`
directories. Site-selection manifests `scenario_crandom_report.json` and
`scenario_crandom_pool_report.json` were already tracked in this directory.

## Commit stamp: `696472a`, and why that is correct

Every one of the 18 manifests stamps
`git_commit = 696472a06c60f73ae17ee871ce16dabc6d31f1b5` with
`git_working_tree_dirty = true`.

`696472a` is the **parent** of `ec9b208` ("research: answer the external
critique — two new arms, two exact computations"). The CR/CP scenario code and
batch files were committed **at** `ec9b208` (2026-07-28 16:05:49 -0400). The
runs executed **before** that commit was made — `generated_utc` spans
15:33:51–15:53:20 on 2026-07-28, i.e. HEAD was still `696472a` while the
working tree already contained the code that became `ec9b208`. The stamp
therefore predates the commit of the code that ran, and the
`git_working_tree_dirty = true` flag is **truthful**: the tree really was
dirty with exactly that uncommitted code. To reproduce, check out `ec9b208`
(not `696472a`) and follow docs/critique-response/07-c-random.md §Reproducing.

## Verified headline counts

Read directly from the `population.sheltered` field of the 18 copied
`simulation.json` manifests (verified 2026-07-28 during this archival):

| family | seed 42 | seed 43 | seed 44 |
|---|---|---|---|
| CR (bbox), identical across r1/r2/r3 | **3,078** | **3,073** | **3,074** |
| CP (pool), identical across r4/r5/r6 | **6,570** | **6,565** | **6,566** |

Turned-away (`refused_all_full`) is likewise identical within each family:
CR 3,748 / 3,744 / 3,744 and CP 256 / 252 / 252 for seeds 42/43/44.

These match the numbers published in `docs/critique-response/07-c-random.md`
(sheltered mean 3,075 [3,073–3,078] bbox; 6,567 [6,565–6,570] pool; the
pool family reproduces arm C's access counts exactly, run for run).
