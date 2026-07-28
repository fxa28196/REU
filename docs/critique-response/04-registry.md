# Response 04 — The compliance claim: does the fail-fast gate hold?

**Claim under test.** `docs/final/presentation/index.html:841-843` — "The model
refuses to start if any variable claiming to be measured or literature-derived
lacks a resolvable DOI, or if any literature value lacks a sweep range."
Restated at `docs/final/TECHNICAL_REFERENCE.md:25-26` as "refuses to start a run
if any variable claiming class **M** or **L** lacks a resolvable DOI or dataset
id."

**Verdict up front: the gate has a hole, and it is not the one the critique
identified.** The gate is a *non-emptiness* test on a free-text column, not a
resolvability test. Nothing in the codebase resolves a DOI, validates DOI
syntax, or cross-references a dataset id against `DATA_SOURCES.md`. The word
"resolvable" is unearned. Separately, one class-M variable (V22) carries a
dataset id that points at the wrong study and has **no citation anywhere in the
project**. That is a larger defect than V20.

---

## 1. V20 (mobility probabilities) — is the CASPEH source resolvable?

### The exact rule

`Geography/src/geography/science/ScienceRegistry.java:175-180`:

```java
String doi = value(r, "doi_or_dataset");
String uncertainty = value(r, "uncertainty");
if (("L".equals(cls) || "M".equals(cls)) && (doi.isEmpty() || "none".equals(doi))) {
    throw new IllegalStateException(path + " [" + id + "]: evidence_class " + cls
            + " requires a DOI or dataset id in doi_or_dataset");
}
```

Two facts follow immediately.

1. **The rule does fire for V20.** `variables.csv:24` sets V20's
   `evidence_class` to `M`. Rule 4 covers `M` as well as `L`, so V20 is inside
   the gate's scope. The critique is right that this is the row to test.
2. **V20 passes anyway, and would pass on any string.** V20's
   `doi_or_dataset` cell is `D10 + D11`. The predicate is
   `doi.isEmpty() || "none".equals(doi)`. `"D10 + D11"` is neither. It passes.
   So would `"D99"`, `"see notes"`, or `"x"`. There is no DOI regex, no HTTP
   check, no lookup table of valid `D`-ids, and no reference from the loader to
   `docs/science/DATA_SOURCES.md`. `ScienceRegistry.java` has no other
   `doi`-related code; lines 175-184 are the whole of rules 4 and 5.

### Where CASPEH actually is

| Location | Status |
|---|---|
| `variables.csv:24` (V20 `source` field) | Named in prose — "age gradient ratio from CASPEH 2023 (22% overall vs 32% at 50+)". Machine field says `D10 + D11`. **No DOI, no URL.** |
| `docs/science/DATA_SOURCES.md:297-306` (D11) | Named: "UCSF Benioff Homelessness and Housing Initiative, June 2023. n = 3,198, 78% unsheltered." **No DOI, no URL, no report number.** |
| `docs/science/BIBLIOGRAPHY.md:362-364` | Present: "UCSF Benioff Homelessness and Housing Initiative (2023). *Toward a New Understanding…* n = 3,198. → mobility-limitation age gradient (A-18)." **No DOI, no URL.** |
| `docs/chapter/references.bib:239-247` (`@techreport{ucsf2023}`) | Present **with** a resolvable URL in the `note` field. |
| `docs/chapter/Capacity_Is_Not_Access.tex:1102-1106` | Present in the printed reference list. |

**So the critique's specific factual charge is partly wrong.** CASPEH *is* in
`BIBLIOGRAPHY.md` and *is* in the chapter's reference list. A reader can trace
it. What it lacks in the registry, in `DATA_SOURCES.md`, and in
`BIBLIOGRAPHY.md` is any machine- or reader-resolvable identifier: the only
place a URL exists is `references.bib`.

### Verdict on Q1: (a) **and** (b), and (b) is the real finding

