package geography.output;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

import geography.agents.GisAgent;
import geography.agents.Shelter;
import geography.env.SmokeField;
import geography.routing.StreetNetwork;
import geography.science.ScienceRegistry;

import repast.simphony.context.Context;

/**
 * Writes the three-level results pipeline at end of run
 * (docs/science/METRICS.md is the data dictionary):
 *
 * <ul>
 *   <li><b>agents.csv</b> — one row per resident: identity, start, assigned
 *       shelter, outcome, travel, exposure, VWE, vulnerability modifiers.</li>
 *   <li><b>shelters.csv</b> — one row per shelter: capacity, peak/final
 *       occupancy, refusals, utilisation, mean travel of admitted residents.</li>
 *   <li><b>simulation.json</b> — run-level summary AND the reproducibility
 *       manifest: seed, every parameter, input-dataset SHA-256 checksums, git
 *       commit, software versions, population outcome counts, exposure
 *       distribution, Gini coefficients, travel and shelter statistics.</li>
 * </ul>
 *
 * Every exported quantity is defined in docs/science/METRICS.md with units,
 * calculation, interpretation, limitations and supporting literature. Nothing
 * important is left only in memory.
 */
public class OutcomeLogger {

	private final Context<Object> context;
	private final SmokeField smokeField;
	private final long seed;
	private final File outDir;
	private final String[] paramNames;
	private final Object[] paramValues;
	private final String[] inputDataFiles;
	private final String simId;
	private final String dataVersionTag;
	private final StreetNetwork.ValidationReport netReport;
	private final ScienceRegistry registry;
	private final String scenarioName;
	/** Null when heterogeneity is disabled; supplies realised-marginal reporting. */
	private final geography.agents.PopulationSampler sampler;

	public OutcomeLogger(Context<Object> context, SmokeField smokeField, long seed,
			String[] paramNames, Object[] paramValues, String[] inputDataFiles,
			StreetNetwork.ValidationReport netReport, ScienceRegistry registry,
			String scenarioName, geography.agents.PopulationSampler sampler) {
		this.scenarioName = scenarioName;
		this.sampler = sampler;
		this.context = context;
		this.smokeField = smokeField;
		this.seed = seed;
		this.paramNames = paramNames;
		this.paramValues = paramValues;
		this.inputDataFiles = inputDataFiles;
		this.netReport = netReport;
		this.registry = registry;
		this.simId = "sim-" + java.time.LocalDateTime.now()
				.format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")) + "-seed" + seed;
		StringBuilder cat = new StringBuilder();
		for (String fpath : inputDataFiles) {
			cat.append(sha256(fpath));
		}
		this.dataVersionTag = sha256OfString(cat.toString()).substring(0, 12);
		this.outDir = new File("output/run_seed" + seed);
		this.outDir.mkdirs();
	}

	/** Scheduled at end of run (see ContextCreator). Writes all three levels. */
	public void export() {
		List<GisAgent> agents = new ArrayList<GisAgent>();
		for (Object o : context.getObjects(GisAgent.class)) {
			agents.add((GisAgent) o);
		}
		List<Shelter> shelters = new ArrayList<Shelter>();
		for (Object o : context.getObjects(Shelter.class)) {
			shelters.add((Shelter) o);
		}
		writeAgents(agents);
		writeShelters(shelters, agents);
		writeSimulation(agents, shelters);
		System.out.println("[OutcomeLogger] wrote agent/shelter/simulation results to "
				+ outDir.getPath());
	}

