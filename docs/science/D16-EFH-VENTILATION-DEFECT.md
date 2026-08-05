# V25 ventilation rates — the walking value is right, the resting value is not in the source

**Status:** OPEN DEFECT, recorded 2026-08-04. **Nothing has been changed, no run
invalidated, no parameter edited.** This document exists so the defect cannot be
lost, and so the decision it requires is made with the numbers in front of it.

**Found by:** the 26-variable primary-source verification sweep of 2026-08-04
(the pass that also produced [D15](DATA_SOURCES.md) for the Pathways Study). V25
was the sweep's highest-value target *because the registry itself flagged it*:
`uncertainty` carried **VERIFIED-IN-SECONDARY — "the table cells were not
re-read from the primary during implementation"**. They have now been re-read.
The flag was warranted.

---

## 1. What was checked, and how

The primary was downloaded from epa.gov and text-extracted, not consulted through
a secondary description:

> U.S. EPA, *Exposure Factors Handbook 2011 Edition, Chapter 6 — Inhalation
> Rates*, EPA/600/R-09/052F, September 2011, 96 pp.

The report number and chapter match `variables.csv` V25's `doi_or_dataset`
exactly. The relevant table is **Table 6-2, "Recommended Short-Term Exposure
Values for Inhalation (males and females combined)", printed pp. 6-4/6-5**, whose
units are **m³/minute**.

## 2. The walking rate is CONFIRMED

**1.62 m³/h is genuine.** It is exactly Table 6-2's Moderate Intensity mean for
ages **31 to <41**: `2.7E-02 m³/min × 60 = 1.62 m³/h`.

One caveat that should be stated wherever the number is: it is **one age-group
cell, not an adult aggregate**. The adult Moderate Intensity means span
1.500–1.740 m³/h (21–<31: 1.560; 31–<41: 1.620; 41–<51: 1.680; 51–<61: 1.740;
61–<71: 1.560; 71–<81: 1.500; ≥81: 1.500). An adult-weighted moderate mean is
≈1.59 m³/h.

## 3. The resting rate is NOT IN THE SOURCE

**0.61 m³/h does not appear in the cited chapter.** It would be
`1.017E-02 m³/min`, and **no Table 6-2 cell holds `1.0E-02` at any age or
activity level** — the Light Intensity column steps 7.6E-03 → 1.1E-02 → 1.2E-02
→ 1.3E-02, straddling it without touching it. A regex scan of all 96 pages for
"0.61" returns only unrelated cells (body-weight-normalised child rates in
Tables 6-7/6-8, an adolescent-girls row, percentile columns) — none an adult
ventilation rate in m³/h.

The candidate cells that *do* exist, adult rows, converted to m³/h:

| Table 6-2 activity level | adult range (m³/h) |
|---|---|
| Moderate Intensity | 1.500 – 1.740 |
| **Light Intensity** | **0.720 – 0.780** |
| Sedentary / Passive | 0.252 – 0.300 |
| Sleep or Nap | 0.276 – 0.318 |

**The repository also contradicts itself about which cell 0.61 is supposed to
be.** `variables.csv` V25 and `BIBLIOGRAPHY.md` call it *resting*;
`docs/final/HEALTH_MODEL_AUDIT.md:62` calls it the *"Light-intensity adult
cell"*. Neither reading matches the table: Light Intensity is 0.72–0.78.

## 4. Blast radius — what a correction would touch

- `Geography/data/registry/variables.csv`: **V25** (the value and its class) and
  **V50**, whose `stuckDelayH` rationale hard-codes "0.61 m³/h" and inherits the
  correction.
- The **dose column in every archived run**. `inhaled_dose_ug = Σ C·IR(activity)·dt`,
  so every `cumulative_dose_ug` figure in every `agents.csv` under
  `Geography/output/` and `docs/runs/` is computed with the disputed constant.
- **The "2.7×" ratio**, stated in `docs/final/CLAIM_VALIDATION_AUDIT.md:69,75`,
  `docs/final/HEALTH_MODEL_AUDIT.md:92`, `docs/final/PRESENTER_SCRIPT.md:473`,
  `docs/final/FINAL_DATA_VALIDATION_REPORT.md:165`, and
  `docs/final/TECHNICAL_REFERENCE.md:1407`.
- `websim/engine/src/**` digest/golden identity checks keyed on the literal
  `0.6100`.

## 5. What survives the defect, and what does not — read this before deciding

