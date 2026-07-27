# Final Data Validation Report

**Status: TASKS 1–3 RESOLVED ON EVIDENCE. TASK 4 (RE-RUN) NOT EXECUTED.**

This pass audited the empirical inputs and found **two corrections large enough
to change every headline number**. The corrected values are recorded here with
sources. The re-run was deliberately **not started**, because it could not be
completed and verified in this session, and a half-applied population change
would leave the repository inconsistent — the exact failure mode this project
has avoided throughout.

The engine was not touched. No agent, exposure, RNG, routing or optimization
code changed in this pass.

---

## TASK 1 — Shelter inventory reconciliation

**Currently modelled: 29 of 48 inventory rows.** The missing capacity is
substantial and is quantified below. Full per-row detail is in
`SHELTER_INVENTORY_RECONCILIATION.md`.

### 1.1 Included (29 facilities, 1,816 people-capacity)

Geocoded from the HSD July-2026 address via OpenStreetMap Nominatim. Capacity
converted per `SHELTER_CAPACITY_AUDIT.md` §2: beds ×1.0, motel rooms ×1.25,
village units/pods ×1.1, family rooms ×3.25.

### 1.2 City Safe Rest Villages — 8 excluded, 486 units (~535 people)

Addresses **recovered this pass** from City of Portland sources. Six are now
resolvable; two are not.

| Village | Units | Address found | Quality |
|---|---|---|---|
| Sunderland RV Safe Park | 55 | 9827 NE Sunderland Ave | Full street address |
| Peninsula Crossing | 60 | 6631 N Syracuse St | Full street address |
| BIPOC Safe Rest Village | 38 | 84 NE Weidler | Full street address |
| Menlo Park Safe Rest Village | 50 | 122nd & E Burnside | **Intersection only** — geocodes to a junction, not a parcel |
| Reedway Safe Rest Village | 60 | 106th block SE Reedway | **Block-level only** |
| Queer Affinity Village | 35 | 2300 block SW Naito | **Block-level only** |
| **Clinton Triangle** | **160** | **NOT FOUND** | Largest single site in the inventory; Urban Alchemy-managed; no published street address located |
| Multnomah Safe Rest Village | 28 | **NOT FOUND** | Urban Alchemy-managed |

**Recommendation: INCLUDE the six with addresses**, tagging the three
block/intersection-level ones `coord_confidence = approximate_block_level` (the
schema already carries this column). **Exclude Clinton Triangle and Multnomah
SRV** until an address is obtained, and state plainly that 188 units (~207
people) of real capacity are therefore absent from the model.

