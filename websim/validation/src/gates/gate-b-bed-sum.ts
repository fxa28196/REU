/**
 * gate-b-bed-sum.ts — gate (b), the U-03 four-way bed sum.
 *
 * Source: `scripts/verify_E_runs.py`, `check_bed_sum()` (lines 393–402).
 * Spec: `WP8-SPEC-archive-gates.md` §3.6 — *"exact, 4-way"*.
 *
 * ```python
 * occ = int(pd.to_numeric(run.shelters["final_occupancy"], errors="coerce").fillna(0).sum())
 * js = run.population.get("sheltered")
 * csv_yes = int((run.agents["reached_shelter"] == "yes").sum())
 * csv_state = int((run.agents["final_state"] == "SHELTERED").sum())
 * ck.add(..., occ == js == csv_yes == csv_state, ...)
 * ```
 *
 * ── Why four terms and not two ─────────────────────────────────────────────
 *
 * The quantity "how many people got inside" is written down four times by three
 * different code paths: the shelter ledger (`Shelter.occupancy`, incremented at
 * the door), the manifest census (`OutcomeLogger` counting agent states), and
 * two independent per-agent columns (`reached_shelter`, a boolean the agent
 * sets on admission, and `final_state`, an enum the agent transitions into).
 * Any pair of them agreeing proves less than it looks: `sheltered` and
 * `final_state == SHELTERED` are both derived from the same enum, so they agree
 * even when the door ledger has drifted. The chain is what makes an
 * off-by-one at the door visible, and it is a **chained** comparison — Python's
 * `a == b == c == d` is `a == b and b == c and c == d`, evaluated pairwise, not
 * a comparison of `a` against the conjunction.
 *
 * ── The absent-key case ────────────────────────────────────────────────────
 *
 * `run.population.get("sheltered")` returns `None` when the manifest has no
 * census, and `int == None` is simply `False` in Python — a missing census is a
 * FAIL, never a vacuous pass. {@link samePythonNumber} reproduces that: a
 * JavaScript `undefined` compares equal to nothing, including itself.
 */

import type { Checks } from "../harness/checks.js";
import { sum } from "../harness/frame.js";
import { showValue, type RunView } from "../harness/run-view.js";

/**
 * Python's `int_value == json_value` for a manifest scalar.
 *
 * `None` (absent) equals nothing. A JSON string never equals an int — Python's
 * `2060 == "2060"` is `False`, and so is this. Booleans are the one Python
 * oddity kept deliberately: `True == 1`.
 */
export function samePythonNumber(lhs: number, rhs: unknown): boolean {
  if (typeof rhs === "number") {
    return lhs === rhs;
  }
  if (typeof rhs === "boolean") {
    return lhs === (rhs ? 1 : 0);
  }
  return false;
}

export interface BedSumTotals {
  /** `sum(shelters.final_occupancy)`, truncated as Python's `int()` does. */
  readonly occupancy: number;
  /** `population.sheltered` straight from the manifest, or `undefined`. */
  readonly manifestSheltered: unknown;
  readonly reachedShelterYes: number;
  readonly finalStateSheltered: number;
}

/** Gate (b). Registers exactly one check. */
export function checkBedSum(ck: Checks, run: RunView): BedSumTotals {
  const occ = Math.trunc(sum(run.shelters.numFilled("final_occupancy")));
  const js = run.population["sheltered"];
  const csvYes = run.agents.column("reached_shelter").reduce((a, v) => a + (v === "yes" ? 1 : 0), 0);
  const csvState = run.agents
    .column("final_state")
    .reduce((a, v) => a + (v === "SHELTERED" ? 1 : 0), 0);

  const totals: BedSumTotals = {
    occupancy: occ,
    manifestSheltered: js,
    reachedShelterYes: csvYes,
    finalStateSheltered: csvState,
  };

  // Python's chained comparison, pairwise and in the same order.
  const ok = samePythonNumber(occ, js) && samePythonNumber(csvYes, js) && csvYes === csvState;

  ck.add(
    `(b) [${run.name}] U-03 bed sum: shelters == manifest == agents`,
    ok,
    `final_occupancy=${occ} manifest.sheltered=${showValue(js)} ` +
      `reached_shelter=yes:${csvYes} final_state=SHELTERED:${csvState}`,
  );
  return totals;
}
