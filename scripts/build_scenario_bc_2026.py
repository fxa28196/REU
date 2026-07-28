#!/usr/bin/env python3
"""Build Scenario B from what Scenario A actually measured.

A is a measurement, not a treatment. It ran the real 36-facility network at its
real capacity against the real population and reported which constraint binds:

    6,842 residents | 2,234 spaces | 2,060 sheltered | 4,766 turned away
    33 of 36 facilities completely full

The binding constraint is CAPACITY, so B relieves capacity and nothing else.
Each real facility is scaled by the same factor so the system total equals the
population; the relative size of each facility, and every coordinate, is
unchanged from A. Any A->B difference is therefore attributable to capacity
alone.

Setting total capacity exactly equal to demand is deliberate: it makes aggregate
capacity non-binding, so whatever failure REMAINS in B can only be geography.
That residual is what Scenario C then optimises.

Scenario C is produced separately by scripts/optimize_2026_placement.py, which
holds B's facility count and per-facility capacity fixed and moves only the
coordinates.
"""
import csv, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "Geography/data/shelters/shelters_2026_current_placement.csv"
DEST = ROOT / "Geography/data/shelters/shelters_2026_expanded_capacity.csv"
REPORT = ROOT / "docs/runs/scenario-b-2026-capacity/capacity_expansion_report.json"

TARGET = 6842        # the population; see FINAL_DATA_VALIDATION_REPORT.md Task 2


def main():
    rows = list(csv.DictReader(open(SRC, encoding="utf-8-sig")))
    cols = list(rows[0].keys())
    caps = [int(r["capacity"]) for r in rows]
    total = sum(caps)
    factor = TARGET / total
    print(f"A: {len(rows)} facilities, {total} spaces")
    print(f"B: scaling every facility by {factor:.4f} to reach {TARGET}")

    # Largest-remainder apportionment: scale, floor, then hand the leftover
    # spaces to the facilities with the largest fractional parts. Guarantees the
    # total is EXACTLY the target rather than a rounding drift.
    exact = [c * factor for c in caps]
    new = [int(x) for x in exact]
    leftover = TARGET - sum(new)
    order = sorted(range(len(rows)), key=lambda i: -(exact[i] - new[i]))
    for i in order[:leftover]:
        new[i] += 1
    assert sum(new) == TARGET, sum(new)

    for r, old, cap in zip(rows, caps, new):
        r["capacity"] = str(cap)
        r["capacity_basis"] = (f"SCENARIO_B_capacity_expansion_{old}x{factor:.4f}"
                               f"_real_location_unchanged")
    with open(DEST, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps({
        "derived_from": "Scenario A measured outcome",
        "a_result": {"population": TARGET, "capacity": total, "sheltered": 2060,
                     "refused_all_full": 4766, "facilities_full": "33/36",
                     "beds_left_empty": 174},
        "binding_constraint_identified": "capacity",
        "method": "uniform proportional scale-up, largest-remainder apportionment",
        "scale_factor": round(factor, 6),
        "facilities": len(rows),
        "capacity_before": total,
        "capacity_after": sum(new),
        "held_fixed": ["facility count", "every coordinate", "opening dates",
                       "population", "demographics", "PM2.5 field",
                       "relative facility size"],
        "changed": ["per-facility capacity only"],
        "why_total_equals_population": (
            "makes aggregate capacity non-binding, so any residual failure in B "
            "is geography rather than scarcity - which is what Scenario C tests"),
        "limitations": [
            "a uniform scale-up is a modelling construct, not an operational plan: "
            "real sites have building-specific physical limits",
            "it assumes added spaces are equivalent in kind to existing ones",
            "no staffing, cost or siting feasibility is represented",
        ],
    }, indent=2), encoding="utf-8")
    print(f"wrote {DEST.name}: {len(rows)} facilities, {sum(new)} spaces")
    print(f"  smallest {min(new)}, largest {max(new)}")


if __name__ == "__main__":
    main()
