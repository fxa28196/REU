# DR-Q4 — Encampment disclosure controls: k-anonymity on the display layer, and the salt custody question

Status: **implemented (k-anonymity, fresh salt, deploy gate)** / **one OPEN USER
DECISION (salt custody)**. Scope: plan §4 Q4, risk register W2 (critical,
ship-blocker). Applies to `pipeline/scripts/build-encampments.ts` and
`pipeline/scripts/deploy-check.ts`.

## 1. What was wrong

Q4's public default — snap every campsite report to its nearest street node,
drop dates and vehicle flags, replace `inc_id` with a salted hash, publish only
a density grid — was implemented, and it did remove the raw coordinates. It did
not, on its own, remove the *locations*.

Two defects, both found by adversarial review of the built bytes rather than of
the code:

1. **The display grid published small counts on a fine grid.** On the real
   3,400-row feed the layer shipped **1,863 cells, of which 1,773 carried fewer
   than 5 reports and 1,100 carried exactly one**. A 150 m cell with a count of
   1 is a campsite location to within a city block. Node-snapping had removed
   the coordinate and the grid handed the location back. The builder even
   measured this — it printed a `display cells with count < 5` census — and then
   published anyway, which is worse than not measuring, because the number was
   on the record and read as a statistic rather than as a finding.

2. **The `inc_id` salt was effectively permanent.** The builder wrote a random
   salt to `pipeline/local-raw/encampment-salt.txt` on first run and then
   *loaded it back* on every subsequent run. One file on one laptop therefore
   reversed the pseudonyms in every asset that machine had ever produced or
   would ever produce, and a salt that outlives its build is a salt nobody
   remembers to destroy.

## 2. What changed

### 2.1 k-anonymity floor on every published cell

`DISPLAY_MIN_CELL_COUNT = 5`. No published cell carries fewer than 5 reports.

- k = 5 is the small-count suppression threshold in ordinary
  statistical-disclosure practice, and it is the threshold this project's own
  census was already being measured against.
- It is a **floor chosen to be defensible, not optimal**. Raising it is a
  one-line change and is strictly safer. Lowering it re-opens W2 and needs the
  same sign-off the exact-coordinate asset needs.
- The constant is **deliberately duplicated** in `deploy-check.ts` as
  `PUBLISHED_MIN_CELL_COUNT`, so lowering the builder's k cannot silently relax
  the publication gate. `encampments.test.ts` asserts the two are equal.

A cell that misses k is **merged upward before it is suppressed**: it folds into
its parent cell (`floor(i/2)`, `floor(j/2)` — a quadtree on the same absolute
origin, so a parent index is as data-independent as a base index), which doubles
the cell size in each direction, and is re-tested. `DISPLAY_MAX_MERGE_LEVEL = 5`
caps this at 4.8 km cells; anything still below k there is dropped and counted.
Every published cell now carries the `level` its index is relative to.

Two properties make this safe rather than merely smaller, and both are tested:

- every published count is ≥ k;
- a published parent cell can never be read back down to one child. Its count is
  the sum of the children that *failed* k, each ≤ k−1, so a parent reaching k
  needs at least two non-empty children.

A reader can still infer "no child of this merged cell reached k". That is a
statement about counts, not about places, and it is strictly less than the
pre-fix layer disclosed.

### 2.2 Census, before and after (real 3,400-report feed)

| | cells | smallest cell count | cells below k | reports |
|---|---|---|---|---|
| **Before** (as shipped) | 1,863 | 1 | **1,773** (2,844 reports) | 3,400 published |
| **After** (k = 5) | **506** | **5** | **0** | 3,371 published, **29 suppressed** in 10 cells |

Published cells by merge level: L0 90, L1 164, L2 124, L3 99, L4 18, L5 11.
Base-grid cell counts before the pass were 1×1,100, 2×379, 3×190, 4×104, and 90
cells at 5 or more.

99.1 % of the reports still reach the map. The 29 that do not are reports whose
surroundings were so sparse that no cell up to 4.8 km across reached 5 — which
is exactly the population a density map cannot show without pointing at someone.
The unfiltered base grid is still computed, but only to census what was removed,
and its numbers live in the git-ignored local report next to the snap gaps.

### 2.3 The salt is fresh per build and is never published

