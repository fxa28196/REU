# Presenter's Script
### Wildfire smoke, shelter placement, and who gets left outside
*Read this once slowly, then twice out loud. Bold lines are the ones to say more or less as written.*

---

## HOW TO USE THIS

This document follows the slides in order. Each heading carries a target time; the whole spoken track is about 15 minutes. Paragraphs marked *[cut for time]* can go without leaving a hole.

Everything else in a section is answer-bank material — there so that when someone interrupts, you have the answer.

Three habits will carry the whole talk:

1. **Say the number, then say what it counts.** Never "thirty percent." Always "thirty percent — two thousand and sixty of the six thousand eight hundred and forty-two people living outside."
2. **Volunteer the limitation before you are asked.** This is not modesty. A dean's trust in your good numbers is built entirely out of watching you be straight about your bad ones.
3. **When you don't know, say "I don't know, and here is what we'd need to know it."** That sentence is always available to you.

---

## WORDS YOU WILL NEED

*Learn these before anything else. Every one of them appears in a question you are likely to get.*

| Term | What to say if asked |
|---|---|
| **random starting point** (= *seed*, = *run ID*) | "The model uses random numbers. A random starting point is the one number that fixes the whole sequence, so the same starting point always produces the same run. We label them 42 through 50." **Use "random starting point" in the talk; only say "seed" if the slide says it.** |
| **scenario** (never "arm") | A, B, or C — and D, which is B with one intake rule changed. One word only. |
| **intersection** (= *node*) | The model turns the street map into a set of intersections joined by street segments. That is what lets it find routes. Say "intersection." |
| **street segment** (= *edge*) | A piece of street between two intersections. The wormholes were **impossible connections** between segments. |
| **tick** | "The model advances in one-minute steps. Each step is a tick." |
| **function** / **method** / **routine** | "A named piece of the program that does one job." All three words mean that. |
| **version control / commit** | "Version control saves a dated, numbered snapshot of every file every time anything changes. A commit is one such snapshot. Before me, this project had none." |
| **checksum / fingerprint** | "A short code computed from a file. Change one character and the code changes completely, so you can prove you have the same file we did." Say "fingerprint." |
| **DOI** | "The permanent identifier code that a published paper carries, so a link never rots." |
| **n = 541** | "The study had 541 participants." |
| **hazard ratio 1.073 per 10 µg/m³** | "For every extra 10 micrograms of smoke, the death rate in that population went up about 7 per cent." |
| **relative risk** | "A ratio of outcome *rates* between two groups. Not a multiplier on exposure — that distinction is the whole of Slide 6." |
| **stratified** | Say "separately, side by side, unweighted." Don't say "stratified." |
| **emergent** | "Nobody programmed it. It falls out of the rules." |
| **survivorship bias** | "You only measure the winners." |
| **noise floor** | "How much the answer moves when nothing changes except the random starting point." |
| **binding constraint** | "The thing that is actually causing the failure." Instead of "it never binds," say "we never hit that limit." |
| **null result** | "It found no difference." |
| **upper bound / lower bound** | Never say these. Say **"the real number is probably higher than this"** or **"probably lower than this."** |
| **endpoint** | Use only for *"where the study stops measuring."* For map geometry say **"the recorded end of a street segment."** |
| **attribute table** | "A map file has two halves: the drawing, and a table of labels attached to the drawing. The drawing was fine. **The table of labels was corrupt.**" |

**Pronunciation.** BOO-kers (Buekers) · ZELL-mer (Zellmer) · bo-HAN-non (Bohannon) · BOYCE · SIL-cock (Silcock) · KON-doe (Kondo) · AT-kin-son (Atkinson) · "oh-H-S-U" (OHSU) · "H-RAC" (HRAC) · "micrograms" for µg · "P-M two point five" (PM2.5) · dyke-STRA (Dijkstra) · KAR-nee (Karney).

---

## IF YOU ONLY REMEMBER FIVE THINGS

**One.** In September 2020, wildfire smoke sat over Portland for thirteen days. We asked: if the same smoke arrived today, what happens to the people who live outdoors — and can the county do better with the shelters it already has?

**Two.** Today, about three in ten of them get inside. Specifically: 2,060 people out of 6,842 are admitted to a shelter. Seven in ten spend the event outdoors in unhealthy air.

**Three.** We tested two fixes. Adding beds to the buildings that already exist is the big one — it takes 30% up to 92%. But because capacity then equals population exactly, the arithmetic is forced: 578 beds finish the event empty, and that is exactly 550 people turned away plus 28 who cannot reach any shelter by any route. Split that same total across ten additional sites — more doors, not better-chosen doors — and you get 96% for zero additional beds; ten sites drawn at random from the same candidate list do just as well on headcount. And the surviving punchline is Scenario D: hold ten per cent of each shelter's spaces for the people who walk slowest, and the mobility access gap collapses from about 24 points to about zero — same beds, same buildings, zero capital cost.

**Four.** Four health-risk numbers in the original project brief could not be found in the papers they were credited to. So we switched health weighting off entirely and report vulnerable groups separately instead. **No result in this study depends on a number we could not trace.**

**Five.** Every run is reproducible. Twenty-seven simulation runs, nine different random starting points, every input file fingerprinted, and the model literally refuses to start if a number in it lacks a source. And as an honesty check we fit a regression to the model's own output: it learns back only the mechanisms we built, and finds nothing we didn't.

---

## THE WORD-SWAP CARD
*Seven phrases where the obvious wording will get you into trouble. Learn these.*

| Don't say | Say instead | Because |
|---|---|---|
| "6,842 beds" and "6,842 people" in the same breath | "one space per person" | Same numeral, two meanings, adjacent slides. Confusing. |
| "peaked at 563 micrograms" | "peaked at 562.7 — just under 563" | The chart on screen is labelled 562.7. Say what they can read. But **562** is also the number of people turned away in Scenario B, so always attach the unit: "562.7 micrograms," never bare "562." |
| "578 beds empty and 562 turned away — nearly the same number!" | "B has one bed per person and still fails 562 of them; 578 beds finish the event empty" | The near-equality is forced arithmetic, not a discovery. A methodologist will catch it. |
| "36 clean-air-capable facilities" | "36 existing shelter facilities" | Nobody has established those buildings have filtered air. **The Scenario A card on the slide does say "clean-air-capable." If anyone points at it: that wording on the slide is wrong, limitation 4 flags it, and we should have written "existing shelter facility."** |
| "no range overlaps between scenarios on any metric" | "on any *headline* metric" — the slide's own word | The "could not reach any shelter" row is identical across scenarios by construction. |
| "arms" | "scenarios" | Clinical-trial jargon. There is no reason for a second word. |
| "30 out of 100 reached a shelter" (the old routing test) | "in a 100-person test run, only 30 arrived" | Otherwise it sounds like you just restated the 30.1% headline. Always say "test run." |

**Numbers that collide. Always attach what they count.**
**194** = hours above the unhealthy line, *and* mobility-limited people still outside in C. · **99** = arrivals in the 100-person routing test, *and* real beds left unused at Charles Jordan. · **30** = the routing test, *and* 30.1% admitted. · **6,842** = beds *and* people.

---

### [SLIDE 1 — The question, and the smoke] · *2 minutes*

**In September 2020, wildfire smoke settled over Portland, Oregon and stayed for nearly two weeks.**

The chart on this slide is not a model output. It is measurement. It comes from the U.S. Environmental Protection Agency's air monitoring network — physical instruments on the ground, reporting once an hour.

What they were measuring is **PM2.5**. **That is fine particulate matter: soot particles smaller than two and a half micrometres across, roughly a thirtieth the width of a human hair.** They matter because that size passes the body's filters and lodges deep in the lung. It is measured in micrograms per cubic metre of air.

Three numbers from that chart, and they are all measured, not modelled:

- **The worst hour reached 562.7 micrograms per cubic metre** — the county-wide hourly average at 8pm on September the 12th.
- **Across the whole thirteen-day window, the average was 173 micrograms per cubic metre.** That matters more than the peak. **The air was not bad for an afternoon. It was three times over the unhealthy line for nearly two weeks on average.**
- **Thirteen days is 312 hours. 194 of those 312 hours were above 55.5 micrograms per cubic metre** — the EPA's own published threshold for "Unhealthy," the point at which the agency says everyone, not just sensitive groups, may experience health effects. **Sixty-two percent of the event was unhealthy air.**

*[cut for time]* One provenance point on the caption: EPA sets its own "Wildfire — U.S." qualifier flag on 1,576 rows of this file, and those rows span exactly this window. **The agency itself certifies that this is wildfire smoke. We did not have to decide that.**

The air first crossed the unhealthy line at 4pm on September the 7th. The county did respond — it opened clean-air shelters — **but they opened on the 10th and 11th. Three days later.**

**Now the population.** We are concerned with people living outdoors, who cannot close a window.

The 2025 Tri-County Point-in-Time Count is the source. **A Point-in-Time Count is the annual one-night census of homelessness that federal funding requires.** It was run by Portland State University's Homelessness Research and Action Collaborative and published in November 2025.

It counted **10,526 people** experiencing homelessness in Multnomah County. **More than 65% of them were unsheltered. Sixty-five percent of 10,526 is 6,842.** That is our population.

**So the research question is: if a September-2020-magnitude smoke episode struck Multnomah County today, what happens to those 6,842 people — and can we do better by changing where the shelters are, rather than by wishing for more of them?**

**Bridge to the numbers on screen** *(the strip is visible the whole time you are talking):* **the three percentages at the top of this slide are the answer, and the rest of the talk is how we got them. Thirty per cent get inside today. Ninety-two if you add beds. Ninety-six if you spend the same beds better.**

**If they ask why 2020 smoke and 2026 shelters:** deliberate. It is the largest smoke event in the local record and it is measured hourly, so we don't have to invent it. **Every input except the weather, the sex distribution and the mobility distribution is contemporaneous** — those two come from the 2019 count, because no local replacement exists, and we list that as a limitation.

