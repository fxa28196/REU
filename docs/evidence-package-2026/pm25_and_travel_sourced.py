"""
pm25_and_travel_sourced.py -- the two parameters you asked me to source properly.

Supersedes the values in build_pm25.py and make_all_inputs.py.
Two errors in my earlier work are corrected here and marked CORRECTION.

Run this file to print the verification table and write the PM2.5 series.
"""

import numpy as np
import pandas as pd
from pathlib import Path

# =====================================================================
# PART 1 — MAXIMUM TRAVEL DISTANCE
# =====================================================================
# You asked me to find a source instead of calling it assumed. There is one,
# and it changes the parameter meaningfully.
#
# PRIMARY SOURCE
#   Murphy, E. R. (2019). "Transportation and homelessness: A systematic
#   review." Journal of Social Distress and the Homeless, 28(2), 96-105.
#   DOI: 10.1080/10530789.2019.1582202
#   Hosted by PSU's own National Institute for Transportation and Communities
#   (nitc.trec.pdx.edu) -- a local citation, which is a small bonus.
#
#   FINDINGS relevant to this parameter:
#     - Unhoused people travel on average 9 to 14 MILES DAILY (14.5-22.5 km)
#     - Primary travel mode is PUBLIC TRANSIT -- a sharp contrast with the
#       general US public
#     - Walking is the second most frequent mode; biking and private cars
#       are less common
#     - Longer distances: higher education, longer homelessness duration,
#       living closer to bus stops
#     - Shorter distances: men, African Americans, living closer to rail
#
# SECONDARY SOURCE (pedestrian catchment standard)
#   The 400-800 m walking catchment is long-established in transport planning
#   (Mitchell & Stokes 1982; O'Sullivan & Morrall 1996; Poelman & Dijkstra
#   2015 give 477 m as a 5-minute walk). 400 m is the widely used "5-minute
#   walk" threshold for regularly-accessed neighbourhood services.
#
# THE MODELLING JUDGEMENT YOU NOW HAVE TO MAKE, WITH EVIDENCE ON BOTH SIDES:
#
#   Murphy's 9-14 miles/day is TOTAL DAILY TRAVEL across all modes and
#   destinations. It is NOT willingness to walk to one destination during an
#   emergency. Using it directly would badly overstate reach.
#
#   But it does establish something your model previously assumed away: this
#   population is HIGHLY MOBILE and transit-dependent. A pure-walking
#   catchment of 400 m understates their range; 14 km overstates what someone
#   will do to reach a shelter in hazardous smoke.
#
#   So sweep three levels, each with a stated basis:

MAX_TRAVEL_M = {
    # 5-minute walk. Planning standard for regularly-accessed services.
    # Defensible lower bound given 39.1% report a chronic physical condition
    # (Pathways 2026) and smoke itself impairs exertion.
    "walk_5min":   400,

    # 10-minute walk. The standard "walkable catchment" in planning practice.
    "walk_10min":  800,

    # Walk + one transit leg. Murphy (2019) establishes transit as the primary
    # mode for this population; TriMet operates through smoke events. A 2 km
    # radius approximates walk-to-stop + short ride + walk-from-stop.
    "walk_plus_transit": 2000,
}
MAX_TRAVEL_DEFAULT = "walk_10min"

TRAVEL_SOURCE = (
    "Murphy 2019 (J Soc Distress Homelessness 28(2):96-105) for mode and "
    "daily range; 400/800 m pedestrian catchment standard from transport "
    "planning literature. Swept across three levels."
)

# HONEST NOTE FOR LIMITATIONS: no study measures willingness to travel to an
# EMERGENCY CLEAN-AIR SHELTER during a smoke event. That specific behaviour is
# unmeasured. The sweep brackets it; it does not resolve it.


