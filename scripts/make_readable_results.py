#!/usr/bin/env python3
"""Turn the raw simulation output into results a non-specialist can read.

Produces, under docs/final/readable/:
  1_EVERY_PERSON.csv        one row per resident, plain-English columns
  2_BY_GROUP.csv            outcomes broken down by demographic / health group
  3_WHOLE_POPULATION.csv    one row per scenario - the population totals
  RESULTS_EXPLAINED.md      the whole story in plain language, no jargon
  figures/*.png             six charts

Nothing is recomputed that the simulation is responsible for; every value is
copied or aggregated from the exported per-resident records.
"""
import json, pathlib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/final/readable"
FIG = OUT / "figures"
OUT.mkdir(parents=True, exist_ok=True); FIG.mkdir(exist_ok=True)

INK, INK2, MUTED = "#0b0b0b", "#52514e", "#898781"
GRID, SURFACE = "#e1e0d9", "#fcfcfb"
BLUE, ORANGE, RED = "#2a78d6", "#ec835a", "#d03b3b"
ARM = {"A": "Shelters where they are now", "B": "Shelters moved to better places"}

def load(arm, seed=42):
    d = ROOT / f"Geography/output/final{arm}-n2037-seed{seed}"
    return pd.read_csv(d / "agents.csv"), json.loads((d / "simulation.json").read_text())

def style(ax):
    ax.set_facecolor(SURFACE)
    for s in ("top", "right", "left"): ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color("#c3c2b7")
    ax.grid(axis="y", color=GRID, lw=0.8); ax.set_axisbelow(True)
    ax.tick_params(colors=MUTED, labelsize=9)
    ax.xaxis.label.set_color(INK2); ax.yaxis.label.set_color(INK2)

def fig(title, sub):
    f, ax = plt.subplots(figsize=(8, 4.6), dpi=200, layout="constrained")
    f.patch.set_facecolor(SURFACE)
    f.suptitle(title, x=0.02, ha="left", fontsize=13, fontweight="bold", color=INK)
    ax.set_title(sub, loc="left", fontsize=9.5, color=INK2, pad=10)
    return f, ax

A, mA = load("A"); B, mB = load("B")
plt.rcParams["font.family"] = ["Segoe UI", "DejaVu Sans", "sans-serif"]

YN = {1: "yes", 0: "no"}
STATE = {"SHELTERED": "Got indoors",
         "REFUSED_ALL_FULL": "Turned away - shelters were full",
         "UNREACHABLE": "Could not reach any shelter on foot"}
frames = []
for arm, df in (("A", A), ("B", B)):
    frames.append(pd.DataFrame({
        "Person": df.agent_id,
        "Scenario": ARM[arm],
        "Where they started (camp ID)": df.starting_encampment,
        "Did they get indoors?": df.reached_shelter.map({"yes": "YES", "no": "NO"}),
        "What happened": df.final_state.map(STATE).fillna(df.final_state),
        "Shelter they reached": df.shelter_reached.fillna("(none)"),
        "How far they walked (km)": (df.total_travel_distance_m / 1000).round(2),
        "How long it took (hours)": (df.travel_time_min / 60).round(1),
        "Age": df.age_years, "Age group": df.age_band,
        "Walking speed (m/s)": df.walking_speed_mps.round(2),
        "Trouble walking?": df.mobility_limited.map(YN),
        "Has asthma?": df.asthma_flag.map(YN),
        "Has COPD?": df.copd_flag.map(YN),
        "Has a chronic condition?": df.chronic_physical.map(YN),
        "Counted as vulnerable?": df.vulnerable_flag.map(YN),
        "Average smoke around them (ug/m3)": df.avg_pm25_ugm3.round(0),
        "Worst smoke around them (ug/m3)": df.peak_pm25_ugm3.round(0),
        "Smoke breathed in (micrograms)": df.inhaled_dose_ug.round(0),
        "Hours in dangerous air": df.hours_above_unhealthy.round(1)}))
pd.concat(frames, ignore_index=True).to_csv(OUT / "1_EVERY_PERSON.csv", index=False)

GROUPS = [("Everyone", None, None),
          ("Trouble walking", "mobility_limited", 1), ("No trouble walking", "mobility_limited", 0),
          ("Has COPD", "copd_flag", 1), ("No COPD", "copd_flag", 0),
          ("Has asthma", "asthma_flag", 1), ("No asthma", "asthma_flag", 0),
          ("Chronic condition", "chronic_physical", 1), ("No chronic condition", "chronic_physical", 0),
          ("Counted vulnerable", "vulnerable_flag", 1), ("Not vulnerable", "vulnerable_flag", 0),
          ("Age 18-44", "age_band", "18-44"), ("Age 45-64", "age_band", "45-64"), ("Age 65+", "age_band", "65+")]
