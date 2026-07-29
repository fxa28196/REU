package geography.agents;

import java.io.File;
import java.net.MalformedURLException;
import java.net.URL;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.geotools.data.shapefile.ShapefileDataStore;
import org.geotools.data.simple.SimpleFeatureIterator;
import org.opengis.feature.simple.SimpleFeature;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.geom.MultiLineString;

import geography.data.CsvLoader;
import geography.env.SmokeField;
import geography.output.OutcomeLogger;
import geography.routing.StreetNetwork;
import geography.science.ScienceRegistry;

import repast.simphony.context.Context;
import repast.simphony.context.space.gis.GeographyFactoryFinder;
import repast.simphony.context.space.graph.NetworkBuilder;
import repast.simphony.dataLoader.ContextBuilder;
import repast.simphony.engine.environment.RunEnvironment;
import repast.simphony.engine.schedule.ISchedule;
import repast.simphony.engine.schedule.ScheduleParameters;
import repast.simphony.parameter.Parameters;
import repast.simphony.random.RandomHelper;
import repast.simphony.space.gis.Geography;
import repast.simphony.space.gis.GeographyParameters;

/**
 * Builds the simulation context (NSF REU wildfire-smoke shelter model).
 *
 * <p>Data-driven initialisation (all provenance in Geography/data/README.md and
 * docs/science/DATA_SOURCES.md):
 * <ol>
 *   <li>WGS84 "Geography" projection + routable {@link StreetNetwork} from the
 *       real City-of-Portland RLIS street centerlines (D0).</li>
 *   <li>{@link SmokeField} — hourly PM2.5 from EPA AQS (D3).</li>
 *   <li>Real September-2020 {@link Shelter}s from
 *       {@code data/shelters/shelters_2020-09.csv} (D1), snapped to graph nodes
 *       with a Dijkstra tree each.</li>
 *   <li>{@link GisAgent} residents placed at real Portland encampment locations
 *       sampled from the City IRP Campsite Reports (D2b) — see the temporal
 *       caveat warning below.</li>
 * </ol>
 *
 * Derived from the Repast Simphony stock "Geography" GIS demo (@author Eric
 * Tatara); demo logic removed 2026-07-24 — see git history.
 */
public class ContextCreator implements ContextBuilder {

	private static final String VARIABLES_CSV   = "data/registry/variables.csv";
	private static final String ASSUMPTIONS_CSV = "data/registry/assumptions.csv";

	private static final String STREETS_SHP  = "data/Streets.shp";

	/** RLIS TYPE codes excluded from the pedestrian routing graph (U-27,
	 *  registry V26): 1110 freeway mainline, 1120–1123 freeway ramps and
	 *  connectors. Pedestrians are prohibited on limited-access freeways —
	 *  the Marquam (I-5) and Fremont (I-405) bridges carry no pedestrian
	 *  access — so these features must not supply walking shortcuts.
	 *  TYPE 1200-series highways are RETAINED (many carry sidewalks);
	 *  removing them without a per-segment source would be an invention.
	 *  Every exclusion is counted into
	 *  {@code simulation.json street_network_validation.freeway_filter}. */
	private static final java.util.Set<Integer> NON_PEDESTRIAN_TYPES =
			new java.util.HashSet<Integer>(java.util.Arrays.asList(1110, 1120, 1121, 1122, 1123));
	private static final String SMOKE_CSV     = "data/airnow/aqs_hourly_pm25_portland_2020-09.csv";
	private static final String SHELTERS_CSV  = "data/shelters/shelters_2020-09.csv";
	private static final String ENCAMPMENTS_CSV = "data/encampments/irp_campsite_reports_sample.csv";

	// ---- THE PLACEMENT EXPERIMENT (the study's only two scenarios) -----------
	// Research question: does shelter PLACEMENT change outcomes?
	// To isolate placement, both arms hold system capacity equal to the
	// population (2 sites summing to 2,037 spaces) so that total capacity is NOT
	// the binding constraint. Individual sites still have finite capacity, so
	// shelters fill in sequence, residents are refused at a full door and
	// re-route. Everything except the two coordinate pairs is identical between
	// arms: population, demographics, health attributes, PM2.5, opening dates,
	// street network, total capacity and the 1:1 capacity split.

	/** Arm A — REALITY. Every clean-air-capable facility the county actually
	 *  operates today, at its real address and real capacity. A is a measurement,
	 *  not a treatment: it establishes WHICH constraint actually binds. */
	private static final String SCENARIO_A_NAME = "A_present_day_reality";
	private static final String SHELTERS_A_CSV = "data/shelters/shelters_2026_current_placement.csv";

	/** Arm B — the response to what A measured. A leaves most residents outdoors
	 *  because there are not enough spaces, so B relieves exactly that constraint:
	 *  capacity is raised to meet demand AT THE REAL LOCATIONS. Placement is held
	 *  identical to A, so any A->B difference is attributable to capacity alone. */
	private static final String SCENARIO_B_NAME = "B_capacity_meets_demand_real_locations";
	private static final String SHELTERS_B_CSV = "data/shelters/shelters_2026_expanded_capacity.csv";

