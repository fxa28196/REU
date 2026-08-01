package websim.exporter.closures;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;

import geography.agents.ELayerSampler;
import geography.agents.GisAgent;
import geography.agents.PopulationSampler;
import geography.agents.Shelter;
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

import websim.exporter.world.CertifiedGraph;
import websim.exporter.world.Io;

/**
 * WP8 part 2 — the <b>agent-reaction oracle</b>: what
 * {@code GisAgent.reactToClosureWave()} actually does, produced by the
 * certified {@code GisAgent.step()} itself.
 *
 * <p><b>Why this cannot be taken from the archive.</b> Every certified
 * Scenario-E run recorded ZERO blockage events
 * ({@code WP8-SPEC-closures.md} §0): departures spread over ~455 h against a
 * ~24 min median walk leave ≈ 4 of 6,842 residents mid-walk at any wave
 * instant, and none of their routes crossed the 18–72 closed edges among
 * 109,434. So {@code blockagesEncountered}, {@code pushThroughs},
 * {@code reroutes} and {@code stuckEvents} are 0 in all 48 archived runs and a
 * completely wrong port of this method would still reproduce them. The archive
 * validates {@code ClosureWave.apply()} (part 1); it is silent here.
 *
 * <p><b>So the fixture is constructed — but the ANSWERS are not.</b> This class
 * stands up the same headless runtime {@code MovementTrace} established (a live
 * {@link DefaultContext}, a {@code "Geography"} projection, a real
 * {@link Schedule}, a real parameter map, a real {@link SmokeField}, the real
 * 36 arm-A shelters with certified snaps and trees, the certified
 * {@link PopulationSampler} and {@link ELayerSampler}) and then calls
 * {@code GisAgent.step()}. The closure waves are the certified
 * {@code ContextCreator$ClosureWave} at {@code FIRST_PRIORITY}, so they land
 * ahead of every agent step exactly as in production. Not one line of the scan,
 * the push rule, the grandfathering test, the {@code pushedBlockages}
 * bookkeeping, the {@code pStuck} draw or the reroute is transcribed here.
 *
 * <p><b>The construction.</b> A probe pass runs the identical world with NO
 * closures and snapshots, at the end of tick {@code T-1}, each traced walker's
 * certified {@code routeNodes} chain, its {@code coordOffset} array and its
 * {@code pathIndex}. Variant passes then rebuild the byte-identical world and
 * schedule ONE wave at tick {@code T} whose edges are chosen off those
 * snapshots:
 * <ul>
 *   <li>{@code ahead} — the first edge with {@code coordOffset[k] >= pathIndex};
 *       every traced walker must take a decision;</li>
 *   <li>{@code behind} — the last edge with {@code coordOffset[k] < pathIndex};
 *       every traced walker must be grandfathered: no counter, no RNG draw
 *       (QUIRK 12);</li>
 *   <li>{@code multi5} — five consecutive ahead edges on one route;
 *       {@code blockagesEncountered} must move by 1, not 5 (QUIRK 40);</li>
 *   <li>{@code twowave} — an ahead edge at {@code T}, a further ahead edge at
 *       {@code T + oneHour}; the second wave must be adjudicated for a pusher
 *       and must find nothing already in {@code pushedBlockages}.</li>
 * </ul>
 *
 * <p>Three parameter configs are run at seeds 42/43/44: {@code armed} (the
 * SE-E18 V49–V51 values), {@code armedStuck1} ({@code pStuck = 1.0}, so every
 * push is followed by the delay and the RESTING-ventilation window is
 * observable) and {@code layerOff} ({@code enableDecisionLayer = 0}, where
 * {@code push} is structurally {@code false} and {@code decisionRng} is never
 * touched — QUIRK 21).
 *
 * <p><b>Two deliberate deviations from the SE-E18 batch file</b>, both
 * necessary to get a bounded fixture in which walkers are mid-route at a common
 * tick, and both taking certified code paths:
 * {@code enableHazardDeparture = 0} (the "decision layer on, hazard off" branch
 * the Java itself labels the R3 null, so the legacy 55.5 µg/m³ latch fires for
 * every walker on the same tick) and {@code pAwareInit = 1.0} (with
 * {@code lambdaOutreachPerDay = 0} an UNAWARE resident could never depart).
 * Every V49–V51 coefficient is the SE-E18 value.
 */
final class ReactionOracle {

	private ReactionOracle() { }

	private static final double MINUTES_PER_TICK = 1.0;
	private static final double TICKS_PER_HOUR = 60.0 / MINUTES_PER_TICK;
	private static final double EVACUATION_THRESHOLD_UGM3 = 55.5;
	private static final int SIM_HOURS = 96;
	private static final int END_TICK = (int) (SIM_HOURS * TICKS_PER_HOUR);

