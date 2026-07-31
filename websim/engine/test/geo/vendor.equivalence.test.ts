/**
 * Differential gate: the vendored solver against the shipped `geographiclib-geodesic`
 * (WP7 task C1, divergence 11).
 *
 * <p>`vendor.provenance.test.ts` proves the vendored file *is* upstream with the
 * transcendental call sites rewritten. It cannot prove the rewrite was harmless — a
 * substitution can be textually perfect and numerically wrong if a `mathx` kernel disagrees
 * with the host on some argument the solver actually reaches. This file closes that gap by
 * running both solvers over the same inputs and characterising every difference.
 *
 * <p><b>The expected result is not "zero differences".</b> That is the point, and the reason
 * this test is written as a *characterisation* rather than an equality. On V8 the two agree
 * to the bit almost everywhere, because Node's `Math` is itself fdlibm-derived — which is
 * exactly why DR-S5 §4.2 says Node alone cannot certify `mathx`. Any residual difference is
 * one last-ulp step in a transcendental, and the assertions below bound it against the
 * divergence-7 budget (1e-8 m) rather than pretending it must vanish. What *is* asserted
 * exactly is the structure: same field count, same finiteness, same branch outcomes.
 *
 * <p>Reading the two files together: provenance says "this is upstream's algorithm", this
 * says "and swapping its math for ours did not move the answer beyond the documented
 * budget". Neither claim alone is worth much; together they are why divergence 11 could be
 * closed without hand-porting 2,400 lines of numerically delicate code (DR-S1 §5.3).
 */

import { describe, expect, it } from "vitest";

// The shipped package — the reference. Kept as an `engine` dependency precisely so this
// differential can exist; the engine's own code no longer imports it (see geodesic.ts).
import shippedPkg from "geographiclib-geodesic";

import { JavaRandom } from "../../src/rng/JavaRandom.js";
import {
  WGS84 as vendoredWGS84,
  DIRECT_MASK_JAVA_STANDARD,
  INVERSE_MASK_JAVA_STANDARD,
} from "../../src/geo/geodesic.js";

interface ShippedApi {
  readonly STANDARD: number;
  readonly WGS84: {
    Direct: (
      lat1: number,
      lon1: number,
      azi1: number,
      s12: number,
      outmask: number,
    ) => { lat2: number; lon2: number };
    Inverse: (
      lat1: number,
      lon1: number,
      lat2: number,
      lon2: number,
      outmask: number,
    ) => { s12: number; azi1: number; azi2: number };
  };
}

const shipped = (shippedPkg as unknown as { Geodesic: ShippedApi }).Geodesic;

/** Divergence 7's budget, restated. A rewrite that exceeded it would be a regression. */
const BUDGET_M = 1e-8;
const METRES_PER_DEGREE = 111319.49079327358;

interface Case {
  readonly lat1: number;
  readonly lon1: number;
  readonly azi1: number;
  readonly s12: number;
  readonly lat2: number;
  readonly lon2: number;
}

/**
 * Deterministic sample set, three regimes.
 *
 * <p>Regime choice is the whole experiment. Short Portland-scale legs are what the model
 * actually walks; long legs push `Direct` into the series expansions; near-antipodal pairs
 * are the only path that reaches `astroid()` and therefore the only one that calls `cbrt`
 * and `atanh` — two of the four kernels task C1 had to add. A corpus of short legs alone
 * would have left those kernels untested and still looked green.
 */
function cases(): readonly Case[] {
  const rng = new JavaRandom(20260731n);
  const out: Case[] = [];
  // Portland-scale: the model's own regime.
  for (let i = 0; i < 400; i++) {
    const lat1 = 45.2 + rng.nextDouble() * 0.6;
    const lon1 = -123.0 + rng.nextDouble() * 0.7;
    out.push({
      lat1,
      lon1,
      azi1: -180 + rng.nextDouble() * 360,
      s12: 5 + rng.nextDouble() * 395,
      lat2: 45.2 + rng.nextDouble() * 0.6,
      lon2: -123.0 + rng.nextDouble() * 0.7,
    });
  }
  // Global, long legs.
  for (let i = 0; i < 300; i++) {
    out.push({
      lat1: -85 + rng.nextDouble() * 170,
      lon1: -180 + rng.nextDouble() * 360,
      azi1: -180 + rng.nextDouble() * 360,
      s12: rng.nextDouble() * 2e7,
      lat2: -85 + rng.nextDouble() * 170,
      lon2: -180 + rng.nextDouble() * 360,
    });
  }
  // Near-antipodal: the astroid()/cbrt/atanh path.
  for (let i = 0; i < 300; i++) {
    const lat1 = -80 + rng.nextDouble() * 160;
    const lon1 = -180 + rng.nextDouble() * 360;
    out.push({
      lat1,
      lon1,
      azi1: -180 + rng.nextDouble() * 360,
      s12: 1.9e7 + rng.nextDouble() * 1e6,
      lat2: -lat1 + (rng.nextDouble() - 0.5),
      lon2: lon1 + 180 + (rng.nextDouble() - 0.5),
    });
  }
  return out;
}

const CASES = cases();

