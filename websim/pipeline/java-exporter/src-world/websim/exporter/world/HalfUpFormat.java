package websim.exporter.world;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Random;

/**
 * TASK F1 (c) — the oracle for the {@code mathx} HALF_UP emulator.
 *
 * <p>{@code OutcomeLogger} renders every floating column with
 * {@code String.format(Locale.US, "%.Nf", v)} at N &isin; {1, 2, 3, 4, 6}
 * (verified by grep over {@code geography/output/OutcomeLogger.java}). This
 * dumper emits Java's own answer for a wide, deliberately adversarial table of
 * doubles at N = 0..6, so a TypeScript emulator can be compared against real
 * Java rather than against an assumption about what Java does.
 *
 * <p><b>Why this fixture is not optional.</b> Java's {@code %f} does NOT round
 * the exact binary value. {@code java.util.Formatter} converts the double to its
 * SHORTEST round-tripping decimal representation first and then applies HALF_UP
 * to those digits. C's {@code printf} and JavaScript's {@code toFixed} round the
 * exact value. The two disagree whenever the shortest representation ends in a
 * literal '5' at the rounding position while the exact binary value sits just
 * below it — {@code 0.615}, {@code 2.675}, {@code 1.005} are the classic cases.
 * The dumped {@code half-up-divergences.tsv} lists every such disagreement this
 * table finds, so the divergence class is documented rather than discovered in
 * production.
 *
 * <p>All floating inputs are carried as raw IEEE-754 bits; the decimal
 * {@code shortest_repr} column is {@code Double.toString} (round-trip exact) and
 * is a convenience only.
 *
 * <p><b>Which oracle is canonical.</b> Two tracks independently produced a
 * HALF_UP oracle from two different dumpers: this one, and
 * {@code MathxFixtureDumper.dumpFormat} →
 * {@code engine/test/fixtures/mathx/mathx-format.json}. The <b>JSON is
 * canonical</b>: it is the fixture the {@code mathx} parity gate runs on, and
 * its auxiliary exact-binary column is semantically correct. This TSV is
 * retained as an <b>independent cross-check</b> — a second table, from a second
 * dumper, over 2,652 doubles the JSON does not contain — and is consumed by
 * {@code engine/test/mathx/half-up-cross-oracle.test.ts}. On the 50 doubles the
 * two tables share, all 350 Java {@code %f} outputs agree character for
 * character, which is what makes this pairing worth keeping.
 */
final class HalfUpFormat {

	private HalfUpFormat() { }

	/** Precisions dumped. 1/2/3/4/6 are the ones OutcomeLogger actually uses. */
	private static final int[] PRECISIONS = { 0, 1, 2, 3, 4, 5, 6 };

	/** Deterministic seed for the random magnitude sweep (never wall-clock). */
	private static final long SWEEP_SEED = 20260731L;

	static void dump(Io.Manifest man, java.io.File fixtureDir, String displayPrefix) throws IOException {
		List<Double> values = buildTable();

		Io.Sink full = man.sinkAt("format.halfUp",
				new java.io.File(fixtureDir, "half-up-format.tsv"),
				displayPrefix + "half-up-format.tsv");
		String header = "# idx\tbits_hex\tshortest_repr\tf0\tf1\tf2\tf3\tf4\tf5\tf6\tlong_cast";
		String[] preamble = {
			"# Java String.format(Locale.US, \"%.Nf\", v) for N=0..6 -- the HALF_UP oracle (TASK F1 c).",
			"# OutcomeLogger uses N in {1,2,3,4,6}; 0 and 5 are dumped for margin.",
			"# bits_hex = %016x of Double.doubleToRawLongBits -- the authoritative input.",
			"# shortest_repr = Double.toString (round-trip exact, convenience column).",
			"# long_cast = (long) v -- Java narrowing cast semantics (NaN->0, saturating).",
			"# Java rounds the SHORTEST decimal representation, not the exact binary value;",
			"# see half-up-divergences.tsv for every case where that differs from exact HALF_UP.",
			header,
		};
		for (String p : preamble) {
			full.line(p);
		}

		Io.Sink div = man.sinkAt("format.halfUpDivergences",
				new java.io.File(fixtureDir, "half-up-divergences.tsv"),
				displayPrefix + "half-up-divergences.tsv");
		div.line("# rows where Java's %.Nf differs from exact-binary-value HALF_UP");
		div.line("# (exact computed with new BigDecimal(v).setScale(N, RoundingMode.HALF_UP))");
		div.line("# idx\tbits_hex\tshortest_repr\tprecision\tjava_out\texact_half_up\tclass");

		int[] divergencesByPrecision = new int[PRECISIONS.length];
		int divergentRows = 0;

		for (int i = 0; i < values.size(); i++) {
			double v = values.get(i).doubleValue();
			StringBuilder sb = new StringBuilder(160);
			sb.append(i).append('\t').append(Io.hexD(v)).append('\t').append(Double.toString(v));
			boolean rowDiverges = false;
			for (int pi = 0; pi < PRECISIONS.length; pi++) {
				String out = String.format(Locale.US, "%." + PRECISIONS[pi] + "f", v);
				sb.append('\t').append(out);
				String exact = exactHalfUp(v, PRECISIONS[pi]);
				if (exact != null && !exact.equals(out)) {
					divergencesByPrecision[pi]++;
					rowDiverges = true;
					div.line(i + "\t" + Io.hexD(v) + "\t" + Double.toString(v) + "\t"
							+ PRECISIONS[pi] + "\t" + out + "\t" + exact + "\t"
							+ (Double.doubleToRawLongBits(v) == Double.doubleToRawLongBits(-0.0)
									? "NEGATIVE_ZERO" : "SHORTEST_REPR_TIE"));
				}
			}
			sb.append('\t').append((long) v);
			full.line(sb.toString());
			if (rowDiverges) {
				divergentRows++;
			}
		}
		full.close();
		div.close();

		StringBuilder detail = new StringBuilder();
		for (int pi = 0; pi < PRECISIONS.length; pi++) {
			if (pi > 0) {
				detail.append(", ");
			}
			detail.append("N=").append(PRECISIONS[pi]).append(':').append(divergencesByPrecision[pi]);
		}
		man.check("format.tableSize", values.size() > 800,
				values.size() + " distinct doubles x " + PRECISIONS.length + " precisions");
		man.check("format.divergenceProbeFound", divergentRows > 0,
				divergentRows + " of " + values.size() + " values expose Java's shortest-repr "
						+ "rounding (" + detail + ") -- a port using exact-value HALF_UP fails here");
		man.note("HALF_UP fixture: Java %f rounds the SHORTEST round-trip decimal representation "
				+ "HALF_UP, not the exact binary value. " + divergentRows + " table rows prove it.");
	}

