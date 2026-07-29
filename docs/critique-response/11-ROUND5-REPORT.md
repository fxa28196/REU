# Round-5 report

Directive: Round 5 — integrity, round-4 triage, human decision layer.
Issued 2026-07-28. This file is the report artifact of record (directive §8).
Phases A–D closed 2026-07-29 (overnight session); Phase E excluded from this
cycle at the user's direction (scenarios A–D only).

## Phase status

| Phase | Status | Evidence |
|---|---|---|
| A1 commit audit + round-4 inputs | DONE | commit 3cd3760 |
| A2 repro chain incl. D-seed43/44 agents.csv | DONE | commits 8ee9c9d, 4dbeab9 (all four regens bit-identical to the archived record) |
| A3 six false verification statements | DONE | commit 8ee9c9d, 7 files |
| A4 claim linter | DONE + **GREEN** | baseline RED 50 hits/10 files → **exit 0, zero hits** at commit 080a803 |
| B propagation (items 5–30) | DONE | all ten deliverables on corrected-graph science; commits 14e7465…080a803 |
| B2 camera-ready mechanics | DONE (2 user items open) | \graphicspath added; SUBMIT.md rebuilt to the real 5-figure set; affiliation normalized to the email-domain institution (user must still confirm); bib mechanism = inline thebibliography; `overleaf 2/` deleted. Still user-owned: NSF award number, Zenodo DOI, repo visibility |
| B3 temporal narrative | DONE | two-spell disclosure in chapter + presenter script (h16–22 spike, 57 clean hours, episode from h79) |
| C round-4 triage | DONE | §Round-4 verdict table below; U-27 RESOLVED (next section) |
| C4 quick fixes | DONE | U-03 bed-sum + U-19 negative controls + U-27 id-set identity in verify_2026_runs.py; U-07 definition string + chronic_physical stratum; U-21 nested-flag fix in verify_round4.py; registry V26/V27/V28; U-20 sex rows in tab:groups; U-22/U-18/U-25 wordings |
| D cheap science | DONE (D1, D2, D4) | windows, bed sweep, fig5_race; predictions pre-registered in `12-PHASE-D-PREDICTIONS.md`; **two misses, reported below**. D3 C-eq and D5 ablation descoped (recorded there) |
| E human decision layer | SPEC ONLY (unchanged) | `E-LAYER-SPEC.md`; explicitly excluded from this cycle |
| Mentor feedback (raw data, regression, justification, hand-off) | DONE | `1_EVERY_PERSON.csv` (+minutes, stops, D rows), `ML_TRAINING_DATA.csv`, `ML_MODEL_SUMMARY.md`, presentation Stage 9, presenter Q&A 14/15, `docs/HANDOFF.md` |

## U-27 RESOLVED — freeway filter implemented, bridge audit clean, full matrix re-run

**Fix (commit `3ee2085`).** `ContextCreator` skips RLIS TYPE ∈
{1110, 1120, 1121, 1122, 1123} before `addStreet`; every exclusion is counted
into `simulation.json → street_network_validation.freeway_filter`
(features_excluded, km_excluded, by_type). Registry row **V26** landed before
the code per R1. Measured at run time: **2,636 features excluded, 614.1 km** —
by TYPE: 1110×1,372, 1120×279, 1121×466, 1122×447, 1123×72 (exactly the counts
verified against Streets.dbf). Graph: 112,070 → 109,434 street edges,
89,345 → 88,100 nodes, components 154 → 171 (largest 60,444 → 59,725).

**Bridge audit (`scripts/audit_bridges.py`).** Willamette crossings vs the
pedestrian-legal list: REMOVED — Marquam (17 features) and Fremont (10), the
two non-pedestrian bridges. All 8 legal bridges remain walkable by name
(Steel ×6, Tilikum ×3, …). One crossing not on the round-4 list remains:
**Ross Island Bridge** (TYPE 1300/CFCC A11, carries a sidewalk) — retained
correctly by the TYPE rule; the round-4 "walkable set" list was incomplete.
Its A11 coding is exactly the registered 1200/A11 sensitivity (V26
uncertainty field), deferred with TYPE-1200 (2,139 features) pending a
per-segment sidewalk source. Residual centreline-intersection artefacts at
Old Town and Cathedral Park were adjudicated (no bridge exists there).
Deviation from the acceptance wording: the audit lives in the script + this
report; the manifests carry the per-run freeway_filter counts.

