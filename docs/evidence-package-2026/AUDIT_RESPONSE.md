# RESPONSE TO THE CODE AUDIT — what actually got built

Plain English. Written against your auditor's own numbering so you can read them
side by side.

---

## READ THIS FIRST — the one thing that will confuse you otherwise

Your auditor looked at **your Repast repo**. I built things in **a separate
folder**. Almost nothing I made is inside your repo yet.

So when the audit says "❌ Absent" and I say "built" — both are true. It means
*I wrote it, it works, and you still have to copy it in.* Nothing I did makes a
requirement go green in your repo until you move the file.

Think of it as: the audit inspected your kitchen. I've been cooking in a
different kitchen. The food is real. It is not on your table.

There is a second, bigger split:

- **Science and data work** — I did a lot of this. It is the harder half and it
  is now largely done.
- **Software engineering work** — I did almost none of this. No git, no
  shapefile unpacking, no street graph, no batch config.

---

## PART 1 — THE TWELVE REQUIREMENTS (R1–R12)

### R1 — Real Portland street network
**Audit:** ⚠️ Partial. Streets.shp sits inside a zip; a fresh checkout can't run.
**Me:** ❌ **Did not solve.** My input builder makes a 60×60 grid of fake points
across Multnomah County as a fallback, and prints a warning telling you to
replace it. I never unzipped your shapefile and never built a routable graph.
**Plain English:** your agents would still be walking on a chessboard, not on
Portland. This is one of the two biggest holes left.

### R2 — Real unsheltered population
**Audit:** ❌ Synthetic count only. Needs real demographics and encampment locations.
**Me:** ⚠️ **Half solved.**
- ✅ Real demographics, from the Pathways Study (N=541, Multnomah County, April 2026):
  ages 18–44 = 52.7%, 45–64 = 42.3%, 65+ = 5.0%; chronic physical condition = 39.1%;
  44% sleep outdoors most often and 17% with no cover at all.
- ❌ Real *locations*. Agents are still scattered randomly.
**Plain English:** I know who they are now. I still don't know where they are.

### R3 — Real shelters with real capacities
**Audit:** ❌ Placeholder. Capacity 100, never enforced.
**Me:** ✅ **Solved, minus one step.** I transcribed **48 real facilities** —
30 from the county's shelter list, 10 day centers, 8 City of Portland Safe Rest
Villages — with real names, addresses, capacities, providers, and closure dates.
Total 2,197 beds/units.
**Still needed:** coordinates. Run `data/geocode_shelters.py` (~15 min, needs
internet). I deliberately did not invent lat/lons.
**Bonus the audit didn't ask for:** the county publishes an **88% average nightly
occupancy rate**, so real free capacity is about **264 beds**, not 2,197.

### R4 — Hourly PM2.5 from EPA AirNow, Sept 7–19 2020
**Audit:** ❌ Absent. Entire smoke layer missing.
**Me:** ⚠️ **Substitute built, not the real thing.** I did **not** get AirNow
monitor data. I built a daily series constrained to reproduce Oregon DEQ's
*published* Portland 2020 category counts — three "very unhealthy" days and five
"hazardous" days — then spread it to hours with an assumed daily shape.
**Two honest weaknesses:**
1. It's a reconstruction from a published index, not measurements.
2. It's **spatially uniform** — every point in the county gets the same number.
**Plain English:** you have believable smoke. You do not have measured smoke, and
your smoke has no map. The second one quietly changes your research question.

### R5 — VWE metric per person-hour
**Audit:** ❌ Absent.
**Me:** ✅ **Built — and found the equation was broken.**
The accumulation code exists in both my Java agent and my Python analysis.
But more important: **`VWE = PM2.5 × RR_age × RR_comorbidity` is dimensionally
invalid.** A relative risk means "the rate of an outcome rises by this factor per
10 µg/m³." It is not "this person is harmed this many times more." Multiplying a
concentration by it mixes a dose with a rate ratio.
**And the numbers were wrong too.** Your slides use ×1.45 for 65+ and ×1.80 for
COPD. The pooled wildfire-smoke literature (Kondo et al. 2019, meta-analysis of
8 North American studies) puts the elderly-to-adult ratio at **1.008, 95% CI
(0.996, 1.020)** — statistically indistinguishable from 1.0.
**Plain English:** the centrepiece of your project was built on a multiplication
that doesn't work, using numbers roughly 60× too large. That is now documented
with sources.