	/**
	 * Exact-binary-value HALF_UP, for the divergence census. Returns null for
	 * non-finite values (BigDecimal cannot represent them).
	 *
	 * <p><b>Corrected 2026-07-31 (cross-oracle audit).</b> The sign restoration
	 * below previously keyed on {@code doubleToRawLongBits(v) == bits(-0.0)},
	 * i.e. it fired for the literal {@code -0.0} and for nothing else. Every
	 * <i>other</i> negative value that rounds to zero — {@code -0.05} at N=0,
	 * {@code -0.005} at N=1, {@code -Double.MIN_VALUE} at every N — therefore
	 * came back as unsigned {@code "0.00"} while Java's formatter printed
	 * {@code "-0.00"}, and the row was booked as a shortest-representation
	 * divergence it is not. That inflated the census in
	 * {@code half-up-divergences.tsv} by <b>1,047 of 1,305 cells (80.2%) across
	 * 327 of 561 rows</b>; JavaScript's {@code toFixed} reproduces Java exactly
	 * on every one of those 1,047 cells, so they were never evidence of
	 * anything. The honest census over this table is <b>237 cells across 231 of
	 * 2,702 values</b> (see
	 * {@code engine/test/mathx/half-up-cross-oracle.test.ts}, which derives it
	 * from ground truth rather than from this column, and so is stable across
	 * this correction).
	 *
	 * <p>{@code Double.compare(v, 0.0) < 0} is true for {@code -0.0} as well as
	 * for every genuine negative, which is exactly the set Java's formatter
	 * prints a minus sign for. It matches {@code MathxFixtureDumper
	 * .exactBinaryRound}, the canonical oracle's implementation, which had this
	 * right already.
	 */
	private static String exactHalfUp(double v, int precision) {
		if (Double.isNaN(v) || Double.isInfinite(v)) {
			return null;
		}
		BigDecimal bd = new BigDecimal(v).setScale(precision, RoundingMode.HALF_UP);
		String s = bd.toPlainString();
		// BigDecimal has no negative zero; Java's formatter keeps the sign, for
		// -0.0 AND for every negative that rounds down to zero.
		if (Double.compare(v, 0.0) < 0 && !s.startsWith("-")) {
			s = "-" + s;
		}
		return s;
	}

	// ------------------------------------------------------------- the table

