package geography.routing;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;

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
 * street feature ({@code PDX_F_NODE} / {@code PDX_T_NODE} in Streets.dbf),
 * so topology comes from the authoritative data rather than geometric
 * snapping. Edges are street polylines weighted by their geodesic length in
 * metres on the WGS84 ellipsoid (GeographicLib; Karney 2013,
 * doi:10.1007/s00190-012-0578-z). The graph is undirected: pedestrians are
 * not bound by one-way vehicle restrictions.
 *
 * Routing uses Dijkstra single-source shortest-path trees. The intended
 * pattern (see ContextCreator) is one tree per shelter — in an undirected
 * graph, distance(shelter, agent) equals distance(agent, shelter), so any
 * agent can look up its network distance to every shelter and reconstruct
 * its walking path from the shelter's tree in O(path length).
 */
public class StreetNetwork {

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
	}

	private final Map<Long, List<Edge>> adjacency = new HashMap<Long, List<Edge>>();
	private final Map<Long, Coordinate> nodeCoords = new HashMap<Long, Coordinate>();
	private final STRtree nodeIndex = new STRtree();
	private boolean indexBuilt = false;

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
	 * Adds one street feature as an undirected edge pair.
	 *
	 * @param fromNode RLIS PDX_F_NODE id
	 * @param toNode   RLIS PDX_T_NODE id
	 * @param coords   polyline vertices oriented fromNode -> toNode
	 * @return geodesic length of the street in metres
	 */
	public double addStreet(long fromNode, long toNode, Coordinate[] coords) {
		double lengthM = polylineLengthM(coords);

		Coordinate[] reversed = new Coordinate[coords.length];
		for (int i = 0; i < coords.length; i++) {
			reversed[i] = coords[coords.length - 1 - i];
		}

		edgesFrom(fromNode).add(new Edge(fromNode, toNode, lengthM, coords));
		edgesFrom(toNode).add(new Edge(toNode, fromNode, lengthM, reversed));

		if (!nodeCoords.containsKey(fromNode)) {
			nodeCoords.put(fromNode, coords[0]);
		}
		if (!nodeCoords.containsKey(toNode)) {
			nodeCoords.put(toNode, coords[coords.length - 1]);
		}
		return lengthM;
	}

	private List<Edge> edgesFrom(long node) {
		List<Edge> list = adjacency.get(node);
		if (list == null) {
			list = new ArrayList<Edge>();
			adjacency.put(node, list);
		}
		return list;
	}

	/** Builds the spatial index over nodes; call once after all addStreet calls. */
	public void buildIndex() {
		for (Map.Entry<Long, Coordinate> e : nodeCoords.entrySet()) {
			nodeIndex.insert(new Envelope(e.getValue()), e.getKey());
		}
		nodeIndex.build();
		indexBuilt = true;
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
