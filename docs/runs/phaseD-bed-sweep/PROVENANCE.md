# PROVENANCE - Phase D2 bed-equivalence sweep (BS080/120/140/160 x seeds 42-44)

Arm B's 36 real sites, capacity scaled to {0.8,1.2,1.4,1.6} x demand
(largest-remainder; scripts/build_phaseD_2026.py; scenarioCodes 11-14).
Predictions registered BEFORE running in
docs/critique-response/12-PHASE-D-PREDICTIONS.md - P-3c and P-3d were
MISSES: access reaches 99.5% already at 1.2x demand (predicted
1.4-1.6x) and the mobility gap VANISHES at any surplus (predicted it
would persist). Reported in 11-ROUND5-REPORT.md Disconfirming results.

## U-27 corrected-graph supersession (2026-07-28, Round-5)

Every run directory in this family was REGENERATED tonight on the
freeway-filtered pedestrian graph (U-27 fix, commit 3ee2085; runs stamp
deddfca, git_working_tree_dirty=false, verified by scripts/verify_2026_runs.py
exit 0). The pre-U-27 versions are superseded; they remain retrievable at any
commit <= 4dbeab9. Headline sheltered counts are UNCHANGED run-for-run;
refused/unreachable reclassify (~12 agents per 2026 run snap to now-orphaned
freeway-side fragments) and travel distances move ~0.1-2%. Full per-run diff:
docs/critique-response/11-ROUND5-REPORT.md (U-27 section).
