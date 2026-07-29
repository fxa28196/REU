#!/usr/bin/env python3
"""Phase-E invariant gate: the R3 null-identity proof plus the E-layer checks.

This is the companion to `verify_2026_runs.py`, NOT a replacement. That script
verifies the archived pre-E three-arm experiment and must stay green on its own;
nothing here touches it or its outputs. This script verifies runs produced by
the Phase-E decision layer (commit c88de56 onward).

Two modes, either or both may be given:

  --null RUN --reference ARCHIVED_RUN
      R3 NULL IDENTITY. The E0-null configuration turns the decision layer ON
      with every mechanism degenerate (aware=1, L0, latch departure, sigma=0,
      barriers=0, pets admitted), so it must reproduce the archived arm run
      BY CONSTRUCTION. The proof is a byte comparison of the two agents.csv
      files over every column they SHARE -- the null adds the six appended
      Phase-E columns (aware_initial, aware_tick, heavy_belongings, has_pet,
      has_dependents, theta_z) and shelters.csv adds policy_refused, and those
      are excluded from the comparison because the archive has no counterpart.
      Run-identity columns that legitimately differ (sim_id -- a wall-clock
      stamp -- and commit) are excluded too; everything else, including
      random_seed, data_version and the derived sim-clock columns
      time_started_local / time_arrived_local, must match exactly.

  --er RUN [RUN ...]
      Baseline-real E arms. Everything except the identity check.

Checks (one printed line each; SKIP = not applicable, never a failure):

  (a) R3 null identity           agents.csv + shelters.csv shared-column
                                 projections byte-identical; simulation.json
                                 population census identical on the shared
                                 keys; the new "unaware" key is 0.
  (b) U-03 bed sum               sum(shelters.final_occupancy)
                                 == simulation.json population.sheltered
                                 == count of agents.csv reached_shelter == yes.
  (c) Asthma negative control    revised for V39. Asthma has NO mechanism
                                 touching gait or dose, so within the
                                 copd_flag == 0 & mobility_limited == 0 stratum
                                 the asthma 0/1 means of walking_speed_mps must
                                 agree to 0.02 m/s and the means of
                                 inhaled_dose_ug must agree to 3 SE.
                                 Departure TIMING may legitimately differ in an
                                 E arm (gammaVuln routes vulnerability into the
                                 hazard) -- it is reported as an observation,
                                 never a failure.  CAVEAT, printed at run time:
                                 with gammaVuln > 0 the timing channel feeds
                                 dose, so a dose exceedance in an ER arm is a
                                 finding to adjudicate, not necessarily a bug.
  (d) Terminal-state conservation every final_state is in the known vocabulary,
                                 the counts sum to numAgents, and they match
                                 simulation.json population exactly.
  (e) UNAWARE immobility         UNAWARE residents never moved: zero travel
                                 distance and an empty time_started_tick.
  (f) Wachinger acceptance       E arms only. At least one high-barrier
                                 resident (2+ barriers) must still be
                                 UNAWARE/PRE_EVAC at end of run. A monotone
                                 risk-only trigger -- everyone departs once the
                                 smoke is bad enough -- is forbidden by the
                                 risk-perception paradox (Wachinger 2013).
  (g) E-census plausibility      decision_layer realised shares within 3
                                 binomial SE of the configured pAwareInit /
                                 pHeavyBelongings / pHasPet / pHasDependents,
                                 and consistent with agents.csv. Catches a
                                 sampler wired to the wrong parameter.
  (h) Manifest completeness      all 21 Phase-E parameters present in
                                 reproducibility.parameters, and
                                 git_working_tree_dirty is false.

Exit code 0 = every applicable check passed.
"""
import argparse
import hashlib
import json
import math
import pathlib
import re
import sys

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]

# The 21 Phase-E parameters (ContextCreator pNames tail, commit c88de56).
E_PARAMS = [
    "enableDecisionLayer", "pAwareInit", "pHeavyBelongings", "pHasPet",
    "pHasDependents", "groupSpeedDeltaMps", "lambdaOutreachPerDay",
    "informationRegime", "enableHazardDeparture", "sigmaTheta",
    "alphaHazard", "bRisk", "wOfficial", "gammaVuln", "riskHalfLifeH",
    "barrierBelongings", "barrierPet", "barrierDependents",
    "petPolicyDefault", "betaTravelTime", "betaCapacityPrior",
]

