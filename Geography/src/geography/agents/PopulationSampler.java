package geography.agents;

import java.util.Random;

/**
 * Samples heterogeneous resident attributes (V18–V22) and the per-agent
 * comfortable walking speed (V10 revised).
 *
 * <p><b>Every distribution here is transcribed from the completed evidence
 * review</b> in {@code docs/science/phase2-human-agents/01-POPULATION.md} and
 * {@code 03-MOVEMENT.md}; nothing is fitted, tuned, or invented. Each constant
 * block below names its source, year and DOI/dataset. Where the evidence does
 * not support a structure (within-band age shape, mobility-aid mix), the code
 * takes the least-assuming option and says so rather than manufacturing
 * precision.
 *
 * <p><b>RNG discipline (critical).</b> This sampler draws from its <i>own</i>
 * {@link Random} stream, derived deterministically from the run seed — never
 * from Repast's {@code RandomHelper} default stream. Repast's default stream
 * also drives encampment placement and the per-tick agent shuffle, so a single
 * extra default-stream draw would rewrite the baseline population and sever
 * comparability with the archived reference run
 * ({@code docs/science/phase2-human-agents/08-ENGINEERING.md}). Attribute
 * sampling is therefore reproducible from the seed <i>and</i> provably
 * placement-neutral: with heterogeneity disabled, no draw happens at all.
 *
 * <p>Sampling order per resident is fixed (age → sex → mobility → asthma →
 * COPD → speed) so a given seed reproduces a given population exactly.
 */
public class PopulationSampler {

	// ---- V18 Age · class M (local measurement) ------------------------------
	// 2019 Multnomah County Point-in-Time count, unsheltered population
	// (N = 2,037); PDXScholar rri_facpubs/63 (dataset D10).
	// Published bands: <18 0.003 | 18–24 0.067 | 25–54 0.727 | 55–69 0.191 | 70+ 0.012.
	// Minors excluded per decision D-4 (6 people; separate service systems and no
	// child-specific mobility evidence), adult bands renormalised to 1.
	public enum AgeBand {
		A18_24("18-24", 18, 25),
		A25_54("25-54", 25, 55),
		A55_69("55-69", 55, 70),
		A70_PLUS("70+", 70, 90);   // upper bound 90 = numerical guard, not a measurement

		public final String label;
		final int lowInclusive;
		final int highExclusive;

		AgeBand(String label, int lowInclusive, int highExclusive) {
			this.label = label;
			this.lowInclusive = lowInclusive;
			this.highExclusive = highExclusive;
		}
	}

	private static final AgeBand[] AGE_BANDS = AgeBand.values();
	/** Renormalised adult shares (0.067/0.727/0.191/0.012 ÷ 0.997). */
	private static final double[] AGE_WEIGHTS = { 0.06720, 0.72918, 0.19158, 0.01204 };

	// ---- V19 Sex · class M (local measurement) ------------------------------
	// Same source (D10): male 0.685, female 0.293, transgender 0.011,
	// does-not-identify 0.012 (renormalised). Corroborated by HUD 2023 AHAR
	// national unsheltered (68.2/30.1/0.9).
	// Sex enters the model for EXACTLY ONE mechanism: sex-specific comfortable
	// gait speed. It is not a vulnerability weight — no verified sex-modification
	// estimate for wildfire-smoke response exists (02-VULNERABILITY.md).
	public enum Sex { MALE, FEMALE, OTHER }

	private static final Sex[] SEXES = { Sex.MALE, Sex.FEMALE, Sex.OTHER };
	private static final double[] SEX_WEIGHTS = { 0.68432, 0.29271, 0.02297 };