**If they ask about the encampment dates:** the campsite reports are 2025–26, used as a spatial stand-in for where people were in 2020. **That is still a limitation and it is still on the limitations slide.** What changed is that it used to be the *dominant* weakness of a study framed as 2020; reframing to the present day made it one weakness among several rather than the central one.

---

### [SLIDE 2 — Why there are three scenarios] · *1.5 minutes*

**The method here is an agent-based model. That means: instead of writing an equation about a population, we build one simulated person for every real person. Each has their own age, their own health, their own walking speed, their own starting location. Each one decides for itself, minute by minute, whether to leave and where to go. Then we watch what the crowd does.**

We do it that way because this problem is about individuals colliding with a limit. Whether you get a bed depends on whether *you* arrived before the beds ran out. An equation about averages cannot represent that.

We run three scenarios. **They are not three guesses. They are a chain — each one answers a question the previous one raised.**

**Scenario A is reality.** The real 36 shelter facilities, at their real locations, with their real capacity: 2,234 spaces. **A is not a treatment. It is a measurement. Its only job is to tell us what is actually causing the failure — is the problem that there aren't enough beds, or that they're in the wrong places?**

**Scenario B answers what A found.** A found that beds were the limit. So B adds beds: it scales every existing facility up until the county has exactly one space per person. Locations are completely unchanged from A. **A to B isolates capacity, and nothing else.**

**Scenario C answers what B found.** B left hundreds of beds empty while still refusing people. **So C spends B's identical total on different geography.** Every real facility stays exactly where it is and grows more modestly — one and a half times rather than three. The beds that frees up fund ten new facilities, placed at the best locations on the street network. **Same number of spaces. Different geography. B to C isolates placement, and nothing else.**

That last design point is worth defending, because we got it wrong first. **An earlier version of Scenario C picked up all 36 real facilities and moved them. That is physically absurd — a county cannot relocate its shelter system. It measured a best case nobody could act on.** So we rebuilt it: real buildings stay put, new sites get added. **Scenario C is now something a county could actually cost out and build.**

**If they ask:** *"Multiplying every shelter by three isn't a real plan. Buildings have fire codes and staffing limits."* Completely correct, and the script that builds it says so about itself — it calls itself "a modelling construct, not an operational plan." **Scenario B is not a proposal. It is a diagnostic that removes one variable so we can attribute what's left.** The policy-relevant scenario is C, which holds that total fixed and moves the locations instead. C is the one built to be buildable.

#### Code: making the totals come out exactly right
***[NOT ON SCREEN — answer-bank only. Do not narrate this unless asked.]***

**File:** `scripts/build_scenario_bc_2026.py`, line 43 *(verbatim)*

```python
    # Largest-remainder apportionment: scale, floor, then hand the leftover
    # spaces to the facilities with the largest fractional parts. Guarantees the
    # total is EXACTLY the target rather than a rounding drift.
    exact = [c * factor for c in caps]
    new = [int(x) for x in exact]
    leftover = TARGET - sum(new)
    order = sorted(range(len(rows)), key=lambda i: -(exact[i] - new[i]))
    for i in order[:leftover]:
        new[i] += 1
    assert sum(new) == TARGET, sum(new)
```

**What this does:** Scenario B enlarges every real shelter by the same proportion until the county total equals the population. `TARGET` is 6,842 — the population. `factor` is 6,842 divided by 2,234, which is 3.0627. Multiplying gives fractions of a bed, which don't exist. So this rounds every facility down, counts the beds left over, and hands them out one at a time to the facilities that lost the most in the rounding.

**Why it's here:** Ordinary rounding would have landed on 6,839, or 6,845. That is not cosmetic. If total space falls even three beds short of the population, some people get turned away for lack of a bed. **The entire point of Scenario B is to remove scarcity, so that any remaining failure can only be geography.** A three-bed drift would have contaminated the one comparison the scenario exists to make.

**If they ask:** *"What does `assert` do?"* It is a self-check. If the total is not exactly 6,842 the program stops and prints the wrong total rather than writing a file. **It cannot produce a quietly wrong scenario.**

**If they ask:** *"Does handing leftovers to the largest fractional parts favour big shelters or small ones?"* Neither systematically. The fractional part of a scaled capacity is essentially independent of the capacity's size — a 40-bed site and a 400-bed site are equally likely to have a large remainder. **And the leftover is at most 35 beds spread across 36 facilities, against a total of 6,842. It cannot move a result.**

---

### [SLIDE 3 — Stage 1: Building the population] · *1.5 minutes*

**6,842 simulated people. Nobody in this model is a copy of anybody else, and nobody's characteristics were invented.**

Each simulated resident gets: an age, a sex, whether they have a mobility limitation, whether they have asthma, whether they have COPD, and a walking speed that follows from all of that. Every one of those distributions is transcribed from a real source. **The table on screen shows the target we coded and the value the run actually drew — that gap is sampling, and it is small.**

- **Age comes from the Pathways Study, 2026** — a local survey of 541 people run by Portland State and OHSU. It gives us 52.7% aged 18 to 44, 42.3% aged 45 to 64, and **5.0% aged 65 or older.**
- **Mobility limitation: we coded 19.2% from the local Point-in-Time Count; this run drew 19.9% — 1,360 people — who have difficulty walking.** **And we say out loud that the real figure is probably higher**, because only survey respondents were asked the question, and we applied their rate to everyone.
- **Asthma and COPD come from Zellmer and colleagues, 2025**, in the *Journal of General Internal Medicine*, based on 20,139 electronic health records. **We coded 15% asthma and 10.5% COPD; this run drew 14.8% and 10.8%.** COPD being chronic obstructive pulmonary disease, a permanent narrowing of the airways. To give you the contrast: **15% asthma in this population against 7% in housed people; 10.5% COPD against 3%. The people most exposed to smoke are also the people least able to tolerate it.**

*[cut for time]* Sex is 68.4% male, 29.3% female, 2.3% other — **and that one is from the 2019 count, not 2026, because no current local figure exists. It is on the limitations slide.**

**And where do they start?** Not on a grid. **2,981 distinct real locations.** Those come from 3,400 City of Portland campsite reports — fewer locations than reports because the same camp gets reported more than once, so we de-duplicate to distinct places. **Every simulated person starts where somebody actually reported a campsite.**

#### Code: giving the population its own private supply of randomness
***[ON SCREEN. The slide shows more than this — see the two notes below.]***

**File:** `Geography/src/geography/agents/PopulationSampler.java`, line 256

```java
	public PopulationSampler(long seed) {
		this.rng = new Random(seed * 1000003L + 17L);
	}
```

**What this does:** The model needs a stream of random numbers to decide each person's age, sex, health and so on. `rng` is that stream — "random number generator." This creates a *private* supply used for nothing but that job. Its starting point is worked out from the run's number by a fixed recipe — multiply by 1,000,003, add 17. The `L` just tells Java the number is a long integer; it carries no meaning. **Same run number, same 6,842 people, every time, forever.**

**Why it's here:** The simulation platform has one shared pool of randomness. That same pool also places the encampments and decides what order people act in each minute. So if we drew our people from it, adding one new detail about people would have quietly moved every encampment. Nothing we had already run would still compare. **With a separate pool, we can add human detail without disturbing anything else. The verified consequence: adding the entire human-detail layer left the archived baseline byte-for-byte identical.**

**Also on the slide, and worth a sentence each** *(one is enough — pick whichever the audience is looking at)*:

- **The comment in the middle of that block records a rejected alternative.** Age is drawn evenly within each published band, because nothing in the source constrains the shape inside a band. **Fitting a smooth curve would have looked more sophisticated and manufactured precision no source supports.**
- **Mobility carries an age gradient.** Two probabilities — 0.1522 under 55, 0.3478 at 55 and over. **We borrowed the *ratio* between those two from a large California study of people experiencing homelessness, and pinned the *overall* rate to Multnomah's own measured 19.2%.** So the local total is exactly local; only the shape by age is imported. **If they push on the California study:** it is the UCSF statewide study, n=3,198, and it is in the bibliography. Borrowing a ratio while fixing the marginal to local data is the standard move when you have a local total but no local breakdown.

**If they ask:** *"Why those odd numbers — 1,000,003 and 17? Did you tune them until you liked the answer?"* No. They are arbitrary spreading constants, there only so that consecutive run numbers don't produce nearly-identical populations. Nothing scientific depends on them — swap them for any other pair and the population averages land in the same place; only which individual gets which attribute changes. **That is exactly what running nine different random starting points is for.**

**If they ask the harder version:** *"You derived the private stream from the same number that drives the shared stream. How do you know they aren't correlated?"* Fair question. Two answers. **First, the multiply-and-offset means the two streams start at points that are far apart, and Java's generator has a period of 2⁴⁸ — the sequences do not meet in a run of this length.** Second, and stronger: **it doesn't have to be true for the study to hold, because we ran nine different starting points and the results move by at most 11 people.** If there were a damaging correlation, it would show up as run-to-run instability. There is none.

#### Code: never counting the same disadvantage twice
***[NOT ON SCREEN — answer-bank only.]***

**File:** `Geography/src/geography/agents/PopulationSampler.java`, line 280 *(comment abridged; the full four-line version is in the file)*

```java
		double speed;
		if (mobilityLimited) {
			// Boyce's impaired categories already embed a slower, less able
			// walker, so the COPD decrement is NOT stacked on top of them —
			// same no-double-counting rule that makes mobility a replacement
			// rather than a multiplier (03-MOVEMENT.md §3).
			speed = truncatedNormal(IMPAIRED_SPEED_MEAN, IMPAIRED_SPEED_SD);
		} else {
			double mu = freeSpeedMean(ageYears, sex);
			if (copd) {
				mu = Math.max(SPEED_MIN_MPS, mu + COPD_SPEED_DELTA_MPS);
			}
			speed = truncatedNormal(mu, SPEED_CV * mu);
		}
```