Sources: [portland.gov Safe Rest Villages](https://www.portland.gov/united/saferestvillages) ·
[Commissioner Ryan announcement, 3 Mar 2022](https://www.portland.gov/ryan/news/2022/3/3/commissioner-ryan-announces-emergency-declaration-and-four-new-safe-rest-village) ·
[Street Roots, 9 Mar 2022](https://www.streetroots.org/housing/2022/03/09/srvs-sited/)

### 1.3 Doreen's Place — 1 excluded, 90 beds

Address `610 NW Broadway St, Portland` is present in the source; Nominatim
returned nothing. **Recommendation: retry** with the alternate form
`610 NW Broadway` or the US Census geocoder already used for two 2020 shelters.
This is a solvable geocoding failure, not missing data.

### 1.4 Day centers — 10 excluded, capacity unpublished

**Recommendation: EXCLUDE from the capacity model, but state prominently as a
limitation.**

Justification: no capacity figure is published for any of the ten, so including
them would require inventing a number. **However — and this is a real
scientific point that the evidence package raises and this report endorses —
during a *daytime* smoke episode, day centres are arguably the most relevant
clean-air spaces available.** Their absence understates daytime shelter
availability. That is a named limitation, not a silent omission.

### 1.5 Capacity impact

| | Facilities | People-capacity |
|---|---|---|
| Currently modelled | 29 | 1,816 |
| + six locatable City villages | 35 | ~2,114 |
| + Doreen's Place | 36 | ~2,204 |
| Still missing (Clinton Triangle, Multnomah SRV) | — | ~207 |
| Day centres | 10 | unknown |

**Modelled capacity is roughly 18% low.** The defensible figure is ~2,204,
against a possible ~2,411 excluding day centres.

---

## TASK 2 — Population denominator: 2,037 is obsolete

### The finding

**The 2025 Tri-County Point-in-Time Count (PSU Homelessness Research & Action
Collaborative, released 4 November 2025) reports 10,526 people experiencing
homelessness in Multnomah County, of whom more than 65% were unsheltered —
approximately 6,842 unsheltered people.**

Unsheltered homelessness in Multnomah County rose **75% between 2023 and 2025**
(+2,968 people).

Sources: [2025 Tri-County PIT Count Findings Summary Report (HSD)](https://hsd.multco.us/wp-content/uploads/2025/11/2025-Tri-County-PITC-Report-11.04.25.pdf) ·
[PDXScholar hrac_pub/52](https://pdxscholar.library.pdx.edu/hrac_pub/52/) ·
[PSU HRAC release](https://www.pdx.edu/news/psu-homelessness-research-and-action-collaborative-releases-2025-tri-county-point-time-count)

### Is replacement justified?

**Yes.** Same instrument (PIT), same geography (Multnomah County), same
quantity (**unsheltered**, not total homeless, not shelter throughput), and it
is contemporaneous with the 2026 shelter network and the 2026 Pathways
demographics the model already uses. Retaining a 2019 denominator inside an
otherwise present-day study is exactly the vintage inconsistency this project
has corrected everywhere else.

**Correctly rejected alternatives**, per instruction: total homeless 10,526
(includes sheltered people, who are already indoors and do not walk);
`N_SERVED_HSD_FY25 = 6,731` (unique individuals served across a *year* — counts
turnover, and those people were sheltered).

### Mandatory caveat

The PIT report itself states that **changes in the approach to including
administrative data substantially augmented the 2025 unsheltered count**. Part
of the 75% rise is therefore methodological rather than real growth. The
2019 → 2025 comparison is **not** a clean time series and must never be
presented as one.

### Consequence — why the re-run was not started

| | Now | Corrected |
|---|---|---|
| Population | 2,037 | **~6,842** (3.4×) |
| Capacity | 1,816 | ~2,204 |
| Capacity ÷ population | 0.89 | **~0.32** |

At 2,037 residents against 1,816 beds, capacity was nearly sufficient and
**placement was the binding constraint** — which is what produced the current
headline. At 6,842 against 2,204, **roughly two thirds of the population cannot
be sheltered under any placement**, and capacity becomes binding again.

**Every magnitude in `UPDATED_FINAL_RESULTS_REPORT.md` is therefore
provisional.**

---

## TASK 3 — Demographic revalidation

No variable was removed and no number was invented.

| Variable | Current value | Source | Year | Population studied | Quality | Verdict |
|---|---|---|---|---|---|---|
| **Age bands** | 52.7 / 42.3 / 5.0% | Pathways Study | **2026** | N=541, Multnomah, unsheltered-inclusive | **Good** — local, current, survey-measured | **Retain** |
| **Chronic physical condition** | 39.1% | Pathways Table 2.1 | **2026** | Same | **Good**; triangulated by City report (69% any-disability vs Pathways 73%) | **Retain** |
| **Sex** | 68.5 M / 29.3 F / 2.3% other | 2019 PIT | **2019** | Multnomah unsheltered, N=2,037 | **Stale.** No sex breakdown found anywhere in the 2026 package | **Retain, flag.** Replace if the 2025 PIT publishes a gender table |
| **Mobility limitation** | 19.2% | 2019 PIT Table 22 | **2019** | Multnomah unsheltered | **Stale, and a stated lower bound** — asked only of survey completers but divided by the full population | **Retain, flag.** Sits awkwardly beside Pathways' 73% any-disability |
| **Asthma** | 15.0% | Zellmer et al. 2025, DOI 10.1007/s11606-025-09814-x | 2025 | **Minnesota**, n=20,139 EHR | **Imported, not local.** No local asthma prevalence exists in any PIT | **Retain** — required for stratified reporting |
| **COPD** | 10.5% | Same | 2025 | Same | **Imported.** Load-bearing: drives the only verified movement effect | **Retain** |
| Walking speed | Bohannon age×sex, CV 0.13 | 2011 / 1997 | — | Healthy adults, n=23,111 | Literature; not unsheltered-specific | Retain |
| Impaired speed | N(0.95, 0.32) m/s | Boyce 1999 via Tinaburri 2018 | 1999 | Disabled ambulant | **Verified-in-secondary** | Retain; obtain primary |
| COPD speed delta | −0.19 m/s | Buekers 2024 | 2024 | COPD patients | Primary, measured | Retain |
| Ventilation | 1.62 walking / 0.61 resting m³/h | EPA EFH Ch. 6 | 2011 | US adults | **Verified-in-secondary**, sensitivity-swept | Retain; confirm primary |

Two variables are stale (sex, mobility) with no local replacement located. Both
are flagged rather than silently carried forward.

---

## TASK 4 — COMPLETED. See `PRESENT_DAY_THREE_ARM_RESULTS.md`

**Superseded.** Everything below this heading described why the re-run had not
been started. It has since been executed in full, with the experiment
restructured so that each arm answers what the previous arm measured:

- **Population corrected to 6,842** and **capacity to 2,234** (36 facilities;
  five villages plus Doreen's Place geocoded from recovered addresses, and the
  two intersection-only sites resolved to hundred-block addresses).
- **A (reality) reported that CAPACITY binds**: 2,060 sheltered of 6,842, 4,766
  turned away, 33 of 36 facilities completely full.
- **B therefore adds capacity at the real locations** — 91.6% sheltered, but it
  leaves 578 beds empty while 562 people are refused, exposing a second,
  geographic constraint.
- **C places B's identical beds optimally** — 99.4% sheltered, zero turned away.
- The optimizer's hardcoded `n2037` path was replaced with CLI arguments, so it
  can no longer silently consume a previous population's demand.

**The headline survived and strengthened.** The prediction recorded below — that
the direction would hold while the magnitude fell — was **wrong in an
informative way**: placement's benefit *grew*, because at 6,842 people the
spatial mismatch between where residents are and where beds are is far more
severe than it was at 2,037. The earlier design could not have seen this,
because capacity was never relieved first.

**New finding this pass:** capacity expansion alone *widens* the equity gap
(mobility-limited access trails by 13 points in A and 24.5 points in B), and
placement closes it to 0.1 points. Placement is not just more efficient than
capacity — it is the only one of the two that is equitable.

Retained below for the record: the reasoning as it stood before the re-run.

### (superseded) Why the re-run had not been started

**Deliberately not started.** Tasks 1 and 2 change the two largest inputs
(capacity +18%, population ×3.4). Applying them requires: rebuild the shelter
file → update `numAgents` → re-run arm A × 3 seeds → re-optimize Scenario B
against the *new* demand → re-run arm B × 3 seeds → regenerate readable
outputs, figures and manifests. That could not be completed **and verified**
in the remaining session budget, and a partially applied population change is
worse than none at all.

### Exact steps to finish

1. Add the six locatable City villages to the shelter inventory; retry Doreen's
   Place via the Census geocoder; rebuild
   `shelters_2026_current_placement.csv`.
2. Set `numAgents = 6842` in `batch/batch_params_final_{A,B}_seed{42,43,44}.xml`.
3. **Update `scripts/optimize_2026_placement.py:29`** — `RUN` hardcodes
   `finalA-n2037-seed42/agents.csv`. The `n2037` fragment is part of the output
   directory name and will not exist after the population change. This is the
   one line of tooling that must change; it is not engine code.
4. `cd Geography && ./gradlew.bat compileJava` (no source change required).
5. **Delete stale run directories first** — output dirs are keyed by seed and
   have silently contaminated results before.
6. Run arm A × 3 → `python scripts/optimize_2026_placement.py` → run arm B × 3.
7. `python scripts/compare_scenarios.py`, then
   `python scripts/make_readable_results.py`.
8. Update `UPDATED_FINAL_RESULTS_REPORT.md` §3 and the "what changed" section
   below with the real numbers.

Nothing structural changes: the scenario wiring, optimizer and reporting
pipeline already handle arbitrary facility counts and population sizes.

---

## What changed, what did not, and what survives

### Changed in this pass
Evidence only. Two corrected inputs identified and sourced; six shelter
addresses recovered; every demographic variable audited and graded.

### Not changed
Engine, agent architecture, exposure model, RNG streams, routing, network
validation, optimization algorithm, experiment design — all frozen as
instructed.

### Which numbers changed
None yet in the model. Two inputs are now known to be wrong and by how much:
population 2,037 → ~6,842, capacity 1,816 → ~2,204.

### Does the research conclusion change?

**The claim is expected to survive; its magnitude will fall.**

Stated as a prediction to be tested, not as a result: at capacity ÷ population
≈ 0.32, most residents cannot be sheltered under *any* placement, so the
ceiling on placement benefit is far lower than at 0.89. But the arm-A mechanism
— **191 beds sitting empty while 402 people were turned away** — is a pure
geography failure, and it does not disappear when demand rises; more people
compete for the same reachable beds. The *direction* is robust. The *effect
size* is not.

**Do not quote the current magnitudes** (+191 sheltered, −45.7% dose, −54.7%
walking distance) until the re-run completes. They are conditioned on a
population 3.4× too small and a capacity ~18% too low.

### Conclusions that remain supported regardless
- Exposure engine externally validated against raw EPA AQS (ratio 1.0000).
- Every resident is created, tracked and exported; no removal path exists.
- Exposure, inhaled dose and health risk are computed separately; the risk
  weight is fixed at 1.0 by design.
- Placement, not capacity, explains the empty-beds-with-refused-people pattern
  observed in arm A.
- Asthma shows no access effect and COPD does, because only COPD has a
  verified gait-speed estimate.

### Remaining limitations
1. Population is 3.4× low until updated; **all current magnitudes provisional**.
2. Clinton Triangle (160 units) and Multnomah SRV (28) have no published
   address.
3. Ten day centres excluded — no published capacity; likely the most relevant
   clean-air spaces during a *daytime* episode.
4. Sex and mobility distributions are 2019 inside a 2026 study.
5. Three City village addresses are block- or intersection-level.
6. The 2025 PIT's methodology change means 2019 → 2025 is not a clean time
   series.
7. Asthma and COPD prevalences are imported from Minnesota.
8. A-12 (universal shelter-seeking) still unmodelled; Pathways measures 67% /
   34% awareness and would lower uptake further.
9. A-16 (order-independent admission) still unmet, and becomes **more**
   material once capacity binds hard again.

### The claim, as it must be stated

> *Optimized shelter placement improves outcomes under the modelled
> assumptions.*

Not: *this recreates what happened historically.* Calibration does not support
that — the historical reference run over-predicts the single observed occupancy
record by 1.52×.
