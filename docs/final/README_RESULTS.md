# How to read these results

*Plain-English guide to the wildfire-smoke shelter simulation. No modelling background assumed.*

---

## 1. What this simulation is doing

In September 2020, wildfire smoke covered Portland for about two weeks. Air quality
reached some of the worst levels ever recorded in the United States. Most people could
go indoors at home. **People living unsheltered could not.**

This simulation asks: if that smoke event happened again **today** — with today's shelter
system and today's unsheltered population — could people actually *get* to a clean-air
shelter, and which single change would help them most?

To answer it, the model creates **6,842 simulated residents** — one for each person
counted as unsheltered in Multnomah County's 2025 point-in-time count. It places each of
them at a **real encampment location**: the City of Portland campsite-report feed contains
3,400 reports resolving to 3,317 distinct coordinates, and each run samples starting
points from that file (the arm-A seed-42 run realises 2,918 distinct start locations).
When the smoke crosses the danger threshold, each resident **walks the real Portland
street network** — with freeways and their ramps filtered out, because nobody can walk
along I-5 — toward the nearest shelter that still has an open bed. Anyone turned away at
a full door tries the next-nearest one.

While they are outside, they breathe **real measured air**: hourly PM2.5 readings from the
EPA's monitoring station in Multnomah County for September 2020 — a 312-hour window in
which the smoke arrived in two spells, a short one on the first day and then the main
episode, peaking at 562.7 µg/m³. The moment someone gets indoors, their smoke intake stops
accumulating. If they never get indoors, it keeps accumulating for the entire window.

**Nothing about the geography, the air, the shelter locations, or the population size is
invented.** Sources and validation live in
[`FINAL_DATA_VALIDATION_REPORT.md`](FINAL_DATA_VALIDATION_REPORT.md) and
[`TECHNICAL_REFERENCE.md`](TECHNICAL_REFERENCE.md).

### The four arms of the experiment

The study separates three levers a county could actually pull: **how many beds**, **how
many doors**, and **who gets in first**.

| Arm | What it tests | Result (seed 42; all nine seeds agree) |
|---|---|---|
| **A — today** | The 36 clean-air-capable facilities the county operates now, at their real addresses with their real capacities (2,234 spaces) | 2,060 of 6,842 got inside — **30.1%** |
| **B — more beds, in the places we already have** | The same 36 facilities, capacities raised so total beds equal the population (6,842) | 6,264 — **91.6%** |
| **C — same total as B, more doors** | The same 6,842 beds, split across ten *additional* sites (46 doors instead of 36) | 6,570 — **96.0%** |
| **D — same beds as B, triage reserve** | B's beds, but 10% of each shelter is held back for the slowest walkers | 6,264 — **91.6%**, and the fairness gap disappears (below) |

How to read those four numbers, in order of size:

1. **Capacity is the first-order problem.** Doing nothing but adding beds to the
   existing buildings (A → B) takes access from 30.1% to 91.6%. No siting study, no new
   addresses.
2. **The extra step from 91.6% to 96.0% is "more doors", not clever placement.** A
   control experiment drew ten sites *at random* from the same candidate list and
   reproduced C's sheltered count exactly — three independent random draws, three seeds
   each, every one landing on the same counts as C (6,570 / 6,565 / 6,566 in seeds
   42–44). Splitting the same total across more doors simply gives a refused person more
   places left to try. What placement *does* earn credit for is **shorter walks**: the
   average walk drops from 7,896 m in B to 5,904 m in C (seed 42) — and even that credit
   assumes a planner with perfect information.
3. **B leaves 578 beds empty while turning 550 people away (seed 42).** That is not a
   paradox and not a discovery — it is forced by the design. When capacity exactly equals
   population, every person who is refused (550) or cannot reach any shelter (28) leaves
   a bed empty somewhere: 578 = 550 + 28, by identity.
4. **Who is left outside is not random — and arm D fixes that for free.** In B,
   residents with mobility limitations get inside about 23.7 percentage points less often
   than everyone else (seed 42; 24.5 and 22.4 in seeds 43/44). Arm D holds 10% of each
   shelter's beds for the slowest walkers: same beds, same doors, same overall access
   (6,264 sheltered in both B and D at seed 42), and the gap goes from **+23.7 points to
   −0.5** (seeds 43/44: −0.1 / +1.5). It costs nothing to build.

