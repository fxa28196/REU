package websim.exporter.closures;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

import geography.routing.StreetNetwork;

import websim.exporter.world.CertifiedGraph;
import websim.exporter.world.Io;

/**
 * WP8 part 3 — regeneration of the five ARCHIVED connectivity reports
 * ({@code docs/runs/scenario-e-closures/*.json}) from the certified Java, so
 * the TypeScript port has a target for plan gate (k) / spec §17.3.
 *
 * <p><b>What comes from the certified model.</b> The graph itself — features,
 * node ids (including the synthetic negatives), the corrupt-node correction,
 * component-forming adjacency, {@code streetEdgeCount()}, the freeway-filter
 * census and {@code nearestNode()} for all 46 shelters and all 3,400 encampment
 * points. Nothing in that list is recomputed here; it is read out of
 * {@link StreetNetwork} and {@link CertifiedGraph}.
 *
 * <p><b>What is necessarily written here, and why that is not a model
 * re-implementation.</b> The certified model never computes connected
 * components of the <i>blocked</i> graph — that analysis lives only in
 * {@code scripts/build_closures_E.py}, the schedule <i>certifier</i>. So the
 * S1/S2/S3 traversal is transcribed from that script (lines 459-476 and
 * 611-670) rather than from any {@code geography.*} class, and every number it
 * produces is asserted against the archived JSON. A transcription that were
 * wrong could not agree with the archive on 12 fields × 16 wave states.
 *
 * <p><b>Two blocked-set vocabularies.</b> The certifier keys its cut on
 * {@code pair_key = (min(attr_f, attr_t), max(attr_f, attr_t))} — RLIS
 * <i>attribute</i> ids — while {@code ClosureWave.apply()} keys the model's
 * blocked set on GRAPH node ids. This class regenerates with the certifier's
 * rule (that is what produced the archived numbers) and separately PROVES the
 * two coincide on the committed schedules: for every closed pair, exactly one
 * feature carries that attribute pair AND exactly one feature joins those two
 * graph nodes. That is archived check 2 ("0 ambiguous") re-derived, and it is
 * what makes the model's pair-keyed blocked set unambiguous here.
 */
final class ConnectivityOracle {

	private ConnectivityOracle() { }

	/** The five committed schedules and their archived reports. */
	static final String[][] REPORTS = {
		{ "closures_E_r1", "data/closures/closures_E_r1.csv",
			"docs/runs/scenario-e-closures/closures_E_r1_report.json" },
		{ "closures_E_r1_extreme", "data/closures/closures_E_r1_extreme.csv",
			"docs/runs/scenario-e-closures/closures_E_r1_extreme_report.json" },
		{ "closures_E_r1_worst", "data/closures/closures_E_r1_worst.csv",
			"docs/runs/scenario-e-closures/closures_E_r1_worst_report.json" },
		{ "closures_E_r2_worst", "data/closures/closures_E_r2_worst.csv",
			"docs/runs/scenario-e-closures/closures_E_r2_worst_report.json" },
		{ "closures_E_r3_worst", "data/closures/closures_E_r3_worst.csv",
			"docs/runs/scenario-e-closures/closures_E_r3_worst_report.json" },
	};

	// ------------------------------------------------------------ components

	/** Transcription of {@code build_closures_E.py:459-476}. */
	private static final class Comps {
		final int[] cid;
		final int[] size;

		Comps(int[] cid, int[] size) {
			this.cid = cid;
			this.size = size;
		}

		int count() {
			return size.length;
		}
	}

	private static Comps componentMap(Certified.Features f, boolean[] cutFeature) {
		int n = f.nodeDiscoveryOrder.length;
		int[] cid = new int[n];
		Arrays.fill(cid, -1);
		List<Integer> sizes = new ArrayList<Integer>();
		int[] stack = new int[n];
		for (int start = 0; start < n; start++) {
			if (cid[start] >= 0) {
				continue;
			}
			int idx = sizes.size();
			cid[start] = idx;
			int sp = 0;
			stack[sp++] = start;
			int size = 0;
			while (sp > 0) {
				int node = stack[--sp];
				size++;
				long nodeId = f.nodeDiscoveryOrder[node];
				for (int fi : f.incidentFeatures[node]) {
					if (cutFeature[fi]) {
						continue;
					}
					long other = f.graphFrom[fi] == nodeId ? f.graphTo[fi] : f.graphFrom[fi];
					int slot = f.nodeSlot.get(Long.valueOf(other)).intValue();
					if (cid[slot] >= 0) {
						continue;
					}
					cid[slot] = idx;
					stack[sp++] = slot;
				}
			}
			sizes.add(Integer.valueOf(size));
		}
		int[] sz = new int[sizes.size()];
		for (int i = 0; i < sz.length; i++) {
			sz[i] = sizes.get(i).intValue();
		}
		return new Comps(cid, sz);
	}

