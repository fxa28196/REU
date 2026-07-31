# DR-S1 — geodesic `Direct` parity (spike WP2-S1, plan Q12)

**Status:** CLOSED with measurements. Primary approach held; no fallback invoked.
**Date:** 2026-07-30
**Decision:** **Stock geographiclib-js is acceptable.** Do not port Java's `Geodesic.Direct`
verbatim. Revise the plan Q12 epsilon from `≲1e-9 m` to a **1e-8 m budget** against a
**measured 3.159e-9 m** ceiling.

---

## 1. What was measured, and against what

### 1.1 The Java implementation the certified model actually uses

`Geography/src/geography/routing/StreetNetwork.java:14` and `agents/GisAgent.java:5-6`
import `net.sf.geographiclib`. Exactly **one** jar in the entire Repast Simphony 2.11.0
install provides `net/sf/geographiclib/Geodesic.class` (verified by scanning every jar
in the install):

```
C:/Users/Chick/RepastSimphony-2.11.0/eclipse/plugins/
  repast.simphony.gis_2.11.0/lib/GeographicLib-Java-1.49.jar
```

`META-INF/maven/.../pom.properties` → `version=1.49`, built 2017-10-05. `Geography/build.gradle`
pulls it in via the `repast.simphony.*/**/*.jar` fileTree, so this is unambiguously the
library behind every archived run. PORT_MAP's "GeographicLib/Karney" attribution is correct.

### 1.2 The only production `Direct` call site

`GisAgent.java:536-537`, inside the per-tick movement loop:

```java
GeodesicData toNext = Geodesic.WGS84.Inverse(current.y, current.x, next.y, next.x);
GeodesicData moved  = Geodesic.WGS84.Direct(current.y, current.x, toNext.azi1, remainingM);
```

Two things follow, and both shaped the fixture design:

- `azi1` is never arbitrary — it is always the `azi1` **output of an Inverse solve**.
- `s12` is `remainingM`, the residual after whole polyline vertices are consumed, so it is
  bounded by inter-vertex spacing, not by the tick step length (`walkingSpeedMps × 60 ×
  minutesPerTick`, ≈ 80 m at the pinned `minutesPerTick = 1`).

So two fixture sets were dumped, 10,000 tuples each:

| set | azimuth sampling | why |
|---|---|---|
| `uniform` | `azi1` uniform on [-180, 180) | the spike brief; broad adversarial coverage |
| `prodshape` | `azi1` = `Inverse(p1, p2).azi1` for a random nearby `p2` (5–400 m) | exactly how production obtains it |

Both sample `lat1 ∈ [45.2, 45.8]`, `lon1 ∈ [-123.0, -122.3]` (Portland bbox), `s12 ∈ [1, 500] m`,
via a fixed-seed `java.util.Random` (a specified LCG, so the fixtures regenerate byte-identically
on any conforming JVM). Every field is dumped as a raw IEEE-754 bit pattern
(`Double.doubleToRawLongBits`, 16 hex digits) — no decimal formatting anywhere in the loop.

---

## 2. Headline result

Stock `geographiclib-geodesic` 2.2.0 on Node v24.18.0 (V8) vs GeographicLib-Java 1.49 on
Temurin 17.0.19, default JVM settings — i.e. the exact configuration that produced the
archived runs:

| metric | `uniform` | `prodshape` |
|---|---|---|
| bit-exact `lat2` | 4,815 / 10,000 | 4,908 / 10,000 |
| bit-exact `lon2` | 9,008 / 10,000 | 9,025 / 10,000 |
| **bit-exact `lat2` AND `lon2`** | **4,419 / 10,000 (44.19 %)** | **4,514 / 10,000 (45.14 %)** |
| bit-exact `azi2` | 7,621 / 10,000 | 7,469 / 10,000 |
| max ULP `lat2` / `lon2` / `azi2` | 4 / 1 / 7 | 4 / 1 / 6 |
| ULP histogram (max of lat2,lon2) | `{0: 4419, 1: 4762, 2–4: 819}` | `{0: 4514, 1: 4725, 2–4: 761}` |
| **max position error** | **3.158709e-9 m** | **3.158982e-9 m** |
| mean position error | 5.529625e-10 m | 5.409064e-10 m |
| p50 / p99 position error | 7.896779e-10 / 1.930380e-9 m | 7.896769e-10 / 1.930199e-9 m |

