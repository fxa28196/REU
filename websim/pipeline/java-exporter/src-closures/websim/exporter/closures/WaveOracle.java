package websim.exporter.closures;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import geography.agents.Shelter;
import geography.env.SmokeField;
import geography.routing.StreetNetwork;

import repast.simphony.engine.environment.RunEnvironment;
import repast.simphony.engine.schedule.Schedule;
import repast.simphony.engine.schedule.ScheduleParameters;
import repast.simphony.parameter.DefaultParameters;

import websim.exporter.world.CertifiedGraph;
import websim.exporter.world.Io;

/**
 * WP8 part 1 — the <b>closure-wave oracle</b>.
 *
 * <p>Stands up a real Repast schedule, hands it the certified
 * {@code ContextCreator$ClosureWave} objects at
 * {@code activation_hour * ticksPerHour} with {@code FIRST_PRIORITY} exactly as
 * {@code ContextCreator.java:680-691} does, executes it, and reads the result
 * out after every wave.
 *
 * <p><b>The wave itself is never re-implemented.</b> Block-then-bump-then-
 * recompute, the {@code hasEdge} phantom guard, {@code blockedEdgeCount()}'s
 * {@code directed/2} truncation and the 36 shelter-tree recomputes all happen
 * inside {@code ClosureWave.apply()}; this class constructs the object
 * reflectively (the constructor is package-private), schedules it, and dumps
 * what the certified network says afterwards.
 *
 * <p>Dumped per config, per wave:
 * <ul>
 *   <li>{@code edges.tsv} — the ordered set of scheduled edges, in CSV FILE
 *       ORDER within the wave, each with its {@code hasEdge} guard outcome;</li>
 *   <li>{@code blocked-pairs.tsv} — the canonical {@code min:max} blocked pair
 *       set after the wave (cumulative), ascending;</li>
 *   <li>{@code waves.tsv} — hour, tick, rows, matching rows,
 *       {@code blockedEdgeCount()} and {@code getClosureVersion()} after;</li>
 *   <li>{@code trees.tsv} — for every shelter in shelter-CSV LOAD ORDER, the
 *       source node, the reachable-node count and the SHA-256 over the FULL
 *       distance+predecessor array ({@link TreeCodec});</li>
 *   <li>{@code trees-sample.tsv} — {@value TreeCodec#SAMPLE_ROWS}
 *       stride-sampled raw-hex rows per tree per wave state.</li>
 * </ul>
 * Wave state {@code 0} is the pre-closure world, so the dump also certifies
 * what the waves changed FROM.
 */
final class WaveOracle {

	private WaveOracle() { }

	/** Result carried back to {@link ClosureOracle} for cross-seed checks. */
	static final class Outcome {
		final List<String> waveRollups = new ArrayList<String>();
		final List<Integer> waveHours = new ArrayList<Integer>();
		int scheduledEdges;
		int matchingGraphEdges;
		int blockedAtEnd;
		int versionAtEnd;
		String closuresCsv;
	}

