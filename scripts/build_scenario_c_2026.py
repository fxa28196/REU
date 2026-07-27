#!/usr/bin/env python3
"""Scenario C: keep every real shelter, expand it modestly, add new optimal sites.

C is a buildable proposal, not a thought experiment. Scenario B expanded the
existing 36 facilities by 3.06x and still left 578 beds empty while 562 people
were refused - the beds existed but could not be reached. C spends the SAME
total capacity differently:

  * all 36 real facilities stay exactly where they are and grow only 1.5x
  * the capacity that B would have poured into those same sites instead funds
    NEW facilities at street-network optimal locations

Total capacity is held EQUAL to B (6,842), and the population, demographics,
smoke field and street network are unchanged. So a B->C difference isolates
WHERE the marginal capacity is placed - nothing else.

Method: existing facilities are fixed (location and capacity). Demand is
assigned to them the way the model itself behaves - each resident to the
network-nearest facility that still has room. Whatever demand remains is served
by greedy capacity-aware p-median placement of the new sites.

New sites are street-network nodes: theoretical locations, NOT verified venues
with filtered indoor air.
"""
import csv, json, pathlib, sys, heapq
from collections import defaultdict

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from test_routing import build_graphs

ROOT = pathlib.Path(__file__).resolve().parents[1]
REAL = ROOT / "Geography/data/shelters/shelters_2026_current_placement.csv"
RUN = ROOT / "Geography/output/B2026-n6842-seed42/agents.csv"
DEST = ROOT / "Geography/data/shelters/shelters_2026_expanded_plus_new_sites.csv"
REPORT = ROOT / "docs/runs/scenario-c-2026-new-sites/scenario_c_report.json"

TOTAL = 6842          # held equal to Scenario B
EXISTING_FACTOR = 1.5  # "just slightly larger" - modest expansion of real sites
N_NEW = 10            # new facilities to build
GRID_M = 600.0
MAX_CANDIDATES = 500


def dijkstra(adj, src):
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