For V20 specifically the citation problem is a **documentation gap** — the
study is named consistently in five places and resolvable in one of them.

But the audit exposes an **actual hole in the fail-fast gate**, independent of
V20: the gate cannot distinguish a resolvable identifier from an arbitrary
string. It enforces "this cell is not blank and does not say `none`". The
documentation calls that "a resolvable DOI". Those are different claims, and
the stronger one is not implemented. The gate would have caught the historical
defects it was built for (`V2`/`V4`, whose cells say `none` — `variables.csv:12-13`),
because those authors were honest enough to write `none`. It would not catch a
plausible-looking fabrication.

---

## 2. Does the gate apply only to literature? Is the wording overstated?

**No, it is not literature-only, and yes, the wording is overstated.**

The rule quoted above covers `"L".equals(cls) || "M".equals(cls)` — measured
data is inside the gate. That is why every measured row carries a local id
rather than a DOI:

- V5 `smokeField` (EPA AQS) → `D3` (`variables.csv:9`)
- V18/V19 (PIT age, sex) → `D10` (`variables.csv:22-23`)
- V-STARTLOC (campsite reports / RLIS-adjacent) → `D2b` (`variables.csv:21`)
- V23 (shelter opening dates) → `D1` (`variables.csv:28`)

None of these has a DOI, because none of these datasets *has* a DOI. That is
normal and correct for agency data. The schema anticipated it:
`docs/science/REGISTRY_SCHEMA.md:38` defines the column as "DOI, dataset id
(`D0`–`D13`), or `none`", and rule 4 at line 53-56 reads "`evidence_class = L`
**requires** a non-empty `doi_or_dataset`; `M` requires a dataset id."

**The overstatement is in the slide, not the schema.**
`index.html:841-842` says a measured or literature variable that "lacks a
resolvable DOI" halts the run — dropping "or dataset id" entirely. Read
literally, that slide claims EPA AQS, the PIT count, and the shelter opening
dates each carry a DOI. None does. `TECHNICAL_REFERENCE.md:25-26` restores "or
dataset id" and is the accurate version; the presentation is the one that needs
fixing. And in both documents "resolvable" describes an intent, not a check
(see §1).

**Recommended wording:** "The model refuses to start if a variable claiming
class M or L leaves its source field empty or marked `none`, or if a literature
or calibrated value states no sweep range. Resolvability of the identifier is
enforced by review, not by code."

---

## 3. Manufactured precision in 0.1522 / 0.3478

### What the numbers are

`Geography/src/geography/agents/PopulationSampler.java:87-88`:

```java
private static final double MOBILITY_P_UNDER_55 = 0.152163;
private static final double MOBILITY_P_55_PLUS  = 0.347802;
```

Six significant figures in code; four in the registry (`variables.csv:24`).

### What they are made of

