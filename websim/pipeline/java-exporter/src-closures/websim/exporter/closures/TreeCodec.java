package websim.exporter.closures;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.TreeMap;

import geography.routing.StreetNetwork;

import websim.exporter.world.CertifiedGraph;
import websim.exporter.world.Io;

/**
 * The WP5 shelter-tree wire format, reused verbatim so the closure oracle does
 * not invent a second one.
 *
 * <p><b>Canonical row form</b> — identical to
 * {@code websim/pipeline/java-exporter/src-world/.../ShelterTrees.java}'s data
 * rows (the ones WP5 proved bit-equal on 118 trees / 3,539,712 distances):
 *
 * <pre>
 * &lt;node_id&gt; \t &lt;dist_m_hex&gt; \t &lt;predecessor_directed_edge&gt; \n
 * </pre>
 *
 * <ul>
 *   <li>rows ascending by {@code node_id}, over exactly the nodes present in
 *       {@code tree.distM} — a node absent from the stream is unreachable
 *       ({@code +Infinity}), so the reachable SET is part of the oracle;</li>
 *   <li>{@code dist_m_hex} is {@code %016x} of
 *       {@code Double.doubleToRawLongBits} — raw IEEE-754 bits, never decimal;</li>
 *   <li>{@code predecessor_directed_edge} is {@code featureIndex*2 + dir}
 *       ({@code dir} 0 = as-loaded orientation, 1 = the reversed back-edge), the
 *       identity {@link CertifiedGraph#directedEdgeId} assigns; {@code -1} at
 *       the source node;</li>
 *   <li>encoding UTF-8, terminator LF, no header and no trailing blank line.</li>
 * </ul>
 *
 * <p><b>The digest.</b> {@link #digest} is the SHA-256 of exactly those bytes
 * for the WHOLE array. That is what makes a subset dump sufficient: the port
 * ships {@link #SAMPLE_ROWS} stride-sampled rows for eyeball/regression value
 * and proves FULL equality by recomputing this digest over its own recomputed
 * tree. Nothing about the digest depends on how many rows are sampled.
 *
 * <p>No arithmetic happens here. Distances and predecessors are read out of the
 * object {@code StreetNetwork.computeTree()} returned.
 */
final class TreeCodec {

	private TreeCodec() { }

	/** Stride-sampled rows written per tree per wave state. */
	static final int SAMPLE_ROWS = 128;

	/** One tree's census: what the digest covers, and what it covered. */
	static final class Digest {
		final String sha256;
		final int reachable;
		final long sourceNode;

		Digest(String sha256, int reachable, long sourceNode) {
			this.sha256 = sha256;
			this.reachable = reachable;
			this.sourceNode = sourceNode;
		}
	}

	/**
	 * Digests a tree's full distance+predecessor array and, when {@code sample}
	 * is non-null, writes {@link #SAMPLE_ROWS} deterministic stride rows to it
	 * prefixed by {@code rowPrefix}.
	 *
	 * @param full when non-null, every row is also written here (the
	 *             {@code -FullTrees} mode; ~2 MB per tree)
	 */
	static Digest digest(StreetNetwork.ShortestPathTree tree, CertifiedGraph g,
			Io.Sink sample, Io.Sink full, String rowPrefix) throws Exception {
		Map<Long, Double> distM = distMap(tree);
		Map<Long, StreetNetwork.Edge> predEdge = predMap(tree);
		TreeMap<Long, Double> sorted = new TreeMap<Long, Double>(distM);

		MessageDigest md = MessageDigest.getInstance("SHA-256");
		int[] pick = Io.stride(sorted.size(), SAMPLE_ROWS);
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
							+ nodeId + " (source " + tree.sourceNode + ")");
				}
				pid = mapped.intValue();
			}
			sb.setLength(0);
			sb.append(nodeId).append('\t').append(Io.hexD(e.getValue().doubleValue()))
					.append('\t').append(pid);
			String line = sb.toString();
			md.update(line.getBytes(StandardCharsets.UTF_8));
			md.update((byte) '\n');
			if (full != null) {
				full.line(line);
			}
			if (sample != null && pi < pick.length && pick[pi] == k) {
				sample.line(rowPrefix + line);
				pi++;
			}
			k++;
		}
		return new Digest(Io.sha256Hex(md.digest()), sorted.size(), tree.sourceNode);
	}

	/** SHA-256 over a run of per-tree digests, in shelter-CSV load order. */
	static String rollup(java.util.List<String> perTreeSha) throws Exception {
		MessageDigest md = MessageDigest.getInstance("SHA-256");
		for (String s : perTreeSha) {
			md.update(s.getBytes(StandardCharsets.UTF_8));
			md.update((byte) '\n');
		}
		return Io.sha256Hex(md.digest());
	}

	@SuppressWarnings("unchecked")
	private static Map<Long, Double> distMap(StreetNetwork.ShortestPathTree tree) {
		try {
			return (Map<Long, Double>) CReflect.instanceField(tree,
					StreetNetwork.ShortestPathTree.class, "distM");
		} catch (Exception e) {
			throw new IllegalStateException("cannot read certified ShortestPathTree.distM", e);
		}
	}

	@SuppressWarnings("unchecked")
	private static Map<Long, StreetNetwork.Edge> predMap(StreetNetwork.ShortestPathTree tree) {
		try {
			return (Map<Long, StreetNetwork.Edge>) CReflect.instanceField(tree,
					StreetNetwork.ShortestPathTree.class, "predecessorEdge");
		} catch (Exception e) {
			throw new IllegalStateException("cannot read certified ShortestPathTree.predecessorEdge", e);
		}
	}
}
