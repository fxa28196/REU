# Current Model — Run Guide & State

How to run the wildfire-smoke shelter model as it stands, what it does and does
not implement, and the exact meaning of every output. This is the runnable
research-prototype reference; the scientific rationale lives in
`docs/science/` (AUDIT.md, DESIGN_SPEC.md, METRICS.md, DATA_SOURCES.md).

**Research question:** *How does shelter placement affect wildfire-smoke
exposure experienced by unhoused residents while traveling from encampments to
cleaner-air shelters?* Exposure is measured from encampment → walking route →
time outdoors → arrival at shelter. **The shelter is the destination / end
condition, not a smoke-reduction mechanism** (no indoor filtration is modelled).

---

## 1. Run procedure (VS Code + Claude Code, no Eclipse)

Prerequisites (one-time; see `ENVIRONMENT_SETUP.md`): Temurin JDK 17 at
`%JAVA_HOME%`, Repast Simphony 2.11.0 at `%REPAST_HOME%`
(`%USERPROFILE%\RepastSimphony-2.11.0`). All commands run from the repo root.

### Compile
```powershell
cd Geography
$env:JAVA_HOME = "C:\Users\Chick\tools\jdk-17.0.19+10"
.\gradlew.bat compileJava
```
In VS Code: **Terminal → Run Task → "Repast: Compile"** (or `Ctrl+Shift+B`).
Classes compile to `Geography\bin\`.

### Launch the interactive GUI
```powershell
cd Geography
.\gradlew.bat runModel
```
In VS Code: **Run Task → "Repast: Run GUI"**. The Repast window opens with the
scenario loaded; click **Initialize (⏻)** then **Run (▶)**. (Fallback without
Gradle: `powershell -File scripts\run-model.ps1`.)

### Run headless (no GUI) — this is what produces result files
```powershell
powershell -File scripts\run-headless.ps1
# or with a longer cap:  powershell -File scripts\run-headless.ps1 -TimeoutSec 600
```
This runs `repast.simphony.runtime.RepastBatchMain -params batch\batch_params.xml Geography.rs`
with the required JVM flags and `-Xmx4g`. The model ends itself at the event
horizon (`simulationHours`) and writes results; the `-TimeoutSec` cap is only a
safety net.

### Where outputs appear
`Geography\output\run_seed<seed>\` — three files:
`agents.csv`, `shelters.csv`, `simulation.json`. The `output\` tree is gitignored
(results are regenerated from the manifest, not versioned).

### How to change parameters
Edit `Geography\batch\batch_params.xml` (headless) or set them in the GUI
Parameters panel. Current parameters:

| Parameter | Meaning | Default |
|---|---|---|
| `numAgents` | number of resident agents | 50 (demo) |
| `randomSeed` | RNG seed (fixed = reproducible) | 42 (demo) |
| `minutesPerTick` | simulated minutes per tick | 1.0 |
| `walkingSpeedMps` | comfortable gait speed (Bohannon 1997) | 1.30 |
| `shelterArrivalDistanceM` | arrival radius (currently informational) | 200 |
| `evacuationThresholdUgM3` | PM2.5 that triggers evacuation (EPA "Unhealthy") | 55.5 |
| `simulationHours` | event window length (Sept 7–19 ≈ 312 h) | 312 |

### How to select the random seed
Set `randomSeed` in `batch_params.xml` to any integer for a reproducible run
(the same seed reproduces the run exactly). Leave it `__NULL__` in
`parameters.xml` (GUI) for a fresh random seed. The seed actually used is
recorded in `simulation.json` and on every row of `agents.csv`.

---

## 2. What is implemented

- **Real geography:** City-of-Portland RLIS street centerlines (112,070
  segments) → an undirected pedestrian graph (89,345 nodes) with geodesic edge
  lengths; Dijkstra shortest paths. A **street-network validation layer**
  corrects 27 corrupt `PDX_F_NODE`/`PDX_T_NODE` attribute IDs at load time
  (provenance in every `simulation.json` under `street_network_validation`;
  method and proof in `docs/validation/STREET_NETWORK_VALIDATION.md`).
- **Real inputs:** EPA AQS hourly PM2.5 (Sept 2020); real Sept-2020 shelters
  (Oregon Convention Center + Charles Jordan operating, Mount Scott standby);
  resident start points sampled from real City of Portland IRP campsite reports.
- **Evacuation:** residents shelter in place at their encampment, accruing
  outdoor exposure, until local PM2.5 reaches `evacuationThresholdUgM3`, then
  walk the shortest street path to the network-nearest operating shelter that
  has capacity.
- **Exposure:** cumulative PM2.5 dose, average and peak concentration, hours
  above the "Unhealthy" breakpoint — accrued **only while outdoors**;
  accumulation **stops at shelter arrival** (the study endpoint).
- **Capacity:** shelters admit up to capacity; refused residents re-route
  (`REFUSED_ALL_FULL` if none reachable has room).
- **Outputs:** complete per-agent journey record, per-shelter summary, and a
  run-level summary + reproducibility manifest (seed, git commit, dataset
  SHA-256s, all parameters).

## 3. What is NOT implemented (and therefore not to be concluded from)

- **Vulnerability attributes:** `age`, `asthma`, `copd` are **not implemented** —
  they appear as **empty columns** in `agents.csv` (no values are invented).
  `age_rr` and `comorbidity_rr` are **placeholders = 1.0**, so
  **VWE is currently identical to raw exposure** and carries no vulnerability
  signal (the slide-cited RR values are unverified — DATA_SOURCES D5/D6).
- **Placement strategies / sensitivity sweeps / BenMAP** — not started.
- **Spatial smoke gradient:** the PM2.5 field is county-uniform (only 2 in-county
  monitors); no wind/transport model.
- **Indoor protection (γ):** deliberately out of scope — shelters end exposure
  by being reached, not by filtering air.

## 4. Current limitations (affecting interpretation)

1. **Evacuation timing:** all residents currently evacuate when PM2.5 first
   crosses 55.5 µg/m³, which happens on a brief **Sept-7 spike — before the real
   shelters opened (Sept 10–11)**. Absolute exposure is therefore an
   underestimate of the sustained Sept 10–18 episode for those who shelter
   quickly. Tracked refinement (AUDIT.md #1): also gate evacuation on shelter
   operating dates.
2. **Population scale:** at `numAgents` ≤ 198 the two shelters' combined capacity
   (2×99) never binds, so nobody is refused; the real event had ~2,000
   unsheltered people for ~198 beds. Raise `numAgents` to exercise refusals.
3. **Encampment locations** are real but from **2025–26** (no 2020 data exists
   in the open feed) — a spatial proxy (DATA_SOURCES D2b).
4. **Shelter capacity (99)** is newsroom-sourced, unconfirmed.
5. **Uniform smoke field** — no intra-city gradient.

Metric-by-metric validity verdicts are in `docs/science/AUDIT.md` §4.

---

## 5. Exact meaning of every output metric

### `agents.csv` — one row per resident (the complete journey record)

| Column | Units | Meaning |
|---|---|---|
| `agent_id` | — | resident identifier (`Site N`) |
| `sim_id` | — | unique run instance id (`sim-<timestamp>-seed<seed>`) |
| `commit` | — | git commit the run executed at |
| `random_seed` | — | RNG seed used |
| `data_version` | — | 12-hex tag = hash of all input-dataset SHA-256s (full list in `simulation.json`) |
| `starting_encampment` | — | `inc_id` of the real IRP campsite report the resident started at |
| `shelter_reached` | — | shelter id admitted to (blank if none) |
| `reached_shelter` | yes/no | success flag (yes ⇔ `final_state`=SHELTERED) |
| `time_started_tick` / `_local` | tick / local time | when the resident began evacuating (smoke trigger fired) |
| `time_arrived_tick` / `_local` | tick / local time | when admitted to shelter (blank if never) |
| `travel_time_min` | minutes | arrival − start (walking duration) |
| `total_travel_distance_m` | metres | cumulative geodesic distance walked |
| `network_dist_to_shelter_m` | metres | shortest-path street distance to the chosen shelter at selection |
| `avg_pm25_ugm3` | µg/m³ | cumulative dose ÷ hours outdoors (mean concentration breathed) |
| `peak_pm25_ugm3` | µg/m³ | highest concentration breathed |
| `cumulative_dose_ugm3h` | µg·m⁻³·h | Σ concentration × time outdoors (the exposure index) |
| `exposure_while_traveling_ugm3h` | µg·m⁻³·h | portion accrued while walking (vs waiting at the encampment) |
| `vwe_ugm3h` | µg·m⁻³·h | vulnerability-weighted exposure = dose × age_rr × comorbidity_rr (**= dose now**, RRs=1) |
| `hours_above_unhealthy` | hours | time breathing > 55.5 µg/m³ |
| `age`, `asthma`, `copd` | — | **empty — not implemented** |
| `age_rr`, `comorbidity_rr` | — | vulnerability multipliers (**placeholder 1.0**) |
| `final_state` | enum | `PRE_EVAC` / `EN_ROUTE` / `SHELTERED` / `UNREACHABLE` / `REFUSED_ALL_FULL` |

### `shelters.csv` — one row per shelter
`shelter_id, name, lon, lat, capacity, operating, peak_occupancy,
final_occupancy, refused_count, utilization (occupancy/capacity),
mean_travel_dist_m_admitted (mean walk of its admitted residents)`.

### `simulation.json` — run summary + reproducibility manifest
`reproducibility` (seed, sim_id, data_version_tag, git_commit, java/repast
versions, all parameters, per-dataset SHA-256); `smoke_field` (hours, peak,
out-of-range lookups); `population` (state census; exposure and VWE
distributions with mean/median/percentiles/total/**Gini**; total person-hours
above unhealthy; travel-distance stats); `shelters[]`.

Full data dictionary with literature and caveats: `docs/science/METRICS.md`.

---

## 6. How to analyze the outputs

**Canonical workflow** (verification + statistics + figures, all outputs stamped
with sim id / seed / commit / data version / timestamp):

```powershell
python scripts\analyze_run.py                       # every run under Geography\output
python scripts\analyze_run.py Geography\output\run_seed42   # one run
```

Writes `analysis\summary.json`, `analysis\analysis-report.md` and
`analysis\figures\*.png` inside each run directory, and runs 37 cross-checks
between agents.csv, shelters.csv and simulation.json (non-zero exit code if any
fail). Requires `pip install pandas matplotlib`. Current cross-run findings:
`docs/runs/current-results-report.md`.

**Routing validation tests** (independent shortest-path recomputation from
Streets.shp, walking-speed bounds per Bohannon 1997, impossible-jump audit;
exit code gates):

```powershell
python scripts\test_routing.py        # requires pip install pyshp
```

The files are also plain CSV/JSON for ad-hoc analysis:

```python
import pandas as pd, json
a = pd.read_csv("Geography/output/run_seed42/agents.csv")
a["reached_shelter"].value_counts()                       # success/failure
a["cumulative_dose_ugm3h"].describe()                     # exposure distribution
a.groupby("shelter_reached")["total_travel_distance_m"].mean()
manifest = json.load(open("Geography/output/run_seed42/simulation.json"))
manifest["population"]["exposure_ugm3h"]["gini"]          # equity
```
```powershell
Import-Csv Geography\output\run_seed42\agents.csv |
  Group-Object final_state | Select-Object Name, Count
```

To reproduce a run exactly: set `randomSeed` in `batch_params.xml` to the
`random_seed` in the target `simulation.json`, check out its `git_commit`, and
confirm the input `data_version`/dataset SHA-256s match, then run headless.
