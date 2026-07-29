# PROVENANCE — scenario-d-2026 (triage-reserve sweep)

Written 2026-07-28 during Round-5 Phase A (task A2a), at repo HEAD `3cd3760`.
This file annotates the archived manifests; the manifests themselves are
records and have **not** been modified (falsifying an archived record is
worse than annotating a known-wrong field alongside it).

## What is archived here

8 run directories: `D-seed42-{r00,r10,r15,r25}`, `D-seed43-{r10,r15}`,
`D-seed44-{r10,r15}` — the Scenario-D `triageReserveFraction` sweep
(scenarioCode 7), `generated_utc` 15:42:26–15:48:57 on 2026-07-28.

## Two known-wrong provenance fields, both explained

### 1. `git_commit = 696472a` — the stamped commit does NOT contain the D code

All 8 manifests stamp `696472a06c60f73ae17ee871ce16dabc6d31f1b5`. That commit
**lacks the Scenario-D implementation entirely**: `triageReserveFraction` and
`scenarioCode 7` exist only from `ec9b208` onward. Verified mechanically:

- `git grep triageReserveFraction 696472a -- Geography/src` → 0 hits
- `git grep triageReserveFraction ec9b208 -- Geography/src` →
  `ContextCreator.java` (11), `Shelter.java` (1)

As with the CR/CP families, the runs executed from a working tree whose HEAD
was still `696472a` while the D code was present but not yet committed; it was
committed minutes later at `ec9b208` (16:05:49 -0400). **To reproduce, check
out `ec9b208`, not the stamped commit.**

### 2. `git_working_tree_dirty = false` — a FALSE NEGATIVE

Unlike the 18 CR/CP manifests (which truthfully say `dirty = true`), all 8 D
manifests say `false`. This is wrong: the tree that produced them was dirty
with the uncommitted D code. The dirtiness detector used an **mtime
heuristic**, and the D runs were launched from an **isolated copied
directory** — the fresh copy's file timestamps defeated the heuristic, so it
reported clean. The mtime heuristic is replaced in this same Phase-A commit;
the false stamp is left in place in the archived manifests and corrected here.

## Missing agents.csv

Four directories lack `agents.csv`: `D-seed43-r10`, `D-seed43-r15`,
`D-seed44-r10`, `D-seed44-r15` (seed-42 runs have it). Regeneration of the
seed-43/44 per-agent outputs is scheduled as a separate Phase-B item; the
`simulation.json` aggregates for those runs are complete and unaffected.

## Regeneration completed (2026-07-28, Round-5)

All four missing `agents.csv` files were regenerated on the **same (pre-U-27)
street graph** and are archived alongside the record manifests:

| Run | Regenerated at | Tree | Outcome check vs archived manifest |
|---|---|---|---|
| D-seed43-r10 | `8ee9c9d`, clean | clean | sheltered 6,259 / refused 558 / unreachable 25 / total exposure 33,049,550.1925 — **exact match** |
| D-seed43-r15 | `8ee9c9d`, clean | clean | sheltered 6,087 / refused 730 / unreachable 25 / total exposure 42,265,024.7483 — **exact match** |
| D-seed44-r10 | `db44dc0` | docs-only dirty* | sheltered 6,260 / refused 558 / unreachable 24 / total exposure 32,999,444.5558 — **exact match** |
| D-seed44-r15 | `db44dc0` | docs-only dirty* | sheltered 6,113 / refused 705 / unreachable 24 / total exposure 40,875,201.3817 — **exact match** |

\* The regen manifests for seed 44 carry `git_working_tree_dirty = true`
because the tree contained the in-flight archive copies of the *earlier*
regen outputs (porcelain diff was `docs/runs/scenario-d-2026/*` only — zero
source, data, or parameter files). The now-real porcelain-based flag is
working as intended; the dirtiness is this archiving process itself.

Each archived `agents.csv` was verified before copying: 6,842 rows and a
final-state census identical to the record manifest's `population` block.
The record manifests (stamped `696472a`, see above) remain the citation;
the regen proves the aggregates reproduce bit-for-bit from `ec9b208`-lineage
code and supplies the per-agent rows. Regen manifests retained in
`Geography/output/D2026regen-*` (gitignored, local only).
