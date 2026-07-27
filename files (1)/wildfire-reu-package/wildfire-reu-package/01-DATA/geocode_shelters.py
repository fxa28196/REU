"""
geocode_shelters.py -- turn shelter addresses into lat/lon, then emit the
Repast-ready shelters.csv.

I did NOT put coordinates in shelters_multnomah_2026.csv on purpose. Guessing
lat/lon from an address is exactly the kind of plausible-looking fabrication
that has already cost you once in this project. This script gets real ones.

Uses OpenStreetMap Nominatim: free, no API key, but rate-limited to 1 request
per second. ~40 addresses takes about a minute. Run it on YOUR machine (needs
internet).

INSTALL
    pip install requests pandas

RUN
    python geocode_shelters.py

OUTPUTS
    data/shelters_geocoded.csv      full table + lat/lon + geocode_quality
    repast_data/shelters.csv        the four columns Repast needs

WHAT TO CHECK AFTERWARDS
Open shelters_geocoded.csv and look at geocode_quality. Anything marked
FAILED or LOW needs a manual fix -- paste the address into Google Maps,
right-click the pin, copy the coordinates, and type them in. Usually only
a handful.
"""

import time
import sys
from pathlib import Path

import pandas as pd
import requests

IN_CSV = Path("data/shelters_multnomah_2026.csv")
OUT_FULL = Path("data/shelters_geocoded.csv")
OUT_REPAST = Path("repast_data/shelters.csv")

NOMINATIM = "https://nominatim.openstreetmap.org/search"

# Nominatim requires a real identifying User-Agent. Put your own email here --
# they will block a generic one.
HEADERS = {"User-Agent": "PSU-REU-wildfire-shelter-model/1.0 (fxa28196@hawkmail.hacc.edu)"}

# Multnomah County bounding box -- anything outside this is a bad geocode.
LAT_MIN, LAT_MAX = 45.42, 45.65
LON_MIN, LON_MAX = -122.95, -122.35

# Day centers have no published bed capacity. Choose how to treat them:
#   None  -> excluded from the Repast shelter set (default)
#   an int-> used as a nominal clean-air capacity, WHICH YOU MUST STATE
DAY_CENTER_NOMINAL_CAPACITY = None


def geocode(address, city, state="Oregon", country="USA"):
    """Return (lat, lon, quality) or (None, None, 'FAILED')."""
    for attempt, query in enumerate([
        f"{address}, {city}, {state}, {country}",
        f"{address}, {city}, {state}",          # looser retry
    ]):
        try:
            r = requests.get(
                NOMINATIM,
                params={"q": query, "format": "json", "limit": 1,
                        "countrycodes": "us"},
                headers=HEADERS, timeout=20)
            r.raise_for_status()
            js = r.json()
            time.sleep(1.1)                      # rate limit -- do not remove
            if js:
                lat, lon = float(js[0]["lat"]), float(js[0]["lon"])
                if LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX:
                    return lat, lon, "OK" if attempt == 0 else "LOW"
                return lat, lon, "OUT_OF_BOUNDS"
        except Exception as e:
            print(f"    error: {e}")
            time.sleep(2)
    return None, None, "FAILED"


def main():
    if not IN_CSV.exists():
        sys.exit(f"Missing {IN_CSV}")

    df = pd.read_csv(IN_CSV)
    print(f"Geocoding {len(df)} facilities (~{len(df) * 1.2:.0f}s)...\n")

    lats, lons, quals = [], [], []
    for i, row in df.iterrows():
        print(f"  [{i+1:2d}/{len(df)}] {row['name'][:45]:45s}", end=" ")
        lat, lon, q = geocode(row["address"], row["city"])
        lats.append(lat); lons.append(lon); quals.append(q)
        print(q)

    df["lat"] = lats
    df["lon"] = lons
    df["geocode_quality"] = quals

    OUT_FULL.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT_FULL, index=False)

    n_ok = (df.geocode_quality == "OK").sum()
    n_bad = len(df) - n_ok
    print(f"\n{n_ok}/{len(df)} clean. {n_bad} need review -> {OUT_FULL}")

    # ---- emit the Repast table ---------------------------------------
    keep = df[df.lat.notna()].copy()

    if DAY_CENTER_NOMINAL_CAPACITY is None:
        before = len(keep)
        keep = keep[keep.facility_type != "day_center"]
        print(f"Excluded {before - len(keep)} day centers (no published capacity). "
              "Set DAY_CENTER_NOMINAL_CAPACITY to include them.")
    else:
        keep.loc[keep.facility_type == "day_center", "capacity"] = \
            DAY_CENTER_NOMINAL_CAPACITY

    keep = keep[keep.capacity.notna()]
    keep["capacity"] = keep["capacity"].astype(int)
    keep["node_id"] = -1          # run_results/bootstrap snaps this to a node

    OUT_REPAST.parent.mkdir(parents=True, exist_ok=True)
    keep[["name", "node_id", "lat", "lon", "capacity"]].to_csv(OUT_REPAST, index=False)

    print(f"\nWrote {OUT_REPAST}: {len(keep)} facilities, "
          f"{keep.capacity.sum()} total capacity")

    # ---- the closure summary -----------------------------------------
    closing = keep[keep.status == "closing"]
    if len(closing):
        print("\n--- SCHEDULED CLOSURES ---")
        for _, r in closing.iterrows():
            print(f"  {r['name'][:40]:40s} {int(r['capacity']):4d}  {r['closure_date']}")
        by_aug = closing[closing.closure_date <= "2026-08-31"].capacity.sum()
        print(f"  Capacity lost by 2026-08-31: {by_aug}")
        print(f"  Capacity lost total:         {closing.capacity.sum()}")
        vuln = closing[closing.priority_vulnerable == 1].capacity.sum()
        print(f"  Of that, in facilities prioritising veterans/55+/disabled: {vuln}")


if __name__ == "__main__":
    main()
