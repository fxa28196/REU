# DR-WP8 — The Java decision-layer trace oracle

Status: **closed, with named gaps.** Evidence produced 2026-07-31 on the working tree at
`websim/`. 20 runs, 476.9 MiB, R3 null identity measured, instrumentation neutrality gate
passed, 57 of 72 decision branches triggered and the other 15 named with reasons (§7.2).

Scope: the Phase-E half of WP8. This document records what was built, the one design
decision that needed justifying (source instrumentation), the sampling rule the TypeScript
side must reproduce, and the branch-coverage result.

Authority: `websim/docs/WP8-SPEC-decision.md` (the behaviour), `websim/docs/PORT_MAP.md`
(the Java→TS mapping), and above both of them
`Geography/src/geography/agents/GisAgent.java`, which is the instrument of record.

---

## 1. The problem this oracle exists to solve

WP7 gated the engine on the initial world (Tier-1 bit identity at seeds 42–44) and on one
arm-A vertical slice that reproduced the archive exactly. Neither touches the decision
layer, because the decision layer is not reachable from a `Simulation` today
(WP8-SPEC-decision.md §16.5: `sim.ts` drops `r.decision` on the floor, so every resident's
`decision` field is `null` and the WP7 latch executes instead).

That means WP8 will be written against a specification, and the specification is subordinate
to the Java. Six of the quantities the specification is most likely to get wrong are
invisible from outside the certified agent:

| quantity | where it lives | reachable by reflection? |
|---|---|---|
| `z_R` after decay + increment | `GisAgent.zR`, private field | yes |
| the hour bucket / `newHour` | step-local | **no** |
| `decay` | step-local | **no** |
| `bRiskEff`, `u`, `p` | step-local | **no** |
| per-candidate `dM`, `cap`, `walkTimeH`, `v` | step-local, inside a loop | **no** |
| the draw sequence on the private stream | `GisAgent.decisionRng` | yes, by substitution |

An oracle that recomputed `u`, `p` or `v` in the dumper would be exactly the circular
instrument this project forbids: it would agree with a wrong port for the same reason the
port was wrong. So the oracle reads them out of the certified frame that computed them.

---

## 2. What was built

```
websim/pipeline/java-exporter/
  src-decision/websim/exporter/decision/
    DecisionProbe.java      the ONLY class the instrumented GisAgent calls; 72 branch
                            counters, 7 row streams, IEEE-754 hex formatting. No arithmetic.
    RecordingRandom.java    a SUBCLASS of java.util.Random that delegates every bit to
                            super.nextDouble() and records (index, site, raw bits) + a
                            per-agent count and rolling SHA-256.
    Instrument.java         generates the instrumented copy of GisAgent.java; enforces the
                            patch contract (see §3) and writes the audit file.
    DecisionTrace.java      the driver: real headless Repast runtime, full 6,842-resident
                            world, certified GisAgent.step(), all dumps + manifest.
    Dump.java               LF/UTF-8 sinks, SHA-256 manifest. No model logic.
  dump-decision-trace.ps1   build + run + the neutrality gate
  gen-src/                  GENERATED (git-ignored): the instrumented GisAgent + audit
  out/decision-fixtures/    GENERATED (git-ignored): the dumps + manifest.json
```

Run it with:

```powershell
powershell -File websim\pipeline\java-exporter\dump-decision-trace.ps1
powershell -File websim\pipeline\java-exporter\dump-decision-trace.ps1 -Only "ER-A"
powershell -File websim\pipeline\java-exporter\dump-decision-trace.ps1 -Neutrality -Only "E0-A"
powershell -File websim\pipeline\java-exporter\dump-decision-trace.ps1 -CompileOnly
```

The script does six compiles, all with output **inside `websim/`** — `Geography/` is never
written to:

1. `src-decision` probe/instrumenter/dump helpers → `out-probe/` (no Geography dependency,
   which is what makes step 4 possible at all);
