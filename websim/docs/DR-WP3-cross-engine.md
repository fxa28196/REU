# DR-WP3 — cross-engine determinism matrix + Tier-0 volume

**Closes:** the two WP3 acceptance gaps an adversarial review found open — (a) no
cross-browser identity test of any kind despite plan §3.3/§5.1/§5.3 making Chrome / Firefox
/ WebKit / Node byte-identity a CI gate, and (b) Tier-0 RNG fixture volume at 2,630,000
draws against a stated criterion of 10^7 × 5 seeds.
**Risk touched:** W4 (JS transcendental nondeterminism across browsers), W15 (closed
earlier by DR-S5), W8 (hidden order-dependence).
**Status: (a) STOOD UP — not deferred. (b) MET IN FULL, not amended.**
**Date:** 2026-07-31.

---

## 1. Verdict

| | |
|---|---|
| Browser matrix | **Built and green.** Chromium 141 (V8), Firefox 142 (SpiderMonkey), WebKit 26 (JavaScriptCore) + Node 24 (V8), 13 assertions each |
| Engine-owned planes cross-engine | **Byte-identical on all four engines** — RNG (both generators), fdlibm `mathx`, the HALF_UP formatter, a 512-resident world build, a 400-node SSSP scenario |
| Host `Math` transcendentals | **Four engines, four different digests.** Measured, §4 |
| `geographiclib-geodesic` | **Four engines, four different digests.** Bounded at **3.2 nm**, §5 — an open gap, not a pass. *(Closed after this DR was written: WP7 task C1 vendored it onto `mathx`; 0 / 3,600 doubles differ. See DR-C1.)* |
| Tier-0 volume | **100,000,000 draws**, 10^7 × 5 seeds × 2 generators, all bit-exact vs real Java, first attempt |
| Added by this DR | **26 Node tests** (9 corpus-digest + 4 transcendental-lint + 13 volume) and **39 browser tests** (13 × 3 engines) |
| Full `websim` CI | `npm run ci` **exit 0** — 60 files / **998 passed, 0 failed**; typecheck clean; claim linter clean. `npm run test:browser` exit 0 — 39/39. Clean-clone re-verified by renaming `pipeline/out` away: **955 passed, 43 skipped, 0 failed**, and all 26 of this DR's Node tests ran (none of them is artifact-gated) |

The headline is genuinely two-sided. Everything the port writes itself is bit-identical
across V8, SpiderMonkey and JavaScriptCore — which is what `mathx` was built to buy, and
until now was an argument rather than a measurement. Everything the port *delegates* is not.

---

## 2. What was built

| Path | Role |
|---|---|
| `engine/test/determinism/corpus.ts` | The single definition of what gets compared across engines: 8 sections, 34,678 canonical tokens |
| `engine/test/determinism/digests.ts` | Committed digests + the geodesic divergence budget |
| `engine/test/determinism/emit-digests.ts` | Regeneration entry point (`--write` also refreshes the geodesic reference fixture) |
| `engine/test/determinism/corpus.digest.test.ts` | Node reference — runs in `npm test`, i.e. on every push, from a clean clone |
| `engine/test-browser/cross-engine.digest.test.ts` | The same corpus, the same constants, inside real browsers |
| `engine/vitest.browser.config.ts` | Playwright provider, three instances; deliberately not in the root projects list |
| `engine/test/mathx/no-host-transcendentals.test.ts` | Allow-list lint: engine source may only touch exactly-specified `Math` members |
| `engine/test/fixtures/determinism/geodesic-node-reference.json` | Node reference values the browser tolerance gate compares against |
| `pipeline/java-exporter/src/websim/exporter/RngVolumeDumper.java` | 10^7-draw ground-truth dumper |
| `pipeline/java-exporter/dump-rng-volume.ps1` | Reproducible compile + run |
| `engine/test/fixtures/rng/rng-volume.json` | 21 KB: digests, 10^6-draw checkpoints, verbatim heads |
| `engine/test/rng/volume.parity.test.ts` | Regenerates all 10^8 draws and compares |
| `.github/workflows/websim-ci.yml` | New `cross-engine` job |

Run it:

```
npx playwright install chromium firefox webkit   # once, ~400 MB
npm run test:browser
```

### Why the browser job is a separate config and a separate CI job

`npm test` has to stay runnable on a fresh `git clone && npm ci`. Browser binaries are not
in the lockfile's reach, so folding the matrix into the root `projects` array would convert
a clean checkout into a confusing failure. The split states the dependency instead of
hiding it: `build` is the clean-clone job, `cross-engine` installs browsers first. Both
block.

---

## 3. Design: one corpus, one set of constants, four engines

