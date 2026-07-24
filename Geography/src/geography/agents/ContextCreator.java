package geography.agents;

import java.io.File;
import java.net.MalformedURLException;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

import org.geotools.data.shapefile.ShapefileDataStore;
import org.geotools.data.simple.SimpleFeatureIterator;
import org.opengis.feature.simple.SimpleFeature;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.geom.MultiLineString;
import org.locationtech.jts.geom.Point;

import geography.routing.StreetNetwork;

import repast.simphony.context.Context;
import repast.simphony.context.space.gis.GeographyFactoryFinder;
import repast.simphony.context.space.graph.NetworkBuilder;
import repast.simphony.dataLoader.ContextBuilder;
import repast.simphony.engine.environment.RunEnvironment;
import repast.simphony.parameter.Parameters;
import repast.simphony.space.gis.Geography;
import repast.simphony.space.gis.GeographyParameters;

/**
 * Builds the simulation context for the wildfire-smoke shelter-placement
 * model (NSF REU, Portland State University; see PROJECT_ASSESSMENT.md).
 *
 * Construction sequence:
 * <ol>
 *   <li>Create the WGS84 GIS projection "Geography" and the (currently empty)
 *       "Network" projection, both declared in Geography.rs/context.xml.</li>
 *   <li>Load the Portland street centerlines from data/Streets.shp
 *       (Portland Metro RLIS schema, reprojected Web Mercator to WGS84 at
 *       load) in a single pass that creates one {@link PortlandStreet} agent
 *       per feature (real FULL_NAME/STREETNAME attribute, geodesic length in
 *       metres) and simultaneously builds the routable
 *       {@link StreetNetwork} from the RLIS PDX_F_NODE/PDX_T_NODE topology.</li>
 *   <li>Create placeholder {@link Shelter}s, snap each to its nearest graph
 *       node, and root a Dijkstra shortest-path tree there.</li>
 *   <li>Place {@code numAgents} {@link GisAgent} residents at street
 *       start-vertices with their start nodes resolved on the graph.</li>
 * </ol>
 *
 * Derived from the Repast Simphony stock "Geography" GIS demo
 * (@author Eric Tatara); demo logic removed 2026-07-24 — see git history.
 */
public class ContextCreator implements ContextBuilder {

	int numAgents;

