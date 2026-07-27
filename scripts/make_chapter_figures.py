#!/usr/bin/env python3
"""Build the publication figures for docs/chapter/chapter.tex.

Writes vector PDF (not EPS) into docs/chapter/figures/. PDF is equally vector
and is pdfLaTeX's native format; an earlier EPS set forced epstopdf to reconvert
every figure on every Overleaf compile and blew the free-plan timeout.

Every figure is greyscale-legible: each series carries a distinct hatch or
marker as well as a colour, and every bar is directly labelled, so the figures
survive black-and-white printing at 8.5x11in.

Sources: Geography/output/{A,B,C}2026-n6842-seed{42..50}/ (27 runs) and
Geography/data/airnow/aqs_hourly_pm25_portland_2020-09.csv.
"""
import collections
import csv
import datetime
import pathlib

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIG = ROOT / "docs/chapter/figures"
FIG.mkdir(parents=True, exist_ok=True)
SEEDS = list(range(42, 51))

# Print-safe: distinct in colour, distinct in lightness, distinct in hatch.
COL = {"A": "#c4342c", "B": "#1f6fb2", "C": "#0f7a5a"}
HATCH = {"A": "", "B": "///", "C": "..."}
LABEL = {"A": "A: today", "B": "B: more beds", "C": "C: better-placed beds"}
GREY = "#5b5f66"

plt.rcParams.update({
    "font.family": "serif",
    "font.serif": ["Times New Roman", "DejaVu Serif"],
    "font.size": 9,
    "axes.labelsize": 9,
    "axes.titlesize": 9.5,
    "xtick.labelsize": 8,
    "ytick.labelsize": 8,
    "legend.fontsize": 8,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.linewidth": 0.7,
    "xtick.major.width": 0.7,
    "ytick.major.width": 0.7,
    "pdf.fonttype": 42,
    "figure.dpi": 200,
})


def rdir(arm, seed):
    return ROOT / f"Geography/output/{arm}2026-n6842-seed{seed}"


def save(fig, name):
    fig.savefig(FIG / f"{name}.pdf", bbox_inches="tight", pad_inches=0.02)
    plt.close(fig)
    kb = (FIG / f"{name}.pdf").stat().st_size / 1024
    print(f"  {name}.pdf  {kb:.0f} KB")


agents = {a: pd.read_csv(rdir(a, 42) / "agents.csv") for a in "ABC"}
shelters = {a: pd.read_csv(rdir(a, 42) / "shelters.csv") for a in "ABC"}
robust = pd.read_csv(ROOT / "docs/final/results-2026/6_SEED_ROBUSTNESS.csv")
robust = robust[robust.Seed.notna() & (robust.Seed.astype(str) != "")].copy()
robust["Seed"] = robust["Seed"].astype(float).astype(int)


