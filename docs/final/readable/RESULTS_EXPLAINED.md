# What we found, in plain language

**The question:** if the September 2020 wildfire smoke came back today, what
would happen to the 6,842 people living outside in Multnomah County -
and what actually helps: more beds, or the same beds arranged differently?

Every person in the simulation is separate, with their own age, sex, health,
and walking speed, drawn from published local surveys. Each one starts at a
real reported campsite location and, when the smoke gets dangerous, walks
along real Portland streets toward the nearest shelter that still has room.

We ran four scenarios. **Each one exists to answer the question the previous
one raised.**

* **Scenario A - today.** The 36 shelter facilities the county
  actually operates, at their real addresses, with their real
  2,234 spaces. (They are not established to filter
  their air, and the model does not simulate indoor air - reaching the door is
  where it stops measuring.)
* **Scenario B - more beds, same buildings.** Every real facility grows about
  3x, so the system holds exactly 6,842 - one bed per person. Nothing
  moves.
* **Scenario C - same total, more doors.** The real facilities
  grow only 1.5x, and the rest of the capacity is built as **ten additional
  shelters at locations a placement algorithm chose** - the same
  6,842 total beds as B, split across more sites.
* **Scenario D - B's beds plus one rule.** Nothing is built and nothing
  moves: each shelter simply holds back one bed in ten (a 10% triage
  reserve) for the residents who walk slowest.

Everything else is identical: same people, same smoke, same streets.
And every number below was re-run with nine different random seeds
(scenario D with three) - the ranges in `3_WHOLE_POPULATION.csv` show
the story never moves.

---

## The headline

| | A - today | B - more beds | C - same total, more doors |
|---|---|---|---|
| **People who got indoors** | 2,060 (30.1%) | 6,264 (91.6%) | **6,570 (96.0%)** |
| People turned away | 4,754 | 550 | **244** |
| Could not reach any shelter | 28 | 28 | 28 |
| Beds that sat empty | 174 | **578** | 272 |
| Average walk | 18.24 km | 7.90 km | **5.90 km** |
| Smoke breathed in, per person | 23,373 ug | 3,056 ug | **1,536 ug** |

### What the scenarios show

> **1. Today's system shelters fewer than one person in three - not because
> people won't walk, but because there is roughly one space for every three
> people.**

> **2. Tripling the size of the buildings we already have fixes most of it -
> but 578 beds still sit EMPTY while 550 people are turned away and 28
> cannot reach any shelter at all (their camps sit in street-network pockets
> walled off by freeways). That is not a coincidence the model uncovered -
> it is arithmetic forced by the design: B holds exactly one bed per person,
> so every person turned away or cut off leaves exactly one bed empty
> (550 + 28 = 578).**

> **3. Spending the same total differently - ten more doors instead of ten
> bigger buildings - cuts refusals to 244 and halves the smoke people
> breathe again.**

The mechanism behind sentence 3 is more places to try, not smarter places:
when we redrew the ten extra sites at random from the same candidate list,
the head-count came out the same, run for run. The placement algorithm earns
credit for one thing only - the walk to shelter, about 28% shorter than in
B - and even that assumes planners know exactly where everyone sleeps.

> **4. The cheapest fix we tested is not a building. Scenario B's access gap
> between people who walk easily and people who don't is 23.7 percentage
> points; scenario D's one-bed-in-ten reserve takes it to -0.5 - effectively
> zero - while sheltering exactly as many people, at zero capital cost. And
> the gap is a knife-edge feature of a system with exactly one bed per
> person: give it even 20% more beds than people, and the gap dissolves on
> its own.**

---

## Who gets left behind

The gap between people who walk easily and people who don't:

| | A | B | C |
|---|---|---|---|
| Walks without difficulty - got indoors | 32.6% | 96.3% | 98.5% |
| Trouble walking - got indoors | 20.1% | 72.6% | 86.0% |
| **The gap (percentage points)** | **12.5** | **23.7** | **12.5** |

Adding beds only to the buildings we already have makes the gap WIDER - the
new beds are grabbed first by whoever can walk there fastest. Splitting the
same total across more doors brings the gap partly back down while lifting
everyone - but at every scale of the system, the group left behind is the
same one. Scenario D is what closes it: the one-bed-in-ten reserve turns B's
23.7-point gap into -0.5 (the other two seeds tested agree, at -0.1 and
+1.5) with not one person fewer sheltered. Bigger reserves overshoot -
holding back 15% or more starts turning people away.

People with COPD follow the same pattern (22.6% -> 87.3% -> 95.1%),
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
* Two results ran against the predictions we wrote down before the runs
  (recorded as prediction misses P-3c and P-3d): in a bed-capacity sweep,
  access reaches 99.5% already at 1.2x demand, and the walking-difficulty
  gap vanishes at every surplus level tested (1.2x, 1.4x, 1.6x). So the
  equity gap - and the head-count value of extra doors - are knife-edge
  phenomena of a system holding exactly one bed per person; scenario D's
  zero-cost reserve is the fix exactly at that knife edge.