	/** Traced walkers per run. */
	private static final int AGENTS = 12;
	/** Candidate start nodes are taken every {@code NODE_STRIDE}-th graph node. */
	private static final int NODE_STRIDE = 907;
	private static final double MIN_JOURNEY_M = 1500.0;
	private static final double MAX_JOURNEY_M = 6000.0;
	/** Synthetic off-network start offset (~29 m E, ~28 m S at 45.5 N). */
	private static final double START_OFFSET_LON = 0.00037;
	private static final double START_OFFSET_LAT = -0.00025;
	/** A traced walker must have at least this many edges still ahead at T-1. */
	private static final int MIN_AHEAD_EDGES = 8;
	/** Ticks recorded before / after each wave tick. */
	private static final int WINDOW_BEFORE = 2;

	/**
	 * Pre-closure shelter trees, shared across the 45 worlds this class builds.
	 * A {@code ShortestPathTree} is immutable and {@code computeTree} is a pure
	 * function of (graph, blocked set, source); {@link Certified#loadShelters}
	 * refuses the cache the moment anything is blocked, and {@code ClosureWave}
	 * always installs freshly computed trees on the Shelter objects.
	 */
	private static final java.util.Map<Long, StreetNetwork.ShortestPathTree> PRISTINE =
			new java.util.HashMap<Long, StreetNetwork.ShortestPathTree>();

	// ---------------------------------------------------------------- config

	private static final class Cfg {
		final String name;
		final int enableDecisionLayer;
		final double pStuck;
		final double stuckDelayH;
		final double pushThetaThreshold;
		final double kPush;
		final double sigmaTheta;

		Cfg(String name, int layer, double pStuck, double stuckDelayH, double thr, double kPush,
				double sigmaTheta) {
			this.name = name;
			this.enableDecisionLayer = layer;
			this.pStuck = pStuck;
			this.stuckDelayH = stuckDelayH;
			this.pushThetaThreshold = thr;
			this.kPush = kPush;
			this.sigmaTheta = sigmaTheta;
		}
	}

	private static final Cfg[] CONFIGS = {
		new Cfg("armed", 1, 0.3, 3.0, -0.25, 1.0, 1.0),
		new Cfg("armedStuck1", 1, 1.0, 3.0, -0.25, 1.0, 1.0),
		new Cfg("layerOff", 0, 0.3, 3.0, -0.25, 1.0, 1.0),
	};

	private static final String[] VARIANTS = { "ahead", "behind", "multi5", "twowave" };

	// ------------------------------------------------------- reflected views

	private static Field F_PATH_INDEX;
	private static Field F_ROUTE_PATH;
	private static Field F_ROUTE_NODES;
	private static Field F_SEEN_VERSION;
	private static Field F_STUCK_UNTIL;
	private static Field F_PUSHED;
	private static Field F_CURRENT_NODE;
	private static Field F_DECISION_RNG;
	private static Field F_RANDOM_SEED;

	private static void loadViews() throws Exception {
		F_PATH_INDEX = CReflect.declared(GisAgent.class, "pathIndex");
		F_ROUTE_PATH = CReflect.declared(GisAgent.class, "routePath");
		F_ROUTE_NODES = CReflect.declared(GisAgent.class, "routeNodes");
		F_SEEN_VERSION = CReflect.declared(GisAgent.class, "seenClosureVersion");
		F_STUCK_UNTIL = CReflect.declared(GisAgent.class, "stuckUntilTick");
		F_PUSHED = CReflect.declared(GisAgent.class, "pushedBlockages");
		F_CURRENT_NODE = CReflect.declared(GisAgent.class, "currentNodeId");
		F_DECISION_RNG = CReflect.declared(GisAgent.class, "decisionRng");
		F_RANDOM_SEED = CReflect.declared(java.util.Random.class, "seed");
	}

	private static int pathIndex(GisAgent a) throws Exception {
		return F_PATH_INDEX.getInt(a);
	}

	private static StreetNetwork.NodePath routeNodes(GisAgent a) throws Exception {
		return (StreetNetwork.NodePath) F_ROUTE_NODES.get(a);
	}

	@SuppressWarnings("unchecked")
	private static List<Coordinate> routePath(GisAgent a) throws Exception {
		return (List<Coordinate>) F_ROUTE_PATH.get(a);
	}

	private static long decisionRngState(GisAgent a) throws Exception {
		Object rng = F_DECISION_RNG.get(a);
		if (rng == null) {
			return -1L;
		}
		return ((AtomicLong) F_RANDOM_SEED.get(rng)).get();
	}

