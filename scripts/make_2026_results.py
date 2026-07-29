#!/usr/bin/env python3
"""Turn the 2026 three-arm runs into results a non-specialist can read.

Reads Geography/output/{A,B,C}2026-n6842-seed{42..50}/ (27 runs: nine seeds
per arm after the second and third replication batches) and writes
docs/final/results-2026/:

  1_EVERY_PERSON.csv        one row per resident per scenario, plain English
  2_BY_GROUP.csv            outcomes broken down by demographic group
  3_WHOLE_POPULATION.csv    one row per scenario - the headline table
  4_WHERE_PEOPLE_STARTED.csv real encampment locations and how many started there
  5_EVERY_SHELTER.csv       every facility, where it is, how full it got
  figures/*.png             the graphs

Nothing here computes new science. It reformats what the model exported.
"""
import csv, json, pathlib
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/final/results-2026"
FIG = OUT / "figures"
SEEDS = list(range(42, 51))   # 42..50 - all three replication batches
ARMS = {
    "A": "A - Today (real shelters, real number of beds)",
    "B": "B - More beds, in the places we already have",
    "C": "C - Same total as B, split across 10 additional sites (more doors)",
}
COLOR = {"A": "#c0392b", "B": "#e67e22", "C": "#27ae60"}


def run_dir(arm, seed):
    return ROOT / f"Geography/output/{arm}2026-n6842-seed{seed}"


def plain_state(s):
    return {"SHELTERED": "Got inside",
            "REFUSED_ALL_FULL": "Turned away - every shelter was full",
            "UNREACHABLE": "Could not reach any shelter",
            "EN_ROUTE": "Still walking when the smoke ended",
            "PRE_EVAC": "Never left"}.get(s, s)


def load(arm, seed):
    df = pd.read_csv(run_dir(arm, seed) / "agents.csv")
    df["arm"] = arm
    df["seed"] = seed
    return df


