#!/usr/bin/env python3
"""Scenario C-random: arm C's DESIGN with the optimiser switched off.

WHY THIS ARM EXISTS
-------------------
Arm C's ten new sites were placed by greedy capacity-aware p-median over the
SAME encampment demand points that are later used to evaluate the run. C beating
B could therefore be partly definitional: the sites were fitted to the test set.
C-random is the control that separates the two candidate explanations:

  (1) OPTIMISATION  - the sites are good because they were chosen well;
  (2) DISPERSION    - the sites are good merely because ten extra doors,
                      anywhere in town, shorten the walk relative to piling the
                      same capacity into 36 fixed addresses.

C-random is identical to C in EVERY respect except (1):

  * the same 36 real facilities at their real coordinates, expanded x1.5
  * the same number of new sites (10)
  * the SAME per-site capacity vector as C (copied element-by-element, so the
    two files are capacity-identical facility-for-facility)
  * the same total system capacity, 6,842 - equal to arm B
  * the same population, demographics, PM2.5 field, street network, opening
    dates and every model parameter

ONLY DIFFERENCE: the ten new sites are drawn UNIFORMLY AT RANDOM from the
street-graph nodes inside the demand bounding box, instead of by p-median.

RANDOMNESS IS FIXED AND STATED
------------------------------
Site selection uses python's random.Random(SITE_SEED) with SITE_SEED in
{1, 2, 3} - three independent draws, so a single lucky or unlucky set cannot be
mistaken for a result. Each draw writes its own file:

    Geography/data/shelters/shelters_2026_random_sites_r{1,2,3}.csv

The model's own randomSeed (42..50) is a SEPARATE, unrelated seed and is set in
the batch params file, exactly as for arms A/B/C.

THE ONE CONSTRAINT ON THE DRAW
------------------------------
Candidate nodes are restricted to the LARGEST CONNECTED COMPONENT of the
corrected street graph. Without this, a draw can land on a node in a tiny
orphan component, producing a shelter that is unreachable from every
encampment - which would sabotage the control rather than test it, and would
make C-random look bad for a reason that has nothing to do with optimisation.
Nodes already used by one of the 36 real facilities are also excluded, matching
C (build_scenario_c_2026.py line 143 excludes exist_nodes from its candidates).

The bounding box is computed exactly as in build_scenario_c_2026.py lines
136-138: the extent of the demand nodes, padded by 0.02 degrees on each side.

NOTE ON WHAT "UNIFORM" MEANS HERE - AND WHY THIS ALONE IS NOT ENOUGH
--------------------------------------------------------------------
Uniform over street-graph NODES is not uniform over demand. Measured against
the B-seed42 start points, demand sits in lon [-122.726, -122.511] (p05-p95)
and lat [45.471, 45.588], but the bounding box spans lon [-122.806, -122.457]
and lat [45.418, 45.664]. The box is several times the area of the demand
footprint, so a uniform draw lands mostly in the low-density periphery: of the
30 sites drawn here, essentially none fall in the inner-city core.

That makes this arm a WEAK comparator on its own. It answers "would capacity
put ANYWHERE have worked?" (a real question - it is what an unplanned siting
process produces) but it does NOT isolate the optimiser, because random-in-box
differs from p-median in both WHERE IT LOOKS and HOW IT CHOOSES.

The matched control that does isolate the optimiser is
build_scenario_crandom_pool_2026.py: it draws at random from EXACTLY the 500
candidate nodes arm C's optimiser searched, so the search space is identical
and only the selection rule differs. Read the two together.

Output sites are street-network nodes: theoretical locations, NOT verified
venues with filtered indoor air. Same caveat as C.
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
REPORT = ROOT / "docs/runs/scenario-crandom-2026/scenario_crandom_report.json"

TOTAL = 6842            # held equal to Scenario B and Scenario C
EXISTING_FACTOR = 1.5   # identical to build_scenario_c_2026.py
N_NEW = 10              # identical to build_scenario_c_2026.py
SITE_SEEDS = [1, 2, 3]  # FIXED, STATED site-selection seeds
PAD_DEG = 0.02          # identical to build_scenario_c_2026.py


def largest_component(adj):
    seen, best = set(), []
    for start in adj:
        if start in seen:
            continue
        stack, comp = [start], []
        seen.add(start)
        while stack:
            n = stack.pop()
            comp.append(n)
            for nb, _ in adj[n]:
                if nb not in seen:
                    seen.add(nb)
                    stack.append(nb)
        if len(comp) > len(best):
            best = comp
    return set(best)


def main():
    print("building validated street graph ...")
    adj, coords, audit = build_graphs()
    node_ids = list(coords.keys())
    pts = [coords[n] for n in node_ids]

    def nearest(lon, lat):
        best, bd = None, 1e18
        for i, (lo, la) in enumerate(pts):
            d = (lo - lon) ** 2 + ((la - lat) * 1.42) ** 2
            if d < bd:
                bd, best = d, node_ids[i]
        return best

    # ---- demand geography: identical source and method to arm C ------------
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

    # ---- existing facilities: identical to arm C ---------------------------
    real = list(csv.DictReader(open(REAL, encoding="utf-8-sig")))
    cols = list(real[0].keys())
    base = [int(r["capacity"]) for r in real]
    exist_cap = [int(round(c * EXISTING_FACTOR)) for c in base]
    exist_total = sum(exist_cap)

    # ---- new-site capacity vector: COPIED from arm C's own file ------------
    # Not recomputed. Copying guarantees C and C-random are capacity-identical
    # facility-for-facility, so nothing but coordinates can differ.
    c_rows = list(csv.DictReader(open(ARM_C, encoding="utf-8-sig")))
    new_caps = [int(r["capacity"]) for r in c_rows
                if r["shelter_id"].startswith("NEW_optimized_site_")]
    if len(new_caps) != N_NEW:
        sys.exit(f"ERROR: arm C file has {len(new_caps)} new sites, expected {N_NEW}")
    if exist_total + sum(new_caps) != TOTAL:
        sys.exit(f"ERROR: {exist_total} + {sum(new_caps)} != {TOTAL}")
    print(f"  existing {len(real)} x{EXISTING_FACTOR}: {sum(base)} -> {exist_total}")
    print(f"  new-site capacities copied from arm C: {new_caps} (sum {sum(new_caps)})")

    exist_nodes = set(nearest(float(r["lon"]), float(r["lat"])) for r in real)

    # ---- candidate pool: street nodes in the demand bbox, main component ----
    dl = [coords[n] for n in demand]
    lo_lon, hi_lon = min(p[0] for p in dl) - PAD_DEG, max(p[0] for p in dl) + PAD_DEG
    lo_lat, hi_lat = min(p[1] for p in dl) - PAD_DEG, max(p[1] for p in dl) + PAD_DEG
    main = largest_component(adj)
    pool = sorted(n for n, (lo, la) in coords.items()
                  if lo_lon <= lo <= hi_lon and lo_lat <= la <= hi_lat
                  and n in main and n not in exist_nodes)
    print(f"  bbox lon [{lo_lon:.5f},{hi_lon:.5f}] lat [{lo_lat:.5f},{hi_lat:.5f}]")
    print(f"  candidate pool: {len(pool)} street nodes "
          f"(largest component of {audit['components_fixed'][0]}, "
          f"{len(main)} nodes; {len(exist_nodes)} existing-facility nodes excluded)")

    report = {
        "scenario": "C-random - arm C's design with the optimiser replaced by uniform random draw",
        "purpose": ("control for arm C. C's ten new sites were optimised against the "
                    "same encampment demand points used to evaluate the run, so C > B "
                    "may be definitional. C-random separates OPTIMISATION from mere "
                    "DISPERSION of the same capacity across ten extra doors."),
        "identical_to_arm_C": [
            "36 real facilities, real coordinates, capacity x1.5",
            "10 new sites",
            "per-site capacity vector for the new sites (copied from arm C's file)",
            "total system capacity 6,842 (equal to arm B)",
            "population, demographics, PM2.5 field, street network, opening dates",
            "every model parameter in the batch params file except scenarioCode",
        ],
        "only_difference_from_arm_C":
            "new-site coordinates drawn uniformly at random from street-graph nodes "
            "in the demand bounding box, instead of greedy capacity-aware p-median",
        "site_selection_rng": "python random.Random(site_seed), site_seed in [1,2,3]",
        "candidate_pool_rule": ("street-graph nodes inside the demand bounding box "
                                "(demand extent padded 0.02 deg, same as arm C), "
                                "restricted to the largest connected component, "
                                "excluding nodes occupied by the 36 real facilities"),
        "candidate_pool_size": len(pool),
        "bounding_box": {"lon": [lo_lon, hi_lon], "lat": [lo_lat, hi_lat]},
        "existing_capacity_before": sum(base),
        "existing_capacity_after": exist_total,
        "new_site_capacities": new_caps,
        "total_capacity": TOTAL,
        "draws": [],
        "limitations": [
            "new sites are street-network nodes, not verified venues with filtered indoor air",
            "the demand bounding box is several times the area of the demand footprint, "
            "so a uniform draw lands mostly in the low-density periphery; this arm "
            "therefore conflates WHERE THE OPTIMISER LOOKED with HOW IT CHOSE, and on "
            "its own OVER-states the credit due to optimisation. The matched control "
            "that separates them is build_scenario_crandom_pool_2026.py, which draws at "
            "random from exactly the 500 candidates arm C's optimiser searched",
            "three draws is enough to rule out a single freak set, not enough for a "
            "distribution; treat the spread across r1/r2/r3 as a range, not a CI",
        ],
    }

    for site_seed in SITE_SEEDS:
        rng = random.Random(site_seed)
        picked = rng.sample(pool, N_NEW)
        out = []
        for r, old, cap in zip(real, base, exist_cap):
            row = dict(r)
            row["capacity"] = str(cap)
            row["capacity_basis"] = (f"SCENARIO_CRANDOM_existing_site_{old}x{EXISTING_FACTOR}"
                                     f"_REAL_LOCATION_UNCHANGED")
            out.append(row)
        for k, (node, cap) in enumerate(zip(picked, new_caps), 1):
            lo, la = coords[node]
            row = {c: "" for c in cols}
            row.update({
                "shelter_id": f"NEW_random_site_{k:02d}",
                "name": f"Control clean-air shelter {k} (RANDOM location, site-seed {site_seed})",
                "address": "", "city": "Portland", "state": "OR", "zip": "",
                "lon": f"{lo:.6f}", "lat": f"{la:.6f}", "capacity": str(cap),
                "capacity_basis": "SCENARIO_CRANDOM_new_facility_capacity_copied_from_"
                                  "scenario_C_same_site_index",
                "opened": "2020-09-07", "closed": "2020-09-19", "status": "operating",
                "coord_source": f"uniform_random_street_node_in_demand_bbox_siteseed_{site_seed}",
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
        print(f"\nsite-seed {site_seed} -> {dest.name}: {len(out)} facilities "
              f"({len(real)} real + {N_NEW} random), {total_written} capacity")
        for k, (node, cap) in enumerate(zip(picked, new_caps), 1):
            print(f"  random site {k:2d}: cap {cap:4d} -> node {node} "
                  f"({coords[node][0]:.5f},{coords[node][1]:.5f})")

        report["draws"].append({
            "site_seed": site_seed,
            "file": DEST_TMPL.format(site_seed),
            "facilities": len(out),
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
