# Response 02 — "Load-bearing parameters are unreported"

Every claim below was checked against the source and against the 27 archived runs
in `Geography/output/`. Where the critique is right I say so; where it is wrong I
give the arithmetic.

**Headline finding: the critique's single strongest technical claim — that arm A's
18,260 m mean walk is a `MAX_RETARGETS` artefact and that 4,766 agents exhaust the
cap — is false, and is falsified by the project's own exported data.** Two of its
other claims (vacancy omniscience; in-sample optimisation) are correct. Two
documentation defects it did not name are real and should be fixed (`37/37`,
`check #38`).

---

## Summary table

| # | Parameter / mechanism | Value | Set at | In published docs? | Sets a headline? |
|---|---|---|---|---|---|
| 1 | `MAX_RETARGETS` | `8` | `GisAgent.java:125` | Symbol only in final tier (`TECHNICAL_REFERENCE.md:1301`, `presentation/index.html:478`); numeric `= 8` only in `09-DECISIONS.md:192`, `04-DECISION.md:191` | **No — never binds in A** |
| 2 | `retargetCount` reset on re-entry | resets to `0` | `GisAgent.java:254` | Yes (`TECHNICAL_REFERENCE.md:1339`) | No — path is unreachable in these runs |
| 3 | `minutesPerTick` | `1.0` | `parameters.xml:23`; `batch_params_2026_*.xml:23` | Yes (`TECHNICAL_REFERENCE.md:933, 1727, 2274`) | Indirectly — sets the shuffle tie-group size |
| 3b | Admission order (no arbiter) | shuffle within tick, FCFS across ticks | `GisAgent.java:173, 301` | Chapter `sec:limitations`; `index.html:756`. **Not** in `PRESENT_DAY_THREE_ARM_RESULTS.md` / `README.md` | **Yes — the equity gap** |
| 4 | `NODE_SITE_TOLERANCE_M` | `100.0` | `StreetNetwork.java:71` | Yes (`STREET_NETWORK_VALIDATION.md:54`) | No |
| 4b | `REATTACH_TOLERANCE_M` | `10.0` | `StreetNetwork.java:75` | Yes (`STREET_NETWORK_VALIDATION.md:60`) | No |
| 4c | `CENTRE_DISTANCE` | *not a distance* — a JTS `ItemDistance` comparator | `StreetNetwork.java:206` | Yes, as code | No |
| 5 | Indoor exposure once `SHELTERED` | exactly `0` | `GisAgent.java:193` | Yes (`GisAgent.java:37–46`, design spec) | **Yes — every exposure headline** |
| 6 | Departure tick | tick `960`, all 6,842 agents | `GisAgent.java:232` + `parameters.xml:48` (`55.5`) | Yes, as limitation A-02 (`TECHNICAL_REFERENCE.md:2334`) | **Yes — creates the instantaneous queue** |
| 6b | Smoke field spatial model | county-uniform scalar | `SmokeField.java:17–25, 118` | Yes | Yes — is *why* departure is synchronous |
| 7 | `SHELTERED` absorbing | yes; occupancy monotone ↑ | `GisAgent.java:260`; `Shelter.java:71–86` | Partially | **Yes — no bed turnover in 312 h** |
| 8 | Real-time vacancy knowledge | global, exact, every re-plan | `GisAgent.java:348` (`hasSpace()`) | **No — not stated as a limitation anywhere** | **Yes — flatters B and C** |
| 9 | `analyze_run.py` check count | **104** (A, 36 shelters) / **124** (C, 46); `32 + 2n` | `analyze_run.py:150,153` (2/shelter) + 32 fixed | Docs say `37/37` — **stale** (that is 2 shelters) | No, but it is a false verification claim |
| 9b | "check #38" | not a numbered check at all | `analyze_run.py:208` returns a dict, never `ck.add` | Cited as `#38` in 3 places — **wrong label** | No |
| 10 | Scenario C objective | min Σ d(c,n)·t_n + 60000·unused | `build_scenario_c_2026.py:154–163` | Method described; objective not written out | **Yes — C's 96.0%** |
| 10b | C's demand surface | `B2026-n6842-seed42/agents.csv` start coords | `build_scenario_c_2026.py:33, 76–83` | **Yes** — chapter `sec:limitations` line 861 | **Yes — in-sample** |

---

## 1. `MAX_RETARGETS` — the critique's central claim is false

**Value `8`, `GisAgent.java:125`.** It gates one branch:

`GisAgent.java:315-318` — `retargetCount++; if (retargetCount > MAX_RETARGETS) { state = REFUSED_ALL_FULL; }`