# Appended-only output columns (OutcomeLogger, commit c88de56). The archive
# predates them, so the R3 comparison necessarily excludes them.
E_AGENT_COLS = ["aware_initial", "aware_tick", "heavy_belongings", "has_pet",
                "has_dependents", "theta_z"]
E_SHELTER_COLS = ["policy_refused"]

# Run-identity columns that differ between any two runs by construction.
# sim_id embeds a wall-clock stamp; commit is the HEAD at run time.
# Deliberately NOT excluded: time_started_local / time_arrived_local. Those are
# sim-clock instants derived from the tick and the smoke-field anchor, i.e.
# outcomes, and they are among the sharpest identity evidence available.
IDENTITY_EXCLUDE = {"sim_id", "commit"}
# Any future wall-clock column picked up automatically.
WALLCLOCK_RE = re.compile(
    r"(^|_)(generated|created|wallclock|timestamp|run_at|export(ed)?_at)(_|$)",
    re.IGNORECASE)

STATE_TO_CENSUS = {
    "PRE_EVAC": "pre_evac",
    "EN_ROUTE": "en_route",
    "SHELTERED": "sheltered",
    "UNREACHABLE": "unreachable",
    "REFUSED_ALL_FULL": "refused_all_full",
    "UNAWARE": "unaware",
}

# decision_layer realised-share key -> the parameter that must have produced it.
CENSUS_TO_PARAM = {
    "realised_aware": "pAwareInit",
    "realised_heavy_belongings": "pHeavyBelongings",
    "realised_pet": "pHasPet",
    "realised_dependents": "pHasDependents",
}
# decision_layer realised-share key -> the agents.csv column that must agree.
CENSUS_TO_COLUMN = {
    "realised_aware": "aware_initial",
    "realised_heavy_belongings": "heavy_belongings",
    "realised_pet": "has_pet",
    "realised_dependents": "has_dependents",
}

# The manifest prints realised shares with %.4f, so a realised k/n can sit up
# to 5e-5 from the value the sampler actually produced. Slack, not tolerance.
ROUND_SLACK = 1e-4


# --------------------------------------------------------------------------
# check registry (same idiom as analyze_run.py's Checks, but self-printing so
# the operator sees progress on a 6842-row comparison)
# --------------------------------------------------------------------------
class Checks:
    def __init__(self):
        self.results = []

    def add(self, name, ok, detail="", extra_lines=()):
        status = "PASS" if ok else "FAIL"
        self.results.append({"name": name, "status": status,
                             "detail": str(detail)})
        print(f"{status}  {name}" + (f"  --  {detail}" if detail else ""))
        for line in extra_lines:
            print(f"        {line}")
        return ok

    def skip(self, name, why):
        self.results.append({"name": name, "status": "SKIP", "detail": why})
        print(f"SKIP  {name}  --  {why}")
        return True

    @property
    def failed(self):
        return [c for c in self.results if c["status"] == "FAIL"]


# --------------------------------------------------------------------------
# loading
# --------------------------------------------------------------------------
def resolve_run(spec):
    """Accept an absolute/relative path, a Geography/output name, or a
    docs/runs/**/ name. Returns the directory holding simulation.json."""
    p = pathlib.Path(spec)
    candidates = [p, ROOT / spec, ROOT / "Geography" / "output" / spec]
    candidates += sorted(ROOT.glob(f"docs/runs/*/{spec}"))
    candidates += sorted(ROOT.glob(f"docs/runs/**/{spec}"))
    for c in candidates:
        try:
            if (c / "simulation.json").is_file():
                return c.resolve()
        except OSError:
            continue
    raise SystemExit(
        f"ERROR: cannot resolve run '{spec}'. Tried:\n  "
        + "\n  ".join(str(c) for c in candidates[:3])
        + "\n  (plus docs/runs/**/ glob)")


