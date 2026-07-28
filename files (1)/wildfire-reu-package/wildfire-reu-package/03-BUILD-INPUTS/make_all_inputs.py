"""
make_all_inputs.py -- generate EVERY input file the simulation needs.

Run this one script and you get a complete, runnable input set.

    python make_all_inputs.py

OUTPUTS (all into repast_data/)
    nodes.csv               node_id, lat, lon
    shelters.csv            name, node_id, lat, lon, capacity, effective_capacity,
                            facility_type, status, priority_vulnerable
    shelters_postclosure.csv   same, minus facilities closing by 2026-08-31
    agents_initial.csv      agent_id, node_id, age_bin, comorbidity, cover_type,
                            shelter_seeking_prob, max_travel_m, filtration,
                            w_age, w_comorbid, weight
    pm25_by_node_hour.csv   node_id, hour, pm25
    model_settings.json     every scalar setting, for the record

Then run:  python run_results.py

EVERY PARAMETER BELOW CARRIES A TAG
    [T] transcribed from a document
    [C] computed from transcribed values
    [D] a modelling judgement
    [A] assumed, no source          <-- there are 5, all flagged
"""

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

OUT = Path("repast_data")
OUT.mkdir(exist_ok=True)

SEED = 42
rng = np.random.default_rng(SEED)


# =====================================================================
# SECTION 1 — MODEL SETTINGS (scalars)
# =====================================================================
SETTINGS = {
    # --- event window ---
    "event_start": "2020-09-07",
    "event_end":   "2020-09-19",
    "n_days":      13,          # [T] Sept 7-19 inclusive
    "n_hours":     312,         # [C] 13 x 24

    # --- exposure ---
    "epa_unhealthy_pm25": 35.4, # [T] US EPA AQI breakpoint, Unhealthy for Sensitive Groups
    "epa_hazardous_pm25": 250.5,# [T] US EPA AQI breakpoint

    # --- filtration by where the agent is ---
    # [D] three-way split. PATH shows 17% of people sleep with no cover at all
    # and 44% outdoors overall, so a single "outdoor" filtration is wrong.
    "filtration_sheltered":  0.35,   # [A] indoor/outdoor ratio -- UNSOURCED, sweep 0.20-0.60
    "filtration_tent":       0.85,   # [A] minimal protection -- UNSOURCED
    "filtration_no_cover":   1.00,   # [D] full ambient exposure, by definition

    # --- movement ---
    "circuity": 1.4,            # [A] haversine -> street distance; accessibility literature

    # --- run control ---
    "seed": SEED,
    "n_agents": 500,            # [D] = 7.4% of the 6,731 served by HSD in FY25
}


# =====================================================================
# SECTION 2 — AGENT PARAMETERS
# =====================================================================

# --- 2.1 Age [T] PATH Table 2.1, N=541, adults only -------------------
AGE_DISTRIBUTION = {
    "18_44":   0.527,   # [C] 6.3 + 20.3 + 26.1
    "45_64":   0.423,   # [C] 25.3 + 17.0
    "65_plus": 0.050,   # [T]
}

# --- 2.2 Chronic physical condition [T] PATH Table 2.1 ----------------
# "Physical illness, chronic health condition, physical disability" 194 (39.1%)
# Corroborated: CITY reports 69% any-disability; PATH reports 73%.
COMORBIDITY_PREVALENCE = {
    "chronic_physical": 0.391,
    "none":             0.609,
}

# --- 2.3 Cover type [T] PATH Figure 2.5 -------------------------------
# Where people slept MOST OFTEN, past 6 months:
#   any outdoor location            44%
#   outdoors with NO cover at all   17%
#   shelter system                  34%
#   doubled up                       7%
#
# [D] The model represents the unsheltered population. Renormalising the
# 44% outdoor group into "no cover" vs "tent/vehicle/other cover":
#   no cover  = 17/44 = 0.386
#   covered   = 27/44 = 0.614
COVER_DISTRIBUTION = {
    "no_cover": 0.386,   # [C] 17/44 -- park, sidewalk, bus stop
    "tent":     0.614,   # [C] 27/44 -- tent, vehicle, transit, abandoned building
}

