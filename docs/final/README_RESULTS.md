# How to read these results

*Plain-English guide to the wildfire-smoke shelter simulation. No modelling background assumed.*

---

## 1. What this simulation is doing

In September 2020, wildfire smoke covered Portland for about two weeks. Air quality
reached some of the worst levels ever recorded in the United States. Multnomah County
opened a small number of "clean-air shelters" — indoor spaces where people could escape
the smoke.

Most people could go indoors at home. **People living unsheltered could not.**

This simulation asks a simple question:

> If you were living outside in Portland during that smoke event, could you actually
> *get* to a clean-air shelter — and how much smoke did you breathe before you did?

To answer it, the model creates **2,037 simulated residents** — one for each person
counted as unsheltered in Multnomah County's official January 2019 count. It places each
of them at a **real encampment location** from City of Portland records. Then, when the
smoke gets bad enough and a shelter has actually opened, each resident **walks the real
Portland street network** toward the nearest shelter that still has an open bed.

While they are outside, they breathe **real measured air**: hourly PM2.5 readings from
the EPA's monitoring station in Multnomah County for September 2020. The moment someone
gets indoors, their smoke exposure stops accumulating. If they never get indoors — because
every shelter filled up — it keeps accumulating for the entire two weeks.

**Nothing about the geography, the air, the shelter locations, or the population size is
invented.** Those all come from real data sources, listed in
[`FINAL_RESULTS_REPORT.md`](FINAL_RESULTS_REPORT.md) §4.

### The three scenarios

| Scenario | What it tests | Is it real? |
|---|---|---|
| **A — Current placement** | The two shelters that actually operated, at their real locations, with their real opening dates | **Yes** — this is the historical situation |
| **B — Optimized placement** | The *same number of beds*, moved to the mathematically best locations | Hypothetical but constrained: same capacity, same dates, only location changes |
| **C — Capacity-neutral demonstration** | Real locations, but enough beds for everyone | **NO — demonstration only.** See the warning in §5 |

---

## 2. What one row in `agents.csv` represents

**One row = one person's entire experience of the smoke event.**

Reading across a single row tells you that person's whole story: where they started, when
they left, how fast they walk, how far they walked, which shelter they tried, whether they
got in, and how much smoke they breathed along the way.

Here is a real row from Scenario A, translated:

> *Site 1963 started at encampment `25-156603`. They walk at 1.30 m/s. When the smoke
> crossed the danger threshold on 10 September at 07:00, they set out, walked 292 metres
> in 3 minutes to the Oregon Convention Center, and were admitted. Their total smoke
> exposure was 1,357 µg/m³·h.*

And a less fortunate one:

> *Site 2036 started at encampment `25-134545`. They have asthma and COPD. They walked
> 21.4 km — every shelter they reached was full. They never got indoors, and finished the
> event with an exposure of 54,003 µg/m³·h, having spent 194 hours in air the EPA calls
> "Unhealthy".*

The file has 2,037 rows because there are 2,037 residents. Every one of them is accounted
for — nobody is deleted from the simulation when they fail, because leaving out the people
who failed would make the results look far better than reality.

**Related files:**
- `shelters.csv` — one row per shelter: how many beds, how many people got in, how many
  were turned away.
- `simulation.json` — the run's "receipt": the random seed, every parameter, a checksum of
  every input data file, and the exact code version. This is what makes the run
  reproducible by someone else.

---

## 3. What the important numbers mean

### Travel time (`travel_time_min`)
Minutes from the moment a resident leaves their encampment to the moment they are admitted
to a shelter. Blank if they never got in.

⚠️ **One caveat:** because the two shelters opened on *different days* (10 and 11
September), someone turned away from the first shelter waits and tries the second when it
opens. That waiting time is included here. So this is "how long the whole ordeal took",
not "how many minutes of walking".

### Travel distance (`total_travel_distance_m`)
Metres actually walked, following real streets — not a straight line. This includes any
extra walking caused by being turned away and having to try somewhere else.

A resident who was turned away everywhere still has a large number here. That is the
point: **they did the walking and got nothing for it.**

### Average PM2.5 (`avg_pm25_ugm3`) and Peak PM2.5 (`peak_pm25_ugm3`)
The average and worst air quality that person was exposed to while outside, in
micrograms of fine particles per cubic metre of air.

For scale: the EPA calls **55.5 µg/m³** "Unhealthy" for everyone. The September 2020 peak
in this dataset was **562.7 µg/m³** — about ten times the "Unhealthy" threshold.