	private void writeAgents(List<GisAgent> agents) {
		File f = new File(outDir, "agents.csv");
		double mpt = param("minutesPerTick");
		String commit = gitCommit();
		try (PrintWriter w = new PrintWriter(f, "UTF-8")) {
			// Complete per-agent journey record. Run-identity columns (sim_id,
			// commit, seed, data_version) repeat on every row so the CSV is
			// self-describing and analysable standalone. age/asthma/copd are
			// intentionally EMPTY: not implemented (see CURRENT_MODEL_RUN.md);
			// no value is invented.
			// planned_route_m / snap_gap_m / door_refusals are appended per the
			// append-only CSV contract (07-OUTPUTS.md, D-2): QC quantities for
			// the A-17 walked-vs-planned routing-integrity check
			// (total_travel_distance_m <= planned_route_m + snap_gap_m + tol),
			// not new science.
			w.println("agent_id,sim_id,commit,random_seed,data_version,"
					+ "starting_encampment,start_lon,start_lat,shelter_reached,reached_shelter,"
					+ "time_started_tick,time_started_local,time_arrived_tick,time_arrived_local,"
					+ "travel_time_min,total_travel_distance_m,network_dist_to_shelter_m,"
					+ "avg_pm25_ugm3,peak_pm25_ugm3,cumulative_dose_ugm3h,exposure_while_traveling_ugm3h,"
					+ "vwe_ugm3h,hours_above_unhealthy,age,asthma,copd,age_rr,comorbidity_rr,final_state,"
					+ "planned_route_m,snap_gap_m,door_refusals,"
					// Heterogeneity block (V18-V22, V10 revised). EMPTY when
					// heterogeneity is disabled - never a fabricated default.
					+ "scenario,walking_speed_mps,age_years,age_band,sex,"
					+ "mobility_limited,mobility_category,asthma_flag,copd_flag,"
					+ "any_respiratory,chronic_physical,vulnerable_flag,"
					// Exposure / dose / risk kept as three separate columns so
					// physics and biology are never conflated (HEALTH_MODEL_AUDIT).
					+ "air_volume_breathed_m3,mean_ventilation_m3h,"
					+ "inhaled_dose_ug,health_risk_multiplier,health_risk_score");
			for (GisAgent a : agents) {
				boolean reached = a.getState() == GisAgent.State.SHELTERED;
				String shelter = reached && a.getTargetShelter() != null ? a.getTargetShelter().getId() : "";
				double evac = a.getEvacuationTick();
				double arr = a.getArrivalTick();
				String startTick = Double.isNaN(evac) ? "" : String.valueOf((long) evac);
				String startLocal = Double.isNaN(evac) ? "" : smokeField.timeForTick(evac, mpt).toString();
				String arrTick = Double.isNaN(arr) ? "" : String.valueOf((long) arr);
				String arrLocal = Double.isNaN(arr) ? "" : smokeField.timeForTick(arr, mpt).toString();
				String travelMin = (Double.isNaN(evac) || Double.isNaN(arr)) ? ""
						: String.format(Locale.US, "%.1f", (arr - evac) * mpt);
				double outH = a.getOutdoorHours();
				String avgPm = outH > 0 ? String.format(Locale.US, "%.2f", a.getExposureUgM3h() / outH) : "";
				String netDist = Double.isNaN(a.getNetworkDistToShelterM()) ? ""
						: String.format(Locale.US, "%.2f", a.getNetworkDistToShelterM());
				// Real encampment start location (WGS84), 6 dp ~= 0.1 m. Empty
				// rather than 0,0 if unset, so a missing coordinate can never be
				// mistaken for a point in the Gulf of Guinea.
				String startLonS = Double.isNaN(a.getStartLon()) ? ""
						: String.format(Locale.US, "%.6f", a.getStartLon());
				String startLatS = Double.isNaN(a.getStartLat()) ? ""
						: String.format(Locale.US, "%.6f", a.getStartLat());
				// age/asthma/copd legacy columns are filled from the sampled
				// attributes when heterogeneity is on, and stay EMPTY when it is
				// off (they were always "not implemented, no invented value").
				geography.agents.PopulationSampler.Attributes at = a.getAttributes();
				String legacyAge = at == null ? "" : String.valueOf(at.ageYears);
				String legacyAsthma = at == null ? "" : (at.asthma ? "1" : "0");
				String legacyCopd = at == null ? "" : (at.copd ? "1" : "0");
				String het = (at == null)
						? ",,,,,,,,,,"
						: String.format(Locale.US, "%.4f,%d,%s,%s,%d,%s,%d,%d,%d,%d,%d",
								at.walkingSpeedMps, at.ageYears, at.ageBand.label, at.sex,
								at.mobilityLimited ? 1 : 0, at.mobilityCategory.label,
								at.asthma ? 1 : 0, at.copd ? 1 : 0,
								(at.asthma || at.copd) ? 1 : 0,
								at.chronicPhysical ? 1 : 0,
								isVulnerable(at) ? 1 : 0);
				w.printf(Locale.US,
						"%s,%s,%s,%d,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%.2f,%s,%s,%.2f,%.4f,%.4f,%.4f,%.4f,%s,%s,%s,%.3f,%.3f,%s,%.2f,%.2f,%d,%s,%s,%.4f,%.4f,%.4f,%.3f,%.4f%n",
						a.getName(), simId, commit, seed, dataVersionTag,
						a.getEncampmentId(), startLonS, startLatS,
						shelter, reached ? "yes" : "no",
						startTick, startLocal, arrTick, arrLocal,
						travelMin, a.getDistanceTraveledM(), netDist,
						avgPm, a.getPeakConcUgM3(), a.getExposureUgM3h(), a.getExposureWhileTravelingUgM3h(),
						a.getVweUgM3h(), a.getHoursAboveUnhealthy(),
						legacyAge, legacyAsthma, legacyCopd,
						a.getAgeRR(), a.getComorbidityRR(), a.getState(),
						a.getPlannedRouteM(), a.getSnapGapM(), a.getRetargetCount(),
						csv(scenarioName), het,
						a.getAirVolumeBreathedM3(), a.getMeanVentilationM3h(),
						a.getInhaledDoseUg(), a.getHealthRiskMultiplier(),
						a.getHealthRiskScore());
			}
		} catch (Exception e) {
			throw new RuntimeException("writeAgents failed", e);
		}
	}

