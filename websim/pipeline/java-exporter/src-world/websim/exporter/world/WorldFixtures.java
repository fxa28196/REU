package websim.exporter.world;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.Method;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

import org.locationtech.jts.geom.Coordinate;

import geography.agents.ELayerSampler;
import geography.agents.PopulationSampler;
import geography.agents.Shelter;
import geography.data.CsvLoader;
import geography.env.SmokeField;
import geography.routing.StreetNetwork;

/**
 * TASK F1 — Java fixture exporter for WP5 (routing) and WP6 (world build).
 *
 * <p>Produces, from the CERTIFIED {@code geography.*} classes and nothing else:
 * <ol type="a">
 *   <li><b>Shelter shortest-path trees</b> for arms A/B/C — full per-shelter
 *       distance and predecessor-edge arrays ({@link ShelterTrees}).</li>
 *   <li><b>World-build fixtures</b> at seeds 42/43/44 for arms A/B/C, the
 *       E0-null R3 vehicle, the ER baseline-real arms and the SE/SE2 severe
 *       arms: camp assignment index, sampled demographics, E-layer attributes,
 *       derived decision seed, snapped start node + snap gap, and every
 *       shelter's open/close tick, capacity and triage reserve — in per-resident
 *       index order.</li>
 *   <li><b>HALF_UP formatter fixtures</b> ({@link HalfUpFormat}).</li>
 * </ol>
 *
 * <p><b>Invocation discipline.</b> Certified classes own every value:
 * {@code PopulationSampler}/{@code ELayerSampler} are constructed and sampled
 * directly (so the seed derivation, draw order and Gaussian-cache behaviour are
 * Java's, not a transcription); {@code StreetNetwork.nearestNode/computeTree/
 * geodesicDistanceM} do all routing and snapping; {@code CsvLoader.read} does
 * all parsing; {@code Shelter} does capacity/reserve clamping;
 * {@code SmokeField} builds the hourly array; and the encampment/shelter/
 * closure/smoke file names, {@code SIM_START} and the private
 * {@code tickForDate} all come out of {@code ContextCreator} by reflection.
 *
 * <p><b>What is mirrored, and why.</b> {@code ContextCreator.build()} cannot be
 * invoked headlessly (it needs a live Repast {@code Context}, a {@code Geography}
 * projection, {@code RunEnvironment}, a {@code Parameters} schema and a
 * {@code Geography.rs} scenario directory). Three of its loops are therefore
 * mirrored statement-for-statement, with the display-only side effects omitted:
 * the per-feature street loop (in {@link CertifiedGraph}), the shelter loop
 * (L546–L591) and the resident placement + Phase-E second pass (L710–L790).
 * The mirror is held honest by the graph census assertion, by cross-config
 * digest invariants (the three-streams rule made executable) and by checking the
 * realised marginals against the published seed-42 values.
 *
 * <p><b>Reproducibility.</b> Nothing here reads a clock, an environment variable
 * or a path that is not production-relative, and no map is iterated in hash
 * order. Two runs must produce byte-identical dumps; {@code dump-world-fixtures.ps1
 * -Verify} proves it by running twice and diffing every SHA-256.
 */
public final class WorldFixtures {

	private WorldFixtures() { }

	/** The three archived seeds this task dumps. */
	private static final int[] SEEDS = { 42, 43, 44 };

	/** Every 2026 bundle runs the full population (PORT_MAP §3.2). */
	private static final int NUM_AGENTS = 6842;
	private static final double MINUTES_PER_TICK = 1.0;
	private static final double TICKS_PER_HOUR = 60.0 / MINUTES_PER_TICK;

	/**
	 * Realised marginals at n=6,842, read out of the ARCHIVED
	 * {@code simulation.json population_sampling} blocks, in
	 * {@code OutcomeLogger}'s own {@code %.4f} rendering and its own column
	 * order (mobility, asthma, COPD, any-respiratory, age 55+, mean speed).
	 *
	 * <p><b>Finding F1-F1.</b> {@code IMPLEMENTATION_PLAN.md} L370/L642 and
	 * {@code PORT_MAP.md} L617 attribute {@code 0.195 / 0.147 / 0.104 / 0.235 /
	 * 0.259 / 1.280} to <i>seed 42</i>. Those six values are in fact
	 * <i>seed 48</i>'s ({@code docs/runs/present-day-three-arm/A-seed48}).
	 * Seed 42's are below, and they are recorded by 52 archived manifests.
	 * The websim docs were corrected; see DR-F1.
	 */
	private static final Map<Integer, String[]> ARCHIVED_MARGINALS_N6842 = archivedMarginals();

	private static Map<Integer, String[]> archivedMarginals() {
		Map<Integer, String[]> m = new LinkedHashMap<Integer, String[]>();
		// docs/runs/phase-e/E0null-A-n6842-seed42 (and 51 further manifests)
		m.put(Integer.valueOf(42),
				new String[] { "0.1988", "0.1478", "0.1079", "0.2381", "0.2622", "1.2805" });
		// docs/runs/phase-e/ER-A-n6842-seed43 (and 40 further manifests)
		m.put(Integer.valueOf(43),
				new String[] { "0.1995", "0.1523", "0.0978", "0.2343", "0.2562", "1.2796" });
		// docs/runs/phase-e/ER-A-n6842-seed44 (and 40 further manifests)
		m.put(Integer.valueOf(44),
				new String[] { "0.2093", "0.1481", "0.1004", "0.2331", "0.2726", "1.2752" });
		return m;
	}

	// ------------------------------------------------------------- config

	/** One archived run configuration, in ContextCreator's own parameter names. */
	private static final class Config {
		final String id;
		final int scenarioCode;
		final int simulationHours;
		final int enableHeterogeneity;
		final int respectShelterOpeningDates;
		final double triageReserveFraction;
		final int enableDecisionLayer;
		final double pAwareInit;
		final double pHeavyBelongings;
		final double pHasPet;
		final double pHasDependents;
		final double groupSpeedDeltaMps;
		final int shelterPolicyVariant;
		final int smokeSeriesCode;
		final double smokeScale;
		final int closuresCode;
		final int closureDraw;
		/** Label for the E-parameter family, used by the cross-config invariants. */
		final String eFamily;

		String sheltersCsv;
		String scenarioName;

