# The Complete Story

**Capacity Is Not Access: an agent-based model of wildfire-smoke shelter access among
unsheltered residents of Multnomah County, Oregon.**

Fatima Asghar · NSF REU

---

## How to read this document

This is the long version. It is written so that a person who has never seen the project
can start at the top, read straight through, and end up knowing not only what the model
does but why every single choice inside it was made that way and not some other way. It
covers the whole arc: the first two-shelter experiment that turned out to be broken, the
present-day three-arm redesign, the bed sweep, the human decision layer, the severe-event
counterfactual, the browser port, and every defect found and fixed along the way.

Three rules govern what is in here.

First, every number comes from a file in this repository, and the file is named in
parentheses right next to the number. If you want to check something, the path tells you
where to look.

Second, where two documents in this repository disagree with each other, this document
says so and shows both. It does not smooth over the disagreement. There is a running list
of every such conflict in Section 9 and in Section 12.

Third, where the repository does not record a reason for something, this document says
"the record does not say why" rather than inventing a plausible-sounding one. That
happens a few times, and each time it is flagged as a gap.

There are no em dashes anywhere in this document, by request.

**Jargon is defined at first use.** If a term appears that you do not recognise, it is
defined the first time it shows up, and the definition is in ordinary words.

---

## 1. What the project is, and what question it answers

### 1.1 The one-sentence version

When wildfire smoke fills a city, the people with the fewest choices about where to
breathe are the people sleeping outside, and this project builds a computer model of one
real city to ask whether the shelters that exist can actually be reached by the people
who need them.

### 1.2 The honest version

That sentence hides all the difficulty, so here is the same thing said carefully.

In September 2020, wildfire smoke settled over Portland, Oregon, and stayed for days. The
air quality monitors inside Multnomah County recorded hourly fine-particle concentrations
that peaked at 562.7 micrograms per cubic metre (`docs/final/SMOKE_FIELD_AUDIT.md` §2).
For scale, ordinary clean air in Portland during that same month sat between about 3 and
9 micrograms per cubic metre (visible in the hourly series embedded at
`docs/final/presentation/capacity-is-not-access-symposium.html`, the `DATA.pm` array). So
the smoke was roughly a hundred times worse than normal for over a week.

**PM2.5** is the standard shorthand for those particles. It means "particulate matter
2.5 microns or smaller", which is fine enough to travel deep into the lungs rather than
being caught in the nose and throat. It is measured in micrograms of particle mass per
cubic metre of air, written µg/m³.

The county opened emergency clean-air shelters. A person living in a house could close
their windows. A person living in a tent could not. So the question the project asks is
narrow and concrete:

> If a smoke event of that magnitude happened against the shelter system that exists
> today, and against the number of unsheltered people who live in the county today, how
> many of them would actually get indoors, who would be left outside, and what would
> change that?

The word doing the work is **actually**. It is not a question about how many beds exist.
It is a question about whether a specific person, starting at a specific place, walking
at a speed determined by their age and health, can reach a specific door before that door
fills up.

### 1.3 Why an agent-based model and not a map

The standard tool for questions like this is a **screening map**, which means a map that
colours each neighbourhood by some measure of risk or need, often combined with a buffer
showing what is "within a mile" of a shelter. Those maps are useful and they are cheap to
make. They also cannot answer this question, for two reasons that are worth stating
precisely because a reviewer will ask.

**A map cannot show reach.** A buffer drawn around a shelter says how far away things are
as the crow flies, or at best along roads. It does not know that the person inside the
buffer walks at 0.98 metres per second rather than 1.38, that the only bridge between
them and the shelter carries no sidewalk, or that the street they would use is a freeway
ramp where pedestrians are prohibited. This project found that last problem in its own
data and had to fix it, which is described in Section 9.

**A map cannot show a full door.** This is the deeper reason. The presenter's script puts
it in one line: *"A shelter that is full turns away the next person to arrive, and who
arrives first depends on where they started and how fast they walk. An average cannot
represent a full doorway"* (`docs/final/PRESENTER_SCRIPT.md`, Slide 4). The outcome the
project cares about is a collision between many people and a hard limit. Averages smooth
collisions away. The only way to see who loses a race is to simulate the race.

An **agent-based model** (ABM) is a simulation in which every individual in the
population is represented separately, as its own small program with its own attributes,
making its own decisions tick by tick. Here there is one simulated resident for every
real unsheltered resident: 6,842 of them. Each one has an age, a sex, a walking speed,
health attributes, a starting location, and a state. The model runs the clock forward one
minute at a time and lets them move.

The platform is **Repast Simphony**, a Java-based agent modelling toolkit (North et al.
2013, DOI 10.1186/2194-3206-1-3, cited at `docs/final/PRESENTER_SCRIPT.md` Slide 4). The
route-finding is **Dijkstra's algorithm** (Dijkstra 1959, DOI 10.1007/BF01386390), which
is the same shortest-path calculation a phone navigation app performs. Distances are
measured along the curve of the Earth using Karney's geodesic method (Karney 2013, DOI
10.1007/s00190-012-0578-z), which is named explicitly rather than being left as a vague
"we measured distance", because saying whose method it is makes the number checkable.

### 1.4 What "agent-based" buys, and what it costs

It buys the ability to observe a mechanism rather than a correlation. Section 6 reports a
result where adding beds to existing shelters raises total access enormously and, at the
same time, widens the gap between residents who walk easily and residents who do not. No
map produces that finding, because the finding is about arrival order.

It costs a very large number of assumptions. Every one of those assumptions is a place
the model could be wrong. That is why this project carries two machine-readable
registries listing every scientific quantity and every assumption, validated at program
startup, described in Section 3.

---

## 2. The world we built, piece by piece, and why each piece is the way it is

The simulated world has four physical parts: the streets people walk on, the air they
breathe, the people themselves, and the shelters they walk toward. Each was built from a
real dataset, and each dataset has a documented history, including its problems.

### 2.1 The street network

**What it is.** Every street in the Portland metro area, as a set of line segments with
endpoints, loaded from the Regional Land Information System (RLIS) street centreline
file maintained by Oregon Metro, the regional government
(`docs/science/DATA_SOURCES.md` D0). The raw file contains **112,070 features**, and
100% of them carry the `PDX_F_NODE` and `PDX_T_NODE` attributes, which are the file's own
labels for the intersections at each end of a segment.

**Why real centrelines rather than a grid.** A synthetic grid would make every route the
same shape and would erase exactly the thing being measured: that some encampments sit on
dead-end fragments, some sit behind a river, and some sit a block from a shelter. The
whole point is that geography is uneven.

**Why freeways are excluded.** Pedestrians may not legally walk on limited-access
freeways, but the RLIS file contains freeway mainlines and ramps like any other line. If
they are left in, the route-finder will happily walk a person up an on-ramp and across a
freeway bridge. The correction, registered as variable **V26**, excludes every feature
whose RLIS `TYPE` code is in {1110, 1120, 1121, 1122, 1123}, which are freeway mainline
and the four ramp/connector classes (`Geography/data/registry/variables.csv`, V26). The
counts were verified against the source file `Streets.dbf`: TYPE 1110 appears 1,372
times, 1120 appears 279 times, 1121 appears 466, 1122 appears 447, and 1123 appears 72,
which is **2,636 features and 614.1 kilometres removed**
(`docs/critique-response/11-ROUND5-REPORT.md`, U-27 section).

The consequence that matters most is bridges. Portland's Willamette River crossings
include the Marquam Bridge (Interstate 5) and the Fremont Bridge (Interstate 405), and
neither carries pedestrian access. Before the fix, the model let people walk across both.
After the fix, they are gone, and all eight pedestrian-legal crossings remain
(`scripts/audit_bridges.py`, reported in `11-ROUND5-REPORT.md`). One crossing, the Ross
Island Bridge, is retained because it carries a sidewalk and its RLIS TYPE is 1300, not a
freeway class. The round-4 external critique's list of "walkable bridges" had omitted it,
so the critique's list was incomplete and the model was right.

**The resulting graph.** After the freeway exclusion, the pedestrian network has
**109,434 edges and 88,100 nodes**, in 171 disconnected components, the largest of which
holds 59,725 nodes (`docs/final/TECHNICAL_REFERENCE.md` §13.7;
`docs/science/DATA_SOURCES.md` D0). Before the exclusion it had 112,070 features feeding
89,345 nodes in 154 components. A **component** is a set of nodes you can walk between;
171 components means the pedestrian map of the county is not one connected thing, and
some residents start on a fragment with no legal walking route to anywhere.

**The wormhole defect.** This is the single most consequential bug found in the project,
and it is described in full in Section 9. In short: the model originally trusted the
file's own intersection labels, and a small block of those labels is corrupt. The same
intersection ID was claimed at positions up to 18.5 kilometres apart by different
segments, which welded distant parts of the city into single points and created 50 edges
that a route could traverse for almost no cost while a walking person would physically
cross kilometres (`docs/validation/STREET_NETWORK_VALIDATION.md` §1 and §2). The fix
clusters the claims by location and splits the impostors, and after it there are **zero**
impossible-span edges.

**What is still not fixed, and is stated.** The RLIS file records centrelines, not
sidewalks, and carries no pedestrian attributes. Highway classes in the TYPE 1200 series
(2,139 features) are retained because the file does not say which of them have sidewalks,
and inventing that would be worse than keeping them; this is registered as a named
sensitivity in V26 rather than passed over. Also, the acquisition route for the file
itself predates version control, so its publication date is unknown
(`docs/science/DATA_SOURCES.md` D0). The redistribution status is stated exactly as
strongly as the record supports and no more: *the researcher reports that Oregon Metro
approved the redistribution (relayed 2026-08-02)*, and there is no written determination
on file anywhere in the repository. That is the honest form of that sentence and it is
repeated in the model's own footer.

### 2.2 The smoke field

**What it is.** A single number per hour, applied to the entire county, for 312 hours
starting 2020-09-07 at 00:00 and ending 2020-09-19 at 23:00
(`docs/final/SMOKE_FIELD_AUDIT.md` §2).

**Where it comes from.** The U.S. EPA's Air Quality System (AQS), which is the federal
repository of regulatory air monitoring data. The project retrieved hourly observations
of **parameter 88502** from 7 monitors across Multnomah, Washington and Clackamas
counties for September 2020: 4,795 rows, of which 1,454 are Multnomah
(`docs/science/DATA_SOURCES.md` D3; `docs/final/SMOKE_FIELD_AUDIT.md` §2). Retrieval is
scripted and reproducible at `scripts/fetch-aqs-pm25.ps1`, and the file's SHA-256
checksum is recorded.

**Why parameter 88502 and not 88101.** This question comes up because 88101 is the
"proper" one: it is the code for PM2.5 measured by a Federal Reference Method or Federal
Equivalent Method, the instruments EPA certifies for regulatory compliance. Parameter
88502 is "PM2.5 acceptable for AQI reporting" measured by a non-reference instrument. The
answer is blunt and is stated in the audit: **88101 has no Multnomah County monitors in
this period**, so 88502 was used because it is the only in-county data that exists
(`docs/final/SMOKE_FIELD_AUDIT.md` §6). All seven monitors report via method 771, heated-
inlet nephelometry, at POC 3, which means there is a single instrument type with no
method diversity and no co-located reference instrument, and the file's `Uncertainty`
column is empty in all 4,795 rows so there is no per-observation error to propagate.

The direction of the resulting bias is known and is stated rather than hidden: a heated
inlet evaporates semi-volatile organic compounds before the particles are counted, and
those compounds are a large fraction of the mass of fresh wood smoke, so **these readings
most likely understate the true PM2.5 during the event**
(`docs/chapter/Capacity_Is_Not_Access.tex`, the paragraph preceding Fig. 1). That is a
caution in the direction of the model looking better than reality, which is the direction
this project consistently reports its errors in.

**Why the field is uniform across the county, and why that is a limitation rather than an
oversight.** Only **two** of the seven monitors sit inside Multnomah County: site 0080 at
(45.4966, −122.6029) and site 2011 at (45.5622, −122.5757). The model computes the
unweighted arithmetic mean of those two for each clock hour and applies it to every
resident. There is no spatial interpolation of any kind
(`docs/final/SMOKE_FIELD_AUDIT.md` §1).

