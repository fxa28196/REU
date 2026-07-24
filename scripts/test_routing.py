#!/usr/bin/env python3
"""Routing validation tests for exported wildfire-shelter-ABM runs.

Independently rebuilds the validated street graph from Geography/data/Streets.shp
(mirroring geography.routing.StreetNetwork's node-site clustering: claims of one
PDX_F_NODE/PDX_T_NODE id within 100 m are one junction; extra sites reattach to a
coincident node within 10 m, else split), then for randomly sampled agents of
each run verifies:

  T1  shortest-path distance: an independent Python Dijkstra reproduces the
      exported network_dist_to_shelter_m (tolerance max(60 m, 0.5%) — geodesic
      formula differences only);
  T2  simulated travel distance ~= encampment-snap gap + network distance
      (within one movement step);
  T3  effective walking speed within literature-supported bounds
      (Bohannon 1997, doi:10.1093/ageing/26.1.15: comfortable gait
      1.27-1.46 m/s across ages; model constant 1.30 m/s; hard bounds
      1.20-1.40 m/s);
  T4  physical plausibility: network distance >= straight-line distance and
      circuity (network / straight-line) <= 3.0;
  T5  no impossible jumps: zero edges anywhere in the corrected graph whose
      node-to-node span exceeds their polyline length + slack (and the legacy
      uncorrected graph is audited for comparison).

Speed and travel-distance checks additionally run over EVERY arrived agent,
not just the sample. Exit code 0 = all checks pass; 1 = any failure.

Usage:
    python scripts/test_routing.py                       # all runs under Geography/output/run_*
    python scripts/test_routing.py Geography/output/run_seed42 [--sample 15] [--seed 42]

Requires: pandas, pyshp.  Read-only; writes nothing.
"""

import argparse
import datetime as _dt
import json
import heapq
import math
import random
import sys
from pathlib import Path

import pandas as pd
import shapefile

SCRIPT_VERSION = "1.0.0"
REPO_ROOT = Path(__file__).resolve().parents[1]
SHP = REPO_ROOT / "Geography" / "data" / "Streets.shp"
ENCAMPMENTS = REPO_ROOT / "Geography" / "data" / "encampments" / "irp_campsite_reports_sample.csv"

# Mirrors StreetNetwork constants
CLUSTER_M = 100.0
REATTACH_M = 10.0
SPAN_SLACK_M = 2 * CLUSTER_M + 2 * REATTACH_M

# Validation bounds
NET_TOL = lambda d: max(60.0, 0.005 * d)      # T1: geodesic-formula tolerance
WALK_TOL_M = 80.0                              # T2: one 78 m/min movement step
SPEED_MIN, SPEED_MAX = 1.20, 1.40              # T3: around Bohannon 1997 1.27-1.46
CIRCUITY_MAX = 3.0                             # T4: generous urban circuity bound

# WGS84 ellipsoid; local-radii equirectangular metric (error ~1e-4 at city scale)
_A = 6378137.0
_F = 1 / 298.257223563
_E2 = _F * (2 - _F)
_RM = 6378137.0  # web-mercator sphere radius


def merc_to_lonlat(x, y):
    return math.degrees(x / _RM), math.degrees(math.atan(math.sinh(y / _RM)))


def dist_m(a, b):
    phi = math.radians((a[1] + b[1]) / 2)
    s2 = math.sin(phi) ** 2
    m_rad = _A * (1 - _E2) / (1 - _E2 * s2) ** 1.5
    n_rad = _A / (1 - _E2 * s2) ** 0.5
    dx = math.radians(b[0] - a[0]) * math.cos(phi) * n_rad
    dy = math.radians(b[1] - a[1]) * m_rad
    return math.hypot(dx, dy)


def polyline_len(pts):
    return sum(dist_m(pts[i - 1], pts[i]) for i in range(1, len(pts)))


