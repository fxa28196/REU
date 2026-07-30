#!/usr/bin/env python3
"""Scenario-E metrics extractor: the inputs to scoring P-SE1..P-SE6.

One row per run directory. Used for the outcomes section of
docs/critique-response/13-PHASE-E-PREDICTIONS.md; every number quoted there
traces to a column here. Read-only over run dirs; never edits anything.

Usage: python scripts/score_scenarioE.py <run_dir> [<run_dir> ...]
Accepts SE-*, SEnc-* and archived ER-* dirs (counters absent -> zeros).
"""
import json
import pathlib
import sys

import pandas as pd


def metrics(run_dir):
    run_dir = pathlib.Path(run_dir)
    a = pd.read_csv(run_dir / "agents.csv", dtype=str, keep_default_na=False)
    man = json.loads((run_dir / "simulation.json").read_text(encoding="utf-8"))
    num = lambda c: pd.to_numeric(a[c], errors="coerce")

    aware = num("aware_initial").fillna(0) == 1
    departed = a["time_started_tick"].str.strip() != ""
    sheltered = a["final_state"] == "SHELTERED"

    have_counters = "blockages_encountered" in a.columns
    if have_counters:
        blk = num("blockages_encountered").fillna(0)
        psh = num("push_throughs").fillna(0)
        rrt = num("reroutes").fillna(0)
        stk = num("stuck_events").fillna(0)
    else:
        z = pd.Series(0.0, index=a.index)
        blk = psh = rrt = stk = z
    dose = num("inhaled_dose_ug")
    hrs_unhealthy = num("hours_above_unhealthy")
    mob = num("mobility_limited").fillna(0) == 1
    barriers = (num("heavy_belongings").fillna(0) + num("has_pet").fillna(0)
                + num("has_dependents").fillna(0))
    theta = num("theta_z")

    sh = pd.read_csv(run_dir / "shelters.csv", dtype=str)
    refusals = int(pd.to_numeric(sh["refused_count"], errors="coerce")
                   .fillna(0).sum())
    policy_ref = int(pd.to_numeric(sh.get("policy_refused"), errors="coerce")
                     .fillna(0).sum()) if "policy_refused" in sh.columns else 0
    # P-SE4 is about CAPACITY refusals; refused_count includes policy bounces.
    capacity_ref = refusals - policy_ref

    blocked = blk > 0
    return {
        "run": run_dir.name,
        "n": len(a),
        "sheltered": int(sheltered.sum()),
        "sheltered_share": round(sheltered.mean(), 4),
        "attempt_share_aware": round(departed[aware].mean(), 4) if aware.any() else None,
        "door_refusals_total": refusals,
        "capacity_refusals": capacity_ref,
        "policy_refusals": policy_ref,
        "mean_dose_ug": round(dose.mean(), 1),
        "mean_dose_never_departed": round(dose[~departed].mean(), 1),
        "mean_hrs_unhealthy_sheltered": round(hrs_unhealthy[sheltered].mean(), 2),
        "mean_hrs_unhealthy_never": round(hrs_unhealthy[~sheltered].mean(), 2),
        "blockage_events": int(blk.sum()),
        "residents_blocked": int(blocked.sum()),
        "pushes": int(psh.sum()),
        "reroutes": int(rrt.sum()),
        "stuck": int(stk.sum()),
        "push_share_events": round(psh.sum() / blk.sum(), 3) if blk.sum() else None,
        "stuck_over_pushes": round(stk.sum() / psh.sum(), 3) if psh.sum() else None,
        # P-SE5 selection diagnostics (empty stratum in the 2026-07-30 matrix)
        "mean_theta_pushers": round(theta[psh > 0].mean(), 3) if (psh > 0).any() else None,
        "mean_theta_rerouters": round(theta[(rrt > 0) & (psh == 0)].mean(), 3)
            if ((rrt > 0) & (psh == 0)).any() else None,
        "push_share_mob_limited": round((psh[blocked & mob] > 0).mean(), 3)
            if (blocked & mob).any() else None,
        "push_share_unburdened": round(
            (psh[blocked & ~mob & (barriers == 0)] > 0).mean(), 3)
            if (blocked & ~mob & (barriers == 0)).any() else None,
        "mean_dose_blocked": round(dose[blocked].mean(), 1) if blocked.any() else None,
        "refused_all_full_final": man.get("population", {}).get("refused_all_full"),
    }


def main():
    df = pd.DataFrame([metrics(d) for d in sys.argv[1:]])
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 50)
    print(df.to_string(index=False))


if __name__ == "__main__":
    main()
