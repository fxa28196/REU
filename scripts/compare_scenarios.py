#!/usr/bin/env python3
"""Scenario A (current shelter placement) vs Scenario B (optimized placement).

Reads the archived final runs for both scenarios across every seed and produces
the publication comparison:

  docs/final/analysis/scenario_comparison.csv     population-level A vs B, per seed
  docs/final/analysis/stratified_exposure.csv     exposure and access by susceptibility stratum
  docs/final/analysis/shelter_utilization.csv     per-shelter occupancy and refusals
  docs/final/analysis/journeys_sample.csv         individual journey records (documented sample)
  docs/final/figures/*.png                        publication figures
  docs/final/analysis/comparison_summary.json     machine-readable, with provenance

Every figure and table is stamped with the model commit, seeds and data-version
tag taken from the run manifests, so no number here is separable from the run
that produced it.

Scientific note: this script COMPARES runs, it does not model. It never
recomputes an outcome the simulation is responsible for; it aggregates the
exported per-agent records, which are the primary evidence.

Usage:
    python scripts/compare_scenarios.py
    python scripts/compare_scenarios.py --runs-dir Geography/output --pattern final

Requires: pandas, matplotlib, pyshp (pyshp only for the map; skipped if absent).
"""

import argparse
import datetime as _dt
import json
import platform
import subprocess
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

SCRIPT_VERSION = "1.0.0"
REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = REPO_ROOT / "docs" / "final" / "analysis"
FIG_DIR = REPO_ROOT / "docs" / "final" / "figures"

# Palette — same reference palette as scripts/analyze_run.py so the whole
# document set reads as one system.
INK, INK2, MUTED = "#0b0b0b", "#52514e", "#898781"
GRID, BASELINE, SURFACE = "#e1e0d9", "#c3c2b7", "#fcfcfb"
BLUE, ORANGE = "#2a78d6", "#ec835a"
CRITICAL, SERIOUS = "#d03b3b", "#ec835a"
SCEN_COLOR = {"A": BLUE, "B": ORANGE}

STRATA = [
    ("vulnerable_flag", "Vulnerable (any)"),
    ("mobility_limited", "Mobility-limited"),
    ("asthma_flag", "Asthma"),
    ("copd_flag", "COPD"),
]


def git_commit():
    try:
        r = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO_ROOT,
                           capture_output=True, text=True, timeout=15)
        return r.stdout.strip() if r.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


def load_runs(runs_dir, pattern):
    """Finds final A/B runs and returns {(scenario, seed): {...}}."""
    runs = {}
    for d in sorted(Path(runs_dir).glob(f"{pattern}*")):
        agents_f, man_f = d / "agents.csv", d / "simulation.json"
        if not (agents_f.exists() and man_f.exists()):
            continue
        agents = pd.read_csv(agents_f)
        man = json.loads(man_f.read_text(encoding="utf-8"))
        scen_name = man.get("scenario", "")
        scen = "B" if "B_" in scen_name or "optimi" in scen_name.lower() else "A"
        seed = man["reproducibility"]["random_seed"]
        runs[(scen, seed)] = {
            "dir": d, "agents": agents, "manifest": man,
            "shelters": pd.read_csv(d / "shelters.csv"), "scenario_name": scen_name,
        }
    return runs