	static Outcome run(CertifiedGraph g, Io.Manifest man, RunConfig cfg, boolean writeDumps,
			boolean fullTrees) throws Exception {
		Outcome out = new Outcome();
		String tag = cfg.label + "/seed" + cfg.seed;

		// ---- config, exactly as ContextCreator reads it --------------------
		int scenarioCode = cfg.intOr("scenarioCode", 0);
		double minutesPerTick = cfg.doubleOr("minutesPerTick", 1.0);
		int simulationHours = cfg.intOr("simulationHours", 0);
		int smokeSeriesCode = cfg.intOr("smokeSeriesCode", 0);
		double smokeScale = cfg.doubleOr("smokeScale", 1.0);
		int closuresCode = cfg.intOr("closuresCode", 0);
		int closureDraw = cfg.intOr("closureDraw", 1);
		String sheltersCsv = sheltersCsvFor(scenarioCode);
		String smokeCsv = Certified.resolveSmokeCsv(smokeSeriesCode);
		String closuresCsv = Certified.resolveClosuresCsv(closuresCode, closureDraw);
		out.closuresCsv = closuresCsv;
		if (closuresCsv == null) {
			throw new IllegalStateException(cfg.batchFile + " has closuresCode=0 -- not a closure config");
		}
		double ticksPerHour = 60.0 / minutesPerTick;

		SmokeField smoke = new SmokeField(smokeCsv, "Multnomah", Certified.SIM_START, smokeScale);
		int endHours = Math.min(simulationHours, smoke.hours());
		double endTick = endHours * ticksPerHour;

		// ---- pristine graph -------------------------------------------------
		Certified.resetBlockedState(g.network);

		List<Shelter> shelters = Certified.loadShelters(g.network, sheltersCsv);
		g.network.declareClosureSchedule();
		Certified.Schedule sched = Certified.loadClosureSchedule(g.network, closuresCsv, endHours);
		out.scheduledEdges = sched.scheduledEdges;
		out.matchingGraphEdges = sched.matchingGraphEdges;

		// ---- sinks -----------------------------------------------------------
		Io.Sink waves = null;
		Io.Sink edges = null;
		Io.Sink pairs = null;
		Io.Sink trees = null;
		Io.Sink sample = null;
		if (writeDumps) {
			waves = man.sink("waves." + cfg.label + ".waves", "waves/" + cfg.label + "/waves.tsv");
			waves.line("# WP8 closure-wave oracle -- " + cfg.label + " (" + cfg.batchFile + ")");
			waves.line("# produced by websim.exporter.closures.WaveOracle from the CERTIFIED "
					+ "geography.agents.ContextCreator$ClosureWave.apply(); the wave is not re-implemented");
			waves.line("# schedule=" + closuresCsv + " shelters=" + sheltersCsv
					+ " minutesPerTick=" + minutesPerTick + " endHours=" + endHours
					+ " endTick=" + (long) endTick);
			waves.line("# wave\thour\ttick\trows_in_wave\tmatching_in_wave\tblocked_edge_count_after"
					+ "\tclosure_version_after\tshelter_trees\ttree_rollup_sha256\tinert_warned");

			edges = man.sink("waves." + cfg.label + ".edges", "waves/" + cfg.label + "/edges.tsv");
			edges.line("# ordered set of edges each wave BLOCKS, in CSV file order within the wave");
			edges.line("# `has_edge` is the certified StreetNetwork.hasEdge guard applied by "
					+ "ClosureWave.apply(); a false row blocks nothing (QUIRK 5)");
			edges.line("# wave\thour\torder_in_wave\tcsv_row\tnode_a\tnode_b\thas_edge\tlabel\tkind");

			pairs = man.sink("waves." + cfg.label + ".pairs", "waves/" + cfg.label + "/blocked-pairs.tsv");
			pairs.line("# CUMULATIVE blocked undirected pair set after each wave, canonical min:max,");
			pairs.line("# ascending by (min,max). Read out of the certified StreetNetwork.blockedAdj.");
			pairs.line("# wave\thour\tmin_node\tmax_node");

			trees = man.sink("waves." + cfg.label + ".trees", "waves/" + cfg.label + "/trees.tsv");
			trees.line("# recomputed shelter trees, SHELTER-CSV LOAD ORDER (ContextCreator.java:545,589)");
			trees.line("# wave 0 = the pre-closure world. sha256 covers the FULL distance+predecessor");
			trees.line("# array in the WP5 ShelterTrees row form: <node_id>\\t<dist_m_hex>\\t"
					+ "<pred_directed_edge>\\n, ascending node id, UTF-8, LF. See DR-WP8-closure-oracle.md.");
			trees.line("# wave\thour\tshelter_idx\tshelter_id\toperating\tsource_node\treachable_nodes"
					+ "\tdist_pred_sha256");

			sample = man.sink("waves." + cfg.label + ".treesample",
					"waves/" + cfg.label + "/trees-sample.tsv");
			sample.line("# deterministic stride subset (" + TreeCodec.SAMPLE_ROWS
					+ " rows/tree, endpoints included) of the arrays digested in trees.tsv");
			sample.line("# indices from Io.stride(reachable, " + TreeCodec.SAMPLE_ROWS + ")");
			sample.line("# wave\tshelter_idx\tnode_id\tdist_m_hex\tpred_directed_edge");
		}

		// ---- a REAL Repast schedule carrying the certified waves -------------
		Schedule schedule = new Schedule();
		DefaultParameters params = new DefaultParameters();
		params.addParameter("minutesPerTick", "minutesPerTick", Double.class,
				Double.valueOf(minutesPerTick), false);
		RunEnvironment.init(schedule, null, params, true);
		RunEnvironment.getInstance().endAt(endTick);

		List<Integer> hours = sched.waveHours();
		for (Map.Entry<Integer, List<long[]>> w : sched.waves.entrySet()) {
			int hour = w.getKey().intValue();
			double waveTick = hour * ticksPerHour;
			if (waveTick != Math.rint(waveTick)) {
				throw new IllegalStateException("non-integral wave tick " + waveTick
						+ " at hour " + hour + " (QUIRK 3)");
			}
			schedule.schedule(
					ScheduleParameters.createOneTime(waveTick, ScheduleParameters.FIRST_PRIORITY),
					Certified.newClosureWave(g.network, shelters, w.getValue(), hour), "apply");
		}

		// ---- wave state 0: the pre-closure world -----------------------------
		String rollup0 = dumpTrees(g, shelters, 0, -1, trees, fullTrees ? man : null, sample, cfg);
		out.waveRollups.add(rollup0);
		if (waves != null) {
			waves.line("0\t-1\t-1\t0\t0\t" + g.network.blockedEdgeCount() + "\t"
					+ g.network.getClosureVersion() + "\t" + shelters.size() + "\t" + rollup0 + "\t0");
		}

		// ---- fire every wave through the real scheduler -----------------------
		int waveIdx = 0;
		for (Integer hourKey : hours) {
			int hour = hourKey.intValue();
			double expectTick = hour * ticksPerHour;
			int versionBefore = g.network.getClosureVersion();
			long t0 = System.nanoTime();
			schedule.execute();
			double now = schedule.getTickCount();
			if (now != expectTick) {
				throw new IllegalStateException("schedule executed tick " + now
						+ ", expected wave tick " + expectTick + " (hour " + hour + ")");
			}
			if (g.network.getClosureVersion() != versionBefore + 1) {
				throw new IllegalStateException("wave at hour " + hour + " did not bump the version");
			}
			waveIdx++;
			List<Certified.Row> rows = sched.rowsByHour.get(hourKey);
			int matchingInWave = 0;
			for (Certified.Row r : rows) {
				if (r.matchesGraphEdge) {
					matchingInWave++;
				}
			}
			if (edges != null) {
				int order = 0;
				for (Certified.Row r : rows) {
					edges.line(waveIdx + "\t" + hour + "\t" + order + "\t" + r.rowNo + "\t"
							+ r.nodeA + "\t" + r.nodeB + "\t" + (r.matchesGraphEdge ? 1 : 0) + "\t"
							+ nz(r.label) + "\t" + nz(r.kind));
					order++;
				}
			}
			if (pairs != null) {
				for (long[] p : blockedPairs(g.network)) {
					pairs.line(waveIdx + "\t" + hour + "\t" + p[0] + "\t" + p[1]);
				}
			}
			String rollup = dumpTrees(g, shelters, waveIdx, hour, trees, fullTrees ? man : null,
					sample, cfg);
			out.waveRollups.add(rollup);
			out.waveHours.add(hourKey);
			if (waves != null) {
				waves.line(waveIdx + "\t" + hour + "\t" + (long) expectTick + "\t" + rows.size()
						+ "\t" + matchingInWave + "\t" + g.network.blockedEdgeCount() + "\t"
						+ g.network.getClosureVersion() + "\t" + shelters.size() + "\t" + rollup
						+ "\t" + (hour >= endHours ? 1 : 0));
			}
			System.out.printf("[WP8] %s wave %d (hour %d, tick %.0f): %d rows, %d matching, "
					+ "%d blocked total, version %d, %d trees in %.1f s%n",
					tag, waveIdx, hour, expectTick, rows.size(), matchingInWave,
					g.network.blockedEdgeCount(), g.network.getClosureVersion(), shelters.size(),
					(System.nanoTime() - t0) / 1e9);
		}
		out.blockedAtEnd = g.network.blockedEdgeCount();
		out.versionAtEnd = g.network.getClosureVersion();

		// ---- gate (k), against the CSV, from the LIVE network ----------------
		man.check("wave." + tag + ".every-wave-fired", out.versionAtEnd == hours.size(),
				"closure_version_at_end=" + out.versionAtEnd + " waves=" + hours.size());
		man.check("wave." + tag + ".scheduled==rows",
				out.scheduledEdges == sched.rowsInFileOrder.size(),
				out.scheduledEdges + " scheduled rows");
		man.check("wave." + tag + ".blocked==distinct-pairs",
				out.blockedAtEnd == distinctPairs(sched),
				"blocked_edges_at_end=" + out.blockedAtEnd + " distinct CSV pairs="
						+ distinctPairs(sched));
		man.check("wave." + tag + ".no-self-loop", noSelfLoop(sched),
				"no scheduled pair has node_a == node_b (QUIRK 4)");
		man.check("wave." + tag + ".matching==scheduled",
				out.matchingGraphEdges == out.scheduledEdges,
				out.matchingGraphEdges + " of " + out.scheduledEdges + " rows match a graph edge");
		man.check("wave." + tag + ".wave-hours", hours.equals(ascendingDistinctHours(sched)),
				"wave_hours=" + hours);
		man.check("wave." + tag + ".all-waves-inside-run", hours.get(hours.size() - 1).intValue() <= endHours,
				"last wave hour " + hours.get(hours.size() - 1) + " <= endHours " + endHours);

		if (waves != null) {
			waves.close();
			edges.close();
			pairs.close();
			trees.close();
			sample.close();
		}
		return out;
	}

