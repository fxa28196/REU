#!/usr/bin/env python3
"""Add the shelter capacity that the July-2026 inventory reconciliation recovered.

Seven facilities were in the county/city inventory but absent from the model
because no coordinate had been resolved. Addresses were recovered from
portland.gov, Street Roots and OPB reporting (see
docs/final/FINAL_DATA_VALIDATION_REPORT.md Task 1).

Two City sites are STILL excluded and that is recorded, not silently dropped:
  Clinton Triangle  (160 units) - no published street address, Urban Alchemy
  Multnomah SRV     ( 28 units) - no published street address, Urban Alchemy

Capacity conversion follows docs/final/SHELTER_CAPACITY_AUDIT.md section 2:
village units/pods x1.1, congregate beds x1.0.

Coordinate confidence is recorded honestly per row: a site given only as a
block or an intersection is tagged as such, never as a street address.
"""
import csv, json, pathlib, time, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SHELTERS = ROOT / "Geography/data/shelters/shelters_2026_current_placement.csv"
CACHE = ROOT / "scripts/.geocode_cache_missing_2026.json"

UA = "REU-wildfire-shelter-ABM/1.0 (academic research; PSU NSF REU)"

# (shelter_id, name, address, geocode query, raw_capacity, unit, confidence, provider)
NEW = [
    ("Sunderland_RV_Safe_Park", "Sunderland RV Safe Park",
     "9827 NE Sunderland Ave", "9827 NE Sunderland Ave, Portland, OR",
     55, "units", "geocoded_street_address", "City of Portland / Urban Alchemy"),
    ("Peninsula_Crossing_SRV", "Peninsula Crossing Trail Safe Rest Village",
     "6631 N Syracuse St", "6631 N Syracuse St, Portland, OR",
     60, "units", "geocoded_street_address", "City of Portland"),
    ("BIPOC_SRV", "BIPOC Safe Rest Village",
     "84 NE Weidler St", "84 NE Weidler St, Portland, OR",
     38, "units", "geocoded_street_address", "City of Portland"),
    # Published only as "122nd & E Burnside" and "the 106th block of SE Reedway".
    # Nominatim will not resolve an "&" intersection query, so these are geocoded
    # to the corresponding hundred-block address instead. That is an approximation
    # of a few hundred metres and the coord_confidence column says so.
    ("Menlo_Park_SRV", "Menlo Park Safe Rest Village",
     "NE 122nd Ave & E Burnside St", "12200 E Burnside St, Portland, OR",
     50, "units", "geocoded_intersection_approximated_to_block", "City of Portland"),
    ("Reedway_SRV", "Reedway Safe Rest Village",
     "SE 106th Ave & SE Reedway St", "10600 SE Reedway St, Portland, OR",
     60, "units", "geocoded_block_level", "City of Portland / Urban Alchemy"),
    ("Queer_Affinity_Village", "Queer Affinity Safe Rest Village",
     "2300 SW Naito Pkwy", "2300 SW Naito Pkwy, Portland, OR",
     35, "units", "geocoded_block_level", "City of Portland"),
    ("Doreens_Place", "Doreen's Place (Transition Projects)",
     "610 NW Broadway", "610 NW Broadway, Portland, OR",
     90, "beds", "geocoded_street_address", "Transition Projects"),
]

EXCLUDED = [
    ("Clinton_Triangle_SRV", 160, "no published street address (Urban Alchemy-managed)"),
    ("Multnomah_SRV", 28, "no published street address (Urban Alchemy-managed)"),
]

FACTOR = {"units": 1.1, "beds": 1.0}


def load_cache():
    if CACHE.exists():
        return json.loads(CACHE.read_text(encoding="utf-8"))
    return {}


def geocode(query, cache):
    if query in cache:
        return tuple(cache[query]) if cache[query] else None
    url = ("https://nominatim.openstreetmap.org/search?"
           + urllib.parse.urlencode({"q": query, "format": "json", "limit": 1,
                                     "countrycodes": "us"}))
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as fh:
            data = json.loads(fh.read().decode("utf-8"))
    except Exception as exc:
        print(f"    ! request failed: {exc}")
        data = []
    time.sleep(1.1)                      # Nominatim usage policy: <= 1 req/s
    if not data:
        cache[query] = None
        CACHE.write_text(json.dumps(cache, indent=1), encoding="utf-8")
        return None
    lon, lat = float(data[0]["lon"]), float(data[0]["lat"])
    cache[query] = [lon, lat]
    CACHE.write_text(json.dumps(cache, indent=1), encoding="utf-8")
    return lon, lat


def main():
    rows = list(csv.DictReader(open(SHELTERS, encoding="utf-8-sig")))
    cols = list(rows[0].keys())
    have = {r["shelter_id"] for r in rows}
    before_cap = sum(int(r["capacity"]) for r in rows)
    print(f"existing: {len(rows)} facilities, {before_cap} people-capacity")

    cache = load_cache()
    added, failed = [], []
    for sid, name, addr, query, raw, unit, conf, provider in NEW:
        if sid in have:
            print(f"  skip {sid} (already present)")
            continue
        print(f"  geocoding {name} -> {query}")
        hit = geocode(query, cache)
        if hit is None:
            print("    FAILED - not added")
            failed.append((sid, query))
            continue
        lon, lat = hit
        # Multnomah County sanity envelope. A geocoder that silently returns the
        # centroid of another state must not enter the dataset.
        if not (-122.95 <= lon <= -122.0 and 45.35 <= lat <= 45.65):
            print(f"    OUT OF COUNTY ({lon:.4f},{lat:.4f}) - not added")
            failed.append((sid, query))
            continue
        cap = int(round(raw * FACTOR[unit]))
        print(f"    ({lon:.6f},{lat:.6f})  {raw} {unit} -> {cap} people")
        r = {c: "" for c in cols}
        r.update({
            "shelter_id": sid, "name": name, "address": addr,
            "city": "Portland", "state": "OR", "zip": "",
            "lon": f"{lon:.6f}", "lat": f"{lat:.6f}", "capacity": str(cap),
            "capacity_basis": f"{raw}_{unit}_x{FACTOR[unit]}_per_SHELTER_CAPACITY_AUDIT_s2",
            "opened": "2020-09-07", "closed": "2020-09-19", "status": "operating",
            "coord_source": "nominatim_osm_from_recovered_city_address",
            "coord_confidence": conf,
            "facility_type": "village" if unit == "units" else "congregate",
            "provider": provider, "closure_date": "",
            "priority_vulnerable": "0",
            "raw_capacity": str(raw), "raw_unit": unit,
        })
        rows.append(r)
        added.append((sid, cap))

    with open(SHELTERS, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)

    after_cap = sum(int(r["capacity"]) for r in rows)
    print(f"\nadded {len(added)} facilities (+{after_cap - before_cap} people)")
    print(f"now:   {len(rows)} facilities, {after_cap} people-capacity")
    if failed:
        print(f"GEOCODE FAILURES ({len(failed)}) - not added:")
        for sid, q in failed:
            print(f"  {sid}: {q}")
    print("STILL EXCLUDED (documented, no address exists):")
    for sid, units, why in EXCLUDED:
        print(f"  {sid}: {units} units - {why}")


if __name__ == "__main__":
    main()
