/**
 * gate-analyze-run.ts — the `analyze_run.py` cross-file verification.
 *
 * Source: `scripts/analyze_run.py`, `verify()` (lines 113–204),
 * `routing_anomaly()` (lines 208–252) and the A-17 check `analyze()` registers
 * on top of them (lines 675–682). Plan §5.1/§5.2 list it as a WP9 port.
 *
 * ── What this gate is FOR ──────────────────────────────────────────────────
 *
 * `verify_E_runs.py` checks *invariants*. This checks *arithmetic*: every
 * aggregate the Java `OutcomeLogger` wrote into `simulation.json` is recomputed
 * from the raw per-agent rows and compared. It is the only gate in the suite
 * that would notice the manifest and the CSV describing two different runs.
 *
 * The statistic definitions have to match `OutcomeLogger`'s exactly or the gate
 * is comparing two different things and its tolerance is doing the work:
 * linear-interpolation percentiles, mean-absolute-difference Gini, travel stats
 * over **all** agents rather than the arrivals. See `stats.ts`.
 *
 * ## The tolerances, and what each is a budget for
 *
 * | check | tolerance | it is a budget for |
 * |---|---|---|
 * | recomputed exposure / travel stats | `approx`, `atol = 0.51`, `rtol = 1e-3` | the manifest prints 2–4 decimals |
 * | Gini | `approx`, `atol = 5e-3`, `rtol = 1e-3` | the manifest prints 4 decimals, and Gini is O(1) so 0.51 would be vacuous |
 * | VWE == dose | `< 1e-6`, **row-by-row** | nothing. It is an identity while the RR placeholders are 1.0, and 1e-6 is float noise |
 * | travel-time identity | `< 0.05` min | `(arrived − started) × minutesPerTick` is exact in principle; 0.05 min = 3 s covers the manifest's rounding of `travel_time_min` |
 * | per-agent peak ≤ field peak | `+ 0.01` | the field peak is printed `%.1f`; a per-agent peak equal to it must not fail on the print |
 * | walked ≤ planned + snap | `+ 200 m` (A-17) | *"legitimate snap gaps observed are < ~60 m"*; above 200 m is a routing/path-materialisation defect |
 *
 * `approx` is `max(atol, rtol × max(|a|, |b|))`, so **`atol` only governs small
 * magnitudes**. On `A-seed42`'s mean dose of 37,801.88 the effective budget is
 * the relative arm — 37.8, not 0.51 — and on the 2.6e8 total it is 258,640.
 * That is the certified script's behaviour and it is transcribed rather than
 * tightened, but it must be stated plainly rather than left to be inferred from
 * an `atol=0.51` in a signature: the tolerance on a recomputed exposure
 * statistic is **0.1 % relative**, and the corrosion suite pins it by nudging a
 * manifest value 0.079 % (passes) and 0.106 % (fails).
 *
 * ── A-17 is a FAILING check, deliberately ──────────────────────────────────
 *
 * Transcribed from the source comment: *"FAILING, not advisory
 * (10-FAILURE-MODES.md Finding A said the print-only version would let a 10 km
 * detour still report all-passed)."* That is this project's recurring lesson
 * written into someone else's code a year earlier — a check that prints is not
 * a check. It stays `ck.add`, never `ck.observe`.
 *
 * ── Divergence register ────────────────────────────────────────────────────
 *
 *  1. **`manifest["shelters"]` lookup.** The Python indexes
 *     `man_shelters[sid]` and would raise `KeyError` on a `shelters.csv` id the
 *     manifest does not carry. A crash is a red build, so the *outcome* is the
 *     same; this port records a named FAIL instead, because a gate that dies
 *     mid-run takes the remaining checks' evidence with it.
 *  2. **`str(vals[0]) == str(want)`.** Python's `str()` of a JSON float renders
 *     `42.0`, JavaScript's renders `42`. Every identity field the archive
 *     carries is a string or a JSON integer, so the two agree; a manifest that
 *     started writing `"random_seed": 42.0` would be read differently. The
 *     archive suite pins the current shapes.
 *  3. **`avg_pm25 <= peak_pm25`.** The Python compares two independently
 *     `dropna`'d Series, which pandas only permits when the labels match — i.e.
 *     it silently requires the two columns to be blank in exactly the same
 *     rows, and raises otherwise. This port compares row-wise over rows where
 *     **both** are present and records the count, which is the same verdict on
 *     every archived run (no run has a blank in either column) without the
 *     raise.
 *  4. **Missing manifest blocks.** `population`, `smoke_field`,
 *     `travel_m`, `exposure_ugm3h` and `parameters.minutesPerTick` are indexed
 *     directly by the Python and raise `KeyError` when absent. Same reasoning as
 *     (1): this port records a FAIL on the affected checks and keeps going, so
 *     one missing block cannot suppress the other hundred checks' evidence. The
 *     verdict — red — is identical either way.
 */

