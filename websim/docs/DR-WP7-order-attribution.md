# DR-WP7 — attributing the residual arm-A divergence

**Status: CLOSED with measurements.** The Tier-4 residual against
`docs/runs/present-day-three-arm/A-seed42` was *declared* to be divergence 1
(within-tick agent order) and was never numerically bounded. It is now bounded
two ways — a sampled permutation distribution, and four structural identities
that a defect would break and an ordering artefact cannot. No defect was found in
the divergence itself; **three inaccurate self-reports were found in the ledger
that describes it**, and §5 records them.

| Artefact | Path |
|---|---|
| Permutation census (harness) | `websim/validation/scripts/order-permutation-census.ts` |
| Permutation census (committed result) | `websim/validation/order-census/order-permutation-census.json` |
| Structural attribution gate | `websim/validation/test/tier4-attribution.test.ts` |
| Column census | `websim/validation/scripts/compare-archive-agents.ts` |
| Re-seed hook (harness only) | `HeadlessOptions.shuffleStreamSeed`, `websim/validation/src/headless.ts` |

The configuration throughout: preset `A_present_day`, `numAgents = 6842`,
`randomSeed = 42`, `simulationHours = 312`, compared against
`docs/runs/present-day-three-arm/A-seed42` on **raw CSV text**, excluding only
`sim_id`, `commit` and `data_version` — the three environment columns, exactly the
exclusion discipline `verify_E_runs` uses.

---

## 1. The residual, restated as numbers

| Quantity | Value |
|---|---|
| Rows compared | **6,842 / 6,842**, key sets equal |
| Columns compared | **46** shared (TS emits 59, Java 49, 3 environment columns excluded, 10 TS-only WP8 columns have no Java counterpart) |
| Rows byte-identical across all 46 | **6,546 / 6,842 (95.67%)** |
| Columns bit-equal on **every** row | **27 / 46** |
| `final_state` cells differing | **114 / 6,842 (1.67%)** |
| `shelters.csv` columns matching all 36 sites | `capacity`, `operating`, `peak_occupancy`, `final_occupancy`, `utilization` — **5 / 5 at 36 / 36** |
| `shelters.csv` `refused_count` | **19 / 36** sites |
| `shelters.csv` `mean_travel_dist_m_admitted` | **10 / 36** sites |

---

## 2. Bounding it: the permutation census

### 2.1 The knob, and why it is legitimate

Divergence 1 says the port draws *a* uniform within-tick permutation from the
colt default stream rather than Repast's own. If that is the whole story, the
divergence Java sees against our stream should be statistically indistinguishable
from the divergence *any* such stream sees against ours. So the census runs the
identical configuration over many independent permutation streams and reports the
spread.

The Repast default stream has exactly two draw sites in this port:

- `engine/src/world/build.ts:415` — one `nextIntFromTo(0, nCamps-1)` per resident,
  the only build-time default-stream draw, all of them **before tick 1**;
- `engine/src/sim.ts:153` — the per-tick Fisher–Yates shuffle.

`HeadlessOptions.shuffleStreamSeed` re-seeds the stream *between* those two. It
therefore moves the permutation sequence and provably nothing else, and the census
does not take that on trust: it hashes the 14 archive-comparable **build-time**
columns of every run and asserts a single digest across the whole census. The
`PopulationSampler`, `ELayerSampler` and per-agent decision streams are separate
objects (`engine/src/rng/streams.ts`) and are untouched by construction. The hook
is in `validation/`, not in the engine, and `undefined` — the default, and the only
value any gate uses — leaves the stream exactly where the build left it.

Stream seeds are an LCG walk from a fixed golden-ratio constant rather than
`1..n`, because consecutive colt seeds are consecutive `mt[0]` words and a reader
is entitled to ask whether the sample is independent.

### 2.2 Result

**200 independent permutation streams**, 202 runs in total (the 200 plus the
certified-faithful reference and an identity-order control). One build digest
across all 202 — `77249a23b42721f2` — so the census provably varied the
permutation and nothing else.

