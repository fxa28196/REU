#!/usr/bin/env python3
"""Generate batch parameter files for ARM D - need-based admission.

Arm D is arm B with one thing changed: the intake rule. scenarioCode=7 loads
arm B's own shelter file (36 real sites, 6,842 spaces) verbatim; only
triageReserveFraction differs from arm B, where it is absent and therefore 0.
Every other line below is copied character-for-character from
scripts/make_batch_params_2026.py so that a D-vs-B difference cannot come from
anything else.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
BATCH = ROOT / "Geography/batch"
N_AGENTS = 6842

TEMPLATE = """<?xml version="1.0"?>
<!-- ARM D - NEED-BASED ADMISSION, SEED {seed}, RESERVE {frac}
     Arm B's shelter file (36 real locations, 6,842 spaces) with NO change to
     any building, location or bed. The single difference from arm B is the
     admission rule: {pct}% of every site's capacity is held for mobility-limited
     arrivals (floor() per site) instead of being allocated first-come,
     first-served. triageReserveFraction=0.0 reproduces arm B exactly.

     Population n = 6842 is the 2025 Tri-County Point-in-Time count for
     Multnomah County (PSU HRAC, published 2025-11-04). Identical to arms A/B/C.

     enableHeterogeneity=1        residents carry sourced age / sex / mobility /
                                  asthma / COPD attributes and walk at their own
                                  speed (01-POPULATION.md, 03-MOVEMENT.md). This
                                  is also what defines the priority class.
     respectShelterOpeningDates=1 shelters open on their real dates (A-02). -->
<sweep runs="1">
\t<parameter name="numAgents" type="constant" constant_type="int" value="{n}"/>
\t<parameter name="randomSeed" type="constant" constant_type="int" value="{seed}"/>
\t<parameter name="minutesPerTick" type="constant" constant_type="number" value="1.0"/>
\t<parameter name="walkingSpeedMps" type="constant" constant_type="number" value="1.30"/>
\t<parameter name="shelterArrivalDistanceM" type="constant" constant_type="number" value="200.0"/>
\t<parameter name="evacuationThresholdUgM3" type="constant" constant_type="number" value="55.5"/>
\t<parameter name="simulationHours" type="constant" constant_type="int" value="312"/>
\t<parameter name="scenarioCode" type="constant" constant_type="int" value="7"/>
\t<parameter name="enableHeterogeneity" type="constant" constant_type="int" value="1"/>
\t<parameter name="respectShelterOpeningDates" type="constant" constant_type="int" value="1"/>
\t<parameter name="triageReserveFraction" type="constant" constant_type="number" value="{frac}"/>
</sweep>
"""


def main():
    for spec in sys.argv[1:]:
        seed, frac = spec.split(":")
        tag = frac.replace("0.", "").replace(".", "")
        path = BATCH / f"batch_params_2026_D_seed{seed}_r{tag}.xml"
        path.write_text(
            TEMPLATE.format(seed=seed, frac=frac, n=N_AGENTS,
                            pct=f"{float(frac) * 100:g}"),
            encoding="utf-8")
        print("wrote", path.name)


if __name__ == "__main__":
    main()