# --- 2.4 Shelter-seeking propensity [T] PATH --------------------------
# 67% used a shelter at least once in 6 months
# 34% identified shelter as where they slept MOST often
# Of shelter users: 48% used multiple shelters
# Shelter experience (N=204 commented): 58% negative, 34% positive, 16% mixed
#
# [D] This is WILLINGNESS, not awareness. Renamed accordingly.
SHELTER_SEEKING = {
    "low":     0.34,   # [T] habitual shelter use
    "central": 0.50,   # [C] midpoint
    "high":    0.67,   # [T] any shelter use
}

# --- 2.5 Maximum travel distance --------------------------------------
# [A] NO SOURCE. PATH does not measure willingness to travel.
# Values are standard pedestrian accessibility thresholds:
#   400 m  = 1/4 mile, ~5 min walk
#   800 m  = 1/2 mile, ~10 min walk ("walkable" in planning practice)
#  1600 m  = 1 mile,  ~20 min walk
# Given 39.1% of the population reports a chronic physical condition, the
# shorter end is arguably more realistic. SWEEP ALL THREE and report.
# [T/D] Murphy 2019 (J Soc Distress Homelessness 28(2):96-105): unhoused
# people travel 9-14 miles daily, PRIMARY MODE PUBLIC TRANSIT, walking second.
# 400/800 m are the standard pedestrian catchments; 2000 m approximates
# walk + one transit leg. See pm25_and_travel_sourced.py for full reasoning.
MAX_TRAVEL_M = {
    "walk_5min":         400,
    "walk_10min":        800,
    "walk_plus_transit": 2000,
}

# --- 2.6 Susceptibility weights ---------------------------------------
# [A] NO EPIDEMIOLOGICAL SOURCE. Declared as a policy weighting scheme.
# The verified literature (DeVries, Kriebel & Sama 2017, COPD 14(1):113-121,
# meta-analysis, 37 studies) reports COPD-related events rise ~2.5% per
# 10 ug/m3 PM2.5. That is an ASSOCIATION, not a between-group susceptibility
# ratio -- multiplying a concentration by it is dimensionally invalid.
#
# RUN THE FLAT CASE. If divergence is 0 under flat weights and non-zero
# under modest/strong, the divergence comes from the weighting and not from
# an artefact of the geometry. That check is what makes the result mean
# anything.
WEIGHT_SCHEMES = {
    "flat":   {"age": {"18_44": 1.0, "45_64": 1.0, "65_plus": 1.0},
               "com": {"none": 1.0, "chronic_physical": 1.0}},
    "modest": {"age": {"18_44": 1.0, "45_64": 1.2, "65_plus": 1.5},
               "com": {"none": 1.0, "chronic_physical": 1.5}},
    "strong": {"age": {"18_44": 1.0, "45_64": 1.5, "65_plus": 2.5},
               "com": {"none": 1.0, "chronic_physical": 2.5}},
}
ACTIVE_SCHEME = "modest"


# =====================================================================
# SECTION 3 — SHELTER PARAMETERS
# =====================================================================
# [T] Baseline occupancy, ASR FY2025: 88% overall.
#     congregate 71-99%, alternative 57-97%, motel 62-94%
# [D] effective_capacity = nominal x (1 - baseline_occupancy)
BASELINE_OCCUPANCY = {
    "congregate":   0.88,
    "motel":        0.82,
    "village":      0.85,
    "city_village": 0.85,
    "youth":        0.88,
    "family":       0.88,
    "other":        0.88,
    "day_center":   0.50,   # [A] no published capacity or occupancy
}

# [D] Day centers: 10 exist, none publish capacity. Excluded by default.
# During a DAYTIME smoke event they are arguably the most relevant clean-air
# space in the county. Set to an integer to include them and state it.
DAY_CENTER_NOMINAL_CAPACITY = None