The cap therefore fires only when `retargetCount` reaches **9**.

### Verified from `agents.csv`, all 27 runs

`door_refusals` is the export of `retargetCount` (`getRetargetCount()`,
`GisAgent.java:435`).

| Arm | max `door_refusals` across 9 seeds | agents with `≥ 9` | `REFUSED_ALL_FULL` |
|---|---|---|---|
| A | **5–6** | **0** | 4,762–4,773 |
| B | 7–9 | 0 in 5 seeds; 1–8 in seeds 43/44/47/48 | 558–569 |
| C | 8 | **0** | 252–263 |

**The cap never fires in arm A, in any seed.** At most 8 agents out of 6,842
(0.1%) hit it in any run, all in arm B.

The 4,766 `REFUSED_ALL_FULL` agents in A-seed42 reach that state by the *other*
route — `chooseNetworkNearestShelter` finds reachable shelters but none with
space (`GisAgent.java:366-367`). That is the correct, physical mechanism: 2,234
spaces for 6,842 people. The critique conflated the `REFUSED_ALL_FULL` census
(4,766, which is real and is a headline number) with cap exhaustion (which
happened zero times).

### The 18,260 m arithmetic does not work

A-seed42 `door_refusals` histogram: `{0:1754, 1:95, 2:622, 3:2055, 4:1712,
5:603, 6:1}`.

- Mean pairwise straight-line inter-shelter distance, A's 36 sites: **8,655 m**.
  `8 × 8,655 = 69,240 m`. The critique predicts 18,260 m. Off by 3.8×.
- Actual decomposition: mean `door_refusals` = 2.539 → mean **3.539** planned
  legs; mean `planned_route_m` = **18,223 m**; mean leg = **5,149 m**;
  `3.539 × 5,149 = 18,223`. Mean walked = **18,260.5 m**. The 37 m difference is
  `snap_gap_m` (encampment→street snap), exactly as `GisAgent.java:273` intends.

The mean walk is generated by the *observed* refusal count, not by a cap that
never engaged. The critique read the right number off the right column and then
attributed it to the wrong mechanism.

## 2. Does `retargetCount` reset? — Yes, and it is dead code here

**Definitive: YES it resets, at `GisAgent.java:254`** (`retargetCount = 0;`),
inside the `REFUSED_ALL_FULL → EN_ROUTE` re-entry block at `GisAgent.java:249-258`.

So the "permanently excluded on day 1" bug the critique describes **cannot
occur** — the guard exists.

But the more important finding is that the re-entry path is **unreachable in
these runs**, which makes the question moot:

- Re-entry requires `anyShelterAvailable()` (`GisAgent.java:250`, defined
  `:387-396`) to flip false→true. That needs either a shelter opening later, or
  capacity increasing.
- All shelters open on the same date. Verified: `shelters_2026_current_placement.csv`
  → 36 rows, all `opened = 2020-09-07`; `shelters_2026_expanded_plus_new_sites.csv`
  → 46 rows, all `2020-09-07`.
- Occupancy is monotone non-decreasing — `Shelter.java:71-86` has `occupancy++`
  and no decrement anywhere in the class.

**Proof from the data.** If the reset had ever fired, the agent-side refusal
total would be strictly less than the shelter-side total. It is not:

| Arm | `Σ agents.door_refusals` | `Σ shelters.refused_count` | equal |
|---|---|---|---|
| A | 17,373 | 17,373 | ✔ |
| B | 8,292 | 8,292 | ✔ |
| C | 6,775 | 6,775 | ✔ |

Exact equality in all three arms. The reset fired zero times.

Corollary the project should note: the documented caveat that `door_refusals`
**under-reports** (`METRICS.md:55`, `FINAL_SYSTEM_AUDIT.md:80`,
`TECHNICAL_REFERENCE.md:2545`) is *conservative but inoperative* for the 2026
runs. `door_refusals` is exact here. Saying so would be more honest than the
current blanket warning.

## 3. `minutesPerTick` and the equity mechanism — the mechanism is real

**Value `1.0`**, `Geography/Geography.rs/parameters.xml:23`, and identically in
all 27 batch files (`Geography/batch/batch_params_2026_*_seed*.xml:23`).
Reported in `TECHNICAL_REFERENCE.md:933, 1727, 2274`.

**The critique's mechanism is correct and I confirm it:**

- `GisAgent.step` is `@ScheduledMethod(start = 1, interval = 1)`
  (`GisAgent.java:173`) with **no `shuffle` attribute**, so Repast's default
  per-tick shuffle applies. `PopulationSampler.java:20` explicitly names "the
  per-tick agent shuffle" as a consumer of the seeded stream.
