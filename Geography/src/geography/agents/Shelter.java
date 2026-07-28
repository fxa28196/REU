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

    /** Tick this shelter opens / closes, from the real `opened`/`closed` dates in
     *  the shelter CSV (D1: OCC 2020-09-10, CJ 2020-09-11, both to 2020-09-19).
     *  Set by ContextCreator relative to the simulation start. Negative infinity
     *  / positive infinity when the opening-date gate is disabled, which
     *  reproduces the always-open behaviour of every run before this commit.
     *
     *  <p><b>Assumption (documented, A-02 mitigation).</b> The source gives a
     *  DATE, not an hour, so opening is taken as 00:00 local on that date — the
     *  earliest defensible reading. Real shelters opened later in the day, so
     *  this UNDERSTATES pre-opening outdoor exposure; the direction of the bias
     *  is known and stated rather than tuned away. */
    private double openTick = Double.NEGATIVE_INFINITY;
    private double closeTick = Double.POSITIVE_INFINITY;

    /** Street-graph node this shelter is snapped to (RLIS node id). */
    private long graphNodeId = -1;
    /** Dijkstra tree rooted at {@link #graphNodeId}; set once at context build. */
    private StreetNetwork.ShortestPathTree routeTree;

    /** Spaces held back for priority (mobility-limited) arrivals under the
     *  need-based-admission scenario (arm D). Set by ContextCreator from the
     *  {@code triageReserveFraction} parameter, clamped to [0, capacity].
     *
     *  <p><b>Zero by default, and zero is exactly the old behaviour.</b> With
     *  {@code reservedForPriority == 0} the priority-aware predicates below are
     *  arithmetically identical to the first-come-first-served ones they
     *  replaced, so arms A/B/C reproduce byte-identically. */
    private int reservedForPriority = 0;

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
        return admit(false);
    }

    /**
     * Attempts to admit one resident under need-based admission (arm D).
     * A priority arrival may use the whole capacity; a non-priority arrival is
     * refused once occupancy reaches {@code capacity - reservedForPriority}.
     * With the reserve at 0 this is identical to {@link #admit()}.
     */
    public boolean admit(boolean isPriority) {
        if (!hasSpaceFor(isPriority)) {
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
        return hasSpaceFor(false);
    }

    /** True if this shelter can currently admit one more resident of the given
     *  priority class. Non-priority residents see only the unreserved part of
     *  the capacity; priority residents see all of it. */
    public boolean hasSpaceFor(boolean isPriority) {
        if (capacity == null) {
            return true;
        }
        int usable = isPriority ? capacity : capacity - reservedForPriority;
        return occupancy < usable;
    }

    /** Sets the number of spaces held for priority arrivals, clamped into
     *  [0, capacity]. No-op for capacity-unlimited shelters. */
    public void setReservedForPriority(int reserved) {
        if (capacity == null) {
            this.reservedForPriority = 0;
            return;
        }
        this.reservedForPriority = Math.max(0, Math.min(capacity.intValue(), reserved));
    }

    public int getReservedForPriority() { return reservedForPriority; }

    /** True if this shelter is physically open at the given tick. Always true
     *  when the opening-date gate is disabled (openTick = -inf, closeTick = +inf). */
    public boolean isOpenAt(double tick) {
        return tick >= openTick && tick < closeTick;
    }

    /** True if this shelter can be selected and entered right now: operating in
     *  the scenario, open on the calendar, and not yet full. */
    public boolean isAvailableAt(double tick) {
        return isAvailableAt(tick, false);
    }

    /** As {@link #isAvailableAt(double)} but for a resident of the given
     *  priority class (arm D). Identical when the reserve is 0. */
    public boolean isAvailableAt(double tick, boolean isPriority) {
        return operating && isOpenAt(tick) && hasSpaceFor(isPriority);
    }

    public void setOpenWindowTicks(double openTick, double closeTick) {
        this.openTick = openTick;
        this.closeTick = closeTick;
    }

    public double getOpenTick() { return openTick; }
    public double getCloseTick() { return closeTick; }

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
