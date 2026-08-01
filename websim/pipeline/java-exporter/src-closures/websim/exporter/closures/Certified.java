package websim.exporter.closures;

import java.io.File;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import org.locationtech.jts.geom.Coordinate;

import geography.agents.Shelter;
import geography.data.CsvLoader;
import geography.routing.StreetNetwork;

/**
 * WP8 glue: the certified constants, the certified loaders and the two
 * {@code ContextCreator.build()} blocks this oracle mirrors.
 *
 * <p><b>What is certified (invoked, never re-implemented).</b> The shapefile
 * read, graph construction, node ids, geodesic lengths, {@code nearestNode},
 * {@code computeTree}, {@code hasEdge}, {@code blockEdge}, {@code isBlocked},
 * {@code blockedEdgeCount}, {@code bumpClosureVersion}, {@code nodesToSource},
 * the CSV parse, {@code Shelter}, {@code SmokeField}, {@code GisAgent.step()},
 * {@code ELayerSampler} and — the point of this work package —
 * {@code ContextCreator$ClosureWave.apply()} itself, constructed reflectively
 * and driven by a REAL Repast schedule.
 *
 * <p><b>What is mirrored, and why.</b> Exactly two blocks of
 * {@code ContextCreator.build()}, for the same reason {@code WorldFixtures} and
 * {@code MovementTrace} already mirror them ({@code build()} needs a
 * {@code Geography.rs} scenario directory and a full Repast parameter schema):
 * <ul>
 *   <li>the shelter loop, {@code ContextCreator.java:546-591} — CSV order, snap,
 *       tree, {@code shelterList.add} unconditional (QUIRK 33);</li>
 *   <li>the closure-schedule loader, {@code ContextCreator.java:639-707} — the
 *       {@code TreeMap<Integer,List<long[]>>} keyed by activation hour, file
 *       order inside an hour, the phantom census and the inert warning.</li>
 * </ul>
 * Neither block contains a metre of routing arithmetic: the first delegates to
 * {@code nearestNode}/{@code computeTree}, the second only groups rows. The
 * wave itself — block, bump, recompute, in that order — is <b>not</b> mirrored:
 * the certified {@code ClosureWave.apply()} is called.
 */
final class Certified {

	private Certified() { }

	static Class<?> CC;
	static LocalDateTime SIM_START;
	static String STREETS_SHP;
	static String SMOKE_CSV;
	static String SMOKE_SEVERE_CSV;
	static String SMOKE_SEVERE_V2_CSV;
	static String SHELTERS_A_CSV;
	static String SHELTERS_C_CSV;
	static String ENCAMPMENTS_CSV;
	static String CLOSURES_BASE_CSV;
	static String CLOSURES_EXTREME_CSV;
	static String CLOSURES_WORST_PREFIX;
	static String CLOSURES_WORST_SUFFIX;

	private static Constructor<?> CLOSURE_WAVE_CTOR;

	static void load() throws Exception {
		CC = Class.forName("geography.agents.ContextCreator");
		SIM_START = (LocalDateTime) CReflect.staticField(CC, "SIM_START");
		STREETS_SHP = (String) CReflect.staticField(CC, "STREETS_SHP");
		SMOKE_CSV = (String) CReflect.staticField(CC, "SMOKE_CSV");
		SMOKE_SEVERE_CSV = (String) CReflect.staticField(CC, "SMOKE_SEVERE_CSV");
		SMOKE_SEVERE_V2_CSV = (String) CReflect.staticField(CC, "SMOKE_SEVERE_V2_CSV");
		SHELTERS_A_CSV = (String) CReflect.staticField(CC, "SHELTERS_A_CSV");
		SHELTERS_C_CSV = (String) CReflect.staticField(CC, "SHELTERS_C_CSV");
		ENCAMPMENTS_CSV = (String) CReflect.staticField(CC, "ENCAMPMENTS_CSV");
		CLOSURES_BASE_CSV = (String) CReflect.staticField(CC, "CLOSURES_BASE_CSV");
		CLOSURES_EXTREME_CSV = (String) CReflect.staticField(CC, "CLOSURES_EXTREME_CSV");
		CLOSURES_WORST_PREFIX = (String) CReflect.staticField(CC, "CLOSURES_WORST_PREFIX");
		CLOSURES_WORST_SUFFIX = (String) CReflect.staticField(CC, "CLOSURES_WORST_SUFFIX");
		CLOSURE_WAVE_CTOR = CReflect.declaredCtor(
				Class.forName("geography.agents.ContextCreator$ClosureWave"),
				StreetNetwork.class, List.class, List.class, int.class);
	}

