# Presenter's Script — Capacity Is Not Access
### More beds, or better beds? · symposium talk · core 10:00

*Deck: `docs/final/presentation/capacity-is-not-access-symposium.html` (arrow
keys to advance). Every number below is traceable: `docs/PRESENTATION_PROVENANCE.md`.
Bold = say as written. Cues in brackets. Core script runs S1–S10; two OPTIONAL
extensions and one marked EMERGENCY CUT control the length live.*

**Pronunciation.** Mult-NO-mah · "P-M two point five" · "micrograms per cubic
meter" for µg/m³ · REE-past SIM-fon-ee (Repast Simphony) · BOO-kers (Buekers) ·
bo-HAN-non (Bohannon).

**Definitions to deliver on first use (once, then use freely):** an
*agent-based model* simulates thousands of individuals one at a time instead of
averaging them; *PM2.5* is soot fine enough to lodge deep in the lung, measured
in micrograms per cubic meter; a *seed* is the number that fixes a run's random
draws, so the same seed always reproduces the same run; a *simulation run* is
one complete thirteen-day event.

---

## CORE SCRIPT — 10:00

### S1 · 0:00–0:30 · Title
**In September 2020, wildfire smoke sat on Portland for thirteen days. At the
worst hour the air carried 562.7 micrograms of fine soot per cubic meter —
roughly fifty times a clean-air day. If that smoke came back today, 6,842
people in Multnomah County would be outdoors in it. My question was simple:
should the county buy more shelter beds — or put the beds it has in better
places?** (pause) **I built ninety-three simulations to find out, and the
evidence refused the answer I expected.**

### S2 · 0:30–1:30 · The event and the people
[CLICK] **This red line is measurement, not modeling — EPA monitors, hourly.**
PM2.5 is fine particulate: soot small enough to pass the body's filters and
lodge deep in the lung. **The air spent 194 of 312 hours above 55.5 micrograms
per cubic meter — the EPA's "Unhealthy" line — and it came in two spells.**
[POINT AT the spike] **A six-hour spike on the first evening, hours sixteen
through twenty-one. Then fifty-seven consecutive clean hours. Then the main
episode from hour seventy-nine, for days.** That shape matters later.
**The people: the 2025 count found 10,526 people experiencing homelessness
here; more than sixty-five percent were unsheltered — that's the 6,842.** One
honest sentence about that number: it's an administrative count, and I treat
everyone as outdoors at once. That's a modeling choice, and I disclose it.

### S3 · 1:30–2:45 · How the model works
[CLICK] An agent-based model simulates each person separately, because this
question is about individuals competing for scarce spaces — averages can't
show a full doorway. **Each of the 6,842 starts at a real reported campsite,
drawn from 3,400 city campsite reports, and walks the real street network —
88,100 intersections, pedestrian-legal roads only.** Each person carries an
age, sex, and health from local counts and published studies, **and their own
walking speed — from published gait studies by age and sex; a slower published
distribution for people with mobility limitations; a measured decrement for
COPD. I chose those sources because they're the only ones I could cite; if
they're wrong, the fairness numbers move, and I report the ranges.** Everyone
departs when smoke crosses 55.5 — **that's an EPA reporting boundary used as a
behavioral trigger; an assumption, stated.** And the big one, up front: **in
this version, everyone knows every shelter and its live occupancy. I'll show
you exactly what that assumption costs at the end.**

### S4 · 2:45–3:45 · Four scenarios
[CLICK] **Four scenarios, each built to answer what the last one measured.
A is today: the real thirty-six facilities, 2,234 spaces — a measurement, not
a plan. B raises every site by the same factor, 3.06, until there's exactly
one space per person — it removes scarcity as an explanation. C spends B's
identical total differently: existing sites grow only one-and-a-half times,
and the remainder opens as ten new sites of about 349 spaces each — it tests
whether *where* capacity sits matters. And D is B with one rule changed:
ten percent of each site — 667 spaces — held for mobility-limited arrivals.
D costs nothing.**

