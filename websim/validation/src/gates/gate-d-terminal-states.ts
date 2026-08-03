/**
 * gate-d-terminal-states.ts — gate (d), terminal-state conservation.
 *
 * Source: `scripts/verify_E_runs.py`, `check_states()` (lines 474–502).
 * Spec: `WP8-SPEC-archive-gates.md` §3.6 — *"exact"*, three checks.
 *
 * Three statements, in the Python's order:
 *
 *  - **d.1** every `final_state` is in the closed vocabulary
 *    {@link STATE_TO_CENSUS}. A typo'd or newly-invented state is caught here
 *    and nowhere else; d.3 below would happily ignore it.
 *  - **d.2** the counts sum to the row count **and** to `numAgents`. Two
 *    different facts: rows-vs-counts catches a row the writer dropped on the
 *    floor, counts-vs-parameter catches a run that silently sampled a different
 *    population than it was asked for.
 *  - **d.3** each state's CSV count equals the corresponding
 *    `simulation.json.population.<key>`. This is conservation across two
 *    writers: the per-agent CSV and the aggregate census are produced by
 *    different code paths over the same population.
 *
 * ── The absent-key rule ────────────────────────────────────────────────────
 *
 * ```python
 * if key not in run.population:
 *     if csv_n:
 *         mism.append(f"{state}: csv={csv_n} manifest key '{key}' ABSENT")
 *     continue
 * ```
 *
 * A *missing* census key is a mismatch only when the CSV has rows in that
 * state. That asymmetry is what lets the same gate run over pre-Phase-E
 * manifests, which have no `unaware` key at all, without turning them red — and
 * it still goes red the moment such a manifest starts carrying UNAWARE rows it
 * does not account for. Folding the two cases together in either direction
 * would either break 94 archived runs or blind the gate to the exact drift it
 * exists to catch.
 *
 * ── d.2's `numAgents` clause is conditional in the source ──────────────────
 *
 * `(n_param is None or total == int(n_param))` — an absent `numAgents` makes
 * the clause vacuous rather than failing. Transcribed as-is: inventing a
 * failure the certified script does not have would be as much a divergence as
 * dropping one it does.
 */

import type { Checks } from "../harness/checks.js";
import { STATE_TO_CENSUS } from "../harness/constants.js";
import { pyIntOfFloat, type RunView } from "../harness/run-view.js";

export interface StateCensus {
  /** `final_state` value → row count, including values outside the vocabulary. */
  readonly counts: ReadonlyMap<string, number>;
  readonly unknownStates: readonly string[];
  readonly rows: number;
}

/** Gate (d). Registers exactly three checks. */
export function checkStates(ck: Checks, run: RunView): StateCensus {
  const states = run.agents.column("final_state");
  const counts = new Map<string, number>();
  for (const s of states) {
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }

  const vocabulary = new Set(Object.keys(STATE_TO_CENSUS));
  const unknown = [...new Set(states)].filter((s) => !vocabulary.has(s)).sort();
  ck.add(
    `(d) [${run.name}] final_state vocabulary`,
    unknown.length === 0,
    unknown.length > 0
      ? `unknown states=${JSON.stringify(unknown)}`
      : JSON.stringify([...new Set(states)].sort()),
  );

  const nRows = run.agents.rows.length;
  const nParam = run.params["numAgents"];
  let total = 0;
  for (const v of counts.values()) {
    total += v;
  }
  ck.add(
    `(d) [${run.name}] state counts sum to numAgents`,
    total === nRows &&
      (nParam === undefined || total === pyIntOfFloat(nParam, "numAgents")),
    `sum=${total} rows=${nRows} numAgents=${nParam === undefined ? "None" : String(nParam)}`,
  );

  const mismatches: string[] = [];
  for (const [state, key] of Object.entries(STATE_TO_CENSUS)) {
    const csvN = counts.get(state) ?? 0;
    if (!(key in run.population)) {
      if (csvN !== 0) {
        mismatches.push(`${state}: csv=${csvN} manifest key '${key}' ABSENT`);
      }
      continue;
    }
    const jsN = pyIntOfFloat(run.population[key], `population.${key}`);
    if (csvN !== jsN) {
      mismatches.push(`${state}: csv=${csvN} manifest.${key}=${jsN}`);
    }
  }
  ck.add(
    `(d) [${run.name}] agents.csv census == simulation.json census`,
    mismatches.length === 0,
    mismatches.length > 0
      ? mismatches.join("; ")
      : Object.keys(STATE_TO_CENSUS)
          .sort()
          .map((s) => `${s}=${counts.get(s) ?? 0}`)
          .join(" "),
  );

  return { counts, unknownStates: unknown, rows: nRows };
}