	/** {@code ContextCreator.java:640-642} verbatim. */
	static String resolveClosuresCsv(int closuresCode, int closureDraw) {
		if (closuresCode == 0) {
			return null;
		}
		return (closuresCode == 3)
				? CLOSURES_WORST_PREFIX + closureDraw + CLOSURES_WORST_SUFFIX
				: (closuresCode == 2) ? CLOSURES_EXTREME_CSV : CLOSURES_BASE_CSV;
	}

	/** {@code ContextCreator.java:512-513} verbatim. */
	static String resolveSmokeCsv(int smokeSeriesCode) {
		return (smokeSeriesCode == 2) ? SMOKE_SEVERE_V2_CSV
				: (smokeSeriesCode == 1) ? SMOKE_SEVERE_CSV : SMOKE_CSV;
	}

	/** The certified, package-private {@code ClosureWave} constructor. */
	static Object newClosureWave(StreetNetwork network, List<Shelter> shelters,
			List<long[]> edges, int hour) throws Exception {
		return CLOSURE_WAVE_CTOR.newInstance(network, shelters, edges, Integer.valueOf(hour));
	}

	// ------------------------------------------------------------- shelters

	/**
	 * Mirror of {@code ContextCreator.java:546-591} reduced to what a closure
	 * wave can observe: CSV FILE ORDER, the certified snap, the certified tree,
	 * and {@code shelterList.add(shelter)} performed unconditionally so
	 * non-operating rows are recomputed too (QUIRK 33). Opening windows, triage
	 * reserves and the pet/adults policy columns are omitted: nothing in
	 * {@code ClosureWave.apply()} reads them.
	 */
	static List<Shelter> loadShelters(StreetNetwork network, String sheltersCsv) {
		return loadShelters(network, sheltersCsv, null);
	}

	/**
	 * @param pristineCache when non-null AND the network carries no blocked edge,
	 *                      trees are computed once per distinct source node and
	 *                      shared. A {@code ShortestPathTree} is immutable and
	 *                      {@code computeTree} is a pure function of (graph,
	 *                      blocked set, source), so this changes no value — it
	 *                      only stops the 45 reaction worlds from recomputing the
	 *                      same 36 SSSPs. It is refused outright once anything is
	 *                      blocked.
	 */
	static List<Shelter> loadShelters(StreetNetwork network, String sheltersCsv,
			Map<Long, StreetNetwork.ShortestPathTree> pristineCache) {
		if (pristineCache != null && network.blockedEdgeCount() != 0) {
			throw new IllegalStateException("pristine tree cache requested on a blocked network");
		}
		List<Shelter> out = new ArrayList<Shelter>();
		for (Map<String, String> r : CsvLoader.read(sheltersCsv)) {
			String capStr = r.get("capacity");
			Integer capacity = (capStr == null || capStr.isEmpty()) ? null : Integer.valueOf(capStr);
			boolean operating = "operating".equalsIgnoreCase(r.get("status"));
			double lon = Double.parseDouble(r.get("lon"));
			double lat = Double.parseDouble(r.get("lat"));
			Shelter shelter = new Shelter(r.get("shelter_id"), r.get("name"), capacity, operating, lon, lat);
			long nodeId = network.nearestNode(new Coordinate(lon, lat));
			shelter.setGraphNodeId(nodeId);
			StreetNetwork.ShortestPathTree tree = null;
			if (pristineCache != null) {
				tree = pristineCache.get(Long.valueOf(nodeId));
			}
			if (tree == null) {
				tree = network.computeTree(nodeId);
				if (pristineCache != null) {
					pristineCache.put(Long.valueOf(nodeId), tree);
				}
			}
			shelter.setRouteTree(tree);
			out.add(shelter);
		}
		return out;
	}

	// ------------------------------------------------------ closure schedule

	/** One scheduled closure row, as the CSV carries it. */
	static final class Row {
		final long nodeA;
		final long nodeB;
		final int hour;
		final String label;
		final String kind;
		final int rowNo;
		final boolean matchesGraphEdge;

		Row(long nodeA, long nodeB, int hour, String label, String kind, int rowNo,
				boolean matchesGraphEdge) {
			this.nodeA = nodeA;
			this.nodeB = nodeB;
			this.hour = hour;
			this.label = label;
			this.kind = kind;
			this.rowNo = rowNo;
			this.matchesGraphEdge = matchesGraphEdge;
		}
	}