	private static List<Double> buildTable() {
		LinkedHashSet<Long> bits = new LinkedHashSet<Long>();
		List<Double> ordered = new ArrayList<Double>();

		// (A) hand-picked classics: exact-half decimals and the famous
		//     shortest-repr ties. Both signs.
		double[] classics = {
			0.0, 0.5, 1.5, 2.5, 3.5, 4.5, 0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95,
			0.005, 0.015, 0.025, 0.045, 0.055, 0.065, 0.075, 0.085, 0.095,
			0.125, 0.135, 0.145, 0.615, 1.005, 1.015, 1.025, 2.675, 2.665, 8.835, 1.115, 1.255,
			1.345, 1.455, 1.565, 1.675, 1.785, 1.895,
			10.5, 11.5, 12.5, 99.5, 100.5, 999.5, 1000.5, 1234.5, 16777216.5, 4503599627370495.5,
			0.0001, 0.00005, 0.000005, 0.0000005, 0.00000005,
			0.1, 0.2, 0.3, 0.7, 1.0 / 3.0, 2.0 / 3.0, Math.PI, Math.E, Math.sqrt(2.0),
		};
		addAllSigned(bits, ordered, classics);

		// (B) systematic "...5 exactly at the rounding digit" for every dumped
		//     precision: base.<p digits>5 built from decimal text so the SHORTEST
		//     representation genuinely ends in 5.
		String[] bases = { "0", "1", "2", "3", "7", "8", "9", "12", "47", "99", "100", "1234", "56789" };
		String[] fills = { "", "0", "1", "4", "5", "9", "01", "49", "50", "99", "004", "495", "999",
				"1234", "9999", "00005", "49999" };
		for (int p = 1; p <= 6; p++) {
			for (String b : bases) {
				for (String f : fills) {
					if (f.length() != p - 1) {
						continue;
					}
					String text = b + "." + f + "5";
					addSigned(bits, ordered, Double.parseDouble(text));
				}
			}
		}

		// (C) the immediate binary neighbours of every value so far: a port that
		//     special-cases "looks like a tie" instead of reproducing the
		//     shortest-representation rule breaks on these.
		List<Double> soFar = new ArrayList<Double>(ordered);
		for (Double d : soFar) {
			double v = d.doubleValue();
			if (Double.isFinite(v)) {
				addRaw(bits, ordered, Math.nextUp(v));
				addRaw(bits, ordered, Math.nextDown(v));
			}
		}

		// (D) magnitude ladder, incl. large magnitudes where %f prints many digits.
		for (int k = -9; k <= 21; k++) {
			double p10 = Math.pow(10.0, k);
			addSigned(bits, ordered, p10);
			addSigned(bits, ordered, p10 + 0.5);
			addSigned(bits, ordered, p10 - 0.5);
		}
		addSigned(bits, ordered, 1e300);
		addSigned(bits, ordered, 1e-300);

		// (E) deterministic random sweep across 13 magnitude decades.
		Random r = new Random(SWEEP_SEED);
		for (int i = 0; i < 400; i++) {
			double u = r.nextDouble();
			double scale = Math.pow(10.0, (i % 13) - 6);
			double v = u * scale;
			addSigned(bits, ordered, v);
		}

		// (F) specials and denormals.
		addRaw(bits, ordered, -0.0);
		addRaw(bits, ordered, Double.NaN);
		addRaw(bits, ordered, Double.POSITIVE_INFINITY);
		addRaw(bits, ordered, Double.NEGATIVE_INFINITY);
		addRaw(bits, ordered, Double.MIN_VALUE);
		addRaw(bits, ordered, -Double.MIN_VALUE);
		addRaw(bits, ordered, Double.MIN_NORMAL);
		addRaw(bits, ordered, Double.MAX_VALUE);
		addRaw(bits, ordered, -Double.MAX_VALUE);

		// (G) the model's own published constants -- the numbers that actually
		//     appear in agents.csv / shelters.csv / simulation.json.
		double[] model = {
			0.195, 0.147, 0.104, 0.235, 0.259, 1.280, 1.30, 0.61,
			54002.8, 562.7, 588.9, 984.75, 2496.1, 4.436, 1.75, 55.5,
			0.356, 0.284, 0.117, 0.0044, 0.06, 0.192, 0.150, 0.105, 0.391,
			0.152163, 0.347802, 0.68432, 0.29271, 0.02297, 0.527, 0.423, 0.050,
			1.358, 1.433, 1.434, 1.339, 1.262, 0.968, 1.341, 1.337, 1.390, 1.313, 1.241, 1.132, 0.943,
			0.13, 0.95, 0.32, -0.19, 0.40, 2.20, -0.25, -8.0, 0.4, 1.1, 0.25, 48.0, 0.26, 0.2, 0.3, 3.0,
			11.944725226913, 614.1, 100.0, 10.0, 220.0, 200.0,
		};
		addAllSigned(bits, ordered, model);

		return ordered;
	}

	private static void addAllSigned(LinkedHashSet<Long> bits, List<Double> out, double[] vs) {
		for (double v : vs) {
			addSigned(bits, out, v);
		}
	}

	private static void addSigned(LinkedHashSet<Long> bits, List<Double> out, double v) {
		addRaw(bits, out, v);
		addRaw(bits, out, -v);
	}

	private static void addRaw(LinkedHashSet<Long> bits, List<Double> out, double v) {
		Long key = Long.valueOf(Double.doubleToRawLongBits(v));
		if (bits.add(key)) {
			out.add(Double.valueOf(v));
		}
	}
}