	private void writeShelters(List<Shelter> shelters, List<GisAgent> agents) {
		File f = new File(outDir, "shelters.csv");
		try (PrintWriter w = new PrintWriter(f, "UTF-8")) {
			w.println("shelter_id,name,lon,lat,capacity,operating,peak_occupancy,"
					+ "final_occupancy,refused_count,utilization,mean_travel_dist_m_admitted");
			for (Shelter s : shelters) {
				double sumTravel = 0; int nAdmitted = 0;
				for (GisAgent a : agents) {
					if (a.getState() == GisAgent.State.SHELTERED
							&& a.getTargetShelter() == s) {
						sumTravel += a.getDistanceTraveledM();
						nAdmitted++;
					}
				}
				String util = (s.getCapacity() == null) ? ""
						: String.format(Locale.US, "%.4f", s.getOccupancy() / (double) s.getCapacity());
				String meanTravel = (nAdmitted == 0) ? ""
						: String.format(Locale.US, "%.2f", sumTravel / nAdmitted);
				w.printf(Locale.US, "%s,%s,%.6f,%.6f,%s,%b,%d,%d,%d,%s,%s%n",
						s.getId(), csv(s.getName()), s.getLon(), s.getLat(),
						s.getCapacity() == null ? "" : String.valueOf(s.getCapacity()),
						s.isOperating(), s.getPeakOccupancy(), s.getOccupancy(),
						s.getRefusedCount(), util, meanTravel);
			}
		} catch (Exception e) {
			throw new RuntimeException("writeShelters failed", e);
		}
	}

