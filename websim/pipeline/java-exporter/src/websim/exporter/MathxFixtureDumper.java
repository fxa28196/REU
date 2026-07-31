package websim.exporter;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Random;

/**
 * WP3 (task F2) — parity fixture dumper for {@code websim/engine/src/mathx}.
 *
 * <p>READ-ONLY with respect to the certified model: this class imports nothing from
 * {@code geography.*} and links against nothing but the JDK. It is a <b>separate class
 * from</b> {@code GeodesicDirectFixtureDumper} and {@code RngFixtureDumper}; neither of
 * those files is touched.
 *
 * <p>Three fixture families are emitted, all as one JSON file per family:
 *
 * <ol>
 *   <li><b>{@code mathx-strictmath.json}</b> — for each of {@code exp, log, pow, sin, cos,
 *       atan, atan2, sqrt}: a list of argument bit patterns with the {@link StrictMath}
 *       result. Every double crosses as a raw IEEE-754 bit pattern
 *       ({@link Double#doubleToRawLongBits}, 16 lowercase hex digits) so the fixture
 *       round-trips through text with zero decimal-formatting loss.
 *       <p><b>Each entry also records whether {@link Math} disagrees with
 *       {@link StrictMath} on that same input, and by how much.</b> This is not decoration.
 *       DR-S1 §3.2 established that {@code Math.sin/cos/log/exp/pow} are
 *       {@code @IntrinsicCandidate} in JDK 17 and HotSpot substitutes x86-64 LIBM stubs
 *       that are <i>not</i> fdlibm — and the certified model calls {@code Math}, not
 *       {@code StrictMath} ({@code GisAgent.java:378,413,717}, and all of
 *       GeographicLib-Java). The port targets {@code StrictMath} because that is the only
 *       specified, portable target; the divergence census tells the next work package how
 *       large the residual Java-vs-port gap is on the model's own call sites, instead of
 *       leaving it unstated.</li>
 *   <li><b>{@code mathx-format.json}</b> — {@code String.format(Locale.US, "%.Nf", d)} for
 *       N = 0..6 over a deliberately adversarial value table (HALF_UP ties whose binary
 *       double sits <i>below</i> the tie, negative zero, magnitudes past 2^53, subnormals)
 *       plus randomised values in the ranges the model's own columns occupy. A
 *       {@link BigDecimal} column records what rounding the <i>exact</i> binary value would
 *       have produced, which is what {@code toFixed} does — the rows where the two columns
 *       differ are precisely the rows that disqualify {@code toFixed}.</li>
 *   <li><b>{@code mathx-trunccast.json}</b> — {@code (long) d}, {@code (int) d} and
 *       {@code (int) l} over saturation and wrap boundaries.</li>
 * </ol>
 *
 * <p>Sampling is deterministic ({@link Random} is a specified LCG), so re-running the
 * dumper must produce byte-identical JSON. A changed digest means the JDK changed
 * underneath the port — a finding, not a fixture to overwrite.
 *
 * <p>Usage: {@code java -cp <out> websim.exporter.MathxFixtureDumper <outDir>}
 */
public final class MathxFixtureDumper {

	/** Draws per randomised block. Kept modest: these are full tables, not digests. */
	private static final int N_RANDOM = 512;

	private static final long SEED_BASE = 20260731L;

	private MathxFixtureDumper() {
	}

	public static void main(String[] args) throws IOException {
		if (args.length < 1) {
			System.err.println("usage: MathxFixtureDumper <outDir>");
			System.exit(2);
		}
		Path outDir = Paths.get(args[0]).toAbsolutePath().normalize();
		Files.createDirectories(outDir);

		dumpStrictMath(outDir.resolve("mathx-strictmath.json"));
		dumpFormat(outDir.resolve("mathx-format.json"));
		dumpTruncCast(outDir.resolve("mathx-trunccast.json"));

		System.out.println("wrote mathx fixtures to " + outDir);
	}

	// ---------------------------------------------------------------- part 1 ---

	/** One unary or binary sample: argument(s) plus the StrictMath and Math results. */
	private static final class Sample {
		final double a;
		final double b;
		final double strict;
		final double intrinsic;

		Sample(double a, double b, double strict, double intrinsic) {
			this.a = a;
			this.b = b;
			this.strict = strict;
			this.intrinsic = intrinsic;
		}

		boolean diverges() {
			return Double.doubleToRawLongBits(strict) != Double.doubleToRawLongBits(intrinsic);
		}
	}

