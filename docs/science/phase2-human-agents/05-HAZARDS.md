# Phase 2 Â· Spec 5 â€” Dynamic Hazard System

**Status: IMPLEMENTED.**

**Headline recommendation: do NOT implement stochastic road closures.** The
brief requires each disruption to have a probability, a duration distribution,
and a recovery assumption. For the one hazard that would most change results â€”
urban road/path closure â€” **the evidence needed to specify those three things
does not exist for this event, and the event itself is not documented to have
occurred inside the study area.** Implementing it anyway would mean fabricating
a hazard: the exact failure class this project has already been burned by twice.

What follows is what the evidence *does* support, plus a
build-the-mechanism-without-fabricating-the-parameters path if hazards are
wanted later.

---

## 1. Hazard-event table

| Event | Occurrence probability | Duration distribution | Recovery | Evidence status | Verdict |
|---|---|---|---|---|---|
| **Urban road / path closure (smoke-caused)** | **No documented occurrence in Portland, Sept 2020** | â€” (see Â§2) | â€” | ODOT/press closure records for the event show OR-22, US-20 (MP 33â€“72), OR-126 (MP 10â€“55), I-5 near Ashland â€” **all fire-corridor closures far outside the study area** | **OMIT** |
| **Shelter saturation / turn-away** | Emergent from hard capacity (99/site) + arrivals | n/a â€” a state, not an event | Bed frees on departure (no departures modelled in the event window) | **VERIFIED**: county releases (capacity 99 each); Street Roots observed 40 and ~90 occupants; **no documented capacity turn-away** | **KEEP â€” emergent, not exogenous** |
| **Shelter opening / closing schedule** | Deterministic, historical | 9-day operation | n/a | **VERIFIED**: OCC opened Sept 10, Charles Jordan Sept 11, both through Sept 18/19 | **IMPLEMENT â€” real, and currently missing** |
| **Smoke intensity change** | Already measured hourly (EPA AQS) | Empirical series | Empirical | **VERIFIED**: Oregon DEQ 2020 Wildfire Smoke Trends â€” worst air quality since monitoring began in 1985; Portland metro **8 days Very Unhealthy/Hazardous Sept 10â€“17, 5 consecutive days â‰¥ 250.5 Âµg/mÂ³** | **KEEP measured; scenarios use real alternative episodes (Â§3)** |
| **Information failure (agent unaware)** | **p â‰ˆ 0.65 unaware** | Persistent unless word-of-mouth enabled | n/a | **VERIFIED**: PSU survey n=73 (`04-DECISION.md` Â§2.1) | **IMPLEMENT â€” the best-evidenced disruption available** |

The most defensible "dynamic hazard" in this model is not a road closure. It is
**not knowing the shelter exists**, and it has a local, event-specific source.

---

## 2. Why road closures are omitted, and what inclusion would require

**Occurrence.** No smoke-caused road or sidewalk closure inside the Portland
study area is documented for September 2020; the closures on record are
fire-corridor closures in other counties. A closure probability would be
invented outright.

**Duration.** The distributional *family* is well established â€” incident-duration
modelling has used lognormal since Golob et al. (1987), and hazard-based
formulations report Weibull response times with log-logistic clearance times
(Nam & Mannering 2000); modern reviews use lognormal / log-logistic / Weibull /
generalised-gamma accelerated-failure-time models. **No study provides
parameters for pedestrian-path closures in a smoke event.** The family
transfers; the numbers do not.

**Recovery.** Unspecifiable without duration parameters.

**If hazards are wanted later**, the defensible route is *deterministic scenario
injection, not stochastic sampling*: author an explicit closure list as a
versioned, checksummed data file (`event_id, feature_index, street_name,
start_tick, end_tick, cause`), label the whole scenario **SYNTHETIC â€” class A**,
and use it to answer a *conditional* question ("if these N streets closed for H
hours, how much would exposure rise?") rather than a probabilistic one. That is
an honest sensitivity experiment; a sampled hazard rate would be a fabricated
empirical claim.

---

## 3. Smoke scenarios â€” real episodes, not multipliers

A scalar "Ã—1.5 smoke" multiplier has **no basis in the literature**, and it is
wrong in a specific physical way: smoke episodes differ in **duration, diel
structure, and onset ramp**, not merely amplitude. Multiplying a series inflates
peaks while preserving a timing structure that would not co-occur with them.

**Preference order:**

1. **Real alternative episodes from EPA AQS** â€” e.g. Portland's shorter/lower
   2017 Eagle Creek episode, or other 2020 West Coast monitors re-indexed onto
   Portland's timeline. Preserves realistic autocorrelation and diel structure;
   every value stays class **M**.
2. **If a synthetic stress test is required:** perturb **duration** (extend the
   â‰¥ 250.5 Âµg/mÂ³ plateau), not amplitude â€” duration is the empirically varying
   dimension across episodes. Label **SYNTHETIC**.
3. **Amplitude multiplier â€” not recommended.** If used at all, label it
   SYNTHETIC/class A in the scenario name, the manifest, and every figure
   caption.

---

## 4. Should stochastic hazards exist at all in a placement study?

The research question is **shelter placement**. Stochastic hazards inflate
outcome variance and confound attribution: a difference between two placement
strategies becomes partly a difference between two hazard realisations.

**Standard methodological answer: paired scenarios with common random numbers.**
Hold fixed the agent population, attributes, awareness draws, decision draws and
smoke series across placements, so differences are attributable to placement
rather than noise â€” Glasserman & Yao 1992, *Management Science* 38(6):884â€“908,
DOI [10.1287/mnsc.38.6.884](https://doi.org/10.1287/mnsc.38.6.884); textbook
treatment in Law, *Simulation Modeling and Analysis*.

Concretely: same seed across all placement strategies within a replication;
per-concern RNG substreams so adding a hazard model cannot perturb demographic
sampling (`08-ENGINEERING.md` Â§3); paired differences across â‰¥ 30 replications.
**This is a prerequisite for hazard work, not a follow-up.**

---

## 5. What to build now

1. **Shelter opening/closing schedule** (deterministic, verified) â€” alone this
   fixes the standing AUDIT #1 artefact, and it is pure evidence.
2. **Capacity saturation as an emergent state** â€” partly present; needs
   population scaled above 198 to bind, plus order-independent admission so the
   last bed is not awarded by RNG shuffle order (`08-ENGINEERING.md` Â§3.5).
3. **Information failure** â€” the awareness stage in `04-DECISION.md`.
4. **The hazard *mechanism*** (edge mask, masked Dijkstra, reroute-on-encounter)
   may be built and unit-tested with an **empty hazard set by default**, so the
   capability exists without any fabricated event entering results.
   Architecture: `08-ENGINEERING.md` Â§4.

**Reporting requirement:** any hazard-enabled run must export the realised
hazard timeline (`hazards.csv`) plus a manifest hazard summary. A hazard result
without its realisation is not reproducible and must not be quoted.