	private void writeSimulation(List<GisAgent> agents, List<Shelter> shelters) {
		int n = agents.size();
		double[] exposure = new double[n];
		double[] vwe = new double[n];
		double[] travel = new double[n];
		int sheltered = 0, enRoute = 0, unreachable = 0, refused = 0, preEvac = 0;
		double sumHoursUnhealthy = 0;
		for (int i = 0; i < n; i++) {
			GisAgent a = agents.get(i);
			exposure[i] = a.getExposureUgM3h();
			vwe[i] = a.getVweUgM3h();
			travel[i] = a.getDistanceTraveledM();
			sumHoursUnhealthy += a.getHoursAboveUnhealthy();
			switch (a.getState()) {
				case SHELTERED: sheltered++; break;
				case EN_ROUTE: enRoute++; break;
				case UNREACHABLE: unreachable++; break;
				case REFUSED_ALL_FULL: refused++; break;
				case PRE_EVAC: preEvac++; break;
			}
		}

		File f = new File(outDir, "simulation.json");
		try (PrintWriter w = new PrintWriter(f, "UTF-8")) {
			w.println("{");
			w.println("  \"schema\": \"reu-wildfire-shelter-abm/simulation/v1\",");
			w.println("  \"generated_utc\": \"" + LocalDateTime.now() + "\",");
			w.println("  \"reproducibility\": {");
			w.println("    \"random_seed\": " + seed + ",");
			w.println("    \"sim_id\": \"" + jsonEsc(simId) + "\",");
			w.println("    \"data_version_tag\": \"" + jsonEsc(dataVersionTag) + "\",");
			w.println("    \"git_commit\": \"" + jsonEsc(gitCommit()) + "\",");
			w.println("    \"java_version\": \"" + jsonEsc(System.getProperty("java.version")) + "\",");
			w.println("    \"repast_version\": \"2.11.0\",");
			w.print("    \"parameters\": {");
			for (int i = 0; i < paramNames.length; i++) {
				w.print((i == 0 ? "" : ", ") + "\"" + paramNames[i] + "\": " + jsonVal(paramValues[i]));
			}
			w.println("},");
			w.println("    \"input_datasets\": [");
			for (int i = 0; i < inputDataFiles.length; i++) {
				w.println("      {\"file\": \"" + jsonEsc(inputDataFiles[i]) + "\", \"sha256\": \""
						+ sha256(inputDataFiles[i]) + "\"}" + (i < inputDataFiles.length - 1 ? "," : ""));
			}
			w.println("    ],");
			writeSourceIntegrity(w);
			w.println("  },");
			w.println("  \"smoke_field\": {");
			w.println("    \"county\": \"" + jsonEsc(smokeField.getCounty()) + "\",");
			w.println("    \"start\": \"" + smokeField.getStartDateTime() + "\",");
			w.println("    \"hours\": " + smokeField.hours() + ",");
			w.printf(Locale.US, "    \"peak_hourly_ugm3\": %.1f,%n", smokeField.peakHourly());
			w.println("    \"out_of_range_lookups\": " + smokeField.getOutOfRangeLookups());
			w.println("  },");
			writeNetworkValidation(w);
			writeGovernance(w);
			writeStratifiedExposure(w, agents);
			w.println("  \"scenario\": \"" + jsonEsc(scenarioName) + "\",");
			if (sampler != null) {
				w.printf(Locale.US, "  \"population_sampling\": {\"heterogeneity\": true, "
						+ "\"n_sampled\": %d, \"realised_mobility_limited\": %.4f, "
						+ "\"realised_asthma\": %.4f, \"realised_copd\": %.4f, "
						+ "\"realised_any_respiratory\": %.4f, \"realised_age_55plus\": %.4f, "
						+ "\"mean_walking_speed_mps\": %.4f, \"published_targets\": \"%s\"},%n",
						sampler.getSampledCount(), sampler.getMobilityLimitedShare(),
						sampler.getAsthmaShare(), sampler.getCopdShare(),
						sampler.getAnyRespiratoryShare(), sampler.getAge55PlusShare(),
						sampler.getMeanWalkingSpeedMps(),
						jsonEsc(geography.agents.PopulationSampler.publishedTargets()));
			} else {
				w.println("  \"population_sampling\": {\"heterogeneity\": false},");
			}
			w.println("  \"population\": {");
			w.println("    \"n_agents\": " + n + ",");
			w.println("    \"pre_evac\": " + preEvac + ", \"sheltered\": " + sheltered
					+ ", \"en_route\": " + enRoute + ", \"unreachable\": " + unreachable
					+ ", \"refused_all_full\": " + refused + ",");
			w.printf(Locale.US, "    \"exposure_ugm3h\": {\"mean\": %.4f, \"median\": %.4f, \"min\": %.4f, "
					+ "\"p25\": %.4f, \"p75\": %.4f, \"p90\": %.4f, \"max\": %.4f, \"total\": %.4f, \"gini\": %.4f},%n",
					mean(exposure), pct(exposure, 50), min(exposure), pct(exposure, 25), pct(exposure, 75),
					pct(exposure, 90), max(exposure), sum(exposure), gini(exposure));
			w.printf(Locale.US, "    \"vwe_ugm3h\": {\"mean\": %.4f, \"median\": %.4f, \"total\": %.4f, \"gini\": %.4f},%n",
					mean(vwe), pct(vwe, 50), sum(vwe), gini(vwe));
			w.printf(Locale.US, "    \"total_person_hours_above_unhealthy\": %.2f,%n", sumHoursUnhealthy);
			w.printf(Locale.US, "    \"travel_m\": {\"mean\": %.2f, \"median\": %.2f, \"max\": %.2f}%n",
					mean(travel), pct(travel, 50), max(travel));
			w.println("  },");
			w.println("  \"shelters\": [");
			for (int i = 0; i < shelters.size(); i++) {
				Shelter s = shelters.get(i);
				w.println("    {\"id\": \"" + s.getId() + "\", \"capacity\": "
						+ (s.getCapacity() == null ? "null" : s.getCapacity())
						+ ", \"operating\": " + s.isOperating()
						+ ", \"peak_occupancy\": " + s.getPeakOccupancy()
						+ ", \"final_occupancy\": " + s.getOccupancy()
						+ ", \"refused\": " + s.getRefusedCount() + "}"
						+ (i < shelters.size() - 1 ? "," : ""));
			}
			w.println("  ]");
			w.println("}");
		} catch (Exception e) {
			throw new RuntimeException("writeSimulation failed", e);
		}
	}

