# Response to the external critique

Date: 2026-07-28. Branch: `phase2/human-agent-modeling`.

Every claim below was checked against the repository. Supporting detail, with the
commands used, is in `01-arithmetic.md` through `08-scenario-D.md` in this
directory. Two new experiments (C-random control, scenario D) and two new exact
computations (assignment upper bound, multi-scale equity) were run to settle
questions the critique raised that the existing runs could not answer.

Counts: **19 confirmed defects**, **11 refuted or overstated claims**, **4 new
results**.

---

## 1. Bottom line

- **Scenario C's headcount advantage is not caused by optimisation.** A matched
  control that places ten shelters *at random* from the same 498-node candidate
  set the p-median searched reproduces C's sheltered count exactly — 6,570 /
  6,565 / 6,566 at seeds 42/43/44, identical to C at every seed. The B→C gain of
  +306 decomposes as 100% dispersion, 0% optimisation. What optimisation buys is
  walking distance (−9,470 m, all of it) and about 5% of the exposure reduction.
  "Same beds, better places" is wrong for access; it is right for distance.

- **The model is already at the exact coordination optimum in headcount.** A
  hand-written min-cost max-flow over the network as the model routes it gives B
  6,260 and C 6,566 — the numbers the model achieves. Coordination shortfall is
  exactly 0 in all 18 B and C runs. The critique's charge that agent myopia
  explains C's advantage is wrong. Its separate charge that myopia costs walking
  distance is right: an optimal dispatcher cuts mean walk 39% (B) / 41% (C).

- **The street network has a defect that produces several headline numbers.**
  `Streets.shp` splits into 154 components, but the second-largest holds 28,407
  nodes (31.8% of the graph), not "small fragments", and *that* is the component
  the model routes on — 33 of 36 arm-A shelters and 3,382 of 3,400 campsite rows
  snap to it. Three east-county shelters snap to the giant component instead and
  are unreachable by essentially everyone: Gresham_Womens_Shelter has
  `peak_occupancy 0` in A, B and C. The two components physically interpenetrate
  (194 cross-component node pairs within 1 m; closest pair identical
  coordinates). B's 578 empty beds and the 16 unreachable residents are both
  artefacts of this.

