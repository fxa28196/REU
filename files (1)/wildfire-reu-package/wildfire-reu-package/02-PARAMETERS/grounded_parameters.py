"""
grounded_parameters.py -- every model parameter traced to a source document.

Built from the five sources Fatima supplied. Nothing here is inferred from
national averages, and nothing is carried over from the old implementation
guide. Where a number is still a judgement call, it says so explicitly.

SOURCES
  [HSD-L]  Multnomah County HSD, "List of HSD shelters", updated July 2026.
           hsd.multco.us/emergency-shelters/list-of-shelters/
  [HSD-D]  Multnomah County HSD, "List of day centers", updated Oct 2025.
           hsd.multco.us/emergency-shelters/day-centers/
  [ASR]    Adult Shelter Review FY2025, Multnomah County HSD. 175 pp.
  [PATH]   The Pathways Study: Survey Findings, published 9 April 2026.
           N = 541, Multnomah County. PSU HRAC / OHSU.
  [CITY]   City of Portland Shelter Services Annual Report FY2023-24.

Run this file to print the verification table.
"""

# =====================================================================
# 1. SHELTER SUPPLY
# =====================================================================
# [HSD-L] 30 capacity-bearing facilities, transcribed individually into
#         data/shelters_multnomah_2026.csv
# [CITY]  9 City sites, 576 units. River District Nav Center appears in BOTH
#         lists (90 units in CITY, 100 beds in HSD-L) -- DEDUPLICATED, HSD
#         figure retained. Net new from CITY: 8 sites, 486 units.

CAPACITY_HSD = 1711          # verified by summation, see verify() below
CAPACITY_CITY_NET = 486      # after removing the River District duplicate
CAPACITY_TOTAL = 2197

CAPACITY_BY_TYPE_HSD = {     # [HSD-L]
    "congregate": 1015,      # 10 facilities
    "motel":       341,      # 6
    "village":     223,      # 10
    "youth":        60,      # 2
    "family":       39,      # 1
    "other":        33,      # 1
}

# Day centers: 10 listed [HSD-D], NO published capacity. Excluded from the
# shelter set by default. NOTE FOR THE CHAPTER: during a DAYTIME smoke event
# these are arguably the most relevant clean-air spaces available. Their
# absence from the model is a stated limitation, not an oversight.
N_DAY_CENTERS = 10

# --- Scheduled closures [HSD-L] --------------------------------------
CLOSURES = {
    "Laurelwood Center":                (120, "2026-08-31", True),
    "River District Navigation Center": (100, "2026-08-31", True),
    "Walnut Park Shelter":              ( 72, "2026-08-31", True),
    "Beacon Village":                   ( 10, "2026-08-31", False),
    "Roseway Inn Motel Shelter":        (120, "2026-12-31", False),
}   # (capacity, date, prioritises veterans/55+/disabled)

# Capacity in facilities that give PRIORITY ACCESS to veterans, adults 55+,
# and people with disabilities [HSD-L]:
#   Laurelwood 120 + River District 100 + Walnut Park 72 + Willamette 130
#   + Kenton Women's Village 19 + Thayer Veterans 17  = 476
CAPACITY_VULNERABILITY_PRIORITISED = 476


# =====================================================================
# 2. OCCUPANCY -- the parameter that most changes model behaviour
# =====================================================================
# [ASR] "Shelters maintained an 88% average nightly occupancy rate"
#       By type: congregate 71-99%, alternative 57-97%, motel 62-94%
#
# The model must NOT start shelters empty. Effective capacity available to
# someone fleeing smoke is the FREE fraction.

BASELINE_OCCUPANCY = 0.88
FREE_FRACTION = 1 - BASELINE_OCCUPANCY     # 0.12

BASELINE_OCCUPANCY_BY_TYPE = {   # midpoints of the [ASR] observed ranges
    "congregate":  0.88,   # range 0.71-0.99
    "village":     0.85,   # "alternative", range 0.57-0.97
    "motel":       0.82,   # range 0.62-0.94
    "youth":       0.88,
    "family":      0.88,
    "other":       0.88,
    "city_village":0.85,
}


# =====================================================================
# 3. POPULATION SERVED
# =====================================================================
N_SERVED_HSD_FY25       = 6731   # [ASR] unique individuals, adult programs
PCT_CHRONIC_HSD         = 0.33   # [ASR]
N_SERVED_CITY_FY24      = 1800   # [CITY] Jul 2022 - Jun 2024
PCT_CHRONIC_CITY        = 0.45   # [CITY] 860 of 1800
AVG_LENGTH_OF_STAY_DAYS = 73     # [ASR]