**Why arms B, C, and D have room for everyone.** Total capacity equals the population by
design in those arms. If beds were scarce everywhere, the bed count — not geography or
admission policy — would decide every outcome, and the experiment could not see the other
two levers at all. Individual shelters still fill up, so residents are still turned away
at full doors and still have to walk somewhere else.

A separate **historical reference run** keeps the September-2020 configuration — the two
real shelters that actually opened, 99 beds each. It is **not a study arm**; it exists
only to compare the model against the one observed occupancy record (§5).

---

## 2. What one row in `1_EVERY_PERSON.csv` represents

**One row = one person's entire experience of the smoke event.**

The file is [`results-2026/1_EVERY_PERSON.csv`](results-2026/1_EVERY_PERSON.csv):
27,369 lines — a header plus 6,842 residents × the four scenarios, all from the seed-42
run of each arm. Reading across a row tells you who the person is (age, sex, mobility,
asthma, COPD, walking speed), where they started, and what happened: whether they got
inside, **how many minutes it took to reach shelter**, **how many times they were turned
away at a full door**, how far they walked, how many hours they spent outdoors in smoke,
and how much smoke they breathed in.

Here is a real row from arm A, verbatim:

```
"A - Today (real shelters, real number of beds)",Site 7,25-145307,-122.679788,45.586104,32,18-44,Male,No,No,No,No,No,1.39,Got inside,Arbor_Lodge_Shelter,27.0,1,2253.0,0.5,150.0
```

Translated: *Site 7 started at encampment `25-145307` in North Portland. He is 32 and
walks at 1.39 m/s. When the smoke crossed the danger threshold he set out, was turned away
once at a full door, and reached the Arbor Lodge Shelter 27 minutes after leaving, having
walked 2,253 metres. He spent half an hour outdoors and breathed in an estimated 150
micrograms of fine particles.* (The numbers cross-check: 2,253 m at 1.39 m/s is 27
minutes.)

And a less fortunate one, from the same run:

```
"A - Today (real shelters, real number of beds)",Site 0,25-167975,-122.681054,45.556943,28,18-44,Male,No,Yes,Yes,Yes,Yes,1.08,Turned away - every shelter was full,none,,4,23638.0,194.0,33407.0
```

Translated: *Site 0 is 28 and has asthma and COPD. He walks at 1.08 m/s. He was turned
away at four full doors, walked 23.6 km in total, and never got indoors. He spent 194
hours in air the EPA calls "Unhealthy" — every unhealthy hour of the 312-hour window,
which came in two spells with clean days in between that do not count toward that number —
and breathed in an estimated 33,407 micrograms of fine particles, roughly 220 times more
than Site 7.* (His "minutes to reach shelter" field is blank because he never reached
one.)

The file has 6,842 rows per scenario because there are 6,842 residents. Every one of them
is accounted for — nobody is deleted from the simulation when they fail, because leaving
out the people who failed would make the results look far better than reality.

**Related files, all in [`results-2026/`](results-2026/):**

- `2_BY_GROUP.csv` — the same outcomes broken down by age group, sex, mobility, asthma,
  COPD.
- `3_WHOLE_POPULATION.csv` — the headline table: one row per scenario × seed (27 rows).
- `4_WHERE_PEOPLE_STARTED.csv` — the real encampment starting points and how many
  residents each one seeded.
- `5_EVERY_SHELTER.csv` — one row per facility: where it is, how many beds, how full it
  got, how many people were turned away at that door.
- `6_SEED_ROBUSTNESS.csv` — the headline numbers for all nine seeds of each arm, with the
  exact code version stamped on every row.
- `ML_TRAINING_DATA.csv` — a model-ready per-agent table (one row per resident per arm,
  seed 42): agent *inputs* (age, sex, conditions, walking speed, start point, distance to
  the nearest shelter site) joined to agent *outcomes* (got inside?, minutes to shelter,
  stops at full doors, metres walked, hours in unhealthy smoke, micrograms inhaled). Plain
  CSV by design — it opens directly in Excel and loads directly into pandas.