		Config(String id, int scenarioCode, int simulationHours, int enableHeterogeneity,
				int respectShelterOpeningDates, double triageReserveFraction, int enableDecisionLayer,
				double pAwareInit, double pHeavyBelongings, double pHasPet, double pHasDependents,
				double groupSpeedDeltaMps, int shelterPolicyVariant, int smokeSeriesCode,
				double smokeScale, int closuresCode, int closureDraw, String eFamily) {
			this.id = id;
			this.scenarioCode = scenarioCode;
			this.simulationHours = simulationHours;
			this.enableHeterogeneity = enableHeterogeneity;
			this.respectShelterOpeningDates = respectShelterOpeningDates;
			this.triageReserveFraction = triageReserveFraction;
			this.enableDecisionLayer = enableDecisionLayer;
			this.pAwareInit = pAwareInit;
			this.pHeavyBelongings = pHeavyBelongings;
			this.pHasPet = pHasPet;
			this.pHasDependents = pHasDependents;
			this.groupSpeedDeltaMps = groupSpeedDeltaMps;
			this.shelterPolicyVariant = shelterPolicyVariant;
			this.smokeSeriesCode = smokeSeriesCode;
			this.smokeScale = smokeScale;
			this.closuresCode = closuresCode;
			this.closureDraw = closureDraw;
			this.eFamily = eFamily;
		}
	}

	// -- E-block constants, verbatim from PORT_MAP §3.3 -----------------------
	private static final double E_P_HEAVY = 0.284;
	private static final double E_P_PET = 0.117;
	private static final double E_P_DEP = 0.0044;

	private static List<Config> configs() {
		List<Config> c = new ArrayList<Config>();
		// legacy three-arm (no decision layer at all)
		c.add(new Config("A", 0, 312, 1, 1, 0.0, 0, 1.0, 0, 0, 0, 0.0, 0, 0, 1.0, 0, 1, "none"));
		c.add(new Config("B", 1, 312, 1, 1, 0.0, 0, 1.0, 0, 0, 0, 0.0, 0, 0, 1.0, 0, 1, "none"));
		c.add(new Config("C", 2, 312, 1, 1, 0.0, 0, 1.0, 0, 0, 0, 0.0, 0, 0, 1.0, 0, 1, "none"));
		// E0 null -- decision layer ON, every knob degenerate (the R3 vehicle)
		c.add(new Config("E0-A", 0, 312, 1, 1, 0.0, 1, 1.0, E_P_HEAVY, E_P_PET, E_P_DEP,
				0.0, 0, 0, 1.0, 0, 1, "E0"));
		c.add(new Config("E0-B", 1, 312, 1, 1, 0.0, 1, 1.0, E_P_HEAVY, E_P_PET, E_P_DEP,
				0.0, 0, 0, 1.0, 0, 1, "E0"));
		c.add(new Config("E0-C", 2, 312, 1, 1, 0.0, 1, 1.0, E_P_HEAVY, E_P_PET, E_P_DEP,
				0.0, 0, 0, 1.0, 0, 1, "E0"));
		// ER baseline-real (codes 0 / 2 / 7-with-reserve, shelterPolicyVariant=1)
		c.add(new Config("ER-A", 0, 312, 1, 1, 0.0, 1, 0.356, E_P_HEAVY, E_P_PET, E_P_DEP,
				0.06, 1, 0, 1.0, 0, 1, "EREAL"));
		c.add(new Config("ER-C", 2, 312, 1, 1, 0.0, 1, 0.356, E_P_HEAVY, E_P_PET, E_P_DEP,
				0.06, 1, 0, 1.0, 0, 1, "EREAL"));
		c.add(new Config("ER-D", 7, 312, 1, 1, 0.10, 1, 0.356, E_P_HEAVY, E_P_PET, E_P_DEP,
				0.06, 1, 0, 1.0, 0, 1, "EREAL"));
		// SE severe v1 (455 h, smoke series 1, closures base)
		c.add(new Config("SE-E18", 18, 455, 1, 1, 0.0, 1, 0.356, E_P_HEAVY, E_P_PET, E_P_DEP,
				0.06, 1, 1, 1.0, 1, 1, "EREAL"));
		c.add(new Config("SE-E19", 19, 455, 1, 1, 0.0, 1, 0.356, E_P_HEAVY, E_P_PET, E_P_DEP,
				0.06, 1, 1, 1.0, 1, 1, "EREAL"));
		c.add(new Config("SE-E20", 20, 455, 1, 1, 0.10, 1, 0.356, E_P_HEAVY, E_P_PET, E_P_DEP,
				0.06, 1, 1, 1.0, 1, 1, "EREAL"));
		// SE2 worst-plausible (smoke series 2, worst closure family draw 1)
		c.add(new Config("SE2-E18-d1", 18, 455, 1, 1, 0.0, 1, 0.356, E_P_HEAVY, E_P_PET, E_P_DEP,
				0.06, 1, 2, 1.0, 3, 1, "EREAL"));
		return c;
	}

	// ------------------------------------------------- certified constants

	private static Class<?> CC;
	private static Method M_TICK_FOR_DATE;
	private static LocalDateTime SIM_START;
	private static String ENCAMPMENTS_CSV;
	private static String SMOKE_CSV;
	private static String SMOKE_SEVERE_CSV;
	private static String SMOKE_SEVERE_V2_CSV;
	private static String SHELTERS_CSV_2020;
	private static String SHELTERS_A_CSV;
	private static String SHELTERS_B_CSV;
	private static String SHELTERS_C_CSV;
	private static String CLOSURES_BASE_CSV;
	private static String CLOSURES_EXTREME_CSV;
	private static String CLOSURES_WORST_PREFIX;
	private static String CLOSURES_WORST_SUFFIX;
	private static String VARIABLES_CSV;
	private static String ASSUMPTIONS_CSV;

	private static void loadCertifiedConstants() throws Exception {
		CC = Class.forName("geography.agents.ContextCreator");
		M_TICK_FOR_DATE = Reflect.declaredMethod(CC, "tickForDate",
				String.class, double.class, double.class, int.class);
		SIM_START = (LocalDateTime) Reflect.staticField(CC, "SIM_START");
		ENCAMPMENTS_CSV = (String) Reflect.staticField(CC, "ENCAMPMENTS_CSV");
		SMOKE_CSV = (String) Reflect.staticField(CC, "SMOKE_CSV");
		SMOKE_SEVERE_CSV = (String) Reflect.staticField(CC, "SMOKE_SEVERE_CSV");
		SMOKE_SEVERE_V2_CSV = (String) Reflect.staticField(CC, "SMOKE_SEVERE_V2_CSV");
		SHELTERS_CSV_2020 = (String) Reflect.staticField(CC, "SHELTERS_CSV");
		SHELTERS_A_CSV = (String) Reflect.staticField(CC, "SHELTERS_A_CSV");
		SHELTERS_B_CSV = (String) Reflect.staticField(CC, "SHELTERS_B_CSV");
		SHELTERS_C_CSV = (String) Reflect.staticField(CC, "SHELTERS_C_CSV");
		CLOSURES_BASE_CSV = (String) Reflect.staticField(CC, "CLOSURES_BASE_CSV");
		CLOSURES_EXTREME_CSV = (String) Reflect.staticField(CC, "CLOSURES_EXTREME_CSV");
		CLOSURES_WORST_PREFIX = (String) Reflect.staticField(CC, "CLOSURES_WORST_PREFIX");
		CLOSURES_WORST_SUFFIX = (String) Reflect.staticField(CC, "CLOSURES_WORST_SUFFIX");
		VARIABLES_CSV = (String) Reflect.staticField(CC, "VARIABLES_CSV");
		ASSUMPTIONS_CSV = (String) Reflect.staticField(CC, "ASSUMPTIONS_CSV");
	}