import type { Checks } from "../harness/checks.js";
import { fixed, pyFloat, showValue, type ManifestJson, type RunView } from "../harness/run-view.js";

import { approx, gini, nanMax, nanMean, nanMin, nanSum, pctl } from "./stats.js";

/**
 * *"Walked-vs-shortest-path surplus above this many metres is flagged as a
 * routing/data artifact (legitimate snap gaps observed are < ~60 m)."*
 */
export const DETOUR_FLAG_M = 200.0;

/** The five states `analyze_run.py` reconciles (it predates UNAWARE). */
const CENSUS_PAIRS: readonly (readonly [string, string])[] = [
  ["PRE_EVAC", "pre_evac"],
  ["SHELTERED", "sheltered"],
  ["EN_ROUTE", "en_route"],
  ["UNREACHABLE", "unreachable"],
  ["REFUSED_ALL_FULL", "refused_all_full"],
];

/** The nine exposure statistics the manifest carries and this gate recomputes. */
const EXPOSURE_KEYS: readonly string[] = [
  "mean",
  "median",
  "min",
  "p25",
  "p75",
  "p90",
  "max",
  "total",
  "gini",
];

function record(value: unknown): ManifestJson {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as ManifestJson)
    : {};
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

export interface RoutingAnomaly {
  readonly basis: string;
  readonly nWithRoute: number;
  readonly nFlagged: number;
  readonly flagThresholdM: number;
  readonly detourMaxM: number | null;
}

/**
 * `routing_anomaly()` — walked distance vs the PLANNED route, per agent.
 *
 * The reference is `planned_route_m` (the sum of every planned leg's network
 * length, *including* re-routes after a capacity refusal) plus `snap_gap_m`
 * (real walked distance the network legs cannot cover: encampment → first
 * street node, and the tiny per-leg endpoint gaps). Runs that predate the A-17
 * fix have neither column and fall back to the single-leg
 * `network_dist_to_shelter_m`, which is identical whenever no agent was ever
 * refused — true for every archived pre-fix run.
 */
