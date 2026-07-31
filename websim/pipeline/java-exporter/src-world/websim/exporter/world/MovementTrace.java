package websim.exporter.world;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;

import geography.agents.GisAgent;
import geography.agents.Shelter;
import geography.data.CsvLoader;
import geography.env.SmokeField;
import geography.routing.StreetNetwork;

import repast.simphony.context.Context;
import repast.simphony.context.DefaultContext;
import repast.simphony.engine.environment.RunEnvironment;
import repast.simphony.engine.environment.RunState;
import repast.simphony.engine.schedule.Schedule;
import repast.simphony.engine.schedule.ScheduleParameters;
import repast.simphony.parameter.DefaultParameters;
import repast.simphony.space.gis.DefaultGeography;
import repast.simphony.space.gis.Geography;

/**
 * FIX-A — the <b>direct movement oracle</b>: a per-tick trace of individual
 * residents produced by <b>the certified {@code GisAgent.step()} itself</b>.
 *
 * <p><b>Why this exists.</b> The WP7 gate established that a 10&nbsp;% error
 * injected into the port's {@code stepLengthM} leaves all 1,084 tests green:
 * every existing Tier-3 gate is an aggregate (sheltered census inside a 9-seed
 * band, exposure identities, marginals) and aggregates are insensitive to a
 * uniform speed scaling that merely shifts arrival ticks. Nothing in the suite
 * compared <i>one resident's displacement on one tick</i> against Java. This
 * dumper closes that hole at its source.
 *
 * <p><b>Invocation discipline — the movement loop is never re-implemented.</b>
 * The 15-line walk in {@code GisAgent.java:526-542} is not transcribed, mirrored
 * or paraphrased anywhere in this file. Instead a minimal but <i>real</i> Repast
 * runtime is stood up — a {@link DefaultContext}, a {@link DefaultGeography}
 * projection literally named {@code "Geography"}, a {@link Schedule} and a
 * {@link RunEnvironment} carrying a {@code minutesPerTick} /
 * {@code walkingSpeedMps} parameter map — and the certified agents are stepped
 * through it. Every metre in {@code ticks.tsv} was computed by
 * {@code Geodesic.WGS84.Inverse/Direct} inside the certified class.
 * {@code StreetNetwork} (via {@link CertifiedGraph}) owns the graph, the
 * snapping and the shortest-path trees; {@code CsvLoader} owns the parse;
 * {@code Shelter} owns capacity and the open window; {@code SmokeField} owns the
 * hourly array.
 *
 * <p><b>What is mirrored, and why it is safe.</b> Two blocks of
 * {@code ContextCreator.build()} are mirrored, exactly as {@link WorldFixtures}
 * already mirrors them and for the same reason ({@code build()} needs a
 * {@code Geography.rs} scenario directory, a parameter schema and a live
 * {@code RunState}): the shelter loop (L546-L591) and the resident placement
 * loop (L710-L755). Neither contains a metre of movement arithmetic.
 *
 * <p><b>Q4 disclosure.</b> Traced residents do <b>not</b> start at encampment
 * coordinates. Real campsite coordinates are git-ignored
 * ({@code pipeline/local-raw/}) and must never enter a committed fixture, so
 * each traced resident starts at a <i>synthetic</i> point offset
 * {@link #START_OFFSET_LON} / {@link #START_OFFSET_LAT} degrees from a street
 * node that this file selects deterministically from the published graph. The
 * offset is what gives the trace a non-zero {@code snapGapM} approach leg, which
 * is the part of the walk Java performs before it reaches its first path vertex.
 *
 * <p><b>Determinism.</b> No clock, no environment variable, no hash-order
 * iteration, and — deliberately — <b>no RNG at all</b>: the three homogeneous configs walk
 * at the run-wide {@code walkingSpeedMps}, the fourth carries fixed synthetic
 * per-agent speeds (never sampled), and the per-tick agent order is this file's
 * own fixed list rather than Repast's RANDOM_PRIORITY shuffle. Two runs produce byte-identical dumps.
 */
public final class MovementTrace {

	private MovementTrace() { }

	// ------------------------------------------------------------ constants