class Run:
    """A loaded run. CSVs are read as RAW TEXT (dtype=str, no NA coercion) so
    that 'identical' means byte-identical field text, not float-equal after two
    independent parses. Numeric views are derived on demand."""

    def __init__(self, path):
        self.path = path
        self.name = path.name
        for req in ("agents.csv", "shelters.csv", "simulation.json"):
            if not (path / req).is_file():
                raise SystemExit(f"ERROR: {path} is missing {req}")
        self.agents = pd.read_csv(path / "agents.csv", dtype=str,
                                  keep_default_na=False)
        self.shelters = pd.read_csv(path / "shelters.csv", dtype=str,
                                    keep_default_na=False)
        self.manifest = json.loads(
            (path / "simulation.json").read_text(encoding="utf-8"))
        self.repro = self.manifest.get("reproducibility", {})
        self.params = self.repro.get("parameters", {})
        self.population = self.manifest.get("population", {})
        self.decision = self.manifest.get("decision_layer", {})

    def num(self, col):
        """Numeric view of an agents.csv column; empty fields become NaN."""
        return pd.to_numeric(self.agents[col], errors="coerce")

    def has_e_block(self):
        return all(c in self.agents.columns for c in E_AGENT_COLS)


def sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def aligned(frame, key, order, cols):
    return frame.set_index(key, drop=False).loc[order, cols].reset_index(drop=True)


# --------------------------------------------------------------------------
# (a) R3 null identity
# --------------------------------------------------------------------------
def compare_table(ck, label, null_df, ref_df, key, e_only_cols, extra_exclude):
    """Byte-compare two output tables on the columns they share."""
    null_cols, ref_cols = list(null_df.columns), list(ref_df.columns)
    only_null = [c for c in null_cols if c not in set(ref_cols)]
    only_ref = [c for c in ref_cols if c not in set(null_cols)]

    ok_cols = (not only_ref) and set(only_null) <= set(e_only_cols)
    ck.add(f"(a) {label}: column-set delta is only the Phase-E block",
           ok_cols,
           f"null-only={only_null or '[]'} ref-only={only_ref or '[]'}")

    shared = [c for c in null_cols if c in set(ref_cols)]
    excluded = [c for c in shared
                if c in IDENTITY_EXCLUDE or c in extra_exclude
                or WALLCLOCK_RE.search(c)]
    cols = [c for c in shared if c not in set(excluded)]
    if key not in cols:
        ck.add(f"(a) {label}: key column '{key}' present and comparable",
               False, f"'{key}' missing from the shared projection")
        return
    print(f"        comparing {len(cols)} shared columns; "
          f"excluded as run-identity: {excluded or '[]'}")

    dup_n = null_df[key].duplicated().sum()
    dup_r = ref_df[key].duplicated().sum()
    if dup_n or dup_r:
        ck.add(f"(a) {label}: {key} is unique on both sides", False,
               f"duplicates null={dup_n} ref={dup_r}")
        return
    ck.add(f"(a) {label}: {key} is unique on both sides", True,
           f"null={len(null_df)} rows, ref={len(ref_df)} rows")

    nset, rset = set(null_df[key]), set(ref_df[key])
    missing, extra = sorted(rset - nset), sorted(nset - rset)
    ck.add(f"(a) {label}: {key} sets match", not missing and not extra,
           f"in ref only={len(missing)} ({missing[:3]}), "
           f"in null only={len(extra)} ({extra[:3]})")

    order = [k for k in null_df[key] if k in rset]
    if not order:
        ck.add(f"(a) {label}: shared-projection byte-identity", False,
               "no common keys to compare")
        return
    A = aligned(null_df, key, order, cols)
    B = aligned(ref_df, key, order, cols)

    per_col, mask = {}, {}
    for c in cols:
        av, bv = A[c].to_numpy(), B[c].to_numpy()
        ne = av != bv
        n_diff = int(ne.sum())
        if n_diff:
            per_col[c] = n_diff
            mask[c] = ne

    ha, hb = sha(A.to_csv(index=False)), sha(B.to_csv(index=False))
    lines = [f"sha256(null projection) = {ha}",
             f"sha256(ref  projection) = {hb}"]
    if per_col:
        lines.append(f"{len(per_col)} of {len(cols)} shared columns differ "
                     f"(rows compared: {len(order)}):")
        ranked = sorted(per_col.items(), key=lambda kv: (-kv[1], kv[0]))
        for c, n in ranked[:20]:
            lines.append(f"  {c:<32s} {n:>6d} differing rows")
        if len(ranked) > 20:
            lines.append(f"  ... and {len(ranked) - 20} more columns")

        # First 5 DISTINCT keys that differ, each with the columns that differ
        # on that row and both values -- a bare FAIL is useless for debugging.
        any_row = None
        for ne in mask.values():
            any_row = ne if any_row is None else (any_row | ne)
        bad_rows = any_row.nonzero()[0][:5]
        lines.append(f"first {len(bad_rows)} differing {key}s "
                     f"(of {int(any_row.sum())}):")
        for i in bad_rows:
            i = int(i)
            bad_cols = [c for c in cols if mask.get(c) is not None and mask[c][i]]
            lines.append(f"  {order[i]}  ({len(bad_cols)} column(s) differ)")
            for c in bad_cols[:6]:
                lines.append(f"      {c:<30s} null={A[c].iloc[i]!r:<22s} "
                             f"ref={B[c].iloc[i]!r}")
            if len(bad_cols) > 6:
                lines.append(f"      ... and {len(bad_cols) - 6} more columns "
                             f"on this row")

    ck.add(f"(a) {label}: shared-projection byte-identity",
           ha == hb and not per_col,
           f"{len(cols)} cols x {len(order)} rows", lines)


