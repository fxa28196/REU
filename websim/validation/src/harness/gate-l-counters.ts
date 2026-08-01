/**
 * gate-l-counters.ts — gate (l), Scenario-E counter identities.
 *
 * Source: `scripts/verify_E_runs.py`, `check_se_counters()` (lines 718–765).
 * Spec: `websim/docs/WP8-SPEC-archive-gates.md` §3.5.
 *
 * Four per-agent counters (`blockages_encountered`, `push_throughs`,
 * `reroutes`, `stuck_events`) are the audit trail of the V48–V51 obstacle
 * machinery. The gate holds them to three identities:
 *
 *  - **l.0** a closure-free run (`closuresCode == 0`) has all four at zero.
 *  - **l.1** `blockages_encountered == push_throughs + reroutes`, **per row**.
 *    Every blockage a resident meets resolves to exactly one decision.
 *  - **l.2** `stuck_events <= push_throughs`, **per row**. Only a resident who
 *    pushed through can get stuck doing it.
 *  - **l.3** when there were pushes, the realised stuck share sits within three
 *    binomial SE (+ the print slack) of `pStuck`.
 *
 * ── Row-wise, not aggregate ────────────────────────────────────────────────
 *
 * `(blk != psh + rrt).sum()` counts **rows**, not a difference of totals. That
 * is deliberate and it is the part a paraphrase would lose: a port that
 * compared `sum(blk)` with `sum(psh) + sum(rrt)` would pass a run in which one
 * resident recorded a phantom push and another a phantom reroute. The identity
 * has to hold for each resident's own ledger.
 *
 * ── l.3 has never executed, and must still be implemented ──────────────────
 *
 * `n_push == 0` in **every** run of the archive — all 24 closure runs across
 * two smoke series and four schedules recorded zero blockage events, because
 * with departures spread over ~455 h only a handful of residents are mid-walk
 * when a wave lands. So l.3's `else` branch ("zero push-throughs in this run")
 * is the only path the archive exercises. The port implements l.3 anyway: the
 * browser can be driven into configurations the archive never ran (a
 * simultaneous-departure regime, or a wave hour inside the departure surge),
 * and a gate that is absent when the mechanism finally fires is a gate that was
 * never really there. The corrosion suite therefore drives l.3 directly.
 */

import type { Checks } from "./checks.js";
import { ROUND_SLACK, SE_AGENT_COLS } from "./constants.js";
import { sum } from "./frame.js";
import { fixed, floatParam, intParam, type RunView } from "./run-view.js";

export interface CounterTotals {
  readonly blockages: number;
  readonly pushThroughs: number;
  readonly reroutes: number;
  readonly stuckEvents: number;
  /** Residents with at least one blockage — the P-SE5 observation's numerator. */
  readonly residentsBlocked: number;
}

/**
 * Gate (l). Registers 1 check for a closure-free run, 2 for a closure run with
 * no pushes, and 3 once pushes exist. Returns the totals for a caller that
 * wants to assert on them; `null` when the counter block is absent.
 */
export function checkSeCounters(ck: Checks, run: RunView): CounterTotals | null {
  const code = intParam(run.params, "closuresCode", 0);
  const missing = SE_AGENT_COLS.filter((c) => !run.agents.has(c));
  if (missing.length > 0) {
    ck.add(
      `(l) [${run.name}] Scenario-E counters present`,
      false,
      `agents.csv missing ${JSON.stringify(missing)}`,
    );
    return null;
  }

  const blk = run.agents.numFilled("blockages_encountered");
  const psh = run.agents.numFilled("push_throughs");
  const rrt = run.agents.numFilled("reroutes");
  const stk = run.agents.numFilled("stuck_events");

  const totals: CounterTotals = {
    blockages: sum(blk),
    pushThroughs: sum(psh),
    reroutes: sum(rrt),
    stuckEvents: sum(stk),
    residentsBlocked: blk.reduce((acc, v) => acc + (v > 0 ? 1 : 0), 0),
  };

  // --- l.0 — closure-free runs ---------------------------------------------
  if (code === 0) {
    const tot = Math.trunc(
      totals.blockages + totals.pushThroughs + totals.reroutes + totals.stuckEvents,
    );
    ck.add(
      `(l) [${run.name}] closure-free run has all-zero counters`,
      tot === 0,
      `sum over all four counters = ${tot}`,
    );
    return totals;
  }

  // --- l.1 — every blockage resolved to exactly one decision, PER ROW ------
  const badDecide = blk.reduce(
    (acc, b, i) => acc + (b !== (psh[i] ?? 0) + (rrt[i] ?? 0) ? 1 : 0),
    0,
  );
  ck.add(
    `(l) [${run.name}] every blockage resolved to exactly one decision`,
    badDecide === 0,
    `rows where blockages != pushes + reroutes: ${badDecide} (totals: ` +
      `blockages=${Math.trunc(totals.blockages)} pushes=${Math.trunc(totals.pushThroughs)} ` +
      `reroutes=${Math.trunc(totals.reroutes)})`,
  );

  // --- l.2 — stuck events never exceed push-throughs, PER ROW --------------
  const badStuck = stk.reduce((acc, s, i) => acc + (s > (psh[i] ?? 0) ? 1 : 0), 0);
  ck.add(
    `(l) [${run.name}] stuck events never exceed push-throughs`,
    badStuck === 0,
    `rows violating stuck<=pushes: ${badStuck} (total stuck=${Math.trunc(totals.stuckEvents)})`,
  );

  // --- l.3 — stuck share within 3 binomial SE of pStuck --------------------
  const nPush = Math.trunc(totals.pushThroughs);
  const nStuck = Math.trunc(totals.stuckEvents);
  const pStuck = floatParam(run.params, "pStuck", 0.0);
  if (nPush > 0) {
    const share = nStuck / nPush;
    const se = Math.sqrt((pStuck * (1 - pStuck)) / nPush);
    ck.add(
      `(l) [${run.name}] stuck share within 3 binomial SE of pStuck`,
      Math.abs(share - pStuck) <= 3 * se + ROUND_SLACK,
      `stuck/pushes=${fixed(share, 4)} vs pStuck=${pStuck} ` +
        `(n=${nPush}, 3SE=${fixed(3 * se, 4)})`,
    );
    const nEvents = Math.trunc(totals.blockages);
    const pushShare = nEvents === 0 ? Number.NaN : totals.pushThroughs / nEvents;
    ck.observe(
      `OBSERVATION [P-SE5]: ${totals.residentsBlocked} residents blocked, ${nEvents} ` +
        `blockage events, push share ${fixed(pushShare, 3)} (registered band 0.35-0.60; ` +
        "scored in the predictions doc, not gated here)",
    );
  } else {
    ck.observe("OBSERVATION: zero push-throughs in this run");
  }
  return totals;
}
