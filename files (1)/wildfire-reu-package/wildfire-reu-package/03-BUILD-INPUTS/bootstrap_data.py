"""
bootstrap_data.py -- build repast_data/ so run_results.py can run.

Use this ONLY if you do not already have repast_data/ from export_for_repast.py.
If you do have it, skip this file entirely.

It writes the three CSVs run_results.py needs:
    nodes.csv           node_id, lat, lon
    shelters.csv        name, node_id, lat, lon, capacity
    agents_initial.csv  agent_id, node_id, age_bin, comorbidity,
                        awareness_prob, max_travel_m

NODES come from one of three sources, tried in order:
  1. your street shapefile, if SHAPEFILE below points at it (needs geopandas)
  2. an existing nodes.csv you already have
  3. a regular grid over the Multnomah County bounding box (fallback)

SHELTERS come from your shelters file if you have one, else from a small
built-in list of real Multnomah County shelter coordinates you must verify.

AGENTS are synthetic, sampled from the prevalences you set below. This is
already true of your model -- the population has always been synthetic. Say so
in the chapter.

RUN
    python bootstrap_data.py
"""

from pathlib import Path
import numpy as np
import pandas as pd

OUT = Path("repast_data")
OUT.mkdir(exist_ok=True)

SEED = 42
rng = np.random.default_rng(SEED)

# --- edit these ------------------------------------------------------
SHAPEFILE = None          # e.g. "data/raw/portland_streets.shp", or None
EXISTING_NODES = None     # e.g. "data/processed/nodes.csv", or None
EXISTING_SHELTERS = None  # e.g. "data/raw/shelters.csv", or None

N_AGENTS = 500
N_GRID = 40               # grid resolution for the fallback (40x40 = 1600 nodes)

# Multnomah County approximate bounding box
LAT_MIN, LAT_MAX = 45.43, 45.63
LON_MIN, LON_MAX = -122.85, -122.40

AGE_BINS = ["under_18", "18_44", "45_64", "65_plus"]
AGE_P = [0.06, 0.55, 0.30, 0.09]     # <-- source this or state it as assumed

COMORBID = ["none", "asthma", "copd"]
COMORBID_P = [0.727, 0.183, 0.090]   # <-- source this or state it as assumed

AWARENESS = 0.5
MAX_TRAVEL_M = 1500
DEFAULT_CAPACITY = 50
# ---------------------------------------------------------------------


def build_nodes():
    if EXISTING_NODES and Path(EXISTING_NODES).exists():
        df = pd.read_csv(EXISTING_NODES)
        print(f"nodes: loaded {len(df)} from {EXISTING_NODES}")
        return df[["node_id", "lat", "lon"]]

    if SHAPEFILE and Path(SHAPEFILE).exists():
        try:
            import geopandas as gpd
            gdf = gpd.read_file(SHAPEFILE).to_crs(epsg=4326)
            pts = []
            for geom in gdf.geometry:
                if geom is None:
                    continue
                if geom.geom_type == "LineString":
                    pts.extend(list(geom.coords))
                elif geom.geom_type == "MultiLineString":
                    for g in geom.geoms:
                        pts.extend(list(g.coords))
            pts = list({(round(x, 5), round(y, 5)) for x, y in pts})
            df = pd.DataFrame({
                "node_id": np.arange(len(pts)),
                "lon": [p[0] for p in pts],
                "lat": [p[1] for p in pts],
            })
            print(f"nodes: {len(df)} street vertices from {SHAPEFILE}")
            return df[["node_id", "lat", "lon"]]
        except ImportError:
            print("nodes: geopandas not installed, falling back to grid")

    lats = np.linspace(LAT_MIN, LAT_MAX, N_GRID)
    lons = np.linspace(LON_MIN, LON_MAX, N_GRID)
    LA, LO = np.meshgrid(lats, lons)
    df = pd.DataFrame({
        "node_id": np.arange(LA.size),
        "lat": LA.ravel(),
        "lon": LO.ravel(),
    })
    print(f"nodes: {len(df)} on a {N_GRID}x{N_GRID} grid (FALLBACK -- "
          "state this in the chapter as a simplification)")
    return df


def snap(df_pts, nodes):
    """Attach each point to its nearest node_id."""
    out = []
    nl, no = nodes["lat"].values, nodes["lon"].values
    for _, r in df_pts.iterrows():
        d = (nl - r["lat"]) ** 2 + (no - r["lon"]) ** 2
        out.append(int(nodes["node_id"].values[d.argmin()]))
    return out


def build_shelters(nodes):
    if EXISTING_SHELTERS and Path(EXISTING_SHELTERS).exists():
        df = pd.read_csv(EXISTING_SHELTERS)
        print(f"shelters: loaded {len(df)} from {EXISTING_SHELTERS}")
    else:
        # PLACEHOLDER. Replace with the real Joint Office / Homeless Services
        # list before you report anything. These are approximate downtown and
        # inner-eastside locations only.
        df = pd.DataFrame([
            ("Downtown A",      45.5220, -122.6765),
            ("Downtown B",      45.5185, -122.6790),
            ("Old Town",        45.5260, -122.6720),
            ("Central Eastside",45.5170, -122.6600),
            ("Lloyd",           45.5320, -122.6600),
            ("NE Cully",        45.5580, -122.5920),
            ("SE Powell",       45.4990, -122.6000),
            ("SE Lents",        45.4680, -122.5700),
            ("N Portland",      45.5720, -122.6800),
            ("SW Multnomah",    45.4720, -122.7160),
        ], columns=["name", "lat", "lon"])
        df["capacity"] = DEFAULT_CAPACITY
        print(f"shelters: {len(df)} PLACEHOLDER locations -- REPLACE THESE")

    df["node_id"] = snap(df, nodes)
    return df[["name", "node_id", "lat", "lon", "capacity"]]


def build_agents(nodes):
    df = pd.DataFrame({
        "agent_id": np.arange(N_AGENTS),
        "node_id": rng.choice(nodes["node_id"].values, N_AGENTS),
        "age_bin": rng.choice(AGE_BINS, N_AGENTS, p=AGE_P),
        "comorbidity": rng.choice(COMORBID, N_AGENTS, p=COMORBID_P),
        "awareness_prob": AWARENESS,
        "max_travel_m": MAX_TRAVEL_M,
    })
    print(f"agents: {len(df)} synthetic, placed uniformly at random")
    print("  NOTE: uniform placement is a simplification. If you have PIT-count "
          "densities, weight the placement and say so.")
    return df


if __name__ == "__main__":
    nodes = build_nodes()
    nodes.to_csv(OUT / "nodes.csv", index=False)
    build_shelters(nodes).to_csv(OUT / "shelters.csv", index=False)
    build_agents(nodes).to_csv(OUT / "agents_initial.csv", index=False)
    print(f"\nWrote {OUT}/  ->  now run:  python run_results.py")
