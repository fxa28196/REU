# 06 — The equity finding on five scales

**Critique claim under test:** *"The headline 'the gap widens 13.0 → 24.5 → 12.9'
holds on exactly one of four scales, and that one is the most distorted by the
ceiling effect."*

**Verdict, in one line:** the critique is **right about the shape of the
trajectory** (the widen-then-narrow inverted U really is a percentage-point-only
artefact) and **wrong about the count** (the *widening* half of the claim holds on
4 of 5 scales, not 1). It is also right that the chapter's own defensive ratio
is the ceiling-bounded one, which is a genuine flaw in our rebuttal, not in the
critique.

Everything below is recomputed from the 27 archived runs by
`scripts/analysis/equity_scales.py`. Nothing is copied from the existing docs.

---

## 0. What the existing docs actually say

- `docs/final/PRESENT_DAY_THREE_ARM_RESULTS.md:123` — `| Gap (percentage points) | 13.0 | **24.5** | **12.9** |`
- `docs/final/PRESENT_DAY_THREE_ARM_RESULTS.md:126-128` — "Pouring 4,608 beds into the *same* buildings widens it to 24.5 … Spending that same capacity on well-placed new sites brings the gap back to 12.9"
- `docs/chapter/Capacity_Is_Not_Access.tex:746-748` — "On a percentage-point scale, capacity expansion widens the gap from 13.0 to 24.5 … On a ratio scale the gap narrows at every step, from 1.66 to 1.34 to 1.15."
- `docs/chapter/Capacity_Is_Not_Access.tex:762-765` — the three-measure table (pp / ratio / count / share).
- `README.md:54-56` — same 13.0 → 24.5 → 12.9.

**First honest finding, unprompted by the critique: those are seed-42 numbers, not
the 9-seed result.** Per-seed mobility gaps (pp):

| seed | 42 | 43 | 44 | 45 | 46 | 47 | 48 | 49 | 50 |
|---|---|---|---|---|---|---|---|---|---|
| A | **12.98** | 12.44 | 11.95 | 12.78 | 11.99 | 13.82 | 11.36 | 13.24 | 12.31 |
| B | **24.51** | 25.60 | 23.16 | 24.87 | 22.22 | 26.08 | 25.53 | 23.66 | 23.41 |
| C | **12.84** | 13.25 | 12.65 | 14.01 | 14.09 | 14.11 | 12.87 | 12.27 | 14.45 |

13.0 / 24.5 / 12.9 is seed 42 alone. The 9-seed pooled values are
**12.54 / 24.31 / 13.40**. The pattern survives, so this is a reporting defect,
not a result defect — but the published numbers should be the pooled ones with a
seed interval, and the chapter table caption
(`Capacity_Is_Not_Access.tex:753-755`) does not say "seed 42".

---

## 1. Method

- Outcome: `reached_shelter == "yes"` in `agents.csv`. "Left outside" =
  `REFUSED_ALL_FULL` or `UNREACHABLE` (the only other two `final_state` values;
  `en_route` is 0 in all 27 runs).
- Groups: `mobility_limited == 1`; `age_years >= 65`; `copd_flag == 1`. Each is
  compared against its own complement in the same run.
- **Pooled** = counts summed over the 9 seeds (n = 61,578 agent-runs per arm).
  Wilson 95% intervals on the pooled counts. These intervals treat the 9 seeds as
  independent draws of *people*, which they are not — same 36/46 shelters, same
  street network, same county-uniform smoke field. **Pooled Wilson CIs are
  therefore anti-conservative** and are reported alongside a 9-seed t interval on
  the per-seed estimates, which is the honest "would another seed flip this?"
  uncertainty.
- Difference of proportions: Newcombe (1998) method 10, built from the two Wilson
  intervals. Risk ratio: Katz log-RR. Odds ratio: Woolf log-OR with
  Haldane–Anscombe correction if any cell is empty (never triggered here).

---

## 2. Mobility-limited vs unimpaired — all five scales

Population base: mobility-limited are **20.4%** of the 6,842 residents
(`simulation.json → population_sampling.realised_mobility_limited`, 0.1988 at
seed 42; 0.204 pooled).

Shelter rates, pooled: A 20.07% vs 32.61% · B 72.14% vs 96.45% · C 85.30% vs 98.70%.

