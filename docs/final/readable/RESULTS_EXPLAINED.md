# What we found, in plain language

**The question:** if the September 2020 wildfire smoke came back today, what
would happen to the 6,842 people living outside in Multnomah County -
and what actually helps: more beds, or better-placed beds?

Every person in the simulation is separate, with their own age, sex, health,
and walking speed, drawn from published local surveys. Each one starts at a
real reported campsite location and, when the smoke gets dangerous, walks
along real Portland streets toward the nearest shelter that still has room.

We ran three scenarios. **Each one exists to answer the question the previous
one raised.**

* **Scenario A - today.** The 36 clean-air-capable facilities the county
  actually operates, at their real addresses, with their real
  2,234 spaces.
* **Scenario B - more beds, same buildings.** Every real facility grows about
  3x, so the system holds exactly 6,842 - one bed per person. Nothing
  moves.
* **Scenario C - same number of beds, better places.** The real facilities
  grow only 1.5x, and the rest of the capacity is built as **ten new
  shelters at locations a placement algorithm chose** - same
  6,842 total beds as B.

Everything else is identical: same people, same smoke, same streets.
And every number below was re-run with nine different random seeds -
the ranges in `3_WHOLE_POPULATION.csv` show the story never moves.

---

## The headline

| | A - today | B - more beds | C - better-placed beds |
|---|---|---|---|
| **People who got indoors** | 2,060 (30.1%) | 6,264 (91.6%) | **6,570 (96.0%)** |
| People turned away | 4,766 | 562 | **256** |
| Beds that sat empty | 174 | **578** | 272 |
| Average walk | 18.26 km | 7.94 km | **5.69 km** |
| Smoke breathed in, per person | 23,374 ug | 3,056 ug | **1,534 ug** |

### The three sentences that matter

> **1. Today's system shelters fewer than one person in three - not because
> people won't walk, but because there is roughly one space for every three
> people.**

> **2. Tripling the size of the buildings we already have fixes most of it -
> but leaves 578 beds EMPTY while 562 people are turned away,
> because the extra beds went where the buildings are, not where the people
> are.**

> **3. Spending the same beds differently - ten new well-placed shelters -
> cuts refusals to 256, and cuts the smoke people breathe in half
> again.**

---

## Who gets left behind

The gap between people who walk easily and people who don't:

| | A | B | C |
|---|---|---|---|
| Walks without difficulty - got indoors | 32.7% | 96.4% | 98.6% |
| Trouble walking - got indoors | 19.7% | 71.9% | 85.7% |
| **The gap (percentage points)** | **13.0** | **24.5** | **12.9** |

Adding beds to the buildings we already have makes the gap WIDER - the new
beds are grabbed first by whoever can walk there fastest. Placing the new
beds well brings the gap back down while lifting everyone.

People with COPD follow the same pattern (22.2% -> 86.2% -> 93.8%),
because COPD is the one condition with published evidence that it slows
walking (about 0.19 m/s slower). Asthma shows no access gap - not an
oversight: no evidence exists that asthma slows walking, so the model does
not invent it.

---

## What the files are

| File | What it holds |
|---|---|
| `1_EVERY_PERSON.csv` | One row per person per scenario (20,526 rows). Every column is a plain question |
| `2_BY_GROUP.csv` | The same results grouped by age, walking ability, asthma, COPD, chronic condition |
| `3_WHOLE_POPULATION.csv` | One row per scenario - totals, each with its range across all nine seeds |
| `figures/` | Six charts, including the map |

The full technical breakdown - every equation, every source, every code
snippet, every one of the 27 runs - is in
`docs/final/TECHNICAL_REFERENCE.md`.

---

## What this does NOT say

* It does **not** predict anyone getting sick. It measures how much smoke
  people breathe, not what that smoke does to them.
* The ten "new shelters" are points on the street map chosen by an
  algorithm. They are not real buildings, and nobody has checked zoning,
  cost, or whether a shelter could actually be built there.
* It assumes everyone knows the shelters exist and heads for one. A local
  survey found 65% of unsheltered people had never heard of the shelters -
  so scenario A's numbers are, if anything, optimistic.
* Two real facilities (Clinton Triangle, ~160 spaces, and Multnomah Safe
  Rest Village, 28) are missing because they publish no street address.
* The smoke is the real, measured September 2020 event, used as a
  "what if it happened again" scenario against today's shelter system.