	/**
	 * Complete file-integrity census, added after an audit found that
	 * {@code input_datasets} checksummed only {@code Streets.shp} while the
	 * routing graph is built from the node-ID attributes in {@code Streets.dbf}
	 * — a modified .dbf with an unchanged .shp would have produced different
	 * routing under an identical {@code data_version_tag}.
	 *
	 * <p>Deliberately a SEPARATE block: {@code data_version_tag} is left hashing
	 * only the four model inputs so that it stays comparable with every
	 * previously archived run. This block adds the sidecars and the governance
	 * registries, plus a working-tree dirty flag, so a reviewer can verify the
	 * full chain without breaking the existing one.
	 */
	private void writeSourceIntegrity(PrintWriter w) {
		String[] files = {
			"data/Streets.shp", "data/Streets.dbf", "data/Streets.shx",
			"data/Streets.prj", "data/Streets.cpg",
			"data/airnow/aqs_hourly_pm25_portland_2020-09.csv",
			"data/shelters/shelters_2020-09.csv",
			// The three present-day study arms. These replaced
			// shelters_{A,B}_placement_*.csv, which belonged to the retired
			// capacity-equalized 2020 design: those files still existed on disk,
			// so this block kept checksumming them and silently omitted every
			// shelter file that actually drove a run.
			"data/shelters/shelters_2026_current_placement.csv",
			"data/shelters/shelters_2026_expanded_capacity.csv",
			"data/shelters/shelters_2026_expanded_plus_new_sites.csv",
			"data/encampments/irp_campsite_reports_sample.csv",
			"data/registry/variables.csv", "data/registry/assumptions.csv",
		};
		w.println("    \"source_integrity\": {");
		w.println("      \"note\": \"Full checksum census including shapefile sidecars and the "
				+ "governance registries. data_version_tag intentionally covers only the four "
				+ "model inputs, to stay comparable with earlier archived runs.\",");
		// U-21 (docs/critique-response/10-ROUND4-DELTA.md): typing is decided
		// once, here at the writer — true/false as real JSON booleans,
		// "unknown" as a JSON string. Field name and position are part of the
		// append-only manifest contract; do not reorder or rename.
		String dirty = gitWorkingTreeDirty();
		w.println("      \"git_working_tree_dirty\": "
				+ ("unknown".equals(dirty) ? "\"unknown\"" : dirty) + ",");
		w.println("      \"files\": [");
		for (int i = 0; i < files.length; i++) {
			w.println("        {\"file\": \"" + jsonEsc(files[i]) + "\", \"sha256\": \""
					+ sha256(files[i]) + "\"}" + (i < files.length - 1 ? "," : ""));
		}
		w.println("      ]");
		w.println("    }");
	}

	/**
	 * Whether the git working tree contained uncommitted changes when this run
	 * executed, i.e. whether the recorded HEAD commit can actually reproduce
	 * it. An audit found nine archived runs stamped a commit that could not
	 * reproduce them; this flag makes that condition visible in the manifest
	 * instead of silent. Asks git itself — {@code git status --porcelain} run
	 * at the repository root with a 5-second timeout — rather than the earlier
	 * mtime-vs-HEAD heuristic: any porcelain output means dirty, none means
	 * clean. Returns the three-state token {@code "true"} / {@code "false"} /
	 * {@code "unknown"} ("unknown" when git is missing, exits non-zero, times
	 * out, or anything else fails); the manifest writer decides JSON typing
	 * (U-21).
	 */
	private static String gitWorkingTreeDirty() {
		try {
			// Runs launch with cwd = Geography/ (see build.gradle runModel),
			// so the repo root is either "." or its parent.
			File root = new File(".").getCanonicalFile();
			if (!new File(root, ".git").exists()) root = root.getParentFile();
			if (root == null || !new File(root, ".git").exists()) return "unknown";

			ProcessBuilder pb = new ProcessBuilder("git", "status", "--porcelain");
			pb.directory(root);
			pb.redirectError(ProcessBuilder.Redirect.DISCARD);
			Process p = pb.start();
			p.getOutputStream().close();

			// Drain stdout concurrently so a large status list cannot fill the
			// pipe buffer and deadlock the child against waitFor().
			ByteArrayOutputStream stdout = new ByteArrayOutputStream();
			final boolean[] drained = { false };
			Thread drain = new Thread(() -> {
				try (InputStream in = p.getInputStream()) {
					byte[] buf = new byte[8192];
					for (int n; (n = in.read(buf)) != -1;) stdout.write(buf, 0, n);
					drained[0] = true;
				} catch (Exception ignored) {
					// drained[0] stays false; reported as "unknown" below.
				}
			});
			drain.setDaemon(true);
			drain.start();

			if (!p.waitFor(5, TimeUnit.SECONDS)) {
				p.destroyForcibly();
				return "unknown";
			}
			drain.join(1000);
			if (!drained[0] || p.exitValue() != 0) return "unknown";
			return stdout.toString(StandardCharsets.UTF_8).trim().isEmpty() ? "false" : "true";
		} catch (Exception e) {
			return "unknown";
		}
	}

