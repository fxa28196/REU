#!/usr/bin/env python3
"""Verify the full 2026 three-arm run set and emit the seed-robustness table.

For every run {A,B,C} x seeds (default 42..50) under Geography/output/
<arm>2026-n6842-seed<seed>/ this checks the cross-run invariants that make the
27 runs one experiment rather than 27 experiments:

  1. manifest random_seed == directory seed, scenarioCode == arm code,
     numAgents == 6842;
  2. git_working_tree_dirty is False in every manifest (runs came from
     committed code -- the reproducibility protocol);
  3. data_version_tag is IDENTICAL across all seeds WITHIN each arm (the tag
     covers the four model inputs, and each arm loads a different shelter
     file by design, so tags differ BETWEEN arms and must not differ within);
  4. the source_integrity checksum set is IDENTICAL across all runs
     (same model source compiled for every run);
  5. agents.csv holds exactly numAgents rows;
  6. within each seed, the population is byte-identical across arms
     (SHA-256 over the joined per-agent attribute vector).

Then writes docs/final/results-2026/6_SEED_ROBUSTNESS.csv: one row per run
with the headline outcomes, plus per-arm min/mean/max summary rows, so the
seed-to-seed spread of every reported number is inspectable in one file.

Exit code 0 = all invariants hold.
"""
import csv
import hashlib
import json
import pathlib
import sys

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/final/results-2026"
SEEDS = [int(s) for s in sys.argv[1:]] or list(range(42, 51))
ARM_CODE = {"A": 0, "B": 1, "C": 2}

# The attribute columns that define "the same population" across arms.
POP_COLS = ["agent_id", "starting_encampment", "start_lon", "start_lat",
            "age_years", "sex", "mobility_limited", "asthma_flag",
            "copd_flag", "chronic_physical", "walking_speed_mps"]


def run_dir(arm, seed):
    return ROOT / f"Geography/output/{arm}2026-n6842-seed{seed}"


def main():
    problems = []
    rows = []
    tags = {}              # arm -> set of tags seen
    integrity_sets, commits = set(), {}
    pop_hash = {}          # (seed) -> {arm: sha}

    for arm in "ABC":
        for seed in SEEDS:
            d = run_dir(arm, seed)
            if not d.exists():
                problems.append(f"MISSING run dir {d.name}")
                continue
            m = json.loads((d / "simulation.json").read_text())
            r = m["reproducibility"]
            si = r["source_integrity"]
            p = r["parameters"]

            if int(r["random_seed"]) != seed:
                problems.append(f"{d.name}: manifest seed {r['random_seed']} != {seed}")
            code = int(p.get("scenarioCode", -1))
            if code != ARM_CODE[arm]:
                problems.append(f"{d.name}: scenarioCode {code} != {ARM_CODE[arm]}")
            n = int(p.get("numAgents", -1))
            if n != 6842:
                problems.append(f"{d.name}: numAgents {n} != 6842")
            if si.get("git_working_tree_dirty") is not False:
                problems.append(f"{d.name}: git_working_tree_dirty is not False")

            tags.setdefault(arm, set()).add(r["data_version_tag"])
            commits[d.name] = r["git_commit"][:7]
            integrity_sets.add(tuple(sorted(
                (f["file"], f["sha256"]) for f in si["files"])))

            df = pd.read_csv(d / "agents.csv")
            if len(df) != 6842:
                problems.append(f"{d.name}: agents.csv has {len(df)} rows")

            h = hashlib.sha256(
                df[POP_COLS].sort_values("agent_id").to_csv(index=False)
                .encode()).hexdigest()
            pop_hash.setdefault(seed, {})[arm] = h

            srows = list(csv.DictReader(open(d / "shelters.csv")))
            cap = sum(int(x["capacity"]) for x in srows)
            occ = sum(int(x["final_occupancy"]) for x in srows)
            sh = json.loads((d / "shelters.csv").with_name("simulation.json")
                            .read_text())["population"]
            rows.append({
                "Scenario": arm, "Seed": seed,
                "Git commit": r["git_commit"][:7],
                "Got inside": int((df.final_state == "SHELTERED").sum()),
                "Got inside (%)": round(100 * (df.final_state == "SHELTERED").mean(), 1),
                "Turned away": int((df.final_state == "REFUSED_ALL_FULL").sum()),
                "Could not reach": int((df.final_state == "UNREACHABLE").sum()),
                "Beds left empty": cap - occ,
                "Average walk (m)": round(df.total_travel_distance_m.mean()),
                "Average inhaled dose (ug)": round(df.inhaled_dose_ug.mean()),
                "Person-hours in unhealthy air": round(
                    sh["total_person_hours_above_unhealthy"]),
                "Total exposure (ug m-3 h)": round(sh["exposure_ugm3h"]["total"]),
            })

    for arm, t in tags.items():
        if len(t) != 1:
            problems.append(f"arm {arm}: data_version_tag differs across seeds: {t}")
    if len(integrity_sets) != 1:
        problems.append(f"source_integrity checksum sets differ across runs "
                        f"({len(integrity_sets)} distinct sets)")
    for seed, arms in pop_hash.items():
        if len(set(arms.values())) != 1:
            problems.append(f"seed {seed}: population NOT identical across arms")

    tbl = pd.DataFrame(rows).sort_values(["Scenario", "Seed"])
    summary = []
    for arm in "ABC":
        a = tbl[tbl.Scenario == arm]
        for stat, fn in (("min", "min"), ("mean", "mean"), ("max", "max")):
            s = getattr(a.drop(columns=["Scenario", "Seed", "Git commit"]), fn)()
            summary.append({"Scenario": f"{arm} ({stat} over {len(a)} seeds)",
                            "Seed": "", "Git commit": "",
                            **{k: round(v, 1) for k, v in s.items()}})
    out = pd.concat([tbl, pd.DataFrame(summary)], ignore_index=True)
    OUT.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT / "6_SEED_ROBUSTNESS.csv", index=False)

    print(out.to_string(index=False))
    print(f"\ndata_version_tag by arm: "
          f"{ {a: sorted(t)[0] for a, t in sorted(tags.items())} }")
    print(f"commits: {sorted(set(commits.values()))}")
    print(f"population identical across arms within each seed: "
          f"{all(len(set(a.values())) == 1 for a in pop_hash.values())}")
    if problems:
        print("\nPROBLEMS:")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print(f"\nALL INVARIANTS HOLD for {len(rows)} runs.")


if __name__ == "__main__":
    main()
