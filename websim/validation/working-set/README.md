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

## Degradation policy

Every tool here fails loudly when the archive or the local copy is absent or
mismatched. Nothing skips silently: a SHA mismatch invalidates the golden
summaries derived from those exact bytes, so it is a hard error, not a warning.
