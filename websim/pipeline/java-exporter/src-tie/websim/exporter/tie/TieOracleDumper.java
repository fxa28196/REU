package websim.exporter.tie;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

import org.locationtech.jts.geom.Coordinate;

import geography.routing.StreetNetwork;

/**
 * TASK C2 (a) — the certified oracle for Dijkstra's behaviour at an <b>exact
 * double distance tie</b>.
 *
 * <h2>Why this exists</h2>
 *
 * The port's relaxation is strict {@code nd < old}, so at an exact tie the
 * FIRST-relaxed predecessor wins and never yields. Distances are tie
 * independent; path <i>geometry</i> is not. Mutating that {@code <} to
 * {@code <=} therefore changes predecessor edges — and nothing else — which is
 * invisible to every distance oracle.
 *
 * <p>An exhaustive search of the certified corpus established that the mutation
 * is <b>not observable there at all</b>:
 * <ul>
 *   <li>all 109,434 certified edge lengths are pairwise distinct as raw IEEE-754
 *       doubles (0 duplicate-length groups), so no two-hop detour can ever tie;</li>
 *   <li>across all 118 certified shelter trees — 3,539,712 node rows — <b>zero</b>
 *       nodes have two or more incoming relaxations {@code dist[u] + len(u,v)}
 *       that are bit-equal to {@code dist[v]}.</li>
 * </ul>
 * The real graph simply contains no tie, so no cut of it can carry one. That is
 * a property of the data, not a gap in the fixtures — and it is exactly why the
 * tie policy needed an oracle of its own.
 *
 * <h2>What this dumper does</h2>
 *
 * It builds small <b>synthetic</b> street networks through the certified public
 * API ({@link StreetNetwork#addStreet}, {@link StreetNetwork#buildIndex},
 * {@link StreetNetwork#computeTree}) and dumps what the certified Java actually
 * produced. Nothing about the tie policy is asserted here or reasoned about:
 * the Java model is run and its answer is recorded.
 *
 * <p>Two construction tricks force exact ties out of real geodesic weights:
 * <ol>
 *   <li><b>Identical polylines.</b> {@link StreetNetwork#polylineLengthM} is a
 *       pure function of its coordinate array, so two features carrying the same
 *       vertices have bit-identical lengths.</li>
 *   <li><b>Left-associative prefix sums.</b> {@code polylineLengthM} accumulates
 *       {@code total += geodesic(v[i], v[i+1])} from {@code 0.0}, and Dijkstra
 *       accumulates {@code d + len} from {@code dist[source] == 0.0}. A "long
 *       block" feature spanning {@code P0..Pk} therefore has <i>exactly</i> the
 *       double that the chain {@code P0->P1->...->Pk} accumulates — same
 *       operands, same order, same rounding. (This works only for chains rooted
 *       at the source: floating-point addition is not associative, so a shortcut
 *       starting mid-chain would NOT tie.)</li>
 * </ol>
 *
 * <p>All anchor coordinates are real certified graph node positions, carried as
 * raw bit patterns (see {@link #ANCHOR_IDS}), so every edge weight in every
 * scenario is a genuine WGS84 geodesic at Portland scale rather than a toy
 * integer.
 *
 * <h2>Honesty guards</h2>
 *
 * The dumper refuses to emit a fixture that would not discriminate:
 * <ul>
 *   <li>every scenario must finalise with zero node corrections, so authored
 *       node ids survive into the graph unchanged;</li>
 *   <li>the reconstructed directed-edge identity is diffed against the certified
 *       {@code adjacency} map by raw bits (expected 0 mismatches);</li>
 *   <li>every scenario must contain at least one node with >= 2 tie candidates,
 *       and the corpus as a whole must contain a >= 3-way tie;</li>
 *   <li>the run replays each tree with the relaxation mutated to {@code <=} and
 *       fails unless that mutant disagrees with the certified predecessors on
 *       at least one scenario. A fixture that a {@code <=} port could pass is
 *       worthless for this purpose and is not written.</li>
 * </ul>
 *
 * <pre>
 *   java -cp "&lt;repast&gt;;geo-classes;out-tie" websim.exporter.tie.TieOracleDumper &lt;outDir&gt;
 * </pre>
 */