	/** Arm C — a BUILDABLE version of B. Every real facility stays exactly where
	 *  it is and grows only 1.5x instead of B's 3.06x; the capacity B would have
	 *  poured into those same sites instead funds NEW facilities at street-network
	 *  optimal locations. TOTAL capacity is held equal to B (6,842), so a B->C
	 *  difference isolates WHERE the marginal capacity sits — nothing else.
	 *  Built by scripts/build_scenario_c_2026.py. The new sites are street-network
	 *  nodes: THEORETICAL locations, not verified venues with filtered indoor air.
	 *  Existing facilities are never moved, because a real shelter system cannot
	 *  be picked up and set down somewhere else. */
	private static final String SCENARIO_C_NAME = "C_existing_expanded_plus_new_optimized_sites";
	private static final String SHELTERS_C_CSV = "data/shelters/shelters_2026_expanded_plus_new_sites.csv";

	/** Arm C-random — the CONTROL for arm C. C's ten new sites were placed by
	 *  p-median against the same encampment demand points the run is then scored
	 *  on, so "C beats B" could be partly definitional. C-random is arm C with the
	 *  optimiser switched off and nothing else changed: same 36 real facilities at
	 *  real coordinates expanded 1.5x, same ten new sites, the SAME per-site
	 *  capacity vector copied facility-for-facility from C's own file, same total
	 *  6,842 — but the ten new coordinates are drawn UNIFORMLY AT RANDOM from
	 *  street-graph nodes inside the demand bounding box. A C-random -> C gap is
	 *  attributable to OPTIMISATION; a B -> C-random gap is attributable to mere
	 *  DISPERSION of the same capacity across ten extra doors.
	 *  Three independent draws (site-seeds 1/2/3, python random.Random) exist so a
	 *  single lucky or unlucky set cannot be mistaken for a result; they are three
	 *  separate scenario codes rather than a new parameter, so no batch-params
	 *  schema changes and every archived params file still runs unchanged.
	 *  Built by scripts/build_scenario_crandom_2026.py. Like C's, these are
	 *  street-network nodes: THEORETICAL locations, not verified venues. */
	private static final String SCENARIO_CR1_NAME = "CRANDOM_r1_existing_expanded_plus_ten_RANDOM_sites";
	private static final String SHELTERS_CR1_CSV = "data/shelters/shelters_2026_random_sites_r1.csv";
	private static final String SCENARIO_CR2_NAME = "CRANDOM_r2_existing_expanded_plus_ten_RANDOM_sites";
	private static final String SHELTERS_CR2_CSV = "data/shelters/shelters_2026_random_sites_r2.csv";
	private static final String SCENARIO_CR3_NAME = "CRANDOM_r3_existing_expanded_plus_ten_RANDOM_sites";
	private static final String SHELTERS_CR3_CSV = "data/shelters/shelters_2026_random_sites_r3.csv";

	/** Arm C-random-POOL — the MATCHED control, and the one that actually isolates
	 *  the optimiser. C-random (r1–r3) draws from the whole demand bounding box,
	 *  which is several times the area of the demand footprint, so it differs from
	 *  arm C in two ways at once: where it looks AND how it chooses. These three
	 *  draws hold the search space identical — the sites are picked at random from
	 *  EXACTLY the 498-node candidate set arm C's p-median searched (verified: all
	 *  ten sites arm C chose are members of it) — so only the SELECTION RULE
	 *  differs. A C-random-pool -> C gap is the optimiser's contribution, full stop.
	 *  Site-seeds 4/5/6, deliberately distinct from the bounding-box arm's 1/2/3 so
	 *  the two control families can never be confused.
	 *  Built by scripts/build_scenario_crandom_pool_2026.py. */
	private static final String SCENARIO_CP4_NAME = "CRANDOMPOOL_r4_random_from_arm_C_candidate_set";
	private static final String SHELTERS_CP4_CSV = "data/shelters/shelters_2026_random_sites_r4.csv";
	private static final String SCENARIO_CP5_NAME = "CRANDOMPOOL_r5_random_from_arm_C_candidate_set";
	private static final String SHELTERS_CP5_CSV = "data/shelters/shelters_2026_random_sites_r5.csv";
	private static final String SCENARIO_CP6_NAME = "CRANDOMPOOL_r6_random_from_arm_C_candidate_set";
	private static final String SHELTERS_CP6_CSV = "data/shelters/shelters_2026_random_sites_r6.csv";

	/** NOT a scenario — the historical-capacity reference run (2 x 99 real beds)
	 *  retained solely so the model can be compared against the one observed
	 *  occupancy record (~130 of 198 on 2020-09-16, Street Roots). Used for the
	 *  calibration section of the results report, never as a study arm. */
	private static final String HISTORICAL_REFERENCE_NAME = "HISTORICAL_capacity_reference_not_a_scenario";

