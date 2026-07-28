package wildfire;

import java.io.BufferedReader;
import java.io.FileReader;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * SimData -- loads every input table once, statically, before agents exist.
 *
 * This is the "data in" half of making Repast compute. Without it the agents
 * have nothing to react to and there is nothing to accumulate.
 *
 * Expects a folder "repast_data" in the ECLIPSE PROJECT ROOT (not src/).
 * Repast's working directory is the project root. If you get
 * FileNotFoundException, that is why -- print new File(".").getAbsolutePath()
 * to confirm where it is actually looking.
 *
 * Files:
 *   nodes.csv              node_id,lat,lon
 *   shelters.csv           name,node_id,lat,lon,capacity
 *   agents_initial.csv     agent_id,node_id,age_bin,comorbidity,
 *                          awareness_prob,max_travel_m,w_age,w_comorbid
 *   pm25_by_node_hour.csv  node_id,hour,pm25
 */
public class SimData {

    public static final String DATA_DIR = "repast_data";

    /** node_id -> {lat, lon} */
    public static final Map<Long, double[]> NODE_COORDS = new HashMap<>();

    /** node_id -> hourly PM2.5 array */
    public static final Map<Long, double[]> PM25 = new HashMap<>();

    public static final List<Map<String, String>> SHELTER_ROWS = new ArrayList<>();
    public static final List<Map<String, String>> AGENT_ROWS = new ArrayList<>();

    public static int N_HOURS = 0;

    private static boolean loaded = false;

    /** Call once from the ContextBuilder before creating anything. */
    public static void load() {
        if (loaded) return;
        try {
            loadNodes();
            loadPm25();
            SHELTER_ROWS.addAll(readCsv(DATA_DIR + "/shelters.csv"));
            AGENT_ROWS.addAll(readCsv(DATA_DIR + "/agents_initial.csv"));
            loaded = true;
            System.out.printf(
                "SimData: %d nodes, %d with PM2.5, %d hours, %d shelters, %d agents%n",
                NODE_COORDS.size(), PM25.size(), N_HOURS,
                SHELTER_ROWS.size(), AGENT_ROWS.size());
        } catch (IOException e) {
            throw new RuntimeException(
                "Could not load " + DATA_DIR + ". Repast's working directory is "
                + "the Eclipse project root -- put repast_data there.", e);
        }
    }

    private static void loadNodes() throws IOException {
        for (Map<String, String> r : readCsv(DATA_DIR + "/nodes.csv")) {
            NODE_COORDS.put(
                Long.parseLong(r.get("node_id")),
                new double[]{ Double.parseDouble(r.get("lat")),
                              Double.parseDouble(r.get("lon")) });
        }
    }

    /**
     * Long-format PM2.5 (node_id,hour,pm25) pivoted into an array per node.
     * Two passes: first find the horizon, then fill.
     */
    private static void loadPm25() throws IOException {
        List<Map<String, String>> rows = readCsv(DATA_DIR + "/pm25_by_node_hour.csv");
        int maxHour = 0;
        for (Map<String, String> r : rows) {
            maxHour = Math.max(maxHour, Integer.parseInt(r.get("hour")));
        }
        N_HOURS = maxHour + 1;
        for (Map<String, String> r : rows) {
            long node = Long.parseLong(r.get("node_id"));
            int h = Integer.parseInt(r.get("hour"));
            PM25.computeIfAbsent(node, k -> new double[N_HOURS])[h] =
                Double.parseDouble(r.get("pm25"));
        }
    }

    /**
     * PM2.5 at a node and hour. Falls back to the county mean if the node has
     * no series, so a missing node degrades gracefully instead of throwing
     * mid-run.
     */
    public static double pm25At(long nodeId, int hour) {
        double[] series = PM25.get(nodeId);
        if (series == null) return countyMean(hour);
        if (hour >= series.length) return series[series.length - 1];
        return series[hour];
    }

    private static double countyMean(int hour) {
        double sum = 0; int n = 0;
        for (double[] s : PM25.values()) {
            if (hour < s.length) { sum += s[hour]; n++; }
        }
        return n == 0 ? 0.0 : sum / n;
    }

    /** Minimal CSV reader. Assumes a header row and no quoted commas. */
    private static List<Map<String, String>> readCsv(String path) throws IOException {
        List<Map<String, String>> out = new ArrayList<>();
        try (BufferedReader br = new BufferedReader(new FileReader(path))) {
            String header = br.readLine();
            if (header == null) return out;
            String[] cols = header.split(",");
            for (int i = 0; i < cols.length; i++) cols[i] = cols[i].trim();
            String line;
            while ((line = br.readLine()) != null) {
                if (line.trim().isEmpty()) continue;
                String[] v = line.split(",", -1);
                Map<String, String> row = new HashMap<>();
                for (int i = 0; i < cols.length && i < v.length; i++) {
                    row.put(cols[i], v[i].trim());
                }
                out.add(row);
            }
        }
        return out;
    }

    /** Great-circle metres, inflated by a street-detour factor. */
    public static double walkDistance(double lat1, double lon1,
                                      double lat2, double lon2) {
        final double R = 6371000.0;
        final double CIRCUITY = 1.4;
        double p1 = Math.toRadians(lat1), p2 = Math.toRadians(lat2);
        double dp = Math.toRadians(lat2 - lat1);
        double dl = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dp / 2) * Math.sin(dp / 2)
                 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return R * 2 * Math.asin(Math.sqrt(a)) * CIRCUITY;
    }
}
