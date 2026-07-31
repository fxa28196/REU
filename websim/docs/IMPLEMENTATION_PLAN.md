# IMPLEMENTATION PLAN — `websim/` Browser-Native TypeScript Port + Web UI
## Wildfire Shelter ABM (Repast Simphony → client-side TS, static GitHub Pages deploy)

**Synthesis provenance.** Judge panel split 1–1–1 (fidelity-first / delivery-first /
product-first). Tie broken toward the scientist judge (Judge 1), whose verdict was
**proposal-fidelity-first**. This plan is fidelity-first's architecture and validation
ladder, with every judge-endorsed graft from the two losing proposals folded in where it
does not contradict the winner:

| Graft | Source | Landed in |
|---|---|---|
| Timeboxed spike program with named fallbacks, front-loaded | delivery-first | WP2 |
| Arm-A vertical slice with hard cut line; integration risk in weeks 1–3 | delivery-first | WP7 |
| Harness mutation test (CI must go red on injected seed perturbation) | delivery-first | WP9 |
| Cumulative per-edge segment lengths (Direct only for final partial segment) | delivery-first | §3.6, WP7 |
| Pre-scoped stage-3 cut lines + decision-record escalation charter | delivery-first | §9.3 |
| pushThetaThreshold honesty note (archived executed 0.0 vs corrected −0.25) | delivery-first | §6.4, quirk ledger |
| Archived-instant-display ("Certified Java run" behind every preset) | product-first | §6.2, WP11 |
| Per-tick shuffle *semantics* (MT-drawn Fisher–Yates) as default agent order | product-first | §3.3, Q1 |
| Node-snapped salted-hash encampment asset as public DEFAULT + deploy grep | product/delivery | Q4, WP4 |
| Accessibility as a first-class WP (WCAG 2.2 AA, axe gate, ticker, reduced motion) | product-first | WP13 |
| Permalink codec (base64url config-diff, schema-versioned, seed+tick) | product-first | §6.6, WP12 |
| Zod single-schema consolidation (form = permalink = presets = manifest check) | product-first | §3.1, WP0 |
| Mobile capability gate + archived-playback degradation | product-first | §6.7, WP13 |
| Dual-worker Compare mode (synced clocks, delta cards) | product-first | §6.5, WP10/12 |
| Snapshot/scrub machinery + snapshot-replay byte-identity property test | product-first | §3.5, WP10 |

Retained unchanged from the winner (judges endorsed these explicitly): the Tier 0–4
validation ladder with Tier-1 initial-world bit identity; the fdlibm deterministic-math
module; the Java-exporter graph strategy (edge weights bit-exact by construction); the
four-state badge state machine; the parity/v2 dual formatters; claim-linter from day 1;
colt `nextIntFromTo` verification (W15); the curated ~40 MB LFS validation working set.

**Fixed decisions honored (not relitigated):** browser-native TS engine, client-side;
fully static GitHub Pages deploy, zero backend; Java/Repast stays the certified
instrument and `docs/runs/` (375 MB) is the validation oracle; premade scenarios ship as
one-click presets with archived results as instant-display data; deep customization over
the full ~41-param surface incl. demographic ratios and smoke severity; the four
never-regress gotchas (Evers→Coughlan, Palisades ban, `simulationHours ≤ slices − 1`,
executed-parameter manifest discipline); `Geography/` and all archived outputs untouched
— all web code in new top-level `websim/`; default population 2,037 agents, 1-minute
ticks, up to 455 h.

Authoritative engine reference: `scratchpad/PORT_MAP.md` (all § references below).

---

## 1. Final architecture + stack

### 1.1 Four planes, strictly layered

```
┌────────────────────────────────────────────────────────────────────┐
│ UI plane (websim/app) — React, MapLibre+deck.gl, uPlot             │
│   presets · sliders · map · charts · badge/provenance · permalinks │
├────────────────────────────────────────────────────────────────────┤
│ Contract plane (websim/shared) — ONE Zod schema drives everything  │
│   RunConfig (UI intent) ≠ ExecutedManifest (what the engine ran)   │
│   simulation.json v1-parity + v2-web schemas · asset manifests     │
├────────────────────────────────────────────────────────────────────┤
│ Engine plane (websim/engine) — pure TS, zero DOM, runs in Worker   │
│   deterministic core: 4 RNG streams · CSR graph/Dijkstra · smoke · │
│   agents · shelters · closures · snapshot ring · outcome writer    │
├────────────────────────────────────────────────────────────────────┤
│ Asset plane (websim/pipeline + app/public/assets)                  │
│   offline build: graph.bin (Java-authoritative weights), smoke     │
│   arrays, shelters/closures verbatim, derived encampments,         │
│   archive bundles, build provenance manifest                       │
└────────────────────────────────────────────────────────────────────┘
```

Architectural commitments:

1. **Engine is a pure, synchronous, single-threaded state machine** in one Web Worker.
   Same `RunConfig` + same asset hashes → byte-identical outputs on every browser. No
   RNG, wall-clock, or environment reads inside the engine — everything injected.
2. **Edge weights are never computed in the browser** (and never in Node either — the
   delivery-first `build-graph.ts` reimplementation is rejected per Judges 1–3). The
   offline pipeline runs a read-only **Java exporter** compiled against the certified
   `Geography/` `StreetNetwork` classes; the graph asset carries Java-computed Float64
   lengths, the post-correction node table, adjacency in feature order, polylines, and
   the correction census. Bit-exact by construction; moots GeographicLib `Inverse`
   **for edge weights**. Corrected 2026-07-31: `Inverse` is *not* mooted entirely —
   the build-time snap gap still calls it, and that is precisely where the two
   GeographicLib implementations diverge. Tolerance-equal at 1e-8 m, never
   bit-compared; README §6 divergence 9.
3. **Deterministic transcendentals.** All engine transcendentals (hazard `exp`, utility
   `ln`, z_R decay `pow`, geodesic `Direct` trig) route through a bundled fdlibm-derived
   math module; geographiclib-js is patched/forked to use it. Cross-browser byte
   identity is a CI gate, not an assertion — the mechanism the other two proposals lacked.
4. **Two output formatters, one internal state**: `parity` (Java byte-for-byte: HALF_UP
   decimal, CRLF, `(long)`→trunc, NaN-in-JSON, `door_refusals` name, utilization=final)
   used only by the validation harness; `v2-web` (quirks fixed, schema bumped) for all
   user-facing exports. Number *values* never differ between modes.
5. **Four-state validated badge** (§5.4): ARCHIVE-VALIDATED / ENGINE-CERTIFIED /
   EXPLORATORY / INVALID, driven by executed-manifest matching + in-browser gate results.
6. **Archived-instant-display**: every preset renders the certified Java archived result
   immediately (badged "Certified Java run — commit deddfca lineage") while the live TS
   run computes behind it (badged "Live browser simulation"). Delivery hedge + provenance
   feature: a TS number can never impersonate an archived one, and the symposium demo
   never white-screens.

### 1.2 Tech stack (versions pinned at WP0)

| Layer | Choice | Version | Rationale |
|---|---|---|---|
| Language | TypeScript, strict | 5.6.x | typed contracts between planes |
| Build | Vite | 6.x | static output, Pages base path, worker bundling |
| Tests/CI | Vitest + tsx scripts; GitHub Actions | 3.x | harness runs in Node against `docs/runs/` |
| UI | React | 19.x | boring, stable; UI deliberately thin |
| Config schema | **Zod** | 3.x | one schema = form validation = permalink codec = preset validation = executed-manifest completeness (graft) |
| State | Zustand | 5.x | serializable RunConfig store → manifest diffing |
| Map | MapLibre GL JS + deck.gl | 4.x / 9.x | GPU rendering of 112k street features + up to 6,842 agents; **no external tiles** — the streets asset is the basemap (offline, license-clean) |
| Charts | uPlot + small custom SVG | 1.6.x | 27,300-point series at 60 fps; tiny bundle; dataviz-skill palette rules |
| Worker RPC | Comlink | 4.x | typed facade; engine itself has no Comlink import |
| Geodesic | geographiclib-geodesic (js), **Direct only**, math via fdlibm module | 2.x | Inverse mooted by baked weights |
| RNG | in-house `websim/engine/rng` | — | no third-party PRNG trusted for bit-exactness |
| Formatter | in-house Java `%.Nf` HALF_UP emulator | — | `toFixed` disqualified (`(0.615).toFixed(2) === "0.61"`) |
| A11y tooling | Playwright + axe-core | latest | WCAG 2.2 AA CI gate (graft) |
| Pipeline | Node 22 scripts + Java 17 exporter harness | — | instrument exports its own graph truth |

Explicit non-choices: no WASM in v1 (escalation behind measured budgets + decision
record); no SharedArrayBuffer (COOP/COEP friction on Pages); no RFC-4180 CSV library
(CsvLoader ported verbatim, ~100 lines, §4.2); no external basemap/tile provider.

