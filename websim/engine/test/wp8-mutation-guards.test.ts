/**
 * wp8-mutation-guards.test.ts — the four WP8 constants and predicates that a
 * mutation audit found were pinned by NOTHING, or pinned only by luck.
 *
 * Every case here was written against a specific injected defect that the whole
 * existing suite passed. The injection is named in each case so a future reader
 * can re-run it rather than trust this file. Method and results:
 * mutation-test of the severe series / triage reserve / pet policy surface.
 *
 *  1. `SEVERE_PEAK_GATE_SLACK` could be widened from 0.06 to **0.13** — a 2.17x
 *     corrosion of gate (j.3) — with all 40 smoke tests green. The existing
 *     boundary assertion is `severeSeriesPeakWithin(984.75 + SEVERE_PEAK_GATE_SLACK,
 *     984.75)`, which is **self-referential**: it re-derives the expectation from
 *     the constant under test, so it can only ever fail by floating-point
 *     accident (it does fail at 0.07-0.12, and stops failing again at 0.13).
 *     The cases below use literal off-by amounts instead.
 *  2. `DECISION_PARAM_FALLBACKS` — the `intParam`/`doubleParam` ladder from
 *     `ContextCreator.java:248-322` — is imported by **tests only**, always as a
 *     spread base. `bRisk: 42`, `wOfficial: -7.5`, `riskHalfLifeH: 999` passed
 *     all 878 engine+shared tests, because the fixtures build their configs
 *     *from* the table: a wrong value silently redefines the baseline rather
 *     than failing anything.
 *  3. The triage reserve is documented "never released" and `releaseRule()`
 *     returns `"never"` — but `releaseRule` lives in `shelters/triage.ts`, which
 *     the run path does not use (`world/build.ts:302` re-implements it inline).
 *     Releasing the reserve inside `Shelter.isAvailableAt` for the final tick of
 *     a 312 h run was caught by nothing. `hasSpaceFor` is unit-tested;
 *     `isAvailableAt`, the method the run actually calls, was not.
 *  4. QUIRK 11: `shelter.petIntake ?? petPolicyAdmitDefault` collapsed to `||`
 *     passed all 736 engine tests including the 20-run Java door oracle. It is
 *     inert on every shipped preset — arms A/B/C load no `pet_intake` column
 *     (`shelterPolicyVariant = 0`, so the tri-state is `null` everywhere) and
 *     ER/SE run `petPolicyDefault = 0`, where `false || false === false ?? false`.
 *     The one combination that separates them — a site recording REFUSE under a
 *     world default of ADMIT — exists in no archived run, so it is asserted here
 *     or nowhere.
 *
 * Ungated by design: none of this needs `Geography/`, the archive or a built
 * asset. The defects above were each caught (when caught at all) only by
 * artifact-gated suites, so on a clean checkout they were invisible.
 */

import { describe, expect, it } from "vitest";

import {
  SEVERE_PEAK_GATE_SLACK,
  severeSeriesPeakWithin,
} from "../src/smoke/series.js";
import { DECISION_PARAM_FALLBACKS } from "../src/decision/config.js";
import { Shelter } from "../src/shelters/shelter.js";
import { policyRefusedAt } from "../src/shelters/admit.js";

// ---------------------------------------------------------------------------
// 1. Gate (j.3)'s slack is a NUMBER, not "something under 0.15"
// ---------------------------------------------------------------------------