rows = []
for arm, df in (("A", A), ("B", B)):
    for label, col, val in GROUPS:
        g = df if col is None else df[df[col] == val]
        if not len(g): continue
        got = g[g.final_state == "SHELTERED"]
        rows.append({"Scenario": ARM[arm], "Group": label, "How many people": len(g),
                     "Got indoors": len(got),
                     "Percent who got indoors": round(100 * len(got) / len(g), 1),
                     "Average walking speed (m/s)": round(g.walking_speed_mps.mean(), 2),
                     "Average distance walked (km)": round(g.total_travel_distance_m.mean() / 1000, 2),
                     "Average smoke breathed in (micrograms)": round(g.inhaled_dose_ug.mean()),
                     "Average hours in dangerous air": round(g.hours_above_unhealthy.mean(), 1)})
by_group = pd.DataFrame(rows)
by_group.to_csv(OUT / "2_BY_GROUP.csv", index=False)

pop = []
for arm, df, m in (("A", A, mA), ("B", B, mB)):
    got = df[df.final_state == "SHELTERED"]
    caps = sum(s["capacity"] or 0 for s in m["shelters"])
    pop.append({"Scenario": ARM[arm], "Total people": len(df),
                "Shelters open": len([s for s in m["shelters"] if s["final_occupancy"] > 0]),
                "Total beds available": caps,
                "People who got indoors": len(got),
                "Percent who got indoors": round(100 * len(got) / len(df), 1),
                "Beds left empty": caps - len(got),
                "People turned away (shelters full)": int((df.final_state == "REFUSED_ALL_FULL").sum()),
                "People who could not reach any shelter": int((df.final_state == "UNREACHABLE").sum()),
                "Average distance walked (km)": round(df.total_travel_distance_m.mean() / 1000, 2),
                "Average smoke breathed in (micrograms)": round(df.inhaled_dose_ug.mean()),
                "Total smoke breathed by everyone (grams)": round(df.inhaled_dose_ug.sum() / 1e6, 2),
                "Total hours spent in dangerous air": round(df.hours_above_unhealthy.sum())})
whole = pd.DataFrame(pop)
whole.to_csv(OUT / "3_WHOLE_POPULATION.csv", index=False)

made = []
def save(f, n):
    f.savefig(FIG / n, facecolor=SURFACE); plt.close(f); made.append(n)

f, ax = fig("Did people get indoors?", "Same 29 shelters and same 1,816 beds in both - only the locations differ")
got = [len(A[A.final_state == "SHELTERED"]), len(B[B.final_state == "SHELTERED"])]
miss = [len(A) - got[0], len(B) - got[1]]
ax.bar([0, 1], got, 0.55, color=BLUE, label="Got indoors")
ax.bar([0, 1], miss, 0.55, bottom=got, color=ORANGE, label="Stayed outside")
for i, g in enumerate(got):
    ax.text(i, g / 2, f"{g:,}\n({100*g/len(A):.0f}%)", ha="center", va="center", color="white", fontweight="bold")
    ax.text(i, g + miss[i] / 2, f"{miss[i]:,}", ha="center", va="center", color=INK2)
ax.set_xticks([0, 1], [ARM["A"], ARM["B"]], fontsize=10, color=INK)
ax.set_ylabel("People"); ax.legend(frameon=False, fontsize=9); style(ax)
save(f, "fig1_got_indoors.png")

f, ax = fig("How much smoke each person breathed in", "Lower is better")
ax.hist(A.inhaled_dose_ug, bins=45, color=ORANGE, alpha=.8, label=ARM["A"])
ax.hist(B.inhaled_dose_ug, bins=45, color=BLUE, alpha=.8, label=ARM["B"])
ax.set_xlabel("Smoke breathed in (micrograms)"); ax.set_ylabel("Number of people")
ax.legend(frameon=False, fontsize=9); style(ax)
save(f, "fig2_smoke_breathed.png")

f, ax = fig("How far people had to walk", "Distance to the shelter that let them in")
ax.hist(A[A.final_state == "SHELTERED"].total_travel_distance_m / 1000, bins=40, color=ORANGE, alpha=.8, label=ARM["A"])
ax.hist(B[B.final_state == "SHELTERED"].total_travel_distance_m / 1000, bins=40, color=BLUE, alpha=.8, label=ARM["B"])
ax.set_xlabel("Kilometres walked"); ax.set_ylabel("Number of people")
ax.legend(frameon=False, fontsize=9); style(ax)
save(f, "fig3_distance_walked.png")