	public Context build(Context context) {

		Parameters parm = RunEnvironment.getInstance().getParameters();
		numAgents = (Integer)parm.getValue("numAgents");

		GeographyParameters geoParams = new GeographyParameters();
		Geography geography = GeographyFactoryFinder.createGeographyFactory(null)
				.createGeography("Geography", context, geoParams);

		GeometryFactory fac = new GeometryFactory();

		// The "Network" projection is declared in Geography.rs/context.xml and
		// bound by the GIS displays, so it must exist even though no edges are
		// created.
		NetworkBuilder<?> netBuilder = new NetworkBuilder<Object>("Network", context, true);
		netBuilder.buildNetwork();

		List<SimpleFeature> features = loadFeaturesFromShapefile("./data/Streets.shp");

		// ---- Single pass: street agents + routable graph -------------------
		StreetNetwork network = new StreetNetwork();
		int skippedNoNodes = 0;
		List<Coordinate> firstVertices = new ArrayList<Coordinate>();

		for (SimpleFeature feature : features) {
			Geometry geom = (Geometry) feature.getDefaultGeometry();
			if (!(geom instanceof MultiLineString)) {
				continue;
			}
			if (!geom.isValid()) {
				System.out.println("Invalid geometry: " + feature.getID());
			}
			LineString line = (LineString) ((MultiLineString) geom).getGeometryN(0);
			Coordinate[] coords = line.getCoordinates();
			firstVertices.add(coords[0]);

			// Real RLIS attributes (R1): FULL_NAME preferred, STREETNAME
			// fallback; length computed geodesically in metres rather than
			// trusting the LENGTH column's undocumented unit.
			String name = attributeString(feature, "FULL_NAME");
			if (name == null) {
				name = attributeString(feature, "STREETNAME");
			}
			if (name == null) {
				name = "unnamed street";
			}

			Object fNode = feature.getAttribute("PDX_F_NODE");
			Object tNode = feature.getAttribute("PDX_T_NODE");
			double lengthM;
			if (fNode instanceof Number && tNode instanceof Number) {
				lengthM = network.addStreet(((Number) fNode).longValue(),
						((Number) tNode).longValue(), coords);
			} else {
				lengthM = StreetNetwork.polylineLengthM(coords);
				skippedNoNodes++;
			}

			PortlandStreet street = new PortlandStreet(name, lengthM);
			context.add(street);
			geography.move(street, line);
		}
		network.buildIndex();
		System.out.println("[StreetNetwork] " + network.nodeCount() + " nodes, "
				+ network.streetEdgeCount() + " street edges"
				+ (skippedNoNodes > 0 ? ", " + skippedNoNodes + " features without node ids" : ""));

		// ---- Shelters (placeholders, R3/V12): snap to graph, root a tree ---
		int numShelters = 5;
		if (!firstVertices.isEmpty()) {
			for (int i = 0; i < numShelters; i++) {
				Shelter shelter = new Shelter("Shelter_" + i, 100);
				context.add(shelter);

				Coordinate shelterCoord = firstVertices.get((i * 7) % firstVertices.size());
				geography.move(shelter, fac.createPoint(shelterCoord));

				long nodeId = network.nearestNode(shelterCoord);
				shelter.setGraphNodeId(nodeId);
				shelter.setRouteTree(network.computeTree(nodeId));
			}
		}

		// ---- Residents (placeholder starts, R2/V15) ------------------------
		if (!firstVertices.isEmpty()) {
			for (int i = 0; i < numAgents; i++) {
				Coordinate coord = firstVertices.get(i % firstVertices.size());
				long startNode = network.nearestNode(coord);
				GisAgent agent = new GisAgent("Site " + i, network, startNode);
				context.add(agent);

				Point geom = fac.createPoint(coord);
				geography.move(agent, geom);
			}
		}

		return context;
	}

	private static String attributeString(SimpleFeature feature, String name) {
		Object v = feature.getAttribute(name);
		if (v == null) {
			return null;
		}
		String s = v.toString().trim();
		return s.isEmpty() ? null : s;
	}

	private List<SimpleFeature> loadFeaturesFromShapefile(String filename){
		URL url = null;
		try {
			url = new File(filename).toURL();
		} catch (MalformedURLException e1) {
			e1.printStackTrace();
		}

		List<SimpleFeature> features = new ArrayList<SimpleFeature>();

		SimpleFeatureIterator fiter = null;
		ShapefileDataStore store = null;
		store = new ShapefileDataStore(url);

		try {
			org.geotools.data.simple.SimpleFeatureCollection collection = store.getFeatureSource().getFeatures();

			org.opengis.referencing.crs.CoordinateReferenceSystem sourceCRS = store.getFeatureSource().getSchema().getCoordinateReferenceSystem();
			org.opengis.referencing.crs.CoordinateReferenceSystem targetCRS = org.geotools.referencing.crs.DefaultGeographicCRS.WGS84;

			if (sourceCRS != null && !org.geotools.referencing.CRS.equalsIgnoreMetadata(sourceCRS, targetCRS)) {
				collection = new org.geotools.data.store.ReprojectingFeatureCollection(collection, targetCRS);
			}

			fiter = collection.features();
			while(fiter.hasNext()){
				features.add(fiter.next());
			}
		} catch (Exception e) {
			System.out.println("[REPROJECTION DIAGNOSTIC] Error transforming coordinates:");
			e.printStackTrace();
		}
		finally {
			if (fiter != null) {
				fiter.close();
			}
			if (store != null) {
				store.dispose();
			}
		}

		return features;
	}
}
