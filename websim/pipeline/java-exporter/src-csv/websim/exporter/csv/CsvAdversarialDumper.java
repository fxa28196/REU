package websim.exporter.csv;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import geography.data.CsvLoader;

/**
 * TASK WP5 — adversarial byte fixtures for the {@code CsvLoader} port
 * (PORT_MAP §4.2).
 *
 * <p>Every case below is written to a temporary file as an explicit byte array,
 * parsed by the <b>certified</b> {@link CsvLoader} (both {@code read} and
 * {@code readStrict}), and dumped as hex so the TypeScript port is compared
 * against what Java actually did rather than against what the spec says Java
 * does. This class re-implements nothing: it only chooses inputs and encodes
 * outputs.
 *
 * <p>{@code CsvLoader} depends on nothing but {@code java.io}/{@code java.util},
 * so this dumper compiles against a single certified source file and needs
 * neither Repast nor GeoTools on the classpath.
 *
 * <p><b>Dump shape</b> (UTF-8, LF terminators, one record per line):
 * <pre>
 * CASE  &lt;name&gt;  &lt;mode&gt;  &lt;input_hex&gt;
 * ROWS  &lt;n&gt;                       (or)   THROW  &lt;message_hex&gt;
 * ROW   &lt;i&gt;  &lt;fieldCount&gt;  &lt;keyHex&gt;:&lt;valHex&gt;  …
 * END
 * </pre>
 * Keys and values are hex of their UTF-8 bytes, so an empty string is an empty
 * hex token and no separator can collide with content. Throw messages have the
 * temp-file path stripped to the leading {@code $} marker so the dump is
 * machine-independent.
 */
public final class CsvAdversarialDumper {

	private CsvAdversarialDumper() { }

	private static final String BOM = "﻿";

	/** One adversarial input: a stable name and its exact bytes. */
	private static final class Case {
		final String name;
		final byte[] bytes;
		final String why;

		Case(String name, byte[] bytes, String why) {
			this.name = name;
			this.bytes = bytes;
			this.why = why;
		}

		static Case of(String name, String text, String why) {
			return new Case(name, text.getBytes(StandardCharsets.UTF_8), why);
		}
	}

	private static List<Case> cases() {
		List<Case> cs = new ArrayList<Case>();

		cs.add(Case.of("plain-lf", "a,b,c\n1,2,3\n4,5,6\n", "baseline"));
		cs.add(Case.of("plain-crlf", "a,b,c\r\n1,2,3\r\n", "CRLF is one terminator, not two"));
		cs.add(Case.of("plain-cr", "a,b,c\r1,2,3\r", "bare CR is a readLine terminator too"));
		cs.add(Case.of("no-final-terminator", "a,b\n1,2", "a final unterminated line is still a line"));
		cs.add(Case.of("trailing-terminator", "a,b\n1,2\n",
				"a trailing terminator produces NO extra empty line"));

		cs.add(Case.of("bom-header", BOM + "a,b\n1,2\n", "leading U+FEFF is stripped from the header"));
		cs.add(Case.of("bom-midfile", "a,b\n" + BOM + "1,2\n",
				"a BOM on a DATA line is data: it is not stripped, and U+FEFF > U+0020 so trim keeps it"));
		cs.add(Case.of("bom-only-line", "a,b\n" + BOM + "\n1,2\n",
				"a line holding only U+FEFF is NOT blank to Java trim() -- JS String.trim() would skip it"));

		cs.add(Case.of("blank-lines", "a,b\n\n   \n\t\n1,2\n", "blank = trim().isEmpty(), skipped"));
		cs.add(Case.of("quoted-comma", "a,b\n\"x,y\",z\n", "quoted comma is not a separator"));
		cs.add(Case.of("escaped-quote", "a,b\n\"he said \"\"hi\"\"\",z\n", "\"\" is one literal quote"));
		cs.add(Case.of("quote-opens-midfield", "a,b\nab\"c,d\"e,z\n",
				"a quote may open mid-field; the state machine has no 'quoted fields start at the field' rule"));
		cs.add(Case.of("unterminated-quote", "a,b\n\"never closed,z\n",
				"an unterminated quote emits the text accumulated so far -- no throw"));
		cs.add(Case.of("empty-quotes", "a,b\n\"\",\"\"\n", "\"\" is the empty field"));

		cs.add(Case.of("trim-quoted", "a,b\n\"  x  \",\"  y\"\n", "EVERY field is trimmed, quoted content included"));
		cs.add(Case.of("trim-unquoted", "a,b\n   x   ,   y\n", "unquoted fields trimmed too"));
		cs.add(new Case("trim-nbsp",
				("a,b\n x ,y\n").getBytes(StandardCharsets.UTF_8),
				"Java trim() strips <= U+0020 ONLY: U+00A0 survives, JS String.prototype.trim() would eat it"));
		cs.add(new Case("trim-control",
				new byte[] { 'a', ',', 'b', '\n', 0x01, 'x', 0x1f, ',', 'y', '\n' },
				"trim() strips ANY code unit <= U+0020, including U+0001 and U+001F"));
		cs.add(new Case("trim-nul",
				new byte[] { 'a', ',', 'b', '\n', 0x00, 'x', 0x00, ',', 'y', '\n' },
				"NUL is <= U+0020 and is trimmed like whitespace"));

		cs.add(Case.of("short-row", "a,b,c\n1,2\n", "short rows are padded with \"\""));
		cs.add(Case.of("extra-fields", "a,b\n1,2,3,4\n", "fields beyond the header are silently dropped"));
		cs.add(Case.of("trailing-comma", "a,b\n1,\n", "a trailing comma produces a final empty field"));
		cs.add(Case.of("all-commas", "a,b,c\n,,\n", "three empty fields"));
		cs.add(Case.of("single-field", "a\nx\n", "no comma at all"));

		cs.add(Case.of("dup-headers", "a,b,a\n1,2,3\n",
				"read: LinkedHashMap keeps the FIRST position and the LAST value; readStrict throws"));
		cs.add(Case.of("dup-headers-blank", "a,,\n1,2,3\n",
				"two empty header names are duplicates too"));

		cs.add(Case.of("empty-file", "", "read returns []; readStrict throws 'file is empty'"));
		cs.add(Case.of("header-only", "a,b\n", "zero rows, no error"));
		cs.add(Case.of("strict-field-count", "a,b\n1,2\n1,2,3\n", "readStrict rejects a wrong field count"));
		cs.add(Case.of("strict-lineno-after-blank", "a,b\n\n1,2,3\n",
				"lineNo increments BEFORE the blank-line skip, so the blank still advances it"));

		cs.add(Case.of("utf8-nonascii", "id,name\n1,René Åström\n", "multi-byte UTF-8 round-trip"));
		cs.add(Case.of("utf8-astral", "id,name\n1,café 🔥\n", "surrogate pair round-trip"));
		cs.add(Case.of("header-quoted", "\"a\",\" b \",c\n1,2,3\n", "quoted header names are trimmed too"));
		cs.add(Case.of("crlf-inside-quotes-impossible", "a,b\n\"x\r\ny\",z\n",
				"there are NO multi-line quoted fields: the reader works line by line, so this is two lines"));

		return cs;
	}

