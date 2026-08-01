package websim.exporter.closures;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import geography.agents.Shelter;
import geography.routing.StreetNetwork;

import websim.exporter.world.CertifiedGraph;
import websim.exporter.world.Io;

/**
 * TASK WP8 — the <b>closure-wave oracle</b> for the browser-native port.
 *
 * <p>Three parts, one manifest:
 * <ol>
 *   <li>{@link WaveOracle} — the certified {@code ClosureWave.apply()} driven by
 *       a real Repast schedule at the archived SE-E18 ({@code closuresCode=1})
 *       and SE2-E18-d1 ({@code closuresCode=3}, draw 1) configurations, seeds
 *       42–44: the ordered blocked-edge set, the blocked-pair set, the closure
 *       version and the recomputed 36 shelter trees after every wave;</li>
 *   <li>{@link ReactionOracle} — the certified {@code GisAgent.step()} pushed
 *       through {@code reactToClosureWave} on synthetic-but-certified fixtures,
 *       because the archive records ZERO blockage events and therefore cannot
 *       gate that method at all;</li>
 *   <li>{@link ConnectivityOracle} — the five archived connectivity reports
 *       regenerated from the certified graph and diffed field for field.</li>
 * </ol>
 *
 * <p><b>Determinism.</b> No wall clock, no absolute path and no unordered map
 * iteration reaches a dump. The graph is built once and its blocked state is
 * reset between configurations; every reset is <i>verified</i> by re-digesting
 * a pristine shelter tree against the digest taken before any edge was ever
 * blocked, so a leaked blocked edge fails the run instead of quietly poisoning
 * a fixture.
 *
 * <p><b>Privacy.</b> The connectivity part reads the real campsite-report CSV
 * (it must: the archived S3 gate is defined over those 3,400 points) but writes
 * only snapped counts — never a coordinate, never a snapped node id.
 */
public final class ClosureOracle {

	private ClosureOracle() { }

	/** The certified Scenario-E closure configurations this oracle dumps. */
	private static final String[][] CONFIGS = {
		{ "SE-E18", "batch/batch_params_2026_SE_E18_seed" },
		{ "SE2-E18-d1", "batch/batch_params_2026_SE2_E18_d1_seed" },
	};

	private static final int[] SEEDS = { 42, 43, 44 };

