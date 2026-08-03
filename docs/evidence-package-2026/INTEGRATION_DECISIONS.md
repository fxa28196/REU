# Integration of the verified 2026 evidence package

What arrived in `files (1)`, item by item: what it is, what vintage, and whether
it is used, held, or superseded. **Nothing was deleted from either side.**

**Date:** 2026-07-26 · **Reviewed against:** model commit `551a093`

---

## 0. The one decision that governs everything else

The package is **excellent and internally consistent — and it is 2025–2026
data.** The HSD shelter list is July 2026, the day-centre list October 2025, the
Pathways Study April 2026, the Adult Shelter Review FY2025, the City report
FY2023-24.

The current model simulates **September 2020**. Substituting 2026 shelter
locations and capacities into a 2020 event would be the same temporal category
error this project already refuses for encampment locations (A-03) and already
refused once for capacity (`SHELTER_CAPACITY_AUDIT.md` §1).

**So the package is not merged into the 2020 runs. It is preserved intact and it
unlocks a second, arguably stronger study** — see §4.

---

## 1. Used immediately

| Item | Value | Why it is safe to use now |
|---|---|---|
| **`shelters_multnomah_2026.csv`** → `Geography/data/shelters/` | 48 facilities: real names, addresses, capacities, units, providers, closure dates, `priority_vulnerable` flag | Vintage-consistent with the 2025–26 encampment data already in the repo. Copied verbatim; **not** substituted into the 2020 runs |
| **Three source PDFs** → `source-pdfs/` | Pathways Survey 2026 · Adult Shelter Review FY25 · City Shelter Services FY2024 | Primary government documents. Their absence was flagged in my own audit — every claim now has a checkable source in-repo |
| **`WEIGHTS_EVIDENCE.md`, `CITATION_AUDIT.md`, `DATA_PROVENANCE.md`, `AUDIT_RESPONSE.md`** | Literature review on susceptibility weights and the citation errors | Independent corroboration of conclusions this project reached separately (§2) |
| **`geocode_shelters.py`** → `scripts/` | Nominatim geocoder for the 48 addresses | Needed before the 48 facilities can enter the street network. Coordinates were deliberately left blank rather than invented — correct practice |

---

## 2. Independent corroboration — two analyses, same conclusion

These were reached separately by this project and by the package. Agreement is
worth stating in the write-up, because it is genuine replication:

| Finding | This repo | The package |
|---|---|---|
| **RR_age ×1.45 (Di 2017) is wrong** | `02-VULNERABILITY.md` §1: Di 2017's cohort is entirely 65+, so it cannot yield an age contrast | `WEIGHTS_EVIDENCE.md`: same conclusion |
| **Kondo 2019 elderly:adult RRR = 1.008 (0.996–1.020)** | Recorded in `02-VULNERABILITY.md`; used to justify weights = 1.0 | Independently identified as the load-bearing number |
| **`VWE = PM2.5 × RR × RR` is dimensionally invalid** | Decision D-3 rejected the multiplied index as a category error | "a relative risk is a rate ratio, not a harm multiplier" |
| **"Anderson 2013" RR_COPD 1.80 does not exist** | Verified non-existent | Listed among six citation errors |

Both analyses arrived at **susceptibility weights of 1.0** from different
directions. That is the strongest defence available for the choice.

---

## 3. Held — sourced, high-value, not yet wired in

Each of these is better than what the model currently assumes. They are recorded
here with exact values and sources so integration is mechanical, not a research
task.

### 3.1 Shelter-seeking propensity — resolves blocking assumption A-12

**The most valuable single number in the package.**

> Pathways Study 2026 (N = 541, Multnomah County, PSU HRAC / OHSU):
> **67%** stayed in a shelter at least once in the last 6 months;
> **34%** identified the shelter system as where they slept most often.

The model currently assumes **universal uptake** (A-12, `blocking`) and
consequently fills every shelter. My own audit flagged this as the reason the
model over-predicts the one observed occupancy record by 1.52× (198/198 modelled
against ~130 observed on 2020-09-16).

The package also corrects the *concept*: this is not "awareness." Of the 204
shelter users who commented, **58% were mostly negative** — citing safety, staff,
theft, substance exposure and rules. People know shelters exist and decline them.

**Recommended implementation:** a per-agent Bernoulli draw at creation,
`shelterSeekingPropensity`, default **1.0** (preserving every current result)
with the sourced value **0.67** and sensitivity **0.34–0.67**. Agents who do not
seek shelter remain outdoors and keep accruing exposure. This would replace
A-12's assumption with a measured local parameter and should bring modelled
uptake into line with the observed record.

### 3.2 Baseline occupancy — shelters do not start empty

> Adult Shelter Review FY2025: **"88% average nightly occupancy rate"**
> (congregate 71–99%, alternative 57–97%, motel 62–94%).

The model starts every shelter empty. For the **2020 clean-air activations** that
is arguably correct — OCC and Charles Jordan were opened specifically for the
smoke event. For any **present-day** analysis using the 48-facility year-round
network it is wrong, and overstates available capacity roughly eight-fold.

