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
 * (V12). A resident refused at a full shelter <b>remains at that shelter's
 * street node and plans its next leg from there</b> — never back toward its
 * encampment (assumption A-17; docs/science/phase2-human-agents/
 * 10-FAILURE-MODES.md Finding A). Refused-everywhere or unreachable residents
 * persist in place.
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

	// ---- THREE DISTINCT QUANTITIES, DELIBERATELY NOT MIXED ------------------
	// 1. EXPOSURE  (exposureUgM3h)  = SUM C(t)*dt              [ug/m3 * h]
	//    Environmental concentration-time. Physics of the AIR. Verified against
	//    raw EPA AQS data to a ratio of 1.0000. Untouched by this block.
	// 2. INHALED DOSE (inhaledDoseUg) = SUM C(t)*IR(activity)*dt   [ug]
	//    Physics of the PERSON: how much particulate mass actually entered the
	//    airway. Differs from exposure only by ventilation rate, which depends
	//    on ACTIVITY (walking vs waiting), not on diagnosis.
	// 3. HEALTH RISK (healthRiskMultiplier) = a susceptibility weight.
	//    Biology. Currently 1.0 for everyone because no defensible
	//    population-specific coefficient exists (A-09, A-22). The slot exists so
	//    that risk can never be silently folded into dose.
	// The cardinal rule: ventilation is PHYSICS and may vary with activity;
	// susceptibility is BIOLOGY and stays out of the dose term entirely.

	/** Ventilation while walking, m3/h. Activity-level inhalation rate for adults
	 *  at moderate intensity, U.S. EPA Exposure Factors Handbook (2011) Ch. 6.
	 *  Comfortable walking (~1.3 m/s, ~3.3 METs) sits at the light/moderate
	 *  boundary; the moderate cell is used because evacuation walking is
	 *  sustained and often loaded.
	 *  <b>Class L, VERIFIED-IN-SECONDARY</b> — the EFH table cell was not
	 *  re-read from the primary during this implementation, so the value carries
	 *  a sweep range and must be confirmed before publication. Sweep 1.2-2.0. */
	public static final double INHALATION_WALKING_M3H = 1.62;

	/** Ventilation while outdoors but not walking (awaiting the smoke trigger, or
	 *  stranded after refusal), m3/h. Light-activity adult cell, same source and
	 *  same caveat. Sweep 0.4-0.8. */
	public static final double INHALATION_RESTING_M3H = 0.61;

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

	/** WGS84 coordinates of the real encampment report this resident starts at.
	 *  Recorded so every result row carries the actual start location, not just
	 *  the encampment id: the demand geography is an input the reader must be
	 *  able to audit without re-joining to the campsite file. NaN until set. */
	private double startLon = Double.NaN;
	private double startLat = Double.NaN;
	private final SmokeField smokeField;

	private State state = State.PRE_EVAC;
	private double arrivalTick = Double.NaN;
	private double evacuationTick = Double.NaN;  // tick the smoke evacuation trigger fired

	private Shelter targetShelter = null;
	private List<Coordinate> routePath = null;
	private int pathIndex = 0;
	/** Street-graph node the next route leg is planned FROM: the start node
	 *  until the first capacity refusal, thereafter the node of the shelter
	 *  that refused this resident (A-17 — re-route from the current position,
	 *  never from the immutable start node). */
	private long currentNodeId;
	private int retargetCount = 0;
	private static final int MAX_RETARGETS = 8;

	// Vulnerability modifiers (V2/V4). Default 1.0 = no weighting; see class doc.
	private double ageRR = 1.0;
	private double comorbidityRR = 1.0;

	/** Heterogeneous attributes (V18–V22), null when heterogeneity is disabled —
	 *  in which case this resident walks at the run-wide {@code walkingSpeedMps}
	 *  parameter and exports empty attribute columns, exactly as before. */
	private PopulationSampler.Attributes attributes = null;

	// Exported scientific quantities -----------------------------------------
	private double networkDistToShelterM = Double.NaN;  // V11
	private double distanceTraveledM = 0;               // V9
	/** Sum of the network lengths of every planned route leg (initial selection
	 *  plus any post-refusal re-routes). QC quantity for the walked-vs-planned
	 *  failing check (A-17): walked distance must not exceed the snap gap plus
	 *  this total. Not a scientific variable — derived bookkeeping only. */
	private double plannedRouteM = 0;
	/** Off-network metres between where the resident stood and the first
	 *  waypoint of each newly planned leg: the encampment→street snap gap on
	 *  the first leg (can reach hundreds of metres for campsites far from a
	 *  mapped street), a polyline endpoint gap (≤ ~12 m) after a refusal.
	 *  Real walked metres, accumulated so the A-17 check is exact. */
	private double snapGapM = 0;
	private double exposureUgM3h = 0;                   // V6 cumulative raw exposure
	private double vweUgM3h = 0;                        // V7 vulnerability-weighted
	private double exposureWhileTravelingUgM3h = 0;     // exposure accrued EN_ROUTE
	private double hoursAboveUnhealthy = 0;             // V8
	/** V25 — inhaled PM2.5 mass, µg. Exposure weighted by activity-dependent
	 *  ventilation. NOT weighted by any health characteristic. */
	private double inhaledDoseUg = 0;
	/** Ventilation-weighted hours outdoors, m3 of air breathed. Exported so the
	 *  dose can be decomposed into concentration and volume by a reviewer. */
	private double airVolumeBreathedM3 = 0;
	private double peakConcUgM3 = 0;
	private double outdoorHours = 0;                    // total hours outdoors (for average PM2.5 reporting)

	public GisAgent(String name, StreetNetwork network, long startNodeId,
			String encampmentId, SmokeField smokeField) {
		this.name = name;
		this.network = network;
		this.startNodeId = startNodeId;
		this.currentNodeId = startNodeId;
		this.encampmentId = encampmentId;
		this.smokeField = smokeField;
	}

	@ScheduledMethod(start = 1, interval = 1)
	public void step() {
		Context context = ContextUtils.getContext(this);
		Geography geography = (Geography) context.getProjection("Geography");

		Parameters params = RunEnvironment.getInstance().getParameters();
		double minutesPerTick = (Double) params.getValue("minutesPerTick");
		// Per-agent speed when heterogeneity is enabled (V10 revised: Bohannon &
		// Williams Andrews 2011 age×sex means, or Boyce 1999 by replacement for
		// mobility-limited residents); otherwise the run-wide constant.
		double walkingSpeedMps = (attributes != null)
				? attributes.walkingSpeedMps
				: (Double) params.getValue("walkingSpeedMps");
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
			// Inhaled dose: ventilation depends on ACTIVITY only. A resident who
			// is walking breathes more air than one waiting, so inhales more
			// particulate from the same concentration. No health attribute
			// enters here - susceptibility is applied downstream, if ever.
			double ventilationM3h = (state == State.EN_ROUTE)
					? INHALATION_WALKING_M3H : INHALATION_RESTING_M3H;
			airVolumeBreathedM3 += ventilationM3h * dtHours;
			inhaledDoseUg += c * ventilationM3h * dtHours;
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
			// Departure requires BOTH the smoke trigger and somewhere open to walk
			// to. With the opening-date gate enabled this is the A-02 mitigation:
			// the real shelters opened on Sept 10-11, days after the first
			// threshold crossing, so residents cannot arrive before a door exists
			// to arrive at. With the gate disabled every shelter is open from tick
			// 0 and this reduces to the previous smoke-only trigger.
			if (cNow >= evacThreshold && anyShelterOpen(context, tick)) {
				state = State.EN_ROUTE;
				evacuationTick = tick;
			} else {
				return; // still waiting outdoors; exposure already accrued above
			}
		}

		// REFUSED_ALL_FULL means "no shelter is available to me RIGHT NOW". Once
		// shelters open on different real dates (OCC 2020-09-10, CJ 2020-09-11)
		// that is no longer a permanent condition: a resident turned away from
		// the only open shelter must be able to try the second when it opens.
		// Treating it as terminal left CJ's 99 real beds entirely unused.
		// It is re-evaluated each tick and is final only at end of run.
		// This cannot livelock: capacity never increases (no departures are
		// modelled) and each shelter opens once, so re-entry is bounded by the
		// number of opening events.
		if (state == State.REFUSED_ALL_FULL) {
			if (!anyShelterAvailable(context, tick)) {
				return; // still nowhere to go; keeps accruing exposure outdoors
			}
			state = State.EN_ROUTE;
			retargetCount = 0;
			targetShelter = null;
			routePath = null;
			pathIndex = 0;
		}

		if (state != State.EN_ROUTE) {
			return; // terminal states persist in place (still accruing if outside)
		}

		// --- Routing (capacity-aware) ---------------------------------------
		if (routePath == null) {
			chooseNetworkNearestShelter(context, tick);
			if (routePath == null) {
				// state was set by chooseNetworkNearestShelter (UNREACHABLE or
				// REFUSED_ALL_FULL); the agent persists and keeps accruing.
				return;
			}
			Point here = (Point) geography.getGeometry(this);
			snapGapM += StreetNetwork.geodesicDistanceM(here.getCoordinate(), routePath.get(0));
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
			if (targetShelter.isOpenAt(tick) && targetShelter.admit()) {
				state = State.SHELTERED;
				arrivalTick = tick;
			} else {
				// Filled since selection: the resident REMAINS at this
				// shelter's street node and re-plans from there next tick,
				// excluding full shelters (A-17 / Finding A: never re-plan
				// from the immutable start node — that walked refused agents
				// back to their encampment, inflating distance and dose).
				// Bounded to avoid livelock.
				currentNodeId = targetShelter.getGraphNodeId();
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
	 * this agent's CURRENT node ({@link #currentNodeId} — the start node
	 * before any refusal, the refusing shelter's node after one; A-17) that
	 * still has capacity, and materialises the walking path from that
	 * shelter's Dijkstra tree. Sets a terminal state if none qualifies:
	 * REFUSED_ALL_FULL if reachable shelters exist but are all full,
	 * otherwise UNREACHABLE.
	 */
	private void chooseNetworkNearestShelter(Context context, double tick) {
		double bestDistM = Double.POSITIVE_INFINITY;
		Shelter best = null;
		boolean anyReachable = false;

		for (Object obj : context.getObjects(Shelter.class)) {
			Shelter shelter = (Shelter) obj;
			if (!shelter.isOperating() || !shelter.isOpenAt(tick)
					|| shelter.getRouteTree() == null) {
				continue;
			}
			double dM = shelter.getRouteTree().distanceTo(currentNodeId);
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
			if (Double.isNaN(networkDistToShelterM)) {
				// V11 keeps its documented meaning — network distance from the
				// STARTING node to the first shelter selected ("the nearest
				// shelter you can actually reach"). Post-refusal legs do not
				// overwrite it; total planned walking is plannedRouteM.
				networkDistToShelterM = bestDistM;
			}
			plannedRouteM += bestDistM;
			routePath = network.pathToSource(best.getRouteTree(), currentNodeId);
			pathIndex = 0;
		} else if (anyReachable) {
			state = State.REFUSED_ALL_FULL;
		} else {
			state = State.UNREACHABLE;
		}
	}

	/** True if at least one operating shelter is open at this tick. Cheap: the
	 *  scenario has three shelters. */
	private static boolean anyShelterOpen(Context context, double tick) {
		for (Object obj : context.getObjects(Shelter.class)) {
			Shelter shelter = (Shelter) obj;
			if (shelter.isOperating() && shelter.isOpenAt(tick)) {
				return true;
			}
		}
		return false;
	}

	/** True if some operating shelter is open, has space, and is reachable from
	 *  where this resident currently stands — i.e. it is worth setting out. */
	private boolean anyShelterAvailable(Context context, double tick) {
		for (Object obj : context.getObjects(Shelter.class)) {
			Shelter shelter = (Shelter) obj;
			if (shelter.isAvailableAt(tick) && shelter.getRouteTree() != null
					&& !Double.isInfinite(shelter.getRouteTree().distanceTo(currentNodeId))) {
				return true;
			}
		}
		return false;
	}

	// --- Vulnerability setters (used by ContextCreator once sourced) ---------
	public void setAgeRR(double ageRR) { this.ageRR = ageRR; }
	public void setComorbidityRR(double comorbidityRR) { this.comorbidityRR = comorbidityRR; }
	public void setAttributes(PopulationSampler.Attributes attributes) { this.attributes = attributes; }
	/** Sampled heterogeneous attributes, or null when heterogeneity is disabled. */
	public PopulationSampler.Attributes getAttributes() { return attributes; }
	/** Speed this resident actually walks at (m/s): its own when heterogeneity is
	 *  enabled, otherwise NaN meaning "the run-wide parameter applies". */
	public double getPersonalWalkingSpeedMps() {
		return attributes == null ? Double.NaN : attributes.walkingSpeedMps;
	}

	// --- Accessors for export (geography.output.OutcomeLogger) ---------------
	public String getName() { return name; }
	public String getEncampmentId() { return encampmentId; }
	public long getStartNodeId() { return startNodeId; }

	/** Records where this resident actually started, in WGS84. Called once at
	 *  construction time by ContextCreator; no random draws, no effect on
	 *  movement or exposure — this is provenance, not behaviour. */
	public void setStartCoord(double lon, double lat) {
		this.startLon = lon;
		this.startLat = lat;
	}
	public double getStartLon() { return startLon; }
	public double getStartLat() { return startLat; }
	public State getState() { return state; }
	public double getArrivalTick() { return arrivalTick; }
	public double getEvacuationTick() { return evacuationTick; }
	public Shelter getTargetShelter() { return targetShelter; }
	public double getNetworkDistToShelterM() { return networkDistToShelterM; }
	public double getDistanceTraveledM() { return distanceTraveledM; }
	public double getPlannedRouteM() { return plannedRouteM; }
	public double getSnapGapM() { return snapGapM; }
	/** Number of capacity refusals this resident experienced at a shelter door. */
	public int getRetargetCount() { return retargetCount; }
	public double getExposureUgM3h() { return exposureUgM3h; }
	public double getVweUgM3h() { return vweUgM3h; }
	public double getExposureWhileTravelingUgM3h() { return exposureWhileTravelingUgM3h; }
	public double getHoursAboveUnhealthy() { return hoursAboveUnhealthy; }
	/** V25 — inhaled PM2.5 mass in µg (activity-weighted, NOT health-weighted). */
	public double getInhaledDoseUg() { return inhaledDoseUg; }
	/** Total air volume breathed outdoors, m3. */
	public double getAirVolumeBreathedM3() { return airVolumeBreathedM3; }
	/** Mean ventilation rate actually realised, m3/h — makes the dose auditable. */
	public double getMeanVentilationM3h() {
		return outdoorHours > 0 ? airVolumeBreathedM3 / outdoorHours : Double.NaN;
	}
	/**
	 * Susceptibility weight applied to inhaled dose to obtain health risk.
	 * <b>Returns 1.0 for every resident.</b> This is deliberate and is the
	 * structural guarantee that biology is never folded into the physics: no
	 * defensible person-level susceptibility coefficient exists for this
	 * population (A-09, A-22; docs/final/HEALTH_MODEL_AUDIT.md). The method
	 * exists so a sourced coefficient has exactly one place to land, and so a
	 * reader can see that risk weighting is switched off rather than absent.
	 */
	public double getHealthRiskMultiplier() { return 1.0; }
	/** Health-risk score = inhaled dose × susceptibility weight. Numerically
	 *  identical to inhaled dose while the weight is 1.0, by design. */
	public double getHealthRiskScore() { return inhaledDoseUg * getHealthRiskMultiplier(); }
	public double getPeakConcUgM3() { return peakConcUgM3; }
	public double getOutdoorHours() { return outdoorHours; }
	public double getAgeRR() { return ageRR; }
	public double getComorbidityRR() { return comorbidityRR; }

	@Override
	public String toString() { return name; }
}
