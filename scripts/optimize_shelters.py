#!/usr/bin/env python3
"""Capacity-aware p-median shelter-siting optimizer (Scenario B design tool).

Research question
-----------------
Can relocating the SAME limited shelter capacity (2 sites x 99 beds = 198,
exactly Scenario A) reduce population smoke exposure for the 2,037 residents
of the production seed-42 run?

SCIENTIFIC FRAMING -- read before using the output
--------------------------------------------------
This is an UNCONSTRAINED-SITING THEORETICAL OPTIMUM. Facility candidates are
street-graph nodes; the optimizer ignores building availability, ownership,
zoning, ADA access, staffing, transit service, and whether any structure
capable of housing 99 people exists at the chosen node. The result is an
upper bound on what siting alone can achieve, NOT a policy recommendation to
build at those coordinates. Total capacity is held fixed at Scenario A's 198
beds, so the number sheltered is capacity-bound: relocation can only change
WHO is sheltered and how far they walk, not (materially) how many. Demand
geography inherits the 2025-26 encampment proxy limitation (registered
assumption A-03). The full machine-readable limitations list is written to
the output JSON (`limitations` array).

Street graph
------------
The graph is the validated Python rebuild of the Java
geography.routing.StreetNetwork graph, imported from scripts/test_routing.py
(build_graphs), which reproduces the Java Dijkstra distances exactly
(node-site clustering: claims of one PDX_F_NODE/PDX_T_NODE attribute id
within 100 m are one junction; extra sites reattach to a coincident node
within 10 m, else split to a synthetic negative id; edge weights = geodesic
polyline length in metres; undirected). No new graph rules are invented here.

Demand
------
The 2,037 residents of docs/runs/production-n2037/seed42/agents.csv, mapped
through starting_encampment -> encampment lon/lat
(Geography/data/encampments/irp_campsite_reports_sample.csv) -> nearest
street-graph node (planar degree-distance snap, mirroring
StreetNetwork.nearestNode). Residents sharing a node are aggregated into one
weighted demand point. Residents whose snap node lies outside the largest
connected component can reach no facility (the simulation's UNREACHABLE
state) and are carried as permanently unsheltered.

Facility candidates (deterministic subsampling rule)
----------------------------------------------------
Enumerating all ~89k graph nodes is infeasible (one Dijkstra per candidate),
so candidates are subsampled by a deterministic spatial rule, documented in
the output metadata:
  1. take the street-graph nodes in the LARGEST CONNECTED COMPONENT that lie
     within the bounding box of the demand encampment points, expanded by
     2,000 m on every side;
  2. overlay a square grid (local equirectangular metric anchored at the
     bbox centre) and keep, per grid cell, the single node nearest the cell
     centre (ties broken by squared distance, then graph node id);
  3. grid spacing is chosen from the ladder [500, 600, 700, 800, 900, 1000,
     1200, 1500] m: the first (finest) spacing yielding <= 800 candidates is
     used, targeting the 300-800 range;
  4. the two Scenario A shelter nodes (OCC, CJ) are force-included so the
     search space always contains the incumbent siting.
No randomness anywhere: the script is fully deterministic.

Assignment mechanism (mirrors the ABM, cross-checked against the run)
---------------------------------------------------------------------
All residents depart simultaneously at 1.3 m/s (walkingSpeedMps from the run
manifest), so arrival order at a facility is ascending network-distance
order. Each resident heads to the nearer open facility (network distance;
tie -> the pair's first facility). Beds are granted in arrival order until
the 99 beds fill. A resident refused at the door re-routes to the other
facility ONLY if it still has beds at the moment of refusal (this mirrors
the production run, where 1,304 refused agents gave up after one refusal
because the other shelter was already full, and 520 walked to the second
door and were refused there: 1304 + 2*520 = 2344 = the 622 + 1722 shelter
door refusals in simulation.json). A re-routed resident walks from the
refusing facility's node (fixed re-route behaviour) and is admitted on
arrival iff beds remain; otherwise unsheltered.

Objectives
----------
Primary (MINIMISED): total population outdoor-time proxy in person-hours =
  sum over sheltered residents of walked_network_m / 1.3 m/s
  + n_unsheltered * T_event, with T_event = simulationHours (312 h) minus
  the common departure offset (tick 960 * 1 min/tick = 16 h) = 296 h, both
  read from the run manifest / agents.csv. Under the model's uniform
  county-level smoke field, exposure is proportional to time outdoors, so
  this proxy ranks sitings exactly as cumulative outdoor exposure would.
  (T_event scales the unsheltered term identically for every pair, so the
  A-vs-B comparison is invariant to its exact value.)
Also reported per pair: (a) number sheltered, (b) mean walked network
distance of sheltered residents, (c) classic p-median objective = mean
network distance to the nearest facility over all reachable residents
(the 15 unreachable residents are excluded from the mean and reported
under (d)), (d) number of residents with no reachable facility.
The optimum is the pair minimising the primary objective (ties broken by
candidate index order); the top-10 table makes the choice inspectable.

Outputs (the ONLY files written)
--------------------------------
  Geography/data/shelters/shelters_optimized_2020-09.csv
      Scenario B shelter file, schema-identical to shelters_2020-09.csv;
      2 rows OPT1/OPT2, 99 beds each, opened/closed dates copied from the
      real OCC/CJ rows so Scenario B differs from Scenario A ONLY in
      location.
  docs/runs/scenario-b-optimization/optimization_report.json
      Machine-readable provenance: candidate rule and count, chosen nodes,
      all objectives for the chosen pair AND the Scenario A baseline pair,
      top-10 table, input SHA-256s, git commit, limitations.

Requires: pandas (numpy), pyshp. Read-only w.r.t. every existing file.

Usage:
    python scripts/optimize_shelters.py
"""