def check_r3(ck, null_run, ref_run, extra_exclude):
    print(f"\n--- (a) R3 NULL IDENTITY: {null_run.name}  vs  {ref_run.name} ---")
    compare_table(ck, "agents.csv", null_run.agents, ref_run.agents,
                  "agent_id", E_AGENT_COLS, extra_exclude)
    compare_table(ck, "shelters.csv", null_run.shelters, ref_run.shelters,
                  "shelter_id", E_SHELTER_COLS, extra_exclude)

    # simulation.json population census, shared keys only.
    np_, rp = null_run.population, ref_run.population
    shared_keys = ["pre_evac", "sheltered", "en_route", "unreachable",
                   "refused_all_full", "n_agents"]
    bad = [(k, np_.get(k), rp.get(k)) for k in shared_keys
           if np_.get(k) != rp.get(k)]
    ck.add("(a) simulation.json population census identical on shared keys",
           not bad,
           "; ".join(f"{k}: null={a} ref={b}" for k, a, b in bad) or
           " ".join(f"{k}={np_.get(k)}" for k in shared_keys))

    if "unaware" not in np_:
        ck.add("(a) null run reports population.unaware == 0", False,
               "manifest has no population.unaware key (pre-Phase-E writer?)")
    else:
        ck.add("(a) null run reports population.unaware == 0",
               int(np_["unaware"]) == 0, f"unaware={np_['unaware']}")

    # The pet / adults-only gates must be completely inert in the null.
    if "policy_refused" in null_run.shelters.columns:
        tot = int(pd.to_numeric(null_run.shelters["policy_refused"],
                                errors="coerce").fillna(0).sum())
        ck.add("(a) null run has zero policy refusals", tot == 0,
               f"sum(policy_refused)={tot}")
    else:
        ck.skip("(a) null run has zero policy refusals",
                "shelters.csv has no policy_refused column")


# --------------------------------------------------------------------------
# (b) - (h), per run
# --------------------------------------------------------------------------
def check_bed_sum(ck, run):
    occ = int(pd.to_numeric(run.shelters["final_occupancy"],
                            errors="coerce").fillna(0).sum())
    js = run.population.get("sheltered")
    csv_yes = int((run.agents["reached_shelter"] == "yes").sum())
    csv_state = int((run.agents["final_state"] == "SHELTERED").sum())
    ck.add(f"(b) [{run.name}] U-03 bed sum: shelters == manifest == agents",
           occ == js == csv_yes == csv_state,
           f"final_occupancy={occ} manifest.sheltered={js} "
           f"reached_shelter=yes:{csv_yes} final_state=SHELTERED:{csv_state}")