	private static final double MINUTES_PER_TICK = 1.0;
	private static final double TICKS_PER_HOUR = 60.0 / MINUTES_PER_TICK;

	/** {@code Geography.rs/parameters.xml} default; the legacy departure latch. */
	private static final double EVACUATION_THRESHOLD_UGM3 = 55.5;

	/**
	 * Run length. Long enough that the baseline Portland series crosses the
	 * 55.5 µg/m³ latch and every traced resident completes its walk, short
	 * enough that the committed trace stays around a megabyte.
	 */
	private static final int SIM_HOURS = 96;
	private static final int END_TICK = (int) (SIM_HOURS * TICKS_PER_HOUR);

	/**
	 * Run-wide walking speeds, one trace config each. The kernel under test is
	 * {@code stepLengthM = walkingSpeedMps * 60 * minutesPerTick}, so three
	 * separated speeds turn a constant-factor error into three independent
	 * failures rather than one.
	 */
	private static final double[] SPEEDS_MPS = { 0.70, 1.34, 1.90 };

	/**
	 * A fourth config exercising the OTHER half of the speed selector:
	 * {@code attributes != null ? attributes.walkingSpeedMps : param}. Each
	 * traced resident is given a certified {@code PopulationSampler.Attributes}
	 * carrying its own speed, and the run-wide parameter is set to
	 * {@link #HETEROGENEOUS_DECOY_MPS} — a value no resident may ever walk at.
	 * A port that read the parameter instead of the attribute would be off by a
	 * factor of ~50 on the first tick.
	 *
	 * <p>The speeds are a fixed synthetic spread across the V10 range
	 * (Boyce 1999 mobility-limited at the low end, Bohannon &amp; Williams
	 * Andrews 2011 age&times;sex means through the middle). They are NOT sampled:
	 * this dump must stay RNG-free, and the sampler already has its own bit-exact
	 * oracle in {@code world/committed.parity.test.ts}.
	 */
	private static final double[] PER_AGENT_SPEEDS_MPS = { 0.58, 0.83, 1.11, 1.28, 1.45, 1.72 };

	/** Run-wide speed under the heterogeneous config; never walked by anybody. */
	private static final double HETEROGENEOUS_DECOY_MPS = 37.0;

	/** Residents traced per speed config. */
	private static final int AGENTS = 6;

	/** Synthetic off-network start offset (~29 m E, ~28 m N at 45.5 N). */
	private static final double START_OFFSET_LON = 0.00037;
	private static final double START_OFFSET_LAT = -0.00025;

	/** Candidate start nodes are taken every {@code NODE_STRIDE}-th graph node. */
	private static final int NODE_STRIDE = 1471;

	/** Accept a start node only if its nearest shelter is this far by street. */
	private static final double MIN_JOURNEY_M = 800.0;
	private static final double MAX_JOURNEY_M = 4000.0;

	/**
	 * Off-walk sampling stride. Every EN_ROUTE tick is recorded in full; the
	 * PRE_EVAC and post-arrival stretches are sampled, which is lossless for the
	 * accumulators because every one of them is cumulative — a single missed or
	 * doubled per-tick increment moves every later sample.
	 */
	private static final int IDLE_STRIDE = 137;

	// ------------------------------------------------ certified constants

	private static Class<?> CC;
	private static LocalDateTime SIM_START;
	private static String SMOKE_CSV;
	private static String SHELTERS_A_CSV;

	private static void loadCertifiedConstants() throws Exception {
		CC = Class.forName("geography.agents.ContextCreator");
		SIM_START = (LocalDateTime) Reflect.staticField(CC, "SIM_START");
		SMOKE_CSV = (String) Reflect.staticField(CC, "SMOKE_CSV");
		SHELTERS_A_CSV = (String) Reflect.staticField(CC, "SHELTERS_A_CSV");
	}

	// ------------------------------------------------------- private views

	/**
	 * {@code GisAgent.pathIndex} and {@code GisAgent.routePath}, read by
	 * reflection. They are the only way to tell, from outside, whether a tick
	 * consumed the last vertex of the planned leg — and that distinction is what
	 * lets the oracle demand <b>bit-identity</b> on every other tick (see the
	 * TypeScript side). Reading them changes nothing.
	 */
	private static Field F_PATH_INDEX;
	private static Field F_ROUTE_PATH;

