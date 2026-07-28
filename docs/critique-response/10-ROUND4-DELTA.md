# ROUND-4 DELTA CRITIQUE — NEW MATERIAL ONLY
Project: "More beds, or better beds?" (Repast Simphony, commit c0cd113)
Date: 2026-07-28 · Basis: presentation PDF + arithmetic verification (this session) + public record retrieved 2026-07-28

## Handling instructions for the downstream agent
1. This file contains ONLY findings not present in critique rounds 1–3. Do not re-derive, re-open, or re-apply prior-round items from this file; they remain in force as written.
2. Items tagged `[EXT:<topic>]` AMEND a prior-round item. Apply only the delta stated here.
3. Every item carries: SEVERITY (BLOCKER / MAJOR / MINOR) · TYPE (BUG / SPEC-GAP / EXTERNAL / REPORTING / DESIGN / PROCESS) · EVIDENCE · FIX (imperative) · ACCEPT (test that closes the item).
4. The repository was NOT provided this round. Items requiring code access are marked `BLOCKED-ON-REPO`. Minimum unblock set: placement-algorithm source + objective spec; the 28-variable/26-assumption registry; one full per-agent output CSV (seed 42, any arm); scenario config files for A/B/C; full `GisAgent.java` and `StreetNetwork.java`.
5. Companion script: `verify_round4.py`. Section A executes standalone and reproduces every computation cited below. Section B contains repo-dependent assertions to wire up.

---

## SECTION 1 — DEFECTS FOUND BY DIRECT COMPUTATION (verified this session)

