package geography.science;

import java.io.File;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import geography.data.CsvLoader;

/**
 * Scientific governance layer: the machine-readable variable and assumption
 * registries (schema in {@code docs/science/REGISTRY_SCHEMA.md}).
 *
 * <p>Both registries are loaded and <b>validated fail-fast</b> at model startup
 * and written into {@code simulation.json} under {@code governance}. The
 * validation rules mechanise the project's founding rule — <i>no invented
 * values</i> — so a literature-class variable without a resolvable source, or an
 * assumption-class entry with no sensitivity plan, cannot silently reach
 * results. A run whose registries fail validation produces no output at all.
 *
 * <p>This class performs <b>no random draws and no model mutation</b>: it is
 * pure I/O plus validation, deliberately free of any Repast dependency so it can
 * be unit-tested without a simulation context.
 *
 * <p>Registry files are intentionally <b>not</b> part of the input-dataset
 * checksum list that feeds {@code data_version_tag}: they are governance
 * metadata rather than model inputs, and appending them would change the tag —
 * breaking comparability with the archived baseline — without changing anything
 * the model reads. Their checksums are reported separately instead.
 */
public final class ScienceRegistry {

	private static final Set<String> EVIDENCE_CLASSES =
			new HashSet<String>(Arrays.asList("M", "L", "C", "A", "F"));
	private static final Set<String> VARIABLE_STATUSES =
			new HashSet<String>(Arrays.asList("implemented", "specified", "placeholder", "deprecated"));
	private static final Set<String> ASSUMPTION_CLASSES =
			new HashSet<String>(Arrays.asList("measured", "literature", "calibrated", "assumption", "future_work"));
	private static final Set<String> ASSUMPTION_STATUSES =
			new HashSet<String>(Arrays.asList("active", "retired", "blocking"));

	private static final String[] VARIABLE_COLUMNS = {
		"variable_id", "name", "description", "mechanism", "math", "units",
		"evidence_class", "source", "doi_or_dataset", "uncertainty",
		"affects_movement", "affects_exposure", "affects_shelter_access",
		"affects_reporting", "status", "implementation" };

	private static final String[] ASSUMPTION_COLUMNS = {
		"assumption_id", "statement", "classification", "rationale", "affects",
		"sensitivity_plan", "status", "source_or_doc" };

	private static final String[] AFFECTS_COLUMNS = {
		"affects_movement", "affects_exposure", "affects_shelter_access", "affects_reporting" };

	/** One registered scientific variable. */
	public static final class Variable {
		public final String id;
		public final String name;
		public final String evidenceClass;
		public final String status;
		public final String doiOrDataset;
		public final String uncertainty;

		Variable(String id, String name, String evidenceClass, String status,
				String doiOrDataset, String uncertainty) {
			this.id = id;
			this.name = name;
			this.evidenceClass = evidenceClass;
			this.status = status;
			this.doiOrDataset = doiOrDataset;
			this.uncertainty = uncertainty;
		}
	}

	/** One registered modelling assumption. */
	public static final class Assumption {
		public final String id;
		public final String statement;
		public final String classification;
		public final String status;

		Assumption(String id, String statement, String classification, String status) {
			this.id = id;
			this.statement = statement;
			this.classification = classification;
			this.status = status;
		}
	}

	private final String variablesPath;
	private final String assumptionsPath;
	private final String variablesSha256;
	private final String assumptionsSha256;
	private final List<Variable> variables;
	private final List<Assumption> assumptions;

	private ScienceRegistry(String variablesPath, String assumptionsPath,
			List<Variable> variables, List<Assumption> assumptions) {
		this.variablesPath = variablesPath;
		this.assumptionsPath = assumptionsPath;
		this.variables = Collections.unmodifiableList(variables);
		this.assumptions = Collections.unmodifiableList(assumptions);
		this.variablesSha256 = sha256(variablesPath);
		this.assumptionsSha256 = sha256(assumptionsPath);
	}