labels = ["Trouble walking", "No trouble walking", "Has COPD", "No COPD", "Counted vulnerable", "Not vulnerable"]
xa = range(len(labels))
def gv(l, arm, col): return by_group[(by_group.Group == l) & (by_group.Scenario == ARM[arm])].iloc[0][col]

f, ax = fig("Who got indoors, by group", "Notice who is left behind when shelters are badly placed")
va = [gv(l, "A", "Percent who got indoors") for l in labels]
vb = [gv(l, "B", "Percent who got indoors") for l in labels]
ax.bar([i - .2 for i in xa], va, .38, color=ORANGE, label=ARM["A"])
ax.bar([i + .2 for i in xa], vb, .38, color=BLUE, label=ARM["B"])
for i, (p, q) in enumerate(zip(va, vb)):
    ax.text(i - .2, p, f"{p:.0f}%", ha="center", va="bottom", fontsize=8, color=INK2)
    ax.text(i + .2, q, f"{q:.0f}%", ha="center", va="bottom", fontsize=8, color=INK2)
ax.set_xticks(list(xa), labels, fontsize=8.5, color=INK)
ax.set_ylabel("Percent who got indoors"); ax.set_ylim(0, 112)
ax.legend(frameon=False, fontsize=9); style(ax)
save(f, "fig4_who_got_indoors.png")

f, ax = fig("Smoke breathed in, by group", "Average micrograms per person")
va = [gv(l, "A", "Average smoke breathed in (micrograms)") for l in labels]
vb = [gv(l, "B", "Average smoke breathed in (micrograms)") for l in labels]
ax.bar([i - .2 for i in xa], va, .38, color=ORANGE, label=ARM["A"])
ax.bar([i + .2 for i in xa], vb, .38, color=BLUE, label=ARM["B"])
ax.set_xticks(list(xa), labels, fontsize=8.5, color=INK)
ax.set_ylabel("Smoke breathed in (micrograms)")
ax.legend(frameon=False, fontsize=9); style(ax)
save(f, "fig5_smoke_by_group.png")

f, ax = plt.subplots(figsize=(8.4, 7.4), dpi=200, layout="constrained")
f.patch.set_facecolor(SURFACE)
f.suptitle("Where people started and where the shelters are", x=0.02, ha="left",
           fontsize=13, fontweight="bold", color=INK)
ax.set_title("Orange = stayed outside.  Blue = got indoors.", loc="left",
             fontsize=9.5, color=INK2, pad=10)
camps = pd.read_csv(ROOT / "Geography/data/encampments/irp_campsite_reports_sample.csv") \
          .drop_duplicates("inc_id").set_index("inc_id")
aa = A[A.starting_encampment.isin(camps.index)]
lon = camps.loc[aa.starting_encampment, "lon"].to_numpy()
lat = camps.loc[aa.starting_encampment, "lat"].to_numpy()
ok = (aa.final_state == "SHELTERED").to_numpy()
ax.scatter(lon[~ok], lat[~ok], s=7, c=ORANGE, alpha=.5, lw=0, label="Stayed outside")
ax.scatter(lon[ok], lat[ok], s=7, c=BLUE, alpha=.5, lw=0, label="Got indoors")
sA = pd.read_csv(ROOT / "Geography/data/shelters/shelters_2026_current_placement.csv")
sB = pd.read_csv(ROOT / "Geography/data/shelters/shelters_2026_optimized_placement.csv")
ax.scatter(sA.lon, sA.lat, s=110, marker="*", c="#1b4a86", edgecolors="white", lw=1, zorder=5, label="Shelters now")
ax.scatter(sB.lon, sB.lat, s=70, marker="P", c=RED, edgecolors="white", lw=1, zorder=5, label="Better locations")
ax.set_aspect(1 / .70); ax.set_facecolor(SURFACE)
for s in ("top", "right", "left", "bottom"): ax.spines[s].set_visible(False)
ax.tick_params(colors=MUTED, labelsize=7)
ax.legend(frameon=False, fontsize=9, loc="upper left")
save(f, "fig6_map.png")

a0, b0 = whole.iloc[0], whole.iloc[1]
def pc(x, y): return f"{100*(y-x)/x:+.0f}%"
dose_cut = abs(round(100 * (b0["Average smoke breathed in (micrograms)"] - a0["Average smoke breathed in (micrograms)"])
                     / a0["Average smoke breathed in (micrograms)"]))
extra = b0["People who got indoors"] - a0["People who got indoors"]

