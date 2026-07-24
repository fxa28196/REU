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
 * Agents are never removed from the context: every resident persists to the
 * end of the run carrying an explicit outcome {@link State}
 * (EN_ROUTE / SHELTERED / UNREACHABLE), so exposure accumulation and
 * end-of-run outcome logging can account for the whole population — silent
 * removal on arrival/failure was the model's largest transparency defect
 * (PROJECT_ASSESSMENT.md, risk 2).
 */
public class GisAgent {

	/**
	 * Outcome state vocabulary (PROJECT_ASSESSMENT.md Phase 5 schema).
	 * REFUSED_ALL_FULL joins when shelter capacity is enforced (commit 6).
	 */
	public enum State {
		/** Walking its routed path toward the chosen shelter. */
		EN_ROUTE,
		/** Arrived at its shelter; remains there for the rest of the run. */
		SHELTERED,
		/** No shelter reachable from its start node on the street graph. */
		UNREACHABLE
	}

	private final String name;
	private final StreetNetwork network;
	private final long startNodeId;

	private State state = State.EN_ROUTE;
	/** Tick at which the agent became SHELTERED (NaN until then). */
	private double arrivalTick = Double.NaN;

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
		if (state != State.EN_ROUTE) {
			return; // terminal-for-now states persist in place
		}

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
			// The agent persists in place so its (maximal) exposure still
			// counts in every outcome metric.
			state = State.UNREACHABLE;
			System.out.println(name + " cannot reach any shelter via the street network; state=UNREACHABLE.");
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
			state = State.SHELTERED;
			arrivalTick = RunEnvironment.getInstance().getCurrentSchedule().getTickCount();
			if (dShelterM < shelterArrivalDistanceM) {
				System.out.println(name + " reached destination shelter via street lines; state=SHELTERED at tick "
						+ (long) arrivalTick + ".");
			} else {
				// Shelter farther from its snapped node than the arrival
				// radius - flag loudly; should not occur with node-snapped
				// shelters.
				System.out.println(name + " ended route " + String.format("%.0f", dShelterM)
						+ " m from shelter " + targetShelter.getId() + "; state=SHELTERED (flagged).");
			}
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

	/** Current outcome state (never null; EN_ROUTE until arrival/failure). */
	public State getState() {
		return state;
	}

	/** Tick at which the agent became SHELTERED (NaN if it never arrived). */
	public double getArrivalTick() {
		return arrivalTick;
	}

	/** Shelter this agent selected (null until routed, or if unreachable). */
	public Shelter getTargetShelter() {
		return targetShelter;
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