	/** Street-graph validation provenance (docs/validation/STREET_NETWORK_VALIDATION.md):
	 *  which corrupt attribute node ids were corrected, how, and the post-fix
	 *  audit results. Nothing was deleted; every correction is listed. */
	private void writeNetworkValidation(PrintWriter w) {
		if (netReport == null) {
			return;
		}
		w.println("  \"street_network_validation\": {");
		w.printf(Locale.US, "    \"node_site_tolerance_m\": %.1f, \"reattach_tolerance_m\": %.1f,%n",
				StreetNetwork.NODE_SITE_TOLERANCE_M, StreetNetwork.REATTACH_TOLERANCE_M);
		w.println("    \"features\": " + netReport.featureCount
				+ ", \"attr_node_ids\": " + netReport.attrNodeIds
				+ ", \"final_graph_nodes\": " + netReport.finalGraphNodes + ",");
		w.println("    \"affected_attr_node_ids\": " + netReport.affectedAttrIds
				+ ", \"sites_reattached\": " + netReport.reattachedSites
				+ ", \"sites_split_synthetic\": " + netReport.splitSites + ",");
		w.printf(Locale.US, "    \"impossible_edges_after_fix\": %d, \"max_endpoint_gap_m\": %.1f,%n",
				netReport.impossibleEdgesAfterFix, netReport.maxEndpointGapM);
		w.println("    \"components\": " + netReport.componentCount
				+ ", \"largest_component_nodes\": " + netReport.largestComponentSize + ",");
		StringBuilder byType = new StringBuilder();
		for (java.util.Map.Entry<Integer, Integer> e : netReport.freewayExcludedByType.entrySet()) {
			if (byType.length() > 0) byType.append(", ");
			byType.append("\"").append(e.getKey()).append("\": ").append(e.getValue());
		}
		w.printf(Locale.US, "    \"freeway_filter\": {\"features_excluded\": %d, "
				+ "\"km_excluded\": %.1f, \"by_type\": {%s}},%n",
				netReport.freewayFeaturesExcluded, netReport.freewayKmExcluded, byType);
		w.println("    \"corrections\": [");
		for (int i = 0; i < netReport.corrections.size(); i++) {
			StreetNetwork.Correction c = netReport.corrections.get(i);
			w.printf(Locale.US, "      {\"kind\": \"%s\", \"attr_node_id\": %d, \"graph_node_id\": %d, "
					+ "\"dist_from_primary_m\": %.1f, \"lon\": %.6f, \"lat\": %.6f, "
					+ "\"first_feature\": \"%s\", \"claims\": %d}%s%n",
					c.kind, c.attrId, c.graphId, c.distFromPrimaryM, c.lon, c.lat,
					jsonEsc(c.firstFeature), c.claims,
					i < netReport.corrections.size() - 1 ? "," : "");
		}
		w.println("    ]");
		w.println("  },");
	}

	/** Scientific governance block (docs/science/REGISTRY_SCHEMA.md §3): what the
	 *  model claims to know, how well, and what is still inert. Registry
	 *  checksums are reported here rather than in {@code input_datasets} because
	 *  they are governance metadata, not model inputs — adding them there would
	 *  change {@code data_version_tag} and sever comparability with the archived
	 *  baseline without any change to what the model reads. */
	private void writeGovernance(PrintWriter w) {
		if (registry == null) {
			return;
		}
		w.println("  \"governance\": {");
		w.println("    \"variables_file\": \"" + jsonEsc(registry.getVariablesPath())
				+ "\", \"variables_sha256\": \"" + registry.getVariablesSha256() + "\",");
		w.println("    \"assumptions_file\": \"" + jsonEsc(registry.getAssumptionsPath())
				+ "\", \"assumptions_sha256\": \"" + registry.getAssumptionsSha256() + "\",");
		w.println("    \"variable_count\": " + registry.variableCount()
				+ ", \"assumption_count\": " + registry.assumptionCount() + ",");
		w.print("    \"evidence_class_census\": {");
		boolean first = true;
		for (java.util.Map.Entry<String, Integer> e : registry.evidenceClassCensus().entrySet()) {
			w.print((first ? "" : ", ") + "\"" + e.getKey() + "\": " + e.getValue());
			first = false;
		}
		w.println("},");
		w.println("    \"placeholder_variables\": " + jsonStringArray(registry.placeholderVariableIds()) + ",");
		w.println("    \"blocking_assumptions\": " + jsonStringArray(registry.blockingAssumptionIds()));
		w.println("  },");
	}