- A local marginal of `391/2037 = 0.192`, which the project itself labels a
  **lower bound** three separate times: `variables.csv:24` ("LOWER BOUND: asked
  only of survey completers but divided by the full population"),
  `PopulationSampler.java:74-78`, and `DATA_SOURCES.md:293-294`.
- A **two-significant-figure** California ratio: 22% overall vs 32% at 50+
  (`PopulationSampler.java:81`, "a ratio of ~2.29"), from a donor population in
  a different state in a different year, applied at a different age cut (50+ in
  the source, 55+ in the model — `PopulationSampler.java:272`).

### Against the project's own standard

The project states the no-invented-precision rule explicitly, and applies it
one variable earlier. `PopulationSampler.java:266` and `variables.csv:22`:

> "no source constrains the within-band shape, so a curve would manufacture
> precision" → age is sampled uniformly within band (Option A).

**Verdict: inconsistent, and the inconsistency is visible in the same file.**
V18 declines to add shape the data cannot support. V20 imports shape the local
data cannot support — from another state — and then reports it to four and six
decimals. The arithmetic is deterministic, so the digits are not *wrong*; they
are unwarranted. Two 2-sf inputs and a 3-sf lower-bound marginal cannot support
a 6-sf output. `0.15` and `0.35`, or an explicit interval, would carry the same
information without the false authority.

**A second, sharper inconsistency.** `PopulationSampler.java:83` says in terms:

> "the gradient is donor-imputed (class A) but the population total remains the
> measured local value"

The code comment classes the gradient **A**. `variables.csv:24` classes the
whole row **M**. The measured part (the 0.192 marginal, class M) and the
imputed part (the 2.29 ratio, class A) are fused into one row that inherits the
"measured" label. This is the mechanism by which the row escapes needing a
DOI-bearing citation for CASPEH while presenting as measured data. Splitting
V20 into V20a (marginal, M, `D10`) and V20b (age gradient, A, `D11`) would fix
the classification, the citation gap, and the precision claim in one edit.

In mitigation: the gradient *is* registered as an assumption (A-18,
`assumptions.csv:19`, classification `assumption`), with a sweep plan, and it is
labelled donor-imputed in the chapter. The project is not hiding this. It is
mislabelled in the one file that a machine reads.

---

## 4. "26 assumptions, four blocking" — is the criterion stated?

**The count is correct.** `assumptions.csv` holds 26 data rows, A-01 through
A-26 with no gaps (A-16 is present, out of numeric order, at line 18). Exactly
four carry `status = blocking`, and every archived manifest agrees — e.g.
`docs/runs/present-day-three-arm/A-seed42/simulation.json:84,87`:
`"assumption_count": 26` and `"blocking_assumptions": ["A-04","A-09","A-12","A-16"]`.

**The four blocking assumptions:**

| ID | Statement | Line |
|---|---|---|
| A-04 | Each operating shelter has a nightly capacity of 99 — newsroom-sourced, not confirmed by a primary agency document; the number sheltered equals total capacity exactly in every run | `assumptions.csv:5` |
| A-09 | Susceptibility weights are 1.0, so the Exposure Burden Index equals raw exposure — the slide-cited relative risks could not be verified | `assumptions.csv:10` |
| A-12 | All residents know the shelters exist and where they are — contradicted by the local finding that 65% of surveyed unsheltered residents had never heard of them | `assumptions.csv:13` |
| A-16 | Agent execution order within a tick does not affect outcomes — true only while capacity never binds, and capacity binds in every production run | `assumptions.csv:18` |

**Is the criterion stated?** Yes — but only as a *definition*, in two places,
and it is not a test:

- `docs/science/REGISTRY_SCHEMA.md:78`: "`status` | `active` · `retired` (kept
  for history) · **`blocking` (must be resolved before publication)**"
- `ScienceRegistry.java:280` javadoc: "Assumptions that must be resolved before
  publication."

That tells you what the label *means*. It does not say what makes an assumption
qualify, and no rule, test, or checklist decides membership. The validator's
only involvement is `ScienceRegistry.java:281-289`, which counts rows already
marked `blocking` and names them in the manifest. `REGISTRY_SCHEMA.md:86-87`
confirms this is the whole mechanism: "`status = blocking` rows are counted and
named".

**Consequence.** Membership is an author's judgement call with nothing behind
it. Load-bearing assumptions sit at `active` — A-03 (2025-26 campsite locations
stand in for September 2020, `assumptions.csv:4`, which drives every distance
in the model) and A-18/A-19 (the donor-imputed gradient and the unresolved
mobility-aid mix, `assumptions.csv:19-20`) are each at least as consequential
for the headline access-disparity result as A-09. The critique is right that
the criterion is not operationalised. It is however *stated*, which the critique
implies it is not.

---

## 5. Sweep of every other M- and L-class variable

**L-class (6 rows) — all clean.**

