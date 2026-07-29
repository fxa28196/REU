# 08 — Scenario D: need-based admission

**Critique claim.** The paper recommends building. But in arm B there are hundreds of
empty beds and only a few hundred mobility-limited people left outside, so an intake
rule that reserves and holds beds could house them with **no new building and no
relocation** — and that intervention is buried in a limitations bullet.

**Verdict: the claim is RIGHT, and the effect is larger than the critique guessed.**

---

## 1. The premise checks out

Arm B's total capacity (6,842) equals the population (6,842), so "empty beds" and
"people left outside" are the same number by construction.

| arm B, seed 42 | count | source |
|---|---|---|
| Sheltered | 6,264 | `docs/runs/present-day-three-arm/B-seed42/agents.csv` |
| Left outside (= unused spaces) | 578 | same; `shelters.csv` capacity 6,842 − occupancy 6,264 |
| **Mobility-limited left outside** | **382** | `agents.csv`, `mobility_limited=1 AND reached_shelter=no` |
| Non-mobility-limited left outside | 196 | same |

The critique said 383; the file says **382** at seed 42 (396 at seed 43, 384 at seed 44).
That one-person discrepancy does not touch the argument: 382 people with the greatest
need are outdoors while 578 spaces sit empty, purely because admission is
first-come-first-served and they walk slower.

---

## 2. What was implemented

The **simplest defensible triage that does not restructure the model**: each shelter
holds back `floor(capacity × triageReserveFraction)` spaces for mobility-limited
arrivals. Non-priority residents neither target nor are admitted to a shelter once its
occupancy reaches `capacity − reserved`; priority residents may use the whole capacity.

