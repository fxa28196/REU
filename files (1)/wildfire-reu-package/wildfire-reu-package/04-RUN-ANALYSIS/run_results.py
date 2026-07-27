"""
run_results.py -- produce every number the Results section needs.

WHY THIS EXISTS
Your architecture already puts all the science in Python; Repast runs the agent
loop and draws the map. That means the exposure accounting, the five strategies,
the Gini, and the divergence index can all be computed here, tonight, without
waiting on a Repast batch sweep. The numbers this produces ARE your model's
numbers -- same decision rule, same parameters, same data.

WHAT IT NEEDS
Four CSVs in repast_data/ (the ones export_for_repast.py already writes):
    nodes.csv             node_id, lat, lon
    shelters.csv          name, node_id, lat, lon, capacity
    agents_initial.csv    agent_id, node_id, age_bin, comorbidity,
                          awareness_prob, max_travel_m
    (shelter_distances.csv is NOT required -- see DISTANCES below)

RUN
    python run_results.py

OUTPUTS
    results/verification.csv        Section 4.1
    results/strategy_comparison.csv Section 4.3  <- the core table
    results/divergence.csv          Section 4.4  <- the headline number
    results/fig3_exposure.eps
    results/fig4_strategies.eps
    results/fig5_divergence.eps

DISTANCES
Uses haversine x 1.4 (circuity correction) rather than network shortest path.
This is standard in the spatial-accessibility literature, runs in seconds
instead of hours, and lets you score arbitrary candidate nodes -- which network
Dijkstra over a precomputed shelter-only matrix cannot do. Report it as a
methods choice with the 1.4 factor stated. If you later swap in true network
distance and rankings don't change, that is a robustness result.
"""

from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# =====================================================================
# CONFIG -- edit these to match your run, then record them in the chapter
# =====================================================================
DATA = Path("repast_data")
OUT = Path("results")
OUT.mkdir(exist_ok=True)

SEED = 42
N_HOURS = 288                # 12 days x 24h. Use 48 for a fast smoke test.
CIRCUITY = 1.4               # street-detour factor on haversine distance
EPA_UNHEALTHY = 35.4         # ug/m3
FILTRATION = 0.35            # indoor/outdoor ratio -- CITE THIS OR CHANGE IT
N_SHELTERS_PLACED = None     # None = match the number of existing shelters
TOP_QUINTILE = 0.20

# Vulnerability weights. See the note in the chapter: these are SUSCEPTIBILITY
# RATIOS (dimensionless), not outcome relative risks. Set them from stratum
# concentration-response slopes, normalised to the reference stratum.
# The placeholder values below are DELIBERATELY near 1.0 so that if you forget
# to replace them, the result is conservative rather than inflated.
W_AGE = {"under_18": 1.00, "18_44": 1.00, "45_64": 1.00, "65_plus": 1.00}
W_COMORBID = {"none": 1.00, "asthma": 1.00, "copd": 1.00}

MOBILITY = {
    "low":  dict(awareness_prob=0.3, max_travel_m=800),
    "med":  dict(awareness_prob=0.5, max_travel_m=1500),
    "high": dict(awareness_prob=0.7, max_travel_m=2500),
}

rng = np.random.default_rng(SEED)


# =====================================================================
# DISTANCE
# =====================================================================
def haversine_m(lat1, lon1, lat2, lon2):
    """Great-circle distance in metres. Accepts scalars or arrays."""
    R = 6_371_000.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp = np.radians(np.asarray(lat2) - np.asarray(lat1))
    dl = np.radians(np.asarray(lon2) - np.asarray(lon1))
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return R * 2 * np.arcsin(np.sqrt(a))


def walk_m(lat1, lon1, lat2, lon2):
    return haversine_m(lat1, lon1, lat2, lon2) * CIRCUITY


# =====================================================================
# LOAD
# =====================================================================
def load():
    nodes = pd.read_csv(DATA / "nodes.csv")
    shelters = pd.read_csv(DATA / "shelters.csv")
    agents = pd.read_csv(DATA / "agents_initial.csv")
    coords = nodes.set_index("node_id")[["lat", "lon"]].to_dict("index")
    return nodes, shelters, agents, coords


