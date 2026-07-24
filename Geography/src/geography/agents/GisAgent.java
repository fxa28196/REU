package geography.agents;

import java.util.ArrayList;
import java.util.List;

import net.sf.geographiclib.Geodesic;
import net.sf.geographiclib.GeodesicData;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;

import repast.simphony.context.Context;
import repast.simphony.engine.environment.RunEnvironment;
import repast.simphony.engine.schedule.ScheduledMethod;
import repast.simphony.parameter.Parameters;
import repast.simphony.space.gis.Geography;
import repast.simphony.util.ContextUtils;

/**
 * An unsheltered resident of Multnomah County, represented as a GIS point
 * agent in WGS84 lon/lat (JTS convention: {@code Coordinate.x} = longitude,
 * {@code Coordinate.y} = latitude).
 *
 * Movement model (documented in docs/science/VARIABLES.md):
 * each tick represents {@code minutesPerTick} minutes of simulated time; the
 * agent walks {@code walkingSpeedMps * 60 * minutesPerTick} metres along its
 * current street polyline toward the straight-line-nearest {@link Shelter}.
 * All distances, speeds and arrival thresholds are geodesic metres on the
 * WGS84 ellipsoid (GeographicLib, bundled with Repast's GIS plugin) —
 * replacing the stock demo's anisotropic raw-degree arithmetic.
 *
 * Known limitations tracked in PROJECT_ASSESSMENT.md (Phase 4 roadmap):
 * street choice is a greedy nearest-segment heuristic, not shortest-path
 * routing on a street graph (commit 4); the agent removes itself from the
 * context both on arrival and on path failure, which destroys outcome
 * measurement (commit 5).
 */
public class GisAgent {

	private Shelter targetShelter = null;
	private String name;

	private List<Coordinate> currentPathCoords = null;
	private int currentPathIndex = 0;
	private PortlandStreet lastVisitedStreet = null;

	/** Cumulative geodesic metres walked (variable V9, docs/science/VARIABLES.md). */
	private double distanceTraveledM = 0;

	public GisAgent(String name) {
		this.name = name;
	}

	/**
	 * Geodesic distance in metres between two WGS84 lon/lat coordinates
	 * (GeographicLib inverse problem on the WGS84 ellipsoid).
	 */
	private static double geodesicDistanceM(Coordinate a, Coordinate b) {
		return Geodesic.WGS84.Inverse(a.y, a.x, b.y, b.x).s12;
	}

	@ScheduledMethod(start = 1, interval = 1)
	public void step() {
		Context context = ContextUtils.getContext(this);
		Geography geography = (Geography) context.getProjection("Geography");

		Parameters params = RunEnvironment.getInstance().getParameters();
		double minutesPerTick = (Double) params.getValue("minutesPerTick");
		double walkingSpeedMps = (Double) params.getValue("walkingSpeedMps");
		double shelterArrivalDistanceM = (Double) params.getValue("shelterArrivalDistanceM");
		// Metres walkable in one tick; also the vertex-advance tolerance so a
		// vertex reachable within the current tick counts as reached (the
		// stock demo used degree constants chosen with the same invariant).
		double stepLengthM = walkingSpeedMps * 60.0 * minutesPerTick;

		GeometryFactory fac = new GeometryFactory();
		Point myPoint = (Point) geography.getGeometry(this);
		Coordinate myCoord = myPoint.getCoordinate();

		// Find the closest shelter if we don't have one
		if (targetShelter == null) {
			double minDistance = Double.MAX_VALUE;
			for (Object obj : context.getObjects(Shelter.class)) {
				Shelter shelter = (Shelter) obj;
				Point shelterPoint = (Point) geography.getGeometry(shelter);
				double dist = geodesicDistanceM(myCoord, shelterPoint.getCoordinate());
				if (dist < minDistance) {
					minDistance = dist;
					targetShelter = shelter;
				}
			}

			// Greedy nearest-street selection. NOTE: point-to-polyline ranking
			// still uses JTS planar degree distance — acceptable as a relative
			// ordering heuristic at city scale, and scheduled for replacement
			// by true street-graph routing (roadmap commit 4). All *movement*
			// arithmetic below is geodesic metres.
			if (targetShelter != null) {
				double minStreetDist = Double.MAX_VALUE;
				Geometry closestStreetGeom = null;
				PortlandStreet currentSelectedStreet = null;

				for (Object obj : context.getObjects(PortlandStreet.class)) {
					PortlandStreet street = (PortlandStreet) obj;

					if (street == lastVisitedStreet) {
						continue;
					}

					Geometry streetGeom = geography.getGeometry(street);
					double distToStreet = myPoint.distance(streetGeom);

					if (distToStreet < minStreetDist) {
						minStreetDist = distToStreet;
						closestStreetGeom = streetGeom;
						currentSelectedStreet = street;
					}
				}

				if (closestStreetGeom != null) {
					lastVisitedStreet = currentSelectedStreet;
					currentPathCoords = new ArrayList<Coordinate>();

					Coordinate[] coords = closestStreetGeom.getCoordinates();
					Point shelterPoint = (Point) geography.getGeometry(targetShelter);

					double startDistToShelter = geodesicDistanceM(coords[0], shelterPoint.getCoordinate());
					double endDistToShelter = geodesicDistanceM(coords[coords.length - 1], shelterPoint.getCoordinate());

					if (startDistToShelter > endDistToShelter) {
						for (int i = 0; i < coords.length; i++) {
							currentPathCoords.add(coords[i]);
						}
					} else {
						for (int i = coords.length - 1; i >= 0; i--) {
							currentPathCoords.add(coords[i]);
						}
					}
					currentPathIndex = 0;
				}
			}
		}

		// Travel along the street's coordinate path array
		if (currentPathCoords != null && !currentPathCoords.isEmpty()) {
			Coordinate nextTargetCoord = currentPathCoords.get(currentPathIndex);

			double distanceToNextNodeM = geodesicDistanceM(myCoord, nextTargetCoord);

			if (distanceToNextNodeM < stepLengthM) {
				currentPathIndex++;

				if (currentPathIndex >= currentPathCoords.size()) {
					Point shelterPoint = (Point) geography.getGeometry(targetShelter);

					if (geodesicDistanceM(myCoord, shelterPoint.getCoordinate()) < shelterArrivalDistanceM) {
						System.out.println(this.toString() + " reached destination shelter via street lines and exited.");
						context.remove(this);
					} else {
						targetShelter = null;
						currentPathCoords = null;
					}
					return;
				}
				nextTargetCoord = currentPathCoords.get(currentPathIndex);
			}

			// Walk stepLengthM metres along the geodesic toward the next
			// street vertex (GeographicLib direct problem).
			GeodesicData toTarget = Geodesic.WGS84.Inverse(myCoord.y, myCoord.x,
					nextTargetCoord.y, nextTargetCoord.x);
			GeodesicData moved = Geodesic.WGS84.Direct(myCoord.y, myCoord.x,
					toTarget.azi1, stepLengthM);

			geography.move(this, fac.createPoint(new Coordinate(moved.lon2, moved.lat2)));
			distanceTraveledM += stepLengthM;
		} else if (targetShelter != null) {
			context.remove(this);
		}
	}

	public String getName() {
		return name;
	}

	/** Cumulative geodesic metres walked since the run began (V9). */
	public double getDistanceTraveledM() {
		return distanceTraveledM;
	}

	@Override
	public String toString(){
		return name;
	}
}
