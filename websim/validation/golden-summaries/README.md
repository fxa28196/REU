# Golden summaries

Committed JSON digests of the read-only Java golden archive (`docs/runs/`), so
that Tier-3 statistical cross-validation has an oracle in environments that will
never hold the 375 MB tree (plan §4, §5.1, WP9).

Regenerate or verify against a local archive:

```sh
npx tsx pipeline/scripts/build-golden-summaries.ts          # write
npx tsx pipeline/scripts/build-golden-summaries.ts --check  # CI form, exit 1 on drift
```

| File | Captures |
|---|---|
| `sources.json` | Provenance table: run directory → the archive files every number was read from, with byte length and SHA-256. Every other file's `values` keys resolve here. |
| `sheltered-envelopes.json` | Per configuration, the seed-to-seed min/max of sheltered / refused / unreachable plus the full per-seed detail — including the nine-seed three-arm envelope. |
| `demographic-marginals.json` | Realised marginals per run, derived from `agents.csv` **and** the manifest's own 4-decimal report, side by side. |
| `exposure-identities.json` | The never-sheltered exposure identity, the `vwe ≡ dose` raw-text row identity, and the resting-dose ratio. |
| `capacity-sums.json` | Capacity sums and site counts per configuration (U-03 bed-sum inputs). |
| `cross-arm-hashes.json` | Per seed, the POP_COLS population hash and the UNREACHABLE id-set hash for arms A/B/C, plus the cross-arm equality verdicts. |
| `index.json` | File census with the SHA-256 of each file's own bytes, and the archive census the digests were built from. |

## Rules these files obey

1. **Every number is derived from archive bytes, and says which.** No value is
   copied from the plan, from `PORT_MAP.md`, or from an earlier report. Where the
   archive disagrees with a documented figure, the archive wins and the
   disagreement is recorded as a finding rather than reconciled.
2. **Hashes are defined on raw text.** `scripts/verify_2026_runs.py` hashes a
   pandas re-serialisation of `agents.csv`, which makes its digest depend on
   pandas' float repr. These hashes are taken over the archive's own bytes
   instead, matching the raw-text identity discipline in PORT_MAP §6.2. The
   invariant under test is the same; the digest values are not, and
   `cross-arm-hashes.json` says so in its `method` field.
3. **Derived vs measured is never blurred.** `demographic-marginals.json` keeps
   `derived_from_agents_csv` and `manifest_population_sampling` as separate
   blocks so the rounding gap between the two is visible instead of averaged
   away.

## Scope

87 archived runs are digested: the three-arm family at all nine seeds, plus
every run of the shipped preset families (E0 / ER / SE / SEnc / SE2 / SE2nc).
The Phase-D sweeps, arm D, C-random and the legacy baselines are excluded —
they back no shipped preset, and including them would inflate the files with
envelopes nothing checks. `pipeline/out/archive-bundles/` still covers all 154
run directories.
