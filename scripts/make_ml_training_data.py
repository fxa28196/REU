#!/usr/bin/env python3
"""Model-ready per-agent training table (mentor deliverable).

One row per resident per arm (seed 42 — "one batch, this is the output we
got"): agent INPUTS (age, sex, conditions, sampled walking speed, start
point, distance to that arm's nearest shelter site) joined to agent
OUTCOMES (got inside?, minutes to reach shelter, stops at full doors,
metres walked, hours in unhealthy smoke, micrograms inhaled).

Plain CSV by design: opens directly in Excel, loads directly into pandas.
The full 9-seed evidence lives in the archived runs; this file is the
teaching/training view. scripts/fit_outcome_models.py fits the logistic and
OLS models on the full pooled data and writes ML_MODEL_SUMMARY.md.
"""
import pathlib

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/final/results-2026/ML_TRAINING_DATA.csv"
SEED = 42
ARMS = {
    "A": ("A2026-n6842-seed42", "shelters_2026_current_placement.csv"),
    "B": ("B2026-n6842-seed42", "shelters_2026_expanded_capacity.csv"),
    "C": ("C2026-n6842-seed42", "shelters_2026_expanded_plus_new_sites.csv"),
    "D_r10": ("D2026-n6842-seed42-r10", "shelters_2026_expanded_capacity.csv"),
}


def haversine_m(lon1, lat1, lon2, lat2):
    R = 6371000.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    a = (np.sin((p2 - p1) / 2) ** 2
         + np.cos(p1) * np.cos(p2) * np.sin((np.radians(lon2 - lon1)) / 2) ** 2)
    return 2 * R * np.arcsin(np.sqrt(a))


def main():
    frames = []
    for arm, (run, shcsv) in ARMS.items():
        df = pd.read_csv(ROOT / f"Geography/output/{run}/agents.csv")
        sh = pd.read_csv(ROOT / f"Geography/data/shelters/{shcsv}")
        dist = haversine_m(df.start_lon.to_numpy()[:, None],
                           df.start_lat.to_numpy()[:, None],
                           sh.lon.to_numpy()[None, :],
                           sh.lat.to_numpy()[None, :]).min(axis=1) / 1000.0
        frames.append(pd.DataFrame({
            # identifiers
            "arm": arm, "seed": SEED, "agent_id": df.agent_id,
            # INPUTS (sampled before the run; sources in the registry)
            "age_years": df.age_years,
            "sex": df.sex,
            "mobility_limited": df.mobility_limited,
            "asthma": df.asthma_flag,
            "copd": df.copd_flag,
            "chronic_physical": df.chronic_physical,
            "walking_speed_mps": df.walking_speed_mps,
            "start_lon": df.start_lon, "start_lat": df.start_lat,
            "dist_nearest_shelter_km": dist.round(3),
            # OUTCOMES (what the simulation produced)
            "got_inside": (df.final_state == "SHELTERED").astype(int),
            "final_state": df.final_state,
            "shelter_reached": df.shelter_reached.fillna(""),
            "minutes_to_shelter": df.travel_time_min.round(1),
            "stops_at_full_doors": df.door_refusals,
            "metres_walked": df.total_travel_distance_m.round(0),
            "hours_in_unhealthy_smoke": df.hours_above_unhealthy.round(1),
            "micrograms_inhaled": df.inhaled_dose_ug.round(1),
        }))
    out = pd.concat(frames, ignore_index=True)
    out.to_csv(OUT, index=False)
    print(f"wrote {OUT.name}: {len(out):,} rows "
          f"({len(ARMS)} arms x 6,842 residents, seed {SEED})")


if __name__ == "__main__":
    main()
