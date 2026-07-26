#!/usr/bin/env python3
"""Scenario B: relocate the CURRENT 2026 shelter system to reduce smoke exposure.

Holds fixed, exactly as Scenario A: the number of facilities, each facility's
capacity, the total system capacity, opening dates, population, demographics and
the PM2.5 field. **Only the coordinates change.**

Method: capacity-aware greedy p-median over street-graph candidate nodes.
Facilities are placed largest-capacity-first; each is sited at the candidate
node minimising the total network distance of the residents it would serve,
given the facilities already placed. Greedy p-median is a standard heuristic;
no claim of global optimality is made.

The optimiser sees ONLY encampment demand geography, the street graph and each
facility's capacity. It does NOT see per-resident outcomes, walking speeds,
health attributes or the PM2.5 series, so it cannot optimise against results it
has not observed.

Sites are street-network nodes, NOT verified venues.
"""
import csv, json, pathlib, sys, heapq
from collections import defaultdict

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from test_routing import build_graphs

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "Geography/data/shelters/shelters_2026_current_placement.csv"
RUN = ROOT / "Geography/output/finalA-n2037-seed42/agents.csv"
CAMPS = ROOT / "Geography/data/encampments/irp_campsite_reports_sample.csv"
DEST = ROOT / "Geography/data/shelters/shelters_2026_optimized_placement.csv"
REPORT = ROOT / "docs/runs/scenario-b-2026-optimization/optimization_report.json"

GRID_M = 600.0
MAX_CANDIDATES = 500


def main():
    import pandas as pd
    print("building validated street graph ...")
    adj, coords, _audit = build_graphs()
    print(f"  {len(coords)} nodes")

    agents = pd.read_csv(RUN)
    camps = pd.read_csv(CAMPS).drop_duplicates("inc_id").set_index("inc_id")
    node_ids = list(coords.keys())
    pts = [coords[n] for n in node_ids]

    def nearest(lon, lat):
        best, bd = None, 1e18
        for i, (lo, la) in enumerate(pts):
            d = (lo - lon) ** 2 + ((la - lat) * 1.42) ** 2
            if d < bd:
                bd, best = d, node_ids[i]
        return best

    demand = defaultdict(int)
    cache = {}
    for enc in agents["starting_encampment"]:
        if enc not in camps.index:
            continue
        if enc not in cache:
            r = camps.loc[enc]
            cache[enc] = nearest(float(r.lon), float(r.lat))
        demand[cache[enc]] += 1
    print(f"  demand: {sum(demand.values())} residents on {len(demand)} nodes")

    deg = GRID_M / 111320.0
    dl = [coords[n] for n in demand]
    lo_lon, hi_lon = min(p[0] for p in dl) - 0.02, max(p[0] for p in dl) + 0.02
    lo_lat, hi_lat = min(p[1] for p in dl) - 0.02, max(p[1] for p in dl) + 0.02
    cells = {}
    for n, (lo, la) in coords.items():
        if lo_lon <= lo <= hi_lon and lo_lat <= la <= hi_lat:
            cells.setdefault((round(lo / deg), round(la / deg)), n)
    cands = list(cells.values())[:MAX_CANDIDATES]
    print(f"  {len(cands)} candidate sites (~{GRID_M:.0f} m grid)")

    def dijkstra(src):
        dist = {src: 0.0}
        pq = [(0.0, src)]
        while pq:
            d, u = heapq.heappop(pq)
            if d > dist.get(u, 1e18):
                continue
            for v, w in adj.get(u, ()):
                nd = d + w
                if nd < dist.get(v, 1e18):
                    dist[v] = nd
                    heapq.heappush(pq, (nd, v))
        return dist

    print("running Dijkstra from each candidate ...")
    D = {}
    for i, c in enumerate(cands):
        D[c] = dijkstra(c)
        if (i + 1) % 100 == 0:
            print(f"  {i+1}/{len(cands)}")

    facs = sorted(csv.DictReader(open(SRC, encoding="utf-8-sig")),
                  key=lambda r: -int(r["capacity"]))
    remaining = dict(demand)
    chosen, placements = set(), []
    for f in facs:
        cap = int(f["capacity"])
        best, best_cost, best_take = None, 1e30, None
        for c in cands:
            if c in chosen:
                continue
            dc = D[c]
            reach = sorted(((dc[n], n) for n in remaining if n in dc))
            cost, taken, left = 0.0, {}, cap
            for d, n in reach:
                if left <= 0:
                    break
                k = min(left, remaining[n])
                cost += d * k
                taken[n] = k
                left -= k
            cost += left * 60000.0
            if cost < best_cost:
                best_cost, best, best_take = cost, c, taken
        if best is None:
            break
        chosen.add(best)
        for n, k in best_take.items():
            remaining[n] -= k
            if remaining[n] <= 0:
                del remaining[n]
        placements.append((f, best, coords[best]))
        print(f"  placed {f['shelter_id'][:28]:30s} cap {cap:5d} -> node {best}")

    cols = list(facs[0].keys())
    rows = []
    for f, node, (lo, la) in placements:
        r = dict(f)
        r["lon"], r["lat"] = f"{lo:.6f}", f"{la:.6f}"
        r["coord_source"] = "greedy_capacity_aware_p_median_over_rlis_graph"
        r["coord_confidence"] = "theoretical_site_not_a_real_facility"
        r["capacity_basis"] = f["capacity_basis"] + "_RELOCATED_scenarioB"
        rows.append(r)
    with open(DEST, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader(); w.writerows(rows)

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps({
        "method": "capacity-aware greedy p-median, largest facility first",
        "facilities": len(rows),
        "total_capacity": sum(int(r["capacity"]) for r in rows),
        "candidates": len(cands),
        "grid_spacing_m": GRID_M,
        "held_fixed": ["facility count", "per-facility capacity", "total capacity",
                       "opening dates", "population", "demographics", "PM2.5 field"],
        "changed": ["facility coordinates only"],
        "no_leakage": ("optimiser sees only encampment demand, the street graph and "
                       "capacity; not outcomes, speeds, health attributes or PM2.5"),
        "limitations": [
            "greedy heuristic, not a proven global optimum",
            "sites are street nodes, not verified venues with indoor filtered air",
            "demand geography inherits the encampment dataset (2025-26 reports)",
            "unfilled-capacity penalty of 60 km per unserved bed is a tuning "
            "constant, not a measured quantity",
        ],
        "placements": [{"shelter_id": r["shelter_id"], "capacity": int(r["capacity"]),
                        "lon": r["lon"], "lat": r["lat"]} for r in rows],
    }, indent=2), encoding="utf-8")
    print(f"\nwrote {DEST.name} ({len(rows)} facilities, "
          f"{sum(int(r['capacity']) for r in rows)} capacity)")


if __name__ == "__main__":
    main()