2. `Instrument` reads the read-only certified `GisAgent.java` → `gen-src/`;
3. certified Geography sources → `geo-classes/`;
4. Geography with the instrumented `GisAgent.java` substituted → `geo-inst-classes/`;
5. the existing WP5/WP6 exporter (`CertifiedGraph`, `Io`) → `out-world/`;
6. `DecisionTrace` → `out-decision/`.

---

## 3. The one design decision that needed justifying

**Decision: read `u`, `p` and `v` out of the certified frame via an insertion-only source
probe, rather than recompute them in the dumper.**

Three alternatives were considered and rejected:

- **Recompute in the dumper.** Rejected: it is the circular oracle. Transcribing
  `alpha + bRiskEff*zR + wOfficial*ind + thetaScaled - barrierCost` into the dumper means a
  port that reassociates the sum (QUIRK 5) agrees with the oracle, because the oracle made
  the same choice.
- **Bisect `p` by replaying a tick with forced draw values.** Rejected: `nextDouble()`
  returns values on the `k/2^53` grid, so bisection recovers `p` only to ~2⁻⁵³ — not
  bit-exact, which defeats the point of dumping raw bits.
- **Dump only the inputs and let the TS side check `(r < p) == departed`.** Rejected as the
  *only* mechanism: it catches errors that flip a Bernoulli and misses everything else,
  which is precisely the failure mode DR-FIX-A was written about (aggregates that do not
  see a real divergence).

**The patch contract, enforced in code, not asserted.** `Instrument.java`:

1. opens the certified source **read-only** and writes the copy under `websim/`;
2. anchors every rule on a **line number AND the exact trimmed text of a 2–3 line context
   window** — one moved line or one changed character in an anchored statement aborts the
   build with `ANCHOR DRIFT` naming the file, line, expected and actual text;
3. requires every inserted line to begin with `websim.exporter.decision.DecisionProbe.`;
4. **proves only-insertions independently**: it re-reads what it wrote, drops the lines that
   start with the probe prefix, and requires the remainder to be **byte-identical** to the
   certified source. Both SHA-256s are printed and written into the audit;
5. writes `gen-src/instrumentation-audit.txt` listing each insertion beside its anchor, so
   the "no re-derived expressions" rule (below) is checkable by eye in one pass.

**The argument rule.** Every probe argument is one of: an existing local variable, a field, a
method parameter, a pure certified accessor (`getId`, `isOperating`, `isOpenAt`,
`getCapacity`, `getPetIntake`, `isAdultsOnly`, `getOccupancy`, `hasSpaceFor`,
`isPriorityForAdmission`, `useL1`, `petAdmittedAt`, `state.name()`), or a null guard on one
of those. **No probe argument re-evaluates a model expression.** Mutating certified methods
(`admit`, `recordPolicyRefusal`, `blockEdge`, `bumpClosureVersion`) are never called, and no
hook consumes randomness.

**And it is checked empirically, not just argued.** `-Neutrality` runs the identical driver
twice in two JVMs — once against `geo-inst-classes`, once against `geo-classes`, where the
probe calls simply do not exist in the class file — and requires `agents-final.tsv`,
`draws-digest.tsv` and `shelters.tsv` to be byte-identical. That covers every exported
scientific quantity, every private decision field read by reflection, the per-agent draw
count and a SHA-256 over the whole draw sequence.

Insertion sites: **45**, in `step()` blocks 3/6b/6c/6d/6e/6f/6g/7/9/11/13, both choosers,
`reactToClosureWave` and `setDecisionLayer`.

---

## 4. What is dumped

All files land in `websim/pipeline/java-exporter/out/decision-fixtures/` (git-ignored), LF,
UTF-8, **every double as the `%016x` of `Double.doubleToRawLongBits`** — no decimal text
anywhere a port is compared against, for the reason DR-S1/DR-C1 established.