describe("gate (j.3) slack cannot be widened silently", () => {
  it("is exactly 0.06 — the %.1f HALF_UP rendering gap and nothing more", () => {
    // 984.75 renders as 984.8, so the manifest can sit 0.05 above the builder
    // figure legitimately. 0.06 is that gap plus a rounding hair. Injection
    // `SEVERE_PEAK_GATE_SLACK = 0.13` left every other smoke assertion green.
    expect(SEVERE_PEAK_GATE_SLACK).toBe(0.06);
  });

  it("REJECTS a peak 0.10 off the builder figure, with no reference to the constant", () => {
    // The literal 984.85 is the point of this case: the pre-existing boundary
    // assertion re-derived its input from SEVERE_PEAK_GATE_SLACK, so widening
    // the constant moved the expectation with it.
    expect(severeSeriesPeakWithin(984.85, 984.75)).toBe(false);
    expect(severeSeriesPeakWithin(2496.2, 2496.1)).toBe(false);
    // ... while the real %.1f rendering gap still passes.
    expect(severeSeriesPeakWithin(984.8, 984.75)).toBe(true);
  });

  it("keeps 0.07 outside tolerance — the first magnitude a corroded gate admits", () => {
    expect(severeSeriesPeakWithin(984.82, 984.75)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. The doubleParam fallback ladder is an ORACLE, not a fixture default
// ---------------------------------------------------------------------------

describe("DECISION_PARAM_FALLBACKS records the certified fallback ladder", () => {
  it("carries all 19 values from ContextCreator.java:248-322 exactly", () => {
    // Transcribed from WP8-SPEC-decision.md §1.1's "fallback" column. Written
    // out in full rather than spot-checked: every test fixture in the tree
    // spreads this object, so a single wrong entry silently rebases the suite
    // instead of failing it. Injection `bRisk: 42, wOfficial: -7.5,
    // riskHalfLifeH: 999` passed all 878 engine+shared tests.
    expect({ ...DECISION_PARAM_FALLBACKS }).toEqual({
      informationRegime: 0,
      enableHazardDeparture: 0,
      alphaHazard: -8.0,
      bRisk: 0.4,
      wOfficial: 1.1,
      gammaVuln: 0.0,
      sigmaTheta: 0.0,
      riskHalfLifeH: 48.0,
      lambdaOutreachPerDay: 0.0,
      barrierBelongings: 0.0,
      barrierPet: 0.0,
      barrierDependents: 0.0,
      petPolicyAdmitDefault: true,
      betaTravelTime: 1.0,
      betaCapacityPrior: 0.0,
      pushThetaThreshold: -0.25,
      kPush: 1.0,
      pStuck: 0.3,
      stuckDelayH: 3.0,
    });
  });

  it("keeps the two negative constants negative (never-regress gotcha 4)", () => {
    // These are the values a batch writer must declare constant_type="double".
    // A fallback table that had quietly zeroed them would make the port agree
    // with the DEFECT the archived SE runs executed rather than with the spec.
    expect(DECISION_PARAM_FALLBACKS.alphaHazard).toBeLessThan(0);
    expect(DECISION_PARAM_FALLBACKS.pushThetaThreshold).toBeLessThan(0);
    expect(Object.is(DECISION_PARAM_FALLBACKS.pushThetaThreshold, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. The reserve is never released — at the method the run actually calls
// ---------------------------------------------------------------------------

describe("the triage reserve is never released, at any tick", () => {
  /** capacity 10, 2 held back, 8 already in: the last two beds are priority-only. */
  const atTheLine = (): Shelter => {
    const s = new Shelter("S1", "Site", 10, true, 0, 0);
    s.setReservedForPriority(2);
    for (let i = 0; i < 8; i++) {
      s.admit(false);
    }
    return s;
  };

  it("refuses a non-priority arrival through isAvailableAt on every tick", () => {
    // `hasSpaceFor` was already pinned; `isAvailableAt` — the method `step.ts`
    // and `route.ts` call — was not. Injection: release the reserve at
    // `tick >= 18719` (the final tick of a 312 h run). Nothing went red.
    const s = atTheLine();
    expect(s.occupancy).toBe(8);
    for (const tick of [0, 1, 60, 18_718, 18_719, 18_720, 27_360, 1_000_000]) {
      expect(s.isAvailableAt(tick, false), `non-priority admitted at tick ${tick}`).toBe(false);
      expect(s.isAvailableAt(tick, true), `priority refused at tick ${tick}`).toBe(true);
    }
  });

  it("still refuses after a priority arrival takes one of the two held beds", () => {
    const s = atTheLine();
    expect(s.admit(true)).toBe(true);
    expect(s.occupancy).toBe(9);
    expect(s.isAvailableAt(27_360, false)).toBe(false);
    expect(s.isAvailableAt(27_360, true)).toBe(true);
  });

  it("holds the line for a capacity-limited site at the exact boundary", () => {
    // occupancy === capacity - reserved is the refusal point, not capacity.
    const s = new Shelter("S2", "Site", 100, true, 0, 0);
    s.setReservedForPriority(10);
    for (let i = 0; i < 89; i++) {
      s.admit(false);
    }
    expect(s.isAvailableAt(5_000, false)).toBe(true); // 89 < 90
    expect(s.admit(false)).toBe(true); // -> 90
    expect(s.isAvailableAt(5_000, false)).toBe(false); // 90 !< 90
    expect(s.isAvailableAt(5_000, true)).toBe(true); // 90 < 100
  });
});

// ---------------------------------------------------------------------------
// 4. QUIRK 11: a recorded REFUSE must never fall through to the world default
// ---------------------------------------------------------------------------

describe("pet policy is a tri-state — `??`, never `||` (QUIRK 11)", () => {
  const site = (petIntake: boolean | null): Shelter => {
    const s = new Shelter("P", "Pet site", 50, true, 0, 0);
    s.petIntake = petIntake;
    return s;
  };

  it("refuses a pet owner at a site recording REFUSE even when the default ADMITS", () => {
    // The separating case, and the only one: `false ?? true === false` but
    // `false || true === true`. No archived run reaches it — arms A/B/C carry no
    // pet_intake column and ER/SE run petPolicyDefault = 0 — so the `||`
    // collapse passed all 736 engine tests including the Java door oracle.
    expect(policyRefusedAt(site(false), true, false, true)).toBe(true);
  });

  it("keeps the other three combinations exactly as they were", () => {
    expect(policyRefusedAt(site(true), true, false, false)).toBe(false); // site admits, default refuses
    expect(policyRefusedAt(site(null), true, false, true)).toBe(false); // unrecorded -> default admits
    expect(policyRefusedAt(site(null), true, false, false)).toBe(true); // unrecorded -> default refuses
  });

  it("leaves a resident with no pet unaffected by either polarity", () => {
    for (const intake of [true, false, null]) {
      for (const dflt of [true, false]) {
        expect(policyRefusedAt(site(intake), false, false, dflt)).toBe(false);
      }
    }
  });

  it("keeps the dependents disjunct independent of the pet branch", () => {
    const s = site(true);
    s.adultsOnly = true;
    expect(policyRefusedAt(s, false, true, true)).toBe(true);
    expect(policyRefusedAt(s, false, false, true)).toBe(false);
  });
});
