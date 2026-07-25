# Phase 2 · Spec 8 — Architecture, Randomness, Testing, Reproducibility, Data

**Status: DESIGN ONLY.** Consolidates the architecture review, testing strategy,
reproducibility audit, and data-engineering review.

---

## 1. The controlling constraint (read first)

`GisAgent.step()` is annotated `@ScheduledMethod(start = 1, interval = 1)`. Per
the Repast 2.11 API (verified in the local `RepastSimphonyAPI` docs), the
defaults are `priority = RANDOM_PRIORITY` and `shuffle = true`: **agent
execution order is re-randomised every tick from Repast's default random stream
— the same stream the encampment-placement loop draws from.**

Consequences that dictate everything else:

1. The 50-agent baseline population *is* the 50 sequential draws in
   `ContextCreator`. **Any new draw on the default stream before that loop
   changes every start point; any draw after it changes the per-tick shuffle.**
2. The baseline survives shuffle perturbation only by luck: at n = 50 the 2 × 99
   capacity never binds, so agents never interact and step order is
   outcome-neutral. **The moment capacity binds (the capacity-shortage
   scenario), step order becomes outcome-determining.**
3. **Non-negotiable rule: no new code draws from the Repast default stream —
   not at build, not at step, not at export.**

---

## 2. Package map (additive; no existing class moves)

| Package | New types | Responsibility |
|---|---|---|
| `geography.scenario` | `ScenarioConfig`, `ScenarioLoader`, `ScenarioDefaults` | resolve defaults → scenario file → Repast parameters into one immutable enumerated config; supply the manifest block |
| `geography.rng` | `RngStreams`, `SeedDeriver` | own all non-default streams; derive per-concern and per-agent seeds; report the derivation |
| `geography.population` | `PersonAttributes`, `AttributeSampler`, `AttributeDistributions`, `SusceptibilityModel` | sample attributes from documented distributions; map to susceptibility class and optional weights |
| `geography.behavior` | `EvacuationPolicy`, `ShelterChoicePolicy`, `MovementModel`, `AdmissionPolicy`, `Decision` | the four decision seams, each an interface whose **default implementation reproduces today's behaviour exactly** |
| `geography.env` (existing) | `HazardSystem`, `HazardEvent` | pre-sampled disruption timeline (empty by default) |
| `geography.routing` (existing) | `EdgeMask`, `Route`, `RouteService` | edge-closure mask; node-aware route; versioned shelter-tree cache |
| `geography.output` (existing) | `SummaryReporter`, `BreakdownReporter`, `RiskAttribution` | additive reports; `OutcomeLogger` keeps sole ownership of the three contract files |

**Why `geography.behavior` rather than more code in `GisAgent`:** the seams must
be swappable per scenario and testable without a Repast context. `GisAgent`
reaches into `ContextUtils`/`RunEnvironment` statics and is currently untestable
in isolation; policies must not inherit that.

**Why the mask lives in `routing`, not `StreetNetwork`:** keeping it out of the
graph leaves `StreetNetwork` immutable, which also permits memoising the
112,070-feature graph across batch runs in one JVM — roughly 10× on a scenario
campaign.

---

## 3. Randomness architecture

### 3.1 Stream taxonomy

| Concern | Stream | Where drawn |
|---|---|---|
| Encampment assignment (existing) | **Repast default — FROZEN** | `ContextCreator`, agent-index order |
| Agent step order | Repast default (engine-internal) | protected by never consuming that stream |
| Attributes, walking speed, decision noise | **per-agent derived streams** | attributes at build (after placement); decisions inside `step()` |
| Hazard realisation | one `hazard` stream, **pre-sampled at build** | `ContextCreator.build()` |

### 3.2 Mechanism

Repast's `RandomHelper.registerGenerator(name, seed)` / `getGenerator(name)`
creates named generators disjoint from the default stream. `SeedDeriver` derives
seeds by a documented mixing function (SplitMix64 finaliser over a canonical
byte string):

```
long streamSeed(long masterSeed, String streamName);
long agentSeed (long masterSeed, String streamName, int agentIndex);
```

Per-agent streams use `java.util.SplittableRandom`: JDK-specified algorithm (so
reproducible across JVM builds and operating systems, which the fresh-clone
reproduction requirement needs), cheap to instantiate thousands of times, and
structurally unable to touch Repast's registry.