def check_asthma_control(ck, run):
    need = ["asthma_flag", "copd_flag", "mobility_limited",
            "walking_speed_mps", "inhaled_dose_ug"]
    missing = [c for c in need if c not in run.agents.columns]
    if missing:
        ck.add(f"(c) [{run.name}] asthma negative control", False,
               f"agents.csv missing {missing}")
        return
    asthma = run.num("asthma_flag")
    copd = run.num("copd_flag")
    mob = run.num("mobility_limited")
    stratum = (copd == 0) & (mob == 0) & asthma.notna()
    n_str = int(stratum.sum())
    if n_str == 0 or asthma[stratum].nunique() < 2:
        ck.add(f"(c) [{run.name}] asthma negative control", False,
               "conditioning stratum (copd==0 & mobility_limited==0) is empty "
               "or single-valued -- heterogeneity columns unpopulated?")
        return

    gamma = float(run.params.get("gammaVuln", 0.0) or 0.0)
    caveat = []
    if gamma > 0:
        caveat.append(
            f"CAVEAT gammaVuln={gamma}: V39 routes asthma into the departure "
            "hazard, and departure time feeds dose. A dose exceedance here is "
            "the timing channel, not a gait channel -- adjudicate, do not "
            "silently accept.")

    lines = list(caveat)
    ok = True
    for col, gate in (("walking_speed_mps", 0.02), ("inhaled_dose_ug", None)):
        v = pd.to_numeric(run.agents[col], errors="coerce")[stratum]
        a1, a0 = v[asthma[stratum] == 1].dropna(), v[asthma[stratum] == 0].dropna()
        if len(a1) < 2 or len(a0) < 2:
            ok = False
            lines.append(f"{col}: stratum too small (n1={len(a1)} n0={len(a0)})")
            continue
        m1, m0 = float(a1.mean()), float(a0.mean())
        se = math.sqrt(a1.var(ddof=1) / len(a1) + a0.var(ddof=1) / len(a0))
        z = (m1 - m0) / se if se > 0 else 0.0
        if gate is not None:
            passed = abs(m1 - m0) <= gate
            lines.append(f"{col}: asthma1={m1:.4f} (n={len(a1)}) "
                         f"asthma0={m0:.4f} (n={len(a0)}) |delta|={abs(m1 - m0):.4f} "
                         f"<= {gate} ? {'yes' if passed else 'NO'}  (z={z:.2f})")
        else:
            passed = abs(z) <= 3.0
            lines.append(f"{col}: asthma1={m1:.4f} (n={len(a1)}) "
                         f"asthma0={m0:.4f} (n={len(a0)}) delta={m1 - m0:+.4f} "
                         f"z={z:.2f} |z|<=3 ? {'yes' if passed else 'NO'}")
        ok = ok and passed

    # Departure timing: an OBSERVATION in every mode. V39 permits it in E arms
    # and there is no mechanism for it when gammaVuln == 0, so it is reported
    # either way and gated never.
    t = run.num("time_started_tick")[stratum]
    t1, t0 = t[asthma[stratum] == 1].dropna(), t[asthma[stratum] == 0].dropna()
    if len(t1) and len(t0):
        lines.append(f"OBSERVATION time_started_tick: asthma1={t1.mean():.1f} "
                     f"(n={len(t1)}) asthma0={t0.mean():.1f} (n={len(t0)}) "
                     f"delta={t1.mean() - t0.mean():+.1f} ticks -- not gated (V39)")
    else:
        lines.append("OBSERVATION time_started_tick: no departures in one "
                     "asthma cell -- nothing to report")

    ck.add(f"(c) [{run.name}] asthma negative control (V39 revised)", ok,
           f"stratum copd==0 & mobility_limited==0, n={n_str}", lines)


def check_states(ck, run):
    states = run.agents["final_state"]
    unknown = sorted(set(states) - set(STATE_TO_CENSUS))
    ck.add(f"(d) [{run.name}] final_state vocabulary", not unknown,
           f"unknown states={unknown}" if unknown
           else f"{sorted(set(states))}")

    counts = states.value_counts().to_dict()
    n_rows = len(run.agents)
    n_param = run.params.get("numAgents")
    total = sum(counts.values())
    ck.add(f"(d) [{run.name}] state counts sum to numAgents",
           total == n_rows and (n_param is None or total == int(n_param)),
           f"sum={total} rows={n_rows} numAgents={n_param}")

    mism = []
    for state, key in STATE_TO_CENSUS.items():
        csv_n = int(counts.get(state, 0))
        if key not in run.population:
            if csv_n:
                mism.append(f"{state}: csv={csv_n} manifest key '{key}' ABSENT")
            continue
        js_n = int(run.population[key])
        if csv_n != js_n:
            mism.append(f"{state}: csv={csv_n} manifest.{key}={js_n}")
    ck.add(f"(d) [{run.name}] agents.csv census == simulation.json census",
           not mism,
           "; ".join(mism) or
           " ".join(f"{s}={counts.get(s, 0)}" for s in sorted(STATE_TO_CENSUS)))