That was a deliberate refusal. Inverse-distance weighting or kriging fitted to two points
does not recover a real concentration field; it manufactures a gradient whose shape is an
artefact of the interpolation method and the accident of where two instruments happen to
sit. A kriging variogram, which is the statistical object that makes kriging meaningful,
cannot be estimated from two stations at all. Presenting such a surface would give every
"exposure hot spot" in the results the appearance of spatial precision the data cannot
support. The audit's own words for the alternative are that stating plainly that the
field is uniform is *"weaker-looking and more honest"* (`docs/final/SMOKE_FIELD_AUDIT.md`
§3). It is registered as assumption **A-01** in
`Geography/data/registry/assumptions.csv`, with a sensitivity plan attached.

The consequence has to be carried everywhere, and it is: **placement cannot help by
moving people to cleaner air, because in this model there is no cleaner air.** Better
shelter placement helps only by shortening journeys. Therefore every placement benefit
this study reports is a pure travel-time effect and is a lower bound on what placement
could achieve in a real, spatially varying smoke field.

**What the series looks like.** Over the 312-hour window there are zero missing hourly
slices. The county hourly mean peaks at **562.7 µg/m³** at 2020-09-12 20:00; the highest
single-monitor hour is **588.9 µg/m³** at site 2011 on 2020-09-13 at 21:00. Those two
numbers must never be conflated, and the model uses and reports 562.7 because that is the
field it actually integrates. The mean over the window is 173.09 µg/m³, and **194 of the
312 hours** sit at or above 55.5 µg/m³ (`docs/final/SMOKE_FIELD_AUDIT.md` §2).

The strongest external validation available is that EPA's own informational qualifier
`IT`, meaning "Wildfire, U.S.", is set on 1,576 rows spanning exactly 2020-09-07 to
2020-09-19, which is the simulation window to the day. That is the agency itself
attesting that these observations are wildfire-influenced.

**The shape matters and is disclosed.** The episode is not one continuous emergency. It
has two spells: a short spike at hours 16 to 21, then 57 comparatively clean hours, then
the main episode from hour 79 onward (the shaded bands in the deck chart at
`docs/final/presentation/capacity-is-not-access-symposium.html`, drawn from the zone list
`[[16,21],[22,78],[79,311]]`). This is disclosed deliberately, because "194 hours above
the threshold" would otherwise imply eight unbroken days.

### 2.3 The population

**What it is.** 6,842 simulated adults, each placed at a real campsite report location.

**Where 6,842 comes from, and why the number changed.** The earlier version of this study
used **2,037**, the unsheltered count from the 2019 Point-in-Time count
(`docs/science/DATA_SOURCES.md` D2 and D10). A **Point-in-Time count**, usually shortened
to PIT count, is a survey conducted on a single night in late January in which volunteers
attempt to count every person experiencing homelessness in a given area, both those in
shelter and those outside. It is required by the U.S. Department of Housing and Urban
Development and it is a documented undercount, because people sleeping in concealed
locations are missed. The 2019 count for Portland/Gresham/Multnomah County recorded 4,015
people total, of whom **2,037 were unsheltered**, on the night of 2019-01-23. That count
was chosen originally because it was the nearest count to the September 2020 event; there
was no 2021 unsheltered count because of COVID, and the next one was 2022.

The present-day study uses the **2025 Tri-County Point-in-Time count** published by
Portland State University's Homelessness Research and Action Collaborative on 2025-11-04,
which recorded **10,526 people experiencing homelessness in Multnomah County, more than
65% of them unsheltered, giving 6,842**
(`docs/final/PRESENT_DAY_THREE_ARM_RESULTS.md`, opening; `docs/final/TECHNICAL_REFERENCE.md`
§3.4).

**Why the change was necessary.** The research question changed. The earlier study asked
a historical question, "does shelter placement matter", against the 2020 shelter system.
The present study asks a policy question in the present tense: if this happened now,
against today's shelter system, what happens. Asking a present-tense question with a
2019 population would understate today's demand by more than a factor of three, and the
shelter inventory being tested is the 2026 one. The chapter states the reasoning for
using the unsheltered subset rather than the total ("people already in shelter are
indoors and do not walk anywhere in this model") and for using the PIT figure rather than
the county's annual service count of 6,731 ("the annual figure counts turnover across a
year rather than people outside on one night")
(`docs/chapter/Capacity_Is_Not_Access.tex` §sec:people).

**The caveat that travels with 6,842, always.** The 2025 report's own authors state that
changes in how administrative data were incorporated substantially increased the 2025
unsheltered count, so the 2019-to-2025 comparison is **not a clean time series and is
never presented as one**. That caution is carried verbatim in the chapter, in
`docs/final/TECHNICAL_REFERENCE.md` §3.4, and in
`docs/final/FINAL_DATA_VALIDATION_REPORT.md`. Treating all 6,842 as outdoors
simultaneously is described in the presenter's script as *"a disclosed worst-case
construct, not a claim about one night"* (`docs/final/PRESENTER_SCRIPT.md`, Q&A 1). A
sweep over the fraction actually present is registered as future work and has **not** been
run, which is stated as an honest gap rather than glossed.

**Where people start.** The City of Portland publishes campsite reports through its
Impact Reduction Program, and 3,400 were retrieved through the city's open-data ArcGIS
service. They resolve to **3,317 distinct coordinates** in the file. Each simulated
resident is placed at one of those, sampled with replacement, so a single run occupies a
subset of them.

> **A disagreement between two repository documents, stated rather than smoothed.**
> `docs/final/PRESENT_DAY_THREE_ARM_RESULTS.md` line 203 says the seed-42 arm-A run used
> **2,918 distinct start locations**. `docs/chapter/Capacity_Is_Not_Access.tex` line 297
> says **2,981**. Both numbers are real and both come from the same file, but they count
> different things: the same run's `agents.csv` has 2,981 distinct
> `starting_encampment` identifiers and 2,918 distinct start **coordinates**
> (`docs/critique-response/03-data.md` §"2,981 distinct campsite points", and
> `docs/critique-response/00-RESPONSE.md` lines 483 to 485). The two deliverables use
> near-identical wording for two different quantities. A reader comparing them will think
> one is a typo. The claim linter carries an entry, `campsite-2981-distinct`, whose
> correction text insists the figure be stated as a sampling outcome of one run rather
> than a property of the data file (`docs/claims.yaml`), but the id-versus-coordinate
> distinction is not resolved in the deliverables themselves. This is a real
> documentation defect and it should be fixed by naming the quantity in both places.

The campsite feed is used as a **spatial proxy**, which means a stand-in for something
that does not exist. There are no 2020 records in the public feed at all, so 2025 and
2026 report locations serve as a geographic stand-in for the 2020 distribution, and the
model prints a warning saying so at the start of every run. The reports are also
complaint-driven, which biases them toward camps visible from the street. This is
registered as assumption **A-03** (`Geography/data/registry/assumptions.csv`) and, as the
presenter's script notes, the bias makes access look easier rather than harder, which is
again the optimistic direction.

**A privacy decision that changed what the browser app can display.** Because these are
3,400 precise, current, complaint-reported locations of where people sleep, publishing
them as points creates a targeting and sweep risk. The browser version therefore snaps
every coordinate to its nearest street node (which is the only quantity the simulation
actually uses), replaces the incident identifier with a salted hash whose salt is
withheld, drops dates and vehicle flags, and **always displays density on a grid of at
least 150 metres, never individual points** (`websim/docs/IMPLEMENTATION_PLAN.md` §7,
decision Q4; `websim/docs/DR-Q4-encampment-disclosure.md`). A raw-coordinate public layer
is described in the plan as never acceptable, not togglable and not hidden behind an
Easter egg. This is why the teal squares in Section 8's screenshots are squares.

### 2.4 The shelters

**What the present-day inventory is.** 36 facilities holding **2,234 spaces**
(`docs/final/TECHNICAL_REFERENCE.md` §4.5 and §4.8). Every one is a real facility at its
real address with its real published capacity.

**How it was assembled, and why that took the longest audit trail in the project.** The
county publishes its shelter list in **five incompatible units**: beds, motel rooms,
village units or pods, family units, and unstated. A row saying "28 families" is not 28
people. The rule adopted was: never convert an ambiguous unit to a single number, always
to a range, and always record which rule was applied
(`docs/final/SHELTER_CAPACITY_AUDIT.md` §2; `docs/final/TECHNICAL_REFERENCE.md` §4.2).

| Published unit | Count | People per unit | Basis |
|---|---|---|---|
| Beds | 1,066 | 1.0 exactly | A bed is one sleeping place for one person |
| Motel rooms (adults) | 341 | 1.0 to 1.5 | The listings say "individuals and couples", so occupancy is at least 1 and at most 2 |
| Village units / pods | 205 | 1.0 to 1.2 | Predominantly single occupancy; one site lists "men, women, couples" |
| Family units | 85 | 2.5 to 4.0 | A household, not a person. No local sheltered-family size is published. **The weakest conversion in the table** |
| Unstated (youth "30") | 60 | 1.0 | Unit not stated; treated as people, the reading that cannot inflate the total |

The point multipliers actually applied in the build are the midpoints: beds ×1.0, motel
rooms ×1.25, village units ×1.1, family rooms ×3.25, and every row carries its own audit
string in a `capacity_basis` column, for example
`58_rooms_x1.25_per_SHELTER_CAPACITY_AUDIT_s2`
(`docs/final/TECHNICAL_REFERENCE.md` §4.2).

**How the coordinates were obtained, and the design decision behind it.** The raw
inventory file was deliberately created **without** coordinates. The comment in the
geocoding script says why, verbatim: *"I did NOT put coordinates in
shelters_multnomah_2026.csv on purpose. Guessing lat/lon from an address is exactly the
kind of plausible-looking fabrication that has already cost you once in this project"*
(`scripts/geocode_shelters.py`, quoted at `docs/final/TECHNICAL_REFERENCE.md` §4.3).
Coordinates enter only through a named geocoder and every row records which one and at
what confidence. The base facilities went through OpenStreetMap's Nominatim geocoder with
an identifying user agent and a 1.1-second rate limit, and every result was checked
against a Multnomah bounding box of latitude 45.42 to 45.65 and longitude −122.95 to
−122.35, with the comment *"A geocoder that silently returns the centroid of another state
must not enter the dataset."*

Three sites publish only an intersection or a block rather than a street address, and
Nominatim refuses intersection-style queries, so those were geocoded to the corresponding
hundred-block address instead. That is an approximation of a few hundred metres and the
`coord_confidence` column says so on the row. Only **3 of 36** rows carry non-street-
address confidence (`docs/final/TECHNICAL_REFERENCE.md` §4.4).

**What is missing, and why.** Two City facilities are excluded because neither publishes
a street address: **Clinton Triangle (160 units, the largest single site in the
inventory)** and **Multnomah Safe Rest Village (28)**, together about 207 people. Real
capacity is therefore about 207 people higher than modelled
(`docs/final/TECHNICAL_REFERENCE.md` §4.6).

Ten to eleven **day centres** are excluded because no capacity figure is published for any
of them. Including them would mean inventing ten numbers. The exclusion carries a
scientific point that cuts against the project's own framing and is stated anyway: during
a *daytime* smoke episode, day centres are arguably the most relevant clean-air spaces
that exist, so their absence understates daytime shelter availability
(`docs/final/TECHNICAL_REFERENCE.md` §4.6). The reason this is not "fixed" by estimating
them is the same standard that kept the model from inventing a walking-speed effect for
asthma: ten invented numbers would be fabrications.

**The reconciliation.** Modelled capacity had been roughly 18% low before this pass: 29
facilities holding 1,816, then plus six locatable City villages to 35 facilities and about
2,114, then plus Doreen's Place (90 beds, recovered by shortening a failed geocoder query
to `610 NW Broadway`) to the final **36 facilities and 2,234 spaces**, independently
verified as 36 data rows summing to exactly 2,234 (`docs/final/TECHNICAL_REFERENCE.md`
§4.5 and §4.8).

