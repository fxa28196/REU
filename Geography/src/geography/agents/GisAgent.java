package geography.agents;

import java.util.List;

import net.sf.geographiclib.Geodesic;
import net.sf.geographiclib.GeodesicData;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;

import geography.env.SmokeField;
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
 * <p><b>Movement</b> (docs/science/DESIGN_SPEC.md, VARIABLES.md): each active
 * tick the resident walks {@code walkingSpeedMps · 60 · minutesPerTick} metres
 * of geodesic arc length along a shortest street-network path toward the
 * network-nearest shelter that still has capacity; on arrival it is admitted
 * (V12). Refused or unreachable residents persist in place.
 *
 * <p><b>Exposure</b> (V6/V7/V8): each tick while the resident is OUTSIDE (any
 * non-sheltered state) it accrues PM2.5 exposure from the {@link SmokeField}.
 * <b>Arrival at a shelter is the study endpoint</b> and terminates exposure
 * accumulation for that resident (DESIGN_SPEC "Study endpoint"); residents who
 * never reach shelter (UNREACHABLE / REFUSED_ALL_FULL) remain outside and keep
 * accruing for the whole event. Shelter benefit is therefore the reduction of
 * outdoor exposure TIME through better placement and accessibility — not indoor
 * filtration, which this study deliberately does not model. Vulnerability-
 * weighted exposure multiplies by RR_age and RR_comorbidity — both default to
 * 1.0 because the slide-cited values are unverified (DATA_SOURCES D5/D6).
 *
 * <p>All scientific quantities on this agent are exposed via getters and
 * exported per-agent by {@code geography.output.OutcomeLogger}. Nothing
 * important lives only in memory.
 */
public class GisAgent {

	/** Person-hours are counted above this PM2.5 concentration (µg/m³): the EPA
	 *  "Unhealthy" AQI breakpoint lower bound, stable across the pre/post-2024
	 *  tables (DATA_SOURCES D9). This is a concentration threshold, not the
	 *  24-hour-average AQI category. */
	public static final double UNHEALTHY_UGM3 = 55.5;

	/** Outcome state (docs/science/DESIGN_SPEC.md Decision 3). */
	public enum State {
		PRE_EVAC,          // sheltering in place at the encampment, awaiting the smoke trigger
		EN_ROUTE,          // walking toward a shelter
		SHELTERED,         // admitted; remains for the rest of the run
		UNREACHABLE,       // no shelter reachable on the street graph
		REFUSED_ALL_FULL   // every reachable operating shelter was at capacity
	}

	private final String name;
	private final StreetNetwork network;
	private final long startNodeId;
	private final String encampmentId;
	private final SmokeField smokeField;

	private State state = State.PRE_EVAC;
	private double arrivalTick = Double.NaN;
	private double evacuationTick = Double.NaN;  // tick the smoke evacuation trigger fired

	private Shelter targetShelter = null;
	private List<Coordinate> routePath = null;
	private int pathIndex = 0;
	private int retargetCount = 0;
	private static final int MAX_RETARGETS = 8;

	// Vulnerability modifiers (V2/V4). Default 1.0 = no weighting; see class doc.
	private double ageRR = 1.0;
	private double comorbidityRR = 1.0;

	// Exported scientific quantities -----------------------------------------
	private double networkDistToShelterM = Double.NaN;  // V11
	private double distanceTraveledM = 0;               // V9
	private double exposureUgM3h = 0;                   // V6 cumulative raw exposure
	private double vweUgM3h = 0;                        // V7 vulnerability-weighted
	private double exposureWhileTravelingUgM3h = 0;     // exposure accrued EN_ROUTE
	private double hoursAboveUnhealthy = 0;             // V8
	private double peakConcUgM3 = 0;
	private double outdoorHours = 0;                    // total hours outdoors (for average PM2.5 reporting)

	public GisAgent(String name, StreetNetwork network, long startNodeId,
			String encampmentId, SmokeField smokeField) {
		this.name = name;
		this.network = network;
		this.startNodeId = startNodeId;
		this.encampmentId = encampmentId;
		this.smokeField = smokeField;
	}