# =====================================================================
# PM2.5 FIELD
# =====================================================================
def pm25_field(nodes, n_hours, airnow_csv=DATA / "pm25_by_node_hour.csv"):
    """
    Returns array [n_nodes, n_hours].

    If you have real AirNow data interpolated to nodes, save it as
    pm25_by_node_hour.csv with columns node_id, hour, pm25 and this loads it.
    Otherwise it builds the synthetic event profile -- WHICH YOU MUST THEN
    DECLARE IN THE CHAPTER. A synthetic driver is a legitimate proof-of-concept
    choice. Silently reporting it as AirNow is not.
    """
    n = len(nodes)
    if Path(airnow_csv).exists():
        print(f"  PM2.5: from {airnow_csv}")
        df = pd.read_csv(airnow_csv)
        piv = df.pivot(index="node_id", columns="hour", values="pm25")
        piv = piv.reindex(nodes["node_id"].values)
        # Label honestly -- if build_pm25.py made this file it is DEQ-derived,
        # not AirNow. Mislabelling your data source in a methods section is
        # exactly the kind of error that gets a paper retracted.
        label = "DEQ published AQI, inverted to PM2.5" \
            if Path("data/pm25_daily_deq.csv").exists() else "external file"
        return piv.values[:, :n_hours], label

    print("  PM2.5: SYNTHETIC -- declare this in the chapter")
    t = np.arange(n_hours)
    # Event profile: ramp up, plateau in the Hazardous band, decay.
    base = 300 * np.exp(-((t - n_hours * 0.45) ** 2) / (2 * (n_hours * 0.18) ** 2))
    base = base + 8.0
    # West-to-east spatial gradient so location matters.
    lon = nodes["lon"].values
    grad = 0.75 + 0.5 * (lon - lon.min()) / (lon.max() - lon.min() + 1e-9)
    field = np.outer(grad, base)
    field += rng.normal(0, 6, size=field.shape)
    return np.clip(field, 0, 500), "synthetic"


# =====================================================================
# WEIGHTS
# =====================================================================
def agent_weights(agents):
    """Prefer the weight column written by make_all_inputs.py; fall back to maps."""
    if "weight" in agents.columns:
        return agents["weight"].values
    wa = agents["age_bin"].map(W_AGE).fillna(1.0).values
    wc = agents["comorbidity"].map(W_COMORBID).fillna(1.0).values
    return wa * wc


# =====================================================================
# CORE SIMULATION -- mirrors the Repast decision rule exactly
# =====================================================================
def simulate(agents, shelter_nodes, capacities, coords, pm, node_index,
             awareness_prob, max_travel_m, seed=SEED):
    """
    Returns per-agent cumulative PM2.5, cumulative VWE, hours sheltered.

    Decision rule, identical to UnshelteredAgent.step():
      not sheltered + pm > threshold + aware  -> nearest shelter with space
      sheltered      + pm <= threshold        -> return to origin node
    """
    r = np.random.default_rng(seed)
    n_ag = len(agents)
    n_hours = pm.shape[1]

    home = agents["node_id"].values
    at = home.copy()
    w = agent_weights(agents)
    out_filt = (agents["filtration_outdoor"].values
                if "filtration_outdoor" in agents.columns
                else np.ones(n_ag))

    cum_pm = np.zeros(n_ag)
    cum_vwe = np.zeros(n_ag)
    hrs_shelt = np.zeros(n_ag, dtype=int)

    # Precompute agent -> shelter distances once (this is the whole speedup)
    a_lat = np.array([coords[n]["lat"] for n in home])
    a_lon = np.array([coords[n]["lon"] for n in home])
    s_lat = np.array([coords[s]["lat"] for s in shelter_nodes])
    s_lon = np.array([coords[s]["lon"] for s in shelter_nodes])
    D = np.stack([walk_m(a_lat, a_lon, sl, so)
                  for sl, so in zip(s_lat, s_lon)], axis=1)   # [n_ag, n_shelt]
    reachable = D <= max_travel_m
    order = np.argsort(D, axis=1)

    shelt_set = set(shelter_nodes)
    cap = np.array([capacities[s] for s in shelter_nodes])

    for h in range(n_hours):
        occ = np.zeros(len(shelter_nodes), dtype=int)
        # count who is already sheltered
        for i in range(n_ag):
            if at[i] in shelt_set:
                occ[shelter_nodes.index(at[i])] += 1

        rows = np.array([node_index[n] for n in at])
        local = pm[rows, h]

        aware = r.random(n_ag) < awareness_prob

        for i in range(n_ag):
            sheltered = at[i] in shelt_set
            if sheltered and local[i] <= EPA_UNHEALTHY:
                at[i] = home[i]                       # return home
                sheltered = False
            elif (not sheltered) and local[i] > EPA_UNHEALTHY and aware[i]:
                for j in order[i]:
                    if reachable[i, j] and occ[j] < cap[j]:
                        at[i] = shelter_nodes[j]
                        occ[j] += 1
                        sheltered = True
                        break

            # exposure accrues at the post-move location
            eff = pm[node_index[at[i]], h]
            if sheltered:
                eff *= FILTRATION
                hrs_shelt[i] += 1
            else:
                eff *= out_filt[i]
            cum_pm[i] += eff
            cum_vwe[i] += eff * w[i]

    return cum_pm, cum_vwe, hrs_shelt