	/**
	 * Loads and validates both registries.
	 *
	 * @throws IllegalStateException if either registry violates the schema; the
	 *         message names the offending row and the rule, so the fix is obvious
	 */
	public static ScienceRegistry load(String variablesPath, String assumptionsPath) {
		List<Variable> vars = readVariables(variablesPath);
		List<Assumption> assumps = readAssumptions(assumptionsPath);
		return new ScienceRegistry(variablesPath, assumptionsPath, vars, assumps);
	}

	private static List<Variable> readVariables(String path) {
		List<Map<String, String>> rows = CsvLoader.readStrict(path);
		if (rows.isEmpty()) {
			throw new IllegalStateException("Variable registry is empty: " + path);
		}
		requireColumns(path, rows.get(0), VARIABLE_COLUMNS);

		List<Variable> out = new ArrayList<Variable>();
		Set<String> seen = new HashSet<String>();
		for (Map<String, String> r : rows) {
			String id = value(r, "variable_id");
			if (id.isEmpty()) {
				throw new IllegalStateException(path + ": a row has an empty variable_id");
			}
			if (!seen.add(id)) {
				throw new IllegalStateException(path + ": duplicate variable_id '" + id + "'");
			}

			String cls = value(r, "evidence_class");
			if (!EVIDENCE_CLASSES.contains(cls)) {
				throw new IllegalStateException(path + " [" + id + "]: evidence_class '" + cls
						+ "' is not one of M, L, C, A, F");
			}
			String status = value(r, "status");
			if (!VARIABLE_STATUSES.contains(status)) {
				throw new IllegalStateException(path + " [" + id + "]: status '" + status
						+ "' is not one of implemented, specified, placeholder, deprecated");
			}

			// Rule 3: affects_* are yes/no and at least one must be yes — a variable
			// that affects nothing does not belong in the registry.
			boolean anyAffect = false;
			for (String col : AFFECTS_COLUMNS) {
				String v = value(r, col);
				if (!v.equals("yes") && !v.equals("no")) {
					throw new IllegalStateException(path + " [" + id + "]: " + col
							+ " must be yes or no, got '" + v + "'");
				}
				anyAffect |= v.equals("yes");
			}
			if (!anyAffect && !"deprecated".equals(status)) {
				throw new IllegalStateException(path + " [" + id
						+ "]: every affects_* flag is 'no'; a variable that affects nothing"
						+ " must be marked deprecated or removed");
			}

			// Rules 4 and 5 mechanise "no invented values": a measured or literature
			// value must name a resolvable source, and a literature or calibrated
			// value must state a range that can actually be swept.
			String doi = value(r, "doi_or_dataset");
			String uncertainty = value(r, "uncertainty");
			if (("L".equals(cls) || "M".equals(cls)) && (doi.isEmpty() || "none".equals(doi))) {
				throw new IllegalStateException(path + " [" + id + "]: evidence_class " + cls
						+ " requires a DOI or dataset id in doi_or_dataset");
			}
			if (("L".equals(cls) || "C".equals(cls)) && (uncertainty.isEmpty() || "none".equals(uncertainty))) {
				throw new IllegalStateException(path + " [" + id + "]: evidence_class " + cls
						+ " requires a non-'none' uncertainty range so it can be sensitivity-tested");
			}

			out.add(new Variable(id, value(r, "name"), cls, status, doi, uncertainty));
		}
		return out;
	}

