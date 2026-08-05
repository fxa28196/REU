# Presenter's Script — *Capacity Is Not Access*
### More beds, or better beds? · 20 slides + a live browser demo

**Timing, measured not guessed.** The per-slide targets in the headings sum to
**24.5 minutes** if you narrate every line, and the full text (excluding the
indented answer-bank blocks) runs about **37 minutes** read cold. That is
deliberate: this is a *reference* script, not a teleprompter.

| You have | Do this |
|---|---|
| **25 min** | Narrate every slide at its header target; skip the indented answer-bank blocks. |
| **15 min** | Say only the **bold** lines on every slide, plus one supporting sentence each on slides 5, 8, 11 and 13. Drop all *[cut for time]* paragraphs. |
| **10 min** | Slides 1, 2, 9, 10, 11, 12, 13, 14, 19, 20 — bold lines only. The decision slides (4–8) become answer-bank. |

Whatever the length: **never cut slide 11** (the control that refutes the
placement attribution) **or slide 16** (the registered misses). Those two are
what make the rest credible.

**The live demo is a separate 3:00 block that sits between slide 15 and slide
16.** It is not a deck slide: you leave the deck, drive the browser, and come
back. Buy the three minutes for it by dropping the *[cut for time]* paragraphs
on slides 2, 3 and 8. At **15 min** run it short, steps 1 to 4 only, no
Provenance tab. At **10 min** do not run it live at all: put up
`websim-03-arm-c-archive-validated.png` and
`websim-04-arm-c-hour20-evacuation.png` as two images and say the lines under
FALLBACK 2 and FALLBACK 3. **A demo you rehearsed and chose not to run costs
you nothing. A demo you run and cannot rescue costs you the talk.**

*Read this once slowly, then twice out loud. **Bold** lines are the ones to say
more or less as written. Paragraphs marked **[cut for time]** can go without
leaving a hole. Everything else is answer-bank material — it is here so that
when someone interrupts, you already have the answer.*

**Deck:** `docs/final/presentation/capacity-is-not-access-symposium.html`
(arrow keys advance; Ctrl/Cmd-P → *Save as PDF* prints one slide per page).
**This script:** print the same way from `PRESENTER_SCRIPT_REFORMAT.html`.
**The live model:** the browser build of this same simulation. Launch and
rehearsal instructions are in the demo block between slides 15 and 16; the four
fallback images live in `docs/final/presentation/screenshots/`.

---

## THREE HABITS THAT CARRY THE WHOLE TALK

1. **Say the number, then say what it counts.** Never "thirty percent." Always
   "thirty percent — 2,060 of the 6,842 people living outside."
2. **Volunteer the boundary before you are asked.** A senior scientist's trust
   in your good numbers is built out of watching you be exact about the edges
   of them.
3. **When you don't know, say "I don't know, and here is what we'd need to
   know it."** That sentence is always available to you.

---

## WORDS YOU WILL NEED

| Term | What to say if asked |
|---|---|
| **agent-based model** | "Instead of one equation about a population, one simulated person for every real person, each deciding for itself each minute." |
| **random starting point** (= *seed*) | "The one number that fixes the whole random sequence, so the same starting point always reproduces the same run. Mine are 42 through 50." |
| **scenario** (never "arm") | A, B, C or D. One word only. |
| **intersection** (= *node*) | "The model turns the street map into intersections joined by segments. That is what lets it find routes." |
| **street segment** (= *edge*) | A piece of street between two intersections. |
| **tick** | "The model advances in one-minute steps. Each step is a tick." |
| **version control / commit** | "A dated, numbered snapshot of every file, every time anything changes. Before me this project had none." |
| **fingerprint** (= *checksum*) | "A short code computed from a file's contents. Change one character and the code changes completely — so you can prove you have the same file I did." |
| **DOI** | "The permanent identifier a published paper carries, so a link never rots." |
| **PM2.5** | "Fine particulate — soot under two and a half micrometres, about a thirtieth the width of a hair. That size passes the body's filters and lodges deep in the lung. Measured in micrograms per cubic metre." |
| **relative risk** | "A ratio of outcome *rates* between two groups. Not a multiplier on exposure — that distinction is the whole of slide 8." |
| **odds ratio** | "How much a factor multiplies the odds of an outcome. Above one raises them, below one lowers them." |
| **null result** | "It found no difference." |
| **negative control** | "A test designed to find nothing. If it finds something, the model is inventing effects." |
| **stratified** | Say "separately, side by side, unweighted." |
| **emergent** | "Nobody programmed it. It falls out of the rules." |
| **survivorship bias** | "You only measure the winners." |
| **binding constraint** | "The thing actually causing the failure." |
| **certified run** (the archive) | "A run that was executed, checked, and stored together with its inputs, its code version and a fingerprint of every data file. The number is fixed, and anyone can re-derive it." |
| **archive-validated** (green badge) | "This exact configuration is the one that reproduces a stored certified run. Change one setting and the badge drops." |
| **exploratory** (amber badge) | "You are looking at something I have not certified. It may be interesting; it is not a result." |

**Pronunciation.** Mult-NO-mah · "P-M two point five" · "micrograms per cubic
metre" · REE-past SIM-fon-ee (Repast Simphony) · dyke-STRA (Dijkstra) ·
KAR-nee (Karney) · bo-HAN-non (Bohannon) · BOO-kers (Buekers) · ZELL-mer
(Zellmer) · BOYCE · SIL-cock (Silcock) · KON-doe (Kondo) · "oh-H-S-U" (OHSU).

---

## IF YOU ONLY REMEMBER FIVE THINGS

**One.** In September 2020 wildfire smoke sat over Portland for thirteen days.
I asked: if the same smoke arrived today, what happens to the 6,842 people
living outdoors — and should the county buy more shelter beds, or place the
beds it has differently?

**Two.** Today about three in ten get inside: 2,060 of 6,842. Raising capacity
to one space per person takes that to 91.6%. Splitting the identical capacity
across ten more doors takes it to 96.0%.

**Three.** I expected the placement algorithm to earn that last gain. **It did
not.** Ten sites drawn at random from the same candidate pool admit exactly
the same number. The gain is *more doors*, not *better-chosen doors* — and
five percent surplus capacity at the existing sites buys the same thing.

**Four.** The people left outside are disproportionately the people who walk
slowest, and it is a race decided in the first hour. One rule at the door — a
ten percent reserve — closes that gap completely, at zero capital cost.

**Five.** Four health-risk multipliers in the original project brief could not
be found in the papers they were credited to, so health weighting is switched
off and groups are reported separately. No result in this study depends on a
number I could not trace.

---

## THE WORD-SWAP CARD

| Don't say | Say instead | Because |
|---|---|---|
| "6,842 beds" and "6,842 people" in one breath | "one space per person" | Same numeral, two meanings, adjacent slides. |
| "peaked at 563" | "peaked at 562.7" | Say the number they can read on the chart. |
| "578 empty and 550 turned away — nearly the same!" | "B has one space per person and still strands 578 of them — 550 refused plus 28 who cannot reach anything" | The near-equality is forced arithmetic, not a discovery. A methodologist will catch it if you don't say it first. |
| "better-placed beds" | "the same total split across more doors" | The random-site control refuted the placement attribution for headcount. |
| "36 clean-air-capable facilities" | "36 existing shelter facilities" | Nothing in my sources establishes filtered air in those buildings. |
| "placement is free" | "more doors is free; choosing them well buys a shorter walk" | Precise attribution — slide 11. |
| "arms" | "scenarios" | Clinical-trial jargon; no reason for a second word. |

**Numbers that collide — always attach what they count.** 194 = hours above
the unhealthy line. 28 = people who can reach no shelter. 562.7 = micrograms
per cubic metre at the peak, never a headcount. 6,842 = people, and in
scenario B also spaces.

---

## THE CREDITS, AND THE DATA-RIGHTS SENTENCE

*Say these exactly. They are the two places where an imprecise word costs more
than a wrong number would.*

**The credits, for slide 1 and for anyone who asks afterwards.** The work was
done at **Portland State University** as an NSF Research Experiences for
Undergraduates site, under **Prof. Christof Teuscher**, and supported by **NSF
award 2244551**. Your home institution is **Harrisburg University of Science
and Technology**. Say the award number if the deck shows it; do not round it,
paraphrase it, or attach it to the wrong body.

**The data-rights sentence, if anyone asks whether you are allowed to publish
the map or the campsite layer.** The street network is **Oregon Metro's
Regional Land Information System, RLIS** (an Oregon Metro programme, not a City
of Portland one). The campsite layer derives from the **City of Portland's
Impact Reduction Program campsite reports**. **Both bodies approved
redistribution of the derived products, relayed on 2 August 2026.** Then the
half-sentence that has to follow it: **"That approval is my own attested report
of it. There is no written licence grant on file, no reference number and no
licence name, so I credit both providers and I do not claim more than that."**