	/** The parsed schedule: waves in ascending hour, file order inside an hour. */
	static final class Schedule {
		final String csvPath;
		/** hour -> the wave's {@code long[]{a,b}} rows, in FILE ORDER. */
		final TreeMap<Integer, List<long[]>> waves = new TreeMap<Integer, List<long[]>>();
		/** hour -> the same rows with their CSV metadata, for the dump. */
		final TreeMap<Integer, List<Row>> rowsByHour = new TreeMap<Integer, List<Row>>();
		final List<Row> rowsInFileOrder = new ArrayList<Row>();
		int scheduledEdges;
		int matchingGraphEdges;
		int inertRows;

		Schedule(String csvPath) {
			this.csvPath = csvPath;
		}

		List<Integer> waveHours() {
			return new ArrayList<Integer>(waves.keySet());
		}
	}

	/**
	 * Mirror of the closure loader, {@code ContextCreator.java:646-679}. The
	 * {@code hour >= endHours} inert WARNING is recorded (never used to skip a
	 * wave — QUIRK 1); the firing rule is {@code waveTick <= endTick}.
	 */
	static Schedule loadClosureSchedule(StreetNetwork network, String closuresCsv, int endHours) {
		Schedule s = new Schedule(closuresCsv);
		int rowNo = 1; // header is row 1; data starts at 2
		for (Map<String, String> r : CsvLoader.read(closuresCsv)) {
			rowNo++;
			long a;
			long b;
			int hour;
			try {
				a = Long.parseLong(r.get("node_a").trim());
				b = Long.parseLong(r.get("node_b").trim());
				hour = Integer.parseInt(r.get("activation_hour").trim());
			} catch (RuntimeException bad) {
				throw new IllegalStateException(closuresCsv + " row " + rowNo + " is malformed", bad);
			}
			if (hour < 0) {
				throw new IllegalStateException(closuresCsv + " row " + rowNo
						+ ": negative activation_hour " + hour);
			}
			if (hour >= endHours) {
				s.inertRows++;
			}
			Integer key = Integer.valueOf(hour);
			List<long[]> wave = s.waves.get(key);
			if (wave == null) {
				wave = new ArrayList<long[]>();
				s.waves.put(key, wave);
				s.rowsByHour.put(key, new ArrayList<Row>());
			}
			wave.add(new long[] { a, b });
			s.scheduledEdges++;
			boolean match = network.hasEdge(a, b);
			if (match) {
				s.matchingGraphEdges++;
			}
			Row row = new Row(a, b, hour, r.get("label"), r.get("kind"), rowNo, match);
			s.rowsByHour.get(key).add(row);
			s.rowsInFileOrder.add(row);
		}
		return s;
	}

	// --------------------------------------------------------- network reset

	/**
	 * Restores a {@link StreetNetwork} to its pristine, never-blocked state.
	 *
	 * <p>The certified class has no un-block operation (nothing in the model
	 * ever needs one), so the two fields the closure runtime writes are cleared
	 * directly: {@code blockedAdj} and {@code closureVersion}. This is a STATE
	 * reset, not a behaviour re-implementation — and it is verified rather than
	 * trusted: {@link ClosureOracle} re-digests a pristine shelter tree after
	 * every reset and fails the run if it differs from the digest taken before
	 * any edge was ever blocked.
	 */
	@SuppressWarnings("unchecked")
	static void resetBlockedState(StreetNetwork network) throws Exception {
		Map<Long, Set<Long>> blockedAdj = (Map<Long, Set<Long>>)
				CReflect.instanceField(network, StreetNetwork.class, "blockedAdj");
		blockedAdj.clear();
		CReflect.declared(StreetNetwork.class, "closureVersion").setInt(network, 0);
		if (network.blockedEdgeCount() != 0 || network.getClosureVersion() != 0) {
			throw new IllegalStateException("blocked-state reset failed");
		}
	}

	// --------------------------------------------------- feature-level view

	/**
	 * The per-feature view the ARCHIVED connectivity reports are written in.
	 *
	 * <p>{@code scripts/build_closures_E.py} keys its blocked set on
	 * {@code pair_key = (min(attr_f, attr_t), max(attr_f, attr_t))} — RLIS
	 * <i>attribute</i> node ids — while {@code ClosureWave.apply()} keys the
	 * model's blocked set on GRAPH node ids. They coincide except at the 25
	 * corrected node sites. Both readings are computed and compared, so a
	 * divergence is reported rather than assumed away.
	 *
	 * <p>Everything here is READ from the certified {@code StreetNetwork}
	 * ({@code rawStreets} + the private {@code resolveGraphId}); no id, length
	 * or endpoint is recomputed.
	 */
	static final class Features {
		final int count;
		final long[] attrFrom;
		final long[] attrTo;
		final long[] graphFrom;
		final long[] graphTo;
		/** Node ids in FIRST-TOUCH feature order — Python's dict-insertion order. */
		final long[] nodeDiscoveryOrder;
		/** node id -> index into {@link #nodeDiscoveryOrder}. */
		final Map<Long, Integer> nodeSlot;
		/** node slot -> the feature indices incident to it (both directions). */
		final int[][] incidentFeatures;