	/** Bed-equivalence sweep (round-5 Phase D2). Arm B's REAL locations with
	 *  system capacity scaled to s × demand, s ∈ {0.8, 1.2, 1.4, 1.6}
	 *  (B itself is s = 1.0). Same 36 sites, same largest-remainder
	 *  apportionment as B. Answers: how many extra beds at the real sites
	 *  buy the same access C obtains by re-placing them? Built by
	 *  scripts/build_bed_sweep_2026.py. */
	private static final String SCENARIO_BS080_NAME = "BSWEEP_s080_capacity_0.8x_demand_real_locations";
	private static final String SHELTERS_BS080_CSV = "data/shelters/shelters_2026_bsweep_s080.csv";
	private static final String SCENARIO_BS120_NAME = "BSWEEP_s120_capacity_1.2x_demand_real_locations";
	private static final String SHELTERS_BS120_CSV = "data/shelters/shelters_2026_bsweep_s120.csv";
	private static final String SCENARIO_BS140_NAME = "BSWEEP_s140_capacity_1.4x_demand_real_locations";
	private static final String SHELTERS_BS140_CSV = "data/shelters/shelters_2026_bsweep_s140.csv";
	private static final String SCENARIO_BS160_NAME = "BSWEEP_s160_capacity_1.6x_demand_real_locations";
	private static final String SHELTERS_BS160_CSV = "data/shelters/shelters_2026_bsweep_s160.csv";
	/** Fine sweep between 1.0x and 1.2x to locate where surplus capacity at
	 *  the REAL sites crosses arm C's access — the "exchange rate" of siting
	 *  vs surplus (round-5 critique follow-up). */
	private static final String SCENARIO_BS105_NAME = "BSWEEP_s105_capacity_1.05x_demand_real_locations";
	private static final String SHELTERS_BS105_CSV = "data/shelters/shelters_2026_bsweep_s105.csv";
	private static final String SCENARIO_BS110_NAME = "BSWEEP_s110_capacity_1.1x_demand_real_locations";
	private static final String SHELTERS_BS110_CSV = "data/shelters/shelters_2026_bsweep_s110.csv";
	private static final String SCENARIO_BS115_NAME = "BSWEEP_s115_capacity_1.15x_demand_real_locations";
	private static final String SHELTERS_BS115_CSV = "data/shelters/shelters_2026_bsweep_s115.csv";

	/** Arm D — NEED-BASED ADMISSION. Identical to B in every physical respect:
	 *  the same 36 real locations and the same 6,842 spaces, from B's own
	 *  shelter file. The ONLY difference is the intake rule — a fraction
	 *  {@code triageReserveFraction} of every shelter's capacity is held for
	 *  mobility-limited arrivals instead of being handed out first-come,
	 *  first-served. No building, no relocation, no extra bed. */
	private static final String SCENARIO_D_NAME = "D_need_based_admission_real_locations";

	// V13 anchor: simulation hour 0 = local midnight at the start of the study
	// window (Portland's Sept 7-19 2020 smoke episode).
	private static final LocalDateTime SIM_START = LocalDateTime.of(2020, 9, 7, 0, 0);

