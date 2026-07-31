package websim.exporter.world;

import java.io.File;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.geom.MultiLineString;
import org.opengis.feature.simple.SimpleFeature;

import geography.routing.StreetNetwork;

/**
 * TASK F1 — the certified corrected pedestrian graph, built headlessly and made
 * addressable so shortest-path trees can be exported with stable identities.
 *
 * <p><b>Nothing certified is re-implemented here.</b> Every geodesic length,
 * every node id (including the synthetic negatives), the order-dependent
 * corrupt-node correction, the adjacency order, {@code nearestNode} and
 * {@code computeTree} come from {@link StreetNetwork}; the shapefile read,
 * reprojection, U-27 TYPE set and name resolution come from
 * {@code geography.agents.ContextCreator} by reflection (the DR-S2 pattern).
 *
 * <p><b>The one mirrored block</b> is {@code ContextCreator.build()}'s
 * per-feature loop (ContextCreator.java L455–L486), which cannot be invoked in
 * isolation because {@code build()} also needs a live Repast {@code Context},
 * {@code Geography} projection and {@code RunEnvironment}. The mirror is
 * statement-for-statement identical except that it omits the two display-only
 * side effects ({@code new PortlandStreet(...)}, {@code geography.move(...)}),
 * which touch no graph state. Three independent guards keep the mirror honest:
 * <ol>
 *   <li>the adjacency is reconstructed from {@code rawStreets} + the certified
 *       {@code resolveGraphId} and diffed against the certified {@code adjacency}
 *       map by raw IEEE-754 bits (expected 0 mismatches);</li>
 *   <li>the resulting {@link StreetNetwork.ValidationReport} census is asserted
 *       against the established post-U-27 production numbers (see
 *       {@link #CENSUS_NODES} and friends) and the run FAILS if it drifts;</li>
 *   <li>the same mirror already exists in {@code GraphExport.java} (spike S2)
 *       and both must produce the same census — checked by (2).</li>
 * </ol>
 */
public final class CertifiedGraph {

	// ---- ESTABLISHED FACT (post-U-27 production graph; DR-S2 §3). -----------
	// 153 of 154 archived manifests record exactly these. The plan/PORT_MAP
	// figures "4 reattached / 23 split / 27 affected / 154 components / 60,444
	// largest" describe the PRE-U-27 graph. NEVER "correct" toward those.
	public static final int CENSUS_NODES = 88100;
	public static final int CENSUS_UNDIRECTED_EDGES = 109434;
	public static final int CENSUS_COMPONENTS = 171;
	public static final int CENSUS_LARGEST_COMPONENT = 59725;
	public static final int CENSUS_AFFECTED_ATTR_IDS = 25;
	public static final int CENSUS_REATTACHED = 3;
	public static final int CENSUS_SPLIT_SYNTHETIC = 22;

	public final StreetNetwork network;
	public final StreetNetwork.ValidationReport report;

	/** All graph node ids, ascending (includes the 22 synthetic negatives). */
	public final long[] nodeIdsAscending;

	/**
	 * Stable identity for a directed {@link StreetNetwork.Edge} instance:
	 * {@code featureIndex * 2 + (0 = oriented fromNode->toNode as loaded,
	 * 1 = the reversed back-edge)}. Feature index is the position of the street
	 * feature in the certified {@code rawStreets} list, i.e. shapefile record
	 * order after the U-27 filter — the same index used by
	 * {@code pipeline/out/graph-dump/edges.tsv}.
	 */
	public final IdentityHashMap<StreetNetwork.Edge, Integer> directedEdgeId;

	public final int featureCount;
	public final int adjacencyMismatches;
	public final int shapefileFeaturesRead;
	public final String streetsShp;