---

## 2. Repo layout — `websim/` (new top-level directory)

```
websim/
  package.json              # npm workspaces: shared, engine, pipeline, app, validation
  README.md                 # fidelity contract, tier definitions, badge semantics,
                            # divergence register, quirk ledger
  docs/                     # ADRs / decision records (cut-line escalations land here)
  shared/                   # zero-dependency types + THE Zod schema
    src/config.ts           #   RunConfig: all 41 params, explicit, no optionals
    src/schema.ts           #   Zod param schema (single source: form/permalink/presets)
    src/manifest.ts         #   ExecutedManifest, simulation v1-parity + v2-web schemas
    src/assets.ts           #   asset manifest types (sha256, bytes, build commit)
    src/permalink.ts        #   base64url config-diff codec, schema-versioned (graft)
    src/presets/            #   §3 bundles as fully-explicit RunConfig JSON (generated)
  engine/                   # pure deterministic core — no DOM, no Date, no Math.random
    src/rng/                #   JavaRandom, ColtMT19937, streams.ts (4-stream registry)
    src/mathx/              #   fdlibm exp/log/pow/trig; halfUpFormat; truncCast
    src/graph/              #   CSR typed-array graph, binary-heap Dijkstra, paths.ts,
                            #   strtreeSnap.ts (planar degree-space NN), cumLen.ts
    src/smoke/              #   SmokeField (array-backed) + AQS reducer (stage-3 gated)
    src/world/              #   ContextCreator port: build sequence §1.3 steps 1–12
    src/agents/             #   step() §1.5, state machine §1.4, both choosers §1.6.2
    src/shelters/           #   admit(), triage reserve, open windows
    src/closures/           #   wave scheduler + reactToClosureWave §1.6.3
    src/order/              #   agentOrder strategies: shuffle-mt (default) | identity
    src/output/             #   OutcomeLogger port; formatters/parity.ts, formatters/v2.ts
    src/loader/             #   CsvLoader port (§4.2 semantics, byte-tested)
    src/snapshot/           #   SoA + 4-stream-state serialization, ring buffer (graft)
    src/sim.ts              #   tick loop (§1.2 priorities), run/replay API
    test/                   #   unit fixtures incl. hand-checkable facts (§6.1)
  pipeline/                 # offline asset builds — never runs in browser
    java-exporter/          #   read-only Java 17 harness against Geography/ classes:
                            #   corrected graph + Float64 edge lengths + correction
                            #   census + RNG/sampler/world fixture dumps
    scripts/                #   pack-graph.ts, build-smoke.ts, build-shelters.ts,
                            #   build-encampments.ts (public snapped + local raw),
                            #   build-archive-bundles.ts, build-registry.ts (readStrict
                            #   gate), build-presets.ts, checksums.ts, deploy-check.ts
                            #   (greps public assets for raw coords / inc_ids)
    out/                    #   generated assets + assets-manifest.json
  app/                      # UI (Vite root); public/assets/ ← pipeline/out
    src/screens/            #   Run, Compare, Archive, Provenance
    src/mapview/            #   deck.gl layers: streets, agents, shelters, closures, tint
    src/panels/             #   preset picker, slider taxonomy, badge, manifest diff
    src/a11y/               #   live-region ticker, text-mode narrative, reduced motion
  validation/               # the conscience of the project
    harness/                #   ports of verify_E_runs (a)–(l), verify_2026, analyze_run
    replay/                 #   TS engine on archived configs vs docs/runs
    golden-summaries/       #   committed JSON digests of the 375 MB archive
    working-set/            #   curated ~40 MB git-lfs archive subset for hosted CI
    mutation/               #   seed-perturbation mutation test of the harness (graft)
    report/                 #   VALIDATION_REPORT.json consumed by the app badge
```

`docs/runs/` is consumed read-only by `validation/`; never copied into `websim/`, never
shipped raw (only preset display bundles + digests). `Geography/` untouched — the Java
exporter compiles against it out-of-tree.

---

## 3. Engine design

### 3.1 Contract plane

One Zod schema (`shared/src/schema.ts`) is the single source of truth for: UI form
validation, permalink encode/decode, preset generation/validation (a preset missing any
of the 41 params fails a unit test), and the executed-manifest completeness check —
collapsing three drift surfaces into one (graft). `RunConfig` (UI intent) and
`ExecutedManifest` (engine-emitted, post-parse/post-clamp) are distinct types; the diff
between them is a first-class UI surface and a badge input (gotcha 4).

### 3.2 Module breakdown (ports mapped to Java sources)

As fidelity-first §3.1, unchanged: `world/build.ts` ← ContextCreator (12-step order,
fail-fasts incl. the deliberate *absence* of a scenarioCode fail-fast, `_elayer` rewrite);
`agents/step.ts` ← GisAgent (§1.5 order 1–13 verbatim incl. the double concentration
lookup, strict-`>` hours-above vs `>=` z_R/latch, group pace derived not mutated,
`admit()` never speculative); `agents/stateMachine.ts` (§1.4 table; UNREACHABLE terminal
vs REFUSED_ALL_FULL per-tick re-entry; L0 MAX_RETARGETS=8 per-episode; L1 uncapped with
belief set); `graph/*` ← StreetNetwork (adjacency in feature order, strict `<`
relaxation, Java-faithful lazy-deletion binary heap, `blockedAdj.isEmpty()`
short-circuit, `pathToSource`/`coordOffset`, planar degree-space STRtree NN);
`smoke/field.ts` (NaN gaps preserved; NaN/out-of-window → 0.0 + counter; scale applied
once at construction to real values only); `shelters/shelter.ts` (capacity null =
unlimited; `floor(cap×f)` reserve; priority = mobilityLimited only; closed door never
increments refusedCount); `closures/waves.ts` (FIRST_PRIORITY one-shots, hasEdge phantom
guard, full tree recompute in shelter-CSV load order, version bump);
`output/logger.ts` (59-column order §5.1, empty-vs-zero comma discipline, truncation,
sorted-Gini substitution — math-identical, unit-proved); `loader/csv.ts` (§4.2 verbatim).

### 3.3 RNG / determinism contract (the core credibility claim)

Four disjoint streams, exactly §1.8:

1. **`JavaRandom`** — bit-exact `java.util.Random`: 48-bit LCG, split hi/lo 24-bit fast
   path + BigInt reference implementation (tests only); `nextDouble` 53-bit,
   `nextInt(bound)` rejection, Marsaglia polar `nextGaussian` **with cached deviate**.
   Acceptance: 10^7-draw fixtures from real Java for seeds {0, 42, −1, 2^31−1,
   sampler-derived}, exact match.
2. **`ColtMT19937`** — bit-exact colt MersenneTwister as used by `RandomHelper`,
   including colt's exact `nextIntFromTo` scaling semantics **verified against colt
   source + Java fixture dump before any dependent work** (W15 — acceptance criterion,
   not footnote).
3. **Stream registry**: default `ColtMT19937(randomSeed)` — (a) one
   `nextIntFromTo(0, nCamps−1)` per resident at build; (b) **the per-tick agent-order
   permutation** (see below). `PopulationSampler = JavaRandom(seed*1000003 + 17)`;
   `ELayerSampler = JavaRandom(seed*1000003 + 7919)`; per-agent
   `JavaRandom(runSeed*2654435761 + index*104729)` with Java 64-bit signed overflow via
   `BigInt.asIntN(64, …)` at seed derivation only.
4. **Draw-order contracts as executable tests**: PopulationSampler's fixed 8-draw
   per-resident order (unconditional 7th chronicPhysical draw; Gaussian rejection ≤ 100
   then clamp-mean); ELayerSampler's 5 unconditional draws (sigma=0 still consumes the θ
   draw — the R3 null depends on it). Java fixtures for n=6,842 at seeds 42–44.