	// ---------------------------------------------------------------- helpers

	private static String dumpTrees(CertifiedGraph g, List<Shelter> shelters, int waveIdx, int hour,
			Io.Sink trees, Io.Manifest fullMan, Io.Sink sample, RunConfig cfg) throws Exception {
		List<String> perTree = new ArrayList<String>(shelters.size());
		for (int i = 0; i < shelters.size(); i++) {
			Shelter s = shelters.get(i);
			StreetNetwork.ShortestPathTree tree = s.getRouteTree();
			Io.Sink full = null;
			if (fullMan != null) {
				full = fullMan.sink("trees." + cfg.label + ".w" + waveIdx + ".s" + i,
						String.format(java.util.Locale.ROOT, "waves/%s/full-trees/wave-%d/tree-%03d.tsv",
								cfg.label, waveIdx, i));
			}
			TreeCodec.Digest d = TreeCodec.digest(tree, g, sample, full,
					waveIdx + "\t" + i + "\t");
			if (full != null) {
				full.close();
			}
			perTree.add(d.sha256);
			if (trees != null) {
				trees.line(waveIdx + "\t" + hour + "\t" + i + "\t" + s.getId() + "\t"
						+ (s.isOperating() ? 1 : 0) + "\t" + d.sourceNode + "\t" + d.reachable
						+ "\t" + d.sha256);
			}
		}
		return TreeCodec.rollup(perTree);
	}

