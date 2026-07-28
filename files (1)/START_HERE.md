# START HERE

Everything built for the wildfire shelter-siting project, organised so you can
compare it against what you already have.

**Nothing in this folder is inside your Repast repo.** It is a parallel set of
files. Where something replaces or fills a gap in your repo, the table says so.

---

## THE COMPARISON TABLE

Read this against your auditor's report. Left column = your repo. Right column =
what's here.

| Your repo has | This package has | Verdict |
|---|---|---|
| `Streets.zip` (unopened), no street graph | A **fallback 60×60 grid** in `03-BUILD-INPUTS/make_all_inputs.py` | ⚠️ **Yours is better once unzipped.** Use your real shapefile |
| Placeholder shelters, capacity 100, unenforced | **48 real facilities**, real capacities, closure dates (`01-DATA/`) | ✅ **Use mine** |
| Synthetic agents, no demographics | Real age/condition/cover distributions (`02-PARAMETERS/`) | ✅ **Use mine** |
| No PM2.5 at all | Reconstructed hourly series from DEQ (`03-BUILD-INPUTS/`) | ✅ **Use mine** — but it's not AirNow, and it's spatially flat |
| `GisAgent` — deletes agents on arrival | `UnshelteredAgent.java` — agents persist, capacity enforced, return home | ✅ **Use mine** |
| No exposure accumulation | `cumulativePm25` / `cumulativeVwe` in the Java agent | ✅ **Use mine** |
| No output files | Data Set + File Sink guide (`05-REPAST-JAVA/HOWTO...`) | ✅ **Use mine** — this is why your model produces nothing |
| No strategies, no Gini | All five strategies + Gini + divergence (`04-RUN-ANALYSIS/`) | ✅ **Use mine** (Python) |
| RR_age = 1.45, RR_COPD = 1.80 | **Literature says 1.008 (0.996, 1.020)** (`07-EVIDENCE/`) | 🔴 **Your numbers are wrong** |
| Not a git repository | Nothing — I did no git work | 🔴 **Neither of us did this** |
| No encampment locations | Nothing — agents still random | 🔴 **Still missing** |
| No shortest-path routing | Haversine × 1.4 | ⚠️ Both are approximations |

---

## THE FOLDERS, IN THE ORDER YOU'D USE THEM

### `01-DATA/` — the real data
- **`shelters_multnomah_2026.csv`** — the single most valuable file here.
  48 facilities transcribed by hand from the county's shelter list, the day
  centre list, and the City of Portland annual report. Real names, addresses,
  capacities, providers, closure dates, and a flag for which ones give priority
  to veterans / 55+ / people with disabilities.
- **`geocode_shelters.py`** — turns those addresses into lat/lon via
  OpenStreetMap. **Run this first.** Needs internet, takes about a minute.
  I deliberately left coordinates blank rather than inventing them.
- **`source-pdfs/`** — the three government documents everything traces back to,
  so a reviewer can check without hunting.

### `02-PARAMETERS/` — every number, with its source
- **`grounded_parameters.py`** — **run this.** It prints every parameter, its
  source, and re-derives every computation with PASS/FAIL checks.
