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
 * Tier-0 <b>volume</b> dumper: the 10^7-draw criterion of plan section 3.3 item 1 and
 * section 5.1 ("RNG fixture identity (10^7 draws x generators x seeds)").
 *
 * <p>Deliberately a separate class from {@link RngFixtureDumper}. That dumper's two JSON
 * files are a certified artefact whose bytes must not move; adding sequences to it would
 * rewrite them. This one writes its own file and leaves the existing fixtures untouched.
 *
 * <p><b>Why digests rather than tokens.</b> 10^7 draws x 5 seeds x 2 generators is 10^8
 * tokens, about 1.7 GB of hex text. Committing that is absurd; generating it on demand and
 * comparing streaming SHA-256 is bit-for-bit the same assertion -- a single flipped bit
 * anywhere changes the digest. Three things keep the comparison debuggable anyway:
 * <ul>
 *   <li>a verbatim {@value #HEAD_N}-token head, so an early divergence names its index;</li>
 *   <li>a <b>cumulative checkpoint digest every {@value #CHECKPOINT} draws</b>, so a late
 *       divergence is localised to a 10^6-draw window instead of "somewhere in 10^7"; and</li>
 *   <li>a per-sequence draw count, so a truncated stream cannot masquerade as a match.</li>
 * </ul>
 *
 * <p><b>Why one interleaved sequence per seed.</b> A single-draw-type sequence of 10^7 is
 * 10^7 draws of one code path. The cycle below spends the same budget across every draw
 * type the model actually uses -- including the Gaussian cache straddling other draw kinds,
 * which a pure-Gaussian sequence provably cannot detect (DR-S5 section 4.4).
 *
 * <p>Token format is identical to {@link RngFixtureDumper}: lowercase raw IEEE-754 /
 * two's-complement hex, and the digest is over the UTF-8 bytes of {@code token + "\n"}
 * repeated in order.
 */
public final class RngVolumeDumper {

	/** The plan's number, verbatim. */
	private static final int DRAWS = 10_000_000;

	/** Cumulative digest emitted every this many draws. */
	private static final int CHECKPOINT = 1_000_000;

	/** Verbatim head kept for early-divergence localisation. */
	private static final int HEAD_N = 64;

	private RngVolumeDumper() {
	}

	private static final char[] HEX = "0123456789abcdef".toCharArray();

	/** Zero-padded lowercase hex of the low {@code digits} nibbles. */
	private static void hex(StringBuilder sb, long value, int digits) {
		for (int shift = (digits - 1) * 4; shift >= 0; shift -= 4) {
			sb.append(HEX[(int) ((value >>> shift) & 0xF)]);
		}
	}

	/** Accumulates a 10^7-token stream into a streaming digest without ever holding it. */
	private static final class VolumeSeq {
		final String id;
		final String generator;
		final String cycle;
		final String seed;
		final String seedNote;
		final List<String> head = new ArrayList<>(HEAD_N);
		final List<String> checkpoints = new ArrayList<>(DRAWS / CHECKPOINT);
		private final MessageDigest md;
		private final StringBuilder buf = new StringBuilder(1 << 16);
		int count;

		VolumeSeq(String id, String generator, String cycle, String seed, String seedNote) {
			this.id = id;
			this.generator = generator;
			this.cycle = cycle;
			this.seed = seed;
			this.seedNote = seedNote;
			try {
				this.md = MessageDigest.getInstance("SHA-256");
			} catch (NoSuchAlgorithmException e) {
				throw new IllegalStateException(e);
			}
		}

		void add(StringBuilder token) {
			if (head.size() < HEAD_N) {
				head.add(token.toString());
			}
			buf.append(token).append('\n');
			count++;
			if (buf.length() >= (1 << 15)) {
				flush();
			}
			if (count % CHECKPOINT == 0) {
				flush();
				checkpoints.add(snapshot());
			}
		}

		private void flush() {
			md.update(buf.toString().getBytes(StandardCharsets.UTF_8));
			buf.setLength(0);
		}

		/** Cumulative digest of everything so far -- {@code clone} so the stream continues. */
		private String snapshot() {
			try {
				return toHex(((MessageDigest) md.clone()).digest());
			} catch (CloneNotSupportedException e) {
				throw new IllegalStateException("SHA-256 MessageDigest must be cloneable", e);
			}
		}

		String finish() {
			flush();
			return toHex(md.digest());
		}

		private static String toHex(byte[] d) {
			StringBuilder sb = new StringBuilder(64);
			for (byte b : d) {
				sb.append(HEX[(b >> 4) & 0xF]).append(HEX[b & 0xF]);
			}
			return sb.toString();
		}
	}

	// ------------------------------------------------------------------ seeds

	/** Plan section 3.3 item 1 verbatim: {0, 42, -1, 2^31-1, sampler-derived}. */
	private static final long[] JAVA_SEEDS = {
			0L,
			42L,
			-1L,
			2147483647L,
			42L * 1000003L + 17L,
	};

	private static final String[] JAVA_SEED_NOTES = {
			"literal 0",
			"literal 42",
			"literal -1",
			"literal 2147483647 (Integer.MAX_VALUE)",
			"seed*1000003L+17L with seed=42 (PopulationSampler derivation)",
	};

	private static final int[] COLT_SEEDS = { 0, 42, -1, 2147483647, 4357 };

	private static final String[] COLT_SEED_NOTES = {
			"literal 0",
			"literal 42",
			"literal -1",
			"literal 2147483647 (Integer.MAX_VALUE)",
			"4357 = MersenneTwister.DEFAULT_SEED",
	};

	static final String JAVA_CYCLE =
			"nextDouble,nextGaussian,nextInt(45),nextLong,nextBoolean,nextFloat,nextInt(),nextInt(6842)";

	static final String COLT_CYCLE =
			"nextIntFromTo(0,45),raw,nextDouble,nextInt,nextLong,nextFloat,nextIntFromTo(1,6),nextIntFromTo(-5,5)";

	// ------------------------------------------------------------- generators

	private static VolumeSeq dumpJava(int index) {
		long seed = JAVA_SEEDS[index];
		VolumeSeq seq = new VolumeSeq("jr-vol-s" + index, "java.util.Random", JAVA_CYCLE,
				Long.toString(seed), JAVA_SEED_NOTES[index]);
		Random r = new Random(seed);
		StringBuilder t = new StringBuilder(16);
		for (int i = 0; i < DRAWS; i++) {
			t.setLength(0);
			switch (i & 7) {
				case 0 -> hex(t, Double.doubleToRawLongBits(r.nextDouble()), 16);
				case 1 -> hex(t, Double.doubleToRawLongBits(r.nextGaussian()), 16);
				case 2 -> hex(t, r.nextInt(45) & 0xFFFFFFFFL, 8);
				case 3 -> hex(t, r.nextLong(), 16);
				case 4 -> hex(t, r.nextBoolean() ? 1 : 0, 8);
				case 5 -> hex(t, Float.floatToRawIntBits(r.nextFloat()) & 0xFFFFFFFFL, 8);
				case 6 -> hex(t, r.nextInt() & 0xFFFFFFFFL, 8);
				default -> hex(t, r.nextInt(6842) & 0xFFFFFFFFL, 8);
			}
			seq.add(t);
		}
		return seq;
	}

	private static VolumeSeq dumpColt(int index) {
		int seed = COLT_SEEDS[index];
		VolumeSeq seq = new VolumeSeq("mt-vol-s" + index,
				"cern.jet.random.engine.MersenneTwister", COLT_CYCLE,
				Integer.toString(seed), COLT_SEED_NOTES[index]);
		// One engine, one Uniform over it: exactly RandomHelper's wiring, so the interleave
		// exercises the scaled and the raw paths against a SINGLE shared MT state -- which is
		// the arrangement the model has, and the one a port is most likely to get wrong.
		MersenneTwister mt = new MersenneTwister(seed);
		Uniform u = new Uniform(mt);
		StringBuilder t = new StringBuilder(16);
		for (int i = 0; i < DRAWS; i++) {
			t.setLength(0);
			switch (i & 7) {
				case 0 -> hex(t, u.nextIntFromTo(0, 45) & 0xFFFFFFFFL, 8);
				case 1 -> hex(t, Double.doubleToRawLongBits(mt.raw()), 16);
				case 2 -> hex(t, Double.doubleToRawLongBits(mt.nextDouble()), 16);
				case 3 -> hex(t, mt.nextInt() & 0xFFFFFFFFL, 8);
				case 4 -> hex(t, mt.nextLong(), 16);
				case 5 -> hex(t, Float.floatToRawIntBits(mt.nextFloat()) & 0xFFFFFFFFL, 8);
				case 6 -> hex(t, u.nextIntFromTo(1, 6) & 0xFFFFFFFFL, 8);
				default -> hex(t, u.nextIntFromTo(-5, 5) & 0xFFFFFFFFL, 8);
			}
			seq.add(t);
		}
		return seq;
	}

	// ------------------------------------------------------------------ output

	private static String esc(String s) {
		return s.replace("\\", "\\\\").replace("\"", "\\\"");
	}

	private static void writeJson(Path file, List<VolumeSeq> seqs, List<String> digests)
			throws IOException {
		Files.createDirectories(file.getParent());
		try (PrintWriter w = new PrintWriter(Files.newBufferedWriter(file, StandardCharsets.UTF_8))) {
			w.println("{");
			w.println("  \"producedBy\": \"websim/pipeline/java-exporter RngVolumeDumper\",");
			w.println("  \"criterion\": \"plan 3.3 item 1 / 5.1 Tier 0: 10^7 draws x 5 seeds x generators\",");
			w.println("  \"javaVersion\": \"" + esc(System.getProperty("java.version")) + "\",");
			w.println("  \"javaVendor\": \"" + esc(System.getProperty("java.vendor")) + "\",");
			w.println("  \"coltJar\": \"colt-1.2.0-no_hep.jar (Repast Simphony 2.11.0)\",");
			w.println("  \"drawsPerSequence\": " + DRAWS + ",");
			w.println("  \"checkpointEvery\": " + CHECKPOINT + ",");
			w.println("  \"headLength\": " + HEAD_N + ",");
			w.println("  \"digest\": \"SHA-256 over UTF-8 bytes of (token + \\n) for every draw, in order; "
					+ "checkpoints are CUMULATIVE digests of the first k*checkpointEvery draws\",");
			w.println("  \"tokenFormat\": \"lowercase hex: 16 digits of Double.doubleToRawLongBits / of a long, "
					+ "8 digits of Float.floatToRawIntBits / of an int\",");
			w.println("  \"sequences\": [");
			for (int i = 0; i < seqs.size(); i++) {
				VolumeSeq s = seqs.get(i);
				w.println("    {");
				w.println("      \"id\": \"" + esc(s.id) + "\",");
				w.println("      \"generator\": \"" + esc(s.generator) + "\",");
				w.println("      \"cycle\": \"" + esc(s.cycle) + "\",");
				w.println("      \"seed\": \"" + esc(s.seed) + "\",");
				w.println("      \"seedNote\": \"" + esc(s.seedNote) + "\",");
				w.println("      \"count\": " + s.count + ",");
				w.println("      \"sha256\": \"" + digests.get(i) + "\",");
				StringBuilder cp = new StringBuilder();
				for (int k = 0; k < s.checkpoints.size(); k++) {
					cp.append(k > 0 ? ",\n        " : "\n        ")
							.append("\"").append(s.checkpoints.get(k)).append("\"");
				}
				w.println("      \"checkpoints\": [" + cp + "\n      ],");
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

	public static void main(String[] args) throws Exception {
		Path outDir = Paths.get(args.length > 0 ? args[0] : "engine/test/fixtures/rng");
		long t0 = System.nanoTime();

		List<VolumeSeq> seqs = new ArrayList<>();
		List<String> digests = new ArrayList<>();
		for (int i = 0; i < JAVA_SEEDS.length; i++) {
			VolumeSeq s = dumpJava(i);
			digests.add(s.finish());
			seqs.add(s);
			System.out.printf("  %s: %,d draws%n", s.id, s.count);
		}
		for (int i = 0; i < COLT_SEEDS.length; i++) {
			VolumeSeq s = dumpColt(i);
			digests.add(s.finish());
			seqs.add(s);
			System.out.printf("  %s: %,d draws%n", s.id, s.count);
		}

		Path file = outDir.resolve("rng-volume.json");
		writeJson(file, seqs, digests);

		long total = 0;
		for (VolumeSeq s : seqs) {
			total += s.count;
		}
		System.out.printf("wrote %d volume sequences (%,d draws total) to %s in %.1f s%n",
				seqs.size(), total, file.toAbsolutePath(), (System.nanoTime() - t0) / 1e9);
	}
}