	private static List<Assumption> readAssumptions(String path) {
		List<Map<String, String>> rows = CsvLoader.readStrict(path);
		if (rows.isEmpty()) {
			throw new IllegalStateException("Assumption registry is empty: " + path);
		}
		requireColumns(path, rows.get(0), ASSUMPTION_COLUMNS);

		List<Assumption> out = new ArrayList<Assumption>();
		Set<String> seen = new HashSet<String>();
		for (Map<String, String> r : rows) {
			String id = value(r, "assumption_id");
			if (id.isEmpty()) {
				throw new IllegalStateException(path + ": a row has an empty assumption_id");
			}
			if (!seen.add(id)) {
				throw new IllegalStateException(path + ": duplicate assumption_id '" + id + "'");
			}
			String cls = value(r, "classification");
			if (!ASSUMPTION_CLASSES.contains(cls)) {
				throw new IllegalStateException(path + " [" + id + "]: classification '" + cls
						+ "' is not one of measured, literature, calibrated, assumption, future_work");
			}
			String status = value(r, "status");
			if (!ASSUMPTION_STATUSES.contains(status)) {
				throw new IllegalStateException(path + " [" + id + "]: status '" + status
						+ "' is not one of active, retired, blocking");
			}
			// An untested modelling choice may not be silent.
			if ("assumption".equals(cls) && value(r, "sensitivity_plan").isEmpty()) {
				throw new IllegalStateException(path + " [" + id
						+ "]: classification 'assumption' requires a sensitivity_plan");
			}
			out.add(new Assumption(id, value(r, "statement"), cls, status));
		}
		return out;
	}

	private static void requireColumns(String path, Map<String, String> firstRow, String[] required) {
		for (String col : required) {
			if (!firstRow.containsKey(col)) {
				throw new IllegalStateException(path + ": missing required column '" + col + "'");
			}
		}
	}

	private static String value(Map<String, String> row, String key) {
		String v = row.get(key);
		return v == null ? "" : v.trim();
	}

	// --- accessors used by the manifest writer -------------------------------

	public String getVariablesPath() { return variablesPath; }
	public String getAssumptionsPath() { return assumptionsPath; }
	public String getVariablesSha256() { return variablesSha256; }
	public String getAssumptionsSha256() { return assumptionsSha256; }
	public List<Variable> getVariables() { return variables; }
	public List<Assumption> getAssumptions() { return assumptions; }
	public int variableCount() { return variables.size(); }
	public int assumptionCount() { return assumptions.size(); }

	/** Variables per evidence class, in the fixed order M, L, C, A, F. */
	public Map<String, Integer> evidenceClassCensus() {
		Map<String, Integer> census = new LinkedHashMap<String, Integer>();
		for (String c : new String[] { "M", "L", "C", "A", "F" }) {
			census.put(c, Integer.valueOf(0));
		}
		for (Variable v : variables) {
			census.put(v.evidenceClass, Integer.valueOf(census.get(v.evidenceClass).intValue() + 1));
		}
		return census;
	}

	/**
	 * Variables that are present but inert. A run whose results depend on one of
	 * these is not a finished result, which is why they are named in the manifest
	 * rather than merely counted.
	 */
	public List<String> placeholderVariableIds() {
		List<String> out = new ArrayList<String>();
		for (Variable v : variables) {
			if ("placeholder".equals(v.status)) {
				out.add(v.id);
			}
		}
		return out;
	}

	/** Assumptions that must be resolved before publication. */
	public List<String> blockingAssumptionIds() {
		List<String> out = new ArrayList<String>();
		for (Assumption a : assumptions) {
			if ("blocking".equals(a.status)) {
				out.add(a.id);
			}
		}
		return out;
	}

	/** One-line startup summary for the run log. */
	public String summaryLine() {
		return String.format(
				"[ScienceRegistry] %d variables %s, %d assumptions; %d placeholder variable(s), %d blocking assumption(s)",
				Integer.valueOf(variableCount()), evidenceClassCensus(),
				Integer.valueOf(assumptionCount()),
				Integer.valueOf(placeholderVariableIds().size()),
				Integer.valueOf(blockingAssumptionIds().size()));
	}

	private static String sha256(String path) {
		try {
			byte[] bytes = Files.readAllBytes(new File(path).toPath());
			MessageDigest md = MessageDigest.getInstance("SHA-256");
			byte[] d = md.digest(bytes);
			StringBuilder sb = new StringBuilder();
			for (byte b : d) {
				sb.append(String.format("%02x", b));
			}
			return sb.toString();
		} catch (Exception e) {
			// A registry whose checksum cannot be computed has no provenance, and a
			// fake tag is worse than none: fail rather than stamp "unavailable".
			throw new IllegalStateException("Cannot checksum registry file: " + path, e);
		}
	}
}
