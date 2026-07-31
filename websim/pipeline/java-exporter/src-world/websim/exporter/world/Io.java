package websim.exporter.world;

import java.io.BufferedWriter;
import java.io.Closeable;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.security.DigestOutputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * TASK F1 glue: byte-exact text sinks, IEEE-754 hex helpers and the dump
 * manifest. Contains no model logic whatsoever — every scientific value written
 * through here is produced by a certified {@code geography.*} class.
 *
 * <p><b>Byte-identity rules enforced here.</b>
 * <ul>
 *   <li>Line terminator is always {@code '\n'} — never {@code println}, whose
 *       {@code line.separator} is {@code \r\n} on this platform and would make
 *       the digests machine-dependent.</li>
 *   <li>Every floating value is written as the raw {@code %016x} of
 *       {@code Double.doubleToRawLongBits}. Decimal text for a double appears
 *       only in explicitly-labelled human-readable columns, never as the value
 *       a port is compared against.</li>
 *   <li>Nothing time-, path- or environment-dependent is written into a dump:
 *       no wall clock, no absolute paths, no iteration-ordered maps. The
 *       manifest is sorted by logical name before it is written.</li>
 * </ul>
 */
public final class Io {

	private Io() { }

	private static final int BUF = 1 << 20;

	/** Verbatim head lines kept in the committed manifest for debuggability. */
	public static final int HEAD_LINES = 6;

	// ------------------------------------------------------------------ hex

	/** Raw IEEE-754 bits of a double, lowercase, 16 hex digits. */
	public static String hexD(double v) {
		return String.format(Locale.ROOT, "%016x", Double.doubleToRawLongBits(v));
	}

	/** Two's-complement bits of a long, lowercase, 16 hex digits. */
	public static String hexL(long v) {
		return String.format(Locale.ROOT, "%016x", v);
	}

	public static String sha256Hex(byte[] digest) {
		StringBuilder sb = new StringBuilder(64);
		for (byte b : digest) {
			sb.append(String.format(Locale.ROOT, "%02x", b));
		}
		return sb.toString();
	}

	/** SHA-256 of a file's bytes (used only for the read-only input census). */
	public static String sha256File(File f) {
		try {
			MessageDigest md = MessageDigest.getInstance("SHA-256");
			byte[] buf = new byte[1 << 16];
			java.io.InputStream in = new java.io.FileInputStream(f);
			try {
				int n;
				while ((n = in.read(buf)) > 0) {
					md.update(buf, 0, n);
				}
			} finally {
				in.close();
			}
			return sha256Hex(md.digest());
		} catch (Exception e) {
			return "ERROR:" + e;
		}
	}

	/** JSON string escape (the manifest is hand-assembled, no JSON library). */
	public static String esc(String s) {
		if (s == null) {
			return "";
		}
		StringBuilder sb = new StringBuilder(s.length() + 8);
		for (int i = 0; i < s.length(); i++) {
			char c = s.charAt(i);
			switch (c) {
				case '\\': sb.append("\\\\"); break;
				case '"': sb.append("\\\""); break;
				case '\n': sb.append("\\n"); break;
				case '\r': sb.append("\\r"); break;
				case '\t': sb.append("\\t"); break;
				default:
					if (c < 0x20) {
						sb.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
					} else {
						sb.append(c);
					}
			}
		}
		return sb.toString();
	}

	// ----------------------------------------------------------------- sink

	/**
	 * A UTF-8, LF-terminated text file that digests itself as it is written and
	 * self-registers with a {@link Manifest} on close.
	 */
	public static final class Sink implements Closeable {

		private final Manifest manifest;
		private final String logicalName;
		private final File file;
		private final String displayPath;
		private final MessageDigest md;
		private final Writer w;
		private final List<String> head = new ArrayList<String>(HEAD_LINES);
		private long lines;
		private long bytes;
		private boolean closed;

