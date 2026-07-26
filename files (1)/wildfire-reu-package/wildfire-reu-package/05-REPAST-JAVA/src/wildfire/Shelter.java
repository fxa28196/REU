package wildfire;

import java.util.ArrayList;
import java.util.List;

/**
 * Shelter -- this is your renamed RadioTower, but with state that matters.
 *
 * The demo's tower was decorative. This one tracks occupancy and refuses
 * agents when full, which is what makes the strategy comparison meaningful:
 * without capacity, every strategy converges because all 500 agents pile into
 * whichever shelter is nearest.
 */
public class Shelter {

    private static final List<Shelter> REGISTRY = new ArrayList<>();

    private final long nodeId;
    private final String name;
    private final int capacity;
    private int occupancy = 0;

    public Shelter(long nodeId, String name, int capacity) {
        this.nodeId = nodeId;
        this.name = name;
        this.capacity = capacity;
    }

    // ---- registry ----------------------------------------------------

    /**
     * MUST be called at the top of every ContextBuilder.build().
     * Repast reuses the JVM across batch runs, so without this the static
     * registry leaks shelters from the previous run and occupancy grows
     * forever. This is the single most common source of nonsense batch output.
     */
    public static void clearRegistry() {
        REGISTRY.clear();
    }

    public static void register(Shelter s) {
        REGISTRY.add(s);
    }

    public static List<Shelter> all() {
        return REGISTRY;
    }

    /** Reset occupancy counters at the start of each tick. */
    public static void resetAllOccupancy() {
        for (Shelter s : REGISTRY) s.occupancy = 0;
    }

    /**
     * Nearest shelter to (lat, lon) that is within maxMetres AND has space.
     * Returns null if none qualifies -- the agent then stays outside, which is
     * the realistic outcome and the thing the model is meant to capture.
     */
    public static Shelter nearestAvailable(double lat, double lon, double maxMetres) {
        Shelter best = null;
        double bestD = Double.MAX_VALUE;
        for (Shelter s : REGISTRY) {
            if (!s.hasSpace()) continue;
            double[] c = SimData.NODE_COORDS.get(s.nodeId);
            if (c == null) continue;
            double d = SimData.walkDistance(lat, lon, c[0], c[1]);
            if (d <= maxMetres && d < bestD) {
                bestD = d;
                best = s;
            }
        }
        return best;
    }

    // ---- instance ----------------------------------------------------

    public boolean hasSpace()   { return occupancy < capacity; }
    public void    enter()      { occupancy++; }
    public long    getNodeId()  { return nodeId; }
    public String  getName()    { return name; }
    public int     getCapacity(){ return capacity; }
    public int     getOccupancy() { return occupancy; }

    /** Exposed so you can chart shelter utilisation live in the GUI. */
    public double getUtilisation() {
        return capacity == 0 ? 0.0 : (double) occupancy / capacity;
    }

    @Override
    public String toString() {
        return String.format("Shelter[%s @ %d, %d/%d]", name, nodeId, occupancy, capacity);
    }
}