### R6 — Agents walk to the nearest *reachable* shelter
**Audit:** ⚠️ Approximation. No shortest path, no capacity, agents vanish.
**Me:** ⚠️ **Two of three fixed.**
- ✅ Capacity enforced — full shelters are skipped.
- ✅ Agents no longer vanish. They persist, shelter, and return home when air clears.
- ❌ Still no shortest-path routing. I use straight-line distance × 1.4.
**Plain English:** I fixed the thing that was silently deleting your data. I did
not build real street routing.

### R7 — Five placement strategies
**Audit:** ❌ Absent.
**Me:** ✅ **All five built — in Python, not Repast.** Status quo, density,
gap-index, PM2.5 oracle, VWE oracle. Both oracles are greedy approximations, not
true optimisation, and that's stated.

### R8 — Scoring: exposure-hours + Gini
**Audit:** ❌ Absent.
**Me:** ✅ **Built — in Python, not Repast.** Gini on raw exposure and on VWE,
exposure-hours above threshold, mean cumulative exposure, plus the spatial
divergence index.

### R9 — Sensitivity sweeps
**Audit:** ❌ Absent. `batch_params.xml` is empty.
**Me:** ⚠️ **Parameters defined, Repast batch file untouched.** I set up three
mobility levels, four weight schemes, and four comorbidity-prevalence levels, and
my Python runs all combinations. Your `batch_params.xml` is still empty.

### R10 — Git, MIT licence, Zenodo, reproducibility
**Audit:** ❌ Not started. **The repo is not a git repository.**
**Me:** ❌ **Did nothing here.** No `git init`, no LICENCE file, no README in your
repo. My Python fixes and records a random seed; your Java does not.
**Plain English:** this is untouched and it's a stated deliverable.

### R11 — Pre-registration
**Audit:** ❓ Unverifiable.
**Me:** ❌ Not addressed.

### R12 — BenMAP
**Audit:** ❌ Absent, defer.
**Me:** ❌ Not built, deliberately — I recommended cutting it in July.

---

## PART 2 — THE SIXTEEN VARIABLES (V1–V16)

Your auditor's rule was "no invented values — flag what's missing." This is
where most of my work went. **I closed 9 of the 16 gaps with real sources.**

| # | Variable | Audit said | What I did |
|---|---|---|---|
| **V1** | age | distribution **VALUE MISSING** | ✅ **FOUND** — Pathways Study Table 2.1, N=541 Multnomah County |
| **V2** | RR_age | ×1.45 from slides, CI missing | ✅ **FOUND — and it contradicts the slide.** Kondo 2019 meta-RRR **1.008 (0.996, 1.020)** |
| **V3** | copdStatus | prevalence **MISSING**; Anderson 2013 unresolvable | ✅ **BOTH RESOLVED.** Prevalence 39.1% (Pathways). And "Anderson et al. 2013" is actually **Atkinson** et al., in *Epidemiology*, and it is a **cardiovascular** paper — it contains no COPD estimate |
| **V4** | asthmaStatus | **MISSING** — don't guess | ✅ Found Heaney 2022 age-stratified asthma effects. **Recommend dropping the asthma/COPD split** for a binary chronic-condition flag, because that's what your local data actually measures |
| **V5** | PM2.5 field | **DATA MISSING** | ⚠️ Reconstruction built from DEQ published categories. Not AirNow. Not spatial |
| **V6** | smokeExposure | needs implementing | ✅ Built, Java + Python |
| **V7** | vwe | needs implementing | ✅ Built — with the dimensional problem documented |
| **V8** | threshold | **VALUE MISSING (confirm)** | ✅ **CONFIRMED — 35.4 µg/m³**, verified against DEQ's own AQI table and EPA breakpoints |
| **V9** | distanceTraveled | must be geodesic | ✅ Haversine in metres, ×1.4 street factor. No longer degree math |
| **V10** | walkingSpeed | **MISSING** — needs gait literature | ⚠️ **Partial.** I found Murphy 2019 (unhoused people travel 9–14 miles/day, primary mode **public transit**) and set travel *distance* thresholds of 400/800/2000 m. I did **not** find a walking *speed* source |
| **V11** | shelterAccessibility | needs network distance | ❌ **Not built.** Straight-line only |
| **V12** | shelterCapacity | **VALUE MISSING** | ✅ **FOUND** — real capacities for 48 facilities, plus the county's 88% occupancy rate |
| **V13** | tick ↔ time | undefined | ✅ Set: 1 tick = 1 hour, 312 hours = Sept 7–19 |
| **V14** | gini | needs implementing | ✅ Built |
| **V15** | startingLocation | **DATA MISSING** — encampments | ❌ **Not solved.** Agents still placed randomly |
| **V16** | randomSeed | never recorded | ⚠️ Python records it. Java doesn't |