export function routingAnomaly(run: RunView): RoutingAnomaly {
  let basis: string;
  let planned: readonly number[];
  if (run.agents.has("planned_route_m")) {
    basis = "planned_route_m (per-leg, refusal-aware)";
    const base = run.num("planned_route_m");
    if (run.agents.has("snap_gap_m")) {
      basis = "planned_route_m + snap_gap_m (per-leg, refusal-aware)";
      const snap = run.agents.numFilled("snap_gap_m");
      planned = base.map((v, i) => v + (snap[i] as number));
    } else {
      planned = base;
    }
  } else {
    basis = "network_dist_to_shelter_m (single-leg fallback, pre-fix runs)";
    planned = run.num("network_dist_to_shelter_m");
  }

  const usePlannedFilter = run.agents.has("planned_route_m");
  const walked = run.num("total_travel_distance_m");
  const detours: number[] = [];
  for (let i = 0; i < planned.length; i += 1) {
    const p = planned[i] as number;
    // `planned_m.notna() & (planned_m > 0)` for the modern basis;
    // `dropna(subset=["planned_m"])` for the fallback.
    const keep = usePlannedFilter ? !Number.isNaN(p) && p > 0 : !Number.isNaN(p);
    if (keep) {
      detours.push((walked[i] as number) - p);
    }
  }
  // `NaN > DETOUR_FLAG_M` is False in pandas, so a blank walked distance is not
  // flagged. Number.isNaN keeps that behaviour explicit rather than accidental.
  const nFlagged = detours.reduce((a, d) => a + (d > DETOUR_FLAG_M ? 1 : 0), 0);
  const maxDetour = detours.length === 0 ? null : nanMax(detours);

  return {
    basis,
    nWithRoute: detours.length,
    nFlagged,
    flagThresholdM: DETOUR_FLAG_M,
    detourMaxM: maxDetour === null || Number.isNaN(maxDetour) ? null : Math.round(maxDetour * 10) / 10,
  };
}

/**
 * `analyze_run.py`'s `verify()` plus the A-17 routing gate.
 *
 * Check count is data-dependent: 1 (rows) + 5 (census) + 1 (flag) + 4 (identity
 * columns) + 2 per shelter + 1 (occupancy sum) + 9 (exposure) + 2 (RR/VWE)
 * + 3 (travel) + 1 (travel-time) + 2 (PM2.5 bounds) + 1 (person-hours)
 * + 1 (out-of-range) + 1 (A-17). For a 36-shelter run that is **106**.
 */
