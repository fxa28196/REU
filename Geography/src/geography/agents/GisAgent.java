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

	/** Outcome state (docs/science/DESIGN_SPEC.md Decision 3; Phase E states in
	 *  E-LAYER-SPEC.md §5).
	 *
	 *  <p><b>Phase-E mapping (deliberate):</b> the spec's AWARE_IDLE state is
	 *  represented by {@code PRE_EVAC} — an aware resident waiting at its
	 *  encampment is exactly what PRE_EVAC always meant, and reusing it keeps the
	 *  exported {@code final_state} vocabulary byte-identical in the R3 null run
	 *  (where everyone is aware). Only {@code UNAWARE} is new, and it appears in
	 *  output only when {@code pAwareInit < 1}. The spec's ARRIVED_FULL maps onto
	 *  the existing refusal-at-door mechanic rather than a new enum value. */
	public enum State {
		PRE_EVAC,          // aware, sheltering in place at the encampment (spec: AWARE_IDLE)
		EN_ROUTE,          // walking toward a shelter
		SHELTERED,         // admitted; remains for the rest of the run
		UNREACHABLE,       // no shelter reachable on the street graph
		REFUSED_ALL_FULL,  // every reachable operating shelter was at capacity
		UNAWARE            // Phase E: does not know shelters exist (V29); in place, accruing
	}

	/** Phase-E decision-layer configuration (V35–V44), shared by every agent in
	 *  a run. {@code null} on every agent unless {@code enableDecisionLayer=1},
	 *  in which case ContextCreator builds one instance from the batch params and
	 *  hands it to each agent alongside its sampled
	 *  {@link ELayerSampler.DecisionAttributes}. All fields are read-only. */
	public static final class DecisionConfig {
		/** 0 = L0 omniscient (legacy choice incl. live-occupancy pre-filter);
		 *  1 = L1 locations-only (fullness discovered at the door). V42. */
		public final int informationRegime;
		/** 1 = logistic hazard departure (V36–V40); 0 = legacy 55.5 latch. */
		public final int enableHazardDeparture;
		public final double alphaHazard;        // V38
		public final double bRisk;              // V36
		public final double wOfficial;          // V37
		public final double gammaVuln;          // V39
		public final double sigmaTheta;         // V35
		public final double riskHalfLifeH;      // V36
		public final double lambdaOutreachPerDay; // V41
		public final double barrierBelongings;  // V40
		public final double barrierPet;         // V40
		public final double barrierDependents;  // V40
		/** TRUE = sites with unrecorded pet policy admit pets; FALSE = refuse
		 *  (the conservative A-29 default for baseline-real arms). */
		public final boolean petPolicyAdmitDefault;
		public final double betaTravelTime;     // V43
		public final double betaCapacityPrior;  // V43

		public DecisionConfig(int informationRegime, int enableHazardDeparture,
				double alphaHazard, double bRisk, double wOfficial, double gammaVuln,
				double sigmaTheta, double riskHalfLifeH, double lambdaOutreachPerDay,
				double barrierBelongings, double barrierPet, double barrierDependents,
				boolean petPolicyAdmitDefault, double betaTravelTime, double betaCapacityPrior) {
			this.informationRegime = informationRegime;
			this.enableHazardDeparture = enableHazardDeparture;
			this.alphaHazard = alphaHazard;
			this.bRisk = bRisk;
			this.wOfficial = wOfficial;
			this.gammaVuln = gammaVuln;
			this.sigmaTheta = sigmaTheta;
			this.riskHalfLifeH = riskHalfLifeH;
			this.lambdaOutreachPerDay = lambdaOutreachPerDay;
			this.barrierBelongings = barrierBelongings;
			this.barrierPet = barrierPet;
			this.barrierDependents = barrierDependents;
			this.petPolicyAdmitDefault = petPolicyAdmitDefault;
			this.betaTravelTime = betaTravelTime;
			this.betaCapacityPrior = betaCapacityPrior;
		}
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

	// ---- Phase-E decision layer (V29–V44). ALL null/inert unless -----------
	// enableDecisionLayer=1; every use below is gated on decisionConfig != null
	// so legacy arms execute the pre-E code verbatim (R3 byte-identity).
	private DecisionConfig decisionConfig = null;
	private ELayerSampler.DecisionAttributes decisionAttributes = null;
	/** Per-agent private stream for in-run decisions (hazard Bernoulli, outreach
	 *  conversion, Scenario-E stuck draws). Never Repast's default stream, never
	 *  a sampler stream — seeded from DecisionAttributes.decisionSeed so an
	 *  agent's decision sequence is invariant to the per-tick shuffle. */
	private java.util.Random decisionRng = null;
	/** sigmaTheta * thetaZ, precomputed (V35). */
	private double thetaScaled = 0.0;
	/** Departure barrier cost c_i (V40), precomputed from attributes + config. */
	private double barrierCost = 0.0;
	/** Accumulated risk cue z_R (V36): cumulative unhealthy-exposure DAYS with
	 *  exponential decay — the sourced form (Castillo: response is to cumulative
	 *  exposure days, not instantaneous PM2.5). Updated once per simulated hour. */
	private double zR = 0.0;
	/** Hour index of the last decision update, so hazard/conversion evaluate
	 *  hourly (PM2.5 is hourly; 60x fewer draws, no rate-conversion bugs). */
	private int lastDecisionHour = -1;
	/** Tick this resident became aware (0.0 = aware at start; NaN = never). */
	private double awareTick = Double.NaN;
	/** L1 belief set: shelter ids discovered full-or-refusing at the door.
	 *  Never cleared, and never wrong: occupancy is monotone (no departures are
	 *  modelled) and policy is fixed, so a site once refused stays refused for
	 *  this resident. New capacity only ever appears as a NEWLY OPENED site,
	 *  which by construction is not yet in the set. Null under L0. */
	private java.util.Set<String> believedFull = null;

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
		// V34 group pace: residents travelling with dependent children walk at
		// the group's speed (Moussaid 2010), applied as a derived reduction —
		// the sampled individual speed is never mutated. 0.40 = the V27 floor.
		if (decisionConfig != null && decisionAttributes != null
				&& decisionAttributes.groupSpeedDeltaMps > 0.0) {
			walkingSpeedMps = Math.max(0.40,
					walkingSpeedMps - decisionAttributes.groupSpeedDeltaMps);
		}
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

		// UNAWARE / PRE_EVAC: in place at the encampment, accruing outdoor
		// exposure. Departure is decided here — by the Phase-E decision layer
		// when it is enabled, otherwise by the legacy bright-line latch, which
		// runs VERBATIM so every archived arm reproduces byte-identically.
		if (state == State.UNAWARE || state == State.PRE_EVAC) {
			double cNow = (smokeField == null) ? 0.0
					: smokeField.concentrationForTick(tick, minutesPerTick);

			if (decisionConfig != null && decisionAttributes != null) {
				// ---- Phase-E decision layer (hourly; V29/V36–V41) -----------
				int hour = (int) Math.floor(tick * minutesPerTick / 60.0);
				boolean newHour = hour > lastDecisionHour;
				if (newHour) {
					lastDecisionHour = hour;
					// z_R (V36): cumulative unhealthy-exposure DAYS, decayed —
					// the sourced Castillo form. Deterministic: no RNG consumed,
					// so the E0 null run stays byte-identical.
					double decay = Math.pow(2.0, -1.0 / decisionConfig.riskHalfLifeH);
					zR = zR * decay + (cNow >= UNHEALTHY_UGM3 ? 1.0 / 24.0 : 0.0);
				}

				// UNAWARE -> PRE_EVAC by outreach contact (V41), evaluated hourly
				// on this agent's private stream.
				if (state == State.UNAWARE) {
					if (newHour && decisionConfig.lambdaOutreachPerDay > 0.0
							&& decisionRng.nextDouble() < decisionConfig.lambdaOutreachPerDay / 24.0) {
						state = State.PRE_EVAC;   // now aware (spec: AWARE_IDLE)
						awareTick = tick;
					}
					if (state == State.UNAWARE) {
						return; // still unaware; exposure already accrued above
					}
				}

				if (decisionConfig.enableHazardDeparture == 1) {
					// Logistic hazard departure (V36–V40), replacing the latch.
					// u_i = alpha + bRisk_i*z_R + w*officialCue + theta_i - c_i.
					// Departure additionally REQUIRES an open shelter — the same
					// A-02 gate the latch enforces: nobody walks to a door that
					// does not exist. Before opening, officialCue = 0 lowers the
					// odds; the Wachinger constraint (high-barrier residents may
					// never depart even at peak PM2.5) is carried by -c_i.
					if (newHour) {
						boolean open = anyShelterOpen(context, tick);
						boolean vulnerable = attributes != null
								&& (attributes.copd || attributes.asthma
										|| attributes.ageYears >= 65 || attributes.mobilityLimited);
						double bRiskEff = decisionConfig.bRisk
								* (1.0 + (vulnerable ? decisionConfig.gammaVuln : 0.0));
						double u = decisionConfig.alphaHazard + bRiskEff * zR
								+ decisionConfig.wOfficial * (open ? 1.0 : 0.0)
								+ thetaScaled - barrierCost;
						double p = 1.0 / (1.0 + Math.exp(-u));
						if (open && decisionRng.nextDouble() < p) {
							state = State.EN_ROUTE;
							evacuationTick = tick;
						}
					}
					if (state != State.EN_ROUTE) {
						return; // waiting; exposure already accrued above
					}
				} else {
					// Decision layer on but hazard OFF (the R3 null): the legacy
					// latch below runs identically, every tick.
					double evacThreshold = (Double) params.getValue("evacuationThresholdUgM3");
					if (cNow >= evacThreshold && anyShelterOpen(context, tick)) {
						state = State.EN_ROUTE;
						evacuationTick = tick;
					} else {
						return;
					}
				}
			} else {
				// ---- Legacy bright-line latch (decision layer off) ----------
				// PRE_EVAC until local PM2.5 crosses the evacuation threshold
				// (default the EPA "Unhealthy" breakpoint 55.5 µg/m³, DATA_SOURCES
				// D9) AND somewhere is open to walk to (A-02 mitigation: the real
				// shelters opened Sept 10-11, days after the first threshold
				// crossing). UNAWARE cannot occur here.
				double evacThreshold = (Double) params.getValue("evacuationThresholdUgM3");
				if (cNow >= evacThreshold && anyShelterOpen(context, tick)) {
					state = State.EN_ROUTE;
					evacuationTick = tick;
				} else {
					return; // still waiting outdoors; exposure already accrued above
				}
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
			// Under L1 the resident cannot see occupancy, so "worth setting out"
			// means an operating, open, reachable site it has NOT yet been turned
			// away from (believedFull covers both capacity and policy refusals;
			// beliefs never expire — see the field doc). A newly opened site is
			// by construction untried. Under L0/legacy the omniscient
			// availability check runs verbatim.
			boolean somewhereToTry = useL1()
					? anyUntriedReachableShelter(context, tick)
					: anyShelterAvailable(context, tick);
			if (!somewhereToTry) {
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

		// --- Routing (capacity-aware under L0; belief-aware under L1) --------
		if (routePath == null) {
			if (useL1()) {
				chooseShelterByUtility(context, tick, walkingSpeedMps);
			} else {
				chooseNetworkNearestShelter(context, tick);
			}
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
			// Phase-E policy gates are evaluated AT THE DOOR, not at selection
			// time: under L1 the resident knows locations, not intake policies,
			// and the sourced datum is exactly "ever been TURNED AWAY over pet
			// policy" (48.1%, Henwood 2020) — people went and were refused.
			boolean policyRefused = decisionConfig != null && decisionAttributes != null
					&& ((decisionAttributes.hasPet && !petAdmittedAt(targetShelter))
							|| (decisionAttributes.hasDependents && targetShelter.isAdultsOnly()));
			if (!policyRefused && targetShelter.isOpenAt(tick)
					&& targetShelter.admit(isPriorityForAdmission())) {
				state = State.SHELTERED;
				arrivalTick = tick;
			} else {
				// Refused (capacity, closed, or policy): the resident REMAINS at
				// this shelter's street node and re-plans from there next tick
				// (A-17 / Finding A: never re-plan from the immutable start node
				// — that walked refused agents back to their encampment,
				// inflating distance and dose).
				if (policyRefused) {
					targetShelter.recordPolicyRefusal();
				}
				if (useL1()) {
					// The discovery IS the information: this door will never
					// admit this resident (occupancy is monotone, policy fixed).
					believedFull.add(targetShelter.getId());
				} else if (policyRefused) {
					// L0 sees occupancy but not intake policy, so a policy
					// refusal must still be remembered or the omniscient chooser
					// picks the same door again next tick, forever.
					believedFull.add(targetShelter.getId());
				}
				currentNodeId = targetShelter.getGraphNodeId();
				targetShelter = null;
				routePath = null;
				pathIndex = 0;
				retargetCount++;
				// Under L0/legacy the retry cap guards against livelock. Under
				// L1 the believedFull set is the bound (each refusal permanently
				// removes one site; REFUSED_ALL_FULL follows when none remain),
				// so retries are belief-driven decisions, never counter-capped
				// (U-16: closed-at-selection sites never burned retries either).
				if (!useL1() && retargetCount > MAX_RETARGETS) {
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
			if (excludedByBelief(shelter)) {
				continue;   // already turned this resident away on policy (L0)
			}
			if (shelter.hasSpaceFor(isPriorityForAdmission()) && dM < bestDistM) {
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

	/** True if this resident has already been turned away from this site and
	 *  should not select it again. Always false when the decision layer is off
	 *  (the set is null), which is what keeps the legacy choosers unchanged. */
	private boolean excludedByBelief(Shelter shelter) {
		return believedFull != null && believedFull.contains(shelter.getId());
	}

	/** True when the Phase-E L1 information regime governs this agent's choice:
	 *  locations known, occupancy and intake policy discovered at the door. */
	private boolean useL1() {
		return decisionConfig != null && decisionAttributes != null
				&& decisionConfig.informationRegime == 1;
	}

	/** Whether this site admits pets: its own recorded policy when the CSV has
	 *  one, otherwise the run-wide default (A-29: the 2020 record is silent). */
	private boolean petAdmittedAt(Shelter shelter) {
		Boolean policy = shelter.getPetIntake();
		return policy != null ? policy.booleanValue()
				: decisionConfig.petPolicyAdmitDefault;
	}

	/** Documented ln-cap for capacity-unlimited standby sites in the V43 size
	 *  prior: ln(capacity) needs a finite argument, and an uncapped site is
	 *  believed at least as large as any real one. */
	private static final double UNCAPPED_CAPACITY_PRIOR = 10000.0;

	/**
	 * Phase-E L1 destination choice (V43, E-LAYER-SPEC.md §4):
	 * {@code V_j = -betaT * walkTime_j(ownSpeed) + betaS * ln(capacity_j)}
	 * over operating, open, reachable sites NOT yet discovered-refusing
	 * (believedFull). <b>Deliberately no {@code hasSpaceFor} pre-filter</b> —
	 * that live-occupancy knowledge is exactly the omniscience L1 removes;
	 * fullness is discovered at the door and recorded as belief. With
	 * betaS = 0 this reduces to nearest-reachable, the legacy geometry.
	 * Ties break on shelter id so the choice is independent of iteration order.
	 * Terminal classification mirrors the legacy chooser: reachable-but-all-
	 * believed-refusing → REFUSED_ALL_FULL; nothing reachable → UNREACHABLE.
	 */
	private void chooseShelterByUtility(Context context, double tick, double ownSpeedMps) {
		double bestV = Double.NEGATIVE_INFINITY;
		Shelter best = null;
		double bestDistM = Double.NaN;
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
			if (believedFull.contains(shelter.getId())) {
				continue;
			}
			double cap = (shelter.getCapacity() == null)
					? UNCAPPED_CAPACITY_PRIOR : shelter.getCapacity().doubleValue();
			double walkTimeH = dM / (ownSpeedMps * 3600.0);
			double v = -decisionConfig.betaTravelTime * walkTimeH
					+ decisionConfig.betaCapacityPrior * Math.log(Math.max(1.0, cap));
			if (v > bestV || (v == bestV && best != null
					&& shelter.getId().compareTo(best.getId()) < 0)) {
				bestV = v;
				best = shelter;
				bestDistM = dM;
			}
		}

		if (best != null) {
			targetShelter = best;
			if (Double.isNaN(networkDistToShelterM)) {
				networkDistToShelterM = bestDistM;   // V11, first selection only
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

	/** L1 counterpart of {@link #anyShelterAvailable}: an operating, open,
	 *  reachable site this resident has not yet been turned away from. No
	 *  occupancy consultation — the resident cannot see it. */
	private boolean anyUntriedReachableShelter(Context context, double tick) {
		for (Object obj : context.getObjects(Shelter.class)) {
			Shelter shelter = (Shelter) obj;
			if (shelter.isOperating() && shelter.isOpenAt(tick)
					&& shelter.getRouteTree() != null
					&& !Double.isInfinite(shelter.getRouteTree().distanceTo(currentNodeId))
					&& !believedFull.contains(shelter.getId())) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Whether this resident is a PRIORITY arrival under need-based admission
	 * (arm D): the reserved fraction of each shelter's capacity is available
	 * only to residents whose mobility is limited (V20, PopulationSampler).
	 *
	 * <p>The triage criterion is mobility limitation and nothing else. It is
	 * the one attribute that both (a) is sampled from a sourced marginal and
	 * (b) mechanically causes the access gap in this model, because a slower
	 * walker reaches a door later and is refused by someone who walked faster.
	 * Age, asthma and COPD are deliberately NOT part of the rule: they carry no
	 * behavioural consequence in this model, so triaging on them would be a
	 * claim the simulation cannot support.
	 *
	 * <p>Always false when heterogeneity is disabled (no resident has
	 * attributes), which is one of the two reasons a reserve of 0 is inert.
	 */
	private boolean isPriorityForAdmission() {
		return attributes != null && attributes.mobilityLimited;
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
			if (shelter.isAvailableAt(tick, isPriorityForAdmission()) && shelter.getRouteTree() != null
					&& !Double.isInfinite(shelter.getRouteTree().distanceTo(currentNodeId))
					&& !excludedByBelief(shelter)) {
				return true;
			}
		}
		return false;
	}

	// setAgeRR / setComorbidityRR were removed in the v1.0 cleanup: nothing ever
	// called them. The weights they would have set are pinned at 1.0 by design
	// (assumption A-09), because the relative risks originally specified could
	// not be sourced -- see the citation audit in TECHNICAL_REFERENCE.md.
	// Reintroduce a setter only alongside a sourced coefficient.
	public void setAttributes(PopulationSampler.Attributes attributes) { this.attributes = attributes; }
	/** Sampled heterogeneous attributes, or null when heterogeneity is disabled. */
	public PopulationSampler.Attributes getAttributes() { return attributes; }

	/**
	 * Arms the Phase-E decision layer on this resident. Called once per agent by
	 * ContextCreator's second sampling pass when {@code enableDecisionLayer=1};
	 * never called otherwise, which is what keeps every legacy arm byte-identical.
	 *
	 * <p>Precomputes the scaled trait (sigmaTheta * thetaZ — the raw draw is
	 * consumed even at sigma 0, per the unconditional-draw rule) and the
	 * departure barrier cost c_i (V40). The pet term enters c_i only when the
	 * world's default policy refuses pets: per-site policies are discovered at
	 * the door, but the departure-suppressing burden is anticipating refusal
	 * (A-29). An initially-unaware resident starts in {@link State#UNAWARE};
	 * an aware one stays in PRE_EVAC exactly as legacy residents do.
	 */
	public void setDecisionLayer(DecisionConfig config, ELayerSampler.DecisionAttributes da) {
		this.decisionConfig = config;
		this.decisionAttributes = da;
		this.decisionRng = new java.util.Random(da.decisionSeed);
		this.thetaScaled = config.sigmaTheta * da.thetaZ;
		double c = 0.0;
		if (da.heavyBelongings) c += config.barrierBelongings;
		if (da.hasPet && !config.petPolicyAdmitDefault) c += config.barrierPet;
		if (da.hasDependents) c += config.barrierDependents;
		this.barrierCost = c;
		// Allocated in BOTH regimes. Under L1 it records every door that turned
		// this resident away. Under L0 it records only POLICY refusals: the
		// omniscient chooser already filters on live capacity, but nothing filters
		// on intake policy, so without this a pet owner would re-select the same
		// refusing shelter every tick forever (EN_ROUTE -> refused ->
		// REFUSED_ALL_FULL -> re-entry resets the retarget counter -> repeat).
		// R3 is unaffected: the degenerate null admits pets and has no adults-only
		// site, so the set stays empty and the legacy chooser sees no change.
		this.believedFull = new java.util.HashSet<String>();
		if (da.awareInitial) {
			this.awareTick = 0.0;      // aware from the start; state stays PRE_EVAC
		} else {
			this.state = State.UNAWARE;
			this.awareTick = Double.NaN;
		}
	}

	/** Sampled decision attributes, or null when the decision layer is off. */
	public ELayerSampler.DecisionAttributes getDecisionAttributes() { return decisionAttributes; }
	/** Tick this resident became aware: 0 = from the start, NaN = never. */
	public double getAwareTick() { return awareTick; }
	/** Scaled persistent trait sigmaTheta * thetaZ (0 when the layer is off). */
	public double getThetaScaled() { return thetaScaled; }
	/** Departure barrier cost c_i (V40); 0 when the layer is off. */
	public double getBarrierCost() { return barrierCost; }
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
