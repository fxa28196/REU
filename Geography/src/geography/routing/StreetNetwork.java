package geography.routing;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Set;

import net.sf.geographiclib.Geodesic;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Envelope;
import org.locationtech.jts.index.strtree.ItemBoundable;
import org.locationtech.jts.index.strtree.ItemDistance;
import org.locationtech.jts.index.strtree.STRtree;

/**
 * Routable pedestrian graph over the Portland Metro RLIS street centerlines.
 *
 * Nodes are the RLIS-assigned street-intersection IDs carried by every
 * street feature ({@code PDX_F_NODE} / {@code PDX_T_NODE} in Streets.dbf).
 * Edges are street polylines weighted by their geodesic length in
 * metres on the WGS84 ellipsoid (GeographicLib; Karney 2013,
 * doi:10.1007/s00190-012-0578-z). The graph is undirected: pedestrians are
 * not bound by one-way vehicle restrictions.
 *
 * <p><b>Validation layer (docs/validation/STREET_NETWORK_VALIDATION.md).</b>
 * The attribute topology is NOT blindly trusted: a small block of node IDs
 * (~107657&ndash;107723) is corrupt in Streets.dbf &mdash; the same ID is claimed at
 * locations up to ~18.5&nbsp;km apart by different features. Naively keying nodes
 * by attribute ID therefore created "wormhole" edges whose Dijkstra weight is
 * metres but whose physical span is kilometres, under-costing shortest paths
 * and sending walking agents on long straight-line off-street legs.
 *
 * <p>The graph is now finalised in {@link #buildIndex()}:
 * <ol>
 *   <li>Every feature endpoint registers a <i>claim</i> (attribute ID +
 *       coordinate). Claims of one ID within {@link #NODE_SITE_TOLERANCE_M}
 *       of each other form one <i>node site</i>.</li>
 *   <li>The first site of each ID keeps the attribute ID as its graph node id
 *       (primary site). Every additional site &mdash; evidence of a corrupt
 *       attribute &mdash; is <b>corrected, never deleted</b>: it is
 *       <i>reattached</i> to a geometrically coincident primary node
 *       (&le; {@link #REATTACH_TOLERANCE_M}) if one exists, else it becomes a
 *       <i>split</i> synthetic node (negative id) at its true location.</li>
 *   <li>Edges are then materialised between resolved endpoints, and audited:
 *       endpoint-to-node gaps and node-to-node geographic span vs polyline
 *       length (an edge spanning farther than it is long is an impossible
 *       jump). Connectivity (component census) is recomputed.</li>
 * </ol>
 * Every correction carries a provenance record ({@link Correction}) exported
 * in {@code simulation.json} under {@code street_network_validation}.
 *
 * <p>Routing uses Dijkstra single-source shortest-path trees. The intended
 * pattern (see ContextCreator) is one tree per shelter &mdash; in an undirected
 * graph, distance(shelter, agent) equals distance(agent, shelter), so any
 * agent can look up its network distance to every shelter and reconstruct
 * its walking path from the shelter's tree in O(path length).
 */
public class StreetNetwork {

	/** Claims of one attribute node ID within this distance are one physical
	 *  junction. Legitimate endpoint scatter in RLIS is sub-metre; the smallest
	 *  corrupt-ID displacement observed is ~1.6 km, so 100 m separates the two
	 *  regimes with a wide margin (and caps any residual gap at walking scale). */
	public static final double NODE_SITE_TOLERANCE_M = 100.0;

	/** A corrected site is aliased to an existing node if one lies within this
	 *  distance: endpoints coincident at this scale are the same junction. */
	public static final double REATTACH_TOLERANCE_M = 10.0;

	/** Audit slack: an edge whose endpoint span exceeds its polyline length by
	 *  more than this is an impossible jump (post-fix expectation: zero). */
	public static final double IMPOSSIBLE_EDGE_SLACK_M =
			2 * NODE_SITE_TOLERANCE_M + 2 * REATTACH_TOLERANCE_M;

