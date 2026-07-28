# 07 — C-random: how much of arm C is optimisation, and how much is dispersion?

**The critique.** Arm C's ten new sites were placed by greedy capacity-aware
p-median against the *same* encampment demand points the run is then scored on.
"C beats B" may therefore be partly definitional: the sites were fitted to the
test set. The highest-value missing experiment is a control that keeps
everything about C and switches the optimiser off.

**The critique is right that the control was missing, and it was worth running.
It changes what we are entitled to claim.** Two of arm C's three headline
claims survive only as claims about *building ten more doors*, not about
*placing them well*.

---

## Design

Two control families were built, not one, because the obvious control turns out
to be a strawman.

| | arm C | C-random (bbox) | C-random (pool) |
|---|---|---|---|
| 36 real facilities, real coordinates, ×1.5 | yes | yes | yes |
| ten new sites | yes | yes | yes |
| per-site capacity vector | — | copied from C, facility-for-facility | copied from C, facility-for-facility |
| total capacity | 6,842 | 6,842 | 6,842 |
| population / demographics / PM2.5 / street graph / opening dates | — | identical | identical |
| **where the ten sites come from** | **greedy p-median over the 498-node candidate set** | **uniform random over street nodes in the demand bounding box** | **uniform random over the same 498-node candidate set** |

*Verified mechanically:* all six control CSVs are capacity-identical to arm C
facility-for-facility (0 per-site differences), the 36 real coordinates are
byte-identical to C's, and exactly 10/10 new-site coordinates differ. Only
coordinates change.

**Why the second family exists.** The bounding box is several times the area of
the demand footprint — demand sits in lon [−122.726, −122.511] and lat
[45.471, 45.588] (p05–p95 of the B-seed42 start points) while the box spans lon
[−122.806, −122.457], lat [45.418, 45.664]. A uniform draw therefore lands
almost entirely in the low-density periphery, and differs from p-median in *two*
ways at once: **where it looks** and **how it chooses**. The pool family holds
the search space fixed — it draws from exactly the candidate set C's optimiser
searched, rebuilt verbatim from `scripts/build_scenario_c_2026.py` lines 135–143
and verified by asserting that all ten sites C actually chose are members of it.
Only the **selection rule** differs. That is the number that answers the
critique.

Site selection RNG: `python random.Random(site_seed)`, site-seeds 1/2/3 (bbox)
and 4/5/6 (pool) — fixed and stated, and unrelated to the model's own
`randomSeed`.

**Reproduction control.** Another workstream was editing `GisAgent.java` and
`Shelter.java` concurrently. Arms B and C were therefore re-run from the same
working-tree build the controls used: both reproduced the archived runs exactly
on every metric (B 6,264 sheltered / 562 turned away / 7,938 m / 4,789;
C 6,570 / 256 / 5,689 / 2,361). The comparison below is not confounded by that
work.

---

## Results

Mean over model seeds 42–44; brackets are min–max across all runs in the family
(3 runs for B and C, **9 runs** for each control family = 3 draws × 3 seeds).