import csv
import datetime as _dt
import hashlib
import heapq
import json
import math
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

SCRIPT_VERSION = "1.0.0"
REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

# Validated street-graph rebuild + geodesic helpers, shared with the routing
# validation suite (single source of truth for the graph rules).
from test_routing import build_graphs, dist_m  # noqa: E402

SHP = REPO_ROOT / "Geography" / "data" / "Streets.shp"
DBF = REPO_ROOT / "Geography" / "data" / "Streets.dbf"
SHELTERS_A = REPO_ROOT / "Geography" / "data" / "shelters" / "shelters_2020-09.csv"
ENCAMPMENTS = REPO_ROOT / "Geography" / "data" / "encampments" / "irp_campsite_reports_sample.csv"
RUN_DIR = REPO_ROOT / "docs" / "runs" / "production-n2037" / "seed42"
AGENTS = RUN_DIR / "agents.csv"
MANIFEST = RUN_DIR / "simulation.json"

OUT_CSV = REPO_ROOT / "Geography" / "data" / "shelters" / "shelters_optimized_2020-09.csv"
OUT_JSON = REPO_ROOT / "docs" / "runs" / "scenario-b-optimization" / "optimization_report.json"

CAP_PER_SITE = 99                     # Scenario A capacity, held fixed
BBOX_EXPAND_M = 2000.0
GRID_LADDER_M = [500, 600, 700, 800, 900, 1000, 1200, 1500]
CANDIDATE_MAX = 800
CANDIDATE_MIN = 300


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def git_commit():
    try:
        return subprocess.run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"],
                              capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return "unknown"


def compress_graph(adj, coords):
    """Int-index the {graph_id: [(nbr, w)]} adjacency for fast Dijkstra.
    Node order = dict iteration order of `coords` (deterministic: shapefile
    claim order), which also fixes argmin tie-breaking in the snapper to
    match test_routing.nearest_node."""
    ids = list(coords.keys())
    index = {g: i for i, g in enumerate(ids)}
    n = len(ids)
    adj_i = [[] for _ in range(n)]
    for g, nbrs in adj.items():
        adj_i[index[g]] = [(index[nb], w) for nb, w in nbrs]
    lon = np.array([coords[g][0] for g in ids])
    lat = np.array([coords[g][1] for g in ids])
    return ids, index, adj_i, lon, lat


def largest_component(adj_i, n):
    seen = [False] * n
    best = []
    for s in range(n):
        if seen[s]:
            continue
        seen[s] = True
        stack, comp = [s], []
        while stack:
            u = stack.pop()
            comp.append(u)
            for v, _ in adj_i[u]:
                if not seen[v]:
                    seen[v] = True
                    stack.append(v)
        if len(comp) > len(best):
            best = comp
    return best