**The historical 2020 inventory, which is a separate thing.** For the historical
calibration run the model uses only the two September 2020 emergency clean-air
activations: the Oregon Convention Center (opened 2020-09-10) and Charles Jordan Community
Center (opened 2020-09-11), each with capacity 99, for 198 total. Mount Scott Community
Center was prepped and put on standby and is present in the file with `operating=false`,
because a faithful status quo has two operating sites, not three
(`docs/science/DATA_SOURCES.md` D1). The 99 figure comes from a Street Roots newsroom
report of 2020-09-16 and **has never been confirmed by a primary agency document**, which
is why assumption **A-04** is still marked `blocking` in
`Geography/data/registry/assumptions.csv`. The July 2026 county shelter list was checked
to see whether it could confirm the 2020 figure, and it cannot: it describes a year-round
shelter system, different in time, purpose and function from a nine-day smoke activation.
Substituting it would be a temporal and functional category error
(`docs/final/SHELTER_CAPACITY_AUDIT.md` §1). A negative audit result is reported as a
result.

---

## 3. Every variable that matters, and why its value is what it is

### 3.1 The registry, and what "evidence class" means

Two comma-separated files hold the model's entire scientific content in machine-readable
form: `Geography/data/registry/variables.csv` (**55 variables**) and
`Geography/data/registry/assumptions.csv` (**35 assumptions**), counts verified directly
from the files. Both are loaded and validated **fail-fast at model startup** by
`geography.science.ScienceRegistry`, and both are written into every run's
`simulation.json` manifest under a `governance` block. A run whose registries fail
validation produces no output at all (`docs/science/REGISTRY_SCHEMA.md`).

Each variable row carries sixteen columns, including the mechanism (why the quantity
belongs in the model at all), the maths, the units, the source, a DOI or dataset
identifier, an uncertainty range to sweep, four yes/no flags for what it affects, and its
**evidence class**. The classes are defined in `docs/science/REGISTRY_SCHEMA.md` §1:

- **M, measured.** Taken from a dataset in the repository.
- **L, literature.** Taken from a published paper, with a resolvable DOI.
- **C, calibrated.** Fitted to a target.
- **A, assumption.** A modelling decision, not a measurement.
- **F, future work.**

The census across the 55 rows is **A 29, M 15, L 11**, with no rows currently in classes
C or F. By status: 28 implemented, 23 specified (designed and registered but not yet
coded), 3 placeholder (present in the code but deliberately inert), 1 deprecated.

Two of the validation rules are the mechanised form of the project's founding rule, "no
invented values":

- A row with `evidence_class = L` **must** have a non-empty `doi_or_dataset`, and `M`
  must have a dataset identifier. As the schema document puts it, a literature value with
  no resolvable source is exactly the defect this project has twice been damaged by, so
  it is rejected at load rather than merely warned about.
- A row with class `L` or `C` **must** have a non-`none` uncertainty range, because a
  literature value with no stated range cannot be sensitivity-tested.

Placeholder rows are counted and named in the manifest under
`governance.placeholder_variables`, so a run that depends on an inert value cannot be
quoted as a finished result. The three placeholders are **V7** (the exposure burden
index), **V2** (`age_rr`) and **V4** (`comorbidity_rr`), and Section 3.6 explains why the
last two are switched off.

Four assumptions are marked `blocking`, meaning they must be resolved before publication:
**A-04** (shelter capacity is newsroom-sourced), **A-09** (susceptibility weights are
inert), **A-12** (everyone is assumed to know the shelters exist) and **A-16** (admission
order within a tick is randomised).

### 3.2 Walking speed, the one attribute that actually changes outcomes

**The base speed.** The original single constant was 1.30 metres per second, from
Bohannon 1997 (DOI 10.1093/ageing/26.1.15), a study of comfortable self-selected gait
speed in adults aged 20 to 79 (n = 230). The registry row V10 records that 1.30 sits below
10 of the 12 published age-by-sex cells and about 6% under the table mean of 1.381
(`Geography/data/registry/variables.csv`, V10). This is class **L**.

**Why speed matters mechanically.** Speed sets how long a person is outdoors, and time
outdoors is the proximate driver of everything: accrued exposure, inhaled dose, and
crucially whether they reach a door before it fills. In this model, a health condition can
change an outcome **only** by changing walking speed, because a diagnosis is never
allowed to multiply a dose. That is the single most important structural rule in the
science and it is discussed in 3.6.

**The heterogeneous version.** In the production runs every resident draws their own
speed. The mean comes from Bohannon and Williams Andrews 2011 (DOI
10.1016/j.physio.2010.12.004, n = 23,111), which publishes comfortable gait speed means by
age decade and sex. The within-population spread comes from Bohannon 1997's coefficient
of variation of 0.13. The chapter states explicitly why the spread does **not** come from
the 2011 meta-analysis's confidence intervals: those intervals describe uncertainty about
a group average across studies, not the spread among individuals, and using them would
understate real between-person variation by a factor of three to five
(`docs/chapter/Capacity_Is_Not_Access.tex`, §sec:speed).

**The truncation bounds (V27).** Sampling is by rejection: redraw until the value lies in
[0.40, 2.20] m/s, and after 100 failed draws clamp to the violated bound. The floor sits
below the impaired-walker mean minus 1.7 standard deviations and the cap above every
published age-sex cell mean plus 4 standard deviations. This was checked numerically
during the round-4 review: **0 of 61,578 sampled speeds hit either bound**, so the bounds
are inert in practice (`Geography/data/registry/variables.csv`, V27).

**The age ceiling (V28).** The published Bohannon decade table's oldest row is 80+, and
ages are sampled uniformly inside the PIT bands, whose top band is open-ended. The model
closes it at 90 so every lookup lands on a published row. The maximum sampled age across
nine seeds is 89, and about 2.01% of residents (roughly 138 per run) are 80 or over and
receive the real published 80+ row (0.968 m/s male, 0.943 female) rather than an
extrapolation.

**Residents whose sex is recorded as neither male nor female** take the unweighted mean of
the two published speed columns. The method's javadoc gives the reason in one sentence:
assigning such a resident a sex it does not have would be an invention
(`docs/critique-response/11-ROUND5-REPORT.md`, U-05 verdict).

**What would change if the base speed were wrong.** Speed enters everything, so a uniform
shift would move absolute travel times and absolute doses. It would move the *comparisons*
much less, because all three scenarios draw from the same distributions with the same
seed, and the byte-identity check in Section 6 proves the populations are identical
across arms.

### 3.3 Mobility limitation, and the replacement rule

**Prevalence.** 19.2%, from the 2019 Multnomah PIT (391 of 2,037). It is explicitly a
**lower bound**: the question was asked only of street-count survey completers but
divided by the full population (`docs/science/DATA_SOURCES.md` D10;
`Geography/data/registry/variables.csv`, V20).

**The age gradient is borrowed and the borrowing is declared.** The local PIT gives only
the marginal with no age breakdown. Sampling mobility independently of age is known to be
wrong because it under-represents people with compound vulnerability, which is exactly the
group the study exists to find. So the model imports the **ratio** from CASPEH, the
California Statewide Study of People Experiencing Homelessness (UCSF, June 2023, n = 3,198,
78% unsheltered): 22% overall versus 32% at age 50 and above. That ratio is applied while
holding the measured local marginal exactly, giving P(limited) = 0.1522 under 55 and
0.3478 at 55 and over. The gradient is donor-imputed; the total is measured. Registered as
assumption **A-18**.

**The mechanism is replacement, not multiplication.** A resident with a mobility
limitation does not get their age-by-sex speed scaled down. Their speed is **replaced**
by a draw from N(0.95, 0.32) m/s, the ambulant-impaired distribution from Boyce, Shields
and Silcock 1999 (DOI 10.1023/A:1015339216366), verified in secondary through Tinaburri
2018 (`docs/final/HEALTH_MODEL_AUDIT.md` §4). Replacement rather than multiplication
matters because the Boyce categories already describe an impaired walker; scaling would
double-count the impairment.

**And it is deliberately conservative.** Every mobility-limited resident is assigned the
**fastest** of Boyce's impaired categories, because no source gives the mix of walking
aids (cane, crutches, walker, wheelchair) for this population. CASPEH's finding that 20%
of a 22%-mobility-limited population use an aid suggests aid use is common, so real speeds
are likely lower and **the measured access disparity is likely larger than reported**
(assumption **A-19**).

### 3.4 COPD, and why asthma correctly gets nothing

This is the single most-asked question about the model, and the answer is one of its
better results.

**COPD** stands for chronic obstructive pulmonary disease. Prevalence in the model is
**10.5%**, from Zellmer et al. 2025 (DOI 10.1007/s11606-025-09814-x), an electronic-health-
record study of 20,139 adults with recent homelessness in Minnesota, which reports 10.5%
against 3.0% in the housed population (`Geography/data/registry/variables.csv`, V21b).

**The speed effect (V24).** COPD subtracts **0.19 metres per second** from the age-by-sex
comfortable gait mean, before dispersion is sampled, with a floor at 0.40. The source is
Buekers et al. 2024 (DOI 10.1183/16000617.0253-2023), a systematic review and meta-analysis
of 25 studies comparing 1,015 people with COPD against 2,229 healthy controls, reporting a
usual-speed mean difference of −19 cm/s with a 95% confidence interval of −28 to −11. Two
details in the registry row are worth naming because they are the kind of thing a reviewer
checks: the review's **fast-pace** difference was deliberately not used, and **the review's
own authors rate the evidence as low quality**, which is why the point estimate is
declared sweepable across the published interval rather than treated as fact. It is also
**not stacked** on the Boyce mobility-limited speed, for the same reason replacement was
chosen there.

**Asthma gets no speed effect, and this is the finding rather than the omission.**
Prevalence is 14.9%, from the same Zellmer study, and the model samples it (V21a). But
asthma enters no speed path at all. The reason is recorded in assumption **A-23**: the
literature supports lower total, moderate and vigorous **physical activity volume** among
adults with asthma, but **no verified quantitative comfortable-gait-speed decrement was
found**. Borrowing the COPD estimate for asthma would be an invention.

The consequence is visible in the results, and it is the model's own internal control.
Across all 27 production runs, asthma prevalence among sheltered residents tracks
population prevalence: at seed 42 arm A the sheltered share among asthmatic residents is
29.28% against a population rate of 30.11%, which is 0.64 standard errors, and the largest
absolute z-score across all 27 runs is 1.80 (`docs/critique-response/11-ROUND5-REPORT.md`,
U-19 verdict). This was then wired in as automated **invariant #38**: for every run, the
difference between P(sheltered | asthma) and P(sheltered) must be no more than two
binomial standard errors. The chapter states the point directly: had the COPD estimate
been borrowed for asthma to make the treatment symmetric, a finding would have been
manufactured, so *the asymmetry is evidence that the model is not inventing effects*
(`docs/chapter/Capacity_Is_Not_Access.tex`, §sec:equity).

**What would change if this were wrong.** If a gait-speed decrement for asthma were
published tomorrow, asthma would begin to show an access penalty and the equity table
would change shape. Nothing else would move, because asthma touches nothing else.

### 3.5 The evacuation threshold of 55.5, and the two traps in it

**What it does.** A resident in the `PRE_EVAC` state, meaning sheltering in place at their
encampment while accruing outdoor exposure, departs when the county concentration reaches
or exceeds the threshold **and** at least one shelter is open. That conjunction is
important and is discussed below (`docs/final/TECHNICAL_REFERENCE.md` §8.3, quoting
`GisAgent.java:217`).

**Where 55.5 comes from.** It is the lower bound of EPA's *Unhealthy* category in the Air
Quality Index breakpoint table, from EPA's *Technical Assistance Document for the
Reporting of Daily Air Quality* (`docs/science/DATA_SOURCES.md` D9). It is chosen because
it is a public standard rather than a number the researcher picked.

**Trap one, versioning.** EPA revised the PM2.5 AQI breakpoints on 2024-05-06. The
*Unhealthy* lower bound is 55.5 under **both** the pre-2024 and post-2024 tables, so this
particular number is stable, but the categories above it moved: *Very Unhealthy* begins at
150.5 pre-2024 versus 125.5 after, and *Hazardous* at 250.5 versus 225.5. Any metric that
uses a category above *Unhealthy* must state which table it uses. This project uses only
the stable one, which is why it uses this one.

**Trap two, and this is the more important one.** AQI breakpoints are defined on
**24-hour average** concentrations, while AirNow's real-time public display uses a
different algorithm called NowCast on hourly data. A model that counts *hourly*
observations above 55.5 is measuring something different from either. The project's
response is a naming discipline: the metric is called `hours_above_unhealthy`, it is
defined as **a concentration threshold**, and it is **never** called an AQI category
(`docs/final/TECHNICAL_REFERENCE.md` §8.3; registry rows V-EVAC and V8). This is why every
chart in this project labels the dashed line "EPA Unhealthy breakpoint (concentration
threshold)" and not "AQI Unhealthy".