def pm25_series():
    start = datetime.datetime(2020, 9, 7)
    acc = collections.defaultdict(list)
    src = ROOT / "Geography/data/airnow/aqs_hourly_pm25_portland_2020-09.csv"
    for r in csv.DictReader(open(src, encoding="utf-8-sig")):
        if r["County Name"].lower() != "multnomah":
            continue
        try:
            v = float(r["Sample Measurement"])
        except ValueError:
            continue
        d = datetime.datetime.strptime(
            r["Date Local"] + " " + r["Time Local"][:5], "%Y-%m-%d %H:%M")
        h = int((d - start).total_seconds() // 3600)
        if 0 <= h < 312:
            acc[h].append(v)
    return [sum(acc[h]) / len(acc[h]) if acc.get(h) else float("nan")
            for h in range(312)]


def fig_event():
    pm = pm25_series()
    fig, ax = plt.subplots(figsize=(5.5, 2.5))
    hrs = range(312)
    ax.fill_between(hrs, 0, pm, color="#8a6a4f", alpha=0.18, lw=0)
    ax.plot(hrs, pm, color="#6b4f38", lw=1.1)
    ax.axhline(55.5, color="#c4342c", ls="--", lw=1.0)
    # Plain text only: matplotlib is not running through LaTeX, so TeX quoting
    # (``...'') and escapes (\%) would be drawn literally into the figure.
    ax.annotate("EPA “Unhealthy” threshold, 55.5 $\\mu$g m$^{-3}$",
                xy=(4, 70), fontsize=7.5, color="#c4342c", va="bottom")
    pk = max(range(312), key=lambda i: pm[i])
    ax.plot([pk], [pm[pk]], "o", ms=4, color="#6b4f38")
    ax.annotate(f"{pm[pk]:.1f}", xy=(pk, pm[pk]), xytext=(pk + 9, pm[pk] - 8),
                fontsize=8, color="#2b2b2b")
    ax.set_xticks([d * 24 for d in range(0, 13, 2)])
    ax.set_xticklabels([f"{7+d} Sep" for d in range(0, 13, 2)])
    ax.set_xlim(0, 311)
    ax.set_ylim(0, 610)
    ax.set_ylabel(r"PM$_{2.5}$ ($\mu$g m$^{-3}$)")
    ax.grid(axis="y", color="#dddad4", lw=0.6)
    ax.set_axisbelow(True)
    save(fig, "fig1_event")


def fig_outcomes():
    fig, axes = plt.subplots(1, 2, figsize=(5.5, 2.6))
    arms = list("ABC")

    got = [(agents[a].final_state == "SHELTERED").sum() for a in arms]
    ax = axes[0]
    b = ax.bar(range(3), got, 0.62, color=[COL[a] for a in arms],
               edgecolor="white", linewidth=0.6)
    for bar, a in zip(b, arms):
        bar.set_hatch(HATCH[a])
    ax.axhline(6842, color=GREY, ls="--", lw=0.9)
    ax.text(2.45, 6950, "population", ha="right", va="bottom",
            fontsize=7, color=GREY)
    for i, v in enumerate(got):
        ax.text(i, v + 130, f"{v:,}\n{100*v/6842:.1f}%", ha="center",
                va="bottom", fontsize=7.5)
    ax.set_xticks(range(3))
    ax.set_xticklabels(arms)
    ax.set_ylim(0, 8600)
    ax.set_ylabel("residents reaching a shelter")
    ax.set_title("(a) Access", loc="left", fontsize=9)
    ax.grid(axis="y", color="#dddad4", lw=0.6)
    ax.set_axisbelow(True)

    ax = axes[1]
    empty = [int(shelters[a].capacity.sum() - shelters[a].final_occupancy.sum())
             for a in arms]
    ref = [int((agents[a].final_state == "REFUSED_ALL_FULL").sum()) for a in arms]
    x = range(3)
    b1 = ax.bar([i - 0.19 for i in x], empty, 0.36, color=GREY,
                edgecolor="white", linewidth=0.6, label="spaces left empty")
    b2 = ax.bar([i + 0.19 for i in x], ref, 0.36, color=COL["A"], hatch="///",
                edgecolor="white", linewidth=0.6, label="residents turned away")
    for bars in (b1, b2):
        ax.bar_label(bars, fmt="%d", fontsize=7, padding=2)
    ax.set_xticks(list(x))
    ax.set_xticklabels(arms)
    ax.set_ylim(0, 5700)
    ax.set_ylabel("count")
    ax.set_title("(b) Spare capacity vs unmet need", loc="left", fontsize=9)
    ax.legend(frameon=False, loc="upper right", fontsize=7.2)
    ax.grid(axis="y", color="#dddad4", lw=0.6)
    ax.set_axisbelow(True)

    fig.tight_layout(w_pad=1.6)
    save(fig, "fig2_outcomes")


def fig_equity():
    fig, ax = plt.subplots(figsize=(5.5, 2.2))
    rows = []
    for a in "ABC":
        d = agents[a]
        easy = 100 * (d[d.mobility_limited == 0].final_state == "SHELTERED").mean()
        hard = 100 * (d[d.mobility_limited == 1].final_state == "SHELTERED").mean()
        rows.append((a, easy, hard))
    ys = [2, 1, 0]
    for (a, easy, hard), y in zip(rows, ys):
        ax.plot([hard, easy], [y, y], color="#b9b6ae", lw=2.4,
                solid_capstyle="round", zorder=1)
        ax.plot([easy], [y], "o", ms=7, color=GREY, mec="white", mew=1.1, zorder=3)
        ax.plot([hard], [y], "s", ms=6.5, color=COL["A"], mec="white", mew=1.1,
                zorder=3)
        ax.text(easy, y + 0.20, f"{easy:.1f}", ha="center", fontsize=7.5,
                color=GREY)
        ax.text(hard, y + 0.20, f"{hard:.1f}", ha="center", fontsize=7.5,
                color=COL["A"])
        ax.text(103, y, f"{easy-hard:.1f} pts", va="center", fontsize=8,
                color=COL["A"] if a == "B" else "#2b2b2b",
                fontweight="bold" if a == "B" else "normal")
    ax.text(103, 2.58, "gap", fontsize=7.5, color=GREY)
    ax.set_yticks(ys)
    ax.set_yticklabels([LABEL[a] for a, _, _ in rows], fontsize=8)
    ax.set_xlim(0, 102)
    ax.set_ylim(-0.6, 2.8)
    ax.set_xlabel("residents reaching a shelter (%)")
    ax.plot([], [], "o", ms=6, color=GREY, label="walks without difficulty")
    ax.plot([], [], "s", ms=6, color=COL["A"], label="mobility limitation")
    ax.legend(frameon=False, loc="lower right", fontsize=7.5, ncol=2,
              bbox_to_anchor=(1.0, -0.46))
    ax.grid(axis="x", color="#dddad4", lw=0.6)
    ax.set_axisbelow(True)
    ax.spines["left"].set_visible(False)
    ax.tick_params(axis="y", length=0)
    save(fig, "fig3_equity")


def fig_map():
    fig, axes = plt.subplots(1, 2, figsize=(5.5, 2.9), sharex=True, sharey=True)
    a42 = agents["A"]
    for ax, arm, title in ((axes[0], "A", "(a) Scenario A: today"),
                           (axes[1], "C", "(b) Scenario C: ten new sites")):
        ax.scatter(a42.start_lon, a42.start_lat, s=1.4, c="#a8a49b",
                   alpha=0.45, lw=0, rasterized=True)
        sh = shelters[arm]
        real = sh[~sh.shelter_id.str.startswith("NEW")]
        ax.scatter(real.lon, real.lat, s=real.capacity / 6.0, marker="o",
                   facecolor="none", edgecolor=COL["A"], lw=0.9, zorder=4)
        if arm == "C":
            new = sh[sh.shelter_id.str.startswith("NEW")]
            ax.scatter(new.lon, new.lat, s=new.capacity / 6.0, marker="^",
                       color=COL["C"], edgecolor="white", lw=0.6, zorder=5)
        ax.set_title(title, loc="left", fontsize=8.5)
        ax.set_xlabel("longitude", fontsize=8)
        ax.set_aspect(1 / 0.70)
        ax.tick_params(labelsize=6.5)
    axes[0].set_ylabel("latitude", fontsize=8)
    axes[0].scatter([], [], s=8, c="#a8a49b", label="resident start point")
    axes[0].scatter([], [], s=22, marker="o", facecolor="none",
                    edgecolor=COL["A"], label="existing facility")
    axes[1].scatter([], [], s=22, marker="^", color=COL["C"],
                    label="new optimized site")
    axes[0].legend(frameon=False, loc="lower left", fontsize=6.5)
    axes[1].legend(frameon=False, loc="lower left", fontsize=6.5)
    fig.tight_layout(w_pad=0.9)
    save(fig, "fig4_map")


def fig_seeds():
    fig, ax = plt.subplots(figsize=(5.5, 2.2))
    for a in "ABC":
        d = robust[robust.Scenario == a].sort_values("Seed")
        ax.plot(d.Seed, d["Got inside"], marker={"A": "o", "B": "s", "C": "^"}[a],
                ms=4.2, lw=1.1, color=COL[a], label=LABEL[a], mec="white", mew=0.6)
    ax.set_xticks(SEEDS)
    ax.set_xlabel("random seed")
    ax.set_ylabel("residents sheltered")
    ax.set_yscale("log")
    ax.set_yticks([2000, 3000, 5000, 7000])
    ax.get_yaxis().set_major_formatter(
        matplotlib.ticker.FuncFormatter(lambda v, p: f"{int(v):,}"))
    ax.legend(frameon=False, fontsize=7.5, ncol=3, loc="center right")
    ax.grid(axis="y", color="#dddad4", lw=0.6)
    ax.set_axisbelow(True)
    ax.set_ylim(1700, 12000)
    save(fig, "fig5_seeds")


def fig_speed():
    fig, ax = plt.subplots(figsize=(5.5, 2.2))
    d = agents["A"]
    bins = [i * 0.05 for i in range(6, 45)]
    groups = [
        (d[(d.mobility_limited == 0) & (d.copd_flag == 0)],
         "no mobility limitation, no COPD", GREY),
        (d[(d.mobility_limited == 0) & (d.copd_flag == 1)],
         r"COPD ($-0.19$ m s$^{-1}$, Buekers 2024)", COL["B"]),
        (d[d.mobility_limited == 1],
         "mobility limitation (Boyce 1999, by replacement)", COL["A"]),
    ]
    for g, lab, c in groups:
        ax.hist(g.walking_speed_mps, bins=bins, histtype="step", lw=1.4,
                color=c, label=f"{lab}; mean {g.walking_speed_mps.mean():.2f}")
    ax.set_xlabel(r"comfortable walking speed (m s$^{-1}$)")
    ax.set_ylabel("residents")
    ax.set_xlim(0.3, 2.2)
    ax.legend(frameon=False, fontsize=7.2, loc="upper left")
    ax.grid(axis="y", color="#dddad4", lw=0.6)
    ax.set_axisbelow(True)
    save(fig, "fig6_speed")


if __name__ == "__main__":
    print(f"writing {FIG}")
    fig_event()
    fig_outcomes()
    fig_equity()
    fig_map()
    fig_seeds()
    fig_speed()
    total = sum(p.stat().st_size for p in FIG.glob("*")) / 1024
    print(f"total figure payload: {total:.0f} KB")
