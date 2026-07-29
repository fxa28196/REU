#!/usr/bin/env python3
"""verify_round4.py — companion to round4_delta_critique.md

SECTION A runs standalone (no repo, stdlib only) and reproduces every
computation cited in the round-4 delta critique. Run: python3 verify_round4.py

SECTION B contains repo-dependent assertions, one stub per critique item,
guarded by path checks so this file always executes cleanly. Wire the
CONFIG paths to the real repo, then re-run; each implemented check prints
PASS/FAIL tagged with its item ID.
"""

import json
import os
import sys
from math import erf, sqrt

# ----------------------------------------------------------------------
# CONFIG — set these when the repo is available (Section B)
# ----------------------------------------------------------------------
# Wired 2026-07-28 to the real repo layout:
#   REPO       — repo root.
#   AGENT_CSV  — arm A (present-day reality), seed 42 per-agent output.
#   MANIFEST_DIR — the repo has no flat manifest directory; manifests live as
#       docs/runs/<scenario>/<run>/simulation.json. They are staged 1:1
#       (renamed <scenario>__<run>.json) into a flat directory so the U-21B
#       listdir-based check runs unmodified on the real files. Rebuild with:
#       find docs/runs -name simulation.json | while read f; do
#         cp "$f" "$STAGE/$(echo ${f#docs/runs/} | sed 's|/simulation.json||;s|/|__|g').json"; done
#   GRAPH_EDGES — no edge-list export with RLIS TYPE exists in the repo
#       (only the raw shapefile Geography/data/Streets.shp); left empty.
REPO = os.environ.get(
    "REU_REPO", r"C:\Users\Chick\OneDrive\Desktop\reu")  # repo root
AGENT_CSV = os.environ.get(
    "REU_AGENT_CSV",
    os.path.join(REPO, "docs", "runs", "present-day-three-arm",
                 "A-seed42", "agents.csv"))  # per-agent output CSV, seed 42
MANIFEST_DIR = os.environ.get(
    "REU_MANIFESTS",
    r"C:\Users\Chick\AppData\Local\Temp\claude"
    r"\C--Users-Chick-OneDrive-Desktop-reu"
    r"\2e9bcfaf-1df6-44c3-a9bf-a52def769b76\scratchpad\manifests_flat")
GRAPH_EDGES = os.environ.get("REU_EDGES", "")    # exported edge list w/ RLIS TYPE

POP = 6842
results = []

def report(item, ok, msg):
    tag = "PASS" if ok else ("FAIL" if ok is False else "INFO")
    line = f"[{tag}] {item}: {msg}"
    results.append((item, ok, msg))
    print(line)

def phi(z):
    return 0.5 * (1.0 + erf(z / sqrt(2.0)))

# ======================================================================
# SECTION A — standalone computations (document-internal arithmetic)
# ======================================================================
print("=" * 72)
print("SECTION A — standalone verification of round-4 computations")
print("=" * 72)

# ---- U-01: mobility-gradient marginal ------------------------------------
P_U, P_O = 0.1522, 0.3478          # doc's stated conditionals
AGE_SHARES = (0.527, 0.423, 0.050) # 18-44 / 45-64 / 65+
p55_main = 0.5 * AGE_SHARES[1] + AGE_SHARES[2]        # ages 45..64 -> half >=55
p55_alt = (9 / 19) * AGE_SHARES[1] + AGE_SHARES[2]     # alternate band edge
marg_main = (1 - p55_main) * P_U + p55_main * P_O
marg_alt = (1 - p55_alt) * P_U + p55_alt * P_O
q_solved = (0.192 - P_U) / (P_O - P_U)
r = P_O / P_U
pu_fix = 0.192 / ((1 - p55_main) + r * p55_main)
po_fix = pu_fix * r
se_prev = sqrt(marg_main * (1 - marg_main) / POP)
report("U-01", abs(marg_main - 0.192) > 2 * se_prev,
       f"stated constants imply marginal {marg_main:.4f} (alt {marg_alt:.4f}) "
       f"vs target 0.1920 — off by {(marg_main-0.192)*100:.2f}pp "
       f"(SE {se_prev*100:.2f}pp); constants only pin 0.192 if P(55+)="
       f"{q_solved:.4f}; corrected constants p_u={pu_fix:.5f}, p_55+={po_fix:.5f}")