### U-01 · MAJOR · BUG — Mobility-gradient calibration does not pin the 19.2% marginal
EVIDENCE. Stated constants: P(limited | <55) = 0.1522, P(limited | 55+) = 0.3478, claimed to hold the marginal "exact" at 19.2%. Under the model's own age sampling (bands 52.7/42.3/5.0, uniform integer ages within band), P(55+) = 0.2615 (or 0.2504 under the alternate band-edge convention). Implied marginal: **20.33%** (alt: 20.12%) — not 19.2%. The stated constants yield 19.2% only if P(55+) = 20.35%, i.e. they were almost certainly solved against the source (California) study's age structure rather than the model's. Corroboration: the doc's own realized value (19.9%) lies 0.89 SE from the implied 20.33% and 1.47 SE from the 19.2% target (SE = 0.49pp at n = 6,842). Expected excess impaired agents vs target: ~78 per run.
FIX. Recompute the conditionals preserving the borrowed ratio r = 2.2852 but pinning under the model's own P(55+) = 0.2615: **P(<55) = 0.14371, P(55+) = 0.32839**. Put the derivation (including which population's age structure the pin uses) in the registry entry. If the marginal is a "lower bound" (doc's words), sweep it upward instead of pinning.
ACCEPT. Across all 9 seeds, mean realized mobility prevalence within 2 SE of 0.192 (post-fix). Diagnostic branch: if pre-fix realized prevalence across seeds averages ~0.201–0.203, code matches doc and the doc's constants are the bug; if it averages ~0.192, code differs from doc and the doc misreports the constants — fix whichever artifact is wrong and say which.

### U-02 · MAJOR · REPORTING/BUG · [EXT: speed-validation stratification] — The 1.300–1.376 m/s "realized speeds" are arithmetically impossible for the full population
EVIDENCE (new computation; prior round flagged only the apples-to-oranges framing). If the realized range includes the 19.9% impaired stratum at mean 0.95 m/s, the implied free-walker mean is 1.387–1.482 and the implied base (pre-COPD-decrement) mean is **1.407–1.502 m/s**. The Bohannon-2011-weighted base mean for this population's age/sex mix is ≈ **1.376 m/s**. The upper end (1.502) exceeds every plausible weighting; the reported band's ceiling equals the free-walker-only expectation almost exactly. Conclusion: T1–T5 realized speeds were measured on free walkers (likely the 50-agent routing cohort), and the sentence claiming population-level validation is false as written.
FIX. Log realized speed mean/SD/min/p5/p50 PER STRATUM (free, mobility-limited, COPD-only) into every run manifest. Rewrite the validation sentence to state exactly which agents T1–T5 covered. Validate free walkers against Bohannon 2011, impaired against Boyce N(0.95, 0.32), COPD-only against base − 0.19, separately.
ACCEPT. Manifest contains per-stratum realized speed stats for all 27 runs; each stratum sits within its own source bounds; no cross-stratum claim remains in prose.

### U-03 · MINOR · SPEC-GAP — Bed apportionment is undefined and there is no bed-sum invariant
EVIDENCE. C: 6,842 − 1.5×2,234 = 3,491 across ten sites = **349.1 beds/site** (non-integer). B: per-facility 3.062668× of integer capacities cannot round to a 6,842 sum without an apportionment rule. The invariant table asserts 6,842 exported *resident* records, never 6,842 *beds*. The claim "hold system capacity at exactly 6,842" is currently unverifiable.
FIX. Implement largest-remainder apportionment for both arms; document it. Add invariant: Σ capacities == 6,842 for arms B and C, == 2,234 for A, checked per run.
ACCEPT. New invariant passes 27/27; apportionment rule stated in methods.

### U-04 · MAJOR · SPEC-GAP — `truncatedNormal` is unspecified, and its left tail is the equity residual
EVIDENCE. Under untruncated N(0.95, 0.32): ~2 impaired agents/run below 0 m/s, ~13 below 0.2 m/s, ~29 below 0.3 m/s (of 1,361). At 0.2 m/s a 5 km walk takes 6.9 h. The slowest tail is precisely the population that fails in B and C, so the truncation bound and method (rejection vs clamp) directly set the headline equity residuals. Clamping creates a point mass of identical slowest agents; rejection shifts the mean. Neither bound nor method nor `SPEED_MIN_MPS`'s value appears anywhere.
FIX. Specify bounds [a, b] and method; use rejection sampling; report `SPEED_MIN_MPS`; log realized min and p1 per stratum in the manifest; add the lower bound to the sweep registry with a range (e.g., 0.1–0.4 m/s) and RUN the sweep.
ACCEPT. Spec in methods; manifest fields present; sweep results reported with effect on C's 85.7% impaired-access figure.

### U-05 · MAJOR · BUG-RISK · BLOCKED-ON-REPO — `freeSpeedMean(age, sex)` is undefined for sex = 'other' (2.3% ≈ 157 agents)
EVIDENCE. Bohannon 2011 publishes male/female means only. The sampler draws a third category; the speed function's behavior for it (exception? silent default to male? average?) is unspecified and affects ~157 agents/run.
FIX. Define the mapping explicitly (population-weighted M/F average is defensible); document; add a unit test covering all sex values.
ACCEPT. Unit test passes; mapping stated in methods; realized 'other'-stratum speeds logged.

### U-06 · MINOR · SPEC-GAP — 65+ band's upper bound and out-of-range speed lookup are unreported
EVIDENCE. `band.lowInclusive + nextInt(high − low)` requires a highExclusive for 65+; unreported. Bohannon decade means end in the 70s; any sampled age ≥ 80 makes `freeSpeedMean` a silent extrapolation.
FIX. Report AGE_MAX; clamp lookups to the last published decade and say so.
ACCEPT. AGE_MAX in registry; clamp documented; no lookup beyond published decades.

### U-07 · MINOR · REPORTING — "Counted as more vulnerable: 71.1%" is not reproducible from the listed strata, and one sampled attribute is dead
EVIDENCE. Union of mobility (19.9) ∪ 65+ (5.2) ∪ COPD (10.8) ∪ asthma (14.8) ∪ chronic (39.6) under independence = **65.1%**; positive correlation lowers it further. 71.1% therefore uses unlisted membership criteria. Separately, `chronic physical condition` (39.6%) is sampled, tabled, and consumed by nothing — no speed effect, no outcome stratum.
FIX. Publish the exact membership predicate for "more vulnerable" (or drop the row). Either report a chronic-condition outcome stratum or mark the attribute fidelity-only in methods.
ACCEPT. Predicate reproduces 71.1% from the per-agent CSV; chronic attribute's status stated.

---

## SECTION 2 — THE DOCUMENTED SEPTEMBER 2020 RECORD vs THE MODEL
All sources retrieved 2026-07-28. These items convert prior hypotheses into sourced facts or add new ones; treat sourced facts as ground truth for the historical reference configuration.

Key sources:
- S1: Multnomah County JOHS daily releases, Sept 13–18, 2020 (multco.us) — OCC opened Thu Sept 10; Charles Jordan opened Fri Sept 11; a third site (Mt Scott CC) opened the night of Sept 11 and was shifted to standby; "call 211 first to see where space is available and to arrange transportation"; COVID protocols incl. distancing; "roughly 1,400 beds available year-round."
- S2: Street Roots, "Portland's houseless face health risks amidst toxic air…" (pub. Sept 16, 2020; streetroots.org) — two smoke shelters at **99 beds each**; Tuesday night (Sept 15) occupancy **~40 at Charles Jordan, ~90 at OCC**; JOHS spokesperson attributes low uptake to possessions/decision inertia ("they have their things with them… toughing it out"); 2019 PIT ≈ **2,000+ unsheltered** in Multnomah; 211 logged **21** clean-air-shelter calls on Sept 15; shelters were **adults-only**, families routed to existing shelters.
- S3: PSU HRAC, 2025 Tri-County PITC (pdx.edu; report pub. 2025-11-04) — regional total **12,034**; Multnomah up ~67% from 6,297 (→ ~10.5k, consistent with the doc's 10,526); increase substantially driven by **administrative-data augmentation**; only **2,419** people region-wide counted unsheltered via street survey; 4,525 in shelters.
- S4: PSU HRAC, "Stories from the Outside: Oregon Wildfires 2020" (pdx.edu) — the rapid survey of unsheltered residents (with JOHS, Shannon Singleton, Street Roots), **N = 383**, deployed over two weeks; reports non-reach ("never hearing about any relief efforts") and 15% hospital visits.

### U-08 · BLOCKER (for calibration) · EXTERNAL — The calibration datum decomposes by site, and the paper discarded the decomposition
EVIDENCE. "≈130 of 198" is the SUM of two sites with opposite behavior on Sept 15: OCC ~90/99 (≈91%, effectively near-censored) vs Charles Jordan ~40/99 (≈40%) [S2]. The model's reference config "fills 198 of 198" — but reality nearly filled the central site and half-filled the peripheral one. Aggregating to 130/198 and attributing a uniform 1.52× to awareness destroys the only spatial validation signal available to a paper about placement. The over-prediction is concentrated at ONE site; a placement model that cannot reproduce a 91%-vs-40% split between two simultaneously open sites has failed its most informative test — and never took it.
FIX. Recalibrate and report PER SITE: modeled demand and fill at OCC and Charles Jordan separately vs (≈90/99, ≈40/99). Treat OCC as right-censored (report unconstrained demand). Diagnose the Charles Jordan gap against candidate mechanisms (distance from encampment mass, site newness/awareness, adults-only intake) rather than asserting awareness.
ACCEPT. Paper reports two-site calibration; states which mechanisms reproduce the split and which don't.

### U-09 · MAJOR · EXTERNAL — The county's contemporaneous explanation for underfill was possessions, not awareness; and the awareness survey the paper leans on is citable and uncited
EVIDENCE. The JOHS spokesperson, in the very article supplying the calibration datum, attributes low uptake to belongings and decision inertia [S2]. The paper's "attributed to the assumption that everyone knows the shelters exist" presents one mechanism as THE mechanism. Separately, "a local survey found 65%…" is uncited; the survey exists: S4, N = 383, rapid two-week convenience deployment.
FIX. Cite S4 by name; verify the 65% figure against the published report and quote its exact wording/denominator; characterize the sample (rapid, convenience, N = 383). Present possessions/decision-inertia and adults-only intake alongside awareness as competing explanations for the calibration gap; do not assert one.
ACCEPT. Citation resolves; limitations text lists the competing mechanisms; "attributed to" language removed.

### U-10 · MAJOR · EXTERNAL · [EXT: transport arm; information ablation] — Real access was dispatcher-mediated with rides; the model's core mechanism (walking) was not the system's access mode
EVIDENCE. County messaging: call 211 first for space availability and transportation [S1]; Street Roots confirms rides on request and no-ID intake [S2]. So occupancy information + transport existed in the modeled event — the exact "dispatcher beats placement" alternative previously raised as hypothetical is documented infrastructure. Counterpoint also documented: only 21 clean-air-shelter calls on Sept 15 [S2] — the channel was barely used, which itself argues the binding constraint was engagement/awareness rather than distance.
FIX. (a) Elevate the transport/information arm from suggestion to required robustness check: model 211-style access (probabilistic ride at rate λ, occupancy knowledge only via the channel) and report how much of C's advantage survives. (b) Add one limitations sentence: the modeled walk-only access mode contradicts the documented access system of the reference event.
ACCEPT. Ablation results reported; limitation stated.

### U-11 · MAJOR · EXTERNAL — A third real site (Mt Scott CC) existed on standby; the reference configuration and the narrative omit it
EVIDENCE. Mt Scott opened the night of Sept 11 and was shifted to standby "in case other sites reach capacity" [S1, S2]. The real system had a conditional-activation layer; the model has none, and the paper's event narrative (two sites) is incomplete.
FIX. Include Mt Scott (standby, activation-on-threshold) in the historical reference config or justify exclusion; note conditional activation as an unmodeled real policy.
ACCEPT. Reference config file lists three sites with activation rules; narrative corrected.

### U-12 · MAJOR · EXTERNAL — The historical population was ~2,000 outdoors, not 6,842; the 1.52× "awareness" factor is confounded by a ~3.4× population-vintage factor
EVIDENCE. Contemporaneous estimate: 2,000+ unsheltered (2019 PIT, cited in S2). If the reference run used the 2025-derived 6,842 against 198 emergency beds (+ ~1,400 year-round [S1]), a full fill is guaranteed by demand inflation alone — awareness is not needed to explain 198/198, and the 1.52× cannot be attributed to it.
FIX. Run the historical reference with a 2020-plausible population (~2,000–2,400) and the 2020 inventory (~1,400 year-round + 198 emergency + Mt Scott standby). Report calibration against U-08's per-site numbers under THAT configuration. Document exactly what the current reference config contained (population, inventory, dates) — it is described nowhere.
ACCEPT. Reference config fully specified in methods; calibration re-reported under 2020-vintage population; the 1.52× claim replaced or defended.

### U-13 · MINOR · EXTERNAL — Smoke shelters were adults-only; eligibility is a documented non-distance barrier
EVIDENCE. "The adults-only shelters…"; families with children were routed to existing shelters [S2].
FIX. One limitations sentence; if the model population is 18+ by construction (bands start at 18), state that this is a scope choice that coincidentally matches the emergency sites' intake rule but not the general system.
ACCEPT. Sentence present; population age scope stated explicitly.

### U-14 · MAJOR · EXTERNAL — The denominator is verified as a citation but not as a physical population: "6,842 simultaneously outdoors" conflates administrative status with presence
EVIDENCE. The 10,526 Multnomah figure is consistent with the 2025 PITC (12,034 tri-county; Multnomah +67% from 6,297) [S3] — the citation checks out. But the report itself states the unsheltered increase was substantially driven by administrative-data augmentation, and only 2,419 people region-wide were street-count-verified unsheltered [S3]. People on an administrative list are not all physically at campsites at t = 0. Every absolute headline (person-hours 928,934; refusals; dose totals) scales ~linearly with the simultaneous-outdoor share, and arm B's DEFINITION (capacity = one bed per person) inherits the same ambiguity.
FIX. Add a sweep over simultaneous-outdoor fraction f ∈ {0.4, 0.6, 0.8, 1.0} applied to the 6,842 (resample which agents are present). Report whether arm ordering and the equity result are stable in f. State in methods which construct the denominator measures.
ACCEPT. Sweep reported; abstract/claims phrased against the chosen construct.

### U-15 · MINOR · EXTERNAL — Reference-inventory vintage and datum-date precision
EVIDENCE. 2020 year-round system ≈ 1,400 beds [S1] vs the 2026 inventory's 2,234; the Street Roots occupancy night is Sept 15 (publication Sept 16).
FIX. Historical reference must use the ~1,400-bed 2020 inventory (or justify otherwise); correct the datum date to "observed night of Sept 15, published Sept 16."
ACCEPT. Both corrections in methods/limitations.

---

## SECTION 3 — NEW MODEL-SPEC AND CODE ITEMS

### U-16 · MAJOR · BUG-RISK · BLOCKED-ON-REPO · [EXT: retarget-reset question] — Selection may route agents to closed shelters, and closed doors burn the retarget budget
EVIDENCE. The admission branch treats `!isOpenAt(tick)` identically to full (`else` → retarget, `retargetCount++`). If the SELECTION step ("nearest shelter that still has room") does not filter on open-at-selection, agents route to not-yet-open sites and spend bounded retargets discovering closure — punishing exactly the earliest, fastest responders, and interacting with staggered opening dates. Delta over the prior round's reset question: the selection-filter defect and the budget-burn-on-closed mechanism.
FIX. Candidate set at selection = open(t) ∧ hasCapacity. Do not decrement the retarget budget when the cause is not-yet-open. Reset (or don't bound) the budget on any shelter-opening event.
ACCEPT. Unit test: agent selecting while only a future-opening shelter exists neither routes to it nor loses budget; regression diff on seed 42 reported.

### U-17 · MAJOR · SPEC · [EXT: behavioral ontology — temporal gating variant] — Departure is gated on government activation, and agents have zero self-rescue options
EVIDENCE. Trigger = threshold ∧ "somewhere is open." Before the first opening, the entire population shelters in place at any concentration; no agent can use transit, stores, libraries, vehicles, or leave the county. The model's residents can be rescued only by the county. This is a strong assumption stated nowhere, and it hard-couples all exposure accounting to the activation schedule (see round-3 A.1).
FIX. State the assumption in methods. Sensitivity: allow fraction g of agents an exit-system option (removed from exposure accounting at personal thresholds); report headline stability over g ∈ {0, 0.1, 0.25}.
ACCEPT. Assumption stated; sensitivity reported.

### U-18 · MINOR · REPORTING — The 16-unreachable "free consistency check" is two-thirds tautology
EVIDENCE. Populations are byte-identical across arms within a seed and arms A and B share identical site locations; A ≡ B on unreachability is therefore forced by construction and verifies nothing. Only B vs C (C adds sites) carries information — and that information is about the optimizer (prior-round item), not about model consistency.
FIX. Reword: drop "consistency check" framing; retain only as the optimizer-connectivity diagnostic.
ACCEPT. Text corrected.

### U-19 · MINOR · REPORTING → TEST — The asthma null is guaranteed by construction; convert the rhetoric into a real negative control
EVIDENCE. Attributes influence outcomes only through speed; asthma has no speed term; therefore asthma-stratum access MUST track the population up to sampling noise. "Evidence the model is not inventing effects" is circular — the model is incapable of inventing effects through any other channel. The observed −0.9pp (29.2 vs 30.1) is 0.6 SE: noise, as forced.
FIX. Add invariant #38/#39: |asthma-stratum access − population access| ≤ 2·SE(n_stratum), per run — a genuine, falsifiable negative control (it fails if anyone ever wires a diagnosis into dose or movement by accident). Rewrite the prose to claim exactly this and no more.
ACCEPT. Invariant in analyze_run; passes 27/27; prose corrected.

### U-20 · MINOR · REPORTING — Sex-stratified outcomes are absent while sex drives the mechanism
EVIDENCE. Sex enters speed (Bohannon M/F means differ); 29.3% of agents are female with lower published means; an in-model access gap by sex therefore exists and is unreported — the only sampled attribute with a mechanistic pathway that gets no outcome row.
FIX. Add M/F/other access rows per arm to the equity table (zero-cost from existing outputs).
ACCEPT. Rows present with across-seed ranges.

### U-21 · MINOR · BUG — Manifest dirty-flag field has inconsistent JSON typing
EVIDENCE. `gitWorkingTreeDirty()` returns `String.valueOf(boolean)` → bare `true`/`false`, but the unknown path returns `"\"unknown\""` → a quoted string. The manifest field is sometimes a JSON boolean-like token, sometimes a string. Any consumer comparing `== true` or `== "unknown"` silently misreads one branch.
FIX. Return a three-valued enum string consistently ("true"/"false"/"unknown", all quoted at serialization). Add JSON-schema validation of all 27 manifests to the invariant suite.
ACCEPT. Schema check passes 27/27; field type uniform.

### U-22 · MAJOR · COPY — The cover label "SAME BEDS, BETTER PLACED" is false as a description of arm C
EVIDENCE. C adds 1,117 new in-place beds (1.5× at all 36 real sites) plus 3,491 beds at ten new sites. No bed is re-placed; the existing system still grows 50% in situ. The cover promises a re-placement experiment the design never runs.
FIX. Change the label to "same total, split differently" (and align the headline stat block). Alternatively add a true re-placement arm; if so, coordinate with round-2 Part 3 (do not duplicate that item's variants).
ACCEPT. No remaining copy describes C as re-placement.

### U-23 · MINOR · DESIGN — Day-centre exclusion vs invented new-site capacities is a double standard
EVIDENCE. Ten real day centres are excluded because no capacity is published, while ten hypothetical sites receive invented 349-bed capacities. The evidentiary bar is applied asymmetrically in the direction that favors the paper's arm.
FIX. Estimate day-centre capacities (occupancy-code load per floor area, or a conservative flat 50) and add an A+ sensitivity; or state the asymmetry explicitly in limitations.
ACCEPT. Either the sensitivity exists or the asymmetry sentence does.

### U-24 · MINOR · [EXT: weak-comparator item] — B is physically unrealizable, not merely strategically naive
EVIDENCE. 3.06× in-place scaling turns a 198-bed building into 606 beds and requires tripling pod villages on fixed parcels. Delta only: fold "physically impossible for site types in the inventory" into the existing B′ motivation; no new arm beyond those already specified.
ACCEPT. One sentence added to B's description.

### U-25 · MINOR · REPORTING — The "REALISED" population column is unlabeled and its cross-arm identity is trivial
EVIDENCE. The table doesn't say which seed(s) it reports; and given byte-identical populations across arms within a seed, any cross-arm comparison of realized attributes is empty by construction.
FIX. Label the seed; report across-seed mean ± range; delete any implication that cross-arm attribute identity is a finding.
ACCEPT. Table corrected.

### U-26 · MINOR · PROCESS — The calibration run is outside the manifest/invariant regime
EVIDENCE. The 27-run invariant suite covers A/B/C × 9 seeds; the historical reference configuration — the only run compared to reality — has no stated manifest, seed, or invariant coverage.
FIX. Manifest and invariant-check the reference run(s) identically; publish alongside the 27.
ACCEPT. Reference manifests exist and pass.

### U-27 · MAJOR · GIS · BLOCKED-ON-REPO · [EXT: component-structure diagnosis] — Freeway and no-pedestrian edges may be in the walking graph
EVIDENCE. RLIS street centrelines include freeways and ramps; nothing in the doc states a pedestrian filter. Consequences if unfiltered: shortest paths across the Willamette can use non-pedestrian bridges (Marquam, Fremont carry no pedestrian access; the walkable set is Broadway, Steel lower deck, Burnside, Morrison, Hawthorne, Tilikum, Sellwood, St Johns), distances are understated, shelter catchments are wrong, and A/B/C are all biased optimistic. This is also the leading candidate diagnosis for the prior-round component-structure question (ramp stubs and limited-access fragments inflate small components).
FIX. Filter edges by RLIS TYPE to the pedestrian-legal subset before graph build; audit the realized bridge edge set against the walkable list above; recompute components; re-run seed 42 all arms and diff every headline metric; report edges removed and the diff.
ACCEPT. Filter in `StreetNetwork` load path with a logged removal count; bridge audit output in the manifest; headline diff published.

---

## SECTION 4 — VERIFICATION SCRIPT
`verify_round4.py` (companion file):
- Section A (runs now, no repo): reproduces U-01 (marginal + corrected constants), U-02 (composition bounds), U-03 (apportionment arithmetic), U-04 (tail masses), U-07 (union bound), and the round-3 back-outs used above.
- Section B (wire to repo; each stub names its item): bed-sum invariant per arm (U-03); realized-mobility branch test (U-01); per-stratum speed bounds (U-02); sex='other' handling probe (U-05); freeway-TYPE scan of graph edges + bridge audit (U-27); manifest JSON-schema/typing check (U-21); asthma negative-control invariant (U-19); closed-shelter selection/budget unit test (U-16); two-site calibration comparator against (≈90/99, ≈40/99) (U-08).

## SECTION 5 — STATUS
Repo not received this round; U-05, U-16, U-27 and all Section-B assertions are BLOCKED-ON-REPO. All round 1–3 items remain in force unmodified except where an [EXT] delta above amends them. Nothing in this file supersedes a prior fix already in progress.