**Bit-exactness is NOT achieved: ~44–45 %.** But the disagreement is confined to the last
1–4 bits of the mantissa and never exceeds **3.16 nanometres**.

The p50 error, 7.8968e-10 m, is exactly 1 ULP of a latitude near 45.5° converted to metres
(`2^-47 deg × 111,141 m/deg`). The median case is a one-bit difference in `lat2` — the
signature of last-bit arithmetic noise, not of an algorithmic divergence.

Error magnitude is **independent of `s12`**: the five worst rows span `s12` = 4.2 m to
427.6 m. It tracks the magnitude of the latitude coordinate, not the step length.

Position error uses a local flat-earth metric,
`hypot(Δlat × mPerDegLat(lat1), Δlon × mPerDegLon(lat1))` with the standard WGS84 degree-length
series. At nanometre magnitudes the metric's own ~cm/deg accuracy is irrelevant — it is only
a scale factor.

---

## 3. Three follow-up experiments that determine the recommendation

Measuring the headline number is not enough to choose between "stock JS", "fdlibm routing"
and "verbatim port", because those options only differ if you know *what causes* the gap.

### 3.1 It is not the library version — ruled out

`geographiclib` 1.52.2 (the last of the 1.x JS line, closest to Java 1.49) and
`geographiclib-geodesic` 2.2.0 were run head to head over all 20,000 tuples:

> **20,000 / 20,000 bit-identical.** Both agree with Java on exactly the same 4,419 /
> 4,514 rows, with the same 3.1587e-9 / 3.1590e-9 m maxima.

The 1.49-vs-2.2.0 major-version gap contributes **nothing**. Pinning an older JS release
would buy zero improvement. *(Probe run in scratch, not committed — it needs a deprecated
package. Reproducible in ~30 lines against the committed fixtures.)*

### 3.2 It is only partly the libm — and the "certified" Java number is itself unstable

`javap` over the jar shows GeographicLib-Java 1.49 calls **`java.lang.Math`**, never
`StrictMath`: 25 `sqrt`, 16 `atan2`, 13 `cos`, 12 `sin`, 3 `pow`, 1 `log`, 1 `log1p`.

In JDK 17, `Math.sin/cos/tan/log/log10/exp/pow` are `@IntrinsicCandidate` — HotSpot
substitutes x86-64 LIBM stubs that are **not** fdlibm; without the intrinsic they fall back
to `StrictMath` (fdlibm). So the fixture dump was repeated with

```
-XX:+UnlockDiagnosticVMOptions -XX:DisableIntrinsic=_dsin,_dcos,_dtan,_dlog,_dlog10,_dexp,_dpow
```

> **1,567 / 10,000 (`uniform`) and 3,509 / 10,000 (`prodshape`) output rows change.**

**This is the most consequential finding of the spike.** The certified Java `Direct` output
is not an absolute; it is a property of *the JVM's math-intrinsic configuration*. "Bit-exact
against Java" is only well defined once you name the JVM build and flags.

Against that StrictMath-mode Java, stock JS agrees on 4,753 / 10,000 (47.53 %) and
4,785 / 10,000 (47.85 %) — **better, but only by ~3 points, and the maxima are unchanged**
(3.158866e-9 / 3.158982e-9 m).

So the residual gap is **not** dominated by libm either. What remains is expression-ordering
and helper-function differences between two independent ports of the same algorithm
(`AngRound`, `sincosd`, `atan2d`, `hypot`, and V8's `Math.hypot`, which is not correctly
rounded). Chasing it is not worth the budget, because of §3.3.

### 3.3 The gap sits inside GeographicLib's own noise floor

The plan's movement hot path (§3.4, "cumulative-length hoist") replaces Java's per-tick
`Inverse(current, next).s12` with scalar arithmetic on baked cumulative edge lengths. That
substitution is only as faithful as the library's own round-trip closure. Measured on the
`prodshape` set:

> **max `|Inverse(p1, Direct(p1, azi, s)) − s|` = 3.035609e-9 m.**

Compare with the Java-vs-JS parity ceiling of **3.158982e-9 m**. They are the *same number
to within 4 %*. The Java/JS disagreement is not a porting defect sitting on top of a clean
baseline — it is the same size as the numerical noise the plan's own optimisation already
accepts. Driving the port error to zero would leave the hoist error untouched and would not
move the outcome by a single bit.

This is frozen as a CI assertion (`parity < 10 × roundTrip`) so the claim cannot rot.

---

## 4. Does 3.16 nm matter? Exposure analysis

Tracing every consumer of the perturbed coordinate:

| consumer | exposure | why |
|---|---|---|
| Smoke dose | **none** | SmokeField is county-uniform hourly PM2.5 with **no spatial interpolation** (PORT_MAP §1.7). Dose is a function of hour only; position cannot enter it. |
| Edge weights, Dijkstra, snapping, every distance-derived output | **none** | Baked Java Float64 from the exporter (Q8/Q12) — identity by construction. |
| `distanceTraveledM` | **none** | In the `Direct` branch `remainingM` is set to 0, so the accumulator takes `+= stepLengthM − 0` exactly, independent of what `Direct` returned. |
| Rendered agent position | cosmetic | 3 nm on a screen measured in metres per pixel. |
| `dM <= remainingM` loop branch | **the only real one** | A nanometre can flip the comparison at a knife edge, moving `pathIndex` by 1 for that tick. |

Only the last one can change an observable. Flipping an *intermediate* vertex test is
self-healing (the loop immediately takes the `Direct` branch with a ~0 m residual and the
distance accumulator still lands on `stepLengthM`). It becomes outcome-relevant only on the
**final** vertex of a path, where it shifts the arrival tick by one — which propagates to
admission order and bed allocation.

Order-of-magnitude bound, assumptions stated: the residual is spread over a tick step of
≈ 80 m (`walkingSpeedMps ≈ 1.34 × 60 × minutesPerTick = 1`); treating it as locally uniform,
`P(within 1e-8 m of the boundary) ≈ 2e-8 / 80 ≈ 2.5e-10` per final-vertex test. A worst-case
run (6,842 agents × 455 h = 1.87e8 agent-ticks) performs of order 1e4–1e5 such tests
(one per journey plus re-plans), giving **~1e-5 expected arrival-tick flips per worst-case
run**.

That is an estimate from a uniformity assumption, **not a census**. The real knife-edge
census over the actual graph geometry is plan Q12's build-time obligation and belongs to
WP5/WP7. This bound only establishes that the spike does not block them.

---

## 5. Decision and plan amendments

### 5.1 Recommendation: **stock js acceptable**

Measured 3.159e-9 m ≪ 1e-6 m, the plan's stated trigger for the verbatim-port contingency.
The fallback is **not** invoked.

### 5.2 Amend the Q12 epsilon: `1e-9 m` → `1e-8 m`

Q12 anticipated "agreement ≲ 1e-9 m". The measurement is 3.16e-9 m — **3× above the stated
expectation**, though 316× below the fallback trigger. The plan's expectation was optimistic
and should be corrected rather than quietly re-interpreted. Codified as
`S1_MAX_POSITION_ERROR_BUDGET_M = 1e-8` in `validation/src/geodesic-parity.ts`: one order
above the measurement, two below the trigger.

### 5.3 Correct the WP2-S1 fallback: a verbatim port would NOT buy bit-identity

The plan names "verbatim Java Direct port" as the S1 fallback, and Q12 describes it as
"~600 lines of pure double math". **§3.2 shows that fallback cannot deliver what its name
implies.** A verbatim port still has to evaluate `sin`, `cos`, `pow`, `log`; to reproduce the
archived runs it would have to reproduce **HotSpot's x86-64 LIBM intrinsics**, which are
neither fdlibm nor portable nor specified. Routing it through the WP3 fdlibm module would
target `StrictMath` semantics instead — measured at 47.5 % agreement, still not identity.

