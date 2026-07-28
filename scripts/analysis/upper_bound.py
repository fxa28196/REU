#!/usr/bin/env python3
"""Assignment upper bound for the clean-air-shelter ABM.

Separates GEOGRAPHY from COORDINATION FAILURE.

The model's agents use greedy myopic search: walk to the nearest non-full
shelter, get refused at the door, re-plan, bounded by MAX_RETARGETS = 8
(Geography/src/geography/agents/GisAgent.java:125). In arms B and C the total
shelter capacity EXACTLY equals the population (6,842), so a feasible
near-perfect assignment provably exists. The question this script answers is:
how much of the model's shortfall is caused by the myopia assumption rather
than by the built environment?

Method
------
1. Rebuild the validated street graph with scripts/test_routing.build_graphs()
   (same node-site clustering as geography.routing.StreetNetwork).
2. Snap every agent's start_lon/start_lat and every operating shelter to its
   nearest graph node, using the same planar degree-distance metric as
   StreetNetwork.nearestNode.
3. One Dijkstra per shelter over the whole graph -> exact network distance
   from every node to every shelter.
4. MAX FLOW (Dinic, implemented here -- neither networkx nor scipy is
   installed in this environment): source -> agent-group (cap = number of
   agents snapped to that node), group -> shelter (cap = inf) iff the shelter
   is REACHABLE (finite network distance), shelter -> sink (cap = capacity).
   The max flow is the largest number of residents any assignment -- however
   clairvoyant -- could shelter.
5. MIN-COST MAX FLOW (successive shortest paths with layered Bellman-Ford;
   the residual graph is bipartite so a shortest path alternates between the
   two sides and converges in at most n_shelters rounds). Objective = total
   network distance, giving the optimal mean walking distance.
6. Optional time-budget variant: an agent may only use a shelter it could
   physically walk to inside the episode, i.e.
       network_distance <= walking_speed_mps * 60 * (sim_minutes - start_tick).

Usage:
    python scripts/analysis/upper_bound.py                 # arms B and C, seed 42
    python scripts/analysis/upper_bound.py --arms A B C --seed 42
    python scripts/analysis/upper_bound.py --json out.json --no-mincost

Read-only with respect to the repository except for the optional --json and
--cache paths. Requires: pandas, numpy, pyshp.
"""

from __future__ import annotations

import argparse
import heapq
import json
import math
import sys
import time
from collections import deque
from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from test_routing import build_graphs, dist_m  # noqa: E402  (repo-local import)

SCRIPT_VERSION = "1.0.0"
OUTPUT_DIR = REPO_ROOT / "Geography" / "output"
INF = math.inf


# --------------------------------------------------------------------------
# graph construction + all-pairs (node x shelter) distances
# --------------------------------------------------------------------------
def dijkstra_array(indptr, indices, weights, source, n):
    """Dijkstra over a CSR-packed undirected graph. Returns float64 array."""
    dist = np.full(n, np.inf)
    dist[source] = 0.0
    pq = [(0.0, source)]
    push, pop = heapq.heappush, heapq.heappop
    while pq:
        d, u = pop(pq)
        if d > dist[u]:
            continue
        for k in range(indptr[u], indptr[u + 1]):
            v = indices[k]
            nd = d + weights[k]
            if nd < dist[v]:
                dist[v] = nd
                push(pq, (nd, v))
    return dist


def pack_csr(adj):
    """{node: [(nbr, w)]} -> (node_ids, index_of, indptr, indices, weights)."""
    node_ids = sorted(adj)
    index_of = {nid: i for i, nid in enumerate(node_ids)}
    degrees = [len(adj[nid]) for nid in node_ids]
    indptr = np.zeros(len(node_ids) + 1, dtype=np.int64)
    indptr[1:] = np.cumsum(degrees)
    indices = np.empty(indptr[-1], dtype=np.int64)
    weights = np.empty(indptr[-1], dtype=np.float64)
    for i, nid in enumerate(node_ids):
        for k, (nbr, w) in enumerate(adj[nid]):
            indices[indptr[i] + k] = index_of[nbr]
            weights[indptr[i] + k] = w
    return node_ids, index_of, indptr, indices, weights