	// ------------------------------------------------------------------ run

	static void run(CertifiedGraph g, Io.Manifest man, boolean strict) throws Exception {
		Certified.resetBlockedState(g.network);
		Certified.Features f = Certified.Features.read(g.network);
		int nNodes = f.nodeDiscoveryOrder.length;

		// attribute pair key -> feature indices; graph pair key -> feature indices
		Map<String, List<Integer>> byAttrPair = new HashMap<String, List<Integer>>(f.count * 2);
		Map<String, List<Integer>> byGraphPair = new HashMap<String, List<Integer>>(f.count * 2);
		for (int i = 0; i < f.count; i++) {
			listFor(byAttrPair, key(f.attrFrom[i], f.attrTo[i])).add(Integer.valueOf(i));
			listFor(byGraphPair, key(f.graphFrom[i], f.graphTo[i])).add(Integer.valueOf(i));
		}

		Comps pre = componentMap(f, new boolean[f.count]);
		int[] preSizesDesc = pre.size.clone();
		Arrays.sort(preSizesDesc);
		reverse(preSizesDesc);

		// certified snapping, once for all five reports
		long[] shelterNodes = Certified.snapCsv(g.network, Certified.SHELTERS_C_CSV);
		List<String> shelterIds = Certified.shelterIds(Certified.SHELTERS_C_CSV);
		long[] campNodes = Certified.snapCsv(g.network, Certified.ENCAMPMENTS_CSV);
		System.out.println("[WP8] connectivity: " + shelterNodes.length + " shelters ("
				+ Certified.SHELTERS_C_CSV + "), " + campNodes.length + " encampment points, "
				+ nNodes + " graph nodes, " + pre.count() + " pre-closure components");

		Io.Sink cmp = man.sink("connectivity.compare", "connectivity/compare.tsv");
		cmp.line("# WP8 connectivity-report regeneration vs the ARCHIVED "
				+ "docs/runs/scenario-e-closures/*.json");
		cmp.line("# graph, node ids and snapping come from the certified StreetNetwork; the "
				+ "component traversal is transcribed from scripts/build_closures_E.py "
				+ "(the certifier), which the model itself does not contain.");
		cmp.line("# report\tsection\twave\tfield\tarchived\tregenerated\tmatch");

		int mismatches = 0;
		int compared = 0;
		for (String[] spec : REPORTS) {
			String name = spec[0];
			File archiveFile = new File("../" + spec[2]);
			if (!archiveFile.isFile()) {
				throw new IllegalStateException("archived report not found: "
						+ archiveFile.getAbsolutePath());
			}
			Map<String, Object> archived = Json.obj(Json.readFile(archiveFile));
			List<Certified.Row> rows = readRows(g.network, spec[1]);

			// ---- graph census block ------------------------------------------
			Map<String, Object> ag = Json.obj(archived.get("graph"));
			compared += 8;
			mismatches += cmpLong(cmp, name, "graph", -1, "walkable_features",
					Json.asLong(ag.get("walkable_features")), f.count);
			mismatches += cmpLong(cmp, name, "graph", -1, "nodes",
					Json.asLong(ag.get("nodes")), nNodes);
			mismatches += cmpLong(cmp, name, "graph", -1, "undirected_edges",
					Json.asLong(ag.get("undirected_edges")), g.network.streetEdgeCount());
			mismatches += cmpLong(cmp, name, "graph", -1, "corrected_node_sites",
					Json.asLong(ag.get("corrected_node_sites")), g.report.affectedAttrIds);
			mismatches += cmpLong(cmp, name, "graph", -1, "components",
					Json.asLong(ag.get("components")), pre.count());
			mismatches += cmpLong(cmp, name, "graph", -1, "freeway_features_excluded",
					Json.asLong(ag.get("freeway_features_excluded")), g.report.freewayFeaturesExcluded);
			mismatches += cmpStr(cmp, name, "graph", -1, "freeway_km_excluded",
					((Json.Num) ag.get("freeway_km_excluded")).literal,
					trim1(g.report.freewayKmExcluded));
			StringBuilder top5a = new StringBuilder();
			for (Object o : Json.arr(ag.get("component_sizes_top5"))) {
				top5a.append(top5a.length() == 0 ? "" : ",").append(Json.asLong(o));
			}
			StringBuilder top5b = new StringBuilder();
			for (int i = 0; i < 5 && i < preSizesDesc.length; i++) {
				top5b.append(i == 0 ? "" : ",").append(preSizesDesc[i]);
			}
			mismatches += cmpStr(cmp, name, "graph", -1, "component_sizes_top5",
					top5a.toString(), top5b.toString());

			// ---- the pair-vocabulary proof ------------------------------------
			int ambiguousAttr = 0;
			int ambiguousGraph = 0;
			int vocabDisagreements = 0;
			for (Certified.Row r : rows) {
				List<Integer> a = byAttrPair.get(key(r.nodeA, r.nodeB));
				List<Integer> b = byGraphPair.get(key(r.nodeA, r.nodeB));
				if (a == null || a.size() != 1) {
					ambiguousAttr++;
				}
				if (b == null || b.size() != 1) {
					ambiguousGraph++;
				}
				if (a == null || b == null || !new HashSet<Integer>(a).equals(new HashSet<Integer>(b))) {
					vocabDisagreements++;
				}
			}
			man.check("connectivity." + name + ".one-feature-per-closed-pair",
					ambiguousAttr == 0 && ambiguousGraph == 0,
					ambiguousAttr + " ambiguous by attribute pair, " + ambiguousGraph
							+ " by graph pair (archived check 2 says 0)");
			man.check("connectivity." + name + ".attr-vs-graph-pair-vocabulary",
					vocabDisagreements == 0,
					vocabDisagreements + " closed pairs where the certifier's attribute-pair cut "
							+ "and the model's graph-pair cut select different features");

			// ---- connectivity_check[] -----------------------------------------
			List<Object> aChecks = Json.arr(archived.get("connectivity_check"));
			List<Integer> hours = ascendingHours(rows);
			List<Map<String, Object>> regen = new ArrayList<Map<String, Object>>();

			Map<Integer, Integer> preShelterByComp = new HashMap<Integer, Integer>();
			for (long node : shelterNodes) {
				int c = pre.cid[slot(f, node)];
				preShelterByComp.merge(Integer.valueOf(c), Integer.valueOf(1), Integer::sum);
			}

			for (int w = 0; w < hours.size(); w++) {
				int hour = hours.get(w).intValue();
				Set<String> blocked = new HashSet<String>();
				for (Certified.Row r : rows) {
					if (r.hour <= hour) {
						blocked.add(key(r.nodeA, r.nodeB));
					}
				}
				boolean[] cut = new boolean[f.count];
				for (String bk : blocked) {
					List<Integer> fs = byAttrPair.get(bk);
					if (fs != null) {
						for (Integer fi : fs) {
							cut[fi.intValue()] = true;
						}
					}
				}
				Comps post = componentMap(f, cut);

				// main fragment of each pre-closure component (py:628-634)
				Map<Integer, Map<Integer, Integer>> frag =
						new TreeMap<Integer, Map<Integer, Integer>>();
				for (int s = 0; s < nNodes; s++) {
					frag.computeIfAbsent(Integer.valueOf(pre.cid[s]),
							k -> new TreeMap<Integer, Integer>())
						.merge(Integer.valueOf(post.cid[s]), Integer.valueOf(1), Integer::sum);
				}
				Map<Integer, Integer> mainFrag = new HashMap<Integer, Integer>();
				long lostNodes = 0;
				int splitComps = 0;
				for (Map.Entry<Integer, Map<Integer, Integer>> e : frag.entrySet()) {
					int best = -1;
					int bestCount = -1;
					for (Map.Entry<Integer, Integer> q : e.getValue().entrySet()) {
						int cnt = q.getValue().intValue();
						if (cnt > bestCount) {
							bestCount = cnt;
							best = q.getKey().intValue();
						}
					}
					mainFrag.put(e.getKey(), Integer.valueOf(best));
					lostNodes += pre.size[e.getKey().intValue()] - bestCount;
					if (e.getValue().size() > 1) {
						splitComps++;
					}
				}

				List<String> stranded = new ArrayList<String>();
				List<String> severed = new ArrayList<String>();
				for (int i = 0; i < shelterNodes.length; i++) {
					int s = slot(f, shelterNodes[i]);
					boolean anyOpen = false;
					for (int fi : f.incidentFeatures[s]) {
						if (!cut[fi]) {
							anyOpen = true;
							break;
						}
					}
					if (!anyOpen) {
						stranded.add(shelterIds.get(i));
					}
					if (post.cid[s] != mainFrag.get(Integer.valueOf(pre.cid[s])).intValue()) {
						severed.add(shelterIds.get(i));
					}
				}
				java.util.Collections.sort(stranded);
				java.util.Collections.sort(severed);

				Map<Integer, Integer> postShelterByComp = new HashMap<Integer, Integer>();
				for (long node : shelterNodes) {
					int c = post.cid[slot(f, node)];
					postShelterByComp.merge(Integer.valueOf(c), Integer.valueOf(1), Integer::sum);
				}
				long campsLostAll = 0;
				long campsLostSome = 0;
				long pairsLost = 0;
				for (long node : campNodes) {
					int s = slot(f, node);
					int before = preShelterByComp.getOrDefault(Integer.valueOf(pre.cid[s]),
							Integer.valueOf(0)).intValue();
					int after = postShelterByComp.getOrDefault(Integer.valueOf(post.cid[s]),
							Integer.valueOf(0)).intValue();
					pairsLost += before - after;
					if (after < before) {
						campsLostSome++;
					}
					if (before > 0 && after == 0) {
						campsLostAll++;
					}
				}

				Map<String, Object> me = new LinkedHashMap<String, Object>();
				me.put("wave", Long.valueOf(w + 1));
				me.put("hour", Long.valueOf(hour));
				me.put("edges_blocked", Long.valueOf(blocked.size()));
				me.put("shelters_with_no_unblocked_incident_edge", stranded);
				me.put("shelters_severed_from_their_component", severed);
				me.put("components_before", Long.valueOf(pre.count()));
				me.put("components_after", Long.valueOf(post.count()));
				me.put("components_split_by_the_closures", Long.valueOf(splitComps));
				me.put("nodes_losing_reachability", Long.valueOf(lostNodes));
				me.put("graph_nodes_total", Long.valueOf(nNodes));
				me.put("encampment_points_total", Long.valueOf(campNodes.length));
				me.put("encampment_points_losing_some_shelter_access", Long.valueOf(campsLostSome));
				me.put("encampment_points_losing_all_shelter_access", Long.valueOf(campsLostAll));
				me.put("encampment_shelter_pairs_lost", Long.valueOf(pairsLost));
				regen.add(me);

				if (w >= aChecks.size()) {
					cmp.line(name + "\tconnectivity_check\t" + (w + 1)
							+ "\t<wave>\t<absent>\tpresent\t0");
					mismatches++;
					compared++;
					continue;
				}
				Map<String, Object> aw = Json.obj(aChecks.get(w));
				for (Map.Entry<String, Object> e : me.entrySet()) {
					compared++;
					String field = e.getKey();
					String mine = render(e.getValue());
					String theirs = render(aw.get(field));
					boolean ok = mine.equals(theirs);
					if (!ok) {
						mismatches++;
					}
					cmp.line(name + "\tconnectivity_check\t" + (w + 1) + "\t" + field + "\t"
							+ theirs + "\t" + mine + "\t" + (ok ? 1 : 0));
				}
			}

			// ---- the per-wave S1/S2/S3 checks[] details -----------------------
			Map<String, String> archivedChecks = new LinkedHashMap<String, String>();
			for (Object o : Json.arr(archived.get("checks"))) {
				Map<String, Object> c = Json.obj(o);
				archivedChecks.put((String) c.get("name"), (String) c.get("detail"));
			}
			for (int w = 0; w < regen.size(); w++) {
				Map<String, Object> me = regen.get(w);
				int hour = (int) ((Long) me.get("hour")).longValue();
				String[][] want = {
					{ "S1 wave " + (w + 1) + " (hour " + hour
						+ "): every shelter keeps an unblocked incident edge",
						size(me.get("shelters_with_no_unblocked_incident_edge")) + " of "
							+ shelterNodes.length + " stranded" },
					{ "S2 wave " + (w + 1) + " (hour " + hour
						+ "): every shelter stays in the largest post-closure fragment of "
						+ "its own pre-closure component",
						size(me.get("shelters_severed_from_their_component")) + " of "
							+ shelterNodes.length + " severed" },
					{ "S3 wave " + (w + 1) + " (hour " + hour
						+ "): no encampment demand point loses ALL shelter access",
						me.get("encampment_points_losing_all_shelter_access") + " of "
							+ campNodes.length + " walled off" },
				};
				for (String[] pair : want) {
					compared++;
					String theirs = archivedChecks.get(pair[0]);
					boolean ok = pair[1].equals(theirs);
					if (!ok) {
						mismatches++;
					}
					cmp.line(name + "\tchecks\t" + (w + 1) + "\t" + pair[0].substring(0, 2)
							+ " detail\t" + (theirs == null ? "<no such check>" : theirs)
							+ "\t" + pair[1] + "\t" + (ok ? 1 : 0));
				}
			}

			// ---- "no duplicate closed edge" (archived check 5) ----------------
			Set<String> distinct = new TreeSet<String>();
			for (Certified.Row r : rows) {
				distinct.add(key(r.nodeA, r.nodeB));
			}
			compared++;
			String dupTheirs = archivedChecks.get("no duplicate closed edge");
			String dupMine = rows.size() + " rows, " + distinct.size() + " distinct pairs";
			boolean dupOk = dupMine.equals(dupTheirs);
			if (!dupOk) {
				mismatches++;
			}
			cmp.line(name + "\tchecks\t-1\tno duplicate closed edge\t"
					+ (dupTheirs == null ? "<no such check>" : dupTheirs) + "\t" + dupMine
					+ "\t" + (dupOk ? 1 : 0));

			writeRegen(man, name, archived, f, nNodes, g, pre, preSizesDesc, regen, rows);
		}
		cmp.close();

		man.check("connectivity.field-for-field", mismatches == 0,
				mismatches + " mismatching fields of " + compared + " compared against the "
						+ REPORTS.length + " archived reports");
		if (strict && mismatches > 0) {
			throw new IllegalStateException("connectivity regeneration mismatched the archive");
		}
	}

