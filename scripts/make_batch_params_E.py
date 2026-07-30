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
    # 0 = the archived arm shelter file, byte-for-byte. The null must read
    # exactly what the archived run read or the R3 proof is not a proof.
    "shelterPolicyVariant": ("int", "0"),
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
    # 1 = read the RECORDED pet_intake policy joined from the 2026 inventory
    # (4 of 48 facilities admit pets, 422 beds). Correcting A-29: the record is
    # silent for the 2020 shelters but EXPLICIT for the present-day network the
    # E arms run, so refusing everywhere would contradict the source data.
    # petPolicyDefault=0 still governs the 3 facilities (and arm C's 10
    # theoretical new sites) the inventory does not cover.
    "shelterPolicyVariant": ("int", "1"),
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
        # Repast's batch parser silently zeroes NEGATIVE constant_type="number"
        # values (probe-verified 2026-07-30: value="-0.25" executed as 0.0
        # while every positive came through; constant_type="double" executes
        # -0.25 correctly). Found by the pre-push audit; correction note in
        # 13-PHASE-E-PREDICTIONS.md.
        if ptype == "number" and str(pval).lstrip().startswith("-"):
            ptype = "double"
        lines.append('\t<parameter name="%s" type="constant" constant_type="%s" value="%s"/>'
                     % (pname, ptype, pval))
    lines.append("</sweep>")
    path = os.path.join(BATCH, name)
    with open(path, "w", newline="\n") as f:
        f.write("\n".join(lines) + "\n")
    print("wrote", os.path.relpath(path, os.path.join(HERE, "..")))


# Scenario E (V46-V51): the ER baseline-real configuration VERBATIM plus the
# severe layer. Value rationale registered in 13-PHASE-E-PREDICTIONS.md
# ("Scenario-E predictions") BEFORE any run:
#   smokeSeriesCode   1      severe v1 series (A-33 counterfactual)
#   smokeScale        1.0    central = the baked 1.75x transform (V47)
#   closuresCode      1      base schedule, one wave at hour 79 (V48, A-34)
#   pStuck            0.3    midpoint of V49 sweep 0.1-0.5 (A-35)
#   stuckDelayH       3.0    V50 central (A-35)
#   pushThetaThreshold -0.25 band-anchored: P(push|unburdened)=0.60, the V51
#                            fire-incident continue band midpoint (Wood/Bryan/Jin)
#   kPush             1.0    A-35 declared coupling
#   simulationHours   455    one hour UNDER the 456-slice series length. The
#                            schedule's inclusive final tick reads hour index
#                            simulationHours; the observed file carries 576
#                            slices against a 312 h window so the baseline
#                            never noticed, but the severe file is exactly 456
#                            slices, so 456 h pokes one slice past the end and
#                            books ~11k fabricated-zero lookups (found by the
#                            (j) out_of_range gate on the first matrix). 455
#                            consumes every real slice with zero fabrication,
#                            inside the spec's registered "<= 456".
E_SEV = dict(E_REAL)
E_SEV.update({
    "smokeSeriesCode": ("int", "1"),
    "smokeScale": ("number", "1.0"),
    "closuresCode": ("int", "1"),
    "pStuck": ("number", "0.3"),
    "stuckDelayH": ("number", "3.0"),
    "pushThetaThreshold": ("number", "-0.25"),
    "kPush": ("number", "1.0"),
    "simulationHours": ("int", "455"),
})

# Closure-free control: identical severe smoke, no obstacle layer, so the
# smoke effect and the obstacle effect separate cleanly (P-SE3's control).
E_SEV_NOCLOSE = dict(E_SEV)
E_SEV_NOCLOSE.update({"closuresCode": ("int", "0")})