### S5 · 3:45–4:45 · Headline access
[CLICK] **Today, 30.1 percent get inside — fewer than one in three. One space
per person takes it to 91.6. More doors takes it to 96.** Nine seeds each;
the widest spread anywhere is eleven people, so these aren't lucky draws.
Now the number that looks like a discovery and isn't: **because B's capacity
equals demand by construction, empty beds and people outside are the same
number counted twice — 578 empty spaces, and 578 people out: 550 refused at
full doors plus 28 who can't reach any shelter at all. The finding isn't the
number. It's who it is, and where the empty spaces are.**

### S6 · 4:45–6:00 · What C's edge really is
[CLICK] So C admits 306 more people than B. **Here's the result that killed
my own headline: I re-ran C with its ten new sites drawn at random from the
same candidate pool — three separate random draws — and every draw admitted
exactly the same number. The headcount gain is having more doors, not having
chosen the right ones.** What choosing well *does* buy is the walk: people
reach the optimized doors with 63 percent less walking than random doors —
**under the assumption that everyone knows every shelter and its live
occupancy.**
—— EMERGENCY CUT BEGINS (drop to S7 if behind) ——
And then I priced doors against beds. [POINT AT curve] **Just 342 extra
spaces at the existing sites — five percent surplus — matches C's entire
headcount advantage. At 684 — ten percent — every person who can physically
reach a shelter gets in.** (slow down) **So: C's siting advantage on headcount
is worth at most about 342 beds; the fairness gap closes at 10 percent
surplus — or for free with the triage reserve.** That's the county sentence.
—— EMERGENCY CUT ENDS ——

### S7 · 6:00–7:15 · The fairness finding
[CLICK] **Nobody in this model is ever denied a bed for being disabled. Beds
go to whoever arrives first. And that's exactly the problem: when spaces are
scarce, first-come-first-served is rationing by walking speed.** In A, people
with mobility limitations get in at 20.1 percent against 32.6 for everyone
else. **Add beds — scenario B — and the gap nearly doubles, from 12.5 to 23.7
points, because new capacity at the same sites is claimed by whoever walks
fastest.** [POINT AT lower chart] **And it's a race that's over almost before
it starts: 80 percent of B's final gap already exists one hour after
departure.** (look up) On every scale we measured, the people still outside
are increasingly the people who walk slowest. That is the finding a
capacity-only analysis can never see.

### S8 · 7:15–8:15 · Scenario D
[CLICK] **Scenario D holds ten percent of each shelter for mobility-limited
arrivals. Same buildings, same spaces, one intake rule. The gap goes from
23.7 points to zero — slightly negative, actually — at identical total
admissions: 91.6 percent either way.** And the sweep taught me where this
matters: **the gap only exists where capacity roughly equals demand. Give the
sites ten percent slack and it dissolves on its own. But capacity-equals-
demand is exactly where a county lives — and there, the fair door is free.**

### S9 · 8:15–9:30 · How I know it's right — and where it's wrong
[CLICK] Quickly, the checks. **Ninety-three runs, every input fingerprinted,
an automated invariant suite that must pass before anything is reported. A
negative control built to find nothing: asthma has no movement mechanism in
this model, so it must show no access effect — and in every scenario, it
doesn't.** The best evidence came from a bug: **I found 2,636 freeway
segments — 614 kilometers, including two bridges pedestrians can't use — in
my walking map. I removed them and re-ran everything. Every headline number
survived to the digit.** (pause) **I registered my predictions before running
the sweep, and two were wrong — here's what they taught me:** I predicted
surplus wouldn't reach C's access until forty percent, and that the fairness
gap would survive surplus. Five percent and ten percent, respectively. Wrong
twice — and the answer got simpler and cheaper. Finally, honesty about scale:
**against the real 2020 record the model over-predicts shelter use by between
1.5 and 15.6 times — that bracket is my measured size of everything human the
model doesn't yet include: awareness, belongings, pets, trust. Closing it is
the next phase, already specced.** Remaining limits in one breath: full
information; everyone departs on that early spike; dose depends on the
window — **over the first 24 hours the B-to-C dose ratio is 1.29, not the
full-window 1.98 — the gap grows with the window, so I report both;** and the
population construct you already know about.

### S10 · 9:30–10:00 · The answer
[CLICK] (slow down) **So — more beds, or better beds? More beds, if you can
afford them. A fairer door, if you can't. Better-placed beds was the one
answer the evidence refused.** Next I'm building the human layer — awareness,
belongings, pets, imperfect information — to close the gap that calibration
bracket measures. **Thank you.**