	// -------------------------------------------------------------- emitters

	private static void writeRegen(Io.Manifest man, String name, Map<String, Object> archived,
			Certified.Features f, int nNodes, CertifiedGraph g, Comps pre, int[] top5,
			List<Map<String, Object>> regen, List<Certified.Row> rows) throws Exception {
		Io.Sink s = man.sink("connectivity." + name, "connectivity/" + name + ".regen.json");
		s.line("{");
		s.line("  \"regenerated_from\": \"the certified geography.routing.StreetNetwork, by "
				+ "websim.exporter.closures.ConnectivityOracle\",");
		s.line("  \"archived_schema\": \"" + Io.esc((String) archived.get("schema")) + "\",");
		s.line("  \"archived_generator\": \"" + Io.esc((String) archived.get("generator")) + "\",");
		s.line("  \"status\": \"" + Io.esc((String) archived.get("status")) + "\",");
		s.line("  \"output_csv\": \"" + Io.esc((String) archived.get("output_csv")) + "\",");
		s.line("  \"graph\": {\"walkable_features\": " + f.count + ", \"nodes\": " + nNodes
				+ ", \"undirected_edges\": " + g.network.streetEdgeCount()
				+ ", \"corrected_node_sites\": " + g.report.affectedAttrIds
				+ ", \"components\": " + pre.count()
				+ ", \"freeway_features_excluded\": " + g.report.freewayFeaturesExcluded
				+ ", \"freeway_km_excluded\": " + trim1(g.report.freewayKmExcluded)
				+ ", \"component_sizes_top5\": [" + top5[0] + ", " + top5[1] + ", " + top5[2]
				+ ", " + top5[3] + ", " + top5[4] + "]},");
		s.line("  \"closures_rows\": " + rows.size() + ",");
		s.line("  \"connectivity_check\": [");
		for (int i = 0; i < regen.size(); i++) {
			Map<String, Object> m = regen.get(i);
			StringBuilder sb = new StringBuilder("    {");
			boolean first = true;
			for (Map.Entry<String, Object> e : m.entrySet()) {
				if (!first) {
					sb.append(", ");
				}
				first = false;
				sb.append('"').append(e.getKey()).append("\": ").append(render(e.getValue()));
			}
			sb.append('}').append(i == regen.size() - 1 ? "" : ",");
			s.line(sb.toString());
		}
		s.line("  ]");
		s.line("}");
		s.close();
	}