**What it is honestly not.** A published air-quality reporting boundary is being used as a
**behavioural trigger**, which is a modelling decision and is labelled as one in the deck:
*"smoke crosses 55.5 µg/m³, an EPA reporting line used as a behavioral trigger, a
disclosed assumption"* (`docs/final/presentation/capacity-is-not-access-symposium.html`).
The bigger assumption sitting on top of it is that **everyone crosses it at the same
moment**, registered as **A-02**. Phase E exists to replace exactly that, and Section 5
describes what happened when it did.

**Why departure also requires an open shelter.** Without that clause, residents in the
2020 configuration would have departed on the brief 7 September spike, days before the
real shelters opened on 10 and 11 September, and would have walked to buildings that did
not yet admit anyone. The gate makes departure occur at 2020-09-10 07:00, the first
threshold crossing after an opening (`Geography/data/registry/assumptions.csv`, A-02). In
the present-day configuration every facility is open from hour 0, so the gate is inert and
departure happens at hour 16, the first crossing.

### 3.6 The three quantities that must never be multiplied together

This is the governing principle of the health side of the model, and it is the correction
the project is most proud of (`docs/final/HEALTH_MODEL_AUDIT.md` §0).

| Quantity | Formula | Units | Domain |
|---|---|---|---|
| **Exposure** | Σ C(t)·Δt | µg·m⁻³·h | physics of the **air** |
| **Inhaled dose** | Σ C(t)·IR(activity)·Δt | µg | physics of the **person** |
| **Health risk** | dose × susceptibility | | **biology** |

The rule enforced in code is: ventilation may vary with **activity** (walking versus
waiting) because that is measurable physics, and susceptibility may **never** enter the
dose term, because that is biology and no defensible person-level coefficient exists for
this population. `GisAgent.getHealthRiskMultiplier()` returns **1.0 for every resident, by
design**, and it exists so that a sourced coefficient would have exactly one place to
land, and so a reader can see that risk weighting is switched **off** rather than
**absent**. That is verified in output: `health_risk_score` equals `inhaled_dose_ug` in
100% of rows.

**Why the weights are 1.0: four citations that failed.** The project's original slide deck
carried two relative risks that were checked against their cited primaries and do not
appear in them.

- **RR ≈ 1.45 for adults 65 and over, attributed to Di et al. 2017.** The paper was
  retrieved. It reports a hazard ratio of 1.073 (95% CI 1.071 to 1.075) per 10 µg/m³ of
  annual PM2.5 for all-cause mortality, and subgroup effects by race, sex and Medicaid
  eligibility. It reports **no** age-band contrast, and it cannot: **the entire cohort is
  aged 65 and over** (60,925,443 Medicare beneficiaries). A study whose subjects are all
  65+ cannot produce a "65+ versus under-65" multiplier. No value near 1.45 appears in the
  paper (`docs/science/DATA_SOURCES.md` D5).
- **COPD RR ≈ 1.80, attributed to "Anderson et al. 2013".** No such paper could be
  located. The nearest match is Anderson, Thundiyil and Stolbach, *Clearing the Air*,
  J Med Toxicol **2012**;8(2):166-175, which is a narrative review, is the wrong year, and
  is not a source of a COPD-specific relative risk of 1.80
  (`docs/science/DATA_SOURCES.md` D6).

The health audit then searched for any defensible replacement and found that the real
wildfire-smoke epidemiology is the **wrong kind of quantity**: Alman et al. 2016 gives an
asthma emergency-department visit odds ratio of 1.04 to 1.07 per 5 µg/m³, which is a
population rate response to concentration and not a between-person contrast;
DeFlorio-Barker et al. 2019 gives +6.9% asthma hospitalisation per 10 µg/m³ on smoke days,
the same shape of quantity; Rappold et al. 2011's COPD RR of 1.73 is a county-level
dichotomous exposure and using it per agent is a scale error; and Kondo 2019's elderly-to-
adult meta-relative-risk-ratio of 1.008 (0.996 to 1.020) is null, and the same data yield
anywhere from 1.008 to 2.5 depending purely on which scale is chosen
(`docs/final/HEALTH_MODEL_AUDIT.md` §3.2).

So the decision (D-3) is to report susceptibility-**stratified** exposure and dose rather
than a weighted index. `V2` and `V4` remain in the registry as placeholders carrying the
words "UNSOURCED" and the exact reason.

**Why this matters beyond bookkeeping.** Separating dose from exposure changed the
headline. Optimised placement reduced **exposure by 5.65%** but **inhaled dose by 12.57%**.
The mechanism is exact: better placement removes *walking* time specifically, and walking
ventilation is higher than resting ventilation. Concentration-time exposure counts a
waiting hour and a walking hour identically; inhaled dose does not. Reporting exposure
alone understates the benefit of good shelter placement by more than half
(`docs/final/HEALTH_MODEL_AUDIT.md` §2.3).

### 3.7 The inhalation rates, and the open defect in one of them

**What is implemented.** Ventilation depends only on whether the resident is walking:
**1.62 m³/h** while `EN_ROUTE`, **0.61 m³/h** while outdoors and not walking, and zero
once sheltered because arrival is the study endpoint
(`Geography/data/registry/variables.csv`, V25).

**The walking rate is confirmed against the primary source.** On 2026-08-04 the U.S. EPA
*Exposure Factors Handbook 2011*, Chapter 6, EPA/600/R-09/052F, was downloaded from
epa.gov and text-extracted rather than consulted through a secondary description. 1.62
m³/h is exactly Table 6-2's Moderate Intensity mean for ages 31 to under 41
(2.7E-02 m³/min × 60). One caveat travels with it: it is **one age-group cell, not an
adult aggregate**. The adult moderate means span 1.500 to 1.740, and an adult-weighted
moderate mean would be about 1.59 (`docs/science/D16-EFH-VENTILATION-DEFECT.md` §2).

**The resting rate is not in the source, and this is an open defect.** 0.61 m³/h would be
1.017E-02 m³/min, and **no Table 6-2 cell holds 1.0E-02 at any age or activity level**.
The Light Intensity column steps 7.6E-03, 1.1E-02, 1.2E-02, 1.3E-02, straddling the value
without touching it. A regex scan of all 96 pages for "0.61" returns only unrelated cells.
The candidate adult cells that do exist, converted to m³/h, are: Moderate 1.500 to 1.740,
**Light 0.720 to 0.780**, Sedentary/Passive 0.252 to 0.300, Sleep or Nap 0.276 to 0.318
(`docs/science/D16-EFH-VENTILATION-DEFECT.md` §3).

> **A second disagreement between repository documents, stated rather than smoothed.**
> `Geography/data/registry/variables.csv` V25 and `docs/science/BIBLIOGRAPHY.md` call 0.61
> the *resting* rate. `docs/final/HEALTH_MODEL_AUDIT.md` line 62 calls it the
> *"Light-intensity adult cell"*. Neither reading matches the table, because Light
> Intensity is 0.720 to 0.780. The D16 memo names this contradiction explicitly and lists
> resolving it as decision item 5.

**What survives the defect and what does not.** The qualitative finding survives
analytically rather than by luck: the claim is that dose falls further than exposure
because placement removes walking time, and that depends only on IR_walk being greater
than IR_rest, which holds for **every** candidate cell in the table. What does **not**
survive is any absolute dose magnitude and the published "2.7×" walk-to-rest ratio, which
would become **2.25×** under Light Intensity or **5.40×** under Sedentary/Passive. As the
memo says, the correction could move the ratio either down or up; it is not a small
monotone nudge and it cannot be waved through. Note also that the registry's own
sensitivity sweep of 0.4 to 0.8 m³/h **excludes the source's own Sedentary/Passive cells
entirely**, so the existing sweep does not bracket the source's range.