| file | one row per | carries |
|---|---|---|
| `arm.tsv` | resident (all) | `setDecisionLayer` output: the five sampled attributes, `decisionSeed`, `thetaScaled`, `barrierCost`, post-arm state, `awareTick` |
| `hour.tsv` | resident × hour (sampled) | three row kinds: `b` = hour bucket (`hour`, `tick`, `lastDecisionHour`, state, `cNow`, `zR` **before**), `zr` = risk update (`cNow`, `decay`, `zR` **after**), `hz` = hazard (`open`, `vulnerable`, `bRiskEff`, `zR`, `thetaScaled`, `barrierCost`, `u`, `p`) |
| `draws.tsv` | RNG draw (cohort) | agent, draw index, **site tag D1/D2/D3**, raw bits |
| `draws-digest.tsv` | resident (all) | `decisionSeed`, draw **count**, SHA-256 over the raw bits of the whole sequence |
| `transitions.tsv` | state transition (all) | from, to, cause (`outreach`/`hazard`/`latchA`/`latchB`/`admit`/`chooserL0`/`chooserL1`/`retargetCap`/`reentryL0`/`reentryL1`), detail |
| `choice.tsv` | chooser event | `plan` (regime + group-paced speed + node), `v` (L1 candidate: `dM`, `cap`, `ownSpeed`, `walkTimeH`, `v`, running `bestV`, running best id), `d` (L0 candidate: `dM`, `bestDistM`, hasSpace), `pick` (all agents) |
| `door.tsv` | door event (all) | arrival (policyRefused, isOpenAt, priority, petIntake, adultsOnly, capacity, occupancy, hasPet, hasDependents, petAdmitted) and refusal (policyRefused, isOpenAt, useL1) |
| `closure.tsv` | closure event (all) | `scan` (hit, hit index, seenClosureVersion), `pushrule` (push, `thetaScaled`, `pushThetaThreshold`, `kPush`, `barrierCost`, `mobilityPenalty`), `stuck`, `stuck-served`, `reroute` |
| `agents-final.tsv` | resident (all) | end-of-run state + every exported scientific quantity + the private decision fields (`zR`, `lastDecisionHour`, `|believedFull|`, `stuckUntilTick`, `seenClosureVersion`, `currentNodeId`, `pathIndex`, `|pushedBlockages|`, draw count) |
| `shelters.tsv` | shelter × run | load index, **context iteration index** (what the L0 strict-`<` tie-break actually sees), window ticks, reserve, policy columns, final occupancy/peak/refused/policyRefused |
| `coverage.tsv` | branch | one column per run + a total, **for this JVM** |
| `coverage-union.tsv` | branch | `main`, `cov_closures`, `TOTAL` — the union across both JVMs |
| `manifest.json` | — | SHA-256, byte count, line count and head lines per file; the run table; the sampling rule verbatim |

`cov-closures/` is a **second, complete dump of the same twelve files** produced by the
second JVM (config `SEC-A` only). Same schema, same sampling rule; a consumer reads both
directories. It exists because `StreetNetwork.blockEdge()` and `declareClosureSchedule()`
mutate the shared graph permanently, so a second closure arm in the same process would run
on the first one's mutilated graph — and the archived `SE-E18` arm must have the pristine one.

`coverage-union.tsv` is derived from the two `coverage.tsv` files; regenerate it with:

```bash
cd websim/pipeline/out/decision-fixtures
python - <<'EOF'
import csv
def load(p):
    d={}
    for r in csv.reader(open(p,newline='',encoding='utf-8'),delimiter='\t'):
        if not r or r[0].startswith('#') or r[0]=='branch': continue
        try: d[r[0]]=int(r[-1])
        except ValueError: pass
    return d
a=load('coverage.tsv'); b=load('cov-closures/coverage.tsv')
with open('coverage-union.tsv','w',encoding='utf-8',newline='') as f:
    f.write("# WP8 branch coverage -- UNION of the two JVMs (this directory + cov-closures/)\n")
    f.write("branch\tmain\tcov_closures\tTOTAL\n")
    for k in a: f.write("%s\t%d\t%d\t%d\n"%(k,a.get(k,0),b.get(k,0),a.get(k,0)+b.get(k,0)))
EOF
```

