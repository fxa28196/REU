# Order-permutation census

`order-permutation-census.json` is the committed evidence behind divergence 1's
numeric bound (README §6, [`DR-WP7`](../../docs/DR-WP7-order-attribution.md)).

**What it is.** 200 independent within-tick permutation streams run through the
identical arm-A configuration (`A_present_day`, seed 42, n=6,842, 312 h), each
compared on raw text against `docs/runs/present-day-three-arm/A-seed42`, plus two
reference runs — the certified-faithful stream and an identity-order control. The
per-stream table is kept in full, not just the summary, so a reader who doubts the
envelope can recompute every statistic from it and a future disagreement can be
diffed stream by stream instead of argued about.

**Why it is trustworthy.** The census re-seeds the colt default stream *between*
its only two draw sites — the build-time camp draw (all of which precede tick 1)
and the per-tick shuffle. It does not take that on trust: every run's 14
archive-comparable build-time columns are hashed, and the census asserts a single
digest across all 202 runs. One digest means the census varied the permutation and
nothing else.

**Regenerating it.** Needs `pipeline/out/assets/` and the archive (or
`WEBSIM_ARCHIVE_ROOT`). About 9 s per run; shard it.

```
# one shard per core, then merge
npx tsx validation/scripts/order-permutation-census.ts \
    --streams 200 --shards 8 --shard 0 --write <scratch>/shard-0.json
# ... shards 1..7 ...
npx tsx validation/scripts/order-permutation-census.ts \
    --merge <scratch>/shard-0.json ... --merge <scratch>/shard-7.json \
    --write validation/order-census/order-permutation-census.json
```

Shard scratch belongs under `pipeline/out/test-tmp/` and must be removed
afterwards — `npm run check:scratch` enforces that.

**When to regenerate.** Only when a legitimate engine change moves the observed
divergence. `validation/test/tier4-attribution.test.ts` pins `observed` exactly, so
such a change fails loudly; the correct response is to re-run the census and
re-derive the attribution, never to widen a tolerance.
