package websim.exporter;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Random;

import net.sf.geographiclib.Geodesic;
import net.sf.geographiclib.GeodesicData;

/**
 * SPIKE WP2-S1 (plan Q12) — geodesic {@code Direct} parity fixture dumper.
 *
 * <p>READ-ONLY with respect to the certified model: this class imports nothing from
 * {@code geography.*}. It links only against {@code net.sf.geographiclib}, the exact
 * library the certified model uses — GeographicLib-Java 1.49, shipped inside
 * {@code RepastSimphony-2.11.0/eclipse/plugins/repast.simphony.gis_2.11.0/lib/
 * GeographicLib-Java-1.49.jar}, which the Geography Gradle build puts on the compile
 * classpath via the {@code repast.simphony.*&#47;**&#47;*.jar} fileTree.
 *
 * <p>The production call site is {@code GisAgent.java:536-537}:
 * <pre>
 *   GeodesicData toNext = Geodesic.WGS84.Inverse(current.y, current.x, next.y, next.x);
 *   GeodesicData moved  = Geodesic.WGS84.Direct(current.y, current.x, toNext.azi1, remainingM);
 * </pre>
 * i.e. Direct is only ever called with an azimuth that is itself the {@code azi1} output
 * of an Inverse solve, and a step length {@code remainingM} bounded by the distance to
 * the next polyline vertex. Two fixture sets are therefore emitted:
 *
 * <ul>
 *   <li><b>uniform</b> — the spike specification: azi1 drawn uniformly from [-180, 180).
 *       Broad, adversarial coverage of the Direct solver.</li>
 *   <li><b>prodshape</b> — azi1 obtained exactly as production obtains it, from an
 *       Inverse solve to a nearby random bearing/range point. Answers the narrower
 *       question that actually governs agent movement fidelity.</li>
 * </ul>
 *
 * <p>Sampling is deterministic: {@link java.util.Random} is a specified LCG, so the
 * fixture bytes are reproducible on any conforming JVM from the seeds below.
 *
 * <p>All doubles are emitted as raw IEEE-754 bit patterns
 * ({@link Double#doubleToRawLongBits}) in 16 lowercase hex digits, so the fixture
 * round-trips through text with zero decimal-formatting loss.
 *
 * <p>Usage: {@code java -cp <out>;<GeographicLib jar> websim.exporter.GeodesicDirectFixtureDumper <outDir> [n]}
 */
public final class GeodesicDirectFixtureDumper {

	/** Portland bbox from the spike brief (also the model's street-layer extent). */
	private static final double LAT_MIN = 45.2;
	private static final double LAT_MAX = 45.8;
	private static final double LON_MIN = -123.0;
	private static final double LON_MAX = -122.3;

	/** Step-length range: the residual {@code remainingM} handed to Direct. */
	private static final double S12_MIN_M = 1.0;
	private static final double S12_MAX_M = 500.0;

	private static final long SEED_UNIFORM = 20260730L;
	private static final long SEED_PRODSHAPE = 20260731L;

	private static final int DEFAULT_N = 10000;

	private GeodesicDirectFixtureDumper() {
	}

	public static void main(String[] args) throws IOException {
		if (args.length < 1) {
			System.err.println("usage: GeodesicDirectFixtureDumper <outDir> [n]");
			System.exit(2);
		}
		Path outDir = Paths.get(args[0]).toAbsolutePath().normalize();
		int n = (args.length >= 2) ? Integer.parseInt(args[1]) : DEFAULT_N;
		Files.createDirectories(outDir);

		int nUniform = dump(outDir.resolve("geodesic-direct-uniform.tsv"), n, SEED_UNIFORM, false);
		int nProd = dump(outDir.resolve("geodesic-direct-prodshape.tsv"), n, SEED_PRODSHAPE, true);

		System.out.println("wrote " + nUniform + " uniform + " + nProd + " prodshape tuples to " + outDir);
	}

	private static int dump(Path file, int n, long seed, boolean prodShape) throws IOException {
		Random rnd = new Random(seed);
		int written = 0;
		try (BufferedWriter w = new BufferedWriter(new OutputStreamWriter(
				Files.newOutputStream(file), StandardCharsets.UTF_8))) {

			w.write("# websim SPIKE WP2-S1 geodesic Direct fixture\n");
			w.write("# library=GeographicLib-Java version=1.49 "
					+ "jar=repast.simphony.gis_2.11.0/lib/GeographicLib-Java-1.49.jar\n");
			w.write("# jvm=" + System.getProperty("java.vm.name") + " "
					+ System.getProperty("java.version") + " vendor="
					+ System.getProperty("java.vendor") + "\n");
			w.write("# ellipsoid=Geodesic.WGS84 a=" + Geodesic.WGS84.MajorRadius()
					+ " f=" + Geodesic.WGS84.Flattening() + "\n");
			w.write("# mode=" + (prodShape ? "prodshape" : "uniform")
					+ " seed=" + seed + " n=" + n + "\n");
			w.write("# bbox lat=[" + LAT_MIN + "," + LAT_MAX + "] lon=[" + LON_MIN + "," + LON_MAX
					+ "] s12_m=[" + S12_MIN_M + "," + S12_MAX_M + "]\n");
			w.write("# fields are raw IEEE-754 bit patterns, Double.doubleToRawLongBits, 16 lowercase hex digits\n");
			w.write("lat1\tlon1\tazi1\ts12\tlat2\tlon2\tazi2\n");

			for (int i = 0; i < n; i++) {
				double lat1 = LAT_MIN + rnd.nextDouble() * (LAT_MAX - LAT_MIN);
				double lon1 = LON_MIN + rnd.nextDouble() * (LON_MAX - LON_MIN);
				double s12 = S12_MIN_M + rnd.nextDouble() * (S12_MAX_M - S12_MIN_M);

				double azi1;
				if (prodShape) {
					// Reproduce GisAgent.java:536 — the azimuth is the azi1 output of an
					// Inverse solve to the next polyline vertex. Vertex offsets on the
					// real street layer are tens of metres; sample 5-400 m away.
					double offsetM = 5.0 + rnd.nextDouble() * 395.0;
					double offsetAzi = -180.0 + rnd.nextDouble() * 360.0;
					GeodesicData vertex = Geodesic.WGS84.Direct(lat1, lon1, offsetAzi, offsetM);
					GeodesicData toNext = Geodesic.WGS84.Inverse(lat1, lon1, vertex.lat2, vertex.lon2);
					azi1 = toNext.azi1;
				} else {
					azi1 = -180.0 + rnd.nextDouble() * 360.0;
				}

				GeodesicData moved = Geodesic.WGS84.Direct(lat1, lon1, azi1, s12);

				w.write(hex(lat1));
				w.write('\t');
				w.write(hex(lon1));
				w.write('\t');
				w.write(hex(azi1));
				w.write('\t');
				w.write(hex(s12));
				w.write('\t');
				w.write(hex(moved.lat2));
				w.write('\t');
				w.write(hex(moved.lon2));
				w.write('\t');
				w.write(hex(moved.azi2));
				w.write('\n');
				written++;
			}
		}
		return written;
	}

	private static String hex(double d) {
		return String.format("%016x", Double.doubleToRawLongBits(d));
	}
}
