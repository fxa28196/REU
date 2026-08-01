# WP8 SPEC — Severe smoke series, triage reserve, pet policy, and the E/SE manifest surface

**Status:** specification, written 2026-07-31 for WP8 (`IMPLEMENTATION_PLAN.md` §8, WP8).
**Authority:** the Java under `Geography/src/geography/` is the instrument of record. Where this
document and `IMPLEMENTATION_PLAN.md` / `PORT_MAP.md` disagree with the archive under
`docs/runs/`, **the archive wins** — see §7 for three discrepancies found while writing this.

**Everything numeric in this document was recomputed from primary sources, not copied from
prose.** The recomputation commands are listed in §8.4 so a reviewer can re-run them.

**Never-regress reminders that apply inside this scope** (all four are load-bearing). Two of them
are enforced by `websim/tools/lint-claims.ts`, so this document states them *by rule name* rather
than by quoting the banned strings — quoting them here would fail the linter, as the first draft
of this file did:
1. `banned-citation`: the awareness/evacuation citation is **Coughlan, Huber-Stearns, Clark & Deak
   2022 (EWP Working Paper 111)**. The superseded mis-attribution the linter bans must never
   reappear in prose, comments, or UI copy.
2. `banned-severity-mention`: **no comparison to the banned wildfire event, in any phrasing.** The
   severe series is a *labeled constructed counterfactual* described only in its own terms — scale
   factor, anchor, provenance sidecar. The v2 anchor is Canberra Florey, 2,496.1 µg/m³, 5–6 Jan
   2020. `build_smoke_severe.py` bans the comparative framing in its own docstring; do not import
   it from any earlier draft.
3. `simulationHours <= slices − 1`. §1.6 is the whole story.
4. Repast batch parameter files zero out **negative** constants declared `constant_type="number"`.
   Negative constants must be declared `constant_type="double"`. This has already corrupted the
   archive once — §7.2.

---

## 0. Scope and source inventory

| Subsystem | Java source | TS destination |
|---|---|---|
| Hourly PM2.5 field, severe series, oor counter | `Geography/src/geography/env/SmokeField.java` (169 lines) | `websim/engine/src/smoke/field.ts` (exists) |
| Series selection, scale, fail-fasts | `ContextCreator.java:206-214, 304-340, 510-535` | `websim/engine/src/world/build.ts` |
| Triage reserve, capacity, open windows, policy columns | `Shelter.java` (208 lines), `ContextCreator.java:537-627` | `websim/engine/src/shelters/shelter.ts` (exists) |
| Priority predicate, door gate, pet gate | `GisAgent.java:545-592, 654-674, 866-884` | `websim/engine/src/shelters/admit.ts` (exists) |
| Barrier cost incl. pet term | `GisAgent.java:934-959` | `websim/engine/src/agents/*` (WP8) |
| E-attribute sampling incl. the pet draw | `ELayerSampler.java:146-183` | `websim/engine/src/agents/eLayerSampler.ts` (WP6) |
| Manifest parameter surface | `ContextCreator.java:811-851`, `OutcomeLogger.java:305-335, 811-816` | `websim/shared/src/schema.ts`, `output/logger.ts` |
| Gates (h)/(i)/(j) | `scripts/verify_E_runs.py:85-111, 615-624, 630-669` | `websim/validation/harness/` |
| Series builder + 19-check | `scripts/build_smoke_severe.py` (711 lines) | `websim/pipeline/scripts/build-smoke.ts` |

Archive consulted: `docs/runs/phase-e/` (12 runs), `docs/runs/scenario-e/` (21 runs),
`docs/runs/scenario-e-v2/` (27 runs), plus the **discarded** `Geography/output/superseded-456h/`
(the 456-hour matrix — primary evidence for §1.6), all read-only.

---

## 1. THE SEVERE SMOKE SERIES

### 1.1 The three registered series and their archived triples

`smokeSeriesCode` selects one of exactly three committed CSVs
(`ContextCreator.java:512-513`):

```java
String smokeCsv = (smokeSeriesCode == 2) ? SMOKE_SEVERE_V2_CSV
        : (smokeSeriesCode == 1) ? SMOKE_SEVERE_CSV : SMOKE_CSV;
```

with (`ContextCreator.java:77`, `213-214`):

```java
private static final String SMOKE_CSV        = "data/airnow/aqs_hourly_pm25_portland_2020-09.csv";
private static final String SMOKE_SEVERE_CSV = "data/airnow/aqs_hourly_pm25_synthetic_severe_v1.csv";
private static final String SMOKE_SEVERE_V2_CSV = "data/airnow/aqs_hourly_pm25_synthetic_severe_v2.csv";
```

**Assignment of the three archived triples (this is the question the task asks; answer verified by
recomputing all three fields from the CSVs, §8.4-A):**

| triple | series | `smokeSeriesCode` | file | embedded transform |
|---|---|---|---|---|
| **576 / 562.7** | **observed** | 0 | `aqs_hourly_pm25_portland_2020-09.csv` | none (identity) |
| **456 / 984.75** | **severe v1** | 1 | `aqs_hourly_pm25_synthetic_severe_v1.csv` | scale ×1.75, stretch ×1.5, tail 3 d |
| **456 / 2496.1** | **worst-plausible v2** | 2 | `aqs_hourly_pm25_synthetic_severe_v2.csv` | scale ×4.436, stretch ×1.5, tail 3 d |

Recomputed facts (exact, from the CSVs, county `Multnomah`, anchor `2020-09-07T00:00`):

| | observed | severe v1 | worst v2 |
|---|---|---|---|
| CSV data rows (all counties) | 4,795 | 3,890 | 3,890 |
| Multnomah slices (`hours()`) | **576** | **456** | **456** |
| NaN gap hours | **0** | **0** | **0** |
| peak (double) | `562.7` | `984.75` | `2496.1000000000004` |
| peak hour index | 140 | 140 | 140 |
| min non-NaN | 1.9 | 4.7 | 12.0 |
| hour 0 | 5.5 | 9.6 | 24.35 |
| hour 311 | 4.55 | 307.3 | 778.95 |
| hour 455 | 5.25 | 10.05 | 25.5 |

`SMOKE_SEVERE_V2_CSV`'s scale factor is anchored, per its provenance sidecar, to
2,496.1 µg/m³ measured at Florey, Canberra on the night of 5–6 Jan 2020 (ACT open data
`94a5-zqnn`): `4.436 = 2496.1 / 562.7`. Fort McMurray's 5,229 µg/m³ ceiling is *cited but
deliberately not scaled to*. Reproduce that text verbatim in the UI counterfactual banner; do not
paraphrase it into a comparison with any other fire.

### 1.2 How the slice array is built — `SmokeField` constructor, exact

`SmokeField.java:60-116`. Executed **once**, at world build, before tick 0. **Zero RNG.**

```java
TreeMap<Integer, double[]> sumCount = new TreeMap<Integer, double[]>(); // hourIndex -> {sum,count}
int maxHour = -1;
List<Map<String, String>> rows = CsvLoader.read(csvPath);
for (Map<String, String> row : rows) {
    if (!county.equalsIgnoreCase(row.get("County Name"))) { continue; }
    String dateStr = row.get("Date Local");   // yyyy-MM-dd
    String timeStr = row.get("Time Local");    // HH:mm
    String valStr = row.get("Sample Measurement");
    if (dateStr == null || timeStr == null || valStr == null || valStr.isEmpty()) { continue; }
    double val;
    try { val = Double.parseDouble(valStr); } catch (NumberFormatException e) { continue; }
    LocalDateTime obs = LocalDateTime.of(
            LocalDate.parse(dateStr),
            LocalTime.parse(timeStr.length() == 5 ? timeStr : timeStr.substring(0, 5)));
    int hourIndex = (int) ChronoUnit.HOURS.between(startDateTime, obs);
    if (hourIndex < 0) { continue; }
    double[] sc = sumCount.get(hourIndex);
    if (sc == null) { sc = new double[] { 0, 0 }; sumCount.put(hourIndex, sc); }
    sc[0] += val;
    sc[1] += 1;
    if (hourIndex > maxHour) { maxHour = hourIndex; }
}

hourlyUgM3 = new double[maxHour + 1];
for (int h = 0; h <= maxHour; h++) {
    double[] sc = sumCount.get(h);
    hourlyUgM3[h] = (sc == null || sc[1] == 0) ? Double.NaN
            : (sc[0] / sc[1]) * scaleFactor;
}
```

**Exact evaluation order and types:**

1. `CsvLoader.read` (`CsvLoader.java:35-65`) — UTF-8 decode, one BOM `U+FEFF` stripped from the
   header line only, `splitCsv` honours `"` quoting and `""` escapes and **`.trim()`s every
   field**. Short rows are padded with `""`; extra fields are discarded. Blank lines skipped.
   Row order = file order. Returns `LinkedHashMap` per row (insertion-ordered, but only used by
   key lookup here).
2. County filter: `county.equalsIgnoreCase(row.get("County Name"))`. The *literal* is the
   receiver, so a missing column (`null` arg) returns `false` and the row is skipped — never an
   NPE. In TS you must write `county.toLowerCase() === (row["County Name"] ?? "").toLowerCase()`
   or an explicit null guard; `undefined.toLowerCase()` throws.
3. `valStr.isEmpty()` — after `CsvLoader`'s trim, so a whitespace-only cell is `""` and skipped.
4. `Double.parseDouble` — Java accepts leading/trailing whitespace, `d`/`f` suffixes, hex float
   literals, `Infinity`, `NaN`. `Number("")` in JS is `0`, `parseFloat("12abc")` is `12`. Use a
   strict Java-`parseDouble`-equivalent; on failure **skip the row silently** (no throw).
5. `LocalDate.parse(dateStr)` — strict `ISO_LOCAL_DATE`. `"2020-9-7"` **throws**
   `DateTimeParseException` (uncaught here → run aborts). Not caught by the `NumberFormatException`
   handler above it.
6. `LocalTime.parse(timeStr.length() == 5 ? timeStr : timeStr.substring(0, 5))` — a length-5
   string is parsed whole; anything else is truncated to its first 5 chars. **A string shorter
   than 5 chars throws `StringIndexOutOfBoundsException`.** `"01:00:00"` → `"01:00"`.
7. `ChronoUnit.HOURS.between(startDateTime, obs)` returns a **`long`**, truncated *toward zero*,
   then narrowed by `(int)`. Verified: `between(2020-09-07T00:00, 2020-08-31T16:00) == -152`, so
   the observed file's 152 pre-anchor hours are dropped. Negative → `continue`.
8. `sumCount` is a `TreeMap` but iteration order is irrelevant — the second loop indexes it by
   `h` directly. **Do not port this as a HashMap-order-dependent reduction.**
9. `sc[1]` is a **`double`** counter incremented by `1`, not an int. `sc[1] == 0` can only be true
   if the array was just allocated, which cannot happen (`sc[1] += 1` runs on the same iteration),
   so the branch is belt-and-braces.
10. Array length is `maxHour + 1`. **Interior missing hours become `Double.NaN`.** All three
    committed series have zero gaps (verified), but the port must preserve the semantics: the
    asset format `smoke-{0,1,2}.json` encodes NaN as JSON `null`.
11. `scaleFactor` is applied **once, here, to real values only**. `NaN * s` is `NaN` anyway; the
    branch keeps the gap semantics explicit. `x * 1.0 === x` exactly in IEEE-754, so
    `smokeScale = 1.0` is the bit-exact identity.

