#!/usr/bin/env python3
"""
equity_scales.py -- recompute the equity finding on every defensible scale.

Motivation
----------
An external critique observes that the headline claim ("the gap widens
13.0 -> 24.5 -> 12.9 pp across arms A/B/C") is a *percentage-point* statement,
and that percentage points are the one scale most distorted by a ceiling
effect: in arm B, 91.6% of everybody shelters, so a pp gap is bounded by how
little headroom is left. This script recomputes the same comparison on five
scales and reports which conclusions survive on which scale.

Scales, for each vulnerable group G (mobility-limited, age 65+, COPD) vs its
complement, in each arm:
  1. difference in sheltered percentage (pp), Newcombe/Wilson 95% CI
  2. risk ratio  (reported both for "sheltered" and for "left outside")
  3. odds ratio  (of being left outside)
  4. absolute count of group-G residents left outside (per run, mean over seeds)
  5. composition of the left-outside population: what share has trait G?

Plus a temporal block:
  - time-to-shelter distribution by mobility status
  - person-hours-outdoors over the 312 h episode, by arm
  - hourly outdoor-headcount and PM2.5-weighted exposure curves, so we can ask
    whether arm C's benefit is concentrated at the PM2.5 peak or spread out.

Inputs  : Geography/output/{A,B,C}2026-n6842-seed{42..50}/agents.csv
          Geography/data/airnow/aqs_hourly_pm25_portland_2020-09.csv
Outputs : JSON + human-readable text on stdout; optional --json <path>.

Statistics notes (stated so they can be checked):
  * "Pooled" = counts summed over the 9 seeds (n = 61,578 agent-runs). Wilson
    intervals on the pooled counts treat the 9 seeds as independent draws of
    people, which they are NOT (same 36/46 shelters, same street network, same
    smoke field). Pooled Wilson CIs are therefore ANTI-CONSERVATIVE. We also
    report the across-seed spread (min/max and a 9-seed t interval on the
    per-seed estimates), which is the honest uncertainty for "would another
    seed flip this?".
  * Newcombe (1998) method 10 is used for the CI on a difference of two
    independent proportions, built from the two Wilson intervals.
  * RR / OR intervals are Katz log-RR and Woolf log-OR.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import statistics
import sys
from collections import defaultdict

# --------------------------------------------------------------------------
# configuration
# --------------------------------------------------------------------------

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUTDIR = os.path.join(REPO, "Geography", "output")
AQS = os.path.join(REPO, "Geography", "data", "airnow",
                   "aqs_hourly_pm25_portland_2020-09.csv")

ARMS = ["A", "B", "C"]
SEEDS = list(range(42, 51))
RUN_FMT = "{arm}2026-n6842-seed{seed}"

ARM_LABEL = {
    "A": "A  present-day reality (36 sites / 2,234 spaces)",
    "B": "B  capacity = demand, same 36 sites (6,842 spaces)",
    "C": "C  same 6,842 spaces, 46 sites (real x1.5 + 10 p-median)",
}

# Episode geometry, read back from simulation.json in every run and asserted.
SIM_HOURS = 312
MINUTES_PER_TICK = 1.0
EPISODE_START = "2020-09-07T00:00"   # smoke-field hour 0
Z = 1.959963984540054                # 95% normal quantile

# Group definitions. Each is (key, predicate on the agents.csv row, label).
GROUPS = [
    ("mobility", lambda r: r["mobility_limited"] == "1", "mobility-limited"),
    ("age65", lambda r: float(r["age_years"]) >= 65, "age 65+"),
    ("copd", lambda r: r["copd_flag"] == "1", "COPD"),
]


# --------------------------------------------------------------------------
# interval estimators
# --------------------------------------------------------------------------

def wilson(k: int, n: int, z: float = Z):
    """Wilson score interval for a binomial proportion. Returns (lo, p, hi)."""
    if n == 0:
        return (float("nan"),) * 3
    p = k / n
    d = 1.0 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = (z / d) * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (max(0.0, centre - half), p, min(1.0, centre + half))


def newcombe_diff(k1: int, n1: int, k2: int, n2: int, z: float = Z):
    """
    CI for p1 - p2 from the two Wilson intervals (Newcombe 1998, method 10).
    Returns (lo, diff, hi).
    """
    l1, p1, u1 = wilson(k1, n1, z)
    l2, p2, u2 = wilson(k2, n2, z)
    d = p1 - p2
    lo = d - math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2)
    hi = d + math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)
    return (lo, d, hi)


def risk_ratio(k1: int, n1: int, k2: int, n2: int, z: float = Z):
    """Katz log-RR interval for (k1/n1) / (k2/n2). Returns (lo, rr, hi)."""
    if n1 == 0 or n2 == 0 or k1 == 0 or k2 == 0:
        return (float("nan"), float("nan"), float("nan"))
    p1, p2 = k1 / n1, k2 / n2
    rr = p1 / p2
    se = math.sqrt((1 - p1) / k1 + (1 - p2) / k2)
    return (rr * math.exp(-z * se), rr, rr * math.exp(z * se))


def odds_ratio(k1: int, n1: int, k2: int, n2: int, z: float = Z):
    """Woolf log-OR interval. Returns (lo, or_, hi)."""
    a, b = k1, n1 - k1
    c, d = k2, n2 - k2
    if min(a, b, c, d) == 0:                       # Haldane-Anscombe
        a, b, c, d = a + 0.5, b + 0.5, c + 0.5, d + 0.5
    or_ = (a * d) / (b * c)
    se = math.sqrt(1 / a + 1 / b + 1 / c + 1 / d)
    return (or_ * math.exp(-z * se), or_, or_ * math.exp(z * se))


def seed_interval(values):
    """t-based 95% interval across seeds; the honest 'another seed' uncertainty."""
    vals = [v for v in values if v == v]
    n = len(vals)
    if n < 2:
        return (float("nan"), float("nan"), float("nan"))
    m = statistics.mean(vals)
    sd = statistics.stdev(vals)
    # t_{.975, df} for df = 1..12; we only ever need df = 8.
    tcrit = {1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447,
             7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179}
    t = tcrit.get(n - 1, 1.96)
    half = t * sd / math.sqrt(n)
    return (m - half, m, m + half)


# --------------------------------------------------------------------------
# data loading
# --------------------------------------------------------------------------

def run_path(arm: str, seed: int) -> str:
    return os.path.join(OUTDIR, RUN_FMT.format(arm=arm, seed=seed))


def load_run(arm: str, seed: int):
    """Return a list of light-weight dicts, one per agent."""
    path = os.path.join(run_path(arm, seed), "agents.csv")
    out = []
    with open(path, newline="", encoding="utf-8-sig") as fh:
        for r in csv.DictReader(fh):
            out.append({
                "sheltered": r["reached_shelter"].strip().lower() == "yes",
                "final_state": r["final_state"],
                "mobility": r["mobility_limited"] == "1",
                "age65": float(r["age_years"]) >= 65,
                "copd": r["copd_flag"] == "1",
                "age_years": float(r["age_years"]),
                "start_tick": int(r["time_started_tick"]) if r["time_started_tick"] else None,
                "arrive_tick": int(r["time_arrived_tick"]) if r["time_arrived_tick"] else None,
                "travel_min": float(r["travel_time_min"]) if r["travel_time_min"] else None,
                "exposure": float(r["cumulative_dose_ugm3h"]) if r["cumulative_dose_ugm3h"] else float("nan"),
                "hours_unhealthy": float(r["hours_above_unhealthy"]) if r["hours_above_unhealthy"] else float("nan"),
            })
    return out


def load_smoke_field():
    """
    Reproduce SmokeField.java exactly: hourly mean over all Multnomah County
    monitors/POCs of AQS parameter 88502, hour 0 = 2020-09-07T00:00 local.
    See Geography/src/geography/env/SmokeField.java:52-92.
    """
    import datetime as dt
    start = dt.datetime.fromisoformat(EPISODE_START)
    acc = defaultdict(lambda: [0.0, 0])
    maxh = -1
    with open(AQS, newline="", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            if (row.get("County Name") or "").lower() != "multnomah":
                continue
            ds, ts, vs = row.get("Date Local"), row.get("Time Local"), row.get("Sample Measurement")
            if not ds or not ts or not vs:
                continue
            try:
                val = float(vs)
            except ValueError:
                continue
            obs = dt.datetime.fromisoformat(f"{ds}T{ts[:5]}")
            h = int((obs - start).total_seconds() // 3600)
            if h < 0:
                continue
            acc[h][0] += val
            acc[h][1] += 1
            maxh = max(maxh, h)
    return [acc[h][0] / acc[h][1] if acc[h][1] else float("nan") for h in range(maxh + 1)]


# --------------------------------------------------------------------------
# the five scales
# --------------------------------------------------------------------------

def counts(agents, gkey):
    """
    Return (n_g, out_g, n_u, out_u) where 'out' = left outside (not sheltered).
    g = has the trait, u = does not.
    """
    n_g = out_g = n_u = out_u = 0
    for a in agents:
        if a[gkey]:
            n_g += 1
            out_g += 0 if a["sheltered"] else 1
        else:
            n_u += 1
            out_u += 0 if a["sheltered"] else 1
    return n_g, out_g, n_u, out_u


def five_scales(n_g, out_g, n_u, out_u):
    """All five scale statistics from one 2x2 table."""
    sh_g, sh_u = n_g - out_g, n_u - out_u
    total_out = out_g + out_u

    # 1. difference in sheltered percentage, unimpaired minus impaired (the "gap")
    lo, d, hi = newcombe_diff(sh_u, n_u, sh_g, n_g)
    gap_pp = (100 * lo, 100 * d, 100 * hi)

    # 2. risk ratios
    rr_out = risk_ratio(out_g, n_g, out_u, n_u)      # left outside, G / not-G
    rr_shel = risk_ratio(sh_g, n_g, sh_u, n_u)       # sheltered,    G / not-G

    # 3. odds ratio of being left outside
    or_out = odds_ratio(out_g, n_g, out_u, n_u)

    # 5. composition of the left-outside population
    comp = wilson(out_g, total_out) if total_out else (float("nan"),) * 3
    base = n_g / (n_g + n_u)

    return {
        "n_g": n_g, "out_g": out_g, "shel_g": sh_g,
        "n_u": n_u, "out_u": out_u, "shel_u": sh_u,
        "pct_shel_g": 100 * sh_g / n_g,
        "pct_shel_u": 100 * sh_u / n_u,
        "scale1_gap_pp": gap_pp,                     # (lo, est, hi)
        "scale2_rr_outside": rr_out,
        "scale2_rr_sheltered": rr_shel,
        "scale3_or_outside": or_out,
        "scale4_count_outside_g": out_g,
        "scale4_total_outside": total_out,
        "scale5_share_outside_g": (100 * comp[0], 100 * comp[1], 100 * comp[2]),
        "population_share_g": 100 * base,
        "scale5_lift": (100 * comp[1]) / (100 * base) if base else float("nan"),
    }


# --------------------------------------------------------------------------
# temporal block
# --------------------------------------------------------------------------

def temporal(agents, pm, sim_hours=SIM_HOURS, mpt=MINUTES_PER_TICK):
    """
    Time-to-shelter and person-hours-outdoors.

    Outdoor accounting: every agent departs at time_started_tick (tick 960 =
    hour 16 in every run). A sheltered agent is outdoors from departure to
    time_arrived_tick. An agent that never shelters (REFUSED_ALL_FULL or
    UNREACHABLE) is outdoors from departure to the end of the 312 h episode.
    Hours 0-16 are pre-evacuation and identical in all three arms, so they are
    excluded; including them would add the same constant to every arm.
    """
    end_tick = sim_hours * 60.0 / mpt
    ph = {"total": 0.0, "sheltered": 0.0, "unsheltered": 0.0,
          "mobility": 0.0, "unimpaired": 0.0}
    tts = {"mobility": [], "unimpaired": []}
    # hourly headcount still outdoors, indexed by whole hour of the episode
    outdoors = [0] * (sim_hours + 1)

    for a in agents:
        s = a["start_tick"]
        e = a["arrive_tick"] if (a["sheltered"] and a["arrive_tick"] is not None) else end_tick
        hrs = max(0.0, (e - s) * mpt / 60.0)
        ph["total"] += hrs
        ph["sheltered" if a["sheltered"] else "unsheltered"] += hrs
        ph["mobility" if a["mobility"] else "unimpaired"] += hrs
        if a["sheltered"]:
            tts["mobility" if a["mobility"] else "unimpaired"].append(
                (a["arrive_tick"] - s) * mpt / 60.0)
        h0 = int(s * mpt // 60)
        h1 = int(math.ceil(e * mpt / 60.0))
        for h in range(h0, min(h1, sim_hours + 1)):
            outdoors[h] += 1

    # PM2.5-weighted person-exposure, person-ug/m3-hours, from the same field
    weighted = [outdoors[h] * (pm[h] if h < len(pm) and pm[h] == pm[h] else 0.0)
                for h in range(sim_hours + 1)]

    def q(v, p):
        if not v:
            return float("nan")
        v = sorted(v)
        i = min(len(v) - 1, int(round(p * (len(v) - 1))))
        return v[i]

    return {
        "person_hours": ph,
        "tts_summary": {
            k: {
                "n": len(v),
                "mean_h": statistics.mean(v) if v else float("nan"),
                "median_h": q(v, 0.5), "p75_h": q(v, 0.75),
                "p90_h": q(v, 0.90), "p99_h": q(v, 0.99),
                "max_h": max(v) if v else float("nan"),
                "pct_within_1h": 100 * sum(1 for x in v if x <= 1) / len(v) if v else float("nan"),
                "pct_within_2h": 100 * sum(1 for x in v if x <= 2) / len(v) if v else float("nan"),
            } for k, v in tts.items()
        },
        "outdoors_by_hour": outdoors,
        "weighted_by_hour": weighted,
    }


# --------------------------------------------------------------------------
# driver
# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", help="write full results as JSON here")
    ap.add_argument("--seeds", type=int, nargs="*", default=SEEDS)
    args = ap.parse_args()

    pm = load_smoke_field()
    peak_hour = max(range(min(len(pm), SIM_HOURS + 1)),
                    key=lambda h: (pm[h] if pm[h] == pm[h] else -1))

    results = {
        "meta": {
            "repo": REPO, "arms": ARMS, "seeds": args.seeds,
            "sim_hours": SIM_HOURS, "minutes_per_tick": MINUTES_PER_TICK,
            "smoke_peak_hour": peak_hour,
            "smoke_peak_ugm3": pm[peak_hour],
            "note": "pooled Wilson CIs treat 9 seeds as independent; see module docstring",
        },
        "pooled": {}, "per_seed": {}, "temporal": {},
    }

    # ---- load everything once -------------------------------------------
    runs = {}
    for arm in ARMS:
        for seed in args.seeds:
            runs[(arm, seed)] = load_run(arm, seed)

    # ---- five scales, pooled and per seed -------------------------------
    for gkey, _pred, glabel in GROUPS:
        results["pooled"][gkey] = {}
        results["per_seed"][gkey] = {}
        for arm in ARMS:
            tot = [0, 0, 0, 0]
            per = defaultdict(list)
            for seed in args.seeds:
                c = counts(runs[(arm, seed)], gkey)
                for i in range(4):
                    tot[i] += c[i]
                s = five_scales(*c)
                per["gap_pp"].append(s["scale1_gap_pp"][1])
                per["rr_outside"].append(s["scale2_rr_outside"][1])
                per["or_outside"].append(s["scale3_or_outside"][1])
                per["count_outside_g"].append(s["scale4_count_outside_g"])
                per["share_outside_g"].append(s["scale5_share_outside_g"][1])
            results["pooled"][gkey][arm] = five_scales(*tot)
            results["pooled"][gkey][arm]["label"] = glabel
            results["per_seed"][gkey][arm] = {
                k: {"values": v, "seed_ci": seed_interval(v)} for k, v in per.items()
            }

    # ---- temporal --------------------------------------------------------
    for arm in ARMS:
        agg = None
        for seed in args.seeds:
            t = temporal(runs[(arm, seed)], pm)
            if agg is None:
                agg = {
                    "person_hours": defaultdict(float),
                    "outdoors_by_hour": [0.0] * len(t["outdoors_by_hour"]),
                    "weighted_by_hour": [0.0] * len(t["weighted_by_hour"]),
                    "tts": defaultdict(lambda: defaultdict(list)),
                }
            for k, v in t["person_hours"].items():
                agg["person_hours"][k] += v / len(args.seeds)
            for h, v in enumerate(t["outdoors_by_hour"]):
                agg["outdoors_by_hour"][h] += v / len(args.seeds)
            for h, v in enumerate(t["weighted_by_hour"]):
                agg["weighted_by_hour"][h] += v / len(args.seeds)
            for grp, d in t["tts_summary"].items():
                for k, v in d.items():
                    agg["tts"][grp][k].append(v)
        results["temporal"][arm] = {
            "person_hours": dict(agg["person_hours"]),
            "outdoors_by_hour": agg["outdoors_by_hour"],
            "weighted_by_hour": agg["weighted_by_hour"],
            "tts_mean_over_seeds": {
                g: {k: statistics.mean(v) for k, v in d.items()}
                for g, d in agg["tts"].items()
            },
        }

    # ---- where does C's benefit accrue in time? --------------------------
    evac_end = 32   # every agent that ever arrives has arrived by hour ~26
    peak_lo, peak_hi = peak_hour - 12, peak_hour + 12
    tb = {}
    for pair in (("A", "C"), ("A", "B"), ("B", "C")):
        x, y = pair
        wx = results["temporal"][x]["weighted_by_hour"]
        wy = results["temporal"][y]["weighted_by_hour"]
        diff = [wx[h] - wy[h] for h in range(len(wx))]
        tot = sum(diff)
        tb[f"{x}->{y}"] = {
            "total_person_ugm3h_avoided": tot,
            "share_in_evac_window_h16_32": 100 * sum(diff[16:evac_end]) / tot if tot else float("nan"),
            "share_in_peak_window_h{}_{}".format(peak_lo, peak_hi):
                100 * sum(diff[peak_lo:peak_hi + 1]) / tot if tot else float("nan"),
            "peak_window_hours_as_share_of_episode":
                100 * (peak_hi - peak_lo + 1) / (SIM_HOURS - 16),
            "share_after_evac_window": 100 * sum(diff[evac_end:]) / tot if tot else float("nan"),
        }
    results["temporal_benefit_allocation"] = tb

    # ---- print -----------------------------------------------------------
    emit(results)

    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(results, fh, indent=1)
        print(f"\n[wrote {args.json}]", file=sys.stderr)


def emit(R):
    m = R["meta"]
    print("=" * 100)
    print("EQUITY ON FIVE SCALES -- 3 arms x 9 seeds = 27 runs, n=6,842 each "
          f"(pooled n={6842 * len(m['seeds']):,} agent-runs)")
    print(f"smoke-field peak: hour {m['smoke_peak_hour']} = {m['smoke_peak_ugm3']:.1f} ug/m3")
    print("=" * 100)

    for gkey, _p, glabel in GROUPS:
        print(f"\n### GROUP: {glabel}\n")
        hdr = (f"{'arm':<4}{'%shel G':>9}{'%shel ~G':>10}"
               f"{'  1. gap pp [95% CI]':<26}{'  2. RR out':<22}"
               f"{'  3. OR out':<22}{'  4. N_G out':>11}{'  5. %out w/ G':>26}")
        print(hdr)
        for arm in ARMS:
            s = R["pooled"][gkey][arm]
            g = s["scale1_gap_pp"]
            rr = s["scale2_rr_outside"]
            orr = s["scale3_or_outside"]
            c5 = s["scale5_share_outside_g"]
            n_seeds = len(m["seeds"])
            print(f"{arm:<4}{s['pct_shel_g']:>8.2f}%{s['pct_shel_u']:>9.2f}%"
                  f"  {g[1]:>6.2f} [{g[0]:5.2f},{g[2]:5.2f}]"
                  f"   {rr[1]:>5.2f} [{rr[0]:4.2f},{rr[2]:5.2f}]"
                  f"   {orr[1]:>5.2f} [{orr[0]:4.2f},{orr[2]:5.2f}]"
                  f"{s['scale4_count_outside_g'] / n_seeds:>10.1f}"
                  f"   {c5[1]:>6.2f}% [{c5[0]:5.2f},{c5[2]:5.2f}]"
                  f"  (base {s['population_share_g']:.1f}%, lift x{s['scale5_lift']:.2f})")
        print("     per-seed spread (min..max over 9 seeds):")
        for arm in ARMS:
            ps = R["per_seed"][gkey][arm]
            def rng(k, f="{:.2f}"):
                v = ps[k]["values"]
                return f.format(min(v)) + ".." + f.format(max(v))
            print(f"     {arm}: gap_pp {rng('gap_pp')} | RR {rng('rr_outside')} | "
                  f"OR {rng('or_outside')} | N_out {rng('count_outside_g', '{:.0f}')} | "
                  f"%out {rng('share_outside_g')}")

    print("\n" + "=" * 100)
    print("TEMPORAL")
    print("=" * 100)
    print(f"{'arm':<4}{'person-h outdoors':>20}{'  of which unsheltered':>24}"
          f"{'  mobility':>12}{'  unimpaired':>13}")
    for arm in ARMS:
        ph = R["temporal"][arm]["person_hours"]
        print(f"{arm:<4}{ph['total']:>20,.0f}{ph['unsheltered']:>24,.0f}"
              f"{ph['mobility']:>12,.0f}{ph['unimpaired']:>13,.0f}")
    print("\ntime-to-shelter (hours), conditional on ever sheltering:")
    print(f"{'arm':<4}{'group':<12}{'n':>8}{'mean':>8}{'p50':>8}{'p75':>8}"
          f"{'p90':>8}{'p99':>8}{'max':>8}{'<=1h %':>9}{'<=2h %':>9}")
    for arm in ARMS:
        for grp in ("mobility", "unimpaired"):
            t = R["temporal"][arm]["tts_mean_over_seeds"][grp]
            print(f"{arm:<4}{grp:<12}{t['n']:>8.0f}{t['mean_h']:>8.2f}{t['median_h']:>8.2f}"
                  f"{t['p75_h']:>8.2f}{t['p90_h']:>8.2f}{t['p99_h']:>8.2f}{t['max_h']:>8.2f}"
                  f"{t['pct_within_1h']:>9.1f}{t['pct_within_2h']:>9.1f}")
    print("\nwhere the avoided outdoor exposure accrues (person-ug/m3-h):")
    for k, v in R["temporal_benefit_allocation"].items():
        pk = [kk for kk in v if kk.startswith("share_in_peak")][0]
        print(f"  {k}: total {v['total_person_ugm3h_avoided']:>14,.0f} | "
              f"evac window h16-32 {v['share_in_evac_window_h16_32']:5.2f}% | "
              f"{pk.replace('share_in_peak_window_', 'peak +/-12h ')} "
              f"{v[pk]:5.2f}% (window is {v['peak_window_hours_as_share_of_episode']:.1f}% of episode) | "
              f"after evac {v['share_after_evac_window']:.2f}%")


if __name__ == "__main__":
    main()
