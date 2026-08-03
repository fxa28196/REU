/**
 * gates barrel — the WP9 completion of the ported validation gate suite.
 *
 * `IMPLEMENTATION_PLAN.md` §8 gives WP9 the *"full gate ports (a)–(l) +
 * verify_2026 + analyze_run"*. WP8 shipped (f)(g)(h)(i)(k)(l) and the Tier-2 R3
 * comparator in `src/harness/`; this module adds the rest and a driver that
 * runs them in the certified script's own order.
 *
 * | gate | module | source |
 * |---|---|---|
 * | (a) | `../harness/r3-identity` (WP8) | `verify_E_runs.py` `compare_table` / `check_r3` |
 * | (b) | `gate-b-bed-sum` | `check_bed_sum` |
 * | (c) | `gate-c-asthma` | `check_asthma_control` |
 * | (d) | `gate-d-terminal-states` | `check_states` |
 * | (e) | `gate-e-unaware` | `check_unaware_immobility` |
 * | (f) | `../harness/gate-f-wachinger` (WP8) | `check_wachinger` |
 * | (g) | `../harness/gate-g-census` (WP8) | `check_e_census` |
 * | (h)(i) | `../harness/gate-hi-manifest` (WP8) | `check_manifest` / `check_se_manifest` |
 * | (j) | `gate-j-severe-series` | `check_se_smoke` |
 * | (k) | `../harness/gate-k-closures` (WP8) | `check_se_closures` |
 * | (l) | `../harness/gate-l-counters` (WP8) | `check_se_counters` |
 * | — | `gate-2026-cross-arm` | `verify_2026_runs.py` `main` |
 * | — | `gate-analyze-run` | `analyze_run.py` `verify` + `routing_anomaly` |
 *
 * Everything here reads the harness's `RawFrame` / `RunView` / `Checks`
 * primitives rather than re-deriving them. There is deliberately one CSV parser
 * and one `pd.to_numeric` in the tree: a second would be a second place for the
 * empty-vs-zero rule to drift, and that rule decides verdicts in (e) and (l).
 */

export * from "./stats.js";
export * from "./gate-b-bed-sum.js";
export * from "./gate-c-asthma.js";
export * from "./gate-d-terminal-states.js";
export * from "./gate-e-unaware.js";
export * from "./gate-j-severe-series.js";
export * from "./gate-2026-cross-arm.js";
export * from "./gate-analyze-run.js";
export * from "./driver.js";