- Admission is resolved **immediately on arrival**, inline:
  `GisAgent.java:301` — `if (targetShelter.isOpenAt(tick) && targetShelter.admit())`.
  There is no arbiter, no proposal phase, no queue.
- Therefore: **within a tick, whoever the shuffle steps first takes the bed;
  across ticks it is strict FCFS.** Coarser ticks enlarge the group whose order
  is decided by shuffle rather than by actual arrival time. Exactly as claimed.

`docs/science/phase2-human-agents/08-ENGINEERING.md:110-118` **specifies** the
order-independent arbiter that would fix this, and dismisses the risk with:
"It changes behaviour only when capacity binds, which never happens at n = 50."
That sentence was written for the n=50 baseline. At n = 6,842 capacity binds
maximally in arm A, and the arbiter was never implemented. **This is the single
most load-bearing unimplemented design decision in the model.**

It *is* disclosed — `docs/chapter/Capacity_Is_Not_Access.tex:875` and
`docs/final/presentation/index.html:756`. It is **not** disclosed in
`docs/final/PRESENT_DAY_THREE_ARM_RESULTS.md` or `README.md`, which is where a
reader meets the equity numbers first. That gap should be closed.

## 4. `CENTRE_DISTANCE` vs `REATTACH_TOLERANCE_M` — the prose is NOT contradictory

The critique is wrong here. There is no "10 m vs 100 m" conflict; there are two
different constants for two different steps, plus a third thing that is not a
distance at all.

- `NODE_SITE_TOLERANCE_M = 100.0` — `StreetNetwork.java:71`. Clusters endpoint
  *claims* of one attribute ID into one node site.
- `REATTACH_TOLERANCE_M = 10.0` — `StreetNetwork.java:75`. Aliases a *corrected*
  extra site to an existing primary node.
- `CENTRE_DISTANCE` — `StreetNetwork.java:206-212`. An anonymous
  `org.locationtech.jts.index.ItemDistance` implementation returning planar
  centre-to-centre distance, used **only to rank STRtree candidates**
  (`:298`, `:415`). It carries no metre value and is not a threshold.

The docs state both correctly and in the right places:
`docs/validation/STREET_NETWORK_VALIDATION.md:54` (100 m, clustering) and `:60`
(10 m, reattachment); `TECHNICAL_REFERENCE.md:787-788`. The adjacent bullets the
critique read as self-contradictory are describing consecutive steps of one
algorithm.

Not a headline parameter either way.

## 5. Indoor exposure once `SHELTERED` — exactly zero. Confirmed.

