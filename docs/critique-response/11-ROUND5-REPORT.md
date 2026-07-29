# Round-5 report (IN PROGRESS)

Directive: Round 5 — integrity, round-4 triage, human decision layer.
Issued 2026-07-28. This file is the report artifact of record (directive §8).
Sections are filled as phases complete.

## Phase status

| Phase | Status | Evidence |
|---|---|---|
| A1 commit audit + round-4 inputs | DONE | commit 3cd3760 |
| A2 repro chain (archive CR/CP, provenance, dirty flag, .pyc) | DONE | commit 8ee9c9d; OutcomeLogger now uses `git status --porcelain`; compileJava clean |
| A3 six false verification statements | DONE | commit 8ee9c9d, 7 files |
| A4 claim linter | DONE | `docs/claims.yaml` (18 entries) + `scripts/lint_claims.py`; baseline RED = 50 hits / 10 files (`linter-baseline-2026-07-28.md`) |
| A2 D-seed43/44 agents.csv regeneration | NOT DONE | interrupted; see §Next |
| B propagation (items 5–30) | NOT STARTED | worklist = linter baseline |
| C round-4 triage | DONE (verdicts) | §Round-4 verdict table below |
| D cheap science (windows, bed-sweep, C-eq, survival, ablation) | NOT STARTED | |
| E human decision layer | SPEC DONE | `E-LAYER-SPEC.md` (E1 harvest verified, 7 topics; E2/E3 registry diff; 6 predictions registered) |

## Gating result — U-27 CONFIRMED (blocks Phase D/E runs)

`ContextCreator.java:254-276` adds every street MultiLineString to the routing
graph; `StreetNetwork.addStreet` takes no class attribute. **2,636
freeway-class features enter the walking graph**: TYPE 1110 mainline
(n=1,372, ~400 km) and 1120–1123 ramps (n=1,264, ~190 km), CFCC A15/A63,
names like "I5 FWY NB" — including **Marquam Bridge** (idx 37720/37721) and
**Fremont Bridge** (9 deck features), neither of which is pedestrian-legal.
Agents can therefore walk freeways and cross the Willamette on prohibited
bridges.

Fix (specified, not implemented): skip TYPE ∈ {1110, 1120, 1121, 1122, 1123}
before `addStreet`; log removal count + km into
`simulation.json.street_network_validation`; sensitivity on ramp/1200-A11
classes; re-run seed 42 across arms. Per directive C2 this gates Phase D/E —
corrected-graph runs must not reuse stale routing.

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

## Next (resume point)

1. Regenerate D-seed43/44 `agents.csv` (interrupted mid-run; HEAD 8ee9c9d,
   clean tree required, runs are sequential — output dirs collide on seed).
2. Implement the U-27 TYPE filter, re-run, then Phase D/E on the corrected
   graph.
3. Phase B propagation against the linter baseline (`lint_claims.py` must
   exit 0).
4. E-layer implementation per `E-LAYER-SPEC.md` §7 timeline.