def weld_coincident(adj, coords, tol_m):
    """Add zero-length connector edges between nodes that sit within tol_m of
    each other but belong to different graph components.

    StreetNetwork joins street endpoints by the shapefile's PDX_F_NODE /
    PDX_T_NODE *attribute ids* (clustered within 100 m). Wherever two features
    physically meet but carry inconsistent attribute ids, the junction is never
    welded, and the county graph is severed even though the streets touch. This
    repair is the minimal, geometry-respecting fix: it connects only junctions
    whose coordinates already coincide. Returns (adj, n_welds)."""
    from collections import defaultdict
    ids = list(adj)
    idx = {nid: i for i, nid in enumerate(ids)}
    lon = np.array([coords[i][0] for i in ids])
    lat = np.array([coords[i][1] for i in ids])

    lab = np.full(len(ids), -1, dtype=np.int64)
    c = 0
    for s in range(len(ids)):
        if lab[s] >= 0:
            continue
        stack = [s]
        lab[s] = c
        while stack:
            u = ids[stack.pop()]
            for nbr, _ in adj[u]:
                v = idx[nbr]
                if lab[v] < 0:
                    lab[v] = c
                    stack.append(v)
        c += 1

    g = tol_m / 111000.0
    cell = defaultdict(list)
    for i in range(len(ids)):
        cell[(int(lon[i] / g), int(lat[i] / g))].append(i)
    welds = 0
    for (cx, cy), members in list(cell.items()):
        cand = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                cand += cell.get((cx + dx, cy + dy), [])
        for i in members:
            for j in cand:
                if j <= i or lab[i] == lab[j]:
                    continue
                if (lon[i] - lon[j]) ** 2 + (lat[i] - lat[j]) ** 2 > g * g:
                    continue
                a, b = ids[i], ids[j]
                w = max(dist_m(coords[a], coords[b]), 0.0)
                adj[a].append((b, w))
                adj[b].append((a, w))
                old, new = lab[j], lab[i]
                lab[lab == old] = new
                welds += 1
    return adj, welds


def snap_all(node_lon, node_lat, lons, lats, chunk=256):
    """Vectorised nearest_node: planar degree-distance, mirrors
    StreetNetwork.nearestNode / test_routing.nearest_node exactly."""
    out = np.empty(len(lons), dtype=np.int64)
    for a in range(0, len(lons), chunk):
        b = min(a + chunk, len(lons))
        dx = node_lon[None, :] - lons[a:b, None]
        dy = node_lat[None, :] - lats[a:b, None]
        out[a:b] = np.argmin(dx * dx + dy * dy, axis=1)
    return out


# --------------------------------------------------------------------------
# Dinic max flow (no networkx / no scipy in this environment)
# --------------------------------------------------------------------------
class Dinic:
    def __init__(self, n):
        self.n = n
        self.to = []
        self.cap = []
        self.head = [[] for _ in range(n)]

    def add(self, u, v, c):
        self.head[u].append(len(self.to))
        self.to.append(v)
        self.cap.append(c)
        self.head[v].append(len(self.to))
        self.to.append(u)
        self.cap.append(0)

    def _bfs(self, s, t):
        self.level = [-1] * self.n
        self.level[s] = 0
        q = deque([s])
        while q:
            u = q.popleft()
            for e in self.head[u]:
                v = self.to[e]
                if self.cap[e] > 0 and self.level[v] < 0:
                    self.level[v] = self.level[u] + 1
                    q.append(v)
        return self.level[t] >= 0

    def _dfs(self, s, t):
        """Iterative blocking-flow DFS."""
        total = 0
        while True:
            stack = [s]
            path = []
            found = False
            while stack:
                u = stack[-1]
                if u == t:
                    found = True
                    break
                advanced = False
                while self.it[u] < len(self.head[u]):
                    e = self.head[u][self.it[u]]
                    v = self.to[e]
                    if self.cap[e] > 0 and self.level[v] == self.level[u] + 1:
                        stack.append(v)
                        path.append(e)
                        advanced = True
                        break
                    self.it[u] += 1
                if not advanced:
                    self.level[u] = -1
                    stack.pop()
                    if path:
                        path.pop()
                        self.it[stack[-1]] += 1
                    if not stack:
                        break
            if not found:
                return total
            aug = min(self.cap[e] for e in path)
            for e in path:
                self.cap[e] -= aug
                self.cap[e ^ 1] += aug
            total += aug

    def maxflow(self, s, t):
        flow = 0
        while self._bfs(s, t):
            self.it = [0] * self.n
            flow += self._dfs(s, t)
        return flow


