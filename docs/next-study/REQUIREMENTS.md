# Commissioning brief — the 8 requirements, 10 deliverables, and 7-chunk plan

Verbatim record of the request that commissioned the audit (2026-08-21, session `b6742ec7`).
Recovered from the session transcript after the working scratchpad was cleared.

---

```text
Use my installed Claude Code tooling aggressively for this task.

Before doing substantial work, inspect and use the relevant installed skills, agents, plugins, MCPs, and workflows available in this environment. In particular, use the Superpowers skills/agents where applicable, plus ECC and any other installed research, coding, testing, browser, data-analysis, or planning capabilities that materially improve the work.

Do not blindly invoke every agent. Choose the most appropriate specialized agents/skills for each phase and delegate independent work when that is supported.

Use parallel/subagent work where it genuinely saves time, especially for:

auditing the existing manuscript/code/data
literature/methodology research
statistical methodology
spatial/GIS methodology
validation design
uncertainty/sensitivity analysis
reproducibility/testing
manuscript review

Before implementation, inspect the available skills/agents and explain which ones you intend to use and why.

Do not fabricate empirical data. Clearly distinguish existing evidence, newly obtainable data, assumptions, proposed analyses, and unavailable information. Before beginning the research task, inspect the installed skills, custom agents, plugins, and MCP tools.

Identify the best available capabilities for:
1. research/literature review
2. statistical modeling
3. spatial/GIS analysis
4. Python/data analysis
5. experiment/validation design
6. uncertainty/sensitivity analysis
7. code implementation
8. testing/verification
9. manuscript/academic writing
10. browser/web research

Then create a work plan that assigns the appropriate skill/agent to each task. Use parallel delegation where tasks are independent.

Do not invoke irrelevant agents just to increase agent count.1. Obtain independent shelter-use observations

The current manuscript contains one limited comparison: approximately 130 observed occupants versus 198 produced by the structural model. That 1.52× difference is not sufficient validation.
A credible next study should collect, across multiple shelters and smoke periods:

Hourly shelter capacity and occupancy
Arrival and departure times
Turnaways and reasons for refusal
Transportation requests and completed trips
Outreach contacts and communication timing
Whether residents knew the shelter existed
Origin area, recorded at a privacy-protecting spatial resolution
Mobility limitations and other relevant access barriers
Opening hours, staffing interruptions, and temporary closures

The model should be finalized using one period and tested—without changing parameters—on a later smoke period. Validation on the same event used to develop the model is not enough.

2. Estimate the behavioral coefficients locally

The awareness, departure, barrier, and destination-choice coefficients currently rely substantially on transferred literature values. These values may be reasonable for scenario construction, but they cannot support strong empirical conclusions about Portland’s unsheltered population.
You need local observations or survey data to estimate:

Probability of receiving shelter information
Effect of an outreach contact on departure
Response to smoke severity
Sensitivity to walking time
Effects of mobility limitations, pets, belongings, trust, identification requirements, and transportation
Probability of choosing one shelter over another

A hierarchical discrete-choice or time-to-departure model would be appropriate. Estimate it on a training sample and evaluate calibration and predictive error on a held-out sample.
If local estimation is not feasible, the manuscript must consistently describe these results as scenario-conditioned projections, not empirical estimates of behavior.

3. Establish the effect of awareness convincingly

The title implies that awareness changes realized access. A top empirical journal will ask whether that relationship is identified or merely assumed.
The strongest options are:

A randomized or phased outreach intervention conducted ethically with service providers
A randomized-encouragement design during a preparedness exercise
A natural experiment involving staggered communications
A strong quasi-experimental design using outreach timing or geographic boundaries

At minimum, record the exact timing of outreach, awareness, departure, and arrival. Otherwise, narrow the claim to: “Modeled shelter use is sensitive to assumed awareness.”

4. Conduct genuine out-of-sample spatial validation

The reported 63.1% walking-distance reduction is currently an in-sample optimization result. Candidate sites were optimized and evaluated on the same demand surface, making this an upper-bound estimate.
For IJGIS, you should:

Estimate demand using an earlier spatial period
Select candidate sites without seeing the holdout data
Evaluate them against a later spatial period
Use spatially blocked cross-validation
Quantify uncertainty in campsite locations
Compare against current facilities, random sites, capacity-only placement, conventional p-median methods, and at least one equity-oriented baseline
Report whether the proposed method consistently improves results across holdouts

Ideally, demonstrate transferability in a second city. For IJGIS, a Portland-only paper could still work if the methodological contribution is genuinely new and rigorously validated. For ERL, a second city or several independent wildfire-smoke events would be much more important.

5. Replace hypothetical nodes with feasible facilities

Scenario C selects street-network nodes, not necessarily usable buildings. That prevents the siting findings from functioning as an implementable policy result.
Build a verified candidate-facility dataset containing:

Existing building or parcel
Legally usable floor area
Realistic occupancy limit
Filtration or clean-air performance
Accessibility and restroom availability
Staffing requirements
Ownership and availability
Opening time and deployment delay
Transportation access
Capital and operating costs
Relevant restrictions involving pets, belongings, or service populations

Do not treat proportional increases such as 175 to 536 beds as physically feasible unless the building, staff, sanitation, and filtration requirements support that increase.
The optimization should then report a cost–access–equity frontier rather than only the mathematically optimal geography.

6. Use a spatially resolved smoke-exposure surface

A countywide uniform PM₂.₅ value eliminates the environmental geography of the problem. This is particularly limiting for ERL.
Construct hourly spatial exposure surfaces using combinations of:

Regulatory monitors
Calibrated low-cost sensors
Satellite or modeled smoke products
Meteorological conditions
Indoor shelter PM₂.₅ measurements

Then estimate reductions in time-weighted exposure attributable to outreach, transportation, capacity, and siting. Avoid presenting inhaled dose unless ventilation rates and indoor infiltration are defensibly measured or bounded.

7. Add global uncertainty and sensitivity analysis

Seed stability demonstrates computational repeatability; it does not establish scientific robustness.
Propagate uncertainty in:

Population locations and counts
Network completeness
Walking speed and mobility
Behavioral coefficients
Facility capacity and availability
Outreach reach
Smoke concentration
Indoor filtration
Candidate-site feasibility

Use a global approach such as Morris screening, Latin-hypercube sampling, or Sobol indices. The central question should be: Does the conclusion that awareness dominates capacity remain true across defensible joint uncertainty ranges?

8. Demonstrate broader significance

For ERL, the paper needs a conclusion that matters beyond Portland—for example:

Across multiple cities and wildfire-smoke events, adding nominal shelter capacity produced little benefit when communication and transportation constraints remained unresolved.

That conclusion would need multi-event or multi-city evidence. A single Portland simulation, however polished, is unlikely to satisfy ERL’s stated requirement for city-scale studies to demonstrate broader significance.

A credible minimum next study

This is not a formal journal requirement, but it would be a defensible design:

Collect operational data from several shelters over at least two independent smoke episodes or comparable exercises.
Measure outreach, awareness, transportation, arrivals, refusals, occupancy, and indoor/outdoor PM₂.₅.
Estimate behavioral parameters using the first episode.
Freeze the model and preregister the validation analysis.
Test predictions on the second episode using temporal and spatial holdouts.
Evaluate only verified, operationally feasible candidate facilities.
Compare the proposed method with simple and established spatial baselines.
Release reproducible code, documentation, derived non-sensitive data, and a permanent archive.
For ERL, add a second city or a multi-event national analysis.

Primary validation outcomes should include site-hour occupancy error, arrival-time error, refusal-count error, departure-probability calibration, accessibility error by mobility group, and uncertainty in the estimated intervention effects. Treat the requirements above as the acceptance criteria for the next study/manuscript revision.

First, perform a comprehensive audit of the existing project/manuscript/data/code against every requirement.

Do not modify files yet.

Produce:

What already exists and is defensible.
What is missing.
What can be implemented with existing data.
What requires new empirical data.
What requires external data acquisition.
What claims in the manuscript currently exceed the evidence.
A concrete implementation plan ordered by scientific importance and dependency.
Specific statistical/spatial methods for each missing component.
A validation protocol with train/holdout separation.
A list of outputs/tables/figures that the final paper should contain.

Do not fabricate observations, shelter records, PM2.5 measurements, behavioral coefficients, facility characteristics, or validation results. Clearly distinguish real existing data from proposed future data.

After the audit, summerize into small pararaph and then continue! tackle something like:

Chunk 1 — audit + methodology architecture

existing code/data
current manuscript claims
current model
identify gaps
design train/validation split
define outcome metrics

Then:

Chunk 2 — behavioral model

awareness
departure
destination choice
transportation
barriers
hierarchical/discrete-choice/time-to-event formulation
calibration/held-out validation

Then:

Chunk 3 — spatial validation

spatial blocking
candidate-site optimization
holdout demand surface
baselines
uncertainty

Then:

Chunk 4 — facility feasibility

candidate facility schema
capacity
filtration
accessibility
staffing
cost
deployment constraints

Then:

Chunk 5 — smoke exposure

hourly PM₂.₅ surface
indoor/outdoor measurements
exposure calculation
uncertainty

Then:

Chunk 6 — global sensitivity

Latin hypercube/Morris/Sobol
parameter distributions
interaction effects
test whether "awareness dominates capacity" survives uncertainty

Then:

Chunk 7 — manuscript

rewrite claims
methods
results
limitations
figures/tables
reproducibility package
```