	private CertifiedGraph(StreetNetwork network, StreetNetwork.ValidationReport report,
			long[] nodeIdsAscending, IdentityHashMap<StreetNetwork.Edge, Integer> directedEdgeId,
			int featureCount, int adjacencyMismatches, int shapefileFeaturesRead, String streetsShp) {
		this.network = network;
		this.report = report;
		this.nodeIdsAscending = nodeIdsAscending;
		this.directedEdgeId = directedEdgeId;
		this.featureCount = featureCount;
		this.adjacencyMismatches = adjacencyMismatches;
		this.shapefileFeaturesRead = shapefileFeaturesRead;
		this.streetsShp = streetsShp;
	}

	@SuppressWarnings("unchecked")
	public static CertifiedGraph build() throws Exception {
		Class<?> cc = Class.forName("geography.agents.ContextCreator");
		Constructor<?> ctor = cc.getDeclaredConstructor();
		ctor.setAccessible(true);
		Object ccInst = ctor.newInstance();

		String streetsShp = (String) Reflect.staticField(cc, "STREETS_SHP");
		Set<Integer> nonPedestrianTypes = (Set<Integer>) Reflect.staticField(cc, "NON_PEDESTRIAN_TYPES");
		Method mLoad = cc.getDeclaredMethod("loadFeaturesFromShapefile", String.class);
		mLoad.setAccessible(true);
		Method mAttr = cc.getDeclaredMethod("attr", SimpleFeature.class, String.class);
		mAttr.setAccessible(true);

		System.out.println("[F1] certified U-27 TYPE set from ContextCreator: "
				+ new java.util.TreeSet<Integer>(nonPedestrianTypes));

		long t0 = System.nanoTime();
		List<SimpleFeature> features = (List<SimpleFeature>) mLoad.invoke(ccInst, "./" + streetsShp);
		int read = features.size();
		System.out.println("[F1] shapefile features loaded: " + read
				+ " in " + (System.nanoTime() - t0) / 1000000L + " ms");

		// ---- mirror of ContextCreator.build() L455-L486 --------------------
		StreetNetwork network = new StreetNetwork();
		for (SimpleFeature feature : features) {
			Geometry geom = (Geometry) feature.getDefaultGeometry();
			if (!(geom instanceof MultiLineString)) {
				continue;
			}
			LineString line = (LineString) ((MultiLineString) geom).getGeometryN(0);
			Coordinate[] coords = line.getCoordinates();
			Object typeAttr = feature.getAttribute("TYPE");
			if (typeAttr instanceof Number
					&& nonPedestrianTypes.contains(((Number) typeAttr).intValue())) {
				network.recordExcludedFeature(((Number) typeAttr).intValue(),
						StreetNetwork.polylineLengthM(coords));
				continue;
			}
			String name = (String) mAttr.invoke(null, feature, "FULL_NAME");
			if (name == null) {
				name = (String) mAttr.invoke(null, feature, "STREETNAME");
			}
			if (name == null) {
				name = "unnamed street";
			}
			Object fNode = feature.getAttribute("PDX_F_NODE");
			Object tNode = feature.getAttribute("PDX_T_NODE");
			if (fNode instanceof Number && tNode instanceof Number) {
				network.addStreet(((Number) fNode).longValue(),
						((Number) tNode).longValue(), coords, name);
			} else {
				StreetNetwork.polylineLengthM(coords);
			}
			// production also does: new PortlandStreet(name, lengthM);
			//                       context.add(street); geography.move(street, line);
			// -- display layer only, no graph state. Omitted (DR-S2 §2).
		}
		long tB = System.nanoTime();
		network.buildIndex();
		StreetNetwork.ValidationReport report = network.getValidationReport();
		features = null; // release ~112k SimpleFeatures before the tree wave
		System.out.println("[F1] buildIndex() in " + (System.nanoTime() - tB) / 1000000L + " ms; "
				+ network.nodeCount() + " nodes, " + network.streetEdgeCount() + " street edges");

		// ---- read the certified graph state (no recomputation) -------------
		Class<?> sn = StreetNetwork.class;
		Map<Long, Coordinate> nodeCoords =
				(Map<Long, Coordinate>) Reflect.instanceField(network, sn, "nodeCoords");
		Map<Long, List<StreetNetwork.Edge>> adjacency =
				(Map<Long, List<StreetNetwork.Edge>>) Reflect.instanceField(network, sn, "adjacency");
		List<?> rawStreets = (List<?>) Reflect.instanceField(network, sn, "rawStreets");
		Method mResolve = sn.getDeclaredMethod("resolveGraphId", long.class, Coordinate.class);
		mResolve.setAccessible(true);

		Class<?> rsCls = Class.forName("geography.routing.StreetNetwork$RawStreet");
		Field rsF = Reflect.declared(rsCls, "fNode");
		Field rsT = Reflect.declared(rsCls, "tNode");
		Field rsLen = Reflect.declared(rsCls, "lengthM");
		Field rsCoords = Reflect.declared(rsCls, "coords");

		final int nFeat = rawStreets.size();
		long[] eFrom = new long[nFeat];
		long[] eTo = new long[nFeat];
		double[] eLen = new double[nFeat];
		int[] eNCoords = new int[nFeat];
		double[] eHeadX = new double[nFeat];
		double[] eHeadY = new double[nFeat];
		Map<Long, List<int[]>> recon = new HashMap<Long, List<int[]>>();
		for (int i = 0; i < nFeat; i++) {
			Object r = rawStreets.get(i);
			long fN = rsF.getLong(r);
			long tN = rsT.getLong(r);
			Coordinate[] cs = (Coordinate[]) rsCoords.get(r);
			long f = ((Long) mResolve.invoke(network, Long.valueOf(fN), cs[0])).longValue();
			long t = ((Long) mResolve.invoke(network, Long.valueOf(tN), cs[cs.length - 1])).longValue();
			eFrom[i] = f;
			eTo[i] = t;
			eLen[i] = rsLen.getDouble(r);
			eNCoords[i] = cs.length;
			eHeadX[i] = cs[0].x;
			eHeadY[i] = cs[0].y;
			listFor(recon, f).add(new int[] { i, 1 });
			listFor(recon, t).add(new int[] { i, -1 });
		}

		// ---- directed-edge identity + adjacency self-check ------------------
		IdentityHashMap<StreetNetwork.Edge, Integer> ids =
				new IdentityHashMap<StreetNetwork.Edge, Integer>(nFeat * 2 + 16);
		int mismatch = 0;
		if (!recon.keySet().equals(adjacency.keySet())) {
			mismatch += Math.abs(recon.size() - adjacency.size()) + 1;
		}
		for (Map.Entry<Long, List<StreetNetwork.Edge>> en : adjacency.entrySet()) {
			List<int[]> mine = recon.get(en.getKey());
			List<StreetNetwork.Edge> theirs = en.getValue();
			if (mine == null || mine.size() != theirs.size()) {
				mismatch++;
				continue;
			}
			for (int k = 0; k < theirs.size(); k++) {
				StreetNetwork.Edge e = theirs.get(k);
				int[] m = mine.get(k);
				int idx = m[0];
				boolean fwd = m[1] > 0;
				long expTo = fwd ? eTo[idx] : eFrom[idx];
				long expFrom = fwd ? eFrom[idx] : eTo[idx];
				double expHeadX = fwd ? eHeadX[idx] : Double.NaN;
				boolean ok = e.toNode == expTo && e.fromNode == expFrom
						&& Double.doubleToLongBits(e.lengthM) == Double.doubleToLongBits(eLen[idx])
						&& e.coords.length == eNCoords[idx];
				if (ok && fwd) {
					ok = Double.doubleToLongBits(e.coords[0].x) == Double.doubleToLongBits(expHeadX)
							&& Double.doubleToLongBits(e.coords[0].y) == Double.doubleToLongBits(eHeadY[idx]);
				}
				if (!ok) {
					mismatch++;
					continue;
				}
				ids.put(e, Integer.valueOf(idx * 2 + (fwd ? 0 : 1)));
			}
		}
		System.out.println("[F1] adjacency reconstruction mismatches: " + mismatch + " (expected 0)");

		long[] sortedIds = new long[nodeCoords.size()];
		int p = 0;
		for (Long id : new TreeMap<Long, Coordinate>(nodeCoords).keySet()) {
			sortedIds[p++] = id.longValue();
		}
		Arrays.sort(sortedIds);

		return new CertifiedGraph(network, report, sortedIds, ids, nFeat, mismatch, read, streetsShp);
	}