	// ---- V20 Mobility limitation · class M (local, LOWER BOUND) -------------
	// D10 Table 22: 391 / 2,037 = 19.2% report mobility impairment. The question
	// was asked only of street-count survey completers but the denominator is the
	// full 2,037, so every non-respondent is counted as unimpaired: 0.192 is a
	// LOWER BOUND (01-POPULATION.md §5.1). Convergent external evidence brackets
	// 19–27% (CASPEH 2023 22%; Brown 2017 26.9%; Lewer 2019 21.0%).
	//
	// Age gradient: CASPEH reports 22% overall vs 32% at 50+ — a ratio of ~2.29.
	// That RATIO is applied across the age split while holding the local 0.192
	// marginal exactly, so the gradient is donor-imputed (class A) but the
	// population total remains the measured local value. Independent age/mobility
	// sampling is known to be wrong (01-POPULATION.md §7): it under-represents
	// compound-vulnerability agents, the exact group this study exists to find.
	private static final double MOBILITY_P_UNDER_55 = 0.152163;
	private static final double MOBILITY_P_55_PLUS  = 0.347802;

	/** Mobility-aid category. Base case assigns every mobility-limited resident
	 *  the AMBULANT_NO_AID category: {@code 03-MOVEMENT.md} §3 found no source for
	 *  the aid mix in this population and directs that it be swept as a scenario
	 *  variable rather than asserted. AMBULANT_NO_AID is the FASTEST of Boyce's
	 *  impaired categories, so the base case is deliberately conservative — it
	 *  understates the mobility penalty. CASPEH's finding that 20% of a 22%
	 *  mobility-limited population use an aid suggests aid use is in fact common,
	 *  which means real speeds are likely LOWER than modelled here. */
	public enum MobilityCategory {
		UNIMPAIRED("unimpaired"),
		AMBULANT_NO_AID("ambulant_impaired_no_aid");

		public final String label;

		MobilityCategory(String label) {
			this.label = label;
		}
	}

	// ---- V21 Respiratory conditions · class PROXY/L -------------------------
	// NO local asthma or COPD prevalence exists for Multnomah County's
	// unsheltered population — it is absent from the entire PIT series, so any
	// value is necessarily imported (01-POPULATION.md §6.1).
	// Adopted: Zellmer et al. 2025, J Gen Intern Med, DOI 10.1007/s11606-025-09814-x
	// (Minnesota, n = 20,139 with recent homelessness, diagnosed/EHR):
	//   asthma 0.149 (vs 7.1% housed); COPD 0.105 (vs 3.0% housed).
	// Sensitivity ranges asthma 0.15–0.24, COPD 0.04–0.14 — wide BECAUSE the
	// evidence is wide: EHR-diagnosed rates undercount the never-diagnosed and
	// self-report overcounts, and the two biases bracket the truth.
	// ACS/BRFSS/NHIS are deliberately NOT used: their sampling frames (housing
	// units, landline/cell households) structurally exclude unsheltered people.
	private static final double P_ASTHMA = 0.15;
	private static final double P_COPD   = 0.105;

	// Asthma and COPD are sampled INDEPENDENTLY OF AGE, and that is an
	// evidence-based choice rather than a convenience: Brown et al. 2017
	// (DOI 10.1093/geront/gnw011) report asthma-or-COPD at 26.3% among homeless
	// adults aged 50+, essentially identical to CASPEH's 25% across all ages —
	// so no material age gradient in respiratory disease is observable in this
	// population, unlike mobility limitation, where one clearly is.
	// Consistency check at load time: independent draws give
	// 1 − (1−0.15)(1−0.105) = 0.239 with at least one respiratory condition,
	// against CASPEH's 25% measured asthma-or-COPD.

	// ---- V10 revised · Comfortable walking speed · class L ------------------
	// Bohannon RW & Williams Andrews A (2011), Physiotherapy 97(3):182–189,
	// DOI 10.1016/j.physio.2010.12.004 — descriptive meta-analysis, 41 studies,
	// n = 23,111. Grand mean comfortable gait speed (m/s) by decade and sex.
	// Rows: 20-29, 30-39, 40-49, 50-59, 60-69, 70-79, 80+.
	private static final double[] SPEED_MEAN_MEN =
			{ 1.358, 1.433, 1.434, 1.433, 1.339, 1.262, 0.968 };
	private static final double[] SPEED_MEAN_WOMEN =
			{ 1.341, 1.337, 1.390, 1.313, 1.241, 1.132, 0.943 };

