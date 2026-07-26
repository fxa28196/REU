# What we found, in plain language

**The question:** if the September 2020 wildfire smoke came back today, what
would happen to people living outside in Multnomah County - and could we do
better just by putting the shelters in different places?

We simulated **2,037 people** living outside. Each one is a separate
person with their own age, health, and walking speed. When the smoke got
dangerous, each of them walked along real Portland streets toward the nearest
shelter that still had room.

We ran it twice:

* **Scenario A** - the **28 shelters we actually have today**, where they
  actually are, with the number of beds they actually have.
* **Scenario B** - the **exact same shelters and the exact same
  1,816 beds**, just moved to better locations.

Nothing else changed. Same people, same health, same smoke, same streets, same
number of beds.

---

## The headline

| | Shelters where they are now | Shelters moved | Difference |
|---|---|---|---|
| **People who got indoors** | 1,625 | **1,816** | **+191 people** |
| Percent who got indoors | 79.8% | **89.2%** | |
| People left outside | 412 | 221 | |
| **Beds that sat empty** | **191** | **0** | |
| Average walk | 11.4 km | 7.26 km | -36% |
| **Smoke breathed in, per person** | 6,970 ug | **3,784 ug** | **-46%** |
| Hours everyone spent in dangerous air | 82,088 | 44,102 | -46% |

### The one sentence version

> **Moving the shelters we already have - without adding a single bed - got
> 191 more people indoors and cut the amount of smoke people breathed
> in by 46%.**

### Why that works

In Scenario A, **191 beds sat completely empty** while
402 people were turned away. The beds existed. They
were just in places those people could not walk to in time. Moving the same
shelters closer to where people actually are filled every single bed.

---

## Who gets left behind

This is the part that matters most. When shelters are badly placed, the people
who lose out are the ones who walk slowest.

| Group | Got indoors (now) | Got indoors (moved) |
|---|---|---|
| **People who have trouble walking** | **58.1%** | **82.9%** |
| People who walk normally | 84.9% | 90.6% |
| People with COPD | 69.2% | 87.1% |
| People without COPD | 81.1% | 89.4% |

People with trouble walking move at about **0.97 metres per second**;
everyone else moves at about **1.36**. Over a long walk through
smoke that difference decides who reaches a bed before it is taken.

---

## What the files are

| File | What it holds |
|---|---|
| `1_EVERY_PERSON.csv` | One row per person. Every column is a plain question |
| `2_BY_GROUP.csv` | The same results grouped by age, walking ability, asthma, COPD, chronic condition |
| `3_WHOLE_POPULATION.csv` | One row per scenario - totals for everybody |
| `figures/` | Six charts, including a map |

---

## What this does NOT say

* It does **not** predict anyone getting sick. It measures how much smoke people
  breathe, not what that smoke does to them.
* The "better locations" are points on the street map chosen by a computer. They
  are not real buildings, and nobody has checked whether a shelter could go there.
* It assumes everyone tries to reach a shelter. In reality many do not - a local
  survey found most people who had used shelters described the experience
  negatively. Real numbers would be lower than Scenario A.
* Shelter locations and capacities come from the county's July 2026 list. The
  smoke is real measured air from September 2020, used as a "what if it happened
  again" scenario.