| | **B** 36 sites | **C-random (bbox)** | **C-random (pool)** | **C** p-median |
|---|---|---|---|---|
| Facilities / beds | 36 / 6,842 | 46 / 6,842 | 46 / 6,842 | 46 / 6,842 |
| **Got inside** | 6,261 (91.5%) [6,259–6,264] | **3,075 (44.9%)** [3,073–3,078] | **6,567 (96.0%)** [6,565–6,570] | **6,567 (96.0%)** [6,565–6,570] |
| **Turned away** | 559 [558–562] | **3,745** [3,744–3,748] | **253** [252–256] | **253** [252–256] |
| Beds left empty | 581 [578–583] | 3,767 [3,764–3,769] | 275 [272–277] | 275 [272–277] |
| The ten new sites filled | — | **17 / 3,492** [15–22] | 3,492 / 3,492 | 3,492 / 3,492 |
| **Mean walk, all residents** | 7,987 m [7,938–8,085] | 16,380 m [16,347–16,400] | **14,913 m** [12,856–16,576] | **5,443 m** [5,198–5,689] |
| Mean walk, sheltered only | 6,141 m [6,087–6,220] | 4,008 m [3,982–4,028] | 13,842 m [12,178–15,029] | 4,502 m [4,301–4,708] |
| **Mean dose (µg·m⁻³·h)** | 4,813 [4,789–4,828] | 29,825 [29,801–29,841] | **2,504** [2,468–2,535] | **2,383** [2,361–2,397] |
| Mean hours in unhealthy air | 17.6 [17.5–17.7] | 107.1 [107.1–107.2] | 10.2 [9.9–10.4] | 8.7 [8.6–8.7] |
| Mean smoke inhaled | 3,071 µg [3,056–3,080] | 18,472 µg [18,457–18,481] | 1,742 µg [1,708–1,775] | 1,545 µg [1,534–1,551] |

The `bbox` mean-walk-of-sheltered figure (4,008 m) is low for the wrong reason:
only the 45% who reached one of the *real* shelters are in that average at all.

---

## The decomposition

Reading B → C-random(pool) as **dispersion** (ten more doors, chosen without
skill, from the same shortlist) and C-random(pool) → C as **optimisation**
(choosing well among that shortlist):

| B → C change | total | dispersion | optimisation |
|---|---|---|---|
| Got inside | +306 | **+306 (100%)** | **0 (0%)** |
| Turned away | −306 | **−306 (100%)** | **0 (0%)** |
| Beds left empty | −306 | **−306 (100%)** | **0 (0%)** |
| Mean dose | −2,430 | −2,309 (95.0%) | −121 (5.0%) |
| Mean hours outdoors | −8.9 | −7.4 (83.1%) | −1.5 (16.9%) |
| Mean smoke inhaled | −1,526 µg | −1,329 (87.1%) | −197 (12.9%) |
| **Mean walk** | **−2,544 m** | **+6,926 m (worse)** | **−9,470 m (all of it, and more)** |

### 1. The access result is entirely dispersion. Optimisation contributes zero.

Not "approximately zero" — **exactly** zero, run for run. Random siting within
C's own candidate set reproduces arm C's sheltered count at every seed:
6,570 / 6,565 / 6,566 for seeds 42 / 43 / 44, identical in all three random
draws and in arm C. Turned-away (256 / 252 / 252) and beds-empty are likewise
identical. Three different shelter files with three different SHA-256 sums
(`0e50ffdde0`, `d4b49ee48c`, `43ccf646a3`) and mean walks differing by 3,500 m
produce the same access numbers to the person.

The mechanism is visible in the occupancy: in all nine pool runs the ten new
sites fill to 3,492 / 3,492. Once ten doors of ~350 beds each exist anywhere in
the built-up area, they saturate. Who gets inside is then fixed by total
capacity and by the 36 real sites — not by where the new ten sit.

**So `96.0% sheltered`, `refusals halved 562 → 256`, and `empty beds halved
578 → 272` are results about building ten more shelters, not about siting them
optimally. The critique is correct on exactly this point.**

### 2. The walking result is entirely optimisation — and then some.

Dispersion makes walking substantially *worse* than B (7,987 m → 14,913 m,
+87%). Random-but-plausible siting scatters people across long routes.
Optimisation pulls it back to 5,443 m. The published `B → C walking −28.3%`
depends on p-median completely; there is no version of it that survives random
siting.

### 3. The exposure result is mostly dispersion, plus a small real optimisation premium.

C's dose advantage over the pool control is 4.8% and its inhaled-dose advantage
11.3%, with **non-overlapping ranges** on both (dose 2,361–2,397 vs 2,468–2,535;
inhaled 1,534–1,551 vs 1,708–1,775). Real, replicated, and much smaller than the
headline `−50.7%` implies: about 95% of that halving is dispersion. The reason
the 3.1× walking difference produces only a ~15% exposure difference is that
most exposure hours are spent waiting outdoors before the PM2.5 threshold trips
and before shelters open — walking is a minor share of time outdoors.