def snap(lon_arr, lat_arr, qlon, qlat):
    """Nearest node by planar degree distance (mirrors
    StreetNetwork.nearestNode / test_routing.nearest_node, incl. first-min
    tie-break via node array order)."""
    return int(np.argmin((lon_arr - qlon) ** 2 + (lat_arr - qlat) ** 2))


def dijkstra_int(adj_i, n, src):
    inf = math.inf
    dist = [inf] * n
    dist[src] = 0.0
    pq = [(0.0, src)]
    pop, push = heapq.heappop, heapq.heappush
    while pq:
        d, u = pop(pq)
        if d > dist[u]:
            continue
        for v, w in adj_i[u]:
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                push(pq, (nd, v))
    return dist


def evaluate_pair(a, b, D, orders, x_ab, wts, w_total, unreachable_w,
                  t_event_h, speed_mps, detailed=False):
    """Capacity-aware greedy assignment for facility pair (a, b), mirroring
    the ABM (see module docstring). Distances double as arrival times
    (common constant speed). Deterministic: heap keys (t, demand_idx,
    facility, attempt) are unique per event.

    Returns dict of objectives; `detailed` additionally drains all refusal
    events for per-facility door-refusal tallies (slower; used only for the
    baseline and the chosen pair)."""
    da, db = D[a], D[b]
    cap = [CAP_PER_SITE, CAP_PER_SITE]
    heap = []
    push, pop = heapq.heappush, heapq.heappop

    it_a, it_b = iter(orders[a]), iter(orders[b])

    def advance(fac):
        """Feed the next first-choice arrival of facility fac into the heap.
        First choice = nearer facility; tie -> facility a (pair order)."""
        if fac == 0:
            for k in it_a:
                dk = da[k]
                if dk <= db[k]:
                    push(heap, (dk, int(k), 0, 0, int(wts[k])))
                    return
        else:
            for k in it_b:
                dk = db[k]
                if dk < da[k]:
                    push(heap, (dk, int(k), 1, 0, int(wts[k])))
                    return

    advance(0)
    advance(1)

    sheltered = 0
    walk_sum = 0.0
    admitted = [0, 0]
    second_attempt_admits = 0
    refusals = [0, 0]

    while heap:
        t, k, fac, att, wt = pop(heap)
        if att == 0:
            advance(fac)                     # keep that arrival stream flowing
        room = cap[fac]
        take = wt if wt <= room else room
        if take:
            cap[fac] -= take
            sheltered += take
            walk_sum += t * take             # t == walked metres so far
            admitted[fac] += take
            if att == 1:
                second_attempt_admits += take
        left = wt - take
        if left:
            refusals[fac] += left
            if att == 0 and cap[1 - fac] > 0:
                # re-route from the refusing facility's node, only while the
                # other facility still has beds at the moment of refusal
                push(heap, (t + x_ab, k, 1 - fac, 1, left))
            # else: gives up -> unsheltered
        if not detailed and cap[0] == 0 and cap[1] == 0:
            break                             # every later arrival is refused

    unsheltered = w_total - sheltered         # includes the unreachable
    travel_h = walk_sum / speed_mps / 3600.0
    nearest = np.minimum(da, db)              # in-component demand: all finite
    reach_w = w_total - unreachable_w
    pmedian_m = float(nearest @ wts) / reach_w
    return {
        "primary_outdoor_person_hours": travel_h + unsheltered * t_event_h,
        "sheltered": sheltered,
        "mean_walk_sheltered_m": (walk_sum / sheltered) if sheltered else float("nan"),
        "pmedian_mean_nearest_m": pmedian_m,
        "unreachable_residents": int(unreachable_w),
        "unsheltered_residents": int(unsheltered),
        "sheltered_travel_person_hours": travel_h,
        "admitted_per_site": admitted,
        "second_attempt_admits": second_attempt_admits,
        "door_refusals_per_site": refusals if detailed else None,
    }


