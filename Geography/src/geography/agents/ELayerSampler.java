package geography.agents;

import java.util.Random;

/**
 * Samples the Phase-E decision-layer attributes (V29, V31–V35) — awareness,
 * heavy belongings, pet, dependent children, and the persistent
 * departure-propensity trait theta — plus the per-agent decision-stream seed.
 *
 * <p><b>Every prevalence here is transcribed from the completed E1 evidence
 * harvest</b> in {@code docs/critique-response/E-LAYER-SPEC.md} §1 and the
 * registry rows V29–V35; nothing is fitted, tuned, or invented. Bracket
 * midpoints that ARE assumptions are declared as such (A-27) and swept.
 *
 * <p><b>RNG discipline (critical — three streams, zero contamination).</b>
 * This sampler draws from its <i>own</i> {@link Random} stream
 * ({@code seed * 1000003 + 7919}), distinct from BOTH Repast's default stream
 * (encampment placement + per-tick shuffle) and {@link PopulationSampler}'s
 * stream ({@code seed * 1000003 + 17}). It must be invoked in a <b>separate
 * second pass</b> after the placement/attribute loop completes, so the archived
 * age/sex/speed population stays byte-identical
 * ({@code docs/science/phase2-human-agents/08-ENGINEERING.md}).
 *
 * <p><b>Every variate is drawn unconditionally</b> and in a fixed order per
 * resident (aware → belongings → pet → dependents → theta), so the realized
 * E-population is identical across E-parameter sweeps: changing sigmaTheta or
 * a barrier cost never reshuffles who owns a pet. Theta is stored as the raw
 * standard-normal draw and scaled by sigmaTheta at use, so sigmaTheta = 0
 * (the R3 null) still consumes the draw.
 *
 * <p>In-run stochastic decisions (hazard Bernoulli, outreach conversion,
 * Scenario-E stuck outcome) must not touch any of the streams above; each
 * agent gets its own deterministic decision seed
 * ({@code seed * 2654435761 + index * 104729}), which also makes an agent's
 * decision sequence invariant to step-order shuffling.
 */
public class ELayerSampler {

	// ---- V29 Awareness · class L (local, same-event) ------------------------
	// Hines, Leickly, Petteni & Knowlton 2021, "Stories from the Outside:
	// Oregon Wildfires 2020", PSU HRAC (PDXScholar hrac_pub/27), N = 73 unhoused
	// Portland-area adults surveyed about THIS event: nearly 65% did not hear
	// about emergency shelters -> aware 26/73 = 0.356. Wilson 95% CI 0.25-0.47.
	// The DEFAULT param value is 1.0 (everyone aware) so legacy arms reproduce;
	// baseline-real E arms pass 0.356 via their batch params.
	public static final double P_AWARE_INIT_SOURCED = 0.356;

	// ---- V31 Heavy belongings · class A (declared midpoint, sourced bracket) -
	// Floor: Ozarks 2024 unsheltered PIT (N=138, 10.8% cited dogs/property for
	// skipping shelter). Ceiling: CASPEH 2023 (42% belongings confiscated <=6mo)
	// / Herring et al. 2020 (46%, N=351). Midpoint 0.284 is DECLARED ASSUMPTION
	// A-27, swept over the full bracket. Mechanism is decision latency and
	// abandonment (JOHS spokesperson, Street Roots 2020-09-16), NEVER a
	// walking-speed penalty: load carriage does not slow self-selected walking
	// (Bastien 2005, negative result in 03-MOVEMENT.md).
	public static final double P_HEAVY_BELONGINGS_SOURCED = 0.284;

	// ---- V32 Pet · class L --------------------------------------------------
	// Henwood, Dzubur, Rhoades, St. Clair & Cox 2020, J Social Distress and
	// Homelessness 30(2), DOI 10.1080/10530789.2020.1795791: pet ownership among
	// unsheltered adults in the LA County count, 12%/9.0%/11.7% weighted over
	// 2017-19. Floor 0.055 from Cronley et al. 2009 (sheltered adults,
	// DOI 10.2466/PR0.105.2.481-499). 48.1% of owners ever turned away over pet
	// policy — which is why the pet gate exists at all (A-29).
	public static final double P_HAS_PET_SOURCED = 0.117;

	// ---- V33 Dependent children · class M (local administrative count) ------
	// HUD 2025 PIT Populations & Subpopulations, CoC OR-501: 30 unsheltered
	// adult+child households / 6,831 unsheltered adults = 0.0044. The 2020
	// record shows adults-only intake at the smoke shelters (Street Roots),
	// so this attribute activates a real documented exclusion. Sweep ceiling
	// 0.03 (0.022 = Pathways 2026 caretaker rate).
	public static final double P_HAS_DEPENDENTS_SOURCED = 0.0044;

	// ---- V34 Group walking-speed delta · class L ----------------------------
	// Moussaid, Perozo, Garnier, Helbing & Theraulaz 2010, PLoS ONE 5(4):e10047,
	// DOI 10.1371/journal.pone.0010047: group speed v = -0.04x + 1.26 (low
	// density) / -0.08x + 1.24 (high density) per extra member. Applied for ONE
	// extra member (household size beyond the adult is unrecorded — least-
	// assuming option), midpoint 0.06 m/s, swept 0.04-0.08 via the param.
	// Derived field on DecisionAttributes; the sampled individual speed in
	// PopulationSampler.Attributes is NEVER mutated.
	public static final double GROUP_SPEED_DELTA_SOURCED_MPS = 0.06;