def population_row(scen, seed, run):
    a, man = run["agents"], run["manifest"]
    n = len(a)
    sheltered = a[a.final_state == "SHELTERED"]
    exp = a["cumulative_dose_ugm3h"]
    row = {
        "scenario": scen, "scenario_name": run["scenario_name"], "seed": seed,
        "n_residents": n,
        "n_sheltered": len(sheltered),
        "pct_sheltered": round(100 * len(sheltered) / n, 3),
        "n_refused_all_full": int((a.final_state == "REFUSED_ALL_FULL").sum()),
        "n_unreachable": int((a.final_state == "UNREACHABLE").sum()),
        "total_exposure_ugm3h": round(float(exp.sum()), 1),
        "mean_exposure_ugm3h": round(float(exp.mean()), 1),
        "median_exposure_ugm3h": round(float(exp.median()), 1),
        "max_exposure_ugm3h": round(float(exp.max()), 1),
        "exposure_gini": round(gini(exp), 4),
        "total_person_hours_above_unhealthy": round(float(a["hours_above_unhealthy"].sum()), 1),
        "mean_travel_m_sheltered": round(float(sheltered["total_travel_distance_m"].mean()), 1)
        if len(sheltered) else None,
        "mean_travel_min_sheltered": round(float(sheltered["travel_time_min"].mean()), 1)
        if len(sheltered) else None,
        "mean_travel_m_all": round(float(a["total_travel_distance_m"].mean()), 1),
        "total_beds": int(run["shelters"]["capacity"].fillna(0).sum()),
        "beds_used": int(run["shelters"]["final_occupancy"].sum()),
        "model_commit": man["reproducibility"]["git_commit"][:10],
        "data_version": man["reproducibility"]["data_version_tag"],
        "sim_id": man["reproducibility"]["sim_id"],
    }
    # Vulnerable-population exposure — the equity headline (decision D-3).
    if "vulnerable_flag" in a.columns and a["vulnerable_flag"].notna().any():
        v = a[a.vulnerable_flag == 1]
        nv = a[a.vulnerable_flag == 0]
        row.update({
            "n_vulnerable": len(v),
            "vulnerable_mean_exposure_ugm3h": round(float(v["cumulative_dose_ugm3h"].mean()), 1),
            "nonvulnerable_mean_exposure_ugm3h": round(float(nv["cumulative_dose_ugm3h"].mean()), 1),
            "vulnerable_pct_sheltered": round(100 * (v.final_state == "SHELTERED").mean(), 3),
            "nonvulnerable_pct_sheltered": round(100 * (nv.final_state == "SHELTERED").mean(), 3),
            "mobility_limited_pct_sheltered": round(
                100 * (a[a.mobility_limited == 1].final_state == "SHELTERED").mean(), 3),
            "unimpaired_pct_sheltered": round(
                100 * (a[a.mobility_limited == 0].final_state == "SHELTERED").mean(), 3),
            "mean_walking_speed_mps": round(float(a["walking_speed_mps"].mean()), 4),
        })
    return row


def gini(values):
    x = sorted(float(v) for v in values)
    n = len(x)
    if n == 0:
        return 0.0
    m = sum(x) / n
    if m == 0:
        return 0.0
    return sum((2 * (i + 1) - n - 1) * v for i, v in enumerate(x)) / (n * n * m)


def stratified_rows(scen, seed, run):
    a = run["agents"]
    out = []
    if "vulnerable_flag" not in a.columns or a["vulnerable_flag"].isna().all():
        return out
    for col, label in STRATA:
        for member in (1, 0):
            g = a[a[col] == member]
            if not len(g):
                continue
            sh = g[g.final_state == "SHELTERED"]
            out.append({
                "scenario": scen, "seed": seed, "stratum": label, "member": bool(member),
                "n": len(g),
                "pct_sheltered": round(100 * len(sh) / len(g), 3),
                "mean_exposure_ugm3h": round(float(g["cumulative_dose_ugm3h"].mean()), 1),
                "median_exposure_ugm3h": round(float(g["cumulative_dose_ugm3h"].median()), 1),
                "mean_walking_speed_mps": round(float(g["walking_speed_mps"].mean()), 4),
                "mean_travel_m": round(float(g["total_travel_distance_m"].mean()), 1),
                "mean_travel_min_sheltered": round(float(sh["travel_time_min"].mean()), 1)
                if len(sh) else None,
                "mean_hours_above_unhealthy": round(float(g["hours_above_unhealthy"].mean()), 2),
            })
    return out