| Scale | A | B | C | A→B | B→C |
|---|---|---|---|---|---|
| **1. Gap, percentage points** (unimpaired − impaired), Newcombe 95% CI | 12.54 [11.72, 13.34] | **24.31 [23.51, 25.12]** | 13.40 [12.78, 14.03] | **widens** | narrows |
| **2. Risk ratio of being left outside** (impaired / unimpaired), Katz 95% CI | 1.19 [1.17, 1.20] | 7.85 [7.43, 8.28] | **11.28 [10.33, 12.31]** | **widens** | **widens further** |
| **3. Odds ratio of being left outside**, Woolf 95% CI | 1.93 [1.84, 2.02] | 10.49 [9.86, 11.16] | **13.05 [11.90, 14.31]** | **widens** | **widens further** |
| **4. Mobility-limited residents left outside** (mean per run of 6,842) | 1,114.8 | 388.6 | **205.0** | **falls 65%** | falls 47% |
| **5. Share of the left-outside population that is mobility-limited**, Wilson 95% CI | 23.29% [22.90, 23.69] | 66.76% [65.47, 68.03] | **74.28% [72.52, 75.96]** | **widens** | **widens further** |

Per-seed spread (min…max over 9 seeds), so nothing above rests on one draw:

| | gap pp | RR outside | OR outside | N outside | % of outside |
|---|---|---|---|---|---|
| A | 11.36 … 13.82 | 1.17 … 1.21 | 1.80 … 2.09 | 1,058 … 1,169 | 22.09 … 24.42 |
| B | 22.22 … 26.08 | 6.74 … 8.73 | 8.77 … 11.96 | 376 … 400 | 64.27 … 68.38 |
| C | 12.27 … 14.45 | 9.24 … 16.22 | 10.63 … 18.99 | 192 … 226 | 69.18 … 81.59 |

Ratio, odds and composition are separated between B and C by non-overlapping
95% intervals in both directions — **C is significantly *worse* than B on scales
2, 3 and 5**, and significantly better on scales 1 and 4.

### Verifying the critique's scale-5 numbers

The critique proposes scale 5 as scale-free and asserts **66% in B, 72% in C**.

- **B = 66.76% [65.47, 68.03] pooled; 66.09% at seed 42. The critique's 66% is
  correct.**
- **C = 74.28% [72.52, 75.96] pooled; 71.32% at seed 42. The critique's 72% is
  the seed-42 figure** (it matches `Capacity_Is_Not_Access.tex:766`, "72"). The
  9-seed value is 74.3%, so the critique — using our own published number —
  slightly *understates* the effect it is pointing at.

Against a 20.4% population base, that is a concentration lift of ×1.14 (A),
×3.28 (B), ×3.64 (C).

---

## 3. Age 65+ (base 5.3%)

Shelter rates pooled: A 22.11% vs 30.49% · B 80.36% vs 92.11% · C 90.89% vs 96.25%.

| Scale | A | B | C | A→B |
|---|---|---|---|---|
| 1. Gap pp | 8.39 [6.88, 9.83] | 11.75 [10.40, 13.17] | 5.36 [4.40, 6.41] | **widens** |
| 2. RR outside | 1.12 [1.10, 1.14] | 2.49 [2.31, 2.68] | 2.43 [2.16, 2.73] | **widens** |
| 3. OR outside | 1.55 [1.42, 1.68] | 2.85 [2.60, 3.13] | 2.57 [2.26, 2.92] | **widens** |
| 4. N 65+ left outside (per run) | 280.3 | 70.7 | 32.8 | falls 75% |
| 5. Share of outside that is 65+ | 5.86% [5.64, 6.08] | 12.14% [11.29, 13.05] | 11.88% [10.66, 13.21] | **widens** |

Same 4-of-5 pattern as mobility. Note that on scales 2, 3 and 5 the B→C change is
within noise (overlapping CIs) — C does not measurably fix the 65+ concentration,
it just makes the residual smaller.

---

## 4. COPD (base 10.4%)

Shelter rates pooled: A 22.59% vs 30.91% · B 86.63% vs 92.06% · C 94.05% vs 96.19%.

| Scale | A | B | C | A→B |
|---|---|---|---|---|
| 1. Gap pp | 8.32 [7.21, 9.40] | 5.43 [4.58, 6.31] | 2.14 [1.56, 2.76] | **narrows — fails** |
| 2. RR outside | 1.12 [1.10, 1.14] | 1.68 [1.57, 1.80] | 1.56 [1.40, 1.74] | **widens** |
| 3. OR outside | 1.53 [1.44, 1.63] | 1.79 [1.65, 1.93] | 1.60 [1.43, 1.79] | **widens** |
| 4. N COPD left outside (per run) | 549.3 | 94.9 | 42.2 | falls 83% |
| 5. Share of outside with COPD | 11.48% [11.18, 11.78] | 16.30% [15.33, 17.33] | 15.30% [13.94, 16.77] | **widens** |