# --------------------------------------------------------------------------
# min-cost max-flow on the bipartite transportation problem
# --------------------------------------------------------------------------
def min_cost_transportation(supply, capacity, cost, reachable, verbose=False):
    """Successive shortest paths on a bipartite transportation problem.

    supply    : (G,) int   agents waiting at each start-node group
    capacity  : (S,) int   shelter capacities
    cost      : (G,S) float network distance (np.inf where unreachable)
    reachable : (G,S) bool

    The residual graph is bipartite (group <-> shelter) with source/sink
    attached, so a shortest augmenting path alternates sides and visits each
    shelter at most once; layered Bellman-Ford relaxation therefore converges
    in at most S rounds and needs no potentials. Costs on residual back-arcs
    are negative but no negative cycle can exist while the flow is optimal for
    its value (the SSP invariant).

    Returns (flow, total_cost, assignment matrix).
    """
    G, S = cost.shape
    C = np.where(reachable, cost, np.inf)
    left = supply.astype(np.int64).copy()          # unassigned agents per group
    free = capacity.astype(np.int64).copy()        # unused capacity per shelter
    x = np.zeros((G, S), dtype=np.int64)           # current assignment
    flow = 0
    total = 0.0
    rounds = 0

    while True:
        src_ok = left > 0
        snk_ok = free > 0
        if not src_ok.any() or not snk_ok.any():
            break

        # ---- layered Bellman-Ford shortest path from source set to sink ----
        dg = np.where(src_ok, 0.0, np.inf)         # dist to each group node
        pg = np.full(G, -1, dtype=np.int64)        # predecessor shelter
        ds = np.full(S, np.inf)
        ps = np.full(S, -1, dtype=np.int64)        # predecessor group
        fwd = C < np.inf                           # forward arcs group->shelter
        back = x > 0                               # residual arcs shelter->group

        for _ in range(S + 1):
            changed = False
            # relax forward: group -> shelter, cost +C
            cand = dg[:, None] + np.where(fwd, C, np.inf)
            best = cand.min(axis=0)
            arg = cand.argmin(axis=0)
            imp = best < ds - 1e-9
            if imp.any():
                ds[imp] = best[imp]
                ps[imp] = arg[imp]
                changed = True
            # relax backward: shelter -> group, cost -C (cancels flow).
            # Guard the inf-minus-inf NaN: C is always finite where back holds.
            ok = back & np.isfinite(ds)[None, :]
            cand2 = np.where(ok, ds[None, :] - np.where(ok, C, 0.0), np.inf)
            best2 = cand2.min(axis=1)
            arg2 = cand2.argmin(axis=1)
            imp2 = best2 < dg - 1e-9
            if imp2.any():
                dg[imp2] = best2[imp2]
                pg[imp2] = arg2[imp2]
                changed = True
            if not changed:
                break

        reach_sink = np.where(snk_ok, ds, np.inf)
        if not np.isfinite(reach_sink).any():
            break
        j = int(np.argmin(reach_sink))

        # ---- walk the path back, find the bottleneck ----
        path = []
        cur_s, cur_g = j, int(ps[j])
        bottleneck = int(free[j])
        while True:
            path.append(("f", cur_g, cur_s))
            prev_s = int(pg[cur_g])
            if prev_s < 0:
                bottleneck = min(bottleneck, int(left[cur_g]))
                break
            bottleneck = min(bottleneck, int(x[cur_g, prev_s]))
            path.append(("b", cur_g, prev_s))
            cur_s = prev_s
            cur_g = int(ps[prev_s])
        if bottleneck <= 0:
            break

        for kind, g, s in path:
            if kind == "f":
                x[g, s] += bottleneck
                total += bottleneck * C[g, s]
            else:
                x[g, s] -= bottleneck
                total -= bottleneck * C[g, s]
        start_g = path[-1][1]
        left[start_g] -= bottleneck
        free[j] -= bottleneck
        flow += bottleneck
        rounds += 1
        if verbose and rounds % 250 == 0:
            print(f"      ...ssp round {rounds}: flow {flow}", flush=True)

    return flow, total, x


