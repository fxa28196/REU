# DR-FIX-A — The movement-kernel gate blind spot, and the direct oracle that closes it

Status: **closed**. Evidence produced 2026-07-31 on the working tree at `websim/`.

---

## 1. The finding, restated as a measurement

The WP7 gate reported that a 10 % error injected into `engine/src/agents/step.ts`'s
`stepLengthM` left the whole suite green. That was re-measured from scratch here, and it
reproduced exactly:

```
baseline                 68 files / 1,084 tests   all pass
stepLengthM x 1.1        68 files / 1,084 tests   all pass
```

Every Tier-3 gate in the suite is an **aggregate** — the sheltered census inside a nine-seed
archive band, the 54,002.8192 never-sheltered exposure identity, the realised marginals,
`verify_E_runs` (b)(d)(e)(l), dose ≡ exposure × 0.61 — and none of them is sensitive to a
uniform speed scaling that only shifts arrival ticks around inside the band. Not one test
compared **one resident's displacement on one tick** against Java.

### 1.1 A correction to the premise, found while re-measuring

The tree has moved since the WP7 gate ran. `validation/test/tier4-attribution.test.ts`
(added to the working tree during this session, not by this task) **does** now fail under a
10 % injection — three of its seven assertions break. So the literal statement "no test in
the suite detects a 10 % error" is no longer true as of this tree.

It is still the right diagnosis, for two reasons:

1. Tier-4 catches it **indirectly and by accident**. It is an order-sensitivity gate: it
   compares two *runs of the port against each other* and asserts the divergence sits inside
   a committed permutation envelope. A uniform speed error perturbs admission ties, the
   envelope (114 rows) overflows (154 rows), and the test fails. Nothing about that failure
   says "the walk is wrong"; it says "the ordering channel got bigger than it should be".
2. It degrades fast with error size, and it never reaches the floor. See §4: at 1 ULP,
   Tier-4 is green and so is everything else that existed before this task.

---

## 2. What was built

### 2.1 `MovementTrace.java` — a per-tick trace from the certified agent

`pipeline/java-exporter/src-world/websim/exporter/world/MovementTrace.java`, run by
`pipeline/java-exporter/dump-movement-trace.ps1`.

The 15-line walk at `GisAgent.java:526-542` is **not transcribed, mirrored or paraphrased**
anywhere in the exporter. Instead a minimal but real Repast runtime is stood up —
`DefaultContext`, a `DefaultGeography` projection literally named `"Geography"`, a
`Schedule`, `RunState.setMasterContext`, and a `RunEnvironment` parameter map carrying
`minutesPerTick` / `walkingSpeedMps` / `evacuationThresholdUgM3` — and the certified
`geography.agents.GisAgent` is stepped through it. Every metre in the dump was produced by
`Geodesic.WGS84.Inverse/Direct` **inside the certified class**. `StreetNetwork` (through the
existing `CertifiedGraph`) owns the graph, the snapping and the trees; `CsvLoader` owns the
parse; `Shelter` owns capacity and the open window; `SmokeField` owns the hourly array.

Two blocks of `ContextCreator.build()` are mirrored — the shelter loop (L546-L591) and the
resident placement loop (L710-L755) — exactly as `WorldFixtures` already mirrors them and
for the same reason (`build()` needs a scenario directory, a parameter schema and a live
`RunState`). Neither block contains a metre of movement arithmetic.

Two engineering notes worth keeping:

- cglib, behind Repast's `CallBackAction`, reflects into `ClassLoader.defineClass` to build a
  `FastClass` for the scheduled method. `java.lang` must therefore be **opened**, not merely
  exported: `--add-opens=java.base/java.lang=ALL-UNNAMED`.
- `GisAgent.step()`'s first statement is `ContextUtils.getContext(this)`, which resolves
  through `RunState`. Without `RunState.init()` + `setMasterContext`, the certified step
  throws before it does anything.

**Design constraints honoured**

| constraint | how |
|---|---|
| Q4 disclosure | Traced residents do **not** start at encampment coordinates. Each starts at a *synthetic* point offset (+0.00037, −0.00025) degrees from a street node picked deterministically from the published graph. The offset is what gives the trace a non-zero `snapGapM` approach leg. |
| Determinism | No clock, no environment variable, no hash-order iteration, and **no RNG at all** — the three homogeneous configs use the run-wide speed, the fourth uses fixed synthetic per-agent speeds (never sampled), and the per-tick agent order is a fixed list rather than Repast's RANDOM_PRIORITY shuffle. |
| No scratch | The exporter writes **no** bulk tree under `pipeline/out/`. The whole trace is small enough to commit, and an empty scratch directory under `out/` would (rightly) trip `check:scratch`. |
| Reproducible | `dump-movement-trace.ps1 -Verify` runs the dumper twice, the second time into the OS temp tree, and diffs every SHA-256. **Verified: 5 files, 0 differences.** |