> **Words to avoid on that answer:** "licensed", "we have a licence from
> Metro", "permission in writing", "cleared by legal". None of those is
> supported by the record, and the repository's own claim linter blocks several
> of them. **Credit both providers, state the approval, state its form.**
>
> **The related one, if human-subjects review comes up:** the faculty mentor
> determined that **no IRB review is required** (no human subjects, and not yet
> a real-world application), relayed on the same date and also verbally. **Do
> not say "IRB-exempt".** That is a specific determination nobody issued.

---

# THE TALK

### SLIDE 1 — Title · *0:30*

**In September 2020, wildfire smoke settled over Portland and stayed for
thirteen days. At the worst hour the air carried 562.7 micrograms of fine soot
per cubic metre — roughly fifty times a clean-air day. If that smoke returned
today, 6,842 people in Multnomah County would be outdoors in it. My question
was simple: should the county buy more shelter beds, or place the beds it
already has differently?** (pause) **I built ninety-three simulations to find
out, and the evidence refused the answer I expected.**

---

### SLIDE 2 — The hazard · *1:15*

[CLICK] **The red line is measurement, not modelling.** It is the U.S.
Environmental Protection Agency's air monitoring network — physical
instruments reporting once an hour. PM2.5 is fine particulate: soot small
enough to pass the body's filters and lodge deep in the lung.

**Read the axes with them:** horizontal is clock time across the thirteen-day
window, one point per hour; vertical is concentration in micrograms per cubic
metre. **The dashed line is 55.5 — the EPA's published "Unhealthy" breakpoint,
the level at which the agency says everyone, not only sensitive groups, may be
affected.**

Three measured numbers:

- **The worst hour reached 562.7 micrograms per cubic metre.**
- **The average across the whole 312-hour window was 173.1** — that matters
  more than the peak. The air was not bad for an afternoon; it was three times
  over the unhealthy line for nearly two weeks on average.
- **194 of the 312 hours were above the line — and they came in two spells.**
  [POINT] A six-hour spike on the first evening, hours sixteen to twenty-one.
  Then fifty-seven consecutive clean hours. Then the main episode from hour
  seventy-nine. **That shape matters later, so I show it rather than quoting
  "194 hours" as if it were one continuous emergency.**

**Now the population.** The 2025 Tri-County Point-in-Time Count — the annual
one-night census that federal funding requires, run by Portland State's
Homelessness Research and Action Collaborative — counted 10,526 people
experiencing homelessness in Multnomah County, **more than 65% of them
unsheltered. That is the 6,842.**

**[cut for time]** One provenance note: the EPA sets its own "Wildfire — U.S."
qualifier flag on 1,576 rows of this file, spanning exactly this window. **The
agency itself certifies that this is wildfire smoke. I did not have to decide
that.**

> **If they ask why 2020 smoke with a 2025 population:** deliberate, and it is
> the actual research question — *if that event returned today*. It is the
> largest measured local event, recorded hourly, so I don't have to invent a
> hazard. Every vintage is disclosed on slide 18.
>
> **If they ask whether all 6,842 are really outdoors at once:** that is a
> disclosed modelling construct — a worst-case presence assumption, not a claim
> about any single night. And the 2025 count's own authors say administrative
> data changes substantially augmented it, so I never present 2019 and 2025 as
> a clean time series.

---

### SLIDE 3 — The population · *1:15*

[CLICK] **6,842 simulated people. Nobody is a copy of anybody else, and
nobody's characteristics were invented.** Each one gets an age, a sex, whether
they have a mobility limitation, whether they have asthma, whether they have
COPD, and a walking speed that follows from all of that.

**The table has two number columns and you should point at both.** "Coded" is
the published proportion the sampler targets. "Drawn" is what this run actually
produced. **The difference between them is ordinary sampling variation in
6,842 draws — and I report it rather than hiding it.**

- **Age comes from the Pathways Study 2026** — a local survey of 541 people run
  by Portland State and OHSU: 52.7% aged 18–44, 42.3% 45–64, 5.0% 65-plus.
- **Mobility limitation: coded 19.2% from the local Point-in-Time Count; this
  run drew 19.9% — 1,360 people.** And I say out loud that the real figure is
  probably higher, because the question was asked only of survey completers and
  I applied their rate to everyone.
- **Asthma and COPD come from Zellmer and colleagues 2025**, in the *Journal of
  General Internal Medicine*, from 20,139 electronic health records. Coded 15%
  and 10.5%; drawn 14.8% and 10.8%. **For contrast: 15% asthma here against 7%
  in housed adults; 10.5% COPD against 3%. The people most exposed to smoke are
  also the people least able to tolerate it.**
- **Start locations are real.** The city's campsite-report feed holds 3,400
  reports, which resolve to **3,317 distinct coordinates**; a single run seeds
  its residents at a sampled subset of those. **Every simulated person starts
  where somebody actually reported a campsite.**

**[cut for time]** Sex is 68.4% male, 29.3% female, 2.3% other — and that one
is 2019, not 2026, because no current local figure exists. It is on slide 18
with the other vintages.

#### The code decision behind this slide: a private supply of randomness
*[answer-bank — narrate only if asked]*

`PopulationSampler` is constructed with `new Random(seed * 1000003L + 17L)` —
its own random stream, used for nothing but drawing people.

**What it does.** The model needs random numbers to assign each person's age,
sex and health. This creates a private supply whose starting point is derived
from the run's number by a fixed recipe. Same run number, same 6,842 people,
forever.

**Why it's there.** The simulation platform has one shared pool of randomness,
and that same pool also places encampments and decides what order people act in
each minute. If I had drawn people from it, adding one new human attribute
would have silently moved every encampment, and nothing already run would still
compare. **The verified consequence: adding the entire human-attribute layer
left the archived baseline byte-for-byte identical.**

> **"Why 1,000,003 and 17? Did you tune them?"** No — arbitrary spreading
> constants, so consecutive run numbers don't produce nearly-identical
> populations. Swap them for any other pair and population averages land in the
> same place; only which individual gets which attribute changes. That is
> exactly what nine random starting points are for.
>
> **"You derived the private stream from the same number as the shared stream.
> Aren't they correlated?"** Two answers. The multiply-and-offset puts the two
> starting points far apart, and Java's generator has a period of 2⁴⁸, so the
> sequences do not meet in a run this length. And more importantly it doesn't
> have to be true for the study to hold: across nine starting points the
> admission count moves by at most eleven people. A damaging correlation would
> show up as instability. There is none.

---

### SLIDE 4 — Why an agent-based model · *1:00*

[CLICK] Four beats, and this is the pattern for every decision in the talk:
**the decision, the reason, the source, and what would change if I were wrong.**

**The decision:** simulate one person for every real person, rather than write
an equation about a population.

**The reason:** the outcome is a collision with a hard limit. **A shelter that
is full turns away the next person to arrive — and who arrives first depends on
where they started and how fast they walk. An average cannot represent a full
doorway.**

**The sources:** the platform is Repast Simphony (North et al. 2013, DOI
10.1186/2194-3206-1-3); routing is Dijkstra's algorithm — the same calculation
your phone does — from Dijkstra 1959 (DOI 10.1007/BF01386390); distances are
measured on the curve of the earth by Karney's method (Karney 2013, DOI
10.1007/s00190-012-0578-z), **because "we measure geodesic distance" should
name whose method.**

**What would change if I were wrong:** if arrival order didn't matter — if beds
were allocated centrally by need — the fairness result on slide 13 would
vanish, because it is produced entirely by first-come-first-served admission.
**Scenario D tests exactly that counterfactual, so the assumption is not left
hanging.**

---

### SLIDE 5 — The street network, and two defects in it · *1:45*

[CLICK] People walk the real Portland street grid from the regional
government's centreline file. **This is where I found the two most
consequential defects in the project, and both were found by checks built to
embarrass me.**

**Defect one — corrupt intersection labels.** The file labels every
intersection with an ID. I deliberately trusted those official IDs rather than
guessing intersections from geometry — that seemed like the rigorous choice.
**A map file has two halves: the drawing, and a table of labels attached to it.
The drawing was fine. The table of labels was corrupt.** Twenty-seven IDs
appeared at physical locations nine to eighteen kilometres apart, welding
distant places into single intersections and creating **fifty impossible
connections** — the route-finder believed you could cross the county in one
free step.

**How I found it:** one person in an early run walked a reported 68.3
kilometres, and that number made me look. **What proved and measured it was an
independent check — a separate program, in a different language, that rebuilds
the graph and recomputes every route.** The suspicion was human; the proof was
mechanical.

**The fix:** cluster the claims by location. Within ten metres of a real
junction, treat it as that junction — that happened four times. Further than
that, file it as a genuinely separate place with a new identifier — twenty-three
times. **Nothing deleted, no geometry edited, every correction written into the
run's record.** Impossible connections after the fix: **zero**.

**Defect two — freeways in a walking map.** The same file includes
limited-access highways. **2,636 freeway-class features, 614 kilometres —
including the Marquam and Fremont bridge decks, which carry no pedestrian
access at all — were routable.** I excluded them by road class before the graph
is built, logged the removal into every run's record, and **regenerated all
ninety-three runs.**