# =====================================================================
# PART 2 — PM2.5, CORRECTED
# =====================================================================
# CORRECTION 1
#   My earlier build_pm25.py said Portland recorded "two very unhealthy and
#   two hazardous days" in September 2020. THAT IS WRONG.
#
#   Oregon DEQ, "Wildfire Smoke Trends and the Air Quality Index", May 2023,
#   Executive Summary and Discussion, states for Portland:
#     "In 2020 Portland had its first days over the unhealthy AQI level with
#      THREE VERY UNHEALTHY AND FIVE HAZARDOUS DAYS."
#   and
#     "Portland had no unhealthy days or worse between 1985 and 2014 from
#      wildfire smoke. From 2015 to 2022 it had seven unhealthy, three very
#      unhealthy, and five hazardous days... The very unhealthy and hazardous
#      days occurred in 2020."
#
#   So the correct figure is 3 very unhealthy + 5 hazardous = 8 days at
#   Very Unhealthy or worse. Verified against the DEQ report directly.
#
# CORRECTION 2
#   My earlier daily AQI values were invented to look like a plausible curve.
#   They are replaced below with a series CONSTRAINED TO REPRODUCE DEQ'S
#   PUBLISHED CATEGORY COUNTS. That is a defensible construction and you can
#   say exactly that in Methods:
#
#     "Daily PM2.5 was constructed to reproduce the category counts published
#      by Oregon DEQ for Portland in 2020 (three very unhealthy days and five
#      hazardous days), using the EPA AQI breakpoints in force at the time."
#
#   It is still a reconstruction, not monitor data. If you can pull the actual
#   hourly series from EPA AirNow for the Portland SE Lafayette or Portland
#   Postal Building monitors, use that instead and delete this section.

# [T] EPA PM2.5 AQI breakpoints, 24-hour average, post-2012 revision.
# Verified against DEQ Wildfire Smoke Trends Report Table 1.
AQI_BREAKPOINTS = [
    (0,    50,   0.0,   12.0),   # Good
    (51,  100,  12.1,   35.4),   # Moderate
    (101, 150,  35.5,   55.4),   # Unhealthy for Sensitive Groups
    (151, 200,  55.5,  150.4),   # Unhealthy
    (201, 300, 150.5,  250.4),   # Very Unhealthy
    (301, 400, 250.5,  350.4),   # Hazardous
    (401, 500, 350.5,  500.4),   # Hazardous (upper)
]

CATEGORY_BOUNDS = {
    "good":            (0.0,   12.0),
    "moderate":        (12.1,  35.4),
    "usg":             (35.5,  55.4),
    "unhealthy":       (55.5, 150.4),
    "very_unhealthy":  (150.5, 250.4),
    "hazardous":       (250.5, 500.4),
}

# [D] Day-by-day category assignment for Sept 7-19 2020, constrained to give
# exactly 5 hazardous and 3 very unhealthy days as DEQ published.
# The ORDER (ramp up, peak, decay) follows the documented progression of the
# Labor Day 2020 east-wind event; the COUNTS are DEQ's.
EVENT_DAYS = [
    ("2020-09-07", "moderate"),
    ("2020-09-08", "usg"),
    ("2020-09-09", "unhealthy"),
    ("2020-09-10", "hazardous"),
    ("2020-09-11", "hazardous"),
    ("2020-09-12", "hazardous"),
    ("2020-09-13", "hazardous"),      # DEQ: Portland's record AQI day
    ("2020-09-14", "hazardous"),
    ("2020-09-15", "very_unhealthy"),
    ("2020-09-16", "very_unhealthy"),
    ("2020-09-17", "very_unhealthy"),
    ("2020-09-18", "unhealthy"),
    ("2020-09-19", "usg"),
]

# [D] Within-category placement. Peak day sits near the top of Hazardous;
# shoulder days sit mid-category. Keeps the series inside DEQ's categories
# without pretending to a precision we don't have.
WITHIN_CATEGORY_POSITION = {
    "2020-09-13": 0.80,   # record day
    "2020-09-12": 0.55,
    "2020-09-14": 0.45,
    "2020-09-11": 0.35,
    "2020-09-10": 0.25,
}
DEFAULT_POSITION = 0.50

# [A] Diurnal shape. STILL ASSUMED -- no hourly source. Smoke settles
# overnight under a shallow boundary layer and lifts with afternoon mixing.
# Normalised to mean 1.0 so daily means are preserved exactly.
DIURNAL = np.array([
    1.15, 1.18, 1.20, 1.20, 1.18, 1.14, 1.08, 1.00,
    0.92, 0.85, 0.80, 0.78, 0.77, 0.78, 0.82, 0.87,
    0.93, 0.99, 1.05, 1.10, 1.13, 1.15, 1.16, 1.17,
])
DIURNAL = DIURNAL / DIURNAL.mean()


def pm25_to_aqi(c):
    """Forward EPA piecewise-linear conversion, for verification."""
    for alo, ahi, clo, chi in AQI_BREAKPOINTS:
        if clo <= c <= chi:
            return alo + (c - clo) * (ahi - alo) / (chi - clo)
    return 500.0


