# Round-5 pre-registered predictions — U-27 re-runs + Phase D (D1/D2)

**Registered: 2026-07-28 20:49 -04:00, BEFORE any run listed below was
launched** (rule R2). Outcomes, including misses, will be reported in
11-ROUND5-REPORT.md §Disconfirming results.

## Honest disclosure

One corrected-graph run existed before this registration: **A-seed42** was
the U-27 smoke test. Its observed values are listed as OBSERVED, not
predicted: sheltered unchanged (2,060), refused 4,766 → 4,754, unreachable
16 → 28 (+12, freeway-fragment orphans), travel median −229 m, exposure
total −0.0004%. Everything else below is a prediction.

## P-1 — U-27 corrected-graph re-run matrix (54 runs)

The freeway filter removes 2,636 features / 614.1 km including the Marquam
and Fremont decks; components 154 → 171.

- **P-1a.** Arm ordering A < B < C on sheltered share is preserved at every
  seed; no headline flips.
- **P-1b.** Sheltered counts move by < 1 pp in every arm; C stays > 98.5%.
- **P-1c.** Unreachable rises by +10 to +30 per run in every 2026 arm
  (agents snapped to now-orphaned fragments), and the unreachable id set is
  identical across arms at the same seed (same encampments, same graph).
- **P-1d.** D's triage result survives: the mobility access gap in D-r10
  stays within ±0.3 pp of its old-graph value (gap ≈ 0.1–0.5 pp vs B's
  ~24 pp).
- **P-1e.** The POOL null survives: CP4–6 access remains within seed noise
  of C's (dispersion, not optimization, still explains C > B).
- **P-1f.** Travel distances move by ≤ 2% at the median in each arm
  (freeways were rarely shortest walking paths off the bridges; the
  Willamette-crossing corrections affect a minority of routes).
- **P-1g.** Historical reference (2×99): 198/198 filled, calibration ratio
  vs the ~130 observed unchanged at 1.52× (capacity binds so hard that
  routing detail cannot matter).

## P-2 — D1 window arms (A/B/C × 24 h/72 h × seeds 42–44)

- **P-2a.** The audit's dose-decomposition direction reproduces on the
  corrected graph: at 24 h the walking share of C's dose benefit is large
  (audit measured ≈ 62%) and it collapses by 312 h (audit ≈ 2.7%); the B→C
  dose ratio compresses toward ~1.2–1.3 at 24 h from ~2.0 at 312 h.
- **P-2b.** Arm ordering on access is unchanged at every window; the
  24 h window mainly truncates exposure accrual, not placement's effect on
  who arrives.

## P-3 — D2 bed-equivalence sweep (B × {0.8, 1.2, 1.4, 1.6} demand, real sites)

- **P-3a.** Access is monotone increasing in s.
- **P-3b.** s = 0.8 sits between A and B (capacity still binding).
- **P-3c.** **B does not reach C's access (~99.4%) until s ≈ 1.4–1.6** —
  i.e. matching C's re-placement gain costs roughly 2,700–4,100 extra beds
  at the real sites. If B crosses earlier (at 1.2), that is a miss to
  report: it would mean modest surplus, not placement, is the cheap path.
- **P-3d.** The mobility access gap does NOT close with s (extra beds at
  existing sites are captured first by faster walkers); the gap at 1.6
  stays > half its B value. This is the equity-vs-capacity finding
  re-tested under surplus.

## Descoped tonight (stated per the freeze plan)

- **Episode-aligned (hour-79) window arm** — requires shifting SIM_START
  (a physics-window code change), not a batch param; deferred to the next
  cycle with this note as the record.
- **D3 C-eq** (equity-objective placement) and **D5 information ablation**
  — deferred; D5 belongs to the E-layer cycle, which this session
  explicitly excludes (user: arms A–D only tonight).