	/**
	 * @param args {@code <outDir> [parts] [seeds]} — {@code outDir} is
	 *             {@code websim/pipeline/out/closure-fixtures}; {@code parts} is
	 *             a comma list of {@code waves,reaction,connectivity} (default
	 *             {@code all}); {@code seeds} is a comma list (default 42,43,44).
	 *             {@code -Dwebsim.wp8.fullTrees=true} additionally writes every
	 *             post-wave tree in full (~500 MB) instead of the digest+subset.
	 */
	public static void main(String[] args) throws Exception {
		if (args.length < 1) {
			throw new IllegalArgumentException("usage: ClosureOracle <outDir> [parts] [seeds]");
		}
		File outDir = new File(args[0]);
		if (!outDir.exists() && !outDir.mkdirs()) {
			throw new IOException("cannot create " + outDir);
		}
		String parts = args.length > 1 ? args[1] : "all";
		int[] seeds = args.length > 2 ? parseSeeds(args[2]) : SEEDS;
		boolean fullTrees = Boolean.getBoolean("websim.wp8.fullTrees");
		boolean doWaves = parts.contains("all") || parts.contains("waves");
		boolean doReaction = parts.contains("all") || parts.contains("reaction");
		boolean doConn = parts.contains("all") || parts.contains("connectivity");

		Certified.load();
		Io.Manifest man = new Io.Manifest(outDir);
		long t0 = System.nanoTime();
		CertifiedGraph g = CertifiedGraph.build();
		g.assertProductionCensus(man);
		System.out.printf("[WP8] certified graph ready in %.1f s%n", (System.nanoTime() - t0) / 1e9);

		// The pristine fingerprint every blocked-state reset is checked against.
		String pristine = pristineFingerprint(g);
		man.note("pristine shelter-tree fingerprint (arm A, pre-closure): " + pristine);

		StringBuilder extra = new StringBuilder();
		extra.append(g.inputDigestsJson());
		extra.append("  \"pristineFingerprint\": \"").append(pristine).append("\",\n");
		extra.append("  \"seeds\": ").append(java.util.Arrays.toString(seeds)).append(",\n");
		extra.append("  \"treeRowFormat\": \"<node_id>\\\\t<dist_m_hex>\\\\t<pred_directed_edge>\\\\n, "
				+ "ascending node id, over exactly the nodes in ShortestPathTree.distM; "
				+ "dist_m_hex is %016x of Double.doubleToRawLongBits; pred is featureIndex*2+dir "
				+ "(-1 at the source); UTF-8, LF. The per-tree sha256 in trees.tsv covers that "
				+ "byte stream for the WHOLE array.\",\n");

		if (doWaves) {
			Map<String, List<WaveOracle.Outcome>> byLabel =
					new LinkedHashMap<String, List<WaveOracle.Outcome>>();
			for (String[] cfgSpec : CONFIGS) {
				String label = cfgSpec[0];
				List<WaveOracle.Outcome> outs = new ArrayList<WaveOracle.Outcome>();
				RunConfig first = null;
				for (int i = 0; i < seeds.length; i++) {
					RunConfig cfg = RunConfig.read(label, cfgSpec[1] + seeds[i] + ".xml", seeds[i]);
					if (first == null) {
						first = cfg;
						System.out.println("[WP8] " + label + ": " + WaveOracle.describe(cfg));
					} else {
						man.check("wave." + label + ".seed" + seeds[i] + ".same-wave-inputs",
								WaveOracle.sameWaveInputs(first, cfg),
								"scenario/closure/smoke/run-length parameters identical to seed "
										+ seeds[0]);
					}
					outs.add(WaveOracle.run(g, man, cfg, i == 0, fullTrees));
					checkPristine(g, man, pristine, label + ".seed" + seeds[i]);
				}
				byLabel.put(label, outs);
			}
			// Seed invariance: ClosureWave.apply() draws no RNG (spec §14.1), so
			// every per-wave tree rollup must be identical across seeds 42-44.
			Io.Sink inv = man.sink("waves.seed-invariance", "waves/seed-invariance.tsv");
			inv.line("# per-wave rollup = SHA-256 over the 36 per-shelter tree digests, in "
					+ "shelter-CSV load order. ClosureWave.apply() consumes no RNG, so these must");
			inv.line("# be identical across seeds 42-44 -- that is asserted, not assumed.");
			inv.line("# config\tseed\twave\ttree_rollup_sha256");
			for (Map.Entry<String, List<WaveOracle.Outcome>> e : byLabel.entrySet()) {
				List<WaveOracle.Outcome> outs = e.getValue();
				for (int i = 0; i < outs.size(); i++) {
					for (int w = 0; w < outs.get(i).waveRollups.size(); w++) {
						inv.line(e.getKey() + "\t" + seeds[i] + "\t" + w + "\t"
								+ outs.get(i).waveRollups.get(w));
					}
				}
				for (int i = 1; i < outs.size(); i++) {
					man.check("wave." + e.getKey() + ".seed-invariant." + seeds[i],
							outs.get(i).waveRollups.equals(outs.get(0).waveRollups)
									&& outs.get(i).blockedAtEnd == outs.get(0).blockedAtEnd
									&& outs.get(i).versionAtEnd == outs.get(0).versionAtEnd,
							"seed " + seeds[i] + " reproduces seed " + seeds[0]
									+ "'s waves and trees exactly");
				}
			}
			inv.close();
		}

		if (doConn) {
			ConnectivityOracle.run(g, man, false);
			checkPristine(g, man, pristine, "after-connectivity");
		}

		if (doReaction) {
			ReactionOracle.run(g, man, seeds);
			checkPristine(g, man, pristine, "after-reaction");
		}

		man.write(new File(outDir, "manifest.json"), extra.toString());
		System.out.println("[WP8] dumps -> " + outDir);
		if (man.failures() > 0) {
			throw new IllegalStateException(man.failures() + " WP8 closure-oracle checks FAILED");
		}
	}

	// --------------------------------------------------------------- helpers

	/**
	 * SHA-256 over the arm-A shelter trees on the pristine (never-blocked)
	 * graph. Recomputed after every blocked-state reset; a drift means the reset
	 * did not restore the certified initial state and the whole run is void.
	 */
	private static String pristineFingerprint(CertifiedGraph g) throws Exception {
		Certified.resetBlockedState(g.network);
		List<Shelter> shelters = Certified.loadShelters(g.network, Certified.SHELTERS_A_CSV);
		List<String> digests = new ArrayList<String>();
		for (Shelter s : shelters) {
			StreetNetwork.ShortestPathTree tree = s.getRouteTree();
			digests.add(TreeCodec.digest(tree, g, null, null, "").sha256);
		}
		return TreeCodec.rollup(digests);
	}

	private static void checkPristine(CertifiedGraph g, Io.Manifest man, String expected, String tag)
			throws Exception {
		String actual = pristineFingerprint(g);
		man.check("reset.pristine." + tag, expected.equals(actual),
				"pre-closure shelter-tree fingerprint restored (" + actual.substring(0, 16) + "…)");
		if (!expected.equals(actual)) {
			throw new IllegalStateException("blocked-state reset did not restore the pristine graph");
		}
	}

	private static int[] parseSeeds(String s) {
		String[] parts = s.trim().split("[,\\s]+");
		int[] out = new int[parts.length];
		for (int i = 0; i < parts.length; i++) {
			out[i] = Integer.parseInt(parts[i].trim());
		}
		return out;
	}
}