# =====================================================================
# 4. AGENT AGE DISTRIBUTION                                     [PATH]
# =====================================================================
# Table 2.1, N=541 (19 declined/missing):
#   18-24  33 ( 6.3%)   |  45-54  132 (25.3%)
#   25-34 106 (20.3%)   |  55-64   89 (17.0%)
#   35-44 136 (26.1%)   |  65+     26 ( 5.0%)
#
# ADULTS ONLY. The old under-18 bin is DROPPED -- the survey does not cover
# minors, and that bin carried a relative risk that was never sourceable.

AGE_BINS = ["18_44", "45_64", "65_plus"]
AGE_DISTRIBUTION = {
    "18_44":   0.527,    # 6.3 + 20.3 + 26.1
    "45_64":   0.423,    # 25.3 + 17.0
    "65_plus": 0.050,
}


# =====================================================================
# 5. CHRONIC PHYSICAL HEALTH CONDITION                          [PATH]
# =====================================================================
# Table 2.1 disability (multi-select, 63 declined/missing):
#   Mental illness                                 252 (50.8%)
#   Substance use disorder                         210 (42.3%)
#   Physical illness / chronic condition / physical disability
#                                                  194 (39.1%)   <-- USE THIS
#   Other disability                                73 (14.7%)
#   None of these                                   84 (15.5%)
#   Any disability: 73% of sample; 82% of those who answered
#
# CORROBORATION: [CITY] independently reports 69% of 1,800 sheltered people
# identify as having one or more disability. Two agencies, different
# populations, different methods, 73% vs 69%. State this triangulation.
#
# Replaces the old asthma(18.3%)/COPD(9.0%) split, which was attributed to
# sources that do not report those figures for this population.

COMORBIDITY_STATES = ["none", "chronic_physical"]
COMORBIDITY_PREVALENCE = {"chronic_physical": 0.391, "none": 0.609}
COMORBIDITY_SENSITIVITY = {
    "reported":   0.391,   # as published
    "responder":  0.446,   # 194/435, excluding the 63 non-responders
    "low":        0.313,   # -20%
    "high":       0.469,   # +20%
}


# =====================================================================
# 6. SHELTER-SEEKING PROPENSITY -- renamed, and now empirical    [PATH]
# =====================================================================
# The old model called this "awareness_prob" and set it to 0.3/0.5/0.7 by
# guesswork. Pathways measures the behaviour directly:
#
#   67% (n=360) stayed in a shelter at least once in the last 6 months
#   34% identified the shelter system as where they slept MOST OFTEN
#   Of shelter users: 48% stayed in multiple shelters;
#                     50% of those stayed in 3+ shelters in 6 months
#
# CONCEPTUAL FIX: this is not "awareness." People know shelters exist.
# [PATH] asked shelter users about their experience (N=204 who commented):
#   58% mostly negative, 34% positive, 16% mixed
# citing safety, staff, theft, substance exposure, and rules.
#
# So the parameter is WILLINGNESS, not awareness. Rename it in the model and
# in the chapter -- it changes what the sensitivity analysis means.

SHELTER_SEEKING = {
    "habitual":  0.34,   # slept in shelter most often
    "central":   0.50,   # midpoint -- the reported working value
    "any_use":   0.67,   # used shelter at least once in 6 months
}
# Sweep 0.34 - 0.67. Both endpoints are measured, not assumed.


# =====================================================================
# 7. UNSHELTERED FRACTION                                        [PATH]
# =====================================================================
# Where participants slept MOST OFTEN in the past 6 months:
#   Any outdoor location (incl. tent, vehicle, transit, abandoned building)
#                                                     44%
#   Outdoors with no cover at all (park/sidewalk/bus stop)
#                                                     17%
#   Doubled up                                         7%
#   Shelter system                                    34%
#
# 53% slept outdoors (park/sidewalk/bus stop) at some point.
#
# The 17% with no cover are the agents with ZERO baseline filtration --
# arguably the population your model most needs to represent.

FRAC_UNSHELTERED_MOST_OFTEN = 0.44
FRAC_NO_COVER_AT_ALL        = 0.17
FRAC_DOUBLED_UP             = 0.07
FRAC_SHELTER_MOST_OFTEN     = 0.34