	/** One resident's sampled decision attributes. Immutable; exported verbatim. */
	public static final class DecisionAttributes {
		/** Knows shelters exist at t0 (V29). */
		public final boolean awareInitial;
		/** Heavy belongings / cart (V31). */
		public final boolean heavyBelongings;
		/** Travels with a pet (V32). */
		public final boolean hasPet;
		/** Travels with dependent children (V33). */
		public final boolean hasDependents;
		/** RAW standard-normal persistent trait draw (V35); scaled by sigmaTheta
		 *  at use so the population is invariant across sigma sweeps. */
		public final double thetaZ;
		/** Group-pace reduction applied to effective speed while travelling
		 *  (V34); 0 unless hasDependents. */
		public final double groupSpeedDeltaMps;
		/** Seed for this agent's private in-run decision stream. */
		public final long decisionSeed;

		DecisionAttributes(boolean awareInitial, boolean heavyBelongings,
				boolean hasPet, boolean hasDependents, double thetaZ,
				double groupSpeedDeltaMps, long decisionSeed) {
			this.awareInitial = awareInitial;
			this.heavyBelongings = heavyBelongings;
			this.hasPet = hasPet;
			this.hasDependents = hasDependents;
			this.thetaZ = thetaZ;
			this.groupSpeedDeltaMps = groupSpeedDeltaMps;
			this.decisionSeed = decisionSeed;
		}
	}

	private final Random rng;
	private final long runSeed;
	private final double pAware;
	private final double pHeavy;
	private final double pPet;
	private final double pDependents;
	private final double groupSpeedDeltaMps;

	// Realised counts for the load-time census and the manifest: sampled
	// marginals must be inspectable against the published ones, and A-28
	// (declared independence) requires the realized JOINT prevalences too.
	private int nSampled = 0;
	private int nAware = 0;
	private int nHeavy = 0;
	private int nPet = 0;
	private int nDependents = 0;
	private int nAnyBarrier = 0;
	private int nCompoundBarrier = 0;

	/**
	 * @param seed               the run's random seed; this stream is derived from
	 *                           it deterministically but separate from both the
	 *                           Repast default stream and PopulationSampler's
	 * @param pAware             P(aware at t0); 1.0 = legacy behaviour
	 * @param pHeavy             P(heavy belongings)
	 * @param pPet               P(pet)
	 * @param pDependents        P(dependent children)
	 * @param groupSpeedDeltaMps speed reduction for dependent-accompanied travel
	 */
	public ELayerSampler(long seed, double pAware, double pHeavy, double pPet,
			double pDependents, double groupSpeedDeltaMps) {
		this.rng = new Random(seed * 1000003L + 7919L);
		this.runSeed = seed;
		this.pAware = pAware;
		this.pHeavy = pHeavy;
		this.pPet = pPet;
		this.pDependents = pDependents;
		this.groupSpeedDeltaMps = groupSpeedDeltaMps;
	}

	/**
	 * Samples one resident's decision attributes. Call order defines the
	 * E-population for a given seed and must match agent creation order.
	 * Every variate is drawn unconditionally (see class doc).
	 */
	public DecisionAttributes sample() {
		int index = nSampled;
		boolean aware = rng.nextDouble() < pAware;
		boolean heavy = rng.nextDouble() < pHeavy;
		boolean pet = rng.nextDouble() < pPet;
		boolean dependents = rng.nextDouble() < pDependents;
		double thetaZ = rng.nextGaussian();
		double delta = dependents ? groupSpeedDeltaMps : 0.0;
		long decisionSeed = runSeed * 2654435761L + index * 104729L;

		nSampled++;
		if (aware) nAware++;
		if (heavy) nHeavy++;
		if (pet) nPet++;
		if (dependents) nDependents++;
		int barriers = (heavy ? 1 : 0) + (pet ? 1 : 0) + (dependents ? 1 : 0);
		if (barriers >= 1) nAnyBarrier++;
		if (barriers >= 2) nCompoundBarrier++;

		return new DecisionAttributes(aware, heavy, pet, dependents, thetaZ,
				delta, decisionSeed);
	}

	// --- realised-marginal accessors (manifest + load-time census) ------------
	public int getSampledCount() { return nSampled; }
	public double getAwareShare() { return share(nAware); }
	public double getHeavyBelongingsShare() { return share(nHeavy); }
	public double getPetShare() { return share(nPet); }
	public double getDependentsShare() { return share(nDependents); }
	/** At least one of belongings/pet/dependents — the barrier-bearing stratum. */
	public double getAnyBarrierShare() { return share(nAnyBarrier); }
	/** Two or more barriers — the compound-barrier stratum A-28 reports. */
	public double getCompoundBarrierShare() { return share(nCompoundBarrier); }

	private double share(int count) {
		return nSampled == 0 ? Double.NaN : count / (double) nSampled;
	}

	/** Published marginals this sampler targets, for the load-time comparison. */
	public static String publishedTargets() {
		return "targets: aware 0.356 (Hines 2021, N=73, same event) | belongings "
				+ "0.284 (A-27 midpoint of 0.108-0.46) | pet 0.117 (Henwood 2020) | "
				+ "dependents 0.0044 (HUD 2025 PIT OR-501)";
	}
}