	public Context build(Context context) {

		Parameters parm = RunEnvironment.getInstance().getParameters();
		int numAgents = (Integer) parm.getValue("numAgents");
		double minutesPerTick = (Double) parm.getValue("minutesPerTick");
		int simulationHours = (Integer) parm.getValue("simulationHours");
		long seed = RandomHelper.getSeed();

		// Scenario/feature switches. Declared as ints (0/1) rather than booleans
		// so they use the same proven IntConverter as every other parameter here.
		// All three default to the pre-existing behaviour, so the archived
		// baseline reproduces byte-identically unless a switch is turned on.
		// Read defensively: in batch mode Repast builds the parameter schema from
		// the batch params file, so a params file written before these switches
		// existed (notably the archived official baseline) simply does not carry
		// them. Falling back to the behaviour-preserving default keeps every
		// archived configuration runnable and reproducible exactly as filed.
		int scenarioCode = intParam(parm, "scenarioCode", 0);
		int enableHeterogeneity = intParam(parm, "enableHeterogeneity", 0);
		int respectShelterOpeningDates = intParam(parm, "respectShelterOpeningDates", 0);
		// Arm D's only lever. 0.0 = first-come-first-served, i.e. every arm that
		// existed before arm D, bit-for-bit — the reserve is subtracted from a
		// capacity comparison in Shelter.hasSpaceFor(), so at 0 the comparison is
		// the identical expression it always was.
		double triageReserveFraction = doubleParam(parm, "triageReserveFraction", 0.0);

		// ---- Phase-E decision layer (V29-V44) ------------------------------
		// Same defensive contract as every switch above: all defaults reproduce
		// the pre-E behaviour EXACTLY (enableDecisionLayer=0 skips every new
		// code path), so all archived params files keep running unchanged and
		// the R3 null holds by construction. The scientific values (aware
		// 0.356, barriers on, L1, hazard on) are set explicitly by the E-arm
		// batch files, never sneaked in through defaults.
		int enableDecisionLayer = intParam(parm, "enableDecisionLayer", 0);
		double pAwareInit = doubleParam(parm, "pAwareInit", 1.0);
		double pHeavyBelongings = doubleParam(parm, "pHeavyBelongings", 0.284);
		double pHasPet = doubleParam(parm, "pHasPet", 0.117);
		double pHasDependents = doubleParam(parm, "pHasDependents", 0.0044);
		// 0.0, NOT the sourced 0.06: this is the one E parameter whose non-zero
		// value would change behaviour the moment the layer is switched on, so a
		// sourced default here would make the "every default is
		// behaviour-preserving" guarantee false. The E arms set 0.06 explicitly
		// (V34, Moussaid 2010); the degenerate null sets 0.0.
		double groupSpeedDeltaMps = doubleParam(parm, "groupSpeedDeltaMps", 0.0);
		double lambdaOutreachPerDay = doubleParam(parm, "lambdaOutreachPerDay", 0.0);
		int informationRegime = intParam(parm, "informationRegime", 0);
		int enableHazardDeparture = intParam(parm, "enableHazardDeparture", 0);
		double sigmaTheta = doubleParam(parm, "sigmaTheta", 0.0);
		// alphaHazard default: provisional (A-30) — chosen so the implied attempt
		// share over ~240 evaluable hours matches the sourced attempt pipeline
		// (0.356 aware x 0.385 attempt-given-aware); refit against E9.
		double alphaHazard = doubleParam(parm, "alphaHazard", -8.0);
		double bRisk = doubleParam(parm, "bRisk", 0.4);
		double wOfficial = doubleParam(parm, "wOfficial", 1.1);
		double gammaVuln = doubleParam(parm, "gammaVuln", 0.0);
		double riskHalfLifeH = doubleParam(parm, "riskHalfLifeH", 48.0);
		double barrierBelongings = doubleParam(parm, "barrierBelongings", 0.0);
		double barrierPet = doubleParam(parm, "barrierPet", 0.0);
		double barrierDependents = doubleParam(parm, "barrierDependents", 0.0);
		// petPolicyDefault: 1 = unrecorded sites ADMIT pets (the inert,
		// behaviour-preserving default); baseline-real E arms set 0 = refuse,
		// the conservative A-29 reading, and sweep both worlds.
		int petPolicyDefault = intParam(parm, "petPolicyDefault", 1);
		double betaTravelTime = doubleParam(parm, "betaTravelTime", 1.0);
		double betaCapacityPrior = doubleParam(parm, "betaCapacityPrior", 0.0);
		// 1 = read the "_elayer" variant of this arm's shelter file, which carries
		// the RECORDED pet_intake policy joined from the upstream 2026 inventory
		// (4 of 48 facilities record pets_allowed=1, 422 beds). Default 0 reads
		// the archived file untouched, so data_version_tag and the archived
		// three-arm chain are unaffected. See A-29 and
		// scripts/build_shelter_policy_elayer.py.
		int shelterPolicyVariant = intParam(parm, "shelterPolicyVariant", 0);
		String scenarioName;
		String sheltersCsv;
		if (scenarioCode == 1) {
			scenarioName = SCENARIO_B_NAME;
			sheltersCsv = SHELTERS_B_CSV;
		} else if (scenarioCode == 2) {
			scenarioName = SCENARIO_C_NAME;
			sheltersCsv = SHELTERS_C_CSV;
		} else if (scenarioCode == 3) {
			scenarioName = HISTORICAL_REFERENCE_NAME;
			sheltersCsv = SHELTERS_CSV;   // the real 2 x 99 beds
		} else if (scenarioCode == 4) {
			scenarioName = SCENARIO_CR1_NAME;
			sheltersCsv = SHELTERS_CR1_CSV;
		} else if (scenarioCode == 5) {
			scenarioName = SCENARIO_CR2_NAME;
			sheltersCsv = SHELTERS_CR2_CSV;
		} else if (scenarioCode == 6) {
			scenarioName = SCENARIO_CR3_NAME;
			sheltersCsv = SHELTERS_CR3_CSV;
		} else if (scenarioCode == 7) {
			// Arm D reads arm B's shelter file verbatim — same 36 sites, same
			// 6,842 spaces. Only triageReserveFraction differs from arm B.
			scenarioName = SCENARIO_D_NAME;
			sheltersCsv = SHELTERS_B_CSV;
		} else if (scenarioCode == 8) {
			scenarioName = SCENARIO_CP4_NAME;
			sheltersCsv = SHELTERS_CP4_CSV;
		} else if (scenarioCode == 9) {
			scenarioName = SCENARIO_CP5_NAME;
			sheltersCsv = SHELTERS_CP5_CSV;
		} else if (scenarioCode == 10) {
			scenarioName = SCENARIO_CP6_NAME;
			sheltersCsv = SHELTERS_CP6_CSV;
		} else if (scenarioCode == 11) {
			scenarioName = SCENARIO_BS080_NAME;
			sheltersCsv = SHELTERS_BS080_CSV;
		} else if (scenarioCode == 12) {
			scenarioName = SCENARIO_BS120_NAME;
			sheltersCsv = SHELTERS_BS120_CSV;
		} else if (scenarioCode == 13) {
			scenarioName = SCENARIO_BS140_NAME;
			sheltersCsv = SHELTERS_BS140_CSV;
		} else if (scenarioCode == 14) {
			scenarioName = SCENARIO_BS160_NAME;
			sheltersCsv = SHELTERS_BS160_CSV;
		} else if (scenarioCode == 15) {
			scenarioName = SCENARIO_BS105_NAME;
			sheltersCsv = SHELTERS_BS105_CSV;
		} else if (scenarioCode == 16) {
			scenarioName = SCENARIO_BS110_NAME;
			sheltersCsv = SHELTERS_BS110_CSV;
		} else if (scenarioCode == 17) {
			scenarioName = SCENARIO_BS115_NAME;
			sheltersCsv = SHELTERS_BS115_CSV;
		} else {
			scenarioName = SCENARIO_A_NAME;
			sheltersCsv = SHELTERS_A_CSV;
		}

		// Swap in the recorded-pet-policy variant of whichever arm file the
		// scenario chain selected. Fail loudly rather than silently falling back:
		// a run that asked for recorded policy and quietly got the blanket
		// default would misattribute every pet-owner outcome.
		if (shelterPolicyVariant == 1) {
			String variant = sheltersCsv.substring(0, sheltersCsv.length() - 4) + "_elayer.csv";
			if (!new File(variant).exists()) {
				throw new IllegalStateException("shelterPolicyVariant=1 but " + variant
						+ " does not exist; run scripts/build_shelter_policy_elayer.py");
			}
			sheltersCsv = variant;
			System.out.println("[Shelters] policy variant ON: reading recorded pet_intake from "
					+ variant);
		}

		// Scientific governance: validate the variable and assumption registries
		// before anything else runs, so a registry defect stops the run rather
		// than surfacing as an unexplained number later. Pure I/O + validation:
		// no random draws, so the agent population is unaffected.
		ScienceRegistry registry = ScienceRegistry.load(VARIABLES_CSV, ASSUMPTIONS_CSV);
		System.out.println(registry.summaryLine());
		if (!registry.placeholderVariableIds().isEmpty()) {
			System.out.println("[ScienceRegistry][WARN] placeholder variables are inert and must not be "
					+ "quoted as results: " + registry.placeholderVariableIds());
		}
		if (!registry.blockingAssumptionIds().isEmpty()) {
			System.out.println("[ScienceRegistry][WARN] assumptions blocking publication: "
					+ registry.blockingAssumptionIds());
		}

		GeographyParameters geoParams = new GeographyParameters();
		Geography geography = GeographyFactoryFinder.createGeographyFactory(null)
				.createGeography("Geography", context, geoParams);
		GeometryFactory fac = new GeometryFactory();

		// "Network" projection is declared in context.xml and bound by displays.
		NetworkBuilder<?> netBuilder = new NetworkBuilder<Object>("Network", context, true);
		netBuilder.buildNetwork();

		// ---- Streets + routable graph (single pass) ------------------------
		StreetNetwork network = new StreetNetwork();
		List<SimpleFeature> features = loadFeaturesFromShapefile("./" + STREETS_SHP);
		for (SimpleFeature feature : features) {
			Geometry geom = (Geometry) feature.getDefaultGeometry();
			if (!(geom instanceof MultiLineString)) {
				continue;
			}
			LineString line = (LineString) ((MultiLineString) geom).getGeometryN(0);
			Coordinate[] coords = line.getCoordinates();
			Object typeAttr = feature.getAttribute("TYPE");
			if (typeAttr instanceof Number
					&& NON_PEDESTRIAN_TYPES.contains(((Number) typeAttr).intValue())) {
				// U-27: freeway-class feature — excluded from BOTH the routing
				// graph and the display layer; counted for the manifest.
				network.recordExcludedFeature(((Number) typeAttr).intValue(),
						StreetNetwork.polylineLengthM(coords));
				continue;
			}
			String name = attr(feature, "FULL_NAME");
			if (name == null) name = attr(feature, "STREETNAME");
			if (name == null) name = "unnamed street";
			Object fNode = feature.getAttribute("PDX_F_NODE");
			Object tNode = feature.getAttribute("PDX_T_NODE");
			double lengthM;
			if (fNode instanceof Number && tNode instanceof Number) {
				lengthM = network.addStreet(((Number) fNode).longValue(),
						((Number) tNode).longValue(), coords, name);
			} else {
				lengthM = StreetNetwork.polylineLengthM(coords);
			}
			PortlandStreet street = new PortlandStreet(name, lengthM);
			context.add(street);
			geography.move(street, line);
		}
		network.buildIndex();
		StreetNetwork.ValidationReport netReport = network.getValidationReport();
		System.out.println("[StreetNetwork] " + network.nodeCount() + " nodes, "
				+ network.streetEdgeCount() + " street edges");
		System.out.printf(
				"[StreetNetwork U-27] %d freeway-class features excluded from the "
				+ "pedestrian graph (%.1f km), by RLIS TYPE %s%n",
				netReport.freewayFeaturesExcluded, netReport.freewayKmExcluded,
				netReport.freewayExcludedByType);
		System.out.printf(
				"[StreetNetwork VALIDATION] %d corrupt attribute node ids corrected "
				+ "(%d sites reattached by geometry, %d split to synthetic nodes); "
				+ "impossible edges after fix: %d; max endpoint gap %.1f m; "
				+ "%d components (largest %d nodes)%n",
				netReport.affectedAttrIds, netReport.reattachedSites, netReport.splitSites,
				netReport.impossibleEdgesAfterFix, netReport.maxEndpointGapM,
				netReport.componentCount, netReport.largestComponentSize);
		if (netReport.impossibleEdgesAfterFix > 0) {
			System.out.println("[StreetNetwork VALIDATION][WARN] impossible-span edges "
					+ "remain after correction — routing distances are NOT trustworthy; "
					+ "see simulation.json street_network_validation");
		}

		// ---- Smoke field (real EPA AQS hourly PM2.5) -----------------------
		SmokeField smokeField = new SmokeField(SMOKE_CSV, "Multnomah", SIM_START);
		System.out.printf("[SmokeField] %d hourly slices from %s; peak %.1f ug/m3%n",
				smokeField.hours(), SIM_START, smokeField.peakHourly());

		// ---- Real shelters (Sept 2020) -------------------------------------
		List<Map<String, String>> shelterRows = CsvLoader.read(sheltersCsv);
		int operatingCount = 0;
		double ticksPerHour = 60.0 / minutesPerTick;
		for (Map<String, String> r : shelterRows) {
			String capStr = r.get("capacity");
			Integer capacity = (capStr == null || capStr.isEmpty()) ? null : Integer.valueOf(capStr);
			boolean operating = "operating".equalsIgnoreCase(r.get("status"));
			double lon = Double.parseDouble(r.get("lon"));
			double lat = Double.parseDouble(r.get("lat"));
			Shelter shelter = new Shelter(r.get("shelter_id"), r.get("name"), capacity, operating, lon, lat);
			// Real opening/closing dates (D1). Gate OFF => always open, which is
			// exactly the behaviour of every run before this commit.
			if (respectShelterOpeningDates == 1) {
				shelter.setOpenWindowTicks(
						tickForDate(r.get("opened"), ticksPerHour, Double.NEGATIVE_INFINITY, 0),
						tickForDate(r.get("closed"), ticksPerHour, Double.POSITIVE_INFINITY, 1));
			}
			// Need-based admission (arm D). The reserve is a FLOOR of the
			// per-site capacity, not a round: rounding up would let a rule
			// stated as "hold 10%" hold more than 10% at every odd-sized site,
			// and the conservative direction is the one that cannot flatter the
			// intervention. At fraction 0 this sets 0 and changes nothing.
			if (capacity != null && triageReserveFraction > 0.0) {
				shelter.setReservedForPriority(
						(int) Math.floor(capacity.intValue() * triageReserveFraction));
			}
			// Phase-E OPTIONAL policy columns (V32/V33, A-29). Absent from every
			// archived shelter CSV — those files are never edited (their checksums
			// feed data_version_tag) — so this reads defensively: no column, no
			// value, and the run-wide petPolicyDefault applies at the door.
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
			context.add(shelter);
			Coordinate c = new Coordinate(lon, lat);
			geography.move(shelter, fac.createPoint(c));
			long nodeId = network.nearestNode(c);
			shelter.setGraphNodeId(nodeId);
			shelter.setRouteTree(network.computeTree(nodeId));
			if (operating) operatingCount++;
		}
		System.out.println("[Shelters] " + shelterRows.size() + " loaded from " + sheltersCsv
				+ ", " + operatingCount + " operating (scenario " + scenarioName + ")");
		if (respectShelterOpeningDates == 1) {
			for (Object o : context.getObjects(Shelter.class)) {
				Shelter s = (Shelter) o;
				if (s.isOperating()) {
					System.out.printf("[Shelters] %s open window ticks %.0f..%.0f "
							+ "(%.1f h after simulation start)%n",
							s.getId(), s.getOpenTick(), s.getCloseTick(),
							s.getOpenTick() / ticksPerHour);
				}
			}
		}
		if (triageReserveFraction > 0.0) {
			int reservedTotal = 0, operatingCap = 0;
			for (Object o : context.getObjects(Shelter.class)) {
				Shelter s = (Shelter) o;
				if (s.isOperating() && s.getCapacity() != null) {
					reservedTotal += s.getReservedForPriority();
					operatingCap += s.getCapacity().intValue();
				}
			}
			System.out.printf("[Triage] need-based admission ON: reserve fraction %.3f -> "
					+ "%d of %d operating spaces held for mobility-limited arrivals "
					+ "(%.2f%% realised after per-site floor)%n",
					triageReserveFraction, reservedTotal, operatingCap,
					operatingCap == 0 ? 0.0 : 100.0 * reservedTotal / operatingCap);
		} else {
			System.out.println("[Triage] need-based admission OFF (triageReserveFraction=0): "
					+ "admission is first-come, first-served exactly as in arms A/B/C.");
		}
		if (respectShelterOpeningDates != 1) {
			System.out.println("[Shelters][WARN] opening-date gate DISABLED: every shelter is "
					+ "open from tick 0, which is counterfactual (the real sites opened "
					+ "2020-09-10/11). See assumption A-02.");
		}

		// ---- Residents at real encampment locations (D2b) ------------------
		List<Map<String, String>> campRows = CsvLoader.read(ENCAMPMENTS_CSV);
		System.out.println("[WARN] Encampment start locations are REAL City-of-Portland "
				+ "campsite reports but from 2025-2026 (the open-data feed retains no "
				+ "2020 records); they are used as a spatial proxy for the Sept 2020 "
				+ "distribution. See DATA_SOURCES D2b. Complaint-driven -> visibility bias.");

		List<Coordinate> campCoords = new ArrayList<Coordinate>();
		List<String> campIds = new ArrayList<String>();
		for (Map<String, String> r : campRows) {
			try {
				campCoords.add(new Coordinate(Double.parseDouble(r.get("lon")), Double.parseDouble(r.get("lat"))));
				campIds.add(r.get("inc_id"));
			} catch (Exception ignore) { /* skip malformed row */ }
		}

		// Heterogeneous attributes (V18-V22) are drawn from a SEPARATE RNG stream
		// (see PopulationSampler): the RandomHelper draw below stays the only
		// default-stream draw per resident, so start locations are bit-identical
		// whether heterogeneity is on or off.
		PopulationSampler sampler = (enableHeterogeneity == 1) ? new PopulationSampler(seed) : null;

		// Creation-ordered agent list for the Phase-E second sampling pass:
		// context.getObjects iteration order is NOT guaranteed to be creation
		// order, and the E-sampler's draw order defines the E-population, so the
		// pass iterates this list, never the context.
		List<GisAgent> createdResidents = new ArrayList<GisAgent>(numAgents);

		for (int i = 0; i < numAgents; i++) {
			int idx = campCoords.isEmpty() ? -1 : RandomHelper.nextIntFromTo(0, campCoords.size() - 1);
			Coordinate coord = (idx < 0) ? new Coordinate(0, 0) : campCoords.get(idx);
			String encampmentId = (idx < 0) ? "none" : campIds.get(idx);
			long startNode = network.nearestNode(coord);
			GisAgent agent = new GisAgent("Site " + i, network, startNode, encampmentId, smokeField);
			// Provenance only: records the real campsite-report coordinate this
			// resident starts from so it appears in every result row. No random
			// draw, so the population stays bit-identical.
			agent.setStartCoord(coord.x, coord.y);
			if (sampler != null) {
				agent.setAttributes(sampler.sample());
			}
			context.add(agent);
			geography.move(agent, fac.createPoint(coord));
			createdResidents.add(agent);
		}
		System.out.println("[Residents] " + numAgents + " placed at real encampment points");
		if (sampler != null) {
			// Realised marginals printed against the published ones: sampling is
			// verified at load time, not trusted (01-POPULATION.md §6.3).
			System.out.printf("[Population] heterogeneity ON - realised: mobility %.3f | "
					+ "asthma %.3f | COPD %.3f | any respiratory %.3f | "
					+ "chronic physical %.3f | age 55+ %.3f | "
					+ "mean walking speed %.3f m/s%n",
					sampler.getMobilityLimitedShare(), sampler.getAsthmaShare(),
					sampler.getCopdShare(), sampler.getAnyRespiratoryShare(),
					sampler.getChronicPhysicalShare(),
					sampler.getAge55PlusShare(), sampler.getMeanWalkingSpeedMps());
			System.out.println("[Population] " + PopulationSampler.publishedTargets());
		} else {
			System.out.println("[Population] heterogeneity OFF - every resident walks at the "
					+ "run-wide walkingSpeedMps and carries no attributes");
		}

		// ---- Phase-E second sampling pass (V29-V44) ------------------------
		// Runs AFTER the placement loop completes, on its own RNG stream, so the
		// default-stream draws above and PopulationSampler's stream are
		// positionally untouched and the archived population stays byte-identical
		// (the three-streams rule; ELayerSampler class doc).
		ELayerSampler eSampler = null;
		if (enableDecisionLayer == 1) {
			eSampler = new ELayerSampler(seed, pAwareInit, pHeavyBelongings,
					pHasPet, pHasDependents, groupSpeedDeltaMps);
			GisAgent.DecisionConfig decisionConfig = new GisAgent.DecisionConfig(
					informationRegime, enableHazardDeparture, alphaHazard, bRisk,
					wOfficial, gammaVuln, sigmaTheta, riskHalfLifeH,
					lambdaOutreachPerDay, barrierBelongings, barrierPet,
					barrierDependents, petPolicyDefault == 1,
					betaTravelTime, betaCapacityPrior);
			for (GisAgent resident : createdResidents) {
				resident.setDecisionLayer(decisionConfig, eSampler.sample());
			}
			System.out.printf("[DecisionLayer] ON - regime %s, departure %s - realised: "
					+ "aware %.3f | belongings %.3f | pet %.3f | dependents %.4f | "
					+ "any barrier %.3f | compound barrier %.4f%n",
					informationRegime == 1 ? "L1 (locations only)" : "L0 (omniscient)",
					enableHazardDeparture == 1 ? "logistic hazard" : "legacy latch",
					eSampler.getAwareShare(), eSampler.getHeavyBelongingsShare(),
					eSampler.getPetShare(), eSampler.getDependentsShare(),
					eSampler.getAnyBarrierShare(), eSampler.getCompoundBarrierShare());
			System.out.println("[DecisionLayer] " + ELayerSampler.publishedTargets());
		} else {
			System.out.println("[DecisionLayer] OFF (enableDecisionLayer=0): legacy latch "
					+ "departure, omniscient choice, no decision attributes - the pre-E "
					+ "behaviour, byte-identical.");
		}

		// ---- Run length + end-of-run export --------------------------------
		int endHours = Math.min(simulationHours, smokeField.hours());
		double endTick = endHours * (60.0 / minutesPerTick);
		RunEnvironment.getInstance().endAt(endTick);

		String[] pNames = { "numAgents", "minutesPerTick", "walkingSpeedMps",
				"shelterArrivalDistanceM", "simulationHours", "randomSeed",
				"evacuationThresholdUgM3", "scenarioCode", "enableHeterogeneity",
				"respectShelterOpeningDates", "triageReserveFraction",
				// Phase-E decision layer (V29-V44). Every new parameter MUST
				// appear here or the manifest silently lies about the run config.
				"enableDecisionLayer", "pAwareInit", "pHeavyBelongings", "pHasPet",
				"pHasDependents", "groupSpeedDeltaMps", "lambdaOutreachPerDay",
				"informationRegime", "enableHazardDeparture", "sigmaTheta",
				"alphaHazard", "bRisk", "wOfficial", "gammaVuln", "riskHalfLifeH",
				"barrierBelongings", "barrierPet", "barrierDependents",
				"petPolicyDefault", "betaTravelTime", "betaCapacityPrior",
				"shelterPolicyVariant" };
		Object[] pVals = { numAgents, minutesPerTick, parm.getValue("walkingSpeedMps"),
				parm.getValue("shelterArrivalDistanceM"), simulationHours, seed,
				paramOrDefault(parm, "evacuationThresholdUgM3", "unset"), scenarioCode,
				enableHeterogeneity, respectShelterOpeningDates, triageReserveFraction,
				enableDecisionLayer, pAwareInit, pHeavyBelongings, pHasPet,
				pHasDependents, groupSpeedDeltaMps, lambdaOutreachPerDay,
				informationRegime, enableHazardDeparture, sigmaTheta,
				alphaHazard, bRisk, wOfficial, gammaVuln, riskHalfLifeH,
				barrierBelongings, barrierPet, barrierDependents,
				petPolicyDefault, betaTravelTime, betaCapacityPrior,
				shelterPolicyVariant };
		String[] dataFiles = { STREETS_SHP, SMOKE_CSV, sheltersCsv, ENCAMPMENTS_CSV };

		@SuppressWarnings("unchecked")
		OutcomeLogger logger = new OutcomeLogger(context, smokeField, seed, pNames, pVals,
				dataFiles, netReport, registry, scenarioName, sampler, eSampler);
		ISchedule schedule = RunEnvironment.getInstance().getCurrentSchedule();
		schedule.schedule(ScheduleParameters.createAtEnd(ScheduleParameters.LAST_PRIORITY), logger, "export");

		System.out.printf("[Run] ends at tick %.0f (%d event hours at %.1f min/tick)%n",
				endTick, endHours, minutesPerTick);
		return context;
	}