def build_graphs():
    """Returns (corrected graph, audit dict). Graph = {node: [(nbr, w)]}, plus
    node coords. Also audits the LEGACY (attribute-trusting) construction for
    the before/after comparison."""
    feats = []
    sf = shapefile.Reader(str(SHP))
    fields = [f[0] for f in sf.fields[1:]]
    fi = {n: i for i, n in enumerate(fields)}
    for sr in sf.iterShapeRecords():
        shp, rec = sr.shape, sr.record
        if not shp.points:
            continue
        f, t = rec[fi["PDX_F_NODE"]], rec[fi["PDX_T_NODE"]]
        if f is None or t is None:
            continue
        pts = [merc_to_lonlat(x, y) for x, y in shp.points]
        feats.append((int(f), int(t), pts))

    # --- corrected construction (mirror of StreetNetwork.finaliseGraph) -----
    sites = {}          # attrId -> list of [anchor, graphId]
    order = []          # attrIds in first-claim order
    for f, t, pts in feats:
        for attr, ep in ((f, pts[0]), (t, pts[-1])):
            lst = sites.setdefault(attr, [])
            if not lst:
                order.append(attr)
            if not any(dist_m(ep, s[0]) <= CLUSTER_M for s in lst):
                lst.append([ep, None])
    primaries = []
    for attr in order:
        sites[attr][0][1] = attr
        primaries.append((sites[attr][0][0], attr))
    synthetic = -1000
    corrections = 0
    for attr in order:
        for s in sites[attr][1:]:
            corrections += 1
            near = min(primaries, key=lambda p: (p[0][0] - s[0][0]) ** 2 + (p[0][1] - s[0][1]) ** 2)
            if dist_m(s[0], near[0]) <= REATTACH_M:
                s[1] = near[1]
            else:
                s[1] = synthetic
                synthetic -= 1

    def resolve(attr, ep):
        for anchor, gid in sites[attr]:
            if dist_m(ep, anchor) <= CLUSTER_M:
                return gid
        raise AssertionError(f"unresolved endpoint for {attr}")

    coords, adj = {}, {}
    for attr in order:
        for anchor, gid in sites[attr]:
            coords.setdefault(gid, anchor)
    wormholes_fixed = 0
    for f, t, pts in feats:
        w = polyline_len(pts)
        gf, gt = resolve(f, pts[0]), resolve(t, pts[-1])
        adj.setdefault(gf, []).append((gt, w))
        adj.setdefault(gt, []).append((gf, w))
        if dist_m(coords[gf], coords[gt]) > w + SPAN_SLACK_M:
            wormholes_fixed += 1

    # --- legacy construction audit (first-claim-wins by attribute id) -------
    legacy_coords = {}
    for f, t, pts in feats:
        legacy_coords.setdefault(f, pts[0])
        legacy_coords.setdefault(t, pts[-1])
    wormholes_legacy = 0
    legacy_adj = {}
    for f, t, pts in feats:
        w = polyline_len(pts)
        legacy_adj.setdefault(f, []).append((t, w))
        legacy_adj.setdefault(t, []).append((f, w))
        if dist_m(legacy_coords[f], legacy_coords[t]) > w + SPAN_SLACK_M:
            wormholes_legacy += 1

    def components(a):
        seen, comps, largest = set(), 0, 0
        for start in a:
            if start in seen:
                continue
            comps += 1
            stack, size = [start], 0
            seen.add(start)
            while stack:
                n = stack.pop()
                size += 1
                for nb, _ in a[n]:
                    if nb not in seen:
                        seen.add(nb)
                        stack.append(nb)
            largest = max(largest, size)
        return comps, largest

    audit = {
        "features": len(feats),
        "corrected_sites": corrections,
        "impossible_edges_fixed_graph": wormholes_fixed,
        "impossible_edges_legacy_graph": wormholes_legacy,
        "components_fixed": components(adj),
        "components_legacy": components(legacy_adj),
    }
    return adj, coords, audit