### Cumulative PM2.5 dose (`cumulative_dose_ugm3h`)
**The headline number.** It answers: *how much smoke did this person breathe in total?*

It is calculated by adding up the air pollution level for every minute the person spent
outdoors. Units are µg/m³ × hours. Someone who spent 10 hours in air of 100 µg/m³ has
a dose of 1,000.

Two people can have very different doses for only one reason in this model: **how long
they stayed outside.** Getting indoors sooner is the only thing that lowers it.

⚠️ **This is an exposure *index*, not a medical dose.** It does not account for breathing
rate or how particles deposit in the lungs, and it is **not** a prediction of illness. It
tells you who was exposed more, not who got sick. See §4.

### Exposure burden index (`vwe_ugm3h`) — historically called "VWE"
This column exists to hold a *susceptibility-weighted* version of the dose — the idea
being that the same air might matter more for someone with a lung condition.

**In these runs it is identical to the cumulative dose.** The weights are set to 1.0
because no trustworthy, population-specific weighting factor could be found in the
literature. Rather than invent a multiplier, the project left the weights switched off and
says so. See [`VULNERABILITY_MECHANISM_AUDIT.md`](VULNERABILITY_MECHANISM_AUDIT.md).

If someone asks "why are these two columns the same?" — that is the answer, and it is
deliberate.

### Shelter success / failure (`reached_shelter`, `final_state`)
Every resident ends in exactly one of three states:

| State | Plain meaning |
|---|---|
| **Reached shelter** | Got indoors. Exposure stopped at that moment. |
| **Turned away – every shelter full** | Walked to a shelter, was refused for lack of space, tried others, and ran out of options. Stayed outside for the rest of the event. |
| **No shelter reachable on foot** | Their starting point had no walking route to any shelter (12–19 people per run, caused by gaps in the street map). Reported honestly rather than quietly dropped. |

---

## 4. Three honest limitations to state out loud

1. **This measures exposure, not health.** The model never predicts an asthma attack, a
   hospital visit, or a death. Converting smoke exposure into health outcomes needs
   medical dose-response modelling that this project deliberately does not attempt.
2. **Everyone is assumed to know the shelters exist.** In reality, a Portland State survey
   found **65% of unhoused residents had never heard of them.** So the ~10% who reach
   shelter in Scenario A is an **optimistic upper bound** — the real figure was likely
   lower.
3. **The bed counts are not officially confirmed.** The 99-beds-per-shelter figure comes
   from contemporaneous news reporting, not an agency document. See
   [`SHELTER_CAPACITY_AUDIT.md`](SHELTER_CAPACITY_AUDIT.md).

---

## 5. ⚠️ About Scenario C (capacity-neutral demonstration)

Scenario C gives the shelters enough total space for the whole simulated population. **It
is not a claim about what was available in 2020, and must never be presented as one.**

Its purpose is to isolate one question: *if beds were not the bottleneck, would everyone
be equally protected?* The answer turns out to be interesting — see
[`FINAL_PRESENTATION_SUMMARY.md`](FINAL_PRESENTATION_SUMMARY.md).

The shelters keep their real locations, real opening dates, and equal relative sizes, so
they still fill up in sequence and residents still get redirected — the travel and
exposure differences are still real. Only the total is artificial.

---

## 6. How to run the simulation

### 6.1 The visual Repast simulation (with the map GUI)

```powershell
cd C:\Users\Chick\OneDrive\Desktop\reu
powershell -File scripts\run-model.ps1
```

This opens the Repast Simphony GUI. Then, in the window:
1. Press the **▶ (Initialize)** button to build the model.
2. Press **Start** to run it, or **Step** to advance one tick at a time.
3. The map display shows the street network, shelter locations, and residents as points.

This script compiles the model *and* launches the GUI, so no separate compile step is
needed. Loading the 112,070-street network takes roughly 30–60 seconds before the display
appears.

**The GUI defaults are set to the final study configuration**, so what you see is the real
model, not a superseded one:

| Parameter | GUI default | Why |
|---|---|---|
| `numAgents` | **500** | Small enough to render smoothly, large enough that 198 beds run out — so the demo shows the actual finding |
| `enableHeterogeneity` | **1** | Residents carry real age / mobility / asthma / COPD attributes and walk at their own speeds |
| `respectShelterOpeningDates` | **1** | Shelters open on their real dates (10 and 11 September) |
| `scenarioCode` | **0** | Scenario A, the real placement. Set **1** for optimized, **2** for the capacity-neutral demo |