	/** Integer parameter, or {@code fallback} when this run's schema omits it. */
	/** Double parameter, or {@code fallback} when this run's schema omits it.
	 *  Same defensive contract as {@link #intParam}: every archived params file
	 *  predates triageReserveFraction and must keep running unchanged. */
	private static double doubleParam(Parameters parm, String name, double fallback) {
		try {
			Object v = parm.getValue(name);
			return (v instanceof Number) ? ((Number) v).doubleValue() : fallback;
		} catch (RuntimeException absentFromSchema) {
			return fallback;
		}
	}

	/** Integer parameter, or {@code fallback} when this run's schema omits it. */
	private static int intParam(Parameters parm, String name, int fallback) {
		try {
			Object v = parm.getValue(name);
			return (v instanceof Number) ? ((Number) v).intValue() : fallback;
		} catch (RuntimeException absentFromSchema) {
			return fallback;
		}
	}

	/** Parameter value for the manifest, or the fallback when absent. */
	private static Object paramOrDefault(Parameters parm, String name, Object fallback) {
		try {
			Object v = parm.getValue(name);
			return v == null ? fallback : v;
		} catch (RuntimeException absentFromSchema) {
			return fallback;
		}
	}

	/**
	 * Tick at 00:00 local on the given ISO date, relative to {@link #SIM_START}.
	 * Blank/absent dates return {@code fallback} (an always-open bound).
	 *
	 * @param dayOffset 0 for an opening date (the site is open from 00:00 that
	 *                  day), 1 for a closing date (the site operates through the
	 *                  END of the stated day). The source gives dates, not hours;
	 *                  this is the documented reading (see Shelter.openTick).
	 */
	private static double tickForDate(String isoDate, double ticksPerHour,
			double fallback, int dayOffset) {
		if (isoDate == null || isoDate.trim().isEmpty()) {
			return fallback;
		}
		LocalDateTime moment = java.time.LocalDate.parse(isoDate.trim())
				.plusDays(dayOffset).atStartOfDay();
		double hours = java.time.Duration.between(SIM_START, moment).toMinutes() / 60.0;
		return hours * ticksPerHour;
	}