| ID | Identifier | Resolves? |
|---|---|---|
| V10 walkingSpeedMps | `10.1093/ageing/26.1.15` | Yes — real DOI, in BIBLIOGRAPHY §2 |
| V-EVAC evacuationThreshold | `D9` | Yes — EPA AQI TAD, URL at `BIBLIOGRAPHY.md:253-255` |
| V21a asthma | `10.1007/s11606-025-09814-x` | Yes |
| V21b copd | `10.1007/s11606-025-09814-x` | Yes |
| V24 copdSpeedDelta | `10.1183/16000617.0253-2023` | Yes |
| V25 inhaled_dose_ug | `EPA/600/R-09/052F` | Yes — EPA report number, resolvable; flagged VERIFIED-IN-SECONDARY in the row itself |

All six also satisfy rule 5 (non-`none` uncertainty). No gaps.

**M-class (13 rows) — one clean gap, worse than V20.**

### GAP A — V22 `chronic_physical`: the dataset id points at the wrong study

`variables.csv:27` sets `evidence_class = M`, `source = "Pathways Study 2026
(PSU HRAC / OHSU), N = 541, Multnomah County"`, and `doi_or_dataset = D10`.

**D10 is not the Pathways Study.** `DATA_SOURCES.md:282-295` defines D10 as the
*2019 Multnomah County Point-in-Time Count*, PSU Regional Research Institute,
count night 2019-01-23, used for population size, age bands, sex and the
mobility marginal. A 2019 PIT count is a different instrument, a different year,
a different institute and a different sample (n = 2,037 vs N = 541) from the
2026 Pathways Study.

The Pathways Study has:

- **no entry in `DATA_SOURCES.md`** — the file runs D0–D14 with no Pathways row;
- **no entry in `BIBLIOGRAPHY.md`** — no match for "Pathways", "HRAC", or "541";
- **no citation in the chapter.** `docs/chapter/Capacity_Is_Not_Access.tex:366`
  carries a literal unresolved marker:
  `\authornote{[Pathways Study 2026 - full citation to be confirmed]}`, and
  `capacity-is-not-access-source.md:17` lists it as one of two outstanding
  `[AUTHOR:` markers in the manuscript.

So V22 is a class-M variable, live in the model (`agents.csv` column 43,
`chronic_physical`), whose source exists nowhere in the project as a citation
and whose machine-readable pointer resolves to an unrelated dataset. The gate
passed it because `"D10"` is a non-empty string. **This is the concrete
instance of the hole described in §1** — and it is more serious than V20,
because with V20 the source at least exists in the bibliography.

### GAP B — V-STARTLOC → `D2b`

`variables.csv:21` points V-STARTLOC (class M) at `D2b`. `D2b` is not a
top-level dataset entry; it is a sub-paragraph inside D2
(`DATA_SOURCES.md:107-111`) headed "**Companion gap** — encampment locations
(D2b, **GAP**)", stating that public availability and licensing "has not been
verified" and that start locations "remain a documented placeholder". The
summary table at `DATA_SOURCES.md:270` contradicts this, marking D2b
"**ACQUIRED as 2025–26 proxy**". Minor and internally inconsistent rather than
missing, but a class-M pointer should not resolve to a paragraph labelled GAP.

The remaining eleven M rows resolve cleanly: V-SIMH/V5/V6/V14 → `D3` (EPA AQS,
fully documented at `DATA_SOURCES.md:115-125` with retrieval date, checksum and
a fetch script); V8 → `D9`; V9 → `10.1007/s00190-012-0578-z`; V11 →
`10.1007/BF01386390`; V18/V19 → `D10`; V23 → `D1`.

---

## 6. Additional finding not raised by the critique: the registry has drifted

The archived runs did not validate the registry now in the repository.

| | Archived runs (all 27) | Working tree today |
|---|---|---|
| `variables.csv` SHA-256 | `1bf27ac4de98…` (`simulation.json:82`) | `df1b58087dba…` |
| `variable_count` | 28 (`simulation.json:84`) | 29 |
| `evidence_class_census` | M 12 · L 6 · A 10 (`simulation.json:85`) | M 13 · L 6 · A 10 |