- **The "578 empty beside 562 turned away" framing is a tautology and is
  presented as a finding in three places.** The chapter already says this
  (`Capacity_Is_Not_Access.tex:680-689`, "equal by arithmetic, not by
  discovery"). `README.md:48`, `SUBMIT.md:215` and
  `presentation/index.html:621` ("This is the finding") do not. Same pattern for
  the in-sample fitting of C: honest in the chapter, absent everywhere else.

- **Seed ranges are not uncertainty.** Seeds vary only the population draw;
  shelters, PM2.5, network and parameters are fixed, and population attributes
  are identical row-for-row across arms within a seed. C−B = exactly 306 in all
  nine seeds, sd = 0.00. The "28× signal-to-noise" claim at
  `presentation/index.html:652` is vacuous — the noise is 100% common-mode and
  cancels out of every between-arm contrast by construction.

- **A no-cost intake rule beats ten new shelters on equity.** Scenario D
  (reserve 10% of each facility's capacity for mobility-limited arrivals) holds
  total sheltered identical to B to the person at all three seeds while lifting
  mobility-limited access from 72.0% to 91.4% and collapsing the gap from 24.4
  pp to 0.1 pp. It does not reach C's total coverage; the two fix different
  failures.

---

## 2. Confirmed defects

Ordered by how much each changes a published claim.

### D1. C's access gain is attributed to placement quality; it is dispersion

**Published claim.** `PRESENT_DAY_THREE_ARM_RESULTS.md:60-63`,
`Capacity_Is_Not_Access.tex:692`, `README.md:43`,
`presentation/index.html:728`: C spends the identical 6,842 beds and shelters
306 more people, refusals halve, empty beds halve — attributed throughout to
p-median siting.

**Evidence.** Two controls were run. `C-random BBOX` (ten sites uniform over the
county bounding box) shelters 3,075 of 6,842 (44.9%) and fills 17 of 3,492 new
places — bad siting is destructive, so the box control is a strawman. The
matched control `C-random POOL` draws ten sites uniformly from exactly the
498-node candidate set the p-median optimiser searched (verified: all ten of C's
chosen sites are members of that set). Result, three independent draws × three
seeds, nine runs:

| | B | C-random POOL | C (p-median) |
|---|---|---|---|
| Got inside | 6,261 (91.5%) | 6,567 (96.0%) | 6,567 (96.0%) |
| Turned away | 559 | 253 | 253 |
| New sites filled | — | 3,492 / 3,492 | 3,492 / 3,492 |
| Mean walk (all) | 7,987 m | 14,913 m | 5,443 m |
| Mean dose µg·m⁻³·h | 4,813 | 2,504 | 2,383 |

The sheltered counts match run-for-run (6,570 / 6,565 / 6,566), from three
shelter files with different SHA-256s whose mean walks differ by ~3,500 m. Once
ten ~350-bed doors exist anywhere built-up they saturate. Decomposition of B→C:

| | total | dispersion | optimisation |
|---|---|---|---|
| Got inside | +306 | +306 (100%) | 0 (0%) |
| Mean dose | −2,430 | −2,309 (95%) | −121 (5%) |
| Mean inhaled | −1,526 | −1,329 (87%) | −197 (13%) |
| Mean walk | −2,544 m | **+6,926 m worse** | −9,470 m (all) |

A reproduction control (`VERIFYB` / `VERIFYC-n6842-seed42`) re-ran B and C from
the same build as the controls and matched the archived numbers exactly, so this
is not confounded by the concurrent `GisAgent`/`Shelter` edits.

**Required fix.** Stop attributing the 96% / halved refusals / halved empty beds
to optimal placement. The access claim becomes "same beds, more doors". The
placement credit moves to walking distance (−28.3%, entirely optimisation) and
to about 5% of the exposure reduction. Report the POOL control as a named
control arm in the results table — it is the strongest single result in this
response and it is a null.

Files: `07-c-random.md`, `scripts/build_scenario_crandom_pool_2026.py`, runs
`Geography/output/CP2026r4..6-n6842-seed{42,43,44}`.

---

### D2. The street network splits into two large components and the model routes on the smaller one

**Published claim.** `PRESENTER_SCRIPT.md:300`: "The main piece holds 60,444 of
the 89,322 intersections; the rest are small fragments. That is why 16 people in
every scenario cannot reach any shelter at all."

**Evidence.** Component sizes: 60,444, **28,407**, 19, 12, 12, 11, 11, 9, 8, 8,
8, 7, … The second component is 31.8% of the graph. 28,901 nodes (32.35%) are
off the giant component and 28,407 of them are that one component, so "the rest
are small fragments" is false. Worse: 33 of 36 arm-A shelters and 3,382 of 3,400
campsite rows snap to the 28,407-node component (Portland core, lon
−122.84…−122.47). The model does not route on the component the document names.

The three shelters that snap to the giant component instead —
`Gresham_Womens_Shelter`, `Rockwood_Bridge_Shelter`, `Stark_Street_Motel_Shelt`
— strand 196 / 600 / 294 spaces in A / B / C. Confirmed in output:
`Gresham_Womens_Shelter` has `peak_occupancy 0`, `utilization 0.0000` in all
three arms, the only zero-occupancy shelter in every arm. B's 578 empty beds sit
at exactly three east-county sites (Gresham 276, Rockwood 156, Stark 146); the
other 33 finish 100% full.

This is a data defect, not geography. The two components spatially
interpenetrate: 194 node pairs from different components lie within 1 m of each
other, the closest pair at 0 m with identical coordinates. `StreetNetwork` welds
endpoints by `PDX_F_NODE`/`PDX_T_NODE` attribute id, so physically touching
features with inconsistent ids are never joined. 52 welds fix it
(`scripts/analysis/upper_bound.py --weld-m 1.0`).

Node count in docs is also stale: 89,322 published, 89,345 measured;
`01-arithmetic.md:279` already says 89,345, so the docs are self-inconsistent.

**Required fix.** Correct the component description everywhere. State that three
facilities are unreachable in all arms and that their capacity is stranded.
Decide whether to repair the graph and re-run; if not, the empty-bed and
unreachable numbers must be labelled as network-topology artefacts, not
geography results. Effort: the description fix is an hour; the repair-and-re-run
is a week including re-verification of the manifest chain.

Files: `03-data.md` items 10-18, `05-upper-bound.md`.

---

### D3. "578 empty beside 562 turned away" is a tautology presented as the finding

**Evidence.** Capacity is exactly 2,234 (A) and exactly 6,842 (B, C). When
capacity equals population, `empty = cap − sheltered = n − sheltered = outside`
identically. The identity holds in 18/18 B and C runs and fails in 9/9 A runs
(empty 174–181 vs outside 4,778–4,789), which is what an identity that depends
on cap = n looks like. The 578-vs-562 gap is the 16 unreachable, restated.

The chapter handles this correctly at `Capacity_Is_Not_Access.tex:680-689`:
"Those totals are equal by arithmetic, not by discovery … The near-equality
proves nothing on its own." Three downstream documents do not:

- `README.md:48` — "**Scenario B leaves 578 spaces empty while turning 562
  people away.**"
- `docs/chapter/SUBMIT.md:215` — same sentence, listed as finding 1 of 2.
- `docs/final/presentation/index.html:621` — "**This is the finding.** … Those
  numbers are nearly equal."

**Non-tautological content does exist and is unreported:** all 578 empty beds
sit at three east-county sites; the other 33 facilities finish 100% full. That
is a spatial statement and it is the real one. It is also D2 restated.

**Required fix.** Replace the sentence in all three places with the chapter's
version plus the three-site concentration. Effort: 30 minutes.

---

### D4. Seed ranges are printed where confidence intervals belong

**Evidence.** Seeds vary only the population draw. Shelters, the PM2.5 field,
the street network and all parameters are fixed across seeds. Population
attributes are identical row-for-row across arms within a seed (6,842 / 6,842
match, checked at seeds 42, 43, 44). Consequence: **C−B = exactly 306 in all
nine seeds, sd = 0.00**, and every arm's seed-deviation vector is the same
`[+4, −1, 0, −1, −3, −3, −3, +8, −1]`. The between-arm noise is 100%
common-mode and cancels exactly.

`presentation/index.html:652`: "The between-arm signal is roughly **28×** the
within-arm noise, and **no range overlaps between arms on any headline
metric**." The arithmetic is right (306/11 = 27.82) and the statement is
uninformative — it cannot be otherwise given the design.

**Required fix.** State plainly that the nine seeds are a determinism and
sampling-stability check, not an uncertainty estimate, and that between-arm
differences carry no seed variance by construction. Stop printing `[low–high]`
brackets in the position a CI would occupy, or label them "range over
population draws" in the table header. Effort: 1 hour.

---

### D5. The exposure table has two inputs and six algebraic restatements

**Evidence.** `hours_above_unhealthy` is exactly 194.000 for every unsheltered
agent in all 27 runs — zero variance. Sheltered mean is 0.55–1.26 h. Per-agent
`R²(cumulative_dose ~ hours) = 0.99921–0.99998` with slope 278.16–278.69
across the 27 runs, bracketing 54002.8192 / 194 = 278.365, a fixed constant. `R²(hours ~ binary got-inside) =
0.9984–0.99996`. `inhaled_dose / hours` = 172.2 / 174.4 / 177.7 — this is the
critique's "~175". `vwe_ugm3h` is byte-identical to `cumulative_dose`, a third
copy of the same column. Person-hours = 6,842 × mean hours exactly
(928,933.75 / 6,842 = 135.769). A regression over the 27 runs of
`mean_hours ~ unsheltered_share + mean_walk` gives R² = 0.99999987, max residual
0.078 h.

The critique said 7 rows; the table has 11 — 2 inputs, 3 primitives (got inside,
couldn't reach, average walk), 6 algebra. Its check
`0.301×4 + 0.699×194 = 136.81` used 4 h where the true sheltered mean is 0.595 h;
the correct arithmetic `0.3011×0.595 + 0.6989×194 = 135.769` reproduces the
published figure exactly. The 4 h term is wrong and immaterial.

**Required fix.** Collapse the exposure block to its two inputs and mark the
rest as derived, or drop `vwe_ugm3h` entirely and footnote the constant
174 µg per hour outdoors. Do not present four exposure rows as four results.
Effort: 2 hours including figure regeneration.

---

### D6. The equity headline is seed-42 only, and the inverted U holds on one scale of five

**Evidence.** `PRESENT_DAY_THREE_ARM_RESULTS.md:123`,
`Capacity_Is_Not_Access.tex:762` and `README.md:54` print 13.0 / 24.5 / 12.9.
Those are seed-42 values, not nine-seed values, and are not labelled as such.
Pooled over nine seeds (n = 61,578 per arm), mobility-limited vs unimpaired:

| Scale | A | B | C | A→B |
|---|---|---|---|---|
| Gap, pp (Newcombe 95% CI) | 12.54 [11.72, 13.34] | 24.31 [23.51, 25.12] | 13.40 [12.78, 14.03] | widens |
| RR left outside (Katz) | 1.19 [1.17, 1.20] | 7.85 [7.43, 8.28] | 11.28 [10.33, 12.31] | widens |
| OR left outside (Woolf) | 1.93 [1.84, 2.02] | 10.49 [9.86, 11.16] | 13.05 [11.90, 14.31] | widens |
| N mobility-limited outside / run | 1,114.8 | 388.6 | 205.0 | **falls 65%** |
| Share of outside who are mob-ltd (Wilson) | 23.29% [22.90, 23.69] | 66.76% [65.47, 68.03] | 74.28% [72.52, 75.96] | widens |

The published inverted U (13.0 → 24.5 → 12.9) holds on **scale 1 only**. On RR,
OR and composition, C is significantly *worse* than B — non-overlapping CIs. The
paper reports one scale and reads a shape off it.

Second defect in the same section: `Capacity_Is_Not_Access.tex:746-748` rebuts
the ceiling objection using the *access-rate* ratio (1.66 → 1.34 → 1.15). That
ratio is mathematically compelled to approach 1.00 as coverage approaches 100%,
so it cannot bear the weight placed on it. The complement ratio from the same
table runs 1.19 → 7.85 → 11.28. This is a defect in our rebuttal, not in the
critique. COPD is the cleanest demonstration: it reverses sign on pp (8.32 →
5.43 → 2.14, gap *narrows* in B) while widening on RR, OR and share.

**Required fix.** Report all five scales, drop the inverted-U reading unless
restricted to the pp scale and stated as such, and replace the access-rate-ratio
rebuttal with the complement ratio. Label 13.0 / 24.5 / 12.9 as seed-42 or
replace with the pooled 12.54 / 24.31 / 13.40. Effort: half a day.

Files: `06-equity-scales.md`, `scripts/analysis/equity_scales.py`.

---

### D7. The calibration bound is censored and understates by roughly 10×

**Evidence.** The historical reference run fills 198 of 198 beds against an
observed ~130, and this is reported as a **1.52× over-prediction** in five
places: `TECHNICAL_REFERENCE.md:2130`, `CLAIM_VALIDATION_AUDIT.md:119`,
`FINAL_DATA_VALIDATION_REPORT.md:307`, `presentation/index.html:726`,
`SUBMIT.md:227`. The measurement is censored at the ceiling: both facilities hit
utilization exactly 1.0000 (CJ 99/99, OCC 99/99). Final states of the n = 2,037
histref run: SHELTERED 198, REFUSED_ALL_FULL 1,824, UNREACHABLE 15.
**Unconstrained demand at those two sites is 2,022 agents — 99.3% of the
population — against a 198-bed ceiling.** The over-prediction bracket is
therefore 1.52× (censored) to 15.6× (uncensored). 1.52× is the value a
saturated meter reports, not a bound on the awareness assumption.

**Required fix.** Report the bracket, not the point. The sentence "Every access
figure is an upper bound" survives and is strengthened; the 1.52× number does
not. Effort: 1 hour to reword five locations, plus a decision on whether to
re-run histref with capacity relaxed to expose the true demand ratio.

Incidental, same run: `histref-n2037-seed42/simulation.json` logs
`scenarioCode=2` with `scenario=HISTORICAL`. That was self-consistent at commit
`02c3181` (code 2 → HISTORICAL) but current code maps 2 → arm C. Re-running the
calibration today needs `scenarioCode=3`.

---

### D8. The admission arbiter is specified, dismissed, and load-bearing

**Evidence.** Admission is shuffle-within-tick, FCFS-across-ticks:
`GisAgent.java:173` (no `shuffle` attribute) with inline `admit()` at
`GisAgent.java:301`. `minutesPerTick = 1.0` (`parameters.xml:23`) sets the
tie-group size. The needs-based arbiter was specified and dismissed at
`08-ENGINEERING.md:110-118` as "never binds at n=50". At n = 6,842 it binds
hard — scenario D below shows a 10% reserve moves mobility-limited access 19.4
pp. A-16 (order-dependent admission) is one of the four blocking assumptions in
the registry.

The dependence is disclosed at `Capacity_Is_Not_Access.tex:875` and
`presentation/index.html:756`, and is **absent from**
`PRESENT_DAY_THREE_ARM_RESULTS.md` and `README.md` — the same inconsistent
propagation as D3.

**Required fix.** Carry the conditional-on-FCFS caveat wherever the equity gap
appears, and cite scenario D as the counterfactual. Effort: 1 hour.

---

### D9. Agents have exact global real-time vacancy knowledge; this is nowhere disclosed

**Evidence.** `GisAgent.java:348` calls `hasSpace()` on the global shelter set at
every re-plan, and `GisAgent.java:343` runs Dijkstra over the full graph. Agents
never travel to a facility that is full at decision time. This is not listed as
a limitation in any document. It flatters B and C, where the binding constraint
is finding a facility with space; A is less affected because capacity binds
everywhere.

**Required fix.** Add as a stated assumption with its direction of bias. Effort:
30 minutes. Note that the upper-bound computation (§4) shows the *headcount*
consequence is nil — the model is already at optimum — so the honest framing is
"perfect information, and we show it does not create the headcount result".

---

### D10. `SHELTERED` is absorbing — zero bed turnover across 312 hours

**Evidence.** No write leaves the `SHELTERED` state (`GisAgent.java:260`;
writes at `:233, :253, :302, :317, :367, :369` do not target it), and
`Shelter.java:71-86` has no decrement. Combined with a single departure tick
(`GisAgent.java:232` + `parameters.xml:48`, all 6,842 agents depart at tick 960)
this means every bed is claimed in the first ~26 simulated hours and held for
the remaining 286. Real facilities cycle.

This interacts with D9: perfect vacancy knowledge plus zero turnover plus
simultaneous departure is a single instantaneous global assignment, which is
exactly why the model sits at the min-cost-flow optimum.

**Required fix.** State as a limitation. It is partially covered by A-02
(`TECHNICAL_REFERENCE.md:2334`) for the departure time but not for the absorbing
state. Effort: 30 minutes.

---

### D11. Scenario C is fitted in-sample; the caveat does not propagate

**Evidence.** `build_scenario_c_2026.py:33, 76-83` reads the demand surface
directly from `B2026-n6842-seed42/agents.csv` `start_lon` / `start_lat` — the
recorded coordinates of the same 6,842 residents C is then evaluated against, on
the same street graph, with the same 16 unreachable agents. The objective is
`min Σ d(c,n)·t_n + 60000·unused_beds` (`build_scenario_c_2026.py:154-163`); the
objective is never written out in any published document and the 60,000
unused-bed penalty is an undocumented magic number that forces the ~349-bed
mega-sites.

**Where the critique overreaches:** it calls this unreported. It is the *first*
limitation in the chapter, `Capacity_Is_Not_Access.tex:861-866`, stated more
bluntly than the critique states it and drawing the same upper-bound conclusion.
The defect is inconsistent propagation: `PRESENT_DAY_THREE_ARM_RESULTS.md`,
`README.md`, and the `"limitations"` array in
`docs/runs/scenario-c-2026-new-sites/scenario_c_report.json` all carry the 96.0%
without it.

**Required fix.** Editorial: repeat the chapter's sentence wherever the C-vs-B
gap appears, and print the objective function including the 60,000 penalty.
Scientific, if wanted: re-run the optimiser against a held-out or perturbed
campsite draw. Note that D1 substantially reduces the stakes — since the
headcount gain is dispersion, not fit, in-sample fitting can only have inflated
the *distance* gain. Effort: editorial 1 hour; hold-out re-run 2 days.

---

### D12. Registry gate accepts any non-empty string; one live class-M variable has no citation anywhere

**Evidence.** `ScienceRegistry.java:177-180` rejects only `doi.isEmpty() ||
"none".equals(doi)`. No DOI regex, no URL check, no cross-reference to
`DATA_SOURCES.md` anywhere in the codebase. Any string passes.

The hole is exercised by **V22 `chronic_physical`**: class M, source "Pathways
Study 2026", `doi_or_dataset = D10` — but D10 is the 2019 PIT count, a different
dataset. Pathways appears in no `DATA_SOURCES.md` entry and no `BIBLIOGRAPHY.md`
entry, and `Capacity_Is_Not_Access.tex:366` carries a literal
`[Pathways Study 2026 - full citation to be confirmed]` in a published table.
A live class-M variable with no citation anywhere, passing a gate that claims to
stop exactly this.

Minor, same class: V-STARTLOC points at `D2b`, which is a paragraph headed "GAP"
(`DATA_SOURCES.md:107-111`). V20 (`class M`, `variables.csv:24`) has cell
`D10 + D11` and no resolvable id in either the registry or `DATA_SOURCES.md`
D11 (`:297-306`).

**Registry drift, unraised by the critique.** All 27 archived manifests record
`variables.csv` sha `1bf27ac4…`, count 28, census M12/L6/A10. The working tree
is `df1b5808…`, count 29, M13. V22 was added by commit `3bf833f` (2026-07-28),
*after* the runs — yet `chronic_physical` is already column 43 of their
`agents.csv`. During all 27 archived runs a live class-M variable had no
registry row at all, violating `REGISTRY_SCHEMA.md:115-116`. The gate cannot
catch this, and the coverage test promised at `REGISTRY_SCHEMA.md:117-119` does
not exist.

**Required fix.** (a) Resolve the Pathways citation or reclassify V22 and re-run;
(b) implement the coverage test; (c) add a format check on `doi_or_dataset` and
a cross-reference to `DATA_SOURCES.md`; (d) correct
`presentation/index.html:841-842`, which says "resolvable DOI" — the gate does
not test resolvability, and `REGISTRY_SCHEMA.md:38, 53-56` also permits dataset
ids, which that sentence drops. `TECHNICAL_REFERENCE.md:25-26` is accurate
except for the same word "resolvable". Effort: (d) 30 minutes, (b)+(c) 1 day,
(a) depends on whether the Pathways citation exists.

---

### D13. The blocking-assumption criterion is a definition, not a test

**Evidence.** 26 assumption rows, 4 blocking — A-04 (99-bed capacity
unconfirmed), A-09 (susceptibility weights inert), A-12 (universal awareness),
A-16 (order-dependent admission) — matching `simulation.json:87`. The criterion
is stated as a definition only, at `REGISTRY_SCHEMA.md:78` and
`ScienceRegistry.java:280`: "must be resolved before publication". Nothing
decides membership. A-03, A-18 and A-19 are load-bearing and marked `active`.

**Required fix.** Either state the membership rule and apply it, or drop the
claim that the blocking set is principled. Effort: 2 hours.

---

### D14. `analyze_run.py` check count in the docs is stale by a factor of three

**Evidence.** The verifier runs `32 + 2n` checks: **104** for arm A (36 sites)
and **124** for arm C (46) — `analyze_run.py:150, 153`. Documents say `37/37`,
which is `32 + 2×2`, the 2020 two-shelter configuration. Additionally, "check
#38" is not a check: `analyze_run.py:208-252` returns a dict and never calls
`ck.add`; it is attached at `:726`. It is referred to as a check in four places.

This does not move a scientific number, but "37 of 37 checks passed" is a false
verification claim in a document whose purpose is verification.

**Required fix.** Regenerate the counts from the script. Effort: 1 hour.

---

### D15. Population attribute gradient claims precision the source cannot support

**Evidence.** `PopulationSampler.java:87-88` hardcodes 0.152163 / 0.347802 — six
significant figures — derived from a two-significant-figure California ratio
(~2.29, `:81`) pinned to a three-figure lower-bound marginal. Line 266 of the
same file declines to fit a within-band age curve on the stated grounds that "a
curve would manufacture precision". `PopulationSampler.java:83` calls the
gradient "class A"; `variables.csv:24` labels the row M.

**Required fix.** Round to the precision of the source and reconcile the class
label. Effort: 1 hour plus re-run.

---

### D16. Several small factual claims in the presenter script are wrong

- `PRESENTER_SCRIPT.md:99`: "EPA sets its own Wildfire — U.S. qualifier flag on
  1,576 rows of this file, and those rows span exactly this window. The agency
  itself certifies that this is wildfire smoke." Correct on the count and the
  span, but only **526** of those rows are Multnomah. `SmokeField.java:54`
  filters to Multnomah, so 1,050 of the 1,576 never reach the model. The
  sentence implies the 1,576 certifies the model's input.
- `PRESENTER_SCRIPT.md:177`: "we de-duplicate to distinct places" is **false** —
  no de-duplication exists anywhere in `ContextCreator`.
  `ContextCreator.java:288-290` draws uniformly over the 3,400 CSV *rows* with
  replacement, which is implicitly report-frequency weighting. The file has
  3,400 rows, 3,317 distinct (lon,lat), 2,492 distinct snapped graph nodes.
  Duplicates explain only 83 of the 419 shortfall from 3,400 to 2,981; sampling
  explains 336 (coupon-collector predicts 3,400·(1−e^−2.012) ≈ 2,945).
- "2,981 distinct campsite points" is stated as a property of the data file. It
  is a sampling outcome of one run: `A2026-seed42/agents.csv` has 2,981 distinct
  `starting_encampment` and 2,918 distinct start coordinates.
- Coordinate-level report weighting is negligible (3,244 points ×1, max ×4), but
  **node-level multiplicity runs to ×7** (1,861 ×1, 432 ×2, 144 ×3, 40 ×4, 8 ×5,
  6 ×6, 1 ×7), and the p-median demand surface is row-weighted over those 2,492
  nodes. This is the version that matters for D11.

**Required fix.** Correct all four. Either implement de-duplication or state
that placement is report-frequency weighted and defend it. Effort: 2 hours for
the text; a day if de-duplication is implemented and everything re-run.

---

### D17. "16 could not reach any shelter" is the one row where seeds carry information, and it is quoted as a point estimate

**Evidence.** The cross-arm identity is confirmed 9/9 seeds. But 16 is the
seed-42 value: the **range is 14–25, mean 19.1**, and 16 occurs in only 3 of 9
seeds. At 79% relative spread this is the largest relative seed variation of any
headline count — compare 0.2–0.5% for "got inside". The results table at
`PRESENT_DAY_THREE_ARM_RESULTS.md:63` correctly shows `16 [14–25]`. The
narratives quote the bare 16: `TECHNICAL_REFERENCE.md:2077-2083`,
`presentation/index.html:654-656`.

**Required fix.** Quote 19 [14–25] in narrative. Effort: 15 minutes.

---

### D18. All opening-date gating is a no-op in A, B and C

**Evidence.** All 36 / 36 / 46 rows in the three 2026 shelter CSVs carry
`opened=2020-09-07`, `closed=2020-09-19`, `status=operating`, with no variation.
`SIM_START = 2020-09-07T00:00` (`ContextCreator.java:111`), so
`opened=2020-09-07` is tick 0. `respectShelterOpeningDates=1` in all 27
manifests, and the gate never fires. The real 2020 dates (OCC 09-10, CJ 09-11)
exist only in `shelters_2020-09.csv`, loaded solely by the histref run. Any
document claiming the three-arm runs model the three-day opening delay is wrong.

**Required fix.** Correct the claim, or populate real opening dates in the 2026
files and re-run. The presenter script's "they opened on the 10th and 11th.
Three days later" (`PRESENTER_SCRIPT.md:101`) is true of 2020 and not of the
model's A/B/C. Effort: text 30 minutes.

---

### D19. The chronic-condition equity row shows a contrast that does not exist

**Evidence.** "Long-term physical condition" vs everyone is indistinguishable
from noise in **all three arms**: +0.09 pp [−1.93, +2.15] (A), −0.48 pp
[−1.77, +0.75] (B), −0.23 pp [−1.16, +0.62] (C). It is printed in an equity
table alongside rows that do show real gaps, which implies a contrast. Same
issue for COPD − asthma in C (−1.98 pp [−4.24, +0.11]).

Related, and this one the critique got right: 65+ is n = 353, Wilson 95% CI
half-width ±4.3 pp in arm A. Publishing "22.4%" overstates the resolution; the
honest range is 18–27%. The mobility, 65+ and vulnerable gaps are real in all
arms.

**Required fix.** Drop the chronic-condition row or mark it null. Round 65+ to
one figure with its CI. Effort: 1 hour.

---

## 3. Refuted or overstated

The critique is high quality and most of it survives. These do not.

**R1. "Myopic agents explain C's advantage."** Refuted, decisively. Min-cost
max-flow over the network as the model routes it, both solvers hand-written
(Dinic max-flow, successive-shortest-path min-cost; `networkx` and `scipy` are
not installed), all 18 solutions certified optimal (flow = max-flow, worst
residual cycle +0.000 m). B optimum **6,260** vs model 6,260; C optimum
**6,566** vs model 6,566. **Coordination shortfall is exactly 0 in all 18 runs,
min 0 max 0.** Independently confirmed: every main-component shelter is at
100.00% utilisation in both arms, so there is no free reachable space for a
dispatcher to use. Myopia explains none of the headcount result.
(`05-upper-bound.md`, `scripts/analysis/upper_bound.py`.)

**R2. "Repair the network and both arms reach 99.8%, so C's advantage
vanishes."** The arithmetic is correct and should be conceded: with the graph
welded, both arms reach 6,826 (99.77%), identical. The conclusion does not
follow. That optimum is purchased by assigning walks of up to 61.6 km, possible
only because the 312-hour episode makes the time budget vacuous (430,716 m
budget; `time_budget_binds = false` in all 18 runs). Impose any realistic
distance cap and repair makes no difference, because the stranded shelters are
30–60 km out. **At a 5 km cap the optimal gap is B 5,235 vs C 6,148 = +913
residents, 13.3 points — three times the model's 306.** C's advantage widens
under optimal dispatch with a realistic cap.

**R3. "Capacity alone widens the gap on only 1 of 4 scales."** Wrong. It holds
on **4 of 5** scales for mobility-limited and for 65+, and 3 of 5 for COPD. The
scale it fails on is scale 4 (absolute count of mobility-limited left outside),
which falls 65% — and that is the scale a county procures on, so it deserves to
be stated, but "1 of 4" understates the result. Separately, the critique's own
scale-5 figure for C ("72%") is our seed-42 value; pooled over nine seeds it is
74.3%, so the critique understates its own point.

**R4. "`MAX_RETARGETS = 8` binds in arm A and drives the 18.3 km mean walk."**
Refuted. The cap is set at `GisAgent.java:125`. **Zero of 6,842 agents hit it in
any of the nine A runs**; maximum observed `door_refusals` is 5–6. A's mean walk
of 18,260.5 m is 3.539 legs × 5,149 m per leg — driven by refusals, not by the
cap. The critique's supporting arithmetic (`8 × mean inter-shelter distance`) is
also off by 3.8×: the true figure is 8 × 8,655 m = 69,240 m.

**R5. "`retargetCount` resets on re-entry, so refusals are under-reported."**
**Confirmed — and the first version of this paragraph was wrong.** The reset is
real (`GisAgent.java:254`) and the refused-then-retry path **does execute** in
reported runs. The earlier claim that it is unreachable rested on seed 42 alone
— the same seed-42-as-global error this response criticises elsewhere. At
seed 42 the identity `Σ agents.door_refusals == Σ shelters.refused_count` holds
exactly (A 17,373; B 8,292; C 6,775), but in C-seed44 and C-seed49 it breaks by
exactly 18 each: two retarget-cap re-entries per run, and both re-entrant agents
later shelter at Bybee Lakes with `door_refusals` reset to 0. Every arm-D
r10/r15 run shows a deficit of 9–63. No published C headline metric changes —
the re-entrants are already counted in the published sheltered totals. The
documented caveat that `door_refusals` under-reports refusals is therefore
correct and is restored; the earlier version of this paragraph withdrew it in
error.

**R6. "`CENTRE_DISTANCE` contradicts the surrounding prose about tolerances."**
Refuted. `StreetNetwork.java:206` `CENTRE_DISTANCE` is not a distance at all —
it is a JTS `ItemDistance` comparator. The prose is not contradictory. The
actual tolerances are `NODE_SITE_TOLERANCE_M = 100.0` (`StreetNetwork.java:71`)
and `REATTACH_TOLERANCE_M = 10.0` (`:75`), both documented at
`STREET_NETWORK_VALIDATION.md:54, 60`, and neither sets a headline.

**R7. "1,576 flagged rows over 312 hours is 5.05 rows per hour — an anomaly."**
Resolved, not an error. Those 1,576 rows span 7 monitors in 3 counties
(Washington 792, Multnomah 526, Clackamas 258) over 290 distinct clock hours.
The count is right. (The separate problem with how the 1,576 is *used* is D16.)

**R8. "Some hours are covered by a single monitor, so the smoke field is
unreliable."** Technically right, practically immaterial. Of 312 hours, 310 have
both Multnomah monitors, 2 have one, 0 have none. The monitor set changes on
only 2 of 311 hour-to-hour transitions, both at 2020-09-07 20:00/21:00. **No
hour near the peak is single-monitor**: the peak is hour 140 (2020-09-12 20:00)
at 562.7 µg/m³ with both monitors reporting, and 0 of the 30 smokiest hours are
single-monitor.

**R9. "V20 is absent from the bibliography and the chapter."** Wrong on both. It
is at `BIBLIOGRAPHY.md:362-364` and `references.bib:239-247`, the latter with a
URL. The critique is right that no resolvable id exists in the registry or in
`DATA_SOURCES.md` D11 — that is folded into D12.

**R10. "The registry is a literature-only gate, so measured/dataset variables
escape it."** Wrong. Class M is in scope — rule 4 covers `"L" || "M"` — which is
why EPA AQS, PIT and shelter dates carry `D3`, `D10`, `D1`, and
`REGISTRY_SCHEMA.md:38, 53-56` explicitly permits dataset ids. The real hole is
that the gate tests non-emptiness rather than resolvability (D12).

**R11. "The in-sample fitting of scenario C is unreported."** Wrong. It is the
first limitation in the chapter (`Capacity_Is_Not_Access.tex:861-866`), stated
more bluntly than the critique states it and reaching the same conclusion. The
defect is that it does not propagate (D11).

Also worth recording as an overstatement in the critique's favour: its estimate
`0.301×4 + 0.699×194 = 136.81` used a sheltered mean of 4 h against a true 0.595 h.
Immaterial — the corrected version reproduces the published 135.769 exactly —
but the collinearity conclusion is right either way (D5).

---

## 4. New results

### 4.1 C-random control — the access gain is dispersion, not optimisation

See D1 for the numbers. **Meaning for the central claim:** the paper's causal
story for its headline access result is wrong. The result itself (96% vs 91.6%
at identical capacity) is intact and reproduces; what produces it is the
existence of ten additional doors, not their optimised positions. This is a
genuine and reportable finding — it says a county can get the coverage gain
without an optimiser, which lowers the barrier to acting on it — but it is not
the finding currently published. Optimisation is what buys the 28.3% walk
reduction and the associated travel exposure, and that survives intact.

The bbox family is a separate and useful result: ten shelters placed uniformly
over the county bounding box shelter 44.9%, leave 3,767 beds empty and attract
17 people into 3,492 new places. Siting cannot be arbitrary; it has to be inside
the built-up demand footprint. Within that footprint, position stops mattering
for headcount.

### 4.2 Scenario D — a triage rule beats ten new shelters on equity, at zero cost

Arm D is arm B plus one intake rule: reserve a fraction of each facility's
capacity for mobility-limited arrivals. Byte-identity was established twice
before interpreting anything — an arm-A re-run post-change is identical to the
archived `A-seed42/agents.csv` over 6,842 rows, and arm D at reserve 0.00 is
identical to archived `B-seed42` with 0 differing rows. Arm D is arm B plus the
rule and nothing else.

Three-seed means (mobility-limited = 1,360 of 6,842; gap = unimpaired − ML, pp).
Percentage columns are three-seed means; the count columns print seed-42
values:

| Arm | Sheltered (seed 42) | Total % | ML % | Gap | ML outside (seed 42) |
|---|---|---|---|---|---|
| B | 6,264 | 91.5 | 72.0 | 24.4 | 382 |
| C | 6,570 | 96.0 | 85.7 | 12.9 | 194 |
| **D, r = 0.10** | **6,264** | **91.5** | **91.4** | **0.1** | **108** |
| D, r = 0.15 | 6,088 | 89.1 | 99.7 | −13.3 | 3–5 |
| D, r = 0.25 | 5,523 | 80.7 | 99.8 | −23.8 | 3 |

True three-seed count means: B and D-r10 sheltered 6,261 (per-seed
6,264 / 6,259 / 6,260, identical in B and D-r10); B ML outside 387.3; D-r10 ML
outside 119.0; D-r15 sheltered 6,096. The r = 0.25 row is seed-42 only (that
reserve level was run at seed 42 only).

**Meaning for the central claim.** At reserve 0.10 total sheltered is unchanged
from B to the person at all three seeds (6,264 / 6,259 / 6,260, identical
final-state counts), while mobility-limited access rises 19.4 pp and the gap
collapses to zero — with no building, no relocation and no cost. On equity it
beats ten new shelters. It does not match C on total coverage (91.5 vs 96.0);
triage cannot create reachable doors. The two interventions fix different
failures and are complementary. D-on-top-of-C was not run and is the obvious
next test.

Reserve 0.15 maximises mobility-limited access (99.7% — the only ML residents
still outside are the 3–5 who are UNREACHABLE on the street graph) at a cost of
~170 unimpaired people's beds. Arm D carries 3 seeds, not 9.

This also converts D8 from a caveat into a result: the FCFS rule is not an
inherited detail, it is a policy lever with a 19.4 pp effect.

### 4.3 Assignment upper bound — the model is at optimum in headcount, 39–41% off in distance

See R1 and R2 for the headline. Two further numbers matter.

**Optimal mean walking distance:** B 3,768 m against the model's 6,155 m
(sheltered) / 7,938 m (all agents); C 2,670 m against 4,530 m / 5,689 m. An
optimal dispatcher cuts walking 39% (B) and 41% (C) — and travel exposure with
it — while sheltering exactly zero extra people. Congestion cost above the
capacity-free lower bound is 1,928 m (B) vs 1,163 m (C), 66% larger in B.

**Meaning for the central claim.** C's advantage survives, but its character
changes. In headcount it is entirely geographic and entirely explained by door
count (4.1), with coordination contributing nothing because the model is already
exactly optimal. In access *cost* it survives outright and independently: 2,670 m
vs 3,768 m under optimal dispatch, a gap that has nothing to do with myopia. The
39–41% distance penalty from myopia belongs in limitations as a first-class
item, since walking distance is what the optimiser actually buys (4.1).

### 4.4 Multi-scale equity — one claim survives all five scales

See D6 for the table. Two statements survive **all five scales, all three arms,
all nine seeds**:

1. Mobility-limited residents are 20.4% of the population but 23.3% / 66.8% /
   74.3% of everyone left outside in A / B / C. The over-representation grows
   monotonically as coverage rises. **No arm makes the residual look like the
   population.**
2. At identical 6,842 capacity, C leaves 47% fewer mobility-limited residents
   outside than B (205 vs 389) while making the residual *more* concentrated
   (67% → 74%). Better siting shrinks the last mile; it does not change its
   character.

A county acts on scales 4 and 5: scale 4 sizes the procurement, scale 5 says the
residual is 74% mobility-limited, which implies paratransit and in-place
filtration rather than more cots. The pp / RR / OR scales are inference tools
and cannot size a purchase order.

**Temporal.** Every agent departs at tick 960 (h16) and the last arrival across
all 27 runs is tick 1,973 = h32.9 (seed 46, and seeds 48/49 reach h31–33; at
seed 42 it is tick 1,539 = h25.7), so C helps throughout the episode, not at
the peak: 99.3% of the 242M
person-µg·m⁻³·h it avoids relative to A accrues after evacuation ends, and the
±12 h peak window (h128–152, 8.4% of the episode) carries 18.0% of it — 2.1× its
time share. C works by permanently removing 4,510 people (vs A) and 306 people
(vs B) from a standing outdoor population for the remaining 279–286 hours
(seed-dependent; 286 at seed 42). Person-hours outdoors:
1,417,876 → 180,762 → 88,445, with mobility-limited absorbing 23% → 64% → 70%.

Mobility-limited p90 time-to-shelter in C is 4.13 h vs 2.03 h unimpaired (2.0×)
with medians nearly equal (0.48 vs 0.36 h) — the penalty is entirely in the
tail. Arm A's time-to-shelter is a survivorship artefact (only 280 of ~1,395
mobility-limited residents shelter at all) and must be labelled
conditional-on-sheltering wherever it appears.

---

## 5. What the paper's claim should now be

At 2020-level capacity, 36 clean-air facilities holding 2,234 spaces shelter
30.1% of 6,842 unsheltered Multnomah County residents. Raising capacity to one
space per resident at those same 36 buildings raises coverage to 91.6% and
leaves 578 spaces unused, all of them at three east-county facilities that the
county's street data renders unreachable from the Portland core — an artefact
this study identifies rather than a geographic fact, and one that 52 network
welds remove. Redistributing the identical 6,842 spaces across 46 sites raises
coverage to 96.0%, and a matched control shows that this 4.4-point gain comes
from the existence of ten additional doors inside the built-up demand footprint,
not from their optimised positions: ten randomly chosen sites from the same
candidate pool reproduce the sheltered count exactly at every seed. What
optimisation buys is a 28.3% reduction in mean walking distance and about 5% of
the exposure reduction. An exact min-cost-flow bound shows the simulated agents
already achieve the maximum number sheltered that the network permits, so no
dispatcher could shelter more, though one could cut walking a further 39–41%.
The equity result is that mobility-limited residents, 20.4% of the population,
are 23.3% / 66.8% / 74.3% of those left outside in the three arms — an
over-representation that grows monotonically as coverage rises, holds on all
five measurement scales in all nine seeds, and is not fixed by either more
capacity or better placement. It is fixed by an intake rule: reserving 10% of
each facility for mobility-limited arrivals closes the access gap from 24.4
points to 0.1 while sheltering exactly as many people in total. All access
figures are upper bounds, because every resident is assumed to know every
facility, to know its live vacancy, and to leave at the same hour; the one
observed occupancy record is over-predicted by between 1.5× and 15.6×, the range
rather than the point because the calibration configuration is capacity-censored.

---

## 6. Action list

**Ordered by ratio of claim-change to effort.**

| # | Action | Status | Effort |
|---|---|---|---|
| 1 | Run the matched C-random POOL control | **[done]** | — |
| 2 | Run scenario D triage sweep, 3 seeds × 4 reserves | **[done]** | — |
| 3 | Compute the exact assignment upper bound, 18 runs | **[done]** | — |
| 4 | Compute equity on all five scales, pooled 9 seeds | **[done]** | — |
| 5 | Rewrite the C attribution: "more doors" for access, "better places" for distance. `PRESENT_DAY_THREE_ARM_RESULTS.md`, `README.md:43-48`, `Capacity_Is_Not_Access.tex:692`, `presentation/index.html:728`, `SUBMIT.md:213` | [todo] | 3 h |
| 6 | Add the POOL control as a named arm in the results table and chapter | [todo] | 3 h |
| 7 | Replace the tautology sentence in `README.md:48`, `SUBMIT.md:215`, `presentation/index.html:621` with the chapter's version + the three-site concentration | [todo] | 30 min |
| 8 | Correct the component description: 154 components, second is 28,407 nodes, model routes on it, 3 shelters stranded. `PRESENTER_SCRIPT.md:300`; node count 89,322 → 89,345 everywhere | [todo] | 1 h |
| 9 | Report the calibration as a 1.5×–15.6× bracket, five locations | [todo] | 1 h |
| 10 | Replace 13.0/24.5/12.9 with pooled values or label seed-42; report all five equity scales; replace the access-rate-ratio rebuttal at `Capacity_Is_Not_Access.tex:746-748` with the complement ratio | [todo] | 4 h |
| 11 | Add scenario D as a results section — it is the strongest actionable result in the set | [todo] | 1 day |
| 12 | Reframe seed ranges as sampling-stability, not uncertainty; delete the "28×" claim at `presentation/index.html:652` | [todo] | 1 h |
| 13 | Add three missing limitations: global real-time vacancy knowledge, absorbing SHELTERED with zero turnover, 39–41% distance cost of myopia | [todo] | 1 h |
| 14 | Propagate the in-sample-fitting caveat from `Capacity_Is_Not_Access.tex:861` to `PRESENT_DAY_THREE_ARM_RESULTS.md`, `README.md`, `scenario_c_report.json`; print the objective incl. the 60,000 penalty | [todo] | 1 h |
| 15 | Propagate the FCFS-conditional caveat to `PRESENT_DAY_THREE_ARM_RESULTS.md` and `README.md`; cite scenario D | [todo] | 1 h |
| 16 | Collapse the exposure table to 2 inputs + derived; drop `vwe_ugm3h` | [todo] | 2 h |
| 17 | Fix `PRESENTER_SCRIPT.md:99` (526 not 1,576 reach the model), `:177` (no de-duplication exists), and the "2,981 distinct points" claim | [todo] | 2 h |
| 18 | Drop or mark-null the chronic-condition equity row; put a CI on the 65+ figure | [todo] | 1 h |
| 19 | Quote "could not reach" as 19 [14–25] in narrative, two locations | [todo] | 15 min |
| 20 | Correct "resolvable DOI" at `presentation/index.html:841-842` and `TECHNICAL_REFERENCE.md:25-26` | [todo] | 30 min |
| 21 | Regenerate the `analyze_run.py` check counts (104/124, not 37/37) and stop calling `:208-252` a check | [todo] | 1 h |
| 22 | Correct the opening-date claim: the gate is a no-op in A/B/C | [todo] | 30 min |
| 23 | Resolve or remove the Pathways Study 2026 citation for V22 `chronic_physical`; a class-M variable is currently published with `[full citation to be confirmed]` at `Capacity_Is_Not_Access.tex:366` | [todo] | unknown |
| 24 | Implement the registry coverage test promised at `REGISTRY_SCHEMA.md:117-119`; add format + cross-reference checks to `ScienceRegistry.java:177-180` | [todo] | 1 day |
| 25 | Round `PopulationSampler.java:87-88` to source precision; reconcile the A/M class label at `:83` vs `variables.csv:24` | [todo] | 1 h + re-run |
| 26 | Run D-on-top-of-C (triage + ten new sites) | [todo] | 1 day |
| 27 | Extend arm D from 3 seeds to 9 | [todo] | 1 day |
| 28 | Weld the street graph (52 welds, `--weld-m 1.0`) and re-run all arms; re-verify the manifest chain | [todo] | 1 week |
| 29 | Re-run the p-median against a held-out or perturbed campsite draw and report the degraded gap | [todo] | 2 days |
| 30 | Add a documented decision rule for blocking-vs-active assumptions, or withdraw the claim that the set is principled | [todo] | 2 h |

Items 5–22 are documentation and cost about three days in total. Items 23–30 are
scientific and change numbers.

---

## Sources

| File | Covers |
|---|---|
| `01-arithmetic.md` | Tautology, exposure collinearity, seed degeneracy, unreachable range, subgroup CIs |
| `02-parameters.md` | 24 parameters and mechanisms with set-site, disclosure status, and headline impact |
| `03-data.md` | EPA rows, monitor coverage, network components, campsite sampling, calibration censoring, opening dates |
| `04-registry.md` | Gate hole, V20/V22, blocking criterion, registry drift across the 27 manifests |
| `05-upper-bound.md` | Min-cost max-flow, coordination shortfall, distance-capped regimes, network repair |
| `06-equity-scales.md` | Five scales × three arms × nine seeds, temporal decomposition |
| `07-c-random.md` | Both control families, decomposition, reproduction check |
| `08-scenario-D.md` | Byte-identity proofs, reserve sweep, three seeds |

Re-runnable: `scripts/analysis/upper_bound.py` (v1.0.0),
`scripts/analysis/equity_scales.py --json out.json`,
`scripts/build_scenario_crandom_pool_2026.py`,
`scripts/make_batch_params_d_2026.py`.