	private static String attr(SimpleFeature feature, String name) {
		Object v = feature.getAttribute(name);
		if (v == null) return null;
		String s = v.toString().trim();
		return s.isEmpty() ? null : s;
	}

	private List<SimpleFeature> loadFeaturesFromShapefile(String filename) {
		URL url = null;
		try {
			url = new File(filename).toURL();
		} catch (MalformedURLException e1) {
			e1.printStackTrace();
		}
		List<SimpleFeature> features = new ArrayList<SimpleFeature>();
		SimpleFeatureIterator fiter = null;
		ShapefileDataStore store = new ShapefileDataStore(url);
		try {
			org.geotools.data.simple.SimpleFeatureCollection collection = store.getFeatureSource().getFeatures();
			org.opengis.referencing.crs.CoordinateReferenceSystem sourceCRS =
					store.getFeatureSource().getSchema().getCoordinateReferenceSystem();
			org.opengis.referencing.crs.CoordinateReferenceSystem targetCRS =
					org.geotools.referencing.crs.DefaultGeographicCRS.WGS84;
			if (sourceCRS != null && !org.geotools.referencing.CRS.equalsIgnoreMetadata(sourceCRS, targetCRS)) {
				collection = new org.geotools.data.store.ReprojectingFeatureCollection(collection, targetCRS);
			}
			fiter = collection.features();
			while (fiter.hasNext()) {
				features.add(fiter.next());
			}
		} catch (Exception e) {
			System.out.println("[REPROJECTION DIAGNOSTIC] Error transforming coordinates:");
			e.printStackTrace();
		} finally {
			if (fiter != null) fiter.close();
			if (store != null) store.dispose();
		}
		return features;
	}
}