**The trace** — `engine/test/fixtures/movement/`, 446 KB committed:

| file | content |
|---|---|
| `ticks.tsv` | per-tick: state, `pathIndex`/`pathSize`, `distanceTraveledM`, position, and every exposure accumulator, as raw IEEE-754 hex |
| `routes.tsv` | the certified `StreetNetwork.pathToSource` polyline of each traced leg, plus the certified per-vertex geodesic segment lengths |
| `legs.tsv` | one row per resident per config: speeds, snap gap, planned route, network distance, departure/arrival ticks, retargets, final distance |
| `smoke.tsv` | the certified `SmokeField` hourly array for the traced window |

4 configs × 6 residents = **24 traced legs**. Configs 0–2 walk at run-wide 0.70 / 1.34 /
1.90 m/s with `attributes == null`; config 3 gives every resident a certified
`PopulationSampler.Attributes` carrying its own speed and sets the run-wide parameter to a
**decoy of 37 m/s** that nobody may ever walk at — so a port that read the parameter instead
of the attribute is ~27× too fast on tick one. Every walk is recorded at full per-tick
resolution; the idle stretches are sampled at stride 137, which is lossless because every
accumulator is cumulative.

### 2.2 `movement.oracle.test.ts` — the gate

`engine/test/oracle/movement.oracle.test.ts`. It has **no artifact gate**: it runs in a clean
clone from committed bytes only, alongside `committed-slice.test.ts`.

For each traced leg it rebuilds a two-node chain graph whose single edge carries the
certified route polyline, with the edge length set to the sum of the certified per-vertex
geodesic segments — so `buildSegmentGeometry`'s A2 snap lands the leg's cumulative array on
Java's own walked length rather than on a re-derived one. It then runs the real
`stepResident` and compares, tick by tick.

### 2.3 Why bit-identity is available here — the load-bearing argument

DR-S3 action A3 says per-agent `distanceTraveledM` gates are tolerance comparisons. That is
true **of a whole journey**, and it is why the WP7 gate could never be tightened into a
movement test. It is **not** true tick by tick:

- Java accumulates `distanceTraveledM += stepLengthM − remainingM`, and on every tick that
  does *not* consume the last path vertex, `remainingM` is exactly `0` — the loop's `Direct`
  branch zeroes it. Java's addend is therefore exactly `stepLengthM`.
- The port accumulates `advanceM = min(stepLengthM, legLengthM − legTravelM)`, which on those
  same ticks is exactly `stepLengthM`.

Both sequences start at `0` and apply the identical `fl(x + s)` recurrence with the identical
`s`, so they are bit-identical. `pathIndex`/`pathSize` (read out of the certified agent by
reflection) is what lets the test tell those ticks apart from the one tick per leg where the
walk consumes its last vertex and Java's residual becomes a live geodesic remainder.

The exposure accumulators are bit-identical on **every** row, final ones included: they are
sums of `c · dtHours` over the same concentration sequence with no geometry in them at all.

**Realised numbers, printed on every run:**

```
998 interior walking ticks BIT-EXACT
1,080 leg-consuming/frozen rows within 1.304e-8 m (budget 1e-7)
worst position offset 2.124e-8 m (budget 1e-7)
worst snap-gap offset 1.061e-9 m
```

The 1.304e-8 m is DR-S3 finding S3-F2 in anger: the per-edge cumulative-length residual is at
worst 2.598e-8 m and a traced leg spans up to ~180 consumed vertices. Both budgets are set one
order above the measurement, and the realised maxima are logged so a regression that stays
inside the budget is still visible.

---

## 3. Mutation results — the oracle is not vacuous

Each row is one seeded defect, the whole suite run, then a byte-identical restore (verified by
SHA-256). "Pre-existing" means every test that existed before this task; "FIX-A oracle" is the
new file.

