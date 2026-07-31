package websim.exporter;

import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import cern.jet.random.Uniform;
import cern.jet.random.engine.MersenneTwister;

/**
 * WP2-S5 RNG bit-parity fixture dumper.
 *
 * <p>Dumps ground-truth draw sequences from the two generators the Java/Repast model
 * actually uses -- {@link java.util.Random} (PopulationSampler, ELayerSampler, per-agent
 * decision streams) and cern/colt {@link MersenneTwister} behind Repast's
 * {@code RandomHelper} default stream -- so the TypeScript clones in
 * {@code websim/engine/src/rng/} can be verified bit-exactly.
 *
 * <p><b>Every value is emitted as a raw IEEE-754 / two's-complement hex bit pattern.</b>
 * Decimal text is never used for a floating-point value: {@code Double.toString} is
 * lossy-by-shortest-repr and would hide exactly the last-ulp divergences this spike
 * exists to catch.
 *
 * <p>Two artefacts are produced per generator:
 * <ul>
 *   <li>a compact, committed JSON fixture ({@code head} = first {@value #HEAD_N} draws
 *       verbatim, plus a SHA-256 over all {@value #DRAWS} draws) -- the CI comparison
 *       basis; and</li>
 *   <li>an optional full {@code .hex} dump (one token per line, all draws) under a
 *       git-ignored directory, for debugging a digest mismatch.</li>
 * </ul>
 * The digest is taken over the exact UTF-8 byte stream {@code token + "\n"} repeated,
 * so the TS side reproduces it with zero format ambiguity.
 */
public final class RngFixtureDumper {

	/** Draws per (seed, sequence) pair. */
	private static final int DRAWS = 10_000;

	/** Verbatim head kept in the committed fixture for debuggability. */
	private static final int HEAD_N = 256;

	private RngFixtureDumper() {
	}

	// ---------------------------------------------------------------- helpers

	/** When -Dwebsim.rng.full=true, every token is retained and written to a full .hex dump. */
	private static final boolean FULL = "true".equals(System.getProperty("websim.rng.full"));

	/** Accumulates hex tokens: keeps a head sample and a running SHA-256 of all of them. */
	private static final class Seq {
		final String id;
		final String kind;
		final String params;
		final String seedNote;
		final long seed;
		final List<String> head = new ArrayList<>(HEAD_N);
		final List<String> all = FULL ? new ArrayList<>(DRAWS) : null;
		final MessageDigest md;
		int count;

		Seq(String id, String kind, String params, long seed, String seedNote) {
			this.id = id;
			this.kind = kind;
			this.params = params;
			this.seed = seed;
			this.seedNote = seedNote;
			try {
				this.md = MessageDigest.getInstance("SHA-256");
			} catch (NoSuchAlgorithmException e) {
				throw new IllegalStateException(e);
			}
		}

		void add(String token) {
			if (head.size() < HEAD_N) {
				head.add(token);
			}
			if (all != null) {
				all.add(token);
			}
			md.update((token + "\n").getBytes(StandardCharsets.UTF_8));
			count++;
		}

		String sha256() {
			byte[] d = md.digest();
			StringBuilder sb = new StringBuilder(64);
			for (byte b : d) {
				sb.append(String.format("%02x", b));
			}
			return sb.toString();
		}
	}

	private static String hexD(double v) {
		return String.format("%016x", Double.doubleToRawLongBits(v));
	}

	private static String hexF(float v) {
		return String.format("%08x", Float.floatToRawIntBits(v));
	}

	private static String hexL(long v) {
		return String.format("%016x", v);
	}

	private static String hexI(int v) {
		return String.format("%08x", v);
	}

	// ------------------------------------------------------- java.util.Random

