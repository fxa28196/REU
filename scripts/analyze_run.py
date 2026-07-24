#!/usr/bin/env python3
"""Results-analysis workflow for exported wildfire-shelter-ABM runs.

For each run directory (Geography/output/run_seed<seed>/) this script:

  1. VERIFIES the three exported files against each other:
     agents.csv row-level data is recomputed and cross-checked against the
     shelters.csv aggregates and the simulation.json manifest (same statistic
     definitions as geography.output.OutcomeLogger: linear-interpolation
     percentiles, mean-absolute-difference Gini, travel stats over ALL agents).
  2. Computes SUMMARY / SHELTER / EXPOSURE statistics.
  3. Renders publication figures (PNG, 200 dpi) from the CSV data.
  4. Writes  <run>/analysis/summary.json   (machine-readable)
             <run>/analysis/analysis-report.md (human-readable)
             <run>/analysis/figures/*.png
     Every output is stamped with sim_id, random seed, git commit,
     data-version tag, input-dataset SHA-256s and analysis timestamp.

Usage:
    python scripts/analyze_run.py                      # analyze every run under Geography/output
    python scripts/analyze_run.py Geography/output/run_seed42 [more runs...]

Requires: pandas, matplotlib  (pure read-only analysis; never touches model code).
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

SCRIPT_VERSION = "1.0.2"
REPO_ROOT = Path(__file__).resolve().parents[1]

# ---------------------------------------------------------------------------
# Palette (dataviz reference palette, light mode) — see docs/runs report.
INK = "#0b0b0b"        # primary text
INK2 = "#52514e"       # secondary text
MUTED = "#898781"      # axis / captions
GRID = "#e1e0d9"       # hairline gridline
BASELINE = "#c3c2b7"   # axis baseline
SURFACE = "#fcfcfb"    # chart surface
BLUE = "#2a78d6"       # series 1 (single-series marks)
CRITICAL = "#d03b3b"   # status: critical (UNREACHABLE)
SERIOUS = "#ec835a"    # status: serious (REFUSED_ALL_FULL)

STATE_COLORS = {"SHELTERED": BLUE, "UNREACHABLE": CRITICAL, "REFUSED_ALL_FULL": SERIOUS}

# Walked-vs-shortest-path surplus above this many metres is flagged as a
# routing/data artifact (legitimate snap gaps observed are < ~60 m).
DETOUR_FLAG_M = 200.0


# ---------------------------------------------------------------------------
def gini(values):
    """Gini coefficient, identical definition to OutcomeLogger.gini():
    mean absolute difference / (2 * mean).  0 = equal."""
    x = sorted(float(v) for v in values)
    n = len(x)
    if n == 0:
        return 0.0
    m = sum(x) / n
    if m == 0:
        return 0.0
    acc = sum((2 * (i + 1) - n - 1) * v for i, v in enumerate(x))
    return acc / (n * n * m)


def pctl(series, p):
    """Linear-interpolation percentile (matches OutcomeLogger.pct and numpy)."""
    s = series.dropna()
    return float(s.quantile(p / 100.0, interpolation="linear")) if len(s) else float("nan")


def analysis_git_commit():
    try:
        out = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO_ROOT,
                             capture_output=True, text=True, timeout=15)
        return out.stdout.strip() if out.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


def approx(a, b, rtol=1e-3, atol=0.51):
    """Tolerant float compare: manifest values are rounded to 2-4 decimals."""
    if a is None or b is None:
        return False
    return abs(a - b) <= max(atol, rtol * max(abs(a), abs(b)))


class Checks:
    def __init__(self):
        self.results = []

    def add(self, name, ok, detail=""):
        self.results.append({"name": name, "status": "PASS" if ok else "FAIL",
                             "detail": str(detail)})

    @property
    def failed(self):
        return [c for c in self.results if c["status"] == "FAIL"]


# ---------------------------------------------------------------------------
def verify(run, agents, shelters, manifest):
    """Cross-check the three export files. Returns a Checks object."""
    ck = Checks()
    pop = manifest["population"]
    rep = manifest["reproducibility"]

    # --- structural
    ck.add("agents.csv row count == manifest n_agents",
           len(agents) == pop["n_agents"], f"{len(agents)} vs {pop['n_agents']}")

    census = agents["final_state"].value_counts().to_dict()
    for state, key in [("PRE_EVAC", "pre_evac"), ("SHELTERED", "sheltered"),
                       ("EN_ROUTE", "en_route"), ("UNREACHABLE", "unreachable"),
                       ("REFUSED_ALL_FULL", "refused_all_full")]:
        ck.add(f"census {state} == manifest {key}",
               census.get(state, 0) == pop[key],
               f"{census.get(state, 0)} vs {pop[key]}")

    flag_ok = ((agents["reached_shelter"] == "yes") ==
               (agents["final_state"] == "SHELTERED")).all()
    ck.add("reached_shelter == (final_state SHELTERED)", bool(flag_ok))

    # --- identity columns constant and equal to manifest
    for col, want in [("sim_id", rep["sim_id"]), ("commit", rep["git_commit"]),
                      ("random_seed", rep["random_seed"]),
                      ("data_version", rep["data_version_tag"])]:
        vals = agents[col].unique()
        ck.add(f"{col} constant and == manifest",
               len(vals) == 1 and str(vals[0]) == str(want),
               f"{list(vals)[:3]} vs {want}")

    # --- shelter cross-checks (agents.csv vs shelters.csv vs manifest)
    admitted = agents[agents["final_state"] == "SHELTERED"]["shelter_reached"] \
        .value_counts().to_dict()
    man_shelters = {s["id"]: s for s in manifest["shelters"]}
    for _, srow in shelters.iterrows():
        sid = srow["shelter_id"]
        ck.add(f"shelter {sid}: agents.csv arrivals == shelters.csv final_occupancy",
               admitted.get(sid, 0) == srow["final_occupancy"],
               f"{admitted.get(sid, 0)} vs {srow['final_occupancy']}")
        ck.add(f"shelter {sid}: shelters.csv == simulation.json occupancy/refused",
               srow["final_occupancy"] == man_shelters[sid]["final_occupancy"]
               and srow["refused_count"] == man_shelters[sid]["refused"])
    ck.add("sum(final_occupancy) == n sheltered",
           int(shelters["final_occupancy"].sum()) == pop["sheltered"],
           f"{int(shelters['final_occupancy'].sum())} vs {pop['sheltered']}")

    # --- recompute exposure stats (same definitions as OutcomeLogger)
    exp = agents["cumulative_dose_ugm3h"]
    man = pop["exposure_ugm3h"]
    recomputed = {"mean": exp.mean(), "median": pctl(exp, 50), "min": exp.min(),
                  "p25": pctl(exp, 25), "p75": pctl(exp, 75), "p90": pctl(exp, 90),
                  "max": exp.max(), "total": exp.sum(), "gini": gini(exp)}
    for k, v in recomputed.items():
        tol = 5e-3 if k == "gini" else None
        ok = approx(v, man[k], atol=tol or 0.51)
        ck.add(f"exposure {k} recomputed == manifest", ok, f"{v:.4f} vs {man[k]}")

    # --- VWE: with all RRs = 1.0 VWE must equal raw exposure row-by-row
    rr_one = (agents["age_rr"] == 1.0).all() and (agents["comorbidity_rr"] == 1.0).all()
    ck.add("all RR placeholders == 1.0", bool(rr_one))
    vwe_eq = (agents["vwe_ugm3h"] - agents["cumulative_dose_ugm3h"]).abs().max() < 1e-6
    ck.add("VWE == exposure row-by-row (placeholder RRs)", bool(vwe_eq))

    # --- travel stats (manifest computes over ALL agents' walked distance)
    trav = agents["total_travel_distance_m"]
    mant = pop["travel_m"]
    for k, v in [("mean", trav.mean()), ("median", pctl(trav, 50)), ("max", trav.max())]:
        ck.add(f"travel_m {k} recomputed == manifest", approx(v, mant[k]),
               f"{v:.2f} vs {mant[k]}")

    # --- per-row internal consistency
    mpt = rep["parameters"]["minutesPerTick"]
    both = agents.dropna(subset=["time_arrived_tick", "time_started_tick", "travel_time_min"])
    tt_ok = ((both["time_arrived_tick"] - both["time_started_tick"]) * mpt
             - both["travel_time_min"]).abs().max() < 0.05 if len(both) else True
    ck.add("travel_time_min == (arrived - started) * minutesPerTick", bool(tt_ok))

    peak_ok = (agents["peak_pm25_ugm3"] <= manifest["smoke_field"]["peak_hourly_ugm3"] + 0.01).all()
    ck.add("per-agent peak PM2.5 <= smoke-field peak", bool(peak_ok))
    avg_ok = (agents["avg_pm25_ugm3"].dropna() <= agents["peak_pm25_ugm3"].dropna() + 0.01).all()
    ck.add("per-agent avg PM2.5 <= peak PM2.5", bool(avg_ok))

    ck.add("sum(hours_above_unhealthy) == manifest person-hours",
           abs(agents["hours_above_unhealthy"].sum()
               - pop["total_person_hours_above_unhealthy"]) < 0.51,
           f"{agents['hours_above_unhealthy'].sum():.2f} vs "
           f"{pop['total_person_hours_above_unhealthy']}")

    ck.add("smoke field out_of_range_lookups == 0",
           manifest["smoke_field"]["out_of_range_lookups"] == 0)
    return ck


# ---------------------------------------------------------------------------
def routing_anomaly(agents):
    """Walked distance vs shortest-path distance surplus (detour) per agent.

    In a correct run walked ~= network shortest path (+ a small snap gap).
    Surpluses above DETOUR_FLAG_M indicate a street-graph/path-materialisation
    artifact and inflate travel time AND exposure for the affected agents."""
    a = agents.dropna(subset=["network_dist_to_shelter_m"]).copy()
    a["detour_m"] = a["total_travel_distance_m"] - a["network_dist_to_shelter_m"]
    flagged = a[a["detour_m"] > DETOUR_FLAG_M].sort_values("detour_m", ascending=False)
    return {
        "n_with_route": int(len(a)),
        "n_flagged": int(len(flagged)),
        "flag_threshold_m": DETOUR_FLAG_M,
        "detour_max_m": round(float(a["detour_m"].max()), 1) if len(a) else None,
        "detour_median_flagged_m": round(float(flagged["detour_m"].median()), 1) if len(flagged) else None,
        "distinct_detour_values_m": sorted(
            {round(float(v), -1) for v in flagged["detour_m"]}) if len(flagged) else [],
        "flagged_agents": [
            {"agent_id": r.agent_id,
             "walked_m": round(r.total_travel_distance_m, 1),
             "shortest_path_m": round(r.network_dist_to_shelter_m, 1),
             "detour_m": round(r.detour_m, 1),
             "shelter": r.shelter_reached if isinstance(r.shelter_reached, str) else ""}
            for r in flagged.itertuples()],
    }


def summarize(agents, shelters, manifest):
    pop = manifest["population"]
    arrived = agents[agents["final_state"] == "SHELTERED"]
    failed = agents[agents["final_state"] != "SHELTERED"]
    exp = agents["cumulative_dose_ugm3h"]

    def stats(s):
        s = s.dropna()
        if not len(s):
            return None
        return {"mean": round(float(s.mean()), 2), "median": round(pctl(s, 50), 2),
                "min": round(float(s.min()), 2), "p25": round(pctl(s, 25), 2),
                "p75": round(pctl(s, 75), 2), "p90": round(pctl(s, 90), 2),
                "max": round(float(s.max()), 2)}

    summary = {
        "total_agents": int(len(agents)),
        "successful_arrivals": int(len(arrived)),
        "failed_arrivals": int(len(failed)),
        "failed_by_state": failed["final_state"].value_counts().to_dict(),
        "arrival_rate": round(len(arrived) / len(agents), 4) if len(agents) else None,
        "evacuation_start": {
            "tick": (int(agents["time_started_tick"].min())
                     if agents["time_started_tick"].notna().any() else None),
            "local": (str(agents["time_started_local"].dropna().iloc[0])
                      if agents["time_started_local"].notna().any() else None),
            "all_simultaneous": bool(agents["time_started_tick"].nunique() <= 1),
        },
        "travel_time_min_arrived": stats(arrived["travel_time_min"]),
        "travel_distance_m_arrived": stats(arrived["total_travel_distance_m"]),
        "travel_distance_m_all_agents": stats(agents["total_travel_distance_m"]),
        "exposure_ugm3h": {**(stats(exp) or {}),
                           "total": round(float(exp.sum()), 2),
                           "gini": round(gini(exp), 4)},
        "vwe_ugm3h": {**(stats(agents["vwe_ugm3h"]) or {}),
                      "total": round(float(agents["vwe_ugm3h"].sum()), 2),
                      "gini": round(gini(agents["vwe_ugm3h"]), 4),
                      "note": "identical to exposure while RR placeholders = 1.0"},
        "avg_pm25_ugm3": stats(agents["avg_pm25_ugm3"]),
        "peak_pm25_ugm3": stats(agents["peak_pm25_ugm3"]),
        "hours_above_unhealthy": {**(stats(agents["hours_above_unhealthy"]) or {}),
                                  "total_person_hours":
                                      round(float(agents["hours_above_unhealthy"].sum()), 2)},
        "exposure_split_mean_ugm3h": {
            "while_waiting_pre_evac": round(float(
                (agents["cumulative_dose_ugm3h"]
                 - agents["exposure_while_traveling_ugm3h"]).mean()), 2),
            "while_traveling_or_stranded": round(float(
                agents["exposure_while_traveling_ugm3h"].mean()), 2),
        },
    }

    # ---- shelter statistics
    shelter_stats = []
    for _, s in shelters.iterrows():
        adm = arrived[arrived["shelter_reached"] == s["shelter_id"]]
        cap = s["capacity"] if pd.notna(s["capacity"]) else None
        entry = {
            "shelter_id": s["shelter_id"], "name": s["name"],
            "operating": bool(s["operating"]),
            "capacity": int(cap) if cap is not None else None,
            "final_occupancy": int(s["final_occupancy"]),
            "peak_occupancy": int(s["peak_occupancy"]),
            "unused_capacity": (int(cap - s["final_occupancy"]) if cap is not None else None),
            "utilization": (round(float(s["final_occupancy"] / cap), 4) if cap else None),
            "refused_agents": int(s["refused_count"]),
            "mean_travel_dist_m_admitted": (float(s["mean_travel_dist_m_admitted"])
                                            if pd.notna(s["mean_travel_dist_m_admitted"]) else None),
            "arrival_timing": None,
        }
        if len(adm):
            entry["arrival_timing"] = {
                "first_tick": int(adm["time_arrived_tick"].min()),
                "first_local": str(adm.loc[adm["time_arrived_tick"].idxmin(),
                                           "time_arrived_local"]),
                "median_tick": int(pctl(adm["time_arrived_tick"], 50)),
                "last_tick": int(adm["time_arrived_tick"].max()),
                "last_local": str(adm.loc[adm["time_arrived_tick"].idxmax(),
                                          "time_arrived_local"]),
            }
        shelter_stats.append(entry)

    # ---- exposure analysis
    cols = ["agent_id", "final_state", "shelter_reached", "cumulative_dose_ugm3h",
            "travel_time_min", "hours_above_unhealthy"]

    def rows(df):
        return [{k: (None if pd.isna(v) else (round(v, 2) if isinstance(v, float) else v))
                 for k, v in r.items()} for r in df[cols].to_dict("records")]

    srt = agents.sort_values("cumulative_dose_ugm3h")
    corr_df = arrived.dropna(subset=["travel_time_min", "cumulative_dose_ugm3h"])
    exposure_analysis = {
        "highest_exposure_agents": rows(srt.tail(5).iloc[::-1]),
        "lowest_exposure_agents": rows(srt.head(5)),
        "travel_time_vs_exposure_arrived": {
            "pearson_r": (round(float(corr_df["travel_time_min"]
                                      .corr(corr_df["cumulative_dose_ugm3h"])), 4)
                          if len(corr_df) > 2 else None),
            # Spearman = Pearson on ranks (avoids the scipy dependency)
            "spearman_rho": (round(float(corr_df["travel_time_min"].rank()
                                         .corr(corr_df["cumulative_dose_ugm3h"].rank())), 4)
                             if len(corr_df) > 2 else None),
            "n": int(len(corr_df)),
            "note": ("Structurally near-deterministic: with a county-uniform smoke "
                     "field and simultaneous evacuation, dose differences among "
                     "sheltered agents are driven almost entirely by time outdoors "
                     "(= travel time)."),
        },
    }
    return summary, shelter_stats, exposure_analysis


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


def new_fig(title, subtitle, footer):
    fig, ax = plt.subplots(figsize=(7.2, 4.4), dpi=200, layout="constrained")
    # reserve a bottom strip for the reproducibility footer so it never
    # collides with the x-axis label
    fig.get_layout_engine().set(rect=(0, 0.045, 1, 0.955))
    fig.patch.set_facecolor(SURFACE)
    fig.suptitle(title, x=0.02, ha="left", fontsize=12, fontweight="bold", color=INK)
    ax.set_title(subtitle, loc="left", fontsize=9, color=INK2, pad=10)
    fig.text(0.02, 0.005, footer, fontsize=5.5, color=MUTED, va="bottom")
    return fig, ax


def render_figures(agents, shelters, manifest, figdir, footer, anomaly):
    figdir.mkdir(parents=True, exist_ok=True)
    plt.rcParams["font.family"] = ["Segoe UI", "DejaVu Sans", "sans-serif"]
    arrived = agents[agents["final_state"] == "SHELTERED"]
    made = []

    # 1 -- travel time histogram (arrived agents)
    fig, ax = new_fig("Travel time to shelter",
                      f"Hours walking, agents that reached shelter (n={len(arrived)})",
                      footer)
    tt_h = arrived["travel_time_min"].dropna() / 60.0
    ax.hist(tt_h, bins=24, color=BLUE, edgecolor=SURFACE, linewidth=1.0)
    med = tt_h.median()
    ax.axvline(med, color=MUTED, linestyle=(0, (4, 3)), linewidth=1.2)
    ax.text(med, ax.get_ylim()[1] * 0.97, f" median {med:.1f} h",
            fontsize=8, color=INK2, va="top")
    ax.set_xlabel("Travel time (hours)")
    ax.set_ylabel("Agents")
    style_axes(ax)
    fig.savefig(figdir / "fig1_travel_time_hist.png", facecolor=SURFACE)
    plt.close(fig)
    made.append("fig1_travel_time_hist.png")

    # 2 -- travel distance histogram (arrived agents)
    sub2 = f"Kilometres walked, agents that reached shelter (n={len(arrived)})"
    if anomaly["n_flagged"]:
        sub2 += (f". {anomaly['n_flagged']} agents carry a street-graph detour "
                 "artifact (see report)")
    fig, ax = new_fig("Distance walked to shelter", sub2, footer)
    dist_km = arrived["total_travel_distance_m"].dropna() / 1000.0
    ax.hist(dist_km, bins=24, color=BLUE, edgecolor=SURFACE, linewidth=1.0)
    med = dist_km.median()
    ax.axvline(med, color=MUTED, linestyle=(0, (4, 3)), linewidth=1.2)
    ax.text(med, ax.get_ylim()[1] * 0.97, f" median {med:.1f} km",
            fontsize=8, color=INK2, va="top")
    ax.set_xlabel("Distance walked (km)")
    ax.set_ylabel("Agents")
    style_axes(ax)
    fig.savefig(figdir / "fig2_travel_distance_hist.png", facecolor=SURFACE)
    plt.close(fig)
    made.append("fig2_travel_distance_hist.png")

    # 3 -- cumulative PM2.5 exposure distribution (all agents)
    import numpy as np
    exp = agents["cumulative_dose_ugm3h"].dropna()
    fig, ax = new_fig("Cumulative PM$_{2.5}$ exposure distribution",
                      f"Dose accrued outdoors until shelter arrival (all agents, n={len(exp)}); "
                      "log-scaled dose axis",
                      footer)
    lo, hi = exp.min() * 0.95, exp.max() * 1.05
    bins = np.logspace(np.log10(lo), np.log10(hi), 26)
    ax.hist(exp, bins=bins, color=BLUE, edgecolor=SURFACE, linewidth=1.0)
    ax.set_xscale("log")
    ax.set_xlabel(r"Cumulative exposure ($\mu$g m$^{-3}$ h)")
    ax.set_ylabel("Agents")
    style_axes(ax)
    fig.savefig(figdir / "fig3_exposure_distribution.png", facecolor=SURFACE)
    plt.close(fig)
    made.append("fig3_exposure_distribution.png")

    # 4 -- cumulative exposure by agent, ranked, colored by outcome state
    srt = agents.sort_values("cumulative_dose_ugm3h", ascending=False).reset_index()
    fig, ax = new_fig("Cumulative exposure by agent",
                      "Each bar is one agent, ranked by dose; color = final state",
                      footer)
    colors = [STATE_COLORS.get(s, MUTED) for s in srt["final_state"]]
    vals = srt["cumulative_dose_ugm3h"]
    cap = pctl(agents["cumulative_dose_ugm3h"], 75) * 1.6
    shown = vals.clip(upper=cap)
    ax.bar(range(len(srt)), shown, color=colors, width=0.86)
    for i, (v, s) in enumerate(zip(vals, shown)):
        if v > s + 1:  # clipped bar -> label true value beside the bar top
            ax.text(i + 0.8, s * 0.99, f"{v:,.0f} (off scale)",
                    fontsize=7, color=INK2, ha="left", rotation=90, va="top")
    ax.set_ylim(0, cap * 1.45)
    ax.set_xlabel("Agents, ranked by exposure")
    ax.set_ylabel(r"Cumulative exposure ($\mu$g m$^{-3}$ h)")
    handles = [plt.Rectangle((0, 0), 1, 1, color=STATE_COLORS[s])
               for s in STATE_COLORS if s in set(srt["final_state"])]
    labels = [s for s in STATE_COLORS if s in set(srt["final_state"])]
    if len(labels) > 1:
        leg = ax.legend(handles, labels, frameon=False, fontsize=8, loc="upper right")
        for t in leg.get_texts():
            t.set_color(INK2)
    ax.tick_params(axis="x", bottom=False, labelbottom=False)
    style_axes(ax)
    fig.savefig(figdir / "fig4_exposure_by_agent.png", facecolor=SURFACE)
    plt.close(fig)
    made.append("fig4_exposure_by_agent.png")

    # 5 -- shelter utilization (occupied vs unused capacity)
    op = shelters[shelters["operating"] == True].reset_index()  # noqa: E712
    standby = shelters[shelters["operating"] == False]  # noqa: E712
    sub = "Final occupancy vs unused capacity (operating shelters)"
    if len(standby):
        sub += "\nStandby, not operating: " + ", ".join(standby["name"])
    fig, ax = new_fig("Shelter utilization", sub, footer)
    occ = op["final_occupancy"].astype(float)
    unused = op["capacity"].astype(float) - occ
    y = range(len(op))
    ax.barh(y, occ, color=BLUE, height=0.55, label="Occupied", zorder=3)
    ax.barh(y, unused, left=occ, color=GRID, height=0.55, label="Unused capacity",
            edgecolor=BASELINE, linewidth=0.6, zorder=3)
    for i, (o, c) in enumerate(zip(occ, op["capacity"].astype(float))):
        ax.text(c + 1.5, i, f"{int(o)} / {int(c)}", fontsize=9, color=INK2, va="center")
    ax.set_yticks(list(y),
                  [f"{n} ({s})" for n, s in zip(op["name"], op["shelter_id"])],
                  fontsize=9, color=INK)
    ax.set_xlabel("Beds")
    ax.set_xlim(0, float(op["capacity"].max()) * 1.18)
    leg = ax.legend(frameon=False, fontsize=8, loc="center right")
    for t in leg.get_texts():
        t.set_color(INK2)
    style_axes(ax)
    ax.grid(axis="y", visible=False)
    ax.grid(axis="x", color=GRID, linewidth=0.8)
    fig.savefig(figdir / "fig5_shelter_utilization.png", facecolor=SURFACE)
    plt.close(fig)
    made.append("fig5_shelter_utilization.png")
    return made


# ---------------------------------------------------------------------------
def write_markdown(path, manifest, checks, summary, shelter_stats, exposure_analysis,
                   anomaly, figures, meta):
    rep = manifest["reproducibility"]
    s = summary
    lines = []
    a = lines.append
    a(f"# Run analysis — `{rep['sim_id']}`")
    a("")
    a("## Reproducibility")
    a("")
    a("| Field | Value |")
    a("|---|---|")
    a(f"| Simulation ID | `{rep['sim_id']}` |")
    a(f"| Random seed | `{rep['random_seed']}` |")
    a(f"| Model git commit | `{rep['git_commit']}` |")
    a(f"| Data version tag | `{rep['data_version_tag']}` |")
    a(f"| Run generated (UTC) | {manifest['generated_utc']} |")
    a(f"| Parameters | `{json.dumps(rep['parameters'])}` |")
    a(f"| Analysis script | `{meta['script']}` v{meta['script_version']} |")
    a(f"| Analysis git commit | `{meta['analysis_git_commit']}` |")
    a(f"| Analysis generated (UTC) | {meta['generated_utc']} |")
    a("")
    a("Input datasets (SHA-256):")
    a("")
    for d in rep["input_datasets"]:
        a(f"- `{d['file']}` — `{d['sha256']}`")
    a("")
    n_fail = len(checks.failed)
    a(f"## Verification — {len(checks.results) - n_fail}/{len(checks.results)} checks passed")
    a("")
    if n_fail:
        a("**FAILED checks:**")
        for c in checks.failed:
            a(f"- {c['name']}: {c['detail']}")
    else:
        a("agents.csv, shelters.csv and simulation.json are mutually consistent "
          "(row counts, outcome census, per-shelter occupancy, exposure/VWE/travel "
          "statistics recomputed from raw rows match the manifest).")
    a("")
    a("## Summary statistics")
    a("")
    a("| Metric | Value |")
    a("|---|---|")
    a(f"| Total agents | {s['total_agents']} |")
    a(f"| Successful shelter arrivals | {s['successful_arrivals']} "
      f"({100 * s['arrival_rate']:.0f}%) |")
    a(f"| Failed arrivals | {s['failed_arrivals']} {s['failed_by_state'] or ''} |")
    tt = s["travel_time_min_arrived"]
    if tt:
        a(f"| Travel time (arrived) | mean {tt['mean']:.0f} min · median {tt['median']:.0f} min "
          f"· max {tt['max']:.0f} min ({tt['max'] / 60:.1f} h) |")
    td = s["travel_distance_m_arrived"]
    if td:
        a(f"| Travel distance (arrived) | mean {td['mean'] / 1000:.1f} km · "
          f"median {td['median'] / 1000:.1f} km · max {td['max'] / 1000:.1f} km |")
    e = s["exposure_ugm3h"]
    a(f"| Cumulative PM2.5 exposure (µg·m⁻³·h) | mean {e['mean']:.0f} · median {e['median']:.0f} "
      f"· p90 {e['p90']:.0f} · max {e['max']:.0f} · Gini {e['gini']:.2f} |")
    v = s["vwe_ugm3h"]
    a(f"| VWE (µg·m⁻³·h) | mean {v['mean']:.0f} · Gini {v['gini']:.2f} — "
      f"**placeholder: identical to exposure (RRs = 1.0)** |")
    h = s["hours_above_unhealthy"]
    a(f"| Person-hours above Unhealthy (55.5 µg/m³) | {h['total_person_hours']:.0f} total "
      f"· mean {h['mean']:.1f} h/agent |")
    sp = s["exposure_split_mean_ugm3h"]
    a(f"| Mean dose split | {sp['while_waiting_pre_evac']:.0f} waiting pre-evac + "
      f"{sp['while_traveling_or_stranded']:.0f} traveling/stranded |")
    a("")
    a("## Shelter statistics")
    a("")
    a("| Shelter | Operating | Capacity | Final occ. | Unused | Refused | First arrival | Last arrival |")
    a("|---|---|---|---|---|---|---|---|")
    for sh in shelter_stats:
        t = sh["arrival_timing"] or {}
        a(f"| {sh['name']} ({sh['shelter_id']}) | {'yes' if sh['operating'] else 'standby'} "
          f"| {sh['capacity'] if sh['capacity'] is not None else '—'} "
          f"| {sh['final_occupancy']} | {sh['unused_capacity'] if sh['unused_capacity'] is not None else '—'} "
          f"| {sh['refused_agents']} | {t.get('first_local', '—')} | {t.get('last_local', '—')} |")
    a("")
    a("## Exposure analysis")
    a("")
    a("**Highest-exposure agents:**")
    a("")
    a("| Agent | State | Shelter | Dose (µg·m⁻³·h) | Travel (min) | h > Unhealthy |")
    a("|---|---|---|---|---|---|")
    for r in exposure_analysis["highest_exposure_agents"]:
        a(f"| {r['agent_id']} | {r['final_state']} | {r['shelter_reached'] or '—'} "
          f"| {r['cumulative_dose_ugm3h']:.0f} | {r['travel_time_min'] if r['travel_time_min'] is not None else '—'} "
          f"| {r['hours_above_unhealthy']:.1f} |")
    a("")
    a("**Lowest-exposure agents:**")
    a("")
    a("| Agent | State | Shelter | Dose (µg·m⁻³·h) | Travel (min) | h > Unhealthy |")
    a("|---|---|---|---|---|---|")
    for r in exposure_analysis["lowest_exposure_agents"]:
        a(f"| {r['agent_id']} | {r['final_state']} | {r['shelter_reached'] or '—'} "
          f"| {r['cumulative_dose_ugm3h']:.0f} | {r['travel_time_min'] if r['travel_time_min'] is not None else '—'} "
          f"| {r['hours_above_unhealthy']:.1f} |")
    a("")
    c = exposure_analysis["travel_time_vs_exposure_arrived"]
    a(f"**Travel time vs exposure (arrived agents, n={c['n']}):** Pearson r = {c['pearson_r']}, "
      f"Spearman rho = {c['spearman_rho']}. {c['note']}")
    a("")
    a("## Routing/data integrity flag")
    a("")
    if anomaly["n_flagged"]:
        a(f"{anomaly['n_flagged']} of {anomaly['n_with_route']} routed agents walked "
          f"substantially farther than their recorded shortest-path distance "
          f"(surplus > {anomaly['flag_threshold_m']:.0f} m). The surpluses cluster at "
          f"{anomaly['distinct_detour_values_m']} m — near-constant values shared across "
          "agents from different encampments, the signature of a street-graph data "
          "artifact (a mis-oriented or multi-part feature on a shared path trunk), "
          "NOT of random wandering. Travel time and exposure for these agents are "
          "inflated accordingly. See docs/validation/gui-issue-diagnosis.md.")
    else:
        a("All routed agents walked ≈ their shortest-path network distance "
          f"(surplus ≤ {anomaly['flag_threshold_m']:.0f} m). No detour artifact detected.")
    a("")
    a("## Figures")
    a("")
    for f in figures:
        a(f"![{f}](figures/{f})")
    a("")
    path.write_text("\n".join(lines), encoding="utf-8")


# ---------------------------------------------------------------------------
def analyze(run_dir):
    run = Path(run_dir)
    print(f"\n=== {run} ===")
    for req in ("agents.csv", "shelters.csv", "simulation.json"):
        if not (run / req).exists():
            print(f"  MISSING {req} -- skipping run")
            return False

    manifest = json.loads((run / "simulation.json").read_text(encoding="utf-8"))
    agents = pd.read_csv(run / "agents.csv")
    shelters = pd.read_csv(run / "shelters.csv")

    checks = verify(run, agents, shelters, manifest)
    n_fail = len(checks.failed)
    print(f"  verification: {len(checks.results) - n_fail}/{len(checks.results)} passed")
    for c in checks.failed:
        print(f"    FAIL {c['name']}: {c['detail']}")

    summary, shelter_stats, exposure_analysis = summarize(agents, shelters, manifest)
    anomaly = routing_anomaly(agents)

    rep = manifest["reproducibility"]
    meta = {
        "generated_utc": _dt.datetime.now(_dt.timezone.utc)
            .strftime("%Y-%m-%dT%H:%M:%SZ"),
        "script": "scripts/analyze_run.py",
        "script_version": SCRIPT_VERSION,
        "analysis_git_commit": analysis_git_commit(),
        "python": platform.python_version(),
        "pandas": pd.__version__,
        "matplotlib": matplotlib.__version__,
    }
    footer = (f"{rep['sim_id']}  ·  seed {rep['random_seed']}  ·  "
              f"model commit {rep['git_commit'][:10]}  ·  data {rep['data_version_tag']}  ·  "
              f"analysis {meta['generated_utc']}")

    outdir = run / "analysis"
    outdir.mkdir(exist_ok=True)
    figures = render_figures(agents, shelters, manifest, outdir / "figures", footer, anomaly)

    out = {
        "schema": "reu-wildfire-shelter-abm/analysis/v1",
        "analysis": meta,
        "reproducibility": {
            "sim_id": rep["sim_id"], "random_seed": rep["random_seed"],
            "model_git_commit": rep["git_commit"],
            "data_version_tag": rep["data_version_tag"],
            "input_datasets": rep["input_datasets"],
            "parameters": rep["parameters"],
            "run_generated_utc": manifest["generated_utc"],
        },
        "verification": {"n_checks": len(checks.results),
                         "n_failed": n_fail, "checks": checks.results},
        "summary_statistics": summary,
        "shelter_statistics": shelter_stats,
        "exposure_analysis": exposure_analysis,
        "routing_anomaly": anomaly,
        "figures": figures,
    }
    (outdir / "summary.json").write_text(json.dumps(out, indent=2, ensure_ascii=False),
                                         encoding="utf-8")
    write_markdown(outdir / "analysis-report.md", manifest, checks, summary,
                   shelter_stats, exposure_analysis, anomaly, figures, meta)
    print(f"  wrote {outdir / 'summary.json'}")
    print(f"  wrote {outdir / 'analysis-report.md'}")
    print(f"  wrote {len(figures)} figures -> {outdir / 'figures'}")
    if anomaly["n_flagged"]:
        print(f"  NOTE: routing detour artifact flagged on {anomaly['n_flagged']} agents "
              f"(surpluses ~{anomaly['distinct_detour_values_m']} m)")
    return n_fail == 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("runs", nargs="*",
                    help="run directories (default: all Geography/output/run_*)")
    args = ap.parse_args()
    runs = [Path(r) for r in args.runs] if args.runs else \
        sorted((REPO_ROOT / "Geography" / "output").glob("run_*"))
    if not runs:
        sys.exit("No run directories found under Geography/output")
    ok = all([analyze(r) for r in runs])
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