	/** A directed traversal of one street feature (stored once per direction). */
	public static final class Edge {
		public final long fromNode;
		public final long toNode;
		public final double lengthM;
		/** Polyline vertices oriented fromNode -> toNode (WGS84 lon/lat). */
		public final Coordinate[] coords;

		Edge(long fromNode, long toNode, double lengthM, Coordinate[] coords) {
			this.fromNode = fromNode;
			this.toNode = toNode;
			this.lengthM = lengthM;
			this.coords = coords;
		}
	}

	/** Dijkstra single-source shortest-path tree. */
	public static final class ShortestPathTree {
		public final long sourceNode;
		final Map<Long, Double> distM = new HashMap<Long, Double>();
		/** Edge by which each node was first settled; oriented predecessor -> node. */
		final Map<Long, Edge> predecessorEdge = new HashMap<Long, Edge>();

		ShortestPathTree(long sourceNode) {
			this.sourceNode = sourceNode;
		}

		/** Network metres from the tree's source to the given node (infinity if unreachable). */
		public double distanceTo(long node) {
			Double d = distM.get(node);
			return d == null ? Double.POSITIVE_INFINITY : d.doubleValue();
		}

		/** Number of graph nodes reachable from the source (connectivity probe). */
		public int reachableNodeCount() {
			return distM.size();
		}
	}

	/** One raw street feature, buffered until graph finalisation. */
	private static final class RawStreet {
		final long fNode;
		final long tNode;
		final double lengthM;
		final Coordinate[] coords;
		final String label;

		RawStreet(long fNode, long tNode, double lengthM, Coordinate[] coords, String label) {
			this.fNode = fNode;
			this.tNode = tNode;
			this.lengthM = lengthM;
			this.coords = coords;
			this.label = label;
		}
	}

	/** One distinct physical location claimed under one attribute node ID. */
	private static final class NodeSite {
		final long attrId;
		final Coordinate anchor;
		final String firstFeature;
		int claims = 1;
		long graphId;
		boolean reattached = false;
		double distFromPrimaryM = 0;

		NodeSite(long attrId, Coordinate anchor, String firstFeature) {
			this.attrId = attrId;
			this.anchor = anchor;
			this.firstFeature = firstFeature;
		}
	}

	/** Provenance record for one corrected node site (nothing is deleted). */
	public static final class Correction {
		/** "REATTACHED" (aliased to a coincident junction) or "SPLIT" (synthetic node). */
		public final String kind;
		public final long attrId;
		public final long graphId;
		public final double distFromPrimaryM;
		public final double lon;
		public final double lat;
		public final String firstFeature;
		public final int claims;

		Correction(String kind, NodeSite s) {
			this.kind = kind;
			this.attrId = s.attrId;
			this.graphId = s.graphId;
			this.distFromPrimaryM = s.distFromPrimaryM;
			this.lon = s.anchor.x;
			this.lat = s.anchor.y;
			this.firstFeature = s.firstFeature;
			this.claims = s.claims;
		}
	}

	/** Results of graph validation/finalisation, exported to simulation.json. */
	public static final class ValidationReport {
		public int featureCount;
		public int attrNodeIds;
		public int finalGraphNodes;
		public int affectedAttrIds;
		public int splitSites;
		public int reattachedSites;
		public final List<Correction> corrections = new ArrayList<Correction>();
		public int impossibleEdgesAfterFix;
		public double maxEndpointGapM;
		public int componentCount;
		public int largestComponentSize;
		/** U-27 pedestrian-legality filter: freeway-class features excluded
		 *  from the graph before any edge was added (registry V26). */
		public int freewayFeaturesExcluded;
		public double freewayKmExcluded;
		public final Map<Integer, Integer> freewayExcludedByType =
				new LinkedHashMap<Integer, Integer>();
	}

	private final List<RawStreet> rawStreets = new ArrayList<RawStreet>();
	/** Claims clustered into sites, per attribute node ID (insertion-ordered
	 *  so "first site is primary" is deterministic in shapefile order). */
	private final Map<Long, List<NodeSite>> sitesByAttrId = new LinkedHashMap<Long, List<NodeSite>>();
	private final Map<Long, List<Edge>> adjacency = new HashMap<Long, List<Edge>>();
	private final Map<Long, Coordinate> nodeCoords = new HashMap<Long, Coordinate>();
	private final STRtree nodeIndex = new STRtree();
	private boolean indexBuilt = false;
	private long nextSyntheticId = -1000;
	private ValidationReport report;