(look up) **And here is the result that matters more than the defect: every
headline admission number was unchanged to the digit. About twelve people per
run moved from "turned away" to "could not reach", because their only link to
the network had been a freeway. That survival is the strongest robustness
evidence in this study.**

> **"Where did the ten-metre and hundred-metre thresholds come from? Did you
> pick numbers that made the problem disappear?"** No, and this one is easy to
> check. Where two streets legitimately meet, their recorded ends differ by well
> under a metre. The smallest corrupt displacement was about 1.65 kilometres.
> **That is a thousandfold gap with nothing in between**, so any threshold in
> the middle of that empty band produces an identical map. **Be precise: that is
> an argument from the empty band, not an executed sweep — the tolerance is
> fixed at 100 metres in code and every run records that same value.**
>
> **"After splitting IDs, do routes still connect?"** Two checks. Nothing became
> stranded by the split, and a separate audit looks for any segment whose two
> recorded ends are further apart than its own recorded length — geometrically
> impossible. Before: fifty. After: zero.
>
> **"How many disconnected pieces are there?"** On the corrected walking map,
> 171 components, the largest holding 59,725 of 88,100 intersections. **That is
> why 28 people in every scenario can reach no shelter at all** — they start on
> a fragment whose only connection was a road they may not legally walk.

---

### SLIDE 6 — The two behavioural rules · *1:30*

[CLICK] **Two rules do nearly all the work in this model.**

**Rule one — when people leave.** A person departs when the measured
concentration crosses 55.5 micrograms per cubic metre *and* at least one
shelter is open. Both conditions are checked at the same instant; otherwise
they stay where they are, outdoors, still breathing it in.

**Why:** an earlier version had everyone evacuate at hour zero. That is not how
a slow-onset smoke event works, and the effect was enormous — **average
exposure came out roughly thirteen times too low, because everyone was indoors
before the smoke arrived.** **Where the number comes from:** the EPA's published
"Unhealthy" breakpoint — deliberately a public standard rather than a value I
chose. **And the honest framing: it is a reporting boundary used as a
behavioural trigger. Real residents do not carry monitors, and individual
awareness is not in this version.**

**Rule two — what happens at a full door.** On arrival the person asks for a
space. If the shelter filled while they were walking, **they remain standing at
that shelter's intersection and re-plan from there** — excluding shelters they
now know are full.

**Why:** the original code re-planned from the person's campsite, which
effectively teleported them home before sending them out again — **inflating
distance and dose by up to ten kilometres per person.** The single line moving
them to the shelter's intersection is the whole fix.

**Why it stayed hidden, which is the interesting part:** at the fifty-person
test scale no shelter ever filled, so that branch never executed and every
comparison test passed. **It would have first appeared as a corrupted headline
at full scale. That is the argument for checks that are arithmetic rather than
comparative** — and it is now guarded by one: for every person, distance walked
must not exceed distance planned plus the snap gap plus 200 metres of slack.

> **"How often does being refused actually happen?"** In scenario A, 2,060
> people get in — and the system records **17,167 door refusals**, because one
> person is refused at many doors. **That column counts refusals; the headline
> counts people.**
>
> **"Why cap the retries at nine?"** It is a safety limit so the program cannot
> loop forever, not a claim about human behaviour. **The most any individual
> actually used is eight** — so the cap never bound, and I'd rather tell you it
> was close than claim comfort I don't have.
>
> **"Two people reach the last space in the same minute. Who gets it?"** Whoever
> the platform runs first that minute — a lottery, not a priority rule, and a
> stated limitation. **It is also precisely the lever scenario D tests.**

---

### SLIDE 7 — Walking speed · *1:15*

[CLICK] **Every speed in this model comes from a published measurement, and the
table names each one.**

- **Everyone** gets an age-and-sex mean from **Bohannon & Williams Andrews
  2011** (*Physiotherapy*, DOI 10.1016/j.physio.2010.12.004 — 41 studies,
  n = 23,111), with individual spread from **Bohannon 1997** (DOI
  10.1093/ageing/26.1.15).
- **Mobility-limited residents' speed is *replaced*, not reduced** — by the
  impaired-walker distribution from **Boyce, Shields & Silcock 1999** (DOI
  10.1023/A:1015339216366), mean 0.95 metres per second.
- **COPD subtracts 0.19 metres per second** from the age-and-sex mean —
  **Buekers et al. 2024** (*European Respiratory Review*, DOI
  10.1183/16000617.0253-2023), pooling 25 studies, 1,015 people with COPD
  against 2,229 without. **The review's own authors rate that evidence low
  quality, so I don't assume it — the model is re-run across the range the
  paper reports.**
- **Asthma gets no speed effect at all.** I went looking and found no
  gait-speed measurement for asthma. **Borrowing the COPD number to make the
  treatment symmetric would have manufactured a finding.** That asymmetry is a
  gap in the evidence base that I searched for and report — and on slide 15 it
  becomes the model's negative control.

**Two conservatisms worth saying out loud, because a quantitative reviewer will
look for them.** First, **the spread is within-population variation, not the
meta-analysis confidence intervals** — those describe uncertainty about a mean
across studies, and using them would have understated real person-to-person
spread by three to five times. Second, **someone with both a mobility
limitation and COPD gets only the mobility speed**, because no study measures
the combination. **Both choices make my simulated world easier than reality, so
the real access failure is probably worse than what I report.**

---

### SLIDE 8 — Three quantities, and four citations that failed · *2:00*

[CLICK] **This is the section where the project's credibility was actually
decided.**

The original brief proposed one headline metric: multiply smoke concentration
by risk multipliers. Four of them — age 65-plus 1.45, COPD 1.80, asthma 1.40,
under-18 1.22. **I checked each against the paper it was credited to. Not one
survived.**

- **The 1.45** was credited to Di et al. 2017 in the *New England Journal of
  Medicine* — a real and excellent paper. But **its entire cohort, all 60.9
  million people, is aged 65 and over. A study containing nobody under 65
  cannot produce a 65-plus-versus-under-65 contrast.** No value near 1.45
  appears in it.
- **The 1.80** was credited to "Anderson et al. 2013," which I could not
  locate. The nearest record for that year is a cardiovascular study with no
  COPD estimate; the nearest for that author name is a 2012 narrative review.
- **The 1.40** cites a paper whose journal, volume and pages do not match, and
  the real article reports no asthma modifier.
- **The 1.22** cites a report series, not a paper.

**[cut for time, but it is strong]** I also went looking for what the evidence
*does* say, rather than only showing the citation was bad: **Kondo et al. 2019
pooled eight studies and report an elderly-to-adult ratio of 1.008, with a
range from 0.996 to 1.020. That range includes one. It is a null result.**

**And there is an argument that survives even if someone hands me four perfect
citations tomorrow: multiplying exposure by a relative risk is a category
error. A relative risk is a ratio of outcome rates. You cannot multiply
micrograms by a mortality ratio and get micrograms.** No weight could be
validated here anyway, because this model simulates no health outcome.

**So I restructured the code to hold three things permanently apart** — point
at the table:

**One: how dirty the air around you was.** Physics of the air. **Verified
against EPA's raw monitor data to a ratio of 1.0000.**
**Two: how much of it entered your lungs.** Physics of the person — it differs
from the first only by how hard you were breathing, walking versus waiting.
**Not by your diagnosis.**
**Three: how much harm it does to you specifically.** Biology. **Set to "no
adjustment" for everybody — and the slot exists precisely so a weight can never
be slipped in silently.**

> **"Doesn't someone with asthma take in more harm from the same air?"** They
> very likely suffer more harm — but they do not inhale more particulate. **How
> much air enters your lungs depends on how hard you're working, not on your
> diagnosis.** That is why the breathing rate switches on activity and nothing
> else: 1.62 cubic metres per hour walking, 0.61 waiting, both from the EPA
> Exposure Factors Handbook. The extra harm belongs in the third quantity,
> which is switched off.
>
> **"A function that always returns 1.0 does nothing. Isn't that dead code?"**
> Arithmetically it does nothing, and that is the point — it is a public
> declaration in the source. Delete it, and a future contributor can slip a
> vulnerability factor into five places. Keep it, and there is exactly one
> auditable location. **And the 1.0 is printed into every exported row, so a
> reader sees the switch position rather than taking my word for it.**

**[Presenter note on the two breathing rates. Read before the talk; say none of
it unless you are pushed.]** Give the two constants the way the model uses them
and describe them as **walking against waiting**. **Do not volunteer the ratio,
and do not say "2.7 times".** A primary-source verification sweep on 4 August
2026 re-read the EPA Exposure Factors Handbook chapter these are credited to and
found **the 1.62 walking value exactly where it is credited** (Table 6-2,
moderate intensity) **and could not find the 0.61 waiting value in that chapter
at all**. The nearest real cells are about 0.72 for light activity and 0.25 to
0.30 for sedentary, so a correction could move the ratio down to about 2.25 or
up to about 5.4. Nothing has been changed on the strength of that yet; the
defect is written up in `docs/science/D16-EFH-VENTILATION-DEFECT.md`.