	/** Everything an outside observer can see of a resident, before/after a step. */
	private static final class Snap {
		String state;
		int pathIndex;
		int routeNodesLen;
		int routePathLen;
		int seenVersion;
		double stuckUntil;
		long currentNode;
		String target;
		int pushedSize;
		int blockages;
		int pushes;
		int reroutes;
		int stuckEvents;
		double distanceM;
		double airVolumeM3;
		double doseUg;
		double snapGapM;
		long rngState;

		static Snap of(GisAgent a) throws Exception {
			Snap s = new Snap();
			s.state = a.getState().name();
			s.pathIndex = pathIndex(a);
			StreetNetwork.NodePath np = routeNodes(a);
			s.routeNodesLen = np == null ? -1 : np.nodes.size();
			List<Coordinate> rp = routePath(a);
			s.routePathLen = rp == null ? -1 : rp.size();
			s.seenVersion = F_SEEN_VERSION.getInt(a);
			s.stuckUntil = F_STUCK_UNTIL.getDouble(a);
			s.currentNode = F_CURRENT_NODE.getLong(a);
			Shelter t = a.getTargetShelter();
			s.target = t == null ? "" : t.getId();
			java.util.Set<?> pushed = (java.util.Set<?>) F_PUSHED.get(a);
			s.pushedSize = pushed == null ? -1 : pushed.size();
			s.blockages = a.getBlockagesEncountered();
			s.pushes = a.getPushThroughs();
			s.reroutes = a.getReroutes();
			s.stuckEvents = a.getStuckEvents();
			s.distanceM = a.getDistanceTraveledM();
			s.airVolumeM3 = a.getAirVolumeBreathedM3();
			s.doseUg = a.getInhaledDoseUg();
			s.snapGapM = a.getSnapGapM();
			s.rngState = decisionRngState(a);
			return s;
		}

		String cols() {
			return state + "\t" + pathIndex + "\t" + routeNodesLen + "\t" + routePathLen + "\t"
					+ seenVersion + "\t" + Io.hexD(stuckUntil) + "\t" + currentNode + "\t" + target
					+ "\t" + pushedSize + "\t" + blockages + "\t" + pushes + "\t" + reroutes + "\t"
					+ stuckEvents + "\t" + Io.hexD(distanceM) + "\t" + Io.hexD(airVolumeM3) + "\t"
					+ Io.hexD(doseUg) + "\t" + Io.hexD(snapGapM) + "\t" + rngState;
		}

		static String header(String p) {
			return p + "state\t" + p + "path_index\t" + p + "route_nodes\t" + p + "route_path\t"
					+ p + "seen_version\t" + p + "stuck_until_hex\t" + p + "current_node\t"
					+ p + "target\t" + p + "pushed_set\t" + p + "blockages\t" + p + "pushes\t"
					+ p + "reroutes\t" + p + "stucks\t" + p + "dist_m_hex\t" + p + "air_m3_hex\t"
					+ p + "dose_ug_hex\t" + p + "snap_gap_hex\t" + p + "decision_rng_state";
		}
	}

	// ----------------------------------------------------------------- world

	private static final class World {
		Context<Object> context;
		Geography<Object> geography;
		Schedule schedule;
		List<GisAgent> agents = new ArrayList<GisAgent>();
		List<Shelter> shelters;
		SmokeField smoke;
		Recorder recorder;
	}

	/** Steps the traced residents; snapshots them when a recorder is armed. */
	public static final class Driver {
		private final World w;

		Driver(World w) {
			this.w = w;
		}

		/** Invoked by the Repast schedule; must stay public for the scheduler. */
		public void tick() {
			try {
				double tick = w.schedule.getTickCount();
				boolean record = w.recorder != null && w.recorder.wants(tick);
				for (int i = 0; i < w.agents.size(); i++) {
					GisAgent a = w.agents.get(i);
					Snap before = record ? Snap.of(a) : null;
					a.step();
					if (record) {
						w.recorder.row(tick, i, before, Snap.of(a));
					}
				}
				if (w.recorder != null) {
					w.recorder.afterTick(tick);
				}
			} catch (Exception e) {
				throw new RuntimeException(e);
			}
		}
	}

	/** Where the per-tick before/after rows go. */
	private interface Recorder {
		boolean wants(double tick);

		void row(double tick, int agent, Snap before, Snap after) throws Exception;

		void afterTick(double tick) throws Exception;
	}

	// ------------------------------------------------------------------ run

