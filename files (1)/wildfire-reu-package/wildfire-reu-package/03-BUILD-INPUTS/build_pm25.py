"""
build_pm25.py -- turn Oregon DEQ's published daily AQI into the hourly
PM2.5 file the model reads.

SOURCE
Oregon DEQ / LRAPA, "Wildfire smoke brings record poor air quality to Oregon,
new data shows", 16 September 2020.
https://deqblog.com/2020/09/16/wildfire-smoke-brings-record-poor-air-quality-to-oregon-new-data-shows/

DEQ published daily AQI for Portland for Sept 7-13, 2020, alongside the note
that Portland's previous record AQI was 157 (2017) and its new record was 477,
set 13 September. Portland recorded two "very unhealthy" days and two
"hazardous" days -- the first hazardous days in the city's monitoring record,
which begins in 1985.

WHAT THIS SCRIPT DOES
  1. Converts daily AQI -> daily mean PM2.5 using the EPA piecewise-linear
     breakpoints that were in force in 2020.
  2. Expands daily means to an hourly series with a diurnal shape.
  3. Writes repast_data/pm25_by_node_hour.csv (uniform across nodes).

THREE ASSUMPTIONS YOU MUST STATE IN THE CHAPTER
  (a) AQI -> PM2.5 inversion assumes the reported AQI was PM2.5-driven. During
      a wildfire smoke episode this is safe, but it is an inversion of a
      published index, not a direct monitor reading.
  (b) Daily -> hourly expansion is INTERPOLATION, not observation. Real hourly
      PM2.5 during this event swung far more violently than any smooth curve.
      Set DIURNAL_AMPLITUDE = 0.0 to use flat daily means and avoid implying
      hourly precision you do not have.
  (c) PM2.5 is spatially UNIFORM across the county. Portland's monitors did
      differ, but modelling that needs AirNow station data. Uniform PM2.5 is a
      conservative choice: it means any divergence between your two oracles is
      driven purely by WHERE VULNERABLE PEOPLE ARE, not by where the smoke is.
      For your research question that is arguably the cleaner test.

BREAKPOINT NOTE
EPA revised the PM2.5 AQI breakpoints in 2024. This script uses the pre-2024
breakpoints, which are the ones in force when DEQ published these values.
Using current breakpoints on 2020 AQI would give the wrong concentrations.

RUN
    python build_pm25.py
"""

from pathlib import Path
import numpy as np
import pandas as pd

OUT = Path("repast_data/pm25_by_node_hour.csv")
NODES = Path("repast_data/nodes.csv")

# --- DEQ published daily AQI, Portland, Sept 7-13 2020 ----------------
DEQ_PORTLAND_AQI = {
    "2020-09-07":  84,
    "2020-09-08":  18,
    "2020-09-09":  66,
    "2020-09-10": 215,
    "2020-09-11": 287,
    "2020-09-12": 388,
    "2020-09-13": 477,   # new all-time record; previous was 157 (2017)
}

# DEQ's table stops at 9/13. Your event window runs to 9/19. Options:
#   "truncate" -> model only the 7 documented days (168 h). Defensible.
#   "decay"    -> extend with a decay to clean air. MUST be labelled as
#                 assumed, not observed.
TAIL = "truncate"
DECAY_DAYS = {"2020-09-14": 300, "2020-09-15": 180, "2020-09-16": 90,
              "2020-09-17": 45,  "2020-09-18": 25,  "2020-09-19": 15}

# Diurnal shape. 0.0 = flat daily means (most honest). 0.25 = mild overnight
# peak, which is the usual pattern as the boundary layer collapses.
DIURNAL_AMPLITUDE = 0.0
PEAK_HOUR = 6          # local hour of maximum, if amplitude > 0

# --- EPA PM2.5 AQI breakpoints in force in 2020 ------------------------
# (I_lo, I_hi, C_lo, C_hi) -- concentrations are 24-hour means in ug/m3
BREAKPOINTS_2020 = [
    (0,   50,    0.0,  12.0),
    (51,  100,  12.1,  35.4),
    (101, 150,  35.5,  55.4),
    (151, 200,  55.5, 150.4),
    (201, 300, 150.5, 250.4),
    (301, 400, 250.5, 350.4),
    (401, 500, 350.5, 500.4),
]