	private static void loadAgentViews() throws Exception {
		F_PATH_INDEX = Reflect.declared(GisAgent.class, "pathIndex");
		F_ROUTE_PATH = Reflect.declared(GisAgent.class, "routePath");
	}

	@SuppressWarnings("unchecked")
	private static List<Coordinate> routePath(GisAgent a) {
		try {
			return (List<Coordinate>) F_ROUTE_PATH.get(a);
		} catch (Exception e) {
			throw new RuntimeException(e);
		}
	}

	private static int pathIndex(GisAgent a) {
		try {
			return ((Integer) F_PATH_INDEX.get(a)).intValue();
		} catch (Exception e) {
			throw new RuntimeException(e);
		}
	}

	// --------------------------------------------------------- the driver

	/**
	 * One scheduled action per tick. Steps the traced residents in a fixed order
	 * — not Repast's RANDOM_PRIORITY shuffle — because a movement oracle must be
	 * byte-reproducible and, with capacity nowhere near binding here, execution
	 * order cannot change a single metre.
	 */
	public static final class Driver {
		private final List<GisAgent> agents;

		Driver(List<GisAgent> agents) {
			this.agents = agents;
		}

		/** Invoked by the Repast schedule; must stay public for the scheduler. */
		public void tick() {
			for (GisAgent a : agents) {
				a.step();
			}
		}
	}

	// ------------------------------------------------------------- world

	private static final class World {
		Context<Object> context;
		Geography<Object> geography;
		Schedule schedule;
		List<GisAgent> agents;
		List<Shelter> shelters;
		SmokeField smoke;
	}

	/**
	 * Mirror of {@code ContextCreator.build()} L546-L591 (shelters) and
	 * L710-L755 (resident placement), with the display-only side effects kept
	 * because a {@code Geography} projection is exactly what {@code step()}
	 * reads its position from.
	 *
	 * <p>{@code respectShelterOpeningDates} is 0 and {@code triageReserveFraction}
	 * is 0: the oracle is about the walk, so every site is open from tick 1 and
	 * no resident is ever refused. That is asserted, not assumed — a non-zero
	 * {@code retargetCount} fails the dump.
	 */
	/**
	 * Builds a certified {@code PopulationSampler.Attributes} carrying one chosen
	 * walking speed.
	 *
	 * <p>The constructor is package-private because only the sampler is meant to
	 * mint attributes, and that is the right design — but the alternative here
	 * would be to run the sampler and inherit its RNG, which would make the
	 * movement dump depend on a seed it has no business depending on. So the
	 * certified constructor is invoked reflectively with a fixed, non-vulnerable
	 * profile: the only field this trace reads is {@code walkingSpeedMps}, and
	 * {@code mobilityLimited=false} keeps the resident out of the priority-
	 * admission class so the door behaves exactly as in the null-attribute
	 * configs.
	 */
	private static Object attributesWithSpeed(double speedMps) throws Exception {
		Class<?> attrs = Class.forName("geography.agents.PopulationSampler$Attributes");
		java.lang.reflect.Constructor<?> ctor = attrs.getDeclaredConstructors()[0];
		ctor.setAccessible(true);
		Object ageBand = Class.forName("geography.agents.PopulationSampler$AgeBand")
				.getEnumConstants()[0];
		Object sex = Class.forName("geography.agents.PopulationSampler$Sex").getEnumConstants()[0];
		Object mobility = Class.forName("geography.agents.PopulationSampler$MobilityCategory")
				.getEnumConstants()[0];
		return ctor.newInstance(Integer.valueOf(40), ageBand, sex, Boolean.FALSE, mobility,
				Boolean.FALSE, Boolean.FALSE, Boolean.FALSE, Double.valueOf(speedMps));
	}

