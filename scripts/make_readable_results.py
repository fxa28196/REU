#!/usr/bin/env python3
"""Turn the raw 2026 three-arm simulation output into results a
non-specialist can read.

Reads Geography/output/{A,B,C}2026-n6842-seed{42..50}/ (27 runs) and
produces, under docs/final/readable/:

  1_EVERY_PERSON.csv        one row per resident per scenario (seed 42),
                            plain-English columns
  2_BY_GROUP.csv            outcomes broken down by demographic / health group
  3_WHOLE_POPULATION.csv    one row per scenario - totals, with the min-max
                            range across all nine seeds beside each headline
  RESULTS_EXPLAINED.md      the whole story in plain language, no jargon
  figures/*.png             six charts

Nothing is recomputed that the simulation is responsible for; every value is
copied or aggregated from the exported per-resident records. Seed 42 is the
reported run (the project convention since the first baseline); the other
eight seeds appear as ranges so a reader can see how little the story moves.
"""
import json
import pathlib

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/final/readable"
FIG = OUT / "figures"
OUT.mkdir(parents=True, exist_ok=True)
FIG.mkdir(exist_ok=True)

SEEDS = list(range(42, 51))
ARM = {"A": "A - Shelters as they are today",
       "B": "B - Enough beds, but in the buildings we already have",
       "C": "C - Same number of beds, ten of the new ones placed well"}
COLOR = {"A": "#d03b3b", "B": "#ec835a", "C": "#2a78d6"}
INK, INK2, MUTED = "#0b0b0b", "#52514e", "#898781"
GRID, SURFACE = "#e1e0d9", "#fcfcfb"


def rdir(arm, seed):
    return ROOT / f"Geography/output/{arm}2026-n6842-seed{seed}"


def load(arm, seed=42):
    d = rdir(arm, seed)
    return (pd.read_csv(d / "agents.csv"),
            json.loads((d / "simulation.json").read_text()),
            pd.read_csv(d / "shelters.csv"))


def style(ax):
    ax.set_facecolor(SURFACE)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color("#c3c2b7")
    ax.grid(axis="y", color=GRID, lw=0.8)
    ax.set_axisbelow(True)
    ax.tick_params(colors=MUTED, labelsize=9)
    ax.xaxis.label.set_color(INK2)
    ax.yaxis.label.set_color(INK2)


def newfig(title, sub, size=(8.6, 4.8)):
    f, ax = plt.subplots(figsize=size, dpi=200, layout="constrained")
    f.patch.set_facecolor(SURFACE)
    f.suptitle(title, x=0.02, ha="left", fontsize=13, fontweight="bold", color=INK)
    ax.set_title(sub, loc="left", fontsize=9.5, color=INK2, pad=10)
    return f, ax


plt.rcParams["font.family"] = ["Segoe UI", "DejaVu Sans", "sans-serif"]

DATA = {a: load(a) for a in ARM}                       # seed 42, full detail
YN = {1: "yes", 0: "no"}
STATE = {"SHELTERED": "Got indoors",
         "REFUSED_ALL_FULL": "Turned away - shelters were full",
         "UNREACHABLE": "Could not reach any shelter on foot",
         "EN_ROUTE": "Still walking when the smoke ended",
         "PRE_EVAC": "Never left camp"}