	static void run(CertifiedGraph g, Io.Manifest man, int[] seeds) throws Exception {
		loadViews();
		Certified.resetBlockedState(g.network);

		Io.Sink ticks = man.sink("reaction.ticks", "reaction/ticks.tsv");
		ticks.line("# WP8 agent-reaction oracle -- per-tick before/after snapshots of the "
				+ "CERTIFIED geography.agents.GisAgent.step()");
		ticks.line("# nothing in reactToClosureWave is re-implemented: the columns are read "
				+ "off the agent with reflection, before and after the certified step");
		ticks.line("# doubles are %016x of Double.doubleToRawLongBits; decision_rng_state is the "
				+ "raw java.util.Random internal seed (-1 = no decision layer)");
		ticks.line("# config\tseed\tvariant\tagent\ttick\twave_tick\t" + Snap.header("pre_")
				+ "\t" + Snap.header("post_"));

		Io.Sink events = man.sink("reaction.events", "reaction/events.tsv");
		events.line("# one row per traced walker per ADJUDICATION: every wave tick, plus every "
				+ "tick on which a walker consumed a closure version (a stuck walker defers its "
				+ "scan to the resume tick -- QUIRK 20 -- and that row is not at a wave tick)");
		events.line("# decision is DERIVED from the certified counters, never predicted: "
				+ "PUSH = pushes+1, REROUTE = reroutes+1, GRANDFATHERED = version consumed with "
				+ "no counter moving, NOT_REACHED = step 10 not entered");
		events.line("# config\tseed\tvariant\tagent\twave\tdeferred\tconsumed_version\ttick"
				+ "\tblocked_edges_for_this_agent"
				+ "\tpre_path_index\tahead_edges\tdecision\tstuck_created\tstuck_until_hex"
				+ "\td_blockages\td_pushes\td_reroutes\td_stucks\ttheta_scaled_hex\tbarrier_cost_hex"
				+ "\tmobility_limited\tpet\tbelongings\tdependents\ttheta_z_hex\trng_draws_observed");

		Io.Sink probe = man.sink("reaction.probe", "reaction/probe.tsv");
		probe.line("# the probe pass (NO closures): the certified routeNodes chain of each traced");
		probe.line("# walker at the end of tick T-1, from StreetNetwork.nodesToSource");
		probe.line("# config\tseed\tagent\twave_tick\tpath_index\tk\tnode\tcoord_offset\tahead");

		int totalEvents = 0;
		int totalPush = 0;
		int totalReroute = 0;
		int totalGrandfathered = 0;
		int totalStuck = 0;

		// One pristine shelter set, once: the start-node picker only needs the
		// pre-closure trees and every world below shares the same cached ones.
		List<Shelter> pristineShelters =
				Certified.loadShelters(g.network, Certified.SHELTERS_A_CSV, PRISTINE);
		long[] startNodes = selectStartNodes(g, pristineShelters);
		System.out.println("[WP8] reaction start nodes: " + java.util.Arrays.toString(startNodes));

		for (Cfg cfg : CONFIGS) {
			for (int seed : seeds) {
				// ---- probe pass -------------------------------------------------
				Certified.resetBlockedState(g.network);
				World pw = buildWorld(g, cfg, seed, new ArrayList<int[]>(), 0, 0);
				addAgents(g, pw, cfg, seed, startNodes);

				int waveTick = -1;
				StreetNetwork.NodePath[] chains = new StreetNetwork.NodePath[AGENTS];
				int[] idx = new int[AGENTS];
				for (int t = 1; t <= END_TICK && waveTick < 0; t++) {
					pw.schedule.execute();
					boolean ready = true;
					for (int i = 0; i < AGENTS && ready; i++) {
						GisAgent a = pw.agents.get(i);
						StreetNetwork.NodePath np = routeNodes(a);
						if (np == null || !"EN_ROUTE".equals(a.getState().name())) {
							ready = false;
							break;
						}
						int pi = pathIndex(a);
						if (pi < 1 || aheadEdges(np, pi) < MIN_AHEAD_EDGES) {
							ready = false;
						}
					}
					if (ready) {
						for (int i = 0; i < AGENTS; i++) {
							chains[i] = routeNodes(pw.agents.get(i));
							idx[i] = pathIndex(pw.agents.get(i));
						}
						waveTick = t + 1;
					}
				}
				if (waveTick < 0) {
					throw new IllegalStateException("no tick where all " + AGENTS
							+ " traced walkers are mid-route with >= " + MIN_AHEAD_EDGES
							+ " edges ahead (config " + cfg.name + " seed " + seed + ")");
				}
				for (int i = 0; i < AGENTS; i++) {
					StreetNetwork.NodePath np = chains[i];
					for (int k = 0; k < np.nodes.size(); k++) {
						probe.line(cfg.name + "\t" + seed + "\t" + i + "\t" + waveTick + "\t"
								+ idx[i] + "\t" + k + "\t" + np.nodes.get(k).longValue() + "\t"
								+ np.coordOffset[k] + "\t"
								+ (np.coordOffset[k] >= idx[i] ? 1 : 0));
					}
				}

				// ---- variant passes ---------------------------------------------
				for (String variant : VARIANTS) {
					List<List<long[]>> cand1 = new ArrayList<List<long[]>>();
					List<List<long[]>> cand2 = new ArrayList<List<long[]>>();
					for (int i = 0; i < AGENTS; i++) {
						List<long[]> c1 = new ArrayList<long[]>();
						List<long[]> c2 = new ArrayList<long[]>();
						pickEdges(variant, chains[i], idx[i], c1, c2);
						cand1.add(c1);
						cand2.add(c2);
					}
					if ("behind".equals(variant)) {
						// The traced walkers converge on the same 36 shelters, so one
						// walker's already-passed edge can still be AHEAD of another.
						// Drop those: this variant's claim is "an edge strictly behind
						// EVERY walker moves no counter", so an edge that is ahead of
						// anybody must not be in the wave at all.
						java.util.Set<String> aheadKeys = new java.util.HashSet<String>();
						for (int i = 0; i < AGENTS; i++) {
							StreetNetwork.NodePath np = chains[i];
							for (int k = 0; k + 1 < np.nodes.size(); k++) {
								if (np.coordOffset[k] >= idx[i]) {
									aheadKeys.add(pairKey(np.nodes.get(k).longValue(),
											np.nodes.get(k + 1).longValue()));
								}
							}
						}
						for (List<long[]> c : cand1) {
							c.removeIf(e -> aheadKeys.contains(pairKey(e[0], e[1])));
						}
					}
					List<long[]> wave1 = new ArrayList<long[]>();
					List<long[]> wave2 = new ArrayList<long[]>();
					int[] blockedForAgent = new int[AGENTS];
					for (int i = 0; i < AGENTS; i++) {
						blockedForAgent[i] = cand1.get(i).size();
						wave1.addAll(cand1.get(i));
						wave2.addAll(cand2.get(i));
					}
					int behindCovered = 0;
					for (int i = 0; i < AGENTS; i++) {
						if (blockedForAgent[i] > 0) {
							behindCovered++;
						}
					}
					int wave2Tick = waveTick + (int) TICKS_PER_HOUR;
					List<int[]> plan = new ArrayList<int[]>();
					plan.add(new int[] { waveTick, 0 });
					if (!wave2.isEmpty()) {
						plan.add(new int[] { wave2Tick, 1 });
					}

					Certified.resetBlockedState(g.network);
					World w = buildWorld(g, cfg, seed, plan, waveTick, wave2Tick);
					addAgents(g, w, cfg, seed, startNodes);
					scheduleWaves(w, g, waveTick, wave1, wave2Tick, wave2);

					final int stuckWindow = (int) Math.ceil(cfg.stuckDelayH * TICKS_PER_HOUR) + 3;
					final int w1 = waveTick;
					final int w2 = wave2.isEmpty() ? Integer.MAX_VALUE : wave2Tick;
					final String vn = variant;
					final Snap[] preWave = new Snap[AGENTS];
					final int[] waveNo = { 0 };
					/** [0] GRANDFATHERED at wave 1, [1] NOT_REACHED at wave 1. */
					final int[] wave1Decisions = new int[2];
					w.recorder = new Recorder() {
						@Override
						public boolean wants(double tick) {
							return inWindow(tick, w1, stuckWindow) || inWindow(tick, w2, stuckWindow);
						}

						@Override
						public void row(double tick, int agent, Snap before, Snap after)
								throws Exception {
							ticks.line(cfg.name + "\t" + seed + "\t" + vn + "\t" + agent + "\t"
									+ (long) tick + "\t" + w1 + "\t" + before.cols() + "\t"
									+ after.cols());
							boolean atWave = tick == w1 || tick == w2;
							boolean consumed = after.seenVersion != before.seenVersion;
							// A resident stuck at a blockage skips step 10 entirely, so its
							// scan of a wave that fired DURING the delay is adjudicated on
							// the resume tick, not at the wave tick (QUIRK 20). Those rows
							// would be invisible if this only fired on wave ticks.
							if (atWave || consumed) {
								preWave[agent] = before;
								int wave = tick == w1 ? 1 : (tick == w2 ? 2 : -1);
								waveNo[0] = wave;
								GisAgent a = w.agents.get(agent);
								String decision;
								if (after.blockages > before.blockages) {
									decision = after.pushes > before.pushes ? "PUSH" : "REROUTE";
								} else if (after.seenVersion > before.seenVersion) {
									decision = "GRANDFATHERED";
								} else {
									decision = "NOT_REACHED";
								}
								if (wave == 1 && "GRANDFATHERED".equals(decision)) {
									wave1Decisions[0]++;
								}
								if (wave == 1 && "NOT_REACHED".equals(decision)) {
									wave1Decisions[1]++;
								}
								ELayerSampler.DecisionAttributes da = decisionAttributes(a);
								PopulationSampler.Attributes at = attributes(a);
								events.line(cfg.name + "\t" + seed + "\t" + vn + "\t" + agent + "\t"
										+ wave + "\t" + (atWave ? 0 : 1) + "\t" + after.seenVersion
										+ "\t" + (long) tick + "\t"
										+ (wave == 1 ? blockedForAgent[agent] : -1) + "\t"
										+ before.pathIndex + "\t"
										+ (before.routeNodesLen < 0 ? -1
												: aheadEdges(routeNodesSnapshot(a, before), before.pathIndex))
										+ "\t" + decision + "\t"
										+ (after.stuckEvents > before.stuckEvents ? 1 : 0) + "\t"
										+ Io.hexD(after.stuckUntil) + "\t"
										+ (after.blockages - before.blockages) + "\t"
										+ (after.pushes - before.pushes) + "\t"
										+ (after.reroutes - before.reroutes) + "\t"
										+ (after.stuckEvents - before.stuckEvents) + "\t"
										+ Io.hexD(a.getThetaScaled()) + "\t"
										+ Io.hexD(a.getBarrierCost()) + "\t"
										+ (at != null && at.mobilityLimited ? 1 : 0) + "\t"
										+ (da != null && da.hasPet ? 1 : 0) + "\t"
										+ (da != null && da.heavyBelongings ? 1 : 0) + "\t"
										+ (da != null && da.hasDependents ? 1 : 0) + "\t"
										+ (da == null ? "" : Io.hexD(da.thetaZ)) + "\t"
										+ (before.rngState == after.rngState ? 0 : 1));
							}
						}

						@Override
						public void afterTick(double tick) {
							// no-op: rows are written per agent
						}
					};

					int lastTick = Math.min(END_TICK,
							(wave2.isEmpty() ? waveTick : wave2Tick) + stuckWindow + 2);
					for (int t = 1; t <= lastTick; t++) {
						w.schedule.execute();
					}

					// ---- per-variant assertions ---------------------------------
					int push = 0;
					int rer = 0;
					int grand = 0;
					int stuck = 0;
					for (int i = 0; i < AGENTS; i++) {
						GisAgent a = w.agents.get(i);
						push += a.getPushThroughs();
						rer += a.getReroutes();
						grand += 0;
						stuck += a.getStuckEvents();
						man.check("reaction." + cfg.name + ".s" + seed + "." + variant + ".a" + i
								+ ".identity",
								a.getBlockagesEncountered() == a.getPushThroughs() + a.getReroutes(),
								"blockages=" + a.getBlockagesEncountered() + " pushes="
										+ a.getPushThroughs() + " reroutes=" + a.getReroutes());
						man.check("reaction." + cfg.name + ".s" + seed + "." + variant + ".a" + i
								+ ".stuck<=push",
								a.getStuckEvents() <= a.getPushThroughs(),
								"stucks=" + a.getStuckEvents() + " pushes=" + a.getPushThroughs());
						totalEvents += a.getBlockagesEncountered();
					}
					totalPush += push;
					totalReroute += rer;
					totalStuck += stuck;
					int blockagesHere = 0;
					for (int i = 0; i < AGENTS; i++) {
						blockagesHere += w.agents.get(i).getBlockagesEncountered();
					}
					if ("behind".equals(variant)) {
						man.check("reaction." + cfg.name + ".s" + seed + ".behind.grandfathered",
								blockagesHere == 0,
								blockagesHere + " blockage events (expected 0: every closed edge is "
										+ "behind every walker -- QUIRK 12); " + behindCovered
										+ " of " + AGENTS + " walkers had an own already-passed "
										+ "edge closed");
						man.check("reaction." + cfg.name + ".s" + seed + ".behind.covered",
								behindCovered >= 1, behindCovered + " walkers covered");
						man.check("reaction." + cfg.name + ".s" + seed + ".behind.version-consumed",
								wave1Decisions[0] == AGENTS && wave1Decisions[1] == 0,
								wave1Decisions[0] + " GRANDFATHERED and " + wave1Decisions[1]
										+ " NOT_REACHED at the wave tick (every walker must CONSUME "
										+ "the version in one scan -- QUIRK 9)");
						totalGrandfathered += wave1Decisions[0];
					} else if ("ahead".equals(variant) || "multi5".equals(variant)) {
						man.check("reaction." + cfg.name + ".s" + seed + "." + variant + ".all-hit",
								blockagesHere == AGENTS,
								blockagesHere + " blockage events across " + AGENTS + " walkers");
					}
					if ("multi5".equals(variant)) {
						man.check("reaction." + cfg.name + ".s" + seed + ".multi5.one-per-scan",
								blockagesHere == AGENTS,
								"5 closed edges on each remaining route counted as "
										+ blockagesHere + " blockage(s) across " + AGENTS
										+ " walkers (QUIRK 40 expects " + AGENTS + ")");
					}
					if (cfg.enableDecisionLayer == 0) {
						man.check("reaction.layerOff.s" + seed + "." + variant + ".no-push",
								push == 0, push + " push-throughs with the decision layer OFF "
										+ "(QUIRK 21 expects 0)");
					}
					if ("armedStuck1".equals(cfg.name)) {
						man.check("reaction.armedStuck1.s" + seed + "." + variant + ".stuck==push",
								stuck == push, "stucks=" + stuck + " pushes=" + push
										+ " at pStuck=1.0");
					}
					System.out.println("[WP8] reaction " + cfg.name + " seed " + seed + " "
							+ variant + ": waveTick=" + waveTick + " blockages=" + blockagesHere
							+ " push=" + push + " reroute=" + rer + " stuck=" + stuck);
				}
			}
		}
		probe.close();
		events.close();
		ticks.close();

		man.check("reaction.exercised", totalEvents > 0,
				totalEvents + " blockage events across the synthetic fixtures (the archive has 0)");
		man.check("reaction.both-branches", totalPush > 0 && totalReroute > 0,
				totalPush + " pushes and " + totalReroute + " reroutes observed");
		man.check("reaction.stuck-observed", totalStuck > 0,
				totalStuck + " stuck events observed");
		Certified.resetBlockedState(g.network);
	}

