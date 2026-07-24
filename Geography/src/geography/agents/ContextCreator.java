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

	private static final String STREETS_SHP  = "data/Streets.shp";
	private static final String SMOKE_CSV     = "data/airnow/aqs_hourly_pm25_portland_2020-09.csv";
	private static final String SHELTERS_CSV  = "data/shelters/shelters_2020-09.csv";
	private static final String ENCAMPMENTS_CSV = "data/encampments/irp_campsite_reports_sample.csv";

	// V13 anchor: simulation hour 0 = local midnight at the start of the study
	// window (Portland's Sept 7-19 2020 smoke episode).
	private static final LocalDateTime SIM_START = LocalDateTime.of(2020, 9, 7, 0, 0);

	public Context build(Context context) {

		Parameters parm = RunEnvironment.getInstance().getParameters();
		int numAgents = (Integer) parm.getValue("numAgents");
		double minutesPerTick = (Double) parm.getValue("minutesPerTick");
		double indoorProtectionFactor = (Double) parm.getValue("indoorProtectionFactor");
		int simulationHours = (Integer) parm.getValue("simulationHours");
		long seed = RandomHelper.getSeed();

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
						((Number) tNode).longValue(), coords);
			} else {
				lengthM = StreetNetwork.polylineLengthM(coords);
			}
			PortlandStreet street = new PortlandStreet(name, lengthM);
			context.add(street);
			geography.move(street, line);
		}
		network.buildIndex();
		System.out.println("[StreetNetwork] " + network.nodeCount() + " nodes, "
				+ network.streetEdgeCount() + " street edges");

		// ---- Smoke field (real EPA AQS hourly PM2.5) -----------------------
		SmokeField smokeField = new SmokeField(SMOKE_CSV, "Multnomah", SIM_START);
		System.out.printf("[SmokeField] %d hourly slices from %s; peak %.1f ug/m3%n",
				smokeField.hours(), SIM_START, smokeField.peakHourly());

		if (indoorProtectionFactor >= 1.0) {
			System.out.println("[WARN] indoorProtectionFactor = " + indoorProtectionFactor
					+ ": shelters provide NO modelled exposure benefit. The indoor "
					+ "protection factor (V17) is unsourced (DESIGN_SPEC); set it from "
					+ "literature and sweep it before interpreting shelter benefit.");
		}

		// ---- Real shelters (Sept 2020) -------------------------------------
		List<Map<String, String>> shelterRows = CsvLoader.read(SHELTERS_CSV);
		int operatingCount = 0;
		for (Map<String, String> r : shelterRows) {
			String capStr = r.get("capacity");
			Integer capacity = (capStr == null || capStr.isEmpty()) ? null : Integer.valueOf(capStr);
			boolean operating = "operating".equalsIgnoreCase(r.get("status"));
			double lon = Double.parseDouble(r.get("lon"));
			double lat = Double.parseDouble(r.get("lat"));
			Shelter shelter = new Shelter(r.get("shelter_id"), r.get("name"), capacity, operating, lon, lat);
			context.add(shelter);
			Coordinate c = new Coordinate(lon, lat);
			geography.move(shelter, fac.createPoint(c));
			long nodeId = network.nearestNode(c);
			shelter.setGraphNodeId(nodeId);
			shelter.setRouteTree(network.computeTree(nodeId));
			if (operating) operatingCount++;
		}
		System.out.println("[Shelters] " + shelterRows.size() + " loaded, "
				+ operatingCount + " operating (status-quo scenario)");

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

		for (int i = 0; i < numAgents; i++) {
			int idx = campCoords.isEmpty() ? -1 : RandomHelper.nextIntFromTo(0, campCoords.size() - 1);
			Coordinate coord = (idx < 0) ? new Coordinate(0, 0) : campCoords.get(idx);
			String encampmentId = (idx < 0) ? "none" : campIds.get(idx);
			long startNode = network.nearestNode(coord);
			GisAgent agent = new GisAgent("Site " + i, network, startNode, encampmentId, smokeField);
			context.add(agent);
			geography.move(agent, fac.createPoint(coord));
		}
		System.out.println("[Residents] " + numAgents + " placed at real encampment points");

		// ---- Run length + end-of-run export --------------------------------
		int endHours = Math.min(simulationHours, smokeField.hours());
		double endTick = endHours * (60.0 / minutesPerTick);
		RunEnvironment.getInstance().endAt(endTick);

		String[] pNames = { "numAgents", "minutesPerTick", "walkingSpeedMps",
				"shelterArrivalDistanceM", "indoorProtectionFactor", "simulationHours", "randomSeed" };
		Object[] pVals = { numAgents, minutesPerTick, parm.getValue("walkingSpeedMps"),
				parm.getValue("shelterArrivalDistanceM"), indoorProtectionFactor, simulationHours, seed };
		String[] dataFiles = { STREETS_SHP, SMOKE_CSV, SHELTERS_CSV, ENCAMPMENTS_CSV };

		@SuppressWarnings("unchecked")
		OutcomeLogger logger = new OutcomeLogger(context, smokeField, seed, pNames, pVals, dataFiles);
		ISchedule schedule = RunEnvironment.getInstance().getCurrentSchedule();
		schedule.schedule(ScheduleParameters.createAtEnd(ScheduleParameters.LAST_PRIORITY), logger, "export");

		System.out.printf("[Run] ends at tick %.0f (%d event hours at %.1f min/tick)%n",
				endTick, endHours, minutesPerTick);
		return context;
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