**The qualitative finding survives, and it survives analytically rather than by
luck.** The headline mechanism is:

> dose falls 12.57 % while exposure falls only 5.65 %, because optimized
> placement removes *walking* time and walking ventilation exceeds resting
> ventilation.

That conclusion depends only on **IR_walk > IR_rest**, which holds for *every*
candidate cell in the table (1.62 against 0.72, or against 0.30). The
direction, the mechanism, and the claim that exposure-only reporting understates
the benefit of placement are unaffected by which resting cell is chosen.

**What does not survive is any absolute dose magnitude and the ratio itself:**

| resting IR | source status | walk : rest ratio |
|---|---|---|
| 0.61 m³/h (current) | **not in the source** | 2.66× (published as "2.7×") |
| 0.72 m³/h (Light Intensity, 21–<31 / 31–<41) | Table 6-2 cell | **2.25×** |
| 0.30 m³/h (Sedentary/Passive, 51–<61) | Table 6-2 cell | 5.40× |

So the correction could move the ratio either **down** (if waiting is modelled as
light activity — standing, milling) or **up** (if waiting is modelled as
sedentary). It is not a small monotone nudge, and it cannot be waved through.

Note also that the registry's own sensitivity sweep, `0.4–0.8 m³/h`, **excludes
the Sedentary/Passive cells entirely** — so the existing sweep does not bracket
the source's own range.

## 6. The decision required (author's, not an agent's)

1. **Choose the cell that matches what the model actually does.** Residents
   awaiting departure are outdoors and mobile-but-not-walking; Table 6-2 **Light
   Intensity (~0.72 m³/h)** is the defensible default. Seated/immobile waiting
   would be Sedentary/Passive (~0.25–0.30). This is a modelling judgement about
   the simulated behaviour, and it must be *stated*, not inferred.
2. **Widen the resting sweep to ~0.25–0.80 m³/h** so it spans the candidate cells.
3. **Re-run and restate** every dose figure and the walk:rest ratio, or —
   if the campaign is not re-run before camera-ready — state in the chapter that
   the resting ventilation constant is an **assumption (class A)**, not an EFH
   cell, and report the dose results as ratio-dependent.
4. **Tighten the walking provenance** to name the cell: *"EFH 2011 Table 6-2,
   Moderate Intensity, ages 31 to <41, 2.7E-02 m³/min"*, and say why one
   age-group cell stands for the modelled adult population (or move to the
   adult-weighted 1.59 and re-run).
5. **Resolve the internal contradiction** — `BIBLIOGRAPHY.md` "resting" vs
   `HEALTH_MODEL_AUDIT.md` "Light-intensity adult cell" — to one label matching
   the chosen cell.
6. **Clear VERIFIED-IN-SECONDARY on the walking half** (it is now verified in
   primary). If a non-EFH value is retained for waiting, **reclassify that half
   from evidence class L to A** with an explicit note that it is an assumption.

Until (1)–(6) are done, **do not publish V25 as currently sourced.**

---

## 7. Editing the registry — the rebuild step, learned the hard way

`Geography/data/registry/variables.csv` is a **source**; `websim` ships a
**derived** snapshot of it (`pipeline/out/assets/registry-snapshot.json`, whose
SHA-256 is in the asset manifest and is re-verified in the browser at load).
Editing the CSV without rebuilding leaves the two disagreeing.

That is caught, not silent — `websim/pipeline/test/reproducibility.test.ts >
"reproduces the registry snapshot"` compares the on-disk asset against a fresh
build and fails on the hash. The provenance edits recorded above tripped it
within minutes, exactly as intended.

**So after ANY edit to `variables.csv` or `assumptions.csv`, run from `websim/`:**

```
npm run build:registry -w pipeline    # rewrites the snapshot
npm run build:checksums -w pipeline   # re-stamps the asset manifest
```

Both are also covered by `npm run build:data -w pipeline`. `pipeline/out/` is
git-ignored, so this is a step every working copy performs for itself; the test
is what guarantees nobody forgets.

**A diagnostic note worth keeping.** When this first appeared inside the
2,159-test aggregate run it looked like the documented `npm test` contention
timeout (`Timeout calling "onTaskUpdate"` unhandled errors were present in the
same output) — and it was nothing of the sort: a **14 ms assertion failure** on
a SHA-256 comparison. The unhandled reporter timeouts were real but incidental,
and reading them as the cause pointed at the wrong fix entirely. Name the
failing test before diagnosing it.
