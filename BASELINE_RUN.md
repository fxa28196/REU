# Baseline Run — Repast Simphony Geography Model

**Date:** 2026-07-24 · **Machine:** Windows 11 Home (user `Chick`), no admin rights used
**Purpose:** Prove the untouched model compiles, launches, and simulates in the new
VS Code toolchain **before any model-behavior change**. Companion to `ENVIRONMENT_SETUP.md`.

## Environment used

| Component | Value |
|---|---|
| JDK | Temurin 17.0.19+10 (portable, `C:\Users\Chick\tools\jdk-17.0.19+10`) |
| Repast Simphony | 2.11.0 (`C:\Users\Chick\RepastSimphony-2.11.0`, silent NSIS install) |
| Build | Gradle 8.14.3 via committed wrapper (`Geography/gradlew.bat`) |
| Data | `Geography/data/Streets.*` (112,070 features, extracted from `Streets.zip`) |

## Commands used and results

### 1. Compile — ✅ PASS

```powershell
cd Geography
$env:JAVA_HOME = "C:\Users\Chick\tools\jdk-17.0.19+10"
.\gradlew.bat compileJava        # → BUILD SUCCESSFUL in 22s
```

Only pre-existing warnings (deprecated `File.toURL()` API, unchecked generics) — no errors.

### 2. GUI scenario launch — ✅ PASS

```powershell
.\gradlew.bat runModel
```

The Repast runtime opened with the scenario loaded (window title *"Geography -
Repast Simphony"*, status bar *"Geography loaded"*). Scenario tree correctly shows
the `ContextCreator` data loader and all three GIS displays.
Screenshot: `docs/baseline/01-runtime-launched.png` (captured via `PrintWindow`).

**Limitation:** pressing **Initialize ⏻ / Run ▶** is an interactive step; scripted
click injection into the Swing toolbar proved unreliable (and keystroke injection
was deliberately avoided — it can leak into other desktop windows), so in-GUI layer
rendering was not exercised hands-off. A human clicking Initialize → Run is the
one manual step. (`docs/baseline/02-after-init-attempt.png` records the automation
attempt: the posted click selected a scenario-tree node instead of the toolbar button.)

### 3. Headless end-to-end simulation — ✅ PASS (the strong evidence)

```powershell
java <same JVM flags as runModel> `
  -cp "<REPAST>\plugins\repast.simphony.runtime_2.11.0\bin;<REPAST>\...\lib\*" `
  repast.simphony.runtime.RepastBatchMain -params batch\batch_params.xml Geography.rs
```

This executes the identical `ContextCreator.build()` + schedule with no GUI. Output:

```
[TEST] Reached the shapefile loading block successfully!
Site 33 reached destination shelter via street lines and exited.
Site 43 reached destination shelter via street lines and exited.
…   (30 distinct agents arrived within the 170 s observation window)
```

Verified from this run:

| Check | Result |
|---|---|
| Does it compile? | Yes (Gradle + javac fallback both) |
| Does the scenario launch? | Yes (GUI loads scenario; headless batch initializes fully) |
| Are GIS layers loaded? | Yes — `Streets.shp` (112,070 features) loads and reprojects Web Mercator → WGS84; the `[TEST]` marker after `loadFeatures(...)` printed |
| Are agents visible/created? | Yes — 100 `GisAgent`s + 5 `Shelter`s + 112,070 `PortlandStreet`s created; 30 agents demonstrably walked streets and reached shelters |
| Are there runtime errors? | None. Only a benign JVM note (`WARNING: Using incubator modules`, from `--add-modules=ALL-SYSTEM`). No exceptions in either GUI or batch run |

## Fixes required to reach this baseline (no model logic touched)

1. **`Geography/data/Streets.shp` was missing** — extracted from `Streets.zip`
   (original zip preserved). Without it the context build finds zero features.
2. **`batch/batch_params.xml` was an empty stock sweep** — batch mode reads
   parameters from this file (not `parameters.xml`), so the first headless attempt
   died with `IllegalParameterException: Parameter 'numAgents' not found in the
   schema`. Fixed by declaring `numAgents=100`, `zoneDistance=1000.0` — the same
   values as the GUI defaults. (This error and fix are the run's only "error" story.)

## Current limitations (carried into the science phase)

- **No end condition:** the batch run never terminates on its own — ~70 of 100
  agents were still walking (or greedy-loop oscillating) when the 170 s cap killed
  the process. Expected from the `PROJECT_ASSESSMENT.md` movement analysis.
- **Agents vanish on arrival** (`context.remove`), so "arrived" is only observable
  via stdout — reinforcing the Phase-5 outcome-logging priority.
- **Performance:** context build + per-tick nearest-street scans over 112k features
  are heavy; `-Xmx4g` is mandatory (prior OOM is on record in `hs_err_pid5412.log`).
- **GUI Initialize/Run remains a human click** in the VS Code workflow (run task
  opens the GUI; two clicks start the visualization).
- Stray legacy state: `Geography.rs` display configs reference three empty coverage
  layers; harmless but noisy (cleanup is roadmap commit 2).