	@SuppressWarnings("unchecked")
	private static List<long[]> blockedPairs(StreetNetwork network) throws Exception {
		Map<Long, java.util.Set<Long>> blockedAdj = (Map<Long, java.util.Set<Long>>)
				CReflect.instanceField(network, StreetNetwork.class, "blockedAdj");
		List<long[]> out = new ArrayList<long[]>();
		for (Map.Entry<Long, java.util.Set<Long>> e : blockedAdj.entrySet()) {
			long a = e.getKey().longValue();
			for (Long bb : e.getValue()) {
				long b = bb.longValue();
				if (a <= b) {
					out.add(new long[] { a, b });
				}
			}
		}
		out.sort((x, y) -> x[0] != y[0] ? Long.compare(x[0], y[0]) : Long.compare(x[1], y[1]));
		return out;
	}

	private static int distinctPairs(Certified.Schedule s) {
		java.util.Set<String> seen = new java.util.HashSet<String>();
		for (Certified.Row r : s.rowsInFileOrder) {
			long a = Math.min(r.nodeA, r.nodeB);
			long b = Math.max(r.nodeA, r.nodeB);
			seen.add(a + ":" + b);
		}
		return seen.size();
	}

	private static boolean noSelfLoop(Certified.Schedule s) {
		for (Certified.Row r : s.rowsInFileOrder) {
			if (r.nodeA == r.nodeB) {
				return false;
			}
		}
		return true;
	}

	private static List<Integer> ascendingDistinctHours(Certified.Schedule s) {
		java.util.TreeSet<Integer> t = new java.util.TreeSet<Integer>();
		for (Certified.Row r : s.rowsInFileOrder) {
			t.add(Integer.valueOf(r.hour));
		}
		return new ArrayList<Integer>(t);
	}

	private static String nz(String s) {
		return s == null ? "" : s;
	}

	/** {@code ContextCreator.java:343-423}, restricted to the Scenario-E codes. */
	static String sheltersCsvFor(int scenarioCode) {
		if (scenarioCode == 18 || scenarioCode == 0) {
			return Certified.SHELTERS_A_CSV;
		}
		if (scenarioCode == 19) {
			return Certified.SHELTERS_C_CSV;
		}
		throw new IllegalStateException("scenarioCode " + scenarioCode
				+ " is outside this oracle's supported set {0, 18, 19}; add the mapping "
				+ "from ContextCreator.java:343-423 before dumping it");
	}

	static String describe(RunConfig cfg) {
		return cfg.describe("scenarioCode", "simulationHours", "minutesPerTick", "smokeSeriesCode",
				"closuresCode", "closureDraw", "enableDecisionLayer", "sigmaTheta",
				"pushThetaThreshold", "kPush", "pStuck", "stuckDelayH", "randomSeed");
	}

	static boolean sameWaveInputs(RunConfig a, RunConfig b) {
		String[] keys = { "scenarioCode", "simulationHours", "minutesPerTick", "smokeSeriesCode",
				"smokeScale", "closuresCode", "closureDraw" };
		for (String k : keys) {
			String va = a.declared.get(k);
			String vb = b.declared.get(k);
			if (va == null ? vb != null : !va.equals(vb)) {
				return false;
			}
		}
		return true;
	}

	static String join(List<String> l) {
		return Arrays.toString(l.toArray());
	}
}