def verify_optimality(x, cost, reachable):
    """Independent certificate: a feasible flow is min-cost iff its residual
    graph has no negative cycle. Here the residual graph is bipartite, so every
    cycle can be contracted onto the shelter side: arc j -> k costs
        min over groups i with x[i,j] > 0 and (i,k) reachable of  C[i,k] - C[i,j]
    (divert one unit from shelter j to shelter k). That leaves an S x S dense
    digraph — 36 or 46 nodes — on which Bellman-Ford settles the question
    exactly and cheaply. Returns (is_optimal, most_negative_cycle_cost)."""
    G, S = cost.shape
    C = np.where(reachable, cost, np.inf)
    W = np.full((S, S), np.inf)
    for j in range(S):
        donors = x[:, j] > 0
        if not donors.any():
            continue
        delta = C[donors] - C[donors, j][:, None]     # (n_donors, S)
        W[j] = delta.min(axis=0)
    np.fill_diagonal(W, np.inf)

    d = np.zeros(S)                                   # virtual super-source
    for _ in range(S):
        nd = np.minimum(d, (d[:, None] + W).min(axis=0))
        if np.allclose(nd, d, atol=1e-9, equal_nan=True):
            return True, 0.0
        d = nd
    nd = np.minimum(d, (d[:, None] + W).min(axis=0))
    worst = float(np.nanmin(nd - d))
    return bool(worst > -1e-6), worst