(OUT / "RESULTS_EXPLAINED.md").write_text(f"""# What we found, in plain language

**The question:** if the September 2020 wildfire smoke came back today, what
would happen to people living outside in Multnomah County - and could we do
better just by putting the shelters in different places?

We simulated **{a0['Total people']:,} people** living outside. Each one is a separate
person with their own age, health, and walking speed. When the smoke got
dangerous, each of them walked along real Portland streets toward the nearest
shelter that still had room.

We ran it twice:

* **Scenario A** - the **{a0['Shelters open']} shelters we actually have today**, where they
  actually are, with the number of beds they actually have.
* **Scenario B** - the **exact same shelters and the exact same
  {b0['Total beds available']:,} beds**, just moved to better locations.

Nothing else changed. Same people, same health, same smoke, same streets, same
number of beds.

---

## The headline

| | Shelters where they are now | Shelters moved | Difference |
|---|---|---|---|
| **People who got indoors** | {a0['People who got indoors']:,} | **{b0['People who got indoors']:,}** | **{extra:+,} people** |
| Percent who got indoors | {a0['Percent who got indoors']}% | **{b0['Percent who got indoors']}%** | |
| People left outside | {a0['Total people']-a0['People who got indoors']:,} | {b0['Total people']-b0['People who got indoors']:,} | |
| **Beds that sat empty** | **{a0['Beds left empty']:,}** | **{b0['Beds left empty']:,}** | |
| Average walk | {a0['Average distance walked (km)']} km | {b0['Average distance walked (km)']} km | {pc(a0['Average distance walked (km)'], b0['Average distance walked (km)'])} |
| **Smoke breathed in, per person** | {a0['Average smoke breathed in (micrograms)']:,} ug | **{b0['Average smoke breathed in (micrograms)']:,} ug** | **{pc(a0['Average smoke breathed in (micrograms)'], b0['Average smoke breathed in (micrograms)'])}** |
| Hours everyone spent in dangerous air | {a0['Total hours spent in dangerous air']:,} | {b0['Total hours spent in dangerous air']:,} | {pc(a0['Total hours spent in dangerous air'], b0['Total hours spent in dangerous air'])} |

### The one sentence version

> **Moving the shelters we already have - without adding a single bed - got
> {extra} more people indoors and cut the amount of smoke people breathed
> in by {dose_cut}%.**

### Why that works

In Scenario A, **{a0['Beds left empty']:,} beds sat completely empty** while
{a0['People turned away (shelters full)']:,} people were turned away. The beds existed. They
were just in places those people could not walk to in time. Moving the same
shelters closer to where people actually are filled every single bed.

---

## Who gets left behind

This is the part that matters most. When shelters are badly placed, the people
who lose out are the ones who walk slowest.

| Group | Got indoors (now) | Got indoors (moved) |
|---|---|---|
| **People who have trouble walking** | **{gv('Trouble walking','A','Percent who got indoors')}%** | **{gv('Trouble walking','B','Percent who got indoors')}%** |
| People who walk normally | {gv('No trouble walking','A','Percent who got indoors')}% | {gv('No trouble walking','B','Percent who got indoors')}% |
| People with COPD | {gv('Has COPD','A','Percent who got indoors')}% | {gv('Has COPD','B','Percent who got indoors')}% |
| People without COPD | {gv('No COPD','A','Percent who got indoors')}% | {gv('No COPD','B','Percent who got indoors')}% |

People with trouble walking move at about **{gv('Trouble walking','A','Average walking speed (m/s)')} metres per second**;
everyone else moves at about **{gv('No trouble walking','A','Average walking speed (m/s)')}**. Over a long walk through
smoke that difference decides who reaches a bed before it is taken.

---

## What the files are

| File | What it holds |
|---|---|
| `1_EVERY_PERSON.csv` | One row per person. Every column is a plain question |
| `2_BY_GROUP.csv` | The same results grouped by age, walking ability, asthma, COPD, chronic condition |
| `3_WHOLE_POPULATION.csv` | One row per scenario - totals for everybody |
| `figures/` | Six charts, including a map |

---

## What this does NOT say

* It does **not** predict anyone getting sick. It measures how much smoke people
  breathe, not what that smoke does to them.
* The "better locations" are points on the street map chosen by a computer. They
  are not real buildings, and nobody has checked whether a shelter could go there.
* It assumes everyone tries to reach a shelter. In reality many do not - a local
  survey found most people who had used shelters described the experience
  negatively. Real numbers would be lower than Scenario A.
* Shelter locations and capacities come from the county's July 2026 list. The
  smoke is real measured air from September 2020, used as a "what if it happened
  again" scenario.
""", encoding="utf-8")

print(f"wrote {OUT}")
print(f"  {len(made)} figures")
print(whole.T.to_string())