	/**
	 * Mirror of ContextCreator.build() L343–L426: the scenarioCode chain and the
	 * shelterPolicyVariant rewrite. Only the code&rarr;constant MAPPING is
	 * mirrored; every file name is read out of the certified class, so a renamed
	 * data file cannot silently diverge.
	 */
	private static void resolveScenario(Config c) throws Exception {
		String csv;
		String name;
		switch (c.scenarioCode) {
			case 1: csv = SHELTERS_B_CSV; name = nameConst("SCENARIO_B_NAME"); break;
			case 2: csv = SHELTERS_C_CSV; name = nameConst("SCENARIO_C_NAME"); break;
			case 3: csv = SHELTERS_CSV_2020; name = nameConst("HISTORICAL_REFERENCE_NAME"); break;
			case 7: csv = SHELTERS_B_CSV; name = nameConst("SCENARIO_D_NAME"); break;
			case 18: csv = SHELTERS_A_CSV; name = nameConst("SCENARIO_E18_NAME"); break;
			case 19: csv = SHELTERS_C_CSV; name = nameConst("SCENARIO_E19_NAME"); break;
			case 20: csv = SHELTERS_B_CSV; name = nameConst("SCENARIO_E20_NAME"); break;
			default: csv = SHELTERS_A_CSV; name = nameConst("SCENARIO_A_NAME"); break;
		}
		if (c.shelterPolicyVariant == 1) {
			String variant = csv.substring(0, csv.length() - 4) + "_elayer.csv";
			if (!new File(variant).exists()) {
				throw new IllegalStateException("shelterPolicyVariant=1 but " + variant + " does not exist");
			}
			csv = variant;
		}
		c.sheltersCsv = csv;
		c.scenarioName = name;
	}

	private static String nameConst(String field) throws Exception {
		return (String) Reflect.staticField(CC, field);
	}

	private static String smokeCsvFor(int code) {
		return code == 2 ? SMOKE_SEVERE_V2_CSV : code == 1 ? SMOKE_SEVERE_CSV : SMOKE_CSV;
	}

	private static String closuresCsvFor(int code, int draw) {
		if (code == 0) {
			return null;
		}
		return code == 3 ? CLOSURES_WORST_PREFIX + draw + CLOSURES_WORST_SUFFIX
				: code == 2 ? CLOSURES_EXTREME_CSV : CLOSURES_BASE_CSV;
	}

	// ------------------------------------------- Repast default RNG stream

	/**
	 * The Repast default stream (colt MersenneTwister behind {@code RandomHelper}) —
	 * the ONLY build-time default-stream draw is one
	 * {@code nextIntFromTo(0, nCamps-1)} per resident, in creation order.
	 */
	private interface DefaultStream {
		int nextIntFromTo(int from, int to);
	}

	private static DefaultStream repastStream(int seed) {
		try {
			Class<?> rh = Class.forName("repast.simphony.random.RandomHelper");
			final Method init = rh.getMethod("init");
			final Method setSeed = rh.getMethod("setSeed", int.class);
			final Method nift = rh.getMethod("nextIntFromTo", int.class, int.class);
			init.invoke(null);
			setSeed.invoke(null, Integer.valueOf(seed));
			return new DefaultStream() {
				public int nextIntFromTo(int from, int to) {
					try {
						return ((Integer) nift.invoke(null, Integer.valueOf(from), Integer.valueOf(to)))
								.intValue();
					} catch (Exception e) {
						throw new RuntimeException(e);
					}
				}
			};
		} catch (Throwable t) {
			return null;
		}
	}

	private static DefaultStream coltStream(int seed) {
		final cern.jet.random.Uniform u =
				new cern.jet.random.Uniform(new cern.jet.random.engine.MersenneTwister(seed));
		return new DefaultStream() {
			public int nextIntFromTo(int from, int to) {
				return u.nextIntFromTo(from, to);
			}
		};
	}

	// ------------------------------------------------------------- helpers

	private static final class Digest {
		private final MessageDigest md;

		Digest() {
			try {
				md = MessageDigest.getInstance("SHA-256");
			} catch (Exception e) {
				throw new IllegalStateException(e);
			}
		}