def check_unaware_immobility(ck, run):
    un = run.agents[run.agents["final_state"] == "UNAWARE"]
    if un.empty:
        ck.skip(f"(e) [{run.name}] UNAWARE immobility",
                "no UNAWARE residents in this run")
        return
    dist = pd.to_numeric(un["total_travel_distance_m"], errors="coerce")
    moved = un[(dist.fillna(-1) != 0)]
    started = un[un["time_started_tick"].astype(str).str.strip() != ""]
    lines = []
    for label, bad in (("moved", moved), ("has time_started_tick", started)):
        if len(bad):
            lines.append(f"{len(bad)} UNAWARE rows {label}; first 5: "
                         + ", ".join(bad["agent_id"].head(5)))
    ck.add(f"(e) [{run.name}] UNAWARE residents never moved",
           moved.empty and started.empty,
           f"n_unaware={len(un)}", lines)


def check_wachinger(ck, run):
    if not run.has_e_block():
        ck.add(f"(f) [{run.name}] Wachinger acceptance", False,
               "agents.csv has no Phase-E attribute block "
               f"(need {E_AGENT_COLS})")
        return
    heavy = run.num("heavy_belongings").fillna(0)
    pet = run.num("has_pet").fillna(0)
    dep = run.num("has_dependents").fillna(0)
    barriers = heavy + pet + dep
    high = (barriers >= 2) | ((heavy == 1) & (pet == 1))
    n_high = int(high.sum())
    if n_high == 0:
        ck.add(f"(f) [{run.name}] Wachinger acceptance", False,
               "high-barrier stratum is EMPTY -- the barrier attributes were "
               "not sampled, so the constraint cannot be tested")
        return
    state = run.agents["final_state"]
    stayed = high & state.isin(["UNAWARE", "PRE_EVAC"])
    n_stay = int(stayed.sum())
    ck.add(f"(f) [{run.name}] Wachinger acceptance: some high-barrier "
           f"resident never departs",
           n_stay >= 1,
           f"high-barrier n={n_high} (2+ barriers or belongings&pet); "
           f"still UNAWARE/PRE_EVAC at end of run: {n_stay} "
           f"({100.0 * n_stay / n_high:.1f}%)",
           [] if n_stay else
           ["EVERY high-barrier resident departed. A monotone risk-only "
            "trigger is forbidden by the risk-perception paradox "
            "(Wachinger 2013, doi 10.1111/j.1539-6924.2012.01942.x): the "
            "barrier cost c_i is not suppressing departure."])


def check_e_census(ck, run):
    if not run.decision:
        ck.add(f"(g) [{run.name}] E-census plausibility", False,
               "simulation.json has no decision_layer block "
               "(pre-Phase-E writer?)")
        return
    if not run.decision.get("enabled"):
        ck.skip(f"(g) [{run.name}] E-census plausibility",
                "decision_layer.enabled is false")
        return
    n = int(run.decision.get("n_sampled", 0))
    if n <= 0:
        ck.add(f"(g) [{run.name}] E-census plausibility", False,
               f"decision_layer.n_sampled={n}")
        return

    ok, lines = True, []
    for key, pname in CENSUS_TO_PARAM.items():
        if key not in run.decision:
            ok = False
            lines.append(f"{key}: ABSENT from decision_layer")
            continue
        if pname not in run.params:
            ok = False
            lines.append(f"{pname}: ABSENT from reproducibility.parameters")
            continue
        realised = float(run.decision[key])
        target = float(run.params[pname])
        se = math.sqrt(max(target * (1.0 - target), 0.0) / n)
        tol = 3.0 * se + ROUND_SLACK
        passed = abs(realised - target) <= tol
        ok = ok and passed
        lines.append(f"{key}={realised:.4f} vs {pname}={target} "
                     f"|delta|={abs(realised - target):.5f} <= 3SE+slack="
                     f"{tol:.5f} ? {'yes' if passed else 'NO'}")
    ck.add(f"(g) [{run.name}] E-census within 3 binomial SE of configured "
           f"parameters", ok, f"n_sampled={n}", lines)

    # Independent cross-check: the manifest census must agree with the CSV it
    # claims to summarise. Catches a census computed from the wrong counter.
    if not run.has_e_block():
        ck.skip(f"(g) [{run.name}] E-census matches agents.csv",
                "agents.csv has no Phase-E attribute block")
        return
    ok2, lines2 = True, []
    for key, col in CENSUS_TO_COLUMN.items():
        if key not in run.decision:
            continue
        share = float(run.num(col).fillna(0).mean())
        d = abs(share - float(run.decision[key]))
        passed = d <= ROUND_SLACK
        ok2 = ok2 and passed
        lines2.append(f"{key}={run.decision[key]} vs mean({col})={share:.4f} "
                      f"|delta|={d:.6f}")
    ck.add(f"(g) [{run.name}] E-census matches agents.csv columns", ok2,
           f"tolerance {ROUND_SLACK} (manifest rounds to 4 dp)", lines2)