**Score: 9 solved, 4 partial, 3 not solved.**

---

## PART 3 — PHASES 4 TO 7

### Phase 4 — Git and staged commits (17 commits)
❌ **Zero done.** Your repo is still not under version control. This is the
single most mechanical gap and nobody can do it but you: `git init`.

### Phase 5 — Agent outcome logging
⚠️ **Partly.** I wrote you the missing mechanism — Repast writes **no output at
all** unless you declare a Data Set and attach a File Sink, which is why your
model runs and produces nothing. That's in `HOWTO_MAKE_REPAST_COMPUTE.md`,
Steps 4 and 5. I did **not** build the auditor's full column schema or the
`run_manifest.json`.

### Phase 6 — Decision logging
❌ **Not built.** No `decisions.jsonl`, no `SHELTER_REJECTED_FULL` events. Though
I did fix the underlying cause — my agent doesn't silently delete anyone.

### Phase 7 — Risk register
| Risk | Status |
|---|---|
| OOM / performance | ✅ Addressed — distances precomputed once, O(1) lookup instead of per-tick scans |
| Reachability bias (silent deletion) | ✅ **Fixed** — agents persist, shelter, return home |
| Units (degree math) | ✅ Fixed — metres throughout |
| Data provenance | ✅ **Largely closed** — this was most of my work |
| OneDrive corruption | ❌ Not addressed — move your repo off OneDrive |
| Repo hygiene / 52 MB zip | ❌ Not addressed |

---

## PART 4 — THE HONEST SUMMARY

**What I actually contributed:** the *scientific* half. Real demographics, real
shelter data, a defensible smoke series, a confirmed threshold, and — most
importantly — I found that your central equation is mathematically invalid and
that its two key numbers are unsupported by the literature. Your auditor flagged
"Anderson et al. 2013 is not resolvable"; I found out why. It's the wrong author,
the wrong journal, and the wrong disease.

**What I did not contribute:** the *engineering* half. No git. No shapefile
unpacked. No street graph. No routing. No batch config. No encampment locations.

**Three things stand between you and a running scientific model:**

1. **Coordinates** — run the geocoder. 15 minutes.
2. **The street network** — unzip Streets.shp, export its vertices, replace my
   fallback grid. This is the difference between "a model of Portland" and "a
   model of a chessboard."
3. **Output plumbing** — Data Set + File Sink, or just run my Python.

**And one thing that changed the project:** the weights you were going to use
aren't supported. Running the literature-based values will probably give you a
near-zero divergence index. Your hypothesis was pre-registered two-tailed and you
wrote that a null result would be informative — so that is a finding, not a
failure, and it now arrives with a meta-analysis behind it.

Separately, the **shelter-closure result needs no weights, no simulation, and no
street network**: 61.3% of the county's vulnerability-prioritised capacity closes
by August 31, against 7.6% of general capacity. That's arithmetic on published
numbers and it's defensible today.

---

*Prepared with assistance from Claude (Anthropic). Every "✅ FOUND" above traces
to a named document in DATA_PROVENANCE.md or WEIGHTS_EVIDENCE.md. Verify them
before publication — especially Kondo et al. 2019 Table 4, which is now
load-bearing for your entire weighting scheme.*
