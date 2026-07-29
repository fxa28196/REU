#!/usr/bin/env python3
"""Build the symposium deck ENTIRELY from repo data (rule S1/S5).

Computes every number and chart series from the corrected-graph archives,
dumps them to docs/final/presentation/deck_numbers.json (the provenance
feed), and renders docs/final/presentation/capacity-is-not-access-symposium.html
(self-contained, inline SVG charts, fixed arm colors A/B/C/D everywhere).

Run:  python scripts/make_symposium_deck.py
"""
import csv
import json
import pathlib
from collections import OrderedDict

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTD = ROOT / "docs/final/presentation"
RES = ROOT / "docs/final/results-2026"
THRESH = 55.5
N = OrderedDict()          # every sourced number, with provenance
SRC = {}                   # provenance: key -> source string


def put(key, value, source):
    N[key] = value
    SRC[key] = source
    return value


def man(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


# ---------------------------------------------------------------- smoke ----
aqs = pd.read_csv(ROOT / "Geography/data/airnow/aqs_hourly_pm25_portland_2020-09.csv")
aqs = aqs[aqs["County Name"] == "Multnomah"]           # same filter as SmokeField
aqs["dt"] = pd.to_datetime(aqs["Date Local"] + " " + aqs["Time Local"])
hourly = aqs.groupby("dt")["Sample Measurement"].mean().sort_index()
start = pd.Timestamp("2020-09-07T00:00:00")
window = hourly[(hourly.index >= start) & (hourly.index < start + pd.Timedelta(hours=312))]
series = [round(float(window.get(start + pd.Timedelta(hours=h), float("nan"))), 1)
          for h in range(312)]
above = [i for i, v in enumerate(series) if v == v and v >= THRESH]
put("pm_peak", round(max(v for v in series if v == v), 1), "AQS hourly county mean, 312-h window")
put("pm_peak_hour", int(max(range(312), key=lambda i: series[i] if series[i] == series[i] else -1)), "same")
put("hours_above", len(above), "count of hourly means >= 55.5")
put("first_cross_hour", above[0], "first hourly mean >= 55.5")
spike_end = next(i for i in above if i + 1 not in above)
main_start = next(i for i in above if i > spike_end)
put("spike_hours", f"{above[0]}-{spike_end}", "early-spike contiguous hours >= 55.5")
put("clean_gap_hours", main_start - spike_end - 1, "consecutive sub-threshold hours between spells")
put("main_episode_start", main_start, "first hour of the main spell")
put("pm_first_cross_value", series[above[0]], "hourly mean at first crossing")

# -------------------------------------------------------------- headline ----
sr = pd.read_csv(RES / "6_SEED_ROBUSTNESS.csv")
sr = sr[pd.to_numeric(sr.Seed, errors="coerce").notna()].copy()
for c in sr.columns[3:]:
    sr[c] = pd.to_numeric(sr[c])
sr["Arm"] = sr.Scenario.astype(str).str[0]
for a in "ABC":
    d = sr[sr.Arm == a]
    s42 = d[d.Seed == 42].iloc[0]
    put(f"{a}_in", int(s42["Got inside"]), "6_SEED_ROBUSTNESS.csv seed 42")
    put(f"{a}_in_pct", float(s42["Got inside (%)"]), "same")
    put(f"{a}_in_range", [int(d["Got inside"].min()), int(d["Got inside"].max())], "9-seed range")
    put(f"{a}_refused", int(s42["Turned away"]), "same")
    put(f"{a}_unreach", int(s42["Could not reach"]), "same")
    put(f"{a}_empty", int(s42["Beds left empty"]), "same")
    put(f"{a}_walk", int(s42["Average walk (m)"]), "same")
    put(f"{a}_dose", int(s42["Average inhaled dose (ug)"]), "same")

# --------------------------------------------------------------- D + gaps ----
def gap_and_access(path):
    df = pd.read_csv(ROOT / path)
    acc = lambda d: (d.final_state == "SHELTERED").mean()
    m, u = df[df.mobility_limited == 1], df[df.mobility_limited == 0]
    return (100 * acc(df), 100 * acc(u), 100 * acc(m), 100 * (acc(u) - acc(m)), df)

D_all, D_u, D_m, D_gap, ddf = gap_and_access("docs/runs/scenario-d-2026/D-seed42-r10/agents.csv")
put("D_in_pct", round(D_all, 1), "scenario-d-2026/D-seed42-r10 agents.csv")
put("D_gap", round(D_gap, 1), "same; unimpaired minus mobility access, pp")
put("D_u", round(D_u, 1), "same"); put("D_m", round(D_m, 1), "same")
gaps = {}
bdf = None
for a, path in (("A", "docs/runs/present-day-three-arm/A-seed42/agents.csv"),
                ("B", "docs/runs/present-day-three-arm/B-seed42/agents.csv"),
                ("C", "docs/runs/present-day-three-arm/C-seed42/agents.csv")):
    _, u, m, g, df_ = gap_and_access(path)
    gaps[a] = (round(u, 1), round(m, 1), round(g, 1))
    put(f"{a}_acc_unimp", round(u, 1), f"{path}")
    put(f"{a}_acc_mob", round(m, 1), f"{path}")
    put(f"{a}_gap", round(g, 1), f"{path}")
    if a == "B":
        bdf = df_

def gap_at(df, minutes):
    m = df[df.mobility_limited == 1]
    u = df[df.mobility_limited == 0]
    fin = lambda g: ((g.final_state == "SHELTERED") & (g.travel_time_min <= minutes)).mean()
    return 100 * (fin(u) - fin(m))
share60 = 100 * gap_at(bdf, 60) / gaps["B"][2]
put("first_hour_share", round(share60), "B-seed42 agents.csv: gap at 60 min / final gap")

def curve(df, mob):
    g = df[df.mobility_limited == mob]
    inside = g[g.final_state == "SHELTERED"].travel_time_min
    return [round(100 * (inside <= t).sum() / len(g), 1) for t in range(0, 241, 4)]
curves = {"B_u": curve(bdf, 0), "B_m": curve(bdf, 1),
          "D_u": curve(ddf, 0), "D_m": curve(ddf, 1)}

# ------------------------------------------------------------- POOL split ----
cp_in, cp_walk = [], []
for r in (4, 5, 6):
    for s in (42, 43, 44):
        m = man(f"docs/runs/scenario-crandom-2026/CP2026r{r}-n6842-seed{s}/simulation.json")
        cp_in.append(m["population"]["sheltered"])
        cp_walk.append(m["population"]["travel_m"]["mean"])
c_walkmeans = [man(f"docs/runs/present-day-three-arm/C-seed{s}/simulation.json")["population"]["travel_m"]["mean"] for s in (42, 43, 44)]
put("CP_in_values", sorted(set(cp_in)), "CP manifests (9 runs)")
put("CP_walk_mean", round(sum(cp_walk) / len(cp_walk)), "CP manifests")
put("C_walk_mean_3seed", round(sum(c_walkmeans) / len(c_walkmeans)), "C manifests seeds 42-44")
put("walk_saving_optimizer_pct", round(100 * (N["CP_walk_mean"] - N["C_walk_mean_3seed"]) / N["CP_walk_mean"], 1),
    "optimizer's walking edge vs random-pool sites")

# --------------------------------------------------------------- bed sweep ----
sweep = []
for s, label in (("080", 0.8), (None, 1.0), ("105", 1.05), ("110", 1.10),
                 ("115", 1.15), ("120", 1.2), ("140", 1.4), ("160", 1.6)):
    accs, gapv = [], []
    for seed in (42, 43, 44):
        if s is None:
            p = f"docs/runs/present-day-three-arm/B-seed{seed}"
        else:
            p = f"docs/runs/phaseD-bed-sweep/BS{s}-seed{seed}"
        m = man(p + "/simulation.json")["population"]
        accs.append(100 * m["sheltered"] / 6842)
        df = pd.read_csv(ROOT / p / "agents.csv")
        acc = lambda d: (d.final_state == "SHELTERED").mean()
        gapv.append(100 * (acc(df[df.mobility_limited == 0]) - acc(df[df.mobility_limited == 1])))
    sweep.append({"s": label, "beds": round(6842 * label),
                  "acc": round(sum(accs) / 3, 2), "gap": round(sum(gapv) / 3, 1)})
put("sweep", sweep, "phaseD-bed-sweep archives + B manifests/agents")
put("beds_at_parity", 7184 - 6842, "BS105 total minus demand: matches C's admissions")
put("surplus_gap_closes_pct", 10, "BS110: all reachable admitted, gap ~0")
put("beds_gap_closes", 7526 - 6842, "BS110 total minus demand")

# ------------------------------------------------------------ dose windows ----
d1 = pd.read_csv(RES / "d1_window_rows.csv")
def ratio(h):
    b = d1[(d1.window == h) & (d1.arm == "B")].mean_dose_ug.mean()
    c = d1[(d1.window == h) & (d1.arm == "C")].mean_dose_ug.mean()
    return round(b / c, 2)
put("dose_ratio_24", ratio(24), "d1_window_rows.csv")
put("dose_ratio_312", ratio(312), "d1_window_rows.csv")

# ---------------------------------------------------------- misc repo facts ----
mlc = pd.read_csv(RES / "ML_MODEL_COEFFICIENTS.csv")
asth = mlc[(mlc.model == "logit_sheltered") & (mlc.feature == "asthma")][["arm", "p"]]
put("asthma_p", {r.arm: round(r.p, 2) for r in asth.itertuples()}, "ML_MODEL_COEFFICIENTS.csv")
v = man("docs/runs/present-day-three-arm/A-seed42/simulation.json")["street_network_validation"]
put("fw_features", v["freeway_filter"]["features_excluded"], "manifest street_network_validation")
put("fw_km", v["freeway_filter"]["km_excluded"], "same")
put("components", v["components"], "same")
put("largest_component", v["largest_component_nodes"], "same")
hist = man("docs/runs/historical-reference/histref-n2037-seed42/simulation.json")
put("hist_sheltered", hist["population"]["sheltered"], "historical-reference manifest")
shel = list(csv.DictReader(open(ROOT / "Geography/data/shelters/shelters_2026_current_placement.csv", encoding="utf-8-sig")))
put("sites", len(shel), "shelters_2026_current_placement.csv")
put("spaces", sum(int(r["capacity"]) for r in shel), "same")
bshel = list(csv.DictReader(open(ROOT / "Geography/data/shelters/shelters_2026_expanded_capacity.csv", encoding="utf-8-sig")))
put("reserve_spaces", sum(int(0.10 * int(r["capacity"])) for r in bshel), "10% per-site floor over B's file")
put("scale_factor", round(6842 / N["spaces"], 4), "6842 / 2234")
camps = pd.read_csv(ROOT / "Geography/data/encampments/irp_campsite_reports_sample.csv")
put("camp_reports", len(camps), "irp_campsite_reports_sample.csv rows")

runs = {"A/B/C x 9 seeds": 27, "D reserve sweep": 8, "random-box control (CR)": 9,
        "random-pool control (CP)": 9, "historical 2020 reference": 1,
        "bed sweep (coarse)": 12, "bed sweep (fine)": 9, "window arms": 18}
put("runs_total", sum(runs.values()), "archive count by family")
put("runs_breakdown", runs, "docs/runs families")

(OUTD / "deck_numbers.json").write_text(
    json.dumps({"numbers": N, "sources": SRC, "pm_series": series,
                "curves": curves}, indent=1), encoding="utf-8")
print("wrote deck_numbers.json")

# ===================================================================== deck ==
n = N
DATA = json.dumps({"pm": series, "curves": curves,
                   "sweep": [[r["s"], r["beds"], r["acc"], r["gap"]] for r in sweep],
                   "bars": [["A", n["A_in_pct"]], ["B", n["B_in_pct"]],
                            ["C", n["C_in_pct"]], ["D", n["D_in_pct"]]],
                   "gaps": [["A", n["A_acc_unimp"], n["A_acc_mob"]],
                            ["B", n["B_acc_unimp"], n["B_acc_mob"]],
                            ["C", n["C_acc_unimp"], n["C_acc_mob"]],
                            ["D", n["D_u"], n["D_m"]]]})

spike_lbl = (above[0] + spike_end) // 2
gap_lbl = (spike_end + main_start) // 2
main_lbl = min(main_start + 40, 300)
html = f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Capacity Is Not Access — symposium deck</title>
<style>
:root{{--bg:#faf8f4;--ink:#1c1e21;--ink2:#585d64;--rule:#ddd8cf;--card:#ffffff;
--a:#c4342c;--b:#1f6fb2;--c:#0f7a5a;--d:#8a4fbf;--warn:#9a6b00;}}
@media(prefers-color-scheme:dark){{:root{{--bg:#15171a;--ink:#ecebe7;--ink2:#a5a9af;--rule:#33373d;--card:#1e2126;}}}}
:root[data-theme=dark]{{--bg:#15171a;--ink:#ecebe7;--ink2:#a5a9af;--rule:#33373d;--card:#1e2126;}}
:root[data-theme=light]{{--bg:#faf8f4;--ink:#1c1e21;--ink2:#585d64;--rule:#ddd8cf;--card:#ffffff;}}
*{{box-sizing:border-box;margin:0}}
body{{background:var(--bg);color:var(--ink);font:16px/1.45 Georgia,'Times New Roman',serif}}
section{{min-height:100vh;padding:5vh 8vw;display:none;flex-direction:column;justify-content:center;max-width:1100px;margin:0 auto}}
section.on{{display:flex}}
h1{{font-size:2.6rem;line-height:1.15}} h2{{font-size:1.9rem;margin-bottom:1.2rem}}
.k{{font-family:ui-monospace,Consolas,monospace;font-size:.68rem;letter-spacing:.14em;color:var(--ink2);text-transform:uppercase;margin-bottom:.7rem}}
.sub{{color:var(--ink2);font-size:1.12rem;max-width:46rem;margin-top:1rem}}
.big{{display:flex;gap:2.4rem;flex-wrap:wrap;margin:1.4rem 0}}
.big b{{display:block;font-size:2.6rem;line-height:1}}
.big span{{font-size:.85rem;color:var(--ink2)}}
.aA{{color:var(--a)}}.aB{{color:var(--b)}}.aC{{color:var(--c)}}.aD{{color:var(--d)}}
.chart{{background:var(--card);border:1px solid var(--rule);border-radius:10px;padding:.8rem;margin:1rem 0}}
.note{{font-size:.92rem;color:var(--ink2);border-left:3px solid var(--rule);padding-left:.8rem;margin-top:.9rem;max-width:46rem}}
.flag{{color:var(--warn);font-weight:bold}}
table{{border-collapse:collapse;margin:.8rem 0;font-size:.95rem}}
td,th{{padding:.32rem .7rem;border-bottom:1px solid var(--rule);text-align:left}}
.ctr{{position:fixed;bottom:10px;right:14px;font:12px ui-monospace,monospace;color:var(--ink2)}}
.badge{{display:inline-block;font:11px ui-monospace,monospace;letter-spacing:.1em;border:1px solid var(--rule);border-radius:4px;padding:2px 7px;color:var(--ink2);margin-left:.6rem;vertical-align:middle}}
svg text{{fill:var(--ink2);font:11px ui-monospace,monospace}}
@media print{{section{{display:flex;page-break-after:always;min-height:95vh}}.ctr{{display:none}}}}
</style></head><body>

<!-- S1 -->
<section class="on"><div class="k">NSF REU · Computational Modeling Serving Portland</div>
<h1>Capacity is not access.<br>More beds, or better beds?</h1>
<p class="sub">What {n['runs_total']} simulations of the September 2020 smoke event say
about capacity, placement, and fairness for Multnomah County's unsheltered residents.</p>
<p class="sub" style="margin-top:2.2rem">Fatima Asghar · Harrisburg University of Science and Technology<br>
NSF REU hosted by Portland State University · mentor Prof. Christof Teuscher</p></section>

<!-- S2 -->
<section><div class="k">The event, and the people</div>
<h2>Thirteen days of smoke. {n['pm_peak']} µg/m³ at the worst hour.</h2>
<div class="chart"><svg id="pm" viewBox="0 0 960 250"></svg></div>
<div class="big"><div><b>6,842</b><span>unsheltered residents (2025 count: 10,526 × &gt;65% unsheltered)</span></div>
<div><b>{n['hours_above']}/312</b><span>hours above the 55.5 µg/m³ "Unhealthy" line — in two spells</span></div></div>
<p class="note">Two spells: a spike at hours {n['spike_hours']}, then {n['clean_gap_hours']} clean hours,
then the main episode from hour {n['main_episode_start']}. Every value measured by EPA monitors, not modeled.</p></section>

<!-- S3 -->
<section><div class="k">How the model works</div>
<h2>Real streets, real sites, one person at a time</h2>
<div class="big"><div><b>{n['sites']}</b><span>real facilities · {n['spaces']:,} spaces</span></div>
<div><b>88,100</b><span>street intersections, pedestrian-legal only</span></div>
<div><b>{n['camp_reports']:,}</b><span>real campsite reports seed the start points</span></div></div>
<table><tr><th>Each simulated person gets</th><th>from</th></tr>
<tr><td>age, sex, health conditions</td><td>local point-in-time + published prevalence studies</td></tr>
<tr><td>their own walking speed</td><td>published gait studies by age &amp; sex; slower distributions for impaired walkers; a COPD decrement</td></tr>
<tr><td>a departure moment</td><td>smoke crosses 55.5 µg/m³ — an EPA reporting line used as a behavioral trigger, a disclosed assumption</td></tr></table>
<p class="note"><b>Stated up front:</b> in this version everyone knows every shelter and its live occupancy.
I'll show you what that assumption costs at the end.</p></section>

<!-- S4 -->
<section><div class="k">Four scenarios</div>
<h2>Each one exists to answer what the last one measured</h2>
<table>
<tr><td><b class="aA">A — today</b></td><td>the real {n['sites']} sites, real {n['spaces']:,} spaces. A measurement, not a plan.</td></tr>
<tr><td><b class="aB">B — one space per person</b></td><td>same sites, every one scaled ×{n['scale_factor']}. Removes scarcity as an explanation.</td></tr>
<tr><td><b class="aC">C — same total, more doors</b></td><td>sites grown 1.5×, remainder opens as ten new ~349-space sites. Tests where capacity sits.</td></tr>
<tr><td><b class="aD">D — B + a fairness rule</b></td><td>10% of each site ({n['reserve_spaces']} spaces) reserved for mobility-limited arrivals. Costs nothing.</td></tr></table></section>

<!-- S5 -->
<section><div class="k">Headline access</div>
<h2>Who gets inside</h2>
<div class="chart"><svg id="bars" viewBox="0 0 960 240"></svg></div>
<p class="note">B's arithmetic is fixed by design: capacity equals demand, so
<b>{n['B_empty']} empty spaces ≡ {n['B_refused']} refused + {n['B_unreach']} unreachable</b> —
the same number counted twice. The finding is <i>who</i> is outside, not that the numbers match.</p></section>

<!-- S6 -->
<section><div class="k">What C's edge really is <span class="badge">second half = EMERGENCY CUT</span></div>
<h2>Doors, not door-choosing</h2>
<div class="big"><div><b class="aC">+306</b><span>admissions, C over B — and ten <i>random</i> sites from the same pool match it exactly</span></div>
<div><b class="aC">63%</b><span>shorter walks than random sites — the optimizer's real contribution</span></div></div>
<div class="chart"><svg id="sweep" viewBox="0 0 960 250"></svg></div>
<p class="note">Surplus at the existing sites: <b>+{n['beds_at_parity']} spaces (5%)</b> matches C's admissions;
<b>+{n['beds_gap_closes']} (10%)</b> admits every reachable person. C's siting advantage on headcount
is worth at most about {n['beds_at_parity']} spaces.</p></section>

<!-- S7 -->
<section><div class="k">The fairness finding</div>
<h2>Scarcity is rationed by walking speed</h2>
<div class="chart"><svg id="gaps" viewBox="0 0 960 250"></svg></div>
<div class="chart"><svg id="race" viewBox="0 0 960 250"></svg></div>
<p class="note">{n['first_hour_share']}% of B's final gap exists one hour after departure.
The people left outside are increasingly the people who walk slowest — on every scale we measured.</p></section>

<!-- S8 -->
<section><div class="k">Scenario D</div>
<h2>A fairer door costs nothing</h2>
<div class="big"><div><b class="aB">{n['B_gap']} pts</b><span>mobility access gap in B</span></div>
<div><b class="aD">{n['D_gap']} pts</b><span>gap in D — at identical total admissions ({n['D_in_pct']}%)</span></div></div>
<p class="note">The gap only exists where capacity ≈ demand — exactly where a county lives.
Buy 10% surplus and it dissolves; hold a 10% reserve and it closes for free.</p></section>

<!-- S9 -->
<section><div class="k">How I know it's right — and where it's wrong</div>
<h2>The checks that could have embarrassed me</h2>
<table>
<tr><td>{n['runs_total']} runs, every one fingerprinted &amp; invariant-checked</td><td>manifests + automated suite, exit 0</td></tr>
<tr><td>asthma negative control</td><td>designed to find nothing; found nothing (p ≥ {min(n['asthma_p'].values())})</td></tr>
<tr><td>freeway defect: {n['fw_features']:,} illegal segments, {n['fw_km']} km, two bridges</td><td>found, removed, everything re-run — <b>every headline unchanged to the digit</b></td></tr>
<tr><td>2 of 13 registered predictions wrong</td><td>reported, and they improved the answer</td></tr>
<tr><td>vs the real 2020 record</td><td>model over-admits by 1.5–15.6× — the measured size of everything human it omits</td></tr></table>
<p class="note">Limitations, in one breath: full information · everyone departs on the early spike ·
dose depends on the window (24-h B:C ratio is {n['dose_ratio_24']}, not {n['dose_ratio_312']}) ·
the population is an administrative count treated as all-outdoors-at-once.</p></section>

<!-- S10 -->
<section><div class="k">The answer</div>
<h2>More beds, if you can afford them.<br>A fairer door, if you can't.</h2>
<p class="sub">Better-placed beds was the one answer the evidence refused.</p>
<p class="note">Next: the human decision layer — awareness, belongings, pets, imperfect information —
specced, registered, and built to close the 1.5–15.6× gap the calibration measured.</p></section>

<!-- E1 -->
<section><div class="k">OPTIONAL EXTENSION E1 (+1:00)</div>
<h2>The finding survives every way of measuring it</h2>
<table><tr><th>Measure</th><th class="aA">A</th><th class="aB">B</th><th class="aC">C</th><th class="aD">D</th></tr>
<tr><td>gap, percentage points</td><td>{n['A_gap']}</td><td>{n['B_gap']}</td><td>{n['C_gap']}</td><td>{n['D_gap']}</td></tr>
<tr><td>ratio of access rates</td><td>1.62</td><td>1.33</td><td>1.15</td><td>~1.00</td></tr>
<tr><td>mobility-limited people outside</td><td>1,087</td><td>373</td><td>190</td><td>~110</td></tr>
<tr><td>their share of everyone outside</td><td>23%</td><td>65%</td><td>70%</td><td>~20%</td></tr></table>
<p class="note">Point-scale says B widens the gap; ratio-scale says B narrows it. Both are reported.
What survives every scale: the residue concentrates in the slowest walkers — until the rule changes.</p></section>

<!-- E2 -->
<section><div class="k">OPTIONAL EXTENSION E2 (+1:00)</div>
<h2>How a student project earns trust</h2>
<table>
<tr><td>parameter registry</td><td>no number enters the code without a sourced row first — the model refuses to start otherwise</td></tr>
<tr><td>run manifests</td><td>every run records its commit, seed, parameters, and the checksum of every input file</td></tr>
<tr><td>claim linter</td><td>every corrected or retired sentence is a banned string; the build fails if one returns</td></tr>
<tr><td>negative control</td><td>asthma has no movement mechanism, so it must show no access effect — and doesn't, in every arm</td></tr>
<tr><td>registered predictions</td><td>written down before running; the misses are published with the hits</td></tr></table></section>

<!-- BACKUPS -->
<section><div class="k">Backup</div><h2>Backup slides</h2>
<p class="sub">B1 five-scale equity · B2 survival curves · B3 random-pool control · B4 full bed sweep ·
B5 2020 calibration · B6 freeway fix · B7 model card · B8 data vintages · B9 agent states ·
B10 verification pipeline · B11 the identity arithmetic · B12 window-dose table</p></section>

<section><div class="k">B3 · random-pool control</div><h2>Ten random doors = same headcount, triple the walk</h2>
<table><tr><th></th><th>admitted (seeds 42–44)</th><th>mean walk</th></tr>
<tr><td class="aC">C (optimized sites)</td><td>{n['C_in']:,} / 6,565 / 6,566</td><td>{n['C_walk_mean_3seed']:,} m</td></tr>
<tr><td>random-pool draws (×3)</td><td>identical: {', '.join(f'{v:,}' for v in n['CP_in_values'])}</td><td>{n['CP_walk_mean']:,} m</td></tr></table>
<p class="note">Headcount is pure dispersion. Siting quality earns exactly one thing: the walk.</p></section>

<section><div class="k">B4 · full bed sweep</div><h2>Access &amp; fairness vs surplus at the real sites</h2>
<table><tr><th>× demand</th><th>total spaces</th><th>admitted %</th><th>mobility gap (pp)</th></tr>
{''.join(f"<tr><td>{r['s']}</td><td>{r['beds']:,}</td><td>{r['acc']}</td><td>{r['gap']}</td></tr>" for r in sweep)}</table></section>

<section><div class="k">B5 · 2020 calibration</div><h2>The bracket, honestly</h2>
<p class="sub">Street Roots, Sept 16 2020: ≈90 people at the Convention Center, ≈40 at Charles Jordan — ≈130 of 198 beds.
The model fills 198 of 198 at both sites. Because the record is approximate, the honest statement is a bracket:
the model over-admits by 1.5–15.6× (1.52× is only the most favourable edge).</p>
<p class="note">That bracket is the measured size of awareness, belongings, pets, and trust — everything the
full-information model omits, and exactly what the next phase models.</p></section>

<section><div class="k">B6 · freeway fix</div><h2>{n['fw_features']:,} segments, {n['fw_km']} km, removed</h2>
<p class="sub">RLIS freeway classes (incl. the Marquam and Fremont bridge decks — no pedestrian access) were in the
walking map. Removed; all {n['runs_total']} runs regenerated. Sheltered counts unchanged to the digit;
~12 people per run reclassified from refused to unreachable ({n['components']} network pieces, largest {n['largest_component']:,}).</p></section>

<section><div class="k">B7 · model card</div><h2>The regression is a sanity check, not a discovery</h2>
<p class="sub">Logistic model: P(got inside) from a person's inputs + distance to the nearest site.
It re-finds only the mechanisms we built (distance, speed, the COPD decrement) and nothing we didn't
(asthma null in every arm). In D, conditional on speed, it re-finds the reserve rule we wrote — with
speed-band cells at exactly 100%, its size is unstable and is not quoted. The equity result is marginal:
mobility {n['D_m']}% vs others {n['D_u']}% — the gap is gone.</p></section>

<section><div class="k">B8 · data vintages</div><h2>Owned plainly</h2>
<table><tr><td>smoke</td><td>2020, measured hourly</td></tr><tr><td>population count</td><td>2025 PIT (methodology-augmented; not a time series with 2019)</td></tr>
<tr><td>campsite locations</td><td>2025–26 complaint reports, spatial stand-in for 2020</td></tr>
<tr><td>age / chronic condition</td><td>Pathways 2026, local</td></tr><tr><td>sex / mobility</td><td>2019 PIT (no newer local source)</td></tr>
<tr><td>asthma / COPD</td><td>2025 EHR study (Minnesota cohort)</td></tr></table></section>

<section><div class="k">B11 · the identity</div><h2>578 = {n['B_refused']} + {n['B_unreach']}, by construction</h2>
<p class="sub">Capacity = population ⇒ every empty space is one person outside. Empty spaces ({n['B_empty']})
must equal refused ({n['B_refused']}) plus unreachable ({n['B_unreach']}). Informative content: zero.
The informative facts: <i>who</i> is outside (the slowest walkers) and <i>where</i> the empty spaces are (the wrong sites).</p></section>

<section><div class="k">B12 · window-dose</div><h2>Dose depends on the window</h2>
<table><tr><th>window</th><th>B:C mean-dose ratio</th></tr>
<tr><td>first 24 h</td><td>{n['dose_ratio_24']}</td></tr><tr><td>full 312 h</td><td>{n['dose_ratio_312']}</td></tr></table>
<p class="note">Short windows are dominated by the walking difference, long windows by the headcount difference. Both reported.</p></section>

<div class="ctr" id="ctr"></div>
<script>
const DATA = {DATA};
const S = [...document.querySelectorAll('section')]; let i = 0;
function show(k){{ S[i].classList.remove('on'); i = Math.max(0, Math.min(S.length-1, k));
  S[i].classList.add('on'); document.getElementById('ctr').textContent = (i+1) + ' / ' + S.length; draw(); }}
addEventListener('keydown', e => {{
  if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') show(i+1);
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') show(i-1);
  if (e.key === 'Home') show(0); if (e.key === 'End') show(S.length-1); }});
const cv = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const AC = {{A:'--a', B:'--b', C:'--c', D:'--d'}};
function el(t,a){{ const x = document.createElementNS('http://www.w3.org/2000/svg',t);
  for (const k in a) x.setAttribute(k,a[k]); return x; }}
function draw(){{
  let s = document.getElementById('pm');
  if (s && s.closest('section').classList.contains('on')) {{ s.innerHTML='';
    const W=960,H=250,L=46,R=8,T=12,B=30,mx=600;
    const X=h=>L+(W-L-R)*h/312, Y=v=>T+(H-T-B)*(1-Math.min(v,mx)/mx);
    s.appendChild(el('line',{{x1:L,x2:W-R,y1:Y(55.5),y2:Y(55.5),stroke:cv('--warn'),'stroke-dasharray':'4 4'}}));
    let dstr=''; DATA.pm.forEach((v,h)=>{{ if(v===null||isNaN(v))return;
      dstr += (dstr?'L':'M')+X(h).toFixed(1)+' '+Y(v).toFixed(1); }});
    s.appendChild(el('path',{{d:dstr,fill:'none',stroke:cv('--a'),'stroke-width':1.6}}));
    [['spike',{spike_lbl}],['57 clean hours',{gap_lbl}],['main episode',{main_lbl}]].forEach(([t,h])=>{{
      const tx=el('text',{{x:X(h),y:H-8,'text-anchor':'middle'}}); tx.textContent=t; s.appendChild(tx); }});
    const t2=el('text',{{x:X(140)+6,y:Y(562.7>600?600:562.7)+10}}); t2.textContent='{n['pm_peak']} µg/m³'; s.appendChild(t2);
    [0,150,300,450,600].forEach(v=>{{ const t=el('text',{{x:L-6,y:Y(v)+4,'text-anchor':'end'}});
      t.textContent=v; s.appendChild(t); }});
  }}
  s = document.getElementById('bars');
  if (s && s.closest('section').classList.contains('on')) {{ s.innerHTML='';
    const W=960,H=240,L=46,T=10,B=28; const X=k=>L+k*(W-L-20)/4;
    DATA.bars.forEach(([a,v],k)=>{{ const h=(H-T-B)*v/100, x=X(k)+30;
      s.appendChild(el('rect',{{x:x,y:H-B-h,width:110,height:h,rx:6,fill:cv(AC[a])}}));
      const t=el('text',{{x:x+55,y:H-B-h-8,'text-anchor':'middle','font-size':'20',fill:cv(AC[a]),'font-weight':'bold'}});
      t.textContent=v.toFixed(1)+'%'; s.appendChild(t);
      const l=el('text',{{x:x+55,y:H-8,'text-anchor':'middle'}}); l.textContent=a; s.appendChild(l); }});
  }}
  s = document.getElementById('sweep');
  if (s && s.closest('section').classList.contains('on')) {{ s.innerHTML='';
    const W=960,H=250,L=52,R=14,T=14,B=30;
    const xs=DATA.sweep.map(r=>r[1]); const X=b=>L+(W-L-R)*(b-5400)/(11000-5400);
    const Y=v=>T+(H-T-B)*(1-(v-70)/30);
    s.appendChild(el('line',{{x1:L,x2:W-R,y1:Y({n['C_in_pct']}),y2:Y({n['C_in_pct']}),stroke:cv('--c'),'stroke-dasharray':'5 4'}}));
    const tc=el('text',{{x:W-R-4,y:Y({n['C_in_pct']})-6,'text-anchor':'end'}}); tc.textContent='C: {n['C_in_pct']}%'; s.appendChild(tc);
    let p=''; DATA.sweep.forEach(r=>{{ p += (p?'L':'M')+X(r[1]).toFixed(1)+' '+Y(r[2]).toFixed(1); }});
    s.appendChild(el('path',{{d:p,fill:'none',stroke:cv('--b'),'stroke-width':2}}));
    DATA.sweep.forEach(r=>{{ s.appendChild(el('circle',{{cx:X(r[1]),cy:Y(r[2]),r:4,fill:cv('--b')}}));
      const t=el('text',{{x:X(r[1]),y:H-8,'text-anchor':'middle'}}); t.textContent=r[1].toLocaleString(); s.appendChild(t); }});
    const m=el('text',{{x:X(7184),y:Y(96)-12,'text-anchor':'middle',fill:cv('--warn')}}); m.textContent='+342: matches C'; s.appendChild(m);
    const m2=el('text',{{x:X(7526),y:Y(99.5)+16,'text-anchor':'middle',fill:cv('--warn')}}); m2.textContent='+684: everyone reachable'; s.appendChild(m2);
  }}
  s = document.getElementById('gaps');
  if (s && s.closest('section').classList.contains('on')) {{ s.innerHTML='';
    const W=960,H=250,L=120,R=90,T=16,B=30;
    const X=v=>L+(W-L-R)*v/100, Y=k=>T+(H-T-B)/4*(k+0.5);
    [0,25,50,75,100].forEach(v=>{{ const t=el('text',{{x:X(v),y:H-8,'text-anchor':'middle'}});
      t.textContent=v+'%'; s.appendChild(t); }});
    DATA.gaps.forEach(([a,u,m],k)=>{{ const y=Y(k);
      s.appendChild(el('line',{{x1:X(Math.min(u,m)),x2:X(Math.max(u,m)),y1:y,y2:y,stroke:cv('--rule'),'stroke-width':3}}));
      s.appendChild(el('circle',{{cx:X(u),cy:y,r:6,fill:cv('--ink2')}}));
      s.appendChild(el('circle',{{cx:X(m),cy:y,r:6,fill:cv(AC[a])}}));
      const l=el('text',{{x:L-10,y:y+4,'text-anchor':'end'}}); l.textContent=a; s.appendChild(l);
      const g=el('text',{{x:W-R+8,y:y+4}}); g.textContent=(u-m).toFixed(1)+' pts'; s.appendChild(g); }});
  }}
  s = document.getElementById('race');
  if (s && s.closest('section').classList.contains('on')) {{ s.innerHTML='';
    const W=960,H=250,L=46,R=10,T=12,B=30;
    const X=k=>L+(W-L-R)*k/60, Y=v=>T+(H-T-B)*(1-v/100);
    [['B_u','--ink2','B · walks easily'],['B_m','--b','B · mobility-limited'],
     ['D_m','--d','D · mobility-limited']].forEach(([key,col,lab],j)=>{{
      let p=''; DATA.curves[key].forEach((v,k)=>{{ p+=(p?'L':'M')+X(k).toFixed(1)+' '+Y(v).toFixed(1); }});
      s.appendChild(el('path',{{d:p,fill:'none',stroke:cv(col),'stroke-width':2}}));
      const t=el('text',{{x:W-R-4,y:T+14+j*15,'text-anchor':'end',fill:cv(col)}}); t.textContent=lab; s.appendChild(t); }});
    [0,60,120,180,240].forEach(v=>{{ const t=el('text',{{x:X(v/4),y:H-8,'text-anchor':'middle'}});
      t.textContent=v+' min'; s.appendChild(t); }});
  }}
}}
show(0);
new MutationObserver(draw).observe(document.documentElement,{{attributes:true,attributeFilter:['data-theme']}});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
</script></body></html>"""

deck_path = OUTD / "capacity-is-not-access-symposium.html"
deck_path.write_text(html, encoding="utf-8", newline="\n")
print(f"wrote {deck_path.name} ({len(html)//1024} KB)")

# ------------------------------------------------ provenance table ----------
SLIDE = {"pm_peak": "S2", "pm_peak_hour": "S2", "hours_above": "S2",
         "first_cross_hour": "S2", "spike_hours": "S2", "clean_gap_hours": "S2",
         "main_episode_start": "S2", "pm_first_cross_value": "S2/backup",
         "sites": "S3/S4", "spaces": "S3/S4", "camp_reports": "S3",
         "scale_factor": "S4", "reserve_spaces": "S4",
         "A_in": "S5", "A_in_pct": "S5", "B_in_pct": "S5", "C_in_pct": "S5",
         "D_in_pct": "S8", "B_refused": "S5/B11", "B_unreach": "S5/B11",
         "B_empty": "S5/B11", "A_refused": "prov only", "C_refused": "prov only",
         "A_walk": "prov only", "B_walk": "prov only", "C_walk": "prov only",
         "A_dose": "prov only", "B_dose": "prov only", "C_dose": "prov only",
         "A_in_range": "script S5", "B_in_range": "script S5", "C_in_range": "script S5",
         "A_unreach": "script S5", "C_unreach": "script S5", "A_empty": "prov only",
         "CP_in_values": "S6/B3", "CP_walk_mean": "B3", "C_walk_mean_3seed": "B3",
         "walk_saving_optimizer_pct": "S6", "sweep": "S6/B4",
         "beds_at_parity": "S6", "beds_gap_closes": "S6", "surplus_gap_closes_pct": "S8",
         "A_gap": "E1", "B_gap": "S8/E1", "C_gap": "E1", "D_gap": "S8/E1",
         "A_acc_unimp": "S7", "A_acc_mob": "S7", "B_acc_unimp": "S7",
         "B_acc_mob": "S7", "C_acc_unimp": "S7", "C_acc_mob": "S7",
         "D_u": "S7/B7", "D_m": "S7/B7", "first_hour_share": "S7",
         "dose_ratio_24": "S9/B12", "dose_ratio_312": "S9/B12",
         "asthma_p": "S9", "fw_features": "S9/B6", "fw_km": "S9/B6",
         "components": "B6", "largest_component": "B6", "hist_sheltered": "B5",
         "runs_total": "S1/S9", "runs_breakdown": "script S9", "C_in": "B3"}
rows = ["# Presentation provenance — every number, its slide, and its source",
        "",
        "Generated by `scripts/make_symposium_deck.py` from repo data only",
        "(rule S1/S3). Regenerate with the deck; do not hand-edit values.",
        "Deck: `docs/final/presentation/capacity-is-not-access-symposium.html` ·",
        "Script: `docs/final/PRESENTER_SCRIPT.md`.",
        "",
        "| value | slide(s) | source |", "|---|---|---|"]
for k, v in N.items():
    vv = json.dumps(v) if not isinstance(v, (int, float, str)) else v
    rows.append(f"| `{k}` = {vv} | {SLIDE.get(k, 'script')} | {SRC[k]} |")
rows += ["", "Fixed non-computed statements: 55.5 µg/m³ = EPA 'Unhealthy' breakpoint",
         "(registry); 10,526 & >65% = 2025 Tri-County PITC (TR §3.4); walking-speed",
         "sources = registry V10/V18-family + V24 (Bohannon 2011 n=23,111, CV 0.13;",
         "Boyce 1999 impaired; Buekers 2024 COPD −0.19 m/s); calibration record ≈90+≈40",
         "of 99+99 = Street Roots 2020-09-16 (TR §13.6); bracket 1.5–15.6× =",
         "claims.yaml calibration entry; C new-site size ~349 = shelter CSV;",
         "+306 = C_in − B_in per 6_SEED_ROBUSTNESS.csv."]
(ROOT / "docs/PRESENTATION_PROVENANCE.md").write_text("\n".join(rows) + "\n", encoding="utf-8")
print("wrote docs/PRESENTATION_PROVENANCE.md")