public final class TieOracleDumper {

	private TieOracleDumper() { }

	// ---- real certified anchor coordinates ---------------------------------
	// A real 5-node walk of the certified pedestrian graph (node ids below,
	// coordinates copied bit for bit out of pipeline/out/graph-dump/nodes.tsv).
	// Only the COORDINATES are reused; the incidence in each scenario is
	// synthetic. Consecutive anchors are 28-180 m apart, i.e. street scale.
	static final long[] ANCHOR_IDS = { 43608L, 100378L, 100379L, 100380L, 43235L };
	private static final long[] ANCHOR_LON_BITS = {
		0xc05ea4c3394ba65aL, 0xc05ea4bd724aacb7L, 0xc05ea4bd731068c1L,
		0xc05ea4e2ecd41ea5L, 0xc05ea4e2da701bd5L,
	};
	private static final long[] ANCHOR_LAT_BITS = {
		0x4046c53b99bd47f9L, 0x4046c53bb8677c89L, 0x4046c55235574ad5L,
		0x4046c552553829b8L, 0x4046c559f33d3ea8L,
	};

	/** Anchor index -> a fresh Coordinate at that exact position. */
	private static Coordinate p(int i) {
		return new Coordinate(Double.longBitsToDouble(ANCHOR_LON_BITS[i]),
				Double.longBitsToDouble(ANCHOR_LAT_BITS[i]));
	}

	/** Polyline through the given anchor indices, in order. */
	private static Coordinate[] poly(int... anchors) {
		Coordinate[] cs = new Coordinate[anchors.length];
		for (int i = 0; i < anchors.length; i++) {
			cs[i] = p(anchors[i]);
		}
		return cs;
	}

	// ---- scenario description ----------------------------------------------

	private static final class Feature {
		final long from;
		final long to;
		final Coordinate[] coords;

		Feature(long from, long to, Coordinate[] coords) {
			this.from = from;
			this.to = to;
			this.coords = coords;
		}
	}

	private static final class Scenario {
		final String id;
		final String note;
		final long source;
		final List<Feature> features = new ArrayList<Feature>();
		/** node id -> anchor index, so the dump can state where each node sits. */
		final Map<Long, Integer> anchorOf = new LinkedHashMap<Long, Integer>();
		final List<long[]> blocked = new ArrayList<long[]>();

		Scenario(String id, long source, String note) {
			this.id = id;
			this.source = source;
			this.note = note;
		}

		Scenario at(long node, int anchor) {
			anchorOf.put(Long.valueOf(node), Integer.valueOf(anchor));
			return this;
		}

		Scenario f(long from, long to, int... anchors) {
			features.add(new Feature(from, to, poly(anchors)));
			return this;
		}

		Scenario block(long a, long b) {
			blocked.add(new long[] { a, b });
			return this;
		}
	}

