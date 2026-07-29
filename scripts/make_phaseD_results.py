#!/usr/bin/env python3
"""Round-5 Phase D result tables (D1 window decomposition, D2 bed sweep).

Reads the corrected-graph runs in Geography/output/ (u27-* names, or the
canonical names after the post-batch rename — set PREFIX accordingly).

D1: for each window (24, 72, 312 h) and arm A/B/C (seeds 42-44):
  mean inhaled dose, B->C dose ratio, and the WALKING share of C's dose
  benefit vs B. Dose decomposes exactly because IR is constant per state:
     dose_walk = 1.62 * exposure_while_traveling_ugm3h
     dose_rest = 0.61 * (cumulative_dose_ugm3h - exposure_while_traveling)
  (identity checked against inhaled_dose_ug per agent, tolerance 1%).

D2: for s in {0.8, 1.0=B, 1.2, 1.4, 1.6} (seeds 42-44): sheltered %, refused,
  beds empty, mobility-limited vs unimpaired access gap; crossing point vs
  arm C's access.
"""
import json
import pathlib
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/final/results-2026"
PREFIX = ""
SEEDS = (42, 43, 44)


def rd(name):
    return ROOT / f"Geography/output/{PREFIX}{name}"


def agents(name):
    return pd.read_csv(rd(name) / "agents.csv")


def manifest(name):
    return json.loads((rd(name) / "simulation.json").read_text(encoding="utf-8"))


def dose_split(df):
    walk = 1.62 * df.exposure_while_traveling_ugm3h
    rest = 0.61 * (df.cumulative_dose_ugm3h - df.exposure_while_traveling_ugm3h)
    recon = walk + rest
    bad = (recon - df.inhaled_dose_ug).abs() > 0.01 * df.inhaled_dose_ug.clip(lower=1)
    return walk.sum(), rest.sum(), int(bad.sum())


def access(df):
    return (df.final_state == "SHELTERED").mean()


def mobility_gap(df):
    m = df[df.mobility_limited == 1]
    u = df[df.mobility_limited == 0]
    return 100 * (access(u) - access(m))


def d1():
    rows = []
    for hours, tag in ((24, "W24"), (72, "W72"), (312, "")):
        for arm in "ABC":
            for seed in SEEDS:
                name = (f"{tag}{arm}-n6842-seed{seed}" if tag
                        else f"{arm}2026-n6842-seed{seed}")
                df = agents(name)
                w, r, bad = dose_split(df)
                rows.append(dict(window=hours, arm=arm, seed=seed,
                                 mean_dose_ug=df.inhaled_dose_ug.mean(),
                                 walk_dose_ug=w / len(df), rest_dose_ug=r / len(df),
                                 identity_violations=bad,
                                 sheltered_pct=100 * access(df)))
    t = pd.DataFrame(rows)
    t.to_csv(OUT / "d1_window_rows.csv", index=False)
    # summary: B->C ratio + walking share of benefit, per window (seed-mean)
    lines = ["| window h | B mean dose | C mean dose | B/C ratio | walking share of C benefit |",
             "|---|---|---|---|---|"]
    for hours in (24, 72, 312):
        tb = t[(t.window == hours) & (t.arm == "B")].mean(numeric_only=True)
        tc = t[(t.window == hours) & (t.arm == "C")].mean(numeric_only=True)
        benefit = tb.mean_dose_ug - tc.mean_dose_ug
        walkben = tb.walk_dose_ug - tc.walk_dose_ug
        share = 100 * walkben / benefit if benefit else float("nan")
        lines.append(f"| {hours} | {tb.mean_dose_ug:.1f} | {tc.mean_dose_ug:.1f} | "
                     f"{tb.mean_dose_ug / tc.mean_dose_ug:.2f} | {share:.1f}% |")
    (OUT / "d1_summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


def d2():
    c_access = []
    for seed in SEEDS:
        c_access.append(100 * access(agents(f"C2026-n6842-seed{seed}")))
    c_mean = sum(c_access) / len(c_access)
    rows = []
    scales = [(0.8, "BS080"), (1.0, None), (1.2, "BS120"), (1.4, "BS140"), (1.6, "BS160")]
    lines = [f"(arm C mean access = {c_mean:.2f}%, range "
             f"{min(c_access):.2f}-{max(c_access):.2f})",
             "| s (x demand) | beds | sheltered % (mean, range) | mobility gap pp (mean) | reaches C? |",
             "|---|---|---|---|---|"]
    for s, fam in scales:
        accs, gaps = [], []
        for seed in SEEDS:
            name = (f"{fam}-n6842-seed{seed}" if fam else f"B2026-n6842-seed{seed}")
            df = agents(name)
            accs.append(100 * access(df))
            gaps.append(mobility_gap(df))
        rows.append(dict(scale=s, sheltered_mean=sum(accs) / 3,
                         sheltered_min=min(accs), sheltered_max=max(accs),
                         mobility_gap_pp=sum(gaps) / 3))
        reach = "YES" if min(accs) >= c_mean else "no"
        lines.append(f"| {s} | {round(6842 * s)} | {sum(accs)/3:.2f} "
                     f"({min(accs):.2f}-{max(accs):.2f}) | {sum(gaps)/3:.1f} | {reach} |")
    pd.DataFrame(rows).to_csv(OUT / "d2_sweep_rows.csv", index=False)
    (OUT / "d2_summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    d1()
    d2()