**Derive one stream per *(agent, attribute)*, not one per agent.** Adding a fifth
attribute later then does not shift the first four — a property sequential
drawing cannot give, and the thing that keeps a later scenario comparable with an
earlier one.

### 3.3 Lifecycle placement rules

1. **Build, in fixed order:** data loads → **the existing placement loop, which
   must remain the first consumer of the default stream, in the same position** →
   attribute sampling (per-agent streams, fixed id order) → hazard timeline.
2. **Run:** per-agent decision streams only. Zero default-stream draws, zero
   `Math.random`, zero unseeded `new Random()`.
3. **Export:** no draws at all.
4. **Any draw whose *count* depends on behaviour must be on a per-agent stream**,
   so an agent taking an extra decision desynchronises only itself.

### 3.4 Common random numbers across scenarios

A fixed seed then gives an identical population, identical per-agent attributes
(invariant to `numAgents` and to which attributes exist), an identical hazard
realisation for scenarios sharing a hazard config, and an identical step-order
sequence at equal `numAgents`. This is what makes the paired comparisons in
`06-SCENARIOS.md` §5 valid.

### 3.5 Order-independent admission

Replace admit-on-arrival with two phases: agents *propose* on arrival; an arbiter
at `LAST_PRIORITY` resolves proposals in a deterministic order — arrival tick,
then a per-agent priority key drawn once at init from the agent's own stream —
admitting up to remaining capacity.

Admissions become independent of Repast's shuffle and identical across scenarios,
and this is exactly the "first-come-first-served with a random tie-break among
simultaneous arrivals" policy `DESIGN_SPEC.md` already claims. **It changes
behaviour only when capacity binds**, which never happens at n = 50 — the
baseline stays byte-identical.

---

## 4. Data engineering — evidence as versioned data, not Java constants

Create `Geography/data/parameters/`, one CSV per evidence-backed quantity, in the
format `CsvLoader` already reads, **with citation fields as columns**:

- `age_distribution_pit2019.csv`:
  `age_band_min, age_band_max, proportion, source, source_table, doi_or_url, retrieved_date, notes`
- `comorbidity_prevalence.csv`:
  `condition, prevalence_low, prevalence_high, population_basis, source, doi, retrieved_date`
  — encoding `01-POPULATION.md`'s rule that prevalence is a *bounded range*.
- `vulnerability_rr.csv`:
  `factor, rr, ci_low, ci_high, exposure_metric, averaging_period, study_population, source, doi, retrieved_date, provenance_status`
  with `provenance_status ∈ {SOURCED, UNSOURCED_DO_NOT_PUBLISH}`. **This column
  mechanises the D5/D6 rule** — the disputed ×1.45 and ×1.80 values may exist as
  documented, flagged rows with no risk of silently entering results.
- `walking_speed_distribution.csv` — bands, means, SDs with source rows.

Migrate existing hard-coded literature values too: the `UNHEALTHY_UGM3 = 55.5`
constant and its duplicate parameter default should both trace to an
`aqi_breakpoints.csv` carrying a `table_version` column (`pre2024`/`post2024`) —
the exact versioning trap `DATA_SOURCES.md` D9 warns about, currently
unrepresented in code.

**Version the evidence as a unit:** `paramset.json` with `paramset_id` (e.g.
`vuln-2026-08-v1`), member files and their SHA-256s, and a changelog line per
version. Members join the input-dataset list, so they inherit the existing
checksum machinery and `data_version_tag`, and the manifest gains a
`parameter_provenance` block. An experiment can then state exactly which evidence
version it used, and resolving a citation becomes a new paramset version —
diffable and reviewable.

### 4.1 Validation on load

**Fail fast (throw):** required columns present and typed; proportions sum to
1 ± 1e-9, bins non-overlapping and exhaustive; `ci_low ≤ rr ≤ ci_high`, `rr > 0`;
`prevalence_low ≤ prevalence_high`; `source`, `doi_or_url`, `retrieved_date`
non-empty for every `SOURCED` row; file hash matches `paramset.json`.

**Warn loudly and record:** any `UNSOURCED_DO_NOT_PUBLISH` row loads as the inert
default (1.0) **and its name is appended to a manifest field
`unsourced_parameters`**. `analyze_run.py --strict` then refuses to bless a
"publishable" run whose results depend on a placeholder. This closes the loop on
the founding rule: the model cannot invent values, and now cannot quietly *use*
flagged ones.

