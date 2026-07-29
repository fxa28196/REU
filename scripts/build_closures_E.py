#!/usr/bin/env python3
"""Scenario E obstacle layer: generate a street-closure schedule.

WHAT THIS IS - AND WHAT IT IS NOT
---------------------------------
THIS IS A CONSTRUCTED COUNTERFACTUAL. There is NO incident record behind it.
No agency closure log, no ODOT/PBOT bridge-lift record, no fire-district road
closure feed was used, because none exists in this repository for the modelled
window. Every closure below was DRAWN BY A SEEDED PSEUDO-RANDOM GENERATOR from
a pool of real street features, under stated structural rules. The output is a
"what if the network degrades" stress test, not a reconstruction of anything
that happened. Anything written on top of these runs must say so.

What IS real: the street features themselves (Metro RLIS `Streets.dbf`), their
RLIS node ids, their classification, and the fact that the eight named bridges
are the pedestrian-legal Willamette crossings recorded in registry V26. What is
INVENTED: which of them shut, and when.

WHAT IT WRITES
--------------
    Geography/data/closures/closures_E_r<SEED>.csv           (--severity base)
    Geography/data/closures/closures_E_r<SEED>_extreme.csv   (--severity extreme)

Columns, exactly:

    node_a,node_b,activation_hour,label,kind

  node_a / node_b  RLIS PDX_F_NODE / PDX_T_NODE, naming ONE undirected graph
                   edge to block. Written in the RAW attribute-id space of the
                   shapefile (NOT StreetNetwork's corrected graph-id space), so
                   a reader blocks the feature whose {PDX_F_NODE, PDX_T_NODE}
                   set matches, in either order. Every emitted pair is checked
                   to resolve to exactly ONE feature, so the instruction is
                   never ambiguous.
  activation_hour  simulated hour (hour 0 = SmokeField start) at which the edge
                   becomes impassable. Closures are cumulative and never lift.
  label            FULL_NAME verbatim from Streets.dbf - no re-spelling, so the
                   row is greppable straight back to the source attribute.
  kind             "bridge" or "arterial".

A sidecar JSON provenance report (coordinates, RLIS TYPE, lengths, detours,
connectivity numbers, seed, pool sizes) is written next to the run docs; it is
kept OUT of the CSV so the CSV schema stays exactly the five columns above.

SEVERITY
--------
  base     (default)  3 pedestrian-legal Willamette bridges + 15 arterials,
                      ONE wave, all at --wave1-hour (default 79, the main
                      smoke-episode escalation).
  extreme              4 bridges + 30 arterials in TWO waves: 2 bridges + 15
                      arterials at --wave1-hour (79), 2 bridges + 15 arterials
                      at --wave2-hour (150).

RANDOMNESS IS FIXED AND STATED
------------------------------
Site selection uses python's random.Random(--site-seed), default 1 - the same
idiom and the same generator as scripts/build_scenario_crandom_2026.py uses for
its site draws. The seed is printed. The model's own randomSeed (42..50) is a
SEPARATE, unrelated seed set in the batch params file.

THE GRAPH THIS SCRIPT REASONS OVER
----------------------------------
Rebuilt in Python from Geography/data/Streets.dbf (attributes) + Streets.shp
(geometry), mirroring how ContextCreator feeds StreetNetwork:

  * U-27 / registry V26 FREEWAY EXCLUSION IS APPLIED: features with RLIS
    TYPE in {1110, 1120, 1121, 1122, 1123} never enter the graph, exactly as
    ContextCreator.NON_PEDESTRIAN_TYPES does. This is why the Marquam (I-5) and
    Fremont (I-405) bridges CANNOT be closed here: they are not in the walking
    graph at all, so "closing" one would be a silent no-op that weakened the
    scenario while looking like it strengthened it. The script asserts that no
    emitted closure carries a freeway TYPE.
  * node-site clustering identical to StreetNetwork.finaliseGraph: claims of one
    PDX_F_NODE/PDX_T_NODE id within 100 m are one junction; extra sites reattach
    to a coincident primary within 10 m, else split to a negative synthetic id.
  * PROJECTIONS: Streets.prj is Web Mercator METRES. Every shapefile coordinate
    is converted to WGS84 lon/lat on read (merc_to_lonlat) BEFORE anything else,
    because shelter and encampment coordinates are WGS84 degrees. Lengths are
    then computed in metres with a local-radii ellipsoidal metric. Metres and
    degrees are never compared to each other.

  (scripts/test_routing.py build_graphs() builds the same corrected graph but
  does NOT apply the freeway filter, so it is deliberately not reused here.)

HOW BRIDGES ARE IDENTIFIED
--------------------------
Not by name alone, and not by a hand-drawn river centreline. Candidates are
features with RLIS STRUC_TYPE 23 (bridge structure) whose FULL_NAME contains one
of the eight pedestrian-legal Willamette crossings from registry V26 (Broadway,
Steel, Burnside, Morrison, Hawthorne, Tilikum, Sellwood, St Johns). Each
candidate is then subjected to a SEVERANCE TEST: remove it and run a bounded
Dijkstra between its own two endpoints. If the shortest way round exceeds
--sever-detour metres (default 1000) the feature is a genuine choke link of that
crossing - closing it makes the bridge unusable rather than merely diverting
traffic onto a parallel ramp a hundred metres away. The LONGEST surviving
candidate per bridge is the edge that gets closed, and every candidate's
measured detour is printed so the choice is auditable rather than asserted.

Ross Island Bridge is walkable in the graph but is NOT on the V26 legal list and
is therefore never a candidate.

HOW ARTERIALS ARE CHOSEN
------------------------
Uniformly at random, one segment per distinct FULL_NAME (so the draw is 15
different streets, not 15 slices of one), from named non-ramp non-bridge
features of RLIS TYPE 1200/1300/1400 that are at least 60 m long, resolve to
exactly one feature, and have BOTH endpoints inside the demand bounding box.

One further restriction, in the same spirit as the freeway guard: the segment
must lie in the component that actually carries the demand. The graph's other
big component holds 8 of the 3,400 encampment points, so a closure there would
read as severe on paper and change nothing for 99.8% of residents - the same
silent-weakening failure mode as closing a bridge the model already removed.
The bounding box is applied on top of this, not instead of it.

SAFETY CHECK (runs every time; failure re-draws, then aborts)
-------------------------------------------------------------
First, a fact about this graph that the check has to respect. The corrected
pedestrian graph is NOT one connected blob: it has 171 components, and the two
big ones are 59,725 and 27,543 nodes (the model's own manifest,
street_network_validation, records exactly these figures). RLIS carries two
disjoint PDX node-id spaces, and 43 of the 46 shelters sit in the 27,543-node
component while 3 sit in the 59,725-node one. So "is the shelter in the LARGEST
connected component?" is the wrong question - 43 shelters fail it before a single
street is closed. The check therefore asks the question that actually means
"cut off": did the closure shave this shelter off the main body of the component
it was already in?

After a draw, with the closures applied, for EVERY shelter in
Geography/data/shelters/shelters_2026_expanded_plus_new_sites.csv:

  S1  the shelter's snap node retains at least one unblocked incident edge;
  S2  the shelter's snap node is still in the LARGEST POST-CLOSURE FRAGMENT OF
      ITS OWN PRE-CLOSURE COMPONENT - i.e. it was not severed into an orphan
      pocket. For the three shelters already in the graph's largest component
      this is exactly the literal "still in the largest connected component"
      test; for the other 43 it is the same test applied to the component they
      actually live in.
  S3  no encampment demand point loses ALL shelter access - i.e. no residents
      are walled off from every door they could previously walk to.

All three are checked at every cumulative wave state, not just the last.
Closures are monotone so the final state binds, but the intermediate states are
checked anyway rather than argued about. A failure re-draws from the same seeded
stream up to --max-attempts times and then aborts with a non-zero exit code.

The script also reports how many graph nodes lose reachability - defined as
nodes shaved off the main post-closure fragment of their own pre-closure
component, summed over all components - and how many encampment demand points
lose access to at least one shelter they could previously reach. A closure
schedule that strands residents is a modelling artefact, not a finding, and has
to be visible in the numbers rather than discovered later.

Usage:
    python scripts/build_closures_E.py
    python scripts/build_closures_E.py --severity extreme
    python scripts/build_closures_E.py --site-seed 2 --wave1-hour 79

Requires: pyshp.  Reads only; writes the CSV and the sidecar JSON report.
"""