**Headline diff (54-run re-run matrix, all stamping `deddfca`, clean tree,
verify_2026_runs.py exit 0).** Every sheltered count in every arm and seed is
**unchanged to the digit** (A 30.1%, B 91.6%, C 96.0%; POOL null now exact:
CP draws = C's 6,570/6,565/6,566 in all three r-draws). Per seed, ~11–12
residents reclassify refused → unreachable (16→28 at seed 42; identical id
sets across arms, now an automated invariant); travel medians move −1.9% to
+3.2%; exposure totals move ≤0.3%. Pre-U-27 archives remain at commits
≤ 4dbeab9 and are superseded in place.

## Round-4 verdict table (U-01…U-27)

Adversarially verified against code and data per rule R5. "Published?" = does
it change a published claim.

| Item | Verdict | Published? | Evidence | Action |
|---|---|---|---|---|
| U-01 | CONFIRMED | yes | PopulationSampler.java:60,87-88. Live Pathways P(55+)=0.423*0.5+0.050=0.2615 exactly (realized seed42 0.26220); coded marginal=0.152163*0.7385+0.347802*0.2615=0.203323. The constants pin 0.192 only under 2019-PIT adult-renormalised P(55+)=(0.191+0.012)/0.997=0.203611 -> 0.191997: root cause confirmed. ACCEPT diagnostic branch resolves to 'doc is wrong': pooled 9-seed realized 0.203839 (n=61,578), z=+0.33 vs 0.2033, z | Reword 0.192 claims (V20, publishedTargets, TR, chapter) + fix V18 bands; or adopt 0.143689/0.328434 and re-run 27. 1h doc / 1d re-run. |
| U-02 | CONFIRMED | yes | Defect confirmed, mechanism corrected. The band is the exact union of two PRE-HETEROGENEITY demo runs: archive-postfix-precommit-run_seed42 (n=50) eff 1.3001-1.3654 and archive-pre-networkfix/run_seed1776194289 (n=100) eff 1.3001-1.3760. Neither CSV has a walking_speed_mps column - every agent walked the constant V10=1.30 m/s, so 1.376 is tick-discretisation, not a free-walker cohort. test_routing.py:60 hard bounds a | Rewrite 4 prose sites to name the 50/100-agent constant-speed runs; add realized SD/min/p5/p50 per stratum to manifest. ~2h, no re-run. |
| U-03 | PARTIAL | no | Apportionment claim REFUTED: largest-remainder is implemented and documented for both arms - build_scenario_bc_2026.py:43-52 (B) and build_scenario_c_2026.py:98-103 (C), stated in Capacity_Is_Not_Access.tex:549. On disk: current_placement 36/2,234; expanded_capacity 36/6,842; expanded_plus_new_sites 46/6,842 (36 existing at round(c*1.5)=3,350 + 10 new = 2x350+8x349 = 3,492). The '349.1 non-integer' arises only from a | Add one bed-sum assertion to verify_2026_runs.py and cite the two build scripts in methods. ~15 min. |
| U-04 | PARTIAL | no | Main claim REFUTED. truncatedNormal IS specified: rejection sampling, 100 attempts, bounds [0.40,2.20], clamp fallback - published verbatim at TECHNICAL_REFERENCE.md:623-633. SPEED_MIN_MPS=0.40 appears at TR:647, PRESENTER_SCRIPT.md:232 (explains why 0.40 cannot cancel the COPD decrement), VULNERABILITY_MECHANISM_AUDIT.md:83, chapter tex:394, 03-MOVEMENT.md:83. Tail claim refuted numerically: 0 of 61,578 sampled spee | Add SPEED_MIN_MPS/SPEED_MAX_MPS rows to variables.csv; log per-stratum min/p1. Sweep optional (bound is inert). ~30 min. |
| U-05 | REFUTED | no | Not blocked and not undefined. PopulationSampler.java:316-323 freeSpeedMean has 'default: return 0.5*(SPEED_MEAN_MEN[row]+SPEED_MEAN_WOMEN[row])' - an explicit unweighted M/F average. No exception, no silent male fallback. Documented three times: the method javadoc (:308-315, 'assigning such a resident a sex it does not have would be an invention'), published verbatim at TECHNICAL_REFERENCE.md:614-621, and registry v | Optional: add a sampler unit test and an M/F/other outcome row (overlaps U-20). ~1h. No code change needed. |
| U-06 | PARTIAL | yes | Lookup half REFUTED: row=max(0,min(6,ageYears/10-2)) is an explicit clamp and index 6 IS the published 80+ decade (0.968 M / 0.943 F), tabled at docs/science/phase2-human-agents/03-MOVEMENT.md:65 and TR:640. Max sampled age across 9 A-seeds is 89, so every lookup lands on a published decade; 1,239/61,578 = 2.01% (~138/run) are 80+ and get the real 80+ row. The premise 'Bohannon decade means end in the 70s' is wrong a | Add AGE_MAX=90 to variables.csv V18 in the same edit as U-01's band fix; state the 80+ clamp. ~15 min. |
| U-07 | PARTIAL | yes | 71.1% claim REFUTED: OutcomeLogger.java:517-520 isVulnerable = age>=55 OR mobilityLimited OR asthma OR copd OR chronicPhysical. Recomputed on A-seed42 agents.csv: 4,866/6,842 = 0.71120, byte-identical to vulnerable_flag on all 6,842 rows and matching 2_BY_GROUP.csv and TR:2166. Round-4 used 65+ (5.16%) where the predicate uses 55+ (26.22%); redoing their independence union with 55+ gives 0.7287 vs realized 0.7112, th | Fix the definition string at OutcomeLogger.java:581 and add chronic_physical to the strata array; patch or regenerate 27 manifests. ~30 min. |
| U-08 | CONFIRMED | yes | Model per-site (histref shelters.csv): OCC 99/99, CJ 99/99 — both saturated vs real ~90/99 OCC, ~40/99 CJ (in-repo: DATA_SOURCES.md:51, D14:342, 04-DECISION.md:70). Reporting aggregates everywhere: TECHNICAL_REFERENCE.md:2132-2136 quotes the per-site observed numbers then compares only 130-vs-198 (1.52x); same at presentation/index.html:728, SUBMIT.md:227. Per-site over-prediction: OCC 1.1x, CJ 2.5x. All 2,022 reacha | Report two-site calibration (99/99 vs ~90; 99/99 vs ~40), OCC as censored; diagnose CJ gap vs candidate mechanisms. Data already archived; ~half day. |
| U-09 | PARTIAL | yes | Single-mechanism attribution CONFIRMED: TR:2136-2138, SUBMIT.md:227, UPDATED_FINAL_RESULTS_REPORT.md:119 all say the 1.52x 'is attributed to' universal-awareness A-12; yet the repo's own science tier (04-DECISION.md:72,86-92) already documents belongings/'toughing it out'/COVID-fear barriers from the same Street Roots article. 'Survey is uncited' REFUTED: named in TR:337, TR:2496 (bib #32), BIBLIOGRAPHY.md:385 as PSU | Fix wording in 3 final-tier docs to list competing mechanisms (already in 04-DECISION.md); complete the S4 citation and reconcile n=73 vs N=383 agains |
| U-10 | CONFIRMED | yes | The dispatcher fact is corroborated by the repo itself: DATA_SOURCES.md:49 (JOHS 2020-09-10 release) — 'access via 211 with transport arranged by outreach teams'. Model is walk-only: TR:2125 'Transport assistance — Not modelled'. No transport/information arm exists: arms A/B/C + D (need-based admission, 08-scenario-D.md) + C-random (07-c-random.md) only. Chapter limitations (Capacity_Is_Not_Access.tex:840-849,857ff)  | Add the one-sentence limitation now (cheap, sourced in-repo at DATA_SOURCES.md:49); the lambda-ride ablation arm is real work (~days) and is the requi |
| U-11 | PARTIAL | yes | 'Reference configuration omits it' REFUTED: Mt Scott IS in shelters_2020-09.csv:4 (MSCC, standby), in histref simulation.json:118 (operating=false, occupancy 0) and in DATA_SOURCES.md:51,60,76-78 with an explicit justification ('Standby — never at capacity'; 'a faithful status quo has two operating sites, not three'). CONFIRMED residue: no activation-on-threshold mechanic, and it binds — histref saturates both sites  | Add one narrative sentence naming the standby site + note conditional activation as unmodeled and as a caveat on the 198-bed ceiling. ~1h; activation  |
| U-12 | REFUTED | no | The premise is factually wrong: histref ran n=2,037, not 6,842 — batch_params_histref_seed42.xml:18 (numAgents=2037, commented as 'the measured January-2019 PIT unsheltered count'), histref simulation.json (numAgents 2037, n_agents 2037), agents.csv = 2,037 rows. 2,037 sits inside the critique's own 2020-plausible band (~2,000-2,400). No 6,842 reference run exists, so the ~3.4x population-vintage confound does not ex | No new fix beyond D7 (already in force) and a methods paragraph specifying the reference config. Note: chapter's 'no calibration possible' (tex:832) c |
| U-13 | CONFIRMED | yes | Model population is 18+ by construction: age bands 18-44/45-64/65+ (Capacity_Is_Not_Access.tex:366; TR:311). The adults-only intake rule of the 2020 emergency sites appears nowhere in the repo (grep adults-only/families: zero relevant hits in docs; the external S2 fact is uncorroborated in-repo but consistent with DATA_SOURCES D1's family-routing silence). Closest existing text: PRESENTER_SCRIPT.md:569 '[cut for time | One limitations sentence: 18+ scope is a modeling choice that coincidentally matches the 2020 emergency sites' adults-only intake but not the general  |
| U-14 | CONFIRMED | yes | 6,842 = >65% of 10,526 (2025 PITC) confirmed in-repo (TR:285-288, FINAL_DATA_VALIDATION_REPORT.md:99-101). The administrative-augmentation caveat is already carried verbatim (TR:297-301 'must travel with the number'; FDVR:124-130; chapter tex) but never operationalized: no presence-fraction sweep exists anywhere, and verify_2026_runs.py:74-75,85 hard-asserts n==6842. The 2,419 street-verified figure is NOT verifiable | Run the f-sweep (design in notes: numAgents-only change, no Java edit, 36-108 runs); verify 2,419 against the PITC PDF and commit the source; phrase a |
| U-15 | PARTIAL | yes | Inventory half REFUTED: the historical reference uses ONLY the 198-bed 2020 emergency sites (shelters_2020-09.csv; histref shelters.csv), never 2,234; SHELTER_CAPACITY_AUDIT.md:36-42 explicitly firewalls the 2026 year-round list from 2020 smoke-respite capacity ('temporal and functional category error'), and the ~1,400 year-round figure is already recorded (DATA_SOURCES.md:50). Excluding occupied year-round beds from | Wording pass: date the datum 'observed night of Sept 15, published Sept 16' in 4 locations; add one sentence justifying year-round-bed exclusion. ~30  |
| U-16 | REFUTED | no | Selection DOES filter closure: GisAgent.java:339-340 skips !isOperating()||!isOpenAt(tick); a not-yet-open shelter is never targeted. Budget: retargetCount++ only at the door (301,315) and resets to 0 on opening-driven re-entry (249-258, line 254) — exactly the FIX asked for. Departure gate (232, anyShelterOpen) blocks pre-opening departures. Windows are contiguous, so door-closed-at-arrival = closeTick only; all CSV | None required. Optional hardening: distinguish closed-vs-full at line 301 for the final-tick edge (closeTick==endTick); trivial effort. |
| U-17 | CONFIRMED | yes | GisAgent.java:232: depart iff cNow>=evacThreshold && anyShelterOpen — government activation gates departure. State enum (91-97) has no non-shelter destination; no transit/exit/leave-county path exists. A-02 (assumptions.csv) registers only the timing gate; no registry entry or chapter/TR text states shelters-are-the-only-refuge (grep: no 'destination/self-rescue/leave' in Capacity_Is_Not_Access.tex); 04-DECISION.md:1 | Add the no-self-rescue assumption to methods/registry (new A-27) and run the g in {0,0.1,0.25} exit-option sensitivity; medium effort (new arm). |
| U-18 | CONFIRMED | yes | 'Free consistency check' framing at Capacity_Is_Not_Access.tex:821-828, source-md:281, index.html:657-659, TR:2089. Computed: A/B shelter coords identical (36 sites); UNREACHABLE agent-id sets identical A=B=C at seed 42 (n=16), counts 14-25 across seeds; populations byte-identical per seed (PRESENT_DAY:151-164 SHA-256). A≡B is forced by construction (same graph, same shelter nodes, same starts); only C's 10 added sit | Reword 4 sites: drop 'consistency check', keep as optimizer-connectivity diagnostic (C's new sites land only in already-served components); text-only, |
| U-19 | CONFIRMED | yes | Asthma sampled (PopulationSampler.java:276) but absent from the speed path (280-293; comment 202-207); GisAgent consumes only walkingSpeedMps (183-185) + mobility for arm-D priority (389-391) — no channel exists. Prose overclaims at tex:804, TR:2201, index.html:702. Computed on all 27 runs: seed42-A asthma 29.18% vs pop 30.11% = 0.64 SE (critique's 0.6 SE confirmed); max |z|=1.80 (A-seed49); proposed invariant passes | Add invariant #38: per run |P(SHELTERED|asthma) − P(SHELTERED)| <= 2*sqrt(p(1-p)/n_asthma); #39 same for chronic_physical. Wire into analyze_run.py Ch |
| U-20 | CONFIRMED | yes | Sex drives speed: PopulationSampler.java:316-323 (M/F Bohannon columns differ; OTHER=mean), female share 0.29271 (:72). No equity table has sex rows: chapter tab:groups tex:725-740 lists Everyone/mobility/65+/COPD/asthma/chronic only; TR, PRESENT_DAY, index.html likewise (grep 'female' hits sampling tables only). Computed from 27 runs: M−F access gap mean +3.2pp in A (range +0.5 to +5.0), +1.4pp in B, +0.6pp in C — r | Add M/F/other access rows per arm with across-seed ranges to tab:groups and TR/PD/index equity tables; zero-cost from existing agents.csv. |
| U-21 | CONFIRMED | no | At HEAD 3cd3760, OutcomeLogger.java:359 prints gitWorkingTreeDirty() raw; :391 returns String.valueOf(boolean) (bare JSON token) while failure paths return "\"unknown\"" (quoted string) — mixed typing exactly as claimed, though latent: all 55 archived manifests carry JSON booleans, none 'unknown', final-baseline predates the field. Phase A working-tree diff fixes it: typing decided once at the writer (booleans + quot | Fixed in Phase A (uncommitted). Also fix verify_round4.py:200 — it reads the key at JSON top level (field is nested under reproducibility/source_integ |
| U-22 | CONFIRMED | yes | Label exists: index.html:209 kpi '<span class="l">same beds, better placed</span>' under the 96.0% stat, rendered ALL-CAPS by .kpi .l{text-transform:uppercase} (index.html:84-85); also PRESENT_DAY:93, PRESENTER_SCRIPT.md:468/515, REFORMAT:329/348. False as a description of C: C = A's 36 sites grown 1.5x in place (2,234->3,350, +1,116 beds) + 10 new sites (3,492 beds; file has 2x350+8x349) = 3.06x today's beds; nothin | Apply the registered rewrite ('same total as B, split differently' / 'same beds, more doors') at index.html:209, PD:93, presenter tables; linter entry |
| U-23 | CONFIRMED | yes | Asymmetry real: 10 real day centres excluded for unpublished capacity (TR:473 'would require inventing a number'; tex:296,889; grounded_parameters.py:43) while C's 10 hypothetical sites carry invented 349/350-bed capacities (shelters_2026_expanded_plus_new_sites.csv; tex:872-873 admits they exceed any real facility). No A+ day-centre sensitivity exists (ContextCreator scenario table has none). The two facts are state | Either add the A+ sensitivity (flat 50/site or occupancy-code estimate) or one limitations sentence naming the asymmetric evidentiary bar; low effort  |
| U-24 | PARTIAL | yes | Substance confirmed, example wrong. Computed from A/B CSVs: scale 6842/2234=3.0627 (per-site 3.048-3.091); largest facility Bybee Lakes Hope Center 175->536; Roseway Inn MOTEL 150->459; 6 motels 425->1,301 rooms; 16 pod villages 574->1,758 pods (Dignity Village 66->202) — physically unrealizable in situ for most of the inventory. The critique's '198-bed building -> 606' does not exist: max 2026 facility is 175; 198 w | Add the one realizability sentence to B's description in chapter and presentation (cite motel/pod-village examples); trivial. Correct the critique's 1 |
| U-25 | PARTIAL | yes | Seed labeling: chapter caption tex:356-357 ('at seed 42'), TR:678, PD:150 all label seed 42 — but the presentation table (index.html:259-268) does not, and no deliverable reports across-seed mean±range for realised marginals. Cross-arm identity: PD:161-164 frames byte-identity as 'Verified' (an RNG-discipline check, index.html:271-275 explains why it is non-trivial), not as a finding — the critique's 'empty by constr | Add 'seed 42' to the index.html:260 table header and an across-seed range note; keep the byte-identity as a verification statement. Text-only. |
| U-26 | PARTIAL | yes | Invariant coverage: confirmed absent — verify_2026_runs.py:37-47 covers exactly arms A/B/C x seeds 42-50 (27 runs); docs/runs/ has no histref folder; no analysis-report exists for the calibration run; index.html:726-731 quotes 198/198 and 1.52x with no run identity. But 'no stated manifest, seed' is wrong: Geography/output/histref-n2037-seed42/simulation.json exists (seed 42, commit 02c3181, dirty=false, gate=1, n=20 | Archive the histref manifest under docs/runs with PROVENANCE, extend the invariant suite to it (incl. the U-19 negative controls), cite seed/manifest  |
| U-27 | CONFIRMED | yes | No TYPE filter anywhere: ContextCreator.java:254-276 adds every MultiLineString to StreetNetwork (only geometry-type skip); StreetNetwork.java:238-244 addStreet takes no class attr. 2,636 freeway-class features (TYPE 1110 mainline n=1372 ~400km; 1120-1123 ramps n=1264 ~190km; names 'I5 FWY NB', CFCC A15/A63) all enter the graph, incl. Marquam BRG (idx 37720/37721) and Fremont BRG (9 deck feats, TYPE 1110) — both non- | Skip TYPE in {1110,1120,1121,1122,1123} before addStreet (ContextCreator:254); log removal count; sensitivity on ramp/1200-A11 classes; re-run seed 42 |

### Notable refutations (round 4 wrong)

- **U-12 REFUTED** — the premise is factually wrong: histref ran **n=2,037**
  (`batch_params_histref_seed42.xml:18`, manifest, 2,037 CSV rows), not
  6,842. No 6,842 reference run exists, so the ~3.4× population-vintage
  confound does not exist. D7's censoring caveat stands unchanged.
- **U-16 REFUTED** — selection already filters closure
  (`GisAgent.java:339-340`); retarget budget resets on opening-driven
  re-entry (`:249-258`); departure is gated on `anyShelterOpen`. The asked-for
  fix is already implemented.
- **U-05 REFUTED** — `freeSpeedMean` has an explicit `default:` branch
  returning the unweighted M/F mean for sex='other', documented three times.
- **U-03/U-04 mostly REFUTED** — largest-remainder apportionment is
  implemented and published; `truncatedNormal` is fully specified
  (rejection sampling, bounds [0.40, 2.20], clamp fallback) and 0 of 61,578
  sampled speeds hit the tail the critique predicted.
- **U-07** — the 71.1% figure is correct and reproducible; round 4 used 65+
  where the predicate uses 55+. The real defect is the doc/code mismatch:
  the published definition string omits `chronic_physical`.

### Confirmed items that change published claims

U-01 (mobility 0.192 unreachable; coded 0.2033), U-02 (the 1.300–1.376 m/s
band comes from two pre-heterogeneity constant-speed demo runs, not a
free-walker cohort), U-08 (per-site calibration: model saturates 99/99 at
both sites vs real ~90 OCC / ~40 CJ — OCC 1.1× vs CJ 2.5× over-prediction),
U-09, U-10 (real access was dispatcher-mediated with rides; model is
walk-only), U-13, U-14 (no presence-fraction sweep), U-17 (no self-rescue
option), U-18, U-19, U-20 (sex drives speed but appears in no equity table;
M−F gap +3.2pp in A), U-22, U-23, U-27.

## Phase D results

**D1 windows** (from-start, seeds 42–44): B/C mean-dose ratio 1.29 (24 h) →
1.33 (72 h) → 1.98 (312 h); walking's share of C's dose benefit 100% → 83% →
4.5%. Runs archived `docs/runs/phaseD-windows/`; tables
`docs/final/results-2026/d1_*`. The audit's episode-aligned trajectory
truncation (62%/51%/2.7%) is a different construction and is cited as such.

**D2 bed-equivalence sweep** (B's real sites, s × demand, seeds 42–44;
archived `docs/runs/phaseD-bed-sweep/`): admitted 73.3% (0.8×) → 91.5% (1.0×)
→ **99.5% (1.2×, plateau through 1.6×)**; mobility gap 28.3 → 23.5 →
**−0.0 pp from 1.2× on**.

**D4 mechanism figure**: `fig5_race.pdf` in the chapter — in B, ~80% of the
final mobility gap exists one hour after departure; under D-r10 the curves
converge. D-r10 corrected-graph gap: −0.45/−0.12/+1.52 pp (seeds 42/43/44) at
total admissions identical to B.

## Prediction outcomes (registered 2026-07-28 20:49, `12-PHASE-D-PREDICTIONS.md`)

| Prediction | Outcome |
|---|---|
| P-1a arm ordering preserved | **HIT** (all seeds) |
| P-1b sheltered moves <1 pp | **HIT** — stronger: moved 0 |
| P-1c unreachable +10..+30, identical id sets | **HIT** (+11/+12; id-set identity verified) |
| P-1d D-r10 gap within ±0.3 pp of old value | **HIT** (≈−0.5 vs 0.1; both ≈ closed) |
| P-1e POOL null survives | **HIT** — now exact to the digit |
| P-1f travel medians ≤2% | **PARTIAL MISS** — 8 of 54 runs exceed 2% (max +3.2%, C arm and CP r5) |
| P-1g histref 198/198 unchanged | **HIT** |
| P-2a dose ratio compresses to ~1.2–1.3 at 24 h | **HIT** (1.29) |
| P-2b ordering unchanged at all windows | **HIT** |
| P-3a monotone in s | **HIT** |
| P-3b s=0.8 between A and B | **HIT** |
| P-3c B reaches C's access only at s≈1.4–1.6 | **MISS** — crosses at 1.2× and *exceeds* C |
| P-3d mobility gap persists under surplus | **MISS** — gap vanishes at any surplus |

## Disconfirming results (mandatory content)

Two registered predictions were wrong, in the direction that *weakens* the
placement/dispersion story and simplifies the policy claim:

1. **P-3c.** A 20% capacity surplus at the existing 36 sites (+1,368 beds)
   admits 99.5% — more than C's dispersion achieves at exactly-matched
   capacity. Modest surplus beats optimal splitting on headcount.
2. **P-3d.** The mobility equity gap does not persist under surplus; it
   vanishes entirely at 1.2× demand. The "capacity expansion widens the
   equity gap" finding is therefore a property of the scarcity band where
   capacity ≈ demand — B's design point — not a general law.
3. **P-1f (partial).** Travel medians moved up to +3.2% on the corrected
   graph in 8 of 54 runs, above the predicted ≤2% band (concentrated in arm
   C, whose new sites sit where routing changed most).

The honest synthesis all deliverables now carry: capacity is first-order; at
the capacity==demand knife edge the intake rule (D) closes the equity gap at
zero cost; dispersion buys headcount without optimisation; surplus dissolves
the failure mode entirely. *Buy surplus if you can; where you cannot, the
triage reserve buys the same equity for free.*

## Critique follow-up (2026-07-29, applied same night)

An external spot-critique of the overnight work was verified and folded in:

- **The "OR ≈ 123" claim was retracted and re-stated.** Forensics
  (`ML_MODEL_SUMMARY.md` model card): the marginal mobility odds ratio in D
  is **0.95–1.07 pooled** — the equity result is "the gap is gone", not a
  large OR. The conditional-on-speed coefficient is the logit recovering the
  admission rule we wrote — a pipeline sanity check — and its size sits on
  regional quasi-separation (three speed-band cells at exactly 100% access:
  n=958/597/304), so no point value is quoted. Linter entry
  `or-123-rule-recovery` blocks the discovery framing structurally.
- **Canary sweep.** Greps for every pre-correction number found and fixed
  stale spots the mid-propagation agent deaths had left (TR §13.1/13.2
  tables regenerated from the corrected CSV; presenter/TR/quote-block
  values); three new retired linter entries (`pre-u27-refused-counts`,
  `pre-u27-unreachable-16`, `pre-correction-gap-values`) keep them out.
- **Run-set composition, stated exactly:** the corrected-graph matrix is
  **93 runs** — 27 A/B/C + 8 D + 9 CR + 9 CP + 1 histref + 12 coarse
  bed-sweep + 18 window arms (yes, the 24 h/72 h arms ran — dose numbers in
  deliverables carry the window disclosure) + **9 fine bed-sweep runs
  (1.05/1.10/1.15×, codes 15–17)** added for the exchange rate.
- **The exchange rate (the county-actionable number):** 1.05× demand
  (+342 beds at the real sites) already matches C's admissions
  (96.0–96.1%) *without* closing the mobility gap (14.9 pp); 1.10×
  (+684 beds) admits **every reachable resident** (6,814 = 6,842 − 28) and
  the gap vanishes. **C's siting advantage on headcount is worth at most
  ~342 beds.** The knife-edge threshold quoted in deliverables is
  therefore 10%, not 20%.
- **Fresh-clone check passed:** depth-1 clone → linter exit 0, all five
  chapter figures present, `\graphicspath` present.
- Affiliation remains **user-confirm-required** (flagged in SUBMIT.md §0;
  normalized text is the email-domain-consistent institution, not a
  verified fact).

## Mentor-feedback layer (added this cycle)

- **Raw data**: `docs/final/results-2026/1_EVERY_PERSON.csv` — one row per
  resident per scenario (now incl. minutes-to-shelter, stops at full doors,
  and arm-D rows); `ML_TRAINING_DATA.csv` — 27,368 model-ready rows (inputs
  joined to outcomes).
- **Learning component**: `scripts/fit_outcome_models.py` →
  `ML_MODEL_SUMMARY.md`. Logistic regression (binary outcome; evacuation-
  literature standard family; IRLS, information-matrix SEs) + OLS for
  time-to-shelter. Asthma null in every arm (negative control); distance and
  speed dominate; arm D's mobility odds ratio ≈123 (the reserve, learned
  back). Retry behaviour quantified (mean ~3.1–3.4 stops; 6.6% of refused
  eventually admitted under scarcity vs 79–91% otherwise).
- **Justification layer**: presentation Stage 9 ("one row per person" with
  four real rows + the regression table + every-decision-justified card);
  presenter script Q&A 14/15.
- **Hand-off** (in lieu of a risky pre-symposium refactor): `docs/HANDOFF.md`;
  the consolidation refactor is planned post-symposium, gated on the
  byte-identity fixtures.

## Recommended framing (directive §8)

The chapter's title **"Capacity Is Not Access"** survives — it is the one
premise every control strengthened. Recommended abstract skeleton (implemented
at commit 85b80fe): (1) present system 30.1%; (2) capacity-at-parity 91.6%
with the forced 578 = 550+28 identity; (3) dispersion 96.0% with the POOL
attribution; (4) the mobility concentration + D's zero-cost closure; (5) the
knife-edge sweep, presented as a reported prediction miss; (6) the 1.5–15.6×
censored calibration bracket making all absolute figures upper bounds.
Rejected framings: "better placed" (refuted by POOL), "second-best
intervention is free" (refuted), "28× signal-to-noise" (retired).

## Deadline status vs §7

Mentor draft (Aug 9): **ahead of schedule** — Phases A–D complete and
propagated, linter green, camera-ready mechanics done except the three
user-owned items (NSF award number, affiliation confirmation, Zenodo
DOI/repo visibility). Descoped this cycle, recorded with reasons in
`12-PHASE-D-PREDICTIONS.md`: episode-aligned window arm (needs a SIM_START
shift), D3 C-eq, D5 information ablation (E-territory), U-12 recalibration
(calibration entry stays corrected-pending), 1200/A11 street-class
sensitivity. Phase E remains spec-only per the user's scope instruction;
its freeze-plan slot (spec + registry) is already satisfied by
`E-LAYER-SPEC.md`.