	private static void dumpStrictMath(Path file) throws IOException {
		try (BufferedWriter w = newWriter(file)) {
			w.write("{\n");
			w.write("  \"producedBy\": \"websim/pipeline/java-exporter MathxFixtureDumper (WP3 F2)\",\n");
			w.write("  \"javaVersion\": " + jsonStr(System.getProperty("java.version")) + ",\n");
			w.write("  \"javaVendor\": " + jsonStr(System.getProperty("java.vendor")) + ",\n");
			w.write("  \"javaVmName\": " + jsonStr(System.getProperty("java.vm.name")) + ",\n");
			w.write("  \"osArch\": " + jsonStr(System.getProperty("os.arch")) + ",\n");
			w.write("  \"tokenFormat\": \"lowercase hex, %016x of Double.doubleToRawLongBits\",\n");
			w.write("  \"note\": \"'strict' is StrictMath (the port's target). 'intrinsic' is "
					+ "java.lang.Math on this JVM, which the certified model actually calls; "
					+ "entries are listed in 'intrinsicDivergences' only where the two differ.\",\n");
			w.write("  \"compositeOracleNote\": \"Every block except 'atanh' is a call to the "
					+ "StrictMath routine of that name. java.lang.StrictMath has NO atanh -- Java "
					+ "ships no inverse hyperbolic functions -- so the 'atanh' block's 'strict' "
					+ "column is fdlibm e_atanh.c's own decomposition evaluated over "
					+ "StrictMath.log1p, and its 'intrinsic' column is the same decomposition over "
					+ "Math.log1p. It validates the argument reduction and the log1p port beneath "
					+ "it; it is NOT an independent implementation of atanh. See "
					+ "engine/src/mathx/atanh.ts.\",\n");
			w.write("  \"compositeOracles\": [\"atanh\"],\n");
			w.write("  \"functions\": {\n");

			List<String> blocks = new ArrayList<>();
			blocks.add(unaryBlock("exp", expArgs(), MathxFixtureDumper::expPair));
			blocks.add(unaryBlock("log", logArgs(), MathxFixtureDumper::logPair));
			blocks.add(unaryBlock("sin", trigArgs(3L), MathxFixtureDumper::sinPair));
			blocks.add(unaryBlock("cos", trigArgs(4L), MathxFixtureDumper::cosPair));
			blocks.add(unaryBlock("atan", atanArgs(), MathxFixtureDumper::atanPair));
			blocks.add(unaryBlock("sqrt", sqrtArgs(), MathxFixtureDumper::sqrtPair));
			blocks.add(binaryBlock("pow", powArgs(), MathxFixtureDumper::powPair));
			blocks.add(binaryBlock("atan2", atan2Args(), MathxFixtureDumper::atan2Pair));
			// WP7 task C1: the four routines geographiclib-geodesic reaches for on the host.
			blocks.add(unaryBlock("cbrt", cbrtArgs(), MathxFixtureDumper::cbrtPair));
			blocks.add(unaryBlock("log1p", log1pArgs(), MathxFixtureDumper::log1pPair));
			blocks.add(unaryBlock("atanh", atanhArgs(), MathxFixtureDumper::atanhPair));
			blocks.add(binaryBlock("hypot", hypotArgs(), MathxFixtureDumper::hypotPair));

			for (int i = 0; i < blocks.size(); i++) {
				w.write(blocks.get(i));
				w.write(i == blocks.size() - 1 ? "\n" : ",\n");
			}
			w.write("  }\n}\n");
		}
	}

	private interface UnaryEval {
		Sample apply(double x);
	}

	private interface BinaryEval {
		Sample apply(double x, double y);
	}

	private static String unaryBlock(String name, double[] args, UnaryEval eval) {
		StringBuilder sb = new StringBuilder();
		StringBuilder div = new StringBuilder();
		int nDiv = 0;
		sb.append("    ").append(jsonStr(name)).append(": {\n      \"arity\": 1,\n      \"cases\": [");
		for (int i = 0; i < args.length; i++) {
			Sample s = eval.apply(args[i]);
			if (i > 0) {
				sb.append(',');
			}
			if (i % 4 == 0) {
				sb.append("\n        ");
			}
			sb.append('[').append(jsonStr(hex(s.a))).append(',').append(jsonStr(hex(s.strict))).append(']');
			if (s.diverges()) {
				if (nDiv > 0) {
					div.append(',');
				}
				if (nDiv % 3 == 0) {
					div.append("\n        ");
				}
				div.append('[').append(i).append(',').append(jsonStr(hex(s.intrinsic))).append(']');
				nDiv++;
			}
		}
		sb.append("\n      ],\n");
		sb.append("      \"nCases\": ").append(args.length).append(",\n");
		sb.append("      \"nIntrinsicDivergences\": ").append(nDiv).append(",\n");
		sb.append("      \"intrinsicDivergences\": [").append(div).append(nDiv == 0 ? "" : "\n      ").append("]\n");
		sb.append("    }");
		return sb.toString();
	}