**Within-tick agent order (GRAFT — supersedes fidelity-first's fixed creation order):**
default strategy `shuffle-mt` = our own documented Fisher–Yates permutation drawing from
the colt MT default stream each tick — replicating Repast's shuffle *semantics*
(distributionally faithful arm-A admission contention) without reverse-engineering
Repast's scheduler internals. An `identity` strategy (creation order) is retained **only**
for engine-internal determinism tests; the product never exposes the switch. Tier-4
divergence attribution is unchanged: the declared, sole Java-vs-TS divergence channel
remains within-tick ordering where capacity binds (arm A) or L0 exact-distance ties.
Build-time draws precede tick 1, so **Tier-1 initial-world identity is unaffected**, and
per-agent decision streams remain shuffle-invariant by Java's own design.

Determinism rules: no `Math.random` anywhere; no `Map`/`Set` iteration on
outcome-relevant paths (lint rule); every outcome-relevant collection is an explicit
array in load/creation order; all transcendentals via fdlibm; same config run twice, on
Chrome/Firefox/WebKit/Node → byte-identical outputs (CI gate).

### 3.4 Worker topology

- **`sim-worker` (1)**: owns the engine. Commands: `init(assets, config)`,
  `run(untilTick | toEnd)`, `pause`, `scrubTo(tick)`, `snapshot()`,
  `exportOutputs(parity|v2)`. Emits frame batches (Float32 positions, state bytes,
  occupancy vector, smoke now) as transferable ArrayBuffers at UI-chosen decimation;
  metric stream per sim-hour; wave-progress events ("recomputing routes…").
- **`sssp-pool` (min(cores−2, 4))**: closure-wave shelter-tree recomputes only — each
  tree a pure function of (graph, blocked set, source); results applied in shelter-CSV
  load order before any agent steps that tick (§1.2 preserved). Build-time trees too.
- **Compare mode**: a second `sim-worker` instance, synced clocks, delta cards (graft).
- UI thread renders only; it never computes model numbers.

### 3.5 Snapshot / scrub machinery (graft, product-first)

Snapshot = copy of the SoA buffers + shelter occupancy + **all four RNG stream states**
(JavaRandom: 48-bit seed + Gaussian cache; MT: 624 words + index) + tick + counters.
Ring of 8 + sparse hourly index (~2–6 MB each). Property test gates the feature:
`snapshot at S, replay to T` must be **byte-identical** to a straight run to T for random
(S, T) — this passes **before** any pause/scrub UI ships. Scrub-back = restore nearest
keyframe + fast-forward.

### 3.6 Data structures + hot-loop budget

CSR typed-array graph (88,100 nodes / 218,868 directed edge records): `nodeId:
Float64Array` (ids incl. negatives, exact ≤ 2^53), `adjOffset/adjEdge/edgeOther:
Int32Array`, `edgeLenM: Float64Array` (Java-authoritative), delta-decoded polyline
vertex pool, per-shelter `dist: Float64Array` + `predEdge: Int32Array` (46 × 88,100 ×
12 B ≈ 49 MB, retained for instant re-plans). Agents SoA for hot fields; per-agent
accumulation order = tick order, matching Java.

**Movement hot path (graft, delivery-first):** precomputed per-edge cumulative segment
lengths so vertex-to-vertex consumption is pure array arithmetic; geodesic `Direct` is
called only for the final partial segment of each tick's movement — same polyline, same
remaining distance, most geodesic calls removed from the loop.
Per-tick param reads hoisted (Repast re-reads are platform artifact, not semantics).
**Measured by DR-S3, and two corrections to the wording above:** (a) the graft is worth
**3.9×** — the literal Java loop does 2.60 `Inverse` + 0.99 `Direct` per agent-tick and
would put the default preset at ~134 s, i.e. a MISS before any derate; (b) the graft is
mathematically equivalent but **NOT bit-equivalent** to the Java carry-forward loop
(~1e-9 m per tick; see DR-S3 finding S3-F2), so WP7's per-agent `distanceTraveledM` and
coordinate gates must be tolerance comparisons, never bit-identity. The remaining single
`Direct` is **95.1% of tick-loop wall**; the shipped path must materialise the display
coordinate on demand (render frames + plan/reroute, where `GisAgent.java:518` reads it)
rather than every tick — that is the difference between 31.85 s and 2.14 s.

**Performance budgets (delivery-first's conservative numbers adopted; measured, not
asserted — spike S3 + WP7 go/no-go):** default preset 2,037 × 312 h (38.1 M agent-ticks)
≤ 60 s; worst case 6,842 × 455 h (≈ 1.9·10^8 agent-ticks + 6 waves) ≤ 8 min with
progress UI; closure wave (46 SSSPs) ≤ 5 s wall on the pool (~0.5–1.5 s target).
Escalation ladder (each step requires a decision record, §9.3): hoist/pool tuning →
SSSP pool widening → Rust/WASM Dijkstra + movement kernel behind the same TS interface
(identical fixture suite must stay green).

---

## 4. Offline data-preprocessing pipeline (`websim/pipeline`)

All assets carry `{sha256, bytes, source_file, source_sha256, build_commit, built_utc,
tool_versions}` in `assets-manifest.json`, embedded at app build and **verified against
fetched bytes at load** (SubtleCrypto; mismatch blocks the run).

| Asset | Builder | Contents / format | Wire size |
|---|---|---|---|
| `graph.bin` | **java-exporter** (runs certified `StreetNetwork` build: reprojection, `getGeometryN(0)`, U-27 freeway filter {1110,1120,1121,1122,1123}, full corrupt-ID correction in record order, geodesic weights) → `pack-graph.ts` | sectioned binary: node table (ids incl. −1000… synthetics), CSR, **bit-exact Java Float64 edge lengths**, delta-encoded int32 1e-7° polylines, name table; display-only features in a render section | ~2–2.5 MB br |
| `graph-corrections.json` | exporter passthrough | correction census (**3 reattached, 22 split synthetic** — corrected from 4/23 by DR-S2, which are the *pre-U-27* counts; impossible 50→0, max gap 18.5 km→11.9 m) for Provenance + manifest | ~50 KB |
| `smoke-{0,1,2}.json` | `build-smoke.ts` (SmokeField reducer port; cross-checked vs Java) | `{series, slices, hourly:(number|null)[], embedded_scale, anchor, counterfactual_label, provenance_sidecar}`; null encodes NaN. Acceptance: 576/456/456 slices, peaks 562.7 / 984.75 / 2,496.1 | ≤ 10 KB ea |
| `shelters/*.csv`, `closures/*.csv` | verbatim | parsed in-browser by the ported CsvLoader (keeps loader parity honest) + scenarioCode→file index per §3.1 | ~240 KB |
| `encampments-public.bin` | `build-encampments.ts` | **PUBLIC DEFAULT (graft): coordinates snapped to nearest street node** (same degree-space NN as the engine), deduped per node, `inc_id` → salted SHA-256/12-hex (salt withheld/destroyed), dates + vehicle flags dropped. Display layer: ≥150 m grid density only — the map never renders points. Raw CSV confined to the **git-ignored local validation path**. An exact-coordinate opaque engine binary exists as a specced upgrade shipped **only with explicit mentor/IRB sign-off** (restores camp-assignment/snap_gap_m Tier-1 identity). | ~40–60 KB |
| `registry-snapshot.json` | `build-registry.ts` runs full `readStrict` governance validation; **failure fails the asset build** | validated censuses + file SHAs for the manifest governance block | ~20 KB |
| `presets/*.json` | generated from §3 bundles via the Zod schema | fully-explicit RunConfig, 41/41 params, zero fallbacks; CI-diffed against archived manifests | ~40 KB |
| `archive-bundles/*.json` | `build-archive-bundles.ts` digests `docs/runs/` | per archived config: headline metrics, hourly state census, occupancy series, exposure histogram, shelters table — instant display + overlay | ~100–200 KB ea, lazy |
| `golden-summaries/*.json` | same digester | 9-seed envelopes, marginals, 54,002.8 identity facts for harness + badge | ~50 KB |

`deploy-check.ts` (graft): the deploy pipeline **greps every public asset for raw
coordinates and raw `inc_id`s** and fails hard on a hit. Pipeline self-tests assert the
§4.3 survive-format-change checklist (trim/BOM/padding, capacity blank=unlimited,
close-date +1 day, floor() reserve, freeway TYPE set, name fallback, NaN-gap→0+counter,
`min(simulationHours, hours())`, closure fail-fasts, degree-space NN).

Total first-load budget < 4 MB wire; archive bundles lazy per preset.

**Validation-fidelity note (public vs local):** public builds use node-snapped starts,
so live public runs are ENGINE-CERTIFIED at best against the *snapped* configuration;
full Tier-1/Tier-4 validation runs locally against raw-offset coordinates. `snap_gap_m`
collapses to ~0 on public builds — documented in the quirk ledger and excluded from
public-build parity checks (walked ≤ planned + snap + 200 m bound already absorbs it;
max observed residual 8.9 m). If sign-off lands for the exact-coordinate binary, public
runs upgrade to the validated configuration and this note retires.

---

## 5. Validation strategy vs the Java golden archive

### 5.1 Tier ladder (winner's, unchanged)

- **Tier 0 — component bit-parity (CI, every push):** RNG fixture identity (10^7 draws ×
  generators × seeds); sampler draw-order fixtures (n=6,842 dumps, seeds 42–44,
  byte-equal); CsvLoader adversarial byte fixtures; HALF_UP formatter vs Java
  `String.format` fixture table incl. tie classes; edge lengths identical by
  construction, spot-audited; fdlibm cross-engine identity.
- **Tier 1 — initial-world identity (CI):** full world build at archived configs →
  camp-assignment vector, demographic table, E-attribute table, decision seeds, shelter
  trees' distance arrays, snap **node** assignments **bit-equal** to Java-exported dumps
  (achievable because build consumes no shuffled RNG). Converts any statistical failure
  downstream into exact fault localization. **Exception, measured:** the `snap_gap_m`
  *distance* is a geodesic and is tolerance-equal at 1e-8 m, not bit-equal — 6,390 of
  6,842 agent rows differ in bits at A-seed42, max |Δ| 3.181e-9 m. The node choice,
  which is what routing reads, is exact (3,908/3,908). README §6 divergence 9.
- **Tier 2 — own-engine R3 (CI):** TS E0-degenerate run vs TS no-layer run:
  shared-column projection **byte-identical** under `verify_E_runs.py` (a) exclusion
  discipline (excluding only sim_id/commit/wallclock — never the `*_local` columns).
  Plus deterministic-replay gate (same config twice, Chrome/Firefox/WebKit/Node →
  byte-identical) and the snapshot-replay property (§3.5).
- **Tier 3 — statistical cross-validation vs archive (CI on working set; nightly full):**
  sheltered counts within 9-seed archive ranges; `unreachable` identical across arms
  within seed and its id-set hash equal to Java's (exact — the world is Tier-1
  identical); realised marginals **equal, not close** (sampler bit-exact; at n=6,842
  seed 42 the archived values are mobility 0.1988, asthma 0.1478, COPD 0.1079, any-resp
  0.2381, 55+ 0.2622, mean speed 1.2805 — **0.195/0.147/0.104/0.235/0.259/1.280 is
  seed 48**, see finding F1-F1 in `DR-F1-world-fixtures.md`); 54,002.8 µg·m⁻³·h
  never-sheltered identity exact; dose ≡ exposure × 0.61 to FP
  precision; U-03 bed-sum; capacity sums per arm; counter identities (l);
  out_of_range_lookups == 0 on severe series.