**The mean is over however many monitors reported that hour — not a fixed 2-monitor average.**
Verified on all three files: Multnomah has exactly two monitors (`Site Num` 0080 POC 3 and 2011
POC 3), and **hours 20 and 21 have only one reporting monitor** (574 two-monitor hours + 2
one-monitor hours in the observed series; 454 + 2 in each severe series). A port that hardcodes
`(a + b) / 2` produces two wrong hours inside the minor spike.

### 1.3 Peak scaling — the peak is NOT `scale × observedPeak`

`SmokeField.java:159-167`:

```java
public double peakHourly() {
    double mx = 0;
    for (double v : hourlyUgM3) {
        if (!Double.isNaN(v) && v > mx) { mx = v; }
    }
    return mx;
}
```

`mx` starts at **`0`, not `−Infinity`**: an all-NaN field reports `0.0`, and a field whose values
are all negative would also report `0.0`. `NaN > mx` is `false` in both Java and JS, so the
`isNaN` guard is redundant but must be kept for readability parity.

**Why the peak does not equal `scale × observed peak` (verified arithmetic at hour 140):**

`build_smoke_severe.py:264-275` scales and re-rounds **per monitor row**, in exact decimal, to the
source file's one-decimal convention, *before* `SmokeField` averages them:

```python
scaled = (Decimal(val_str) * scale).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
text = format(scaled, "f")
if text.endswith(".0"):
    text = text[:-2]
return text
```

| hour 140 | monitor 0080 | monitor 2011 | mean = field value |
|---|---|---|---|
| observed | 539.3 | 586.1 | **562.7** |
| v1 (×1.75) | `1.75·539.3 = 943.775 → 943.8` | `1.75·586.1 = 1025.675 → 1025.7` | **984.75** |
| v2 (×4.436) | `4.436·539.3 = 2392.3348 → 2392.3` | `4.436·586.1 = 2599.9396 → 2599.9` | **2496.1000000000004** |

Compare: `1.75 × 562.7 = 984.725` (**≠ 984.75**) and `4.436 × 562.7 = 2496.1372`
(**≠ 2496.1000000000004**). The builder's own check tolerates this with `tol = 0.051`
("*Rounding to 1 dp per monitor then averaging two monitors: max error 0.05*") and its PASS lines
read `984.75 vs 984.73` and `2496.10 vs 2496.14`.

**Consequence for the port, and this is a landmine:** the severe arrays **must be built by parsing
the committed severe CSVs**, never by multiplying the observed array. Multiplying would produce a
plausible-but-wrong asset: wrong length (576, not 456), wrong episode structure (no stretch, no
tail truncation), and a peak off by 0.025 / 0.037 µg/m³. `build-smoke.ts` must run the
`SmokeField` reducer over each of the three CSVs independently.

Also note `format(scaled, "f")` drops a trailing `.0`, so the severe CSVs contain values written
as `11`, not `11.0`. `Double.parseDouble("11")` is `11.0`; the field value at hour 0 of v1 is
`(11.0 + 8.2) / 2 = 9.6`, not `1.75 × 5.5 = 9.625`.

### 1.4 `concentrationForTick` — the indexing

`SmokeField.java:118-147`:

```java
public int hours() { return hourlyUgM3.length; }

public double concentrationAtHour(int hourIndex) {
    if (hourIndex < 0 || hourIndex >= hourlyUgM3.length) { return Double.NaN; }
    return hourlyUgM3[hourIndex];
}

public double concentrationForTick(double tick, double minutesPerTick) {
    int hourIndex = (int) Math.floor((tick * minutesPerTick) / 60.0);
    double c = concentrationAtHour(hourIndex);
    if (Double.isNaN(c)) { outOfRangeLookups++; return 0.0; }
    return c;
}
```