	// --------------------------------------------------------------- helpers

	private static boolean inWindow(double tick, int centre, int after) {
		return centre != Integer.MAX_VALUE && tick >= centre - WINDOW_BEFORE && tick <= centre + after;
	}

	private static int aheadEdges(StreetNetwork.NodePath np, int pathIndex) {
		int n = 0;
		for (int k = 0; k + 1 < np.nodes.size(); k++) {
			if (np.coordOffset[k] >= pathIndex) {
				n++;
			}
		}
		return n;
	}

	private static StreetNetwork.NodePath routeNodesSnapshot(GisAgent a, Snap before)
			throws Exception {
		StreetNetwork.NodePath np = routeNodes(a);
		return np;
	}

	private static ELayerSampler.DecisionAttributes decisionAttributes(GisAgent a) throws Exception {
		return (ELayerSampler.DecisionAttributes)
				CReflect.instanceField(a, GisAgent.class, "decisionAttributes");
	}

	private static PopulationSampler.Attributes attributes(GisAgent a) throws Exception {
		return (PopulationSampler.Attributes) CReflect.instanceField(a, GisAgent.class, "attributes");
	}

	/**
	 * Chooses this variant's closed edges off the probe snapshot. Returns how
	 * many edges were added for this walker.
	 */
	private static int pickEdges(String variant, StreetNetwork.NodePath np, int pathIndex,
			List<long[]> wave1, List<long[]> wave2) {
		int n = np.nodes.size();
		int firstAhead = -1;
		int lastBehind = -1;
		for (int k = 0; k + 1 < n; k++) {
			if (np.coordOffset[k] >= pathIndex) {
				if (firstAhead < 0) {
					firstAhead = k;
				}
			} else {
				lastBehind = k;
			}
		}
		if ("behind".equals(variant)) {
			if (lastBehind < 0) {
				throw new IllegalStateException("no edge behind the walker at pathIndex " + pathIndex);
			}
			wave1.add(edge(np, lastBehind));
			return 1;
		}
		if (firstAhead < 0) {
			throw new IllegalStateException("no edge ahead of the walker at pathIndex " + pathIndex);
		}
		if ("ahead".equals(variant)) {
			wave1.add(edge(np, firstAhead));
			return 1;
		}
		if ("multi5".equals(variant)) {
			int added = 0;
			for (int k = firstAhead; k + 1 < n && added < 5; k++) {
				wave1.add(edge(np, k));
				added++;
			}
			return added;
		}
		if ("twowave".equals(variant)) {
			wave1.add(edge(np, firstAhead));
			int second = -1;
			for (int k = firstAhead + 3; k + 1 < n; k++) {
				second = k;
				break;
			}
			if (second < 0) {
				second = firstAhead;
			}
			wave2.add(edge(np, second));
			return 1;
		}
		throw new IllegalArgumentException(variant);
	}

