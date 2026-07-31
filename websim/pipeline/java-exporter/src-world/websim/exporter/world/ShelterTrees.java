package websim.exporter.world;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import org.locationtech.jts.geom.Coordinate;

import geography.data.CsvLoader;
import geography.routing.StreetNetwork;

/**
 * TASK F1 (a) — WP5 acceptance oracles: the full per-shelter Dijkstra distance
 * array and predecessor-edge array over the production graph, exactly as
 * {@link StreetNetwork} computes them.
 *
 * <p>Every tree is produced by the certified {@code network.computeTree(node)}
 * from the certified {@code network.nearestNode(coord)}; this class reads the
 * result out and encodes it. The shelter rows are consumed with the certified
 * {@link CsvLoader#read} in FILE ORDER, which is the order
 * {@code ContextCreator.build()} step 8 uses and which is load-bearing for the
 * Scenario-E closure waves.
 *
 * <p><b>Dump shape</b> ({@code trees/<arm>/tree-NNN.tsv}), one file per shelter:
 * <pre>
 * # shelter_id=...  index=N  source_node=L  source_lon_hex=..  source_lat_hex=..
 * # snap_gap_m_hex=..  reachable_nodes=N  shelter_lon_hex=..  shelter_lat_hex=..
 * # node_id \t dist_m_hex \t predecessor_directed_edge
 * &lt;rows, ascending node id, ONLY nodes present in tree.distM&gt;
 * </pre>
 * A node absent from the file is unreachable — that is exactly the certified
 * {@code distanceTo} contract (absent =&gt; {@code +Infinity}), so the reachable
 * SET is itself part of the oracle.
 *
 * <p>{@code predecessor_directed_edge} is {@code featureIndex*2 + dir}
 * ({@code dir} 0 = as-loaded orientation, 1 = the reversed back-edge), i.e. the
 * identity assigned by {@link CertifiedGraph#directedEdgeId}. The tree's source
 * node has no predecessor and is written as {@code -1}. Distances are raw
 * IEEE-754 bits; the strict {@code nd < old} relaxation means the predecessor
 * (hence path geometry) is heap-order dependent, so a port that matches
 * distances but not predecessors has NOT reproduced the routing layer.
 */
final class ShelterTrees {

	private ShelterTrees() { }

	/** One shelter's snap + tree summary, reused by the world-build dumper. */
	static final class TreeSummary {
		final int index;
		final String shelterId;
		final double lon;
		final double lat;
		final long node;
		final double snapGapM;
		final int reachable;
		final String sha256;

		TreeSummary(int index, String shelterId, double lon, double lat, long node,
				double snapGapM, int reachable, String sha256) {
			this.index = index;
			this.shelterId = shelterId;
			this.lon = lon;
			this.lat = lat;
			this.node = node;
			this.snapGapM = snapGapM;
			this.reachable = reachable;
			this.sha256 = sha256;
		}
	}

	/** Committed stride-sampled oracle rows per tree. */
	static final int SAMPLE_ROWS_PER_TREE = 64;
	/** Path-reconstruction probes per sampled shelter. */
	static final int PATH_PROBES = 128;

	/**
	 * Dumps every shelter tree for one shelter CSV.
	 *
	 * @param arm      short label used in paths ("A", "B", "C")
	 * @param csvPath  production-relative shelter CSV (from the certified constants)
	 * @param sample   sink receiving the committed stride-sampled rows (may be null)
	 */
	static List<TreeSummary> dumpArm(CertifiedGraph g, String arm, String csvPath,
			Io.Manifest man, Io.Sink sample) throws IOException {
		List<Map<String, String>> rows = CsvLoader.read(csvPath);
		List<TreeSummary> out = new ArrayList<TreeSummary>(rows.size());

		Io.Sink index = man.sink("trees." + arm + ".index", "trees/" + arm + "/index.tsv");
		index.line("# shelter tree index for arm " + arm + " (" + csvPath + ")");
		index.line("# rows in shelter-CSV FILE ORDER -- the order ContextCreator.build() step 8 uses");
		index.line("# idx\tshelter_id\tlon_hex\tlat_hex\tsource_node\tsnap_gap_m_hex"
				+ "\treachable_nodes\ttree_sha256");

		long tAll = System.nanoTime();
		for (int i = 0; i < rows.size(); i++) {
			Map<String, String> r = rows.get(i);
			double lon = Double.parseDouble(r.get("lon"));
			double lat = Double.parseDouble(r.get("lat"));
			String id = r.get("shelter_id");
			Coordinate c = new Coordinate(lon, lat);

			// certified snapping + certified Dijkstra -- nothing recomputed here
			long node = g.network.nearestNode(c);
			Coordinate nc = g.network.nodeCoordinate(node);
			double snapGap = StreetNetwork.geodesicDistanceM(c, nc);
			StreetNetwork.ShortestPathTree tree = g.network.computeTree(node);

			Map<Long, Double> distM = distMap(tree);
			Map<Long, StreetNetwork.Edge> predEdge = predMap(tree);
			TreeMap<Long, Double> sorted = new TreeMap<Long, Double>(distM);

			String rel = String.format(java.util.Locale.ROOT, "trees/%s/tree-%03d.tsv", arm, i);
			Io.Sink s = man.sink("trees." + arm + "." + i, rel);
			s.line("# shelter_id=" + id + "\tindex=" + i + "\tsource_node=" + node);
			s.line("# shelter_lon_hex=" + Io.hexD(lon) + "\tshelter_lat_hex=" + Io.hexD(lat)
					+ "\tsource_lon_hex=" + Io.hexD(nc.x) + "\tsource_lat_hex=" + Io.hexD(nc.y));
			s.line("# snap_gap_m_hex=" + Io.hexD(snapGap) + "\treachable_nodes=" + sorted.size()
					+ "\tgraph_nodes=" + g.nodeIdsAscending.length);
			s.line("# node_id\tdist_m_hex\tpredecessor_directed_edge  (absent node = unreachable = +Inf)");

			// stride sample indices over the ascending reachable node list
			int[] pick = Io.stride(sorted.size(), SAMPLE_ROWS_PER_TREE);
			int pi = 0;
			int k = 0;
			StringBuilder sb = new StringBuilder(48);
			for (Map.Entry<Long, Double> e : sorted.entrySet()) {
				long nodeId = e.getKey().longValue();
				StreetNetwork.Edge pe = predEdge.get(e.getKey());
				int pid;
				if (pe == null) {
					pid = -1; // the source, or a defensively-broken tree (never observed)
				} else {
					Integer mapped = g.directedEdgeId.get(pe);
					if (mapped == null) {
						throw new IllegalStateException("predecessor edge has no directed identity at node "
								+ nodeId + " in tree " + id);
					}
					pid = mapped.intValue();
				}
				sb.setLength(0);
				sb.append(nodeId).append('\t').append(Io.hexD(e.getValue().doubleValue()))
						.append('\t').append(pid);
				String line = sb.toString();
				s.line(line);
				if (sample != null && pi < pick.length && pick[pi] == k) {
					sample.line(arm + "\t" + i + "\t" + line);
					pi++;
				}
				k++;
			}
			s.close();

			Io.Entry entry = man.entries().get(man.entries().size() - 1);
			out.add(new TreeSummary(i, id, lon, lat, node, snapGap, sorted.size(), entry.sha256));
			index.line(i + "\t" + id + "\t" + Io.hexD(lon) + "\t" + Io.hexD(lat) + "\t" + node
					+ "\t" + Io.hexD(snapGap) + "\t" + sorted.size() + "\t" + entry.sha256);

			// path-reconstruction probes on the first and last shelter of the arm
			if (i == 0 || i == rows.size() - 1) {
				dumpPathProbes(g, arm, i, id, tree, sorted, man);
			}
		}
		index.close();
		System.out.printf("[F1] arm %s: %d shelter trees in %.1f s%n",
				arm, rows.size(), (System.nanoTime() - tAll) / 1e9);
		return out;
	}