**Recommended:** apply `BASELINE_OCCUPANCY = 0.88` when running the 2026 network;
do **not** apply it to the 2020 activation runs. The distinction matters and
should be stated explicitly.

### 3.3 Pathways demographics — a local alternative to the 2019 PIT

| Attribute | Package (Pathways 2026, N=541) | Repo currently (PIT 2019) |
|---|---|---|
| Age | 18–44 52.7% · 45–64 42.3% · 65+ 5.0% | 18–24 6.7% · 25–54 72.7% · 55–69 19.1% · 70+ 1.2% |
| Chronic physical condition | **39.1%** (194/541) | asthma 15% + COPD 10.5% (imported from Minnesota EHR) |
| Any disability | 73% — corroborated independently at 69% by the City report | 78.7% ≥1 disabling condition (PIT) |

The Pathways condition figure is **local and survey-measured**, where the repo's
asthma/COPD split is **imported from Minnesota**. That is a real improvement in
provenance. The cost is that Pathways reports a single "chronic physical
condition" category, which cannot drive the COPD walking-speed mechanism
(Buekers 2024) that produces the current equity result.

**Recommended:** keep the asthma/COPD split for the movement mechanism; adopt the
Pathways 39.1% as the headline local prevalence and as a cross-check. Report the
73%/69% triangulation — two agencies, different populations, different methods.

### 3.4 The finding that needs no simulation

> **61.3% of vulnerability-prioritised shelter capacity closes by 31 August 2026,
> against 7.6% of general capacity.**

Arithmetic on published numbers: of 476 beds in facilities giving priority to
veterans, adults 55+ and people with disabilities, 292 (Laurelwood 120 + River
District 100 + Walnut Park 72) close on 2026-08-31.

This is independent of the model, its weights, and its street network. It is
directly checkable from `shelters_multnomah_2026.csv` (`closure_date` and
`priority_vulnerable` columns) and should be stated as a standalone result.

---

## 4. Why this package makes a *second* study possible — and fixes A-03

The repo's largest data limitation is **A-03**: encampment locations are
2025–26 City reports used as a proxy for 2020. That limitation exists only
because the study is set in 2020.

The package supplies everything needed to run the **present-day** system:
2026 shelters, 2026 demographics, 2026 occupancy, 2026 closure schedule — all
contemporaneous with the encampment data already in the repo.

> **If a September-2020-magnitude smoke episode struck Multnomah County today,
> how would the current shelter network perform — and what changes after the
> announced August 2026 closures?**

Under that framing:
- **A-03 disappears entirely.** Encampment locations become contemporaneous
  rather than a five-year proxy.
- The 2020 PM2.5 series becomes a **hazard scenario** ("a 2020-magnitude event"),
  which is standard practice in hazard modelling and needs no apology.
- The closure schedule gives a **real, pre-announced policy intervention** to
  test — far stronger than a theoretical p-median optimum.
- Every capacity figure is contemporaneous with its occupancy figure.

**Prerequisites, in order:** run `scripts/geocode_shelters.py` (needs internet,
~1 minute, 48 addresses); resolve the 8 `NEEDS ADDRESS` City sites; snap the
geocoded facilities to the street graph; apply unit conversions from
`SHELTER_CAPACITY_AUDIT.md` §2 (beds / rooms / units / pods are **not**
interchangeable — the package's own totals mix them).

---

## 5. Not adopted, with reasons

| Item | Reason |
|---|---|
| `03-BUILD-INPUTS/make_all_inputs.py` 60×60 fallback grid | The repo has the real validated RLIS street graph — 88,100 nodes, topology repaired. The package's own START_HERE says "yours is better once unzipped." It is unzipped |
| Reconstructed DEQ PM2.5 series | The repo uses real EPA AQS hourly data, externally validated to a ratio of 1.0000, with EPA's own wildfire qualifier confirming the event window. The package notes its series "is not AirNow" |
| `05-REPAST-JAVA/src/wildfire/*.java` | Written against an earlier repo state ("GisAgent deletes agents on arrival"). No agent has been removable for many commits; capacity, persistence, exposure accumulation and file output all exist and are verified |
| Haversine × 1.4 travel approximation | The repo does true Dijkstra shortest paths over the real network with geodesic edge weights |
| `04-RUN-ANALYSIS/run_results.py` five strategies | The repo's study is a two-arm placement experiment by design. Retained for reference |

Most of the package's comparison table describes a version of this repo from
before the street network, the real PM2.5 data, agent persistence, the output
pipeline, and version control existed. Those rows are obsolete — not wrong when
written.

---

## 6. Honest summary

The package is right about the science and right about the weights, and it
supplies primary sources this repo was missing. Its data is **newer**, not
**interchangeable** — and the correct response to newer data describing a
different year is to open a second study, not to backdate it into the first.

Everything is preserved in this directory. Nothing was overwritten.
