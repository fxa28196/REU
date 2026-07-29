# PROVENANCE - Phase D1 window arms (W24/W72 x A/B/C x seeds 42-44)

simulationHours=24/72 from hour 0 (2020-09-07T00:00). NOTE: these are
from-start windows; the audit's episode-aligned decomposition is a
different construction (trajectory truncation at hour-79 alignment).
The episode-aligned RUN is descoped tonight (needs a SIM_START shift);
see 12-PHASE-D-PREDICTIONS.md. Built by scripts/build_phaseD_2026.py.

## U-27 corrected-graph supersession (2026-07-28, Round-5)

Every run directory in this family was REGENERATED tonight on the
freeway-filtered pedestrian graph (U-27 fix, commit 3ee2085; runs stamp
deddfca, git_working_tree_dirty=false, verified by scripts/verify_2026_runs.py
exit 0). The pre-U-27 versions are superseded; they remain retrievable at any
commit <= 4dbeab9. Headline sheltered counts are UNCHANGED run-for-run;
refused/unreachable reclassify (~12 agents per 2026 run snap to now-orphaned
freeway-side fragments) and travel distances move ~0.1-2%. Full per-run diff:
docs/critique-response/11-ROUND5-REPORT.md (U-27 section).