	// --------------------------------------------------------------- helpers

	private static List<Certified.Row> readRows(StreetNetwork network, String csvPath) {
		Certified.Schedule sched = Certified.loadClosureSchedule(network, csvPath, Integer.MAX_VALUE);
		return sched.rowsInFileOrder;
	}

	private static List<Integer> ascendingHours(List<Certified.Row> rows) {
		TreeSet<Integer> t = new TreeSet<Integer>();
		for (Certified.Row r : rows) {
			t.add(Integer.valueOf(r.hour));
		}
		return new ArrayList<Integer>(t);
	}

	private static int slot(Certified.Features f, long node) {
		Integer s = f.nodeSlot.get(Long.valueOf(node));
		if (s == null) {
			throw new IllegalStateException("node " + node + " is not a graph node");
		}
		return s.intValue();
	}

	private static String key(long a, long b) {
		return a <= b ? a + ":" + b : b + ":" + a;
	}

	private static List<Integer> listFor(Map<String, List<Integer>> m, String k) {
		List<Integer> l = m.get(k);
		if (l == null) {
			l = new ArrayList<Integer>(2);
			m.put(k, l);
		}
		return l;
	}

	private static void reverse(int[] a) {
		for (int i = 0, j = a.length - 1; i < j; i++, j--) {
			int t = a[i];
			a[i] = a[j];
			a[j] = t;
		}
	}