All of these can be changed in the GUI's **Parameters** panel before you press Initialize.

> These defaults affect the GUI only. Headless runs read their own parameter file, so the
> archived baseline is unaffected.
>
> The GUI is for *demonstrating and inspecting* the model. All research results in this
> package come from the headless runs below, because only those write the full data export.

### 6.2 The headless research simulation (produces the data)

```powershell
cd C:\Users\Chick\OneDrive\Desktop\reu

# Compile first if any Java changed
cd Geography; .\gradlew.bat compileJava; cd ..

# Scenario A — current placement (the headline result)
powershell -File scripts\run-headless.ps1 -ParamsFile batch\batch_params_final_A_seed42.xml

# Scenario B — optimized placement
powershell -File scripts\run-headless.ps1 -ParamsFile batch\batch_params_final_B_seed42.xml

# Scenario C — capacity-neutral demonstration
powershell -File scripts\run-headless.ps1 -ParamsFile batch\batch_params_final_C_seed42.xml

# The small, fast regression fixture (n=50, ~20 seconds)
powershell -File scripts\run-headless.ps1
```

Seeds 43 and 44 exist for each scenario — swap `seed42` for `seed43` / `seed44`. A full
n=2,037 run takes about 40 seconds.

### 6.3 Where the outputs appear

Every run writes three files to:

```
Geography\output\run_seed<SEED>\
    agents.csv         one row per resident (the primary evidence)
    shelters.csv       one row per shelter
    simulation.json    the reproducibility receipt
```

⚠️ **The folder is named by seed only**, so running two scenarios with the same seed
overwrites the previous output. Rename or move the folder between runs:

```powershell
Move-Item Geography\output\run_seed42 Geography\output\myrun-A-seed42
```

### 6.4 Turning runs into results

```powershell
# Verify one run and generate its own figures (38 automated consistency checks)
python scripts\analyze_run.py Geography\output\run_seed42

# Compare all scenarios and build the publication package
python scripts\compare_scenarios.py
```

`compare_scenarios.py` reads every folder named `final*` under `Geography\output\` and
writes to `docs\final\`:

| Output | What it is |
|---|---|
| `QUICK_RESULTS_SUMMARY.csv` | **Open this one first** — every resident, plain-English column names |
| `FINAL_PRESENTATION_SUMMARY.md` | What the simulation found, in one page |
| `FINAL_RESULTS_REPORT.md` | The full scientific write-up |
| `analysis/scenario_comparison.csv` | Population-level results, one row per scenario × seed |
| `analysis/stratified_exposure.csv` | Results broken down by age, mobility, asthma, COPD |
| `analysis/shelter_utilization.csv` | Per-shelter occupancy and refusals |
| `figures/*.png` | Eight publication figures, including a map |

### 6.5 If something goes wrong

| Symptom | Cause and fix |
|---|---|
| `Parameter 'X' not found in the schema` | In batch mode Repast reads parameters from the *batch file*, not `parameters.xml`. Add the parameter to your batch XML. |
| Results identical to a previous run | You reused a seed and the output folder was overwritten. Check `simulation.json` → `sim_id`. |
| `JDK not found` | Set `JAVA_HOME`; see `ENVIRONMENT_SETUP.md`. |
| Red errors in VS Code but Gradle compiles fine | The Java language server lost its classpath. Touch `build.gradle` to force a re-sync; trust Gradle. |

---

## 7. Where to go next

| Question | File |
|---|---|
| "What did you find?" | [`FINAL_PRESENTATION_SUMMARY.md`](FINAL_PRESENTATION_SUMMARY.md) |
| "Show me the data" | [`QUICK_RESULTS_SUMMARY.csv`](QUICK_RESULTS_SUMMARY.csv) |
| "Is this scientifically defensible?" | [`FINAL_RESULTS_REPORT.md`](FINAL_RESULTS_REPORT.md) |
| "How is vulnerability modelled?" | [`VULNERABILITY_MECHANISM_AUDIT.md`](VULNERABILITY_MECHANISM_AUDIT.md) |
| "Where do the bed counts come from?" | [`SHELTER_CAPACITY_AUDIT.md`](SHELTER_CAPACITY_AUDIT.md) |
| "What does column X mean exactly?" | [`../science/METRICS.md`](../science/METRICS.md) |