	private static String binaryBlock(String name, double[][] args, BinaryEval eval) {
		StringBuilder sb = new StringBuilder();
		StringBuilder div = new StringBuilder();
		int nDiv = 0;
		sb.append("    ").append(jsonStr(name)).append(": {\n      \"arity\": 2,\n      \"cases\": [");
		for (int i = 0; i < args.length; i++) {
			Sample s = eval.apply(args[i][0], args[i][1]);
			if (i > 0) {
				sb.append(',');
			}
			if (i % 3 == 0) {
				sb.append("\n        ");
			}
			sb.append('[').append(jsonStr(hex(s.a))).append(',').append(jsonStr(hex(s.b))).append(',')
					.append(jsonStr(hex(s.strict))).append(']');
			if (s.diverges()) {
				if (nDiv > 0) {
					div.append(',');
				}
				if (nDiv % 3 == 0) {
					div.append("\n        ");
				}
				div.append('[').append(i).append(',').append(jsonStr(hex(s.intrinsic))).append(']');
				nDiv++;
			}
		}
		sb.append("\n      ],\n");
		sb.append("      \"nCases\": ").append(args.length).append(",\n");
		sb.append("      \"nIntrinsicDivergences\": ").append(nDiv).append(",\n");
		sb.append("      \"intrinsicDivergences\": [").append(div).append(nDiv == 0 ? "" : "\n      ").append("]\n");
		sb.append("    }");
		return sb.toString();
	}

	private static Sample expPair(double x) {
		return new Sample(x, Double.NaN, StrictMath.exp(x), Math.exp(x));
	}

	private static Sample logPair(double x) {
		return new Sample(x, Double.NaN, StrictMath.log(x), Math.log(x));
	}

	private static Sample sinPair(double x) {
		return new Sample(x, Double.NaN, StrictMath.sin(x), Math.sin(x));
	}

	private static Sample cosPair(double x) {
		return new Sample(x, Double.NaN, StrictMath.cos(x), Math.cos(x));
	}

	private static Sample atanPair(double x) {
		return new Sample(x, Double.NaN, StrictMath.atan(x), Math.atan(x));
	}

	private static Sample sqrtPair(double x) {
		return new Sample(x, Double.NaN, StrictMath.sqrt(x), Math.sqrt(x));
	}

	private static Sample powPair(double x, double y) {
		return new Sample(x, y, StrictMath.pow(x, y), Math.pow(x, y));
	}

	private static Sample atan2Pair(double y, double x) {
		return new Sample(y, x, StrictMath.atan2(y, x), Math.atan2(y, x));
	}

	private static Sample cbrtPair(double x) {
		return new Sample(x, Double.NaN, StrictMath.cbrt(x), Math.cbrt(x));
	}

	private static Sample log1pPair(double x) {
		return new Sample(x, Double.NaN, StrictMath.log1p(x), Math.log1p(x));
	}

	private static Sample hypotPair(double x, double y) {
		return new Sample(x, y, StrictMath.hypot(x, y), Math.hypot(x, y));
	}

	/**
	 * The <b>composite</b> atanh column — see {@code compositeOracleNote} in the emitted JSON.
	 *
	 * <p>{@link StrictMath} has no {@code atanh}, so this reproduces fdlibm {@code e_atanh.c}
	 * branch for branch on top of {@link StrictMath#log1p}. That makes the fixture a check on
	 * the port's argument reduction and on the {@code log1p} kernel underneath it, not on an
	 * independent Java implementation of {@code atanh} — which does not exist.
	 */
	private static Sample atanhPair(double x) {
		return new Sample(x, Double.NaN, atanhVia(x, true), atanhVia(x, false));
	}

	private static double atanhVia(double x, boolean strict) {
		long bits = Double.doubleToRawLongBits(x);
		int hx = (int) (bits >>> 32);
		int lx = (int) bits;
		int ix = hx & 0x7fffffff;
		if ((ix | (lx != 0 ? 1 : 0)) > 0x3ff00000) {
			return (x - x) / (x - x);
		}
		if (ix == 0x3ff00000) {
			return x / 0.0;
		}
		if (ix < 0x3e300000 && 1e300 + x > 0.0) {
			return x;
		}
		double ax = Math.abs(x);
		double t;
		if (ix < 0x3fe00000) {
			t = ax + ax;
			double arg = t + t * ax / (1.0 - ax);
			t = 0.5 * (strict ? StrictMath.log1p(arg) : Math.log1p(arg));
		} else {
			double arg = (ax + ax) / (1.0 - ax);
			t = 0.5 * (strict ? StrictMath.log1p(arg) : Math.log1p(arg));
		}
		return hx >= 0 ? t : -t;
	}

	// ------------------------------------------------------- argument tables ---

