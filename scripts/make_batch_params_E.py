#!/usr/bin/env python3
"""Generate the Phase-E batch parameter files (round-5 E cycle).

Two families, all seeds deterministic, all values from the registry rows
V29-V44 (see docs/critique-response/E-LAYER-SPEC.md and
13-PHASE-E-PREDICTIONS.md for the choice rationale):

  E0 null  (R3 vehicle)  - decision layer ON, every mechanism degenerate
                           (aware=1, L0, hazard off, sigma=0, barriers=0,
                           pets admitted). Must reproduce the archived
                           A/B/C runs byte-identically on all outcome
                           columns. Three files: arm A/B/C geometry, seed 42.

  ER baseline-real       - the E-layer's central configuration: awareness
                           0.356 (V29, measured, this event), L1
                           locations-only information, logistic hazard
                           departure, barrier costs at the Tanim midpoints,
                           pets refused (A-29 conservative). Arms A (code 0),
                           C (code 2), D (code 7 + reserve 0.10), seeds
                           42/43/44.

Baseline-real value choices (registered BEFORE any run, rule R2):
  pAwareInit        0.356  V29 point estimate (26/73)
  lambdaOutreach    0.0    the survey's 0.356 is awareness DURING the event,
                           so it already embeds whatever outreach occurred;
                           adding conversion on top would double-count.
                           +AWARE intervention arms (deferred) explore it.
  sigmaTheta        1.0    midpoint of the V35 sweep 0.5-1.5
  alphaHazard      -8.0    A-30 provisional derivation (see predictions doc)
  bRisk             0.4    V36 central
  wOfficial         1.1    V37 central (ln 4.21 = 1.44 is the anchor ceiling)
  gammaVuln         0.25   midpoint of V39 sweep 0-0.5
  riskHalfLifeH     48     midpoint of V36 sweep 12-72
  barrier costs     0.26   midpoint of the Tanim per-barrier 0.10-0.42 (V40)
  petPolicyDefault  0      refuse (A-29 conservative; sweep {0,1} deferred)
  betaTravelTime    1.0    V43; with betaCapacityPrior=0.2 the size prior is
  betaCapacityPrior 0.2    active but impedance-dominated (Cheng 2008)
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
BATCH = os.path.join(HERE, "..", "Geography", "batch")

COMMON = {
    "numAgents": ("int", "6842"),
    "minutesPerTick": ("number", "1.0"),
    "walkingSpeedMps": ("number", "1.30"),
    "shelterArrivalDistanceM": ("number", "200.0"),
    "evacuationThresholdUgM3": ("number", "55.5"),
    "simulationHours": ("int", "312"),
    "enableHeterogeneity": ("int", "1"),
    "respectShelterOpeningDates": ("int", "1"),
}

E_NULL = {
    "enableDecisionLayer": ("int", "1"),
    "pAwareInit": ("number", "1.0"),
    "pHeavyBelongings": ("number", "0.284"),
    "pHasPet": ("number", "0.117"),
    "pHasDependents": ("number", "0.0044"),
    "groupSpeedDeltaMps": ("number", "0.0"),
    "lambdaOutreachPerDay": ("number", "0.0"),
    "informationRegime": ("int", "0"),
    "enableHazardDeparture": ("int", "0"),
    "sigmaTheta": ("number", "0.0"),
    "alphaHazard": ("number", "-8.0"),
    "bRisk": ("number", "0.4"),
    "wOfficial": ("number", "1.1"),
    "gammaVuln": ("number", "0.0"),
    "riskHalfLifeH": ("number", "48.0"),
    "barrierBelongings": ("number", "0.0"),
    "barrierPet": ("number", "0.0"),
    "barrierDependents": ("number", "0.0"),
    "petPolicyDefault": ("int", "1"),
    "betaTravelTime": ("number", "1.0"),
    "betaCapacityPrior": ("number", "0.0"),
}

E_REAL = dict(E_NULL)
E_REAL.update({
    "pAwareInit": ("number", "0.356"),
    "groupSpeedDeltaMps": ("number", "0.06"),
    "informationRegime": ("int", "1"),
    "enableHazardDeparture": ("int", "1"),
    "sigmaTheta": ("number", "1.0"),
    "gammaVuln": ("number", "0.25"),
    "barrierBelongings": ("number", "0.26"),
    "barrierPet": ("number", "0.26"),
    "barrierDependents": ("number", "0.26"),
    "petPolicyDefault": ("int", "0"),
    "betaCapacityPrior": ("number", "0.2"),
})


def write_file(name, header, seed, scenario_code, extra, reserve=None):
    lines = ['<?xml version="1.0"?>', "<!-- %s -->" % header, '<sweep runs="1">']
    params = dict(COMMON)
    params["randomSeed"] = ("int", str(seed))
    params["scenarioCode"] = ("int", str(scenario_code))
    if reserve is not None:
        params["triageReserveFraction"] = ("number", reserve)
    params.update(extra)
    for pname, (ptype, pval) in params.items():
        lines.append('\t<parameter name="%s" type="constant" constant_type="%s" value="%s"/>'
                     % (pname, ptype, pval))
    lines.append("</sweep>")
    path = os.path.join(BATCH, name)
    with open(path, "w", newline="\n") as f:
        f.write("\n".join(lines) + "\n")
    print("wrote", os.path.relpath(path, os.path.join(HERE, "..")))


def main():
    # E0 null (R3): arm geometry A/B/C, decision layer on but fully degenerate.
    for arm, code in (("A", 0), ("B", 1), ("C", 2)):
        write_file(
            "batch_params_2026_E0null_%s_seed42.xml" % arm,
            "PHASE-E R3 NULL, arm %s geometry, seed 42: decision layer ON with every "
            "mechanism degenerate (aware=1, L0 omniscient, latch departure, sigma=0, "
            "barriers=0, pets admitted). MUST reproduce the archived arm-%s seed-42 run "
            "byte-identically on all outcome columns (scripts/verify_E_runs.py)." % (arm, arm),
            42, code, E_NULL)
    # ER baseline-real: arms A (0), C (2), D (7 + reserve 0.10), seeds 42-44.
    for arm, code, reserve in (("A", 0, None), ("C", 2, None), ("D", 7, "0.10")):
        for seed in (42, 43, 44):
            write_file(
                "batch_params_2026_ER_%s_seed%d.xml" % (arm, seed),
                "PHASE-E BASELINE-REAL, arm %s, seed %d: awareness 0.356 (V29, measured, "
                "this event), L1 locations-only information, logistic hazard departure "
                "(V35-V40 registered values), barriers at Tanim midpoints, pets refused "
                "(A-29). Predictions registered in docs/critique-response/"
                "13-PHASE-E-PREDICTIONS.md BEFORE any run." % (arm, seed),
                seed, code, E_REAL, reserve=reserve)


if __name__ == "__main__":
    main()