		void add(String s) {
			md.update((s + "\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
		}

		String hex() {
			return Io.sha256Hex(md.digest());
		}
	}

	private static double tickForDate(String iso, double fallback, int dayOffset) {
		try {
			return ((Double) M_TICK_FOR_DATE.invoke(null, iso, Double.valueOf(TICKS_PER_HOUR),
					Double.valueOf(fallback), Integer.valueOf(dayOffset))).doubleValue();
		} catch (Exception e) {
			throw new RuntimeException("certified tickForDate failed for '" + iso + "'", e);
		}
	}

	// ---------------------------------------------------------------- main

	public static void main(String[] args) throws Exception {
		File outRoot = new File(args.length > 0 ? args[0] : "world-fixtures");
		File fixtureRoot = new File(args.length > 1 ? args[1] : "fixtures");
		boolean skipTrees = "true".equals(System.getProperty("websim.f1.skipTrees"));

		File fxWorld = new File(fixtureRoot, "world");
		File fxFormat = new File(fixtureRoot, "format");
		Io.Manifest man = new Io.Manifest(outRoot);

		loadCertifiedConstants();

		// ---- (0) governance registry: certified fail-fast, zero RNG ---------
		try {
			Class<?> sr = Class.forName("geography.science.ScienceRegistry");
			Object reg = sr.getMethod("load", String.class, String.class)
					.invoke(null, VARIABLES_CSV, ASSUMPTIONS_CSV);
			String summary = (String) sr.getMethod("summaryLine").invoke(reg);
			man.check("registry.load", true, summary);
		} catch (Throwable t) {
			man.check("registry.load", false, String.valueOf(t.getCause() == null ? t : t.getCause()));
		}

		// ---- (1) the certified graph ----------------------------------------
		CertifiedGraph g = CertifiedGraph.build();
		g.assertProductionCensus(man);

		// ---- (2) camp snap table (WP5: all 3,400 camps) ----------------------
		List<Map<String, String>> campRows = CsvLoader.read(ENCAMPMENTS_CSV);
		List<Coordinate> campCoords = new ArrayList<Coordinate>();
		List<String> campIds = new ArrayList<String>();
		for (Map<String, String> r : campRows) {
			try {
				campCoords.add(new Coordinate(Double.parseDouble(r.get("lon")),
						Double.parseDouble(r.get("lat"))));
				campIds.add(r.get("inc_id"));
			} catch (Exception ignore) {
				/* mirror of ContextCreator L718-L723: malformed rows are silently skipped */
			}
		}
		final int nCamps = campCoords.size();
		long[] campNode = new long[nCamps];
		double[] campSnapGap = new double[nCamps];
		Io.Sink campSink = man.sink("snap.camps", "snap/camp-snap.tsv");
		campSink.line("# certified StreetNetwork.nearestNode + geodesicDistanceM for every parseable "
				+ "row of " + ENCAMPMENTS_CSV);
		campSink.line("# rows in CSV order after the mirror of ContextCreator L718-L723 "
				+ "(malformed rows silently skipped); " + campRows.size() + " read, " + nCamps + " kept");
		campSink.line("# camp_idx\tinc_id\tlon_hex\tlat_hex\tnode_id\tnode_lon_hex\tnode_lat_hex\tsnap_gap_m_hex");
		for (int i = 0; i < nCamps; i++) {
			Coordinate c = campCoords.get(i);
			long node = g.network.nearestNode(c);
			Coordinate nc = g.network.nodeCoordinate(node);
			campNode[i] = node;
			campSnapGap[i] = StreetNetwork.geodesicDistanceM(c, nc);
			campSink.line(i + "\t" + campIds.get(i) + "\t" + Io.hexD(c.x) + "\t" + Io.hexD(c.y)
					+ "\t" + node + "\t" + Io.hexD(nc.x) + "\t" + Io.hexD(nc.y)
					+ "\t" + Io.hexD(campSnapGap[i]));
		}
		campSink.close();
		man.check("camps.count", nCamps == 3400,
				nCamps + " parseable camps of " + campRows.size() + " rows (expected 3400)");

		// memoisation proof: nearestNode is pure, so re-snapping a sample must agree
		int resnapMismatch = 0;
		for (int i : Io.stride(nCamps, 500)) {
			if (g.network.nearestNode(campCoords.get(i)) != campNode[i]) {
				resnapMismatch++;
			}
		}
		man.check("camps.snapMemoisationIsPure", resnapMismatch == 0,
				resnapMismatch + " of 500 re-snaps disagreed (the per-resident loop reuses this table)");

		// ---- (3) smoke series (certified SmokeField, hourly array in hex) ----
		Map<Integer, SmokeField> smokeByCode = new LinkedHashMap<Integer, SmokeField>();
		for (int code : new int[] { 0, 1, 2 }) {
			String csv = smokeCsvFor(code);
			SmokeField sf = new SmokeField(csv, "Multnomah", SIM_START, 1.0);
			smokeByCode.put(Integer.valueOf(code), sf);
			Io.Sink s = man.sink("smoke.series" + code, "smoke/series-" + code + ".tsv");
			s.line("# certified SmokeField(" + csv + ", \"Multnomah\", " + SIM_START + ", 1.0)");
			s.line("# hours=" + sf.hours() + "\tpeak_hourly_hex=" + Io.hexD(sf.peakHourly())
					+ "\tpeak_hourly_p1=" + String.format(Locale.US, "%.1f", sf.peakHourly()));
			s.line("# hour_index\tugm3_hex  (NaN = data gap; the certified lookup returns 0.0 "
					+ "and increments outOfRangeLookups)");
			for (int h = 0; h < sf.hours(); h++) {
				s.line(h + "\t" + Io.hexD(sf.concentrationAtHour(h)));
			}
			s.close();
		}
		man.check("smoke.observedSlices", smokeByCode.get(Integer.valueOf(0)).hours() == 576,
				smokeByCode.get(Integer.valueOf(0)).hours() + " slices, peak "
						+ String.format(Locale.US, "%.1f", smokeByCode.get(Integer.valueOf(0)).peakHourly()));
		man.check("smoke.severeV1Slices", smokeByCode.get(Integer.valueOf(1)).hours() == 456,
				smokeByCode.get(Integer.valueOf(1)).hours() + " slices, peak "
						+ String.format(Locale.US, "%.2f", smokeByCode.get(Integer.valueOf(1)).peakHourly()));
		man.check("smoke.severeV2Slices", smokeByCode.get(Integer.valueOf(2)).hours() == 456,
				smokeByCode.get(Integer.valueOf(2)).hours() + " slices, peak "
						+ String.format(Locale.US, "%.1f", smokeByCode.get(Integer.valueOf(2)).peakHourly()));

		// ---- (4) configs: shelters, closures, per-seed world -----------------
		List<Config> cfgs = configs();
		Map<String, String> campDigest = new LinkedHashMap<String, String>();
		Map<String, String> demoDigest = new LinkedHashMap<String, String>();
		Map<String, String> eTraitDigest = new LinkedHashMap<String, String>();
		Map<String, String> eFullDigest = new LinkedHashMap<String, String>();
		StringBuilder configJson = new StringBuilder();
		configJson.append("  \"configs\": [\n");

		Io.Sink residentSample = man.sinkAt("world.residentSample",
				new File(fxWorld, "residents-sample.tsv"),
				"engine/test/fixtures/world/residents-sample.tsv");
		residentSample.line("# stride-sampled committed oracle rows from the git-ignored per-resident dumps");
		residentSample.line("# config\tseed\t" + residentHeader());

		for (int ci = 0; ci < cfgs.size(); ci++) {
			Config c = cfgs.get(ci);
			resolveScenario(c);
			SmokeField sf = smokeByCode.get(Integer.valueOf(c.smokeSeriesCode));
			int endHours = Math.min(c.simulationHours, sf.hours());
			double endTick = endHours * TICKS_PER_HOUR;

			dumpShelters(g, c, man);
			String closuresCsv = closuresCsvFor(c.closuresCode, c.closureDraw);
			int[] closureCensus = closuresCsv == null ? new int[] { 0, 0, 0 }
					: dumpClosures(g, c, closuresCsv, endHours, man);

			configJson.append("    {\"id\": \"").append(c.id)
					.append("\", \"scenarioCode\": ").append(c.scenarioCode)
					.append(", \"scenarioName\": \"").append(Io.esc(c.scenarioName))
					.append("\", \"sheltersCsv\": \"").append(c.sheltersCsv)
					.append("\", \"smokeCsv\": \"").append(smokeCsvFor(c.smokeSeriesCode))
					.append("\", \"closuresCsv\": ")
					.append(closuresCsv == null ? "null" : "\"" + closuresCsv + "\"")
					.append(", \"numAgents\": ").append(NUM_AGENTS)
					.append(", \"simulationHours\": ").append(c.simulationHours)
					.append(", \"smokeSlices\": ").append(sf.hours())
					.append(", \"endHours\": ").append(endHours)
					.append(", \"endTick\": ").append((long) endTick)
					.append(", \"triageReserveFraction\": ").append(c.triageReserveFraction)
					.append(", \"enableDecisionLayer\": ").append(c.enableDecisionLayer)
					.append(", \"shelterPolicyVariant\": ").append(c.shelterPolicyVariant)
					.append(", \"closureEdgesScheduled\": ").append(closureCensus[0])
					.append(", \"closureEdgesMatchingGraph\": ").append(closureCensus[1])
					.append(", \"closureWaves\": ").append(closureCensus[2])
					.append(", \"eFamily\": \"").append(c.eFamily).append("\"}");
			configJson.append(ci == cfgs.size() - 1 ? "\n" : ",\n");

			for (int seed : SEEDS) {
				dumpWorld(g, c, seed, campCoords, campIds, campNode, campSnapGap,
						man, residentSample, campDigest, demoDigest, eTraitDigest, eFullDigest);
			}
		}
		configJson.append("  ],\n");
		residentSample.close();

		// ---- (5) the three-streams rule, made executable ---------------------
		crossConfigInvariants(cfgs, man, campDigest, demoDigest, eTraitDigest, eFullDigest);

		// ---- (6) HALF_UP formatter oracle ------------------------------------
		HalfUpFormat.dump(man, fxFormat, "engine/test/fixtures/format/");

		// ---- (7) shelter shortest-path trees (WP5) ---------------------------
		if (skipTrees) {
			man.note("SHELTER TREES SKIPPED (-Dwebsim.f1.skipTrees=true) -- this manifest is INCOMPLETE");
			man.check("trees.dumped", false, "skipped by request");
		} else {
			Io.Sink treeSample = man.sinkAt("trees.sample",
					new File(fxWorld, "trees-sample.tsv"),
					"engine/test/fixtures/world/trees-sample.tsv");
			treeSample.line("# stride-sampled committed oracle rows from the git-ignored per-shelter trees");
			treeSample.line("# arm\tshelter_idx\tnode_id\tdist_m_hex\tpredecessor_directed_edge");
			String[][] arms = {
				{ "A", SHELTERS_A_CSV }, { "B", SHELTERS_B_CSV }, { "C", SHELTERS_C_CSV },
			};
			int totalTrees = 0;
			for (String[] arm : arms) {
				List<ShelterTrees.TreeSummary> ts =
						ShelterTrees.dumpArm(g, arm[0], arm[1], man, treeSample);
				totalTrees += ts.size();
			}
			treeSample.close();
			man.check("trees.dumped", totalTrees == 36 + 36 + 46,
					totalTrees + " shelter trees over arms A/B/C (expected 36+36+46=118)");
			// the _elayer variants carry the same sites, so their trees are the arm's trees
			for (String[] arm : arms) {
				checkElayerGeometry(arm[0], arm[1], man);
			}
		}

		// ---- manifest --------------------------------------------------------
		StringBuilder extra = new StringBuilder();
		extra.append("  \"task\": \"F1 -- shelter trees (a), world build (b), HALF_UP formatter (c)\",\n");
		extra.append("  \"seeds\": [42, 43, 44],\n");
		extra.append("  \"numAgents\": ").append(NUM_AGENTS).append(",\n");
		extra.append("  \"simStart\": \"").append(SIM_START).append("\",\n");
		extra.append(g.inputDigestsJson());
		extra.append("  \"graphCensus\": {\"nodes\": ").append(g.report.finalGraphNodes)
				.append(", \"undirectedEdges\": ").append(g.network.streetEdgeCount())
				.append(", \"components\": ").append(g.report.componentCount)
				.append(", \"largestComponent\": ").append(g.report.largestComponentSize)
				.append(", \"affectedAttrIds\": ").append(g.report.affectedAttrIds)
				.append(", \"reattached\": ").append(g.report.reattachedSites)
				.append(", \"splitSynthetic\": ").append(g.report.splitSites)
				.append(", \"impossibleEdgesAfterFix\": ").append(g.report.impossibleEdgesAfterFix)
				.append("},\n");
		extra.append(configJson);

		File manifestFile = new File(fxWorld, "manifest.json");
		man.write(manifestFile, extra.toString());
		System.out.println("[F1] manifest -> " + manifestFile.getPath());
		System.out.println("[F1] dumps    -> " + outRoot.getPath() + " (" + man.entries().size() + " files)");
		if (man.failures() > 0) {
			System.out.println("[F1] " + man.failures() + " SELF-CHECK FAILURE(S) -- fixtures are NOT trustworthy");
			System.exit(2);
		}
		System.out.println("[F1] all self-checks green");
	}

	// -------------------------------------------------------- shelter table

	private static void dumpShelters(CertifiedGraph g, Config c, Io.Manifest man) throws IOException {
		List<Map<String, String>> rows = CsvLoader.read(c.sheltersCsv);
		Io.Sink s = man.sink("shelters." + c.id, "shelters/" + c.id + ".tsv");
		s.line("# mirror of ContextCreator.build() L546-L591 for config " + c.id
				+ " (scenarioCode=" + c.scenarioCode + ", " + c.sheltersCsv + ")");
		s.line("# respectShelterOpeningDates=" + c.respectShelterOpeningDates
				+ "\ttriageReserveFraction=" + c.triageReserveFraction
				+ "\tticksPerHour=" + (long) TICKS_PER_HOUR
				+ "\tshelterPolicyVariant=" + c.shelterPolicyVariant);
		s.line("# idx\tshelter_id\tname\tcapacity\toperating\tlon_hex\tlat_hex\topen_tick_hex"
				+ "\tclose_tick_hex\treserved_for_priority\tpet_intake\tadults_only"
				+ "\tgraph_node\tnode_lon_hex\tnode_lat_hex\tsnap_gap_m_hex\treachable_nodes");

		int operating = 0;
		int capSum = 0;
		int reserveSum = 0;
		for (int i = 0; i < rows.size(); i++) {
			Map<String, String> r = rows.get(i);
			String capStr = r.get("capacity");
			Integer capacity = (capStr == null || capStr.isEmpty()) ? null : Integer.valueOf(capStr);
			boolean isOperating = "operating".equalsIgnoreCase(r.get("status"));
			double lon = Double.parseDouble(r.get("lon"));
			double lat = Double.parseDouble(r.get("lat"));
			// certified Shelter owns the reserve clamp and the open-window fields
			Shelter shelter = new Shelter(r.get("shelter_id"), r.get("name"), capacity,
					isOperating, lon, lat);
			if (c.respectShelterOpeningDates == 1) {
				shelter.setOpenWindowTicks(
						tickForDate(r.get("opened"), Double.NEGATIVE_INFINITY, 0),
						tickForDate(r.get("closed"), Double.POSITIVE_INFINITY, 1));
			}
			if (capacity != null && c.triageReserveFraction > 0.0) {
				shelter.setReservedForPriority(
						(int) Math.floor(capacity.intValue() * c.triageReserveFraction));
			}
			String petCol = r.get("pet_intake");
			if (petCol != null && !petCol.trim().isEmpty()) {
				shelter.setPetIntake(Boolean.valueOf("admit".equalsIgnoreCase(petCol.trim())));
			}
			String adultsCol = r.get("adults_only");
			if (adultsCol != null && !adultsCol.trim().isEmpty()) {
				String v = adultsCol.trim();
				shelter.setAdultsOnly("1".equals(v) || "true".equalsIgnoreCase(v)
						|| "yes".equalsIgnoreCase(v));
			}
			Coordinate co = new Coordinate(lon, lat);
			long node = g.network.nearestNode(co);
			shelter.setGraphNodeId(node);
			Coordinate nc = g.network.nodeCoordinate(node);
			double snapGap = StreetNetwork.geodesicDistanceM(co, nc);
			StreetNetwork.ShortestPathTree tree = g.network.computeTree(node);

			s.line(i + "\t" + shelter.getId() + "\t" + safe(shelter.getName()) + "\t"
					+ (shelter.getCapacity() == null ? "" : shelter.getCapacity().toString()) + "\t"
					+ (shelter.isOperating() ? 1 : 0) + "\t"
					+ Io.hexD(shelter.getLon()) + "\t" + Io.hexD(shelter.getLat()) + "\t"
					+ Io.hexD(shelter.getOpenTick()) + "\t" + Io.hexD(shelter.getCloseTick()) + "\t"
					+ shelter.getReservedForPriority() + "\t"
					+ (shelter.getPetIntake() == null ? "unrecorded"
							: (shelter.getPetIntake().booleanValue() ? "admit" : "refuse")) + "\t"
					+ (shelter.isAdultsOnly() ? 1 : 0) + "\t"
					+ node + "\t" + Io.hexD(nc.x) + "\t" + Io.hexD(nc.y) + "\t"
					+ Io.hexD(snapGap) + "\t" + tree.reachableNodeCount());
			if (isOperating) {
				operating++;
				if (capacity != null) {
					capSum += capacity.intValue();
					reserveSum += shelter.getReservedForPriority();
				}
			}
		}
		s.close();
		man.check("shelters." + c.id + ".census", true,
				rows.size() + " sites, " + operating + " operating, operating capacity " + capSum
						+ ", reserved " + reserveSum);
	}

	private static String safe(String s) {
		return s == null ? "" : s.replace('\t', ' ').replace('\n', ' ');
	}

	/**
	 * The {@code _elayer} shelter files add only the recorded {@code pet_intake}
	 * column, so ER/SE arms reuse the base arm's trees. Verified, not assumed.
	 */
	private static void checkElayerGeometry(String arm, String baseCsv, Io.Manifest man) {
		String variant = baseCsv.substring(0, baseCsv.length() - 4) + "_elayer.csv";
		if (!new File(variant).exists()) {
			man.check("trees." + arm + ".elayerSameSites", false, variant + " missing");
			return;
		}
		List<Map<String, String>> a = CsvLoader.read(baseCsv);
		List<Map<String, String>> b = CsvLoader.read(variant);
		String[] cols = { "shelter_id", "lon", "lat", "capacity", "status", "opened", "closed" };
		boolean same = a.size() == b.size();
		int diffs = 0;
		for (int i = 0; same && i < a.size(); i++) {
			for (String col : cols) {
				String x = a.get(i).get(col);
				String y = b.get(i).get(col);
				if (x == null ? y != null : !x.equals(y)) {
					diffs++;
				}
			}
		}
		man.check("trees." + arm + ".elayerSameSites", same && diffs == 0,
				same ? (diffs + " differing site fields vs " + variant
						+ " -- ER/SE arms reuse arm " + arm + "'s trees")
						: ("row count " + a.size() + " vs " + b.size()));
	}

	// -------------------------------------------------------- closures dump

	/** @return {scheduledEdges, edgesMatchingGraph, waveCount} */
	private static int[] dumpClosures(CertifiedGraph g, Config c, String closuresCsv,
			int endHours, Io.Manifest man) throws IOException {
		TreeMap<Integer, List<long[]>> waves = new TreeMap<Integer, List<long[]>>();
		int scheduled = 0;
		int matching = 0;
		int inert = 0;
		int rowNo = 1;
		for (Map<String, String> r : CsvLoader.read(closuresCsv)) {
			rowNo++;
			long a;
			long b;
			int hour;
			try {
				a = Long.parseLong(r.get("node_a").trim());
				b = Long.parseLong(r.get("node_b").trim());
				hour = Integer.parseInt(r.get("activation_hour").trim());
			} catch (RuntimeException bad) {
				throw new IllegalStateException(closuresCsv + " row " + rowNo + " is malformed", bad);
			}
			if (hour < 0) {
				throw new IllegalStateException(closuresCsv + " row " + rowNo
						+ ": negative activation_hour " + hour);
			}
			if (hour >= endHours) {
				inert++;
			}
			List<long[]> wave = waves.get(Integer.valueOf(hour));
			if (wave == null) {
				wave = new ArrayList<long[]>();
				waves.put(Integer.valueOf(hour), wave);
			}
			wave.add(new long[] { a, b });
			scheduled++;
			if (g.network.hasEdge(a, b)) {
				matching++;
			}
		}
		String key = "c" + c.closuresCode + (c.closuresCode == 3 ? "-d" + c.closureDraw : "");
		Io.Sink s = man.sink("closures." + key, "closures/schedule-" + key + ".tsv");
		s.line("# mirror of ContextCreator.build() L639-L707 for " + closuresCsv);
		s.line("# scheduled_edges=" + scheduled + "\tmatching_graph_edges=" + matching
				+ "\twaves=" + waves.size() + "\tinert_rows_at_or_after_end=" + inert
				+ "\tend_hours=" + endHours);
		s.line("# wave_hour\twave_tick\tedge_index_in_wave\tnode_a\tnode_b\tmatches_graph_edge");
		for (Map.Entry<Integer, List<long[]>> w : waves.entrySet()) {
			int hour = w.getKey().intValue();
			long tick = (long) (hour * TICKS_PER_HOUR);
			List<long[]> es = w.getValue();
			for (int i = 0; i < es.size(); i++) {
				long[] e = es.get(i);
				s.line(hour + "\t" + tick + "\t" + i + "\t" + e[0] + "\t" + e[1]
						+ "\t" + (g.network.hasEdge(e[0], e[1]) ? 1 : 0));
			}
		}
		s.close();
		man.check("closures." + key + ".census", matching == scheduled,
				scheduled + " scheduled, " + matching + " match a graph edge, " + waves.size()
						+ " wave(s), " + inert + " inert at " + endHours + " h");
		return new int[] { scheduled, matching, waves.size() };
	}

	// ----------------------------------------------------------- world dump

	private static String residentHeader() {
		return "i\tcamp_idx\tinc_id\tcamp_lon_hex\tcamp_lat_hex\tstart_node\tsnap_gap_m_hex"
				+ "\tage_band\tage_years\tsex\tmobility_limited\tmobility_category"
				+ "\tasthma\tcopd\tchronic_physical\twalking_speed_mps_hex"
				+ "\taware_initial\theavy_belongings\thas_pet\thas_dependents"
				+ "\ttheta_z_hex\tgroup_speed_delta_mps_hex\tdecision_seed";
	}

	private static void dumpWorld(CertifiedGraph g, Config c, int seed,
			List<Coordinate> campCoords, List<String> campIds, long[] campNode, double[] campSnapGap,
			Io.Manifest man, Io.Sink sample,
			Map<String, String> campDigest, Map<String, String> demoDigest,
			Map<String, String> eTraitDigest, Map<String, String> eFullDigest) throws IOException {

		final int nCamps = campCoords.size();

		// --- Repast default stream: the ONE build-time draw per resident ------
		DefaultStream ds = repastStream(seed);
		String streamProvenance;
		int[] campIdx = new int[NUM_AGENTS];
		if (ds != null) {
			streamProvenance = "repast.simphony.random.RandomHelper.setSeed(" + seed + ")";
			for (int i = 0; i < NUM_AGENTS; i++) {
				campIdx[i] = ds.nextIntFromTo(0, nCamps - 1);
			}
			// cross-check against the raw colt path over the production range
			DefaultStream ref = coltStream(seed);
			int mism = 0;
			for (int i = 0; i < NUM_AGENTS; i++) {
				if (ref.nextIntFromTo(0, nCamps - 1) != campIdx[i]) {
					mism++;
				}
			}
			man.check("rng.defaultStream.seed" + seed, mism == 0,
					"RandomHelper == new Uniform(new MersenneTwister(" + seed + ")) over "
							+ NUM_AGENTS + " nextIntFromTo(0," + (nCamps - 1) + ") draws");
		} else {
			streamProvenance = "cern Uniform(MersenneTwister(" + seed + ")) -- RandomHelper unavailable";
			DefaultStream ref = coltStream(seed);
			for (int i = 0; i < NUM_AGENTS; i++) {
				campIdx[i] = ref.nextIntFromTo(0, nCamps - 1);
			}
			man.check("rng.defaultStream.seed" + seed, false,
					"Repast RandomHelper not on the classpath; fell back to raw colt");
		}

		// --- certified samplers ------------------------------------------------
		PopulationSampler sampler = c.enableHeterogeneity == 1 ? new PopulationSampler(seed) : null;
		PopulationSampler.Attributes[] attrs = new PopulationSampler.Attributes[NUM_AGENTS];
		for (int i = 0; i < NUM_AGENTS; i++) {
			if (sampler != null) {
				attrs[i] = sampler.sample();
			}
		}
		ELayerSampler eSampler = null;
		ELayerSampler.DecisionAttributes[] das = new ELayerSampler.DecisionAttributes[NUM_AGENTS];
		if (c.enableDecisionLayer == 1) {
			eSampler = new ELayerSampler(seed, c.pAwareInit, c.pHeavyBelongings,
					c.pHasPet, c.pHasDependents, c.groupSpeedDeltaMps);
			for (int i = 0; i < NUM_AGENTS; i++) {
				das[i] = eSampler.sample();
			}
		}

		String key = c.id + "-seed" + seed;
		Io.Sink s = man.sink("world." + key, "world/" + key + ".tsv");
		s.line("# mirror of ContextCreator.build() L710-L790 for config " + c.id + " at seed " + seed);
		s.line("# defaultStream=" + streamProvenance + "\tcamps=" + nCamps
				+ "\tnumAgents=" + NUM_AGENTS
				+ "\tpopulationSamplerSeed=" + (seed * 1000003L + 17L)
				+ "\teLayerSamplerSeed=" + (seed * 1000003L + 7919L));
		s.line("# enableHeterogeneity=" + c.enableHeterogeneity
				+ "\tenableDecisionLayer=" + c.enableDecisionLayer
				+ "\tpAwareInit=" + c.pAwareInit + "\tpHeavyBelongings=" + c.pHeavyBelongings
				+ "\tpHasPet=" + c.pHasPet + "\tpHasDependents=" + c.pHasDependents
				+ "\tgroupSpeedDeltaMps=" + c.groupSpeedDeltaMps);
		s.line("# " + residentHeader());

		Digest dCamp = new Digest();
		Digest dDemo = new Digest();
		Digest dETrait = new Digest();
		Digest dEFull = new Digest();
		int[] pick = Io.stride(NUM_AGENTS, 32);
		int pi = 0;

		for (int i = 0; i < NUM_AGENTS; i++) {
			int idx = campIdx[i];
			Coordinate coord = campCoords.get(idx);
			long node = campNode[idx];
			double gap = campSnapGap[idx];
			PopulationSampler.Attributes a = attrs[i];
			ELayerSampler.DecisionAttributes da = das[i];

			String campPart = i + "\t" + idx + "\t" + campIds.get(idx) + "\t"
					+ Io.hexD(coord.x) + "\t" + Io.hexD(coord.y) + "\t" + node + "\t" + Io.hexD(gap);
			// 9 demographic columns => 8 separators when heterogeneity is off
			String demoPart = a == null ? "\t\t\t\t\t\t\t\t"
					: (a.ageBand.label + "\t" + a.ageYears + "\t" + a.sex + "\t"
							+ (a.mobilityLimited ? 1 : 0) + "\t" + a.mobilityCategory.label + "\t"
							+ (a.asthma ? 1 : 0) + "\t" + (a.copd ? 1 : 0) + "\t"
							+ (a.chronicPhysical ? 1 : 0) + "\t" + Io.hexD(a.walkingSpeedMps));
			String ePart = da == null ? "\t\t\t\t\t\t"
					: ((da.awareInitial ? 1 : 0) + "\t" + (da.heavyBelongings ? 1 : 0) + "\t"
							+ (da.hasPet ? 1 : 0) + "\t" + (da.hasDependents ? 1 : 0) + "\t"
							+ Io.hexD(da.thetaZ) + "\t" + Io.hexD(da.groupSpeedDeltaMps) + "\t"
							+ da.decisionSeed);

			String line = campPart + "\t" + demoPart + "\t" + ePart;
			s.line(line);
			dCamp.add(campPart);
			dDemo.add(i + "\t" + demoPart);
			if (da != null) {
				dETrait.add(i + "\t" + (da.heavyBelongings ? 1 : 0) + "\t" + (da.hasPet ? 1 : 0)
						+ "\t" + (da.hasDependents ? 1 : 0) + "\t" + Io.hexD(da.thetaZ));
				dEFull.add(i + "\t" + ePart);
			}
			if (pi < pick.length && pick[pi] == i) {
				sample.line(c.id + "\t" + seed + "\t" + line);
				pi++;
			}
		}
		s.close();

		campDigest.put(key, dCamp.hex());
		demoDigest.put(key, dDemo.hex());
		if (eSampler != null) {
			eTraitDigest.put(key, dETrait.hex());
			eFullDigest.put(key, dEFull.hex());
		}

		// realised marginals -- the Tier-3 anchor, rendered exactly as
		// ContextCreator prints them (%.3f), so the seed-42 published values
		// are checkable against this dump without re-deriving anything.
		if (sampler != null) {
			String[] got = {
				String.format(Locale.US, "%.4f", sampler.getMobilityLimitedShare()),
				String.format(Locale.US, "%.4f", sampler.getAsthmaShare()),
				String.format(Locale.US, "%.4f", sampler.getCopdShare()),
				String.format(Locale.US, "%.4f", sampler.getAnyRespiratoryShare()),
				String.format(Locale.US, "%.4f", sampler.getAge55PlusShare()),
				String.format(Locale.US, "%.4f", sampler.getMeanWalkingSpeedMps()),
			};
			StringBuilder sb = new StringBuilder();
			for (int k = 0; k < got.length; k++) {
				sb.append(k == 0 ? "" : " ").append(got[k]);
			}
			String[] want = ARCHIVED_MARGINALS_N6842.get(Integer.valueOf(seed));
			boolean ok = want != null;
			if (want != null) {
				for (int k = 0; k < got.length; k++) {
					ok &= got[k].equals(want[k]);
				}
			}
			StringBuilder wantS = new StringBuilder();
			if (want != null) {
				for (int k = 0; k < want.length; k++) {
					wantS.append(k == 0 ? "" : " ").append(want[k]);
				}
			}
			man.check("marginals." + key, ok,
					"mobility/asthma/copd/anyResp/55+/meanSpeed = " + sb
							+ (want == null ? " (no archived reference for this seed)"
									: " == archived " + wantS));
		}
		if (eSampler != null) {
			man.check("eMarginals." + key, true, String.format(Locale.US,
					"aware %.3f | belongings %.3f | pet %.3f | dependents %.4f | "
							+ "anyBarrier %.3f | compoundBarrier %.4f",
					eSampler.getAwareShare(), eSampler.getHeavyBelongingsShare(),
					eSampler.getPetShare(), eSampler.getDependentsShare(),
					eSampler.getAnyBarrierShare(), eSampler.getCompoundBarrierShare()));
		}
	}

	// ------------------------------------------- the three-streams rule

	/**
	 * The RNG-discipline claims in PORT_MAP §1.8 turned into executable checks
	 * over the dumps themselves:
	 * <ul>
	 *   <li>camp placement is scenario-independent and heterogeneity-independent
	 *       — the ONLY default-stream build draw;</li>
	 *   <li>the sampled demographic population is identical across every config
	 *       at a seed (PopulationSampler is on its own stream);</li>
	 *   <li>belongings / pet / dependents / theta are identical across every
	 *       decision-layer config at a seed — "sweeping any E parameter never
	 *       reshuffles who owns a pet" — even though {@code pAwareInit} differs
	 *       between E0 (1.0) and ER/SE (0.356);</li>
	 *   <li>within one E-parameter family the whole E block, decision seed
	 *       included, is identical across arms.</li>
	 * </ul>
	 */
	private static void crossConfigInvariants(List<Config> cfgs, Io.Manifest man,
			Map<String, String> campDigest, Map<String, String> demoDigest,
			Map<String, String> eTraitDigest, Map<String, String> eFullDigest) {
		for (int seed : SEEDS) {
			checkAllEqual(man, "invariant.campVector.seed" + seed, campDigest, cfgs, seed, null,
					"camp assignment vector identical across all configs (only default-stream build draw)");
			checkAllEqual(man, "invariant.demographics.seed" + seed, demoDigest, cfgs, seed, null,
					"sampled demographics identical across all configs (PopulationSampler own stream)");
			checkAllEqual(man, "invariant.eTraits.seed" + seed, eTraitDigest, cfgs, seed, null,
					"belongings/pet/dependents/thetaZ identical across ALL decision-layer configs "
							+ "despite pAwareInit 1.0 vs 0.356");
			checkAllEqual(man, "invariant.eBlock.E0.seed" + seed, eFullDigest, cfgs, seed, "E0",
					"full E block identical across the E0-null arms");
			checkAllEqual(man, "invariant.eBlock.EREAL.seed" + seed, eFullDigest, cfgs, seed, "EREAL",
					"full E block identical across the ER/SE arms");
		}
		// the two families must DIFFER (otherwise the check above is vacuous)
		String e0 = eFullDigest.get("E0-A-seed42");
		String er = eFullDigest.get("ER-A-seed42");
		man.check("invariant.eBlockFamiliesDiffer", e0 != null && er != null && !e0.equals(er),
				"E0 vs ER full-E-block digests differ at seed 42 (pAwareInit is the only cause)");
		String t0 = eTraitDigest.get("E0-A-seed42");
		String tr = eTraitDigest.get("ER-A-seed42");
		man.check("invariant.eTraitsSurviveAwarenessSweep", t0 != null && t0.equals(tr),
				"...while the trait sub-block is byte-identical -- the population is not reshuffled");
	}

	private static void checkAllEqual(Io.Manifest man, String id, Map<String, String> digests,
			List<Config> cfgs, int seed, String family, String claim) {
		String ref = null;
		String refKey = null;
		int n = 0;
		List<String> bad = new ArrayList<String>();
		for (Config c : cfgs) {
			if (family != null && !family.equals(c.eFamily)) {
				continue;
			}
			String k = c.id + "-seed" + seed;
			String d = digests.get(k);
			if (d == null) {
				continue;
			}
			n++;
			if (ref == null) {
				ref = d;
				refKey = k;
			} else if (!ref.equals(d)) {
				bad.add(k);
			}
		}
		if (n == 0) {
			man.check(id, false, "no dumps matched (family=" + family + ")");
			return;
		}
		man.check(id, bad.isEmpty(), n + " configs vs " + refKey + " (" + ref.substring(0, 12) + "...): "
				+ (bad.isEmpty() ? claim : "MISMATCH at " + bad));
	}
}
