package websim.exporter.closures;

import java.io.File;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;

import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * The certified Scenario-E run configurations, read from the ARCHIVED batch
 * parameter files rather than retyped.
 *
 * <p>{@code Geography/batch/batch_params_2026_SE_E18_seed4X.xml} and
 * {@code ..._SE2_E18_d1_seed4X.xml} are read-only inputs; every value this
 * oracle uses (scenarioCode, closuresCode, closureDraw, simulationHours,
 * minutesPerTick, the four V49–V51 coefficients) comes from them, so a config
 * drift shows up as a dump difference instead of a stale constant in this file.
 *
 * <p><b>QUIRK 26 note.</b> Repast's batch parser zeroes NEGATIVE constants
 * declared {@code constant_type="number"}; both SE families were re-emitted at
 * {@code de7c045} with {@code constant_type="double"} for
 * {@code pushThetaThreshold=-0.25} and {@code alphaHazard=-8.0}. This reader
 * takes the DECLARED text, which for those files is therefore also the executed
 * value. It does not emulate the coercion — the coercion is a Repast batch-file
 * artefact, not model behaviour, and the fix is already in the archive.
 */
final class RunConfig {

	final String label;
	final String batchFile;
	final int seed;
	final Map<String, String> declared = new LinkedHashMap<String, String>();

	private RunConfig(String label, String batchFile, int seed) {
		this.label = label;
		this.batchFile = batchFile;
		this.seed = seed;
	}

	static RunConfig read(String label, String batchRelPath, int seed) throws Exception {
		RunConfig c = new RunConfig(label, batchRelPath, seed);
		File f = Certified.geographyFile(batchRelPath);
		if (!f.isFile()) {
			throw new IllegalStateException("batch params file not found: " + f.getAbsolutePath());
		}
		DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
		dbf.setNamespaceAware(false);
		DocumentBuilder db = dbf.newDocumentBuilder();
		NodeList params = db.parse(f).getElementsByTagName("parameter");
		for (int i = 0; i < params.getLength(); i++) {
			Element e = (Element) params.item(i);
			c.declared.put(e.getAttribute("name"), e.getAttribute("value"));
		}
		if (c.intOr("randomSeed", -1) != seed) {
			throw new IllegalStateException(batchRelPath + " declares randomSeed "
					+ c.intOr("randomSeed", -1) + ", expected " + seed);
		}
		return c;
	}

	int intOr(String name, int fallback) {
		String v = declared.get(name);
		return v == null || v.isEmpty() ? fallback : (int) Double.parseDouble(v);
	}

	double doubleOr(String name, double fallback) {
		String v = declared.get(name);
		return v == null || v.isEmpty() ? fallback : Double.parseDouble(v);
	}

	String describe(String... names) {
		StringBuilder sb = new StringBuilder();
		for (String n : names) {
			if (sb.length() > 0) {
				sb.append(' ');
			}
			sb.append(n).append('=').append(declared.containsKey(n) ? declared.get(n) : "<absent>");
		}
		return sb.toString();
	}
}
