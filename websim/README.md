# websim — browser-native TypeScript port + web UI

A client-side port of the wildfire shelter agent-based model, deployed as a fully
static site. The Java/Repast model remains **the certified instrument**; this tree is
a second implementation that must earn every claim it makes, against the archived
Java runs, in public.

**Status: WP0–WP7 built. The engine runs arm A end to end, and its residual against
the archive is bounded and attributed rather than declared.** The RNG plane, the
`StrictMath`/formatter plane, the asset pipeline, the graph runtime, the world
build, the agent step, the tick loop and the `OutcomeLogger` are ported and gated
against fixtures dumped from the certified instrument. A full arm-A run reproduces
the archived terminal census — `unreachable` exact, realised marginals equal rather
than close — and the 114-row `final_state` residual is measured against a 200-stream
permutation census (§2.1, [`DR-WP7`](docs/DR-WP7-order-attribution.md)). The worker
runtime and the entire UI are **not built**. §2.1 below states exactly what is
proven and how; §2.2 states what is not, in both directions.

The work packages, decisions and acceptance criteria live in
[`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md); the engine reference
(Java sources, semantics, standing facts) is
[`docs/PORT_MAP.md`](docs/PORT_MAP.md). Those two documents are authoritative — this
README is the user-facing contract that summarises them and the running ledger of
where the port knowingly differs from the instrument. Per-work-package evidence is
in the decision records: [`DR-S1`](docs/DR-S1-geodesic.md) (geodesic),
[`DR-S2`](docs/DR-S2-exporter.md) (exporter), [`DR-S3`](docs/DR-S3-perf.md)
(performance), [`DR-S5`](docs/DR-S5-rng.md) (RNG),
[`DR-WP5`](docs/DR-WP5-graph-runtime.md) (graph runtime),
[`DR-F1`](docs/DR-F1-world-fixtures.md) (world fixtures),
[`DR-WP3`](docs/DR-WP3-cross-engine.md) (cross-engine determinism + Tier-0 volume),
[`DR-C1`](docs/DR-C1-geodesic-fdlibm.md) (geodesic routed through fdlibm — divergence 11
closed), [`DR-FIX-A`](docs/DR-FIXA-movement-oracle.md) (the movement-kernel gate blind spot
and the per-tick oracle that closes it),
[`DR-WP7`](docs/DR-WP7-order-attribution.md) (the arm-A residual bounded by a
200-stream permutation census and attributed to the ordering channel).

```
npm install       # once, from websim/
npm run typecheck # tsc --noEmit across every workspace + tools
npm test          # vitest, all packages
npm run lint:claims
npm run check:scratch # pipeline/out holds no leftover test scratch (§8.2)
npm run ci        # all four, in that order — the gate
npm run test:strict  # same suite, but artifact-gated skips become failures (§8.1)
```

Workspaces: `shared` (contracts), `engine` (deterministic core), `pipeline` (offline
asset builds), `app` (UI), `validation` (gate ports and replay harness). `tools`
holds repo scripts and is not a workspace.

**Fixtures and the clean checkout.** The parity gates run against Java-dumped
fixtures in two tiers. Small ones are committed under `engine/test/fixtures/` and
always run: the RNG draw dumps, the `mathx`/`StrictMath` tables, both HALF_UP oracle
tables, the adversarial CSV corpus, and stride-sampled slices of the world dumps.
The bulk oracle — the 44 MB raw graph dump, the 39 full world dumps, the 118 shelter
trees — is generated into the git-ignored `pipeline/out/` by the Java exporter, and
the suites that need it are **artifact-gated** through the single policy in
`tools/artifact-gate.ts`. **A clean checkout therefore runs a smaller suite, and says
so loudly:** each gate it could not run prints a `!!` banner naming the missing file
and the evidence forgone, and is reported as skipped, never as a pass. On a machine
that has the artifacts, `npm run test:strict` sets `WEBSIM_REQUIRE_ARTIFACTS=1` and
turns any such skip into a hard failure. The full policy is §8.1. Raw encampment
coordinates live only under the git-ignored `pipeline/local-raw/` and never enter git
or any published asset.

---

## 1. Fidelity contract

What this port promises, and what it does not. These are **commitments, not
completion claims**: items 1–3 have code and gates behind them today; items 4–8
constrain work packages that are not built yet (§2.2) and are enforced so far only
by the claim linter and by the shape of the contracts in `shared/`. §2 is the part
of this document that reports measurements.

1. **Determinism is the product.** Same `RunConfig` plus the same asset hashes
   produce byte-identical outputs on every browser and in Node. The engine reads no
   wall clock, no environment and no ambient randomness; all four RNG streams are
   injected. Cross-browser byte identity is a CI gate, not an assertion.
2. **Java-archive byte identity is not a goal.** Bit-exact `java.util.Random`, a
   bit-exact colt Mersenne Twister, and Tier-1 initial-world bit identity *are*
   goals — with one measured, registered exception inside Tier 1, the geodesic
   `snap_gap_m`, which is tolerance-equal at a 1e-8 m budget (§6, item 9). The
   within-tick agent order is a declared, measured divergence (§6, item 1).
3. **Edge weights are never computed in the browser, and never recomputed at all.**
   The offline pipeline runs a read-only Java exporter against the certified
   `Geography/` classes; the graph asset carries Java-computed Float64 lengths, the
   post-correction node table and the correction census. Bit-exact by construction.
4. **One internal state, two formatters.** `parity` reproduces the Java bytes and is
   used only by the validation harness; `v2-web` is what users export. Number
   *values* are identical in both; only representation and key names differ.
5. **The executed manifest comes from the engine, never from the UI store.** What the
   engine actually used is what gets published, and the UI renders the
   configured-vs-executed difference. Any non-empty difference invalidates the badge.
6. **Numbers carry their provenance everywhere.** "Certified Java run" and "Live
   browser simulation" are distinct, always-visible classes; a browser number can
   never be presented in the archived class.
7. **Constructed data is labelled as constructed.** The severe smoke series are
   counterfactuals, not measurements, and carry that label on the map, in every
   chart and in every export.
8. **Ethics and licensing gate publication, not development.** No public asset
   contains raw encampment coordinates or raw incident ids; the deploy job greps for
   both before publishing.

---

## 2. What is built, what is proven, and how

This section is the reason the README exists. Every number below is produced by a
test in this tree, not quoted from a plan.

### 2.1 Proven

Counts are `matched / compared`; "bit-equal" means the IEEE-754 bit patterns are
identical, compared as `%016x` hex tokens, never as decimal text.

| Plane | What is asserted | Measured | Where |
|---|---|---|---|
| **RNG (Tier 0)** | `java.util.Random` and the colt `MersenneTwister` + `Uniform` scaling layer reproduce Java's draw sequences exactly, per stream, in order | **Breadth:** 263 sequences × 10,000 draws = **2,630,000**, every draw bit-equal. **Depth:** 10 sequences × **10,000,000** draws = **100,000,000** more, the plan's own 10^7 × 5-seed criterion, compared by streaming SHA-256 with a cumulative checkpoint every 10^6 draws | `engine/test/rng/`, [`DR-S5`](docs/DR-S5-rng.md), [`DR-WP3`](docs/DR-WP3-cross-engine.md) |
| **Cross-engine determinism (Tier 2)** | The same corpus produces byte-identical output on Node, Chromium, Firefox and WebKit — every engine pinned to one committed digest, not merely to each other | **7 / 7** gated sections byte-identical on all four engines (both RNGs, `mathx`, the formatter, a 512-resident world build, a 400-node SSSP scenario, **and the geodesic solver**); 34,869 canonical hex tokens. The geodesic section joined the gate at WP7 task C1, which took it from 142 / 126 / 249 of 1,200 doubles differing to **0 / 3,600 on all three browsers**. Host `Math` transcendentals still produce **four different digests on four engines** (two of them both V8), which is both the measurement that justifies the fdlibm module and the control proving this gate can fail | `engine/test-browser/`, `engine/test/determinism/`, `engine/test/geo/`, [`DR-WP3`](docs/DR-WP3-cross-engine.md), [`DR-C1`](docs/DR-C1-geodesic-fdlibm.md) |
| **`StrictMath` (Tier 0)** | `log`, `exp`, `pow`, `sin`, `cos`, `atan`, `atan2`, `sqrt` are fdlibm ports that match `StrictMath` bit for bit; the fixture also records where this JVM's `java.lang.Math` intrinsics differ from `StrictMath`, so the choice is documented rather than assumed | Every fixture case bit-equal | `engine/test/mathx/mathx.parity.test.ts` |
| **HALF_UP formatter (Tier 0)** | `javaFormatFixed` reproduces `String.format(Locale.US, "%.Nf", v)` character for character, for N = 0..6. Java rounds the **shortest round-tripping decimal**, not the exact binary value, so `Number#toFixed` is disqualified — and the fixtures prove it rather than assert it | Canonical table: 4,163 doubles, all in-domain cells exact. Independent second table from a second dumper: **18,802 / 18,802** cells exact, **2,702 / 2,702** `(long) v` casts exact, and the two dumpers agree on **350 / 350** shared cells | `engine/test/mathx/format.parity.test.ts`, `half-up-cross-oracle.test.ts` |
| **CSV loader (Tier 0)** | The ported `CsvLoader` matches the certified parser byte for byte, including its failure modes | **68 / 68** parse invocations over 34 adversarial inputs (60 row sets, 10 throws), keys, values and exception messages compared as UTF-8 bytes; plus all 13 shelter CSVs, the 3,400-row BOM+CRLF encampment sample and 2 closure schedules | `engine/test/loader/` |
| **Graph asset** | Edge weights are Java-computed and carried verbatim; the browser never recomputes one | **109,434** edge lengths bit-exact through pack/unpack; 88,100 nodes incl. the 22 synthetic negative ids; topology under the 3 MB brotli budget | `pipeline/test/graph-asset.test.ts`, [`DR-S2`](docs/DR-S2-exporter.md) |
| **Shelter trees (Tier 1)** | Every Dijkstra tree equals the certified one — distances, predecessor edges and reachable sets | **118 / 118** trees; **3,539,712 / 3,539,712** distances bit-equal; **3,539,712 / 3,539,712** predecessor edges equal as certified directed edge ids; 768 node chains + 768 coordinate paths (182,250 vertices) bit-equal | `engine/test/graph/trees.parity.test.ts`, [`DR-WP5`](docs/DR-WP5-graph-runtime.md) |
| **Snap (Tier 1)** | Every encampment and shelter snaps to the node Java chose | **3,400 / 3,400** camp node ids and resolved node coordinates; **508 / 508** shelters across all 13 shelter CSVs. The 192 groups of bit-identical node coordinates are censused, and the tie-break is shown to be doing real work | `engine/test/graph/snap.parity.test.ts` |
| **Initial world (Tier 1)** | The full world build at the archived configs equals the Java dumps: camp assignment, start node, demographics, walking speed, E-layer attributes, decision seeds | **39 / 39** dumps, **266,838** residents (39 × 6,842), every compared field matched; 13 shelter tables incl. windows, reserves and policy columns | `engine/test/world/tier1.parity.test.ts`, [`DR-F1`](docs/DR-F1-world-fixtures.md) |
| **Movement kernel (per tick)** | One resident's displacement on one tick equals the certified `GisAgent.step()`'s — not an aggregate over a run. Every tick that does not consume the leg's last vertex is **bit-identical** by construction (Java's addend is exactly `stepLengthM` because its loop zeroes `remainingM`; the port's `min()` returns exactly `stepLengthM`), so the gate is `toBe`, not `toBeCloseTo`. Clean-clone: no artifact gate | **998 / 998** interior walking ticks bit-exact across 24 traced legs (4 speed configs x 6 residents, including one config that drives `attributes.walkingSpeedMps` against a decoy run-wide parameter); 1,080 leg-consuming and frozen rows within **1.304e-8 m** (budget 1e-7); worst position offset **2.124e-8 m**. Every exposure accumulator bit-identical on **every** row. Mutation-proved: a **1 ULP** `stepLengthM` error and a 0.012% `INHALATION_WALKING_M3H` error are each caught here and **nowhere else in the repository** | `engine/test/oracle/movement.oracle.test.ts`, `pipeline/java-exporter/dump-movement-trace.ps1`, [`DR-FIX-A`](docs/DR-FIXA-movement-oracle.md) |
| **Clean-clone oracle** | Everything above is gated on the git-ignored `pipeline/out/`; this row is what a **fresh clone with no artifacts at all** still proves, from committed bytes only. A distance-ball cut of the certified street graph — real nodes, real certified geodesic weights carried as raw IEEE-754 bytes — plus the Java tree rows for exactly that ball, and a stride sample of the 39 per-resident dumps replayed through the production world build | **64,768** certified comparisons with `pipeline/out/` absent: **20,000 / 20,000** distances bit-equal, **20,000 / 20,000** predecessor edges equal as certified directed edge ids, the reachable set exact, and **1,248** stride-sampled residents over **39 / 39** config-seed pairs (**24,768** field comparisons). The ball is 20,000 nodes / 28,573 edges cut from the 88,100-node certified graph; its own provenance digests and every container section digest are re-checked before it is believed. 20,000 + 20,000 + 24,768 = **64,768** | `engine/test/oracle/committed-slice.test.ts`, `pipeline/scripts/build-committed-slice.ts` |
| **Outcome parity (Tier 3)** | A full arm-A run — preset `A_present_day`, seed 42, n=6,842, 312 h — reproduces the archived Java run's terminal census and every archived identity | `sheltered` **2,060** and `refused_all_full` **4,754**, both inside the nine-seed band; `unreachable` **28 EXACT** and the same 28 ids; realised marginals **equal, not close** (6/6 at 4 dp); the 54,002.8192 never-sheltered exposure identity **1 distinct value**; dose ≡ exposure × 0.61 on **64/64** resting rows at 4 dp; `out_of_range_lookups` **0**; capacity sum **2,234** over 36/36 sites | `validation/test/wp7-vertical-slice.test.ts`, `validation/scripts/run-wp7-slice.ts` |
| **Tier-4 residual, attributed** | The per-row residual against the archive, **bounded and mechanically explained** rather than declared. Divergence 1 (within-tick order) is sampled directly: 200 independent permutation streams, identical config, one asserted world-build digest across all of them | **6,546 / 6,842 rows (95.67%)** byte-identical across all **46** shared columns; **27 / 46** columns bit-equal on every row. `final_state` differs on **114**, which decomposes as **57 lost / 57 gained / 0 other** and sits at the **31st percentile** of the 200-stream spread (94–144, mean 116.89, sd 8.58, z −0.34, two-sided p **0.776**). **200/200** streams reproduce the balanced-swap signature with zero non-shelter flips, and `sheltered`/`unreachable` never move. `mean_travel_dist_m_admitted` matches a site **iff** its admitted set is identical — a 2×2 with **both off-diagonal cells empty** (10/0/0/26) — and the **1,973** residents co-admitted to the same door walk **byte-identical** distances | `validation/test/tier4-attribution.test.ts`, `validation/scripts/order-permutation-census.ts`, [`DR-WP7`](docs/DR-WP7-order-attribution.md) |
| **Exact-tie policy** | What the certified `StreetNetwork.computeTree` does when two relaxations land on **bit-identical** distances — the one thing a distance oracle cannot see, because the strict `nd < old` relaxation only shows at a tie | **26 / 26** distance and predecessor rows bit-equal to the certified Java across **6** scenarios run through the real `addStreet`/`buildIndex`/`computeTree`, covering **9** nodes with a genuine exact double tie (22 candidates, widest **5-way**). A `<=` relaxation reproduces every distance and is caught on **9** predecessors in **6 / 6** scenarios. Runs with `pipeline/out/` absent | `engine/test/oracle/tie-oracle.test.ts`, `pipeline/java-exporter/src-tie/` |

The certified corpus itself contains **no exact tie at all**: all 109,434 edge lengths
are pairwise distinct as raw doubles, and across all 118 certified trees (3,539,712
rows) **zero** nodes have two incoming relaxations that land on their distance. That
is why the tie row above is measured on synthetic incidence with real geodesic
weights — a cut of the real graph, however large, cannot exercise the policy. The
scope limit is stated at the head of `tie-oracle.test.ts` rather than smoothed over,
and those two counts are themselves **measured**, not asserted, by
`engine/test/graph/tie-census.test.ts` — so the day the certified graph gains a real
tie, the suite says so instead of this paragraph quietly becoming false.

Two build-time quantities inside that ladder are **tolerance-equal, not bit-equal**,
and are registered as divergences 7 and 9 in §6 rather than folded into the counts
above: `snap_gap_m` and the runtime cumulative-segment sum. Both are geodesics, both
are bounded by DR-S1's measured 1e-8 m budget, and neither is an input to any
routing decision.

Every fixture comparison first checks the fixture file's SHA-256 against the
committed `engine/test/fixtures/world/manifest.json`, so a stale or half-written dump
fails loudly instead of quietly weakening the comparison. A missing *committed*
fixture throws rather than skips.

**Reading the Tier-4 column count.** The comparison is over **46 shared columns**,
not 56: the port emits 59, the archived Java writer emits 49, `sim_id` / `commit` /
`data_version` are excluded as environment facts, and **10 of the port's columns
have no Java counterpart at all** (the WP8 decision and closure columns, absent
from a 2026 archive that predates them). 27 bit-equal + 19 divergent + 10 not
comparable = 56, which is where a "of 56" framing comes from and why it flatters
the result. The honest figure is **27 of 46**.

**Which preset the arm-A comparison runs.** `A_present_day`, against
`docs/runs/present-day-three-arm/A-seed42`. `A_present_day` and `E0_null_A` differ
in **exactly one of 41 parameters** — `enableDecisionLayer`, 0 and 1 respectively —
so they are *not* interchangeable, and the E0-null arm-A archive runs are a
different configuration with a different oracle. The `present-day-three-arm`
manifest predates the decision layer entirely, which is why `A_present_day` is the
right preset for this row.

### 2.2 Not built

Nothing in this list has an implementation, and no claim in this README depends on
one. Stated explicitly because the previous version of this file was stale in the
opposite direction, and a fidelity contract that overstates its own coverage is
worse than no contract.

- **The badge.** §4 specifies its semantics. No badge is computed or displayed today,
  and no configuration has yet earned one.
- **The UI.** No run screen, map, compare view, archive browser, provenance panel,
  permalink codec use, or export path. `app/src/index.ts` is still the WP0 scaffold
  that fixes the vocabulary (screens, badge states) and nothing else.
- **The worker runtime**, streaming, snapshots and the replay harness. The engine
  runs headless in Node (`validation/src/headless.ts`); nothing hosts it in a Web
  Worker yet.
- **The v2-web escaping and timestamp fixes.** Named in divergence 5 and §7 as
  v2-web behaviours; neither is written. See those two rows.
- **The WP8 layers.** Closure waves, the Phase-E decision layer at runtime, hazard
  departure, outreach conversion, push/stuck. The fields exist on `Resident` so the
  output layer has one shape to read; they are inert, and the `l` counter identity
  gate asserts that they are.

**Was on this list and no longer is** (WP7 closed): the simulation itself — the
agent step, tick loop, movement, admission, exposure/dose accumulation and the
`OutcomeLogger` port all exist and are measured in §2.1; and Tiers 2, 3 and 4,
which now report numbers rather than a specification. This paragraph exists
because the previous version of this file was stale in *both* directions at
different times, and an understated contract is a false self-report too.

### 2.3 Reproducing the evidence

`npm run ci` on a clean checkout runs the committed-fixture tier and **artifact-gates**
the bulk parity suites, printing a loud banner for each one it could not run (see
§8.1, Skip-vs-fail policy). The full ladder additionally needs the exporter output in
`pipeline/out/`, produced by the read-only Java exporter under `pipeline/java-exporter/`
against the certified `Geography/` classes; `Geography/` is never modified and never
has anything written into it. On a machine that has those artifacts, run
`npm run test:strict` — it refuses to skip anything.

---

## 3. Tier ladder

The validation ladder the badge and CI both refer to. Release gate: **Tiers 0–3
green in CI; the Tier-4 report reviewed with zero unexplained divergences.**

| Tier | Name | What it proves | Where it runs |
|---|---|---|---|
| **0** | Component bit-parity | RNG draw fixtures, sampler draw-order dumps, CSV loader byte fixtures, the HALF_UP formatter table, deterministic-math identity across engines | Every push |
| **1** | Initial-world identity | The full world build at archived configs is bit-equal to Java-exported dumps: camp assignments, demographic table, attribute tables, decision seeds, shelter distance arrays, and the snap *node assignment*. Converts any downstream statistical failure into exact fault localisation. **The one exception is `snap_gap_m`, which is tolerance-equal, not bit-equal** — it is a geodesic, it decides nothing, and it is registered as divergence 9 in §6 | Every push |
| **2** | Own-engine R3 | A degenerate-config run is byte-identical to a no-layer run on the shared-column projection, under the archive's exclusion discipline; plus deterministic replay (same config twice, four engines) and the snapshot-replay property | Every push |
| **3** | Statistical cross-validation vs the archive | Sheltered counts inside the nine-seed archive ranges; unreachable id-set hashes exact; realised marginals equal rather than close; the exposure and dose identities; counter identities; zero out-of-range concentration lookups | Working set on PRs, full archive nightly |
| **4** | Structural identity where the shuffle is inert | In arms where capacity never binds, per-agent rows should reproduce exactly. The harness publishes the per-config bit-match census. **Any divergence not attributable to the declared within-tick-order channel is a release-blocking bug** | Measured and reported |

A cheap subset of the gates runs **in the browser after every user run** and feeds
the badge; missing archive data degrades loudly and is never reported as a pass.

---

## 4. Badge semantics

The badge is earned per configuration, per run — never inherited from a preset.

| Badge | Earned when | Shown as |
|---|---|---|
| **ARCHIVE-VALIDATED** | The executed manifest (parameters *and* asset hashes) matches an archived bundle exactly, this build's replay passed Tiers 1–4 in the shipped validation report, and the just-finished run's in-browser gates passed | Green; popover gives the archived family, tier results, the Tier-4 bit-match census and an archived-vs-live comparison |
| **ENGINE-CERTIFIED** | A custom configuration inside the validated envelope (parameters within published registry ranges, stock assets), in-browser gates passed, replay token issued | Blue; "reproducible, not archive-matched" |
| **EXPLORATORY** | Outside the envelope: out-of-range parameters, custom smoke, non-preset smoke scaling, demographic overrides | Amber; explicit "not validated against the Java instrument" banner |
| **INVALID** | Any in-browser gate failure, any out-of-range concentration lookup, or a non-empty configured-vs-executed difference | Red; charts watermarked, exports annotated, never silently presented |

---

## 5. Never-regress gotchas

Four facts that have already cost the project a correction. Two of them are
enforced by the claim linter, two by structural code paths.

1. **Vulnerability-weight citation.** The sign of the vulnerability term is sourced
   to **Coughlan, Huber-Stearns, Clark & Deak 2022** (EWP Working Paper 111,
   University of Oregon / OHA, n = 1,200). A different, non-existent 2022 citation
   circulated in earlier drafts; linter rule `banned-citation` blocks its return.
   The magnitude remains an assumption, swept 0 to +0.5.
2. **Severe-series anchor.** The worst-plausible series is anchored to **Canberra
   Florey, 2,496.1 µg/m³** (5–6 January 2020), giving scale 4.436 = 2496.1 / 562.7.
   Framing it as matching a January 2025 Los Angeles fire's worst hour is false —
   that event's regulatory hourly maximum was 301.1 µg/m³, *below* Portland's own
   observed 562.7 — and linter rule `banned-severity-comparison` blocks it.
3. **`simulationHours ≤ slices − 1`.** The inclusive final tick reads hour index
   equal to `simulationHours`, so a window of H hours needs H + 1 smoke slices.
   Overrun silently books fabricated zero-concentration hours. Enforced three times
   over: slider maximum, preset validation, engine fail-fast — and caught by the
   zero-out-of-range-lookups gate. Observed series: 576 slices / 575 h. Severe v1
   and v2: 456 slices / **455 h**.
4. **Executed-parameter manifest discipline.** Repast's batch runner zeroes negative
   constants declared as `"number"`; the fix is to declare them `"double"`. The
   transferable lesson is the manifest: emit what the engine *used*, separately from
   what the UI *asked for*, so silent coercions stay visible.

Also standing: 55.5 µg/m³ is a concentration threshold and is never labelled with an
air-quality index category name; the smoke tint is a county-uniform scalar, not a
plume.

---

## 6. Divergence register

Every known, accepted difference between this port and the Java instrument. Adding
an entry requires a note on how it is measured or bounded; removing one requires a
test proving the divergence is gone. Seeded from plan §9.2.

| # | Divergence | Class | Status / bound |
|---|---|---|---|
| 1 | **Within-tick agent order**: a Fisher–Yates permutation drawn from the Mersenne Twister default stream, matching Repast's shuffle *semantics* but not its algorithm | Semantics matched, algorithm not | Open by design, and now **bounded**. Arm A's 114-row `final_state` residual sits at the **31st percentile** of a 200-stream permutation census (94–144, mean 116.89, sd 8.58; two-sided empirical p **0.776**), and **200/200** streams reproduce its structure exactly: a balanced `SHELTERED` swap set, zero non-shelter flips, `sheltered` and `unreachable` unmoved. The `shelters.csv` consequences are attributed the same way — `mean_travel_dist_m_admitted` matches a site **iff** the admitted set is identical, and co-admitted residents walk byte-identical distances, so neither order-sensitive column carries an error of its own. Still the only channel allowed to explain a Tier-4 difference; the difference between "declared" and "measured" is [`DR-WP7`](docs/DR-WP7-order-attribution.md) |
| 2 | **`agents.csv` row order**: creation order rather than the instrument's unspecified context order | Presentation | Accepted. All comparisons are key-joined; not load-bearing for any gate |
| 3 | **Sorted-Gini substitution**: O(n log n) formulation in place of the pairwise sum | Math-identical | Accepted. Unit-proved to 0 ulp against the pairwise form |
| 4 | **Per-tick parameter re-reads hoisted** out of the hot loop | Optimisation | Accepted. Values are immutable within a run; a fail-fast trips if one changes |
| 5 | **v2-web output quirk fixes** — **four written**: `null` strata instead of a non-finite literal, `retarget_count` instead of `door_refusals`, both utilisation figures, LF line endings. **Two named here previously but NOT written**: "true UTC" (the engine calls no clock — `generated_utc` is a caller-supplied `OutputEnvironment` field, written verbatim in both flavours) and "full escaping" (`jsonEsc` is flavour-independent, so v2 reproduces the instrument's incomplete escaping) | Representation | Accepted, with the gap stated. Each *written* fix is paired with a parity reproduction in `logger.units.test.ts`; number values never differ. §7 carries the same split so the two lists cannot drift apart again |
| 6 | **Negative-constant batch zeroing is unreproducible here** by construction — the config is typed and validated before the engine sees it | Instrument defect not ported | Accepted, with disclosure: the archived severe runs *executed* `pushThetaThreshold = 0.0` (inert; zero blockage events), while web presets carry the corrected −0.25. The executed manifest states which |
| 7 | **Geodesic partial-segment arithmetic**: only the final partial segment is computed at runtime, through the deterministic math module | Numeric epsilon | Bounded, at a **measured 1e-8 m** budget — *not* the ≲1e-9 m the plan originally targeted. DR-S1 §5.2 raised it by an order of magnitude after measuring the real libraries: the instrument runs GeographicLib-Java 1.49, the port runs geographiclib-js 2.x, and `Direct` agreement bottoms out at 3.159e-9 m. Knife-edge census published and attributed at Tier 4 |
| 8 | **Public builds start agents at snapped street nodes**, so the snap-gap distance collapses to ≈ 0 | Ethics-driven data divergence | Accepted. The start node itself is preserved exactly; full-fidelity checks run on the git-ignored local path. Public live runs are capped at ENGINE-CERTIFIED for this reason |
| 9 | **Build-time `snap_gap_m` is tolerance-equal, not bit-equal.** The distance from a camp or shelter to its snapped street node is a geodesic `Inverse`, and the two GeographicLib implementations disagree in the last few ulp | Numeric epsilon **inside a tier otherwise stated as bit-equal** | Accepted and bounded, and called out here because Tier 1 is described everywhere else as bit identity. Measured against the Java dumps: **3,160 / 3,400 camp rows and 470 / 508 shelter rows differ in bits**; across the whole Tier-1 set, **247,884 of 266,838 resident rows (92.9%)**, which is **6,390 of 6,842 at A-seed42** (452 bit-equal). Max \|Δ\| = **3.181e-9 m** (camps) and **1.416e-9 m** (shelters), against the divergence-7 budget of **1e-8 m** — ~3× margin. **The node *choice* is exact, 3,908 / 3,908**, and the choice is the only thing routing reads; `snap_gap_m` is a reported diagnostic. Asserted with `expect(maxGapDeltaM).toBeLessThanOrEqual(1e-8)` in `tier1.parity.test.ts` and `snap.parity.test.ts`, never with a bit comparison |
| 10 | **Runtime `segCumM` prefix sums are not bit-equal** to the Java-authoritative edge length: summing per-segment geodesics reproduces it for only **5,848 / 109,434** edges (81,560 within 1e-9 m; worst raw residual 2.598e-8 m) | Numeric epsilon | Bounded and structurally contained. Each edge's final cumulative entry is overwritten with `edgeLengthM[e]`, so **109,434 / 109,434 edge totals are bit-equal** and path totals close exactly against routed distances; the residual is confined to the interior of the last segment. Consequence, restated from DR-S3 A3: WP7's per-agent `distanceTraveledM` and coordinate gates **must** be tolerance comparisons, and `SegmentGeometryStats` carries the residual so the tolerance stays a measured number |

| ~~11~~ | ~~**The geodesic library is not cross-engine byte-identical.**~~ Plan §1.2 and Q12 require geographiclib's math to be routed through the deterministic math module; `geographiclib-geodesic@2.2.0` calls `Math.atan2/sin/cos/pow/log1p/hypot/cbrt/atanh` directly, and those are implementation-approximated | Numeric epsilon, **inside the plane the port claims byte-identity for** | **RESOLVED at WP7 task C1 — removed from the register, kept struck through as a record.** The solver is vendored into `engine/src/geo/vendor/` with exactly those call sites rewritten onto the `mathx` fdlibm kernels, reproducibly from `node_modules` (`tools/vendor-geodesic.ts`). **Before:** 142 / 126 / 249 of 1,200 doubles differing on Chromium 141 / Firefox 142 / WebKit 26; max position Δ 3.164e-9 m. **After:** **0 / 3,600 on all three**, max Δ exactly 0, and the `Direct`-only digest plan Q12 names is the same on all three. The gate changed class — `toBeLessThan(1e-6 m)` became `toBe(0)`. The reference engine did not move: the pre-vendoring Node digest for the original 240-sample block reproduces bit for bit, so this is a cross-engine fix and not a re-baselining. `host-math.sentinel` still yields three different digests in the same run, which is the control proving the gate can fail. Evidence: `docs/DR-C1-geodesic-fdlibm.md`, `engine/test/geo/`, `engine/test-browser/cross-engine.digest.test.ts` |

Divergences 7, 9 and 10 are all the same root cause — GeographicLib arithmetic the
port does not own — surfacing at three different places. They are listed separately
because they are bounded separately, and because 9 sits inside a tier this document
otherwise describes as bit identity.

Divergence 11 was the fourth face of it and the only one that was ever **open**: the
single WP3 acceptance criterion the cross-engine matrix did not close. It is closed, and
the row above is kept struck through rather than deleted because the register's own rule
is that removing an entry requires a test proving the divergence is gone — so the entry
has to survive long enough to point at that test. Note what closing it did *not* do:
7, 9 and 10 compare this port against **Java's** GeographicLib 1.49, which is a different
comparison from JS-engine-against-JS-engine, and they stand at their measured bounds.

---

## 7. Quirk ledger

Instrument behaviours that are **to be reproduced on purpose**. The distinction that
governs this table: *formatting* quirks are reproduced in parity mode and fixed in
v2-web; *semantics* quirks change physics or counters and are therefore reproduced
in **both** modes, forever.

**Status column, read it first.** It says what code exists *today*, and it is
re-audited against the tree rather than carried forward — the WP7 `OutcomeLogger`
port (`engine/src/output/logger.ts`) landed and moved most of this table, and two
of the v2-web halves it was assumed to have brought are still **not written**.
Rows move to *implemented* only when a test pins them, and the pinning test is
named in the row.

| Quirk | Kind | Status | Parity | v2-web |
|---|---|---|---|---|
| HALF_UP decimal formatting (never the language's default float printing) | Formatting | **Implemented + gated** — `mathx/format.ts`, two independent Java oracles | Reproduced | Reproduced — this one is not a defect |
| Non-finite value emitted as a bare JSON literal in empty strata | Formatting | **Implemented + gated** — `logger.ts#jnum`, `logger.units.test.ts` | Reproduced (`NaN`) | Fixed — emits `null` |
| Refusal counter named for the door rather than the retarget event | Formatting | **Implemented + gated** — `AGENTS_HEADER_V2`, `logger.units.test.ts` | Reproduced (`door_refusals`) | Fixed — `retarget_count` |
| Utilisation reported at final tick only | Formatting | **Implemented + gated** — `SHELTERS_HEADER_V2`, `logger.units.test.ts` | Reproduced | Fixed — `utilization_final` **and** `utilization_peak` |
| CRLF line endings | Formatting | **Implemented + gated** — `logger.units.test.ts` | Reproduced | Fixed — LF |
| `cumulative_dose_ugm3h` holds **exposure**, not dose | Formatting / naming | **Implemented + pinned** — the misnomer is the instrument's (`GisAgent.java:55`, `OutcomeLogger.java:154`); the transposition is pinned by `logger.units.test.ts` and explained at `agents/resident.ts` | Reproduced | Reproduced — renaming it would break archive comparability for a quantity that is now documented on both sides |
| Generation timestamp written in local time | Formatting | **Not the port's to reproduce** — `generated_utc` is an `OutputEnvironment` *input*; the engine calls no clock (plan §1.2: no `Date`), so the caller supplies the string and both flavours write it verbatim | Caller-supplied | Caller-supplied — a v2 caller that wants true UTC passes true UTC |
| Incomplete JSON string escaping | Formatting | **Parity half implemented + gated** (`logger.ts#jsonEsc`, `logger.units.test.ts`); **the v2-web half is NOT written** — `jsonEsc` is flavour-independent, so v2 reproduces the incompleteness too | Reproduced | **Open** — full escaping is specified, not implemented |
| Double concentration lookup, double-incrementing the out-of-range counter | **Semantics** | **Implemented** — `agents/step.ts` blocks 5 and 6 each call `concentrationForTick` | Reproduced | Reproduced |
| An agent turned away at a closed door is not counted as refused | **Semantics** | **Implemented** — `shelters/admit.ts` (`refused-closed` touches no counter) | Reproduced | Reproduced |
| Archived severe runs executed a zeroed push threshold (see divergence 6) | **Provenance note** | Specified (WP8) | State in the manifest | State in the manifest and in preset copy |

---

## 8. Claim linter

`npm run lint:claims` scans every source, markdown and JSON file under `websim/`
for banned or retired claim text and exits non-zero on any finding. It has run
since WP0 day 1, because the failure mode it prevents — a corrected claim
re-entering through UI copy, a preset label, a tooltip or asset metadata — is
invisible to type checking and to every other gate.

- **Rules** live in [`tools/claims.ts`](tools/claims.ts): one entry per claim, each
  with a status, a pattern, a rationale that includes *why the pattern cannot
  false-positive*, and a replacement wherever one exists. Rule ids never contain a
  banned token, so prose (including this README) can cite a rule by name.
- **Backstops.** The two never-regress citation and severity bans each carry a broad
  backstop rule alongside the precise one. A backstop finding is suppressed when it
  overlaps the precise rule's finding, so one bad sentence yields one finding.
- **Quarantine.** Four files legitimately contain the banned strings: the two
  authoritative reference documents in `docs/`, the rule definitions, and the test
  fixtures. They are listed explicitly with reasons, the count is printed on every
  run, a test pins the list so it cannot grow silently, and a stale entry (pointing
  at a deleted file) fails the lint.
- **Tests** in [`tools/test/lint-claims.test.ts`](tools/test/lint-claims.test.ts)
  seed a violation for **every** active rule, assert the sanctioned near-miss
  phrasings stay green, and assert that the real tree is clean.

This linter is scoped to `websim/`. The repo-root deliverables have their own
registry and linter, and one rule from it is deliberately *not* ported: the retired
two-shelter experiment rule keys on the number 2,037, which is the current default
population here and carries no retired meaning in this tree.

### 8.1 Skip-vs-fail policy

Much of the evidence in §2.1 is checked against oracles that are **not in git**: the
Java exporter dumps and packed assets under `pipeline/out/` (~150 MB), the local raw
encampment feed under `pipeline/local-raw/`, the 375 MB archive at `docs/runs/`, and
the read-only `Geography/` tree, which is absent from a websim-only checkout. Plan
§5.3 requires the harness to degrade **loudly** when those are absent and never to
skip silently, and §5.2 requires every gate to be provably able to fail. A suite that
quietly vanishes satisfies neither: a green run that proved something and a green run
that proved nothing look identical.

The policy is implemented once, in
[`tools/artifact-gate.ts`](tools/artifact-gate.ts), and every artifact-gated suite
in the tree goes through it.

**1. A gate must say what it is for.** `artifactGate({ gate, suite, evidence,
artifacts })` will not construct without a stable gate id, a suite title, a sentence
naming the evidence forgone, and at least one artifact — each artifact carrying an
absolute probe path and a key into the catalogue of artifact *sources*, which is
where the "how do I produce this?" answer lives, exactly once.

**2. Three outcomes, never two.**

| State | `WEBSIM_REQUIRE_ARTIFACTS` | What happens |
|---|---|---|
| every artifact present | either | the suite runs, unchanged |
| an artifact missing | off / unset | vitest reports the suite as **skipped** (never as passed) **and** a `!!`-prefixed banner is printed to stderr — attributed by vitest to the test file — naming the gate, the suite, the evidence forgone, each missing path, what it is, and the command that produces it |
| an artifact missing | on | a real **failing test** carrying that same banner. The original suite body is not collected, so the failure reported is the policy violation rather than an incidental `ENOENT` |

**3. The env var is parsed strictly.** `1|true|yes|on` enables it, `0|false|no|off`
and unset disable it, and **anything else throws**. Reading a typo as "off" would
hand back the silent pass this policy exists to remove, so `WEBSIM_REQUIRE_ARTIFACTS=ture`
is an error, not a default.

**4. Which CI job sets it.** A job without the artifacts (the hosted `build` and
`cross-engine` jobs — a clean clone) leaves it off and gets loud, reported skips; the
`strict-artifacts` job, which runs on a runner that holds the data, sets it to `1`, so
an artifact that silently stops being produced turns CI red instead of turning it
quiet. Locally, `npm run test:strict` is the same thing on any platform.

**5. Reduced sets are covered too.** Inside a satisfied gate, a suite that walks a
list of fixtures uses `gatedFixturePresent()`, which announces an individual absent
member by name and throws under strict mode — so "the fixture list quietly shrank"
cannot pass either.

**6. The policy cannot be routed around.** A scan in the same test file walks every
`*.test.ts` in the tree (comments stripped) and fails on any direct
`describe.skip` / `.skipIf` / `.runIf` / `.todo`. A gate reached that way is invisible
in CI output and cannot be flipped to failing by the env var, so it is banned; exactly
one file is exempt (the test that seeds those spellings to prove the scan works) and
the exemption list is itself asserted.

**7. The policy is proven able to fail.**
[`tools/test/artifact-gate.test.ts`](tools/test/artifact-gate.test.ts) unit-tests the
decision function, the parse and the banner, and then spawns a **real child vitest
run** over a fixture that declares one gate on a committed file and one on a path
that is never created. Off, the child exits 0 with the hidden gate skipped and the
banner in its output; on, the same state exits non-zero — and the satisfied gate
still passes in both, so strict mode is shown not to be fail-everything.

Measured on this machine: with every artifact present, `npm test` and
`npm run test:strict` are both green. With `pipeline/out/` and `pipeline/local-raw/`
hidden, `npm test` exits 0 with 43 tests reported skipped across 9 files and 18 loud
banners; `npm run test:strict` on the identical tree exits non-zero with 16 failures,
one per gate, each naming its gate id.

### 8.2 Scratch guard

`pipeline/out/` is the only directory the builders may write to, which makes it the
directory every test reaching for a temporary file lands in — and it is git-ignored in
full, so anything left there never appears in `git status`. That is not merely untidy.
`pipeline/test/reproducibility.test.ts` carries the scar: its artifact gate used to
probe `pipeline/out` itself, another suite re-created that directory mid-run, and the
gate then decided the artifacts were present when they were not. Stale scratch under
`out/` can flip an artifact gate's verdict, so §8.1's guarantees rest on this one.

`npm run check:scratch` ([`tools/check-scratch.ts`](tools/check-scratch.ts)) enforces
one rule: every direct child of `pipeline/out` is either an entry on the **allowlist**
of things a documented build step produces, or the sanctioned scratch root `test-tmp/`,
which may exist but must be **empty** when a run ends. Anything else is a violation,
named with the reason and the fix. An allowlist rather than a denylist of known-bad
names, because a denylist only catches the leftovers someone already thought of.

`test-tmp/` is allowed to survive as an empty directory deliberately: several suites
share it and vitest runs them in parallel workers, so "the root must be gone" would be
a race between whichever worker finished last. "The root must be empty" is race-free —
each file removes only what it created — and still catches every byte left behind.

It runs **after** `npm test` in `npm run ci` and in both the `build` and
`strict-artifacts` CI jobs, and it is not itself a test: while vitest is running,
other workers are still writing, so the end state is only observable from outside the
runner. Its own logic is unit-tested against a fake filesystem and end to end against
a real fixture tree, where a dirty tree is shown to exit 1 and the same tree exits 0
once cleaned — a guard wired into CI that cannot be shown to fail is decoration.

Two real leaks were found by writing it, and both are fixed: `graph-asset.test.ts`
freed its temp tree from `process.on("beforeExit", …)`, which never fires inside a
pooled vitest worker, so `out/test-tmp/graph-asset/dump/` had survived every run this
tree has ever made; and five directories left by clean-clone simulations that moved
`pipeline/out` aside and restored it imperfectly. `--clean` removes what it finds.

---

## 9. Layout

```
websim/
  shared/      contract plane: config, schema, manifests, permalink codec
  engine/      deterministic core — no DOM, no clock, no ambient randomness
  pipeline/    offline asset builds (Node + read-only Java exporter); out/ is generated
  app/         UI: run, compare, archive, provenance
  validation/  gate ports, replay harness, divergence report, mutation test
  tools/       repo scripts (claim linter, artifact-gate skip-vs-fail policy)
  docs/        the implementation plan, the engine reference, and decision records
```

`docs/runs/` at the repository root is consumed read-only by `validation/` and is
never copied into this tree. `Geography/` is untouched; the Java exporter compiles
against it out-of-tree.