---

## 5. Testing strategy

**There is currently no test code anywhere** — no test source set, no test task,
no JUnit on the compile classpath. But the Repast 2.11.0 install already ships a
complete offline JUnit 5 stack (**verified present**: `junit-jupiter-*_5.10.2`,
`junit-platform-*_1.10.2`, `org.opentest4j_1.3.0`, `org.apiguardian.api_1.1.2`,
`org.hamcrest_2.2.0`), so tests can be added with the same local-resolution
philosophy the build already uses — no Maven Central, no network.

**Critical constraint (verified):** `Geography.rs/user_path.xml` puts `../bin` on
the scenario classpath and scans `geography.agents.*` for agents. Production
classes compile to `bin/`; **test classes must compile elsewhere** (the Gradle
default) so they can never contaminate the runtime.

### 5.1 Test pyramid

| Tier | Contents | Time | When |
|---|---|---|---|
| 0 | compile + JUnit unit/property/conformance tests (no Repast runtime) | seconds | every commit |
| 1 | smoke run (n = 10, 24 h) + `analyze_run.py` | ~1 min | every push |
| 2 | full baseline regression (seed 42, n = 50, 312 h) + both Python suites + golden diff | minutes | any commit touching model code or data |
| 3 | multi-seed replicates, capacity-binding run (n > 198), scenario suite | tens of minutes | before quoting results |

`StreetNetwork` is already Repast-free (JTS + GeographicLib) and unit-testable
**today**: a toy graph with a known optimum; a synthetic corrupt-node fixture
asserting the reattach-vs-split decision and `impossibleEdgesAfterFix == 0`;
path/distance consistency; symmetry.

### 5.2 Distribution-conformance tests without flakiness

Samplers are seeded, so the test is deterministic by construction:

1. **Large-n conformance** at a fixed test seed, n = 10,000: χ² (categorical) or
   KS (continuous) against the versioned distribution file; assert `p > 0.001`
   *and print the statistic*.
2. **Exact golden assertion** at the same seed (bin counts or their hash) — any
   silent change to the sampler *or* the source file becomes a loud, reviewable
   failure, with the χ² tier explaining whether it is material.
3. **Support invariant** on every draw.
4. **Per-run manifest echo** of the realised composition, so `analyze_run.py` can
   test the run population against the declared distribution (report-only at
   n = 50, where rejection would be noise).

### 5.3 ABM invariants (per-tick monitor making zero RNG draws)

State census sums to `numAgents`; occupancy ≤ capacity per shelter per tick; dose
non-decreasing with per-tick delta exactly 0 while `SHELTERED`; per-tick
displacement ≤ step length + ε; effective speed within each agent's own bounds;
no agent traverses an edge closed during that tick.

The independent dose recomputation from the raw AQS CSV — done ad hoc for the
baseline and matching **exactly** — should be **promoted into `analyze_run.py` as
a standing numbered check.** It is the strongest single validation the project
has and it currently lives outside the suite.

### 5.4 Regression against the immutable baseline

Golden files are already committed at `docs/runs/final-baseline/`. Formalise: a
`verify_baseline` script re-runs the frozen config and compares `agents.csv`
cell-by-cell, excluding only `sim_id` and `commit` (a `data_version` mismatch
must **fail** with a distinct message, never be normalised away), with a
`--columns v1` mode once new columns are appended.

**Immutability enforcement:** the convention protecting `final-baseline/` is
currently only prose. Add an annotated git tag on the baseline commit naming its
sim_id, plus a test asserting the SHA-256 of the three archived files — then
nobody can regenerate the archive without a visible test edit.

**Intentional behaviour changes:** never update `final-baseline` in place.
Archive the new run under `docs/runs/<experiment-id>/`, update a small index the
regression script reads, and include an old-vs-new delta table of headline
metrics.

---

## 6. Reproducibility defects to fix before the parameter count grows

1. **A behaviour-affecting parameter is missing from the manifest.**
   `evacuationThresholdUgM3` drives the single largest modelling decision but is
   absent from the archived baseline manifest's parameter list — only prose
   preserves it. **Stop hand-maintaining the parameter array; enumerate the
   Repast schema.**