The corpus is imported by both suites, and **both assert the same committed digests**. This
matters more than it looks. The obvious design — run the engine in three browsers and check
the three agree — passes happily when all three are wrong together, which is precisely the
scenario a shared upstream dependency creates. Pinning every engine to one constant makes
"Chromium matches Node" a transitive consequence rather than an independent claim.

Eight sections, digested separately as well as jointly, because a single whole-corpus hash
says only "something moved":

| Section | Tokens | Gated across engines? |
|---|---:|---|
| `rng.java-random` | 13,895 | yes — byte |
| `rng.colt-mt19937` | 7,685 | yes — byte |
| `mathx.fdlibm` | 3,278 | yes — byte |
| `mathx.format` | 120 | yes — byte |
| `scenario.world` | 3,087 | yes — byte |
| `scenario.routing` | 3,204 | yes — byte |
| `geo.geodesic` | 1,200 | **no — magnitude-bounded**, §5 |
| `host-math.sentinel` | 2,209 | **no — recorded**, §4 |

Every token is raw IEEE-754 hex. A decimal rendering would silently absorb the last-ulp
differences this corpus exists to catch.

`scenario.world` is not a toy: 512 residents through the real build-time draw order — the
one default-stream camp draw per resident, `PopulationSampler.sample()`, the second-pass
`ELayerSampler.sample()`, per-agent decision streams, eight consecutive `shuffle-mt`
permutations, and the full stream-registry state afterwards (which catches a divergence
that has not yet reached an output value). `scenario.routing` builds a 400-node graph with
RNG-derived weights plus 120 deliberately tied edges and runs four real SSSP passes,
comparing distances, predecessor edges and heap statistics — so the strict-`<` tie policy
and the inlined `java.util.PriorityQueue` sift are inside the gate, not beside it.

The certified 109,434-edge asset is *not* in the corpus: it lives under git-ignored
`pipeline/out/`, and a browser gate that needs a local build is a browser gate that will be
skipped. The synthetic graph exercises the same code path.

### Non-vacuity

Both suites carry a mutation check on their own assertion: perturb one `mathx.fdlibm` token
by a single ulp and confirm the digest moves. The Node suite additionally proves the
geodesic comparator reports a one-ulp `lat2` shift as a position delta and not as a length
or azimuth one, and that the committed geodesic fixture is token-for-token equal to the
live corpus (a stale fixture would quietly turn the cross-engine tolerance gate into a
comparison with history).

---

## 4. Finding: host `Math` differs on all four engines — including V8 vs V8

`host-math.sentinel` runs `Math.log/exp/sin/cos/atan/atan2/pow` over the same adversarial
grid as the fdlibm section — 31 magnitudes for the positive-only routines, 64 signed points
for the rest, plus the full 31 × 31 `atan2`/`pow` cross product. Digests:

| Engine | `host-math.sentinel` |
|---|---|
| Node 24.18.0 (V8) | `7a8be11be3b775040c87734ee9b349be242a098f050b4bb8ff35e33ce7870c97` |
| Chromium 141.0.7390.37 (V8) | `fd05dabb3c68975b183288baa3f807e521c0fa2b5307d8825e848ada8f8833f9` |
| Firefox 142.0 (SpiderMonkey) | `a6b376e3192787ab9bb7cfbb2543a3b3c37c205f870587e8b6781fb5e17cc00d` |
| WebKit 26.0 (JavaScriptCore) | `bab7aafc99fbdc1aaff73c18b2fe59b02ed69a246bc3d9e7458cae5b398d7305` |

Four engines, four digests — and the two most interesting rows are the first two. **Node 24
and Chromium 141 are both V8 and still disagree.** DR-S5 §4.2 measured `Math.log` ≡
`fdlibmLog` over 10^6 samples on Node and said, correctly, that the result was
"V8-specific… it says nothing about SpiderMonkey or JavaScriptCore". The measurement here
is worse than that caveat feared: it is not even stable *within* V8 across versions. Any
port that shipped host transcendentals on the strength of "V8's `base::ieee754::log` is
itself an fdlibm port" would have been broken by a Chrome update, silently, in a way no
output diff would attribute to the formatter.

Meanwhile `mathx.fdlibm` — the same functions, same grid, through the ported kernels — is
**byte-identical on all four**. That is the whole case for the module, and it is now a
measurement rather than an argument. It also retires DR-S5 §8.1 limitation 1.

`Math.sqrt` is in the same corpus (both inside `mathx.fdlibm` via `fdlibmSqrt` and at the
`nextGaussian` call site) and is byte-identical everywhere, which is the empirical backing
for the one entry on the transcendental lint's allow-list that is not exactly specified by
ECMA-262. IEEE-754 §5.4.1 requires correctly-rounded `sqrt`; this measures that all four
engines honour it.

### The lint