def check_manifest(ck, run):
    missing = [p for p in E_PARAMS if p not in run.params]
    ck.add(f"(h) [{run.name}] all 21 Phase-E parameters in the manifest",
           not missing,
           f"missing {len(missing)}: {missing}" if missing
           else f"{len(E_PARAMS)}/{len(E_PARAMS)} present, "
                f"{len(run.params)} parameters total")
    dirty = run.repro.get("source_integrity", {}).get("git_working_tree_dirty")
    ck.add(f"(h) [{run.name}] git_working_tree_dirty is false",
           dirty is False, f"git_working_tree_dirty={dirty!r}")


def check_run(ck, run, e_arm):
    print(f"\n--- per-run checks: {run.name}  ({run.path}) ---")
    check_bed_sum(ck, run)
    check_asthma_control(ck, run)
    check_states(ck, run)
    check_unaware_immobility(ck, run)
    if e_arm:
        check_wachinger(ck, run)
    else:
        ck.skip(f"(f) [{run.name}] Wachinger acceptance",
                "not an E arm (--er); the null has zero barrier cost by design")
    check_e_census(ck, run)
    check_manifest(ck, run)


# --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--null", metavar="RUNDIR",
                    help="the E0-null run to prove identical to --reference")
    ap.add_argument("--reference", metavar="ARCHIVED_RUNDIR",
                    help="the archived pre-E run the null must reproduce, e.g. "
                         "docs/runs/present-day-three-arm/A-seed42 or A-seed42")
    ap.add_argument("--er", metavar="RUNDIR", nargs="+", default=[],
                    help="baseline-real E arm run directories")
    ap.add_argument("--exclude-col", metavar="NAME", action="append", default=[],
                    help="additional column to exclude from the R3 identity "
                         "comparison (repeatable). Use only with a written "
                         "justification -- every exclusion weakens the proof.")
    args = ap.parse_args()

    if bool(args.null) != bool(args.reference):
        ap.error("--null and --reference must be given together")
    if not args.null and not args.er:
        ap.error("nothing to do: give --null/--reference and/or --er")

    ck = Checks()
    extra_exclude = set(args.exclude_col)
    if extra_exclude:
        print(f"NOTE: operator-supplied identity exclusions: "
              f"{sorted(extra_exclude)}")

    if args.null:
        null_run = Run(resolve_run(args.null))
        ref_run = Run(resolve_run(args.reference))
        check_r3(ck, null_run, ref_run, extra_exclude)
        check_run(ck, null_run, e_arm=False)

    for spec in args.er:
        check_run(ck, Run(resolve_run(spec)), e_arm=True)

    n_fail = len(ck.failed)
    n_skip = sum(1 for c in ck.results if c["status"] == "SKIP")
    n_pass = len(ck.results) - n_fail - n_skip
    print(f"\n=== {n_pass} passed, {n_fail} failed, {n_skip} skipped "
          f"({len(ck.results)} checks) ===")
    if n_fail:
        print("\nFAILURES:")
        for c in ck.failed:
            print(f"  - {c['name']}: {c['detail']}")
        sys.exit(1)
    print("ALL PHASE-E INVARIANTS HOLD.")


if __name__ == "__main__":
    main()