# =====================================================================
# 8. BACKGROUND MOBILITY -- a limitation with a number           [PATH]
# =====================================================================
#   8% did not change where they slept in the last 6 months
#  56% moved 1-9 times
#  35% moved 10+ times
#  Unhoused mean: 7.6 moves per 6 months (median 10+)
#  Involuntary displacement (n=160): 48% displaced 10+ times;
#    64% were told to move by police or law enforcement
#  63% experienced homelessness only within Multnomah County
#
# IMPLICATION FOR THE MODEL: agents have a fixed origin node they return to.
# Over a 13-day event that is defensible, but not free. See verify().

MOVES_PER_6_MONTHS_UNHOUSED = 7.6
FRAC_ONLY_IN_MULTNOMAH      = 0.63


# =====================================================================
# 9. EXPOSURE PARAMETERS
# =====================================================================
EPA_UNHEALTHY_PM25 = 35.4    # US EPA AQI breakpoint, Unhealthy for Sensitive Groups
SHELTER_FILTRATION = 0.35    # STILL UNSOURCED -- sweep 0.20-0.60 and say so
CIRCUITY           = 1.4     # haversine -> street distance, accessibility literature

# Susceptibility weights: see parameters_sourced.py. Declared as a policy
# weighting scheme, swept including a flat null case. NOT epidemiological.



# =====================================================================
# REVISED WEIGHT SCHEMES -- see WEIGHTS_EVIDENCE.md
# Kondo et al. 2019 (IJERPH 16(6):960) meta-analysis of 8 North American
# wildfire-smoke studies reports Elderly:Adult RRR = 1.008 (0.996, 1.020).
# The published age effect is ~1.008, NOT 1.5.
# =====================================================================
WEIGHT_SCHEMES_EVIDENCED = {
    "flat":       {"age": {"18_44": 1.000, "45_64": 1.000, "65_plus": 1.000},
                   "com": {"none": 1.000, "chronic_physical": 1.000}},
    "literature": {"age": {"18_44": 1.000, "45_64": 1.000, "65_plus": 1.008},
                   "com": {"none": 1.000, "chronic_physical": 1.018}},
    "ci_upper":   {"age": {"18_44": 1.000, "45_64": 1.000, "65_plus": 1.020},
                   "com": {"none": 1.000, "chronic_physical": 1.032}},
    "policy":     {"age": {"18_44": 1.0, "45_64": 1.2, "65_plus": 1.5},
                   "com": {"none": 1.0, "chronic_physical": 1.5}},
}
WEIGHT_SOURCES = {
    "flat":       "Null case. Divergence must be ~0; geometry check.",
    "literature": "Kondo et al. 2019 meta-RRR, Tables 2 and 4. PRIMARY.",
    "ci_upper":   "Upper bounds of Kondo et al. 2019 95% CIs.",
    "policy":     "NORMATIVE planning judgement. NOT an epidemiological estimate.",
}