	/** Seed labels + values, incl. plan-3.3 derived seeds at 64-bit-overflowing magnitudes. */
	private static long[][] javaSeedTable() {
		// A magnitude large enough that `seed * 1000003L` and `seed * 2654435761L`
		// genuinely wrap Java's signed 64-bit arithmetic (the BigInt.asIntN(64, .)
		// path the TS side must reproduce at seed derivation).
		final long big = 9223372036854775783L; // largest long prime < 2^63
		return new long[][] {
				{ 0L },
				{ 42L },
				{ -1L },
				{ 2147483647L },
				{ 42L * 1000003L + 17L },                        // PopulationSampler, plain
				{ 42L * 1000003L + 7919L },                      // ELayerSampler, plain
				{ big * 1000003L + 17L },                        // PopulationSampler, OVERFLOWS
				{ big * 2654435761L + 6841L * 104729L },         // per-agent decision, OVERFLOWS
				{ 2147483647L * 2654435761L + 104729L },         // per-agent decision, large no-overflow
		};
	}

	private static String[] javaSeedNotes() {
		return new String[] {
				"literal 0",
				"literal 42",
				"literal -1",
				"literal 2147483647 (Integer.MAX_VALUE)",
				"seed*1000003L+17L with seed=42 (PopulationSampler)",
				"seed*1000003L+7919L with seed=42 (ELayerSampler)",
				"seed*1000003L+17L with seed=9223372036854775783L -- OVERFLOWS signed 64-bit",
				"seed*2654435761L+index*104729L with seed=9223372036854775783L,index=6841 -- OVERFLOWS signed 64-bit",
				"seed*2654435761L+index*104729L with seed=2147483647,index=1 -- large, no overflow",
		};
	}

	/** Bounds for nextInt(bound): powers of two AND non-powers-of-two (rejection path). */
	private static final int[] BOUNDS = { 2, 3, 10, 45, 46, 100, 6842, 1073741824, 2147483647 };

	private static List<Seq> dumpJavaRandom() {
		long[][] seeds = javaSeedTable();
		String[] notes = javaSeedNotes();
		List<Seq> out = new ArrayList<>();

		for (int si = 0; si < seeds.length; si++) {
			long seed = seeds[si][0];
			String sTag = "s" + si;
			String note = notes[si];

			Seq sd = new Seq("jr-" + sTag + "-nextDouble", "nextDouble", "", seed, note);
			Random r = new Random(seed);
			for (int i = 0; i < DRAWS; i++) {
				sd.add(hexD(r.nextDouble()));
			}
			out.add(sd);

			Seq sg = new Seq("jr-" + sTag + "-nextGaussian", "nextGaussian", "", seed, note);
			r = new Random(seed);
			for (int i = 0; i < DRAWS; i++) {
				sg.add(hexD(r.nextGaussian()));
			}
			out.add(sg);

			Seq sl = new Seq("jr-" + sTag + "-nextLong", "nextLong", "", seed, note);
			r = new Random(seed);
			for (int i = 0; i < DRAWS; i++) {
				sl.add(hexL(r.nextLong()));
			}
			out.add(sl);

			Seq si32 = new Seq("jr-" + sTag + "-nextInt", "nextInt", "", seed, note);
			r = new Random(seed);
			for (int i = 0; i < DRAWS; i++) {
				si32.add(hexI(r.nextInt()));
			}
			out.add(si32);

			Seq sf = new Seq("jr-" + sTag + "-nextFloat", "nextFloat", "", seed, note);
			r = new Random(seed);
			for (int i = 0; i < DRAWS; i++) {
				sf.add(hexF(r.nextFloat()));
			}
			out.add(sf);

			Seq sb = new Seq("jr-" + sTag + "-nextBoolean", "nextBoolean", "", seed, note);
			r = new Random(seed);
			for (int i = 0; i < DRAWS; i++) {
				sb.add(hexI(r.nextBoolean() ? 1 : 0));
			}
			out.add(sb);

			for (int bound : BOUNDS) {
				Seq sbnd = new Seq("jr-" + sTag + "-nextIntBound-" + bound, "nextIntBound",
						String.valueOf(bound), seed, note);
				r = new Random(seed);
				for (int i = 0; i < DRAWS; i++) {
					sbnd.add(hexI(r.nextInt(bound)));
				}
				out.add(sbnd);
			}

			// Gaussian-cache interleave probe: a clone that only ever calls nextGaussian
			// cannot detect a port that forgets `haveNextNextGaussian` survives other
			// draw types. This sequence forces the cache to straddle other calls.
			Seq mix = new Seq("jr-" + sTag + "-mixed", "mixed",
					"cycle:gaussian,double,intBound45,gaussian,long,gaussian,boolean,intBound7",
					seed, note);
			r = new Random(seed);
			for (int i = 0; i < DRAWS; i++) {
				switch (i % 8) {
					case 0 -> mix.add(hexD(r.nextGaussian()));
					case 1 -> mix.add(hexD(r.nextDouble()));
					case 2 -> mix.add(hexI(r.nextInt(45)));
					case 3 -> mix.add(hexD(r.nextGaussian()));
					case 4 -> mix.add(hexL(r.nextLong()));
					case 5 -> mix.add(hexD(r.nextGaussian()));
					case 6 -> mix.add(hexI(r.nextBoolean() ? 1 : 0));
					default -> mix.add(hexI(r.nextInt(7)));
				}
			}
			out.add(mix);
		}
		return out;
	}