### 4. Siting *badly* is far worse than not building at all.

The bbox family is not merely unhelpful, it is destructive: 44.9% sheltered
against B's 91.5%, with 3,767 beds standing empty and the ten new sites drawing
17 people between them out of 3,492 places. Moving half the system's capacity
(3,492 of 6,842 beds) to locations chosen without regard to where people are
strands that capacity completely. Mean dose is 6.2× B's.

This is the one place arm C's thesis is vindicated in the strong form: geography
can destroy a capacity investment. But the relevant geographic decision is the
coarse one — *inside the built-up demand region or not* — not the fine-grained
p-median optimum.

---

## What should change in the write-up

1. `B → C sheltered +4.9%`, `refusals 562 → 256`, `empty beds 578 → 272` must
   stop being attributed to optimal placement. They are attributable to adding
   ten facilities anywhere sensible. Nine control runs reproduce them exactly.
2. `B → C walking −28.3%` is a genuine optimisation result and can be claimed as
   one; it is the only headline number that is.
3. `B → C exposure −50.7%` should be split: ~95% dispersion, ~5% optimisation.
4. The "same beds, better places" framing overstates the case. The defensible
   claim is **"same beds, more doors"** for access, plus **"and placing those
   doors well cuts the walk by two thirds and exposure by a further ~5–13%."**
5. The bbox family is worth reporting in its own right: it is the quantitative
   answer to "does it matter where you put them?" — yes, catastrophically, at
   the scale of *which part of the county*.

## Limitations

- New sites in every arm here are street-network nodes, not verified venues with
  filtered indoor air. That caveat is inherited from arm C unchanged.
- Three draws per family bound the spread; they are not a confidence interval.
  The access numbers need no interval (identical run for run); the walk numbers
  vary meaningfully across draws (12,856–16,576 m) and three draws is thin.
- Arm C's 498-node candidate set is itself only the first 500 grid-deduplicated
  nodes in node order within the demand bbox, not a principled sample of the
  county. The pool control inherits that arbitrariness deliberately — that is
  what makes it matched — but it means "random from the pool" is already a
  moderately sensible siting policy, i.e. *urban locations*. The honest
  statement of result 1 is "optimisation adds nothing **relative to plausible
  urban siting**", not "site selection never matters".
- Seeds 42–44 only (3 model seeds), against the published arms' nine.
- Arm C's p-median is greedy, a heuristic, not a proven global optimum; a better
  optimiser could only widen the C-vs-pool walking gap, not the access gap,
  which is already saturated.

## Reproducing

```
python scripts/build_scenario_crandom_2026.py        # -> r1,r2,r3  (bbox)
python scripts/build_scenario_crandom_pool_2026.py   # -> r4,r5,r6  (pool)
.\Geography\gradlew.bat -p Geography compileJava
powershell -File scripts\run-headless.ps1 -ParamsFile "batch\batch_params_2026_CR1_seed42.xml"
powershell -File scripts\run-headless.ps1 -ParamsFile "batch\batch_params_2026_CP4_seed42.xml"
```

`scenarioCode` 4/5/6 = C-random bbox r1/r2/r3; 8/9/10 = C-random pool r4/r5/r6
(`Geography/src/geography/agents/ContextCreator.java`). Output is keyed by seed
only and was renamed immediately to
`Geography/output/CR2026r{1,2,3}-n6842-seed{42,43,44}` and
`Geography/output/CP2026r{4,5,6}-n6842-seed{42,43,44}`; reproduction controls are
`VERIFYB-n6842-seed42` and `VERIFYC-n6842-seed42`. Site manifests:
`docs/runs/scenario-crandom-2026/scenario_crandom_report.json` and
`scenario_crandom_pool_report.json`.