- A new 32-byte salt is generated on **every** build. A previous salt is never
  read back off disk. A salt disclosure now compromises one asset, not every
  asset the machine ever built.
- The accepted cost: `camp_row_hash` is a different pseudonym in every build, so
  `encampments-public.bin` is **no longer byte-reproducible across builds** and
  its manifest digest changes on every rebuild. Nothing downstream joins on the
  pseudonym — it exists so a row can be discussed without naming it — and buying
  byte-stability with a permanent salt is the trade Q4 forbids.
- The builder refuses to write an asset containing salt material (hex, raw bytes
  or base64), and `deploy-check.ts` re-proves the same property from the written
  bytes with an independently written detector.

### 2.4 The publication gate blocks both new shapes

`deploy-check.ts` gained two blocking detectors on top of the four raw-data ones:

- **`display-cell-below-k`** — any published density cell under k. Detection is
  structural: any object with a numeric `count` that either sits under a `cells`
  key or carries a numeric index pair (`i`/`j`, `x`/`y`), at any depth, indexed
  or keyed. Renaming the file, nesting the layer inside another document or
  renaming the array does not escape it. It is a floor on the gate's reach, not
  a completeness proof — a layer that renamed both the array *and* its index
  fields would slip past. A file named `encampments-display*.json` that does not
  parse, or that carries no countable cells, is itself a blocking finding: an
  unreadable layer is an unchecked layer.
- **`salt-material`** — the build's salt in any public asset, as hex text (whole
  or any 16-hex window of it), as raw bytes (any 8-byte window), or as base64.

Both are proved by seeded positive fixtures — an asset directory deliberately
poisoned with a count-1 cell and with the salt — including through the CLI, so
the exit codes a human or a CI job would act on are what is under test.

**The salt must be supplied.** Absence of the salt cannot be proved without the
salt, exactly as absence of raw coordinates cannot be proved without the raw
feed, so with no salt reference (`--salt`, `$ENCAMPMENT_SALT`, or the withheld
salt file) the gate exits 2 rather than passing quietly. There is no flag to
skip it. In practice this fixes an ordering: **run the gate, then decide the
salt's custody.**

## 3. OPEN USER DECISION — salt custody: withheld or destroyed?

**This is not decided here, and the build does not decide it.** Both options are
implemented; the default (withhold) is the status quo and is announced loudly on
every build rather than being silent.

| | **Withheld** (default: fresh salt left at the git-ignored `pipeline/local-raw/`) | **Destroyed** (`build-encampments.ts --destroy-salt`) |
|---|---|---|
| Reversibility of the published pseudonyms | Re-derivable by anyone holding this machine | Irreversible, for everyone, including the authors |
| Provenance questions ("which report is hash `a1b2c3…`?") | Answerable | Unanswerable, permanently |
| Failure mode | The file is copied, backed up to a sync folder, or forgotten on a shared machine | A later data-quality or ethics question about a specific row cannot be investigated |
| Effect on the deploy gate | Gate can prove the salt is absent from the assets | Gate cannot run against that build; a rebuild is required |

Facts that bear on the choice, so it can be made on evidence:

- The path is git-ignored, and this laptop syncs `Desktop` to OneDrive. "Not in
  git" is not the same as "not replicated".
- Nothing in the model or the analysis joins on the pseudonym. Destroying the
  salt costs no result.
- The raw feed itself is public data; the salt does not protect the reports'
  existence, only the link between a published row and a specific report id.
- Because the salt is now fresh per build, destroying it destroys one build's
  mapping. There is no accumulated history to weigh.

Whoever owns the publication decision (plan §10: mentor/IRB sign-off surface)
should record the answer here. Until then, treat the withheld salt as
**custodied data**, not as a build artifact.

## 4. What is still not claimed

- k-anonymity on the display grid is a disclosure control on *this layer*. It is
  not differential privacy: it makes no claim about what an adversary who
  already holds an auxiliary dataset can infer, and the counts are exact rather
  than noised.
- The 29 suppressed reports and the 10 cells they sit in are published as
  aggregates. That the aggregate exists is itself information ("the region has
  some very sparse pockets"), and it is published deliberately, because a layer
  that silently drops 29 reports is a layer whose totals lie.
- The gate proves properties of the bytes in `pipeline/out/assets`. It cannot
  prove anything about a file that is published from somewhere else.