**COPD is the cleanest demonstration that the critique's ceiling worry is real.**
On percentage points the COPD gap *shrinks* from 8.32 to 5.43 when capacity is
added — the opposite sign from mobility — purely because the comparison group is
pinned at 92.06% and has 8 points of headroom left. On the ratio, odds and
composition scales, which are not headroom-bounded, the COPD disparity **widens**
exactly like mobility's. Anyone reading only the pp row would conclude capacity
expansion *helped* COPD equity. It did not.

---

## 5. Direct answers

### 5.1 On how many of the five scales does "adding capacity alone widens the gap" hold?

Counting A→B only:

| Group | 1. pp | 2. RR | 3. OR | 4. count | 5. composition | Total |
|---|---|---|---|---|---|---|
| Mobility-limited | ✅ | ✅ | ✅ | ❌ | ✅ | **4 / 5** |
| Age 65+ | ✅ | ✅ | ✅ | ❌ | ✅ | **4 / 5** |
| COPD | ❌ | ✅ | ✅ | ❌ | ✅ | **3 / 5** |

**The critique's "exactly one of four" is wrong.** For mobility — the group the
headline is about — the widening claim survives on four of five scales, including
the two scales that are structurally immune to the ceiling (risk ratio and odds
ratio of the *adverse* outcome, which are unbounded above as coverage rises). The
one scale it fails on is the absolute count, and it fails there for the trivially
good reason that B shelters 4,204 more people than A.

**But the critique is right about the sentence we actually published.** The
published claim is not "widens"; it is the inverted U, "13.0 → **24.5** →
**12.9**" — widen *then narrow*. That shape holds on **one scale only, scale 1**:

| Group | scales on which A→B widens **and** B→C narrows |
|---|---|
| Mobility-limited | scale 1 only (on 2, 3 and 5 the gap keeps widening at C, with non-overlapping CIs) |
| Age 65+ | scale 1 only (2, 3, 5 are flat B→C within noise) |
| COPD | none (scale 1 never widens) |

So: **the widening is robust; the "and then C fixes it" is a percentage-point
artefact.** The chapter's rhetorical arc — capacity breaks equity, siting repairs
it — is not supported on any scale except the one the critique named.

### 5.2 The chapter's own ratio defence is the wrong ratio

`Capacity_Is_Not_Access.tex:746-748` answers the ceiling objection by pointing at
"the ratio scale", where the gap "narrows at every step, from 1.66 to 1.34 to
1.15". Recomputed pooled, that is the **ratio of access rates**
(unimpaired ÷ impaired *sheltered*): 1.625 [1.565, 1.686] → 1.337 [1.322, 1.352]
→ 1.157 [1.149, 1.166].

That statistic is bounded above by 1 / p_unimpaired and is *mathematically
compelled* to converge to 1.00 as coverage approaches 100%, no matter what
happens to equity. It carries the same ceiling defect the chapter is defending
against, in the opposite direction. The complement ratio on the same 2×2 tables —
risk of being **left outside** — runs **1.19 → 7.85 → 11.28**. Same data, same
runs, opposite conclusion.

**This is a defect in our rebuttal, not in the critique.** The chapter must either
report the left-outside ratio alongside the access ratio, or drop the ratio
defence. Reporting only the ceiling-bounded direction of the ratio, in a passage
whose explicit purpose is to disarm a ceiling objection, is not defensible.

### 5.3 Which scale would a county actually act on?

**Scale 4 (absolute count) sets the budget; scale 5 (composition) sets the
design. Neither pp, RR nor OR is directly actionable.**

- A county buying cots, vans, or outreach shifts needs **scale 4**: how many
  people are still outside, and how many of them cannot walk. C leaves
  **205 mobility-limited residents outside per run** (95% seed interval
  [196, 214]) against B's 388.6 [382, 395]. That is the procurement number:
  ~184 fewer transport-dependent people per episode, at identical total capacity.
- A county designing *what to do about them* needs **scale 5**: in C, **74% of
  everyone still outside has a mobility limitation.** That is the number that
  converts the residual from "a shelter capacity problem" into "a paratransit,
  door-to-door pickup and in-place filtration problem". At 74%, a
  general-purpose outreach van is the wrong instrument.
- Percentage points, risk ratios and odds ratios are inference tools for deciding
  *whether* a disparity is real. They do not size a purchase order. The pp gap in
  particular changes sign between mobility and COPD for reasons that are purely
  arithmetic, which is disqualifying for an operational metric.

### 5.4 Is there a claim that survives all five scales?

Yes. Precisely stated:

> **In every arm, on every scale, and in all nine seeds, mobility-limited
> residents are over-represented among those left outside — and the
> over-representation grows monotonically as total coverage rises. They are 20.4%
> of the population but 23.3% of the outdoor residual in A, 66.8% in B and 74.3%
> in C (Wilson 95% CIs exclude 20.4% in all three arms; per-seed minima 22.09%,
> 64.27%, 69.18%). No intervention tested makes the people still outside look
> like the population.**

Every scale agrees with this: scale 1 gap > 0 in all arms (per-seed min 11.36 pp);
scales 2 and 3 > 1 in all arms (per-seed minima RR 1.17, OR 1.80); scale 4 is
non-zero and over-represented in all arms; scale 5 exceeds base in all arms.

A second claim survives all five and is the one worth publishing in place of the
inverted U:

> **At identical total capacity (6,842 spaces), moving capacity to better-placed
> sites (C) cuts the number of mobility-limited residents left outside by 47%
> relative to concentrating it at existing sites (B) — 205 vs 389 per run — while
> making the remaining residual *more* concentrated in that group, from 67% to
> 74%. Better siting shrinks the last-mile problem; it does not change its
> character, and it does not solve it.**

That is honest on scales 1 and 4 (C better), on scales 2, 3 and 5 (C worse), and
it is the version a county can act on.

---

## 6. The temporal result the critique says is sitting unused

The critique is **correct** that this is computed and unreported. It is in
`agents.csv` (`time_started_tick`, `time_arrived_tick`, `travel_time_min`) and
appears nowhere in `PRESENT_DAY_THREE_ARM_RESULTS.md` or the chapter.

### 6.1 Episode geometry

Every agent in all 27 runs departs at **tick 960 = hour 16** (the county-uniform
PM2.5 field crosses the 55.5 µg/m³ evacuation threshold once, so departures are
not staggered — a real model limitation, see §6.4). The last arrival at seed 42
is tick 1,539 = **hour 25.7**; the last arrival in any of the 27 runs is tick
1,973 = **hour 32.9** (seed 46, and seeds 48/49 reach h31–33). The smoke-field
peak is **hour 140 at 562.7 µg/m³**, reproduced from
`Geography/src/geography/env/SmokeField.java:52-92`.

**So the entire evacuation is over by hour 26 at seed 42 — and by hour 33 in
every one of the 27 runs — of a 312-hour episode.** After that the outdoor
headcount is frozen for the remaining 279–286 hours:

| arm | outdoors at h20 | at h30 | at h140 (peak) | at h311 |
|---|---|---|---|---|
| A | 4,928 | 4,786 | 4,786 | 4,786 |
| B | 1,311 | 582 | 582 | 582 |
| C | 812 | 276 | 276 | 276 |

### 6.2 Time to shelter by mobility status (hours; mean over 9 seeds)

| arm | group | n | mean | p50 | p75 | p90 | p99 | max | ≤1 h | ≤2 h |
|---|---|---|---|---|---|---|---|---|---|---|
| A | mobility | 280 | 0.47 | 0.13 | 0.27 | 0.88 | 5.46 | 10.71 | 92.0% | 93.9% |
| A | unimpaired | 1,776 | 0.61 | 0.13 | 0.31 | 2.11 | 4.31 | 6.87 | 86.0% | 88.4% |
| B | mobility | 1,006 | 1.56 | 0.44 | 1.13 | **6.83** | 8.20 | 11.34 | 73.5% | 78.2% |
| B | unimpaired | 5,254 | 1.32 | 0.38 | 1.00 | 4.11 | 8.02 | 8.28 | 75.1% | 79.4% |
| C | mobility | 1,190 | 1.27 | 0.48 | 1.16 | **4.13** | 9.26 | 11.90 | 71.1% | 84.9% |
| C | unimpaired | 5,376 | 0.97 | 0.36 | 0.82 | **2.03** | 8.84 | 9.48 | 79.9% | 90.0% |

**Read arm A with care — it is a survivorship artefact.** Only 280 of ~1,395
mobility-limited residents shelter at all in A, and they are the ones nearest a
shelter, so A's mobility time-to-shelter (0.47 h) looks *better* than its
unimpaired figure (0.61 h). It is not a finding; it is selection on the outcome.
Any published version must state that this distribution is conditional on
sheltering and therefore not comparable across arms.

Within an arm the comparison is sound: in C the mobility-limited **p90 is 4.13 h
vs 2.03 h unimpaired — a 2.0× longer tail**, and in B 6.83 h vs 4.11 h (1.7×).
The median barely moves (0.48 vs 0.36 h). **The mobility penalty is entirely in
the tail, not the centre** — which is itself a result: a policy that targets
"average travel time" would miss it completely.