def main():
    print("building validated street graph ...")
    adj, coords, _ = build_graphs()
    node_ids = list(coords.keys())
    pts = [coords[n] for n in node_ids]

    def nearest(lon, lat):
        best, bd = None, 1e18
        for i, (lo, la) in enumerate(pts):
            d = (lo - lon) ** 2 + ((la - lat) * 1.42) ** 2
            if d < bd:
                bd, best = d, node_ids[i]
        return best

    # ---- demand geography, straight from the run's recorded start points ----
    demand = defaultdict(int)
    seen = {}
    with open(RUN, encoding="utf-8-sig") as fh:
        for r in csv.DictReader(fh):
            if not r["start_lon"]:
                continue
            key = (r["start_lon"], r["start_lat"])
            if key not in seen:
                seen[key] = nearest(float(r["start_lon"]), float(r["start_lat"]))
            demand[seen[key]] += 1
    print(f"  demand: {sum(demand.values())} residents on {len(demand)} nodes")

    # ---- existing facilities: fixed location, modest expansion --------------
    real = list(csv.DictReader(open(REAL, encoding="utf-8-sig")))
    cols = list(real[0].keys())
    base = [int(r["capacity"]) for r in real]
    exist_cap = [int(round(c * EXISTING_FACTOR)) for c in base]
    exist_total = sum(exist_cap)
    new_total = TOTAL - exist_total
    if new_total <= 0:
        sys.exit(f"ERROR: existing expansion {exist_total} already meets/exceeds {TOTAL}")
    print(f"  existing {len(real)} x{EXISTING_FACTOR}: {sum(base)} -> {exist_total}")
    print(f"  remaining for {N_NEW} new sites: {new_total}")

    # split the new capacity evenly, largest-remainder to hit the total exactly
    per = new_total // N_NEW
    new_caps = [per] * N_NEW
    for i in range(new_total - per * N_NEW):
        new_caps[i] += 1
    assert exist_total + sum(new_caps) == TOTAL

    exist_nodes = [nearest(float(r["lon"]), float(r["lat"])) for r in real]
    print("  Dijkstra from each existing facility ...")
    D_exist = {n: dijkstra(adj, n) for n in set(exist_nodes)}

    # ---- assign demand to existing sites the way the model behaves ---------
    # each resident to the network-nearest facility that still has room
    remaining = dict(demand)
    cap_left = {i: c for i, c in enumerate(exist_cap)}
    served_by_existing = 0
    for node in sorted(list(remaining), key=lambda n: -remaining[n]):
        while remaining.get(node, 0) > 0:
            best_i, best_d = None, 1e18
            for i, en in enumerate(exist_nodes):
                if cap_left[i] <= 0:
                    continue
                d = D_exist[en].get(node)
                if d is not None and d < best_d:
                    best_d, best_i = d, i
            if best_i is None:
                break
            take = min(cap_left[best_i], remaining[node])
            cap_left[best_i] -= take
            remaining[node] -= take
            served_by_existing += take
        if remaining.get(node, 0) <= 0:
            remaining.pop(node, None)
    print(f"  existing sites absorb {served_by_existing}; "
          f"{sum(remaining.values())} residents on {len(remaining)} nodes unserved")

    # ---- place the new facilities on the residual demand -------------------
    deg = GRID_M / 111320.0
    dl = [coords[n] for n in demand]
    lo_lon, hi_lon = min(p[0] for p in dl) - .02, max(p[0] for p in dl) + .02
    lo_lat, hi_lat = min(p[1] for p in dl) - .02, max(p[1] for p in dl) + .02
    cells = {}
    for n, (lo, la) in coords.items():
        if lo_lon <= lo <= hi_lon and lo_lat <= la <= hi_lat:
            cells.setdefault((round(lo / deg), round(la / deg)), n)
    cands = [c for c in list(cells.values())[:MAX_CANDIDATES] if c not in set(exist_nodes)]
    print(f"  {len(cands)} candidate sites; Dijkstra from each ...")
    D = {c: dijkstra(adj, c) for c in cands}

    chosen, placements = set(), []
    for k, cap in enumerate(new_caps):
        best, best_cost, best_take = None, 1e30, None
        for c in cands:
            if c in chosen:
                continue
            dc = D[c]
            reach = sorted((dc[n], n) for n in remaining if n in dc)
            cost, taken, left = 0.0, {}, cap
            for d, n in reach:
                if left <= 0:
                    break
                t = min(left, remaining[n])
                cost += d * t
                taken[n] = t
                left -= t
            cost += left * 60000.0          # penalty for capacity left unused
            if cost < best_cost:
                best_cost, best, best_take = cost, c, taken
        if best is None:
            break
        chosen.add(best)
        for n, t in best_take.items():
            remaining[n] -= t
            if remaining[n] <= 0:
                del remaining[n]
        placements.append((best, cap, coords[best]))
        print(f"  new site {k+1:2d}: cap {cap:4d} -> node {best} "
              f"({coords[best][0]:.5f},{coords[best][1]:.5f})")

    # ---- write ------------------------------------------------------------
    out = []
    for r, old, cap in zip(real, base, exist_cap):
        row = dict(r)
        row["capacity"] = str(cap)
        row["capacity_basis"] = (f"SCENARIO_C_existing_site_{old}x{EXISTING_FACTOR}"
                                 f"_REAL_LOCATION_UNCHANGED")
        out.append(row)
    for k, (node, cap, (lo, la)) in enumerate(placements, 1):
        row = {c: "" for c in cols}
        row.update({
            "shelter_id": f"NEW_optimized_site_{k:02d}",
            "name": f"Proposed clean-air shelter {k} (optimized location)",
            "address": "", "city": "Portland", "state": "OR", "zip": "",
            "lon": f"{lo:.6f}", "lat": f"{la:.6f}", "capacity": str(cap),
            "capacity_basis": "SCENARIO_C_new_facility_capacity_reallocated_from_"
                              "scenario_B_expansion",
            "opened": "2020-09-07", "closed": "2020-09-19", "status": "operating",
            "coord_source": "greedy_capacity_aware_p_median_over_rlis_graph",
            "coord_confidence": "theoretical_site_not_a_real_facility",
            "facility_type": "proposed", "provider": "PROPOSED_NOT_A_REAL_FACILITY",
            "closure_date": "", "priority_vulnerable": "0",
            "raw_capacity": str(cap), "raw_unit": "people",
        })
        out.append(row)

    with open(DEST, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(out)

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps({
        "scenario": "C - existing shelters slightly larger, plus new optimal sites",
        "derived_from": RUN.parent.name,
        "design": {
            "existing_facilities": len(real),
            "existing_expansion_factor": EXISTING_FACTOR,
            "existing_capacity_before": sum(base),
            "existing_capacity_after": exist_total,
            "new_facilities": len(placements),
            "new_capacity_total": sum(c for _, c, _ in placements),
            "total_capacity": exist_total + sum(c for _, c, _ in placements),
        },
        "held_fixed_vs_scenario_B": [
            "total system capacity (6,842)", "population", "demographics",
            "PM2.5 field", "street network", "opening dates",
            "every existing facility's real coordinates",
        ],
        "changed_vs_scenario_B": [
            "existing sites grow 1.5x instead of 3.06x",
            "the difference is built as new facilities at optimized locations",
        ],
        "method": ("existing facilities fixed; demand assigned to the "
                   "network-nearest facility with room; residual demand served "
                   "by greedy capacity-aware p-median placement of new sites"),
        "demand_absorbed_by_existing_sites": served_by_existing,
        "demand_left_for_new_sites": sum(demand.values()) - served_by_existing,
        "new_sites": [{"id": f"NEW_optimized_site_{k:02d}", "capacity": cap,
                       "lon": round(lo, 6), "lat": round(la, 6)}
                      for k, (_, cap, (lo, la)) in enumerate(placements, 1)],
        "limitations": [
            "new sites are street-network nodes, not verified venues with "
            "filtered indoor air",
            "greedy p-median is a heuristic, not a proven global optimum",
            "the 1.5x existing-expansion factor and the choice of 10 new sites "
            "are policy parameters, not measured quantities",
            "no construction cost, staffing or siting feasibility is modelled",
        ],
    }, indent=2), encoding="utf-8")

    print(f"\nwrote {DEST.name}: {len(out)} facilities "
          f"({len(real)} existing + {len(placements)} new), "
          f"{sum(int(r['capacity']) for r in out)} capacity")


if __name__ == "__main__":
    main()
