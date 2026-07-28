#!/usr/bin/env python3
"""Generate the batch parameter files for the three-arm present-day experiment.

Arms (see ContextCreator scenario constants):
  A scenarioCode=0  reality: real locations, real capacity
  B scenarioCode=1  capacity raised to meet demand, REAL locations
  C scenarioCode=2  B's capacity, optimally placed

Every arm is identical except scenarioCode, and every seed is identical except
randomSeed, so a difference between two files is the only thing that can explain
a difference between two runs.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
BATCH = ROOT / "Geography/batch"

N_AGENTS = 6842      # 2025 Tri-County PIT: 10,526 homeless, >65% unsheltered
# Seeds may be passed on the command line (e.g. `make_batch_params_2026.py 48 49 50`
# generated the third replication batch); the original experiment used 42/43/44.
SEEDS = [int(s) for s in sys.argv[1:]] or [42, 43, 44]
ARMS = {
    "A": (0, "REALITY - every clean-air-capable facility the county actually "
             "operates today (36 sites, 2,234 people-capacity) at its real "
             "address and real capacity. Establishes which constraint binds."),
    "B": (1, "CAPACITY MEETS DEMAND at the REAL locations. Placement identical "
             "to A, capacity scaled so the system can hold the population. "
             "Any A->B difference is attributable to capacity alone."),
    "C": (2, "B's capacity OPTIMALLY PLACED. Facility count and per-facility "
             "capacity identical to B; only coordinates differ. Any B->C "
             "difference is attributable to placement alone."),
}

TEMPLATE = """<?xml version="1.0"?>
<!-- PRESENT-DAY THREE-ARM EXPERIMENT - ARM {arm}, SEED {seed}
     {desc}

     Population n = {n} is the 2025 Tri-County Point-in-Time count for
     Multnomah County (PSU HRAC, published 2025-11-04): 10,526 people
     experiencing homelessness, of whom more than 65% were unsheltered.
     The model represents the UNSHELTERED only - people outdoors during the
     smoke episode. See docs/final/FINAL_DATA_VALIDATION_REPORT.md Task 2,
     including the report's own caveat that administrative-data changes
     augmented the 2025 unsheltered count.

     enableHeterogeneity=1        residents carry sourced age / sex / mobility /
                                  asthma / COPD attributes and walk at their own
                                  speed (01-POPULATION.md, 03-MOVEMENT.md).
     respectShelterOpeningDates=1 shelters open on their real dates (A-02).

     walkingSpeedMps is declared but IGNORED when heterogeneity is on; it
     applies only to heterogeneity=0 runs. -->
<sweep runs="1">
\t<parameter name="numAgents" type="constant" constant_type="int" value="{n}"/>
\t<parameter name="randomSeed" type="constant" constant_type="int" value="{seed}"/>
\t<parameter name="minutesPerTick" type="constant" constant_type="number" value="1.0"/>
\t<parameter name="walkingSpeedMps" type="constant" constant_type="number" value="1.30"/>
\t<parameter name="shelterArrivalDistanceM" type="constant" constant_type="number" value="200.0"/>
\t<parameter name="evacuationThresholdUgM3" type="constant" constant_type="number" value="55.5"/>
\t<parameter name="simulationHours" type="constant" constant_type="int" value="312"/>
\t<parameter name="scenarioCode" type="constant" constant_type="int" value="{code}"/>
\t<parameter name="enableHeterogeneity" type="constant" constant_type="int" value="1"/>
\t<parameter name="respectShelterOpeningDates" type="constant" constant_type="int" value="1"/>
</sweep>
"""


def main():
    for arm, (code, desc) in ARMS.items():
        for seed in SEEDS:
            path = BATCH / f"batch_params_2026_{arm}_seed{seed}.xml"
            path.write_text(
                TEMPLATE.format(arm=arm, seed=seed, code=code, n=N_AGENTS, desc=desc),
                encoding="utf-8")
            print(f"wrote {path.name}  (scenarioCode={code}, n={N_AGENTS}, seed={seed})")


if __name__ == "__main__":
    main()