	private static List<Scenario> scenarios() {
		List<Scenario> out = new ArrayList<Scenario>();

		// (1) Two features between the SAME node pair carrying the SAME polyline.
		// Both relaxations happen inside one adjacency scan, so this isolates the
		// relaxation comparison itself from any heap behaviour.
		out.add(new Scenario("duplicate-parallel", 1L,
				"two features on one node pair with byte-identical polylines; the tie is "
				+ "resolved inside a single adjacency scan")
				.at(1L, 0).at(2L, 1)
				.f(1L, 2L, 0, 1)
				.f(1L, 2L, 0, 1));

		// (2) A "long block" feature vs the two half blocks that span it. The
		// direct edge is relaxed while the source is settled; the second candidate
		// arrives later, from a different tail.
		out.add(new Scenario("direct-vs-halves", 1L,
				"long-block feature 1->3 vs the chain 1->2->3 over the same vertices; "
				+ "the tie candidates arrive from DIFFERENT tails, at different times")
				.at(1L, 0).at(2L, 1).at(3L, 2)
				.f(1L, 3L, 0, 1, 2)
				.f(1L, 2L, 0, 1)
				.f(2L, 3L, 1, 2));

		// (3) The same graph with the long block added LAST, so its position in
		// node 1's adjacency list moves from first to last.
		out.add(new Scenario("halves-first", 1L,
				"identical graph to direct-vs-halves with the long block added last, so "
				+ "the certified adjacency order of node 1 is reversed")
				.at(1L, 0).at(2L, 1).at(3L, 2)
				.f(1L, 2L, 0, 1)
				.f(2L, 3L, 1, 2)
				.f(1L, 3L, 0, 1, 2));

		// (4) A whole lattice of shortcuts rooted at the source: every prefix of
		// the chain also exists as one long feature, and the longest one is
		// duplicated, so node 5 carries a THREE-way tie.
		out.add(new Scenario("shortcut-lattice", 1L,
				"chain 1->2->3->4->5 plus a source-rooted shortcut over every prefix, the "
				+ "longest duplicated; nodes 3, 4 and 5 all tie, node 5 three ways")
				.at(1L, 0).at(2L, 1).at(3L, 2).at(4L, 3).at(5L, 4)
				.f(1L, 2L, 0, 1)
				.f(2L, 3L, 1, 2)
				.f(3L, 4L, 2, 3)
				.f(4L, 5L, 3, 4)
				.f(1L, 3L, 0, 1, 2)
				.f(1L, 4L, 0, 1, 2, 3)
				.f(1L, 5L, 0, 1, 2, 3, 4)
				.f(1L, 5L, 0, 1, 2, 3, 4));

		// (5) The same lattice with the node pair 1-5 closed. Blocking is by NODE
		// PAIR, so BOTH parallel 1->5 features are cut and node 5 must fall back
		// to the chain; the ties at nodes 3 and 4 survive the closure.
		out.add(new Scenario("lattice-blocked", 1L,
				"shortcut-lattice with the pair 1-5 closed: a node-pair block cuts BOTH "
				+ "parallel features, and the remaining ties must be unaffected")
				.at(1L, 0).at(2L, 1).at(3L, 2).at(4L, 3).at(5L, 4)
				.f(1L, 2L, 0, 1)
				.f(2L, 3L, 1, 2)
				.f(3L, 4L, 2, 3)
				.f(4L, 5L, 3, 4)
				.f(1L, 3L, 0, 1, 2)
				.f(1L, 4L, 0, 1, 2, 3)
				.f(1L, 5L, 0, 1, 2, 3, 4)
				.f(1L, 5L, 0, 1, 2, 3, 4)
				.block(1L, 5L));

		// (6) Six middles at one distance, so the priority queue holds six
		// equal-key entries at once. Node 2 is a dead end, so the node that
		// actually settles the far node is whichever entry java.util.PriorityQueue
		// hands back SECOND — an artefact of siftDown, not of insertion order.
		// Middles 2..7 deliberately share anchor 1: only edge weights and
		// adjacency order reach computeTree, and coincident node positions are the
		// only way to give two DISTINCT nodes an exactly equal source distance.
		Scenario heap = new Scenario("heap-equal-keys", 1L,
				"six equal-key heap entries with the first-popped middle a dead end, so the "
				+ "far node's predecessor is decided by java.util.PriorityQueue's siftDown "
				+ "order rather than by insertion order")
				.at(1L, 0).at(8L, 2);
		for (long m = 2L; m <= 7L; m++) {
			heap.at(m, 1);
		}
		for (long m = 2L; m <= 7L; m++) {
			heap.f(1L, m, 0, 1);
		}
		for (long m = 3L; m <= 7L; m++) {
			heap.f(m, 8L, 1, 2); // node 2 gets no onward edge: it is the dead end
		}
		out.add(heap);

		return out;
	}