# ---------------------------------------------------------------------------
def style_axes(ax):
    ax.set_facecolor(SURFACE)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(BASELINE)
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.tick_params(colors=MUTED, labelsize=8)
    ax.xaxis.label.set_color(INK2)
    ax.yaxis.label.set_color(INK2)


def new_fig(title, subtitle, footer, figsize=(7.2, 4.4)):
    fig, ax = plt.subplots(figsize=figsize, dpi=200, layout="constrained")
    fig.get_layout_engine().set(rect=(0, 0.045, 1, 0.955))
    fig.patch.set_facecolor(SURFACE)
    fig.suptitle(title, x=0.02, ha="left", fontsize=12, fontweight="bold", color=INK)
    ax.set_title(subtitle, loc="left", fontsize=9, color=INK2, pad=10)
    fig.text(0.02, 0.005, footer, fontsize=5.5, color=MUTED, va="bottom")
    return fig, ax


def save(fig, name, made):
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    fig.savefig(FIG_DIR / name, facecolor=SURFACE)
    plt.close(fig)
    made.append(name)


def figures(pop, strat, runs, footer):
    plt.rcParams["font.family"] = ["Segoe UI", "DejaVu Sans", "sans-serif"]
    made = []
    have_b = "B" in set(pop["scenario"])

    # 1 — access disparity by stratum: the equity headline
    if len(strat):
        s = strat[strat.scenario == "A"].groupby(["stratum", "member"], as_index=False)[
            "pct_sheltered"].mean()
        labels = [lbl for _, lbl in STRATA if lbl in set(s.stratum)]
        fig, ax = new_fig(
            "Who reaches shelter",
            "Percent of residents admitted, by susceptibility stratum "
            f"(Scenario A, mean of {pop[pop.scenario == 'A'].seed.nunique()} seeds)", footer)
        x = range(len(labels))
        mem = [float(s[(s.stratum == l) & (s.member)]["pct_sheltered"].iloc[0]) for l in labels]
        non = [float(s[(s.stratum == l) & (~s.member)]["pct_sheltered"].iloc[0]) for l in labels]
        ax.bar([i - 0.2 for i in x], mem, width=0.38, color=SERIOUS, label="In stratum")
        ax.bar([i + 0.2 for i in x], non, width=0.38, color=BLUE, label="Not in stratum")
        for i, (m, nn) in enumerate(zip(mem, non)):
            ax.text(i - 0.2, m, f"{m:.1f}%", ha="center", va="bottom", fontsize=8, color=INK2)
            ax.text(i + 0.2, nn, f"{nn:.1f}%", ha="center", va="bottom", fontsize=8, color=INK2)
        ax.set_xticks(list(x), labels, fontsize=8.5, color=INK)
        ax.set_ylabel("Reached shelter (%)")
        leg = ax.legend(frameon=False, fontsize=8)
        for t in leg.get_texts():
            t.set_color(INK2)
        style_axes(ax)
        save(fig, "figA_access_by_stratum.png", made)

    # 2 — walking speed distribution by mobility category (the mechanism)
    a = runs[("A", sorted(k[1] for k in runs if k[0] == "A")[0])]["agents"]
    if "walking_speed_mps" in a.columns and a["walking_speed_mps"].notna().any():
        fig, ax = new_fig(
            "Walking speed drives who gets a bed",
            "Sampled comfortable gait speed; mobility-limited residents use the Boyce "
            "unaided-impaired distribution", footer)
        ax.hist(a[a.mobility_limited == 0]["walking_speed_mps"], bins=30, color=BLUE,
                alpha=0.85, edgecolor=SURFACE, linewidth=0.6, label="Unimpaired")
        ax.hist(a[a.mobility_limited == 1]["walking_speed_mps"], bins=30, color=SERIOUS,
                alpha=0.85, edgecolor=SURFACE, linewidth=0.6, label="Mobility-limited")
        ax.set_xlabel("Comfortable walking speed (m/s)")
        ax.set_ylabel("Residents")
        leg = ax.legend(frameon=False, fontsize=8)
        for t in leg.get_texts():
            t.set_color(INK2)
        style_axes(ax)
        save(fig, "figB_walking_speed_distribution.png", made)

    # 3 — exposure distribution, all residents, by outcome
    fig, ax = new_fig(
        "Cumulative PM$_{2.5}$ exposure",
        "Dose accrued outdoors until shelter admission; the population splits in two", footer)
    for state, color, lbl in (("SHELTERED", BLUE, "Reached shelter"),
                              ("REFUSED_ALL_FULL", SERIOUS, "Refused (capacity full)"),
                              ("UNREACHABLE", CRITICAL, "No reachable shelter")):
        vals = a[a.final_state == state]["cumulative_dose_ugm3h"]
        if len(vals):
            ax.hist(vals, bins=40, color=color, alpha=0.85, edgecolor=SURFACE,
                    linewidth=0.5, label=f"{lbl} (n={len(vals)})")
    ax.set_yscale("log")
    ax.set_xlabel(r"Cumulative exposure ($\mu$g m$^{-3}$ h)")
    ax.set_ylabel("Residents (log scale)")
    leg = ax.legend(frameon=False, fontsize=8)
    for t in leg.get_texts():
        t.set_color(INK2)
    style_axes(ax)
    save(fig, "figC_exposure_distribution.png", made)

    # 4 — travel distance distribution, sheltered vs refused
    fig, ax = new_fig(
        "Distance walked",
        "Kilometres walked before admission or final refusal", footer)
    for state, color, lbl in (("SHELTERED", BLUE, "Reached shelter"),
                              ("REFUSED_ALL_FULL", SERIOUS, "Refused (capacity full)")):
        vals = a[a.final_state == state]["total_travel_distance_m"] / 1000.0
        if len(vals):
            ax.hist(vals, bins=40, color=color, alpha=0.8, edgecolor=SURFACE,
                    linewidth=0.5, label=f"{lbl}: median {vals.median():.1f} km")
    ax.set_xlabel("Distance walked (km)")
    ax.set_ylabel("Residents")
    leg = ax.legend(frameon=False, fontsize=8)
    for t in leg.get_texts():
        t.set_color(INK2)
    style_axes(ax)
    save(fig, "figD_travel_distance.png", made)

    # 5 — travel time distribution
    sh = a[a.final_state == "SHELTERED"]
    if len(sh):
        fig, ax = new_fig(
            "Time from departure to admission",
            "Includes any wait for a second shelter to open the following day", footer)
        ax.hist(sh["travel_time_min"] / 60.0, bins=30, color=BLUE, edgecolor=SURFACE,
                linewidth=0.8)
        ax.set_xlabel("Hours from departure to admission")
        ax.set_ylabel("Residents admitted")
        style_axes(ax)
        save(fig, "figE_travel_time.png", made)

    # 6 — shelter utilization, A vs B
    fig, ax = new_fig(
        "Shelter utilization",
        "Beds occupied and residents turned away at the door", footer)
    rows, labels, colors = [], [], []
    for scen in (["A", "B"] if have_b else ["A"]):
        seeds = sorted(k[1] for k in runs if k[0] == scen)
        sdf = runs[(scen, seeds[0])]["shelters"]
        for _, r in sdf[sdf.operating == True].iterrows():  # noqa: E712
            rows.append((float(r["final_occupancy"]), float(r["capacity"]), int(r["refused_count"])))
            labels.append(f"{scen}: {r['shelter_id']}")
            colors.append(SCEN_COLOR[scen])
    y = range(len(rows))
    ax.barh(list(y), [r[0] for r in rows], color=colors, height=0.55, zorder=3)
    for i, (occ, cap, ref) in enumerate(rows):
        ax.text(occ + 2, i, f"{int(occ)}/{int(cap)} beds · {ref:,} turned away",
                fontsize=8, color=INK2, va="center")
    ax.set_yticks(list(y), labels, fontsize=9, color=INK)
    ax.set_xlim(0, max(r[1] for r in rows) * 2.4)
    ax.set_xlabel("Beds occupied")
    style_axes(ax)
    ax.grid(axis="y", visible=False)
    save(fig, "figF_shelter_utilization.png", made)

    # 7 — A vs B population comparison (only when B exists)
    if have_b:
        agg = pop.groupby("scenario").agg(
            pct=("pct_sheltered", "mean"),
            mean_exp=("mean_exposure_ugm3h", "mean"),
            travel=("mean_travel_m_sheltered", "mean"),
            vuln_pct=("vulnerable_pct_sheltered", "mean")).reset_index()
        metrics = [("pct", "Reached shelter (%)"), ("vuln_pct", "Vulnerable reached (%)"),
                   ("mean_exp", "Mean exposure (µg·m⁻³·h)"), ("travel", "Mean walk, admitted (m)")]
        fig, axes = plt.subplots(1, 4, figsize=(11.5, 3.6), dpi=200, layout="constrained")
        fig.patch.set_facecolor(SURFACE)
        fig.suptitle("Scenario A (current) vs B (optimized placement)", x=0.02, ha="left",
                     fontsize=12, fontweight="bold", color=INK)
        fig.text(0.02, 0.005, footer, fontsize=5.5, color=MUTED, va="bottom")
        for ax, (key, label) in zip(axes, metrics):
            vals = [float(agg[agg.scenario == s][key].iloc[0]) for s in ("A", "B")]
            ax.bar(["A", "B"], vals, color=[SCEN_COLOR["A"], SCEN_COLOR["B"]], width=0.55)
            for i, v in enumerate(vals):
                ax.text(i, v, f"{v:,.1f}", ha="center", va="bottom", fontsize=8, color=INK2)
            ax.set_title(label, loc="left", fontsize=8.5, color=INK2)
            ax.set_ylim(0, max(vals) * 1.25)
            style_axes(ax)
        save(fig, "figG_scenario_comparison.png", made)

    return made