	/**
	 * {@code pathToSource} / {@code nodesToSource} probes: the coordinate path,
	 * the node chain and {@code coordOffset} for a deterministic stride sample
	 * of reachable nodes. WP5 must reproduce {@code coordOffset} exactly — it is
	 * what decides whether a closed street is "ahead" of a walker.
	 */
	private static void dumpPathProbes(CertifiedGraph g, String arm, int shelterIdx, String shelterId,
			StreetNetwork.ShortestPathTree tree, TreeMap<Long, Double> sorted, Io.Manifest man)
			throws IOException {
		String rel = String.format(java.util.Locale.ROOT, "trees/%s/paths-%03d.tsv", arm, shelterIdx);
		Io.Sink s = man.sink("paths." + arm + "." + shelterIdx, rel);
		s.line("# pathToSource / nodesToSource probes -- arm " + arm + " shelter " + shelterId
				+ " (index " + shelterIdx + "), source_node=" + tree.sourceNode);
		s.line("# kind=NODES : from_node\tn_nodes\t(node:coordOffset)*");
		s.line("# kind=COORDS: from_node\tn_vertices\t(lon_hex,lat_hex)*");
		long[] keys = new long[sorted.size()];
		int p = 0;
		for (Long kk : sorted.keySet()) {
			keys[p++] = kk.longValue();
		}
		for (int idx : Io.stride(keys.length, PATH_PROBES)) {
			long from = keys[idx];
			StreetNetwork.NodePath np = g.network.nodesToSource(tree, from);
			StringBuilder sb = new StringBuilder(256);
			sb.append("NODES\t").append(from).append('\t');
			if (np == null) {
				sb.append("null");
			} else {
				sb.append(np.nodes.size());
				for (int i = 0; i < np.nodes.size(); i++) {
					sb.append('\t').append(np.nodes.get(i).longValue()).append(':').append(np.coordOffset[i]);
				}
			}
			s.line(sb.toString());

			List<Coordinate> path = g.network.pathToSource(tree, from);
			sb.setLength(0);
			sb.append("COORDS\t").append(from).append('\t');
			if (path == null) {
				sb.append("null");
			} else {
				sb.append(path.size());
				for (Coordinate c : path) {
					sb.append('\t').append(Io.hexD(c.x)).append(',').append(Io.hexD(c.y));
				}
			}
			s.line(sb.toString());
		}
		s.close();
	}

	@SuppressWarnings("unchecked")
	private static Map<Long, Double> distMap(StreetNetwork.ShortestPathTree tree) {
		try {
			return (Map<Long, Double>) Reflect.instanceField(tree,
					StreetNetwork.ShortestPathTree.class, "distM");
		} catch (Exception e) {
			throw new IllegalStateException("cannot read certified ShortestPathTree.distM", e);
		}
	}

	@SuppressWarnings("unchecked")
	private static Map<Long, StreetNetwork.Edge> predMap(StreetNetwork.ShortestPathTree tree) {
		try {
			return (Map<Long, StreetNetwork.Edge>) Reflect.instanceField(tree,
					StreetNetwork.ShortestPathTree.class, "predecessorEdge");
		} catch (Exception e) {
			throw new IllegalStateException("cannot read certified ShortestPathTree.predecessorEdge", e);
		}
	}
}