	// ---- what one scenario produced ----------------------------------------

	private static final class Built {
		final Scenario scenario;
		final StreetNetwork net;
		final long[] nodesAscending;
		final double[] featureLength;
		final long[] featureFrom;
		final long[] featureTo;
		final int[] featureCoordCount;
		/** node id -> certified directed edge ids, in certified adjacency order. */
		final Map<Long, int[]> adjacency;
		final Map<Long, Double> dist;
		final Map<Long, Integer> pred;
		/** node id -> tie candidate directed edge ids (>= 2 means a genuine tie). */
		final Map<Long, int[]> tieCandidates;

		Built(Scenario s, StreetNetwork net, long[] nodes, double[] len, long[] from, long[] to,
				int[] nCoords, Map<Long, int[]> adjacency, Map<Long, Double> dist,
				Map<Long, Integer> pred, Map<Long, int[]> tieCandidates) {
			this.scenario = s;
			this.net = net;
			this.nodesAscending = nodes;
			this.featureLength = len;
			this.featureFrom = from;
			this.featureTo = to;
			this.featureCoordCount = nCoords;
			this.adjacency = adjacency;
			this.dist = dist;
			this.pred = pred;
			this.tieCandidates = tieCandidates;
		}
	}

	@SuppressWarnings("unchecked")
	private static Built build(Scenario s) throws Exception {
		StreetNetwork net = new StreetNetwork();
		int n = s.features.size();
		double[] len = new double[n];
		long[] from = new long[n];
		long[] to = new long[n];
		int[] nCoords = new int[n];
		for (int i = 0; i < n; i++) {
			Feature f = s.features.get(i);
			len[i] = net.addStreet(f.from, f.to, f.coords, s.id + "#" + i);
			from[i] = f.from;
			to[i] = f.to;
			nCoords[i] = f.coords.length;
		}
		net.buildIndex();

		StreetNetwork.ValidationReport rep = net.getValidationReport();
		require(rep.affectedAttrIds == 0 && rep.splitSites == 0 && rep.reattachedSites == 0,
				s.id + ": the certified validator corrected " + rep.affectedAttrIds
				+ " node id(s); authored ids would not survive, so the scenario is not usable");
		require(rep.componentCount == 1,
				s.id + ": expected one component, got " + rep.componentCount);
		require(rep.finalGraphNodes == s.anchorOf.size(),
				s.id + ": " + rep.finalGraphNodes + " graph nodes but " + s.anchorOf.size()
				+ " authored");

		Class<?> sn = StreetNetwork.class;
		Map<Long, List<StreetNetwork.Edge>> adj =
				(Map<Long, List<StreetNetwork.Edge>>) field(net, sn, "adjacency");

		// Reconstruct the directed identity featureIndex*2+dir and PROVE the
		// reconstruction against the certified Edge objects (CertifiedGraph's guard).
		Map<Long, List<int[]>> recon = new LinkedHashMap<Long, List<int[]>>();
		for (int i = 0; i < n; i++) {
			listFor(recon, from[i]).add(new int[] { i, 1 });
			listFor(recon, to[i]).add(new int[] { i, -1 });
		}
		IdentityHashMap<StreetNetwork.Edge, Integer> ids =
				new IdentityHashMap<StreetNetwork.Edge, Integer>(n * 2 + 8);
		Map<Long, int[]> adjacency = new LinkedHashMap<Long, int[]>();
		require(recon.keySet().equals(adj.keySet()),
				s.id + ": reconstructed adjacency key set differs from the certified one");
		for (Map.Entry<Long, List<StreetNetwork.Edge>> en : adj.entrySet()) {
			List<int[]> mine = recon.get(en.getKey());
			List<StreetNetwork.Edge> theirs = en.getValue();
			require(mine != null && mine.size() == theirs.size(),
					s.id + ": adjacency size differs at node " + en.getKey());
			int[] row = new int[theirs.size()];
			for (int k = 0; k < theirs.size(); k++) {
				StreetNetwork.Edge e = theirs.get(k);
				int[] m = mine.get(k);
				boolean fwd = m[1] > 0;
				long expFrom = fwd ? from[m[0]] : to[m[0]];
				long expTo = fwd ? to[m[0]] : from[m[0]];
				require(e.fromNode == expFrom && e.toNode == expTo
						&& Double.doubleToLongBits(e.lengthM) == Double.doubleToLongBits(len[m[0]])
						&& e.coords.length == nCoords[m[0]],
						s.id + ": certified adjacency record " + k + " at node " + en.getKey()
						+ " does not match the reconstruction");
				int id = m[0] * 2 + (fwd ? 0 : 1);
				ids.put(e, Integer.valueOf(id));
				row[k] = id;
			}
			adjacency.put(en.getKey(), row);
		}

		for (long[] pair : s.blocked) {
			net.declareClosureSchedule();
			net.blockEdge(pair[0], pair[1]);
		}

		// ---- the certified answer ------------------------------------------
		StreetNetwork.ShortestPathTree tree = net.computeTree(s.source);
		Map<Long, Double> distM = (Map<Long, Double>) field(tree,
				StreetNetwork.ShortestPathTree.class, "distM");
		Map<Long, StreetNetwork.Edge> predE = (Map<Long, StreetNetwork.Edge>) field(tree,
				StreetNetwork.ShortestPathTree.class, "predecessorEdge");

		Map<Long, Double> dist = new TreeMap<Long, Double>(distM);
		Map<Long, Integer> pred = new TreeMap<Long, Integer>();
		for (Map.Entry<Long, Double> e : dist.entrySet()) {
			StreetNetwork.Edge pe = predE.get(e.getKey());
			if (pe == null) {
				pred.put(e.getKey(), Integer.valueOf(-1));
			} else {
				Integer mapped = ids.get(pe);
				require(mapped != null, s.id + ": predecessor edge has no directed identity at node "
						+ e.getKey());
				pred.put(e.getKey(), mapped);
			}
		}

		// ---- tie census: every relaxation that lands EXACTLY on dist[v] ------
		Map<Long, int[]> ties = new TreeMap<Long, int[]>();
		for (Map.Entry<Long, Double> e : dist.entrySet()) {
			long u = e.getKey().longValue();
			double du = e.getValue().doubleValue();
			List<StreetNetwork.Edge> out = adj.get(Long.valueOf(u));
			if (out == null) {
				continue;
			}
			for (StreetNetwork.Edge edge : out) {
				if (net.isBlocked(u, edge.toNode)) {
					continue;
				}
				Double dv = dist.get(Long.valueOf(edge.toNode));
				if (dv == null) {
					continue;
				}
				if (Double.doubleToLongBits(du + edge.lengthM) == Double.doubleToLongBits(dv.doubleValue())) {
					ties.put(Long.valueOf(edge.toNode),
							append(ties.get(Long.valueOf(edge.toNode)), ids.get(edge).intValue()));
				}
			}
		}

		long[] nodes = new long[dist.size()];
		int p = 0;
		for (Long id : dist.keySet()) {
			nodes[p++] = id.longValue();
		}
		return new Built(s, net, nodes, len, from, to, nCoords, adjacency, dist, pred, ties);
	}

