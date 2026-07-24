package geography.agents;

import geography.routing.StreetNetwork;

/**
 * A clean-air shelter. Placement, id and capacity are PLACEHOLDERS until the
 * real Multnomah County cleaner-air shelter data lands (PROJECT_ASSESSMENT.md
 * R3/V12); capacity is not yet enforced (roadmap commit 6).
 *
 * Each shelter is snapped to its nearest street-graph node at context build
 * and carries the Dijkstra shortest-path tree rooted there, so every resident
 * can look up its true network distance to this shelter and reconstruct a
 * walking path (see {@link geography.routing.StreetNetwork}).
 */
public class Shelter {
    private String id;
    private int capacity;

    /** Street-graph node this shelter is snapped to (RLIS node id). */
    private long graphNodeId = -1;
    /** Dijkstra tree rooted at {@link #graphNodeId}; set once at context build. */
    private StreetNetwork.ShortestPathTree routeTree;

    public Shelter(String id, int capacity) {
        this.id = id;
        this.capacity = capacity;
    }

    public String getId() {
        return id;
    }

    public int getCapacity() {
        return capacity;
    }

    public long getGraphNodeId() {
        return graphNodeId;
    }

    public void setGraphNodeId(long graphNodeId) {
        this.graphNodeId = graphNodeId;
    }

    public StreetNetwork.ShortestPathTree getRouteTree() {
        return routeTree;
    }

    public void setRouteTree(StreetNetwork.ShortestPathTree routeTree) {
        this.routeTree = routeTree;
    }
}
