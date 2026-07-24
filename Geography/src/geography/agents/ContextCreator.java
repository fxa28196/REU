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
 *       load) and place {@code numAgents} {@link GisAgent} residents at
 *       street start-vertices.</li>
 *   <li>Create placeholder {@link Shelter}s (see inline note).</li>
 *   <li>Create one {@link PortlandStreet} agent per street feature so the
 *       street layer is visible and queryable by resident movement.</li>
 * </ol>
 *
 * Derived from the Repast Simphony stock "Geography" GIS demo
 * (@author Eric Tatara); demo water/zone/tower logic removed 2026-07-24 —
 * see git history for the original.
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
		// created. (The stock demo added a random edge between residents here;
		// removed — it had no modeling meaning.)
		NetworkBuilder<?> netBuilder = new NetworkBuilder<Object>("Network", context, true);
		netBuilder.buildNetwork();

		String portlandStreetsFilename = "./data/Streets.shp";
		List<SimpleFeature> features = loadFeaturesFromShapefile(portlandStreetsFilename);

		// Residents start at the first vertex of the i-th street polyline.
		// PLACEHOLDER (PROJECT_ASSESSMENT.md R2/V15): real encampment-derived
		// starting locations are a scheduled scientific deliverable.
		List<Coordinate> agentCoords = new ArrayList<Coordinate>();
		if (features != null && !features.isEmpty()) {
			for (int i = 0; i < numAgents; i++) {
				Geometry streetGeom = (Geometry) features.get(i % features.size()).getDefaultGeometry();
				agentCoords.add(streetGeom.getCoordinate());
			}
		}

		// PLACEHOLDER (PROJECT_ASSESSMENT.md R3/V12): 5 shelters of capacity
		// 100 at formula-picked street vertices stand in for the real
		// Multnomah County cleaner-air shelter map; capacity is not yet
		// enforced anywhere.
		int numShelters = 5;
		if (features != null && !features.isEmpty()) {
			for (int i = 0; i < numShelters; i++) {
				Shelter shelter = new Shelter("Shelter_" + i, 100);
				context.add(shelter);

				SimpleFeature streetFeature = features.get((i * 7) % features.size());
				Geometry streetGeom = (Geometry) streetFeature.getDefaultGeometry();

				Coordinate shelterCoord = streetGeom.getCoordinate();

				geography.move(shelter, fac.createPoint(shelterCoord));
			}
		}

		int cnt = 0;
		for (Coordinate coord : agentCoords) {
			GisAgent agent = new GisAgent("Site " + cnt);
			context.add(agent);

			Point geom = fac.createPoint(coord);
			geography.move(agent, geom);
			cnt++;
		}

		// Create one PortlandStreet agent per street feature.
		loadFeatures("data/Streets.shp", context, geography);

		return context;
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


	/**
	 * Creates one PortlandStreet agent per line feature in the shapefile and
	 * places it in the geography.
	 *
	 * @param filename the shapefile to load street features from
	 * @param context the context
	 * @param geography the geography
	 */
	private void loadFeatures (String filename, Context context, Geography geography){

		List<SimpleFeature> features = loadFeaturesFromShapefile(filename);

		for (SimpleFeature feature : features){
			Geometry geom = (Geometry)feature.getDefaultGeometry();
			Object agent = null;

			if (!geom.isValid()){
				System.out.println("Invalid geometry: " + feature.getID());
			}

			if (geom instanceof MultiLineString){
			    MultiLineString line = (MultiLineString)feature.getDefaultGeometry();
			    geom = (LineString)line.getGeometryN(0);

			    // PLACEHOLDER (PROJECT_ASSESSMENT.md R1): the RLIS shapefile
			    // carries real STREETNAME/LENGTH attributes; reading them (and
			    // building a routable graph from PDX_F_NODE/PDX_T_NODE) is
			    // roadmap commit 4 work. Safe defaults avoid schema coupling
			    // until then.
			    String name = "Portland Street";
			    double length = 1.0;

			    agent = new PortlandStreet(name, length);
			}

			if (agent != null){
				context.add(agent);
				geography.move(agent, geom);
			}
			else{
				System.out.println("Error creating agent for  " + geom);
			}
		}
	}
}
