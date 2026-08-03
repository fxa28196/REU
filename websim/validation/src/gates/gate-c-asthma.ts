/**
 * gate-c-asthma.ts — gate (c), the asthma negative control (V39 revised).
 *
 * Source: `scripts/verify_E_runs.py`, `check_asthma_control()` (lines 405–471).
 * Spec: `WP8-SPEC-archive-gates.md` §3.6.
 *
 * ── What a negative control is for ─────────────────────────────────────────
 *
 * Asthma has **no mechanism** anywhere in the model that touches gait or dose.
 * It is sampled, exported, and used for nothing but stratified reporting. So
 * within the stratum that holds the two conditions that *do* touch gait
 * (`copd_flag == 0 & mobility_limited == 0`), asthmatic and non-asthmatic
 * residents must be statistically indistinguishable on `walking_speed_mps` and
 * `inhaled_dose_ug`. If they are not, something has wired a covariate into a
 * channel that was never supposed to see it.
 *
 * This is the gate class that catches the failure mode this project keeps
 * re-learning: it asserts a *null*, so it cannot be satisfied by the code
 * merely running. It goes red when a mechanism appears that nobody declared.
 *
 * ── The two different tests, and why they differ ───────────────────────────
 *
 * | column | rule | why |
 * |---|---|---|
 * | `walking_speed_mps` | `abs(m1 - m0) <= 0.02` m/s | an *absolute* gate. Speed is drawn from the same distribution for both cells, so any difference is sampling noise; 0.02 m/s is well inside noise at n ≈ 4,900 and well outside any mechanism worth having. |
 * | `inhaled_dose_ug` | `abs(z) <= 3.0`, `z = (m1 - m0) / sqrt(var1/n1 + var0/n0)` | a *studentised* gate. Dose has enormous heterogeneity (min 147, max 54,003 µg·m⁻³·h in `A-seed42`), so a fixed absolute budget would be either vacuous or unmeetable. |
 *
 * `var` is **ddof = 1** on both cells — pandas' default. Using the population
 * variance would shrink the SE and manufacture exceedances.
 *
 * ── Departure timing is an OBSERVATION, never a gate ───────────────────────
 *
 * V39 routes vulnerability (including asthma) into the departure hazard through
 * `gammaVuln`, so in an E arm the two cells legitimately depart at different
 * times. The Python prints the delta and gates it *never* — in either mode,
 * because there is no mechanism for it at `gammaVuln == 0` and a declared one
 * above zero. The port keeps it on {@link Checks.observe}, which does not enter
 * `results`, so it can never be mistaken for a check.
 *
 * And when `gammaVuln > 0` the Python prints a CAVEAT: departure time feeds
 * dose, so a dose exceedance in an ER arm is *the timing channel*, to be
 * adjudicated rather than silently accepted. That caveat is transcribed
 * verbatim; deleting it would turn an honest amber into a false red.
 */

import type { Checks } from "../harness/checks.js";
import { fixed, pyTruthy, type RunView } from "../harness/run-view.js";

import { dropna, nanMean, varDdof1 } from "./stats.js";

/** The five columns gate (c) needs, in the Python's order. */
export const ASTHMA_CONTROL_COLUMNS: readonly string[] = [
  "asthma_flag",
  "copd_flag",
  "mobility_limited",
  "walking_speed_mps",
  "inhaled_dose_ug",
];

/** `f"{v:+.4f}"` / `f"{v:+.1f}"` — Python's explicit-sign format. */
function signed(value: number, digits: number): string {
  const text = fixed(Math.abs(value), digits);
  return `${value < 0 ? "-" : "+"}${text}`;
}

export interface AsthmaStratum {
  /** `int(stratum.sum())` — rows with copd == 0, mobility == 0, asthma present. */
  readonly n: number;
  readonly nAsthma1: number;
  readonly nAsthma0: number;
}

/**
 * Gate (c). Registers exactly one check in every path.
 *
 * Returns the stratum census, or `null` when the gate failed before it could
 * form one (missing columns, or an empty / single-valued stratum).
 */