The one added M row is V22, introduced by commit `3bf833f` (2026-07-28, "fix(v1.0):
close the scenarioCode mislabelling trap and 5 related defects") — *after* the
runs were archived. But `chronic_physical` is already column 43 of
`agents.csv` in those runs. **During all 27 archived runs, a live class-M model
variable had no registry row at all**, which is exactly what
`REGISTRY_SCHEMA.md:115-116` forbids: "A variable may not be added to the model
without a registry row in the same commit."

The gate structurally cannot catch this. It validates the rows that exist; it
has no check that every model variable *has* a row. The schema admits as much
at `REGISTRY_SCHEMA.md:117-119`: "the enforcement that matters is review
discipline, but a test asserting that every Repast parameter has a matching
`implemented` registry row makes the common case mechanical." That test does not
exist.

---

## 7. Summary of what is true and what is not

| Claim | Status |
|---|---|
| The model halts on a class-M/L row with an empty or `none` source | **TRUE** — `ScienceRegistry.java:177-180`, verified |
| The model halts on a class-L/C row with no sweep range | **TRUE** — `ScienceRegistry.java:181-184` |
| The identifier must be **resolvable** | **FALSE** — no resolution, syntax check, or cross-reference exists anywhere in the codebase |
| The gate is literature-only | **FALSE** — it covers M as well as L |
| "lacks a resolvable DOI" (presentation) | **OVERSTATED** — omits "or dataset id"; most measured sources have no DOI and correctly use `D`-ids |
| CASPEH absent from `BIBLIOGRAPHY.md` | **FALSE** — present at line 362-364, and in the chapter bibliography with a URL |
| CASPEH lacks any resolvable identifier in the registry | **TRUE** — `D10 + D11`; D11 carries no DOI or URL in `DATA_SOURCES.md` or `BIBLIOGRAPHY.md` |
| 26 assumptions, four blocking | **TRUE** — A-04, A-09, A-12, A-16; matches every manifest |
| The blocking criterion is stated | **TRUE but weak** — defined ("must be resolved before publication") and never operationalised |
| 0.1522 / 0.3478 overstate precision | **TRUE** — 6-sf constants from 2-sf inputs and a lower-bound marginal; contradicts the V18 uniform-within-band reasoning in the same file |

## 8. Fixes, in priority order

1. **V22.** Add a `D15` entry for the Pathways Study to `DATA_SOURCES.md` and a
   `BIBLIOGRAPHY.md` entry with a resolvable URL or DOI; repoint
   `variables.csv` V22 from `D10` to `D15`; resolve the `[AUTHOR:` marker at
   `Capacity_Is_Not_Access.tex:366`. Until then V22 should be class `A`, not `M`.
2. **The wording.** Correct `index.html:841-843` to say what the code does. Say
   "non-empty source field", not "resolvable DOI"; keep "or dataset id".
3. **Make "resolvable" true.** Add to `readVariables`: if the cell matches
   `^D\d+[a-z]?$`, require that id to appear in a loaded index of
   `DATA_SOURCES.md` headings; if it matches `^10\.\d{4,}/`, accept as a DOI;
   otherwise reject. This is ~15 lines and closes the hole for real.
4. **Split V20** into V20a (measured marginal, M, `D10`) and V20b (donor age
   gradient, A, `D11`), and add a DOI or URL to D11. Report the probabilities at
   two significant figures, or as the swept interval.
5. **Add the missing coverage test** the schema already promises
   (`REGISTRY_SCHEMA.md:117-119`): every model parameter has an `implemented`
   registry row. That is what would have caught the V22 drift.
6. **State a blocking criterion** — e.g. "an assumption is blocking if the
   headline result changes sign, changes by more than X%, or becomes
   uninterpretable when the assumption is varied across its stated range" — and
   re-apply it to A-03, A-18 and A-19.