2. **`Streets.dbf` is not checksummed.** Only `Streets.shp` is hashed — but the
   corrupt topology attributes that caused the wormhole defect live in the
   `.dbf`. A modified `.dbf` with an unchanged `.shp` would produce different
   routing under an *identical* `data_version_tag`. Add `.dbf`, `.shx`, `.prj`.
3. **Silent checksum failure:** the hash helper returns `"unavailable"` on any
   exception, which flows into `data_version_tag`. A run whose inputs cannot be
   hashed must throw, not stamp a fake tag.
4. **Dirty-tree blindness** (already caused one documented mis-stamp): record
   `git_dirty` from `git status --porcelain`, plus the SHA-256 of `git diff HEAD`
   when dirty. Better still, hash what actually ran — `source_tree_sha256` over
   `src/**/*.java` and `bin/**/*.class`, which also catches the
   stale-`bin`-after-skipped-compile case.
5. **`generated_utc` is local time.** Use `Instant`. A mislabelled provenance
   field is worse than none.
6. **Output-directory collision** — `06-SCENARIOS.md` §3.
7. **Hard-coded `repast_version`** — derive from the runtime plugin directory the
   launch script already locates.
8. **No at-load verification of data checksums.** Registry checksums are prose;
   add a machine-readable `checksums.json` verified fail-fast at startup and by
   the analysis scripts. Without it, "the data on disk is the data in the
   registry" is an assumption, not a check.
9. **Licence blocker:** the street data has unverified redistribution terms and
   unknown vintage. Re-acquisition from Metro's official portal is a prerequisite
   for any archived replication package — and it will change `data_version_tag`,
   so plan it as a new-baseline event rather than discovering it.

---

## 7. Implementation sequence (each step separately committable and gated)

| Step | Content | Gate |
|---|---|---|
| 0 | `verify_baseline` script; manifest parameter enumeration; **RNG coupling probe** (throwaway branch: insert one draw before the placement loop, confirm the population changes — converts §1 from argument to evidence) | script exists and passes |
| 1 | extract `step()` into private methods, no logic change | **byte-identical** |
| 2 | `geography.rng`, unused by anything | byte-identical |
| 3 | `geography.scenario` + `scenario` parameter + empty `baseline.properties` | byte-identical; `data_version_tag` unchanged |
| 4 | routing hardening: edge ids, `EdgeMask`, masked Dijkstra overload, `Route`, `RouteService`, sorted spatial-index insertion, id-sorted shelter iteration | byte-identical — **highest-risk step** |
| 5 | policy interfaces with null-object defaults; two-phase admission | byte-identical |
| 6 | `geography.population`: attributes sampled and exported, weights still 1.0 | `--columns v1` identical |
| 7 | susceptibility stratification + optional equivalent-dose weighting, off by default | v1 identical at baseline; weighted run satisfies the generalised identity |
| 8 | heterogeneous movement, off by default | baseline identical; per-agent speed check added to `test_routing.py` **first** |
| 9 | decision model (awareness, sequential logit, delay), off by default | baseline identical |
| 10 | hazard mechanism with empty hazard set | baseline identical — **second-highest-risk step** |
| 11 | output extension + analysis-suite generalisation | zero check failures |
| 12 | the six scenario definitions + comparison script | scenario goldens archived |

**Steps 1–5 must all reproduce the baseline byte-for-byte.** No science changes
until step 6, and every step after that is gated on the v1 columns.

---

## 8. Changes that touch the baseline — decide consciously

1. **Manifest parameter enumeration** adds the missing
   `evacuationThresholdUgM3` and therefore changes the archived baseline
   *manifest* (not `agents.csv`/`shelters.csv`; no check depends on it).
   **Recommendation: do it**, re-run, re-archive with a note that the run is
   behaviourally identical and the manifest is now complete. Leaving an
   unrecorded behavioural parameter is the larger risk.
2. **Do not move the placement draw to a named stream** — it would change every
   start point and require a new baseline. Mark those lines frozen in a comment.
3. **Two-phase admission and id-sorted shelter iteration** are behaviour-identical
   at n = 50 and behaviour-*changing* when capacity binds. Intended — but state
   the policy in `DESIGN_SPEC.md` V12 before running high-n comparisons.
4. **`shelterArrivalDistanceM` is recorded but unused.** Wire it up or deprecate
   it; leaving it invites a reader to believe a 200 m arrival radius is in force.
