# Commit hash map: history rewrite of 2026-10-02

On 2026-10-02 the repository history was rewritten once, for one reason: the six
earliest commits (2026-07-24, from the initial import through the first street-graph
fixes) had been made with an e-mail address that GitHub linked to a different account
from the author's. The rewrite changed the author and committer identity on those six
commits to the author's FXA GitHub identity and changed nothing else. No file content,
message, date, or parent structure was altered; every branch tip's tree hash was
verified identical before and after.

Because those six commits are the root of the history, every later commit received a
new hash as well. Run manifests (`simulation.json`, field `git_commit`), provenance
files, prediction records and narrative documents written before 2026-10-02 cite the
OLD hashes. Those files are archived evidence and were deliberately left unedited.
Use this table to resolve any old hash to its new one. Both columns are full SHA-1s;
the first seven characters are the short form used in prose.

The pre-rewrite repository, with original hashes and identities, is preserved offline
as a git bundle (see `docs/HANDOFF.md`, section on repository history).

| Date | Old hash | New hash | Subject |
|---|---|---|---|
| 2026-07-26 | `02c3181139f28f198bf64170b7a588152b9fa637` | `435787c7aa9c047bc6b52e812b9284fe3a8c54f4` | docs+registry: repair documentation, register V25/A-25/A-26, retire Scenario C |
| 2026-07-24 | `0637ce7fa4cbc8a3357047d9f672b90ab41db970` | `39500fa2ce335b69e82a0e44f1fc22b52b168058` | chore: initialize git repo with .gitignore and baseline (Commit 0) |
| 2026-07-26 | `0717b413007fd19e9a7b622bc74896929d0c4e39` | `296059f86d3475b24f1913c3f9b825754ccc206c` | feat(present-day): reframe to "2020-magnitude smoke today" on the real 2026 network |
| 2026-07-29 | `080a803d990f44d30a9c3b428f38921f1d694d08` | `47624ba61246209b0ebb2a72dac11a2c4f50a61b` | round5(B propagation 5/5): TECHNICAL_REFERENCE to corrected science + round-5 additions section -- claim linter now exits 0 on all ten deliverables |
| 2026-07-29 | `0d9e359f50afcdfc6e1c2f680cd8384db461e6eb` | `b73e8fdb26c33896e4f1c45a5ae647ce6967d13a` | round5(Scenario E): spec checkpoint 14-SCENARIO-E-SPEC.md |
| 2026-08-04 | `101de969fd2baa5cb2d3bf75928fdfcb8bc6094f` | `a443ede3314639f9f71489e4471445f4d6d00e76` | chapter+science: restore research email; pooled Pathways sample is deliberate, not a defect |
| 2026-08-04 | `1278daafc1cbe17ee6a3ac79d935a9027fbd4f28` | `b49aea7a32c0edc9a03346947fe365b774e24747` | websim(WP10): UI-thread attribution + third acceptance pass -- clause 2 red number located OUTSIDE websim |
| 2026-07-24 | `14bf5f5a95137273828deb9b540e9d041f8d0343` | `6337c617a18d84912e387b35803a5eddd640e655` | docs+report: runnable research prototype - run procedure, complete journey record, demo run |
| 2026-07-28 | `14e7465878acd31b1011660e323b5a5c2c5169f0` | `e54515025f26363e6c18474ba560cb85d784583c` | ﻿round5(B propagation 1/2): README, SUBMIT+citations, README_RESULTS, RESULTS_EXPLAINED, PD results, HANDOFF |
| 2026-07-28 | `1569f6d304d67f447bdf66b81745bfa4d4af7ac4` | `7086ad5e23540fff851d24a02d83629fceff8737` | refactor(v1.0): remove dead Java, wire chronic_physical into the census |
| 2026-07-29 | `1fb030844dbeafeaf3bfe347da02333f4fe27fb7` | `fe5447ad5a0bad3c6e2f75b331872e7621a059ea` | round5(Phase E fixes): recorded pet policy, L0 policy-refusal loop, inert group-speed default, corrected A-29 and the alphaHazard derivation |
| 2026-07-29 | `22d7d57fa01a2998d461fd80f5a0f40dfab71ee8` | `43a69227e77e53762efcf499472d3b9feb878d84` | round5(critique): fine bed-sweep arms 1.05/1.10/1.15x (codes 15-17) to locate the surplus-vs-siting crossing |
| 2026-07-29 | `2355c664a6b8d82431bc9f221bbc5f1ab5545a2f` | `6df78cdf091036b0061126104776f57b1a333986` | ﻿presentation: rebuild deck + word-for-word script from repo data only |
| 2026-07-30 | `257017dd865031b8116de3093e9011dc8429f237` | `4ce0bc962636ec085f6278e85879c39a14a6f860` | round5(Scenario E v2): worst-plausible-case -- Canberra-anchored smoke (4.436x) + early weighted random closures |
| 2026-07-26 | `2685dc88c41e19fcbc582aa5cd5a79eae3697374` | `f67f8a34e069bf0cdeb99382265c89ab96e0ca09` | final: definitive runs from clean tree - reproducibility chain closed |
| 2026-08-04 | `283db99895b6c6a42175351ba8ef81298902f9d7` | `fa413e32a22f394b5b438ead2ad95a75ec4e14b7` | science(D16): re-read the EPA ventilation cells from the primary -- the resting rate is not in the source |
| 2026-07-26 | `2b8302cd22dad6fe415b15edf4c90c8a3b0fc28b` | `088357ea5d86d86b6e8acfc22b972aae83f46cfd` | licensing: MIT LICENSE (scoped) + CITATION.cff + .zenodo.json |
| 2026-07-30 | `2d47d2a5a7cc9d419a8eee3d4aac1fe616bde23f` | `30933b1cd241c1522c6663c780f20618ae106b49` | round5(Scenario E core): obstacle layer + severe-smoke wiring + codes 18/19/20 |
| 2026-07-26 | `2d65f0e80ff953ba1fd17cab8a259a8e1b8e9e51` | `c79af97593b4a90835e011573146ffa5dc18c2d4` | docs: correct governance counts to 28 variables / 26 assumptions |
| 2026-07-28 | `3bf833f5b3c37c1e388a7d9839ee19203288c3cb` | `a3e4a28afb29ffe07fe33cfe1e7444c1d3c834cb` | fix(v1.0): close the scenarioCode mislabelling trap and 5 related defects |
| 2026-07-28 | `3cd3760c91660c0fb933f134067b72f5e60a9dc0` | `3680b4cf5909f183456740cbbb951f0563c40f3e` | round5(A1): commit the system audit and the round-4 delta inputs |
| 2026-07-28 | `3dce24a7f459ef0ed0e39b08643a4a6da97324ef` | `66ec4a029f66d648250aeab257fe84d192d3f955` | chore(v1.0): rescue the canonical manuscript into version control |
| 2026-07-25 | `3e4fad1d1e6122393aaab603f2da9ec7980b3470` | `4e6b5fa12347b773fa97be4b39ffe24304f199ba` | fix(routing): refused residents re-plan from the refusing shelter's node (Finding A / A-17) |
| 2026-07-28 | `3ee20859231676dafb46b108e37169ee77c58f0e` | `aac847400cad0e5db3570a236b4a205cc800973f` | ﻿round5(U-27): exclude freeway-class features from the pedestrian graph |
| 2026-08-04 | `3efc49335acd38f52c8ef9bb4189bb3d61c24ed7` | `9d1803a04f95c466d73c4179542ea40d14002c4a` | chapter(camera-ready): resolve affiliation, NSF award, Metro credit; drop Zenodo |
| 2026-08-04 | `40aea5e63cd2f5dcb27e09869e1579cfe25d6a88` | `c8515133dc0a234b8ffc2f8fa0e3851183788a2c` | websim(WP10 GO): clause 2 restated by decision record -- browser matrix green, 111/111, all three engines |
| 2026-07-26 | `4796c636e2216ec4ebf60610dbb9a5e51e74d752` | `37b47ffcc1a0837b85640dfadad52ec3e1e1e04a` | fix(figures): remove LaTeX escapes that matplotlib drew literally |
| 2026-07-30 | `495d845a083bd4d362fd093f9acb64f455347c1b` | `9d33af2f9feda16ac9faa32bf4d6e2c75dd6136d` | round5(Scenario E fix): simulationHours 456->455 -- the 456-slice series' inclusive final tick read one hour past the end |
| 2026-08-05 | `49e2bc6b379b74f20bd9555c7aa343e3b818db91` | `8c9da57b7d05b930fd80c8a88da361e3933cc63c` | docs: THE_COMPLETE_STORY.md -- every decision, in plain English, with the contradictions named |
| 2026-07-30 | `4a2125a7f09cabd25cdad346d1218c8225a103a7` | `c04b35edbd553b3aa6041e6d8451ee5cd4b90e30` | round5(Scenario E runs): 21-run archive -- 3 E0 nulls (R3 re-proved at 30933b1) + 18-run severe matrix at 455 h |
| 2026-07-28 | `4be7bcc155de4d36aaa2133cd8806eb448227e26` | `da75b543eff5bf6b52e49d21d6b376b2f5c2d1ad` | Merge origin/main (PR #1) into local v1.0 merge |
| 2026-08-05 | `4ca0c6c1b1a6993af374b5717b35c788d415b6cd` | `538154d3700d65a3c9f470c87e31f8c72c769b3b` | websim: the speed control was cosmetic -- pace it, and give it a slow half |
| 2026-07-26 | `4cd4e2fc0016cfa3d302c5b75b15cf250fdfea74` | `1396a61a38947a9dfd5efdec46d7fabf8821437e` | Merge pull request #1 from fxa28196/phase2/human-agent-modeling |
| 2026-07-28 | `4dbeab93400572d4d24b6f6cec30ffe05a9521c4` | `9c79c5331b25a2ed948eb9d2015f9774786d9f65` | ﻿round5(A2 complete): regenerate the 4 missing D-seed43/44 agents.csv |
| 2026-07-24 | `5092fde610c6bd87e81c3104f5b492e8663257d6` | `c61c5714af8886230d50c42ae967f8181af31fb5` | feat: build routable street graph and shortest-path movement |
| 2026-07-29 | `538e64b928024c61e065c29685ce211ee0f390ac` | `4dac336a881fa62ec9f76b57707102a2f23e5d63` | round5(B propagation 3/5): presentation to corrected science + Stage 9 raw-data/justification section (mentor feedback) |
| 2026-07-26 | `551a09347c5646b7109c5df60710962c39db1486` | `899136546d52c17279886c6f449dae595630d92e` | fix(scripts): run-model.ps1 GUI launcher could not compile on Windows |
| 2026-07-24 | `556ab08e490c20cd73f00f8eb1bed8a1d70be240` | `ce96c103f893207bd2707c1159505f06a83f2475` | feat(science): evacuation-timing model (AUDIT #1) - shelter-in-place until smoke trigger |
| 2026-07-28 | `55aa59e454a1a1b61b8657a00c42f5114569b8a7` | `056d369d7355bd693662d97ee1305a6b6505bbd6` | refactor(v1.0): approved cleanup and reorganization -- 79 MB reclaimed |
| 2026-07-29 | `564c47e34eea7850c86551a89847fd4eb80ac447` | `7165e298ca60bde6df02099d21c9d12646bc3f00` | round5(Scenario E inputs): closure schedules r1/r1-extreme/r2 + reports |
| 2026-07-31 | `5f10415d93382f6ea9e9a226f46469e2883f0543` | `a67f94cd096594199b27479a39f314ac74ecd582` | websim(WP0-WP7): browser-native TypeScript port checkpoint -- engine reproduces the certified Java model bit-for-bit through the arm-A vertical slice |
| 2026-07-26 | `5f54f8edec13cdc64f6644233e0cfb266f0762ce` | `c5ce6eb3774fee71aedf3a27e128943e28986f33` | fix(scenario-C): buildable design - keep real shelters, add new optimal sites |
| 2026-08-05 | `615b4348fbb753def5b90d21f7b10ea556817357` | `df06387e7f5ea9cad11eb8b8ddcfbfa5f60f0574` | chapter: correct the corrupt-identifier displacement range -- the chapter contradicted itself |
| 2026-07-30 | `6394343186657524d07ababe219d2ebafaf1ddeb` | `a3782225d4acb9b23005bf79f119cad7d7089f62` | round5(Scenario E outcomes): score P-SE1..P-SE6 -- two confirmed, one miss, one negative control held, two empty-stratum findings |
| 2026-07-25 | `6616232434c84b43ee9551f9ba3f5419cf021cb3` | `08a9581e59a18109105d7a7da112657c12b380be` | docs(final): correct candidate count (790) and stray assumption reference |
| 2026-07-26 | `6912f87d63fa08f21eb62ce130f9083f9c487858` | `c2546154f72d611d16e0c714a148c3ef2eecaf4b` | runs(2026): 18-run set complete - seeds 45/46/47 added |
| 2026-07-28 | `696472a06c60f73ae17ee871ce16dabc6d31f1b5` | `d8081aa18cefb8855e12aa08f5c3707b11d6d42d` | docs: print-ready reformat of the presenter script |
| 2026-08-04 | `6980c6947c28ea5144b2d1fb021785daa8886b5b` | `f9a8067685d1c3ea87d5fb1d6db0363091348149` | science(D16): record the registry rebuild step -- and a misdiagnosis worth not repeating |
| 2026-08-29 | `69c0ffdc08cc2d03e184b7314b9f0f6f2c59667f` | `4645c0cfbeb0db9400d19888247382b6ef20a4f8` | docs(next-study): archive the 8-requirement audit before temp cleanup takes it |
| 2026-07-28 | `69d3fafc2609b913748031d27d10eb34f0c4253b` | `5e16064d70204f9dbf61f5a007dc01e89e45eafe` | ﻿round5(figures+labels+registry): fig5_race, honest C labels, V27/V28, claims guard |
| 2026-07-28 | `69f9c2a2097d0f02888224ff3bfb5e5d127c0536` | `ae3b6699ae7883ea4033717f2fba5bfd8046ed21` | Merge phase2/human-agent-modeling into main — REU Simulation v1.0 |
| 2026-08-01 | `6cf106c6b18c6e4c3ca42befbfbc133e9452a4d6` | `6f45145808065e903fc4dcbb54d7d7a1efc6d2ef` | websim(WP8): Phase E decision layer + Scenario E closures -- GO, all five acceptance clauses defended by revert-proof |
| 2026-07-30 | `6e36f52e38a683b453269d12eb44b198b328432a` | `ebf68b17c60657ece6dccecc60589b4333e13e34` | round5(Scenario E v2 runs + outcomes): 27-run archive, P-SE7..P-SE11 scored -- three confirmed, one draw-dependence miss, one measure-zero mechanism result |
| 2026-07-26 | `706496da988178d2eca653759d35257841ee99c4` | `327049aa48213a660df43e2ca424eae27b1e8620` | runs(2026): nine runs re-verified with corrected source_integrity manifest |
| 2026-08-04 | `7117ffec60febc1f9a9e696fc438e4bdd1327b66` | `bebea8b9ff7cd0fe0037eb988f8f420cb7b359ef` | science(D15): verify the Pathways citation against the primary source -- and find a subpopulation mismatch |
| 2026-08-05 | `71d93b28fce139eb3c57abb246a2e5a2b749b5bc` | `946748ef0f486f918c2df22181ff5f8c9c1e56c1` | presentation+script: add the live browser demo, and make the graph census unable to go stale |
| 2026-07-29 | `7224cefd4e960a2876a6cbc82fb79b41a867856a` | `81213e444140fb51c2a5f1dbd132021dcc008fa5` | round5(Scenario E inputs): closure schedule CSVs + connectivity reports |
| 2026-07-24 | `7318f9ba916d77caa0a4b4344c3dd0d5bac361fa` | `522406f87411a89432255fe3d76a2a218a665ba8` | fix: agents persist after arrival; explicit outcome states replace removal |
| 2026-07-25 | `78582240f8993a3c33f84f0b8dffac9588725c30` | `5dbf55f486ef31be99683805a0aca2b457a1d6b4` | production: n=2037 runs, seeds 42/43/44, full manifests + analysis |
| 2026-07-28 | `7d0aa04beb4603270204253cdbb78b10e4f77d8f` | `12527c23fb64c21e28c8f3eb834574f09c02ea6c` | docs(v1.0): stabilization report |
| 2026-08-04 | `7da6d4ab7c745a530721ba2773a96094ea6d1b1b` | `cc1574224e9ae1eb1625a092867bdd485013bb77` | websim(WP12-14): Compare/Archive/Provenance, a11y+mobile, hardening -- and two dead surfaces the gate caught |
| 2026-07-26 | `7e1a271cbabda655f4346c938959cd98f81fb9b8` | `b235592b72ba0eef17c9533bf63651284160f4c6` | fix(manifest): source_integrity checksummed retired shelter files |
| 2026-08-29 | `80187f1d563b476580dbc7ffdaa72596076f84cc` | `16c03c4cd0162ae4459ca33ce3b65a0028c9b924` | docs(next-study): repair the Markdown header block flattened by HTML conversion |
| 2026-08-04 | `80a475873f83417c36710d1ba461e0b71ecb69b5` | `5ad8e6f970a780b83a86c821fc6fc86b31f1d642` | websim(WP11): the Run screen -- there is now a UI, and it is the D1 fix's caller |
| 2026-07-25 | `83d721b7e796a803ae86e8942531b7f7e03db038` | `979b3672918a7314931ef19c7280c56cd28e784b` | reference: capacity-binding golden run (n=400, seed 42, post-fix) |
| 2026-07-29 | `85b80fe680394d20cd53b575b975737b44dab5d7` | `b8d0eda1579cdc53f5d03904337d631daace4a9f` | round5(B propagation 4/5): chapter to corrected science -- dispersion attribution, D scenario + fig5_race, knife-edge sweep with reported prediction misses, corrected numbers, affiliation, limitations |
| 2026-07-25 | `880703dc25c11118f9b10f5b39c3d914f6c8ada0` | `7c870483bce2c1b637713778a833cb09a2e93a02` | final: plain-English results package, COPD walking-speed effect, capacity audit, demo scenario |
| 2026-07-29 | `886ba37d43ccebed8a4449f1660168e884768d00` | `949c39b0f343d62377aa1f7fe07074aafb45bd5e` | round5(Phase E runs): 12-run matrix at clean tree -- R3 re-proved, 9 ER baseline-real runs, 99/99 invariants |
| 2026-07-24 | `897a571e01d3939771cd9bb02e2894ef457f8799` | `e053c48eeac4fadd04f64185c7be7bd62c06fb08` | fix(env): repair VS Code Java classpath failure; document IDE audit |
| 2026-07-24 | `8ca7fb8cde8d752c6715f14fb01846fb17945c30` | `f9ae8b80846ebd4fc9231a4497037d8dd3c3df4b` | docs(phase2): scientific implementation plan for heterogeneous human agents |
| 2026-07-28 | `8ee9c9d582a68f5403f0015a10c7d3bc2c8d1436` | `d0482dde15603369178ff9acaaf194a49ff3ac54` | round5(A2-A4): integrity repairs -- repro chain, false verification statements, claim linter |
| 2026-07-29 | `916a61bec6134585e79110d98fbfc647c1fb075e` | `77907e6ee5faffd23509257fe2c618aa52dc718a` | final polish: chart axes/labels, print rendering, Q&A root 15, pointer remap, reconciliations |
| 2026-07-25 | `92338ce876799706eaaa6ea3883f46e5ec59cfda` | `0ffa4bb9b2ce5e52d58ff035780a4cba114f0416` | final: scenario A vs B, stratified equity results, publication analysis |
| 2026-07-26 | `948ac40a8e6d63693ec1e33d2d9928c5b9425852` | `33ea909a5772f18d66da4cbdeb05f3c1dca1185b` | feat(2026): three-arm present-day experiment - reality, capacity, placement |
| 2026-07-24 | `9559aa5d05bd071268e1d0e9040b9f1c44c11d57` | `8502eed70de3d897041f200dd883ca74a904638e` | fix: define tick-time mapping and geodesic movement in metres |
| 2026-07-28 | `95cd8f172d77c75d7a33725eaba2c290301a1e6f` | `ab6597ce5ada92c9fee1d12a70bab6359cb368c2` | round5(B propagation 2/5): presenter script + REFORMAT to corrected science, mentor Q&A 14/15 added |
| 2026-07-26 | `97ebd5d4c7920ece80cff5e479e81232731d36a3` | `67cf1b600c9cea947e830a260c7917572f1c15f2` | runs(2026): batch params for third replication batch (seeds 48/49/50) |
| 2026-07-26 | `a23fee242bfa45baaa43c9795d6ae046a92c70de` | `7e6655d9eb0139f72a8c9081d8962dad5095b214` | docs: presenter script, and correct an unsupported "clean-air-capable" claim |
| 2026-08-05 | `ae1f9f54016c5ab2ab767612812f063cade894ea` | `e9a13137ed41ec77f743f502ddd4c94123c131f9` | websim(WP13): the axe gate exists and is green -- and it found a real keyboard trap, not just contrast |
| 2026-07-24 | `ae66e63c11b3462e01e05e0509a6f7443aa54b8c` | `37b100e11b0152e5e8638aeeaa0272e9481f9cb3` | feat(routing+analysis): street-network validation layer + results-analysis pipeline |
| 2026-07-26 | `b69fc6dd10bda0810b63b69b4bb59585812306c6` | `d43945c401a9fa5619fa0ff83eb0154d2104c9ab` | fix(experiment+health): isolate placement; separate exposure / dose / risk |
| 2026-07-25 | `b6bf2af5d105b742507cc0c22adcd392bc55c717` | `b99cbcf78fdef4854ff61931ae981689d2480364` | docs(final): FINAL_RESULTS_REPORT - defensible research result, n=2037 x 3 seeds |
| 2026-07-30 | `bb8707d54c39ebbc86ae2f34d776b935e43ecc27` | `011d719ec1bb0ccdd68c58bb38c17e536bbd6afb` | round5(Scenario E harness): P-SE1..P-SE6 registered, batch params, --se verifier gates, matrix driver |
| 2026-07-24 | `bfb8786ff5908dcccd2816aa08a14796bc1bf8b1` | `fe0be0e42db39cbb2b8a8f226d587d7cb9a6f309` | feat: real shelters + encampments, PM2.5 smoke field, exposure/VWE, results export |
| 2026-07-24 | `c093d23d8f8a2e344bf6f82fbf0174367cc41a48` | `88081a37fbce160555aa157aa9d56a4e2e9959f6` | docs(science): evidence base - dataset registry, design spec, validation strategy, bibliography |
| 2026-07-26 | `c0cd113f30692b1564c97614d1558e7b512701c8` | `b57b7bfa880ccbc62b28a4a72a116d404065d584` | runs(2026): 27-run set complete - third batch (seeds 48/49/50) + cross-run verifier |
| 2026-07-25 | `c23a7395c83767e01fbe6e5abc8a9c5c6d15f05b` | `b3987bd23363a993c5cca00a6eae4724c3096ee1` | feat(governance): scientific variable + assumption registries, validated at startup |
| 2026-07-24 | `c48cd70a8d3356175e9a2526179f6d3fa068b2c4` | `5497bbadd615b36c05527b2983cfab7e70e17fe4` | baseline: official validated reference experiment (sim-20260724-223555-seed42) |
| 2026-07-29 | `c88de56f8583ad37c09500bc4708b0c1bee87a28` | `ddb7e81d8c048b07d0b66efd5b32d280771f6c21` | round5(Phase E core): human decision layer -- awareness, possessions, pets, dependents, risk trait, hazard departure, L1 imperfect-information choice |
| 2026-07-29 | `c91da0150f115123764b37513f2110264ab0b83f` | `e2d802e29b978125d81e0086b5b9e23f75eed699` | round5(critique fixes): OR-123 retracted -> model card + rule-recovery framing; canary sweep + 4 linter guards; TR tables regenerated from corrected CSV; fine sweep prices C's siting advantage at <=342 beds (crossing 1.05x, gap dissolves 1.10x); fresh-clone check green |
| 2026-07-26 | `c9b241900513cdd119ea4bbbc3f42663a7c7612f` | `030a6e1cf757bb265c7dcdf82bdf5ee4106bca5d` | docs: publication chapter + technical reference + presentation |
| 2026-07-25 | `ccad7b70fd659026bf1e9f796cd7ec0c8a1582e0` | `a9009b10777565ac77216fa6bd7661b32210aabc` | feat(vulnerability+timeline): heterogeneous residents and real shelter opening dates |
| 2026-07-29 | `d319950ae0a9cb4c1251f7bfdf80306817e099f2` | `390386beb5e01a78756fb2ed5c19062f8ad9df02` | presentation v2: 20-slide decision-and-evidence deck + full reference script (sources on every slide, named axes, no limitations-as-defeats slide) |
| 2026-07-24 | `d4822e9f55d6daff7e19b4ca45981d261c4e6794` | `ae15693fa9c5463cd460d7fd7bb61292bf804d53` | docs: GUI-load validation screenshot for the data-driven model |
| 2026-07-29 | `d486fca1ae6334976ec30d41857d756e5bcfaf4c` | `e6426ff2e17289c80d20ddeb351ca3e6c0a20966` | round5(report): 11-ROUND5-REPORT final -- phases A-D closed, U-27 resolution, prediction outcomes with disconfirming results, mentor-feedback layer, framing + deadline status |
| 2026-07-28 | `db44dc0581815252dbfd5e7def904788098738ab` | `aaa1247fab2492e5fe60abd446e8eeaea098b95d` | round5(C): round-4 delta triage -- 27 verdicts, U-27 confirmed as a gating defect |
| 2026-07-26 | `ddd7f142470248c8e8208f996fd0b54aa8debd68` | `726b27a7119686281b2adf455d4216598cd4ca64` | feat(gui+evidence): fix GUI demo config; preserve verified 2026 evidence package |
| 2026-07-30 | `de7c0455c1c1dd8769982271c8d3665d103cc7d6` | `fd9ceda2505d2f39dc4e2cd774bf686b382f47c4` | round5(Scenario E audit fixes): negative-constant parser defect documented + fixed, r2/r3 connectivity reports restored |
| 2026-07-28 | `deddfcad568321490c5bfe254a783d448cb3e1a8` | `58324ab2e370ab43aea9c51a664d3fab47337a9b` | ﻿round5(C4+D prep): U-07 definition fix, bed-sweep arms, window params, predictions |
| 2026-07-24 | `e1278f3e200ba2c4daa20dca19ae8c5edf4c6f06` | `472e7e8fc221e5bfa0258a9b605eee42a64c589b` | refactor(science): shelter arrival as study endpoint (remove gamma); full scientific audit |
| 2026-07-29 | `e1e2596347ebc8a24fc318144e4548d021d5a056` | `67615f163959442a11304cb996fce50c101f30c7` | round5(Phase E outcomes): score the registered predictions, incl. the miss and the arm-D disconfirmation |
| 2026-07-30 | `e2b3a8e3bdb4ba786d67c7cf7f0421b67ddb4f68` | `ca5f3acd220ab330ccb2eafc3dbe2dbcbe8c38b7` | round5(Scenario E registry): V46-V51 + A-33..A-35, research-verified; V39 Evers->Coughlan correction |
| 2026-07-24 | `e34c2009794edfbb2cb8f551f5e283830e6fbb04` | `02cdbcf7621287be0f2da2e9ecd54eddd94b97a5` | data: acquire EPA AQS hourly PM2.5 (Sept 2020) and add provenance registry |
| 2026-08-03 | `e53e55be88d8d201d207b298e9f6c2faf39fda02` | `07b7c23cf72fa789da1f6b54b8ac33bf9935b68b` | websim(WP9): validation harness + Tier-4 attribution + mutation gate -- GO; WP10 worker runtime -- NO-GO on a real perf finding |
| 2026-07-24 | `eaa9605fc32849a538f20bc2ad6d9ffc7a7f138e` | `c856ea45cf5a4796935b9dc96205493eaa5b9cb1` | chore: remove dead demo code (water/zone/tower logic, coverage stubs) |
| 2026-07-28 | `ec9b20853f1b5adb0dcc3ed0310d0e99cbd12ad5` | `34360e8f8895944817f9a9a0f7522c094f2acaa3` | research: answer the external critique -- two new arms, two exact computations |
| 2026-07-26 | `ee89f9d3e8003d420c35d9521df920b114a1272f` | `c2cb6ed8f371caa1d340ea5a16271bcf77e44afe` | runs(2026): nine verified runs, reproducibility chain closed |
| 2026-07-24 | `f502ea6e54ad83096b9ccb514c02a91506fd4f61` | `f578d776964e527992fd6c4bbbbc8d2fac82bb9f` | docs(phase2): movement model spec - completes the scientific design set |
| 2026-07-28 | `f5eae57124780cda7de132f78f568a1b4432453f` | `dfe0b48f8ee0163dd828dee39066d675fae3074d` | ﻿round5(U-27 re-run + Phase D + C4): corrected-graph science, verified and archived |
| 2026-07-25 | `fc92e8ec538f99125b104d5ee43a032261216eba` | `41677cbf6ad61de8bab7d43c1dbced519f31d6d6` | docs+config: GUI defaults demonstrate the final model; document them |
| 2026-07-26 | `fff4c379926087cb73ab496be561718c60d29a72` | `0f202945e12be7c74d0a6481b3e71a9123c9f09d` | docs(validation): final data provenance pass - two inputs corrected on evidence |