	/** Same canonical form as {@code GisAgent.pairKey}; used only for set logic. */
	private static String pairKey(long a, long b) {
		return a <= b ? a + ":" + b : b + ":" + a;
	}

	private static long[] edge(StreetNetwork.NodePath np, int k) {
		return new long[] { np.nodes.get(k).longValue(), np.nodes.get(k + 1).longValue() };
	}

	private static void scheduleWaves(World w, CertifiedGraph g, int waveTick, List<long[]> wave1,
			int wave2Tick, List<long[]> wave2) throws Exception {
		w.schedule.schedule(
				ScheduleParameters.createOneTime(waveTick, ScheduleParameters.FIRST_PRIORITY),
				Certified.newClosureWave(g.network, w.shelters, wave1, waveTick / 60), "apply");
		if (!wave2.isEmpty()) {
			w.schedule.schedule(
					ScheduleParameters.createOneTime(wave2Tick, ScheduleParameters.FIRST_PRIORITY),
					Certified.newClosureWave(g.network, w.shelters, wave2, wave2Tick / 60), "apply");
		}
	}

	// ----------------------------------------------------------- world build

	private static World buildWorld(CertifiedGraph g, Cfg cfg, int seed, List<int[]> plan,
			int waveTick, int wave2Tick) throws Exception {
		World w = new World();
		w.schedule = new Schedule();
		DefaultParameters params = new DefaultParameters();
		params.addParameter("minutesPerTick", "minutesPerTick", Double.class,
				Double.valueOf(MINUTES_PER_TICK), false);
		params.addParameter("walkingSpeedMps", "walkingSpeedMps", Double.class,
				Double.valueOf(1.30), false);
		params.addParameter("evacuationThresholdUgM3", "evacuationThresholdUgM3", Double.class,
				Double.valueOf(EVACUATION_THRESHOLD_UGM3), false);
		RunEnvironment.init(w.schedule, null, params, true);

		w.context = new DefaultContext<Object>("ClosureReaction");
		DefaultGeography<Object> geo = new DefaultGeography<Object>("Geography");
		w.context.addProjection(geo);
		w.geography = geo;
		RunState.init();
		RunState.getInstance().setMasterContext(w.context);

		GeometryFactory fac = new GeometryFactory();
		w.shelters = Certified.loadShelters(g.network, Certified.SHELTERS_A_CSV, PRISTINE);
		for (Shelter s : w.shelters) {
			w.context.add(s);
			w.geography.move(s, fac.createPoint(new Coordinate(s.getLon(), s.getLat())));
		}
		w.smoke = new SmokeField(Certified.SMOKE_CSV, "Multnomah", Certified.SIM_START, 1.0);
		// A closure schedule is DECLARED before any resident exists, exactly as at
		// ContextCreator build step 9 -- that is what makes routeNodes allocated.
		g.network.declareClosureSchedule();
		w.schedule.schedule(ScheduleParameters.createRepeating(1, 1), new Driver(w), "tick");
		return w;
	}