	// U-27 exclusion accumulators, copied into the ValidationReport at
	// finaliseGraph() (the report object does not exist earlier).
	private int excludedFreewayFeatures = 0;
	private double excludedFreewayLengthM = 0;
	private final Map<Integer, Integer> excludedFreewayByType =
			new LinkedHashMap<Integer, Integer>();

	/** Planar centre-to-centre distance used only to rank spatial-index candidates. */
	private static final ItemDistance CENTRE_DISTANCE = new ItemDistance() {
		public double distance(ItemBoundable i1, ItemBoundable i2) {
			Coordinate c1 = ((Envelope) i1.getBounds()).centre();
			Coordinate c2 = ((Envelope) i2.getBounds()).centre();
			return c1.distance(c2);
		}
	};

	/** Geodesic (WGS84 ellipsoid) distance in metres between two lon/lat coordinates. */
	public static double geodesicDistanceM(Coordinate a, Coordinate b) {
		return Geodesic.WGS84.Inverse(a.y, a.x, b.y, b.x).s12;
	}

	/** Geodesic length in metres of a lon/lat polyline. */
	public static double polylineLengthM(Coordinate[] coords) {
		double total = 0;
		for (int i = 1; i < coords.length; i++) {
			total += geodesicDistanceM(coords[i - 1], coords[i]);
		}
		return total;
	}

	/**
	 * Buffers one street feature; the graph itself is materialised (with
	 * validation) in {@link #buildIndex()}.
	 *
	 * @param fromNode RLIS PDX_F_NODE id
	 * @param toNode   RLIS PDX_T_NODE id
	 * @param coords   polyline vertices oriented fromNode -> toNode
	 * @param featureLabel street name, kept for correction provenance
	 * @return geodesic length of the street in metres
	 */
	public double addStreet(long fromNode, long toNode, Coordinate[] coords, String featureLabel) {
		double lengthM = polylineLengthM(coords);
		rawStreets.add(new RawStreet(fromNode, toNode, lengthM, coords, featureLabel));
		registerClaim(fromNode, coords[0], featureLabel);
		registerClaim(toNode, coords[coords.length - 1], featureLabel);
		return lengthM;
	}

	/** U-27 provenance: records one street feature excluded from the
	 *  pedestrian graph by its RLIS TYPE class (freeway mainline or ramp,
	 *  registry V26). The feature never reaches {@link #addStreet}; this
	 *  only keeps the removal count for the manifest. */
	public void recordExcludedFeature(int rlisType, double lengthM) {
		excludedFreewayFeatures++;
		excludedFreewayLengthM += lengthM;
		Integer prev = excludedFreewayByType.get(rlisType);
		excludedFreewayByType.put(rlisType, prev == null ? 1 : prev + 1);
	}

	private void registerClaim(long attrId, Coordinate endpoint, String label) {
		List<NodeSite> sites = sitesByAttrId.get(attrId);
		if (sites == null) {
			sites = new ArrayList<NodeSite>(1);
			sitesByAttrId.put(attrId, sites);
		}
		for (NodeSite s : sites) {
			if (geodesicDistanceM(endpoint, s.anchor) <= NODE_SITE_TOLERANCE_M) {
				s.claims++;
				return;
			}
		}
		sites.add(new NodeSite(attrId, new Coordinate(endpoint), label));
	}

	/** Finalises the validated graph and builds the spatial index over nodes;
	 *  call once after all addStreet calls. */
	public void buildIndex() {
		finaliseGraph();
		for (Map.Entry<Long, Coordinate> e : nodeCoords.entrySet()) {
			nodeIndex.insert(new Envelope(e.getValue()), e.getKey());
		}
		nodeIndex.build();
		indexBuilt = true;
	}

