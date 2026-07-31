/**
 * Cross-check of the two HALF_UP oracle families, and the consolidation that
 * follows from it.
 *
 * <p>Two concurrent tracks each produced a HALF_UP oracle from a **different**
 * Java dumper:
 *
 * <ul>
 *   <li>`engine/test/fixtures/mathx/mathx-format.json` — `MathxFixtureDumper`,
 *       4,163 distinct doubles × 7 precisions. **Canonical.** This is the table
 *       `format.parity.test.ts` gates on.</li>
 *   <li>`engine/test/fixtures/format/half-up-format.tsv` +
 *       `half-up-divergences.tsv` — `HalfUpFormat`, 2,702 distinct doubles × 7
 *       precisions, of which 2,652 appear in no other fixture. **Secondary**,
 *       retained as an independent cross-check and consumed only here.</li>
 * </ul>
 *
 * <p>Duplicated oracles are normally a liability: two files that are supposed to
 * say the same thing, with nothing forcing them to. Comparing them instead makes
 * the duplication pay for itself — two independently written dumpers, run
 * against the same JVM's `java.util.Formatter`, agreeing character for character
 * is much stronger evidence than either file alone, and it is nearly free.
 *
 * <p>What this file establishes, in order:
 *
 * <ol>
 *   <li><b>The two dumpers agree on Java's own output.</b> 50 shared doubles ×
 *       7 precisions = 350 cells, zero disagreements.</li>
 *   <li><b>The port reproduces the secondary table too.</b> 18,802 cells the
 *       canonical fixture never covered, zero failures — a real widening of the
 *       formatter gate, not a restatement of it.</li>
 *   <li><b>`long_cast` cross-checks `truncCast`.</b> The TSV carries a `(long) v`
 *       column that no test read; 2,702/2,702 against `doubleToLong`.</li>
 *   <li><b>Where they disagree, the secondary is wrong, and by how much.</b> The
 *       disagreement is confined to the auxiliary "what exact-binary rounding
 *       would give" column, and it is a defect in `HalfUpFormat`, now fixed.</li>
 *   <li><b>The honest divergence census</b>, derived from ground truth rather
 *       than from the defective column, so it survives a regeneration.</li>
 * </ol>
 *
 * <p><b>The defect.</b> `BigDecimal` has no negative zero, so both dumpers have
 * to restore the sign Java's formatter prints. `MathxFixtureDumper` used
 * `Double.compare(v, 0.0) == -1` — true for every negative, including `-0.0`.
 * `HalfUpFormat` used `doubleToRawLongBits(v) == bits(-0.0)` — true for the
 * literal `-0.0` and nothing else. So in the TSV family every *other* negative
 * that rounds to zero (`-0.05` at N=0, `-0.005` at N=1, `-Double.MIN_VALUE`
 * everywhere) came back unsigned, differed from Java's `-0.00`, and was booked
 * as a shortest-representation divergence. It is not one: JavaScript's `toFixed`
 * — the algorithm the census exists to disqualify — reproduces Java exactly on
 * every one of those cells. `HalfUpFormat.java` has been corrected; the
 * committed TSV bytes predate the fix and are deliberately left as dumped, so
 * the tests below assert against ground truth instead of against that column.
 */

import { describe, expect, it } from "vitest";

import { hexToDouble } from "../../src/mathx/bits.js";
import { javaFormatFixed, FIXED_FORMAT_MAX_MAGNITUDE } from "../../src/mathx/format.js";
import { doubleToLong } from "../../src/mathx/truncCast.js";
import { formatFixture } from "./fixtures.js";
import { halfUpRows, halfUpDivergences, isNegativeZeroArtefact } from "./half-up-oracle.js";

const PRECISIONS = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * `Number#toFixed` switches to exponential notation at 1e21 and is undefined for
 * non-finite inputs, so the "would toFixed get this right?" question is only
 * meaningful below that. Outside it, `toFixed` is not wrong about rounding — it
 * is not answering the question at all.
 */
const TO_FIXED_MAX_MAGNITUDE = 1e21;

function inToFixedDomain(v: number): boolean {
  return Number.isFinite(v) && Math.abs(v) < TO_FIXED_MAX_MAGNITUDE;
}

describe("the two dumpers agree on what Java printed", () => {
  const canonical = new Map(formatFixture.cases.map((c) => [c.bits, c]));
  const shared = halfUpRows.filter((r) => canonical.has(r.bits));

  it("overlaps on a real, non-empty set of doubles", () => {
    // Small but not trivial: the two tables were built from different value
    // generators, so the overlap is the hand-picked classics they both chose.
    // If this ever hits zero the comparison below becomes vacuous.
    expect(shared.length).toBe(50);
  });

  it("agrees character for character on every shared cell, at every precision", () => {
    const disagreements: string[] = [];
    let compared = 0;
    for (const row of shared) {
      const c = canonical.get(row.bits)!;
      for (const p of PRECISIONS) {
        compared++;
        if (row.formatted[p] !== c.formatted[p]) {
          disagreements.push(
            `0x${row.bits} (${row.shortestRepr}) %.${p}f: ` +
              `tsv '${row.formatted[p]}' vs json '${c.formatted[p]}'`,
          );
        }
      }
    }
    expect(compared).toBe(350);
    expect(disagreements).toEqual([]);
  });
});