	/**
	 * Replays the same graph with the relaxation mutated to {@code nd <= old} —
	 * everything else (heap, adjacency order, stale-pop guard) identical to the
	 * certified {@code computeTree}. Its only job is to prove that the emitted
	 * fixture would REJECT such a port. Returns the predecessor map.
	 */
	@SuppressWarnings("unchecked")
	private static Map<Long, Integer> mutantLePredecessors(Built b) throws Exception {
		StreetNetwork net = b.net;
		Map<Long, List<StreetNetwork.Edge>> adj = (Map<Long, List<StreetNetwork.Edge>>)
				field(net, StreetNetwork.class, "adjacency");
		IdentityHashMap<StreetNetwork.Edge, Integer> ids = new IdentityHashMap<StreetNetwork.Edge, Integer>();
		for (Map.Entry<Long, int[]> en : b.adjacency.entrySet()) {
			List<StreetNetwork.Edge> theirs = adj.get(en.getKey());
			int[] row = en.getValue();
			for (int k = 0; k < row.length; k++) {
				ids.put(theirs.get(k), Integer.valueOf(row[k]));
			}
		}
		Map<Long, Double> dist = new java.util.HashMap<Long, Double>();
		Map<Long, Integer> pred = new TreeMap<Long, Integer>();
		java.util.PriorityQueue<double[]> queue = new java.util.PriorityQueue<double[]>(
				64, new java.util.Comparator<double[]>() {
					public int compare(double[] a, double[] c) {
						return Double.compare(a[0], c[0]);
					}
				});
		dist.put(Long.valueOf(b.scenario.source), Double.valueOf(0.0));
		pred.put(Long.valueOf(b.scenario.source), Integer.valueOf(-1));
		queue.add(new double[] { 0.0, b.scenario.source });
		while (!queue.isEmpty()) {
			double[] head = queue.poll();
			double d = head[0];
			long node = (long) head[1];
			Double best = dist.get(Long.valueOf(node));
			if (best != null && d > best.doubleValue()) {
				continue;
			}
			List<StreetNetwork.Edge> edges = adj.get(Long.valueOf(node));
			if (edges == null) {
				continue;
			}
			for (StreetNetwork.Edge e : edges) {
				if (net.isBlocked(node, e.toNode)) {
					continue;
				}
				double nd = d + e.lengthM;
				Double old = dist.get(Long.valueOf(e.toNode));
				if (old == null || nd <= old.doubleValue()) { // <-- THE MUTATION
					dist.put(Long.valueOf(e.toNode), Double.valueOf(nd));
					pred.put(Long.valueOf(e.toNode), ids.get(e));
					queue.add(new double[] { nd, e.toNode });
				}
			}
		}
		return pred;
	}