	private static double[] specials() {
		return new double[] { 0.0, -0.0, 1.0, -1.0, 2.0, -2.0, 0.5, -0.5, Double.NaN,
				Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, Double.MIN_VALUE,
				-Double.MIN_VALUE, Double.MIN_NORMAL, Double.MAX_VALUE, -Double.MAX_VALUE,
				Math.PI, -Math.PI, Math.E, 1e-300, 1e300, -1e300 };
	}

	private static double[] concat(double[] a, double[] b) {
		double[] out = new double[a.length + b.length];
		System.arraycopy(a, 0, out, 0, a.length);
		System.arraycopy(b, 0, out, a.length, b.length);
		return out;
	}

	private static double[] expArgs() {
		// Every branch boundary of e_exp.c: 0.5*ln2, 1.5*ln2, 2^-28, the o/u thresholds.
		double[] edges = { 0.5 * StrictMath.log(2.0), 1.5 * StrictMath.log(2.0), Math.pow(2, -28),
				Math.pow(2, -29), 709.782712893383973096, 709.7827128933841, -745.1332191019411,
				-745.1332191019412, -708.0, 708.0, -1021.0, 1000.0,
				// GisAgent.java:413 shape: the logistic argument -u.
				-6.0, -3.0, -0.75, 0.0, 0.75, 3.0, 6.0 };
		Random r = new Random(SEED_BASE + 1);
		double[] rnd = new double[N_RANDOM];
		for (int i = 0; i < N_RANDOM; i++) {
			rnd[i] = -750.0 + r.nextDouble() * 1500.0;
		}
		return concat(concat(specials(), edges), rnd);
	}

	private static double[] logArgs() {
		// GisAgent.java:717 shape: log(max(1, capacity)) over the real shelter capacities.
		double[] caps = { 1.0, 10.0, 10000.0, 20.0, 25.0, 30.0, 40.0, 45.0, 46.0, 50.0, 60.0, 75.0,
				80.0, 90.0, 100.0, 120.0, 150.0, 200.0, 250.0, 300.0, 400.0, 500.0 };
		double[] edges = { 1.0 - Math.ulp(1.0), 1.0 + Math.ulp(1.0), Math.sqrt(2.0) / 2.0,
				Math.sqrt(2.0), 1.0 - Math.pow(2, -20), 1.0 + Math.pow(2, -20), Double.MIN_NORMAL / 2 };
		Random r = new Random(SEED_BASE + 2);
		double[] rnd = new double[N_RANDOM];
		for (int i = 0; i < N_RANDOM; i++) {
			// Log-uniform over (1e-300, 1e300) so every exponent branch is exercised.
			rnd[i] = StrictMath.exp(-690.0 + r.nextDouble() * 1380.0);
		}
		return concat(concat(specials(), concat(caps, edges)), rnd);
	}

	private static double[] trigArgs(long seedOffset) {
		double[] edges = { Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, 3 * Math.PI / 4,
				Math.PI, 2 * Math.PI, 1e6, 1e7, 8.2e5, 823549.0, 823550.0, 1e10, 1e20, 1e100, 1e300,
				-1e300, Math.pow(2, 19) * Math.PI / 2, Math.pow(2, 20) * Math.PI / 2 };
		Random r = new Random(SEED_BASE + seedOffset);
		double[] rnd = new double[N_RANDOM * 3];
		for (int i = 0; i < N_RANDOM; i++) {
			// (a) the GeographicLib sincosd shape: toRadians of [-45, 45] -> kernel path.
			rnd[i] = Math.toRadians(-45.0 + r.nextDouble() * 90.0);
			// (b) a few radians -> the n = +-1 and medium-size reduction paths.
			rnd[N_RANDOM + i] = -20.0 + r.nextDouble() * 40.0;
			// (c) large -> the multi-precision kernel_rem_pio2 path.
			rnd[2 * N_RANDOM + i] = (r.nextDouble() - 0.5) * 2e18;
		}
		return concat(concat(specials(), edges), rnd);
	}

	private static double[] atanArgs() {
		double[] edges = { 0.4375, 0.4374999999999999, 7.0 / 16, 11.0 / 16, 1.1875, 1.5, 2.4375,
				Math.pow(2, 66), -Math.pow(2, 66), Math.pow(2, -27), Math.pow(2, -28) };
		Random r = new Random(SEED_BASE + 5);
		double[] rnd = new double[N_RANDOM * 2];
		for (int i = 0; i < N_RANDOM; i++) {
			rnd[i] = -5.0 + r.nextDouble() * 10.0;
			rnd[N_RANDOM + i] = (r.nextDouble() - 0.5) * 1e12;
		}
		return concat(concat(specials(), edges), rnd);
	}