# =====================================================================
# METRICS
# =====================================================================
def gini(x):
    x = np.asarray(x, dtype=float)
    if x.size == 0:
        return float("nan")
    x = np.sort(x - x.min() + 1e-12)
    n = x.size
    idx = np.arange(1, n + 1)
    return float((2 * np.sum(idx * x) / (n * np.sum(x))) - (n + 1) / n)


# =====================================================================
# STRATEGIES
# =====================================================================
def catchment_score(cands, agents, coords, node_mean_pm, max_walk_m, weights=None):
    """Score each candidate by the exposure its catchment would relieve."""
    a_nodes = agents["node_id"].values
    a_lat = np.array([coords[n]["lat"] for n in a_nodes])
    a_lon = np.array([coords[n]["lon"] for n in a_nodes])
    a_pm = np.array([node_mean_pm[n] for n in a_nodes])
    w = weights if weights is not None else np.ones(len(a_nodes))

    scores = {}
    for c in cands:
        d = walk_m(a_lat, a_lon, coords[c]["lat"], coords[c]["lon"])
        m = d <= max_walk_m
        scores[c] = float(np.sum(a_pm[m] * w[m] * (1 - FILTRATION)))
    return scores


def build_strategies(agents, shelters, coords, node_mean_pm, cands, k, max_walk_m):
    existing = shelters["node_id"].tolist()
    counts = agents["node_id"].value_counts()

    s_pm = catchment_score(cands, agents, coords, node_mean_pm, max_walk_m)
    s_vwe = catchment_score(cands, agents, coords, node_mean_pm, max_walk_m,
                            weights=agent_weights(agents))

    # gap index: population weighted by distance to nearest existing shelter
    e_lat = np.array([coords[s]["lat"] for s in existing])
    e_lon = np.array([coords[s]["lon"] for s in existing])
    gap = {}
    for n, c in counts.items():
        d = walk_m(coords[n]["lat"], coords[n]["lon"], e_lat, e_lon).min()
        gap[n] = c * min(d, max_walk_m)

    return {
        "status_quo":  existing,
        "density":     counts.head(k).index.tolist(),
        "gap_index":   sorted(gap, key=gap.get, reverse=True)[:k],
        "oracle_pm25": sorted(s_pm, key=s_pm.get, reverse=True)[:k],
        "oracle_vwe":  sorted(s_vwe, key=s_vwe.get, reverse=True)[:k],
    }, s_pm, s_vwe


