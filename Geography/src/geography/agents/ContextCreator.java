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
import org.locationtech.jts.geom.Point;

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

	/** Arm C — B's capacity, optimally placed. Holds B's facility count and
	 *  per-facility capacity EXACTLY and changes only the coordinates, so any
	 *  B->C difference is attributable to placement alone. Sites are street-network
	 *  nodes chosen by capacity-aware greedy p-median (scripts/optimize_2026_placement.py):
	 *  THEORETICAL locations, not verified venues with filtered indoor air. */
	private static final String SCENARIO_C_NAME = "C_capacity_meets_demand_optimized_locations";
	private static final String SHELTERS_C_CSV = "data/shelters/shelters_2026_expanded_optimized.csv";
	/** NOT a scenario — the historical-capacity reference run (2 x 99 real beds)
	 *  retained solely so the model can be compared against the one observed
	 *  occupancy record (~130 of 198 on 2020-09-16, Street Roots). Used for the
	 *  calibration section of the results report, never as a study arm. */
	private static final String HISTORICAL_REFERENCE_NAME = "HISTORICAL_capacity_reference_not_a_scenario";

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
		} else {
			scenarioName = SCENARIO_A_NAME;
			sheltersCsv = SHELTERS_A_CSV;
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
		} else {
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
		}
		System.out.println("[Residents] " + numAgents + " placed at real encampment points");
		if (sampler != null) {
			// Realised marginals printed against the published ones: sampling is
			// verified at load time, not trusted (01-POPULATION.md §6.3).
			System.out.printf("[Population] heterogeneity ON - realised: mobility %.3f | "
					+ "asthma %.3f | COPD %.3f | any respiratory %.3f | age 55+ %.3f | "
					+ "mean walking speed %.3f m/s%n",
					sampler.getMobilityLimitedShare(), sampler.getAsthmaShare(),
					sampler.getCopdShare(), sampler.getAnyRespiratoryShare(),
					sampler.getAge55PlusShare(), sampler.getMeanWalkingSpeedMps());
			System.out.println("[Population] " + PopulationSampler.publishedTargets());
		} else {
			System.out.println("[Population] heterogeneity OFF - every resident walks at the "
					+ "run-wide walkingSpeedMps and carries no attributes");
		}

		// ---- Run length + end-of-run export --------------------------------
		int endHours = Math.min(simulationHours, smokeField.hours());
		double endTick = endHours * (60.0 / minutesPerTick);
		RunEnvironment.getInstance().endAt(endTick);

		String[] pNames = { "numAgents", "minutesPerTick", "walkingSpeedMps",
				"shelterArrivalDistanceM", "simulationHours", "randomSeed",
				"evacuationThresholdUgM3", "scenarioCode", "enableHeterogeneity",
				"respectShelterOpeningDates" };
		Object[] pVals = { numAgents, minutesPerTick, parm.getValue("walkingSpeedMps"),
				parm.getValue("shelterArrivalDistanceM"), simulationHours, seed,
				paramOrDefault(parm, "evacuationThresholdUgM3", "unset"), scenarioCode,
				enableHeterogeneity, respectShelterOpeningDates };
		String[] dataFiles = { STREETS_SHP, SMOKE_CSV, sheltersCsv, ENCAMPMENTS_CSV };

		@SuppressWarnings("unchecked")
		OutcomeLogger logger = new OutcomeLogger(context, smokeField, seed, pNames, pVals,
				dataFiles, netReport, registry, scenarioName, sampler);
		ISchedule schedule = RunEnvironment.getInstance().getCurrentSchedule();
		schedule.schedule(ScheduleParameters.createAtEnd(ScheduleParameters.LAST_PRIORITY), logger, "export");

		System.out.printf("[Run] ends at tick %.0f (%d event hours at %.1f min/tick)%n",
				endTick, endHours, minutesPerTick);
		return context;
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