		Sink(Manifest manifest, String logicalName, File file, String displayPath) throws IOException {
			this.manifest = manifest;
			this.logicalName = logicalName;
			this.file = file;
			this.displayPath = displayPath;
			File parent = file.getParentFile();
			if (parent != null && !parent.exists() && !parent.mkdirs()) {
				throw new IOException("cannot create " + parent);
			}
			try {
				this.md = MessageDigest.getInstance("SHA-256");
			} catch (Exception e) {
				throw new IOException(e);
			}
			OutputStream os = new DigestOutputStream(new FileOutputStream(file), md);
			this.w = new BufferedWriter(new OutputStreamWriter(os, StandardCharsets.UTF_8), BUF);
		}

		/** Writes one line plus a single '\n'. */
		public void line(String s) {
			try {
				w.write(s);
				w.write('\n');
			} catch (IOException e) {
				throw new RuntimeException("write failed for " + file, e);
			}
			if (head.size() < HEAD_LINES) {
				head.add(s);
			}
			lines++;
			bytes += s.length() + 1; // ASCII-only dumps; verified against file length at close
		}

		public long lines() {
			return lines;
		}

		@Override
		public void close() throws IOException {
			if (closed) {
				return;
			}
			closed = true;
			w.close();
			long onDisk = file.length();
			manifest.record(logicalName, file, displayPath, lines, onDisk, sha256Hex(md.digest()), head,
					onDisk == bytes ? null : "non-ASCII content (byte count " + onDisk
							+ " != char count " + bytes + ")");
		}
	}

	// ------------------------------------------------------------- manifest

	/** One dump file's provenance row. */
	public static final class Entry implements Comparable<Entry> {
		public final String name;
		public final String relPath;
		public final long lines;
		public final long bytes;
		public final String sha256;
		public final List<String> head;
		public final String note;

		Entry(String name, String relPath, long lines, long bytes, String sha256,
				List<String> head, String note) {
			this.name = name;
			this.relPath = relPath;
			this.lines = lines;
			this.bytes = bytes;
			this.sha256 = sha256;
			this.head = head;
			this.note = note;
		}

		@Override
		public int compareTo(Entry o) {
			return name.compareTo(o.name);
		}
	}

	/** Collects every dump written by a run, then emits one sorted JSON manifest. */
	public static final class Manifest {
		private final File rootDir;
		private final List<Entry> entries = new ArrayList<Entry>();
		private final List<String> checks = new ArrayList<String>();
		private final List<String> notes = new ArrayList<String>();
		private int failures;

		public Manifest(File rootDir) {
			this.rootDir = rootDir;
		}

		/** A dump under the (git-ignored) bulk output root. */
		public Sink sink(String logicalName, String relPath) throws IOException {
			return new Sink(this, logicalName, new File(rootDir, relPath), null);
		}

		/**
		 * A dump written somewhere else entirely (the committed fixture tree)
		 * but still carried by this manifest. {@code displayPath} is what lands
		 * in the JSON, so the manifest never contains a machine-specific
		 * absolute path.
		 */
		public Sink sinkAt(String logicalName, File file, String displayPath) throws IOException {
			return new Sink(this, logicalName, file, displayPath);
		}

		void record(String name, File file, String displayPath, long lines, long bytes, String sha256,
				List<String> head, String note) {
			String rel = displayPath != null ? displayPath
					: rootDir.toURI().relativize(file.toURI()).getPath();
			entries.add(new Entry(name, rel, lines, bytes, sha256, head, note));
		}

		/** Records a named self-check; a false result marks the whole run failed. */
		public boolean check(String id, boolean ok, String detail) {
			checks.add("{\"id\": \"" + esc(id) + "\", \"ok\": " + ok
					+ ", \"detail\": \"" + esc(detail) + "\"}");
			if (!ok) {
				failures++;
				System.out.println("[F1][FAIL] " + id + ": " + detail);
			} else {
				System.out.println("[F1][ok]   " + id + (detail.isEmpty() ? "" : " -- " + detail));
			}
			return ok;
		}