### 4.1 On "every term separated" for the L1 utility

`V_j = -betaTravelTime·walkTimeH + betaCapacityPrior·ln(max(1, cap))` has **no Java local
for either term** — the certified statement computes the whole expression in one go. The
argument rule above forbids the probe from re-evaluating `-betaTravelTime * walkTimeH`, so
`choice.tsv` carries the four inputs (`dM`, `cap`, `ownSpeedMps`, `walkTimeH`) and the
result `v`, in raw bits, plus the config coefficients in `manifest.json`. That is
sufficient for a bit-exact comparison: `walkTimeH` pins the first term's only variable
input (and pins QUIRK 3's `dM / (ownSpeedMps * 3600.0)` ordering on its own), `cap` pins the
second, and `v` pins their sum. A port that gets either term wrong cannot match `v`. This is
recorded as a deliberate limitation rather than papered over — see §8.

---

## 5. THE SAMPLING RULE (normative — the TS side must reproduce this subset exactly)

A full 312 h × 6,842-resident trace at hourly granularity is ~2.1 M decision rows per run
before any candidate or draw rows, and there are 15 runs. The dump is therefore sampled, by
a rule that is a pure function of the resident index and the hour and contains no randomness:

```
i  = resident CREATION index (0-based; the ContextCreator placement-loop index)
h  = hour bucket = (int) Math.floor(tick * minutesPerTick / 60.0)

COHORT(i) := ((i * 2654435761) mod 2^32) mod 64 == 0        // ~107 of 6,842
EARLY(h)  := h < 12
```

| stream | written iff |
|---|---|
| `hour.tsv` (all three kinds) | `COHORT(i) OR EARLY(h)` — and only on a **new-hour** tick, because the block does nothing on the other 59 |
| `draws.tsv` | `COHORT(i)` |
| `choice.tsv` candidate rows (`v`, `d`, `plan`) | `COHORT(i)` |
| `choice.tsv` `pick` rows | **every** resident, unconditionally |
| `transitions.tsv`, `door.tsv`, `closure.tsv`, `arm.tsv`, `agents-final.tsv`, `draws-digest.tsv` | **every** resident, unconditionally |

Notes a port must respect:

- `2654435761 · i` stays exact in an IEEE double for every `i < 2^21`, so the TS side is
  `((i * 2654435761) % 4294967296) % 64 === 0` with no BigInt.
- The cohort is a **hash**, not a stride: consecutive indices scatter, so the subset is not
  aligned with camp assignment, with the `PopulationSampler` draw order, or with anything
  else that runs in index order.
- The three unconditional streams are what make the sampling safe. Every state transition,
  every door event and every end-of-run accumulator is present for all 6,842 residents, so
  the sampled streams are a *detail* view, never the only evidence.

### 5.1 Agent order: index order, not the Repast shuffle

**Stated, not hidden.** The driver steps residents in creation-index order, not Repast's
`RANDOM_PRIORITY` shuffle. Everything this oracle exists to pin is provably independent of
that choice: `z_R`, the hour bucket, `decay`, `u`, `p`, the draw sequence, `awareTick`,
`thetaScaled`, `barrierCost` and the belief set depend only on the resident's own private
stream, its own attributes, and `anyShelterOpen(context, tick)` — which is `static` and
resident-independent (`GisAgent.java:888`). What order *does* change is who takes the last
bed when capacity binds, and that is already the port's single declared divergence channel
(`sim.ts:16–23`). A TypeScript run with `agentOrder: "identity"` reproduces this dump's
ordering exactly; a `shuffle-mt` run must not be compared row-for-row against `door.tsv` or
the arrival columns of `agents-final.tsv`.

---

## 6. Configurations

Transcribed from `Geography/batch/batch_params_2026_*.xml`.

| id | scenarioCode | shelters | regime | hazard | pAwareInit | σθ | γ | barriers | petPolicyDefault | βcap | groupΔ | policy variant | smoke | closures | hours |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `E0-A` | 0 | A | L0 | off | 1.0 | 0.0 | 0.0 | 0.0 | 1 (admit) | 0.0 | 0.0 | 0 | observed | none | 312 |
| `E0-B` | 1 | B | L0 | off | 1.0 | 0.0 | 0.0 | 0.0 | 1 | 0.0 | 0.0 | 0 | observed | none | 312 |
| `E0-C` | 2 | C | L0 | off | 1.0 | 0.0 | 0.0 | 0.0 | 1 | 0.0 | 0.0 | 0 | observed | none | 312 |
| `ER-A` | 0 | A_elayer | L1 | on | 0.356 | 1.0 | 0.25 | 0.26 | 0 (refuse) | 0.2 | 0.06 | 1 | observed | none | 312 |
| `ER-C` | 2 | C_elayer | L1 | on | 0.356 | 1.0 | 0.25 | 0.26 | 0 | 0.2 | 0.06 | 1 | observed | none | 312 |
| `SE-E18` | 18 | A_elayer | L1 | on | 0.356 | 1.0 | 0.25 | 0.26 | 0 | 0.2 | 0.06 | 1 | severe v1 | base | 455 |

Seeds 42, 43, 44 for each. `lambdaOutreachPerDay = 0.0` everywhere, exactly as the archive
(QUIRK 28) — nothing rescues an unaware resident in ER.

`SE-E18` is a **coverage extension beyond the requested set**. It is the only configuration
in which `reactToClosureWave` is reachable at all (`routeNodes` is `null` unless
`network.hasClosureSchedule()`), so without it seven branches — closure scan hit/no-hit, the
push rule both ways, the D3 draw, the stuck set, the reroute — could not be triggered by any
run.

Two archive-faithfulness points, both load-bearing:

- **`pushThetaThreshold` is executed as `0.0`, not −0.25.** The archived SE batch files
  declare it `constant_type="number"`, and Repast's batch reader zeroes negative `"number"`
  constants. 0.0 is what the archive *ran*. An oracle reproduces what ran, not what was
  intended (never-regress gotcha 4 / QUIRK 23). The value is exported as
  `pushThetaThresholdExecuted` in `manifest.json` so the port cannot inherit the intent by
  accident.
- **`alphaHazard` is −8.0** and is declared `constant_type="double"` in the archived ER
  files for the same reason. It is passed as a Java `double` literal here, so the defect
  cannot reach it.

Closure arms run **last and only once per JVM**: `blockEdge` and `declareClosureSchedule`
mutate the shared `StreetNetwork` permanently. The driver asserts the ordering rather than
relying on the config list staying sorted.

---

## 7. Results

### 7.0 What ran

20 runs, all to completion, **476.9 MiB / 500,062,249 bytes across 25 files**.

```
E0-A/B/C  seeds 42,43,44      ER-A, ER-C  seeds 42,43,44
LEG-A, ERL-A, L0P-A, SE-E18   seed 42      SEC-A  seed 42 (own JVM, cov-closures/)
```

Selected censuses (full table in `manifest.json`):

| run | sheltered | refused | unreachable | unaware | decision draws |
|---|---|---|---|---|---|
| `E0-A` s42 | 2060 | 4754 | 28 | 0 | 0 |
| `LEG-A` s42 | 2060 | 4754 | 28 | 0 | — (layer off) |
| `ER-A` s42 | 1215 | 1 | 4 | **4414** | 562,037 |
| `ER-C` s42 | 1215 | 1 | 4 | 4414 | 562,037 |
| `ERL-A` s42 | 2046 | 1142 | 12 | 0 | 1,632,374 |
| `SE-E18` s42 | 1252 | 1 | 9 | 4414 | 560,879 |

Four things in that table are checks, not decoration:

1. **`E0-A` reproduces the archive.** 2060 / 4754 / 28 is the archived arm-A seed-42 census
   that WP7's vertical slice already matches. The mirrored build is therefore faithful.
2. **`E0-A` ≡ `LEG-A` — R3, measured.** The decision layer ON with every mechanism
   degenerate, and the decision layer OFF, produce **byte-identical** per-agent end state on
   all 29 non-Phase-E columns of `agents-final.tsv`:
   ```
   awk -F'\t' '$1=="E0-A"  && $2==42' agents-final.tsv | cut -f3-6,8-27,33-37 | sha256sum
   awk -F'\t' '$1=="LEG-A" && $2==42' agents-final.tsv | cut -f3-6,8-27,33-37 | sha256sum
   → a12e30269a94ab1666a17a084b35bb67cdb508269f7d4153f981faf0ee000865   (both)
   ```
   This is WP8's flagship acceptance criterion, exercised here against the Java rather than
   asserted about the port.
3. **`unaware = 4414` = 64.51 %**, against `1 − pAwareInit = 0.644`. Nobody is ever rescued:
   `lambdaOutreachPerDay = 0` (QUIRK 28). The `ERL-A` row is the counterfactual — switch
   outreach on and `unaware` goes to 0 and draws triple.
4. **`ER-A` and `ER-C` are identical on every decision quantity** (same departures, same
   562,037 draws) while their shelter geometry differs completely. That is the private-stream
   design working: the only world input to the hazard is the resident-independent
   `anyShelterOpen`, so geometry cannot reach it.

### 7.1 Instrumentation neutrality — the gate, run

```
dump-decision-trace.ps1 -SkipCompile -Neutrality -Only "ER-A" -OutDir <scratch>
  IDENTICAL: agents-final.tsv  B101923963BD87D70228E63E163432F497013AEBC3D625F4E2756BCED0D14347
  IDENTICAL: draws-digest.tsv  AEB5E41B56478BDE92F7043EF0F8E7BB6106FE33A74574F0265F6489A72F9C5C
  IDENTICAL: shelters.tsv      27CCA38066375B8219D0E6AC88B1182D45FAE1B5975227A407ED6E07806D5E92
== NEUTRALITY GATE PASSED: instrumented == certified on every outcome file
```

Two JVMs, ER-A at seeds 42/43/44, one against `geo-inst-classes` and one against
`geo-classes` where the 45 probe calls do not exist in the class file at all. Identical on
every exported scientific quantity, every reflected private decision field, the per-agent
draw count, the SHA-256 over each agent's whole draw sequence, and shelter occupancy. Taken
with the only-insertions proof (§3), that is the evidence for "the dumper reimplements no
model arithmetic and perturbs nothing".

### 7.2 Branch coverage

**57 of 72 branches triggered.** Per-branch counts are in `coverage.tsv` (per JVM) and
`coverage-union.tsv` (the union, `main + cov-closures`). The 15 that were **not** triggered,
each with the reason and the evidence:

**Structurally unreachable given the certified data files** (verified by reading the five
shelter CSVs actually used, listed in `manifest.json`):

| branch | why | evidence |
|---|---|---|
| BR-44 candidate skipped `!isOperating` | no shelter row is anything but operating | `status` is `operating` for 36/36, 36/36, 46/46, 36/36, 46/46 rows |
| BR-50 L1 `capacity == null` → `UNCAPPED_CAPACITY_PRIOR` | no shelter row has a blank capacity | 0 blank capacities in all five files |
| BR-65 policy refusal via DEPENDENTS | no shelter file has an `adults_only` column at all | column absent in all five (matches WP8-SPEC §8.2) |
| BR-31 `REFUSED_ALL_FULL` re-entry GRANTED | every site opens on the **same** date, so there is never a second opening event; occupancy is monotone, so `somewhereToTry` can never flip true | `opened` = `2020-09-07` for every row of every file. BR-30 (re-entry blocked) fired 375,481,494 times |
| BR-46 candidate skipped `routeTree == null` | `ContextCreator` calls `setRouteTree` for every shelter it creates; a tree-less shelter cannot exist in a built world | mirrored build does the same, by construction |
| BR-53 L1 tie-break TAKEN (`id.compareTo < 0`) | the only exact `v` tie in the data is `Porch_Light_Youth_Shelter` vs `Street_Light_Youth_Shelter` — co-located, same capacity — and `Porch…` is both lexicographically smaller **and** earlier in iteration order, so the running best is already the argmin and the tie-break can never flip | BR-54 (tie seen, **not** taken) fired 4,996 times; every tie row in `choice.tsv` names that pair |

**Reachable in principle, not reached at these configurations** — the closure-reaction family
(BR-32, BR-33, BR-35, BR-36, BR-37, BR-38, BR-39, BR-40, BR-41):

The wave machinery itself works and is proven to run: `SEC-A` (arm A, L1, latch departure so
the whole population is on the street at once, worst-family schedule = 6 waves / 72 edges
over 312 h) entered `reactToClosureWave` **685 times** — BR-34, "scan consumed the wave
version and found no blocked ahead-edge", fired 685 times. Not one scan found a blocked edge
on a walker's *remaining* route, so the push/reroute/stuck sub-tree below the `hit >= 0`
branch was never entered.

The archived `SE-E18` arm is worse: it entered `reactToClosureWave` **zero** times, because
its single wave lands at hour 79 and at ER departure rates only ~1–2 residents are mid-walk
on any given tick.

This is reported as a measurement, not explained away. It is also a finding worth carrying
into WP8's Scenario-E half: 15–18 blocked edges out of 109,434 is a very thin target, and
whether the archived SE arms produce non-zero `blockages_encountered` at all is now a
question with a number attached to it rather than an assumption. See §8 item 6 for the
concrete next step.

---

## 8. Limitations, stated

1. **The L1 utility terms are not separately materialised.** §4.1. `dM`, `cap`,
   `ownSpeedMps`, `walkTimeH` and `v` are dumped in raw bits; `-βT·walkTimeH` and
   `βS·ln(max(1,cap))` are not, because neither is a Java local and the argument rule forbids
   the probe re-deriving them. A wrong term is still caught, through `v`.
2. **Agent order is index order, not the Repast shuffle.** §5.1. `door.tsv`, the arrival
   columns of `agents-final.tsv`, `shelters.tsv` occupancy and the L0 distance-tie outcomes
   are order-sensitive and must be compared against a TS run with `agentOrder: "identity"`.
   Everything in `hour.tsv`, `draws.tsv`, `draws-digest.tsv` and `arm.tsv` is
   order-independent by construction.
3. **`hour.tsv` row kinds are distinguished by field 4**: the literal `zr` or `hz`, otherwise
   the row is a bucket row and field 4 is the hour index. Documented rather than fixed,
   because changing the format costs a full re-run.
4. **The instrumented `GisAgent.java` is generated, not committed.** It is rebuilt from the
   read-only certified source on every build, with the only-insertions proof and the audit
   file. A reviewer checks the audit, not a second copy of the source.
5. **This oracle does not by itself gate anything.** It is a fixture producer. The gates are
   the TypeScript tests WP8 will write against these files.
6. **Nine closure-reaction branches are untriggered and I could not trigger them.** §7.2. The
   scan path is proven live (685 invocations) but no scan found a blocked ahead-edge. The
   next step is a targeted one and does not need a new dumper: take the 15–18 node pairs of
   `closures_E_r1.csv` and check them against the shelter shortest-path trees directly — if
   no blocked pair is a predecessor edge in any arm-A tree, then no walker can ever meet one
   and the Scenario-E counters are zero **by construction**, which would be a defect in the
   closure schedule rather than in the port. That check is a few lines against
   `CertifiedGraph` + `ShelterTrees` and belongs with the closure oracle, not here.
7. **Two coverage-vehicle configs are synthetic.** `ERL-A` (outreach on) and `SEC-A`
   (mass departure + closures) do not correspond to any archived arm and must never be
   quoted as results about 2020. `LEG-A` and `L0P-A` are archived-parameter variants; only
   `L0P-A`'s `petPolicyDefault = 0` under L0 is a combination the archive never ran.
8. **The size target was met but not by much**: 476.9 MiB / 500,062,249 bytes. `hour.tsv`
   alone is 274 MB. Tightening `EARLY_HOURS` (12) or widening `COHORT_MOD` (64) is the lever
   if a future config set needs headroom; both constants are in `DecisionTrace.java` and are
   echoed into `manifest.json`, so a change is visible to the TS side rather than silent.

---

## 9. How the TypeScript side should consume this

In rough order of what fails first if the port is wrong:

1. **`draws-digest.tsv` — draw-count and draw-sequence identity, all 6,842 residents.** This
   is the one test that catches QUIRK 1 (`open &&` gating the hazard draw). A port that
   hoists the draw out of the `if` matches neither the count nor the SHA-256, on every
   resident, on the first ER run. Compare `drawCount` first (cheap, and it localises the
   error to a resident), then the digest.
2. **`arm.tsv` — `setDecisionLayer`.** `thetaScaled`, `barrierCost` (QUIRK 5's accumulation
   order), the post-arm state and `awareTick` (0.0 vs NaN). Bit-exact, zero-tick, no
   simulation needed: this is the cheapest possible first gate and it should be written
   before any tick loop runs.
3. **`hour.tsv` `zr` rows — `decay` and `zR`.** Pins `Math.pow(2.0, -1.0/riskHalfLifeH)`
   against `fdlibmPow` (QUIRK 24) and the `>= 55.5` inclusive cue against the strict `>` used
   by `hoursAboveUnhealthy` (QUIRK 10), on every hour of the first 12 for every resident.
4. **`hour.tsv` `hz` rows — `bRiskEff`, `u`, `p`.** Pins the left-to-right accumulation
   (QUIRK 5), the four-term age-65 `vulnerable` predicate against the five-term age-55
   reporting one (QUIRK 9), and `Math.exp(-u)` against `fdlibmExp` (QUIRK 24).
5. **`hour.tsv` `b` rows — `hour`, `lastDecisionHour`.** Pins `tick * minutesPerTick / 60.0`
   (QUIRK 3) and the monotone-index `newHour` test (QUIRK 2), including the `-1` initial value.
6. **`choice.tsv` `v` rows — the L1 chooser.** `walkTimeH` pins `dM / (ownSpeedMps * 3600.0)`
   (QUIRK 3) *and* the group-paced `ownSpeedMps` (QUIRK 20); `cap` pins the
   `UNCAPPED_CAPACITY_PRIOR` substitution (QUIRK 19); `v` beside the running `bestV` and best
   id pins the argmin-lexicographic tie-break (QUIRK 6, QUIRK 14).
7. **`transitions.tsv` and `door.tsv`.** The three-way `&&` side-effect switch at the door
   (QUIRK 18), the regime-dependent belief update, the per-episode `retargetCount` cap
   (QUIRK 15, QUIRK 16).
8. **`agents-final.tsv`.** End-of-run identity on every exported quantity plus the private
   decision fields — the backstop that catches anything the per-event streams missed.

Reproduce the sampled subset with the rule in §5 verbatim. Do not re-derive it from row
counts.
