package websim.exporter.closures;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A minimal, dependency-free JSON reader for the five ARCHIVED connectivity
 * reports under {@code docs/runs/scenario-e-closures/}.
 *
 * <p>This is pure I/O. It parses read-only files that
 * {@code scripts/build_closures_E.py} wrote with {@code json.dump}; it computes
 * nothing and it is never used to produce a value that is compared against the
 * certified Java. It exists only so the regenerated report can be diffed
 * <i>field for field</i> against the archived one without adding a jar to the
 * exporter classpath.
 *
 * <p>Numbers are kept BOTH as a {@code Double} and as their original literal
 * text, because the comparison must be able to say "the archive says 614.1 and
 * we say 614.1" without a float-formatting round trip inventing a difference.
 */
final class Json {

	private Json() { }

	/** A JSON number: the literal as written, plus its double value. */
	static final class Num {
		final String literal;
		final double value;

		Num(String literal, double value) {
			this.literal = literal;
			this.value = value;
		}

		boolean isIntegral() {
			return literal.indexOf('.') < 0 && literal.indexOf('e') < 0 && literal.indexOf('E') < 0;
		}

		long asLong() {
			return (long) value;
		}

		@Override
		public String toString() {
			return literal;
		}
	}

	static Object readFile(File f) throws Exception {
		byte[] buf;
		InputStream in = new FileInputStream(f);
		try {
			buf = in.readAllBytes();
		} finally {
			in.close();
		}
		String s = new String(buf, StandardCharsets.UTF_8);
		if (!s.isEmpty() && s.charAt(0) == '﻿') {
			s = s.substring(1);
		}
		Parser p = new Parser(s);
		Object v = p.value();
		p.ws();
		if (p.i != s.length()) {
			throw new IllegalStateException("trailing content in " + f + " at " + p.i);
		}
		return v;
	}

	@SuppressWarnings("unchecked")
	static Map<String, Object> obj(Object o) {
		return (Map<String, Object>) o;
	}

	@SuppressWarnings("unchecked")
	static List<Object> arr(Object o) {
		return (List<Object>) o;
	}

	static long asLong(Object o) {
		return ((Num) o).asLong();
	}

	static double asDouble(Object o) {
		return ((Num) o).value;
	}

	private static final class Parser {
		private final String s;
		private int i;

		Parser(String s) {
			this.s = s;
		}

		void ws() {
			while (i < s.length()) {
				char c = s.charAt(i);
				if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
					i++;
				} else {
					break;
				}
			}
		}

		Object value() {
			ws();
			if (i >= s.length()) {
				throw new IllegalStateException("unexpected end of JSON");
			}
			char c = s.charAt(i);
			switch (c) {
				case '{': return object();
				case '[': return array();
				case '"': return string();
				case 't': expect("true"); return Boolean.TRUE;
				case 'f': expect("false"); return Boolean.FALSE;
				case 'n': expect("null"); return null;
				default: return number();
			}
		}

		private void expect(String lit) {
			if (!s.startsWith(lit, i)) {
				throw new IllegalStateException("expected " + lit + " at " + i);
			}
			i += lit.length();
		}

		private Map<String, Object> object() {
			Map<String, Object> m = new LinkedHashMap<String, Object>();
			i++; // '{'
			ws();
			if (i < s.length() && s.charAt(i) == '}') {
				i++;
				return m;
			}
			while (true) {
				ws();
				String k = string();
				ws();
				if (s.charAt(i) != ':') {
					throw new IllegalStateException("expected ':' at " + i);
				}
				i++;
				m.put(k, value());
				ws();
				char c = s.charAt(i);
				i++;
				if (c == '}') {
					return m;
				}
				if (c != ',') {
					throw new IllegalStateException("expected ',' or '}' at " + (i - 1));
				}
			}
		}

		private List<Object> array() {
			List<Object> l = new ArrayList<Object>();
			i++; // '['
			ws();
			if (i < s.length() && s.charAt(i) == ']') {
				i++;
				return l;
			}
			while (true) {
				l.add(value());
				ws();
				char c = s.charAt(i);
				i++;
				if (c == ']') {
					return l;
				}
				if (c != ',') {
					throw new IllegalStateException("expected ',' or ']' at " + (i - 1));
				}
			}
		}

		private String string() {
			if (s.charAt(i) != '"') {
				throw new IllegalStateException("expected '\"' at " + i);
			}
			i++;
			StringBuilder sb = new StringBuilder();
			while (true) {
				char c = s.charAt(i++);
				if (c == '"') {
					return sb.toString();
				}
				if (c != '\\') {
					sb.append(c);
					continue;
				}
				char e = s.charAt(i++);
				switch (e) {
					case '"': sb.append('"'); break;
					case '\\': sb.append('\\'); break;
					case '/': sb.append('/'); break;
					case 'b': sb.append('\b'); break;
					case 'f': sb.append('\f'); break;
					case 'n': sb.append('\n'); break;
					case 'r': sb.append('\r'); break;
					case 't': sb.append('\t'); break;
					case 'u':
						sb.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
						i += 4;
						break;
					default: throw new IllegalStateException("bad escape \\" + e + " at " + (i - 1));
				}
			}
		}

		private Num number() {
			int start = i;
			if (i < s.length() && (s.charAt(i) == '-' || s.charAt(i) == '+')) {
				i++;
			}
			while (i < s.length()) {
				char c = s.charAt(i);
				if ((c >= '0' && c <= '9') || c == '.' || c == 'e' || c == 'E' || c == '-' || c == '+') {
					i++;
				} else {
					break;
				}
			}
			String lit = s.substring(start, i);
			if (lit.isEmpty()) {
				throw new IllegalStateException("expected a number at " + start);
			}
			return new Num(lit, Double.parseDouble(lit));
		}
	}
}