	// -------------------------------------------------------------- colt / MT

	private static int[] coltSeeds() {
		final long big = 9223372036854775783L;
		return new int[] {
				0,
				42,
				-1,
				2147483647,
				4357,                                        // colt MersenneTwister.DEFAULT_SEED
				(int) (big * 1000003L + 17L),                // int-truncated derived seed
				(int) (big * 2654435761L + 6841L * 104729L), // int-truncated derived seed
		};
	}

	private static String[] coltSeedNotes() {
		return new String[] {
				"literal 0",
				"literal 42",
				"literal -1",
				"literal 2147483647 (Integer.MAX_VALUE)",
				"4357 = MersenneTwister.DEFAULT_SEED",
				"(int)(9223372036854775783L*1000003L+17L) -- long-overflow then int-narrow",
				"(int)(9223372036854775783L*2654435761L+6841L*104729L) -- long-overflow then int-narrow",
		};
	}

	/** nextIntFromTo ranges: model use, non-power-of-two, negative, inverted, FULL int range. */
	private static final int[][] RANGES = {
			{ 0, 45 },                          // the model's own draw: nextIntFromTo(0, nCamps-1)
			{ 0, 6841 },                        // widest realistic resident-indexed range
			{ 0, 9 },
			{ 1, 6 },                           // non-power-of-two, non-zero origin
			{ -5, 5 },                          // straddles zero
			{ -100, -1 },                       // wholly negative
			{ 0, 0 },                           // degenerate width 1
			{ 10, 3 },                          // INVERTED (to < from) -- documents colt's behaviour
			{ -2147483648, 2147483647 },        // FULL int range: width == 2^32, long-arithmetic probe
			{ -2147483648, -2147483647 },       // at the negative extreme
			{ 2147483646, 2147483647 },         // at the positive extreme
	};