	private static double[] sqrtArgs() {
		Random r = new Random(SEED_BASE + 6);
		double[] rnd = new double[N_RANDOM];
		for (int i = 0; i < N_RANDOM; i++) {
			rnd[i] = StrictMath.exp(-690.0 + r.nextDouble() * 1380.0);
		}
		return concat(specials(), rnd);
	}

	private static double[][] powArgs() {
		List<double[]> out = new ArrayList<>();
		// Every special-value branch of e_pow.c.
		double[] bases = { 0.0, -0.0, 1.0, -1.0, 2.0, -2.0, 0.5, 10.0, Double.POSITIVE_INFINITY,
				Double.NEGATIVE_INFINITY, Double.NaN, Double.MIN_VALUE, Double.MAX_VALUE, 1e300,
				1e-300, 1.0000000000000002, 0.9999999999999999 };
		double[] exponents = { 0.0, -0.0, 1.0, -1.0, 2.0, -2.0, 0.5, -0.5, 3.0, -3.0, 1e300,
				Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, Double.NaN, 1e18, -1e18,
				2147483648.0, 1.8446744073709552e19 };
		for (double b : bases) {
			for (double e : exponents) {
				out.add(new double[] { b, e });
			}
		}
		// GisAgent.java:378 shape: pow(2.0, -1.0 / riskHalfLifeH) for every plausible half-life.
		for (int h = 1; h <= 72; h++) {
			out.add(new double[] { 2.0, -1.0 / h });
		}
		Random r = new Random(SEED_BASE + 7);
		for (int i = 0; i < N_RANDOM; i++) {
			out.add(new double[] { r.nextDouble() * 100.0, -10.0 + r.nextDouble() * 20.0 });
		}
		for (int i = 0; i < N_RANDOM / 2; i++) {
			out.add(new double[] { -100.0 + r.nextDouble() * 200.0, (double) r.nextInt(21) - 10 });
		}
		return out.toArray(new double[0][]);
	}

	private static double[][] atan2Args() {
		List<double[]> out = new ArrayList<>();
		double[] sp = { 0.0, -0.0, 1.0, -1.0, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY,
				Double.NaN, 1e300, -1e300, 1e-300, -1e-300 };
		for (double y : sp) {
			for (double x : sp) {
				out.add(new double[] { y, x });
			}
		}
		Random r = new Random(SEED_BASE + 8);
		for (int i = 0; i < N_RANDOM * 2; i++) {
			out.add(new double[] { -1.0 + r.nextDouble() * 2.0, -1.0 + r.nextDouble() * 2.0 });
		}
		for (int i = 0; i < N_RANDOM / 2; i++) {
			// The |y/x| > 2^60 and < -2^60 shortcuts.
			out.add(new double[] { r.nextDouble() * 1e200, (r.nextDouble() - 0.5) * 1e-200 });
		}
		return out.toArray(new double[0][]);
	}

	/** s_cbrt.c has one branch (subnormal) plus the exponent-third magic; both are covered. */
	private static double[] cbrtArgs() {
		double[] edges = { 8.0, -8.0, 27.0, -27.0, 64.0, 1000.0, 1e-9, 1e9, 2.0, 4.0,
				Math.pow(2, -1074), Math.pow(2, -1073), Math.pow(2, -1022), Math.pow(2, -1023),
				-Math.pow(2, -1074), Math.pow(2, 1023), Math.pow(2, -300), Math.pow(2, 300),
				0.125, -0.125, 1.0 - Math.ulp(1.0), 1.0 + Math.ulp(1.0) };
		Random r = new Random(SEED_BASE + 12);
		double[] rnd = new double[N_RANDOM * 3];
		for (int i = 0; i < N_RANDOM; i++) {
			// (a) the astroid() shape: T3 = S + r^3 +- sqrt(disc), order 1 or smaller.
			rnd[i] = (r.nextDouble() - 0.5) * 4.0;
			// (b) log-uniform over the whole normal range, both signs.
			rnd[N_RANDOM + i] = StrictMath.exp(-690.0 + r.nextDouble() * 1380.0)
					* (r.nextBoolean() ? 1.0 : -1.0);
			// (c) subnormals, where the 2**54 pre-scale branch is taken.
			rnd[2 * N_RANDOM + i] = r.nextDouble() * Math.pow(2, -1030) * (r.nextBoolean() ? 1 : -1);
		}
		return concat(concat(specials(), edges), rnd);
	}