		private Features(int count, long[] attrFrom, long[] attrTo, long[] graphFrom, long[] graphTo,
				long[] nodeDiscoveryOrder, Map<Long, Integer> nodeSlot, int[][] incidentFeatures) {
			this.count = count;
			this.attrFrom = attrFrom;
			this.attrTo = attrTo;
			this.graphFrom = graphFrom;
			this.graphTo = graphTo;
			this.nodeDiscoveryOrder = nodeDiscoveryOrder;
			this.nodeSlot = nodeSlot;
			this.incidentFeatures = incidentFeatures;
		}

		static Features read(StreetNetwork network) throws Exception {
			List<?> rawStreets = (List<?>) CReflect.instanceField(network, StreetNetwork.class, "rawStreets");
			Class<?> rsCls = Class.forName("geography.routing.StreetNetwork$RawStreet");
			java.lang.reflect.Field rsF = CReflect.declared(rsCls, "fNode");
			java.lang.reflect.Field rsT = CReflect.declared(rsCls, "tNode");
			java.lang.reflect.Field rsCoords = CReflect.declared(rsCls, "coords");
			Method mResolve = CReflect.declaredMethod(StreetNetwork.class, "resolveGraphId",
					long.class, Coordinate.class);

			int n = rawStreets.size();
			long[] aF = new long[n];
			long[] aT = new long[n];
			long[] gF = new long[n];
			long[] gT = new long[n];
			Map<Long, Integer> slot = new LinkedHashMap<Long, Integer>(n * 3);
			List<List<Integer>> incident = new ArrayList<List<Integer>>();
			for (int i = 0; i < n; i++) {
				Object r = rawStreets.get(i);
				long fN = rsF.getLong(r);
				long tN = rsT.getLong(r);
				Coordinate[] cs = (Coordinate[]) rsCoords.get(r);
				long f = ((Long) mResolve.invoke(network, Long.valueOf(fN), cs[0])).longValue();
				long t = ((Long) mResolve.invoke(network, Long.valueOf(tN), cs[cs.length - 1])).longValue();
				aF[i] = fN;
				aT[i] = tN;
				gF[i] = f;
				gT[i] = t;
				for (long g : new long[] { f, t }) {
					Long key = Long.valueOf(g);
					Integer sl = slot.get(key);
					if (sl == null) {
						sl = Integer.valueOf(slot.size());
						slot.put(key, sl);
						incident.add(new ArrayList<Integer>(4));
					}
					incident.get(sl.intValue()).add(Integer.valueOf(i));
				}
			}
			long[] order = new long[slot.size()];
			for (Map.Entry<Long, Integer> e : slot.entrySet()) {
				order[e.getValue().intValue()] = e.getKey().longValue();
			}
			int[][] inc = new int[slot.size()][];
			for (int i = 0; i < inc.length; i++) {
				List<Integer> l = incident.get(i);
				int[] a = new int[l.size()];
				for (int k = 0; k < a.length; k++) {
					a[k] = l.get(k).intValue();
				}
				inc[i] = a;
			}
			return new Features(n, aF, aT, gF, gT, order, slot, inc);
		}
	}

	/** Snaps every row of a lon/lat CSV with the certified {@code nearestNode}. */
	static long[] snapCsv(StreetNetwork network, String csvPath) {
		List<Map<String, String>> rows = CsvLoader.read(csvPath);
		List<Long> out = new ArrayList<Long>(rows.size());
		for (Map<String, String> r : rows) {
			try {
				Coordinate c = new Coordinate(Double.parseDouble(r.get("lon")),
						Double.parseDouble(r.get("lat")));
				out.add(Long.valueOf(network.nearestNode(c)));
			} catch (RuntimeException ignore) {
				// mirrors ContextCreator's `catch (Exception ignore)` on camp rows
			}
		}
		long[] a = new long[out.size()];
		for (int i = 0; i < a.length; i++) {
			a[i] = out.get(i).longValue();
		}
		return a;
	}

	/** Shelter ids, in CSV file order (for the S1/S2 stranded/severed lists). */
	static List<String> shelterIds(String csvPath) {
		List<String> ids = new ArrayList<String>();
		for (Map<String, String> r : CsvLoader.read(csvPath)) {
			ids.add(r.get("shelter_id"));
		}
		return ids;
	}

	static File geographyFile(String relative) {
		return new File("./" + relative);
	}
}
