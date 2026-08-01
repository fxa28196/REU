package websim.exporter.decision;

import java.io.BufferedWriter;
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
 * Byte-exact LF/UTF-8 text sinks plus the SHA-256 manifest for the WP8 decision
 * dumps. Same contract as {@code websim.exporter.world.Io} (LF only, never
 * {@code println}; nothing time-, path- or hash-order-dependent in a dump), kept
 * separate so this source set compiles with no dependency on the WP5/WP6
 * exporter and can therefore be built <i>before</i> the Geography sources are.
 * No model logic lives here.
 */
public final class Dump {

	private Dump() { }

	private static final int BUF = 1 << 20;

	public static final class Sink {
		private final Manifest manifest;
		private final String name;
		private final File file;
		private final MessageDigest md;
		private final Writer w;
		private final List<String> head = new ArrayList<String>(4);
		private long lines;
		private boolean closed;

		Sink(Manifest manifest, String name, File file) throws IOException {
			this.manifest = manifest;
			this.name = name;
			this.file = file;
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

		public void line(String s) {
			try {
				w.write(s);
				w.write('\n');
			} catch (IOException e) {
				throw new RuntimeException("write failed for " + file, e);
			}
			if (head.size() < 4) {
				head.add(s);
			}
			lines++;
		}

		public long lines() {
			return lines;
		}

		public void close() throws IOException {
			if (closed) {
				return;
			}
			closed = true;
			w.close();
			manifest.record(name, file, lines, file.length(), hex(md.digest()), head);
		}
	}

	public static final class Entry implements Comparable<Entry> {
		public final String name;
		public final String path;
		public final long lines;
		public final long bytes;
		public final String sha256;
		public final List<String> head;

		Entry(String name, String path, long lines, long bytes, String sha256, List<String> head) {
			this.name = name;
			this.path = path;
			this.lines = lines;
			this.bytes = bytes;
			this.sha256 = sha256;
			this.head = head;
		}

		public int compareTo(Entry o) {
			return name.compareTo(o.name);
		}
	}

	public static final class Manifest {
		private final File root;
		private final List<Entry> entries = new ArrayList<Entry>();
		private final List<String> checks = new ArrayList<String>();
		private int failures;

		public Manifest(File root) {
			this.root = root;
		}

		public Sink sink(String name, String relPath) throws IOException {
			return new Sink(this, name, new File(root, relPath));
		}

		void record(String name, File file, long lines, long bytes, String sha, List<String> head) {
			String rel = root.toURI().relativize(file.toURI()).getPath();
			entries.add(new Entry(name, rel, lines, bytes, sha, head));
		}

		public boolean check(String id, boolean ok, String detail) {
			checks.add("{\"id\": \"" + esc(id) + "\", \"ok\": " + ok + ", \"detail\": \""
					+ esc(detail) + "\"}");
			if (!ok) {
				failures++;
				System.out.println("[WP8][FAIL] " + id + ": " + detail);
			} else {
				System.out.println("[WP8][ok]   " + id + (detail.isEmpty() ? "" : " -- " + detail));
			}
			return ok;
		}

		public int failures() {
			return failures;
		}

		public List<Entry> entries() {
			return entries;
		}

		public long totalBytes() {
			long t = 0;
			for (Entry e : entries) {
				t += e.bytes;
			}
			return t;
		}

		public void write(File out, String extraJson) throws IOException {
			Collections.sort(entries);
			StringBuilder j = new StringBuilder(1 << 16);
			j.append("{\n");
			j.append("  \"producedBy\": \"websim/pipeline/java-exporter src-decision "
					+ "(WP8 DecisionTrace)\",\n");
			j.append("  \"javaVersion\": \"").append(esc(System.getProperty("java.version")))
					.append("\",\n");
			j.append("  \"javaVendor\": \"").append(esc(System.getProperty("java.vendor")))
					.append("\",\n");
			j.append("  \"floatEncoding\": \"every floating value is the %016x of "
					+ "Double.doubleToRawLongBits; line terminator is LF; files are UTF-8\",\n");
			if (extraJson != null && !extraJson.isEmpty()) {
				j.append(extraJson);
			}
			j.append("  \"selfChecks\": [\n");
			for (int i = 0; i < checks.size(); i++) {
				j.append("    ").append(checks.get(i)).append(i == checks.size() - 1 ? "\n" : ",\n");
			}
			j.append("  ],\n");
			j.append("  \"selfCheckFailures\": ").append(failures).append(",\n");
			j.append("  \"dumpCount\": ").append(entries.size()).append(",\n");
			j.append("  \"dumpBytesTotal\": ").append(totalBytes()).append(",\n");
			j.append("  \"dumps\": [\n");
			for (int i = 0; i < entries.size(); i++) {
				Entry e = entries.get(i);
				j.append("    {\"name\": \"").append(esc(e.name)).append("\", \"path\": \"")
						.append(esc(e.path)).append("\", \"lines\": ").append(e.lines)
						.append(", \"bytes\": ").append(e.bytes)
						.append(", \"sha256\": \"").append(e.sha256).append("\", \"head\": [");
				for (int k = 0; k < e.head.size(); k++) {
					if (k > 0) {
						j.append(", ");
					}
					j.append('"').append(esc(e.head.get(k))).append('"');
				}
				j.append("]}").append(i == entries.size() - 1 ? "\n" : ",\n");
			}
			j.append("  ]\n}\n");
			File parent = out.getParentFile();
			if (parent != null && !parent.exists() && !parent.mkdirs()) {
				throw new IOException("cannot create " + parent);
			}
			Writer w = new BufferedWriter(new OutputStreamWriter(new FileOutputStream(out),
					StandardCharsets.UTF_8), BUF);
			try {
				w.write(j.toString());
			} finally {
				w.close();
			}
		}
	}

	public static String hex(byte[] digest) {
		StringBuilder sb = new StringBuilder(digest.length * 2);
		for (byte b : digest) {
			sb.append(String.format(Locale.ROOT, "%02x", b));
		}
		return sb.toString();
	}

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
}