describe("the secondary table widens the formatter gate", () => {
  it("covers thousands of doubles the canonical fixture does not", () => {
    const canonical = new Set(formatFixture.cases.map((c) => c.bits));
    const novel = halfUpRows.filter((r) => !canonical.has(r.bits));
    expect(halfUpRows.length).toBe(2702);
    expect(novel.length).toBe(2652);
  });

  it("javaFormatFixed reproduces every in-domain cell of it", () => {
    const failures: string[] = [];
    let compared = 0;
    let outOfDomain = 0;
    for (const row of halfUpRows) {
      const v = hexToDouble(row.bits);
      if (Number.isFinite(v) && Math.abs(v) >= FIXED_FORMAT_MAX_MAGNITUDE) {
        outOfDomain++;
        expect(() => javaFormatFixed(v, 2)).toThrow(RangeError);
        continue;
      }
      for (const p of PRECISIONS) {
        compared++;
        const actual = javaFormatFixed(v, p);
        if (actual !== row.formatted[p] && failures.length < 10) {
          failures.push(
            `%.${p}f of 0x${row.bits} (${row.shortestRepr}) = '${actual}', Java '${row.formatted[p]}'`,
          );
        }
      }
    }
    // 2,686 in-domain rows x 7 precisions. The 16 refused rows are the >= 2^53
    // probes, which the formatter declines rather than guesses at.
    expect(outOfDomain).toBe(16);
    expect(compared).toBe(18802);
    expect(failures).toEqual([]);
  });

  it("its long_cast column cross-checks truncCast, including NaN and saturation", () => {
    const failures: string[] = [];
    for (const row of halfUpRows) {
      const actual = doubleToLong(hexToDouble(row.bits)).toString();
      if (actual !== row.longCast && failures.length < 10) {
        failures.push(`(long) 0x${row.bits} (${row.shortestRepr}) = ${actual}, Java ${row.longCast}`);
      }
    }
    expect(failures).toEqual([]);
    // Non-vacuity: the table really does contain the interesting cast cases.
    const byRepr = new Map(halfUpRows.map((r) => [r.shortestRepr, r.longCast]));
    expect(byRepr.get("NaN")).toBe("0");
    expect(byRepr.get("Infinity")).toBe("9223372036854775807");
    expect(byRepr.get("-Infinity")).toBe("-9223372036854775808");
  });
});

