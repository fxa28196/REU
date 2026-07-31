// GraphExport -- SPIKE S2 (plan WP2-S2, Q8): read-only export of the CERTIFIED
// corrected pedestrian street graph from the Repast/Java instrument.
//
// DESIGN RULE (Q8): nothing certified is re-implemented here. The exporter
// INVOKES the production classes:
//   * geography.agents.ContextCreator#loadFeaturesFromShapefile(String)
//       -- the exact shapefile load + WGS84 reprojection used by build()
//         (private; reached by reflection, not copied).
//   * geography.agents.ContextCreator#NON_PEDESTRIAN_TYPES
//       -- the U-27 freeway TYPE set, read from the production constant so the
//         exporter cannot drift from it.
//   * geography.agents.ContextCreator#attr(SimpleFeature,String)
//       -- FULL_NAME -> STREETNAME -> "unnamed street" resolution (the label is
//         load-bearing: it appears in the correction census).
//   * geography.routing.StreetNetwork#addStreet / #recordExcludedFeature /
//     #polylineLengthM / #buildIndex / #getValidationReport / #resolveGraphId
//       -- ALL geodesic lengths, the order-dependent corrupt-node correction,
//         node ids (incl. synthetic negatives) and the adjacency come from the
//         certified class. This file computes no geometry of its own.
//
// The only mirrored code is ContextCreator.build()'s per-feature loop
// (ContextCreator.java lines 455-486), which cannot be invoked in isolation
// because build() also needs a live Repast context. The mirror is
// statement-for-statement identical except that it omits the two display-only
// side effects (`new PortlandStreet(...)`, `geography.move(street, line)`),
// which touch no graph state. See DR-S2-exporter.md for the line-by-line
// correspondence.
//
// Usage:  java -cp <repast-cp>;geo-classes;out GraphExport <outDir>
//         (working directory MUST be Geography/ -- the certified loader is
//          handed the production-relative path "./data/Streets.shp")

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.geom.MultiLineString;
import org.opengis.feature.simple.SimpleFeature;

import geography.routing.StreetNetwork;

public final class GraphExport {

	private static final int BUF = 1 << 20;