- **Tier 4 — structural identity where the shuffle is inert (measured, reported):** arms
  where capacity never binds (B, C expected — verified empirically) should reproduce
  per-agent rows exactly (key-joined, parity formatter). The replay harness publishes,
  per archived config, the exact bit-match census; **any divergence not attributable to
  the declared within-tick-order channel is a release-blocking bug.**

Release gate: Tiers 0–3 green in CI; Tier-4 report reviewed with zero unexplained
divergences.

### 5.2 Ported gate suite → CI

`validation/harness/` reimplements against raw-text frames (`keep_default_na`
semantics): **verify_E_runs (a)–(l)** — (a) R3 identity, (b) U-03 4-way bed sum,
(c) asthma negative control, (d) terminal-state conservation, (e) UNAWARE immobility,
(f) Wachinger acceptance, (g) E-census plausibility (3 binomial SE + 1e-4), (h)/(i)
manifest completeness (21 E + 7 SE params), (j) severe-series provenance (456 slices,
peak scaling ±0.06, **oor==0** — the gate that caught 456-vs-455), (k) closure census vs
schedule, (l) counter identities incl. `blockages == push_throughs + reroutes`;
**verify_2026**: capacity sums (A 2,234; B/C 6,842), data_version_tag constancy,
POP_COLS cross-arm hash, UNREACHABLE id-set hash; **analyze_run**: recomputed stats atol
0.51 / gini 5e-3, vwe≡dose < 1e-6, travel-time identity < 0.05, peak bounds, RRs 1.0,
walked ≤ planned + snap + 200 m. Smoke-builder 19-check and closure-builder S1/S2/S3
connectivity fixtures validate the packed assets.

**In-browser after every user run** (cheap subset, feeds the badge): (b), (d), (e), (l),
oor==0, bed-sum.

**Harness mutation test (graft, CI-blocking):** a CI job injects a seed perturbation
(and one formatter perturbation) into a replay and asserts the gate suite goes **red** —
the gates are proven able to fail, never observed-green-by-vacuity.

### 5.3 CI matrix + anti-regression

Unit/Tier-0 on every push. Tiers 1–3 + mutation test on engine-touching PRs against the
curated **~40 MB git-lfs working set** (A/B/C seed42, ER-A-42, SE-E18-42, SE2-E18-d1-42,
E0 nulls — every gate class covered). Nightly full-archive job on a self-hosted/local
runner over the 375 MB archive. Harness degrades **loudly** if archive data is absent —
never skips silently. Claim-linter (bans "Evers et al. 2022", Palisades-comparison
phrasing, "37/37"-class retired phrases) runs on all `websim/**` strings **from WP0,
day 1**. Three-browser byte-identity job on 5 configs. axe-core WCAG gate on the app.
Deploy job runs `deploy-check.ts` (raw-coordinate/inc_id grep) before Pages publish.

> **IMPLEMENTATION NOTE — skip-vs-fail policy (websim copy; not part of the
> authoritative plan text above).** "Degrades **loudly** … never skips silently" is
> implemented once, in `websim/tools/artifact-gate.ts`, and every artifact-gated
> suite in the tree is declared through it. A gate cannot be constructed without a
> stable id, a suite title, a sentence naming **the evidence forgone**, and at least
> one artifact carrying an absolute probe path plus a key into the source catalogue
> (which holds the "how do I produce this?" answer once). Outcomes:
>
> - artifacts present → the suite runs;
> - artifacts absent, `WEBSIM_REQUIRE_ARTIFACTS` off → vitest reports the suite as
>   **skipped** (never as passed) and a `!!`-prefixed, file-attributed banner naming
>   the gate, the forgone evidence, each missing path and its produce command is
>   written to stderr;
> - artifacts absent, `WEBSIM_REQUIRE_ARTIFACTS` on → a **real failing test** carrying
>   that banner; the original body is not collected, so the reported failure is the
>   policy violation and not an incidental `ENOENT`.
>
> The variable is parsed strictly (`1|true|yes|on` / `0|false|no|off`; anything else
> throws) so a typo cannot silently restore the permissive setting. CI: the hosted
> jobs are a clean clone and set it to `"0"` explicitly, recording that they run
> degraded; the `strict-artifacts` job — the self-hosted/local runner this section
> already calls for — sets it to `"1"`, which is what makes these gates provably able
> to fail rather than observed-green-by-vacuity (§5.2). `npm run test:strict` is the
> local equivalent. Suites that walk a fixture list use `gatedFixturePresent()`, which
> announces an individually absent member and throws under strict mode, so a silently
> shrinking fixture set is covered too. The policy is also unroutable-around: a scan
> over every `*.test.ts` (comments stripped) fails on any direct
> `describe.skip`/`.skipIf`/`.runIf`/`.todo`, with one asserted exemption for the file
> that seeds those spellings to prove the scan works. The policy's own proof lives in
> `websim/tools/test/artifact-gate.test.ts`: it spawns a real child vitest run over a
> fixture with one satisfied gate and one deliberately-hidden gate, and asserts exit 0
> + banner + skip with the variable off, and non-zero + banner with it on — while the
> satisfied gate passes in both, so strict mode is shown not to be fail-everything.
> Documented for users in `websim/README.md` §8.1.

### 5.4 Badge state machine (user-visible, earned per configuration)

- **ARCHIVE-VALIDATED (green):** executed manifest (params + asset SHAs) exactly matches
  an archived bundle config AND this build's replay passed Tiers 1–4 in the shipped
  `VALIDATION_REPORT.json` AND the just-completed run's in-browser gates passed. Popover:
  archived family/dir, tier results, Tier-4 bit-match census, archived-vs-live headline
  side-by-side.
- **ENGINE-CERTIFIED (blue):** custom config inside the validated envelope (params
  within swept/published registry ranges; stock assets), in-browser gates passed,
  deterministic replay token issued.
- **EXPLORATORY (amber):** outside the envelope (out-of-range params, custom smoke,
  smokeScale ≠ preset values, demographic-constant overrides). Explicit "not validated
  against the Java instrument" banner.
- **INVALID (red):** any in-browser gate failure, `out_of_range_lookups > 0`, or
  non-empty executed-vs-configured diff. Charts watermarked; exports annotated; never
  silently presented.

---

## 6. UI/UX spec

### 6.1 Screens

1. **Run** (default): left rail = preset picker grouped as §3.3 bundles (Three-arm
   A/B/C, Arm D triage, Bed sweep, Window arms, C-random/pool, Historical, Phase-E ER,
   Scenario E severe v1, SE2 worst-plausible + nc controls, E0 null) + slider drawer;
   center = map; right = live panel (state-census stacked area, per-shelter occupancy,
   smoke strip with NaN gaps rendered as gaps, badge); bottom = tick scrubber with wave
   markers, play/pause, speed 1×–600×, "compute to end".
2. **Compare**: two slots — live vs live (dual workers, synced clocks) or live vs
   archived bundle; delta metric cards (Δ sheltered, Δ person-hours, Δ mean walk);
   overlaid series; per-shelter diverging bars. Closure-family results always render as
   **ranges across draws** (V48/A-34) — the UI refuses single-schedule presentation for
   multi-draw families. Compare of A-seed42 archived vs live is the flagship public
   validation demo.
