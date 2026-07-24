package geography.agents;

import java.util.List;

import net.sf.geographiclib.Geodesic;
import net.sf.geographiclib.GeodesicData;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;

import geography.routing.StreetNetwork;

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
 * Movement model (documented in docs/science/VARIABLES.md): on its first
 * active tick the resident selects the shelter with the smallest
 * street-network distance from its starting node — "the nearest shelter you
 * can actually reach" — by looking up its node in each shelter's Dijkstra
 * shortest-path tree, and reconstructs the corresponding walking path. Each
 * tick it then advances {@code walkingSpeedMps * 60 * minutesPerTick} metres
 * of arc length along that path (geodesic metres on the WGS84 ellipsoid,
 * GeographicLib).
 *
 * Remaining limitation tracked in PROJECT_ASSESSMENT.md (roadmap commit 5):
 * the agent still removes itself from the context both on arrival and when
 * no shelter is reachable, which destroys outcome measurement; commit 5
 * replaces removal with explicit persistent states.
 */
public class GisAgent {

	private final String name;
	private final StreetNetwork network;
	private final long startNodeId;

	private Shelter targetShelter = null;
	/** Walking path (start node -> shelter node), set once on first step. */
	private List<Coordinate> routePath = null;
	/** Next path vertex to reach. */
	private int pathIndex = 0;
	private boolean routed = false;

	/** V11: street-network metres to the chosen shelter at selection time. */
	private double networkDistToShelterM = Double.NaN;
	/** V9: cumulative geodesic metres walked. */
	private double distanceTraveledM = 0;

	public GisAgent(String name, StreetNetwork network, long startNodeId) {
		this.name = name;
		this.network = network;
		this.startNodeId = startNodeId;
	}

	@ScheduledMethod(start = 1, interval = 1)
	public void step() {
		Context context = ContextUtils.getContext(this);
		Geography geography = (Geography) context.getProjection("Geography");

		Parameters params = RunEnvironment.getInstance().getParameters();
		double minutesPerTick = (Double) params.getValue("minutesPerTick");
		double walkingSpeedMps = (Double) params.getValue("walkingSpeedMps");
		double shelterArrivalDistanceM = (Double) params.getValue("shelterArrivalDistanceM");
		double stepLengthM = walkingSpeedMps * 60.0 * minutesPerTick;

		if (!routed) {
			chooseNetworkNearestShelter(context);
			routed = true;
		}

		if (routePath == null) {
			// No shelter reachable from this start node on the street graph.
			// Roadmap commit 5 turns this into a logged UNREACHABLE state.
			System.out.println(name + " cannot reach any shelter via the street network; removed.");
			context.remove(this);
			return;
		}

		GeometryFactory fac = new GeometryFactory();
		Point myPoint = (Point) geography.getGeometry(this);
		Coordinate current = myPoint.getCoordinate();

		// Advance up to stepLengthM metres of arc length along the path,
		// consuming vertices exactly (no overshoot).
		double remainingM = stepLengthM;
		while (remainingM > 0 && pathIndex < routePath.size()) {
			Coordinate next = routePath.get(pathIndex);
			double dM = StreetNetwork.geodesicDistanceM(current, next);
			if (dM <= remainingM) {
				current = next;
				pathIndex++;
				remainingM -= dM;
			} else {
				GeodesicData toNext = Geodesic.WGS84.Inverse(current.y, current.x, next.y, next.x);
				GeodesicData moved = Geodesic.WGS84.Direct(current.y, current.x, toNext.azi1, remainingM);
				current = new Coordinate(moved.lon2, moved.lat2);
				remainingM = 0;
			}
		}
		distanceTraveledM += stepLengthM - remainingM;
		geography.move(this, fac.createPoint(current));

		if (pathIndex >= routePath.size()) {
			// Path exhausted: we are standing on the shelter's street node.
			Point shelterPoint = (Point) geography.getGeometry(targetShelter);
			double dShelterM = StreetNetwork.geodesicDistanceM(current, shelterPoint.getCoordinate());
			if (dShelterM < shelterArrivalDistanceM) {
				System.out.println(name + " reached destination shelter via street lines and exited.");
			} else {
				// Shelter farther from its snapped node than the arrival
				// radius - flag loudly; should not occur with node-snapped
				// shelters.
				System.out.println(name + " ended route " + String.format("%.0f", dShelterM)
						+ " m from shelter " + targetShelter.getId() + "; removed.");
			}
			context.remove(this);
		}
	}

	/**
	 * Picks the shelter with minimum street-network distance from this
	 * agent's start node (slide 7: nearest shelter you can actually reach)
	 * and materializes the walking path from that shelter's Dijkstra tree.
	 */
	private void chooseNetworkNearestShelter(Context context) {
		double bestDistM = Double.POSITIVE_INFINITY;
		Shelter best = null;
		for (Object obj : context.getObjects(Shelter.class)) {
			Shelter shelter = (Shelter) obj;
			if (shelter.getRouteTree() == null) {
				continue;
			}
			double dM = shelter.getRouteTree().distanceTo(startNodeId);
			if (dM < bestDistM) {
				bestDistM = dM;
				best = shelter;
			}
		}
		if (best != null && !Double.isInfinite(bestDistM)) {
			targetShelter = best;
			networkDistToShelterM = bestDistM;
			routePath = network.pathToSource(best.getRouteTree(), startNodeId);
			pathIndex = 0;
		}
	}

	public String getName() {
		return name;
	}

	/** V9: cumulative geodesic metres walked since the run began. */
	public double getDistanceTraveledM() {
		return distanceTraveledM;
	}

	/** V11: network metres to the chosen shelter at selection time (NaN if none). */
	public double getNetworkDistToShelterM() {
		return networkDistToShelterM;
	}

	@Override
	public String toString(){
		return name;
	}
}