	// ---- emission -----------------------------------------------------------

	public static void main(String[] args) throws Exception {
		if (args.length < 1) {
			throw new IllegalArgumentException("usage: TieOracleDumper <outDir>");
		}
		File outDir = new File(args[0]);
		if (!outDir.isDirectory() && !outDir.mkdirs()) {
			throw new IOException("cannot create " + outDir);
		}

		List<Scenario> defs = scenarios();
		List<Built> built = new ArrayList<Built>(defs.size());
		for (Scenario s : defs) {
			built.add(build(s));
		}

		int tieNodes = 0;
		int maxCandidates = 0;
		int mutantDisagreements = 0;
		for (Built b : built) {
			int localTies = 0;
			for (Map.Entry<Long, int[]> e : b.tieCandidates.entrySet()) {
				if (e.getValue().length >= 2) {
					localTies++;
					maxCandidates = Math.max(maxCandidates, e.getValue().length);
				}
			}
			require(localTies > 0, b.scenario.id + ": contains no exact tie at all");
			tieNodes += localTies;
			Map<Long, Integer> mutant = mutantLePredecessors(b);
			for (Map.Entry<Long, Integer> e : b.pred.entrySet()) {
				Integer m = mutant.get(e.getKey());
				if (m == null || m.intValue() != e.getValue().intValue()) {
					mutantDisagreements++;
				}
			}
		}
		require(maxCandidates >= 3, "no scenario carries a three-way tie (max " + maxCandidates + ")");
		require(mutantDisagreements > 0,
				"a '<=' relaxation reproduces every certified predecessor in this corpus — "
				+ "the fixture would not discriminate and is NOT written");

		StringBuilder sb = new StringBuilder(1 << 14);
		sb.append("# websim tie oracle -- certified geography.routing.StreetNetwork.computeTree\n");
		sb.append("# generated by websim/pipeline/java-exporter/src-tie/websim/exporter/tie/"
				+ "TieOracleDumper.java\n");
		sb.append("# java_version=").append(System.getProperty("java.version")).append('\n');
		sb.append("# street_network_sha256=").append(streetNetworkSha()).append('\n');
		sb.append("# scenarios=").append(built.size())
				.append("\ttie_nodes=").append(tieNodes)
				.append("\tmax_tie_candidates=").append(maxCandidates)
				.append("\tle_mutant_predecessor_disagreements=").append(mutantDisagreements)
				.append('\n');
		sb.append("#\n");
		sb.append("# The graphs are SYNTHETIC; the coordinates are real certified graph node\n");
		sb.append("# positions, so every weight below is a genuine WGS84 geodesic. The certified\n");
		sb.append("# corpus contains no exact tie at all (109,434 pairwise-distinct edge lengths;\n");
		sb.append("# 0 tie nodes across 3,539,712 certified tree rows), which is why the tie\n");
		sb.append("# policy cannot be pinned down by any cut of the real graph.\n");
		sb.append("#\n");
		sb.append("# ANCHOR   idx\tcertified_node_id\tlon_hex\tlat_hex\n");
		sb.append("# SCENARIO id\tsource_node\tnodes\tfeatures\tblocked_pairs\tnote\n");
		sb.append("# NODE     id\tnode_id\tanchor_idx\n");
		sb.append("# FEATURE  id\tfeature_idx\tfrom_node\tto_node\tlength_m_hex\tn_coords\n");
		sb.append("# ADJ      id\tnode_id\tdirected_edge_id,...   (certified adjacency order)\n");
		sb.append("# BLOCK    id\tnode_a\tnode_b\n");
		sb.append("# TREE     id\tnode_id\tdist_m_hex\tpredecessor_directed_edge\n");
		sb.append("# TIE      id\tnode_id\tcandidate_directed_edge,...  (>=2 = an exact tie)\n");

		for (int i = 0; i < ANCHOR_IDS.length; i++) {
			sb.append("ANCHOR\t").append(i).append('\t').append(ANCHOR_IDS[i]).append('\t')
					.append(hex(Double.longBitsToDouble(ANCHOR_LON_BITS[i]))).append('\t')
					.append(hex(Double.longBitsToDouble(ANCHOR_LAT_BITS[i]))).append('\n');
		}
		for (Built b : built) {
			Scenario s = b.scenario;
			sb.append("SCENARIO\t").append(s.id).append('\t').append(s.source).append('\t')
					.append(s.anchorOf.size()).append('\t').append(s.features.size()).append('\t')
					.append(s.blocked.size()).append('\t').append(s.note).append('\n');
			for (Map.Entry<Long, Integer> e : s.anchorOf.entrySet()) {
				sb.append("NODE\t").append(s.id).append('\t').append(e.getKey()).append('\t')
						.append(e.getValue()).append('\n');
			}
			for (int i = 0; i < b.featureLength.length; i++) {
				sb.append("FEATURE\t").append(s.id).append('\t').append(i).append('\t')
						.append(b.featureFrom[i]).append('\t').append(b.featureTo[i]).append('\t')
						.append(hex(b.featureLength[i])).append('\t')
						.append(b.featureCoordCount[i]).append('\n');
			}
			for (Map.Entry<Long, int[]> e : new TreeMap<Long, int[]>(b.adjacency).entrySet()) {
				sb.append("ADJ\t").append(s.id).append('\t').append(e.getKey()).append('\t')
						.append(join(e.getValue())).append('\n');
			}
			for (long[] pair : s.blocked) {
				sb.append("BLOCK\t").append(s.id).append('\t').append(pair[0]).append('\t')
						.append(pair[1]).append('\n');
			}
			for (Map.Entry<Long, Double> e : b.dist.entrySet()) {
				sb.append("TREE\t").append(s.id).append('\t').append(e.getKey()).append('\t')
						.append(hex(e.getValue().doubleValue())).append('\t')
						.append(b.pred.get(e.getKey())).append('\n');
			}
			for (Map.Entry<Long, int[]> e : b.tieCandidates.entrySet()) {
				if (e.getValue().length < 2) {
					continue;
				}
				sb.append("TIE\t").append(s.id).append('\t').append(e.getKey()).append('\t')
						.append(join(e.getValue())).append('\n');
			}
		}

		File out = new File(outDir, "tie-oracle.tsv");
		byte[] bytes = sb.toString().getBytes(StandardCharsets.UTF_8);
		Writer w = new OutputStreamWriter(new FileOutputStream(out), StandardCharsets.UTF_8);
		try {
			w.write(sb.toString());
		} finally {
			w.close();
		}
		System.out.printf(Locale.ROOT,
				"[C2] tie oracle: %d scenarios, %d tie nodes, max %d-way, "
				+ "'<=' mutant disagrees on %d predecessors -> %s (%d bytes, sha256 %s)%n",
				Integer.valueOf(built.size()), Integer.valueOf(tieNodes),
				Integer.valueOf(maxCandidates), Integer.valueOf(mutantDisagreements),
				out.getPath(), Integer.valueOf(bytes.length), sha256(bytes));
	}