	/** Every branch cut of s_log1p.c: 0.41422, -0.2929, 2^-29, 2^-54, 2^-20, 2^53. */
	private static double[] log1pArgs() {
		double[] edges = { -1.0, -1.0 + Math.ulp(1.0), -0.9999999999, 0.41421356237309503,
				0.4142135623730951, 0.41421356237309515, -0.29289321881345254,
				-0.2928932188134524, -0.29289321881345248, Math.pow(2, -29), Math.pow(2, -30),
				Math.pow(2, -54), Math.pow(2, -55), -Math.pow(2, -54), Math.pow(2, -20),
				-Math.pow(2, -20), Math.pow(2, 53), Math.pow(2, 53) - 1, Math.pow(2, 54),
				Math.sqrt(2.0) - 1.0, 1.0 / 16.0, -1.0 / 16.0, 1e-300, -1e-300, 1e300 };
		Random r = new Random(SEED_BASE + 13);
		double[] rnd = new double[N_RANDOM * 3];
		for (int i = 0; i < N_RANDOM; i++) {
			// (a) the atanh() shape: 2y/(1-y) for y in [0, 1) -- unbounded above, >= 0.
			double y = r.nextDouble();
			rnd[i] = 2 * y / (1 - y);
			// (b) the near-zero regime where the correction term c matters.
			rnd[N_RANDOM + i] = (r.nextDouble() - 0.5) * 0.8;
			// (c) log-uniform over the positive range.
			rnd[2 * N_RANDOM + i] = StrictMath.exp(-690.0 + r.nextDouble() * 1380.0);
		}
		return concat(concat(specials(), edges), rnd);
	}

	/** e_atanh.c branches at |x| = 2^-28, 0.5 and 1; plus the out-of-domain returns. */
	private static double[] atanhArgs() {
		double[] edges = { 1.0, -1.0, 0.5, -0.5, 0.5 - Math.ulp(0.5), 0.5 + Math.ulp(0.5),
				Math.pow(2, -28), Math.pow(2, -29), -Math.pow(2, -28), 1.0 - Math.ulp(1.0),
				-(1.0 - Math.ulp(1.0)), 1.0 + Math.ulp(1.0), 2.0, -2.0,
				// WGS84: the single production call is atanh(sqrt(e2)).
				StrictMath.sqrt(1 / 298.257223563 * (2 - 1 / 298.257223563)) };
		Random r = new Random(SEED_BASE + 14);
		double[] rnd = new double[N_RANDOM * 2];
		for (int i = 0; i < N_RANDOM; i++) {
			rnd[i] = (r.nextDouble() - 0.5) * 2.0;
			rnd[N_RANDOM + i] = (r.nextDouble() - 0.5) * Math.pow(2, -27);
		}
		return concat(concat(specials(), edges), rnd);
	}

	/** e_hypot.c: the 2^60 ratio shortcut, the 2^500 and 2^-500 rescales, subnormals, NaN/Inf. */
	private static double[][] hypotArgs() {
		List<double[]> out = new ArrayList<>();
		double[] sp = { 0.0, -0.0, 1.0, -1.0, 3.0, 4.0, Double.POSITIVE_INFINITY,
				Double.NEGATIVE_INFINITY, Double.NaN, Double.MIN_VALUE, Double.MIN_NORMAL,
				Double.MAX_VALUE, 1e300, -1e300, 1e-300, Math.pow(2, 600), Math.pow(2, -600),
				Math.pow(2, 500), Math.pow(2, -500) };
		for (double x : sp) {
			for (double y : sp) {
				out.add(new double[] { x, y });
			}
		}
		Random r = new Random(SEED_BASE + 15);
		for (int i = 0; i < N_RANDOM; i++) {
			out.add(new double[] { (r.nextDouble() - 0.5) * 2e3, (r.nextDouble() - 0.5) * 2e3 });
		}
		for (int i = 0; i < N_RANDOM / 2; i++) {
			// Ratio past 2**60 -- the early-out branch.
			out.add(new double[] { r.nextDouble() * 1e200, (r.nextDouble() - 0.5) * 1e-200 });
			// Both operands subnormal -- the 2^1022 rescale branch.
			out.add(new double[] { r.nextDouble() * Math.pow(2, -1040),
					r.nextDouble() * Math.pow(2, -1045) });
		}
		return out.toArray(new double[0][]);
	}

	// ---------------------------------------------------------------- part 2 ---