def main():
    FIG.mkdir(parents=True, exist_ok=True)
    frames = [load(a, s) for a in ARMS for s in SEEDS]
    all_df = pd.concat(frames, ignore_index=True)
    ref = all_df[all_df.seed == 42].copy()          # seed 42 = the reported run

    # ---- 1. every person -------------------------------------------------
    # Arm D (triage reserve, r10) rides along in this sheet only: the mentor
    # deliverable is "inputs + what each person did", and D is the
    # intervention that changes WHO gets in, so its rows belong here.
    d_path = ROOT / "Geography/output/D2026-n6842-seed42-r10/agents.csv"
    if d_path.exists():
        d_df = pd.read_csv(d_path)
        d_df["arm"] = "D"
        d_df["seed"] = 42
        ref = pd.concat([ref, d_df], ignore_index=True)
    arm_labels = dict(ARMS)
    arm_labels["D"] = ("D - Same beds as B, but 10% of each shelter held "
                       "for people who walk slowest")
    per = pd.DataFrame({
        "Scenario": ref["arm"].map(arm_labels),
        "Person": ref["agent_id"],
        "Started at encampment": ref["starting_encampment"],
        "Start longitude": ref["start_lon"],
        "Start latitude": ref["start_lat"],
        "Age": ref["age_years"],
        "Age group": ref["age_band"],
        "Sex": ref["sex"].str.title(),
        "Has trouble walking": ref["mobility_limited"].map({1: "Yes", 0: "No"}),
        "Has asthma": ref["asthma_flag"].map({1: "Yes", 0: "No"}),
        "Has COPD": ref["copd_flag"].map({1: "Yes", 0: "No"}),
        "Has a long-term physical condition": ref["chronic_physical"].map({1: "Yes", 0: "No"}),
        "Counted as more vulnerable": ref["vulnerable_flag"].map({1: "Yes", 0: "No"}),
        "Walking speed (metres per second)": ref["walking_speed_mps"].round(2),
        "What happened": ref["final_state"].map(plain_state),
        "Shelter they reached": ref["shelter_reached"].fillna("none"),
        "Minutes to reach shelter": ref["travel_time_min"].round(1),
        "Times turned away at a full door": ref["door_refusals"],
        "How far they walked (metres)": ref["total_travel_distance_m"].round(0),
        "Hours spent outdoors in smoke": ref["hours_above_unhealthy"].round(1),
        "Smoke breathed in (micrograms)": ref["inhaled_dose_ug"].round(0),
    })
    per.to_csv(OUT / "1_EVERY_PERSON.csv", index=False)

    # ---- 2. by group -----------------------------------------------------
    groups = [
        ("Everyone", lambda d: d.index == d.index),
        ("Age 18-44", lambda d: d.age_band == "18-44"),
        ("Age 45-64", lambda d: d.age_band == "45-64"),
        ("Age 65+", lambda d: d.age_band == "65+"),
        ("Male", lambda d: d.sex == "MALE"),
        ("Female", lambda d: d.sex == "FEMALE"),
        ("Other / not stated", lambda d: ~d.sex.isin(["MALE", "FEMALE"])),
        ("Has trouble walking", lambda d: d.mobility_limited == 1),
        ("Walks without difficulty", lambda d: d.mobility_limited == 0),
        ("Has asthma", lambda d: d.asthma_flag == 1),
        ("Has COPD", lambda d: d.copd_flag == 1),
        ("Long-term physical condition", lambda d: d.chronic_physical == 1),
        ("Counted as more vulnerable", lambda d: d.vulnerable_flag == 1),
    ]
    rows = []
    for arm in ARMS:
        d0 = all_df[(all_df.arm == arm) & (all_df.seed == 42)]
        for label, mask in groups:
            g = d0[mask(d0)]
            if len(g) == 0:
                continue
            got = (g.final_state == "SHELTERED").sum()
            rows.append({
                "Scenario": ARMS[arm],
                "Group": label,
                "People in this group": len(g),
                "Share of everyone (%)": round(100 * len(g) / len(d0), 1),
                "Got inside": int(got),
                "Got inside (%)": round(100 * got / len(g), 1),
                "Turned away": int((g.final_state == "REFUSED_ALL_FULL").sum()),
                "Average walk (metres)": round(g.total_travel_distance_m.mean()),
                "Average hours in bad smoke": round(g.hours_above_unhealthy.mean(), 1),
                "Average smoke breathed (micrograms)": round(g.inhaled_dose_ug.mean()),
                "Average walking speed (m/s)": round(g.walking_speed_mps.mean(), 2),
            })
    pd.DataFrame(rows).to_csv(OUT / "2_BY_GROUP.csv", index=False)

    # ---- 3. whole population (all seeds) ---------------------------------
    tot = []
    for arm in ARMS:
        for seed in SEEDS:
            d0 = all_df[(all_df.arm == arm) & (all_df.seed == seed)]
            sh = json.load(open(run_dir(arm, seed) / "simulation.json"))
            srows = list(csv.DictReader(open(run_dir(arm, seed) / "shelters.csv")))
            cap = sum(int(r["capacity"]) for r in srows)
            occ = sum(int(r["final_occupancy"]) for r in srows)
            got = (d0.final_state == "SHELTERED").sum()
            tot.append({
                "Scenario": ARMS[arm],
                "Seed": seed,
                "People in the simulation": len(d0),
                "Shelters": len(srows),
                "Total beds": cap,
                "Got inside": int(got),
                "Got inside (%)": round(100 * got / len(d0), 1),
                "Turned away (every shelter full)": int((d0.final_state == "REFUSED_ALL_FULL").sum()),
                "Could not reach a shelter": int((d0.final_state == "UNREACHABLE").sum()),
                "Beds left empty": cap - occ,
                "Average walk (metres)": round(d0.total_travel_distance_m.mean()),
                "Average hours in bad smoke": round(d0.hours_above_unhealthy.mean(), 1),
                "Average smoke breathed (micrograms)": round(d0.inhaled_dose_ug.mean()),
                "Total smoke exposure (all people)": round(
                    sh["population"]["exposure_ugm3h"]["total"]),
                "Total person-hours in unhealthy air": round(
                    sh["population"]["total_person_hours_above_unhealthy"]),
            })
    pd.DataFrame(tot).to_csv(OUT / "3_WHOLE_POPULATION.csv", index=False)

    # ---- 4. where people started ----------------------------------------
    a42 = all_df[(all_df.arm == "A") & (all_df.seed == 42)]
    camp = (a42.groupby(["starting_encampment", "start_lon", "start_lat"])
            .agg(People_starting_here=("agent_id", "count"))
            .reset_index()
            .rename(columns={"starting_encampment": "Encampment report id",
                             "start_lon": "Longitude", "start_lat": "Latitude"})
            .sort_values("People_starting_here", ascending=False))
    camp.to_csv(OUT / "4_WHERE_PEOPLE_STARTED.csv", index=False)

    # ---- 5. every shelter ------------------------------------------------
    srows = []
    for arm in ARMS:
        for r in csv.DictReader(open(run_dir(arm, 42) / "shelters.csv")):
            srows.append({
                "Scenario": ARMS[arm], "Shelter": r["shelter_id"], "Name": r["name"],
                "Longitude": r["lon"], "Latitude": r["lat"],
                "Beds": r["capacity"], "People inside at the end": r["final_occupancy"],
                "People turned away at this door": r["refused_count"],
                "How full (%)": round(100 * int(r["final_occupancy"]) / max(1, int(r["capacity"])), 1),
                "Average walk of people who got in (m)": r["mean_travel_dist_m_admitted"],
            })
    pd.DataFrame(srows).to_csv(OUT / "5_EVERY_SHELTER.csv", index=False)

    # ================= FIGURES =================
    def bar(ax, vals, title, ylab, fmt="{:,.0f}"):
        ks = list(vals)
        b = ax.bar(ks, [vals[k] for k in ks], color=[COLOR[k] for k in ks])
        ax.set_title(title, fontsize=11, weight="bold")
        ax.set_ylabel(ylab)
        ax.bar_label(b, labels=[fmt.format(vals[k]) for k in ks], fontsize=9)
        ax.spines[["top", "right"]].set_visible(False)

    d = {a: all_df[(all_df.arm == a) & (all_df.seed == 42)] for a in ARMS}

    # fig 1 - the headline
    fig, ax = plt.subplots(1, 3, figsize=(13, 4.2))
    bar(ax[0], {a: (d[a].final_state == "SHELTERED").sum() for a in ARMS},
        "People who got inside", "people")
    bar(ax[1], {a: (d[a].final_state == "REFUSED_ALL_FULL").sum() for a in ARMS},
        "People turned away", "people")
    bar(ax[2], {a: d[a].hours_above_unhealthy.mean() for a in ARMS},
        "Average hours breathing unhealthy air", "hours", "{:,.1f}")
    fig.suptitle("If a 2020-scale smoke event hit Multnomah County today (6,842 unsheltered people)",
                 fontsize=12, weight="bold")
    fig.tight_layout()
    fig.savefig(FIG / "fig1_headline.png", dpi=150)
    plt.close(fig)

    # fig 2 - the geography failure: empty beds while people are refused
    fig, ax = plt.subplots(figsize=(8, 4.5))
    empt, refu = [], []
    for a in ARMS:
        sr = list(csv.DictReader(open(run_dir(a, 42) / "shelters.csv")))
        empt.append(sum(int(r["capacity"]) for r in sr) - sum(int(r["final_occupancy"]) for r in sr))
        refu.append(int((d[a].final_state == "REFUSED_ALL_FULL").sum()))
    x = range(len(ARMS))
    ax.bar([i - 0.2 for i in x], empt, 0.4, label="Beds left empty", color="#7f8c8d")
    ax.bar([i + 0.2 for i in x], refu, 0.4, label="People turned away", color="#c0392b")
    ax.set_xticks(list(x)); ax.set_xticklabels(list(ARMS))
    ax.set_title("Empty beds and turned-away people at the same time\n"
                 "(when both bars are tall, the beds are in the wrong places)",
                 fontsize=11, weight="bold")
    ax.set_ylabel("count"); ax.legend()
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout(); fig.savefig(FIG / "fig2_empty_beds_vs_turned_away.png", dpi=150)
    plt.close(fig)

    # fig 3 - who gets in, by group
    gl = ["Walks without difficulty", "Has trouble walking", "Has asthma",
          "Has COPD", "Age 65+", "Counted as more vulnerable"]
    gm = {"Walks without difficulty": lambda x: x.mobility_limited == 0,
          "Has trouble walking": lambda x: x.mobility_limited == 1,
          "Has asthma": lambda x: x.asthma_flag == 1,
          "Has COPD": lambda x: x.copd_flag == 1,
          "Age 65+": lambda x: x.age_band == "65+",
          "Counted as more vulnerable": lambda x: x.vulnerable_flag == 1}
    fig, ax = plt.subplots(figsize=(10, 4.8))
    w = 0.26
    for i, a in enumerate(ARMS):
        v = [100 * (d[a][gm[g](d[a])].final_state == "SHELTERED").mean() for g in gl]
        ax.bar([j + (i - 1) * w for j in range(len(gl))], v, w, label=a, color=COLOR[a])
    ax.set_xticks(range(len(gl)))
    ax.set_xticklabels(gl, rotation=18, ha="right", fontsize=9)
    ax.set_ylabel("% who got inside")
    ax.set_title("Who gets inside, by group", fontsize=11, weight="bold")
    ax.legend(title="Scenario"); ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout(); fig.savefig(FIG / "fig3_by_group.png", dpi=150)
    plt.close(fig)

    # fig 4 - map: where people are vs where the shelters are
    fig, axes = plt.subplots(1, 3, figsize=(15, 5.4), sharex=True, sharey=True)
    for ax, a in zip(axes, ARMS):
        ax.scatter(a42.start_lon, a42.start_lat, s=3, c="#b0bec5", alpha=.45,
                   label="where people start")
        sr = list(csv.DictReader(open(run_dir(a, 42) / "shelters.csv")))
        ax.scatter([float(r["lon"]) for r in sr], [float(r["lat"]) for r in sr],
                   s=[int(r["capacity"]) / 3 for r in sr], c=COLOR[a],
                   edgecolor="black", linewidth=.5, label="shelter (size = beds)")
        ax.set_title(a, fontsize=11, weight="bold")
        ax.set_xlabel("longitude")
    axes[0].set_ylabel("latitude"); axes[0].legend(loc="lower left", fontsize=8)
    fig.suptitle("Where unsheltered people actually are (grey) and where the beds are",
                 fontsize=12, weight="bold")
    fig.tight_layout(); fig.savefig(FIG / "fig4_map.png", dpi=150)
    plt.close(fig)

    # fig 5 - walking distance distribution
    fig, ax = plt.subplots(figsize=(8.5, 4.5))
    for a in ARMS:
        ax.hist(d[a].total_travel_distance_m / 1000, bins=60, histtype="step",
                linewidth=2, color=COLOR[a], label=a)
    ax.set_xlabel("kilometres walked"); ax.set_ylabel("people")
    ax.set_title("How far people had to walk", fontsize=11, weight="bold")
    ax.legend(title="Scenario"); ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout(); fig.savefig(FIG / "fig5_walking.png", dpi=150)
    plt.close(fig)

    # fig 6 - smoke breathed in
    fig, ax = plt.subplots(figsize=(8.5, 4.5))
    ax.boxplot([d[a].inhaled_dose_ug for a in ARMS], tick_labels=list(ARMS),
               showfliers=False, medianprops=dict(color="black", linewidth=2))
    ax.set_ylabel("micrograms of smoke breathed in")
    ax.set_title("Smoke actually breathed in, per person", fontsize=11, weight="bold")
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout(); fig.savefig(FIG / "fig6_dose.png", dpi=150)
    plt.close(fig)

    print(f"wrote {OUT}")
    for p in sorted(OUT.glob("*.csv")):
        print("  ", p.name)
    for p in sorted(FIG.glob("*.png")):
        print("   figures/" + p.name)


if __name__ == "__main__":
    main()