report("U-01.diag", None,
       f"doc realized 0.199 sits {abs(0.199-marg_main)/se_prev:.2f} SE from "
       f"implied {marg_main:.4f} and "
       f"{abs(0.199-0.192)/sqrt(0.192*0.808/POP):.2f} SE from target 0.192")

# ---- U-02: realized-speed composition bounds -----------------------------
SH_IMP, MU_IMP = 0.199, 0.95
SH_FREE = 1 - SH_IMP
COPD_DELTA, COPD_SHARE_FREE = 0.19, 0.108
bounds = {}
for m in (1.300, 1.376):
    mu_free = (m - SH_IMP * MU_IMP) / SH_FREE
    bounds[m] = (mu_free, mu_free + COPD_SHARE_FREE * COPD_DELTA)
men = {20: 1.358, 30: 1.433, 40: 1.434, 50: 1.433, 60: 1.339, 70: 1.262}
wom = {20: 1.341, 30: 1.337, 40: 1.390, 50: 1.313, 60: 1.241, 70: 1.132}
def band_mean(t):
    b1 = (12 * t[20] + 10 * t[30] + 5 * t[40]) / 27
    b2 = (5 * t[40] + 10 * t[50] + 5 * t[60]) / 20
    b3 = (5 * ((t[60] + t[70]) / 2) + 15 * t[70]) / 20
    return AGE_SHARES[0] * b1 + AGE_SHARES[1] * b2 + AGE_SHARES[2] * b3
boh_base = (0.684 * band_mean(men) + 0.293 * band_mean(wom)) / (0.684 + 0.293)
report("U-02", bounds[1.376][1] > boh_base + 0.02,
       f"pop-mean 1.376 requires base free mean {bounds[1.376][1]:.3f}; "
       f"pop-mean 1.300 requires {bounds[1.300][1]:.3f}; Bohannon-weighted "
       f"base for this mix ~= {boh_base:.3f} -> reported band cannot include "
       f"the impaired stratum (free-only signature)")

# ---- U-03: apportionment arithmetic --------------------------------------
c_exist = 2234 * 1.5
c_new = POP - c_exist
report("U-03", abs(c_new / 10 - round(c_new / 10)) > 1e-9,
       f"C: {c_new:.1f} beds over 10 sites = {c_new/10:.1f}/site (non-integer); "
       f"B scale {POP/2234:.6f}; apportionment rule + bed-sum invariant required")

# ---- U-04: impaired-speed left tail --------------------------------------
n_imp = round(POP * SH_IMP)
tails = {t: phi((t - MU_IMP) / 0.32) for t in (0.0, 0.2, 0.3)}
report("U-04", None,
       "untruncated N(0.95,0.32) tail counts per run: " + ", ".join(
           f"<{t:.1f} m/s ~ {p*n_imp:.1f}" for t, p in tails.items()) +
       f" of {n_imp}; 5 km at 0.2 m/s = {5000/0.2/3600:.1f} h")

# ---- U-07: 'more vulnerable' union bound ---------------------------------
union = 1.0
for share in (0.199, 0.052, 0.108, 0.148, 0.396):
    union *= (1 - share)
union = 1 - union
report("U-07", abs(union - 0.711) > 0.02,
       f"independence union of listed strata = {union:.3f} vs reported 0.711 "
       f"-> membership predicate is not the plain union; must be published")

# ---- context back-outs used in Section 2 items ---------------------------
d_fail = (18260 - 0.301 * 1000) / 0.699
report("CTX", None,
       f"scenario-A failed walkers average ~{d_fail/1000:.1f} km "
       f"({d_fail/1.33/3600:.1f} h at 1.33 m/s); "
       f"2020 site-night occupancy target for U-08: OCC ~90/99, "
       f"Charles Jordan ~40/99 (Street Roots, night of 2020-09-15)")

# ======================================================================
# SECTION B — repo-dependent assertions (stubs; wire CONFIG then re-run)
# ======================================================================
print()
print("=" * 72)
print("SECTION B — repo-dependent checks")
print("=" * 72)

def blocked(item, need):
    report(item, None, f"BLOCKED-ON-REPO — needs {need}")

# U-03B: bed-sum invariant per arm
if MANIFEST_DIR and os.path.isdir(MANIFEST_DIR):
    # TODO: load each manifest, sum per-facility capacities, assert
    #   arm A == 2234, arms B and C == 6842 exactly.
    blocked("U-03B", "manifest capacity fields (implement TODO)")