	private void finaliseGraph() {
		report = new ValidationReport();
		report.featureCount = rawStreets.size();
		report.attrNodeIds = sitesByAttrId.size();
		report.freewayFeaturesExcluded = excludedFreewayFeatures;
		report.freewayKmExcluded = excludedFreewayLengthM / 1000.0;
		report.freewayExcludedByType.putAll(excludedFreewayByType);

		// Pass 1 -- primary sites keep the attribute ID as graph node id.
		STRtree primaryIndex = new STRtree();
		for (List<NodeSite> sites : sitesByAttrId.values()) {
			NodeSite primary = sites.get(0);
			primary.graphId = primary.attrId;
			primaryIndex.insert(new Envelope(primary.anchor), primary);
		}
		primaryIndex.build();

		// Pass 2 -- every ADDITIONAL site of an ID is a corrupt-attribute
		// symptom: correct it (reattach by geometry, else split), with provenance.
		for (List<NodeSite> sites : sitesByAttrId.values()) {
			if (sites.size() == 1) {
				continue;
			}
			report.affectedAttrIds++;
			NodeSite primary = sites.get(0);
			for (int i = 1; i < sites.size(); i++) {
				NodeSite s = sites.get(i);
				s.distFromPrimaryM = geodesicDistanceM(s.anchor, primary.anchor);
				NodeSite near = (NodeSite) primaryIndex.nearestNeighbour(
						new Envelope(s.anchor), s, CENTRE_DISTANCE);
				if (near != null && geodesicDistanceM(s.anchor, near.anchor) <= REATTACH_TOLERANCE_M) {
					s.graphId = near.graphId;
					s.reattached = true;
					report.reattachedSites++;
					report.corrections.add(new Correction("REATTACHED", s));
				} else {
					s.graphId = nextSyntheticId--;
					report.splitSites++;
					report.corrections.add(new Correction("SPLIT", s));
				}
			}
		}

		// Node coordinates: primary/split sites anchor their own location;
		// reattached sites resolve to an existing node (its coord is kept).
		for (List<NodeSite> sites : sitesByAttrId.values()) {
			for (NodeSite s : sites) {
				if (!nodeCoords.containsKey(s.graphId)) {
					nodeCoords.put(s.graphId, s.anchor);
				}
			}
		}
		report.finalGraphNodes = nodeCoords.size();

		// Pass 3 -- materialise edges between resolved endpoints, and audit
		// every edge: endpoint-coordinate gap and node-to-node geographic span
		// vs polyline length (an edge spanning farther than it is long would
		// be an impossible jump).
		for (RawStreet r : rawStreets) {
			long f = resolveGraphId(r.fNode, r.coords[0]);
			long t = resolveGraphId(r.tNode, r.coords[r.coords.length - 1]);

			Coordinate[] reversed = new Coordinate[r.coords.length];
			for (int i = 0; i < r.coords.length; i++) {
				reversed[i] = r.coords[r.coords.length - 1 - i];
			}
			edgesFrom(f).add(new Edge(f, t, r.lengthM, r.coords));
			edgesFrom(t).add(new Edge(t, f, r.lengthM, reversed));

			double gapF = geodesicDistanceM(r.coords[0], nodeCoords.get(f));
			double gapT = geodesicDistanceM(r.coords[r.coords.length - 1], nodeCoords.get(t));
			double gap = Math.max(gapF, gapT);
			if (gap > report.maxEndpointGapM) {
				report.maxEndpointGapM = gap;
			}
			double spanM = geodesicDistanceM(nodeCoords.get(f), nodeCoords.get(t));
			if (spanM > r.lengthM + IMPOSSIBLE_EDGE_SLACK_M) {
				report.impossibleEdgesAfterFix++;
			}
		}

		// Connectivity census (BFS over the undirected adjacency).
		Set<Long> seen = new HashSet<Long>();
		for (Long start : adjacency.keySet()) {
			if (seen.contains(start)) {
				continue;
			}
			report.componentCount++;
			int size = 0;
			Deque<Long> queue = new ArrayDeque<Long>();
			queue.add(start);
			seen.add(start);
			while (!queue.isEmpty()) {
				long node = queue.poll();
				size++;
				List<Edge> edges = adjacency.get(node);
				if (edges == null) {
					continue;
				}
				for (Edge e : edges) {
					if (seen.add(e.toNode)) {
						queue.add(e.toNode);
					}
				}
			}
			if (size > report.largestComponentSize) {
				report.largestComponentSize = size;
			}
		}
	}