	private static void dumpFormat(Path file) throws IOException {
		double[] values = formatValues();
		try (BufferedWriter w = newWriter(file)) {
			w.write("{\n");
			w.write("  \"producedBy\": \"websim/pipeline/java-exporter MathxFixtureDumper (WP3 F2)\",\n");
			w.write("  \"javaVersion\": " + jsonStr(System.getProperty("java.version")) + ",\n");
			w.write("  \"call\": \"String.format(Locale.US, \\\"%.Nf\\\", value)\",\n");
			w.write("  \"note\": \"'exactBinary' is BigDecimal(new BigDecimal(value)).setScale(N, HALF_UP)"
					+ " -- rounding the EXACT binary double, which is what JS toFixed does. Rows where"
					+ " 'formatted' != 'exactBinary' are the rows that disqualify toFixed.\",\n");
			w.write("  \"precisions\": [0, 1, 2, 3, 4, 5, 6],\n");
			w.write("  \"cases\": [\n");
			int disagreements = 0;
			for (int i = 0; i < values.length; i++) {
				double v = values[i];
				StringBuilder row = new StringBuilder();
				row.append("    {\"bits\": ").append(jsonStr(hex(v)));
				row.append(", \"formatted\": [");
				StringBuilder exact = new StringBuilder();
				boolean rowDisagrees = false;
				for (int p = 0; p <= 6; p++) {
					String formatted = String.format(Locale.US, "%." + p + "f", v);
					String exactStr = exactBinaryRound(v, p);
					if (p > 0) {
						row.append(", ");
						exact.append(", ");
					}
					row.append(jsonStr(formatted));
					exact.append(jsonStr(exactStr));
					if (!formatted.equals(exactStr)) {
						rowDisagrees = true;
					}
				}
				row.append("], \"exactBinary\": [").append(exact).append("]}");
				if (rowDisagrees) {
					disagreements++;
				}
				w.write(row.toString());
				w.write(i == values.length - 1 ? "\n" : ",\n");
			}
			w.write("  ],\n");
			w.write("  \"nCases\": " + values.length + ",\n");
			w.write("  \"nCasesWhereToFixedWouldDiffer\": " + disagreements + "\n");
			w.write("}\n");
		}
	}

	/**
	 * What rounding the exact binary value gives. {@code new BigDecimal(double)} is the
	 * exact value of the double (unlike {@code BigDecimal.valueOf}, which goes through
	 * {@code Double.toString}), so this column is the {@code toFixed} semantics.
	 */
	private static String exactBinaryRound(double v, int precision) {
		if (Double.isNaN(v)) {
			return "NaN";
		}
		if (Double.isInfinite(v)) {
			return v > 0 ? "Infinity" : "-Infinity";
		}
		BigDecimal bd = new BigDecimal(v).setScale(precision, RoundingMode.HALF_UP);
		String s = bd.toPlainString();
		// BigDecimal has no negative zero; Java's formatter does print one.
		if (Double.compare(v, 0.0) == -1 && !s.startsWith("-")) {
			s = "-" + s;
		}
		return s;
	}

	private static double[] formatValues() {
		List<Double> out = new ArrayList<>();
		// The canonical tie table: doubles whose shortest decimal ends in 5 but whose exact
		// binary value falls below (or above) the tie.
		double[] ties = { 0.615, 0.625, 0.635, 0.645, 0.655, 1.005, 1.015, 1.025, 2.675, 8.835,
				0.5, 1.5, 2.5, 3.5, -0.5, -1.5, -2.5, -3.5, 0.05, 0.15, 0.25, 0.35, 0.45, 0.55,
				0.65, 0.75, 0.85, 0.95, 1.0005, 1.00005, 1.000005, 1.0000005, 0.0000005, 0.00000005,
				-0.615, -1.005, -2.675, 1.45, 1.55, 2.45, 2.55, 1234.5, 1234.45, 1234.445 };
		for (double d : ties) {
			out.add(d);
		}
		// Sign, zero and non-finite handling.
		double[] edges = { 0.0, -0.0, -1e-9, 1e-9, -0.0004, 0.0004, Double.NaN,
				Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, Double.MIN_VALUE,
				-Double.MIN_VALUE, Double.MIN_NORMAL, Double.MAX_VALUE, -Double.MAX_VALUE,
				// Past 2^53 and into the "toFixed prints the exact binary value" regime.
				9007199254740992.0, 9007199254740993.0, 1e17, 1e20, 1e21, 1e22, 1e23, 1e24,
				-1e23, 123456789012345678.0, 4.9e-324, 1.7976931348623157e308 };
		for (double d : edges) {
			out.add(d);
		}
		// The magnitudes the model's own %.Nf columns occupy: coordinates (%.6f), metres
		// (%.2f), exposures (%.4f), utilisation (%.4f), speeds (%.3f), peak PM2.5 (%.1f).
		Random r = new Random(SEED_BASE + 9);
		for (int i = 0; i < N_RANDOM; i++) {
			out.add(-123.0 - r.nextDouble());          // lon
			out.add(45.0 + r.nextDouble());            // lat
			out.add(r.nextDouble() * 100000.0);        // metres
			out.add(r.nextDouble() * 20000.0);         // exposure ug/m3 h
			out.add(r.nextDouble());                   // utilisation / shares
			out.add(0.4 + r.nextDouble() * 1.8);       // walking speed m/s
			out.add(r.nextDouble() * 600.0);           // PM2.5
			out.add((r.nextDouble() - 0.5) * 8.0);     // theta_z
		}
		double[] arr = new double[out.size()];
		for (int i = 0; i < arr.length; i++) {
			arr[i] = out.get(i);
		}
		return arr;
	}