# =====================================================================
# MAIN
# =====================================================================
def main():
    print("Loading data ...")
    nodes, shelters, agents, coords = load()
    node_index = {n: i for i, n in enumerate(nodes["node_id"].values)}
    print(f"  {len(agents)} agents, {len(shelters)} shelters, {len(nodes)} nodes")

    pm, pm_source = pm25_field(nodes, N_HOURS)
    node_mean_pm = dict(zip(nodes["node_id"].values, pm.mean(axis=1)))

    k = N_SHELTERS_PLACED or len(shelters)
    cands = agents["node_id"].unique().tolist()   # candidate sites
    capcol = "effective_capacity" if "effective_capacity" in shelters.columns else "capacity"
    caps = dict(zip(shelters["node_id"], shelters[capcol]))
    default_cap = int(shelters[capcol].median())
    print(f"  using shelter capacity column: {capcol}")

    # -------- Section 4.1: verification -------------------------------
    print("\nVerification tests ...")
    v = []
    one = agents.head(1).copy()
    s0 = [shelters["node_id"].iloc[0]]
    c0 = {s0[0]: 999}
    clean = np.full((len(nodes), 24), 5.0)
    p, _, hs = simulate(one, s0, c0, coords, clean, node_index, 1.0, 1e9)
    v.append(("Below threshold, agent never shelters", int(hs[0]), 0,
              "PASS" if hs[0] == 0 else "FAIL"))

    dirty = np.full((len(nodes), 24), 200.0)
    p, _, hs = simulate(one, s0, c0, coords, dirty, node_index, 1.0, 1e9)
    v.append(("Above threshold + aware + in range, agent shelters", int(hs[0]), 24,
              "PASS" if hs[0] == 24 else "FAIL"))

    two = agents.head(2).copy()
    p, _, hs = simulate(two, s0, {s0[0]: 1}, coords, dirty, node_index, 1.0, 1e9)
    v.append(("Capacity-1 shelter never holds two agents", int(hs.max()), 24,
              "PASS" if hs.min() == 0 else "FAIL"))

    p, _, hs = simulate(one, s0, c0, coords, dirty, node_index, 0.0, 1e9)
    v.append(("Unaware agent never shelters", int(hs[0]), 0,
              "PASS" if hs[0] == 0 else "FAIL"))

    vdf = pd.DataFrame(v, columns=["test", "observed", "expected", "result"])
    vdf.to_csv(OUT / "verification.csv", index=False)
    print(vdf.to_string(index=False))

    # -------- Sections 4.2-4.3: strategy comparison -------------------
    print("\nStrategy comparison ...")
    rows = []
    for m_name, m in MOBILITY.items():
        strat, s_pm, s_vwe = build_strategies(
            agents, shelters, coords, node_mean_pm, cands, k, m["max_travel_m"])
        for s_name, snodes in strat.items():
            cap = {n: caps.get(n, default_cap) for n in snodes}
            cpm, cvwe, hs = simulate(
                agents, list(snodes), cap, coords, pm, node_index,
                m["awareness_prob"], m["max_travel_m"])
            rows.append(dict(
                strategy=s_name, mobility=m_name,
                mean_pm25=cpm.mean(), mean_vwe=cvwe.mean(),
                gini_pm25=gini(cpm), gini_vwe=gini(cvwe),
                mean_hours_sheltered=hs.mean(),
            ))
            print(f"  {s_name:12s} {m_name:5s}  "
                  f"mean_pm={cpm.mean():9.1f}  gini={gini(cpm):.3f}")

    sdf = pd.DataFrame(rows)
    sdf.to_csv(OUT / "strategy_comparison.csv", index=False)

    # -------- Section 4.4: divergence index ---------------------------
    print("\nSpatial divergence index ...")
    drows = []
    for m_name, m in MOBILITY.items():
        _, s_pm, s_vwe = build_strategies(
            agents, shelters, coords, node_mean_pm, cands, k, m["max_travel_m"])
        n_top = max(1, int(len(cands) * TOP_QUINTILE))
        top_pm = set(sorted(s_pm, key=s_pm.get, reverse=True)[:n_top])
        top_vwe = set(sorted(s_vwe, key=s_vwe.get, reverse=True)[:n_top])
        agree = len(top_pm & top_vwe)
        div = 1 - agree / n_top
        drows.append(dict(mobility=m_name, n_candidates=len(cands),
                          n_top_quintile=n_top, n_agree=agree,
                          divergence_index=div))
        print(f"  {m_name:5s}  divergence = {div:.3f} "
              f"({n_top - agree}/{n_top} locations disagree)")

    ddf = pd.DataFrame(drows)
    ddf.to_csv(OUT / "divergence.csv", index=False)

    # -------- Figures --------------------------------------------------
    print("\nFigures ...")
    fig, ax = plt.subplots(figsize=(6, 3.6))
    ax.plot(pm.mean(axis=0), lw=2, color="#6B8EB8")
    ax.axhline(EPA_UNHEALTHY, ls="--", color="#C8A84A",
               label=f"EPA unhealthy ({EPA_UNHEALTHY})")
    ax.set_xlabel("Hour of event"); ax.set_ylabel(r"Mean PM$_{2.5}$ ($\mu$g/m$^3$)")
    ax.set_title(f"Event profile ({pm_source})"); ax.legend(frameon=False)
    fig.tight_layout(); fig.savefig(OUT / "fig3_exposure.eps", format="eps")

    fig, ax = plt.subplots(figsize=(7, 3.8))
    piv = sdf.pivot(index="strategy", columns="mobility", values="mean_pm25")
    piv.plot(kind="bar", ax=ax, color=["#6B8EB8", "#8FA9C6", "#C8A84A"])
    ax.set_ylabel(r"Mean cumulative PM$_{2.5}$ ($\mu$g/m$^3\cdot$h)")
    ax.set_xlabel(""); ax.legend(title="Mobility", frameon=False)
    plt.xticks(rotation=30, ha="right")
    fig.tight_layout(); fig.savefig(OUT / "fig4_strategies.eps", format="eps")

    fig, ax = plt.subplots(figsize=(5, 3.4))
    ax.bar(ddf["mobility"], ddf["divergence_index"], color="#C8A84A")
    ax.set_ylabel("Divergence index"); ax.set_ylim(0, 1)
    ax.set_title("Top-quintile disagreement between oracles")
    fig.tight_layout(); fig.savefig(OUT / "fig5_divergence.eps", format="eps")

    print(f"\nDone. PM2.5 source: {pm_source}")
    print(f"Wrote {OUT}/ -- verification, strategy_comparison, divergence, 3 EPS figures")
    print("\nRECORD IN THE CHAPTER: "
          f"seed={SEED}, n_agents={len(agents)}, n_hours={N_HOURS}, "
          f"n_shelters={k}, circuity={CIRCUITY}, filtration={FILTRATION}, "
          f"pm25_source={pm_source}")


if __name__ == "__main__":
    main()
