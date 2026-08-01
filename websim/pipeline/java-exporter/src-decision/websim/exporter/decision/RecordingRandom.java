package websim.exporter.decision;

import java.security.MessageDigest;

/**
 * The per-agent decision stream, recorded.
 *
 * <p>{@code GisAgent.setDecisionLayer} constructs
 * {@code new java.util.Random(da.decisionSeed)} and never touches it again except
 * through {@code nextDouble()}. This class <b>is</b> that generator — it extends
 * {@code java.util.Random} and delegates every bit to {@code super.nextDouble()},
 * so the LCG, the {@code next(26)/next(27)} split and the seed scramble are the
 * JDK's, not a transcription. The driver swaps the field over immediately after
 * {@code setDecisionLayer} returns, while the stream is still at draw 0, so the
 * sequence a traced agent consumes is bit-identical to the one it would have
 * consumed untraced.
 *
 * <p>Two artefacts come out of it:
 * <ul>
 *   <li>a per-draw row (stream id, draw index, raw IEEE-754 bits, and the site
 *       tag D1/D2/D3 set by the surrounding probe hook) for the sampled cohort;</li>
 *   <li>a draw <b>count</b> and a rolling SHA-256 over the raw bits of the whole
 *       sequence, for <b>every</b> resident. That pair is the WP8 §17.2 acceptance
 *       artefact: a port that hoists the hazard draw out of {@code open &&}
 *       (QUIRK 1) matches neither.</li>
 * </ul>
 */
public final class RecordingRandom extends java.util.Random {

	private static final long serialVersionUID = 1L;

	/** The generator belonging to the resident the driver is currently stepping. */
	static RecordingRandom current;

	private final long seed;
	private final MessageDigest digest;
	private int drawCount;
	private int index = -1;
	private boolean cohort;
	private String runPrefix = "";

	public RecordingRandom(long seed) {
		super(seed);
		this.seed = seed;
		try {
			this.digest = MessageDigest.getInstance("SHA-256");
		} catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	void bind(int index, boolean cohort, String runPrefix) {
		this.index = index;
		this.cohort = cohort;
		this.runPrefix = runPrefix;
	}

	/** Draws consumed by the resident currently being stepped, or 0. */
	static int currentDrawCount() {
		return current == null ? 0 : current.drawCount;
	}

	@Override
	public double nextDouble() {
		double v = super.nextDouble();
		long bits = Double.doubleToRawLongBits(v);
		for (int s = 56; s >= 0; s -= 8) {
			digest.update((byte) (bits >>> s));
		}
		int n = drawCount++;
		if (DecisionProbe.enabled && cohort) {
			DecisionProbe.emitDraw(runPrefix + index + "\t" + n + "\t" + DecisionProbe.drawSite
					+ "\t" + DecisionProbe.hxl(bits));
		}
		return v;
	}

	// WP8-SPEC-decision.md §14.3: the per-agent decision stream is consumed by
	// nextDouble() and by nothing else, ever. These make that claim falsifiable
	// rather than assumed -- a future draw site using any other method aborts the
	// dump instead of silently escaping the draw log and the digest.
	private static UnsupportedOperationException banned(String m) {
		return new UnsupportedOperationException("decision stream: " + m + " is not a declared "
				+ "draw site (WP8-SPEC-decision.md 14.3 lists nextDouble only)");
	}

	@Override
	public int nextInt() {
		throw banned("nextInt()");
	}

	@Override
	public int nextInt(int bound) {
		throw banned("nextInt(int)");
	}

	@Override
	public long nextLong() {
		throw banned("nextLong()");
	}

	@Override
	public boolean nextBoolean() {
		throw banned("nextBoolean()");
	}

	@Override
	public float nextFloat() {
		throw banned("nextFloat()");
	}

	@Override
	public double nextGaussian() {
		throw banned("nextGaussian()");
	}

	public int drawCount() {
		return drawCount;
	}

	public long seed() {
		return seed;
	}

	/** SHA-256 over the raw bits of every draw, in order. Terminal: call once. */
	public String digestHex() {
		byte[] d = digest.digest();
		StringBuilder sb = new StringBuilder(64);
		for (byte b : d) {
			sb.append(DecisionProbe.hxl(b & 0xFFL).substring(14));
		}
		return sb.toString();
	}
}