---

## OPTIONAL EXTENSION E1 (+1:00) — after S8, if ahead of schedule
**Whenever a fairness number moves, someone should ask: does that depend on
how you measured it? So I measured it four ways.** [CLICK to E1 table] On
percentage points, B widens the gap and D closes it. On the ratio of access
rates, every scenario narrows it — 1.62 down to about one. Counting people,
mobility-limited residents outside fall from 1,087 today to 373 in B to 190
in C. And as a share of everyone left outside, they *rise* — 23 percent
today, 65 in B, 70 in C — until D resets it. **Point scale and ratio scale
genuinely disagree; I report both. What survives every scale is that the
residue concentrates in the slowest walkers — until the admission rule
changes. A result that only exists on one scale isn't a result.**

## OPTIONAL EXTENSION E2 (+1:00) — after S9, if ahead of schedule
**One minute on how a student project earns trust. Five mechanisms.** A
parameter registry: no number enters the code without a sourced row first —
the model literally refuses to start otherwise. Run manifests: every run
records its commit, seed, parameters, and a checksum of every input file, so
anyone can prove they're looking at what I ran. A claim linter: every sentence
we've ever had to correct becomes a banned string, and the build fails if one
returns. The negative control you saw. And registered predictions: I write
down what I expect before running, and publish the misses next to the hits.
**None of this makes the model right. It makes the model checkable — which is
the only promise a model can honestly make.**

---

## Q&A WEBS
*Roots and nested follow-ups. ≤3 sentences each, then a pointer. B# = backup
slide; PROV = docs/PRESENTATION_PROVENANCE.md row.*

**1. Where does 6,842 come from — and are they really all outside at once?**
It's the 2025 Tri-County Point-in-Time count: 10,526 people experiencing
homelessness in Multnomah County, more than 65% unsheltered. [B8; PROV]
→ *Isn't that count administrative?* Yes — the 2025 methodology added
administrative records and its authors say the number was substantially
augmented; I say so wherever it appears. It is the best local number that
exists. [B8]
→ *All outdoors simultaneously?* That's a disclosed modeling construct — a
worst-case presence assumption, not a claim about any single night. [B8]
→ *What if only half are out?* Scarcity in A binds so hard that the ordering
survives; absolute counts scale down. A presence-fraction sweep is registered
future work, not yet run
→ *Why not just run it tonight?* Because a half-applied population change is worse than none — it needs its own registered predictions and a full re-run, and I won't rush that. [11-ROUND5-REPORT] — that's an honest gap. [11-ROUND5-REPORT]

**2. Why does everyone leave at the same moment — and on the early spike?**
Departure triggers when PM2.5 crosses 55.5 while a shelter is open; on this
event that's hour sixteen, in the first-evening spike. [PROV: first_cross_hour]
→ *Why 55.5?* It's EPA's published "Unhealthy" breakpoint — a reporting
boundary I use as a behavioral trigger because it's the only citable line;
that's an assumption, labeled as one in the registry. [B10]
→ *What if the trigger were lower or higher?* Lower thresholds start the race earlier in the spike, higher ones later — the race itself, and who wins it, is set by the admission rule, not the start gun. [B12]
→ *So the whole race runs before the main smoke?* Yes — the race resolves in
hours, 2.5 days before the main episode; that's why I disclose the two-spell
structure instead of letting "194 hours" imply one long emergency. [S2 chart]
→ *What would realistic timing do?* Phase E replaces the bright line with
per-person thresholds and cue-dependent departure, with predictions
registered before any run.
→ *Would later departure change the ordering?* The ordering is set by capacity and doors, not timing; what timing changes is dose and who wins the race — which is why it is Phase E's first experiment. [B12] [11-ROUND5-REPORT]

**3. Why walking only? The county offered rides and a hotline in 2020.**
It did — 211 calls could arrange transport; my model is walk-only and I say
so. [B5]
→ *Doesn't that break realism?* It's part of why I report the calibration
bracket instead of pretending to reproduce 2020: rides, awareness, and trust
are exactly what the full-information walking model omits. [B5]
→ *How big is the omission?* Between 1.5 and 15.6 times too many admissions
against the one real record — measured, not guessed. [B5]
→ *Will rides be modeled?* Yes — a 211-style channel with uptake as a
parameter is in the Phase E spec, gated on sources. [E-LAYER-SPEC]

