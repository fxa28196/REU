/**
 * gate-e-unaware.ts — gate (e), UNAWARE immobility.
 *
 * Source: `scripts/verify_E_runs.py`, `check_unaware_immobility()`
 * (lines 505–521). Spec: `WP8-SPEC-archive-gates.md` §3.6.
 *
 * A resident who never became aware of the evacuation cannot have walked
 * anywhere. Two independent witnesses have to agree on that: the accumulated
 * distance must be numerically zero, and the departure tick must be blank.
 *
 * ── `dist.fillna(-1) != 0` — a blank distance is a FAILURE ─────────────────
 *
 * ```python
 * dist = pd.to_numeric(un["total_travel_distance_m"], errors="coerce")
 * moved = un[(dist.fillna(-1) != 0)]
 * ```
 *
 * The sentinel is `-1`, not `0`. An UNAWARE row whose distance column is *empty*
 * therefore counts as **moved** and turns the gate red. That is the opposite of
 * the reflex (`fillna(0)`, "blank means nothing happened") and it is the whole
 * point: `OutcomeLogger` writes `%.2f` for every agent that exists, so a blank
 * distance on an UNAWARE row means the writer did not visit that agent — which
 * is exactly the state where "it never moved" is an assumption rather than an
 * observation. A port that wrote `fillna(0)` here would still pass every
 * archived run and would have deleted the gate's teeth.
 *
 * ── `.astype(str).str.strip() != ""` — text, not a number ──────────────────
 *
 * The departure witness is tested as **raw text**: present-and-blank, not
 * numerically zero. Tick 0 is a legitimate departure time, so a numeric test
 * (`== 0` or `.isna()`) would read an agent that left at the first tick as one
 * that never left. Reading `time_started_tick` through {@link RawFrame.column}
 * rather than `.num` keeps that distinction.
 */

import type { Checks } from "../harness/checks.js";
import type { RunView } from "../harness/run-view.js";

export interface UnawareCensus {
  readonly nUnaware: number;
  /** UNAWARE rows with a non-zero (or blank) `total_travel_distance_m`. */
  readonly moved: readonly string[];
  /** UNAWARE rows with a non-blank `time_started_tick`. */
  readonly started: readonly string[];
}

/**
 * Gate (e). Registers exactly one result — a SKIP when the run has no UNAWARE
 * residents (every pre-Phase-E run, and every E arm with `pAwareInit == 1`).
 *
 * Returns `null` on the SKIP path.
 */
export function checkUnawareImmobility(ck: Checks, run: RunView): UnawareCensus | null {
  const finalState = run.agents.column("final_state");
  const rows: number[] = [];
  for (let i = 0; i < finalState.length; i += 1) {
    if (finalState[i] === "UNAWARE") {
      rows.push(i);
    }
  }
  if (rows.length === 0) {
    ck.skip(`(e) [${run.name}] UNAWARE immobility`, "no UNAWARE residents in this run");
    return null;
  }

  const dist = run.num("total_travel_distance_m");
  const started = run.agents.column("time_started_tick");
  const agentId = run.agents.column("agent_id");

  const movedIds: string[] = [];
  const startedIds: string[] = [];
  for (const i of rows) {
    // `.fillna(-1) != 0` — NaN becomes -1, which is != 0, i.e. MOVED.
    const d = dist[i] as number;
    if ((Number.isNaN(d) ? -1 : d) !== 0) {
      movedIds.push(agentId[i] as string);
    }
    if ((started[i] as string).trim() !== "") {
      startedIds.push(agentId[i] as string);
    }
  }

  const lines: string[] = [];
  for (const [label, bad] of [
    ["moved", movedIds],
    ["has time_started_tick", startedIds],
  ] as const) {
    if (bad.length > 0) {
      lines.push(`${bad.length} UNAWARE rows ${label}; first 5: ${bad.slice(0, 5).join(", ")}`);
    }
  }

  ck.add(
    `(e) [${run.name}] UNAWARE residents never moved`,
    movedIds.length === 0 && startedIds.length === 0,
    `n_unaware=${rows.length}`,
    lines,
  );

  return { nUnaware: rows.length, moved: movedIds, started: startedIds };
}
