/**
 * gate-f-wachinger.ts — gate (f), Wachinger acceptance.
 *
 * Source: `scripts/verify_E_runs.py`, `check_wachinger()` (lines 524–554).
 * Spec: `websim/docs/WP8-SPEC-archive-gates.md` §3.1.
 *
 * ── What the gate is for ───────────────────────────────────────────────────
 *
 * A departure rule that is monotone in risk alone — everybody leaves once the
 * smoke is bad enough — is *forbidden* by the risk-perception paradox
 * (Wachinger 2013, doi 10.1111/j.1539-6924.2012.01942.x). The decision layer
 * encodes that as a barrier cost `c_i`, and this gate is the acceptance test
 * that the cost is actually suppressing departure: at least one resident
 * carrying two or more barriers must still be UNAWARE or PRE_EVAC when the run
 * ends.
 *
 * ── The threshold is ONE ───────────────────────────────────────────────────
 *
 * Not "most", not a share: `n_stay >= 1`. That looks weak until you notice what
 * it is guarding — a *structural* failure in which the barrier term is wired up
 * but never consulted, which drives `n_stay` to exactly 0, not to something
 * small. The measured archive value is far above the line (226 high-barrier
 * residents at SE2-E18-d1-seed42, 195 of them never departing, 86.3%), so the
 * gate has enormous headroom and still goes red the moment the mechanism is
 * disconnected. The percentage is reported, never gated.
 *
 * ── The redundant disjunct is kept on purpose ──────────────────────────────
 *
 * ```python
 * high = (barriers >= 2) | ((heavy == 1) & (pet == 1))
 * ```
 *
 * With 0/1 flags the second clause is implied by the first, so it changes no
 * verdict in the archive. It is transcribed anyway because it is what makes the
 * predicate read "two or more barriers **or** belongings-and-pet" rather than a
 * pure count, and because a port that "simplifies" a predicate it does not own
 * is a port that has started paraphrasing.
 */

import type { Checks } from "./checks.js";
import { E_AGENT_COLS } from "./constants.js";
import { fixed, type RunView } from "./run-view.js";

/** States that mean "this resident never left". */
const NEVER_DEPARTED: ReadonlySet<string> = new Set(["UNAWARE", "PRE_EVAC"]);

export interface WachingerFacts {
  /** Residents in the high-barrier stratum. */
  readonly nHigh: number;
  /** Of those, the ones still UNAWARE/PRE_EVAC at end of run. */
  readonly nStay: number;
}

/**
 * Gate (f). Registers exactly one check, and returns the two counts so a caller
 * (or a test) can assert on them without re-deriving them.
 *
 * Returns `null` when the gate failed before it could compute the stratum —
 * i.e. the attribute block is absent, or the stratum is empty.
 */
export function checkWachinger(ck: Checks, run: RunView): WachingerFacts | null {
  const label = `(f) [${run.name}] Wachinger acceptance`;

  if (!run.hasEBlock()) {
    ck.add(
      label,
      false,
      `agents.csv has no Phase-E attribute block (need ${JSON.stringify(E_AGENT_COLS)})`,
    );
    return null;
  }

  const heavy = run.agents.numFilled("heavy_belongings");
  const pet = run.agents.numFilled("has_pet");
  const dep = run.agents.numFilled("has_dependents");
  const state = run.agents.column("final_state");

  const high: boolean[] = heavy.map((h, i) => {
    const barriers = h + (pet[i] ?? 0) + (dep[i] ?? 0);
    return barriers >= 2 || (h === 1 && pet[i] === 1);
  });
  const nHigh = high.reduce((acc, v) => acc + (v ? 1 : 0), 0);

  if (nHigh === 0) {
    ck.add(
      label,
      false,
      "high-barrier stratum is EMPTY -- the barrier attributes were not sampled, " +
        "so the constraint cannot be tested",
    );
    return null;
  }

  const nStay = high.reduce(
    (acc, isHigh, i) => acc + (isHigh && NEVER_DEPARTED.has(state[i] ?? "") ? 1 : 0),
    0,
  );

  ck.add(
    `${label}: some high-barrier resident never departs`,
    nStay >= 1,
    `high-barrier n=${nHigh} (2+ barriers or belongings&pet); still UNAWARE/PRE_EVAC ` +
      `at end of run: ${nStay} (${fixed((100 * nStay) / nHigh, 1)}%)`,
    nStay >= 1
      ? []
      : [
          "EVERY high-barrier resident departed. A monotone risk-only trigger is " +
            "forbidden by the risk-perception paradox (Wachinger 2013, doi " +
            "10.1111/j.1539-6924.2012.01942.x): the barrier cost c_i is not " +
            "suppressing departure.",
        ],
  );
  return { nHigh, nStay };
}

/**
 * The caller-side skip the Python performs in `check_run()` (line 777) for a
 * non-E arm. Kept here so the archived check *counts* reproduce: an E0 null
 * records a SKIP line for (f), not silence.
 */
export function skipWachingerForNullArm(ck: Checks, run: RunView): void {
  ck.skip(
    `(f) [${run.name}] Wachinger acceptance`,
    "not an E arm (--er); the null has zero barrier cost by design",
  );
}