	private static World buildWorld(CertifiedGraph g, double speedMps, long[] startNodes,
			java.util.Map<Long, StreetNetwork.ShortestPathTree> treeCache, boolean heterogeneous)
			throws Exception {
		World w = new World();

		w.schedule = new Schedule();
		DefaultParameters params = new DefaultParameters();
		params.addParameter("minutesPerTick", "minutesPerTick", Double.class,
				Double.valueOf(MINUTES_PER_TICK), false);
		params.addParameter("walkingSpeedMps", "walkingSpeedMps", Double.class,
				Double.valueOf(speedMps), false);
		params.addParameter("evacuationThresholdUgM3", "evacuationThresholdUgM3", Double.class,
				Double.valueOf(EVACUATION_THRESHOLD_UGM3), false);
		RunEnvironment.init(w.schedule, null, params, true);

		w.context = new DefaultContext<Object>("MovementTrace");
		DefaultGeography<Object> geo = new DefaultGeography<Object>("Geography");
		w.context.addProjection(geo);
		w.geography = geo;
		// `GisAgent.step()` opens with ContextUtils.getContext(this), which
		// resolves through the RunState master context. Without this the
		// certified step throws on its very first statement.
		RunState.init();
		RunState.getInstance().setMasterContext(w.context);

		GeometryFactory fac = new GeometryFactory();

		w.shelters = new ArrayList<Shelter>();
		for (java.util.Map<String, String> r : CsvLoader.read(SHELTERS_A_CSV)) {
			String capStr = r.get("capacity");
			Integer capacity = (capStr == null || capStr.isEmpty()) ? null : Integer.valueOf(capStr);
			boolean isOperating = "operating".equalsIgnoreCase(r.get("status"));
			double lon = Double.parseDouble(r.get("lon"));
			double lat = Double.parseDouble(r.get("lat"));
			Shelter shelter = new Shelter(r.get("shelter_id"), r.get("name"), capacity,
					isOperating, lon, lat);
			long node = g.network.nearestNode(new Coordinate(lon, lat));
			shelter.setGraphNodeId(node);
			// One tree per distinct shelter node, computed once and shared across
			// the speed configs: a ShortestPathTree is immutable, and recomputing
			// it per config would only burn minutes to reproduce the same arrays.
			Long key = Long.valueOf(node);
			StreetNetwork.ShortestPathTree tree = treeCache.get(key);
			if (tree == null) {
				tree = g.network.computeTree(node);
				treeCache.put(key, tree);
			}
			shelter.setRouteTree(tree);
			w.context.add(shelter);
			w.geography.move(shelter, fac.createPoint(new Coordinate(lon, lat)));
			w.shelters.add(shelter);
		}

		w.smoke = new SmokeField(SMOKE_CSV, "Multnomah", SIM_START, 1.0);

		w.agents = new ArrayList<GisAgent>();
		for (int i = 0; i < startNodes.length; i++) {
			Coordinate nodeCoord = g.network.nodeCoordinate(startNodes[i]);
			Coordinate start = new Coordinate(nodeCoord.x + START_OFFSET_LON,
					nodeCoord.y + START_OFFSET_LAT);
			GisAgent agent = new GisAgent("Trace " + i, g.network, startNodes[i],
					"synthetic-" + i, w.smoke);
			agent.setStartCoord(start.x, start.y);
			if (heterogeneous) {
				agent.setAttributes((geography.agents.PopulationSampler.Attributes)
						attributesWithSpeed(PER_AGENT_SPEEDS_MPS[i]));
			}
			w.context.add(agent);
			w.geography.move(agent, fac.createPoint(start));
			w.agents.add(agent);
		}

		w.schedule.schedule(ScheduleParameters.createRepeating(1, 1),
				new Driver(w.agents), "tick");
		return w;
	}

	// ----------------------------------------------------- node selection