	private static String jsonStringArray(java.util.List<String> items) {
		StringBuilder sb = new StringBuilder("[");
		for (int i = 0; i < items.size(); i++) {
			sb.append(i == 0 ? "" : ", ").append('"').append(jsonEsc(items.get(i))).append('"');
		}
		return sb.append(']').toString();
	}

	/**
	 * "Vulnerable" for stratified reporting: aged 55+ (the PIT's own older-adult
	 * boundary), OR mobility-limited, OR living with asthma or COPD.
	 *
	 * <p>This is a <b>reporting stratum, not a risk score</b>. It is a union of
	 * measured/imported attributes with no weights attached, precisely because
	 * decision D-3 rejected a multiplied vulnerability index: the coefficients
	 * such an index needs do not exist for this population and could never be
	 * validated here, since no health outcome is simulated. Reporting exposure
	 * separately for this group supports the claim the model CAN make ("this
	 * group accrued more exposure, and here is the mechanism") and not the one it
	 * cannot ("this group suffered more harm").
	 */
	private static boolean isVulnerable(geography.agents.PopulationSampler.Attributes at) {
		return at.ageYears >= 55 || at.mobilityLimited || at.asthma || at.copd
				|| at.chronicPhysical;
	}

	/** Mean of a per-agent quantity over a stratum, or NaN if the stratum is empty. */
	private static double strataMean(List<GisAgent> agents, String stratum, boolean wantMember,
			java.util.function.ToDoubleFunction<GisAgent> value) {
		double sum = 0;
		int n = 0;
		for (GisAgent a : agents) {
			geography.agents.PopulationSampler.Attributes at = a.getAttributes();
			if (at == null) {
				continue;
			}
			if (inStratum(at, stratum) == wantMember) {
				double v = value.applyAsDouble(a);
				// NaN means "not applicable to this resident" (e.g. travel time
				// for someone who never arrived); such residents are excluded
				// from that mean rather than zero-filled, which would understate it.
				if (!Double.isNaN(v)) {
					sum += v;
					n++;
				}
			}
		}
		return n == 0 ? Double.NaN : sum / n;
	}

	private static int strataCount(List<GisAgent> agents, String stratum, boolean wantMember) {
		int n = 0;
		for (GisAgent a : agents) {
			geography.agents.PopulationSampler.Attributes at = a.getAttributes();
			if (at != null && inStratum(at, stratum) == wantMember) {
				n++;
			}
		}
		return n;
	}

	private static boolean inStratum(geography.agents.PopulationSampler.Attributes at, String stratum) {
		if ("age55plus".equals(stratum)) return at.ageYears >= 55;
		if ("mobility_limited".equals(stratum)) return at.mobilityLimited;
		if ("asthma".equals(stratum)) return at.asthma;
		if ("copd".equals(stratum)) return at.copd;
		if ("any_respiratory".equals(stratum)) return at.asthma || at.copd;
		return isVulnerable(at);
	}

	/**
	 * Susceptibility-stratified exposure and access (decision D-3, the study's
	 * PRIMARY equity metric). For each stratum: how many, what share reached
	 * shelter, mean dose, mean walked distance and mean walking speed — for
	 * members and non-members alike, so every difference is reported with the
	 * mechanism (speed → time outdoors) beside it rather than as a bare contrast.
	 * Emitted only when heterogeneity is enabled; otherwise the strata do not exist.
	 */
	private void writeStratifiedExposure(PrintWriter w, List<GisAgent> agents) {
		if (sampler == null) {
			return;
		}
		String[] strata = { "vulnerable_any", "age55plus", "mobility_limited",
				"asthma", "copd", "any_respiratory" };
		w.println("  \"stratified_exposure\": {");
		w.println("    \"definition\": \"vulnerable_any = age 55+ OR mobility-limited OR "
				+ "asthma OR COPD; a REPORTING STRATUM, not a risk score (decision D-3)\",");
		w.println("    \"strata\": [");
		for (int i = 0; i < strata.length; i++) {
			String s = strata[i];
			for (int m = 0; m < 2; m++) {
				boolean member = (m == 0);
				int n = strataCount(agents, s, member);
				w.printf(Locale.US,
						"      {\"stratum\": \"%s\", \"member\": %b, \"n\": %d, "
						+ "\"sheltered_share\": %.4f, \"mean_exposure_ugm3h\": %.2f, "
						+ "\"mean_travel_m\": %.2f, \"mean_travel_time_min\": %.2f, "
						+ "\"mean_walking_speed_mps\": %.4f}%s%n",
						s, member, n,
						strataMean(agents, s, member,
								a -> a.getState() == GisAgent.State.SHELTERED ? 1.0 : 0.0),
						strataMean(agents, s, member, a -> a.getExposureUgM3h()),
						strataMean(agents, s, member, a -> a.getDistanceTraveledM()),
						strataMean(agents, s, member, a -> travelMinutes(a)),
						strataMean(agents, s, member, a -> a.getPersonalWalkingSpeedMps()),
						(i == strata.length - 1 && m == 1) ? "" : ",");
			}
		}
		w.println("    ]");
		w.println("  },");
	}

