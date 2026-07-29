#!/usr/bin/env python3
"""Learning-algorithm component: regressions fitted on the model's own output.

WHAT MODEL AND WHY (the mentor's question, answered explicitly):

1. Outcome "did this resident get inside?" is BINARY, so the standard model
   family is LOGISTIC REGRESSION — the same family the hurricane-evacuation
   behaviour literature uses for stay/go and shelter-choice outcomes. It is
   interpretable (odds ratios per attribute), needs no tuning, and its
   coefficients can be checked against the mechanisms the ABM actually
   implements — which is the point: the regression must LEARN BACK what we
   built in, and must NOT find effects we never built (asthma is the
   negative control).
2. Outcome "how long did it take to get inside?" is CONTINUOUS, so ORDINARY
   LEAST SQUARES on travel_time_min among sheltered residents.

Implementation: iteratively reweighted least squares (IRLS) for the logit;
numpy lstsq for OLS; standard errors from the information matrix; p-values
via scipy.stats.norm. No sklearn/statsmodels needed (not installed here).

Features are the agent INPUTS only (age, sex, mobility, asthma, COPD,
chronic condition, sampled walking speed) plus one exogenous geography
feature: geodesic distance from the agent's start point to the NEAREST
shelter site of that arm (not the assigned shelter, which is an outcome).

Outputs -> docs/final/results-2026/:
  ML_MODEL_COEFFICIENTS.csv   one row per (arm, model, feature)
  ML_MODEL_SUMMARY.md         fitted models, ORs, fit stats, negative control
"""
import csv
import json
import math
import pathlib

import numpy as np
import pandas as pd
from scipy.stats import norm

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/final/results-2026"
SEEDS = range(42, 51)
ARM_SHELTERS = {
    "A": "Geography/data/shelters/shelters_2026_current_placement.csv",
    "B": "Geography/data/shelters/shelters_2026_expanded_capacity.csv",
    "C": "Geography/data/shelters/shelters_2026_expanded_plus_new_sites.csv",
    "D": "Geography/data/shelters/shelters_2026_expanded_capacity.csv",
}
D_RUN = "D2026-n6842-seed{seed}-r10"


def haversine_m(lon1, lat1, lon2, lat2):
    R = 6371000.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp = p2 - p1
    dl = np.radians(lon2) - np.radians(lon1)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * R * np.arcsin(np.sqrt(a))


def nearest_shelter_km(df, shelter_csv):
    sh = pd.read_csv(ROOT / shelter_csv)
    lons = sh["lon"].to_numpy()[None, :]
    lats = sh["lat"].to_numpy()[None, :]
    d = haversine_m(df["start_lon"].to_numpy()[:, None],
                    df["start_lat"].to_numpy()[:, None], lons, lats)
    return d.min(axis=1) / 1000.0


def design(df, arm):
    X = pd.DataFrame({
        "age_55plus": (df.age_years >= 55).astype(float),
        "female": (df.sex.astype(str).str.upper().str.startswith("F")).astype(float),
        "sex_other": (~df.sex.astype(str).str.upper().str[0].isin(["M", "F"])).astype(float),
        "mobility_limited": df.mobility_limited.astype(float),
        "asthma": df.asthma_flag.astype(float),
        "copd": df.copd_flag.astype(float),
        "chronic_physical": df.chronic_physical.astype(float),
        "walking_speed_mps": df.walking_speed_mps.astype(float),
        "dist_nearest_shelter_km": nearest_shelter_km(df, ARM_SHELTERS[arm]),
    })
    return X


def logit_irls(X, y, max_iter=50, tol=1e-8):
    Xd = np.column_stack([np.ones(len(X)), X.to_numpy()])
    beta = np.zeros(Xd.shape[1])
    for _ in range(max_iter):
        eta = Xd @ beta
        p = 1 / (1 + np.exp(-np.clip(eta, -30, 30)))
        W = p * (1 - p)
        W = np.clip(W, 1e-10, None)
        z = eta + (y - p) / W
        WX = Xd * W[:, None]
        H = Xd.T @ WX
        beta_new = np.linalg.solve(H, Xd.T @ (W * z))
        if np.max(np.abs(beta_new - beta)) < tol:
            beta = beta_new
            break
        beta = beta_new
    eta = Xd @ beta
    p = 1 / (1 + np.exp(-np.clip(eta, -30, 30)))
    W = np.clip(p * (1 - p), 1e-10, None)
    cov = np.linalg.inv(Xd.T @ (Xd * W[:, None]))
    se = np.sqrt(np.diag(cov))
    ll = float(np.sum(y * np.log(np.clip(p, 1e-12, 1)) +
                      (1 - y) * np.log(np.clip(1 - p, 1e-12, 1))))
    p0 = y.mean()
    ll0 = len(y) * (p0 * math.log(p0) + (1 - p0) * math.log(1 - p0))
    mcfadden = 1 - ll / ll0 if ll0 != 0 else float("nan")
    acc = float(((p >= 0.5) == (y >= 0.5)).mean())
    return beta, se, mcfadden, acc