Nothing was changed and no run was invalidated. The defect is written down, its blast
radius is enumerated (V25, V50, every archived dose column, five documents quoting "2.7×",
and the browser engine's golden-identity checks keyed on the literal `0.6100`), and the
decision is left to the author. That is the correct handling of a defect found four days
before a symposium.

### 3.8 Awareness, and the assumption that bounds every headline

**A-12 says: all residents know the shelters exist and where they are.** It is registered
as `blocking` (`Geography/data/registry/assumptions.csv`). It is contradicted by the one
piece of local behavioural evidence that exists for this exact event: Hines, Leickly,
Petteni and Knowlton 2021, *Stories from the Outside: Oregon Wildfires 2020*, PSU
Homelessness Research and Action Collaborative, PDXScholar hrac_pub/27, a survey of 73
unhoused Portland-area adults about the September 2020 event, in which **nearly 65% did
not hear about emergency shelters**, giving an aware fraction of 26/73 = **0.356**
(registry V29).

Because everyone in the base model knows, **every "got inside" figure in this study is an
upper bound**. That sentence appears in the limitations of every deliverable. Phase E
replaces the assumption with the measured value, and Section 5 reports what happened.

### 3.9 The values that are declared UNSOURCED, and why declaring is better

Several parameters have no source and say so in the registry. Naming them is not an
admission of weakness; it is the mechanism that stops a fabricated citation from entering
the record.

- **V41 `lambdaOutreachPerDay`**, the rate at which outreach converts an unaware resident
  to aware. The row reads "UNSOURCED, declared assumption (A-31)", anchored only loosely to
  the same survey's finding that 75% received no information during the wildfires, because
  a real outreach-contact rate for this event does not exist in the record. It is swept
  from 0 to 0.2 per day, **including zero**.
- **V49 `pStuck`**, the probability that someone who pushes through a street blockage is
  delayed. The row says no study estimates pedestrian push-through outcomes at
  smoke-obstructed urban blockages, and the closest literatures model blockage as binary
  impassability. Swept 0.1 to 0.5.
- **V50 `stuckDelayH`**, how long that delay lasts. Hour-scale impeded-route delays are
  documented only in vehicular contexts (freeway incident durations averaging 32.95
  minutes with a tail to 18.8 hours; Hurricane Rita evacuees whose 3.5-hour trips stretched
  to 24), which brackets 1 to 6 hours as a plausible order of magnitude but is never
  pedestrian-specific. Swept 1 to 6.
- **V51 `pushThetaThreshold` and `kPush`**, the rule deciding whether a blocked resident
  pushes through or reroutes. The coefficients are unsourced, but the **aggregate** is
  disciplined: the realised push-through share is checked against a 55 to 75 percent
  "continue" band drawn from three classic fire-incident studies (Wood 1972: 26% of the
  60% who moved turned back; Bryan 1977: 29.9% of 62.7%; Jin 1997 dense irritant smoke:
  45%, 14 of 31). Every one of those anchors is indoor or tunnel fire smoke, so
  **transferability to outdoor street closures is itself registered as an assumption**
  (A-35).
- **V31 `pHeavyBelongings`** is a midpoint, and the row says so: the floor is 10.8% from
  the Ozarks 2024 unsheltered PIT (n = 138) and the ceiling is 42 to 46% from CASPEH 2023
  and Herring et al. 2020 (n = 351), no Multnomah estimate exists, so **0.284 is a declared
  assumption inside verified bounds** (A-27) and the full bracket is swept.

The mirror image of this discipline is V33, `pHasDependents`, which **is** measured
(30 unsheltered adult-plus-child households against 6,831 unsheltered adults, HUD 2025 PIT
for CoC OR-501, giving 0.0044). The registry also records, under D15, that V33's stated
provenance for the number 0.022 does not match the source as written: the Pathways report's
Table 2.1 gives "Caretaker of a child 19 (3.7%)" and Table 6.1's unsheltered column gives
4 (2.2%), which is the likely intended provenance but is not what the row says
(`docs/science/DATA_SOURCES.md` D15). That is a recorded, unresolved discrepancy rather
than a silently corrected one.

### 3.10 One correction to make about the evidence-class letters

The current, machine-enforced vocabulary is **M, L, C, A, F**, and it is enforced in Java at
`Geography/src/geography/science/ScienceRegistry.java` lines 40 to 41, whose error message
reads "evidence_class ... is not one of M, L, C, A, F", with a TypeScript twin in
`websim/pipeline/src/registry.ts`. An older vocabulary using **P for placeholder** exists,
but only in `docs/archive/AUDIT.md` line 15, a document stamped "SUPERSEDED, HISTORICAL
RECORD ONLY". In the current registry, "placeholder" migrated from being an evidence class
to being a **status** value. Anyone who has seen the letters M/L/A/C/P has seen the retired
scheme.

---

## 4. The experiments, in the order they were built, and what each one taught

This is the part of the story that is usually left out of a talk, and it is the part that
makes the rest believable. The project's first real experiment was broken. Knowing exactly
how it was broken is what makes the redesign defensible.

### 4.1 The first design, and why it had no power

The original question was about **geography**: holding everything else constant, does
*where* clean-air shelters are placed change how much smoke unsheltered residents inhale?
The design was a two-arm comparison against the September 2020 world with 2,037 residents:
arm A put the two shelters at the real Charles Jordan and Oregon Convention Center
locations, and arm B put them at two street-network nodes chosen by an optimiser
(`docs/archive/UPDATED_FINAL_RESULTS_REPORT.md` §2).

Both arms were capped at **198 beds**, which is the real historical capacity.

The result was that placement changed nothing that mattered: **−0.03%**
(`docs/final/CLAIM_VALIDATION_AUDIT.md` §1). That number was published, and then it was
retracted, because the design that produced it had no power to detect a placement effect at
all.

Here is the reasoning, in plain arithmetic. There were 2,037 people and 198 beds. Whatever
the geography, at most 198 people can be admitted, which is 9.7%. That number is fixed by
the bed count before any person takes a single step. Moving the two buildings changes who
walks how far, but it cannot change 198. The experiment held constant precisely the thing
that determined the answer, so the answer was determined in advance. The audit's own
sentence is: the earlier result was *"an artefact of a broken experiment design"*, and the
experiment *"had no power to detect a placement effect at all"*.

Two more claims went with it. "**Capacity, not placement, is the limiting factor**" was
rejected as a study claim, because it came out of a design where capacity was held at 198
in both arms and therefore *had* to dominate; a study that holds a variable constant cannot
report a finding about it (`docs/final/CLAIM_VALIDATION_AUDIT.md` §5). And a claim of
"**about 3,000 times more effective**" was dropped outright, because it was a ratio with a
near-zero denominator produced by the same broken design.

**The lesson, and it is the general one.** If you want to measure X, you must remove
whatever else can determine the outcome. Otherwise you will measure that other thing and
name it X.

### 4.2 The redesign that fixed it

The corrected two-arm design held total system capacity **equal to the population**: 2,037
spaces across two sites, in both arms. Individual sites still had finite capacity, so
shelters filled in sequence, residents were still refused at a full door, and they still
re-routed. The mechanics stayed real. The only difference between arms was two coordinate
pairs. This is registered as assumption **A-26**, and its rationale names the earlier
failure explicitly (`Geography/data/registry/assumptions.csv`).

The corrected result: identical sheltered counts (2,021.7 in both arms, 99.25%, which
confirms capacity is not binding), mean walking distance down **25.50%**, total population
exposure down **5.65%**, and total inhaled dose down **12.57%**
(`docs/final/CLAIM_VALIDATION_AUDIT.md` §1). Per-seed ranges for the two arms do not
overlap on walking distance, exposure or dose, so the effect is larger than seed-to-seed
variation in every case.

That is where the dose-versus-exposure finding of Section 3.6 came from, and it is why the
optimiser's benefit is described as a **pure travel-time effect**.

### 4.3 The move to the present day, and why the scenario letters changed meaning

The present-day study asks a different question against a different world, and it reuses
the letters A, B and C. **This is a genuine trap for anyone reading the older documents,
and it should be stated at the start of any conversation about them.**

In `docs/final/SHELTER_CAPACITY_AUDIT.md` §5 and in registry assumptions **A-24** and
**A-26**, "Scenario C" means the retired *capacity-neutral demonstration* in the two-site
2020 experiment, with total capacity set to 2,037. In every present-day document, "Scenario
C" means the 46-site, 6,842-space present-day arm. They are unrelated. The same is true of
"Scenario A", which used to mean the two real 2020 sites and now means the 36-facility 2026
inventory.

### 4.4 Scenarios A, B and C in the present day

The three arms are laid out in `docs/final/PRESENT_DAY_THREE_ARM_RESULTS.md` and in
`docs/final/TECHNICAL_REFERENCE.md` §10.

| | What it is | Facilities | Capacity | What changed |
|---|---|---|---|---|
| **A** | **Reality.** Real shelters, real locations, real bed counts. | 36 real | 2,234 | nothing |
| **B** | **More beds in the buildings we already have.** Every real site grows 3.06 times. | 36 real | 6,842 | capacity only |
| **C** | **Existing sites grow modestly (1.5 times), and the rest is built as 10 additional shelters at optimiser-chosen locations.** | 36 real + 10 new | 6,842 | same total, more doors |

**They are not three guesses. Each one answers what the previous one measured.**

A is a **measurement, not a treatment**. Its only job is to reveal which constraint actually
binds. It reported: capacity. So B relieves capacity and nothing else. B then revealed a
*second* constraint, so C spends **the identical total capacity** differently.

**Why B is exactly 6,842 and not some round number.** Setting total capacity exactly equal
to total population is what makes the experiment interpretable, because it removes scarcity
as an explanation. Whatever failure survives at exactly one space per person cannot be
blamed on there not being enough spaces. The apportionment across the 36 sites uses
**largest-remainder** allocation, implemented in `scripts/build_scenario_bc_2026.py` lines
43 to 52, so the per-site integers sum exactly to the target rather than drifting through
rounding.

**Why C never moves an existing shelter.** Every one of the 36 real facilities stays at its
real coordinates. A real shelter system cannot be picked up and set down somewhere else, so
a scenario that relocates buildings answers a question nobody can act on. C only decides
where the *new* capacity goes: the 36 existing sites grow to round(capacity × 1.5), giving
3,350, and the remaining 3,492 spaces go into 10 new sites at 350, 350 and eight at 349
(`docs/critique-response/11-ROUND5-REPORT.md`, U-03 verdict).

**How the 10 new sites are chosen.** By a **p-median** procedure, which is the standard
facility-location method: given a set of demand points and a set of candidate sites, choose
the sites that minimise the total distance from demand to its nearest chosen site. Here the
objective is to minimise the sum of network distance times residents served, plus a penalty
of 60,000 metres for every unfilled bed, and facilities are placed largest-capacity-first
with served demand decremented before the next placement
(`docs/final/TECHNICAL_REFERENCE.md` §10.3). The 88,100-node graph is thinned to at most
500 candidates by keeping one node per roughly 600-metre grid cell inside the demand
bounding box, which realises **498** candidates in the reported runs, and a full Dijkstra
tree is computed from each.

Two things about the optimiser are declared rather than hidden. First, greedy selection over
candidates does **not** carry the classic near-optimality guarantee that greedy submodular
selection enjoys, because shelter catchments overlap. The result is a *good* placement, not
a *provably near-optimal* one, and the technical reference says so in those words. Second,
the optimiser sees only encampment geography, the street graph and capacity. It does not see
per-resident outcomes, realised walking speeds, health attributes or the smoke series, so it
cannot optimise against results it has not seen.

> A note on candidate counts, because two documents give different ones.
> `docs/final/FINAL_SYSTEM_AUDIT.md` §5 says **790** candidates on a roughly 500-metre grid.
> `docs/final/TECHNICAL_REFERENCE.md` §10.3 says at most **500** on a roughly 600-metre grid,
> and `docs/final/PRESENT_DAY_THREE_ARM_RESULTS.md` says **498**. These are not in conflict:
> 790 belongs to the retired two-site optimiser (`scripts/optimize_shelters.py`) and 498
> belongs to the present-day one (`scripts/optimize_2026_placement.py`). They are easy to
> conflate because the audit document does not say which script it is describing.

**The replication protocol.** Every arm is run at nine random seeds, 42 through 50, in three
batches of three: 42/43/44, then 45/46/47, then 48/49/50. That is **27 runs**. A **seed** is
the starting number for the random number generator; changing it re-draws which encampment
each resident starts at, which attributes they get, and the order in which agents act inside
a tick. Batch parameter files are at
`Geography/batch/batch_params_2026_{A,B,C}_seed{42..50}.xml` and every run's manifest is
archived under `docs/runs/present-day-three-arm/`.

### 4.5 Scenario D, the intake rule

Scenario D keeps B's 36 sites and B's 6,842 spaces and changes exactly one thing: **each
shelter holds 10% of its spaces in reserve for residents with a mobility limitation**. No
construction, no new capacity, no new site. It exists because arm B produced a result nobody
predicted, described in Section 6, and D is the test of whether the mechanism behind that
result is what we think it is.

Reserve fractions of 0, 10, 15 and 25 percent were run
(`websim/pipeline/out/archive-bundles/`, family `scenario-d-2026`, entries `D-seed42-r00`,
`r10`, `r15`, `r25`, plus `r10`/`r15` at seeds 43 and 44).

### 4.6 The random-siting control, which is the most important control in the study

C differs from B in two ways at once: the capacity is split across **more doors**, and those
doors are at **optimiser-chosen places**. Those two ingredients have to be separated, or the
optimiser gets credit for something dispersion alone would produce.

So a control was built: draw the ten extra sites **at random** from the same 498-node
candidate pool, three independent draws, at seeds 42 to 44
(`scripts/build_scenario_crandom_2026.py` and
`scripts/build_scenario_crandom_pool_2026.py`; archived under
`docs/runs/scenario-crandom-2026/`). The pooled version reproduces C's sheltered count
**exactly, run for run**: 6,570 / 6,565 / 6,566 at seeds 42 to 44, in all three draws
(`docs/critique-response/11-ROUND5-REPORT.md`).

This control refuted the project's own preferred story. The slogan "same beds, better
placed" was retired and replaced with "same total, more doors", and the claim linter carries
an entry, `same-beds-better-placed-slogan`, with status `retired`, to keep the old wording
from creeping back into a deliverable (`docs/claims.yaml`). The figure-generation script
carries the same instruction in a code comment, so a figure label cannot silently disagree
with the text (`scripts/make_chapter_figures.py`, the `LABEL` dictionary).

### 4.7 The bed sweep, and the knife-edge finding

The last question of the A-through-D era was: how much is C's siting advantage actually
worth, denominated in beds? The sweep answers it directly. Hold arm B's real 36 sites and
scale total capacity by s times demand, at seeds 42 to 44
(`docs/runs/phaseD-bed-sweep/`; results at `docs/final/results-2026/d2_summary.md`).

| s × demand | spaces | admitted % | mobility gap (percentage points) |
|---|---|---|---|
| 0.8 | 5,474 | 73.3 | 28.3 |
| 1.0 (= arm B) | 6,842 | 91.5 | 23.5 |
| 1.05 | 7,184 | **96.0 to 96.1 (matches C)** | 14.9 |
| 1.10 | 7,526 | **99.5 (every reachable resident)** | **−0.0** |
| 1.15 | 7,868 | 99.5 | −0.0 |
| 1.20 | 8,210 | 99.5 | −0.0 |
| 1.40 | 9,579 | 99.5 | −0.0 |
| 1.60 | 10,947 | 99.5 | −0.0 |

(`docs/final/TECHNICAL_REFERENCE.md` §13.7.)

Two things fall out of that table, and both contradicted registered predictions, which is
the subject of Section 6.

**The exchange rate.** 5% surplus, meaning 342 extra spaces at the sites that already exist,
already matches C's headcount. So **C's siting advantage on headcount is worth at most about
342 beds**. And 10% surplus, 684 extra spaces, admits every reachable resident and erases
the fairness gap entirely.

**The knife edge.** Both of the study's headline findings, the equity gap and the value of
splitting capacity across more doors, are properties of the narrow band where capacity is
approximately equal to demand. They dissolve at any real surplus. That band is exactly where
a system that sizes its capacity to counted demand would sit, which is why the finding is
policy-relevant rather than a curiosity, but calling it a general law would be false.

### 4.8 The window arms, which check whether the answer depends on when you look

The dose comparison between B and C was measured over the full 312 hours. But an emergency
manager cares about the first day. So the same runs were re-measured over from-start windows
of 24, 72 and 312 hours, at seeds 42 to 44 (`docs/runs/phaseD-windows/`;
`docs/final/results-2026/d1_summary.md`).

The B-to-C mean-dose ratio moves 1.29 at 24 hours, 1.33 at 72 hours, 1.98 at 312 hours. And
walking's share of C's dose benefit moves 100%, then 83%, then **4.5%**. Short windows are
dominated by the walking difference; long windows are dominated by who is still outside at
all. The audit's episode-aligned truncation is a different construction and gives 62%, 51%
and 2.7%, and that difference is reported as a difference rather than averaged away.

---

## 5. Phase E and Scenario E: what changed, and why it was needed

### 5.1 What was missing

Everything up to this point rests on two behavioural assumptions that the project's own
evidence contradicts.

**A-12: everyone knows the shelters exist.** The local survey for this exact event says
about 65% did not.

**A-02: everyone leaves at the same instant.** Real departures are staggered by awareness,
by risk perception, by whether you have a cart of belongings you will not abandon, by
whether you have a dog that will not be admitted.

A model missing both of those cannot answer the question a county actually asks, which is
not "how many beds" but "what happens". So Phase E adds a **human decision layer**, and it
is specified before it is coded, in `docs/critique-response/E-LAYER-SPEC.md`, with the
registry rows landing before the code per the project's rule R1.

### 5.2 What the decision layer is, mechanism by mechanism

**Awareness (V29, V41).** Each resident starts `UNAWARE` with probability 1 − 0.356 and, if
unaware, shelters in place accruing exposure. The only conversion channel in scope is
outreach contact at rate `lambdaOutreachPerDay`, and in the baseline configuration that rate
is set to **zero**, deliberately. The reason is not laziness: the measured 0.356 is awareness
**during** the event, so it already embeds whatever outreach actually occurred, and modelling
additional conversion on top would double-count it
(`docs/critique-response/13-PHASE-E-PREDICTIONS.md`).

**Hazard departure (V35 to V39).** The bright-line latch is replaced by a per-agent logistic
hazard evaluated every hour:

> u_i(t) = alphaHazard + bRisk · z_R(t) + wOfficial · officialCue(t) + theta_i − c_i

- **z_R** is a dose-accumulating risk cue with exponential decay, half-life swept 12 to 72
  hours. The **form** is anchored to Castillo et al., *Mitigating wildfire smoke inside
  homes: Evidence from Oregon September 2020* (Risk Analysis, DOI 10.1111/risa.14252,
  n = 543 same-event households), which finds that protective behaviour responds to the
  **number of exposure days**, not to instantaneous concentration. The **magnitude** is
  unsourced and swept.
- **officialCue** switches on at the first shelter activation and has weight `wOfficial`,
  anchored to a pooled evacuation-order odds ratio of 4.21 (natural log 1.44) from Tanim,
  Wiernik, Reader and Hu 2022 (DOI 10.1016/j.jenvp.2021.101742), a meta-analysis of 33
  models covering 29,873 households. The mapping from a mandatory evacuation order to a
  voluntary shelter activation is explicitly assumed.
- **theta_i** is a persistent personal trait drawn from N(0, sigmaTheta²). It is what
  staggers departures. Setting sigmaTheta to zero collapses the model back to the
  deterministic cohort behaviour of the old latch, which is what makes the null test in 5.4
  possible. Its variance ratio against the risk cue is anchored 1.0 to 2.0 using the Kincade
  fire evacuation study's split between persistent-trait predictor importance (31%) and
  momentary-cue importance (21%).
- **gammaVuln (V39)** lets residents with COPD, asthma, age 65 or over, or a mobility
  limitation weight the same smoke cue more heavily. **The sign is sourced; the magnitude is
  not.** The sign anchor is Coughlan, Huber-Stearns, Clark and Deak 2022, *Oregon Wildfire
  Smoke Communications and Impacts*, Ecosystem Workforce Program Working Paper 111,
  University of Oregon and Oregon Health Authority, n = 1,200 validated responses to the same
  2020 Oregon smoke season: households with a smoke-vulnerable member were significantly
  more likely to take protective actions and more likely to have evacuated. Three caveats
  ride along in the registry row: the comparison is within one recruitment arm only, it is a
  general-household survey rather than a survey of houseless residents, and **the report's
  definition of "vulnerable" does not include mobility limitation**, so that stratum rests on
  analogy alone.
- **c_i** is the sum of barrier costs, with per-barrier anchors of 0.10 to 0.42 log-odds
  from the same Tanim meta-analysis.

**The acceptance constraint that makes this not a thermometer.** There is a hard test
attached: at maximum observed PM2.5, the high-barrier stratum must **still** show
non-departure. This comes from Wachinger, Renn, Begg and Kuhlicke 2013, *The Risk Perception
Paradox* (Risk Analysis 33(6):1049-1065). A monotone risk-only trigger, where enough smoke
eventually moves everybody, is **forbidden** by that literature, so the model is required to
fail that shape (`Geography/data/registry/variables.csv`, V40).

**Barriers (V31, V32, V33, V34).** Heavy belongings, a pet, and dependent children each add
a cost. Their mechanism is **decision latency and abandonment threshold, never a walking
speed penalty**, because load carriage does not slow self-selected walking (Bastien 2005,
recorded in `docs/science/phase2-human-agents/03-MOVEMENT.md` as a negative result).
Dependents also exclude adults-only sites from the choice set, which is a documented 2020
reality, and slow the travelling group.

**Group pace (V34).** A resident travelling with dependents walks at the group's pace, at
0.04 to 0.08 m/s slower per additional member, measured by Moussaïd, Perozo, Garnier,
Helbing and Theraulaz 2010 (DOI 10.1371/journal.pone.0010047), whose fitted lines are
v = −0.04x + 1.26 at low density and −0.08x + 1.24 at high density. The slowest-member rule
is labelled a bounding assumption. It is applied as a derived per-agent field, never by
mutating the individual's sampled speed, so the original draw stays auditable.

**The L1 information regime and the utility chooser (V42, V43).** This is the piece that
makes the model behave like a person rather than an oracle. Every archived run before Phase E
used **L0**, which means each resident selects among shelters knowing live occupancy
everywhere. That is a full-information, zero-friction upper bound and it is now relabelled as
one rather than presented as the model. **L1**, the new default for E arms, knows shelter
**locations only** and discovers that a shelter is full **on arrival**, at which point that
site joins a per-agent believed-full set and the resident re-chooses. That matches the
documented 2020 reality, in which no live-occupancy channel existed for unhoused residents.

Choice under L1 maximises

> V_j = −betaT · walkTime_j(own speed) + betaS · ln(capacity_j) − barrierPenalty_j

The two ingredients are separately justified. Impedance dominance, meaning that travel time
dominates the choice, is verified in Cheng, Wilmot and Baker 2008 on hurricane destination
choice, where the distance term carries a t-statistic of about −6 in both models and the
supply term is positive. The capacity term is **declared a modelling assumption (A-32)**:
residents are assumed to believe larger sites are likelier to admit them, and there are no
queue-avoidance estimates for shelter-seeking during smoke events to calibrate that against.

The behaviour this produces is the one the study wanted and did not hard-code: fast residents
discount rejection risk and go to the near site, while slow or high-susceptibility residents
prefer larger, less-contested sites.

### 5.3 The pet-policy correction, which is a good example of the review process working

Assumption A-29 originally justified refusing pets everywhere on the grounds that the record
is silent. An adversarial review found that this is **true of the 2020 shelters and false of
the 2026 network the E arms actually run**. The county's own 2026 inventory carries a
`pets_allowed` column for all 48 facilities, and **4 of them record admit**: Laurelwood
Center, River District Navigation Center, Walnut Park Shelter and Willamette Center, together
422 beds. The derived per-arm shelter files had dropped that column, so the model was
asserting refusal at 422 beds whose own source records admission, and **pet owners came out
at exactly 0 percent sheltered**.

The fix (`scripts/build_shelter_policy_elayer.py`, registry V45) joins the recorded policy
into a separate `_elayer` variant file selected by a switch, and **the archived per-arm files
are never edited**, so the data version tag and the archived three-arm chain stay untouched.
`petPolicyDefault` still governs only the genuinely unrecorded remainder: 3 facilities absent
from the inventory plus arm C's 10 theoretical new sites. Refusal remains the conservative
default there because 48.1% of pet owners report having been turned away over pet policy at
some point (Henwood et al. 2020).

### 5.4 The E0 null, and what a null arm proves

This is the single most important verification object in the whole Phase E build, and it is
worth understanding exactly what it does.

**The nesting requirement, called R3.** If you set awareness to 1.0, the information regime
to L0, every barrier cost to zero, and sigmaTheta to zero (which makes the departure
threshold degenerate at 55.5), then the decision layer must reproduce the archived arms A, B
and C **exactly**. Not approximately, not within seed noise: the specification demands byte
identity on the shared columns.

**Why that is the right test.** A new layer that changes results is uninformative, because
you cannot tell whether it changed them because the new mechanism is real or because you
broke something. A null arm separates those. If the degenerate configuration reproduces the
old world bit for bit, then every difference the non-degenerate configuration produces is
attributable to the mechanisms you turned on, and to nothing else.

**How it is enforced.** The master switch V44 is built so that with `enableDecisionLayer = 0`
every new code path is skipped and the legacy branches execute verbatim, so the null holds
*by construction* rather than by luck. The invariant is checked by `scripts/verify_E_runs.py`
against the archived present-day three-arm runs, and it is re-proved at each new commit before
any matrix is run. Scenario E's specification names the three shared-projection hashes that
must be unchanged: `7d1e668cae3afd95` for arm A, `188beabf9b22fc6c` for B, and
`be84bc5f1cf94bf9` for C (`docs/critique-response/14-SCENARIO-E-SPEC.md` §5). It was re-proved
at commit `2d47d2a` and again at `257017d` before the v2 matrix.

The same logic applies to the obstacle layer: with `closuresCode = 0` the blocked-edge check
short-circuits on an `isEmpty()` test, so the layer costs one boolean and **can change
nothing**. That short-circuit *is* the argument.

### 5.5 What Phase E actually did to the results

Nine baseline-real runs, arms A, C and D at seeds 42, 43, 44, all from a clean tree, with
99 of 99 invariants passing (`docs/critique-response/13-PHASE-E-PREDICTIONS.md`).

| seed | A | C | D |
|---|---|---|---|
| 42 | 1,215 | 1,215 | 1,215 |
| 43 | 1,168 | 1,168 | 1,168 |
| 44 | 1,205 | 1,206 | 1,206 |

Between-arm difference: **at most one resident.** Between-seed spread: 47.

Read that table again, because it is the headline. Under measured awareness, all three arms
give the same answer. Arm A finishes with **1,019 empty beds** and 295 door-level capacity
refusals, which means individual sites still fill while capacity stands unused elsewhere,
but every refused resident re-routes and is eventually admitted.

**The caveat that outranks everything else in Phase E, stated in the source document and
repeated here because it is the sentence most likely to be misquoted:** because only about
1,220 of 6,842 residents ever depart, system capacity never binds, so **no supply-side
intervention can register**. The correct reading is that under measured awareness the
binding constraint moves from architecture to behaviour. It is **not** that placement and
triage were shown to be ineffective.

Arm D deserves its own sentence. It records **zero** capacity refusals, so its 667 reserved
beds arbitrate nothing. ER-D is therefore **not a test of triage at all**; it is an
arm-B-capacity run with an inert intake rule, and the prediction file instructs that this be
stated wherever ER-D is reported.

### 5.6 Scenario E: the severe counterfactual

Scenario E asks what happens to the same city and the same population under a far worse
event. Every artefact is labelled a **counterfactual**, meaning a constructed "what if"
rather than anything observed (`docs/critique-response/14-SCENARIO-E-SPEC.md`).

**The severe smoke series (V46, V47).** Built by `scripts/build_smoke_severe.py` as a
labelled transform of the hash-verified observed series: every hour scaled by a constant, the
main episode stretched by whole days, and the two-spell structure preserved exactly as
observed. Version 1 uses **1.75 times**, giving a peak of 984.75 µg/m³ over 456 hours and
3,890 rows, with 19 self-checks passing, a byte-identical dialect round-trip, and a
provenance sidecar. Every value has an observed pre-image.

**Street closures (V48).** As smoke thickens, streets close to pedestrians through emergency
operations, debris and visibility. Blocked edges leave the routing graph at scheduled waves,
which forces residents already walking to choose between pushing through and rerouting, and
makes every later departure detour. The base schedule is 3 pedestrian-legal Willamette
bridges plus 15 named arterials in one wave at hour 79; the extreme schedule is 4 bridges plus
30 arterials in waves at hours 79 and 150. All use real RLIS node identifiers and exclude
freeway types exactly as the model does.

**The gate that makes closures honest.** Every generated schedule passes a connectivity check
proving that **no shelter loses all its unblocked incident edges and none is severed from its
component** (`docs/runs/scenario-e-closures/`). A closure set can therefore never manufacture
unreachability at a shelter door, which means any closure effect must show up as time and
dose rather than as access. That is what makes the Section 6 result interpretable.

**The triage reserve and pet policy** carry over from Phase E unchanged, so scenario code 20
is arm B's shelter file with a 10% reserve, running under severe conditions.

### 5.7 Why version 2 exists, and what anchors it

Version 1's 1.75 multiplier was originally justified by an analogy to the January 2025
Palisades and Eaton fires in Los Angeles. **That justification was checked against the record
on 2026-07-30 and it is false.** The Los Angeles County regulatory hourly maximum was
**301.1 µg/m³** (EPA AQS daily files, site 06-037-1103, LA North Main Street, 2025-01-08 hour
4), and no regulatory hourly monitor sat in either burn zone. The highest published near-fire
hourly average from residential low-cost sensors was 629 µg/m³ (Chen et al. 2026, npj Clean
Air 2:3, DOI 10.1038/s44407-025-00042-5). The peer-reviewed public-data synthesis reports no
hourly peak at all and a regulatory daily maximum of 101.7 (Schollaert et al. 2025, DOI
10.1021/acs.estlett.5c00486).

**The Los Angeles regulatory hourly maximum was below Portland's own observed 562.7.** The
registry row for V47 states the conclusion in capital letters: the earlier "comparable to the
Palisades worst hour" phrasing is FALSE and must never be used. The claim linter enforces the
ban across the browser codebase as well.

So version 2 was anchored properly, and the anchoring is two-tier
(`Geography/data/registry/assumptions.csv`, A-33).

**The anchor that is used: 4.436 times, giving a peak of 2,496.1 µg/m³.** That is the worst
**verified** hourly PM2.5 ever recorded over an intact, non-evacuated city: Florey station,
Canberra, on the night of 5 to 6 January 2020, computed directly from the ACT Government's
raw open-data hourly records (dataset 94a5-zqnn) and matching the official Chief Health
Officer report. Two corrections are baked into that row: the widely quoted Canberra figure of
about 5,000 is an **AQI index value, not a concentration**, and Monash station's true hourly
maximum was 1,926.0. The worst official 24-hour mean from the same event was 1,147 µg/m³ at
Monash on 1 January 2020. The multiplier is simply 2,496.1 divided by 562.7.

**The ceiling that is cited and deliberately NOT scaled to: 5,229 µg/m³.** That is an hourly
value at a Fort McMurray community site in May 2016 (Landis et al. 2018, DOI
10.1016/j.scitotenv.2017.10.008, SHARP regulatory monitors; the network-wide industrial
maximum was 6,106). It is not used because **those monitors sat inside or adjacent to the burn
perimeter of an evacuated town**, which breaks the premise of the entire study. This model is
about a population sheltering inside an intact city. A concentration measured where nobody
was sheltering is not a stress test of the same thing. So it is named as the ceiling, and the
reason for not using it is written down.

**Why no real foreign series was imported.** Importing an actual measured Canberra or Fort
McMurray series was considered and deferred, because the model's county-uniform mean would
dilute a spatially localised plume, understating the very event it was chosen to represent
(A-33).

**Version 2's closures.** Code 3, the worst-case family: 72 edges over 6 waves, with the first
wave inside hours 2 to 6. The **timing is evidence-anchored**, and the evidence is enumerated
in A-34: major-road closures began within hours of onset in every documented severe event
examined (Camp Fire lost key egress arteries roughly 2 to 3 hours after its 06:20 ignition,
NIST TN 2252; the Delta Fire closed about 45 miles of Interstate 5 the same afternoon it
started; Lahaina's Honoapiilani Highway closed from 6:20 a.m. on day one; Almeda closed
Interstate 5 the same day; the Pacific Coast Highway closed on day one of the Palisades fire),
and closures accumulated over days. Smoke alone, with no flame at the road, has closed an
interstate: Interstate 75 at Paynes Prairie at about 00:15 on 29 January 2012, a visibility
event with 11 deaths in pileups after a premature reopening.

What remains **assumed** is stated just as plainly: the numeric class weights, the wave sizes,
and the mapping of documented same-day highway closures onto pedestrian-relevant city streets.
The local-street weight is justified only by mechanism and a reporting-bias argument, and the
**bridge weight is pure assumption, because no documented wildfire river-bridge closure was
found anywhere**. That is why results are always reported as a range across independent draws
rather than from one schedule.

Realised wave hours per committed draw: r1 at {3, 44, 72, 142, 265, 303}, r2 at
{5, 92, 130, 163, 214, 263}, r3 at {2, 35, 37, 40, 75, 76}
(`docs/critique-response/13-PHASE-E-PREDICTIONS.md`).

---

## 6. Every result, what it means, and the ones that disagreed with the prediction

### 6.1 The headline table

Seed 42 is the reported run and the range across all nine seeds is in brackets. Every one of
these numbers has been verified directly against the archived run bundle
`websim/pipeline/out/archive-bundles/present-day-three-arm__{A,B,C}-seed42.json` while
writing this document, and they match `docs/final/PRESENT_DAY_THREE_ARM_RESULTS.md` exactly.

| | **A, today** | **B, bigger existing sites** | **C, same total, more doors** |
|---|---|---|---|
| Facilities | 36 | 36 | **46** |
| Total spaces | 2,234 | 6,842 | 6,842 |
| Got inside | **2,060 (30.1%)** [2,053 to 2,064] | **6,264 (91.6%)** [6,257 to 6,268] | **6,570 (96.0%)** [6,563 to 6,574] |
| Turned away | **4,754** [4,750 to 4,763] | **550** [546 to 559] | **244** [240 to 253] |
| Could reach nothing | 28 [26 to 36] | 28 | 28 |
| Spaces left empty | 174 | 578 | 272 |
| Average walk | 18,244 m | 7,896 m | 5,904 m |
| Average hours in unhealthy air | 135.8 | 17.5 | **8.7** |
| Person-hours in unhealthy air | 928,918 | 119,973 | **59,200** |
| Average smoke inhaled | 23,373 µg | 3,056 µg | **1,536 µg** |

No range overlaps between arms on any headline metric. The one exception is stated
explicitly: the "could reach nothing" count is identical across arms **by construction**,
because it depends only on the street network and the start points, not on where the shelters
are.

**A to B:** sheltered up 3.04 times, exposure down 87.3%, walking down 56.7%.
**B to C:** sheltered up 4.9%, exposure down 50.7%, walking down 25.2%, and **refusals cut by
more than half, 550 to 244**.
**A to C:** sheltered up 3.19 times, exposure down 93.7%, inhaled dose down 93.4%, walking
down 67.6%.

### 6.2 Capacity binds, and that is the first-order answer

Arm A shelters 30.1% of residents against a system holding 2,234 spaces for 6,842 people.
That ratio, 32.7%, is not a coincidence: capacity is the binding constraint. The presenter's
script is careful about the title here, and the carefulness matters. *Capacity buys the first
sixty-one points*, from 30.1% to 91.6%. What capacity alone cannot buy is the last stretch.

### 6.3 The geography failure, and the part of it that is not evidence

Under arm B the system holds exactly one space per person and **still fails 578 of them**.

That needs stating carefully, because a related observation is not evidence at all. Arm B
leaves 578 spaces empty and fails to shelter 578 people, of whom 550 were refused at a full
facility and 28 could reach no facility. Those totals are equal **by arithmetic, not by
discovery**: when capacity equals population, empty spaces must equal unsheltered people. The
near-equality proves nothing on its own (`docs/chapter/Capacity_Is_Not_Access.tex`,
§sec:geography).

**What carries weight is that anyone was refused.** Supply matched demand exactly, and 550
people were still turned away at a door. That happens because the spaces are where the
buildings are rather than where the people are.

### 6.4 The equity result, and why the direction depends on the measure

This is the finding an analysis of totals cannot produce, because an evaluation tracking only
overall access would score arm B as a near-complete success.

| Group | Share | A | B | C | D |
|---|---|---|---|---|---|
| Everyone | 100.0% | 30.1 | 91.6 | 96.0 | 91.6 |
| Walks without difficulty | 80.1% | 32.6 | 96.3 | 98.5 | 91.5 |
| **Mobility limitation** | **19.9%** | **20.1** | **72.6** | **86.0** | **91.9** |
| Age 65 and over | 5.2% | 22.4 | 81.6 | 90.1 | 80.7 |
| COPD | 10.8% | 22.6 | 87.3 | 95.1 | 84.4 |
| Asthma | 14.8% | 29.3 | 91.1 | 95.8 | 91.2 |
| Chronic physical condition | 39.6% | 30.1 | 91.0 | 95.7 | 91.6 |
| Male | 68.6% | 30.1 | 92.0 | 96.0 | 92.5 |
| Female | 29.2% | 30.1 | 90.5 | 96.1 | 89.4 |
| Other / not stated | 2.2% | 30.7 | 90.0 | 95.3 | 92.7 |

(`docs/chapter/Capacity_Is_Not_Access.tex`, Table tab:groups; group shares and sheltered
shares independently confirmed against the archive bundles' `stratified_exposure` blocks.)

**The headline sentence, and the number that goes with it.** On a percentage-point scale,
capacity expansion **widens** the gap between residents who walk easily and residents who do
not, from **12.5** points in A to **23.7** points in B, and dispersion returns it to **12.5**
in C.

> **A note on which numbers you will see quoted, because the repository contains two sets.**
> Several documents in `docs/critique-response/` quote the gap as **13.0 → 24.5 → 12.9** and
> arm D's gap as **0.1**. Those are the **pre-U-27** values, computed before the freeway
> correction described in Section 9, and they survive in
> `docs/critique-response/06-equity-scales.md` and `08-scenario-D.md` as historical record of
> what the critique was answering. The current, corrected-graph values are **12.5 → 23.7 →
> 12.5** with arm D at about zero. The claim linter carries a retired entry,
> `pre-correction-gap-values`, specifically to keep the old numbers out of the published
> deliverables (`docs/claims.yaml`). If someone quotes 24.5 at you, ask which graph. Note
> also that 24.5 **does** legitimately reappear post-correction as **seed 43's** arm-B gap,
> which is a coincidence worth being ready for.

**A second, smaller inconsistency worth knowing about.** Arm D's gap is reported as **−0.5**
in `docs/final/PRESENT_DAY_THREE_ARM_RESULTS.md` and as **−0.4** in the chapter table and the
symposium deck (91.5 minus 91.9). Both are correct; they differ because one is computed at
full precision and the other is the difference of two figures already rounded to one decimal.
The figure script documents this rounding rule in a comment, precisely so a figure and a table
cannot print two different gaps for the same thing (`scripts/make_chapter_figures.py`,
`fig_equity`).

**Why the direction depends on the measure, and why three measures are reported.** The chapter
reports the gap three ways rather than one.

| Measure | A: today | B: more capacity | C: more doors |
|---|---|---|---|
| Access, walks without difficulty | 32.6% | 96.3% | 98.5% |
| Access, mobility limitation | 20.1% | 72.6% | 86.0% |
| Difference in percentage points | 12.5 | **23.7** | 12.5 |
| Ratio of access rates | 1.62 | 1.33 | **1.15** |
| Mobility-limited residents left outside | 1,087 | 373 | **190** |
| Their share of all left outside | 23% | 65% | 70% |

On the percentage-point scale the gap widens then returns. On the **ratio** scale it narrows
at every step. Counting **people**, the number left outside falls at every step. The reason
they disagree is a **ceiling effect**: at 96.3% access, residents who walk without difficulty
have almost no room left to improve, so a percentage-point difference is compressed on one
side of the comparison and not the other.

Reporting the percentage-point gap alone would present as widening inequality what is, on
other defensible scales, a narrowing one. The chapter then holds itself to its own standard:
it rejected a published parameter partly because the same data yield different values
depending on the scale chosen, so the same standard applies to its own results.

**Three statements survive every measure, and those are the equity findings claimed.** First,
every scenario improves absolute access for residents with mobility limitations, from 20.1%
to 72.6% to 86.0%; capacity expansion is not harmful to this group. Second, residents with
mobility limitations remain the worst-served group under every siting scenario and are
increasingly over-represented among those still outside: 19.9% of the population but 23% of
those left outside today, 65% under capacity expansion, 70% under dispersion. As the system
improves in aggregate, the people who remain outside are increasingly the people who cannot
walk fast, and that follows directly from first-come-first-served admission. Third, **the
intake rule, not siting, is what closes the gap**.

### 6.5 Scenario D, and the mechanism check that makes it believable

Reserving 10% of each facility's spaces for mobility-limited arrivals moves that group from
72.6% to 91.9%, which is **above** the unimpaired rate of 91.5%, at total admissions identical
to B's and at zero capital cost.

The reason it works is visible in the mechanism. A survival analysis of arrival times shows
that in arm B roughly **80% of the final mobility gap already exists one hour after
departure** (`docs/chapter/Capacity_Is_Not_Access.tex`, Fig. fig:race). The gap is a race, so
any rule that must be won by arrival order will be won by the fast. Under D, the race is
simply switched off for the reserved spaces.

Larger reserves overshoot. At 15% the reserve strands beds, admissions fall to 6,087 at seed
42, and the gap over-corrects to −13.3 points
(`docs/final/PRESENT_DAY_THREE_ARM_RESULTS.md`). That is a real finding about policy design:
the reserve has a right size, and it is not "more".

### 6.6 The registered predictions, and the ones that were wrong

Before running the Phase D sweeps, thirteen directional predictions were registered in a
committed file (`docs/critique-response/12-PHASE-D-PREDICTIONS.md`), with the git commit
serving as the timestamp. Ten hit. Here are the misses, which are reported because
**registered predictions mean nothing if only the hits are published**.

**P-3c: MISS.** We predicted that arm B would not match arm C's 96.0% access until capacity
reached 1.4 to 1.6 times demand. It crosses at **1.05 times** and, at 1.2 times, *exceeds* C.
Modest surplus beats optimal splitting on headcount.

**P-3d: MISS.** We predicted the mobility equity gap would persist under capacity surplus. It
does not. It **vanishes entirely** at 1.10 times demand and stays gone. The "capacity
expansion widens the equity gap" finding is therefore a property of the scarcity band where
capacity is approximately equal to demand, and not a general law.

**P-1f: PARTIAL MISS.** We predicted travel medians would move by no more than 2% on the
corrected street graph. Eight of 54 runs exceeded that, with a maximum of +3.2%, concentrated
in arm C, whose new sites sit where routing changed most.

**Why the misses made the answer better rather than worse.** Both P-3c and P-3d weakened the
placement story and simplified the policy claim. The honest synthesis every deliverable now
carries is: capacity is first-order; at the knife edge where capacity equals demand the intake
rule closes the equity gap at zero cost; dispersion buys headcount without needing an
optimiser; and surplus dissolves the failure mode entirely. Or, compressed: **buy surplus if
you can; where you cannot, the triage reserve buys the same equity for free.**

### 6.7 A retraction, and why it is in the permanent record

At one point the project described a regression coefficient as the machine-learning model
*discovering* the triage reserve rule, with an odds ratio of about 123. That was retracted.
The forensics are in `docs/final/results-2026/ML_MODEL_SUMMARY.md`: the **marginal** mobility
odds ratio in arm D is **0.95 to 1.07 pooled**, which is to say the gap is simply gone rather
than large. The conditional-on-speed coefficient is the logistic model recovering the
admission rule that was written by hand, which is a pipeline sanity check and not a discovery,
and its magnitude sits on **regional quasi-separation**, meaning three speed-band cells sit at
exactly 100% access (n = 958, 597 and 304), so no point value is quotable at all. The claim
linter carries entry `or-123-rule-recovery` to block the discovery framing structurally
(`docs/claims.yaml`).

### 6.8 Phase E results: the constraint moves

Covered in 5.5 and repeated here for the results ledger: under measured awareness, sheltered
counts collapse to about 1,215 at seed 42 in every arm, arm A stops being capacity-bound and
finishes with 1,019 empty beds, and the between-arm difference is at most one resident against
a between-seed spread of 47.

The registered Phase E predictions scored as follows
(`docs/critique-response/13-PHASE-E-PREDICTIONS.md`):

- **P-E1, MISS on magnitude, CONFIRMED on mechanism.** We predicted 10 to 15% sheltered;
  observed 15.9% before the pet correction and 17.8% after it. An appended correction, added
  after the runs and never editing the original, records exactly why the arithmetic behind the
  registered intercept was wrong: it under-counted evaluable hours (with the 2026 network every
  shelter is open from tick 0, so the official cue is on from the first hour) and treated the
  risk cue as a constant when it keeps accumulating through a 188-hour episode.
- **P-E2, CONFIRMED more strongly than stated.** The gap between arms A and C does not merely
  compress, it disappears.
- **P-E3, CONFIRMED.** 22.1% of departures occur before hour 79, with the mass aligned to the
  main episode, exactly as the two-spell structure predicted.
- **P-E4, CONFIRMED via its disconfirmation clause.** The mobility gap does not shrink, it
  **inverts**: 17.0% for limited residents against 15.7% for unimpaired ones. The clause "if
  D's effect vanishes entirely, that is a reportable disconfirmation" was registered in
  advance, and that is what happened.
- **P-E5, CONFIRMED.** Sheltered share was 19.1% with no barriers, 11.5% with one, and
  **0.0% with two or more**. The Wachinger constraint holds in every run: about 87% of
  high-barrier residents never depart even at peak PM2.5, so the model is demonstrably not a
  monotone risk-only trigger.
- **P-E6, CONFIRMED.** Asthma shows no gait-speed or dose difference (absolute speed difference
  0.004 m/s, dose z-score 0.70); any asthma signal is confined to departure timing.

### 6.9 Scenario E results, including the measure-zero finding

Eighteen runs at 455 hours, all clean-tree, with 387 of 387 checks passing in
`scripts/verify_E_runs.py --se` and zero out-of-range smoke lookups everywhere. Sheltered
counts, severe arms by seed: E18 1,252/1,223/1,247; E19 1,257/1,226/1,252; E20
1,257/1,225/1,252. Between-arm difference is at most 5 against a between-seed spread of about
29.

- **P-SE1, MISS on the band, CONFIRMED on mechanism.** We registered that the attempt share
  among aware residents would rise into 0.55 to 0.75. It rose at every seed but stopped about
  0.03 above the baseline. **The logistic squashes the larger risk cue, so multiplying
  concentration by 1.75 multiplies dose, not departures.** The mechanism claims all held.
- **P-SE2, CONFIRMED decisively.** Mean dose per capita is **2.74 to 2.75 times** the baseline
  against a 1.75 times concentration transform. The stretched episode and the never-departing
  majority carry the difference.
- **P-SE3, split verdict.** The sheltered-equality clause was confirmed. The cost-channel
  clause was **not evaluable, because the stratum it names is empty** (see P-SE5). Two adjacent
  observations are reported without being scored: population mean dose differs from the
  closure-free controls by less than 5 µg per capita, and the closure arms show consistently
  **fewer** capacity refusals than their controls (291 against 347, 229 against 259, 244
  against 271), because the recomputed routing spreads arrivals away from the small central
  sites that fill first. **A closure schedule redistributed where refusals happen without
  changing who gets in.**
- **P-SE4, CONFIRMED.** Arm 20 records zero capacity refusals at every seed; its 371/314/359
  refusals are all pet or adults-only policy bounces.
- **P-SE5, NOT EVALUABLE, and the emptiness is the finding.** **Zero blockage events in all
  nine closure runs.** The arithmetic is simple and it is the interesting part: departures
  spread over roughly 455 hours at 3 to 8 per hour while the median walk lasts 24 minutes
  (90th percentile 107 minutes), so about **four** of 6,842 residents are mid-walk at any wave
  instant, and none of their routes crossed the 18 closed edges. Stated plainly: **under
  hazard-staggered departure, street closures act through geometry, meaning detours and
  redistribution, not through face-to-face blockage gambles.** The push-versus-reroute
  machinery is implemented, proven inert under R3, and census-verified, and it is starved of
  subjects in any realistic staggered regime, because maximum concurrent walkers is roughly
  departure rate times walk duration and that stays in single digits.
- **P-SE6, CONFIRMED.** The gap in hours-above-unhealthy between never-sheltered and sheltered
  residents widened to 1.96, 1.97 and 2.02 times the baseline gap, above the 1.75 transform at
  every seed. The never-sheltered stratum saturates the entire 306 unhealthy hours of the
  severe series.

### 6.10 Scenario E version 2 results, at the worst verified severity on record

Twenty-four runs, all clean-tree, 546 of 546 checks passing, peak 2,496.1 everywhere, with R3
re-proved at that commit before the matrix ran.

- **P-SE7, CONFIRMED.** Mean dose 204,368 to 205,991 µg across every run, inside the
  registered band around 207,000, and 6.87 to 6.94 times the baseline. Dose tracks the
  concentration anchor linearly through the never-departing majority.
- **P-SE8, CONFIRMED.** Attempt share among the aware rose at every seed and stayed below
  0.60; sheltered share peaked at **19.2%** against the 35.6% awareness ceiling. **Even the
  worst verified urban smoke hour on record moves departure by about 2 percentage points.**
- **P-SE9, CONFIRMED on the ceiling and the mechanism; one sub-clause did not materialise.**
  Blockage events were **zero in all fifteen closure runs**. That is inside the registered
  ceiling and exactly zero for draw r3 as registered, but draws r1 and r2 did not "record the
  matrix's only events": there were none anywhere. The registered single-digit-per-wave
  concurrency estimate was itself an overestimate. With about four concurrent walkers and 72
  closed edges among roughly 110,000, the expected event count per run is of order one, and
  zero across 15 runs says it is below that. **The face-to-face gamble is a measure-zero event
  at any documented severity.**
- **P-SE10, MISS as registered, and the miss is the finding.** We registered that the closure
  arms would record fewer capacity refusals than their controls at every seed. That holds for
  draws r2 and r3 but **reverses for r1 at seeds 42 and 44**. The redistribution signature is
  real but **draw-dependent**: which streets close determines whether arrivals spread away from
  or pile into the small sites that fill first. This is precisely what the range-across-draws
  protocol (A-34) exists to expose. **A single-schedule design would have reported whichever
  sign its one draw happened to produce**, with no way to know.
- **P-SE11, CONFIRMED decisively.** Sheltered counts across draws vary by at most 2 residents
  (1307/1307/1309; 1272/1271/1271; 1301/1302/1301), because the connectivity gates guarantee no
  severance, while capacity refusals swing by more than 100 across draws at the same seed
  (443/406/327).

**The bounded headline.** At the worst verified urban wildfire-smoke severity on record, with
72 early, evidence-timed street closures, the model's structure holds: awareness still caps
arrival at about 19% sheltered, severity multiplies the dose of the unsheltered by about 6.9
times, placement and triage remain inert for who gets in, and closures act through silent
detours whose refusal-pattern consequences depend on the specific draw. **Every Scenario E
magnitude is a labelled counterfactual and must never be quoted as an observed quantity.**

### 6.11 The calibration bracket, which bounds every absolute number

There is exactly one observed occupancy record to check the model against: Street Roots,
2020-09-16, reporting approximately 90 occupants at the Oregon Convention Center and 40 at
Charles Jordan, about 130 of 198 beds. The historical reference configuration fills **198 of
198** at both sites.

Per site, that is roughly 1.1 times observed at the Convention Center, which is
right-censored because 99 is the cap, and roughly 2.5 times at Charles Jordan. Because the
record is approximate, the honest statement is a censored bracket: **the model over-admits by
1.5 to 15.6 times, of which 1.52 is only the uncensored lower edge**
(`docs/final/TECHNICAL_REFERENCE.md` §13.6). The direction is attributed to A-12, universal
awareness, against local survey evidence that 65% of unsheltered residents had never heard of
the shelters.

Consequently the required wording is fixed and used everywhere: *"splitting the same capacity
across more sites improves outcomes under the modelled assumptions"*, and **never**
*"recreates what actually happened"*.

<!--PART3-->