**What this does:** This gives each person a walking speed. If they have a mobility limitation, their speed comes *entirely* from a fire-evacuation study of impaired walkers — an average of 0.95 metres per second — and nothing else is applied on top. If they don't, we start from a published average for their age and sex, apply a penalty if they have COPD, and then draw their individual speed around that average.

**Why it's here:** The rule is that disadvantages are never counted twice. The impaired-walker figure already describes people who are older and sicker. Subtracting the lung-disease penalty on top of it would double-count the same disadvantage and produce a slower, more dramatic population than any evidence supports. **Without this rule, the model would have exaggerated precisely the effect it exists to measure.**

**Have these four ready — they are the obvious probes:**

- ***"That's a plus sign. Your prose says subtract."*** **The COPD penalty is stored as a negative number, minus 0.19. Adding a negative subtracts.** The code and the prose agree.
- ***"What is `SPEED_MIN_MPS`?"*** A floor of 0.40 metres per second, so no arithmetic can produce a person who walks backwards. **It is far below any published mean, so it does not silently cancel the COPD penalty** — the slowest published age-and-sex mean is around 0.9, and 0.9 minus 0.19 is still well above 0.40.
- ***"What is `SPEED_CV`?"*** Coefficient of variation — 0.13. The spread scales with the average because that is how Bohannon 1997 reports within-population variation: as a proportion, not a fixed width. **A fast group and a slow group have similar *relative* spread.**
- ***"The trap you avoided" (this is on the slide's notes and a quantitative dean will like it):*** the obvious thing to do is take the spread from the 2011 meta-analysis's confidence intervals. **That would be wrong — those describe uncertainty about the average across studies, not variation between people.** Using them would have understated the real person-to-person spread by three to five times. We used Bohannon 1997's within-population figure instead.

**If they ask:** *"Surely someone with both a mobility limitation and COPD walks slower than someone with only the mobility limitation?"* Almost certainly, and we know it. **This is a known conservatism, not an oversight.** No study measures the combined effect in this population, so rather than invent one we took the option that understates the disadvantage. We did the same thing again by assigning every mobility-limited person to the *fastest* impaired category — the one with no walking aid. **Both choices make our simulated world one where shelter access is easier than reality. So the real access failure is probably worse than what we report.**

**One number worth having ready.** The COPD walking penalty is minus 0.19 metres per second, from Buekers and colleagues, 2024, in the *European Respiratory Review* — a pooling of 25 studies comparing 1,015 people with COPD against 2,229 without. **The review's own authors rate that evidence low quality, so we don't assume it — we re-run the model across the range the paper reports.** And asthma gets *no* walking penalty, because we searched and found no measurement of one. **That asymmetry is a gap in the evidence base that we went looking for and reported, not a modelling preference.**

---

### [SLIDE 4 — Stage 2: The city, and the defect we found in it] · *2 minutes*

**People walk on the real Portland street grid. 89,322 intersections, 112,070 street segments.** That comes from the regional government's street centreline file. Distances are measured along the curve of the earth, not as straight lines on a flat map — using Karney's 2013 method, which is the standard for that.

**Every person's route is a genuine shortest path** — Dijkstra's algorithm, the same calculation your phone does when it routes you somewhere, run across the whole city grid.

**And this is where we found the single most consequential defect in the project.**

The street file labels every intersection with an ID number. We chose, quite deliberately, to trust those official ID numbers rather than guess at intersections from the geometry — that seemed like the rigorous choice.

**A map file has two halves: the drawing, and a table of labels attached to the drawing. The drawing was fine. The table of labels was corrupt.**

A block of 27 ID numbers appeared at physical locations 9 to 18.5 kilometres apart. Trusting the labels welded those distant places into a single intersection. **It created 50 impossible connections — the route-finder believed you could cross the county in a single step, at no cost. We called them wormholes.**

**The consequences were not subtle. Those segments *weighed* metres but *spanned* kilometres, so the route-finder preferred them — which means shelter *choice* could be wrong, not just shelter distance. It inflated travel distance by roughly fifteen times and smoke exposure by roughly three times, for between 44 and 48 percent of the simulated people in two separate checks — 22 of 50 agents in one, 48 of 100 in a larger one.**

**How we found it, in order:** one person in an early run walked a reported 68.3 kilometres, and **that number is what made me look.** **What proved it and measured it was an independent check — a separate program, written in a different language, that re-computes every route from scratch and compares.** The suspicion was human. The proof was mechanical.

#### Code: correct it, record it, delete nothing
***[ON SCREEN — this is the block on the slide.]***

**File:** `Geography/src/geography/routing/StreetNetwork.java`, line 286

```java
// Pass 2 -- every ADDITIONAL site of an ID is a corrupt-attribute
// symptom: correct it (reattach by geometry, else split), with provenance.
for (List<NodeSite> sites : sitesByAttrId.values()) {
    if (sites.size() == 1) { continue; }
    report.affectedAttrIds++;
    NodeSite primary = sites.get(0);
    for (int i = 1; i < sites.size(); i++) {
        NodeSite s = sites.get(i);
        s.distFromPrimaryM = geodesicDistanceM(s.anchor, primary.anchor);
        NodeSite near = (NodeSite) primaryIndex.nearestNeighbour(
                new Envelope(s.anchor), s, CENTRE_DISTANCE);
        if (near != null && geodesicDistanceM(s.anchor, near.anchor) <= REATTACH_TOLERANCE_M) {
            s.graphId = near.graphId;  s.reattached = true;
            report.reattachedSites++;
            report.corrections.add(new Correction("REATTACHED", s));
        } else {
            s.graphId = nextSyntheticId--;
            report.splitSites++;
            report.corrections.add(new Correction("SPLIT", s));
        }
    }
}
```

**What this does:** An earlier pass has already recorded every physical *location* at which each ID number showed up. This pass walks that list. **If an ID shows up at only one place, it's fine and we skip it. If it shows up at more than one place, that is the corruption, and we correct it in one of two ways.**

**If the extra location is within 10 metres of a real junction, we treat it as that junction — a rounding artefact, not a distinct place. That happened 4 times.** **If it is further away than that, we file it as a genuinely separate physical place and give it a new identifier of our own. That happened 23 times.** Nothing is deleted, no geometry is edited, and **every single correction is written into the run's record so a reviewer can count them and see which nodes were touched.**

**There are two thresholds on this slide and they do different jobs. Ten metres decides *reattach or split*. One hundred metres is the tolerance that decides whether two sightings of an ID count as the same place at all** — and that is the one whose robustness rests on the empty-band argument below, not on a sweep we ran.

**If they ask:** *"Where did 100 metres come from? Did you pick a number that made the problem disappear?"* No, and this one is easy to check. Where two streets legitimately meet, their recorded ends differ by well under a metre. **The smallest corrupt displacement we found was about 1.65 kilometres. That is a thousandfold gap with nothing in between.** 100 metres sits in the middle of that empty space — **any threshold between roughly 10 metres and a kilometre must produce an identical map. To be precise: that is an argument from the empty band, not an executed sweep — the tolerance is hard-coded at 100.0 and all 101 run manifests record that same value; no alternative threshold was ever run.**

**If they ask:** *"After you split one corrupt ID into several places, do routes through them still connect?"* Yes, and we check it two ways. **The number of separate, disconnected pieces of the street network is unchanged by the fix — 154 pieces, the largest containing 60,444 intersections.** Nothing became stranded. And **a separate audit looks for any street segment whose two recorded ends are further apart than the segment's own recorded length — geometrically impossible, and the sign of a wormhole. Before the fix: 50. After: zero.**

**If they ask about that 154:** a street network is not one connected blob. Islands, gated developments, and stubs beyond the county boundary are genuinely separate. **The main piece holds 60,444 of the 89,322 intersections; the rest are small fragments. That is why 16 people in every scenario cannot reach any shelter at all — they start on a fragment with no shelter on it.**

**Say this, because it's the honest part:** **we found this only because we had built independent checks that could embarrass us.** A separate Python program re-computes every route with its own implementation of the shortest-path algorithm, on a graph it rebuilds independently — five tests, exact agreement on distance. **It also confirms that the walking speeds people actually realise, 1.30 to 1.38 metres per second, sit inside the published bounds. So the routing and the human speeds are both checked against something that was not our code.**

**After the fix, the longest journey in that demonstration run dropped from 875 minutes to 212, and from 68.3 kilometres to 16.5.**

---

### [SLIDE 5 — Stage 3: Behaviour — when people leave, and what happens at a full door] · *1.5 minutes*

Two behavioural rules do almost all the work in this model.

**Rule one: nobody leaves because a clock struck zero. They leave when the air actually turns bad — and when there is somewhere open to go.**

Both conditions are checked at the same instant. **Is the smoke right now above the level the EPA calls Unhealthy? And is at least one shelter actually open right now?** Only when both are true does a person set out. Otherwise they stay where they are — still outdoors, still breathing it in.

**Why both, and this is two separate decisions.** First: an earlier version had everybody evacuate at the very start of the simulation. That is not how a slow-onset smoke event works, and the effect was enormous — **average exposure came out thirteen times too low, because everyone sheltered before the smoke arrived.** Second: the opening-date condition. **In the real 2020 event the shelters did not open until the 10th and 11th, days after the air turned unhealthy. Without that condition, simulated people would have walked to buildings that were not yet open and been counted as saved.**

**Be precise about this one if pressed, because it matters:** **the opening-date gate is a mechanism the model needs, and it mattered in the 2020 calibration run. In the three present-day scenarios on the next slide it is switched off — every facility is modelled as open from hour zero, and that is limitation 12.** So the second condition is not doing work in the results I am about to show you. It is doing work in the historical run that we calibrated against.

**If they ask:** *"Real unsheltered people don't carry air-quality monitors. Why is the trigger a precise number?"* They don't, and we document that as a simplification. **The 55.5 figure is a stand-in for "conditions have obviously become bad and official warnings are going out." We use the published EPA breakpoint precisely so that it is a public standard rather than a number we chose.** It is also adjustable, so we test how much the answer moves when it changes. What the model deliberately does not contain is individual awareness, willingness, or distrust of shelters — and we state that as a limitation rather than pretend it's in there.

**If they ask:** *"Your code says: if there's no smoke data, treat the concentration as zero. So if the file fails to load, does everyone stay put and the model report zero exposure?"* Good catch, and the honest answer is that the guard is there because Java requires one, not because we expect it to fire. **If it ever did fire, the run would be conspicuous rather than silent: the manifest would carry no fingerprint for the smoke file, and the exported exposure would be exactly zero for all 6,842 people — the by-hand check on Slide 10 would fail immediately.** In every archived run, the smoke file is fingerprinted and the exposure integral matches an independent recomputation to a ratio of 1.0000.

**Rule two: shelters fill up, and being turned away is the normal outcome, not an edge case.**

In Scenario A, **4,766 of 6,842 people are turned away from every shelter they can reach.** So the geography of refusal is not a detail. It is most of the study.

#### Code: where a refused person is standing
***[ON SCREEN — this is the block on the slide.]***

**File:** `Geography/src/geography/agents/GisAgent.java`, line 299 *(comment abridged; the full version cites the audit finding)*

```java
if (pathIndex >= routePath.size()) {
    // Reached the shelter's street node: request admission (V12).
    if (targetShelter.isOpenAt(tick) && targetShelter.admit()) {
        state = State.SHELTERED;
        arrivalTick = tick;
    } else {
        // Filled since selection: the resident REMAINS at this
        // shelter's street node and re-plans from there next tick,
        // excluding full shelters (never re-plan from the immutable
        // start node — that walked refused agents back to their
        // encampment, inflating distance and dose). Bounded to
        // avoid getting stuck forever.
        currentNodeId = targetShelter.getGraphNodeId();
        targetShelter = null;
        routePath = null;
        pathIndex = 0;
        retargetCount++;
        if (retargetCount > MAX_RETARGETS) { state = State.REFUSED_ALL_FULL; }
    }
}
```

**What this does:** When a person reaches a shelter, this asks for a bed. If one is free, they're inside. If the shelter filled up while they were walking, they are left standing *at that shelter's door*, and next minute they plan their next walk from there — not from the campsite they came from.

**Why it's here:** This was a real defect we found and fixed. **The original code re-planned every refused person from their original campsite, which effectively teleported them home before sending them out again.** It inflated both distance walked and smoke breathed — by up to about ten kilometres per person. **The single line moving them to the shelter's intersection is the entire fix.**

**Why it stayed hidden, which is the interesting part.** At the 50-person test scale no shelter ever filled, so that branch of the code never ran and every regression check passed. **It would have first appeared as a corrupted headline number at full scale. That is the argument for checks that are arithmetic rather than comparative.**

**And it is now guarded arithmetically.** A derived computation in our analysis — reported alongside the registered checks, not itself a numbered check — asserts, for every single person, that the distance they walked is no more than the distance they planned, plus the small gap where they snap onto the street network, plus 200 metres of slack. **In the capacity-binding reference run — where 250 of 400 people were refused at least once — the largest unexplained distance was 8.9 metres. That is the worst case, not an average.**

**Also on this slide, and worth two sentences:** **a second bug, found by adding a feature.** Once we honoured real opening dates, being refused was a dead end — someone turned away from the Convention Center on the 10th never tried Charles Jordan when it opened on the 11th. **99 real beds sat at zero occupancy.** Refusal is now a waiting state, reconsidered every minute. It cannot spin forever, because capacity never grows and each shelter opens exactly once.

**If they ask:** *"Why cap it at eight attempts? That looks arbitrary."* It is arbitrary, and it is a safety limit rather than a claim about human behaviour — it exists so the program cannot run forever. **The counter trips at the ninth attempt. Across all 27 runs the most refusals any individual records is 8. So we never hit it — but not by much, and I'd rather say that than claim comfort I don't have.** We export the refusal count for every individual, so anyone can check.

**If they push on that count:** it is a count within one attempt cycle, not a lifetime total — it resets if someone re-enters the search after a new shelter opens. **In these runs no reset ever occurs, because every facility is open from hour zero. So in this data it is a lifetime count. In a run with staggered opening dates it would not be, and I'd say so.**

**The question I most expect on this slide:** *"Two people arrive at the last bed in the same minute. Who gets it?"* **Whoever the platform happens to run first in that minute. Agents act in a shuffled order each tick, and the first one to call for admission gets the bed.** That is deliberate — it is a lottery, not a priority rule — and it is a named limitation: **residents are served in shuffle order, not by need.** **It also points at the cheapest policy lever this model could test and hasn't: prioritise mobility-limited people at the door and see how much of the equity gap closes with no new beds. That is the next run, and I'd want to do it.**

---

### [SLIDE 6 — Stage 4: Exposure, dose, and risk — and four citations that didn't hold up] · *2.5 minutes*

**This is the section where the project's credibility was actually decided.**

The original brief for this project proposed a single headline metric: multiply smoke concentration by a set of risk multipliers. **Four of them. Age 65-plus, 1.45. COPD, 1.80. Asthma, 1.40. Under-18, 1.22.** The first two together gave the brief's headline claim — that an older person with COPD suffers 2.6 times the harm of a healthy adult.

**We went to check all four against the papers they were credited to. Not one of them survived.** The table on screen has all four rows:

- **The 1.45** was credited to Di and colleagues, 2017, in the *New England Journal of Medicine*. That is a real and excellent paper. It reports a hazard ratio of 1.073 per 10 micrograms per cubic metre — **meaning that for every extra 10 micrograms, the death rate in that population rose about 7 per cent.** But here is the structural problem: **its entire study population — all 60.9 million people — are Medicare beneficiaries aged 65 and over. The study cannot produce a "65-plus versus under-65" comparison, because it contains nobody under 65.** No value near 1.45 appears in it.
- **The 1.80** was credited to "Anderson et al. 2013." **We could not locate that paper.** **The nearest record for that year is Atkinson and colleagues, 2013 — a cardiovascular study with no COPD estimate at all. The nearest record for that author name is Anderson, Thundiyil and Stolbach, 2012, which is a narrative review.** Neither is a source for a COPD risk ratio.
- **The 1.40** was credited to Zanobetti and Schwartz, 2009 — wrong journal, wrong volume, wrong pages, and the real paper is a mortality time series that does not report asthma as an effect modifier.
- **The 1.22** was credited to "GBD MAPS / Kloog 2013," which does not resolve to a paper. GBD MAPS is a report series.

**So the brief's headline 2.6 was the product of two numbers we could not trace, and two more sat behind it in the same condition.**

*[cut for time, but it is strong]* **We also went looking for what the evidence actually says about the age question, rather than just showing the citation was bad. Kondo and colleagues, 2019, pooled eight studies and report an elderly-to-adult risk ratio of 1.008, with a confidence range from 0.996 to 1.020. That range includes 1. It is a null result. So 1.45 was not merely unsourced — the best available evidence says the true value is close to 1.**

**And there is an argument here that survives even if someone hands me four perfect citations tomorrow.** **Multiplying exposure by a relative risk is a category error. A relative risk is a ratio of outcome *rates* between two groups. It is not a multiplier on the *amount of smoke someone breathed*.** You cannot multiply micrograms by a mortality ratio and get micrograms. **And no weight could ever be validated here anyway, because this model simulates no health outcome against which to check it.**

We had three options: keep them and hope; delete the whole concept; or leave the slot open, switched off, with the reason written next to it. **We took the third.** And we restructured the code so that the three things people habitually blur together are held permanently apart.

#### Code: three quantities that must never be mixed
***[ON SCREEN. Do not read the formulas aloud — say the three plain lines below instead.]***

**File:** `Geography/src/geography/agents/GisAgent.java`, line 54

```java
// ---- THREE DISTINCT QUANTITIES, DELIBERATELY NOT MIXED ------------------
// 1. EXPOSURE  (exposureUgM3h)  = SUM C(t)*dt              [ug/m3 * h]
//    Environmental concentration-time. Physics of the AIR. Verified against
//    raw EPA AQS data to a ratio of 1.0000. Untouched by this block.
// 2. INHALED DOSE (inhaledDoseUg) = SUM C(t)*IR(activity)*dt   [ug]
//    Physics of the PERSON: how much particulate mass actually entered the
//    airway. Differs from exposure only by ventilation rate, which depends
//    on ACTIVITY (walking vs waiting), not on diagnosis.
// 3. HEALTH RISK (healthRiskMultiplier) = a susceptibility weight.
//    Biology. Currently 1.0 for everyone because no defensible
//    population-specific coefficient exists (A-09, A-22). The slot exists so
//    that risk can never be silently folded into dose.
// The cardinal rule: ventilation is PHYSICS and may vary with activity;
// susceptibility is BIOLOGY and stays out of the dose term entirely.

if (smokeField != null && state != State.SHELTERED) {
    double c = smokeField.concentrationForTick(tick, minutesPerTick);
    exposureUgM3h += c * dtHours;
    double ventilationM3h = (state == State.EN_ROUTE)
            ? INHALATION_WALKING_M3H : INHALATION_RESTING_M3H;
    inhaledDoseUg += c * ventilationM3h * dtHours;
    if (c > UNHEALTHY_UGM3) { hoursAboveUnhealthy += dtHours; }
}
```

**Say the three lines this way, and point:**

**One. How dirty the air around you was.** That is physics of the air. **Verified against EPA's raw monitor data to a ratio of 1.0000.**
**Two. How much of that dirt actually got into your lungs.** That is physics of the person, and it differs from the first only by how hard you were breathing — walking versus waiting. **Not by your diagnosis.**
**Three. How much harm it does to you in particular.** That is biology. **It is set to "no adjustment" for everybody, and the slot exists so that a weight can never be slipped in silently.**

**What the code below the comment does:** every minute, for anyone who is not indoors, it adds this minute's smoke to their exposure, multiplies by their breathing rate to get what entered their airway, and ticks up an hours-in-unhealthy-air counter if the air is above the line. **The one condition that stops all of this is being sheltered. Walking, stranded, or turned away — you are outdoors and you are still accruing.**

**Why it's here:** These three get blurred together constantly in exposure work, and once blurred a reader cannot separate them again. Keeping them apart means a sceptic can audit them one at a time. **Check our air figures against EPA's raw data. Then check the breathing arithmetic. Then decide independently whether you accept any health weighting at all.** Multiply a vulnerability factor into the dose, and every later number quietly carries an assumption nobody can pull back out.

**If they ask:** *"Doesn't a person with asthma take in more harm from the same air?"* They very likely suffer more harm. But they do not *inhale* more particulate. **How much air enters your lungs depends on how hard you are working, not on your diagnosis.** That's why breathing rate in our code switches on activity and nothing else — 1.62 cubic metres per hour while walking, 0.61 while waiting, both from the EPA's *Exposure Factors Handbook*. Walking is 2.66 times resting. **The extra harm belongs in the third quantity, which we have deliberately left switched off.**

#### Code: the multiplier that is switched off on purpose
***[NOT ON SCREEN — answer-bank only.]***

**File:** `Geography/src/geography/agents/GisAgent.java`, line 446 *(Javadoc abridged; the full version cites the health-model audit)*

```java
	/**
	 * Susceptibility weight applied to inhaled dose to obtain health risk.
	 * <b>Returns 1.0 for every resident.</b> The method exists so a sourced
	 * coefficient has exactly one place to land, and so a reader can see that
	 * risk weighting is switched off rather than absent.
	 */
	public double getHealthRiskMultiplier() { return 1.0; }
	public double getHealthRiskScore() { return inhaledDoseUg * getHealthRiskMultiplier(); }
```

**What this does:** A named piece of the program whose entire job is to answer "how much more vulnerable is this particular person?" — and it answers *one*, meaning no adjustment, for everybody. The line below multiplies inhaled dose by that one. **So today, health-risk score and inhaled dose are the same number.**

**If they ask:** *"A function that always returns one does nothing. Isn't that dead code?"* Arithmetically it does nothing, and that is the point — it is a public declaration in the source. **Delete it, and a future contributor can quietly slip a vulnerability factor into five different places. Keep it, and there is one named, auditable location where such a thing could ever enter.** And the value 1.0 is printed into every exported data file, so a reader sees the switch position rather than taking our word for it. **In the three seed-42 runs — 20,526 rows, 6,842 people times three scenarios — health-risk score equals inhaled dose exactly, with zero exceptions.**

**If they want to check that themselves, point them at the right file.** The two columns are in `docs/runs/present-day-three-arm/<scenario>-seed42/agents.csv`. **They are deliberately not in the reader-facing summary file, because that file reports what the study measured, and a column that is identical to another column by construction is not a measurement.**

**So what do we report instead?** **We report outcomes for mobility-limited people, for people over 65, for people with asthma, for people with COPD — separately, side by side, unweighted.** That is a weaker claim than the original brief wanted to make. **It is also a claim we can actually defend.**

---

### [SLIDE 7 — Stage 5: Results] · *2 minutes*

The table is one particular random starting point — number 42. **All three scenarios were run at nine different starting points, and the range on the admissions row is on the slide.**

| | Scenario A: reality | Scenario B: more beds | Scenario C: same beds, better places |
|---|---|---|---|
| Facilities | 36 | 36 | 46 |
| Total spaces | 2,234 | 6,842 | 6,842 |
| **Got inside** | **2,060 (30.1%)** | **6,264 (91.6%)** | **6,570 (96.0%)** |
| Turned away | 4,766 | 562 | 256 |
| Could not reach any shelter | 16 | 16 | 16 |
| Beds left empty | 174 | 578 | 272 |
| Average walk | 18,260 m | 7,938 m | 5,689 m |
| Hours in unhealthy air, per person | 135.8 | 17.5 | 8.6 |
| Inhaled particulate, per person | 23,374 µg | 3,056 µg | 1,534 µg |
| Person-hours in unhealthy air, whole population | 928,934 | 119,921 | 59,060 |

**Say this before anyone adds a column, because they will:** **every column adds to 6,842. Got inside, plus turned away, plus sixteen people who cannot reach any shelter by any route. Those sixteen start on a piece of street network with no shelter on it at all. No amount of capacity and no re-placement reaches them, which is why the number is identical in all three scenarios.**

**Read the rest as three sentences.**

**One. Today, seven in ten people living outdoors would still be outdoors.** 2,060 admitted of 6,842. On average they spend **135.8 hours — five and a half days — outdoors in unhealthy air**, and inhale **23,374 micrograms of particulate**. That last figure is mass that actually entered an airway, not a concentration in the air around them. **Across the whole population that is 928,934 person-hours in unhealthy air.**

**Two. Capacity is the first-order fix, and it is not sufficient.** Triple every existing building and admission goes from 30% to 92%. **Hours in unhealthy air fall 87 per cent** — 135.8 down to 17.5. **But look at the last rows of column B: this scenario has exactly one bed per person, and it still fails 562 of them, while 578 beds finish the event empty.** **The beds existed. Nobody could reach them. That is the placement failure, quantified.**

**Three. Placement is free.** Scenario C has **not one additional bed** compared to B. Every real facility stays exactly where it is. The only difference is that some of the capacity goes to ten well-chosen locations instead of into buildings that were already there. **Admission rises to 96%. Average walking distance falls another 28%. Hours in unhealthy air are cut by a further half — 17.5 down to 8.6. Inhaled particulate too — 3,056 down to 1,534 micrograms.**

**Say "a further half," not "halved again."** A to B was a sevenfold fall, not a halving. Claiming a pattern that isn't there is the kind of thing a methodologist notices.

**Two honest caveats to say out loud on this slide.**

First: **on "turned away."** Those figures count *people* in a final state of having been refused everywhere. If you open our per-shelter file you will see a much bigger number — 17,373 in Scenario A — because one person is refused at many doors. **That column counts refusals at doors. The headline counts people.**

Second: **the real "got inside" numbers are probably lower than these.** The model assumes everyone knows the shelters exist. When we tested the 2020 configuration against the one occupancy observation we could find — **a *Street Roots* report from September 16th, 2020, which observed roughly 130 of 198 beds occupied, where the model fills 198 of 198** — **the model over-predicted by a factor of 1.52.** We know a likely reason: a Portland State survey found **65% of unsheltered residents had never heard of the clean-air shelters.** We have not implemented that, and we flag it as a blocking assumption. **So every "got inside" figure here is optimistic — and optimistic in all three scenarios equally, which is why the comparison between them still holds.**

**One structural point worth volunteering, because it makes the causal story unusually clean.** The smoke field in this model is the same everywhere in the county at any given hour. **That is not laziness. There are only two regulatory monitors inside Multnomah County, and you cannot build a surface from two points.** The consequence matters: **placement cannot possibly help by moving people into cleaner air, because there is no cleaner air anywhere. The entire placement effect you see here is a travel-time effect.** People get indoors sooner, and they spend less time walking — and walking is when they breathe hardest.

**If they ask why you're showing one run rather than the average of nine:** because the table is a joint picture of one internally consistent world, and averaging nine runs would produce a row of numbers that no single run ever produced. **The check that matters is that all nine agree, and they do — the admissions range across nine starting points is eleven people wide in every scenario, and the ranges are on the slide. I'd rather show you a real run and prove it's typical than show you an average and hide the spread.**

**If they ask how average walk can be 18.3 kilometres when the longest journey after the wormhole fix was 16.5:** different quantities, and I should be clear about it. **The 16.5 is the longest single journey of someone who *arrived*, in the 50-person demonstration run we used to verify the fix. The 18,260 is the *cumulative* distance walked in Scenario A, averaged over everyone — including 4,766 people who are refused at door after door and keep re-planning.** One person in Scenario A walks 23.6 kilometres in total without ever getting inside. **That is what capacity scarcity looks like as distance.**

---

### [SLIDE 8 — Stage 6: Equity] · *1.5 minutes*

**This is the finding I'd most want a policy audience to take away, because it is the one you cannot see without a model of individuals.**

**1,360 of our 6,842 people — one in five — have a mobility limitation.** In this model, that means one thing only: **they walk slower. Just under 1 metre per second, against nearly 1.4 for someone unimpaired.**

Nothing else penalises them. There is no assumed disadvantage. And yet:

| Group | Share | A: reality | B: more beds | C: same beds, better places |
|---|---|---|---|---|
| Everyone | 100% | 30.1% | 91.6% | 96.0% |
| Walks without difficulty | 80.1% | 32.7% | 96.4% | 98.6% |
| **Has trouble walking** | **19.9%** | **19.7%** | **71.9%** | **85.7%** |
| **Gap** | | **13.0 points** | **24.5 points** | **12.9 points** |
| Age 65+ | 5.2% | 22.4% | 82.4% | 89.8% |
| Has COPD | 10.8% | 22.2% | 86.2% | 93.8% |
| Has asthma | 14.8% | 29.2% | 90.6% | 95.7% |
| Counted as more vulnerable | 71.1% | 28.2% | 88.8% | 94.7% |

**Say it slowly, because it is counter-intuitive: pouring 4,608 additional beds — that's 6,842 minus 2,234 — into the same buildings nearly doubles the equity gap.** From 13 points to 24.5. **Everyone improves in absolute terms. The fast walkers improve far more.**

**Spending that identical capacity on well-placed sites instead brings the gap back to 12.9 — where Scenario A started — and it lifts the slowest group from 71.9% to 85.7%. That is 13.8 percentage points, and it is a gain over Scenario B, not over reality. Same number of beds. Zero extra cost.**

**Why does that happen? Not because we assumed it.** Nobody in this model is denied a bed for being disabled. **Shelter beds are handed out first-come, first-served. When beds are scarce relative to demand, "first-come" is decided by walking speed. Scarcity gets rationed by how fast you can walk. Nobody programmed that. It falls out of the admission rule.**

**Two things that confirm the mechanism rather than an assumption:**

- **COPD shows an access penalty — 22.2% against 30.1% for everyone. Asthma shows almost none — 29.2%.** That is exactly right. **COPD is the only diagnosis in this model that changes walking speed, because it is the only one with published gait-speed evidence. A diagnosis never affects anything here except through a mechanism we can cite.**
- **People aged 65 and over show the same pattern as mobility limitation — 22.4% in Scenario A** — for the same reason.

**Have this ready, because that last row on the slide invites a hard question.** *"Counted as more vulnerable — 71.1% of the population. Counted by whom? Isn't that the weighting you just said you deleted?"* **No, and the distinction is important. That row is a reporting group, not a weight. It is everyone who is 55 or over, or mobility-limited, or has asthma, or has COPD — the union of the categories above it. Nobody's numbers are multiplied by anything. It exists so that a reader who wants a single "vulnerable population" figure gets one that is defined explicitly rather than assembled from a weight nobody can source.**

**And the honest close on this slide.** In Scenario C, **14.3% of mobility-limited residents — 194 people — are still outside.** The gap is narrowed, not closed. **Ten new shelters is a large improvement, not a solution.**

There's one more piece of honesty here, and **it is spoken only — there is no row for it on the slide, so expect "show me."** **Relative inequality in inhaled dose keeps rising even as absolute harm collapses.** In Scenario A, mobility-limited people inhale about **1.2 times** what unimpaired people inhale. In B it's **6.7**. In C it's **7.3**.

**The mechanism, because this is the most natural question on the slide.** **In Scenario A almost nobody gets inside, so both groups are outdoors for almost the whole event and the ratio is near 1.** In B and C almost everyone who can walk fast gets indoors quickly, so **the denominator collapses — the fast group's average dose falls to almost nothing, while the people still outside are overwhelmingly the slowest walkers. The ratio worsens because the comparison group has essentially been rescued.** **Absolute harm falls dramatically for everyone. The ratio between groups gets worse. That is why we report both — a single summary statistic would hide one or the other.**

---

### [SLIDE 9 — Stage 7: What this study cannot do] · *1.5 minutes; say 1, 3, 4 and the closing line if you are short*

**I want to spend real time here, because everything I've told you is worth exactly as much as this list is honest. These are ten of eighteen documented limitations.**

**1. We do not predict health outcomes.** Not one illness, not one hospital visit, not one death. We model how much particulate enters a person's airway. Converting that to health effects would require a coefficient we could not source. **If you take one thing from this slide: this study says nothing about mortality.**

**2. Health-risk weighting is switched off.** Every person carries a susceptibility weight of exactly 1.0, for the citation reasons I described. We report groups separately instead.

**3. Everyone in the model knows every shelter exists, and everyone wants to go.** Neither is true. Sixty-five percent of surveyed unsheltered residents had never heard of these shelters. **This is why the model over-predicts attendance by about 1.5 times against the one real observation we have.**

**4. We do not model indoor air.** Arrival at a shelter is where the study stops measuring — we count reduction in *outdoor* exposure time, not what happens inside. **And I should be precise: nothing in our sources establishes that these 36 buildings have filtered air.** They are the county's year-round shelter system, catalogued for a different purpose. **We call them "existing shelter facilities," and whether they could function as clean-air refuges is an open item we flag as blocking.**

**5. Our monitors probably under-report the smoke.** All seven are non-reference heated-inlet instruments, which are known to understate PM2.5 during a fresh wood-smoke event. **So the real air was probably worse than our chart shows** — which pushes in the same direction as everything else on this list.

**6. Beds are handed out in shuffle order, not by need.** Whoever's turn comes first in a given minute gets the bed. **That matters most in Scenario A, where beds are scarcest — and it means we have not tested the cheapest intervention available, which is prioritising the people who walk slowest.**

**7. Our shelter inventory is about 9% low.** We are missing about 207 people's worth of real capacity — **two City-run sites that publish no street address: Clinton Triangle, which at 160 units is the largest single site in the inventory, and Multnomah Safe Rest Village at 28.** **We excluded them rather than guess coordinates. So Scenario A understates reality slightly.** We also excluded around ten day centres entirely because none publishes a capacity.

**8. The day-centre exclusion cuts against our own argument, and we state it anyway.** **In a *daytime* smoke episode, day centres are arguably the most relevant clean-air spaces that exist.** Leaving them out understates how much daytime shelter the county actually has. **We could not include them without inventing a capacity figure, so we named the gap instead of filling it with a guess.**

**9. Data vintages are mixed.** Sex and mobility distributions are 2019 in an otherwise 2026 study, because no local replacement exists. Asthma and COPD rates are from a Minnesota health-records study applied to Oregon. Encampment locations are 2025–26 complaint-driven reports used as a stand-in for 2020, so they over-represent visible camps.

**10. The ten new sites are points on a street network, not buildings.** No zoning check, no cost, no staffing, no air filtration. And the specific choices — growing existing sites by half, adding ten new ones — **are policy settings, not measured quantities.** *[cut for time]* No families, no children, no pets, no possessions, no vehicles, no public transit. Adults, walking.

*[cut for time]* **And the population figure has a caveat from its own authors.** The 2025 count changed methodology in a way its publishers say "substantially augmented" the number. **So do not let me tell you homelessness tripled. The 2019 and 2025 counts are not a clean time series.**

**The line to land this slide on:** **every one of these biases points the same way — toward making shelter access look easier than it is. If we are wrong, we are wrong optimistically. The real number left outside is probably higher than what I showed you.**

---

### [SLIDE 10 — Stage 8: Reproducibility] · *1 minute*

**27 runs. Three scenarios, each replicated across nine different random starting points — numbers 42 through 50.**

**Here is how you know the differences between scenarios are real and not luck.** Change only the random starting point, and the number admitted moves by at most **11 people**. **That's the noise — how much the answer wobbles when nothing real changes — and it's 11 in all three scenarios. The smallest difference we claim between scenarios is 306 people, from B to C. The effect is 28 times larger than the wobble.** That's why the ordering A, then B, then C is not an artefact. **And no range overlaps between scenarios on any headline metric.**

Three more things:

**The physics is independently verified, not asserted.** A completely separate program re-computes the total exposure straight from the raw EPA monitor file. **The figure is the smoke breathed by one person who stays outdoors for the entire 312 hours, measured in micrograms per cubic metre multiplied by hours. Model: 54,002.8. Independent recomputation: 54,002.7.** The remaining tenth is rounding — **a computer carries a limited number of decimal places, and rounding those off across tens of thousands of one-minute additions leaves a difference that small.**

**There's a check anyone can do by hand.** 194 of the 312 hours were above the unhealthy line. So anyone who never gets indoors must show exactly 194.0 hours of unhealthy exposure. **Open our per-person file: all 5,632 people who never get indoors across the three seed-42 runs show exactly 194.0. Zero exceptions.**

**And every run carries a fingerprint of every input file** — thirteen files per run, twenty-seven runs. **A fingerprint is a short code computed from the file's contents; change one character and the code changes completely. So a reader can prove they have the same data we did.**

#### Code: the flag that tells on us
***[ON SCREEN — the slide shows the body as well as the comment.]***

**File:** `Geography/src/geography/output/OutcomeLogger.java`, line 369

```java
/**
 * True when tracked model sources are newer than the recorded git HEAD, i.e.
 * the run may have executed uncommitted code. An audit found nine archived
 * runs stamped a commit that could not reproduce them; this flag makes that
 * condition visible in the manifest instead of silent. Heuristic and
 * deliberately conservative: it compares file modification times against the
 * HEAD ref's own timestamp, so it errs toward reporting "true".
 */
private static String gitWorkingTreeDirty() {
    try {
        File head = new File(".git/HEAD");
        if (!head.exists()) head = new File("../.git/HEAD");
        if (!head.exists()) return "\"unknown\"";
        /* ... resolve the ref, read its timestamp ... */
        return String.valueOf(newestFileTime(src) > headTime);
    } catch (Exception e) {
        return "\"unknown\"";
    }
}
```

**What this does:** Every run writes a record card saying exactly which archived snapshot of the code produced it. **This asks whether any source file was edited *after* that snapshot was taken — in other words, whether the run may have come from code that was never saved.** The answer is stamped into the record card.

**Three states, not two, and that is deliberate.** It answers true, false, **or "unknown."** **A check that cannot answer says so instead of guessing.** That is also why it returns text rather than a yes-or-no.

**Why it's here:** **We audited our own archive and found nine runs whose record card named a code snapshot that could not possibly have produced them.** Two options at that point: quietly fix them, or build the detector and let it speak. **We built the detector, re-ran all nine from committed code, and left the flag permanently in the output.** **It is deliberately biased toward crying wolf. A false alarm costs a re-run. A missed one costs a false claim of reproducibility.**

**If they ask:** *"You're comparing file modification times. That's fragile — a `touch` or a fresh checkout would set it off."* **Yes, and it is labelled a heuristic in its own comment for exactly that reason.** It errs toward false alarms, which cost a re-run. **It is a smoke alarm, not a proof. The proof is the fingerprint of every input file plus the archived snapshot number, and those are exact.**

**If they ask:** *"You found nine bad runs in your own archive. Why should I trust the rest?"* **Because we found them ourselves, by building a check that could embarrass us, and then re-ran every one.** That is the argument for the system, not against it. **An archive with no detection mechanism isn't clean — it's merely unexamined.**

---

### [SLIDE 11 — Sources] · *45 seconds*

Every number in this talk resolves to one of these. Briefly:

- **The smoke:** U.S. EPA Air Quality System, hourly PM2.5, September 2020. **Seven monitors across the tri-county region, of which only two sit inside Multnomah County.** 4,795 hourly observations, covering the whole month rather than only our thirteen-day window. Downloaded from the authoritative primary source, not a summary. **Worth noting: the standard hourly file contained *no* Multnomah County monitors for 2020 — the Portland instruments report under a different EPA data code. We downloaded both files, inspected both, and discarded the misleading one rather than commit it under a convenient name.**
- **The population:** 2025 Tri-County Point-in-Time Count, Portland State HRAC.
- **Demographics:** the Pathways Study 2026 (PSU / OHSU, 541 participants) for age and chronic conditions; the local Point-in-Time Count for sex and mobility.
- **Health prevalence:** Zellmer et al. 2025, *Journal of General Internal Medicine*, 20,139 health records.
- **Walking speeds:** Bohannon 1997 and Bohannon & Williams Andrews 2011 for age-and-sex norms; Boyce, Shields & Silcock 1999 for impaired walkers; Buekers et al. 2024 for the COPD effect.
- **Breathing rates:** EPA *Exposure Factors Handbook*, 2011, Chapter 6.
- **Methods:** Karney 2013 for measuring distance on the curve of the earth; Dijkstra 1959 for shortest paths; North et al. 2013 for the Repast Simphony platform. **Those are cited because the claim "we measure geodesic distance" should name whose method.**
- **Shelters:** Multnomah County and City of Portland published inventories. **The 36 facilities and their capacities come primarily from two county web pages — the shelter list updated July 2026 and the day-centre list from October 2025 — cross-checked against two government PDFs, the Adult Shelter Review for FY2025 and the City's Shelter Services Annual Report for FY2023-24.** Addresses geocoded from published street addresses.
- **Streets:** regional government street centrelines. **And an honest note the slide does not carry: we cannot establish this file's retrieval date or its redistribution licence.** We label it usable for modelling but not citable as sourced data, and our software licence explicitly excludes it and tells people where to obtain it themselves.

#### Code: the model refuses to start on an unsourced number
***[This claim is on the Sources slide as prose. The code is answer-bank.]***

**File:** `Geography/src/geography/science/ScienceRegistry.java`, line 172 *(two variable lookups omitted from the middle for space)*

```java
			// Rules 4 and 5 mechanise "no invented values": a measured or literature
			// value must name a resolvable source, and a literature or calibrated
			// value must state a range that can actually be swept.
			String doi = value(r, "doi_or_dataset");
			String uncertainty = value(r, "uncertainty_range");
			if (("L".equals(cls) || "M".equals(cls)) && (doi.isEmpty() || "none".equals(doi))) {
				throw new IllegalStateException(path + " [" + id + "]: evidence_class " + cls
						+ " requires a DOI or dataset id in doi_or_dataset");
			}
			if (("L".equals(cls) || "C".equals(cls)) && (uncertainty.isEmpty() || "none".equals(uncertainty))) {
				throw new IllegalStateException(path + " [" + id + "]: evidence_class " + cls
						+ " requires a non-'none' uncertainty range so it can be sensitivity-tested");
			}
```

**What this does:** Every number the model uses is listed in a spreadsheet next to a label saying what kind of number it is — **M for measured locally, L for taken from published literature, C for calibrated, and A for assumed.** At startup the model reads that spreadsheet. **If a number claiming to be measured or published has no source attached, or a published number has no stated range, the program stops and names the offending row.** `throw new IllegalStateException` is the Java phrase for "stop here and report why."

**The registry holds 28 variables and 26 assumptions. Four assumptions are marked blocking** — meaning they are named, unresolved, and printed into every run's record.

**If they ask the sharp version:** *"Your check only covers measured and published values. So a number labelled 'assumed' needs no source at all. Doesn't that make 'no unsourced numbers' overstated?"* **That is exactly right, and it is the correct reading.** The claim is narrower than the slogan: **a number may not *pretend* to have a source it doesn't have.** Assumed values are allowed — **but they are enumerated, every one of them, they carry a stated range, and the four that could change a conclusion are flagged as blocking in every run's output.** **The rule is not "everything is sourced." It is "nothing is sourced by assertion, and every assumption is visible."**

**Why it's here:** "Every number in our model is sourced" is easy to write in a methods section and easy to erode over months of edits. **This turns it into a precondition of the program running at all.** **My favourite thing in this project: the validator worked on its author. The very first run refused to start, because I had mislabelled one of my own rows. I fixed the data, not the rule.**

**If they ask:** *"Couldn't someone type a fake DOI to get past it?"* Yes. **This verifies that a claim was made, not that it is true. It's a tripwire against carelessness, not against fraud.** The truth check is human and it is published — the full source registry ships with the model, and where we verified a value through a secondary source rather than reading the original paper, the code says so at that spot, so a reviewer knows exactly which ones to pull.

**On the source count, and be precise:** **the slide lists fourteen numbered entries — the ones a reader needs. The technical reference carries thirty-five, and thirty-two of those have a DOI or a resolvable link. Three do not: two county news releases from September 2020, a Portland State report called *Stories from the Outside*, and the HUD annual homelessness report.** **I should flag one of those specifically: *Stories from the Outside* is where the 65%-never-heard-of-shelters figure comes from — my least-linked source backing one of my most-quoted numbers. It needs a permanent link before publication.**

---

## THE BACKSTORY: WHAT CHANGED, AND WHY
*Not a slide. This is your answer bank for "what did you actually do?" — which is the question you are most likely to get.*

**What I inherited was a working demo, not a research model.** It was Repast Simphony — a simulation platform — running its own sample project about Chicago water zones and radio towers, adapted to Portland. **Sixteen program files, 1,498 lines.** **It was not under version control at all.** Version control is the system that saves a dated, numbered snapshot of every file every time anything changes; a commit is one such snapshot. **Before me, this project had none, so there was no record of anything.** Eight of those sixteen files were leftovers from the water demo and did nothing. **My first commit was the first time this project had ever been saved.**

Here is what changed, in order of how much it mattered.

**1. The street map was corrupt, and it inflated everything.** Twenty-seven bad intersection IDs created fifty impossible connections. Travel distances came out roughly fifteen times too high for nearly half the population. Fixed by grouping intersections on location rather than trusting labels. **Maximum travel time went from 875 minutes to 212. This is the single largest correction in the project.**

**2. The population was 3.4 times too small.** The study was using 2,037 — a 2019 figure. The current count is 6,842. **That changes the ratio of beds to people from 0.89 down to 0.33, which changes every headline magnitude in the study.** We deliberately did *not* re-run partway: **a half-applied population change is worse than no change**, so we documented the full procedure and executed it in one pass.

**3. Everybody used to evacuate at the start of the simulation, before the smoke.** So they sheltered before the air went bad and absolute exposure was meaningless. Now people leave when the air crosses the EPA Unhealthy line. **In that configuration, average exposure went from 28.5 to 379 micrograms per cubic metre multiplied by hours — a thirteenfold correction, and the first version was the wrong one.** *(Those are figures from the historical configuration, not the present-day runs on Slide 7 — say so if you quote them.)*

**4. There was no routing at all.** The original code had people hop to whichever street segment looked closest. That isn't route-finding; it produced loops where people oscillated between two streets forever. **In the 100-person test run, only 30 arrived; the other 70 wandered.** We built a proper street graph and shortest-path routing. **99 of 100 arrived**, and the one failure is now correctly *reported* as unreachable rather than silently wandering. **It also fixed a real crash.** The old code compared every person to all 112,070 streets every minute — **and that comparison allocated a fresh set of candidate streets each time, so memory piled up faster than it could be reclaimed and the program ran out. The crash log is still in the repository.**

**5. The experiment was designed so it could not detect its own answer.** An earlier version compared real shelter placement against optimised placement — but *both* scenarios were capacity-limited, so both admitted the same number of people. **That version found no difference. The reason it found no difference was that the design made a difference impossible to see.** **Equalising capacity moved the placement signal out of the admission count — where it was structurally invisible — and into walking distance and inhaled dose, where it could be measured.** Mean walk fell from 11.3 to 8.4 kilometres and mean inhaled dose from 2,681 to 2,347 micrograms. **The admission counts stayed identical, which was the point: capacity was no longer the thing doing the work.**

**6. Refused people were teleported home before re-planning.** Fixed, as described earlier. Up to ten kilometres of phantom walking per person, gone. **And crucially — without that fix, the phantom distance would have read as a capacity finding.**

**7. There was a second unsourced value, and we deleted it.** An early version modelled indoor air protection with a factor we could not source. Removing it wasn't a simplification — it was a scope decision. **It would have dominated the absolute benefit numbers while telling us nothing about placement**, which is the actual question. So shelter arrival became where the study stops measuring.

**8. Movement arithmetic was done in degrees of latitude and longitude.** At Portland's latitude, one degree east-west is only about 70% of one degree north-south. **So people walked at different speeds depending on which direction they went.** Rewritten to measure real distance on the globe.

**9. People were deleted from the simulation when they arrived — and also when they failed.** Both outcomes looked identical afterwards, and the population you could measure at the end consisted only of the people who made it. **You only measure the winners. That is a bias in every equity statistic the project would ever produce.** Now everybody persists with an explicit final state.

**10. Being refused was a dead end.** In the 2020 configuration, someone turned away from the only open shelter never tried the second one when it opened the following day — **so 99 real beds sat unused.** Refusal became a waiting state that is reconsidered each minute.

**11. COPD had no effect on anything, despite the evidence existing.** Once we found and verified Buekers 2024, **COPD residents' shelter access fell from about 9.4% to 3.1% — figures from the older 2,037-person configuration, not the present-day runs, where COPD access in Scenario A is 22.2%.** Say which configuration you mean, or the numbers look like two different studies. **We went looking for the same evidence on asthma and did not find it, so asthma gets no effect. We report that asymmetry as an evidence gap, not a preference.**

**12. Nine archived runs claimed a code snapshot that could not have produced them.** Found by our own audit, fixed, and then mechanised so it cannot recur silently. **We hit this class of error twice. The second time, we changed the protocol: commit first, run second, verify the record card third.** The last batch of runs was committed *before* being run.

**13. And the citations.** Already covered, but it belongs on this list, because it is the change that determined what this project is allowed to claim. **All four multipliers held at 1.0, with a warning printed into every run's record. No result ever silently depended on a number we could not find.**

**How much is mine, in one sentence.** **The dead-demo removal took out about 1,000 lines of Java, and roughly 3,000 lines counting the demo's display configuration and log clutter alongside it.** Then six entirely new components went in: the population sampler, the street routing graph, the smoke field, the data loader, the results exporter, and the governance registry. **Say the Java figure first — the 1,500-line inheritance and a 3,000-line removal look contradictory unless you say what the 3,000 includes.**

---

## A NOTE ON TOOLING

**The written chapter carries a standard disclosure that AI tools assisted with coding and verification, with the researcher directing the work and taking responsibility for it.** **That disclosure is in the Methods section, and it is also printed in the footer of this deck — so it is on screen during Q&A. Do not be surprised if someone reads it and asks.**

If it comes up, the plain answer is: **AI assisted with implementation and with cross-checking. Every scientific decision — what to model, what to exclude, which citations to accept, which numbers to block — was mine, and every load-bearing citation was verified independently against the primary source.**

**That verification is what caught four separate citation errors, all listed in the technical reference. The clearest one to name out loud: the brief's 1.45 age multiplier. I went to the source, found it couldn't produce that number, and then found Kondo and colleagues, 2019, who pooled eight studies on exactly that question and report a value of 1.008 — statistically indistinguishable from no effect at all.** **That is the work. A tool can draft a paragraph; it cannot decide to go and check.**

**If they ask how that squares with "I removed 3,000 lines and wrote six components":** **I wrote the specification for every one of those components, I chose the algorithms, I made every scientific call, and I verified the output against independent recomputation in a second language. I used an assistant the way I'd use a compiler or a library — it accelerated the typing, it did not decide anything. The commit history shows every decision, its reason, its source, and how it was validated.** Then move on.

---

## Q&A PREPARATION
*The hardest questions, and honest answers. Read the answers out loud too.*

**1. "You said adding beds widens the equity gap. Isn't that an argument against adding beds?"**
No, and I want to be careful about this. **In absolute terms, mobility-limited people do vastly better in Scenario B than in Scenario A — from 19.7% getting inside to 71.9%.** Nobody is worse off. The point is narrower: the *benefit* of new capacity is not shared evenly, and a capacity-only evaluation would report 92% success and never see it. **The finding is that capacity and placement should be decided together, not that capacity is bad.**

**2. "Your model over-predicts by 1.5 times against the only real observation you have. Why should I believe any of it?"**
That's the right question, and the answer has two parts. First, **the direction is known and the reason is known** — we don't model whether people have heard of the shelters, and a local survey says 65% haven't. So we systematically over-count admissions. Second, and more important: **that bias applies equally to all three scenarios.** The comparison between them — which is the entire finding — is far more robust than any absolute number. **I would not stand here and tell you exactly how many people get inside. I would tell you that placement moves it substantially at zero extra capacity.**

**3. "Two air monitors for a whole county. Isn't your smoke field basically made up?"**
The smoke field is the same everywhere by design, and we say so in a dedicated audit. **With two monitors, any spatial interpolation would fit two points and manufacture gradients the data cannot support.** And the consequence actually helps the study: **since there is no clean air anywhere, placement cannot help by moving people into cleaner air. Every effect we report is a travel-time effect. That makes the mechanism unambiguous.** **The honest cost: we cannot say anything about neighbourhood-level differences in smoke, and I would not let anyone use this study for that.**

**4. "You've thrown out the vulnerability weighting the project was built around. Isn't the study now less than it promised?"**
Yes. It promised a single vulnerability-weighted number, and it does not deliver one. **It delivers something I can defend instead.** The alternative was to publish a headline figure built from multipliers that do not appear in the papers they're credited to. **And there are two deeper problems than the citations. First, multiplying exposure by a relative risk is a category error — a relative risk is a ratio of outcome rates, not a multiplier on micrograms. Second, no health outcome is simulated here, so no weight could ever be validated by this model; it would just be a number I chose, propagated through everything.** The correct response was to report groups separately.

**5. "Your Scenario B tripled every building. That's not a policy. What's the point?"**
It isn't a policy and the script that builds it says so about itself. **B is a diagnostic. Its job is to remove capacity as an explanation, so that whatever failure survives can only be geography.** And it survived — 578 empty beds and 562 people refused. **C is the policy-relevant scenario, and C was specifically rebuilt to be buildable: no existing facility moves.**

**6. "578 empty and 562 turned away — those are almost the same number. Isn't that just arithmetic?"**
Yes, and thank you for pressing — **it is forced, and here is the arithmetic.** **In Scenario B, capacity equals population exactly. So an empty bed means someone who could have used it didn't. 578 empty beds equals 562 people refused plus 16 people who cannot reach any shelter by any route. In Scenario C the same identity holds: 272 equals 256 plus 16.** The near-equality is a consequence of the construction, not a discovery. **The substantive finding is untouched, and it is what I'd stand on: B has one bed for every person and still fails 562 of them, because the beds they needed were not reachable.**

**7. "Your encampment locations come from public complaints. Isn't that badly biased?"**
It is biased, and the bias is toward camps that are visible and in places where people call the city. **We use it because the alternative is placing 6,842 people on a grid, which is a fiction with no error bars at all.** On direction: complaint-driven reporting probably over-represents dense, populated areas, which are also nearer to shelters. **So if anything it makes access look easier than it is — consistent with every other bias in this model.**

**8. "You imported Minnesota asthma and COPD rates into Oregon. Why is that acceptable?"**
It is a named limitation, not a hidden one. There is no equivalent Oregon study of health-record-diagnosed conditions in this population. **What makes it tolerable is that in this model a diagnosis affects exactly one thing — COPD reduces walking speed — and we re-run the model across that effect's uncertainty range rather than assuming it.** If the prevalence is wrong by a few points, the size of one group shifts. It cannot corrupt the mechanism.

**9. "Twenty-seven runs sounds small. Is that enough?"**
For this design, yes, and I can show why. **Change only the random starting point and the number admitted moves by at most 11 people. The smallest gap we claim between scenarios is 306. The signal is 28 times the noise.** Nine replications is more than sufficient to establish an ordering separated by that margin. **If the effects had been marginal, I'd need far more — and I'd tell you so.**

**10. "How much of this did you actually build, versus what you inherited?"**
The inherited code was a modified stock demo — **sixteen files, 1,498 lines**, half of it leftovers about Chicago water mains, no version control, no data collection of any kind, no smoke, no health, no real people, no real shelters, and five fictional shelters placed by an invented formula. **I removed about 1,000 lines of demo Java — roughly 3,000 counting the demo's display configuration and log files — and wrote six entirely new components: the population sampler, the street routing graph, the smoke field, the data loader, the results exporter, and the governance registry.** The full commit history is public and every commit states what changed, why, the source, and how it was validated.

**11. "You found nine bad runs in your own archive and a corrupt street file you had trusted. What else is wrong that you haven't found?"**
I genuinely don't know, and anyone who tells you they do is guessing. **What I can tell you is how I'd find out, because it's how I found these.** Independent recomputation in a different language. Checks that can fail loudly. Consistency checks that compare all 27 runs against each other. **The wormhole defect: one person walked 68 kilometres, the number looked wrong to me, and an independent route recomputation proved it and measured it.** The archive defect was found because I built a detector that could embarrass me. **The eighteen limitations in the technical reference are the things I know about. The infrastructure exists because I assume there are more.**

**12. "So what should Multnomah County actually do with this?"**
Carefully: **this is a modelling study, not a recommendation, and it predicts no health outcomes.** What it supports is one narrow, testable claim. **When shelter capacity is expanded for smoke response, where the new capacity goes matters roughly as much as how much of it there is — and the people most affected by that choice are the ones who walk slowest.** The concrete, checkable version: **in our reality scenario, 174 beds finish the event empty while 4,766 people are refused. That mismatch exists in the real inventory today, and it can be checked against real activation records without any model at all.** That's where I'd start.

**13. If someone has read the results document and quotes "every clean-air-capable facility in the county inventory" back at you.**
**That wording was wrong, and it has been corrected.** Nothing in our sources establishes that these buildings have filtered air, and the model does not simulate indoor air at all — it stops measuring when someone reaches the door. **They are the county's existing shelter facilities, catalogued for a different purpose. The results document now says "shelter facility" and carries a note explaining the correction.** If they are holding an older printout, say so plainly — **"you have a superseded draft, and that phrase is one of the things the current version fixes."**

*(Only the archived run-configuration files still carry the old phrase, in a human-readable comment. Those are deliberately left unedited, because they are the record of what was actually run, and changing them would falsify it. If anyone finds it: **"that's the original run configuration, kept as-is on purpose."**)*

---

## THE LAST THING TO SAY

If you get one closing line, make it this one:

**"The honest summary is that this model says people are left outside, and every assumption I made was one that would tend to make that look better than it is. If I'm wrong, I'm wrong in the optimistic direction."**