**What is robust is the direction, and it is robust for every candidate cell in
that table: walking ventilation exceeds resting ventilation. That is the whole
load-bearing claim, and it is why removing walking time cuts dose by more than
it cuts exposure.** If someone asks you for the multiple: *"The walking rate is
verified against the primary source. The resting rate is under review, because
I went back to the handbook and could not find it in the chapter it is credited
to, so I am not going to quote you a ratio built on it. What survives is the
direction, and the direction holds for every cell in the table."* **That answer
is stronger than the number would have been.**

---

### SLIDE 9 — The four scenarios · *1:15*

[CLICK] **Four scenarios, and they are not four guesses — each one answers a
question the previous one raised.**

**Scenario A is today**: the county's real 36 facilities at their real geocoded
addresses, 2,234 spaces. **A is a measurement, not a treatment. Its only job is
to tell me which constraint actually binds.**

**Scenario B answers what A found.** A found that capacity binds, so B raises
every facility by the same factor — 3.06 — until there is exactly one space per
person. **Coordinates completely unchanged. A to B isolates capacity and
nothing else.**

**Scenario C answers what B found.** B left spaces empty while still refusing
people, so **C spends B's identical total on different geography**: existing
sites grow only 1.5×, and the remainder opens as ten new sites of about 349
spaces each. **B to C isolates where the same capacity sits.**

**Scenario D answers what C could not fix.** Physically identical to B — same
buildings, same 6,842 spaces — but **10% of each facility, 667 spaces, is
reserved for mobility-limited arrivals. Only the intake rule changes.**

**Two design points worth defending, because I got one wrong first.** An
earlier version of C picked up all 36 real facilities and moved them. **That is
physically absurd — a county cannot relocate its shelter system — so it
measured a best case nobody could act on.** C was rebuilt so real buildings
stay put and new sites are added. **And scenario B is not a proposal either: it
is a diagnostic that removes capacity as an explanation.** The build script
says so about itself.

**What makes "one thing at a time" true rather than asserted:** the 6,842
residents are **byte-identical across scenarios at each starting point,
verified by a SHA-256 fingerprint over the joined attribute vector.** No
population difference can explain any result on the next slides.

> **"Multiplying every shelter by three isn't a real plan."** Completely
> correct, and the script that builds it calls itself a modelling construct.
> **B removes one variable so the rest can be attributed. C and D are the ones
> a county could act on.**
>
> **"Does the rounding matter?"** It did, so it is handled explicitly: scaling
> gives fractions of a bed, so the build uses largest-remainder apportionment
> and then asserts the total is *exactly* 6,842. **A three-bed shortfall would
> have reintroduced the very scarcity B exists to remove.**

---

### SLIDE 10 — Who gets inside · *1:15*

[CLICK] **Read the axes first:** horizontal is scenario, vertical is the
percentage of the 6,842 residents admitted. The table below is one random
starting point — number 42 — **and the nine-seed range is printed under the
admissions row, so you can see the spread rather than take my word for it.**

**One. Today, seven in ten people living outdoors would still be outdoors.**
2,060 admitted of 6,842 — **30.1%**. On average they spend 135.8 hours outdoors
in unhealthy air and inhale 23,373 micrograms of particulate. **That last figure
is mass that actually entered an airway, not a concentration in the air around
them.**

**Two. Capacity is the first-order fix, and at exactly one space per person it
is still not sufficient.** 91.6% get in. **But look at the last rows of column
B: 578 spaces finish the event empty.**

(slow down) **And say this before anyone finds it: that number is forced. In B,
capacity equals population by construction — so empty spaces and people outside
are the same number counted twice. 578 empty equals 550 refused plus 28 who can
reach nothing. The near-equality proves nothing on its own. What carries weight
is that anyone was refused at all when supply exactly matched demand — and
which people they were.**

**Three. Splitting that identical total across ten more doors takes admission
to 96.0%**, cuts refusals from 550 to 244, and shortens the average walk.

> **"Why show one run rather than the average of nine?"** Because the table is a
> joint picture of one internally consistent world; averaging nine runs would
> produce a row of numbers no single run ever produced. **The check that matters
> is that all nine agree — the admissions range is eleven people wide — and that
> range is on the slide.**
>
> **"Every column adds to 6,842?"** Yes: admitted, plus turned away, plus the 28
> who can reach no shelter by any route. **That 28 is identical in every
> scenario — and verified to be the same individuals, not just the same count.**

---

### SLIDE 11 — What C's edge really is · *1:30*

[CLICK] **This is the control that killed my own headline, and I want to walk
through it deliberately.**

Scenario C admits 306 more people than B. **My hypothesis was that the
placement algorithm earned that.** So I built the control: **ten sites drawn
uniformly at random from the same 498-node candidate pool the optimiser
searched — three independent draws.**

(pause) **Every draw admitted exactly the same number of people as the
optimised sites. 6,570, 6,565, 6,566 — identical, run for run.**

**So the honest attribution is: the headcount gain comes from having more doors
to try, not from having chosen the right ones.** What choosing well *does* buy
is the journey — **people reach the optimised doors with 63% less walking than
the random ones — and that walking benefit depends on the assumption that
everyone knows where every shelter is.**

**Why report a control that refutes your own result?** Because **a result that
survives its own control is worth more than a larger result that was never
tested** — and because the corrected version is still policy-relevant: more
doors beats bigger buildings.

---

### SLIDE 12 — The exchange rate · *1:15*

[CLICK] **Axes again:** horizontal is total spaces at the *existing* 36 sites,
as a multiple of demand; vertical is percentage admitted. **The dashed
horizontal line is scenario C.** So the question this chart answers is: **how
many extra beds at the real sites buy what C buys by re-splitting them?**

**At 1.05× demand — 342 extra spaces — the existing sites match C's admissions
exactly. At 1.10× — 684 spaces — every person who can physically reach a
shelter gets in, and the fairness gap you'll see on the next slide disappears
entirely.** Beyond that the curve is flat; there is nothing left to buy.

(slow down) **So the county sentence is: C's siting advantage on headcount is
worth at most about 342 spaces. The fairness gap closes at ten percent surplus —
or for free with the rule on slide 14.**

**And I registered the opposite prediction before running this.** I expected the
crossing at 1.4 to 1.6 times demand. **It happened at 1.05. That miss is on
slide 16, and it made the policy answer cheaper.**

---

### SLIDE 13 — The fairness finding · *1:30*

[CLICK] **This is the result I'd most want a policy audience to take away,
because you cannot see it without a model of individuals.**

**Read the first chart:** horizontal is percentage of a group admitted; each row
is one scenario; the open circle is residents with no mobility limitation, the
filled circle is residents with one; **the number on the right is the gap
between them in percentage points.**

**1,360 of the 6,842 — one in five — have a mobility limitation. In this model
that means exactly one thing: they walk slower.** Just under one metre per
second against nearly 1.4. **Nothing else penalises them. Nobody is denied a
space for being disabled.** And yet in scenario A they get in at 20.1% against
32.6% for everyone else.

(slow down) **Say this one slowly, because it is counter-intuitive: adding
4,608 spaces to the same buildings nearly doubles the gap — from 12.5 points to
23.7. Everyone improves in absolute terms. The fast walkers improve far more.**

**Why? Not because I assumed it. Spaces go to whoever arrives first, and when
spaces are scarce, "first" is decided by walking speed. Scarcity gets rationed
by how fast you can walk. Nobody programmed that — it falls out of the
admission rule.**

**Now the second chart** — horizontal is minutes since departure, vertical is
the cumulative percentage of each group already inside. **Eighty percent of
scenario B's final gap already exists one hour after departure. It is a race,
and it is over almost before it starts.**

**Two things confirm this is a mechanism and not an assumption.** COPD — the one
diagnosis in this model with a published gait effect — shows an access penalty.
**Asthma, which has no such evidence and therefore no mechanism, tracks the
population average. A diagnosis never affects anything here except through a
mechanism I can cite.**

> **"That last row — 'counted as more vulnerable', 71% — counted by whom? Isn't
> that the weighting you said you deleted?"** No, and the distinction matters.
> **That is a reporting group, not a weight**: everyone 55 or older, or
> mobility-limited, or with asthma, COPD or a chronic physical condition — a
> union of measured attributes. **Nobody's numbers are multiplied by anything.**

---

### SLIDE 14 — Scenario D · *1:00*

[CLICK] **Hold ten percent of each shelter's spaces — 667 across the system —
for mobility-limited arrivals. Same buildings, same spaces, one rule at the
door.**

**The gap goes from 23.7 points to zero. Slightly negative, in fact — the group
ends marginally ahead. And total admissions are identical to B: 91.6 percent
either way.** No building, no bed, no relocation.