`no-host-transcendentals.test.ts` is an **allow-list**, not a deny-list: any `Math` member
not on the exactly-specified list fails, so a routine added in a future language edition is
banned until someone classifies it deliberately. It also bans `Math.random` outright (plan
§3.3), which nothing enforced before. It runs in `npm test`, so it survives a clean clone —
the digest suite would also catch a regression, but a moved digest says "an engine plane
changed" where the lint names the file, the line and the replacement.

Current engine source is clean: 6 × `abs`, 3 × `ceil`, 1 × `clz32`, 4 × `floor`, 3 ×
`fround`, 1 × `imul`, 5 × `max`, 8 × `min`, 5 × `sqrt`, 27 × `trunc`. No transcendentals, no
`Math.random`.

---

## 5. Open finding: `geographiclib-geodesic` is not cross-engine byte-identical

> **SUPERSEDED — RESOLVED at WP7 task C1 (2026-07-31). See
> [`DR-C1-geodesic-fdlibm.md`](DR-C1-geodesic-fdlibm.md).** The solver is now vendored onto
> the `mathx` fdlibm kernels and the section is byte-gated: **0 / 3,600 doubles differ** on
> Chromium 141, Firefox 142 and WebKit 26. The measurement below is left **exactly as
> written** — it is the "before" column of that result, and the block-A digest it was taken
> on is still asserted, unchanged, on all three engines. The last bullet of this section
> ("closing this needs `log1p`, `hypot`, `cbrt`, `atanh` … plus a fork or patch of the
> package") is the work C1 did, with one correction: `asin` was not needed.

Plan §1.2 and Q12 both require geographiclib's math to be routed through the fdlibm module
("geographiclib-js is patched/forked to use it"). **It is not.** The shipped
`geographiclib-geodesic@2.2.0` calls `Math.atan2` (16×), `Math.cos` (14×), `Math.sin` (13×),
`Math.pow`, `Math.log1p`, `Math.log`, `Math.hypot`, `Math.cbrt`, `Math.atanh` and
`Math.atan` directly. The matrix caught it on its first run.

Measured over 240 Canberra-scale samples (`Direct` position + `Inverse` length and both
azimuths = 1,200 doubles), each browser against the Node reference:

| Engine | doubles differing | max position Δ | max length Δ | max azimuth Δ |
|---|---:|---:|---:|---:|
| Chromium 141 | 142 / 1200 | 3.16e-9 m | 2.13e-9 m | 3.5e-12° |
| Firefox 142 | 126 / 1200 | 3.16e-9 m | 1.79e-9 m | 7.1e-12° |
| WebKit 26 | 249 / 1200 | 3.16e-9 m | 1.79e-9 m | 7.1e-12° |

So the port's cross-engine claim is **not** byte-identity here; it is agreement to about
**3.2 nanometres** per call. Stated against the plan's own numbers: that is ~3× the "expected
agreement ≲ 1e-9 m" Q12 anticipated, and ~316× inside the "> 1e-6 m ⇒ port Java's
`Geodesic.Direct` verbatim" contingency threshold.

How this is handled, and what it is not:

- Node **byte-gates** the section (`NODE_GEODESIC_DIGEST`), so a dependency bump or a V8
  change in the reference engine is still caught immediately.
- The browser suite gates the **magnitude** against `GEODESIC_MAX_POSITION_M = 1e-6`, a
  number lifted from plan Q12 rather than fitted to the observation. Exceeding it fires the
  documented contingency.
- It is **not** skipped, and it is **not** presented as a pass. Byte-identity across
  browsers is an open WP3 acceptance item, carried into WP7 (movement) where the fdlibm
  routing belongs. `mathx` already has `log`/`exp`/`pow`/`sin`/`cos`/`atan`/`atan2`/`sqrt`;
  closing this needs `log1p`, `hypot`, `cbrt`, `atanh` and `asin` as well, plus a fork or
  patch of the package.

Consequence to keep in view: `Direct` runs once per agent per tick for the final partial
segment (DR-S3 §5), so a 3.2 nm position difference can in principle cross a shelter-arrival
threshold on one agent in one tick on one browser. It is far below the 200 m walked-vs-planned
tolerance the gate suite applies, but it is a real ordering hazard where distances tie, and it
is why this is recorded as a finding rather than filed as noise.

---

## 6. Tier-0 volume: the criterion is met, not amended

Plan §3.3 item 1: "10^7-draw fixtures from real Java for seeds {0, 42, −1, 2^31−1,
sampler-derived}". Plan §5.1 Tier 0: "RNG fixture identity (10^7 draws × generators ×
seeds)". DR-S5 shipped 2,630,000 draws — 263 sequences × 10,000 — which is excellent on
*shape* (263 distinct seed / draw-type / range combinations, including the inverted range
that caught the truncate-vs-floor bug) and 3.5 orders of magnitude short on *depth*.