# Scenario E v2: THE WORST PLAUSIBLE CASE (V46 series 2 / V48 code 3).
# Smoke anchored to the worst verified urban wildfire-smoke hour on record
# (Canberra Florey 2496.1 ug/m3, embedded 4.436x transform, A-33); closures
# from the worst-case family - 72 edges in 6 waves, the first inside hours
# 2-6 of onset per the documented same-day pattern (A-34), selected per
# committed draw via closureDraw. Everything else = ER baseline-real verbatim.
E_SEV2 = dict(E_SEV)
E_SEV2.update({
    "smokeSeriesCode": ("int", "2"),
    "closuresCode": ("int", "3"),
})

E_SEV2_NOCLOSE = dict(E_SEV2)
E_SEV2_NOCLOSE.update({"closuresCode": ("int", "0")})


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
    # Scenario E severe: codes 18 (A geometry), 19 (C), 20 (D = B file +
    # reserve), seeds 42-44, with and without the closure schedule.
    for arm, code, reserve in (("E18", 18, None), ("E19", 19, None), ("E20", 20, "0.10")):
        for seed in (42, 43, 44):
            write_file(
                "batch_params_2026_SE_%s_seed%d.xml" % (arm, seed),
                "SCENARIO-E SEVERE COUNTERFACTUAL, %s, seed %d: ER baseline-real values "
                "verbatim plus smokeSeriesCode 1 / smokeScale 1.0 / closuresCode 1 / "
                "pStuck 0.3 / stuckDelayH 3.0 / pushThetaThreshold -0.25 / kPush 1.0 / "
                "456 h (V46-V51, A-33/A-34/A-35). Concentrations are a labeled "
                "counterfactual, never observed magnitudes. Predictions P-SE1..P-SE6 "
                "registered BEFORE any run." % (arm, seed),
                seed, code, E_SEV, reserve=reserve)
            write_file(
                "batch_params_2026_SEnc_%s_seed%d.xml" % (arm, seed),
                "SCENARIO-E NO-CLOSURE CONTROL, %s, seed %d: identical severe smoke, "
                "closuresCode 0 - isolates the smoke effect so the obstacle effect is "
                "attributable (P-SE3 control)." % (arm, seed),
                seed, code, E_SEV_NOCLOSE, reserve=reserve)
    # Scenario E v2 worst case. Registered scope: the draw range is a property
    # of the closure LAYER, so it is swept on the reality arm (E18 x draws
    # 1-3); the C/D geometries run the central draw; every arm gets a
    # closure-free control at the same severity.
    for arm, code, reserve in (("E18", 18, None), ("E19", 19, None), ("E20", 20, "0.10")):
        for seed in (42, 43, 44):
            draws = (1, 2, 3) if arm == "E18" else (1,)
            for d in draws:
                params = dict(E_SEV2)
                params["closureDraw"] = ("int", str(d))
                write_file(
                    "batch_params_2026_SE2_%s_d%d_seed%d.xml" % (arm, d, seed),
                    "SCENARIO-E v2 WORST PLAUSIBLE CASE, %s, draw r%d, seed %d: smoke "
                    "anchored to the worst verified urban wildfire-smoke hour on record "
                    "(Canberra Florey 2496.1 ug/m3, 4.436x, A-33); worst-family closures "
                    "(72 edges, 6 waves, first wave hours 2-6, A-34) draw r%d. ER "
                    "baseline-real values otherwise verbatim. Counterfactual, never "
                    "observed magnitudes. Predictions P-SE7..P-SE11 registered BEFORE "
                    "any run." % (arm, d, seed, d),
                    seed, code, params, reserve=reserve)
            write_file(
                "batch_params_2026_SE2nc_%s_seed%d.xml" % (arm, seed),
                "SCENARIO-E v2 NO-CLOSURE CONTROL, %s, seed %d: identical worst-case "
                "smoke, closuresCode 0 - isolates the smoke effect from the obstacle "
                "effect." % (arm, seed),
                seed, code, E_SEV2_NOCLOSE, reserve=reserve)


if __name__ == "__main__":
    main()