def main():
    t_start = time.time()
    stamp = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"optimize_shelters v{SCRIPT_VERSION} @ {stamp}")

    # ---- inputs + provenance ------------------------------------------------
    input_hashes = {str(p.relative_to(REPO_ROOT)).replace("\\", "/"): sha256(p)
                    for p in (SHP, DBF, SHELTERS_A, ENCAMPMENTS, AGENTS)}
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    params = manifest["reproducibility"]["parameters"]
    speed_mps = float(params["walkingSpeedMps"])
    minutes_per_tick = float(params["minutesPerTick"])
    sim_hours = float(params["simulationHours"])

    agents = pd.read_csv(AGENTS)
    depart_ticks = agents["time_started_tick"].unique()
    assert len(depart_ticks) == 1, f"expected one common departure tick, got {depart_ticks}"
    depart_offset_h = float(depart_ticks[0]) * minutes_per_tick / 60.0
    t_event_h = sim_hours - depart_offset_h
    print(f"speed {speed_mps} m/s; event window {t_event_h:.1f} h "
          f"({sim_hours:.0f} h sim - {depart_offset_h:.0f} h departure offset)")

    # ---- street graph (validated rebuild, imported from test_routing) -------
    print("building validated street graph from Streets.shp ...")
    adj, coords, audit = build_graphs()
    assert audit["impossible_edges_fixed_graph"] == 0
    ids, index, adj_i, nlon, nlat = compress_graph(adj, coords)
    n = len(ids)
    comp = largest_component(adj_i, n)
    in_comp = np.zeros(n, dtype=bool)
    in_comp[comp] = True
    print(f"graph: {n} nodes; largest component {len(comp)} nodes "
          f"(manifest: {manifest['street_network_validation']['largest_component_nodes']})")
    assert len(comp) == manifest["street_network_validation"]["largest_component_nodes"], \
        "largest component size does not match the production run manifest"

    # ---- demand: agents -> encampments -> snapped, weighted nodes -----------
    camps = pd.read_csv(ENCAMPMENTS).set_index("inc_id")
    per_camp = agents.groupby("starting_encampment").size()
    assert per_camp.sum() == len(agents)
    missing = set(per_camp.index) - set(camps.index)
    assert not missing, f"encampments missing from campsite file: {sorted(missing)[:5]}"

    node_weight = {}
    camp_pts = []
    for camp_id, cnt in per_camp.items():
        clon, clat = float(camps.at[camp_id, "lon"]), float(camps.at[camp_id, "lat"])
        camp_pts.append((clon, clat))
        node = snap(nlon, nlat, clon, clat)
        node_weight[node] = node_weight.get(node, 0) + int(cnt)
    demand_nodes = sorted(node_weight)                      # deterministic order
    dn_in = [d for d in demand_nodes if in_comp[d]]
    dn_out = [d for d in demand_nodes if not in_comp[d]]
    unreachable_w = sum(node_weight[d] for d in dn_out)
    w_total = int(per_camp.sum())
    wts = np.array([node_weight[d] for d in dn_in], dtype=np.int64)
    m = len(dn_in)
    print(f"demand: {w_total} residents at {len(per_camp)} encampments -> "
          f"{len(demand_nodes)} street nodes ({m} in largest component; "
          f"{unreachable_w} residents on {len(dn_out)} out-of-component nodes)")
    assert unreachable_w == manifest["population"]["unreachable"], \
        (f"out-of-component residents ({unreachable_w}) != simulation UNREACHABLE "
         f"count ({manifest['population']['unreachable']}) — graph mirror broken?")

    # ---- Scenario A baseline nodes ------------------------------------------
    shel_a = pd.read_csv(SHELTERS_A)
    op = shel_a[shel_a["status"] == "operating"].reset_index(drop=True)
    assert sorted(op["shelter_id"]) == ["CJ", "OCC"]
    assert int(op["capacity"].sum()) == 2 * CAP_PER_SITE == 198
    base_nodes = {}
    for _, s in op.iterrows():
        bn = snap(nlon, nlat, float(s["lon"]), float(s["lat"]))
        assert in_comp[bn], f"baseline shelter {s['shelter_id']} snapped outside largest component"
        base_nodes[s["shelter_id"]] = bn
    print(f"baseline nodes: OCC -> graph id {ids[base_nodes['OCC']]}, "
          f"CJ -> graph id {ids[base_nodes['CJ']]}")

    # ---- candidate selection (deterministic grid subsample) -----------------
    plons = np.array([p[0] for p in camp_pts])
    plats = np.array([p[1] for p in camp_pts])
    lon0 = (plons.min() + plons.max()) / 2.0
    lat0 = (plats.min() + plats.max()) / 2.0
    m_per_deg_lon = dist_m((lon0 - 0.5, lat0), (lon0 + 0.5, lat0))
    m_per_deg_lat = dist_m((lon0, lat0 - 0.5), (lon0, lat0 + 0.5))
    lon_min = plons.min() - BBOX_EXPAND_M / m_per_deg_lon
    lon_max = plons.max() + BBOX_EXPAND_M / m_per_deg_lon
    lat_min = plats.min() - BBOX_EXPAND_M / m_per_deg_lat
    lat_max = plats.max() + BBOX_EXPAND_M / m_per_deg_lat

    pool = np.flatnonzero(in_comp & (nlon >= lon_min) & (nlon <= lon_max)
                          & (nlat >= lat_min) & (nlat <= lat_max))
    px = (nlon[pool] - lon_min) * m_per_deg_lon
    py = (nlat[pool] - lat_min) * m_per_deg_lat
    print(f"candidate pool: {len(pool)} largest-component nodes inside "
          f"demand bbox + {BBOX_EXPAND_M:.0f} m")

    chosen_spacing, cand_nodes = None, None
    for spacing in GRID_LADDER_M:
        cells = {}
        cx = np.floor(px / spacing).astype(np.int64)
        cy = np.floor(py / spacing).astype(np.int64)
        ccx = (cx + 0.5) * spacing
        ccy = (cy + 0.5) * spacing
        d2 = (px - ccx) ** 2 + (py - ccy) ** 2
        for i in range(len(pool)):
            key = (int(cx[i]), int(cy[i]))
            cand = (float(d2[i]), ids[pool[i]], int(pool[i]))
            if key not in cells or cand < cells[key]:
                cells[key] = cand
        if len(cells) <= CANDIDATE_MAX:
            chosen_spacing = spacing
            cand_nodes = sorted(v[2] for v in cells.values())
            break
    assert cand_nodes is not None, "grid ladder exhausted without count <= CANDIDATE_MAX"
    if len(cand_nodes) < CANDIDATE_MIN:
        print(f"WARNING: only {len(cand_nodes)} candidates (< {CANDIDATE_MIN})")
    forced = [bn for bn in (base_nodes["OCC"], base_nodes["CJ"]) if bn not in cand_nodes]
    cand_nodes.extend(forced)
    ncand = len(cand_nodes)
    print(f"grid spacing {chosen_spacing} m -> {ncand} candidates "
          f"({len(forced)} Scenario A node(s) force-included)")

    # ---- one Dijkstra per candidate -----------------------------------------
    print(f"running {ncand} Dijkstras (one per candidate) ...")
    D = np.empty((ncand, m))
    C2C = np.empty((ncand, ncand))
    t0 = time.time()
    for ci, node in enumerate(cand_nodes):
        dist = dijkstra_int(adj_i, n, node)
        D[ci] = [dist[t] for t in dn_in]
        C2C[ci] = [dist[t] for t in cand_nodes]
        if (ci + 1) % 50 == 0 or ci + 1 == ncand:
            print(f"  {ci + 1}/{ncand}  ({time.time() - t0:.0f} s)")
    assert np.isfinite(D).all(), "in-component demand node unreachable from a candidate?"
    orders = [np.argsort(D[ci], kind="stable") for ci in range(ncand)]

    # ---- baseline (Scenario A) objectives -----------------------------------
    bi = cand_nodes.index(base_nodes["OCC"])
    bj = cand_nodes.index(base_nodes["CJ"])
    ba, bb = min(bi, bj), max(bi, bj)
    baseline = evaluate_pair(ba, bb, D, orders, C2C[ba, bb], wts, w_total,
                             unreachable_w, t_event_h, speed_mps, detailed=True)
    print(f"baseline OCC+CJ: sheltered {baseline['sheltered']} "
          f"(sim: {manifest['population']['sheltered']}), "
          f"door refusals {baseline['door_refusals_per_site']} "
          f"(sim: OCC {manifest['shelters'][1]['refused']}, CJ {manifest['shelters'][0]['refused']}), "
          f"primary {baseline['primary_outdoor_person_hours']:.0f} person-h")
    assert baseline["sheltered"] == manifest["population"]["sheltered"] == 198, \
        "baseline greedy does not shelter 198 residents — mechanism mirror broken"

    # ---- exhaustive pair enumeration ----------------------------------------
    npairs = ncand * (ncand - 1) // 2
    print(f"evaluating {npairs} candidate pairs ...")
    results = []
    t0 = time.time()
    done = 0
    for a in range(ncand):
        for b in range(a + 1, ncand):
            r = evaluate_pair(a, b, D, orders, C2C[a, b], wts, w_total,
                              unreachable_w, t_event_h, speed_mps)
            results.append((r["primary_outdoor_person_hours"], a, b,
                            r["sheltered"], r["mean_walk_sheltered_m"],
                            r["pmedian_mean_nearest_m"]))
        done += ncand - a - 1
        if (a + 1) % 100 == 0 or a + 1 == ncand:
            print(f"  {done}/{npairs} pairs  ({time.time() - t0:.0f} s)")

    results.sort(key=lambda r: (r[0], r[1], r[2]))       # deterministic tie-break
    top10 = results[:10]
    best_primary, best_a, best_b = top10[0][0], top10[0][1], top10[0][2]
    chosen = evaluate_pair(best_a, best_b, D, orders, C2C[best_a, best_b], wts,
                           w_total, unreachable_w, t_event_h, speed_mps, detailed=True)

    def pair_row(rank, r):
        _, a, b, shel, mw, pm = r
        return {
            "rank": rank,
            "node_ids": [ids[cand_nodes[a]], ids[cand_nodes[b]]],
            "lon_lat": [[round(float(nlon[cand_nodes[a]]), 6), round(float(nlat[cand_nodes[a]]), 6)],
                        [round(float(nlon[cand_nodes[b]]), 6), round(float(nlat[cand_nodes[b]]), 6)]],
            "primary_outdoor_person_hours": round(r[0], 2),
            "sheltered": int(shel),
            "mean_walk_sheltered_m": round(float(mw), 1),
            "pmedian_mean_nearest_m": round(float(pm), 1),
            "unreachable_residents": int(unreachable_w),
        }

    print("\ntop 10 candidate pairs (primary objective ascending):")
    print("  rank  node_a      node_b      primary_h   shelt  mean_walk_m  pmedian_m")
    for rk, r in enumerate(top10, 1):
        print(f"  {rk:>4}  {ids[cand_nodes[r[1]]]:<10}  {ids[cand_nodes[r[2]]]:<10}  "
              f"{r[0]:>10.1f}  {r[3]:>5}  {r[4]:>11.1f}  {r[5]:>9.1f}")

    # ---- outputs ------------------------------------------------------------
    # OPT1 inherits OCC's opened date, OPT2 CJ's, so Scenario B differs from
    # Scenario A ONLY in location (same capacities, same operating window).
    occ_row = op[op["shelter_id"] == "OCC"].iloc[0]
    cj_row = op[op["shelter_id"] == "CJ"].iloc[0]
    opt_defs = [("OPT1", best_a, occ_row["opened"], occ_row["closed"]),
                ("OPT2", best_b, cj_row["opened"], cj_row["closed"])]
    header = ["shelter_id", "name", "address", "city", "state", "zip", "lon", "lat",
              "capacity", "capacity_basis", "opened", "closed", "status",
              "coord_source", "coord_confidence"]
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(header)
        for i, (sid, ci, opened, closed) in enumerate(opt_defs, 1):
            node = cand_nodes[ci]
            w.writerow([sid,
                        f"Optimized site {i} (theoretical, street node {ids[node]})",
                        "", "", "", "",
                        f"{nlon[node]:.6f}", f"{nlat[node]:.6f}",
                        CAP_PER_SITE,
                        "scenario_b_same_total_as_scenario_a",
                        opened, closed, "operating",
                        "p_median_optimization_over_rlis_street_graph",
                        "theoretical_site_not_a_real_facility"])
    print(f"\nwrote {OUT_CSV.relative_to(REPO_ROOT)}")

    def obj_block(r, node_pair):
        d = {k: (round(v, 2) if isinstance(v, float) else v) for k, v in r.items()}
        d["node_ids"] = [ids[cand_nodes[node_pair[0]]], ids[cand_nodes[node_pair[1]]]]
        d["lon_lat"] = [[round(float(nlon[cand_nodes[c]]), 6),
                         round(float(nlat[cand_nodes[c]]), 6)] for c in node_pair]
        return d

    report = {
        "schema": "reu-wildfire-shelter-abm/scenario-b-optimization/v1",
        "script": "scripts/optimize_shelters.py",
        "script_version": SCRIPT_VERSION,
        "generated_utc": stamp,
        "git_commit": git_commit(),
        "input_sha256": input_hashes,
        "source_run": {
            "sim_id": manifest["reproducibility"]["sim_id"],
            "random_seed": manifest["reproducibility"]["random_seed"],
            "n_agents": w_total,
        },
        "parameters": {
            "walking_speed_mps": speed_mps,
            "capacity_per_site": CAP_PER_SITE,
            "total_capacity": 2 * CAP_PER_SITE,
            "event_window_h": t_event_h,
            "event_window_derivation": (
                f"simulationHours ({sim_hours:.0f}) - common departure offset "
                f"(tick {int(depart_ticks[0])} * {minutes_per_tick} min/tick = "
                f"{depart_offset_h:.0f} h); identical for every pair, so the "
                "A-vs-B ranking is invariant to its exact value"),
        },
        "graph": {
            "source": "Geography/data/Streets.shp via scripts/test_routing.build_graphs "
                      "(validated mirror of geography.routing.StreetNetwork)",
            "nodes": n,
            "largest_component_nodes": len(comp),
            "impossible_edges": audit["impossible_edges_fixed_graph"],
        },
        "demand": {
            "residents": w_total,
            "encampments": int(per_camp.shape[0]),
            "demand_street_nodes": len(demand_nodes),
            "demand_nodes_in_largest_component": m,
            "unreachable_residents_out_of_component": int(unreachable_w),
            "aggregation": "residents sharing a snapped street node form one "
                           "weighted demand point; snap = planar degree-distance "
                           "nearest node (mirrors StreetNetwork.nearestNode)",
        },
        "candidates": {
            "count": ncand,
            "grid_spacing_m": chosen_spacing,
            "grid_ladder_m": GRID_LADDER_M,
            "target_range": [CANDIDATE_MIN, CANDIDATE_MAX],
            "bbox_expand_m": BBOX_EXPAND_M,
            "scenario_a_nodes_force_included": len(forced),
            "selection_rule": (
                "largest-connected-component street-graph nodes inside the demand "
                "encampment bounding box expanded 2 km; one node per square grid "
                "cell (node nearest the cell centre; ties by squared distance then "
                "graph node id); finest ladder spacing yielding <= 800 candidates; "
                "Scenario A shelter nodes force-included. Fully deterministic."),
            "pairs_evaluated": npairs,
        },
        "assignment_mechanism": (
            "event-ordered capacity-aware greedy mirroring the ABM: simultaneous "
            "departure at constant speed => arrival order is network-distance "
            "order; each resident heads to the nearer open facility (tie -> "
            "first facility of the pair); admitted in arrival order until 99 "
            "beds fill; on refusal, re-routes from the refusing facility's node "
            "iff the other facility still has beds at that moment (cross-checked "
            "against seed-42 door_refusals: 1304 single-refusal give-ups + 520 "
            "double refusals = 2344 = 622+1722 door refusals in the manifest); "
            "admitted on arrival iff beds remain, else unsheltered."),
        "objectives_definitions": {
            "primary_outdoor_person_hours": (
                "sum over sheltered residents of walked network metres / 1.3 m/s "
                "(hours) + unsheltered residents x event window (296 h); under "
                "the model's uniform county-level smoke field, exposure is "
                "proportional to outdoor time"),
            "mean_walk_sheltered_m": "mean walked network distance of sheltered "
                                     "residents incl. re-route legs",
            "pmedian_mean_nearest_m": "classic p-median: mean network distance to "
                                      "the nearest facility over the 2022 reachable "
                                      "residents (15 unreachable excluded)",
            "unreachable_residents": "residents whose snapped node lies outside "
                                     "the largest component (no facility reachable)",
        },
        "scenario_a_baseline": obj_block(baseline, (ba, bb)),
        "chosen_pair": obj_block(chosen, (best_a, best_b)),
        "improvement": {
            "primary_outdoor_person_hours": round(
                baseline["primary_outdoor_person_hours"]
                - chosen["primary_outdoor_person_hours"], 2),
            "primary_pct_of_baseline": round(
                100.0 * (baseline["primary_outdoor_person_hours"]
                         - chosen["primary_outdoor_person_hours"])
                / baseline["primary_outdoor_person_hours"], 4),
            "sheltered_travel_person_hours_saved": round(
                baseline["sheltered_travel_person_hours"]
                - chosen["sheltered_travel_person_hours"], 2),
            "pmedian_mean_nearest_m_saved": round(
                baseline["pmedian_mean_nearest_m"]
                - chosen["pmedian_mean_nearest_m"], 1),
        },
        "top10": [pair_row(rk, r) for rk, r in enumerate(top10, 1)],
        "tie_breaks": [
            "equal network distance to both facilities -> first facility of the pair",
            "simultaneous arrivals -> ascending demand-node index (heap key)",
            "equal primary objective across pairs -> ascending candidate index pair",
            "grid cell node ties -> squared distance to cell centre, then graph node id",
        ],
        "limitations": [
            "UNCONSTRAINED-SITING THEORETICAL OPTIMUM: ignores building "
            "availability, ownership, zoning, ADA access, staffing, transit, and "
            "whether any structure capable of housing 99 people exists at the "
            "chosen street nodes; an upper bound on what siting alone can "
            "achieve, NOT a policy recommendation to build there.",
            "Total capacity fixed at Scenario A's 198 beds, so the number "
            "sheltered is capacity-bound; relocation can only change WHO is "
            "sheltered and how far they walk, not (materially) how many.",
            "Demand geography inherits the 2025-26 encampment proxy limitation "
            "(registered assumption A-03).",
            "Outdoor-exposure proxy is time-based under the model's uniform "
            "county-level smoke field; it is not concentration-weighted at "
            "sub-county scale.",
            "Assignment mirror uses continuous arrival times; the ABM uses 1-min "
            "ticks and a 200 m shelter-arrival radius, so marginal admission "
            "order can differ for near-tied residents.",
            "Encampment-to-street-node snap gaps are excluded from the objective "
            "(identical in Scenarios A and B, so the comparison is unaffected).",
            "Candidate set is grid-subsampled; the true optimum may lie at a "
            "non-candidate node, so the reported optimum is conservative at the "
            "grid-spacing spatial resolution.",
            "Demand weights are the seed-42 production realization; other seeds "
            "redraw resident-to-encampment placement.",
        ],
        "runtime_s": round(time.time() - t_start, 1),
    }
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT_JSON.relative_to(REPO_ROOT)}")

    # ---- human-readable summary --------------------------------------------
    print("\n================ SUMMARY ================")
    print(f"Scenario A baseline (OCC {occ_row['lon']:.6f},{occ_row['lat']:.6f} + "
          f"CJ {cj_row['lon']:.6f},{cj_row['lat']:.6f}):")
    print(f"  primary {baseline['primary_outdoor_person_hours']:.1f} person-h outdoors | "
          f"sheltered {baseline['sheltered']} | mean walk (sheltered) "
          f"{baseline['mean_walk_sheltered_m']:.0f} m | p-median "
          f"{baseline['pmedian_mean_nearest_m']:.0f} m | unreachable {unreachable_w}")
    for sid, ci, opened, _ in opt_defs:
        node = cand_nodes[ci]
        print(f"Scenario B {sid}: street node {ids[node]} at "
              f"({nlon[node]:.6f}, {nlat[node]:.6f}), 99 beds, opened {opened}")
    print(f"  primary {chosen['primary_outdoor_person_hours']:.1f} person-h outdoors | "
          f"sheltered {chosen['sheltered']} | mean walk (sheltered) "
          f"{chosen['mean_walk_sheltered_m']:.0f} m | p-median "
          f"{chosen['pmedian_mean_nearest_m']:.0f} m | unreachable {unreachable_w}")
    dp = baseline["primary_outdoor_person_hours"] - chosen["primary_outdoor_person_hours"]
    print(f"Relocation saves {dp:.1f} person-hours outdoors "
          f"({100 * dp / baseline['primary_outdoor_person_hours']:.3f}% of baseline; "
          f"capacity-bound: sheltered count unchanged at "
          f"{chosen['sheltered']}/{w_total}); sheltered-travel time saved "
          f"{baseline['sheltered_travel_person_hours'] - chosen['sheltered_travel_person_hours']:.1f} "
          f"person-h; mean nearest-facility distance reduced "
          f"{baseline['pmedian_mean_nearest_m'] - chosen['pmedian_mean_nearest_m']:.0f} m "
          f"per reachable resident.")
    print("NOTE: theoretical unconstrained-siting optimum; see limitations in "
          f"{OUT_JSON.name}.")
    print(f"total runtime {time.time() - t_start:.0f} s")


if __name__ == "__main__":
    main()