Both now exist, and the old fixtures were not touched:

| | DR-S5 (unchanged) | This DR (added) |
|---|---|---|
| Sequences | 263 | 10 |
| Draws each | 10,000 | **10,000,000** |
| Total | 2,630,000 | **100,000,000** |
| Purpose | breadth of shape | depth per seed |
| Storage | 916 KB committed | **21 KB committed** |

Seeds are the plan's, verbatim: `java.util.Random` `{0, 42, −1, 2147483647, 42*1000003+17}`;
colt `{0, 42, −1, 2147483647, 4357}`. A test asserts that list, so a future edit cannot
quietly drop a seed.

**Storage.** 10^8 tokens is ~1.7 GB of hex text. The committed artefact is a streaming
SHA-256 per sequence plus a *cumulative* checkpoint digest every 10^6 draws and a verbatim
64-token head; `volume.parity.test.ts` regenerates all 10^8 draws in TypeScript on every CI
run and compares. That is a bit-for-bit comparison — a single flipped bit anywhere changes
the digest — with only the storage compressed. The checkpoints localise a late failure to a
10^6 window; the head localises an early one to a draw index; the count makes a truncated
stream unable to masquerade as a match.

**Why one interleaved sequence per seed, not one per draw type.** 10^7 draws of a single
code path is 10^7 draws of a single code path. The cycle spends the same budget across every
draw type the model uses. On the colt side it goes further than the existing fixtures
structurally can: a single `Uniform` runs **over the same** `MersenneTwister` the raw calls
use, exactly as `RandomHelper` is wired, so the sequence proves the `Uniform` is a pure view
over shared engine state rather than a consumer of its own — something the per-range
fixtures, where the `Uniform` was the only caller, cannot show.

**What the depth buys, concretely.** `java.util.Random.nextInt(bound)`'s rejection retry has
probability ≈ `bound / 2^31`; at bound 6842 that is 3.2e-6, so a 10,000-draw sequence takes
that branch with probability ~3% — i.e. usually never. Over 1.25e6 draws of that type it is
taken ~4 times, every run. colt's MT19937 regenerates in 624-word blocks: 10,000 draws is 16
blocks, 10^7 is 16,025.

**Cost.** Java dumper 5.0 s for all 10^8 draws. TypeScript replay 16.8 s for all 10^8 (about
6 M draws/s including hex formatting and hashing), which is what `npm test` now pays. Non-
vacuity is proven by a self-contained mutation: flip one token at a known index in a 50,000-
draw replay and assert the digest moves, the head does not, and the reported divergence
window is the right one.

**Result: all 10 sequences matched on the first attempt.** No fixture was regenerated to fit
the port.

---

## 7. Limitations / open items

1. **`geo.geodesic` byte-identity is open** (§5). Bounded at 3.2 nm, gated at 1e-6 m,
   assigned to WP7. This is the one WP3 acceptance criterion this DR does not close.
2. **Three browser builds, one platform.** The matrix runs Playwright's pinned Chromium /
   Firefox / WebKit builds on one machine and on `ubuntu-latest`. It does not cover Safari
   on Apple silicon, or a mobile engine. It covers the three engine *families*, which is
   what §3.3 asks for; it does not cover every build of them.
3. **The corpus is not the whole engine.** WP7/WP8 (smoke field, tick loop, closure waves,
   snapshot ring, outcome writer) do not exist yet. Each should add a section here as it
   lands — the corpus is designed for that, and a section that is added but empty is caught
   by the token-count assertions.
4. **The synthetic routing graph is not the certified graph.** Same code path, different
   data (§3). The certified graph is covered by the Tier-1 suite in Node only.
5. **`Math.sqrt` is allow-listed** on an IEEE-754 argument plus a four-engine measurement,
   not on an ECMA-262 guarantee. If a fifth engine ever disagrees, that entry is the thing
   to revisit — and the corpus would show it.
6. **The volume tier tests the generators, not the call sites.** DR-S5 §8.2's point stands
   unchanged: PopulationSampler's 8-draw order and ELayerSampler's 5 unconditional draws
   need model-level fixtures. `scenario.world` exercises them across engines but compares
   against a TypeScript-derived constant, not a Java dump.

---

## 8. How to reproduce

```powershell
# Tier-0 volume ground truth from real Java (~5 s)
pwsh websim/pipeline/java-exporter/dump-rng-volume.ps1

# Node reference digests (regenerating them is a finding, not a fix -- read the header)
cd websim; npx tsx engine/test/determinism/emit-digests.ts

# The clean-clone gate
cd websim; npm run ci

# The three-browser matrix
cd websim; npx playwright install chromium firefox webkit
cd websim; npm run test:browser
```