Bit-identity with the archived Java `Direct` is **unattainable in the browser at any
budget**. The fallback should be re-labelled from "achieves parity" to "reduces the epsilon,
at ~600 lines of risk, for no reachable identity guarantee" — which is precisely why it
should not be invoked.

### 5.4 Do not weaken the fdlibm mandate — but restate its job

Risk W4's fdlibm module remains mandatory, and §3.2 does not undercut it. Its job is
**JS ≡ JS across browsers**, not JS ≡ Java. Those are different targets and this spike only
measured the second. Note the interaction for WP3: routing geographiclib-js through fdlibm
will *change* the numbers in §2 (it shifts the JS side toward `StrictMath`), so the CI budget
must be re-measured after WP3 lands, not assumed to carry over. It stays comfortably inside
1e-8 m either way — both Java configurations produced the same 3.16e-9 m ceiling.

### 5.5 Tier attribution

Movement geometry is **Tier 4** (structural, not bit-parity), documented epsilon 1e-8 m,
with the §4 exposure table as the argument that no Tier 0–3 gate is affected. Distance,
dose, routing and admission outputs remain Tier 0 candidates because none of them consume
the `Direct` coordinate.

---

## 6. Artefacts and reproduction

| path | what |
|---|---|
| `websim/pipeline/java-exporter/src/websim/exporter/GeodesicDirectFixtureDumper.java` | fixture dumper; links only `net.sf.geographiclib`, imports nothing from `geography.*` |
| `websim/pipeline/java-exporter/build-and-dump.ps1` | resolves the GeographicLib jar the same way `Geography/build.gradle` does; `javac -d` into `websim/` only |
| `websim/pipeline/java-exporter/fixtures/geodesic-direct-uniform.tsv` | 10,000 tuples, 1,190,501 B — **tracked**, this is the evidence |
| `websim/pipeline/java-exporter/fixtures/geodesic-direct-prodshape.tsv` | 10,000 tuples, 1,190,503 B — **tracked** |
| `websim/validation/src/geodesic-parity.ts` | measurement core + the two budget constants |
| `websim/validation/scripts/spike-s1-geodesic-parity.ts` | CLI (`--dir`, `--roundtrip`, `--json`) |
| `websim/validation/test/geodesic-parity.test.ts` | 10 assertions freezing this DR's numbers into CI |
| `websim/validation/scripts/spike-s1-results.json` | full machine-readable report incl. worst-row hex |

```powershell
# regenerate fixtures (needs JDK 17 + a Repast Simphony 2.11.0 install)
.\websim\pipeline\java-exporter\build-and-dump.ps1 -N 10000

# re-measure
cd websim; npx tsx validation/scripts/spike-s1-geodesic-parity.ts --roundtrip --json validation/scripts/spike-s1-results.json
npx vitest run --project validation
```

The regression test **fails loudly** if the fixtures are missing rather than skipping —
a silently skipped parity gate is exactly risk W18.

---

## 7. Honest limitations

1. **One engine.** Every JS number is V8 / Node v24.18.0 on Windows x64. Cross-browser
   variation is untested here by design; that is WP3 + the three-browser CI gate.
2. **One JVM.** Temurin 17.0.19 on Windows x64. §3.2 proves the Java side is
   configuration-sensitive, so these fixtures are "Java as the archive was produced",
   not "Java in the abstract".
3. **20,000 cases, not 10^6.** Q12 asks for a 10^6-case differential test over `(edge,
   fraction)` pairs sampled from the *real graph*. This spike used synthetic bbox sampling
   because the graph asset does not exist until WP2-S2/WP4. Real-graph geometry could
   surface configurations these samples miss — though the ULP histogram (nothing above
   4 ULP, nothing in the `5-16` or `>16` buckets across 20,000 cases) makes a jump of two
   orders of magnitude to the 1e-6 m trigger implausible.
4. **The knife-edge number in §4 is an estimate, not a census.** Stated assumptions,
   deliberately not dressed up as a measurement.
5. **Root cause not fully isolated.** §3.1 and §3.2 eliminate library version and libm as
   *dominant* causes; the residual (expression ordering / helper implementations across two
   independent ports) was not chased to individual expressions, because §3.3 makes the
   answer decision-irrelevant.