| file | change |
|---|---|
| `Geography/src/geography/agents/Shelter.java:58, 91, 111, 121, 145` | `reservedForPriority` field, `admit(boolean isPriority)`, `hasSpaceFor(boolean)`, `setReservedForPriority`, `isAvailableAt(tick, isPriority)`; the old no-arg forms delegate with `false` |
| `Geography/src/geography/agents/GisAgent.java:389` | `isPriorityForAdmission()` — true iff `attributes != null && attributes.mobilityLimited` |
| `Geography/src/geography/agents/GisAgent.java:301, 348, 410` | admission, shelter selection and the re-entry test are priority-aware |
| `Geography/src/geography/agents/ContextCreator.java` | `triageReserveFraction` parameter (default **0.0**), scenarioCode **7** = arm D (arm B's shelter file verbatim), per-site reserve, `[Triage]` log line, manifest field |
| `Geography/Geography.rs/parameters.xml` | `triageReserveFraction`, default 0.0 |
| `scripts/make_batch_params_d_2026.py` | arm-D batch files, copied line-for-line from `make_batch_params_2026.py` |

Note `scenarioCode 5` was **already taken** by a concurrently-added C-random arm; arm D
is **code 7**.

The triage criterion is mobility limitation *and nothing else*. It is the only sampled
attribute that mechanically causes the access gap in this model — a slower walker
reaches a door later and is refused by someone who walked faster. Age, asthma and COPD
carry no behavioural consequence here, so triaging on them would be a claim the
simulation cannot support.

### Reserve at 0 is arithmetically inert

`hasSpaceFor(false)` is `occupancy < capacity - reservedForPriority`. At
`reservedForPriority == 0` that is the identical expression `occupancy < capacity` that
`hasSpace()` always was. It is also inert a second way: with heterogeneity off no
resident has attributes, so nobody is priority.

---

## 3. Byte-identity verification (done BEFORE any arm-D run)

Arm A seed 42 was re-run with the modified code and the unmodified
`batch_params_2026_A_seed42.xml` (which does not declare `triageReserveFraction`, so it
falls back to 0.0), and diffed against the archived reference excluding `sim_id`,
`commit`, `data_version`:

```
docs/runs/present-day-three-arm/A-seed42/agents.csv  vs  post-change run
  -> IDENTICAL, 6842 rows
docs/runs/present-day-three-arm/A-seed42/shelters.csv vs post-change run
  -> IDENTICAL (byte-for-byte, no exclusions)
```

A **pre-change** run of the same params was also diffed against the same reference first,
to prove the machine reproduces at all before attributing anything to the edit — it was
identical too. So the "identical" result above is a real test, not a vacuous one.

**Second, stronger check.** Arm D at `triageReserveFraction=0.00` (scenarioCode 7,
i.e. arm B's shelter file through the new code path) was diffed against archived arm B
seed 42, excluding `sim_id`, `commit`, `data_version` and `scenario` (the scenario label
is the only intended difference):

```
B-seed42/agents.csv vs D-seed42-r00/agents.csv -> IDENTICAL, 6842 rows, 0 differing
```

Arm D is arm B plus the intake rule and nothing else. Confirmed at the row level.

---

## 4. The sweep

Reserve 0.10 / 0.15 / 0.25 at seed 42; 0.10 and 0.15 also at seeds 43 and 44.
"ML" = mobility-limited (n = 1,360 of 6,842); "gap" = unimpaired access − ML access, in
percentage points. Runs archived in `docs/runs/scenario-d-2026/` and
`Geography/output/D2026-n6842-seed*-r*/`.

### Seed 42

| run | reserved spaces | sheltered | total access | ML access | unimpaired access | gap (pp) | ML outside |
|---|---|---|---|---|---|---|---|
| A (reality) | — | 2,060 | 30.1% | 19.7% | 32.7% | 13.0 | 1,092 |
| B (capacity = demand) | 0 | 6,264 | 91.6% | 71.9% | 96.4% | 24.5 | 382 |
| C (ten new sites) | 0 | 6,570 | 96.0% | 85.7% | 98.6% | 12.8 | 194 |
| **D, reserve 0.00** | 0 | 6,264 | 91.6% | 71.9% | 96.4% | 24.5 | 382 |
| **D, reserve 0.10** | 667 | 6,264 | 91.6% | **92.1%** | 91.4% | **−0.6** | **108** |
| **D, reserve 0.15** | 1,011 | 6,088 | 89.0% | **99.8%** | 86.3% | −13.5 | **3** |
| **D, reserve 0.25** | 1,701 | 5,523 | 80.7% | 99.8% | 76.0% | −23.8 | 3 |

### Three-seed means (42, 43, 44)

| arm | total access | ML access | unimpaired access | gap (pp) |
|---|---|---|---|---|
| A | 30.1% | 20.1% | 32.6% | 12.5 |
| B | 91.5% | 72.0% | 96.5% | 24.4 |
| C | 96.0% | 85.7% | 98.6% | 12.9 |
| **D, reserve 0.10** | **91.5%** | **91.4%** | 91.5% | **0.1** |
| **D, reserve 0.15** | 89.1% | 99.7% | 86.4% | −13.3 |

Per-seed detail at reserve 0.10 — seed 42: 6,264 / 92.1 / 91.4 / −0.6. Seed 43:
6,259 / 91.6 / 91.5 / −0.1. Seed 44: 6,260 / 90.6 / 91.7 / +1.1.

True three-seed *count* means (quote these, not the seed-42 counts in the
tables above): B and D-r10 sheltered 6,261 (per-seed 6,264 / 6,259 / 6,260,
identical in B and D-r10); B ML outside 387.3; D-r10 ML outside 119.0; D-r15
sheltered 6,096.

**Best value = 0.10.** It is the Pareto point: total sheltered is *unchanged from arm B
to the person* at all three seeds (6,264 / 6,259 / 6,260 in both), and the final-state
counts are identical too (seed 42: 6,264 SHELTERED, 562 REFUSED_ALL_FULL, 16
UNREACHABLE, in B and in D-r10 alike). The same number of people get in; a different
274 of them are the ones who needed it. Nothing is built, nothing is moved, nothing is
spent.

Reserve 0.15 is the *equity-maximising* value, not the best: it drives ML access to
99.7%, at which point the only mobility-limited residents still outdoors are the 3–5 who
**cannot reach any shelter on the street graph at all** (final state `UNREACHABLE` —
verified, `D-seed42-r15`: all 3 remaining are UNREACHABLE). Triage has then done
everything it can do. But it costs ~170 non-mobility-limited people their beds, because
reserved spaces sit empty at sites the slow walkers never reach. That is a real
trade-off and must be reported as one, not hidden.

Reserve 0.25 is strictly worse than 0.15 on every axis: ML access no longer improves
(99.8% either way) and 565 more people end up outdoors.

---

## 5. Verdict: does changing the intake rule match or beat building ten shelters?

**On the equity objective the paper itself foregrounds, D beats C outright — for free.**

| objective | B (do nothing new) | C (ten new facilities) | D at 0.10 (no construction) |
|---|---|---|---|
| Mobility-limited access | 72.0% | 85.7% | **91.4%** |
| Access gap | 24.4 pp | 12.9 pp | **0.1 pp** |
| Total access | 91.5% | **96.0%** | 91.5% |
| Capital cost | none | ten new facilities | **none** |

- **D wins on who it reaches.** 91.4% vs C's 85.7% mobility-limited access, and the gap
  closes to statistical nothing (0.1 pp) rather than C's 12.9 pp. Building ten optimally
  sited shelters *halves* the disparity; rewriting one intake rule *eliminates* it.
- **C wins on how many it reaches.** 96.0% vs 91.5% — 306 more people sheltered per
  run. Triage cannot manufacture reachable doors; only C's new sites do that.
- **They are not substitutes and they are not rivals.** C fixes a geography problem
  (there is no door near enough). D fixes an allocation problem (the door was near
  enough but someone faster got there first). Nothing prevents applying D's reserve on
  top of C's sites — that combination was not run here and is the obvious next test.

**The critique's core charge is sustained.** A zero-cost administrative change matches
arm B on total coverage while delivering better mobility-limited access than ten new
buildings, and the paper currently mentions it only as a limitation. It belongs in the
results and in the recommendation, not in a bullet. The honest framing is: *capacity
without an intake rule is still not access, and the intake rule is the cheapest thing in
the study.*

---

## 6. Limitations of scenario D — stated, not tuned away

1. **The reserve is a blunt instrument, deliberately.** A flat per-site fraction is not
   how a real shelter triages; it is the simplest rule that could not be accused of being
   fitted to the outcome. No optimisation over the fraction beyond the three values
   swept was performed.
2. **Perfect identification of need is assumed.** The model knows exactly who is
   mobility-limited. A real intake desk does not, and cannot hold a bed for someone who
   may never arrive without a reservation system that does not currently exist.
3. **Held beds can go unused.** That is the entire mechanism of the loss at 0.15 and
   0.25, and it is a real operational risk, not a modelling artefact.
4. **The priority class is a sampled attribute**, drawn from the 0.192 PIT 2019 lower
   bound (`PopulationSampler`); its realised share is 0.199 at seed 42. If the true
   share is higher, the optimal reserve is higher.
5. **Three seeds, not nine.** Arms A/B/C carry nine seeds each. D at 0.10 and 0.15
   carries three (42–44) and D at 0.00/0.25 carries one. The seed-to-seed spread at
   reserve 0.10 (gap −0.6 / −0.1 / +1.1) is small, but the arm is not yet at parity with
   the published arms and should not be quoted as if it were.

## 7. Reproduce

```
python scripts\make_batch_params_d_2026.py 42:0.10 43:0.10 44:0.10
powershell -File scripts\run-headless.ps1 -ParamsFile "batch\batch_params_2026_D_seed42_r10.xml"
```

Runs above were executed in an isolated copy of the project directory because a
concurrent batch was writing the same `output\run_seed42` path; the code, data
(junctioned) and parameter files were identical, and `simulation.json`
`reproducibility.input_datasets` checksums match arm B's inputs exactly.
