# Phase 2 Â· Spec 6 â€” Scenario Framework

**Status: IMPLEMENTED.** Requirement: run baseline, high-smoke, extra-shelters,
reduced-mobility, road-disruption and capacity-shortage **without changing
source code**, while keeping every effective parameter in the run manifest and
never disturbing the immutable baseline.

---

## 1. Mechanism comparison

| Option | Sweepable in batch XML | Tabular data (extra shelters, closure lists, age tables) | Manifest completeness | Verdict |
|---|---|---|---|---|
| **A. Many flat Repast parameters** | Yes, natively | **No** â€” Repast parameters are scalars; shelter sets and closure lists are inexpressible | automatic if the manifest enumerates the schema | Rejected as sole mechanism |
| **B. One `scenario` id parameter â†’ external config file** | Yes (`type="list" value_type="string"`; parameters nest, so scenario Ã— seed is one sweep file) | Yes, via file-pointer keys | needs explicit dump of the resolved config + file SHA-256 | **RECOMMENDED** |
| **C. JSON scenario files** | Same as B | Yes | Same as B | Rejected: `Geography/build.gradle` resolves only Repast plugin jars; **no JSON parser is on the compile classpath**, and adding a Groovy dependency buys nothing over properties + CSV |

---

## 2. Recommended design â€” one parameter, three resolution layers

**Add exactly one Repast parameter** in `Geography.rs/parameters.xml`:
`scenario` (String, default `baseline`).

**Do not edit `Geography/batch/batch_params.xml`** â€” it is the archived baseline
artefact. Parameters absent from a batch file take their `parameters.xml`
default, so the baseline keeps running unchanged and keeps its provenance. New
sweeps live in new files (e.g. `batch/batch_scenarios.xml`) with `scenario`
nested over `randomSeed`. `scripts/run-headless.ps1` gains an optional
`-ParamsFile` argument defaulting to today's hard-coded value (non-breaking).

**Scenario files:** `Geography/data/scenarios/<id>.properties`, read with
`java.util.Properties` â€” JDK-only, comment-friendly, diff-friendly. Keys are
namespaced; **every key has a code default equal to today's behaviour**:

```properties
# high-smoke.properties  â€” prefer the real-episode variant (05-HAZARDS Â§3)
description       = Sensitivity: alternative measured smoke episode
smoke.episodeFile = data/airnow/aqs_hourly_pm25_portland_2017-09.csv

# reduced-mobility.properties
population.mobilityLimitedShare = 0.27      # upper bound of the 0.19-0.27 evidence range

# extra-shelters.properties
shelters.file     = data/shelters/shelters_hypothetical_5site.csv

# capacity-shortage.properties
numAgents.override = 400                    # above 2x99 so capacity binds
```

`baseline.properties` contains only a `description` line â€” so `scenario=baseline`
is provably identical to having no scenario mechanism at all.

**Resolution order** (implemented once, documented in `METRICS.md`):
1. Code defaults (`ScenarioDefaults`, each carrying its evidence class in a
   comment).
2. `data/scenarios/<id>.properties`.
3. Repast parameters â€” the existing scalars always win, so a `walkingSpeedMps`
   sweep still works *within* any scenario.

Layer 3 winning is deliberate: it allows one-dimension sensitivity sweeps inside
a scenario without a combinatorial explosion of properties files.

---

## 3. Mandatory reproducibility bookkeeping

`simulation.json` gains a `scenario` block beside `reproducibility.parameters`:

```json
"scenario": {
  "id": "...", "file": "data/scenarios/....properties", "file_sha256": "...",
  "source_of_each_key": { "population.mobilityLimitedShare": "scenario_file" },
  "effective": { "<every key including defaults, sorted>": "<value>" }
}
```

`source_of_each_key` (`default` | `scenario_file` | `repast_parameter`) makes the
layering auditable rather than magic.

**Overlay files referenced by a scenario are appended to the input-dataset list**
so their SHA-256 enters `input_datasets` and the `data_version_tag`. **Append
only files actually referenced** â€” `baseline.properties` references none, so the
baseline's `data_version_tag = 0bc943324ae6` is preserved. Assert this in the
gate for the commit that introduces the mechanism.

**Output-directory collision (a real bug waiting to happen).** Results are
written to `output/run_seed<seed>`; two scenarios at seed 42 would silently
overwrite each other, and an 18-run sweep would do it repeatedly. Fix: keep
`output/run_seed<seed>` when `scenario == baseline` (preserving the documented
path in `docs/archive/CURRENT_MODEL_RUN.md` and the re-verify command in
`BASELINE_RESULTS.md`), otherwise `output/run_<scenario>_seed<seed>`. Both match
the `run_*` glob the analysis scripts already use.

---

## 4. The six required scenarios

| Scenario | Perturbation from baseline | Evidence class | Notes |
|---|---|---|---|
| `baseline` | none | â€” | must stay byte-identical to `docs/runs/final-baseline/` |
| `high-smoke` | alternative **real** episode; or duration-extended plateau | **M** (real) / **A** (synthetic) | amplitude multipliers discouraged â€” `05-HAZARDS.md` Â§3 |
| `extra-shelters` | hypothetical shelter-set file | **A** (hypothetical siting) | the actual research question; every operating site needs a numeric capacity |
| `reduced-mobility` | mobility-limited share â†’ 0.27; speed distribution shifted | **M/L** | uses the upper bound of the verified 0.19â€“0.27 range |
| `road-disruption` | explicit deterministic closure list | **SYNTHETIC / A** | conditional experiment only, never probabilistic â€” `05-HAZARDS.md` Â§2 |
| `capacity-shortage` | `numAgents` > 198 so 2Ã—99 binds | **M** (capacity) + **A** (scale) | requires order-independent admission first â€” `08-ENGINEERING.md` Â§3.5 |

**One scenario = one perturbation.** Combinations only as explicitly named
"combined" scenarios; otherwise no effect is attributable. Every scenario's
`summary.md` states its delta from baseline in one line.

---

## 5. Comparison protocol

- **Common random numbers across scenarios** (`08-ENGINEERING.md` Â§3.4): same
  seed â‡’ same population, same attributes per agent id, same awareness and
  decision draws. Differences are then attributable to the perturbation.
- **Paired differences** against baseline on: arrival rate, travel
  time/distance distributions, exposure distribution and Gini, person-hours above
  Unhealthy, per-shelter occupancy and refusals â€” the protocol already written in
  `BASELINE_RESULTS.md` Â§7.
- **Replications:** â‰¥ 5 seeds for any quoted scenario result; â‰¥ 30 for
  hazard-enabled paired comparisons.
- **Ablation:** every campaign includes a run with all behavioural heterogeneity
  disabled (`04-DECISION.md` F3 rule). If a conclusion flips between ablation and
  full model, it belongs to the assumptions.