| # | seeded defect | pre-existing tests | FIX-A oracle |
|---|---|---|---|
| 1 | `stepLengthM × 1.10` | `tier4-attribution` ×3 | **RED** (first walking tick) |
| 2 | `stepLengthM × 1.01` | `tier4-attribution` ×1, `wp7-vertical-slice` ×1 | **RED** |
| 3 | `stepLengthM + 1 ULP` | **all green** | **RED** |
| 4 | per-agent `attributes.walkingSpeedMps × 1.01` | `tier4-attribution` ×1, `wp7-vertical-slice` ×1 | **RED** |
| 5 | `exposureUgM3h += c·dt × 1.001` | `wp7-vertical-slice` ×3, `step.units` ×1 | **RED** |
| 6 | `INHALATION_WALKING_M3H` 1.62 → 1.6202 (0.012 %) | **all green** | **RED** |
| 7 | ventilation switch inverted (`!stuckNow` → `stuckNow`) | `wp7-vertical-slice` ×1 | **RED** |
| 8 | `UNHEALTHY_UGM3` 55.5 → 55.0 | `step.units` ×2 | green (see §5) |
| 9 | `hoursAboveUnhealthy` strict `>` → `>=` | `step.units` ×2 | green (see §5) |

**Smallest movement error the oracle detects: one ULP** — row 3. `stepLengthM` at 1.34 m/s is
80.4 m; one ULP is ~1.4e-14 m, and it separates the two accumulators on the very first
walking tick, at `config 0 agent 0 tick 960`:

```
expected '4045000000000001' to be '4045000000000000'
```

Rows 3 and 6 are the two defects **nothing in the repository detected before this task**.

---

## 4. Blind-spot audit of the neighbouring accumulators

The task asked whether the same class of hole exists in exposure accrual, ventilation
switching and hours-above accumulation.

- **Exposure accrual — was already covered.** A 0.1 % error breaks the never-sheltered
  exposure identity, the dose ≡ exposure × 0.61 identity and the vwe-equals-exposure identity
  in `wp7-vertical-slice`, plus a `step.units` assertion. Those are gated on `pipeline/out/`,
  so the new oracle now also covers it **in a clean clone** — that is a real strengthening,
  not a duplicate.
- **Ventilation switching — was a genuine blind spot, now closed.** Inverting the switch is
  caught (the dose identity breaks). But perturbing the *constant* by 0.012 % was caught by
  **nothing**: the dose identity only pins the resting rate 0.61, and no gate anywhere pinned
  1.62. The new oracle compares `airVolumeBreathedM3` and `inhaledDoseUg` bit for bit on every
  traced row, walking and resting, so the walking rate is now pinned as tightly as the resting
  one.
- **Hours-above accumulation — was already covered, by a real assertion.**
  `step.units.test.ts` drives the `>` / `>=` knife edge with hand-built concentrations of
  exactly 55.5 and 55.5 + 1e-9, and both seeded defects break it. **No new oracle was added,
  because one already exists and it works.**

---

## 5. What this does NOT cover — stated so the coverage is not overclaimed

- The oracle's mini-world is a two-node chain carrying one certified route polyline. It
  exercises the movement kernel (both halves of the speed selector), the approach leg, the
  exposure block, the ventilation switch, the departure latch and the door. It does **not**
  exercise shelter choice over the full graph, retargeting after a refusal, or closure waves;
  those remain with `world/tier1.parity.test.ts`, `graph/trees.parity.test.ts`,
  `graph/snap.parity.test.ts` and `validation/test/wp7-vertical-slice.test.ts`.
- Defects 8 and 9 are invisible to this oracle, and the reason is a property of the data, not
  of the design: no hour of the baseline Portland series inside the traced 96-hour window sits
  in [55.0, 55.5], and none is exactly 55.5, so neither a lowered threshold nor a relaxed
  comparison changes a single traced row. Synthetic concentrations are the right instrument
  for a knife edge, and `step.units.test.ts` already wields it. Widening the trace window to
  hunt for a real hour in that band would be a worse test, not a better one.
- The trace is RNG-free by construction, so it says nothing about the samplers. Those have
  their own bit-exact oracle in `world/committed.parity.test.ts`.
- Java's per-tick standing point is carried forward through repeated `Direct` calls while the
  port materialises it from the leg's cumulative array. They are compared at 1e-7 m, not bit
  for bit, and cannot be — DR-S3 A1/A3.

---

## 6. Reproducing

```powershell
# regenerate the certified trace (recompiles Geography sources into websim, never Geography/bin)
powershell -File websim\pipeline\java-exporter\dump-movement-trace.ps1 -Verify

# run the oracle
cd websim && npx vitest run engine/test/oracle/movement.oracle.test.ts
```

The dump takes ~4 minutes with `-Verify` (two full runs, each rebuilding the 88,100-node
certified graph). Without it, ~1 minute after the first compile.