	// ---------------------------------------------------------------- part 3 ---

	private static void dumpTruncCast(Path file) throws IOException {
		double[] doubles = truncCastDoubles();
		long[] longs = truncCastLongs();
		try (BufferedWriter w = newWriter(file)) {
			w.write("{\n");
			w.write("  \"producedBy\": \"websim/pipeline/java-exporter MathxFixtureDumper (WP3 F2)\",\n");
			w.write("  \"javaVersion\": " + jsonStr(System.getProperty("java.version")) + ",\n");
			w.write("  \"note\": \"(long)d and (int)d SATURATE per JLS 5.1.3; (int)l WRAPS.\",\n");
			w.write("  \"doubleCases\": [\n");
			for (int i = 0; i < doubles.length; i++) {
				double d = doubles[i];
				w.write("    {\"bits\": " + jsonStr(hex(d)) + ", \"toLong\": " + jsonStr(Long.toString((long) d))
						+ ", \"toInt\": " + ((int) d) + "}");
				w.write(i == doubles.length - 1 ? "\n" : ",\n");
			}
			w.write("  ],\n  \"longCases\": [\n");
			for (int i = 0; i < longs.length; i++) {
				w.write("    {\"value\": " + jsonStr(Long.toString(longs[i])) + ", \"toInt\": " + ((int) longs[i])
						+ "}");
				w.write(i == longs.length - 1 ? "\n" : ",\n");
			}
			w.write("  ]\n}\n");
		}
	}

	private static double[] truncCastDoubles() {
		List<Double> out = new ArrayList<>();
		double[] edges = { 0.0, -0.0, 0.5, -0.5, 1.0, -1.0, 1.9, -1.9, Double.NaN,
				Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, 2147483647.0, 2147483647.5,
				2147483648.0, -2147483648.0, -2147483648.5, -2147483649.0, 3e9, -3e9,
				9.223372036854775E18, 9.3E18, -9.223372036854776E18, -9.3E18, 1e300, -1e300,
				Double.MIN_VALUE, 4503599627370496.5, 1e15, 1e16 };
		for (double d : edges) {
			out.add(d);
		}
		Random r = new Random(SEED_BASE + 10);
		for (int i = 0; i < N_RANDOM; i++) {
			out.add((r.nextDouble() - 0.5) * 1e10);
			out.add((r.nextDouble() - 0.5) * 1e20);
		}
		double[] arr = new double[out.size()];
		for (int i = 0; i < arr.length; i++) {
			arr[i] = out.get(i);
		}
		return arr;
	}

	private static long[] truncCastLongs() {
		List<Long> out = new ArrayList<>();
		long[] edges = { 0L, 1L, -1L, 2147483647L, 2147483648L, -2147483648L, -2147483649L,
				4294967295L, 4294967296L, 4294967297L, Long.MAX_VALUE, Long.MIN_VALUE,
				9223372036854775783L * 1000003L + 17L, 9223372036854775783L * 2654435761L + 6841L * 104729L };
		for (long v : edges) {
			out.add(v);
		}
		Random r = new Random(SEED_BASE + 11);
		for (int i = 0; i < N_RANDOM; i++) {
			out.add(r.nextLong());
		}
		long[] arr = new long[out.size()];
		for (int i = 0; i < arr.length; i++) {
			arr[i] = out.get(i);
		}
		return arr;
	}

	// ------------------------------------------------------------- utilities ---

	private static BufferedWriter newWriter(Path file) throws IOException {
		return new BufferedWriter(
				new OutputStreamWriter(Files.newOutputStream(file), StandardCharsets.UTF_8));
	}

	private static String hex(double d) {
		return String.format("%016x", Double.doubleToRawLongBits(d));
	}

	/** Minimal JSON string escaping; every string emitted here is ASCII. */
	private static String jsonStr(String s) {
		StringBuilder sb = new StringBuilder("\"");
		for (int i = 0; i < s.length(); i++) {
			char c = s.charAt(i);
			switch (c) {
			case '"':
				sb.append("\\\"");
				break;
			case '\\':
				sb.append("\\\\");
				break;
			case '\n':
				sb.append("\\n");
				break;
			case '\r':
				sb.append("\\r");
				break;
			case '\t':
				sb.append("\\t");
				break;
			default:
				if (c < 0x20) {
					sb.append(String.format("\\u%04x", (int) c));
				} else {
					sb.append(c);
				}
			}
		}
		return sb.append('"').toString();
	}
}