	private static List<Seq> dumpColt() {
		int[] seeds = coltSeeds();
		String[] notes = coltSeedNotes();
		List<Seq> out = new ArrayList<>();

		for (int si = 0; si < seeds.length; si++) {
			int seed = seeds[si];
			String sTag = "s" + si;
			String note = notes[si];

			Seq sn = new Seq("mt-" + sTag + "-nextInt", "nextInt", "", seed, note);
			MersenneTwister mt = new MersenneTwister(seed);
			for (int i = 0; i < DRAWS; i++) {
				sn.add(hexI(mt.nextInt()));
			}
			out.add(sn);

			Seq sr = new Seq("mt-" + sTag + "-raw", "raw", "", seed, note);
			mt = new MersenneTwister(seed);
			for (int i = 0; i < DRAWS; i++) {
				sr.add(hexD(mt.raw()));
			}
			out.add(sr);

			Seq sd = new Seq("mt-" + sTag + "-nextDouble", "nextDouble", "", seed, note);
			mt = new MersenneTwister(seed);
			for (int i = 0; i < DRAWS; i++) {
				sd.add(hexD(mt.nextDouble()));
			}
			out.add(sd);

			Seq sl = new Seq("mt-" + sTag + "-nextLong", "nextLong", "", seed, note);
			mt = new MersenneTwister(seed);
			for (int i = 0; i < DRAWS; i++) {
				sl.add(hexL(mt.nextLong()));
			}
			out.add(sl);

			Seq sfl = new Seq("mt-" + sTag + "-nextFloat", "nextFloat", "", seed, note);
			mt = new MersenneTwister(seed);
			for (int i = 0; i < DRAWS; i++) {
				sfl.add(hexF(mt.nextFloat()));
			}
			out.add(sfl);

			for (int[] rg : RANGES) {
				Seq s = new Seq("mt-" + sTag + "-nextIntFromTo-" + rg[0] + "_" + rg[1],
						"nextIntFromTo", rg[0] + "," + rg[1], seed, note);
				// Exactly the path RandomHelper.nextIntFromTo takes: a Uniform whose
				// randomGenerator is the seeded MersenneTwister.
				Uniform u = new Uniform(new MersenneTwister(seed));
				for (int i = 0; i < DRAWS; i++) {
					s.add(hexI(u.nextIntFromTo(rg[0], rg[1])));
				}
				out.add(s);
			}

			// Uniform.nextInt() -- NOT a full-range int; see decision record.
			Seq su = new Seq("mt-" + sTag + "-uniformNextInt", "uniformNextInt", "", seed, note);
			Uniform u = new Uniform(new MersenneTwister(seed));
			for (int i = 0; i < DRAWS; i++) {
				su.add(hexI(u.nextInt()));
			}
			out.add(su);
		}
		return out;
	}

	// ------------------------------------------------------------ RandomHelper

	/**
	 * Cross-check that Repast's {@code RandomHelper.setSeed(s)} + {@code nextIntFromTo}
	 * is observationally identical to {@code new Uniform(new MersenneTwister(s))} --
	 * i.e. that registry construction consumes no draws. Reflective so the dumper still
	 * runs when the Repast core jar is absent from the classpath.
	 */
	private static String randomHelperCrossCheck() {
		try {
			Class<?> rh = Class.forName("repast.simphony.random.RandomHelper");
			java.lang.reflect.Method init = rh.getMethod("init");
			java.lang.reflect.Method setSeed = rh.getMethod("setSeed", int.class);
			java.lang.reflect.Method nift = rh.getMethod("nextIntFromTo", int.class, int.class);
			init.invoke(null);
			StringBuilder mismatch = new StringBuilder();
			int checked = 0;
			for (int seed : new int[] { 0, 42, -1, 2147483647, 4357 }) {
				for (int[] rg : new int[][] { { 0, 45 }, { 1, 6 }, { -5, 5 }, { 0, 6841 } }) {
					setSeed.invoke(null, seed);
					Uniform ref = new Uniform(new MersenneTwister(seed));
					for (int i = 0; i < 2000; i++) {
						int a = (int) nift.invoke(null, rg[0], rg[1]);
						int b = ref.nextIntFromTo(rg[0], rg[1]);
						checked++;
						if (a != b && mismatch.length() < 200) {
							mismatch.append("seed=").append(seed).append(" range=").append(rg[0])
									.append("..").append(rg[1]).append(" i=").append(i)
									.append(" rh=").append(a).append(" ref=").append(b).append("; ");
						}
					}
				}
			}
			return mismatch.length() == 0
					? "IDENTICAL over " + checked + " draws"
					: "MISMATCH over " + checked + " draws: " + mismatch;
		} catch (Throwable t) {
			return "SKIPPED (" + t.getClass().getSimpleName() + ": " + t.getMessage() + ")";
		}
	}

	// ------------------------------------------------------------------ output

	private static String esc(String s) {
		return s.replace("\\", "\\\\").replace("\"", "\\\"");
	}