**Why it works:** the gap is produced by a race, so a rule that takes some
spaces out of the race closes it. **Where it matters:** the sweep on the last
slide showed the gap only exists while capacity is near demand — **and
capacity-near-demand is exactly the margin a county operates on.**

**The implementation detail that makes this credible:** the reserve is a single
parameter, and **at zero it reproduces scenario B bit-for-bit.** That is the
regression test proving the rule is the only difference between them.

---

### SLIDE 15 — Verification · *1:30*

[CLICK] **I can't prove a model right. I can make it checkable — and every row
of this table is a check built so that it could fail loudly.**

- **The registry gate.** Every number is listed with an evidence class. **If a
  measured or literature value has no DOI or dataset identifier, or a
  literature value has no stated range, the model refuses to start and names
  the offending row.** My favourite thing in this project: **the validator
  worked on its author — the very first run refused to start because I had
  mislabelled one of my own rows. I fixed the data, not the rule.**
- **Fingerprints.** Thirteen input files hashed into every run's record, so a
  reader can prove they have the same data I did.
- **Independent recomputation.** A separate program integrates the raw EPA file
  and **matches the model to a ratio of 1.0000.**
- **A check anyone can do by hand.** 194 of 312 hours were unhealthy, so anyone
  who never gets indoors must show exactly 194.0 hours. **All 5,632 such rows
  across the three seed-42 runs do. Zero exceptions.**
- **The negative control.** Asthma has no movement mechanism, so it must show no
  access effect — **and in every scenario, it doesn't.**
- **Cross-run invariants**: population identity, bed sums, and the unreachable
  set; the suite exits clean.
- **A provenance flag that tells on me.** An audit found nine archived runs
  stamped with a code snapshot that could not have produced them. **Two options:
  quietly fix them, or build the detector and let it speak. I built the
  detector, re-ran all nine from committed code, and left the flag permanently
  in the output.**

(look up) **And there is one more check I can run standing here. The whole model
now runs in a browser, so I can recompute one of those certified runs in front
of you and put the two numbers side by side. That is the next three minutes.**

> **"You found nine bad runs in your own archive. Why trust the rest?"**
> **Because I found them myself, with a check designed to embarrass me, and then
> re-ran every one.** That is the argument for the system, not against it. **An
> archive with no detection mechanism isn't clean — it's unexamined.**
>
> **"Your registry only gates measured and literature values. So an 'assumed'
> value needs no source?"** That is exactly right, and it is the correct
> reading. **The claim is narrower than the slogan: a number may not pretend to
> have a source it doesn't have.** Assumed values are allowed, enumerated, and
> the ones that could change a conclusion are flagged in every run's output.
>
> **"Couldn't someone type a fake identifier to get past it?"** Yes. **It
> verifies that a claim was made, not that it's true — a tripwire against
> carelessness, not fraud.** The truth check is human and published: the full
> registry ships with the model, and where a value was verified through a
> secondary source rather than the original paper, the code says so at that
> spot.

---

### THE LIVE DEMO: between slides 15 and 16 · *3:00*

*Not a deck slide. The deck still has twenty slides and they are still numbered
the way they always were; you leave it here, drive the browser, and come back to
slide 16. **Bold** is what to say. Square brackets are what to do. **Read the
FALLBACK at the bottom of this block before you read anything above it.** It is
the part that decides whether these three minutes are an asset or a liability.*

#### BEFORE YOU WALK ON

1. **Open the browser build in one tab and leave it there.** A local copy beats
   the venue's Wi-Fi every time: from `websim/`, `npm run build -w app`, then
   `npm run preview -w app`. Write the URL you actually rehearsed on here:
   `______________________`
2. **Press Play once during setup and let it finish.** That warms the assets and
   answers the device dialog for the rest of the browser session, so the dialog
   cannot surprise you on stage. Reloading the tab does not undo it.
3. **Reload, then click Arm C**, so the screen you switch to is already the
   screen you want.
4. **Time one complete Arm C run on the actual machine and write it here:
   `______` seconds.** Everything below is paced off that number. Do not guess
   it. The header of this script promises timings that were measured rather than
   guessed, and this is no different: expect somewhere between about fifteen
   seconds and a minute depending on the laptop, and know which.
5. **Open the four fallback images in a second window**, in this order:
   `websim-03-arm-c-archive-validated.png`,
   `websim-04-arm-c-hour20-evacuation.png`,
   `websim-02-arm-a-run-complete.png`,
   `websim-01-arm-a-live-vs-archived.png`.
   All four are in `docs/final/presentation/screenshots/`. If your venue lets
   you, also drop them into the back of the deck as four extra pages, so the
   fallback is one arrow key away rather than one window switch away.
6. **Close every other tab and turn off notifications.**

#### THE SWITCH · *0:10*

[Leave the deck. Bring up the browser tab.]

**Everything I have shown you so far was computed in Java on a laptop and
stored. This is the same model, ported to run inside a browser tab, and this is
the copy on this machine right now.**

#### 1. SELECT ARM C, AND WATCH THE ARCHIVE ARRIVE · *0:30*

[CLICK] Left rail, under **SCENARIOS**: **"Arm C — expanded capacity plus new
sites (46 sites, 6,842 beds)"**.

[Two things happen at the same instant. Point at both of them.]

**Top right, the badge turns green and says ARCHIVE-VALIDATED. That means this
exact configuration is the one that reproduces a stored, certified run. Hold on
to that, because I am going to break it deliberately in a moment.**

**And the right-hand column has already filled in, with no computation at all.
Sheltered, 6,570. Refused because every shelter was full, 244. Unreachable, 28.
Person-hours above 55.5 micrograms, 59,200.15. Out of 6,842 residents.** (pause)
**The browser did not just work those out. They are the archived result of the
certified Java run, and the interface labels that block "Certified Java run" so
it cannot be mistaken for anything else.**

#### 2. PRESS PLAY · *0:40 of talking, over `______` seconds of compute*

[CLICK] **Play**, bottom bar.

[If the device dialog appears (it will, unless you cleared it in setup), it is
headed *"Run this simulation on your device?"* and offers three buttons. Take
**"Start live run (6,842 residents)"**. Say this while you do it, because it is
worth saying.]

**It asks first. This is real computation on this machine, so the interface says
so before it spends your battery, and it always offers to show you the archived
numbers instead.**

[Now narrate the map, in this order. Do not rush it; this is the part the
audience will remember.]

**Every blue dot is one person, at a real reported campsite location.** (The
teal squares underneath are a density grid rather than individual points:
campsite locations are aggregated before anything is published.) **Nobody is
moving. The smoke has not crossed the line yet, and the rule from slide 6 is
that people leave when it does.**

[Watch the smoke chart on the right. The dashed line across it is 55.5.]

**There. The concentration has just crossed 55.5, and the orange is people
walking. Those are real street paths: the shortest route the network allows, on
the map I spent two slides repairing.**

**Now watch the chart above it. The blue band is people still outside; the green
band is people inside. What you are watching is blue collapsing into green, and
the thin orange band between them is the walk itself.**

**And notice that nobody vanishes on arrival. People become part of the green
fill of the shelter they entered. That is deliberate: deleting everyone who
arrived is exactly the defect I took out of the inherited code, and it is why
every fairness number in this talk is computed over all 6,842 people instead of
over the ones who made it.**

#### WHAT TO SAY WHILE IT COMPUTES

*This is the dead air, and it is the most valuable thirty seconds in the talk
because everyone is watching the screen instead of you. Take these in order and
stop the moment the run finishes. Any one of them is worth more than filler.*

**One. This is not a video and it is not a re-skin. It is the same model: the
same street graph, the same population sampler, the same random number streams.
The port was checked against the original by drawing a hundred million random
numbers on both engines and comparing them bit for bit.**

**Two. Nothing here is being sent anywhere. There is no server. The whole
simulation is running in this tab, on this machine, which is exactly why it
asked permission before it started.**

**Three. This is what reproducibility looks like when it stops being a paragraph
in a methods section. Every number I have claimed today is one you can watch
being produced.**

[If it is still going, take the fourth.]

**Four. And it was worth doing for a reason that has nothing to do with the
demo: a model nobody can run is a model nobody can check. This one now opens in
a browser, from a link, with no install.**

#### 3. THE TWO COLUMNS · *0:30*

[The run finishes. The ticker reads "run complete". The live numbers appear
**beside** the archived ones, under **"Live browser simulation"**, and the
archived block above is untouched.]

(slow down) **The new numbers did not replace the old ones. They sat down next
to them. Sheltered, refused, unreachable: the same three numbers the certified
Java run produced, recomputed in this room while I was talking.**

**That is the whole validation story in one screen. Same model, two engines, two
languages, two machines, and one answer. And the interface will never let me show you one of those
columns pretending to be the other.**