import argparse
import csv
import datetime as _dt
import heapq
import json
import math
import pathlib
import random
import sys
from collections import defaultdict

import shapefile

SCRIPT_VERSION = "1.0.0"
ROOT = pathlib.Path(__file__).resolve().parents[1]
SHP = ROOT / "Geography/data/Streets.shp"
SHX = ROOT / "Geography/data/Streets.shx"
DBF = ROOT / "Geography/data/Streets.dbf"
SHELTERS_CSV = ROOT / "Geography/data/shelters/shelters_2026_expanded_plus_new_sites.csv"
ENCAMPMENTS_CSV = ROOT / "Geography/data/encampments/irp_campsite_reports_sample.csv"
OUT_DIR = ROOT / "Geography/data/closures"
REPORT_DIR = ROOT / "docs/runs/scenario-e-closures"

CSV_COLUMNS = ["node_a", "node_b", "activation_hour", "label", "kind"]

# ---- mirrors of the model's own constants -------------------------------
# ContextCreator.NON_PEDESTRIAN_TYPES (U-27, registry V26)
FREEWAY_TYPES = {1110, 1120, 1121, 1122, 1123}
# StreetNetwork.NODE_SITE_TOLERANCE_M / REATTACH_TOLERANCE_M
CLUSTER_M = 100.0
REATTACH_M = 10.0

# ---- closure-pool rules -------------------------------------------------
BRIDGE_STRUC_TYPE = 23          # RLIS STRUC_TYPE for a bridge structure
# The eight pedestrian-legal Willamette crossings, registry V26 (10-ROUND4-DELTA.md).
# Marquam (I-5) and Fremont (I-405) are absent BY DESIGN: no pedestrian access,
# already removed from the graph by the freeway filter.
LEGAL_BRIDGES = {
    "Broadway Bridge": ("BROADWAY",),
    "Steel Bridge": ("STEEL",),
    "Burnside Bridge": ("BURNSIDE",),
    "Morrison Bridge": ("MORRISON",),
    "Hawthorne Bridge": ("HAWTHORNE",),
    "Tilikum Crossing": ("TILIKUM",),
    "Sellwood Bridge": ("SELLWOOD",),
    "St Johns Bridge": ("ST JOHNS", "ST. JOHNS"),
}
# RLIS arterial classes kept for the arterial pool: 1200 highway (sidewalked
# surface highways such as NW St Helens Rd), 1300 major arterial, 1400 minor
# arterial. Ramp subtypes (1221/1321/1421/1521) and local streets (1450/1500 and
# below) are excluded: ramps are not walkable destinations to close, and closing
# a residential stub is not a "street closure" in any operational sense.
ARTERIAL_TYPES = {1200, 1300, 1400}
MIN_ARTERIAL_LEN_M = 60.0       # a 10 m stub closure is not an incident
PAD_DEG = 0.02                  # demand-bbox pad, identical to build_scenario_c_2026.py

DEFAULT_SEVER_DETOUR_M = 1000.0
SEVER_CAP_M = 20000.0           # bounded-Dijkstra horizon for the severance test

SEVERITY_PLAN = {
    # severity -> list of (wave_index, n_bridges, n_arterials)
    "base": [(1, 3, 15)],
    "extreme": [(1, 2, 15), (2, 2, 15)],
}

# WGS84 ellipsoid + Web Mercator sphere; identical to scripts/test_routing.py
_A = 6378137.0
_F = 1 / 298.257223563
_E2 = _F * (2 - _F)
_RM = 6378137.0


def merc_to_lonlat(x, y):
    """Web Mercator metres (Streets.prj) -> WGS84 degrees (agent/shelter space)."""
    return math.degrees(x / _RM), math.degrees(math.atan(math.sinh(y / _RM)))


def dist_m(a, b):
    """Metres between two WGS84 lon/lat pairs (local-radii equirectangular)."""
    phi = math.radians((a[1] + b[1]) / 2)
    s2 = math.sin(phi) ** 2
    m_rad = _A * (1 - _E2) / (1 - _E2 * s2) ** 1.5
    n_rad = _A / (1 - _E2 * s2) ** 0.5
    dx = math.radians(b[0] - a[0]) * math.cos(phi) * n_rad
    dy = math.radians(b[1] - a[1]) * m_rad
    return math.hypot(dx, dy)


def rel_to_root(path):
    """Repo-relative posix path when possible, absolute otherwise. --out may
    legitimately point outside the repo, and a provenance field is not worth
    crashing over after the CSV has already been written."""
    try:
        return str(pathlib.Path(path).resolve().relative_to(ROOT)).replace("\\", "/")
    except ValueError:
        return str(pathlib.Path(path).resolve()).replace("\\", "/")


class Checks:
    """Same registration idiom as scripts/analyze_run.py."""

    def __init__(self):
        self.results = []

    def add(self, name, ok, detail=""):
        self.results.append({"name": name, "status": "PASS" if ok else "FAIL",
                             "detail": str(detail)})
        return ok

    @property
    def failed(self):
        return [c for c in self.results if c["status"] == "FAIL"]