	@ScheduledMethod(start = 1, interval = 1)
	public void step() {
		Context context = ContextUtils.getContext(this);
		Geography geography = (Geography) context.getProjection("Geography");

		Parameters params = RunEnvironment.getInstance().getParameters();
		double minutesPerTick = (Double) params.getValue("minutesPerTick");
		double walkingSpeedMps = (Double) params.getValue("walkingSpeedMps");
		double tick = RunEnvironment.getInstance().getCurrentSchedule().getTickCount();
		double dtHours = minutesPerTick / 60.0;

		// --- Exposure accrues while OUTSIDE; arrival at shelter is the study
		// endpoint and stops it (DESIGN_SPEC "Study endpoint"). SHELTERED
		// residents accrue nothing further; EN_ROUTE, UNREACHABLE and
		// REFUSED_ALL_FULL residents are all still outside and keep accruing.
		if (smokeField != null && state != State.SHELTERED) {
			double c = smokeField.concentrationForTick(tick, minutesPerTick);
			exposureUgM3h += c * dtHours;
			vweUgM3h += c * ageRR * comorbidityRR * dtHours;
			if (state == State.EN_ROUTE) {
				exposureWhileTravelingUgM3h += c * dtHours;
			}
			if (c > UNHEALTHY_UGM3) {
				hoursAboveUnhealthy += dtHours;
			}
			if (c > peakConcUgM3) {
				peakConcUgM3 = c;
			}
			outdoorHours += dtHours;
		}

		// PRE_EVAC: shelter in place at the encampment, accruing outdoor
		// exposure, until local PM2.5 crosses the evacuation threshold (default
		// the EPA "Unhealthy" AQI breakpoint 55.5 µg/m³ — a sourced value,
		// DATA_SOURCES D9), then begin evacuating. This ties evacuation to the
		// smoke event rather than assuming everyone leaves at t0 (AUDIT.md #1).
		if (state == State.PRE_EVAC) {
			double evacThreshold = (Double) params.getValue("evacuationThresholdUgM3");
			double cNow = (smokeField == null) ? 0.0
					: smokeField.concentrationForTick(tick, minutesPerTick);
			if (cNow >= evacThreshold) {
				state = State.EN_ROUTE;
				evacuationTick = tick;
			} else {
				return; // still waiting outdoors; exposure already accrued above
			}
		}

		if (state != State.EN_ROUTE) {
			return; // terminal states persist in place (still accruing if outside)
		}

		// --- Routing (capacity-aware) ---------------------------------------
		if (routePath == null) {
			chooseNetworkNearestShelter(context);
			if (routePath == null) {
				// state was set by chooseNetworkNearestShelter (UNREACHABLE or
				// REFUSED_ALL_FULL); the agent persists and keeps accruing.
				return;
			}
		}

		GeometryFactory fac = new GeometryFactory();
		Point myPoint = (Point) geography.getGeometry(this);
		Coordinate current = myPoint.getCoordinate();

		double stepLengthM = walkingSpeedMps * 60.0 * minutesPerTick;
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
			// Reached the shelter's street node: request admission (V12).
			if (targetShelter.admit()) {
				state = State.SHELTERED;
				arrivalTick = tick;
			} else {
				// Filled since selection: drop this target and re-select next
				// tick, excluding full shelters. Bounded to avoid livelock.
				targetShelter = null;
				routePath = null;
				pathIndex = 0;
				retargetCount++;
				if (retargetCount > MAX_RETARGETS) {
					state = State.REFUSED_ALL_FULL;
				}
			}
		}
	}

	/**
	 * Picks the operating shelter with minimum street-network distance from
	 * this agent's start node that still has capacity, and materialises the
	 * walking path from that shelter's Dijkstra tree. Sets a terminal state if
	 * none qualifies: REFUSED_ALL_FULL if reachable shelters exist but are all
	 * full, otherwise UNREACHABLE.
	 */
	private void chooseNetworkNearestShelter(Context context) {
		double bestDistM = Double.POSITIVE_INFINITY;
		Shelter best = null;
		boolean anyReachable = false;

		for (Object obj : context.getObjects(Shelter.class)) {
			Shelter shelter = (Shelter) obj;
			if (!shelter.isOperating() || shelter.getRouteTree() == null) {
				continue;
			}
			double dM = shelter.getRouteTree().distanceTo(startNodeId);
			if (Double.isInfinite(dM)) {
				continue;
			}
			anyReachable = true;
			if (shelter.hasSpace() && dM < bestDistM) {
				bestDistM = dM;
				best = shelter;
			}
		}

		if (best != null) {
			targetShelter = best;
			networkDistToShelterM = bestDistM;
			routePath = network.pathToSource(best.getRouteTree(), startNodeId);
			pathIndex = 0;
		} else if (anyReachable) {
			state = State.REFUSED_ALL_FULL;
		} else {
			state = State.UNREACHABLE;
		}
	}

	// --- Vulnerability setters (used by ContextCreator once sourced) ---------
	public void setAgeRR(double ageRR) { this.ageRR = ageRR; }
	public void setComorbidityRR(double comorbidityRR) { this.comorbidityRR = comorbidityRR; }

	// --- Accessors for export (geography.output.OutcomeLogger) ---------------
	public String getName() { return name; }
	public String getEncampmentId() { return encampmentId; }
	public long getStartNodeId() { return startNodeId; }
	public State getState() { return state; }
	public double getArrivalTick() { return arrivalTick; }
	public double getEvacuationTick() { return evacuationTick; }
	public Shelter getTargetShelter() { return targetShelter; }
	public double getNetworkDistToShelterM() { return networkDistToShelterM; }
	public double getDistanceTraveledM() { return distanceTraveledM; }
	public double getExposureUgM3h() { return exposureUgM3h; }
	public double getVweUgM3h() { return vweUgM3h; }
	public double getExposureWhileTravelingUgM3h() { return exposureWhileTravelingUgM3h; }
	public double getHoursAboveUnhealthy() { return hoursAboveUnhealthy; }
	public double getPeakConcUgM3() { return peakConcUgM3; }
	public double getOutdoorHours() { return outdoorHours; }
	public double getAgeRR() { return ageRR; }
	public double getComorbidityRR() { return comorbidityRR; }

	@Override
	public String toString() { return name; }
}