def map_figure(runs, footer, made):
    """Encampment origins coloured by outcome, with shelter sites for both
    scenarios. Street backdrop is a deterministic subsample for context."""
    try:
        import shapefile
    except ImportError:
        print("  (pyshp not available — skipping map)")
        return
    seeds = sorted(k[1] for k in runs if k[0] == "A")
    a = runs[("A", seeds[0])]["agents"]
    camps = pd.read_csv(REPO_ROOT / "Geography" / "data" / "encampments"
                        / "irp_campsite_reports_sample.csv")
    camps = camps.dropna(subset=["lon", "lat"]).drop_duplicates("inc_id").set_index("inc_id")
    a = a[a.starting_encampment.isin(camps.index)]
    lon = camps.loc[a.starting_encampment, "lon"].to_numpy()
    lat = camps.loc[a.starting_encampment, "lat"].to_numpy()
    reached = (a.final_state == "SHELTERED").to_numpy()

    fig, ax = plt.subplots(figsize=(7.6, 7.2), dpi=200, layout="constrained")
    fig.patch.set_facecolor(SURFACE)
    fig.suptitle("Where residents started, and who reached shelter", x=0.02, ha="left",
                 fontsize=12, fontweight="bold", color=INK)
    ax.set_title("Encampment origins (2025-26 reports used as a 2020 spatial proxy, A-03); "
                 "shelter sites marked", loc="left", fontsize=8.5, color=INK2, pad=10)
    fig.text(0.02, 0.005, footer, fontsize=5.5, color=MUTED, va="bottom")

    try:  # street backdrop, every 25th feature for context only
        sf = shapefile.Reader(str(REPO_ROOT / "Geography" / "data" / "Streets.shp"))
        for i in range(0, len(sf), 25):
            pts = sf.shape(i).points
            if pts:
                xs, ys = zip(*pts)
                ax.plot(xs, ys, color=GRID, linewidth=0.25, zorder=1)
    except Exception as exc:
        print(f"  (street backdrop skipped: {exc})")

    ax.scatter(lon[~reached], lat[~reached], s=7, c=SERIOUS, alpha=0.45, linewidths=0,
               zorder=2, label=f"Did not reach shelter (n={int((~reached).sum()):,})")
    ax.scatter(lon[reached], lat[reached], s=14, c=BLUE, alpha=0.95, linewidths=0,
               zorder=3, label=f"Reached shelter (n={int(reached.sum()):,})")
    for scen, marker in (("A", "*"), ("B", "P")):
        key = [k for k in runs if k[0] == scen]
        if not key:
            continue
        sdf = runs[sorted(key)[0]]["shelters"]
        op = sdf[sdf.operating == True]  # noqa: E712
        ax.scatter(op["lon"], op["lat"], s=320 if scen == "A" else 190, marker=marker,
                   c=SCEN_COLOR[scen], edgecolors="white", linewidths=1.4, zorder=5,
                   label=f"Scenario {scen} shelters")
        for _, r in op.iterrows():
            ax.annotate(r["shelter_id"], (r["lon"], r["lat"]), textcoords="offset points",
                        xytext=(9, 6), fontsize=8, color=INK, zorder=6,
                        fontweight="bold")
    ax.set_xlim(lon.min() - 0.02, lon.max() + 0.02)
    ax.set_ylim(lat.min() - 0.02, lat.max() + 0.02)
    ax.set_aspect(1 / 0.70)  # ~cos(45.5 deg): degrees are not square at this latitude
    ax.set_facecolor(SURFACE)
    for s in ("top", "right", "left", "bottom"):
        ax.spines[s].set_visible(False)
    ax.tick_params(colors=MUTED, labelsize=7)
    ax.set_xlabel("Longitude", color=INK2, fontsize=8)
    ax.set_ylabel("Latitude", color=INK2, fontsize=8)
    leg = ax.legend(frameon=False, fontsize=8, loc="upper left")
    for t in leg.get_texts():
        t.set_color(INK2)
    save(fig, "figH_map_outcomes.png", made)


# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--runs-dir", default=str(REPO_ROOT / "Geography" / "output"))
    ap.add_argument("--pattern", default="final")
    args = ap.parse_args()

    runs = load_runs(args.runs_dir, args.pattern)
    if not runs:
        sys.exit(f"No runs matching '{args.pattern}*' with agents.csv + simulation.json "
                 f"under {args.runs_dir}")
    print(f"loaded {len(runs)} runs: {sorted(runs.keys())}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pop = pd.DataFrame([population_row(s, sd, r) for (s, sd), r in sorted(runs.items())])
    pop.to_csv(OUT_DIR / "scenario_comparison.csv", index=False)

    strat = pd.DataFrame([r for (s, sd), run in sorted(runs.items())
                          for r in stratified_rows(s, sd, run)])
    if len(strat):
        strat.to_csv(OUT_DIR / "stratified_exposure.csv", index=False)

    util = []
    for (s, sd), run in sorted(runs.items()):
        for _, r in run["shelters"].iterrows():
            util.append({"scenario": s, "seed": sd, **r.to_dict()})
    pd.DataFrame(util).to_csv(OUT_DIR / "shelter_utilization.csv", index=False)

    # Individual journey records: every admitted resident plus a deterministic
    # sample of those who were not, so the file stays reviewable by hand.
    seeds_a = sorted(k[1] for k in runs if k[0] == "A")
    a0 = runs[("A", seeds_a[0])]["agents"]
    sample = pd.concat([a0[a0.final_state == "SHELTERED"],
                        a0[a0.final_state != "SHELTERED"].head(200)])
    sample.to_csv(OUT_DIR / "journeys_sample.csv", index=False)

    man0 = runs[("A", seeds_a[0])]["manifest"]["reproducibility"]
    meta = {
        "generated_utc": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "script": "scripts/compare_scenarios.py", "script_version": SCRIPT_VERSION,
        "analysis_git_commit": git_commit(), "python": platform.python_version(),
        "pandas": pd.__version__, "matplotlib": matplotlib.__version__,
    }
    footer = (f"model commit {man0['git_commit'][:10]} · data {man0['data_version_tag']} · "
              f"seeds {sorted({k[1] for k in runs})} · analysis {meta['generated_utc']}")

    made = figures(pop, strat, runs, footer)
    map_figure(runs, footer, made)

    # Scenario deltas, only when B exists
    deltas = {}
    if "B" in set(pop["scenario"]):
        ga = pop[pop.scenario == "A"].mean(numeric_only=True)
        gb = pop[pop.scenario == "B"].mean(numeric_only=True)
        for k in ("pct_sheltered", "total_exposure_ugm3h", "mean_exposure_ugm3h",
                  "mean_travel_m_sheltered", "vulnerable_pct_sheltered",
                  "vulnerable_mean_exposure_ugm3h", "n_unreachable"):
            if k in ga and pd.notna(ga.get(k)) and pd.notna(gb.get(k)):
                av, bv = float(ga[k]), float(gb[k])
                deltas[k] = {"A": round(av, 3), "B": round(bv, 3),
                             "abs_change": round(bv - av, 3),
                             "pct_change": round(100 * (bv - av) / av, 3) if av else None}

    out = {
        "schema": "reu-wildfire-shelter-abm/scenario-comparison/v1",
        "analysis": meta,
        "runs": [{"scenario": s, "seed": sd, "sim_id": r["manifest"]["reproducibility"]["sim_id"],
                  "scenario_name": r["scenario_name"], "dir": str(r["dir"])}
                 for (s, sd), r in sorted(runs.items())],
        "population_comparison": pop.to_dict("records"),
        "scenario_deltas": deltas,
        "stratified_exposure": strat.to_dict("records") if len(strat) else [],
        "figures": made,
        "interpretation_guardrails": [
            "Exposure is a time-integrated concentration index in ug/m3/h, NOT an inhaled "
            "dose and NOT a health outcome; no concentration-response function is applied.",
            "Susceptibility strata are REPORTING groups, not risk scores: asthma and COPD "
            "carry no dose multiplier (decision D-3).",
            "Scenario B is an unconstrained-siting theoretical optimum. It ignores building "
            "availability, ownership, zoning, staffing and ADA access, and is an upper bound "
            "on what siting alone can achieve - not a recommendation to build there.",
            "Total capacity is identical in both scenarios, so relocation can change WHO is "
            "sheltered and how far they walk, not materially HOW MANY.",
            "travel_time_min is elapsed time from departure to admission and includes any "
            "wait for a second shelter to open the next day; it is not pure walking time.",
        ],
    }
    (OUT_DIR / "comparison_summary.json").write_text(
        json.dumps(out, indent=2, ensure_ascii=False, default=str), encoding="utf-8")

    print(f"\nwrote {OUT_DIR / 'scenario_comparison.csv'}")
    print(f"wrote {OUT_DIR / 'comparison_summary.json'}")
    print(f"wrote {len(made)} figures -> {FIG_DIR}")
    cols = ["scenario", "seed", "n_sheltered", "pct_sheltered", "mean_exposure_ugm3h",
            "vulnerable_pct_sheltered", "mobility_limited_pct_sheltered",
            "unimpaired_pct_sheltered"]
    print("\n" + pop[[c for c in cols if c in pop.columns]].to_string(index=False))
    if deltas:
        print("\nScenario B vs A:")
        for k, v in deltas.items():
            print(f"  {k}: {v['A']} -> {v['B']}  ({v['pct_change']:+.2f}%)")


if __name__ == "__main__":
    main()