### 6.3 Person-hours outdoors and where C's benefit lands

Outdoor time is counted from departure (h16) to arrival for shelterers, and from
departure to h312 for the 4,786 / 582 / 276 who never get in. Hours 0–16 are
pre-evacuation and identical across arms, so they are excluded.

| arm | person-hours outdoors | of which never-sheltered | mobility-limited | unimpaired | person-µg m⁻³ h |
|---|---|---|---|---|---|
| A | 1,417,876 | 1,416,656 (99.9%) | 330,104 | 1,087,771 | 257,992,406 |
| B | 180,762 | 172,272 (95.3%) | 116,579 | 64,183 | 32,285,616 |
| C | 88,445 | 81,696 (92.4%) | 62,192 | 26,253 | 15,693,029 |

Note the composition flip: in A, mobility-limited people absorb 23% of outdoor
person-hours; in B, **64%**; in C, **70%**. Same story as scale 5, in the exposure
currency.

**Does C help mainly at the peak or throughout? Throughout.**

| comparison | avoided person-µg m⁻³ h | in evacuation window h16–32 | in peak window h128–152 (8.4% of episode) | after evacuation ends |
|---|---|---|---|---|
| A → C | 242,299,377 | **0.73%** | 18.00% | **99.27%** |
| A → B | 225,706,790 | 0.66% | 18.01% | 99.34% |
| B → C | 16,592,587 | 1.64% | 17.83% | 98.36% |

Because the outdoor headcount is frozen after hour 26, the *time profile* of C's
benefit is just the shape of the ambient PM2.5 curve. The ±12 h peak window is
8.4% of the post-departure episode and carries 18.0% of the avoided exposure —
about **2.1× its time share**, but **82% of the benefit accrues outside it**, and
99.3% accrues after the last person has finished walking.

**The correct one-sentence statement of the mechanism:** C does not work by
getting people indoors faster during the peak — everyone who ever gets indoors is
indoors by hour 26, 114 hours before the peak. C works by **permanently removing
306 people (vs B) and 4,510 people (vs A) from the standing outdoor population for
the remaining 286 hours**, of which the peak is simply the most expensive stretch.

### 6.4 Two honest limitations of the temporal result

1. **Simultaneous departure.** All 6,842 agents leave at the same tick because
   the smoke field is county-uniform (`SmokeField.java:15-25`, deliberate design
   choice) so the threshold is crossed everywhere at once. Real evacuation
   decisions are staggered by information access, trust and encampment social
   structure. Every time-to-shelter number above is therefore a *travel-time*
   distribution, not a *decision-plus-travel* distribution, and the true tail is
   longer than reported.
2. **The peak is irrelevant to arrivals by construction.** Because departures are
   simultaneous and early (h16) and the peak is at h140, this model *cannot*
   produce a "people caught outdoors during the peak surge" result. That is a
   consequence of the uniform field, not evidence that such a dynamic does not
   exist. Any claim about peak-hour dynamics needs a spatially or temporally
   heterogeneous departure model first.

---

## 7. What should change in the published documents

1. `PRESENT_DAY_THREE_ARM_RESULTS.md:123` and `README.md:54-56` — replace seed-42
   figures with pooled 9-seed values and a seed interval:
   12.54 → 24.31 → 13.40 pp.
2. `Capacity_Is_Not_Access.tex:746-748` — the ratio defence must report the
   left-outside ratio (1.19 → 7.85 → 11.28) alongside the access ratio
   (1.63 → 1.34 → 1.16), or be withdrawn. As written it defends against a ceiling
   objection using a ceiling-bounded statistic.
3. `Capacity_Is_Not_Access.tex:762-766` and the surrounding prose — drop
   "better-placed capacity returns it to 12.9" as an equity claim. It is true on
   one scale of five and false on three. Replace with §5.4's second claim.
4. Add the COPD sign reversal (§4) explicitly. It is the strongest internal
   evidence that we understand the ceiling problem, and it currently appears
   nowhere.
5. Publish §6. The temporal block is fully computed, materially strengthens the
   exposure argument (person-µg m⁻³ h: 258M → 32M → 16M), and its limitations
   (§6.4) are already documented design choices.

---

*Recompute with:*
`python scripts/analysis/equity_scales.py --json out.json`
*Reads the 27 runs under `Geography/output/{A,B,C}2026-n6842-seed{42..50}/` and
`Geography/data/airnow/aqs_hourly_pm25_portland_2020-09.csv`. No fitted
parameters; every number above is a direct recount.*