	/** Python's {@code round(x, 1)} rendering, e.g. {@code 614.1}. */
	private static String trim1(double v) {
		String s = String.format(Locale.ROOT, "%.1f", v);
		return s;
	}

	@SuppressWarnings("unchecked")
	private static int size(Object o) {
		return ((List<Object>) o).size();
	}

	/** Canonical text for a comparison cell: JSON-ish, order-preserving. */
	@SuppressWarnings("unchecked")
	private static String render(Object v) {
		if (v == null) {
			return "<absent>";
		}
		if (v instanceof Json.Num) {
			return ((Json.Num) v).literal;
		}
		if (v instanceof Long || v instanceof Integer) {
			return v.toString();
		}
		if (v instanceof List) {
			StringBuilder sb = new StringBuilder("[");
			List<Object> l = (List<Object>) v;
			for (int i = 0; i < l.size(); i++) {
				if (i > 0) {
					sb.append(", ");
				}
				Object o = l.get(i);
				sb.append(o instanceof String ? "\"" + o + "\"" : render(o));
			}
			return sb.append(']').toString();
		}
		if (v instanceof String) {
			return "\"" + v + "\"";
		}
		return v.toString();
	}

	private static int cmpLong(Io.Sink cmp, String report, String section, int wave, String field,
			long archived, long mine) {
		boolean ok = archived == mine;
		cmp.line(report + "\t" + section + "\t" + wave + "\t" + field + "\t" + archived + "\t"
				+ mine + "\t" + (ok ? 1 : 0));
		return ok ? 0 : 1;
	}

	private static int cmpStr(Io.Sink cmp, String report, String section, int wave, String field,
			String archived, String mine) {
		boolean ok = archived.equals(mine);
		cmp.line(report + "\t" + section + "\t" + wave + "\t" + field + "\t" + archived + "\t"
				+ mine + "\t" + (ok ? 1 : 0));
		return ok ? 0 : 1;
	}
}