export function checkAnalyzeRun(ck: Checks, run: RunView): void {
  const name = run.name;
  const pop = run.population;
  const rep = run.repro;
  const agents = run.agents;

  // --- structural -----------------------------------------------------------
  ck.add(
    `(ar) [${name}] agents.csv row count == manifest n_agents`,
    agents.rows.length === numberOrNull(pop["n_agents"]),
    `${agents.rows.length} vs ${showValue(pop["n_agents"])}`,
  );

  const states = agents.column("final_state");
  const census = new Map<string, number>();
  for (const s of states) {
    census.set(s, (census.get(s) ?? 0) + 1);
  }
  for (const [state, key] of CENSUS_PAIRS) {
    const got = census.get(state) ?? 0;
    ck.add(
      `(ar) [${name}] census ${state} == manifest ${key}`,
      got === numberOrNull(pop[key]),
      `${got} vs ${showValue(pop[key])}`,
    );
  }

  const reached = agents.column("reached_shelter");
  let flagOk = true;
  for (let i = 0; i < states.length; i += 1) {
    if ((reached[i] === "yes") !== (states[i] === "SHELTERED")) {
      flagOk = false;
      break;
    }
  }
  ck.add(`(ar) [${name}] reached_shelter == (final_state SHELTERED)`, flagOk);

  // --- identity columns constant and equal to the manifest ------------------
  const identity: readonly (readonly [string, unknown])[] = [
    ["sim_id", rep["sim_id"]],
    ["commit", rep["git_commit"]],
    ["random_seed", rep["random_seed"]],
    ["data_version", rep["data_version_tag"]],
  ];
  for (const [col, want] of identity) {
    const values = [...new Set(agents.column(col))];
    ck.add(
      `(ar) [${name}] ${col} constant and == manifest`,
      values.length === 1 && String(values[0]) === String(want),
      `${JSON.stringify(values.slice(0, 3))} vs ${showValue(want)}`,
    );
  }

  // --- shelter cross-checks -------------------------------------------------
  const admitted = new Map<string, number>();
  const shelterReached = agents.column("shelter_reached");
  for (let i = 0; i < states.length; i += 1) {
    if (states[i] === "SHELTERED") {
      const sid = shelterReached[i] as string;
      admitted.set(sid, (admitted.get(sid) ?? 0) + 1);
    }
  }
  const manShelters = new Map<string, ManifestJson>();
  const shelterList = run.manifest["shelters"];
  if (Array.isArray(shelterList)) {
    for (const s of shelterList) {
      const rec = record(s);
      manShelters.set(String(rec["id"] ?? ""), rec);
    }
  }

  const shelterIds = run.shelters.column("shelter_id");
  const finalOcc = run.shelters.num("final_occupancy");
  const refusedCount = run.shelters.num("refused_count");
  for (let r = 0; r < shelterIds.length; r += 1) {
    const sid = shelterIds[r] as string;
    const occ = finalOcc[r] as number;
    ck.add(
      `(ar) [${name}] shelter ${sid}: agents.csv arrivals == shelters.csv final_occupancy`,
      (admitted.get(sid) ?? 0) === occ,
      `${admitted.get(sid) ?? 0} vs ${occ}`,
    );
    const m = manShelters.get(sid);
    ck.add(
      `(ar) [${name}] shelter ${sid}: shelters.csv == simulation.json occupancy/refused`,
      m !== undefined &&
        numberOrNull(m["final_occupancy"]) === occ &&
        numberOrNull(m["refused"]) === (refusedCount[r] as number),
      m === undefined
        ? `shelter_id '${sid}' is absent from simulation.json.shelters`
        : `csv occ=${occ} refused=${refusedCount[r]} vs manifest occ=${showValue(
            m["final_occupancy"],
          )} refused=${showValue(m["refused"])}`,
    );
  }
  const occSum = Math.trunc(nanSum(finalOcc));
  ck.add(
    `(ar) [${name}] sum(final_occupancy) == n sheltered`,
    occSum === numberOrNull(pop["sheltered"]),
    `${occSum} vs ${showValue(pop["sheltered"])}`,
  );

  // --- recomputed exposure statistics ---------------------------------------
  const exp = run.num("cumulative_dose_ugm3h");
  const man = record(pop["exposure_ugm3h"]);
  const recomputed: Readonly<Record<string, number>> = {
    mean: nanMean(exp),
    median: pctl(exp, 50),
    min: nanMin(exp),
    p25: pctl(exp, 25),
    p75: pctl(exp, 75),
    p90: pctl(exp, 90),
    max: nanMax(exp),
    total: nanSum(exp),
    gini: gini(exp),
  };
  for (const k of EXPOSURE_KEYS) {
    const v = recomputed[k] as number;
    const atol = k === "gini" ? 5e-3 : 0.51;
    ck.add(
      `(ar) [${name}] exposure ${k} recomputed == manifest`,
      approx(v, numberOrNull(man[k]), atol),
      `${fixed(v, 4)} vs ${showValue(man[k])}`,
    );
  }

  // --- VWE: with all RRs = 1.0, VWE must equal raw exposure row-by-row ------
  const ageRr = run.num("age_rr");
  const comorbidityRr = run.num("comorbidity_rr");
  const rrOne = ageRr.every((v) => v === 1.0) && comorbidityRr.every((v) => v === 1.0);
  ck.add(`(ar) [${name}] all RR placeholders == 1.0`, rrOne);
  const vwe = run.num("vwe_ugm3h");
  const vweDelta = nanMax(vwe.map((v, i) => Math.abs(v - (exp[i] as number))));
  ck.add(
    `(ar) [${name}] VWE == exposure row-by-row (placeholder RRs)`,
    vweDelta < 1e-6,
    `max |vwe - dose| = ${vweDelta}`,
  );

  // --- travel statistics, over ALL agents -----------------------------------
  const trav = run.num("total_travel_distance_m");
  const mant = record(pop["travel_m"]);
  const travelPairs: readonly (readonly [string, number])[] = [
    ["mean", nanMean(trav)],
    ["median", pctl(trav, 50)],
    ["max", nanMax(trav)],
  ];
  for (const [k, v] of travelPairs) {
    ck.add(
      `(ar) [${name}] travel_m ${k} recomputed == manifest`,
      approx(v, numberOrNull(mant[k])),
      `${fixed(v, 2)} vs ${showValue(mant[k])}`,
    );
  }

  // --- per-row internal consistency -----------------------------------------
  const mptRaw = run.params["minutesPerTick"];
  const mpt = mptRaw === undefined ? Number.NaN : pyFloat(mptRaw, "minutesPerTick");
  const arrivedTick = run.num("time_arrived_tick");
  const startedTick = run.num("time_started_tick");
  const travelMin = run.num("travel_time_min");
  const residuals: number[] = [];
  for (let i = 0; i < arrivedTick.length; i += 1) {
    const a = arrivedTick[i] as number;
    const s = startedTick[i] as number;
    const t = travelMin[i] as number;
    if (Number.isNaN(a) || Number.isNaN(s) || Number.isNaN(t)) {
      continue;
    }
    residuals.push(Math.abs((a - s) * mpt - t));
  }
  const ttMax = residuals.length === 0 ? 0 : nanMax(residuals);
  ck.add(
    `(ar) [${name}] travel_time_min == (arrived - started) * minutesPerTick`,
    residuals.length === 0 ? true : ttMax < 0.05,
    `n=${residuals.length} max residual ${fixed(ttMax, 6)} min`,
  );

  const smoke = record(run.manifest["smoke_field"]);
  const fieldPeakRaw = smoke["peak_hourly_ugm3"];
  const fieldPeak = fieldPeakRaw === undefined ? Number.NaN : Number(fieldPeakRaw);
  const peaks = run.num("peak_pm25_ugm3");
  // `(series <= x).all()` — a NaN comparison is False in pandas, so a blank
  // per-agent peak FAILS. Reproduced deliberately, not defended against.
  const peakBad = peaks.reduce((a, v) => a + (v <= fieldPeak + 0.01 ? 0 : 1), 0);
  ck.add(
    `(ar) [${name}] per-agent peak PM2.5 <= smoke-field peak`,
    peakBad === 0,
    `${peakBad} row(s) above ${showValue(fieldPeakRaw)} + 0.01`,
  );

  const avgs = run.num("avg_pm25_ugm3");
  let avgBad = 0;
  let avgCompared = 0;
  for (let i = 0; i < avgs.length; i += 1) {
    const a = avgs[i] as number;
    const p = peaks[i] as number;
    if (Number.isNaN(a) || Number.isNaN(p)) {
      continue;
    }
    avgCompared += 1;
    if (!(a <= p + 0.01)) {
      avgBad += 1;
    }
  }
  ck.add(
    `(ar) [${name}] per-agent avg PM2.5 <= peak PM2.5`,
    avgBad === 0,
    `${avgBad} of ${avgCompared} compared row(s) violate avg <= peak + 0.01`,
  );

  const hoursSum = nanSum(run.num("hours_above_unhealthy"));
  const manHours = numberOrNull(pop["total_person_hours_above_unhealthy"]);
  ck.add(
    `(ar) [${name}] sum(hours_above_unhealthy) == manifest person-hours`,
    manHours !== null && Math.abs(hoursSum - manHours) < 0.51,
    `${fixed(hoursSum, 2)} vs ${showValue(pop["total_person_hours_above_unhealthy"])}`,
  );

  ck.add(
    `(ar) [${name}] smoke field out_of_range_lookups == 0`,
    smoke["out_of_range_lookups"] === 0,
    `out_of_range_lookups=${showValue(smoke["out_of_range_lookups"])}`,
  );

  // --- A-17 routing-integrity gate (FAILING, not advisory) ------------------
  const anomaly = routingAnomaly(run);
  ck.add(
    `(ar) [${name}] walked distance <= planned route + ${DETOUR_FLAG_M.toFixed(0)} m (A-17)`,
    anomaly.nFlagged === 0,
    `basis ${anomaly.basis}; max surplus ${anomaly.detourMaxM} m over ` +
      `${anomaly.nWithRoute} routed agents`,
  );
}
