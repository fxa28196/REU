package wildfire;

import java.util.Map;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;

import repast.simphony.context.Context;
import repast.simphony.context.space.gis.GeographyFactoryFinder;
import repast.simphony.dataLoader.ContextBuilder;
import repast.simphony.engine.environment.RunEnvironment;
import repast.simphony.engine.schedule.ScheduledMethod;
import repast.simphony.parameter.Parameters;
import repast.simphony.space.gis.Geography;
import repast.simphony.space.gis.GeographyParameters;

/**
 * WildfireBuilder -- replaces the demo's ContextBuilder.
 *
 * In Repast, this class IS the model setup. Point your scenario at it:
 *   Run Configuration -> Data Loader -> "Custom ContextBuilder Loader"
 *   -> wildfire.WildfireBuilder
 */
public class WildfireBuilder implements ContextBuilder<Object> {

    private static Context<Object> ctx;

    @Override
    public Context<Object> build(Context<Object> context) {
        context.setId("wildfire");
        ctx = context;

        // Wipe static state -- Repast reuses the JVM between batch runs.
        Shelter.clearRegistry();

        SimData.load();

        Geography<Object> geography = GeographyFactoryFinder
                .createGeographyFactory(null)
                .createGeography("Geography", context, new GeographyParameters<>());

        GeometryFactory gf = new GeometryFactory();

        // ---- shelters --------------------------------------------------
        int nShelters = 0;
        for (Map<String, String> r : SimData.SHELTER_ROWS) {
            long nodeId = Long.parseLong(r.get("node_id"));
            double[] c = SimData.NODE_COORDS.get(nodeId);
            if (c == null) {
                System.err.println("Shelter has no node coords: " + r.get("name"));
                continue;
            }
            Shelter s = new Shelter(nodeId, r.get("name"),
                    (int) Double.parseDouble(r.get("capacity")));
            context.add(s);
            Shelter.register(s);
            geography.move(s, gf.createPoint(new Coordinate(c[1], c[0])));  // lon, lat
            nShelters++;
        }

        // ---- agents ----------------------------------------------------
        // Optional GUI override: add an Integer parameter "nAgents" in the
        // Parameters panel to sweep population size.
        Parameters p = RunEnvironment.getInstance().getParameters();
        int limit = SimData.AGENT_ROWS.size();
        if (p != null && p.getSchema().contains("nAgents")) {
            limit = Math.min(limit, (Integer) p.getValue("nAgents"));
        }

        int nAgents = 0;
        for (Map<String, String> r : SimData.AGENT_ROWS) {
            if (nAgents >= limit) break;
            long nodeId = Long.parseLong(r.get("node_id"));
            double[] c = SimData.NODE_COORDS.get(nodeId);
            if (c == null) continue;

            UnshelteredAgent a = new UnshelteredAgent(
                    geography,
                    Integer.parseInt(r.get("agent_id")),
                    nodeId,
                    Double.parseDouble(r.get("awareness_prob")),
                    Double.parseDouble(r.get("max_travel_m")),
                    r.get("age_bin"),
                    r.get("comorbidity"),
                    parseOr(r.get("w_age"), 1.0),
                    parseOr(r.get("w_comorbid"), 1.0));

            context.add(a);
            geography.move(a, gf.createPoint(new Coordinate(c[1], c[0])));
            nAgents++;
        }

        context.add(this);   // so resetOccupancy() gets scheduled

        System.out.printf("Built: %d agents, %d shelters, ending at tick %d%n",
                nAgents, nShelters, SimData.N_HOURS);

        RunEnvironment.getInstance().endAt(SimData.N_HOURS);
        return context;
    }

    /**
     * Runs BEFORE the agents each tick (higher priority = earlier), so
     * occupancy is a clean per-tick count rather than a running total.
     */
    @ScheduledMethod(start = 1, interval = 1, priority = 1)
    public void resetOccupancy() {
        Shelter.resetAllOccupancy();
    }

    private static double parseOr(String s, double dflt) {
        if (s == null || s.isEmpty()) return dflt;
        try { return Double.parseDouble(s); } catch (NumberFormatException e) { return dflt; }
    }

    public static Context<Object> getContext() { return ctx; }
}