- `ML_MODEL_SUMMARY.md` (with `ML_MODEL_COEFFICIENTS.csv`) — logistic and OLS regressions
  fitted on the pooled nine-seed outputs, including a negative-control honesty check:
  features with no built-in mechanism (asthma, chronic conditions) must come out null, and
  they do.
- `figures/*.png` — six charts built from the same CSVs.

The archived raw runs behind all of this live in
[`../runs/present-day-three-arm/`](../runs/present-day-three-arm/) — one folder per
arm × seed containing `agents.csv`, `shelters.csv`, and `simulation.json` (the run's
"receipt": the random seed, every parameter, a checksum of every input file, and the exact
code version). `PROVENANCE.md` in that folder records when and why the family was last
regenerated.

---

## 3. What the important numbers mean

### Minutes to reach shelter
Minutes from the moment a resident sets out — everyone leaves when the air first crosses
the danger threshold — to the moment they are admitted, including any extra time spent
walking between full shelters. Blank if they never got in.

### Times turned away at a full door
How many full shelters the person queued at before their story ended. Being refused is
survivable **when there are doors left to try** — that is the "more doors" mechanism in
one statistic. Across the nine pooled seeds: in arm A, only 6.6% of residents who were
refused at least once eventually found a bed (after 3.4 stops on average); in arm B,
79.3% did; in arm C, 91.3% did.

### How far they walked (metres)
Metres actually walked, following real streets — not a straight line. This includes the
detours caused by being turned away. A resident refused everywhere still has a large
number here. That is the point: **they did the walking and got nothing for it.**

### Hours spent outdoors in smoke
Hours the person spent outdoors while the air was at or above the EPA "Unhealthy"
threshold (55.5 µg/m³). The September 2020 peak in this dataset was 562.7 µg/m³ — about
ten times that threshold. A value of 194 means the person was outside for every unhealthy
hour of the two-week window.

### Smoke breathed in (micrograms)
**The headline number.** An estimate of the mass of fine particles the person inhaled
while outdoors. Getting indoors sooner is the only thing that lowers it — the moment
someone is admitted, it stops accumulating.

⚠️ **This is an exposure index, not a medical dose.** It is not a prediction of an asthma
attack, a hospital visit, or a death. It tells you who was exposed more, not who got sick.

For scale, the seed-42 averages across the whole population:

| Arm | Got inside | Average walk | Average hours in bad smoke | Average smoke breathed |
|---|---|---|---|---|
| A — today | 30.1% | 18,244 m | 135.8 h | 23,373 µg |
| B — more beds, same places | 91.6% | 7,896 m | 17.5 h | 3,056 µg |
| C — same total, more doors | 96.0% | 5,904 m | 8.7 h | 1,536 µg |

### What happened (`final state`)
Every resident ends in exactly one of three states:

| State | Plain meaning |
|---|---|
| **Got inside** | Reached a shelter with an open bed. Exposure stopped at that moment. |
| **Turned away — every shelter was full** | Walked to shelters, was refused for lack of space, and ran out of options. Stayed outside for the rest of the event. |
| **Could not reach any shelter** | Their starting point sits on an isolated piece of the street network with no walking route to any shelter — 26–36 people per run (28 at seed 42), mostly on segments orphaned when the freeway filter removed pedestrian-illegal links. Reported honestly rather than quietly dropped. |

---

## 4. Honest limitations to state out loud

1. **This measures exposure, not health.** The model never predicts an asthma attack, a
   hospital visit, or a death. Converting smoke exposure into health outcomes needs
   medical dose-response modelling that this project deliberately does not attempt.
2. **Everyone is assumed to know the shelters exist.** During the real 2020 event, a
   Portland State survey found 65% of unhoused residents had never heard of the shelters.
   So arm A's 30.1% is an **optimistic upper bound** on today's system.
3. **Arm B is an accounting device, not a construction plan.** Raising the existing 36
   facilities to 6,842 total spaces is physically impossible in situ for much of the
   inventory (motels and pod villages cannot triple in place), and arm C's ten additional
   sites are hypothetical, with assumed capacities. B and C price the *levers*, not the
   buildings.