describe("where the two disagree, the secondary dumper is the wrong one", () => {
  const canonical = new Map(formatFixture.cases.map((c) => [c.bits, c]));

  it("the disagreement is confined to the auxiliary exact-binary column", () => {
    const disagreeing = halfUpDivergences.filter((d) => {
      const c = canonical.get(d.bits);
      return c !== undefined && c.exactBinary[d.precision] !== d.exactHalfUp;
    });
    // 2 doubles x 7 precisions, both of them negatives that round to zero.
    expect(disagreeing.length).toBe(14);
    expect(new Set(disagreeing.map((d) => d.bits))).toEqual(
      new Set(["8000000000000001", "be112e0be826d695"]),
    );
    // The canonical column carries the sign; the secondary dropped it.
    for (const d of disagreeing) {
      expect(canonical.get(d.bits)!.exactBinary[d.precision]).toBe(`-${d.exactHalfUp}`);
      expect(isNegativeZeroArtefact(d)).toBe(true);
    }
    // ...and the two never disagree about what Java printed.
    for (const d of disagreeing) {
      expect(canonical.get(d.bits)!.formatted[d.precision]).toBe(d.javaOut);
    }
  });

  it("every row the secondary flags as a negative-zero artefact is one toFixed gets RIGHT", () => {
    const artefacts = halfUpDivergences.filter(isNegativeZeroArtefact);

    /**
     * The committed bytes predate the `HalfUpFormat` fix, so they still carry the
     * inflated census. Rather than hard-pin those numbers — which would fail the
     * moment someone regenerates the fixture, and invite them to delete the
     * assertion — both shapes are enumerated and exactly one must hold. Neither
     * branch is a free pass: each pins its own exact counts, and the ground-truth
     * census (237 cells / 231 values) is asserted separately below and is
     * identical either way.
     */
    if (artefacts.length > 0) {
      // Pre-fix bytes: 1,047 of 1,305 flagged cells (80.2%) are artefacts,
      // spanning 327 wholly-artefact values out of 561 flagged.
      expect(halfUpDivergences.length).toBe(1305);
      expect(artefacts.length).toBe(1047);
      expect(new Set(halfUpDivergences.map((d) => d.bits)).size).toBe(561);
      expect(new Set(artefacts.map((d) => d.bits)).size).toBe(339);
    } else {
      // Post-fix bytes: the artefact class is empty and only genuine
      // shortest-representation divergences remain.
      expect(halfUpDivergences.length).toBe(258);
      expect(new Set(halfUpDivergences.map((d) => d.bits)).size).toBe(234);
    }

    // The proof that they are artefacts and not findings: on every one of them
    // the algorithm the census exists to disqualify agrees with Java exactly.
    for (const d of artefacts) {
      const v = hexToDouble(d.bits);
      expect(inToFixedDomain(v)).toBe(true);
      // Deliberate use of the banned API, inside the test that bounds its damage.
      expect(v.toFixed(d.precision)).toBe(d.javaOut);
    }

    // Whichever shape the file is in, the genuine class is the same 258 cells.
    const genuine = halfUpDivergences.filter((d) => !isNegativeZeroArtefact(d));
    expect(genuine.length).toBe(258);
  });

  it("the canonical column is sound, and short by exactly one row it cannot see", () => {
    // No false positives: every row the canonical fixture flags is one toFixed
    // really does get wrong.
    const flagged = formatFixture.cases.filter((c) =>
      c.formatted.some((s, p) => s !== c.exactBinary[p]),
    );
    expect(flagged.length).toBe(formatFixture.nCasesWhereToFixedWouldDiffer);

    const reallyWrong = formatFixture.cases.filter((c) => {
      const v = hexToDouble(c.bits);
      return inToFixedDomain(v) && c.formatted.some((s, p) => v.toFixed(p) !== s);
    });
    const flaggedInDomain = flagged.filter((c) => inToFixedDomain(hexToDouble(c.bits)));
    for (const c of flaggedInDomain) {
      expect(reallyWrong).toContain(c);
    }

    // The one blind spot, in the safe direction: -0.0. BigDecimal-plus-sign
    // reproduces Java's "-0.00", so the proxy sees no divergence, but toFixed
    // prints "0.00" and is wrong. Under-counting is the tolerable failure mode
    // for a non-vacuity census; the TSV's over-counting is not.
    const missed = reallyWrong.filter((c) => !flagged.includes(c));
    expect(missed.map((c) => c.bits)).toEqual(["8000000000000000"]);
    expect((-0).toFixed(2)).toBe("0.00");
    expect(javaFormatFixed(-0, 2)).toBe("-0.00");
  });
});

describe("the honest divergence census over the secondary table", () => {
  /**
   * Derived from ground truth — Java's printed string versus what `toFixed`
   * actually returns — and not from either dumper's exact-binary column. That
   * makes these numbers stable across the `HalfUpFormat` correction: they are
   * what the corrected dumper will report, and what the defective one should
   * have.
   */
  it("toFixed fails 237 of 18,851 cells, across 231 of 2,702 values", () => {
    let cells = 0;
    let wrong = 0;
    const wrongValues = new Set<string>();
    for (const row of halfUpRows) {
      const v = hexToDouble(row.bits);
      if (!inToFixedDomain(v)) {
        continue;
      }
      for (const p of PRECISIONS) {
        cells++;
        if (v.toFixed(p) !== row.formatted[p]) {
          wrong++;
          wrongValues.add(row.bits);
        }
      }
    }
    expect(cells).toBe(18851);
    expect(wrong).toBe(237);
    expect(wrongValues.size).toBe(231);

    // 1,305 flagged − 1,047 artefacts = 258 genuine cells, of which 28 sit
    // outside toFixed's domain (1e21, 1e300, MAX_VALUE and their negatives);
    // 258 − 28 = 230, plus the 7 precisions of the -0.0 row that the
    // BigDecimal-based census structurally cannot see, gives 237.
    const genuine = halfUpDivergences.filter((d) => !isNegativeZeroArtefact(d));
    expect(genuine.length).toBe(258);
    const genuineOutOfDomain = genuine.filter((d) => !inToFixedDomain(hexToDouble(d.bits)));
    expect(genuineOutOfDomain.length).toBe(28);
    expect(genuine.length - genuineOutOfDomain.length + 7).toBe(wrong);
  });

  it("and the port passes every cell the census says toFixed fails", () => {
    let proved = 0;
    for (const row of halfUpRows) {
      const v = hexToDouble(row.bits);
      if (!inToFixedDomain(v)) {
        continue;
      }
      for (const p of PRECISIONS) {
        if (v.toFixed(p) !== row.formatted[p]) {
          expect(javaFormatFixed(v, p)).toBe(row.formatted[p]);
          proved++;
        }
      }
    }
    expect(proved).toBe(237);
  });
});