else:
    blocked("U-03B", "MANIFEST_DIR")

# U-01B: realized mobility prevalence branch test across seeds
if AGENT_CSV and os.path.isfile(AGENT_CSV):
    # TODO: mean(mobility_limited) per seed; if ~0.201-0.203 the code matches
    #   the doc's constants (doc constants are the bug); if ~0.192 the code
    #   differs from the doc (doc misreports). Assert post-fix within 2 SE of 0.192.
    blocked("U-01B", "per-agent CSV columns (implement TODO)")
else:
    blocked("U-01B", "AGENT_CSV")

# U-02B: per-stratum realized speed bounds
#   TODO: free stratum within Bohannon age x sex bounds; impaired mean within
#   0.95 +/- 2*SE; COPD-only within base-0.19 +/- 2*SE. Needs speed + strata cols.
blocked("U-02B", "AGENT_CSV speed/strata columns")

# U-05B: sex='other' handling
#   TODO: unit-test freeSpeedMean for all sex values; assert no exception and
#   documented mapping; verify ~2.3% of agents carry a defined realized speed.
blocked("U-05B", "PopulationSampler / speed function source")

# U-16B: closed-shelter selection + retarget budget
#   TODO: construct scenario with one future-opening shelter; assert agent
#   neither selects it nor decrements retargetCount before opening; assert
#   budget resets (or is unbounded) on opening events.
blocked("U-16B", "GisAgent.java test harness")

# U-19B: asthma negative-control invariant
if AGENT_CSV and os.path.isfile(AGENT_CSV):
    # TODO: |P(sheltered|asthma) - P(sheltered)| <= 2*sqrt(p(1-p)/n_asthma)
    blocked("U-19B", "sheltered + asthma columns (implement TODO)")
else:
    blocked("U-19B", "AGENT_CSV")

# U-21B: manifest JSON typing / schema
if MANIFEST_DIR and os.path.isdir(MANIFEST_DIR):
    bad = []
    for fn in sorted(os.listdir(MANIFEST_DIR)):
        if not fn.endswith(".json"):
            continue
        try:
            with open(os.path.join(MANIFEST_DIR, fn)) as fh:
                m = json.load(fh)
            # U-21 fix (round-5): the flag is NESTED at
            # reproducibility.source_integrity.git_working_tree_dirty, not at
            # the top level; post-Phase-A typing is JSON boolean on success
            # and the quoted string "unknown" on failure.
            v = (m.get("reproducibility", {})
                  .get("source_integrity", {})
                  .get("git_working_tree_dirty",
                       m.get("git_working_tree_dirty")))
            if not (isinstance(v, bool) or v == "unknown"):
                bad.append((fn, repr(v)))
        except Exception as e:  # malformed JSON is itself a failure
            bad.append((fn, f"unparseable: {e}"))
    report("U-21B", not bad,
           "dirty-flag typing uniform" if not bad else f"nonuniform: {bad[:5]}")
else:
    blocked("U-21B", "MANIFEST_DIR")

# U-27B: freeway/no-ped edge scan + bridge audit
if GRAPH_EDGES and os.path.isfile(GRAPH_EDGES):
    # TODO: assert no edge carries an RLIS freeway/ramp TYPE code; assert the
    #   Willamette-crossing edge set is a subset of the pedestrian-legal
    #   bridges {Broadway, Steel(lower), Burnside, Morrison, Hawthorne,
    #   Tilikum, Sellwood, St Johns}; print component size distribution.
    blocked("U-27B", "edge TYPE attribute export (implement TODO)")
else:
    blocked("U-27B", "GRAPH_EDGES")

# U-08B: two-site calibration comparator
#   TODO: run historical reference (2020 inventory ~1400 + OCC 99 + CJ 99 +
#   Mt Scott standby; population ~2000-2400 per U-12); compare modeled fill
#   per site vs (~90/99 OCC, ~40/99 CJ) on the night of 2020-09-15; report
#   unconstrained demand at OCC (right-censoring).
blocked("U-08B", "reference-config runner")

# ----------------------------------------------------------------------
print()
fails = [r for r in results if r[1] is False]
print(f"Done. {len(results)} checks; {len(fails)} FAIL; "
      f"{sum(1 for r in results if r[1] is None)} INFO/BLOCKED.")
sys.exit(1 if fails else 0)