4. **The headline geography findings live on a knife edge — and we know because two of
   our own registered predictions failed (P-3c, P-3d).** Before the Phase-D runs we
   predicted that the mobility-equity gap and the value of splitting capacity across more
   doors would persist once beds were plentiful. They do not. A bed-supply sweep shows
   access reaches 99.5% already at 1.2× demand and the mobility gap vanishes at **any**
   surplus — the equity gap and the headcount value of dispersion are knife-edge phenomena
   of capacity exactly equal to demand. That is precisely why arm D matters: the triage
   reserve is the zero-cost fix at exactly that knife edge, which is where a real system
   sized "one bed per person" would sit.
5. **Access is walk-only.** Real 2020 access was dispatcher-mediated, with transport
   assistance; the model only lets people walk. Another reason to read the absolute
   percentages as bounds and trust the *comparisons* between arms.
6. **The model shelters more people than the 2020 record shows.** In the historical
   reference run both 2020 shelters fill completely; the one contemporaneous observation
   records about 130 people across both sites. Stated precisely: the model over-predicts
   the one observed occupancy record by 1.5–15.6× (censored bracket; 1.52× is the
   uncensored lower edge), final value pending the U-12 recalibration. Reported, not
   hidden — see §5.

---

## 5. About the historical reference run

Alongside the study arms there is a **historical reference run** that keeps the
September-2020 configuration: the two shelters that actually opened, 99 beds each. It is
not a scenario and carries no experimental result. Its only job is calibration.

In the model, both shelters fill (99 and 99 — 198 people sheltered). The one
contemporaneous observation — Street Roots, 16 September 2020 — records roughly 90 people
at the Oregon Convention Center and roughly 40 at the Charles Jordan Community Center,
about 130 in total. That snapshot is a single moment, and the Convention Center figure is
best treated as right-censored (the true count could have been higher later). So the
honest statement is a bracket, not a point: the model over-predicts the one observed
occupancy record by 1.5–15.6× (censored bracket; 1.52× is the uncensored lower edge),
with the final value pending the U-12 recalibration. The main driver is the same
assumption flagged in §4: the model assumes everyone knows the shelters exist. Because the
same assumption applies identically in every arm, the *comparisons* between arms survive
even while the absolute uptake level is uncertain.

---

## 6. How to run the simulation

### 6.1 The visual Repast simulation (with the map GUI)

```powershell
cd C:\Users\Chick\OneDrive\Desktop\reu
powershell -File scripts\run-model.ps1
```

This compiles the model and opens the Repast Simphony GUI. Press **Initialize** to build
the model, then **Start** (or **Step** to advance one tick at a time). The map display
shows the street network, shelter locations, and residents as points. Expect a wait while
the 109,434-segment street network loads before the display appears. Parameters can be
changed in the GUI's **Parameters** panel before you press Initialize.

> The GUI is for *demonstrating and inspecting* the model. All research results in this
> package come from the headless runs below, because only those write the full data
> export.

### 6.2 The headless research simulation (produces the data)

```powershell
cd C:\Users\Chick\OneDrive\Desktop\reu

# Compile first if any Java changed
cd Geography; .\gradlew.bat compileJava; cd ..

# Arm A — today (36 sites, 2,234 spaces)
powershell -File scripts\run-headless.ps1 -ParamsFile batch\batch_params_2026_A_seed42.xml

# Arm B — more beds, in the places we already have (36 sites, 6,842 spaces)
powershell -File scripts\run-headless.ps1 -ParamsFile batch\batch_params_2026_B_seed42.xml

# Arm C — same total as B, split across ten additional sites (46 doors)
powershell -File scripts\run-headless.ps1 -ParamsFile batch\batch_params_2026_C_seed42.xml

# Arm D — B's beds with a 10% triage reserve for the slowest walkers
powershell -File scripts\run-headless.ps1 -ParamsFile batch\batch_params_2026_D_seed42_r10.xml

# Historical 2 x 99 calibration reference (not a study arm)
powershell -File scripts\run-headless.ps1 -ParamsFile batch\batch_params_histref_seed42.xml
```

