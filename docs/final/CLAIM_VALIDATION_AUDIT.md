# Claim Validation Audit

Every major conclusion, tested against the evidence that supports it. Claims that
failed were **rewritten, not preserved**. The rewritten wording is given in each
case and is what appears in `UPDATED_FINAL_RESULTS_REPORT.md`.

**Audit date:** 2026-07-26 · **Model commit:** `02c3181` · **Evidence:**
`docs/runs/final-placement-experiment/{A,B}-seed{42,43,44}/`,
`docs/runs/historical-capacity-reference/`

---

## Summary

| # | Claim | Verdict |
|---|---|---|
| 1 | Optimized placement reduces smoke exposure | **SUPPORTED (rewritten — was previously the opposite)** |
| 2 | Placement benefit is larger in inhaled dose than in exposure | **SUPPORTED (new)** |
| 3 | Placement helps slower residents most | **SUPPORTED** |
| 4 | Scenario A is "what actually happened" | **REJECTED — rewritten** |
| 5 | "Capacity, not placement, is the constraint" | **REJECTED as stated — out of scope** |
| 6 | Mobility limitation and COPD reduce shelter access | **SUPPORTED under historical capacity; not applicable under the placement design** |
| 7 | Asthma has no effect | **SUPPORTED, and correctly characterised as an evidence gap** |
| 8 | Multi-seed stability, "<1 pp" | **REJECTED — rewritten** |
| 9 | Exposure results are a health finding | **REJECTED — never claimed, guarded** |
| 10 | Results reproduce from the manifests | **NOW SUPPORTED (was false)** |

---

## 1. "Optimized shelter placement reduces smoke exposure" — SUPPORTED