		public void note(String s) {
			notes.add(s);
		}

		public int failures() {
			return failures;
		}

		public List<Entry> entries() {
			return entries;
		}

		public void write(File out, String extraJson) throws IOException {
			Collections.sort(entries);
			File parent = out.getParentFile();
			if (parent != null && !parent.exists() && !parent.mkdirs()) {
				throw new IOException("cannot create " + parent);
			}
			StringBuilder j = new StringBuilder(1 << 20);
			j.append("{\n");
			j.append("  \"producedBy\": \"websim/pipeline/java-exporter (TASK F1 WorldFixtures)\",\n");
			j.append("  \"javaVersion\": \"").append(esc(System.getProperty("java.version"))).append("\",\n");
			j.append("  \"javaVendor\": \"").append(esc(System.getProperty("java.vendor"))).append("\",\n");
			j.append("  \"floatEncoding\": \"every floating value is %016x of Double.doubleToRawLongBits; "
					+ "line terminator is LF; files are UTF-8\",\n");
			j.append("  \"reproducibility\": \"no wall clock, no absolute paths, no unordered map "
					+ "iteration is written into any dump -- two runs must be byte-identical\",\n");
			if (extraJson != null && !extraJson.isEmpty()) {
				j.append(extraJson);
			}
			j.append("  \"selfChecks\": [\n");
			for (int i = 0; i < checks.size(); i++) {
				j.append("    ").append(checks.get(i));
				j.append(i == checks.size() - 1 ? "\n" : ",\n");
			}
			j.append("  ],\n");
			j.append("  \"selfCheckFailures\": ").append(failures).append(",\n");
			j.append("  \"notes\": [\n");
			for (int i = 0; i < notes.size(); i++) {
				j.append("    \"").append(esc(notes.get(i))).append('"');
				j.append(i == notes.size() - 1 ? "\n" : ",\n");
			}
			j.append("  ],\n");
			j.append("  \"dumpCount\": ").append(entries.size()).append(",\n");
			long totalBytes = 0;
			for (Entry e : entries) {
				totalBytes += e.bytes;
			}
			j.append("  \"dumpBytesTotal\": ").append(totalBytes).append(",\n");
			j.append("  \"dumps\": [\n");
			for (int i = 0; i < entries.size(); i++) {
				Entry e = entries.get(i);
				j.append("    {\"name\": \"").append(esc(e.name)).append("\", \"path\": \"")
						.append(esc(e.relPath)).append("\", \"lines\": ").append(e.lines)
						.append(", \"bytes\": ").append(e.bytes)
						.append(", \"sha256\": \"").append(e.sha256).append('"');
				if (e.note != null) {
					j.append(", \"note\": \"").append(esc(e.note)).append('"');
				}
				j.append(", \"head\": [");
				for (int k = 0; k < e.head.size(); k++) {
					if (k > 0) {
						j.append(", ");
					}
					j.append('"').append(esc(e.head.get(k))).append('"');
				}
				j.append("]}");
				j.append(i == entries.size() - 1 ? "\n" : ",\n");
			}
			j.append("  ]\n}\n");
			Writer w = new BufferedWriter(new OutputStreamWriter(
					new FileOutputStream(out), StandardCharsets.UTF_8), BUF);
			try {
				w.write(j.toString());
			} finally {
				w.close();
			}
		}
	}

	/**
	 * Deterministic stride sample of {@code k} indices out of {@code n}
	 * (endpoints always included). Used to cut committed oracle files down to a
	 * reviewable size without introducing any randomness.
	 */
	public static int[] stride(int n, int k) {
		if (n <= 0) {
			return new int[0];
		}
		if (n <= k) {
			int[] all = new int[n];
			for (int i = 0; i < n; i++) {
				all[i] = i;
			}
			return all;
		}
		int[] out = new int[k];
		for (int i = 0; i < k; i++) {
			out[i] = (int) ((long) i * (n - 1) / (k - 1));
		}
		return out;
	}
}