**Seeds 42–50 exist for arms A, B, and C** — swap `seed42` for any of `seed43` …
`seed50`. The `-ParamsFile` path is relative to the `Geography\` project folder. A full
n = 6,842 run takes roughly 30–70 seconds.

The controls and extensions have batch files in the same folder
(`Geography\batch\batch_params_2026_*.xml`): `CP4`–`CP6` are the random-pool placement
control, `CR1`–`CR3` the bounding-box control, `BS080`–`BS160` the bed-supply sweep,
`W24`/`W72` the shorter smoke windows, and `D_*_r00/r10/r15/r25` the triage-reserve
fractions (r00 reproduces arm B exactly).

### 6.3 Where the outputs appear

Every run writes three files to:

```
Geography\output\run_seed<SEED>\
    agents.csv         one row per resident (the primary evidence)
    shelters.csv       one row per shelter
    simulation.json    the reproducibility receipt
```

⚠️ **The folder is named by seed only**, so a second arm at the same seed overwrites the
first. Rename immediately, using the arm-tagged name the analysis scripts expect:

```powershell
Move-Item Geography\output\run_seed42 Geography\output\A2026-n6842-seed42
```

The canonical archived copies of all production runs are already committed under
`docs\runs\present-day-three-arm\<ARM>-seed<SEED>\`.

### 6.4 Turning runs into results

```powershell
# Rebuild the plain-English results package (CSVs 1-5 + figures) from the 27 A/B/C runs
python scripts\make_2026_results.py

# Rebuild the model-ready training table (seed 42, all arms)
python scripts\make_ml_training_data.py

# Refit the outcome regressions and rewrite ML_MODEL_SUMMARY.md
python scripts\fit_outcome_models.py

# Verify the archived canonical runs are intact
python scripts\verify_2026_runs.py

# Per-run consistency checks and figures for any single run folder
python scripts\analyze_run.py Geography\output\A2026-n6842-seed42
```

`make_2026_results.py` reads `Geography\output\{A,B,C}2026-n6842-seed{42..50}\` and
writes everything in `docs\final\results-2026\` described in §2. Nothing in it computes
new science — it reformats what the model exported.

### 6.5 If something goes wrong

| Symptom | Cause and fix |
|---|---|
| `Parameter 'X' not found in the schema` | In batch mode Repast reads parameters from the *batch file*, not `parameters.xml`. Add the parameter to your batch XML. |
| Results identical to a previous run | You reused a seed and the output folder was overwritten. Check `simulation.json` → `sim_id`, and rename folders as in §6.3. |
| `JDK not found` | Set `JAVA_HOME`; see `docs/setup/ENVIRONMENT_SETUP.md`. |
| Red errors in VS Code but Gradle compiles fine | The Java language server lost its classpath. Touch `build.gradle` to force a re-sync; trust Gradle. |

---

## 7. Where to go next

| Question | File |
|---|---|
| "What did you find?" | [`PRESENT_DAY_THREE_ARM_RESULTS.md`](PRESENT_DAY_THREE_ARM_RESULTS.md) |
| "Show me the data" | [`results-2026/3_WHOLE_POPULATION.csv`](results-2026/3_WHOLE_POPULATION.csv), then [`results-2026/1_EVERY_PERSON.csv`](results-2026/1_EVERY_PERSON.csv) |
| "Explain it without jargon" | [`readable/RESULTS_EXPLAINED.md`](readable/RESULTS_EXPLAINED.md) |
| "Is this scientifically defensible?" | [`TECHNICAL_REFERENCE.md`](TECHNICAL_REFERENCE.md) |
| "Can I train a model on this?" | [`results-2026/ML_TRAINING_DATA.csv`](results-2026/ML_TRAINING_DATA.csv) + [`results-2026/ML_MODEL_SUMMARY.md`](results-2026/ML_MODEL_SUMMARY.md) |
| "Where do the bed counts come from?" | [`SHELTER_CAPACITY_AUDIT.md`](SHELTER_CAPACITY_AUDIT.md) |
| "What does column X mean exactly?" | [`../science/METRICS.md`](../science/METRICS.md) |
| "Which exact code produced the archived runs?" | [`../runs/present-day-three-arm/PROVENANCE.md`](../runs/present-day-three-arm/PROVENANCE.md) |