**Previously the study reported the opposite** (−0.03%, "changed nothing that
matters"). That earlier result was an **artefact of a broken experiment design**:
both arms were capped at 198 beds, so total capacity — not placement — bound the
outcome, and the experiment had no power to detect a placement effect at all.

**Corrected design.** Both arms hold system capacity equal to the population
(2 sites summing to 2,037 spaces). Individual sites keep finite capacity, so
shelters still fill, residents are still refused at a full door and re-route.
The **only** difference between arms is the two coordinate pairs.

**Evidence (3-seed means, n = 2,037):**

| Measure | A current | B optimized | Change |
|---|---|---|---|
| Residents sheltered | 2,021.7 (99.25%) | 2,021.7 (99.25%) | **0.00%** — confirms capacity is not binding |
| Mean walk, sheltered | 11,278 m | 8,402 m | **−25.50%** |
| Mean time to admission | 587.9 min | 542.6 min | −7.71% |
| **Total exposure** | 7,669,225 µg·m⁻³·h | 7,235,587 | **−5.65%** |
| **Total inhaled dose** | 5,482,060 µg | 4,792,852 | **−12.57%** |
| Person-hours > Unhealthy | 34,948 | 33,421 | −4.37% |

**Separability:** A and B per-seed ranges do **not** overlap on walk distance
(A 11,251–11,330 vs B 8,363–8,456), exposure (A 3,691–3,850 vs B 3,473–3,640) or
dose. The effect is larger than seed variation on all three.

**Approved wording:**
> *Relocating the same two-site shelter system to the street-network optimum,
> holding total capacity and every other input constant, reduced population
> inhaled PM2.5 dose by 12.6% and mean walking distance by 25.5%, without
> changing how many residents were sheltered.*

---

## 2. "The dose benefit exceeds the exposure benefit" — SUPPORTED (new finding)

Exposure falls 5.65%; inhaled dose falls **12.57%** — 2.2×. The mechanism is
exact and verifiable: better placement removes **walking** time specifically, and
ventilation while walking (1.62 m³/h) is 2.7× the resting rate (0.61 m³/h).
Concentration-time exposure counts a waiting hour and a walking hour equally;
inhaled dose does not.

**Approved wording:**
> *Because shelter placement acts on walking time, and ventilation while walking
> is roughly 2.7× resting ventilation, the benefit measured in inhaled dose
> (−12.6%) is more than double the benefit measured in concentration-time
> exposure (−5.7%). Reporting exposure alone understates the value of shelter
> siting by more than half.*

---

## 3. "Placement helps the most vulnerable most" — SUPPORTED

Dose reduction A→B by stratum (3-seed means):

| Stratum | Speed | Dose A | Dose B | Reduction |
|---|---|---|---|---|
| Mobility-limited | 0.99 m/s | 3,302 µg | 2,750 µg | **−16.71%** |
| Not mobility-limited | 1.37 m/s | 2,547 | 2,260 | −11.26% |
| COPD | 1.15 m/s | 2,890 | 2,477 | **−14.31%** |
| No COPD | 1.31 m/s | 2,667 | 2,338 | −12.35% |
| Vulnerable (any) | 1.18 m/s | 2,917 | 2,512 | **−13.90%** |
| Not vulnerable | 1.40 m/s | 2,481 | 2,206 | −11.10% |
| Asthma | 1.295 m/s | 2,682 | 2,351 | −12.34% |
| No asthma | 1.294 m/s | 2,695 | 2,356 | −12.60% |

The ordering follows walking speed monotonically, and asthma — which carries no
speed effect — shows no differential. That internal consistency is itself
evidence the mechanism is doing what is claimed.

**Approved wording:**
> *The dose reduction from optimized placement is largest for the residents who
> walk slowest: −16.7% for mobility-limited residents against −11.3% for
> unimpaired ones. Asthma, which carries no modelled mobility effect, shows no
> differential benefit (−12.3% vs −12.6%), as expected.*

---

## 4. "Scenario A is what actually happened" — REJECTED

**Not supported, and it was materially misleading.** Scenario A is a simulation
under modelled assumptions, and the model's own uptake does not match the
historical record.

`04-DECISION.md` §2.2 records the only quantitative behavioural calibration the
project has, from Street Roots 2020-09-16: **~90 occupants at the Oregon
Convention Center and 40 at Charles Jordan — about 130 of 198 beds.** The
historical-capacity reference run (`docs/runs/historical-capacity-reference/`)
fills **198 of 198**, i.e. **1.52× observed occupancy**.

The gap is explained by assumption **A-12** (universal shelter awareness), which
is contradicted by the local finding that 65% of surveyed unsheltered residents
had never heard of the shelters.

**Rejected wording:** "what actually happened" · "Is it real? Yes — this is the
historical situation."

**Approved wording:**
> *Historical placement under modelled assumptions.* And, wherever uptake is
> reported: *the model assumes universal awareness of the shelters and therefore
> fills both sites; the single contemporaneous observation records roughly 130 of
> 198 beds occupied. Modelled uptake is an upper bound, and the difference is
> consistent with the local finding that most unsheltered residents were unaware
> the shelters existed.*

---

## 5. "Capacity, not placement, is the limiting factor" — REJECTED as a study claim

This conclusion came from the broken design (§1), where capacity was held at 198
in both arms and therefore *had* to dominate. **The corrected study does not test
capacity at all** — it deliberately removes capacity as a constraint in order to
isolate placement. A study that holds a variable constant cannot report a finding
about it.

The historical-capacity reference run is retained as context, not as a result:
with 198 real beds against 2,037 residents, 9.7% are sheltered. That is
arithmetic (198/2,037), not an experimental finding.

**Approved wording:**
> *This study does not test shelter capacity. Both arms hold total capacity equal
> to the population so that placement can be isolated. For context, a reference
> run using the historically reported 2 × 99 beds shelters 198 residents — a
> figure fixed by the bed count itself rather than by geography.*

---

## 6. "Mobility limitation and COPD reduce shelter access" — SUPPORTED, scoped

Under the **historical-capacity reference** (beds scarce, first-come-first-served),
mobility-limited residents reach shelter at ~3.6% vs ~11.2% and COPD residents at
~3.1% vs ~10.5%. Direction is consistent across all seeds and both prior arms.

**Two constraints on how this may be stated.** First, the subgroup counts are
small — 5 to 17 admitted individuals per run — so the *magnitude* is not
precisely estimable. Second, blocking assumption **A-16** (execution order does
not affect outcomes) is **unmet**: order-independent two-phase admission was
specified as a prerequisite for any n > beds run and was never implemented, so
the last bed is awarded by the per-tick RNG shuffle.

**Approved wording:**
> *Under scarce capacity and first-come-first-served admission, slower residents
> are markedly less likely to obtain a bed (roughly 3–4% against 10–11%). The
> direction is consistent across seeds, but the magnitude rests on single-digit
> admitted counts, and admission order within a tick is randomised (A-16,
> unresolved), so the effect size should be read as indicative rather than
> estimated.*

---

## 7. "Asthma has no effect" — SUPPORTED, and correctly framed

Asthma carries no walking-speed effect because no quantitative comfortable-gait-
speed decrement for adults with asthma was found; the literature supports lower
physical *activity volume*, which cannot be converted to m/s without invention.
COPD does carry one (Buekers 2024, −0.19 m/s). Realised speeds differ by
0.0008 m/s — sampling noise. Pooled Fisher p = 0.40.

**Approved wording:**
> *Asthma shows no differential outcome because no evidence supports a
> comfortable-gait-speed effect for asthma, whereas a meta-analysis does support
> one for COPD. The asymmetry between the two conditions reflects the state of
> the evidence, not a modelling preference.*

---

## 8. "Headline outcomes identical across seeds; stratum rates vary by <1 pp" — REJECTED

The "<1 pp" claim was falsified in 8 of 12 stratum series (worst 2.90 pp).
Separately, `n_sheltered` equalling total capacity is an **identity**, not
replication — it would hold for any seed.

**Approved wording:**
> *With three seeds, results are reported as observed ranges rather than as
> point estimates with implied precision. The placement effect on walking
> distance, exposure and dose is larger than the seed-to-seed range in every
> case; subgroup rates under scarce capacity vary by up to 2.9 percentage points
> across seeds and are reported as ranges. No significance test is claimed: three
> model realisations resample the population, not the mechanism.*

---

## 9. Health claims — never made, and structurally guarded

No output is described as illness, hospitalisation or mortality. The health-risk
multiplier is 1.0 for every resident by design, so risk can never be silently
folded into dose. See `HEALTH_MODEL_AUDIT.md`.

**Approved wording:** *The model measures environmental exposure and inhaled
particulate mass. It does not model health outcomes, and no result should be
interpreted as one.*

---

## 10. "Every number reproduces from the archived manifests" — NOW SUPPORTED

Previously **false**: nine archived runs stamped commit `6616232`, which contained
neither the COPD speed effect nor the third scenario, and the report cited a third
commit `ccad7b7`.

**Fixed this pass.** All runs re-executed from a clean tree at `02c3181`;
manifests stamp `02c3181`, `git_working_tree_dirty: false`, governance counts
28 variables / 26 assumptions matching the registry on disk, and a new
`source_integrity` block checksums 12 files — including `Streets.dbf`, which
holds the node IDs that build the routing graph and was previously unchecksummed.

**Approved wording:**
> *Every run reproduces from its manifest: commit, parameters, dataset SHA-256s
> (including all shapefile sidecars), governance-registry hashes, and a
> working-tree cleanliness flag.*

---

## Claims that were quietly dropped, and why

- **"~3,000× more effective"** — a ratio with a near-zero denominator produced by
  the broken design. Removed.
- **"Adding beds reduces exposure 92%"** — an artefact of comparing 198 beds
  against 2,037; it is arithmetic, not an experimental result, and capacity is no
  longer a study variable. Removed.
- **"B improves vulnerable sheltering +0.34 pts"** — seed ranges overlapped
  (sign flipped across seeds). Removed; the equity finding is now carried by the
  dose reduction in §3, which is separable.