> **The one honest caveat, and volunteer it if anyone is reading closely:** the
> live column does not carry the person-hours figure. **The browser does not
> accumulate that during a run; you get it out of the export, from the engine's
> own writers.** So the certified 59,200.15 has no live twin on screen, and I am
> not going to let it look as if it does. **The three counts are the comparison.
> If someone asks, the Export run button next to that panel produces the full
> row-per-person file and the manifest that goes with it.**

> **If the live numbers do NOT match:** say so, immediately, out loud, before
> anyone else does. **"That is not what the archive says, and that matters more
> than the demo does. I will find out why and I will publish what I find."**
> Then move to slide 16. A presenter who catches their own mismatch in public
> has just demonstrated the entire argument of slide 15. A presenter who talks
> over it has thrown that argument away.

#### 4. BREAK IT ON PURPOSE · *0:25*

[CLICK] Left rail, slider drawer, any slider. **Smoke scale multiplier** is the
most legible; **Resident count** works too.

**Watch the badge.** (pause) **Green to amber, instantly, and it now says
EXPLORATORY and names what I changed.**

**I have not run anything. I moved one slider, and the interface immediately
stopped certifying the configuration. That is the point of building it this way:
it is not possible to stand here and present a modified setup as though it were
a certified result, because the moment I touch it, the screen says so, in front
of you.**

**That is a governance rule made physical. It is the same discipline as the
registry gate on the last slide, except this one is enforced by the interface
rather than by my good intentions.**

#### 5. THE PROVENANCE TAB · *0:30, only if you are ahead of the clock*

[CLICK] **Provenance**, top bar.

**Three things live here.** [Scroll past each.] **The governance registry, every
variable with its evidence class and its identifier, which is the gate from the
last slide. The asset manifest, every input file with its SHA-256 fingerprint,
re-checked in the browser at load, so a stale file fails loudly instead of
quietly. And "configured versus executed", which compares what I asked for
against what the engine actually ran, because a run that silently substituted a
parameter is worse than a run that crashed.**

> **[Presenter note. Know this before you open that tab.]** It also shows the
> **street graph corruption-correction census**, and the census on screen reads
> **25 corrected identifiers: 3 reattached and 22 split**. **Slide 5 of the deck
> says 27, four and twenty-three.** The archive agrees with the screen, not with
> the slide. If you open this tab, either say the screen's numbers, or do not
> open this tab. **If anyone catches the difference: "The screen is right and
> the slide is stale. The corrected census is 25, three reattached and 22 split.
> The conclusion is unchanged: impossible connections after the fix, zero."**
> Better still, get the slide corrected before you present, and delete this note.

#### THE RETURN · *0:05*

[Back to the deck, slide 16. Do not narrate the switch.]

---

### THE FALLBACK, if the demo fails · *2:00*

*Assume it will. Machines fail on stage; that is what stages are for. This
fallback delivers the same four points from four still images, and it is quick
enough that you can also just choose it, deliberately, if you are behind the
clock.*

**The rule that makes it invisible: you never narrate the failure.** Do not say
"it seems to be stuck", do not say "this worked earlier", do not apologise, do
not touch the machine twice. **Give it five seconds. Then switch to the images
and say "These are captures from the browser build."** That sentence is true,
it is calm, and it reads as material you always intended to show. An audience
takes its cue entirely from you; a presenter who does not treat something as a
disaster has not had one.

**FALLBACK 1. Switch, and reset the frame.** [Bring up
`websim-03-arm-c-archive-validated.png`.]

**These are captures from the browser build. This is Arm C selected, and this is
the moment I wanted you to see: the badge, top right, is green, and it says
ARCHIVE-VALIDATED.**

**FALLBACK 2. The archive arrives with no compute.** [Point at the right-hand
column of the same image.]

**That column filled in instantly, with no computation at all. Sheltered 6,570,
refused 244, unreachable 28, person-hours above 55.5 micrograms 59,200.15, out
of 6,842 residents. It is labelled "Certified Java run", because that is what it
is: the archived result, not something the browser worked out.**

**And down here the clock says hour four and nobody is sheltered yet. Every one
of those blue dots is a person at a real reported campsite location, and not one
of them has moved. The smoke has not crossed the line.**

**FALLBACK 3. The evacuation. This is the one image to show if you only show
one.** [Bring up `websim-04-arm-c-hour20-evacuation.png`.]

**Sixteen hours later. The concentration has reached 61.4 micrograms, just past
the 55.5 trigger, and this is what the rule produces.** [Point at the orange.]
**Those lines are people walking, and they are lines because they are on real
streets: shortest paths through the network I spent two slides repairing.**

**5,999 people are already inside and nobody has been refused yet, because at
hour twenty the doors are still open. Look at the chart on the right: the blue
band is people outside, the green band is people inside, and the thin orange
band between them is the walk. Blue collapsing into green is the whole event.**

**And nobody disappears when they arrive. Sheltered residents render as the
green fill of the shelter they entered, because deleting everyone who got
indoors is exactly the defect I removed from the inherited code.**

**FALLBACK 4. A finished run, and the badge doing its job.** [Bring up
`websim-02-arm-a-run-complete.png`.] **Read the presenter note below this line
before you use this image.**

**Here is a completed run: hour 312, the end of the window, PM2.5 back down to
12.7 so the smoke haze over the map is gone, and the smoke chart showing the
whole two-week curve with both of its peaks. The live numbers sit beside the
archived ones and never replace them.**

(slow down) **And this capture happens to show you the fourth thing I wanted to
demonstrate. Look at the badge: it is amber, and it says EXPLORATORY, because I
had changed one setting. So the archived block still shows the certified Arm A
result and the live block shows what I actually ran, and they do not match, and
they should not match. That is the interface refusing to let me present a
modified configuration as a certified one. It is a governance rule made
physical, and it is the reason you can trust the green badge on the previous
image.**

> **[Presenter note. This matters more than anything else in the fallback.]**
> **`websim-02` and `websim-01` are NOT clean Arm A runs.** The scenario code was
> modified, which is why the badge is amber and the chip reads "Modified from
> preset: scenarioCode". The archived block shows certified **Arm A** (2,060
> sheltered, 4,754 refused, 28 unreachable); the live block shows **6,264 / 550
> / 28**, which is arm B's geometry. **Do not point at either image and say "the
> two columns agree."** They do not, they are not supposed to, and a
> methodologist in the second row will read the chip. **Use these two images for
> the badge story only. The agreement story belongs to `websim-03`, whose badge
> is green.**

**FALLBACK 5. Optional colour, only if you have the time.** [Bring up
`websim-01-arm-a-live-vs-archived.png`.]

**Mid-run, hour 96, day five of fourteen. The whole map has gone that olive
colour because the concentration is 286.5 micrograms: the interface tints the
map with the smoke, so you can see the hazard sitting on top of the geography
rather than only reading it off a chart.**

**FALLBACK 6. Land it and leave.**

**Everything I just showed you is in a browser tab, on a laptop, from a link. I
could not do that when I wrote the rest of this talk, and it is the difference
between a model you have to take my word for and a model you can check.**

[Straight to slide 16. No apology, no explanation, no return to the machine.]

> **"Can I try it?"** Yes. It is a static page, it runs entirely in your
> browser, there is no server and nothing is uploaded. **Copy permalink** encodes
> the whole configuration into the link, so anything I show you, you can
> reproduce exactly.
>
> **"How do you know the browser version is the same model and not an
> approximation?"** Because that was the hard part, and it was tested rather
> than asserted. **The random number generators were compared against the Java
> originals over a hundred million draws, bit for bit.** The engine's own
> arithmetic was checked across four different JavaScript engines (Chrome,
> Firefox, Safari and Node) and is byte-identical on all four. **And the badge
> you saw is the standing claim: an unmodified preset is only allowed to show
> green because its output was checked against the archived certified run.**
>
> **"So which one is the real result, the Java run or the browser run?"** The
> archived Java run is the citable result, and it stays the citable result. **The
> browser is the check on it, not a replacement for it.** That is precisely why
> the interface keeps the two in separate blocks with separate labels rather
> than averaging them or overwriting one with the other.
>
> **"Does it run on a phone?"** It displays archived results on anything. A live
> run asks your device first and tells you what it measured before you commit
> to it, **and the archived path is never gated, because reading a certified
> result should not depend on owning a fast laptop.**

---

### SLIDE 16 — Predictions, including the misses · *1:00*

[CLICK] **Thirteen predictions were written down with a timestamp before the
sweep and the re-runs. Eleven held. Two did not — and I want to spend fifteen
seconds on them, because a registered prediction is only worth something if the
misses are published beside the hits.**

**I predicted surplus wouldn't match C's admissions until 1.4 to 1.6 times
demand. It matched at 1.05. And I predicted the fairness gap would survive
surplus. It vanishes at 1.10.** (pause) **Wrong twice — and both misses made
the answer simpler and cheaper. That is what a prediction register is for.**

One more, in the interest of precision: **I also predicted travel distances
would move by no more than two percent after the freeway fix. Eight of
fifty-four runs moved slightly more, up to 3.2 percent, concentrated in
scenario C.** Not a headline change, but it was registered, so it gets reported.