**4. Why these ten new sites — does the chooser matter?**
A placement algorithm picked them; then I re-picked them at random from the
same candidate pool, three times, and admissions were identical in every
draw. [B3]
→ *So the optimizer does nothing?* For headcount, nothing — that's the
dispersion result. For walking it matters a lot: 63% shorter walks than the
random draws. [B3]
→ *So is C pointless?* No — C says "more doors beats bigger buildings."
What's refuted is crediting the door-chooser for the headcount. [S6]
→ *Could the county actually build them?* They're street-network points, not
vetted buildings — no zoning, staffing, or air-filtration check. Stated
limitation. [B8]
→ *Why ten sites and not five or twenty?* A policy setting I chose, stated as such — the dispersion result says the count of doors is the lever, so sweeping site count is a natural next experiment. [S6]

**5. Isn't 578 = 550 + 28 circular?**
Yes — and I say so on the slide: capacity equals population by construction,
so empty spaces and people outside are the same number counted twice. [B11]
→ *Then what's informative?* Who is outside — the slowest walkers — and where
the empty spaces sit: the wrong sites. [B11]
→ *Why design it that way?* To remove scarcity as an explanation, so whatever
failure survives can only be geography. [S4]
→ *And the knife edge?* The whole failure mode lives at capacity ≈ demand:
five percent slack matches C, ten percent admits everyone reachable. [B4]

**6. Why nine seeds — is that enough?**
Seeds vary who gets which attributes; across nine, admissions move by at most
eleven people while the smallest between-scenario gap is 306. I report those
side by side, not as a ratio, because seed spread only measures random-draw
noise. [PROV: *_in_range]
→ *What don't seeds cover?* Structural and parameter uncertainty — that's
what the sweeps and controls are for (capacity sweep, random-site draws,
window arms). [B4, B3, B12]
→ *Why 42–50?* Arbitrary consecutive integers, fixed before running and
recorded in every manifest — chosen once, never reselected. [B10]
→ *Could more seeds change a conclusion?* Only if a gap of hundreds hid inside a spread of eleven — the margins are two orders apart; more seeds buy precision, not direction. [PROV]

**7. Who are the 28 unreachable?**
People whose campsites sit on street fragments with no path to any shelter —
after the freeway fix, their fragment's only link to the network was a road
pedestrians can't legally use. [B6]
→ *Same people in every scenario?* Verified: identical individuals across
arms within each seed — an automated invariant. [B6]
→ *What would the county do?* Not siting — outreach or transport; the model
marks them as a fixed floor no bed arrangement reaches. [B6]
→ *Weren't there 16 before?* Yes — on the flawed map that let people walk
freeways. The corrected map reclassified about a dozen per run from refused
to unreachable, and no headline moved. [B6]

**8. How do you know the simulation isn't just wrong?**
I can't prove it right; I can make it checkable — manifests, an invariant
suite, independent recomputation of routing and exposure, and controls
designed to embarrass me. [B10]
→ *Example?* The asthma negative control: no mechanism links asthma to
movement, so it must show nothing — and does show nothing, in every arm, with
the regression p-values to match. [B7]
→ *Has the process caught a real bug?* Yes — the freeway map defect: found by
audit, fixed, everything re-run, headlines unchanged to the digit. That
survival is the strongest robustness evidence I have. [B6]
→ *What about the code itself?* Every run's manifest pins the exact commit;
a fresh clone rebuilds the deliverables and passes the same checks. [B10]
→ *Who reviewed it?* Three external critique rounds plus a 52-agent audit are in the repo with every verdict — including the ones that refuted my own claims. [11-ROUND5-REPORT]

**9. What did you get wrong?**
Two registered predictions: I said surplus wouldn't match C's access until
1.4–1.6× demand (it matched at 1.05×), and that the fairness gap would
persist under surplus (it vanishes at 1.10×). [B4]
→ *Anything retracted?* Yes — I briefly described a regression coefficient as
the algorithm "discovering" the reserve rule; the honest statement is that it
re-found the rule I wrote — a sanity check — and its size isn't quotable
because of cells at exactly 100%. [B7]
→ *Why advertise mistakes?* Because registered predictions only mean
something if the misses are published with the hits — and both misses made
the policy answer cheaper. [S9]

