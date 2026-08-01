/**
 * gate-g-census.ts — gate (g), E-census plausibility (3 binomial SE + 1e-4).
 *
 * Source: `scripts/verify_E_runs.py`, `check_e_census()` (lines 557–612).
 * Spec: `websim/docs/WP8-SPEC-archive-gates.md` §3.2.
 *
 * Two sub-checks that fail in different ways on purpose:
 *
 *  **(g.1) realised vs configured.** The manifest's `decision_layer` block
 *  reports the shares the sampler actually realised; each must sit within three
 *  binomial standard errors of the parameter that was supposed to produce it.
 *  This is what catches a sampler wired to the *wrong parameter* — swap
 *  `pHasPet` for `pHeavyBelongings` and the realised share is 0.277 against a
 *  target of 0.117, roughly 40 SE out.
 *
 *  **(g.2) manifest vs the CSV it summarises.** The same four shares recomputed
 *  from `agents.csv` must agree with the manifest to 1e-4. This is what catches
 *  a census computed from the wrong counter — a report that is internally
 *  plausible but does not describe the rows it was written beside.
 *
 * ── Why `max(target * (1 - target), 0.0)` is not defensive noise ────────────
 *
 * ```python
 * se  = math.sqrt(max(target * (1.0 - target), 0.0) / n)
 * tol = 3.0 * se + ROUND_SLACK
 * ```
 *
 * At `target == 1.0` (the E0 null's `pAwareInit`) the variance is exactly 0, so
 * the tolerance collapses to the 1e-4 print slack and the null's
 * `realised_aware` must be 1.0000 to printing precision. The `max` keeps a
 * floating-point −0.0 from becoming `sqrt(-0.0)`; it is also the reason a
 * target outside [0, 1] cannot silently widen the gate.
 *
 * `ROUND_SLACK` is **slack, not tolerance**: the manifest prints `%.4f`, so a
 * true `k/n` can sit up to 5e-5 from the printed value. It is added to 3 SE in
 * (g.1) and is the entire budget in (g.2).
 */

import type { Checks } from "./checks.js";
import { CENSUS_TO_COLUMN, CENSUS_TO_PARAM, ROUND_SLACK } from "./constants.js";
import { mean } from "./frame.js";
import { fixed, pyFloat, pyIntOfFloat, pyTruthy, type RunView } from "./run-view.js";

/** Gate (g). Registers one or two checks, matching the Python's control flow. */
export function checkECensus(ck: Checks, run: RunView): void {
  const g1 = `(g) [${run.name}] E-census within 3 binomial SE of configured parameters`;

  // `if not run.decision:` — an ABSENT block and an EMPTY block are both falsy
  // in Python and both fail here. Absence is a failure rather than a skip
  // because a pre-Phase-E writer producing a Phase-E run is a defect, not a
  // configuration.
  if (!pyTruthy(run.decision)) {
    ck.add(
      `(g) [${run.name}] E-census plausibility`,
      false,
      "simulation.json has no decision_layer block (pre-Phase-E writer?)",
    );
    return;
  }
  if (!pyTruthy(run.decision["enabled"])) {
    ck.skip(`(g) [${run.name}] E-census plausibility`, "decision_layer.enabled is false");
    return;
  }
  const n = pyIntOfFloat(run.decision["n_sampled"] ?? 0, "decision_layer.n_sampled");
  if (n <= 0) {
    ck.add(
      `(g) [${run.name}] E-census plausibility`,
      false,
      `decision_layer.n_sampled=${n}`,
    );
    return;
  }

  // --- (g.1) realised vs configured ----------------------------------------
  let ok = true;
  const lines: string[] = [];
  for (const [key, pname] of CENSUS_TO_PARAM) {
    if (!(key in run.decision)) {
      ok = false;
      lines.push(`${key}: ABSENT from decision_layer`);
      continue;
    }
    if (!(pname in run.params)) {
      ok = false;
      lines.push(`${pname}: ABSENT from reproducibility.parameters`);
      continue;
    }
    const realised = pyFloat(run.decision[key], `decision_layer.${key}`);
    const target = pyFloat(run.params[pname], `parameters.${pname}`);
    const se = Math.sqrt(Math.max(target * (1.0 - target), 0.0) / n);
    const tol = 3.0 * se + ROUND_SLACK;
    const passed = Math.abs(realised - target) <= tol;
    ok = ok && passed;
    lines.push(
      `${key}=${fixed(realised, 4)} vs ${pname}=${target} ` +
        `|delta|=${fixed(Math.abs(realised - target), 5)} <= 3SE+slack=${fixed(tol, 5)} ? ` +
        `${passed ? "yes" : "NO"}`,
    );
  }
  ck.add(g1, ok, `n_sampled=${n}`, lines);

  // --- (g.2) manifest census vs the CSV it summarises ----------------------
  const g2 = `(g) [${run.name}] E-census matches agents.csv columns`;
  if (!run.hasEBlock()) {
    ck.skip(g2, "agents.csv has no Phase-E attribute block");
    return;
  }
  let ok2 = true;
  const lines2: string[] = [];
  for (const [key, col] of CENSUS_TO_COLUMN) {
    // A key the manifest does not carry is skipped SILENTLY here, unlike in
    // (g.1) — (g.1) has already failed on it, and failing twice for one cause
    // would inflate the failure count without adding information.
    if (!(key in run.decision)) {
      continue;
    }
    const share = mean(run.agents.numFilled(col));
    const d = Math.abs(share - pyFloat(run.decision[key], `decision_layer.${key}`));
    const passed = d <= ROUND_SLACK;
    ok2 = ok2 && passed;
    lines2.push(
      `${key}=${String(run.decision[key])} vs mean(${col})=${fixed(share, 4)} ` +
        `|delta|=${fixed(d, 6)}`,
    );
  }
  ck.add(g2, ok2, `tolerance ${ROUND_SLACK} (manifest rounds to 4 dp)`, lines2);
}