	@SuppressWarnings("unchecked")
	public static void main(String[] args) throws Exception {
		File outDir = new File(args.length > 0 ? args[0] : "graph-dump");
		if (!outDir.exists() && !outDir.mkdirs()) {
			throw new IOException("cannot create " + outDir);
		}
		// DIAGNOSTIC ONLY (not a production path): "--no-u27" bypasses the U-27
		// freeway TYPE filter so the pre-U-27 graph can be reproduced and the
		// plan's expected census (4 reattached / 23 split) can be attributed to
		// a configuration rather than to a defect. It also skips the bulk tables.
		boolean applyU27 = true;
		for (int i = 1; i < args.length; i++) {
			if ("--no-u27".equals(args[i])) applyU27 = false;
		}
		boolean writeTables = applyU27;
		long tStart = System.nanoTime();

		// ---- certified entry points ---------------------------------------
		Class<?> cc = Class.forName("geography.agents.ContextCreator");
		Constructor<?> ctor = cc.getDeclaredConstructor();
		ctor.setAccessible(true);
		Object ccInst = ctor.newInstance();

		String streetsShp = (String) staticField(cc, "STREETS_SHP");
		Set<Integer> nonPedestrianTypes = (Set<Integer>) staticField(cc, "NON_PEDESTRIAN_TYPES");
		Method mLoad = cc.getDeclaredMethod("loadFeaturesFromShapefile", String.class);
		mLoad.setAccessible(true);
		Method mAttr = cc.getDeclaredMethod("attr", SimpleFeature.class, String.class);
		mAttr.setAccessible(true);

		System.out.println("[S2] certified U-27 TYPE set from ContextCreator: "
				+ new java.util.TreeSet<Integer>(nonPedestrianTypes));

		long tLoad0 = System.nanoTime();
		List<SimpleFeature> features =
				(List<SimpleFeature>) mLoad.invoke(ccInst, "./" + streetsShp);
		long tLoad1 = System.nanoTime();
		System.out.println("[S2] shapefile features loaded: " + features.size()
				+ " in " + ms(tLoad1 - tLoad0) + " ms");

		// ---- mirror of ContextCreator.build() lines 455-486 ---------------
		StreetNetwork network = new StreetNetwork();
		int featuresSeen = 0, notMultiLineString = 0, displayOnlyNonNumericNodes = 0;
		for (SimpleFeature feature : features) {
			featuresSeen++;
			Geometry geom = (Geometry) feature.getDefaultGeometry();
			if (!(geom instanceof MultiLineString)) {
				notMultiLineString++;
				continue;
			}
			LineString line = (LineString) ((MultiLineString) geom).getGeometryN(0);
			Coordinate[] coords = line.getCoordinates();
			Object typeAttr = feature.getAttribute("TYPE");
			if (applyU27 && typeAttr instanceof Number
					&& nonPedestrianTypes.contains(((Number) typeAttr).intValue())) {
				network.recordExcludedFeature(((Number) typeAttr).intValue(),
						StreetNetwork.polylineLengthM(coords));
				continue;
			}
			String name = (String) mAttr.invoke(null, feature, "FULL_NAME");
			if (name == null) name = (String) mAttr.invoke(null, feature, "STREETNAME");
			if (name == null) name = "unnamed street";
			Object fNode = feature.getAttribute("PDX_F_NODE");
			Object tNode = feature.getAttribute("PDX_T_NODE");
			if (fNode instanceof Number && tNode instanceof Number) {
				network.addStreet(((Number) fNode).longValue(),
						((Number) tNode).longValue(), coords, name);
			} else {
				displayOnlyNonNumericNodes++;
				StreetNetwork.polylineLengthM(coords);
			}
			// production also does: new PortlandStreet(name, lengthM);
			//                       context.add(street); geography.move(street, line);
			// -- display layer only, no graph state. Omitted.
		}
		long tBuild0 = System.nanoTime();
		network.buildIndex();
		long tBuild1 = System.nanoTime();
		StreetNetwork.ValidationReport report = network.getValidationReport();
		features = null; // release ~112k SimpleFeatures before dumping

		System.out.println("[S2] buildIndex() (correction + validation) in "
				+ ms(tBuild1 - tBuild0) + " ms");
		System.out.println("[S2] " + network.nodeCount() + " nodes, "
				+ network.streetEdgeCount() + " street edges");

		// ---- read the certified graph state (no recomputation) ------------
		Class<?> sn = StreetNetwork.class;
		Map<Long, Coordinate> nodeCoords =
				(Map<Long, Coordinate>) instanceField(network, sn, "nodeCoords");
		Map<Long, List<StreetNetwork.Edge>> adjacency =
				(Map<Long, List<StreetNetwork.Edge>>) instanceField(network, sn, "adjacency");
		List<?> rawStreets = (List<?>) instanceField(network, sn, "rawStreets");
		Method mResolve = sn.getDeclaredMethod("resolveGraphId", long.class, Coordinate.class);
		mResolve.setAccessible(true);

		Class<?> rsCls = Class.forName("geography.routing.StreetNetwork$RawStreet");
		Field rsF = declared(rsCls, "fNode");
		Field rsT = declared(rsCls, "tNode");
		Field rsLen = declared(rsCls, "lengthM");
		Field rsCoords = declared(rsCls, "coords");
		Field rsLabel = declared(rsCls, "label");

		final int nFeat = rawStreets.size();
		long[] eFrom = new long[nFeat];
		long[] eTo = new long[nFeat];
		double[] eLen = new double[nFeat];
		Coordinate[][] eCoords = new Coordinate[nFeat][];
		String[] eLabel = new String[nFeat];
		// node -> directed adjacency entries in FEATURE ORDER: {featureIdx, dir}
		Map<Long, List<int[]>> recon = new HashMap<Long, List<int[]>>();
		long vertexTotal = 0;
		for (int i = 0; i < nFeat; i++) {
			Object r = rawStreets.get(i);
			long fN = rsF.getLong(r);
			long tN = rsT.getLong(r);
			double len = rsLen.getDouble(r);
			Coordinate[] cs = (Coordinate[]) rsCoords.get(r);
			// certified resolution -- same call build() makes in pass 3
			long f = ((Long) mResolve.invoke(network, Long.valueOf(fN), cs[0])).longValue();
			long t = ((Long) mResolve.invoke(network, Long.valueOf(tN), cs[cs.length - 1])).longValue();
			eFrom[i] = f; eTo[i] = t; eLen[i] = len; eCoords[i] = cs;
			eLabel[i] = (String) rsLabel.get(r);
			vertexTotal += cs.length;
			listFor(recon, f).add(new int[] { i, 1 });
			listFor(recon, t).add(new int[] { i, -1 });
		}

		// ---- self-check: reconstruction == certified adjacency ------------
		int adjMismatch = 0;
		if (!recon.keySet().equals(adjacency.keySet())) {
			adjMismatch += Math.abs(recon.size() - adjacency.size()) + 1;
			System.out.println("[S2][WARN] adjacency key sets differ: recon="
					+ recon.size() + " certified=" + adjacency.size());
		}
		for (Map.Entry<Long, List<StreetNetwork.Edge>> en : adjacency.entrySet()) {
			List<int[]> mine = recon.get(en.getKey());
			List<StreetNetwork.Edge> theirs = en.getValue();
			if (mine == null || mine.size() != theirs.size()) { adjMismatch++; continue; }
			for (int k = 0; k < theirs.size(); k++) {
				StreetNetwork.Edge e = theirs.get(k);
				int[] m = mine.get(k);
				int idx = m[0];
				long expTo = m[1] > 0 ? eTo[idx] : eFrom[idx];
				long expFrom = m[1] > 0 ? eFrom[idx] : eTo[idx];
				Coordinate expHead = m[1] > 0 ? eCoords[idx][0]
						: eCoords[idx][eCoords[idx].length - 1];
				if (e.toNode != expTo || e.fromNode != expFrom
						|| Double.doubleToLongBits(e.lengthM) != Double.doubleToLongBits(eLen[idx])
						|| e.coords.length != eCoords[idx].length
						|| Double.doubleToLongBits(e.coords[0].x) != Double.doubleToLongBits(expHead.x)
						|| Double.doubleToLongBits(e.coords[0].y) != Double.doubleToLongBits(expHead.y)) {
					adjMismatch++;
				}
			}
		}
		System.out.println("[S2] adjacency reconstruction mismatches: " + adjMismatch
				+ " (expected 0)");

		// ---- coordinate precision census (is int32 @1e-7 lossless?) -------
		long coordsTested = 0, exact6 = 0, exact7 = 0;
		if (writeTables) for (Coordinate c : nodeCoords.values()) {
			coordsTested += 2;
			if (roundTrips(c.x, 6)) exact6++;
			if (roundTrips(c.y, 6)) exact6++;
			if (roundTrips(c.x, 7)) exact7++;
			if (roundTrips(c.y, 7)) exact7++;
		}
		long polyTested = 0, polyExact6 = 0, polyExact7 = 0;
		if (writeTables) for (int i = 0; i < nFeat; i++) {
			for (Coordinate c : eCoords[i]) {
				polyTested += 2;
				if (roundTrips(c.x, 6)) polyExact6++;
				if (roundTrips(c.y, 6)) polyExact6++;
				if (roundTrips(c.x, 7)) polyExact7++;
				if (roundTrips(c.y, 7)) polyExact7++;
			}
		}

		// ---- node table ---------------------------------------------------
		TreeMap<Long, Coordinate> sortedNodes = new TreeMap<Long, Coordinate>(nodeCoords);
		long minId = sortedNodes.firstKey(), maxId = sortedNodes.lastKey();
		int negativeIds = 0;
		for (Long id : sortedNodes.keySet()) if (id.longValue() < 0) negativeIds++;

		int maxDegree = 0;
		for (Map.Entry<Long, List<StreetNetwork.Edge>> en : adjacency.entrySet()) {
			maxDegree = Math.max(maxDegree, en.getValue().size());
		}

		if (writeTables) {
		Writer w = writer(new File(outDir, "nodes.tsv"));
		w.write("# id\tlon\tlat\tlon_hex\tlat_hex  (lon/lat are Java Double.toString = round-trip exact)\n");
		for (Map.Entry<Long, Coordinate> e : sortedNodes.entrySet()) {
			Coordinate c = e.getValue();
			w.write(Long.toString(e.getKey().longValue())); w.write('\t');
			w.write(Double.toString(c.x)); w.write('\t');
			w.write(Double.toString(c.y)); w.write('\t');
			w.write(Double.toHexString(c.x)); w.write('\t');
			w.write(Double.toHexString(c.y)); w.write('\n');
		}
		w.close();

		// ---- edge table (feature order) -----------------------------------
		w = writer(new File(outDir, "edges.tsv"));
		w.write("# feature_idx\tfrom_node\tto_node\tlength_m_hex\tlength_m\tn_coords\tlabel\n");
		for (int i = 0; i < nFeat; i++) {
			w.write(Integer.toString(i)); w.write('\t');
			w.write(Long.toString(eFrom[i])); w.write('\t');
			w.write(Long.toString(eTo[i])); w.write('\t');
			w.write(Double.toHexString(eLen[i])); w.write('\t');
			w.write(Double.toString(eLen[i])); w.write('\t');
			w.write(Integer.toString(eCoords[i].length)); w.write('\t');
			w.write(eLabel[i] == null ? "" : eLabel[i].replace('\t', ' ').replace('\n', ' '));
			w.write('\n');
		}
		w.close();

		// ---- adjacency (per node, list order == feature order) ------------
		w = writer(new File(outDir, "adjacency.tsv"));
		w.write("# node\tdegree\t(feature_idx:dir:neighbour_node)*  -- entries in certified list order\n");
		for (Long node : sortedNodes.keySet()) {
			List<int[]> l = recon.get(node);
			w.write(Long.toString(node.longValue())); w.write('\t');
			if (l == null) { w.write("0\n"); continue; }
			w.write(Integer.toString(l.size()));
			for (int[] m : l) {
				w.write('\t');
				w.write(Integer.toString(m[0])); w.write(':');
				w.write(m[1] > 0 ? '+' : '-'); w.write(':');
				w.write(Long.toString(m[1] > 0 ? eTo[m[0]] : eFrom[m[0]]));
			}
			w.write('\n');
		}
		w.close();

		// ---- polylines (feature order, oriented from_node -> to_node) -----
		w = writer(new File(outDir, "polylines.tsv"));
		w.write("# feature_idx\tn_coords\t(lon,lat)*  -- Double.toString, round-trip exact, WGS84\n");
		for (int i = 0; i < nFeat; i++) {
			w.write(Integer.toString(i)); w.write('\t');
			w.write(Integer.toString(eCoords[i].length));
			for (Coordinate c : eCoords[i]) {
				w.write('\t');
				w.write(Double.toString(c.x)); w.write(',');
				w.write(Double.toString(c.y));
			}
			w.write('\n');
		}
		w.close();
		} // writeTables

		// ---- correction census --------------------------------------------
		Writer w = writer(new File(outDir, "corrections.tsv"));
		w.write("# kind\tattr_node_id\tgraph_node_id\tdist_from_primary_m\tlon\tlat\tclaims\tfirst_feature\n");
		for (StreetNetwork.Correction c : report.corrections) {
			w.write(c.kind); w.write('\t');
			w.write(Long.toString(c.attrId)); w.write('\t');
			w.write(Long.toString(c.graphId)); w.write('\t');
			w.write(Double.toString(c.distFromPrimaryM)); w.write('\t');
			w.write(Double.toString(c.lon)); w.write('\t');
			w.write(Double.toString(c.lat)); w.write('\t');
			w.write(Integer.toString(c.claims)); w.write('\t');
			w.write(c.firstFeature == null ? "" : c.firstFeature);
			w.write('\n');
		}
		w.close();

		// ---- census.json ---------------------------------------------------
		StringBuilder j = new StringBuilder();
		j.append("{\n");
		j.append("  \"exporter\": \"GraphExport (SPIKE S2)\",\n");
		j.append("  \"u27_freeway_filter_applied\": ").append(applyU27).append(",\n");
		j.append("  \"streets_shp\": \"").append(streetsShp).append("\",\n");
		j.append("  \"shapefile_features_read\": ").append(featuresSeen).append(",\n");
		j.append("  \"features_not_multilinestring\": ").append(notMultiLineString).append(",\n");
		j.append("  \"features_display_only_nonnumeric_nodes\": ").append(displayOnlyNonNumericNodes).append(",\n");
		j.append("  \"node_site_tolerance_m\": ").append(StreetNetwork.NODE_SITE_TOLERANCE_M).append(",\n");
		j.append("  \"reattach_tolerance_m\": ").append(StreetNetwork.REATTACH_TOLERANCE_M).append(",\n");
		j.append("  \"features\": ").append(report.featureCount).append(",\n");
		j.append("  \"attr_node_ids\": ").append(report.attrNodeIds).append(",\n");
		j.append("  \"final_graph_nodes\": ").append(report.finalGraphNodes).append(",\n");
		j.append("  \"affected_attr_node_ids\": ").append(report.affectedAttrIds).append(",\n");
		j.append("  \"sites_reattached\": ").append(report.reattachedSites).append(",\n");
		j.append("  \"sites_split_synthetic\": ").append(report.splitSites).append(",\n");
		j.append("  \"impossible_edges_after_fix\": ").append(report.impossibleEdgesAfterFix).append(",\n");
		j.append("  \"max_endpoint_gap_m\": ").append(report.maxEndpointGapM).append(",\n");
		j.append("  \"components\": ").append(report.componentCount).append(",\n");
		j.append("  \"largest_component_nodes\": ").append(report.largestComponentSize).append(",\n");
		j.append("  \"undirected_street_edges\": ").append(network.streetEdgeCount()).append(",\n");
		j.append("  \"directed_edge_records\": ").append(network.streetEdgeCount() * 2).append(",\n");
		j.append("  \"node_count_api\": ").append(network.nodeCount()).append(",\n");
		j.append("  \"freeway_filter\": {\"features_excluded\": ")
				.append(report.freewayFeaturesExcluded).append(", \"km_excluded\": ")
				.append(report.freewayKmExcluded).append(", \"by_type\": {");
		boolean first = true;
		for (Map.Entry<Integer, Integer> e : new TreeMap<Integer, Integer>(report.freewayExcludedByType).entrySet()) {
			if (!first) j.append(", ");
			first = false;
			j.append('"').append(e.getKey()).append("\": ").append(e.getValue());
		}
		j.append("}},\n");
		j.append("  \"node_id_min\": ").append(minId).append(",\n");
		j.append("  \"node_id_max\": ").append(maxId).append(",\n");
		j.append("  \"node_ids_negative\": ").append(negativeIds).append(",\n");
		j.append("  \"max_degree\": ").append(maxDegree).append(",\n");
		j.append("  \"polyline_vertices_total\": ").append(vertexTotal).append(",\n");
		j.append("  \"adjacency_reconstruction_mismatches\": ").append(adjMismatch).append(",\n");
		j.append("  \"coord_precision\": {\"node_values\": ").append(coordsTested)
				.append(", \"node_roundtrip_6dp\": ").append(exact6)
				.append(", \"node_roundtrip_7dp\": ").append(exact7)
				.append(", \"polyline_values\": ").append(polyTested)
				.append(", \"polyline_roundtrip_6dp\": ").append(polyExact6)
				.append(", \"polyline_roundtrip_7dp\": ").append(polyExact7).append("},\n");
		j.append("  \"timing_ms\": {\"shapefile_load\": ").append(ms(tLoad1 - tLoad0))
				.append(", \"build_index\": ").append(ms(tBuild1 - tBuild0))
				.append(", \"total\": ").append(ms(System.nanoTime() - tStart)).append("},\n");
		j.append("  \"input_sha256\": {");
		String[] inputs = { "data/Streets.shp", "data/Streets.dbf", "data/Streets.shx", "data/Streets.prj" };
		first = true;
		for (String in : inputs) {
			if (!first) j.append(", ");
			first = false;
			j.append('"').append(in).append("\": \"").append(sha256(new File("./" + in))).append('"');
		}
		j.append("},\n");
		j.append("  \"corrections\": [\n");
		for (int i = 0; i < report.corrections.size(); i++) {
			StreetNetwork.Correction c = report.corrections.get(i);
			j.append("    {\"kind\": \"").append(c.kind).append("\", \"attr_node_id\": ").append(c.attrId)
					.append(", \"graph_node_id\": ").append(c.graphId)
					.append(", \"dist_from_primary_m\": ").append(round1(c.distFromPrimaryM))
					.append(", \"lon\": ").append(String.format(Locale.ROOT, "%.6f", c.lon))
					.append(", \"lat\": ").append(String.format(Locale.ROOT, "%.6f", c.lat))
					.append(", \"first_feature\": \"").append(c.firstFeature)
					.append("\", \"claims\": ").append(c.claims).append('}');
			if (i < report.corrections.size() - 1) j.append(',');
			j.append('\n');
		}
		j.append("  ]\n}\n");
		Writer jw = writer(new File(outDir, "census.json"));
		jw.write(j.toString());
		jw.close();

		System.out.println("[S2] dump written to " + outDir.getAbsolutePath());
		System.out.println("[S2] total " + ms(System.nanoTime() - tStart) + " ms");
	}

