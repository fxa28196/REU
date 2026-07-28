#!/usr/bin/env python3
"""C-random-pool: the MATCHED control that isolates arm C's optimiser alone.

WHY A SECOND RANDOM ARM
-----------------------
build_scenario_crandom_2026.py draws the ten new sites uniformly from street
nodes in the demand bounding box. That box is several times the area of the
demand footprint, so the draw lands mostly in the periphery. It is a fair
picture of UNPLANNED siting, but it is not a clean test of the optimiser,
because random-in-box differs from p-median in TWO ways at once:

    (a) WHERE IT LOOKS   - the whole box, vs the 500-candidate set C searched
    (b) HOW IT CHOOSES   - a coin flip, vs greedy capacity-aware p-median

This script holds (a) fixed and varies only (b). It reconstructs arm C's
candidate set EXACTLY as build_scenario_c_2026.py lines 135-143 build it:

    deg = GRID_M / 111320.0                      # GRID_M = 600.0
    bbox = demand extent padded 0.02 deg
    cells = first node encountered per 600 m grid cell inside the bbox
    cands = list(cells.values())[:MAX_CANDIDATES] minus existing-facility nodes
                                                  # MAX_CANDIDATES = 500

...and then picks ten of those candidates AT RANDOM instead of by p-median.
Everything else is identical to arm C and to C-random: the same 36 real
facilities expanded x1.5, the same ten new sites, the same per-site capacity
vector copied facility-for-facility from arm C's own file, the same total
6,842.

So: a C-random-pool -> C gap is attributable to the SELECTION RULE and nothing
else. That is the number that says how much of arm C is optimisation.

Three fixed, stated site-seeds (4, 5, 6 - distinct from the bbox arm's 1/2/3 so
the two families can never be confused) write:

    Geography/data/shelters/shelters_2026_random_sites_r{4,5,6}.csv

The model's own randomSeed is a SEPARATE, unrelated seed set in the batch
params file.

Sites are street-network nodes: theoretical locations, NOT verified venues with
filtered indoor air.
"""
import csv, json, pathlib, sys, random
from collections import defaultdict

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from test_routing import build_graphs

ROOT = pathlib.Path(__file__).resolve().parents[1]
REAL = ROOT / "Geography/data/shelters/shelters_2026_current_placement.csv"
ARM_C = ROOT / "Geography/data/shelters/shelters_2026_expanded_plus_new_sites.csv"
RUN = ROOT / "Geography/output/B2026-n6842-seed42/agents.csv"
DEST_TMPL = "Geography/data/shelters/shelters_2026_random_sites_r{}.csv"
REPORT = ROOT / "docs/runs/scenario-crandom-2026/scenario_crandom_pool_report.json"