# =====================================================================
# VERIFICATION
# =====================================================================
def verify():
    ok = True

    def check(label, got, want, tol=1e-6):
        nonlocal ok
        good = abs(got - want) < tol
        ok &= good
        print(f"  [{'PASS' if good else 'FAIL'}] {label}: {got} (expect {want})")

    print("ARITHMETIC CHECKS")
    check("age bins sum to 1", sum(AGE_DISTRIBUTION.values()), 1.0, 1e-9)
    check("comorbidity sums to 1", sum(COMORBIDITY_PREVALENCE.values()), 1.0, 1e-9)
    check("HSD capacity by type", sum(CAPACITY_BY_TYPE_HSD.values()), CAPACITY_HSD)
    check("total capacity", CAPACITY_HSD + CAPACITY_CITY_NET, CAPACITY_TOTAL)
    check("18-44 from source rows", 6.3 + 20.3 + 26.1, 52.7, 1e-9)
    check("45-64 from source rows", 25.3 + 17.0, 42.3, 1e-9)
    check("responder-only comorbidity", round(194 / 435, 3), 0.446, 1e-9)

    print("\nCLOSURE IMPACT")
    aug = sum(c for c, d, _ in CLOSURES.values() if d <= "2026-08-31")
    dec = sum(c for c, _, _ in CLOSURES.values())
    vul = sum(c for c, d, v in CLOSURES.values() if v)
    print(f"  Capacity lost by 2026-08-31 : {aug:>5}  ({100*aug/CAPACITY_TOTAL:.1f}% of {CAPACITY_TOTAL})")
    print(f"  Capacity lost by 2026-12-31 : {dec:>5}  ({100*dec/CAPACITY_TOTAL:.1f}%)")
    print(f"  Vulnerability-prioritised   : {vul:>5}  of {CAPACITY_VULNERABILITY_PRIORITISED}"
          f"  = {100*vul/CAPACITY_VULNERABILITY_PRIORITISED:.1f}% LOST")
    gen_total = CAPACITY_TOTAL - CAPACITY_VULNERABILITY_PRIORITISED
    gen_lost = dec - vul
    print(f"  General capacity            : {gen_lost:>5}  of {gen_total}"
          f"  = {100*gen_lost/gen_total:.1f}% lost")
    print(f"  --> vulnerability-prioritised capacity is cut "
          f"{(100*vul/CAPACITY_VULNERABILITY_PRIORITISED)/(100*gen_lost/gen_total):.1f}x "
          f"harder than general capacity")

    print("\nEFFECTIVE CAPACITY AT 88% BASELINE OCCUPANCY")
    for label, cap in [("pre-closure", CAPACITY_TOTAL),
                       ("post 2026-08-31", CAPACITY_TOTAL - aug),
                       ("post 2026-12-31", CAPACITY_TOTAL - dec)]:
        print(f"  {label:<18} nominal {cap:>5}   free {cap*FREE_FRACTION:>6.0f}")
    print(f"  For scale: {N_SERVED_HSD_FY25:,} individuals served by HSD adult programs in FY25")

    print("\nBACKGROUND MOBILITY OVER A 13-DAY EVENT")
    per_day = MOVES_PER_6_MONTHS_UNHOUSED / 182.5
    over_event = per_day * 13
    print(f"  {MOVES_PER_6_MONTHS_UNHOUSED} moves / 6 months = {per_day:.4f} moves/day")
    print(f"  Expected non-smoke moves per agent over 13 days: {over_event:.2f}")
    print(f"  --> roughly {100*over_event:.0f}% of agents would relocate once during the")
    print( "      event window for reasons unrelated to smoke. The fixed-origin")
    print( "      assumption is defensible at 13 days but must be stated as a limitation.")

    print("\nAGENT POPULATION SCALING")
    for n in (100, 500, 1000):
        print(f"  {n:>4} agents = {100*n/N_SERVED_HSD_FY25:.1f}% of the FY25 served population")

    print(f"\n{'ALL CHECKS PASSED' if ok else 'SOME CHECKS FAILED'}")
    return ok


def provenance_table():
    rows = [
        ("Total shelter capacity",      CAPACITY_TOTAL,               "HSD-L + CITY (deduped)"),
        ("Baseline occupancy",          BASELINE_OCCUPANCY,           "ASR FY2025"),
        ("Effective free capacity",     f"{CAPACITY_TOTAL*FREE_FRACTION:.0f}", "derived"),
        ("Capacity lost by 2026-08-31", 302,                          "HSD-L closure notices"),
        ("Age 18-44",                   AGE_DISTRIBUTION['18_44'],    "PATH Table 2.1"),
        ("Age 45-64",                   AGE_DISTRIBUTION['45_64'],    "PATH Table 2.1"),
        ("Age 65+",                     AGE_DISTRIBUTION['65_plus'],  "PATH Table 2.1"),
        ("Chronic physical condition",  COMORBIDITY_PREVALENCE['chronic_physical'],
                                                                      "PATH Table 2.1"),
        ("Any disability (corrob.)",    "0.73 / 0.69",                "PATH / CITY"),
        ("Shelter-seeking (low)",       SHELTER_SEEKING['habitual'],  "PATH: slept in shelter most often"),
        ("Shelter-seeking (high)",      SHELTER_SEEKING['any_use'],   "PATH: any shelter use in 6mo"),
        ("Unsheltered most often",      FRAC_UNSHELTERED_MOST_OFTEN,  "PATH Fig 2.5"),
        ("No cover at all",             FRAC_NO_COVER_AT_ALL,         "PATH Fig 2.5"),
        ("Unhealthy PM2.5 threshold",   EPA_UNHEALTHY_PM25,           "US EPA AQI"),
        ("Shelter filtration",          SHELTER_FILTRATION,           "UNSOURCED - sweep 0.2-0.6"),
        ("Circuity factor",             CIRCUITY,                     "accessibility literature"),
    ]
    w = max(len(r[0]) for r in rows)
    print(f"\n{'PARAMETER':<{w}} | {'VALUE':<14} | SOURCE")
    print("-" * (w + 60))
    for n, v, s in rows:
        print(f"{n:<{w}} | {str(v):<14} | {s}")


if __name__ == "__main__":
    verify()
    provenance_table()