- `tick` and `minutesPerTick` are **`double`**; `hourIndex` is **`int`**. The `(int)` cast
  truncates toward zero, but `Math.floor` has already run, so the two agree for the non-negative
  ticks the schedule produces. For a hypothetical negative tick the composition is still
  `floor` (Java's `(int)(-1.0)` is `-1`), so `Math.floor` in TS is correct in both directions.
- With `minutesPerTick = 1.0`, `hourIndex = floor(tick / 60)`. Ticks 1..59 → hour 0; tick 60 →
  hour 1; tick 27300 → hour 455; tick 27360 → hour 456.
- **A gap and an out-of-window index are the SAME branch.** `concentrationAtHour` returns `NaN`
  for both, so `outOfRangeLookups` cannot distinguish them. The name is a misnomer; do not "fix"
  it by splitting the counter.
- A `NaN` lookup returns **`0.0` AND increments the counter**. Both halves matter: the zero enters
  exposure/dose/hours-above arithmetic for that tick, and the counter is gate (j).
- `outOfRangeLookups` is a **`long`** (`SmokeField.java:36`). It is run state and must be included
  in engine snapshots (`IMPLEMENTATION_PLAN.md` §3.5); `field.ts` already exposes
  `setOutOfRangeLookups`.

**The double lookup per tick.** `GisAgent.step()` calls `concentrationForTick` **twice** on a tick
where the resident is still `PRE_EVAC` or `UNAWARE`:

- `GisAgent.java:332-333` — the exposure block, entered whenever `state != SHELTERED`:
  ```java
  if (smokeField != null && state != State.SHELTERED) {
      double c = smokeField.concentrationForTick(tick, minutesPerTick);
  ```
- `GisAgent.java:365-367` — the departure block, entered whenever `state == UNAWARE || PRE_EVAC`:
  ```java
  if (state == State.UNAWARE || state == State.PRE_EVAC) {
      double cNow = (smokeField == null) ? 0.0
              : smokeField.concentrationForTick(tick, minutesPerTick);
  ```

So per tick the exact lookup count is
`(n − sheltered) + (pre_evac + unaware)`, evaluated **at lookup time**, not at end of run.
§1.6 verifies this identity to the unit against the discarded archive.

### 1.5 `out_of_range_lookups == 0` — gate (j)

`OutcomeLogger.java:329-335` writes the block:

```java
w.println("  \"smoke_field\": {");
w.println("    \"county\": \"" + jsonEsc(smokeField.getCounty()) + "\",");
w.println("    \"start\": \"" + smokeField.getStartDateTime() + "\",");
w.println("    \"hours\": " + smokeField.hours() + ",");
w.printf(Locale.US, "    \"peak_hourly_ugm3\": %.1f,%n", smokeField.peakHourly());
w.println("    \"out_of_range_lookups\": " + smokeField.getOutOfRangeLookups());
w.println("  },");
```

`scripts/verify_E_runs.py:644-669` (gate **(j)**, `--se` runs only) does exactly four things, and
**skips entirely when `smokeSeriesCode` is 0**:

```python
SEVERE_SERIES = {
    1: ("data/airnow/aqs_hourly_pm25_synthetic_severe_v1.csv", 984.75),
    2: ("data/airnow/aqs_hourly_pm25_synthetic_severe_v2.csv", 2496.10),
}
...
if series not in SEVERE_SERIES:
    ck.skip(f"(j) [{run.name}] severe-series provenance",
            f"smokeSeriesCode={series} (observed series)")
    return
series_csv, series_peak = SEVERE_SERIES[series]
ok_file = series_csv in files                                  # (j.1) input_datasets carries it
...
ck.add(... "severe series length is 456 h", hours == 456, ...) # (j.2) HARDCODED 456
peak = float(smoke.get("peak_hourly_ugm3", float("nan")))
want = series_peak * scale
ck.add(... f"peak == {series_peak} x smokeScale",
       abs(peak - want) <= 0.06, ...)                          # (j.3) slack 0.06 for the %.1f
oor = int(smoke.get("out_of_range_lookups", -1))
ck.add(... "out_of_range_lookups == 0", oor == 0, ...)         # (j.4)
```

Notes the port must reproduce:

- **(j.1)** checks `reproducibility.input_datasets`, which is *dynamic* (`ContextCreator.java:846-851`
  builds it from the actually-selected files). It does **not** check
  `reproducibility.source_integrity.files`, which is a **fixed 13-entry list**
  (`OutcomeLogger.java:~420-440`) that always names the *observed* AQS CSV and never the severe
  ones. Both blocks appear in every archived SE manifest; only the first reflects the run.
- **(j.2)** hardcodes `456`. It is not `hours() == simulationHours + 1` and not `>= 456`.
- **(j.3)** compares against the **unrounded builder peak** (984.75 / 2496.10) while the manifest
  carries the `%.1f` HALF_UP rendering (984.8 / 2496.1). The `0.06` slack exists exactly for that.
  See QUIRK 6.
- **(j.4)** is the gotcha-3 gate.

### 1.6 `simulationHours <= slices − 1` — where it is enforced, and what happens if not

**Where the run length is computed** (`ContextCreator.java:806-809`):

```java
int endHours = Math.min(simulationHours, smokeField.hours());
double endTick = endHours * (60.0 / minutesPerTick);
RunEnvironment.getInstance().endAt(endTick);
```

**There is no fail-fast anywhere in the Java for this constraint.** The `Math.min` clamp is
*not* a guard — it clamps to `hours()`, which is precisely the failing value. `simulationHours`
is read at `ContextCreator.java:236` with no validation, unlike `smokeSeriesCode` /
`closuresCode` / `closureDraw`, which do throw (`ContextCreator.java:326-340`). The constraint is
enforced only:

1. **by convention in the batch params file** (`Geography/batch/batch_params_2026_SE*_*.xml`
   declare `simulationHours = 455`), and
2. **post hoc by gate (j.4)**, after the run has already been written to disk.

**Why 456 breaks.** `endAt(endTick)` is *inclusive* — the tick at `endTick` executes. Agent
`step()` is `@ScheduledMethod(start = 1, interval = 1)` (`GisAgent.java:304`), so the last
executed tick is exactly `endTick`. With `minutesPerTick = 1.0`:

```
endHours = min(456, 456) = 456
endTick  = 456 * 60 = 27360
hourIndex(27360) = floor(27360 * 1.0 / 60.0) = 456
valid indices    = 0 .. 455        (array length 456)
→ concentrationAtHour(456) = NaN → return 0.0, outOfRangeLookups++
```

Generalised: the last tick reads hour index `endHours`, valid indices are `0 .. hours()−1`, so the
requirement is `endHours <= hours() − 1`, i.e. (since `endHours = min(simulationHours, hours())`
and `hours() > hours()−1` always) **`simulationHours <= hours() − 1`**. Per-series maxima:
**575 / 455 / 455**.

**Primary evidence — the discarded 456-hour matrix.** `Geography/output/superseded-456h/`
(never verified, never scored, retained deliberately):

| run | simH | hours | `out_of_range_lookups` | n | sheltered | pre_evac | unaware | check |
|---|---|---|---|---|---|---|---|---|
| SE-E18-seed42 | 456 | 456 | **11170** | 6842 | 1252 | 1166 | 4414 | (6842−1252) + (1166+4414) = 5590 + 5580 = **11170** ✓ |
| SE-E18-seed43 | 456 | 456 | **11230** | 6842 | 1223 | 1222 | 4389 | 5619 + 5611 = **11230** ✓ |
| SE-E19-seed42 | 456 | 456 | **11165** | 6842 | 1257 | 1166 | 4414 | 5585 + 5580 = **11165** ✓ |

The identity holds to the unit in every one of the 13 discarded runs inspected. It proves three
things at once, none of which the port may assume without it: (a) `endAt` is inclusive; (b) the
double lookup is real and per-tick; (c) exactly one tick is out of range, because all 456 slices
exist with no interior gaps. The re-run at 455 h produced **identical** population censuses
(`docs/runs/scenario-e/SE-E18-seed42/simulation.json`: sheltered 1252, pre_evac 1166,
unaware 4414, unreachable 9, refused_all_full 1) with `out_of_range_lookups: 0` — the fabricated
hour changed exposure by ~1 minute of zero concentration and changed no outcome.

**Note the asymmetry that hid the bug:** the observed series is 576 slices against a 312-hour
window, so no pre-Scenario-E run could ever trip it. Only the severe series, whose 456 slices were
chosen to *match* the run length, is exposed.

**Port requirements (`IMPLEMENTATION_PLAN.md` Q11, §11):**
- Slider max = `slices − 1` per series, re-clamped with an explanatory toast when the series changes.
- Preset validation rejects `simulationHours > slices − 1` (Zod refinement over the `RunConfig`).
- **Engine fail-fast as the last line** — this is a *port addition*, not a Java behaviour; document
  it as a declared divergence, because a Java run at 456 h produces a file, not an exception.
- `out_of_range_lookups > 0` at end of run ⇒ badge **INVALID**, watermarked charts, and the error
  text "run window exceeded smoke data; results contain fabricated zero-concentration hours".

### 1.7 The builder's 19 checks

`scripts/build_smoke_severe.py` registers exactly **19** `ck.add(...)` checks and both committed
sidecars record `19/19 PASS`. In order of registration (line numbers from the script):

| # | line | check | v1 detail | v2 detail |
|---|---|---|---|---|
| 1 | 415 | writer round-trips the observed CSV byte-identically | dialect: UTF-8 BOM, CRLF, QUOTE_ALL | same |
| 2 | 469 | deterministic: two builds are byte-identical | `379e2efa8268407a` | `8520633bc78860c3` |
| 3 | 473 | header line identical to the observed file | 24 columns | 24 columns |
| 4 | 476 | column set and order identical | 24 | 24 |
| 5 | 478 | monitor identity columns unchanged | 7 monitor/site tuples | 7 |
| 6 | 481 | county name values unchanged | Clackamas,Multnomah,Washington | same |
| 7 | 489 | date/time formats are `yyyy-MM-dd` and `HH:mm` | 0 malformed | 0 |
| 8 | 494 | GMT-to-local offset preserved | `[8.0]` vs `[8.0]` | same |
| 9 | 499 | file hour 0 timestamp matches the observed file | `2020-08-31 16:00:00` | same |
| 10 | 501 | simulation anchor `2020-09-07T00:00` is inside the series | hour 0 = 9.6 | hour 0 = 24.4 |
| 11 | 505 | no NaN/gap hours in the Multnomah field | 0 gaps | 0 gaps |
| 12 | 513 | file hours contiguous with no gaps | 0 missing of 608 | 0 of 608 |
| 13 | 520 | pre-episode hours preserved exactly (scaled, not moved) | 0 of 79 differ | 0 of 79 |
| 14 | 525 | minor spike unmoved | hours 16–21 vs 16–21 | same |
| 15 | 530 | clean interval between spells unchanged | 57 h vs 57 h | same |
| 16 | 534 | episode stretched by whole days | 284 h = 188 h + 4×24 h (1.511×) | same |
| 17 | 537 | episode start unmoved | hour 79 | hour 79 |
| 18 | 547 | every value is `scale ×` an observed value | 0 without a pre-image | 0 |
| 19 | 549 | peak scaled by `scale` | 984.75 vs 984.73 | 2496.10 vs 2496.14 |

Sidecar-recorded structure, identical for both series: observed episode hours **79–266** (188 h,
`2020-09-10T07:00` → `2020-09-18T02:00`); counterfactual episode hours **79–362** (284 h,
→ `2020-09-22T02:00`); plateau days repeated `2020-09-12..2020-09-15` (4 days added); 3,890 output
rows; observed-series stats `576 h / 562.7 / mean 96.5905`; counterfactual-series stats
`456 h / 984.75 / mean 335.6344` (v1) and `456 h / 2496.1 / mean 850.7536` (v2).

Two things in the builder that the TS fixture port must reproduce or it will manufacture false
failures:

- Check 18 builds its expected set with `scale_measurement` itself, **not** `round()`:
  Python's `round()` is half-to-even and disagrees with the writer's `ROUND_HALF_UP` on exact
  `.x5` products. The equivalent TS trap is `toFixed`.
- Episode detection (`detect_episode`, line 237) runs on the **observed, unscaled** series with
  the fixed 55.5 line, so the stretched window is identical across the registered scale sweep. The
  output-side re-detection at line 447 uses `threshold × scale` and is a *consistency check*, not
  a second detection policy.

`IMPLEMENTATION_PLAN.md` §5.2 requires the 19-check to validate the **packed assets**; §4 requires
`build-smoke.ts` acceptance at `576/456/456` slices and peaks `562.7 / 984.75 / 2,496.1`.
**Both acceptance comparisons must be tolerance-based or exact-double-based — see §7.3.**

---

## 2. TRIAGE RESERVE

### 2.1 The reserve column and how it is set

`Shelter.java:52-58` — the field and its contract:

```java
/** Spaces held back for priority (mobility-limited) arrivals under the
 *  need-based-admission scenario (arm D). Set by ContextCreator from the
 *  {@code triageReserveFraction} parameter, clamped to [0, capacity].
 *  ...
 *  <p><b>Zero by default, and zero is exactly the old behaviour.</b> */
private int reservedForPriority = 0;
```

`ContextCreator.java:560-568` — the only call site, inside the shelter load loop:

```java
// Need-based admission (arm D). The reserve is a FLOOR of the
// per-site capacity, not a round: rounding up would let a rule
// stated as "hold 10%" hold more than 10% at every odd-sized site,
// and the conservative direction is the one that cannot flatter the
// intervention. At fraction 0 this sets 0 and changes nothing.
if (capacity != null && triageReserveFraction > 0.0) {
    shelter.setReservedForPriority(
            (int) Math.floor(capacity.intValue() * triageReserveFraction));
}
```

`Shelter.java:134-141` — the clamp:

```java
public void setReservedForPriority(int reserved) {
    if (capacity == null) { this.reservedForPriority = 0; return; }
    this.reservedForPriority = Math.max(0, Math.min(capacity.intValue(), reserved));
}
```

**Exact types and order:**
1. `capacity` is `Integer` (**boxed, nullable**). `capacity == null` means *not capacity-limited*,
   **never zero**. It comes from a blank `capacity` cell (`ContextCreator.java:547-548`:
   `(capStr == null || capStr.isEmpty()) ? null : Integer.valueOf(capStr)`).
2. Guard is `capacity != null && triageReserveFraction > 0.0` — **strict `>`**. Exactly `0.0`
   skips the call entirely, so `reservedForPriority` keeps its field initialiser `0`.
   `Integer.valueOf` throws `NumberFormatException` on `"88.0"` or `"88 "` (already trimmed).
3. `capacity.intValue()` (**`int`**) is auto-widened to `double` and multiplied by the `double`
   fraction. `Math.floor` on a `double`, then `(int)` truncation. **Use the IEEE double product,
   never exact decimal** — QUIRK 8.
4. The clamp is `max(0, min(capacity, reserved))`. It is unreachable from the ContextCreator path
   for `f ∈ (0, 1]` but must be ported: a UI that allows `f > 1` relies on it.

**Recomputed reserve totals** (operating sites only, `f = 0.10`):

| shelter file | sites | operating capacity | reserved | realised % |
|---|---|---|---|---|
| `shelters_2026_current_placement(.elayer).csv` (arm A / E18) | 36 | 2,234 | 215 | 9.62 % |
| `shelters_2026_expanded_capacity(.elayer).csv` (arm B / D / E20) | 36 | **6,842** | **667** | **9.75 %** |
| `shelters_2026_expanded_plus_new_sites(.elayer).csv` (arm C / E19) | 46 | 6,842 | 662 | 9.68 % |
| `shelters_2020-09.csv` (historical) | 2 | 198 | 18 | 9.09 % |

The `_elayer` variants have byte-identical capacity vectors to their bases, so the reserve totals
are identical — verified. The realised percentage is always **below** the nominal fraction because
of the per-site floor; the Java prints this at load
(`ContextCreator.java:605-622`, `[Triage] need-based admission ON: reserve fraction %.3f -> %d of
%d operating spaces held ... (%.2f%% realised after per-site floor)`), and the `else` branch prints
`[Triage] need-based admission OFF (triageReserveFraction=0): admission is first-come,
first-served exactly as in arms A/B/C.` Both census loops iterate `context.getObjects(Shelter.class)`
— **unspecified order**, but they only sum, so order is inert. Do not copy `getObjects` iteration
into anything order-sensitive.

**`triageReserveFraction` values used across the whole archive** (154 runs scanned):
`0.0` ×131, `0.10` ×18, `0.15` ×3, `0.25` ×1. The 18 runs at `0.10` are
`D-seed4{2,3,4}-r10`, `ER-D-n6842-seed4{2,3,4}`, `SE-E20-seed4{2,3,4}`, `SEnc-E20-seed4{2,3,4}`,
`SE2-E20-d1-seed4{2,3,4}`, `SE2nc-E20-seed4{2,3,4}`. This confirms `PORT_MAP.md:346`'s
`{0, .10, .15, .25}`.

### 2.2 How reserved beds are held back

`Shelter.java:117-131`:

```java
public boolean hasSpace() { return hasSpaceFor(false); }

public boolean hasSpaceFor(boolean isPriority) {
    if (capacity == null) { return true; }
    int usable = isPriority ? capacity : capacity - reservedForPriority;
    return occupancy < usable;
}
```

- `usable` is **`int`**; `capacity` auto-unboxes. `capacity - reservedForPriority` is int
  subtraction, never negative given the clamp.
- Comparison is **strict `<`**: a site with `occupancy == usable` is full.
- A priority arrival sees the **whole** capacity — the reserve is not *additional* space, it is
  space non-priority arrivals cannot touch. Consequently a shelter can reach
  `occupancy == capacity` when priority arrivals consume the reserve.

`Shelter.java:99-115` — `admit`:

```java
public boolean admit(boolean isPriority) {
    if (!hasSpaceFor(isPriority)) { refusedCount++; return false; }
    occupancy++;
    if (occupancy > peakOccupancy) { peakOccupancy = occupancy; }
    return true;
}
```

**`admit()` mutates on failure.** A refusal increments `refusedCount`. It must never be called
speculatively. `websim/engine/src/shelters/admit.ts` already encodes this
(`arriveAtDoor` calls `admit()` exactly once, only at the door).

`Shelter.java:143-161` — availability:

```java
public boolean isOpenAt(double tick) { return tick >= openTick && tick < closeTick; }
public boolean isAvailableAt(double tick) { return isAvailableAt(tick, false); }
public boolean isAvailableAt(double tick, boolean isPriority) {
    return operating && isOpenAt(tick) && hasSpaceFor(isPriority);
}
```

`openTick`/`closeTick` are **`double`** and are `±Infinity` when
`respectShelterOpeningDates != 1` (`Shelter.java:42-43`). `isOpenAt` is closed on the left,
**open on the right**. `tick >= -Infinity` is `true`; `tick < +Infinity` is `true`.

`ContextCreator.java:555-559` sets the window:

```java
if (respectShelterOpeningDates == 1) {
    shelter.setOpenWindowTicks(
            tickForDate(r.get("opened"), ticksPerHour, Double.NEGATIVE_INFINITY, 0),
            tickForDate(r.get("closed"), ticksPerHour, Double.POSITIVE_INFINITY, 1));
}
```

with `tickForDate` (`ContextCreator.java:909-918`):

```java
if (isoDate == null || isoDate.trim().isEmpty()) { return fallback; }
LocalDateTime moment = java.time.LocalDate.parse(isoDate.trim()).plusDays(dayOffset).atStartOfDay();
double hours = java.time.Duration.between(SIM_START, moment).toMinutes() / 60.0;
return hours * ticksPerHour;
```

`dayOffset` is `0` for `opened` and **`1`** for `closed` (the site operates through the *end* of
the stated day). `Duration.toMinutes()` returns a **`long`**, truncated toward zero, then
`/ 60.0` in double. **Verified for every one of the 36 arm-A rows** (all `opened=2020-09-07`,
`closed=2020-09-19`): `openTick = 0.0`, `closeTick = 312.0 h × 60 = 18720.0`.

All three arm files carry the same window on every row (`opened = 2020-09-07`,
`closed = 2020-09-19`, verified on all 36/36/46 rows of A/B/C and their `_elayer` twins), so with
`respectShelterOpeningDates = 1` every operating site in every E-family run has
`[openTick, closeTick) = [0.0, 18720.0)`.

**This is why the SE runs' departures stop long before tick 27300.** All **51** hazard-driven
E-family runs (9 ER + 18 SE/SEnc + 24 SE2/SE2nc) have
`max(time_started_tick) = 18660 = 311 × 60` — verified, no exceptions: the hourly hazard
evaluation at tick 18720 (hour 312) finds `anyShelterOpen == false`, so `open && rng.nextDouble()`
short-circuits, **no draw is consumed**, and nobody departs for the remaining 143 hours of the
455-hour window. `max(time_arrived_tick)` is 18700 (SE-E18-seed42) / 18718 (SE2-E18-d2-seed42) —
walkers already en route still arrive because arrival re-checks `isOpenAt(tick)` at the door and
18718 < 18720. The **9 E0-null runs** are the exception and for a different reason: they run the
legacy bright-line latch (`enableHazardDeparture = 0`), which fires the moment
`c >= evacuationThresholdUgM3` and a shelter is open, so everyone who ever departs has departed by
`max(time_started_tick) = 960` (hour 16, the first threshold crossing).

### 2.3 When reserved beds are released

**Never, within a run.** There is no release path:

- `reservedForPriority` is written only at build time (`ContextCreator.java:566`), never during the
  run. `ClosureWave.apply()` (`ContextCreator.java:951-971`) recomputes route trees and touches no
  shelter capacity state.
- Occupancy is **monotone non-decreasing**: `admit()` is the only mutator and there is no
  departure model. `GisAgent.java:262-265` states the consequence explicitly ("*occupancy is
  monotone (no departures are modelled) and policy is fixed, so a site once refused stays refused
  for this resident*").
- The reserve therefore behaves as a hard ceiling of `capacity − reserved` on non-priority
  admissions for the whole run, and the only way those beds are ever used is by a mobility-limited
  arrival.
- The **only** way new capacity appears is a shelter *opening* on a later calendar date
  (`isOpenAt` flipping true), which is what makes `REFUSED_ALL_FULL` non-terminal
  (`GisAgent.java:459-478`). That is an open-window event, not a reserve release.

**Archive evidence that the reserve was inert in the E arms:** in `SE-E20-seed42` (arm B's file,
`f = 0.10`), **zero** of 36 sites stopped at `capacity − reserve`, and in `ER-D-n6842-seed42`
*all* 350 refusals were policy refusals (`refused_count == policy_refused == 350`), i.e. zero
capacity refusals. Arm B/D carries 6,842 beds for 6,842 residents, so capacity never binds and the
reserve never bites. **A port that reproduces arm D's numbers has not tested the reserve.** The
reserve must be tested against the `phaseD-bed-sweep`/arm-D family and by unit fixtures (§8.3).

### 2.4 Interaction with `isPriorityForAdmission`

`GisAgent.java:866-884`:

```java
private boolean isPriorityForAdmission() {
    return attributes != null && attributes.mobilityLimited;
}
```

**Mobility limitation and nothing else.** Not age, not asthma, not COPD — the class doc is
explicit that those "*carry no behavioural consequence in this model, so triaging on them would be
a claim the simulation cannot support*". Note this is a **different** vulnerability predicate from
the hazard's `gammaVuln` boost (`GisAgent.java:405-407`), which *does* include COPD, asthma and
age ≥ 65. Do not unify them.

`isPriorityForAdmission()` is `false` for every resident when `enableHeterogeneity = 0`
(`attributes` is `null`) — one of the **two** independent reasons a reserve of 0 is inert.

It is consulted at exactly **three** sites, and the order of the surrounding conditions matters:

1. **Selection under L0** (`GisAgent.java:623`):
   ```java
   if (shelter.hasSpaceFor(isPriorityForAdmission()) && dM < bestDistM) { ... }
   ```
   evaluated *after* `anyReachable = true` is set and *after* the `excludedByBelief` `continue`
   (lines 619-622). A non-priority resident therefore never selects a site whose free space is all
   reserve. `&&` short-circuits: `dM < bestDistM` is not evaluated when there is no space.
2. **Set-out check** (`GisAgent.java:900-910`, `anyShelterAvailable`), used by the
   `REFUSED_ALL_FULL` re-entry test under L0/legacy:
   ```java
   if (shelter.isAvailableAt(tick, isPriorityForAdmission()) && shelter.getRouteTree() != null
           && !Double.isInfinite(shelter.getRouteTree().distanceTo(currentNodeId))
           && !excludedByBelief(shelter)) { return true; }
   ```
3. **At the door** (`GisAgent.java:554-555`):
   ```java
   if (!policyRefused && targetShelter.isOpenAt(tick)
           && targetShelter.admit(isPriorityForAdmission())) {
   ```

**Under L1 the reserve is invisible at selection time.** `chooseShelterByUtility`
(`GisAgent.java:693-743`) deliberately has **no `hasSpaceFor` pre-filter** — "*that live-occupancy
knowledge is exactly the omniscience L1 removes*". So an L1 non-priority resident walks to a site
whose only free beds are reserved, is refused at the door (`refusedCount++`), adds it to
`believedFull`, and re-plans from that site's node. Every archived ER/SE/SE2 arm runs
`informationRegime = 1`, so **this is the operative path in Scenario E**, and it is the one that
makes the reserve cost non-priority residents *travel*, not just beds.

---

## 3. PET POLICY AND THE PET VARIANT

### 3.1 The shelter policy columns

`Shelter.java:70-79`:

```java
/** Pet intake policy (Phase E, V32/A-29). {@code null} = unrecorded in the
 *  shelter CSV — the record for the 2020 smoke shelters is SILENT — in which
 *  case the run-wide {@code petPolicyDefault} parameter applies. ... */
private Boolean petIntake = null;
/** Adults-only intake (Phase E, V33). ... */
private boolean adultsOnly = false;
```

`petIntake` is a **tri-state `Boolean`**: `TRUE` admit, `FALSE` refuse, `null` unrecorded. Only
`null` defers to the run-wide default. `adultsOnly` is a plain `boolean`, default `false`.

Parsed at `ContextCreator.java:569-582`:

```java
// Phase-E OPTIONAL policy columns (V32/V33, A-29). Absent from every
// archived shelter CSV ... so this reads defensively: no column, no
// value, and the run-wide petPolicyDefault applies at the door.
String petCol = r.get("pet_intake");
if (petCol != null && !petCol.trim().isEmpty()) {
    shelter.setPetIntake(Boolean.valueOf("admit".equalsIgnoreCase(petCol.trim())));
}
String adultsCol = r.get("adults_only");
if (adultsCol != null && !adultsCol.trim().isEmpty()) {
    String v = adultsCol.trim();
    shelter.setAdultsOnly("1".equals(v) || "true".equalsIgnoreCase(v)
            || "yes".equalsIgnoreCase(v));
}
```

**The two columns use different vocabularies and this is not a typo:**

| column | recognised as *set* | mapping |
|---|---|---|
| `pet_intake` | any non-blank value | `"admit"` (case-insensitive) → `TRUE`; **every other non-blank string → `FALSE`** |
| `adults_only` | any non-blank value | `"1"` (case-**sensitive**) OR `"true"`/`"yes"` (case-insensitive) → `true`; everything else → `false` |

So `pet_intake = "yes"` yields `FALSE` (refuse), **not** `null` and not `true`. Verified in
jshell: `Boolean.valueOf("admit".equalsIgnoreCase("  ADMIT  ".trim()))` → `true`;
`Boolean.valueOf("admit".equalsIgnoreCase("yes"))` → `false`. `adults_only = "TRUE"` → `true`,
but `adults_only = "True"` also → `true` (`equalsIgnoreCase`), while `"01"` → `false`.

**No committed shelter CSV carries an `adults_only` column** (verified: 21 CSV files under
`Geography/data/shelters/`, zero of them have the column), so `adultsOnly` is `false` for every
archived run and the `hasDependents` half of the door gate never fires. It must still be ported:
`pHasDependents` is a live parameter and a UI-supplied file could carry the column.

### 3.2 `petAdmittedAt` and the door gate

`GisAgent.java:668-674`:

```java
/** Whether this site admits pets: its own recorded policy when the CSV has
 *  one, otherwise the run-wide default (A-29: the 2020 record is silent). */
private boolean petAdmittedAt(Shelter shelter) {
    Boolean policy = shelter.getPetIntake();
    return policy != null ? policy.booleanValue()
            : decisionConfig.petPolicyAdmitDefault;
}
```

`decisionConfig` is dereferenced **unguarded** — safe only because every caller is already inside
`decisionConfig != null && decisionAttributes != null`. `Boolean.FALSE` unboxes to `false`, so
`policy ?? default` in TS is correct here **only** because `petIntake` is `boolean | null` and
never `undefined`; `false ?? true === false` (verified). Using `||` instead of `??` would silently
convert every explicit `refuse` into the default.

`GisAgent.java:545-592` — the whole door:

```java
if (pathIndex >= routePath.size()) {
    // Reached the shelter's street node: request admission (V12).
    // Phase-E policy gates are evaluated AT THE DOOR, not at selection
    // time: under L1 the resident knows locations, not intake policies,
    // and the sourced datum is exactly "ever been TURNED AWAY over pet
    // policy" (48.1%, Henwood 2020) — people went and were refused.
    boolean policyRefused = decisionConfig != null && decisionAttributes != null
            && ((decisionAttributes.hasPet && !petAdmittedAt(targetShelter))
                    || (decisionAttributes.hasDependents && targetShelter.isAdultsOnly()));
    if (!policyRefused && targetShelter.isOpenAt(tick)
            && targetShelter.admit(isPriorityForAdmission())) {
        state = State.SHELTERED;
        arrivalTick = tick;
    } else {
        if (policyRefused) { targetShelter.recordPolicyRefusal(); }
        if (useL1()) {
            believedFull.add(targetShelter.getId());
        } else if (policyRefused) {
            believedFull.add(targetShelter.getId());
        }
        currentNodeId = targetShelter.getGraphNodeId();
        targetShelter = null; routePath = null; routeNodes = null; pathIndex = 0;
        retargetCount++;
        if (!useL1() && retargetCount > MAX_RETARGETS) { state = State.REFUSED_ALL_FULL; }
    }
}
```

**Exact evaluation order at the door — three counters, three different outcomes:**

| branch | order of evaluation | `refusedCount` | `policyRefusedCount` |
|---|---|---|---|
| policy refusal | `policyRefused` is `true` → `admit()` **never called** → `recordPolicyRefusal()` | **+1** | **+1** |
| closed door | `policyRefused` false, `isOpenAt` false → `admit()` **never called**, `recordPolicyRefusal()` not called | **0** | **0** |
| capacity refusal | `admit()` returns false | **+1** (inside `admit`) | 0 |
| admitted | `admit()` returns true | 0 | 0 |

`Shelter.java:175-178`:

```java
public void recordPolicyRefusal() {
    refusedCount++;
    policyRefusedCount++;
}
```

So `policy_refused <= refused_count` is an invariant, and **a closed-door arrival counts nothing
at all**. Reordering the `&&` clauses "for clarity" changes `shelters.csv`. This is already
encoded in `websim/engine/src/shelters/admit.ts` (`DoorOutcome`, four cases) — keep it.

Belief bookkeeping: under **L1** every refusal (policy *or* capacity) is remembered; under
**L0/legacy** only *policy* refusals are remembered, because the omniscient chooser already filters
on live capacity but nothing filters on intake policy — without this a pet owner would re-select
the same refusing shelter forever (`GisAgent.java:944-951`). `believedFull` is allocated in both
regimes by `setDecisionLayer` (`GisAgent.java:952`) and is a `HashSet<String>` — **membership only,
never iterated**, so its bucket order is inert. (Contrast the STRtree tie-break defect WP5-F2,
where HashMap order *was* observable.)

### 3.3 The barrier cost — where the pet term enters departure

`GisAgent.java:934-959`, in `setDecisionLayer`, precomputed once per agent:

```java
this.thetaScaled = config.sigmaTheta * da.thetaZ;
double c = 0.0;
if (da.heavyBelongings) c += config.barrierBelongings;
if (da.hasPet && !config.petPolicyAdmitDefault) c += config.barrierPet;
if (da.hasDependents) c += config.barrierDependents;
this.barrierCost = c;
```

**The pet term is keyed to the world default, never to any per-site policy.** The rationale
(A-29) is that the departure-suppressing burden is *anticipating* refusal; per-site policy is
discovered at the door. Additions are in fixed order belongings → pet → dependents; with the
archived ER/SE values all equal to 0.26 the order is numerically inert, but a sweep with distinct
values makes it observable in floating point, so keep it.

`barrierCost` then enters the hazard log-odds (`GisAgent.java:408-414`) as `− barrierCost`, and
separately raises the push threshold (`GisAgent.java:800-801`,
`thetaScaled >= pushThetaThreshold + kPush * (barrierCost + mobilityPenalty)`).

### 3.4 `shelterPolicyVariant` — what the variant changes

`ContextCreator.java:417-426`:

```java
if (shelterPolicyVariant == 1) {
    String variant = sheltersCsv.substring(0, sheltersCsv.length() - 4) + "_elayer.csv";
    if (!new File(variant).exists()) {
        throw new IllegalStateException("shelterPolicyVariant=1 but " + variant
                + " does not exist; run scripts/build_shelter_policy_elayer.py");
    }
    sheltersCsv = variant;
    System.out.println("[Shelters] policy variant ON: reading recorded pet_intake from " + variant);
}
```

- The rewrite is a **blind 4-character chop** (`substring(0, len-4)`), assuming the path ends in
  `.csv`. It runs *after* the `scenarioCode` dispatch (`ContextCreator.java:343-411`) and *before*
  the registry load, so it applies to whichever arm file the scenario chain selected.
- **Fail-fast, not fallback.** A missing variant aborts the run: "*a run that asked for recorded
  policy and quietly got the blanket default would misattribute every pet-owner outcome*". In the
  browser this becomes an asset-manifest lookup failure; it must be equally loud.
- The path is resolved **relative to the process CWD** (`new File(variant)`), matching
  `run-headless.ps1`'s working directory.
- **The variant changes `data_version_tag` and `input_datasets`** (`ContextCreator.java:846-851`),
  because `sheltersCsv` is element 2 of `dataFileList`. Verified across the archive:

  | run | shelter file checksummed | `data_version_tag` |
  |---|---|---|
  | `SE-E18-seed42` (code 18, variant 1) | `shelters_2026_current_placement_elayer.csv` | `58db846ad1e9` |
  | `SE-E19-seed42` (code 19, variant 1) | `shelters_2026_expanded_plus_new_sites_elayer.csv` | `a5a1f5b59991` |
  | `SE-E20-seed42` (code 20, variant 1) | `shelters_2026_expanded_capacity_elayer.csv` | `9978eac662e3` |
  | `ER-D-n6842-seed42` (code 7, variant 1) | `shelters_2026_expanded_capacity_elayer.csv` | `6951f0949ed9` |

**What is actually in the `_elayer` files** (recomputed; all three carry 22 columns = the base 21
plus `pet_intake`, and **none** carries `adults_only`):

| file | rows | `admit` | `refuse` | blank | admit-site beds | total operating beds |
|---|---|---|---|---|---|---|
| `..._current_placement_elayer.csv` (A/E18) | 36 | 4 | 29 | 3 | **422** | 2,234 |
| `..._expanded_capacity_elayer.csv` (B/D/E20) | 36 | 4 | 29 | 3 | **1,292** | 6,842 |
| `..._expanded_plus_new_sites_elayer.csv` (C/E19) | 46 | 4 | 29 | 13 | **633** | 6,842 |

The four `admit` sites are the same in all three files: `Laurelwood_Center`,
`River_District_Navigatio`, `Walnut_Park_Shelter`, `Willamette_Center`. They are the 4 of **48**
facilities in the upstream inventory `shelters_multnomah_2026.csv` with `pets_allowed = 1`
(verified: 48 rows, `Counter({'0': 44, '1': 4})`). **`ContextCreator.java:298-301`'s comment
"4 of 48 facilities record pets_allowed=1, 422 beds" is arm-A-specific**: the 422 figure is only
true for `current_placement`; the same four sites carry 1,292 beds in arm B's file and 633 in arm
C's. Do not propagate "422 beds" as a global fact.

### 3.5 The pet variant's effect, quantified against the archive

Configuration of every archived ER/SE/SE2 arm: `shelterPolicyVariant = 1`, `petPolicyDefault = 0`
(unrecorded ⇒ **refuse**), `pHasPet = 0.117`, `barrierPet = 0.26`. Realised pet share at
n = 6,842 seed 42 = **801 residents (0.1171)** — identical in every seed-42 run regardless of
severity, because the E-attribute draws are a separate, pre-run stream (§5).

Under that configuration a pet owner in arm A can be admitted at only 4 of 36 doors (422 of 2,234
beds, 18.9 %). `docs/runs/scenario-e/SE-E18-seed42/shelters.csv`:

- **total refusals 834, of which 543 (65.1 %) are policy refusals.**
- Every `pet_intake = admit` site has `policy_refused = 0` — Laurelwood 0, River District 0,
  Walnut Park 0, Willamette 0. ✓
- Every **blank** site behaves as refuse: `Peninsula_Crossing_SRV` 10, `Queer_Affinity_Village` 22,
  `Doreens_Place` 64. ✓ (This is the `petPolicyDefault = 0` path — flip it to 1 and these three
  sites' policy refusals go to zero.)
- Sites that also filled have a mix: `Clark_Center` 90/90 beds, 66 refusals of which 51 policy;
  `Menlo_Park_SRV` 55/55, 105 refusals of which 13 policy.

Corresponding totals elsewhere: `SE2-E18-d1-seed42` 709 policy of 1,152 refusals;
`ER-A-n6842-seed42` 541 of 836; `ER-D-n6842-seed42` **350 of 350** (arm B never fills, so *all*
refusals are policy).

These are exact replay targets for WP8.

---

## 4. THE MANIFEST PARAMETER SURFACE

### 4.1 How the manifest is written

`ContextCreator.java:811-839` builds two parallel arrays, `pNames` and `pVals`, in a fixed order
that is **append-only** — "*Every new parameter MUST appear here or the manifest silently lies
about the run config*". `OutcomeLogger.java:316-320` serialises them:

```java
w.print("    \"parameters\": {");
for (int i = 0; i < paramNames.length; i++) {
    w.print((i == 0 ? "" : ", ") + "\"" + paramNames[i] + "\": " + jsonVal(paramValues[i]));
}
w.println("},");
```

`OutcomeLogger.java:812-816`:

```java
private static String jsonVal(Object v) {
    if (v == null) return "null";
    if (v instanceof Number || v instanceof Boolean) return v.toString();
    return "\"" + jsonEsc(v.toString()) + "\"";
}
```

So the JSON literal for every numeric parameter is **`Java's Number.toString()`**:
`Double.toString(1.0)` → `"1.0"` (JS gives `"1"`); `Double.toString(-8.0)` → `"-8.0"`;
`Integer.toString(6842)` → `"6842"`; the seed is a `long` → `"42"`. Verified in jshell:
`Double.toString(0.0001)` → **`"1.0E-4"`** and `Double.toString(1.0E7)` → **`"1.0E7"`** —
JS produces `"0.0001"` and `"10000000"`. See QUIRK 12.

The values are captured **post-parse, post-fallback**: an absent batch parameter is recorded with
its `intParam`/`doubleParam` code fallback (`ContextCreator.java:867-898`), which is why the
manifest is the *executed* manifest and a preset built from a batch XML alone is not.

### 4.2 The 21 Phase-E parameters — gate (h)

`scripts/verify_E_runs.py:84-92` (comment: "*The 21 Phase-E parameters (ContextCreator pNames tail,
commit c88de56)*"):

| # | name | Java type | code fallback (`ContextCreator.java`) | E0-null | ER / SE / SE2 |
|---|---|---|---|---|---|
| 1 | `enableDecisionLayer` | `int` | `0` (:264) | 1 | 1 |
| 2 | `pAwareInit` | `double` | `1.0` (:265) | 1.0 | 0.356 |
| 3 | `pHeavyBelongings` | `double` | `0.284` (:266) | 0.284 | 0.284 |
| 4 | `pHasPet` | `double` | `0.117` (:267) | 0.117 | 0.117 |
| 5 | `pHasDependents` | `double` | `0.0044` (:268) | 0.0044 | 0.0044 |
| 6 | `groupSpeedDeltaMps` | `double` | **`0.0`** (:274) — deliberately *not* the sourced 0.06 | 0.0 | 0.06 |
| 7 | `lambdaOutreachPerDay` | `double` | `0.0` (:275) | 0.0 | 0.0 |
| 8 | `informationRegime` | `int` | `0` (:276) | 0 (L0) | 1 (L1) |
| 9 | `enableHazardDeparture` | `int` | `0` (:277) | 0 (latch) | 1 |
| 10 | `sigmaTheta` | `double` | `0.0` (:278) | 0.0 | 1.0 |
| 11 | `alphaHazard` | `double` | `-8.0` (:282) | −8.0 | **−8.0 (declare `constant_type="double"`)** |
| 12 | `bRisk` | `double` | `0.4` (:283) | 0.4 | 0.4 |
| 13 | `wOfficial` | `double` | `1.1` (:284) | 1.1 | 1.1 |
| 14 | `gammaVuln` | `double` | `0.0` (:285) | 0.0 | 0.25 |
| 15 | `riskHalfLifeH` | `double` | `48.0` (:286) | 48.0 | 48.0 |
| 16 | `barrierBelongings` | `double` | `0.0` (:287) | 0.0 | 0.26 |
| 17 | `barrierPet` | `double` | `0.0` (:288) | 0.0 | 0.26 |
| 18 | `barrierDependents` | `double` | `0.0` (:289) | 0.0 | 0.26 |
| 19 | `petPolicyDefault` | `int` | **`1`** (:293) = admit = inert | 1 | **0** (refuse, A-29) |
| 20 | `betaTravelTime` | `double` | `1.0` (:294) | 1.0 | 1.0 |
| 21 | `betaCapacityPrior` | `double` | `0.0` (:295) | 0.0 | 0.2 |

**`shelterPolicyVariant` is NOT one of the 21** — it is in `pNames` at position 33 but absent from
`E_PARAMS`. Gate (h) will pass on a manifest that omits it. Verified against the archive.

Gate (h) itself (`verify_E_runs.py:615-624`) — two assertions:

```python
missing = [p for p in E_PARAMS if p not in run.params]
ck.add(f"(h) [{run.name}] all 21 Phase-E parameters in the manifest", not missing, ...)
dirty = run.repro.get("source_integrity", {}).get("git_working_tree_dirty")
ck.add(f"(h) [{run.name}] git_working_tree_dirty is false", dirty is False, ...)
```

`dirty is False` is an **identity check against the Python singleton**, so a manifest emitting the
string `"unknown"` (which `OutcomeLogger` does emit when git is unavailable — U-21) **fails**, and
so would `0`. The TS harness must compare to the boolean `false`, not truthiness.

### 4.3 The 7 Scenario-E parameters — gate (i)

`scripts/verify_E_runs.py:94-100`:

```python
# The 7 core Scenario-E parameters (V46-V51; shelterPolicyVariant is
# V45/Phase-E). closureDraw is checked separately: it entered the manifest
# with the worst-case family, so the archived v1 SE runs legitimately lack it.
SE_PARAMS = [
    "smokeSeriesCode", "smokeScale", "closuresCode", "pStuck",
    "stuckDelayH", "pushThetaThreshold", "kPush",
]
```

| # | name | Java type | fallback | fail-fast | SE (v1) archived | SE2 (v2) archived |
|---|---|---|---|---|---|---|
| 1 | `smokeSeriesCode` | `int` (:312) | `0` | **throws** outside `[0,2]` (:326-330) | 1 | 2 |
| 2 | `smokeScale` | `double` (:313) | `1.0` | — | 1.0 | 1.0 |
| 3 | `closuresCode` | `int` (:314) | `0` | **throws** outside `[0,3]` (:331-335) | 1 (nc: 0) | 3 (nc: 0) |
| 4 | `pStuck` | `double` (:315) | `0.3` | — | 0.3 | 0.3 |
| 5 | `stuckDelayH` | `double` (:316) | `3.0` | — | 3.0 | 3.0 |
| 6 | `pushThetaThreshold` | `double` (:320) | `-0.25` | — | **0.0 (executed!)** | **0.0 (executed!)** |
| 7 | `kPush` | `double` (:321) | `1.0` | — | 1.0 | 1.0 |

Plus the conditional 8th (`verify_E_runs.py:637-641`):

```python
code = int(float(run.params.get("closuresCode", 0)))
if code == 3:
    ck.add(f"(i) [{run.name}] worst-family run records closureDraw",
           "closureDraw" in run.params, ...)
```

`closureDraw` is `int`, fallback `1` (`ContextCreator.java:322`), and **throws** when
`closuresCode == 3 && (closureDraw < 1 || closureDraw > 3)` (:336-340).

**Verified archive parameter-key counts — three different manifest schemas coexist:**

| archive family | keys | delta |
|---|---|---|
| `docs/runs/phase-e/` (12 runs) | **33** | 11 core + 21 E + `shelterPolicyVariant`; **no SE params at all** |
| `docs/runs/scenario-e/` (21 runs) | **40** | + the 7 SE params; **no `closureDraw`** |
| `docs/runs/scenario-e-v2/` (27 runs) | **41** | + `closureDraw` |

Full v2 key order (this is the required emission order for a parity manifest):

```
numAgents, minutesPerTick, walkingSpeedMps, shelterArrivalDistanceM, simulationHours,
randomSeed, evacuationThresholdUgM3, scenarioCode, enableHeterogeneity,
respectShelterOpeningDates, triageReserveFraction,
enableDecisionLayer, pAwareInit, pHeavyBelongings, pHasPet, pHasDependents,
groupSpeedDeltaMps, lambdaOutreachPerDay, informationRegime, enableHazardDeparture,
sigmaTheta, alphaHazard, bRisk, wOfficial, gammaVuln, riskHalfLifeH,
barrierBelongings, barrierPet, barrierDependents, petPolicyDefault, betaTravelTime,
betaCapacityPrior, shelterPolicyVariant,
smokeSeriesCode, smokeScale, closuresCode, pStuck, stuckDelayH, pushThetaThreshold,
kPush, closureDraw
```

Gate (i) is run **only for `--se` runs** (`verify_E_runs.py:831-832`), so a phase-e ER run is not
expected to carry SE params. The port's harness must key the expected schema off the run family,
not off a single "41 params" constant — see §7.1.

---

## 5. RNG DRAW SITES

Draw order is the single most fragile thing in this port. Within the scope of this document:

### 5.1 Sites that consume ZERO draws (guaranteed, and the guarantee is load-bearing)

| site | file | why it matters |
|---|---|---|
| `SmokeField` constructor, `hours()`, `concentrationAtHour`, `concentrationForTick`, `peakHourly`, `timeForTick` | `SmokeField.java` (whole file) | changing the smoke series or `smokeScale` **must not** shift any stream position; that is what makes SE/SEnc a clean control pair at fixed seed |
| `Shelter` — `admit`, `hasSpaceFor`, `setReservedForPriority`, `isOpenAt`, `isAvailableAt`, `recordPolicyRefusal`, `setPetIntake`, `setAdultsOnly` | `Shelter.java` (whole file) | the triage reserve is a pure arithmetic change; a reserve sweep never reshuffles anything |
| `petAdmittedAt`, `isPriorityForAdmission`, the door policy predicate | `GisAgent.java:668-674, 882-884, 551-553` | policy refusal is deterministic |
| `tickForDate`, shelter CSV load, `ClosureWave.apply()`, Dijkstra recompute | `ContextCreator.java:537-591, 909-918, 951-971` | wave application is deterministic; only the *tick* it lands on is scheduled |
| `ScienceRegistry.load` | `ContextCreator.java:432` | "*Pure I/O + validation: no random draws*" |

### 5.2 The stream that decides who owns a pet — `ELayerSampler`

`ELayerSampler.java:148` — **`java.util.Random`**, seeded `seed * 1000003L + 7919L`. Distinct from
Repast's colt MersenneTwister default stream and from `PopulationSampler`'s
`seed * 1000003L + 17L`.

`ELayerSampler.java:162-183` — one `sample()` per resident, **five unconditional draws in a fixed
order**:

```java
public DecisionAttributes sample() {
    int index = nSampled;
    boolean aware      = rng.nextDouble() < pAware;        // ① V29
    boolean heavy      = rng.nextDouble() < pHeavy;        // ② V31
    boolean pet        = rng.nextDouble() < pPet;          // ③ V32  <-- the pet draw
    boolean dependents = rng.nextDouble() < pDependents;   // ④ V33
    double thetaZ      = rng.nextGaussian();               // ⑤ V35, stored RAW
    double delta = dependents ? groupSpeedDeltaMps : 0.0;
    long decisionSeed = runSeed * 2654435761L + index * 104729L;
    ...
}
```

**Invocation context** (`ContextCreator.java:772-790`): a **separate second pass**, after the
whole placement loop completes, iterating `createdResidents` (**creation order** — explicitly not
`context.getObjects`, whose order is unspecified):

```java
ELayerSampler eSampler = null;
if (enableDecisionLayer == 1) {
    eSampler = new ELayerSampler(seed, pAwareInit, pHeavyBelongings,
            pHasPet, pHasDependents, groupSpeedDeltaMps);
    GisAgent.DecisionConfig decisionConfig = new GisAgent.DecisionConfig(...);
    for (GisAgent resident : createdResidents) {
        resident.setDecisionLayer(decisionConfig, eSampler.sample());
    }
}
```

Consequences the port must preserve:
- All five variates are drawn **unconditionally**. `sigmaTheta = 0` (the R3 null) still consumes
  the Gaussian. `pAware = 1.0` still consumes draw ①, and `nextDouble() ∈ [0,1)` so it is always
  `< 1.0` → always aware.
- `thetaZ` is stored **raw** and scaled at use, so sweeping `sigmaTheta` never reshuffles who owns
  a pet. Likewise sweeping `barrierPet`, `petPolicyDefault` or `shelterPolicyVariant` cannot move
  the pet draw. Verified in the archive: `has_pet` sums to **801** at n = 6,842 seed 42 in
  `ER-A`, `SE-E18`, `SE2-E18-d1`, and `SE2-E18-d2` alike.
- `nextGaussian` is Marsaglia polar **with a cached second deviate**, so draw count per resident is
  1 or 2 alternating from the sampler's own perspective. Port `java.util.Random` exactly
  (`IMPLEMENTATION_PLAN.md` §3.3.1).
- `decisionSeed = runSeed * 2654435761L + index * 104729L` — **Java 64-bit signed overflow**
  (`long` wraparound). Use `BigInt` or an explicit 64-bit emulation; JS `Number` loses precision
  above 2^53.
- `index` is `nSampled` *before* the increment, i.e. 0-based creation order.

### 5.3 The per-agent decision stream — where policy values change outcomes without changing draws

`GisAgent.java:937`: `this.decisionRng = new java.util.Random(da.decisionSeed);` — one private
`java.util.Random` per agent, invariant to the per-tick shuffle. Three draw sites, in the order
they can occur **within one tick**:

| order | site | line | condition (short-circuit order is the semantics) |
|---|---|---|---|
| 1 | outreach conversion `UNAWARE → PRE_EVAC` | `:385-386` | `newHour && lambdaOutreachPerDay > 0.0 && rng.nextDouble() < lambda/24.0` — **no draw when `lambda == 0.0`** (every archived arm sets 0.0, so this stream is untouched there) |
| 2 | hazard departure Bernoulli | `:414` | `if (open && decisionRng.nextDouble() < p)` — **`open` is evaluated first; no draw is consumed while every shelter is closed** |
| 3 | stuck Bernoulli after a push-through | `:816` | `if (decisionRng.nextDouble() < decisionConfig.pStuck)` — unconditional *given* a push decision |

An agent that converts via outreach at hour *h* consumes draw 1 and then, in the **same tick**,
falls through to the hazard block (`newHour` is still `true`) and consumes draw 2.

**The load-bearing point for this spec:** `barrierCost` (which carries the pet term),
`petPolicyDefault`, `barrierPet`, `gammaVuln`, `sigmaTheta` and `thetaScaled` all change the
*probability* `p`, never the *number of draws*. Only `open` (an open-window property) and
`lambdaOutreachPerDay > 0` change draw counts. A port that guards the hazard draw on `p > 0` or
computes `p` before checking `open` desynchronises every agent's private stream.

`newHour` is `hour > lastDecisionHour` with `hour = (int) Math.floor(tick * minutesPerTick / 60.0)`
and `lastDecisionHour` initialised to `-1` (`GisAgent.java:257, 371-372`). With
`minutesPerTick = 1.0` and `@ScheduledMethod(start = 1)`, the decision ticks are
**1, 60, 120, 180, …**. Archive confirmation: `max(time_started_tick) = 18660 = 311 × 60` in every
E-family run.

### 5.4 The Repast default stream (context, not owned by this spec)

`RandomHelper` / colt MersenneTwister, seeded `randomSeed`. Two consumers: one
`nextIntFromTo(0, campCoords.size()-1)` per resident at build (`ContextCreator.java:738`), and the
**per-tick agent shuffle** all run long (`RANDOM_PRIORITY`). The shuffle is what decides *who
reaches a door first*, hence who takes the last unreserved bed and who is turned away on pet
policy — the triage reserve and the pet gate are order-sensitive through this channel and no
other.

---

## 6. QUIRKS

Numbered. Each is a way to write a plausible port that is wrong.

**Q1 — The severe series must be parsed, never synthesised.** `severe_v1 ≠ 1.75 × observed_array`.
The transform rounds **per monitor, HALF_UP, to 1 dp, before** `SmokeField` averages, and it also
stretches the episode by 4 whole repeated days and truncates the tail. Multiplying the observed
array gives 576 slices instead of 456 and a peak of 984.725 instead of 984.75. §1.3.

**Q2 — The field is a mean over *reporting* monitors, not a fixed 2-monitor mean.** Hours 20 and 21
have a single monitor in all three series. Hardcoding `(a+b)/2` is wrong for exactly those two
hours, both inside the minor spike that check 14 pins.

**Q3 — `peakHourly()` initialises `mx = 0`, not `−Infinity`.** An all-NaN field reports `0.0`.
`NaN > mx` is `false` in both languages, so the loop skips gaps without the `isNaN` guard — keep
the guard anyway for review parity.

**Q4 — A gap and an out-of-window index are the same branch.** `outOfRangeLookups` cannot
distinguish them and the archived semantics must not either. Do not split the counter.

**Q5 — The out-of-range lookup returns `0.0` *and* counts.** The zero is not inert: it enters
`exposureUgM3h`, `vweUgM3h`, `inhaledDoseUg`, `airVolumeBreathedM3`, `outdoorHours`, and the
`c > 55.5` and `c > peakConcUgM3` comparisons for that tick.

**Q6 — `peak_hourly_ugm3` is `%.1f` HALF_UP, and `toFixed` is not HALF_UP.** Java's `Formatter`
rounds the **shortest decimal representation** of the double HALF_UP; JS `toFixed` rounds the
**exact binary value** with ties-to-larger. Verified divergence: Java `%.2f` of `0.615` → `"0.62"`,
JS `(0.615).toFixed(2)` → `"0.61"`. Use the WP3 HALF_UP formatter for this field. (For the three
committed peaks both happen to agree — 984.8 / 2496.1 / 562.7 — so this quirk will not be caught
by the three-series fixture alone. Add a `0.615`-class fixture.)

**Q7 — `562.7` and `984.75` are exact doubles; `2496.1` is not.** `562.7 === 562.70000000000005`
is `true` (same double) but `2496.1 === 2496.1000000000004` is **`false`**. An asset-acceptance
test written as `assert(peak === 2496.1)` fails on a correct asset. Use `Math.abs(peak - 2496.1) < 1e-9`
or pin the exact double.

**Q8 — The triage reserve floor uses the IEEE double product, not exact decimal.** Java computes
`(int) Math.floor(capacityInt * fractionDouble)`. A scan of `capacity ∈ [1,1000] × f ∈
{0.01,…,0.99}` found **49** pairs where naive `floor(cap × f)` differs from exact-decimal
truncation — e.g. `90 × 0.7 = 62.99999999999999` → Java **62**, exact decimal 63. Capacity 90 is a
real arm-A capacity (`Clark_Center`, `Gresham_Womens_Shelter`, `Doreens_Place`). The archived
fractions {0.10, 0.15, 0.25} happen to be clean on every committed file — verified, zero
mismatches — so a UI that widens the fraction range is the exposure. **Never route this through a
decimal library.**

**Q9 — `capacity == null` means UNLIMITED, not zero.** From a blank cell. `hasSpaceFor` returns
`true` unconditionally, `setReservedForPriority` forces the reserve to 0, and the L1 utility
chooser substitutes `UNCAPPED_CAPACITY_PRIOR = 10000.0` for `ln(capacity)`
(`GisAgent.java:679, 713-714`). **No 2026 arm file has a blank capacity** (verified across all 20
2026 files), but `shelters_2020-09.csv` does: row `MSCC` (Mount Scott Community Center) carries
`capacity` **blank**, `closed` **blank**, and `status = standby`. That single row exercises three
independent null paths at once — `capacity = null` (unlimited), `closeTick = +Infinity` (the
`tickForDate` fallback), and `operating = false` — and is the natural unit fixture for all three.

**Q10 — `admit()` mutates on failure and must never be called speculatively.** Ask `hasSpaceFor`
for a question; call `admit` only at the door.

**Q11 — A closed door increments nothing.** `!policyRefused && isOpenAt(tick) && admit(...)`
short-circuits, so a resident arriving at a closed door leaves no trace in `refused_count` or
`policy_refused`. Reordering the clauses changes `shelters.csv`.

**Q12 — `petIntake` is tri-state and `pet_intake = "yes"` means REFUSE.** Only the literal
`"admit"` (case-insensitive, after trim) maps to `TRUE`; every other non-blank string maps to
`FALSE`; only blank/absent maps to `null`. Meanwhile `adults_only` accepts `"1"`/`"true"`/`"yes"`.
In TS use `shelter.petIntake ?? petPolicyAdmitDefault` — `??`, never `||`, because
`false || true === true` would flip every explicit refusal.

**Q13 — `petPolicyDefault` is an `int` 0/1 in the manifest but a `boolean` in `DecisionConfig`.**
`ContextCreator.java:785` passes `petPolicyDefault == 1`. The manifest records the int; the engine
carries the boolean. `1 = admit` (inert default), `0 = refuse` (the ER/SE configuration). Getting
the polarity backwards produces a run with **zero** policy refusals that otherwise looks fine.

**Q14 — The pet *barrier cost* is keyed to the world default, the pet *door gate* to the site.**
`c_i` adds `barrierPet` iff `hasPet && !petPolicyAdmitDefault`; the door refuses iff
`hasPet && !petAdmittedAt(site)`. Two different predicates, deliberately.

**Q15 — `equalsIgnoreCase` with the literal as receiver is null-safe; the naive TS transliteration
is not.** `"operating".equalsIgnoreCase(row.get("status"))` returns `false` for a missing column;
`"operating" === row.status.toLowerCase()` throws.

**Q16 — Java `Number.toString()` is the manifest's number format.** `1.0` → `"1.0"` (JS `"1"`);
`0.0001` → `"1.0E-4"` (JS `"0.0001"`); `1.0E7` → `"1.0E7"` (JS `"10000000"`). Java switches to
scientific notation for `|x| >= 1e7` or `|x| < 1e-3`. The archived parameter values are all in the
safe band, so a sloppy port passes today and breaks the first time a user types `0.0001` into a
slider.

**Q17 — `smoke_field.start` is `LocalDateTime.toString()`, which omits zero seconds.** Verified:
`"2020-09-07T00:00"`, not `"2020-09-07T00:00:00"` and not `"...Z"`. `Date.prototype.toISOString()`
is wrong on three counts (seconds, milliseconds, timezone suffix).

**Q18 — `endAt(endTick)` is inclusive and the last tick reads hour `endHours`.** Hence
`simulationHours <= slices − 1`, hence 575/455/455. There is **no Java fail-fast**; the port adds
one as a declared divergence. §1.6.

**Q19 — Gate (h)'s dirty check is `dirty is False`, an identity comparison.** `"unknown"` (which
`OutcomeLogger` legitimately emits) fails the gate. Port it as `=== false`, not `!dirty`.

**Q20 — Three different manifest schemas exist in the archive (33 / 40 / 41 params).** Any
"preset carries all 41" unit test must be scoped to the v2-era family. §7.1.

**Q21 — `LocalDate.parse` and `LocalTime.parse` throw and are NOT caught.** The only catch in the
SmokeField row loop is `NumberFormatException` around `Double.parseDouble`. A malformed date in a
user-uploaded CSV aborts the Java run; the port must decide (and document) whether it aborts too.
`timeStr.substring(0, 5)` additionally throws on any string shorter than 5 characters.

**Q22 — `believedFull` is a `HashSet<String>` used for membership only.** Never iterated, so
bucket order is not observable — unlike WP5-F2's STRtree tie-break. Do not "fix" it into an
ordered set on the assumption that all Java hash containers are order-sensitive; equally, do not
assume other `HashSet`s in this codebase are safe.

**Q23 — `shelterPolicyVariant`'s path rewrite is a blind 4-char chop.** `substring(0, len-4)`
assumes `.csv`. It fails loudly if the `_elayer` file is absent (by design) but silently mangles a
path with a different extension.

**Q24 — The severe CSVs are checksummed in `input_datasets`, never in `source_integrity.files`.**
The latter is a fixed 13-entry list naming the *observed* AQS CSV. Gate (j.1) reads the former.
A port that verifies asset provenance against `source_integrity` will always "prove" the observed
series was used.

---

## 7. ARCHIVE-vs-PLAN DISCREPANCIES (the loud section)

Two prior discrepancies of this class are on record: a graph census of 4 reattached / 23 split that
was really **3 / 22**, and marginals attributed to seed 42 that were really **seed 48**. I was
asked to check for a third.

**Result: two genuinely new discrepancies (§7.1 and §7.3), plus one item (§7.2) that turned out to
be already documented correctly and is restated only to close it out.** §7.4 lists everything I
checked and found consistent, so the same ground is not re-covered.

### 7.1 NEW — "the 41 params" is not a property of the archive. Three schemas coexist: 33 / 40 / 41.

- `IMPLEMENTATION_PLAN.md:192-195`: "*a preset missing any of the 41 params fails a unit test*".
- `PORT_MAP.md` §1.3 step 12: "*wire OutcomeLogger (41-name parameter manifest …)*".
- `IMPLEMENTATION_PLAN.md:674-676` (WP4 acceptance): "*preset JSONs diff-clean against archived
  manifests*".

**Archive (verified by enumerating the key sets):**

| family | runs | `reproducibility.parameters` keys |
|---|---|---|
| `docs/runs/phase-e/` | 12 | **33** — no `smokeSeriesCode`, `smokeScale`, `closuresCode`, `pStuck`, `stuckDelayH`, `pushThetaThreshold`, `kPush`, `closureDraw` |
| `docs/runs/scenario-e/` | 21 | **40** — has the 7 SE params, **no `closureDraw`** |
| `docs/runs/scenario-e-v2/` | 27 | **41** |

41 is correct for the *current* `ContextCreator.pNames` and for the v2-era archive only. A preset
validator or replay harness that demands 41 keys will fail every ER run and every SE v1 run,
including `SE-E18-seed42` — which `IMPLEMENTATION_PLAN.md:711-713` names as a WP9 replay target.
`verify_E_runs.py` gets this right by scoping gate (i) to `--se` runs and by explicitly excluding
`closureDraw` from `SE_PARAMS` with a comment; the plan text does not.

**Fix:** scope the completeness assertion by run family (`33 | 40 | 41`), or assert
"contains all of `E_PARAMS`; contains all of `SE_PARAMS` iff the family is SE; contains
`closureDraw` iff `closuresCode == 3` or the family is v2-era".

Related sub-item: `PORT_MAP.md` §3.3 says the SE2nc control has "*no closureDraw*". True of the
**batch XML** (`batch_params_2026_SE2nc_E18_seed42.xml` omits it — verified), but **false of the
manifest**: all nine SE2nc runs record `closureDraw: 1` via the `intParam` fallback. A preset that
must be "fully-explicit, 41/41, zero fallbacks" and simultaneously "diff-clean against archived
manifests" has to carry `closureDraw: 1` for SE2nc.

### 7.2 KNOWN and correctly documented — restated here only because one table could still mislead a preset builder.

**Not a new finding.** Both authorities already carry the honesty note, and I confirmed the
numbers rather than the prose:

- `PORT_MAP.md:389`: "*`pushThetaThreshold` | **double** (neg!) | −0.25 | −0.25 (executed 0.0 in
  archived runs — parser defect, inert)*". ✓
- `PORT_MAP.md:700-701`: "*archived SE/SE2 manifests truthfully record executed
  pushThetaThreshold = 0.0 — inert, zero blockage events occurred*". ✓
- `IMPLEMENTATION_PLAN.md:17, 548-549, 813, 719`: the graft, the UI honesty note, and the WP8
  wiring requirement. ✓

The one place a reader can still be misled is `PORT_MAP.md:440`, the §3.3 **bundle** row for
SE severe v1, which lists "*`pushThetaThreshold=-0.25 (double)`*" with no cross-reference. That row
describes the *corrected batch XML*, which is right — but a preset generated from that row alone
will not match the archived manifest. Add a pointer to §2.7 there.

**Archive (verified across all 60 E-family runs):**

| family | `pushThetaThreshold` recorded | runs |
|---|---|---|
| `scenario-e/E0null-*` | **−0.25** (code fallback; the null's XML omits the param) | 3 |
| `scenario-e/SE*`, `scenario-e/SEnc*` | **0.0** | 18 |
| `scenario-e-v2/E0null-*` | **−0.25** | 3 |
| `scenario-e-v2/SE2*`, `SE2nc*` | **0.0** | 24 |

Cause: gotcha 4 — the batch XMLs then declared `pushThetaThreshold` as
`constant_type="number" value="-0.25"` and Repast's batch parser zeroed the negative constant. The
XMLs in `Geography/batch/` **have since been fixed** to `constant_type="double"` (verified in
`batch_params_2026_SE_E18_seed42.xml`, `..._SE2_E18_d2_seed42.xml`, `..._SE2nc_E18_seed42.xml`),
but **the runs were not re-executed**. Today's batch files therefore do **not** reproduce the
archive.

**Consequences for WP8:** (a) presets built by reading the batch XMLs will diverge from the archive
on this one value; (b) `PORT_MAP.md` §3.3 must carry the same honesty note the plan already has;
(c) the archived push behaviour is the `θ ≥ 0 + 1.0·(c_i + mobilityPenalty)` rule, i.e. an
unburdened resident pushes with P ≈ 0.50, not the registered 0.60. This interacts with the
"measure-zero push result" WP8 must reproduce (§8.2): **all four Scenario-E counters are zero in
every one of the 45 archived SE/SE2 runs**, so the push rule was never exercised at all and the
0.0-vs-−0.25 difference is unobservable in the archived outputs. Reproducing the archive does not
validate the push rule; a synthetic fixture must.

### 7.3 NEW — the WP4 smoke acceptance peaks are the *builder* values, not the *manifest* values, and one of them is not the double it appears to be.

- `IMPLEMENTATION_PLAN.md:325` and `:674-675`: "*Acceptance: 576/456/456 slices, peaks
  562.7 / 984.75 / 2,496.1*".

Two distinct problems, both verified:

1. **The manifest does not carry 984.75.** `OutcomeLogger` writes `peak_hourly_ugm3` with
   `%.1f`, so every archived SE v1 manifest records **`984.8`** (and v2 records `2496.1`, observed
   `562.7`). `verify_E_runs` gate (j.3) compensates with an explicit `0.06` slack against the
   *builder sidecar* value. The plan's WP4 acceptance line names the sidecar values with no
   mention of the rounding, so a port that "checks the asset against the archive" by reading
   `smoke_field.peak_hourly_ugm3` will compare 984.75 to 984.8 and declare a correct asset wrong.
2. **`2496.1` is not the peak double.** The peak is `2496.1000000000004`; `2496.1 === 2496.1000000000004`
   is `false`. `562.7` and `984.75` *are* exact (`562.7 === 562.70000000000005` is `true`), so a
   naive equality test passes two of three series and fails the third — the worst possible failure
   mode, because it looks like a v2 asset bug.

**Fix:** state WP4 acceptance as *(a)* slice counts exactly `576 / 456 / 456`; *(b)* peaks
tolerance-compared at `|Δ| < 1e-9` to `562.7 / 984.75 / 2496.1`, or byte-compared against the
committed sidecar `counterfactual_series.peak_ugm3`; *(c)* manifest peaks compared with the
HALF_UP formatter at `%.1f` and the gate-(j) slack of `0.06`. And record the third fact
explicitly: **`peak ≠ smokeScale_embedded × observedPeak`** (§1.3).

### 7.4 Items checked and found CONSISTENT (recorded so they are not re-litigated)

- `576 / 456 / 456` slice counts — recomputed from the CSVs; exact. ✓
- `4,795` observed rows / `3,890` severe rows (`PORT_MAP.md:469`) — exact. ✓
- Observed peak `562.7` is a 2-monitor mean; `588.9` is the single-monitor max
  (`PORT_MAP.md:250`) — recomputed; exact. ✓
- 21 E params / 7 SE params, and `shelterPolicyVariant` excluded from both — exact. ✓
- Capacity sums A 2,234 / B 6,842 / C 6,842 — exact. ✓
- `triageReserveFraction ∈ {0, .10, .15, .25}` (`PORT_MAP.md:346`) — exact; counts 131/18/3/1. ✓
- `_elayer` = 22 columns, `pet_intake` ∈ {admit, refuse, blank}, no committed `adults_only`
  (`PORT_MAP.md:470`) — exact. ✓
- 4 of 48 upstream facilities with `pets_allowed=1` — exact (but see §3.4 on the "422 beds"
  figure being arm-A-specific). ✓
- Seed-42 realised marginals `0.1988 / 0.1478 / 0.1079 / 0.2381 / 0.2622 / 1.2805`
  (the F1-F1 correction) — present verbatim in `SE-E18-seed42/simulation.json`. ✓
- No archived run uses `smokeScale ≠ 1.0` (48 runs carry the key, all `1.0`). The
  `smokeScale × severe` path is therefore **unvalidated by the archive** and must be covered by
  engine fixtures only.
- No archived run uses `simulationHours = 456` (values present: 312 ×94, 24 ×9, 72 ×9, 455 ×42).
  The 456 matrix lives only in `Geography/output/superseded-456h/`. ✓

---

## 8. ACCEPTANCE FIXTURES FOR WP8

### 8.1 Smoke

| # | fixture | expected |
|---|---|---|
| S1 | `hours()` for series 0/1/2 | 576 / 456 / 456 |
| S2 | gap count for series 0/1/2 | 0 / 0 / 0 |
| S3 | `peakHourly()` for 0/1/2 | `562.7` / `984.75` / `2496.1000000000004` (tolerance 1e-9) |
| S4 | peak hour index | 140 in all three |
| S5 | hour 0 / 311 / 455 of series 1 | `9.6` / `307.3` / `10.05` |
| S6 | hour 0 / 311 / 455 of series 2 | `24.35` / `778.95` / `25.5` |
| S7 | hours 20 and 21 are single-monitor means in all three | assert the reducer divides by 1, not 2 |
| S8 | `concentrationForTick(27300, 1.0)` on series 1 | hour 455, non-NaN, oor unchanged |
| S9 | `concentrationForTick(27360, 1.0)` on series 1 | returns `0.0`, `outOfRangeLookups` +1 |
| S10 | all-NaN field | `peakHourly() === 0`, not `-Infinity` |
| S11 | `smokeScale = 1.0` | array bit-identical to unscaled |
| S12 | 456-hour replay of SE-E18-seed42 config | `outOfRangeLookups === 11170` (matches `superseded-456h`) |
| S13 | 455-hour replay of SE-E18-seed42 config | `outOfRangeLookups === 0`; census 1252/1166/0/9/1/4414 |
| S14 | HALF_UP formatter | `%.1f(984.75) === "984.8"`, `%.2f(0.615) === "0.62"` |

### 8.2 Triage + pets (replay targets from the archive)

| # | run | assertion |
|---|---|---|
| T1 | any arm-B/D config, `f = 0.10` | reserved total **667** of 6,842 (9.75 %) |
| T2 | arm A, `f = 0.10` | reserved total **215** of 2,234 (9.62 %) |
| T3 | arm C, `f = 0.10` | reserved total **662** of 6,842 (9.68 %) |
| T4 | unit | `floor(90 × 0.7) === 62` (IEEE), **not** 63 |
| T5 | unit | `capacity === null` ⇒ `hasSpaceFor(x) === true` and `reservedForPriority === 0` |
| T6 | unit | `f === 0.0` ⇒ `setReservedForPriority` never called; reserve stays 0 |
| T7 | `SE-E18-seed42` | `sum(policy_refused) === 543`, `sum(refused_count) === 834` |
| T8 | `SE-E18-seed42` | the 4 `admit` sites have `policy_refused === 0`; the 3 blank sites have 10 / 22 / 64 |
| T9 | `SE2-E18-d1-seed42` | `sum(policy_refused) === 709`, `sum(refused_count) === 1152` |
| T10 | `ER-D-n6842-seed42` | `sum(policy_refused) === sum(refused_count) === 350` (zero capacity refusals) |
| T11 | any seed-42 E run | `sum(has_pet) === 801` regardless of series, closures, or barrier values |
| T12 | unit | `pet_intake = "yes"` ⇒ `petIntake === false` (refuse), not `null`, not `true` |
| T13 | unit | closed-door arrival increments neither counter |
| T14 | all E-family runs | shelter open window `[0.0, 18720.0)` ticks on every operating site |
| T15 | the 51 hazard runs (ER/SE/SEnc/SE2/SE2nc) | `max(time_started_tick) === 18660`; the 9 E0-null runs give `960` |
| T16 | all 45 SE/SE2 runs | `blockages_encountered = push_throughs = reroutes = stuck_events = 0` |
| T17 | unit, `shelters_2020-09.csv` row `MSCC` | `capacity === null`, `closeTick === +Infinity`, `operating === false` |

### 8.3 Gates the port must implement

(h) 21 E params present **and** `git_working_tree_dirty === false` (identity, not truthiness).
(i) 7 SE params present; plus `closureDraw` present iff `closuresCode === 3`.
(j) severe series only: `input_datasets` names the right CSV; `hours === 456`;
`|peak − seriesPeak × smokeScale| <= 0.06`; **`out_of_range_lookups === 0`**.
In-browser cheap subset after every user run: (b), (d), (e), (l), `oor === 0`, bed-sum
(`IMPLEMENTATION_PLAN.md` Q11).

### 8.4 How every number in this document was obtained

- **A. Series recomputation** — a standalone reimplementation of the `SmokeField` reducer
  (county filter, `Date Local`+`Time Local` → hour index vs `2020-09-07T00:00`, drop negative,
  per-hour sum/count, dense array) run over the three CSVs in
  `Geography/data/airnow/`. Produced the slice counts, gap counts, peaks, peak hours, per-hour
  monitor counts, and the hour-0/311/455 values in §1.1–1.3.
- **B. Sidecar dump** — `aqs_hourly_pm25_synthetic_severe_v{1,2}.provenance.json` (19 checks each,
  all PASS) for §1.7 and the anchor text.
- **C. Manifest census** — every `docs/runs/**/simulation.json` parsed for
  `reproducibility.parameters` key sets and values, `smoke_field`, and `closures`. 154 runs total;
  60 in the E families.
- **D. Discarded-matrix census** — `Geography/output/superseded-456h/*/simulation.json` for the
  `out_of_range_lookups` identity in §1.6.
- **E. Shelter-file census** — all 22 files under `Geography/data/shelters/` for capacities,
  `pet_intake` distributions, reserve totals at f ∈ {0.10, 0.15, 0.25}, and the FP-vs-decimal
  floor scan (Q8).
- **F. Java probes** — `jshell` on JDK 17.0.19 for `Double.toString`, `String.format("%.Nf")`,
  `Duration.between(...).toMinutes()`, `ChronoUnit.HOURS.between`, `LocalDateTime.toString`, and
  `Boolean.valueOf("admit".equalsIgnoreCase(...))`.
- **G. JS probes** — Node 24 for `toFixed`, `===` on the three peak doubles, `??` vs `||`,
  `Math.floor` on negatives, and the `cap × f` products.

Nothing in this document was compiled into, or written outside of, `websim/`.