TOTAL = 6842
EXISTING_FACTOR = 1.5
N_NEW = 10
SITE_SEEDS = [4, 5, 6]
# verbatim from build_scenario_c_2026.py
GRID_M = 600.0
MAX_CANDIDATES = 500
PAD_DEG = 0.02


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

    real = list(csv.DictReader(open(REAL, encoding="utf-8-sig")))
    cols = list(real[0].keys())
    base = [int(r["capacity"]) for r in real]
    exist_cap = [int(round(c * EXISTING_FACTOR)) for c in base]
    exist_total = sum(exist_cap)

    c_rows = list(csv.DictReader(open(ARM_C, encoding="utf-8-sig")))
    new_caps = [int(r["capacity"]) for r in c_rows
                if r["shelter_id"].startswith("NEW_optimized_site_")]
    c_nodes = [(float(r["lon"]), float(r["lat"])) for r in c_rows
               if r["shelter_id"].startswith("NEW_optimized_site_")]
    if len(new_caps) != N_NEW or exist_total + sum(new_caps) != TOTAL:
        sys.exit(f"ERROR: {len(new_caps)} new sites, {exist_total}+{sum(new_caps)} != {TOTAL}")

    exist_nodes = [nearest(float(r["lon"]), float(r["lat"])) for r in real]

    # ---- arm C's candidate set, rebuilt verbatim ---------------------------
    deg = GRID_M / 111320.0
    dl = [coords[n] for n in demand]
    lo_lon, hi_lon = min(p[0] for p in dl) - PAD_DEG, max(p[0] for p in dl) + PAD_DEG
    lo_lat, hi_lat = min(p[1] for p in dl) - PAD_DEG, max(p[1] for p in dl) + PAD_DEG
    cells = {}
    for n, (lo, la) in coords.items():
        if lo_lon <= lo <= hi_lon and lo_lat <= la <= hi_lat:
            cells.setdefault((round(lo / deg), round(la / deg)), n)
    cands = [c for c in list(cells.values())[:MAX_CANDIDATES] if c not in set(exist_nodes)]
    print(f"  arm C's candidate set rebuilt: {len(cands)} nodes")

    # Sanity: every site arm C actually chose must be inside this set, otherwise
    # the reconstruction is not the set C searched and the control is invalid.
    cand_pts = {(round(coords[c][0], 6), round(coords[c][1], 6)) for c in cands}
    missing = [p for p in c_nodes if (round(p[0], 6), round(p[1], 6)) not in cand_pts]
    if missing:
        sys.exit(f"ERROR: {len(missing)} of arm C's chosen sites are not in the "
                 f"reconstructed candidate set - reconstruction is wrong: {missing}")
    print(f"  verified: all {N_NEW} of arm C's chosen sites lie in this candidate set")

    report = {
        "scenario": "C-random-pool - arm C's own candidate set, chosen at random",
        "purpose": ("matched control. Holds the SEARCH SPACE identical to arm C and "
                    "varies only the SELECTION RULE, so a C-random-pool -> C gap is "
                    "attributable to the optimiser alone."),
        "candidate_set_rule": (f"verbatim rebuild of build_scenario_c_2026.py: {GRID_M:.0f} m "
                               f"grid dedup of street nodes in the demand bbox (padded "
                               f"{PAD_DEG} deg), first {MAX_CANDIDATES} in node order, "
                               f"existing-facility nodes removed"),
        "candidate_set_size": len(cands),
        "reconstruction_verified": "all 10 arm-C sites are members of this candidate set",
        "site_selection_rng": "python random.Random(site_seed), site_seed in [4,5,6]",
        "identical_to_arm_C": [
            "36 real facilities, real coordinates, capacity x1.5",
            "10 new sites",
            "per-site capacity vector (copied from arm C's file)",
            "total system capacity 6,842",
            "population, demographics, PM2.5 field, street network, opening dates",
            "the candidate set the sites are chosen from",
        ],
        "only_difference_from_arm_C": "ten candidates chosen at random instead of by "
                                      "greedy capacity-aware p-median",
        "existing_capacity_after": exist_total,
        "new_site_capacities": new_caps,
        "total_capacity": TOTAL,
        "draws": [],
        "limitations": [
            "new sites are street-network nodes, not verified venues with filtered indoor air",
            "arm C's candidate set is itself only the first 500 grid-deduplicated nodes in "
            "node order, not a principled sample of the county; this control inherits that "
            "arbitrariness by construction, which is the point - it is matched",
            "three draws bound the spread; they are not a confidence interval",
        ],
    }

    for site_seed in SITE_SEEDS:
        rng = random.Random(site_seed)
        picked = rng.sample(cands, N_NEW)
        out = []
        for r, old, cap in zip(real, base, exist_cap):
            row = dict(r)
            row["capacity"] = str(cap)
            row["capacity_basis"] = (f"SCENARIO_CRANDOMPOOL_existing_site_{old}x{EXISTING_FACTOR}"
                                     f"_REAL_LOCATION_UNCHANGED")
            out.append(row)
        for k, (node, cap) in enumerate(zip(picked, new_caps), 1):
            lo, la = coords[node]
            row = {c: "" for c in cols}
            row.update({
                "shelter_id": f"NEW_random_site_{k:02d}",
                "name": f"Control clean-air shelter {k} (RANDOM from arm-C candidate set, "
                        f"site-seed {site_seed})",
                "address": "", "city": "Portland", "state": "OR", "zip": "",
                "lon": f"{lo:.6f}", "lat": f"{la:.6f}", "capacity": str(cap),
                "capacity_basis": "SCENARIO_CRANDOMPOOL_new_facility_capacity_copied_from_"
                                  "scenario_C_same_site_index",
                "opened": "2020-09-07", "closed": "2020-09-19", "status": "operating",
                "coord_source": f"uniform_random_from_arm_C_candidate_set_siteseed_{site_seed}",
                "coord_confidence": "theoretical_site_not_a_real_facility",
                "facility_type": "proposed", "provider": "CONTROL_NOT_A_REAL_FACILITY",
                "closure_date": "", "priority_vulnerable": "0",
                "raw_capacity": str(cap), "raw_unit": "people",
            })
            out.append(row)

        total_written = sum(int(r["capacity"]) for r in out)
        assert total_written == TOTAL, f"capacity {total_written} != {TOTAL}"
        dest = ROOT / DEST_TMPL.format(site_seed)
        with open(dest, "w", encoding="utf-8", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=cols)
            w.writeheader()
            w.writerows(out)
        print(f"\nsite-seed {site_seed} -> {dest.name}: {len(out)} facilities, "
              f"{total_written} capacity")
        for k, (node, cap) in enumerate(zip(picked, new_caps), 1):
            print(f"  random-from-pool site {k:2d}: cap {cap:4d} -> node {node} "
                  f"({coords[node][0]:.5f},{coords[node][1]:.5f})")

        report["draws"].append({
            "site_seed": site_seed,
            "file": DEST_TMPL.format(site_seed),
            "total_capacity": total_written,
            "sites": [{"id": f"NEW_random_site_{k:02d}", "node": node, "capacity": cap,
                       "lon": round(coords[node][0], 6), "lat": round(coords[node][1], 6)}
                      for k, (node, cap) in enumerate(zip(picked, new_caps), 1)],
        })

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nwrote {REPORT}")


if __name__ == "__main__":
    main()