- **`pm25_and_travel_sourced.py`** — the corrected PM2.5 series (verified against
  Oregon DEQ's published day counts) and travel distances sourced to Murphy 2019.
- **`parameters_sourced.py`** — earlier version; weight-scheme options.

### `03-BUILD-INPUTS/` — generate the simulation inputs
- **`make_all_inputs.py`** — one script, produces every input file:
  `nodes.csv`, `shelters.csv`, `shelters_postclosure.csv`, `agents_initial.csv`,
  `pm25_by_node_hour.csv`, `model_settings.json`.
- **`bootstrap_data.py`** — only if you have no `repast_data/` at all.
- **`build_pm25.py`** — earlier standalone PM2.5 builder. Superseded.

### `04-RUN-ANALYSIS/` — get results without touching Repast
- **`run_results.py`** — verification tests, all five strategies × three mobility
  levels, Gini on exposure and VWE, the spatial divergence index, three EPS
  figures. Runs in seconds.

### `05-REPAST-JAVA/` — what to copy into your repo
- **`HOWTO_MAKE_REPAST_COMPUTE.md`** — **read this.** Step 4 is the answer to
  "why does my model produce no data." Repast writes nothing unless you declare
  a Data Set and attach a File Sink.
- **`src/wildfire/`** — four Java files replacing your demo classes:
  `SimData` (loads CSVs), `Shelter` (capacity), `UnshelteredAgent` (the step that
  accumulates — this is where computing actually happens), `WildfireBuilder`.

### `06-CHAPTER/` — the proceedings chapter
Built on the official `svmult` template. Compiles clean. Every `\NEEDS{}` marks
something requiring a number you don't have yet — `grep -c 'NEEDS{' chapter.tex`
should reach 0 before camera-ready.

### `07-EVIDENCE/` — the audit trail
- **`AUDIT_RESPONSE.md`** — read this first. Maps your auditor's R1–R12 and
  V1–V16 to what actually got built.
- **`WEIGHTS_EVIDENCE.md`** — the literature review on susceptibility weights.
  **This is the one to give your mentor.**
- **`DATA_PROVENANCE.md`** — every number, its source, and the grep command to
  verify it yourself.
- **`CITATION_AUDIT.md`** — the six citation errors in the original design.

---

## RUN IT IN THIS ORDER

```bash
python 01-DATA/geocode_shelters.py     # real coordinates. DO THIS FIRST.
python 02-PARAMETERS/grounded_parameters.py   # verify everything
python 03-BUILD-INPUTS/make_all_inputs.py     # generate inputs
python 04-RUN-ANALYSIS/run_results.py         # results + figures
```

Paths assume you run from this folder. Adjust or move scripts together.

---

## THE FOUR THINGS THAT MATTER MOST

**1. Your relative risks are wrong.**
Kondo et al. 2019, meta-analysis of 8 North American wildfire-smoke studies:
elderly-to-adult ratio of relative risks = **1.008, 95% CI (0.996, 1.020)**.
Your slides use 1.45. And `VWE = PM2.5 × RR × RR` is dimensionally invalid —
a relative risk is a rate ratio, not a harm multiplier.
→ `07-EVIDENCE/WEIGHTS_EVIDENCE.md`

**2. You have a finding that needs no simulation.**
The county is closing five shelters. **61.3% of vulnerability-prioritised
capacity closes by August 31, against 7.6% of general capacity.** That's
arithmetic on published numbers. It doesn't depend on your model, your weights,
or your street network.

**3. Real shelter capacity is 264 beds, not 2,197.**
The county reports 88% average nightly occupancy. Your model starts shelters
empty, which overstates access roughly eight-fold.

**4. Repast produces no output because nothing tells it to.**
Not a bug in your code. You have to declare a Data Set and attach a File Sink in
the scenario tree. Five minutes of GUI work.

---

## WHAT IS STILL MISSING — from both of us

| Gap | Who can fix it |
|---|---|
| `git init` — your repo has no version control | **Only you** |
| Real street network — unzip Streets.shp, export vertices | **Only you** |
| Encampment locations for agent placement | Needs City campsite-report data |
| Shortest-path routing | Neither of us built it |
| Real AirNow monitor data | Would replace my reconstruction |
| Susceptibility weights | **Your mentor's decision** |
| Shelter filtration factor (0.35) | Unsourced. Sweep 0.20–0.60 |

---

## HOW TO CHECK MY WORK

Don't trust it. Verify:

```bash
python 02-PARAMETERS/grounded_parameters.py    # all checks should PASS

pdftotext -layout 01-DATA/source-pdfs/Pathways-Survey-Findings-Published-4_9_2026.pdf p.txt
grep -n "194 (39.1%)" p.txt                    # chronic condition prevalence
grep -n "having a disability (73%)" p.txt

pdftotext -layout 01-DATA/source-pdfs/Adult-Shelter-Review-FY25.pdf a.txt
grep -n "88% average nightly occupancy rate" a.txt
grep -n "6,731 unique individuals served" a.txt
```

If any of those returns nothing, the number is wrong and I want to know.

For the weights, verify **Kondo et al. 2019 (IJERPH 16(6):960) Table 4**
directly. It is now load-bearing for your entire weighting scheme.

---

*Built with assistance from Claude (Anthropic), July 2026. Every sourced claim
traces to a document in `01-DATA/source-pdfs/` or a DOI in `07-EVIDENCE/`.
Two errors of mine were caught and corrected during this work and are documented
in `07-EVIDENCE/` — check the rest too.*