`GisAgent.java:193`:

    if (smokeField != null && state != State.SHELTERED) {

This single guard wraps the entire accrual block, `GisAgent.java:193-215`:
`exposureUgM3h`, `vweUgM3h`, `inhaledDoseUg`, `airVolumeBreathedM3`,
`hoursAboveUnhealthy`, `peakConcUgM3`, `outdoorHours`. Once `SHELTERED`, all
seven stop. There is no indoor concentration term anywhere in the codebase.

This is deliberate and stated: `GisAgent.java:37-46` — "Shelter benefit is
therefore the reduction of outdoor exposure TIME through better placement and
accessibility — not indoor filtration, which this study deliberately does not
model."

**Sets a headline: yes.** Every exposure-reduction figure is "outdoor hours
avoided". It is disclosed, so this is a scope statement rather than a defect —
but a reader who assumes a filtration benefit will over-read the numbers.

## 6. Departure timing — all agents depart on the same tick. Confirmed.

**Verified from A-seed42 `agents.csv`: `time_started_tick` has exactly one
distinct value, `960`, for all 6,842 rows.** (960 ticks × 1 min = 16 h after
2020-09-07T00:00.)

Mechanism, three parts:

1. The smoke field is a **county-uniform scalar** — `SmokeField.java:17-25` and
   `concentrationForTick(double tick, double minutesPerTick)` at `:118` takes no
   spatial argument. Every agent sees the identical concentration.
2. A **single global threshold** — `evacuationThresholdUgM3 = 55.5`
   (`parameters.xml:48`), tested at `GisAgent.java:232`.
3. No per-agent departure draw exists. `PopulationSampler.Attributes` supplies
   walking speed, age, sex, mobility and comorbidity — **no departure delay,
   no risk perception, no compliance probability.**

**Departure-time heterogeneity is not modelled at all.**

Is synchrony listed as a limitation? **Yes**, in three places:
`TECHNICAL_REFERENCE.md:2334` (assumption A-02, status "active (partially
mitigated)"), `10-FAILURE-MODES.md:60`, and the analysis pipeline itself emits
`"all_simultaneous"` as a summary field (`analyze_run.py:281`). Credit where due.

**Sets a headline: yes.** Synchronous departure loads the entire population into
the admission queue at one instant, which maximises the tie-group that item 3's
shuffle resolves, and maximises the capacity crunch. It is the amplifier for
both the access rate and the equity gap.

## 7. `SHELTERED` is absorbing. Confirmed.

Every write to `state` in `GisAgent.java`: `:233`, `:253`, `:302`, `:317`,
`:367`, `:369`. **None of them assigns away from `SHELTERED`.** `:302` is the
only entry, and `:260-262` returns immediately for any non-`EN_ROUTE` state, so
a `SHELTERED` agent executes nothing after the exposure guard rejects it.

Capacity side: `Shelter.java:71-86` — `admit()` only increments; there is no
`release()`, `depart()` or decrement anywhere in the class. Occupancy is a
one-way ratchet over the full 312-hour window.

**Sets a headline: yes.** No bed ever turns over in 13 simulated days. Agents
never leave, never step outside, never move between shelters. This is a
substantial simplification and I did not find it stated as a limitation in the
final-tier docs. It should be.

## 8. Vacancy omniscience — the critique is correct.

`chooseNetworkNearestShelter`, `GisAgent.java:332-371`. The selection loop
(`:337-352`) iterates **every** `Shelter` in the context and at `:348` calls:

    if (shelter.hasSpace() && dM < bestDistM) {

`hasSpace()` (`Shelter.java:84-86`) reads the live `occupancy` counter. So on
every re-plan, every agent has:

- exact, current, county-wide knowledge of which of the 36/46 shelters has a free
  bed, and
- exact network distance to each, from a precomputed Dijkstra tree (`:343`),
  regardless of distance or familiarity.

No information cost, no error, no decay, no local-knowledge constraint. The label
"vacancy omniscience" is accurate.

**Does it flatter placement?** Directionally, yes — it eliminates wasted trips to
shelters that are already full, which benefits any arm where capacity binds
somewhere but not everywhere (B and C). Two honest qualifications: (a) it flatters
arm A too, and A still fails at 30.1% — the omniscience does not rescue it; (b)
the knowledge is stale *within* a tick, which is why 8,292 (B) and 6,775 (C) door
refusals still occur — many agents target the last bed simultaneously.

**I could not find this stated as a limitation in any published doc.** The only
hits for `hasSpace` in `docs/` are pasted source. This is a genuine gap and the
critique is right to flag it.

## 9. "37/37 checks" vs "check #38" — both labels are wrong

The check count is **dynamic**, not fixed. `analyze_run.py:148-155` adds **two
checks per shelter**, on top of **32** fixed checks. So the total scales with the
scenario: `n_checks = 32 + 2 × n_shelters`.

I re-ran the analyzer and read the counts back out of `analysis/summary.json`:

    $ python scripts/analyze_run.py Geography/output/A2026-n6842-seed42
      verification: 104/104 passed          36 shelters → 32 + 2×36 = 104 ✔

    $ python scripts/analyze_run.py Geography/output/C2026-n6842-seed42
      verification: 124/124 passed          46 shelters → 32 + 2×46 = 124 ✔

(Confirmed by partitioning `summary.json["verification"]["checks"]`: 32 fixed
names, and exactly 2.0 per-shelter names per facility, in both arms.)

**Neither is 37.** `37 = 32 + 2×2` — the retired 2020 two-shelter configuration
(OCC + CJ). The number was never updated when the study moved to 36 and 46
facilities.

Stale claims to fix:
- `docs/final/TECHNICAL_REFERENCE.md:2233` — "37 cross-checks … 37/37 pass"
- `docs/final/TECHNICAL_REFERENCE.md:2621` — "Per-run consistency (37 checks…)"
- `docs/final/presentation/index.html:830` — "37/37 checks pass"
- `docs/validation/gui-issue-diagnosis.md:57, 109`

These **understate** the verification by roughly 3×, so the error is not
self-serving — but it is still wrong and a reviewer will find it.

**"check #38" is not a check.** `routing_anomaly()` (`analyze_run.py:208-252`)
returns a dict and never calls `ck.add`. It is attached to the report at `:726`
as `"routing_anomaly"`. It is unnumbered, is not in `checks.results`, and cannot
contribute to a pass/fail count. Calling it "#38"
(`TECHNICAL_REFERENCE.md:1309, 2234`, `presentation/index.html:492`,
`TECHNICAL_REFERENCE.md:2545`) implies it is check 38 of 38, which it is not.

**Recommended fix:** replace "37/37" with "all checks pass (104 in arm A, 124 in
arm C; the count scales at 2 per facility)" and rename "check #38" to "the
walked-vs-planned routing audit".

## 10. Scenario C's objective, and the circularity question

### What it minimises

`scripts/build_scenario_c_2026.py:148-165`. Greedy, capacity-constrained
p-median over the validated street graph. For each of the `N_NEW = 10` sites in
turn, over ≤ `MAX_CANDIDATES = 500` candidate street nodes on a `GRID_M = 600` m
grid (`:135-143`), it selects the node `c` minimising

    cost(c) = Σ_n  d(c, n) · t_n        +  60000 · (capacity left unused)
              ^ residual demand nodes n, absorbed nearest-first up to `cap`

- `d(c, n)` — true Dijkstra network distance (`:145`, `:153-154`)
- `t_n` — persons taken from node `n` (`:158-160`)
- `60000.0` at `:163` — a penalty per unused bed, in the same units as metres.
  It is an undocumented magic number and it is load-bearing: it is what forces
  each site to be large enough to fill, which is why the ten new sites average
  ~349 spaces, larger than any real facility in the inventory.

Existing facilities are fixed and pre-assigned first, nearest-first, at
`:109-132`, mirroring the model's own behaviour.

### Is the demand surface the same as the evaluation set?

**Yes. Unambiguously. It is the same file.**

- `build_scenario_c_2026.py:33` — `RUN = ROOT / "Geography/output/B2026-n6842-seed42/agents.csv"`
- `:76-83` — reads `start_lon` / `start_lat` from every agent row and snaps each
  to its nearest graph node to form `demand`.

Those are the recorded starting coordinates of the identical 6,842 residents
against which scenario C is then scored. Corroboration from the runs: mean
`network_dist_to_shelter_m` is bit-identical (1,860.3 m) between A-seed42 and
B-seed42, and all 27 runs share the same 16 `UNREACHABLE` agents — the demand
geography is invariant across every arm and seed. The optimiser is fitted and
evaluated on one and the same point set. There is no hold-out, no resampling of
campsite locations, no spatial cross-validation.

### But it is already disclosed

`docs/chapter/Capacity_Is_Not_Access.tex:861` — the **first** listed limitation:

> **The optimizer is evaluated on the demand it was fitted to.** All 27 runs use
> identical resident starting coordinates, so the procedure that chooses the ten
> new sites selects them to serve exactly the 2,981 campsite locations against
> which scenario C is then measured. C's advantage over B is therefore an upper
> bound on what the same procedure would achieve against a distribution of
> campsites it had not seen.

That is a correct and adequately blunt statement of the problem, and it draws the
right conclusion (upper bound).

It is **absent** from `docs/final/PRESENT_DAY_THREE_ARM_RESULTS.md`, from
`README.md`, and from the `"limitations"` array in
`docs/runs/scenario-c-2026-new-sites/scenario_c_report.json` (which lists four
limitations, none of them this one). Those three should carry the same sentence.

---

## Verdict on circularity

The circularity is **real, total, and already disclosed in the chapter.**
Scenario C's ten new sites are chosen by a greedy capacity-constrained p-median
that minimises capacity-weighted network walking distance (plus a 60,000-per-bed
unused-capacity penalty) over a demand surface read directly out of
`B2026-n6842-seed42/agents.csv` — the recorded `start_lon`/`start_lat` of the
very same 6,842 residents against whom C is then evaluated, on the same street
graph, with the same 16 unreachable agents. That is textbook in-sample fitting:
there is no hold-out, no campsite resampling, no spatial cross-validation, and
C's 96.0% versus B's 91.6% is therefore an upper bound on what this placement
procedure would deliver against encampment locations it had not already seen.
Where the critique overreaches is in calling it unreported: it is the first
limitation in `docs/chapter/Capacity_Is_Not_Access.tex:861`, stated in plainer
language than the critique uses and drawing the same "upper bound" conclusion. So
the correct characterisation is not concealment but **inconsistent propagation** —
the chapter is honest, while `PRESENT_DAY_THREE_ARM_RESULTS.md`, `README.md` and
`scenario_c_report.json` present the 96.0% without the caveat. The fix is
editorial, not scientific: repeat the chapter's sentence wherever the C-versus-B
gap appears. The scientific fix, if one is wanted, is to re-run the optimiser
against a held-out or perturbed campsite draw and report the degraded gap; until
that is done, C's margin over B should be quoted as an upper bound every single
time it is quoted.