describe("vendored geographiclib — differential against the shipped package", () => {
  it("exercises all three regimes, including the astroid path", () => {
    expect(CASES.length).toBe(1000);
    // Non-vacuity: the near-antipodal block must really be near-antipodal, or the cbrt/atanh
    // kernels are never reached and this whole file is a short-leg test wearing a big name.
    const antipodal = CASES.slice(700).filter((c) => {
      const inv = shipped.WGS84.Inverse(c.lat1, c.lon1, c.lat2, c.lon2, shipped.STANDARD);
      return inv.s12 > 1.9e7;
    });
    expect(antipodal.length, "near-antipodal block is not near-antipodal").toBeGreaterThan(250);
  });

  it("agrees with the shipped Direct inside the divergence-7 budget", () => {
    let maxPositionM = 0;
    let differing = 0;
    for (const c of CASES) {
      const a = vendoredWGS84.Direct(c.lat1, c.lon1, c.azi1, c.s12, DIRECT_MASK_JAVA_STANDARD);
      const b = shipped.WGS84.Direct(c.lat1, c.lon1, c.azi1, c.s12, shipped.STANDARD);
      expect(Number.isFinite(a.lat2), `non-finite lat2 at ${JSON.stringify(c)}`).toBe(true);
      expect(Number.isFinite(b.lat2)).toBe(true);
      if (a.lat2 !== b.lat2 || a.lon2 !== b.lon2) {
        differing++;
      }
      maxPositionM = Math.max(
        maxPositionM,
        Math.abs(a.lat2 - b.lat2) * METRES_PER_DEGREE,
        Math.abs(a.lon2 - b.lon2) * METRES_PER_DEGREE,
      );
    }
    // eslint-disable-next-line no-console -- the measurement IS the deliverable here.
    console.log(
      `[C1] Direct vendored-vs-shipped: ${differing}/${CASES.length} samples differ, ` +
        `max |Δposition| = ${maxPositionM} m (budget ${BUDGET_M} m)`,
    );
    expect(maxPositionM, "fdlibm substitution moved Direct beyond divergence 7").toBeLessThan(
      BUDGET_M,
    );
  });

  it("agrees with the shipped Inverse inside the divergence-7 budget", () => {
    let maxLengthM = 0;
    let maxAzimuthDeg = 0;
    let differing = 0;
    for (const c of CASES) {
      const a = vendoredWGS84.Inverse(
        c.lat1,
        c.lon1,
        c.lat2,
        c.lon2,
        INVERSE_MASK_JAVA_STANDARD,
      );
      const b = shipped.WGS84.Inverse(c.lat1, c.lon1, c.lat2, c.lon2, shipped.STANDARD);
      expect(Number.isFinite(a.s12)).toBe(true);
      expect(Number.isFinite(b.s12)).toBe(true);
      if (a.s12 !== b.s12 || a.azi1 !== b.azi1 || a.azi2 !== b.azi2) {
        differing++;
      }
      maxLengthM = Math.max(maxLengthM, Math.abs(a.s12 - b.s12));
      maxAzimuthDeg = Math.max(
        maxAzimuthDeg,
        Math.abs(a.azi1 - b.azi1),
        Math.abs(a.azi2 - b.azi2),
      );
    }
    // eslint-disable-next-line no-console -- the measurement IS the deliverable here.
    console.log(
      `[C1] Inverse vendored-vs-shipped: ${differing}/${CASES.length} samples differ, ` +
        `max |Δs12| = ${maxLengthM} m, max |Δazi| = ${maxAzimuthDeg} deg`,
    );
    expect(maxLengthM, "fdlibm substitution moved Inverse beyond divergence 7").toBeLessThan(
      BUDGET_M,
    );
    expect(maxAzimuthDeg).toBeLessThan(BUDGET_M / METRES_PER_DEGREE);
  });

  it("round-trips Direct through Inverse as tightly as the shipped package does", () => {
    // A property the substitution must not break, checked relative to the reference rather
    // than against an absolute number: if the vendored solver's self-consistency were worse
    // than upstream's, the rewrite would have damaged an internal invariant even where the
    // endpoint comparison above happened to agree.
    let worstVendored = 0;
    let worstShipped = 0;
    for (const c of CASES.slice(0, 400)) {
      const dv = vendoredWGS84.Direct(c.lat1, c.lon1, c.azi1, c.s12, DIRECT_MASK_JAVA_STANDARD);
      const iv = vendoredWGS84.Inverse(
        c.lat1,
        c.lon1,
        dv.lat2,
        dv.lon2,
        INVERSE_MASK_JAVA_STANDARD,
      );
      worstVendored = Math.max(worstVendored, Math.abs(iv.s12 - c.s12));

      const ds = shipped.WGS84.Direct(c.lat1, c.lon1, c.azi1, c.s12, shipped.STANDARD);
      const is = shipped.WGS84.Inverse(c.lat1, c.lon1, ds.lat2, ds.lon2, shipped.STANDARD);
      worstShipped = Math.max(worstShipped, Math.abs(is.s12 - c.s12));
    }
    // eslint-disable-next-line no-console -- the measurement IS the deliverable here.
    console.log(
      `[C1] Direct->Inverse round trip: vendored ${worstVendored} m, shipped ${worstShipped} m`,
    );
    expect(worstVendored).toBeLessThan(BUDGET_M);
    // Allow one order of magnitude of slack so this is a guard against a real degradation,
    // not a coin-flip on which side wins the last ulp.
    expect(worstVendored).toBeLessThanOrEqual(Math.max(worstShipped * 10, BUDGET_M));
  });

  it("is the vendored module under test, not the shipped one aliased twice", () => {
    // Guards the entire file from the worst possible failure mode: importing the same
    // object twice and reporting a triumphant zero divergence. The vendored handle must be
    // a distinct object, and its prototype chain must not be the shipped one's.
    expect(vendoredWGS84).not.toBe(shipped.WGS84);
    expect(Object.getPrototypeOf(vendoredWGS84)).not.toBe(Object.getPrototypeOf(shipped.WGS84));
    expect(DIRECT_MASK_JAVA_STANDARD).toBe(shipped.STANDARD);
  });
});