---

### SLIDE 17 — The data, and the algorithm on top of it · *1:15*

[CLICK] **When a simulation ends, the model writes one row per person — all
6,842 — with their inputs and their outcomes joined on the same line.** Age,
sex, mobility, asthma, COPD, chronic condition, walking speed and start
coordinates on one side; **on the other, whether they got in, which shelter,
how many minutes it took, how many full doors turned them away first, metres
walked, hours in unhealthy air, micrograms inhaled.**

**Then I fit a model to that output — and the model choice has a reason.** The
outcome "did this person get inside" is binary, so **logistic regression**,
which is the standard family for evacuation outcomes in the literature and
whose coefficients read as odds ratios anybody can interpret. **Plus ordinary
least squares for minutes-to-shelter among those who got in**, because that
outcome is continuous.

**What it is for is verification, not discovery.** It should re-find the
mechanisms I built and nothing else — **and it does. Distance to the nearest
site and walking speed dominate. COPD appears through its speed effect. Asthma
is statistically null in every scenario, which is the negative control
passing.** In scenario D, conditional on speed, it re-finds the reserve rule I
wrote — **a pipeline sanity check, not a discovery, and I don't quote its size
because whole speed bands sit at a hundred percent admission.**

**And it makes a behavioural trend visible that the headline hides:** **people
refused at least once average about three door attempts. Under today's
scarcity only 6.6 percent of them ever get in. Once capacity or doors are
added, 79 to 91 percent do.**

---

### SLIDE 18 — Sources · *0:45*

[CLICK] **Every number in this talk resolves to one of these, and the deck
prints the identifier rather than the name alone.** Smoke from EPA's Air
Quality System — **and a provenance note: the standard hourly file contains no
Multnomah monitors for 2020, because the Portland instruments report under a
different parameter code. I downloaded both, inspected both, and discarded the
misleading one rather than commit it under a convenient name.** Population from
the 2025 Point-in-Time Count. Age and chronic condition from Pathways 2026.
Asthma and COPD from Zellmer 2025. Walking speeds from Bohannon, Boyce and
Buekers. Breathing rates from the EPA Exposure Factors Handbook. Methods from
Karney, Dijkstra, and North.

**And the bottom row is the one I'd point at first: three papers I checked and
deliberately did not use** — an ozone study that cannot support a PM2.5
parameter, a cardiovascular study with no COPD estimate, and a paper that
reports no asthma modifier. **A source list that only shows what you kept is
half a source list.**

---

### SLIDE 19 — What the model does not do · *1:15*

[CLICK] **Every model has a boundary. Mine has four, and I can put a number on
the biggest one.**

**It predicts no health outcome.** Not one illness, hospital visit or death. It
measures particulate entering an airway. **If you take one thing from this
slide: this study says nothing about mortality.**

**It assumes full information** — everyone knows every shelter and its current
occupancy. **And that assumption has a measured size. Against the one real
occupancy record from 2020 the model over-admits by a bracket of 1.5 to 15.6
times** — a bracket rather than a point because the record itself is
approximate. A local survey found 65% of unsheltered residents had never heard
of these shelters. **That bracket is my measured size of everything human the
model doesn't yet contain — awareness, belongings, pets, trust — and closing it
is the next phase, already specified.**

**It uses one smoke value county-wide**, because two regulatory monitors cannot
support a spatial surface. **The consequence is actually useful: no scenario can
help by moving people into cleaner air, because there is no cleaner air
anywhere. Every effect I've reported is a travel-time effect.**

**And its dose figures depend on the measuring window** — over 312 hours the
B-to-C dose ratio is 1.98; over the first 24 hours it is 1.29. **I report both,
because one figure alone would hide the dependence.**

(look up) **The line to land this on: every one of these pushes the same
direction — toward making shelter access look easier than it is. Where I am
wrong, I am wrong optimistically. The real number left outside is probably
higher than what I showed you.**

---

### SLIDE 20 — The answer · *0:30*

[CLICK] (slow down) **More beds, if you can afford them. A fairer door, if you
can't. Better-placed beds was the one answer the evidence refused** — ten
randomly chosen sites admit exactly as many people as ten optimally chosen
ones. What choosing well buys is a shorter walk, and only if people know where
to walk.

**Next I'm building the human layer — awareness, belongings, pets, imperfect
information — to close the gap that calibration bracket measures.** **Thank
you.**

---

## THE BACKSTORY: WHAT CHANGED, AND WHY
*Not a slide. Your answer bank for "what did you actually do?" — the question
you are most likely to get.*

**What I inherited was a working demo, not a research model.** Repast Simphony
running its own sample project about Chicago water zones and radio towers,
adapted to Portland: sixteen files, 1,498 lines, **no version control at all**,
so there was no record of anything. Eight of those files were leftovers that
did nothing. **My first commit was the first time this project had ever been
saved.**

In order of how much each mattered:

1. **The street map was corrupt** — 27 bad intersection IDs, fifty impossible
   connections, travel distances roughly fifteen times too high for nearly half
   the population. Fixed by clustering on location. **Longest journey in the
   verification run fell from 875 minutes to 212.**
2. **Freeways were walkable** — 2,636 features, 614 km, including two bridges
   with no pedestrian access. Excluded by road class; all runs regenerated;
   **headline numbers unchanged to the digit.**
3. **The population was 3.4 times too small** — the study used 2,037, a 2019
   figure. The current count is 6,842. That moves the ratio of spaces to people
   from 0.89 to 0.33. **I deliberately did not re-run partway: a half-applied
   population change is worse than none, so it was documented and executed in
   one pass.**
4. **Everybody used to evacuate at hour zero**, before the smoke, so absolute
   exposure was meaningless — a thirteenfold correction once departure was tied
   to the measured concentration.
5. **There was no routing at all.** The original code hopped to whichever street
   segment looked closest, which produced loops. **In a hundred-person test run,
   only thirty arrived; the rest wandered.** With a real graph and shortest
   paths, 99 of 100 arrive and the one failure is correctly reported as
   unreachable. **It also fixed a real crash** — the old code compared every
   person against all 112,070 streets every minute, allocating fresh candidates
   each time, until memory ran out. The crash log is still in the repository.
6. **The experiment was designed so it could not detect its own answer.** An
   earlier version compared real against optimised placement while both were
   capacity-limited, so both admitted the same number and it found no
   difference. **The reason it found no difference was that the design made a
   difference impossible to see.** Equalising capacity moved the signal into
   quantities where it could be measured.
7. **Refused people were teleported home before re-planning** — up to ten
   kilometres of phantom walking each. **Without that fix, phantom distance
   would have read as a capacity finding.**
8. **Movement arithmetic was done in degrees**, so at Portland's latitude people
   walked at different speeds depending on direction. Rewritten to measure real
   distance on the globe.
9. **People were deleted from the simulation when they arrived — and when they
   failed.** The population you could measure at the end consisted only of the
   people who made it. **That is survivorship bias in every equity statistic the
   project would ever produce.** Everyone now persists with an explicit final
   state.
10. **Being refused was a dead end** — someone turned away when only one shelter
    was open never tried the second when it opened the next day, so real spaces
    sat unused. Refusal became a waiting state, reconsidered each minute.
11. **COPD had no effect on anything**, despite the evidence existing. Once
    Buekers 2024 was found and verified, it does — and asthma still doesn't,
    because that evidence does not exist. **Reported as an evidence gap, not a
    preference.**
12. **Nine archived runs claimed a code snapshot that could not have produced
    them.** Found by my own audit, fixed, then mechanised so it cannot recur
    silently. **The protocol is now: commit first, run second, verify the record
    third.**
13. **And the citations** — the change that determined what this project is
    allowed to claim.

**How much is mine, in one sentence:** the dead-demo removal took out about
1,000 lines of Java — roughly 3,000 counting the demo's display configuration
and log clutter — and then six entirely new components went in: **the
population sampler, the street routing graph, the smoke field, the data loader,
the results exporter, and the governance registry.** Say the Java figure first,
or a 1,500-line inheritance and a 3,000-line removal sound contradictory.

**And one more, after the numbers were frozen, which changes nothing and proves
everything.** The whole model was ported to run in a browser: the same street
graph, the same population sampler, the same random streams, reproducing the
archived Java runs. **The port is not a new result. It is the old results, made
recomputable by anyone with a laptop, including in this room**, which is what
the demo block between slides 15 and 16 does. **If you are asked what you would
have done with another month, this is the honest answer to point at: I spent it
on making the work checkable rather than on making it bigger.**

---

## A NOTE ON TOOLING

The chapter carries a standard disclosure that AI tools assisted with coding and
verification, with the researcher directing the work and taking responsibility
for it.

**The plain answer if it comes up:** AI assisted with implementation and
cross-checking. **Every scientific decision — what to model, what to exclude,
which citations to accept, which numbers to block — was mine, and every
load-bearing citation was verified independently against the primary source.**