# --------------------------------------------------------------------------
# per-arm analysis
# --------------------------------------------------------------------------
def analyse(run_dir, ctx, do_mincost=True, verbose=True):
    run = Path(run_dir)
    agents = pd.read_csv(run / "agents.csv")
    shelters = pd.read_csv(run / "shelters.csv")
    manifest = json.loads((run / "simulation.json").read_text(encoding="utf-8"))
    params = manifest["reproducibility"]["parameters"]

    op = shelters[shelters["operating"].astype(str).str.lower() == "true"].reset_index(drop=True)
    node_lon, node_lat = ctx["node_lon"], ctx["node_lat"]

    # snap shelters, one Dijkstra each
    s_nodes = snap_all(node_lon, node_lat,
                       op["lon"].to_numpy(float), op["lat"].to_numpy(float))
    S = len(op)
    n = len(node_lon)
    key = tuple(s_nodes.tolist())
    cache = ctx.setdefault("dist_cache", {})
    if key in cache:
        D = cache[key]
    else:
        D = np.empty((S, n))
        for k in range(S):
            t0 = time.time()
            D[k] = ctx["dijkstra"](int(s_nodes[k]))
            if verbose:
                print(f"    dijkstra {k + 1}/{S} {op.loc[k, 'shelter_id'][:34]:<34} "
                      f"{time.time() - t0:.1f}s", flush=True)
        cache[key] = D

    # snap agents, condense to distinct start nodes
    a_nodes = snap_all(node_lon, node_lat,
                       agents["start_lon"].to_numpy(float),
                       agents["start_lat"].to_numpy(float))
    groups, inverse = np.unique(a_nodes, return_inverse=True)
    supply = np.bincount(inverse, minlength=len(groups))
    G = len(groups)

    cost = D[:, groups].T.copy()                      # (G, S) network distance
    snap_gap = np.zeros(G)                            # agent point -> its node
    # mean snap gap per group, from the exported column (Java-computed)
    snap_gap = (pd.Series(agents["snap_gap_m"].to_numpy(float))
                .groupby(inverse).mean().reindex(range(G)).to_numpy())

    capacity = op["capacity"].to_numpy(np.int64)
    n_agents = len(agents)
    sheltered = agents[agents["final_state"] == "SHELTERED"]

    # --- three reachability regimes -------------------------------------
    # R1 "strict": finite network distance in this independently rebuilt graph.
    # R2 "model-consistent" (HEADLINE): R1 plus every (start-node, shelter) pair
    #    the model itself demonstrably realised. The Java graph's node-site
    #    clustering resolves a handful of boundary snaps differently from this
    #    rebuild, so R1 alone can sit a few agents BELOW the model's own result
    #    and would not be a valid upper bound. R2 is guaranteed >= the model.
    # R3 "connectivity-repaired": ignore the street graph's component split
    #    entirely — any resident may use any shelter. This is the bound the
    #    critique implicitly assumes, and it isolates how much of the ceiling is
    #    set by network topology rather than by capacity.
    reach1 = np.isfinite(cost)
    reach2 = reach1.copy()
    cost2 = cost.copy()
    sidx = {sid: k for k, sid in enumerate(op["shelter_id"])}
    demonstrated = 0
    for pos in np.nonzero((agents["final_state"] == "SHELTERED").to_numpy())[0]:
        s = sidx.get(agents["shelter_reached"].iloc[pos])
        if s is None:
            continue
        g = int(inverse[pos])
        if not reach2[g, s]:
            reach2[g, s] = True
            cost2[g, s] = float(agents["network_dist_to_shelter_m"].iloc[pos])
            demonstrated += 1
    reach3 = np.ones_like(reach1)

    def maxflow_under(reach):
        SRC, SNK = G + S, G + S + 1
        din = Dinic(G + S + 2)
        for g in range(G):
            din.add(SRC, g, int(supply[g]))
        gi, si = np.nonzero(reach)
        for g, s in zip(gi.tolist(), si.tolist()):
            din.add(g, G + s, int(supply[g]))
        for s in range(S):
            din.add(G + s, SNK, int(capacity[s]))
        return din.maxflow(SRC, SNK)

    t0 = time.time()
    opt1 = maxflow_under(reach1)
    opt = maxflow_under(reach2)
    opt3 = maxflow_under(reach3)
    if verbose:
        print(f"    max-flow: strict {opt1}, model-consistent {opt}, "
              f"connectivity-repaired {opt3} ({time.time() - t0:.1f}s)", flush=True)

    n_unreachable = int(supply[~reach2.any(axis=1)].sum())

    # ---------------- time-budget-constrained variant ----------------
    sim_min = float(params["simulationHours"]) * 60.0
    start_tick = agents["time_started_tick"].to_numpy(float)
    speed = agents["walking_speed_mps"].to_numpy(float)
    budget_m = speed * 60.0 * np.maximum(sim_min - start_tick, 0.0)
    # per-group worst case: use each group's minimum agent budget (conservative)
    grp_budget = (pd.Series(budget_m).groupby(inverse).min()
                  .reindex(range(G)).to_numpy())
    opt_t = maxflow_under(reach2 & (np.nan_to_num(cost2, posinf=np.inf)
                                    <= grp_budget[:, None]))

    # ---------------- optimum under a realistic walking-distance cap ----
    # The episode is 312 h long, so the time budget never binds (a resident can
    # notionally walk 430 km). An unconstrained optimum is therefore free to
    # assign 60 km walks. Capping the assignable distance shows how much of the
    # headline optimum survives a distance any real evacuee would actually walk.
    caps = {}
    for cap_m in (2000, 3000, 5000, 8000, 10000, 15000, 20000):
        caps[cap_m] = int(maxflow_under(reach2 & (cost2 <= cap_m)))

    # ---------------- per-component supply / capacity ledger ------------
    comp = ctx["component"]
    a_comp = comp[groups]
    s_comp = comp[s_nodes]
    ledger = []
    for cc in sorted(set(a_comp.tolist()) | set(s_comp.tolist())):
        na = int(supply[a_comp == cc].sum())
        cap = int(capacity[s_comp == cc].sum())
        ledger.append({"component": int(cc),
                       "graph_nodes": int((comp == cc).sum()),
                       "residents": na, "shelters": int((s_comp == cc).sum()),
                       "capacity": cap, "servable": min(na, cap),
                       "stranded_capacity": max(cap - na, 0),
                       "unservable_residents": max(na - cap, 0)})
    ledger.sort(key=lambda r: -r["residents"])

    # ---------------- min-cost max flow ----------------
    mincost = None
    if do_mincost:
        t0 = time.time()
        f, tot, x = min_cost_transportation(supply, capacity, cost2, reach2,
                                            verbose=verbose)
        mean_net = tot / f if f else float("nan")
        is_opt, worst_cycle = verify_optimality(x, cost2, reach2)
        # capacity-free lower bound: every resident at their own nearest
        # shelter, capacity ignored (groups with no reachable shelter excluded)
        nearest = np.where(reach2, cost2, np.inf).min(axis=1)
        ok_g = np.isfinite(nearest)
        lb = float((supply[ok_g] * nearest[ok_g]).sum())
        lb_n = int(supply[ok_g].sum())
        # add the agent-point -> start-node snap gap so the number is
        # comparable with the model's total_travel_distance_m
        gap_weight = float((snap_gap * x.sum(axis=1)).sum() / f) if f else 0.0
        mincost = {
            "flow": int(f),
            "total_network_distance_m": float(tot),
            "mean_network_distance_m": float(mean_net),
            "mean_snap_gap_m": gap_weight,
            "mean_door_to_door_m": float(mean_net + gap_weight),
            "max_assigned_distance_m": float(cost2[x > 0].max()) if f else float("nan"),
            "flow_equals_maxflow": bool(f == opt),
            "no_negative_residual_cycle": bool(is_opt),
            "worst_residual_cycle_cost_m": worst_cycle,
            "capacity_free_lower_bound_mean_m": lb / lb_n if lb_n else float("nan"),
            "seconds": round(time.time() - t0, 1),
        }
        if verbose:
            print(f"    min-cost max-flow: flow {f} (== max-flow: {f == opt}), "
                  f"mean {mean_net:.1f} m, optimality certificate "
                  f"{'PASS' if is_opt else 'FAIL'} (worst residual cycle "
                  f"{worst_cycle:+.3f} m), capacity-free lower bound "
                  f"{lb / lb_n:.1f} m, {time.time() - t0:.1f}s", flush=True)

    # ---------------- what the model actually achieved ----------------
    states = agents["final_state"].value_counts().to_dict()

    return {
        "run": run.name,
        "scenario": str(agents["scenario"].iloc[0]) if "scenario" in agents else "",
        "n_agents": int(n_agents),
        "n_shelters": int(S),
        "total_capacity": int(capacity.sum()),
        "distinct_start_nodes": int(G),
        "model": {
            "sheltered": int(len(sheltered)),
            "rate": len(sheltered) / n_agents,
            "states": {k: int(v) for k, v in states.items()},
            "mean_total_travel_all_agents_m": float(agents["total_travel_distance_m"].mean()),
            "mean_total_travel_sheltered_m": float(sheltered["total_travel_distance_m"].mean()),
            "mean_direct_net_dist_sheltered_m": float(sheltered["network_dist_to_shelter_m"].mean()),
            "mean_door_refusals": float(agents["door_refusals"].mean()),
        },
        "upper_bound": {
            "strict_rebuilt_graph": int(opt1),
            "model_consistent": int(opt),
            "rate": opt / n_agents,
            "connectivity_repaired": int(opt3),
            "demonstrated_pairs_added": int(demonstrated),
            "time_budget_constrained": int(opt_t),
            "time_budget_binds": bool(opt_t < opt),
            "agents_with_no_reachable_shelter": n_unreachable,
            "min_episode_walk_budget_m": float(np.nanmin(budget_m)),
            "max_network_distance_needed_m": float(cost2[np.isfinite(cost2)].max()),
        },
        "shortfall": {
            "total_gap_vs_population": int(n_agents - len(sheltered)),
            "coordination_failure": int(opt - len(sheltered)),
            "network_topology_stranded_capacity": int(opt3 - opt),
            "geographic_unreachable": n_unreachable,
            "coordination_share_of_gap": ((opt - len(sheltered)) /
                                          (n_agents - len(sheltered))
                                          if len(sheltered) < n_agents else 0.0),
        },
        "distance_capped_optimum": caps,
        "component_ledger": ledger,
        "min_cost": mincost,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--arms", nargs="+", default=["B", "C"])
    ap.add_argument("--seed", type=int, nargs="+", default=[42])
    ap.add_argument("--pattern", default="{arm}2026-n6842-seed{seed}")
    ap.add_argument("--no-mincost", action="store_true")
    ap.add_argument("--json", default=None, help="write results to this path")
    ap.add_argument("--quiet", action="store_true")
    ap.add_argument("--weld-m", type=float, default=0.0,
                    help="repair the street graph by welding physically "
                         "coincident junctions within this many metres "
                         "(0 = use the graph exactly as the model does)")
    args = ap.parse_args()
    verbose = not args.quiet

    print(f"upper_bound v{SCRIPT_VERSION} — assignment upper bound "
          f"(max-flow) vs the model's greedy myopic search")
    print("solver: Dinic max-flow + successive-shortest-path min-cost flow, "
          "implemented in this file (networkx and scipy are NOT installed)")

    t0 = time.time()
    adj, coords, audit = build_graphs()
    if args.weld_m > 0:
        adj, welds = weld_coincident(adj, coords, args.weld_m)
        print(f"NETWORK REPAIR: welded {welds} physically coincident junction "
              f"pairs within {args.weld_m:g} m that the attribute-id join left severed")
    node_ids, index_of, indptr, indices, weights = pack_csr(adj)
    node_lon = np.array([coords[i][0] for i in node_ids])
    node_lat = np.array([coords[i][1] for i in node_ids])
    print(f"graph: {audit['features']} features, {len(node_ids)} nodes, "
          f"components {audit['components_fixed']} "
          f"(count, largest); built in {time.time() - t0:.1f}s")

    # connected-component labels (needed for the supply/capacity ledger)
    nn = len(node_ids)
    comp = np.full(nn, -1, dtype=np.int64)
    c = 0
    for s0 in range(nn):
        if comp[s0] >= 0:
            continue
        stack = [s0]
        comp[s0] = c
        while stack:
            u = stack.pop()
            for k in range(indptr[u], indptr[u + 1]):
                v = indices[k]
                if comp[v] < 0:
                    comp[v] = c
                    stack.append(v)
        c += 1
    sizes = np.bincount(comp)
    print(f"components: {c}; two largest {sorted(sizes)[-2:]} nodes")

    ctx = {
        "node_lon": node_lon,
        "node_lat": node_lat,
        "component": comp,
        "dijkstra": lambda src: dijkstra_array(indptr, indices, weights,
                                               src, len(node_ids)),
    }

    results = []
    for arm, seed in ((a, s) for a in args.arms for s in args.seed):
        run = OUTPUT_DIR / args.pattern.format(arm=arm, seed=seed)
        if not run.exists():
            print(f"  SKIP {run} (missing)")
            continue
        print(f"\n=== arm {arm}: {run.name}")
        r = analyse(run, ctx, do_mincost=not args.no_mincost, verbose=verbose)
        results.append(r)
        ub, m, sf = r["upper_bound"], r["model"], r["shortfall"]
        print(f"  model      {m['sheltered']:>5} / {r['n_agents']} "
              f"({100 * m['rate']:.2f}%)  mean {m['mean_door_refusals']:.2f} refusals")
        print(f"  OPTIMUM    {ub['model_consistent']:>5} / {r['n_agents']} "
              f"({100 * ub['rate']:.2f}%)   [strict-graph variant "
              f"{ub['strict_rebuilt_graph']}, connectivity-repaired "
              f"{ub['connectivity_repaired']}]")
        print(f"  time-budget-constrained optimum "
              f"{ub['time_budget_constrained']} (binds: {ub['time_budget_binds']}; "
              f"smallest episode walk budget {ub['min_episode_walk_budget_m']:,.0f} m "
              f"vs longest needed {ub['max_network_distance_needed_m']:,.0f} m)")
        print(f"  shortfall  coordination failure {sf['coordination_failure']}; "
              f"capacity stranded by network topology "
              f"{sf['network_topology_stranded_capacity']}; "
              f"residents with no reachable shelter {sf['geographic_unreachable']}")
        print("  optimum under a walking-distance cap: " + ", ".join(
            f"{k // 1000}km={v}" for k, v in r["distance_capped_optimum"].items()))
        print("  component ledger (residents / shelters / capacity):")
        for row in r["component_ledger"][:4]:
            print(f"    comp {row['component']:<4} nodes {row['graph_nodes']:>6} "
                  f"residents {row['residents']:>5} shelters {row['shelters']:>3} "
                  f"capacity {row['capacity']:>5} -> servable {row['servable']:>5} "
                  f"(stranded {row['stranded_capacity']})")
        if r["min_cost"]:
            mc = r["min_cost"]
            print(f"  optimal mean walk {mc['mean_network_distance_m']:.0f} m "
                  f"(+{mc['mean_snap_gap_m']:.0f} m snap) vs model "
                  f"{m['mean_total_travel_sheltered_m']:.0f} m sheltered / "
                  f"{m['mean_total_travel_all_agents_m']:.0f} m all agents")

    if args.json:
        Path(args.json).write_text(json.dumps(results, indent=2), encoding="utf-8")
        print(f"\nwrote {args.json}")
    return results


if __name__ == "__main__":
    main()
