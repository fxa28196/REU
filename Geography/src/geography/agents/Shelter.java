package geography.agents;

import geography.routing.StreetNetwork;

/**
 * A clean-air (smoke-respite) shelter.
 *
 * Real September 2020 shelters are loaded from
 * {@code data/shelters/shelters_2020-09.csv} (provenance in
 * Geography/data/README.md and docs/science/DATA_SOURCES.md D1). Each shelter
 * is snapped to its nearest street-graph node at context build and carries the
 * Dijkstra shortest-path tree rooted there, so every resident can look up its
 * true network distance and reconstruct a walking path
 * ({@link geography.routing.StreetNetwork}).
 *
 * Capacity is enforced: a shelter admits residents up to {@link #capacity};
 * once full it refuses admission and the resident must re-route (V12,
 * docs/science/DESIGN_SPEC.md). A null capacity means "not capacity-limited"
 * (used for standby sites that are modelled as always-available if operating).
 */
public class Shelter {
    private final String id;
    private final String name;
    /** Nightly capacity; null = not capacity-limited. Provenance: see DATA_SOURCES D1. */
    private final Integer capacity;
    /** Whether this site is part of the active scenario (standby sites are off by default). */
    private final boolean operating;
    private final double lon;
    private final double lat;

    /** Street-graph node this shelter is snapped to (RLIS node id). */
    private long graphNodeId = -1;
    /** Dijkstra tree rooted at {@link #graphNodeId}; set once at context build. */
    private StreetNetwork.ShortestPathTree routeTree;

    /** Number of residents currently admitted (V12 occupancy). */
    private int occupancy = 0;
    /** Peak occupancy over the run (shelter-level export metric). */
    private int peakOccupancy = 0;
    /** Count of admission refusals due to capacity (shelter-level export metric). */
    private int refusedCount = 0;

    public Shelter(String id, String name, Integer capacity, boolean operating, double lon, double lat) {
        this.id = id;
        this.name = name;
        this.capacity = capacity;
        this.operating = operating;
        this.lon = lon;
        this.lat = lat;
    }

    /**
     * Attempts to admit one resident. Returns true and increments occupancy if
     * there is room (or the shelter is not capacity-limited); otherwise records
     * a refusal and returns false.
     */
    public boolean admit() {
        if (capacity != null && occupancy >= capacity) {
            refusedCount++;
            return false;
        }
        occupancy++;
        if (occupancy > peakOccupancy) {
            peakOccupancy = occupancy;
        }
        return true;
    }

    /** True if this shelter can currently admit at least one more resident. */
    public boolean hasSpace() {
        return capacity == null || occupancy < capacity;
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public Integer getCapacity() { return capacity; }
    public boolean isOperating() { return operating; }
    public double getLon() { return lon; }
    public double getLat() { return lat; }
    public int getOccupancy() { return occupancy; }
    public int getPeakOccupancy() { return peakOccupancy; }
    public int getRefusedCount() { return refusedCount; }

    public long getGraphNodeId() { return graphNodeId; }
    public void setGraphNodeId(long graphNodeId) { this.graphNodeId = graphNodeId; }
    public StreetNetwork.ShortestPathTree getRouteTree() { return routeTree; }
    public void setRouteTree(StreetNetwork.ShortestPathTree routeTree) { this.routeTree = routeTree; }

    @Override
    public String toString() { return id; }
}