	public static void main(String[] args) throws Exception {
		if (args.length < 1) {
			throw new IllegalArgumentException("usage: CsvAdversarialDumper <out.tsv>");
		}
		File out = new File(args[0]);
		File parent = out.getParentFile();
		if (parent != null && !parent.exists() && !parent.mkdirs()) {
			throw new IOException("cannot create " + parent);
		}
		File tmp = File.createTempFile("websim-csv-adv-", ".csv");
		tmp.deleteOnExit();

		StringBuilder sb = new StringBuilder(1 << 16);
		sb.append("# CsvLoader adversarial byte fixtures -- geography.data.CsvLoader, JDK ")
				.append(System.getProperty("java.version")).append('\n');
		sb.append("# Produced by websim/pipeline/java-exporter/src-csv (WP5). Every outcome below is\n");
		sb.append("# what the CERTIFIED loader did with these exact bytes, not what the spec says.\n");
		sb.append("# CASE\\tname\\tmode\\tinput_hex   then ROWS\\tn | THROW\\tmessage_hex, ROW lines, END.\n");
		sb.append("# Hex is of UTF-8 bytes; an empty string is an empty token.\n");

		int cases = 0;
		int rowsTotal = 0;
		int throwsTotal = 0;
		for (Case c : cases()) {
			sb.append("# why ").append(c.name).append(": ").append(c.why).append('\n');
			OutputStream os = new FileOutputStream(tmp);
			try {
				os.write(c.bytes);
			} finally {
				os.close();
			}
			for (int m = 0; m < 2; m++) {
				boolean strict = m == 1;
				String mode = strict ? "readStrict" : "read";
				sb.append("CASE\t").append(c.name).append('\t').append(mode).append('\t')
						.append(hex(c.bytes)).append('\n');
				try {
					List<Map<String, String>> rows =
							strict ? CsvLoader.readStrict(tmp.getPath()) : CsvLoader.read(tmp.getPath());
					sb.append("ROWS\t").append(rows.size()).append('\n');
					for (int i = 0; i < rows.size(); i++) {
						Map<String, String> row = rows.get(i);
						sb.append("ROW\t").append(i).append('\t').append(row.size());
						for (Map.Entry<String, String> e : row.entrySet()) {
							sb.append('\t').append(hex(e.getKey().getBytes(StandardCharsets.UTF_8)))
									.append(':').append(hex(e.getValue().getBytes(StandardCharsets.UTF_8)));
						}
						sb.append('\n');
						rowsTotal++;
					}
				} catch (RuntimeException e) {
					String msg = String.valueOf(e.getMessage());
					int cut = msg.indexOf(tmp.getPath());
					if (cut >= 0) {
						msg = msg.substring(0, cut) + "$FILE$" + msg.substring(cut + tmp.getPath().length());
					}
					sb.append("THROW\t").append(e.getClass().getName()).append('\t')
							.append(hex(msg.getBytes(StandardCharsets.UTF_8))).append('\n');
					throwsTotal++;
				}
				sb.append("END\n");
				cases++;
			}
		}
		sb.append("# summary cases=").append(cases).append(" rows=").append(rowsTotal)
				.append(" throws=").append(throwsTotal).append('\n');

		OutputStream os = new FileOutputStream(out);
		try {
			os.write(sb.toString().getBytes(StandardCharsets.UTF_8));
		} finally {
			os.close();
		}
		System.out.println("[WP5] wrote " + out.getPath() + ": " + cases + " parse invocations, "
				+ rowsTotal + " rows, " + throwsTotal + " throws");
	}

	private static String hex(byte[] b) {
		StringBuilder sb = new StringBuilder(b.length * 2);
		for (byte x : b) {
			sb.append(String.format(Locale.ROOT, "%02x", Byte.valueOf(x)));
		}
		return sb.toString();
	}
}