# =====================================================================
# SECTION 4 — PM2.5
# =====================================================================
# [T] Oregon DEQ, 16 Sept 2020: Portland's previous record AQI was 157 (2017);
# the September 2020 record was 477, set 13 September. Two "very unhealthy"
# and two "hazardous" days -- the first hazardous days in a record beginning 1985.
#
# [D] Daily AQI for Sept 7-19 2020, Portland. Days outside DEQ's published
# window are interpolated toward background.
# CORRECTED. Constrained to reproduce DEQ's PUBLISHED category counts for
# Portland 2020: THREE very unhealthy days and FIVE hazardous days
# (DEQ, Wildfire Smoke Trends and the Air Quality Index, May 2023).
# My earlier version said two and two -- that was wrong.
DAILY_PM25 = {
    "2020-09-07":  23.8,  # moderate
    "2020-09-08":  45.5,  # USG
    "2020-09-09": 103.0,  # unhealthy
    "2020-09-10": 313.0,  # hazardous 1
    "2020-09-11": 338.0,  # hazardous 2
    "2020-09-12": 387.9,  # hazardous 3
    "2020-09-13": 450.4,  # hazardous 4 -- DEQ notes Portland's record AQI day
    "2020-09-14": 363.0,  # hazardous 5
    "2020-09-15": 200.4,  # very unhealthy 1
    "2020-09-16": 200.4,  # very unhealthy 2
    "2020-09-17": 200.4,  # very unhealthy 3
    "2020-09-18": 103.0,  # unhealthy
    "2020-09-19":  45.5,  # USG
}

# [T] EPA AQI breakpoints for PM2.5 in force in 2020 (24-hour, ug/m3)
AQI_BREAKPOINTS = [
    (0,   50,    0.0,  12.0),
    (51, 100,   12.1,  35.4),
    (101,150,   35.5,  55.4),
    (151,200,   55.5, 150.4),
    (201,300,  150.5, 250.4),
    (301,400,  250.5, 350.4),
    (401,500,  350.5, 500.4),
]

# [A] Diurnal shape -- INVENTED. Smoke typically settles overnight and lifts
# with afternoon mixing. Normalised to mean 1.0 so daily means are preserved.
DIURNAL = np.array([
    1.15, 1.18, 1.20, 1.20, 1.18, 1.14, 1.08, 1.00,
    0.92, 0.85, 0.80, 0.78, 0.77, 0.78, 0.82, 0.87,
    0.93, 0.99, 1.05, 1.10, 1.13, 1.15, 1.16, 1.17,
])
DIURNAL = DIURNAL / DIURNAL.mean()

# [D] Spatial variation. With SPATIAL_GRADIENT = 0 the field is uniform and
# the divergence index isolates ONE thing: whether vulnerable people live
# near shelters. That is cleaner but narrower. Set >0 to add a west-east
# gradient (a modelling assumption, not an observation).
SPATIAL_GRADIENT = 0.0


def aqi_to_pm25(aqi):
    """Invert the EPA piecewise-linear AQI formula. [C]"""
    for alo, ahi, clo, chi in AQI_BREAKPOINTS:
        if alo <= aqi <= ahi:
            return clo + (aqi - alo) * (chi - clo) / (ahi - alo)
    return 500.4


# =====================================================================
# BUILD
# =====================================================================
def haversine_m(lat1, lon1, lat2, lon2):
    R = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return R * 2 * math.asin(math.sqrt(a))


def build_nodes(shelters_df):
    """
    Street nodes. Priority order:
      1. repast_data/nodes.csv if you already exported it from the shapefile
      2. a grid over Multnomah County (fallback -- STATE THIS IN THE CHAPTER)
    """
    existing = OUT / "nodes.csv"
    if existing.exists():
        df = pd.read_csv(existing)
        print(f"  nodes: {len(df)} loaded from existing {existing}")
        return df

    n = 60
    lats = np.linspace(45.44, 45.62, n)
    lons = np.linspace(-122.84, -122.42, n)
    LA, LO = np.meshgrid(lats, lons)
    df = pd.DataFrame({"node_id": np.arange(LA.size),
                       "lat": LA.ravel(), "lon": LO.ravel()})
    print(f"  nodes: {len(df)} on a {n}x{n} grid  [FALLBACK -- replace with "
          f"your Portland street shapefile vertices and say so in Methods]")
    return df


