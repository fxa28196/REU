# Curated validation working set

**Status: manifest only. No payload is committed and no git-lfs is configured.**

The read-only Java golden archive (`docs/runs/`, ~374 MB across 475 files, 154
`simulation.json` manifests) is the validation oracle. Hosted CI cannot carry it,
so Tiers 1–3 run against a curated ~40 MB subset chosen to exercise every gate
class at least once (plan §5.3, risk W18).

This directory holds:

| File | What it is |
|---|---|
| `working-set.manifest.json` | The run list, per-file SHA-256 + byte length, the gate-class coverage matrix, and the resolved total size. Generated from the archive; committed. |
| `data/` | Where a local copy lands. **Git-ignored** — never committed. |

## Why a manifest instead of the data

Committing ~40 MB of CSVs (via git-lfs or otherwise) has a repo-size and quota
implication that is explicitly the user's call, not an engineering one
(plan §10 item 3). So the deliverable is the *definition* plus a fetch/verify
tool. If and when the user approves committing the payload, the manifest is
already the integrity contract for it.

## Commands

```sh
# regenerate the manifest from a local archive (docs/runs/, or WEBSIM_ARCHIVE_ROOT)
npx tsx pipeline/scripts/build-working-set-manifest.ts
npx tsx pipeline/scripts/build-working-set-manifest.ts --check   # CI form

# materialise a local copy into validation/working-set/data/
npx tsx pipeline/scripts/verify-working-set.ts --fetch

# verify an existing local copy byte-for-byte against the manifest
npx tsx pipeline/scripts/verify-working-set.ts
```

"Fetch" copies from a local archive rather than downloading: there is no remote
to fetch from, because publishing the archive is a separate, user-owned
decision. A CI runner consumes the working set by pointing
`WEBSIM_ARCHIVE_ROOT` at the copy — every archive-reading tool in `pipeline/`
and `validation/` honours it.

## Membership, and one deliberate omission

The 14 runs and the reason each is in the set are recorded in
`pipeline/src/archive/working-set.ts` (`WORKING_SET`) and copied verbatim into
the manifest, so a reviewer never has to reverse-engineer the rationale from a
list of paths.

The one thing the working set deliberately does **not** carry is the nine-seed
statistical envelope. All 27 three-arm runs would cost roughly 73 MB on their
own — nearly double the whole budget — so the envelope ships as a committed
digest in `validation/golden-summaries/sheltered-envelopes.json` instead. That
is precisely what golden summaries are for. The working set still carries two
seeds per arm, so the cross-seed invariants (`data_version_tag` constancy,
pooled negative controls, seed-varying UNREACHABLE id sets) have real data
rather than a single point.

## What replays this set (WP9)

`validation/src/harness/working-set-replay.ts` derives its replay matrix from
`WORKING_SET` rather than re-listing it, so the two cannot drift, and
`validation/test/wp9-replay-acceptance.test.ts` asserts that every entry here
has a target. The replay set is **17 runs**: these 14, plus the three-arm
seed-44 column, which plan §8's WP9 acceptance line names (*"A/B/C seeds
42–44"*) but which §5.3's 40 MB budget stops short of. Those three are marked
`in_working_set: false` in `VALIDATION_REPORT.json` and are replayed only where
the full archive is available — the nightly job
(`.github/workflows/websim-nightly.yml`).

Each run is driven from its **archived executed manifest**, never from a shipped
preset. The three-arm manifests were written by a logger that recorded 11 of the
41 parameters, so 30 are filled from `ContextCreator`'s own documented fallbacks
(`validation/src/harness/java-defaults.ts`) and the count is published per
configuration in the report.

```sh
# replay the set, score Tiers 3 and 4, emit the report
npx tsx validation/scripts/wp9-validation-report.ts
```

## Degradation policy

Every tool here fails loudly when the archive or the local copy is absent or
mismatched. Nothing skips silently: a SHA mismatch invalidates the golden
summaries derived from those exact bytes, so it is a hard error, not a warning.

The replay CLI exits **2** — never 0 — when the archive root is missing, when it
is present but does not carry every run in the set, or when the packed graph or
`Geography/` is absent, and the banner names each missing run rather than
counting them. The empty-directory case is the one that matters: the root
exists, so a probe that only checked the root would sail past and publish a
report over zero configurations. `validation/test/wp9-degradation.test.ts`
proves all of this by spawning the real CLI with `WEBSIM_ARCHIVE_ROOT` pointed
at a scratch directory; `docs/runs/` is never touched.