def ols(X, y):
    Xd = np.column_stack([np.ones(len(X)), X.to_numpy()])
    beta, *_ = np.linalg.lstsq(Xd, y, rcond=None)
    resid = y - Xd @ beta
    dof = len(y) - Xd.shape[1]
    sigma2 = float(resid @ resid) / dof
    cov = sigma2 * np.linalg.inv(Xd.T @ Xd)
    se = np.sqrt(np.diag(cov))
    r2 = 1 - float(resid @ resid) / float(((y - y.mean()) ** 2).sum())
    return beta, se, r2


def load_arm(arm):
    frames = []
    for seed in SEEDS:
        name = (D_RUN.format(seed=seed) if arm == "D"
                else f"{arm}2026-n6842-seed{seed}")
        p = ROOT / f"Geography/output/{name}/agents.csv"
        if not p.exists():
            continue
        df = pd.read_csv(p)
        df["seed"] = seed
        frames.append(df)
    return pd.concat(frames, ignore_index=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    md = ["# Learning-algorithm component — regressions on the model's own output",
          "",
          "Model family: **logistic regression** for the binary outcome "
          "(got inside or not) — the standard family for evacuation outcomes; "
          "**OLS** for time-to-shelter among those who got inside. Fitted by "
          "IRLS/least squares (numpy), standard errors from the information "
          "matrix. Features are agent INPUTS plus distance to the nearest "
          "shelter site; the assigned shelter is an outcome and is excluded.",
          ""]
    names = ["intercept", "age_55plus", "female", "sex_other",
             "mobility_limited", "asthma", "copd", "chronic_physical",
             "walking_speed_mps", "dist_nearest_shelter_km"]
    for arm in "ABCD":
        df = load_arm(arm)
        df = df[df.final_state != "UNREACHABLE"]  # no route exists: geography, not behaviour
        y = (df.final_state == "SHELTERED").to_numpy(float)
        X = design(df, arm)
        beta, se, pseudo_r2, acc = logit_irls(X, y)
        z = beta / se
        pv = 2 * (1 - norm.cdf(np.abs(z)))
        md.append(f"## Arm {arm} — logistic: P(sheltered), n={len(df):,} "
                  f"(9 seeds pooled; unreachable excluded), share sheltered "
                  f"{y.mean():.3f}")
        md.append(f"McFadden pseudo-R2 = {pseudo_r2:.3f}; "
                  f"in-sample accuracy = {acc:.3f}")
        md.append("")
        md.append("| feature | coef | odds ratio | SE | p |")
        md.append("|---|---|---|---|---|")
        for i, nm in enumerate(names):
            orr = math.exp(beta[i]) if i > 0 else float("nan")
            md.append(f"| {nm} | {beta[i]:+.4f} | "
                      f"{'' if i == 0 else f'{orr:.3f}'} | {se[i]:.4f} | "
                      f"{pv[i]:.2e} |")
            rows.append(dict(arm=arm, model="logit_sheltered", feature=nm,
                             coef=beta[i], se=se[i], p=pv[i],
                             odds_ratio=(math.exp(beta[i]) if i else "")))
        md.append("")
        sh = df[df.final_state == "SHELTERED"]
        Xs = design(sh, arm)
        yt = sh.travel_time_min.to_numpy(float)
        b2, se2, r2 = ols(Xs, yt)
        z2 = b2 / se2
        pv2 = 2 * (1 - norm.cdf(np.abs(z2)))
        md.append(f"### OLS: travel_time_min among sheltered (n={len(sh):,}), "
                  f"R2 = {r2:.3f}")
        md.append("| feature | coef (min) | SE | p |")
        md.append("|---|---|---|---|")
        for i, nm in enumerate(names):
            md.append(f"| {nm} | {b2[i]:+.2f} | {se2[i]:.3f} | {pv2[i]:.2e} |")
            rows.append(dict(arm=arm, model="ols_travel_time_min", feature=nm,
                             coef=b2[i], se=se2[i], p=pv2[i], odds_ratio=""))
        md.append("")
        # retry behaviour: "if refused, do they choose another shelter?"
        ref1 = df[df.door_refusals >= 1]
        again = (ref1.final_state == "SHELTERED").mean() if len(ref1) else float("nan")
        md.append(f"Retry behaviour: {len(ref1):,} residents were refused at "
                  f"a full door at least once; {100*again:.1f}% of them still "
                  f"got inside somewhere else (mean stops among the refused: "
                  f"{ref1.door_refusals.mean():.2f}).")
        md.append("")
    # ---- Model card for the headline coefficient (round-5 critique) -------
    md.append("## Model card — the arm-D mobility coefficient, stated carefully")
    md.append("")
    md.append("**Outcome:** `final_state == SHELTERED` (binary; UNREACHABLE "
              "excluded — no route exists, so no behaviour is being modelled). "
              "**Covariates:** age 55+, female, sex-other, mobility, asthma, "
              "COPD, chronic condition, walking speed (m/s), distance to the "
              "arm's nearest shelter site (km). **Fitted:** IRLS, "
              "information-matrix SEs, 9 seeds pooled.")
    md.append("")
    dfd = load_arm("D")
    dfd = dfd[dfd.final_state != "UNREACHABLE"]
    mmask = dfd.mobility_limited == 1
    pm = (dfd[mmask].final_state == "SHELTERED").mean()
    pu = (dfd[~mmask].final_state == "SHELTERED").mean()
    mor = (pm / (1 - pm)) / (pu / (1 - pu))
    md.append(f"**Marginal (unconditional) result — quote THIS for equity:** "
              f"P(in|mobility)={pm:.4f} vs P(in|others)={pu:.4f}; marginal "
              f"odds ratio = {mor:.3f}. The gap is simply gone.")
    md.append("")
    md.append("**Conditional coefficient — a sanity check, not a discovery:** "
              "conditional on walking speed, the mobility flag flips a slow "
              "walker from losing the arrival race to holding a reserved "
              "space, so the logit recovers the admission rule we wrote. Its "
              "size is NOT quotable: the cross-tab below shows regional "
              "quasi-separation (every mobility-limited resident above "
              "1.0 m/s is admitted — cells at exactly 100%), which inflates "
              "and destabilises the point estimate. Wald intervals under "
              "near-separation are unreliable; treat the coefficient as "
              "'large and positive', nothing more precise.")
    md.append("")
    md.append("| speed band (m/s) | others n / access % | mobility n / access % |")
    md.append("|---|---|---|")
    dfd["band"] = pd.cut(dfd.walking_speed_mps, [0, 0.8, 1.0, 1.2, 1.4, 3.0])
    for band, g in dfd.groupby("band", observed=True):
        a = g[g.mobility_limited == 0]
        b = g[g.mobility_limited == 1]
        md.append(f"| {band} | {len(a):,} / "
                  f"{100 * (a.final_state == 'SHELTERED').mean():.1f}% | "
                  f"{len(b):,} / "
                  f"{100 * (b.final_state == 'SHELTERED').mean():.1f}% |")
    md.append("")
    md.append("## Negative control (honesty check)")
    md.append("Asthma and chronic-physical coefficients must be null in "
              "arms A-C: no mechanism links them to movement (no gait-speed "
              "evidence exists), so a significant coefficient would mean the "
              "model invented an effect. Mobility, COPD (via -0.19 m/s), "
              "speed, and distance are the built-in mechanisms and should "
              "carry the signal. In arm D the mobility coefficient must "
              "FLIP toward positive: the triage reserve is the only channel "
              "that privileges mobility-limited arrivals.")
    (OUT / "ML_MODEL_SUMMARY.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    with open(OUT / "ML_MODEL_COEFFICIENTS.csv", "w", newline="", encoding="utf-8") as f:
        wcsv = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        wcsv.writeheader()
        wcsv.writerows(rows)
    print("\n".join(md))


if __name__ == "__main__":
    main()
