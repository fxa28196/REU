package geography.data;

import java.io.BufferedReader;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Minimal CSV reader for the project's committed data files (shelters,
 * encampments, AQS PM2.5). Handles a quoted or unquoted header row and
 * double-quoted fields containing commas; it is deliberately small rather than
 * a general RFC-4180 parser because every input file it reads is produced by
 * this project's own fetch scripts and has a known, simple shape.
 *
 * <p>Files are read as UTF-8 explicitly (not the platform default charset):
 * PowerShell's {@code Export-Csv -Encoding utf8} prepends a UTF-8 byte-order
 * mark, and only a UTF-8 decode turns it into a single {@code U+FEFF} that the
 * header cleanup below can strip. Reading it as windows-1252 would split the
 * BOM into three stray characters and corrupt the first column name.
 *
 * <p>Each row is returned as a column-name to value map so callers reference
 * fields by header name (provenance-friendly: a column reorder does not
 * silently break a positional read).
 */
public final class CsvLoader {

	private CsvLoader() {}

	/** Reads the file into a list of header to value maps (empty fields kept as ""). */
	public static List<Map<String, String>> read(String path) {
		List<Map<String, String>> rows = new ArrayList<Map<String, String>>();
		try (BufferedReader br = new BufferedReader(
				new InputStreamReader(new FileInputStream(path), StandardCharsets.UTF_8))) {
			String headerLine = br.readLine();
			if (headerLine == null) {
				return rows;
			}
			// Strip a UTF-8 BOM if present, otherwise the first column's header
			// name is corrupted and every lookup on it returns null.
			if (!headerLine.isEmpty() && headerLine.charAt(0) == '﻿') {
				headerLine = headerLine.substring(1);
			}
			String[] headers = splitCsv(headerLine);
			String line;
			while ((line = br.readLine()) != null) {
				if (line.trim().isEmpty()) {
					continue;
				}
				String[] fields = splitCsv(line);
				Map<String, String> row = new LinkedHashMap<String, String>();
				for (int i = 0; i < headers.length; i++) {
					row.put(headers[i], i < fields.length ? fields[i] : "");
				}
				rows.add(row);
			}
		} catch (IOException e) {
			throw new RuntimeException("Failed to read CSV: " + path, e);
		}
		return rows;
	}

	/**
	 * Strict variant of {@link #read(String)} for governance files, where a
	 * silently mis-parsed row is worse than a failed run.
	 *
	 * <p>{@code read} pads short rows with {@code ""} and discards fields beyond
	 * the header count, which is tolerant of the fetch-script outputs it was
	 * written for. In a registry full of prose, one unquoted comma would shift
	 * every later column and drop the last one entirely, with no error — so this
	 * variant rejects any row whose field count differs from the header, and
	 * rejects duplicate header names (which would otherwise overwrite silently).
	 *
	 * <p>Deliberately a separate method: {@code read} feeds the encampment
	 * sampling that defines the baseline agent population, so its behaviour is
	 * left untouched.
	 */
	public static List<Map<String, String>> readStrict(String path) {
		List<Map<String, String>> rows = new ArrayList<Map<String, String>>();
		try (BufferedReader br = new BufferedReader(
				new InputStreamReader(new FileInputStream(path), StandardCharsets.UTF_8))) {
			String headerLine = br.readLine();
			if (headerLine == null) {
				throw new IllegalStateException(path + ": file is empty");
			}
			if (!headerLine.isEmpty() && headerLine.charAt(0) == '﻿') {
				headerLine = headerLine.substring(1);
			}
			String[] headers = splitCsv(headerLine);
			for (int i = 0; i < headers.length; i++) {
				for (int j = i + 1; j < headers.length; j++) {
					if (headers[i].equals(headers[j])) {
						throw new IllegalStateException(
								path + ": duplicate column name '" + headers[i] + "'");
					}
				}
			}
			String line;
			int lineNo = 1;
			while ((line = br.readLine()) != null) {
				lineNo++;
				if (line.trim().isEmpty()) {
					continue;
				}
				String[] fields = splitCsv(line);
				if (fields.length != headers.length) {
					throw new IllegalStateException(path + ": line " + lineNo + " has "
							+ fields.length + " fields but the header declares " + headers.length
							+ " (an unquoted comma in a prose field is the usual cause)");
				}
				Map<String, String> row = new LinkedHashMap<String, String>();
				for (int i = 0; i < headers.length; i++) {
					row.put(headers[i], fields[i]);
				}
				rows.add(row);
			}
		} catch (IOException e) {
			throw new RuntimeException("Failed to read CSV: " + path, e);
		}
		return rows;
	}

	/** Splits one CSV line, honouring double-quoted fields and "" escapes. */
	private static String[] splitCsv(String line) {
		List<String> out = new ArrayList<String>();
		StringBuilder sb = new StringBuilder();
		boolean inQuotes = false;
		for (int i = 0; i < line.length(); i++) {
			char c = line.charAt(i);
			if (inQuotes) {
				if (c == '"') {
					if (i + 1 < line.length() && line.charAt(i + 1) == '"') {
						sb.append('"');
						i++;
					} else {
						inQuotes = false;
					}
				} else {
					sb.append(c);
				}
			} else {
				if (c == '"') {
					inQuotes = true;
				} else if (c == ',') {
					out.add(sb.toString().trim());
					sb.setLength(0);
				} else {
					sb.append(c);
				}
			}
		}
		out.add(sb.toString().trim());
		return out.toArray(new String[0]);
	}
}