class DegreeGrid:
    """Exact nearest-neighbour in PLANAR DEGREE space, mirroring
    StreetNetwork.nearestNode's CENTRE_DISTANCE (which also ranks by planar
    Coordinate.distance in degrees, not metres). Bucketed so 3,400 encampments
    against 88,000 nodes is not a 300-million-op scan."""

    def __init__(self, items, cell):
        self.cell = cell
        self.buckets = defaultdict(list)
        for key, (lon, lat) in items:
            self.buckets[(math.floor(lon / cell), math.floor(lat / cell))].append(
                (lon, lat, key))

    def nearest(self, lon, lat):
        cx = math.floor(lon / self.cell)
        cy = math.floor(lat / self.cell)
        best, best_d2, ring = None, math.inf, 0
        while ring <= 4096:
            for ix in range(cx - ring, cx + ring + 1):
                for iy in range(cy - ring, cy + ring + 1):
                    if ring and abs(ix - cx) != ring and abs(iy - cy) != ring:
                        continue
                    for blon, blat, key in self.buckets.get((ix, iy), ()):
                        d2 = (blon - lon) ** 2 + (blat - lat) ** 2
                        if d2 < best_d2:
                            best_d2, best = d2, key
            # Anything not yet scanned sits in a cell at ring >= ring+1, whose
            # nearest edge is at least ring*cell away; so once the incumbent is
            # closer than that, it is the exact nearest.
            if best is not None and math.sqrt(best_d2) <= ring * self.cell:
                return best, math.sqrt(best_d2)
            ring += 1
        return best, math.sqrt(best_d2) if best is not None else math.inf


# --------------------------------------------------------------------------
# graph construction
# --------------------------------------------------------------------------