def snap_to_nodes(df_pts, nodes):
    nl, no = nodes["lat"].values, nodes["lon"].values
    out = []
    for _, r in df_pts.iterrows():
        d = (nl - r["lat"])**2 + (no - r["lon"])**2
        out.append(int(nodes["node_id"].values[d.argmin()]))
    return out


def build_shelters(nodes):
    src = Path("data/shelters_geocoded.csv")
    if not src.exists():
        src = Path("data/shelters_multnomah_2026.csv")
    df = pd.read_csv(src)
    print(f"  shelters: {len(df)} rows from {src}")

    if "lat" not in df.columns or df["lat"].isna().all():
        raise SystemExit(
            "\n  STOP: no coordinates.\n"
            "  Run:  python data/geocode_shelters.py\n"
            "  That writes data/shelters_geocoded.csv with real lat/lon.\n"
            "  I will not invent coordinates for you.\n")

    df = df[df["lat"].notna()].copy()

    if DAY_CENTER_NOMINAL_CAPACITY is None:
        df = df[df["facility_type"] != "day_center"]
    else:
        df.loc[df.facility_type == "day_center", "capacity"] = DAY_CENTER_NOMINAL_CAPACITY

    df = df[df["capacity"].notna()].copy()
    df["capacity"] = df["capacity"].astype(int)
    df["node_id"] = snap_to_nodes(df, nodes)

    df["baseline_occupancy"] = df["facility_type"].map(BASELINE_OCCUPANCY).fillna(0.88)
    df["effective_capacity"] = (
        df["capacity"] * (1 - df["baseline_occupancy"])
    ).round().astype(int).clip(lower=1)

    cols = ["name", "node_id", "lat", "lon", "capacity", "effective_capacity",
            "facility_type", "status", "priority_vulnerable"]
    return df[cols]


def build_agents(nodes, n_agents):
    node_ids = rng.choice(nodes["node_id"].values, n_agents)

    age = rng.choice(list(AGE_DISTRIBUTION), n_agents,
                     p=list(AGE_DISTRIBUTION.values()))
    com = rng.choice(list(COMORBIDITY_PREVALENCE), n_agents,
                     p=list(COMORBIDITY_PREVALENCE.values()))
    cover = rng.choice(list(COVER_DISTRIBUTION), n_agents,
                       p=list(COVER_DISTRIBUTION.values()))

    sch = WEIGHT_SCHEMES[ACTIVE_SCHEME]
    w_age = np.array([sch["age"][a] for a in age])
    w_com = np.array([sch["com"][c] for c in com])

    filt = np.where(cover == "no_cover",
                    SETTINGS["filtration_no_cover"],
                    SETTINGS["filtration_tent"])

    return pd.DataFrame({
        "agent_id": np.arange(n_agents),
        "node_id": node_ids,
        "age_bin": age,
        "comorbidity": com,
        "cover_type": cover,
        "shelter_seeking_prob": SHELTER_SEEKING["central"],
        "max_travel_m": MAX_TRAVEL_M["walk_10min"],
        "filtration_outdoor": filt,
        "w_age": w_age,
        "w_comorbid": w_com,
        "weight": w_age * w_com,
    })


def build_pm25(nodes, n_hours):
    days = sorted(DAILY_PM25)
    daily_pm = np.array([DAILY_PM25[d] for d in days])
    hourly = np.concatenate([m * DIURNAL for m in daily_pm])[:n_hours]

    lon = nodes["lon"].values
    if SPATIAL_GRADIENT > 0:
        span = lon.max() - lon.min()
        factor = 1 - SPATIAL_GRADIENT/2 + SPATIAL_GRADIENT * (lon - lon.min()) / span
    else:
        factor = np.ones(len(nodes))

    rows = []
    for nid, f in zip(nodes["node_id"].values, factor):
        for h, v in enumerate(hourly):
            rows.append((nid, h, round(float(v * f), 2)))

    df = pd.DataFrame(rows, columns=["node_id", "hour", "pm25"])
    return df, daily_pm, hourly