	private long resolveGraphId(long attrId, Coordinate endpoint) {
		for (NodeSite s : sitesByAttrId.get(attrId)) {
			if (geodesicDistanceM(endpoint, s.anchor) <= NODE_SITE_TOLERANCE_M) {
				return s.graphId;
			}
		}
		throw new IllegalStateException("unresolved endpoint for attribute node id " + attrId);
	}

	/** Validation/correction results; available after {@link #buildIndex()}. */
	public ValidationReport getValidationReport() {
		if (report == null) {
			throw new IllegalStateException("buildIndex() must be called before getValidationReport()");
		}
		return report;
	}

	private List<Edge> edgesFrom(long node) {
		List<Edge> list = adjacency.get(node);
		if (list == null) {
			list = new ArrayList<Edge>();
			adjacency.put(node, list);
		}
		return list;
	}

	/**
	 * Nearest graph node to a lon/lat coordinate. Candidate ranking uses
	 * planar degree distance (adequate for snapping at street scale; the
	 * anisotropy at 45.5 N only matters between near-equidistant nodes).
	 */
	public long nearestNode(Coordinate c) {
		if (!indexBuilt) {
			throw new IllegalStateException("buildIndex() must be called before nearestNode()");
		}
		Object hit = nodeIndex.nearestNeighbour(new Envelope(c), Long.valueOf(-1L), CENTRE_DISTANCE);
		return ((Long) hit).longValue();
	}

	public Coordinate nodeCoordinate(long node) {
		return nodeCoords.get(node);
	}

	public int nodeCount() {
		return nodeCoords.size();
	}

	public int streetEdgeCount() {
		int directed = 0;
		for (List<Edge> l : adjacency.values()) {
			directed += l.size();
		}
		return directed / 2;
	}

	/** Dijkstra from the given source over the whole reachable component. */
	public ShortestPathTree computeTree(long sourceNode) {
		ShortestPathTree tree = new ShortestPathTree(sourceNode);
		// PQ entries: {distance, node}; stale entries skipped on poll.
		PriorityQueue<double[]> queue = new PriorityQueue<double[]>(
				64, (a, b) -> Double.compare(a[0], b[0]));

		tree.distM.put(sourceNode, 0.0);
		queue.add(new double[] { 0.0, sourceNode });

		while (!queue.isEmpty()) {
			double[] head = queue.poll();
			double d = head[0];
			long node = (long) head[1];
			Double best = tree.distM.get(node);
			if (best != null && d > best.doubleValue()) {
				continue; // stale queue entry
			}
			List<Edge> edges = adjacency.get(node);
			if (edges == null) {
				continue;
			}
			for (Edge e : edges) {
				double nd = d + e.lengthM;
				Double old = tree.distM.get(e.toNode);
				if (old == null || nd < old.doubleValue()) {
					tree.distM.put(e.toNode, nd);
					tree.predecessorEdge.put(e.toNode, e);
					queue.add(new double[] { nd, e.toNode });
				}
			}
		}
		return tree;
	}

	/**
	 * Walking path (polyline vertices, WGS84 lon/lat) from {@code fromNode}
	 * to the tree's source node, or null if unreachable.
	 */
	public List<Coordinate> pathToSource(ShortestPathTree tree, long fromNode) {
		if (Double.isInfinite(tree.distanceTo(fromNode))) {
			return null;
		}
		List<Coordinate> path = new ArrayList<Coordinate>();
		path.add(nodeCoords.get(fromNode));
		long node = fromNode;
		while (node != tree.sourceNode) {
			Edge e = tree.predecessorEdge.get(node);
			if (e == null) {
				return null; // defensive: broken tree
			}
			// e is oriented predecessor -> node; walk it reversed.
			for (int i = e.coords.length - 2; i >= 0; i--) {
				path.add(e.coords[i]);
			}
			node = e.fromNode;
		}
		return path;
	}
}