	/**
	 * Deterministically picks {@link #AGENTS} start nodes whose nearest arm-A
	 * shelter is between {@link #MIN_JOURNEY_M} and {@link #MAX_JOURNEY_M} street
	 * metres away — long enough that the walk spans many ticks at every traced
	 * speed, short enough that it completes inside {@link #SIM_HOURS}.
	 */
	private static long[] selectStartNodes(CertifiedGraph g, List<Shelter> shelters) {
		long[] out = new long[AGENTS];
		int found = 0;
		for (int i = 0; i < g.nodeIdsAscending.length && found < AGENTS; i += NODE_STRIDE) {
			long id = g.nodeIdsAscending[i];
			double best = Double.POSITIVE_INFINITY;
			for (Shelter s : shelters) {
				if (!s.isOperating() || s.getRouteTree() == null) {
					continue;
				}
				double d = s.getRouteTree().distanceTo(id);
				if (d < best) {
					best = d;
				}
			}
			if (best >= MIN_JOURNEY_M && best <= MAX_JOURNEY_M) {
				out[found++] = id;
			}
		}
		if (found < AGENTS) {
			throw new IllegalStateException("only " + found + " qualifying start nodes found");
		}
		return out;
	}

	// -------------------------------------------------------------- dump

	/**
	 * @param args {@code <fixtureDir>} — the committed fixture root
	 *             ({@code websim/engine/test/fixtures}). Unlike the other
	 *             dumpers this one writes NO bulk tree under
	 *             {@code pipeline/out/}: the whole trace is small enough to be a
	 *             committed clean-clone oracle, and an empty scratch directory
	 *             under {@code out/} would (rightly) trip {@code check:scratch}.
	 */
	public static void main(String[] args) throws Exception {
		if (args.length < 1) {
			throw new IllegalArgumentException("usage: MovementTrace <fixtureDir>");
		}
		File fixtureRoot = new File(args[0]);
		File fixtureDir = new File(fixtureRoot, "movement");
		if (!fixtureDir.exists() && !fixtureDir.mkdirs()) {
			throw new IOException("cannot create " + fixtureDir);
		}

		loadCertifiedConstants();
		loadAgentViews();
		CertifiedGraph g = CertifiedGraph.build();
		Io.Manifest man = new Io.Manifest(fixtureDir);
		g.assertProductionCensus(man);

		// A throwaway world only so the shelter trees exist for node selection.
		java.util.Map<Long, StreetNetwork.ShortestPathTree> treeCache =
				new java.util.LinkedHashMap<Long, StreetNetwork.ShortestPathTree>();
		World probe = buildWorld(g, SPEEDS_MPS[0], new long[0], treeCache, false);
		long[] startNodes = selectStartNodes(g, probe.shelters);

		Io.Sink ticks = man.sinkAt("movement.ticks", new File(fixtureDir, "ticks.tsv"),
				"engine/test/fixtures/movement/ticks.tsv");
		Io.Sink routes = man.sinkAt("movement.routes", new File(fixtureDir, "routes.tsv"),
				"engine/test/fixtures/movement/routes.tsv");
		Io.Sink legs = man.sinkAt("movement.legs", new File(fixtureDir, "legs.tsv"),
				"engine/test/fixtures/movement/legs.tsv");
		Io.Sink smoke = man.sinkAt("movement.smoke", new File(fixtureDir, "smoke.tsv"),
				"engine/test/fixtures/movement/smoke.tsv");

		header(ticks, "per-tick trace produced by the certified GisAgent.step()");
		ticks.line("# config\tagent\ttick\tstate\tpath_index\tpath_size\tdist_m_hex\tlon_hex\tlat_hex"
				+ "\texposure_hex\ttravel_exposure_hex\tair_vol_hex\tdose_hex\thours_above_hex"
				+ "\toutdoor_h_hex\tpeak_hex");
		header(routes, "certified StreetNetwork.pathToSource polyline of each traced leg");
		routes.line("# agent\tvertex\tlon_hex\tlat_hex\tseg_len_m_hex");
		header(legs, "one row per traced resident per config; end-of-run certified totals");
		legs.line("# config\theterogeneous\trun_wide_speed_mps_hex\tagent_speed_mps_hex\tagent"
				+ "\tstart_node_id\tstart_lon_hex\tstart_lat_hex"
				+ "\ttarget_shelter\tshelter_node_id\tpath_size\tsnap_gap_m_hex\tplanned_route_m_hex"
				+ "\tnetwork_dist_m_hex\tevac_tick\tarrival_tick\tretargets\tdist_m_hex\tstate");
		header(smoke, "certified SmokeField hourly array (baseline series), hour 0 = SIM_START");
		smoke.line("# hour\tconc_ugm3_hex");

		SmokeField reference = new SmokeField(SMOKE_CSV, "Multnomah", SIM_START, 1.0);
		for (int h = 0; h < SIM_HOURS + 1 && h < reference.hours(); h++) {
			double c = reference.concentrationAtHour(h);
			smoke.line(h + "\t" + (Double.isNaN(c) ? "nan" : Io.hexD(c)));
		}
		smoke.close();

		boolean routesWritten = false;
		String[] targetById = new String[AGENTS];
		int enRouteRows = 0;

		final int configCount = SPEEDS_MPS.length + 1;
		for (int ci = 0; ci < configCount; ci++) {
			boolean heterogeneous = ci == SPEEDS_MPS.length;
			double speed = heterogeneous ? HETEROGENEOUS_DECOY_MPS : SPEEDS_MPS[ci];
			World w = buildWorld(g, speed, startNodes, treeCache, heterogeneous);

			// Path polylines are dumped from the first config only and asserted
			// identical afterwards: the walk is a pure function of the graph, so
			// a speed change that moved a route would be a defect, not a result.
			String[] prev = new String[AGENTS];
			boolean[] seenRoute = new boolean[AGENTS];

			for (int tick = 1; tick <= END_TICK; tick++) {
				w.schedule.execute();
				double now = w.schedule.getTickCount();
				if (now != tick) {
					throw new IllegalStateException("schedule tick " + now + " != " + tick);
				}
				for (int ai = 0; ai < w.agents.size(); ai++) {
					GisAgent a = w.agents.get(ai);
					List<Coordinate> rp = routePath(a);
					if (ci == 0 && rp != null && !seenRoute[ai]) {
						seenRoute[ai] = true;
						dumpRoute(routes, ai, a, rp);
						routesWritten = true;
					}
					String state = a.getState().name();
					boolean enRoute = "EN_ROUTE".equals(state);
					boolean changed = !state.equals(prev[ai]);
					prev[ai] = state;
					if (!(enRoute || changed || tick == 1 || tick == END_TICK
							|| tick % IDLE_STRIDE == 0)) {
						continue;
					}
					if (enRoute) {
						enRouteRows++;
					}
					Point p = (Point) w.geography.getGeometry(a);
					Coordinate c = p.getCoordinate();
					ticks.line(ci + "\t" + ai + "\t" + tick + "\t" + state + "\t"
							+ (rp == null ? -1 : pathIndex(a)) + "\t"
							+ (rp == null ? -1 : rp.size()) + "\t"
							+ Io.hexD(a.getDistanceTraveledM()) + "\t"
							+ Io.hexD(c.x) + "\t" + Io.hexD(c.y) + "\t"
							+ Io.hexD(a.getExposureUgM3h()) + "\t"
							+ Io.hexD(a.getExposureWhileTravelingUgM3h()) + "\t"
							+ Io.hexD(a.getAirVolumeBreathedM3()) + "\t"
							+ Io.hexD(a.getInhaledDoseUg()) + "\t"
							+ Io.hexD(a.getHoursAboveUnhealthy()) + "\t"
							+ Io.hexD(a.getOutdoorHours()) + "\t"
							+ Io.hexD(a.getPeakConcUgM3()));
				}
			}

			for (int ai = 0; ai < w.agents.size(); ai++) {
				GisAgent a = w.agents.get(ai);
				Shelter target = a.getTargetShelter();
				String targetId = target == null ? "" : target.getId();
				if (ci == 0) {
					targetById[ai] = targetId;
				} else {
					man.check("movement.route-invariant.c" + ci + ".a" + ai,
							eq(targetById[ai], targetId),
							"target shelter " + targetId + " (config 0: " + targetById[ai] + ")");
				}
				man.check("movement.no-refusal.c" + ci + ".a" + ai, a.getRetargetCount() == 0,
						"retargetCount=" + a.getRetargetCount());
				man.check("movement.arrived.c" + ci + ".a" + ai,
						"SHELTERED".equals(a.getState().name()),
						"state=" + a.getState().name() + " dist="
								+ a.getDistanceTraveledM() + " m");
				double agentSpeed = heterogeneous ? PER_AGENT_SPEEDS_MPS[ai] : speed;
				legs.line(ci + "\t" + (heterogeneous ? 1 : 0) + "\t" + Io.hexD(speed) + "\t"
						+ Io.hexD(agentSpeed) + "\t" + ai + "\t" + startNodes[ai] + "\t"
						+ Io.hexD(a.getStartLon()) + "\t" + Io.hexD(a.getStartLat()) + "\t"
						+ targetId + "\t"
						+ (target == null ? 0L : target.getGraphNodeId()) + "\t"
						+ (routePath(a) == null ? -1 : routePath(a).size()) + "\t"
						+ Io.hexD(a.getSnapGapM()) + "\t" + Io.hexD(a.getPlannedRouteM()) + "\t"
						+ Io.hexD(a.getNetworkDistToShelterM()) + "\t"
						+ Io.hexD(a.getEvacuationTick()) + "\t" + Io.hexD(a.getArrivalTick()) + "\t"
						+ a.getRetargetCount() + "\t" + Io.hexD(a.getDistanceTraveledM()) + "\t"
						+ a.getState().name());
			}
		}

		ticks.close();
		routes.close();
		legs.close();

		man.check("movement.routes-written", routesWritten, "route polylines dumped");
		man.check("movement.en-route-rows", enRouteRows >= configCount * AGENTS * 10,
				enRouteRows + " EN_ROUTE tick rows across " + configCount + " configs");
		// Io.Manifest splices extraJson between two object members, so it must be
		// a comma-terminated run of `"key": value` pairs.
		man.write(new File(fixtureDir, "manifest.json"),
				"  \"sim_hours\": " + SIM_HOURS + ", \"end_tick\": " + END_TICK
						+ ", \"minutes_per_tick\": " + MINUTES_PER_TICK
						+ ", \"idle_stride\": " + IDLE_STRIDE
						+ ", \"shelters_csv\": \"" + Io.esc(SHELTERS_A_CSV) + "\""
						+ ", \"smoke_csv\": \"" + Io.esc(SMOKE_CSV) + "\""
						+ ", \"respect_shelter_opening_dates\": 0"
						+ ", \"triage_reserve_fraction\": 0.0"
						+ ", \"configs\": " + (SPEEDS_MPS.length + 1)
						+ ", \"agents_per_config\": " + AGENTS
						+ ", \"heterogeneous_decoy_mps\": " + HETEROGENEOUS_DECOY_MPS
						+ ", \"start_offset_lon\": " + START_OFFSET_LON
						+ ", \"start_offset_lat\": " + START_OFFSET_LAT
						+ ", \"evacuation_threshold_ugm3\": " + EVACUATION_THRESHOLD_UGM3
						+ ",\n");
		if (man.failures() > 0) {
			throw new IllegalStateException(man.failures() + " movement-trace checks FAILED");
		}
		System.out.println("[FIX-A] movement trace -> " + fixtureDir);
	}

	private static void dumpRoute(Io.Sink routes, int agentIdx, GisAgent a, List<Coordinate> rp) {
		Coordinate prev = null;
		for (int v = 0; v < rp.size(); v++) {
			Coordinate c = rp.get(v);
			double seg = prev == null ? 0.0 : StreetNetwork.geodesicDistanceM(prev, c);
			routes.line(agentIdx + "\t" + v + "\t" + Io.hexD(c.x) + "\t" + Io.hexD(c.y)
					+ "\t" + Io.hexD(seg));
			prev = c;
		}
	}

	private static boolean eq(String a, String b) {
		return a == null ? b == null : a.equals(b);
	}

	private static void header(Io.Sink s, String what) {
		s.line("# FIX-A movement oracle -- " + what);
		s.line("# produced by websim.exporter.world.MovementTrace from the CERTIFIED "
				+ "geography.agents.GisAgent.step(); no movement arithmetic is re-implemented");
		s.line("# doubles are Double.toHexString; minutesPerTick=" + MINUTES_PER_TICK
				+ ", simulationHours=" + SIM_HOURS
				+ "; configs 0-2 run-wide speed, config 3 per-agent attributes");
	}
}