def load_features():
    """Read Streets.dbf attributes + Streets.shp geometry through pyshp,
    applying the U-27 freeway exclusion. Returns (features, stats).

    A feature is a dict; only endpoints, midpoint and geodesic length are kept
    (the full polylines would be ~2 M coordinate tuples for no benefit here)."""
    sf = shapefile.Reader(shp=str(SHP), shx=str(SHX), dbf=str(DBF))
    names = [f[0] for f in sf.fields[1:]]
    idx = {n: i for i, n in enumerate(names)}
    for req in ("PDX_F_NODE", "PDX_T_NODE", "TYPE", "FULL_NAME", "STRUC_TYPE"):
        if req not in idx:
            sys.exit(f"ERROR: {DBF.name} has no attribute {req!r}; fields = {names}")

    feats = []
    stats = {"records": len(sf), "freeway_excluded": 0, "freeway_excluded_by_type":
             defaultdict(int), "freeway_excluded_km": 0.0, "no_geometry": 0,
             "no_node_ids": 0}
    for sr in sf.iterShapeRecords():
        rec, pts = sr.record, sr.shape.points
        type_code = rec[idx["TYPE"]]
        if len(pts) < 2:
            stats["no_geometry"] += 1
            continue
        lonlat = [merc_to_lonlat(x, y) for x, y in pts]
        length_m = sum(dist_m(lonlat[i - 1], lonlat[i]) for i in range(1, len(lonlat)))
        if type_code in FREEWAY_TYPES:
            # U-27: never enters the pedestrian graph, so it can never be closed.
            stats["freeway_excluded"] += 1
            stats["freeway_excluded_by_type"][type_code] += 1
            stats["freeway_excluded_km"] += length_m / 1000.0
            continue
        f_node, t_node = rec[idx["PDX_F_NODE"]], rec[idx["PDX_T_NODE"]]
        if f_node is None or t_node is None:
            stats["no_node_ids"] += 1
            continue
        feats.append({
            "attr_f": int(f_node),
            "attr_t": int(t_node),
            "p0": lonlat[0],
            "p1": lonlat[-1],
            "mid": lonlat[len(lonlat) // 2],
            "length_m": length_m,
            "name": (rec[idx["FULL_NAME"]] or "").strip(),
            "type": type_code,
            "struc": rec[idx["STRUC_TYPE"]],
        })
    stats["freeway_excluded_by_type"] = dict(sorted(
        stats["freeway_excluded_by_type"].items()))
    return feats, stats


def build_graph(feats):
    """Mirror of StreetNetwork.finaliseGraph: cluster node-site claims at 100 m,
    reattach coincident extras within 10 m, split the rest to negative synthetic
    ids. Returns (adjacency, coords, pair_features, stats).

      adjacency      graph_id -> [(neighbour_graph_id, length_m, pair_key)]
      coords         graph_id -> (lon, lat) WGS84
      pair_features  pair_key -> [feature, ...]      pair_key = sorted attr ids
    """
    sites, order = {}, []
    for ft in feats:
        for attr, endpoint in ((ft["attr_f"], ft["p0"]), (ft["attr_t"], ft["p1"])):
            claims = sites.setdefault(attr, [])
            if not claims:
                order.append(attr)
            if not any(dist_m(endpoint, c[0]) <= CLUSTER_M for c in claims):
                claims.append([endpoint, None])

    primaries = []
    for attr in order:
        sites[attr][0][1] = attr
        primaries.append((attr, sites[attr][0][0]))
    primary_grid = DegreeGrid(primaries, cell=0.0004)   # ~35 m cells >> 10 m reattach
    primary_coord = dict(primaries)

    synthetic, reattached, split = -1000, 0, 0
    for attr in order:
        for site in sites[attr][1:]:
            near, _ = primary_grid.nearest(*site[0])
            if near is not None and dist_m(site[0], primary_coord[near]) <= REATTACH_M:
                site[1] = near
                reattached += 1
            else:
                site[1] = synthetic
                synthetic -= 1
                split += 1

    coords = {}
    for attr in order:
        for anchor, gid in sites[attr]:
            coords.setdefault(gid, anchor)

    def resolve(attr, endpoint):
        for anchor, gid in sites[attr]:
            if dist_m(endpoint, anchor) <= CLUSTER_M:
                return gid
        raise AssertionError(f"unresolved endpoint for attribute node id {attr}")

    adjacency = defaultdict(list)
    pair_features = defaultdict(list)
    for ft in feats:
        ga, gb = resolve(ft["attr_f"], ft["p0"]), resolve(ft["attr_t"], ft["p1"])
        key = (min(ft["attr_f"], ft["attr_t"]), max(ft["attr_f"], ft["attr_t"]))
        ft["pair_key"] = key
        ft["g_from"], ft["g_to"] = ga, gb
        pair_features[key].append(ft)
        adjacency[ga].append((gb, ft["length_m"], key))
        adjacency[gb].append((ga, ft["length_m"], key))

    stats = {"features": len(feats), "nodes": len(coords),
             "undirected_edges": sum(len(v) for v in adjacency.values()) // 2,
             "corrected_sites": reattached + split, "reattached_sites": reattached,
             "split_sites": split,
             "ambiguous_node_pairs": sum(1 for v in pair_features.values() if len(v) > 1)}
    return adjacency, coords, pair_features, stats


def component_map(adjacency, blocked):
    """Connected components with `blocked` pair keys cut.

    Returns (node -> component index, [component node-set, ...]) in discovery
    order. Discovery order is dict-insertion order over `adjacency`, which is
    feature order in the shapefile, so it is deterministic."""
    cid, comps = {}, []
    for start in adjacency:
        if start in cid:
            continue
        idx = len(comps)
        cid[start] = idx
        stack, comp = [start], set()
        while stack:
            node = stack.pop()
            comp.add(node)
            for nbr, _, key in adjacency[node]:
                if key in blocked or nbr in cid:
                    continue
                cid[nbr] = idx
                stack.append(nbr)
        comps.append(comp)
    return cid, comps


def detour_m(adjacency, src, dst, blocked, cap):
    """Bounded Dijkstra; math.inf means 'no route within cap metres'."""
    dist = {src: 0.0}
    queue = [(0.0, src)]
    while queue:
        d, node = heapq.heappop(queue)
        if node == dst:
            return d
        if d > dist.get(node, math.inf):
            continue
        for nbr, w, key in adjacency.get(node, ()):
            if key in blocked:
                continue
            nd = d + w
            if nd > cap or nd >= dist.get(nbr, math.inf):
                continue
            dist[nbr] = nd
            heapq.heappush(queue, (nd, nbr))
    return math.inf


# --------------------------------------------------------------------------
# pools
# --------------------------------------------------------------------------

def discover_bridges(adjacency, feats, pair_features, sever_detour_m):
    """Return (chosen, audit_rows). One closable edge per pedestrian-legal
    Willamette bridge, chosen by the severance test described in the docstring."""
    audit_rows, by_bridge = [], defaultdict(list)
    for ft in feats:
        if ft["struc"] != BRIDGE_STRUC_TYPE or not ft["name"]:
            continue
        upper = ft["name"].upper()
        bridge = next((b for b, toks in LEGAL_BRIDGES.items()
                       if any(t in upper for t in toks)), None)
        if bridge is None:
            continue
        d = detour_m(adjacency, ft["g_from"], ft["g_to"], {ft["pair_key"]}, SEVER_CAP_M)
        severs = d > sever_detour_m
        audit_rows.append({"bridge": bridge, "label": ft["name"], "type": ft["type"],
                           "node_a": ft["pair_key"][0], "node_b": ft["pair_key"][1],
                           "length_m": round(ft["length_m"], 1),
                           "detour_m": None if math.isinf(d) else round(d, 1),
                           "features_on_pair": len(pair_features[ft["pair_key"]]),
                           "severs": bool(severs)})
        if severs and len(pair_features[ft["pair_key"]]) == 1:
            by_bridge[bridge].append(ft)

    chosen = {}
    for bridge, cands in by_bridge.items():
        # longest severing deck feature; pair_key breaks any length tie.
        chosen[bridge] = max(cands, key=lambda f: (f["length_m"], f["pair_key"]))
    audit_rows.sort(key=lambda r: (r["bridge"], -r["length_m"]))
    return chosen, audit_rows


def arterial_pool(feats, pair_features, coords, bbox, pool_nodes):
    """Named arterial edges wholly inside the demand bounding box, restricted to
    `pool_nodes` (the component that actually carries the demand). Closing a
    street elsewhere in the graph would be a decorative no-op."""
    lo_lon, hi_lon, lo_lat, hi_lat = bbox
    pool = defaultdict(list)
    for ft in feats:
        if ft["type"] not in ARTERIAL_TYPES or ft["struc"] == BRIDGE_STRUC_TYPE:
            continue
        name = ft["name"]
        upper = name.upper()
        if not name or " RAMP" in upper or "BRG" in upper or "UNNAMED" in upper:
            continue
        if ft["length_m"] < MIN_ARTERIAL_LEN_M:
            continue
        if len(pair_features[ft["pair_key"]]) != 1:
            continue                                   # ambiguous instruction
        if ft["g_from"] not in pool_nodes or ft["g_to"] not in pool_nodes:
            continue
        inside = True
        for gid in (ft["g_from"], ft["g_to"]):
            lon, lat = coords[gid]
            if not (lo_lon <= lon <= hi_lon and lo_lat <= lat <= hi_lat):
                inside = False
                break
        if inside:
            pool[name].append(ft)
    for name in pool:
        pool[name].sort(key=lambda f: f["pair_key"])
    return pool


# --------------------------------------------------------------------------
# draw + safety
# --------------------------------------------------------------------------

def draw_schedule(rng, plan, bridge_choices, art_pool, wave_hours):
    """One attempt. Returns the closure rows (dicts) for all waves."""
    bridges_left = sorted(bridge_choices)
    names_left = sorted(art_pool)
    rows = []
    for wave, n_bridges, n_arterials in plan:
        hour = wave_hours[wave]
        picked_bridges = rng.sample(bridges_left, n_bridges)
        for b in picked_bridges:
            bridges_left.remove(b)
        picked_names = rng.sample(names_left, n_arterials)
        for n in picked_names:
            names_left.remove(n)
        for b in sorted(picked_bridges):
            ft = bridge_choices[b]
            rows.append({"feature": ft, "kind": "bridge", "wave": wave,
                         "activation_hour": hour, "bridge": b})
        for n in sorted(picked_names):
            ft = rng.choice(art_pool[n])
            rows.append({"feature": ft, "kind": "arterial", "wave": wave,
                         "activation_hour": hour, "bridge": None})
    return rows


def safety_check(adjacency, incident, rows, plan, wave_hours, shelter_nodes,
                 encampment_nodes, pre_cid, pre_comps):
    """S1/S2/S3 at every cumulative wave state. Returns (ok, gates)."""
    gates, ok = [], True
    waves = sorted({w for w, _, _ in plan})

    pre_shelters_by_comp = defaultdict(int)
    for node in shelter_nodes.values():
        pre_shelters_by_comp[pre_cid[node]] += 1

    for wave in waves:
        blocked = {r["feature"]["pair_key"] for r in rows if r["wave"] <= wave}
        post_cid, post_comps = component_map(adjacency, blocked)

        # Post-closure components refine pre-closure ones. For each pre-closure
        # component, its MAIN fragment is the biggest piece it survives as; a
        # node outside that piece has lost reachability.
        frag = defaultdict(lambda: defaultdict(int))
        for node, q in post_cid.items():
            frag[pre_cid[node]][q] += 1
        main_frag = {p: max(sorted(d), key=lambda q: (d[q], -q))
                     for p, d in frag.items()}
        lost_nodes = sum(len(pre_comps[p]) - frag[p][main_frag[p]] for p in frag)
        split_comps = sum(1 for p in frag if len(frag[p]) > 1)

        stranded = sorted(sid for sid, node in shelter_nodes.items()
                          if not (incident[node] - blocked))
        severed = sorted(sid for sid, node in shelter_nodes.items()
                         if post_cid[node] != main_frag[pre_cid[node]])

        post_shelters_by_comp = defaultdict(int)
        for node in shelter_nodes.values():
            post_shelters_by_comp[post_cid[node]] += 1
        camps_lost_all, camps_lost_some, pairs_lost = 0, 0, 0
        for node in encampment_nodes.values():
            before = pre_shelters_by_comp[pre_cid[node]]
            after = post_shelters_by_comp[post_cid[node]]
            pairs_lost += before - after
            if after < before:
                camps_lost_some += 1
            if before > 0 and after == 0:
                camps_lost_all += 1

        gates.append({
            "wave": wave, "hour": wave_hours[wave], "edges_blocked": len(blocked),
            "shelters_with_no_unblocked_incident_edge": stranded,
            "shelters_severed_from_their_component": severed,
            "components_before": len(pre_comps),
            "components_after": len(post_comps),
            "components_split_by_the_closures": split_comps,
            "nodes_losing_reachability": lost_nodes,
            "graph_nodes_total": len(pre_cid),
            "encampment_points_total": len(encampment_nodes),
            "encampment_points_losing_some_shelter_access": camps_lost_some,
            "encampment_points_losing_all_shelter_access": camps_lost_all,
            "encampment_shelter_pairs_lost": pairs_lost,
        })
        if stranded or severed or camps_lost_all:
            ok = False
    return ok, gates


# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--severity", choices=sorted(SEVERITY_PLAN), default="base")
    ap.add_argument("--site-seed", type=int, default=1,
                    help="python random.Random seed for the closure draw (default 1)")
    ap.add_argument("--wave1-hour", type=int, default=79,
                    help="simulated hour of wave 1 (default 79, main-episode escalation)")
    ap.add_argument("--wave2-hour", type=int, default=150,
                    help="simulated hour of wave 2, extreme severity only (default 150)")
    ap.add_argument("--sever-detour", type=float, default=DEFAULT_SEVER_DETOUR_M,
                    help="metres of detour a bridge feature must force to count as a "
                         "genuine choke link (default 1000)")
    ap.add_argument("--max-attempts", type=int, default=25,
                    help="seeded re-draws allowed before aborting (default 25)")
    ap.add_argument("--out", default=None, help="override the output CSV path")
    args = ap.parse_args()

    plan = SEVERITY_PLAN[args.severity]
    wave_hours = {1: args.wave1_hour, 2: args.wave2_hour}
    n_bridges = sum(b for _, b, _ in plan)
    n_arterials = sum(a for _, _, a in plan)
    stamp = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    print(f"build_closures_E v{SCRIPT_VERSION} @ {stamp}")
    print("SCENARIO E CLOSURE SCHEDULE - CONSTRUCTED COUNTERFACTUAL.")
    print("  No incident record exists for these closures. They are drawn by a seeded")
    print("  PRNG from real RLIS street features under stated rules; the features and")
    print("  their node ids are real, WHICH ones shut and WHEN is invented.")
    print(f"severity      : {args.severity}  ({n_bridges} bridges + {n_arterials} arterials, "
          f"{len(plan)} wave(s))")
    print(f"SITE SEED     : {args.site_seed}   (python random.Random({args.site_seed}) - "
          f"same idiom as build_scenario_crandom_2026.py)")
    print("waves         : " + ", ".join(
        f"wave {w} -> hour {wave_hours[w]} ({b} bridges + {a} arterials)"
        for w, b, a in plan))

    # ---- graph ----------------------------------------------------------
    print(f"\nreading {DBF.name} + {SHP.name} (Web Mercator metres -> WGS84 degrees) ...")
    feats, load_stats = load_features()
    print(f"  {load_stats['records']} records; U-27 freeway filter removed "
          f"{load_stats['freeway_excluded']} features "
          f"({load_stats['freeway_excluded_km']:.1f} km) by RLIS TYPE "
          f"{load_stats['freeway_excluded_by_type']}")
    print(f"  {len(feats)} walkable features retained "
          f"({load_stats['no_geometry']} skipped for <2 vertices, "
          f"{load_stats['no_node_ids']} for missing PDX node ids)")
    adjacency, coords, pair_features, gstats = build_graph(feats)
    print(f"  corrected graph: {gstats['nodes']} nodes, {gstats['undirected_edges']} "
          f"undirected edges; {gstats['corrected_sites']} corrected node sites "
          f"({gstats['reattached_sites']} reattached <= {REATTACH_M:.0f} m, "
          f"{gstats['split_sites']} split to synthetic ids)")
    print(f"  node pairs carrying more than one feature: {gstats['ambiguous_node_pairs']} "
          f"(never closable - the instruction would be ambiguous)")

    pre_cid, pre_comps = component_map(adjacency, set())
    sizes = sorted((len(c) for c in pre_comps), reverse=True)
    print(f"  {len(pre_comps)} connected components before any closure; "
          f"largest {sizes[:4]} ... smallest {sizes[-1]}")
    print("  NOTE: this graph is not one blob. RLIS carries two disjoint PDX node-id "
          "spaces, so the")
    print("  two big components are separate street systems. 'Largest component' is "
          "therefore NOT a")
    print("  usable safety yardstick on its own - see the per-component check below.")
    incident = defaultdict(set)
    for node, edges in adjacency.items():
        for _, _, key in edges:
            incident[node].add(key)

    # ---- demand bounding box -------------------------------------------
    with open(ENCAMPMENTS_CSV, encoding="utf-8-sig") as fh:
        camps = [(float(r["lon"]), float(r["lat"])) for r in csv.DictReader(fh)
                 if r.get("lon") and r.get("lat")]
    bbox = (min(p[0] for p in camps) - PAD_DEG, max(p[0] for p in camps) + PAD_DEG,
            min(p[1] for p in camps) - PAD_DEG, max(p[1] for p in camps) + PAD_DEG)

    def pctl(vals, p):
        s = sorted(vals)
        return s[min(len(s) - 1, max(0, int(round(p * (len(s) - 1)))))]

    core = (pctl([p[0] for p in camps], 0.05), pctl([p[0] for p in camps], 0.95),
            pctl([p[1] for p in camps], 0.05), pctl([p[1] for p in camps], 0.95))
    print(f"\ndemand bounding box from {len(camps)} encampment points "
          f"(+/- {PAD_DEG} deg pad, as build_scenario_c_2026.py):")
    print(f"  lon [{bbox[0]:.5f},{bbox[1]:.5f}]  lat [{bbox[2]:.5f},{bbox[3]:.5f}]")
    print(f"  p05-p95 demand core (for reference only, NOT a draw constraint): "
          f"lon [{core[0]:.5f},{core[1]:.5f}]  lat [{core[2]:.5f},{core[3]:.5f}]")
    print("  the box is several times the area of the core, so a uniform draw lands mostly "
          "outside it -")
    print("  same known weakness as build_scenario_crandom_2026.py; the count is reported "
          "below, not hidden.")

    # ---- snap shelters + encampments ------------------------------------
    node_grid = DegreeGrid(list(coords.items()), cell=0.004)
    with open(SHELTERS_CSV, encoding="utf-8-sig") as fh:
        shelter_rows = list(csv.DictReader(fh))
    shelter_nodes, max_snap = {}, 0.0
    for r in shelter_rows:
        gid, d_deg = node_grid.nearest(float(r["lon"]), float(r["lat"]))
        shelter_nodes[r["shelter_id"]] = gid
        max_snap = max(max_snap, dist_m((float(r["lon"]), float(r["lat"])), coords[gid]))
    encampment_nodes = {}
    for i, (lon, lat) in enumerate(camps):
        encampment_nodes[i] = node_grid.nearest(lon, lat)[0]
    print(f"snapped {len(shelter_nodes)} shelters from {SHELTERS_CSV.name} "
          f"(max snap gap {max_snap:.1f} m) and {len(encampment_nodes)} encampment points")

    # ---- pre-closure component structure (the baseline the check is against) --
    shelter_comp = defaultdict(list)
    for sid, node in shelter_nodes.items():
        shelter_comp[pre_cid[node]].append(sid)
    camp_comp = defaultdict(int)
    for node in encampment_nodes.values():
        camp_comp[pre_cid[node]] += 1
    serving = sorted(c for c in shelter_comp if camp_comp.get(c))
    primary = max(camp_comp, key=lambda c: (camp_comp[c], -c))
    pool_nodes = pre_comps[primary]
    print("pre-closure component structure (components holding shelters):")
    for c in sorted(shelter_comp, key=lambda c: -len(pre_comps[c])):
        tag = ("  <- PRIMARY DEMAND COMPONENT" if c == primary
               else "  <- holds demand" if c in serving else "  <- no demand")
        print(f"  component #{c}: {len(pre_comps[c])} nodes, {len(shelter_comp[c])} shelters, "
              f"{camp_comp.get(c, 0)} encampment points{tag}")
    print(f"  arterial closures are drawn ONLY from component #{primary} "
          f"({len(pool_nodes)} nodes, {camp_comp[primary]} of {len(encampment_nodes)} "
          f"demand points = "
          f"{100.0 * camp_comp[primary] / len(encampment_nodes):.1f}%).")
    print("  Same principle as the freeway guard: an edge in a component holding a "
          "fraction of a percent")
    print("  of the demand is a closure that looks severe on paper and changes nothing "
          "for 99% of")
    print("  residents. The bounding-box rule is still applied on top of this.")

    pre = Checks()
    pre.add("at least one component holds both shelters and encampment demand",
            bool(serving), f"serving components {serving}")
    pre.add("every shelter has at least one incident street edge before closures",
            all(incident[n] for n in shelter_nodes.values()),
            f"{sum(1 for n in shelter_nodes.values() if not incident[n])} isolated")
    if pre.failed:
        for c in pre.failed:
            print(f"  FAIL {c['name']}: {c['detail']}")
        sys.exit("ABORT: the street graph fails its preconditions before any closure is "
                 "applied; fix the graph, not the closure draw.")

    # ---- bridge pool ----------------------------------------------------
    print(f"\nbridge severance test (RLIS STRUC_TYPE {BRIDGE_STRUC_TYPE} decks named on the "
          f"V26 pedestrian-legal list; a feature is a choke link if removing it forces a "
          f"detour > {args.sever_detour:.0f} m between its own endpoints):")
    bridge_choices, bridge_audit = discover_bridges(adjacency, feats, pair_features,
                                                    args.sever_detour)
    print(f"  {'bridge':<18s} {'label':<22s} {'node_a':>8s} {'node_b':>8s} "
          f"{'len_m':>7s} {'detour_m':>9s}  severs")
    for r in bridge_audit:
        det = "inf" if r["detour_m"] is None else f"{r['detour_m']:.0f}"
        print(f"  {r['bridge']:<18s} {r['label']:<22s} {r['node_a']:>8d} {r['node_b']:>8d} "
              f"{r['length_m']:>7.0f} {det:>9s}  {'yes' if r['severs'] else 'no'}")
    print(f"  -> {len(bridge_choices)} of {len(LEGAL_BRIDGES)} legal bridges have a "
          f"closable choke link:")
    for b in sorted(bridge_choices):
        ft = bridge_choices[b]
        print(f"     {b:<18s} {ft['name']:<22s} {ft['pair_key'][0]}-{ft['pair_key'][1]}  "
              f"{ft['length_m']:.0f} m  TYPE {ft['type']}")
    print("  Marquam (I-5) and Fremont (I-405) are NOT candidates: the U-27 freeway "
          "filter already removed them, so closing one would be a silent no-op.")
    if len(bridge_choices) < n_bridges:
        sys.exit(f"ABORT: severity {args.severity} needs {n_bridges} bridges but only "
                 f"{len(bridge_choices)} legal crossings have a closable choke link.")

    # ---- arterial pool ---------------------------------------------------
    art_pool = arterial_pool(feats, pair_features, coords, bbox, pool_nodes)
    n_seg = sum(len(v) for v in art_pool.values())
    print(f"\narterial pool: {n_seg} closable segments on {len(art_pool)} distinct named "
          f"streets (RLIS TYPE {sorted(ARTERIAL_TYPES)}, >= {MIN_ARTERIAL_LEN_M:.0f} m, "
          f"both ends inside the demand bbox and in component #{primary}; ramps, bridge "
          f"decks and unnamed features excluded)")
    if len(art_pool) < n_arterials:
        sys.exit(f"ABORT: severity {args.severity} needs {n_arterials} distinct arterial "
                 f"streets but the pool has {len(art_pool)}.")

    # ---- seeded draw with safety-driven re-draw --------------------------
    rng = random.Random(args.site_seed)
    rows = gates = None
    for attempt in range(1, args.max_attempts + 1):
        cand = draw_schedule(rng, plan, bridge_choices, art_pool, wave_hours)
        ok, cand_gates = safety_check(adjacency, incident, cand, plan, wave_hours,
                                      shelter_nodes, encampment_nodes, pre_cid, pre_comps)
        if ok:
            rows, gates = cand, cand_gates
            print(f"\nseeded draw accepted on attempt {attempt} of {args.max_attempts} "
                  f"(site-seed {args.site_seed})")
            break
        bad = sorted({s for g in cand_gates
                      for s in g["shelters_with_no_unblocked_incident_edge"]
                      + g["shelters_severed_from_their_component"]})
        camps = max(g["encampment_points_losing_all_shelter_access"] for g in cand_gates)
        print(f"  attempt {attempt}: REJECTED - would cut off {len(bad)} shelter(s) "
              f"[{', '.join(bad[:6])}{' ...' if len(bad) > 6 else ''}] and strand "
              f"{camps} encampment point(s) from every shelter; re-drawing")
    else:
        sys.exit(f"ABORT: {args.max_attempts} seeded draws all cut a shelter or an "
                 f"encampment off the street network. Nothing was written. Widen the "
                 f"arterial pool, lower the severity, or change --site-seed - do not "
                 f"disable the safety check.")

    # ---- final gates -----------------------------------------------------
    ck = Checks()
    ck.add("no closure carries a freeway RLIS TYPE (U-27 / V26)",
           all(r["feature"]["type"] not in FREEWAY_TYPES for r in rows),
           f"types {sorted({r['feature']['type'] for r in rows})}")
    ck.add("every closed node pair resolves to exactly one street feature",
           all(len(pair_features[r["feature"]["pair_key"]]) == 1 for r in rows),
           f"{sum(1 for r in rows if len(pair_features[r['feature']['pair_key']]) != 1)} ambiguous")
    ck.add("every bridge closure is on the V26 pedestrian-legal list",
           all(r["bridge"] in LEGAL_BRIDGES for r in rows if r["kind"] == "bridge"),
           f"{sorted({r['bridge'] for r in rows if r['kind'] == 'bridge'})}")
    ck.add("every bridge closure actually severs its crossing",
           all(detour_m(adjacency, r["feature"]["g_from"], r["feature"]["g_to"],
                        {r["feature"]["pair_key"]}, SEVER_CAP_M) > args.sever_detour
               for r in rows if r["kind"] == "bridge"),
           f"threshold {args.sever_detour:.0f} m")
    ck.add("no duplicate closed edge", len({r["feature"]["pair_key"] for r in rows}) == len(rows),
           f"{len(rows)} rows, {len({r['feature']['pair_key'] for r in rows})} distinct pairs")
    ck.add("every arterial closure lies inside the demand bounding box",
           all(bbox[0] <= coords[g][0] <= bbox[1] and bbox[2] <= coords[g][1] <= bbox[3]
               for r in rows if r["kind"] == "arterial"
               for g in (r["feature"]["g_from"], r["feature"]["g_to"])), str(bbox))
    ck.add("closure count matches the severity plan",
           sum(1 for r in rows if r["kind"] == "bridge") == n_bridges
           and sum(1 for r in rows if r["kind"] == "arterial") == n_arterials,
           f"{sum(1 for r in rows if r['kind'] == 'bridge')} bridges, "
           f"{sum(1 for r in rows if r['kind'] == 'arterial')} arterials")
    for g in gates:
        ck.add(f"S1 wave {g['wave']} (hour {g['hour']}): every shelter keeps an unblocked "
               f"incident edge",
               not g["shelters_with_no_unblocked_incident_edge"],
               f"{len(g['shelters_with_no_unblocked_incident_edge'])} of {len(shelter_nodes)} "
               f"stranded")
        ck.add(f"S2 wave {g['wave']} (hour {g['hour']}): every shelter stays in the largest "
               f"post-closure fragment of its own pre-closure component",
               not g["shelters_severed_from_their_component"],
               f"{len(g['shelters_severed_from_their_component'])} of {len(shelter_nodes)} "
               f"severed")
        ck.add(f"S3 wave {g['wave']} (hour {g['hour']}): no encampment demand point loses "
               f"ALL shelter access",
               g["encampment_points_losing_all_shelter_access"] == 0,
               f"{g['encampment_points_losing_all_shelter_access']} of "
               f"{g['encampment_points_total']} walled off")

    # ---- summary table ---------------------------------------------------
    rows.sort(key=lambda r: (r["activation_hour"], r["kind"] != "bridge",
                             r["feature"]["name"], r["feature"]["pair_key"]))
    print(f"\nCLOSURE SCHEDULE - {len(rows)} edges "
          f"({n_bridges} bridges, {n_arterials} arterials), severity {args.severity}, "
          f"site-seed {args.site_seed}")
    print(f"  {'hour':>4s}  {'kind':<8s} {'node_a':>8s} {'node_b':>8s}  {'label':<34s} "
          f"{'TYPE':>5s} {'len_m':>7s}")
    for r in rows:
        ft = r["feature"]
        print(f"  {r['activation_hour']:>4d}  {r['kind']:<8s} {ft['pair_key'][0]:>8d} "
              f"{ft['pair_key'][1]:>8d}  {ft['name']:<34s} {ft['type']:>5d} "
              f"{ft['length_m']:>7.0f}")
    in_core = sum(1 for r in rows if r["kind"] == "arterial"
                  and core[0] <= r["feature"]["mid"][0] <= core[1]
                  and core[2] <= r["feature"]["mid"][1] <= core[3])
    print(f"  arterials falling inside the p05-p95 demand core: {in_core} of {n_arterials} "
          f"- the rest are periphery draws (stated weakness, not a surprise)")

    # ---- connectivity numbers -------------------------------------------
    print("\nCONNECTIVITY SAFETY CHECK (closures cumulative; every wave state tested)")
    for g in gates:
        print(f"  after wave {g['wave']} (hour {g['hour']}, {g['edges_blocked']} edges blocked):")
        print(f"    connected components {g['components_before']} -> {g['components_after']} "
              f"({g['components_split_by_the_closures']} pre-closure component(s) split)")
        print(f"    graph NODES LOSING REACHABILITY: {g['nodes_losing_reachability']} of "
              f"{g['graph_nodes_total']}  (nodes shaved off the main post-closure fragment "
              f"of their own pre-closure component)")
        print(f"    encampment demand points losing access to >=1 shelter: "
              f"{g['encampment_points_losing_some_shelter_access']} of "
              f"{g['encampment_points_total']}  "
              f"(encampment-shelter pairs lost: {g['encampment_shelter_pairs_lost']})")
        print(f"    encampment demand points losing ALL shelter access (S3): "
              f"{g['encampment_points_losing_all_shelter_access']} of "
              f"{g['encampment_points_total']}")
        print(f"    shelters with no unblocked incident edge (S1): "
              f"{len(g['shelters_with_no_unblocked_incident_edge'])} of {len(shelter_nodes)}")
        print(f"    shelters severed from their own component (S2): "
              f"{len(g['shelters_severed_from_their_component'])} of {len(shelter_nodes)}")

    n_fail = len(ck.failed)
    print(f"\n  safety gate: {len(ck.results) - n_fail}/{len(ck.results)} checks passed")
    for c in ck.failed:
        print(f"  FAIL {c['name']}: {c['detail']}")
    if n_fail:
        sys.exit("ABORT: safety gate failed after the draw was accepted - nothing written. "
                 "This is a bug in the generator, not a tuning knob.")

    # ---- write -----------------------------------------------------------
    suffix = "" if args.severity == "base" else f"_{args.severity}"
    out = pathlib.Path(args.out) if args.out else \
        OUT_DIR / f"closures_E_r{args.site_seed}{suffix}.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        w.writeheader()
        for r in rows:
            ft = r["feature"]
            w.writerow({"node_a": ft["pair_key"][0], "node_b": ft["pair_key"][1],
                        "activation_hour": r["activation_hour"],
                        "label": ft["name"], "kind": r["kind"]})
    print(f"\nwrote {out}")

    report = {
        "schema": "reu-wildfire-shelter-abm/scenario-e-closures/v1",
        "generated_utc": stamp,
        "generator": f"scripts/build_closures_E.py v{SCRIPT_VERSION}",
        "status": "CONSTRUCTED COUNTERFACTUAL - NO INCIDENT RECORD EXISTS",
        "provenance_note": (
            "The street features, their RLIS PDX node ids, their classification and the "
            "eight pedestrian-legal Willamette crossings are real (Metro RLIS Streets.dbf; "
            "registry V26). WHICH features close and WHEN is invented: drawn by "
            f"python random.Random({args.site_seed}) from the pools described below. No "
            "agency closure log was used because none exists in this repository for the "
            "modelled window. Results built on this file are a network-degradation stress "
            "test, not a reconstruction of a real event."),
        "severity": args.severity,
        "site_seed": args.site_seed,
        "site_selection_rng": f"python random.Random({args.site_seed})",
        "waves": [{"wave": w_, "activation_hour": wave_hours[w_], "bridges": b, "arterials": a}
                  for w_, b, a in plan],
        "output_csv": rel_to_root(out),
        "csv_columns": CSV_COLUMNS,
        "graph": {
            "source_attributes": "Geography/data/Streets.dbf",
            "source_geometry": "Geography/data/Streets.shp (Web Mercator metres -> WGS84)",
            "freeway_filter_applied": sorted(FREEWAY_TYPES),
            "freeway_features_excluded": load_stats["freeway_excluded"],
            "freeway_km_excluded": round(load_stats["freeway_excluded_km"], 1),
            "walkable_features": gstats["features"],
            "nodes": gstats["nodes"],
            "undirected_edges": gstats["undirected_edges"],
            "corrected_node_sites": gstats["corrected_sites"],
            "components": len(pre_comps),
            "component_sizes_top5": sizes[:5],
            "note": ("matches the model's own street_network_validation block in "
                     "simulation.json (features, nodes, corrected sites, components, "
                     "largest component) - this Python graph is a mirror, not a "
                     "reimplementation with its own answer"),
        },
        "shelter_components": {
            "shelters_total": len(shelter_nodes),
            "by_pre_closure_component": [
                {"component": c, "nodes": len(pre_comps[c]),
                 "shelters": len(shelter_comp[c]),
                 "encampment_points": camp_comp.get(c, 0),
                 "demand_serving": c in serving}
                for c in sorted(shelter_comp, key=lambda c: -len(pre_comps[c]))],
            "why_not_largest_component": (
                "43 of 46 shelters sit in the 27,543-node component, not the 59,725-node "
                "one, because RLIS carries two disjoint PDX node-id spaces. A literal "
                "'still in the largest connected component' gate fails 43 shelters before "
                "any street is closed, so S2 is applied per pre-closure component."),
        },
        "demand_bounding_box": {"lon": [bbox[0], bbox[1]], "lat": [bbox[2], bbox[3]],
                                "pad_deg": PAD_DEG,
                                "encampment_points": len(camps),
                                "p05_p95_core_lon": [core[0], core[1]],
                                "p05_p95_core_lat": [core[2], core[3]],
                                "arterials_drawn_inside_the_core": in_core,
                                "source": "Geography/data/encampments/irp_campsite_reports_sample.csv"},
        "bridge_pool": {
            "legal_list_source": "registry V26 (10-ROUND4-DELTA.md)",
            "legal_bridges": sorted(LEGAL_BRIDGES),
            "sever_detour_threshold_m": args.sever_detour,
            "candidates": bridge_audit,
            "closable": {b: {"label": f["name"], "node_a": f["pair_key"][0],
                             "node_b": f["pair_key"][1], "type": f["type"],
                             "length_m": round(f["length_m"], 1),
                             "midpoint_lonlat": [round(f["mid"][0], 6), round(f["mid"][1], 6)]}
                         for b, f in sorted(bridge_choices.items())},
            "never_closable": ("Marquam (I-5) and Fremont (I-405): freeway TYPE, removed "
                               "from the pedestrian graph by U-27, so closing them would "
                               "be a no-op. Ross Island Bridge: walkable but not on the "
                               "V26 pedestrian-legal list."),
        },
        "arterial_pool": {"rlis_types": sorted(ARTERIAL_TYPES),
                          "min_length_m": MIN_ARTERIAL_LEN_M,
                          "distinct_named_streets": len(art_pool),
                          "closable_segments": n_seg,
                          "restricted_to_component": primary,
                          "component_demand_share": round(
                              camp_comp[primary] / len(encampment_nodes), 4),
                          "draw_rule": ("one segment per distinct FULL_NAME, uniform over "
                                        "names then uniform over that name's segments"),
                          "why_restricted": ("a closure in a component holding 8 of 3,400 "
                                             "demand points is a no-op dressed as a "
                                             "severity increase - same guard as the "
                                             "freeway-bridge exclusion")},
        "closures": [{"node_a": r["feature"]["pair_key"][0],
                      "node_b": r["feature"]["pair_key"][1],
                      "activation_hour": r["activation_hour"], "label": r["feature"]["name"],
                      "kind": r["kind"], "wave": r["wave"], "rlis_type": r["feature"]["type"],
                      "length_m": round(r["feature"]["length_m"], 1),
                      "midpoint_lonlat": [round(r["feature"]["mid"][0], 6),
                                          round(r["feature"]["mid"][1], 6)]}
                     for r in rows],
        "connectivity_check": gates,
        "checks": ck.results,
        "limitations": [
            "CONSTRUCTED COUNTERFACTUAL: no incident record exists; the schedule is a "
            "seeded draw, so it cannot support any claim about what did or would happen "
            "on a particular date.",
            "One draw is one closure pattern. Treat spread across --site-seed values as a "
            "range, not a confidence interval.",
            "Closures are edge-level and permanent once active: no partial capacity, no "
            "reopening, no contraflow, no detour signage.",
            "The arterial pool is uniform over qualifying named streets in the demand "
            "bounding box, which is NOT uniform over demand: the box is several times the "
            "area of the demand footprint, so draws land disproportionately in the "
            "periphery (same caveat as build_scenario_crandom_2026.py). "
            f"{in_core} of {n_arterials} arterials fell inside the p05-p95 demand core in "
            "this draw. Restricting the pool to the primary demand component removes the "
            "wrong-component no-ops but does not make the draw demand-weighted.",
            "The safety check guarantees shelters stay attached to the largest component; "
            "it does NOT guarantee the walk stays short. Detour length is an outcome of "
            "the run, not a constraint on the draw.",
        ],
    }
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    rpt = REPORT_DIR / f"closures_E_r{args.site_seed}{suffix}_report.json"
    rpt.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"wrote {rpt}")
    print(f"\nOK - {len(rows)} closures, severity {args.severity}, site-seed {args.site_seed}; "
          f"all {len(ck.results)} safety checks passed.")


if __name__ == "__main__":
    main()