	/**
	 * Fails the run if the certified census drifted from the established
	 * post-U-27 production graph. An honest red beats a green that does not
	 * reproduce: a silent drift here would poison every downstream fixture.
	 */
	public void assertProductionCensus(Io.Manifest man) {
		boolean ok = true;
		ok &= man.check("graph.nodes", report.finalGraphNodes == CENSUS_NODES,
				report.finalGraphNodes + " (expected " + CENSUS_NODES + ")");
		ok &= man.check("graph.undirectedEdges", network.streetEdgeCount() == CENSUS_UNDIRECTED_EDGES,
				network.streetEdgeCount() + " (expected " + CENSUS_UNDIRECTED_EDGES + ")");
		ok &= man.check("graph.components", report.componentCount == CENSUS_COMPONENTS,
				report.componentCount + " (expected " + CENSUS_COMPONENTS + ")");
		ok &= man.check("graph.largestComponent", report.largestComponentSize == CENSUS_LARGEST_COMPONENT,
				report.largestComponentSize + " (expected " + CENSUS_LARGEST_COMPONENT + ")");
		ok &= man.check("graph.affectedAttrIds", report.affectedAttrIds == CENSUS_AFFECTED_ATTR_IDS,
				report.affectedAttrIds + " (expected " + CENSUS_AFFECTED_ATTR_IDS + ")");
		ok &= man.check("graph.reattached", report.reattachedSites == CENSUS_REATTACHED,
				report.reattachedSites + " (expected " + CENSUS_REATTACHED
						+ "; DR-S2: 4 is the PRE-U-27 graph, never correct toward it)");
		ok &= man.check("graph.splitSynthetic", report.splitSites == CENSUS_SPLIT_SYNTHETIC,
				report.splitSites + " (expected " + CENSUS_SPLIT_SYNTHETIC
						+ "; DR-S2: 23 is the PRE-U-27 graph)");
		ok &= man.check("graph.impossibleEdgesAfterFix", report.impossibleEdgesAfterFix == 0,
				String.valueOf(report.impossibleEdgesAfterFix));
		ok &= man.check("graph.adjacencyMirrorMismatches", adjacencyMismatches == 0,
				adjacencyMismatches + " (the ContextCreator.build() per-feature mirror is faithful)");
		ok &= man.check("graph.directedEdgeIdentities",
				directedEdgeId.size() == CENSUS_UNDIRECTED_EDGES * 2,
				directedEdgeId.size() + " (expected " + (CENSUS_UNDIRECTED_EDGES * 2) + ")");
		if (!ok) {
			throw new IllegalStateException("certified graph census drifted -- see [F1][FAIL] lines above; "
					+ "do NOT regenerate fixtures until this is explained");
		}
	}

	/** SHA-256 census of the read-only shapefile inputs, for the manifest. */
	public String inputDigestsJson() {
		String[] inputs = { "data/Streets.shp", "data/Streets.dbf", "data/Streets.shx", "data/Streets.prj" };
		StringBuilder sb = new StringBuilder();
		sb.append("  \"graphInputSha256\": {");
		for (int i = 0; i < inputs.length; i++) {
			if (i > 0) {
				sb.append(", ");
			}
			sb.append('"').append(inputs[i]).append("\": \"")
					.append(Io.sha256File(new File("./" + inputs[i]))).append('"');
		}
		sb.append("},\n");
		return sb.toString();
	}

	private static List<int[]> listFor(Map<Long, List<int[]>> m, long k) {
		Long key = Long.valueOf(k);
		List<int[]> l = m.get(key);
		if (l == null) {
			l = new ArrayList<int[]>(4);
			m.put(key, l);
		}
		return l;
	}
}