	/** Within-population coefficient of variation, from Bohannon 1997
	 *  (Age and Ageing 26(1):15–19, DOI 10.1093/ageing/26.1.15) — the only
	 *  source here supplying person-level SDs (CV ≈ 0.13; 0.11 under 60, 0.16 at
	 *  60+). Corroborated by Dommershuijsen 2022 (n = 4,656, CV = 0.167).
	 *  <b>The SDs must NOT be derived from the 2011 meta-analysis's confidence
	 *  intervals</b> — those are CIs on a between-study grand mean and would
	 *  understate between-person variability by roughly 3–5× (03-MOVEMENT.md §2.2). */
	private static final double SPEED_CV = 0.13;

	/** Boyce, Shields & Silcock (1999), Fire Technology 35(1):51–67,
	 *  DOI 10.1023/A:1015339216366, "ambulant, impaired, no aid": N(0.95, 0.32)
	 *  m/s. VERIFIED-IN-SECONDARY via Tinaburri (2018) FEMTC Table 3 — the
	 *  primary is paywalled and was not retrieved; obtain before publication.
	 *  Applied BY REPLACEMENT, not multiplication: these categories already embed
	 *  an older, impaired population, so multiplying by an age×sex mean would
	 *  double-count (03-MOVEMENT.md §3). */
	private static final double IMPAIRED_SPEED_MEAN = 0.95;
	private static final double IMPAIRED_SPEED_SD   = 0.32;

	/** Numerical truncation guard, NOT a literature value (03-MOVEMENT.md §2.3). */
	private static final double SPEED_MIN_MPS = 0.40;
	private static final double SPEED_MAX_MPS = 2.20;

	/** One resident's sampled attributes. Immutable; exported verbatim. */
	public static final class Attributes {
		public final int ageYears;
		public final AgeBand ageBand;
		public final Sex sex;
		public final boolean mobilityLimited;
		public final MobilityCategory mobilityCategory;
		public final boolean asthma;
		public final boolean copd;
		public final double walkingSpeedMps;

		Attributes(int ageYears, AgeBand ageBand, Sex sex, boolean mobilityLimited,
				MobilityCategory mobilityCategory, boolean asthma, boolean copd,
				double walkingSpeedMps) {
			this.ageYears = ageYears;
			this.ageBand = ageBand;
			this.sex = sex;
			this.mobilityLimited = mobilityLimited;
			this.mobilityCategory = mobilityCategory;
			this.asthma = asthma;
			this.copd = copd;
			this.walkingSpeedMps = walkingSpeedMps;
		}
	}

	private final Random rng;

	// Realised counts, for the load-time census printed by ContextCreator and
	// exported to the manifest: sampled marginals must be inspectable against
	// the published ones rather than trusted.
	private int nSampled = 0;
	private int nMobilityLimited = 0;
	private int nAsthma = 0;
	private int nCopd = 0;
	private int nAnyRespiratory = 0;
	private int n55Plus = 0;
	private double speedSum = 0;

	/**
	 * @param seed the run's random seed; the attribute stream is derived from it
	 *             deterministically but kept separate from Repast's default
	 *             stream (see class doc).
	 */
	public PopulationSampler(long seed) {
		this.rng = new Random(seed * 1000003L + 17L);
	}