3. **Archive**: browse shipped bundles (instant, zero compute) with provenance (commit
   lineage, seed, data_version_tag); "Replay in browser" → Run screen preloaded, so
   users watch the badge earn itself.
4. **Provenance**: registry browser (55 variables / 35 assumptions, evidence classes,
   DOIs — **Coughlan et al. 2022** for γ_vuln); graph correction census; smoke
   provenance incl. counterfactual sidecars; engine build manifest; validation
   scoreboard; last run's **configured-vs-executed diff view** (the negative-zeroing
   lesson made visible); quirk ledger.

### 6.2 Archived-instant-display (graft)

Selecting any preset immediately renders the certified Java archived numbers and series
(badge: "Certified Java run") while the live TS run computes behind a progress surface
(badge: "Live browser simulation"). On completion the live result slots alongside — never
replacing the archived provenance class silently. Perf misses and mid-demo failures
degrade to certified-data display, not a blank screen.

### 6.3 Slider taxonomy — progressive disclosure (three levels)

- **Core**: scenario (dropdown of the §3.1 registry — no free-typed codes), numAgents
  (50–6,842, default 2,037), randomSeed (default 42; "randomize" action displays the
  drawn seed before running), simulationHours (**max bound structurally = selected
  series slices − 1**: 575/455/455, re-clamped with explanatory toast on series change),
  smokeSeriesCode (labeled "Observed 2020" / "Severe v1 — CONSTRUCTED" /
  "Worst-plausible v2 — CONSTRUCTED (Canberra-anchored)"), smokeScale (0.25–3.0, shows
  **effective severity = embedded × scale** and projected peak; counterfactual banner
  whenever ≠ observed × 1.0).
- **Demographics & movement**: enableHeterogeneity, walkingSpeedMps (greyed when
  heterogeneity ON, with explanation), groupSpeedDeltaMps; advanced sub-drawer exposes
  the sampled-constant surface (age/sex weights, mobility/asthma/COPD priors) — any
  change flips the badge to EXPLORATORY and is flagged "departs from published sampling
  targets".
- **Shelters & policy**: respectShelterOpeningDates, triageReserveFraction,
  shelterPolicyVariant, petPolicyDefault. `shelterArrivalDistanceM` is **never a
  control** (dead param, V-ARRIVAL) — manifest-only, annotated deprecated.
- **Decision layer (Phase E)**: master switch + the 19 V29–V45 params with sourced
  ranges as slider bounds, sourced-value chips, and one-click "baseline-real" / "E0
  null" fills.
- **Closures (Scenario E)**: closuresCode dropdown, closureDraw (enabled only for code
  3), pStuck, stuckDelayH, pushThetaThreshold (full negative range — the UI cannot
  reproduce the batch negative-zeroing defect; the executed manifest still proves
  executed values), kPush.

Every preset writes **all 41 parameters explicitly** (R7: a difference between two
configs is the only thing that can explain a difference between two runs). A "modified
from preset" diff chip lists deviations.

### 6.4 Honesty framing

Persistent "Certified Java run" vs "Live browser simulation" badging everywhere numbers
appear; mandatory "CONSTRUCTED COUNTERFACTUAL — NOT MEASURED DATA" chips on series 1/2
across map, charts, and exports; 55.5 µg/m³ always labeled a concentration threshold,
never an AQI category; smoke tint honest about A-01 (county-uniform scalar, not a plume —
tooltip says so). **pushThetaThreshold honesty note (graft):** the SE/SE2 preset UI and
quirk ledger state that archived runs *executed* `pushThetaThreshold = 0.0` (Repast
negative-"number" parser defect, inert — zero blockage events) while web presets carry
the corrected −0.25, so live-vs-archived closure comparisons are framed correctly.

### 6.5 Map + charts

deck.gl over MapLibre blank style: streets PathLayer from the graph asset (freeways
de-emphasized + "excluded from graph" legend), encampment **density grid only** (never
points), shelters (icon sized by capacity, occupancy ring, triage-reserve arc,
open/closed by tick), agents (instanced ScatterplotLayer from transferable Float32
positions, colorblind-safe state colors; SHELTERED collapse into shelter counters),
closure edges (flash at wave tick, persistent hatched overlay), county-uniform smoke
scrim. Charts (uPlot, dataviz palette rules): state census stacked area; concentration
strip with 55.5 line; per-shelter occupancy small multiples; exposure histogram + Gini;
arrivals/refusals event rug; closure counter panel showing the
`blockages = push_throughs + reroutes` identity live.

### 6.6 Permalinks + exports (graft)

Permalink = `#p=<presetId>&d=<base64url(zod-diff)>&seed=…&t=<tick>` — config diff vs
preset, schema-version-stamped; stale links show a migration notice; Compare links
encode both configs; archived-preset links render instantly. Pairs with the
deterministic replay token (config hash ‖ engine version ‖ asset SHAs). Exports: v2-web
`agents.csv`/`shelters.csv`/`simulation.v2.json` + executed manifest + replay token;
parity-format export behind a "for validation" toggle.

### 6.7 Accessibility + mobile (graft, first-class)

WCAG 2.2 AA with an axe CI gate; full keyboard operation of timeline and panels; every
slider a real `<input type=range>` with visible value + units; live-region textual
ticker ("Hour 79: closure wave 1; 412 sheltered; PM2.5 562 µg/m³"); charts with
data-table toggles; `prefers-reduced-motion` swaps agent animation for state-census flow
charts; color never the sole channel; text-mode run narrative mirrors map events.
Mobile: device-capability gate (memory check + 2-second micro-benchmark) with an honest
"this computes a research model on your device" dialog; archived-bundle display and
playback always work on phones; 2,037-agent live runs allowed on passing devices;
6,842 desktop-recommended.

---

## 7. DECISION TABLE — all 12 open questions

