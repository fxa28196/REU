# Citation Audit — Vulnerability-Weighted Exposure Parameters

**Audited:** 25 July 2026
**Scope:** every relative-risk (RR) source underpinning `VWE = PM2.5 × RR_age × RR_comorbidity`
**Method:** each citation checked against PubMed / publisher record for author, journal, volume, pages, DOI, **and study topic**

---

## Summary

The "CORRECTED EDITION" implementation guide removed one bad citation (Bell et al. 2014, an
ozone paper) and replaced it with **two more that do not support the numbers attached to them.**
All three comorbidity/age RR sources currently fail verification.

**Nothing in the RR table can go into the chapter until these are re-sourced.**

---

## FINDING 1 — COPD relative risk (RR = 1.80) — SOURCE DOES NOT EXIST AS CITED

**As cited** (guide Ch. 9, `vulnerability.py`, parameter provenance table):

> Anderson et al. 2013. *Long-term exposure to outdoor air pollution and incidence of
> cardiovascular disease.* Eur Heart J.

**Actual record:**

> Atkinson RW, Carey IM, Kent AJ, van Staa TP, Anderson HR, Cook DG (2013).
> "Long-term exposure to outdoor air pollution and incidence of cardiovascular diseases."
> *Epidemiology* 24(1):44–53. DOI: 10.1097/EDE.0b013e318276ccb8

Three separate errors, and the third is fatal:

| Field | Cited | Actual |
|---|---|---|
| First author | Anderson | **Atkinson** (H.R. Anderson is 5th author) |
| Journal | European Heart Journal | ***Epidemiology*** |
| Topic | COPD vulnerability | **Cardiovascular** — MI, stroke, arrhythmia, heart failure |

The study is a cohort of 836,557 English primary-care patients aged 40–89. It reports an
association between PM/NO2 and incident **heart failure**, and explicitly *failed* to replicate
associations for other cardiovascular outcomes. It contains no COPD effect-modification estimate.

**Status: the COPD RR of 1.80 is currently unsourced.** This is the same class of error as
Bell 2014 — a real paper, cited for a finding it does not contain.

---

## FINDING 2 — Asthma relative risk (RR = 1.40) — WRONG JOURNAL, WRONG TOPIC

**As cited:**

> Zanobetti & Schwartz 2009. *The effect of fine and coarse particulate air pollution on
> mortality.* Epidemiology 20(5):708–716.

**Actual record:**

> Zanobetti A, Schwartz J (2009). "The effect of fine and coarse particulate air pollution on
> mortality: a national analysis." ***Environmental Health Perspectives*** 117(6):898–903.
> DOI: 10.1289/ehp.0800108

Wrong journal, wrong volume, wrong page range. More importantly: it is a national multi-city
time-series of **all-cause and cause-specific daily mortality**. It is not a study of asthma
as an effect modifier of PM2.5, so it does not support an asthma-specific RR of 1.40.

**Status: the asthma RR of 1.40 is currently unsourced.**

---

## FINDING 3 — Under-18 relative risk (RR = 1.22) — CITATION NOT SPECIFIC ENOUGH TO CHECK

Cited as "GBD MAPS / Kloog et al. 2013." GBD MAPS is a report series, not a paper; Kloog et al.
2013 is ambiguous (at least two papers that year). Neither is pinned to a volume, page, or DOI.

**Status: unverifiable as written.** Needs a single specific reference or removal.

---

## FINDING 4 — Bell et al. 2014 still live in the proposal

`REU_Project_Proposal__Updated_.docx` still lists Bell, Zanobetti & Dominici (2014),
"Who is more affected by ozone pollution?" as **reference [4]**, cited for PM2.5 comorbidity
risks. The implementation guide removed it; the proposal never got the edit. Two documents
in the same project currently disagree.

---

## FINDING 5 — Gini methodology citation does not support the claim

The proposal attributes the exposure-inequality Gini methodology to refs [7] and [8]:

- **[7] Mudway et al. 2019**, *Lancet Public Health* — a sequential cross-sectional study of
  London's Low Emission Zone and children's respiratory health. Not a Gini/inequality-metric paper.
- **[8] Holland et al. 2014** — a cost-benefit analysis for the EU National Emission Ceilings
  Directive. Not a Gini/inequality-metric paper.

Neither establishes a methodology for computing a Gini coefficient of exposure. The Gini formula
in `metrics.py` is standard and correct on its own terms — it just needs an honest source
(any standard inequality-measurement reference) rather than these two.

---

## FINDING 6 — Mentor's name is misspelled throughout

**Christof Teuscher**, Professor of Electrical and Computer Engineering, Portland State
University; PI of the NSF REU Site *Computational Modeling Serving Portland*.

Currently rendered "Christopher Teuscher" in the implementation guide and on slide 1 of the
midterm deck. Confirmed against the REU site and PSU. Fix before anything is printed.

---

## What to do about it

1. **Re-source, don't re-guess.** For each of the three RRs, find a paper that actually reports
   PM2.5 effect modification by that stratum, and record the exact effect estimate, CI, exposure
   metric (per 10 µg/m³? per IQR?), and outcome. Then set the RR to *that* number, not to 1.40/1.80.
2. **Take this to Dr. Teuscher this week.** Three unsourced parameters in the metric that is the
   entire contribution is a scope decision, not just an editing one.
3. **Keep the audit.** You now have a documented record of catching load-bearing errors in your
   own work — twice. That belongs in the chapter's limitations section, and it is worth more
   scientifically than a clean-looking table would have been.

---

*Verification performed with assistance from Claude (Anthropic), 25 July 2026. All records
checked against PubMed and publisher pages. Re-verify before submission — do not take this
file's word for it either.*
