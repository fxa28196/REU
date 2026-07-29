# Clean-Air Shelter Access During Wildfire Smoke

An agent-based model of who reaches a clean-air shelter — and who does not — when
wildfire smoke settles over Multnomah County, Oregon.

**Fatima Asghar** · NSF REU *Computational Modeling Serving Portland*, Portland State
University · mentor Prof. Christof Teuscher

---

## The question

If the September 2020 wildfire smoke returned today, what would happen to the people
living outside — and which fix actually helps: **more shelter capacity, or the same
capacity split across more sites?**

These sound like variations on one idea. They are not, and the difference decides
both how many people get indoors and *which* people do.

## What the model does

6,842 unsheltered residents — the 2025 Point-in-Time count for the county — each start
at a real reported campsite location (3,400 reports resolving to 3,317 distinct
coordinates; any one run seeds residents at a subset) and carry an individually sampled
age, sex, mobility status, and asthma/COPD status drawn from published sources. When
the air crosses the EPA "Unhealthy" threshold and a shelter is open, each walks
Portland's real street network at their own speed toward the nearest facility with
room, and is turned away if it fills before they arrive.

The hazard is **measured, not modelled**: hourly PM2.5 from the real event, which
peaked at 562.7 µg/m³ and stayed above the threshold for 194 of 312 hours.

## The results

Three scenarios, nine random seeds each — 27 runs. Scenarios B and C hold total
capacity *identical* — they differ only in how the same total is split across sites.
(Table shows seed 42; nine-seed means and ranges are in
[`docs/final/results-2026/6_SEED_ROBUSTNESS.csv`](docs/final/results-2026/6_SEED_ROBUSTNESS.csv).)

| | A — today | B — more capacity | C — same total, more doors |
|---|---|---|---|
| Facilities / spaces | 36 / 2,234 | 36 / 6,842 | 46 / 6,842 |
| Reached a shelter | **30.1%** | **91.6%** | **96.0%** |
| Turned away | 4,754 | 550 | **244** |
| Could not reach any shelter | 28 | 28 | 28 |
| Spaces left empty | 174 | **578** | 272 |
| Mean distance walked | 18,244 m | 7,896 m | **5,904 m** |

Two findings:

**Scenario B leaves 578 spaces empty while turning 550 people away — and 28 more
cannot reach any shelter at all.** The near-equality is forced, not discovered: B holds
exactly one space per person, so every resident refused or cut off leaves a bed empty
by construction (578 = 550 + 28). What scenario C shows is the fix: splitting the
identical total across ten additional sites — more doors, not better-chosen doors —
cuts refusals to 244. Ten sites drawn at random from the same candidate pool reproduce
C's sheltered count run for run, so the headcount gain is dispersion, not optimised
placement; placement earns credit only for the shorter walks (7,896 m → 5,904 m), and
that credit assumes the siting algorithm's perfect information.

**Capacity expansion alone widens the equity gap** between residents who walk easily
and those who do not — from 12.5 to 23.7 percentage points (seed 42) — because extra
capacity at an existing site is claimed first by whoever reaches it fastest. Splitting
the same total across more doors returns the gap to 12.5. What actually closes it is
triage, not siting: scenario D reserves 10% of B's beds for residents who walk with
difficulty, taking the gap from +23.7 to −0.5 points at identical overall access and
zero capital cost.

## What this does not claim

No health outcome is modelled: the model measures smoke exposure and inhaled
particulate mass, and predicts no illness, hospitalisation or death. The ten "new
sites" in scenario C are street-network nodes chosen by an algorithm, not buildings —
no zoning, cost, staffing or air-filtration analysis stands behind them. The B-vs-C
contrast and the equity gap are knife-edge phenomena of capacity exactly matching
demand — a bed sweep the study did not predict in advance shows access reaching 99.5%
and the mobility gap vanishing already at 1.2× demand. And against the one observed
occupancy record the model over-predicts by 1.5–15.6× (censored bracket; 1.52× is the uncensored lower edge),
which is why every access figure here is an **upper bound**; the final point value
awaits the U-12 recalibration. The limitations are enumerated in the technical
reference; several of them cut against the paper's own conclusions.

---

## Getting started

**Prerequisites:** Repast Simphony 2.11, JDK 17, Python 3.11+.
Full toolchain setup: [`docs/setup/ENVIRONMENT_SETUP.md`](docs/setup/ENVIRONMENT_SETUP.md)

```powershell
pip install -r requirements.txt
.\Geography\gradlew.bat -p Geography compileJava

# Run one arm. -ParamsFile is required; output is keyed by SEED ONLY, so rename
# it immediately or the next arm at the same seed will overwrite it.
powershell -File scripts\run-headless.ps1 -ParamsFile "batch\batch_params_2026_A_seed42.xml"

# Verify all 27 archived runs against six cross-run invariants
python scripts\verify_2026_runs.py
```

A full 312-hour run at n = 6,842 takes about 40–70 seconds.

## Where things live

| Path | Contents |
|---|---|
| `Geography/src/geography/` | The model — 14 Java classes |
| `Geography/data/` | All inputs, plus `README.md`, the provenance registry (source, URL, retrieval date, SHA-256, transformations) |
| `Geography/data/registry/` | Variable and assumption registries — a pre-run gate refuses to start the model if a sourced variable's source field is empty (a non-emptiness check; it does not test citation resolvability) |
| `Geography/batch/` | 27 run configurations (3 arms × seeds 42–50) |
| `scripts/` | Data acquisition, analysis, scenario construction, figure generation, verification |
| `docs/final/` | Results, technical reference, presenter script, plain-language summary |
| `docs/chapter/` | The publication chapter (LaTeX) |
| `docs/runs/present-day-three-arm/` | Archived manifests for all 27 runs |
| `docs/archive/` | Superseded documents, retained as provenance |

**Start here:**
[`docs/final/PRESENT_DAY_THREE_ARM_RESULTS.md`](docs/final/PRESENT_DAY_THREE_ARM_RESULTS.md) — the results ·
[`docs/final/TECHNICAL_REFERENCE.md`](docs/final/TECHNICAL_REFERENCE.md) — every equation, source and code path ·
[`docs/final/readable/RESULTS_EXPLAINED.md`](docs/final/readable/RESULTS_EXPLAINED.md) — plain language

## Reproducibility

Every run writes a manifest recording its git commit, random seed, Java and Repast
versions, every parameter value, a SHA-256 for each input file, and whether the
working tree was clean. All 27 published runs were executed from a clean tree and pass
six cross-run invariants, including that the population is byte-identical across arms
within each seed — so a difference between arms can only come from the shelters.

Exposure was independently recomputed in Python from the raw EPA file and matches the
model to a ratio of 1.0000; routing was validated against a separate Dijkstra
implementation that reproduces the Java distances exactly.

## Citing

See [`CITATION.cff`](CITATION.cff). Licensed MIT — but read the scope section of
[`LICENSE`](LICENSE): several inputs are third-party, and the street centreline data
is redistributed with **unverified** terms.

## Acknowledgement of tools

I directed this research, made all research decisions, and wrote the manuscript.
Claude (Anthropic) assisted with coding, data-acquisition and analysis scripting,
verification tooling, and documentation drafting. I reviewed, revised and approved all
outputs and take full responsibility for the final text.
