# DR-C1 — routing geographiclib through fdlibm: divergence 11 closed

**Closes:** divergence 11 — "the geodesic library is not cross-engine byte-identical" — the
single WP3 acceptance criterion the cross-engine matrix left open, and plan §1.2 / Q12
commitment 3 ("geographiclib-js is patched/forked to use the fdlibm module").
**Risk touched:** W4 (JS transcendental nondeterminism across browsers).
**Status: RESOLVED — byte identity, gated in CI, measured on three engines.**
**Date:** 2026-07-31. **WP7 task C1.**

---

## 1. Verdict

| | |
|---|---|
| `geo.geodesic` cross-engine | **Byte-identical.** 0 / 3,600 doubles differ on Chromium 141, Firefox 142, WebKit 26, each against the Node 24 reference |
| `geo.geodesic.direct` (plan Q12's named call) | **Same digest on all three engines**, `16586bf2…0f92c1`, asserted under its own name |
| Before (DR-WP3 §5) | 142 / 126 / 249 of 1,200 doubles differing; agreement bounded at 3.2 nm, not asserted |
| Gate class | Changed from `toBeLessThan(1e-6 m)` to `toBe(0)` — a magnitude bound became an equality |
| Reference engine moved? | **No.** The pre-vendoring Node digest for the original 240-sample block reproduces bit for bit, `1b45bd17…99ab4` |
| Control | `host-math.sentinel` still yields **three different digests** on the same three engines, so the harness demonstrably *can* fail |
| Added | 14 Node tests (`engine/test/geo/`) + 12 browser assertions (4 × 3 engines) |

The distinction that matters: this is not "the browsers now agree with each other". Every
engine is pinned to one committed constant that Node produced, so agreement between two
wrong engines cannot pass.

---

## 2. The defect

`geographiclib-geodesic@2.2.0` calls the host `Math` directly — `atan2` ×16, `cos` ×14,
`sin` ×13, plus `pow`, `log1p`, `log`, `hypot`, `cbrt`, `atanh`, `atan`. ECMA-262 §21.3.2
declares every one of those **implementation-approximated**: the last ulp is a property of
the browser build, not of the language. `Geodesic.Direct` runs once per agent per tick for
the final partial segment (DR-S3 §5), so those last ulps are inside the movement path of
every agent in every run.

DR-WP3 §5 measured the consequence and recorded it as an open finding rather than a pass.
The port's cross-engine claim in this plane was agreement to ~3.2 nanometres, not identity.

---

## 3. What was built, and the design choice behind it

| Path | Role |
|---|---|
| `engine/src/geo/vendor/mx.ts` | The fdlibm namespace the vendored sources are rewritten onto — 11 members, the approximated set |
| `engine/src/geo/vendor/geographiclib-geodesic.vendored.ts` | Generated. Upstream's four sources, verbatim, with `Math.<m>` → `Mx.<m>` on executable lines only |
| `tools/vendor-geodesic.ts` | The generator. `--write` regenerates; bare invocation exits 1 on drift |
| `engine/test/geo/vendor.provenance.test.ts` | Byte-equality against a fresh re-derivation from `node_modules`, plus the residual-host-math scan |
| `engine/test/geo/vendor.equivalence.test.ts` | Differential run against the shipped package over 1,000 samples in three regimes |
| `engine/src/mathx/{log1p,cbrt,hypot,atanh}.ts` | The four kernels `mathx` was missing, each fixture-checked against Java |

**Why vendor rather than hand-port.** DR-S1 §5.3 already argued the case: `Geodesic.Direct`
is ~2,400 lines of numerically delicate code where one reassociated expression moves the
answer in the last ulp and no test names the line. So upstream is copied verbatim and put
through exactly one mechanical, reproducible substitution. The diff against upstream is a
list of member renames on non-comment lines and nothing else, which is a thing a reviewer
can actually check.

**What is deliberately *not* rewritten.** `Math.abs/floor/round/min/max/PI` are exactly
specified by ECMA-262. `Math.sqrt` stays on the host on the IEEE-754 §5.4.1 argument that
`engine/src/mathx/sqrt.ts` states and that DR-WP3 §4 measured on four engines. Keeping the
rewrite to the approximated members is what keeps the diff auditable. `vendor.provenance.
test.ts` asserts *both* directions — no approximated member survives, and the
exactly-specified ones do.

**`hypot` is present but unreachable.** geographiclib defines its own `m.hypot` as
`sqrt(x*x + y*y)` and says why in the source ("Built in Math.hypot give incorrect results
from GeodSolve92"), so the library never calls the host `hypot`. The kernel exists so the
namespace is a complete cover of the approximated set and the transform's allow-list needs
no exception. Stated here because a reader who greps for `Mx.hypot` in the vendored file and
finds nothing should get an answer rather than a suspicion.

---

## 4. Result: before and after

240 Canberra-scale samples, `Direct` position + `Inverse` length and both azimuths = 1,200
doubles, each browser against the Node reference. The "before" row is DR-WP3 §5 verbatim.

| Engine | before: doubles differing | after: doubles differing |
|---|---:|---:|
| Chromium 141 (V8) | 142 / 1,200 | **0 / 3,600** |
| Firefox 142 (SpiderMonkey) | 126 / 1,200 | **0 / 3,600** |
| WebKit 26 (JavaScriptCore) | 249 / 1,200 | **0 / 3,600** |

The denominator grew because the corpus did: task C1 added block B (short legs walked along
a solved azimuth — the model's own regime) and block C (near-antipodal pairs, the only path
that reaches `astroid()` and therefore the only one that calls `cbrt` and `atanh`). Block A
is unchanged, and is the same 240 samples in the same RNG draw order the "before" column was
measured on.

Max position Δ, length Δ and azimuth Δ are all exactly **0** on all three engines. Before,
they were 3.164e-9 m, 2.132e-9 m and 7.1e-12°.

### 4.1 The reference engine did not move

The obvious way to fake this result is to re-baseline: change the corpus, regenerate the
constants, declare victory. `WP3_GEODESIC_BLOCK_A_DIGEST` is the guard. It is the value
DR-WP3 §5 published as `NODE_GEODESIC_DIGEST` **before** the vendoring landed, and it is
asserted after — on Node, and in all three browsers. Had routing geographiclib through
`mathx` changed any of those 1,200 doubles on V8, that digest would have moved.

It did not. So the fix is provably a *cross-engine* change: the three browsers moved onto
the reference, the reference stayed put.

### 4.2 The harness can still fail

A cross-engine suite where everything agrees is only evidence if something in it disagrees.
`host-math.sentinel` — the same transcendentals called through the host `Math` — still
produces three different digests on the same three engines in the same run:

```
chromium  fd05dabb3c68975b183288baa3f807e521c0fa2b5307d8825e848ada8f8833f9
webkit    bab7aafc99fbdc1aaff73c18b2fe59b02ed69a246bc3d9e7458cae5b398d7305
firefox   a6b376e3192787ab9bb7cfbb2543a3b3c37c205f870587e8b6781fb5e17cc00d
```

That is the positive control, and it is also the direct measurement of what shipping the
unvendored package would still cost.

---

## 5. Differential against the shipped package

`vendor.equivalence.test.ts` runs both solvers over 1,000 samples — 400 Portland-scale, 300
long-leg, 300 near-antipodal — on Node:

| Comparison | samples differing | worst Δ |
|---|---:|---|
| `Direct` (lat2/lon2) | 0 / 1,000 | 0 m |
| `Inverse` (s12/azi1/azi2) | 1 / 1,000 | 2.842e-14° azimuth (≈3.2e-9 m of arc); Δs12 = 0 |
| `Direct`→`Inverse` round trip | — | 2.160e-9 m, identical to the shipped package's own |

**Zero is the expected answer here, and it is not the impressive part.** Node's `Math` is
itself fdlibm-derived, which is exactly why DR-S5 §4.2 says Node alone cannot certify
`mathx`. The single differing `Inverse` sample is one last-ulp step in a transcendental,
2.8e-14° — three orders inside the divergence-7 budget of 1e-8 m. The test is written as a
characterisation with a budget rather than an equality for that reason: asserting `toBe(0)`
here would be asserting a coincidence of the reference platform.

The load-bearing measurement is §4, in the browsers, where the host `Math` is *not*
fdlibm-derived.

---

## 6. Gates added

Every one runs in CI. The first four run in a clean clone with `npm ci` alone.

1. **`vendor.provenance.test.ts` — byte-equality re-derivation.** The vendored file carries
   `@ts-nocheck` and `eslint-disable`; neither the compiler nor a linter looks at it. This
   is the only thing that catches a hand edit inside the solver.
2. **Residual host-math scan.** Catches the defect class C1 exists to close: a future
   upstream release calling an approximated member the allow-list does not cover would
   compile, pass its digests on Node, and diverge only in a browser.
3. **Upstream pin.** Version and SHA-256 over the four sources, so a dependency bump names
   itself instead of silently swapping the math.
4. **`no-host-transcendentals.test.ts`** already scanned `engine/src` recursively, so it
   covers `src/geo/vendor/` with no change — the vendored file is held to the same
   allow-list as hand-written engine code.
5. **`geo.geodesic` in `gatedSections`.** The section moved from measured-and-bounded to
   byte-gated; `corpus.digest.test.ts` asserts the gate covers everything the port owns and
   that `host-math.sentinel` is the only exclusion.
6. **The browser matrix**, `npm run test:browser`, three engines: section digest,
   `differingDoubles === 0`, the `Direct`-only sub-digest, and the block-A continuity digest.

`engine/vitest.browser.config.ts` also lost its `optimizeDeps.include:
["geographiclib-geodesic"]`. That entry existed because the shipped package is CJS and the
page could not execute it; the browser bundle no longer imports it at all. Leaving it would
have been a stale claim in a config file, and removing it means a browser-reachable import
of the raw package fails loudly rather than being quietly pre-bundled.

---

## 7. Limitations, honestly

- **Divergences 7, 9 and 10 are not closed by this.** They are GeographicLib arithmetic
  disagreeing with *Java's* GeographicLib 1.49, which is a different comparison from
  JS-engine-versus-JS-engine. C1 closes the second and leaves the first exactly where
  DR-S1 §5.2 put it: a measured 1e-8 m budget. `Direct` agreement against Java still bottoms
  out at 3.159e-9 m, and `snap_gap_m` is still tolerance-equal rather than bit-equal.
- **Three engines, one platform.** Chromium 141 / Firefox 142 / WebKit 26 on Windows via
  Playwright, plus Node 24. Different builds on different operating systems are not
  measured. The argument that they will agree is now a *structural* one — the plane depends
  only on IEEE-754 double arithmetic, which is specified — rather than an empirical one, and
  that is a stronger position than before but it is still an argument.
- **`PolygonArea.js` and `GeodesicLine.js` are vendored but unexercised** by the engine. They
  are included because upstream's own bundler concatenates all four files and `Math.js`
  declares the namespace the others close over. Their rewrite is checked by provenance, not
  by a numerical differential.
- **The near-antipodal block is synthetic.** The model never walks 10,000 km. Block C exists
  to reach `cbrt`/`atanh`, which the Portland-scale corpus does not, and it should be read as
  kernel coverage rather than as a scenario.

---

## 8. How to reproduce

```
cd websim

# The vendoring is reproducible from node_modules; this exits 1 on drift.
npx tsx tools/vendor-geodesic.ts

# Provenance + differential (clean clone, no browsers needed).
npx vitest run --project engine engine/test/geo

# The Node reference digests.
npx vitest run --project engine engine/test/determinism

# The three-engine matrix -- the measurement in section 4.
npx playwright install chromium firefox webkit
npm run test:browser
```