# ---------------------------------------------------------------- 1. people
frames = []
for arm, (df, m, sh) in DATA.items():
    frames.append(pd.DataFrame({
        "Person": df.agent_id,
        "Scenario": ARM[arm],
        "Where they started (camp ID)": df.starting_encampment,
        "Start longitude": df.start_lon,
        "Start latitude": df.start_lat,
        "Did they get indoors?": df.reached_shelter.map({"yes": "YES", "no": "NO"}),
        "What happened": df.final_state.map(STATE).fillna(df.final_state),
        "Shelter they reached": df.shelter_reached.fillna("(none)"),
        "How far they walked (km)": (df.total_travel_distance_m / 1000).round(2),
        "How long it took (hours)": (df.travel_time_min / 60).round(1),
        "Age": df.age_years,
        "Age group": df.age_band,
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

# ---------------------------------------------------------------- 2. groups
GROUPS = [("Everyone", None, None),
          ("Trouble walking", "mobility_limited", 1),
          ("No trouble walking", "mobility_limited", 0),
          ("Has COPD", "copd_flag", 1), ("No COPD", "copd_flag", 0),
          ("Has asthma", "asthma_flag", 1), ("No asthma", "asthma_flag", 0),
          ("Chronic condition", "chronic_physical", 1),
          ("No chronic condition", "chronic_physical", 0),
          ("Counted vulnerable", "vulnerable_flag", 1),
          ("Not vulnerable", "vulnerable_flag", 0),
          ("Age 18-44", "age_band", "18-44"),
          ("Age 45-64", "age_band", "45-64"),
          ("Age 65+", "age_band", "65+")]
rows = []
for arm, (df, m, sh) in DATA.items():
    for label, col, val in GROUPS:
        g = df if col is None else df[df[col] == val]
        if not len(g):
            continue
        got = g[g.final_state == "SHELTERED"]
        rows.append({
            "Scenario": ARM[arm], "Group": label, "How many people": len(g),
            "Got indoors": len(got),
            "Percent who got indoors": round(100 * len(got) / len(g), 1),
            "Average walking speed (m/s)": round(g.walking_speed_mps.mean(), 2),
            "Average distance walked (km)": round(g.total_travel_distance_m.mean() / 1000, 2),
            "Average smoke breathed in (micrograms)": round(g.inhaled_dose_ug.mean()),
            "Average hours in dangerous air": round(g.hours_above_unhealthy.mean(), 1)})
by_group = pd.DataFrame(rows)
by_group.to_csv(OUT / "2_BY_GROUP.csv", index=False)

# ------------------------------------------------- 3. whole population + range
def run_totals(arm, seed):
    df = pd.read_csv(rdir(arm, seed) / "agents.csv")
    sh = pd.read_csv(rdir(arm, seed) / "shelters.csv")
    return {
        "got": int((df.final_state == "SHELTERED").sum()),
        "refused": int((df.final_state == "REFUSED_ALL_FULL").sum()),
        "unreach": int((df.final_state == "UNREACHABLE").sum()),
        "empty": int(sh.capacity.sum() - sh.final_occupancy.sum()),
        "walk_km": df.total_travel_distance_m.mean() / 1000,
        "dose": df.inhaled_dose_ug.mean(),
        "hrs": df.hours_above_unhealthy.sum(),
    }


pop, spread = [], {}
for arm, (df, m, sh) in DATA.items():
    caps = int(sh.capacity.sum())
    got = df[df.final_state == "SHELTERED"]
    allseeds = [run_totals(arm, s) for s in SEEDS]
    spread[arm] = allseeds
    rng = lambda k, f=1.0, d=0: (
        f"{min(t[k] * f for t in allseeds):,.{d}f}"
        f" - {max(t[k] * f for t in allseeds):,.{d}f}")
    pop.append({
        "Scenario": ARM[arm],
        "Total people": len(df),
        "Shelters": len(sh),
        "Total beds available": caps,
        "People who got indoors": len(got),
        "Percent who got indoors": round(100 * len(got) / len(df), 1),
        "Got indoors - range across 9 re-runs": rng("got"),
        "Beds left empty": caps - int(sh.final_occupancy.sum()),
        "People turned away (shelters full)": int((df.final_state == "REFUSED_ALL_FULL").sum()),
        "Turned away - range across 9 re-runs": rng("refused"),
        "People who could not reach any shelter": int((df.final_state == "UNREACHABLE").sum()),
        "Average distance walked (km)": round(df.total_travel_distance_m.mean() / 1000, 2),
        "Average smoke breathed in (micrograms)": round(df.inhaled_dose_ug.mean()),
        "Smoke breathed - range across 9 re-runs": rng("dose"),
        "Total hours everyone spent in dangerous air": round(df.hours_above_unhealthy.sum()),
    })
whole = pd.DataFrame(pop)
whole.to_csv(OUT / "3_WHOLE_POPULATION.csv", index=False)

# ------------------------------------------------------------------ figures
made = []


def save(f, n):
    f.savefig(FIG / n, facecolor=SURFACE)
    plt.close(f)
    made.append(n)


A_df = DATA["A"][0]

f, ax = newfig("Did people get indoors?",
               "6,842 people outside. B and C both have 6,842 beds - only WHERE the new beds go differs")
got = [len(DATA[a][0][DATA[a][0].final_state == "SHELTERED"]) for a in "ABC"]
miss = [6842 - g for g in got]
ax.bar(range(3), got, 0.55, color=[COLOR[a] for a in "ABC"], label="Got indoors")
ax.bar(range(3), miss, 0.55, bottom=got, color="#d8d6cf", label="Stayed outside")
for i, g in enumerate(got):
    ax.text(i, g / 2, f"{g:,}\n({100*g/6842:.0f}%)", ha="center", va="center",
            color="white", fontweight="bold")
    ax.text(i, g + miss[i] / 2, f"{miss[i]:,}", ha="center", va="center", color=INK2)
ax.set_xticks(range(3), [ARM[a] for a in "ABC"], fontsize=8.6, color=INK)
ax.set_ylabel("People")
ax.legend(frameon=False, fontsize=9)
style(ax)
save(f, "fig1_got_indoors.png")

f, ax = newfig("Empty beds and turned-away people, at the same time",
               "When both bars are tall the beds exist but sit in the wrong places")
empt = [int(DATA[a][2].capacity.sum() - DATA[a][2].final_occupancy.sum()) for a in "ABC"]
refu = [int((DATA[a][0].final_state == "REFUSED_ALL_FULL").sum()) for a in "ABC"]
x = range(3)
ax.bar([i - 0.2 for i in x], empt, 0.38, label="Beds left empty", color="#7f8c8d")
ax.bar([i + 0.2 for i in x], refu, 0.38, label="People turned away", color="#d03b3b")
for i in x:
    ax.text(i - 0.2, empt[i], f"{empt[i]:,}", ha="center", va="bottom", fontsize=8.5, color=INK2)
    ax.text(i + 0.2, refu[i], f"{refu[i]:,}", ha="center", va="bottom", fontsize=8.5, color=INK2)
ax.set_xticks(list(x), [ARM[a] for a in "ABC"], fontsize=8.6, color=INK)
ax.set_ylabel("Count")
ax.legend(frameon=False, fontsize=9)
style(ax)
save(f, "fig2_empty_beds_vs_turned_away.png")

f, ax = newfig("How much smoke each person breathed in", "Lower is better; note the log-like tail in A")
for a in "ABC":
    ax.hist(DATA[a][0].inhaled_dose_ug, bins=45, histtype="step", lw=2,
            color=COLOR[a], label=ARM[a])
ax.set_xlabel("Smoke breathed in (micrograms)")
ax.set_ylabel("Number of people")
ax.legend(frameon=False, fontsize=8.5)
style(ax)
save(f, "fig3_smoke_breathed.png")

labels = ["Trouble walking", "No trouble walking", "Has COPD", "No COPD",
          "Counted vulnerable", "Age 65+"]


def gv(l, arm, col):
    row = by_group[(by_group.Group == l) & (by_group.Scenario == ARM[arm])]
    return row.iloc[0][col]


xa = range(len(labels))
f, ax = newfig("Who got indoors, by group",
               "B widens the gap between fast and slow walkers; C narrows it again")
w = 0.26
for i, a in enumerate("ABC"):
    v = [gv(l, a, "Percent who got indoors") for l in labels]
    ax.bar([j + (i - 1) * w for j in xa], v, w, color=COLOR[a], label=ARM[a])
    for j, p in zip(xa, v):
        ax.text(j + (i - 1) * w, p, f"{p:.0f}", ha="center", va="bottom",
                fontsize=7.5, color=INK2)
ax.set_xticks(list(xa), labels, fontsize=8.5, color=INK)
ax.set_ylabel("Percent who got indoors")
ax.set_ylim(0, 112)
ax.legend(frameon=False, fontsize=8)
style(ax)
save(f, "fig4_who_got_indoors.png")

f, ax = newfig("How far people had to walk", "Distance walked by people who got indoors")
for a in "ABC":
    d0 = DATA[a][0]
    ax.hist(d0[d0.final_state == "SHELTERED"].total_travel_distance_m / 1000,
            bins=40, histtype="step", lw=2, color=COLOR[a], label=ARM[a])
ax.set_xlabel("Kilometres walked")
ax.set_ylabel("Number of people")
ax.legend(frameon=False, fontsize=8.5)
style(ax)
save(f, "fig5_distance_walked.png")

f, ax = plt.subplots(figsize=(9.0, 7.6), dpi=200, layout="constrained")
f.patch.set_facecolor(SURFACE)
f.suptitle("Where people started, and where each scenario puts the beds",
           x=0.02, ha="left", fontsize=13, fontweight="bold", color=INK)
ax.set_title("Grey dots = where people actually are (2,981 real campsite reports). "
             "Circles = shelters, sized by beds.", loc="left", fontsize=9.5,
             color=INK2, pad=10)
ax.scatter(A_df.start_lon, A_df.start_lat, s=4, c="#b9b7ae", alpha=0.4, lw=0)
for a, mk in (("A", "o"), ("C", "P")):
    sh = DATA[a][2]
    lab = ARM[a] if a == "A" else "C - the ten new well-placed shelters (plus A's sites, grown 1.5x)"
    sub = sh if a == "A" else sh[sh.shelter_id.str.startswith("NEW")]
    ax.scatter(sub.lon, sub.lat, s=sub.capacity.astype(float) / 2.2, marker=mk,
               c=COLOR[a], edgecolors="white", lw=0.8, zorder=5, label=lab, alpha=0.95)
ax.set_aspect(1 / 0.70)
ax.set_facecolor(SURFACE)
for s in ("top", "right", "left", "bottom"):
    ax.spines[s].set_visible(False)
ax.tick_params(colors=MUTED, labelsize=7)
ax.legend(frameon=False, fontsize=8.5, loc="upper left")
save(f, "fig6_map.png")

# ---------------------------------------------------------------- narrative
t = {a: whole.iloc[i] for i, a in enumerate("ABC")}
gap = {a: gv("No trouble walking", a, "Percent who got indoors")
          - gv("Trouble walking", a, "Percent who got indoors") for a in "ABC"}

(OUT / "RESULTS_EXPLAINED.md").write_text(f"""# What we found, in plain language

**The question:** if the September 2020 wildfire smoke came back today, what
would happen to the {t['A']['Total people']:,} people living outside in Multnomah County -
and what actually helps: more beds, or better-placed beds?

Every person in the simulation is separate, with their own age, sex, health,
and walking speed, drawn from published local surveys. Each one starts at a
real reported campsite location and, when the smoke gets dangerous, walks
along real Portland streets toward the nearest shelter that still has room.

We ran three scenarios. **Each one exists to answer the question the previous
one raised.**

* **Scenario A - today.** The {t['A']['Shelters']} clean-air-capable facilities the county
  actually operates, at their real addresses, with their real
  {t['A']['Total beds available']:,} spaces.
* **Scenario B - more beds, same buildings.** Every real facility grows about
  3x, so the system holds exactly {t['B']['Total beds available']:,} - one bed per person. Nothing
  moves.
* **Scenario C - same number of beds, better places.** The real facilities
  grow only 1.5x, and the rest of the capacity is built as **ten new
  shelters at locations a placement algorithm chose** - same
  {t['C']['Total beds available']:,} total beds as B.

Everything else is identical: same people, same smoke, same streets.
And every number below was re-run with nine different random seeds -
the ranges in `3_WHOLE_POPULATION.csv` show the story never moves.

---

## The headline

| | A - today | B - more beds | C - better-placed beds |
|---|---|---|---|
| **People who got indoors** | {t['A']['People who got indoors']:,} ({t['A']['Percent who got indoors']}%) | {t['B']['People who got indoors']:,} ({t['B']['Percent who got indoors']}%) | **{t['C']['People who got indoors']:,} ({t['C']['Percent who got indoors']}%)** |
| People turned away | {t['A']['People turned away (shelters full)']:,} | {t['B']['People turned away (shelters full)']:,} | **{t['C']['People turned away (shelters full)']:,}** |
| Beds that sat empty | {t['A']['Beds left empty']:,} | **{t['B']['Beds left empty']:,}** | {t['C']['Beds left empty']:,} |
| Average walk | {t['A']['Average distance walked (km)']} km | {t['B']['Average distance walked (km)']} km | **{t['C']['Average distance walked (km)']} km** |
| Smoke breathed in, per person | {t['A']['Average smoke breathed in (micrograms)']:,} ug | {t['B']['Average smoke breathed in (micrograms)']:,} ug | **{t['C']['Average smoke breathed in (micrograms)']:,} ug** |

### The three sentences that matter

> **1. Today's system shelters fewer than one person in three - not because
> people won't walk, but because there is roughly one space for every three
> people.**

> **2. Tripling the size of the buildings we already have fixes most of it -
> but leaves {t['B']['Beds left empty']:,} beds EMPTY while {t['B']['People turned away (shelters full)']:,} people are turned away,
> because the extra beds went where the buildings are, not where the people
> are.**

> **3. Spending the same beds differently - ten new well-placed shelters -
> cuts refusals to {t['C']['People turned away (shelters full)']:,}, and cuts the smoke people breathe in half
> again.**

---

## Who gets left behind

The gap between people who walk easily and people who don't:

| | A | B | C |
|---|---|---|---|
| Walks without difficulty - got indoors | {gv('No trouble walking','A','Percent who got indoors')}% | {gv('No trouble walking','B','Percent who got indoors')}% | {gv('No trouble walking','C','Percent who got indoors')}% |
| Trouble walking - got indoors | {gv('Trouble walking','A','Percent who got indoors')}% | {gv('Trouble walking','B','Percent who got indoors')}% | {gv('Trouble walking','C','Percent who got indoors')}% |
| **The gap (percentage points)** | **{gap['A']:.1f}** | **{gap['B']:.1f}** | **{gap['C']:.1f}** |

Adding beds to the buildings we already have makes the gap WIDER - the new
beds are grabbed first by whoever can walk there fastest. Placing the new
beds well brings the gap back down while lifting everyone.

People with COPD follow the same pattern ({gv('Has COPD','A','Percent who got indoors')}% -> {gv('Has COPD','B','Percent who got indoors')}% -> {gv('Has COPD','C','Percent who got indoors')}%),
because COPD is the one condition with published evidence that it slows
walking (about 0.19 m/s slower). Asthma shows no access gap - not an
oversight: no evidence exists that asthma slows walking, so the model does
not invent it.

---

## What the files are

| File | What it holds |
|---|---|
| `1_EVERY_PERSON.csv` | One row per person per scenario ({3*t['A']['Total people']:,} rows). Every column is a plain question |
| `2_BY_GROUP.csv` | The same results grouped by age, walking ability, asthma, COPD, chronic condition |
| `3_WHOLE_POPULATION.csv` | One row per scenario - totals, each with its range across all nine seeds |
| `figures/` | Six charts, including the map |

The full technical breakdown - every equation, every source, every code
snippet, every one of the 27 runs - is in
`docs/final/TECHNICAL_REFERENCE.md`.

---

## What this does NOT say

* It does **not** predict anyone getting sick. It measures how much smoke
  people breathe, not what that smoke does to them.
* The ten "new shelters" are points on the street map chosen by an
  algorithm. They are not real buildings, and nobody has checked zoning,
  cost, or whether a shelter could actually be built there.
* It assumes everyone knows the shelters exist and heads for one. A local
  survey found 65% of unsheltered people had never heard of the shelters -
  so scenario A's numbers are, if anything, optimistic.
* Two real facilities (Clinton Triangle, ~160 spaces, and Multnomah Safe
  Rest Village, 28) are missing because they publish no street address.
* The smoke is the real, measured September 2020 event, used as a
  "what if it happened again" scenario against today's shelter system.
""", encoding="utf-8")

print(f"wrote {OUT}")
print(f"  {len(made)} figures")
print(whole[["Scenario", "People who got indoors", "Percent who got indoors",
             "People turned away (shelters full)", "Beds left empty"]].to_string(index=False))
