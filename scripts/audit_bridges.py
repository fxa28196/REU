#!/usr/bin/env python3
"""U-27 bridge audit: which street features cross the Willamette, and are the
walkable ones (post-TYPE-filter) all on the pedestrian-legal bridge list?

Streets.shp is Web Mercator (metres): the river centreline below is WGS84 and
converted before the planar segment-intersection test.
"""
import math
import pathlib
import shapefile
from collections import defaultdict

SHP = str(pathlib.Path(__file__).resolve().parents[1] / "Geography/data/Streets.shp")
FREEWAY_TYPES = {1110, 1120, 1121, 1122, 1123}

# Pedestrian-legal Willamette crossings per round-4 delta U-27 (in-repo source
# of record, 10-ROUND4-DELTA.md).
LEGAL = ["BROADWAY", "STEEL", "BURNSIDE", "MORRISON", "HAWTHORNE", "TILIKUM",
         "SELLWOOD", "ST JOHNS", "ST. JOHNS"]

# The centreline is anchored at the MIDSPANS of the known Willamette road
# bridges (derived from the shapefile itself), in latitude order, plus a few
# mid-channel points through the bridge-free Swan Island reach. The audit is
# restricted to the reach that has bridges (Sellwood -> just past St Johns);
# there is no road crossing between St Johns and the Columbia confluence, nor
# south of Sellwood within Multnomah County.
# Bridge midspans (WGS84, ~100-200 m accuracy is ample: the channel is
# ~250-400 m wide and bank streets sit behind the shoreline).
ANCHORS_WGS = [
    (-122.6664, 45.4643),   # Sellwood
    (-122.6670, 45.5010),   # Ross Island
    (-122.6672, 45.5044),   # Tilikum
    (-122.6690, 45.5062),   # Marquam (removed deck, still the channel centre)
    (-122.6717, 45.5137),   # Hawthorne
    (-122.6710, 45.5172),   # Morrison
    (-122.6685, 45.5230),   # Burnside
    (-122.6743, 45.5285),   # Steel
    (-122.6770, 45.5343),   # Broadway
    (-122.6810, 45.5378),   # Fremont
    # Swan Island reach (no bridges; mid-channel estimates)
    (-122.6870, 45.5430),
    (-122.7000, 45.5510),
    (-122.7135, 45.5580),
    (-122.7290, 45.5670),
    (-122.7460, 45.5760),
    (-122.7645, 45.5885),   # St Johns
]

R = 6378137.0
def to_merc(lon, lat):
    x = math.radians(lon) * R
    y = math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * R
    return x, y

RIVER = [to_merc(*p) for p in ANCHORS_WGS]

def seg_intersect(p1, p2, p3, p4):
    def cross(o, a, b):
        return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    d1 = cross(p3, p4, p1); d2 = cross(p3, p4, p2)
    d3 = cross(p1, p2, p3); d4 = cross(p1, p2, p4)
    if ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0)):
        return True
    return False

def crosses_river(pts):
    minx = min(p[0] for p in pts); maxx = max(p[0] for p in pts)
    miny = min(p[1] for p in pts); maxy = max(p[1] for p in pts)
    for i in range(len(RIVER) - 1):
        r1, r2 = RIVER[i], RIVER[i+1]
        if max(r1[0], r2[0]) < minx or min(r1[0], r2[0]) > maxx: continue
        if max(r1[1], r2[1]) < miny or min(r1[1], r2[1]) > maxy: continue
        for k in range(len(pts) - 1):
            if seg_intersect(pts[k], pts[k+1], r1, r2):
                return True
    return False

def from_merc(x, y):
    lon = math.degrees(x / R)
    lat = math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2)
    return lon, lat


def main():
    r = shapefile.Reader(SHP)
    fields = [f[0] for f in r.fields[1:]]
    ti, ni, ci = fields.index("TYPE"), fields.index("FULL_NAME"), fields.index("CFCC")
    walk_crossers = defaultdict(int)
    removed_crossers = defaultdict(int)
    coords = {}
    for idx, sr in enumerate(r.iterShapeRecords()):
        pts = sr.shape.points
        if len(pts) < 2: continue
        if not crosses_river(pts): continue
        t = sr.record[ti]
        name = (sr.record[ni] or "").strip() or "(unnamed)"
        key = (name, t, sr.record[ci])
        coords[key] = from_merc(*pts[len(pts) // 2])
        if t in FREEWAY_TYPES:
            removed_crossers[key] += 1
        else:
            walk_crossers[key] += 1

    print("== Features REMOVED by the U-27 filter that crossed the river ==")
    for (name, t, cfcc), n in sorted(removed_crossers.items()):
        print(f"  {name!r:40s} TYPE {t} CFCC {cfcc} x{n}")
    print()
    print("== Features REMAINING walkable that cross the river ==")
    bad = []
    for (name, t, cfcc), n in sorted(walk_crossers.items()):
        legal = any(l in name.upper() for l in LEGAL)
        tag = "LEGAL " if legal else ">>> NOT ON LEGAL LIST"
        if not legal: bad.append((name, t, cfcc, n))
        lon, lat = coords[(name, t, cfcc)]
        print(f"  {tag:22s} {name!r:40s} TYPE {t} CFCC {cfcc} x{n}  @({lon:.5f},{lat:.5f})")
    print()
    print(f"walkable crossers: {sum(walk_crossers.values())} features, "
          f"{len(walk_crossers)} distinct (name,type); "
          f"not-on-list: {len(bad)} distinct")

if __name__ == "__main__":
    main()