| # | Question | DECISION | Rationale | Source |
|---|---|---|---|---|
| Q1 | Fidelity tier | Own-engine determinism + Tier 0–4 ladder is the certification basis; Java-archive byte-identity is **not** a goal. Bit-exact `java.util.Random` + colt MT19937 + Tier-1 initial-world bit identity ARE goals (cheap, fixture-verifiable). **Default within-tick order = `shuffle-mt`** (Fisher–Yates permutation drawn from the colt MT default stream — Repast's shuffle *semantics*, not its algorithm); `identity` order retained for internal determinism tests only. Tier 4 measures and attributes residual divergence; anything unexplained by the declared order channel is release-blocking. A Repast-shuffle byte-identity attempt is a pre-scoped post-v1 cut line. | The shuffle's only coupling is within-tick ordering (arm-A admissions, L0 ties); cloning Repast scheduler internals is unbounded and buys nothing scientific. MT-drawn permutation removes fidelity-first's systematic same-agents-first admission bias at trivial cost (Judges 1–3 all endorsed). | fidelity-first + product-first graft |
| Q2 | Default parameter set | Fresh UI runs mirror the **GUI schema / final study config** (heterogeneity ON, opening dates ON), with two deliberate deviations: randomSeed pinned to 42 (never `__NULL__`) and numAgents = 2,037 (fixed decision). Every preset and fresh run writes all 41 params explicitly; no browser path ever exercises a batch fallback (fallbacks exist in the engine for fidelity, flagged if ever hit). | Study config is the scientifically endorsed configuration; batch fallbacks are a Repast schema artifact. Unpinned seeds are non-reproducible. All three proposals agreed. | unanimous (fidelity-first wording) |
| Q3 | RLIS license | Resolve with Metro **first**: written determination is WP1's first deliverable, filed day 1, async (never blocks engine work). Deploys stay non-public/unlisted until written OK. Only on refusal/timebox expiry: OSM rebuild behind the same `graph.bin` interface, with explicit validation downgrade (loss of node-id reproducibility; Tier 1/4 graph claims dropped to Tier-3 epsilon corridor) stated on the badge and recorded as a decision record. `graph.bin` is treated as redistribution — no "it's transformed" shortcut. | Node ids, the corrupt-ID correction, and the whole Tier-1+ story hang on the RLIS graph; OSM would orphan the 375 MB oracle. Fallback costs claims, so real effort goes to the license path. | fidelity-first + delivery-first (async spike) |
| Q4 | Encampment data policy | **Public DEFAULT = node-snapped coordinates** (nearest street node, the sim-relevant quantity), deduped, `inc_id` → salted hash (salt withheld), dates/vehicle flags dropped; display always ≥150 m grid density, never points; raw CSV confined to the git-ignored local validation path where full-fidelity checks run; automated deploy grep for raw coords/inc_ids. Fidelity-first's exact-coordinate opaque engine binary remains a specced upgrade that ships **only with explicit mentor/IRB sign-off** (restores camp-assignment + snap_gap_m Tier-1 identity on public builds). A raw-coordinate public layer is never acceptable — not togglable, not Easter-egged. | 3,400 precise current complaint-reported locations = targeting/sweep risk (R1, ship-blocker). Judges 1 and 2 both endorsed flipping the default to snapped + sign-off-conditional exact asset. Node-snapping preserves start-node assignment exactly; only snap_gap_m collapses (documented). | product/delivery graft over fidelity-first fallback |
| Q5 | Browser manifest | New schema `reu-wildfire-shelter-abm/simulation/v2-web` + a parity emitter for validation only. Build-time embedded: websim git commit + dirty flag, engine version, asset SHA-256s (verified at load — mismatch blocks the run), tool versions, source-file SHAs. Runtime: `generated_utc` true UTC (parity mode reproduces the local-time quirk), `sim_id` = deterministic hash(executed params ‖ engine version ‖ asset SHAs) plus a separate wall-clock field, `java_version` → `"n/a"` + `engine: "websim-ts x.y.z"`. **ExecutedManifest is emitted by the engine from the values it actually used** — never from the UI store — and the UI renders the configured-vs-executed diff. | Direct transfer of the negative-zeroing lesson (gotcha 4); deterministic sim_id makes the replay token real. | fidelity-first |
| Q6 | Output quirks | Reproduce-then-fix, per item, one internal state, two formatters: parity reproduces all seven output quirks (NaN-in-JSON strata, `door_refusals` naming, utilization=final, generated_utc local, jsonEsc incompleteness, CRLF, HALF_UP); v2-web fixes them (null strata, `retarget_count_at_end` + note, `utilization_final`+`utilization_peak`, true UTC, full escaping, LF) — number values never differ, only representation/keys; each fix listed in the v2 changelog with its parity counterpart. **Engine-semantics quirks are NOT formatting and are reproduced in both modes forever**: the double concentration lookup / oor double-increment and closed-door-not-counted-refused (changing them changes physics/counters and breaks Tier 3). HALF_UP formatter used in both modes; `toFixed` never. | Parity keeps the archive diffable; v2 keeps consumers sane; the semantics/formatting boundary from product-first's table sharpens the winner's rule. | fidelity-first + product/delivery per-item tables |
| Q7 | Performance architecture | Single sim-worker (determinism) + SSSP worker pool for tree recomputes; typed-array SoA + CSR; fdlibm transcendentals; sorted O(n log n) Gini (sanctioned identical math, unit-proved to 0 ulp vs O(n²)); cumulative-segment-length hoist of geodesic Direct; params hoisted; no SharedArrayBuffer; **no WASM in v1**. Budgets (conservative, delivery-first's): 2,037×312 h ≤ 60 s; 6,842×455 h ≤ 8 min with progress UI; wave ≤ 5 s. Spike S3 measures on the real graph in week 1; WP7 is the go/no-go; escalation ladder (tune → widen pool → Rust/WASM kernels behind the same interface, fixture suite stays green) requires a decision record. Archived-instant-display caps the product cost of any miss. | Decision by data, not faith; the most credible budgets across the three proposals; demo immune to perf misses. | fidelity-first + delivery-first budgets/ladder + product-first hedge |
| Q8 | U-27 + corrupt-ID correction | Baked into the offline asset, and produced by the **Java instrument itself** via the read-only exporter — the order-dependent correction and the geodesic edge weights are never re-implemented in TS or Node (rejects delivery-first's build-graph.ts self-computation, its single riskiest fidelity decision per all three judges). No runtime toggles. Correction census ships as data for Provenance and the manifest `street_network_validation` block. | Order-dependent, certified-once behavior; re-derivation is pointless risk with zero upside; exporting from Java is *less* work than reimplementing. | fidelity-first (judges unanimous) |
| Q9 | Smoke customization scope | Precomputed hourly arrays for series 0/1/2 at launch (exact SmokeField mean/NaN semantics; validated against Java slice counts/peaks). smokeScale rescales the stored array at construction — NaN preserved, zeros never fabricated; UI always shows effective severity = embedded × scale + projected peak + counterfactual banner. The AQS reducer is ported for the pipeline but "upload your own AQS CSV" is a **pre-scoped stage-3 cut line**, gated on the 19-check smoke fixture suite, forcing EXPLORATORY, and rebinding the hours max to uploaded slices − 1. | Three series + scale cover the scientific envelope; upload is moving code, not writing it, when its time comes. | fidelity-first, upload demoted per delivery-first cut-line discipline |
| Q10 | Governance / ScienceRegistry | Keep the fail-fast, relocated to build time: full `readStrict` + vocabulary/DOI/uncertainty/sensitivity validation runs in the pipeline; **failure fails the asset build** (strictly stronger than failing at page load — nothing invalid can exist). Browser embeds the validated snapshot and emits the full manifest governance block (SHAs, evidence census, blocking ids); Provenance screen renders the registry. In-browser `readStrict` re-port turns on only if a user-modified registry upload ever ships. | Same guarantee, better surface; governance block preserves manifest comparability with the archive. All three proposals agreed. | unanimous (fidelity-first wording) |
| Q11 | CI gates + UI enforcement | CI = full ports of verify_E_runs (a)–(l), the three verify_2026 cross-arm gates, and the analyze_run recomputation battery, run on TS replays of the archived working set, **plus the harness mutation test** (CI must go red on an injected seed perturbation). Cheap invariant subset ((b),(d),(e),(l), oor, bed-sum) runs in-browser after every run and feeds the badge. `simulationHours ≤ slices − 1` enforced structurally (slider max, preset validation, engine fail-fast as last line). `out_of_range_lookups > 0` is not a warning: badge → INVALID, watermarked charts, explanatory error ("run window exceeded smoke data; results contain fabricated zero-concentration hours"). | The gate that caught 456-vs-455 becomes user-visible; the mutation test proves the gate suite can fail. | fidelity-first + delivery-first mutation graft |
| Q12 | GeographicLib in TS | Measure, and remove the dependency where it matters: edge weights baked from Java (Inverse mooted for routing, snapping, and every distance-derived output — identity by construction). Remaining runtime use is `Direct` for the final partial segment only (cumulative-length hoist); geographiclib-js math routed through the fdlibm module (cross-browser bit-stable); build-time **10^6-case differential test** vs Java Direct over sampled (edge, fraction) pairs from the real graph, expected agreement ≲ 1e-9 m, with a knife-edge census (step boundaries within ε of a vertex) published and Tier-4-attributed. Contingency if > 1e-6 m: port Java's `Geodesic.Direct` verbatim (~600 lines of pure double math). | The only proposal set with a mechanism behind cross-browser determinism; movement gets a documented epsilon tier instead of an assumption. | fidelity-first + delivery-first hot-loop graft |

---

## 8. Work packages (strict dependency order)

Critical path: WP0 → WP2 → WP3 → WP4 → WP5 → WP6 → **WP7 (vertical slice, go/no-go)** →
WP8 → {WP9, WP10, WP11} → WP12 → WP13 → WP14. WP1 runs parallel from day 1 and gates
*publication* only. UI mockups may start any time; no downstream engine work starts
before WP7's cut line clears.

**WP0 — Scaffold + contracts + linter (S).**
Scope: npm workspaces, CI skeleton, the single Zod schema, RunConfig/ExecutedManifest/
asset-manifest types, permalink codec skeleton, claim-linter wired on all `websim/**`
strings (Evers ban, Palisades ban, retired phrases).
Deliverables: `shared/` package; green CI; lint job.
Acceptance: CI green from clean clone; linter catches seeded violations; all 41 params
typed with V-number source annotations; a preset missing any param fails a unit test.

**WP1 — Rights, ethics & hosting track (S, parallel, user-facing; day 1).**
Scope: written RLIS redistribution determination from Metro; encampment derived-product
policy memo (Q4 options incl. sign-off-conditional exact-coordinate binary) to
mentor/IRB; hosting/visibility decision (unlisted preview vs public).
Deliverables: go/no-go decision records in `websim/docs/`.
Acceptance: written license outcome filed or timebox expiry → OSM-fallback decision
record; encampment policy signed; blocks WP4 asset *publication* and WP14 public deploy
only — development proceeds on local assets.

**WP2 — Spike program (M, weeks 1–2, all timeboxed with named fallbacks; graft).**
- S1 geodesic Direct parity: Java fixture dump (10k (lat,lon,azi,s) tuples) vs
  fdlibm-routed geographiclib-js. Advisory (weights baked), informs Q12 epsilon.
  Fallback: verbatim Java Direct port.
- S2 Java exporter proof: compile read-only harness against `Geography/` classes; dump
  corrected graph. AC: census match (88,100 / 109,434 / 171 / largest 59,725 / **3
  reattached / 22 synthetic** — 4/23 was the pre-U-27 graph, see DR-S2), wire ≤ 3 MB br,
  worker parse ≤ 1 s. Fallback: split asset (topology now, display polylines lazy).
  **CLOSED** — see `DR-S2-exporter.md`: census exact, fallback invoked on wire size.
- S3 perf harness on the **real graph**: synthetic SoA tick loop at 7k agents + 46-SSSP
  wave. AC: §3.6 budgets projected. Fallback ladder: tune → pool → WASM (decision
  record). **CLOSED** — see `DR-S3-perf.md`: closure wave 0.17 s (46 trees, 1 thread);
  budgeted workloads run end to end, not extrapolated. Untuned the default preset is
  31.85 s / 60 s but **fails a 2× laptop derate**; ladder rung 1 (materialise the display
  coordinate at render cadence, not per tick — `Direct` is 95.1% of tick-loop wall) takes
  it to 2.14 s and the worst case to 12.05 s, so **no WASM decision record is opened**.
- S4 = WP1's RLIS inquiry (async).
- S5 RNG clones: JavaRandom + ColtMT19937 prototypes + Java fixture dumps (10k draws ×
  20 seeds × 4 draw types incl. Gaussian cache + signed-overflow seeds) + **colt
  `nextIntFromTo` semantics verified against colt source** (W15).
Acceptance: every spike closed with measurements or an invoked fallback, recorded in
`websim/docs/`.

**WP3 — RNG + mathx production (M).**
Scope: JavaRandom (split-24 fast path + BigInt reference), ColtMT19937, stream registry
with overflow-exact seed derivation, fdlibm module, HALF_UP formatter, truncCast.
Deliverables: `engine/src/rng`, `engine/src/mathx`; fixture dumper in java-exporter.
Acceptance: Tier-0 fixtures byte-exact (10^7 draws × 5 seeds × generators; formatter
table incl. 0.615-class ties; Gaussian cache semantics); Chrome/Firefox/WebKit/Node
identity test green.
Status (2026-07-31, `DR-WP3-cross-engine.md`): 10^7 × 5 seeds × 2 generators **met in
full** — 100,000,000 draws, bit-exact, on top of DR-S5's 2,630,000. Four-engine identity
test **built and green** for every plane the port owns. One acceptance item is **open**:
`geographiclib-geodesic` is still unpatched (Q12), so the geodesic plane is agreement to
3.2 nm rather than byte identity — bounded in CI at Q12's own 1e-6 m contingency line and
carried into WP7.

**WP4 — Asset pipeline (L; needs WP2-S2, WP3 formatter).**
Scope: java-exporter productionized (graph + correction census + sampler/world dumps for
Tier-1 fixtures); pack-graph, build-smoke, build-shelters, build-encampments (public
snapped + git-ignored local raw), build-registry (readStrict gate), build-presets (from
Zod schema), build-archive-bundles + golden-summaries; checksums; deploy-check grep.
Acceptance: graph census exact; smoke arrays match slice counts/peaks (576/562.7,
456/984.75, 456/2496.1); registry validation fails the build on a seeded bad row; preset
JSONs diff-clean against archived manifests; public encampment asset contains zero raw
coordinates and zero raw inc_ids (automated); archive bundles for every preset family.

**WP5 — Graph runtime + CsvLoader (M).**
Scope: CSR load + cumulative segment lengths, Dijkstra (heap-order faithful, blocked
short-circuit), pathToSource/coordOffset, degree-space STRtree snap, CsvLoader port.
Acceptance: all shelter-tree distance arrays bit-equal to Java dumps for arms A/B/C;
snap assignments for all 3,400 camps + all shelters equal Java (raw-coordinate local
path); CsvLoader adversarial fixtures byte-equal; every shipped CSV parses identically
to Java-exported parses. **CLOSED** — see `DR-WP5-graph-runtime.md`: 118/118 trees,
3,539,712/3,539,712 distances AND predecessor edges bit-equal, 3,908/3,908 snaps
(3,400 camps + 508 shelter rows over 13 CSVs), 768 path/coordOffset probes, 68/68
adversarial CsvLoader parse invocations byte-equal against a Java-executed oracle.
Two defects found and fixed: WP5-F1 (`TextDecoder` deletes a leading BOM by default,
which Java does not) and WP5-F2 (the STRtree coincident-coordinate tie-break is
`HashMap` bucket order, not lowest node id — WP4's encampment asset had one snap
wrong, across a component boundary, now corrected and regression-locked).

**WP6 — World build + samplers (M).**
Scope: ContextCreator 12-step port with fail-fasts; Population/ELayer samplers; shelter
objects (reserve/windows/policy columns); closure schedule parsing + fail-fasts.
Acceptance: **Tier-1 initial-world identity** vs Java dumps at seeds 42–50 for A/B/C,
ER, SE, SE2 (camp vector, demographics, E-attributes, decision seeds, open windows,
reserves bit-equal); seed-42 realised marginals exact at n=6,842
(0.1988/0.1478/0.1079/0.2381/0.2622/1.2805 — corrected, see F1-F1).

**WP7 — VERTICAL SLICE: arm A end-to-end (L; the go/no-go; graft).**
Scope: legacy-latch agent step (§1.5), movement with Direct-hoist, admission,
`shuffle-mt` order strategy, OutcomeLogger parity + v2, headless Node runner; arm A
seed 42, heterogeneity ON, dates ON, 312 h, n=2,037 and n=6,842.
Acceptance: Tier-3 statistical gates pass vs `present-day-three-arm` (sheltered in
9-seed band; unreachable exact id-set vs B/C configs run headless; marginals exact;
54,002.8 identity exact; dose ≡ exposure × 0.61); gates (b)(d)(e) pass; perf budgets met
on the reference laptop or the WASM decision record is opened. **Hard cut line: if WP7
slips, everything downstream shifts — nothing else starts early except UI mockups.**

**WP8 — Engine completeness: Phase E + Scenario E (L).**
Scope: decision layer (hazard/outreach/belief/L1 utility chooser, group pace, barriers),
closures (waves via SSSP pool, reactToClosureWave, push/stuck, grandfathering), severe
series, triage reserve, pet policy/variant, E0-null configs.
Acceptance: **Tier-2 own-engine R3 byte-identity** (flagship) + closures-inert variant;
gates (f)(g)(i)(k)(l) green; ER/SE/SE2 presets reproduce archived direction-of-effect +
counter identities; measure-zero push result at documented severities reproduced;
pushThetaThreshold honesty note wired into presets/ledger.

**WP9 — Validation harness + replay + Tier 4 (M; parallel with late WP8).**
Scope: full gate ports (a)–(l) + verify_2026 + analyze_run; replay runner over the
working set; Tier-4 divergence-attribution report; VALIDATION_REPORT.json emitter;
golden-summaries digester; **mutation test**; LFS working set; nightly full-archive job.
Acceptance: all Tier-3 gates green on replays of A/B/C seeds 42–44, ER, SE-E18,
SE2-E18-d1, E0 nulls; Tier-4 report shows zero unexplained divergences; CI goes red on
the injected seed perturbation; nightly job wired; loud-degradation on missing archive.

**WP10 — Worker runtime, streaming, snapshots, Compare backend (M).**
Scope: sim-worker facade (Comlink), SSSP pool, frame/metric streams (transferables),
wave-progress events, snapshot ring + scrub, dual-worker Compare support.
Acceptance: snapshot-replay byte-identity property holds in the worker (not just Node);
UI thread long-task-free (< 50 ms) at max speed; Compare runs two synced workers.

**WP11 — UI: Run screen + map + presets + badge (L).**
Scope: deck.gl layers, slider taxonomy with structural constraints (hours ≤ slices−1;
closureDraw gating; scenario dropdown), preset loader with **archived-instant-display**,
in-browser gate runner, badge state machine, executed-manifest diff view.
Acceptance: every §3.3 bundle runnable one-click and earns ARCHIVE-VALIDATED (WP9 report
+ live gates); archived numbers visible < 2 s on throttled desktop; seeded constraint
violations unreachable through the UI; INVALID path demonstrably triggered by test hook;
badging present everywhere numbers appear.

**WP12 — UI: Compare + Archive + Provenance + permalinks + exports (M).**
Scope: Compare screen (delta cards, range-across-draws rule), Archive browser,
Provenance screens (registry, corrections, quirk ledger, scoreboard, config diff),
permalink codec finished, v2 exports + replay token, parity export toggle.
Acceptance: archived-vs-live overlay for A-seed42 matches golden summaries; closure
families refuse single-schedule presentation; counterfactual labels on every constructed
series (snapshot tests); config → URL → config round-trips identically; Compare
A-seed42 archived vs live demo-able as the validation story.

**WP13 — Accessibility + mobile (M; graft).**
Scope: WCAG 2.2 AA program — keyboard timeline, live-region ticker, data-table toggles,
reduced-motion alternative charts, text-mode narrative; axe CI gate; mobile capability
gate + honest dialog + archived-playback path.
Acceptance: axe clean + manual keyboard/screen-reader script passes; reduced-motion path
verified; archived display works end-to-end on a mid-range phone with no engine load.

**WP14 — Hardening + deploy (M).**
Scope: cross-browser determinism matrix, asset-integrity verification at load, GitHub
Pages deploy with base path + 404/permalink fallback, deploy-check grep in the publish
job, README fidelity contract + divergence register + quirk ledger finalized, symposium
dry-run script.
Acceptance: three-browser byte-identity on 5 configs; green pipeline from clean clone;
all four never-regress gotchas verified by automated checks; public deploy only behind
WP1 sign-offs; dry-run executed on the production URL.

Nominal effort ≈ 3 person-months. Sizes: S = ≤ 3 d, M = ~1 wk, L = ~2 wk.

---

## 9. Risk register (mitigations + explicit cut lines)

### 9.1 Risks

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| W1 | RLIS redistribution unresolved — `graph.bin` is derived redistribution | **Critical / ship-blocker** | WP1 day-1 written inquiry; deploys unlisted until written OK; OSM fallback behind the asset interface with explicit tier downgrade + decision record; nothing publishes until resolved |
| W2 | Encampment coordinates — even derived assets carry current-location risk | **Critical / ship-blocker** | Q4: node-snapped + salted-hash public default; grid-only display; raw confined to git-ignored local path; automated deploy grep; exact-coordinate binary only with sign-off |
| W3 | Shuffle non-replication → arm-A admission divergence misread as engine error | High | `shuffle-mt` matches distributional character; Tier-4 attribution measures the residual channel; badge popover explains it; per-agent streams shuffle-invariant by design |
| W4 | JS transcendental nondeterminism across browsers | High | fdlibm module mandatory for all engine transcendentals; geographiclib-js routed through it; three-browser byte-identity CI gate |
| W5 | Runtime `Direct` diverges from Java at knife-edge step boundaries | Med-High | Weights baked (Inverse mooted); 10^6-case differential test + knife-edge census; verbatim Java Direct port contingency |
| W6 | Formatter parity subtly wrong → false archive diffs | High | Exact-decimal HALF_UP with Java-generated tie-class fixtures; parity formatter confined to the harness |
| W7 | Performance miss (1.9·10^8 agent-ticks; 46-SSSP waves) | High | Spike S3 measures week 1 on the real graph; conservative budgets; Direct-hoist; SoA/CSR; escalation ladder gated on decision records; archived-instant-display caps product damage |
| W8 | Hidden order-dependence (map iteration, JSON key order) leaks into outcomes | High | Lint rule bans Map/Set iteration on outcome paths; explicit ordered arrays; run-twice + cross-browser byte gates; row-order policy (key-joined comparisons) |
| W9 | Executed-vs-configured drift (negative-zeroing class reborn: NaN parse, clamp, stale store) | High | ExecutedManifest from engine internals only; UI diff view; INVALID badge on any diff; preset round-trip tests; Zod rejects out-of-range before the engine sees it |
| W10 | Preset ambiguity between GUI defaults and batch fallbacks | Med | Q2: 41/41 explicit; schema has no optionals; fallback exercise flagged |
| W11 | Quirk handling drifts between parity and v2 | Med | Single internal state, two formatters, shared number layer; per-quirk paired tests; v2 changelog |
| W12 | CSV dialect divergence | Med | CsvLoader ported verbatim + adversarial byte fixtures; shipped CSVs parsed by the same code |
| W13 | Dijkstra tie-breaks / degree-space NN wrong path geometry | Med | Java-faithful heap; Tier-1 compares full distance arrays AND snaps; ties measured, not assumed rare |
| W14 | Smoke UI hazards (double-applied scale, fabricated zeros, missing labels, hours overrun) | Med | Q9 semantics; structural slider bound; oor>0 ⇒ INVALID; label snapshot tests; effective-severity formula tested |
| W15 | colt `nextIntFromTo` semantics assumed not verified | Med | WP2-S5 acceptance criterion: verify vs colt source + Java fixture before dependent work |
| W16 | Governance drift (registry edits invalidate snapshot) | Low-Med | Registry SHAs in asset manifest; rebuild re-validates; manifest governance block carries SHAs |
| W17 | Cargo-culting dead/Repast behavior (arrival-distance slider, %n, batch zeroing) | Low | Dead param manifest-only; divergence register documents each dropped behavior |
| W18 | Archive unavailability in hosted CI (375 MB local) | Low-Med | ~40 MB LFS working set covers every gate class; nightly local full-archive job; loud degradation, never silent skip |
| W19 | Gotcha regressions re-enter via UI copy | Low | Claim-linter on `websim/**` from WP0; snapshot tests bind counterfactual chips to series flags, not hand-placed labels |
| W20 | Validation harness green-by-vacuity | Med | Mutation test: CI must go red on injected seed + formatter perturbations (WP9 gate) |
| W21 | Live public runs (node-snapped starts) conflated with the validated raw-offset configuration | Med | Badge caps public live runs at ENGINE-CERTIFIED vs snapped config; quirk-ledger note; upgrade path = signed-off exact-coordinate binary |
| W22 | Scope creep into relitigated fidelity or feature sprawl | Med | §9.3 charter: escalating any cut line requires a decision record in `websim/docs/` |

### 9.2 Divergence register (seeded now, maintained in `websim/README.md`)

1. Within-tick agent order: MT-drawn Fisher–Yates vs Repast's shuffle algorithm
   (semantics matched, algorithm not; Tier-4 measured).
2. `agents.csv` row order: creation order vs unspecified context order (key-joined
   comparison; not load-bearing for any gate).
3. Sorted-Gini substitution (math-identical; unit-proved).
4. Per-tick param re-reads hoisted (values immutable in-run).
5. v2 output quirk fixes (each paired with a parity reproduction).
6. Batch negative-`number` zeroing: unreproducible by construction (typed config);
   executed manifest still proves executed values; archived SE/SE2 executed
   pushThetaThreshold = 0.0 (surfaced in UI).
7. `Direct` partial-segment geodesy: epsilon tier ≤ 1e-9 m (knife-edge census published).
8. Public builds: node-snapped starts; snap_gap_m ≈ 0 (local raw-coordinate validation
   path retains full fidelity).

### 9.3 Explicit cut lines (pre-scoped, out of v1; escalation requires a decision record)

- "Upload your own AQS CSV" reducer UI (gated on 19-check suite; forces EXPLORATORY).
- Repast-shuffle byte-identity attempt / full Tier-1-structural vs A-seed42 (post-v1
  stretch; outcome recorded honestly either way).
- Rust/WASM Dijkstra + movement kernels (only behind measured WP7/S3 miss).
- SSSP pool widening beyond 4 workers.
- Story-mode scrollytelling narrative (archive-driven; nice-to-have — Archive screen +
  archived-instant-display carry the demo value in v1).
- External basemap/PMTiles context layer (licensing/attribution review first).
- Batch/sweep multi-seed fan-out runner UI (engine is headless-capable; natural later).
- Exact-coordinate encampment engine binary (blocked on sign-off, not on engineering).

---

## 10. USER-FLAG SECTION — items requiring the user's personal review/veto

1. **Encampment data ethics (veto surface).** Approve the Q4 policy: node-snapped +
   salted-hash public default, ≥150 m grid display, raw data git-ignored local-only.
   Separately decide whether the exact-coordinate opaque engine binary may EVER ship —
   that upgrade is blocked on your (and mentor/IRB) explicit sign-off, and the salt
   custody question (withheld vs destroyed) is yours to call.
2. **RLIS licensing (ship-blocker).** The Metro redistribution inquiry goes out day 1 in
   your/mentor's name; public deploy is blocked until a written determination is filed.
   If Metro refuses, you personally approve (or veto) the OSM fallback, because it
   downgrades the validation claims the project advertises.
3. **Hosting & visibility.** Public GitHub Pages URL goes live only after items 1–2
   clear; until then deploys are unlisted/private preview. Also: committing the ~40 MB
   LFS validation working set into the repo (repo-size/quota implication) and running
   the nightly full-archive CI job on your local machine both need your OK.
4. **Live-vs-archived framing at the symposium.** Sign off on the badge language
   ("Certified Java run" vs "Live browser simulation") and on the pushThetaThreshold
   honesty note (archived runs executed 0.0 via the parser defect; web presets carry the
   corrected −0.25) before any public demo — this is a scientific-communication call,
   not an engineering one.
5. **Mentor review of the preset envelope.** The ENGINE-CERTIFIED badge treats
   registry-sourced sweep ranges as the "validated envelope"; confirm with your mentor
   that presenting in-envelope custom runs as certified-by-the-engine (never as
   archive-validated) is acceptable framing.