	private static void writeJson(Path file, String generator, String extra, List<Seq> seqs)
			throws IOException {
		Files.createDirectories(file.getParent());
		try (PrintWriter w = new PrintWriter(Files.newBufferedWriter(file, StandardCharsets.UTF_8))) {
			w.println("{");
			w.println("  \"generator\": \"" + esc(generator) + "\",");
			w.println("  \"producedBy\": \"websim/pipeline/java-exporter RngFixtureDumper (WP2-S5)\",");
			w.println("  \"javaVersion\": \"" + esc(System.getProperty("java.version")) + "\",");
			w.println("  \"javaVendor\": \"" + esc(System.getProperty("java.vendor")) + "\",");
			w.println("  \"drawsPerSequence\": " + DRAWS + ",");
			w.println("  \"headLength\": " + HEAD_N + ",");
			w.println("  \"digest\": \"SHA-256 over UTF-8 bytes of (token + \\n) for every draw, in order\",");
			w.println("  \"tokenFormat\": \"lowercase hex: %016x of Double.doubleToRawLongBits for doubles, "
					+ "%08x of Float.floatToRawIntBits for floats, %016x for longs, %08x for ints\",");
			if (!extra.isEmpty()) {
				w.println("  " + extra + ",");
			}
			w.println("  \"sequences\": [");
			for (int i = 0; i < seqs.size(); i++) {
				Seq s = seqs.get(i);
				w.println("    {");
				w.println("      \"id\": \"" + esc(s.id) + "\",");
				w.println("      \"kind\": \"" + esc(s.kind) + "\",");
				w.println("      \"params\": \"" + esc(s.params) + "\",");
				w.println("      \"seed\": \"" + s.seed + "\",");
				w.println("      \"seedNote\": \"" + esc(s.seedNote) + "\",");
				w.println("      \"count\": " + s.count + ",");
				w.println("      \"sha256\": \"" + s.sha256() + "\",");
				StringBuilder h = new StringBuilder();
				for (int k = 0; k < s.head.size(); k++) {
					if (k > 0) {
						h.append(",");
					}
					h.append("\"").append(s.head.get(k)).append("\"");
				}
				w.println("      \"head\": [" + h + "]");
				w.print("    }");
				w.println(i == seqs.size() - 1 ? "" : ",");
			}
			w.println("  ]");
			w.println("}");
		}
	}

	/**
	 * Full one-token-per-line dumps, written only under -Dwebsim.rng.full=true into a
	 * git-ignored directory. The compact JSON is the committed comparison basis; these
	 * exist so a digest mismatch can be localised to a draw index.
	 */
	private static void writeFull(Path dir, List<Seq> seqs) throws IOException {
		if (!FULL) {
			return;
		}
		Files.createDirectories(dir);
		for (Seq s : seqs) {
			StringBuilder sb = new StringBuilder(s.all.size() * 17);
			for (String t : s.all) {
				sb.append(t).append('\n');
			}
			Files.writeString(dir.resolve(s.id + ".hex"), sb.toString(), StandardCharsets.UTF_8);
		}
		System.out.println("wrote " + seqs.size() + " full .hex dumps to " + dir.toAbsolutePath());
	}

	public static void main(String[] args) throws Exception {
		Path outDir = Paths.get(args.length > 0 ? args[0]
				: "engine/test/fixtures/rng");

		long t0 = System.nanoTime();
		List<Seq> jr = dumpJavaRandom();
		writeJson(outDir.resolve("java-random.json"), "java.util.Random", "", jr);

		List<Seq> mt = dumpColt();
		String crossCheck = randomHelperCrossCheck();
		String coltExtra = "\"coltJar\": \"colt-1.2.0-no_hep.jar (Repast Simphony 2.11.0, "
				+ "eclipse/plugins/repast.simphony.core_2.11.0/lib)\",\n"
				+ "  \"randomHelperCrossCheck\": \"" + esc(crossCheck) + "\"";
		writeJson(outDir.resolve("colt-mt19937.json"), "cern.jet.random.engine.MersenneTwister", coltExtra, mt);

		Path fullDir = Paths.get(args.length > 1 ? args[1] : "pipeline/out/rng-full");
		writeFull(fullDir, jr);
		writeFull(fullDir, mt);

		System.out.printf("wrote %d java.util.Random sequences + %d colt sequences to %s in %.1f s%n",
				jr.size(), mt.size(), outDir.toAbsolutePath(), (System.nanoTime() - t0) / 1e9);
		System.out.println("RandomHelper cross-check: " + crossCheck);
	}
}