`final_state` divergence against the archive, per stream:

```
min   94    p05  102    p25  111.5   median 118    p75  122    p95  130    max  144
mean  116.89                sd  8.58
```

| | |
|---|---|
| **Observed (certified-faithful run)** | **114** |
| Percentile within the 200 | **31.0** |
| z | **−0.34** |
| Two-sided empirical p (with the +1 correction, so the most extreme of 200 could never read 0) | **0.776** |
| Identity-order control | **106** |

**114 is an unremarkable draw.** It sits between the 25th and 50th percentile of
the ordering channel's own spread, a third of a standard deviation below the mean,
and the whole spread is 94–144. The single identity-order comparison that used to
carry this argument (106) is inside the same spread and is now reported alongside
it rather than standing in for it.

Every stream, without exception, reproduced the structural signature of §3:

| Property | Streams |
|---|---|
| Balanced swap set (`SHELTERED`-lost == `SHELTERED`-gained) | **200 / 200** |
| Zero non-shelter flips | **200 / 200** |
| `sheltered` == 2,060 | **200 / 200** |
| `unreachable` == 28 | **200 / 200** |

Only **two** `final_state` transitions occur anywhere in the census —
`REFUSED_ALL_FULL → SHELTERED` and `SHELTERED → REFUSED_ALL_FULL`, 11,799 of each,
exactly balanced. The channel cannot reach any other state, and across 200 draws
it never did.

The two order-sensitive `shelters.csv` columns behave the same way:

| Column | Observed | Census min | Census max | Census mean | Percentile | Two-sided p |
|---|---|---|---|---|---|---|
| `refused_count` sites matching | **19 / 36** | 15 | 22 | 17.04 | 89.0 | 0.229 |
| `mean_travel_dist_m_admitted` sites matching | **10 / 36** | 7 | 15 | 9.84 | 44.5 | 1.000 |

Both are inside the spread, and both lean *towards* agreement rather than away
from it: our stream matches the archive on more sites than the median random
stream does (19 vs 17) and on exactly the median number for `mean_travel`
(10 vs 9.84). The five columns that match 36/36 — `capacity`, `operating`,
`peak_occupancy`, `final_occupancy`, `utilization` — matched 36/36 on **all 200
streams**, which is the control: they are structurally order-invariant, and the
census confirms it rather than assuming it.

### 2.3 What the census does **not** claim

It samples *our* permutation family, not Repast's. It cannot show that Repast's
scheduler produces a permutation from this family — reverse-engineering that was
declared out of scope at plan Q1, and remains so. What it shows is the weaker,
sufficient statement the divergence register actually needs: **114 is an ordinary
draw from the ordering channel at this capacity margin, not an anomaly requiring
a second explanation.** Had 114 fallen outside the spread, that would have been a
finding to investigate; it did not.

---

## 3. Attributing it: four structural identities

Statistics bound the size. These bound the *kind*. Each is asserted in
`validation/test/tier4-attribution.test.ts`.

### 3.1 The flips are a balanced swap set

114 flips decompose as **57 SHELTERED-lost / 57 SHELTERED-gained / 0 other**.
Beds are conserved, so an ordering-only divergence must be a permutation of who
occupies them: every resident we shelter and Java did not is paid for by exactly
one Java sheltered and we did not. A non-zero "other" — an `UNREACHABLE` or a
`PRE_EVAC` flip — is a state the ordering channel cannot reach, and would be
release-blocking. Across the whole census, **every** stream reproduced both
properties.

Totals are unmoved: `sheltered = 2060`, `refused_all_full = 4754`,
`unreachable = 28` (and the same 28 ids), on every stream.

### 3.2 Per-site admitted cardinality is exact

All **36 / 36** sites admit the same number of residents as the archive. Order
redistributes *which* seat; it never changes how many there are. This is also why
`peak_occupancy`, `final_occupancy` and `utilization` match 36/36 while the two
composition-sensitive columns do not.