	/** Samples one resident. Call order defines the population for a given seed. */
	public Attributes sample() {
		AgeBand band = AGE_BANDS[pick(AGE_WEIGHTS)];
		// Age uniform within the published band (01-POPULATION.md §3.2 Option A:
		// "sample age uniformly within published bands; zero invented structure").
		// A fitted continuous distribution was considered and REJECTED — nothing
		// constrains the within-band shape, so a curve would manufacture precision.
		int ageYears = band.lowInclusive + rng.nextInt(band.highExclusive - band.lowInclusive);

		Sex sex = SEXES[pick(SEX_WEIGHTS)];

		boolean mobilityLimited =
				rng.nextDouble() < (ageYears >= 55 ? MOBILITY_P_55_PLUS : MOBILITY_P_UNDER_55);
		MobilityCategory mobilityCategory = mobilityLimited
				? MobilityCategory.AMBULANT_NO_AID : MobilityCategory.UNIMPAIRED;

		boolean asthma = rng.nextDouble() < P_ASTHMA;
		boolean copd = rng.nextDouble() < P_COPD;

		double speed;
		if (mobilityLimited) {
			speed = truncatedNormal(IMPAIRED_SPEED_MEAN, IMPAIRED_SPEED_SD);
		} else {
			double mu = freeSpeedMean(ageYears, sex);
			speed = truncatedNormal(mu, SPEED_CV * mu);
		}

		nSampled++;
		if (mobilityLimited) nMobilityLimited++;
		if (asthma) nAsthma++;
		if (copd) nCopd++;
		if (asthma || copd) nAnyRespiratory++;
		if (ageYears >= 55) n55Plus++;
		speedSum += speed;

		return new Attributes(ageYears, band, sex, mobilityLimited, mobilityCategory,
				asthma, copd, speed);
	}

	/**
	 * Bohannon & Williams Andrews 2011 mean for this age and sex. Residents who
	 * do not identify as male or female take the unweighted mean of the two
	 * published columns: the source has no third column, and assigning such a
	 * resident a sex it does not have in order to obtain a speed would be an
	 * invention. Ages 18–19 use the 20–29 row (the youngest published decade);
	 * this is an extrapolation guard, flagged as such.
	 */
	private static double freeSpeedMean(int ageYears, Sex sex) {
		int row = Math.max(0, Math.min(6, (ageYears / 10) - 2));
		switch (sex) {
			case MALE:   return SPEED_MEAN_MEN[row];
			case FEMALE: return SPEED_MEAN_WOMEN[row];
			default:     return 0.5 * (SPEED_MEAN_MEN[row] + SPEED_MEAN_WOMEN[row]);
		}
	}

	/** Normal(mean, sd) resampled until inside the [0.40, 2.20] m/s guard. */
	private double truncatedNormal(double mean, double sd) {
		for (int attempt = 0; attempt < 100; attempt++) {
			double v = mean + sd * rng.nextGaussian();
			if (v >= SPEED_MIN_MPS && v <= SPEED_MAX_MPS) {
				return v;
			}
		}
		// Unreachable for the parameter values above; clamp rather than loop forever.
		return Math.max(SPEED_MIN_MPS, Math.min(SPEED_MAX_MPS, mean));
	}

	/** Index of a categorical draw over the given (already normalised) weights. */
	private int pick(double[] weights) {
		double u = rng.nextDouble();
		double acc = 0;
		for (int i = 0; i < weights.length; i++) {
			acc += weights[i];
			if (u < acc) {
				return i;
			}
		}
		return weights.length - 1;
	}

	// --- realised-marginal accessors (manifest + load-time census) ------------
	public int getSampledCount() { return nSampled; }
	public double getMobilityLimitedShare() { return share(nMobilityLimited); }
	public double getAsthmaShare() { return share(nAsthma); }
	public double getCopdShare() { return share(nCopd); }
	public double getAnyRespiratoryShare() { return share(nAnyRespiratory); }
	public double getAge55PlusShare() { return share(n55Plus); }
	public double getMeanWalkingSpeedMps() { return nSampled == 0 ? Double.NaN : speedSum / nSampled; }

	private double share(int count) {
		return nSampled == 0 ? Double.NaN : count / (double) nSampled;
	}

	/** Published marginals this sampler targets, for the load-time comparison. */
	public static String publishedTargets() {
		return "targets: mobility 0.192 (PIT 2019, lower bound) | asthma 0.150 "
				+ "(Zellmer 2025) | COPD 0.105 (Zellmer 2025) | any respiratory 0.239 "
				+ "(independent draws; CASPEH measured 0.25) | age 55+ 0.204 (PIT 2019)";
	}
}
