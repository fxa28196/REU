package wildfire;

// JTS import note:
//   Repast Simphony 2.7+  -> org.locationtech.jts.*   (below)
//   Repast Simphony <=2.6 -> com.vividsolutions.jts.*
// If these two go red, swap the prefix. That is the only version-dependent
// line in the whole model.
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;

import repast.simphony.engine.environment.RunEnvironment;
import repast.simphony.engine.schedule.ScheduledMethod;
import repast.simphony.random.RandomHelper;
import repast.simphony.space.gis.Geography;

/**
 * UnshelteredAgent -- this is where Repast starts COMPUTING rather than just
 * animating.
 *
 * The demo agent had a step() that wandered. This one:
 *   1. reads the PM2.5 at its own location for the current tick
 *   2. decides whether to seek shelter or go home
 *   3. ACCUMULATES exposure, weighted by its own susceptibility
 *
 * Step 3 is the part that produces data. The getters at the bottom are what
 * Repast's Data Set reads -- if a quantity has no public getter, it cannot be
 * logged, so anything you want in your results must appear there.
 */
public class UnshelteredAgent {

    public static final double EPA_UNHEALTHY = 35.4;   // ug/m3
    public static final double FILTRATION    = 0.35;   // indoor/outdoor ratio

    private final Geography<Object> geography;
    private final GeometryFactory gf = new GeometryFactory();

    private final int  agentId;
    private final long homeNode;
    private long currentNode;

    // behavioural
    private final double awarenessProb;
    private final double maxTravelM;

    // biological -- these are SUSCEPTIBILITY WEIGHTS (dimensionless ratios),
    // not outcome relative risks. See the note on Eq. (1) in the chapter.
    private final String ageBin;
    private final String comorbidity;
    private final double wAge;
    private final double wComorbid;

    // accumulators -- THE OUTPUT
    private double cumulativePm25 = 0.0;   // ug/m3 * hours
    private double cumulativeVwe  = 0.0;   // weighted
    private int    hoursSheltered = 0;
    private int    hoursAboveThreshold = 0;
    private boolean sheltered = false;

    public UnshelteredAgent(Geography<Object> geography, int agentId, long homeNode,
                            double awarenessProb, double maxTravelM,
                            String ageBin, String comorbidity,
                            double wAge, double wComorbid) {
        this.geography     = geography;
        this.agentId       = agentId;
        this.homeNode      = homeNode;
        this.currentNode   = homeNode;
        this.awarenessProb = awarenessProb;
        this.maxTravelM    = maxTravelM;
        this.ageBin        = ageBin;
        this.comorbidity   = comorbidity;
        this.wAge          = wAge;
        this.wComorbid     = wComorbid;
    }

    /**
     * One simulated hour. Priority 0 runs after the model's tick setup
     * (see WildfireBuilder.resetOccupancy at priority 1).
     */
    @ScheduledMethod(start = 1, interval = 1, priority = 0)
    public void step() {
        int hour = (int) RunEnvironment.getInstance().getCurrentSchedule().getTickCount();

        double outdoor = SimData.pm25At(currentNode, hour);
        if (outdoor > EPA_UNHEALTHY) hoursAboveThreshold++;

        // --- decision -------------------------------------------------
        if (sheltered && outdoor <= EPA_UNHEALTHY) {
            // air cleared -> go home
            moveToNode(homeNode);
            sheltered = false;

        } else if (!sheltered && outdoor > EPA_UNHEALTHY) {
            boolean aware = RandomHelper.nextDouble() < awarenessProb;
            if (aware) {
                double[] here = SimData.NODE_COORDS.get(currentNode);
                if (here != null) {
                    Shelter target = Shelter.nearestAvailable(here[0], here[1], maxTravelM);
                    if (target != null) {
                        target.enter();               // capacity consumed
                        moveToNode(target.getNodeId());
                        sheltered = true;
                    }
                }
            }
        } else if (sheltered) {
            // already sheltered and air still bad -- re-consume the slot so the
            // occupancy count for this tick stays correct
            for (Shelter s : Shelter.all()) {
                if (s.getNodeId() == currentNode) { s.enter(); break; }
            }
        }

        // --- accumulation (THIS IS THE DATA) --------------------------
        double effective = SimData.pm25At(currentNode, hour);
        if (sheltered) {
            effective *= FILTRATION;
            hoursSheltered++;
        }
        cumulativePm25 += effective;
        cumulativeVwe  += effective * wAge * wComorbid;
    }

    private void moveToNode(long nodeId) {
        this.currentNode = nodeId;
        double[] c = SimData.NODE_COORDS.get(nodeId);
        if (c != null) {
            // JTS Coordinate is (x, y) = (LONGITUDE, LATITUDE).
            // Swap these and your agents render in the Indian Ocean.
            geography.move(this, gf.createPoint(new Coordinate(c[1], c[0])));
        }
    }

    // ---- getters: everything you want logged must be here -------------

    public int    getAgentId()             { return agentId; }
    public double getCumulativePm25()      { return cumulativePm25; }
    public double getCumulativeVwe()       { return cumulativeVwe; }
    public int    getHoursSheltered()      { return hoursSheltered; }
    public int    getHoursAboveThreshold() { return hoursAboveThreshold; }
    public String getAgeBin()              { return ageBin; }
    public String getComorbidity()         { return comorbidity; }
    public double getCombinedWeight()      { return wAge * wComorbid; }
    public long   getCurrentNode()         { return currentNode; }
    public int    getSheltered()           { return sheltered ? 1 : 0; }

    @Override
    public String toString() {
        return String.format("Agent[%d @ %d, pm=%.1f, vwe=%.1f]",
                agentId, currentNode, cumulativePm25, cumulativeVwe);
    }
}