	private static void addAgents(CertifiedGraph g, World w, Cfg cfg, int seed, long[] startNodes)
			throws Exception {
		GeometryFactory fac = new GeometryFactory();
		PopulationSampler sampler = new PopulationSampler(seed);
		List<GisAgent> created = new ArrayList<GisAgent>();
		for (int i = 0; i < startNodes.length; i++) {
			Coordinate nodeCoord = g.network.nodeCoordinate(startNodes[i]);
			Coordinate start = new Coordinate(nodeCoord.x + START_OFFSET_LON,
					nodeCoord.y + START_OFFSET_LAT);
			GisAgent agent = new GisAgent("Trace " + i, g.network, startNodes[i],
					"synthetic-" + i, w.smoke);
			agent.setStartCoord(start.x, start.y);
			agent.setAttributes(sampler.sample());
			w.context.add(agent);
			w.geography.move(agent, fac.createPoint(start));
			w.agents.add(agent);
			created.add(agent);
		}
		if (cfg.enableDecisionLayer == 1) {
			// SE-E18's V29-V44 values, except the two documented fixture deviations
			// (enableHazardDeparture=0, pAwareInit=1.0).
			ELayerSampler e = new ELayerSampler(seed, 1.0, 0.284, 0.117, 0.0044, 0.06);
			GisAgent.DecisionConfig dc = new GisAgent.DecisionConfig(
					1,    // informationRegime L1 (SE-E18)
					0,    // enableHazardDeparture OFF -- the legacy latch, synchronous departure
					-8.0, 0.4, 1.1, 0.25, cfg.sigmaTheta, 48.0,
					0.0,  // lambdaOutreachPerDay
					0.26, 0.26, 0.26,
					false, // petPolicyDefault = 0 -> admit-default FALSE
					1.0, 0.2,
					cfg.pushThetaThreshold, cfg.kPush, cfg.pStuck, cfg.stuckDelayH);
			for (GisAgent a : created) {
				a.setDecisionLayer(dc, e.sample());
			}
		}
	}

	/** MovementTrace's deterministic, RNG-free start-node picker. */
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
}