def aqi_to_pm25(aqi):
    """Invert the EPA piecewise-linear AQI formula. Returns ug/m3."""
    for i_lo, i_hi, c_lo, c_hi in BREAKPOINTS_2020:
        if i_lo <= aqi <= i_hi:
            return (c_hi - c_lo) / (i_hi - i_lo) * (aqi - i_lo) + c_lo
    if aqi > 500:
        return 500.4
    return 0.0


def build_daily():
    days = dict(DEQ_PORTLAND_AQI)
    rows = []
    for d, aqi in days.items():
        rows.append({"date": d, "aqi": aqi, "pm25": aqi_to_pm25(aqi),
                     "source": "DEQ published AQI (inverted)"})
    if TAIL == "decay":
        for d, pm in DECAY_DAYS.items():
            rows.append({"date": d, "aqi": np.nan, "pm25": float(pm),
                         "source": "ASSUMED decay -- not observed"})
    return pd.DataFrame(rows)


def expand_hourly(daily):
    """Daily means -> hourly series."""
    out = []
    hour = 0
    for _, r in daily.iterrows():
        for h in range(24):
            if DIURNAL_AMPLITUDE > 0:
                shape = 1.0 + DIURNAL_AMPLITUDE * np.cos(
                    2 * np.pi * (h - PEAK_HOUR) / 24.0)
            else:
                shape = 1.0
            out.append({"hour": hour, "date": r["date"], "hour_of_day": h,
                        "pm25": round(float(r["pm25"]) * shape, 2),
                        "source": r["source"]})
            hour += 1
    return pd.DataFrame(out)


def main():
    daily = build_daily()
    print("Daily PM2.5 from DEQ published AQI:\n")
    print(daily.to_string(index=False))
    print(f"\nEvent length: {len(daily)} days = {len(daily)*24} hours")
    print(f"Peak daily mean PM2.5: {daily.pm25.max():.1f} ug/m3 "
          f"(AQI {int(daily.aqi.max())})")

    above = (daily.pm25 > 35.4).sum()
    print(f"Days above the EPA 'unhealthy for sensitive groups' "
          f"threshold (35.4): {above}/{len(daily)}")

    hourly = expand_hourly(daily)

    if not NODES.exists():
        print(f"\n{NODES} not found -- writing a single-column county series "
              "instead. Run bootstrap_data.py first for the per-node file.")
        hourly.to_csv("repast_data/pm25_county_hourly.csv", index=False)
        return

    nodes = pd.read_csv(NODES)
    print(f"\nExpanding to {len(nodes)} nodes x {len(hourly)} hours "
          f"= {len(nodes)*len(hourly):,} rows ...")

    # Uniform across nodes -- see assumption (c) in the docstring.
    node_ids = np.repeat(nodes["node_id"].values, len(hourly))
    hours = np.tile(hourly["hour"].values, len(nodes))
    pm = np.tile(hourly["pm25"].values, len(nodes))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame({"node_id": node_ids, "hour": hours, "pm25": pm}).to_csv(
        OUT, index=False)
    print(f"Wrote {OUT}")

    daily.to_csv("data/pm25_daily_deq.csv", index=False)
    print("Wrote data/pm25_daily_deq.csv (for your Table 1)")

    print("\n--- STATE THESE IN METHODS ---")
    print("  Source: Oregon DEQ/LRAPA published daily AQI, Portland, "
          "Sept 7-13 2020")
    print("  AQI inverted to PM2.5 using pre-2024 EPA breakpoints")
    print(f"  Daily means {'held flat' if DIURNAL_AMPLITUDE == 0 else 'shaped'} "
          "across each 24-hour period (interpolation, not observation)")
    print("  PM2.5 spatially uniform across the county")
    print(f"  Event window: {TAIL}")


if __name__ == "__main__":
    main()