### 3.3 `mean_travel_dist_m_admitted` matches a site **iff** its admitted set is identical

This is the sharp one, and it is the answer to task (b) for that column. Per site,
cross-tabulating "admitted set identical" against "column matches":

| | column matches | column differs |
|---|---|---|
| **admitted set identical** | **10** | **0** |
| **admitted set differs** | **0** | **26** |

Both off-diagonal cells are empty. The `set identical / column differs` cell is
the one that matters: a site where both runs admitted exactly the same people but
reported a different mean would be a **distance defect wearing the ordering
channel's clothes**. There is none. The column carries no error of its own; its
entire divergence is set membership, and the 10 matching sites are exactly the 10
whose admitted set is identical.

The composition change is small and closes arithmetically: the symmetric
difference of the per-site admitted sets is **174** memberships, i.e. **87** per
side, which is exactly the **57** residents whose terminal state flips **plus the
30** who are sheltered in both runs but behind a different door. 57 + 30 = 87.

### 3.4 Co-admitted residents walk byte-identical distances

Of the 2,003 residents sheltered in both runs, **1,973 reached the same shelter**,
and for all **1,973 / 1,973** the `total_travel_distance_m` cell is the same
*text* — byte identity, not tolerance. This is the direct measurement that the
port's routing arithmetic contributes nothing to the Tier-4 residual.

(Among the 4,725 never-sheltered in both, 140 differ, worst |Δ| 14,736.8 m. That
is the retarget channel and is expected: a refused resident keeps walking, and
which doors were full when it knocked is exactly what the order decides.)

---

## 4. `refused_count` — mechanism

`refused_count` is a **door-visit** counter, not a state. `Shelter.admit()`
increments it on a capacity refusal and `recordPolicyRefusal()` on a policy one; a
**closed** door increments nothing (`engine/src/shelters/admit.ts`, quirk ledger).
A resident that arrives at a full shelter is counted there and then retargets, so
the counter is a function of the *path history* of every resident, which is a
strictly finer object than the terminal state.

That is why it is the most order-sensitive column in either file, and why it moves
on sites whose admitted set does not:

| | Java | ours | Δ |
|---|---|---|---|
| Total refusals over 36 sites | **17,167** | **17,199** | **+32 (+0.19%)** |
| Per-site Δ range | | | **−14 … +17** |
| Sites matching exactly | | | **19 / 36** |
| Residents whose `door_refusals` differ | | | **207 / 6,842**, max \|Δ\| **6** |

The self-consistency check is what makes this a redistribution rather than a
miscount: **each side's door ledger closes against its own agents.**
`SUM(agents.door_refusals)` equals `SUM(shelters.refused_count)` in the archive
(17,167 = 17,167) and in our output (17,199 = 17,199). A counter that were
double-counting or dropping events would break its own identity; neither does.

`Delta_Park_Motel_Shelter` is the instructive site: **identical admitted set**
(hence `mean_travel_dist_m_admitted` matches exactly) and `refused_count`
16 → 31. Same 76 people admitted, different number of people who bounced off the
door on the way past. That is the mechanism in one row.

**Verdict for task (b): both columns are pure order artefacts.** Neither indicates
a defect, and §3.3 and this section give the mechanical reason rather than an
assurance.

---

## 5. Three inaccurate self-reports, corrected

The gate report that carried these was not found anywhere in the tree — no file
under `websim/` states any of them — so they were re-derived from the code and the
archive, and the *ledger* (README §2.2, §6, §7) was audited against the tree
instead. What was actually wrong:

| # | Reported | Measured | Where it was fixed |
|---|---|---|---|
| 1 | "32 of 56 columns bit-equal" | Neither 32 nor 31 is right. **27 of 46** shared columns are bit-equal on all 6,842 rows. The 56 framing is itself misleading: it is the TS header minus the 3 environment columns, and **10 of those 56 have no Java counterpart at all** (the WP8 decision/closure columns). 27 bit-equal + 19 divergent + 10 not comparable = 56 | README §2.1 |
| 2 | preset `A_present_day` treated as the E0-null arm-A configuration | They differ in **exactly one of 41 parameters**: `enableDecisionLayer`, **0** in `A_present_day` and **1** in `E0_null_A`. The WP7 slice runs `A_present_day` and compares against `present-day-three-arm/A-seed42`, whose manifest predates the decision layer — so the comparison is sound, but the two presets are not interchangeable and a run labelled with the wrong one would be a different model | README §2.1 note |
| 3 | divergence 5 listed **six** v2-web quirk fixes | **Four** are written (`null` strata, `retarget_count`, both utilisation figures, LF). **Two are not**: "true UTC" (the engine calls no clock — `generated_utc` is a caller-supplied `OutputEnvironment` field written verbatim in both flavours) and "full escaping" (`jsonEsc` is flavour-independent, so v2 reproduces the instrument's incomplete escaping) | README §6 divergence 5, §7, §2.2 |

Two further ledger inaccuracies were found in the same audit and corrected:

- **README §7's status column** claimed "there is no output logger yet" and marked
  eight quirks "Specified (WP7)". `engine/src/output/logger.ts` exists and seven of
  them are implemented and pinned. The column now names the pinning test per row.
- **README §2.2 ("Not built")** still listed the agent step, tick loop, movement,
  admission, exposure/dose accumulation, `OutcomeLogger` and Tiers 2–4. All are
  built and measured. An understated contract is a false self-report too, and §2.2
  now carries an explicit "was on this list and no longer is" paragraph so the
  direction of any future staleness is visible.

The identity-order comparison was separately re-measured: it is **106** rows, not
104. It is reported in the census output as `identity_order` so it cannot drift
again.

---

## 6. What is now gated

`validation/test/tier4-attribution.test.ts`, artifact-gated on the packed graph
**and** the archive (skips loudly on a clean clone, hard-fails under
`WEBSIM_REQUIRE_ARTIFACTS`):

1. balanced swap set, zero non-shelter flips;
2. per-site admitted cardinality 36/36;
3. the `mean_travel` iff, asserted as both empty off-diagonal cells;
4. co-admitted distance byte identity;
5. the door-ledger identity on **both** sides;
6. the observed divergence inside the committed permutation envelope.

Gate 6 pins `observed` exactly. That is deliberate: if a legitimate engine change
moves it, the correct response is to re-run the census and re-derive the
attribution, not to widen a tolerance.

---

## 7. Naming: `exposureUgM3h` → `cumulative_dose_ugm3h`

`GisAgent.java:55-66` is explicit that exposure (∫C dt, µg/m³·h, physics of the
air) and inhaled dose (∫C·IR dt, µg, physics of the person) must never be mixed —
and then `OutcomeLogger.java:154` writes exposure into a column called
`cumulative_dose_ugm3h`. The column says "dose" and holds exposure; the real dose
is `inhaled_dose_ug`. The unit suffix gives it away (µg/m³·h is a
concentration-time, a dose is a mass), but the word invites exactly one future
defect: "fixing" the mismatch by wiring `inhaledDoseUg` into that column, which
would silently break every archived comparison.

The port keeps **both** names — the Java field name so `logger.ts` greps back to
its source, the Java column name so the bytes stay archive-comparable — and does
three things instead of renaming either:

- a field-to-column map in the source, at `engine/src/agents/resident.ts`;
- a regression pin, `logger.units.test.ts` → *"writes exposure (not dose) into
  `cumulative_dose_ugm3h`"*, which gives the four exposure/dose fields mutually
  distinguishable values so any transposition fails there;
- a row in the README §7 quirk ledger, so it is a *declared* reproduction rather
  than an accident.

`exposureWhileTravelingUgM3h` → `exposure_while_traveling_ugm3h` is unaffected and
correct; the asymmetry between the two is the instrument's, and is now written
down on both sides.