	/** Minutes between departure and admission, NaN if the resident never arrived. */
	private double travelMinutes(GisAgent a) {
		double evac = a.getEvacuationTick();
		double arr = a.getArrivalTick();
		if (Double.isNaN(evac) || Double.isNaN(arr)) {
			return Double.NaN;
		}
		return (arr - evac) * param("minutesPerTick");
	}

	// --- statistics ----------------------------------------------------------
	private static double sum(double[] x) { double s = 0; for (double v : x) s += v; return s; }
	private static double mean(double[] x) { return x.length == 0 ? 0 : sum(x) / x.length; }
	private static double min(double[] x) { double m = Double.POSITIVE_INFINITY; for (double v : x) m = Math.min(m, v); return x.length == 0 ? 0 : m; }
	private static double max(double[] x) { double m = 0; for (double v : x) m = Math.max(m, v); return m; }

	private static double pct(double[] x, double p) {
		if (x.length == 0) return 0;
		double[] s = x.clone(); Arrays.sort(s);
		double idx = (p / 100.0) * (s.length - 1);
		int lo = (int) Math.floor(idx), hi = (int) Math.ceil(idx);
		if (lo == hi) return s[lo];
		return s[lo] + (idx - lo) * (s[hi] - s[lo]);
	}

	/** Gini coefficient (V14). 0 = perfectly equal; (n-1)/n = maximally unequal. */
	private static double gini(double[] x) {
		int n = x.length;
		double m = mean(x);
		if (n == 0 || m == 0) return 0;
		double absDiff = 0;
		for (int i = 0; i < n; i++)
			for (int j = 0; j < n; j++)
				absDiff += Math.abs(x[i] - x[j]);
		return absDiff / (2.0 * n * n * m);
	}

	// --- reproducibility helpers --------------------------------------------
	private double param(String name) {
		for (int i = 0; i < paramNames.length; i++) {
			if (paramNames[i].equals(name) && paramValues[i] instanceof Number) {
				return ((Number) paramValues[i]).doubleValue();
			}
		}
		return Double.NaN;
	}

	private static String sha256OfString(String s) {
		try {
			MessageDigest md = MessageDigest.getInstance("SHA-256");
			byte[] d = md.digest(s.getBytes(StandardCharsets.UTF_8));
			StringBuilder sb = new StringBuilder();
			for (byte b : d) sb.append(String.format("%02x", b));
			return sb.toString();
		} catch (Exception e) {
			return "unavailable";
		}
	}

	private static String sha256(String path) {
		try {
			byte[] bytes = Files.readAllBytes(new File(path).toPath());
			MessageDigest md = MessageDigest.getInstance("SHA-256");
			byte[] d = md.digest(bytes);
			StringBuilder sb = new StringBuilder();
			for (byte b : d) sb.append(String.format("%02x", b));
			return sb.toString();
		} catch (Exception e) {
			return "unavailable";
		}
	}

	/** Best-effort git HEAD read (no external process). */
	private static String gitCommit() {
		try {
			File head = new File(".git/HEAD");
			if (!head.exists()) head = new File("../.git/HEAD");
			String h = new String(Files.readAllBytes(head.toPath()), StandardCharsets.UTF_8).trim();
			if (h.startsWith("ref:")) {
				String ref = h.substring(4).trim();
				File refFile = new File(head.getParentFile(), ref);
				if (refFile.exists()) {
					return new String(Files.readAllBytes(refFile.toPath()), StandardCharsets.UTF_8).trim();
				}
				return h;
			}
			return h;
		} catch (Exception e) {
			return "unknown";
		}
	}

	private static String csv(String s) { return s == null ? "" : s.replace(",", " "); }
	private static String jsonEsc(String s) { return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\""); }
	private static String jsonVal(Object v) {
		if (v == null) return "null";
		if (v instanceof Number || v instanceof Boolean) return v.toString();
		return "\"" + jsonEsc(v.toString()) + "\"";
	}
}