def daily_series():
    rows = []
    for day, cat in EVENT_DAYS:
        lo, hi = CATEGORY_BOUNDS[cat]
        pos = WITHIN_CATEGORY_POSITION.get(day, DEFAULT_POSITION)
        conc = lo + pos * (hi - lo)
        rows.append({"date": day, "category": cat,
                     "pm25_daily": round(conc, 1),
                     "aqi": round(pm25_to_aqi(conc))})
    return pd.DataFrame(rows)


def hourly_series():
    d = daily_series()
    return np.concatenate([m * DIURNAL for m in d["pm25_daily"].values])


# =====================================================================
# PART 3 — PM10: MY HONEST ANSWER IS DON'T
# =====================================================================
# You asked whether PM10 would help. Based on DEQ's own report, no.
#
# DEQ, Wildfire Smoke Trends Report, "Wildfire Smoke Impacts":
#   "Wildfire smoke emits a wide variety of pollutants measured as particulate
#    matter (PM2.5 and PM10), black carbon, nitrogen dioxide, carbon monoxide,
#    volatile organic compounds... of these pollutants, PM2.5 may represent the
#    greatest health concern since it can be inhaled deeply into the lungs."
#
# And, on why their trends use PM2.5 only:
#   "PM2.5 has the highest AQI levels of any of the continuously measured
#    pollutants during wildfire smoke intrusions."
#
# THREE REASONS TO LEAVE PM10 OUT:
#   1. During smoke events PM2.5 dominates the AQI. PM10 adds no signal.
#   2. Your vulnerability weighting has no PM10-specific basis. You would be
#      adding a pollutant with no corresponding susceptibility parameter.
#   3. It doubles your exposure bookkeeping for no change in the ranking that
#      your divergence index measures.
#
# Adding a variable because data exists, rather than because it answers the
# question, is how scope creep kills a ten-week project. Note in Limitations
# that only PM2.5 is modelled and why.
#
# ONE THING WORTH A SENTENCE: DEQ warns that PurpleAir sensors "report values
# 1.5 to 2 times higher in Oregon than actual PM2.5 values" when uncorrected.
# If anyone suggests PurpleAir for spatial coverage, that correction is
# mandatory (Barkjohn et al. 2021).


# =====================================================================
def verify_and_write():
    d = daily_series()
    print("DAILY SERIES — Sept 7-19 2020, Portland\n")
    print(d.to_string(index=False))

    counts = d["category"].value_counts()
    print("\nCATEGORY COUNTS vs DEQ PUBLISHED")
    checks = [
        ("hazardous days",      int(counts.get("hazardous", 0)),      5),
        ("very unhealthy days", int(counts.get("very_unhealthy", 0)), 3),
    ]
    ok = True
    for label, got, want in checks:
        good = got == want
        ok &= good
        print(f"  [{'PASS' if good else 'FAIL'}] {label}: {got} (DEQ: {want})")

    print("\n  DEQ source: Wildfire Smoke Trends and the Air Quality Index,")
    print("  May 2023, Executive Summary and Discussion, Portland section.")

    h = hourly_series()
    print(f"\nHOURLY SERIES")
    print(f"  hours              : {len(h)}")
    print(f"  peak hourly PM2.5  : {h.max():.1f} ug/m3")
    print(f"  mean over event    : {h.mean():.1f} ug/m3")
    print(f"  hours > 35.4       : {int((h > 35.4).sum())} of {len(h)} "
          f"({100*(h > 35.4).mean():.0f}%)")
    print(f"  hours > 250.5      : {int((h > 250.5).sum())} "
          f"({100*(h > 250.5).mean():.0f}%)")

    print("\nMAX TRAVEL DISTANCE")
    for k, v in MAX_TRAVEL_M.items():
        mark = "  <- default" if k == MAX_TRAVEL_DEFAULT else ""
        print(f"  {k:<20} {v:>5} m{mark}")
    print(f"\n  {TRAVEL_SOURCE}")

    out = Path("repast_data")
    out.mkdir(exist_ok=True)
    d.to_csv(out / "pm25_daily_sourced.csv", index=False)
    pd.DataFrame({"hour": np.arange(len(h)),
                  "pm25": np.round(h, 2)}).to_csv(
        out / "pm25_hourly_sourced.csv", index=False)
    print(f"\nWrote {out}/pm25_daily_sourced.csv and pm25_hourly_sourced.csv")
    print(f"\n{'ALL CHECKS PASSED' if ok else 'CHECKS FAILED'}")
    return ok


if __name__ == "__main__":
    verify_and_write()