# =====================================================================
def main():
    print("BUILDING ALL SIMULATION INPUTS\n")

    print("[1/5] nodes")
    nodes = build_nodes(None)
    nodes.to_csv(OUT / "nodes.csv", index=False)

    print("\n[2/5] shelters")
    sh = build_shelters(nodes)
    sh.to_csv(OUT / "shelters.csv", index=False)
    post = sh[sh["status"] != "closing"]
    post.to_csv(OUT / "shelters_postclosure.csv", index=False)
    print(f"  pre-closure : {len(sh):>3} facilities, "
          f"{sh.capacity.sum():>5} nominal, {sh.effective_capacity.sum():>4} effective")
    print(f"  post-closure: {len(post):>3} facilities, "
          f"{post.capacity.sum():>5} nominal, {post.effective_capacity.sum():>4} effective")

    print("\n[3/5] agents")
    ag = build_agents(nodes, SETTINGS["n_agents"])
    ag.to_csv(OUT / "agents_initial.csv", index=False)
    print(f"  {len(ag)} agents, weight scheme '{ACTIVE_SCHEME}'")
    print(f"  age      : {dict(ag.age_bin.value_counts(normalize=True).round(3))}")
    print(f"  condition: {dict(ag.comorbidity.value_counts(normalize=True).round(3))}")
    print(f"  cover    : {dict(ag.cover_type.value_counts(normalize=True).round(3))}")
    print(f"  weight   : mean {ag.weight.mean():.3f}, range "
          f"{ag.weight.min():.2f}-{ag.weight.max():.2f}")

    print("\n[4/5] PM2.5")
    pm, daily, hourly = build_pm25(nodes, SETTINGS["n_hours"])
    pm.to_csv(OUT / "pm25_by_node_hour.csv", index=False)
    print(f"  {len(pm):,} rows ({len(nodes)} nodes x {SETTINGS['n_hours']} hours)")
    print(f"  daily means : {daily.round(1).tolist()}")
    print(f"  peak hourly : {hourly.max():.1f} ug/m3")
    print(f"  hours above {SETTINGS['epa_unhealthy_pm25']}: "
          f"{int((hourly > SETTINGS['epa_unhealthy_pm25']).sum())} of {len(hourly)}")
    print(f"  spatial gradient: {SPATIAL_GRADIENT} "
          f"({'UNIFORM' if SPATIAL_GRADIENT == 0 else 'west-east'})")

    print("\n[5/5] settings")
    full = dict(SETTINGS)
    full.update({
        "age_distribution": AGE_DISTRIBUTION,
        "comorbidity_prevalence": COMORBIDITY_PREVALENCE,
        "cover_distribution": COVER_DISTRIBUTION,
        "shelter_seeking": SHELTER_SEEKING,
        "max_travel_m": MAX_TRAVEL_M,
        "weight_scheme_active": ACTIVE_SCHEME,
        "weight_schemes": WEIGHT_SCHEMES,
        "baseline_occupancy": BASELINE_OCCUPANCY,
        "spatial_gradient": SPATIAL_GRADIENT,
        "daily_pm25": DAILY_PM25,
        "pm25_source": "DEQ category counts, Wildfire Smoke Trends Report May 2023",
        "travel_source": "Murphy 2019 + pedestrian catchment standard",
    })
    (OUT / "model_settings.json").write_text(json.dumps(full, indent=2))
    print(f"  wrote {OUT}/model_settings.json")

    print(f"\nDONE. {len(list(OUT.glob('*')))} files in {OUT}/")
    print("Next:  python run_results.py")


if __name__ == "__main__":
    main()