export function checkAsthmaControl(ck: Checks, run: RunView): AsthmaStratum | null {
  const missing = ASTHMA_CONTROL_COLUMNS.filter((c) => !run.agents.has(c));
  if (missing.length > 0) {
    ck.add(
      `(c) [${run.name}] asthma negative control`,
      false,
      `agents.csv missing ${JSON.stringify(missing)}`,
    );
    return null;
  }

  const asthma = run.num("asthma_flag");
  const copd = run.num("copd_flag");
  const mob = run.num("mobility_limited");

  // `(copd == 0) & (mob == 0) & asthma.notna()`. A NaN never equals 0 in
  // pandas, so an unpopulated copd/mobility cell drops the row from the
  // stratum rather than silently joining it.
  const stratum: number[] = [];
  for (let i = 0; i < run.agents.rows.length; i += 1) {
    if (copd[i] === 0 && mob[i] === 0 && !Number.isNaN(asthma[i] as number)) {
      stratum.push(i);
    }
  }
  const nStr = stratum.length;
  const distinct = new Set(stratum.map((i) => asthma[i] as number));
  if (nStr === 0 || distinct.size < 2) {
    ck.add(
      `(c) [${run.name}] asthma negative control`,
      false,
      "conditioning stratum (copd==0 & mobility_limited==0) is empty " +
        "or single-valued -- heterogeneity columns unpopulated?",
    );
    return null;
  }

  // `float(run.params.get("gammaVuln", 0.0) or 0.0)` — Python's `or` collapses
  // a falsy 0 / "" / None to 0.0 before the float().
  const rawGamma = run.params["gammaVuln"];
  const gamma = pyTruthy(rawGamma) ? Number(rawGamma) : 0.0;

  const lines: string[] = [];
  if (gamma > 0) {
    lines.push(
      `CAVEAT gammaVuln=${gamma}: V39 routes asthma into the departure ` +
        "hazard, and departure time feeds dose. A dose exceedance here is " +
        "the timing channel, not a gait channel -- adjudicate, do not " +
        "silently accept.",
    );
  }

  const cells = (column: string): { a1: readonly number[]; a0: readonly number[] } => {
    const v = run.num(column);
    const a1: number[] = [];
    const a0: number[] = [];
    for (const i of stratum) {
      const flag = asthma[i] as number;
      const value = v[i] as number;
      if (flag === 1) {
        a1.push(value);
      } else if (flag === 0) {
        a0.push(value);
      }
    }
    return { a1: dropna(a1), a0: dropna(a0) };
  };

  let ok = true;
  let census: AsthmaStratum = { n: nStr, nAsthma1: 0, nAsthma0: 0 };

  const specs: readonly (readonly [string, number | null])[] = [
    ["walking_speed_mps", 0.02],
    ["inhaled_dose_ug", null],
  ];

  for (const [col, gate] of specs) {
    const { a1, a0 } = cells(col);
    if (col === "walking_speed_mps") {
      census = { n: nStr, nAsthma1: a1.length, nAsthma0: a0.length };
    }
    if (a1.length < 2 || a0.length < 2) {
      ok = false;
      lines.push(`${col}: stratum too small (n1=${a1.length} n0=${a0.length})`);
      continue;
    }
    const m1 = nanMean(a1);
    const m0 = nanMean(a0);
    const se = Math.sqrt(varDdof1(a1) / a1.length + varDdof1(a0) / a0.length);
    const z = se > 0 ? (m1 - m0) / se : 0.0;
    let passed: boolean;
    if (gate !== null) {
      passed = Math.abs(m1 - m0) <= gate;
      lines.push(
        `${col}: asthma1=${fixed(m1, 4)} (n=${a1.length}) ` +
          `asthma0=${fixed(m0, 4)} (n=${a0.length}) |delta|=${fixed(Math.abs(m1 - m0), 4)} ` +
          `<= ${gate} ? ${passed ? "yes" : "NO"}  (z=${fixed(z, 2)})`,
      );
    } else {
      passed = Math.abs(z) <= 3.0;
      lines.push(
        `${col}: asthma1=${fixed(m1, 4)} (n=${a1.length}) ` +
          `asthma0=${fixed(m0, 4)} (n=${a0.length}) delta=${signed(m1 - m0, 4)} ` +
          `z=${fixed(z, 2)} |z|<=3 ? ${passed ? "yes" : "NO"}`,
      );
    }
    ok = ok && passed;
  }

  // Departure timing: an OBSERVATION in every mode, gated never (V39).
  const tCells = cells("time_started_tick");
  if (tCells.a1.length > 0 && tCells.a0.length > 0) {
    const t1 = nanMean(tCells.a1);
    const t0 = nanMean(tCells.a0);
    lines.push(
      `OBSERVATION time_started_tick: asthma1=${fixed(t1, 1)} ` +
        `(n=${tCells.a1.length}) asthma0=${fixed(t0, 1)} (n=${tCells.a0.length}) ` +
        `delta=${signed(t1 - t0, 1)} ticks -- not gated (V39)`,
    );
  } else {
    lines.push(
      "OBSERVATION time_started_tick: no departures in one asthma cell -- nothing to report",
    );
  }

  ck.add(
    `(c) [${run.name}] asthma negative control (V39 revised)`,
    ok,
    `stratum copd==0 & mobility_limited==0, n=${nStr}`,
    lines,
  );
  return census;
}