**That verification is what caught four citation errors.** The clearest to name
out loud: the brief's 1.45 age multiplier. I went to the source, found it could
not produce that number, and then found Kondo 2019 — eight pooled studies on
exactly that question reporting 1.008, statistically indistinguishable from no
effect. **That is the work. A tool can draft a paragraph; it cannot decide to go
and check.**

---

## Q&A PREPARATION

**1. "Where does 6,842 come from, and are they really all outside at once?"**
The 2025 Tri-County Point-in-Time Count: 10,526 people experiencing
homelessness, more than 65% unsheltered. Treating them all as outdoors
simultaneously is a disclosed worst-case construct, not a claim about one
night.
→ *"That count was administratively augmented."* Its own authors say so, and I
repeat that wherever the number appears. It is the best local figure that
exists.
→ *"What if only half are out?"* Scarcity in A binds so hard that the ordering
survives; absolute counts scale. A presence-fraction sweep is registered future
work and has not been run — that is an honest gap.

**2. "Why does everyone leave at the same moment, and on the early spike?"**
Departure triggers when the measured concentration crosses 55.5 while a shelter
is open; on this event that is hour sixteen.
→ *"Why 55.5?"* EPA's published breakpoint — a public standard rather than a
number I chose, and labelled in the registry as a reporting boundary used as a
behavioural trigger.
→ *"So the race runs before the main smoke?"* Yes, and that is exactly why I
show the two-spell structure instead of letting "194 hours" imply one
continuous emergency.
→ *"What would realistic timing do?"* The next phase replaces the bright line
with per-person thresholds, with predictions registered before any run.

**3. "Why walking only? The county offered rides and a hotline in 2020."**
It did — and my model is walk-only, which I say on slide 19.
→ *"How big is that omission?"* It is the main content of the 1.5-to-15.6-times
calibration bracket. I quantify it rather than assert it is small.
→ *"Will rides be modelled?"* Yes — a 211-style channel with uptake as a
parameter is in the next-phase specification, gated on sources.

**4. "Why these ten sites — does the chooser matter?"**
An algorithm picked them; then I re-picked them at random from the same
candidate pool, three times, and admissions were identical.
→ *"So the optimiser does nothing?"* For headcount, nothing. For walking, 63%
shorter journeys.
→ *"Is C pointless then?"* No — C's finding is that more doors beat bigger
buildings. What is refuted is crediting the door-*chooser* for the headcount.
→ *"Could the county build them?"* They are street-network points, not vetted
buildings — no zoning, staffing or filtration check. Stated limitation.

**5. "Isn't 578 = 550 + 28 circular?"**
Yes, and I say so on the slide: capacity equals population by construction, so
empty spaces and people outside are the same number counted twice.
→ *"Then what's informative?"* Who is outside — the slowest walkers — and that
anyone was refused at all when supply exactly matched demand.
→ *"Why design it that way?"* To remove scarcity as an explanation, so whatever
failure survives can only be geography.

**6. "Nine random starting points — is that enough?"**
Across nine, admissions move by at most eleven people, while the smallest gap
between scenarios is 306. I report those side by side rather than as a ratio,
because seed spread measures only random-draw variability.
→ *"What don't seeds cover?"* Structural and parameter uncertainty — that is
what the capacity sweep, the random-site control and the window arms are for.
→ *"Could more seeds change a conclusion?"* Only if a gap of hundreds hid inside
a spread of eleven. More seeds buy precision, not direction.

**7. "Who are the 28 who reach nothing?"**
People whose campsites sit on street fragments with no legal walking path to
any shelter.
→ *"Same people in every scenario?"* Verified — identical individuals across
scenarios within each starting point, as an automated invariant.
→ *"What would the county do for them?"* Not siting — outreach or transport. The
model marks them as a floor no bed arrangement reaches.

**8. "How do you know the simulation isn't just wrong?"**
I can't prove it right; I made it checkable — manifests, invariants,
independent recomputation, and controls designed to embarrass me.
→ *"Has that ever caught anything real?"* Twice: the corrupt map and the
freeway defect. Both were fixed, everything was re-run, and the headlines
survived.
→ *"What else is wrong that you haven't found?"* I genuinely don't know, and
anyone who says otherwise is guessing. What I can tell you is the method that
found these, and that the infrastructure exists because I assume there are more.

**9. "What did you get wrong?"**
Two registered predictions — the surplus crossing and the persistence of the
fairness gap — plus a partial miss on travel distances.
→ *"Anything retracted?"* Yes. I briefly described a regression coefficient as
the algorithm *discovering* the reserve rule. **The honest statement is that it
re-found the rule I wrote — a sanity check — and its magnitude isn't quotable
because of cells at a hundred percent.**
→ *"Why advertise mistakes?"* Because registered predictions mean nothing if
only the hits are published — and both misses made the policy answer cheaper.

**10. "What about pets, belongings, children?"**
Not modelled yet — and the 2020 record says they mattered: the county's own
spokesperson attributed low uptake partly to belongings people would not
abandon.
→ *"Children?"* The model is adults-only, which happens to match the 2020
emergency sites' intake but not the general shelter system. Stated scope limit.
→ *"Will they be modelled?"* Yes — possessions, pets and dependents as sourced
attributes feeding a barrier cost, every prevalence gated on a verified source
before any code is written.

**11. "If you were the county with a million dollars, what happens tomorrow?"**
First the free thing: a ten percent reserve at intake, which closes the fairness
gap at zero capital cost. Then buy slack toward ten percent surplus, where the
whole failure mode dissolves.
→ *"Not new sites?"* Not for headcount — 342 spaces buys the same gain. Site for
shorter walks if there is an information system to route people.
→ *"What can't the model tell them?"* Real uptake. The 1.5-to-15.6-times bracket
is the honest size of that unknown.

**12. "Your dose numbers look huge — are they real micrograms?"**
Modelled inhaled mass: measured concentration × published breathing rates ×
time outdoors, and they depend on the measuring window, which is why both the
24-hour and full-event ratios are reported.
→ *"Why does the window matter?"* Short windows are dominated by the walking
difference; long windows by who is still outside.
→ *"Is the smoke field realistic?"* It is uniform county-wide — two monitors
cannot support a surface — which is why every effect here is a travel-time
effect.
→ *"Do the monitors under-read?"* Some monitor types are documented to
under-read fresh wood smoke, so reality was likely no better than the chart
shows. The direction favours caution.

**13. "2020 smoke with a 2025 population — isn't that mixing eras?"**
Deliberately: the question is present-tense policy. Every vintage is disclosed
in one table.
→ *"Weakest link?"* Sex and mobility distributions are 2019 — no newer local
source exists — and asthma/COPD are imported from a Minnesota cohort.
→ *"Campsites?"* 2025–26 complaint reports as a spatial stand-in, biased toward
visible camps. That bias makes access look easier, not harder.

**14. "What's in the shelter capacity number — beds, rooms, pods?"**
The county list mixes five unit types; each was converted to people with a
documented rule, totalling 2,234.
→ *"Missing anything?"* Two real sites with no published address and ten day
centres with no published capacity — excluded rather than guessed, so scenario
A slightly understates today.
→ *"Why not estimate the day centres?"* Ten invented numbers would be
fabrications — the same standard that kept me from inventing an asthma speed
effect.

**15. "'Capacity is not access'? Your own scenario B shows capacity buying 61
points."**
It does — capacity buys the first sixty-one points, and slide 10 says so in the
same breath. **What capacity alone cannot buy is the last stretch: at
capacity-equals-demand, 578 spaces sit empty while 578 people stand outside, and
the ones outside are the slowest walkers.**
→ *"So the title overclaims?"* The title is a question and its answer: capacity
is necessary and, at the margin a county actually operates on, not sufficient.
→ *"Why not 'capacity is most of access'?"* Because the marginal decision is
exactly the regime where the equivalence breaks — the title names the
decision-relevant finding.

**16. "You ran that in a browser. Is that the model, or a demo of the model?"**
It is the model. The port carries the same street graph, the same population
sampler and the same random streams, and it reproduces the archived Java runs;
the archived run stays the citable result and the browser is the check on it.
→ *"How was that verified?"* The random generators were compared against the
Java originals over a hundred million draws, bit for bit, and the engine's own
arithmetic is byte-identical across four JavaScript engines. The green badge is
the standing claim: an unmodified preset shows green only because its output was
checked against the certified archive.
→ *"What is not identical?"* Anything the port delegates rather than computes
itself. The geodesic library and the host's own transcendental functions differ
between browsers, which is why those were vendored onto the port's own
arithmetic rather than trusted. That is a measurement, not a hope.
→ *"Why bother?"* Because a model nobody can run is a model nobody can check.
This one opens from a link, with no install, and the permalink encodes the exact
configuration.

---

## THE LAST THING TO SAY

If you get one closing line, make it this one:

> **"The honest summary is that this model says people are left outside, and
> every assumption I made was one that would tend to make that look better than
> it is. If I'm wrong, I'm wrong in the optimistic direction."**