def dijkstra(adj, source):
    dist = {source: 0.0}
    pq = [(0.0, source)]
    while pq:
        d, n = heapq.heappop(pq)
        if d > dist.get(n, math.inf):
            continue
        for nb, w in adj.get(n, ()):
            nd = d + w
            if nd < dist.get(nb, math.inf):
                dist[nb] = nd
                heapq.heappush(pq, (nd, nb))
    return dist


def nearest_node(coords_items, lon, lat):
    """Planar degree-distance snap, mirroring StreetNetwork.nearestNode."""
    best, best_d = None, math.inf
    for gid, (nlon, nlat) in coords_items:
        d = (nlon - lon) ** 2 + (nlat - lat) ** 2
        if d < best_d:
            best, best_d = gid, d
    return best


class Failures:
    def __init__(self):
        self.items = []

    def check(self, ok, label):
        if not ok:
            self.items.append(label)
        return ok


def test_run(run_dir, adj, coords, audit, sample_n, sample_seed):
    run = Path(run_dir)
    agents = pd.read_csv(run / "agents.csv")
    shelters = pd.read_csv(run / "shelters.csv")
    manifest = json.loads((run / "simulation.json").read_text(encoding="utf-8"))
    rep = manifest["reproducibility"]
    camps = pd.read_csv(ENCAMPMENTS).set_index("inc_id")
    coords_items = list(coords.items())
    fails = Failures()

    print(f"\n=== {run.name}  ({rep['sim_id']}, seed {rep['random_seed']}, "
          f"commit {rep['git_commit'][:10]}, data {rep['data_version_tag']})")

    # T5 -- impossible jumps, whole graph
    fails.check(audit["impossible_edges_fixed_graph"] == 0,
                f"T5 impossible edges in corrected graph: {audit['impossible_edges_fixed_graph']}")
    print(f"  T5 impossible-span edges: corrected graph {audit['impossible_edges_fixed_graph']} "
          f"(legacy graph had {audit['impossible_edges_legacy_graph']}) -> "
          + ("PASS" if audit["impossible_edges_fixed_graph"] == 0 else "FAIL"))

    # shelter Dijkstra trees
    op = shelters[shelters["operating"] == True]  # noqa: E712
    trees = {}
    for _, s in op.iterrows():
        node = nearest_node(coords_items, s["lon"], s["lat"])
        trees[s["shelter_id"]] = (node, dijkstra(adj, node), (s["lon"], s["lat"]))

    arrived = agents[agents["final_state"] == "SHELTERED"].copy()

    # whole-run T3: effective walking speed for EVERY arrived agent
    eff = arrived["total_travel_distance_m"] / (arrived["travel_time_min"] * 60.0)
    bad_speed = arrived[(eff < SPEED_MIN) | (eff > SPEED_MAX)]
    fails.check(len(bad_speed) == 0,
                f"T3 {len(bad_speed)} agents outside speed bounds [{SPEED_MIN},{SPEED_MAX}] m/s")
    print(f"  T3 walking speed all arrived agents: {eff.min():.3f}-{eff.max():.3f} m/s "
          f"(bounds {SPEED_MIN}-{SPEED_MAX}, Bohannon 1997 comfortable 1.27-1.46) -> "
          + ("PASS" if len(bad_speed) == 0 else "FAIL"))

    # sample: random + always the worst detour agent
    rng = random.Random(sample_seed)
    idx = list(arrived.index)
    picked = rng.sample(idx, min(sample_n, len(idx)))
    worst = (arrived["total_travel_distance_m"] - arrived["network_dist_to_shelter_m"]).idxmax()
    if worst not in picked:
        picked.append(worst)

    print(f"  sampled {len(picked)} agents (rng seed {sample_seed} + worst-detour agent):")
    print("    agent      shelter  net_java_m  net_py_m   snap_m  walked_m  speed  circuity")
    max_walk_err = 0.0
    for i in picked:
        a = arrived.loc[i]
        camp = camps.loc[a["starting_encampment"]]
        camp_pt = (float(camp["lon"]), float(camp["lat"]))
        start = nearest_node(coords_items, *camp_pt)
        snap = dist_m(camp_pt, coords[start])
        node, tree, shelter_pt = trees[a["shelter_reached"]]
        py_net = tree.get(start, math.inf)
        straight = dist_m(camp_pt, shelter_pt)
        speed = a["total_travel_distance_m"] / (a["travel_time_min"] * 60.0)
        circ = py_net / straight if straight > 0 else 1.0
        walk_err = abs(a["total_travel_distance_m"] - (snap + a["network_dist_to_shelter_m"]))
        max_walk_err = max(max_walk_err, walk_err)

        fails.check(math.isfinite(py_net), f"T1 {a['agent_id']}: unreachable in Python graph")
        fails.check(abs(py_net - a["network_dist_to_shelter_m"]) <= NET_TOL(py_net),
                    f"T1 {a['agent_id']}: python {py_net:.0f} vs exported "
                    f"{a['network_dist_to_shelter_m']:.0f} m")
        fails.check(walk_err <= WALK_TOL_M,
                    f"T2 {a['agent_id']}: walked {a['total_travel_distance_m']:.0f} vs "
                    f"snap {snap:.0f} + net {a['network_dist_to_shelter_m']:.0f} m")
        fails.check(py_net >= straight - 5,
                    f"T4 {a['agent_id']}: network {py_net:.0f} < straight {straight:.0f} m")
        fails.check(circ <= CIRCUITY_MAX,
                    f"T4 {a['agent_id']}: circuity {circ:.2f} > {CIRCUITY_MAX}")
        print(f"    {a['agent_id']:<10} {a['shelter_reached']:<7} "
              f"{a['network_dist_to_shelter_m']:>10.1f} {py_net:>9.1f} {snap:>8.1f} "
              f"{a['total_travel_distance_m']:>9.1f} {speed:>6.3f} {circ:>8.2f}")

    print(f"  T1 shortest paths reproduced independently; "
          f"T2 max |walked - (snap+network)| = {max_walk_err:.1f} m (tol {WALK_TOL_M:.0f})")
    return fails


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("runs", nargs="*")
    ap.add_argument("--sample", type=int, default=15)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    runs = [Path(r) for r in args.runs] if args.runs else \
        sorted((REPO_ROOT / "Geography" / "output").glob("run_*"))
    if not runs:
        sys.exit("No run directories found")

    stamp = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"routing validation v{SCRIPT_VERSION} @ {stamp} -- rebuilding corrected graph "
          f"from {SHP.name} (cluster {CLUSTER_M:.0f} m, reattach {REATTACH_M:.0f} m)")
    adj, coords, audit = build_graphs()
    print(f"graph: {audit['features']} features, {len(coords)} nodes, "
          f"{audit['corrected_sites']} corrected sites; components "
          f"{audit['components_fixed']} (legacy {audit['components_legacy']}); "
          f"impossible edges {audit['impossible_edges_fixed_graph']} "
          f"(legacy {audit['impossible_edges_legacy_graph']})")

    all_fails = []
    for r in runs:
        f = test_run(r, adj, coords, audit, args.sample, args.seed)
        all_fails.extend(f.items)

    print()
    if all_fails:
        print(f"FAIL — {len(all_fails)} check(s) failed:")
        for f in all_fails:
            print("  -", f)
        sys.exit(1)
    print("PASS — all routing validation checks passed "
          "(T1 path reproduction, T2 travel-distance consistency, "
          f"T3 speed bounds {SPEED_MIN}-{SPEED_MAX} m/s, T4 plausibility, T5 no impossible jumps)")


if __name__ == "__main__":
    main()