**10. What about pets, belongings, kids?**
Not modeled yet — and the 2020 record says they mattered: the county's own
spokesperson attributed low shelter use partly to belongings people wouldn't
abandon. [11-ROUND5-REPORT]
→ *Kids?* The model is adults-only, which happens to match the 2020 emergency
sites' adults-only intake, but not the general shelter system — a stated
scope limit. [B8]
→ *Will they be modeled?* Phase E adds possessions, pets, and dependents as
sourced attributes feeding a barrier cost — every prevalence gated on a
verified source before any code. [E-LAYER-SPEC]

**11. If you were the county with a million dollars, what happens tomorrow?**
First, the free thing: a ten-percent reserve rule at intake — it closes the
fairness gap at zero capital cost. Then buy slack toward ten percent surplus,
where the whole failure mode dissolves. [S6/S8]
→ *Not new sites?* Not for headcount — doors only beat buildings when capacity
exactly equals demand, and 342 beds buys the same gain. Site for shorter
walks if information systems exist to route people. [B3, B4]
→ *What can't the model tell them?* Real uptake — awareness, trust, rides;
the 1.5–15.6× bracket is the honest size of that unknown. [B5]
→ *What does the reserve cost operationally?* Holding a space briefly empty at intake — no construction, no staff increase; the model prices its access cost at zero because total admissions are identical. [S8]
→ *Is a reserve legal or practical?* That is a policy question outside the model; what the model contributes is the size of the benefit and its zero capital cost. [S8]

**12. Your dose numbers look huge — are those real micrograms?**
They're modeled inhaled mass: measured concentration × published breathing
rates × time outdoors — and they depend on the measuring window, which is why
the 24-hour and full-event ratios are both reported. [B12]
→ *Why does the window matter?* Short windows are dominated by the walking
difference between scenarios; long windows by who's still outside. [B12]
→ *Is the smoke field realistic?* It's uniform county-wide — two monitors
can't support a spatial surface; that means every scenario effect is a
travel-time effect, stated plainly. [B12]
→ *Do monitors understate wildfire smoke?* Likely yes — these are heated-inlet instruments known to under-read fresh wood smoke, so reality was probably worse; that pushes every conclusion in the same direction. [B8]

**13. The 2020 smoke with the 2025 population — isn't that mixing eras?**
Deliberately: the question is "if that smoke returned *today*" — the largest
measured local event against the current population and shelter system, with
every vintage disclosed in one table. [B8]
→ *Weakest link?* Sex and mobility distributions are 2019 — no newer local
source exists; asthma and COPD are imported from a Minnesota cohort. Both
stated. [B8]
→ *Campsites?* 2025–26 complaint reports as a spatial stand-in for 2020 —
biased toward visible camps, disclosed. [B8]
→ *Why not the 2019 population for 2020 smoke?* Because the question is present-tense policy — and the historical 2020 configuration exists separately as the calibration reference. [B5]

**14. What's in the shelter capacity number — beds, rooms, pods?**
The county list mixes five unit types; each was converted to people with a
documented rule, totaling 2,234. [PROV: spaces]
→ *Missing anything?* Two real sites with no published address (~207 spaces)
and ten day centers with no published capacity — excluded rather than
guessed, and A is therefore a slight understatement of today. [B8]
→ *Day centers matter?* In a daytime episode they might matter most — named
as a limitation, not silently dropped. [B8]
→ *Why not estimate day-center capacity?* Ten invented numbers would have been fabrications — the same standard that kept me from inventing an asthma speed effect. [B8]
→ *Does the unit conversion drive results?* The conversion band is small against the threefold scarcity ratio in A; capacity binds regardless. [PROV: spaces]

---

## BACKUP SLIDE KEY
B1 five-scale equity table (E1's numbers) · B2 survival curves · B3 random-
pool control · B4 full bed sweep · B5 2020 two-site calibration + bracket ·
B6 freeway fix · B7 model card (regression sanity check) · B8 data vintages &
population construct · B9 agent states · B10 verification pipeline ·
B11 identity arithmetic · B12 window-dose table.