	// ---- small helpers ------------------------------------------------------

	private static void require(boolean ok, String message) {
		if (!ok) {
			throw new IllegalStateException(message);
		}
	}

	private static Object field(Object o, Class<?> c, String name) throws Exception {
		Field f = c.getDeclaredField(name);
		f.setAccessible(true);
		return f.get(o);
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

	private static int[] append(int[] a, int v) {
		if (a == null) {
			return new int[] { v };
		}
		int[] b = new int[a.length + 1];
		System.arraycopy(a, 0, b, 0, a.length);
		b[a.length] = v;
		return b;
	}

	private static String join(int[] a) {
		StringBuilder sb = new StringBuilder();
		for (int i = 0; i < a.length; i++) {
			if (i > 0) {
				sb.append(',');
			}
			sb.append(a[i]);
		}
		return sb.toString();
	}

	private static String hex(double v) {
		return String.format(Locale.ROOT, "%016x", Long.valueOf(Double.doubleToLongBits(v)));
	}

	private static String sha256(byte[] bytes) throws Exception {
		MessageDigest md = MessageDigest.getInstance("SHA-256");
		return toHex(md.digest(bytes));
	}

	/** SHA-256 of the certified StreetNetwork source, so the oracle names its origin. */
	private static String streetNetworkSha() throws Exception {
		File f = new File("../Geography/src/geography/routing/StreetNetwork.java");
		if (!f.isFile()) {
			f = new File("Geography/src/geography/routing/StreetNetwork.java");
		}
		if (!f.isFile()) {
			return "unavailable";
		}
		MessageDigest md = MessageDigest.getInstance("SHA-256");
		java.io.InputStream in = new java.io.FileInputStream(f);
		try {
			byte[] buf = new byte[8192];
			int n;
			while ((n = in.read(buf)) > 0) {
				md.update(buf, 0, n);
			}
		} finally {
			in.close();
		}
		return toHex(md.digest());
	}

	private static String toHex(byte[] d) {
		StringBuilder sb = new StringBuilder(d.length * 2);
		for (byte b : d) {
			sb.append(Character.forDigit((b >> 4) & 0xf, 16)).append(Character.forDigit(b & 0xf, 16));
		}
		return sb.toString();
	}
}