	// ---- helpers (glue only) ---------------------------------------------

	private static List<int[]> listFor(Map<Long, List<int[]>> m, long k) {
		Long key = Long.valueOf(k);
		List<int[]> l = m.get(key);
		if (l == null) { l = new ArrayList<int[]>(4); m.put(key, l); }
		return l;
	}

	private static boolean roundTrips(double v, int dp) {
		return Double.parseDouble(String.format(Locale.ROOT, "%." + dp + "f", v)) == v;
	}

	private static Field declared(Class<?> c, String name) throws Exception {
		Field f = c.getDeclaredField(name);
		f.setAccessible(true);
		return f;
	}

	private static Object staticField(Class<?> c, String name) throws Exception {
		return declared(c, name).get(null);
	}

	private static Object instanceField(Object o, Class<?> c, String name) throws Exception {
		return declared(c, name).get(o);
	}

	private static Writer writer(File f) throws IOException {
		return new BufferedWriter(new OutputStreamWriter(
				new FileOutputStream(f), StandardCharsets.UTF_8), BUF);
	}

	private static long ms(long nanos) { return nanos / 1000000L; }

	private static double round1(double v) { return Math.round(v * 10.0) / 10.0; }

	private static String sha256(File f) {
		try {
			MessageDigest md = MessageDigest.getInstance("SHA-256");
			byte[] buf = new byte[1 << 16];
			InputStream in = new java.io.FileInputStream(f);
			try {
				int n;
				while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
			} finally { in.close(); }
			StringBuilder sb = new StringBuilder();
			for (byte b : md.digest()) sb.append(String.format("%02x", b));
			return sb.toString();
		} catch (Exception e) {
			return "ERROR:" + e;
		}
	}

	private GraphExport() { }
}
